// sfx.js - BONUS_AUDIO: synthesized sound effects for the Wildwood Homestead bonus level. WebAudio node graphs only
// (no DOM, no globals): every sound is a function play(K, out, t, o) that builds a few short-lived nodes on K.ac
// (an AudioContext OR an OfflineAudioContext), so the same code plays live and pre-renders ("bakes") the frequent
// sounds once into AudioBuffers (see index.js). Nothing here touches the game state.
//
//   import { SOUNDS, SOUND_NAMES, makeKit } from "./sfx.js"
//   const K = makeKit(ac, reverbInputNode)      // per context
//   SOUNDS.chop.play(K, outGain, ac.currentTime, { pitch: 1, kind: "oak", k: 0.5 })
// Each entry: { len (s, the ring-out time; bake length + voice accounting), gap (s, min re-trigger interval),
//               pri (0 low .. 2 must-play), bake (variants to pre-render, 0 = always live), play }.
import { noiseData } from "../../audio/dsp.js";

const NOISE = new Map(); // sampleRate -> { color: AudioBuffer } (AudioBuffers are not tied to a context: live + offline share them)

export function makeKit(ac, revIn) {
  let nb = NOISE.get(ac.sampleRate);
  if (!nb) { nb = {}; NOISE.set(ac.sampleRate, nb); }
  const noise = (color = "white") => {
    if (!nb[color]) {
      const n = noiseData(ac.sampleRate, 4.2, color, 17 + color.length * 13);
      const b = ac.createBuffer(1, n.length, ac.sampleRate); b.getChannelData(0).set(n.data); nb[color] = b;
    }
    return nb[color];
  };
  const K = {
    ac,
    noise,
    rnd: Math.random,
    jit: (a) => 1 + (Math.random() * 2 - 1) * a,
    // reverb send from a node (amount 0..1)
    send(node, amt) { if (!revIn || !amt) return; const g = ac.createGain(); g.gain.value = amt; node.connect(g); g.connect(revIn); },
    pan(dest, p) {
      if (!p || !ac.createStereoPanner) return dest;
      const s = ac.createStereoPanner(); s.pan.value = Math.max(-1, Math.min(1, p)); s.connect(dest); return s;
    },
    // oscillator blip: exponential pitch sweep, fast attack, exponential decay
    tone(dest, t, { type = "sine", f0, f1 = f0, dur = 0.1, gain = 0.2, attack = 0.003, sweep = dur, vib = 0, vibRate = 6, hold = 0 }) {
      const o = ac.createOscillator(), e = ac.createGain(); o.type = type; e.gain.value = 0;
      o.frequency.setValueAtTime(Math.max(20, f0), t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + Math.max(0.005, sweep));
      if (vib) {
        const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = vibRate;
        lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + attack + hold + dur + 0.05);
      }
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(gain, t + attack);
      if (hold) e.gain.setValueAtTime(gain, t + attack + hold);
      e.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + dur);
      o.connect(e); e.connect(dest); o.start(t); o.stop(t + attack + hold + dur + 0.03);
    },
    // filtered noise burst with an optional filter sweep
    burst(dest, t, { color = "white", type = "lowpass", f = 1000, f1 = f, q = 0.8, dur = 0.1, gain = 0.2, attack = 0.002, hold = 0 }) {
      // NOT looped: Chrome can emit garbage when a looping buffer source that already wrapped is stop()ped, which
      // blows up the filter after it. A 4.1 s buffer read from a random offset covers every burst we make.
      const n = ac.createBufferSource(); n.buffer = noise(color);
      const need = attack + hold + dur + 0.05, room = n.buffer.duration - need;
      if (room < 0) n.loop = true;
      const fl = ac.createBiquadFilter(); fl.type = type; fl.Q.value = q;
      fl.frequency.setValueAtTime(f, t); if (f1 !== f) fl.frequency.exponentialRampToValueAtTime(f1, t + attack + hold + dur);
      const e = ac.createGain(); e.gain.value = 0; // 0 before the envelope starts (sub-sample starts would leak one full-gain sample)
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(gain, t + attack);
      if (hold) e.gain.setValueAtTime(gain, t + attack + hold);
      e.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + dur);
      n.connect(fl); fl.connect(e); e.connect(dest); n.start(t, room > 0 ? Math.random() * room : 0); n.stop(t + attack + hold + dur + 0.03);
    },
    // two-operator FM bell
    bell(dest, t, hz, { dur = 1, gain = 0.12, ratio = 3.5, index = 1.6, attack = 0.003 } = {}) {
      const c = ac.createOscillator(), m = ac.createOscillator(), mg = ac.createGain(), e = ac.createGain(); e.gain.value = 0;
      c.frequency.value = hz; m.frequency.value = hz * ratio;
      mg.gain.setValueAtTime(hz * index, t); mg.gain.exponentialRampToValueAtTime(Math.max(1, hz * 0.04), t + dur * 0.6);
      m.connect(mg); mg.connect(c.frequency); c.connect(e); e.connect(dest);
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(gain, t + attack); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      c.start(t); m.start(t); c.stop(t + dur + 0.03); m.stop(t + dur + 0.03);
    },
    // inharmonic ringing partials (metal, stone ping): [[hz, gain, decay], ...]
    ring(dest, t, parts) {
      for (const [hz, g, d] of parts) K.tone(dest, t, { f0: hz, dur: d, gain: g, attack: 0.001 });
    },
    // a voiced call: oscillator with a pitch contour [[dt, hz], ...] through vowel formants [[f, q, g], ...]
    voice(dest, t, { wave = "sawtooth", pts, dur, gain = 0.2, formants = [], vib = 0, vibRate = 6, am = 0, amDepth = 0.5, attack = 0.02, release = 0.12, breath = 0, lp = 0 }) {
      const o = ac.createOscillator(); o.type = wave;
      o.frequency.setValueAtTime(pts[0][1], t);
      for (let i = 1; i < pts.length; i++) o.frequency.linearRampToValueAtTime(pts[i][1], t + pts[i][0]);
      const end = t + dur + 0.05;
      if (vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = vibRate; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(end); }
      const e = ac.createGain(); e.gain.value = 0; // 0 before the envelope starts (sub-sample starts would leak one full-gain sample)
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(gain, t + attack);
      e.gain.setValueAtTime(gain, t + Math.max(attack, dur - release));
      e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let src = o;
      if (am) { // amplitude roughness (growls, grunts)
        const ag = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain();
        ag.gain.value = 1 - amDepth * 0.5; l.frequency.value = am; lg.gain.value = amDepth * 0.5;
        l.connect(lg); lg.connect(ag.gain); o.connect(ag); l.start(t); l.stop(end); src = ag;
      }
      if (lp) { const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp; f.Q.value = 0.6; src.connect(f); src = f; }
      if (formants.length) for (const [f, q, g] of formants) {
        const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = q;
        const fg = ac.createGain(); fg.gain.value = g; src.connect(bp); bp.connect(fg); fg.connect(e);
      } else src.connect(e);
      e.connect(dest); o.start(t); o.stop(end);
      if (breath) K.burst(dest, t, { type: "bandpass", f: formants[0] ? formants[0][0] * 1.5 : 1500, q: 1.2, dur: dur * 0.8, gain: breath, attack: attack * 2 });
    },
    // soft brass note (fanfares): detuned saws through a lowpass that opens with the attack
    brass(dest, t, hz, { dur = 0.6, gain = 0.1, bright = 1, attack = 0.04 } = {}) {
      const f = ac.createBiquadFilter(); f.type = "lowpass"; f.Q.value = 1.2;
      f.frequency.setValueAtTime(hz * 1.2, t); f.frequency.linearRampToValueAtTime(hz * (3 + 3 * bright), t + attack + 0.04);
      f.frequency.setTargetAtTime(hz * (2 + 1.5 * bright), t + attack + 0.05, 0.2);
      const e = ac.createGain(); e.gain.value = 0; // 0 before the envelope starts (sub-sample starts would leak one full-gain sample)
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(gain, t + attack);
      e.gain.setTargetAtTime(gain * 0.75, t + attack, 0.15);
      e.gain.setValueAtTime(gain * 0.75, t + dur);
      e.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.35);
      for (const d of [-7, 6]) { const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = hz; o.detune.value = d; o.connect(f); o.start(t); o.stop(t + dur + 0.4); }
      f.connect(e); e.connect(dest);
    },
  };
  return K;
}

