// AUDIO - reverb.js: generated stereo impulse responses (no samples) + convolver factory.
// The IR is decorrelated stereo noise with early reflections, an exponential RT60 decay and frequency-dependent
// damping (a one-pole lowpass that closes as the tail ages), so tails get darker like a real room.
import { shared, rng } from "./synth.js";

export function impulse(ac, { sec = 3, rt60 = 2.8, damp = 0.6, pre = 0.015, early = 6, reverse = false, seed = 7, bright = 0.9 } = {}) {
  const key = "ir:" + [sec, rt60, damp, pre, early, reverse, seed, bright, ac.sampleRate].join(",");
  const c = shared();
  if (c.has(key)) return c.get(key);
  const sr = ac.sampleRate, n = Math.max(64, Math.floor(sec * sr));
  const buf = ac.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const r = rng(seed * 31 + ch * 977);
    const p0 = Math.floor(pre * sr);
    let y = 0;
    const k = 6.907755 / rt60; // ln(1000) / RT60
    for (let i = p0; i < n; i++) {
      const t = (i - p0) / sr;
      const env = Math.exp(-k * t);
      const coef = Math.min(0.97, (1 - bright) + damp * Math.min(1, t / rt60) * 0.9);
      y += (1 - coef) * ((r() * 2 - 1) - y);
      d[i] = y * env;
    }
    // early reflections: a few discrete taps in the first 90 ms
    for (let e = 0; e < early; e++) {
      const at = p0 + Math.floor((0.008 + r() * 0.08) * sr);
      if (at < n) d[at] += (r() < 0.5 ? -1 : 1) * (0.5 - e * 0.05);
    }
    // fade the last 4% so the tail never cuts
    const f = Math.floor(n * 0.04);
    for (let i = 0; i < f; i++) d[n - 1 - i] *= i / f;
    if (reverse) d.reverse();
  }
  c.set(key, buf);
  return buf;
}

export function createReverb(ac, opts) {
  const cv = ac.createConvolver();
  cv.normalize = true;
  cv.buffer = impulse(ac, opts);
  return cv;
}
