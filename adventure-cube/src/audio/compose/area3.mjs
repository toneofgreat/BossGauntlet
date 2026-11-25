// area3.mjs - "Thunder Peaks" (Area 3, Storm Peaks). D minor (harmonic minor colour), 150 bpm.
// Stormy night summit: rain wash, tolling bells, a dark choir, relentless 16th-note strings, low brass stabs,
// a soaring saw-violin lead, galloping bass, taiko + kit. The climax lifts a semitone (Eb minor) and its final
// Bb chord drops straight back into D minor (VI-i) for B3 and the loop.
// Form: intro(4) A(8) B(8) A2(8) B2(8) bridge(8, half-time) climax(8, +1) B3(8) -> loop to A.
import { melBars, prog, pad, bassLine, arp, grid, pat, cat, scale, harmony, octave, scaleVel } from "./lib.mjs";

const P = {
  intro: prog(["Dm", "Eb/D", "Dm", "A"]),
  A: prog(["Dm", "Bb", "C", "A", "Dm", "Bb", "Gm", "A"]),
  B: prog(["Gm", "Dm", "Bb", "A", "Gm", "Dm", "Eb", "A"]),
  br: prog(["Bb", "F", "Gm", "Dm", "Bb", "F", "Eb", "A"]),
};
const Dh = scale("D", "harmonic");

const melA = melBars([
  "D5:2 A5:2 -:1 A5:1 G5:2 F5:2 E5:2 F5:2 D5:2",
  "F5:6 G5:2 F5:2 E5:2 D5:2 F5:2",
  "E5:2 C6:2 -:1 C6:1 Bb5:2 A5:2 G5:2 A5:2 E5:2",
  "C#5:8 E5:4 A5:4",
  "D6:2 A5:2 -:1 A5:1 G5:2 F5:2 E5:2 F5:2 A5:2",
  "Bb5:6 A5:2 G5:2 F5:2 D5:2 F5:2",
  "G5:4 A5:2 Bb5:2 D6:4 C6:2 Bb5:2",
  "A5:12 G5:2 E5:2",
], { vel: 0.85 });
const melB = melBars([
  "Bb5:4 A5:2 G5:2 D6:6 C6:2",
  "A5:4 F5:2 D5:2 A5:6 G5:2",
  "F5:4 G5:2 A5:2 Bb5:4 C6:2 D6:2",
  "C#6:8 A5:4 E5:4",
  "Bb5:4 A5:2 G5:2 D6:6 Eb6:2",
  "D6:4 C6:2 A5:2 F5:6 A5:2",
  "G5:4 Bb5:4 Eb6:4 D6:2 C6:2",
  "C#6:4 D6:2 E6:2 A5:8",
], { vel: 0.9 });
const melBr = melBars([
  "D5:8 F5:8", "C5:8 A4:8", "Bb4:8 D5:8", "A4:16",
  "D5:8 F5:4 Bb5:4", "A5:8 C6:8", "Bb5:8 G5:8", "A5:4 C#6:4 E6:8",
], { vel: 0.75 });
const bellsIntro = melBars(["D6:4 A5:4 F5:4 E5:4", "Eb6:4 Bb5:4 G5:4 D5:4", "D6:4 A5:4 F5:4 A5:4", "C#6:4 E6:4 A5:8"], { vel: 0.65 });

const ost = [0, 0, 2, 0, 1, 0, 2, 0, 0, 0, 2, 0, 1, 2, 1, 0];
const gallop = [[0, "R", 2, 0.95], [2, "R", 1, 0.5], [3, "R", 1, 0.6], [4, "8", 2, 0.75], [6, "R", 2, 0.6],
  [8, "R", 2, 0.9], [10, "R", 1, 0.5], [11, "R", 1, 0.6], [12, "8", 2, 0.75], [14, "5", 2, 0.65]];
// brass stab rhythm (3+3+4+2+4 feel)
const stabs = (Pr, vel) => {
  const hits = [[0, 1.5, 1], [3, 1.5, 0.8], [6, 2, 0.9], [10, 1.5, 0.8], [12, 3, 0.95]];
  const out = [];
  pad(Pr, { n: 3, lo: 50, hi: 65, vel }).forEach(([st, v, len]) => {
    for (let off = 0; off < len; off += 16) for (const [h, d, k] of hits) out.push([st + off + h, v, d, vel * k]);
  });
  return out;
};

