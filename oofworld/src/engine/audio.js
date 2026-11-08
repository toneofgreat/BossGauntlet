// src/engine/audio.js — WebAudio synth engine: master/sfx/music gain graph, the shared
// synth voice primitives, and the sfx registry (12 base recipes + 13 aliases). Owned in
// two passes: this task (M1-T06, spec 02 §5.5, §5.5.8, §5.5.8b) builds everything below
// except the music sequencer, which M1-T07 (spec 02 §5.5.9-§5.5.10) adds in the section
// marked near the bottom of `createAudio()`. No audio files anywhere — every sound is
// synthesized at runtime (ARCHITECTURE §2).

// ---- tuning constants, spec 02 §6 (the single source for these numbers) ----
const COMPRESSOR_THRESHOLD = -14; // dB
const COMPRESSOR_KNEE = 22;
const COMPRESSOR_RATIO = 7;
const COMPRESSOR_ATTACK = 0.004; // s
const COMPRESSOR_RELEASE = 0.22; // s
const VERB_LENGTH_S = 2.2; // synthetic impulse response length
const VERB_DECAY_POW = 2.5; // noise shaped by pow(1-t, 2.5)
const VERB_GAIN = 0.3;
const BUS_DEFAULT_MASTER = 0.8;
const BUS_DEFAULT_SFX = 1.0;
const BUS_DEFAULT_MUSIC = 0.6;
const VOLUME_RAMP_TAU = 0.05; // setTargetAtTime time constant (spec 02 §5.5 facade table)
const MAX_VOICES = 16; // sfx voice cap, spec 02 §5.5.8
const VOICE_RELEASE_SLACK_MS = 30; // margin added past a recipe's own envelope tail
                                    // before its voice-cap slot is freed — covers
                                    // floating-point/scheduling jitter, not audible.
const NOISE_BUFFER_SECONDS = 2; // longer than any recipe's noise duration; reused
                                 // (not regenerated) by every noise() call — spec 02
                                 // doesn't mandate fresh noise per call, only the
                                 // filtered/enveloped result described in §5.5.4.

// The 25-name sfx registry: 12 base recipes (spec 02 §5.5.8) + 13 aliases (§5.5.8b).
// This is THE list — validate.js's V7 rule (a later task) checks call sites against it.
export const SFX_NAMES = Object.freeze([
  // base recipes:
  "jump", "land", "oof", "chime", "coin", "purchase", "badge", "click", "teleport",
  "error", "lift", "cash",
  // aliases (§5.5.8b):
  "boing", "whoosh", "sparkle", "warp", "pop", "win", "ui_open", "ui_close", "buy",
  "denied", "fanfare", "quack", "oofbux",
]);

// Alias table (spec 02 §5.5.8b): name -> [baseRecipeName, { detune?, volume? }].
// Overrides compose with whatever the caller passes to playSfx(name, opts): the
// caller's opts.detune is ADDED to the alias's detune; the caller's opts.volume
// MULTIPLIES the alias's volume (both default to the neutral element, 0 and 1).
const ALIASES = Object.freeze({
  boing: ["jump", { detune: -400, volume: 1.2 }],
  whoosh: ["lift", { detune: 300, volume: 0.8 }],
  sparkle: ["coin", { detune: 200 }],
  warp: ["teleport", {}],
  pop: ["click", { detune: -600, volume: 1.4 }],
  win: ["badge", { detune: 200 }],
  ui_open: ["click", { detune: 200 }],
  ui_close: ["click", { detune: -200 }],
  buy: ["purchase", {}],
  denied: ["error", { volume: 0.8 }],
  fanfare: ["badge", { volume: 1.2 }],
  quack: ["oof", { detune: 900, volume: 0.7 }],
  oofbux: ["coin", { volume: 0.6 }],
});

