// AUDIO - instruments.js: synthesized instruments used by tracks and stings.
// Signature of every instrument: fn(m, t, p) where m = { ac, dry, wet } (a track/sting context) and
// p = { n: midi, d: seconds, v: 0..1 velocity, pan, wet: reverb send, ... }. Returns the end time.
// Piano, pluck (Karplus-Strong), music box, bell and timpani tones are rendered once in JS into cached
// AudioBuffers (per context, per note) so playback is a single buffer source per note.
import {
  cache, gain, filter, osc, src, noiseBuffer, jsBuffer, reversed, shaper, wave, perc, sustain,
  noiseHit, mtof, rand, clamp, rng, TINY,
} from "./synth.js";
import { sing, sob as vsob, VOWELS } from "./voice.js";

const BUF_SR = 24000;

// note output: gain -> [pan] -> dry, + send -> wet
function out(m, p, wetDefault = 0.25) {
  const ac = m.ac;
  const g = ac.createGain();
  g.gain.value = 0;
  let d = m.dry;
  if (p.pan && ac.createStereoPanner) { const sp = ac.createStereoPanner(); sp.pan.value = clamp(p.pan, -1, 1); sp.connect(m.dry); d = sp; }
  g.connect(d);
  const w = p.wet ?? wetDefault;
  if (w > 0 && m.wet) { const s = ac.createGain(); s.gain.value = w; g.connect(s); s.connect(m.wet); }
  return g;
}

// ---------------------------------------------------------------- JS-rendered tone buffers
function pianoBuf(ac, n) {
  return jsBuffer(ac, "piano:" + n, n < 40 ? 6 : n < 60 ? 4.5 : 3, BUF_SR, (d, sr, len) => {
    const f = mtof(n);
    const B = 0.00025 + Math.max(0, (n - 30)) * 0.000012; // inharmonicity (stiff strings)
    const P = Math.min(16, Math.floor((sr * 0.45) / f));
    const base = n < 40 ? 5.5 : n < 55 ? 3.8 : n < 70 ? 2.6 : 1.6; // fundamental decay time constant (s)
    const r = rng(n * 13 + 1);
    for (let k = 1; k <= P; k++) {
      const fk = f * k * Math.sqrt(1 + B * k * k);
      if (fk > sr * 0.47) break;
      const amp = (1 / Math.pow(k, 1.1)) * (k === 1 ? 0.9 : 1) * (1 - 0.6 * Math.abs(Math.sin(k * 0.36))); // hammer position comb
      const tauFast = 0.25 / Math.pow(k, 0.5), tauSlow = base / Math.pow(k, 0.65);
      // two strings per partial, slightly detuned -> beating
      for (let s = 0; s < 2; s++) {
        const fr = fk * (1 + (s ? 0.0007 : -0.0004) * (1 + r() * 0.3));
        const w = (2 * Math.PI * fr) / sr;
        const cw = Math.cos(w), sw = Math.sin(w);
        let c = 1, si = 0;
        let eF = 1, eS = 1;
        const dF = Math.exp(-1 / (tauFast * sr)), dS = Math.exp(-1 / (tauSlow * sr));
        const a = amp * 0.5;
        for (let i = 0; i < len; i++) {
          d[i] += a * si * (0.55 * eF + 0.45 * eS);
          const nc = c * cw - si * sw; si = si * cw + c * sw; c = nc;
          eF *= dF; eS *= dS;
        }
      }
    }
    // hammer thump + felt noise
    let y = 0;
    const hl = Math.floor(sr * 0.012);
    for (let i = 0; i < hl; i++) { y += 0.35 * ((r() * 2 - 1) - y); d[i] += y * 0.25 * (1 - i / hl); }
    // attack ramp (2 ms) + normalize
    let pk = 0;
    for (let i = 0; i < len; i++) { if (i < sr * 0.002) d[i] *= i / (sr * 0.002); const a = Math.abs(d[i]); if (a > pk) pk = a; }
    const fade = Math.floor(sr * 0.05);
    for (let i = 0; i < len; i++) { d[i] /= pk || 1; if (i > len - fade) d[i] *= (len - i) / fade; }
  });
}
function pluckBuf(ac, n, bright = 0.5) {
  const key = "pluck:" + n + ":" + bright;
  return jsBuffer(ac, key, n < 48 ? 2.4 : 1.6, 32000, (d, sr, len) => {
    const f = mtof(n);
    const D = sr / f - 0.5;
    const N = Math.ceil(D) + 2;
    const r = rng(n * 7 + 3);
    const line = new Float32Array(len);
    // excitation: lowpassed noise burst (pick position softens)
    let y = 0;
    for (let i = 0; i < N; i++) { y += (0.3 + bright * 0.6) * ((r() * 2 - 1) - y); line[i] = y; }
    const damp = 0.996 - Math.max(0, n - 50) * 0.0004;
    for (let i = N; i < len; i++) {
      const pos = i - D;
      const i0 = Math.floor(pos), fr = pos - i0;
      const a = line[i0] * (1 - fr) + line[i0 + 1] * fr;
      const b = line[i0 - 1] * (1 - fr) + line[i0] * fr;
      line[i] = damp * 0.5 * (a + b);
    }
    let pk = 0;
    for (let i = 0; i < len; i++) { const a = Math.abs(line[i]); if (a > pk) pk = a; }
    const fade = Math.floor(sr * 0.04);
    for (let i = 0; i < len; i++) { d[i] = line[i] / (pk || 1); if (i > len - fade) d[i] *= (len - i) / fade; }
  });
}
function boxBuf(ac, n) {
  return jsBuffer(ac, "box:" + n, 2.6, BUF_SR, (d, sr, len) => {
    const f = mtof(n);
    const parts = [[1, 1, 1.6], [3.01, 0.12, 0.5], [6.27, 0.28, 0.25], [9.9, 0.08, 0.12]];
    for (const [ra, am, tau] of parts) {
      const fr = f * ra; if (fr > sr * 0.47) continue;
      const w = (2 * Math.PI * fr) / sr;
      const dk = Math.exp(-1 / (tau * sr));
      let e = am;
      for (let i = 0; i < len; i++) { d[i] += Math.sin(w * i) * e; e *= dk; }
    }
    for (let i = 0; i < 40; i++) d[i] *= i / 40;
    let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(d[i]));
    for (let i = 0; i < len; i++) d[i] /= pk || 1;
  });
}
function bellBuf(ac, n, len = 6) {
  return jsBuffer(ac, "bell:" + n + ":" + len, len, BUF_SR, (d, sr, L) => {
    const f = mtof(n);
    // Risset-style inharmonic bell partials [ratio, amp, decay]
    const parts = [[0.56, 1, 1], [0.92, 0.67, 0.9], [1.19, 1, 0.65], [1.71, 1.8, 0.55], [2, 2.67, 0.325], [2.74, 1.67, 0.35], [3, 1.46, 0.25], [3.76, 1.33, 0.2], [4.07, 1.33, 0.15]];
    for (const [ra, am, dt] of parts) {
      const fr = f * ra; if (fr > sr * 0.47) continue;
      const w = (2 * Math.PI * fr) / sr, dk = Math.exp(-1 / (dt * len * 0.5 * sr));
      let e = am;
      for (let i = 0; i < L; i++) { d[i] += Math.sin(w * i + ra) * e; e *= dk; }
    }
    for (let i = 0; i < 60; i++) d[i] *= i / 60;
    let pk = 0; for (let i = 0; i < L; i++) pk = Math.max(pk, Math.abs(d[i]));
    for (let i = 0; i < L; i++) d[i] /= pk || 1;
  });
}

