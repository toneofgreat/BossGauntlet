// ARCADE JAZZ v3 — Toby Fox + hip-hop + jazz fusion, 5 minutes, very little repetition.
// 11 sections, 4 key centers (Cm → Em → F#m → Dm → Cm), unique progressions per section.

const fs = require('fs');

// ---------- transport ----------
const SR   = 44100;
const DUR  = 300;
const N    = SR * DUR;
const BPM  = 144;
const SPB  = 60 / BPM;
const BAR  = 4 * SPB;
let   SWG  = 0.62;            // swing — variable per section

// ---------- buses ----------
const L  = new Float32Array(N);
const R  = new Float32Array(N);
const cL = new Float32Array(N);   // chord bus (sidechained)
const cR = new Float32Array(N);
const sL = new Float32Array(N);   // reverb send
const sR = new Float32Array(N);
const dL = new Float32Array(N);   // delay send
const dR = new Float32Array(N);
const kickTimes = [];

// ---------- utility ----------
const TAU = Math.PI * 2;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const rand  = () => Math.random() * 2 - 1;
function pan(v, p) {
  const a = (p + 1) * Math.PI / 4;
  return [v * Math.cos(a), v * Math.sin(a)];
}

const NM = { c:0, 'c#':1, db:1, d:2, 'd#':3, eb:3, e:4, f:5, 'f#':6, gb:6,
             g:7, 'g#':8, ab:8, a:9, 'a#':10, bb:10, b:11 };
function n2m(s) {
  const m = s.toLowerCase().match(/^([a-g][#b]?)(-?\d)$/);
  if (!m) throw new Error('bad note ' + s);
  return NM[m[1]] + (parseInt(m[2]) + 1) * 12;
}
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// swing-aware position of step16 within bar
function st(bar, step16) {
  const beat = Math.floor(step16 / 4);
  const sub  = step16 % 4;
  let frac;
  if      (sub === 0) frac = 0;
  else if (sub === 1) frac = SWG * 0.5;
  else if (sub === 2) frac = SWG;
  else                frac = SWG + (1 - SWG) * 0.5;
  return bar * BAR + (beat + frac) * SPB;
}
function tt(bar, beat) { return bar * BAR + beat * SPB; }

function adsr(t, dur, a, d, sus, r) {
  if (t < 0 || t > dur + r) return 0;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - sus) * (t - a) / d;
  if (t < dur) return sus;
  return sus * (1 - (t - dur) / r);
}

function write(t, vL, vR, send = 0, dly = 0) {
  const i = (t * SR) | 0;
  if (i < 0 || i >= N) return;
  L[i] += vL; R[i] += vR;
  if (send > 0) { sL[i] += vL * send; sR[i] += vR * send; }
  if (dly  > 0) { dL[i] += vL * dly;  dR[i] += vR * dly;  }
}
function writeChord(t, vL, vR, send = 0) {
  const i = (t * SR) | 0;
  if (i < 0 || i >= N) return;
  cL[i] += vL; cR[i] += vR;
  if (send > 0) { sL[i] += vL * send; sR[i] += vR * send; }
}

// ============================================================
// VOICES
// ============================================================

function rhodes(start, dur, freq, vel, pano = 0, send = 0.25) {
  const len = Math.ceil((dur + 0.6) * SR);
  const dec = 4.5 / Math.max(0.2, freq / 220);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = adsr(t, dur, 0.004, 0.12, 0.45, 0.5);
    if (env <= 0) continue;
    const m1 = Math.sin(TAU * freq * 2.01 * t) * 0.55 * Math.exp(-t * dec);
    const m2 = Math.sin(TAU * freq * 5.0  * t) * 0.18 * Math.exp(-t * dec * 2);
    const car = Math.sin(TAU * freq * t + m1 + m2);
    const tine = 0.18 * Math.sin(TAU * freq * 3 * t) * Math.exp(-t * dec * 3);
    const s = (car + tine) * env * vel * 0.27;
    const [pl, pr] = pan(s, pano);
    writeChord(start + t, pl, pr, send);
  }
}

function upBass(start, dur, freq, vel) {
  const len = Math.ceil((dur + 0.25) * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = adsr(t, dur * 0.92, 0.003, 0.07, 0.6, 0.1);
    if (env <= 0) continue;
    const pluck = Math.exp(-t * 30) * (rand() * 0.5 + Math.sin(TAU * freq * 4 * t) * 0.5);
    const body = Math.sin(TAU * freq * t) * 0.85;
    const sub  = Math.sin(TAU * freq * 0.5 * t) * 0.35;
    const second = Math.sin(TAU * freq * 2 * t) * 0.18 * Math.exp(-t * 6);
    const s = (body + sub + second + pluck * 0.25) * env * vel * 0.34;
    write(start + t, s, s, 0.08);
  }
}

// 808 sub bass — sine with pitch glide and long tail (hip-hop)
function sub808(start, dur, freq, vel, send = 0.05) {
  const len = Math.ceil((dur + 0.6) * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = adsr(t, dur, 0.008, 0.06, 0.85, 0.5);
    if (env <= 0) continue;
    const glide = freq * (1 + 0.35 * Math.exp(-t * 18));
    const click = Math.exp(-t * 350) * rand() * 0.18;
    const body = Math.sin(TAU * glide * t);
    const second = Math.sin(TAU * glide * 2 * t) * 0.12 * Math.exp(-t * 4);
    const s = (body * 0.95 + second + click) * env * vel * 0.5;
    write(start + t, s, s, send);
  }
}

// Octave-bouncing bass (Megalovania / Toby Fox style)
// pattern[] of length 8: octave multipliers per 8th note in the bar
function octaveBassBar(barIdx, freq, vel, pattern) {
  const len8 = SPB / 2;
  for (let i = 0; i < 8; i++) {
    const t = barIdx * BAR + i * len8;
    upBass(t, len8 * 0.78, freq * pattern[i], vel);
  }
}

function vibes(start, dur, freq, vel, pano = 0, send = 0.55) {
  const len = Math.ceil((dur + 1.2) * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = adsr(t, dur, 0.002, 0.05, 0.55, 1.1);
    if (env <= 0) continue;
    const trem = 1 + 0.32 * Math.sin(TAU * 5.5 * t);
    const tone = Math.sin(TAU * freq * t) * 0.7
               + Math.sin(TAU * freq * 4 * t) * 0.20 * Math.exp(-t * 4)
               + Math.sin(TAU * freq * 10 * t) * 0.06 * Math.exp(-t * 8);
    const mallet = Math.exp(-t * 90) * (rand() * 0.35);
    const s = (tone * trem + mallet) * env * vel * 0.22;
    const [pl, pr] = pan(s, pano);
    write(start + t, pl, pr, send);
  }
}

function sax(start, dur, freq, vel, pano = 0.1, send = 0.3, delaySend = 0.18) {
  const len = Math.ceil((dur + 0.35) * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = adsr(t, dur, 0.025, 0.06, 0.85, 0.22);
    if (env <= 0) continue;
    const vib = 1 + 0.012 * Math.sin(TAU * 5.6 * t) * Math.min(1, t * 4);
    const f = freq * vib;
    const tone =
        Math.sin(TAU * f * t)
      + 0.55 * Math.sin(TAU * f * 2 * t)
      + 0.42 * Math.sin(TAU * f * 3 * t)
      + 0.22 * Math.sin(TAU * f * 4 * t)
      + 0.18 * Math.sin(TAU * f * 5 * t)
      + 0.10 * Math.sin(TAU * f * 7 * t);
    const breath = rand() * 0.06 * Math.exp(-t * 1.5);
    const s = (tone * 0.16 + breath) * env * vel;
    const [pl, pr] = pan(s, pano);
    write(start + t, pl, pr, send, delaySend);
  }
}

function muteTpt(start, dur, freq, vel, pano = -0.2, send = 0.22) {
  const len = Math.ceil((dur + 0.2) * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = adsr(t, dur, 0.008, 0.04, 0.6, 0.12);
    if (env <= 0) continue;
    const tone =
        Math.sin(TAU * freq * t)
      + (1/3) * Math.sin(TAU * freq * 3 * t)
      + (1/5) * Math.sin(TAU * freq * 5 * t)
      + (1/7) * Math.sin(TAU * freq * 7 * t);
    const formant = 0.4 * Math.sin(TAU * freq * 2 * t);
    const s = (tone + formant) * 0.11 * env * vel;
    const [pl, pr] = pan(s, pano);
    write(start + t, pl, pr, send);
  }
}

function pad(start, dur, freq, vel, pano = 0, send = 0.6) {
  const len = Math.ceil((dur + 1.0) * SR);
  const det = [1.0, 1.004, 0.996, 1.011, 0.989];
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = adsr(t, dur, 0.6, 0.3, 0.75, 0.8);
    if (env <= 0) continue;
    let s = 0;
    for (const d of det) {
      const f = freq * d;
      s += Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2 * t) + 0.25 * Math.sin(TAU * f * 3 * t);
    }
    s *= 0.025 * env * vel;
    const [pl, pr] = pan(s, pano);
    writeChord(start + t, pl, pr, send);
  }
}

function chipLead(start, dur, freq, vel, pano = 0, send = 0.18, dly = 0.25) {
  const len = Math.ceil((dur + 0.15) * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = adsr(t, dur, 0.003, 0.04, 0.85, 0.08);
    if (env <= 0) continue;
    const slide = t < 0.025 ? (freq * 1.5 - freq) * (1 - t / 0.025) : 0;
    const f = freq + slide;
    const phase = (TAU * f * t) % TAU;
    const pulse = (phase < TAU * 0.28) ? 0.6 : -0.6;
    const arp = 0.18 * Math.sign(Math.sin(TAU * f * 2 * t));
    const s = (pulse + arp) * 0.13 * env * vel;
    const [pl, pr] = pan(s, pano);
    write(start + t, pl, pr, send, dly);
  }
}

// Distorted dual-saw lead — battle / climax screamer
function distLead(start, dur, freq, vel, pano = 0, send = 0.2, dly = 0.16) {
  const len = Math.ceil((dur + 0.2) * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = adsr(t, dur, 0.005, 0.05, 0.85, 0.1);
    if (env <= 0) continue;
    const vib = 1 + 0.006 * Math.sin(TAU * 6 * t);
    const f = freq * vib;
    const det = 1.008;
    let s = Math.sin(TAU * f * t) + 0.6 * Math.sin(TAU * f * 2 * t) + 0.4 * Math.sin(TAU * f * 3 * t)
          + Math.sin(TAU * f * det * t) + 0.6 * Math.sin(TAU * f * 2 * det * t);
    s = Math.tanh(s * 1.6) * 0.18;
    s *= env * vel;
    const [pl, pr] = pan(s, pano);
    write(start + t, pl, pr, send, dly);
  }
}

