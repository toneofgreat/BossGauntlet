// AUDIO - tracks.js: every music track + sting, composed as data + step functions (all original material, except the
// girl's song, which uses the public-domain "This Old Man" melody with only the words "i love you, you love me...").
//
// Track def: { id, bpm, spb (steps per beat), stepsPerBar, bars, root (midi, for NG+ swells), gain, warm,
//   setup(m, t0)  - start persistent layers (m.layer)
//   step(m, bar, s, t, sd) - schedule notes for step s of bar `bar` at time t (sd = step duration) }
// m (provided by music.js): play(inst, t, p), sfx(id, t, p), layer(kind, p), lyric(text, t), rand(), loop, ng,
//   intensity, tempoMul, flat, stutter(t, d, rate), cut(t, d), state.
import { chord, melody, nn } from "./synth.js";

const CH = (syms, oct = 3) => syms.map((s) => chord(s, oct));
function lead(m, mel, idx, t, sd, inst, extra) {
  const e = mel.map[idx % mel.len];
  if (!e) return;
  m.play(inst, t, Object.assign({ n: e[0], d: e[1] * sd * 0.92, lead: true }, extra));
}
const N = (arr) => arr.map(nn);

// ================================================================ M1 TITLE (D minor, 54 BPM)
// Bass-drum heartbeat: bar A = thumps on beats 1 and 3 (slow), bar B = four thumps (twice as fast). A B A B ...
const TITLE_PIANO = new Map();
[
  [0, 0, ["D2"], 0.55], [1, 6, ["F2"], 0.42], [2, 0, ["D2", "Eb2"], 0.5], [3, 10, ["A1"], 0.5],
  [4, 0, ["Bb1"], 0.55], [4, 8, ["A1"], 0.4], [5, 4, ["C#2"], 0.48], [6, 0, ["D1", "D2"], 0.6], [6, 10, ["A2"], 0.34],
  [8, 0, ["F2"], 0.5], [9, 8, ["A1", "Bb1"], 0.5], [10, 0, ["D2"], 0.5], [10, 6, ["Eb2"], 0.42], [10, 12, ["F3"], 0.28],
  [11, 12, ["C#2"], 0.45], [12, 0, ["D1", "D2"], 0.6], [13, 4, ["F2"], 0.44], [13, 8, ["Eb2"], 0.42], [14, 0, ["A1"], 0.5],
  [14, 10, ["D3"], 0.26], [15, 8, ["C#2", "D2"], 0.5],
].forEach(([b, s, ns, v]) => TITLE_PIANO.set(b * 16 + s, [N(ns), v]));
const TITLE_PADS = [N(["D3", "A3", "F4"]), N(["D3", "A3", "Eb4"]), N(["Bb2", "F3", "D4"]), N(["C#3", "G#3", "D4"])];
function titleHeart(m, bar, s, t, { dist = 0, v = 0.85 } = {}) {
  const slow = bar % 2 === 0;
  if (slow ? (s === 0 || s === 8) : s % 4 === 0) {
    m.play("kick", t, { f0: 72, f1: 34, d: slow ? 1.1 : 0.8, v: v * (s === 0 ? 1 : 0.85), click: 0.12, lp: 240, wet: 0.12, dist });
  }
}
const title = {
  id: "title", bpm: 54, spb: 4, stepsPerBar: 16, bars: 16, root: nn("D2"), gain: 1,
  warm: [["piano", N(["D1", "A1", "Bb1", "C#2", "D2", "Eb2", "F2", "A2", "D3", "F3"])]],
  setup(m, t) {
    m.layer("sub", { notes: N(["D1", "D2"]), v: 0.26 });
    m.layer("wind", { f: 420, v: 0.1 });
  },
  step(m, bar, s, t, sd) {
    titleHeart(m, bar, s, t, { dist: m.state.red ? 2.5 : 0, v: m.state.red ? 0.7 : 0.85 });
    const pe = TITLE_PIANO.get(bar * 16 + s);
    if (pe) for (const n of pe[0]) {
      if (m.state.red && m.rand() < 0.5) m.play("revPiano", t, { n, v: pe[1], len: 2.2 });
      else m.play("piano", t, { n, v: pe[1], wet: 0.7, lead: true });
    }
    if (s === 0 && bar % 4 === 0) m.play("pad", t, { notes: TITLE_PADS[(bar / 4) | 0], d: sd * 16 * 3.6, a: 3.5, r: 4, cut: 520, v: 0.5, spread: 14, wet: 0.7 });
    if (s === 8 && bar % 4 === 3) m.play("tone", t, { n: bar % 8 === 3 ? 86 : 81, d: 2.2, a: 1.6, r: 3, v: 0.22 });
  },
};
const redTitle = Object.assign({}, title, {
  id: "redTitle",
  intro(m, t) {
    // "the title music plays reversed": reversed piano cluster + reversed heartbeat swelling into the red title
    for (const n of N(["D2", "Eb2", "A1"])) m.play("revPiano", t + 3, { n, v: 0.6, len: 3 });
    m.play("noiseSwell", t, { d: 3, f: 180, q: 0.7, v: 0.6, type: "lowpass", f2: 900, r: 0.05 });
    m.play("kick", t + 3, { f0: 80, f1: 30, d: 1.4, v: 0.95, dist: 3, lp: 400 });
    return 3;
  },
  setup(m, t) { m.state.red = true; title.setup(m, t); m.layer("drone", { n: nn("D1"), v: 0.2, ratio: 1.414 }); },
});