// ---------------------------------------------------------------------------------------------- helpers
const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// a quick wooden knock: body resonance + contact click
function knock(K, d, t, hz, g) {
  K.tone(d, t, { f0: hz * 1.25, f1: hz, dur: 0.07, sweep: 0.02, gain: g });
  K.tone(d, t, { type: "triangle", f0: hz * 2.7, dur: 0.035, gain: g * 0.4 });
  K.burst(d, t, { type: "bandpass", f: hz * 4, q: 2.5, dur: 0.02, gain: g * 0.6 });
}
function pebbles(K, d, t, n, spread, g, lo = 900, hi = 3200) {
  for (let i = 0; i < n; i++) {
    const dt = Math.random() * spread;
    K.burst(d, t + dt, { type: "bandpass", f: lo + Math.random() * (hi - lo), q: 3.5, dur: 0.018 + Math.random() * 0.02, gain: g * (1 - 0.6 * dt / spread) });
  }
}
function rustle(K, d, t, dur, g) {
  K.burst(d, t, { type: "bandpass", f: 3200 * K.jit(0.2), f1: 2200, q: 0.8, dur, gain: g, attack: 0.02 });
  K.burst(d, t + 0.03, { type: "highpass", f: 5200, dur: dur * 0.8, gain: g * 0.5, attack: 0.01 });
}
function chimes(K, d, t, notes, step, g, dur = 0.7) { notes.forEach((m, i) => K.bell(d, t + i * step, NOTE(m), { dur, gain: g, ratio: 2, index: 1 })); }

// ---------------------------------------------------------------------------------------------- the sounds
const S = {};
const def = (name, len, gap, pri, bake, play) => { S[name] = { len, gap, pri, bake, play }; };

// --- trees ---------------------------------------------------------------------------------------------
// woody "thock"; o.k = progress 0..1 (later hits sound deeper), o.kind (pine brighter, ancient deeper)
def("chop", 0.35, 0.05, 1, 4, (K, d, t, o) => {
  const kp = { pine: 1.15, birch: 1.08, ancient: 0.78 }[o.kind] || 1, p = (o.pitch || 1) * kp * K.jit(0.05) * (1 - 0.12 * (o.k || 0));
  K.tone(d, t, { f0: 230 * p, f1: 120 * p, dur: 0.14, sweep: 0.05, gain: 0.34 });
  K.burst(d, t, { type: "bandpass", f: 950 * p, q: 2.6, dur: 0.07, gain: 0.32 });
  K.tone(d, t, { type: "triangle", f0: 440 * p, f1: 400 * p, dur: 0.09, gain: 0.08 });
  K.tone(d, t, { f0: 690 * p, dur: 0.05, gain: 0.05 });
  K.burst(d, t, { type: "highpass", f: 3500, dur: 0.018, gain: 0.12 });
  K.burst(d, t + 0.02, { type: "bandpass", f: 3600, f1: 2400, q: 0.8, dur: 0.16, gain: 0.025, attack: 0.02 }); // leaves shiver
  K.send(d, 0.12);
});
def("tree_fall", 2.6, 0.4, 2, 0, (K, d, t, o) => {
  const big = o.kind === "ancient" ? 1.35 : o.kind === "pine" ? 1.12 : 1;
  // creak: a slow stick-slip groan
  K.tone(d, t, { type: "sawtooth", f0: 120 / big, f1: 82 / big, dur: 0.6, sweep: 0.6, gain: 0.03, attack: 0.06, vib: 18, vibRate: 13 });
  K.burst(d, t, { type: "bandpass", f: 700, f1: 420, q: 4, dur: 0.6, gain: 0.05, attack: 0.08 });
  // splinter cracks
  for (let i = 0; i < 5; i++) K.burst(d, t + 0.45 + i * (0.05 + Math.random() * 0.05), { type: "highpass", f: 1800 + Math.random() * 1500, dur: 0.03, gain: 0.12 - i * 0.015 });
  // canopy whoosh as it falls
  K.burst(d, t + 0.62, { type: "bandpass", f: 2400, f1: 500, q: 0.7, dur: 0.55, gain: 0.12, attack: 0.25 });
  // the ground thud + leaf crash
  const tt = t + 1.18;
  K.tone(d, tt, { f0: 85 / big, f1: 34, dur: 0.55, sweep: 0.3, gain: 0.32 });
  K.burst(d, tt, { color: "brown", f: 420, f1: 120, dur: 0.6, gain: 0.22 * big });
  K.burst(d, tt, { color: "pink", f: 1500, f1: 300, dur: 0.35, gain: 0.16 });
  rustle(K, d, tt + 0.02, 0.8, 0.07);
  pebbles(K, d, tt + 0.05, 7, 0.5, 0.05, 1500, 4000); // twigs
  K.send(d, 0.3);
});
def("tree_plant", 0.6, 0.2, 1, 0, (K, d, t) => {
  K.burst(d, t, { color: "pink", f: 700, f1: 300, dur: 0.1, gain: 0.16 });
  K.burst(d, t + 0.12, { color: "pink", f: 600, f1: 250, dur: 0.1, gain: 0.12 });
  chimes(K, d, t + 0.18, [84, 88, 91], 0.06, 0.04, 0.5);
  K.send(d, 0.3);
});

