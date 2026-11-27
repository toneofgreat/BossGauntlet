// AUDIO - sfx.js: every sound effect, synthesized. SFX[id](ac, out, t, p) schedules the sound into `out` starting
// at time t and returns its end time. p = { rate (pitch multiplier, default 1), vol (already applied by caller) }.
// LOOPS[id](ac, out, t) starts a continuous ambient bed -> { stop(t), tick(now, until) } (tick schedules events).
import {
  gain, filter, osc, src, noiseBuffer, shaper, perc, sustain, noiseHit, toneHit, metalHit, creak, rand, pick, clamp, TINY, mtof,
} from "./synth.js";
import { syllable, speak, sob as vsob, sing, createVoice } from "./voice.js";

const R = (p) => (p && p.rate) || 1;

// ---------------------------------------------------------------- small composite atoms
function thud(ac, out, t, g = 0.5, f0 = 90, f1 = 45, d = 0.12) {
  toneHit(ac, out, t, { f: f0, f2: f1, d, gain: g, sweep: d * 0.7 });
  noiseHit(ac, out, t, { type: "lowpass", f: 300, kind: "brown", d: d * 0.8, gain: g * 0.9 });
}
function squeak(ac, out, t, f, d, g, wig = 3, fall = 1) {
  const gg = gain(ac, 0, out);
  const hp = filter(ac, "highpass", 1200, 0.7, gg);
  const o = osc(ac, "triangle", f, t, t + d + 0.05, hp);
  const s2 = osc(ac, "sine", f * 2.01, t, t + d + 0.05, gain(ac, 0.15, hp));
  for (let k = 0; k < wig; k++) {
    const tk = t + (d * (k + 1)) / (wig + 1);
    const fk = f * (k % 2 ? 1.22 : 0.9) * (1 - (fall < 1 ? (1 - fall) * (k / wig) : 0));
    o.frequency.linearRampToValueAtTime(fk, tk);
    s2.frequency.linearRampToValueAtTime(fk * 2.01, tk);
  }
  if (fall !== 1) { o.frequency.exponentialRampToValueAtTime(f * fall, t + d); s2.frequency.exponentialRampToValueAtTime(f * fall * 2, t + d); }
  perc(gg.gain, t, g, 0.01, d);
  return t + d;
}
function crackles(ac, out, t, n, span, g, f = 2500) {
  for (let i = 0; i < n; i++) noiseHit(ac, out, t + rand(0, span), { type: "highpass", f: f * rand(0.8, 1.6), d: rand(0.004, 0.02), gain: g * rand(0.4, 1) });
}
function whoosh(ac, out, t, f0, f1, d, g, q = 1.2, kind = "pink") {
  noiseHit(ac, out, t, { type: "bandpass", f: f0, f2: f1, q, a: d * 0.35, d: d * 0.65, gain: g, kind });
}
function whisper(ac, out, t, n, g = 0.2) {
  const ng = gain(ac, 0, out);
  const forms = [filter(ac, "bandpass", 600, 5, ng), filter(ac, "bandpass", 1800, 7, ng), filter(ac, "bandpass", 2700, 8, ng)];
  const mix = gain(ac, 1);
  forms.forEach((f) => mix.connect(f));
  src(ac, noiseBuffer(ac, "pink"), t, mix, { loop: true, offset: rand(0, 2), dur: n * 0.22 + 0.4 });
  ng.gain.setValueAtTime(0, t);
  for (let i = 0; i < n; i++) {
    const ti = t + i * 0.22;
    ng.gain.linearRampToValueAtTime(g * rand(0.6, 1), ti + 0.05);
    ng.gain.linearRampToValueAtTime(g * 0.1, ti + 0.18);
    forms[0].frequency.setValueAtTime(rand(400, 800), ti);
    forms[1].frequency.setValueAtTime(rand(1200, 2300), ti);
  }
  ng.gain.linearRampToValueAtTime(0, t + n * 0.22 + 0.2);
  return t + n * 0.22 + 0.3;
}
function chirp(ac, out, t, g = 0.08) {
  const base = rand(2600, 4800), n = 2 + ((Math.random() * 4) | 0);
  let tt = t;
  for (let i = 0; i < n; i++) {
    const d = rand(0.04, 0.11);
    const gg = gain(ac, 0, out);
    const o = osc(ac, "sine", base * rand(0.85, 1.15), tt, tt + d + 0.02, gg);
    o.frequency.exponentialRampToValueAtTime(base * rand(0.7, 1.5), tt + d);
    perc(gg.gain, tt, g * rand(0.5, 1), 0.006, d);
    tt += d + rand(0.02, 0.09);
  }
  return tt;
}
function cricket(ac, out, t, g = 0.035) {
  const f = rand(4100, 4600);
  for (let i = 0; i < 3; i++) {
    const gg = gain(ac, 0, out);
    osc(ac, "sine", f, t + i * 0.045, t + i * 0.045 + 0.04, gg);
    perc(gg.gain, t + i * 0.045, g, 0.004, 0.03);
  }
  return t + 0.16;
}
function cluck(ac, out, t, g = 0.12) {
  const gg = gain(ac, 0, out);
  const bp = filter(ac, "bandpass", 1100, 3, gg);
  const o = osc(ac, "square", rand(380, 520), t, t + 0.09, bp);
  o.frequency.exponentialRampToValueAtTime(rand(300, 380), t + 0.07);
  perc(gg.gain, t, g, 0.004, 0.06);
  return t + 0.1;
}
function bark(ac, out, t, g = 0.3) {
  syllable(ac, out, t, { f0: rand(360, 420), f1: 240, dur: 0.13, vow: "ah", vow2: "oh", kind: "male", g, breath: 0.6, dist: 2.5, a: 0.008 });
  noiseHit(ac, out, t, { type: "bandpass", f: 900, q: 0.8, d: 0.1, gain: g * 0.5 });
  return t + 0.25;
}

