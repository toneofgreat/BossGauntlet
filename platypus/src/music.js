// music.js - the adaptive score (STORY2.md "Music", LEVELS2.md B1).
//
// createMusic(audio) -> music. Created once by the engine as ctx.music; the engine calls music.update(realDt) every
// frame while a level runs and music.stop(0.6) when a level is left. It never starts by itself.
//
// How it is built
//   * COMPOSITION is data: every state is one or two 16-bar forms (A A' B A'') written as a chord progression plus
//     tracks (melody lines in scale degrees, chord-relative bass / arpeggio patterns, voice-led pads, drum grids with
//     a fill every 4th bar). Forms are compiled once into per-16th event buckets.
//   * A DECK plays one state: its own clock (t0 on the AudioContext clock), one small channel strip per track
//     (gain -> optional filter -> pan -> deck bus, with reverb / room / delay / chorus sends) and a side-chain gain
//     that the kick pumps. Intensity fades the track gains (layers), it never switches anything hard.
//   * The SCHEDULER runs from update(): it schedules every 16th that starts within one beat (look-ahead >= 250 ms)
//     on the audio clock. No timers. When update() stops being called nothing new is scheduled.
//   * play() to another state waits for the bar line, plays a one-bar transition (riser + roll into the driving
//     states, a ringing chord into the calm ones) and crossfades equal-power; the new deck's bar 1 is on the grid.
//   * Mix: decks + stingers -> gentle bus compressor -> make-up trim -> soft clip that cannot exceed -9 dBFS -> volume -> duck ->
//     audio.musicBus().input. Reverb sends go through the same volume / duck pair.
//   * Voices: the budget is 28 sources. Every instrument is built to cost ONE oscillator per note where it can: struck
//     and plucked tones are a PeriodicWave (the instrument's spectrum) through a low-pass that closes as the note
//     decays, pads are single saws widened by the shared chorus, and tails are stopped at -40 dB. Every oscillator /
//     buffer source is registered with its start and stop time; if a note would still take the score over the limit
//     it is dropped - fills (pads, arps, hats, the second layer of a drum) at 19-20, the tune / bass / drums / main pad at 22, stingers and motifs at 24
//     (+ 4 permanent LFOs = 28). Every node is disconnected when its source ends.
//
// Until the first user gesture audio.musicBus() is null: play() is remembered, the beat clock runs on wall time (so
// beat-synchronous gameplay still works) and the real score starts on the first update() where the bus exists.

export const MUSIC_STATES = {
  none: { bpm: 0 },
  chill: { bpm: 84 }, tribe: { bpm: 96 }, stealth: { bpm: 100 }, combat: { bpm: 140 }, boss: { bpm: 152 },
  flight: { bpm: 126 }, dream: { bpm: 66 }, flashback: { bpm: 72 }, sorrow: { bpm: 60 },
};

// ============================================================================================ theory helpers

