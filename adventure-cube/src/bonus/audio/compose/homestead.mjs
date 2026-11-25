// homestead.mjs - BONUS_AUDIO's composer (authoring tool, Node only; never imported by the game).
// Builds the two original Wildwood Homestead songs and writes them as PURE DATA (CONTRACT.md 6.2) into
// src/bonus/audio/songs/<id>.js:
//   homestead_day   "Wildwood Homestead"  D major, 100 bpm 4/4, warm folk: fingerpicked guitar, fiddle, wooden flute,
//                                         mandolin, accordion, upright bass, soft kit, glockenspiel. Loop ~125 s.
//   homestead_night "Fireflies Over the Roof"  G major lullaby/nocturne, 76 bpm 3/4: music box, harp, flute, cello,
//                                         warm pad, sub bass, brushed shaker. Loop ~104 s.
// Run:  node src/bonus/audio/compose/homestead.mjs      (deterministic: same output every run)
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { noteToMidi, validateSong } from "../../../audio/format.js";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "songs");
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const nm = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);
const M = (p) => (typeof p === "number" ? p : noteToMidi(p));
const r3 = (x) => Math.round(x * 1000) / 1000;
const cv = (v) => Math.max(0.05, Math.min(1, r3(v)));
let seed = 1;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const hv = (v, a = 0.04) => cv(v + (rnd() * 2 - 1) * a);
const up = (p, s) => nm(M(p) + s);

// seq(spb, "A4:4 F#4:2 r:2 D4+F#4:8:0.6 | ...") -> notes. "|" separates bars (each must sum to spb).
function seq(spb, str, { vel = 0.8, legato = 0.95, hum = 0.04, shift = 0 } = {}) {
  const out = [];
  let t = 0;
  str.split("|").forEach((bar, bi) => {
    let bt = 0;
    for (const tok of bar.trim().split(/\s+/).filter(Boolean)) {
      const [p, d, v] = tok.split(":");
      const dur = parseFloat(d);
      if (!(dur > 0)) throw new Error("bad token " + tok);
      if (p !== "r") {
        const pitch = p.includes("+") ? p.split("+").map((q) => nm(M(q) + shift)) : nm(M(p) + shift);
        // gentle phrase shaping: downbeats a touch stronger
        const acc = (t % spb === 0 ? 0.06 : 0) + (t % (spb / 2) === 0 ? 0.03 : 0);
        out.push([r3(t), pitch, r3(Math.max(0.5, dur * legato)), hv((v ? +v : vel) + acc, hum)]);
      }
      t += dur; bt += dur;
    }
    if (Math.abs(bt - spb) > 1e-6) throw new Error(`bar ${bi} has ${bt}/${spb} steps: "${bar.trim()}"`);
  });
  return out;
}
const P = (inst, bars, notes, spb) => {
  for (const n of notes) if (n[0] >= bars * spb || n[0] < 0) throw new Error(`${inst}: note at ${n[0]} outside ${bars} bars`);
  if (notes.length > 512) throw new Error(`${inst}: too many notes`);
  return { inst, bars, notes: notes.sort((a, b) => a[0] - b[0]) };
};
// bars of a progression: "D", "Em/A" (half bar each) -> list of [chordName, startStepInBar, lenSteps]
const halves = (prog, spb) => prog.flatMap((b, i) => {
  if (!b.includes("/")) return [[b, i * spb, spb]];
  const [x, y] = b.split("/"), h = spb / 2;
  return [[x, i * spb, h], [y, i * spb + h, h]];
});