function clavStab(start, dur, freq, vel, pano = 0.3, send = 0.2) {
  const len = Math.ceil((dur + 0.15) * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = adsr(t, dur, 0.002, 0.035, 0.25, 0.08);
    if (env <= 0) continue;
    const sq = Math.sign(Math.sin(TAU * freq * t)) * 0.7;
    const saw = Math.sin(TAU * freq * t) + 0.5 * Math.sin(TAU * freq * 2 * t)
              + 0.33 * Math.sin(TAU * freq * 3 * t);
    const s = (sq * 0.5 + saw * 0.3) * 0.12 * env * vel;
    const [pl, pr] = pan(s, pano);
    writeChord(start + t, pl, pr, send);
  }
}

// ============================================================
// DRUMS
// ============================================================
function kick(start, vel = 1, send = 0.05) {
  kickTimes.push(start);
  const dur = 0.22;
  const len = Math.ceil(dur * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = 130 * Math.exp(-t * 22) + 48;
    const env = Math.exp(-t * 7);
    const click = Math.exp(-t * 220) * rand() * 0.4;
    const s = (Math.sin(TAU * f * t) + click) * env * vel * 0.95;
    write(start + t, s, s, send);
  }
}
// Hip-hop kick — thumpier, no click
function trapKick(start, vel = 1, send = 0.04) {
  kickTimes.push(start);
  const dur = 0.3;
  const len = Math.ceil(dur * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = 90 * Math.exp(-t * 15) + 40;
    const env = Math.exp(-t * 5);
    const s = Math.sin(TAU * f * t) * env * vel * 1.0;
    write(start + t, s, s, send);
  }
}
function brushSnare(start, vel = 1, send = 0.35) {
  const dur = 0.22;
  const len = Math.ceil(dur * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = Math.exp(-t * 10) * (1 - Math.exp(-t * 60));
    const noise = rand();
    const tone = Math.sin(TAU * 200 * t) * 0.18 * Math.exp(-t * 14);
    const s = (noise * 0.85 + tone) * env * vel * 0.35;
    write(start + t, s * 0.9, s, send);
  }
}
function snare(start, vel = 1, send = 0.4) {
  const dur = 0.18;
  const len = Math.ceil(dur * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = Math.exp(-t * 16);
    const tone = Math.sin(TAU * 230 * t) * 0.42 + Math.sin(TAU * 340 * t) * 0.22;
    const noise = rand();
    const s = (tone + noise * 0.95) * env * vel * 0.42;
    write(start + t, s, s, send);
  }
}
// Hip-hop snare — fatter, more body, more reverb send
function trapSnare(start, vel = 1, send = 0.55) {
  const dur = 0.25;
  const len = Math.ceil(dur * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = Math.exp(-t * 11);
    const tone = Math.sin(TAU * 195 * t) * 0.45 + Math.sin(TAU * 290 * t) * 0.25;
    const noise = rand();
    const s = (tone + noise * 1.05) * env * vel * 0.48;
    write(start + t, s, s * 0.95, send);
  }
}
// Rim click
function rim(start, vel = 1, send = 0.15) {
  const dur = 0.05;
  const len = Math.ceil(dur * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = Math.exp(-t * 90);
    const s = (Math.sin(TAU * 1700 * t) + rand() * 0.5) * env * vel * 0.45;
    write(start + t, s, s, send);
  }
}
function hat(start, vel = 1, open = false, send = 0.15) {
  const dur = open ? 0.22 : 0.04;
  const len = Math.ceil(dur * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = Math.exp(-t * (open ? 10 : 60));
    const hi = rand() - 0.5 * (rand() * 0.7);
    const s = hi * env * vel * 0.22;
    write(start + t, s * 0.6, s, send);
  }
}
function ride(start, vel = 1, send = 0.4) {
  const dur = 0.5;
  const len = Math.ceil(dur * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = Math.exp(-t * 5);
    const tone = Math.sin(TAU * 880 * t) * 0.25
               + Math.sin(TAU * 1320 * t) * 0.2
               + Math.sin(TAU * 2210 * t) * 0.15;
    const noise = rand() * 0.5;
    const s = (tone + noise) * env * vel * 0.22;
    const [pl, pr] = pan(s, 0.35);
    write(start + t, pl, pr, send);
  }
}
function rideBell(start, vel = 1, send = 0.45) {
  const dur = 0.55;
  const len = Math.ceil(dur * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = Math.exp(-t * 4);
    const tone = Math.sin(TAU * 1480 * t) * 0.4
               + Math.sin(TAU * 2960 * t) * 0.2
               + Math.sin(TAU * 4400 * t) * 0.1;
    const click = Math.exp(-t * 80) * rand() * 0.2;
    const s = (tone + click) * env * vel * 0.24;
    const [pl, pr] = pan(s, 0.4);
    write(start + t, pl, pr, send);
  }
}
function crash(start, vel = 1, send = 0.55) {
  const dur = 1.6;
  const len = Math.ceil(dur * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = Math.exp(-t * 2.2);
    const shimmer = Math.sin(TAU * 5200 * t) * 0.1 + Math.sin(TAU * 7800 * t) * 0.08;
    const noise = rand() * 0.95;
    const s = (noise + shimmer) * env * vel * 0.28;
    write(start + t, s * 0.8, s, send);
  }
}
function tomMid(start, vel = 1, send = 0.25) {
  const dur = 0.2;
  const len = Math.ceil(dur * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = 180 * Math.exp(-t * 10) + 120;
    const env = Math.exp(-t * 8);
    const s = Math.sin(TAU * f * t) * env * vel * 0.45;
    write(start + t, s, s * 0.85, send);
  }
}

// Drum bars by mode
function drumBar(barIdx, mode = 'normal', fill = false) {
  if (mode === 'breakdown') {
    if (fill) {
      for (let i = 0; i < 4; i++) tomMid(tt(barIdx, 2.5 + i * 0.125), 0.5 + i * 0.1);
    }
    return;
  }
  if (mode === 'brush') {
    kick(tt(barIdx, 0), 0.85);
    kick(st(barIdx, 10), 0.5);
    brushSnare(tt(barIdx, 1), 0.78);
    brushSnare(tt(barIdx, 3), 0.78);
    for (let s = 0; s < 8; s++) hat(tt(barIdx, s / 2), 0.32, false);
    if (Math.random() < 0.5) brushSnare(st(barIdx, 6), 0.16);
    if (Math.random() < 0.4) brushSnare(st(barIdx, 14), 0.18);
  } else if (mode === 'normal') {
    kick(tt(barIdx, 0), 0.95);
    kick(st(barIdx, 10), 0.65);
    if (Math.random() < 0.35) kick(st(barIdx, 14), 0.5);
    snare(tt(barIdx, 1), 0.85);
    snare(tt(barIdx, 3), 0.85);
    rideBell(tt(barIdx, 0), 0.55);
    ride(st(barIdx, 2),  0.45);
    ride(tt(barIdx, 1),  0.55);
    ride(tt(barIdx, 2),  0.55);
    ride(st(barIdx, 10), 0.45);
    ride(tt(barIdx, 3),  0.55);
    ride(st(barIdx, 14), 0.45);
    if (Math.random() < 0.55) brushSnare(st(barIdx, 6), 0.22);
    if (Math.random() < 0.45) brushSnare(st(barIdx, 14), 0.22);
  } else if (mode === 'busy') {
    kick(tt(barIdx, 0), 1.0);
    kick(st(barIdx, 6), 0.6);
    kick(st(barIdx, 10), 0.75);
    if (Math.random() < 0.5) kick(st(barIdx, 14), 0.6);
    snare(tt(barIdx, 1), 0.95);
    snare(tt(barIdx, 3), 0.95);
    rideBell(tt(barIdx, 0), 0.6);
    rideBell(tt(barIdx, 2), 0.55);
    for (let s = 0; s < 8; s++) ride(tt(barIdx, s / 2), 0.45);
    if (Math.random() < 0.6) brushSnare(st(barIdx, 6), 0.28);
    if (Math.random() < 0.6) brushSnare(st(barIdx, 14), 0.28);
  } else if (mode === 'halftime') {
    // Hip-hop halftime: kick on 1 (and pickups), snare on 3
    trapKick(tt(barIdx, 0), 1.0);
    if (Math.random() < 0.55) trapKick(st(barIdx, 6), 0.6);
    if (Math.random() < 0.35) trapKick(st(barIdx, 11), 0.55);
    trapSnare(tt(barIdx, 2), 0.95);
    // hat 8ths with occasional 16th rolls
    for (let s = 0; s < 16; s++) {
      const v = (s % 4 === 0) ? 0.45 : 0.22;
      hat(barIdx * BAR + s * (SPB / 4), v, false);
    }
    // Triplet hat roll on last half of beat 4 sometimes
    if (Math.random() < 0.6) {
      for (let i = 0; i < 6; i++) hat(tt(barIdx, 3) + i * (SPB / 6), 0.28 + i * 0.04, false);
    }
    // rim accent on "and of 4"
    if (Math.random() < 0.4) rim(st(barIdx, 14), 0.55);
  } else if (mode === 'driving') {
    // 4-on-the-floor + snare on 2&4 + 8th hats
    for (let b = 0; b < 4; b++) kick(tt(barIdx, b), 1.0);
    snare(tt(barIdx, 1), 0.9);
    snare(tt(barIdx, 3), 0.9);
    for (let s = 0; s < 8; s++) hat(tt(barIdx, s / 2), 0.36, false);
    if (Math.random() < 0.4) hat(st(barIdx, 7), 0.28, true);
    if (Math.random() < 0.4) hat(st(barIdx, 15), 0.28, true);
  }
  if (fill) {
    tomMid(tt(barIdx, 2.5), 0.7);
    tomMid(tt(barIdx, 2.75), 0.8);
    snare(tt(barIdx, 3), 0.9);
    snare(tt(barIdx, 3.25), 0.85);
    snare(tt(barIdx, 3.5), 0.9);
    snare(tt(barIdx, 3.75), 1.0);
  }
}

