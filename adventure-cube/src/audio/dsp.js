// dsp.js - pure-JS sample synthesis used by engine.js (MUSIC_A). NO DOM, no WebAudio: every function returns
// Float32Arrays, so it runs in Node too. Expensive sounds are rendered once into buffers and cached by the engine:
//   drums (kick/snare/hats/clap/tom/rim/shaker/crash/taiko/woodblock/conga), Karplus-Strong plucked strings,
//   reverb impulse responses (early reflections + damped diffuse tail) and loopable coloured noise.

export function rng(seed) { // mulberry32, deterministic
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// RBJ biquad, sample by sample
export class Biquad {
  constructor(type, freq, q, sr) { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(type, freq, q, sr); }
  set(type, freq, q, sr) {
    const w = 2 * Math.PI * Math.min(freq, sr * 0.45) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * (q || 0.707));
    let b0, b1, b2;
    if (type === "lowpass") { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
    else if (type === "highpass") { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; } // bandpass, 0 dB peak
    const a0 = 1 + al;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = -2 * cs / a0; this.a2 = (1 - al) / a0;
    return this;
  }
  p(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function normalize(d, peak = 1) {
  let m = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > m) m = a; }
  if (m > 0) { const k = peak / m; for (let i = 0; i < d.length; i++) d[i] *= k; }
  // 3 ms fade at the very end so a cut buffer never clicks
  const f = Math.min(d.length, 150);
  for (let i = 0; i < f; i++) d[d.length - 1 - i] *= i / f;
  return d;
}

// ---------------------------------------------------------------- noise
export function noiseData(sr, seconds, color = "white", seed = 7) {
  const n = Math.floor(sr * seconds), d = new Float32Array(n), r = rng(seed);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    if (color === "pink") { // Paul Kellet's refined pink filter
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    } else if (color === "brown") { br = (br + 0.02 * w) * 0.997; d[i] = br * 3.2; }
    else d[i] = w;
  }
  // crossfade the tail into the head so the buffer loops seamlessly
  const x = Math.min(Math.floor(sr * 0.05), n >> 2);
  for (let i = 0; i < x; i++) { const k = i / x; d[i] = d[i] * k + d[n - x + i] * (1 - k); }
  return { data: d.subarray(0, n - x), length: n - x };
}

// ---------------------------------------------------------------- reverb impulse
// seconds = RT60; damp 0..1 (how much darker the tail gets); returns [L, R]
export function impulse(sr, seconds = 2.4, { damp = 0.6, predelay = 0.014, seed = 11, early = true } = {}) {
  seconds = Math.max(0.3, Math.min(8, seconds));
  const n = Math.floor(sr * seconds), pd = Math.floor(sr * predelay), out = [];
  for (let c = 0; c < 2; c++) {
    const d = new Float32Array(n + pd), r = rng(seed + c * 101);
    let lp = 0, lp2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, env = Math.exp(-6.9 * t / seconds);
      const a = 0.08 + 0.82 * damp * Math.min(1, t / (seconds * 0.7)); // brighter early, darker late
      const w = r() * 2 - 1;
      lp += (1 - a) * (w - lp); lp2 += 0.6 * (lp - lp2);
      const fade = Math.min(1, t / 0.006);
      d[pd + i] = (lp * 0.65 + lp2 * 0.35) * env * fade;
    }
    if (early) { // a handful of discrete early reflections, different per channel (width)
      const er = rng(seed * 7 + c);
      for (let k = 0; k < 9; k++) {
        const at = pd + Math.floor(sr * (0.004 + er() * 0.065)), amp = (0.55 - k * 0.05) * (er() < 0.5 ? -1 : 1);
        if (at < d.length) d[at] += amp;
      }
    }
    out.push(d);
  }
  return out;
}

