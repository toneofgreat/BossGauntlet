// AUDIO - synth.js: low-level WebAudio building blocks shared by instruments, sfx, voice and music.
// Works with both AudioContext and OfflineAudioContext (every helper takes the context `ac`).
// No module-level DOM access. Buffers, curves and periodic waves are cached per context.

const CACHES = new WeakMap();
export function cache(ac) {
  let c = CACHES.get(ac);
  if (!c) { c = new Map(); CACHES.set(ac, c); }
  return c;
}
// AudioBuffers / curves are not bound to a context: share them between the live and offline contexts
const SHARED = new Map();
export function shared() { return SHARED; }

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const TINY = 0.0001;

// deterministic PRNG (mulberry32)
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(0x5eed);
export const rand = (a = 0, b = 1) => a + R() * (b - a);
export const pick = (arr) => arr[(R() * arr.length) | 0];

// ---------------------------------------------------------------- note names
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function nn(s) {
  if (typeof s === "number") return s;
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error("bad note " + s);
  return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}
const CHORDS = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], sus: [0, 5, 7], m7: [0, 3, 7, 10], d7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], five: [0, 7] };
// "Em" "F#" "Bbm" "D7" -> { root (midi in octave 3), tones [midi...] }
export function chord(sym, oct = 3) {
  const m = /^([A-G][#b]?)(m7|maj7|m|7|dim|sus|5)?$/.exec(sym);
  if (!m) throw new Error("bad chord " + sym);
  const root = nn(m[1] + oct);
  const kind = m[2] === "m" ? "min" : m[2] === "7" ? "d7" : m[2] === "5" ? "five" : m[2] || "maj";
  return { root, tones: CHORDS[kind].map((i) => root + i) };
}
// melody notation: tokens per unit, "-" ties, "." rest, "|" ignored. Returns step-indexed array of [midi, lenSteps].
export function melody(str, unit = 2) {
  const toks = str.split(/\s+/).filter((t) => t && t !== "|");
  const len = toks.length * unit;
  const map = new Array(len).fill(null);
  let last = -1;
  toks.forEach((tk, i) => {
    const st = i * unit;
    if (tk === "-") { if (last >= 0) map[last][1] += unit; return; }
    if (tk === ".") { last = -1; return; }
    map[st] = [nn(tk), unit];
    last = st;
  });
  return { len, map };
}

// ---------------------------------------------------------------- buffers
export function noiseBuffer(ac, kind = "white") {
  const key = "noise:" + kind + ":" + ac.sampleRate;
  const c = SHARED;
  if (c.has(key)) return c.get(key);
  const sr = ac.sampleRate, n = Math.floor(sr * 3);
  const buf = ac.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const r = rng(kind === "white" ? 11 : kind === "pink" ? 23 : 37);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
  for (let i = 0; i < n; i++) {
    const x = r() * 2 - 1;
    if (kind === "white") d[i] = x * 0.6;
    else if (kind === "pink") {
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.1; b6 = x * 0.115926;
    } else { br = (br + 0.02 * x) / 1.02; d[i] = br * 3.2; }
  }
  // crossfade the seam so loops never click
  const f = Math.floor(sr * 0.05);
  for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); }
  c.set(key, buf);
  return buf;
}

// JS-rendered buffer at its own sample rate (cached by key)
export function jsBuffer(ac, key, sec, sr, fill, channels = 1) {
  const c = SHARED;
  if (key && c.has(key)) return c.get(key);
  const n = Math.max(1, Math.floor(sec * sr));
  const buf = ac.createBuffer(channels, n, sr);
  for (let ch = 0; ch < channels; ch++) fill(buf.getChannelData(ch), sr, n, ch);
  if (key) c.set(key, buf);
  return buf;
}
export function reversed(ac, key, buf) {
  const c = SHARED, k = "rev:" + key;
  if (c.has(k)) return c.get(k);
  const out = ac.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const s = buf.getChannelData(ch), d = out.getChannelData(ch), n = s.length;
    for (let i = 0; i < n; i++) d[i] = s[n - 1 - i];
  }
  c.set(k, out);
  return out;
}