// ============================================================
// ARCADE FX
// ============================================================
function fxOrb(start, vel = 1, pano = 0, send = 0.5) {
  const notes = [72, 76, 79, 84, 88];
  notes.forEach((m, i) => {
    const t0 = start + i * 0.045;
    const dur = 0.12;
    const len = Math.ceil(dur * SR);
    const f = mtof(m);
    for (let n = 0; n < len; n++) {
      const t = n / SR;
      const env = Math.exp(-t * 10) * (1 - Math.exp(-t * 120));
      const s = Math.sin(TAU * f * t) * env * 0.22 * vel;
      const [pl, pr] = pan(s, pano);
      write(t0 + t, pl, pr, send, 0.2);
    }
  });
}
function fxCoin(start, vel = 1, pano = 0, send = 0.3) {
  const seq = [[88, 0.05], [95, 0.18]];
  let t0 = start;
  for (const [m, d] of seq) {
    const f = mtof(m);
    const len = Math.ceil(d * SR);
    for (let n = 0; n < len; n++) {
      const t = n / SR;
      const env = Math.exp(-t * 7);
      const sq = Math.sign(Math.sin(TAU * f * t));
      const s = sq * env * 0.14 * vel;
      const [pl, pr] = pan(s, pano);
      write(t0 + t, pl, pr, send, 0.15);
    }
    t0 += d;
  }
}
function fxJump(start, vel = 1, pano = 0, send = 0.25) {
  const dur = 0.18;
  const len = Math.ceil(dur * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = 320 + 1000 * (t / dur);
    const env = Math.exp(-t * 8);
    const sq = Math.sign(Math.sin(TAU * f * t));
    const s = sq * env * 0.1 * vel;
    const [pl, pr] = pan(s, pano);
    write(start + t, pl, pr, send);
  }
}
function fxLaser(start, vel = 1, pano = 0, send = 0.35) {
  const dur = 0.3;
  const len = Math.ceil(dur * SR);
  let phase = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = 2000 * Math.exp(-t * 5) + 90;
    phase += TAU * f / SR;
    const saw = (phase % TAU) / Math.PI - 1;
    const env = Math.exp(-t * 4);
    const s = saw * env * 0.12 * vel;
    const [pl, pr] = pan(s, pano);
    write(start + t, pl, pr, send, 0.18);
  }
}
function fxPop(start, vel = 1, pano = 0, send = 0.2) {
  const dur = 0.13;
  const len = Math.ceil(dur * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = 850 - 550 * (t / dur);
    const env = Math.exp(-t * 14);
    const s = Math.sin(TAU * f * t) * env * 0.2 * vel;
    const [pl, pr] = pan(s, pano);
    write(start + t, pl, pr, send);
  }
}
function fxPowerup(start, vel = 1, pano = 0, send = 0.3) {
  const notes = [60, 64, 67, 72, 76, 79, 84, 88, 91];
  notes.forEach((m, i) => {
    const t0 = start + i * 0.045;
    const dur = 0.1;
    const len = Math.ceil(dur * SR);
    const f = mtof(m);
    for (let n = 0; n < len; n++) {
      const t = n / SR;
      const env = Math.exp(-t * 9);
      const sq = Math.sign(Math.sin(TAU * f * t));
      const s = sq * env * 0.12 * vel;
      const [pl, pr] = pan(s, pano);
      write(t0 + t, pl, pr, send, 0.15);
    }
  });
}
function fxStart(start, vel = 1, send = 0.35) {
  const seq = [[72, 0.08], [76, 0.08], [79, 0.08], [84, 0.3]];
  let t0 = start;
  for (const [m, d] of seq) {
    const f = mtof(m);
    const len = Math.ceil(d * SR);
    for (let n = 0; n < len; n++) {
      const t = n / SR;
      const env = Math.exp(-t * 5);
      const sq = Math.sign(Math.sin(TAU * f * t));
      const s = sq * env * 0.16 * vel;
      write(t0 + t, s, s, send, 0.2);
    }
    t0 += d;
  }
}
function fxRiser(start, dur, vel = 1, send = 0.4) {
  const len = Math.ceil(dur * SR);
  let phase = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = 100 * Math.pow(40, t / dur);
    phase += TAU * f / SR;
    const saw = (phase % TAU) / Math.PI - 1;
    const noise = rand() * 0.6 * (t / dur);
    const env = Math.pow(t / dur, 1.4);
    const s = (saw * 0.6 + noise) * env * 0.18 * vel;
    write(start + t, s * 0.9, s, send, 0.1);
  }
}
function fxVictory(start, vel = 1, send = 0.4) {
  const seq = [
    [67, 0.12], [72, 0.12], [76, 0.12], [79, 0.18],
    [76, 0.10], [79, 0.10], [84, 0.5]
  ];
  let t0 = start;
  for (const [m, d] of seq) {
    const f = mtof(m);
    const len = Math.ceil(d * SR);
    for (let n = 0; n < len; n++) {
      const t = n / SR;
      const env = Math.exp(-t * 4);
      const sq = Math.sign(Math.sin(TAU * f * t));
      const harm = Math.sin(TAU * f * 2 * t) * 0.3;
      const s = (sq + harm) * env * 0.13 * vel;
      write(t0 + t, s, s, send, 0.2);
    }
    t0 += d;
  }
}
// "Scratch" turntable FX for hip-hop sections
function fxScratch(start, vel = 1, pano = 0) {
  const dur = 0.25;
  const len = Math.ceil(dur * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    // Sweep up then back down (record pull/push)
    const phase01 = t / dur;
    const sweep = 1 - Math.abs(2 * phase01 - 1);
    const f = 200 + 1400 * sweep;
    const noise = rand() * 0.5;
    const tone = Math.sin(TAU * f * t) * 0.7 + noise;
    const env = Math.exp(-t * 6);
    const s = tone * env * 0.15 * vel;
    const [pl, pr] = pan(s, pano);
    write(start + t, pl, pr, 0.25, 0.1);
  }
}
// Minecraft-style "ding" reward — pure bell tone
function fxDing(start, vel = 1, pano = 0, send = 0.6) {
  const dur = 1.2;
  const len = Math.ceil(dur * SR);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = Math.exp(-t * 3);
    const f0 = mtof(96);
    const tone = Math.sin(TAU * f0 * t)
               + 0.4 * Math.sin(TAU * f0 * 2.76 * t) * Math.exp(-t * 4)
               + 0.2 * Math.sin(TAU * f0 * 5.4 * t) * Math.exp(-t * 6);
    const s = tone * env * 0.13 * vel;
    const [pl, pr] = pan(s, pano);
    write(start + t, pl, pr, send, 0.3);
  }
}

// ============================================================
// CHORD LIBRARY (rootless / drop voicings)
// ============================================================
const V = {
  // jazz, Cm
  'Cm9':    ['Eb4','G4','Bb4','D5'],
  'Abmaj7': ['C4','Eb4','G4'],
  'Abmaj9': ['C4','Eb4','G4','Bb4'],
  'Fm9':    ['Ab3','C4','Eb4','G4'],
  'G7alt':  ['B3','F4','Ab4','Eb5'],
  'Ebmaj7': ['G3','Bb3','D4','F4'],
  'Dbmaj7': ['F3','Ab3','C4','Eb4'],
  'F9':     ['Eb4','A4','D5'],
  'Bb9':    ['Ab3','D4','C5'],
  'Ab7':    ['C4','Eb4','Gb4'],
  'G7sus':  ['F4','C5','D5'],
  // hip-hop simple triads (Cm)
  'Cm':     ['Eb4','G4','Bb4'],
  'Ab':     ['C4','Eb4','G4'],
  'Eb':     ['G3','Bb3','D4'],
  'Bb':     ['D4','F4','Ab4'],
  'Bb7':    ['D4','Ab4','C5'],
  'Fm':     ['Ab3','C4','Eb4'],
  'F':      ['A3','C4','Eb4'],
  'Db':     ['F3','Ab3','C4'],
  'G':      ['B3','D4','F4'],
  'G7':     ['F4','A4','B4','E5'],
  // battle Em — Toby Fox vi-IV-I-V
  'Em':     ['G4','B4','D5','F#5'],
  'Em9':    ['G4','B4','D5','F#5'],
  'CmajT':  ['E4','G4','B4','D5'],         // (Cmaj9 alias in battle)
  'GmajT':  ['B3','D4','F#4','A4'],
  'D9':     ['F#4','C5','E5'],
  'B7':     ['D#4','A4','C#5'],
  'Am9':    ['C4','E4','G4','B4'],
  // bridge F#m
  'F#m9':   ['A4','C#5','E5','G#5'],
  'Dmaj9':  ['F#4','A4','C#5','E5'],
  'Amaj9':  ['C#4','E4','G#4','B4'],
  'Emaj9':  ['G#4','B4','D#5','F#5'],
  'C#m9':   ['E4','G#4','B4','D#5'],
  'Bm9':    ['D4','F#4','A4','C#5'],
  'C#7':    ['F4','B4','D5','G5'],
  // build pedal
  'F#7sus': ['B4','C#5','E5'],
  'A7sus':  ['D5','E5','G5'],
  'Bb7sus': ['Eb5','F5','Ab5'],
  'B7sus':  ['E5','F#5','A5'],
  // climax Dm
  'Dm9':    ['F4','A4','C5','E5'],
  'Bbmaj7': ['D4','F4','A4'],
  'Bbmaj9': ['D4','F4','A4','C5'],
  'Fmaj7':  ['A3','C4','E4'],
  'Fmaj9':  ['A3','C4','E4','G4'],
  'Cmaj7':  ['E4','G4','B4'],
  'Cmaj9':  ['E4','G4','B4','D5'],
  'Cmaj13': ['E4','G4','B4','D5','A5'],
  'Gm7':    ['Bb3','D4','F4'],
  'Gm9':    ['Bb3','D4','F4','A4'],
  'A7alt':  ['C#4','G4','Bb4','Eb5'],
  'Eb9':    ['D4','G4','Ab4','F5'],
  'Em7b5':  ['G3','Bb3','D4','F4'],
  'F#dim7': ['F#3','A3','C4','Eb4'],
  // final tag
  'Cm11':   ['Eb4','G4','Bb4','D5','F5'],
};