// --- digging and mining ----------------------------------------------------------------------------------
// o.mat: "dirt" | "sand" | "clay" | "gravel"
def("dig", 0.25, 0.05, 1, 3, (K, d, t, o) => {
  const p = (o.pitch || 1) * K.jit(0.08), m = o.mat || "dirt";
  if (m === "sand") {
    K.burst(d, t, { type: "bandpass", f: 2600 * p, f1: 1600, q: 0.6, dur: 0.16, gain: 0.45, attack: 0.008 });
    K.burst(d, t, { color: "pink", f: 600, dur: 0.06, gain: 0.2 });
  } else if (m === "clay") {
    K.tone(d, t, { f0: 170 * p, f1: 90 * p, dur: 0.1, gain: 0.22 });
    K.burst(d, t, { color: "brown", f: 500, f1: 220, dur: 0.12, gain: 0.25 });
    K.burst(d, t + 0.05, { type: "bandpass", f: 900, f1: 1500, q: 4, dur: 0.06, gain: 0.05 }); // squelch
  } else {
    K.burst(d, t, { color: "pink", f: 1100 * p, f1: 300, dur: 0.13, gain: 0.26 });
    K.tone(d, t, { f0: 140 * p, f1: 75, dur: 0.08, gain: 0.18 });
    pebbles(K, d, t + 0.01, m === "gravel" ? 6 : 3, 0.12, m === "gravel" ? 0.07 : 0.04, 1200, 3500);
  }
  K.send(d, 0.06);
});
// pickaxe on stone: a ringing "tink" over a stony thud. o.ore: 0 stone, 1 coal, 2 iron, 3 gold, 4 crystal
def("pick", 0.7, 0.05, 1, 4, (K, d, t, o) => {
  const ore = o.ore || 0, p = (o.pitch || 1) * K.jit(0.04) * (1 + 0.06 * ore);
  K.burst(d, t, { type: "bandpass", f: 3600 * p, q: 6, dur: 0.025, gain: 0.3 });
  K.burst(d, t, { color: "pink", f: 1500, f1: 500, dur: 0.07, gain: 0.2 });
  K.tone(d, t, { f0: 180, f1: 90, dur: 0.06, gain: 0.14 });
  const ring = 0.12 + 0.07 * ore;
  K.ring(d, t, [[1830 * p, 0.07, ring], [2870 * p, 0.05, ring * 0.8], [4310 * p, 0.03, ring * 0.6]]);
  if (ore >= 2) K.bell(d, t + 0.005, 2600 * p, { dur: 0.35 + 0.12 * ore, gain: 0.03 + 0.008 * ore, ratio: 2.76, index: 0.7 });
  if (ore >= 4) chimes(K, d, t + 0.04, [96, 100, 103], 0.04, 0.02, 0.5);
  pebbles(K, d, t + 0.02, 2, 0.08, 0.05, 1600, 3600);
  K.send(d, 0.1 + 0.04 * ore);
});
def("crumble_soft", 0.5, 0.05, 1, 0, (K, d, t, o) => {
  const sand = o.mat === "sand";
  K.burst(d, t, { color: "pink", f: sand ? 2500 : 1300, f1: 220, dur: 0.32, gain: 0.26, attack: 0.004 });
  K.tone(d, t, { f0: 120, f1: 55, dur: 0.14, gain: 0.18 });
  pebbles(K, d, t + 0.03, 6, 0.3, 0.05, 800, 2600);
  K.send(d, 0.08);
});
def("crumble_stone", 0.9, 0.05, 1, 0, (K, d, t, o) => {
  const ore = o.ore || 0;
  K.burst(d, t, { type: "highpass", f: 1600, dur: 0.05, gain: 0.22 });
  K.burst(d, t, { color: "pink", f: 800, f1: 150, dur: 0.5, gain: 0.3, attack: 0.004 });
  K.tone(d, t, { f0: 110, f1: 48, dur: 0.22, gain: 0.24 });
  pebbles(K, d, t + 0.04, 10, 0.5, 0.08);
  if (ore >= 2) chimes(K, d, t + 0.05, ore >= 4 ? [91, 95, 98, 103] : ore === 3 ? [88, 91, 96] : [84, 88], 0.05, 0.035, 0.6);
  K.send(d, 0.14);
});
def("too_hard", 0.45, 0.25, 1, 0, (K, d, t) => {
  K.ring(d, t, [[620, 0.09, 0.12], [1530, 0.06, 0.09], [2390, 0.03, 0.06]]);
  K.burst(d, t, { type: "bandpass", f: 2200, q: 5, dur: 0.03, gain: 0.2 });
  K.tone(d, t + 0.09, { type: "triangle", f0: 330, f1: 250, dur: 0.12, gain: 0.07 }); // "nope"
  K.send(d, 0.1);
});
def("protected", 0.3, 0.3, 0, 0, (K, d, t) => {
  K.tone(d, t, { f0: 300, f1: 250, dur: 0.07, gain: 0.12 });
  K.tone(d, t + 0.09, { f0: 240, f1: 200, dur: 0.09, gain: 0.1 });
});

