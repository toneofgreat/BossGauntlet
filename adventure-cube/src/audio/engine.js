// engine.js - WebAudio music sequencer, synth instruments, SFX and ambience (MUSIC_A). API frozen: CONTRACT.md 6.3.
// Only this module (and dsp.js, which is pure JS) touches audio.
//
// Signal flow:   voices -> per-instrument channel (pan, reverb/delay sends) -> song bus (crossfade gain)
//                song bus + song reverb (generated impulse) + ping-pong delay -> music bus -> duck -> master
//                sfx (+ small room reverb) and ambience -> sfx bus -> master
//                master -> compressor -> soft-clip shaper (ceiling 0.985) -> destination
// Scheduler: lookahead (25 ms timer, 0.2 s horizon; 1.5 s while the tab is hidden). Step times are computed as
//   t0 + n * stepSeconds from an integer step counter, so they never accumulate drift; loops are seamless because
//   the counter just keeps running through the arrangement. If the timer stalls (tab frozen) it skips ahead silently.
// Expensive sounds are pre-rendered once per context in dsp.js and cached: drums (one AudioBuffer per kind/tune/
//   decay/pitch, 3 round-robin variants for hats/snares), Karplus-Strong plucks (per pitch), reverb impulses, noise.
//
// Song format parameters (format.js) are all supported. OPTIONAL extras MUSIC_A added (safe to ignore):
//   synth.sub      0..1   sine one octave below (bass weight)
//   synth.breath   0..1   band-passed breath noise that follows the envelope (flutes, whistles)
//   synth/noise.filter.to  Hz   filter sweeps from `freq` to `to` across the note's length (risers, swells)
//   synth/noise.filter.d   s    decay time of filter.env (default env.d)
//   fm.env / fm.detune     fm voices accept `detune` (cents) like synth
//   pluck.mute     true   damp the string when the note's `dur` ends (default: let it ring for decay*1.5 s)
//   master.reverb.damp 0..1  darkness of the reverb tail (default 0.6); master.reverb.mix scales the reverb return
//     (0.25 = unity; the sends are per instrument).
// Extra API (optional): audio.ambience(theme|null) - "forest" | "highlands" | "storm" loop (call ambience(null) on exit);
//   audio.stats(); sfx(name, { at }) delays a sound by `at` seconds; audio._play(songObject) plays unsaved song data;
//   createAudio({ context }) runs on a given (Offline)AudioContext; renderOffline(songOrId, opts) for tests.
import { noteToMidi, midiToHz } from "./format.js";
import { loadSong, SONG_IDS } from "./songs/index.js";
import * as dsp from "./dsp.js";

export const SFX_NAMES = [
  "jump", "land", "spring", "die", "respawn", "checkpoint", "win", "crumble", "crumble_break", "bonk",
  "step", "splash", "click", "place", "erase", "thunder", "rate_done", "publish",
];

const PITCHED_DRUMS = { tom: 1, taiko: 1, woodblock: 1, conga: 1 };
const RR_DRUMS = { hat: 3, snare: 3, shaker: 3, clap: 2, openhat: 2 };
const MAX_VOICES = 56;
// loudness trims so every song sits near -19 dB RMS after the limiter (measured with tools/audiocheck.cjs);
// without them the builder songs played ~6 dB quieter than the area songs
const LOUDNESS = { area1: 1.06, area2: 0.9, area3: 0.79, campfire: 1.46, rapids: 1.12, aurora: 1.23, thunderdrum: 1, moonlit: 1.5 };