// ---------------------------------------------------------------- Karplus-Strong pluck
// Exact tuning with an allpass fractional delay; `tone` = brightness of the pick (Hz), `decay` = seconds to fade
// (the buffer rings for decay*1.5 s, -60 dB at the end). wave shapes the excitation (sawtooth = bright steel,
// triangle = nylon, sine = harp/kalimba-soft, square = hollow banjo-ish).
export function pluck(sr, hz, { tone = 3000, decay = 0.5, wave = "sawtooth", seed = 3 } = {}) {
  const T = Math.min(6, Math.max(0.08, decay * 1.5)) + 0.03, L = Math.floor(sr * T);
  const out = new Float32Array(L), r = rng(seed + Math.round(hz));
  const bright = Math.max(0.03, Math.min(1, tone / 8000));
  const S = 0.5 - 0.38 * bright;              // loop lowpass weight: 0.5 = darkest
  const P = sr / hz, N = Math.max(2, Math.floor(P - S - 0.0001)), frac = P - S - N;
  const C = (1 - frac) / (1 + frac);
  const rho = Math.pow(0.001, 1 / (hz * Math.max(0.05, decay * 1.5)));
  // excitation: shaped waveform + noise, low-passed at `tone`
  const ex = new Float32Array(N + 1), noiseAmt = wave === "sine" ? 0.15 : wave === "triangle" ? 0.35 : 0.55;
  const k = 1 - Math.exp(-2 * Math.PI * Math.min(tone, sr * 0.45) / sr);
  let lp = 0, mean = 0;
  for (let i = 0; i <= N; i++) {
    const ph = i / (N + 1);
    let s = wave === "sine" ? Math.sin(2 * Math.PI * ph) : wave === "triangle" ? 1 - 4 * Math.abs(ph - 0.5)
      : wave === "square" ? (ph < 0.5 ? 1 : -1) : 2 * ph - 1;
    const v = s * (1 - noiseAmt) + (r() * 2 - 1) * noiseAmt;
    lp += k * (v - lp); ex[i] = lp; mean += lp;
  }
  mean /= N + 1;
  for (let i = 0; i <= N; i++) ex[i] -= mean;
  let apx = 0, apy = 0;
  for (let n = 0; n < L; n++) {
    let v;
    if (n <= N) v = ex[n];
    else {
      const a = out[n - N], b = out[n - N - 1];
      const x = rho * ((1 - S) * a + S * b);
      v = C * x + apx - C * apy; apx = x; apy = v;
    }
    out[n] = v;
  }
  // gentle pick attack (1 ms) and body warmth
  const att = Math.floor(sr * 0.001);
  for (let i = 0; i < att; i++) out[i] *= i / att;
  return normalize(out, 0.9);
}

// ---------------------------------------------------------------- drums
const DRUM_LEVEL = { kick: 1, snare: 0.85, hat: 0.5, openhat: 0.45, clap: 0.75, tom: 0.9, rim: 0.6, shaker: 0.4, crash: 0.45, taiko: 1, woodblock: 0.6, conga: 0.8 };
export const DRUM_DEFAULT_HZ = { tom: 140, conga: 320, taiko: 72, woodblock: 900 };

