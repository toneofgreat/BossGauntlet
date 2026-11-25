// compose/lib.mjs - Node-only helpers MUSIC_A uses to write the area songs. The game never imports this folder:
// `node src/audio/compose/build.mjs` regenerates src/audio/songs/area1.js, area2.js, area3.js (pure data).
import { noteToMidi } from "../format.js";
import fs from "node:fs";

export const SPB = 16;
const PC = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
const r3 = (x) => Math.round(x * 1000) / 1000;

// ---- melody text: "F#5:3 E5:1 -:2 [A4,D5]:4:0.6 D5:2>"  (pitch:dur[:vel], '-' = rest, '>' suffix = accent)
export function mel(str, { vel = 0.8, start = 0, bars, legato = 1 } = {}) {
  const notes = [];
  let t = start;
  for (const tok of str.trim().split(/\s+/)) {
    if (!tok || tok === "|") continue;
    let acc = false, s = tok;
    if (s.endsWith(">")) { acc = true; s = s.slice(0, -1); }
    const parts = s.startsWith("[") ? [s.slice(1, s.indexOf("]")), ...s.slice(s.indexOf("]") + 2).split(":")] : s.split(":");
    const [p, d, v] = parts;
    const dur = parseFloat(d);
    if (!(dur > 0)) throw new Error("bad token " + tok);
    if (p !== "-") {
      const pitch = p.includes(",") ? p.split(",") : p;
      for (const q of Array.isArray(pitch) ? pitch : [pitch]) if (!(noteToMidi(q) >= 0)) throw new Error("bad pitch " + tok);
      let ve = v ? parseFloat(v) : vel;
      if (acc) ve = Math.min(1, ve + 0.12);
      notes.push([r3(t), pitch, r3(dur * legato), r3(ve)]);
    }
    t += dur;
  }
  if (bars && Math.abs(t - start - bars * SPB) > 1e-6) throw new Error(`melody length ${t - start} != ${bars * SPB}: ${str.slice(0, 60)}`);
  return notes;
}
export function melBars(lines, o = {}) { // array of one-bar strings, validated per bar
  const out = [];
  lines.forEach((l, i) => out.push(...mel(l, { ...o, start: i * SPB, bars: 1 })));
  return out;
}