const ROOT = {
  'Cm9':'C2','Abmaj7':'Ab2','Abmaj9':'Ab2','Fm9':'F2','G7alt':'G2','Ebmaj7':'Eb3',
  'Dbmaj7':'Db3','F9':'F2','Bb9':'Bb2','Ab7':'Ab2','G7sus':'G2',
  'Cm':'C2','Ab':'Ab2','Eb':'Eb3','Bb':'Bb2','Bb7':'Bb2','Fm':'F2','F':'F2','Db':'Db3','G':'G2','G7':'G2',
  'Em':'E2','Em9':'E2','CmajT':'C3','GmajT':'G2','D9':'D3','B7':'B2','Am9':'A2',
  'F#m9':'F#2','Dmaj9':'D3','Amaj9':'A2','Emaj9':'E3','C#m9':'C#3','Bm9':'B2','C#7':'C#3',
  'F#7sus':'F#2','A7sus':'A2','Bb7sus':'Bb2','B7sus':'B2',
  'Dm9':'D3','Bbmaj7':'Bb2','Bbmaj9':'Bb2','Fmaj7':'F2','Fmaj9':'F2','Cmaj7':'C3','Cmaj9':'C3','Cmaj13':'C3',
  'Gm7':'G2','Gm9':'G2','A7alt':'A2','Eb9':'Eb3','Em7b5':'E3','F#dim7':'F#2','Cm11':'C2',
};

// Chord quality for walking bass (3rd interval)
function chordThird(name) {
  // minor-ish if 'm' but not 'maj'
  if (/m(?!aj)/.test(name) || /dim/.test(name) || /alt/.test(name)) return 3;
  return 4;
}

// ============================================================
// COMP / BASS / TIME
// ============================================================
function compBar(barIdx, chordName, intensity, instrument = 'rhodes') {
  const voicing = V[chordName];
  if (!voicing) return;
  const hits = [
    [tt(barIdx, 0),                    SPB * 0.9, 0.55 * intensity],
    [tt(barIdx, 1) + SWG * SPB * 0,    SPB * 0.4, 0.30 * intensity],
    [tt(barIdx, 2),                    SPB * 0.9, 0.55 * intensity],
    [tt(barIdx, 3) + (SWG - 0.5) * SPB,SPB * 0.4, 0.32 * intensity],
  ];
  const dropPush = Math.random() < 0.35;
  for (let i = 0; i < hits.length; i++) {
    if ((i === 1 || i === 3) && dropPush && Math.random() < 0.5) continue;
    const [t, dur, v] = hits[i];
    voicing.forEach((nm, vi) => {
      const f = mtof(n2m(nm));
      if (instrument === 'rhodes') rhodes(t, dur, f, v * (vi === 0 ? 0.95 : 0.78), -0.25);
      else if (instrument === 'clav') clavStab(t, dur, f, v * (vi === 0 ? 1 : 0.85), 0.3);
    });
  }
}

// One sustained chord hit at start of bar (for hip-hop / build)
function chordHold(barIdx, chordName, bars, vel, pano = -0.15) {
  const voicing = V[chordName];
  if (!voicing) return;
  const dur = bars * BAR * 0.95;
  voicing.forEach((nm, vi) => {
    rhodes(barIdx * BAR, dur, mtof(n2m(nm)), vel * (vi === 0 ? 1 : 0.8), pano + (vi - 1.5) * 0.07);
  });
}

function padBar(barIdx, chordName, vel) {
  const voicing = V[chordName];
  if (!voicing) return;
  voicing.forEach((nm, vi) => {
    pad(barIdx * BAR, BAR * 0.95, mtof(n2m(nm)) * 0.5, vel * (vi === 0 ? 1 : 0.8),
        (vi - voicing.length / 2) * 0.15);
  });
}

function walkBar(barIdx, chordName, nextChord, vel = 0.95) {
  const root = n2m(ROOT[chordName]);
  const nextRoot = n2m(ROOT[nextChord] || ROOT[chordName]);
  const third = root + chordThird(chordName);
  const fifth = root + 7;
  const approach = (Math.random() < 0.55 ? nextRoot - 1 : nextRoot + 1);
  let line = [root, third, fifth, approach];
  if (barIdx % 8 === 7) line = [root, fifth, root + 12, approach];
  for (let b = 0; b < 4; b++) {
    let m = line[b];
    while (m > 50) m -= 12;
    while (m < 30) m += 12;
    upBass(tt(barIdx, b), SPB * 0.88, mtof(m), vel);
  }
}

// Hip-hop 808 bass: sparse, syncopated, sub
function bass808Bar(barIdx, chordName, vel = 1) {
  const root = n2m(ROOT[chordName]);
  let m = root;
  while (m > 40) m -= 12;
  while (m < 24) m += 12;
  const f = mtof(m);
  sub808(tt(barIdx, 0), SPB * 1.6, f, vel);
  // syncopated hit on "and of 3" or beat 3.5
  if (Math.random() < 0.7) sub808(st(barIdx, 11), SPB * 0.9, f, vel * 0.85);
  // occasional 5th hit
  if (Math.random() < 0.35) sub808(st(barIdx, 14), SPB * 0.7, mtof(m + 7), vel * 0.6);
}

// ============================================================
// THEMES (all unique — no repeats across the song)
// ============================================================

// THEME_A — jazz, in Cm (16 bars over Cm9/Abmaj7/Fm9/G7alt etc.)
const TH_A = [
  // bar 1 (Cm9)
  [67, 1], [70, 0.5], [72, 0.5], [75, 1], [74, 0.5], [72, 0.5],
  // bar 2 (Abmaj7)
  [70, 1.5], [67, 0.5], [65, 2],
  // bar 3 (Fm9)
  [65, 1], [68, 0.5], [70, 0.5], [72, 1], [70, 0.5], [68, 0.5],
  // bar 4 (G7alt)
  [67, 0.5], [70, 0.5], [70, 1], [67, 2],
  // bar 5 (Cm9)
  [63, 1], [67, 0.5], [70, 0.5], [74, 0.5], [72, 0.5], [70, 1],
  // bar 6 (Ebmaj7)
  [70, 0.5], [74, 0.5], [77, 1], [75, 0.5], [74, 0.5], [72, 1],
  // bar 7 (Dbmaj7)
  [72, 1], [75, 0.5], [73, 0.5], [70, 1], [68, 1],
  // bar 8 (G7alt)
  [70, 0.5], [67, 0.5], [65, 1], [62, 2],
  // bar 9 (Cm9)
  [67, 0.5], [70, 0.5], [74, 0.5], [75, 0.5], [77, 1], [74, 1],
  // bar 10 (F9)
  [75, 1], [70, 0.5], [68, 0.5], [67, 2],
  // bar 11 (Bb9)
  [65, 1], [62, 0.5], [65, 0.5], [70, 1], [72, 1],
  // bar 12 (Ebmaj7)
  [75, 0.5], [74, 0.5], [72, 1], [70, 2],
  // bar 13 (Cm9)
  [67, 1], [70, 1], [74, 0.5], [75, 0.5], [77, 1],
  // bar 14 (Ab7)
  [76, 0.5], [75, 0.5], [73, 1], [72, 0.5], [70, 0.5], [68, 1],
  // bar 15 (G7sus)
  [67, 1], [65, 1], [67, 0.5], [62, 0.5], [60, 1],
  // bar 16 (G7alt)
  [63, 1], [62, 1], [65, 2],
];

// THEME_BATTLE — Em, Toby Fox style, leaping with chromatic notes (16 bars)
const TH_BATTLE = [
  // bar 1 (Em)
  [76, 0.5], [76, 0.5], [88, 0.5], [83, 0.5], [79, 0.5], [76, 0.5], [83, 1],
  // bar 2 (CmajT)
  [72, 0.5], [76, 0.5], [79, 0.5], [83, 0.5], [76, 0.5], [79, 0.5], [74, 1],
  // bar 3 (GmajT)
  [71, 0.5], [74, 0.5], [79, 0.5], [83, 0.5], [86, 0.5], [83, 0.5], [79, 1],
  // bar 4 (D9)
  [74, 0.5], [78, 0.5], [81, 0.5], [86, 0.5], [83, 1], [81, 1],
  // bar 5 (Em)
  [88, 0.5], [88, 0.5], [86, 0.5], [83, 0.5], [88, 0.5], [86, 0.5], [83, 1],
  // bar 6 (GmajT)
  [86, 0.5], [83, 0.5], [79, 0.5], [78, 0.5], [76, 0.5], [74, 0.5], [72, 1],
  // bar 7 (CmajT)
  [76, 0.5], [79, 0.5], [83, 0.5], [86, 0.5], [88, 1], [86, 1],
  // bar 8 (B7)
  [83, 1], [82, 0.5], [79, 0.5], [78, 0.5], [76, 0.5], [74, 1],
  // bar 9 (Em)
  [76, 0.5], [79, 0.5], [83, 0.5], [88, 0.5], [86, 0.5], [83, 0.5], [79, 0.5], [76, 0.5],
  // bar 10 (CmajT)
  [79, 1], [83, 1], [76, 0.5], [74, 0.5], [72, 1],
  // bar 11 (D9)
  [78, 0.5], [81, 0.5], [86, 0.5], [90, 0.5], [88, 1], [86, 1],
  // bar 12 (Em)
  [88, 0.5], [83, 0.5], [86, 0.5], [82, 0.5], [83, 0.5], [79, 0.5], [76, 1],
  // bar 13 (Em)
  [67, 0.5], [71, 0.5], [74, 0.5], [76, 0.5], [79, 0.5], [83, 0.5], [88, 1],
  // bar 14 (GmajT)
  [86, 0.5], [83, 0.5], [79, 0.5], [76, 0.5], [74, 0.5], [71, 0.5], [67, 1],
  // bar 15 (Am9)
  [69, 0.5], [72, 0.5], [76, 0.5], [79, 0.5], [83, 1], [81, 1],
  // bar 16 (B7)
  [79, 0.5], [78, 0.5], [76, 0.5], [74, 0.5], [71, 1], [76, 1],
];

// THEME_BRIDGE — F#m mysterious counter-melody (12 bars)
const TH_BRIDGE = [
  // bar 1 (F#m9)
  [78, 1.5], [82, 0.5], [85, 1], [82, 1],
  // bar 2 (Dmaj9)
  [78, 1], [82, 1], [85, 0.5], [82, 0.5], [78, 1],
  // bar 3 (Amaj9)
  [76, 1], [73, 1], [69, 2],
  // bar 4 (Emaj9)
  [76, 0.5], [80, 0.5], [83, 1], [80, 0.5], [76, 0.5], [73, 1],
  // bar 5 (F#m9)
  [82, 1], [85, 1], [89, 1], [85, 1],
  // bar 6 (C#m9)
  [82, 1], [80, 1], [76, 0.5], [73, 0.5], [70, 1],
  // bar 7 (Bm9)
  [78, 1], [74, 1], [71, 2],
  // bar 8 (C#7)
  [73, 0.5], [76, 0.5], [80, 1], [83, 2],
  // bar 9 (F#m9)
  [85, 0.5], [89, 0.5], [90, 0.5], [89, 0.5], [85, 1], [82, 1],
  // bar 10 (Dmaj9)
  [82, 1], [78, 0.5], [82, 0.5], [85, 2],
  // bar 11 (Emaj9)
  [83, 1], [80, 0.5], [76, 0.5], [73, 2],
  // bar 12 (C#7)
  [76, 0.5], [80, 0.5], [83, 1], [88, 2],
];

