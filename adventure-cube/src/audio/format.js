// format.js - the SONG FORMAT (pure data, no functions) + validator + helpers. NO DOM. Frozen: CONTRACT.md section 6.
//
// export default {
//   id: "area1", title: "Sunlit Canopy", mood: "bright folk morning", bpm: 108,
//   stepsPerBar: 16,              // 16 = 4/4 in 16th notes (default). 12 = 3/4 or 6/8 feel in 16ths/8th-triplets.
//   swing: 0.12,                  // 0..0.5: odd 16th steps are delayed by swing * one step (default 0)
//   master: { gain: 0.8, reverb: { seconds: 2.6, mix: 0.25 }, delay: { steps: 3, feedback: 0.35, tone: 3500 } },
//   instruments: { lead: {...}, bass: {...}, kick: {...} },       // <= 12 instruments
//   patterns: {
//     leadA: { inst: "lead", bars: 2, notes: [[0, "D5", 2, 0.8], [2, "F#5", 2], [4, ["A4","D5"], 4, 0.6]] },
//   },
//   sections: { intro: { bars: 4, tracks: ["padA", { p: "leadA", transpose: 2, vel: 0.9 }] } },
//   arrangement: ["intro", "A", "B", "A"],
//   loop: 1,                      // after the last section, continue from arrangement[loop] (default 0)
// }
//
// Note = [step, pitch, dur, vel?]
//   step  : position inside the pattern in steps (0 .. bars*stepsPerBar), may be fractional (grace notes)
//   pitch : MIDI number 0..127, a note name "C4" "F#3" "Bb2" (C4 = 60), or an array of those (chord).
//           Drum instruments: pitch is ignored unless kind is tom/taiko/woodblock/conga (then it tunes the hit).
//   dur   : length in steps (> 0)
//   vel   : 0..1 (default 0.8)
// A pattern shorter than its section loops inside it; a longer one is cut at the section end.
//
// Instruments ({type, ...}; every type also takes gain 0..1, pan -1..1, reverb 0..1, delay 0..1 sends, octave -3..3):
//   synth : wave 'sine'|'triangle'|'square'|'sawtooth', voices 1..4 (unison), detune (cents spread),
//           env {a,d,s,r} (seconds, sustain level 0..1), filter {type 'lowpass'|'highpass'|'bandpass', freq Hz, q, env Hz},
//           glide (seconds, mono portamento), vibrato {rate Hz, depth cents, delay s}
//   fm    : ratio (modulator/carrier), index (mod depth), indexDecay (s), env {a,d,s,r}   (bells, e-piano, marimba)
//   pluck : wave (default 'sawtooth'), tone (Hz, start brightness), decay (s)            (guitar, harp, kalimba)
//   noise : color 'white'|'pink'|'brown', filter {type,freq,q,env}, env {a,d,s,r}        (wind, rain, surf swells)
//   drum  : kind 'kick'|'snare'|'hat'|'openhat'|'clap'|'tom'|'rim'|'shaker'|'crash'|'taiko'|'woodblock'|'conga',
//           tune (semitones), decay (multiplier, default 1)

export const STEPS_PER_BAR_ALLOWED = [12, 16];
export const INSTRUMENT_TYPES = ["synth", "fm", "pluck", "noise", "drum"];
export const WAVES = ["sine", "triangle", "square", "sawtooth"];
export const DRUM_KINDS = ["kick", "snare", "hat", "openhat", "clap", "tom", "rim", "shaker", "crash", "taiko", "woodblock", "conga"];
export const LIMITS = { instruments: 12, patterns: 120, sections: 24, arrangement: 64, notesPerPattern: 512 };

const NOTE_BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function noteToMidi(p) {
  if (typeof p === "number") return p;
  if (typeof p !== "string") return NaN;
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(p.trim());
  if (!m) return NaN;
  let n = NOTE_BASE[m[1].toUpperCase()] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  return n + (parseInt(m[3], 10) + 1) * 12;
}
export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function stepSeconds(song) { return 60 / song.bpm / 4; } // one 16th (or one step) in seconds
export function sectionSteps(song, name) { return song.sections[name].bars * (song.stepsPerBar || 16); }

