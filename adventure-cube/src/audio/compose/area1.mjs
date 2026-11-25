// area1.mjs - "Sunlit Canopy" (Area 1, Sunlit Forest). D major, 108 bpm, light swing.
// Acoustic-folk morning: fingerpicked guitar, kalimba sparkles, a wooden flute melody, glockenspiel answers,
// upright bass, cross-stick, shaker and hand claps.
// Form: intro(4) A(8) B(8) A2(8) bridge(8, drums drop out) B2(8, everything + harmony) tag(4) -> loop to A.
import { melBars, prog, pad, bassLine, arp, strum, grid, hand, harmony, pat, cat, scale, scaleVel } from "./lib.mjs";

const P = {
  intro: prog(["D", "Bm", "G", "Asus4 A"]),
  A: prog(["D", "A/C#", "Bm", "G", "D", "A", "G", "A"]),
  B: prog(["G", "A", "F#m", "Bm", "G", "A", "Em7", "A7"]),
  br: prog(["Em", "G", "D/F#", "A", "Em", "G", "Bm", "Asus4 A"]),
  tag: prog(["G", "A", "Bm G", "Asus4 A"]),
};
const D = scale("D", "major");

const melA = melBars([
  "F#5:3 E5:1 D5:2 A4:2 D5:4 E5:2 F#5:2",
  "E5:6 C#5:2 A4:4 -:2 A4:1 B4:1",
  "D5:3 C#5:1 B4:2 F#4:2 B4:4 C#5:2 D5:2",
  "D5:6 B4:2 G4:4 A4:2 B4:2",
  "A5:3 G5:1 F#5:2 D5:2 F#5:4 G5:2 A5:2",
  "B5:4 A5:2 E5:2 C#5:4 E5:2 A5:2",
  "B5:3 A5:1 G5:2 D5:2 G5:2 F#5:2 E5:2 D5:2",
  "E5:10 -:4 A4:1 C#5:1",
]);
const melB = melBars([
  "B5:6 A5:2 G5:4 D5:4",
  "C#6:6 B5:2 A5:4 E5:4",
  "A5:4 C#6:4 A5:2 F#5:2 E5:2 F#5:2",
  "D5:6 C#5:2 D5:4 F#5:4",
  "G5:6 F#5:2 G5:4 B5:4",
  "A5:6 G5:2 F#5:4 E5:4",
  "D5:4 E5:4 G5:4 B5:4",
  "A5:12 G5:2 E5:2",
], { vel: 0.85 });
const melBr = melBars([
  "B4:8 E5:8", "D5:8 B4:4 G4:4", "A4:8 F#4:4 A4:4", "E5:12 C#5:4",
  "G5:8 F#5:4 E5:4", "D5:8 B4:4 D5:4", "F#5:8 E5:4 D5:4", "E5:14 -:2",
], { vel: 0.7 });
const melIntro = melBars(["-:16", "-:16", "-:8 A4:2 D5:2 E5:2 F#5:2", "G5:6 F#5:2 E5:8"], { vel: 0.6 });
const melTag = melBars(["B5:4 A5:2 G5:2 D5:8", "C#5:4 D5:2 E5:2 A4:8", "D5:4 F#5:4 B4:4 D5:4", "D5:4 E5:4 -:4 A4:2 C#5:2"], { vel: 0.75 });
const glA = melBars(["-:16", "-:8 E6:2 C#6:2 A5:4", "-:16", "-:8 B5:2 D6:2 G6:4", "-:16", "-:8 C#6:2 E6:2 A6:4", "-:16", "-:4 E6:2 C#6:2 B5:2 A5:2 -:4"], { vel: 0.6 });
const glB = melBars([
  "-:8 D6:2 B5:2 G5:4", "-:8 E6:2 C#6:2 A5:4", "-:8 C#6:2 A5:2 F#5:4", "-:8 F#6:4 D6:4",
  "-:8 B5:2 D6:2 G6:4", "-:8 C#6:2 E6:2 A6:4", "-:8 G6:2 E6:2 B5:2 D6:2", "-:8 G6:2 E6:2 C#6:2 A5:2",
], { vel: 0.55 });