// ---------------------------------------------------------------- footsteps
const STEPS = {
  step_grass(ac, o, t, p) {
    noiseHit(ac, o, t, { type: "bandpass", f: 3200 * R(p), q: 0.6, a: 0.01, d: 0.12, gain: 0.22 });
    noiseHit(ac, o, t + 0.045, { type: "bandpass", f: 4200 * R(p), q: 0.8, a: 0.008, d: 0.08, gain: 0.12 });
    noiseHit(ac, o, t, { type: "lowpass", f: 260, kind: "brown", d: 0.05, gain: 0.35 });
    return t + 0.2;
  },
  step_dirt(ac, o, t, p) {
    noiseHit(ac, o, t, { type: "lowpass", f: 480, kind: "brown", d: 0.06, gain: 0.5 });
    noiseHit(ac, o, t + 0.012, { type: "bandpass", f: 1700 * R(p), q: 1, d: 0.06, gain: 0.18 });
    crackles(ac, o, t + 0.01, 3, 0.06, 0.06, 4500);
    return t + 0.15;
  },
  step_wood(ac, o, t, p) {
    toneHit(ac, o, t, { f: 150 * R(p), f2: 95, d: 0.08, gain: 0.3 });
    noiseHit(ac, o, t, { type: "bandpass", f: 360 * R(p), q: 5, d: 0.12, gain: 0.45 });
    noiseHit(ac, o, t, { type: "highpass", f: 2200, d: 0.012, gain: 0.18 });
    if (Math.random() < 0.12) creak(ac, o, t + 0.03, { d: 0.22, f: 800, r0: 60, r1: 120, gain: 0.04 });
    return t + 0.25;
  },
  step_stone(ac, o, t, p) {
    noiseHit(ac, o, t, { type: "bandpass", f: 2600 * R(p), q: 1.5, d: 0.022, gain: 0.35 });
    noiseHit(ac, o, t, { type: "lowpass", f: 700, d: 0.035, gain: 0.32 });
    noiseHit(ac, o, t + 0.03, { type: "highpass", f: 3200, a: 0.01, d: 0.06, gain: 0.05 });
    return t + 0.12;
  },
  step_sand(ac, o, t, p) {
    noiseHit(ac, o, t, { type: "bandpass", f: 1300 * R(p), q: 0.5, a: 0.025, d: 0.16, gain: 0.3 });
    noiseHit(ac, o, t, { type: "lowpass", f: 200, kind: "brown", d: 0.05, gain: 0.2 });
    return t + 0.22;
  },
  step_forest(ac, o, t, p) {
    noiseHit(ac, o, t, { type: "bandpass", f: 2400 * R(p), q: 0.7, a: 0.01, d: 0.1, gain: 0.22 });
    crackles(ac, o, t, 4, 0.07, 0.12, 3000);
    noiseHit(ac, o, t, { type: "lowpass", f: 300, kind: "brown", d: 0.05, gain: 0.3 });
    if (Math.random() < 0.15) noiseHit(ac, o, t + 0.02, { type: "bandpass", f: 1800, q: 4, d: 0.015, gain: 0.25 }); // twig
    return t + 0.18;
  },
  step_puddle(ac, o, t, p) {
    noiseHit(ac, o, t, { type: "bandpass", f: 1300 * R(p), f2: 600, q: 1, d: 0.15, gain: 0.3 });
    for (let i = 0; i < 2; i++) { const tt = t + 0.03 + i * 0.05; toneHit(ac, o, tt, { f: rand(700, 1000), f2: rand(1300, 1800), d: 0.04, gain: 0.06 }); }
    return t + 0.22;
  },
  step_metal(ac, o, t, p) { metalHit(ac, o, t, { f: 420 * R(p), d: 0.4, gain: 0.12 }); thud(ac, o, t, 0.2); return t + 0.45; },
};