// ---- chords: "Em" "D/F#" "A7" "Bm7" "Gsus4" "Cmaj7" "Asus2" "Cadd9" "F#m" "Bb" "Edim" "E5"
export function chord(sym) {
  const [main, slash] = sym.split("/");
  const m = /^([A-G][#b]?)(.*)$/.exec(main);
  if (!m) throw new Error("bad chord " + sym);
  const root = PC[m[1]], q = m[2];
  let iv;
  if (q === "" ) iv = [0, 4, 7];
  else if (q === "m") iv = [0, 3, 7];
  else if (q === "7") iv = [0, 4, 7, 10];
  else if (q === "m7") iv = [0, 3, 7, 10];
  else if (q === "maj7") iv = [0, 4, 7, 11];
  else if (q === "sus4") iv = [0, 5, 7];
  else if (q === "sus2") iv = [0, 2, 7];
  else if (q === "add9") iv = [0, 4, 7, 14];
  else if (q === "madd9") iv = [0, 3, 7, 14];
  else if (q === "dim") iv = [0, 3, 6];
  else if (q === "5") iv = [0, 7];
  else if (q === "m6") iv = [0, 3, 7, 9];
  else if (q === "6") iv = [0, 4, 7, 9];
  else throw new Error("unknown chord quality " + sym);
  const pcs = iv.map((x) => (root + x) % 12);
  return { sym, root, pcs, bass: slash ? PC[slash] : root };
}
// expand a progression (one entry per bar; "C D" = two chords in that bar) into [{bar, step, len, ch}]
export function prog(list) {
  const out = [];
  list.forEach((entry, bar) => {
    const parts = entry.trim().split(/\s+/), len = SPB / parts.length;
    parts.forEach((sym, i) => out.push({ bar, step: bar * SPB + i * len, len, ch: chord(sym) }));
  });
  return out;
}
const tonesIn = (pcs, lo, hi) => { const r = []; for (let m = lo; m <= hi; m++) if (pcs.includes(m % 12)) r.push(m); return r; };
// smooth voice leading: each chord gets n notes inside [lo, hi] close to the previous voicing
export function voiceLead(P, n, lo, hi) {
  let prev = null;
  return P.map((c) => {
    const t = tonesIn(c.ch.pcs, lo, hi);
    let best = null, bs = Infinity;
    for (let i = 0; i + n <= t.length; i++) {
      const v = t.slice(i, i + n);
      // must contain the root or the third
      const cover = new Set(v.map((x) => x % 12));
      if (c.ch.pcs.length >= 3 && !cover.has(c.ch.pcs[1]) && n >= 2) continue;
      const span = v[n - 1] - v[0];
      const s = prev ? v.reduce((a, x, k) => a + Math.abs(x - prev[k]), 0) : Math.abs((v[0] + v[n - 1]) / 2 - (lo + hi) / 2);
      const sc = s + (span > 16 ? 4 : 0);
      if (sc < bs) { bs = sc; best = v; }
    }
    if (!best) best = t.slice(0, n);
    prev = best;
    return { ...c, v: best };
  });
}

// ---- pattern builders (all return note arrays; steps are absolute inside the pattern)
export function pad(P, { n = 3, lo = 52, hi = 72, vel = 0.6, hold = 1 } = {}) {
  return voiceLead(P, n, lo, hi).map((c) => [c.step, c.v, c.len * hold, vel]);
}
// rhythm = [[step, degree, dur, vel?], ...] per chord-span (repeats if the chord is longer); degree: R 3 5 8 b7 A (approach)
export function bassLine(P, rhythm, { lo = 36, vel = 0.8 } = {}) {
  const out = [];
  P.forEach((c, i) => {
    const nxt = P[i + 1] || P[0];
    const root = lo + ((c.ch.bass - lo) % 12 + 12) % 12;
    const rlen = Math.max(...rhythm.map((r) => r[0])) < 8 ? 8 : 16;
    for (let off = 0; off < c.len; off += rlen) for (const [st, deg, du, ve] of rhythm) {
      if (off + st >= c.len) continue;
      // root = the bass note (slash bass if any); other degrees are chord tones placed just above it
      const above = (pc) => root + ((pc - c.ch.bass) % 12 + 12) % 12;
      let m;
      if (deg === "R") m = root;
      else if (deg === "8") m = root + 12;
      else if (deg === "5") m = above(c.ch.pcs[2] ?? c.ch.pcs[1]);
      else if (deg === "3") m = above(c.ch.pcs[1]);
      else if (deg === "-5") m = above(c.ch.pcs[2] ?? c.ch.pcs[1]) - 12;
      else if (deg === "b7") m = above((c.ch.root + 10) % 12);
      else if (deg === "A") { const nr = lo + ((nxt.ch.bass - lo) % 12 + 12) % 12; m = nr + (nr > root ? -1 : 1); if (Math.abs(m - root) > 7) m = nr - 1; }
      else m = root;
      if (m < lo - 5) m += 12;
      out.push([c.step + off + st, m, du, ve ?? vel]);
    }
  });
  return out;
}
// arpeggio: seq = indices into the voiced chord extended by octaves; one index per `every` steps
export function arp(P, seq, { n = 3, lo = 55, hi = 76, every = 2, dur = 2, vel = 0.6, accent = [] } = {}) {
  const out = [];
  voiceLead(P, n, lo, hi).forEach((c) => {
    for (let k = 0, s = 0; s < c.len; s += every, k++) {
      const idx = seq[k % seq.length];
      if (idx === null) continue;
      const oct = Math.floor(idx / n), m = c.v[((idx % n) + n) % n] + 12 * oct;
      const ve = accent.includes(k % seq.length) ? Math.min(1, vel + 0.15) : vel;
      out.push([c.step + s, m, dur, ve]);
    }
  });
  return out;
}
// guitar strum: rhythm string per bar ("D.DU.UDU" in 8ths when len 8, or 16 chars), D = down (low->high), U = up
export function strum(P, rhythm, { n = 4, lo = 45, hi = 69, spread = 0.12, vel = 0.65, dur = 4 } = {}) {
  const out = [], stepLen = SPB / rhythm.length;
  voiceLead(P, n, lo, hi).forEach((c) => {
    for (let s = 0; s < c.len; s += stepLen) {
      const ch = rhythm[Math.floor(((c.step + s) % SPB) / stepLen)];
      if (ch !== "D" && ch !== "U" && ch !== "d" && ch !== "u") continue;
      const up = ch === "U" || ch === "u", soft = ch === "d" || ch === "u";
      const notes = up ? c.v.slice(1).reverse() : c.v;
      notes.forEach((m, i) => out.push([r3(c.step + s + i * spread), m, dur, r3((soft ? vel * 0.6 : vel) * (up ? 0.75 : 1) * (1 - i * 0.04))]));
    }
  });
  return out;
}
// drum grid: one char per step ('x' 0.95, 'X' 1, 'o' 0.65, 'g' ghost 0.3, '.' rest); spaces and '|' ignored
export function grid(str, { vel = 1, pitch = "C4", rollTo } = {}) {
  const s = str.replace(/[\s|]/g, ""), out = [];
  const V = { X: 1, x: 0.9, o: 0.65, g: 0.3, h: 0.45 };
  for (let i = 0; i < s.length; i++) if (V[s[i]] !== undefined) {
    let v = V[s[i]] * vel;
    if (rollTo !== undefined) v = v * (0.35 + (rollTo - 0.35) * (i / s.length));
    out.push([i, pitch, 1, r3(Math.min(1, v))]);
  }
  return out;
}
// tuned hand drums: str chars map to pitches: 'l' low 'm' mid 'h' high
export function hand(str, pitches, vel = 0.8) {
  const s = str.replace(/[\s|]/g, ""), out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (pitches[c.toLowerCase()]) out.push([i, pitches[c.toLowerCase()], 1, c === c.toUpperCase() ? Math.min(1, vel + 0.15) : vel * 0.75]);
  }
  return out;
}
// diatonic shift of a melody inside `scale` (array of pitch classes): degrees -2 = a third below
export function diatonic(notes, scale, degrees, { vel = 1 } = {}) {
  return notes.map(([st, p, du, ve]) => {
    const shift = (q) => {
      const m = noteToMidi(q);
      let pc = m % 12, idx = scale.indexOf(pc);
      if (idx < 0) return m + Math.round(degrees * 1.75); // chromatic note: approximate the interval
      let oct = Math.floor(m / 12), j = idx + degrees;
      while (j < 0) { j += scale.length; oct--; }
      while (j >= scale.length) { j -= scale.length; oct++; }
      let out = oct * 12 + scale[j];
      return out;
    };
    const np = Array.isArray(p) ? p.map(shift) : shift(p);
    return [st, np, du, r3(ve * vel)];
  });
}
// harmony line under a melody: the diatonic interval below (default a third) unless that clashes with the chord
// (semitone/tritone against a chord tone) - then the nearest chord tone at least minBelow semitones under the melody
export function harmony(notes, P, sc, { degrees = -2, minBelow = 3 } = {}) {
  const diat = diatonic(notes, sc, degrees);
  return notes.map((n, i) => {
    const c = P.find((x) => x.step <= n[0] && n[0] < x.step + x.len) || P[P.length - 1];
    const fix = (mq, hq) => {
      const m = noteToMidi(mq), h = noteToMidi(hq), pcs = c.ch.pcs;
      const clash = !pcs.includes(h % 12) && pcs.some((pc) => { const d = ((h - pc) % 12 + 12) % 12; return d === 1 || d === 11 || d === 6; });
      if (!clash || n[2] < 2) return h;
      for (let x = m - minBelow; x > m - 12; x--) if (pcs.includes(x % 12)) return x;
      return h;
    };
    const p = Array.isArray(n[1]) ? n[1].map((q, k) => fix(q, diat[i][1][k])) : fix(n[1], diat[i][1]);
    return [n[0], p, n[2], diat[i][3]];
  });
}
export const shift = (notes, steps) => notes.map(([s, p, d, v]) => [r3(s + steps), p, d, v]);
export const octave = (notes, o) => notes.map(([s, p, d, v]) => [s, Array.isArray(p) ? p.map((q) => noteToMidi(q) + 12 * o) : noteToMidi(p) + 12 * o, d, v]);
export const scaleVel = (notes, k) => notes.map(([s, p, d, v]) => [s, p, d, r3(Math.min(1, v * k))]);
export const cat = (...xs) => xs.flat();
export const scale = (rootName, kind = "major") => {
  const r = PC[rootName], iv = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], harmonic: [0, 2, 3, 5, 7, 8, 11] }[kind];
  return iv.map((x) => (r + x) % 12);
};
export function pat(inst, bars, notes) {
  const len = bars * SPB;
  const ok = notes.filter((n) => n[0] >= 0 && n[0] < len).map(([s, p, d, v]) => [r3(s), p, r3(Math.max(0.05, d)), r3(Math.max(0, Math.min(1, v ?? 0.8)))]);
  ok.sort((a, b) => a[0] - b[0]);
  return { inst, bars, notes: ok };
}