// THEME_CLIMAX — Dm, triumphant, brand-new melody (24 bars)
const TH_CLIMAX = [
  // bar 1 (Dm9)
  [74, 0.5], [77, 0.5], [81, 1], [86, 1], [84, 1],
  // bar 2 (Bbmaj7)
  [82, 0.5], [81, 0.5], [77, 1], [74, 0.5], [77, 0.5], [82, 1],
  // bar 3 (Fmaj7)
  [81, 1], [84, 1], [86, 1], [84, 1],
  // bar 4 (Cmaj7)
  [83, 0.5], [81, 0.5], [79, 0.5], [76, 0.5], [72, 2],
  // bar 5 (Dm9)
  [74, 0.5], [77, 0.5], [81, 0.5], [86, 0.5], [89, 1], [86, 1],
  // bar 6 (Gm7)
  [82, 0.5], [81, 0.5], [77, 1], [74, 2],
  // bar 7 (A7alt)
  [76, 1], [80, 1], [82, 0.5], [80, 0.5], [78, 1],
  // bar 8 (Dm9)
  [77, 0.5], [76, 0.5], [74, 2], [69, 1],
  // bar 9 (Dm9)
  [81, 0.5], [86, 0.5], [89, 0.5], [93, 0.5], [89, 1], [86, 1],
  // bar 10 (F9)
  [84, 1], [81, 0.5], [80, 0.5], [78, 2],
  // bar 11 (Bbmaj7)
  [77, 0.5], [81, 0.5], [86, 1], [89, 1], [86, 1],
  // bar 12 (Eb9)
  [84, 0.5], [82, 0.5], [80, 1], [77, 2],
  // bar 13 (Em7b5)
  [76, 0.5], [79, 0.5], [82, 0.5], [85, 0.5], [86, 1], [84, 1],
  // bar 14 (A7alt)
  [80, 0.5], [82, 0.5], [80, 0.5], [78, 0.5], [76, 1], [74, 1],
  // bar 15 (Dm9)
  [77, 1], [81, 1], [86, 1], [89, 1],
  // bar 16 (Dm9)
  [93, 1], [89, 1], [86, 2],
  // bar 17 (Dm9)
  [74, 0.5], [77, 0.5], [81, 1], [84, 1], [86, 1],
  // bar 18 (Bbmaj7)
  [89, 0.5], [86, 0.5], [82, 1], [81, 2],
  // bar 19 (Gm7)
  [79, 0.5], [82, 0.5], [86, 1], [89, 1], [86, 1],
  // bar 20 (A7alt)
  [82, 0.5], [80, 0.5], [78, 0.5], [76, 0.5], [74, 1], [73, 1],
  // bar 21 (Dm9)
  [77, 0.5], [81, 0.5], [86, 0.5], [89, 0.5], [93, 1], [86, 1],
  // bar 22 (A7alt)
  [84, 0.5], [82, 0.5], [80, 1], [78, 2],
  // bar 23 (Dm9)
  [77, 0.5], [81, 0.5], [86, 1], [89, 0.5], [86, 0.5], [82, 1],
  // bar 24 (Dm9)
  [86, 1], [81, 1], [77, 1], [74, 1],
];

// THEME_FINAL — recall theme A but harmonized differently (16 bars)
const TH_FINAL = [
  // bar 1 (Cm9)
  [75, 1], [72, 0.5], [70, 0.5], [67, 1], [63, 1],
  // bar 2 (Abmaj7)
  [67, 0.5], [70, 0.5], [72, 1], [75, 0.5], [72, 0.5], [70, 1],
  // bar 3 (Fm9)
  [68, 1], [70, 0.5], [72, 0.5], [77, 2],
  // bar 4 (G7alt)
  [75, 0.5], [74, 0.5], [70, 1], [67, 2],
  // bar 5 (Cm9)
  [72, 0.5], [75, 0.5], [79, 0.5], [82, 0.5], [79, 1], [75, 1],
  // bar 6 (Bb9)
  [74, 0.5], [77, 0.5], [82, 0.5], [86, 0.5], [82, 1], [77, 1],
  // bar 7 (Ebmaj7)
  [75, 1], [79, 1], [82, 1], [86, 1],
  // bar 8 (Abmaj7)
  [84, 0.5], [82, 0.5], [80, 1], [79, 2],
  // bar 9 (Fm9)
  [77, 1], [75, 0.5], [74, 0.5], [72, 0.5], [70, 0.5], [68, 1],
  // bar 10 (Bb9)
  [70, 0.5], [74, 0.5], [77, 1], [70, 0.5], [74, 0.5], [77, 1],
  // bar 11 (Cm9)
  [79, 0.5], [82, 0.5], [86, 1], [82, 0.5], [79, 0.5], [75, 1],
  // bar 12 (G7sus)
  [74, 1], [70, 1], [67, 2],
  // bar 13 (Cm9)
  [70, 0.5], [72, 0.5], [75, 0.5], [79, 0.5], [82, 1], [79, 1],
  // bar 14 (F#dim7)
  [78, 0.5], [75, 0.5], [73, 0.5], [70, 0.5], [68, 2],
  // bar 15 (G7alt)
  [67, 1], [65, 1], [67, 2],
  // bar 16 (Cm9)
  [63, 4],
];

function playLine(barOffset, line, voice, vel) {
  let t = barOffset * BAR;
  for (const [m, d] of line) {
    if (m !== null) voice(t, d * SPB * 0.92, mtof(m), vel);
    t += d * SPB;
  }
}

// Improv generator (used sparingly — just for chiptune solo section)
const SCALE_CM = [60, 62, 63, 65, 67, 68, 70, 72, 74, 75, 77, 79, 80, 82, 84];
function improvLine(barStart, bars, voice, vel, seed = 1) {
  const rng = (() => { let x = seed | 0 || 1; return () => (x = (x*1664525 + 1013904223) >>> 0) / 4294967296; })();
  let t = barStart * BAR;
  const endT = (barStart + bars) * BAR;
  while (t < endT - 0.1) {
    const choices = [0.25, 0.25, 0.5, 0.5, 0.5, 0.75, 1, 1.5];
    const d = choices[Math.floor(rng() * choices.length)];
    const dur = d * SPB;
    if (rng() < 0.18) { t += dur; continue; }
    const idx = 5 + Math.floor(rng() * (SCALE_CM.length - 6));
    let m = SCALE_CM[idx];
    if (rng() < 0.25) m += (rng() < 0.5 ? -1 : 1);
    voice(t, dur * 0.94, mtof(m), vel);
    t += dur;
  }
}

// ============================================================
// ARRANGEMENT (11 sections, all-unique progressions)
// ============================================================
console.log('Composing arrangement...');

// Each section: bars, swing, chord-per-bar prog (length matches bars)
const sections = [
  // 1. INTRO 12 bars — Cm pedal, mysterious, FX wake-up
  { name:'intro',     bars:12, swg:0.6,
    prog:['Cmaj7','Cmaj7','Cmaj7','Cmaj7','Cm9','Cm9','Fm9','Fm9','Cm9','Cm9','G7sus','G7alt']
  },
  // 2. THEME A (jazz, Cm) 20 bars
  { name:'themeA',    bars:20, swg:0.62,
    prog:['Cm9','Abmaj7','Fm9','G7alt',  'Cm9','Ebmaj7','Dbmaj7','G7alt',
          'Cm9','F9','Bb9','Ebmaj7',     'Cm9','Ab7','G7sus','G7alt',
          'Cm9','F#dim7','G7alt','Cm9']
  },
  // 3. HIPHOP TURN (halftime, Cm) 16 bars
  { name:'hiphop',    bars:16, swg:0.56,
    prog:['Cm','Ab','Eb','Bb',          'Cm','F','Db','G7',
          'Cm','Ab','Eb','G7sus',       'Cm','Db','Bb7','G7alt']
  },
  // 4. BATTLE (Em, Toby Fox) 20 bars
  { name:'battle',    bars:20, swg:0.5,
    prog:['Em','CmajT','GmajT','D9',    'Em','GmajT','CmajT','B7',
          'Em','CmajT','D9','Em',       'Em','GmajT','Am9','B7',
          'Em','D9','CmajT','B7']
  },
  // 5. CHIPTUNE SOLO (modulating, settles back through ii-V) 16 bars
  { name:'chipsolo',  bars:16, swg:0.55,
    prog:['Am9','Fmaj9','Cmaj9','GmajT','Dm9','Bb9','Fmaj7','A7alt',
          'Dm9','GmajT','Cmaj7','A7alt','Dm9','G7','Cmaj7','C#7']
  },
  // 6. BRIDGE (F#m, mysterious) 12 bars
  { name:'bridge',    bars:12, swg:0.6,
    prog:['F#m9','Dmaj9','Amaj9','Emaj9','F#m9','C#m9','Bm9','C#7',
          'F#m9','Dmaj9','Emaj9','C#7']
  },
  // 7. BUILD (pedal up) 8 bars
  { name:'build',     bars:8,  swg:0.5,
    prog:['F#7sus','F#7sus','G7sus','G7sus','A7sus','A7sus','Bb7sus','B7sus']
  },
  // 8. CLIMAX (Dm, new theme!) 32 bars
  { name:'climax',    bars:32, swg:0.5,
    prog:['Dm9','Bbmaj7','Fmaj7','Cmaj7',  'Dm9','Gm7','A7alt','Dm9',
          'Dm9','F9','Bbmaj7','Eb9',       'Em7b5','A7alt','Dm9','Dm9',
          'Dm9','Bbmaj7','Gm7','A7alt',    'Dm9','A7alt','Dm9','Dm9',
          'Dm9','Bbmaj7','Fmaj7','A7alt',  'Dm9','Em7b5','A7alt','Dm9']
  },
  // 9. FINAL THEME (back to Cm, recalled with new harmony) 16 bars
  { name:'finalA',    bars:16, swg:0.6,
    prog:['Cm9','Abmaj7','Fm9','G7alt',  'Cm9','Bb9','Ebmaj7','Abmaj7',
          'Fm9','Bb9','Cm9','G7sus',     'Cm9','F#dim7','G7alt','Cm9']
  },
  // 10. HIPHOP OUTRO (Cm, halftime, winding down) 16 bars
  { name:'hipoutro',  bars:16, swg:0.56,
    prog:['Cm','Ab','Eb','G',     'Cm','Bb','Ab','G7sus',
          'Cm','Ab','Fm','G7alt', 'Cm','F','Db','Cm']
  },
  // 11. TAG (Cm sustained, finale) 8 bars
  { name:'tag',       bars:8,  swg:0.5,
    prog:['Cm11','Cm11','Cm11','Cm11','Cm11','Cm11','Cm11','Cm11']
  }
];