// ---------------------------------------------------------------- the catalogue
export const SFX = {
  ...STEPS,
  jump(ac, o, t, p) { whoosh(ac, o, t, 700, 1500, 0.14, 0.12); noiseHit(ac, o, t, { type: "bandpass", f: 900, q: 0.8, a: 0.02, d: 0.1, gain: 0.05 }); return t + 0.2; },
  land(ac, o, t, p) { thud(ac, o, t, 0.45, 85, 45, 0.1); noiseHit(ac, o, t + 0.01, { type: "bandpass", f: 1800, q: 0.8, d: 0.07, gain: 0.08 }); return t + 0.2; },
  land_hard(ac, o, t, p) {
    thud(ac, o, t, 0.75, 75, 35, 0.2); crackles(ac, o, t, 6, 0.15, 0.12, 2000);
    syllable(ac, o, t + 0.02, { f0: 115, f1: 95, dur: 0.12, vow: "uh", g: 0.14, breath: 0.3 });
    return t + 0.4;
  },
  whoosh_punch(ac, o, t, p) { whoosh(ac, o, t, 450 * R(p), 1500 * R(p), 0.15, 0.3, 1.5); return t + 0.2; },
  hit_punch(ac, o, t, p) {
    toneHit(ac, o, t, { f: 115 * R(p), f2: 45, d: 0.12, gain: 0.55, shape: 2, sweep: 0.08 });
    noiseHit(ac, o, t, { type: "lowpass", f: 1500, d: 0.05, gain: 0.45 });
    noiseHit(ac, o, t, { type: "bandpass", f: 2100, q: 1.2, d: 0.02, gain: 0.25 });
    return t + 0.2;
  },
  whoosh_sword(ac, o, t, p) {
    const r = R(p);
    noiseHit(ac, o, t, { type: "bandpass", f: 800 * r, f2: 3200 * r, q: 3.5, a: 0.07, d: 0.16, gain: 0.32 });
    toneHit(ac, o, t + 0.05, { f: 2600 * r, f2: 1800 * r, a: 0.02, d: 0.12, gain: 0.025 });
    return t + 0.26;
  },
  hit_flesh(ac, o, t, p) {
    thud(ac, o, t, 0.45, 95 * R(p), 50, 0.1);
    noiseHit(ac, o, t, { type: "bandpass", f: 750, f2: 300, q: 1.5, d: 0.09, gain: 0.32 });
    noiseHit(ac, o, t, { type: "highpass", f: 4000, d: 0.03, gain: 0.14 });
    return t + 0.2;
  },
  hit_metal(ac, o, t, p) { metalHit(ac, o, t, { f: 1100 * R(p), d: 0.7, gain: 0.22 }); thud(ac, o, t, 0.25, 140, 80, 0.06); return t + 0.75; },
  hit_wood(ac, o, t, p) {
    toneHit(ac, o, t, { type: "triangle", f: 430 * R(p), f2: 370, d: 0.1, gain: 0.32 });
    noiseHit(ac, o, t, { type: "bandpass", f: 900 * R(p), q: 4, d: 0.12, gain: 0.3 });
    return t + 0.2;
  },
  block(ac, o, t, p) {
    metalHit(ac, o, t, { f: 620 * R(p), d: 0.5, gain: 0.25 }); thud(ac, o, t, 0.4, 130, 70, 0.08);
    noiseHit(ac, o, t, { type: "bandpass", f: 3000, q: 1, d: 0.04, gain: 0.2 });
    return t + 0.55;
  },
  heavy_charge(ac, o, t, p) {
    const g = gain(ac, 0, o), lp = filter(ac, "lowpass", 900, 2, g);
    const x = osc(ac, "sawtooth", 110 * R(p), t, t + 0.75, lp); x.frequency.exponentialRampToValueAtTime(330 * R(p), t + 0.6);
    lp.frequency.exponentialRampToValueAtTime(2400, t + 0.6);
    const tr = gain(ac, 0.04, g.gain); osc(ac, "sine", 14, t, t + 0.75, tr);
    sustain(g.gain, t, 0.08, 0.3, 0.45, 0.15);
    return t + 0.75;
  },
  heavy_release(ac, o, t, p) { whoosh(ac, o, t, 300, 2200, 0.3, 0.45, 1); thud(ac, o, t + 0.05, 0.5, 75, 32, 0.35); return t + 0.45; },
  dodge(ac, o, t, p) {
    noiseHit(ac, o, t, { type: "lowpass", f: 1400, a: 0.06, d: 0.24, gain: 0.25 });
    noiseHit(ac, o, t + 0.3, { type: "lowpass", f: 350, kind: "brown", d: 0.06, gain: 0.22 });
    return t + 0.4;
  },
  hurt(ac, o, t, p) {
    syllable(ac, o, t, { f0: 150 * R(p), f1: 105 * R(p), dur: 0.22, vow: "uh", vow2: "ah", g: 0.32, breath: 0.15, a: 0.01 });
    return t + 0.4;
  },
  player_death(ac, o, t, p) {
    syllable(ac, o, t, { f0: 140, f1: 70, dur: 0.9, vow: "ah", vow2: "oh", g: 0.32, breath: 0.2 });
    thud(ac, o, t + 0.7, 0.5, 70, 30, 0.4);
    noiseHit(ac, o, t, { type: "lowpass", f: 800, f2: 120, a: 0.2, d: 1.4, gain: 0.15, kind: "brown" });
    return t + 1.8;
  },
  level_up(ac, o, t, p) {
    const r = R(p), ns = [72, 76, 79, 84];
    ns.forEach((n, i) => toneHit(ac, o, t + i * 0.06, { type: "triangle", f: mtof(n) * r, d: 0.35, gain: 0.08 }));
    metalHit(ac, o, t + 0.2, { f: mtof(96) * r, d: 0.5, gain: 0.04, ratios: [1, 2.01, 3.02] });
    return t + 0.8;
  },
  item_equip(ac, o, t, p) {
    metalHit(ac, o, t, { f: 1800 * R(p), d: 0.18, gain: 0.12 });
    metalHit(ac, o, t + 0.07, { f: 2450 * R(p), d: 0.22, gain: 0.1 });
    noiseHit(ac, o, t, { type: "highpass", f: 3000, d: 0.1, gain: 0.06 });
    return t + 0.35;
  },
  armor_rustle(ac, o, t, p) {
    for (let i = 0; i < 6; i++) metalHit(ac, o, t + rand(0, 0.25), { f: rand(2500, 4200), d: 0.06, gain: 0.03, ratios: [1, 1.6] });
    noiseHit(ac, o, t, { type: "highpass", f: 4000, a: 0.05, d: 0.2, gain: 0.08 });
    return t + 0.35;
  },
  // ---- UI
  ui_hover(ac, o, t) { toneHit(ac, o, t, { f: 2400, d: 0.02, gain: 0.05 }); return t + 0.04; },
  ui_click(ac, o, t, p) { toneHit(ac, o, t, { type: "square", f: 900 * R(p), d: 0.025, gain: 0.07, lp: 3000 }); noiseHit(ac, o, t, { type: "highpass", f: 3000, d: 0.008, gain: 0.12 }); return t + 0.05; },
  ui_open(ac, o, t) { toneHit(ac, o, t, { type: "triangle", f: 520, f2: 780, d: 0.09, gain: 0.08 }); return t + 0.12; },
  ui_close(ac, o, t) { toneHit(ac, o, t, { type: "triangle", f: 780, f2: 520, d: 0.09, gain: 0.08 }); return t + 0.12; },
  ui_toast(ac, o, t) { toneHit(ac, o, t, { f: 880, d: 0.12, gain: 0.07 }); toneHit(ac, o, t + 0.09, { f: 1320, d: 0.18, gain: 0.06 }); return t + 0.3; },
  ui_error(ac, o, t) { toneHit(ac, o, t, { type: "square", f: 140, d: 0.18, gain: 0.07, lp: 900 }); toneHit(ac, o, t, { type: "square", f: 147, d: 0.18, gain: 0.06, lp: 900 }); return t + 0.22; },
  type(ac, o, t, p) { noiseHit(ac, o, t, { type: "bandpass", f: 3500 * R(p) * rand(0.9, 1.1), q: 2, d: 0.012, gain: 0.12 }); return t + 0.03; },
  blip(ac, o, t, p) { return speak(ac, o, t, "a", { kind: "blip", pitch: R(p) }); },
  // ---- world
  door_open(ac, o, t, p) {
    metalHit(ac, o, t, { f: 2500, d: 0.06, gain: 0.08, ratios: [1, 1.7, 2.9] });
    creak(ac, o, t + 0.08, { d: 0.9, f: 650 * R(p), r0: 35, r1: 85, gain: 0.22 });
    noiseHit(ac, o, t + 0.9, { type: "lowpass", f: 300, kind: "brown", d: 0.08, gain: 0.2 });
    return t + 1.1;
  },
  door_close(ac, o, t, p) {
    noiseHit(ac, o, t, { type: "lowpass", f: 320, kind: "brown", d: 0.16, gain: 0.6 });
    toneHit(ac, o, t, { f: 110, f2: 70, d: 0.12, gain: 0.3 });
    metalHit(ac, o, t + 0.08, { f: 2200, d: 0.08, gain: 0.08, ratios: [1, 1.7] });
    return t + 0.35;
  },
  creak(ac, o, t, p) { creak(ac, o, t, { d: 1.1, f: 520 * R(p), r0: 28, r1: 75, gain: 0.25 }); return t + 1.2; },
  chair_creak(ac, o, t, p) { creak(ac, o, t, { d: 0.5, f: 900 * R(p), r0: 60, r1: 140, gain: 0.18, q: 8 }); return t + 0.6; },
  gate_open(ac, o, t, p) {
    creak(ac, o, t, { d: 2.2, f: 260 * R(p), q: 4, r0: 16, r1: 42, gain: 0.4 });
    for (let i = 0; i < 8; i++) metalHit(ac, o, t + rand(0, 1.8), { f: rand(900, 1600), d: 0.1, gain: 0.04, ratios: [1, 1.5, 2.3] });
    thud(ac, o, t + 2.1, 0.7, 70, 35, 0.3);
    return t + 2.6;
  },
  portal_enter(ac, o, t, p) {
    whoosh(ac, o, t, 300, 4200, 0.55, 0.4, 0.8);
    toneHit(ac, o, t + 0.1, { f: 1800, f2: 300, a: 0.05, d: 0.7, gain: 0.08 });
    toneHit(ac, o, t + 0.1, { f: 2700, f2: 450, a: 0.05, d: 0.7, gain: 0.05 });
    toneHit(ac, o, t + 0.35, { f: 60, f2: 28, d: 0.8, gain: 0.5 });
    return t + 1.2;
  },
  portal_hum(ac, o, t) {
    const g = gain(ac, 0, o);
    [55, 82.6, 110.4].forEach((f, i) => osc(ac, "sine", f, t, t + 3.1, gain(ac, 0.3 / (i + 1), g)));
    noiseHit(ac, g, t, { type: "bandpass", f: 220, q: 2, a: 0.5, d: 2.4, gain: 0.3, sustainEnv: true, hold: 2.4, r: 0.5 });
    sustain(g.gain, t, 0.35, 0.5, 2.4, 0.5);
    return t + 3;
  },
  bell(ac, o, t, p) {
    for (let i = 0; i < 3; i++) metalHit(ac, o, t + i * rand(0.04, 0.07), { f: 3800 * R(p) * rand(0.97, 1.03), d: 0.35, gain: 0.06, ratios: [1, 1.47, 2.09, 2.56] });
    return t + 0.6;
  },
  well_chain(ac, o, t) {
    creak(ac, o, t, { d: 1.4, f: 420, r0: 20, r1: 40, gain: 0.12 });
    for (let i = 0; i < 12; i++) metalHit(ac, o, t + rand(0, 1.4), { f: rand(1500, 2700), d: 0.12, gain: 0.05, ratios: [1, 1.8, 2.7] });
    return t + 1.6;
  },
  dig(ac, o, t) {
    noiseHit(ac, o, t, { type: "bandpass", f: 2600, q: 1.2, a: 0.03, d: 0.14, gain: 0.2 });
    noiseHit(ac, o, t + 0.05, { type: "lowpass", f: 600, kind: "brown", d: 0.18, gain: 0.5 });
    noiseHit(ac, o, t + 0.3, { type: "lowpass", f: 900, a: 0.05, d: 0.4, gain: 0.22 });
    return t + 0.8;
  },
  rain(ac, o, t) { noiseHit(ac, o, t, { type: "highpass", f: 1200, a: 0.5, d: 3, gain: 0.25, sustainEnv: true, hold: 3, r: 0.8 }); return t + 4.4; },
  wind(ac, o, t) { noiseHit(ac, o, t, { type: "bandpass", f: 500, f2: 900, q: 0.8, a: 1.2, d: 2.5, gain: 0.35, kind: "pink" }); return t + 3.8; },
  birds(ac, o, t) { let tt = t; for (let i = 0; i < 3; i++) tt = chirp(ac, o, tt + rand(0.1, 0.5)); return tt; },
  river(ac, o, t) { noiseHit(ac, o, t, { type: "lowpass", f: 900, a: 0.4, d: 2.5, gain: 0.3, kind: "brown", sustainEnv: true, hold: 2.5, r: 0.5 }); return t + 3.4; },
  waterfall(ac, o, t) { noiseHit(ac, o, t, { type: "lowpass", f: 2500, a: 0.4, d: 2.5, gain: 0.35, sustainEnv: true, hold: 2.5, r: 0.5 }); return t + 3.4; },
  crickets(ac, o, t) { for (let i = 0; i < 6; i++) cricket(ac, o, t + i * 0.32); return t + 2; },
  fire(ac, o, t) {
    noiseHit(ac, o, t, { type: "lowpass", f: 500, kind: "brown", a: 0.2, d: 1.6, gain: 0.25, sustainEnv: true, hold: 1.6, r: 0.3 });
    crackles(ac, o, t, 14, 1.8, 0.12, 2000);
    return t + 2.1;
  },
  torch_whoosh(ac, o, t) { whoosh(ac, o, t, 250, 1100, 0.5, 0.35, 0.7, "brown"); crackles(ac, o, t + 0.2, 6, 0.4, 0.08); return t + 0.7; },
  chickens(ac, o, t) {
    let tt = t; const n = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) tt = cluck(ac, o, tt + rand(0.05, 0.18));
    if (Math.random() < 0.5) { syllable(ac, o, tt + 0.1, { f0: 520, f1: 760, dur: 0.35, vow: "eh", vow2: "ah", kind: "child", g: 0.12, breath: 0.4 }); tt += 0.5; }
    return tt;
  },
  dog(ac, o, t) { bark(ac, o, t); bark(ac, o, t + rand(0.25, 0.35)); return t + 0.7; },
  tree_fall(ac, o, t) {
    creak(ac, o, t, { d: 1.2, f: 300, r0: 15, r1: 40, gain: 0.3, q: 4 });
    crackles(ac, o, t + 0.9, 10, 0.4, 0.3, 1500);
    whoosh(ac, o, t + 1.2, 400, 1200, 0.6, 0.3, 0.6);
    thud(ac, o, t + 1.85, 0.9, 60, 25, 0.5);
    noiseHit(ac, o, t + 1.85, { type: "bandpass", f: 2500, q: 0.5, d: 0.8, gain: 0.2 });
    return t + 2.8;
  },
  ground_crack(ac, o, t) {
    for (let i = 0; i < 5; i++) noiseHit(ac, o, t + rand(0, 0.4), { type: "highpass", f: 1500, d: rand(0.02, 0.06), gain: 0.35 });
    noiseHit(ac, o, t, { type: "lowpass", f: 120, kind: "brown", a: 0.05, d: 1.2, gain: 0.7 });
    return t + 1.4;
  },
  rock_tumble(ac, o, t) {
    for (let i = 0; i < 9; i++) { const ti = t + rand(0, 1.5); toneHit(ac, o, ti, { f: rand(120, 300), f2: 70, d: 0.06, gain: 0.25 }); noiseHit(ac, o, ti, { type: "lowpass", f: 900, d: 0.05, gain: 0.25 }); }
    return t + 1.7;
  },
  collapse(ac, o, t) {
    noiseHit(ac, o, t, { type: "lowpass", f: 150, kind: "brown", a: 0.3, d: 3, gain: 0.8 });
    toneHit(ac, o, t, { f: 45, f2: 28, a: 0.2, d: 2.5, gain: 0.35 });
    crackles(ac, o, t + 0.2, 25, 2.5, 0.25, 1200);
    for (let i = 0; i < 10; i++) { const ti = t + rand(0.1, 2.8); thud(ac, o, ti, rand(0.15, 0.4), rand(90, 160), 50, 0.1); }
    return t + 3.5;
  },
  rumble(ac, o, t) {
    noiseHit(ac, o, t, { type: "lowpass", f: 130, kind: "brown", a: 0.6, d: 3, gain: 0.75 });
    toneHit(ac, o, t, { f: 36, f2: 30, a: 0.6, d: 2.8, gain: 0.25 });
    return t + 3.7;
  },
  fissure(ac, o, t) {
    crackles(ac, o, t, 20, 1.0, 0.3, 1300);
    noiseHit(ac, o, t, { type: "lowpass", f: 160, kind: "brown", a: 0.1, d: 1.3, gain: 0.6 });
    for (let i = 0; i < 4; i++) toneHit(ac, o, t + i * 0.25, { f: rand(100, 200), f2: 60, d: 0.08, gain: 0.25 });
    return t + 1.5;
  },
  // ---- enemies
  rat_squeak(ac, o, t, p) { return squeak(ac, o, t, rand(2800, 3900) * R(p), rand(0.12, 0.24), 0.14, 3); },
  rat_bite(ac, o, t, p) {
    noiseHit(ac, o, t, { type: "highpass", f: 3000, d: 0.01, gain: 0.4 });
    noiseHit(ac, o, t + 0.04, { type: "highpass", f: 3200, d: 0.01, gain: 0.3 });
    squeak(ac, o, t + 0.02, 3600 * R(p), 0.08, 0.07, 1);
    return t + 0.15;
  },
  rat_death(ac, o, t, p) { squeak(ac, o, t, 3400 * R(p), 0.4, 0.16, 2, 0.35); thud(ac, o, t + 0.25, 0.25, 140, 80, 0.06); return t + 0.5; },
  ratking_roar(ac, o, t, p) {
    syllable(ac, o, t, { f0: 85 * R(p), f1: 58, dur: 1.2, vow: "ah", vow2: "oh", kind: "monster", g: 0.4, breath: 0.5, dist: 4, sub: 0.6, a: 0.08 });
    squeak(ac, o, t + 0.1, 1300 * R(p), 0.9, 0.06, 5);
    noiseHit(ac, o, t, { type: "lowpass", f: 140, kind: "brown", a: 0.1, d: 1.2, gain: 0.4 });
    return t + 1.5;
  },
  ratking_squeak(ac, o, t, p) {
    squeak(ac, o, t, 2000 * R(p), 0.5, 0.25, 5);
    toneHit(ac, o, t, { f: 60, f2: 28, d: 0.6, gain: 0.5 });
    noiseHit(ac, o, t, { type: "bandpass", f: 400, f2: 120, q: 0.7, d: 0.5, gain: 0.3 });
    return t + 0.7;
  },
  cheese_roll(ac, o, t) {
    const g = gain(ac, 0, o);
    const am = gain(ac, 0.3, g.gain);
    osc(ac, "sine", 6, t, t + 1.7, am);
    noiseHit(ac, g, t, { type: "lowpass", f: 220, kind: "brown", a: 0.2, d: 1.2, gain: 0.8, sustainEnv: true, hold: 1.2, r: 0.3 });
    sustain(g.gain, t, 0.6, 0.2, 1.2, 0.3);
    for (let i = 0; i < 5; i++) toneHit(ac, o, t + rand(0, 1.4), { f: rand(150, 250), f2: 90, d: 0.05, gain: 0.12 });
    return t + 1.8;
  },
  cheese_bomb(ac, o, t) {
    thud(ac, o, t, 0.6, 80, 32, 0.4);
    noiseHit(ac, o, t, { type: "lowpass", f: 1500, d: 0.5, gain: 0.45 });
    noiseHit(ac, o, t + 0.02, { type: "bandpass", f: 520, f2: 220, q: 2, d: 0.3, gain: 0.35 });
    return t + 0.7;
  },
  villager_shout(ac, o, t, p) { return speak(ac, o, t, "get off my land", { kind: "male", pitch: 1.35 * R(p) }); },
  grunt(ac, o, t, p) { return syllable(ac, o, t, { f0: 120 * R(p), f1: 98 * R(p), dur: 0.18, vow: "uh", g: 0.32, breath: 0.22 }); },
  halberd(ac, o, t, p) { whoosh(ac, o, t, 280 * R(p), 950 * R(p), 0.36, 0.45, 1.6); toneHit(ac, o, t + 0.1, { f: 1500, f2: 1100, a: 0.05, d: 0.2, gain: 0.02 }); return t + 0.45; },
  shield_bash(ac, o, t) {
    thud(ac, o, t, 0.6, 105, 45, 0.18);
    metalHit(ac, o, t, { f: 520, d: 0.4, gain: 0.18 });
    noiseHit(ac, o, t, { type: "bandpass", f: 800, q: 3, d: 0.1, gain: 0.3 });
    return t + 0.5;
  },
  armor_clank(ac, o, t, p) {
    [0, 0.05, 0.12].forEach((dt) => metalHit(ac, o, t + dt, { f: rand(700, 1100) * R(p), d: 0.25, gain: 0.07 }));
    noiseHit(ac, o, t, { type: "highpass", f: 4500, d: 0.15, gain: 0.06 });
    return t + 0.4;
  },
  king_laugh(ac, o, t) {
    for (let i = 0; i < 4; i++) syllable(ac, o, t + i * 0.22, { f0: 98 - i * 4, f1: 86 - i * 4, dur: i === 3 ? 0.4 : 0.15, vow: "ah", kind: "male", g: 0.34, breath: 0.3, sub: 0.3 });
    return t + 1.4;
  },
  king_whisper(ac, o, t) { return whisper(ac, o, t, 6, 0.22); },
  staff_charge(ac, o, t) {
    const g = gain(ac, 0, o);
    const c = osc(ac, "sine", 300, t, t + 1.05, g); c.frequency.exponentialRampToValueAtTime(1200, t + 1);
    const mg = gain(ac, 400, c.frequency); osc(ac, "sine", 450, t, t + 1.05, mg);
    sustain(g.gain, t, 0.08, 0.7, 0.8, 0.2);
    noiseHit(ac, o, t, { type: "highpass", f: 2000, f2: 7000, a: 0.8, d: 0.2, gain: 0.08 });
    return t + 1.1;
  },
  staff_bolt(ac, o, t) {
    toneHit(ac, o, t, { type: "sawtooth", f: 1800, f2: 200, d: 0.25, gain: 0.14, shape: 2, lp: 5000 });
    noiseHit(ac, o, t, { type: "bandpass", f: 3000, q: 1, d: 0.15, gain: 0.25 });
    toneHit(ac, o, t, { f: 600, f2: 150, d: 0.3, gain: 0.2 });
    return t + 0.35;
  },
  teleport(ac, o, t) {
    noiseHit(ac, o, t, { type: "bandpass", f: 500, f2: 3500, q: 1.5, a: 0.33, d: 0.02, gain: 0.3 });
    toneHit(ac, o, t + 0.35, { f: 900, f2: 200, d: 0.08, gain: 0.25 });
    thud(ac, o, t + 0.36, 0.3, 80, 40, 0.15);
    return t + 0.6;
  },
  cat_hiss(ac, o, t) {
    const g = gain(ac, 1, o), am = gain(ac, 0.3, g.gain);
    osc(ac, "sine", 23, t, t + 0.75, am);
    noiseHit(ac, g, t, { type: "bandpass", f: 5200, q: 0.5, a: 0.05, d: 0.6, gain: 0.35, type2: "highpass" });
    return t + 0.75;
  },
  meow(ac, o, t, p) { return syllable(ac, o, t, { f0: 620 * R(p), f1: 470 * R(p), dur: 0.55, vow: "ee", vow2: "oo", kind: "child", g: 0.25, breath: 0.15, vib: 30, a: 0.06 }); },
  purr(ac, o, t, p) { purrNodes(ac, o, t, 2.2, 24 * R(p), 300, 0.5); return t + 2.3; },
  kitten_purr(ac, o, t, p) { purrNodes(ac, o, t, 1.8, 30 * R(p), 520, 0.3); return t + 1.9; },
  pounce(ac, o, t) {
    whoosh(ac, o, t, 400, 1600, 0.3, 0.35);
    thud(ac, o, t + 0.3, 0.7, 80, 35, 0.2);
    syllable(ac, o, t + 0.05, { f0: 480, f1: 380, dur: 0.25, vow: "ah", vow2: "oo", kind: "child", g: 0.18, breath: 0.4, dist: 1.5 });
    return t + 0.6;
  },
  rookie_oof(ac, o, t) {
    syllable(ac, o, t, { f0: 200, f1: 120, dur: 0.3, vow: "oo", vow2: "uh", g: 0.34, breath: 0.15 });
    const g = gain(ac, 0, o);
    const b = osc(ac, "sine", 300, t + 0.25, t + 0.7, g);
    b.frequency.exponentialRampToValueAtTime(620, t + 0.35); b.frequency.exponentialRampToValueAtTime(240, t + 0.65);
    const vg = gain(ac, 60, b.detune); osc(ac, "sine", 18, t + 0.25, t + 0.7, vg);
    perc(g.gain, t + 0.25, 0.12, 0.01, 0.4);
    return t + 0.75;
  },
  // ---- the Hollow
  hollow_breath(ac, o, t) {
    noiseHit(ac, o, t, { type: "bandpass", f: 400, f2: 900, q: 1.5, a: 0.8, d: 0.4, gain: 0.25, sustainEnv: true, hold: 1.0, r: 0.3 });
    noiseHit(ac, o, t + 1.35, { type: "bandpass", f: 900, f2: 280, q: 1.2, a: 0.1, d: 1.1, gain: 0.3 });
    const g = gain(ac, 0, o), am = gain(ac, 0.5, g.gain);
    osc(ac, "sine", 7, t, t + 2.6, am);
    osc(ac, "sine", 44, t, t + 2.6, g);
    sustain(g.gain, t, 0.15, 0.5, 1.8, 0.6);
    return t + 2.7;
  },
  hollow_shriek(ac, o, t, p) { return shriek(ac, o, t, 1.6, 0.32, R(p)); },
  hollow_step(ac, o, t, p) {
    thud(ac, o, t, 0.6, 72 * R(p), 30, 0.3);
    noiseHit(ac, o, t + 0.02, { type: "bandpass", f: 620, f2: 240, q: 2, d: 0.2, gain: 0.3 });
    toneHit(ac, o, t + 0.12, { f: rand(500, 800), f2: rand(900, 1300), d: 0.05, gain: 0.05 });
    return t + 0.45;
  },
  melt(ac, o, t) {
    noiseHit(ac, o, t, { type: "lowpass", f: 500, f2: 200, kind: "brown", a: 0.3, d: 2, gain: 0.45 });
    for (let i = 0; i < 16; i++) { const ti = t + rand(0, 2.4); toneHit(ac, o, ti, { f: rand(180, 650), f2: rand(700, 1400), d: rand(0.03, 0.07), gain: 0.08 }); }
    return t + 2.6;
  },
  solidify(ac, o, t) {
    metalHit(ac, o, t, { f: 880, d: 2.5, gain: 0.2 });
    metalHit(ac, o, t + 0.01, { f: 1320, d: 2, gain: 0.08 });
    noiseHit(ac, o, t, { type: "highpass", f: 3000, f2: 9000, a: 0.3, d: 0.6, gain: 0.08 });
    return t + 2.6;
  },
  jumpscare(ac, o, t) {
    shriek(ac, o, t, 1.3, 0.38, 1.1);
    const g = gain(ac, 0, o), sh = shaper(ac, 3);
    sh.connect(g);
    const k = osc(ac, "sine", 70, t, t + 1, sh); k.frequency.exponentialRampToValueAtTime(24, t + 0.6);
    perc(g.gain, t, 0.55, 0.003, 0.8);
    noiseHit(ac, o, t, { type: "highpass", f: 1800, d: 0.45, gain: 0.35, kind: "white" });
    return t + 1.4;
  },
  tinnitus(ac, o, t, p) {
    const g = gain(ac, 0, o);
    osc(ac, "sine", 4000, t, t + 5.3, g);
    osc(ac, "sine", 4031, t, t + 5.3, gain(ac, 0.3, g));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.04);
    g.gain.setValueAtTime(0.09, t + 1.5);
    g.gain.exponentialRampToValueAtTime(TINY, t + 5.2);
    return t + 5.3;
  },
  clock_tick(ac, o, t, p) {
    toneHit(ac, o, t, { f: 2100 * R(p), d: 0.02, gain: 0.12 });
    noiseHit(ac, o, t, { type: "bandpass", f: 3000 * R(p), q: 4, d: 0.012, gain: 0.25 });
    return t + 0.05;
  },
  heartbeat(ac, o, t, p) {
    toneHit(ac, o, t, { f: 62 * R(p), f2: 40, d: 0.14, gain: 0.6, lp: 200 });
    toneHit(ac, o, t + 0.27, { f: 58 * R(p), f2: 38, d: 0.12, gain: 0.4, lp: 200 });
    return t + 0.5;
  },
  sob(ac, o, t, p) { return vsob(ac, o, t, { f0: 540 * R(p), g: 0.25 }); },
  sand_hiss(ac, o, t) { noiseHit(ac, o, t, { type: "bandpass", f: 6000, q: 0.4, a: 0.5, d: 1.4, gain: 0.25, sustainEnv: true, hold: 1.4, r: 0.6 }); return t + 2.6; },
  crow(ac, o, t, p) {
    const n = 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < n; i++) syllable(ac, o, t + i * 0.45, { f0: 430 * R(p), f1: 360 * R(p), dur: 0.28, vow: "ah", vow2: "a", kind: "male", g: 0.26, breath: 0.45, dist: 3, a: 0.02 });
    return t + n * 0.45 + 0.2;
  },
  woodpecker(ac, o, t, p) {
    for (let i = 0; i < 14; i++) {
      const ti = t + i / 17, gv = 0.25 * (1 - i / 18);
      toneHit(ac, o, ti, { f: 950 * R(p), f2: 720, d: 0.025, gain: gv * 0.5 });
      noiseHit(ac, o, ti, { type: "bandpass", f: 1600, q: 3, d: 0.02, gain: gv });
    }
    return t + 1;
  },
  glitch(ac, o, t) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const ti = t + i * 0.035;
      if (Math.random() < 0.3) continue;
      if (Math.random() < 0.5) toneHit(ac, o, ti, { type: "square", f: rand(80, 2000), d: 0.028, gain: 0.06, a: 0.001 });
      else noiseHit(ac, o, ti, { type: "bandpass", f: rand(400, 6000), q: 3, d: 0.025, gain: 0.3 });
    }
    return t + 0.4;
  },
  void_hum(ac, o, t) {
    // the faint hum of the girl's melody heard at the void edge (secret)
    const notes = [], N = [[69, 2], [66, 2], [69, 4], [69, 2], [66, 2], [69, 4]];
    let tt = t; const e = 0.42;
    for (const [n, l] of N) { notes.push({ t: tt, d: l * e * 0.95, n, vow: "mm", v: 0.7 }); tt += l * e; }
    sing(ac, o, notes, { kind: "child", gainV: 0.12, flat: -25, wobble: 6, breath: 0.08 });
    return tt + 0.6;
  },
};
// aliases (callers may use these spellings)
SFX.step_rock = SFX.step_stone; SFX.step_cobble = SFX.step_stone; SFX.step_water = SFX.step_puddle;
SFX.step_hay = SFX.step_grass; SFX.step_obsidian = SFX.step_stone; SFX.step_metalplate = SFX.step_metal;
SFX.secret_chime = SFX.level_up;