// ---------------------------------------------------------------- curves / waves
export function shaperCurve(ac, amount = 4, kind = "tanh") {
  const key = "curve:" + kind + amount;
  const c = SHARED;
  if (c.has(key)) return c.get(key);
  const n = 2048, cv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    if (kind === "fold") cv[i] = Math.sin(x * amount) * 0.8;
    else if (kind === "crush") cv[i] = Math.round(x * amount) / amount;
    else cv[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  c.set(key, cv);
  return cv;
}
export function shaper(ac, amount, kind) {
  const w = ac.createWaveShaper();
  w.curve = shaperCurve(ac, amount, kind);
  w.oversample = "2x";
  return w;
}
export function wave(ac, name, real) {
  const key = "wave:" + name;
  const c = cache(ac);
  if (c.has(key)) return c.get(key);
  const re = new Float32Array(real.length + 1), im = new Float32Array(real.length + 1);
  for (let i = 0; i < real.length; i++) im[i + 1] = real[i];
  const w = ac.createPeriodicWave(re, im, { disableNormalization: false });
  c.set(key, w);
  return w;
}

// ---------------------------------------------------------------- node helpers
export function gain(ac, v, dest) {
  const g = ac.createGain();
  g.gain.value = v;
  if (dest) g.connect(dest);
  return g;
}
export function filter(ac, type, f, q, dest) {
  const b = ac.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  if (q !== undefined) b.Q.value = q;
  if (dest) b.connect(dest);
  return b;
}
export function osc(ac, type, f, t0, t1, dest, detune = 0) {
  const o = ac.createOscillator();
  if (typeof type === "string") o.type = type; else o.setPeriodicWave(type);
  o.frequency.setValueAtTime(f, t0);
  if (detune) o.detune.setValueAtTime(detune, t0);
  if (dest) o.connect(dest);
  o.start(t0);
  o.stop(t1);
  return o;
}
export function src(ac, buf, t0, dest, { rate = 1, loop = false, offset = 0, dur = 0, detune = 0 } = {}) {
  const s = ac.createBufferSource();
  s.buffer = buf;
  s.loop = loop;
  s.playbackRate.setValueAtTime(rate, t0);
  if (detune && s.detune) s.detune.setValueAtTime(detune, t0);
  if (dest) s.connect(dest);
  if (loop) { s.start(t0, offset % buf.duration); if (dur) s.stop(t0 + dur); }
  else if (dur) s.start(t0, offset, dur); else s.start(t0, offset);
  return s;
}
export function panner(ac, pan, dest) {
  if (!ac.createStereoPanner) return dest;
  const p = ac.createStereoPanner();
  p.pan.value = clamp(pan, -1, 1);
  p.connect(dest);
  return p;
}
// percussive envelope on a gain param: 0 -> peak in a, exp decay to silence at t+a+d
export function perc(param, t, peak, a, d) {
  param.setValueAtTime(TINY, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.exponentialRampToValueAtTime(TINY, t + a + d);
}
// sustained envelope: attack a, hold to t+dur, release r
export function sustain(param, t, peak, a, dur, r) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + Math.max(0.005, a));
  const rel = t + Math.max(a + 0.01, dur);
  param.setValueAtTime(peak, rel);
  param.linearRampToValueAtTime(0, rel + r);
  return rel + r;
}

