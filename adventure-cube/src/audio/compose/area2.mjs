// area2.mjs - "Golden Ridge" (Area 2, Golden Highlands). E minor, 124 bpm, straight 16ths.
// Highland climb at golden hour: driving spiccato strings, a tin-whistle lead with Celtic turns, harp arpeggios,
// heroic horns, galloping bass, taiko and full kit. Builds section by section; the last section steps the
// key up a whole tone (F# minor) and cadences D->E (bVII-I) straight back into E minor for the loop.
// Form: intro(4) A(8) B(8) A2(8) bridge(8) B2(8) A3(8, +2 semitones) -> loop to A.
import { melBars, prog, pad, bassLine, arp, grid, hand, pat, cat, scaleVel, octave } from "./lib.mjs";

const P = {
  intro: prog(["Em", "C", "G", "D"]),
  A: prog(["Em", "C", "G", "D", "Em", "C", "D", "Em"]),
  B: prog(["C", "D", "Em", "Em", "C", "D", "B7", "B7"]),
  br: prog(["Am", "Em", "C", "D", "Am", "Em", "C", "B7"]),
  A3: prog(["Em", "C", "G", "D", "Em", "C", "D", "C"]),
};

const melA = [
  "E5:3 F#5:1 G5:2 B5:2 A5:3 G5:1 F#5:2 E5:2",
  "G5:4 E5:2 C5:2 E5:4 G5:2 A5:2",
  "B5:3 A5:1 G5:2 D5:2 G5:4 A5:2 B5:2",
  "A5:8 F#5:4 D5:4",
  "E5:3 F#5:1 G5:2 B5:2 E6:4 D6:2 B5:2",
  "C6:4 B5:2 G5:2 E5:4 G5:2 E5:2",
  "F#5:3 G5:1 A5:2 F#5:2 D5:4 E5:2 F#5:2",
];
const melAend = "E5:12 D5:2 B4:2";
const melA3end = "G5:8 E5:4 G5:4";
const melB = melBars([
  "G5:6 A5:2 G5:4 E5:4",
  "F#5:6 G5:2 A5:4 D6:4",
  "B5:8 A5:2 G5:2 F#5:2 G5:2",
  "E5:12 D5:2 E5:2",
  "G5:6 A5:2 B5:4 C6:4",
  "D6:6 C6:2 B5:4 A5:4",
  "B5:8 A5:4 F#5:4",
  "D#5:4 F#5:4 A5:4 B5:4",
], { vel: 0.88 });
const melBr = melBars([
  "E5:8 C5:4 A4:4", "B4:8 G4:4 E4:4", "G4:4 C5:4 E5:4 G5:4", "F#5:12 E5:2 D5:2",
  "E5:8 A5:8", "G5:6 F#5:2 E5:8", "E5:4 G5:4 C6:8", "B5:16",
], { vel: 0.75 });
const melIntro = melBars(["-:16", "-:16", "-:8 B4:2 D5:2 G5:2 A5:2", "A5:12 F#5:2 A5:2"], { vel: 0.55 });

const ost = [0, 0, 1, 0, 2, 0, 1, 0, 0, 0, 1, 0, 2, 1, 0, 1];
const harp = [0, 1, 2, 3, 4, 3, 2, 1];
const gallop = [[0, "R", 2, 0.95], [2, "R", 1, 0.5], [3, "R", 1, 0.6], [4, "8", 2, 0.75], [6, "R", 2, 0.6],
  [8, "R", 2, 0.9], [10, "R", 1, 0.5], [11, "R", 1, 0.6], [12, "8", 2, 0.75], [14, "5", 2, 0.65]];
const tomP = { h: "D3", m: "A2", l: "E2" };
const fill = (bars) => hand("................".repeat(bars - 1) + "........HhMmLlLL", tomP, 0.75);