// ================================================================ M2 MEADOW (G major, 84 BPM)
const A1_CH = CH(["G", "D", "Em", "C", "G", "C", "D", "G", "Em", "Bm", "C", "G", "Am", "C", "D", "G"]);
const A1_MEL = melody(
  "B4 - - A4 G4 - A4 B4 | A4 - - - F#4 - D4 - | E4 - G4 - B4 - E5 - | D5 - C5 B4 A4 - - - | " +
  "B4 - D5 - G5 - F#5 E5 | E5 - - D5 C5 - E5 - | D5 - C5 B4 A4 - B4 C5 | B4 - - - . . . . | " +
  "G4 - B4 - E5 - D5 - | D5 - - B4 F#4 - - - | E4 - G4 C5 E5 - D5 C5 | D5 - - - B4 - . . | " +
  "C5 - B4 A4 E5 - - - | E5 - D5 C5 G4 - A4 B4 | A4 - - - D5 - F#4 A4 | G4 - - - - - . .");
const ARP = [0, 1, 2, 3, 2, 1, 2, 1];
const area1 = {
  id: "area1", bpm: 84, spb: 4, stepsPerBar: 16, bars: 16, root: nn("G3"), gain: 1,
  warm: [["pluck", N(["G2", "D3", "E3", "C3", "B2", "A2", "G3", "B3", "D4", "E4", "F#4", "A3", "C4", "G4"])]],
  setup(m) { m.layer("wind", { f: 900, v: 0.035 }); },
  step(m, bar, s, t, sd) {
    const c = A1_CH[bar], r = c.root, third = c.tones[1];
    if (s === 0) m.play("pluck", t, { n: r - 12, v: 0.55, bright: 0.3, wet: 0.15 });
    if (s === 8) m.play("pluck", t, { n: r - 5, v: 0.42, bright: 0.3, wet: 0.15 });
    if (s % 2 === 0) {
      const tones = [r, r + 7, r + 12, third + 12];
      m.play("pluck", t + (m.rand() - 0.5) * 0.012, { n: tones[ARP[s / 2]], v: 0.28 + m.rand() * 0.08, pan: s % 4 ? 0.25 : -0.2 });
    }
    lead(m, A1_MEL, bar * 16 + s, t, sd, "flute", { v: 0.5 });
    if (s === 0) m.play("strings", t, { notes: c.tones, d: sd * 15, a: 0.8, r: 1, v: 0.12, cut: 1600, wet: 0.5 });
    if (s === 0 || s === 6) m.play("hand", t, { v: s ? 0.28 : 0.45 });
    if (s === 8 || s === 12) m.play("hand", t, { v: 0.28, slap: true });
    if (s === 14) m.play("hand", t, { v: 0.18 });
    if (s % 2 === 1 && m.rand() < 0.15) m.play("hand", t, { v: 0.07, slap: true });
  },
};

// ================================================================ M3 VILLAGE (D major, 96 BPM)
const A2_CH = CH(["D", "D", "G", "A", "D", "Bm", "G", "A", "Bm", "G", "D", "A", "G", "A", "D", "D"]);
const A2_MEL = melody(
  "A4 - F#4 A4 D5 - A4 - | B4 A4 F#4 A4 D4 - - - | G4 A4 B4 G4 D5 - B4 - | C#5 B4 A4 G4 E4 - - - | " +
  "F#4 A4 D5 E5 F#5 - E5 D5 | D5 - B4 - F#4 - B4 - | G4 B4 D5 B4 E5 D5 B4 G4 | A4 - - - A4 B4 C#5 E5 | " +
  "F#5 - E5 D5 B4 - D5 - | E5 D5 B4 G4 B4 - - - | A4 F#4 A4 D5 F#5 - D5 - | E5 - C#5 A4 E4 - A4 - | " +
  "B4 A4 G4 B4 D5 - B4 - | C#5 D5 E5 C#5 A4 - - - | F#5 E5 D5 A4 F#4 A4 D5 - | D5 - - - . . . .");
const area2 = {
  id: "area2", bpm: 96, spb: 4, stepsPerBar: 16, bars: 16, root: nn("D3"), gain: 1.2,
  warm: [["pluck", N(["D2", "A2", "G2", "D3", "B2", "F#2", "E2", "C#3"])]],
  setup(m) { m.layer("wind", { f: 700, v: 0.03 }); },
  step(m, bar, s, t, sd) {
    const c = A2_CH[bar], r = c.root;
    if (s === 0) m.play("pluck", t, { n: r - 12, v: 0.6, bright: 0.25, wet: 0.1 });
    if (s === 8) m.play("pluck", t, { n: r - 5, v: 0.5, bright: 0.25, wet: 0.1 });
    if (s === 4 || s === 12) m.play("accordion", t, { notes: c.tones.map((x) => x + 12), d: sd * 2.2, v: 0.55, pan: -0.2 });
    if (s === 0 && bar % 2 === 0) m.play("accordion", t, { notes: [r + 12, r + 19], d: sd * 30, a: 0.4, r: 0.5, v: 0.22, pan: -0.25 });
    lead(m, A2_MEL, bar * 16 + s, t, sd, "fiddle", { v: 0.55, pan: 0.15 });
    if (s === 0 || s === 8) m.play("stomp", t, { v: s ? 0.55 : 0.7 });
    if (s === 4 || s === 12) m.play("clap", t, { v: 0.22, pan: 0.1 });
    if (s % 4 === 2) m.play("tamb", t, { v: 0.16, pan: 0.35 });
  },
};

// ================================================================ M4 CASTLE (Bb major / G minor, 72 BPM)
const A3_CH = CH(["Bb", "F", "Gm", "Eb", "Bb", "F", "Eb", "F", "Gm", "D", "Eb", "Bb", "Cm", "F", "Bb", "Bb"]);
const A3_MEL = melody(
  "F4 - - - Bb4 - - - | C5 - - D5 C5 - A4 - | Bb4 - - - G4 - D5 - | C5 - - - - - . . | " +
  "F4 - Bb4 - D5 - F5 - | Eb5 - D5 - C5 - A4 - | G4 - Bb4 - Eb5 - D5 C5 | C5 - - - - - . . | " +
  "D5 - - Bb4 G4 - - - | A4 - F#4 - D5 - - - | Eb5 - D5 C5 Bb4 - G4 - | F4 - - - Bb4 - D5 - | " +
  "Eb5 - - D5 C5 - G4 - | A4 - C5 - F5 - Eb5 - | D5 - - - C5 - Bb4 A4 | Bb4 - - - - - . .");