// Build flat chord track
const chordTrack = [];
for (const s of sections) for (let i = 0; i < s.bars; i++) chordTrack.push(s.prog[i] || s.prog[s.prog.length - 1]);
const TOTAL_BARS = chordTrack.length;
console.log('  bars: ' + TOTAL_BARS + '  (' + (TOTAL_BARS * BAR).toFixed(1) + 's)');

// Section start helpers
let cursor = 0;
const start = {};
for (const s of sections) { start[s.name] = cursor; cursor += s.bars; }

// ---------- 1. INTRO ----------
SWG = 0.6;
{
  const b0 = start.intro;
  fxStart(b0 * BAR + 0.25, 1.0, 0.4);
  fxCoin(b0 * BAR + 1.5, 0.9, -0.3);
  fxCoin(b0 * BAR + 1.75, 0.9, 0.3);
  fxDing(b0 * BAR + 3.5, 0.9, 0, 0.6);
  // Vibraphone arpeggio bars 0..7
  const arp = [60, 64, 67, 71, 74, 79, 74, 71];
  for (let b = 0; b < 8; b++) {
    if (b >= 2) padBar(b0 + b, chordTrack[b0 + b], 0.18 + b * 0.04);
    for (let s = 0; s < 8; s++) {
      if (Math.random() < 0.7) {
        const m = arp[s] + (b < 4 ? 0 : 7);
        vibes((b0 + b) * BAR + s * (SPB / 2), 0.55, mtof(m), 0.32 + b * 0.04, ((s % 2) - 0.5) * 0.7);
      }
    }
    if (b >= 6) for (let i = 0; i < 4; i++) ride((b0 + b) * BAR + i * SPB, 0.32);
  }
  // bars 8..11 count-in
  for (let b = 8; b < 12; b++) {
    compBar(b0 + b, chordTrack[b0 + b], 0.55, 'rhodes');
    walkBar(b0 + b, chordTrack[b0 + b], chordTrack[b0 + b + 1], 0.85);
    drumBar(b0 + b, 'brush');
  }
  // riser into theme A
  fxRiser((b0 + 10) * BAR, 2 * BAR, 0.85, 0.5);
  fxPowerup((b0 + 12) * BAR - 0.3, 0.9, 0, 0.45);
}

// ---------- 2. THEME A (jazz) ----------
SWG = 0.62;
{
  const b0 = start.themeA;
  crash(b0 * BAR, 0.7);
  for (let i = 0; i < 20; i++) {
    const ch = chordTrack[b0 + i];
    const nx = chordTrack[b0 + i + 1] || ch;
    compBar(b0 + i, ch, 0.85, 'rhodes');
    walkBar(b0 + i, ch, nx, 1.0);
    drumBar(b0 + i, 'normal', i === 19);
    // muted trumpet color on "and of 4" every 4 bars
    if (i % 4 === 3) {
      const v = V[ch];
      v.slice(0, 3).forEach((nm, vi) => {
        muteTpt(tt(b0 + i, 3) + SWG * SPB - 0.5 * SPB, SPB * 0.4, mtof(n2m(nm)) * 2, 0.6, -0.3 + vi * 0.15, 0.25);
      });
    }
  }
  // Sax states the theme (bars 0-15), then short tag phrase (bars 16-19)
  playLine(b0, TH_A, (t, d, f, v) => sax(t, d, f, v, 0.1, 0.32, 0.2), 0.85);
  // 4-bar tag — sax phrase landing on Cm9
  const themeATag = [[75,0.5],[72,0.5],[70,0.5],[67,0.5],[63,1],[65,1], [67,1],[70,2],[68,1], [67,1],[63,2],[60,1], [63,4]];
  playLine(b0 + 16, themeATag, (t, d, f, v) => sax(t, d, f, v, 0.1, 0.32, 0.2), 0.85);
  // Phrase-end FX
  fxCoin((b0 + 3) * BAR + 3.3 * SPB, 0.7, -0.5);
  fxOrb((b0 + 7) * BAR + 3.3 * SPB, 0.75, 0.5, 0.5);
  fxCoin((b0 + 11) * BAR + 3.3 * SPB, 0.75, -0.4);
  fxOrb((b0 + 15) * BAR + 3.3 * SPB, 0.8, 0.3, 0.5);
  fxPowerup((b0 + 19) * BAR + 2.8 * SPB, 0.85, 0, 0.45);
}

// ---------- 3. HIPHOP TURN ----------
SWG = 0.56;
{
  const b0 = start.hiphop;
  fxScratch(b0 * BAR - 0.1, 0.85, 0.4);
  for (let i = 0; i < 16; i++) {
    const ch = chordTrack[b0 + i];
    bass808Bar(b0 + i, ch, 0.95);
    drumBar(b0 + i, 'halftime', i === 15);
    // sustained Rhodes chord on beat 1, no swing comp
    const v = V[ch];
    if (v) v.forEach((nm, vi) => rhodes(tt(b0 + i, 0), SPB * 3.5, mtof(n2m(nm)), 0.55 * (vi === 0 ? 1 : 0.78), -0.2));
    // sparse vibes counter (every other bar)
    if (i % 2 === 0 && v) {
      const m = n2m(v[v.length - 1]) + 12;
      vibes(tt(b0 + i, 0.5), SPB * 1.5, mtof(m), 0.42, 0.4, 0.55);
    }
    // sax phrases over bars 4-7 and 12-15
    if (i >= 4 && i < 8) {
      const sN = [76, 75, 72, 70, 67, 65, 63, 62];
      sax(tt(b0 + i, 0), SPB * 0.6, mtof(sN[(i - 4) * 2]), 0.7, 0, 0.32, 0.22);
      sax(tt(b0 + i, 1.5), SPB * 1.2, mtof(sN[(i - 4) * 2 + 1]), 0.7, 0, 0.32, 0.22);
    }
    if (i >= 12 && i < 16) {
      const sN = [70, 72, 75, 77, 75, 72, 70, 67];
      sax(tt(b0 + i, 0), SPB * 0.6, mtof(sN[(i - 12) * 2]), 0.75, 0.15, 0.35);
      sax(tt(b0 + i, 1.5), SPB * 1.2, mtof(sN[(i - 12) * 2 + 1]), 0.75, 0.15, 0.35);
    }
  }
  // turntable scratches as accents
  fxScratch((b0 + 3) * BAR + 3.3 * SPB, 0.8, -0.5);
  fxScratch((b0 + 7) * BAR + 3.3 * SPB, 0.8, 0.5);
  fxCoin((b0 + 11) * BAR + 3.3 * SPB, 0.75, 0);
  fxRiser((b0 + 14) * BAR, 2 * BAR, 0.85, 0.5);
  fxPowerup((b0 + 16) * BAR - 0.3, 0.95, 0, 0.45);
}

// ---------- 4. BATTLE (Toby Fox style, Em) ----------
SWG = 0.5;
{
  const b0 = start.battle;
  crash(b0 * BAR, 0.95);
  for (let i = 0; i < 20; i++) {
    const ch = chordTrack[b0 + i];
    const v = V[ch];
    const root = n2m(ROOT[ch]);
    let rootF = mtof(root);
    while (rootF > 100) rootF /= 2;
    const patterns = [
      [1, 1, 2, 1, 1, 2, 1, 2],
      [1, 2, 1, 2, 1, 1, 2, 1],
      [1, 1, 1, 2, 1, 1, 2, 2],
      [1, 2, 2, 1, 1, 2, 1, 1],
    ];
    octaveBassBar(b0 + i, rootF, 1.0, patterns[i % 4]);
    drumBar(b0 + i, 'driving', i === 19);
    if (v) {
      v.forEach((nm, vi) => {
        clavStab(st(b0 + i, 2), SPB * 0.3, mtof(n2m(nm)), 0.85 * (vi === 0 ? 1 : 0.85), 0.3);
        clavStab(st(b0 + i, 10), SPB * 0.3, mtof(n2m(nm)), 0.85 * (vi === 0 ? 1 : 0.85), 0.3);
      });
    }
    if (i % 4 === 0) padBar(b0 + i, ch, 0.3);
  }
  playLine(b0, TH_BATTLE, (t, d, f, v) => distLead(t, d, f, v, 0, 0.18, 0.18), 0.85);
  playLine(b0, TH_BATTLE, (t, d, f, v) => chipLead(t, d, f * 0.5, v * 0.4, 0.3, 0.15, 0.2), 0.6);
  // 4-bar tag — descending battle riff
  const battleTag = [[88,0.5],[86,0.5],[83,0.5],[81,0.5],[79,0.5],[78,0.5],[76,1],
                     [76,0.5],[79,0.5],[83,0.5],[86,0.5],[88,1],[83,1],
                     [82,0.5],[79,0.5],[76,0.5],[74,0.5],[71,2],
                     [74,0.5],[79,0.5],[83,1],[76,2]];
  playLine(b0 + 16, battleTag, (t, d, f, v) => distLead(t, d, f, v, 0, 0.18, 0.18), 0.85);
  fxLaser((b0 + 3) * BAR + 3.3 * SPB, 0.85, -0.5);
  fxLaser((b0 + 7) * BAR + 3.3 * SPB, 0.85, 0.5);
  fxJump((b0 + 11) * BAR + 3.3 * SPB, 0.85, 0);
  fxLaser((b0 + 15) * BAR + 3 * SPB, 0.9, 0);
  fxLaser((b0 + 19) * BAR + 3 * SPB, 0.95, 0);
}