function purrNodes(ac, o, t, d, rate, lp, g0) {
  const g = gain(ac, 0, o), am = gain(ac, 0.5, g.gain);
  osc(ac, "sine", rate, t, t + d + 0.1, am);
  const f = filter(ac, "lowpass", lp, 1, g);
  src(ac, noiseBuffer(ac, "brown"), t, f, { loop: true, offset: rand(0, 2), dur: d + 0.1 });
  osc(ac, "sawtooth", rate, t, t + d + 0.1, gain(ac, 0.15, f));
  sustain(g.gain, t, g0, 0.3, d - 0.5, 0.4);
}
function shriek(ac, o, t, d, g0, r = 1) {
  const g = gain(ac, 0, o);
  const sh = shaper(ac, 4); sh.connect(g);
  const bp = filter(ac, "bandpass", 1600, 0.6, sh);
  const rm = gain(ac, 0, bp);
  osc(ac, "sine", 37, t, t + d + 0.1, rm.gain);
  const mix = gain(ac, 1); mix.connect(rm); mix.connect(gain(ac, 0.5, bp));
  for (let i = 0; i < 4; i++) {
    const f = (700 + i * 210) * r;
    const x = osc(ac, "sawtooth", f, t, t + d + 0.1, mix, rand(-30, 30));
    x.frequency.linearRampToValueAtTime(f * 1.5, t + d * 0.25);
    x.frequency.linearRampToValueAtTime(f * 1.15, t + d);
    const fm = gain(ac, f * 0.12, x.frequency); osc(ac, "sine", 9 + i * 4.3, t, t + d + 0.1, fm);
  }
  noiseHit(ac, mix, t, { type: "bandpass", f: 2500, q: 0.6, a: 0.01, d, gain: 0.5 });
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(g0, t + 0.02);
  g.gain.setValueAtTime(g0, t + d * 0.5);
  g.gain.exponentialRampToValueAtTime(TINY, t + d);
  return t + d;
}