const area3 = {
  id: "area3", bpm: 72, spb: 4, stepsPerBar: 16, bars: 16, root: nn("Bb2"), gain: 1.2,
  warm: [],
  setup(m) { m.layer("wind", { f: 600, v: 0.04 }); },
  step(m, bar, s, t, sd) {
    const c = A3_CH[bar], r = c.root, tim = r - 12 < 38 ? r : r - 12;
    if (s === 0) {
      m.play("brass", t, { notes: c.tones, d: sd * 15, a: 0.5, r: 0.8, v: 0.32, bright: 0.45, wet: 0.5 });
      m.play("strings", t, { notes: [r - 12, r + 12], d: sd * 15, a: 0.6, r: 0.8, v: 0.18, cut: 2200 });
      m.play("timpani", t, { n: tim, v: 0.5 });
    }
    if (s === 8) m.play("timpani", t, { n: tim + 7 > 50 ? tim - 5 : tim + 7, v: 0.3 });
    if (bar % 4 === 3 && s >= 12) m.play("timpani", t, { n: tim, v: 0.15 + (s - 12) * 0.08, d: 0.6 });
    lead(m, A3_MEL, bar * 16 + s, t, sd, "brass", { v: 0.55, bright: 0.85, r: 0.3, wet: 0.45 });
    if (s % 8 === 0 && bar % 2 === 1) m.play("snare", t, { v: 0.12, d: 0.12 });
  },
};

// ================================================================ M5 BOSS (E minor, 140 BPM) + comic Rookie variant
const BOSS_CH = CH(["Em", "Em", "C", "D", "Em", "Em", "C", "B"]);
const OST = [0, 0, 12, 0, 7, 0, 12, 0, 0, 0, 12, 0, 7, 0, 10, 12];
const BOSS_MEL = melody(
  "E5 - - - B4 - - - | G5 - F#5 - E5 - D5 - | E5 - - - C5 - - - | D5 - - - F#5 - A5 - | " +
  "B5 - - - G5 - E5 - | F#5 - G5 - A5 - G5 F#5 | E5 - - - G5 - - - | F#5 - - - D#5 - B4 -");
const boss = {
  id: "boss", bpm: 140, spb: 4, stepsPerBar: 16, bars: 8, root: nn("E2"), gain: 0.95,
  setup(m) { m.layer("sub", { notes: [nn("E1")], v: 0.2 }); },
  step(m, bar, s, t, sd) {
    const c = BOSS_CH[bar], r = c.root - 12;
    m.play("strings", t, { n: r + OST[s], d: sd * 0.75, a: 0.004, r: 0.05, v: s % 4 === 0 ? 0.55 : 0.36, thin: true, cut: 2200, wet: 0.1, vib: 0 });
    if (s === 0 || s === 7 || s === 10) m.play("kick", t, { v: 0.85, d: 0.35 });
    if (s === 4 || s === 12) m.play("snare", t, { v: 0.5 });
    if (s === 2 || s === 3) m.play("tom", t, { n: 45, v: 0.4 });
    if (s === 14 || s === 15) m.play("tom", t, { n: 40, v: 0.5 });
    if (s % 2 === 0) m.play("hat", t, { v: s % 4 ? 0.18 : 0.1 });
    if (s === 0 && bar % 2 === 0) m.play("brass", t, { notes: c.tones.map((x) => x + 12), d: 0.3, v: 0.6, r: 0.15 });
    lead(m, BOSS_MEL, bar * 16 + s, t, sd, "brass", { v: 0.5, bright: 1, wet: 0.3 });
    if (bar === 7 && s === 12) m.play("timpani", t, { n: 40, v: 0.6, d: 1 });
  },
};
const RK_CH = CH(["F", "C", "F", "C", "Bb", "F", "C", "F"]);
const RK_MEL = melody(
  "C5 . A4 . C5 D5 C5 A4 | G4 . E4 . G4 A4 G4 . | A4 C5 F5 . E5 D5 C5 . | Bb4 A4 G4 . C5 . . . | " +
  "D5 . Bb4 . D5 E5 D5 Bb4 | C5 . A4 . F4 . A4 . | G4 A4 Bb4 . E5 . G5 . | F5 . C5 . F4 . . .");
const bossRookie = {
  id: "bossRookie", bpm: 150, spb: 4, stepsPerBar: 16, bars: 8, root: nn("F3"), gain: 1.3,
  step(m, bar, s, t, sd) {
    const c = RK_CH[bar], r = c.root;
    if (s === 0) m.play("brass", t, { n: r - 12, d: 0.18, v: 0.6, bright: 0.4, r: 0.08 });
    if (s === 8) m.play("brass", t, { n: r - 17, d: 0.18, v: 0.55, bright: 0.4, r: 0.08 });
    if (s === 4 || s === 12) m.play("pluck", t, { n: c.tones[1] + 12, v: 0.35, bright: 0.8 });
    if (s === 4 || s === 12) m.play("pluck", t, { n: c.tones[2] + 12, v: 0.3, bright: 0.8 });
    if (s === 4 || s === 12) m.play("snare", t, { v: 0.3, d: 0.1 });
    if (s === 0 || s === 8) m.play("kick", t, { v: 0.6, d: 0.25 });
    if (s % 4 === 2) m.play("woodblock", t, { n: s % 8 === 2 ? 79 : 84, v: 0.25 });
    lead(m, RK_MEL, bar * 16 + s, t, sd, "kazoo", { v: 0.55 });
    if (bar === 3 && s === 14) m.play("woodblock", t, { n: 72, v: 0.3 });
  },
};

