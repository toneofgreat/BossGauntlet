// compose-b.mjs - MUSIC_B's composer: builds the 5 builder songs (campfire, rapids, aurora, thunderdrum, moonlit)
// and writes them as PURE DATA into src/audio/songs/<id>.js (CONTRACT.md section 6.2). The output files have no
// imports and no functions; this script is only the authoring tool.  Run:  node tools/compose-b.mjs [ids...]
// Deterministic (seeded humanize), so re-running produces identical files.
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { noteToMidi, validateSong } from "../src/audio/format.js";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "audio", "songs");
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const nm = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);
const M = (p) => (typeof p === "number" ? p : noteToMidi(p));
const r3 = (x) => Math.round(x * 1000) / 1000;
const clampV = (v) => Math.max(0.05, Math.min(1, r3(v)));
let seed = 1;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const hv = (v, amt) => clampV(v + (rnd() * 2 - 1) * amt);
const tr = (p, s) => nm(M(p) + s);

// ---------- authoring helpers ----------
// seq("E5:4 r:2 D3+A3:3:0.6 | ...") : tokens pitch:dur[:vel], r = rest, + = chord; "|" separates bars (checked).
function seq(spb, str, { vel = 0.8, legato = 1, hum = 0.03, start = 0, shift = 0 } = {}) {
  const notes = [];
  let t = start;
  str.split("|").forEach((bar, bi) => {
    let bt = 0;
    for (const tok of bar.trim().split(/\s+/).filter(Boolean)) {
      const [p, d, v] = tok.split(":");
      const dur = parseFloat(d);
      if (!(dur > 0)) throw new Error("bad token " + tok);
      if (p !== "r") {
        const pitch = p.includes("+") ? p.split("+").map((q) => nm(M(q) + shift)) : nm(M(p) + shift);
        notes.push([r3(t), pitch, r3(Math.max(0.25, dur * legato)), hv(v ? +v : vel, hum)]);
      }
      t += dur; bt += dur;
    }
    if (Math.abs(bt - spb) > 1e-6) throw new Error(`bar ${bi} has ${bt}/${spb} steps in "${str.slice(0, 60)}..."`);
  });
  return notes;
}
// grid("x.o-|...") : one char per step. x=0.9 X=1 o=0.6 -=0.35 ,=0.2 . = rest
const GV = { X: 1, x: 0.88, o: 0.62, "-": 0.38, ",": 0.22 };
function grid(str, { pitch = 0, hum = 0.05, scale = 1, dur = 1 } = {}) {
  const s = str.replace(/[\s|]/g, "");
  const out = [];
  [...s].forEach((c, i) => { if (GV[c]) out.push([i, typeof pitch === "number" ? pitch : pitch, dur, hv(GV[c] * scale, hum)]); });
  return { notes: out, len: s.length };
}
function P(inst, bars, notes, spb) {
  for (const n of notes) if (n[0] >= bars * spb) throw new Error(`pattern for ${inst}: note at ${n[0]} beyond ${bars} bars`);
  return { inst, bars, notes };
}
function G(inst, str, spb, o) { const g = grid(str, o); if (g.len % spb) throw new Error(`grid for ${inst} is ${g.len} steps`); return P(inst, g.len / spb, g.notes, spb); }
// scatter n hits per bar at random 8th/16th positions (crackles, fireflies, crickets)
function scatter(spb, bars, perBar, pitches, { vel = [0.3, 0.8], dur = 1, grid: gq = 1, burst = 0 } = {}) {
  const out = [];
  for (let b = 0; b < bars; b++) {
    const used = new Set();
    for (let k = 0; k < perBar; k++) {
      let st = Math.floor(rnd() * (spb / gq)) * gq;
      if (used.has(st)) continue; used.add(st);
      const p = pitches[Math.floor(rnd() * pitches.length)];
      const v = clampV(vel[0] + rnd() * (vel[1] - vel[0]));
      out.push([b * spb + st, typeof p === "number" ? p : nm(M(p)), dur, v]);
      for (let j = 1; j <= burst; j++) if (st + j * 0.5 < spb) out.push([r3(b * spb + st + j * 0.5), typeof p === "number" ? p : nm(M(p)), dur, clampV(v * (1 - j * 0.15))]);
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}
// chords: list of {at (bar index, fractional ok), len (steps), v: [voicing]} -> sustained chord notes
function held(spb, chords, { vel = 0.6, hum = 0.02 } = {}) {
  return chords.map((c) => [r3(c.at * spb), c.v.map((q) => nm(M(q))), c.len, hv(c.vel ?? vel, hum)]);
}
const bars = (...a) => a.join(" | ");
const rep = (s, n) => Array(n).fill(s).join("|");

const SONGS = {};

// =====================================================================================================
// 1. CAMPFIRE TALES - G major, 84 bpm, lazy swing. Fingerpicked guitar, mandolin, tin whistle, harmonium,
//    upright bass, congas, shaker, woodblock, and a crackling fire.
// =====================================================================================================
SONGS.campfire = () => {
  seed = 11;
  const spb = 16;
  const C = {
    G: { r: "G2", f: "D3", v: ["G3", "B3", "D4", "G4"] },
    DF: { r: "F#2", f: "A2", v: ["F#3", "A3", "D4", "F#4"] },
    Em: { r: "E2", f: "B2", v: ["E3", "G3", "B3", "E4"] },
    C: { r: "C2", f: "G2", v: ["C3", "G3", "C4", "E4"] },
    D: { r: "D2", f: "A2", v: ["D3", "A3", "D4", "F#4"] },
    Am: { r: "A2", f: "E2", v: ["A3", "C4", "E4", "A4"] },
    Bm: { r: "B2", f: "F#2", v: ["F#3", "B3", "D4", "F#4"] },
  };
  // a bar is one chord name or "X/Y" (half bar each)
  const progA = ["G", "DF", "Em", "C", "G", "D", "C/D", "G"];
  const progB = ["Em", "C", "G", "D", "Em", "C", "Am/D", "G"];
  const progBr = ["Am", "Bm", "C", "D"];
  const progIn = ["G", "C", "G", "D"];
  const halves = (prog) => prog.flatMap((b) => (b.includes("/") ? b.split("/") : [b, b]));
  // travis-style fingerpicking: thumb on 0/8, fingers between
  const pick = (prog, scale = 1) => {
    const out = [], order = [0, 3, 1, 2, 0, 3, 1, 2], vv = [0.62, 0.42, 0.5, 0.4, 0.56, 0.44, 0.48, 0.4];
    halves(prog).forEach((ch, h) => { for (let i = 0; i < 4; i++) { const k = (h % 2) * 4 + i; out.push([h * 8 + i * 2, C[ch].v[order[k]], 3, hv(vv[k] * scale, 0.05)]); } });
    return out;
  };
  // strummed chords (bridge): down-strums with a little spread across strings
  const strum = (prog) => {
    const out = [];
    prog.forEach((ch, b) => {
      for (const [st, vel, up] of [[0, 0.62, 0], [6, 0.42, 1], [8, 0.5, 0], [12, 0.4, 1], [14, 0.36, 0]]) {
        const v = up ? [...C[ch].v].reverse() : C[ch].v;
        v.forEach((q, i) => out.push([r3(b * 16 + st + i * 0.14), q, 4, hv(vel * (1 - i * 0.06), 0.04)]));
      }
    });
    return out;
  };
  const GMAJ = [7, 9, 11, 0, 2, 4, 6];   // pitch classes of G major (bass approach notes stay in key)
  const below = (m) => { let x = m - 1; while (!GMAJ.includes(x % 12)) x--; return x; };
  const bassLine = (prog) => {
    const out = [];
    halves(prog).forEach((ch, h) => {
      const c = C[ch];
      if (h % 2 === 0) out.push([h * 8, c.r, 6, hv(0.82, 0.04)]);
      else out.push([h * 8, prog[h >> 1].includes("/") ? c.r : c.f, 5, hv(0.66, 0.04)]);
    });
    // walking pickup into each next bar on the last 8th
    for (let b = 0; b < prog.length; b++) {
      const next = C[halves(prog)[((b + 1) % prog.length) * 2]];
      out.push([b * 16 + 14, nm(below(M(next.r))), 2, hv(0.5, 0.04)]);
    }
    return out.sort((a, b) => a[0] - b[0]);
  };
  const harmonium = (prog, vel) => halves(prog).map((ch, h) => [h * 8, C[ch].v.slice(1).map((q) => nm(M(q))), 7.8, hv(vel, 0.02)]);
  const chop = (prog) => {   // mandolin off-beat chops on the top two strings, an octave up
    const out = [];
    halves(prog).forEach((ch, h) => { for (const st of [2, 6]) out.push([h * 8 + st, tr(C[ch].v[st === 2 ? 3 : 2], 12), 1, hv(0.34, 0.05)]); });
    return out;
  };
  const melA = bars(
    "D5:3 B4:1 D5:2 E5:2 D5:4 B4:4", "A4:3 B4:1 A4:2 F#4:2 D4:8", "E4:2 G4:2 B4:4 A4:2 G4:2 E4:4", "G4:3 E4:1 G4:2 A4:2 G4:8",
    "D5:3 B4:1 D5:2 E5:2 G5:4 E5:4", "F#5:3 E5:1 D5:2 B4:2 A4:8", "G4:2 A4:2 B4:2 C5:2 D5:2 E5:2 F#5:4", "G5:12 r:4");
  const melB = bars(
    "B4:4 E5:6 D5:2 B4:4", "C5:4 E5:4 G5:6 E5:2", "D5:8 B4:4 G4:4", "A4:4 D5:4 F#5:8",
    "G5:4 F#5:2 E5:2 B4:8", "C5:4 D5:2 E5:2 G5:8", "A5:4 G5:2 E5:2 F#5:4 D5:4", "G5:12 r:4");
  const melBr = bars("E5:6 D5:2 C5:4 A4:4", "D5:6 C5:2 B4:4 F#4:4", "E4:4 G4:4 C5:4 E5:4", "F#5:4 E5:4 D5:4 A4:4");
  const crackleNotes = scatter(spb, 4, 6, [0], { vel: [0.25, 0.9], dur: 1, grid: 0.5 });
  return {
    id: "campfire", title: "Campfire Tales", mood: "warm, cozy, relaxed; fingerpicked guitar, mandolin and tin whistle around a crackling fire",
    bpm: 84, stepsPerBar: spb, swing: 0.18,
    master: { gain: 0.95, reverb: { seconds: 2.2, mix: 0.22 }, delay: { steps: 3, feedback: 0.28, tone: 2800 } },
    instruments: {
      guitar: { type: "pluck", wave: "sawtooth", tone: 2400, decay: 0.72, gain: 0.55, pan: -0.22, reverb: 0.3 },
      mando: { type: "pluck", wave: "square", tone: 4200, decay: 0.38, gain: 0.45, pan: 0.28, reverb: 0.3, delay: 0.15 },
      whistle: { type: "synth", wave: "sine", env: { a: 0.035, d: 0.12, s: 0.85, r: 0.16 }, vibrato: { rate: 5.6, depth: 14, delay: 0.22 }, glide: 0.015, gain: 0.24, pan: 0.08, reverb: 0.4, delay: 0.18 },
      bass: { type: "synth", wave: "triangle", env: { a: 0.004, d: 0.32, s: 0.35, r: 0.12 }, filter: { type: "lowpass", freq: 900, q: 0.7, env: 600 }, gain: 0.42 },
      harmonium: { type: "synth", wave: "sawtooth", voices: 2, detune: 7, env: { a: 0.45, d: 0.5, s: 0.75, r: 0.9 }, filter: { type: "lowpass", freq: 1100, q: 0.5 }, gain: 0.08, reverb: 0.5 },
      conga: { type: "drum", kind: "conga", gain: 0.28, pan: -0.15, reverb: 0.2 },
      shaker: { type: "drum", kind: "shaker", gain: 0.35, pan: 0.32 },
      stomp: { type: "drum", kind: "kick", gain: 0.3, decay: 0.75 },
      block: { type: "drum", kind: "woodblock", gain: 0.3, pan: -0.38, reverb: 0.3 },
      crackle: { type: "noise", color: "white", filter: { type: "highpass", freq: 2600, q: 0.7 }, env: { a: 0.001, d: 0.02, s: 0, r: 0.03 }, gain: 0.22, pan: 0.12 },
      ember: { type: "noise", color: "brown", filter: { type: "lowpass", freq: 500, q: 0.5 }, env: { a: 1.5, d: 1, s: 0.8, r: 2 }, gain: 0.05 },
    },
    patterns: {
      gtrIntro: P("guitar", 4, pick(progIn, 0.85), spb),
      gtrA: P("guitar", 8, pick(progA), spb),
      gtrB: P("guitar", 8, pick(progB), spb),
      gtrBr: P("guitar", 4, strum(progBr), spb),
      bassA: P("bass", 8, bassLine(progA), spb),
      bassB: P("bass", 8, bassLine(progB), spb),
      bassBr: P("bass", 4, bassLine(progBr), spb),
      melA: P("mando", 8, seq(spb, melA, { vel: 0.72, hum: 0.05 }), spb),
      whA: P("whistle", 8, seq(spb, melA, { vel: 0.62, legato: 0.92 }), spb),
      whB: P("whistle", 8, seq(spb, melB, { vel: 0.66, legato: 0.94 }), spb),
      whBr: P("whistle", 4, seq(spb, melBr, { vel: 0.55, legato: 0.95 }), spb),
      chopA: P("mando", 8, chop(progA), spb),
      chopB: P("mando", 8, chop(progB), spb),
      harmIn: P("harmonium", 4, harmonium(progIn, 0.45), spb),
      harmA: P("harmonium", 8, harmonium(progA, 0.55), spb),
      harmB: P("harmonium", 8, harmonium(progB, 0.65), spb),
      harmBr: P("harmonium", 4, harmonium(progBr, 0.8), spb),
      congaLo: G("conga", "x.....x.....x...", spb, { pitch: "D4" }),
      congaHi: G("conga", "....o..-....o.o-", spb, { pitch: "G4" }),
      congaFill: G("conga", rep("................", 3) + "|x.o.x.o.xoxoXoXo", spb, { pitch: "A4" }),
      shaker: G("shaker", "o.-.o.-.o.-.o.--", spb),
      shakerSoft: G("shaker", "-...-...-...-.,,", spb),
      stomp: G("stomp", "x.......x.......", spb),
      block: G("block", "....o.......o...", spb, { pitch: "E5" }),
      crackle: P("crackle", 4, crackleNotes, spb),
      ember: P("ember", 4, [[0, "C3", 63, 0.7]], spb),
    },
    sections: {
      intro: { bars: 4, tracks: ["gtrIntro", "harmIn", "crackle", "ember"] },
      A: { bars: 8, tracks: ["gtrA", "bassA", "melA", "shakerSoft", "congaLo", "crackle", "ember"] },
      B: { bars: 8, tracks: ["gtrB", "bassB", "whB", "harmB", "chopB", "congaLo", "congaHi", "shaker", "stomp", "block"] },
      bridge: { bars: 4, tracks: ["gtrBr", "bassBr", "whBr", "harmBr", "shakerSoft", "congaFill", "crackle"] },
      A2: { bars: 8, tracks: ["gtrA", "bassA", "whA", { p: "melA", transpose: -12, vel: 0.55 }, "harmA", "chopA", "congaLo", "congaHi", "shaker", "stomp", "block"] },
    },
    arrangement: ["intro", "A", "B", "bridge", "A2"],
    loop: 1,
  };
};

// =====================================================================================================
// 2. RAPIDS RUN - B minor / D major, 140 bpm. Galloping bass, plucked 16th arpeggios, saw lead with glide,
//    FM bells, splash whooshes, driving drums.
// =====================================================================================================
SONGS.rapids = () => {
  seed = 22;
  const spb = 16;
  const CH = {
    Bm: { r: "B1", t: ["B3", "D4", "F#4", "B4", "D5"] }, G: { r: "G1", t: ["G3", "B3", "D4", "G4", "B4"] },
    D: { r: "D2", t: ["D4", "F#4", "A4", "D5", "F#5"] }, A: { r: "A1", t: ["A3", "C#4", "E4", "A4", "C#5"] },
    Em: { r: "E2", t: ["E4", "G4", "B4", "E5", "G5"] }, F$: { r: "F#2", t: ["F#3", "A#3", "C#4", "F#4", "A#4"] },
    F$m: { r: "F#2", t: ["F#3", "A3", "C#4", "F#4", "A4"] },
  };
  const verse = ["Bm", "G", "D", "A", "Bm", "G", "Em", "F$"];
  const chorus = ["D", "A", "Bm", "G", "D", "A", "G", "A"];
  const bridgeP = ["G", "A", "F$m", "Bm", "G", "A", "Em", "F$"];
  const tag = ["Bm", "G", "Em", "F$"];
  const intro = ["Bm", "Bm", "G", "A"];
  const arp = (prog, scale = 1) => {
    const order = [0, 2, 1, 3, 2, 4, 3, 1, 0, 2, 1, 3, 4, 3, 2, 1], out = [];
    prog.forEach((c, b) => order.forEach((o, i) => out.push([b * 16 + i, CH[c].t[o], 1, hv((i % 4 === 0 ? 0.7 : 0.48) * scale, 0.05)])));
    return out;
  };
  const gallop = (prog) => {
    const out = [];
    prog.forEach((c, b) => [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15].forEach((s) => {
      const up = s === 4 || s === 12 || s === 15;
      out.push([b * 16 + s, nm(M(CH[c].r) + (up ? 12 : 0)), s % 2 ? 0.8 : 1.4, hv(s % 4 === 0 ? 0.85 : 0.6, 0.04)]);
    }));
    return out;
  };
  const longBass = (prog) => prog.map((c, b) => [b * 16, CH[c].r, 14, 0.8]);
  const pads = (prog, vel) => prog.map((c, b) => [b * 16, CH[c].t.slice(0, 4).map((q) => tr(q, -12)), 15.5, hv(vel, 0.02)]);
  const mVerse = bars(
    "F#5:3 F#5:3 D5:2 B4:2 D5:2 F#5:4", "G5:3 F#5:3 E5:2 D5:4 B4:4", "A4:3 D5:3 F#5:2 A5:4 F#5:4", "E5:6 C#5:2 A4:4 C#5:2 E5:2",
    "F#5:3 F#5:3 D5:2 B4:2 D5:2 F#5:4", "B5:3 A5:3 G5:2 F#5:4 E5:4", "G5:3 F#5:3 E5:2 D5:2 E5:2 B4:4", "C#5:4 E5:4 A#4:4 F#4:4");
  const mChorus = bars(
    "A5:6 F#5:2 A5:4 B5:4", "C#6:6 B5:2 A5:4 E5:4", "F#5:6 D5:2 F#5:4 B5:4", "A5:4 G5:4 F#5:4 D5:4",
    "A5:6 F#5:2 A5:4 D6:4", "C#6:4 E6:4 C#6:4 A5:4", "B5:3 A5:3 G5:2 F#5:4 E5:4", "E5:4 G5:4 A5:8");
  const mBridge = bars("B5:8 A5:4 G5:4", "A5:8 E5:8", "F#5:8 C#5:4 A5:4", "B5:16", "D6:8 C#6:4 B5:4", "C#6:8 A5:8", "G5:4 B5:4 E6:8", "C#6:4 A#5:4 F#5:8");
  const mTag = bars("B4:2 D5:2 F#5:2 B5:4 A5:2 F#5:2 D5:2", "G5:2 B5:2 D6:4 B5:2 G5:2 D5:4", "E5:2 G5:2 B5:4 A5:2 G5:2 E5:4", "F#5:4 E5:2 C#5:2 A#4:4 C#5:4");
  const hatV = "x-o-x-o-x-o-x-o-", kickV = "x.....x...x...x.", snV = "....x.......x...";
  const fill = "....x.......x.xx", fillBig = "x.x.x.x.xxxxXXXX";
  return {
    id: "rapids", title: "Rapids Run", mood: "energetic, upbeat, splashy; a fast chase down a white-water river",
    bpm: 140, stepsPerBar: spb, swing: 0,
    master: { gain: 0.85, reverb: { seconds: 1.8, mix: 0.18 }, delay: { steps: 3, feedback: 0.3, tone: 4000 } },
    instruments: {
      arp: { type: "pluck", wave: "sawtooth", tone: 3800, decay: 0.2, gain: 0.36, pan: -0.3, reverb: 0.15, delay: 0.2 },
      bass: { type: "synth", wave: "sawtooth", env: { a: 0.003, d: 0.14, s: 0.5, r: 0.06 }, filter: { type: "lowpass", freq: 480, q: 3, env: 1400 }, gain: 0.34 },
      lead: { type: "synth", wave: "sawtooth", voices: 2, detune: 9, env: { a: 0.01, d: 0.2, s: 0.75, r: 0.12 }, filter: { type: "lowpass", freq: 2900, q: 1, env: 1500 }, vibrato: { rate: 5.5, depth: 10, delay: 0.3 }, glide: 0.025, gain: 0.3, pan: 0.1, reverb: 0.25, delay: 0.2 },
      bell: { type: "fm", ratio: 3, index: 1.4, indexDecay: 0.5, env: { a: 0.002, d: 0.6, s: 0, r: 0.4 }, gain: 0.24, pan: 0.36, reverb: 0.35, delay: 0.3 },
      pad: { type: "synth", wave: "sawtooth", voices: 2, detune: 14, env: { a: 0.25, d: 0.4, s: 0.7, r: 0.5 }, filter: { type: "lowpass", freq: 1400, q: 0.6 }, gain: 0.1, reverb: 0.45 },
      kick: { type: "drum", kind: "kick", gain: 0.3 },
      snare: { type: "drum", kind: "snare", gain: 0.3, reverb: 0.15 },
      hat: { type: "drum", kind: "hat", gain: 0.3, pan: 0.22 },
      openhat: { type: "drum", kind: "openhat", gain: 0.25, pan: -0.22 },
      crash: { type: "drum", kind: "crash", gain: 0.3, pan: 0.1 },
      splash: { type: "noise", color: "white", filter: { type: "bandpass", freq: 1600, q: 0.9, env: 3000 }, env: { a: 0.5, d: 0.4, s: 0.3, r: 0.7 }, gain: 0.2, reverb: 0.3 },
    },
    patterns: {
      arpIntro: P("arp", 4, arp(intro, 0.9), spb), arpV: P("arp", 8, arp(verse), spb), arpC: P("arp", 8, arp(chorus), spb),
      arpBr: P("arp", 8, arp(bridgeP, 0.7), spb), arpTag: P("arp", 4, arp(tag), spb), arpBreak: P("arp", 4, arp(["Bm", "Bm", "G", "F$"], 0.85), spb),
      bassV: P("bass", 8, gallop(verse), spb), bassC: P("bass", 8, gallop(chorus), spb), bassBr: P("bass", 8, longBass(bridgeP), spb), bassTag: P("bass", 4, gallop(tag), spb),
      leadV: P("lead", 8, seq(spb, mVerse, { vel: 0.74, legato: 0.85 }), spb),
      leadC: P("lead", 8, seq(spb, mChorus, { vel: 0.8, legato: 0.92 }), spb),
      leadBr: P("lead", 8, seq(spb, mBridge, { vel: 0.66, legato: 0.96 }), spb),
      leadTag: P("lead", 4, seq(spb, mTag, { vel: 0.76, legato: 0.8 }), spb),
      bellC: P("bell", 8, seq(spb, mChorus, { vel: 0.5, shift: 12 }), spb),
      bellBr: P("bell", 8, seq(spb, mBridge, { vel: 0.55 }), spb),
      bellSpr: P("bell", 4, scatter(spb, 4, 3, ["B5", "D6", "F#6", "A6", "C#6"], { vel: [0.3, 0.6], dur: 2, grid: 2 }), spb),
      padC: P("pad", 8, pads(chorus, 0.6), spb), padBr: P("pad", 8, pads(bridgeP, 0.75), spb),
      kickV: G("kick", kickV, spb), kickC: G("kick", "x...x...x...x..x", spb), kickHalf: G("kick", "x.........x.....", spb),
      kickIntro: G("kick", rep("................", 2) + "|x...x...x...x...|x...x...x...x.x.", spb),
      kickBreak: G("kick", "x...............|x...............|x.......x.......|x...x...x...x...", spb),
      snV: G("snare", rep(snV, 7) + "|" + fill, spb), snC: G("snare", rep(snV, 7) + "|" + fillBig, spb),
      snHalf: G("snare", rep("........x.......", 7) + "|....x...x.x.xxxx", spb),
      snIntro: G("snare", rep("................", 3) + "|,,-,-o-ooxoxxxXX", spb),
      snBreak: G("snare", rep("................", 3) + "|,-,-o-o-xoxoxxXX", spb),
      hatV: G("hat", hatV, spb), hatC: G("hat", "x-.-x-.-x-.-x-.-", spb), hatHalf: G("hat", "o.-.o.-.o.-.o.-.", spb),
      ohC: G("openhat", "..o...o...o...o.", spb),
      crash8: G("crash", "x..............." + rep("................", 7).replace(/^/, "|"), spb),
      crash4: G("crash", "x...............|................|................|................", spb),
      splashRise: P("splash", 4, [[32, "C4", 30, 0.8]], spb),
      splashHit: P("splash", 8, [[0, "C4", 6, 0.75], [112, "C4", 14, 0.65]], spb),
    },
    sections: {
      intro: { bars: 4, tracks: ["arpIntro", "kickIntro", "snIntro", "splashRise"] },
      A: { bars: 8, tracks: ["arpV", "bassV", "leadV", "kickV", "snV", "hatV", "crash8"] },
      B: { bars: 8, tracks: ["arpC", "bassC", "leadC", "padC", "kickC", "snC", "hatC", "ohC", "crash8", "splashHit"] },
      break: { bars: 4, tracks: ["arpBreak", "kickBreak", "snBreak", "bellSpr", "splashRise"] },
      bridge: { bars: 8, tracks: ["arpBr", "bassBr", "leadBr", "bellBr", "padBr", "kickHalf", "snHalf", "hatHalf", "crash8"] },
      B2: { bars: 8, tracks: ["arpC", "bassC", "leadC", "bellC", "padC", "kickC", "snC", "hatC", "ohC", "crash8", "splashHit"] },
      tag: { bars: 4, tracks: ["arpTag", "bassTag", "leadTag", "kickV", "snBreak", "hatV", "crash4"] },
    },
    arrangement: ["intro", "A", "B", "break", "bridge", "B2", "tag"],
    loop: 1,
  };
};

// =====================================================================================================
// 3. AURORA DRIFT - D lydian / major, 90 bpm. Wide detuned pads, glassy FM bells, a vibrato glass lead,
//    shimmering delayed arpeggios, polar wind swells, a soft lo-fi beat in the second half.
// =====================================================================================================
SONGS.aurora = () => {
  seed = 33;
  const spb = 16;
  const V = {
    Dmaj7: { r: "D2", v: ["D3", "A3", "C#4", "F#4"] }, Bm9: { r: "B1", v: ["B2", "F#3", "C#4", "D4"] },
    Gmaj7: { r: "G1", v: ["G2", "D3", "F#3", "B3", "C#4"] }, Asus: { r: "A1", v: ["A2", "E3", "A3", "D4"] }, A: { r: "A1", v: ["A2", "E3", "A3", "C#4"] },
    Bbmaj7: { r: "A#1", v: ["A#2", "F3", "A3", "D4"] }, Cadd9: { r: "C2", v: ["C3", "G3", "D4", "E4"] },
  };
  // [chord, bars]
  const progA = [["Dmaj7", 2], ["Bm9", 2], ["Gmaj7", 2], ["Asus", 1], ["A", 1]];
  const progBr = [["Bbmaj7", 1], ["Cadd9", 1], ["Bbmaj7", 1], ["Asus", 0.5], ["A", 0.5]];
  const progIn = [["Dmaj7", 2], ["Bm9", 2]];
  const expand = (prog) => { let at = 0; return prog.map(([c, b]) => { const o = { c, at, len: b * 16 }; at += b; return o; }); };
  const pad = (prog, vel) => expand(prog).map((o) => [o.at * 16, V[o.c].v, o.len - 0.5, hv(vel, 0.02)]);
  const sub = (prog) => expand(prog).map((o) => [o.at * 16, V[o.c].r, o.len - 1, 0.75]);
  const shimmer = (prog, vel) => {
    const out = [];
    for (const o of expand(prog)) {
      const t = V[o.c].v.slice(-3).map((q) => M(q) + 12), seqI = [0, 1, 2, 1, 2, 0, 1, 2];
      for (let s = 0; s < o.len; s += 2) out.push([o.at * 16 + s, nm(t[seqI[(s / 2) % 8]] + (s % 8 === 6 ? 12 : 0)), 1.5, hv(vel * (s % 4 ? 0.7 : 1), 0.06)]);
    }
    return out;
  };
  const melA = bars("F#5:4 A5:4 E5:8", "r:4 C#5:2 D5:2 A4:8", "B4:4 D5:4 F#5:6 E5:2", "C#5:12 r:4", "D5:4 G5:4 F#5:4 C#6:4", "B5:16", "A5:4 G5:4 F#5:4 E5:4", "E5:8 C#5:8");
  const melB = bars("A5:6 B5:2 C#6:8", "E6:4 C#6:4 A5:8", "F#5:6 A5:2 B5:8", "D6:4 C#6:4 B5:4 A5:4", "G5:6 A5:2 B5:4 C#6:4", "D6:8 B5:8", "C#6:4 B5:4 A5:4 F#5:4", "E5:16");
  const melBr = bars("D5:16", "E5:8 G5:8", "F5:8 D5:8", "E5:8 C#5:8");
  const counter = bars("D5:16", "C#5:16", "D5:16", "E5:16", "B4:16", "D5:16", "E5:8 G5:8", "C#5:16");
  const drops = bars("A5:8 r:8", "r:8 F#5:4 E5:4", "r:16", "D6:8 r:4 C#6:4");
  return {
    id: "aurora", title: "Aurora Drift", mood: "dreamy, floating, shimmering; ambient pads, glass bells and polar wind under the northern lights",
    bpm: 90, stepsPerBar: spb, swing: 0.06,
    master: { gain: 0.95, reverb: { seconds: 3.6, mix: 0.34 }, delay: { steps: 6, feedback: 0.42, tone: 3200 } },
    instruments: {
      pad: { type: "synth", wave: "sawtooth", voices: 2, detune: 16, env: { a: 1.4, d: 1, s: 0.8, r: 2.4 }, filter: { type: "lowpass", freq: 1150, q: 0.6 }, gain: 0.085, reverb: 0.7 },
      bell: { type: "fm", ratio: 3.5, index: 2.2, indexDecay: 1, env: { a: 0.003, d: 1.8, s: 0, r: 1.6 }, gain: 0.26, pan: 0.2, reverb: 0.6, delay: 0.35 },
      glass: { type: "synth", wave: "sine", env: { a: 0.07, d: 0.3, s: 0.7, r: 0.9 }, vibrato: { rate: 4.5, depth: 9, delay: 0.5 }, glide: 0.03, gain: 0.2, pan: -0.15, reverb: 0.6, delay: 0.35 },
      shimmer: { type: "synth", wave: "triangle", env: { a: 0.005, d: 0.25, s: 0.15, r: 0.35 }, gain: 0.16, pan: -0.42, reverb: 0.5, delay: 0.5 },
      sub: { type: "synth", wave: "sine", env: { a: 0.1, d: 0.5, s: 0.8, r: 0.7 }, gain: 0.22 },
      wind: { type: "noise", color: "pink", filter: { type: "bandpass", freq: 700, q: 1.2, env: 900 }, env: { a: 2.5, d: 2, s: 0.6, r: 2.5 }, gain: 0.3 },
      sparkle: { type: "noise", color: "white", filter: { type: "highpass", freq: 6000, q: 0.5 }, env: { a: 1.6, d: 0.2, s: 0.4, r: 1.2 }, gain: 0.12, pan: 0.3, reverb: 0.6 },
      kick: { type: "drum", kind: "kick", gain: 0.26, decay: 1.3 },
      rim: { type: "drum", kind: "rim", gain: 0.25, pan: 0.25, reverb: 0.5, delay: 0.3 },
      shaker: { type: "drum", kind: "shaker", gain: 0.3, pan: -0.25 },
    },
    patterns: {
      padIn: P("pad", 4, pad(progIn, 0.6), spb), padA: P("pad", 8, pad(progA, 0.7), spb), padBr: P("pad", 4, pad(progBr, 0.85), spb),
      subA: P("sub", 8, sub(progA), spb), subBr: P("sub", 4, sub(progBr), spb),
      shimA: P("shimmer", 8, shimmer(progA, 0.6), spb), shimBr: P("shimmer", 4, shimmer(progBr, 0.4), spb),
      bellA: P("bell", 8, seq(spb, melA, { vel: 0.7 }), spb),
      bellDrops: P("bell", 4, seq(spb, drops, { vel: 0.5 }), spb),
      bellBr: P("bell", 4, seq(spb, melBr, { vel: 0.6 }), spb),
      glassB: P("glass", 8, seq(spb, melB, { vel: 0.64, legato: 0.96 }), spb),
      glassCounter: P("glass", 8, seq(spb, counter, { vel: 0.55, legato: 0.97 }), spb),
      windLong: P("wind", 4, [[0, "C4", 30, 0.7], [32, "C4", 30, 0.55]], spb),
      sparkle: P("sparkle", 8, [[48, "C4", 14, 0.7], [112, "C4", 14, 0.8]], spb),
      kickB: G("kick", "x.......x.x.....|x.......x......-", spb),
      rimB: G("rim", "....o.......o...|....o.......o..,", spb),
      shakerB: G("shaker", "-.o.-.o.-.o.-.o.", spb),
    },
    sections: {
      intro: { bars: 4, tracks: ["padIn", "windLong", "bellDrops"] },
      A: { bars: 8, tracks: ["padA", "subA", "bellA", "windLong", "sparkle"] },
      B: { bars: 8, tracks: ["padA", "subA", "shimA", "glassB", "kickB", "rimB", "shakerB", "sparkle"] },
      bridge: { bars: 4, tracks: ["padBr", "subBr", "bellBr", "shimBr", "windLong"] },
      A2: { bars: 8, tracks: ["padA", "subA", "bellA", "shimA", { p: "glassCounter", transpose: -12 }, "kickB", "rimB", "shakerB", "sparkle"] },
    },
    arrangement: ["intro", "A", "B", "bridge", "A2"],
    loop: 1,
  };
};

// =====================================================================================================
// 4. THUNDERDRUM - D minor, 128 bpm. Low and high taiko, toms, stick clicks, claps, a brass-like synth riff,
//    a sub, a reedy vibrato lead, and rolling thunder.
// =====================================================================================================
SONGS.thunderdrum = () => {
  seed = 44;
  const spb = 16;
  const riff = bars(
    "D3+A3:3 D3+A3:3 D3+A3:2 r:2 F3+C4:2 E3+A3:4", "D3+A3:6 r:2 C3+G3:4 A2+E3:4",
    "A#2+F3:3 A#2+F3:3 A#2+F3:2 r:2 C3+G3:2 D3+A3:4", "C3+G3:6 r:2 C3+E3+G3:4 A2+E3+A3:4");
  const longB = bars("D3+A3+F4:16", "F3+A3+C4:16", "C3+G3+E4:16", "A#2+F3+D4:16", "G2+D3+A#3:16", "A#2+F3+D4:16", "A2+E3+C#4:16", "A2+E3+C#4:12 r:4");
  const longBr = bars("A#2+F3+D4:16", "C3+G3+E4:16", "D3+A3+F4:16", "D3+A3+F4:16", "G2+D3+A#3:16", "A#2+F3+D4:16", "A2+E3+C#4:16", "A2+E3+C#4+E4:16");
  const subA = bars("D2:6 D2:2 r:2 F2:2 A1:4", "D2:8 C2:4 A1:4", "A#1:6 A#1:2 r:2 C2:2 D2:4", "C2:8 C2:4 A1:4");
  const subB = bars("D2:16", "F2:16", "C2:16", "A#1:16", "G1:16", "A#1:16", "A1:16", "A1:12 r:4");
  const subBr = bars("A#1:16", "C2:16", "D2:16", "D2:16", "G1:16", "A#1:16", "A1:16", "A1:16");
  const melB = bars("D5:4 F5:2 G5:2 A5:6 G5:2", "F5:4 A5:4 C6:8", "G5:4 E5:4 C5:4 E5:4", "D5:6 F5:2 D5:4 A#4:4",
    "G4:4 A#4:2 D5:2 G5:6 F5:2", "F5:4 D5:4 A#4:8", "A4:4 C#5:4 E5:4 G5:4", "A5:12 r:4");
  const melBr = bars("D5:8 F5:8", "E5:8 G5:8", "A5:16", "A5:8 G5:4 F5:4", "A#5:8 A5:4 G5:4", "F5:8 D5:8", "E5:8 C#5:8", "E5:16");
  const hits = bars("D3+A3+D4:2 r:2 D3+A3+D4:2 r:10", "r:16", "A#2+F3+D4:2 r:2 C3+G3+E4:2 r:10", "A2+E3+C#4:4 r:4 A2+E3+A3:8");
  return {
    id: "thunderdrum", title: "Thunderdrum", mood: "heavy, tribal, powerful; big taiko drums, low brass and rolling thunder",
    bpm: 128, stepsPerBar: spb, swing: 0.04,
    master: { gain: 0.7, reverb: { seconds: 2.8, mix: 0.24 }, delay: { steps: 3, feedback: 0.25, tone: 2600 } },
    instruments: {
      taikoLo: { type: "drum", kind: "taiko", gain: 0.17, decay: 1.2, reverb: 0.3 },
      taikoHi: { type: "drum", kind: "taiko", gain: 0.2, decay: 0.6, pan: 0.22, reverb: 0.25 },
      tom: { type: "drum", kind: "tom", gain: 0.3, pan: -0.25, reverb: 0.2 },
      sticks: { type: "drum", kind: "rim", gain: 0.3, pan: 0.32 },
      clap: { type: "drum", kind: "clap", gain: 0.35, reverb: 0.35 },
      crash: { type: "drum", kind: "crash", gain: 0.3 },
      brass: { type: "synth", wave: "sawtooth", voices: 3, detune: 12, env: { a: 0.05, d: 0.35, s: 0.65, r: 0.25 }, filter: { type: "lowpass", freq: 800, q: 1.2, env: 1600 }, gain: 0.3, reverb: 0.3 },
      swell: { type: "synth", wave: "sawtooth", voices: 2, detune: 10, env: { a: 0.9, d: 0.8, s: 0.8, r: 0.9 }, filter: { type: "lowpass", freq: 900, q: 0.8 }, gain: 0.2, reverb: 0.45 },
      sub: { type: "synth", wave: "sine", env: { a: 0.01, d: 0.4, s: 0.7, r: 0.2 }, gain: 0.28 },
      lead: { type: "synth", wave: "square", env: { a: 0.03, d: 0.2, s: 0.8, r: 0.2 }, filter: { type: "lowpass", freq: 2200, q: 1, env: 800 }, vibrato: { rate: 5, depth: 18, delay: 0.25 }, glide: 0.04, gain: 0.22, pan: -0.1, reverb: 0.35, delay: 0.18 },
      rumble: { type: "noise", color: "brown", filter: { type: "lowpass", freq: 260, q: 0.7 }, env: { a: 1.5, d: 1, s: 0.7, r: 2 }, gain: 0.2 },
    },
    patterns: {
      heart: G("taikoLo", "x..o............|x..o............|x..o....x..o....|x..o..x.x.x.xxxx", spb, { pitch: "D2" }),
      heartHi: G("taikoHi", rep("................", 2) + "|....o.......o...|....o..o.ooooxxX", spb, { pitch: "A2" }),
      loA: G("taikoLo", "x..x..x...x.x...|x..x..x...x...x.", spb, { pitch: "D2" }),
      hiA: G("taikoHi", "....x.......x..o|....x.......x.oo", spb, { pitch: "A2" }),
      sticksA: G("sticks", "x.-.x.-.x.-.x.-.", spb),
      sticksB: G("sticks", "x-o-x-o-x-o-x-o-", spb),
      clapB: G("clap", "....x.......x...", spb),
      crash8: G("crash", "x..............." + "|................".repeat(7), spb),
      tomFill: G("tom", rep("................", 7) + "|........x.x.xoxo", spb, { pitch: "D3" }),
      tomFill2: G("tom", rep("................", 7) + "|x.x.o.o.x.x.o.o.", spb, { pitch: "A2" }),
      brkLo: G("taikoLo", "x.x.x...........|................|x.x.x.....x.x...|x...x...x.x.xxxx", spb, { pitch: "D2" }),
      brkHi: G("taikoHi", "................|x.x.x...x.x.....|................|....x...x.x.xxXX", spb, { pitch: "A2" }),
      brkTom: G("tom", "........o.o.o...|..............oo|........o.o.o...|xoxoxoxoxoxoXXXX", spb, { pitch: "F2" }),
      loHalf: G("taikoLo", "x.........x.....", spb, { pitch: "D2" }),
      hiHalf: G("taikoHi", "........x.......", spb, { pitch: "A2" }),
      rollBuild: G("taikoHi", rep("................", 6) + "|-.-.o.o.o.o.x.x.|xxxxxxxxXXXXXXXX", spb, { pitch: "A2" }),
      outLo: G("taikoLo", "x...x...........|x.x.x.x.x.x.x.x.|x...x...........|x.x.xxxxXXXXXXXX", spb, { pitch: "D2" }),
      riffA: P("brass", 4, seq(spb, riff, { vel: 0.78, legato: 0.85, hum: 0.04 }), spb),
      hitsOut: P("brass", 4, seq(spb, hits, { vel: 0.9, legato: 0.8 }), spb),
      chordsB: P("swell", 8, seq(spb, longB, { vel: 0.7 }), spb),
      chordsBr: P("swell", 8, seq(spb, longBr, { vel: 0.8 }), spb),
      introSwell: P("swell", 4, [[32, ["D3", "A3", "D4"], 31, 0.55]], spb),
      subA: P("sub", 4, seq(spb, subA, { vel: 0.85, legato: 0.9 }), spb),
      subB: P("sub", 8, seq(spb, subB, { vel: 0.8 }), spb),
      subBr: P("sub", 8, seq(spb, subBr, { vel: 0.8 }), spb),
      leadB: P("lead", 8, seq(spb, melB, { vel: 0.76, legato: 0.93 }), spb),
      leadBr: P("lead", 8, seq(spb, melBr, { vel: 0.7, legato: 0.97 }), spb),
      rumble: P("rumble", 4, [[0, "C2", 60, 0.8]], spb),
      rumbleShort: P("rumble", 4, [[0, "C2", 28, 0.7]], spb),
    },
    sections: {
      intro: { bars: 4, tracks: ["heart", "heartHi", "rumble", "introSwell"] },
      A: { bars: 8, tracks: ["loA", "hiA", "sticksA", "riffA", "subA", "crash8", "tomFill"] },
      B: { bars: 8, tracks: ["loA", "hiA", "sticksB", "clapB", "chordsB", "subB", "leadB", "crash8", "tomFill2"] },
      break: { bars: 4, tracks: ["brkLo", "brkHi", "brkTom", "rumbleShort"] },
      bridge: { bars: 8, tracks: ["loHalf", "hiHalf", "chordsBr", "subBr", "leadBr", "rollBuild", "rumble", "crash8"] },
      B2: { bars: 8, tracks: ["loA", "hiA", "sticksB", "clapB", "riffA", { p: "chordsB", vel: 0.6 }, "subB", "leadB", "crash8", "tomFill"] },
      outro: { bars: 4, tracks: ["outLo", "hitsOut", "sticksA", "rumbleShort"] },
    },
    arrangement: ["intro", "A", "B", "break", "bridge", "B2", "outro"],
    loop: 1,
  };
};

// =====================================================================================================
// 5. MOONLIT HOLLOW - A minor, 96 bpm, 3/4 nocturne. Music box, soft FM e-piano waltz, a breathy clarinet,
//    a string pad, owls, crickets and firefly twinkles.
// =====================================================================================================
SONGS.moonlit = () => {
  seed = 55;
  const spb = 12;
  const V = {
    Am: { r: "A2", v: ["A3", "C4", "E4"] }, F: { r: "F2", v: ["A3", "C4", "E4"] }, Dm9: { r: "D2", v: ["F3", "A3", "C4", "E4"] },
    E: { r: "E2", v: ["G#3", "B3", "E4"] }, E7: { r: "E2", v: ["G#3", "B3", "D4"] }, CG: { r: "G2", v: ["G3", "C4", "E4"] },
    Dm: { r: "D2", v: ["F3", "A3", "D4"] }, G: { r: "G2", v: ["G3", "B3", "D4"] }, C: { r: "C3", v: ["G3", "C4", "E4"] },
    Em7: { r: "E2", v: ["G3", "B3", "D4"] }, Esus: { r: "E2", v: ["A3", "B3", "E4"] },
  };
  const progA = ["Am", "F", "Dm9", "E7", "Am", "CG", "F", "E"];
  const progB = ["Dm", "Am", "E", "Am", "Dm", "G", "C", "E7"];
  const progBr = ["F", "G", "Em7", "Am", "F", "G", "Esus", "E"];
  const progIn = ["Am", "F", "Am", "E"];
  const progCoda = ["Am", "F", "E", "Am"];
  const waltz = (prog, vel = 1) => {
    const out = [];
    prog.forEach((c, b) => { out.push([b * 12 + 4, V[c].v, 3.5, hv(0.5 * vel, 0.04)]); out.push([b * 12 + 8, V[c].v, 3.5, hv(0.42 * vel, 0.04)]); });
    return out;
  };
  const bass = (prog) => prog.map((c, b) => [b * 12, V[c].r, 10, hv(0.75, 0.03)]);
  const strings = (prog, vel) => prog.map((c, b) => [b * 12, V[c].v.map((q) => tr(q, 0)), 11.5, hv(vel, 0.02)]);
  const boxArp = (prog, vel) => {
    const out = [];
    prog.forEach((c, b) => { const t = V[c].v.map((q) => M(q) + 12), o = [t[0], t[1], t[2], t[0] + 12, t[2], t[1]]; o.forEach((m, i) => out.push([b * 12 + i * 2, nm(m), 2, hv(vel * (i === 0 ? 1 : 0.75), 0.05)])); });
    return out;
  };
  const melA = bars("E5:6 A5:3 B5:3", "C6:6 B5:3 A5:3", "F5:9 E5:3", "D5:3 C5:3 B4:6", "E5:6 A5:3 B5:3", "C6:6 D6:3 E6:3", "D6:6 C6:3 A5:3", "B5:9 G#5:3");
  const melB = bars("A4:3 D5:3 F5:6", "E5:6 C5:3 A4:3", "B4:3 E5:3 G#5:6", "A5:12", "F5:3 E5:3 D5:3 F5:3", "G5:6 D5:3 B4:3", "C5:3 E5:3 G5:6", "B5:6 G#5:3 E5:3");
  const clarBr = bars("C5:12", "D5:12", "B4:12", "C5:6 E5:6", "A5:12", "B5:12", "A5:6 B5:6", "G#5:12");
  const clarCounter = bars("C5:12", "C5:12", "A4:12", "B4:12", "C5:12", "E5:12", "F5:12", "E5:6 D5:6");
  const coda = bars("E5:6 A5:3 B5:3", "C6:6 B5:3 A5:3", "G#5:6 B5:3 E5:3", "A5:12");
  const owl = (bars, at) => { const o = []; for (const b of at) { o.push([b * 12, "E4", 4, 0.55], [b * 12 + 6, "D4", 1.5, 0.42], [b * 12 + 8, "D4", 3, 0.48]); } return o.filter((n) => n[0] < bars * 12); };
  const crick = (bars, every) => { const o = []; for (let b = 0; b < bars; b += every) { const s = b * 12 + 1 + Math.floor(rnd() * 6); for (let k = 0; k < 4; k++) o.push([r3(s + k * 0.5), 0, 0.5, clampV(0.6 - k * 0.08)]); } return o; };
  const fly = (bars, per) => scatter(spb, bars, per, ["A6", "C7", "D7", "E7", "G6", "E6"], { vel: [0.35, 0.75], dur: 1, grid: 1 });
  return {
    id: "moonlit", title: "Moonlit Hollow", mood: "mysterious, gentle nocturne waltz; music box and clarinet with owls, crickets and fireflies",
    bpm: 96, stepsPerBar: spb, swing: 0.08,
    master: { gain: 1, reverb: { seconds: 3.2, mix: 0.3 }, delay: { steps: 4, feedback: 0.36, tone: 3000 } },
    instruments: {
      ep: { type: "fm", ratio: 1, index: 1.1, indexDecay: 0.7, env: { a: 0.004, d: 1.4, s: 0.25, r: 0.7 }, gain: 0.16, pan: -0.15, reverb: 0.4 },
      box: { type: "fm", ratio: 5, index: 1.2, indexDecay: 0.35, env: { a: 0.002, d: 1.1, s: 0, r: 0.9 }, gain: 0.24, pan: 0.15, reverb: 0.5, delay: 0.3 },
      clar: { type: "synth", wave: "square", env: { a: 0.06, d: 0.2, s: 0.8, r: 0.25 }, filter: { type: "lowpass", freq: 1300, q: 0.8 }, vibrato: { rate: 5, depth: 12, delay: 0.35 }, gain: 0.15, pan: -0.05, reverb: 0.4, delay: 0.1 },
      bass: { type: "synth", wave: "triangle", env: { a: 0.01, d: 0.6, s: 0.5, r: 0.4 }, filter: { type: "lowpass", freq: 700, q: 0.5 }, gain: 0.3 },
      strings: { type: "synth", wave: "triangle", voices: 2, detune: 6, env: { a: 0.8, d: 0.5, s: 0.7, r: 1.4 }, filter: { type: "lowpass", freq: 1500, q: 0.5 }, gain: 0.1, reverb: 0.6 },
      owl: { type: "synth", wave: "sine", env: { a: 0.06, d: 0.15, s: 0.7, r: 0.25 }, glide: 0.06, vibrato: { rate: 7, depth: 25, delay: 0.05 }, gain: 0.16, pan: -0.55, reverb: 0.7 },
      firefly: { type: "fm", ratio: 7, index: 0.8, indexDecay: 0.2, env: { a: 0.002, d: 0.4, s: 0, r: 0.3 }, gain: 0.09, pan: 0.5, reverb: 0.6, delay: 0.6 },
      cricket: { type: "noise", color: "white", filter: { type: "bandpass", freq: 4800, q: 6 }, env: { a: 0.002, d: 0.03, s: 0, r: 0.02 }, gain: 0.16, pan: 0.42 },
      brush: { type: "drum", kind: "shaker", gain: 0.22, decay: 1.5, pan: 0.2 },
      heart: { type: "drum", kind: "tom", gain: 0.14, decay: 1.4 },
    },
    patterns: {
      epIn: P("ep", 4, waltz(progIn, 0.85), spb), epA: P("ep", 8, waltz(progA), spb), epB: P("ep", 8, waltz(progB), spb),
      epBr: P("ep", 8, waltz(progBr, 0.75), spb), epCoda: P("ep", 4, waltz(progCoda, 0.8), spb),
      bassIn: P("bass", 4, bass(progIn), spb), bassA: P("bass", 8, bass(progA), spb), bassB: P("bass", 8, bass(progB), spb),
      bassBr: P("bass", 8, bass(progBr), spb), bassCoda: P("bass", 4, bass(progCoda), spb),
      boxA: P("box", 8, seq(spb, melA, { vel: 0.7 }), spb),
      boxCoda: P("box", 4, seq(spb, coda, { vel: 0.62 }), spb),
      boxArpB: P("box", 8, boxArp(progB, 0.32), spb), boxArpBr: P("box", 8, boxArp(progBr, 0.45), spb),
      clarB: P("clar", 8, seq(spb, melB, { vel: 0.68, legato: 0.94 }), spb),
      clarBr: P("clar", 8, seq(spb, clarBr, { vel: 0.6, legato: 0.97 }), spb),
      clarCounter: P("clar", 8, seq(spb, clarCounter, { vel: 0.5, legato: 0.97 }), spb),
      strBr: P("strings", 8, strings(progBr, 0.6), spb), strA: P("strings", 8, strings(progA, 0.45), spb),
      owlIn: P("owl", 4, owl(4, [1]), spb), owlA: P("owl", 8, owl(8, [5]), spb), owlBr: P("owl", 8, owl(8, [1, 6]), spb),
      flyIn: P("firefly", 4, fly(4, 1), spb), flyA: P("firefly", 8, fly(8, 1), spb), flyBr: P("firefly", 8, fly(8, 2), spb),
      cricketIn: P("cricket", 4, crick(4, 1), spb), cricketA: P("cricket", 8, crick(8, 2), spb),
      brush: G("brush", "....o.-.o.-.", spb), brushSoft: G("brush", "....-...-...", spb),
      heart: G("heart", "x...........|-...........", spb, { pitch: "A2" }),
    },
    sections: {
      intro: { bars: 4, tracks: ["epIn", "bassIn", "owlIn", "flyIn", "cricketIn"] },
      A: { bars: 8, tracks: ["epA", "bassA", "boxA", "brushSoft", "flyA", "cricketA", "owlA"] },
      B: { bars: 8, tracks: ["epB", "bassB", "clarB", "boxArpB", "brush", "heart", "cricketA"] },
      bridge: { bars: 8, tracks: ["epBr", "bassBr", "strBr", "boxArpBr", "clarBr", "owlBr", "flyBr", "brushSoft"] },
      A2: { bars: 8, tracks: ["epA", "bassA", "boxA", "strA", "clarCounter", "brush", "heart", "flyA"] },
      coda: { bars: 4, tracks: ["epCoda", "bassCoda", "boxCoda", "cricketIn", "flyIn"] },
    },
    arrangement: ["intro", "A", "B", "bridge", "A2", "coda"],
    loop: 1,
  };
};

// ---------- polyphony estimate (sounding voices, ignoring reverb/delay tails) ----------
function polyphony(song) {
  const spb = song.stepsPerBar || 16, st = 60 / song.bpm / 4, events = [];
  let t0 = 0;
  for (const sn of song.arrangement) {
    const sec = song.sections[sn], len = sec.bars * spb;
    for (const trk of sec.tracks) {
      const p = song.patterns[typeof trk === "string" ? trk : trk.p], inst = song.instruments[p.inst], pl = p.bars * spb;
      for (let off = 0; off < len; off += pl) for (const n of p.notes) {
        if (off + n[0] >= len) continue;
        const k = Array.isArray(n[1]) ? n[1].length : 1;
        const vox = inst.type === "synth" ? Math.max(1, inst.voices || 1) : 1;
        let dur = inst.type === "pluck" ? (inst.decay ?? 0.5) * 1.5 : inst.type === "drum" ? 0.3 : n[2] * st + ((inst.env && inst.env.r) || 0.2);
        events.push([t0 + (off + n[0]) * st, k, k * vox], [t0 + (off + n[0]) * st + dur, -k, -k * vox]);
      }
    }
    t0 += len * st;
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, curO = 0, max = 0, maxO = 0;
  for (const e of events) { cur += e[1]; curO += e[2]; max = Math.max(max, cur); maxO = Math.max(maxO, curO); }
  return { notes: max, oscillators: maxO };
}

// ---------- write ----------
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SONGS);
function fmt(song) {
  // compact, readable: one note per line inside patterns
  const lines = ["{"];
  const kv = (k, v, comma) => lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${comma ? "," : ""}`);
  for (const k of ["id", "title", "mood", "bpm", "stepsPerBar", "swing", "master"]) kv(k, song[k], true);
  lines.push('  "instruments": {');
  const ik = Object.keys(song.instruments);
  ik.forEach((k, i) => lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify(song.instruments[k])}${i < ik.length - 1 ? "," : ""}`));
  lines.push("  },", '  "patterns": {');
  const pk = Object.keys(song.patterns);
  pk.forEach((k, i) => {
    const p = song.patterns[k];
    lines.push(`    ${JSON.stringify(k)}: { "inst": ${JSON.stringify(p.inst)}, "bars": ${p.bars}, "notes": [`);
    const per = 6;
    for (let j = 0; j < p.notes.length; j += per) lines.push("      " + p.notes.slice(j, j + per).map((n) => JSON.stringify(n)).join(", ") + (j + per < p.notes.length ? "," : ""));
    lines.push(`    ] }${i < pk.length - 1 ? "," : ""}`);
  });
  lines.push("  },", '  "sections": {');
  const sk = Object.keys(song.sections);
  sk.forEach((k, i) => lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify(song.sections[k])}${i < sk.length - 1 ? "," : ""}`));
  lines.push("  },");
  kv("arrangement", song.arrangement, true);
  kv("loop", song.loop, false);
  lines.push("}");
  return lines.join("\n");
}
let bad = 0;
for (const id of want) {
  const song = SONGS[id]();
  const r = validateSong(song, id);
  const poly = polyphony(song);
  console.log(`${id}: ${r.ok ? "OK" : "INVALID"} loop ${r.loopSeconds.toFixed(1)} s (total ${r.seconds.toFixed(1)} s), max ${poly.notes} notes / ${poly.oscillators} oscillators`);
  for (const e of r.errors) console.log("   error:", e);
  for (const w of r.warnings) console.log("   warning:", w);
  if (!r.ok) { bad++; continue; }
  const header = `// ${song.title} (${id}) - original song by MUSIC_B for Adventure Cube. PURE DATA in the format of ../format.js.\n` +
    `// Generated by tools/compose-b.mjs (edit that script and re-run it rather than editing this file by hand).\n`;
  writeFileSync(path.join(OUT, id + ".js"), header + "export default " + fmt(song) + ";\n");
}
process.exit(bad ? 1 : 0);
