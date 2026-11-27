// AUDIO - voice.js: formant voice synthesis (no samples).
// A glottal-ish source (sawtooth + tilt lowpass + aspiration noise) feeds three parallel bandpass formants whose
// centre frequencies glide between vowel targets. Used for: the girl's child-like singing + humming + sobs, the
// Hollow's distorted speech, Rookie's babble, grunts/shouts/laughs, and dialogue blips.
import { gain, filter, osc, src, noiseBuffer, shaper, mtof, rand, clamp, TINY, perc } from "./synth.js";

// adult formants [F1, F2, F3] and relative gains
export const VOWELS = {
  ah: [[800, 1200, 2700], [1, 0.45, 0.18]],
  a: [[750, 1300, 2600], [1, 0.5, 0.2]],
  uh: [[620, 1150, 2400], [1, 0.4, 0.15]],
  eh: [[520, 1800, 2550], [1, 0.4, 0.2]],
  ee: [[290, 2250, 2950], [1, 0.3, 0.22]],
  ih: [[400, 1950, 2600], [1, 0.35, 0.2]],
  oh: [[480, 820, 2600], [1, 0.4, 0.12]],
  oo: [[330, 860, 2250], [1, 0.3, 0.08]],
  mm: [[260, 1000, 2300], [1, 0.07, 0.03]], // closed-mouth hum (nasal)
  nn: [[280, 1500, 2500], [1, 0.1, 0.05]],
};
const SCALE = { child: 1.28, female: 1.16, male: 0.92, monster: 0.62 };

// one continuous voice. returns a controller with helpers to schedule pitch / vowel / amplitude.
export function createVoice(ac, dest, t0, { f0 = 220, kind = "male", breath = 0.06, vib = 18, vibRate = 5.5, tilt = 2600, sub = 0, ring = 0, dist = 0, end = t0 + 2 } = {}) {
  const sc = SCALE[kind] || 1;
  const amp = gain(ac, 0, dest);
  let post = amp;
  if (dist) { const w = shaper(ac, dist); const g2 = gain(ac, 0.6, amp); w.connect(g2); post = w; }
  const mix = gain(ac, 1);
  const forms = [];
  for (let i = 0; i < 3; i++) {
    const fg = gain(ac, VOWELS.ah[1][i], post);
    const bp = filter(ac, "bandpass", VOWELS.ah[0][i] * sc, 6 + i * 3, fg);
    mix.connect(bp);
    forms.push({ bp, fg });
  }
  // ring modulation (monster): multiply the source by a low sine
  let srcIn = mix;
  if (ring) {
    const rm = gain(ac, 0, mix);
    osc(ac, "sine", ring, t0, end + 0.5, rm.gain);
    const dc = gain(ac, 0.35, mix);
    srcIn = gain(ac, 1);
    srcIn.connect(rm); srcIn.connect(dc);
  }
  const lp = filter(ac, "lowpass", tilt, 0.5, srcIn);
  const o = osc(ac, "sawtooth", f0, t0, end + 0.6, lp);
  let o2 = null;
  if (sub) { const sg = gain(ac, sub, lp); o2 = osc(ac, "sawtooth", f0 / 2, t0, end + 0.6, sg); o2.detune.value = 7; }
  // vibrato + slow drift (jitter)
  const vg = gain(ac, vib);
  osc(ac, "sine", vibRate, t0, end + 0.6, vg);
  vg.connect(o.detune); if (o2) vg.connect(o2.detune);
  const jg = gain(ac, vib * 0.5);
  osc(ac, "triangle", 0.7 + rand(0, 0.5), t0, end + 0.6, jg);
  jg.connect(o.detune);
  // aspiration noise through the formants
  const ng = gain(ac, breath, mix);
  src(ac, noiseBuffer(ac, "pink"), t0, ng, { loop: true, offset: rand(0, 2), dur: end - t0 + 0.6 });
  const v = {
    amp, o, o2, forms, sc, ng,
    pitch(t, f, glide = 0.03) {
      o.frequency.setTargetAtTime(f, t, glide);
      if (o2) o2.frequency.setTargetAtTime(f / 2, t, glide);
    },
    pitchAt(t, f) { o.frequency.setValueAtTime(f, t); if (o2) o2.frequency.setValueAtTime(f / 2, t); },
    vowel(t, name, glide = 0.04) {
      const vw = VOWELS[name] || VOWELS.ah;
      for (let i = 0; i < 3; i++) {
        forms[i].bp.frequency.setTargetAtTime(vw[0][i] * sc, t, glide);
        forms[i].fg.gain.setTargetAtTime(vw[1][i], t, glide);
      }
    },
    level(t, g, tc = 0.03) { amp.gain.setTargetAtTime(g, t, tc); },
    breathAt(t, g, tc = 0.05) { ng.gain.setTargetAtTime(g, t, tc); },
  };
  return v;
}