// ---------------------------------------------------------------- drums
export function kick(m, t, p) {
  const ac = m.ac, v = p.v ?? 0.9, dec = p.d ?? 0.45;
  const g = out(m, p, p.wet ?? 0.05);
  let head = g;
  if (p.dist) { const w = shaper(ac, p.dist); w.connect(g); head = w; }
  if (p.lp) head = filter(ac, "lowpass", p.lp, 0.7, head);
  const o = osc(ac, "sine", p.f0 || 120, t, t + dec + 0.1, head);
  o.frequency.exponentialRampToValueAtTime(p.f1 || 42, t + (p.sweep || 0.11));
  perc(g.gain, t, v, 0.002, dec);
  if (p.click !== 0) noiseHit(ac, head, t, { type: "lowpass", f: 3500, d: 0.012, gain: 0.5 * (p.click ?? 1) });
  return t + dec;
}
export function snare(m, t, p) {
  const ac = m.ac, v = p.v ?? 0.6;
  const g = out(m, p, 0.18);
  g.gain.value = 1;
  noiseHit(ac, g, t, { type: "bandpass", f: 2200, q: 0.7, d: p.d ?? 0.18, gain: v * 0.8 });
  noiseHit(ac, g, t, { type: "highpass", f: 5000, d: (p.d ?? 0.18) * 0.7, gain: v * 0.4 });
  const tg = gain(ac, 0, g);
  const o = osc(ac, "triangle", 210, t, t + 0.12, tg);
  o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
  perc(tg.gain, t, v * 0.6, 0.001, 0.08);
  return t + 0.25;
}
export function hat(m, t, p) {
  const g = out(m, p, 0.1); g.gain.value = 1;
  noiseHit(m.ac, g, t, { type: "highpass", f: 7500, q: 0.8, d: p.open ? 0.28 : 0.035, gain: (p.v ?? 0.3) * 0.6 });
  return t + 0.3;
}
export function tom(m, t, p) {
  const ac = m.ac, f = mtof(p.n ?? 45), v = p.v ?? 0.7;
  const g = out(m, p, 0.15);
  const o = osc(ac, "sine", f * 1.6, t, t + 0.6, g);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
  perc(g.gain, t, v, 0.002, p.d ?? 0.38);
  const g2 = gain(ac, 1, g);
  noiseHit(ac, g2, t, { type: "lowpass", f: 1200, d: 0.05, gain: v * 0.5 });
  return t + 0.6;
}
export function timpani(m, t, p) {
  const ac = m.ac, f = mtof(p.n ?? 34), v = p.v ?? 0.7, d = p.d ?? 2;
  const g = out(m, p, 0.35); g.gain.value = 1;
  const modes = [[1, 1, 1], [1.5, 0.5, 0.7], [1.98, 0.35, 0.5], [2.44, 0.2, 0.35]];
  for (const [ra, am, dk] of modes) {
    const pg = gain(ac, 0, g);
    const o = osc(ac, "sine", f * ra * 1.02, t, t + d * dk + 0.1, pg);
    o.frequency.exponentialRampToValueAtTime(f * ra, t + 0.25);
    perc(pg.gain, t, v * am * 0.6, 0.004, d * dk);
  }
  noiseHit(ac, g, t, { type: "lowpass", f: 700, d: 0.08, gain: v * 0.5 });
  return t + d;
}
export function hand(m, t, p) {
  const ac = m.ac, v = p.v ?? 0.5;
  const g = out(m, p, 0.15); g.gain.value = 1;
  if (p.slap) noiseHit(ac, g, t, { type: "bandpass", f: 1100, q: 1.2, d: 0.06, gain: v * 0.6 });
  const tg = gain(ac, 0, g);
  const o = osc(ac, "sine", p.slap ? 260 : 170, t, t + 0.3, tg);
  o.frequency.exponentialRampToValueAtTime(p.slap ? 210 : 120, t + 0.08);
  perc(tg.gain, t, v * (p.slap ? 0.35 : 0.7), 0.002, p.slap ? 0.08 : 0.22);
  return t + 0.3;
}
export function stomp(m, t, p) {
  const ac = m.ac, v = p.v ?? 0.7;
  const g = out(m, p, 0.12); g.gain.value = 1;
  noiseHit(ac, g, t, { type: "lowpass", f: 380, q: 1, d: 0.12, gain: v * 0.9, kind: "brown" });
  const tg = gain(ac, 0, g);
  const o = osc(ac, "sine", 95, t, t + 0.25, tg);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.1);
  perc(tg.gain, t, v * 0.7, 0.002, 0.18);
  noiseHit(ac, g, t + 0.004, { type: "bandpass", f: 2400, q: 2, d: 0.03, gain: v * 0.15 });
  return t + 0.3;
}
export function tamb(m, t, p) {
  const ac = m.ac, v = p.v ?? 0.25;
  const g = out(m, p, 0.12); g.gain.value = 1;
  noiseHit(ac, g, t, { type: "bandpass", f: 8500, q: 1.5, d: 0.09, gain: v * 0.7 });
  const pg = gain(ac, 0, g);
  osc(ac, "square", 5300 + rand(-80, 80), t, t + 0.12, pg);
  perc(pg.gain, t, v * 0.05, 0.001, 0.08);
  return t + 0.2;
}
export function clap(m, t, p) {
  const g = out(m, p, 0.25); g.gain.value = 1;
  noiseHit(m.ac, g, t, { type: "bandpass", f: 1300, q: 1.1, d: 0.012, gain: (p.v ?? 0.5) * 0.6 });
  noiseHit(m.ac, g, t + 0.016, { type: "bandpass", f: 1300, q: 1.1, d: 0.14, gain: (p.v ?? 0.5) * 0.6 });
  return t + 0.2;
}
export function woodblock(m, t, p) {
  const ac = m.ac, g = out(m, p, 0.15);
  const o = osc(ac, "sine", mtof(p.n ?? 79), t, t + 0.12, g);
  o.frequency.exponentialRampToValueAtTime(mtof(p.n ?? 79) * 0.94, t + 0.05);
  perc(g.gain, t, p.v ?? 0.35, 0.001, 0.06);
  return t + 0.12;
}