// -> { ok, errors, warnings, seconds (full arrangement once), loopSeconds (looping part) }
export function validateSong(song, expectId) {
  const errors = [], warnings = [];
  const E = (m) => errors.push(m), Wn = (m) => warnings.push(m);
  if (!song || typeof song !== "object") return { ok: false, errors: ["song is not an object"], warnings };
  if (expectId && song.id !== expectId) E(`id '${song.id}' should be '${expectId}'`);
  for (const k of ["id", "title", "mood"]) if (typeof song[k] !== "string" || !song[k]) E(`missing ${k}`);
  if (!(song.bpm >= 40 && song.bpm <= 220)) E("bpm must be 40..220");
  const spb = song.stepsPerBar || 16;
  if (!STEPS_PER_BAR_ALLOWED.includes(spb)) E("stepsPerBar must be 12 or 16");
  if (song.swing !== undefined && !(song.swing >= 0 && song.swing <= 0.5)) E("swing must be 0..0.5");
  try { JSON.stringify(song); } catch (e) { E("song must be plain JSON-like data"); }
  const insts = song.instruments || {}, pats = song.patterns || {}, secs = song.sections || {};
  if (Object.keys(insts).length === 0 || Object.keys(insts).length > LIMITS.instruments) E(`1..${LIMITS.instruments} instruments`);
  if (Object.keys(pats).length > LIMITS.patterns) E("too many patterns");
  if (Object.keys(secs).length > LIMITS.sections) E("too many sections");
  for (const [n, i] of Object.entries(insts)) {
    if (!INSTRUMENT_TYPES.includes(i.type)) { E(`instrument ${n}: bad type ${i.type}`); continue; }
    if (i.gain !== undefined && !(i.gain >= 0 && i.gain <= 1)) E(`instrument ${n}: gain 0..1`);
    if (i.pan !== undefined && !(i.pan >= -1 && i.pan <= 1)) E(`instrument ${n}: pan -1..1`);
    if ((i.type === "synth" || i.type === "pluck") && i.wave && !WAVES.includes(i.wave)) E(`instrument ${n}: bad wave ${i.wave}`);
    if (i.type === "drum" && !DRUM_KINDS.includes(i.kind)) E(`instrument ${n}: bad drum kind ${i.kind}`);
    if (i.env) for (const k of ["a", "d", "s", "r"]) if (i.env[k] !== undefined && !(i.env[k] >= 0 && i.env[k] <= 20)) E(`instrument ${n}: env.${k}`);
  }
  for (const [n, p] of Object.entries(pats)) {
    if (!insts[p.inst]) E(`pattern ${n}: unknown inst ${p.inst}`);
    if (!(Number.isInteger(p.bars) && p.bars >= 1 && p.bars <= 16)) E(`pattern ${n}: bars must be 1..16`);
    if (!Array.isArray(p.notes)) { E(`pattern ${n}: notes must be an array`); continue; }
    if (p.notes.length > LIMITS.notesPerPattern) E(`pattern ${n}: too many notes`);
    const len = p.bars * spb;
    p.notes.forEach((nt, j) => {
      if (!Array.isArray(nt) || nt.length < 3) { E(`pattern ${n} note ${j}: must be [step, pitch, dur, vel?]`); return; }
      const [st, pi, du, ve] = nt;
      if (!(st >= 0 && st < len)) E(`pattern ${n} note ${j}: step ${st} outside 0..${len - 1}`);
      const ps = Array.isArray(pi) ? pi : [pi];
      if (!ps.length || ps.some((q) => { const m = noteToMidi(q); return !(m >= 0 && m <= 127); })) E(`pattern ${n} note ${j}: bad pitch ${JSON.stringify(pi)}`);
      if (!(du > 0 && du <= 256)) E(`pattern ${n} note ${j}: bad dur`);
      if (ve !== undefined && !(ve >= 0 && ve <= 1)) E(`pattern ${n} note ${j}: vel 0..1`);
    });
  }
  for (const [n, s] of Object.entries(secs)) {
    if (!(Number.isInteger(s.bars) && s.bars >= 1 && s.bars <= 64)) E(`section ${n}: bars 1..64`);
    if (!Array.isArray(s.tracks)) { E(`section ${n}: tracks must be an array`); continue; }
    for (const t of s.tracks) { const pn = typeof t === "string" ? t : t && t.p; if (!pats[pn]) E(`section ${n}: unknown pattern ${pn}`); }
  }
  const arr = song.arrangement;
  if (!Array.isArray(arr) || !arr.length || arr.length > LIMITS.arrangement) E("arrangement must list 1..64 sections");
  else arr.forEach((a) => { if (!secs[a]) E(`arrangement: unknown section ${a}`); });
  const loop = song.loop || 0;
  if (Array.isArray(arr) && !(Number.isInteger(loop) && loop >= 0 && loop < arr.length)) E("loop must index the arrangement");
  let seconds = 0, loopSeconds = 0;
  if (!errors.length) {
    const st = stepSeconds(song);
    arr.forEach((a, i) => { const d = secs[a].bars * spb * st; seconds += d; if (i >= loop) loopSeconds += d; });
    if (loopSeconds < 40) Wn(`loop is only ${loopSeconds.toFixed(1)} s (aim for 60 s+)`);
  }
  return { ok: errors.length === 0, errors, warnings, seconds, loopSeconds };
}
