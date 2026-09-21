/* ============================================================================
 * RAGE TRIALS — audio.js
 *
 * RT.Audio = { unlock(), sfx(name), music(name), stopMusic(), setEnabled(b), enabled }
 *
 * Everything here is synthesised with the Web Audio API. There is not a single
 * asset file, no fetch(), no base64 blob — just oscillators, one shared white
 * noise buffer, filters and envelopes.
 *
 * Signal graph
 *   note/sfx voices ──▶ sfxBus ──┐
 *   music note voices ─▶ trackGain ─▶ musicBus ──┴─▶ compressor ─▶ master ─▶ destination
 *
 * Music is driven by a LOOKAHEAD SCHEDULER on setInterval (25 ms tick, 100 ms
 * scheduling window). It is deliberately NOT rAF: rAF is throttled to a crawl
 * in background tabs and in headless Chrome, and the contract forbids anything
 * that matters depending on rAF timing.
 *
 * Nothing in this file throws if the AudioContext is missing, blocked or
 * suspended; every public method is safe to call before the first user gesture.
 * ========================================================================= */
(function () {
  'use strict';

  var RT = window.RT;
  if (!RT) return;                       // engine.js owns window.RT; nothing to attach to.
  if (RT.Audio && RT.Audio.__rt) return; // never install twice

  /* ======================================================================
   * 0. Tunables
   * ==================================================================== */

  var MASTER_GAIN = 0.80;
  var SFX_GAIN    = 0.85;
  var MUSIC_GAIN  = 0.50;

  var TICK_MS     = 25;    // scheduler interval
  var LOOKAHEAD   = 0.10;  // seconds of music scheduled in advance
  var NOISE_SECS  = 1.25;  // length of the single shared white-noise buffer

  var SAVE_KEY    = 'rageTrialsSave';

  /* ======================================================================
   * 1. Context, buses, lifecycle
   * ==================================================================== */

  var ctx = null;        // AudioContext (created on the first gesture)
  var broken = false;    // true once we know audio can never work here
  var gestured = false;  // a real user gesture has happened
  var silentDone = false;

  var master = null, comp = null, sfxBus = null, musicBus = null;
  var noiseBuffer = null;
  var waveCache = {};

  var A = {
    __rt: true,
    enabled: true,
    unlocked: false
  };

  function ensure(force) {
    if (ctx) return ctx;
    if (broken) return null;
    if (!force && !gestured) return null; // don't build a suspended ctx before a gesture
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) { broken = true; return null; }
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch (e) {
      try { ctx = new Ctor(); } catch (e2) { broken = true; ctx = null; return null; }
    }
    if (!ctx) { broken = true; return null; }
    try {
      buildGraph();
      buildNoise();
    } catch (e3) {
      broken = true;
      try { if (ctx.close) ctx.close(); } catch (e4) {}
      ctx = null;
      return null;
    }
    try {
      ctx.onstatechange = function () {
        if (!ctx) return;
        if (ctx.state === 'running') {
          A.unlocked = true;
          if (wanted && !mus) startTrack(wanted);
        }
      };
    } catch (e5) {}
    return ctx;
  }

  function sp(param, v) { try { param.value = v; } catch (e) {} }

  function buildGraph() {
    master = ctx.createGain();
    master.gain.value = A.enabled ? MASTER_GAIN : 0;

    comp = ctx.createDynamicsCompressor();
    sp(comp.threshold, -16);
    sp(comp.knee, 12);
    sp(comp.ratio, 8);
    sp(comp.attack, 0.004);
    sp(comp.release, 0.18);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = SFX_GAIN;
    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_GAIN;

    sfxBus.connect(comp);
    musicBus.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);
  }

  function buildNoise() {
    var n = Math.floor(ctx.sampleRate * NOISE_SECS);
    noiseBuffer = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = noiseBuffer.getChannelData(0);
    // A mildly smoothed white noise: pure white is fizzy, this keeps some body.
    var last = 0;
    for (var i = 0; i < n; i++) {
      var w = Math.random() * 2 - 1;
      last = (last + w * 0.62) * 0.5;
      d[i] = Math.max(-1, Math.min(1, w * 0.72 + last * 0.9));
    }
  }

  function running() {
    return !!(ctx && ctx.state === 'running');
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  /* --- unlock ----------------------------------------------------------- */

  A.unlock = function () {
    gestured = true;
    var c = ensure(true);
    if (!c) return false;
    try {
      if (c.state !== 'running' && c.resume) {
        var p = c.resume();
        if (p && p.then) p.then(function () {}, function () {});
      }
    } catch (e) {}
    // iOS wants an actual buffer to have been started from inside the gesture.
    if (!silentDone) {
      try {
        var b = c.createBuffer(1, 1, c.sampleRate);
        var s = c.createBufferSource();
        s.buffer = b;
        s.connect(c.destination);
        if (s.start) s.start(0); else if (s.noteOn) s.noteOn(0);
        silentDone = true;
      } catch (e2) {}
    }
    if (c.state === 'running') {
      A.unlocked = true;
      if (wanted && !mus) startTrack(wanted);
    }
    return A.unlocked;
  };

  function gesture() {
    // Cheap no-op once the context is alive; still there to recover from iOS
    // interruptions (a phone call suspends the context out from under us).
    if (!ctx || ctx.state !== 'running') A.unlock();
  }

  (function installGestureHooks() {
    var evs = ['pointerdown', 'mousedown', 'touchstart', 'touchend', 'keydown'];
    var opts;
    try {
      // feature-detect the options object; old browsers read it as `capture`
      var probe = Object.defineProperty({}, 'passive', { get: function () { opts = { capture: true, passive: true }; return true; } });
      window.addEventListener('__rtprobe', null, probe);
      window.removeEventListener('__rtprobe', null, probe);
    } catch (e) {}
    for (var i = 0; i < evs.length; i++) {
      try { window.addEventListener(evs[i], gesture, opts || true); } catch (e2) {}
    }
    try {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) gesture();
      }, false);
    } catch (e3) {}
  })();

  /* --- enable / persist -------------------------------------------------- */

  function readPref() {
    // RT.save does not exist yet while this file is evaluated (the engine builds
    // it in boot()), so fall back to the raw save blob, then re-sync later.
    var v;
    try {
      if (RT.save && RT.save.settings && typeof RT.save.settings.sound === 'boolean') {
        return RT.save.settings.sound;
      }
    } catch (e) {}
    try {
      var raw = window.localStorage ? window.localStorage.getItem(SAVE_KEY) : null;
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.settings && typeof o.settings.sound === 'boolean') v = o.settings.sound;
      }
    } catch (e2) {}
    return typeof v === 'boolean' ? v : true;
  }

  var prefSynced = false;
  function syncPref() {
    if (prefSynced) return;
    try {
      if (RT.save && RT.save.settings) {
        prefSynced = true;
        if (typeof RT.save.settings.sound === 'boolean') {
          if (RT.save.settings.sound !== A.enabled) A.setEnabled(RT.save.settings.sound);
        } else {
          RT.save.settings.sound = A.enabled;
        }
      }
    } catch (e) {}
  }

  function persist() {
    try {
      if (RT.save && RT.save.settings) {
        RT.save.settings.sound = A.enabled;
        prefSynced = true;
        if (typeof RT.saveNow === 'function') RT.saveNow();
      }
    } catch (e) {}
  }

  A.enabled = readPref();

  A.setEnabled = function (b) {
    b = !!b;
    var changed = (b !== A.enabled);
    A.enabled = b;
    if (ctx && master) {
      try {
        var t = now();
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(b ? MASTER_GAIN : 0, t + 0.08);
      } catch (e) { sp(master.gain, b ? MASTER_GAIN : 0); }
    }
    if (changed) {
      if (!b) {
        // stop scheduling entirely while muted, but remember what should play
        var keep = wanted;
        stopMusicInternal(0.05);
        wanted = keep;
      } else if (wanted) {
        A.music(wanted);
      }
    }
    persist();
    return A.enabled;
  };

  A.setMusicVolume = function (v) {
    if (musicBus) { try { musicBus.gain.value = Math.max(0, Math.min(1.5, v)); } catch (e) {} }
  };
  A.setSfxVolume = function (v) {
    if (sfxBus) { try { sfxBus.gain.value = Math.max(0, Math.min(1.5, v)); } catch (e) {} }
  };

  /* ======================================================================
   * 2. Notes
   * ==================================================================== */

  var LETTER = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  var NOTE_CACHE = {};
  var FREQ_CACHE = {};

  function midiOf(tok) {
    if (NOTE_CACHE.hasOwnProperty(tok)) return NOTE_CACHE[tok];
    var s = String(tok).toLowerCase();
    var base = LETTER[s.charAt(0)];
    if (base === undefined) { NOTE_CACHE[tok] = null; return null; }
    var i = 1, acc = 0, ch;
    while (i < s.length) {
      ch = s.charAt(i);
      if (ch === '#' || ch === 's') { acc++; i++; }
      else if (ch === 'b') { acc--; i++; }
      else break;
    }
    var oct = parseInt(s.substring(i), 10);
    if (isNaN(oct)) oct = 4;
    var m = (oct + 1) * 12 + base + acc;
    NOTE_CACHE[tok] = m;
    return m;
  }

  function freqOf(m) {
    var f = FREQ_CACHE[m];
    if (f === undefined) { f = 440 * Math.pow(2, (m - 69) / 12); FREQ_CACHE[m] = f; }
    return f;
  }

  function nf(name) { var m = midiOf(name); return m == null ? 440 : freqOf(m); }

  /* ======================================================================
   * 3. Synth kit
   * ==================================================================== */

  function pulseWave(duty) {
    var key = 'p' + duty;
    if (waveCache[key] !== undefined) return waveCache[key];
    var w = null;
    try {
      var n = 26;
      var real = new Float32Array(n + 1);
      var imag = new Float32Array(n + 1);
      for (var i = 1; i <= n; i++) {
        real[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
      }
      w = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    } catch (e) { w = null; }
    waveCache[key] = w;
    return w;
  }

  function mkOsc(wave, duty) {
    var o = ctx.createOscillator();
    if (wave === 'pulse') {
      var w = pulseWave(duty == null ? 0.5 : duty);
      if (w) { try { o.setPeriodicWave(w); } catch (e) { o.type = 'square'; } }
      else o.type = 'square';
    } else {
      try { o.type = wave || 'square'; } catch (e2) { o.type = 'square'; }
    }
    return o;
  }

  /* An ADSR onto a gain param. Returns the time the node may be torn down. */
  function envelope(param, t, dur, peak, a, d, sus, r) {
    a = (a == null) ? 0.004 : a;
    d = (d == null) ? Math.min(0.09, dur * 0.45) : d;
    sus = (sus == null) ? 0 : sus;
    r = (r == null) ? Math.min(0.06, dur * 0.35) : r;
    if (a > dur * 0.5) a = dur * 0.5;
    peak = Math.max(0.0002, peak);

    var end = t + dur;
    var susLvl = Math.max(0.0002, peak * sus);
    var dEnd = Math.min(t + a + d, end - r);
    if (dEnd < t + a) dEnd = t + a;

    param.setValueAtTime(0.0002, t);
    param.linearRampToValueAtTime(peak, t + a);
    if (dEnd > t + a) param.linearRampToValueAtTime(susLvl, dEnd);
    else susLvl = peak;
    param.setValueAtTime(Math.max(0.0002, susLvl), dEnd);
    param.exponentialRampToValueAtTime(0.0002, end);
    param.linearRampToValueAtTime(0, end + 0.005);
    return end + 0.02;
  }

  function mkFilter(f, t, dur) {
    if (!f) return null;
    var n = ctx.createBiquadFilter();
    try { n.type = f.type || 'lowpass'; } catch (e) {}
    sp(n.frequency, Math.max(20, f.f || 1000));
    if (f.q != null) sp(n.Q, f.q);
    if (f.gain != null) sp(n.gain, f.gain);
    if (f.f2 != null && f.f2 !== f.f) {
      try {
        n.frequency.setValueAtTime(Math.max(20, f.f || 1000), t);
        n.frequency.exponentialRampToValueAtTime(Math.max(20, f.f2), t + (f.ft || dur));
      } catch (e2) {}
    }
    return n;
  }

  /* One pitched voice. Options:
   *   t dur f f2 lin bend[[dt,f]…] wave duty detune gain a d sus r
   *   filt{type,f,f2,q,ft}  vib{hz,cents}  mod(AudioNode → detune)  bus
   */
  function tone(o) {
    if (!running() || !A.enabled) return 0;
    var t = (o.t == null) ? now() : o.t;
    if (t < ctx.currentTime) t = ctx.currentTime;
    var dur = Math.max(0.012, o.dur == null ? 0.2 : o.dur);
    var osc, g, filt = null, vibOsc = null, vibGain = null;
    try {
      osc = mkOsc(o.wave, o.duty);
      g = ctx.createGain();
    } catch (e) { return 0; }

    var f0 = Math.max(1, o.f || 440);
    try {
      osc.frequency.setValueAtTime(f0, t);
      if (o.bend && o.bend.length) {
        for (var i = 0; i < o.bend.length; i++) {
          var bt = t + o.bend[i][0], bf = Math.max(1, o.bend[i][1]);
          if (o.lin) osc.frequency.linearRampToValueAtTime(bf, bt);
          else osc.frequency.exponentialRampToValueAtTime(bf, bt);
        }
      } else if (o.f2 && o.f2 !== f0) {
        var gt = t + (o.gt == null ? dur : o.gt);
        if (o.lin) osc.frequency.linearRampToValueAtTime(Math.max(1, o.f2), gt);
        else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), gt);
      }
      if (o.detune) osc.detune.setValueAtTime(o.detune, t);
    } catch (e2) {}

    var end = envelope(g.gain, t, dur, o.gain == null ? 0.2 : o.gain, o.a, o.d, o.sus, o.r);

    filt = mkFilter(o.filt, t, dur);
    try {
      if (filt) { osc.connect(filt); filt.connect(g); }
      else osc.connect(g);
      g.connect(o.bus || sfxBus);
    } catch (e3) { return 0; }

    // per-note vibrato (one-shot sfx); music voices share a track LFO via o.mod
    if (o.vib && o.vib.cents) {
      try {
        vibOsc = ctx.createOscillator();
        vibOsc.type = 'sine';
        sp(vibOsc.frequency, o.vib.hz || 6);
        vibGain = ctx.createGain();
        sp(vibGain.gain, o.vib.cents);
        vibOsc.connect(vibGain);
        vibGain.connect(osc.detune);
        vibOsc.start(t);
        vibOsc.stop(end + 0.03);
      } catch (e4) { vibOsc = null; }
    }
    var mod = o.mod || null;
    if (mod) { try { mod.connect(osc.detune); } catch (e5) { mod = null; } }

    try {
      osc.start(t);
      osc.stop(end + 0.03);
    } catch (e6) { return 0; }

    osc.onended = function () {
      try { osc.disconnect(); } catch (x) {}
      try { if (filt) filt.disconnect(); } catch (x) {}
      try { g.disconnect(); } catch (x) {}
      try { if (vibGain) vibGain.disconnect(); } catch (x) {}
      try { if (vibOsc) vibOsc.disconnect(); } catch (x) {}
      try { if (mod) mod.disconnect(osc.detune); } catch (x) {}
      osc.onended = null;
    };
    return end;
  }

  /* One noise voice. Options: t dur gain a d sus r filt{…} rate bus */
  function noise(o) {
    if (!running() || !A.enabled || !noiseBuffer) return 0;
    var t = (o.t == null) ? now() : o.t;
    if (t < ctx.currentTime) t = ctx.currentTime;
    var dur = Math.max(0.012, o.dur == null ? 0.1 : o.dur);
    var src, g, filt = null;
    try {
      src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      if (o.rate) sp(src.playbackRate, o.rate);
      g = ctx.createGain();
    } catch (e) { return 0; }

    var end = envelope(g.gain, t, dur, o.gain == null ? 0.2 : o.gain, o.a, o.d, o.sus, o.r);
    filt = mkFilter(o.filt, t, dur);
    try {
      if (filt) { src.connect(filt); filt.connect(g); }
      else src.connect(g);
      g.connect(o.bus || sfxBus);
    } catch (e2) { return 0; }

    var maxOff = Math.max(0, NOISE_SECS - dur - 0.05);
    var off = Math.random() * maxOff;
    try {
      src.start(t, off, Math.min(NOISE_SECS - off, dur + 0.06));
    } catch (e3) {
      try { src.start(t); } catch (e4) { return 0; }
      try { src.stop(end + 0.03); } catch (e5) {}
    }
    src.onended = function () {
      try { src.disconnect(); } catch (x) {}
      try { if (filt) filt.disconnect(); } catch (x) {}
      try { g.disconnect(); } catch (x) {}
      src.onended = null;
    };
    return end;
  }

  /* --- composite shorthands --------------------------------------------- */

  function blip(t, f0, f1, dur, gain, wave, duty) {
    return tone({ t: t, f: f0, f2: f1, dur: dur, gain: gain, wave: wave || 'pulse', duty: duty == null ? 0.5 : duty, a: 0.003, d: dur * 0.5, sus: 0.55, r: dur * 0.35 });
  }

  function click(t, gain, f, dur) {
    return noise({ t: t, dur: dur || 0.022, gain: gain == null ? 0.12 : gain, a: 0.001, d: 0.008, sus: 0.05, r: 0.01, filt: { type: 'bandpass', f: f || 2200, q: 1.1 } });
  }

  function arp(t, names, step, dur, o) {
    o = o || {};
    var last = t;
    for (var i = 0; i < names.length; i++) {
      var opt = {
        t: t + i * step, f: nf(names[i]), dur: dur, gain: o.gain == null ? 0.16 : o.gain,
        wave: o.wave || 'pulse', duty: o.duty == null ? 0.5 : o.duty,
        a: o.a == null ? 0.003 : o.a, d: o.d, sus: o.sus == null ? 0.6 : o.sus, r: o.r,
        filt: o.filt, detune: o.detune
      };
      last = tone(opt);
    }
    return last;
  }

  /* metallic hit: four inharmonic partials */
  function metal(t, base, dur, gain, ratios) {
    ratios = ratios || [1, 1.41, 1.87, 2.44];
    for (var i = 0; i < ratios.length; i++) {
      tone({
        t: t, f: base * ratios[i], dur: dur * (1 - i * 0.14), gain: gain * (i === 0 ? 1 : 0.5 / i),
        wave: 'square', a: 0.001, d: dur * 0.3, sus: 0.12, r: dur * 0.5
      });
    }
  }

  /* ======================================================================
   * 4. Drums (shared by the music scheduler)
   * ==================================================================== */

  var DRUM = {
    k: function (t, g, bus) {                       // kick
      tone({ t: t, f: 138, f2: 44, dur: 0.14, gt: 0.07, gain: 0.85 * g, wave: 'sine', a: 0.002, d: 0.05, sus: 0.3, r: 0.07, bus: bus });
      noise({ t: t, dur: 0.028, gain: 0.22 * g, a: 0.001, d: 0.012, sus: 0.05, r: 0.012, filt: { type: 'lowpass', f: 2200 }, bus: bus });
    },
    s: function (t, g, bus) {                       // snare
      noise({ t: t, dur: 0.125, gain: 0.5 * g, a: 0.001, d: 0.045, sus: 0.22, r: 0.06, filt: { type: 'highpass', f: 1400 }, bus: bus });
      noise({ t: t, dur: 0.07, gain: 0.26 * g, a: 0.001, d: 0.03, sus: 0.1, r: 0.03, filt: { type: 'bandpass', f: 420, q: 1.3 }, bus: bus });
      tone({ t: t, f: 196, f2: 150, dur: 0.06, gain: 0.2 * g, wave: 'triangle', a: 0.001, d: 0.03, sus: 0.1, r: 0.025, bus: bus });
    },
    h: function (t, g, bus) {                       // closed hat
      noise({ t: t, dur: 0.032, gain: 0.2 * g, a: 0.001, d: 0.012, sus: 0.05, r: 0.014, filt: { type: 'highpass', f: 7200 }, bus: bus });
    },
    H: function (t, g, bus) {                       // open hat
      noise({ t: t, dur: 0.16, gain: 0.17 * g, a: 0.001, d: 0.05, sus: 0.22, r: 0.09, filt: { type: 'highpass', f: 6000 }, bus: bus });
    },
    c: function (t, g, bus) {                       // crash
      noise({ t: t, dur: 0.55, gain: 0.3 * g, a: 0.002, d: 0.14, sus: 0.3, r: 0.35, filt: { type: 'highpass', f: 4200 }, bus: bus });
      noise({ t: t, dur: 0.3, gain: 0.14 * g, a: 0.001, d: 0.1, sus: 0.2, r: 0.18, filt: { type: 'bandpass', f: 2600, q: 0.7 }, bus: bus });
    },
    t: function (t, g, bus) {                       // tom
      tone({ t: t, f: 232, f2: 104, dur: 0.16, gt: 0.12, gain: 0.55 * g, wave: 'sine', a: 0.002, d: 0.06, sus: 0.3, r: 0.08, bus: bus });
      noise({ t: t, dur: 0.05, gain: 0.1 * g, a: 0.001, d: 0.02, sus: 0.1, r: 0.02, filt: { type: 'lowpass', f: 1500 }, bus: bus });
    },
    r: function (t, g, bus) {                       // rim / woodblock
      tone({ t: t, f: 900, f2: 640, dur: 0.035, gain: 0.3 * g, wave: 'square', a: 0.001, d: 0.015, sus: 0.05, r: 0.015, bus: bus });
      noise({ t: t, dur: 0.028, gain: 0.16 * g, a: 0.001, d: 0.01, sus: 0.05, r: 0.012, filt: { type: 'bandpass', f: 3000, q: 1.6 }, bus: bus });
    },
    m: function (t, g, bus) {                       // industrial clank
      metalBus(t, 0.5 * g, bus);
    }
  };

  function metalBus(t, g, bus) {
    var ratios = [1, 1.63, 2.21, 3.07];
    for (var i = 0; i < ratios.length; i++) {
      tone({ t: t, f: 340 * ratios[i], dur: 0.11 - i * 0.015, gain: g * (i === 0 ? 0.5 : 0.24 / i), wave: 'square', a: 0.001, d: 0.03, sus: 0.14, r: 0.05, bus: bus });
    }
    noise({ t: t, dur: 0.07, gain: g * 0.45, a: 0.001, d: 0.025, sus: 0.1, r: 0.03, filt: { type: 'bandpass', f: 4200, q: 0.8 }, bus: bus });
  }

  /* ======================================================================
   * 5. SFX — every name in contract §9, each one designed
   * ==================================================================== */

  var SFX = {

    /* ---- movement ----------------------------------------------------- */

    jump: function (t) {
      tone({ t: t, f: 300, f2: 690, dur: 0.115, gt: 0.075, gain: 0.26, wave: 'pulse', duty: 0.5, a: 0.003, d: 0.03, sus: 0.7, r: 0.05 });
      tone({ t: t, f: 600, f2: 1380, dur: 0.07, gt: 0.06, gain: 0.07, wave: 'pulse', duty: 0.25, a: 0.002, d: 0.025, sus: 0.25, r: 0.03 });
      noise({ t: t, dur: 0.05, gain: 0.05, a: 0.001, d: 0.02, sus: 0.1, r: 0.02, filt: { type: 'highpass', f: 2400 } });
    },

    doublejump: function (t) {
      tone({ t: t, f: 430, f2: 1000, dur: 0.1, gt: 0.07, gain: 0.22, wave: 'pulse', duty: 0.25, a: 0.002, d: 0.03, sus: 0.6, r: 0.045 });
      tone({ t: t + 0.05, f: 760, f2: 1620, dur: 0.13, gt: 0.09, gain: 0.15, wave: 'triangle', a: 0.003, d: 0.04, sus: 0.45, r: 0.06 });
      noise({ t: t, dur: 0.12, gain: 0.07, a: 0.002, d: 0.05, sus: 0.2, r: 0.05, filt: { type: 'highpass', f: 2600, f2: 6500 } });
    },

    land: function (t) {
      tone({ t: t, f: 195, f2: 62, dur: 0.135, gt: 0.09, gain: 0.32, wave: 'triangle', a: 0.002, d: 0.055, sus: 0.3, r: 0.06 });
      noise({ t: t, dur: 0.095, gain: 0.17, a: 0.001, d: 0.04, sus: 0.2, r: 0.04, filt: { type: 'lowpass', f: 1200, f2: 260, q: 1.2 } });
    },

    step: function (t) {
      // quiet, but it has to read under a full music mix: a scuff plus a little body
      noise({ t: t, dur: 0.04, gain: 0.05, a: 0.001, d: 0.016, sus: 0.08, r: 0.016, filt: { type: 'bandpass', f: 1150 + Math.random() * 550, q: 1.3 } });
      tone({ t: t, f: 150 + Math.random() * 30, f2: 95, dur: 0.045, gain: 0.042, wave: 'triangle', a: 0.001, d: 0.02, sus: 0.12, r: 0.018 });
    },

    /* ---- pickups ------------------------------------------------------ */

    coin: function (t) {
      tone({ t: t, f: nf('b5'), dur: 0.055, gain: 0.2, wave: 'pulse', duty: 0.25, a: 0.002, d: 0.02, sus: 0.85, r: 0.02 });
      tone({ t: t + 0.055, f: nf('e6'), dur: 0.2, gain: 0.2, wave: 'pulse', duty: 0.25, a: 0.002, d: 0.1, sus: 0.35, r: 0.1 });
      tone({ t: t + 0.055, f: nf('e7'), dur: 0.12, gain: 0.04, wave: 'triangle', a: 0.002, d: 0.06, sus: 0.2, r: 0.05 });
    },

    cash: function (t) {
      tone({ t: t, f: nf('e5'), dur: 0.06, gain: 0.17, wave: 'triangle', a: 0.002, d: 0.025, sus: 0.8, r: 0.025 });
      tone({ t: t + 0.06, f: nf('a5'), dur: 0.22, gain: 0.17, wave: 'triangle', a: 0.002, d: 0.1, sus: 0.35, r: 0.11 });
      tone({ t: t + 0.06, f: nf('c#6'), dur: 0.2, gain: 0.09, wave: 'triangle', a: 0.003, d: 0.1, sus: 0.3, r: 0.09 });
      click(t, 0.09, 5200, 0.03);
    },

    buy: function (t) {
      arp(t, ['c5', 'e5', 'g5', 'c6'], 0.045, 0.1, { gain: 0.16, duty: 0.25, sus: 0.5 });
      tone({ t: t + 0.18, f: nf('c6'), dur: 0.26, gain: 0.13, wave: 'triangle', a: 0.004, d: 0.12, sus: 0.3, r: 0.12 });
      click(t, 0.1, 3000, 0.025);
    },

    key: function (t) {
      tone({ t: t, f: nf('g6'), dur: 0.09, gain: 0.14, wave: 'triangle', a: 0.002, d: 0.04, sus: 0.4, r: 0.04 });
      tone({ t: t + 0.07, f: nf('c7'), dur: 0.3, gain: 0.12, wave: 'triangle', a: 0.002, d: 0.14, sus: 0.25, r: 0.15 });
      metal(t, 1560, 0.16, 0.05);
    },

    powerup: function (t) {
      var seq = ['c5', 'e5', 'g5', 'c6', 'e6', 'g6', 'c7'];
      arp(t, seq, 0.045, 0.085, { gain: 0.16, duty: 0.5, sus: 0.5 });
      tone({ t: t + 0.045 * seq.length, f: nf('c7'), dur: 0.3, gain: 0.11, wave: 'pulse', duty: 0.25, a: 0.003, d: 0.14, sus: 0.25, r: 0.14 });
    },

    mushroom: function (t) { SFX.powerup(t); },

    balloon: function (t) {
      // inflate: airy rising whoosh plus a soft major chord
      noise({ t: t, dur: 0.5, gain: 0.12, a: 0.06, d: 0.2, sus: 0.6, r: 0.22, filt: { type: 'bandpass', f: 500, f2: 3200, q: 2.2, ft: 0.45 } });
      tone({ t: t + 0.05, f: nf('c5'), dur: 0.42, gain: 0.09, wave: 'triangle', a: 0.08, d: 0.1, sus: 0.6, r: 0.2 });
      tone({ t: t + 0.12, f: nf('e5'), dur: 0.36, gain: 0.08, wave: 'triangle', a: 0.08, d: 0.1, sus: 0.6, r: 0.18 });
      tone({ t: t + 0.19, f: nf('g5'), dur: 0.3, gain: 0.07, wave: 'triangle', a: 0.08, d: 0.1, sus: 0.6, r: 0.16 });
    },

    poison: function (t) {
      tone({ t: t, f: 420, f2: 150, dur: 0.52, gain: 0.2, wave: 'pulse', duty: 0.125, a: 0.006, d: 0.2, sus: 0.5, r: 0.22, vib: { hz: 13, cents: 70 } });
      tone({ t: t, f: 424, f2: 148, dur: 0.52, gain: 0.13, wave: 'sawtooth', a: 0.006, d: 0.2, sus: 0.45, r: 0.22, detune: -18, filt: { type: 'lowpass', f: 1800, f2: 420 } });
      noise({ t: t + 0.05, dur: 0.4, gain: 0.06, a: 0.02, d: 0.16, sus: 0.3, r: 0.2, filt: { type: 'bandpass', f: 900, f2: 220, q: 2 } });
    },

    /* ---- pain --------------------------------------------------------- */

    death: function (t) {
      // descending noise sweep + a falling tone + a body thud
      noise({ t: t, dur: 0.55, gain: 0.3, a: 0.004, d: 0.16, sus: 0.55, r: 0.3, filt: { type: 'bandpass', f: 3400, f2: 160, q: 1.5, ft: 0.5 } });
      tone({ t: t, f: 480, f2: 55, dur: 0.5, gt: 0.45, gain: 0.24, wave: 'pulse', duty: 0.125, a: 0.003, d: 0.18, sus: 0.5, r: 0.24 });
      tone({ t: t, f: 240, f2: 40, dur: 0.42, gt: 0.4, gain: 0.16, wave: 'triangle', a: 0.003, d: 0.16, sus: 0.45, r: 0.2 });
      tone({ t: t + 0.02, f: 120, f2: 36, dur: 0.3, gain: 0.22, wave: 'sine', a: 0.002, d: 0.1, sus: 0.3, r: 0.16 });
    },

    hurt: function (t) {
      tone({ t: t, f: 460, f2: 210, dur: 0.22, gt: 0.18, gain: 0.22, wave: 'pulse', duty: 0.125, a: 0.002, d: 0.08, sus: 0.45, r: 0.1 });
      tone({ t: t, f: 466, f2: 206, dur: 0.22, gt: 0.18, gain: 0.12, wave: 'square', a: 0.002, d: 0.08, sus: 0.4, r: 0.1, detune: 24 });
      noise({ t: t, dur: 0.09, gain: 0.1, a: 0.001, d: 0.04, sus: 0.15, r: 0.04, filt: { type: 'bandpass', f: 1800, q: 1 } });
    },

    spike: function (t) {
      // metal stab: a hard transient, inharmonic partials, a short ring
      noise({ t: t, dur: 0.045, gain: 0.3, a: 0.0008, d: 0.016, sus: 0.08, r: 0.02, filt: { type: 'highpass', f: 3000 } });
      metal(t, 1180, 0.2, 0.16);
      tone({ t: t + 0.01, f: 2600, f2: 1900, dur: 0.16, gain: 0.07, wave: 'triangle', a: 0.001, d: 0.06, sus: 0.2, r: 0.08 });
      tone({ t: t, f: 170, f2: 90, dur: 0.1, gain: 0.14, wave: 'sine', a: 0.001, d: 0.04, sus: 0.2, r: 0.05 });
    },

    stomp: function (t) {
      tone({ t: t, f: 420, f2: 110, dur: 0.1, gt: 0.07, gain: 0.3, wave: 'pulse', duty: 0.25, a: 0.001, d: 0.04, sus: 0.35, r: 0.05 });
      noise({ t: t, dur: 0.11, gain: 0.24, a: 0.001, d: 0.035, sus: 0.25, r: 0.05, filt: { type: 'lowpass', f: 2600, f2: 500 } });
      tone({ t: t + 0.06, f: 700, f2: 1150, dur: 0.09, gain: 0.1, wave: 'pulse', duty: 0.5, a: 0.002, d: 0.04, sus: 0.3, r: 0.04 });
    },

    bonk: function (t) {
      tone({ t: t, f: 230, f2: 150, dur: 0.09, gt: 0.06, gain: 0.26, wave: 'square', a: 0.001, d: 0.035, sus: 0.25, r: 0.04 });
      noise({ t: t, dur: 0.055, gain: 0.14, a: 0.001, d: 0.02, sus: 0.12, r: 0.025, filt: { type: 'bandpass', f: 620, q: 1.1 } });
    },

    pop: function (t) {
      tone({ t: t, f: 700, f2: 1900, dur: 0.035, gt: 0.025, gain: 0.2, wave: 'sine', a: 0.001, d: 0.012, sus: 0.1, r: 0.015 });
      noise({ t: t, dur: 0.05, gain: 0.2, a: 0.0008, d: 0.018, sus: 0.08, r: 0.02, filt: { type: 'highpass', f: 1600 } });
    },

    /* ---- level furniture ---------------------------------------------- */

    spring: function (t) {
      // boing: fast up-bend then a wobbling settle
      tone({
        t: t, f: 190, dur: 0.34, gain: 0.24, wave: 'triangle',
        bend: [[0.05, 880], [0.12, 560], [0.22, 700], [0.34, 480]],
        a: 0.003, d: 0.1, sus: 0.6, r: 0.14, vib: { hz: 9, cents: 40 }
      });
      tone({
        t: t, f: 380, dur: 0.22, gain: 0.08, wave: 'pulse', duty: 0.25,
        bend: [[0.05, 1760], [0.12, 1120], [0.22, 1400]],
        a: 0.003, d: 0.08, sus: 0.4, r: 0.1
      });
      noise({ t: t, dur: 0.06, gain: 0.08, a: 0.001, d: 0.02, sus: 0.1, r: 0.03, filt: { type: 'highpass', f: 2000 } });
    },

    checkpoint: function (t) {
      arp(t, ['c5', 'e5', 'g5', 'c6'], 0.07, 0.13, { gain: 0.17, duty: 0.5, sus: 0.6 });
      tone({ t: t + 0.21, f: nf('e6'), dur: 0.4, gain: 0.12, wave: 'triangle', a: 0.005, d: 0.18, sus: 0.3, r: 0.2 });
      tone({ t: t + 0.21, f: nf('g6'), dur: 0.36, gain: 0.07, wave: 'triangle', a: 0.008, d: 0.16, sus: 0.28, r: 0.18 });
      noise({ t: t, dur: 0.25, gain: 0.05, a: 0.01, d: 0.1, sus: 0.3, r: 0.12, filt: { type: 'highpass', f: 4000, f2: 9000 } });
    },

    win: function (t) {
      // fanfare: lead + a third below + bass punches
      var lead = [['g4', 0.00, 0.12], ['c5', 0.12, 0.12], ['e5', 0.24, 0.12], ['g5', 0.36, 0.18],
                  ['e5', 0.56, 0.1], ['g5', 0.68, 0.1], ['c6', 0.80, 0.55]];
      var harm = [['e4', 0.00, 0.12], ['g4', 0.12, 0.12], ['c5', 0.24, 0.12], ['e5', 0.36, 0.18],
                  ['c5', 0.56, 0.1], ['e5', 0.68, 0.1], ['g5', 0.80, 0.55]];
      var i;
      for (i = 0; i < lead.length; i++) {
        tone({ t: t + lead[i][1], f: nf(lead[i][0]), dur: lead[i][2], gain: 0.2, wave: 'pulse', duty: 0.5, a: 0.004, d: 0.05, sus: 0.75, r: 0.06 });
      }
      for (i = 0; i < harm.length; i++) {
        tone({ t: t + harm[i][1], f: nf(harm[i][0]), dur: harm[i][2], gain: 0.11, wave: 'pulse', duty: 0.25, a: 0.004, d: 0.05, sus: 0.7, r: 0.06 });
      }
      var bass = [['c3', 0.00], ['c3', 0.24], ['g2', 0.48], ['c3', 0.80]];
      for (i = 0; i < bass.length; i++) {
        tone({ t: t + bass[i][1], f: nf(bass[i][0]), dur: i === 3 ? 0.6 : 0.16, gain: 0.2, wave: 'triangle', a: 0.003, d: 0.07, sus: 0.6, r: 0.1 });
      }
      DRUM.c(t + 0.80, 0.8, sfxBus);
      DRUM.k(t + 0.80, 0.9, sfxBus);
    },

    switch: function (t) {
      tone({ t: t, f: 980, dur: 0.045, gain: 0.18, wave: 'square', a: 0.001, d: 0.02, sus: 0.3, r: 0.02 });
      tone({ t: t + 0.055, f: 620, dur: 0.07, gain: 0.18, wave: 'square', a: 0.001, d: 0.03, sus: 0.3, r: 0.03 });
      click(t, 0.12, 2600, 0.02);
      click(t + 0.055, 0.1, 1800, 0.02);
    },

    door: function (t) {
      noise({ t: t, dur: 0.45, gain: 0.16, a: 0.02, d: 0.18, sus: 0.5, r: 0.22, filt: { type: 'lowpass', f: 700, f2: 220, q: 1.4 } });
      tone({ t: t, f: 90, f2: 60, dur: 0.4, gain: 0.16, wave: 'sine', a: 0.01, d: 0.16, sus: 0.4, r: 0.2 });
      tone({ t: t + 0.22, f: nf('g4'), dur: 0.26, gain: 0.12, wave: 'triangle', a: 0.006, d: 0.1, sus: 0.45, r: 0.12 });
      tone({ t: t + 0.30, f: nf('c5'), dur: 0.34, gain: 0.12, wave: 'triangle', a: 0.006, d: 0.12, sus: 0.4, r: 0.16 });
    },

    portal: function (t) {
      // shimmer: three detuned voices climbing plus a rising noise sweep
      var base = [nf('c5'), nf('g5'), nf('e6')];
      for (var i = 0; i < 3; i++) {
        tone({
          t: t + i * 0.03, f: base[i] * 0.72, f2: base[i] * 1.5, dur: 0.6 - i * 0.08, gt: 0.5,
          gain: 0.11, wave: 'triangle', a: 0.02, d: 0.2, sus: 0.55, r: 0.28,
          vib: { hz: 7 + i * 2, cents: 25 }
        });
      }
      noise({ t: t, dur: 0.55, gain: 0.1, a: 0.04, d: 0.2, sus: 0.55, r: 0.28, filt: { type: 'bandpass', f: 700, f2: 6000, q: 3, ft: 0.5 } });
      tone({ t: t + 0.34, f: nf('c7'), dur: 0.3, gain: 0.05, wave: 'sine', a: 0.01, d: 0.12, sus: 0.3, r: 0.16 });
    },

    launch: function (t) {
      // cannon boom
      tone({ t: t, f: 110, f2: 32, dur: 0.45, gt: 0.3, gain: 0.4, wave: 'sine', a: 0.002, d: 0.14, sus: 0.45, r: 0.24 });
      noise({ t: t, dur: 0.42, gain: 0.32, a: 0.002, d: 0.12, sus: 0.35, r: 0.24, filt: { type: 'lowpass', f: 1800, f2: 110, q: 1.1, ft: 0.35 } });
      noise({ t: t, dur: 0.07, gain: 0.2, a: 0.0008, d: 0.025, sus: 0.1, r: 0.03, filt: { type: 'highpass', f: 2400 } });
      tone({ t: t + 0.01, f: 300, f2: 70, dur: 0.16, gain: 0.14, wave: 'sawtooth', a: 0.002, d: 0.06, sus: 0.25, r: 0.08, filt: { type: 'lowpass', f: 2200, f2: 400 } });
    },

    charge: function (t) {
      tone({ t: t, f: 70, f2: 640, dur: 0.6, gt: 0.55, gain: 0.17, wave: 'sawtooth', a: 0.03, d: 0.1, sus: 0.85, r: 0.09, filt: { type: 'lowpass', f: 320, f2: 3400, q: 3.5, ft: 0.55 } });
      tone({ t: t, f: 140, f2: 1280, dur: 0.6, gt: 0.55, gain: 0.07, wave: 'square', a: 0.05, d: 0.1, sus: 0.8, r: 0.09 });
      noise({ t: t + 0.1, dur: 0.5, gain: 0.05, a: 0.2, d: 0.1, sus: 0.8, r: 0.12, filt: { type: 'bandpass', f: 900, f2: 4200, q: 2.5, ft: 0.4 } });
    },

    laser: function (t) {
      // two close saws beat against each other -> a live, wobbling hum
      tone({ t: t, f: 112, dur: 0.5, gain: 0.13, wave: 'sawtooth', a: 0.015, d: 0.05, sus: 0.9, r: 0.1, filt: { type: 'lowpass', f: 1400, q: 4 } });
      tone({ t: t, f: 118.6, dur: 0.5, gain: 0.11, wave: 'sawtooth', a: 0.015, d: 0.05, sus: 0.9, r: 0.1, filt: { type: 'lowpass', f: 1200, q: 4 } });
      tone({ t: t, f: 1480, dur: 0.48, gain: 0.05, wave: 'square', a: 0.02, d: 0.06, sus: 0.8, r: 0.12, vib: { hz: 5.5, cents: 18 } });
      noise({ t: t, dur: 0.48, gain: 0.04, a: 0.02, d: 0.08, sus: 0.7, r: 0.12, filt: { type: 'bandpass', f: 2600, q: 4 } });
    },

    thwomp: function (t) {
      tone({ t: t, f: 150, f2: 34, dur: 0.5, gt: 0.22, gain: 0.45, wave: 'sine', a: 0.001, d: 0.16, sus: 0.4, r: 0.28 });
      noise({ t: t, dur: 0.4, gain: 0.34, a: 0.001, d: 0.1, sus: 0.3, r: 0.24, filt: { type: 'lowpass', f: 1400, f2: 90, q: 1.3, ft: 0.3 } });
      noise({ t: t, dur: 0.06, gain: 0.22, a: 0.0008, d: 0.02, sus: 0.1, r: 0.025, filt: { type: 'highpass', f: 3200 } });
      metal(t + 0.005, 190, 0.3, 0.1, [1, 1.53, 2.11]);
    },

    crumble: function (t) {
      tone({ t: t, f: 130, f2: 70, dur: 0.18, gain: 0.16, wave: 'sine', a: 0.002, d: 0.07, sus: 0.3, r: 0.08 });
      for (var i = 0; i < 5; i++) {
        var o = i * 0.055 + Math.random() * 0.02;
        noise({
          t: t + o, dur: 0.07, gain: 0.13 - i * 0.015, a: 0.001, d: 0.025, sus: 0.15, r: 0.03,
          filt: { type: 'bandpass', f: 2600 - i * 420 + Math.random() * 300, q: 1.4 }
        });
      }
    },

    fake: function (t) {
      // slide whistle down + a puff: the "gotcha" tell
      tone({ t: t, f: 1250, f2: 300, dur: 0.3, gt: 0.26, gain: 0.16, wave: 'sine', a: 0.006, d: 0.1, sus: 0.6, r: 0.12, vib: { hz: 11, cents: 22 } });
      tone({ t: t, f: 2500, f2: 600, dur: 0.26, gt: 0.24, gain: 0.04, wave: 'triangle', a: 0.006, d: 0.1, sus: 0.4, r: 0.1 });
      noise({ t: t + 0.24, dur: 0.14, gain: 0.1, a: 0.004, d: 0.06, sus: 0.2, r: 0.07, filt: { type: 'lowpass', f: 1200, f2: 300 } });
    },

    troll: function (t) {
      // sad trombone: wah  wah  wah  waaaah
      var steps = [
        { at: 0.00, f0: 320, f1: 285, dur: 0.24 },
        { at: 0.26, f0: 285, f1: 254, dur: 0.24 },
        { at: 0.52, f0: 254, f1: 226, dur: 0.24 },
        { at: 0.78, f0: 226, f1: 170, dur: 0.72 }
      ];
      for (var i = 0; i < steps.length; i++) {
        var s = steps[i], last = (i === steps.length - 1);
        tone({
          t: t + s.at, f: s.f0, f2: s.f1, dur: s.dur, gt: s.dur * 0.85, gain: 0.2,
          wave: 'sawtooth', a: 0.02, d: 0.06, sus: 0.8, r: last ? 0.3 : 0.08,
          filt: { type: 'lowpass', f: 900, f2: last ? 480 : 820, q: 4 },
          vib: last ? { hz: 6.5, cents: 45 } : null
        });
        tone({
          t: t + s.at, f: s.f0 * 2.01, f2: s.f1 * 2.01, dur: s.dur * 0.9, gt: s.dur * 0.8, gain: 0.05,
          wave: 'square', a: 0.02, d: 0.06, sus: 0.7, r: 0.08
        });
      }
    },

    ui: function (t) {
      tone({ t: t, f: 880, dur: 0.05, gain: 0.13, wave: 'pulse', duty: 0.25, a: 0.002, d: 0.02, sus: 0.4, r: 0.02 });
      tone({ t: t + 0.02, f: 1320, dur: 0.05, gain: 0.05, wave: 'pulse', duty: 0.25, a: 0.002, d: 0.02, sus: 0.3, r: 0.02 });
    },

    tick: function (t) {
      tone({ t: t, f: 1800, dur: 0.022, gain: 0.07, wave: 'square', a: 0.001, d: 0.008, sus: 0.15, r: 0.008 });
      click(t, 0.04, 5200, 0.016);
    },

    /* ---- tetris (modelled on the NES set) ------------------------------ */

    tetrisMove: function (t) {
      tone({ t: t, f: 196, dur: 0.028, gain: 0.16, wave: 'square', a: 0.001, d: 0.012, sus: 0.2, r: 0.01 });
      noise({ t: t, dur: 0.02, gain: 0.06, a: 0.001, d: 0.008, sus: 0.1, r: 0.008, filt: { type: 'bandpass', f: 1400, q: 1.2 } });
    },

    tetrisRotate: function (t) {
      tone({ t: t, f: 330, f2: 392, dur: 0.045, gt: 0.03, gain: 0.16, wave: 'square', a: 0.001, d: 0.018, sus: 0.3, r: 0.015 });
      noise({ t: t, dur: 0.022, gain: 0.05, a: 0.001, d: 0.009, sus: 0.1, r: 0.008, filt: { type: 'highpass', f: 2600 } });
    },

    tetrisLock: function (t) {
      tone({ t: t, f: 120, f2: 88, dur: 0.07, gt: 0.05, gain: 0.24, wave: 'square', a: 0.001, d: 0.03, sus: 0.2, r: 0.03 });
      noise({ t: t, dur: 0.05, gain: 0.14, a: 0.001, d: 0.02, sus: 0.12, r: 0.02, filt: { type: 'lowpass', f: 1600, f2: 400 } });
    },

    tetrisClear: function (t) {
      var seq = ['c6', 'e6', 'g6'];
      arp(t, seq, 0.06, 0.1, { gain: 0.15, duty: 0.25, sus: 0.5 });
      noise({ t: t, dur: 0.32, gain: 0.12, a: 0.004, d: 0.12, sus: 0.45, r: 0.16, filt: { type: 'bandpass', f: 900, f2: 7000, q: 2, ft: 0.28 } });
      tone({ t: t + 0.18, f: nf('c7'), dur: 0.22, gain: 0.08, wave: 'triangle', a: 0.003, d: 0.1, sus: 0.25, r: 0.1 });
    },

    tetrisTetris: function (t) {
      var lead = ['c6', 'e6', 'g6', 'c7'];
      var i;
      for (i = 0; i < lead.length; i++) {
        tone({ t: t + i * 0.07, f: nf(lead[i]), dur: i === 3 ? 0.45 : 0.12, gain: 0.19, wave: 'pulse', duty: 0.5, a: 0.003, d: 0.05, sus: 0.7, r: 0.1 });
        tone({ t: t + i * 0.07, f: nf(lead[i]) * 0.5, dur: i === 3 ? 0.45 : 0.12, gain: 0.1, wave: 'pulse', duty: 0.25, a: 0.003, d: 0.05, sus: 0.6, r: 0.1 });
      }
      noise({ t: t, dur: 0.6, gain: 0.16, a: 0.005, d: 0.2, sus: 0.5, r: 0.3, filt: { type: 'bandpass', f: 1200, f2: 8000, q: 1.4, ft: 0.5 } });
      DRUM.c(t + 0.21, 0.9, sfxBus);
      DRUM.k(t, 0.8, sfxBus);
      DRUM.k(t + 0.21, 0.9, sfxBus);
    },

    tetrisLevel: function (t) {
      arp(t, ['g5', 'c6', 'e6'], 0.055, 0.1, { gain: 0.16, duty: 0.5, sus: 0.6 });
      tone({ t: t + 0.165, f: nf('g6'), dur: 0.3, gain: 0.11, wave: 'triangle', a: 0.004, d: 0.13, sus: 0.3, r: 0.14 });
      noise({ t: t + 0.1, dur: 0.25, gain: 0.06, a: 0.01, d: 0.1, sus: 0.3, r: 0.12, filt: { type: 'highpass', f: 5000 } });
    },

    tetrisOver: function (t) {
      var seq = [['c5', 0.00], ['b4', 0.13], ['a4', 0.26], ['g4', 0.39], ['f4', 0.52], ['e4', 0.65], ['d4', 0.78], ['c4', 0.91]];
      for (var i = 0; i < seq.length; i++) {
        var last = (i === seq.length - 1);
        tone({ t: t + seq[i][1], f: nf(seq[i][0]), dur: last ? 0.8 : 0.16, gain: 0.19, wave: 'pulse', duty: 0.25, a: 0.004, d: 0.07, sus: 0.6, r: last ? 0.4 : 0.06 });
        tone({ t: t + seq[i][1], f: nf(seq[i][0]) * 0.5, dur: last ? 0.8 : 0.16, gain: 0.12, wave: 'triangle', a: 0.004, d: 0.07, sus: 0.55, r: last ? 0.4 : 0.06 });
      }
      noise({ t: t + 0.91, dur: 0.7, gain: 0.1, a: 0.01, d: 0.25, sus: 0.4, r: 0.4, filt: { type: 'lowpass', f: 2200, f2: 300 } });
    }
  };

  /* aliases so a level or entity never fires a silent name by accident */
  SFX.spikes = SFX.spike;
  SFX.flag = SFX.checkpoint;
  SFX.goal = SFX.win;
  SFX.select = SFX.ui;
  SFX.click = SFX.ui;

  /* ---- sfx dispatcher, with throttling --------------------------------- */

  var lastAt = {};
  var GAP = { step: 0.06, tick: 0.03, coin: 0.018, cash: 0.02, tetrisMove: 0.018, bonk: 0.05, land: 0.05, laser: 0.12, crumble: 0.06 };
  var recent = [];

  A.sfx = function (name, when) {
    syncPref();
    if (!A.enabled) return false;
    var fn = SFX[name];
    if (!fn) return false;
    var c = ensure();
    if (!c || c.state !== 'running') return false;

    var t = c.currentTime;
    var gap = GAP[name];
    if (gap === undefined) gap = 0.012;
    if (lastAt[name] !== undefined && t - lastAt[name] < gap) return false;
    lastAt[name] = t;

    // global burst limiter: never let a pile-up of deaths/coins blow the mix up
    var i = 0;
    while (i < recent.length) {
      if (t - recent[i] > 0.09) recent.splice(i, 1); else i++;
    }
    if (recent.length > 12) return false;
    recent.push(t);

    try { fn(when == null ? t : Math.max(t, when)); } catch (e) { return false; }
    return true;
  };

  A.sfxNames = function () {
    var out = [];
    for (var k in SFX) if (SFX.hasOwnProperty(k)) out.push(k);
    return out;
  };

  /* ======================================================================
   * 6. Music — pattern language
   *
   *   Tokens are separated by whitespace; `|` is a bar marker and is ignored.
   *     c4        one 16th of C4
   *     e5*4      E5 held for 4 steps (a quarter note)
   *     a3+c4+e4  a chord (one token, all notes share the duration)
   *     -  .  _   a rest ( `-*8` = a half-bar rest )
   *     bb3 / a#3 flats and sharps; `s` also means sharp
   *   Drum voices use the same grammar with k s h H c t r m instead of notes.
   *
   *   One step = a 16th note, so a 4/4 bar is 16 steps.
   *   A voice's pattern loops independently (`step % voice.len`), so drums can
   *   be one bar under a sixteen-bar lead.
   * ==================================================================== */

  var TRACKS = {};

  function parsePattern(text, isDrum) {
    var toks = String(text).replace(/\|/g, ' ').split(/\s+/);
    var step = 0, evs = [], i, j;
    for (i = 0; i < toks.length; i++) {
      var tk = toks[i];
      if (!tk) continue;
      var mult = 1, star = tk.indexOf('*');
      if (star > 0) {
        mult = parseInt(tk.substring(star + 1), 10);
        if (!(mult > 0)) mult = 1;
        tk = tk.substring(0, star);
      }
      if (tk === '-' || tk === '.' || tk === '_') { step += mult; continue; }
      if (isDrum) {
        var hits = tk.split('+'), valid = [];
        for (j = 0; j < hits.length; j++) if (DRUM[hits[j]]) valid.push(hits[j]);
        if (valid.length) evs.push({ step: step, drums: valid, dur: mult });
      } else {
        var parts = tk.split('+'), ns = [];
        for (j = 0; j < parts.length; j++) {
          var m = midiOf(parts[j]);
          if (m != null) ns.push(m);
        }
        if (ns.length) evs.push({ step: step, notes: ns, dur: mult });
      }
      step += mult;
    }
    return { evs: evs, len: step };
  }

  function compileTrack(def) {
    if (def.__c) return def.__c;
    var stepDur = 60 / (def.bpm || 120) / 4;
    var voices = [], len = 0, i, j;
    for (i = 0; i < def.voices.length; i++) {
      var vd = def.voices[i];
      var text = '';
      if (vd.seq) {
        for (j = 0; j < vd.seq.length; j++) text += ' ' + (def.pat[vd.seq[j]] || '');
      } else {
        text = vd.pat || (def.pat ? def.pat[vd.p] : '') || '';
      }
      var p = parsePattern(text, !!vd.drum);
      if (!p.len) continue;
      var at = new Array(p.len);
      for (j = 0; j < p.evs.length; j++) at[p.evs[j].step] = p.evs[j];
      voices.push({
        at: at, len: p.len, drum: !!vd.drum,
        wave: vd.wave || 'pulse', duty: vd.duty == null ? 0.5 : vd.duty,
        gain: vd.gain == null ? 0.16 : vd.gain,
        oct: vd.oct || 0, gate: vd.gate == null ? 0.9 : vd.gate,
        a: vd.a, d: vd.d, sus: vd.sus == null ? 0.65 : vd.sus, r: vd.r,
        filt: vd.filt || null, detune: vd.detune || 0,
        vib: vd.vib || null, maxDur: vd.maxDur || 0
      });
      if (p.len > len) len = p.len;
    }
    def.__c = { stepDur: stepDur, len: len || 1, voices: voices, swing: def.swing || 0 };
    return def.__c;
  }

  function track(name, def) { TRACKS[name] = def; }

  /* ======================================================================
   * 7. Music — the scheduler
   * ==================================================================== */

  var mus = null;      // the live track instance
  var wanted = null;   // what SHOULD be playing (survives mute / lock)
  var timer = null;

  function startTrack(name, opts) {
    var c = ensure();
    if (!c || !A.enabled) return;
    var def = TRACKS[name];
    if (!def) return;
    var comp;
    try { comp = compileTrack(def); } catch (e) { return; }
    if (!comp.voices.length) return;

    var g;
    try {
      g = c.createGain();
      g.gain.value = 0.0001;
      g.connect(musicBus);
    } catch (e2) { return; }

    var t0 = c.currentTime;
    var peak = def.gain == null ? 1 : def.gain;
    var fade = (opts && opts.fade != null) ? opts.fade : (def.fade == null ? 0.3 : def.fade);
    try {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + Math.max(0.01, fade));
    } catch (e3) { sp(g.gain, peak); }

    var rt = [];
    for (var i = 0; i < comp.voices.length; i++) {
      var v = comp.voices[i], lfo = null;
      if (v.vib && v.vib.cents) {
        try {
          var lo = c.createOscillator(), lg = c.createGain();
          lo.type = 'sine';
          sp(lo.frequency, v.vib.hz || 5.5);
          sp(lg.gain, v.vib.cents);
          lo.connect(lg);
          lo.start(t0);
          lfo = { osc: lo, gain: lg };
        } catch (e4) { lfo = null; }
      }
      rt.push({ lfo: lfo });
    }

    mus = {
      name: name, def: def, comp: comp, gain: g, rt: rt,
      step: 0, nextT: t0 + 0.06, lastTick: null, loops: 0, peak: peak
    };
    wanted = name;

    if (!timer) {
      // setInterval, NOT rAF: rAF stalls in background tabs and headless runs.
      timer = setInterval(tick, TICK_MS);
    }
    tick();
  }

  function playVoiceEvent(v, rv, ev, t, m) {
    if (v.drum) {
      for (var i = 0; i < ev.drums.length; i++) {
        var fn = DRUM[ev.drums[i]];
        if (fn) { try { fn(t, v.gain, m.gain); } catch (e) {} }
      }
      return;
    }
    var dur = ev.dur * m.comp.stepDur * v.gate;
    if (v.maxDur && dur > v.maxDur) dur = v.maxDur;
    if (dur < 0.03) dur = 0.03;
    var n = ev.notes.length;
    var g = v.gain * (n > 1 ? (1 / Math.sqrt(n)) * 1.05 : 1);
    for (var j = 0; j < n; j++) {
      tone({
        t: t, f: freqOf(ev.notes[j] + v.oct * 12), dur: dur, gain: g,
        wave: v.wave, duty: v.duty, a: v.a, d: v.d, sus: v.sus, r: v.r,
        filt: v.filt, detune: v.detune, bus: m.gain,
        mod: rv.lfo ? rv.lfo.gain : null
      });
    }
  }

  function scheduleStep(m, step, t) {
    var vs = m.comp.voices;
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      var ev = v.at[step % v.len];
      if (!ev) continue;
      var st = t;
      if (m.comp.swing && (step % 2) === 1) st += m.comp.swing * m.comp.stepDur;
      playVoiceEvent(v, m.rt[i], ev, st, m);
    }
  }

  function tick() {
    if (!mus || !ctx) return;
    if (!A.enabled) return;
    var t = ctx.currentTime;

    if (ctx.state !== 'running') {
      // suspended (pre-gesture, or an iOS interruption): slide the cursor so
      // nothing piles up at a stale timestamp and dumps out on resume.
      mus.nextT = t + 0.06;
      mus.lastTick = t;
      return;
    }

    // Background tabs clamp setInterval to ~1 s. Widen the window to cover the
    // gap we actually observed instead of stuttering.
    var look = LOOKAHEAD;
    if (mus.lastTick != null) {
      var gap = t - mus.lastTick;
      if (gap > look) look = Math.min(1.6, gap + 0.15);
    }
    mus.lastTick = t;

    if (mus.nextT < t - 0.08) mus.nextT = t + 0.02; // resync after a freeze

    var guard = 0;
    while (mus.nextT < t + look && guard++ < 700) {
      scheduleStep(mus, mus.step, mus.nextT);
      mus.nextT += mus.comp.stepDur;
      mus.step++;
      if (mus.step >= mus.comp.len) { mus.step = 0; mus.loops++; }
    }
  }

  function stopMusicInternal(fade) {
    var m = mus;
    mus = null;
    if (timer) { clearInterval(timer); timer = null; }
    if (!m) return;
    var f = (fade == null) ? 0.12 : fade;
    var t = now();
    try {
      m.gain.gain.cancelScheduledValues(t);
      m.gain.gain.setValueAtTime(Math.max(0.0001, m.gain.gain.value), t);
      m.gain.gain.linearRampToValueAtTime(0, t + f);
    } catch (e) { try { m.gain.gain.value = 0; } catch (e2) {} }
    for (var i = 0; i < m.rt.length; i++) {
      var lfo = m.rt[i].lfo;
      if (!lfo) continue;
      try { lfo.osc.stop(t + f + 0.05); } catch (e3) {}
      (function (l) {
        setTimeout(function () {
          try { l.osc.disconnect(); } catch (x) {}
          try { l.gain.disconnect(); } catch (x) {}
        }, (f + 0.2) * 1000);
      })(lfo);
    }
    setTimeout(function () {
      try { m.gain.disconnect(); } catch (x) {}
    }, (f + 0.35) * 1000);
  }

  A.music = function (name, opts) {
    syncPref();
    if (!name) { A.stopMusic(); return false; }
    if (!TRACKS[name]) return false;
    wanted = name;
    if (!A.enabled) return false;
    if (mus && mus.name === name && !(opts && opts.restart)) return true;
    stopMusicInternal(mus ? 0.1 : 0);
    var c = ensure();
    if (!c || c.state !== 'running') return false; // queued: unlock() picks it up
    startTrack(name, opts);
    return !!mus;
  };

  A.stopMusic = function (fade) {
    wanted = null;
    stopMusicInternal(fade);
    return true;
  };

  A.musicNames = function () {
    var out = [];
    for (var k in TRACKS) if (TRACKS.hasOwnProperty(k)) out.push(k);
    return out;
  };

  /* Compiled shape of a track — for the headless harness to validate the note
   * data (bar lengths, voice loop lengths) without a live AudioContext. */
  A.trackInfo = function (name) {
    var def = TRACKS[name];
    if (!def) return null;
    var c;
    try { c = compileTrack(def); } catch (e) { return null; }
    var vs = [];
    for (var i = 0; i < c.voices.length; i++) {
      vs.push({ len: c.voices[i].len, drum: c.voices[i].drum, wave: c.voices[i].wave });
    }
    return { bpm: def.bpm, len: c.len, stepDur: c.stepDur, swing: c.swing, voices: vs, pat: def.pat };
  };

  /* Diagnostics for the headless harness (additive, never load-bearing). */
  A.status = function () {
    return {
      ctx: ctx ? ctx.state : 'none',
      enabled: A.enabled,
      unlocked: A.unlocked,
      broken: broken,
      music: mus ? mus.name : null,
      wanted: wanted,
      step: mus ? mus.step : -1,
      loops: mus ? mus.loops : 0,
      len: mus ? mus.comp.len : 0,
      tracks: A.musicNames().length,
      sfx: A.sfxNames().length
    };
  };

  /* ======================================================================
   * 8. The music
   *
   * Every track is a 16-bar loop with a real hook and a real chord
   * progression. Leads are written out bar by bar over two 4-bar
   * progressions (P1 / P2); harmony and bass run an 8-bar loop that matches
   * P1+P2, and the drums a 1- or 2-bar loop. All lengths divide 256 steps,
   * so nothing ever drifts.
   * ==================================================================== */

  /* ---------------------------------------------------------------- meadow
   * Bright C major. P1 = C G Am F, P2 = F G C C.
   */
  track('meadow', {
    bpm: 152, gain: 0.95,
    pat: {
      L1: 'e5*2 g5*2 c6*4 -*2 g5*2 e5*4 | d5*2 g5*2 b5*4 -*2 d6*2 b5*4 |' +
          'a5*4 g5*2 e5*2 c5*4 a4*4 | f5*2 a5*2 c6*4 a5*2 f5*2 g5*4',
      L2: 'a5*2 a5*2 g5*2 f5*2 e5*4 f5*4 | b5*2 a5*2 g5*2 f5*2 g5*8 |' +
          'e5*2 g5*2 c6*2 e6*2 g6*4 e6*4 | d6*2 c6*2 g5*2 e5*2 c5*8',
      L3: 'a5*2 c6*2 f6*4 e6*2 c6*2 a5*4 | b5*2 d6*2 g6*4 d6*2 b5*2 g5*4 |' +
          'c6*2 e6*2 g6*4 e6*2 c6*2 g5*4 | e5*2 g5*2 c6*8 -*4',
      H1: 'c5*2 e5*2 g5*2 e5*2 c5*2 e5*2 g5*2 e5*2 | b4*2 d5*2 g5*2 d5*2 b4*2 d5*2 g5*2 d5*2 |' +
          'a4*2 c5*2 e5*2 c5*2 a4*2 c5*2 e5*2 c5*2 | f4*2 a4*2 c5*2 a4*2 f4*2 a4*2 c5*2 a4*2',
      H2: 'f4*2 a4*2 c5*2 a4*2 f4*2 a4*2 c5*2 a4*2 | b4*2 d5*2 g5*2 d5*2 b4*2 d5*2 g5*2 d5*2 |' +
          'c5*2 e5*2 g5*2 e5*2 c5*2 e5*2 g5*2 e5*2 | c5*2 e5*2 g5*2 c6*2 g5*2 e5*2 c5*2 g4*2',
      B1: 'c3*2 -*2 c3*2 g3*2 c3*2 -*2 e3*2 g3*2 | g2*2 -*2 g2*2 d3*2 g2*2 -*2 b2*2 d3*2 |' +
          'a2*2 -*2 a2*2 e3*2 a2*2 -*2 c3*2 e3*2 | f2*2 -*2 f2*2 c3*2 f2*2 -*2 a2*2 c3*2',
      B2: 'f2*2 -*2 f2*2 c3*2 f2*2 -*2 a2*2 c3*2 | g2*2 -*2 g2*2 d3*2 g2*2 -*2 b2*2 d3*2 |' +
          'c3*2 -*2 c3*2 g3*2 c3*2 -*2 e3*2 g3*2 | c3*2 -*2 g3*2 -*2 c3*2 e3*2 g3*2 g2*2',
      D1: 'k*4 h*2 h*2 s*4 h*2 h*2 | k*2 k*2 h*4 s*4 h*2 s*2'
    },
    voices: [
      { seq: ['L1', 'L2', 'L1', 'L3'], wave: 'pulse', duty: 0.5, gain: 0.155, gate: 0.82, a: 0.004, d: 0.05, sus: 0.72, r: 0.04 },
      { seq: ['H1', 'H2'], wave: 'pulse', duty: 0.25, gain: 0.062, gate: 0.6, a: 0.003, d: 0.04, sus: 0.5, r: 0.03 },
      { seq: ['B1', 'B2'], wave: 'triangle', gain: 0.21, gate: 0.85, a: 0.004, d: 0.05, sus: 0.6, r: 0.04 },
      { seq: ['D1'], drum: true, gain: 0.5 }
    ]
  });

  /* ---------------------------------------------------------------- sunset
   * Warm F major, slow. P1 = F Am Dm Bb, P2 = Bb C F F.
   */
  track('sunset', {
    bpm: 112, gain: 0.95,
    pat: {
      L1: 'f5*4 a5*4 c6*6 a5*2 | a5*6 g5*2 e5*4 c5*4 |' +
          'd5*4 f5*4 a5*6 f5*2 | bb5*8 a5*4 f5*4',
      L2: 'd6*4 c6*4 bb5*6 f5*2 | c6*4 e6*4 g6*4 e6*4 |' +
          'f6*6 e6*2 c6*4 a5*4 | g5*4 a5*4 f5*8',
      L3: 'f5*2 g5*2 bb5*4 d6*4 c6*4 | e6*4 g6*4 e6*2 c6*2 g5*4 |' +
          'a5*4 c6*4 f6*8 | c6*4 a5*4 f5*8',
      H1: 'f4+a4+c5*8 f4+a4+c5*8 | a4+c5+e5*8 a4+c5+e5*8 |' +
          'd4+f4+a4*8 d4+f4+a4*8 | bb3+d4+f4*8 bb3+d4+f4*8',
      H2: 'bb3+d4+f4*8 bb3+d4+f4*8 | c4+e4+g4*8 c4+e4+g4*8 |' +
          'f4+a4+c5*16 | f4+a4+c5*8 c4+f4+a4*8',
      B1: 'f2*8 c3*8 | a2*8 e3*8 | d2*8 a2*8 | bb2*8 f3*8',
      B2: 'bb2*8 f3*8 | c3*8 g3*8 | f2*8 c3*8 | f2*8 a2*4 c3*4',
      D1: 'k*4 h*4 r*4 h*4 | k*4 h*4 r*4 h*2 H*2'
    },
    voices: [
      { seq: ['L1', 'L2', 'L1', 'L3'], wave: 'pulse', duty: 0.25, gain: 0.14, gate: 0.94, a: 0.02, d: 0.12, sus: 0.7, r: 0.09, vib: { hz: 4.8, cents: 12 } },
      { seq: ['H1', 'H2'], wave: 'triangle', gain: 0.085, gate: 0.96, a: 0.06, d: 0.15, sus: 0.72, r: 0.12 },
      { seq: ['B1', 'B2'], wave: 'triangle', gain: 0.2, gate: 0.9, a: 0.01, d: 0.1, sus: 0.6, r: 0.08 },
      { seq: ['D1'], drum: true, gain: 0.32 }
    ]
  });

  /* ------------------------------------------------------------------ void
   * Sparse A minor pads, no percussion. P1 = Am F Dm E, P2 = Am G F E.
   */
  track('void', {
    bpm: 80, gain: 0.9,
    pat: {
      L1: 'a5*12 -*4 | c6*8 a5*8 | d6*12 -*4 | b5*8 g#5*8',
      L2: 'e6*8 c6*4 a5*4 | d6*12 -*4 | c6*8 -*4 a5*4 | b5*16',
      L3: '-*8 a5*4 c6*4 | b5*8 d6*8 | a5*8 f5*8 | g#5*8 b5*8',
      H1: 'a3+c4+e4*16 | f3+a3+c4*16 | d3+f3+a3*16 | e3+g#3+b3*16',
      H2: 'a3+c4+e4*16 | g3+b3+d4*16 | f3+a3+c4*16 | e3+g#3+b3*16',
      B1: 'a2*16 | f2*16 | d2*16 | e2*16',
      B2: 'a2*16 | g2*16 | f2*16 | e2*16'
    },
    voices: [
      { seq: ['L1', 'L2', 'L1', 'L3'], wave: 'triangle', gain: 0.12, gate: 0.9, a: 0.07, d: 0.3, sus: 0.6, r: 0.3, vib: { hz: 3.6, cents: 16 } },
      { seq: ['H1', 'H2'], wave: 'pulse', duty: 0.125, gain: 0.05, gate: 0.97, a: 0.35, d: 0.4, sus: 0.7, r: 0.5, filt: { type: 'lowpass', f: 1100, q: 1 } },
      { seq: ['B1', 'B2'], wave: 'sine', gain: 0.22, gate: 0.96, a: 0.06, d: 0.3, sus: 0.7, r: 0.35 }
    ]
  });

  /* ----------------------------------------------------------------- ruins
   * Mysterious D minor (harmonic on the A). P1 = Dm Bb C A, P2 = Dm Gm Bb A.
   */
  track('ruins', {
    bpm: 104, gain: 0.95,
    pat: {
      L1: 'd5*4 -*2 f5*2 a5*4 -*2 d5*2 | bb4*4 -*2 d5*2 f5*4 d5*4 |' +
          'c5*4 e5*2 g5*2 e5*4 c5*4 | a4*4 c#5*2 e5*2 a5*6 -*2',
      L2: 'a5*4 f5*2 e5*2 d5*8 | bb5*4 a5*2 g5*2 d5*4 g5*4 |' +
          'f5*4 d5*2 bb4*2 d5*4 f5*4 | e5*4 c#5*4 a4*8',
      L3: 'd6*6 a5*2 f5*4 d5*4 | g5*4 bb5*4 d6*6 bb5*2 |' +
          'f6*4 d6*4 bb5*8 | a5*4 e5*4 c#5*4 a4*4',
      H1: 'd4*2 a4*2 f4*2 a4*2 d4*2 a4*2 f4*2 a4*2 | bb3*2 f4*2 d4*2 f4*2 bb3*2 f4*2 d4*2 f4*2 |' +
          'c4*2 g4*2 e4*2 g4*2 c4*2 g4*2 e4*2 g4*2 | a3*2 e4*2 c#4*2 e4*2 a3*2 e4*2 c#4*2 e4*2',
      H2: 'd4*2 a4*2 f4*2 a4*2 d4*2 a4*2 f4*2 a4*2 | g3*2 d4*2 bb3*2 d4*2 g3*2 d4*2 bb3*2 d4*2 |' +
          'bb3*2 f4*2 d4*2 f4*2 bb3*2 f4*2 d4*2 f4*2 | a3*2 e4*2 c#4*2 e4*2 a3*2 e4*2 c#4*2 e4*2',
      B1: 'd2*4 a2*4 d3*4 a2*4 | bb1*4 f2*4 bb2*4 f2*4 | c2*4 g2*4 c3*4 g2*4 | a1*4 e2*4 a2*4 e2*4',
      B2: 'd2*4 a2*4 d3*4 a2*4 | g1*4 d2*4 g2*4 d2*4 | bb1*4 f2*4 bb2*4 f2*4 | a1*4 e2*4 a2*4 a1*4',
      D1: 'r*4 -*4 r*4 -*2 r*2 | r*4 -*4 r*2 r*2 t*4'
    },
    voices: [
      { seq: ['L1', 'L2', 'L1', 'L3'], wave: 'pulse', duty: 0.25, gain: 0.14, gate: 0.88, a: 0.008, d: 0.08, sus: 0.66, r: 0.06, vib: { hz: 5, cents: 14 } },
      { seq: ['H1', 'H2'], wave: 'triangle', gain: 0.085, gate: 0.7, a: 0.004, d: 0.05, sus: 0.5, r: 0.04 },
      { seq: ['B1', 'B2'], wave: 'triangle', gain: 0.2, gate: 0.8, a: 0.006, d: 0.07, sus: 0.55, r: 0.05 },
      { seq: ['D1'], drum: true, gain: 0.34 }
    ]
  });

  /* --------------------------------------------------------------- volcano
   * Driving E minor. P1 = Em C G D, P2 = Em D C B.
   */
  track('volcano', {
    bpm: 170, gain: 1.0,
    pat: {
      L1: 'e5*2 e5*2 g5*2 e5*2 b5*4 -*4 | c5*2 c5*2 e5*2 g5*2 c6*4 -*4 |' +
          'd5*2 d5*2 g5*2 b5*2 d6*4 -*4 | d5*2 f#5*2 a5*2 f#5*2 d5*8',
      L2: 'b5*4 a5*2 g5*2 e5*4 b4*4 | a5*4 f#5*2 d5*2 a4*4 d5*4 |' +
          'g5*4 e5*2 c5*2 g4*4 c5*4 | f#5*4 d#5*2 b4*2 f#5*4 b5*4',
      L3: 'e6*2 d6*2 b5*2 g5*2 e5*8 | f#6*2 e6*2 d6*2 a5*2 f#5*8 |' +
          'g6*2 e6*2 c6*2 g5*2 e5*8 | f#6*4 d#6*4 b5*4 f#5*4',
      H1: 'e4+b4*2 -*2 e4+b4*2 -*2 e4+b4*4 e4+b4*2 -*2 | c4+g4*2 -*2 c4+g4*2 -*2 c4+g4*4 c4+g4*2 -*2 |' +
          'g3+d4*2 -*2 g3+d4*2 -*2 g3+d4*4 g3+d4*2 -*2 | d4+a4*2 -*2 d4+a4*2 -*2 d4+a4*4 d4+a4*2 -*2',
      H2: 'e4+b4*2 -*2 e4+b4*2 -*2 e4+b4*4 e4+b4*2 -*2 | d4+a4*2 -*2 d4+a4*2 -*2 d4+a4*4 d4+a4*2 -*2 |' +
          'c4+g4*2 -*2 c4+g4*2 -*2 c4+g4*4 c4+g4*2 -*2 | b3+f#4*2 -*2 b3+f#4*2 -*2 b3+f#4*4 b3+f#4*2 -*2',
      B1: 'e2*2 e2*2 e2*2 e3*2 e2*2 e2*2 d3*2 b2*2 | c2*2 c2*2 c2*2 c3*2 c2*2 c2*2 g2*2 e2*2 |' +
          'g1*2 g1*2 g1*2 g2*2 g1*2 g1*2 d2*2 b1*2 | d2*2 d2*2 d2*2 d3*2 d2*2 d2*2 a2*2 f#2*2',
      B2: 'e2*2 e2*2 e2*2 e3*2 e2*2 e2*2 d3*2 b2*2 | d2*2 d2*2 d2*2 d3*2 d2*2 d2*2 a2*2 f#2*2 |' +
          'c2*2 c2*2 c2*2 c3*2 c2*2 c2*2 g2*2 e2*2 | b1*2 b1*2 b1*2 b2*2 b1*2 b1*2 f#2*2 d#2*2',
      D1: 'k*2 h*2 s*2 h*2 k*2 h*2 s*2 h*2',
      D2: 'k*2 h*2 s*2 k*2 k*2 h*2 s*2 h*2'
    },
    voices: [
      { seq: ['L1', 'L2', 'L1', 'L3'], wave: 'pulse', duty: 0.25, gain: 0.15, gate: 0.8, a: 0.003, d: 0.05, sus: 0.7, r: 0.04 },
      { seq: ['H1', 'H2'], wave: 'pulse', duty: 0.125, gain: 0.07, gate: 0.55, a: 0.002, d: 0.04, sus: 0.45, r: 0.03 },
      { seq: ['B1', 'B2'], wave: 'sawtooth', gain: 0.17, gate: 0.7, a: 0.003, d: 0.05, sus: 0.55, r: 0.03, filt: { type: 'lowpass', f: 900, q: 2 } },
      { seq: ['D1', 'D2'], drum: true, gain: 0.55 }
    ]
  });

  /* ---------------------------------------------------------------- mario1
   * Original bouncy overworld-spirit tune in C. P1 = C Am F G, P2 = C F G C.
   */
  track('mario1', {
    bpm: 184, gain: 1.0, swing: 0.14,
    pat: {
      L1: 'g5*2 e5*2 c6*2 -*2 g5*2 a5*2 g5*4 | e5*2 a5*2 c6*2 -*2 a5*2 b5*2 a5*4 |' +
          'f5*2 a5*2 c6*2 -*2 f6*4 -*2 c6*2 | b5*2 d6*2 g6*2 -*2 d6*2 b5*2 g5*4',
      L2: 'c6*2 -*2 c6*2 e6*2 g5*4 e5*4 | a5*2 -*2 a5*2 c6*2 f5*4 a5*4 |' +
          'b5*2 -*2 d6*2 b5*2 g5*4 d5*4 | e5*2 g5*2 c6*4 -*2 g5*2 c6*4',
      L3: 'e6*2 d6*2 c6*2 g5*2 e5*4 c5*4 | f5*2 g5*2 a5*2 c6*2 f6*4 c6*4 |' +
          'g6*2 f6*2 d6*2 b5*2 g5*4 d6*4 | c6*4 -*2 g5*2 e5*4 c5*4',
      H1: '-*2 c5+e5*2 -*2 c5+e5*2 -*2 c5+e5*2 -*2 c5+e5*2 | -*2 a4+c5*2 -*2 a4+c5*2 -*2 a4+c5*2 -*2 a4+c5*2 |' +
          '-*2 a4+c5*2 -*2 a4+c5*2 -*2 a4+c5*2 -*2 a4+c5*2 | -*2 b4+d5*2 -*2 b4+d5*2 -*2 b4+d5*2 -*2 b4+d5*2',
      H2: '-*2 c5+e5*2 -*2 c5+e5*2 -*2 c5+e5*2 -*2 c5+e5*2 | -*2 a4+c5*2 -*2 a4+c5*2 -*2 a4+c5*2 -*2 a4+c5*2 |' +
          '-*2 b4+d5*2 -*2 b4+d5*2 -*2 b4+d5*2 -*2 b4+d5*2 | -*2 c5+e5*2 -*2 c5+e5*2 -*2 c5+g5*2 -*2 e5+g5*2',
      B1: 'c3*2 g2*2 c3*2 e3*2 g3*2 e3*2 c3*2 g2*2 | a2*2 e2*2 a2*2 c3*2 e3*2 c3*2 a2*2 e2*2 |' +
          'f2*2 c3*2 f3*2 c3*2 a2*2 c3*2 f3*2 c3*2 | g2*2 d3*2 g3*2 d3*2 b2*2 d3*2 g3*2 f3*2',
      B2: 'c3*2 g2*2 c3*2 e3*2 g3*2 e3*2 c3*2 g2*2 | f2*2 c3*2 f3*2 c3*2 a2*2 c3*2 f3*2 c3*2 |' +
          'g2*2 d3*2 g3*2 d3*2 b2*2 d3*2 g3*2 d3*2 | c3*2 g2*2 c3*2 e3*2 g3*2 e3*2 c3*4',
      D1: 'k*4 h*2 s*4 h*2 k*2 s*2 | k*2 k*2 h*2 s*4 h*2 k*2 s*2'
    },
    voices: [
      { seq: ['L1', 'L2', 'L1', 'L3'], wave: 'pulse', duty: 0.5, gain: 0.15, gate: 0.72, a: 0.003, d: 0.045, sus: 0.72, r: 0.035 },
      { seq: ['H1', 'H2'], wave: 'pulse', duty: 0.25, gain: 0.062, gate: 0.5, a: 0.002, d: 0.03, sus: 0.4, r: 0.025 },
      { seq: ['B1', 'B2'], wave: 'triangle', gain: 0.21, gate: 0.72, a: 0.003, d: 0.045, sus: 0.55, r: 0.03 },
      { seq: ['D1'], drum: true, gain: 0.45 }
    ]
  });

  /* ---------------------------------------------------------------- mario2
   * Original athletic-spirit gallop in G. P1 = G Em C D, P2 = G C D G.
   */
  track('mario2', {
    bpm: 196, gain: 1.0,
    pat: {
      L1: 'd5*3 g5*1 b5*3 g5*1 d6*3 b5*1 g5*3 d5*1 | b4*3 e5*1 g5*3 e5*1 b5*3 g5*1 e5*3 b4*1 |' +
          'c5*3 e5*1 g5*3 e5*1 c6*3 g5*1 e5*3 c5*1 | d5*3 f#5*1 a5*3 f#5*1 d6*3 a5*1 f#5*3 d5*1',
      L2: 'g5*4 b5*4 d6*6 b5*2 | e6*4 c6*4 g5*6 e5*2 |' +
          'f#5*4 a5*4 d6*6 a5*2 | b5*4 g5*4 d5*8',
      L3: 'g5*3 d5*1 b5*3 g5*1 d6*3 g5*1 b5*3 d6*1 | c6*3 g5*1 e6*3 c6*1 g6*3 e6*1 c6*3 g5*1 |' +
          'a5*3 d6*1 f#6*3 a5*1 d6*3 f#6*1 a5*3 d6*1 | g6*4 d6*4 b5*4 g5*4',
      H1: '-*2 g4+b4*2 -*2 g4+b4*2 -*2 g4+b4*2 -*2 g4+b4*2 | -*2 e4+g4*2 -*2 e4+g4*2 -*2 e4+g4*2 -*2 e4+g4*2 |' +
          '-*2 e4+g4*2 -*2 e4+g4*2 -*2 e4+g4*2 -*2 e4+g4*2 | -*2 f#4+a4*2 -*2 f#4+a4*2 -*2 f#4+a4*2 -*2 f#4+a4*2',
      H2: '-*2 g4+b4*2 -*2 g4+b4*2 -*2 g4+b4*2 -*2 g4+b4*2 | -*2 e4+g4*2 -*2 e4+g4*2 -*2 e4+g4*2 -*2 e4+g4*2 |' +
          '-*2 f#4+a4*2 -*2 f#4+a4*2 -*2 f#4+a4*2 -*2 f#4+a4*2 | -*2 g4+b4*2 -*2 g4+b4*2 -*2 g4+d5*2 -*2 b4+d5*2',
      B1: 'g2*3 g2*1 d3*3 g2*1 g2*3 g2*1 d3*3 b2*1 | e2*3 e2*1 b2*3 e2*1 e2*3 e2*1 b2*3 g2*1 |' +
          'c2*3 c2*1 g2*3 c2*1 c2*3 c2*1 g2*3 e2*1 | d2*3 d2*1 a2*3 d2*1 d2*3 d2*1 a2*3 f#2*1',
      B2: 'g2*3 g2*1 d3*3 g2*1 g2*3 g2*1 d3*3 b2*1 | c2*3 c2*1 g2*3 c2*1 c2*3 c2*1 g2*3 e2*1 |' +
          'd2*3 d2*1 a2*3 d2*1 d2*3 d2*1 a2*3 f#2*1 | g2*3 g2*1 d3*3 g2*1 b2*3 d3*1 g3*3 g2*1',
      D1: 'k*2 h*2 k*2 s*2 h*2 k*2 s*2 h*2',
      D2: 'k*2 h*2 k*2 s*2 h*2 k*2 s*4'
    },
    voices: [
      { seq: ['L1', 'L2', 'L1', 'L3'], wave: 'pulse', duty: 0.5, gain: 0.15, gate: 0.8, a: 0.003, d: 0.04, sus: 0.72, r: 0.03 },
      { seq: ['H1', 'H2'], wave: 'pulse', duty: 0.25, gain: 0.058, gate: 0.55, a: 0.002, d: 0.03, sus: 0.42, r: 0.025 },
      { seq: ['B1', 'B2'], wave: 'triangle', gain: 0.2, gate: 0.75, a: 0.003, d: 0.04, sus: 0.55, r: 0.03 },
      { seq: ['D1', 'D2'], drum: true, gain: 0.48 }
    ]
  });

  /* ---------------------------------------------------------------- mario3
   * Original castle-march in C minor. P1 = Cm Ab Eb G, P2 = Cm Fm Ab G.
   */
  track('mario3', {
    bpm: 132, gain: 1.0,
    pat: {
      L1: 'c5*4 eb5*2 g5*2 c6*4 g5*4 | ab4*4 c5*2 eb5*2 ab5*4 eb5*4 |' +
          'eb5*4 g5*2 bb5*2 eb6*4 bb5*4 | g5*4 b5*2 d6*2 g5*8',
      L2: 'g5*2 g5*2 ab5*2 g5*2 f5*4 eb5*4 | f5*2 f5*2 g5*2 ab5*2 c6*4 ab5*4 |' +
          'eb6*4 c6*2 ab5*2 eb5*4 c5*4 | d6*4 b5*2 g5*2 d5*8',
      L3: 'c6*2 b5*2 c6*2 eb6*2 g6*4 eb6*4 | f6*4 c6*4 ab5*4 f5*4 |' +
          'ab5*2 bb5*2 c6*2 eb6*2 ab6*8 | g6*4 d6*4 b5*4 g5*4',
      H1: 'c4+eb4+g4*4 -*4 c4+eb4+g4*4 -*4 | ab3+c4+eb4*4 -*4 ab3+c4+eb4*4 -*4 |' +
          'eb4+g4+bb4*4 -*4 eb4+g4+bb4*4 -*4 | g3+b3+d4*4 -*4 g3+b3+d4*4 -*4',
      H2: 'c4+eb4+g4*4 -*4 c4+eb4+g4*4 -*4 | f3+ab3+c4*4 -*4 f3+ab3+c4*4 -*4 |' +
          'ab3+c4+eb4*4 -*4 ab3+c4+eb4*4 -*4 | g3+b3+d4*4 -*4 g3+b3+d4*4 -*4',
      B1: 'c2*4 c2*4 g2*4 c3*4 | ab1*4 ab1*4 eb2*4 ab2*4 |' +
          'eb2*4 eb2*4 bb2*4 eb3*4 | g1*4 g1*4 d2*4 g2*4',
      B2: 'c2*4 c2*4 g2*4 c3*4 | f1*4 f1*4 c2*4 f2*4 |' +
          'ab1*4 ab1*4 eb2*4 ab2*4 | g1*4 d2*4 g2*4 g1*4',
      D1: 'k*2 s*1 s*1 s*2 k*2 s*2 k*2 s*2 s*1 s*1'
    },
    voices: [
      { seq: ['L1', 'L2', 'L1', 'L3'], wave: 'pulse', duty: 0.25, gain: 0.15, gate: 0.85, a: 0.004, d: 0.06, sus: 0.7, r: 0.05 },
      { seq: ['H1', 'H2'], wave: 'pulse', duty: 0.5, gain: 0.06, gate: 0.6, a: 0.003, d: 0.05, sus: 0.45, r: 0.04 },
      { seq: ['B1', 'B2'], wave: 'triangle', gain: 0.22, gate: 0.8, a: 0.004, d: 0.06, sus: 0.6, r: 0.04 },
      { seq: ['D1'], drum: true, gain: 0.42 }
    ]
  });

  /* --------------------------------------------------------------- factory
   * Industrial A minor riff. P1 = Am F Am G, P2 = Am F G E.
   */
  track('factory', {
    bpm: 140, gain: 1.0,
    pat: {
      L1: 'a4*2 a4*1 a4*1 c5*2 a4*2 e5*2 a4*2 d5*2 a4*2 | f4*2 f4*1 f4*1 a4*2 f4*2 c5*2 f4*2 bb4*2 f4*2 |' +
          'a4*2 a4*1 a4*1 c5*2 a4*2 e5*2 g5*2 e5*2 c5*2 | g4*2 g4*1 g4*1 b4*2 g4*2 d5*2 g4*2 f5*2 d5*2',
      L2: 'e5*4 c5*4 a4*4 e5*4 | f5*4 c5*4 a4*4 f5*4 |' +
          'g5*4 d5*4 b4*4 g5*4 | e5*4 b4*4 g#4*4 e5*4',
      L3: 'a5*2 -*2 a5*2 g5*2 e5*4 c5*4 | c6*2 -*2 c6*2 a5*2 f5*4 c5*4 |' +
          'd6*2 -*2 d6*2 b5*2 g5*4 d5*4 | e6*4 b5*4 g#5*4 e5*4',
      H1: 'a3+e4*4 -*2 a3+e4*2 a3+e4*4 -*4 | f3+c4*4 -*2 f3+c4*2 f3+c4*4 -*4 |' +
          'a3+e4*4 -*2 a3+e4*2 a3+e4*4 -*4 | g3+d4*4 -*2 g3+d4*2 g3+d4*4 -*4',
      H2: 'a3+e4*4 -*2 a3+e4*2 a3+e4*4 -*4 | f3+c4*4 -*2 f3+c4*2 f3+c4*4 -*4 |' +
          'g3+d4*4 -*2 g3+d4*2 g3+d4*4 -*4 | e3+b3*4 -*2 e3+b3*2 e3+b3*4 -*4',
      B1: 'a1*2 a1*2 a1*2 a2*2 a1*2 a1*2 e2*2 g2*2 | f1*2 f1*2 f1*2 f2*2 f1*2 f1*2 c2*2 e2*2 |' +
          'a1*2 a1*2 a1*2 a2*2 a1*2 a1*2 e2*2 g2*2 | g1*2 g1*2 g1*2 g2*2 g1*2 g1*2 d2*2 f2*2',
      B2: 'a1*2 a1*2 a1*2 a2*2 a1*2 a1*2 e2*2 g2*2 | f1*2 f1*2 f1*2 f2*2 f1*2 f1*2 c2*2 e2*2 |' +
          'g1*2 g1*2 g1*2 g2*2 g1*2 g1*2 d2*2 f2*2 | e1*2 e1*2 e1*2 e2*2 e1*2 e1*2 b1*2 g#1*2',
      D1: 'k*2 m*2 s*2 m*2 k*2 m*2 s*2 m*2',
      D2: 'k*2 m*2 s*2 k*2 m*2 m*2 s*2 h*2'
    },
    voices: [
      { seq: ['L1', 'L2', 'L1', 'L3'], wave: 'pulse', duty: 0.125, gain: 0.13, gate: 0.7, a: 0.002, d: 0.04, sus: 0.6, r: 0.03, filt: { type: 'lowpass', f: 2800, q: 1.5 } },
      { seq: ['H1', 'H2'], wave: 'sawtooth', gain: 0.055, gate: 0.6, a: 0.004, d: 0.05, sus: 0.5, r: 0.04, filt: { type: 'lowpass', f: 1500, q: 3 } },
      { seq: ['B1', 'B2'], wave: 'sawtooth', gain: 0.18, gate: 0.62, a: 0.002, d: 0.04, sus: 0.5, r: 0.025, filt: { type: 'lowpass', f: 700, q: 2.5 } },
      { seq: ['D1', 'D2'], drum: true, gain: 0.5 }
    ]
  });

  /* ---------------------------------------------------------------- tycoon
   * Jaunty G major ragtime. P1 = G D Em C, P2 = G C D G.
   */
  track('tycoon', {
    bpm: 160, gain: 0.95, swing: 0.18,
    pat: {
      L1: 'd5*2 g5*2 b5*2 g5*2 d6*4 b5*4 | a5*2 f#5*2 a5*2 d6*2 a5*4 f#5*4 |' +
          'e5*2 g5*2 b5*2 g5*2 e6*4 b5*4 | c5*2 e5*2 g5*2 e5*2 c6*4 g5*4',
      L2: 'b5*2 -*2 b5*2 c6*2 d6*4 b5*4 | c6*2 -*2 c6*2 b5*2 g5*4 e5*4 |' +
          'a5*2 -*2 a5*2 b5*2 c#6*4 d6*4 | d6*2 b5*2 g5*4 -*2 d5*2 g5*4',
      L3: 'g5*2 a5*2 b5*2 d6*2 g6*4 d6*4 | e6*2 c6*2 g5*2 e5*2 c6*8 |' +
          'f#5*2 a5*2 d6*2 f#6*2 d6*4 a5*4 | g5*2 b5*2 d6*4 g6*4 g5*4',
      H1: '-*4 g4+b4+d5*4 -*4 g4+b4+d5*4 | -*4 f#4+a4+d5*4 -*4 f#4+a4+d5*4 |' +
          '-*4 g4+b4+e5*4 -*4 g4+b4+e5*4 | -*4 g4+c5+e5*4 -*4 g4+c5+e5*4',
      H2: '-*4 g4+b4+d5*4 -*4 g4+b4+d5*4 | -*4 g4+c5+e5*4 -*4 g4+c5+e5*4 |' +
          '-*4 f#4+a4+d5*4 -*4 f#4+a4+d5*4 | -*4 g4+b4+d5*4 -*4 g4+b4+d5*4',
      B1: 'g2*4 d3*4 g2*4 b2*4 | d2*4 a2*4 d2*4 f#2*4 |' +
          'e2*4 b2*4 e2*4 g2*4 | c2*4 g2*4 c2*4 e2*4',
      B2: 'g2*4 d3*4 g2*4 b2*4 | c2*4 g2*4 c2*4 e2*4 |' +
          'd2*4 a2*4 d2*4 f#2*4 | g2*4 d3*4 b2*4 g2*4',
      D1: 'k*4 h*2 s*2 k*4 s*2 h*2 | k*4 h*2 s*2 k*2 k*2 s*4'
    },
    voices: [
      { seq: ['L1', 'L2', 'L1', 'L3'], wave: 'pulse', duty: 0.5, gain: 0.145, gate: 0.74, a: 0.003, d: 0.045, sus: 0.7, r: 0.035 },
      { seq: ['H1', 'H2'], wave: 'pulse', duty: 0.25, gain: 0.06, gate: 0.45, a: 0.002, d: 0.035, sus: 0.4, r: 0.03 },
      { seq: ['B1', 'B2'], wave: 'triangle', gain: 0.21, gate: 0.6, a: 0.003, d: 0.05, sus: 0.5, r: 0.03 },
      { seq: ['D1'], drum: true, gain: 0.45 }
    ]
  });

  /* ----------------------------------------------------------------- troll
   * Circus galop in C, all chromatic slides and oom-pah. P1 = C G7 C G7,
   * P2 = C F G7 C.
   */
  track('troll', {
    bpm: 180, gain: 0.95,
    pat: {
      L1: 'c5*2 e5*2 g5*2 e5*2 c5*2 e5*2 g5*4 | b4*2 d5*2 f5*2 d5*2 b4*2 d5*2 g5*4 |' +
          'e5*1 f5*1 e5*1 d5*1 c5*4 e5*2 g5*2 c6*4 | a5*1 g#5*1 g5*1 f#5*1 f5*4 d5*2 b4*2 g4*4',
      L2: 'g5*2 g5*1 g5*1 g5*2 e5*2 c6*4 g5*4 | a5*2 a5*1 a5*1 a5*2 f5*2 c6*4 a5*4 |' +
          'b5*2 a5*2 g5*2 f5*2 e5*2 d5*2 c5*4 | c5*2 e5*2 g5*2 c6*2 g5*2 e5*2 c5*4',
      L3: 'c6*2 b5*1 c6*1 b5*1 c6*1 e6*2 c6*2 g5*6 | f6*2 e6*1 f6*1 e6*1 f6*1 c6*2 a5*2 f5*6 |' +
          'g5*1 g#5*1 a5*1 a#5*1 b5*4 d6*4 b5*4 | c6*4 g5*2 e5*2 c5*8',
      H1: '-*4 c5+e5+g5*4 -*4 c5+e5+g5*4 | -*4 b4+d5+f5*4 -*4 b4+d5+f5*4 |' +
          '-*4 c5+e5+g5*4 -*4 c5+e5+g5*4 | -*4 b4+d5+f5*4 -*4 b4+d5+f5*4',
      H2: '-*4 c5+e5+g5*4 -*4 c5+e5+g5*4 | -*4 c5+f5+a5*4 -*4 c5+f5+a5*4 |' +
          '-*4 b4+d5+f5*4 -*4 b4+d5+f5*4 | -*4 c5+e5+g5*4 -*4 c5+e5+g5*4',
      B1: 'c2*4 -*4 g2*4 -*4 | g1*4 -*4 d2*4 -*4 | c2*4 -*4 g2*4 -*4 | g1*4 -*4 d2*4 -*4',
      B2: 'c2*4 -*4 g2*4 -*4 | f1*4 -*4 c2*4 -*4 | g1*4 -*4 d2*4 -*4 | c2*4 -*4 g2*4 c2*4',
      D1: 'k*4 s*2 h*2 k*4 s*2 h*2 | k*4 s*2 h*2 k*2 k*2 c*4'
    },
    voices: [
      { seq: ['L1', 'L2', 'L1', 'L3'], wave: 'pulse', duty: 0.25, gain: 0.15, gate: 0.72, a: 0.003, d: 0.04, sus: 0.72, r: 0.03, vib: { hz: 6.5, cents: 10 } },
      { seq: ['H1', 'H2'], wave: 'pulse', duty: 0.5, gain: 0.055, gate: 0.42, a: 0.002, d: 0.03, sus: 0.4, r: 0.025 },
      { seq: ['B1', 'B2'], wave: 'triangle', gain: 0.23, gate: 0.6, a: 0.004, d: 0.05, sus: 0.5, r: 0.03 },
      { seq: ['D1'], drum: true, gain: 0.48 }
    ]
  });

  /* ------------------------------------------------------------ apocalypse
   * Epic D minor. P1 = Dm Bb F C, P2 = Dm Bb Gm A.
   */
  track('apocalypse', {
    bpm: 92, gain: 1.0,
    pat: {
      L1: 'd5*8 a5*8 | bb5*8 f5*8 | a5*8 c6*8 | g5*8 e5*8',
      L2: 'd6*6 c6*2 a5*4 f5*4 | bb5*6 a5*2 f5*4 d5*4 |' +
          'g5*4 bb5*4 d6*6 bb5*2 | a5*4 c#6*4 e6*8',
      L3: 'a5*4 d6*4 f6*8 | g6*4 f6*4 d6*8 |' +
          'bb5*4 d6*4 g6*8 | a5*4 e6*4 c#6*4 a5*4',
      H1: 'd4+f4+a4*16 | bb3+d4+f4*16 | a3+c4+f4*16 | c4+e4+g4*16',
      H2: 'd4+f4+a4*16 | bb3+d4+f4*16 | g3+bb3+d4*16 | a3+c#4+e4*16',
      B1: 'd2*2 d2*2 d2*2 d2*2 a2*2 a2*2 d3*2 d2*2 | bb1*2 bb1*2 bb1*2 bb1*2 f2*2 f2*2 bb2*2 bb1*2 |' +
          'f1*2 f1*2 f1*2 f1*2 c2*2 c2*2 f2*2 f1*2 | c2*2 c2*2 c2*2 c2*2 g2*2 g2*2 c3*2 c2*2',
      B2: 'd2*2 d2*2 d2*2 d2*2 a2*2 a2*2 d3*2 d2*2 | bb1*2 bb1*2 bb1*2 bb1*2 f2*2 f2*2 bb2*2 bb1*2 |' +
          'g1*2 g1*2 g1*2 g1*2 d2*2 d2*2 g2*2 g1*2 | a1*2 a1*2 a1*2 a1*2 e2*2 e2*2 a2*2 a1*2',
      D1: 'k*4 t*2 t*2 k*4 s*4 | k*2 k*2 t*2 t*2 k*4 s*4'
    },
    voices: [
      { seq: ['L1', 'L2', 'L1', 'L3'], wave: 'pulse', duty: 0.5, gain: 0.15, gate: 0.94, a: 0.01, d: 0.12, sus: 0.72, r: 0.09, vib: { hz: 4.5, cents: 15 } },
      { seq: ['H1', 'H2'], wave: 'triangle', gain: 0.08, gate: 0.97, a: 0.12, d: 0.3, sus: 0.72, r: 0.25 },
      { seq: ['B1', 'B2'], wave: 'sawtooth', gain: 0.17, gate: 0.78, a: 0.004, d: 0.06, sus: 0.55, r: 0.04, filt: { type: 'lowpass', f: 800, q: 2 } },
      { seq: ['D1'], drum: true, gain: 0.55 }
    ]
  });

  /* ------------------------------------------------------------------ menu
   * The RAGE TRIALS theme: E minor, rising 4th motif. P1 = Em C G D,
   * P2 = C G Am B.
   */
  track('menu', {
    bpm: 124, gain: 0.95,
    pat: {
      L1: 'e5*4 b5*4 g5*6 e5*2 | c5*4 g5*4 e5*6 c5*2 |' +
          'd5*4 b5*4 g5*8 | a5*4 f#5*4 d5*8',
      L2: 'e6*4 c6*2 b5*2 c6*4 g5*4 | d6*4 b5*2 a5*2 b5*4 g5*4 |' +
          'c6*4 a5*2 g5*2 a5*4 e5*4 | b5*4 f#5*2 d#5*2 b4*8',
      L3: 'g5*2 c6*2 e6*4 g6*4 e6*4 | d6*2 g6*2 d6*4 b5*4 g5*4 |' +
          'a5*2 c6*2 e6*4 c6*4 a5*4 | b5*4 d#6*4 f#6*4 b5*4',
      H1: 'e4+g4+b4*8 e4+g4+b4*8 | c4+e4+g4*8 c4+e4+g4*8 |' +
          'g3+b3+d4*8 g3+b3+d4*8 | d4+f#4+a4*8 d4+f#4+a4*8',
      H2: 'c4+e4+g4*8 c4+e4+g4*8 | g3+b3+d4*8 g3+b3+d4*8 |' +
          'a3+c4+e4*8 a3+c4+e4*8 | b3+d#4+f#4*8 b3+d#4+f#4*8',
      B1: 'e2*4 e2*2 b2*2 e3*4 b2*4 | c2*4 c2*2 g2*2 c3*4 g2*4 |' +
          'g1*4 g1*2 d2*2 g2*4 d2*4 | d2*4 d2*2 a2*2 d3*4 a2*4',
      B2: 'c2*4 c2*2 g2*2 c3*4 g2*4 | g1*4 g1*2 d2*2 g2*4 d2*4 |' +
          'a1*4 a1*2 e2*2 a2*4 e2*4 | b1*4 b1*2 f#2*2 b2*4 f#2*4',
      D1: 'c*4 h*2 s*2 k*4 s*2 h*2 | k*4 h*2 s*2 k*2 k*2 s*4'
    },
    voices: [
      { seq: ['L1', 'L2', 'L1', 'L3'], wave: 'pulse', duty: 0.5, gain: 0.15, gate: 0.9, a: 0.005, d: 0.08, sus: 0.72, r: 0.06, vib: { hz: 5, cents: 12 } },
      { seq: ['H1', 'H2'], wave: 'triangle', gain: 0.075, gate: 0.95, a: 0.05, d: 0.2, sus: 0.7, r: 0.15 },
      { seq: ['B1', 'B2'], wave: 'triangle', gain: 0.2, gate: 0.8, a: 0.004, d: 0.06, sus: 0.58, r: 0.04 },
      { seq: ['D1'], drum: true, gain: 0.42 }
    ]
  });

  /* ---------------------------------------------------------- korobeiniki
   * The Russian folk melody "Korobeiniki" (public domain, 19th century), the
   * tune NES Tetris uses for Type A. Transcribed in E minor, 4/4, 16 bars:
   * eight bars of the A strain, eight of the B strain.
   *   A: Em Am B7 Em Dm Am B7 Em
   *   B: Am G F E Am G Am E   (the classic descending accompaniment)
   */
  track('korobeiniki', {
    bpm: 150, gain: 1.0,
    pat: {
      A1: 'e5*4 b4*2 c5*2 d5*4 c5*2 b4*2 | a4*4 a4*2 c5*2 e5*4 d5*2 c5*2 |' +
          'b4*6 c5*2 d5*4 e5*4 | c5*4 a4*4 a4*8',
      A2: 'd5*6 f5*2 a5*4 g5*2 f5*2 | e5*6 c5*2 e5*4 d5*2 c5*2 |' +
          'b4*4 b4*2 c5*2 d5*4 e5*4 | c5*4 a4*4 a4*8',
      B1: 'e5*8 c5*8 | d5*8 b4*8 | c5*8 a4*8 | g#4*8 b4*8',
      B2: 'e5*8 c5*8 | d5*8 b4*8 | c5*4 e5*4 a5*8 | g#5*8 -*8',
      H1: 'e4+g4*4 -*4 e4+g4*4 -*4 | a3+c4*4 -*4 a3+c4*4 -*4 |' +
          'b3+d#4*4 -*4 b3+d#4*4 -*4 | e4+g4*4 -*4 e4+g4*4 -*4',
      H2: 'd4+f4*4 -*4 d4+f4*4 -*4 | a3+c4*4 -*4 a3+c4*4 -*4 |' +
          'b3+d#4*4 -*4 b3+d#4*4 -*4 | e4+g4*4 -*4 e4+g4*4 -*4',
      H3: 'a3+c4*4 -*4 a3+c4*4 -*4 | g3+b3*4 -*4 g3+b3*4 -*4 |' +
          'f3+a3*4 -*4 f3+a3*4 -*4 | e3+g#3*4 -*4 e3+g#3*4 -*4',
      H4: 'a3+c4*4 -*4 a3+c4*4 -*4 | g3+b3*4 -*4 g3+b3*4 -*4 |' +
          'a3+c4*4 -*4 a3+c4*4 -*4 | e3+g#3*4 -*4 e3+g#3*4 -*4',
      C1: 'e2*2 e3*2 e2*2 e3*2 e2*2 e3*2 e2*2 e3*2 | a2*2 a3*2 a2*2 a3*2 a2*2 a3*2 a2*2 a3*2 |' +
          'b2*2 b3*2 b2*2 b3*2 b2*2 b3*2 b2*2 b3*2 | e2*2 e3*2 e2*2 e3*2 e2*2 e3*2 e2*2 e3*2',
      C2: 'd2*2 d3*2 d2*2 d3*2 d2*2 d3*2 d2*2 d3*2 | a2*2 a3*2 a2*2 a3*2 a2*2 a3*2 a2*2 a3*2 |' +
          'b2*2 b3*2 b2*2 b3*2 b2*2 b3*2 b2*2 b3*2 | e2*2 e3*2 e2*2 e3*2 e2*2 e3*2 e2*2 e3*2',
      C3: 'a2*2 a3*2 a2*2 a3*2 a2*2 a3*2 a2*2 a3*2 | g2*2 g3*2 g2*2 g3*2 g2*2 g3*2 g2*2 g3*2 |' +
          'f2*2 f3*2 f2*2 f3*2 f2*2 f3*2 f2*2 f3*2 | e2*2 e3*2 e2*2 e3*2 e2*2 e3*2 e2*2 e3*2',
      C4: 'a2*2 a3*2 a2*2 a3*2 a2*2 a3*2 a2*2 a3*2 | g2*2 g3*2 g2*2 g3*2 g2*2 g3*2 g2*2 g3*2 |' +
          'a2*2 a3*2 a2*2 a3*2 a2*2 a3*2 a2*2 a3*2 | e2*2 e3*2 e2*2 e3*2 e2*2 e3*2 e2*2 e3*2',
      D1: 'k*4 h*4 s*4 h*4'
    },
    voices: [
      { seq: ['A1', 'A2', 'B1', 'B2'], wave: 'pulse', duty: 0.5, gain: 0.16, gate: 0.88, a: 0.003, d: 0.06, sus: 0.75, r: 0.04 },
      { seq: ['H1', 'H2', 'H3', 'H4'], wave: 'pulse', duty: 0.25, gain: 0.06, gate: 0.5, a: 0.002, d: 0.04, sus: 0.45, r: 0.03 },
      { seq: ['C1', 'C2', 'C3', 'C4'], wave: 'triangle', gain: 0.2, gate: 0.72, a: 0.003, d: 0.05, sus: 0.55, r: 0.03 },
      { seq: ['D1'], drum: true, gain: 0.34 }
    ]
  });

  /* ======================================================================
   * 9. Install
   * ==================================================================== */

  RT.Audio = A;

  // If the engine is already up (hot reload, or a later re-run of this file),
  // pick the preference up straight away.
  syncPref();

})();