// ================================================================ M6 THE KING IN THE DARK (C minor, 60 BPM)
const KING_CH = CH(["Cm", "Cm", "Ab", "Ab", "Fm", "Fm", "G", "G"]);
const KING_CHIME = N(["C6", "Eb6", "G6", "Bb5", "D6", "G5"]);
const king = {
  id: "king", bpm: 60, spb: 4, stepsPerBar: 16, bars: 8, root: nn("C2"), gain: 0.75,
  warm: [["bell", KING_CHIME]],
  setup(m) { m.layer("drone", { n: nn("C1"), v: 0.3, ratio: 1.5 }); },
  step(m, bar, s, t, sd) {
    const c = KING_CH[bar];
    if (s === 0 && bar % 2 === 0) {
      m.play("organ", t, { notes: [c.root - 12, c.root - 5, ...c.tones], d: sd * 30, a: 0.8, r: 1.2, v: 0.4, cut: 2600, wet: 0.6 });
      m.play("choir", t, { notes: c.tones.map((x) => x + 12), d: sd * 28, a: 2, r: 2, v: 0.4, vow: bar % 4 ? "oo" : "ah" });
    }
    if (s % 4 === 0) m.play("kick", t, { f0: 62, f1: 34, d: 0.5, v: 0.6, lp: 200, click: 0.05 });
    if (s % 4 === 1) m.play("kick", t, { f0: 58, f1: 32, d: 0.4, v: 0.38, lp: 180, click: 0 });
    if (s % 2 === 0 && m.rand() < 0.09) m.play("bell", t, { n: KING_CHIME[(m.rand() * KING_CHIME.length) | 0], v: 0.18, len: 3, lead: true, wet: 0.8 });
  },
};

// ================================================================ M7 DESERT (no melody)
const desert = {
  id: "desert", bpm: 60, spb: 4, stepsPerBar: 16, bars: 5, root: nn("C2"), gain: 1,
  warm: [["bell", [nn("C2")]]],
  setup(m) { m.layer("wind", { f: 360, v: 0.32, q: 0.6 }); m.layer("wind", { f: 1500, v: 0.1, q: 1.4, rate: 0.13 }); },
  step(m, bar, s, t) {
    if (bar === 0 && s === 0) m.play("bell", t, { n: nn("C2"), v: 0.3, wet: 0.95, len: 6 });
    if (bar === 2 && s === 8) m.sfx("sand_hiss", t, { vol: 0.35, pan: 0.4 });
  },
};

// ================================================================ M8a / M8b FOREST
const forestQuiet = {
  id: "forestQuiet", bpm: 60, spb: 4, stepsPerBar: 16, bars: 15, root: nn("D2"), gain: 1,
  setup(m) { m.layer("trees", { v: 0.22 }); },
  step(m, bar, s, t) {
    if (bar === 3 && s === 0) m.sfx("woodpecker", t, { vol: 0.3, pan: -0.6 });
    if (bar === 9 && s === 4) m.sfx("crow", t, { vol: 0.22, pan: 0.7 });
    if (bar === 12 && s === 0) m.sfx("woodpecker", t, { vol: 0.16, pan: 0.5 });
  },
};
const CREEP_BOX = new Map([[0, "D5"], [4, "F5"], [8, "A5"], [12, "Eb5"], [16, "C#5"], [22, "D5"]].map(([k, v]) => [k, nn(v)]));
const forestCreep = {
  id: "forestCreep", bpm: 50, spb: 4, stepsPerBar: 16, bars: 8, root: nn("D2"), gain: 1,
  warm: [["musicBox", N(["D5", "F5", "A5", "Eb5", "C#5"])], ["piano", N(["D3", "Eb3"])]],
  setup(m) {
    m.layer("trees", { v: 0.12 });
    m.layer("sub", { notes: N(["D1", "A1"]), v: 0.22 });
    m.layer("drone", { n: nn("D2"), v: 0.2, ratio: 1.059 });
  },
  step(m, bar, s, t, sd) {
    const k = (bar % 2) * 16 + s;
    if (CREEP_BOX.has(k)) m.play("musicBox", t, { n: CREEP_BOX.get(k), v: 0.45, detune: -32 + (m.rand() - 0.5) * 30, wet: 0.7, lead: true });
    if (s === 0 || s === 8) m.play("kick", t, { f0: 60, f1: 32, d: 0.6, v: 0.55, lp: 160, click: 0 });
    if (s === 1 || s === 9) m.play("kick", t, { f0: 56, f1: 30, d: 0.45, v: 0.32, lp: 150, click: 0 });
    if ((bar === 3 && s === 0) || (bar === 7 && s === 0)) m.play("revPiano", t + sd * 16, { n: bar === 3 ? nn("D3") : nn("Eb3"), v: 0.55, len: 2.5 });
  },
};

// ================================================================ M9a HOUSE (rain + creaks)
const house = {
  id: "house", bpm: 60, spb: 4, stepsPerBar: 16, bars: 8, root: nn("D2"), gain: 1,
  setup(m) { m.layer("rain", { v: 0.5 }); },
  step(m, bar, s, t) {
    if (bar === 1 && s === 4) m.sfx("creak", t, { vol: 0.16, pan: -0.5, rate: 0.9 });
    if (bar === 4 && s === 10) m.sfx("chair_creak", t, { vol: 0.2, pan: 0.3 });
    if (bar === 6 && s === 2) m.sfx("creak", t, { vol: 0.12, pan: 0.6, rate: 0.7 });
  },
};