const SC = {
  major: [0, 2, 4, 5, 7, 9, 11],
  mixo: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  phryg: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const mod = (a, n) => ((a % n) + n) % n;
const dg = (scale, i) => scale[mod(i, 7)] + 12 * Math.floor(i / 7); // scale step index (0 = tonic) -> semitones

function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// "b3'" -> semitones above the tonic. shift = diatonic steps added (parallel thirds etc).
function degSemis(tok, scale, shift) {
  const m = /^([b#]?)([1-7])([',]*)$/.exec(tok);
  if (!m) return null;
  let s = dg(scale, +m[2] - 1 + (shift || 0)) + (m[1] === "b" ? -1 : m[1] === "#" ? 1 : 0);
  for (let i = 0; i < m[3].length; i++) s += m[3][i] === "'" ? 12 : -12;
  return s;
}
const parseBars = (str) => str.split("|").map((b) => b.trim().split(/\s+/).filter(Boolean));
const pk = (p, bar) => (typeof p === "string" ? p : p[bar % p.length]);
// four 4-bar sections (each a string or an array of up to 4 bars) -> a 16-bar array
function sec(a, a2, b, a3) {
  const out = [];
  for (const s of [a, a2, b, a3]) for (let i = 0; i < 4; i++) out.push(pk(s, i));
  return out;
}

function parseChord(tok, scale) {
  const m = /^([b#]?)([1-7])([Mm]?)(s|79|7|9)?(?:\/([b#]?)([1-7]))?$/.exec(tok);
  if (!m) throw new Error("music: bad chord " + tok);
  const d = +m[2] - 1, acc = m[1] === "b" ? -1 : m[1] === "#" ? 1 : 0, q = m[3] || (acc ? "M" : ""), ext = m[4] || "";
  const r = dg(scale, d) + acc;
  let third = q === "M" ? r + 4 : q === "m" ? r + 3 : dg(scale, d + 2);
  const fifth = q ? r + 7 : dg(scale, d + 4);
  if (ext === "s") third = q ? r + 5 : dg(scale, d + 3);
  const tones = [r, third, fifth];
  if (ext === "7" || ext === "79") tones.push(q ? r + 10 : dg(scale, d + 6));
  if (ext === "9" || ext === "79") tones.push(q ? r + 14 : dg(scale, d + 8));
  const bass = m[6] ? dg(scale, +m[6] - 1) + (m[5] === "b" ? -1 : m[5] === "#" ? 1 : 0) : r;
  return { tones, bass, root: r };
}

// closest-position voicing with the smallest movement from the previous chord
function voiceChord(pcs, prev, center) {
  const n = pcs.length;
  let best = null, bc = 1e9;
  for (let rot = 0; rot < n; rot++) {
    for (let lo = center - 12; lo <= center - 2; lo += 5) {
      const v = [];
      let last = lo - 1;
      for (let i = 0; i < n; i++) {
        const pc = pcs[(rot + i) % n];
        let p = last + 1;
        p += mod(pc - p, 12);
        v.push(p);
        last = p;
      }
      let mean = 0;
      for (let i = 0; i < n; i++) mean += v[i];
      mean /= n;
      let c = Math.abs(mean - center) * 0.7;
      if (prev && prev.length === n) for (let i = 0; i < n; i++) c += Math.abs(v[i] - prev[i]);
      else if (prev) c += Math.abs(v[n - 1] - prev[prev.length - 1]) * 2;
      if (v[n - 1] - v[0] > 15) c += 6;
      if (c < bc) { bc = c; best = v; }
    }
  }
  return best;
}

// ------------------------------------------------------------------------------------------- form compiler

function compileForm(form) {
  const scale = SC[form.scale], root = form.root, bars = form.bars || 16;
  const nSteps = bars * 16;
  const steps = [];
  for (let i = 0; i < nSteps; i++) steps.push([]);
  // chords
  const segs = [], barSegs = [];
  const pb = form.prog.split("|").map((s) => s.trim());
  for (let b = 0; b < bars; b++) {
    const parts = pb[b % pb.length].split(",");
    barSegs.push([]);
    for (let i = 0; i < parts.length; i++) {
      const c = parseChord(parts[i].trim(), scale);
      let tones = c.tones.map((t) => mod(root + t, 12));
      if (tones.length > 4) tones = tones.slice(1);
      const seg = { idx: segs.length, start: b * 16 + (i * 16) / parts.length, len: 16 / parts.length, pcs: tones, bass: c.bass, root: c.root, raw: c.tones };
      segs.push(seg);
      barSegs[b].push(seg);
    }
  }
  const voCache = {};
  const voicings = (center) => {
    if (voCache[center]) return voCache[center];
    const out = [];
    let prev = voiceChord(segs[segs.length - 1].pcs, null, center);
    for (const s of segs) { prev = voiceChord(s.pcs, prev, center); out.push(prev); }
    return (voCache[center] = out);
  };
  const segAt = (b, pos) => {
    const l = barSegs[b];
    let s = l[0];
    for (let i = 1; i < l.length; i++) if (l[i].start - b * 16 <= pos + 1e-6) s = l[i];
    return s;
  };
  const put = (k, p, n, d, v, c) => {
    const ev = { k, off: p - Math.floor(p), n, d, v, c };
    steps[mod(Math.floor(p), nSteps)].push(ev);
    return ev;
  };
  const foldBass = (oct, semis) => { let s = mod(semis, 12); if (s > 7) s -= 12; return oct + s; };

  form.tracks.forEach((tk, k) => {
    if (tk.fill === undefined) tk.fill = tk.type === "arp" || tk.type === "pad" ? 1 : 0;
    const oct = root + 12 * (tk.o || 0);
    const vel = tk.vel === undefined ? 0.8 : tk.vel;
    if (tk.type === "mel") {
      const lb = parseBars(tk.lines);
      let last = null, lastH = null;
      for (let b = 0; b < bars; b++) {
        const toks = lb[b % lb.length], unit = 16 / (toks.length || 1);
        for (let i = 0; i < toks.length; i++) {
          const t = toks[i];
          if (t === ".") { if (last) last.d += unit; if (lastH) lastH.d += unit; continue; }
          if (t === "-") { last = lastH = null; continue; }
          const s = degSemis(t, scale, 0);
          if (s === null) throw new Error("music: bad note " + t);
          const strong = (i * unit) % 4 === 0;
          last = put(k, b * 16 + i * unit, oct + s, unit, vel * (strong ? 1 : 0.86));
          lastH = tk.harm ? put(k, b * 16 + i * unit, oct + degSemis(t, scale, tk.harm), unit, vel * 0.6) : null;
        }
      }
    } else if (tk.type === "bass") {
      let last = null;
      for (let b = 0; b < bars; b++) {
        const toks = pk(tk.pat, b).trim().split(/\s+/), unit = 16 / toks.length;
        for (let i = 0; i < toks.length; i++) {
          const t = toks[i];
          if (t === ".") { if (last) last.d += unit; continue; }
          if (t === "-") { last = null; continue; }
          const sg = segAt(b, i * unit), base = foldBass(oct, sg.bass);
          let n = base;
          if (t === "8") n = base + 12;
          else if (t === "3") n = base + mod(sg.raw[1] - sg.bass, 12);
          else if (t === "5") n = base + mod(sg.raw[2] - sg.bass, 12);
          else if (t === "7") n = base + (sg.raw.length > 3 ? mod(sg.raw[3] - sg.bass, 12) : 10);
          else if (t === "a") {
            const nx = foldBass(oct, segs[(sg.idx + 1) % segs.length].bass);
            n = nx - (scale.includes(mod(nx - 1 - root, 12)) ? 1 : 2);
          }
          last = put(k, b * 16 + i * unit, n, unit, vel * (i === 0 ? 1 : 0.85));
        }
      }
    } else if (tk.type === "arp") {
      const vo = voicings(oct + (tk.ctr || 0));
      let last = null;
      for (let b = 0; b < bars; b++) {
        const toks = pk(tk.pat, b).trim().split(/\s+/), unit = 16 / toks.length;
        for (let i = 0; i < toks.length; i++) {
          const t = toks[i];
          if (t === ".") { if (last) last.d += unit; continue; }
          if (t === "-") { last = null; continue; }
          const v = vo[segAt(b, i * unit).idx];
          const ix = +t[0];
          const n = v[ix % v.length] + 12 * Math.floor(ix / v.length) + 12 * (t.length - 1);
          last = put(k, b * 16 + i * unit, n, unit, vel * (i % 4 === 0 ? 1 : 0.8));
        }
      }
    } else if (tk.type === "pad") {
      const vo = voicings(oct + (tk.ctr || 0));
      let held = {};
      for (let b = 0; b < bars; b++) {
        for (const sg of barSegs[b]) {
          let notes = vo[sg.idx];
          if (tk.voices === "top") notes = [notes[notes.length - 1] + 12 * (tk.up || 0)];
          else if (tk.voices === "low") notes = notes.slice(0, 2);
          else if (tk.voices > 0) notes = notes.slice(-tk.voices);
          if (tk.rhythm) {
            const pat = pk(tk.rhythm, b), unit = 16 / pat.length, pos0 = sg.start - b * 16;
            for (let i = 0; i < pat.length; i++) {
              const c = pat[i], p = i * unit;
              if (c === "-" || p < pos0 - 1e-6 || p >= pos0 + sg.len - 1e-6) continue;
              let j = i + 1;
              while (j < pat.length && pat[j] === "-" && j * unit < pos0 + sg.len) j++;
              const d = Math.min((j - i) * unit, tk.stab || 99);
              for (const n of notes) put(k, b * 16 + p, n, d, vel * (c === "X" ? 1 : c === "o" ? 0.55 : 0.8));
            }
          } else {
            // common tones between successive chords are tied (legato, and one voice instead of two overlapping);
            // never across a gated bar, the end of the form, or for more than two bars
            const tie = !tk.when && !tk.swell && !tk.ph, now = {};
            for (const n of notes) {
              const h = tie ? held[n] : null;
              if (h && h.end === sg.start && h.ev.d + sg.len <= 32) { h.ev.d += sg.len; h.end += sg.len; now[n] = h; }
              else now[n] = { ev: put(k, sg.start, n, sg.len, vel), end: sg.start + sg.len };
            }
            held = now;
          }
        }
      }
    } else if (tk.type === "drum") {
      for (let b = 0; b < bars; b++) {
        const pat = pk(tk.pat, b), unit = pat.length ? 16 / pat.length : 16;
        for (let i = 0; i < pat.length; i++) {
          const c = pat[i];
          if (c === "-" || c === " ") continue;
          const up = c === c.toUpperCase() && c !== c.toLowerCase();
          put(k, b * 16 + i * unit, 0, unit, vel * (c === "o" ? 0.4 : up ? 1 : 0.78), c.toLowerCase());
        }
      }
    }
  });
  const rank = (tk) => (tk.fill ? (tk.type === "pad" ? 4 : 5) : tk.type === "mel" ? 0 : tk.type === "bass" ? 1 : tk.type === "drum" ? 2 : 3);
  for (const st of steps) st.sort((a, b) => rank(form.tracks[a.k]) - rank(form.tracks[b.k]) || a.off - b.off);
  form.c = { steps, bars, segs };
  return form;
}

// ============================================================================================ the score (data)
// Melody lines: scale degrees of the form's mode; b / # alter chromatically; ' and , shift octaves; "." holds,
// "-" rests; each bar is divided evenly by its token count. Chords: degree [M|m] [s|7|9|79] [/bass]; "a,b" = two per bar.
// Drums: x hit, X accent, o ghost, a/b/c pitched (low/mid/high), "-" rest; an array of 4 = bars 1-3 + the fill.
// Track: L = layer (0..layers-1), g = channel gain, o = octave of degree 1 relative to the form root.

const PLATY = "1 3 5 . | 6 5 3 2 | 1 . 2 3 | 5 . . .";
const PIP = "5 3' 2' 1' | 6 5 3 . | 4 6 5 3 | 2 . . .";
const KING = "1 . . b2 | 1 . b5 . | 4 b3 1 . | - - - -";

const R4 = "----------------";

const DEFS = {
  // ------------------------------------------------------------------ CHILL: D major add9, 84
  chill: {
    layers: 5, swing: 0.14, calm: true,
    forms: [{
      root: 62, scale: "major",
      prog: "19 | 67 | 47 | 5s | 19 | 67 | 47 | 5s,5 | 47 | 1/3 | 27 | 5s,5 | 19 | 67 | 47,5 | 19",
      tracks: [
        { type: "pad", inst: "pad", L: 0, g: 0.11, o: 0, fill: 0, fat: 1, atk: 0.7, rel: 0.3, lp: 1300, lpI: [950, 2300], cho: 0.7, verb: 0.45, sc: 1, vel: 0.7 },
        { type: "pad", inst: "glass", L: 0, g: 0.05, o: 1, voices: "top", atk: 1.2, rel: 0.35, verb: 0.6, pan: 0.3, vel: 0.7 },
        { type: "bass", inst: "bass", L: 1, g: 0.3, o: -2, sc: 1, soft: 1, len: 0.92,
          pat: ["r . . . - r 5 .", "r . . . - 5 r a", "r . . . - r 5 .", "r . . 5 . 8 . a"] },
        { type: "arp", inst: "pluck", L: 2, g: 0.085, o: 0, ctr: 5, dec: 0.2, pan: -0.3, dly: 0.4, verb: 0.3, vel: 0.7,
          pat: ["0 2 1 2 3 2 1 2", "0 2 1 3 2 3 1 2", "0 2 1 2 3 2 1 2", "0 1 2 3 0' 3 2 1"] },
        { type: "mel", inst: "harp", L: 3, g: 0.16, o: 1, dec: 0.4, pan: 0.18, dly: 0.3, verb: 0.4,
          lines: "1 3 5 . | - - 6 5 | 3 . 2 . | - - - - | 1 3 5 . | 6 5 3 2 | 1 . 2 3 | 2 . . . | " +
            "6 . 5 3 | 5 . 3 2 | 3 . 2 1 | 2 . . 5, | 1 3 5 . | 6 5 3 2 | 1 . 2 3 | 5 . . ." },
        { type: "mel", inst: "flute", L: 3, g: 0.075, o: 0, pan: -0.35, verb: 0.55, len: 1, when: (fb, cyc) => cyc % 2 === 1 || fb >= 8,
          lines: "5 . . . | 3 . . 2 | 6, . . . | 7, . 1 2 | 5 . . . | 3 . . 2 | 6, . . 7, | 7, . . . | " +
            "- 1 2 3 5 . . . | - 3 2 1 2 . . . | - 7, 1 2 3 . . . | 2 . 3 . 7, . . . | 5 . . . | 3 . . 2 | 6, . 7, . | 1 . . ." },
        { type: "drum", inst: "kick", L: 4, g: 0.36, soft: 1, duck: 0.3, pat: ["x---------x-----", "x-------x-x-----", "x---------x-----", "x-------x-x---x-"] },
        { type: "drum", inst: "rim", L: 4, g: 0.1, pan: 0.2, room: 0.2, pat: ["----x-------x---", "----x-------x---", "----x-------x---", "----x--x----x-x-"] },
        { type: "drum", inst: "shaker", L: 4, g: 0.06, pan: -0.25, pat: ["o-x-o-xoo-x-o-x-", "o-x-o-xoo-x-o-xo", "o-x-o-xoo-x-o-x-", "o-x-o-xoo-xxoxxx"] },
        { type: "drum", inst: "tom", L: 4, g: 0.16, pan: 0.1, room: 0.2, pat: [R4, R4, R4, "------------a-b-"] },
      ],
    }],
  },

  // ------------------------------------------------------------------ TRIBE: D mixolydian, 96
  tribe: {
    layers: 5, swing: 0.1, calm: true,
    forms: [{
      root: 62, scale: "mixo",
      prog: "1 | 4 | 1 | 7 | 1 | 4 | 1 | 7,5 | 4 | 1 | 7 | 5 | 1 | 4 | 7,4 | 1",
      tracks: [
        { type: "drum", inst: "conga", L: 0, g: 0.26, pan: -0.3, room: 0.25, pat: ["a--b--a-b--a-bb-", "a--b--a-b-ba--b-", "a--b--a-b--a-bb-", "a-bba-bca-bbabcc"] },
        { type: "drum", inst: "taiko", L: 0, g: 0.3, f: 72, duck: 0.2, room: 0.2, pat: ["x-----x---x-----", "x-----x---x--x--", "x-----x---x-----", "x--x--x-x-x-x-xx"] },
        { type: "drum", inst: "shaker", L: 0, g: 0.05, pan: 0.35, pat: "o-xoo-xoo-xoo-xo" },
        { type: "bass", inst: "logdrum", L: 1, g: 0.3, o: -1, sc: 1, room: 0.15,
          pat: ["r - - r - - 5 - r - - r - 8 5 -", "r - - r - - 5 - r - 8 - 5 - a -"] },
        { type: "arp", inst: "kalimba", L: 2, g: 0.13, o: 0, ctr: 7, pan: 0.3, dly: 0.3, verb: 0.25, vel: 0.75,
          pat: ["0 - 2 0 - 1 - 2 0 - 2 0 - 1 2 -", "0 - 2 0 - 1 - 2 3 - 2 0 - 2 1 -"] },
        { type: "mel", inst: "flute", L: 3, g: 0.13, o: 1, harm: -2, pan: -0.1, verb: 0.45, dly: 0.15, len: 0.95,
          lines: "1 . 3 . 5 . . . | 6 . 5 . 3 . 2 . | 1 . . . 2 . 3 . | 5 . . . . . - - | " +
            "1 . 3 . 5 . 6 5 | 6 . 5 . 3 . 2 . | 1 . 2 . 3 . 5 . | 7 . 6 . 5 . . . | " +
            "6 . 6 5 6 . 1' . | 5 . 5 3 5 . . . | 7 . 7 6 7 . 2' . | 1' . 7 . 5 . . . | " +
            "1 . 3 . 5 . . . | 6 . 5 . 3 . 2 . | 1 . 2 . 5 . 2 . | 1 . . . . . - -" },
        { type: "drum", inst: "clap", L: 4, g: 0.15, room: 0.3, pan: 0.1, pat: ["----x-------x---", "----x-------x-x-"] },
        { type: "drum", inst: "hey", L: 4, g: 0.1, formant: 1, verb: 0.3, pat: [R4, "------------x---", R4, "------x-----x---"] },
      ],
    }],
  },

  // ------------------------------------------------------------------ STEALTH: D dorian, 100
  stealth: {
    layers: 5, swing: 0,
    forms: [{
      root: 62, scale: "dorian",
      prog: "19 | 1 | 4 | 1 | 19 | 1 | 4 | 5 | 3 | 4 | 7 | 5 | 19 | 1 | 4,7 | 1",
      tracks: [
        { type: "mel", inst: "sub", L: 0, g: 0.36, o: -2,
          lines: "1 . - - - - 1 - | 1 . - - - - - - | 4, . - - - - 4, - | 1 . - - - - - - | 1 . - - - - 1 - | 1 . - - - 1 - - | 4, . - - - - 4, - | 5, . - - - - - - | " +
            "3, . - - - - 3, - | 4, . - - - - - - | 7, . - - - - 7, - | 5, . - - 5, . - - | 1 . - - - - 1 - | 1 . - - - - - - | 4, . - - 7, . - - | 1 . - - - - - -" },
        { type: "pad", inst: "breath", L: 1, g: 0.2, o: 0, voices: "low", atk: 1.4, rel: 0.6, verb: 0.5, cho: 0.3, when: (fb) => fb % 4 !== 3 },
        { type: "drum", inst: "tick", L: 1, g: 0.09, pan: 0.3, room: 0.3,
          pat: sec(["x---x---x---x-x-", "x---x---x---x---", "x---x---x---x-x-", "x---x---x-------"], ["x---x---x---x-x-", "x---x-x-x---x---", "x---x---x---x-x-", "x---x---x-x-x-xx"],
            ["x-x-x---x-x-x---", "x-x-x---x-x-x-x-", "x-x-x---x-x-x---", "x---------------"], ["x---x---x---x-x-", "x---x---x---x---", "x---x---x-x-x-x-", R4]) },
        { type: "drum", inst: "rim", L: 1, g: 0.06, pan: -0.3, room: 0.4, pat: ["------o-------o-", "------o---o-----"] },
        { type: "mel", inst: "pizz", L: 2, g: 0.2, o: 0, pan: -0.15, verb: 0.35, room: 0.2, dly: 0.12, len: 0.5,
          lines: "1 - 5 - 1' - 5 6 | 1 - 5 - 7 - 5 - | 1 - 4 - 6 - 4 2 | 1 - 5 - 3 - - - | 1 - 5 - 1' - 5 6 | 1 - 5 - 7 - 1' - | 2' - 6 - 4 - 6 2 | 3 - 5 - 7 - - - | " +
            "3 - 5 - 7 - 5 3 | 4 - 6 - 1' - 6 - | 7, - 3 - 5 - 7 5 | 5 - 3 - 2 - - - | 1 - 5 - 1' - 5 6 | 1 - 5 - 7 - 5 - | 6 - 4 - 7 - 5 3 | 1 - - - - - - -" },
        { type: "pad", inst: "pad", L: 3, g: 0.12, o: 0, ctr: 7, fat: 1, swell: 1, trem: 1, lp: 2600, verb: 0.4, cho: 0.4, when: (fb) => fb % 2 === 1 },
        { type: "drum", inst: "heart", L: 4, g: 0.4, duck: 0.15, pat: ["x---------------", "x-------x-------"] },
        { type: "drum", inst: "riser", L: 4, g: 0.1, verb: 0.3, pat: ["", "", "", "x"] },
        { type: "drum", inst: "taiko", L: 4, g: 0.22, f: 60, room: 0.3, pat: [R4, R4, R4, "----------x--x-x"] },
        // the King, quoted once and quietly when things are tense
        { type: "mel", inst: "brass", L: 0, g: 0.1, o: -2, fat: 1, dark: 1, verb: 0.5, len: 0.9, when: (fb, cyc, I) => I >= 0.75,
          lines: "- | - | - | - | - | - | - | - | - | - | - | - | 1 . . b2 | 1 . b5 . | 4 3 1 . | -" },
      ],
    }],
  },

  // ------------------------------------------------------------------ COMBAT: D minor, 140
  combat: {
    layers: 5, swing: 0, hot: true,
    forms: [{
      root: 62, scale: "minor",
      prog: "1 | 1 | 6 | 7 | 1 | 1 | 6 | 5M | 3 | 7 | 4 | 5s,5M | 1 | 6 | 4,5M | 1",
      tracks: [
        { type: "drum", inst: "kick", L: 0, g: 0.5, duck: 0.45,
          pat: sec(["x-----x---x-----", "x-----x--xx-----", "x-----x---x-----", "x-----x---x--x--"], ["x-----x---x-----", "x-----x--xx-----", "x-----x---x-----", "x--x--x---x-x---"],
            ["x---x---x---x---", "x---x---x---x---", "x---x---x---x---", "x---x---x-x-x-x-"], ["x-----x---x-----", "x-----x--xx-----", "x--x--x---x-----", "x---x---x-------"]) },
        { type: "drum", inst: "snare", L: 0, g: 0.3, room: 0.3, pan: 0.05,
          pat: sec(["----x-------x---", "----x-------x---", "----x-------x---", "----x-------x-xx"], ["----x-------x---", "----x-------x---", "----x-------x---", "----x---x-x-xxxx"],
            ["----x-------x---", "----x-------x--x", "----x-------x---", "----x-x-x-xxxxxx"], ["----x-------x---", "----x-------x---", "----x-------x---", "----x---xxx-X---"]) },
        { type: "drum", inst: "taiko", L: 0, g: 0.34, f: 82, room: 0.3, pan: -0.15,
          pat: ["a--a--a---a-b---", "a--a--a---a-a-b-", "a--a--a---a-b---", "a--a--a-b-b-cc--"] },
        { type: "drum", inst: "hat", L: 0, g: 0.075, pan: 0.3, pat: "x-o-x-o-x-o-x-o-" },
        { type: "drum", inst: "crash", L: 0, g: 0.13, verb: 0.3, pat: ["X", "", "", "", "", "", "", ""] },
        { type: "bass", inst: "bass", L: 1, g: 0.3, o: -2, sc: 1, len: 0.8,
          pat: ["r - r r 8 - r r - r 8 r r - 5 8", "r - r r 8 - r r - r 8 r 5 - 8 a"] },
        { type: "arp", inst: "spic", L: 2, g: 0.105, o: 0, pan: -0.25, verb: 0.2, room: 0.2, lp: 3200, vel: 0.8,
          pat: ["0 0 1 0 2 0 1 0 0 0 1 0 2 0 3 2", "0 0 1 0 2 0 1 0 3 0 2 0 1 0 2 1"] },
        { type: "pad", inst: "strings", L: 2, g: 0.07, o: 1, voices: "top", fill: 0, fat: 1, verb: 0.4, cho: 0.5, pan: 0.25, lp: 3600 },
        { type: "pad", inst: "brass", L: 3, g: 0.125, o: 0, voices: 2, pan: 0.2, verb: 0.3, stab: 2.2,
          rhythm: sec(["x-----x---x-----", "x--x--x-----x-x-"], ["x-----x---x-----", "x--x--x-----x-x-"], ["X-------x-----x-", "X-----x---x-----"], ["x-----x---x-----", "x--x--x---X-----"]) },
        { type: "mel", inst: "lead", L: 4, g: 0.15, o: 0, dbl: 12, verb: 0.35, dly: 0.2, len: 0.96,
          lines: "1 3 5 . | 6 5 3 2 | 1 . 2 3 | 2 . 7, . | 1 3 5 1' | 6 5 3 2 | 1 . 2 3 | 5 . . . | " +
            "5 . 7 1' | 2' . 1' 7 | 6 . 5 4 | 5 . #7 . | 1' . 5 . | 6 5 3 2 | 1 2 2 #7, | 1 . . ." },
        { type: "drum", inst: "hat", L: 4, g: 0.05, pan: -0.3, pat: "-o-x-o-x-o-x-o-x" },
      ],
    }],
  },

  // ------------------------------------------------------------------ BOSS: D phrygian, 152 (the King)
  boss: {
    layers: 5, swing: 0, hot: true,
    lift: (d, rel) => (d.phase >= 2 && rel >= 16 ? 2 : 0), // phase 3: up to E after one full form
    forms: [{
      root: 62, scale: "phryg",
      prog: "1 | 1,b5M | 4,1 | 1 | 1 | 1,b5M | 4,2 | 1 | 6 | 2 | 4 | 2,5M | 1 | 1,b5M | 4,2 | 1",
      tracks: [
        // drums: phase 1 half-time, then full
        { type: "drum", inst: "kick", L: 0, g: 0.52, duck: 0.45, ph: [0], pat: ["x---------x-----", "x-----x---x-----", "x---------x-----", "x-----x---x--x--"] },
        { type: "drum", inst: "kick", L: 0, g: 0.5, duck: 0.45, ph: [1, 2], pat: ["x---x---x---x---", "x---x---x--xx---", "x---x---x---x---", "x---x---x-x-x---"] },
        { type: "drum", inst: "snare", L: 0, g: 0.32, room: 0.35, ph: [0], pat: ["--------x-------", "--------x-------", "--------x-------", "--------x---x-xx"] },
        { type: "drum", inst: "snare", L: 0, g: 0.3, room: 0.3, ph: [1, 2],
          pat: sec(["----x-------x---", "----x-------x---", "----x-------x---", "----x-------xxxx"], ["----x-------x---", "----x-------x---", "----x-------x---", "----x---x-x-xxxx"],
            ["----x-------x---", "----x-------x--x", "----x-------x---", "x-x-x-x-xxxxxxxx"], ["----x-------x---", "----x-------x---", "----x-------x---", "----x---xxx-X---"]) },
        { type: "drum", inst: "taiko", L: 0, g: 0.4, f: 70, room: 0.35, pan: -0.15, ph: [0], pat: ["a-----a---a--a--", "a-----a---a-----", "a-----a---a--a--", "a--a--a-a-a-bbcc"] },
        { type: "drum", inst: "taiko", L: 0, g: 0.36, f: 78, room: 0.3, pan: -0.15, ph: [1, 2], pat: ["a--a--a---a-a---", "a--a--a---a-b-b-", "a--a--a---a-a---", "a--a--a-b-b-cccc"] },
        { type: "drum", inst: "anvil", L: 0, g: 0.085, pan: 0.3, verb: 0.3, ph: [0], pat: "--------x-------" },
        { type: "drum", inst: "anvil", L: 0, g: 0.075, pan: 0.3, verb: 0.3, ph: [1, 2], pat: ["----x-------x---", "----x-------x-x-"] },
        { type: "drum", inst: "crash", L: 0, g: 0.14, verb: 0.3, pat: ["X", "", "", "", "", "", "", ""] },
        { type: "drum", inst: "hat", L: 4, g: 0.06, pan: 0.3, ph: [1, 2], pat: "xoxoxoxoxoxoxoxo" },
        // the King's theme is the bass line
        { type: "mel", inst: "bass", L: 1, g: 0.3, o: -2, sc: 1, len: 0.97, ph: [0],
          lines: "1 . . 2 | 1 . b5 . | 4 3 1 . | 1 . . . | 1 . . 2 | 1 . b5 . | 4 3 2 . | 1 . . . | 6, . . . | 2 . . . | 4 . . . | 2 . 5 . | 1 . . 2 | 1 . b5 . | 4 3 2 . | 1 . . ." },
        { type: "mel", inst: "bass", L: 1, g: 0.3, o: -2, sc: 1, len: 0.78, ph: [1, 2],
          lines: "1 1 1 1 1 1 2 2 | 1 1 1 1 b5 b5 b5 b5 | 4 4 3 3 1 1 1 1 | 1 - 1 1 - 1 2 b5 | 1 1 1 1 1 1 2 2 | 1 1 1 1 b5 b5 b5 b5 | 4 4 3 3 2 2 2 2 | 1 - 1 1 - 1 1 7, | " +
            "6, 6, 6 6, 6, 6 6, 6, | 2 2 2' 2 2 2' 2 2 | 4 4 4' 4 4 4' 4 4 | 2 2 2' 2 5 5 5' 5 | 1 1 1 1 1 1 2 2 | 1 1 1 1 b5 b5 b5 b5 | 4 4 3 3 2 2 2 2 | 1 - 1 1 1 - - -" },
        { type: "mel", inst: "brass", L: 1, g: 0.2, o: -1, fat: 1, dark: 1, verb: 0.35, len: 0.9, pan: -0.1,
          lines: "1 . . 2 | 1 . b5 . | 4 3 1 . | - - - - | 1 . . 2 | 1 . b5 . | 4 3 2 . | 1 . . - | 6, . . . | 2 . . . | 4 . . 3 | 2 . 5 . | 1 . . 2 | 1 . b5 . | 4 3 2 . | 1 . . -" },
        { type: "pad", inst: "strings", L: 2, g: 0.09, o: 0, fat: 1, voices: "low", verb: 0.4, cho: 0.5, lp: 2400, ph: [0] },
        { type: "arp", inst: "spic", L: 2, g: 0.105, o: 0, pan: -0.25, verb: 0.2, room: 0.2, lp: 3400, vel: 0.8, ph: [1],
          pat: ["0 0 1 0 2 0 1 0 0 0 1 0 2 0 3 2", "0 0 2 0 1 0 2 0 3 0 2 0 1 0 2 1"] },
        { type: "pad", inst: "choir", L: 2, g: 0.23, o: 0, ctr: 5, voices: 2, formant: 1, verb: 0.6, cho: 0.5, atk: 0.25, rel: 0.12, fill: 0, ph: [2] },
        { type: "pad", inst: "brass", L: 3, g: 0.1, o: 0, voices: 3, pan: 0.2, verb: 0.35, soft: 1, ph: [0] },
        { type: "pad", inst: "brass", L: 3, g: 0.125, o: 0, voices: 2, pan: 0.2, verb: 0.3, stab: 2.2, ph: [1],
          rhythm: sec(["x-----x---x-----", "x--x--x-----x-x-"], ["x-----x---x-----", "x--x--x-----x-x-"], ["X-------x-----x-", "X-----x---x-----"], ["x-----x---x-----", "x--x--x---X-----"]) },
        { type: "pad", inst: "brass", L: 3, g: 0.14, o: 0, voices: "top", pan: 0.2, verb: 0.3, stab: 2.2, ph: [2],
          rhythm: sec(["x-----x---x-----", "x--x--x-----x-x-"], ["x-----x---x-----", "x--x--x-----x-x-"], ["X-------x-----x-", "X-----x---x-----"], ["x-----x---x-----", "x--x--x---X-----"]) },
        // phase 3: the platypus theme stands up against the King
        { type: "mel", inst: "lead", L: 3, g: 0.15, o: 1, dbl: -12, verb: 0.4, dly: 0.22, len: 0.96, ph: [2],
          lines: "1 3 5 . | 6 5 3 2 | 1 . 3 4 | 5 . . . | 1 3 5 1' | 6 5 3 2 | 1 . 3 2 | 1 . . . | 6 . 5 6 | 7 . 6 4 | 4 . 5 6 | 6 . #7 . | 1' . 5 . | 6 5 3 2 | 1 . 3 2 | 1 . . ." },
      ],
    }],
  },

  // ------------------------------------------------------------------ FLIGHT: A lydian -> D major, 126
  flight: {
    layers: 5, swing: 0, hot: true,
    pickForm: (cur, I) => (cur === 0 ? (I >= 0.7 ? 1 : 0) : I < 0.5 ? 0 : 1),
    forms: [
      flightForm(57, "lydian", "17 | 2/1 | 17 | 2/1 | 17 | 2/1 | 67 | 2 | 67 | 5 | 67 | 2 | 17 | 2/1 | 67,5 | 17",
        "5 . . . 3 . 5 . | 4 . . . . . 2 . | 3 . . . 1 . 3 . | 4 . 5 . 6 . 7 . | 5 . . . 3 . 5 . | 4 . . . 6 . 4 . | 3 . . . 1 . 6, . | 2 . . . . . - - | " +
        "1' . . . 7 . 6 . | 5 . . . 3 . 2 . | 1' . . . 7 . 6 . | 4 . . . 6 . 7 . | 5 . . . 3 . 5 . | 4 . . . 6 . 4 . | 3 . 1 . 2 . 7, . | 1 . . . . . . .", 1),
      // the PLATYPUS theme, augmented, twice: the second time an octave higher
      flightForm(62, "major", "1 | 1/3 | 4 | 37 | 4 | 5 | 1 | 5s,5 | 1 | 1/3 | 4 | 37 | 4 | 5 | 1 | 5s",
        "1 . 3 . | 5 . . . | 6 . 5 . | 3 . 2 . | 1 . . . | 2 . 3 . | 5 . . . | . . 5 6 | 1' . 3' . | 5' . . . | 6' . 5' . | 3' . 2' . | 1' . . . | 2' . 3' . | 1' . . . | . . . .", 0),
    ],
  },

  // ------------------------------------------------------------------ DREAM: F# lydian over a D pedal, 66
  dream: {
    layers: 5, swing: 0, calm: true,
    forms: [{
      root: 66, scale: "lydian",
      prog: "19 | 2/1 | 19 | 37 | 19 | 2/1 | 67 | 2 | 5 | 67 | 37 | 2 | 19 | 2/1 | 37 | 19",
      tracks: [
        { type: "mel", inst: "sub", L: 0, g: 0.26, o: -1, long: 1, len: 1, lines: "b6,, . . . | . . . . | . . . . | . . . ." },
        { type: "pad", inst: "glass", L: 0, g: 0.095, o: 0, voices: 3, fill: 0, atk: 1.6, rel: 0.45, verb: 0.8, cho: 0.7, vel: 0.7 },
        { type: "pad", inst: "pad", L: 0, g: 0.07, o: 0, ctr: 7, voices: 3, swell: 1, fat: 1, lp: 2400, verb: 0.7, cho: 0.6, when: (fb) => fb % 4 === 3 },
        { type: "mel", inst: "celesta", L: 1, g: 0.13, o: 1, pan: 0.2, verb: 0.6, dly: 0.35, vel: 0.75,
          lines: "1 3 5 4 2 . 5 . 1' . . . . . . . | - - - - - - - - 6 . 5 . 3 . . . | 3 5 7 6 4 . 7 . 3' . . . . . . . | - - - - 2' . . . 7 . . . 5 . . . | " +
            "1 3 5 4 2 . 5 . 1' . . . 7 . . . | 6 . . . 4 . . . 2 . . . - - - - | 3 5 7 6 4 . 7 . 3' . . . 2' . . . | 1' . . . . . . . 6 . . . . . . . | " +
            "5 . . . 6 . . . 7 . . . 2' . . . | 3' . . . . . . . 1' . . . 6 . . . | 5 . . . 7 . . . 2' . . . 3' . . . | 4' . . . . . . . 2' . . . . . . . | " +
            "1 3 5 4 2 . 5 . 1' . . . . . . . | - - - - - - - - 6 . 4 . 2 . . . | 3 5 7 6 4 . 7 . 5' . . . 3' . . . | 1' . . . . . . . . . . . - - - -" },
        { type: "pad", inst: "choir", L: 2, g: 0.17, o: 0, voices: 3, formant: 1, verb: 0.8, cho: 0.6, atk: 1.2, rel: 0.4, vel: 0.7, fill: 0 },
        { type: "arp", inst: "harp", L: 3, g: 0.1, o: 0, dec: 0.24, pan: -0.3, verb: 0.6, dly: 0.3, vel: 0.7, when: (fb) => fb % 2 === 1,
          pat: ["0 1 2 3 0' 1' 2' 3' 0'' 3' 2' 1' 0' 3 2 1", "- - - - 0 1 2 3 0' 1' 2' 3' 0'' . . ."] },
        { type: "drum", inst: "taiko", L: 4, g: 0.26, f: 55, room: 0.3, verb: 0.3, pat: ["x---------x-----", "x---------------", "x---------x-----", "x-------x---x-x-"] },
      ],
    }],
  },

  // ------------------------------------------------------------------ FLASHBACK: D major, 72 (Pip, on a music box)
  flashback: {
    layers: 4, swing: 0, calm: true, vinyl: 0.016, wow: 1,
    forms: [{
      root: 62, scale: "major",
      prog: "1 | 4 | 27 | 5s,5 | 1 | 67 | 4,5 | 1 | 4 | 1/3 | 27 | 5 | 1 | 67 | 4,5 | 1",
      tracks: [
        { type: "mel", inst: "box", L: 0, g: 0.2, o: 1, dec: 0.42, wow: 1, verb: 0.45, dly: 0.12, pan: 0.1,
          lines: "5 3' 2' 1' | 6 5 3 . | 4 6 5 3 | 2 . . . | 5 3' 2' 1' | 6 5 3 . | 4 6 5 2 | 1 . . . | " +
            "6 1' 7 6 | 5 . 3 . | 4 6 5 4 | 2 . 7, . | 5 3' 2' 1' | 6 5 3 1 | 4 6 5 2 | 1 . . ." },
        { type: "arp", inst: "box", L: 0, g: 0.085, o: 0, dec: 0.24, wow: 1, verb: 0.4, pan: -0.2, vel: 0.6,
          pat: ["0 2 1 2 0 2 1 2", "0 2 1 2 0 2 1 2", "0 2 1 2 0 2 1 2", "0 1 2 1 0 - - -"] },
        { type: "pad", inst: "pad", L: 1, g: 0.085, o: 0, fill: 0, fat: 1, wow: 1, atk: 0.9, rel: 0.3, lp: 1100, cho: 0.7, verb: 0.5, vel: 0.7 },
        { type: "mel", inst: "glock", L: 2, g: 0.07, o: 2, dec: 0.4, wow: 1, verb: 0.6, pan: -0.25, vel: 0.6,
          lines: "5 3' 2' 1' | 6 5 3 . | 4 6 5 3 | 2 . . . | 5 3' 2' 1' | 6 5 3 . | 4 6 5 2 | 1 . . . | " +
            "6 1' 7 6 | 5 . 3 . | 4 6 5 4 | 2 . 7, . | 5 3' 2' 1' | 6 5 3 1 | 4 6 5 2 | 1 . . ." },
        { type: "pad", inst: "strings", L: 3, g: 0.08, o: 0, ctr: 7, voices: 2, fat: 1, wow: 1, atk: 0.6, lp: 2000, cho: 0.6, verb: 0.6, vel: 0.7 },
        { type: "mel", inst: "cello", L: 3, g: 0.11, o: -1, verb: 0.5, pan: 0.2, len: 1,
          lines: "1 . . . | 6, . 7, . | 2 . . . | 5, . . . | 3 . . . | 3 . 1 . | 6, . 7, . | 1 . . . | 4 . . . | 3 . . . | 2 . 4 . | 5 . . . | 1 . . . | 6, . . . | 4 . 5 . | 1 . . ." },
      ],
    }],
  },

  // ------------------------------------------------------------------ SORROW: B minor, 60 (Pip, alone)
  sorrow: {
    layers: 3, swing: 0, wow: 0.4,
    forms: [{
      root: 59, scale: "minor",
      prog: "1 | 1 | 6 | 6 | 4 | 4 | 5s | b2M | 1 | 1/7 | 6 | 6 | 4 | 4 | 6 | 5s",
      tracks: [
        { type: "mel", inst: "epiano", L: 0, g: 0.22, o: 0, verb: 0.75, dly: 0.2, len: 1,
          lines: "5 . 3' . | 2' . 1' . | 6 . 5 . | 3 . . . | 4 . 6 . | 5 . 3 . | 2 . . . | b2 . . . | " +
            "5 . 3' . | 2' . . 1' | 6 . . . | - - 5 3 | 4 . . . | - - 3 2 | 1 . . . | 7, . . ." },
        { type: "pad", inst: "pad", L: 1, g: 0.085, o: 0, fat: 1, atk: 1.4, rel: 0.8, lp: 900, lpI: [800, 1500], cho: 0.7, verb: 0.6, vel: 0.7 },
        { type: "mel", inst: "cello", L: 2, g: 0.14, o: -1, verb: 0.55, pan: -0.15, len: 1,
          lines: "1 . . . | . . 7, . | 6, . . . | . . . . | 4, . . . | . . 5, . | 5, . . . | b2, . . . | 1 . . . | 7, . . . | 6, . . . | . . 5, . | 4, . . . | . . . . | 6, . . . | 5, . . ." },
      ],
    }],
  },
};

function flightForm(root, scale, prog, lead, lyd) {
  return {
    root, scale, prog,
    tracks: [
      { type: "pad", inst: "pad", L: 0, g: 0.115, o: 0, ctr: lyd ? 7 : 2, voices: 3, fill: 0, fat: 1, atk: 0.5, rel: 0.2, lp: 1800, lpI: [1300, 3600], cho: 0.8, verb: 0.5, sc: 1, vel: 0.7 },
      { type: "arp", inst: "pluck", L: 1, g: 0.08, o: lyd ? 1 : 0, ctr: lyd ? 0 : 7, bright: 1, dec: 0.075, pan: -0.3, dly: 0.42, verb: 0.25, vel: 0.75, len: 0.8,
        pat: ["0 1 2 3 2 1 2 3 0 1 2 3 2 1 3 2", "0 1 2 3 2 1 2 3 0' 3 2 1 2 3 2 1"] },
      { type: "drum", inst: "kick", L: 2, g: 0.46, duck: 0.5, pat: ["x---x---x---x---", "x---x---x---x---", "x---x---x---x---", "x---x---x---x-x-"] },
      { type: "bass", inst: "bass", L: 2, g: 0.28, o: lyd ? -2 : -2, sc: 1, len: 0.85, pat: ["- r - r - r - r", "- r - r - r 8 r", "- r - r - r - r", "- r - r 8 r 5 a"] },
      { type: "drum", inst: "hat", L: 2, g: 0.06, open: 1, pan: 0.3, pat: "--x---x---x---x-" },
      { type: "drum", inst: "tom", L: 2, g: 0.2, room: 0.3, pan: -0.2, pat: ["----------a---b-", "------------a-b-", "----------a---b-", "a--a--b--b--c-c-"] },
      { type: "mel", inst: "lead", L: 3, g: 0.14, o: lyd ? 1 : 0, bright: 1, verb: 0.45, dly: 0.3, len: 0.98, lines: lead },
      { type: "drum", inst: "snare", L: 4, g: 0.24, room: 0.35, pat: ["----x-------x---", "----x-------x---", "----x-------x---", "x---x---x-x-xxxx"] },
      { type: "pad", inst: "strings", L: 4, g: 0.065, o: 1, ctr: 5, voices: "top", fill: 0, fat: 1, verb: 0.5, cho: 0.6, pan: 0.3, lp: 4200 },
      { type: "drum", inst: "crash", L: 2, g: 0.11, verb: 0.3, pat: ["X", "", "", "", "", "", "", ""] },
    ],
  };
}

for (const name in DEFS) {
  DEFS[name].bpm = MUSIC_STATES[name].bpm;
  DEFS[name].forms.forEach(compileForm);
}

const layerLevel = (n, k, I) => {
  if (k <= 0) return 1;
  const x = clamp((I - (k / n - 0.08)) / 0.14, 0, 1);
  return x * x * (3 - 2 * x);
};

const STINGER_LEN = { victory: 3.3, defeat: 1.15, checkpoint: 1.0, discover: 1.9, danger: 1.3, transform: 2.5, phase: 2.2, gear: 1.5, armyUp: 1.5 };
const MAXV = 24;      // sounding note sources incl. a deck's own loop (+ 4 permanent LFOs = the 28 voice budget)
const LIM_FILL = 20;  // pads, arps, hats and the second layer of a drum give way first (calm states) ...
const LIM_FILL_HOT = 19; // ... earlier where the kit is big (combat, boss, flight)
const LIM_CORE = 22;  // then the tune, the bass and the drums; stingers and motifs may use all of MAXV
const TAIL = 4.6;     // a decaying voice is stopped after this many time constants (-40 dB)
// spectra of the struck / plucked instruments (sine partials 1..n)
const WAVES = {
  pluck: [1, 0.5, 0.33, 0.2, 0.12, 0.08, 0.05, 0.03],
  pluckB: [1, 0.18, 0.5, 0.1, 0.3, 0.06, 0.16, 0.04, 0.08],
  harp: [1, 0.45, 0.2, 0.12, 0.06, 0.03],
  kalimba: [1, 0.04, 0, 0, 0.26, 0.2, 0, 0.06],
  celesta: [1, 0.1, 0, 0.36, 0, 0.05, 0, 0.1],
  box: [1, 0.12, 0, 0.1, 0.42, 0, 0, 0.05, 0, 0.09],
  glock: [1, 0, 0.3, 0, 0, 0.13, 0, 0, 0.05],
  epiano: [1, 0.36, 0.12, 0.2, 0.05, 0.04, 0.02],
  log: [1, 0.1, 0.34, 0, 0.12, 0, 0.05],
  glass: [1, 0.24, 0, 0.06],
  sub: [1, 0.3, 0.08], // a little second harmonic so the pedal still reads on small speakers
  bell: [1, 0, 0.45, 0, 0.3, 0, 0, 0, 0.14, 0, 0, 0, 0.05],
  anvil: [0, 0, 0, 1, 0, 0, 0.75, 0, 0, 0, 0.55, 0, 0, 0.4, 0, 0, 0.22],
};
const OUT_TRIM = 0.9; // into the bus compressor
const POST = 0.6;     // after it: a DynamicsCompressorNode adds ~+6 dB of automatic make-up gain; take it back so the
                      // soft clip only rounds drum peaks and never grinds on sustained chords
const DUCK_MAX = 8;   // seconds a duck(1) may hold the playing score silent before it is released automatically
const CEIL = 0.33;    // soft clip ceiling: just under -9 dBFS
const KNEE = 0.2;     // the clip is a straight wire below this

// ============================================================================================ the engine

export function createMusic(audio) {
  const wall = () => (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;

  let bus = null, ac = null, G = null;
  let state = "none", pendName = null, intensity = 0, iTarget = 0, iRate = 0, phase = 0, volume = 1;
  let cur = null, nxt = null, switchAt = 0;
  const old = [];
  let wallT0 = 0, lastBeat = -1, peakI = 0, peakT = -1e9;
  let duckV = 0, duckFrom = 0, duckT0 = 0, duckT1 = 0;
  const lastSting = {};
  const vs = []; // [start, stop] of every scheduled source

  // ------------------------------------------------------------------------------------------ graph

  function init() {
    ac = bus.ctx;
    duckT0 = duckT1 = 0;
    const g = (v) => { const n = ac.createGain(); n.gain.value = v; return n; };
    G = { waves: {} };
    G.sum = g(1); G.bed = g(1); G.sting = g(1); G.pre = g(OUT_TRIM); G.post = g(POST);
    G.comp = ac.createDynamicsCompressor();
    G.comp.threshold.value = -20; G.comp.knee.value = 12; G.comp.ratio.value = 3; G.comp.attack.value = 0.02; G.comp.release.value = 0.25;
    G.clip = ac.createWaveShaper();
    // transparent below the knee (sustained music never touches it), then a tanh shoulder that cannot pass CEIL
    const N = 2049, curve = new Float32Array(N), span = CEIL - KNEE;
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1, a = Math.abs(x);
      curve[i] = Math.sign(x) * (a <= KNEE ? a : KNEE + span * Math.tanh((a - KNEE) / span));
    }
    G.clip.curve = curve;
    G.clip.oversample = "none";
    G.vol = g(volume); G.duck = g(1 - duckV);
    G.sum.connect(G.bed); G.bed.connect(G.pre); G.sting.connect(G.pre);
    G.pre.connect(G.comp); G.comp.connect(G.post); G.post.connect(G.clip); G.clip.connect(G.vol); G.vol.connect(G.duck); G.duck.connect(bus.input);
    // reverb sends follow volume and duck as well
    const send = (target, lvl) => {
      const i = g(lvl), v = g(volume), d = g(1 - duckV);
      i.connect(v); v.connect(d);
      if (target) d.connect(target);
      return { in: i, vol: v.gain, duck: d.gain };
    };
    G.verb = send(bus.verb, 0.5);
    G.room = send(bus.room, 0.4);
    G.vols = [G.vol.gain, G.verb.vol, G.room.vol];
    G.ducks = [G.duck.gain, G.verb.duck, G.room.duck];
    // tempo delay (ping-pong, dark feedback)
    G.dly = g(1);
    G.dL = ac.createDelay(1.6); G.dR = ac.createDelay(1.6);
    G.dL.delayTime.value = 0.4; G.dR.delayTime.value = 0.4;
    const fb = g(0.36), lp = ac.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 2600;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 300;
    const pL = ac.createStereoPanner(), pR = ac.createStereoPanner();
    pL.pan.value = -0.65; pR.pan.value = 0.65;
    G.dly.connect(hp); hp.connect(G.dL); G.dL.connect(pL); pL.connect(G.sum);
    G.dL.connect(G.dR); G.dR.connect(pR); pR.connect(G.sum);
    G.dR.connect(lp); lp.connect(fb); fb.connect(G.dL);
    const dv = g(0.25); pL.connect(dv); pR.connect(dv); dv.connect(G.verb.in);
    // stereo chorus / ensemble: turns single saws into a wide section
    G.cho = g(1);
    const mk = (base, rate, depth, pan) => {
      const d = ac.createDelay(0.06);
      d.delayTime.value = base;
      const l = ac.createOscillator(), lg = g(depth), p = ac.createStereoPanner();
      l.frequency.value = rate; p.pan.value = pan;
      l.connect(lg); lg.connect(d.delayTime); l.start();
      G.cho.connect(d); d.connect(p); p.connect(G.sum);
    };
    mk(0.0117, 0.31, 0.0026, -0.85);
    mk(0.0173, 0.43, 0.0031, 0.85);
    // shared vibrato and tape-wow LFOs (outputs in cents)
    const lfo = (rate, cents) => { const l = ac.createOscillator(), lg = g(cents); l.frequency.value = rate; l.connect(lg); l.start(); return lg; };
    G.vib = lfo(5.3, 6);
    G.wow = lfo(0.47, 9);
    // stinger / motif strip
    G.st = g(1);
    G.st.connect(G.sting);
    const sv = g(0.4), sd = g(0.12);
    G.st.connect(sv); sv.connect(G.verb.in); G.st.connect(sd); sd.connect(G.dly);
  }

  // ------------------------------------------------------------------------------------------ voices

  let fillLim = LIM_FILL, loops = 0; // loops: deck-owned loop sources alive (tremolo LFO, vinyl noise)
  let solo = false; // true while a stinger / motif / transition gesture is being written: it may use the whole budget
  // may a note of `need` sources start at t and sound for about `len` seconds?
  function room(t, need, pri, len) {
    const n = vs.length, hard = MAXV - loops, tEnd = t + (len || 0.8);
    let c = 0, ahead = 0;
    for (let i = 0; i < n; i += 2) {
      if (vs[i] <= t + 0.03) { if (vs[i + 1] > t) c++; } else if (vs[i] < tEnd) ahead++;
    }
    let ok = c + need <= (solo ? hard : (pri ? LIM_CORE : fillLim) - loops);
    if (ok && ahead) {
      // notes already written for a little later (a stinger, a motif, a transition gesture) keep their place:
      // this one must still fit when they start
      for (let i = 0; i < n && ok; i += 2) {
        const a = vs[i];
        if (a <= t + 0.03 || a >= tEnd) continue;
        let k = need;
        for (let j = 0; j < n; j += 2) if (vs[j] <= a + 0.001 && vs[j + 1] > a) k++;
        if (k > hard) ok = false;
      }
    }
    if (!ok && globalThis.__md) globalThis.__md[solo ? 2 : pri]++; // debug counter (tools only)
    return ok;
  }
  function wave(name) {
    let w = G.waves[name];
    if (!w) {
      const h = WAVES[name], re = new Float32Array(h.length + 1), im = new Float32Array(h.length + 1);
      for (let i = 0; i < h.length; i++) im[i + 1] = h[i];
      w = G.waves[name] = ac.createPeriodicWave(re, im);
    }
    return w;
  }
  function O(type, f, t0, t1, det) {
    const o = ac.createOscillator();
    if (type in WAVES) o.setPeriodicWave(wave(type)); else o.type = type;
    o.frequency.value = f;
    if (det) o.detune.value = det;
    o.start(t0); o.stop(t1);
    vs.push(t0, t1);
    return o;
  }
  function NZ(buf, t0, t1) {
    const s = ac.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.start(t0, Math.random() * 2); s.stop(t1);
    vs.push(t0, t1);
    return s;
  }
  function fin(last, nodes, mods) {
    last.onended = () => {
      for (let i = 0; i < nodes.length; i++) { const n = nodes[i]; if (n) { try { n.disconnect(); } catch (e) { /* gone */ } } }
      if (mods) for (let i = 0; i < mods.length; i++) { try { mods[i][0].disconnect(mods[i][1]); } catch (e) { /* gone */ } }
    };
  }
  const gn = (v) => { const n = ac.createGain(); n.gain.value = v; return n; };
  const bq = (type, f, q) => { const n = ac.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q) n.Q.value = q; return n; };
  // attack -> (decay to sus) -> release at tOff. Returns [gainNode, endTime]
  function env(t, a, peak, tOff, rTc, dTc, sus) {
    const n = ac.createGain(), p = n.gain;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + a);
    if (dTc) p.setTargetAtTime(peak * sus, t + a, dTc);
    const off = Math.max(tOff, t + a);
    p.setTargetAtTime(0, off, rTc);
    n._end = off + rTc * TAIL;
    return n;
  }
  function modulate(k, oscs, mods) {
    if (k.wow) for (const o of oscs) { G.wow.connect(o.detune); mods.push([G.wow, o.detune]); }
    if (k.vib) for (const o of oscs) { G.vib.connect(o.detune); mods.push([G.vib, o.detune]); }
  }

  // struck / plucked tones: ONE oscillator with the instrument's spectrum; the low-pass that closes while the note
  // decays is the "bright attack, pure tail" of a real string or tine. p: { w, hi, lo (cutoff in multiples of f),
  // mt (how fast it closes), dt (decay), a, hold (keyboard-like sustain), bend }; k.dec overrides the decay, k.damp
  // stops the ring at the end of the written note.
  function tone(dest, t, f, dur, v, p, k) {
    const atk = p.a || 0.002, dt = k.dec || p.dt, pk = v * 1.2;
    if (!room(t, 1, k.fill ? 0 : 1, p.hold ? dur + 0.6 : dt * TAIL)) return;
    const n = ac.createGain(), gp = n.gain;
    gp.setValueAtTime(0, t);
    gp.linearRampToValueAtTime(pk, t + atk);
    gp.setTargetAtTime(p.hold ? pk * 0.35 : 0, t + atk, dt);
    let end = t + atk + dt * TAIL;
    if (p.hold) { const off = Math.max(t + dur, t + atk); gp.setTargetAtTime(0, off, 0.12); end = off + 0.56; }
    else if (k.damp) { const off = Math.max(t + dur, t + atk + 0.03); if (off + 0.28 < end) { gp.setTargetAtTime(0, off, 0.06); end = off + 0.28; } }
    const o = O(p.w, f, t, end), lp = bq("lowpass", 1000, 0.5);
    const hi = Math.min(f * p.hi, 10000), lo = Math.min(Math.max(f * p.lo, 420), hi);
    lp.frequency.setValueAtTime(hi, t);
    lp.frequency.setTargetAtTime(lo, t, p.mt);
    if (p.bend) { o.frequency.setValueAtTime(f * p.bend, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05); }
    o.connect(lp); lp.connect(n); n.connect(dest);
    const mods = [];
    modulate(k, [o], mods);
    fin(o, [o, lp, n], mods);
  }
  const INST = {
    pad(dest, t, f, dur, v, k) {
      if (!room(t, 1, k.fill === 0 ? 1 : 0, dur + 0.5)) return;
      let n;
      const pk0 = v * 0.8;
      if (k.swell) { // a reversed swell: grows through the whole note and is cut at the bar line
        n = ac.createGain();
        n.gain.setValueAtTime(0.0008, t);
        n.gain.exponentialRampToValueAtTime(pk0, t + dur * 0.97);
        n.gain.setTargetAtTime(0, t + dur * 0.97, 0.03);
        n._end = t + dur + 0.2;
      } else n = env(t, Math.min(k.atk === undefined ? 0.35 : k.atk, dur * 0.6), pk0, t + dur, k.rel === undefined ? 0.25 : k.rel);
      const o1 = O("sawtooth", f, t, n._end, (Math.random() * 2 - 1) * 7); // every desk a few cents apart
      o1.connect(n);
      n.connect(dest);
      const mods = [];
      modulate(k, [o1], mods);
      fin(o1, [o1, n], mods);
    },
    strings(dest, t, f, dur, v, k) {
      if (!room(t, 1, k.fill === 0 ? 1 : 0, dur + 0.5)) return;
      const n = env(t, Math.min(k.atk === undefined ? 0.12 : k.atk, dur * 0.5), v * 0.8, t + dur, 0.14);
      const o1 = O("sawtooth", f, t, n._end, (Math.random() * 2 - 1) * 6);
      o1.connect(n); n.connect(dest);
      const mods = [];
      modulate({ vib: 1, wow: k.wow }, [o1], mods);
      fin(o1, [o1, n], mods);
    },
    glass(dest, t, f, dur, v, k) {
      if (!room(t, 1, k.fill === 0 ? 1 : 0, dur + 0.5)) return;
      const n = env(t, Math.min(k.atk || 0.8, dur * 0.6), v * 0.85, t + dur, k.rel || 0.5);
      const o1 = O("glass", f, t, n._end);
      o1.connect(n); n.connect(dest);
      fin(o1, [o1, n]);
    },
    choir(dest, t, f, dur, v, k) {
      if (!room(t, 1, k.fill === 0 ? 1 : 0, dur + 0.5)) return;
      const n = env(t, Math.min(k.atk || 0.3, dur * 0.5), v * 0.8, t + dur, k.rel || 0.3);
      const o1 = O("sawtooth", f, t, n._end, (Math.random() * 2 - 1) * 9);
      o1.connect(n); n.connect(dest);
      const mods = [];
      modulate({ vib: 1 }, [o1], mods);
      fin(o1, [o1, n], mods);
    },
    breath(dest, t, f, dur, v, k) {
      if (!room(t, 1, 0, dur + 0.5)) return;
      const n = env(t, Math.min(k.atk || 1, dur * 0.6), v * 2.2, t + dur, k.rel || 0.5);
      const s = NZ(bus.pink, t, n._end), f1 = bq("bandpass", f, 14);
      s.connect(f1); f1.connect(n); n.connect(dest);
      fin(s, [s, f1, n]);
    },
    spic(dest, t, f, dur, v) {
      if (!room(t, 1, 0)) return;
      const n = env(t, 0.004, v, t + 0.03, 0.036);
      const o = O("sawtooth", f, t, n._end);
      o.connect(n); n.connect(dest);
      fin(o, [o, n]);
    },
    pizz(dest, t, f, dur, v) {
      if (!room(t, 1, 1)) return;
      const n = env(t, 0.003, v, t + 0.02, 0.085);
      const o = O("sawtooth", f, t, n._end), lp = bq("lowpass", f * 7, 0.8);
      lp.frequency.setValueAtTime(Math.min(f * 7, 6000), t);
      lp.frequency.setTargetAtTime(f * 1.6, t, 0.045);
      o.connect(lp); lp.connect(n); n.connect(dest);
      fin(o, [o, lp, n]);
    },
    pluck(dest, t, f, dur, v, k) { tone(dest, t, f, dur, v, k.bright ? { w: "pluckB", hi: 9, lo: 2, mt: 0.06, dt: 0.16 } : { w: "pluck", hi: 7, lo: 1.5, mt: 0.07, dt: 0.24 }, k); },
    harp(dest, t, f, dur, v, k) { tone(dest, t, f, dur, v, { w: "harp", hi: 6, lo: 1.3, mt: 0.1, dt: 0.5 }, k); },
    kalimba(dest, t, f, dur, v, k) { tone(dest, t, f, dur, v, { w: "kalimba", hi: 9, lo: 1.4, mt: 0.035, dt: 0.26 }, k); },
    celesta(dest, t, f, dur, v, k) { tone(dest, t, f, dur, v, { w: "celesta", hi: 10, lo: 2.5, mt: 0.14, dt: 0.55 }, k); },
    box(dest, t, f, dur, v, k) { tone(dest, t, f, dur, v, { w: "box", hi: 12, lo: 3, mt: 0.09, dt: 0.48 }, k); },
    glock(dest, t, f, dur, v, k) { tone(dest, t, f, dur, v, { w: "glock", hi: 10, lo: 2, mt: 0.12, dt: 0.6 }, k); },
    epiano(dest, t, f, dur, v, k) { tone(dest, t, f, dur, v, { w: "epiano", hi: 7, lo: 2, mt: 0.3, dt: 1.1, a: 0.006, hold: 1 }, k); },
    logdrum(dest, t, f, dur, v, k) { tone(dest, t, f, dur, v, { w: "log", hi: 8, lo: 1.2, mt: 0.03, dt: 0.13, bend: 1.1 }, k); },
    bell(dest, t, f, dur, v, k) { tone(dest, t, f, dur, v, { w: "bell", hi: 12, lo: 3, mt: 0.25, dt: 0.6 }, k); },
    flute(dest, t, f, dur, v) {
      if (!room(t, 1, 1)) return;
      const n = env(t, Math.min(0.07, dur * 0.4), v * 0.9, t + dur, 0.07);
      const o = O("triangle", f, t, n._end);
      o.connect(n); n.connect(dest);
      let s = null, bp = null, cg = null;
      if (room(t, 1, 0)) { // the breath at the start of the note
        cg = env(t, 0.015, v * 0.5, t + 0.05, 0.05); s = NZ(bus.pink, t, Math.min(n._end, t + 0.2)); bp = bq("bandpass", Math.min(f * 2, 5000), 1.5);
        s.connect(bp); bp.connect(cg); cg.connect(n);
      }
      const mods = [];
      modulate({ vib: 1 }, [o], mods);
      fin(o, [o, s, bp, cg, n], mods);
    },
    brass(dest, t, f, dur, v, k) {
      const fat = k.fat === 2 ? 1 : 0;
      if (!room(t, 1 + fat, k.fill ? 0 : 1, dur + 0.3)) return;
      const a = k.soft ? Math.min(0.3, dur * 0.4) : 0.03;
      const n = env(t, a, v * (fat ? 0.6 : 0.85), t + dur, 0.06, 0.2, 0.75);
      const lp = bq("lowpass", f, 0.9), top = Math.min(f * (k.dark ? 4.5 : 3 + v * 4), k.dark ? 1500 : 4800);
      lp.frequency.setValueAtTime(f * 1.3, t);
      lp.frequency.linearRampToValueAtTime(top, t + a + 0.03);
      lp.frequency.setTargetAtTime(Math.max(f * 2, top * 0.55), t + a + 0.03, 0.22);
      const o1 = O("sawtooth", f, t, n._end, fat ? -7 : 0), o2 = fat ? O("sawtooth", f, t, n._end, 7) : null;
      o1.connect(lp); if (o2) o2.connect(lp);
      lp.connect(n); n.connect(dest);
      fin(o1, [o1, o2, lp, n]);
    },
    lead(dest, t, f, dur, v, k) {
      if (!room(t, 2, 1, dur + 0.25)) return;
      const n = env(t, 0.035, v * 0.6, t + dur, 0.05, 0.3, 0.8);
      const top = Math.min(f * (k.bright ? 7 : 5), k.bright ? 6000 : 4200);
      const lp = bq("lowpass", top, 0.7);
      lp.frequency.setValueAtTime(f * 1.5, t);
      lp.frequency.linearRampToValueAtTime(top, t + 0.06);
      lp.frequency.setTargetAtTime(top * 0.6, t + 0.06, 0.4);
      const o1 = O("sawtooth", f, t, n._end, -8), o2 = O(k.bright ? "square" : "sawtooth", f * (k.dbl ? Math.pow(2, k.dbl / 12) : 1), t, n._end, 8);
      const g2 = gn(k.bright ? 0.5 : k.dbl ? 0.7 : 1);
      o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(n); n.connect(dest);
      const mods = [];
      modulate({ vib: 1 }, [o1, o2], mods);
      fin(o1, [o1, o2, g2, lp, n], mods);
    },
    cello(dest, t, f, dur, v) {
      if (!room(t, 1, 1, dur + 0.5)) return;
      const n = env(t, Math.min(0.22, dur * 0.4), v * 0.85, t + dur, 0.16);
      const lp = bq("lowpass", Math.min(f * 5, 1400), 0.8);
      const o1 = O("sawtooth", f, t, n._end);
      o1.connect(lp); lp.connect(n); n.connect(dest);
      const mods = [];
      modulate({ vib: 1 }, [o1], mods);
      fin(o1, [o1, lp, n], mods);
    },
    bass(dest, t, f, dur, v, k) { // a saw (or triangle) under a low-pass that snaps shut: the fundamental is the sub
      if (!room(t, 1, 1)) return;
      const n = env(t, 0.008, v * (k.soft ? 1.25 : 1.3), t + dur, k.soft ? 0.035 : 0.022, 0.18, 0.75);
      const o = O(k.soft ? "triangle" : "sawtooth", f, t, n._end);
      const lp = bq("lowpass", f * 3, 1.5);
      lp.frequency.setValueAtTime(f * (k.soft ? 4 : 8), t);
      lp.frequency.setTargetAtTime(f * (k.soft ? 2 : 2.2), t, 0.09);
      o.connect(lp); lp.connect(n); n.connect(dest);
      fin(o, [o, lp, n]);
    },
    sub(dest, t, f, dur, v, k) {
      if (!room(t, 1, 1, dur + 0.5)) return;
      const n = k.long ? env(t, 0.6, v, t + dur, 0.5) : env(t, 0.03, v, t + dur, 0.12, 0.3, 0.6);
      const o = O("sub", f, t, n._end);
      if (!k.long) { o.frequency.setValueAtTime(f * 1.06, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.12); }
      o.connect(n); n.connect(dest);
      fin(o, [o, n]);
    },
  };

  // ------------------------------------------------------------------------------------------ percussion

  function thump(dest, t, v, f0, f1, sweep, dTc, type) {
    const n = env(t, 0.002, v, t + 0.01, dTc);
    n._end = t + 0.012 + dTc * 3.5; // drums: the next hit masks the last -30 dB
    const o = O(type || "sine", f0, t, n._end);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
    o.connect(n); n.connect(dest);
    fin(o, [o, n]);
  }
  function noiseHit(dest, t, v, type, freq, q, atk, dTc, buf) {
    const n = env(t, atk, v, t + atk, dTc);
    const s = NZ(buf || bus.white, t, n._end), f = bq(type, freq, q);
    s.connect(f); f.connect(n); n.connect(dest);
    fin(s, [s, f, n]);
    return f;
  }
  function pump(d, t, amt) {
    if (!d || !amt) return;
    d.sc.gain.setTargetAtTime(1 - amt, t, 0.004);
    d.sc.gain.setTargetAtTime(1, t + 0.07, 0.085);
  }
  const PITCH = { a: 1, b: 1.34, c: 1.78, x: 1 };

  const DRUM = {
    kick(d, dest, t, v, c, k) {
      if (!room(t, 1, 1)) return;
      if (k.soft) thump(dest, t, v, 105, 46, 0.09, 0.07);
      else { thump(dest, t, v, 165, 44, 0.075, 0.075); if (room(t, 1, 0)) noiseHit(dest, t, v * 0.25, "lowpass", 2500, 0.5, 0.001, 0.008); }
      pump(d, t, k.duck * Math.min(1, v + 0.2));
    },
    heart(d, dest, t, v, c, k) {
      if (!room(t, 1, 1)) return;
      thump(dest, t, v, 72, 38, 0.1, 0.07);
      if (room(t + 0.21, 1, 1)) thump(dest, t + 0.21, v * 0.7, 62, 36, 0.1, 0.08);
      pump(d, t, k.duck);
    },
    snare(d, dest, t, v) {
      if (!room(t, 1, 1)) return;
      noiseHit(dest, t, v, "highpass", 1400, 0.6, 0.001, 0.05);
      if (room(t, 1, 0)) thump(dest, t, v * 0.5, 230, 170, 0.04, 0.035, "triangle");
    },
    rim(d, dest, t, v) {
      if (!room(t, 1, 1)) return;
      noiseHit(dest, t, v * 1.6, "bandpass", 1750, 9, 0.001, 0.012);
    },
    hat(d, dest, t, v, c, k) {
      if (!room(t, 1, 1)) return;
      noiseHit(dest, t, v, "highpass", 7800, 0.7, 0.001, k.open ? 0.06 : 0.014);
    },
    tick(d, dest, t, v) {
      if (!room(t, 1, 1)) return;
      noiseHit(dest, t, v * 1.5, "bandpass", 5200, 5, 0.001, 0.007);
    },
    shaker(d, dest, t, v) {
      if (!room(t, 1, 1)) return;
      noiseHit(dest, t, v, "bandpass", 6400, 1.3, 0.012, 0.022);
    },
    tom(d, dest, t, v, c) {
      if (!room(t, 1, 1)) return;
      const f = 96 * PITCH[c];
      thump(dest, t, v, f * 1.5, f, 0.08, 0.075);
    },
    taiko(d, dest, t, v, c, k) {
      if (!room(t, 1, 1)) return;
      const f = (k.f || 80) * PITCH[c];
      thump(dest, t, v, f * 1.9, f, 0.06, 0.1);
      if (room(t, 1, 0)) noiseHit(dest, t, v * 0.7, "lowpass", 500, 0.7, 0.002, 0.03, bus.pink);
      pump(d, t, k.duck);
    },
    conga(d, dest, t, v, c) {
      if (!room(t, 1, 1)) return;
      if (c === "c") { noiseHit(dest, t, v * 0.9, "bandpass", 2300, 2, 0.001, 0.014); return; }
      const f = c === "b" ? 312 : 208;
      thump(dest, t, v, f * 1.12, f, 0.03, 0.05);
    },
    clap(d, dest, t, v) {
      if (!room(t, 1, 1)) return;
      const n = ac.createGain(), p = n.gain;
      p.setValueAtTime(0, t);
      for (let i = 0; i < 3; i++) { p.setValueAtTime(v * 0.8, t + i * 0.011); p.setTargetAtTime(v * 0.15, t + i * 0.011 + 0.001, 0.004); }
      p.setValueAtTime(v, t + 0.033);
      p.setTargetAtTime(0, t + 0.034, 0.045);
      const s = NZ(bus.white, t, t + 0.4), f = bq("bandpass", 1350, 1.1);
      s.connect(f); f.connect(n); n.connect(dest);
      fin(s, [s, f, n]);
    },
    hey(d, dest, t, v) { // the chant: a short pitched shout through the formants (root + fifth)
      if (!room(t, 2, 0)) return;
      const tr = d ? d.tr : 0;
      for (const m of [62, 69]) {
        const f = mtof(m + tr), n = env(t, 0.02, v * 0.6, t + 0.13, 0.05);
        const o = O("sawtooth", f * 1.06, t, n._end);
        o.frequency.setValueAtTime(f * 1.07, t);
        o.frequency.exponentialRampToValueAtTime(f * 0.94, t + 0.2);
        o.connect(n); n.connect(dest);
        fin(o, [o, n]);
      }
    },
    anvil(d, dest, t, v) {
      if (!room(t, 1, 1)) return;
      const n = env(t, 0.001, v * 1.5, t + 0.01, 0.1);
      const o = O("anvil", 311, t, n._end, (Math.random() * 2 - 1) * 12), hp = bq("highpass", 900, 0.7), lp = bq("lowpass", 9000, 0.5);
      lp.frequency.setValueAtTime(9000, t);
      lp.frequency.setTargetAtTime(2600, t, 0.12); // the ring darkens
      o.connect(hp); hp.connect(lp); lp.connect(n); n.connect(dest);
      fin(o, [o, hp, lp, n]);
    },
    crash(d, dest, t, v) {
      if (!room(t, 1, 1)) return;
      noiseHit(dest, t, v, "highpass", 4200, 0.5, 0.002, 0.34);
    },
    riser(d, dest, t, v, c, k, ev) { riser(dest, t, (ev ? ev.d : 16) * (d ? d.sl : 0.12), v); },
  };

  // ------------------------------------------------------------------------------------------ gestures

  function riser(dest, t, dur, v) {
    if (!room(t, 1, 1) || dur < 0.15) return;
    const n = ac.createGain();
    n.gain.setValueAtTime(0.0008, t);
    n.gain.exponentialRampToValueAtTime(v, t + dur);
    n.gain.setTargetAtTime(0, t + dur, 0.02);
    const s = NZ(bus.white, t, t + dur + 0.15), f = bq("bandpass", 400, 1.6);
    f.frequency.setValueAtTime(350, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    s.connect(f); f.connect(n); n.connect(dest);
    fin(s, [s, f, n]);
  }
  function impact(dest, t, v) {
    if (!room(t, 1, 1)) return;
    thump(dest, t, v, 95, 30, 0.25, 0.3);
    if (room(t, 1, 0)) noiseHit(dest, t, v * 0.6, "lowpass", 300, 0.6, 0.003, 0.2, bus.pink);
  }
  function roll(dest, t, dur, v, taiko) {
    const n = Math.max(2, Math.round(dur / 0.105));
    for (let i = 0; i < n; i++) {
      const x = i / n, tt = t + dur * x, vv = v * (0.25 + 0.75 * x * x);
      if (taiko) DRUM.taiko(null, dest, tt, vv, i > n * 0.6 ? "b" : "a", { f: 74 });
      else DRUM.snare(null, dest, tt, vv);
    }
  }
  function chord(inst, dest, t, notes, dur, v, k) {
    for (let i = 0; i < notes.length; i++) INST[inst](dest, t, mtof(notes[i]), dur, v, k || {});
  }

  // ------------------------------------------------------------------------------------------ decks

  function makeDeck(name, t0, lvl) {
    const def = DEFS[name];
    const d = {
      name, def, t0, spb: 60 / def.bpm, sl: 15 / def.bpm, step: 0, endAt: Infinity, disposeAt: Infinity,
      formIdx: def.pickForm ? def.pickForm(0, intensity) : 0, formOff: 0, phase, phasePending: null, tr: 0,
      rng: rng32(name.length * 7919 + 17), gate: [], ch: [], nodes: [], srcs: [], appliedI: -1, fb: 0, cyc: 0,
    };
    const N = (n) => { d.nodes.push(n); return n; };
    d.out = N(gn(lvl)); d.pre = N(gn(1)); d.sc = N(gn(1)); d.fx = N(gn(1));
    d.sV = N(gn(lvl)); d.sR = N(gn(lvl)); d.sD = N(gn(lvl)); d.sC = N(gn(lvl));
    d.sc.connect(d.pre); d.pre.connect(d.out); d.out.connect(G.sum);
    d.fx.connect(G.sum);
    const fv = N(gn(0.25)); d.fx.connect(fv); fv.connect(G.verb.in);
    d.sV.connect(G.verb.in); d.sR.connect(G.room.in); d.sD.connect(G.dly); d.sC.connect(G.cho);
    d.fades = [d.out.gain, d.sV.gain, d.sR.gain, d.sD.gain, d.sC.gain];
    d.level = lvl;
    def.forms.forEach((form) => {
      const chs = [];
      form.tracks.forEach((tk) => {
        const c = { in: N(gn(0)), lvl: 0, lp: null };
        let tail = c.in;
        if (tk.formant) { // "ah": three vowel formants in parallel
          const mix = N(gn(1));
          for (const [f, q, a] of [[680, 5, 1], [1150, 7, 0.55], [2750, 8, 0.2]]) {
            const b = N(bq("bandpass", f, q)), bg = N(gn(a * 2.2));
            tail.connect(b); b.connect(bg); bg.connect(mix);
          }
          tail = mix;
        }
        if (tk.lp) { c.lp = N(bq("lowpass", tk.lp, 0.6)); tail.connect(c.lp); tail = c.lp; }
        if (tk.trem) { // bowed tremolo: one LFO on the strip
          const tg = N(gn(0.55)), l = ac.createOscillator(), lg = N(gn(0.45));
          l.type = "triangle"; l.frequency.value = def.bpm / 60 * 8;
          l.connect(lg); lg.connect(tg.gain); l.start(Math.max(t0 - 0.1, ac.currentTime));
          d.srcs.push(l); d.nodes.push(l); loops++;
          tail.connect(tg); tail = tg;
        }
        const p = N(ac.createStereoPanner());
        p.pan.value = tk.pan || 0;
        tail.connect(p);
        p.connect(tk.sc ? d.sc : d.pre);
        const snd = (amt, to) => { if (amt) { const s = N(gn(amt)); p.connect(s); s.connect(to); } };
        snd(tk.verb, d.sV); snd(tk.room, d.sR); snd(tk.dly, d.sD); snd(tk.cho, d.sC);
        chs.push(c);
      });
      d.ch.push(chs);
    });
    if (def.vinyl) { // the soft surface noise of an old record
      const s = ac.createBufferSource(), f = N(bq("bandpass", 2400, 0.4)), vg = N(gn(def.vinyl));
      s.buffer = bus.pink; s.loop = true;
      s.connect(f); f.connect(vg); vg.connect(d.pre);
      s.start(Math.max(t0, ac.currentTime));
      d.srcs.push(s); d.nodes.push(s); loops++;
    }
    applyLayers(d, Math.max(t0 - 0.05, ac.currentTime), 0.001);
    return d;
  }

  function applyLayers(d, t, tc) {
    d.appliedI = intensity;
    for (let f = 0; f < d.ch.length; f++) {
      const tks = d.def.forms[f].tracks;
      for (let i = 0; i < tks.length; i++) {
        const c = d.ch[f][i], l = layerLevel(d.def.layers, tks[i].L, intensity);
        if (Math.abs(l - c.lvl) < 0.002 && tc > 0.01) continue;
        c.lvl = l;
        c.in.gain.setTargetAtTime(tks[i].g * l, t, tc);
      }
    }
  }

  // equal-power fade on the deck output and its sends. shape: "in" | "out" | "lin"
  const fadeShape = (shape, x) => (shape === "in" ? Math.sin((x * Math.PI) / 2) : shape === "out" ? 1 - Math.cos((x * Math.PI) / 2) : x);
  function levelAt(d, t) {
    if (!d.fd || t >= d.ft + d.fd) return d.level;
    if (t <= d.ft) return d.f0;
    return d.f0 + (d.level - d.f0) * fadeShape(d.fsh, (t - d.ft) / d.fd);
  }
  function hold(p, t) { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t); }
  function fadeDeck(d, to, t, dur, shape) {
    const from = levelAt(d, t);
    d.f0 = from; d.ft = t; d.fd = Math.max(dur, 0.012); d.fsh = dur < 0.03 ? "lin" : shape;
    d.level = to;
    for (const p of d.fades) {
      hold(p, t);
      p.setValueAtTime(from, t);
      if (dur < 0.03) { p.linearRampToValueAtTime(to, t + Math.max(dur, 0.012)); continue; }
      for (let i = 1; i <= 8; i++) {
        const x = i / 8;
        p.linearRampToValueAtTime(from + (to - from) * fadeShape(shape, x), t + dur * x);
      }
    }
  }
  function retire(d, endAt, disposeAt) {
    d.endAt = Math.min(d.endAt, endAt);
    d.disposeAt = disposeAt;
    if (old.indexOf(d) < 0) old.push(d);
  }
  function killDeck(d, now) {
    for (const p of d.fades.concat([d.fx.gain])) { hold(p, now); p.setTargetAtTime(0, now, 0.025); }
    d.level = 0; d.fd = 0;
    retire(d, now, now + 0.4);
  }
  function dispose(d) {
    loops -= d.srcs.length;
    for (const s of d.srcs) { try { s.stop(); } catch (e) { /* not started */ } }
    for (const n of d.nodes) { try { n.disconnect(); } catch (e) { /* gone */ } }
    d.nodes.length = 0; d.srcs.length = 0;
  }

  // ------------------------------------------------------------------------------------------ scheduler

  function barStart(d, bar, t) {
    const def = d.def, barLen = d.sl * 16;
    if (d.phasePending !== null) {
      d.phase = d.phasePending; d.phasePending = null; d.formOff = bar;
      impact(d.fx, t, 0.4); DRUM.crash(d, d.fx, t, 0.16); DRUM.anvil(d, d.fx, t, 0.1);
    }
    if (def.pickForm) {
      const rel = bar - d.formOff, want = def.pickForm(d.formIdx, intensity);
      if (want !== d.formIdx) {
        if (rel % 4 === 0) { d.formIdx = want; d.formOff = bar; impact(d.fx, t, 0.3); DRUM.crash(d, d.fx, t, 0.14); }
        else if (rel % 4 === 3) { riser(d.fx, t, barLen, 0.1); roll(d.fx, t + barLen / 2, barLen / 2, 0.16, false); }
      }
    }
    const form = def.forms[d.formIdx], rel = bar - d.formOff;
    d.fb = rel % form.c.bars; d.cyc = Math.floor(rel / form.c.bars);
    const tr = def.lift ? def.lift(d, rel) : 0;
    if (tr !== d.tr) { d.tr = tr; impact(d.fx, t, 0.4); DRUM.crash(d, d.fx, t, 0.16); }
    const tks = form.tracks, chs = d.ch[d.formIdx];
    for (let i = 0; i < tks.length; i++) {
      const tk = tks[i];
      d.gate[i] = (!tk.ph || tk.ph.indexOf(d.phase) >= 0) && (!tk.when || tk.when(d.fb, d.cyc, intensity));
      if (tk.lpI && chs[i].lp) {
        const breathe = 1 + 0.12 * Math.sin(bar * 0.9);
        chs[i].lp.frequency.setTargetAtTime((tk.lpI[0] + (tk.lpI[1] - tk.lpI[0]) * intensity) * breathe, t, 0.7);
      }
    }
  }

  function fireStep(d, step, t) {
    const s16 = step & 15, bar = step >> 4;
    if (s16 === 0) barStart(d, bar, t);
    const form = d.def.forms[d.formIdx];
    const evs = form.c.steps[d.fb * 16 + s16];
    if (!evs.length) return;
    const tks = form.tracks, chs = d.ch[d.formIdx];
    const sw = s16 & 1 ? d.def.swing * d.sl : 0;
    fillLim = d.def.hot ? LIM_FILL_HOT : LIM_FILL;
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i], tk = tks[ev.k], c = chs[ev.k];
      if (!d.gate[ev.k] || c.lvl < 0.02) continue;
      const v = ev.v * (0.9 + 0.2 * d.rng());
      const tt = t + sw + ev.off * d.sl;
      if (tk.type === "drum") DRUM[tk.inst](d, c.in, tt, v, ev.c, tk, ev);
      else INST[tk.inst](c.in, tt + (tk.type === "mel" ? 0 : 0.004 * d.rng()), mtof(ev.n + d.tr), ev.d * d.sl * (tk.len || 0.97), v, tk);
    }
  }

  function schedule(d, now) {
    const horizon = now + clamp(d.spb, 0.25, 1.05);
    // after a stall (hidden tab, long frame) drop what is already in the past and stay on the grid
    const behind = Math.ceil((now - 0.02 - d.t0) / d.sl);
    if (behind > d.step) {
      const b0 = d.step >> 4, b1 = behind >> 4;
      d.step = behind;
      if (b1 !== b0 || !d.started) { if (behind & 15) barStart(d, b1, now); }
    }
    for (;;) {
      const ts = d.t0 + d.step * d.sl;
      if (ts >= horizon || ts >= d.endAt - 1e-4) break;
      d.started = true;
      fireStep(d, d.step, ts);
      d.step++;
    }
  }

  // ------------------------------------------------------------------------------------------ transport

  function sync(now) {
    if (pendName !== null && now >= switchAt) {
      state = pendName; pendName = null;
      if (cur && cur !== nxt) retire(cur, switchAt, switchAt + 5);
      cur = nxt; nxt = null;
      lastBeat = -1;
    }
  }
  const tnow = () => (bus ? ac.currentTime : wall());
  function clock() { // seconds since bar 1 beat 1 of the current state
    if (state === "none") return 0;
    if (!bus) return wall() - wallT0;
    return cur ? Math.max(0, ac.currentTime - cur.t0) : 0;
  }
  const curBpm = () => MUSIC_STATES[state].bpm;

  function keyOf() {
    const d = cur;
    if (!d) return { root: 62, minor: false, scale: SC.major, spb: 60 / 90, calm: true };
    const f = d.def.forms[d.formIdx];
    return { root: f.root + d.tr, minor: f.scale === "minor" || f.scale === "dorian" || f.scale === "phryg", scale: SC[f.scale], spb: d.spb, calm: !d.def.hot };
  }
  function nextGrid(q) { // audio time of the next beat ("beat"), bar ("bar"), 16th ("now") of the current deck
    const now = ac.currentTime;
    if (!cur || now < cur.t0) return now + 0.06;
    const len = q === "bar" ? cur.sl * 16 : q === "beat" ? cur.sl * 4 : cur.sl;
    return cur.t0 + Math.ceil((now + 0.05 - cur.t0) / len) * len;
  }
  function bedDuck(t, len, amt) {
    const p = G.bed.gain;
    p.cancelScheduledValues(t);
    p.setTargetAtTime(amt, t, 0.04);
    p.setTargetAtTime(1, t + len, 0.3);
  }

  function plan(name, at, fadeBars) {
    const now = ac.currentTime;
    sync(now);
    if (nxt) { killDeck(nxt, now); nxt = null; }
    pendName = null;
    if (cur && cur.endAt < Infinity) { // a fade-out to "none" was in progress: let it go
      retire(cur, cur.endAt, cur.endAt + 1);
      cur = null; state = "none";
    }
    const def = DEFS[name];
    if (!cur) { // from silence: start on the spot
      if (!def) { state = "none"; return; }
      const t0 = now + 0.06;
      cur = makeDeck(name, t0, def.hot || at === "now" ? 1 : 0);
      if (cur.level === 0) fadeDeck(cur, 1, t0, 0.35, "in");
      else if (def.hot) { DRUM.crash(cur, cur.fx, t0, 0.12); }
      setDelay(cur, t0);
      state = name; lastBeat = -1; peakI = intensity; peakT = now;
      return;
    }
    const oldDeck = cur, oldBar = oldDeck.sl * 16;
    const T1 = nextGrid(at === "now" ? "now" : at === "beat" ? "beat" : "bar");
    const cut = at === "now";
    let tl = cut ? 0 : Math.max(0.25, fadeBars) * oldBar;
    while (tl > 3.2) tl /= 2;
    const wasHot = (oldDeck.name === "combat" || oldDeck.name === "boss") && (intensity >= 0.5 || (peakI >= 0.5 && now - peakT < 8));
    if (!def) { // -> silence, on the grid
      fadeDeck(oldDeck, 0, T1, Math.max(tl, 0.06), "out");
      oldDeck.endAt = T1 + Math.max(tl, 0.06);
      nxt = null; pendName = "none"; switchAt = oldDeck.endAt;
      return;
    }
    const victory = wasHot && def.calm && !cut;
    if (victory) tl = Math.max(tl, 1.7);
    const T2 = T1 + tl;
    fadeDeck(oldDeck, 0, T1, Math.max(tl, 0.05), "out");
    oldDeck.endAt = T2;
    const d = makeDeck(name, T2, def.hot || cut ? 1 : 0);
    const k = { root: def.forms[d.formIdx].root };
    if (def.hot) {
      if (!cut) {
        riser(d.fx, T1, tl, 0.13);
        roll(d.fx, T1 + tl * 0.5, tl * 0.5, 0.2, name === "boss");
        chord("pad", d.fx, T1, [k.root - 12, k.root - 5, k.root], tl, 0.1, { swell: 1, fat: 1 });
      }
      impact(d.fx, T2, cut ? 0.3 : 0.42);
      DRUM.crash(d, d.fx, T2, 0.15);
    } else if (!cut) {
      if (victory) { playStinger("victory", T1, keyOf()); lastSting.victory = now; }
      else ring(d.fx, T1, k.root, def.forms[d.formIdx].scale, tl);
      const nb = Math.min(4, Math.max(0.4, fadeBars * d.sl * 16));
      fadeDeck(d, 1, T2, nb, "in");
    }
    setDelay(d, T2);
    nxt = d; pendName = name; switchAt = T2;
  }
  function setDelay(d, t) {
    const dt = clamp(d.spb * 0.75, 0.15, 1.4);
    G.dL.delayTime.setTargetAtTime(dt, t, 0.05);
    G.dR.delayTime.setTargetAtTime(dt, t, 0.05);
  }
  // the ringing chord that opens a calm state: tonic, fifth, ninth, third - let it hang in the room
  function ring(dest, t, root, scaleName, dur) {
    const sc = SC[scaleName], third = root + sc[2];
    const ns = [root - 12, root - 5, root + 2, third, root + 7, root + 14];
    for (let i = 0; i < ns.length; i++) INST.harp(dest, t + i * 0.055, mtof(ns[i]), 1, 0.11 - i * 0.008, {});
    INST.bell(dest, t + 0.33, mtof(root + 19), 1, 0.035, {});
    chord("glass", dest, t, [root, root + 7, root + 14], Math.max(dur, 1.2), 0.07, { atk: 0.5, rel: 0.6 });
  }

  // ------------------------------------------------------------------------------------------ stingers, motifs

  function playStinger(name, t, K) { solo = true; try { return stingerNotes(name, t, K); } finally { solo = false; } }
  function playMotif(name, t, K, gain) { solo = true; try { return motifNotes(name, t, K, gain); } finally { solo = false; } }
  function stingerNotes(name, t, K) {
    const d = G.st, R = K.root, f = mtof;
    const B = (n, at, dur, v, k) => INST.brass(d, t + at, f(n), dur, v, k || { fat: 2 });
    const bell = (n, at, v) => INST.bell(d, t + at, f(n), 1, v, {});
    const cel = (n, at, v) => INST.celesta(d, t + at, f(n), 1, v, { dec: 0.36 });
    const tk = (at, v, c) => DRUM.taiko(null, d, t + at, v, c || "a", { f: 74 });
    switch (name) {
      case "victory": { // 1-3-5 (the platypus rises) | bVI | bVII | I
        B(R, 0, 0.13, 0.13); B(R + 4, 0.14, 0.13, 0.13); B(R + 7, 0.28, 0.14, 0.14);
        for (const n of [R - 4, R + 3, R + 8]) B(n, 0.44, 0.42, 0.1, {});
        INST.bass(d, t + 0.44, f(R - 28), 0.42, 0.2, {}); tk(0.44, 0.3);
        for (const n of [R - 2, R + 5, R + 10]) B(n, 0.9, 0.42, 0.11, {});
        INST.bass(d, t + 0.9, f(R - 26), 0.42, 0.2, {}); tk(0.9, 0.3, "b");
        for (const n of [R, R + 7, R + 12]) B(n, 1.36, 1.5, 0.11, {});
        B(R + 16, 1.36, 1.5, 0.08, {});
        INST.bass(d, t + 1.36, f(R - 24), 1.5, 0.24, {}); tk(1.36, 0.36);
        roll(d, t + 1.0, 0.36, 0.1, false);
        DRUM.crash(null, d, t + 1.36, 0.14);
        [12, 16, 19, 24, 28].forEach((n, i) => bell(R + n, 1.4 + i * 0.07, 0.05));
        break;
      }
      case "defeat": { // it falls and lands low
        [7, 6, 5, 3].forEach((n, i) => B(R + n, i * 0.13, 0.13, 0.16 - i * 0.015));
        B(R - 12, 0.52, 0.5, 0.17, { fat: 2, dark: 1 });
        INST.bass(d, t + 0.52, f(R - 24), 0.5, 0.26, {});
        impact(d, t + 0.52, 0.3);
        break;
      }
      case "checkpoint": {
        bell(R + 7, 0, 0.07); bell(R + 12, 0.11, 0.075); bell(R + 19, 0.22, 0.06);
        cel(R + 24, 0.33, 0.04);
        break;
      }
      case "discover": { // a lydian run opening upward
        [0, 4, 6, 7, 11, 14, 18, 19].forEach((n, i) => cel(R + 12 + n, i * 0.085, 0.07 + i * 0.004));
        chord("glass", d, t, [R, R + 4, R + 7, R + 11], 1.5, 0.07, { atk: 0.6, rel: 0.4 });
        bell(R + 31, 0.72, 0.04);
        break;
      }
      case "danger": { // b2 crushing down onto 1, a tritone on top
        B(R - 23, 0, 0.26, 0.2, { fat: 2, dark: 1 });
        B(R - 24, 0.27, 0.85, 0.22, { fat: 2 });
        B(R - 6, 0.27, 0.85, 0.09, {});
        INST.strings(d, t, f(R + 12), 1.1, 0.05, { atk: 0.02 }); INST.strings(d, t, f(R + 13), 1.1, 0.045, { atk: 0.02 });
        DRUM.snare(null, d, t, 0.22); tk(0.27, 0.38); impact(d, t + 0.27, 0.28);
        break;
      }
      case "transform": { // whole-tone shimmer upward, then it settles in major
        for (let i = 0; i < 13; i++) INST.harp(d, t + i * 0.068, f(R + i * 2), 0.5, 0.05 + i * 0.005, { dec: 0.14 });
        riser(d, t, 0.95, 0.07);
        for (const n of [R, R + 7, R + 12, R + 16]) INST.glass(d, t + 0.98, f(n), 1.3, 0.085, { atk: 0.04, rel: 0.4 });
        [12, 19, 24, 28].forEach((n, i) => bell(R + n, 0.98 + i * 0.07, 0.055));
        DRUM.crash(null, d, t + 0.98, 0.07);
        break;
      }
      case "phase": {
        roll(d, t, 0.5, 0.36, true);
        riser(d, t, 0.5, 0.09);
        impact(d, t + 0.5, 0.42); DRUM.anvil(null, d, t + 0.5, 0.12); DRUM.crash(null, d, t + 0.5, 0.16);
        for (const n of [R - 23, R - 11, R - 4]) B(n, 0.5, 0.42, 0.14, { fat: 0 });
        DRUM.anvil(null, d, t + 0.96, 0.1); tk(0.96, 0.4);
        B(R - 24, 0.96, 1.1, 0.2, { fat: 2 }); B(R - 12, 0.96, 1.1, 0.12, {}); B(R - 5, 0.96, 1.1, 0.1, {});
        break;
      }
      case "gear": {
        DRUM.anvil(null, d, t, 0.09); DRUM.anvil(null, d, t + 0.15, 0.06);
        (K.minor ? [0, 3, 5, 7, 10, 12] : [0, 2, 4, 7, 9, 12]).forEach((n, i) => INST.pluck(d, t + 0.3 + i * 0.075, f(R + 12 + n), 0.3, 0.09, { bright: 1 }));
        bell(R + 24, 0.78, 0.055); bell(R + 19, 0.78, 0.04);
        B(R - 12, 0.78, 0.5, 0.1, { fat: 2 });
        break;
      }
      case "armyUp": { // a little horn call: the army answers
        roll(d, t, 0.28, 0.16, false);
        B(R, 0.3, 0.12, 0.14); B(R, 0.45, 0.12, 0.14); B(R + 7, 0.6, 0.26, 0.15); B(R + 12, 0.9, 0.5, 0.15);
        B(R + 7, 0.9, 0.5, 0.09, {}); B(R + (K.minor ? 3 : 4), 0.9, 0.5, 0.07, {});
        tk(0.3, 0.26); tk(0.6, 0.26); tk(0.9, 0.36, "b");
        break;
      }
      default: return 0;
    }
    return STINGER_LEN[name];
  }

  function motifNotes(name, t, K, gain) {
    const d = G.st, beat = K.spb, g = gain;
    const line = (str, scale, oct, unit, fn) => {
      const bars = parseBars(str);
      let pos = 0, last = null;
      const notes = [];
      for (const toks of bars) for (const tok of toks) {
        if (tok === ".") { if (last) last.d += unit; }
        else if (tok === "-") last = null;
        else { last = { t: pos, d: unit, n: oct + degSemis(tok, scale, 0) }; notes.push(last); }
        pos += unit;
      }
      for (const n of notes) fn(n);
      return pos;
    };
    switch (name) {
      case "platypus": {
        const sc = K.minor ? SC.minor : SC.major;
        return line(PLATY, sc, K.root, beat, (n) => {
          if (K.calm) {
            INST.harp(d, t + n.t, mtof(n.n + 12), n.d, 0.12 * g, {});
            INST.flute(d, t + n.t, mtof(n.n), n.d * 0.96, 0.07 * g, {});
          } else {
            INST.lead(d, t + n.t, mtof(n.n), n.d * 0.96, 0.15 * g, {});
            INST.brass(d, t + n.t, mtof(n.n - 12), n.d * 0.9, 0.08 * g, {});
          }
        });
      }
      case "pip":
        return line(PIP, K.minor ? SC.minor : SC.major, K.root + 12, beat, (n) => {
          INST.box(d, t + n.t, mtof(n.n), n.d, 0.16 * g, { wow: 1 });
        });
      case "pipSad": { // relative minor, half speed; the last note sinks a step (to the flat second) and is left hanging
        const root = K.minor ? K.root : K.root - 3;
        return line("5 3' 2' 1' | 6 5 3 . | 4 6 5 3 | 2 . b2 .", SC.minor, root + 12, beat * 2, (n) => {
          INST.box(d, t + n.t, mtof(n.n), n.d, 0.15 * g, { wow: 1 });
          INST.glass(d, t + n.t, mtof(n.n - 12), n.d, 0.035 * g, { atk: 0.3, rel: 0.6 });
        }) + 1.5;
      }
      case "wobble": { // the pitches and timing of audio.wizardMotif(): 1 3 5 #4 2 ... 5 1' (lydian)
        const R = K.root + 12;
        const ns = [[0, 0], [0.19, 4], [0.38, 7], [0.66, 6], [0.85, 2], [1.15, 7], [1.75, 12]];
        for (let i = 0; i < ns.length; i++) {
          const last = i >= ns.length - 2;
          INST.celesta(d, t + ns[i][0], mtof(R + ns[i][1]), 1, 0.12 * g, { dec: last ? 0.55 : 0.3 });
          if (last) INST.bell(d, t + ns[i][0], mtof(R + ns[i][1] + 12), 1, 0.035 * g, {});
        }
        chord("glass", d, t, [K.root - 12, K.root - 5, K.root + 4], 2.3, 0.05 * g, { atk: 0.5, rel: 0.5 });
        return 3.0;
      }
      case "king": {
        const len = line(KING, SC.major, K.root - 24, beat, (n) => {
          INST.brass(d, t + n.t, mtof(n.n), n.d * 0.92, 0.2 * g, { fat: 2, dark: 1 });
          INST.brass(d, t + n.t, mtof(n.n + 12), n.d * 0.92, 0.07 * g, { dark: 1 });
          DRUM.taiko(null, d, t + n.t, 0.22 * g, "a", { f: 62 });
        });
        return len - beat * 4;
      }
      default: return 0;
    }
  }

  // ------------------------------------------------------------------------------------------ public API

  function startPendingAudio() {
    // the bus has just appeared: begin the remembered state for real (the beat clock re-bases to the audio clock)
    const s = state;
    state = "none"; cur = null; nxt = null; pendName = null;
    if (s !== "none") plan(s, "now", 1);
  }
  function setGains(list, v, t, tc) { for (const p of list) p.setTargetAtTime(v, t, tc); }
  function duckNow(now) {
    if (now >= duckT1) return duckV;
    return duckFrom + (duckV - duckFrom) * ((now - duckT0) / (duckT1 - duckT0));
  }

  const music = {
    STATES: MUSIC_STATES,
    onBeat: null, // (beatIndex, barIndex, state): fired from update() once per beat
    get state() { if (bus) sync(ac.currentTime); return state; },
    get pending() { if (bus) sync(ac.currentTime); return pendName; },
    get intensity() { return intensity; },
    get phase() { return phase; },
    get bpm() { return curBpm(); },
    get volume() { return volume; },

    play(name, o) {
      if (!(name in MUSIC_STATES)) name = "none";
      o = o || {};
      if (bus) sync(ac.currentTime);
      const target = pendName !== null ? pendName : state;
      const before = intensity;
      if (o.intensity !== undefined) {
        const v = clamp(+o.intensity || 0, 0, 1);
        if (name === target) { music.setIntensity(v); return; }
        intensity = iTarget = v; iRate = 0;
      }
      if (name === target) return;
      if (!bus) { // no sound yet: remember it and run the beat clock on wall time
        state = name; pendName = null; phase = 0; wallT0 = wall(); lastBeat = -1;
        return;
      }
      if (before >= 0.5) { peakI = Math.max(peakI, before); peakT = ac.currentTime; }
      phase = 0;
      plan(name, o.at === "now" || o.at === "beat" ? o.at : "bar", o.fade === undefined ? 1 : Math.max(0, +o.fade || 0));
    },

    stop(fadeSeconds) {
      const fs = Math.max(0.03, fadeSeconds === undefined ? 1.5 : +fadeSeconds || 0);
      if (bus) {
        const now = ac.currentTime;
        for (const d of [cur, nxt]) {
          if (!d) continue;
          const lv = levelAt(d, now);
          for (const p of d.fades.concat([d.fx.gain])) {
            hold(p, now); p.setValueAtTime(p === d.fx.gain ? 1 : lv, now); p.linearRampToValueAtTime(0, now + fs);
          }
          d.level = 0; d.fd = 0;
          retire(d, now + fs, now + fs + 0.3);
        }
      }
      cur = nxt = null; state = "none"; pendName = null; lastBeat = -1;
      // a duck never outlives the music it ducked: once the fade is done the next state starts at full level
      if (duckV > 0 || tnow() < duckT1) {
        const t = tnow() + fs;
        duckFrom = duckV = 0; duckT0 = duckT1 = 0;
        if (bus) for (const p of G.ducks) { p.cancelScheduledValues(t); p.setValueAtTime(1, t); }
      }
    },

    setIntensity(v, seconds) {
      iTarget = clamp(+v || 0, 0, 1);
      const s = seconds === undefined ? 1.5 : Math.max(0, +seconds || 0);
      if (s <= 0.02) { intensity = iTarget; iRate = 0; } else iRate = Math.abs(iTarget - intensity) / s;
    },

    setPhase(n) {
      n = clamp(n | 0, 0, 2);
      if (n === phase) return;
      phase = n;
      if (!bus) return;
      sync(ac.currentTime);
      for (const d of [cur, nxt]) {
        if (!d || d.name !== "boss") continue;
        if (d === nxt || !d.started) { d.phase = n; continue; }
        d.phasePending = n;
        // the fill: from the next 16th up to the bar line where the orchestration changes
        const tBar = d.t0 + Math.ceil(d.step / 16) * 16 * d.sl, tFill = d.t0 + d.step * d.sl;
        if (tBar - tFill >= 0.3) { roll(d.fx, tFill, tBar - tFill, 0.3, true); riser(d.fx, tFill, tBar - tFill, 0.1); }
      }
    },

    motif(name, o) {
      if (!bus) return 0;
      o = o || {};
      sync(ac.currentTime);
      const t = o.at === "now" ? ac.currentTime + 0.03 : nextGrid(o.at === "bar" ? "bar" : "beat");
      const len = playMotif(name, t, keyOf(), o.gain === undefined ? 1 : Math.max(0, +o.gain || 0));
      if (len > 0) bedDuck(t, len, 0.708);
      return len > 0 ? t - ac.currentTime + len : 0;
    },

    stinger(name) {
      const len = STINGER_LEN[name];
      if (!len) return 0;
      if (!bus) return len;
      const now = ac.currentTime;
      sync(now);
      const guard = name === "victory" ? 5 : 0.4;
      if (lastSting[name] !== undefined && now - lastSting[name] < guard && now >= lastSting[name]) return len;
      const t = name === "defeat" ? now + 0.02 : Math.min(nextGrid("beat"), now + 0.6);
      lastSting[name] = now;
      playStinger(name, t, keyOf());
      bedDuck(t, len, name === "defeat" ? 0.25 : 0.708);
      return t - now + len;
    },

    duck(amount, seconds) {
      const a = clamp(+amount || 0, 0, 1), s = Math.max(0.01, +seconds || 0);
      const now = tnow();
      duckFrom = duckNow(now); duckV = a; duckT0 = now; duckT1 = now + s;
      if (!bus) return;
      for (const p of G.ducks) { p.cancelScheduledValues(now); p.setValueAtTime(1 - duckFrom, now); p.linearRampToValueAtTime(1 - a, now + s); }
    },

    setVolume(v) {
      volume = clamp(+v || 0, 0, 1);
      if (bus) setGains(G.vols, volume, ac.currentTime, 0.03);
    },

    time() { if (bus) sync(ac.currentTime); return clock(); },
    beat() { const b = curBpm(); return b ? (music.time() * b) / 60 : 0; },
    bar() { return Math.floor(music.beat() / 4); },
    beatPhase() { const b = music.beat(); return b - Math.floor(b); },
    nextBeatIn() { const b = curBpm(); return b ? ((1 - music.beatPhase()) * 60) / b : 0; },

    update(dt) {
      if (!bus) {
        bus = (audio && audio.musicBus && audio.musicBus()) || null;
        if (bus) { init(); startPendingAudio(); }
      }
      // intensity glide (real time)
      if (intensity !== iTarget) {
        const step = iRate * (dt > 0 ? Math.min(dt, 0.25) : 0.016);
        intensity = Math.abs(iTarget - intensity) <= step || iRate === 0 ? iTarget : intensity + Math.sign(iTarget - intensity) * step;
      }
      if (bus) {
        const now = ac.currentTime;
        sync(now);
        if ((state === "combat" || state === "boss") && intensity >= 0.5) { peakI = intensity; peakT = now; }
        // drop finished voices from the ledger
        let w = 0;
        for (let i = 0; i < vs.length; i += 2) if (vs[i + 1] > now) { vs[w++] = vs[i]; vs[w++] = vs[i + 1]; }
        vs.length = w;
        if (cur) { if (Math.abs(intensity - cur.appliedI) > 0.004) applyLayers(cur, now, 0.12); schedule(cur, now); }
        if (nxt) { if (Math.abs(intensity - nxt.appliedI) > 0.004) applyLayers(nxt, now, 0.12); schedule(nxt, now); }
        for (let i = old.length - 1; i >= 0; i--) {
          const d = old[i];
          if (now >= d.disposeAt) { dispose(d); old.splice(i, 1); } else if (now < d.endAt) schedule(d, now);
        }
      }
      // safety net: a full duck that nobody released (a level forgot, or was left mid-scream) fades back by itself
      if (duckV >= 0.99 && state !== "none" && tnow() > duckT1 + DUCK_MAX) music.duck(0, 1.5);
      const bpm = curBpm();
      if (bpm) {
        const b = Math.floor((clock() * bpm) / 60);
        if (b > lastBeat) {
          const from = Math.max(lastBeat + 1, b - 3);
          lastBeat = b;
          if (music.onBeat) for (let i = from; i <= b; i++) music.onBeat(i, i >> 2, state);
        }
      }
    },
  };
  return music;
}