// count the max number of simultaneously sounding notes (rough voice budget check; decays estimated)
export function polyphony(song, tail = { pluck: 1.5, drum: 0.3, fm: 1, synth: 0.3, noise: 0.5 }) {
  const spb = song.stepsPerBar || 16, ss = 60 / song.bpm / 4, ev = [];
  let t0 = 0;
  for (const sn of song.arrangement) {
    const sec = song.sections[sn], len = sec.bars * spb;
    for (const tr of sec.tracks) {
      const pn = typeof tr === "string" ? tr : tr.p, p = song.patterns[pn], inst = song.instruments[p.inst];
      const plen = p.bars * spb;
      for (let off = 0; off < len; off += plen) for (const n of p.notes) {
        if (off + n[0] >= len) continue;
        const k = Array.isArray(n[1]) ? n[1].length : 1;
        const rel = inst.type === "pluck" ? (inst.decay ?? 0.5) * 1.5 : inst.type === "drum" ? 0.3 : (inst.env?.r ?? 0.2) * 1.25 + n[2] * ss;
        const st = (t0 + off + n[0]) * ss;
        for (let j = 0; j < k; j++) { ev.push([st, 1]); ev.push([st + rel, -1]); }
      }
    }
    t0 += len;
  }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let c = 0, m = 0, sum = 0, last = 0;
  for (const [t, d] of ev) { sum += c * (t - last); last = t; c += d; if (c > m) m = c; }
  return { max: m, avg: sum / Math.max(1, last) };
}