// --- swings (every swing, hit or miss; quiet so impacts lead) --------------------------------------------
// o.kind: "hand" | "blade" (sword/spear) | "tool" (axe/pickaxe) | "heavy" (hammer) | "bow"; o.tier 0..4
def("swing", 0.3, 0.06, 0, 4, (K, d, t, o) => {
  const k = o.kind || "tool", tr = 1 + 0.05 * (o.tier || 0), p = (o.pitch || 1) * tr * K.jit(0.06);
  if (k === "bow") { // string drawn: a small creak
    K.tone(d, t, { type: "sawtooth", f0: 160, f1: 210, dur: 0.18, sweep: 0.18, gain: 0.045, attack: 0.05 });
    K.burst(d, t, { type: "bandpass", f: 1200, f1: 1800, q: 5, dur: 0.15, gain: 0.09, attack: 0.05 });
    return;
  }
  // (+~9 dB vs. the first mix: the most frequent action sound must sit above the song)
  const P = { hand: [800, 1500, 0.11, 0.22], blade: [1300, 4200, 0.17, 0.26], tool: [700, 2000, 0.18, 0.25], heavy: [380, 1100, 0.22, 0.28] }[k] || [700, 2000, 0.18, 0.24];
  K.burst(d, t, { type: "bandpass", f: P[0] * p, f1: P[1] * p, q: 1.6, dur: P[2], gain: P[3], attack: P[2] * 0.45 });
  if (k === "blade") K.burst(d, t + 0.04, { type: "highpass", f: 6000, dur: 0.06, gain: 0.07, attack: 0.03 });
});