const patterns = {
  // intro: rain, bells, choir, distant taiko
  rain: pat("rain", 4, [[0, "C4", 63, 0.8]]),
  inBells: pat("bells", 4, bellsIntro),
  inChoir: pat("choir", 4, pad(P.intro, { n: 3, lo: 50, hi: 69, vel: 0.55 })),
  inTaiko: pat("taiko", 4, grid("x...............|x.........x.....|x...............|x.....x...x.xxxx", { vel: 0.85 })),
  inBass: pat("bass", 4, bassLine(P.intro, [[0, "R", 15, 0.55]], { lo: 33 })),
  inOst: pat("ost", 4, arp(P.intro.slice(2), ost, { n: 3, lo: 50, hi: 69, every: 1, dur: 0.7, vel: 0.3 }).map((n) => [n[0], n[1], n[2], Math.min(0.7, 0.2 + (n[0] - 32) / 50)])),
  // A
  aLead: pat("lead", 8, melA),
  aOst: pat("ost", 8, arp(P.A, ost, { n: 3, lo: 50, hi: 69, every: 1, dur: 0.7, vel: 0.5, accent: [0, 3, 6, 10, 13] })),
  aBass: pat("bass", 8, bassLine(P.A, gallop, { lo: 33 })),
  kickA: pat("kick", 1, grid("x..x..x.x..x..x.")),
  snrA: pat("snare", 1, grid("....x.......x...")),
  hatA: pat("hat", 1, grid("x.o.x.o.x.o.x.o.", { vel: 0.85 })),
  crash1: pat("crash", 8, grid("x...............")),
  // B: brass stabs
  bLead: pat("lead", 8, melB),
  bOst: pat("ost", 8, arp(P.B, ost, { n: 3, lo: 50, hi: 69, every: 1, dur: 0.7, vel: 0.55, accent: [0, 3, 6, 10, 13] })),
  bBass: pat("bass", 8, bassLine(P.B, gallop, { lo: 33 })),
  bBrass: pat("brass", 8, stabs(P.B, 0.7)),
  kickB: pat("kick", 1, grid("x.xx..x.x.xx..x.")),
  snrB: pat("snare", 1, grid("....x.......x.gx")),
  hatB: pat("hat", 1, grid("xhohxhohxhohxhoh", { vel: 0.85 })),
  taikoB: pat("taiko", 2, grid("x.......x.......|x.......x...x.x.", { vel: 0.7 })),
  // A2: + brass stabs on the A chords, choir
  a2Brass: pat("brass", 8, stabs(P.A, 0.6)),
  a2Choir: pat("choir", 8, pad(P.A, { n: 3, lo: 55, hi: 72, vel: 0.45 })),
  // B2: brass harmony a third below the lead, choir
  b2Brass: pat("brass", 8, scaleVel(octave(harmony(melB, P.B, Dh), -1), 0.7)),
  b2Choir: pat("choir", 8, pad(P.B, { n: 3, lo: 55, hi: 72, vel: 0.5 })),
  // bridge: half time - choir, bells, brass solo, taiko, rain, then strings return and a snare roll
  brRain: pat("rain", 8, [[0, "C4", 127, 0.9]]),
  brBrass: pat("brass", 8, melBr),
  brBells: pat("bells", 8, octave(melBr, 1).map((n, i) => [n[0], n[1], n[2], 0.45]).filter((n, i) => i % 2 === 0)),
  brChoir: pat("choir", 8, pad(P.br, { n: 3, lo: 52, hi: 71, vel: 0.6 })),
  brBass: pat("bass", 8, bassLine(P.br, [[0, "R", 8, 0.6], [8, "R", 8, 0.45]], { lo: 33 })),
  brTaiko: pat("taiko", 8, grid("x.......x.....x.".repeat(6) + "x...x...x...x...x.x.x.x.xxxxxxxx", { vel: 0.8 })),
  brSnr: pat("snare", 8, grid("........x.......".repeat(6) + "g.g.g.g.gggggggg" + "xxxxxxxxxxxxxxxx", { rollTo: 1.5 })),
  brOst: pat("ost", 8, arp(P.br.slice(4), ost, { n: 3, lo: 50, hi: 69, every: 1, dur: 0.6, vel: 0.4 }).map((n) => [n[0], n[1], n[2], Math.min(0.75, 0.25 + (n[0] - 64) / 120)])),
  // climax (played +1): lead and brass in octaves, double-time kick
  cBrass: pat("brass", 8, scaleVel(octave(melA, -1), 0.75)),
  kickC: pat("kick", 1, grid("x.x.x.x.x.x.x.x.", { vel: 0.85 })),
  crashC: pat("crash", 2, grid("x...............|x.......x.......", { vel: 0.85 })),
};