// =====================================================================================================
// 1. WILDWOOD HOMESTEAD (day)
// =====================================================================================================
function daySong() {
  seed = 2024;
  const spb = 16;
  const C = {
    D: { r: "D2", f: "A2", v: ["D3", "A3", "D4", "F#4"] },
    G: { r: "G2", f: "D3", v: ["G3", "B3", "D4", "G4"] },
    Bm: { r: "B2", f: "F#2", v: ["F#3", "B3", "D4", "F#4"] },
    A: { r: "A2", f: "E2", v: ["E3", "A3", "C#4", "E4"] },
    Asus: { r: "A2", f: "E2", v: ["E3", "A3", "D4", "E4"] },
    Em: { r: "E2", f: "B2", v: ["E3", "G3", "B3", "E4"] },
    DF: { r: "F#2", f: "A2", v: ["F#3", "A3", "D4", "F#4"] },
    Fm: { r: "F#2", f: "C#3", v: ["F#3", "A3", "C#4", "F#4"] },
  };
  const progIn = ["D", "G", "D", "Asus/A"];
  const progA = ["D", "G", "Bm", "A", "D", "G", "Em/A", "D"];
  const progB = ["G", "DF", "Em", "A", "G", "D", "Em", "Asus/A"];
  const progBr = ["Bm", "G", "D", "A", "Bm", "G", "Em", "Asus/A"];
  const progT = ["G", "D", "Em/A", "D"];

  // travis picking: thumb alternates root/fifth on the beat, fingers on the off-beats
  const pick = (prog, scale = 1) => {
    const out = [];
    for (const [ch, s0, len] of halves(prog, spb)) {
      const c = C[ch], seqv = [[0, c.v[0], 0.62], [2, c.v[3], 0.4], [4, c.v[1], 0.5], [6, c.v[2], 0.42], [8, c.v[0], 0.56], [10, c.v[3], 0.4], [12, c.v[1], 0.48], [14, c.v[2], 0.4]];
      for (const [st, p, v] of seqv) if (st < len) out.push([s0 + st, p, 3, hv(v * scale)]);
    }
    return out;
  };
  const bass = (prog, vel = 0.8) => {
    const out = [], hs = halves(prog, spb);
    hs.forEach(([ch, s0, len], i) => {
      const c = C[ch];
      out.push([s0, c.r, len === spb ? 7 : 6, hv(vel)]);
      if (len === spb) out.push([s0 + 8, c.f, 5, hv(vel * 0.78)]);
      // walk-up into the next chord on the last 8th of each bar
      if ((s0 + len) % spb === 0) {
        const nx = C[hs[(i + 1) % hs.length][0]];
        out.push([s0 + len - 2, nm(M(nx.r) - 2), 2, hv(vel * 0.55)]);
      }
    });
    return out;
  };
  const pad = (prog, vel = 0.5) => halves(prog, spb).map(([ch, s0, len]) => [s0, C[ch].v.slice(1), len - 0.3, hv(vel, 0.02)]);
  const chops = (prog) => {
    const out = [];
    for (const [ch, s0, len] of halves(prog, spb)) for (const st of [4, 12]) if (st < len) {
      out.push([s0 + st, [up(C[ch].v[2], 12), up(C[ch].v[3], 12)], 1.2, hv(0.36)]);
    }
    return out;
  };
  // mandolin tremolo-ish arpeggio in 16ths for the bridge
  const mandoArp = (prog) => {
    const out = [];
    for (const [ch, s0, len] of halves(prog, spb)) {
      const tones = [C[ch].v[1], C[ch].v[2], C[ch].v[3], up(C[ch].v[2], 12)];
      for (let s = 0; s < len; s += 2) out.push([s0 + s, up(tones[(s / 2) % 4], 12), 1.6, hv(s % 4 ? 0.26 : 0.36)]);
    }
    return out;
  };
  const descant = (prog, vel = 0.42) => {
    const out = [];
    for (const [ch, s0, len] of halves(prog, spb)) {
      out.push([s0, up(C[ch].v[3], 12), len >= 16 ? 7.5 : len - 0.5, hv(vel)]);
      if (len >= 16) out.push([s0 + 8, up(C[ch].v[2], 12), 7.5, hv(vel * 0.9)]);
    }
    return out;
  };
  const fiddleCounter = (prog, vel = 0.4) => halves(prog, spb).map(([ch, s0, len]) => [s0, up(C[ch].v[3], 0), len - 0.5, hv(vel)]);
  const glock = (prog, vel = 0.32) => {
    const out = [];
    halves(prog, spb).forEach(([ch, s0, len], i) => {
      if (len < spb) return;
      out.push([s0, up(C[ch].v[3], 24), 4, hv(vel)]);
      if (i % 2) out.push([s0 + 10, up(C[ch].v[2], 24), 4, hv(vel * 0.75)]);
    });
    return out;
  };
  const grid = (str, bars, scale = 1, pitch = "C4") => {
    const s = str.replace(/\s/g, ""), out = [], V = { X: 1, x: 0.86, o: 0.6, "-": 0.38, ",": 0.22 };
    if (s.length !== spb) throw new Error("grid must be one bar");
    for (let b = 0; b < bars; b++) [...s].forEach((c, i) => { if (V[c]) out.push([b * spb + i, pitch, 1, hv(V[c] * scale, 0.06)]); });
    return out;
  };

  const melA = seq(spb, [
    "A4:4 F#4:2 A4:2 D5:6 C#5:2", "B4:4 G4:2 B4:2 D5:4 B4:4", "F#4:3 A4:1 B4:4 D5:4 C#5:2 B4:2", "A4:12 r:2 E4:2",
    "F#4:4 A4:2 D5:2 F#5:6 E5:2", "D5:4 B4:2 D5:2 G5:4 F#5:2 E5:2", "E5:4 D5:2 B4:2 C#5:4 E5:4", "D5:12 r:4",
  ].join("|"), { vel: 0.72 });
  // second time through: same tune, an answering ending
  const melA2 = seq(spb, [
    "A4:4 F#4:2 A4:2 D5:6 E5:2", "F#5:4 D5:2 B4:2 D5:4 B4:4", "F#4:3 A4:1 B4:4 D5:4 F#5:2 E5:2", "E5:8 C#5:4 A4:4",
    "F#4:4 A4:2 D5:2 F#5:6 G5:2", "A5:4 G5:2 F#5:2 G5:4 B4:2 D5:2", "E5:2 F#5:2 E5:2 D5:2 C#5:4 A4:4", "D5:12 r:4",
  ].join("|"), { vel: 0.72 });
  const melB = seq(spb, [
    "B4:2 D5:2 G5:6 F#5:2 E5:2 D5:2", "F#5:6 E5:2 D5:4 A4:4", "G5:4 F#5:2 E5:2 B4:4 E5:4", "C#5:2 D5:2 E5:8 r:4",
    "B4:2 D5:2 G5:4 A5:4 B5:4", "A5:6 F#5:2 D5:4 F#5:4", "G5:4 F#5:4 E5:4 D5:4", "E5:12 C#5:4",
  ].join("|"), { vel: 0.66 });
  const melBr = seq(spb, [
    "F#4:8 B4:8", "D5:8 B4:8", "A4:8 F#4:4 A4:4", "E4:12 r:4",
    "F#4:4 B4:4 D5:4 F#5:4", "G5:8 D5:8", "E5:4 G5:4 B5:4 G5:4", "A5:8 G5:4 E5:4",
  ].join("|"), { vel: 0.6, legato: 0.98 });
  const fluteHint = seq(spb, ["A5:4 F#5:2 A5:2 D6:8", "r:16", "F#5:4 E5:2 D5:2 A5:8", "r:8 E5:4 C#5:4"].join("|"), { vel: 0.4 });
  const melT = seq(spb, ["B4:4 D5:4 G5:8", "F#5:4 E5:2 D5:2 A4:8", "B4:4 E5:4 C#5:4 E5:4", "D5:16"].join("|"), { vel: 0.55 });

  const song = {
    id: "homestead_day", title: "Wildwood Homestead",
    mood: "calm, homey, adventurous folk: fingerpicked guitar, fiddle and wooden flute over a gentle stomp",
    bpm: 100, stepsPerBar: 16, swing: 0.12,
    master: { gain: 0.9, reverb: { seconds: 2.3, mix: 0.24, damp: 0.62 }, delay: { steps: 3, feedback: 0.26, tone: 3000 } },
    instruments: {
      guitar: { type: "pluck", wave: "sawtooth", tone: 2600, decay: 0.75, gain: 0.5, pan: -0.24, reverb: 0.28 },
      mando: { type: "pluck", wave: "square", tone: 4200, decay: 0.32, gain: 0.34, pan: 0.32, reverb: 0.3, delay: 0.12 },
      fiddle: { type: "synth", wave: "sawtooth", voices: 2, detune: 6, env: { a: 0.06, d: 0.2, s: 0.82, r: 0.22 }, filter: { type: "lowpass", freq: 2300, q: 0.9, env: 500 }, vibrato: { rate: 5.4, depth: 16, delay: 0.25 }, glide: 0.02, gain: 0.2, pan: 0.12, reverb: 0.36, delay: 0.12 },
      flute: { type: "synth", wave: "sine", env: { a: 0.05, d: 0.15, s: 0.85, r: 0.2 }, vibrato: { rate: 5.2, depth: 12, delay: 0.3 }, breath: 0.25, glide: 0.012, gain: 0.26, pan: -0.06, reverb: 0.42, delay: 0.16 },
      accord: { type: "synth", wave: "sawtooth", voices: 2, detune: 9, env: { a: 0.35, d: 0.4, s: 0.78, r: 0.6 }, filter: { type: "lowpass", freq: 1200, q: 0.5 }, gain: 0.07, pan: 0.18, reverb: 0.45 },
      bass: { type: "synth", wave: "triangle", env: { a: 0.005, d: 0.35, s: 0.4, r: 0.12 }, filter: { type: "lowpass", freq: 850, q: 0.7, env: 500 }, sub: 0.3, gain: 0.44 },
      glock: { type: "fm", ratio: 3.5, index: 1.4, indexDecay: 0.25, env: { a: 0.002, d: 0.9, s: 0, r: 0.6 }, gain: 0.12, pan: 0.36, reverb: 0.5, delay: 0.2 },
      kick: { type: "drum", kind: "kick", gain: 0.34, decay: 0.8 },
      rim: { type: "drum", kind: "rim", gain: 0.2, pan: -0.12, reverb: 0.25 },
      shaker: { type: "drum", kind: "shaker", gain: 0.26, pan: 0.3 },
      block: { type: "drum", kind: "woodblock", gain: 0.2, pan: -0.36, reverb: 0.3 },
      crash: { type: "drum", kind: "crash", gain: 0.12, pan: 0.2, reverb: 0.4, decay: 0.8 },
    },
    patterns: {
      gtrIn: P("guitar", 4, pick(progIn, 0.85), spb),
      gtrA: P("guitar", 8, pick(progA), spb),
      gtrB: P("guitar", 8, pick(progB), spb),
      gtrBr: P("guitar", 8, pick(progBr, 0.8), spb),
      gtrT: P("guitar", 4, pick(progT), spb),
      bassA: P("bass", 8, bass(progA), spb),
      bassB: P("bass", 8, bass(progB), spb),
      bassBr: P("bass", 8, halves(progBr, spb).map(([ch, s0, len]) => [s0, C[ch].r, len - 0.5, hv(0.62)]), spb),
      bassT: P("bass", 4, bass(progT), spb),
      padIn: P("accord", 4, pad(progIn, 0.4), spb),
      padA: P("accord", 8, pad(progA, 0.45), spb),
      padB: P("accord", 8, pad(progB, 0.55), spb),
      padBr: P("accord", 8, pad(progBr, 0.6), spb),
      padT: P("accord", 4, pad(progT, 0.5), spb),
      chopA: P("mando", 8, chops(progA), spb),
      chopB: P("mando", 8, chops(progB), spb),
      arpBr: P("mando", 8, mandoArp(progBr), spb),
      fidA: P("fiddle", 8, melA, spb),
      fidA2: P("fiddle", 8, melA2, spb),
      fidBc: P("fiddle", 8, fiddleCounter(progB), spb),
      fidBr: P("fiddle", 8, melBr, spb),
      fluHint: P("flute", 4, fluteHint, spb),
      fluDesc: P("flute", 8, descant(progA), spb),
      fluB: P("flute", 8, melB, spb),
      fluA2: P("flute", 8, melA2.map((n) => [n[0], up(n[1], 12), n[2], cv(n[3] * 0.62)]), spb),
      fluT: P("flute", 4, melT, spb),
      glA: P("glock", 8, glock(progA), spb),
      glB: P("glock", 8, glock(progB, 0.36), spb),
      glBr: P("glock", 8, seq(spb, ["B5:8 F#5:8", "D6:8 B5:8", "A5:8 F#5:8", "E5:16", "B5:4 D6:4 F#6:8", "G6:8 D6:8", "E6:8 B5:8", "A5:8 C#6:8"].join("|"), { vel: 0.26 }), spb),
      glT: P("glock", 4, seq(spb, ["D6:8 B5:8", "A5:16", "B5:8 C#6:8", "D6:16"].join("|"), { vel: 0.3 }), spb),
      kickA: P("kick", 1, grid("x.......o.......", 1), spb),
      kickB: P("kick", 1, grid("x.......x.o.....", 1), spb),
      kickBr: P("kick", 2, [[0, "C4", 1, 0.5], [16, "C4", 1, 0.4]], spb),
      rimA: P("rim", 1, grid("....x.......x...", 1), spb),
      shkA: P("shaker", 1, grid("-,o,-,o,-,o,-,o,", 1), spb),
      shkB: P("shaker", 1, grid("o,x,o,x,o,x,o,xo", 1), spb),
      shkBr: P("shaker", 1, grid(",.-.,.-.,.-.,.-.", 1), spb),
      blkA: P("block", 2, [[6, 74, 1, 0.4], [14, 79, 1, 0.3], [22, 74, 1, 0.38], [27, 79, 1, 0.28], [30, 81, 1, 0.32]], spb),
      crashOn: P("crash", 8, [[0, "C4", 1, 0.7]], spb),
      fill: P("block", 4, [[56, 72, 1, 0.42], [58, 74, 1, 0.46], [60, 77, 1, 0.5], [62, 79, 1, 0.56]], spb),
    },
    sections: {
      intro: { bars: 4, tracks: ["gtrIn", "padIn", "fluHint", { p: "shkBr", vel: 0.7 }] },
      A: { bars: 8, tracks: ["gtrA", "bassA", "padA", "fidA", "kickA", "rimA", "shkA"] },
      A2: { bars: 8, tracks: ["gtrA", "bassA", { p: "padA", vel: 0.8 }, "fidA2", "chopA", { p: "fluDesc", vel: 0.85 }, "kickA", "rimA", "shkA", "blkA", "glA"] },
      B: { bars: 8, tracks: ["gtrB", "bassB", "padB", "fluB", "fidBc", "chopB", "kickB", "rimA", "shkB", "glB", "crashOn"] },
      bridge: { bars: 8, tracks: ["gtrBr", "bassBr", "padBr", "arpBr", "fidBr", "glBr", "shkBr", "kickBr"] },
      A3: { bars: 8, tracks: ["gtrA", "bassA", "padA", "fidA2", { p: "fluA2", vel: 0.9 }, "chopA", "kickB", "rimA", "shkB", "blkA", "glA", "crashOn"] },
      B2: { bars: 8, tracks: ["gtrB", "bassB", { p: "padB", vel: 0.85 }, "fluB", { p: "fidBc", vel: 1.1 }, "chopB", "kickA", "rimA", "shkA", "glB"] },
      turn: { bars: 4, tracks: ["gtrT", "bassT", "padT", "fluT", "glT", { p: "shkBr", vel: 0.8 }, { p: "fill", vel: 0.9 }] },
    },
    arrangement: ["intro", "A", "A2", "B", "bridge", "A3", "B2", "turn"],
    loop: 1,
  };
  return song;
}