// --- animals -------------------------------------------------------------------------------------------
def("thud", 0.3, 0.04, 1, 3, (K, d, t, o) => { // a hit on an animal: soft padded thump
  const p = (o.pitch || 1) * K.jit(0.06);
  K.tone(d, t, { f0: 150 * p, f1: 62 * p, dur: 0.13, sweep: 0.08, gain: 0.36 });
  K.burst(d, t, { color: "pink", f: 1600, f1: 400, dur: 0.08, gain: 0.2 });
  K.burst(d, t, { type: "bandpass", f: 1100 * p, q: 1.2, dur: 0.04, gain: 0.12 });
  K.send(d, 0.06);
});
def("squeak", 0.3, 0.15, 0, 0, (K, d, t, o) => { // rabbit
  const p = (o.pitch || 1) * K.jit(0.08);
  K.tone(d, t, { f0: 2100 * p, f1: 2900 * p, dur: 0.07, sweep: 0.04, gain: 0.05, vib: 120, vibRate: 40 });
  K.tone(d, t + 0.09, { f0: 2500 * p, f1: 2000 * p, dur: 0.06, gain: 0.04 });
  K.send(d, 0.1);
});
def("cluck", 0.45, 0.15, 0, 0, (K, d, t, o) => { // pheasant: "kok-kok-krr"
  const p = (o.pitch || 1) * K.jit(0.06);
  for (let i = 0; i < 2; i++) K.voice(d, t + i * 0.12, { pts: [[0, 520 * p], [0.05, 430 * p]], dur: 0.07, gain: 0.12, formants: [[900, 4, 0.9], [1900, 6, 0.5]], attack: 0.004, release: 0.04 });
  K.voice(d, t + 0.26, { pts: [[0, 600 * p], [0.15, 480 * p]], dur: 0.16, gain: 0.08, formants: [[1100, 4, 0.8], [2400, 5, 0.4]], am: 45, amDepth: 0.9, attack: 0.005, release: 0.08 });
  K.send(d, 0.12);
});
def("bleat_deer", 0.7, 0.2, 0, 0, (K, d, t, o) => { // soft breathy "mew"
  const p = (o.pitch || 1) * K.jit(0.05);
  K.voice(d, t, { pts: [[0, 560 * p], [0.12, 640 * p], [0.45, 470 * p]], dur: 0.5, gain: 0.09, formants: [[750, 5, 0.9], [1300, 6, 0.5], [2600, 6, 0.25]], vib: 12, vibRate: 8, attack: 0.04, release: 0.2, breath: 0.012 });
  K.send(d, 0.2);
});
def("bleat_goat", 0.8, 0.2, 0, 0, (K, d, t, o) => { // nasal "meh-eh-eh"
  const p = (o.pitch || 1) * K.jit(0.05);
  K.voice(d, t, { pts: [[0, 380 * p], [0.1, 420 * p], [0.6, 360 * p]], dur: 0.62, gain: 0.1, formants: [[620, 5, 0.9], [1800, 7, 0.6], [2600, 8, 0.3]], vib: 28, vibRate: 13, attack: 0.03, release: 0.2 });
  K.send(d, 0.18);
});
def("grunt", 0.5, 0.15, 0, 0, (K, d, t, o) => { // boar: two rough snorty grunts
  const p = (o.pitch || 1) * K.jit(0.06);
  for (let i = 0; i < 2; i++) {
    K.voice(d, t + i * 0.19, { pts: [[0, 105 * p], [0.12, 82 * p]], dur: 0.14, gain: 0.26, formants: [[420, 3, 1], [900, 4, 0.5]], am: 32, amDepth: 0.9, attack: 0.01, release: 0.06 });
    K.burst(d, t + i * 0.19, { type: "bandpass", f: 1400, q: 1.5, dur: 0.08, gain: 0.05 }); // snort
  }
  K.send(d, 0.1);
});
def("howl", 3.2, 1.2, 1, 0, (K, d, t, o) => { // wolf: rising "ooo-woooo", optional second wolf a fifth up
  const p = (o.pitch || 1) * K.jit(0.04);
  const howl = (at, k, g) => K.voice(d, at, { wave: "triangle", pts: [[0, 360 * k], [0.45, 600 * k], [1.4, 590 * k], [2.2, 430 * k]], dur: 2.3, gain: g, formants: [[700, 3, 1], [1250, 5, 0.4]], vib: 10, vibRate: 5, attack: 0.25, release: 0.7, breath: 0.008 });
  howl(t, p, 0.13);
  if (o.pack) howl(t + 0.6, p * 1.5, 0.07);
  K.send(d, 0.55);
});
def("growl", 1.2, 0.4, 0, 0, (K, d, t, o) => { // bear idle: low rumbling growl
  const p = (o.pitch || 1) * K.jit(0.05);
  K.voice(d, t, { pts: [[0, 72 * p], [0.4, 80 * p], [0.9, 66 * p]], dur: 1.0, gain: 0.3, formants: [[380, 2.5, 1], [800, 3, 0.5]], am: 38, amDepth: 0.95, attack: 0.12, release: 0.35 });
  K.burst(d, t, { color: "brown", f: 400, dur: 0.9, gain: 0.08, attack: 0.15 });
  K.send(d, 0.15);
});
def("roar", 1.8, 0.8, 2, 0, (K, d, t, o) => { // bear: big roar (rearing up)
  const p = (o.pitch || 1) * K.jit(0.04);
  K.voice(d, t, { pts: [[0, 95 * p], [0.25, 175 * p], [0.9, 150 * p], [1.4, 90 * p]], dur: 1.45, gain: 0.3, formants: [[520, 2.2, 1], [1150, 3, 0.65], [2300, 4, 0.25]], am: 34, amDepth: 0.7, attack: 0.1, release: 0.45 });
  K.voice(d, t, { wave: "square", pts: [[0, 48 * p], [0.3, 86 * p], [1.4, 46 * p]], dur: 1.45, gain: 0.08, lp: 400, attack: 0.12, release: 0.5 });
  K.burst(d, t, { type: "bandpass", f: 900, f1: 600, q: 0.9, dur: 1.2, gain: 0.08, attack: 0.15 });
  K.send(d, 0.35);
});
def("snarl", 0.7, 0.3, 1, 0, (K, d, t, o) => { // wolf crouch telegraph
  const p = (o.pitch || 1) * K.jit(0.05);
  K.voice(d, t, { pts: [[0, 170 * p], [0.5, 150 * p]], dur: 0.6, gain: 0.16, formants: [[900, 3, 1], [1700, 4, 0.5]], am: 52, amDepth: 1, attack: 0.05, release: 0.2 });
  K.send(d, 0.1);
});
def("paw", 0.8, 0.3, 1, 0, (K, d, t, o) => { // boar paws the ground: snort + 3 scrapes
  const p = (o.pitch || 1);
  K.voice(d, t, { pts: [[0, 120 * p], [0.1, 95 * p]], dur: 0.12, gain: 0.2, formants: [[450, 3, 1]], am: 30, amDepth: 0.8, attack: 0.008, release: 0.05 });
  for (let i = 0; i < 3; i++) K.burst(d, t + 0.18 + i * 0.17, { type: "bandpass", f: 1300, f1: 700, q: 1.3, dur: 0.11, gain: 0.12, attack: 0.02 });
  K.send(d, 0.08);
});
def("bite", 0.3, 0.12, 1, 0, (K, d, t, o) => { // wolf snap / generic attack
  K.burst(d, t, { type: "highpass", f: 2500, dur: 0.02, gain: 0.1 });
  K.burst(d, t + 0.05, { type: "highpass", f: 2200, dur: 0.025, gain: 0.08 });
  K.tone(d, t, { f0: 330 * (o.pitch || 1), f1: 200, dur: 0.06, gain: 0.1 });
});
def("ram", 0.4, 0.12, 1, 0, (K, d, t, o) => { // boar / goat butt / bear swipe
  const big = o.big ? 1.4 : 1;
  K.burst(d, t, { type: "bandpass", f: 700, f1: 1600, q: 1, dur: 0.08, gain: 0.08, attack: 0.04 });
  K.tone(d, t + 0.06, { f0: 120 / big, f1: 52, dur: 0.18, gain: 0.34 });
  K.burst(d, t + 0.06, { color: "pink", f: 1200, f1: 300, dur: 0.12, gain: 0.2 });
});
def("fish_splash", 0.5, 0.2, 0, 0, (K, d, t) => {
  K.burst(d, t, { type: "bandpass", f: 1900, f1: 700, q: 0.9, dur: 0.22, gain: 0.1, attack: 0.008 });
  for (let i = 0; i < 3; i++) { const f = 700 + Math.random() * 700; K.tone(d, t + 0.04 + Math.random() * 0.2, { f0: f, f1: f * 1.7, dur: 0.04, gain: 0.025 }); }
  K.send(d, 0.15);
});
// the animal vanishes in a friendly puff of dust and leaves (no gore): soft poof + sparkles
def("puff", 0.9, 0.08, 1, 0, (K, d, t) => {
  K.burst(d, t, { type: "bandpass", f: 500, f1: 2400, q: 0.7, dur: 0.32, gain: 0.16, attack: 0.03 });
  K.burst(d, t, { color: "pink", f: 600, f1: 200, dur: 0.18, gain: 0.1 });
  rustle(K, d, t + 0.05, 0.3, 0.035);
  chimes(K, d, t + 0.08, [91, 96, 100], 0.05, 0.03, 0.45);
  K.send(d, 0.3);
});