export default {
  id: "area3", title: "Thunder Peaks", mood: "intense, driving, dangerous; stormy night summit with rain and lightning",
  bpm: 150, stepsPerBar: 16, swing: 0,
  master: { gain: 0.52, reverb: { seconds: 3.2, mix: 0.27, damp: 0.7 }, delay: { steps: 3, feedback: 0.32, tone: 2600 } },
  instruments: {
    lead: { type: "synth", wave: "sawtooth", voices: 2, detune: 8, env: { a: 0.02, d: 0.2, s: 0.8, r: 0.15 },
      filter: { type: "lowpass", freq: 2800, q: 1, env: 1400, d: 0.2 }, vibrato: { rate: 6, depth: 16, delay: 0.15 }, glide: 0.03,
      gain: 0.19, pan: 0.1, reverb: 0.3, delay: 0.2 },
    brass: { type: "synth", wave: "sawtooth", voices: 2, detune: 9, env: { a: 0.012, d: 0.25, s: 0.55, r: 0.2 },
      filter: { type: "lowpass", freq: 650, q: 1.2, env: 1700, d: 0.18 }, gain: 0.2, pan: -0.2, reverb: 0.35 },
    ost: { type: "synth", wave: "sawtooth", voices: 1, env: { a: 0.003, d: 0.09, s: 0.2, r: 0.06 },
      filter: { type: "lowpass", freq: 2300, q: 1.5, env: 1500, d: 0.06 }, gain: 0.16, pan: 0.3, reverb: 0.25 },
    choir: { type: "synth", wave: "sawtooth", voices: 2, detune: 11, env: { a: 0.8, d: 1, s: 0.9, r: 1.0 },
      filter: { type: "lowpass", freq: 1100, q: 0.8 }, vibrato: { rate: 4.5, depth: 8, delay: 0.5 }, gain: 0.14, reverb: 0.7 },
    bells: { type: "fm", ratio: 3.5, index: 2, indexDecay: 0.6, env: { a: 0.001, d: 2, s: 0, r: 1.5 }, gain: 0.12, pan: 0.3, reverb: 0.6, delay: 0.3 },
    bass: { type: "synth", wave: "sawtooth", sub: 0.6, env: { a: 0.003, d: 0.15, s: 0.5, r: 0.08 }, filter: { type: "lowpass", freq: 480, q: 2, env: 900, d: 0.1 }, gain: 0.27 },
    kick: { type: "drum", kind: "kick", tune: -1, gain: 0.62 },
    snare: { type: "drum", kind: "snare", gain: 0.4, reverb: 0.25 },
    hat: { type: "drum", kind: "hat", gain: 0.21, pan: 0.25 },
    taiko: { type: "drum", kind: "taiko", gain: 0.58, reverb: 0.35 },
    crash: { type: "drum", kind: "crash", gain: 0.24, pan: -0.25, reverb: 0.3 },
    rain: { type: "noise", color: "white", filter: { type: "bandpass", freq: 3200, q: 0.4 }, env: { a: 2.5, d: 1, s: 1, r: 3 }, gain: 0.07, reverb: 0.3 },
  },
  patterns,
  sections: {
    intro: { bars: 4, tracks: ["rain", "inBells", "inChoir", "inTaiko", "inBass", "inOst"] },
    A: { bars: 8, tracks: ["aLead", "aOst", "aBass", "kickA", "snrA", "hatA", "crash1"] },
    B: { bars: 8, tracks: ["bLead", "bOst", "bBass", "bBrass", "kickB", "snrB", "hatB", "taikoB", "crash1"] },
    A2: { bars: 8, tracks: [{ p: "aLead", vel: 1.05 }, "aOst", "aBass", "a2Brass", "a2Choir", "kickA", "snrA", "hatB", "taikoB", "crash1"] },
    B2: { bars: 8, tracks: [{ p: "bLead", vel: 1.05 }, "b2Brass", "b2Choir", "bOst", "bBass", "kickB", "snrB", "hatB", "taikoB", "crash1"] },
    bridge: { bars: 8, tracks: ["brRain", "brBrass", "brBells", "brChoir", "brBass", "brTaiko", "brSnr", "brOst"] },
    climax: { bars: 8, tracks: [
      { p: "aLead", transpose: 1, vel: 1.1 }, { p: "cBrass", transpose: 1 }, { p: "a2Choir", transpose: 1 }, { p: "aOst", transpose: 1, vel: 1.1 },
      { p: "aBass", transpose: 1 }, "kickC", "snrA", "hatB", "taikoB", "crashC"] },
    B3: { bars: 8, tracks: [{ p: "bLead", vel: 1.1 }, "b2Brass", "b2Choir", "bOst", "bBass", "bBrass", "kickB", "snrB", "hatB", "taikoB", "crash1"] },
  },
  arrangement: ["intro", "A", "B", "A2", "B2", "bridge", "climax", "B3"],
  loop: 1,
};