// ---------------------------------------------------------------- tonal: buffer based
function bufNote(m, t, p, buf, baseN, wetD, gScale) {
  const ac = m.ac;
  const g = out(m, p, wetD);
  const rate = Math.pow(2, ((p.n ?? baseN) - baseN) / 12);
  const s = src(ac, buf, t, g, { rate, detune: p.detune || 0 });
  const v = (p.v ?? 0.6) * gScale;
  g.gain.setValueAtTime(v, t);
  const len = buf.duration / rate;
  const d = p.d ?? len;
  if (d < len - 0.05) { g.gain.setValueAtTime(v, t + d); g.gain.setTargetAtTime(0, t + d, p.rel ?? 0.12); s.stop(t + d + 1); return t + d + 0.6; }
  return t + len;
}
export function piano(m, t, p) {
  const n = Math.round(p.n ?? 50);
  // soft "una corda": low velocity -> darker
  if ((p.v ?? 0.6) < 0.45) p.soft = true;
  const g = (p.v ?? 0.6);
  const mm = p.soft ? lowpassed(m, 900 + g * 2500) : m;
  return bufNote(mm, t, { ...p, n, detune: (p.detune || 0) + ((p.n ?? n) - n) * 100 }, pianoBuf(m.ac, n), n, 0.45, 0.55);
}
function lowpassed(m, f) {
  const lp = filter(m.ac, "lowpass", f, 0.6, m.dry);
  return { ac: m.ac, dry: lp, wet: m.wet };
}
export function revPiano(m, t, p) {
  // reversed piano note that swells INTO time t (starts earlier)
  const n = Math.round(p.n ?? 50), b = pianoBuf(m.ac, n), rb = reversed(m.ac, "piano:" + n, b);
  const len = Math.min(rb.duration, p.len ?? 2.5);
  const ac = m.ac, g = out(m, p, 0.6);
  const st = Math.max(0, t - len);
  src(ac, rb, st, g, { offset: rb.duration - len, detune: p.detune || 0 });
  g.gain.setValueAtTime((p.v ?? 0.5) * 0.5, st);
  return t + 0.1;
}
export function pluck(m, t, p) {
  const n = Math.round(p.n ?? 60);
  return bufNote(m, t, { ...p, n }, pluckBuf(m.ac, n, p.bright ?? 0.5), n, 0.22, 0.42);
}
export function musicBox(m, t, p) {
  const n = Math.round(p.n ?? 72);
  return bufNote(m, t, { ...p, n }, boxBuf(m.ac, n), n, 0.5, 0.3);
}
export function bell(m, t, p) {
  const n = Math.round(p.n ?? 48);
  return bufNote(m, t, { ...p, n }, bellBuf(m.ac, n, p.len ?? 6), n, 0.55, 0.3);
}