const pick = [0, 2, 1, 3, 0, 2, 1, 2];           // fingerpicking order over a 4-note voicing, in 8ths
const kal = [0, 1, 2, 1, 3, 1, 2, 4];             // kalimba ripple
const bassA = [[0, "R", 6, 0.85], [6, "R", 2, 0.45], [8, "5", 6, 0.7], [14, "A", 2, 0.5]];
const bassB = [[0, "R", 3, 0.85], [3, "R", 3, 0.5], [6, "5", 2, 0.6], [8, "8", 3, 0.75], [11, "5", 3, 0.5], [14, "A", 2, 0.6]];
const congaP = { l: "G3", m: "C4", h: "F4" };

const patterns = {
  // intro
  inKal: pat("kalimba", 4, arp(P.intro, kal, { n: 3, lo: 62, hi: 79, every: 2, dur: 3, vel: 0.5 })),
  inStr: pat("strings", 4, pad(P.intro, { n: 3, lo: 54, hi: 71, vel: 0.45 })),
  inBass: pat("bass", 4, bassLine(P.intro, [[0, "R", 16, 0.55]], { lo: 38 })),
  inFlute: pat("flute", 4, melIntro),
  inShk: pat("shaker", 4, grid("................|................|g.g.g.g.g.g.g.g.|o.g.o.g.o.g.ogog")),
  // A
  aFlute: pat("flute", 8, melA),
  aGtr: pat("guitar", 8, arp(P.A, pick, { n: 4, lo: 45, hi: 69, every: 2, dur: 4, vel: 0.55, accent: [0, 4] })),
  aBass: pat("bass", 8, bassLine(P.A, bassA, { lo: 38 })),
  kickA: pat("kick", 1, grid("x.......x.x.....")),
  rimA: pat("rim", 1, grid("....x.......x...")),
  shkA: pat("shaker", 1, grid("ogogogogogogogog", { vel: 0.8 })),
  // B
  bFlute: pat("flute", 8, melB),
  bStrum: pat("guitar", 8, strum(P.B, "D.DU.UDU", { n: 4, lo: 47, hi: 71, vel: 0.5 })),
  bStr: pat("strings", 8, pad(P.B, { n: 3, lo: 57, hi: 74, vel: 0.5 })),
  bBass: pat("bass", 8, bassLine(P.B, bassB, { lo: 38 })),
  kickB: pat("kick", 1, grid("x.....x.x.....x.")),
  clapB: pat("clap", 1, grid("....x.......x...")),
  shkB: pat("shaker", 1, grid("xgogxgogxgogxgog", { vel: 0.85 })),
  congaB: pat("conga", 8, cat(hand("................".repeat(7) + "....m.m.h.hhM.lL", congaP, 0.7))),
  // A2 (melody + glockenspiel answers + kalimba bed)
  a2Glock: pat("glock", 8, glA),
  a2Kal: pat("kalimba", 8, arp(P.A, kal, { n: 3, lo: 66, hi: 83, every: 2, dur: 3, vel: 0.3 })),
  a2Pizz: pat("pizz", 8, scaleVel(harmony(melA, P.A, D), 0.6)),
  // bridge
  brFlute: pat("flute", 8, melBr),
  brKal: pat("kalimba", 8, arp(P.br, kal, { n: 3, lo: 62, hi: 79, every: 2, dur: 3, vel: 0.5 })),
  brStr: pat("strings", 8, pad(P.br, { n: 3, lo: 52, hi: 69, vel: 0.55 })),
  brBass: pat("bass", 8, bassLine(P.br, [[0, "R", 8, 0.6], [8, "5", 8, 0.45]], { lo: 38 })),
  brPizz: pat("pizz", 8, arp(P.br, [0, null, 1, null, 2, null, 1, null], { n: 3, lo: 50, hi: 67, every: 2, dur: 2, vel: 0.45 })),
  brBuild: pat("conga", 8, hand("................".repeat(7) + "l.l.m.m.mmhhHHHH", congaP, 0.7)),
  brShk: pat("shaker", 8, grid("................".repeat(4) + "g...g...g...g...".repeat(3) + "g.g.g.g.ogogogog")),
  brKick: pat("kick", 8, grid("................".repeat(7) + "x.......x...x.x.", { vel: 0.8 })),
  // B2 (full: flute + pizzicato harmony a third below + glock answers)
  b2Pizz: pat("pizz", 8, scaleVel(harmony(melB, P.B, D), 0.65)),
  b2Glock: pat("glock", 8, glB),
  // tag
  tFlute: pat("flute", 4, melTag),
  tStrum: pat("guitar", 4, strum(P.tag, "D.DU.UDU", { n: 4, lo: 47, hi: 71, vel: 0.45 })),
  tBass: pat("bass", 4, bassLine(P.tag, bassA, { lo: 38 })),
  tKal: pat("kalimba", 4, arp(P.tag, kal, { n: 3, lo: 62, hi: 79, every: 2, dur: 3, vel: 0.4 })),
  tShk: pat("shaker", 4, grid("ogogogogogogogog".repeat(3) + "ogogogogxxxxXXXX")),
};