// --- the player ------------------------------------------------------------------------------------------
def("hurt", 0.4, 0.1, 2, 0, (K, d, t, o) => { // cube "oof": thump + a quick falling squeak (bigger for more damage)
  const k = clamp((o.dmg || 6) / 15, 0.35, 1);
  K.tone(d, t, { f0: 150, f1: 60, dur: 0.14, gain: 0.3 * k + 0.1 });
  K.burst(d, t, { color: "pink", f: 1800, f1: 400, dur: 0.09, gain: 0.16 });
  K.tone(d, t + 0.015, { type: "triangle", f0: 620, f1: 340, dur: 0.14, sweep: 0.12, gain: 0.12 });
  K.send(d, 0.08);
});
def("faint", 1.8, 0.5, 2, 0, (K, d, t) => { // gentle: woozy descending notes, a soft flop, no harsh sounds
  K.tone(d, t, { type: "triangle", f0: 660, f1: 220, dur: 0.9, sweep: 0.85, gain: 0.12, vib: 22, vibRate: 7 });
  chimes(K, d, t + 0.1, [79, 76, 72, 67], 0.16, 0.06, 0.8);
  K.tone(d, t + 0.75, { f0: 110, f1: 50, dur: 0.25, gain: 0.25 });
  K.burst(d, t + 0.75, { color: "pink", f: 900, f1: 200, dur: 0.25, gain: 0.12 });
  K.send(d, 0.4);
});
def("respawn", 1.4, 0.5, 2, 0, (K, d, t) => {
  chimes(K, d, t, [74, 78, 81, 86, 90], 0.07, 0.05, 0.7);
  K.burst(d, t, { type: "highpass", f: 6000, dur: 0.5, gain: 0.02, attack: 0.1 });
  K.send(d, 0.45);
});
def("jump", 0.15, 0.06, 0, 3, (K, d, t, o) => {
  const p = (o.pitch || 1) * K.jit(0.04);
  K.tone(d, t, { type: "triangle", f0: 300 * p, f1: 540 * p, dur: 0.1, sweep: 0.07, gain: 0.16 });
  K.burst(d, t, { type: "bandpass", f: 1700, f1: 3500, q: 1.2, dur: 0.07, gain: 0.05 });
});
def("land", 0.25, 0.06, 0, 0, (K, d, t, o) => {
  const k = clamp((o.impact || 6) / 12, 0.2, 1);
  K.tone(d, t, { f0: 120, f1: 48, dur: 0.1 + 0.08 * k, gain: 0.32 * k });
  K.burst(d, t, { color: "pink", f: 600 + 500 * k, f1: 250, dur: 0.07 + 0.06 * k, gain: 0.16 * k });
  K.burst(d, t + 0.008, { type: "bandpass", f: 3200, q: 0.7, dur: 0.1, gain: 0.04 * k });
});
def("bonk", 0.15, 0.08, 0, 0, (K, d, t) => {
  K.tone(d, t, { f0: 430, f1: 300, dur: 0.08, gain: 0.16 });
  K.burst(d, t, { type: "bandpass", f: 1300, q: 3, dur: 0.04, gain: 0.1 });
});
def("splash", 0.6, 0.15, 1, 0, (K, d, t, o) => {
  const k = clamp((o.vy || 6) / 10, 0.35, 1);
  K.burst(d, t, { type: "bandpass", f: 1800, f1: 500, q: 0.8, dur: 0.42, gain: 0.24 * k, attack: 0.01 });
  K.burst(d, t, { type: "highpass", f: 5000, dur: 0.18, gain: 0.05 * k });
  for (let i = 0; i < 4; i++) { const f = 500 + Math.random() * 800; K.tone(d, t + 0.05 + Math.random() * 0.3, { f0: f, f1: f * 1.8, dur: 0.05, gain: 0.035 }); }
  K.send(d, 0.15);
});
def("unsplash", 0.5, 0.15, 0, 0, (K, d, t) => { // climbing out: drips
  K.burst(d, t, { type: "bandpass", f: 1400, f1: 2400, q: 1, dur: 0.12, gain: 0.07 });
  for (let i = 0; i < 4; i++) { const f = 900 + Math.random() * 900; K.tone(d, t + 0.08 + i * 0.07 + Math.random() * 0.04, { f0: f, f1: f * 1.6, dur: 0.035, gain: 0.03 }); }
});
def("swim", 0.4, 0.2, 0, 0, (K, d, t) => {
  K.burst(d, t, { type: "bandpass", f: 900, f1: 1600, q: 1.1, dur: 0.25, gain: 0.08, attack: 0.06 });
  K.tone(d, t + 0.1, { f0: 650, f1: 1100, dur: 0.05, gain: 0.02 });
});

