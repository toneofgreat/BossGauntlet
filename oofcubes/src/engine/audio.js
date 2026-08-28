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

export const TRACKS = Object.freeze({ plaza, ascent, pump, cashflow, chill });

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
    const paired = detuneBase !== 0;
    const oscCount = paired ? 2 : 1;
    const oscGainScale = paired ? 0.5 : 1;
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
      const oscOut = audioCtx.createGain();
      oscOut.gain.value = oscGainScale;
      osc.connect(oscOut);
      oscOut.connect(voiceGain);
      osc.start(t);
      osc.stop(endTime);
    }

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
      filter.frequency.setValueAtTime(o.cut, t);
      if (o.sweep != null) filter.frequency.linearRampToValueAtTime(o.sweep, t + dur);
      voiceGain.connect(filter);
      tail = filter;
    }

    tail.connect(out);
    if (o.send) {
      const sendGain = audioCtx.createGain();
      sendGain.gain.value = o.send;
      tail.connect(sendGain);
      sendGain.connect(graph.verb);
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
    g.connect(out);
    if (o.send) {
      const sendGain = audioCtx.createGain();
      sendGain.gain.value = o.send;
      g.connect(sendGain);
      sendGain.connect(graph.verb);
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

  function scheduleBar(tr) {
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
  }

  // §5.5.10 "Common": the outgoing track's gain ramps to 0.0001 over fadeMs and the
  // node is disconnected half a second later (1.6 s after the call at the 1.1 s default).
  function fadeOutTrack(tr, fadeMs) {
    rampGain(tr.out.gain, GAIN_FLOOR, fadeMs / 1000);
    const timer = setTimeout(() => {
      fadeTimers.delete(timer);
      releaseTrack(tr);
    }, fadeMs + DISCONNECT_AFTER_FADE_MS);
    fadeTimers.add(timer);
  }

  function startTrack(id) {
    const out = audioCtx.createGain();
    out.gain.value = GAIN_FLOOR;
    out.connect(graph.musicGain);
    rampGain(out.gain, 1, CROSSFADE_IN_S);
    currentMusic = {
      spec: TRACKS[id],
      out,
      bar: 0,
      next: audioCtx.currentTime + RESUME_LEAD_S,
      id,
      velGains: new Map(),
    };
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
    if (currentMusic) currentMusic.next = audioCtx.currentTime + RESUME_LEAD_S;
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

  function playMusic(trackId, { fadeMs = CROSSFADE_OUT_MS } = {}) {
    if (trackId == null) {
      stopMusic({ fadeMs });
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(TRACKS, trackId)) {
      console.warn("audio: unknown track " + trackId);
      stopMusic({ fadeMs });
      return;
    }
    if (currentTrack() === trackId) return; // same id: no-op, no restart
    if (!inited || !audioCtx || !graph) {
      pendingTrackId = trackId; // started by init(), per the §5.5 facade table
      return;
    }
    pendingTrackId = null;
    if (currentMusic) {
      fadeOutTrack(currentMusic, fadeMs);
      currentMusic = null;
    }
    startTrack(trackId);
  }

  function stopMusic({ fadeMs = CROSSFADE_OUT_MS } = {}) {
    pendingTrackId = null;
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
    unbindVisibility();
  }

  // The public `init`: M1-T06's init() plus the §5.5 facade rule that a playMusic()
  // issued before init() starts its track as soon as the context exists.
  function initWithPendingMusic() {
    const ok = init();
    if (ok && pendingTrackId && !currentMusic) {
      const id = pendingTrackId;
      pendingTrackId = null;
      startTrack(id);
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