const patterns = {
  // intro: harp + pad + far taiko, the whistle hints the motif
  inHarp: pat("harp", 4, arp(P.intro, harp, { n: 3, lo: 59, hi: 79, every: 2, dur: 4, vel: 0.5 })),
  inPad: pat("pad", 4, pad(P.intro, { n: 3, lo: 52, hi: 71, vel: 0.5 })),
  inTaiko: pat("taiko", 4, grid("x...............|x...............|x.......x.......|x...x...x.x.xxxx", { vel: 0.8 })),
  inBass: pat("bass", 4, bassLine(P.intro, [[0, "R", 15, 0.5]], { lo: 33 })),
  inLead: pat("whistle", 4, melIntro),
  inSpic: pat("spic", 4, cat(arp(P.intro.slice(3), ost, { n: 3, lo: 52, hi: 71, every: 1, dur: 0.8, vel: 0.35 }).map((n) => [n[0], n[1], n[2], Math.min(0.75, 0.25 + (n[0] - 48) / 30)]))),
  // A
  aLead: pat("whistle", 8, melBars([...melA, melAend])),
  aSpic: pat("spic", 8, arp(P.A, ost, { n: 3, lo: 52, hi: 71, every: 1, dur: 0.8, vel: 0.5, accent: [0, 3, 6, 8, 11, 14] })),
  aBass: pat("bass", 8, bassLine(P.A, gallop, { lo: 33 })),
  kickA: pat("kick", 1, grid("x.....x...x.....")),
  snrA: pat("snare", 1, grid("........x.......")),
  hatA: pat("hat", 1, grid("x.o.x.o.x.o.x.o.", { vel: 0.8 })),
  crash1: pat("crash", 8, grid("x...............")),
  // B
  bLead: pat("whistle", 8, melB),
  bSpic: pat("spic", 8, arp(P.B, ost, { n: 3, lo: 52, hi: 71, every: 1, dur: 0.8, vel: 0.58, accent: [0, 3, 6, 8, 11, 14] })),
  bBass: pat("bass", 8, bassLine(P.B, gallop, { lo: 33 })),
  bHorn: pat("horn", 8, pad(P.B, { n: 2, lo: 55, hi: 69, vel: 0.65 })),
  bPad: pat("pad", 8, pad(P.B, { n: 3, lo: 52, hi: 71, vel: 0.45 })),
  kickB: pat("kick", 1, grid("x..x..x...x..x..")),
  snrB: pat("snare", 1, grid("....x.......x...")),
  hatB: pat("hat", 1, grid("xhohxhohxhohxhoh", { vel: 0.8 })),
  tomB: pat("tom", 8, fill(8)),
  // A2: horn counter-line under the whistle, harp ripples
  a2Horn: pat("horn", 8, pad(P.A, { n: 2, lo: 52, hi: 67, vel: 0.55 })),
  a2Harp: pat("harp", 8, arp(P.A, harp, { n: 3, lo: 64, hi: 84, every: 2, dur: 4, vel: 0.35 })),
  a2Taiko: pat("taiko", 2, grid("x...............|x.......x.......", { vel: 0.6 })),
  // bridge: breakdown -> horn solo -> snare roll build
  brHorn: pat("horn", 8, melBr),
  brHarp: pat("harp", 8, arp(P.br, harp, { n: 3, lo: 59, hi: 79, every: 2, dur: 4, vel: 0.5 })),
  brPad: pat("pad", 8, pad(P.br, { n: 3, lo: 52, hi: 71, vel: 0.55 })),
  brBass: pat("bass", 8, bassLine(P.br, [[0, "R", 8, 0.6], [8, "R", 8, 0.45]], { lo: 33 })),
  brTaiko: pat("taiko", 8, grid("x.......x.......".repeat(4) + "x.......x...x...".repeat(2) + "x...x...x...x...x.x.x.x.xxxxxxxx", { vel: 0.75 })),
  brSpic: pat("spic", 8, cat(arp(P.br.slice(4), ost, { n: 3, lo: 52, hi: 71, every: 1, dur: 0.7, vel: 0.4 }))),
  brRoll: pat("snare", 8, grid("................".repeat(6) + "g.g.g.g.g.g.g.g.gggggggggggggggg", { rollTo: 1.6 })),
  brWhistle: pat("whistle", 8, melBars(["-:16", "-:16", "-:16", "-:16", "-:16", "-:16", "-:8 E6:2 D6:2 C6:2 D6:2", "B5:8 A5:4 F#5:4"], { vel: 0.6 })),
  // B2: everything, whistle doubled an octave down by the horn
  b2Horn: pat("horn", 8, scaleVel(octave(melB, -1), 0.65)),
  b2Harp: pat("harp", 8, arp(P.B, harp, { n: 3, lo: 64, hi: 84, every: 2, dur: 4, vel: 0.35 })),
  // A3 (played +2 semitones): triumphant
  a3Lead: pat("whistle", 8, melBars([...melA, melA3end], { vel: 0.9 })),
  a3Horn: pat("horn", 8, pad(P.A3, { n: 3, lo: 52, hi: 69, vel: 0.6 })),
  a3Spic: pat("spic", 8, arp(P.A3, ost, { n: 3, lo: 52, hi: 71, every: 1, dur: 0.8, vel: 0.6, accent: [0, 3, 6, 8, 11, 14] })),
  a3Bass: pat("bass", 8, bassLine(P.A3, gallop, { lo: 33 })),
  a3Harp: pat("harp", 8, arp(P.A3, harp, { n: 3, lo: 64, hi: 84, every: 2, dur: 4, vel: 0.35 })),
  a3Pad: pat("pad", 8, pad(P.A3, { n: 3, lo: 52, hi: 71, vel: 0.45 })),
  a3Tom: pat("tom", 8, hand("................".repeat(7) + "H.H.M.M.L.L.LLLL", tomP, 0.8)),
};