// ---------------------------------------------------------------- continuous ambient loops
function bed(ac, out, t, kind, type, f, q, g0) {
  const g = gain(ac, 0, out);
  const fl = filter(ac, type, f, q, g);
  const s = src(ac, noiseBuffer(ac, kind), t, fl, { loop: true, offset: rand(0, 2.5) });
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(g0, t + 1.2);
  return { g, fl, s, oscs: [] };
}
function lfo(ac, t, rate, depth, param, list) { const lg = gain(ac, depth, param); const o = osc(ac, "sine", rate, t, t + 1e5, lg); list.push(o); return o; }
function stopper(beds) {
  return (t, fade = 0.3) => {
    for (const b of beds) {
      try {
        b.g.gain.cancelScheduledValues(t);
        b.g.gain.setValueAtTime(b.g.gain.value, t);
        b.g.gain.linearRampToValueAtTime(0, t + fade);
        b.s.stop(t + fade + 0.05);
        for (const o of b.oscs) o.stop(t + fade + 0.05);
      } catch (e) { /* already stopped */ }
    }
  };
}
function eventLoop(ac, out, t, every, fire) {
  // a loop made of scheduled one-shots; tick(now, until) schedules events up to `until`
  const g = gain(ac, 1, out);
  let next = t + rand(0.2, Math.min(every[1], 2.5)), stopped = false;
  return {
    tick(now, until) { while (!stopped && next < until) { const end = fire(ac, g, Math.max(next, now)); next = Math.max(end, next) + rand(every[0], every[1]); } },
    stop(tt, fade = 0.3) { stopped = true; g.gain.setValueAtTime(g.gain.value, tt); g.gain.linearRampToValueAtTime(0, tt + fade); },
  };
}