// hz: pitch for tom/taiko/woodblock/conga (0 = default); tune: semitones; decay: multiplier; variant: round-robin seed
export function drum(sr, kind, { tune = 0, decay = 1, hz = 0, variant = 0 } = {}) {
  const tm = Math.pow(2, tune / 12), dk = Math.max(0.1, Math.min(4, decay || 1));
  const r = rng(1000 + variant * 77 + kind.length * 13);
  const W = () => r() * 2 - 1;
  const mk = (sec) => new Float32Array(Math.floor(sr * sec));
  const TAU = 2 * Math.PI;
  let d;
  switch (kind) {
    case "kick": {
      d = mk(0.5 * dk + 0.06);
      const f0 = 160 * tm, f1 = 46 * tm, hp = new Biquad("highpass", 1800, 0.7, sr);
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, f = f1 + (f0 - f1) * Math.exp(-t / 0.03);
        ph += TAU * f / sr;
        const body = Math.sin(ph) * Math.exp(-t / (0.19 * dk)) * Math.min(1, t / 0.0015);
        const click = hp.p(W()) * Math.exp(-t / 0.0035) * 0.5;
        d[i] = Math.tanh(1.5 * (body + click));
      }
      break;
    }
    case "snare": {
      d = mk(0.32 * dk + 0.05);
      const hp = new Biquad("highpass", 1100, 0.7, sr), lp = new Biquad("lowpass", 9000, 0.7, sr), bp = new Biquad("bandpass", 3800, 1.2, sr);
      let p1 = 0, p2 = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        p1 += TAU * 180 * tm * (1 + 0.25 * Math.exp(-t / 0.01)) / sr; p2 += TAU * 330 * tm / sr;
        const body = Math.sin(p1) * Math.exp(-t / 0.05) * 0.7 + Math.sin(p2) * Math.exp(-t / 0.028) * 0.35;
        const w = W(), n = lp.p(hp.p(w)) * 0.8 + bp.p(w) * 0.5;
        const ne = Math.exp(-t / (0.085 * dk)) * Math.min(1, t / 0.001);
        d[i] = Math.tanh(1.3 * (body + n * ne));
      }
      break;
    }
    case "hat": case "openhat": case "crash": {
      const crash = kind === "crash", open = kind === "openhat";
      const len = crash ? 2.2 * dk : open ? 0.75 * dk : 0.12 * dk;
      d = mk(len + 0.02);
      const base = (crash ? 1.9 : 1) * tm, fs = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * base * (1 + (r() - 0.5) * 0.01));
      const ph = fs.map(() => r());
      const bp = new Biquad("bandpass", crash ? 7000 : 10000, crash ? 0.6 : 0.9, sr), hp = new Biquad("highpass", crash ? 3500 : 7000, 0.7, sr);
      const hp2 = new Biquad("highpass", crash ? 4000 : 8000, 0.7, sr);
      const tau = crash ? 0.55 * dk : open ? 0.2 * dk : 0.032 * dk;
      let lpS = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        let m = 0;
        for (let k = 0; k < 6; k++) { ph[k] += fs[k] / sr; m += (ph[k] % 1) < 0.5 ? 1 : -1; }
        let v = hp.p(bp.p(m / 6)) + hp2.p(W()) * (crash ? 0.7 : 0.45);
        if (crash) { const a = 0.2 + 0.6 * Math.min(1, t / 1.5); lpS += (1 - a) * (v - lpS); v = lpS * 1.4; }
        const env = Math.exp(-t / tau) * Math.min(1, t / (crash ? 0.002 : 0.0005));
        d[i] = v * env;
      }
      break;
    }
    case "clap": {
      d = mk(0.3 * dk + 0.05);
      const bp = new Biquad("bandpass", 1150, 1.1, sr), hp = new Biquad("highpass", 700, 0.7, sr);
      const bursts = [0, 0.0105, 0.021, 0.029];
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        let e = 0;
        for (let k = 0; k < 3; k++) { const dt = t - bursts[k]; if (dt >= 0) e += Math.exp(-dt / 0.0045); }
        const dt = t - bursts[3]; if (dt >= 0) e += Math.exp(-dt / (0.1 * dk)) * 0.8;
        d[i] = hp.p(bp.p(W())) * e * 2.2;
      }
      break;
    }
    case "rim": {
      d = mk(0.09);
      const b1 = new Biquad("bandpass", 1750 * tm, 14, sr), b2 = new Biquad("bandpass", 480 * tm, 8, sr), hp = new Biquad("highpass", 2500, 0.7, sr);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, x = i < 3 ? 1 : 0;
        d[i] = (b1.p(x) * 8 + b2.p(x) * 4) * Math.exp(-t / (0.022 * dk)) + hp.p(W()) * Math.exp(-t / 0.004) * 0.4;
      }
      break;
    }
    case "shaker": {
      d = mk(0.16 * dk + 0.03);
      const bp = new Biquad("bandpass", 6500, 1.4, sr), hp = new Biquad("highpass", 3000, 0.7, sr);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, e = Math.min(1, t / 0.014) * Math.exp(-Math.max(0, t - 0.014) / (0.045 * dk));
        d[i] = hp.p(bp.p(W())) * e;
      }
      break;
    }
    case "tom": case "conga": case "taiko": {
      const f = (hz || DRUM_DEFAULT_HZ[kind]) * tm;
      const P = kind === "tom" ? { len: 0.55, tau: 0.26, bend: 0.45, bt: 0.025, p2: 1.5, n: 0.25, nf: 1500, nt: 0.012 }
        : kind === "conga" ? { len: 0.4, tau: 0.15, bend: 0.12, bt: 0.012, p2: 1.47, n: 0.35, nf: 2600, nt: 0.005 }
          : { len: 1.7, tau: 0.5, bend: 0.5, bt: 0.035, p2: 1.59, n: 0.55, nf: 650, nt: 0.04 };
      d = mk(P.len * dk + 0.05);
      const nf = new Biquad(kind === "conga" ? "bandpass" : "lowpass", P.nf, 0.9, sr);
      let ph = 0, ph2 = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, ff = f * (1 + P.bend * Math.exp(-t / P.bt));
        ph += TAU * ff / sr; ph2 += TAU * ff * P.p2 / sr;
        const body = Math.sin(ph) * Math.exp(-t / (P.tau * dk)) + Math.sin(ph2) * Math.exp(-t / (P.tau * 0.3 * dk)) * 0.3;
        const n = nf.p(W()) * Math.exp(-t / P.nt) * P.n;
        d[i] = Math.tanh((kind === "taiko" ? 1.8 : 1.2) * (body * Math.min(1, t / 0.0012) + n));
      }
      break;
    }
    case "woodblock": {
      const f = (hz || DRUM_DEFAULT_HZ.woodblock) * tm;
      d = mk(0.14 * dk + 0.03);
      const b1 = new Biquad("bandpass", f, 28, sr), b2 = new Biquad("bandpass", f * 2.76, 20, sr);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, x = i < 2 ? 1 : 0;
        d[i] = (b1.p(x) * 14 + b2.p(x) * 5) * Math.exp(-t / (0.035 * dk));
      }
      break;
    }
    default: d = mk(0.01);
  }
  return normalize(d, DRUM_LEVEL[kind] || 0.8);
}

// soft-clip curve for the master limiter: linear up to `knee`, tanh above, never reaches 1.0
export function softClipCurve(n = 2048, knee = 0.72, ceil = 0.985) {
  const c = new Float32Array(n), room = ceil - knee;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
    c[i] = Math.sign(x) * y;
  }
  return c;
}