// Sing a list of notes legato on one voice. notes: [{ t, d, n (midi), vow, vow2?, cons?: "l"|"y"|"m" }]
export function sing(ac, dest, notes, { kind = "child", gainV = 0.32, flat = 0, breath = 0.05, vib = 22, wobble = 0 } = {}) {
  if (!notes.length) return 0;
  const t0 = notes[0].t, last = notes[notes.length - 1], end = last.t + last.d;
  const v = createVoice(ac, dest, t0 - 0.05, { f0: mtof(notes[0].n), kind, breath, vib, vibRate: 5.2, tilt: 3200, end: end + 0.5 });
  v.amp.gain.setValueAtTime(0, t0 - 0.05);
  for (let i = 0; i < notes.length; i++) {
    const nt = notes[i];
    const f = mtof(nt.n + (flat + (wobble ? rand(-wobble, wobble) : 0)) / 100);
    if (i === 0) v.pitchAt(nt.t, f * 0.97);
    v.pitch(nt.t, f, i === 0 ? 0.06 : 0.035);
    // consonant shapes
    if (nt.cons === "l") { v.vowel(nt.t - 0.02, "nn", 0.015); v.level(nt.t - 0.03, gainV * 0.5, 0.02); }
    else if (nt.cons === "y") v.vowel(nt.t - 0.02, "ee", 0.015);
    else if (nt.cons === "m") { v.vowel(nt.t - 0.03, "mm", 0.015); v.level(nt.t - 0.03, gainV * 0.35, 0.02); }
    else if (i > 0 && !nt.legato) v.level(nt.t - 0.03, gainV * 0.55, 0.015); // soft re-articulation
    v.vowel(nt.t + (nt.cons ? 0.05 : 0), nt.vow || "ah", nt.cons ? 0.05 : 0.04);
    if (nt.vow2) v.vowel(nt.t + nt.d * 0.55, nt.vow2, 0.06);
    const peak = gainV * (nt.v ?? 1);
    v.level(nt.t + (nt.cons ? 0.04 : 0.005), peak, 0.04);
    // natural decay over long notes
    if (nt.d > 0.5) v.level(nt.t + 0.25, peak * 0.8, nt.d * 0.6);
  }
  v.level(end - 0.05, 0, 0.12);
  return end + 0.6;
}

// a soft childlike sob: two shaky inhales + a broken falling "uh"
export function sob(ac, dest, t, { f0 = 520, g = 0.25 } = {}) {
  for (let k = 0; k < 2; k++) {
    const tk = t + k * 0.22;
    const ng = gain(ac, 0, dest);
    const bp = filter(ac, "bandpass", 1600 + k * 300, 1.2, ng);
    bp.frequency.linearRampToValueAtTime(2600, tk + 0.18);
    src(ac, noiseBuffer(ac, "pink"), tk, bp, { offset: rand(0, 2), dur: 0.25 });
    perc(ng.gain, tk, g * 0.5, 0.05, 0.14);
  }
  const tv = t + 0.55;
  const v = createVoice(ac, dest, tv, { f0, kind: "child", breath: 0.25, vib: 50, vibRate: 9, end: tv + 0.9 });
  v.vowel(tv, "uh", 0.01);
  v.amp.gain.setValueAtTime(0, tv);
  v.pitch(tv, f0, 0.02);
  for (let i = 0; i < 3; i++) {
    const ti = tv + i * 0.17;
    v.level(ti, g * (0.9 - i * 0.2), 0.015);
    v.level(ti + 0.1, g * 0.15, 0.02);
    v.pitch(ti, f0 * (1 - i * 0.07), 0.03);
  }
  v.level(tv + 0.6, 0, 0.08);
  return tv + 1;
}

// single voiced syllable (grunts, shouts, laughs, meows)
export function syllable(ac, dest, t, { f0 = 130, f1, dur = 0.25, vow = "uh", vow2, kind = "male", g = 0.35, breath = 0.08, a = 0.02, vib = 10, dist = 0, sub = 0, ring = 0 } = {}) {
  const v = createVoice(ac, dest, t, { f0, kind, breath, vib, dist, sub, ring, end: t + dur + 0.1 });
  v.vowel(t, vow, 0.005);
  if (vow2) v.vowel(t + dur * 0.4, vow2, dur * 0.25);
  v.amp.gain.setValueAtTime(0, t);
  v.amp.gain.linearRampToValueAtTime(g, t + a);
  v.amp.gain.setTargetAtTime(0, t + dur * 0.6, dur * 0.18);
  if (f1) v.o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  if (f1 && v.o2) v.o2.frequency.exponentialRampToValueAtTime(f1 / 2, t + dur);
  return t + dur + 0.2;
}