export default {
  id: "area2", title: "Golden Ridge", mood: "adventurous, climbing, misty highland cliffs at golden hour; building momentum",
  bpm: 124, stepsPerBar: 16, swing: 0,
  master: { gain: 0.6, reverb: { seconds: 2.8, mix: 0.27, damp: 0.6 }, delay: { steps: 3, feedback: 0.3, tone: 3000 } },
  instruments: {
    whistle: { type: "synth", wave: "triangle", env: { a: 0.03, d: 0.15, s: 0.85, r: 0.12 }, filter: { type: "lowpass", freq: 4200, q: 0.5 },
      vibrato: { rate: 5.6, depth: 13, delay: 0.3 }, breath: 0.3, glide: 0.025, gain: 0.27, pan: 0.08, reverb: 0.33, delay: 0.2 },
    horn: { type: "synth", wave: "sawtooth", voices: 2, detune: 6, env: { a: 0.09, d: 0.35, s: 0.8, r: 0.35 },
      filter: { type: "lowpass", freq: 850, q: 0.7, env: 650, d: 0.3 }, vibrato: { rate: 4.8, depth: 5, delay: 0.4 }, gain: 0.22, pan: -0.15, reverb: 0.45 },
    spic: { type: "synth", wave: "sawtooth", voices: 1, env: { a: 0.004, d: 0.12, s: 0.22, r: 0.08 },
      filter: { type: "lowpass", freq: 2000, q: 1, env: 1400, d: 0.08 }, gain: 0.16, pan: 0.25, reverb: 0.3 },
    pad: { type: "synth", wave: "sawtooth", voices: 3, detune: 10, env: { a: 0.7, d: 1, s: 0.8, r: 0.8 }, filter: { type: "lowpass", freq: 1300, q: 0.5 },
      vibrato: { rate: 4.3, depth: 6, delay: 0.5 }, gain: 0.12, reverb: 0.55 },
    harp: { type: "pluck", wave: "triangle", tone: 3600, decay: 1.2, gain: 0.22, pan: -0.35, reverb: 0.4, delay: 0.18 },
    bass: { type: "synth", wave: "sawtooth", sub: 0.5, env: { a: 0.004, d: 0.2, s: 0.6, r: 0.09 }, filter: { type: "lowpass", freq: 520, q: 1.4, env: 600, d: 0.12 }, gain: 0.27 },
    kick: { type: "drum", kind: "kick", gain: 0.6 },
    snare: { type: "drum", kind: "snare", gain: 0.36, pan: 0.05, reverb: 0.22 },
    hat: { type: "drum", kind: "hat", gain: 0.22, pan: 0.28 },
    taiko: { type: "drum", kind: "taiko", gain: 0.55, reverb: 0.35 },
    crash: { type: "drum", kind: "crash", gain: 0.24, pan: -0.25, reverb: 0.25 },
    tom: { type: "drum", kind: "tom", gain: 0.42, pan: -0.1, reverb: 0.2 },
  },
  patterns,
  sections: {
    intro: { bars: 4, tracks: ["inHarp", "inPad", "inTaiko", "inBass", "inLead", "inSpic"] },
    A: { bars: 8, tracks: ["aLead", "aSpic", "aBass", "kickA", "snrA", "hatA", { p: "a2Taiko", vel: 0.7 }] },
    B: { bars: 8, tracks: ["bLead", "bSpic", "bBass", "bHorn", "bPad", "kickB", "snrB", "hatB", "tomB", "crash1"] },
    A2: { bars: 8, tracks: ["aLead", "a2Horn", "a2Harp", "aSpic", "aBass", "kickB", "snrB", "hatA", "a2Taiko", "crash1"] },
    bridge: { bars: 8, tracks: ["brHorn", "brHarp", "brPad", "brBass", "brTaiko", "brSpic", "brRoll", "brWhistle"] },
    B2: { bars: 8, tracks: [{ p: "bLead", vel: 1.05 }, "b2Horn", "b2Harp", "bSpic", "bBass", "bPad", "kickB", "snrB", "hatB", "tomB", "crash1", "a2Taiko"] },
    A3: { bars: 8, tracks: [
      { p: "a3Lead", transpose: 2, vel: 1.05 }, { p: "a3Horn", transpose: 2 }, { p: "a3Spic", transpose: 2 }, { p: "a3Bass", transpose: 2 },
      { p: "a3Harp", transpose: 2 }, { p: "a3Pad", transpose: 2 }, "kickB", "snrB", "hatB", "crash1", "a2Taiko", "a3Tom"] },
  },
  arrangement: ["intro", "A", "B", "A2", "bridge", "B2", "A3"],
  loop: 1,
};