// ---------------------------------------------------------------- one-shot sound atoms (used by sfx + instruments)
// filtered noise burst. o: { kind, type, f, f2, q, a, d, gain, rate, pan }
export function noiseHit(ac, out, t, o) {
  const a = o.a ?? 0.003, d = o.d ?? 0.1;
  const g = gain(ac, 0, out);
  let head = g;
  if (o.shape) { const w = shaper(ac, o.shape); w.connect(g); head = w; }
  const f = filter(ac, o.type || "bandpass", o.f || 1000, o.q ?? 1, head);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + a + d);
  if (o.type2) { const f2 = filter(ac, o.type2, o.ff || 200, o.q2 ?? 0.7); f2.connect(f); }
  const total = a + d + (o.sustainEnv ? (o.r ?? 0.1) : 0) + 0.05;
  const s = src(ac, noiseBuffer(ac, o.kind || "white"), t, f, { rate: o.rate || 1, offset: rand(0, 2.5), dur: total, loop: total > 0.4 });
  if (o.sustainEnv) sustain(g.gain, t, o.gain ?? 0.5, a, o.hold ?? d, o.r ?? 0.1);
  else perc(g.gain, t, o.gain ?? 0.5, a, d);
  return s;
}
// pitched tone with optional sweep. o: { type, f, f2, sweep, a, d, gain, detune, shape }
export function toneHit(ac, out, t, o) {
  const a = o.a ?? 0.003, d = o.d ?? 0.2;
  const g = gain(ac, 0, out);
  let head = g;
  if (o.shape) { const w = shaper(ac, o.shape, o.shapeKind); w.connect(g); head = w; }
  if (o.lp) head = filter(ac, "lowpass", o.lp, o.lpq ?? 0.7, head);
  const ox = osc(ac, o.type || "sine", o.f, t, t + a + d + 0.05, head, o.detune || 0);
  if (o.f2) ox.frequency.exponentialRampToValueAtTime(Math.max(10, o.f2), t + (o.sweep ?? a + d));
  perc(g.gain, t, o.gain ?? 0.4, a, d);
  return ox;
}
// inharmonic metallic ring (bell, blade, armor). o: { f, d, gain, ratios, amps }
const METAL = [1, 2.76, 5.4, 8.93, 13.34];
export function metalHit(ac, out, t, o) {
  const ratios = o.ratios || METAL, f = o.f || 800, d = o.d ?? 0.6, g0 = o.gain ?? 0.2;
  const g = gain(ac, 1, out);
  for (let i = 0; i < ratios.length; i++) {
    const fr = f * ratios[i];
    if (fr > 16000) break;
    const pg = gain(ac, 0, g);
    osc(ac, "sine", fr * (1 + rand(-0.003, 0.003)), t, t + d + 0.05, pg);
    perc(pg.gain, t, g0 / (1 + i * 0.7), 0.001, d / (1 + i * 0.6));
  }
  noiseHit(ac, g, t, { type: "highpass", f: 3000, d: 0.02, gain: g0 * 0.8 });
  return g;
}
// friction creak (door, chair, wood): pulse train with wandering rate through a resonant body
export function creak(ac, out, t, o) {
  const d = o.d ?? 0.8, g0 = o.gain ?? 0.3;
  const g = gain(ac, 0, out);
  const body = filter(ac, "bandpass", o.f || 700, o.q ?? 6, g);
  const body2 = filter(ac, "bandpass", (o.f || 700) * 2.3, (o.q ?? 6) * 0.8, g);
  const pre = gain(ac, 1);
  pre.connect(body); pre.connect(body2);
  const ox = osc(ac, "sawtooth", o.r0 || 40, t, t + d + 0.05, pre);
  const r0 = o.r0 || 40, r1 = o.r1 || 90;
  const steps = Math.max(3, Math.floor(d * 12));
  for (let i = 1; i <= steps; i++) ox.frequency.linearRampToValueAtTime(r0 + (r1 - r0) * Math.random(), t + (d * i) / steps);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(g0, t + d * 0.15);
  g.gain.setValueAtTime(g0 * 0.8, t + d * 0.7);
  g.gain.linearRampToValueAtTime(0, t + d);
  return g;
}