// =====================================================================================================
// 2. FIREFLIES OVER THE ROOF (night) - 3/4 lullaby
// =====================================================================================================
function nightSong() {
  seed = 777;
  const spb = 12;
  const C = {
    G: { r: "G2", v: ["G3", "B3", "D4", "G4"] },
    Em: { r: "E2", v: ["E3", "G3", "B3", "E4"] },
    C: { r: "C2", v: ["C3", "G3", "C4", "E4"] },
    D: { r: "D2", v: ["D3", "A3", "D4", "F#4"] },
    Am: { r: "A2", v: ["A3", "C4", "E4", "A4"] },
    GB: { r: "B1", v: ["B2", "G3", "D4", "G4"] },
    Bm: { r: "B1", v: ["F#3", "B3", "D4", "F#4"] },
    D7: { r: "D2", v: ["D3", "A3", "C4", "F#4"] },
  };
  const progIn = ["G", "Em", "C", "D"];
  const progA = ["G", "Em", "C", "D", "G", "Em", "Am/D7", "G"];
  const progB = ["C", "GB", "Am", "Em", "C", "G", "Am", "D7"];
  const progBr = ["Em", "Bm", "C", "G", "Am", "Em", "C", "D"];
  const progO = ["C", "G", "Am/D", "G"];
  // harp: rolling eighth-note arpeggio, root - fifth - tenth - fifth - octave - tenth
  const harp = (prog, scale = 1) => {
    const out = [];
    for (const [ch, s0, len] of halves(prog, spb)) {
      const v = C[ch].v, line = [v[0], v[1], v[2], v[3], v[2], v[1]];
      for (let s = 0, k = 0; s < len; s += 2, k++) out.push([s0 + s, line[k % 6], 4, hv((k === 0 ? 0.55 : 0.38) * scale)]);
    }
    return out;
  };
  const pad = (prog, vel) => halves(prog, spb).map(([ch, s0, len]) => [s0, C[ch].v.slice(1), len - 0.3, hv(vel, 0.02)]);
  const bass = (prog, vel = 0.6) => halves(prog, spb).map(([ch, s0, len]) => [s0, C[ch].r, len - 0.5, hv(vel)]);
  const cello = (prog, vel = 0.45) => {
    const out = [];
    for (const [ch, s0, len] of halves(prog, spb)) {
      out.push([s0, up(C[ch].v[0], 0), len >= 12 ? 7.5 : len - 0.4, hv(vel)]);
      if (len >= 12) out.push([s0 + 8, up(C[ch].v[1], -12), 3.6, hv(vel * 0.7)]);
    }
    return out;
  };
  const melA = seq(spb, ["D5:6 B4:3 D5:3", "E5:6 G5:3 E5:3", "E5:4 D5:4 C5:4", "A4:9 r:3",
    "B4:6 D5:3 G5:3", "G5:4 F#5:4 E5:4", "C5:6 A4:3 F#5:3", "G5:9 r:3"].join("|"), { vel: 0.62 });
  const melA3 = seq(spb, ["D5:6 B4:3 D5:3", "E5:6 G5:3 B5:3", "A5:4 G5:4 E5:4", "D5:9 r:3",
    "B4:6 D5:3 G5:3", "B5:4 A5:4 G5:4", "E5:6 C5:3 F#5:3", "G5:9 r:3"].join("|"), { vel: 0.6 });
  const melB = seq(spb, ["E5:9 G5:3", "D5:9 B4:3", "C5:6 E5:6", "B4:12",
    "E5:6 G5:6", "A5:6 G5:3 D5:3", "E5:6 C5:6", "D5:9 F#4:3"].join("|"), { vel: 0.5, legato: 0.98 });
  const melBr = seq(spb, ["B3:12", "D4:6 F#4:6", "E4:12", "D4:6 B3:6",
    "C4:6 E4:6", "G4:6 B4:6", "A4:6 G4:3 E4:3", "F#4:9 A4:3"].join("|"), { vel: 0.5, legato: 0.98 });
  const boxB = seq(spb, ["r:6 G5:3 E5:3", "r:6 D5:3 G5:3", "r:6 A5:3 E5:3", "r:6 G5:3 B5:3",
    "r:6 C6:3 G5:3", "r:6 B5:3 D6:3", "r:6 C6:3 A5:3", "r:6 F#5:3 A5:3"].join("|"), { vel: 0.34 });
  const intro = seq(spb, ["r:12", "r:12", "G5:6 E5:6", "D5:9 r:3"].join("|"), { vel: 0.4 });
  const outro = seq(spb, ["E5:6 G5:6", "D5:12", "C5:6 A4:3 F#4:3", "G4:12"].join("|"), { vel: 0.45 });
  const grid = (str, bars, scale = 1) => {
    const s = str.replace(/\s/g, ""), out = [], V = { x: 0.8, o: 0.55, "-": 0.36, ",": 0.2 };
    for (let b = 0; b < bars; b++) [...s].forEach((c, i) => { if (V[c]) out.push([b * spb + i, "C4", 1, hv(V[c] * scale, 0.06)]); });
    return out;
  };

  return {
    id: "homestead_night", title: "Fireflies Over the Roof",
    mood: "calm nocturne lullaby: music box and harp under the stars, a cello humming by the fire",
    bpm: 76, stepsPerBar: 12, swing: 0,
    master: { gain: 0.95, reverb: { seconds: 3.2, mix: 0.3, damp: 0.66 }, delay: { steps: 3, feedback: 0.32, tone: 2600 } },
    instruments: {
      box: { type: "fm", ratio: 3, index: 1.1, indexDecay: 0.35, env: { a: 0.002, d: 1.6, s: 0, r: 1 }, gain: 0.24, pan: 0.16, reverb: 0.55, delay: 0.28 },
      harp: { type: "pluck", wave: "triangle", tone: 1900, decay: 1.3, gain: 0.5, pan: -0.22, reverb: 0.45 },
      flute: { type: "synth", wave: "sine", env: { a: 0.12, d: 0.2, s: 0.85, r: 0.5 }, vibrato: { rate: 4.8, depth: 10, delay: 0.4 }, breath: 0.2, glide: 0.02, gain: 0.24, pan: 0.05, reverb: 0.55, delay: 0.2 },
      cello: { type: "synth", wave: "sawtooth", voices: 2, detune: 5, env: { a: 0.25, d: 0.3, s: 0.8, r: 0.6 }, filter: { type: "lowpass", freq: 900, q: 0.7 }, vibrato: { rate: 4.6, depth: 14, delay: 0.35 }, gain: 0.2, pan: -0.08, reverb: 0.45 },
      pad: { type: "synth", wave: "triangle", voices: 2, detune: 8, env: { a: 1.2, d: 0.8, s: 0.8, r: 1.6 }, filter: { type: "lowpass", freq: 1400, q: 0.4 }, gain: 0.11, reverb: 0.6 },
      bass: { type: "synth", wave: "sine", env: { a: 0.02, d: 0.8, s: 0.55, r: 0.5 }, sub: 0.15, gain: 0.4 },
      shaker: { type: "drum", kind: "shaker", gain: 0.13, pan: 0.32, reverb: 0.3 },
      tick: { type: "drum", kind: "woodblock", gain: 0.1, pan: -0.4, reverb: 0.5 },
    },
    patterns: {
      harpIn: P("harp", 4, harp(progIn, 0.85), spb),
      harpA: P("harp", 8, harp(progA), spb),
      harpB: P("harp", 8, harp(progB), spb),
      harpBr: P("harp", 8, halves(progBr, spb).flatMap(([ch, s0, len]) => [[s0, C[ch].v[0], 6, hv(0.45)], [s0 + 4, C[ch].v[2], 6, hv(0.3)], [s0 + 8, C[ch].v[3], 6, hv(0.28)]].filter((n) => n[0] < s0 + len)), spb),
      harpO: P("harp", 4, harp(progO, 0.8), spb),
      boxIn: P("box", 4, intro, spb),
      boxA: P("box", 8, melA, spb),
      boxA3: P("box", 8, melA3, spb),
      boxB: P("box", 8, boxB, spb),
      boxO: P("box", 4, outro, spb),
      fluB: P("flute", 8, melB, spb),
      fluA2: P("flute", 8, halves(progA, spb).map(([ch, s0, len]) => [s0, up(C[ch].v[3], 12), len - 0.5, hv(0.32)]), spb),
      fluA3: P("flute", 8, melA3.map((n) => [n[0], up(n[1], -12), n[2], cv(n[3] * 0.7)]), spb),
      celA: P("cello", 8, cello(progA), spb),
      celBr: P("cello", 8, melBr, spb),
      celB: P("cello", 8, cello(progB, 0.38), spb),
      padIn: P("pad", 4, pad(progIn, 0.4), spb),
      padA: P("pad", 8, pad(progA, 0.45), spb),
      padB: P("pad", 8, pad(progB, 0.5), spb),
      padBr: P("pad", 8, pad(progBr, 0.6), spb),
      padO: P("pad", 4, pad(progO, 0.45), spb),
      bassA: P("bass", 8, bass(progA), spb),
      bassB: P("bass", 8, bass(progB), spb),
      bassBr: P("bass", 8, bass(progBr, 0.5), spb),
      bassO: P("bass", 4, bass(progO, 0.5), spb),
      shk: P("shaker", 1, grid("o.,.-.o.,.-.".slice(0, 12), 1), spb),
      tick: P("tick", 2, [[0, 79, 1, 0.4], [18, 84, 1, 0.3]], spb),
    },
    sections: {
      intro: { bars: 4, tracks: ["harpIn", "padIn", "boxIn"] },
      A: { bars: 8, tracks: ["harpA", "padA", "boxA", "bassA"] },
      A2: { bars: 8, tracks: ["harpA", "padA", "boxA", "bassA", "fluA2", "celA", "shk"] },
      B: { bars: 8, tracks: ["harpB", "padB", "fluB", "boxB", "bassB", "celB", "shk", "tick"] },
      bridge: { bars: 8, tracks: ["harpBr", "padBr", "celBr", "bassBr"] },
      A3: { bars: 8, tracks: ["harpA", "padA", "boxA3", "fluA3", "bassA", "shk", "tick"] },
      outro: { bars: 4, tracks: ["harpO", "padO", "boxO", "bassO"] },
    },
    arrangement: ["intro", "A", "A2", "B", "bridge", "A3", "outro"],
    loop: 1,
  };
}