// ================================================================ M9 CHASE / COLLAPSE (D minor, 160 BPM; intensity layers 0..3)
const CHASE_CH = CH(["Dm", "Dm", "Bb", "C", "Dm", "Dm", "Bb", "A"]);
const chase = {
  id: "chase", bpm: 160, spb: 4, stepsPerBar: 16, bars: 8, root: nn("D2"), gain: 0.9, autoIntensity: 35,
  step(m, bar, s, t, sd) {
    const c = CHASE_CH[bar], r = c.root, I = m.intensity;
    if (s % 4 === 0 || (I >= 2 && (s === 10 || s === 14))) m.play("kick", t, { v: 0.85, d: 0.3, dist: 3, f0: 130, f1: 45 });
    if (s % 2 === 0) m.play("strings", t, { n: r - 12, d: sd * 1.1, a: 0.004, r: 0.04, v: s % 8 === 0 ? 0.55 : s % 4 === 2 ? 0.3 : 0.42, thin: true, cut: 2600, vib: 0, wet: 0.08 });
    if (s % 2 === 0) m.play("bass", t, { n: r - 12, d: sd * 1.4, v: 0.5, dist: 3, cut: 500, perc: true });
    if (s === 0) m.play("shepard", t, { n: nn("D2"), d: sd * 16, v: 0.55 + I * 0.1 });
    if (I >= 1 && (s === 4 || s === 12)) m.play("snare", t, { v: 0.45 });
    if (I >= 1) m.play("hat", t, { v: s % 2 ? 0.07 : 0.14 });
    if (I >= 1 && s === 0 && bar % 4 === 3) m.play("choir", t, { notes: N(["D5", "Eb5"]), d: sd * 12, a: 0.05, r: 0.4, v: 0.42, fall: -1, lead: true });
    if (I >= 2 && s === 0 && bar % 2 === 0) m.play("brass", t, { notes: c.tones.map((x) => x + 12), d: 0.22, v: 0.62, r: 0.1 });
    if (I >= 3 && s === 0 && bar % 4 === 1) m.play("siren", t, { n: nn("A5"), d: sd * 32, v: 0.4 });
    if (I >= 3 && s % 4 === 3) m.play("tom", t, { n: 43 + (s >> 2), v: 0.35 });
  },
};

// ================================================================ M10 THRONE: HOLLOW I (7/8, 132 BPM)
const TH_CH = CH(["Dm", "Dm", "Bb", "Bb", "Gm", "Gm", "A", "A"]);
const throne = {
  id: "throne", bpm: 132, spb: 4, stepsPerBar: 14, bars: 8, root: nn("D2"), gain: 0.9,
  setup(m) { m.layer("sub", { notes: [nn("D1")], v: 0.25 }); },
  step(m, bar, s, t, sd) {
    const c = TH_CH[bar], r = c.root;
    // breakbeat in 2+2+3
    if (s === 0 || s === 8 || (s === 10 && bar % 2)) m.play("kick", t, { v: 0.85, d: 0.3, dist: 2 });
    if (s === 4 || s === 11) m.play("snare", t, { v: 0.55 });
    if (s === 13 || (s === 6 && m.rand() < 0.4)) m.play("snare", t, { v: 0.14, d: 0.08 });
    if (s % 2 === 0) m.play("hat", t, { v: 0.12 });
    // the title heartbeat motif in the low end: slow / twice as fast, alternating bars
    if (bar % 2 === 0 ? (s === 0 || s === 7) : (s === 0 || s === 4 || s === 7 || s === 11)) m.play("kick", t, { f0: 62, f1: 30, d: 0.7, v: 0.5, lp: 150, click: 0 });
    if (s % 2 === 0) m.play("bass", t, { n: r - 12 + (s === 6 || s === 12 ? 12 : 0), d: sd * 1.6, v: 0.45, dist: 4, cut: 600, perc: true });
    if (s === 0 && bar % 2 === 0) m.play("organ", t, { notes: [r - 12, ...c.tones], d: sd * 26, v: 0.38, detuned: 22, cut: 3000, wet: 0.5 });
    if (s === 0 && bar % 2 === 1) m.play("strings", t, { notes: [c.tones[2] + 24, c.tones[0] + 36], d: sd * 13, a: 0.3, r: 0.3, v: 0.28, bend: 1, vib: 32, cut: 6000, lead: true });
  },
};