// ---------- 5. CHIPTUNE SOLO ----------
SWG = 0.55;
{
  const b0 = start.chipsolo;
  for (let i = 0; i < 16; i++) {
    const ch = chordTrack[b0 + i];
    const nx = chordTrack[b0 + i + 1] || ch;
    compBar(b0 + i, ch, 0.85, 'clav');
    walkBar(b0 + i, ch, nx, 1.0);
    drumBar(b0 + i, 'normal', i === 15);
    if (i % 4 === 0) padBar(b0 + i, ch, 0.28);
  }
  // Chip lead — composed improvisation with chord-tone targeting
  {
    const phrases = [
      // each phrase = array of [midi, durBeats], length sums to 16 beats (4 bars)
      // phrase 1 (4 bars over Am9/Fmaj9/Cmaj9/GmajT)
      [[81,0.5],[84,0.5],[88,1],[91,0.5],[88,0.5],[84,1], [82,0.5],[81,0.5],[77,1],[74,2],
       [76,0.5],[79,0.5],[83,0.5],[86,0.5],[88,1],[83,1], [82,0.5],[79,0.5],[76,0.5],[74,0.5],[71,2]],
      // phrase 2 (over Dm9/Bb9/Fmaj7/A7alt)
      [[74,0.5],[77,0.5],[81,1],[84,1],[86,1], [82,0.5],[81,0.5],[77,0.5],[74,0.5],[70,2],
       [69,0.5],[72,0.5],[77,1],[81,1],[84,1], [83,0.5],[80,0.5],[77,0.5],[73,0.5],[70,2]],
      // phrase 3 (over Dm9/GmajT/Cmaj7/A7alt)
      [[81,0.5],[86,0.5],[89,1],[93,1],[89,1], [86,0.5],[82,0.5],[79,1],[76,2],
       [79,0.5],[83,0.5],[88,0.5],[91,0.5],[88,1],[84,1], [82,0.5],[80,0.5],[77,1],[76,2]],
      // phrase 4 (over Dm9/G7/Cmaj7/C#7 — pivot to bridge)
      [[77,0.5],[81,0.5],[86,1],[89,1],[91,1], [88,0.5],[84,0.5],[79,1],[77,2],
       [76,1],[79,1],[83,2], [85,1],[82,1],[80,1],[78,1]],
    ];
    let t = b0 * BAR;
    for (const ph of phrases) {
      for (const [m, d] of ph) {
        chipLead(t, d * SPB * 0.92, mtof(m), 0.85, ((Math.random() - 0.5) * 0.3) + 0.1, 0.2, 0.22);
        t += d * SPB;
      }
    }
  }
  // sax answers between phrases
  sax((b0 + 3) * BAR + 3 * SPB, SPB * 0.9, mtof(79), 0.7, -0.2, 0.4);
  sax((b0 + 7) * BAR + 3 * SPB, SPB * 0.9, mtof(81), 0.75, -0.2, 0.4);
  sax((b0 + 11) * BAR + 3 * SPB, SPB * 0.9, mtof(83), 0.75, -0.2, 0.4);
  // FX
  fxCoin((b0 + 1) * BAR + 3.4 * SPB, 0.7, 0.5);
  fxOrb((b0 + 5) * BAR + 3.4 * SPB, 0.75, -0.5, 0.5);
  fxJump((b0 + 9) * BAR + 3.4 * SPB, 0.75, 0.4);
  fxLaser((b0 + 13) * BAR + 3.4 * SPB, 0.7, -0.4);
  fxDing((b0 + 15) * BAR + 2 * SPB, 0.85, 0);
}

// ---------- 6. BRIDGE (F#m mysterious) ----------
SWG = 0.6;
{
  const b0 = start.bridge;
  for (let i = 0; i < 12; i++) {
    const ch = chordTrack[b0 + i];
    const nx = chordTrack[b0 + i + 1] || ch;
    // sparse atmospheric comping: pad + vibes
    padBar(b0 + i, ch, 0.42);
    // light brush drums
    drumBar(b0 + i, i < 4 ? 'breakdown' : 'brush');
    // sparse rhodes whole-note chord
    const v = V[ch];
    if (v) v.forEach((nm, vi) => rhodes(tt(b0 + i, 0), SPB * 3.7, mtof(n2m(nm)), 0.5 * (vi === 0 ? 1 : 0.8), 0.15));
    // walking-ish bass (slower, mostly roots + 5ths)
    if (i >= 4) {
      const root = n2m(ROOT[ch]);
      upBass(tt(b0 + i, 0), SPB * 1.8, mtof(root - 12), 0.85);
      upBass(tt(b0 + i, 2), SPB * 1.8, mtof(root - 12 + 7), 0.8);
    }
  }
  // Vibraphone plays the bridge theme
  playLine(b0, TH_BRIDGE, (t, d, f, v) => vibes(t, d, f, v * 0.85, 0.15, 0.6), 0.8);
  // muted trumpet color hits
  for (let i = 0; i < 12; i += 2) {
    const ch = chordTrack[b0 + i];
    const v = V[ch];
    if (v && i >= 4) {
      v.slice(0, 2).forEach((nm, vi) => {
        muteTpt(tt(b0 + i, 2.5), SPB * 0.4, mtof(n2m(nm)), 0.55, -0.35 + vi * 0.2, 0.3);
      });
    }
  }
  fxDing((b0 + 3) * BAR + 2 * SPB, 0.75, -0.4);
  fxOrb((b0 + 7) * BAR + 3 * SPB, 0.75, 0.4, 0.5);
}

// ---------- 7. BUILD (8 bars, ascending pedal) ----------
SWG = 0.5;
{
  const b0 = start.build;
  // Ascending sustained chords, drums building
  for (let i = 0; i < 8; i++) {
    const ch = chordTrack[b0 + i];
    const v = V[ch];
    if (v) v.forEach((nm, vi) => rhodes(tt(b0 + i, 0), SPB * 3.7, mtof(n2m(nm)), 0.5 + i * 0.05, 0));
    // build drum intensity
    if (i < 2)       drumBar(b0 + i, 'brush');
    else if (i < 4)  drumBar(b0 + i, 'normal');
    else if (i < 6)  drumBar(b0 + i, 'driving');
    else             drumBar(b0 + i, 'busy', i === 7);
    // ascending sub808 hits
    const root = n2m(ROOT[ch]);
    sub808(tt(b0 + i, 0), SPB * 1.8, mtof(root - 12), 0.85 + i * 0.02);
  }
  // big riser through entire 8 bars
  fxRiser(b0 * BAR, 8 * BAR, 1.0, 0.55);
  // snare buildup last 2 bars
  for (let s = 0; s < 16; s++) {
    if (s % 2 === 0 || s >= 8) snare((b0 + 6) * BAR + s * (SPB / 4), 0.3 + s * 0.045);
  }
  fxVictory((b0 + 8) * BAR - 0.2, 1.0, 0.5);
  fxPowerup((b0 + 8) * BAR - 0.4, 0.9, 0.3, 0.5);
}

// ---------- 8. CLIMAX (Dm, full ensemble, NEW theme) ----------
SWG = 0.5;
{
  const b0 = start.climax;
  crash(b0 * BAR, 1.0);
  fxVictory(b0 * BAR + 0.05, 0.95, 0.45);
  for (let i = 0; i < 32; i++) {
    const ch = chordTrack[b0 + i];
    const nx = chordTrack[b0 + i + 1] || ch;
    compBar(b0 + i, ch, 0.95, 'rhodes');
    compBar(b0 + i, ch, 0.55, 'clav');
    walkBar(b0 + i, ch, nx, 1.05);
    drumBar(b0 + i, 'busy', i === 31);
    if (i % 2 === 0) padBar(b0 + i, ch, 0.36);
    const v = V[ch];
    if (v) v.slice(0, 3).forEach((nm, vi) => {
      muteTpt(tt(b0 + i, 3) + SWG * SPB - 0.5 * SPB, SPB * 0.35, mtof(n2m(nm)) * 2, 0.75, -0.3 + vi * 0.15, 0.3);
    });
    if (i === 8 || i === 16 || i === 24) crash(tt(b0 + i, 0), 0.7);
  }
  // The climax theme (bars 0-23), then big closing phrase (bars 24-31)
  playLine(b0, TH_CLIMAX, (t, d, f, v) => sax(t, d, f, v, 0, 0.42, 0.25), 0.95);
  playLine(b0, TH_CLIMAX, (t, d, f, v) => distLead(t, d, f, v * 0.5, 0.3, 0.18, 0.18), 0.75);
  playLine(b0, TH_CLIMAX, (t, d, f, v) => chipLead(t, d, f, v * 0.35, -0.3, 0.18, 0.2), 0.6);
  // 8-bar climax closing — soaring high line
  const climaxTag = [
    [93,0.5],[89,0.5],[86,0.5],[89,0.5],[93,1],[89,1],
    [86,0.5],[82,0.5],[81,1],[77,2],
    [89,0.5],[93,0.5],[96,0.5],[93,0.5],[89,1],[86,1],
    [84,0.5],[82,0.5],[80,1],[78,2],
    [77,0.5],[81,0.5],[86,1],[89,1],[93,1],
    [86,1],[82,1],[78,2],
    [81,0.5],[86,0.5],[89,1],[93,1],[89,1],
    [86,1],[81,1],[74,2]
  ];
  playLine(b0 + 24, climaxTag, (t, d, f, v) => sax(t, d, f, v, 0, 0.42, 0.25), 0.95);
  playLine(b0 + 24, climaxTag, (t, d, f, v) => distLead(t, d, f, v * 0.55, 0.35, 0.18, 0.18), 0.8);
  // FX showers
  for (let i = 0; i < 32; i += 2) {
    const t = (b0 + i) * BAR + 3.3 * SPB;
    if (i % 8 === 0) fxOrb(t, 0.75, (i / 8 % 2 ? -0.5 : 0.5), 0.5);
    else if (i % 6 === 0) fxLaser(t, 0.75, ((i / 2) % 2 ? -0.4 : 0.4));
    else if (i % 4 === 0) fxCoin(t, 0.7, ((i / 4) % 2 ? 0.5 : -0.5));
    else fxJump(t, 0.7, (Math.random() - 0.5));
  }
  fxDing((b0 + 31) * BAR + 2 * SPB, 0.95, 0, 0.6);
}

// ---------- 9. FINAL THEME (back to Cm, recalled with new harmony) ----------
SWG = 0.6;
{
  const b0 = start.finalA;
  crash(b0 * BAR, 0.85);
  for (let i = 0; i < 16; i++) {
    const ch = chordTrack[b0 + i];
    const nx = chordTrack[b0 + i + 1] || ch;
    compBar(b0 + i, ch, 0.95, 'rhodes');
    if (i < 8) compBar(b0 + i, ch, 0.45, 'clav');
    walkBar(b0 + i, ch, nx, 1.0);
    drumBar(b0 + i, 'normal', i === 15);
    if (i % 4 === 0) padBar(b0 + i, ch, 0.32);
  }
  // Sax plays the recall theme + muted trumpet harmony underneath
  playLine(b0, TH_FINAL, (t, d, f, v) => sax(t, d, f, v, -0.15, 0.35, 0.22), 0.9);
  playLine(b0, TH_FINAL, (t, d, f, v) => muteTpt(t, d, f * 0.5, v * 0.55, 0.25, 0.25), 0.7);
  // vibraphone counter sprinkles
  for (let i = 0; i < 4; i++) {
    vibes((b0 + i * 4 + 2) * BAR, SPB * 0.6, mtof(91), 0.45, 0.4, 0.55);
    vibes((b0 + i * 4 + 3) * BAR + SPB, SPB * 0.6, mtof(88), 0.42, -0.4, 0.55);
  }
  fxOrb((b0 + 3) * BAR + 3.4 * SPB, 0.8, -0.4, 0.5);
  fxCoin((b0 + 7) * BAR + 3.4 * SPB, 0.85, 0.4);
  fxOrb((b0 + 11) * BAR + 3.4 * SPB, 0.85, 0, 0.5);
  fxDing((b0 + 15) * BAR + 2 * SPB, 0.9, 0);
}