// Note-name -> Hz, spec 02 §3.4: A4 = 440. Regex and formula are normative there.
const SEMITONE_OF = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_NAME_RE = /^([A-G])([#b]?)(-?\d)$/;

// ===================================================================================
// ===== SECTION: music data — owned by M1-T07, spec 02 §5.5.9 (sequencer constants ==
// ===== and voices) + §5.5.10 (the 4 tracks). §5.5.10 is marked "complete, ==========
// ===== normative": every bpm / bar count / chord / root / lead note / drum step =====
// ===== below is transcribed from it, never composed here. ==========================
// ===================================================================================

// Sequencer, spec 02 §5.5.9 + §6 tuning table.
const LOOKAHEAD = 0.35; // s of schedule-ahead per pump tick
const PUMP_MS = 80; // pump interval
const MAX_BARS_PER_PUMP = 8; // §5.5.9 pump guard
const CROSSFADE_OUT_MS = 1100; // playMusic/stopMusic default fadeMs (§6 "crossfade out")
const CROSSFADE_IN_S = 1.2; // every track fades in over 1.2 s (§5.5.10 "Common")
const DISCONNECT_AFTER_FADE_MS = 500; // §5.5.10 disconnects the old track 1.6 s after a
                                      // default-length (1.1 s) fade starts, i.e. half a
                                      // second past the fade — the criterion-23 deadline
                                      // scales with a caller-supplied fadeMs this way.
const HIDDEN_FADE_S = 0.2; // musicGain fade on visibilitychange->hidden (§5.5.1)
const VISIBLE_FADE_S = 0.5; // and back on ->visible
const RESUME_LEAD_S = 0.1; // §5.5.1: on visible, next = currentTime + 0.1. Also used as
                           // the start offset of a fresh track so bar 0 is never
                           // scheduled in the past.
const GAIN_FLOOR = 0.0001; // exponential ramps cannot target 0

// Bass/comp voices, spec 02 §5.5.9 steps 3-4 — tone() option objects, values normative.
const BASS_PULSE8 = { type: "square", cut: 900, v: 0.3, d: 0.06, s: 0.4, r: 0.08, sub: 0.5 };
const BASS_DRIVE16 = { type: "sawtooth", cut: 520, sweep: 180, q: 6, v: 0.26, sub: 0.7 };
const BASS_FUNK16 = { type: "square", cut: 750, v: 0.28, d: 0.05, s: 0.3, r: 0.06, sub: 0.4 };
const BASS_WALK4 = { type: "sine", cut: 500, v: 0.3, a: 0.02, d: 0.2, s: 0.5, r: 0.2 };
const STAB_VOICE = {
  type: "sawtooth", cut: 2400, v: 0.1, a: 0.006, d: 0.08, s: 0.3, r: 0.12, detune: 8, send: 0.12,
};
const STAB_VOICE_DRIVE16 = { ...STAB_VOICE, detune: 12 }; // §5.5.9 step 4, drive16 case
const PAD_VOICE = { type: "sawtooth", cut: 2600, v: 0.075, a: 0.55, detune: 6, send: 0.55 };

// Note lengths §5.5.9 leaves unstated (it fixes pulse8 0.42·spb, drive16 0.2·spb, the
// walk4 pad 3.8·spb and the drive16 stab 0.5·spb, and nothing else). These three are
// this task's picks, reported as a spec gap — each copies the nearest stated value.
const FUNK16_DUR = 0.2; // as drive16, the other sixteenth-note bass style
const WALK4_DUR = 0.9; // quarters, just short of legato
const STAB_DUR = 0.5; // as the drive16 stab, the only stab length the spec gives

const FUNK16_PATTERN = "x..x..x...x..x.."; // §5.5.9 step 3, funk16
const SEMITONE_DOWN = Math.pow(2, -1 / 12); // walk4's approach note (semitone below the
                                            // next bar's root)
const CASHFLOW_OFF_HATS = "..h...h...h...h."; // §5.5.10 cashflow, the 0.35-velocity layer

// "Oof Plaza" (Hub) — C major, sunny front-lawn bounce. Spec 02 §5.5.10.
const plaza = {
  id: "plaza",
  title: "Oof Plaza",
  bpm: 112,
  bars: 8,
  swing: 0,
  bass: "pulse8",
  chords: [
    ["C3", "E4", "G4", "C5"],
    ["A2", "C4", "E4", "A4"],
    ["F2", "A3", "C4", "F4"],
    ["G2", "B3", "D4", "G4"],
  ],
  roots: ["C2", "A1", "F1", "G1"],
  leadVoice: { type: "square", cut: 3400, v: 0.18, a: 0.01, d: 0.12, s: 0.6, r: 0.22, send: 0.25 },
  lead: [
    [0, 0, "E5", 1], [0, 1, "G5", 0.5], [0, 1.5, "A5", 0.5], [0, 2, "G5", 1], [0, 3, "E5", 1],
    [1, 0, "C5", 1], [1, 1, "E5", 1], [1, 2, "D5", 2],
    [2, 0, "F5", 1], [2, 1, "A5", 0.5], [2, 1.5, "G5", 0.5], [2, 2, "F5", 1], [2, 3, "E5", 1],
    [3, 0, "D5", 2], [3, 2, "G5", 2],
    [4, 0, "E5", 1], [4, 1, "G5", 0.5], [4, 1.5, "C6", 0.5], [4, 2, "B5", 1], [4, 3, "G5", 1],
    [5, 0, "A5", 1.5], [5, 1.5, "G5", 0.5], [5, 2, "E5", 2],
    [6, 0, "F5", 1], [6, 1, "E5", 1], [6, 2, "D5", 1], [6, 3, "B4", 1],
    [7, 0, "C5", 3], [7, 3, "G4", 1],
  ],
  drums(bar) {
    if (bar % 8 === 7) return "k..hk.hck.khk.kc";
    if (bar % 4 === 3) return "k..hk.hck..hk.hH";
    return "k..hk.hck..hk.hc";
  },
};

// "Tower Wind" (obby) — E natural minor, forward lean, climbing urgency. §5.5.10.
const ascent = {
  id: "ascent",
  title: "Tower Wind",
  bpm: 132,
  bars: 8,
  swing: 0,
  bass: "drive16",
  chords: [
    ["E3", "G3", "B3", "E4"],
    ["C3", "E3", "G3", "C4"],
    ["G2", "B3", "D4", "G4"],
    ["D3", "F#3", "A3", "D4"],
  ],
  roots: ["E1", "C2", "G1", "D2"],
  leadVoice: {
    type: "sawtooth", cut: 3200, v: 0.16, a: 0.006, d: 0.1, s: 0.55, r: 0.2, detune: 10, send: 0.25,
  },
  lead: [
    [0, 0, "B4", 0.5], [0, 0.5, "E5", 0.5], [0, 1, "G5", 0.5], [0, 1.5, "F#5", 0.5],
    [0, 2, "E5", 1], [0, 3, "B4", 1],
    [1, 0, "C5", 0.5], [1, 0.5, "E5", 0.5], [1, 1, "G5", 1], [1, 2, "E5", 2],
    [2, 0, "D5", 0.5], [2, 0.5, "G5", 0.5], [2, 1, "B5", 0.5], [2, 1.5, "A5", 0.5],
    [2, 2, "G5", 1], [2, 3, "D5", 1],
    [3, 0, "F#5", 1], [3, 1, "A5", 1], [3, 2, "D5", 2],
    [4, 0, "E5", 0.5], [4, 0.5, "G5", 0.5], [4, 1, "B5", 0.5], [4, 1.5, "E6", 0.5],
    [4, 2, "D6", 1], [4, 3, "B5", 1],
    [5, 0, "C6", 1.5], [5, 1.5, "B5", 0.5], [5, 2, "G5", 2],
    [6, 0, "B5", 0.5], [6, 0.5, "A5", 0.5], [6, 1, "G5", 0.5], [6, 1.5, "F#5", 0.5],
    [6, 2, "G5", 1], [6, 3, "A5", 1],
    [7, 0, "B5", 2], [7, 2, "F#5", 2],
  ],
  drums(bar) {
    if (bar % 8 === 7) return "k.hhs.hhttttssss";
    if (bar % 2 === 1) return "k.hhs.hhk.hhs.hh";
    return "k.hhk.hhk.hhk.hh";
  },
};

// "Pump Protocol" (lifting) — A mixolydian, gym swagger, squarish funk. §5.5.10.
const pump = {
  id: "pump",
  title: "Pump Protocol",
  bpm: 126,
  bars: 8,
  swing: 0,
  bass: "funk16",
  chords: [
    ["A3", "C#4", "E4", "G4"],
    ["G3", "B3", "D4", "G4"],
    ["D3", "F#3", "A3", "C4"],
    ["A3", "C#4", "E4", "A4"],
  ],
  roots: ["A1", "G1", "D2", "A1"],
  leadVoice: { type: "square", cut: 2800, v: 0.17, a: 0.008, d: 0.1, s: 0.5, r: 0.18, send: 0.2 },
  lead: [
    [0, 0, "E5", 0.5], [0, 0.75, "G5", 0.25], [0, 1, "A5", 1], [0, 2.5, "G5", 0.5], [0, 3, "E5", 1],
    [1, 0, "D5", 0.5], [1, 0.75, "B4", 0.25], [1, 1, "D5", 1], [1, 2, "G5", 1.5],
    [2, 0, "F#5", 0.5], [2, 0.75, "A5", 0.25], [2, 1, "F#5", 1], [2, 2.5, "D5", 0.5],
    [2, 3, "C5", 1],
    [3, 0, "C#5", 1], [3, 1, "E5", 1], [3, 2, "A4", 2],
    [4, 0, "A5", 0.5], [4, 0.75, "C#6", 0.25], [4, 1, "A5", 1], [4, 2.5, "G5", 0.5],
    [4, 3, "E5", 1],
    [5, 0, "G5", 0.5], [5, 0.75, "B5", 0.25], [5, 1, "G5", 1], [5, 2, "D5", 1.5],
    [6, 0, "F#5", 0.5], [6, 1, "A5", 0.5], [6, 1.5, "B5", 0.5], [6, 2, "A5", 0.5],
    [6, 2.5, "F#5", 0.5], [6, 3, "D5", 1],
    [7, 0, "E5", 1.5], [7, 1.5, "C#5", 0.5], [7, 2, "A4", 2],
  ],
  drums(bar) {
    if (bar % 8 === 7) return "k..hs.k.k.sss.cc";
    if (bar % 4 === 3) return "k..hs..hk.k.s.cc";
    return "k..hs..hk.k.s..h";
  },
};

// "Cash Flow" (tycoon) — F major 7ths, swung, mischievous elevator-money. §5.5.10.
const cashflow = {
  id: "cashflow",
  title: "Cash Flow",
  bpm: 104,
  bars: 8,
  swing: 0.07,
  bass: "walk4",
  chords: [
    ["F3", "A3", "C4", "E4"],
    ["D3", "F3", "A3", "C4"],
    ["G3", "Bb3", "D4", "F4"],
    ["C3", "E3", "G3", "Bb3"],
  ],
  roots: ["F1", "D1", "G1", "C2"],
  leadVoice: { type: "triangle", cut: 3000, v: 0.2, a: 0.02, d: 0.25, s: 0.45, r: 0.6, send: 0.45 },
  lead: [
    [0, 1, "A4", 1], [0, 2, "C5", 0.5], [0, 2.5, "E5", 0.5], [0, 3, "C5", 1],
    [1, 0, "D5", 1.5], [1, 1.5, "C5", 0.5], [1, 2, "A4", 2],
    [2, 1, "Bb4", 1], [2, 2, "D5", 0.5], [2, 2.5, "F5", 0.5], [2, 3, "D5", 1],
    [3, 0, "E5", 1], [3, 1, "G4", 1], [3, 2, "C5", 2],
    [4, 1, "A4", 1], [4, 2, "C5", 0.5], [4, 2.5, "E5", 0.5], [4, 3, "G5", 1],
    [5, 0, "F5", 1.5], [5, 1.5, "E5", 0.5], [5, 2, "C5", 2],
    [6, 1, "D5", 1], [6, 2, "F5", 1], [6, 3, "G5", 1],
    [7, 0, "A5", 1], [7, 1, "G5", 0.5], [7, 1.5, "E5", 0.5], [7, 2, "F5", 2],
  ],
  // Odd bars add the soft off-hat layer (§5.5.10: "two `steps` calls merged", velocity
  // 0.35) — hence the layered [pattern, velocity] return shape, see scheduleDrums().
  drums(bar) {
    const main = bar % 8 === 7 ? "k...r..hk.k.r.rr" : "k...r..hk.k.r...";
    if (bar % 2 === 1) return [[main, 1], [CASHFLOW_OFF_HATS, 0.35]];
    return [[main, 1]];
  },
};

// The 4 tracks, spec 02 §5.5.10. Track<->Place binding lives in each Place's
// place.json `music` field, never here.
// The boombox track (spec 16). Slow, swung, and deliberately sparse: it plays ON TOP of
// whatever Place music is already going, so it has to sit under it rather than fight it.
// A ii-V-I-vi in F major at 78 bpm with a triangle lead and a soft send — the same
// synthesis every other track uses, just at low energy.
const chill = {
  id: "chill",
  title: "Chill",
  bpm: 78,
  bars: 8,
  swing: 0.18,
  bass: "pulse8",
  chords: [
    ["G2", "Bb3", "D4", "F4"],
    ["C3", "E4", "G4", "Bb4"],
    ["F2", "A3", "C4", "E4"],
    ["D3", "F4", "A4", "C5"],
  ],
  roots: ["G1", "C2", "F1", "D2"],
  leadVoice: { type: "triangle", cut: 2200, v: 0.13, a: 0.05, d: 0.3, s: 0.5, r: 0.5, send: 0.42 },
  lead: [
    [0, 0, "D5", 2], [0, 2, "F5", 1.5],
    [1, 0, "E5", 2], [1, 2.5, "G5", 1.5],
    [2, 0, "A5", 1.5], [2, 2, "F5", 2],
    [3, 0, "E5", 3],
    [4, 0, "D5", 2], [4, 2, "C5", 1.5],
    [5, 0, "Bb4", 2], [5, 2.5, "D5", 1.5],
    [6, 0, "F5", 1.5], [6, 2, "E5", 2],
    [7, 0, "D5", 4],
  ],
  // Brushed and sparse: a kick on 1 and 3 with hats off the beat. The boombox plays OVER
  // a Place track, so anything busier turns two songs into noise.
  drums(bar) {
    if (bar % 4 === 3) return "k..h..h.k..h..hc";
    return "k..h..h.k..h..h.";
  },
};

// "Clash" (Boss Battles) — spec 22 owns this one. A minor at 140, the drive16 bass in
// full sprint and a sawtooth lead that keeps landing on the raised seventh (G#) so the
// loop never resolves: a fight should feel one bar from over the whole time.
const clash = {
  id: "clash",
  title: "Clash",
  bpm: 140,
  bars: 8,
  swing: 0,
  bass: "drive16",
  chords: [
    ["A2", "C3", "E3", "A3"],
    ["F2", "A2", "C3", "F3"],
    ["G2", "B2", "D3", "G3"],
    ["E2", "G#2", "B2", "E3"],
  ],
  roots: ["A1", "F1", "G1", "E1"],
  leadVoice: {
    type: "sawtooth", cut: 3600, v: 0.15, a: 0.004, d: 0.09, s: 0.5, r: 0.15, detune: 14, send: 0.2,
  },
  lead: [
    [0, 0, "A4", 0.5], [0, 0.5, "C5", 0.5], [0, 1, "E5", 0.5], [0, 1.5, "C5", 0.5],
    [0, 2, "A4", 1], [0, 3, "E5", 1],
    [1, 0, "F5", 0.75], [1, 0.75, "E5", 0.25], [1, 1, "D5", 0.5], [1, 1.5, "C5", 0.5], [1, 2, "D5", 2],
    [2, 0, "G5", 0.5], [2, 0.5, "F5", 0.5], [2, 1, "E5", 0.5], [2, 1.5, "D5", 0.5],
    [2, 2, "E5", 1], [2, 3, "B4", 1],
    [3, 0, "E5", 1], [3, 1, "G#4", 0.5], [3, 1.5, "B4", 0.5], [3, 2, "E5", 2],
    [4, 0, "A5", 0.5], [4, 0.5, "G5", 0.5], [4, 1, "E5", 0.5], [4, 1.5, "C5", 0.5],
    [4, 2, "A4", 1], [4, 3, "C5", 1],
    [5, 0, "F5", 1], [5, 1, "A5", 1], [5, 2, "G5", 0.5], [5, 2.5, "F5", 0.5], [5, 3, "E5", 1],
    [6, 0, "G5", 0.5], [6, 0.5, "A5", 0.5], [6, 1, "B5", 1], [6, 2, "G5", 1], [6, 3, "D5", 1],
    [7, 0, "E5", 1.5], [7, 1.5, "G#4", 0.5], [7, 2, "B4", 1], [7, 3, "E5", 1],
  ],
  // A sprint with a backbeat; the eighth bar is the fill that says "phase two".
  drums(bar) {
    if (bar % 8 === 7) return "k.s.k.s.kstststs";
    if (bar % 2 === 1) return "k.h.s.h.k.h.s.hh";
    return "k..hk..hk..hks..";
  },
};

// "Drift" (Speed's Void + Flash zones) — an ORIGINAL slow, dreamy lofi piece. Written to
// sit calm and spacious after the frantic clash track, so reaching the end-game feels
// like floating out into the quiet. Am7-Fmaj7-Cmaj7-Em7 at 70 bpm, soft triangle lead,
// almost no drums. Not a copy of any existing song — the same synth every track uses.
const voidchill = {
  id: "voidchill",
  title: "Drift",
  bpm: 70,
  bars: 8,
  swing: 0.16,
  bass: "pulse8",
  chords: [
    ["A2", "C4", "E4", "G4"],
    ["F2", "A3", "C4", "E4"],
    ["C3", "E4", "G4", "B4"],
    ["E2", "G3", "B3", "D4"],
  ],
  roots: ["A1", "F1", "C2", "E1"],
  leadVoice: { type: "triangle", cut: 2000, v: 0.12, a: 0.06, d: 0.35, s: 0.5, r: 0.6, send: 0.5 },
  lead: [
    [0, 0, "E5", 2], [0, 2, "A5", 2],
    [1, 0, "C5", 1.5], [1, 2, "A4", 2],
    [2, 0, "E5", 2], [2, 2, "G5", 1.5],
    [3, 0, "B4", 1.5], [3, 2, "D5", 2],
    [4, 0, "A5", 2], [4, 2, "E5", 1.5],
    [5, 0, "F5", 2], [5, 2, "C5", 2],
    [6, 0, "G5", 1.5], [6, 2, "E5", 2],
    [7, 0, "B4", 4],
  ],
  // barely-there percussion: a soft kick on the one, a single hat every eighth bar.
  drums(bar) {
    if (bar % 8 === 7) return "k.......h.......";
    return "k...............";
  },
};

// ===================================================================================
// ===== PIG HIDE soundtrack — six original `engine: 2` tracks that follow the round ==
// ===== (lobby -> hide -> chase/frenzy -> result). They are scheduled ONLY by =========
// ===== scheduleBarV2 inside createAudio(); every field below that the legacy ========
// ===== scheduler does not know (engine, form, bassLine, parts, comp(), gain, delay, =
// ===== duck, loopFrom, fadeInS, gruntNote, timpNote) is read nowhere else. ===========
// =====   note entry: [bar, beat, note | note[], beats, vel?, toneOptsOverride?] =======
// =====   chord: [lowRef, n1, n2, n3] — comp/arp/pad voice n1..n3 ====================
// =====   drums(bar, pass, lvl): [[16-step pattern, velocity], ...]; extra kit chars ==
// =====   w woodblock, x shaker, S snap, o/p bongos, b cowbell, C crash, z riser, =====
// =====   g pig grunt, J timpani (DRUM_X) ==========================================
// ===================================================================================

// Voices (tone() option objects). Only the lead brass (3-osc) and the pads (2-osc) use unison.
const PH_UPRIGHT = { type: "triangle", cut: 950, sweep: 320, q: 2.2, v: 0.34, a: 0.004, d: 0.16, s: 0.3, r: 0.1, sub: 0.55 };
const PH_PIZZ = { type: "triangle", cut: 2600, sweep: 700, q: 2.5, v: 0.1, a: 0.002, d: 0.11, s: 0.06, r: 0.14, send: 0.24, pan: -0.25 };
const PH_WHISTLE = { type: "sine", v: 0.13, a: 0.025, d: 0.1, s: 0.8, r: 0.09, vib: { hz: 5.6, cents: 16 }, send: 0.3, dly: 0.16, pan: 0.1 };
const PH_CLARINET = { type: "square", cut: 1700, q: 1.2, v: 0.085, a: 0.025, d: 0.12, s: 0.7, r: 0.08, vib: { hz: 5, cents: 8 }, send: 0.2, dly: 0.22, pan: -0.1 };
const PH_MUTE_TPT = { type: "sawtooth", cut: 850, sweep: 2400, q: 4.5, v: 0.08, a: 0.008, d: 0.08, s: 0.6, r: 0.07, detune: 6, send: 0.18, pan: 0.3 };
const PH_BRASS = { type: "sawtooth", uni: 3, detune: 9, spread: 0.3, cut: 1500, sweep: 3600, q: 1.6, v: 0.12, a: 0.014, d: 0.14, s: 0.72, r: 0.09, send: 0.16, dly: 0.1 };
const PH_BRASS2 = { type: "sawtooth", detune: 13, cut: 1300, sweep: 3000, q: 1.6, v: 0.075, a: 0.014, d: 0.14, s: 0.72, r: 0.09, send: 0.16, pan: -0.25 };
const PH_LOWBRASS = { type: "sawtooth", detune: 11, cut: 900, sweep: 1800, q: 1.6, v: 0.09, a: 0.014, d: 0.14, s: 0.72, r: 0.09, send: 0.16 };
const PH_DOUBLE = { type: "sawtooth", detune: 7, cut: 1000, sweep: 2200, q: 1.2, v: 0.05, a: 0.01, d: 0.12, s: 0.7, r: 0.08, send: 0.12, pan: -0.3 };
const PH_STAB = { type: "sawtooth", cut: 3200, sweep: 900, q: 1.3, v: 0.055, a: 0.004, d: 0.11, s: 0.3, r: 0.09, detune: 11, send: 0.14, pan: 0.2 };
const PH_GLOCK = { type: "sine", v: 0.07, a: 0.001, d: 0.28, s: 0.04, r: 0.45, send: 0.4, dly: 0.2, pan: 0.35 };
const PH_SLIDE = { type: "sine", v: 0.09, a: 0.03, d: 0.1, s: 0.85, r: 0.12, vib: { hz: 7, cents: 20 }, send: 0.35, pan: 0.15 };
const PH_DRONE = { type: "triangle", cut: 900, v: 0.06, a: 0.6, d: 0.4, s: 0.85, r: 0.8, detune: 7, send: 0.5 };
const PH_CHASE_BASS = { type: "sawtooth", cut: 420, fenv: { amt: 1100, d: 0.07, s: 0.15 }, q: 3, v: 0.22, a: 0.003, d: 0.07, s: 0.4, r: 0.05, sub: 0.6 };
const PH_FRENZY_BASS = { type: "sawtooth", cut: 460, fenv: { amt: 1200, d: 0.05, s: 0.12 }, q: 4, v: 0.2, a: 0.003, d: 0.06, s: 0.35, r: 0.04, sub: 0.6 };
const PH_TUBA = { type: "sawtooth", cut: 560, q: 1.2, v: 0.26, a: 0.012, d: 0.1, s: 0.6, r: 0.07, sub: 0.5 };
const PH_ARP = { type: "square", cut: 900, fenv: { amt: 2600, d: 0.05, s: 0 }, q: 3, a: 0.001, d: 0.07, s: 0.05, r: 0.05, v: 0.045, dly: 0.15 };
const PH_PAD = { type: "sawtooth", uni: 2, detune: 12, spread: 0.9, cut: 1400, hp: 280, a: 0.35, d: 0.5, s: 0.8, r: 0.5, v: 0.03, send: 0.45 };
const PH_HIDEPAD = { type: "triangle", uni: 2, detune: 8, spread: 0.9, cut: 1100, hp: 180, a: 0.9, d: 0.8, s: 0.8, r: 1.0, v: 0.035, send: 0.5 };
const PH_READY = { type: "triangle", cut: 3200, fenv: { amt: 1500, d: 0.06, s: 0.1 }, a: 0.003, d: 0.11, s: 0.18, r: 0.12, v: 0.14, send: 0.18, dly: 0.2, pan: -0.35 };

// notes laid on an even grid: notes[i] at beat i*step, each `dur` beats (opt. velocity)
function phGrid(bar, notes, step, dur, vel) {
  return notes.map((n, i) => (vel == null ? [bar, i * step, n, dur] : [bar, i * step, n, dur, vel]));
}
const PH_FILL = "k..ks..ks.sstttt"; // snare-and-tom turnaround shared by chase bars 7/15/31
const PH_EIGHTH_COMP = Array.from({ length: 8 }, (_, k) => [k * 0.5, 0.25, 0.55]);
const PH_SIXTEENTH_SWELL = Array.from({ length: 12 }, (_, i) => [i * 0.25, 0.2, 0.4 + (0.5 * i) / 11]);

// ---- "Snout About Town" (pighide_lobby) — F major, swung whistle-and-pizzicato stroll.
const PH_LOBBY_LEAD = [
  [0, 0, "C5", 0.5], [0, 0.5, "A4", 0.5], [0, 1, "C5", 0.5], [0, 1.5, "D5", 0.5], [0, 2, "F5", 0.75], [0, 2.75, "E5", 0.25], [0, 3, "C5", 1],
  [1, 0, "D5", 0.5], [1, 0.5, "A4", 0.5], [1, 1.5, "F4", 0.5], [1, 2, "A4", 1.5],
  [2, 0, "Bb4", 0.5], [2, 0.5, "G4", 0.5], [2, 1, "Bb4", 0.5], [2, 1.5, "C5", 0.5], [2, 2, "D5", 0.75], [2, 2.75, "F5", 0.25], [2, 3, "E5", 0.5], [2, 3.5, "D5", 0.5],
  [3, 0, "E5", 1], [3, 1, "G4", 0.5], [3, 1.5, "Bb4", 0.5], [3, 2, "C5", 1.5],
  [4, 0, "C5", 0.5], [4, 0.5, "A4", 0.5], [4, 1, "C5", 0.5], [4, 1.5, "D5", 0.5], [4, 2, "F5", 0.5], [4, 2.5, "A5", 0.5], [4, 3, "G5", 0.5], [4, 3.5, "F5", 0.5],
  [5, 0, "E5", 0.75], [5, 0.75, "F5", 0.25], [5, 1, "D5", 1], [5, 2, "A4", 0.5], [5, 2.5, "C5", 0.5], [5, 3, "D5", 1],
  [6, 0, "F5", 0.5], [6, 0.5, "D5", 0.5], [6, 1, "Bb4", 0.5], [6, 1.5, "D5", 0.5], [6, 2, "G5", 1], [6, 3, "F5", 0.5], [6, 3.5, "E5", 0.5],
  [7, 0, "F5", 1.5], [7, 2, "C5", 0.5], [7, 2.5, "A4", 0.5], [7, 3, "F4", 1],
  [8, 0, "A5", 1.5], [8, 1.5, "F5", 0.5], [8, 2, "D5", 1], [8, 3, "F5", 1],
  [9, 0, "Ab5", 1.5], [9, 1.5, "F5", 0.5], [9, 2, "D5", 1], [9, 3, "B4", 1],
  [10, 0, "C5", 0.5], [10, 0.5, "E5", 0.5], [10, 1, "G5", 0.5], [10, 1.5, "A5", 0.5], [10, 2, "G5", 1], [10, 3, "E5", 1],
  [11, 0, "F#5", 1], [11, 1, "A5", 0.5], [11, 1.5, "F#5", 0.5], [11, 2, "D5", 0.5], [11, 2.5, "C5", 0.5], [11, 3, "A4", 1],
  [12, 0, "Bb4", 0.5], [12, 0.5, "D5", 0.5], [12, 1, "G5", 0.5], [12, 1.5, "F5", 0.5], [12, 2, "D5", 0.5], [12, 2.5, "Bb4", 0.5], [12, 3, "D5", 1],
  [13, 0, "E5", 0.5], [13, 0.5, "G5", 0.5], [13, 1, "Bb5", 1], [13, 2, "A5", 0.5], [13, 2.5, "G5", 0.5], [13, 3, "E5", 1],
  [14, 0, "F5", 0.5], [14, 0.5, "C5", 0.5], [14, 1, "A4", 0.5], [14, 1.5, "C5", 0.5], [14, 2, "F5", 1.5],
  [15, 0, "G5", 0.5, 0.8], [15, 0.5, "E5", 0.5, 0.8], [15, 1, "C5", 1], [15, 2.5, "A4", 0.5], [15, 3, "Bb4", 0.5], [15, 3.5, "B4", 0.5],
];
// lobby bass bars that are not plain quarter notes (4, 7, 15)
const PH_LOBBY_BASS_X = [
  [4, 0, "F1", 1], [4, 1, "F2", 0.5], [4, 1.5, "E2", 0.5], [4, 2, "C2", 1], [4, 3, "C#2", 1],
  [7, 0, "F1", 1], [7, 1, "A1", 1], [7, 2, "C2", 1], [7, 3, "C2", 0.5], [7, 3.5, "A1", 0.5], // F cadence (A1 leads up to Bb1)
  [15, 0, "C2", 1], [15, 1, "C2", 0.5], [15, 1.5, "G1", 0.5], [15, 2, "Bb1", 1], [15, 3, "E1", 1],
];
const PH_LOBBY_BASS = [
  ...phGrid(0, ["F1", "A1", "C2", "C#2"], 1, 1),
  ...phGrid(1, ["D2", "C2", "A1", "Ab1"], 1, 1),
  ...phGrid(2, ["G1", "Bb1", "D2", "Db2"], 1, 1),
  ...phGrid(3, ["C2", "Bb1", "G1", "E1"], 1, 1),
  ...phGrid(5, ["D2", "A1", "F1", "Ab1"], 1, 1),
  ...phGrid(6, ["G1", "A1", "Bb1", "C2"], 1, 1), // C2: the V under Gm7, into the F cadence
  ...phGrid(8, ["Bb1", "D2", "F2", "Bb1"], 1, 1),
  ...phGrid(9, ["B1", "D2", "F2", "Ab1"], 1, 1),
  ...phGrid(10, ["A1", "C2", "E2", "Eb2"], 1, 1),
  ...phGrid(11, ["D2", "C2", "A1", "Ab1"], 1, 1),
  ...phGrid(12, ["G1", "D2", "Bb1", "Db2"], 1, 1),
  ...phGrid(13, ["C2", "G1", "Bb1", "E1"], 1, 1),
  ...phGrid(14, ["F1", "A1", "Bb1", "B1"], 1, 1),
  ...PH_LOBBY_BASS_X,
];
const PH_LOBBY_CLAR = [
  [8, 0, "D4", 2], [8, 2, "F4", 2],
  [9, 0, "D4", 2], [9, 2, "F4", 2],
  [10, 0, "E4", 2], [10, 2, "G4", 2],
  [11, 0, "F#4", 2], [11, 2, "C5", 2],
];
const PH_LOBBY_GLOCK = [
  [0, 3, "A6", 0.5], [0, 3.5, "G6", 0.5],
  [1, 2, "F6", 1], [1, 3, "E6", 1],
  [2, 3, "D6", 0.5], [2, 3.5, "E6", 0.5],
  [3, 2, "G6", 1.5], [3, 3.5, "E6", 0.5],
  [4, 2, "F6", 0.5], [4, 2.5, "A6", 0.5],
  [5, 1, "D6", 1],
  [6, 2, "G6", 1],
  [7, 0, "F6", 1.5],
  [12, 3, "F6", 1],
  [13, 3, "G6", 1],
  [14, 2, "A6", 0.5], [14, 2.5, "C7", 0.5], [14, 3, "A6", 1],
];
const PH_LOBBY_PUNCH = [
  [7, 3.5, ["A4", "C5", "F5"], 0.5, 0.8],
  [15, 0, ["Bb4", "E5", "G5"], 0.5], [15, 1, ["Bb4", "E5", "G5"], 0.25, 0.8],
];

const pighide_lobby = {
  id: "pighide_lobby",
  title: "Snout About Town",
  engine: 2,
  bpm: 108,
  bars: 16,
  swing: 0.12,
  gain: 0.85,
  delay: { beats: 0.75, fb: 0.3, cut: 2600, wet: 0.4 },
  gruntNote: "F3",
  leadVoice: PH_WHISTLE,
  bassVoice: PH_UPRIGHT,
  bassGate: 0.9,
  compVoice: PH_PIZZ,
  chords: [
    ["F2", "A3", "C4", "E4"], // Fmaj7
    ["D2", "F3", "A3", "C4"], // Dm7
    ["G2", "Bb3", "D4", "F4"], // Gm7
    ["C2", "Bb3", "E4", "G4"], // C7
    ["Bb1", "A3", "D4", "F4"], // Bbmaj7
    ["B1", "Ab3", "D4", "F4"], // B°7
    ["A1", "G3", "C4", "E4"], // Am7
    ["D2", "F#3", "A3", "C4"], // D7
    ["F2", "A3", "C4", "D4"], // F6: the cadence chord (no E under the melody's F)
  ],
  form: [0, 1, 2, 3, 0, 1, 2, 8, 4, 5, 6, 7, 2, 3, 8, 3], // bars 7/14 cadence on F (the melody resolves there)
  bassLine: PH_LOBBY_BASS,
  comp(bar) {
    if (bar >= 8 && bar <= 11) return [[0, 1.8, 0.7], [2, 1.8, 0.7]];
    if (bar % 2 === 1) return [[1, 0.4], [2.5, 0.3, 0.6], [3, 0.4]];
    return [[1, 0.4], [3, 0.4]];
  },
  lead: PH_LOBBY_LEAD,
  parts: [
    { voice: { ...PH_CLARINET, v: 0.07 }, notes: PH_LOBBY_CLAR }, // bridge counter-line
    { voice: PH_GLOCK, every: 2, offset: 1, notes: PH_LOBBY_GLOCK }, // odd passes only
    { voice: PH_STAB, notes: PH_LOBBY_PUNCH },
    // "round starting" layer: only while the start countdown runs (intensity 1)
    { voice: PH_READY, min: 1, gate: 0.7, arp: { steps: "1.2.3.4.3.2.1.2.", oct: 0 } },
  ],
  drums(bar, pass, lvl) {
    const L = [
      [bar === 15 ? "k.....k...k.o.pp" : bar % 4 === 3 ? "k.....k...k.k..." : "k.....k...k.....", 1],
      ["....S.......S...", 0.9],
      ["x.x.x.x.x.x.x.x.", 0.5],
    ];
    if (bar >= 8 && bar <= 11) L.push(["......w.....w.w.", 0.7]);
    if (bar === 8) L.push(["H...............", 0.6]);
    if (pass % 2 === 1 && bar % 4 === 1) L.push(["..........o.p.p.", 0.5]);
    if (bar === 7) L.push(["..............g.", 0.7]);
    if (lvl >= 1) L.push(["w...w...w...w...", 0.9]); // countdown tick
    return L;
  },
};

// ---- "Tiptoe Countdown" (pighide_hide) — D minor. 12 bars at 96 bpm = 30.0 s, the
// hide phase exactly: the creep (bars 8-10) and riser (bar 11) land on the cage release.
const PH_HIDE_LEAD = [
  [0, 0, "D4", 0.25], [0, 0.5, "F4", 0.25], [0, 1, "A4", 0.5], [0, 1.75, "G#4", 0.25], [0, 2, "A4", 0.5], [0, 3, "F4", 0.25], [0, 3.5, "E4", 0.25],
  [1, 0, "D4", 0.25], [1, 0.5, "F4", 0.25], [1, 1, "A4", 0.5], [1, 1.75, "Bb4", 0.25], [1, 2, "C5", 0.75], [1, 3, "A4", 0.5],
  [2, 0, "D5", 0.25], [2, 0.5, "C5", 0.25], [2, 1, "Bb4", 0.25], [2, 1.5, "A4", 0.25], [2, 2, "F4", 0.5], [2, 2.75, "G4", 0.25], [2, 3, "A4", 0.5],
  [3, 0, "C#5", 0.25], [3, 0.5, "E5", 0.25], [3, 1, "G5", 0.75], [3, 2, "F5", 0.25], [3, 2.5, "E5", 0.25], [3, 3, "C#5", 0.25], [3, 3.5, "Bb4", 0.25],
  [4, 0, "D5", 0.25], [4, 0.5, "F5", 0.25], [4, 1, "A5", 0.5], [4, 1.75, "G#5", 0.25], [4, 2, "A5", 0.5],
  [5, 0, "D5", 0.25], [5, 0.5, "F5", 0.25], [5, 1, "A5", 0.5], [5, 1.75, "Bb5", 0.25], [5, 2, "C6", 0.5],
  [6, 0, "Bb5", 0.25], [6, 0.5, "A5", 0.25], [6, 1, "G5", 0.25], [6, 1.5, "E5", 0.25], [6, 2, "D5", 0.5], [6, 2.75, "C#5", 0.25], [6, 3, "D5", 0.5],
  [7, 0, "E5", 0.25], [7, 0.5, "G5", 0.25], [7, 1, "Bb5", 0.75], [7, 2, "A5", 1.5],
  [8, 0, "A4", 2], [8, 2, "Bb4", 2],
  [9, 0, "B4", 2], [9, 2, "C5", 2],
  [10, 0, "Db5", 2], [10, 2, "Eb5", 2],
  [11, 0, "E5", 1], [11, 1, "F5", 1], [11, 2, "G5", 0.5], [11, 2.5, "Bb5", 0.5], [11, 3, "C#6", 0.25],
];
const PH_HIDE_BASS = [
  ...phGrid(0, ["D2", "A1", "D2", "C#2"], 1, 0.4),
  ...phGrid(1, ["C2", "G1", "C2", "B1"], 1, 0.4),
  ...phGrid(2, ["Bb1", "F1", "D2", "Bb1"], 1, 0.4),
  ...phGrid(3, ["A1", "C#2", "E2", "Eb2"], 1, 0.4),
  ...phGrid(4, ["D2", "A1", "D2", "C#2"], 1, 0.4),
  ...phGrid(5, ["C2", "G1", "C2", "A1"], 1, 0.4),
  ...phGrid(6, ["G1", "Bb1", "E2", "G#1"], 1, 0.4),
  ...phGrid(7, ["A1", "E2", "G2", "C#2"], 1, 0.4),
  ...phGrid(8, ["D2", "D2", "D2", "D2", "D2", "D2", "A1", "F#1"], 0.5, 0.4),
  ...phGrid(9, ["G1", "G1", "G1", "G1", "B1", "B1", "D2", "D2"], 0.5, 0.4),
  ...phGrid(10, ["Eb2", "Eb2", "Eb2", "Eb2", "Db2", "Db2", "Bb1", "Bb1"], 0.5, 0.4),
  ...Array.from({ length: 12 }, (_, i) => [11, i * 0.25, "A1", 0.2, 0.6 + (0.4 * i) / 11]),
  [11, 3, "A1", 0.25, 1],
];
const PH_HIDE_TPT = [
  [4, 3, "A4", 0.25], [4, 3.5, "A4", 0.25],
  [5, 3, "C5", 0.25], [5, 3.5, "A4", 0.25],
  [7, 3, "E4", 0.25], [7, 3.5, "Eb4", 0.25],
  [8, 0, ["F4", "A4"], 0.25],
  [9, 0, ["B3", "F4"], 0.25],
  [10, 0, ["G4", "Db5"], 0.25],
  [11, 0, ["G4", "C#5"], 0.25], [11, 3, ["G4", "C#5", "E5"], 0.5],
];
const PH_HIDE_DRONE = [
  [8, 0, "D3", 4],
  [9, 0, "D3", 4],
  [10, 0, "Eb3", 4],
  [11, 0, "E3", 3],
];
const PH_HIDE_GLOCK = [
  [0, 3.5, "A6", 0.5],
  [1, 3.5, "F6", 0.5],
  [2, 3.5, "D6", 0.5],
  [3, 3.5, "C#6", 0.5],
  [4, 3.5, "D6", 0.5],
  [5, 3.5, "A5", 0.5],
  [6, 3.5, "E6", 0.5],
  [7, 3.5, "G6", 0.5],
];

const pighide_hide = {
  id: "pighide_hide",
  title: "Tiptoe Countdown",
  engine: 2,
  bpm: 96,
  bars: 12,
  loopFrom: 8, // a late seek start keeps the creep + riser cycling, never bar 0 again
  swing: 0.06,
  gain: 1.2,
  fadeInS: 0.6,
  delay: { beats: 0.75, fb: 0.35, cut: 2000, wet: 0.45 },
  leadVoice: PH_CLARINET,
  bassVoice: PH_UPRIGHT,
  bassGate: 1,
  compVoice: PH_PIZZ,
  chords: [
    ["D2", "F3", "A3", "E4"], // Dm(add9)
    ["C2", "F3", "A3", "D4"], // Dm/C
    ["Bb1", "F3", "A3", "D4"], // Bbmaj7
    ["A1", "G3", "Bb3", "C#4"], // A7b9
    ["G1", "Bb3", "D4", "E4"], // Gm6
    ["Eb2", "G3", "Bb3", "Db4"], // Eb7
    ["G1", "B3", "D4", "F4"], // G7
  ],
  form: [0, 1, 2, 3, 0, 1, 4, 3, 0, 6, 5, 3],
  bassLine: PH_HIDE_BASS,
  comp(bar) {
    if (bar <= 3) return [[1.5, 0.25, 0.6], [3.5, 0.25, 0.6]];
    if (bar <= 7) return [[0.5, 0.25, 0.5], [1.5, 0.25, 0.7], [2.5, 0.25, 0.5], [3.5, 0.25, 0.7]];
    if (bar <= 9) return PH_EIGHTH_COMP.slice(0, 4); // creep holds over beats 2-4: let the chord decay
    if (bar <= 10) return PH_EIGHTH_COMP;
    return PH_SIXTEENTH_SWELL;
  },
  lead: PH_HIDE_LEAD,
  parts: [
    { voice: PH_MUTE_TPT, notes: PH_HIDE_TPT },
    { voice: PH_DRONE, notes: PH_HIDE_DRONE },
    { voice: PH_GLOCK, notes: PH_HIDE_GLOCK },
    { voice: PH_HIDEPAD, bars: [[0, 7]], pad: { oct: 0, beats: 3.9 } },
  ],
  drums(bar) {
    if (bar <= 3) {
      const L = [["w...w...w...w...", 0.55], ["k...............", 0.5]];
      if (bar === 3) L.push(["..........p.p.p.", 0.5]);
      return L;
    }
    if (bar <= 7) {
      return [["w...w...w...w...", 0.55], ["k.......k..k....", 0.7], ["..h...h...h...h.", 0.6], ["....S.......S...", 0.7]];
    }
    if (bar <= 10) {
      return [["w.w.w.w.w.w.w.w.", 0.5], ["k...k...k...k...", 0.8], ["hhhhhhhhhhhhhhhh", 0.35], ["....s.......s...", 0.6]];
    }
    return [["w.w.w.w.w.w.w.w.", 0.5], ["k...k...k...k...", 0.8], ["....s...s.s.ssss", 0.6], ["......z.........", 1]];
  },
};

// ---- "Hog Wild Pursuit" (pighide_chase) — D minor, 150 bpm, 32-bar A/B/C/D form.
// Intensity 0-2 (set by the game as the round heats up) adds horns, arp, pad, doubles.
const PH_CHASE_FORM = [0, 0, 1, 2, 0, 0, 4, 3, 0, 1, 4, 3, 0, 1, 5, 3, 4, 4, 0, 0, 5, 5, 3, 3, 1, 2, 0, 0, 1, 2, 3, 3];
// per chord: [low root, octave, fifth, chromatic approach INTO this chord]
const PH_CB = [
  ["D2", "D3", "A2", "C#2"], ["Bb1", "Bb2", "F2", "A1"], ["C2", "C3", "G2", "B1"],
  ["A1", "A2", "E2", "Ab1"], ["G1", "G2", "D2", "F#1"], ["Eb2", "Eb3", "Bb2", "D2"],
];
function phChaseBass() {
  const out = [];
  for (let b = 0; b < 32; b++) {
    const ci = PH_CHASE_FORM[b];
    const [lo, hi, fifth] = PH_CB[ci];
    const nx = PH_CHASE_FORM[(b + 1) % 32];
    const appr = nx === ci ? hi : PH_CB[nx][3];
    if (b <= 15 || b >= 24) {
      [lo, hi, lo, hi, fifth, hi, lo, appr].forEach((n, i) => out.push([b, i * 0.5, n, 0.4]));
    } else if (b <= 19) {
      out.push([b, 0, lo, 1], [b, 2.5, lo, 0.5]);
    } else if (b <= 22) {
      for (let i = 0; i < 8; i++) out.push([b, i * 0.5, lo, 0.4]);
    } else {
      for (let i = 0; i < 4; i++) out.push([b, i * 0.5, "A1", 0.4]);
      for (let i = 0; i < 8; i++) out.push([b, 2 + i * 0.25, "A1", 0.2, 0.7 + (0.3 * i) / 7]);
    }
  }
  return out;
}
const PH_CHASE_LEAD = [
  [0, 0, "A4", 0.25], [0, 0.5, "A4", 0.25], [0, 1, "D5", 1], [0, 2.5, "C5", 0.25], [0, 3, "D5", 0.5], [0, 3.5, "F5", 0.5],
  [1, 0, "E5", 0.5], [1, 0.5, "D5", 0.25], [1, 1, "A4", 1.5],
  [2, 0, "Bb4", 0.25], [2, 0.5, "Bb4", 0.25], [2, 1, "F5", 1], [2, 2.5, "E5", 0.25], [2, 3, "F5", 0.5], [2, 3.5, "G5", 0.5],
  [3, 0, "A5", 0.5], [3, 0.5, "G5", 0.25], [3, 1, "E5", 1.5], [3, 3, "G5", 0.25], [3, 3.5, "E5", 0.25],
  [4, 0, "A4", 0.25], [4, 0.5, "A4", 0.25], [4, 1, "D5", 1], [4, 2.5, "C5", 0.25], [4, 3, "D5", 0.5], [4, 3.5, "F5", 0.5],
  [5, 0, "A5", 0.5], [5, 0.5, "G5", 0.25], [5, 1, "F5", 0.5], [5, 1.5, "E5", 0.5], [5, 2, "D5", 1], [5, 3, "F5", 0.5], [5, 3.5, "E5", 0.5],
  [6, 0, "D5", 0.5], [6, 0.5, "Bb4", 0.5], [6, 1, "G4", 0.5], [6, 1.5, "Bb4", 0.5], [6, 2, "D5", 0.5], [6, 2.5, "G5", 0.5], [6, 3, "F5", 0.5], [6, 3.5, "D5", 0.5],
  [7, 0, "E5", 0.5], [7, 0.5, "F5", 0.25], [7, 0.75, "E5", 0.25], [7, 1, "C#5", 1], [7, 2, "A4", 0.5], [7, 2.5, "Bb4", 0.5], [7, 3, "C#5", 0.5], [7, 3.5, "E5", 0.5],
  [8, 0, "D5", 0.25], [8, 0.5, "D5", 0.25], [8, 1, "A5", 1], [8, 2.5, "G5", 0.25], [8, 3, "A5", 0.5], [8, 3.5, "C6", 0.5],
  [9, 0, "Bb5", 0.5], [9, 0.5, "A5", 0.25], [9, 1, "F5", 1.5], [9, 3, "D5", 0.5], [9, 3.5, "F5", 0.5],
  [10, 0, "G5", 0.25], [10, 0.5, "G5", 0.25], [10, 1, "Bb5", 1], [10, 2.5, "A5", 0.25], [10, 3, "G5", 0.5], [10, 3.5, "D5", 0.5],
  [11, 0, "E5", 0.5], [11, 0.5, "G5", 0.5], [11, 1, "C#6", 1], [11, 2, "A5", 1], [11, 3, "E5", 1],
  [12, 0, "D5", 0.25], [12, 0.5, "D5", 0.25], [12, 1, "A5", 1], [12, 2.5, "G5", 0.25], [12, 3, "A5", 0.5], [12, 3.5, "C6", 0.5],
  [13, 0, "D6", 0.5], [13, 0.5, "C6", 0.25], [13, 1, "Bb5", 0.5], [13, 1.5, "A5", 0.5], [13, 2, "F5", 1], [13, 3, "G5", 1],
  [14, 0, "G5", 0.5], [14, 0.5, "Bb5", 0.5], [14, 1, "Eb6", 1], [14, 2, "D6", 0.5], [14, 2.5, "Bb5", 0.5], [14, 3, "G5", 1],
  [15, 0, "A5", 0.5], [15, 0.5, "G5", 0.5], [15, 1, "E5", 0.5], [15, 1.5, "C#5", 0.5], [15, 2, "A4", 1],
  [20, 0, "G4", 2], [20, 2, "Bb4", 2],
  [21, 0, "Eb5", 2], [21, 2, "G5", 2],
  [22, 0, "E5", 1], [22, 1, "G5", 1], [22, 2, "A5", 1], [22, 3, "Bb5", 1],
  [23, 0, "C#6", 2],
  [24, 0, "F5", 0.5], [24, 0.5, "F5", 0.25], [24, 1, "Bb5", 0.5], [24, 1.5, "D6", 1], [24, 3, "C6", 0.5], [24, 3.5, "Bb5", 0.5],
  [25, 0, "G5", 0.5], [25, 0.5, "G5", 0.25], [25, 1, "C6", 0.5], [25, 1.5, "E6", 1], [25, 3, "D6", 0.5], [25, 3.5, "C6", 0.5],
  [26, 0, "D6", 0.75], [26, 0.75, "C6", 0.25], [26, 1, "A5", 0.5], [26, 1.5, "F5", 0.5], [26, 2, "D5", 0.5], [26, 2.5, "F5", 0.5], [26, 3, "A5", 1],
  [27, 0, "G5", 0.5], [27, 0.5, "F5", 0.5], [27, 1, "E5", 0.5], [27, 1.5, "F5", 0.5], [27, 2, "D5", 2],
  [28, 0, "F5", 0.5], [28, 0.5, "F5", 0.25], [28, 1, "Bb5", 0.5], [28, 1.5, "D6", 1], [28, 3, "C6", 0.5], [28, 3.5, "Bb5", 0.5],
  [29, 0, "G5", 0.5], [29, 0.5, "G5", 0.25], [29, 1, "C6", 0.5], [29, 1.5, "E6", 1], [29, 3, "D6", 0.5], [29, 3.5, "C6", 0.5],
  [30, 0, "E6", 0.75], [30, 0.75, "D6", 0.25], [30, 1, "C#6", 0.5], [30, 1.5, "A5", 0.5], [30, 2, "G5", 0.5], [30, 2.5, "E5", 0.5], [30, 3, "C#5", 0.5], [30, 3.5, "E5", 0.5],
  [31, 0, "A5", 1.5], [31, 2, "G5", 0.25], [31, 2.5, "E5", 0.25], [31, 3, "E5", 0.25], [31, 3.5, "C#5", 0.25],
];
const PH_CHASE_HORNS2 = [
  [24, 0, "D5", 0.5], [24, 0.5, "D5", 0.25], [24, 1, "F5", 0.5], [24, 1.5, "Bb5", 1], [24, 3, "A5", 0.5], [24, 3.5, "F5", 0.5],
  [25, 0, "E5", 0.5], [25, 0.5, "E5", 0.25], [25, 1, "G5", 0.5], [25, 1.5, "C6", 1], [25, 3, "Bb5", 0.5], [25, 3.5, "G5", 0.5],
  [26, 0, "A5", 0.75], [26, 0.75, "G5", 0.25], [26, 1, "F5", 0.5], [26, 1.5, "D5", 0.5], [26, 2, "A4", 0.5], [26, 2.5, "D5", 0.5], [26, 3, "F5", 1],
  [27, 0, "E5", 0.5], [27, 0.5, "D5", 0.5], [27, 1, "C#5", 0.5], [27, 1.5, "D5", 0.5], [27, 2, "A4", 2],
  [28, 0, "D5", 0.5], [28, 0.5, "D5", 0.25], [28, 1, "F5", 0.5], [28, 1.5, "Bb5", 1], [28, 3, "A5", 0.5], [28, 3.5, "F5", 0.5],
  [29, 0, "E5", 0.5], [29, 0.5, "E5", 0.25], [29, 1, "G5", 0.5], [29, 1.5, "C6", 1], [29, 3, "Bb5", 0.5], [29, 3.5, "G5", 0.5],
  [30, 0, "C#6", 0.75], [30, 0.75, "Bb5", 0.25], [30, 1, "A5", 0.5], [30, 1.5, "E5", 0.5], [30, 2, "E5", 0.5], [30, 2.5, "C#5", 0.5], [30, 3, "A4", 0.5], [30, 3.5, "C#5", 0.5],
  [31, 0, "E5", 1.5],
];
const PH_CHASE_PIZZ = [
  [16, 0, "G4", 0.25], [16, 0.5, "Bb4", 0.25], [16, 1, "D5", 0.25], [16, 1.75, "C#5", 0.25], [16, 2, "D5", 0.25], [16, 3, "G4", 0.25], [16, 3.5, "A4", 0.25],
  [17, 0, "Bb4", 0.25], [17, 0.5, "D5", 0.25], [17, 1, "G5", 0.25], [17, 1.75, "F#5", 0.25], [17, 2, "G5", 0.25], [17, 3, "D5", 0.25], [17, 3.5, "Bb4", 0.25],
  [18, 0, "A4", 0.25], [18, 0.5, "D5", 0.25], [18, 1, "F5", 0.25], [18, 1.75, "E5", 0.25], [18, 2, "F5", 0.25], [18, 3, "A4", 0.25], [18, 3.5, "C5", 0.25],
  [19, 0, "D5", 0.25], [19, 0.5, "F5", 0.25], [19, 1, "A5", 0.25], [19, 1.75, "G#5", 0.25], [19, 2, "A5", 0.25], [19, 2.5, "F5", 0.25], [19, 3, "D5", 0.25], [19, 3.5, "A4", 0.25],
];
const PH_CHASE_GLOCK = [
  [1, 2.5, "A6", 0.25], [1, 3, "F6", 0.25], [1, 3.5, "D6", 0.25],
  [23, 2, "A5", 0.25], [23, 2.5, "C#6", 0.25], [23, 3, "E6", 0.25], [23, 3.5, "G6", 0.25],
];
const PH_ARP_UPDOWN = { steps: "1234234534565432", oct: -1, vel: [1, 0.55, 0.7, 0.55] };

const pighide_chase = {
  id: "pighide_chase",
  title: "Hog Wild Pursuit",
  engine: 2,
  bpm: 150,
  bars: 32,
  swing: 0,
  gain: 0.7,
  fadeInS: 0.03,
  delay: { beats: 0.75, fb: 0.25, cut: 2800, wet: 0.35 },
  duck: { depth: 0.3, release: 0.12 },
  bassDuck: true,
  gruntNote: "D3",
  leadVoice: PH_BRASS,
  bassVoice: PH_CHASE_BASS,
  bassGate: 0.9,
  compVoice: PH_STAB,
  chords: [
    ["D2", "F4", "A4", "D5"], // Dm
    ["Bb1", "F4", "Bb4", "D5"], // Bb
    ["C2", "E4", "G4", "C5"], // C
    ["A1", "E4", "G4", "C#5"], // A7
    ["G1", "D4", "G4", "Bb4"], // Gm
    ["Eb2", "Eb4", "G4", "Bb4"], // Eb
  ],
  form: PH_CHASE_FORM,
  bassLine: phChaseBass(),
  comp(bar) {
    if (bar <= 15) return bar % 2 === 1 ? [[1.5, 0.25, 0.8], [2.75, 0.25, 0.6], [3.5, 0.25, 0.8]] : [[1.5, 0.25, 0.8], [3.5, 0.25, 0.8]];
    if (bar <= 19) return [];
    if (bar <= 23) {
      const v = [0.6, 0.7, 0.8, 0.9][bar - 20];
      return [[0, 0.25, v], [1, 0.25, v], [2, 0.25, v], [3, 0.25, v]];
    }
    return [[0, 0.75, 1], [1.5, 0.5, 0.9], [3, 0.25, 0.9], [3.5, 0.25, 0.9]];
  },
  lead: PH_CHASE_LEAD,
  parts: [
    { voice: { ...PH_BRASS2, v: 0.14 }, min: 1, notes: PH_CHASE_HORNS2 },
    { voice: { ...PH_PIZZ, v: 0.13 }, notes: PH_CHASE_PIZZ }, // "where'd they go?" breakdown
    { voice: PH_GLOCK, notes: PH_CHASE_GLOCK },
    { voice: { ...PH_ARP, v: 0.15 }, min: 1, duck: true, bars: [[0, 15], [24, 31]], gate: 0.5, panSeq: [-0.4, 0.4], arp: PH_ARP_UPDOWN },
    { voice: { ...PH_PAD, v: 0.1 }, min: 2, duck: true, pad: { oct: -1, beats: 3.9 } },
    { voice: { ...PH_DOUBLE, v: 0.12 }, min: 2, copyLead: -12, bars: [[8, 12], [14, 15], [24, 31]] }, // not bar 13: A4 vs the Bb4 stab
    { voice: { ...PH_GLOCK, v: 0.05 }, min: 2, copyLead: 12, bars: [[8, 15]] },
  ],
  drums(bar, pass, lvl) {
    if (bar <= 15) {
      const L = [[bar === 7 || bar === 15 ? PH_FILL : "k..ks..kk..ks...", 1], ["h.hhh.hhh.hhh.hh", 0.55]];
      if (lvl >= 1) L.push(["x.x.x.x.x.x.x.x.", 0.7]);
      if (lvl >= 2) L.push(["..H...H...H...H.", 0.6]);
      if (bar >= 8 && lvl >= 1) L.push(["....c.......c...", 0.9], ["b..b..b...b..b..", 0.75]);
      if (bar === 0 || (bar === 8 && lvl >= 1)) L.push(["C...............", 0.8]);
      return L;
    }
    if (bar <= 19) {
      const L = [["k.......k.k.....", 0.8], ["o.p.op.po.p.op.p", 0.6], ["....S.......S...", 0.8]];
      if (bar === 17 || bar === 19) L.push(["..............g.", 0.7]);
      return L;
    }
    if (bar <= 22) return [["k...k...k...k...", 1], ["s.s.s.s.s.s.s.s.", [0.35, 0.5, 0.65][bar - 20]]];
    if (bar === 23) return [["k...k...k...k...", 1], ["ssssssssssssssss", 0.7], ["z...............", 1]];
    const L = [[bar === 31 ? PH_FILL : "k..ks..kk..ks..k", 1], ["h.hHh.hhh.hHh.hh", 0.6], ["....c.......c...", 0.7]];
    if (lvl >= 1) L.push(["b..b..b...b..b..", 0.75], ["x.x.x.x.x.x.x.x.", 0.7]);
    if (bar === 24 || (bar === 28 && lvl >= 1)) L.push(["C...............", 0.9]);
    return L;
  },
};

// ---- "Last Oink Standing" (pighide_frenzy) — E minor, 164 bpm: a 4-bar alarm intro,
// then a 12-bar loop (loopFrom 4). Takes over for the last 45 s or the last pig.
const PH_FZ_FORM = [0, 5, 0, 5, 0, 0, 1, 2, 0, 0, 4, 3, 1, 2, 5, 3];
const PH_FZ_ROOT = [["E2", "E3"], ["C2", "C3"], ["D2", "D3"], ["B1", "B2"], ["A2", "A3"], ["F2", "F3"]];
function phFrenzyBass() {
  const out = [];
  for (let b = 0; b < 16; b++) {
    const [lo, hi] = PH_FZ_ROOT[PH_FZ_FORM[b]];
    if (b <= 3) {
      for (let i = 0; i < 8; i++) out.push([b, i * 0.5, i % 2 ? hi : lo, 0.4]);
    } else {
      for (let i = 0; i < 16; i++) {
        const up = i === 6 || i === 14;
        out.push([b, i / 4, up ? hi : lo, 0.2, up || i === 0 || i === 8 ? 1 : 0.75]);
      }
    }
  }
  return out;
}
const PH_FZ_LEAD = [
  [0, 0, "E5", 2], [0, 2, "B4", 2],
  [1, 0, "F5", 2, 1, { glideFrom: "B4", glide: 0.18 }], [1, 2, "C5", 2],
  [2, 0, "E5", 2, 1, { glideFrom: "C5", glide: 0.18 }], [2, 2, "B4", 2],
  [3, 0, "F5", 1, 1, { glideFrom: "B4", glide: 0.18 }], [3, 1, "A5", 1], [3, 2, "C6", 1], [3, 3, "B5", 1],
  [4, 0, "B4", 0.25], [4, 0.5, "B4", 0.25], [4, 1, "E5", 1], [4, 2.5, "D5", 0.25], [4, 3, "E5", 0.5], [4, 3.5, "G5", 0.5],
  [5, 0, "F#5", 0.5], [5, 0.5, "E5", 0.25], [5, 1, "B4", 1.5], [5, 3, "G5", 0.25], [5, 3.5, "F#5", 0.25],
  [6, 0, "E5", 0.25], [6, 0.5, "E5", 0.25], [6, 1, "G5", 1], [6, 2.5, "F#5", 0.25], [6, 3, "G5", 0.5], [6, 3.5, "A5", 0.5],
  [7, 0, "B5", 0.5], [7, 0.5, "A5", 0.25], [7, 1, "F#5", 1.5], [7, 3, "A5", 0.25], [7, 3.5, "F#5", 0.25],
  [8, 0, "E5", 0.25], [8, 0.5, "E5", 0.25], [8, 1, "B5", 1], [8, 2.5, "A5", 0.25], [8, 3, "B5", 0.5], [8, 3.5, "D6", 0.5],
  [9, 0, "B5", 0.5], [9, 0.5, "A5", 0.5], [9, 1, "G5", 0.5], [9, 1.5, "F#5", 0.5], [9, 2, "E5", 1], [9, 3, "G5", 0.5], [9, 3.5, "F#5", 0.5],
  [10, 0, "E5", 0.5], [10, 0.5, "C5", 0.5], [10, 1, "A4", 0.5], [10, 1.5, "C5", 0.5], [10, 2, "E5", 0.5], [10, 2.5, "A5", 0.5], [10, 3, "G5", 0.5], [10, 3.5, "E5", 0.5],
  [11, 0, "F#5", 0.5], [11, 0.5, "G5", 0.25], [11, 0.75, "F#5", 0.25], [11, 1, "D#5", 1], [11, 2, "B4", 0.5], [11, 2.5, "C5", 0.5], [11, 3, "D#5", 0.5], [11, 3.5, "F#5", 0.5],
  [12, 0, "G5", 0.5], [12, 0.5, "G5", 0.25], [12, 1, "C6", 0.5], [12, 1.5, "E6", 1], [12, 3, "D6", 0.5], [12, 3.5, "C6", 0.5],
  [13, 0, "A5", 0.5], [13, 0.5, "A5", 0.25], [13, 1, "D6", 0.5], [13, 1.5, "F#6", 1], [13, 3, "E6", 0.5], [13, 3.5, "D6", 0.5],
  [14, 0, "C6", 0.5], [14, 0.5, "A5", 0.5], [14, 1, "F5", 0.5], [14, 1.5, "A5", 0.5], [14, 2, "C6", 1], [14, 3, "A5", 1],
  [15, 0, "B5", 1], [15, 1, "A5", 0.5], [15, 1.5, "F#5", 0.5], [15, 2, "D#5", 0.5], [15, 2.5, "F#5", 0.5], [15, 3, "B4", 0.5], [15, 3.5, "D#5", 0.5],
];
const PH_FZ_HORNS2 = [
  [12, 0, "E5", 0.5], [12, 0.5, "E5", 0.25], [12, 1, "G5", 0.5], [12, 1.5, "C6", 1], [12, 3, "B5", 0.5], [12, 3.5, "G5", 0.5],
  [13, 0, "F#5", 0.5], [13, 0.5, "F#5", 0.25], [13, 1, "A5", 0.5], [13, 1.5, "D6", 1], [13, 3, "C#6", 0.5], [13, 3.5, "A5", 0.5],
  [14, 0, "A5", 0.5], [14, 0.5, "F5", 0.5], [14, 1, "C5", 0.5], [14, 1.5, "F5", 0.5], [14, 2, "A5", 1], [14, 3, "F5", 1],
  [15, 0, "F#5", 1], [15, 1, "D#5", 0.5], [15, 1.5, "B4", 0.5], [15, 2, "A4", 0.5], [15, 2.5, "B4", 0.5], [15, 3, "F#4", 0.5], [15, 3.5, "B4", 0.5],
];
const PH_FZ_SQUEAL = [
  [7, 3, "A6", 1, 0.5, { glideFrom: "A5", glide: 0.3 }],
  [15, 2, "B6", 2, 0.6, { glideFrom: "B5", glide: 0.6 }],
];

const pighide_frenzy = {
  id: "pighide_frenzy",
  title: "Last Oink Standing",
  engine: 2,
  bpm: 164,
  bars: 16,
  loopFrom: 4,
  swing: 0,
  gain: 0.6, // spec said 0.75; trimmed after an offline render peaked ~20% over chase
  fadeInS: 0.03,
  delay: { beats: 0.75, fb: 0.25, cut: 3000, wet: 0.35 },
  duck: { depth: 0.35, release: 0.1 },
  bassDuck: true,
  leadVoice: PH_BRASS,
  bassVoice: PH_FRENZY_BASS,
  bassGate: 0.9,
  compVoice: PH_STAB,
  chords: [
    ["E2", "G4", "B4", "E5"], // Em
    ["C2", "G4", "C5", "E5"], // C
    ["D2", "F#4", "A4", "D5"], // D
    ["B1", "F#4", "A4", "D#5"], // B7
    ["A1", "A4", "C5", "E5"], // Am
    ["F2", "F4", "A4", "C5"], // F
  ],
  form: PH_FZ_FORM,
  bassLine: phFrenzyBass(),
  comp(bar) {
    if (bar <= 3) return [[0, 1.5, 0.9], [2, 1.5, 0.9]];
    return [[0, 0.25, 1], [1.5, 0.25, 0.8], [3, 0.25, 0.9]];
  },
  lead: PH_FZ_LEAD,
  parts: [
    { voice: PH_BRASS2, notes: PH_FZ_HORNS2 },
    { voice: PH_SLIDE, notes: PH_FZ_SQUEAL },
    { voice: PH_ARP, duck: true, bars: [[4, 15]], gate: 0.5, panSeq: [-0.4, 0.4], arp: PH_ARP_UPDOWN },
    { voice: PH_PAD, duck: true, bars: [[4, 15]], pad: { oct: -1, beats: 3.9 } },
    { voice: PH_DOUBLE, copyLead: -12, bars: [[6, 8], [10, 11]] }, // not 5/9: F#4 vs the G4 stab
  ],
  drums(bar) {
    if (bar <= 2) {
      const L = [["k...k...k...k...", 1], ["hhhhhhhhhhhhhhhh", 0.4], ["....c.......c...", 0.6]];
      if (bar === 0) L.push(["C...............", 0.9]);
      return L;
    }
    if (bar === 3) return [["k...k...k.k.k.k.", 1], ["s.s.s.s.ssssssss", 0.6], ["z...............", 1]];
    const L = [
      [bar === 11 || bar === 15 ? "k..ks..ksssstttt" : "k..ks..kk.kks..k", 1],
      ["hhhHhhhhhhhHhhhh", 0.45],
      ["....c.......c...", 0.6],
      ["b.b..b.b..b..b.b", 0.35],
    ];
    if (bar === 4 || bar === 8 || bar === 12) L.push(["C...............", 0.8]);
    return L;
  },
};

// ---- "Hogs Hold Out" (pighide_pigswin) — F major victory stinger, then a 2-bar tag.
const PH_WIN_BASS = [
  [0, 0, "F1", 0.5], [0, 1, "C2", 0.5], [0, 2, "F1", 0.5], [0, 3, "A1", 0.5],
  [1, 0, "Bb1", 0.5], [1, 1, "F1", 0.5], [1, 2, "Bb1", 0.5], [1, 3, "D2", 0.5],
  [2, 0, "C2", 0.5], [2, 1, "G1", 0.5], [2, 2, "C2", 0.5], [2, 3, "E1", 0.5],
  [3, 0, "F1", 1.5], [3, 2, "C2", 0.5], [3, 3, "F1", 0.5],
  [4, 0, "F1", 0.5], [4, 1, "C2", 0.5], [4, 2, "D2", 0.5], [4, 3, "C2", 0.5],
];
const PH_WIN_LEAD = [
  [0, 0, "C5", 0.25], [0, 0.25, "F5", 0.25], [0, 0.5, "A5", 0.5], [0, 1, "C6", 1], [0, 2.5, "A5", 0.5], [0, 3, "C6", 1],
  [1, 0, "D6", 0.5], [1, 0.5, "C6", 0.5], [1, 1, "Bb5", 0.5], [1, 1.5, "D6", 0.5], [1, 2, "F6", 2],
  [2, 0, "E6", 0.5], [2, 0.5, "D6", 0.25], [2, 0.75, "C6", 0.25], [2, 1, "Bb5", 0.5], [2, 1.5, "G5", 0.5], [2, 2, "E6", 1], [2, 3, "G6", 1],
  [3, 0, "F6", 1.5], [3, 2, "C6", 0.25], [3, 2.5, "A5", 0.25], [3, 3, "F5", 0.5],
  [4, 0, "D5", 0.5], [4, 0.5, "F5", 0.5], [4, 1, "A5", 0.5], [4, 1.5, "C6", 0.5], [4, 2, "D6", 1],
];
const PH_WIN_HORNS2 = [
  [0, 0, "A4", 0.25], [0, 0.25, "C5", 0.25], [0, 0.5, "F5", 0.5], [0, 1, "A5", 1], [0, 2.5, "F5", 0.5], [0, 3, "A5", 1],
  [1, 0, "Bb5", 0.5], [1, 0.5, "A5", 0.5], [1, 1, "F5", 0.5], [1, 1.5, "Bb5", 0.5], [1, 2, "D6", 2],
  [2, 0, "C6", 0.5], [2, 0.5, "Bb5", 0.25], [2, 0.75, "G5", 0.25], [2, 1, "E5", 0.5], [2, 1.5, "E5", 0.5], [2, 2, "C6", 1], [2, 3, "E6", 1],
  [3, 0, "C6", 1.5], [3, 2, "A5", 0.25], [3, 2.5, "F5", 0.25], [3, 3, "C5", 0.5],
];
const PH_WIN_GLOCK = [
  [3, 0, "F6", 0.25], [3, 0.25, "A6", 0.25], [3, 0.5, "C7", 0.5],
  [4, 2, "D6", 0.25], [4, 2.25, "F6", 0.25], [4, 2.5, "A6", 0.25], [4, 2.75, "D7", 0.5],
];
const PH_WIN_SQUEAL = [
  [3, 3, "C7", 1, 0.5, { glideFrom: "C6", glide: 0.5 }],
];

const pighide_pigswin = {
  id: "pighide_pigswin",
  title: "Hogs Hold Out",
  engine: 2,
  bpm: 132,
  bars: 5,
  loopFrom: 3,
  swing: 0,
  gain: 1.15,
  fadeInS: 0.03,
  delay: { beats: 0.5, fb: 0.2, cut: 3000, wet: 0.3 },
  gruntNote: "F3",
  leadVoice: { ...PH_BRASS, v: 0.14 },
  bassVoice: PH_TUBA,
  bassGate: 0.9,
  compVoice: PH_PIZZ,
  chords: [
    ["F2", "A4", "C5", "F5"], // F
    ["Bb1", "Bb4", "D5", "F5"], // Bb
    ["C2", "Bb4", "E5", "G5"], // C7
    ["F2", "A4", "C5", "D5"], // F6
  ],
  form: [0, 1, 2, 0, 3],
  bassLine: PH_WIN_BASS,
  comp(bar) {
    if (bar <= 2) return [[1, 0.25], [3, 0.25]];
    if (bar === 3) return [[0, 1, 0.9]];
    return [[1, 0.25], [2.5, 0.25], [3, 0.25]];
  },
  lead: PH_WIN_LEAD,
  parts: [
    { voice: PH_BRASS2, notes: PH_WIN_HORNS2 },
    { voice: PH_GLOCK, notes: PH_WIN_GLOCK },
    { voice: PH_SLIDE, notes: PH_WIN_SQUEAL },
  ],
  drums(bar) {
    if (bar === 0) return [["C...............", 1], ["k...s...k...s...", 0.9], ["h.h.h.h.h.h.h.h.", 0.5]];
    if (bar === 1) return [["k...s...k...s...", 0.9], ["h.h.h.h.h.h.h.h.", 0.5]];
    if (bar === 2) return [["k...s...k.s.s.tt", 0.9], ["h.h.h.h.h.h.h.h.", 0.5]];
    if (bar === 3) return [["C...............", 1], ["k...........k...", 1], ["....c.......c...", 0.7], ["....g.g.g.......", 0.8]];
    return [["k...s...k...s...", 0.7], ["h.h.h.h.h.h.h.h.", 0.45], ["b..b..b..b..b...", 0.3]];
  },
};

// ---- "Round 'Em Up" (pighide_hunterwin) — D minor: stomping timpani, then the pigs'
// slide-whistle deflate. The fixed-pitch timpani only plays on the D-minor bars.
const PH_LOSE_BASS = [
  [0, 0, "D2", 0.5], [0, 1, "D2", 0.5], [0, 2, "D2", 0.5], [0, 3, "A1", 0.5],
  [1, 0, "Eb2", 0.5], [1, 1, "Eb2", 0.5], [1, 2, "Bb1", 0.5], [1, 3, "G1", 0.5],
  [2, 0, "A1", 0.5], [2, 1, "E2", 0.5], [2, 2, "C#2", 0.5], [2, 3, "E2", 0.5],
  [3, 0, "D2", 1.5], [3, 2, "A1", 0.5], [3, 3, "D1", 1],
];
const PH_LOSE_LEAD = [
  [0, 0, "D4", 0.5], [0, 1, "D4", 0.5], [0, 2, "D4", 0.5], [0, 3, "F4", 0.25], [0, 3.5, "E4", 0.25],
  [1, 0, "Eb4", 0.5], [1, 1, "Eb4", 0.5], [1, 2, "G4", 0.5], [1, 2.5, "Bb4", 0.5], [1, 3, "Eb5", 1],
  [2, 0, "C#5", 1], [2, 1, "E5", 0.5], [2, 1.5, "G5", 0.5], [2, 2, "F5", 0.5], [2, 2.5, "E5", 0.5], [2, 3, "C#5", 0.5], [2, 3.5, "A4", 0.5],
  [3, 0, "D5", 2], [3, 2, "A4", 0.5], [3, 3, "D4", 0.5],
];
const PH_LOSE_LOWBRASS = [
  [0, 0, ["D3", "A3"], 0.5], [0, 1, ["D3", "A3"], 0.5], [0, 2, ["D3", "A3"], 0.5],
  [1, 0, ["Eb3", "Bb3"], 0.5], [1, 1, ["Eb3", "Bb3"], 0.5],
  [3, 0, ["D3", "A3"], 2],
];
const PH_LOSE_DEFLATE = [
  [3, 2, "D5", 1.5, 0.5, { glideFrom: "D6", glide: 1 }],
];

const pighide_hunterwin = {
  id: "pighide_hunterwin",
  title: "Round 'Em Up",
  engine: 2,
  bpm: 104,
  bars: 4,
  loopFrom: 2,
  swing: 0.05,
  gain: 0.85,
  fadeInS: 0.03,
  delay: { beats: 0.75, fb: 0.25, cut: 2400, wet: 0.3 },
  timpNote: "D2",
  leadVoice: { ...PH_BRASS, v: 0.14 },
  bassVoice: PH_TUBA,
  bassGate: 0.9,
  compVoice: PH_STAB,
  chords: [
    ["D2", "F4", "A4", "D5"], // Dm
    ["Eb2", "G4", "Bb4", "Eb5"], // Eb
    ["A1", "G4", "C#5", "E5"], // A7
  ],
  form: [0, 1, 2, 0],
  bassLine: PH_LOSE_BASS,
  comp(bar) {
    if (bar === 0) return [[0, 0.5], [1, 0.5], [2, 0.5]];
    if (bar === 1) return [[0, 0.5], [1, 0.5]];
    if (bar === 2) return [[0, 0.25], [1.5, 0.25], [3, 0.25]];
    return [[0, 1.5]];
  },
  lead: PH_LOSE_LEAD,
  parts: [
    { voice: PH_LOWBRASS, notes: PH_LOSE_LOWBRASS },
    { voice: PH_SLIDE, notes: PH_LOSE_DEFLATE },
  ],
  drums(bar) {
    if (bar === 0) return [["C...............", 1], ["k...k...k.......", 1], ["s...s...s.......", 0.9], ["J...J...J.......", 0.8]];
    if (bar === 1) return [["k...k...k.k.k...", 1], ["s...s...s...s...", 0.8]];
    if (bar === 2) return [["k..k..k.k..k....", 1], ["....c.......c...", 0.7], ["h.h.h.h.h.h.h.h.", 0.4]];
    return [["C...............", 0.9], ["k...........k...", 1], ["....c...........", 0.7], ["J...............", 0.9]];
  },
};

export const TRACKS = Object.freeze({ plaza, ascent, pump, cashflow, chill, clash, voidchill, pighide_lobby, pighide_hide, pighide_chase, pighide_frenzy, pighide_pigswin, pighide_hunterwin });

export function createAudio() {
  // ---- instance state (per spec 02 §5.5: one createAudio() per page lifetime, but
  // kept in the closure rather than module scope so nothing here assumes that) ----
  let audioCtx = null;
  let graph = null; // { sfxGain, musicGain, masterGain, compressor, verb, verbGain }
  let inited = false;
  let muted = false;
  let voiceCount = 0;
  let noiseBuffer = null;
  const volumes = { master: BUS_DEFAULT_MASTER, sfx: BUS_DEFAULT_SFX, music: BUS_DEFAULT_MUSIC };

  // Ambient per-call modifiers consumed by tone()/noise() below. playSfx() sets this
  // for the synchronous duration of one recipe call (all of a recipe's tone()/noise()
  // calls run synchronously — only their scheduled *playback* is in the future) and
  // resets it to the neutral {1,0} immediately after, in a finally block. It is always
  // {1,0} outside an active playSfx() call, so M1-T07's music sequencer can call
  // tone()/noise() directly (bypassing playSfx) with no interference from sfx state.
  let activeMods = { volumeMul: 1, detuneAdd: 0 };

  // ===================================================================================
  // ===== SECTION: graph construction — owned by M1-T06, spec 02 §5.5.1 ===============
  // ===================================================================================

  function createVerbImpulse() {
    const len = Math.max(1, Math.floor(audioCtx.sampleRate * VERB_LENGTH_S));
    const buf = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const decay = Math.pow(1 - i / len, VERB_DECAY_POW);
        data[i] = (Math.random() * 2 - 1) * decay;
      }
    }
    return buf;
  }

  // Graph (spec 02 §5.5.1, fixed):
  //   sfx voices ──► sfxGain ──┐
  //                            ├──► masterGain ──► compressor ──► destination
  //   track gains ─► musicGain ┘                        ▲
  //   sends ───────► verb (convolver) ──► verbGain ──────┘
  // Note the verb path reaches the compressor directly, in parallel with masterGain —
  // reverb sends are not scaled by master volume, exactly as the diagram draws it.
  function buildGraph() {
    const sfxGain = audioCtx.createGain();
    const musicGain = audioCtx.createGain();
    const masterGain = audioCtx.createGain();
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(COMPRESSOR_THRESHOLD, audioCtx.currentTime);
    compressor.knee.setValueAtTime(COMPRESSOR_KNEE, audioCtx.currentTime);
    compressor.ratio.setValueAtTime(COMPRESSOR_RATIO, audioCtx.currentTime);
    compressor.attack.setValueAtTime(COMPRESSOR_ATTACK, audioCtx.currentTime);
    compressor.release.setValueAtTime(COMPRESSOR_RELEASE, audioCtx.currentTime);

    const verb = audioCtx.createConvolver();
    verb.buffer = createVerbImpulse();
    const verbGain = audioCtx.createGain();
    verbGain.gain.value = VERB_GAIN;

    sfxGain.gain.value = volumes.sfx;
    musicGain.gain.value = volumes.music;
    masterGain.gain.value = muted ? 0 : volumes.master;

    sfxGain.connect(masterGain);
    musicGain.connect(masterGain);
    masterGain.connect(compressor);
    verb.connect(verbGain);
    verbGain.connect(compressor);
    compressor.connect(audioCtx.destination);

    return { sfxGain, musicGain, masterGain, compressor, verb, verbGain };
  }

  function getNoiseBuffer() {
    if (!noiseBuffer) {
      const len = Math.max(1, Math.floor(audioCtx.sampleRate * NOISE_BUFFER_SECONDS));
      noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }

  // ===================================================================================
  // ===== SECTION: shared synth voice primitives — owned by M1-T06, spec 02 §5.5.2- ===
  // ===== §5.5.7. Exact numbers/behavior per spec; DRUM (§5.5.7) has no caller until ==
  // ===== M1-T07's music sequencer schedules bars — it is complete here so that task ==
  // ===== only has to call it, never edit it. =========================================
  // ===================================================================================

  // env(param, t, a, d, s, r, dur, peak) — exponential ADSR on an AudioParam, spec 02
  // §5.5.2. Exponential ramps can't target exactly 0, so the floor is 0.0001 throughout
  // (silent in practice, and the >0 target keeps exponentialRampToValueAtTime legal).
  function env(param, t, a, d, s, r, dur, peak) {
    const safePeak = Math.max(peak, 0.0001);
    const sustainLevel = Math.max(safePeak * s, 0.0001);
    const holdEnd = t + Math.max(a + d, dur);
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(safePeak, t + a);
    param.exponentialRampToValueAtTime(sustainLevel, t + a + d);
    param.setValueAtTime(sustainLevel, holdEnd); // anchor so the release ramp below
                                                  // starts from the held sustain value
    param.exponentialRampToValueAtTime(0.0001, holdEnd + r);
    return holdEnd + r; // end time — callers use this for voice-cap release timing
  }

  // hz(name) — note-name -> Hz, spec 02 §3.4. tone()'s `note` argument accepts either
  // a raw Hz number (every §5.5.8 sfx recipe below uses this form) or a note-name
  // string (the form spec 02 §5.5.9's TrackSpec.lead entries use — implemented here,
  // unused until M1-T07 wires the sequencer, so that task never has to touch tone()).
  function hz(name) {
    const m = NOTE_NAME_RE.exec(name);
    if (!m) {
      console.warn("audio: bad note name " + name);
      return 440;
    }
    let semi = SEMITONE_OF[m[1]];
    if (m[2] === "#") semi += 1;
    else if (m[2] === "b") semi -= 1;
    const oct = parseInt(m[3], 10);
    return 440 * Math.pow(2, (semi - 9 + (oct - 4) * 12) / 12);
  }

  // tone(out, note, t, dur, o) — oscillator voice, spec 02 §5.5.3. `note` is a Hz
  // number or a note-name string (see hz() above). Returns the voice's end time.
  function tone(out, note, t, dur, o = {}) {
    const baseFreq = typeof note === "number" ? note : hz(note);
    const type = o.type || "sawtooth";
    const a = o.a != null ? o.a : 0.008;
    const d = o.d != null ? o.d : 0.09;
    const s = o.s != null ? o.s : 0.6;
    const r = o.r != null ? o.r : 0.25;
    const peak = (o.v != null ? o.v : 0.5) * activeMods.volumeMul;
    const detuneBase = o.detune || 0;

    const voiceGain = audioCtx.createGain();
    voiceGain.gain.value = 0.0001;
    const endTime = env(voiceGain.gain, t, a, d, s, r, dur, peak);

    // detune cents = symmetric two-oscillator pair (§5.5.3): a nonzero base detune
    // spawns two oscillators at +detuneBase/-detuneBase cents, each pre-attenuated to
    // half gain so the pair's combined peak still lands on the requested `v`.
    // Opt-in unison (engine-2 tracks only): `uni` oscillators spread evenly across
    // ±detune cents, optionally fanned across the stereo field by `spread`. Every
    // existing voice lacks `uni`, so it takes the untouched paired/single loop below.
    const uni = o.uni >= 2 ? (o.uni | 0) : 0;
    if (uni) {
      const startFreq = o.glideFrom != null ? o.glideFrom : baseFreq;
      let lfoGain = null;
      if (o.vib) {
        const lfo = audioCtx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = o.vib.hz;
        lfoGain = audioCtx.createGain();
        lfoGain.gain.value = o.vib.cents;
        lfo.connect(lfoGain);
        lfo.start(t);
        lfo.stop(endTime);
      }
      const canPan = !!(o.spread && audioCtx.createStereoPanner);
      const stack = audioCtx.createGain(); // one 1/sqrt(n) trim for the whole stack
      stack.gain.value = 1 / Math.sqrt(uni);
      stack.connect(voiceGain);
      for (let i = 0; i < uni; i++) {
        const pos = (2 * i) / (uni - 1) - 1; // -1 .. 1 across the stack
        const osc = audioCtx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(Math.max(startFreq, 0.01), t);
        if (o.glideFrom != null) {
          const glideDur = o.glide != null ? o.glide : dur;
          osc.frequency.exponentialRampToValueAtTime(Math.max(baseFreq, 0.01), t + glideDur);
        }
        osc.detune.setValueAtTime(detuneBase * pos + activeMods.detuneAdd, t);
        if (lfoGain) lfoGain.connect(osc.detune);
        if (canPan) {
          const sp = audioCtx.createStereoPanner();
          sp.pan.value = o.spread * pos;
          osc.connect(sp);
          sp.connect(stack);
        } else {
          osc.connect(stack);
        }
        osc.start(t + i * 0.0004); // tiny stagger: no phase-locked attack click
        osc.stop(endTime);
      }
    } else {
    const paired = detuneBase !== 0;
    const oscCount = paired ? 2 : 1;
    const oscGainScale = paired ? 0.5 : 1;
    // Engine-2 tracks only (musicSend is set solely inside scheduleBarV2): the per-osc
    // trims collapse into one shared node, or none at unity. Same signal, fewer nodes.
    // Legacy tracks and sfx never have musicSend set, so they keep the graph below.
    let lean = null;
    if (musicSend) {
      lean = voiceGain;
      if (oscGainScale !== 1) {
        lean = audioCtx.createGain();
        lean.gain.value = oscGainScale;
        lean.connect(voiceGain);
      }
    }
    for (let i = 0; i < oscCount; i++) {
      const osc = audioCtx.createOscillator();
      osc.type = type;
      const startFreq = o.glideFrom != null ? o.glideFrom : baseFreq;
      osc.frequency.setValueAtTime(Math.max(startFreq, 0.01), t);
      if (o.glideFrom != null) {
        const glideDur = o.glide != null ? o.glide : dur;
        osc.frequency.exponentialRampToValueAtTime(Math.max(baseFreq, 0.01), t + glideDur);
      }
      const sign = paired ? (i === 0 ? 1 : -1) : 1;
      osc.detune.setValueAtTime(detuneBase * sign + activeMods.detuneAdd, t);
      if (o.vib) {
        const lfo = audioCtx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = o.vib.hz;
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = o.vib.cents;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.detune);
        lfo.start(t);
        lfo.stop(endTime);
      }
      if (lean) {
        osc.connect(lean);
      } else {
        const oscOut = audioCtx.createGain();
        oscOut.gain.value = oscGainScale;
        osc.connect(oscOut);
        oscOut.connect(voiceGain);
      }
      osc.start(t);
      osc.stop(endTime);
    }
    } // end of the non-unison path

    if (o.sub) {
      const sub = audioCtx.createOscillator();
      sub.type = "sine";
      sub.frequency.setValueAtTime(Math.max(baseFreq / 2, 0.01), t);
      const subGain = audioCtx.createGain();
      subGain.gain.value = o.sub;
      sub.connect(subGain);
      subGain.connect(voiceGain);
      sub.start(t);
      sub.stop(endTime);
    }

    let tail = voiceGain;
    if (o.cut != null) {
      const filter = audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = o.q != null ? o.q : 1;
      if (o.fenv) {
        // opt-in filter envelope: attack up to cut+amt, then settle toward cut+amt*s
        const pk = Math.min(o.cut + o.fenv.amt, 18000);
        const ta = t + Math.max(a, 0.003);
        filter.frequency.setValueAtTime(o.cut, t);
        filter.frequency.linearRampToValueAtTime(pk, ta);
        filter.frequency.setTargetAtTime(o.cut + o.fenv.amt * o.fenv.s, ta, Math.max(o.fenv.d, 0.005) / 3);
      } else {
        filter.frequency.setValueAtTime(o.cut, t);
        if (o.sweep != null) filter.frequency.linearRampToValueAtTime(o.sweep, t + dur);
      }
      voiceGain.connect(filter);
      tail = filter;
    }
    if (o.hp) {
      const h = audioCtx.createBiquadFilter();
      h.type = "highpass";
      h.frequency.value = o.hp;
      h.Q.value = 0.707;
      tail.connect(h);
      tail = h;
    }
    if (o.pan && audioCtx.createStereoPanner) {
      const p = audioCtx.createStereoPanner();
      p.pan.value = o.pan;
      tail.connect(p);
      tail = p;
    }

    tail.connect(out);
    if (o.send) {
      const sendGain = audioCtx.createGain();
      sendGain.gain.value = o.send;
      tail.connect(sendGain);
      // musicSend is an engine-2 track's own send while scheduleBarV2 runs, else null
      sendGain.connect(musicSend || graph.verb);
    }
    if (o.dly && musicDly) {
      const dg = audioCtx.createGain();
      dg.gain.value = o.dly;
      tail.connect(dg);
      dg.connect(musicDly);
    }

    return endTime;
  }

  // noise(out, t, dur, o) — filtered white-noise burst, spec 02 §5.5.4. Gain steps to
  // `v` at `t` (no attack ramp) and exponentially decays to 0.0001 at `t+dur`.
  function noise(out, t, dur, o = {}) {
    const src = audioCtx.createBufferSource();
    src.buffer = getNoiseBuffer();
    const filter = audioCtx.createBiquadFilter();
    filter.type = o.type || "highpass";
    filter.frequency.value = o.freq != null ? o.freq : 1000;
    filter.Q.value = o.q != null ? o.q : 1;

    const g = audioCtx.createGain();
    const peak = Math.max((o.v != null ? o.v : 0.3) * activeMods.volumeMul, 0.0001);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter);
    filter.connect(g);
    let tail = g;
    if (o.pan && audioCtx.createStereoPanner) {
      const p = audioCtx.createStereoPanner();
      p.pan.value = o.pan;
      g.connect(p);
      tail = p;
    }
    tail.connect(out);
    if (o.send) {
      const sendGain = audioCtx.createGain();
      sendGain.gain.value = o.send;
      tail.connect(sendGain);
      sendGain.connect(musicSend || graph.verb);
    }

    const endTime = t + dur;
    src.start(t);
    src.stop(endTime + 0.02); // small margin past the ramp so the decay tail isn't cut
    return endTime;
  }

  // DRUM kit, spec 02 §5.5.7 — consumed by M1-T07's scheduleBar() step 6
  // (`DRUM[char](out, at(i/4), 1)`). All entries but `t` (tom) match that 3-arg call
  // shape. `t`'s pitch depends on the step index within the bar ("f = 260 − beat*30",
  // spec's words) which that 3-arg call shape has nowhere to carry — DRUM.t accepts it
  // as an optional 4th arg (defaulting to 0) so M1-T07 can pass the loop index `i`
  // explicitly for the 't' case only; see this file's task report for the exact gap.
  // The spec also gives no explicit gain for 't' — 0.35 here is a placeholder pick in
  // the middle of the other percussion voices' gains (clap/rim both 0.3).
  const DRUM = {
    k(out, t) {
      const e1 = tone(out, 44, t, 0.4, { type: "sine", glideFrom: 150, glide: 0.11, v: 0.95 });
      const e2 = noise(out, t + 0.12, 0.02, { type: "highpass", freq: 2200, v: 0.12 });
      return Math.max(e1, e2);
    },
    s(out, t) {
      const e1 = noise(out, t, 0.16, { type: "bandpass", freq: 1900, v: 0.42, send: 0.18 });
      const e2 = tone(out, 150, t, 0.16, { type: "triangle", glideFrom: 232, glide: 0.16, v: 0.3 });
      return Math.max(e1, e2);
    },
    h(out, t) {
      return noise(out, t, 0.035, { freq: 8200, v: 0.2 });
    },
    H(out, t) {
      return noise(out, t, 0.26, { freq: 7200, v: 0.17 });
    },
    c(out, t) {
      let end = t;
      for (let i = 0; i < 3; i++) {
        end = Math.max(end, noise(out, t + i * 0.011, 0.09, { type: "bandpass", freq: 1500, v: 0.3, send: 0.2 }));
      }
      return end;
    },
    r(out, t) {
      return noise(out, t, 0.05, { type: "bandpass", freq: 2600, q: 2, v: 0.3 });
    },
    t(out, t0, _vel, beatIndex = 0) {
      const f = 260 - beatIndex * 30;
      return tone(out, Math.max(f * 0.55, 20), t0, 0.2, { type: "sine", glideFrom: f, glide: 0.2, v: 0.35 });
    },
  };

  // DRUM_X — extra kit pieces read ONLY by scheduleBarV2 (engine-2 tracks), so no
  // existing track's pattern can ever reach them. Same (out, t, vel, beat) shape as
  // DRUM plus the track spec, for the tuned pieces (grunt, timpani).
  const DRUM_X = {
    w(out, t) { // woodblock
      const e1 = tone(out, 1180, t, 0.025, { type: "sine", a: 0.001, d: 0.03, s: 0.1, r: 0.04, v: 0.3 });
      const e2 = noise(out, t, 0.012, { type: "bandpass", freq: 2500, q: 4, v: 0.12 });
      return Math.max(e1, e2);
    },
    x(out, t) { // shaker
      return noise(out, t, 0.045, { type: "highpass", freq: 6500, v: 0.1, pan: -0.35 });
    },
    S(out, t) { // finger snap
      return noise(out, t, 0.035, { type: "bandpass", freq: 3100, q: 3.5, v: 0.32, send: 0.3, pan: -0.15 });
    },
    o(out, t) { // low bongo
      return tone(out, 190, t, 0.09, { type: "sine", glideFrom: 240, glide: 0.04, a: 0.001, d: 0.07, s: 0.2, r: 0.07, v: 0.32, pan: 0.25 });
    },
    p(out, t) { // high bongo
      return tone(out, 300, t, 0.07, { type: "sine", glideFrom: 380, glide: 0.03, a: 0.001, d: 0.05, s: 0.2, r: 0.06, v: 0.26, pan: 0.35 });
    },
    b(out, t) { // cowbell: two square partials through one shared envelope/filter/pan
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      const end = env(g.gain, t, 0.001, 0.05, 0.25, 0.12, 0.06, 0.06 * activeMods.volumeMul);
      for (const f of [560, 845]) {
        const osc = audioCtx.createOscillator();
        osc.type = "square";
        osc.frequency.setValueAtTime(f, t);
        osc.detune.setValueAtTime(activeMods.detuneAdd, t);
        osc.connect(g);
        osc.start(t);
        osc.stop(end);
      }
      const lp = audioCtx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 1;
      lp.frequency.setValueAtTime(2800, t);
      g.connect(lp);
      let tail = lp;
      if (audioCtx.createStereoPanner) {
        const p = audioCtx.createStereoPanner();
        p.pan.value = 0.3;
        lp.connect(p);
        tail = p;
      }
      tail.connect(out);
      return end;
    },
    C(out, t) { // crash cymbal
      const e1 = noise(out, t, 1.3, { type: "highpass", freq: 5000, v: 0.15, send: 0.3, pan: -0.3 });
      const e2 = noise(out, t, 0.5, { type: "bandpass", freq: 3200, q: 0.8, v: 0.09, pan: 0.3 });
      return Math.max(e1, e2);
    },
    z(out, t) { // 1.5 s band-passed noise riser, lands on the next downbeat-ish
      const src = audioCtx.createBufferSource();
      src.buffer = getNoiseBuffer(); // 2 s buffer, longer than the 1.52 s it plays
      const bp = audioCtx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 2;
      bp.frequency.setValueAtTime(500, t);
      bp.frequency.exponentialRampToValueAtTime(7000, t + 1.5);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 1.45);
      g.gain.linearRampToValueAtTime(0.0001, t + 1.5);
      src.connect(bp);
      bp.connect(g);
      g.connect(out);
      const sg = audioCtx.createGain();
      sg.gain.value = 0.25;
      g.connect(sg);
      sg.connect(musicSend || graph.verb);
      src.start(t);
      src.stop(t + 1.52);
      return t + 1.52;
    },
    g(out, t, _vel, _beat, spec) { // pig grunt: a squelchy downward saw blip
      const f = hz((spec && spec.gruntNote) || "G3");
      const e1 = tone(out, f, t, 0.1, {
        type: "sawtooth", glideFrom: f * 1.45, glide: 0.09, cut: 1100, q: 5,
        fenv: { amt: 900, d: 0.06, s: 0.2 }, a: 0.004, d: 0.06, s: 0.4, r: 0.05, v: 0.11, send: 0.15,
      });
      const e2 = noise(out, t, 0.06, { type: "bandpass", freq: 700, q: 2, v: 0.05 });
      return Math.max(e1, e2);
    },
    J(out, t, _vel, _beat, spec) { // timpani
      const f = hz((spec && spec.timpNote) || "D2");
      const e1 = tone(out, f, t, 0.9, { type: "sine", glideFrom: f * 1.22, glide: 0.08, a: 0.003, d: 0.4, s: 0.35, r: 0.5, v: 0.3, send: 0.3 });
      const e2 = noise(out, t, 0.05, { type: "lowpass", freq: 400, v: 0.1 });
      return Math.max(e1, e2);
    },
  };

  // ===================================================================================
  // ===== SECTION: sfx registry — owned by M1-T06, spec 02 §5.5.8 (12 base recipes) ===
  // ===================================================================================

  function coinPair(t, freqs) {
    const opts = { type: "square", cut: 6000, v: 0.22, a: 0.002, d: 0.04, s: 0.2, r: 0.1 };
    const e1 = tone(graph.sfxGain, freqs[0], t, 0.035, opts);
    const e2 = tone(graph.sfxGain, freqs[1], t + 0.035, 0.11, opts);
    return Math.max(e1, e2);
  }

  function jump(t) {
    return tone(graph.sfxGain, 560, t, 0.12, {
      type: "sine", glideFrom: 300, glide: 0.09, a: 0.005, d: 0.06, s: 0.3, r: 0.08, v: 0.35,
    });
  }

  function land(t) {
    const e1 = noise(graph.sfxGain, t, 0.09, { type: "lowpass", freq: 420, v: 0.4 });
    const e2 = tone(graph.sfxGain, 90, t, 0.07, {
      type: "sine", a: 0.002, d: 0.05, s: 0.2, r: 0.05, v: 0.5,
    });
    return Math.max(e1, e2);
  }

  function oof(t) {
    const shared = { cut: 620, sweep: 300, q: 3, a: 0.01, d: 0.12, s: 0.55, r: 0.12, send: 0.25 };
    const e1 = tone(graph.sfxGain, 92, t, 0.28, {
      ...shared, type: "sawtooth", glideFrom: 155, glide: 0.22, v: 0.6,
    });
    const e2 = tone(graph.sfxGain, 184, t, 0.28, {
      ...shared, type: "sawtooth", glideFrom: 310, glide: 0.22, v: 0.15,
    });
    return Math.max(e1, e2);
  }

  function chime(t) {
    const opts = { type: "triangle", v: 0.32, a: 0.004, d: 0.1, s: 0.3, r: 0.3, send: 0.3 };
    const e1 = tone(graph.sfxGain, 523.25, t, 0.09, opts);
    const e2 = tone(graph.sfxGain, 783.99, t + 0.09, 0.16, opts);
    return Math.max(e1, e2);
  }

  function coin(t) {
    return coinPair(t, [987.77, 1318.5]);
  }

  function purchase(t) {
    const e1 = coin(t);
    const notes = [523.25, 659.26, 783.99];
    const opts = { type: "triangle", v: 0.15, a: 0.01, d: 0.15, s: 0.4, r: 0.35, send: 0.35 };
    let e2 = t;
    for (const f of notes) e2 = Math.max(e2, tone(graph.sfxGain, f, t + 0.12, 0.25, opts));
    return Math.max(e1, e2);
  }

  function badge(t) {
    const shared = { type: "sawtooth", detune: 8, cut: 3200, v: 0.25, a: 0.006, d: 0.12, s: 0.5, r: 0.3, send: 0.35 };
    const e1 = tone(graph.sfxGain, 523.25, t, 0.12, shared);
    const e2 = tone(graph.sfxGain, 659.26, t + 0.12, 0.12, shared);
    const e3 = tone(graph.sfxGain, 783.99, t + 0.24, 0.12, shared);
    const e4 = tone(graph.sfxGain, 1046.5, t + 0.36, 0.45, { ...shared, vib: { hz: 6, cents: 12 } });
    return Math.max(e1, e2, e3, e4);
  }

  function click(t) {
    const e1 = noise(graph.sfxGain, t, 0.015, { type: "highpass", freq: 4000, v: 0.25 });
    const e2 = tone(graph.sfxGain, 1800, t, 0.03, {
      type: "sine", a: 0.001, d: 0.02, s: 0.1, r: 0.02, v: 0.15,
    });
    return Math.max(e1, e2);
  }

  function teleport(t) {
    const e1 = tone(graph.sfxGain, 1400, t, 0.3, {
      type: "sine", glideFrom: 220, glide: 0.28, a: 0.02, d: 0.1, s: 0.6, r: 0.25, v: 0.3,
      vib: { hz: 18, cents: 30 }, send: 0.5,
    });
    const e2 = noise(graph.sfxGain, t, 0.3, { type: "highpass", freq: 6500, v: 0.12, send: 0.4 });
    return Math.max(e1, e2);
  }

  function error(t) {
    const opts = { type: "square", cut: 1200, a: 0.003, d: 0.05, s: 0.6, r: 0.06, v: 0.3 };
    const e1 = tone(graph.sfxGain, 220, t, 0.09, opts);
    const e2 = tone(graph.sfxGain, 174.61, t + 0.11, 0.14, opts);
    return Math.max(e1, e2);
  }

  function lift(t) {
    const e1 = tone(graph.sfxGain, 110, t, 0.18, {
      type: "sawtooth", glideFrom: 70, glide: 0.15, cut: 500, v: 0.4, a: 0.01, d: 0.1, s: 0.5, r: 0.1,
    });
    const e2 = noise(graph.sfxGain, t, 0.12, { type: "bandpass", freq: 700, q: 0.8, v: 0.18 });
    const e3 = noise(graph.sfxGain, t + 0.08, 0.1, { type: "bandpass", freq: 1600, q: 0.8, v: 0.14 });
    return Math.max(e1, e2, e3);
  }

  function cash(t) {
    const e1 = noise(graph.sfxGain, t, 0.06, { type: "bandpass", freq: 5200, q: 1.2, v: 0.3 });
    const e2 = coinPair(t + 0.05, [1108.7, 1396.9]);
    const e3 = tone(graph.sfxGain, 1568, t + 0.12, 0.3, {
      type: "triangle", a: 0.004, d: 0.2, s: 0.25, r: 0.4, v: 0.18, send: 0.4,
    });
    return Math.max(e1, e2, e3);
  }

  const RECIPES = { jump, land, oof, chime, coin, purchase, badge, click, teleport, error, lift, cash };

  function resolveSfx(name) {
    if (Object.prototype.hasOwnProperty.call(RECIPES, name)) {
      return { recipe: RECIPES[name], detune: 0, volume: 1 };
    }
    const alias = ALIASES[name];
    if (!alias) return null;
    const [baseName, overrides] = alias;
    return {
      recipe: RECIPES[baseName],
      detune: overrides.detune || 0,
      volume: overrides.volume != null ? overrides.volume : 1,
    };
  }

  // ===================================================================================
  // ===== SECTION: public facade — owned by M1-T06, spec 02 §5.5 facade table (minus =
  // ===== playMusic/stopMusic/currentTrack, which are M1-T07's — see the marked ========
  // ===== section below `dispose()`) ===================================================
  // ===================================================================================

  function init() {
    if (inited) return true;
    if (typeof window === "undefined") return false; // headless case: never throw
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (typeof Ctor !== "function") return false;
    try {
      audioCtx = new Ctor();
      graph = buildGraph();
    } catch (err) {
      audioCtx = null;
      graph = null;
      console.warn("audio: init failed", err);
      return false;
    }
    inited = true;
    // The shell calls init() from the first pointerdown/keydown (spec 02 §5.5 facade
    // table), so the context is normally allowed to run immediately; some browsers
    // still hand back a "suspended" context regardless. Best-effort resume; a suspended
    // context is not an error (spec 02 §7 criterion 20/§8 test 9 both allow it).
    if (audioCtx.state === "suspended" && typeof audioCtx.resume === "function") {
      audioCtx.resume().catch(() => {});
    }
    return true;
  }

  function playSfx(name, opts = {}) {
    // Before init() (or if WebAudio is unavailable): silent no-op, no AudioContext
    // created — spec 02 §5.5 facade table / §7 criterion 20.
    if (!inited || !audioCtx || !graph) return;
    const resolved = resolveSfx(name);
    if (!resolved) {
      console.warn("audio: unknown sfx " + name);
      return;
    }
    if (voiceCount >= MAX_VOICES) return; // 17th+ concurrent voice dropped silently
    voiceCount++;
    const t = audioCtx.currentTime + (opts.when || 0);
    const pitchDetune = opts.pitch ? 1200 * Math.log2(opts.pitch) : 0;
    activeMods = {
      volumeMul: (opts.volume != null ? opts.volume : 1) * resolved.volume,
      detuneAdd: (opts.detune || 0) + resolved.detune + pitchDetune,
    };
    let endTime = t;
    try {
      endTime = resolved.recipe(t);
    } finally {
      activeMods = { volumeMul: 1, detuneAdd: 0 };
    }
    const releaseMs = Math.max(0, (endTime - audioCtx.currentTime) * 1000) + VOICE_RELEASE_SLACK_MS;
    setTimeout(() => { voiceCount = Math.max(0, voiceCount - 1); }, releaseMs);
  }

  function setVolume(bus, v) {
    if (bus !== "master" && bus !== "sfx" && bus !== "music") {
      console.warn("audio: unknown bus " + bus);
      return;
    }
    const clamped = Math.min(1, Math.max(0, v));
    volumes[bus] = clamped;
    if (!graph) return;
    const node = bus === "master" ? graph.masterGain : bus === "sfx" ? graph.sfxGain : graph.musicGain;
    const target = bus === "master" ? (muted ? 0 : clamped) : clamped;
    node.gain.setTargetAtTime(target, audioCtx.currentTime, VOLUME_RAMP_TAU);
  }

  function setSfxVolume(v) { setVolume("sfx", v); }
  function setMusicVolume(v) { setVolume("music", v); }
  function setMasterVolume(v) { setVolume("master", v); }

  function getVolume(bus) {
    if (bus !== "master" && bus !== "sfx" && bus !== "music") {
      console.warn("audio: unknown bus " + bus);
      return 0;
    }
    return volumes[bus];
  }

  function setMuted(m) {
    muted = !!m;
    if (graph) {
      graph.masterGain.gain.setTargetAtTime(muted ? 0 : volumes.master, audioCtx.currentTime, VOLUME_RAMP_TAU);
    }
  }

  function isMuted() {
    return muted;
  }

  function applySettings(s = {}) {
    if (s.master != null) setVolume("master", s.master);
    if (s.sfx != null) setVolume("sfx", s.sfx);
    if (s.music != null) setVolume("music", s.music);
    if (s.muted != null) setMuted(s.muted);
  }

  function getSettings() {
    return { master: volumes.master, sfx: volumes.sfx, music: volumes.music, muted };
  }

  function dispose() {
    // M1-T07 extends this to stop the current track and clear the pump interval
    // (spec 02 §5.5 dispose row: "Stop music, clear the pump interval, close the
    // context") by inserting those two steps above the close() call below — nothing
    // here needs to change for that.
    teardownMusic(); // M1-T07's two steps, at the insertion point marked above
    if (audioCtx) {
      try { audioCtx.close(); } catch { /* already closed, or close() unsupported */ }
    }
    audioCtx = null;
    graph = null;
    inited = false;
    voiceCount = 0;
  }

  // ===================================================================================
  // ===== SECTION: music sequencer — owned by M1-T07, spec 02 §5.5.9 (pump, ===========
  // ===== scheduleBar) + §5.5.10 (crossfade) + §5.5.1 (hidden-tab handling). Uses ======
  // ===== the primitives above (tone/noise/DRUM/hz) and never touches the sfx =========
  // ===== registry or the gain graph's shape. Track DATA is at module scope above. ====
  // ===================================================================================

  let currentMusic = null; // { spec, out, bar, next, id, velGains } per §5.5.9 "State"
  let pendingTrackId = null; // playMusic before init(): remembered, started on init()
  let pumpTimer = null;
  let pageHidden = false;
  let visibilityBound = false;
  const fadeTimers = new Set(); // pending post-crossfade disconnects, cleared on dispose
  // Engine-2 (opt-in) state. Both routing slots are non-null ONLY for the synchronous
  // duration of one scheduleBarV2() call, so sfx and every legacy track keep sending
  // straight to graph.verb exactly as before.
  let musicSend = null; // per-track reverb send node while scheduleBarV2 runs, else null
  let musicDly = null; // per-track echo input while scheduleBarV2 runs, else null
  let pendingOpts = null; // { lvl, startBar } for a playMusic() issued before init()

  // §5.5.9 step 2: at(beat) = next + (beat + swing-on-off-eighths) * spb.
  function at(tr, spb, beat) {
    const swung = beat + (Math.floor(beat * 2) % 2 === 1 ? tr.spec.swing : 0);
    return tr.next + swung * spb;
  }

  // Drum velocity (§5.5.9 step 6 passes one; §5.5.10's cashflow off-hats need 0.35) is
  // applied as a per-track gain node rather than an argument, because the DRUM kit's
  // voices ignore their velocity parameter. One node per distinct velocity per track.
  function velocityOut(tr, vel) {
    if (vel === 1) return tr.out;
    let node = tr.velGains.get(vel);
    if (!node) {
      node = audioCtx.createGain();
      node.gain.value = vel;
      node.connect(tr.out);
      tr.velGains.set(vel, node);
    }
    return node;
  }

  function scheduleBass(tr, spb, bar, chord, root) {
    const style = tr.spec.bass;
    if (style === "pulse8") {
      for (let e = 0; e < 8; e++) {
        const beat = e * 0.5;
        // beats 1 and 3 take chord[2], the fifth — an oom-pah lift, not a bass leap
        const note = beat === 1 || beat === 3 ? chord[2] : root;
        tone(tr.out, note, at(tr, spb, beat), 0.42 * spb, BASS_PULSE8);
      }
    } else if (style === "drive16") {
      for (let i = 0; i < 16; i++) {
        const beat = i / 4;
        if (beat === 2.25 || beat === 3.25) continue; // the breath, §5.5.9 step 3
        tone(tr.out, root, at(tr, spb, beat), 0.2 * spb, BASS_DRIVE16);
      }
    } else if (style === "funk16") {
      for (let i = 0; i < FUNK16_PATTERN.length; i++) {
        if (FUNK16_PATTERN[i] !== "x") continue;
        tone(tr.out, root, at(tr, spb, i / 4), FUNK16_DUR * spb, BASS_FUNK16);
      }
      // "plus octave-up hit at offset 2.5" — additive, so 2.5 stacks root + octave
      tone(tr.out, hz(root) * 2, at(tr, spb, 2.5), FUNK16_DUR * spb, BASS_FUNK16);
    } else if (style === "walk4") {
      const spec = tr.spec;
      const nextRoot = spec.roots[((bar + 1) % spec.bars) % spec.chords.length];
      const notes = [hz(root), hz(chord[1]) / 2, hz(chord[2]), hz(nextRoot) * SEMITONE_DOWN];
      for (let b = 0; b < 4; b++) tone(tr.out, notes[b], at(tr, spb, b), WALK4_DUR * spb, BASS_WALK4);
    }
  }

  // §5.5.9 step 4. Stabs take chord notes above the root only; the walk4 pad takes all.
  function scheduleComp(tr, spb, chord) {
    const style = tr.spec.bass;
    if (style === "walk4") {
      for (const note of chord) tone(tr.out, note, at(tr, spb, 0), 3.8 * spb, PAD_VOICE);
      return;
    }
    const beats = style === "drive16" ? [0, 2.5] : [1, 3];
    const voice = style === "drive16" ? STAB_VOICE_DRIVE16 : STAB_VOICE;
    for (const beat of beats) {
      for (let i = 1; i < chord.length; i++) {
        tone(tr.out, chord[i], at(tr, spb, beat), STAB_DUR * spb, voice);
      }
    }
  }

  function scheduleLead(tr, spb, bar) {
    for (const entry of tr.spec.lead) {
      if (entry[0] !== bar) continue;
      tone(tr.out, entry[2], at(tr, spb, entry[1]), entry[3] * spb * 0.9, tr.spec.leadVoice);
    }
  }

  // §5.5.9 step 6. drums(bar) returns one 16-char step string, or a list of
  // [steps, velocity] layers (§5.5.10's cashflow merges two).
  function scheduleDrums(tr, spb, bar) {
    const raw = tr.spec.drums(bar);
    const layers = typeof raw === "string" ? [[raw, 1]] : raw;
    for (const [pattern, vel] of layers) {
      const out = velocityOut(tr, vel);
      for (let i = 0; i < pattern.length; i++) {
        const voice = DRUM[pattern[i]];
        // 4th arg: DRUM.t pitches itself off the beat ("f = 260 - beat*30"), and the
        // beat at step i is i/4 — the raw step index would tune the fill below 0 Hz.
        if (voice) voice(out, at(tr, spb, i / 4), vel, i / 4);
      }
    }
  }

  // ---- Sequencer V2: tracks that declare `engine: 2` (opt-in; legacy tracks never
  // reach anything below). Adds explicit bass lines, chord forms, layered parts gated
  // by bar range / pass / intensity level, an extended drum kit, kick ducking, a
  // per-track reverb send and ping-pong echo, and loopFrom (an intro that plays once).
  const PH_CACHE = new WeakMap(); // note list -> Map(bar -> entries)
  function byBar(list, bar) {
    let m = PH_CACHE.get(list);
    if (!m) {
      m = new Map();
      for (const e of list) {
        if (!m.has(e[0])) m.set(e[0], []);
        m.get(e[0]).push(e);
      }
      PH_CACHE.set(list, m);
    }
    return m.get(bar) || [];
  }

  // entry [bar, beat, note|note[], beats, vel?, opts?]; semis transposes (copyLead)
  function scheduleNotes(tr, out, spb, bar, list, voice, gate, semis = 0) {
    if (!list) return;
    const k = semis ? Math.pow(2, semis / 12) : 1;
    for (const e of byBar(list, bar)) {
      let o = voice;
      if (e[4] != null || e[5]) {
        o = { ...voice, ...(e[5] || {}) };
        o.v = (voice.v != null ? voice.v : 0.5) * (e[4] != null ? e[4] : 1);
        if (typeof o.glideFrom === "string") o.glideFrom = hz(o.glideFrom) * k;
      }
      for (const n of Array.isArray(e[2]) ? e[2] : [e[2]]) {
        tone(out, k === 1 ? n : hz(n) * k, at(tr, spb, e[1]), e[3] * spb * gate, o);
      }
    }
  }

  function partOn(p, bar, pass, lvl) {
    if (lvl < (p.min ?? 0) || lvl > (p.max ?? 99)) return false;
    if (p.every && pass % p.every !== (p.offset || 0)) return false;
    return !p.bars || p.bars.some(([a, b]) => bar >= a && bar <= b);
  }

  function schedulePart(tr, spb, bar, chord, p) {
    const out = p.duck && tr.duck ? tr.duck : tr.out;
    const gate = p.gate ?? 0.9;
    if (p.notes) {
      scheduleNotes(tr, out, spb, bar, p.notes, p.voice, gate);
    } else if (p.copyLead != null) {
      scheduleNotes(tr, out, spb, bar, tr.spec.lead, p.voice, gate, p.copyLead);
    } else if (p.arp) {
      // steps: 16 chars, '1'-'3' = chord tones n1..n3, '4'-'6' = the same an octave up
      const { steps, oct = 0, vel = [1] } = p.arp;
      for (let i = 0; i < 16; i++) {
        const c = steps.charCodeAt(i) - 48;
        if (!(c >= 1 && c <= 6)) continue;
        const f = hz(chord[c > 3 ? c - 3 : c]) * Math.pow(2, oct + (c > 3 ? 1 : 0));
        const o = { ...p.voice, v: p.voice.v * vel[i % vel.length] };
        if (p.panSeq) o.pan = p.panSeq[i % p.panSeq.length];
        tone(out, f, at(tr, spb, i / 4), 0.25 * spb * gate, o);
      }
    } else if (p.pad) {
      const m = Math.pow(2, p.pad.oct || 0);
      for (let i = 1; i < chord.length; i++) {
        tone(out, hz(chord[i]) * m, at(tr, spb, 0), (p.pad.beats || 3.9) * spb, p.voice);
      }
    }
  }

  function scheduleBarV2(tr) {
    const spec = tr.spec;
    const spb = 60 / spec.bpm;
    const n = spec.bars;
    const lf = spec.loopFrom;
    const lvl = tr.lvl;
    const bar = lf != null && tr.bar >= n ? lf + ((tr.bar - lf) % (n - lf)) : tr.bar % n;
    const pass = lf != null ? (tr.bar < n ? 0 : 1 + Math.floor((tr.bar - n) / (n - lf))) : Math.floor(tr.bar / n);
    const chord = spec.chords[spec.form ? spec.form[bar] : bar % spec.chords.length];
    musicSend = tr.send;
    musicDly = tr.dlyIn;
    try {
      const bassOut = spec.bassDuck && tr.duck ? tr.duck : tr.out;
      scheduleNotes(tr, bassOut, spb, bar, spec.bassLine, spec.bassVoice, spec.bassGate ?? 0.9);
      if (spec.comp) {
        for (const [beat, beats, vel] of spec.comp(bar, pass, lvl) || []) {
          const v = vel != null ? { ...spec.compVoice, v: spec.compVoice.v * vel } : spec.compVoice;
          for (let i = 1; i < chord.length; i++) tone(tr.out, chord[i], at(tr, spb, beat), beats * spb, v);
        }
      }
      scheduleNotes(tr, tr.out, spb, bar, spec.lead, spec.leadVoice, spec.leadGate ?? 0.9);
      for (const p of spec.parts || []) if (partOn(p, bar, pass, lvl)) schedulePart(tr, spb, bar, chord, p);
      const raw = spec.drums(bar, pass, lvl);
      for (const [pat, vel] of typeof raw === "string" ? [[raw, 1]] : raw) {
        const out = velocityOut(tr, vel);
        for (let i = 0; i < pat.length; i++) {
          const ch = pat[i];
          const fn = DRUM[ch] || DRUM_X[ch];
          if (!fn) continue;
          const t = at(tr, spb, i / 4);
          if (ch === "k" && tr.duck) { // kick-keyed sidechain duck on bass/arp/pad
            const g = tr.duck.gain;
            g.setTargetAtTime(1 - spec.duck.depth, t, 0.004);
            g.setTargetAtTime(1, t + 0.04, spec.duck.release / 3);
          }
          fn(out, t, vel, i / 4, spec);
        }
      }
    } finally {
      musicSend = null;
      musicDly = null;
    }
    tr.next += 4 * spb;
    tr.bar++;
  }

  function scheduleBar(tr) {
    if (tr.spec.engine === 2) { scheduleBarV2(tr); return; }
    const spec = tr.spec;
    const spb = 60 / spec.bpm;
    const bar = tr.bar % spec.bars;
    const ci = bar % spec.chords.length;
    const chord = spec.chords[ci];
    const root = spec.roots[ci];
    scheduleBass(tr, spb, bar, chord, root);
    scheduleComp(tr, spb, chord);
    scheduleLead(tr, spb, bar);
    scheduleDrums(tr, spb, bar);
    tr.next += 4 * spb;
    tr.bar++;
  }

  function pumpTick() {
    if (!currentMusic || !audioCtx || !graph || pageHidden) return;
    const horizon = audioCtx.currentTime + LOOKAHEAD;
    let guard = 0;
    while (currentMusic.next < horizon && guard < MAX_BARS_PER_PUMP) {
      scheduleBar(currentMusic);
      guard++;
    }
  }

  // The pump is the one wall-clock timer in the engine, and spec 02 §5.5.9 specifies it
  // as such: it only decides how far ahead to fill the schedule. Every note's actual
  // start time comes from the AudioContext clock, so a late or throttled tick shifts
  // nothing musical. No gameplay timing lives here.
  function startPump() {
    if (pumpTimer !== null || pageHidden || !currentMusic) return;
    pumpTimer = setInterval(pumpTick, PUMP_MS);
  }

  function stopPump() {
    if (pumpTimer === null) return;
    clearInterval(pumpTimer);
    pumpTimer = null;
  }

  function rampGain(param, target, seconds) {
    const now = audioCtx.currentTime;
    const from = Math.max(param.value, GAIN_FLOOR);
    param.cancelScheduledValues(now);
    param.setValueAtTime(from, now);
    param.exponentialRampToValueAtTime(Math.max(target, GAIN_FLOOR), now + Math.max(seconds, 0.01));
  }

  function releaseTrack(tr) {
    try { tr.out.disconnect(); } catch { /* context already closed */ }
    for (const node of tr.velGains.values()) {
      try { node.disconnect(); } catch { /* context already closed */ }
    }
    tr.velGains.clear();
    // engine-2 extras (all null/empty on legacy tracks); disconnecting them also
    // breaks the echo's feedback loop so it can be collected
    for (const node of [tr.send, tr.duck, ...(tr.extra || [])]) {
      if (!node) continue;
      try { node.disconnect(); } catch { /* context already closed */ }
    }
    if (tr.extra) tr.extra.length = 0;
  }

  // §5.5.10 "Common": the outgoing track's gain ramps to 0.0001 over fadeMs and the
  // node is disconnected half a second later (1.6 s after the call at the 1.1 s default).
  function fadeOutTrack(tr, fadeMs) {
    rampGain(tr.out.gain, GAIN_FLOOR, fadeMs / 1000);
    if (tr.send) rampGain(tr.send.gain, GAIN_FLOOR, fadeMs / 1000);
    const timer = setTimeout(() => {
      fadeTimers.delete(timer);
      releaseTrack(tr);
    }, fadeMs + DISCONNECT_AFTER_FADE_MS);
    fadeTimers.add(timer);
  }

  // Bar-synced handoff (engine-2 targets only): the outgoing track keeps playing every
  // bar it has already scheduled, then fades from its next unscheduled barline, which
  // is where the incoming track starts. Returns that start time.
  function syncHandoff(old, fadeMs) {
    const now = audioCtx.currentTime;
    const startAt = Math.max(old.next, now + RESUME_LEAD_S);
    for (const g of [old.out.gain, old.send && old.send.gain].filter(Boolean)) {
      const v = Math.max(g.value, GAIN_FLOOR);
      g.cancelScheduledValues(now);
      g.setValueAtTime(v, now);
      g.setValueAtTime(v, startAt);
      g.exponentialRampToValueAtTime(GAIN_FLOOR, startAt + Math.max(fadeMs, 10) / 1000);
    }
    const timer = setTimeout(() => {
      fadeTimers.delete(timer);
      releaseTrack(old);
    }, (startAt - now) * 1000 + fadeMs + DISCONNECT_AFTER_FADE_MS);
    fadeTimers.add(timer);
    return startAt;
  }

  // Ping-pong echo for an engine-2 track: dlyIn -> lowpass -> L <-> R feedback, out
  // through a stereo merger into the track's own gain (so it fades with the track).
  function buildDelay(tr, spb) {
    const D = tr.spec.delay;
    const dlyIn = audioCtx.createGain();
    dlyIn.gain.value = 1;
    const lp = audioCtx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = D.cut;
    lp.Q.value = 0.7;
    const dL = audioCtx.createDelay(2);
    const dR = audioCtx.createDelay(2);
    dL.delayTime.value = D.beats * spb;
    dR.delayTime.value = D.beats * spb;
    const fbA = audioCtx.createGain();
    fbA.gain.value = D.fb;
    const fbB = audioCtx.createGain();
    fbB.gain.value = D.fb;
    dlyIn.connect(lp);
    lp.connect(dL);
    dL.connect(fbA);
    fbA.connect(dR);
    dR.connect(fbB);
    fbB.connect(dL);
    const m = audioCtx.createChannelMerger(2);
    dL.connect(m, 0, 0);
    dR.connect(m, 0, 1);
    const wet = audioCtx.createGain();
    wet.gain.value = D.wet;
    m.connect(wet);
    wet.connect(tr.out);
    tr.dlyIn = dlyIn;
    tr.extra.push(dlyIn, lp, dL, dR, fbA, fbB, m, wet);
  }

  function startTrack(id, { lvl = 0, startBar = 0, at: startAt = null } = {}) {
    const spec = TRACKS[id];
    const out = audioCtx.createGain();
    out.gain.value = GAIN_FLOOR;
    out.connect(graph.musicGain);
    const tr = {
      spec,
      out,
      bar: 0,
      next: audioCtx.currentTime + RESUME_LEAD_S,
      id,
      velGains: new Map(),
      lvl: 0, send: null, duck: null, dlyIn: null, extra: [], // engine-2 only
    };
    if (spec.engine === 2) {
      const target = spec.gain != null ? spec.gain : 1;
      tr.lvl = lvl;
      tr.bar = Math.max(0, Math.min(spec.bars - 1, startBar | 0));
      tr.send = audioCtx.createGain();
      tr.send.gain.value = GAIN_FLOOR;
      tr.send.connect(graph.verb);
      if (spec.duck) {
        tr.duck = audioCtx.createGain();
        tr.duck.gain.value = 1;
        tr.duck.connect(out);
      }
      if (spec.delay) buildDelay(tr, 60 / spec.bpm);
      if (startAt != null) {
        tr.next = startAt;
        for (const g of [out.gain, tr.send.gain]) {
          g.setValueAtTime(GAIN_FLOOR, audioCtx.currentTime);
          g.setValueAtTime(GAIN_FLOOR, startAt - 0.04);
          g.exponentialRampToValueAtTime(target, startAt);
        }
      } else {
        const fi = spec.fadeInS != null ? spec.fadeInS : CROSSFADE_IN_S;
        rampGain(out.gain, target, fi);
        rampGain(tr.send.gain, target, fi);
      }
    } else {
      rampGain(out.gain, 1, CROSSFADE_IN_S); // legacy tracks: unchanged
    }
    currentMusic = tr;
    bindVisibility();
    pumpTick(); // fill the first lookahead now rather than up to PUMP_MS late
    startPump();
  }

  function onVisibilityChange() {
    pageHidden = document.visibilityState === "hidden";
    if (!graph || !audioCtx) return;
    if (pageHidden) {
      stopPump(); // a throttled background interval would gap the schedule (§5.5.1)
      rampGain(graph.musicGain.gain, GAIN_FLOOR, HIDDEN_FADE_S);
      return;
    }
    rampGain(graph.musicGain.gain, volumes.music, VISIBLE_FADE_S);
    if (currentMusic) {
      const t0 = audioCtx.currentTime + RESUME_LEAD_S;
      // engine-2: whatever is already scheduled (or a barline-synced start still
      // pending) stays valid, so only pull `next` forward if it fell behind.
      if (currentMusic.spec.engine === 2) currentMusic.next = Math.max(currentMusic.next, t0);
      else currentMusic.next = t0; // legacy tracks: unchanged
    }
    startPump();
  }

  function bindVisibility() {
    if (visibilityBound || typeof document === "undefined" || !document.addEventListener) return;
    document.addEventListener("visibilitychange", onVisibilityChange);
    visibilityBound = true;
    pageHidden = document.visibilityState === "hidden";
  }

  function unbindVisibility() {
    if (!visibilityBound) return;
    document.removeEventListener("visibilitychange", onVisibilityChange);
    visibilityBound = false;
  }

  // opts beyond fadeMs are opt-in for engine-2 tracks: intensity (0-9 level, also
  // settable on the playing track by repeating its id), startBar, and sync (start on
  // the outgoing track's next barline instead of crossfading immediately).
  function playMusic(trackId, { fadeMs = CROSSFADE_OUT_MS, intensity, startBar, sync } = {}) {
    if (trackId == null) {
      stopMusic({ fadeMs });
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(TRACKS, trackId)) {
      console.warn("audio: unknown track " + trackId);
      stopMusic({ fadeMs });
      return;
    }
    const lvl = Number.isFinite(intensity) ? Math.max(0, Math.min(9, Math.round(intensity))) : null;
    if (currentTrack() === trackId) { // same id: no restart (at most an intensity update)
      if (lvl != null) {
        if (currentMusic && currentMusic.id === trackId) currentMusic.lvl = lvl;
        else if (pendingTrackId === trackId) pendingOpts = { ...(pendingOpts || {}), lvl };
      }
      return;
    }
    if (!inited || !audioCtx || !graph) {
      pendingTrackId = trackId; // started by init(), per the §5.5 facade table
      pendingOpts = { lvl: lvl ?? 0, startBar: startBar ?? 0 };
      return;
    }
    pendingTrackId = null;
    pendingOpts = null;
    const o = { lvl: lvl ?? 0, startBar: startBar ?? 0 };
    if (currentMusic) {
      if (sync && TRACKS[trackId].engine === 2) o.at = syncHandoff(currentMusic, fadeMs);
      else fadeOutTrack(currentMusic, fadeMs);
      currentMusic = null;
    }
    startTrack(trackId, o);
  }

  function stopMusic({ fadeMs = CROSSFADE_OUT_MS } = {}) {
    pendingTrackId = null;
    pendingOpts = null;
    if (currentMusic) {
      fadeOutTrack(currentMusic, fadeMs);
      currentMusic = null;
    }
    stopPump();
  }

  // Current track id, or the one queued for init() when nothing is playing yet.
  function currentTrack() {
    return currentMusic ? currentMusic.id : pendingTrackId;
  }

  // dispose()'s music half (spec 02 §5.5 dispose row) — called from dispose() above.
  function teardownMusic() {
    stopPump();
    for (const timer of fadeTimers) clearTimeout(timer);
    fadeTimers.clear();
    if (currentMusic) releaseTrack(currentMusic);
    currentMusic = null;
    pendingTrackId = null;
    pendingOpts = null;
    unbindVisibility();
  }

  // The public `init`: M1-T06's init() plus the §5.5 facade rule that a playMusic()
  // issued before init() starts its track as soon as the context exists.
  function initWithPendingMusic() {
    const ok = init();
    if (ok && pendingTrackId && !currentMusic) {
      const id = pendingTrackId;
      const o = pendingOpts || {};
      pendingTrackId = null;
      pendingOpts = null;
      startTrack(id, o);
    }
    return ok;
  }

  return {
    init: initWithPendingMusic,
    playSfx,
    playMusic,
    stopMusic,
    currentTrack,
    setSfxVolume,
    setMusicVolume,
    setMasterVolume,
    getVolume,
    setMuted,
    isMuted,
    applySettings,
    getSettings,
    dispose,
  };
}