export function writeSong(file, song, header) {
  const lines = [];
  lines.push(`// ${header}`);
  lines.push(`// GENERATED by src/audio/compose/build.mjs (MUSIC_A) - edit the composer, not this file.`);
  lines.push("export default {");
  for (const k of ["id", "title", "mood", "bpm", "stepsPerBar", "swing"]) if (song[k] !== undefined) lines.push(`  ${k}: ${JSON.stringify(song[k])},`);
  lines.push(`  master: ${JSON.stringify(song.master)},`);
  lines.push("  instruments: {");
  for (const [n, i] of Object.entries(song.instruments)) lines.push(`    ${n}: ${JSON.stringify(i)},`);
  lines.push("  },");
  lines.push("  patterns: {");
  for (const [n, p] of Object.entries(song.patterns)) lines.push(`    ${n}: { inst: ${JSON.stringify(p.inst)}, bars: ${p.bars}, notes: ${JSON.stringify(p.notes)} },`);
  lines.push("  },");
  lines.push("  sections: {");
  for (const [n, s] of Object.entries(song.sections)) lines.push(`    ${n}: ${JSON.stringify(s)},`);
  lines.push("  },");
  lines.push(`  arrangement: ${JSON.stringify(song.arrangement)},`);
  lines.push(`  loop: ${song.loop || 0},`);
  lines.push("};");
  fs.writeFileSync(file, lines.join("\n") + "\n");
}