// ---------- 10. HIPHOP OUTRO ----------
SWG = 0.56;
{
  const b0 = start.hipoutro;
  fxScratch(b0 * BAR - 0.1, 0.85, -0.4);
  for (let i = 0; i < 16; i++) {
    const ch = chordTrack[b0 + i];
    const fade = 1 - i / 24;   // gradual fade
    bass808Bar(b0 + i, ch, 0.95 * fade);
    drumBar(b0 + i, 'halftime', i === 15);
    const v = V[ch];
    if (v) v.forEach((nm, vi) => rhodes(tt(b0 + i, 0), SPB * 3.5, mtof(n2m(nm)), 0.55 * fade * (vi === 0 ? 1 : 0.78), -0.2));
    // sax nostalgic phrases over bars 4-7 & 12-15
    if (i >= 4 && i < 8) {
      const sN = [70, 67, 65, 63];
      sax(tt(b0 + i, 0), SPB * 2.5, mtof(sN[i - 4] + 12), 0.7 * fade, 0, 0.35);
    }
    if (i >= 12 && i < 16) {
      sax(tt(b0 + i, 0), SPB * 1.5, mtof([75, 72, 70, 67][i - 12]), 0.65 * fade, 0.1, 0.35);
    }
    // vibes counter
    if (i % 4 === 2 && v) {
      vibes(tt(b0 + i, 0.5), SPB * 1.5, mtof(n2m(v[v.length - 1]) + 12), 0.4 * fade, 0.4, 0.6);
    }
  }
  fxScratch((b0 + 7) * BAR + 3.3 * SPB, 0.7, 0.4);
  fxCoin((b0 + 11) * BAR + 3.3 * SPB, 0.65, -0.4);
  fxPop((b0 + 15) * BAR + 3.4 * SPB, 0.7, 0);
}

// ---------- 11. TAG (final hit) ----------
SWG = 0.5;
{
  const b0 = start.tag;
  crash(b0 * BAR, 1.0);
  // Big sustained Cm11 chord — full ensemble
  const finalChord = ['C3','Eb3','G3','Bb3','D4','F4','Eb4','G4'];
  finalChord.forEach((nm, vi) => {
    rhodes(b0 * BAR, 8 * SPB, mtof(n2m(nm)), 0.9, (vi - 3) * 0.15, 0.5);
    pad(b0 * BAR, 8 * SPB, mtof(n2m(nm)) * 0.5, 0.42, (vi - 3) * 0.18);
  });
  upBass(b0 * BAR, 8 * SPB, mtof(n2m('C2')), 1.0);
  sub808(b0 * BAR, 6 * SPB, mtof(n2m('C1')), 0.9);
  // FX cascade
  fxVictory(b0 * BAR + 0.05, 1.0, 0.5);
  fxOrb(b0 * BAR + 0.9, 0.95, -0.5, 0.55);
  fxOrb(b0 * BAR + 1.4, 0.95, 0.5, 0.55);
  fxCoin(b0 * BAR + 2.0, 0.95, 0, 0.4);
  fxDing(b0 * BAR + 2.6, 1.0, 0, 0.6);
  fxPowerup(b0 * BAR + 3.4, 0.95, 0, 0.45);
  fxOrb(b0 * BAR + 4.4, 0.9, -0.4, 0.55);
  fxOrb(b0 * BAR + 4.9, 0.9, 0.4, 0.55);
  fxDing(b0 * BAR + 6.0, 0.95, 0.3, 0.6);
  // closing soft cymbal swell
  crash(b0 * BAR + 5, 0.5);
  // last "ding" tag
  fxDing(b0 * BAR + 8.5, 0.85, 0, 0.6);
}

console.log('Arrangement done.');

// ============================================================
// POST-PROCESSING
// ============================================================

// Sidechain
console.log('Sidechain envelope...');
const sideEnv = new Float32Array(N).fill(1);
const duckAtk = (0.005 * SR) | 0;
const duckRel = (0.20 * SR)  | 0;
for (const kt of kickTimes) {
  const i0 = (kt * SR) | 0;
  for (let j = 0; j < duckAtk; j++) {
    const k = i0 + j;
    if (k >= N) break;
    const target = 0.42;
    const v = 1 - (1 - target) * (j / duckAtk);
    if (v < sideEnv[k]) sideEnv[k] = v;
  }
  for (let j = 0; j < duckRel; j++) {
    const k = i0 + duckAtk + j;
    if (k >= N) break;
    const v = 0.42 + (1 - 0.42) * (j / duckRel);
    if (v < sideEnv[k]) sideEnv[k] = v;
  }
}

// Ping-pong delay (dotted 8th)
console.log('Stereo delay...');
{
  const delayTime = SPB * 3 / 4;
  const dS = (delayTime * SR) | 0;
  const fb = 0.42;
  const lL = new Float32Array(dS * 4);
  const lR = new Float32Array(dS * 4);
  let idx = 0;
  for (let i = 0; i < N; i++) {
    const read = (idx + 1) % lL.length;
    const outL = lL[read];
    const outR = lR[read];
    lL[idx] = dR[i] + outR * fb;
    lR[idx] = dL[i] + outL * fb;
    idx = (idx + 1) % lL.length;
    L[i] += outL * 0.42;
    R[i] += outR * 0.42;
    sL[i] += outL * 0.15;
    sR[i] += outR * 0.15;
  }
}

// Schroeder reverb on send bus
console.log('Reverb (Schroeder)...');
{
  const cL_d = [1557, 1617, 1491, 1422];
  const cR_d = [1277, 1356, 1188, 1116];
  const fb = 0.82;
  const aL_d = [225, 556];
  const aR_d = [441, 341];
  const apG = 0.5;
  const initBuf = ns => ns.map(n => ({ buf: new Float32Array(n), idx: 0 }));
  const combsL = initBuf(cL_d), combsR = initBuf(cR_d);
  const apsL   = initBuf(aL_d), apsR   = initBuf(aR_d);
  const damp = 0.4;
  const lpL = new Float32Array(4);
  const lpR = new Float32Array(4);
  const wet = 0.34;

  for (let i = 0; i < N; i++) {
    let sumL = 0;
    for (let k = 0; k < 4; k++) {
      const c = combsL[k];
      const out = c.buf[c.idx];
      lpL[k] = out * (1 - damp) + lpL[k] * damp;
      c.buf[c.idx] = sL[i] + lpL[k] * fb;
      c.idx = (c.idx + 1) % c.buf.length;
      sumL += out;
    }
    sumL *= 0.25;
    for (const a of apsL) {
      const z = a.buf[a.idx];
      const v = sumL - apG * z;
      a.buf[a.idx] = v;
      sumL = z + apG * v;
      a.idx = (a.idx + 1) % a.buf.length;
    }
    let sumR = 0;
    for (let k = 0; k < 4; k++) {
      const c = combsR[k];
      const out = c.buf[c.idx];
      lpR[k] = out * (1 - damp) + lpR[k] * damp;
      c.buf[c.idx] = sR[i] + lpR[k] * fb;
      c.idx = (c.idx + 1) % c.buf.length;
      sumR += out;
    }
    sumR *= 0.25;
    for (const a of apsR) {
      const z = a.buf[a.idx];
      const v = sumR - apG * z;
      a.buf[a.idx] = v;
      sumR = z + apG * v;
      a.idx = (a.idx + 1) % a.buf.length;
    }
    L[i] += sumL * wet;
    R[i] += sumR * wet;
  }
}

// Sum sidechained chord bus into master
console.log('Mixing chord bus with sidechain...');
for (let i = 0; i < N; i++) {
  L[i] += cL[i] * sideEnv[i];
  R[i] += cR[i] * sideEnv[i];
}

// Master DC blocker + soft-clip + stereo widen
console.log('Mastering...');
{
  let xPL = 0, yPL = 0, xPR = 0, yPR = 0;
  const R_ = 0.9985;
  for (let i = 0; i < N; i++) {
    const xL = L[i]; const yL = xL - xPL + R_ * yPL;
    xPL = xL; yPL = yL; L[i] = yL;
    const xR = R[i]; const yR = xR - xPR + R_ * yPR;
    xPR = xR; yPR = yR; R[i] = yR;
  }
}
let peak = 0;
for (let i = 0; i < N; i++) {
  if (Math.abs(L[i]) > peak) peak = Math.abs(L[i]);
  if (Math.abs(R[i]) > peak) peak = Math.abs(R[i]);
}
const drive = peak > 0 ? Math.min(1.05 / peak, 1.6) : 1;
for (let i = 0; i < N; i++) {
  let l = L[i] * drive;
  let r = R[i] * drive;
  const mid = (l + r) * 0.5;
  const side = (l - r) * 0.5;
  const wide = 1.15;
  l = mid + side * wide;
  r = mid - side * wide;
  L[i] = Math.tanh(l) * 0.95;
  R[i] = Math.tanh(r) * 0.95;
}

// Write WAV
console.log('Writing WAV...');
const bps = 2, ch = 2;
const dataSize = N * ch * bps;
const buf = Buffer.alloc(44 + dataSize);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + dataSize, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(ch, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * ch * bps, 28);
buf.writeUInt16LE(ch * bps, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(dataSize, 40);
let p = 44;
for (let i = 0; i < N; i++) {
  const l = clamp(L[i], -1, 1) * 32767 | 0;
  const r = clamp(R[i], -1, 1) * 32767 | 0;
  buf.writeInt16LE(l, p); p += 2;
  buf.writeInt16LE(r, p); p += 2;
}
fs.writeFileSync('arcade_jazz.wav', buf);
console.log('Done -> arcade_jazz.wav (' + (buf.length / 1024 / 1024).toFixed(1) + ' MB, ' + DUR + 's)');