export function createAudio(opts = {}) {
  let ctx = null, offline = false;
  let master, limiter, shaper, musicBus, duckG, sfxBus, sfxRevIn, ambBus;
  let vol = { master: 0.9, music: 0.7, sfx: 0.8 }, muted = false;
  let player = null, currentId = null, wantId = null, wantAmb = null, amb = null;
  const cache = { drum: new Map(), pluck: new Map(), ir: new Map(), noise: new Map() };
  const voices = []; // end times of sounding voices (for the voice cap)
  const stats = { notes: 0, dropped: 0, maxVoices: 0, late: 0, minLead: Infinity, steps: 0, skipped: 0, stepErr: 0 };
  const lastSfx = Object.create(null);

  function ensure() {
    if (ctx) return ctx;
    if (opts.context) { ctx = opts.context; offline = typeof ctx.startRendering === "function"; }
    else {
      const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return null;
      try { ctx = new AC({ latencyHint: "interactive" }); } catch (e) { ctx = new AC(); }
    }
    master = ctx.createGain();
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4; limiter.knee.value = 4; limiter.ratio.value = 12;
    limiter.attack.value = 0.003; limiter.release.value = 0.2;
    shaper = ctx.createWaveShaper(); shaper.curve = dsp.softClipCurve();
    if (opts.raw) master.connect(ctx.destination); // tests: measure the un-limited mix
    else { master.connect(limiter); limiter.connect(shaper); shaper.connect(ctx.destination); }
    musicBus = ctx.createGain(); duckG = ctx.createGain(); musicBus.connect(duckG); duckG.connect(master);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    const sr = ctx.createConvolver(); sr.buffer = irBuffer(0.9, 0.5); sfxRevIn = ctx.createGain(); sfxRevIn.gain.value = 0.7;
    sfxRevIn.connect(sr); sr.connect(sfxBus);
    ambBus = ctx.createGain(); ambBus.gain.value = 0.55; ambBus.connect(sfxBus);
    applyVol(true);
    return ctx;
  }
  function setP(param, v, now, tc = 0.02) {
    if (now) { param.value = v; return; }
    const t = ctx.currentTime; param.cancelScheduledValues(t); param.setTargetAtTime(v, t, tc);
  }
  function applyVol(now) {
    if (!ctx) return;
    setP(master.gain, muted ? 0 : vol.master, now);
    setP(musicBus.gain, vol.music, now);
    setP(sfxBus.gain, vol.sfx, now);
  }

  // ---------------- cached buffers ----------------
  function toBuffer(chans) {
    const b = ctx.createBuffer(chans.length, chans[0].length, ctx.sampleRate);
    chans.forEach((d, i) => b.getChannelData(i).set(d));
    return b;
  }
  function irBuffer(sec, damp = 0.6) {
    const k = sec.toFixed(2) + "|" + damp.toFixed(2);
    if (!cache.ir.has(k)) cache.ir.set(k, toBuffer(dsp.impulse(ctx.sampleRate, sec, { damp })));
    return cache.ir.get(k);
  }
  function noiseBuf(color = "white") {
    if (!cache.noise.has(color)) {
      const n = dsp.noiseData(ctx.sampleRate, 3.5, color, color.length * 31);
      cache.noise.set(color, toBuffer([n.data]));
    }
    return cache.noise.get(color);
  }
  function drumBuf(inst, midi) {
    const kind = inst.kind, hz = PITCHED_DRUMS[kind] && midi > 0 ? Math.round(midiToHz(midi)) : 0;
    const rr = RR_DRUMS[kind] || 1, variant = rr > 1 ? (stats.notes % rr) : 0;
    const k = kind + "|" + (inst.tune || 0) + "|" + (inst.decay || 1) + "|" + hz + "|" + variant;
    let b = cache.drum.get(k);
    if (!b) { b = toBuffer([dsp.drum(ctx.sampleRate, kind, { tune: inst.tune || 0, decay: inst.decay || 1, hz, variant })]); cache.drum.set(k, b); }
    return b;
  }
  function pluckBuf(inst, midi) {
    const m = Math.round(midi), k = (inst.tone ?? 3000) + "|" + (inst.decay ?? 0.5) + "|" + (inst.wave || "sawtooth") + "|" + m;
    let b = cache.pluck.get(k);
    if (!b) { b = toBuffer([dsp.pluck(ctx.sampleRate, midiToHz(m), { tone: inst.tone ?? 3000, decay: inst.decay ?? 0.5, wave: inst.wave || "sawtooth" })]); cache.pluck.set(k, b); }
    return b;
  }

  // Pre-render every drum/pluck buffer a song needs, time-sliced (~6 ms per slice) so the game never hitches.
  function prewarm(song) {
    const jobs = [], seen = new Set();
    const add = (k, fn) => { if (!seen.has(k)) { seen.add(k); jobs.push(fn); } };
    const tps = {}; // pattern -> transposes used
    for (const s of Object.values(song.sections || {})) for (const tr of s.tracks || []) {
      const pn = typeof tr === "string" ? tr : tr.p; (tps[pn] || (tps[pn] = new Set())).add(typeof tr === "string" ? 0 : tr.transpose || 0);
    }
    for (const [pn, p] of Object.entries(song.patterns || {})) {
      const inst = song.instruments[p.inst];
      if (!inst || !tps[pn]) continue;
      for (const nt of p.notes) for (const q of Array.isArray(nt[1]) ? nt[1] : [nt[1]]) {
        const m = noteToMidi(q);
        if (inst.type === "drum") {
          const rr = RR_DRUMS[inst.kind] || 1;
          for (let v = 0; v < rr; v++) add(p.inst + "|" + (PITCHED_DRUMS[inst.kind] ? m : 0) + "|" + v, () => { stats.notes = v; drumBuf(inst, m); });
        } else if (inst.type === "pluck") {
          for (const tp of tps[pn]) { const mm = m + tp + 12 * (inst.octave || 0); add(p.inst + "|" + mm, () => pluckBuf(inst, mm)); }
        }
      }
    }
    const rv = song.master?.reverb || {};
    jobs.push(() => irBuffer(rv.seconds ?? 2.4, rv.damp ?? 0.6));
    const keep = stats.notes;
    const done = () => { stats.notes = keep; };
    if (offline || typeof setTimeout === "undefined") { jobs.forEach((j) => j()); done(); return Promise.resolve(); }
    return new Promise((res) => {
      let i = 0;
      const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
      const slice = () => {
        const t0 = now();
        while (i < jobs.length && now() - t0 < 6) jobs[i++]();
        if (i < jobs.length) setTimeout(slice, 0); else { done(); res(); }
      };
      slice();
    });
  }

  // ---------------- voice helpers ----------------
  function voiceOK(t, end) {
    let w = 0;
    for (let i = 0; i < voices.length; i++) if (voices[i] > t) voices[w++] = voices[i];
    voices.length = w;
    if (w >= MAX_VOICES) { stats.dropped++; return false; }
    voices.push(end);
    if (w + 1 > stats.maxVoices) stats.maxVoices = w + 1;
    return true;
  }
  // Per-instrument voice stealing for one-shot buffers (a guitar has 6 strings; a re-struck drum damps its ring):
  // past the cap, the oldest still-ringing hit of that instrument fades out in ~50 ms and frees its slot.
  const STEAL_CAP = { pluck: 6, drum: 3 };
  function steal(ch, t, cap) {
    const act = ch._act || (ch._act = []);
    let w = 0;
    for (let i = 0; i < act.length; i++) if (act[i].end > t) act[w++] = act[i];
    act.length = w;
    while (act.length >= cap) {
      const o = act.shift(), cut = t + 0.08;
      try { o.g.gain.setTargetAtTime(0, t, 0.015); o.s.stop(cut); } catch (e) { /* already stopped */ }
      const vi = voices.indexOf(o.end); if (vi >= 0) voices[vi] = cut;
    }
    return act;
  }
  // ADSR on a gain param; returns the time the voice is silent
  function adsr(param, t, dur, env, peak) {
    const a = Math.max(0.001, env.a ?? 0.01), d = Math.max(0.001, env.d ?? 0.1), s = Math.max(0, Math.min(1, env.s ?? 0.7)), r = Math.max(0.005, env.r ?? 0.2);
    const off = t + Math.max(dur, a + 0.004);
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.setTargetAtTime(peak * s, t + a, d / 3);
    param.setTargetAtTime(0, off, r / 4.5);
    // a percussive envelope (sustain 0) is silent (~-45 dB) about 1.7 d after the attack whatever the note length:
    // end the voice there so long notes of plucked/bell sounds do not hold a voice slot (and nodes) for nothing
    if (s === 0) return Math.min(off + r * 1.25, t + a + d * 1.7) + 0.02;
    return off + r * 1.25 + 0.02;
  }
  function kRate(param) { try { param.automationRate = "k-rate"; } catch (e) { /* older browsers: stays a-rate */ } }
  function filterNode(fdef, t, dur, env) {
    const f = ctx.createBiquadFilter();
    f.type = fdef.type || "lowpass"; f.Q.value = fdef.q ?? 0.7;
    const base = Math.max(30, fdef.freq ?? 2000), fe = fdef.env || 0;
    // k-rate: coefficients once per 128-sample block instead of per sample (big CPU win, inaudible for envelopes)
    if (fe || fdef.to) kRate(f.frequency);
    f.frequency.setValueAtTime(base + fe, t);
    if (fe) {
      const tc = Math.max(0.01, fdef.d ?? (env && env.d) ?? 0.2) / 3;
      f.frequency.setTargetAtTime(base, t, tc);
      if (!fdef.to) f.frequency.setValueAtTime(base, t + tc * 6); // end the automation so the filter goes static
    }
    if (fdef.to) f.frequency.exponentialRampToValueAtTime(Math.max(30, fdef.to), t + Math.max(0.05, dur));
    return f;
  }

  // ---------------- one note ----------------
  function playNote(ch, midi, t, dur, vel) {
    const inst = ch.inst, type = inst.type;
    if (muted && !offline) return;
    const peak = (inst.gain ?? 0.5) * vel;
    if (peak <= 0) return;
    stats.notes++;
    if (type === "drum") {
      const b = drumBuf(inst, midi), end = t + b.duration;
      const act = steal(ch, t, STEAL_CAP.drum);
      if (!voiceOK(t, end)) return;
      const s = ctx.createBufferSource(); s.buffer = b;
      const g = ctx.createGain(); g.gain.setValueAtTime(peak, t);
      s.connect(g); g.connect(ch.input); s.start(t); s.stop(end + 0.01);
      act.push({ s, g, end });
      return;
    }
    const m = midi + 12 * (inst.octave || 0), hz = midiToHz(m);
    if (type === "pluck") {
      const b = pluckBuf(inst, m);
      // the Karplus-Strong buffer fades to -60 dB at its end; at 70% of it the string is already ~-42 dB under the
      // mix, so the voice (and its slot) ends there
      let end = t + (b.duration - 0.03) * 0.7 + 0.03;
      if (inst.mute) end = Math.min(end, t + dur + 0.12);
      const act = steal(ch, t, STEAL_CAP.pluck);
      if (!voiceOK(t, end)) return;
      const s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = hz / midiToHz(Math.round(m));
      const g = ctx.createGain(); g.gain.setValueAtTime(peak, t);
      if (inst.mute) g.gain.setTargetAtTime(0, t + dur, 0.03);
      s.connect(g); g.connect(ch.input); s.start(t); s.stop(end + 0.01);
      act.push({ s, g, end });
      return;
    }
    const env = inst.env || {};
    const r = Math.max(0.005, env.r ?? 0.2);
    let endEst = t + Math.max(dur, (env.a ?? 0.01) + 0.004) + r * 1.25 + 0.02;
    if (env.s === 0) endEst = Math.min(endEst, t + Math.max(0.001, env.a ?? 0.01) + Math.max(0.001, env.d ?? 0.1) * 1.7 + 0.02);   // = adsr()
    if (!voiceOK(t, endEst)) return;
    const vg = ctx.createGain();
    let dest = vg;
    if (inst.filter && !ch.sharedFilter) { const f = filterNode(inst.filter, t, dur, env); vg.connect(f); f.connect(ch.input); }
    else vg.connect(ch.input); // static filters live once on the channel (identical sound, far fewer nodes)
    if (type === "noise") {
      const n = ctx.createBufferSource(); n.buffer = noiseBuf(inst.color || "white"); n.loop = true;
      const end = adsr(vg.gain, t, dur, env, peak);
      n.connect(dest); n.start(t, (stats.notes * 0.731) % 3); n.stop(end);
      return;
    }
    if (type === "fm") {
      const c = ctx.createOscillator(), mo = ctx.createOscillator(), mg = ctx.createGain();
      c.frequency.value = hz; mo.frequency.value = hz * (inst.ratio ?? 2);
      if (inst.detune) c.detune.value = inst.detune;
      const idx = (inst.index ?? 2) * hz;
      mg.gain.setValueAtTime(idx, t); mg.gain.setTargetAtTime(idx * 0.08, t, Math.max(0.01, inst.indexDecay ?? 0.4) / 3);
      mo.connect(mg); mg.connect(c.frequency); c.connect(dest);
      const end = adsr(vg.gain, t, dur, env, peak);
      c.start(t); mo.start(t); c.stop(end); mo.stop(end);
      return;
    }
    // synth
    const nv = Math.max(1, Math.min(4, inst.voices || 1));
    const end = adsr(vg.gain, t, dur, env, peak / Math.sqrt(nv));
    let lfo = null;
    if (inst.vibrato && inst.vibrato.depth) {
      lfo = ctx.createOscillator(); const lg = ctx.createGain(); lfo.frequency.value = inst.vibrato.rate || 5;
      const vd = inst.vibrato.delay ?? 0.2;
      lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(inst.vibrato.depth, t + Math.max(0.01, vd) + 0.15);
      lfo.connect(lg); lfo._g = lg; lfo.start(t); lfo.stop(end);
    }
    const from = inst.glide && ch.lastHz ? ch.lastHz : 0;
    ch.lastHz = hz;
    const mk = (type2, f, detune, gainMul) => {
      const o = ctx.createOscillator(); o.type = type2;
      if (lfo) kRate(o.detune);
      if (from) { kRate(o.frequency); o.frequency.setValueAtTime(from * f / hz, t); o.frequency.exponentialRampToValueAtTime(f, t + inst.glide); }
      else o.frequency.value = f;
      if (detune) o.detune.value = detune;
      if (lfo) lfo._g.connect(o.detune);
      let src = o;
      if (gainMul !== 1) { const gg = ctx.createGain(); gg.gain.value = gainMul; o.connect(gg); src = gg; }
      src.connect(dest); o.start(t); o.stop(end);
    };
    for (let v = 0; v < nv; v++) mk(inst.wave || "triangle", hz, nv > 1 ? ((v / (nv - 1)) * 2 - 1) * (inst.detune || 0) : 0, 1);
    if (inst.sub) mk("sine", hz / 2, 0, inst.sub * Math.sqrt(nv));
    if (inst.breath) {
      const n = ctx.createBufferSource(); n.buffer = noiseBuf("white"); n.loop = true;
      const bf = ctx.createBiquadFilter(); bf.type = "bandpass"; bf.frequency.value = Math.min(9000, hz * 2.2); bf.Q.value = 1.3;
      const bg = ctx.createGain(); bg.gain.value = inst.breath * 0.6 * Math.sqrt(nv);
      n.connect(bf); bf.connect(bg); bg.connect(dest); n.start(t, (stats.notes * 0.37) % 3); n.stop(end);
    }
  }

  // ---------------- sequencer ----------------
  function compile(song) {
    const spb = song.stepsPerBar || 16, pats = {}, secs = {};
    for (const [n, p] of Object.entries(song.patterns)) {
      const len = p.bars * spb, buckets = new Array(len);
      for (const nt of p.notes) {
        const b = Math.floor(nt[0]);
        if (b < 0 || b >= len) continue;
        const ps = (Array.isArray(nt[1]) ? nt[1] : [nt[1]]).map(noteToMidi).filter((x) => x >= 0);
        (buckets[b] || (buckets[b] = [])).push({ frac: nt[0] - b, ps, dur: nt[2], vel: nt[3] ?? 0.8 });
      }
      pats[n] = { len, buckets, inst: p.inst };
    }
    for (const [n, s] of Object.entries(song.sections)) {
      secs[n] = {
        len: s.bars * spb,
        tracks: s.tracks.map((tr) => {
          const pn = typeof tr === "string" ? tr : tr.p;
          return { pt: pats[pn], tp: typeof tr === "string" ? 0 : tr.transpose || 0, vs: typeof tr === "string" ? 1 : tr.vel ?? 1 };
        }).filter((x) => x.pt),
      };
    }
    return { song, spb, pats, secs, stepSec: 60 / song.bpm / 4 };
  }
  function startPlayer(song, fadeIn, at) {
    const C = compile(song), now = ctx.currentTime, mg = (song.master?.gain ?? 0.8) * (LOUDNESS[song.id] || 1);
    const out = ctx.createGain();
    out.gain.setValueAtTime(fadeIn > 0.02 ? 0 : mg, now);
    if (fadeIn > 0.02) out.gain.linearRampToValueAtTime(mg, now + fadeIn);
    out.connect(musicBus);
    // per-song reverb
    const rv = song.master?.reverb || {};
    const conv = ctx.createConvolver(); conv.buffer = irBuffer(rv.seconds ?? 2.4, rv.damp ?? 0.6);
    const revIn = ctx.createGain(), revOut = ctx.createGain();
    revOut.gain.value = Math.min(2.5, (rv.mix ?? 0.25) / 0.25);
    revIn.connect(conv); conv.connect(revOut); revOut.connect(out);
    // ping-pong delay
    const dl = song.master?.delay || {}, dt = Math.min(1.9, Math.max(0.01, (dl.steps ?? 3) * C.stepSec));
    const delIn = ctx.createGain(), dL = ctx.createDelay(2), dR = ctx.createDelay(2);
    dL.delayTime.value = dt; dR.delayTime.value = dt;
    const fbL = ctx.createGain(), fbR = ctx.createGain(), lpL = ctx.createBiquadFilter(), lpR = ctx.createBiquadFilter();
    fbL.gain.value = fbR.gain.value = Math.min(0.85, dl.feedback ?? 0.3);
    lpL.frequency.value = lpR.frequency.value = dl.tone ?? 3200;
    const merge = ctx.createChannelMerger(2);
    delIn.connect(dL); dL.connect(lpL); lpL.connect(fbL); fbL.connect(dR); dR.connect(lpR); lpR.connect(fbR); fbR.connect(dL);
    lpL.connect(merge, 0, 0); lpR.connect(merge, 0, 1); merge.connect(out);
    // channels
    const chans = {};
    for (const [name, inst] of Object.entries(song.instruments)) {
      const input = ctx.createGain();
      let node = input;
      const sharedFilter = !!(inst.filter && inst.type !== "drum" && (inst.type === "pluck" || (!inst.filter.env && !inst.filter.to)));
      if (sharedFilter) { const f = filterNode(inst.filter, 0, 0, null); input.connect(f); node = f; }
      if (inst.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = inst.pan; node.connect(p); node = p; }
      node.connect(out);
      if (inst.reverb) { const s = ctx.createGain(); s.gain.value = inst.reverb; node.connect(s); s.connect(revIn); }
      if (inst.delay) { const s = ctx.createGain(); s.gain.value = inst.delay; node.connect(s); s.connect(delIn); }
      chans[name] = { inst, input, lastHz: 0, sharedFilter };
    }
    const P = { C, song, out, chans, nodes: [out, revIn, revOut, conv, delIn, dL, dR, merge], t0: (at ?? now) + 0.06, n: 0, arr: 0, step: 0, timer: 0, stopped: false };
    P.time = (n) => P.t0 + n * C.stepSec;
    return P;
  }
  function advance(P) {
    P.n++;
    if (++P.step >= P.C.secs[P.song.arrangement[P.arr]].len) {
      P.step = 0; P.arr++;
      if (P.arr >= P.song.arrangement.length) P.arr = P.song.loop || 0;
    }
  }
  // schedule every step whose time is < horizon
  function scheduleUntil(P, horizon) {
    const C = P.C, song = P.song, now = ctx.currentTime;
    // fell far behind (frozen tab)? skip forward without a burst of notes
    while (!offline && P.time(P.n) < now - 0.08) { advance(P); stats.skipped++; }
    let t;
    while ((t = P.time(P.n)) < horizon) {
      const sec = C.secs[song.arrangement[P.arr]];
      const sw = (song.swing || 0) * (P.step % 2 === 1 ? C.stepSec : 0);
      const lead = t - now;
      if (lead < stats.minLead) stats.minLead = lead;
      if (lead < 0) stats.late++;
      stats.steps++;
      for (const tr of sec.tracks) {
        const pt = tr.pt, list = pt.buckets[P.step % pt.len];
        if (!list) continue;
        const ch = P.chans[pt.inst];
        if (!ch) continue;
        const drumI = ch.inst.type === "drum";
        for (const nt of list) {
          const nt0 = t + sw + nt.frac * C.stepSec, vel = Math.max(0, Math.min(1.5, nt.vel * tr.vs));
          for (const q of nt.ps) playNote(ch, q + (drumI ? 0 : tr.tp), nt0, nt.dur * C.stepSec, vel);
        }
      }
      advance(P);
    }
  }
  function lookahead() {
    return typeof document !== "undefined" && document.hidden ? 1.5 : 0.2;
  }
  function run(P) {
    const tick = () => {
      if (P.stopped) return;
      if (ctx.state === "running") scheduleUntil(P, ctx.currentTime + lookahead());
      P.timer = setTimeout(tick, 25);
    };
    tick();
  }
  function stopPlayer(P, fadeOut) {
    if (!P) return;
    P.stopped = true; clearTimeout(P.timer);
    const t = ctx.currentTime, fo = Math.max(0.03, fadeOut);
    P.out.gain.cancelScheduledValues(t); P.out.gain.setValueAtTime(P.out.gain.value, t);
    P.out.gain.linearRampToValueAtTime(0, t + fo);
    if (!offline) setTimeout(() => { for (const nd of P.nodes) { try { nd.disconnect(); } catch (e) { /* gone */ } } }, (fo + 0.4) * 1000);
  }

  // ---------------- sfx ----------------
  function sfxOut(t, pan, rev) {
    const g = ctx.createGain();
    let node = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); node = p; }
    node.connect(sfxBus);
    if (rev) { const s = ctx.createGain(); s.gain.value = rev; node.connect(s); s.connect(sfxRevIn); }
    return g;
  }
  // oscillator blip with exponential pitch sweep and a fast-attack exp-decay envelope
  function tone(dest, t, { type = "sine", f0, f1 = f0, dur = 0.1, gain = 0.2, attack = 0.003, sweep = dur, vib = 0, vibRate = 0 }) {
    const o = ctx.createOscillator(), e = ctx.createGain(); o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + sweep);
    if (vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vibRate || 6;
      lg.gain.setValueAtTime(vib, t); lg.gain.exponentialRampToValueAtTime(Math.max(0.5, vib * 0.02), t + dur);
      l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05);
    }
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(gain, t + attack);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e); e.connect(dest); o.start(t); o.stop(t + dur + 0.03);
  }
  function burst(dest, t, { color = "white", type = "lowpass", f = 1000, f1 = f, q = 0.8, dur = 0.1, gain = 0.2, attack = 0.002, hold = 0 }) {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf(color); n.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t); if (f1 !== f) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(gain, t + attack);
    if (hold) e.gain.setValueAtTime(gain, t + attack + hold);
    e.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + dur);
    n.connect(fl); fl.connect(e); e.connect(dest); n.start(t, Math.random() * 3); n.stop(t + attack + hold + dur + 0.03);
  }
  function bell(dest, t, hz, { dur = 1, gain = 0.12, ratio = 3.5, index = 1.6 } = {}) {
    const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), e = ctx.createGain();
    c.frequency.value = hz; m.frequency.value = hz * ratio;
    mg.gain.setValueAtTime(hz * index, t); mg.gain.exponentialRampToValueAtTime(hz * 0.05, t + dur * 0.6);
    m.connect(mg); mg.connect(c.frequency); c.connect(e); e.connect(dest);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(gain, t + 0.003); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    c.start(t); m.start(t); c.stop(t + dur + 0.03); m.stop(t + dur + 0.03);
  }
  const jit = (a) => 1 + (Math.random() * 2 - 1) * a;

  function sfx(name, o = {}) {
    if (!ctx || ctx.state === "closed" || muted) return;
    // a context that is still resuming right after unlock() may queue sounds (the first menu click); otherwise skip
    if (!offline && ctx.state !== "running" && !(unlockAt && nowMs() - unlockAt < 800)) return;
    const now = ctx.currentTime;
    const gap = name === "step" ? 0.06 : 0.03;
    if (lastSfx[name] !== undefined && now - lastSfx[name] < gap) return;
    lastSfx[name] = now;
    const v = Math.max(0, o.vol ?? 1), p = Math.max(0.25, Math.min(4, o.pitch ?? 1)), t = now + 0.005 + (o.at || 0);
    const pan = o.pan || 0;
    switch (name) {
      case "jump": {
        const d = sfxOut(t, pan, 0.05), j = jit(0.04) * p;
        tone(d, t, { type: "triangle", f0: 290 * j, f1: 560 * j, dur: 0.12, sweep: 0.08, gain: 0.3 * v });
        tone(d, t, { type: "sine", f0: 580 * j, f1: 1150 * j, dur: 0.08, gain: 0.09 * v });
        burst(d, t, { type: "bandpass", f: 1600, f1: 3800, q: 1.2, dur: 0.09, gain: 0.1 * v });
        break;
      }
      case "land": {
        const k = Math.max(0.15, Math.min(1, (o.impact || 5) / 10.5)), d = sfxOut(t, pan, 0.04), j = jit(0.05) * p;
        tone(d, t, { f0: 120 * j, f1: 48 * j, dur: 0.1 + 0.08 * k, gain: 0.32 * k * v });
        burst(d, t, { color: "pink", f: 600 + 500 * k, f1: 250, dur: 0.07 + 0.06 * k, gain: 0.16 * k * v });
        burst(d, t + 0.008, { type: "bandpass", f: 3200 * jit(0.2), q: 0.7, dur: 0.1 + 0.05 * k, gain: 0.045 * k * v }); // leaf rustle
        break;
      }
      case "step": {
        const d = sfxOut(t, pan, 0);
        burst(d, t, { type: "highpass", f: 2500 + Math.random() * 2500, dur: 0.035, gain: 0.03 * v });
        tone(d, t, { f0: 170 * jit(0.1), f1: 120, dur: 0.03, gain: 0.035 * v });
        break;
      }
      case "spring": {
        const d = sfxOut(t, pan, 0.12);
        tone(d, t, { f0: 90, f1: 55, dur: 0.1, gain: 0.25 * v });
        burst(d, t, { color: "pink", f: 900, f1: 300, dur: 0.07, gain: 0.1 * v });
        tone(d, t + 0.01, { type: "sine", f0: 170 * p, f1: 470 * p, sweep: 0.09, dur: 0.5, gain: 0.2 * v, vib: 55 * p, vibRate: 17 });
        tone(d, t + 0.01, { type: "triangle", f0: 340 * p, f1: 940 * p, sweep: 0.09, dur: 0.3, gain: 0.05 * v, vib: 110 * p, vibRate: 17 });
        break;
      }
      case "bonk": {
        const d = sfxOut(t, pan, 0.06);
        tone(d, t, { f0: 430 * p, f1: 300 * p, dur: 0.08, gain: 0.18 * v });
        tone(d, t, { type: "triangle", f0: 980 * p, f1: 760 * p, dur: 0.035, gain: 0.06 * v });
        burst(d, t, { type: "bandpass", f: 1300, q: 3, dur: 0.04, gain: 0.12 * v });
        break;
      }
      case "die": {
        const d = sfxOut(t, pan, 0.15);
        burst(d, t, { color: "pink", f: 2200, f1: 260, dur: 0.38, gain: 0.26 * v, attack: 0.004 });
        tone(d, t, { f0: 95, f1: 45, dur: 0.18, gain: 0.25 * v });
        tone(d, t + 0.04, { type: "triangle", f0: 560 * p, f1: 140 * p, sweep: 0.5, dur: 0.55, gain: 0.12 * v, vib: 18, vibRate: 9 });
        break;
      }
      case "respawn": {
        const d = sfxOut(t, pan, 0.35);
        [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => bell(d, t + i * 0.045, f * p, { dur: 0.45, gain: 0.05 * v, ratio: 2, index: 0.8 }));
        burst(d, t, { type: "highpass", f: 6000, dur: 0.35, gain: 0.025 * v, attack: 0.05 });
        break;
      }
      case "checkpoint": {
        const d = sfxOut(t, pan, 0.35);
        bell(d, t, 784 * p, { dur: 0.9, gain: 0.13 * v });
        bell(d, t + 0.1, 1174.7 * p, { dur: 1.3, gain: 0.13 * v });
        bell(d, t + 0.1, 1568 * p, { dur: 0.8, gain: 0.04 * v, ratio: 2 });
        burst(d, t, { type: "bandpass", f: 1100, f1: 2600, q: 0.9, dur: 0.28, gain: 0.05 * v, attack: 0.03 }); // flag whoosh
        break;
      }
      case "win": {
        const d = sfxOut(t, pan, 0.4);
        [523.3, 659.3, 784, 1046.5].forEach((f, i) => bell(d, t + i * 0.1, f * p, { dur: 0.9, gain: 0.12 * v, ratio: 2, index: 1.2 }));
        [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f) => {
          const o2 = ctx.createOscillator(), e = ctx.createGain(); o2.type = "triangle"; o2.frequency.value = f * p;
          e.gain.setValueAtTime(0, t + 0.4); e.gain.linearRampToValueAtTime(0.045 * v, t + 0.5); e.gain.setTargetAtTime(0, t + 1.3, 0.35);
          o2.connect(e); e.connect(d); o2.start(t + 0.4); o2.stop(t + 3.2);
        });
        bell(d, t + 0.42, 2093 * p, { dur: 1.6, gain: 0.06 * v, ratio: 3.5, index: 1 });
        burst(d, t + 0.4, { type: "highpass", f: 7000, dur: 1.2, gain: 0.03 * v, attack: 0.1 });
        break;
      }
      case "crumble": {
        const d = sfxOut(t, pan, 0.05);
        for (let i = 0; i < 6; i++) burst(d, t + Math.random() * 0.22, { type: "bandpass", f: 1400 + Math.random() * 1800, q: 2, dur: 0.02, gain: 0.08 * v });
        burst(d, t, { color: "brown", f: 300, dur: 0.25, gain: 0.12 * v, attack: 0.02 });
        break;
      }
      case "crumble_break": {
        const d = sfxOut(t, pan, 0.12);
        burst(d, t, { type: "highpass", f: 1500, dur: 0.05, gain: 0.22 * v });
        burst(d, t, { color: "pink", f: 700, f1: 140, dur: 0.5, gain: 0.3 * v, attack: 0.004 });
        tone(d, t, { f0: 110, f1: 50, dur: 0.2, gain: 0.2 * v });
        for (let i = 0; i < 9; i++) { const dt = 0.04 + Math.random() * 0.5; burst(d, t + dt, { type: "bandpass", f: 900 + Math.random() * 2200, q: 3, dur: 0.025, gain: 0.08 * v * (1 - dt) }); }
        break;
      }
      case "splash": {
        const d = sfxOut(t, pan, 0.15);
        burst(d, t, { type: "bandpass", f: 1800, f1: 500, q: 0.8, dur: 0.45, gain: 0.26 * v, attack: 0.01 });
        burst(d, t, { type: "highpass", f: 5000, dur: 0.2, gain: 0.06 * v });
        for (let i = 0; i < 5; i++) { const f = 500 + Math.random() * 800; tone(d, t + 0.05 + Math.random() * 0.35, { f0: f, f1: f * 1.8, dur: 0.05, gain: 0.04 * v }); }
        break;
      }
      case "click": {
        const d = sfxOut(t, pan, 0);
        tone(d, t, { f0: 1500 * p, f1: 1100 * p, dur: 0.028, gain: 0.08 * v });
        burst(d, t, { type: "highpass", f: 5000, dur: 0.012, gain: 0.03 * v });
        break;
      }
      case "place": {
        const d = sfxOut(t, pan, 0.04);
        tone(d, t, { f0: 560 * p * jit(0.03), f1: 380 * p, dur: 0.065, gain: 0.14 * v });
        tone(d, t, { type: "triangle", f0: 1100 * p, dur: 0.02, gain: 0.04 * v });
        break;
      }
      case "erase": {
        const d = sfxOut(t, pan, 0.04);
        burst(d, t, { type: "bandpass", f: 2600, f1: 800, q: 1.2, dur: 0.13, gain: 0.09 * v, attack: 0.01 });
        tone(d, t, { f0: 420 * p, f1: 250 * p, dur: 0.07, gain: 0.06 * v });
        break;
      }
      case "thunder": {
        const k = Math.max(0.3, Math.min(1, o.impact ?? 1));
        const d = sfxOut(t, pan || (Math.random() - 0.5) * 0.6, 0.25);
        burst(d, t, { type: "highpass", f: 900, f1: 400, dur: 0.3, gain: 0.32 * v * k, attack: 0.002 }); // crack
        burst(d, t + 0.02, { color: "white", type: "lowpass", f: 3000, f1: 300, dur: 0.6, gain: 0.2 * v * k, attack: 0.005 });
        // rumble: brown noise with an irregular rolling envelope
        const n = ctx.createBufferSource(); n.buffer = noiseBuf("brown"); n.loop = true;
        const fl = ctx.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = 220; fl.Q.value = 0.5;
        const e = ctx.createGain(), len = 3 + Math.random() * 1.5;
        e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.5 * v * k, t + 0.08);
        let tt = t + 0.08;
        while (tt < t + len - 0.4) { tt += 0.15 + Math.random() * 0.35; e.gain.linearRampToValueAtTime(0.5 * v * k * (0.3 + 0.7 * Math.random()) * (1 - (tt - t) / len), tt); }
        e.gain.linearRampToValueAtTime(0, t + len);
        n.connect(fl); fl.connect(e); e.connect(d); n.start(t, Math.random() * 3); n.stop(t + len + 0.05);
        break;
      }
      case "rate_done": {
        const d = sfxOut(t, pan, 0.35);
        [659.3, 880, 1318.5].forEach((f, i) => bell(d, t + i * 0.08, f * p, { dur: 0.8, gain: 0.1 * v, ratio: 2, index: 1 }));
        burst(d, t + 0.1, { type: "highpass", f: 6500, dur: 0.5, gain: 0.025 * v, attack: 0.08 });
        break;
      }
      case "publish": {
        const d = sfxOut(t, pan, 0.35);
        burst(d, t, { type: "bandpass", f: 500, f1: 4500, q: 1, dur: 0.45, gain: 0.06 * v, attack: 0.15 });
        [784, 987.8, 1174.7, 1568].forEach((f, i) => bell(d, t + 0.15 + i * 0.08, f * p, { dur: 1, gain: 0.1 * v, ratio: 2, index: 1.1 }));
        break;
      }
    }
  }

  // ---------------- ambience ----------------
  function startAmb(theme) {
    const t = ctx.currentTime, g = ctx.createGain(), A = { theme, g, srcs: [], timer: 0, stopped: false };
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 2); g.connect(ambBus);
    const loop = (color, type, f, q, gain, lfoRate = 0, lfoDepth = 0) => {
      const n = ctx.createBufferSource(); n.buffer = noiseBuf(color); n.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const e = ctx.createGain(); e.gain.value = gain;
      n.connect(fl); fl.connect(e); e.connect(g); n.start(t, Math.random() * 3); A.srcs.push(n);
      if (lfoRate) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = lfoRate; lg.gain.value = lfoDepth; l.connect(lg); lg.connect(e.gain); l.start(t); A.srcs.push(l); }
      return { fl, e };
    };
    const bird = (at) => {
      const kind = Math.floor(Math.random() * 4), base = 2600 + Math.random() * 1600, gn = 0.018 + Math.random() * 0.014;
      const out = ctx.createGain();
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = (Math.random() * 2 - 1) * 0.8; out.connect(p); p.connect(g); }
      else out.connect(g);
      const rs = ctx.createGain(); rs.gain.value = 0.5; out.connect(rs); rs.connect(sfxRevIn);
      if (kind === 0) { const nn = 3 + Math.floor(Math.random() * 4); for (let i = 0; i < nn; i++) tone(out, at + i * 0.1, { f0: base, f1: base * 1.45, sweep: 0.04, dur: 0.06, gain: gn }); }
      else if (kind === 1) tone(out, at, { f0: base * 1.2, f1: base * 0.8, dur: 0.45, gain: gn, vib: 380, vibRate: 28 });
      else if (kind === 2) { tone(out, at, { f0: base, f1: base * 1.02, dur: 0.26, gain: gn, attack: 0.03 }); tone(out, at + 0.32, { f0: base * 0.84, f1: base * 0.8, dur: 0.3, gain: gn, attack: 0.03 }); }
      else { for (let i = 0; i < 2; i++) tone(out, at + i * 0.18, { f0: base * 1.3, f1: base * 0.9, sweep: 0.1, dur: 0.13, gain: gn * 0.9 }); }
    };
    const every = (minS, maxS, fn) => {
      const go = () => { if (A.stopped) return; if (ctx.state === "running" && !muted) fn(ctx.currentTime + 0.05); A.timer = setTimeout(go, (minS + Math.random() * (maxS - minS)) * 1000); };
      A.timer = setTimeout(go, (minS * 0.5 + Math.random() * minS) * 1000);
    };
    const gusts = (node, fLo, fHi, gLo, gHi) => {
      const go = () => {
        if (A.stopped) return;
        const tt = ctx.currentTime, tc = 0.8 + Math.random() * 1.6;
        node.fl.frequency.setTargetAtTime(fLo + Math.random() * (fHi - fLo), tt, tc);
        node.e.gain.setTargetAtTime(gLo + Math.random() * (gHi - gLo), tt, tc);
        A.srcs.push({ stop() {}, _t: setTimeout(go, (1.5 + Math.random() * 3) * 1000) });
      };
      go();
    };
    if (theme === "forest") {
      loop("pink", "lowpass", 750, 0.5, 0.05, 0.07, 0.025);
      loop("white", "bandpass", 4200, 0.5, 0.009, 0.13, 0.006);
      every(0.9, 4.2, bird);
    } else if (theme === "highlands") {
      gusts(loop("pink", "bandpass", 450, 0.6, 0.06), 260, 900, 0.03, 0.11);
      gusts(loop("white", "bandpass", 1700, 5, 0.008), 1200, 2400, 0.002, 0.014);
      every(5, 12, (at) => { bird(at); });
      every(14, 28, (at) => { const out = ctx.createGain(); out.connect(g); const rs = ctx.createGain(); rs.gain.value = 0.7; out.connect(rs); rs.connect(sfxRevIn); tone(out, at, { f0: 2300, f1: 1500, dur: 1, gain: 0.02, attack: 0.08, vib: 40, vibRate: 7 }); });
    } else if (theme === "storm") {
      loop("white", "highpass", 900, 0.5, 0.06); // rain hiss (shaped further below)
      loop("pink", "lowpass", 1800, 0.6, 0.06, 0.09, 0.02);
      gusts(loop("pink", "bandpass", 380, 0.7, 0.05), 220, 800, 0.03, 0.12);
      every(9, 20, (at) => burst(g, at, { color: "brown", f: 130, dur: 2.8, gain: 0.16, attack: 0.6 }));
    }
    return A;
  }
  function stopAmb(A, fade = 1.2) {
    if (!A) return;
    A.stopped = true; clearTimeout(A.timer);
    const t = ctx.currentTime;
    A.g.gain.cancelScheduledValues(t); A.g.gain.setValueAtTime(A.g.gain.value, t); A.g.gain.linearRampToValueAtTime(0, t + fade);
    for (const s of A.srcs) { if (s._t) clearTimeout(s._t); try { s.stop(t + fade + 0.05); } catch (e) { /* ok */ } }
    setTimeout(() => { try { A.g.disconnect(); } catch (e) { /* ok */ } }, (fade + 0.3) * 1000);
  }

  // ---------------- api ----------------
  let gestureBound = false, unlockAt = 0;
  const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  function bindGestures() {
    if (gestureBound || typeof window === "undefined" || opts.context) return;
    gestureBound = true;
    const evs = ["pointerdown", "keydown", "touchend", "mousedown"];
    const h = () => { api.unlock(); if (ctx && ctx.state === "running") evs.forEach((e) => window.removeEventListener(e, h, true)); };
    evs.forEach((e) => window.addEventListener(e, h, true));
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => {
      if (!document.hidden && ctx && ctx.state !== "running" && ctx.state !== "closed") ctx.resume().catch(() => {});
    });
  }

  const api = {
    SFX_NAMES,
    // Call from inside a user gesture (click/tap/key). Safe to call repeatedly. (Also bound to the first gesture.)
    unlock() {
      const c = ensure();
      if (!c) return;
      if (!offline && c.state !== "running") { unlockAt = nowMs(); c.resume().catch(() => {}); }
      if (wantId && !player) api.playSong(wantId);
      if (wantAmb && !amb) api.ambience(wantAmb);
    },
    get context() { return ctx; },
    get currentSong() { return currentId; },
    // playSong(id, {fadeIn, fadeOut, restart}) -> Promise. Before unlock() it remembers the id and starts on unlock.
    async playSong(id, o = {}) {
      if (!SONG_IDS.includes(id)) return;
      wantId = id;
      if (!ctx || ctx.state === "closed") return;
      if (currentId === id && player && !o.restart) return;
      const song = await loadSong(id).catch(() => null);
      if (!song || wantId !== id) return;
      await prewarm(song);
      if (wantId !== id || (currentId === id && player && !o.restart)) return;
      api._play(song, o);
      currentId = id;
    },
    // play a song object directly (builder previews of unsaved data, tests)
    _play(song, o = {}) {
      if (!ensure()) return null;
      stopPlayer(player, o.fadeOut ?? 0.8);
      player = startPlayer(song, o.fadeIn ?? 0.6, o.at);
      currentId = song.id || null;
      if (!offline) run(player);
      return player;
    },
    stopSong(o = {}) { wantId = null; if (ctx) stopPlayer(player, o.fadeOut ?? 0.8); player = null; currentId = null; },
    setVolume(v) { for (const k of ["master", "music", "sfx"]) if (typeof v[k] === "number") vol[k] = Math.max(0, Math.min(1, v[k])); applyVol(); },
    getVolume() { return Object.assign({}, vol); },
    setMuted(m) { muted = !!m; applyVol(); },
    get muted() { return muted; },
    sfx,
    // duck music briefly (death, big moments): amount 0..1, seconds to recover
    duck(amount = 0.5, sec = 0.6) {
      if (!ctx) return;
      const t = ctx.currentTime, p = duckG.gain, a = Math.max(0, Math.min(1, amount));
      p.cancelScheduledValues(t); p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(1 - a, t + 0.04); p.setTargetAtTime(1, t + 0.08, Math.max(0.05, sec) / 3);
    },
    // optional: looping nature bed for a theme ("forest" | "highlands" | "storm"); null/undefined stops it
    ambience(theme) {
      wantAmb = theme || null;
      if (!ctx || offline) return;
      if (amb && amb.theme === theme) return;
      stopAmb(amb); amb = null;
      if (theme && ctx.state !== "closed") amb = startAmb(theme);
    },
    stats() { return Object.assign({ voicesNow: voices.length, cached: { drum: cache.drum.size, pluck: cache.pluck.size } }, stats); },
    // tests: schedule synchronously up to time `until` (offline contexts)
    _prewarm: (song) => (ensure() ? prewarm(song) : Promise.resolve()),
    _pump(until) { if (player) scheduleUntil(player, until); },
  };
  bindGestures();
  return api;
}

// Render a song offline (tests / tooling, browser only). -> { buffer, stats }
export async function renderOffline(songOrId, { seconds, sampleRate = 44100, raw = false, chunk = 2 } = {}) {
  const song = typeof songOrId === "string" ? await loadSong(songOrId) : songOrId;
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const off = new OAC(2, Math.ceil(seconds * sampleRate), sampleRate);
  const a = createAudio({ context: off, raw });
  a.unlock();
  await a._prewarm(song);
  a._play(song, { fadeIn: 0, at: 0 });
  // schedule in chunks, suspending the render between them (keeps node count bounded like the realtime scheduler)
  const P = Math.max(0.5, chunk);
  if (off.suspend) {
    for (let t = P; t < seconds; t += P) {
      off.suspend(t).then(() => { a._pump(t + P + 0.1); off.resume(); });
    }
  }
  a._pump(off.suspend ? P + 0.1 : seconds);
  const buffer = await off.startRendering();
  return { buffer, stats: a.stats(), audio: a };
}