// ---------------------------------------------------------------- speech-like gibberish under subtitles
const VOW_OF = { a: "ah", e: "eh", i: "ih", o: "oh", u: "uh", y: "ee" };
const VLIST = ["ah", "eh", "oh", "uh", "ee", "oo", "ih"];
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// kind: hollow | rookie | blip | male | female | child. Returns end time.
export function speak(ac, dest, t, text, { kind = "blip", pitch = 1 } = {}) {
  const clean = String(text || "").toLowerCase();
  const letters = clean.replace(/[^a-z]/g, "");
  const vowels = clean.replace(/[^aeiouy]/g, "");
  let n = clamp(Math.round(letters.length / 2.8), 1, kind === "hollow" ? 10 : 14);
  const h = hash(clean);
  if (kind === "blip") {
    const g = gain(ac, 1, dest);
    for (let i = 0; i < n; i++) {
      const ti = t + i * 0.075;
      const f = 300 * pitch * (1 + (((h >> (i % 24)) & 7) - 3) * 0.04);
      const og = gain(ac, 0, g);
      const lp = filter(ac, "lowpass", 2400, 0.7, og);
      osc(ac, "square", f, ti, ti + 0.06, lp);
      perc(og.gain, ti, 0.06, 0.004, 0.045);
    }
    return t + n * 0.075 + 0.1;
  }
  const cfg = {
    hollow: { f0: 62 * pitch, kind: "monster", syl: 0.34, gap: 0.06, breath: 0.55, vib: 35, sub: 0.7, ring: 31, dist: 3, g: 0.5 },
    rookie: { f0: 210 * pitch, kind: "male", syl: 0.11, gap: 0.03, breath: 0.08, vib: 40, sub: 0, ring: 0, dist: 0, g: 0.3 },
    male: { f0: 115 * pitch, kind: "male", syl: 0.15, gap: 0.04, breath: 0.08, vib: 12, sub: 0, ring: 0, dist: 0, g: 0.3 },
    female: { f0: 210 * pitch, kind: "female", syl: 0.14, gap: 0.04, breath: 0.1, vib: 15, sub: 0, ring: 0, dist: 0, g: 0.28 },
    child: { f0: 300 * pitch, kind: "child", syl: 0.14, gap: 0.04, breath: 0.12, vib: 25, sub: 0, ring: 0, dist: 0, g: 0.26 },
  }[kind] || null;
  if (!cfg) return speak(ac, dest, t, text, { kind: "blip", pitch });
  const step = cfg.syl + cfg.gap, end = t + n * step;
  const v = createVoice(ac, dest, t, { f0: cfg.f0, kind: cfg.kind, breath: cfg.breath, vib: cfg.vib, sub: cfg.sub, ring: cfg.ring, dist: cfg.dist, end: end + 0.3 });
  v.amp.gain.setValueAtTime(0, t);
  for (let i = 0; i < n; i++) {
    const ti = t + i * step;
    const vc = vowels.length ? VOW_OF[vowels[i % vowels.length]] : VLIST[(h >> i) % VLIST.length];
    v.vowel(ti, vc, 0.03);
    // falling sentence contour, small random accents
    const contour = 1 - (i / n) * (kind === "hollow" ? 0.25 : 0.15) + (((h >> (i * 2)) & 3) - 1.5) * 0.03;
    v.pitch(ti, cfg.f0 * contour, 0.04);
    v.level(ti, cfg.g, 0.02);
    v.level(ti + cfg.syl, cfg.g * 0.12, 0.02);
    if (kind === "hollow") v.breathAt(ti, cfg.breath * (0.6 + ((h >> i) & 1) * 0.8), 0.08);
  }
  v.level(end, 0, 0.06);
  if (kind === "hollow") {
    // a whispering double, slightly late
    const wg = gain(ac, 0, dest);
    const bp = filter(ac, "bandpass", 1800, 0.8, wg);
    src(ac, noiseBuffer(ac, "pink"), t, bp, { loop: true, offset: rand(0, 2), dur: end - t + 0.6 });
    wg.gain.setValueAtTime(0, t);
    wg.gain.linearRampToValueAtTime(0.12, t + 0.3);
    wg.gain.setValueAtTime(0.12, end);
    wg.gain.linearRampToValueAtTime(TINY, end + 0.5);
  }
  return end + 0.4;
}