// ================================================================ M11 THE GIRL'S SONG ("This Old Man", public domain)
// [note (written in C), eighths]. Sung on the first two phrases with "i love you, you love me...", then hummed.
const OLD_MAN = [
  ["G4", 2], ["E4", 2], ["G4", 4], ["G4", 2], ["E4", 2], ["G4", 4],
  ["A4", 2], ["G4", 2], ["F4", 2], ["E4", 2], ["D4", 2], ["E4", 2], ["F4", 4],
  ["E4", 2], ["F4", 2], ["G4", 2], ["C4", 1], ["C4", 1], ["C4", 2], ["C4", 1], ["C4", 1],
  ["C4", 1], ["D4", 1], ["E4", 1], ["F4", 1], ["G4", 4],
  ["G4", 2], ["D4", 2], ["D4", 2], ["F4", 2], ["E4", 2], ["D4", 2], ["C4", 4],
];
const OM_START = []; { let e = 0; for (const [, l] of OLD_MAN) { OM_START.push(e); e += l; } }
const OM_LEN = 68; // eighths
const LYRIC = [ // syllables of the first 6 notes
  { vow: "ah", vow2: "ee" }, { vow: "uh", cons: "l" }, { vow: "oo", cons: "y" },
  { vow: "oo", cons: "y" }, { vow: "uh", cons: "l" }, { vow: "ee", cons: "m" },
];
const PHRASES = [[0, 6], [6, 13], [13, 21], [21, 26], [26, 33]]; // note index ranges (first = the sung line)
const girl = {
  id: "girl", bpm: 84, spb: 2, stepsPerBar: 80, bars: 1, root: nn("D3"), gain: 1.5,
  warm: [["musicBox", N(["D5", "E5", "F#5", "G5", "A5", "B5"])]],
  step(m, bar, s, t, sd) {
    const L = m.loop;
    if (s === 0) {
      m.tempoMul = Math.max(0.78, 1 - 0.04 * L);
      m.flat = -12 - Math.min(60, 14 * L);
      m.lyric("i love you, you love me...", t);
      m.lyric("", t + sd * 16 + 1.2);
    }
    // phrase starts: schedule the whole phrase on one legato voice
    for (let p = 0; p < PHRASES.length; p++) {
      const [a, b] = PHRASES[p];
      if (OM_START[a] !== s) continue;
      const notes = [];
      for (let i = a; i < b; i++) {
        const st = OM_START[i], [nm, len] = OLD_MAN[i];
        const ly = p === 0 ? LYRIC[i] : null;
        notes.push({
          t: t + (st - s) * sd, d: len * sd * (ly ? 0.96 : 0.9), n: nn(nm) + 2,
          vow: ly ? ly.vow : (m.rand() < 0.15 ? "oo" : "mm"), vow2: ly && ly.vow2, cons: ly && ly.cons,
          v: p === 0 ? 1 : 0.75 - p * 0.06, legato: !ly,
        });
      }
      m.play("voxPhrase", t, { notes, opts: { kind: "child", gainV: p === 0 ? 0.34 : 0.26, flat: m.flat, wobble: 10 + L * 3, breath: 0.07 }, wet: 0.35 });
    }
    // music box doubling an octave up (soft)
    const idx = OM_START.indexOf(s);
    if (idx >= 0) m.play("musicBox", t, { n: nn(OLD_MAN[idx][0]) + 14, v: 0.16, detune: m.flat * 0.6, wet: 0.6 });
    if (s === OM_LEN + 2 || s === OM_LEN + 7) m.play("sob", t, { v: 0.22, f0: 520 - L * 8 });
  },
};

// ================================================================ M12 HOLLOW II (7/8: King's organ, Guards' war drums, inverted girl melody)
const H2_CH = CH(["Cm", "Cm", "Ab", "Ab", "Fm", "Fm", "G", "G", "Cm", "G"]);
const H2_MEL = new Map(); // eighth index -> [midi, eighths] (chromatic inversion around G4)
OLD_MAN.forEach(([nm, len], i) => H2_MEL.set(OM_START[i], [2 * nn("G4") - nn(nm), len]));
const hollow2 = {
  id: "hollow2", bpm: 132, spb: 4, stepsPerBar: 14, bars: 10, root: nn("C2"), gain: 0.9,
  warm: [["musicBox", N(["G4", "Bb4", "F4", "A4", "C5", "D5"])]],
  setup(m) { m.layer("drone", { n: nn("C1"), v: 0.35, ratio: 1.5 }); },
  step(m, bar, s, t, sd) {
    const c = H2_CH[bar], r = c.root;
    // war drums
    if (s === 0 || s === 4 || s === 8 || s === 10) m.play("tom", t, { n: s === 0 ? 36 : 40, v: s === 0 ? 0.8 : 0.55, d: 0.5 });
    if (s === 0 && bar % 2 === 0) m.play("timpani", t, { n: nn("C2") + 7, v: 0.6 });
    if (s === 4 || s === 11) m.play("snare", t, { v: 0.45 });
    if (s === 0 || s === 8) m.play("kick", t, { v: 0.8, d: 0.3, dist: 2 });
    if (s % 2 === 0) m.play("hat", t, { v: 0.1 });
    if (s % 2 === 0) m.play("bass", t, { n: r - 12, d: sd * 1.6, v: 0.42, dist: 3, cut: 500, perc: true });
    if (s === 0 && bar % 2 === 0) m.play("organ", t, { notes: [r - 12, r - 5, ...c.tones], d: sd * 26, v: 0.4, cut: 3200, wet: 0.55 });
    if (s === 0) m.play("choir", t, { notes: [c.tones[0] + 12], d: sd * 12, a: 0.4, v: 0.25, vow: "oo", low: true });
    if (s % 2 === 0) {
      const e = bar * 7 + s / 2, me = H2_MEL.get(e);
      if (me && e < OM_LEN) {
        m.play("musicBox", t, { n: me[0] + 12, v: 0.4, detune: -25, wet: 0.5, lead: true });
        m.play("strings", t, { n: me[0], d: me[1] * 2 * sd * 0.9, a: 0.03, r: 0.2, v: 0.22, lead: true, cut: 4000 });
      }
    }
  },
};