function fmt(song) {
  const L = ["{"];
  for (const k of ["id", "title", "mood", "bpm", "stepsPerBar", "swing", "master"]) L.push(`  ${JSON.stringify(k)}: ${JSON.stringify(song[k])},`);
  L.push('  "instruments": {');
  const ik = Object.keys(song.instruments);
  ik.forEach((k, i) => L.push(`    ${JSON.stringify(k)}: ${JSON.stringify(song.instruments[k])}${i < ik.length - 1 ? "," : ""}`));
  L.push("  },", '  "patterns": {');
  const pk = Object.keys(song.patterns);
  pk.forEach((k, i) => {
    const p = song.patterns[k];
    L.push(`    ${JSON.stringify(k)}: { "inst": ${JSON.stringify(p.inst)}, "bars": ${p.bars}, "notes": [`);
    for (let j = 0; j < p.notes.length; j += 6) L.push("      " + p.notes.slice(j, j + 6).map((n) => JSON.stringify(n)).join(", ") + (j + 6 < p.notes.length ? "," : ""));
    L.push(`    ] }${i < pk.length - 1 ? "," : ""}`);
  });
  L.push("  },", '  "sections": {');
  const sk = Object.keys(song.sections);
  sk.forEach((k, i) => L.push(`    ${JSON.stringify(k)}: ${JSON.stringify(song.sections[k])}${i < sk.length - 1 ? "," : ""}`));
  L.push("  },", `  "arrangement": ${JSON.stringify(song.arrangement)},`, `  "loop": ${song.loop}`, "}");
  return L.join("\n");
}

let bad = 0;
for (const song of [daySong(), nightSong()]) {
  const r = validateSong(song, song.id);
  console.log(`${song.id}: ${r.ok ? "OK" : "INVALID"} "${song.title}" total ${r.seconds.toFixed(1)} s, loop ${r.loopSeconds.toFixed(1)} s`);
  for (const e of r.errors) console.log("   error:", e);
  for (const w of r.warnings) console.log("   warning:", w);
  if (!r.ok) { bad++; continue; }
  const head = `// ${song.title} (${song.id}) - original song by BONUS_AUDIO for the Adventure Cube bonus level. PURE DATA in the\n` +
    `// format of src/audio/format.js. Generated by src/bonus/audio/compose/homestead.mjs (edit that and re-run it).\n`;
  writeFileSync(path.join(OUT, song.id + ".js"), head + "export default " + fmt(song) + ";\n");
}
process.exit(bad ? 1 : 0);