// --- items -----------------------------------------------------------------------------------------------
// pickup pop: o.pitch rises with a pickup streak, o.rare adds a sparkle
def("pickup", 0.35, 0.03, 0, 4, (K, d, t, o) => {
  const p = (o.pitch || 1) * K.jit(0.02);
  K.tone(d, t, { f0: 620 * p, f1: 1240 * p, dur: 0.07, sweep: 0.04, gain: 0.13 });
  K.bell(d, t + 0.025, 1568 * p, { dur: 0.22, gain: 0.04, ratio: 2, index: 0.6 });
  if (o.rare) chimes(K, d, t + 0.05, [96, 100, 103], 0.045, 0.025, 0.5);
  K.send(d, 0.15);
});
def("harvest", 0.4, 0.08, 0, 0, (K, d, t) => {
  rustle(K, d, t, 0.22, 0.08);
  K.tone(d, t + 0.06, { f0: 900, f1: 1500, dur: 0.05, gain: 0.07 }); // a little pop off the stem
});
def("rustle", 0.35, 0.06, 0, 0, (K, d, t) => rustle(K, d, t, 0.25, 0.09));
def("boulder", 0.3, 0.05, 1, 0, (K, d, t) => {
  K.burst(d, t, { type: "bandpass", f: 2400, q: 4, dur: 0.03, gain: 0.2 });
  K.burst(d, t, { color: "pink", f: 1100, f1: 400, dur: 0.1, gain: 0.2 });
  K.tone(d, t, { f0: 160, f1: 80, dur: 0.08, gain: 0.16 });
});
def("place_wood", 0.2, 0.05, 1, 0, (K, d, t) => { knock(K, d, t, 260 * K.jit(0.04), 0.28); K.send(d, 0.06); });
def("place_stone", 0.25, 0.05, 1, 0, (K, d, t) => {
  K.tone(d, t, { f0: 200, f1: 110, dur: 0.08, gain: 0.25 });
  K.burst(d, t, { type: "bandpass", f: 2200 * K.jit(0.1), q: 3, dur: 0.035, gain: 0.2 });
  pebbles(K, d, t + 0.02, 2, 0.06, 0.04);
});
def("place_soft", 0.2, 0.05, 1, 0, (K, d, t) => { K.burst(d, t, { color: "pink", f: 900, f1: 300, dur: 0.12, gain: 0.6 }); K.tone(d, t, { f0: 150, f1: 90, dur: 0.07, gain: 0.18 }); });
def("ignite", 0.8, 0.2, 1, 0, (K, d, t) => { // torch / campfire / lantern lighting: whoomp + crackles
  K.burst(d, t, { color: "pink", f: 300, f1: 1400, q: 0.8, dur: 0.35, gain: 0.18, attack: 0.08 });
  pebbles(K, d, t + 0.2, 6, 0.5, 0.05, 2500, 6000);
  K.send(d, 0.1);
});
def("eat", 0.75, 0.25, 1, 0, (K, d, t, o) => { // munch munch munch + gulp (+ a tiny yum chime for cooked food)
  for (let i = 0; i < 3; i++) {
    const tt = t + i * 0.14 + Math.random() * 0.02;
    K.burst(d, tt, { type: "bandpass", f: (o.raw ? 1300 : 2200) * K.jit(0.15), q: 1.6, dur: 0.06, gain: 0.16 });
    K.burst(d, tt, { color: "pink", f: 600, f1: 250, dur: 0.05, gain: 0.12 });
  }
  K.tone(d, t + 0.46, { f0: 320, f1: 170, dur: 0.09, sweep: 0.07, gain: 0.12 });
  if (!o.raw) chimes(K, d, t + 0.55, [84, 88], 0.06, 0.03, 0.4);
  K.send(d, 0.06);
});
def("tool_break", 0.8, 0.3, 2, 0, (K, d, t) => {
  K.burst(d, t, { type: "highpass", f: 1800, dur: 0.06, gain: 0.3 });
  K.ring(d, t + 0.02, [[1400, 0.05, 0.2], [2210, 0.03, 0.15]]);
  K.tone(d, t + 0.3, { f0: 180, f1: 120, dur: 0.1, gain: 0.12 }); // the head hits the ground
  K.tone(d, t + 0.18, { type: "triangle", f0: 523, dur: 0.15, gain: 0.06 });
  K.tone(d, t + 0.34, { type: "triangle", f0: 392, dur: 0.3, gain: 0.06 });
  K.send(d, 0.1);
});
def("shoot", 0.45, 0.1, 1, 0, (K, d, t) => { // bow twang + arrow whoosh
  K.tone(d, t, { type: "sawtooth", f0: 240, f1: 190, dur: 0.18, gain: 0.07, vib: 12, vibRate: 30 });
  K.tone(d, t, { f0: 120, f1: 95, dur: 0.12, gain: 0.12 });
  K.burst(d, t + 0.02, { type: "bandpass", f: 2600, f1: 1400, q: 1.5, dur: 0.22, gain: 0.08, attack: 0.02 });
});

// --- crafting stations -----------------------------------------------------------------------------------
const done = (K, d, t) => chimes(K, d, t, [88, 93], 0.07, 0.03, 0.5);
def("craft_hand", 0.6, 0.15, 1, 0, (K, d, t) => {
  rustle(K, d, t, 0.12, 0.06); rustle(K, d, t + 0.14, 0.12, 0.05);
  knock(K, d, t + 0.28, 520, 0.1); done(K, d, t + 0.36); K.send(d, 0.15);
});
def("craft_bench", 0.8, 0.15, 1, 0, (K, d, t) => { // hammer taps on wood
  for (let i = 0; i < 3; i++) knock(K, d, t + i * 0.12, (i === 2 ? 240 : 300) * K.jit(0.03), i === 2 ? 0.3 : 0.22);
  done(K, d, t + 0.42); K.send(d, 0.15);
});
def("craft_fire", 1.0, 0.2, 1, 0, (K, d, t) => { // campfire / smoker: sizzle + pops
  K.burst(d, t, { type: "highpass", f: 3800, dur: 0.6, gain: 0.07, attack: 0.04, hold: 0.15 });
  pebbles(K, d, t + 0.05, 7, 0.65, 0.06, 2500, 6000);
  K.burst(d, t, { color: "pink", f: 500, dur: 0.5, gain: 0.05, attack: 0.08 });
  done(K, d, t + 0.6); K.send(d, 0.15);
});
def("craft_furnace", 1.3, 0.25, 1, 0, (K, d, t) => { // roar of the bellows + a clink of the ingot
  K.burst(d, t, { color: "brown", f: 180, f1: 600, dur: 0.8, gain: 0.3, attack: 0.25 });
  K.burst(d, t, { color: "pink", f: 600, f1: 1200, q: 0.7, dur: 0.6, gain: 0.08, attack: 0.25 });
  K.ring(d, t + 0.75, [[1950, 0.06, 0.3], [3100, 0.03, 0.2]]);
  done(K, d, t + 0.85); K.send(d, 0.2);
});
def("craft_anvil", 1.6, 0.25, 1, 0, (K, d, t) => { // clang, clang
  for (let i = 0; i < 2; i++) {
    const tt = t + i * 0.3, g = i ? 0.9 : 0.75;
    K.burst(d, tt, { type: "bandpass", f: 3000, q: 4, dur: 0.02, gain: 0.25 * g });
    K.ring(d, tt, [[530, 0.08 * g, 0.9], [1290, 0.07 * g, 0.7], [2140, 0.05 * g, 0.55], [3370, 0.03 * g, 0.4]]);
  }
  done(K, d, t + 0.75); K.send(d, 0.25);
});
def("craft_kitchen", 1.1, 0.2, 1, 0, (K, d, t) => { // pot clink + bubbling
  K.ring(d, t, [[880, 0.05, 0.3], [1980, 0.03, 0.2]]);
  for (let i = 0; i < 7; i++) { const f = 250 + Math.random() * 350; K.tone(d, t + 0.12 + i * 0.07 + Math.random() * 0.03, { f0: f, f1: f * 1.9, dur: 0.05, gain: 0.05 }); }
  done(K, d, t + 0.7); K.send(d, 0.15);
});