// ================================================================ M13 FINAL: THE END OF THE WORLD (174 BPM)
const FIN_CH = CH(["Dm", "Bb", "Gm", "A", "Dm", "Bb", "Eb", "A"]);
const FIN_GIRL = new Map([[0, "A4"], [2, "F#4"], [4, "A4"], [8, "A4"], [10, "F#4"], [12, "A4"]].map(([k, v]) => [k, nn(v)]));
const final = {
  id: "final", bpm: 174, spb: 4, stepsPerBar: 16, bars: 8, root: nn("D2"), gain: 0.85,
  warm: [["musicBox", N(["A4", "F#4"])]],
  setup(m) { m.layer("sub", { notes: [nn("D1")], v: 0.25 }); },
  step(m, bar, s, t, sd) {
    const c = FIN_CH[bar], r = c.root;
    // title heartbeat doubled
    if (bar % 2 === 0 ? s % 4 === 0 : s % 2 === 0) m.play("kick", t, { f0: 75, f1: 34, d: 0.45, v: 0.6, dist: 2, lp: 300 });
    // break
    if (s === 0 || s === 10) m.play("kick", t, { v: 0.85, d: 0.28, dist: 3 });
    if (s === 4 || s === 12) m.play("snare", t, { v: 0.55 });
    if (s === 7 || s === 15) m.play("snare", t, { v: 0.15, d: 0.08 });
    m.play("hat", t, { v: s % 2 ? 0.06 : 0.12 });
    if (s === 0) m.play("bass", t, { n: r - 12, d: sd * 15, v: 0.5, reese: true, dist: 3, cut: 520 });
    if (s === 0) m.play("brass", t, { notes: c.tones.map((x) => x + 12), d: 0.2, v: 0.55, r: 0.1 });
    if (s === 0 && bar % 2 === 0) m.play("choir", t, { notes: c.tones.map((x) => x + 12), d: sd * 10, a: 0.05, r: 0.3, v: 0.42, fall: -(2 + ((m.rand() * 4) | 0)), lead: true });
    if (s === 0 && bar % 4 === 1) m.play("siren", t, { n: nn("D5"), d: sd * 32, v: 0.45, up: 12, down: -2 });
    if (s === 0 && bar % 4 === 0) m.play("organ", t, { notes: [r - 12, ...c.tones], d: sd * 60, v: 0.3, detuned: 25 });
    if (s === 0) m.play("shepard", t, { n: nn("D2"), d: sd * 16, v: 0.4 });
    if ((bar === 4 || bar === 5) && FIN_GIRL.has(s)) m.play("musicBox", t, { n: FIN_GIRL.get(s) + 12, v: 0.4, detune: -40, lead: true });
    if (s === 12 && m.rand() < 0.25) m.play("glitch", t, { n: r + 24, d: sd * 4, v: 0.6 });
    if (bar === 7 && s === 12) m.stutter(t, sd * 4, 32);
  },
};

// ================================================================ registry + NG+ variants
const BASE = [title, redTitle, area1, area2, area3, boss, bossRookie, king, desert, forestQuiet, forestCreep, house, chase, throne, girl, hollow2, final];
export const TRACKS = {};
for (const d of BASE) TRACKS[d.id] = d;
for (const id of ["title", "area1", "area2", "area3", "boss", "king"]) TRACKS[id + "_ng"] = Object.assign({}, TRACKS[id], { id: id + "_ng", ng: true, base: id });