// ---------------------------------------------------------------- tonal: oscillator based
function notesOf(p) { return p.notes || [p.n ?? 60]; }
export function pad(m, t, p) {
  const ac = m.ac, d = p.d ?? 4, a = p.a ?? 1.5, r = p.r ?? 2.5, v = (p.v ?? 0.5) * 0.1;
  const g = out(m, p, 0.5);
  const lp = filter(ac, "lowpass", p.cut ?? 900, p.q ?? 0.8, g);
  if (p.sweep) { lp.frequency.setValueAtTime(p.cut ?? 900, t); lp.frequency.linearRampToValueAtTime(p.sweep, t + d); }
  const end = t + d + r + 0.1;
  for (const n of notesOf(p)) {
    const f = mtof(n);
    for (let k = 0; k < 3; k++) osc(ac, p.type || "sawtooth", f, t, end, lp, (k - 1) * (p.spread ?? 9) + rand(-2, 2) + (p.detune || 0));
  }
  sustain(g.gain, t, v, a, d, r);
  return end;
}
export function strings(m, t, p) {
  const ac = m.ac, d = p.d ?? 1, a = p.a ?? 0.12, r = p.r ?? 0.4, v = (p.v ?? 0.5) * 0.11;
  const g = out(m, p, 0.4);
  const lp = filter(ac, "lowpass", p.cut ?? 3200, 0.7, g);
  const pk = filter(ac, "peaking", 1400, 1.2); pk.gain.value = 4; pk.connect(lp);
  const end = t + d + r + 0.1;
  const vg = gain(ac, 0);
  osc(ac, "sine", 5.3 + rand(-0.4, 0.4), t, end, vg);
  vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(p.vib ?? 14, t + Math.min(0.6, d));
  for (const n of notesOf(p)) {
    const f = mtof(n);
    for (let k = 0; k < (p.thin ? 1 : 3); k++) {
      const o = osc(ac, "sawtooth", f, t, end, pk, (k - 1) * 7 + rand(-3, 3) + (p.detune || 0));
      vg.connect(o.detune);
      if (p.bend) o.frequency.exponentialRampToValueAtTime(f * Math.pow(2, p.bend / 12), t + d);
    }
  }
  sustain(g.gain, t, v, a, d, r);
  return end;
}
export function brass(m, t, p) {
  const ac = m.ac, d = p.d ?? 0.8, v = (p.v ?? 0.6) * 0.12, r = p.r ?? 0.25;
  const g = out(m, p, 0.35);
  const lp = filter(ac, "lowpass", 300, 1.2, g);
  const bright = p.bright ?? 1;
  lp.frequency.setValueAtTime(250, t);
  lp.frequency.linearRampToValueAtTime(400 + 2600 * (p.v ?? 0.6) * bright, t + 0.07);
  lp.frequency.setTargetAtTime(700 + 1300 * (p.v ?? 0.6) * bright, t + 0.1, 0.3);
  const end = t + d + r + 0.1;
  const vg = gain(ac, 0);
  osc(ac, "sine", 5, t, end, vg);
  vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(p.vib ?? 10, t + Math.min(0.5, d));
  for (const n of notesOf(p)) {
    const f = mtof(n);
    for (let k = 0; k < 2; k++) {
      const o = osc(ac, "sawtooth", f, t, end, lp, (k ? 6 : -6) + (p.detune || 0) - 30);
      o.detune.linearRampToValueAtTime((k ? 6 : -6) + (p.detune || 0), t + 0.06);
      vg.connect(o.detune);
      if (p.fall) o.frequency.exponentialRampToValueAtTime(f * Math.pow(2, p.fall / 12), t + d);
    }
  }
  sustain(g.gain, t, v, p.a ?? 0.04, d, r);
  return end;
}
const ORGAN = [1, 0.75, 0.55, 0.45, 0.1, 0.3, 0.05, 0.25, 0.04, 0.05, 0, 0.12];
export function organ(m, t, p) {
  const ac = m.ac, d = p.d ?? 2, v = (p.v ?? 0.5) * 0.09;
  const g = out(m, p, 0.5);
  const trem = gain(ac, 1, g);
  const lfo = gain(ac, 0.12, trem.gain);
  const end = t + d + (p.r ?? 0.6) + 0.1;
  osc(ac, "sine", 5.8, t, end, lfo);
  const w = wave(ac, "organ", ORGAN);
  const lp = filter(ac, "lowpass", p.cut ?? 4500, 0.5, trem);
  for (const n of notesOf(p)) {
    osc(ac, w, mtof(n), t, end, lp, p.detune || 0);
    if (p.detuned) osc(ac, w, mtof(n), t, end, lp, (p.detune || 0) + p.detuned);
  }
  sustain(g.gain, t, v, p.a ?? 0.05, d, p.r ?? 0.6);
  return end;
}
export function choir(m, t, p) {
  const ac = m.ac, d = p.d ?? 3, v = (p.v ?? 0.5) * 0.18;
  const g = out(m, p, 0.6);
  const vw = VOWELS[p.vow || "ah"], sc = p.low ? 0.95 : 1.1;
  const mix = gain(ac, 1);
  for (let i = 0; i < 3; i++) { const fg = gain(ac, vw[1][i], g); const bp = filter(ac, "bandpass", vw[0][i] * sc, 5 + i * 2, fg); mix.connect(bp); }
  const end = t + d + (p.r ?? 1.5) + 0.1;
  const lp = filter(ac, "lowpass", 3500, 0.5, mix);
  const vg = gain(ac, 16);
  osc(ac, "sine", 4.8, t, end, vg);
  for (const n of notesOf(p)) {
    const f = mtof(n);
    for (let k = 0; k < 3; k++) { const o = osc(ac, "sawtooth", f, t, end, lp, (k - 1) * 11 + rand(-4, 4) + (p.detune || 0)); vg.connect(o.detune); if (p.fall) o.frequency.exponentialRampToValueAtTime(f * Math.pow(2, p.fall / 12), t + d); }
  }
  noiseHit(ac, mix, t, { type: "bandpass", f: 2500, q: 0.6, a: p.a ?? 0.6, d, gain: 0.05, sustainEnv: true, hold: d, r: 0.5 });
  sustain(g.gain, t, v, p.a ?? 0.6, d, p.r ?? 1.5);
  return end;
}
export function flute(m, t, p) {
  const ac = m.ac, d = p.d ?? 0.5, v = (p.v ?? 0.5) * 0.22, f = mtof(p.n ?? 74);
  const g = out(m, p, 0.35);
  const end = t + d + 0.2;
  const vg = gain(ac, 0);
  osc(ac, "sine", 5.2, t, end, vg);
  vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(d > 0.35 ? 14 : 4, t + Math.min(0.4, d));
  const o1 = osc(ac, "sine", f, t, end, g, -12); o1.detune.linearRampToValueAtTime(0, t + 0.05); vg.connect(o1.detune);
  const g3 = gain(ac, 0.12, g);
  const o2 = osc(ac, "triangle", f * 2, t, end, g3); vg.connect(o2.detune);
  noiseHit(ac, g, t, { type: "bandpass", f: f * 2, q: 3, a: 0.03, d, gain: 0.25, sustainEnv: true, hold: d, r: 0.08 });
  sustain(g.gain, t, v, 0.05, d, p.r ?? 0.12);
  return end;
}
export function fiddle(m, t, p) {
  const ac = m.ac, d = p.d ?? 0.3, v = (p.v ?? 0.5) * 0.16, f = mtof(p.n ?? 69);
  const g = out(m, p, 0.3);
  const lp = filter(ac, "lowpass", 4200, 0.6, g);
  const b1 = filter(ac, "peaking", 480, 2.5, lp); b1.gain.value = 6;
  const b2 = filter(ac, "peaking", 2800, 2, b1); b2.gain.value = 5;
  const end = t + d + 0.2;
  const vg = gain(ac, 0);
  osc(ac, "sine", 6.2, t, end, vg);
  vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(d > 0.3 ? 18 : 6, t + Math.min(0.3, d));
  const o = osc(ac, "sawtooth", f, t, end, b2, 2); vg.connect(o.detune);
  if (d > 0.3) noiseHit(ac, b2, t, { type: "bandpass", f: 3000, q: 1, a: 0.02, d, gain: 0.04, sustainEnv: true, hold: d, r: 0.05 });
  sustain(g.gain, t, v, p.a ?? 0.03, d, p.r ?? 0.1);
  return end;
}
const REED = [1, 0.8, 0.6, 0.5, 0.35, 0.3, 0.2, 0.18, 0.12, 0.1];
export function accordion(m, t, p) {
  const ac = m.ac, d = p.d ?? 0.4, v = (p.v ?? 0.5) * 0.07;
  const g = out(m, p, 0.25);
  const lp = filter(ac, "lowpass", 2600, 0.6, g);
  const w = wave(ac, "reed", REED);
  const end = t + d + 0.15;
  for (const n of notesOf(p)) { const f = mtof(n); osc(ac, w, f, t, end, lp, -11); osc(ac, w, f, t, end, lp, 11); }
  sustain(g.gain, t, v, p.a ?? 0.04, d, p.r ?? 0.08);
  return end;
}
export function kazoo(m, t, p) {
  const ac = m.ac, d = p.d ?? 0.3, v = (p.v ?? 0.5) * 0.14, f = mtof(p.n ?? 72);
  const g = out(m, p, 0.2);
  const bp = filter(ac, "bandpass", 1150, 2.2, g);
  const bp2 = filter(ac, "bandpass", 2600, 3, g);
  const w = shaper(ac, 3);
  w.connect(bp); w.connect(bp2);
  const end = t + d + 0.1;
  const vg = gain(ac, 30);
  osc(ac, "sine", 7, t, end, vg);
  const o = osc(ac, "sawtooth", f * 0.97, t, end, w);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
  vg.connect(o.detune);
  noiseHit(ac, w, t, { type: "bandpass", f: 1500, q: 1, a: 0.02, d, gain: 0.08, sustainEnv: true, hold: d, r: 0.05 });
  sustain(g.gain, t, v, 0.02, d, 0.06);
  return end;
}
export function bass(m, t, p) {
  const ac = m.ac, d = p.d ?? 0.4, v = (p.v ?? 0.6) * 0.35, f = mtof(p.n ?? 40);
  const g = out(m, p, 0.05);
  let head = g;
  if (p.dist) { const sh = shaper(ac, p.dist); sh.connect(g); head = sh; }
  const lp = filter(ac, "lowpass", p.cut ?? 700, 1, head);
  lp.frequency.setValueAtTime((p.cut ?? 700) * 2, t);
  lp.frequency.exponentialRampToValueAtTime(p.cut ?? 700, t + 0.08);
  const end = t + d + 0.15;
  osc(ac, p.type || "triangle", f, t, end, lp);
  osc(ac, "sine", f, t, end, lp);
  if (p.reese) { osc(ac, "sawtooth", f, t, end, lp, 14); osc(ac, "sawtooth", f, t, end, lp, -14); }
  if (p.perc) perc(g.gain, t, v, 0.004, d);
  else sustain(g.gain, t, v, 0.008, d, 0.08);
  return end;
}
export function tone(m, t, p) {
  // pure sine / glass tone with slow attack (title "very soft high tone")
  const ac = m.ac, d = p.d ?? 2, v = (p.v ?? 0.3) * 0.12;
  const g = out(m, p, 0.8);
  osc(ac, p.type || "sine", mtof(p.n ?? 86), t, t + d + (p.r ?? 2) + 0.1, g, p.detune || 0);
  if (p.n2) osc(ac, "sine", mtof(p.n2), t, t + d + (p.r ?? 2) + 0.1, g, 4);
  sustain(g.gain, t, v, p.a ?? 0.8, d, p.r ?? 2);
  return t + d + (p.r ?? 2);
}
export function drone(m, t, p) {
  // FM drone: carrier n, modulator n*ratio, index breathing slowly
  const ac = m.ac, d = p.d ?? 8, v = (p.v ?? 0.5) * 0.18, f = mtof(p.n ?? 26);
  const g = out(m, p, 0.3);
  const lp = filter(ac, "lowpass", p.cut ?? 600, 0.7, g);
  const end = t + d + (p.r ?? 3) + 0.1;
  const c = osc(ac, "sine", f, t, end, lp, p.detune || 0);
  const mg = gain(ac, f * (p.index ?? 1.2), c.frequency);
  osc(ac, "sine", f * (p.ratio ?? 2.005), t, end, mg);
  const ig = gain(ac, f * 0.8, mg.gain);
  osc(ac, "sine", 0.09, t, end, ig);
  if (p.sub !== 0) osc(ac, "sine", f / 2, t, end, gain(ac, 0.6, lp));
  sustain(g.gain, t, v, p.a ?? 2, d, p.r ?? 3);
  return end;
}
export function noiseSwell(m, t, p) {
  // filtered noise swell (rises over d to t+d, then quick fall). Used for reversed-reverb swells, air, risers.
  const ac = m.ac, d = p.d ?? 2, v = (p.v ?? 0.4) * 0.5;
  const g = out(m, p, 0.6);
  const f = filter(ac, p.type || "bandpass", p.f ?? 1200, p.q ?? 0.8, g);
  if (p.f2) f.frequency.exponentialRampToValueAtTime(p.f2, t + d);
  src(ac, noiseBuffer(ac, p.kind || "pink"), t, f, { loop: true, offset: rand(0, 2), dur: d + (p.r ?? 0.2) + 0.1 });
  g.gain.setValueAtTime(TINY, t);
  if (p.fallIn) { g.gain.linearRampToValueAtTime(v, t + 0.05); g.gain.exponentialRampToValueAtTime(TINY, t + d); }
  else { g.gain.exponentialRampToValueAtTime(v, t + d); g.gain.linearRampToValueAtTime(0, t + d + (p.r ?? 0.2)); }
  return t + d + (p.r ?? 0.2);
}
export function revSwell(m, t, p) {
  // reversed reverb swell on a pitch: bandpassed noise + a soft sine bloom, cut at t+d
  noiseSwell(m, t, { d: p.d ?? 2.2, f: mtof(p.n ?? 62) * 2, q: 4, v: (p.v ?? 0.4) * 0.6, r: 0.04, wet: 0.2 });
  const ac = m.ac, g = out(m, p, 0.4), d = p.d ?? 2.2;
  osc(ac, "triangle", mtof(p.n ?? 62), t, t + d + 0.1, g);
  g.gain.setValueAtTime(TINY, t);
  g.gain.exponentialRampToValueAtTime((p.v ?? 0.4) * 0.12, t + d);
  g.gain.linearRampToValueAtTime(0, t + d + 0.04);
  return t + d;
}
export function shepard(m, t, p) {
  // one rising segment: 6 octave-spaced sines each glide up an octave over d; seamless when chained per d.
  const ac = m.ac, d = p.d ?? 2, v = (p.v ?? 0.4) * 0.08, base = mtof(p.n ?? 26);
  const g = out(m, p, 0.3); g.gain.value = v;
  const bell = (x) => Math.max(TINY, Math.exp(-Math.pow((x - 3) / 1.3, 2)));
  for (let k = 0; k < 6; k++) {
    const pg = gain(ac, 0, g);
    const o = osc(ac, "sine", base * Math.pow(2, k), t, t + d + 0.02, pg);
    o.frequency.exponentialRampToValueAtTime(base * Math.pow(2, k + 1), t + d);
    pg.gain.setValueAtTime(bell(k), t);
    pg.gain.linearRampToValueAtTime(bell(k + 1), t + d);
  }
  return t + d;
}
export function siren(m, t, p) {
  // string siren glissando up then down
  const ac = m.ac, d = p.d ?? 2, v = (p.v ?? 0.5) * 0.08, f = mtof(p.n ?? 76);
  const g = out(m, p, 0.5);
  const lp = filter(ac, "lowpass", 5000, 0.8, g);
  for (let k = 0; k < 3; k++) {
    const o = osc(ac, "sawtooth", f, t, t + d + 0.2, lp, (k - 1) * 15);
    o.frequency.exponentialRampToValueAtTime(f * Math.pow(2, (p.up ?? 7) / 12), t + d * 0.5);
    o.frequency.exponentialRampToValueAtTime(f * Math.pow(2, (p.down ?? -5) / 12), t + d);
  }
  sustain(g.gain, t, v, d * 0.2, d * 0.8, 0.2);
  return t + d;
}
export function glitch(m, t, p) {
  // stuttering bursts of random squares / crushed noise
  const ac = m.ac, d = p.d ?? 0.4, v = (p.v ?? 0.4) * 0.12;
  const g = out(m, p, 0.1); g.gain.value = 1;
  const cr = shaper(ac, 5, "crush"); cr.connect(g);
  const n = Math.max(2, Math.floor(d / 0.035));
  const base = mtof(p.n ?? 60);
  for (let i = 0; i < n; i++) {
    const ti = t + i * (d / n);
    if (Math.random() < 0.25) continue;
    const pg = gain(ac, 0, cr);
    if (Math.random() < 0.5) osc(ac, "square", base * Math.pow(2, Math.floor(rand(-12, 24)) / 12), ti, ti + 0.03, pg);
    else noiseHit(ac, pg, ti, { type: "bandpass", f: rand(500, 6000), q: 3, d: 0.025, gain: 2 });
    pg.gain.setValueAtTime(v, ti); pg.gain.setValueAtTime(0, ti + 0.028);
  }
  return t + d;
}
export function sub(m, t, p) {
  const ac = m.ac, d = p.d ?? 4, v = (p.v ?? 0.5) * 0.3;
  const g = out(m, p, 0);
  osc(ac, "sine", mtof(p.n ?? 26), t, t + d + (p.r ?? 1) + 0.1, g);
  sustain(g.gain, t, v, p.a ?? 0.8, d, p.r ?? 1);
  return t + d + (p.r ?? 1);
}
export function drop(m, t, p) {
  // bass drop: huge distorted sub sweep
  const ac = m.ac, d = p.d ?? 2.5, v = (p.v ?? 0.8) * 0.5;
  const g = out(m, p, 0.1);
  const sh = shaper(ac, 3); sh.connect(g);
  const lp = filter(ac, "lowpass", 400, 1, sh);
  const o = osc(ac, "sine", 90, t, t + d + 0.1, lp);
  o.frequency.exponentialRampToValueAtTime(28, t + d);
  const o2 = osc(ac, "sawtooth", 45, t, t + d + 0.1, gain(ac, 0.3, lp), 10);
  o2.frequency.exponentialRampToValueAtTime(14, t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.setTargetAtTime(0, t + d * 0.6, d * 0.2);
  return t + d;
}
export function scream(m, t, p) {
  // a synthetic scream rendered to a buffer (optionally reversed) - used by the monster ending sting
  const key = "scream";
  const b = jsBuffer(m.ac, key, 2.2, BUF_SR, (d, sr, len) => {
    const r = rng(99);
    let ph = 0, ph2 = 0, y = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / sr;
      const f = 820 + 260 * Math.sin(tt * 2.2) + 90 * Math.sin(tt * 37) + 400 * tt;
      ph += f / sr; ph2 += (f * 1.51) / sr;
      const saw = (ph % 1) * 2 - 1, saw2 = (ph2 % 1) * 2 - 1;
      y += 0.25 * ((r() * 2 - 1) - y);
      const env = Math.min(1, tt * 8) * Math.max(0, 1 - tt / 2.2);
      d[i] = Math.tanh((saw * 0.5 + saw2 * 0.3 + y * 0.6) * 2.2) * env * 0.8;
    }
  });
  const buf = p.reverse ? reversed(m.ac, key, b) : b;
  const ac = m.ac, g = out(m, p, 0.6);
  const bp = filter(ac, "bandpass", 1800, 0.7, g);
  src(ac, buf, t, bp, { rate: p.rate ?? 1 });
  g.gain.setValueAtTime((p.v ?? 0.5) * 0.9, t);
  return t + buf.duration;
}
// sung phrase on the formant voice: p.notes = [{ t, d, n, vow, cons }], p.opts = sing() options
export function voxPhrase(m, t, p) {
  const g = out(m, p, p.wet ?? 0.45);
  g.gain.setValueAtTime(1, t);
  return sing(m.ac, g, p.notes, p.opts || {});
}
export function sob(m, t, p) {
  const g = out(m, p, 0.4);
  g.gain.setValueAtTime(1, t);
  return vsob(m.ac, g, t, { f0: p.f0 ?? 540, g: p.v ?? 0.25 });
}

export const INSTRUMENTS = {
  kick, snare, hat, tom, timpani, hand, stomp, tamb, clap, woodblock,
  piano, revPiano, pluck, musicBox, bell,
  pad, strings, brass, organ, choir, flute, fiddle, accordion, kazoo, bass, tone, drone,
  noiseSwell, revSwell, shepard, siren, glitch, sub, drop, scream, voxPhrase, sob,
};
// instruments that get the NG+ detuned double + note skipping
export const MELODIC = new Set(["piano", "pluck", "musicBox", "flute", "fiddle", "kazoo", "brass", "strings", "organ", "choir", "accordion", "bell"]);

// pre-render the cached buffers a track will need (spread by the caller over ticks)
export function warmJobs(ac, list) {
  const jobs = [];
  for (const [inst, notes] of list) for (const n of notes) {
    if (inst === "piano") jobs.push(() => pianoBuf(ac, n));
    else if (inst === "pluck") jobs.push(() => pluckBuf(ac, n, 0.5));
    else if (inst === "musicBox") jobs.push(() => boxBuf(ac, n));
    else if (inst === "bell") jobs.push(() => bellBuf(ac, n, 6));
  }
  return jobs;
}