export default {
  id: "area1", title: "Sunlit Canopy", mood: "bright, hopeful acoustic-folk morning in a sunny forest; light and bouncy",
  bpm: 108, stepsPerBar: 16, swing: 0.1,
  master: { gain: 0.8, reverb: { seconds: 2.2, mix: 0.25, damp: 0.55 }, delay: { steps: 3, feedback: 0.28, tone: 3200 } },
  instruments: {
    flute: { type: "synth", wave: "triangle", env: { a: 0.045, d: 0.2, s: 0.85, r: 0.16 }, filter: { type: "lowpass", freq: 3400, q: 0.5 },
      vibrato: { rate: 5.2, depth: 11, delay: 0.25 }, breath: 0.28, gain: 0.3, pan: 0.05, reverb: 0.35, delay: 0.16 },
    guitar: { type: "pluck", wave: "triangle", tone: 2800, decay: 0.95, gain: 0.34, pan: -0.25, reverb: 0.22 },
    kalimba: { type: "fm", ratio: 3, index: 0.9, indexDecay: 0.08, env: { a: 0.002, d: 0.45, s: 0, r: 0.45 }, gain: 0.2, pan: 0.32, reverb: 0.35, delay: 0.25 },
    strings: { type: "synth", wave: "sawtooth", voices: 3, detune: 9, env: { a: 0.55, d: 0.6, s: 0.8, r: 0.6 }, filter: { type: "lowpass", freq: 1500, q: 0.5 },
      vibrato: { rate: 4.6, depth: 6, delay: 0.4 }, gain: 0.13, reverb: 0.5 },
    glock: { type: "fm", ratio: 3.5, index: 1.3, indexDecay: 0.22, env: { a: 0.001, d: 1.1, s: 0, r: 0.8 }, gain: 0.12, pan: 0.38, reverb: 0.4, delay: 0.22 },
    bass: { type: "pluck", wave: "triangle", tone: 750, decay: 0.75, gain: 0.5 },
    pizz: { type: "pluck", wave: "sawtooth", tone: 2400, decay: 0.32, gain: 0.2, pan: -0.38, reverb: 0.4 },
    kick: { type: "drum", kind: "kick", tune: -1, decay: 0.8, gain: 0.55 },
    rim: { type: "drum", kind: "rim", gain: 0.32, pan: 0.1, reverb: 0.15 },
    shaker: { type: "drum", kind: "shaker", gain: 0.3, pan: 0.3 },
    clap: { type: "drum", kind: "clap", gain: 0.3, pan: -0.05, reverb: 0.25 },
    conga: { type: "drum", kind: "conga", gain: 0.42, pan: -0.2, reverb: 0.15 },
  },
  patterns,
  sections: {
    intro: { bars: 4, tracks: ["inKal", "inStr", "inBass", "inFlute", "inShk"] },
    A: { bars: 8, tracks: ["aFlute", "aGtr", "aBass", "kickA", "rimA", { p: "shkA", vel: 0.8 }] },
    B: { bars: 8, tracks: ["bFlute", "bStrum", "bStr", "bBass", "kickB", "clapB", "shkB", "congaB"] },
    A2: { bars: 8, tracks: ["aFlute", "aGtr", "aBass", "a2Glock", "a2Kal", "a2Pizz", "kickA", "rimA", { p: "clapB", vel: 0.7 }, "shkA"] },
    bridge: { bars: 8, tracks: ["brFlute", "brKal", "brStr", "brBass", "brPizz", "brBuild", "brShk", "brKick"] },
    B2: { bars: 8, tracks: [{ p: "bFlute", vel: 1.05 }, "b2Pizz", "b2Glock", "bStrum", "bStr", "bBass", "kickB", "clapB", "shkB", { p: "rimA", vel: 0.8 }, "congaB"] },
    tag: { bars: 4, tracks: ["tFlute", "tStrum", "tBass", "tKal", "tShk", "kickA", "rimA"] },
  },
  arrangement: ["intro", "A", "B", "A2", "bridge", "B2", "tag"],
  loop: 1,
};