export const LOOPS = {
  wind(ac, out, t) {
    const a = bed(ac, out, t, "pink", "bandpass", 480, 0.7, 0.4);
    lfo(ac, t, 0.07, 260, a.fl.frequency, a.oscs); lfo(ac, t, 0.11, 0.18, a.g.gain, a.oscs);
    const b = bed(ac, out, t, "pink", "bandpass", 1500, 6, 0.05);
    lfo(ac, t, 0.05, 500, b.fl.frequency, b.oscs); lfo(ac, t, 0.13, 0.04, b.g.gain, b.oscs);
    return { stop: stopper([a, b]), tick() {} };
  },
  rain(ac, out, t) {
    const a = bed(ac, out, t, "white", "highpass", 1200, 0.5, 0.18);
    const b = bed(ac, out, t, "brown", "lowpass", 400, 0.7, 0.35);
    const c = bed(ac, out, t, "white", "bandpass", 4200, 1.5, 0.08);
    lfo(ac, t, 7.3, 0.05, c.g.gain, c.oscs); lfo(ac, t, 0.09, 0.08, a.g.gain, a.oscs);
    const drips = eventLoop(ac, out, t, [0.08, 0.5], (ac2, o, tt) => { toneHit(ac2, o, tt, { f: rand(1800, 3600), f2: rand(900, 1500), d: 0.03, gain: 0.03 }); return tt + 0.04; });
    const st = stopper([a, b, c]);
    return { stop(tt, f) { st(tt, f); drips.stop(tt, f); }, tick: drips.tick };
  },
  river(ac, out, t) {
    const a = bed(ac, out, t, "brown", "lowpass", 900, 0.7, 0.5);
    const b = bed(ac, out, t, "pink", "bandpass", 1800, 1.2, 0.12);
    lfo(ac, t, 0.3, 500, b.fl.frequency, b.oscs); lfo(ac, t, 0.7, 0.05, b.g.gain, b.oscs);
    return { stop: stopper([a, b]), tick() {} };
  },
  waterfall(ac, out, t) {
    const a = bed(ac, out, t, "white", "lowpass", 2600, 0.6, 0.35);
    const b = bed(ac, out, t, "brown", "lowpass", 220, 0.8, 0.6);
    return { stop: stopper([a, b]), tick() {} };
  },
  portal_hum(ac, out, t) {
    const a = bed(ac, out, t, "pink", "bandpass", 220, 2, 0.25);
    const g = gain(ac, 0, out);
    g.gain.linearRampToValueAtTime(0.25, t + 1);
    const b = { g, s: osc(ac, "sine", 55, t, t + 1e5, g), oscs: [] };
    b.oscs.push(osc(ac, "sine", 82.6, t, t + 1e5, gain(ac, 0.5, g)), osc(ac, "sine", 110.4, t, t + 1e5, gain(ac, 0.3, g)));
    lfo(ac, t, 3.3, 0.08, g.gain, b.oscs);
    return { stop: stopper([a, b]), tick() {} };
  },
  sand_hiss(ac, out, t) {
    const a = bed(ac, out, t, "white", "bandpass", 5500, 0.5, 0.12);
    lfo(ac, t, 0.09, 0.08, a.g.gain, a.oscs); lfo(ac, t, 0.05, 2000, a.fl.frequency, a.oscs);
    return { stop: stopper([a]), tick() {} };
  },
  rumble(ac, out, t) {
    const a = bed(ac, out, t, "brown", "lowpass", 140, 0.8, 0.7);
    lfo(ac, t, 0.2, 0.25, a.g.gain, a.oscs);
    return { stop: stopper([a]), tick() {} };
  },
  fire(ac, out, t) {
    const a = bed(ac, out, t, "brown", "lowpass", 500, 0.7, 0.25);
    const ev = eventLoop(ac, out, t, [0.03, 0.35], (ac2, o, tt) => { noiseHit(ac2, o, tt, { type: "highpass", f: rand(1800, 4000), d: rand(0.004, 0.02), gain: rand(0.05, 0.16) }); return tt + 0.02; });
    const st = stopper([a]);
    return { stop(tt, f) { st(tt, f); ev.stop(tt, f); }, tick: ev.tick };
  },
  purr(ac, out, t) {
    const g = gain(ac, 0, out); g.gain.linearRampToValueAtTime(0.4, t + 0.5);
    const am = gain(ac, 0.4, g.gain); const lp = filter(ac, "lowpass", 320, 1, g);
    const b = { g, s: src(ac, noiseBuffer(ac, "brown"), t, lp, { loop: true }), oscs: [osc(ac, "sine", 25, t, t + 1e5, am)] };
    return { stop: stopper([b]), tick() {} };
  },
  birds(ac, out, t) { return eventLoop(ac, out, t, [1.2, 5], (a, o, tt) => chirp(a, o, tt, rand(0.03, 0.08))); },
  crickets(ac, out, t) { return eventLoop(ac, out, t, [0.15, 0.6], (a, o, tt) => cricket(a, o, tt)); },
  chickens(ac, out, t) { return eventLoop(ac, out, t, [3, 9], (a, o, tt) => SFX.chickens(a, o, tt)); },
  dog(ac, out, t) { return eventLoop(ac, out, t, [8, 20], (a, o, tt) => SFX.dog(a, o, tt)); },
  heartbeat(ac, out, t) { return eventLoop(ac, out, t, [0.32, 0.36], (a, o, tt) => SFX.heartbeat(a, o, tt)); },
  clock_tick(ac, out, t) {
    let k = 0;
    return eventLoop(ac, out, t, [0.95, 0.95], (a, o, tt) => SFX.clock_tick(a, o, tt, { rate: k++ % 2 ? 0.8 : 1 }));
  },
  hollow_breath(ac, out, t) { return eventLoop(ac, out, t, [0.6, 1.6], (a, o, tt) => SFX.hollow_breath(a, o, tt)); },
  crow(ac, out, t) { return eventLoop(ac, out, t, [6, 18], (a, o, tt) => SFX.crow(a, o, tt)); },
  woodpecker(ac, out, t) { return eventLoop(ac, out, t, [5, 15], (a, o, tt) => SFX.woodpecker(a, o, tt)); },
};
// generic: any one-shot id can be looped by re-triggering it
export function genericLoop(id) {
  return (ac, out, t) => eventLoop(ac, out, t, [0.4, 2.5], (a, o, tt) => SFX[id](a, o, tt, {}));
}
export const SFX_IDS = Object.keys(SFX);
export const UI_IDS = new Set(["ui_hover", "ui_click", "ui_toast", "ui_error", "ui_open", "ui_close", "type", "blip", "tinnitus"]);