// ================================================================ STINGS: fn(m, t) -> end time. duck: how much the music ducks.
export const STINGS = {
  secret: { duck: 0.6, fn(m, t) { N(["D6", "F#6", "A6", "D7"]).forEach((n, i) => m.play("musicBox", t + i * 0.09, { n, v: 0.5, wet: 0.7 })); m.play("pad", t, { notes: N(["D5", "A5"]), d: 0.6, a: 0.2, r: 1.2, cut: 3000, v: 0.3 }); return t + 2; } },
  levelUp: { duck: 0.5, fn(m, t) { N(["G4", "B4", "D5", "G5"]).forEach((n, i) => m.play("pluck", t + i * 0.07, { n, v: 0.55, bright: 0.8 })); m.play("bell", t + 0.28, { n: nn("G5"), v: 0.35, len: 2 }); return t + 1.4; } },
  itemGet: { duck: 0.6, fn(m, t) { m.play("pluck", t, { n: nn("C5"), v: 0.6, bright: 0.8 }); m.play("pluck", t + 0.12, { n: nn("G5"), v: 0.6, bright: 0.8 }); m.play("brass", t + 0.24, { notes: N(["C4", "E4", "G4", "C5"]), d: 0.6, v: 0.45, r: 0.5 }); m.play("bell", t + 0.24, { n: nn("C6"), v: 0.25, len: 2 }); return t + 1.6; } },
  unlock: { duck: 0.6, fn(m, t) { N(["Bb4", "D5", "F5"]).forEach((n, i) => m.play("brass", t + i * 0.14, { n, d: 0.14, v: 0.6 })); m.play("brass", t + 0.42, { notes: N(["Bb3", "F4", "Bb4", "D5", "F5"]), d: 1.3, v: 0.6, r: 0.8 }); m.play("timpani", t + 0.42, { n: nn("Bb2"), v: 0.7 }); return t + 2.6; } },
  bossWin: {
    duck: 0.8, fn(m, t) {
      N(["G4", "B4", "D5"]).forEach((n, i) => m.play("brass", t + i * 0.12, { n, d: 0.12, v: 0.6 }));
      m.play("brass", t + 0.36, { notes: N(["G3", "D4", "G4", "B4", "D5", "G5"]), d: 2, v: 0.65, r: 1 });
      m.play("strings", t + 0.36, { notes: N(["G4", "B4", "D5"]), d: 2, a: 0.1, v: 0.3 });
      for (let i = 0; i < 6; i++) m.play("timpani", t + i * 0.06, { n: nn("G2"), v: 0.2 + i * 0.08, d: 0.4 });
      m.play("timpani", t + 0.36, { n: nn("G2"), v: 0.75 });
      m.play("noiseSwell", t + 0.36, { d: 2, f: 8000, type: "highpass", v: 0.25, fallIn: true });
      return t + 3.6;
    },
  },
  death: { duck: 0.85, fn(m, t) { m.play("piano", t, { n: nn("D2"), v: 0.6 }); m.play("piano", t, { n: nn("A1"), v: 0.5 }); m.play("piano", t + 0.4, { n: nn("Eb2"), v: 0.45 }); m.play("choir", t, { notes: N(["D3", "A3"]), d: 1.8, a: 0.4, v: 0.35, vow: "oo", fall: -2, low: true }); return t + 3.2; } },
  ngReveal: { duck: 1, fn(m, t) { m.play("noiseSwell", t, { d: 1.8, f: 300, f2: 2400, q: 0.8, v: 0.5 }); for (const n of N(["D2", "Eb2"])) m.play("revPiano", t + 1.8, { n, v: 0.6, len: 1.8 }); m.play("kick", t + 1.8, { f0: 80, f1: 28, d: 1.5, v: 0.95, dist: 3 }); m.play("piano", t + 1.8, { n: nn("D1"), v: 0.7 }); return t + 4; } },
  throneResolve: {
    // the fake victory: the throne track "resolves" into a major chord, then freezes (cut)
    duck: 1, fn(m, t) {
      const ns = N(["D3", "F#3", "A3", "D4", "F#4", "A4"]);
      m.play("organ", t, { notes: ns, d: 2.2, a: 0.3, r: 0.02, v: 0.45 });
      m.play("strings", t, { notes: N(["D5", "F#5", "A5"]), d: 2.2, a: 0.4, r: 0.02, v: 0.3 });
      m.play("choir", t, { notes: N(["A4", "D5"]), d: 2.2, a: 0.5, r: 0.02, v: 0.35 });
      m.play("timpani", t, { n: nn("D2"), v: 0.7 });
      return t + 2.6;
    },
  },
  end_monster: { duck: 1, fn(m, t) { m.play("drop", t, { d: 3, v: 0.7 }); m.play("scream", t + 0.4, { reverse: true, v: 0.6 }); m.play("bass", t + 2.6, { n: nn("D1"), d: 2, v: 0.7, dist: 5, reese: true, cut: 300 }); m.play("kick", t + 2.6, { f0: 70, f1: 25, d: 2, v: 0.9, dist: 3 }); return t + 5; } },
  end_world: {
    duck: 1, fn(m, t) {
      N(["D4", "F#4", "A4", "D5", "A4", "F#5"]).forEach((n, i) => m.play("piano", t + i * 0.55, { n, v: 0.38 - i * 0.02, wet: 0.85, soft: true }));
      m.play("piano", t + 3.4, { n: nn("D3"), v: 0.3, wet: 0.9 });
      m.play("noiseSwell", t, { d: 4, f: 6000, type: "highpass", v: 0.12, r: 2 });
      m.play("tone", t + 1, { n: nn("A6"), n2: nn("D7"), d: 3, a: 1.5, r: 3, v: 0.12 });
      return t + 7;
    },
  },
  end_warrior: {
    duck: 1, fn(m, t) {
      const prog = [N(["G3", "B3", "D4"]), N(["F#3", "A3", "D4"]), N(["E3", "G3", "B3"]), N(["C3", "E3", "G3"]), N(["G3", "B3", "D4", "G4"])];
      prog.forEach((ns, i) => m.play("strings", t + i * 1.1, { notes: ns, d: i === 4 ? 2.2 : 1.05, a: 0.3, r: 1, v: 0.3, wet: 0.6 }));
      [["D4", 0], ["D5", 1.1], ["B4", 2.2], ["C5", 3.3], ["B4", 4.4]].forEach(([n, dt]) => m.play("brass", t + dt, { n: nn(n), d: 1, a: 0.15, v: 0.42, bright: 0.4, r: 0.6 }));
      m.play("timpani", t + 4.4, { n: nn("G2"), v: 0.5 });
      return t + 7;
    },
  },
  end_idiot: {
    duck: 1, fn(m, t) {
      [["Bb3", 0, 0.45], ["A3", 0.5, 0.45], ["Ab3", 1.0, 0.45], ["G3", 1.5, 1.6]].forEach(([n, dt, d], i) =>
        m.play("brass", t + dt, { n: nn(n), d, v: 0.55, bright: 0.35, vib: i === 3 ? 60 : 12, fall: i === 3 ? -0.5 : 0, r: 0.3 }));
      m.play("kazoo", t + 1.5, { n: nn("G4"), d: 1.4, v: 0.15 });
      return t + 3.6;
    },
  },
  end_winners: {
    duck: 1, fn(m, t) {
      for (let i = 0; i < 10; i++) m.play("snare", t + i * 0.05, { v: 0.15 + i * 0.03, d: 0.08 });
      [["C5", 0.5], ["C5", 0.65], ["C5", 0.8], ["G5", 0.95]].forEach(([n, dt]) => m.play("brass", t + dt, { n: nn(n), d: 0.12, v: 0.65 }));
      m.play("brass", t + 1.15, { notes: N(["C4", "G4", "C5", "E5", "G5"]), d: 2.2, v: 0.7, r: 1 });
      m.play("strings", t + 1.15, { notes: N(["C5", "E5", "G5", "C6"]), d: 2.2, a: 0.1, v: 0.3 });
      m.play("timpani", t + 1.15, { n: nn("C2") + 7, v: 0.8 });
      m.play("noiseSwell", t + 1.15, { d: 2.5, f: 8000, type: "highpass", v: 0.25, fallIn: true });
      return t + 4.4;
    },
  },
  end_sigma: {
    duck: 1, fn(m, t) {
      [["D5", 0], ["F#5", 0.15], ["A5", 0.3], ["D6", 0.45]].forEach(([n, dt]) => m.play("brass", t + dt, { n: nn(n), d: 0.14, v: 0.7 }));
      m.play("brass", t + 0.6, { notes: N(["D4", "A4", "D5", "F#5", "A5"]), d: 1.6, v: 0.75, r: 0.05 });
      m.play("timpani", t + 0.6, { n: nn("D2"), v: 0.8 });
      m.play("noiseSwell", t + 0.6, { d: 1.6, f: 400, f2: 6000, v: 0.4, r: 0.02 });
      m.play("drop", t + 2.3, { d: 3, v: 0.9 });
      m.play("kick", t + 2.3, { f0: 90, f1: 24, d: 1.8, v: 1, dist: 4 });
      [0, 0.43, 0.86, 1.29].forEach((dt) => m.play("kick", t + 2.3 + dt, { v: 0.7, d: 0.3, dist: 3 }));
      return t + 6;
    },
  },
};
export const TRACK_IDS = Object.keys(TRACKS);
export const STING_IDS = Object.keys(STINGS);