// --- house + home ----------------------------------------------------------------------------------------
// fanfare for a house level. o.level 1..20: every level celebrates; 5/10/15 are bigger; 20 = house complete.
function fanfare(K, d, t, size) {
  // D major. size 0 = short, 1 = big, 2 = grand
  const D = [62, 66, 69, 74], g = 0.07 + 0.015 * size;
  // pickup "ta-ta-taaa"
  K.brass(d, t, NOTE(69), { dur: 0.1, gain: g * 0.8 });
  K.brass(d, t + 0.14, NOTE(69), { dur: 0.1, gain: g * 0.8 });
  const t1 = t + 0.28;
  if (size === 0) {
    for (const m of D) K.brass(d, t1, NOTE(m), { dur: 0.7, gain: g * 0.7 });
    chimes(K, d, t1, [86, 90, 93, 98], 0.06, 0.05, 0.9);
    K.tone(d, t1, { f0: 90, f1: 55, dur: 0.4, gain: 0.25 }); // timpani
    return 1.4;
  }
  // big: a phrase I - IV - V - I
  const phrase = size === 2 ? [[[62, 66, 69], 0.32], [[67, 71, 74], 0.32], [[69, 73, 76], 0.32], [[62, 66, 69, 74, 78], 1.4]] : [[[67, 71, 74], 0.3], [[69, 73, 76], 0.3], [[62, 66, 69, 74], 1.0]];
  let tt = t1;
  phrase.forEach(([ch, len], i) => {
    for (const m of ch) K.brass(d, tt, NOTE(m), { dur: len * 0.92, gain: g * (0.55 + 0.1 * i / phrase.length) * (ch.length > 3 ? 0.85 : 1), bright: 1 + 0.2 * i });
    K.tone(d, tt, { f0: i === phrase.length - 1 ? 74 : 98, f1: 50, dur: 0.35, gain: 0.22 }); // timpani hits
    tt += len;
  });
  const last = tt - phrase[phrase.length - 1][1];
  K.burst(d, last, { type: "highpass", f: 5000, dur: 1.4, gain: 0.05 + 0.02 * size, attack: 0.01 }); // cymbal
  chimes(K, d, last, size === 2 ? [86, 90, 93, 98, 102, 105] : [86, 90, 93, 98], 0.07, 0.045, 1.2);
  if (size === 2) { // a drum roll into the final chord and a shimmering tail
    for (let i = 0; i < 10; i++) K.tone(d, last - 0.32 + i * 0.032, { f0: 110, f1: 70, dur: 0.06, gain: 0.05 + i * 0.008 });
    chimes(K, d, last + 0.6, [98, 102, 105, 110], 0.09, 0.03, 1.4);
  }
  return tt - t + 0.5;
}
def("upgrade", 2.0, 0.5, 2, 0, (K, d, t) => { fanfare(K, d, t, 0); K.send(d, 0.35); });
def("upgrade_big", 3.0, 0.5, 2, 0, (K, d, t) => { fanfare(K, d, t, 1); K.send(d, 0.4); });
def("house_complete", 4.6, 1, 2, 0, (K, d, t) => { fanfare(K, d, t, 2); K.send(d, 0.45); });
def("lullaby", 3.6, 2, 2, 0, (K, d, t) => { // a few music-box notes as you tuck in
  const mel = [[79, 0], [76, 0.4], [74, 0.8], [71, 1.2], [74, 1.8], [67, 2.3]];
  for (const [m, at] of mel) K.bell(d, t + at, NOTE(m), { dur: 1.2, gain: 0.07, ratio: 3, index: 1.1 });
  K.tone(d, t, { type: "triangle", f0: NOTE(55), dur: 3, gain: 0.05, attack: 0.5 });
  K.send(d, 0.5);
});
def("rooster", 1.8, 2, 2, 0, (K, d, t) => { // cock-a-doodle-doo, a little distant
  const segs = [[0, 0.1, 620, 640], [0.14, 0.1, 760, 780], [0.28, 0.12, 760, 800], [0.46, 0.75, 900, 640]];
  for (const [at, du, f0, f1] of segs) K.voice(d, t + at, { pts: [[0, f0], [du * 0.3, f0 * 1.04], [du, f1]], dur: du, gain: 0.08, formants: [[1100, 4, 1], [2300, 5, 0.5], [3300, 6, 0.2]], vib: 25, vibRate: 18, am: 60, amDepth: 0.35, attack: 0.012, release: Math.min(0.2, du * 0.4) });
  K.send(d, 0.5);
});
def("garden", 1.2, 1, 1, 0, (K, d, t) => {
  rustle(K, d, t, 0.3, 0.05);
  chimes(K, d, t + 0.05, [79, 83, 86, 91], 0.09, 0.05, 0.8);
  K.send(d, 0.4);
});
def("ui", 0.08, 0.05, 0, 0, (K, d, t) => K.tone(d, t, { f0: 1400, f1: 1050, dur: 0.03, gain: 0.07 }));

export const SOUNDS = S;
export const SOUND_NAMES = Object.keys(S);
