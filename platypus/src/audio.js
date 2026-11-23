// PLATYPUS — audio.js
// Fully synthesised WebAudio sound set. No assets, no DOM, no listeners.
// The AudioContext is created lazily in resume() (must be called from a user gesture).
//
// Signal path:  voice -> [panner] -> bus -> compressor -> limiter -> soft clip -> mute gain -> out
//                                 \-> reverb send -> generated-impulse convolver -> bus

export function createAudio() {
  let ctx = null;
  let bus = null;        // everything dry lands here
  let verbIn = null;     // reverb send input
  let muteGain = null;
  let musicBusNode = null;
  let whiteBuf = null;
  let pinkBuf = null;
  let muted = false;
  let resuming = false;
  let lastStepT = -1;
  let lastBlipT = -1;

  // ambience state
  let wantAmbience = false;
  let amb = null;        // { gain, nodes[], timer, nextT, degree }

  // extension state (levels 2-5)
  let duck = null;       // everything on `bus` passes through here (heartDrop pulls it to silence)
  let storyBus = null;   // bypasses the duck: heartbeat + sad theme
  let storyVerb = null;
  let wBus = null;       // world bus: goes through the underwater low-pass
  let wLP = null;
  let wVerb = null;
  let wVerbLP = null;

  // ------------------------------------------------------------------ utils

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  function makeNoiseBuffers() {
    const len = Math.floor(ctx.sampleRate * 2.5);
    whiteBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    pinkBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = whiteBuf.getChannelData(0);
    const p = pinkBuf.getChannelData(0);
    // Paul Kellet's pink filter
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const x = Math.random() * 2 - 1;
      w[i] = x;
      b0 = 0.99886 * b0 + x * 0.0555179;
      b1 = 0.99332 * b1 + x * 0.0750759;
      b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856;
      b4 = 0.55 * b4 + x * 0.5329522;
      b5 = -0.7616 * b5 - x * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
      b6 = x * 0.115926;
    }
    // crossfade the loop seam so looping never ticks
    const xf = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < xf; i++) {
      const k = i / xf;
      const j = len - xf + i;
      w[j] = w[j] * (1 - k) + w[i] * k;
      p[j] = p[j] * (1 - k) + p[i] * k;
    }
  }

  function makeImpulse(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        // one-pole lowpass that closes over time: a soft, dark, pillowy room
        const a = 0.55 - 0.45 * k;
        lp += a * ((Math.random() * 2 - 1) - lp);
        const fadeIn = Math.min(1, i / (ctx.sampleRate * 0.004));
        d[i] = lp * Math.pow(1 - k, decay) * fadeIn;
      }
    }
    return buf;
  }

  function makeSoftClipCurve() {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 1.4) / Math.tanh(1.4);
    }
    return curve;
  }

  function build() {
    makeNoiseBuffers();

    bus = ctx.createGain();
    bus.gain.value = 0.9;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 14;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.006;
    comp.release.value = 0.22;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 2;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.09;

    const clip = ctx.createWaveShaper();
    clip.curve = makeSoftClipCurve();
    clip.oversample = "2x";

    muteGain = ctx.createGain();
    muteGain.gain.value = muted ? 0 : 0.85;

    duck = ctx.createGain();
    bus.connect(duck);
    duck.connect(comp);
    storyBus = ctx.createGain();
    storyBus.connect(comp);
    comp.connect(limiter);
    limiter.connect(clip);
    clip.connect(muteGain);
    muteGain.connect(ctx.destination);

    // reverb
    verbIn = ctx.createGain();
    verbIn.gain.value = 1;
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(1.9, 2.6);
    const verbHP = ctx.createBiquadFilter();
    verbHP.type = "highpass";
    verbHP.frequency.value = 220;
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.55;
    verbIn.connect(verbHP);
    verbHP.connect(conv);
    conv.connect(verbOut);
    verbOut.connect(bus);
    buildExt();
  }

  /** true when it is safe to schedule sounds */
  function ready() {
    if (!ctx || ctx.state === "closed") return false;
    return ctx.state === "running" || resuming;
  }

  // ----------------------------------------------------------- node helpers

  /** Output gain for one sound, optionally panned, optionally sent to reverb. */
  function out(pan, send, level) {
    const g = ctx.createGain();
    g.gain.value = level === undefined ? 1 : level;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      p.connect(bus);
    } else {
      g.connect(bus);
    }
    if (send) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s);
      s.connect(verbIn);
    }
    return g;
  }

  /** Disconnect the sound's output once it is certainly silent. */
  function release(node, tEnd) {
    const k = ctx.createOscillator(); // silent timer voice, never connected
    k.onended = () => {
      try { node.disconnect(); } catch (e) { /* already gone */ }
    };
    k.start(tEnd);
    k.stop(tEnd + 0.01);
  }

  function osc(type, freq, t0, t1) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.start(t0);
    o.stop(t1);
    return o;
  }

  function noise(buf, t0, t1, rate) {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate || 1;
    s.start(t0, Math.random() * (buf.duration - 0.2));
    s.stop(t1);
    return s;
  }

  function filt(type, freq, q) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q !== undefined) f.Q.value = q;
    return f;
  }

  /** Click-free attack / exponential-decay envelope. tc = decay time constant. Returns silent time. */
  function env(param, t, attack, peak, tc) {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.setTargetAtTime(0, t + attack, tc);
    return t + attack + tc * 7 + 0.02;
  }

  /** Swell: rise to peak over `rise`, hold until `tOff`, then decay. */
  function swell(param, t, rise, peak, tOff, tc) {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + rise);
    param.setTargetAtTime(0, Math.max(tOff, t + rise), tc);
    return Math.max(tOff, t + rise) + tc * 7 + 0.02;
  }

  /** Pitched-down sine thump. */
  function thump(dest, t, f0, f1, sweep, attack, peak, tc, type) {
    const g = ctx.createGain();
    const tEnd = env(g.gain, t, attack, peak, tc);
    const o = osc(type || "sine", f0, t, tEnd);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + sweep);
    o.connect(g);
    g.connect(dest);
    return tEnd;
  }

  /**
   * Filtered noise burst with an optional filter sweep.
   * o: { buf, type, f0, f1, sweep, q, attack, peak, tc, rate, hp }
   */
  function burst(dest, t, o) {
    const g = ctx.createGain();
    const tEnd = env(g.gain, t, o.attack, o.peak, o.tc);
    const src = noise(o.buf || pinkBuf, t, tEnd, o.rate);
    const f = filt(o.type || "lowpass", o.f0, o.q === undefined ? 0.7 : o.q);
    if (o.f1) {
      f.frequency.setValueAtTime(o.f0, t);
      f.frequency.exponentialRampToValueAtTime(o.f1, t + (o.sweep || 0.1));
    }
    src.connect(f);
    if (o.hp) {
      const h = filt("highpass", o.hp, 0.5);
      f.connect(h);
      h.connect(g);
    } else {
      f.connect(g);
    }
    g.connect(dest);
    return tEnd;
  }

  /** Smooth random "grainy" gain curve that starts and ends at zero (fabric rustle). */
  function rustleCurve(peak, bumps) {
    const n = 64;
    const c = new Float32Array(n);
    let max = 0.0001;
    for (let b = 0; b < bumps; b++) {
      const centre = rnd(0.12, 0.85);
      const width = rnd(0.04, 0.13);
      const h = rnd(0.4, 1);
      for (let i = 0; i < n; i++) {
        const d = (i / (n - 1) - centre) / width;
        c[i] += h * Math.exp(-d * d);
      }
    }
    for (let i = 0; i < n; i++) {
      c[i] *= Math.sin((Math.PI * i) / (n - 1));
      if (c[i] > max) max = c[i];
    }
    for (let i = 0; i < n; i++) c[i] = (c[i] / max) * peak;
    c[0] = 0;
    c[n - 1] = 0;
    return c;
  }

  /** Spiky random curve (electric crackle). `rise` true = gets denser/louder toward the end. */
  function crackleCurve(peak, density, rise) {
    const n = 256;
    const c = new Float32Array(n);
    let v = 0;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const shape = rise ? k * k : Math.pow(1 - k, 1.4);
      if (Math.random() < density) v = rnd(0.45, 1);
      c[i] = v * shape * peak;
      v *= 0.55; // each spark dies over a few samples of the curve (no hard edges)
    }
    c[0] = 0;
    c[n - 1] = 0;
    return c;
  }

  function fabricRustle(dest, t, dur, freq, q, peak, bumps) {
    const src = noise(whiteBuf, t, t + dur + 0.02, rnd(0.85, 1.15));
    const bp = filt("bandpass", freq, q);
    const hp = filt("highpass", Math.min(1500, freq * 0.5), 0.5);
    const lp = filt("lowpass", 7500, 0.5);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueCurveAtTime(rustleCurve(peak, bumps), t, dur);
    src.connect(bp);
    bp.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    g.connect(dest);
    return t + dur + 0.03;
  }

  function crackle(dest, t, dur, hpFreq, peak, density, rise) {
    const src = noise(whiteBuf, t, t + dur + 0.02, rnd(0.9, 1.3));
    const hp = filt("highpass", hpFreq, 0.7);
    const lp = filt("lowpass", 9000, 0.5);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueCurveAtTime(crackleCurve(peak, density, rise), t, dur);
    src.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    g.connect(dest);
    return t + dur + 0.03;
  }

  /** Tiny stick-slip spring/fibre creak. */
  function creak(dest, t, f, dur, peak) {
    const g = ctx.createGain();
    const tEnd = swell(g.gain, t, dur * 0.4, peak, t + dur * 0.55, dur * 0.18);
    const o = osc("triangle", f, t, tEnd);
    o.frequency.linearRampToValueAtTime(f * rnd(0.86, 1.16), t + dur);
    const fm = osc("sine", rnd(26, 48), t, tEnd);
    const fmG = ctx.createGain();
    fmG.gain.value = f * 0.045;
    fm.connect(fmG);
    fmG.connect(o.frequency);
    const bp = filt("bandpass", f * 1.6, 2.5);
    o.connect(bp);
    bp.connect(g);
    g.connect(dest);
    return tEnd;
  }

  /** Soft glassy bell: fundamental + two inharmonic partials. */
  function bell(dest, t, freq, peak, tc) {
    let tEnd = t;
    const parts = [1, 2.76, 5.4];
    const amps = [1, 0.28, 0.08];
    const tcs = [1, 0.45, 0.22];
    for (let i = 0; i < 3; i++) {
      const f = freq * parts[i];
      if (f > 12000) continue;
      const g = ctx.createGain();
      const e = env(g.gain, t, 0.006, peak * amps[i], tc * tcs[i]);
      const o = osc("sine", f, t, e);
      o.connect(g);
      g.connect(dest);
      if (e > tEnd) tEnd = e;
    }
    return tEnd;
  }

  /** Warm brass-ish note for the fanfare. */
  function brass(dest, t, freq, dur, peak) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.028);
    g.gain.setTargetAtTime(peak * 0.72, t + 0.028, 0.09);
    g.gain.setTargetAtTime(0, t + dur, 0.07);
    const tEnd = t + dur + 0.55;
    const lp = filt("lowpass", 700, 0.9);
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.linearRampToValueAtTime(Math.min(3200, freq * 5), t + 0.05);
    lp.frequency.setTargetAtTime(Math.min(1900, freq * 3), t + 0.05, 0.15);
    const a = osc("sawtooth", freq, t, tEnd);
    const b = osc("sawtooth", freq, t, tEnd);
    a.detune.value = -6;
    b.detune.value = 7;
    const sub = osc("triangle", freq, t, tEnd);
    const mix = ctx.createGain();
    mix.gain.value = 0.4;
    a.connect(mix);
    b.connect(mix);
    sub.connect(lp);
    mix.connect(lp);
    lp.connect(g);
    g.connect(dest);
    return tEnd;
  }

  // ------------------------------------------------------------- public API

  function resume() {
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC({ latencyHint: "interactive" });
      } catch (e) {
        try { ctx = new AC(); } catch (e2) { ctx = null; return; }
      }
      build();
    }
    if (ctx.state !== "running" && ctx.state !== "closed" && !resuming) {
      resuming = true;
      const done = () => { resuming = false; };
      try {
        const p = ctx.resume();
        if (p && p.then) p.then(done, done); else done();
      } catch (e) {
        done();
      }
    }
    if (wantAmbience && !amb) beginAmbience();
    restoreLoops();
  }

  function setListenerMuted(m) {
    muted = !!m;
    if (!ctx || !muteGain) return;
    const t = ctx.currentTime;
    muteGain.gain.cancelScheduledValues(t);
    muteGain.gain.setTargetAtTime(muted ? 0 : 0.85, t, 0.03);
  }

  // ---- THE cushion footstep ------------------------------------------------

  function cushionStep(strength = 0.6, pan = 0) {
    if (!ready()) return;
    const now = ctx.currentTime;
    if (now - lastStepT < 0.028) return; // two feet planting in the same instant: one is enough
    lastStepT = now;
    const t = now + 0.004;
    const s = clamp(strength, 0.05, 1.3);
    const v = 0.34 + 0.66 * Math.min(s, 1);
    const dest = out(clamp(pan, -1, 1) * 0.6 + rnd(-0.06, 0.06), 0.035);
    let tEnd = t;
    const keep = (e) => { if (e > tEnd) tEnd = e; };

    // 1. padded sub thump: a sine that sinks in pitch as the foot sinks into the filling
    const f0 = rnd(90, 120) * (1.1 - 0.16 * s);
    const lpT = filt("lowpass", 260, 0.5);
    lpT.connect(dest);
    keep(thump(lpT, t, f0, rnd(40, 50), rnd(0.08, 0.12), rnd(0.007, 0.011), 0.6 * v, rnd(0.05, 0.075)));
    // body an octave up so the thump still reads on small laptop / phone speakers
    keep(thump(dest, t, f0 * rnd(1.96, 2.08), f0 * 0.95, rnd(0.06, 0.09), rnd(0.008, 0.012), 0.2 * v, rnd(0.03, 0.045)));

    // 2. "pff": the filling compressing; the filter closes as the air escapes
    keep(burst(dest, t, {
      buf: pinkBuf, type: "lowpass", q: 0.4, hp: 130, rate: rnd(0.8, 1.2),
      f0: rnd(1500, 2400) * (0.7 + 0.5 * s), f1: rnd(270, 420), sweep: rnd(0.1, 0.16),
      attack: rnd(0.012, 0.022), peak: 0.62 * v, tc: rnd(0.045, 0.07),
    }));

    // 3. slow airy exhale as the cushion re-inflates under the foot
    keep(burst(dest, t + rnd(0.04, 0.07), {
      buf: pinkBuf, type: "bandpass", q: 0.7, rate: rnd(0.9, 1.3),
      f0: rnd(480, 780), f1: rnd(300, 420), sweep: 0.22,
      attack: rnd(0.06, 0.09), peak: 0.16 * v, tc: rnd(0.07, 0.11),
    }));

    // 4. fabric rustle: a couple of soft band-passed grains
    keep(fabricRustle(dest, t + rnd(0, 0.014), rnd(0.09, 0.16), rnd(2600, 4600), rnd(0.9, 1.6),
      rnd(0.035, 0.06) * v, 2 + ((Math.random() * 3) | 0)));

    // 5. tiny spring / fibre creak, not on every step
    if (Math.random() < 0.55) {
      keep(creak(dest, t + rnd(0.02, 0.05), rnd(300, 520), rnd(0.07, 0.13), rnd(0.012, 0.026) * v));
    }

    release(dest, tEnd + 0.1);
  }

  function cushionLand(impact = 0.7) {
    if (!ready()) return;
    const t = ctx.currentTime + 0.004;
    lastStepT = t; // swallow the footsteps that plant in the same instant
    const v = 0.5 + 0.5 * clamp(impact, 0, 1);
    const dest = out(rnd(-0.05, 0.05), 0.07);
    let tEnd = t;
    const keep = (e) => { if (e > tEnd) tEnd = e; };

    const f0 = rnd(72, 86);
    const lpT = filt("lowpass", 240, 0.5);
    lpT.connect(dest);
    keep(thump(lpT, t, f0, rnd(31, 37), rnd(0.15, 0.2), 0.011, 0.8 * v, rnd(0.1, 0.13)));
    keep(thump(dest, t, f0 * 2.03, f0 * 0.9, 0.1, 0.012, 0.26 * v, 0.055));

    // "whu-" : big rush of air out of the filling
    keep(burst(dest, t, {
      buf: pinkBuf, type: "lowpass", q: 0.4, hp: 110, rate: rnd(0.75, 1),
      f0: rnd(1900, 2700), f1: rnd(190, 260), sweep: rnd(0.22, 0.3),
      attack: rnd(0.016, 0.024), peak: 0.85 * v, tc: rnd(0.09, 0.12),
    }));
    // "-mpf" : long soft re-inflate
    keep(burst(dest, t + 0.09, {
      buf: pinkBuf, type: "bandpass", q: 0.6, rate: rnd(0.9, 1.2),
      f0: rnd(560, 760), f1: rnd(260, 340), sweep: 0.4,
      attack: 0.12, peak: 0.24 * v, tc: rnd(0.14, 0.19),
    }));

    keep(fabricRustle(dest, t + 0.005, rnd(0.16, 0.22), rnd(2400, 3600), 1.1, 0.075 * v, 4));
    keep(fabricRustle(dest, t + rnd(0.12, 0.18), rnd(0.14, 0.2), rnd(3200, 4800), 1.4, 0.04 * v, 3));
    keep(creak(dest, t + rnd(0.03, 0.06), rnd(240, 360), rnd(0.12, 0.17), 0.03 * v));
    if (Math.random() < 0.7) keep(creak(dest, t + rnd(0.16, 0.24), rnd(380, 560), rnd(0.08, 0.12), 0.018 * v));

    release(dest, tEnd + 0.1);
  }

  // ---- player ---------------------------------------------------------------

  function jump() {
    if (!ready()) return;
    const t = ctx.currentTime + 0.004;
    const dest = out(0, 0.05);
    let tEnd = t;
    const keep = (e) => { if (e > tEnd) tEnd = e; };
    // push-off into the cushion
    keep(thump(dest, t, rnd(105, 125), 58, 0.07, 0.008, 0.32, 0.04));
    keep(burst(dest, t, {
      buf: pinkBuf, type: "lowpass", q: 0.4, hp: 140, f0: 1400, f1: 400, sweep: 0.08,
      attack: 0.012, peak: 0.3, tc: 0.04,
    }));
    // springy upward chirp
    const f = rnd(180, 215);
    keep(thump(dest, t + 0.02, f, f * rnd(2.1, 2.5), 0.13, 0.014, 0.15, 0.06));
    // air whoosh
    keep(burst(dest, t + 0.02, {
      buf: pinkBuf, type: "bandpass", q: 1.1, f0: rnd(450, 560), f1: rnd(1700, 2200), sweep: 0.16,
      attack: 0.04, peak: 0.22, tc: 0.065,
    }));
    release(dest, tEnd + 0.1);
  }

  function sting() {
    if (!ready()) return;
    const t = ctx.currentTime + 0.004;
    const dest = out(0, 0.04);
    let tEnd = t;
    const keep = (e) => { if (e > tEnd) tEnd = e; };
    // fast leg swish
    keep(burst(dest, t, {
      buf: whiteBuf, type: "bandpass", q: 2.4, f0: rnd(1200, 1600), f1: rnd(4600, 5600), sweep: 0.09,
      attack: 0.014, peak: 0.26, tc: 0.035, rate: rnd(0.9, 1.1),
    }));
    keep(burst(dest, t, {
      buf: pinkBuf, type: "bandpass", q: 1, f0: 500, f1: 1300, sweep: 0.09,
      attack: 0.02, peak: 0.25, tc: 0.04,
    }));
    // the spur's little "zing"
    const lp = filt("lowpass", 5000, 0.5);
    lp.connect(dest);
    keep(thump(lp, t + 0.03, rnd(2500, 2900), rnd(1000, 1250), 0.12, 0.008, 0.045, 0.04));
    release(dest, tEnd + 0.1);
  }

  function stingHit() {
    if (!ready()) return;
    const t = ctx.currentTime + 0.004;
    const dest = out(0, 0.06);
    let tEnd = t;
    const keep = (e) => { if (e > tEnd) tEnd = e; };
    keep(thump(dest, t, rnd(200, 230), 78, 0.06, 0.005, 0.42, 0.045));
    keep(burst(dest, t, {
      buf: pinkBuf, type: "lowpass", q: 0.6, f0: 2600, f1: 600, sweep: 0.05,
      attack: 0.004, peak: 0.5, tc: 0.022,
    }));
    // venom: three quick rising wet bloops
    const base = rnd(480, 640);
    for (let i = 0; i < 3; i++) {
      const tb = t + 0.035 + i * rnd(0.04, 0.055);
      const f = base * (1 + i * 0.28) * rnd(0.94, 1.06);
      keep(thump(dest, tb, f, f * 1.6, 0.045, 0.006, 0.085 - i * 0.015, 0.022));
    }
    // faint fizz
    keep(crackle(dest, t + 0.03, 0.22, 3500, 0.05, 0.16, false));
    release(dest, tEnd + 0.1);
  }

  function playerHurt() {
    if (!ready()) return;
    const t = ctx.currentTime + 0.004;
    const dest = out(0, 0.06);
    let tEnd = t;
    const keep = (e) => { if (e > tEnd) tEnd = e; };
    keep(thump(dest, t, 170, 68, 0.07, 0.005, 0.4, 0.05));
    keep(burst(dest, t, {
      buf: pinkBuf, type: "lowpass", q: 0.5, f0: 1600, f1: 400, sweep: 0.06,
      attack: 0.005, peak: 0.4, tc: 0.03,
    }));
    // small animal squeak, falling, with a wobble
    const g = ctx.createGain();
    const e = env(g.gain, t + 0.015, 0.01, 0.15, 0.075);
    const f = rnd(720, 820);
    const o = osc("triangle", f, t + 0.015, e);
    o.frequency.exponentialRampToValueAtTime(f * 0.42, t + 0.24);
    const vib = osc("sine", rnd(19, 25), t + 0.015, e);
    const vibG = ctx.createGain();
    vibG.gain.value = 34;
    vib.connect(vibG);
    vibG.connect(o.frequency);
    const lp = filt("lowpass", 2600, 0.7);
    o.connect(lp);
    lp.connect(g);
    g.connect(dest);
    keep(e);
    release(dest, tEnd + 0.1);
  }

  // ---- electro pulse --------------------------------------------------------

  function zapCharge(duration = 0.45) {
    if (!ready()) return;
    const t = ctx.currentTime + 0.004;
    const dur = clamp(duration, 0.15, 2);
    const dest = out(0, 0.1);
    const tOff = t + dur;
    const tEnd = tOff + 0.3;

    // rising buzzing hum
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, tOff);
    g.gain.setTargetAtTime(0, tOff, 0.03);
    const o = osc("sawtooth", 68, t, tEnd);
    o.frequency.exponentialRampToValueAtTime(520, tOff);
    const lp = filt("lowpass", 450, 4);
    lp.frequency.setValueAtTime(450, t);
    lp.frequency.exponentialRampToValueAtTime(3000, tOff);
    const trem = ctx.createGain();
    trem.gain.value = 0.55;
    const lfo = osc("sine", 24, t, tEnd);
    lfo.frequency.linearRampToValueAtTime(64, tOff);
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.45;
    lfo.connect(lfoG);
    lfoG.connect(trem.gain);
    o.connect(lp);
    lp.connect(trem);
    trem.connect(g);
    g.connect(dest);

    // thin rising whine
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(0.035, tOff);
    g2.gain.setTargetAtTime(0, tOff, 0.025);
    const w = osc("sine", 700, t, tEnd);
    w.frequency.exponentialRampToValueAtTime(2100, tOff);
    w.connect(g2);
    g2.connect(dest);

    // gathering static
    crackle(dest, t, dur, 2800, 0.1, 0.2, true);
    release(dest, tEnd + 0.1);
  }

  function zapFire() {
    if (!ready()) return;
    const t = ctx.currentTime + 0.004;
    const dest = out(0, 0.18);
    let tEnd = t;
    const keep = (e) => { if (e > tEnd) tEnd = e; };
    // discharge: bright noise tearing downward
    keep(burst(dest, t, {
      buf: whiteBuf, type: "bandpass", q: 1.5, f0: rnd(3600, 4400), f1: rnd(420, 560), sweep: 0.26,
      attack: 0.005, peak: 0.36, tc: 0.09,
    }));
    // "pew" body
    const lpP = filt("lowpass", 4200, 0.5);
    lpP.connect(dest);
    keep(thump(lpP, t, rnd(1700, 2000), 190, 0.2, 0.005, 0.11, 0.065));
    // gritty low buzz
    const lpB = filt("lowpass", 1300, 0.7);
    lpB.connect(dest);
    keep(thump(lpB, t, 230, 52, 0.22, 0.006, 0.1, 0.085, "square"));
    // underwater bloop as the pulse enters the water
    keep(thump(dest, t + 0.03, rnd(290, 340), 130, 0.18, 0.012, 0.2, 0.09));
    keep(burst(dest, t + 0.02, {
      buf: pinkBuf, type: "lowpass", q: 2, f0: 900, f1: 260, sweep: 0.3,
      attack: 0.03, peak: 0.3, tc: 0.12,
    }));
    keep(crackle(dest, t + 0.02, 0.34, 2400, 0.12, 0.22, false));
    release(dest, tEnd + 0.1);
  }

  function zapHit() {
    if (!ready()) return;
    const t = ctx.currentTime + 0.004;
    const dest = out(0, 0.14);
    let tEnd = t;
    const keep = (e) => { if (e > tEnd) tEnd = e; };
    keep(thump(dest, t, 160, 60, 0.07, 0.005, 0.36, 0.05));
    keep(crackle(dest, t, 0.42, 1800, 0.22, 0.3, false));
    // electrocution buzz: mains-ish saw, amplitude chopped
    const g = ctx.createGain();
    const e = swell(g.gain, t, 0.012, 0.1, t + 0.2, 0.06);
    const o = osc("sawtooth", rnd(52, 58), t, e);
    const o2 = osc("sawtooth", rnd(104, 116), t, e);
    const bp = filt("bandpass", rnd(800, 1100), 0.9);
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const lfo = osc("sine", rnd(42, 56), t, e);
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.5;
    lfo.connect(lfoG);
    lfoG.connect(trem.gain);
    o.connect(bp);
    o2.connect(bp);
    bp.connect(trem);
    trem.connect(g);
    g.connect(dest);
    keep(e);
    // bright spark ping
    keep(bell(dest, t + 0.01, rnd(1900, 2400), 0.05, 0.05));
    release(dest, tEnd + 0.1);
  }

  // ---- targets --------------------------------------------------------------

  function dummyHit() {
    if (!ready()) return;
    const t = ctx.currentTime + 0.004;
    const dest = out(rnd(-0.1, 0.1), 0.07);
    let tEnd = t;
    const keep = (e) => { if (e > tEnd) tEnd = e; };
    // stuffed-sack thud
    keep(thump(dest, t, rnd(145, 165), 64, 0.07, 0.005, 0.46, 0.05));
    // burlap slap
    keep(burst(dest, t, {
      buf: pinkBuf, type: "bandpass", q: 0.8, f0: rnd(800, 1050), f1: 500, sweep: 0.06,
      attack: 0.004, peak: 0.6, tc: 0.03,
    }));
    // wooden post knock
    const fw = rnd(370, 460);
    keep(thump(dest, t + 0.004, fw, fw * 0.97, 0.05, 0.004, 0.13, 0.026));
    keep(thump(dest, t + 0.004, fw * 1.52, fw * 1.5, 0.05, 0.004, 0.06, 0.016));
    // straw rustle
    keep(fabricRustle(dest, t + 0.02, rnd(0.14, 0.2), rnd(3200, 4400), 1.3, 0.06, 4));
    // spring post wobble creak
    keep(creak(dest, t + 0.06, rnd(210, 300), 0.16, 0.022));
    release(dest, tEnd + 0.1);
  }

  function humanHit() {
    if (!ready()) return;
    const t = ctx.currentTime + 0.004;
    const dest = out(rnd(-0.1, 0.1), 0.08);
    let tEnd = t;
    const keep = (e) => { if (e > tEnd) tEnd = e; };
    keep(thump(dest, t, rnd(125, 140), 52, 0.08, 0.005, 0.5, 0.06));
    keep(burst(dest, t, {
      buf: pinkBuf, type: "lowpass", q: 0.6, f0: 1500, f1: 420, sweep: 0.05,
      attack: 0.004, peak: 0.6, tc: 0.035,
    }));
    // comic "oof": a short falling vowel through two formants
    const t1 = t + 0.035;
    const g = ctx.createGain();
    const e = env(g.gain, t1, 0.022, 0.5, 0.06);
    const f = rnd(150, 180);
    const o = osc("sawtooth", f, t1, e);
    o.frequency.exponentialRampToValueAtTime(f * 0.62, t1 + 0.2);
    const f1 = filt("bandpass", rnd(520, 640), 4);
    const f2 = filt("bandpass", rnd(900, 1100), 5);
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    o.connect(f1);
    o.connect(f2);
    f1.connect(g);
    f2.connect(g2);
    g2.connect(g);
    g.connect(dest);
    keep(e);
    release(dest, tEnd + 0.1);
  }

  function humanSwing() {
    if (!ready()) return;
    const t = ctx.currentTime + 0.004;
    const dest = out(rnd(-0.15, 0.15), 0.05);
    const tEnd = t + 0.8;
    // big net whoosh: up then down
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.14);
    g.gain.setTargetAtTime(0, t + 0.16, 0.07);
    const src = noise(pinkBuf, t, tEnd, 1.3);
    const bp = filt("bandpass", 320, 1.8);
    bp.frequency.setValueAtTime(rnd(280, 360), t);
    bp.frequency.exponentialRampToValueAtTime(rnd(1300, 1700), t + 0.15);
    bp.frequency.exponentialRampToValueAtTime(420, t + 0.36);
    src.connect(bp);
    bp.connect(g);
    g.connect(dest);
    // thin mesh hiss on top
    burst(dest, t + 0.05, {
      buf: whiteBuf, type: "bandpass", q: 1.2, f0: 2600, f1: 5200, sweep: 0.12,
      attack: 0.06, peak: 0.06, tc: 0.05,
    });
    release(dest, tEnd + 0.1);
  }

  // ---- wizard ---------------------------------------------------------------

  const VOWELS = [
    [680, 1150], // a
    [460, 820],  // o
    [360, 700],  // u
    [520, 1650], // e
    [420, 1050], // schwa-ish
    [600, 950],  // aw
  ];

  function wizardBlip(pitch = 1) {
    if (!ready()) return;
    const now = ctx.currentTime;
    if (now - lastBlipT < 0.03) return;
    lastBlipT = now;
    const t = now + 0.004;
    const dest = out(rnd(-0.08, 0.08), 0.12);
    const dur = rnd(0.07, 0.115);
    const f = 108 * clamp(pitch, 0.4, 2.5) * rnd(0.93, 1.09);
    const v = pick(VOWELS);

    const g = ctx.createGain();
    const tEnd = swell(g.gain, t, rnd(0.014, 0.022), 1, t + dur * 0.6, dur * 0.22);
    // glottal source: saw + a little triangle warmth, gentle inflection and elderly wobble
    const o = osc("sawtooth", f, t, tEnd);
    const tri = osc("triangle", f, t, tEnd);
    const bend = rnd(0.9, 1.12);
    o.frequency.linearRampToValueAtTime(f * bend, t + dur);
    tri.frequency.linearRampToValueAtTime(f * bend, t + dur);
    const vib = osc("sine", rnd(5.5, 7.5), t, tEnd);
    const vibG = ctx.createGain();
    vibG.gain.value = f * 0.02;
    vib.connect(vibG);
    vibG.connect(o.frequency);
    vibG.connect(tri.frequency);

    const pre = filt("lowpass", 2800, 0.5);
    o.connect(pre);
    const fa = filt("bandpass", v[0] * rnd(0.94, 1.06), 5);
    const fb = filt("bandpass", v[1] * rnd(0.94, 1.06), 7);
    const ga = ctx.createGain();
    ga.gain.value = 0.62;
    const gb = ctx.createGain();
    gb.gain.value = 0.34;
    const gt = ctx.createGain();
    gt.gain.value = 0.085;
    pre.connect(fa);
    pre.connect(fb);
    fa.connect(ga);
    fb.connect(gb);
    tri.connect(gt);
    ga.connect(g);
    gb.connect(g);
    gt.connect(g);
    g.connect(dest);

    // breath on the consonant edge
    burst(dest, t, {
      buf: pinkBuf, type: "bandpass", q: 1, f0: rnd(1400, 2600),
      attack: 0.008, peak: 0.035, tc: 0.016,
    });
    release(dest, tEnd + 0.1);
  }

  function wizardAppear() {
    if (!ready()) return;
    const t = ctx.currentTime + 0.004;
    const dest = out(0, 0.35);
    let tEnd = t;
    const keep = (e) => { if (e > tEnd) tEnd = e; };
    // soft poof
    keep(thump(dest, t, 170, 70, 0.14, 0.012, 0.3, 0.08));
    keep(burst(dest, t, {
      buf: pinkBuf, type: "bandpass", q: 0.9, f0: 420, f1: 3800, sweep: 0.5,
      attack: 0.09, peak: 0.34, tc: 0.14,
    }));
    // sparkle arpeggio (D major pentatonic, rising)
    const notes = [587.33, 739.99, 880, 1174.66, 1479.98, 1760, 2349.32];
    for (let i = 0; i < notes.length; i++) {
      keep(bell(dest, t + 0.08 + i * 0.062 + rnd(-0.006, 0.006), notes[i], 0.075 - i * 0.004, 0.22));
    }
    keep(crackle(dest, t + 0.1, 0.6, 5000, 0.03, 0.12, false));
    release(dest, tEnd + 0.1);
  }

  // ---- UI / intro -----------------------------------------------------------

  function uiClick() {
    if (!ready()) return;
    const t = ctx.currentTime + 0.003;
    const dest = out(0, 0.08);
    let tEnd = thump(dest, t, 740, 520, 0.05, 0.004, 0.2, 0.026);
    const e = bell(dest, t, 1480, 0.045, 0.05);
    if (e > tEnd) tEnd = e;
    release(dest, tEnd + 0.1);
  }

  function introBoom() {
    if (!ready()) return;
    const t = ctx.currentTime + 0.005;
    const dest = out(0, 0.4);
    let tEnd = t;
    const keep = (e) => { if (e > tEnd) tEnd = e; };
    // deep falling sub
    keep(thump(dest, t, 72, 27, 1.1, 0.012, 0.8, 0.5));
    // audible body for small speakers
    keep(thump(dest, t, 150, 44, 0.3, 0.008, 0.36, 0.14));
    keep(thump(dest, t, 300, 90, 0.12, 0.006, 0.12, 0.05));
    // impact air, closing down
    keep(burst(dest, t, {
      buf: pinkBuf, type: "lowpass", q: 0.5, f0: 2200, f1: 90, sweep: 0.9,
      attack: 0.01, peak: 0.8, tc: 0.26,
    }));
    // long dark rumble tail
    keep(burst(dest, t + 0.05, {
      buf: pinkBuf, type: "lowpass", q: 0.7, f0: 160, rate: 0.5,
      attack: 0.2, peak: 0.5, tc: 0.6,
    }));
    release(dest, tEnd + 0.1);
  }

  function introRise(duration = 2.6) {
    if (!ready()) return;
    const t = ctx.currentTime + 0.005;
    const dur = clamp(duration, 0.6, 8);
    const dest = out(0, 0.45);
    const tPeak = t + dur * 0.86;
    const tEnd = t + dur + 2.2;

    // air rising into brightness
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, tPeak);
    g.gain.setTargetAtTime(0, tPeak, 0.28);
    const src = noise(pinkBuf, t, tEnd, 1);
    const bp = filt("bandpass", 240, 1.1);
    bp.frequency.setValueAtTime(240, t);
    bp.frequency.exponentialRampToValueAtTime(5200, t + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(dest);

    // a chord blooming upward, voices entering one after another
    const chord = [261.63, 392, 523.25, 659.25, 783.99, 1046.5];
    for (let i = 0; i < chord.length; i++) {
      const ts = t + (i / chord.length) * dur * 0.55;
      const gv = ctx.createGain();
      gv.gain.setValueAtTime(0, ts);
      gv.gain.linearRampToValueAtTime(0.055 - i * 0.004, tPeak);
      gv.gain.setTargetAtTime(0, tPeak, 0.4);
      const a = osc("sine", chord[i] * 0.972, ts, tEnd);
      a.frequency.exponentialRampToValueAtTime(chord[i], tPeak);
      const b = osc("sine", chord[i] * 0.978, ts, tEnd);
      b.frequency.exponentialRampToValueAtTime(chord[i] * 1.004, tPeak);
      a.connect(gv);
      b.connect(gv);
      gv.connect(dest);
    }
    // glints near the top
    const glints = [1567.98, 2093, 2637.02, 3135.96];
    for (let i = 0; i < glints.length; i++) {
      bell(dest, t + dur * (0.6 + i * 0.09), glints[i], 0.035, 0.3);
    }
    release(dest, tEnd + 0.1);
  }

  function objective() {
    if (!ready()) return;
    const t = ctx.currentTime + 0.004;
    const dest = out(0, 0.3);
    let tEnd = t;
    const notes = [783.99, 1046.5, 1318.51];
    for (let i = 0; i < notes.length; i++) {
      const e = bell(dest, t + i * 0.085, notes[i], 0.13 - i * 0.015, 0.2 + i * 0.07);
      if (e > tEnd) tEnd = e;
    }
    release(dest, tEnd + 0.1);
  }

  function victory() {
    if (!ready()) return;
    const t = ctx.currentTime + 0.01;
    const dest = out(0, 0.3);
    let tEnd = t;
    const keep = (e) => { if (e > tEnd) tEnd = e; };
    const G4 = 392, C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, C4 = 261.63;
    // pickup run
    keep(brass(dest, t, G4, 0.12, 0.2));
    keep(brass(dest, t + 0.15, C5, 0.12, 0.2));
    keep(brass(dest, t + 0.3, E5, 0.12, 0.2));
    keep(brass(dest, t + 0.45, G5, 0.3, 0.22));
    keep(brass(dest, t + 0.83, E5, 0.11, 0.18));
    // final chord
    const tc = t + 0.98;
    keep(brass(dest, tc, C4, 1.25, 0.14));
    keep(brass(dest, tc, C5, 1.25, 0.13));
    keep(brass(dest, tc, E5, 1.25, 0.12));
    keep(brass(dest, tc, G5, 1.25, 0.13));
    keep(brass(dest, tc, C6, 1.25, 0.1));
    // soft timpani-ish hits under the accents
    keep(thump(dest, t + 0.45, 130, 65, 0.1, 0.006, 0.35, 0.09));
    keep(thump(dest, tc, 131, 62, 0.14, 0.006, 0.5, 0.16));
    keep(burst(dest, tc, {
      buf: whiteBuf, type: "highpass", q: 0.5, f0: 5000,
      attack: 0.01, peak: 0.07, tc: 0.3,
    }));
    // sparkle cascade over the chord
    const sp = [1046.5, 1318.51, 1567.98, 2093, 1567.98, 2093, 2637.02, 3135.96];
    for (let i = 0; i < sp.length; i++) {
      keep(bell(dest, tc + 0.1 + i * 0.1, sp[i], 0.06, 0.28));
    }
    release(dest, tEnd + 0.1);
  }

  // ---- ambience -------------------------------------------------------------

  const AMB_SCALE = [392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];

  function scheduleMelody() {
    if (!amb || !ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    if (amb.nextT < now + 0.1) amb.nextT = now + 0.1;
    while (amb.nextT < now + 2.5) {
      const t = amb.nextT;
      if (Math.random() < 0.82) {
        // gentle random walk on a pentatonic scale, biased back to the middle
        let step = ((Math.random() * 5) | 0) - 2;
        if (amb.degree > 6) step -= 1;
        if (amb.degree < 2) step += 1;
        amb.degree = clamp(amb.degree + step, 0, AMB_SCALE.length - 1);
        const f = AMB_SCALE[amb.degree];
        const peak = rnd(0.022, 0.036);
        const tc = rnd(0.7, 1.1);
        // soft sine pluck with a faint octave shimmer
        const g = ctx.createGain();
        const e = env(g.gain, t, 0.02, peak, tc);
        const o = osc("sine", f, t, e);
        const g2 = ctx.createGain();
        const e2 = env(g2.gain, t, 0.03, peak * 0.22, tc * 0.5);
        const o2 = osc("sine", f * 2.003, t, e2);
        o.connect(g);
        o2.connect(g2);
        g.connect(amb.melody);
        g2.connect(amb.melody);
        if (Math.random() < 0.22) {
          // occasional answering note a fifth-ish above
          const d2 = clamp(amb.degree + 2, 0, AMB_SCALE.length - 1);
          const g3 = ctx.createGain();
          const e3 = env(g3.gain, t + 0.42, 0.02, peak * 0.6, tc * 0.8);
          const o3 = osc("sine", AMB_SCALE[d2], t + 0.42, e3);
          o3.connect(g3);
          g3.connect(amb.melody);
        }
      }
      amb.nextT += pick([1.6, 2.0, 2.4, 2.4, 3.2, 4.0]) + rnd(-0.06, 0.06);
    }
  }

  function beginAmbience() {
    if (!ctx || amb) return;
    const t = ctx.currentTime + 0.02;
    const far = t + 1e6;
    const nodes = [];

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + 5);
    gain.connect(bus);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    gain.connect(send);
    send.connect(verbIn);

    // pad: open C chord, pairs of slightly detuned sines, breathing lowpass
    const padLP = filt("lowpass", 700, 0.5);
    const padG = ctx.createGain();
    padG.gain.value = 0.02;
    padLP.connect(padG);
    padG.connect(gain);
    const padNotes = [130.81, 196, 261.63, 329.63, 392];
    const padAmp = [1, 0.8, 0.55, 0.5, 0.3];
    for (let i = 0; i < padNotes.length; i++) {
      const a = osc("sine", padNotes[i], t, far);
      const b = osc("triangle", padNotes[i], t, far);
      a.detune.value = -5 - i;
      b.detune.value = 6 + i;
      const g = ctx.createGain();
      g.gain.value = padAmp[i] * 0.5;
      a.connect(g);
      b.connect(g);
      g.connect(padLP);
      nodes.push(a, b);
    }
    const lfo1 = osc("sine", 0.07, t, far);
    const lfo1G = ctx.createGain();
    lfo1G.gain.value = 260;
    lfo1.connect(lfo1G);
    lfo1G.connect(padLP.frequency);
    const lfo2 = osc("sine", 0.113, t, far);
    const lfo2G = ctx.createGain();
    lfo2G.gain.value = 0.006;
    lfo2.connect(lfo2G);
    lfo2G.connect(padG.gain);
    nodes.push(lfo1, lfo2);

    // air: barely-there soft wind
    const air = noise(pinkBuf, t, far, 0.8);
    const airBP = filt("bandpass", 1100, 0.45);
    const airG = ctx.createGain();
    airG.gain.value = 0.014;
    air.connect(airBP);
    airBP.connect(airG);
    airG.connect(gain);
    const lfo3 = osc("sine", 0.05, t, far);
    const lfo3G = ctx.createGain();
    lfo3G.gain.value = 450;
    lfo3.connect(lfo3G);
    lfo3G.connect(airBP.frequency);
    const lfo4 = osc("sine", 0.083, t, far);
    const lfo4G = ctx.createGain();
    lfo4G.gain.value = 0.007;
    lfo4.connect(lfo4G);
    lfo4G.connect(airG.gain);
    nodes.push(air, lfo3, lfo4);

    const melody = ctx.createGain();
    melody.gain.value = 1;
    melody.connect(gain);

    amb = { gain, send, melody, nodes, timer: 0, nextT: t + 3, degree: 4 };
    amb.timer = setInterval(scheduleMelody, 600);
    scheduleMelody();
  }

  function startAmbience() {
    wantAmbience = true;
    if (ctx && !amb) beginAmbience();
  }

  function stopAmbience() {
    wantAmbience = false;
    if (!amb) return;
    const a = amb;
    amb = null;
    clearInterval(a.timer);
    const t = ctx.currentTime;
    a.gain.gain.cancelScheduledValues(t);
    a.gain.gain.setTargetAtTime(0, t, 0.35);
    for (let i = 0; i < a.nodes.length; i++) {
      try { a.nodes[i].stop(t + 2.6); } catch (e) { /* already stopped */ }
    }
    release(a.gain, t + 4.5); // after the melody tails are silent too
  }

  // ==========================================================================
  // EXTENSIONS (levels 2-5). Everything below is additive: the level-1 sounds
  // above are untouched and everything still runs through the master limiter.
  // ==========================================================================

  let lastWStepT = -1;
  let lastSenseT = -1;
  let lastCoinT = -1;
  let lastChirpT = -1;
  const loops = {};      // name -> { gain, nodes[], timers[], arg, set }
  const want = {};       // name -> { level, builder, fade, arg }   (re-applied in resume())
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function buildExt() {
    wBus = ctx.createGain();
    wLP = filt("lowpass", 20000, 0.5);
    wBus.connect(wLP);
    wLP.connect(bus);
    wVerb = ctx.createGain();
    wVerbLP = filt("lowpass", 20000, 0.5);
    wVerb.connect(wVerbLP);
    wVerbLP.connect(verbIn);

    // a longer, darker room that is NOT ducked (heartbeat / sad theme)
    storyVerb = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(3.4, 2.1);
    const hp = filt("highpass", 180, 0.5);
    const o = ctx.createGain();
    o.gain.value = 0.6;
    storyVerb.connect(hp);
    hp.connect(conv);
    conv.connect(o);
    o.connect(storyBus);
  }

  function outTo(target, verb, pan, send, level) {
    const g = ctx.createGain();
    g.gain.value = level === undefined ? 1 : level;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      p.connect(target);
    } else {
      g.connect(target);
    }
    if (send) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s);
      s.connect(verb);
    }
    return g;
  }
  /** One-shot output on the world bus (muffled by underwater()). */
  const wOut = (pan, send, level) => outTo(wBus, wVerb, pan, send, level);

  /** Run one sound: fn(t, keep) schedules voices into dest; dest is released when all are silent. */
  function one(dest, fn) {
    const t = ctx.currentTime + 0.004;
    let tEnd = t;
    fn(t, (e) => { if (e > tEnd) tEnd = e; return e; });
    release(dest, tEnd + 0.15);
  }

  /** Gliding tone with a swell envelope. */
  function tone(dest, t, type, f0, f1, dur, peak, rise, tc) {
    const g = ctx.createGain();
    const tEnd = swell(g.gain, t, rise, peak, t + dur, tc);
    const o = osc(type, f0, t, tEnd);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    o.connect(g);
    g.connect(dest);
    return tEnd;
  }

  /** Soft felt-piano / music-box note: sine body, a breath of triangle, long natural decay. */
  function pluck(dest, t, f, peak, tc, bright) {
    const g = ctx.createGain();
    const e = env(g.gain, t, 0.008, peak, tc);
    const a = osc("sine", f, t, e);
    a.connect(g);
    const g2 = ctx.createGain();
    const e2 = env(g2.gain, t, 0.006, peak * (bright === undefined ? 0.3 : bright), tc * 0.35);
    const b = osc("triangle", f * 2.001, t, e2);
    const lp = filt("lowpass", Math.min(6000, f * 5), 0.5);
    b.connect(lp);
    lp.connect(g2);
    g.connect(dest);
    g2.connect(dest);
    return e;
  }

  /** Warm pad chord: detuned sine+triangle pairs through a low-pass, slow swell. */
  function pad(dest, t, freqs, dur, peak, rise, tcRel, cut) {
    const lp = filt("lowpass", cut || 1400, 0.5);
    const g = ctx.createGain();
    const tEnd = swell(g.gain, t, rise, peak, t + dur, tcRel);
    for (let i = 0; i < freqs.length; i++) {
      const a = osc("sine", freqs[i], t, tEnd);
      const b = osc("triangle", freqs[i], t, tEnd);
      a.detune.value = -5;
      b.detune.value = 6;
      const gb = ctx.createGain();
      gb.gain.value = 0.5;
      a.connect(lp);
      b.connect(gb);
      gb.connect(lp);
    }
    lp.connect(g);
    g.connect(dest);
    return tEnd;
  }

  /** A sung-ish syllable: saw through two vowel formants, gliding pitch, optional vibrato. */
  function vox(dest, t, f0, f1, dur, peak, vowel, vibHz, vibDepth) {
    const g = ctx.createGain();
    const tEnd = swell(g.gain, t, Math.min(0.06, dur * 0.3), peak, t + dur * 0.7, dur * 0.12);
    const o = osc("sawtooth", f0, t, tEnd);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (vibHz) {
      const v = osc("sine", vibHz, t, tEnd);
      const vg = ctx.createGain();
      vg.gain.value = f0 * (vibDepth || 0.02);
      v.connect(vg);
      vg.connect(o.frequency);
    }
    const pre = filt("lowpass", 3000, 0.5);
    const fa = filt("bandpass", vowel[0], 4);
    const fb = filt("bandpass", vowel[1], 6);
    const gb = ctx.createGain();
    gb.gain.value = 0.5;
    o.connect(pre);
    pre.connect(fa);
    pre.connect(fb);
    fa.connect(g);
    fb.connect(gb);
    gb.connect(g);
    g.connect(dest);
    return tEnd;
  }

  // ---- looping layers ---------------------------------------------------------

  function killLoop(name, fade) {
    const L = loops[name];
    if (!L) return;
    delete loops[name];
    for (let i = 0; i < L.timers.length; i++) clearInterval(L.timers[i]);
    const t = ctx.currentTime;
    const f = Math.max(0.3, fade || 0.6);
    L.gain.gain.cancelScheduledValues(t);
    L.gain.gain.setTargetAtTime(0, t, f / 3.5);
    for (let i = 0; i < L.nodes.length; i++) {
      try { L.nodes[i].stop(t + f * 2 + 0.3); } catch (e) { /* already stopped */ }
    }
    release(L.gain, t + f * 2 + 4);
  }

  /**
   * Generic looping layer. level 0 (or false) fades out and frees it; > 0 builds it on demand.
   * builder(L, t, arg) creates sources (push them on L.nodes), connects L.gain somewhere,
   * and may set L.set(level, t) for level-dependent timbre and L.scale for the master level.
   */
  function setLoop(name, level, builder, fade, arg) {
    level = clamp(+level || 0, 0, 1);
    if (level > 0) want[name] = { level, builder, fade, arg };
    else delete want[name];
    if (!ctx || ctx.state === "closed") return;
    const t = ctx.currentTime;
    let L = loops[name];
    if (L && level > 0 && L.arg !== arg) { killLoop(name, fade); L = null; }
    if (level <= 0) { if (L) killLoop(name, fade); return; }
    if (!L) {
      L = { gain: ctx.createGain(), nodes: [], timers: [], arg, set: null, scale: 1 };
      L.gain.gain.value = 0;
      builder(L, t + 0.03, arg);
      loops[name] = L;
    }
    const f = Math.max(0.3, fade || 0.6);
    L.gain.gain.cancelScheduledValues(t);
    L.gain.gain.setTargetAtTime(level * L.scale, t, f / 3.5);
    if (L.set) L.set(level, t);
  }

  function restoreLoops() {
    if (!ctx) return;
    for (const name in want) {
      if (!loops[name]) {
        const w = want[name];
        setLoop(name, w.level, w.builder, w.fade, w.arg);
      }
    }
  }

  /** Every `ms`, call fn(now) while the context is running. fn schedules up to ~1 s ahead. */
  function every(L, ms, fn) {
    const tick = () => { if (ctx && ctx.state === "running") fn(ctx.currentTime); };
    L.timers.push(setInterval(tick, ms));
    tick();
  }

  /** Looping note sequence: events = [[beat, ...], ...] sorted by beat; play(t, event). */
  function runSeq(L, t0, beatSec, lenBeats, events, play) {
    let cyc = 0;
    let i = 0;
    every(L, 280, (now) => {
      for (let guard = 0; guard < 200; guard++) {
        const te = t0 + (cyc * lenBeats + events[i][0]) * beatSec;
        if (te > now + 1.2) break;
        if (te > now + 0.01) play(te, events[i]);
        if (++i >= events.length) { i = 0; cyc++; }
      }
    });
  }

  /** Looping source helper: noise -> filter -> gain(level) -> dest; returns { src, f, g }. */
  function bed(L, t, buf, type, freq, q, level, dest, rate) {
    const src = noise(buf, t, t + 1e6, rate || 1);
    const f = filt(type, freq, q);
    const g = ctx.createGain();
    g.gain.value = level;
    src.connect(f);
    f.connect(g);
    g.connect(dest || L.gain);
    L.nodes.push(src);
    return { src, f, g };
  }

  /** Slow LFO into an AudioParam. */
  function lfo(L, t, hz, depth, param) {
    const o = osc("sine", hz, t, t + 1e6);
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g);
    g.connect(param);
    L.nodes.push(o);
    return o;
  }

  /** Connect a loop's master gain to a bus with an optional reverb send. */
  function loopOut(L, target, verb, send) {
    L.gain.connect(target);
    if (send) {
      const s = ctx.createGain();
      s.gain.value = send;
      L.gain.connect(s);
      s.connect(verb);
    }
  }

  // ---- housekeeping -------------------------------------------------------------

  function stopAll() {
    wantAmbience = false;
    for (const k in want) delete want[k];
    musicHalt(0.45);
    if (!ctx || ctx.state === "closed") return;
    stopAmbience();
    for (const name in loops) killLoop(name, 0.45);
    const t = ctx.currentTime;
    duck.gain.cancelScheduledValues(t);
    duck.gain.setTargetAtTime(1, t + 0.5, 0.15);
    wLP.frequency.cancelScheduledValues(t);
    wLP.frequency.setTargetAtTime(20000, t, 0.1);
    wVerbLP.frequency.cancelScheduledValues(t);
    wVerbLP.frequency.setTargetAtTime(20000, t, 0.1);
  }

  function titleCard() {
    if (!ready()) return;
    const dest = out(0, 0.4);
    one(dest, (t, keep) => {
      keep(thump(dest, t, 64, 30, 0.8, 0.012, 0.7, 0.4));
      keep(thump(dest, t, 132, 46, 0.26, 0.008, 0.3, 0.12));
      keep(burst(dest, t, {
        buf: pinkBuf, type: "lowpass", q: 0.5, f0: 1700, f1: 100, sweep: 0.7,
        attack: 0.012, peak: 0.55, tc: 0.22,
      }));
      // a dark open fifth blooming under the letters
      keep(pad(dest, t + 0.02, [65.41, 98, 130.81, 196], 1.3, 0.11, 0.5, 0.6, 700));
      keep(bell(dest, t + 0.05, 523.25, 0.03, 0.9));
    });
  }

  function levelUnlock() {
    if (!ready()) return;
    const dest = out(0, 0.4);
    one(dest, (t, keep) => {
      // padlock pops off
      keep(thump(dest, t, 520, 260, 0.05, 0.004, 0.16, 0.03));
      keep(bell(dest, t, 2637, 0.03, 0.05));
      // bright rising chime
      const n = [72, 76, 79, 84, 88, 91, 96];
      for (let i = 0; i < n.length; i++) {
        keep(bell(dest, t + 0.1 + i * 0.07, midi(n[i]), 0.095 - i * 0.006, 0.3 + i * 0.05));
      }
      keep(pad(dest, t + 0.1, [261.63, 392, 523.25, 659.25], 0.9, 0.07, 0.35, 0.4, 2200));
      keep(crackle(dest, t + 0.45, 0.7, 6000, 0.022, 0.12, false));
    });
  }

  // ---- world ------------------------------------------------------------------

  /** A few rising water "bloops" (bubbles / droplets). */
  function bloops(dest, t, n, fLo, fHi, span, peak, keep) {
    for (let i = 0; i < n; i++) {
      const f = rnd(fLo, fHi);
      keep(thump(dest, t + Math.random() * span, f, f * rnd(1.35, 1.9), rnd(0.03, 0.07), 0.005,
        peak * rnd(0.5, 1), rnd(0.014, 0.03)));
    }
  }

  function step(surface, strength = 0.6, pan = 0) {
    if (EXT_STEP[surface] === 1) { stepExt(surface, strength, pan); return; } // levels 6-11 surfaces (below)
    if (!ready()) return;
    const now = ctx.currentTime;
    if (now - lastWStepT < 0.02) return;
    lastWStepT = now;
    const s = clamp(strength, 0.05, 1.3);
    const v = 0.3 + 0.7 * Math.min(s, 1);
    const dest = wOut(clamp(pan, -1, 1) * 0.6 + rnd(-0.05, 0.05), 0.04);
    one(dest, (t, keep) => {
      if (surface === "sand") {
        // soft sinking pat + a dry grainy hiss as the grains shift
        keep(thump(dest, t, rnd(84, 104), 48, 0.08, 0.009, 0.3 * v, 0.045));
        keep(burst(dest, t, {
          buf: pinkBuf, type: "lowpass", q: 0.4, hp: 180, rate: rnd(0.9, 1.2),
          f0: rnd(1900, 2600), f1: rnd(500, 700), sweep: 0.1, attack: 0.012, peak: 0.34 * v, tc: 0.045,
        }));
        keep(fabricRustle(dest, t + rnd(0.005, 0.02), rnd(0.1, 0.16), rnd(4200, 6200), 0.8, 0.05 * v, 4));
      } else if (surface === "rock") {
        // padded paw on stone: tight, dry, a tiny claw tick
        keep(thump(dest, t, rnd(170, 200), 96, 0.04, 0.004, 0.4 * v, 0.026));
        keep(thump(dest, t, rnd(90, 110), 60, 0.05, 0.006, 0.18 * v, 0.03)); // body weight under the pad
        keep(burst(dest, t, {
          buf: pinkBuf, type: "bandpass", q: 1.1, f0: rnd(1500, 2100), f1: 900, sweep: 0.03,
          attack: 0.003, peak: 0.42 * v, tc: 0.016,
        }));
        if (Math.random() < 0.6) {
          keep(burst(dest, t + rnd(0.008, 0.02), {
            buf: whiteBuf, type: "bandpass", q: 3, f0: rnd(3200, 4400),
            attack: 0.002, peak: 0.05 * v, tc: 0.006,
          }));
        }
      } else if (surface === "grass") {
        keep(thump(dest, t, rnd(92, 112), 55, 0.07, 0.01, 0.2 * v, 0.04));
        keep(fabricRustle(dest, t, rnd(0.12, 0.2), rnd(3000, 4800), 1, 0.085 * v, 3 + ((Math.random() * 3) | 0)));
        keep(burst(dest, t, {
          buf: pinkBuf, type: "bandpass", q: 0.6, f0: rnd(900, 1300), f1: 600, sweep: 0.09,
          attack: 0.014, peak: 0.12 * v, tc: 0.04,
        }));
      } else if (surface === "wood") {
        // a log: hollow knock with a short woody ring
        const f = rnd(210, 260);
        keep(thump(dest, t, f * 1.25, f, 0.03, 0.004, 0.24 * v, 0.03));
        keep(thump(dest, t, f * 2.62, f * 2.55, 0.03, 0.003, 0.07 * v, 0.016));
        keep(thump(dest, t, 120, 70, 0.05, 0.006, 0.2 * v, 0.03));
        keep(burst(dest, t, {
          buf: pinkBuf, type: "bandpass", q: 1.4, f0: rnd(700, 950),
          attack: 0.003, peak: 0.2 * v, tc: 0.016,
        }));
      } else if (surface === "water") {
        // shallow paddle: a wet slap and a couple of droplets
        keep(burst(dest, t, {
          buf: whiteBuf, type: "bandpass", q: 0.9, f0: rnd(900, 1300), f1: rnd(2400, 3200), sweep: 0.09,
          attack: 0.006, peak: 0.2 * v, tc: 0.05,
        }));
        keep(burst(dest, t, {
          buf: pinkBuf, type: "lowpass", q: 0.6, f0: 900, f1: 300, sweep: 0.08,
          attack: 0.006, peak: 0.26 * v, tc: 0.04,
        }));
        bloops(dest, t + 0.02, 2 + ((Math.random() * 2) | 0), 500, 1300, 0.12, 0.06 * v, keep);
      } else {
        // "stage": hollow boards over a void, soft and round
        const f = rnd(128, 150);
        keep(thump(dest, t, f, f * 0.62, 0.09, 0.006, 0.38 * v, 0.055));
        keep(thump(dest, t, f * 2.3, f * 2.1, 0.04, 0.004, 0.1 * v, 0.022));
        keep(burst(dest, t, {
          buf: pinkBuf, type: "bandpass", q: 0.9, f0: rnd(600, 800), f1: 380, sweep: 0.05,
          attack: 0.004, peak: 0.22 * v, tc: 0.02,
        }));
      }
    });
  }

  // zoo ambience ------------------------------------------------------------------

  function birdPhrase(L, t) {
    const dest = outTo(L.gain, wVerb, rnd(-0.8, 0.8), 0.25, rnd(0.35, 1));
    let tEnd = t;
    const kind = (Math.random() * 4) | 0;
    const base = rnd(2300, 3900);
    const n = kind === 3 ? 1 : 2 + ((Math.random() * 4) | 0);
    let tt = t;
    for (let i = 0; i < n; i++) {
      let e;
      if (kind === 0) {          // tweet-tweet: quick up-slurs
        e = tone(dest, tt, "sine", base, base * rnd(1.25, 1.5), 0.07, 0.03, 0.015, 0.02);
        tt += rnd(0.11, 0.15);
      } else if (kind === 1) {   // falling "tsiu"
        e = tone(dest, tt, "sine", base * 1.4, base * 0.85, 0.11, 0.028, 0.012, 0.03);
        tt += rnd(0.16, 0.24);
      } else if (kind === 2) {   // two-note song
        e = tone(dest, tt, "sine", base * (i % 2 ? 1.26 : 1), base * (i % 2 ? 1.24 : 1.02), 0.1, 0.028, 0.02, 0.03);
        tt += rnd(0.17, 0.2);
      } else {                   // soft trill
        const g = ctx.createGain();
        e = swell(g.gain, tt, 0.06, 0.026, tt + 0.4, 0.05);
        const o = osc("sine", base * 0.9, tt, e);
        const w = osc("sine", rnd(22, 30), tt, e);
        const wg = ctx.createGain();
        wg.gain.value = base * 0.07;
        w.connect(wg);
        wg.connect(o.frequency);
        o.connect(g);
        g.connect(dest);
      }
      if (e > tEnd) tEnd = e;
    }
    release(dest, tEnd + 0.15);
  }

  function cricketPhrase(L, t, f, pan, vol) {
    const dest = outTo(L.gain, wVerb, pan, 0.12, vol);
    const n = 3 + ((Math.random() * 4) | 0);
    let tEnd = t;
    for (let i = 0; i < n; i++) {
      // each chirp = three very short pulses of a pure high tone
      for (let k = 0; k < 3; k++) {
        const tk = t + i * 0.34 + k * 0.034;
        const g = ctx.createGain();
        const e = env(g.gain, tk, 0.006, 0.018, 0.007);
        const o = osc("sine", f, tk, e);
        o.connect(g);
        g.connect(dest);
        if (e > tEnd) tEnd = e;
      }
    }
    release(dest, tEnd + 0.15);
  }

  function buildZoo(L, t, time) {
    loopOut(L, wBus, wVerb, 0.12);
    const night = time === "night";

    // breeze in the trees beyond the walls
    const air = bed(L, t, pinkBuf, "bandpass", 900, 0.4, night ? 0.012 : 0.02, null, 0.8);
    lfo(L, t, 0.045, 380, air.f.frequency);
    lfo(L, t, 0.071, night ? 0.005 : 0.009, air.g.gain);

    // the stream: a fine bright hiss + random little bloops scheduled below
    const tr = bed(L, t, whiteBuf, "bandpass", 3400, 0.7, 0.0075, null, 1.1);
    lfo(L, t, 0.31, 700, tr.f.frequency);
    const tr2 = bed(L, t, pinkBuf, "bandpass", 1200, 0.9, 0.011, null, 1.3);
    lfo(L, t, 0.19, 0.004, tr2.g.gain);

    if (!night) {
      // visitors: a faint murmur behind thick glass
      const mur = bed(L, t, pinkBuf, "bandpass", 420, 0.8, 0.02, null, 0.7);
      const mlp = filt("lowpass", 620, 0.5);
      mur.g.disconnect();
      mur.g.connect(mlp);
      mlp.connect(L.gain);
      lfo(L, t, 0.13, 0.009, mur.g.gain);
      lfo(L, t, 0.37, 90, mur.f.frequency);
    } else {
      // night: a low electrical hum from the lamps
      const hum = ctx.createGain();
      hum.gain.value = 0.012;
      const a = osc("sine", 100, t, t + 1e6);
      const b = osc("sine", 200.4, t, t + 1e6);
      const bg = ctx.createGain();
      bg.gain.value = 0.25;
      a.connect(hum);
      b.connect(bg);
      bg.connect(hum);
      hum.connect(L.gain);
      L.nodes.push(a, b);
      lfo(L, t, 0.09, 0.004, hum.gain);
    }

    let nextDrip = t;
    let nextVoice = t + (night ? 0.4 : 1.2);
    const cricketF = [4300, 4750, 5200];
    every(L, 400, (now) => {
      if (nextDrip < now) nextDrip = now + 0.05;
      while (nextDrip < now + 0.9) {
        const f = rnd(700, 2300);
        const g = ctx.createGain();
        const e = env(g.gain, nextDrip, 0.004, rnd(0.004, 0.012), rnd(0.012, 0.03));
        const o = osc("sine", f, nextDrip, e);
        o.frequency.exponentialRampToValueAtTime(f * rnd(1.2, 1.7), nextDrip + 0.05);
        o.connect(g);
        g.connect(L.gain);
        nextDrip += rnd(0.03, 0.2);
      }
      if (nextVoice < now) nextVoice = now + 0.1;
      while (nextVoice < now + 0.9) {
        if (night) {
          cricketPhrase(L, nextVoice, pick(cricketF) * rnd(0.98, 1.02), rnd(-0.9, 0.9), rnd(0.3, 1));
          nextVoice += rnd(0.5, 1.7);
        } else {
          birdPhrase(L, nextVoice);
          nextVoice += rnd(0.9, 4.2);
        }
      }
    });
  }

  function zooAmbience(on, time = "day") {
    setLoop("zoo", on ? 1 : 0, buildZoo, 1.6, time === "night" ? "night" : "day");
  }

  function buildWaterfall(L, t) {
    loopOut(L, wBus, wVerb, 0.1);
    L.scale = 0.55;
    const low = bed(L, t, pinkBuf, "lowpass", 700, 0.5, 0.2, null, 0.9);
    lfo(L, t, 0.23, 0.03, low.g.gain);
    const mid = bed(L, t, whiteBuf, "bandpass", 2200, 0.5, 0.06, null, 1);
    lfo(L, t, 0.41, 400, mid.f.frequency);
    bed(L, t, whiteBuf, "highpass", 5200, 0.5, 0.018, null, 1.2);
  }

  function waterfall(level) {
    setLoop("waterfall", level, buildWaterfall, 0.5);
  }

  function splashInto(dest, t, sz, keep) {
    // the slap on the surface
    keep(burst(dest, t, {
      buf: pinkBuf, type: "lowpass", q: 0.6, f0: 2400 + 1200 * sz, f1: 420, sweep: 0.1,
      attack: 0.005, peak: 0.3 + 0.35 * sz, tc: 0.04 + 0.03 * sz,
    }));
    // plunge body
    keep(thump(dest, t, 150 - 40 * sz, 52, 0.12, 0.008, 0.15 + 0.4 * sz, 0.05 + 0.06 * sz));
    // the crown of spray, then the fizz falling back
    keep(burst(dest, t + 0.015, {
      buf: whiteBuf, type: "bandpass", q: 0.6, f0: 1500, f1: 3800, sweep: 0.14,
      attack: 0.03, peak: 0.14 + 0.2 * sz, tc: 0.07 + 0.1 * sz,
    }));
    keep(burst(dest, t + 0.1 + 0.08 * sz, {
      buf: whiteBuf, type: "highpass", q: 0.5, f0: 3200,
      attack: 0.08, peak: 0.03 + 0.07 * sz, tc: 0.12 + 0.25 * sz,
    }));
    keep(crackle(dest, t + 0.12, 0.35 + 0.6 * sz, 2600, 0.03 + 0.05 * sz, 0.18, false));
    bloops(dest, t + 0.04, 3 + ((sz * 7) | 0), 260, 900, 0.3 + 0.4 * sz, 0.07 + 0.05 * sz, keep);
  }

  function splash(size = 0.5) {
    if (!ready()) return;
    const sz = clamp(size, 0, 1);
    const dest = wOut(rnd(-0.1, 0.1), 0.12);
    one(dest, (t, keep) => splashInto(dest, t, sz, keep));
  }

  function diveIn() {
    if (!ready()) return;
    const dest = out(0, 0.14); // not on the world bus: it must stay crisp while underwater() closes
    one(dest, (t, keep) => {
      splashInto(dest, t, 0.7, keep);
      // the world closing overhead: a down-swept gulp
      keep(burst(dest, t + 0.05, {
        buf: pinkBuf, type: "lowpass", q: 2.5, f0: 1800, f1: 160, sweep: 0.45,
        attack: 0.05, peak: 0.42, tc: 0.16,
      }));
      keep(thump(dest, t + 0.06, 220, 70, 0.4, 0.03, 0.22, 0.14));
      bloops(dest, t + 0.25, 7, 180, 520, 0.7, 0.08, keep);
    });
  }

  function surface() {
    if (!ready()) return;
    const dest = out(0, 0.12);
    one(dest, (t, keep) => {
      // rushing up through the surface
      keep(burst(dest, t, {
        buf: pinkBuf, type: "lowpass", q: 2, f0: 260, f1: 3200, sweep: 0.22,
        attack: 0.1, peak: 0.34, tc: 0.07,
      }));
      bloops(dest, t, 4, 300, 800, 0.15, 0.07, keep);
      keep(burst(dest, t + 0.16, {
        buf: whiteBuf, type: "bandpass", q: 0.6, f0: 2200, f1: 4200, sweep: 0.12,
        attack: 0.02, peak: 0.2, tc: 0.08,
      }));
      // a little breath, and drips off the bill
      keep(burst(dest, t + 0.24, {
        buf: pinkBuf, type: "bandpass", q: 1.2, f0: 1500, f1: 900, sweep: 0.2,
        attack: 0.07, peak: 0.07, tc: 0.07,
      }));
      bloops(dest, t + 0.35, 5, 900, 2200, 0.7, 0.035, keep);
    });
  }

  function buildUnderwater(L, t) {
    L.gain.connect(bus);
    L.scale = 0.9;
    // pressure: deep soft rumble with a slow swirl
    const deep = bed(L, t, pinkBuf, "lowpass", 170, 0.7, 0.3, null, 0.5);
    lfo(L, t, 0.11, 50, deep.f.frequency);
    const swirl = bed(L, t, pinkBuf, "bandpass", 420, 2.2, 0.05, null, 0.6);
    lfo(L, t, 0.17, 160, swirl.f.frequency);
    lfo(L, t, 0.29, 0.025, swirl.g.gain);
    let next = t + 0.1;
    every(L, 400, (now) => {
      if (next < now) next = now + 0.05;
      while (next < now + 0.9) {
        // a little run of bubbles rising past the ears
        const n = 1 + ((Math.random() * 4) | 0);
        const f0 = rnd(240, 620);
        for (let i = 0; i < n; i++) {
          const tb = next + i * rnd(0.045, 0.08);
          const f = f0 * (1 + i * 0.12);
          thump(L.gain, tb, f, f * rnd(1.4, 1.8), 0.06, 0.006, rnd(0.02, 0.045), rnd(0.018, 0.03));
        }
        next += rnd(0.25, 1.1);
      }
    });
  }

  function underwater(on) {
    setLoop("underwater", on ? 1 : 0, buildUnderwater, 0.4);
    if (!ctx || !wLP) return;
    const t = ctx.currentTime;
    const f = on ? 620 : 20000;
    wLP.frequency.cancelScheduledValues(t);
    wLP.frequency.setTargetAtTime(f, t, on ? 0.06 : 0.1);
    wVerbLP.frequency.cancelScheduledValues(t);
    wVerbLP.frequency.setTargetAtTime(f, t, on ? 0.06 : 0.1);
  }

  function ballBounce(strength = 0.6) {
    if (!ready()) return;
    const v = 0.25 + 0.75 * clamp(strength, 0, 1);
    const dest = wOut(rnd(-0.1, 0.1), 0.1);
    one(dest, (t, keep) => {
      // hollow rubber: a quick down-chirp body, an airy ring, a soft skin slap
      const f = rnd(250, 290);
      keep(thump(dest, t, f * 1.5, f * 0.72, 0.07, 0.004, 0.34 * v, 0.05));
      keep(thump(dest, t, f * 2.9, f * 2.7, 0.05, 0.004, 0.09 * v, 0.07));
      keep(thump(dest, t, 105, 62, 0.06, 0.006, 0.22 * v, 0.035));
      keep(burst(dest, t, {
        buf: pinkBuf, type: "bandpass", q: 1.2, f0: 1300, f1: 700, sweep: 0.04,
        attack: 0.003, peak: 0.22 * v, tc: 0.016,
      }));
    });
  }

  function doorOpen() {
    if (!ready()) return;
    const dest = wOut(rnd(-0.1, 0.1), 0.22);
    one(dest, (t, keep) => {
      // latch: two small metal clicks
      keep(thump(dest, t, 1500, 900, 0.02, 0.002, 0.07, 0.01));
      keep(bell(dest, t, 2100, 0.03, 0.04));
      keep(thump(dest, t + 0.09, 950, 520, 0.03, 0.003, 0.1, 0.016));
      keep(thump(dest, t + 0.09, 150, 80, 0.06, 0.005, 0.22, 0.04));
      // hinge: a slow friendly creak that rises as the door swings
      const g = ctx.createGain();
      const e = swell(g.gain, t + 0.16, 0.2, 0.05, t + 0.75, 0.08);
      const o = osc("sawtooth", 170, t + 0.16, e);
      o.frequency.linearRampToValueAtTime(255, t + 0.55);
      o.frequency.linearRampToValueAtTime(215, t + 0.9);
      const fm = osc("sine", 31, t + 0.16, e);
      const fg = ctx.createGain();
      fg.gain.value = 14;
      fm.connect(fg);
      fg.connect(o.frequency);
      const bp = filt("bandpass", 820, 3);
      o.connect(bp);
      bp.connect(g);
      g.connect(dest);
      keep(e);
      // air moving through the doorway
      keep(burst(dest, t + 0.2, {
        buf: pinkBuf, type: "bandpass", q: 0.7, f0: 300, f1: 900, sweep: 0.5,
        attack: 0.25, peak: 0.1, tc: 0.18,
      }));
    });
  }

  // ---- friend ------------------------------------------------------------------

  /** One platypus chirp syllable: a pure gliding whistle with a breath of octave on top. */
  function chirp(dest, t, f0, f1, dur, peak, vibHz, vibDepth) {
    const g = ctx.createGain();
    const tEnd = swell(g.gain, t, Math.min(0.025, dur * 0.3), peak, t + dur * 0.75, Math.max(0.012, dur * 0.12));
    const a = osc("sine", f0, t, tEnd);
    const b = osc("triangle", f0 * 2, t, tEnd);
    a.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    b.frequency.exponentialRampToValueAtTime(Math.max(80, f1 * 2), t + dur);
    if (vibHz) {
      const v = osc("sine", vibHz, t, tEnd);
      const vg = ctx.createGain();
      vg.gain.value = f0 * (vibDepth || 0.02);
      v.connect(vg);
      vg.connect(a.frequency);
      vg.connect(b.frequency);
    }
    const gb = ctx.createGain();
    gb.gain.value = 0.16;
    const lp = filt("lowpass", 5200, 0.5);
    a.connect(g);
    b.connect(gb);
    gb.connect(lp);
    lp.connect(g);
    g.connect(dest);
    return tEnd;
  }

  /** Soft low growl-purr: a filtered saw fluttering at `amHz`. */
  function purr(dest, t, dur, peak, f, amHz) {
    const g = ctx.createGain();
    const tEnd = swell(g.gain, t, dur * 0.3, peak, t + dur * 0.7, dur * 0.12);
    const o = osc("sawtooth", f, t, tEnd);
    o.frequency.linearRampToValueAtTime(f * rnd(0.9, 1.08), t + dur);
    const o2 = osc("triangle", f * 2.01, t, tEnd);
    const g2 = ctx.createGain();
    g2.gain.value = 0.4;
    const lp = filt("lowpass", 520, 0.8);
    const trem = ctx.createGain();
    trem.gain.value = 0.55;
    const l = osc("sine", amHz, t, tEnd);
    const lg = ctx.createGain();
    lg.gain.value = 0.45;
    l.connect(lg);
    lg.connect(trem.gain);
    o.connect(lp);
    o2.connect(g2);
    g2.connect(lp);
    lp.connect(trem);
    trem.connect(g);
    g.connect(dest);
    return tEnd;
  }

  function friendChirp(mood, volume = 1, pan = 0) {
    if (!ready()) return;
    const now = ctx.currentTime;
    if (now - lastChirpT < 0.04) return;
    const vol = clamp(+volume || 0, 0, 1.5);
    if (vol < 0.004) return;
    lastChirpT = now;
    const dest = wOut(clamp(pan, -1, 1) * 0.8, 0.16, vol);
    const k = rnd(0.95, 1.07);
    one(dest, (t, keep) => {
      if (mood === "call") {
        // "kwee-eeh?": an up-slur, then a longer held note that lifts at the end
        keep(chirp(dest, t, 920 * k, 1380 * k, 0.16, 0.13));
        keep(chirp(dest, t + 0.2, 1380 * k, 1560 * k, 0.34, 0.12, 7, 0.012));
      } else if (mood === "giggle") {
        // a quick bouncing run that tumbles downward
        const n = 5 + ((Math.random() * 3) | 0);
        for (let i = 0; i < n; i++) {
          const f = (i % 2 ? 1500 : 1820) * k * (1 - i * 0.035);
          keep(chirp(dest, t + i * 0.075, f, f * 1.12, 0.05, 0.1 - i * 0.008));
        }
      } else if (mood === "curious") {
        // "mm? -eep?": a small low note and a rising question
        keep(chirp(dest, t, 820 * k, 860 * k, 0.08, 0.09));
        keep(chirp(dest, t + 0.13, 900 * k, 1620 * k, 0.24, 0.12));
      } else if (mood === "sad") {
        // slow falling whimper with a tremble
        keep(chirp(dest, t, 1040 * k, 660 * k, 0.5, 0.09, 6, 0.015));
        keep(chirp(dest, t + 0.62, 820 * k, 600 * k, 0.34, 0.06, 6, 0.018));
      } else if (mood === "scared") {
        // short trembling squeaks, each falling
        for (let i = 0; i < 3; i++) {
          const f = rnd(1650, 1900) * k;
          keep(chirp(dest, t + i * 0.12, f, f * 0.78, 0.09, 0.1, 28, 0.03));
        }
      } else if (mood === "sleepy") {
        // a drowsy murmur sliding down, mostly breath
        keep(chirp(dest, t, 720 * k, 470 * k, 0.6, 0.07, 4, 0.01));
        keep(burst(dest, t + 0.05, {
          buf: pinkBuf, type: "bandpass", q: 1, f0: 1100, f1: 600, sweep: 0.5,
          attack: 0.2, peak: 0.03, tc: 0.14,
        }));
      } else if (mood === "growl") {
        keep(purr(dest, t, 0.75, 0.34, rnd(72, 86), rnd(22, 27)));
        keep(burst(dest, t, {
          buf: pinkBuf, type: "bandpass", q: 1.4, f0: 380, f1: 300, sweep: 0.6,
          attack: 0.25, peak: 0.05, tc: 0.14,
        }));
      } else {
        // "happy": three bright up-chirps climbing
        keep(chirp(dest, t, 1050 * k, 1520 * k, 0.07, 0.12));
        keep(chirp(dest, t + 0.1, 1250 * k, 1800 * k, 0.07, 0.12));
        keep(chirp(dest, t + 0.2, 1480 * k, 2250 * k, 0.11, 0.13));
      }
    });
  }

  function eat() {
    if (!ready()) return;
    const dest = wOut(rnd(-0.08, 0.08), 0.06);
    one(dest, (t, keep) => {
      const n = 3 + ((Math.random() * 2) | 0);
      for (let i = 0; i < n; i++) {
        const tc = t + i * rnd(0.12, 0.15);
        // crisp crunch: a short bright crackle on a tiny jaw thump
        keep(burst(dest, tc, {
          buf: whiteBuf, type: "bandpass", q: 1.1, f0: rnd(1900, 3000), f1: rnd(1000, 1400), sweep: 0.05,
          attack: 0.003, peak: 0.2 - i * 0.025, tc: 0.02,
        }));
        keep(crackle(dest, tc, 0.07, 2200, 0.13 - i * 0.02, 0.45, false));
        keep(thump(dest, tc, rnd(210, 250), 120, 0.04, 0.004, 0.12, 0.02));
      }
      // a content little "mm"
      keep(chirp(dest, t + n * 0.14 + 0.05, 760, 900, 0.12, 0.05));
    });
  }

  function yawn() {
    if (!ready()) return;
    const dest = wOut(0, 0.14);
    one(dest, (t, keep) => {
      // squeaky inhale rising ... and a long sighing fall
      keep(chirp(dest, t, 620, 1180, 0.5, 0.08, 5, 0.008));
      keep(chirp(dest, t + 0.48, 1180, 520, 0.8, 0.075, 5, 0.012));
      keep(burst(dest, t, {
        buf: pinkBuf, type: "bandpass", q: 1.2, f0: 700, f1: 1700, sweep: 0.5,
        attack: 0.35, peak: 0.05, tc: 0.08,
      }));
      keep(burst(dest, t + 0.55, {
        buf: pinkBuf, type: "bandpass", q: 0.9, f0: 1500, f1: 500, sweep: 0.8,
        attack: 0.2, peak: 0.07, tc: 0.22,
      }));
    });
  }

  function nuzzle() {
    if (!ready()) return;
    const dest = wOut(rnd(-0.06, 0.06), 0.14);
    one(dest, (t, keep) => {
      keep(purr(dest, t, 1.1, 0.26, rnd(50, 58), rnd(20, 24)));
      keep(purr(dest, t + 0.05, 1.0, 0.07, rnd(150, 170), rnd(20, 24)));
      keep(fabricRustle(dest, t, 0.3, rnd(2600, 3600), 1, 0.035, 3));
      keep(chirp(dest, t + 0.35, 980, 1320, 0.1, 0.05));
      keep(chirp(dest, t + 0.5, 1180, 1500, 0.12, 0.045));
    });
  }

  function buildSnore(L, t) {
    loopOut(L, wBus, wVerb, 0.12);
    L.scale = 0.7;
    let next = t + 0.2;
    every(L, 500, (now) => {
      if (next < now) next = now + 0.05;
      while (next < now + 1.0) {
        // in: a tiny fluttering purr ... out: a soft falling whistle
        purr(L.gain, next, 1.0, 0.1, rnd(58, 66), rnd(17, 21));
        burst(L.gain, next, {
          buf: pinkBuf, type: "bandpass", q: 1.5, f0: 420, f1: 700, sweep: 0.9,
          attack: 0.5, peak: 0.04, tc: 0.15,
        });
        tone(L.gain, next + 1.35, "sine", rnd(980, 1100), rnd(700, 780), 0.8, 0.018, 0.25, 0.15);
        burst(L.gain, next + 1.3, {
          buf: pinkBuf, type: "bandpass", q: 1, f0: 1400, f1: 800, sweep: 0.8,
          attack: 0.3, peak: 0.03, tc: 0.2,
        });
        next += rnd(3.1, 3.5);
      }
    });
  }

  function snore(on) {
    if (typeof on === "string") { snoreWho(on); return; }  // levels 12-13: one snore of a named sleeper
    setLoop("snore", on ? 1 : 0, buildSnore, 0.5);
  }

  // ---- rewards ------------------------------------------------------------------

  const COIN_F = [2093, 2349.32, 2637.02, 3135.96, 3520];

  function coinClink(dest, t, f, peak) {
    burst(dest, t, {
      buf: whiteBuf, type: "bandpass", q: 2, f0: 6200, attack: 0.002, peak: peak * 0.45, tc: 0.004,
    });
    bell(dest, t + 0.003, f * 1.503, peak * 0.55, 0.08);
    return bell(dest, t, f, peak, 0.12);
  }

  function coin() {
    if (!ready()) return;
    const now = ctx.currentTime;
    if (now - lastCoinT < 0.03) return;
    lastCoinT = now;
    const dest = out(rnd(-0.15, 0.15), 0.14);
    one(dest, (t, keep) => {
      keep(coinClink(dest, t, pick(COIN_F) * rnd(0.985, 1.015), 0.085));
    });
  }

  function payout(n = 6) {
    if (!ready()) return;
    const count = clamp(Math.round(+n || 0), 1, 14);
    const dest = out(0, 0.18);
    one(dest, (t, keep) => {
      for (let i = 0; i < count; i++) {
        // the run climbs the scale so a big payout sounds like more
        const f = COIN_F[i % COIN_F.length] * (i >= 10 ? 2 : i >= 5 ? 1.5 : 1) * rnd(0.99, 1.01);
        keep(coinClink(dest, t + i * 0.068 + rnd(0, 0.012), f, 0.075));
      }
      const te = t + count * 0.068 + 0.05;
      keep(bell(dest, te, 2093, 0.05, 0.35));
      keep(bell(dest, te, 3135.96, 0.035, 0.3));
      keep(thump(dest, te, 190, 110, 0.06, 0.006, 0.12, 0.04)); // the purse closing
    });
  }

  function questDone() {
    if (!ready()) return;
    const dest = out(0, 0.32);
    one(dest, (t, keep) => {
      const n = [67, 72, 76, 79, 84];
      const at = [0, 0.11, 0.22, 0.33, 0.5];
      for (let i = 0; i < n.length; i++) {
        keep(pluck(dest, t + at[i], midi(n[i] + 12), 0.1, 0.3 + i * 0.06, 0.35));
        keep(bell(dest, t + at[i], midi(n[i] + 12), 0.035, 0.25));
      }
      keep(pad(dest, t, [midi(48), midi(55), midi(64), midi(67)], 0.75, 0.07, 0.3, 0.3, 2000));
      keep(pad(dest, t + 0.5, [midi(48), midi(60), midi(64), midi(72)], 0.5, 0.06, 0.06, 0.4, 2600));
      keep(crackle(dest, t + 0.5, 0.6, 6000, 0.018, 0.12, false));
    });
  }

  function friendship() {
    if (!ready()) return;
    const dest = out(0, 0.42);
    one(dest, (t, keep) => {
      // F(add9) melting into C: a slow rising arpeggio, then two notes answering each other
      keep(pad(dest, t, [midi(41), midi(53), midi(57), midi(60), midi(67)], 1.5, 0.075, 0.6, 0.5, 1500));
      keep(pad(dest, t + 1.5, [midi(48), midi(55), midi(60), midi(64), midi(67)], 1.9, 0.08, 0.5, 0.8, 1700));
      const n = [65, 69, 72, 79, 81, 84];
      for (let i = 0; i < n.length; i++) {
        keep(pluck(dest, t + 0.1 + i * 0.2, midi(n[i]), 0.1, 0.9, 0.3));
      }
      keep(pluck(dest, t + 1.55, midi(88), 0.11, 1.3, 0.3));
      keep(pluck(dest, t + 1.95, midi(84), 0.09, 1.3, 0.3));
      keep(pluck(dest, t + 2.4, midi(79), 0.1, 1.8, 0.3));
      keep(bell(dest, t + 2.4, midi(91), 0.03, 0.9));
      keep(bell(dest, t + 1.55, midi(100), 0.014, 0.5));
    });
  }

  /** Band-passed air that sweeps f0 -> f1 (over `up`) -> f2 (over `down`). */
  function whoosh(dest, t, f0, f1, f2, up, down, peak, q, buf) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + up);
    g.gain.setTargetAtTime(0, t + up, down / 3);
    const tEnd = t + up + down * 2.4 + 0.05;
    const src = noise(buf || pinkBuf, t, tEnd, 1.2);
    const bp = filt("bandpass", f0, q);
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + up);
    bp.frequency.exponentialRampToValueAtTime(f2, t + up + down);
    src.connect(bp);
    bp.connect(g);
    g.connect(dest);
    return tEnd;
  }

  function trickWhoosh(kind = 0) {
    if (!ready()) return;
    const kd = (+kind | 0) & 3;
    const dest = out(rnd(-0.1, 0.1), 0.1);
    one(dest, (t, keep) => {
      if (kd === 0) {
        // spin: two quick rounds
        keep(whoosh(dest, t, 500, 1900, 700, 0.1, 0.1, 0.34, 1.6));
        keep(whoosh(dest, t + 0.19, 600, 2300, 800, 0.1, 0.12, 0.3, 1.6));
        keep(thump(dest, t, 260, 520, 0.36, 0.05, 0.05, 0.1));
      } else if (kd === 1) {
        // backflip: a long arc up and over
        keep(whoosh(dest, t, 320, 2400, 420, 0.22, 0.24, 0.4, 1.3));
        keep(thump(dest, t, 200, 640, 0.24, 0.04, 0.07, 0.09));
        keep(thump(dest, t + 0.24, 640, 240, 0.22, 0.03, 0.05, 0.08));
      } else if (kd === 2) {
        // roll: low and round, with a soft tumble
        keep(whoosh(dest, t, 240, 900, 300, 0.14, 0.2, 0.4, 1.1));
        keep(fabricRustle(dest, t + 0.03, 0.3, 2400, 1, 0.05, 4));
        keep(thump(dest, t + 0.05, 130, 75, 0.14, 0.02, 0.16, 0.06));
      } else {
        // twirl leap: bright, rising, with a glint at the top
        keep(whoosh(dest, t, 500, 3600, 1500, 0.3, 0.2, 0.34, 1.8));
        keep(whoosh(dest, t + 0.04, 1500, 6000, 3000, 0.28, 0.2, 0.06, 1.2, whiteBuf));
        keep(thump(dest, t, 300, 1200, 0.32, 0.05, 0.06, 0.1));
        keep(bell(dest, t + 0.3, 2637.02, 0.035, 0.25));
        keep(bell(dest, t + 0.36, 3520, 0.025, 0.25));
      }
    });
  }

  function trickLand(good = true) {
    if (!ready()) return;
    const dest = out(0, 0.14);
    one(dest, (t, keep) => {
      keep(thump(dest, t, 135, 58, 0.09, 0.006, good ? 0.4 : 0.3, 0.06));
      keep(burst(dest, t, {
        buf: pinkBuf, type: "lowpass", q: 0.5, hp: 120, f0: 1700, f1: 380, sweep: 0.1,
        attack: 0.008, peak: 0.3, tc: 0.045,
      }));
      if (good) {
        keep(pluck(dest, t + 0.02, midi(79), 0.085, 0.22, 0.4));
        keep(pluck(dest, t + 0.1, midi(84), 0.09, 0.32, 0.4));
        keep(bell(dest, t + 0.1, midi(96), 0.02, 0.2));
      } else {
        // a small rubbery stumble, never a buzzer
        keep(tone(dest, t + 0.03, "triangle", 233, 185, 0.16, 0.1, 0.015, 0.05));
        keep(fabricRustle(dest, t + 0.02, 0.18, 2600, 1, 0.05, 3));
      }
    });
  }

  const PENTA = [0, 2, 4, 7, 9];

  function comboUp(n = 1) {
    if (!ready()) return;
    const c = clamp(Math.round(+n || 0), 0, 24);
    const deg = Math.min(c, 14);
    const noteAt = (d) => 72 + PENTA[d % 5] + 12 * ((d / 5) | 0);
    const dest = out(0, 0.22);
    one(dest, (t, keep) => {
      const count = c >= 16 ? 4 : c >= 8 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const f = midi(noteAt(deg + i));
        keep(pluck(dest, t + i * 0.055, f, 0.085, 0.16 + i * 0.05, 0.45));
        keep(bell(dest, t + i * 0.055, f * 2, 0.018, 0.12));
      }
      if (c >= 8) keep(crackle(dest, t + 0.1, 0.35, 6500, 0.016, 0.14, false));
    });
  }

  // ---- crowd --------------------------------------------------------------------

  /** Dense random grains under a rise/fall shape: many hands clapping. */
  function clapCurve(peak, rise) {
    const n = 512;
    const c = new Float32Array(n);
    let v = 0;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const shape = k < rise ? k / rise : Math.pow(1 - (k - rise) / (1 - rise), 1.6);
      if (Math.random() < 0.5) v = rnd(0.5, 1);
      c[i] = (0.22 + 0.78 * v) * shape * peak;
      v *= 0.6;
    }
    c[0] = 0;
    c[n - 1] = 0;
    return c;
  }

  function applause(dest, t, dur, peak, rise) {
    for (let i = 0; i < 2; i++) {
      const src = noise(whiteBuf, t, t + dur + 0.05, rnd(0.8, 1.2));
      const bp = filt("bandpass", i ? 2700 : 1500, 0.8);
      const lp = filt("lowpass", 6500, 0.5);
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setValueCurveAtTime(clapCurve(peak * (i ? 0.7 : 1), rise), t, dur);
      src.connect(bp);
      bp.connect(lp);
      lp.connect(g);
      g.connect(dest);
    }
    return t + dur + 0.06;
  }

  /** The body of a crowd: roiling formant-ish noise with a swell. */
  function crowdWash(dest, t, dur, peak, rise, tc, bright) {
    const g = ctx.createGain();
    const tEnd = swell(g.gain, t, rise, peak, t + dur, tc);
    const src = noise(pinkBuf, t, tEnd, rnd(0.9, 1.1));
    const a = filt("bandpass", 650, 0.5);
    const b = filt("bandpass", 1500 * bright, 0.7);
    const gb = ctx.createGain();
    gb.gain.value = 0.6;
    const trem = ctx.createGain();
    trem.gain.value = 0.8;
    const l = osc("sine", rnd(3, 5), t, tEnd);
    const lg = ctx.createGain();
    lg.gain.value = 0.2;
    l.connect(lg);
    lg.connect(trem.gain);
    src.connect(a);
    src.connect(b);
    a.connect(trem);
    b.connect(gb);
    gb.connect(trem);
    trem.connect(g);
    g.connect(dest);
    return tEnd;
  }

  function crowd(kind, intensity = 0.6, muffled = true) {
    if (!ready()) return;
    const v = clamp(+intensity || 0, 0, 1);
    const a = 0.35 + 0.65 * v;
    const dest = wOut(rnd(-0.1, 0.1), muffled ? 0.1 : 0.28, muffled ? 0.55 : 1);
    let d = dest;
    if (muffled) {
      // behind thick glass / across the arena: only the body of the sound gets through
      d = filt("lowpass", 780, 0.5);
      d.connect(dest);
    }
    // two sides of the stands
    let dl = d;
    let dr = d;
    if (ctx.createStereoPanner) {
      dl = ctx.createStereoPanner();
      dl.pan.value = -0.55;
      dl.connect(d);
      dr = ctx.createStereoPanner();
      dr.pan.value = 0.55;
      dr.connect(d);
    }
    const side = () => (Math.random() < 0.5 ? dl : dr);
    const voiceF = () => pick([rnd(150, 230), rnd(230, 340), rnd(300, 460), rnd(380, 520)]);
    one(dest, (t, keep) => {
      if (kind === "clap") {
        keep(applause(d, t, 2 + 1.6 * v, 0.17 * a, 0.12));
        if (v > 0.6) {
          for (let i = 0; i < 3; i++) {
            const f = voiceF() * 1.2;
            keep(vox(side(), t + rnd(0.2, 1.2), f, f * 1.5, rnd(0.3, 0.5), 0.14 * a, VOWELS[2], 6, 0.02));
          }
        }
      } else if (kind === "cheer") {
        keep(crowdWash(d, t, 1.2 + v, 0.34 * a, 0.18, 0.4, 1.15));
        const n = 5 + ((v * 5) | 0);
        for (let i = 0; i < n; i++) {
          const f = voiceF() * 1.15;
          keep(vox(side(), t + rnd(0, 0.4), f, f * rnd(1.2, 1.45), rnd(0.5, 0.9), rnd(0.12, 0.24) * a,
            pick([VOWELS[0], VOWELS[3], VOWELS[5]]), rnd(5, 7), 0.02));
        }
        keep(applause(d, t + 0.25, 1.8 + 1.4 * v, 0.12 * a, 0.2));
      } else if (kind === "roar") {
        keep(crowdWash(d, t, 2.3 + 1.3 * v, 0.5 * a, 0.3, 0.7, 1));
        keep(crowdWash(d, t + 0.1, 2 + v, 0.22 * a, 0.5, 0.6, 1.5));
        const n = 8 + ((v * 5) | 0);
        for (let i = 0; i < n; i++) {
          const f = voiceF() * 1.1;
          keep(vox(side(), t + rnd(0, 1.3), f, f * rnd(1.15, 1.5), rnd(0.6, 1.2), rnd(0.12, 0.22) * a,
            pick([VOWELS[0], VOWELS[5], VOWELS[3]]), rnd(5, 7), 0.025));
        }
        keep(applause(d, t + 0.3, 3 + 1.5 * v, 0.15 * a, 0.25));
        // feet on the stands
        keep(thump(d, t + 0.05, 95, 48, 0.25, 0.02, 0.3 * a, 0.2));
      } else if (kind === "laugh") {
        const n = 5 + ((v * 4) | 0);
        for (let i = 0; i < n; i++) {
          const f = voiceF() * 1.2;
          const t0 = t + rnd(0, 0.4);
          const gap = rnd(0.14, 0.19);
          const syl = 3 + ((Math.random() * 3) | 0);
          const sd = side();
          for (let j = 0; j < syl; j++) {
            const fj = f * (1 - j * 0.06);
            keep(vox(sd, t0 + j * gap, fj * 1.08, fj * 0.9, 0.1, rnd(0.14, 0.24) * a * (1 - j * 0.1), VOWELS[0]));
          }
        }
        keep(crowdWash(d, t, 0.7, 0.1 * a, 0.25, 0.3, 1.2));
      } else if (kind === "gasp") {
        // one sharp shared breath in
        keep(burst(d, t, {
          buf: pinkBuf, type: "bandpass", q: 1.2, f0: 520, f1: 2700, sweep: 0.3,
          attack: 0.22, peak: 0.42 * a, tc: 0.06,
        }));
        keep(burst(d, t, {
          buf: whiteBuf, type: "bandpass", q: 0.8, f0: 1800, f1: 4200, sweep: 0.3,
          attack: 0.24, peak: 0.08 * a, tc: 0.05,
        }));
        const n = 3 + ((v * 4) | 0);
        for (let i = 0; i < n; i++) {
          const f = voiceF() * 1.3;
          keep(vox(side(), t + rnd(0.02, 0.14), f, f * 1.45, 0.22, 0.1 * a, VOWELS[4]));
        }
      } else {
        // "ooh": a soft rising, rounded wonder
        const n = 5 + ((v * 5) | 0);
        for (let i = 0; i < n; i++) {
          const f = voiceF();
          keep(vox(side(), t + rnd(0, 0.22), f * 0.92, f * rnd(1.15, 1.3), rnd(0.8, 1.2), rnd(0.16, 0.26) * a,
            pick([VOWELS[1], VOWELS[2]]), rnd(4.5, 6), 0.015));
        }
        keep(crowdWash(d, t, 0.8, 0.09 * a, 0.4, 0.35, 0.8));
      }
    });
  }

  function buildCrowdBed(L, t) {
    loopOut(L, wBus, wVerb, 0.2);
    // murmur: always there
    const mur = bed(L, t, pinkBuf, "bandpass", 480, 0.6, 0.075, null, 0.75);
    lfo(L, t, 0.17, 110, mur.f.frequency);
    lfo(L, t, 0.31, 0.022, mur.g.gain);
    const mur2 = bed(L, t, pinkBuf, "bandpass", 1150, 0.9, 0.024, null, 1.1);
    lfo(L, t, 0.23, 0.009, mur2.g.gain);
    // roar: opens up with the level
    const roarG = ctx.createGain();
    roarG.gain.value = 0;
    roarG.connect(L.gain);
    const r1 = bed(L, t, pinkBuf, "bandpass", 800, 0.4, 0.24, roarG, 1);
    lfo(L, t, 0.19, 220, r1.f.frequency);
    lfo(L, t, 3.7, 0.035, r1.g.gain);
    bed(L, t, whiteBuf, "bandpass", 2300, 0.6, 0.045, roarG, 0.9);
    // applause wash: noise whose level is itself driven by slow noise, so it sparkles like hands
    const clapG = ctx.createGain();
    clapG.gain.value = 0;
    clapG.connect(L.gain);
    const cl = bed(L, t, whiteBuf, "bandpass", 1900, 0.7, 0, clapG, 1.15);
    const mod = noise(whiteBuf, t, t + 1e6, 0.6);
    const modLP = filt("lowpass", 28, 0.5);
    const modG = ctx.createGain();
    modG.gain.value = 30;
    mod.connect(modLP);
    modLP.connect(modG);
    modG.connect(cl.g.gain);
    L.nodes.push(mod);
    L.level = 0;
    L.set = (level, tt) => {
      L.level = level;
      L.gain.gain.cancelScheduledValues(tt);
      L.gain.gain.setTargetAtTime(0.4 + 0.6 * level, tt, 0.25);
      roarG.gain.setTargetAtTime(Math.pow(level, 1.7), tt, 0.3);
      clapG.gain.setTargetAtTime(0.07 * clamp((level - 0.4) / 0.6, 0, 1), tt, 0.3);
    };
    let next = t + 0.5;
    every(L, 500, (now) => {
      if (next < now) next = now + 0.05;
      while (next < now + 1.0) {
        // whoops and whistles from the stands when it gets exciting
        if (L.level > 0.45 && Math.random() < L.level) {
          const dst = outTo(L.gain, wVerb, rnd(-0.8, 0.8), 0.2, 1);
          let e;
          if (Math.random() < 0.3) {
            e = tone(dst, next, "sine", rnd(1500, 1900), rnd(2300, 2900), rnd(0.25, 0.4), 0.012 * L.level, 0.05, 0.05);
          } else {
            const f = rnd(260, 520);
            e = vox(dst, next, f, f * rnd(1.3, 1.6), rnd(0.3, 0.6), rnd(0.05, 0.11) * L.level,
              pick([VOWELS[2], VOWELS[0]]), 6, 0.02);
          }
          release(dst, e + 0.15);
        }
        next += rnd(0.3, 1.2);
      }
    });
  }

  function crowdBed(level) {
    setLoop("crowdBed", level, buildCrowdBed, 0.8);
  }

  function buildPanic(L, t) {
    // stylised: hurried feet and short worried calls ("hey!", "whoa!", "go, go!"), never screams
    const lp = filt("lowpass", 2400, 0.5);
    L.gain.connect(lp);
    lp.connect(wBus);
    const s = ctx.createGain();
    s.gain.value = 0.22;
    lp.connect(s);
    s.connect(wVerb);
    L.scale = 0.8;
    const mur = bed(L, t, pinkBuf, "bandpass", 600, 0.5, 0.06, null, 0.9);
    lfo(L, t, 0.9, 0.022, mur.g.gain);
    lfo(L, t, 0.37, 200, mur.f.frequency);
    let nextStep = t + 0.05;
    let nextShout = t + 0.25;
    every(L, 300, (now) => {
      if (nextStep < now) nextStep = now + 0.03;
      while (nextStep < now + 0.8) {
        const p = rnd(0.04, 0.11);
        thump(L.gain, nextStep, rnd(110, 170), 62, 0.05, 0.004, p, 0.028);
        burst(L.gain, nextStep, {
          buf: pinkBuf, type: "bandpass", q: 1, f0: rnd(700, 1300), attack: 0.003, peak: p * 0.7, tc: 0.012,
        });
        nextStep += rnd(0.07, 0.2);
      }
      if (nextShout < now) nextShout = now + 0.05;
      while (nextShout < now + 0.8) {
        const dst = outTo(L.gain, null, rnd(-0.8, 0.8), 0, 1);
        const f = rnd(250, 500);
        const p = rnd(0.09, 0.2);
        const kd = (Math.random() * 3) | 0;
        let e;
        if (kd === 0) {
          e = vox(dst, nextShout, f, f * 1.22, 0.22, p, VOWELS[3]);
        } else if (kd === 1) {
          e = vox(dst, nextShout, f * 1.2, f * 0.82, 0.42, p, VOWELS[1], 6, 0.03);
        } else {
          vox(dst, nextShout, f * 1.05, f, 0.13, p, VOWELS[1]);
          e = vox(dst, nextShout + 0.19, f * 1.1, f * 1.02, 0.15, p, VOWELS[1]);
        }
        release(dst, e + 0.15);
        nextShout += rnd(0.35, 1.1);
      }
    });
  }

  function panic(on) {
    setLoop("panic", on ? 1 : 0, buildPanic, 0.7);
  }

  // ---- the show -----------------------------------------------------------------

  // C  G  Am  F, eight bars (bar 8 turns F -> G to come home); 16 steps to the bar.
  const SHOW_BASS = [36, 43, 45, 41];
  const SHOW_TRI = [[60, 64, 67], [59, 62, 67], [60, 64, 69], [60, 65, 69]];
  const BASS_PAT = [0, -1, 0, 12, -1, 0, 7, 12];
  // the hook: [bar, beat, midi, beats]
  const SHOW_LEAD_SRC = [
    [0, 0, 76, 0.5], [0, 0.5, 76, 0.25], [0, 0.75, 79, 0.75], [0, 1.5, 84, 0.5], [0, 2, 79, 1], [0, 3, 76, 0.5], [0, 3.5, 74, 0.5],
    [1, 0, 74, 0.5], [1, 0.5, 74, 0.25], [1, 0.75, 79, 0.75], [1, 1.5, 83, 0.5], [1, 2, 79, 1.5],
    [2, 0, 72, 0.5], [2, 0.5, 72, 0.25], [2, 0.75, 76, 0.75], [2, 1.5, 81, 0.5], [2, 2, 76, 1], [2, 3, 72, 0.5], [2, 3.5, 74, 0.5],
    [3, 0, 77, 0.75], [3, 0.75, 81, 0.75], [3, 1.5, 84, 0.5], [3, 2, 81, 0.5], [3, 2.5, 79, 0.5], [3, 3, 77, 0.5], [3, 3.5, 79, 0.5],
    [4, 0, 84, 0.5], [4, 0.5, 84, 0.25], [4, 0.75, 79, 0.75], [4, 1.5, 76, 0.5], [4, 2, 79, 1], [4, 3, 84, 0.5], [4, 3.5, 86, 0.5],
    [5, 0, 86, 0.5], [5, 0.5, 86, 0.25], [5, 0.75, 83, 0.75], [5, 1.5, 79, 0.5], [5, 2, 83, 1.5],
    [6, 0, 88, 0.5], [6, 0.5, 86, 0.5], [6, 1, 84, 0.5], [6, 1.5, 81, 0.5], [6, 2, 84, 0.5], [6, 2.5, 81, 0.5], [6, 3, 79, 0.5], [6, 3.5, 76, 0.5],
    [7, 0, 77, 0.5], [7, 0.5, 81, 0.5], [7, 1, 84, 1], [7, 2, 83, 0.5], [7, 2.5, 79, 0.5], [7, 3, 86, 0.75],
  ];
  const SHOW_LEAD = new Array(128).fill(null);
  for (let i = 0; i < SHOW_LEAD_SRC.length; i++) {
    const e = SHOW_LEAD_SRC[i];
    SHOW_LEAD[e[0] * 16 + Math.round(e[1] * 4)] = e;
  }
  const LAYER_THR = [0.08, 0.25, 0.45, 0.7]; // bass, chords, lead, sparkle (drums always play)

  let M = null;          // the running show music
  let musicBpm = 112;
  let musicInt = 0;

  const showChord = (bar, s) => (bar === 7 && s >= 8 ? 1 : bar & 3);
  const layerLevel = (i) => {
    const k = clamp((musicInt - (LAYER_THR[i] - 0.06)) / 0.14, 0, 1);
    return k * k * (3 - 2 * k);
  };

  function mKick(d, t, peak) {
    thump(d, t, 170, 47, 0.1, 0.003, peak, 0.075);
    thump(d, t, 340, 95, 0.05, 0.002, peak * 0.22, 0.02);
    burst(d, t, { buf: pinkBuf, type: "lowpass", q: 0.5, f0: 3000, f1: 500, sweep: 0.02, attack: 0.002, peak: peak * 0.25, tc: 0.008 });
  }

  function mSnare(d, t, peak, clap) {
    thump(d, t, 235, 165, 0.05, 0.003, peak * 0.6, 0.04);
    burst(d, t, { buf: whiteBuf, type: "bandpass", q: 0.6, hp: 900, f0: 2300, attack: 0.002, peak, tc: 0.05 });
    if (clap) {
      burst(d, t + 0.011, { buf: whiteBuf, type: "bandpass", q: 1.3, f0: 1500, attack: 0.002, peak: peak * 0.6, tc: 0.012 });
      burst(d, t + 0.023, { buf: whiteBuf, type: "bandpass", q: 1.3, f0: 1700, attack: 0.002, peak: peak * 0.7, tc: 0.05 });
    }
  }

  function mHat(d, t, peak, tc) {
    burst(d, t, { buf: whiteBuf, type: "highpass", q: 0.7, f0: 7600, attack: 0.002, peak, tc });
  }

  function mBass(d, t, f, dur, peak) {
    const g = ctx.createGain();
    const tEnd = swell(g.gain, t, 0.008, peak, t + dur, 0.03);
    const a = osc("sawtooth", f, t, tEnd);
    const b = osc("sine", f, t, tEnd);
    const c = osc("triangle", f * 2, t, tEnd); // keeps the line audible on small speakers
    const gc = ctx.createGain();
    gc.gain.value = 0.5;
    const ga = ctx.createGain();
    ga.gain.value = 0.55;
    const lp = filt("lowpass", f * 9, 2);
    lp.frequency.setValueAtTime(f * 9, t);
    lp.frequency.setTargetAtTime(f * 3.2, t, 0.07);
    a.connect(ga);
    ga.connect(lp);
    c.connect(gc);
    gc.connect(lp);
    lp.connect(g);
    b.connect(g);
    g.connect(d);
  }

  function mStab(d, t, tri, peak, cut) {
    const g = ctx.createGain();
    const tEnd = env(g.gain, t, 0.006, peak, 0.075);
    const lp = filt("lowpass", cut, 1.2);
    lp.frequency.setValueAtTime(cut, t);
    lp.frequency.setTargetAtTime(cut * 0.45, t, 0.09);
    for (let i = 0; i < 3; i++) {
      const o = osc("sawtooth", midi(tri[i]), t, tEnd);
      o.detune.value = i * 7 - 7;
      o.connect(lp);
    }
    lp.connect(g);
    g.connect(d);
  }

  function mLead(d, t, f, dur, peak, octave) {
    const g = ctx.createGain();
    const tEnd = swell(g.gain, t, 0.012, peak, t + dur * 0.82, 0.045);
    const a = osc("triangle", f, t, tEnd);
    const b = osc("square", f, t, tEnd);
    b.detune.value = 6;
    const gb = ctx.createGain();
    gb.gain.value = 0.22;
    const lp = filt("lowpass", Math.min(5200, f * 4.5), 0.7);
    // vibrato that blooms on held notes
    const v = osc("sine", 5.6, t, tEnd);
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.setTargetAtTime(f * 0.007, t + 0.16, 0.12);
    v.connect(vg);
    vg.connect(a.frequency);
    vg.connect(b.frequency);
    a.connect(g);
    b.connect(gb);
    gb.connect(lp);
    lp.connect(g);
    if (octave) {
      const o = osc("sine", f * 2, t, tEnd);
      const go = ctx.createGain();
      go.gain.value = 0.3;
      o.connect(go);
      go.connect(g);
    }
    g.connect(d);
  }

  function musicStep(n, t) {
    const m = M;
    const I = musicInt;
    const s = n & 15;
    const bar = (n >> 4) & 7;
    const ch = showChord(bar, s);
    const tri = SHOW_TRI[ch];
    const bs = m.beatSec;

    // drums: four on the floor so the beat is always easy to feel
    if ((s & 3) === 0) mKick(m.gDrum, t, s === 0 ? 0.5 : 0.44);
    if (s === 4 || s === 12) mSnare(m.gDrum, t, 0.15 + 0.07 * I, I > 0.4);
    if ((s & 1) === 0) {
      const off = (s & 3) === 2;
      mHat(m.gDrum, t, off ? 0.05 : 0.026, off && I > 0.55 ? 0.05 : 0.013);
    } else if (I > 0.6) {
      mHat(m.gDrum, t, 0.016, 0.009);
    }
    if (bar === 7 && s >= 12 && I > 0.2) mSnare(m.gDrum, t, 0.07 + 0.03 * (s - 12), false); // fill
    if (bar === 3 && s === 14 && I > 0.5) mSnare(m.gDrum, t, 0.1, false);
    if ((bar === 0 || (bar === 4 && I > 0.8)) && s === 0 && I > 0.5) {
      burst(m.gDrum, t, { buf: whiteBuf, type: "highpass", q: 0.5, f0: 5200, attack: 0.004, peak: 0.07, tc: 0.35 });
    }

    // bass: bouncing octaves
    if (I > LAYER_THR[0] - 0.1 && (s & 1) === 0) {
      const off = BASS_PAT[s >> 1];
      if (off >= 0) mBass(m.gBass, t, midi(SHOW_BASS[ch] + off), bs * 0.42, off === 0 ? 0.26 : 0.2);
    }

    // chords: a soft pad per chord + bright off-beat stabs
    if (I > LAYER_THR[1] - 0.1) {
      if (s === 0 || (bar === 7 && s === 8)) {
        const len = bar === 7 ? 2 : 4;
        pad(m.gChord, t, [midi(tri[0]), midi(tri[1]), midi(tri[2])], bs * len * 0.9, 0.035, 0.06, 0.12, 1500 + 1200 * I);
      }
      if ((s & 3) === 2) mStab(m.gChord, t, tri, 0.05, 1500 + 2200 * I);
      if (I > 0.6 && (s === 7 || s === 15)) mStab(m.gChord, t, tri, 0.03, 1400 + 2000 * I);
    }

    // lead: the hook
    if (I > LAYER_THR[2] - 0.1) {
      const e = SHOW_LEAD[bar * 16 + s];
      if (e) mLead(m.gLead, t, midi(e[2]), e[3] * bs, 0.085, I > 0.85);
    }

    // sparkle: glassy arpeggios on top
    if (I > LAYER_THR[3] - 0.1) {
      if ((s & 1) === 0) {
        const k = s >> 1;
        bell(m.gSpark, t, midi(tri[(k * 2) % 3] + 24 + (k & 4 ? 12 : 0)), 0.026, 0.11);
      } else if (I > 0.9) {
        bell(m.gSpark, t, midi(tri[s % 3] + 36), 0.012, 0.07);
      }
      if (s === 0 && (bar & 1) === 0) crackle(m.gSpark, t, bs * 2, 6500, 0.014, 0.12, false);
    }
  }

  function musicTick() {
    const m = M;
    if (!m || m.dead || !m.audio || !ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const s16 = m.beatSec / 4;
    // after a stall (hidden tab) jump to the present instead of machine-gunning the backlog
    const minN = Math.ceil((now + 0.02 - m.t0) / s16);
    let n = m.next < minN ? minN : m.next;
    for (let guard = 0; guard < 64 && m.t0 + n * s16 < now + 0.45; guard++, n++) {
      musicStep(n, m.t0 + n * s16);
    }
    m.next = n;
  }

  function musicLevels(t, tc) {
    if (!M || !M.audio) return;
    M.gDrum.gain.setTargetAtTime(0.78 + 0.22 * musicInt, t, tc);
    M.gBass.gain.setTargetAtTime(layerLevel(0), t, tc);
    M.gChord.gain.setTargetAtTime(layerLevel(1), t, tc);
    M.gLead.gain.setTargetAtTime(layerLevel(2) * (0.85 + 0.15 * musicInt), t, tc);
    M.gSpark.gain.setTargetAtTime(layerLevel(3), t, tc);
  }

  function musicHalt(fade) {
    const m = M;
    if (!m || m.dead) return;
    if (m.timer) clearInterval(m.timer);
    m.timer = 0;
    if (!m.audio || !ctx || ctx.state === "closed") { M = null; return; }
    const t = ctx.currentTime;
    const f = Math.max(0.05, +fade || 0);
    m.dead = true;
    m.tEnd = t + f;
    m.out.gain.cancelScheduledValues(t);
    m.out.gain.setTargetAtTime(0, t, f / 3.5);
    release(m.out, t + f * 2 + 2.5);
    release(m.wet, t + f * 2 + 2.5);
  }

  function wallNow() {
    return globalThis.performance && performance.now ? performance.now() / 1000 : Date.now() / 1000;
  }

  function musicStart(bpm = 112) {
    musicBpm = clamp(+bpm || 112, 40, 240);
    if (M) { musicHalt(0.12); M = null; }
    const beatSec = 60 / musicBpm;
    if (!ctx || ctx.state === "closed") {
      // no audio available: keep the beat clock alive on the wall clock so the show can still be played
      M = { audio: false, wall: wallNow() + 0.15, beatSec };
      return;
    }
    const t = ctx.currentTime;
    const m = {
      audio: true, dead: false, tEnd: 0, beatSec, t0: t + 0.15, next: 0, timer: 0,
      lat: clamp(+ctx.outputLatency || 0, 0, 0.3),
      out: ctx.createGain(), wet: ctx.createGain(),
      gDrum: ctx.createGain(), gBass: ctx.createGain(), gChord: ctx.createGain(),
      gLead: ctx.createGain(), gSpark: ctx.createGain(),
    };
    m.out.gain.value = 0.85;
    m.out.connect(bus);
    m.wet.gain.value = 0.2;
    m.wet.connect(verbIn);
    m.out.connect(m.wet);
    const layers = [m.gDrum, m.gBass, m.gChord, m.gLead, m.gSpark];
    for (let i = 0; i < layers.length; i++) {
      layers[i].gain.value = 0;
      layers[i].connect(m.out);
    }
    M = m;
    musicLevels(t, 0.01);
    m.timer = setInterval(musicTick, 110);
    musicTick();
  }

  function musicStop(fadeSeconds = 1) {
    musicHalt(fadeSeconds);
  }

  function musicSetIntensity(v) {
    musicInt = clamp(+v || 0, 0, 1);
    if (M && M.audio && !M.dead && ctx) musicLevels(ctx.currentTime, 0.22);
  }

  function musicTime() {
    const m = M;
    if (!m) return 0;
    if (!m.audio) return Math.max(0, wallNow() - m.wall);
    if (!ctx) return 0;
    if (m.dead && ctx.currentTime > m.tEnd) { M = null; return 0; }
    return Math.max(0, ctx.currentTime - m.lat - m.t0);
  }

  function musicSting(kind) {
    if (!ready()) return;
    // in key: use the chord that is sounding right now
    const n16 = Math.floor((musicTime() / (60 / musicBpm)) * 4);
    const ch = M ? showChord((n16 >> 4) & 7, n16 & 15) : 0;
    const tri = SHOW_TRI[ch];
    const dest = out(0, 0.2);
    one(dest, (t, keep) => {
      if (kind === "perfect") {
        const n = [tri[0] + 24, tri[1] + 24, tri[2] + 24, tri[0] + 36];
        for (let i = 0; i < 4; i++) {
          keep(pluck(dest, t + i * 0.042, midi(n[i]), 0.085, 0.16 + i * 0.05, 0.45));
          keep(bell(dest, t + i * 0.042, midi(n[i]), 0.03, 0.14 + i * 0.04));
        }
        keep(crackle(dest, t + 0.08, 0.4, 6500, 0.02, 0.15, false));
      } else if (kind === "good") {
        keep(pluck(dest, t, midi(tri[0] + 24), 0.08, 0.16, 0.4));
        keep(pluck(dest, t + 0.05, midi(tri[2] + 24), 0.08, 0.22, 0.4));
        keep(bell(dest, t + 0.05, midi(tri[2] + 24), 0.02, 0.14));
      } else {
        // miss: a soft muted "bup" on the root, sagging a little; never a buzzer
        const f = midi(SHOW_BASS[ch] + 24);
        const lp = filt("lowpass", 900, 0.6);
        lp.connect(dest);
        keep(tone(lp, t, "triangle", f, f * 0.9, 0.14, 0.13, 0.008, 0.045));
        keep(burst(dest, t, {
          buf: pinkBuf, type: "bandpass", q: 1, f0: 700, f1: 400, sweep: 0.06,
          attack: 0.004, peak: 0.07, tc: 0.02,
        }));
      }
    });
  }

  const showMusic = {
    start: musicStart,
    stop: musicStop,
    setIntensity: musicSetIntensity,
    time: musicTime,
    beat: () => musicTime() * (musicBpm / 60),
    sting: musicSting,
    get bpm() { return musicBpm; },
  };

  function buildPreShow(L, t) {
    loopOut(L, bus, verbIn, 0.4);
    L.scale = 0.8;
    const far = t + 1e6;
    // tense drone: an open D fifth that beats slowly, with a faint minor second high above
    const lp = filt("lowpass", 520, 0.6);
    const dg = ctx.createGain();
    dg.gain.value = 0.085;
    lp.connect(dg);
    dg.connect(L.gain);
    const fr = [73.42, 73.42 * 1.005, 110, 146.83 * 0.997, 220.4];
    const am = [1, 0.8, 0.7, 0.5, 0.2];
    for (let i = 0; i < fr.length; i++) {
      const o = osc(i === 1 ? "triangle" : "sine", fr[i], t, far);
      const g = ctx.createGain();
      g.gain.value = am[i];
      o.connect(g);
      g.connect(lp);
      L.nodes.push(o);
    }
    lfo(L, t, 0.08, 180, lp.frequency);
    lfo(L, t, 0.13, 0.02, dg.gain);
    const hi = osc("sine", 622.25, t, far);
    const hg = ctx.createGain();
    hg.gain.value = 0.006;
    hi.connect(hg);
    hg.connect(L.gain);
    L.nodes.push(hi);
    lfo(L, t, 0.21, 0.005, hg.gain);
    // the crowd, far away through the tunnel
    const cr = bed(L, t, pinkBuf, "bandpass", 460, 0.6, 0.085, null, 0.8);
    const clp = filt("lowpass", 650, 0.5);
    cr.g.disconnect();
    cr.g.connect(clp);
    clp.connect(L.gain);
    lfo(L, t, 0.11, 0.03, cr.g.gain);
    lfo(L, t, 0.29, 100, cr.f.frequency);
    // a slow soft pulse, like a heart before going on
    let next = t + 0.6;
    every(L, 500, (now) => {
      if (next < now) next = now + 0.05;
      while (next < now + 1.0) {
        thump(L.gain, next, 82, 52, 0.12, 0.015, 0.16, 0.09);
        thump(L.gain, next + 0.27, 74, 48, 0.12, 0.015, 0.1, 0.08);
        next += 2.14;
      }
    });
  }

  function preShow(on) {
    setLoop("preShow", on ? 1 : 0, buildPreShow, 1.2);
  }

  function afterShow() {
    if (!ready()) return;
    const dest = out(0, 0.4);
    one(dest, (t, keep) => {
      // F -> G -> C: the curtain coming down, warm and unhurried
      keep(pad(dest, t, [midi(41), midi(53), midi(57), midi(60), midi(65)], 0.85, 0.075, 0.25, 0.25, 1600));
      keep(pad(dest, t + 0.9, [midi(43), midi(55), midi(59), midi(62), midi(67)], 0.85, 0.075, 0.2, 0.25, 1800));
      keep(pad(dest, t + 1.8, [midi(36), midi(48), midi(55), midi(60), midi(64), midi(67)], 2.2, 0.085, 0.25, 0.9, 1900));
      const mel = [[0, 81], [0.45, 84], [0.9, 83], [1.35, 86], [1.8, 88], [2.25, 91], [2.8, 96]];
      for (let i = 0; i < mel.length; i++) {
        keep(pluck(dest, t + mel[i][0], midi(mel[i][1]), 0.095, i > 3 ? 1.3 : 0.6, 0.35));
      }
      keep(thump(dest, t + 1.8, 120, 62, 0.14, 0.008, 0.3, 0.16));
      keep(bell(dest, t + 2.8, midi(96), 0.03, 0.9));
    });
  }

  // ---- story --------------------------------------------------------------------

  // music box in 3/4: [beat, midi, peak, kind]  kind 0 melody, 1 bass, 2 inner voice
  const LULL = [
    [0, 48, 0.06, 1], [0, 76, 0.075, 0], [1, 55, 0.03, 2], [2, 79, 0.065, 0],
    [3, 52, 0.055, 1], [3, 76, 0.07, 0], [4, 55, 0.03, 2], [5, 72, 0.06, 0],
    [6, 53, 0.06, 1], [6, 74, 0.07, 0], [7, 57, 0.03, 2], [8, 77, 0.065, 0],
    [9, 55, 0.055, 1], [9, 74, 0.07, 0], [10, 59, 0.03, 2], [11, 71, 0.06, 0],
    [12, 57, 0.06, 1], [12, 72, 0.07, 0], [13, 60, 0.03, 2], [14, 76, 0.065, 0],
    [15, 53, 0.055, 1], [15, 81, 0.075, 0], [16, 57, 0.03, 2], [17, 79, 0.065, 0],
    [18, 55, 0.06, 1], [18, 77, 0.07, 0], [19, 76, 0.06, 0], [20, 74, 0.06, 0],
    [21, 48, 0.06, 1], [21, 72, 0.075, 0], [22, 67, 0.035, 2], [23, 64, 0.03, 2],
  ];

  function buildLullaby(L, t) {
    loopOut(L, bus, verbIn, 0.55);
    L.scale = 0.9;
    runSeq(L, t + 0.15, 0.62, 24, LULL, (te, ev) => {
      const f = midi(ev[1]);
      if (ev[3] === 1) {
        pluck(L.gain, te, f, ev[2], 1.3, 0.12);
        pluck(L.gain, te, f * 2, ev[2] * 0.35, 0.9, 0.1);
      } else if (ev[3] === 2) {
        pluck(L.gain, te, f, ev[2], 0.8, 0.15);
      } else {
        // the comb of the music box: a clear tine with a faint glassy overtone
        const tt = te + rnd(0, 0.012);
        pluck(L.gain, tt, f, ev[2] * rnd(0.9, 1), 0.75, 0.3);
        bell(L.gain, tt, f * 2, ev[2] * 0.14, 0.3);
      }
    });
  }

  function lullaby(on) {
    setLoop("lullaby", on ? 1 : 0, buildLullaby, on ? 1.2 : 3);
  }

  function buildAlarm(L, t) {
    loopOut(L, wBus, wVerb, 0.35);
    L.scale = 0.5;
    const far = t + 1e6;
    // a round two-tone wail: triangle + sub through a low-pass, swept by a slow sine
    const lp = filt("lowpass", 1500, 0.6);
    const g = ctx.createGain();
    g.gain.value = 0.17;
    lp.connect(g);
    g.connect(L.gain);
    const a = osc("triangle", 610, t, far);
    const c = osc("triangle", 613, t, far);
    const b = osc("sine", 305, t, far);
    const gc = ctx.createGain();
    gc.gain.value = 0.5;
    const gb = ctx.createGain();
    gb.gain.value = 0.6;
    a.connect(lp);
    c.connect(gc);
    gc.connect(lp);
    b.connect(gb);
    gb.connect(lp);
    const sw = osc("sine", 0.5, t, far);
    const s1 = ctx.createGain();
    s1.gain.value = 95;
    const s2 = ctx.createGain();
    s2.gain.value = 47.5;
    sw.connect(s1);
    sw.connect(s2);
    s1.connect(a.frequency);
    s1.connect(c.frequency);
    s2.connect(b.frequency);
    L.nodes.push(a, b, c, sw);
    lfo(L, t, 0.5, 380, lp.frequency);
    lfo(L, t, 1.0, 0.035, g.gain);
  }

  function alarm(on) {
    setLoop("alarm", on ? 1 : 0, buildAlarm, 0.5);
  }

  function glassShatter(slow = false) {
    if (!ready()) return;
    const k = slow ? 0.45 : 1;
    const span = slow ? 3.6 : 0.55;
    const dest = out(rnd(-0.05, 0.05), slow ? 0.6 : 0.3);
    one(dest, (t, keep) => {
      // the pane giving way
      keep(burst(dest, t, {
        buf: whiteBuf, type: "highpass", q: 0.6, f0: 2200 * k, attack: 0.003, peak: 0.4, tc: slow ? 0.16 : 0.05,
      }));
      keep(burst(dest, t, {
        buf: pinkBuf, type: "lowpass", q: 0.6, f0: 3200 * k, f1: 500 * k, sweep: 0.12 / k,
        attack: 0.004, peak: 0.36, tc: slow ? 0.14 : 0.045,
      }));
      keep(thump(dest, t, 300 * k, 90 * k, 0.08 / k, 0.004, 0.3, slow ? 0.14 : 0.05));
      keep(crackle(dest, t, span * 0.8, 3200 * k, 0.11, slow ? 0.1 : 0.3, false));
      // the shards: a spray of tiny bells, thinning out
      const n = slow ? 36 : 22;
      for (let i = 0; i < n; i++) {
        const ts = t + Math.pow(Math.random(), 1.7) * span;
        keep(bell(dest, ts, rnd(1900, 6200) * k, rnd(0.012, 0.05), slow ? rnd(0.25, 0.7) : rnd(0.03, 0.09)));
      }
      if (slow) {
        // time stretched: a deep bloom underneath and a long glassy shimmer hanging in the air
        keep(thump(dest, t, 72, 30, 1.4, 0.02, 0.5, 0.6));
        keep(thump(dest, t, 144, 60, 0.6, 0.015, 0.16, 0.25));
        const sh = [81, 84, 88, 91, 95, 100];
        for (let i = 0; i < sh.length; i++) {
          keep(bell(dest, t + 0.3 + i * 0.45 + rnd(0, 0.2), midi(sh[i]), 0.022, 1.3));
        }
        keep(burst(dest, t + 0.2, {
          buf: whiteBuf, type: "bandpass", q: 3, f0: 5200, f1: 2600, sweep: 3.5,
          attack: 1.0, peak: 0.03, tc: 0.9,
        }));
      } else {
        // pieces skittering on the floor
        keep(crackle(dest, t + 0.35, 0.6, 4500, 0.04, 0.12, false));
      }
    });
  }

  function setDuck(v, tc) {
    if (!ctx || !duck || ctx.state === "closed") return;
    const t = ctx.currentTime;
    duck.gain.cancelScheduledValues(t);
    duck.gain.setTargetAtTime(v, t, tc);
  }

  function heartDrop() {
    if (!ctx || !duck || ctx.state === "closed") return;
    const now = ctx.currentTime;
    // everything else falls away over 0.4 s
    duck.gain.cancelScheduledValues(now);
    duck.gain.setValueAtTime(duck.gain.value, now);
    duck.gain.linearRampToValueAtTime(0, now + 0.4);
    if (!ready()) return;
    const dest = outTo(storyBus, storyVerb, 0, 0.22);
    one(dest, (t, keep) => {
      // a low heartbeat, slowing, fading ... then nothing
      const at = [0.55, 1.6, 2.85, 4.4];
      const pk = [0.6, 0.5, 0.36, 0.2];
      for (let i = 0; i < at.length; i++) {
        const tb = t + at[i];
        keep(thump(dest, tb, 64, 40, 0.1, 0.014, pk[i], 0.075));
        keep(thump(dest, tb, 128, 72, 0.08, 0.012, pk[i] * 0.3, 0.04));
        keep(thump(dest, tb + 0.25 + i * 0.02, 56, 36, 0.1, 0.014, pk[i] * 0.7, 0.085));
        keep(thump(dest, tb + 0.25 + i * 0.02, 112, 66, 0.08, 0.012, pk[i] * 0.18, 0.04));
      }
    });
  }

  // A minor, very slow: [beat, midi, peak, kind, chord]  kind 0 = a single felt-piano note, 1 = pad
  const SAD = [
    [0, 45, 0.03, 1, [45, 52, 60]], [0, 76, 0.1, 0], [2, 72, 0.08, 0], [3, 71, 0.075, 0], [4, 69, 0.09, 0],
    [8, 41, 0.03, 1, [41, 48, 57]], [8, 74, 0.09, 0], [10, 72, 0.08, 0], [11, 69, 0.075, 0],
    [12, 40, 0.026, 1, [40, 47, 55]], [12, 71, 0.085, 0],
    [16, 45, 0.03, 1, [45, 52, 60]], [16, 76, 0.1, 0], [18, 81, 0.09, 0], [19, 79, 0.075, 0], [20, 76, 0.085, 0],
    [24, 41, 0.03, 1, [41, 48, 57]], [24, 74, 0.085, 0], [26, 72, 0.075, 0], [27, 71, 0.07, 0],
    [28, 45, 0.026, 1, [45, 52, 57]], [28, 69, 0.085, 0],
  ];

  function buildSad(L, t) {
    loopOut(L, storyBus, storyVerb, 0.7);
    L.scale = 0.9;
    const bs = 1.15;
    runSeq(L, t + 0.3, bs, 32, SAD, (te, ev) => {
      if (ev[3] === 1) {
        const c = ev[4];
        pad(L.gain, te, [midi(c[0]), midi(c[1]), midi(c[2])], bs * (ev[0] % 8 ? 3 : 6), ev[2], 2.4, 1.5, 520);
        pluck(L.gain, te, midi(c[0]), 0.05, 2.6, 0.1);
      } else {
        const tt = te + rnd(0, 0.025);
        pluck(L.gain, tt, midi(ev[1]), ev[2] * rnd(0.88, 1), 2.3, 0.2);
      }
    });
  }

  function sadTheme(on) {
    setLoop("sad", on ? 1 : 0, buildSad, on ? 1 : 3.5);
    // the theme releases heartDrop()'s duck: gently and only part-way while it plays, fully when it ends
    if (on) setDuck(0.5, 1.6);
    else setDuck(1, 1.0);
  }

  function wizardMotif() {
    if (!ready()) return;
    const dest = out(0, 0.45);
    one(dest, (t, keep) => {
      // a wobbly, kindly lydian figure: D  F#  A  G#  E  ...  A
      keep(pad(dest, t, [midi(50), midi(57), midi(66), midi(69)], 2.3, 0.06, 0.7, 0.7, 1300));
      const n = [[0, 74], [0.19, 78], [0.38, 81], [0.66, 80], [0.85, 76], [1.15, 81], [1.75, 86]];
      for (let i = 0; i < n.length; i++) {
        const f = midi(n[i][1]);
        const last = i >= n.length - 2;
        keep(pluck(dest, t + n[i][0], f, 0.085, last ? 1.2 : 0.4, 0.3));
        keep(bell(dest, t + n[i][0], f * 2, 0.022, last ? 0.6 : 0.2));
      }
      // an old bassoon-ish hum underneath, with his wobble
      const g = ctx.createGain();
      const e = swell(g.gain, t + 0.1, 0.4, 0.05, t + 1.8, 0.3);
      const o = osc("triangle", 146.83, t + 0.1, e);
      const v = osc("sine", 5, t + 0.1, e);
      const vg = ctx.createGain();
      vg.gain.value = 2.2;
      v.connect(vg);
      vg.connect(o.frequency);
      const lp = filt("lowpass", 700, 0.7);
      o.connect(lp);
      lp.connect(g);
      g.connect(dest);
      keep(e);
      keep(crackle(dest, t + 1.1, 0.8, 6000, 0.016, 0.12, false));
    });
  }

  function buildLava(L, t) {
    loopOut(L, wBus, wVerb, 0.15);
    L.scale = 0.85;
    const far = t + 1e6;
    const deep = bed(L, t, pinkBuf, "lowpass", 110, 0.8, 0.5, null, 0.45);
    lfo(L, t, 0.13, 35, deep.f.frequency);
    lfo(L, t, 0.21, 0.12, deep.g.gain);
    const sub = osc("sine", 41, t, far);
    const subG = ctx.createGain();
    subG.gain.value = 0.12;
    sub.connect(subG);
    subG.connect(L.gain);
    L.nodes.push(sub);
    lfo(L, t, 0.37, 0.05, subG.gain);
    lfo(L, t, 0.09, 4, sub.frequency);
    // the roil that small speakers can still hear
    const roil = bed(L, t, pinkBuf, "bandpass", 260, 1.4, 0.13, null, 0.6);
    lfo(L, t, 0.27, 90, roil.f.frequency);
    lfo(L, t, 0.43, 0.04, roil.g.gain);
    const hiss = bed(L, t, whiteBuf, "highpass", 4200, 0.5, 0.006, null, 1);
    lfo(L, t, 0.16, 0.004, hiss.g.gain);
    let next = t + 0.2;
    every(L, 400, (now) => {
      if (next < now) next = now + 0.05;
      while (next < now + 0.9) {
        // thick slow bubbles: a low bloop that swells and pops
        const f = rnd(70, 190);
        thump(L.gain, next, f, f * rnd(1.5, 2.2), rnd(0.08, 0.16), 0.014, rnd(0.07, 0.17), rnd(0.04, 0.08));
        if (Math.random() < 0.4) {
          burst(L.gain, next + rnd(0.08, 0.14), {
            buf: pinkBuf, type: "bandpass", q: 1.5, f0: rnd(500, 1100), attack: 0.004, peak: rnd(0.03, 0.07), tc: 0.02,
          });
        }
        next += rnd(0.15, 0.9);
      }
    });
  }

  function lavaRumble(level) {
    setLoop("lava", level, buildLava, 0.9);
  }

  function chainCreak() {
    if (!ready()) return;
    const dest = wOut(rnd(-0.2, 0.2), 0.3);
    one(dest, (t, keep) => {
      // iron under load: two slow groans a fifth apart
      const f = rnd(190, 240);
      keep(creak(dest, t, f, 0.6, 0.06));
      keep(creak(dest, t + 0.05, f * 1.5, 0.5, 0.03));
      keep(creak(dest, t + 0.75, f * 0.84, 0.5, 0.045));
      // links shifting against each other
      const n = 4 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const tc = t + 0.15 + i * rnd(0.12, 0.2);
        const fl = rnd(1700, 3300);
        keep(bell(dest, tc, fl, rnd(0.015, 0.035), rnd(0.04, 0.09)));
        keep(bell(dest, tc + 0.006, fl * 1.37, 0.012, 0.04));
        keep(burst(dest, tc, {
          buf: whiteBuf, type: "bandpass", q: 2.5, f0: rnd(3500, 5000), attack: 0.002, peak: 0.03, tc: 0.006,
        }));
      }
    });
  }

  let tickFlip = false;

  function timerTick() {
    if (!ready()) return;
    tickFlip = !tickFlip;
    const k = tickFlip ? 1 : 0.84; // tick ... tock
    const dest = out(0, 0.22);
    one(dest, (t, keep) => {
      keep(burst(dest, t, {
        buf: whiteBuf, type: "bandpass", q: 4, f0: 2700 * k, attack: 0.002, peak: 0.16, tc: 0.006,
      }));
      keep(thump(dest, t, 980 * k, 760 * k, 0.02, 0.002, 0.1, 0.012));
      keep(bell(dest, t, 1760 * k, 0.014, 0.12));
      // the weight of it: a soft low pulse under each tick
      keep(thump(dest, t, 70, 46, 0.12, 0.01, 0.2, 0.09));
      keep(thump(dest, t, 140, 92, 0.08, 0.008, 0.06, 0.04));
    });
  }

  function slapCrack(dest, t, keep, v) {
    // the wind-up, then a flat woody crack with a short ring
    keep(whoosh(dest, t, 700, 2400, 900, 0.045, 0.04, 0.14 * v, 1.4));
    const tc = t + 0.045;
    keep(burst(dest, tc, {
      buf: whiteBuf, type: "bandpass", q: 0.9, f0: 2100, f1: 800, sweep: 0.03,
      attack: 0.002, peak: 0.42 * v, tc: 0.014,
    }));
    const f = rnd(390, 450);
    keep(thump(dest, tc, f * 1.2, f, 0.02, 0.002, 0.2 * v, 0.03));
    keep(thump(dest, tc, f * 2.72, f * 2.6, 0.02, 0.002, 0.08 * v, 0.016));
    keep(thump(dest, tc, 260, 120, 0.05, 0.003, 0.3 * v, 0.03));
    return tc;
  }

  function tailSlap() {
    if (!ready()) return;
    const dest = wOut(rnd(-0.06, 0.06), 0.12);
    one(dest, (t, keep) => { slapCrack(dest, t, keep, 0.8); });
  }

  function tailSlapHit() {
    if (!ready()) return;
    const dest = wOut(rnd(-0.06, 0.06), 0.16);
    one(dest, (t, keep) => {
      const tc = slapCrack(dest, t, keep, 1);
      // ... and the dummy takes it
      keep(thump(dest, tc, rnd(150, 170), 58, 0.08, 0.005, 0.5, 0.06));
      keep(burst(dest, tc, {
        buf: pinkBuf, type: "bandpass", q: 0.8, f0: rnd(800, 1000), f1: 480, sweep: 0.06,
        attack: 0.004, peak: 0.5, tc: 0.03,
      }));
      keep(fabricRustle(dest, tc + 0.02, 0.18, rnd(3200, 4400), 1.3, 0.06, 4));
      keep(creak(dest, tc + 0.07, rnd(210, 300), 0.18, 0.024));
    });
  }

  function pickup() {
    if (!ready()) return;
    const dest = out(0, 0.1);
    one(dest, (t, keep) => {
      keep(fabricRustle(dest, t, 0.16, rnd(2800, 3800), 1.1, 0.07, 3));
      keep(burst(dest, t, {
        buf: pinkBuf, type: "bandpass", q: 0.8, f0: 500, f1: 1100, sweep: 0.12,
        attack: 0.04, peak: 0.14, tc: 0.04,
      }));
      keep(thump(dest, t + 0.02, 180, 300, 0.1, 0.012, 0.12, 0.04));
      keep(pluck(dest, t + 0.05, midi(79), 0.045, 0.14, 0.3));
      keep(pluck(dest, t + 0.12, midi(84), 0.05, 0.2, 0.3));
    });
  }

  function drop() {
    if (!ready()) return;
    const dest = out(rnd(-0.05, 0.05), 0.06);
    one(dest, (t, keep) => {
      keep(thump(dest, t, rnd(105, 120), 50, 0.1, 0.009, 0.42, 0.06));
      keep(thump(dest, t, 220, 100, 0.07, 0.01, 0.13, 0.035));
      keep(burst(dest, t, {
        buf: pinkBuf, type: "lowpass", q: 0.4, hp: 130, f0: 1900, f1: 330, sweep: 0.13,
        attack: 0.014, peak: 0.42, tc: 0.055,
      }));
      keep(fabricRustle(dest, t + 0.01, 0.15, rnd(2600, 3800), 1.2, 0.05, 3));
    });
  }

  function throwWhoosh() {
    if (!ready()) return;
    const dest = out(rnd(-0.1, 0.1), 0.08);
    one(dest, (t, keep) => {
      keep(whoosh(dest, t, 380, 1900, 600, 0.11, 0.2, 0.4, 1.5));
      keep(whoosh(dest, t + 0.02, 1800, 4600, 2400, 0.1, 0.14, 0.05, 1.2, whiteBuf));
      keep(fabricRustle(dest, t, 0.12, 3000, 1, 0.05, 2));
    });
  }

  function cushionHit() {
    if (!ready()) return;
    const dest = out(rnd(-0.08, 0.08), 0.1);
    one(dest, (t, keep) => {
      // "pomf": the cushion folding around the target ...
      keep(thump(dest, t, rnd(120, 135), 52, 0.1, 0.007, 0.5, 0.065));
      keep(thump(dest, t, 250, 110, 0.07, 0.008, 0.16, 0.035));
      keep(burst(dest, t, {
        buf: pinkBuf, type: "lowpass", q: 0.4, hp: 120, f0: 2600, f1: 300, sweep: 0.16,
        attack: 0.008, peak: 0.6, tc: 0.06,
      }));
      keep(burst(dest, t + 0.07, {
        buf: pinkBuf, type: "bandpass", q: 0.7, f0: 650, f1: 320, sweep: 0.3,
        attack: 0.08, peak: 0.16, tc: 0.12,
      }));
      keep(fabricRustle(dest, t + 0.005, 0.2, rnd(2600, 3800), 1.1, 0.07, 4));
      // ... and the target's post rocking back
      const fw = rnd(360, 440);
      keep(thump(dest, t + 0.006, fw, fw * 0.97, 0.05, 0.004, 0.09, 0.026));
      keep(creak(dest, t + 0.08, rnd(210, 300), 0.18, 0.022));
    });
  }

  function posterFall() {
    if (!ready()) return;
    const dest = wOut(rnd(-0.1, 0.1), 0.14);
    one(dest, (t, keep) => {
      // rip: a bright tearing zip
      keep(crackle(dest, t, 0.34, 1800, 0.2, 0.55, true));
      keep(whoosh(dest, t, 1400, 4200, 2600, 0.28, 0.06, 0.12, 1.2, whiteBuf));
      keep(burst(dest, t + 0.3, {
        buf: whiteBuf, type: "bandpass", q: 1, f0: 2600, attack: 0.003, peak: 0.16, tc: 0.02,
      }));
      // flutter: the sheet see-sawing down, each swing a little softer and slower
      let tf = t + 0.45;
      for (let i = 0; i < 4; i++) {
        const d = 0.2 + i * 0.03;
        keep(whoosh(dest, tf, 500, 1500 - i * 150, 600, d * 0.5, d * 0.5, 0.11 - i * 0.015, 1.1));
        keep(fabricRustle(dest, tf, d, rnd(3800, 5600), 0.9, 0.05 - i * 0.006, 3));
        tf += d + 0.08;
      }
      // slap: flat paper on the floor, and it settles
      keep(burst(dest, tf, {
        buf: pinkBuf, type: "bandpass", q: 0.8, f0: 1700, f1: 700, sweep: 0.04,
        attack: 0.003, peak: 0.34, tc: 0.02,
      }));
      keep(thump(dest, tf, 170, 90, 0.05, 0.004, 0.16, 0.03));
      keep(fabricRustle(dest, tf + 0.03, 0.22, rnd(4000, 5200), 0.9, 0.04, 3));
    });
  }

  function eyeOpen() {
    if (!ready()) return;
    const dest = out(0, 0.5);
    one(dest, (t, keep) => {
      // air and light slowly arriving
      keep(whoosh(dest, t, 260, 1900, 900, 2.4, 1.8, 0.12, 0.8));
      keep(whoosh(dest, t + 0.6, 1800, 5200, 3000, 2.0, 1.5, 0.018, 1, whiteBuf));
      keep(pad(dest, t + 0.2, [midi(48), midi(55), midi(62), midi(64), midi(71)], 3.4, 0.06, 2.4, 1.1, 1500));
      keep(pluck(dest, t + 2.1, midi(79), 0.035, 1.2, 0.2));
      keep(pluck(dest, t + 2.7, midi(86), 0.035, 1.4, 0.2));
      keep(bell(dest, t + 3.3, midi(91), 0.016, 0.9));
    });
  }

  function sensePulse(closeness = 0) {
    if (!ready()) return;
    const now = ctx.currentTime;
    if (now - lastSenseT < 0.05) return;
    lastSenseT = now;
    const c = clamp(+closeness || 0, 0, 1);
    const f = 520 * Math.pow(2, c * 1.5); // 520 Hz far ... ~1470 Hz right on top of it
    const dest = out(0, 0.3);
    one(dest, (t, keep) => {
      // a soft sonar blip with one echo, and a faint tingle of static
      keep(tone(dest, t, "sine", f * 0.94, f, 0.05, 0.11, 0.008, 0.07 + 0.05 * (1 - c)));
      keep(tone(dest, t, "triangle", f * 2, f * 2.02, 0.03, 0.02, 0.006, 0.04));
      keep(tone(dest, t + 0.13, "sine", f, f * 1.01, 0.04, 0.035, 0.01, 0.07));
      keep(crackle(dest, t, 0.14, 4500, 0.012 + 0.014 * c, 0.2, false));
      if (c > 0.85) keep(bell(dest, t + 0.02, f * 2, 0.03, 0.18));
    });
  }


  // ==========================================================================
  // EXTENSIONS 2 (levels 6-11, LEVELS2.md B2). Additive again: nothing above is
  // changed except one early-out in step() for the new surfaces. World sounds go
  // through wBus (underwater / muffle low-pass, heartDrop + scream duck); the
  // scream itself, its ring and its heartbeat use storyBus, which is never ducked.
  // ==========================================================================

  const gateT = {};
  /** Internal rate limit: false when `key` fired less than minDt seconds ago. */
  function gate(key, minDt) {
    const now = ctx.currentTime;
    const last = gateT[key];
    if (last !== undefined && now - last < minDt && now >= last) return false;
    gateT[key] = now;
    return true;
  }
  const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);
  const irnd = (a, b) => a + ((Math.random() * (b - a + 1)) | 0);
  const sp = (param, v, t, tc) => param.setTargetAtTime(v, t, tc);
  function mkGain(v) {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  }

  /** World one-shot output with distance: far = quieter, darker, more room. Returns the node to feed. */
  function wd(pan, dist, send, level) {
    const d = clamp(num(dist, 0), 0, 1);
    const g = outTo(wBus, wVerb, clamp(num(pan, 0), -1, 1) * (1 - 0.4 * d),
      (send === undefined ? 0.06 : send) + 0.55 * d, (level === undefined ? 1 : level) * (1 - 0.72 * d));
    if (d < 0.03) return g;
    const lp = filt("lowpass", 15000 * Math.pow(0.055, d), 0.5);
    lp.connect(g);
    return lp;
  }

  const CLANG = [1, 1.51, 2.13, 2.87, 3.76, 5.14];
  /** Struck metal: a cluster of inharmonic partials, the high ones dying first. */
  function clang(dest, t, f, peak, tc, n) {
    let tEnd = t;
    const m = n || 5;
    for (let i = 0; i < m; i++) {
      const fi = f * CLANG[i] * rnd(0.985, 1.015);
      if (fi > 11000) break;
      const g = ctx.createGain();
      const e = env(g.gain, t, 0.002, peak / (1 + i * 0.7), tc / (1 + i * 0.55));
      const o = osc(i % 2 ? "triangle" : "sine", fi, t, e);
      o.connect(g);
      g.connect(dest);
      if (e > tEnd) tEnd = e;
    }
    return tEnd;
  }

  /** Struck wood: a pitched body, one high partial and a click. */
  function knock(dest, t, f, peak, tc) {
    thump(dest, t, f * 2.62, f * 2.5, 0.03, 0.003, peak * 0.3, tc * 0.5);
    burst(dest, t, { buf: pinkBuf, type: "bandpass", q: 1.4, f0: Math.min(9000, f * 3.4), attack: 0.002, peak: peak * 0.7, tc: 0.012 });
    return thump(dest, t, f * 1.22, f, 0.03, 0.003, peak, tc);
  }

  /** A dry little tick. */
  function tick(dest, t, f, peak, tc) {
    return burst(dest, t, { buf: whiteBuf, type: "bandpass", q: 3, f0: f, attack: 0.0015, peak, tc: tc || 0.005 });
  }

  /** Raspy animal / engine voice: saw through one formant, fluttered at amHz. */
  function rasp(dest, t, f0, f1, form, q, amHz, dur, peak, rise) {
    const g = ctx.createGain();
    const tEnd = swell(g.gain, t, rise || Math.min(0.05, dur * 0.3), peak, t + dur * 0.8, Math.max(0.015, dur * 0.1));
    const o = osc("sawtooth", f0, t, tEnd);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const bp = filt("bandpass", form, q);
    const tr = mkGain(0.55);
    const l = osc("sine", amHz, t, tEnd);
    const lg = mkGain(0.45);
    l.connect(lg);
    lg.connect(tr.gain);
    o.connect(bp);
    bp.connect(tr);
    tr.connect(g);
    g.connect(dest);
    return tEnd;
  }

  /** Low-passed noise with a rolling, bumpy level (thunder, debris, dust). */
  function rumble(dest, t, dur, cut, peak, bumps, rate, buf) {
    const src = noise(buf || pinkBuf, t, t + dur + 0.05, rate || 0.6);
    const lp = filt("lowpass", cut, 0.6);
    const g = mkGain(0);
    g.gain.setValueCurveAtTime(rustleCurve(peak, bumps), t, dur);
    src.connect(lp);
    lp.connect(g);
    g.connect(dest);
    return t + dur + 0.06;
  }

  /** Rolling filtered-noise rattle with a spiky level (chains, pebbles, mesh). */
  function rattle(dest, t, dur, f, q, peak, density) {
    const src = noise(whiteBuf, t, t + dur + 0.02, rnd(0.9, 1.2));
    const bp = filt("bandpass", f, q);
    const g = mkGain(0);
    g.gain.setValueCurveAtTime(crackleCurve(peak, density, false), t, dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(dest);
    return t + dur + 0.03;
  }

  // ---- steps (new surfaces) -------------------------------------------------------

  const EXT_STEP = { dirt: 1, leaves: 1, mud: 1, metal: 1, canvas: 1, concrete: 1, cushion: 1, basalt: 1, ash: 1, lava: 1 };

  function stepExt(surface, strength = 0.6, pan = 0) {
    if (surface === "cushion") { cushionStep(clamp(num(strength, 0.6), 0.05, 1.3) * 0.6, pan); return; }
    if (!ready()) return;
    const now = ctx.currentTime;
    if (now - lastWStepT < 0.02) return;
    lastWStepT = now;
    const s = clamp(num(strength, 0.6), 0.05, 1.3);
    const v = 0.3 + 0.7 * Math.min(s, 1);
    const dest = wOut(clamp(num(pan, 0), -1, 1) * 0.6 + rnd(-0.05, 0.05), 0.04);
    one(dest, (t, keep) => {
      if (surface === "dirt") {
        // packed earth: a dull pat, a short puff and a few grains turning under the paw
        keep(thump(dest, t, rnd(88, 108), 50, 0.07, 0.007, 0.32 * v, 0.04));
        keep(burst(dest, t, {
          buf: pinkBuf, type: "lowpass", q: 0.5, hp: 160, rate: rnd(0.9, 1.2),
          f0: rnd(1400, 2000), f1: rnd(380, 520), sweep: 0.07, attack: 0.006, peak: 0.36 * v, tc: 0.03,
        }));
        keep(crackle(dest, t + 0.012, rnd(0.07, 0.12), 2600, 0.035 * v, 0.2, false));
      } else if (surface === "leaves") {
        // leaf litter: a soft give, then dry crisp crunching on top
        keep(thump(dest, t, rnd(84, 100), 52, 0.07, 0.01, 0.16 * v, 0.04));
        keep(fabricRustle(dest, t, rnd(0.11, 0.17), rnd(3400, 5200), 0.9, 0.1 * v, irnd(3, 5)));
        keep(fabricRustle(dest, t + rnd(0.02, 0.05), rnd(0.08, 0.13), rnd(5200, 7200), 1.2, 0.05 * v, 3));
        keep(crackle(dest, t + 0.006, rnd(0.09, 0.15), 3600, 0.06 * v, 0.28, false));
        if (Math.random() < 0.3) keep(tick(dest, t + rnd(0.02, 0.06), rnd(1800, 2600), 0.05 * v, 0.008)); // a twig
      } else if (surface === "mud") {
        // wet squelch: the paw sinks, the mud lets go with a little suck
        keep(thump(dest, t, rnd(76, 92), 44, 0.09, 0.012, 0.3 * v, 0.05));
        keep(burst(dest, t, {
          buf: pinkBuf, type: "lowpass", q: 1.6, rate: rnd(0.7, 0.9),
          f0: rnd(820, 1100), f1: rnd(210, 280), sweep: 0.12, attack: 0.018, peak: 0.42 * v, tc: 0.05,
        }));
        keep(thump(dest, t + rnd(0.07, 0.1), rnd(130, 160), rnd(250, 320), 0.07, 0.02, 0.1 * v, 0.03));
        bloops(dest, t + 0.03, irnd(2, 3), 240, 620, 0.1, 0.07 * v, keep);
      } else if (surface === "metal") {
        // deck plate: padded paw on thin steel, a short hollow ring and a claw tick
        keep(thump(dest, t, rnd(170, 200), 110, 0.04, 0.004, 0.22 * v, 0.03));
        keep(clang(dest, t, rnd(540, 700), 0.07 * v, rnd(0.05, 0.09), 4));
        keep(burst(dest, t, {
          buf: pinkBuf, type: "bandpass", q: 2.2, f0: rnd(1100, 1500), attack: 0.003, peak: 0.16 * v, tc: 0.02,
        }));
        if (Math.random() < 0.6) keep(tick(dest, t + rnd(0.006, 0.02), rnd(3800, 5200), 0.045 * v));
      } else if (surface === "canvas") {
        // taut tent cloth over boards: a small drum-like "bup" and a cloth rub
        const f = rnd(138, 160);
        keep(thump(dest, t, f, f * 0.66, 0.06, 0.006, 0.32 * v, 0.05));
        keep(burst(dest, t, {
          buf: pinkBuf, type: "bandpass", q: 0.9, f0: rnd(480, 640), f1: 320, sweep: 0.06,
          attack: 0.005, peak: 0.2 * v, tc: 0.03,
        }));
        keep(fabricRustle(dest, t + 0.005, rnd(0.08, 0.13), rnd(2200, 3200), 1.1, 0.05 * v, 3));
      } else if (surface === "basalt") {
        // volcanic rock: a hard, dark knock and loose clinker crunching and skittering under the paw
        keep(thump(dest, t, rnd(140, 170), 80, 0.045, 0.003, 0.34 * v, 0.026));
        keep(burst(dest, t, { buf: pinkBuf, type: "bandpass", q: 1.3, f0: rnd(1300, 1800), f1: 800, sweep: 0.03, attack: 0.002, peak: 0.3 * v, tc: 0.014 }));
        keep(rattle(dest, t + 0.008, rnd(0.08, 0.14), rnd(2600, 3600), 1.6, 0.07 * v, 0.45));
        if (Math.random() < 0.35) keep(tick(dest, t + rnd(0.05, 0.12), rnd(2200, 3200), 0.05 * v, 0.01)); // a pebble rolls off
      } else if (surface === "ash") {
        // ash and cinders: a muffled pat that sinks a little, a soft gritty hiss
        keep(thump(dest, t, rnd(80, 98), 46, 0.08, 0.01, 0.3 * v, 0.045));
        keep(burst(dest, t, { buf: pinkBuf, type: "lowpass", q: 0.5, f0: rnd(1100, 1500), f1: 300, sweep: 0.08, attack: 0.01, peak: 0.3 * v, tc: 0.035 }));
        keep(crackle(dest, t + 0.01, rnd(0.1, 0.16), 3000, 0.045 * v, 0.3, false));
      } else if (surface === "lava") {
        // cooled crust over heat: a crisp crack, a sizzle, a little steam
        keep(thump(dest, t, rnd(150, 180), 90, 0.04, 0.003, 0.26 * v, 0.024));
        keep(crackle(dest, t, rnd(0.12, 0.2), 3600, 0.08 * v, 0.5, false));
        keep(burst(dest, t + 0.02, { buf: whiteBuf, type: "highpass", f0: 4200, attack: 0.02, peak: 0.07 * v, tc: 0.12 }));
      } else {
        // concrete: tight, dry, bright slap with a pinch of grit
        keep(thump(dest, t, rnd(180, 215), 112, 0.035, 0.003, 0.36 * v, 0.022));
        keep(thump(dest, t, rnd(95, 115), 62, 0.05, 0.005, 0.16 * v, 0.03));
        keep(burst(dest, t, {
          buf: pinkBuf, type: "bandpass", q: 1.2, f0: rnd(2000, 2700), f1: 1200, sweep: 0.025,
          attack: 0.002, peak: 0.4 * v, tc: 0.012,
        }));
        keep(crackle(dest, t + 0.01, 0.06, 4200, 0.03 * v, 0.2, false));
        if (Math.random() < 0.5) keep(tick(dest, t + rnd(0.008, 0.02), rnd(3400, 4600), 0.04 * v));
      }
    });
  }

  // ---- UI -------------------------------------------------------------------------

  function checkpoint() {
    if (!ready() || !gate("cp", 0.2)) return;
    const dest = out(0, 0.35);
    one(dest, (t, keep) => {
      // two warm rising notes (D -> A) on a felt bell, with a soft pad breathing under them
      keep(pad(dest, t, [midi(50), midi(57), midi(62)], 0.7, 0.05, 0.2, 0.3, 1500));
      keep(pluck(dest, t, midi(62), 0.13, 0.5, 0.25));
      keep(bell(dest, t, midi(74), 0.03, 0.3));
      keep(pluck(dest, t + 0.17, midi(69), 0.14, 0.9, 0.25));
      keep(bell(dest, t + 0.17, midi(81), 0.035, 0.6));
    });
  }

  function denied() {
    if (!ready() || !gate("den", 0.12)) return;
    const dest = out(0, 0.1);
    one(dest, (t, keep) => {
      // "nuh-uh": two soft low reedy notes, the second lower
      const lp = filt("lowpass", 900, 0.7);
      lp.connect(dest);
      keep(tone(lp, t, "square", 196, 190, 0.07, 0.09, 0.008, 0.02));
      keep(tone(lp, t + 0.11, "square", 155.6, 148, 0.11, 0.09, 0.008, 0.03));
      keep(thump(dest, t, 120, 70, 0.05, 0.004, 0.14, 0.03));
    });
  }

  function armyUp(n = 1) {
    if (!ready() || !gate("armyUp", 0.03)) return;
    const k = Math.max(0, (num(n, 1) | 0) - 1);
    const f = midi(74 + PENTA[k % 5] + 12 * Math.min(2, (k / 5) | 0)); // climbs a D pentatonic, capped two octaves up
    const dest = out(rnd(-0.25, 0.25), 0.3);
    one(dest, (t, keep) => {
      keep(chirp(dest, t, f * 0.8, f, 0.05, 0.07));
      keep(pluck(dest, t + 0.03, f, 0.13, 0.22, 0.4));
      keep(bell(dest, t + 0.03, f * 2, 0.035, 0.16));
      if (k % 5 === 4) keep(bell(dest, t + 0.1, f * 3, 0.02, 0.3)); // a little glint at the top of each octave
    });
  }

  function armyDown() {
    if (!ready() || !gate("armyDown", 0.08)) return;
    const dest = out(rnd(-0.2, 0.2), 0.4);
    one(dest, (t, keep) => {
      // one soft falling note; gentle, a small sigh rather than a sting
      keep(tone(dest, t, "sine", 587.33, 392, 0.45, 0.09, 0.03, 0.16));
      keep(tone(dest, t, "triangle", 1174.66, 784, 0.4, 0.012, 0.03, 0.1));
      keep(pad(dest, t, [196, 293.66], 0.5, 0.025, 0.2, 0.3, 700));
    });
  }

  function gearOn(kind = "leaf") {
    if (!ready() || !gate("gear", 0.1)) return;
    const dest = out(0, 0.2);
    one(dest, (t, keep) => {
      if (kind === "suit") {
        // heavy cloth pulled on, a zip, two clasps
        keep(fabricRustle(dest, t, 0.3, 1800, 0.8, 0.13, 5));
        keep(thump(dest, t + 0.04, 120, 60, 0.08, 0.008, 0.26, 0.05));
        keep(whoosh(dest, t + 0.25, 1800, 5200, 6000, 0.22, 0.04, 0.09, 5, whiteBuf));
        keep(rattle(dest, t + 0.25, 0.22, 4200, 4, 0.06, 0.6));
        keep(knock(dest, t + 0.56, 420, 0.16, 0.02));
        keep(clang(dest, t + 0.56, 1900, 0.03, 0.04, 3));
        keep(knock(dest, t + 0.7, 480, 0.16, 0.02));
        keep(pluck(dest, t + 0.72, midi(62), 0.07, 0.5, 0.2));
      } else if (kind === "glasses") {
        // hinges, a tiny settle on the bill, a glint
        keep(tick(dest, t, 4200, 0.09));
        keep(tick(dest, t + 0.07, 5200, 0.07));
        keep(thump(dest, t + 0.16, 620, 420, 0.03, 0.003, 0.08, 0.02));
        keep(bell(dest, t + 0.2, midi(93), 0.05, 0.3));
        keep(bell(dest, t + 0.28, midi(98), 0.035, 0.5));
      } else if (kind === "weapon") {
        // lifted, racked, locked: clack - clack - thunk
        keep(fabricRustle(dest, t, 0.12, 2400, 1, 0.05, 2));
        keep(knock(dest, t + 0.1, 360, 0.22, 0.018));
        keep(clang(dest, t + 0.1, 1250, 0.05, 0.03, 4));
        keep(whoosh(dest, t + 0.2, 900, 2600, 1600, 0.06, 0.05, 0.07, 3, whiteBuf));
        keep(knock(dest, t + 0.3, 300, 0.26, 0.02));
        keep(clang(dest, t + 0.3, 980, 0.07, 0.05, 4));
        keep(thump(dest, t + 0.46, 150, 70, 0.07, 0.005, 0.34, 0.05));
        keep(clang(dest, t + 0.46, 620, 0.04, 0.09, 3));
      } else {
        // leaf armour: dry leaves settling, a vine pulled snug, a woody toggle, a warm note
        keep(fabricRustle(dest, t, 0.28, 4200, 0.9, 0.12, 5));
        keep(fabricRustle(dest, t + 0.12, 0.2, 6000, 1.2, 0.06, 4));
        keep(creak(dest, t + 0.26, 420, 0.16, 0.035));
        keep(knock(dest, t + 0.46, 520, 0.18, 0.022));
        keep(pluck(dest, t + 0.48, midi(69), 0.08, 0.5, 0.25));
        keep(pluck(dest, t + 0.58, midi(74), 0.07, 0.6, 0.25));
      }
    });
  }

  function visorOn() {
    if (!ready() || !gate("visor", 0.2)) return;
    const dest = out(0, 0.18);
    one(dest, (t, keep) => {
      // a little power-up sweep, then a tick and two soft "ready" blips
      keep(tick(dest, t, 3600, 0.1));
      keep(tone(dest, t + 0.02, "sine", 280, 2500, 0.34, 0.07, 0.05, 0.03));
      keep(tone(dest, t + 0.02, "triangle", 560, 5000, 0.34, 0.012, 0.05, 0.03));
      keep(whoosh(dest, t + 0.02, 700, 5200, 6000, 0.32, 0.05, 0.05, 4, whiteBuf));
      keep(crackle(dest, t + 0.05, 0.3, 5200, 0.02, 0.2, true));
      keep(tick(dest, t + 0.4, 5200, 0.12));
      keep(tone(dest, t + 0.46, "sine", 1760, 1760, 0.04, 0.06, 0.006, 0.03));
      keep(tone(dest, t + 0.56, "sine", 2349.3, 2349.3, 0.05, 0.06, 0.006, 0.07));
    });
  }

  // ---- guns -----------------------------------------------------------------------

  function gunshot(dist = 0, pan = 0, kind = "rifle") {
    if (!ready()) return;
    const blaster = kind === "blaster";
    if (!gate(blaster ? "blaster" : "shot", 0.04)) return;
    const d = clamp(num(dist, 0), 0, 1);
    const p = clamp(num(pan, 0), -1, 1);
    if (blaster) {
      // the player's launcher: a round, punchy "thoomp" out of a tube. Friendly on purpose.
      const dest = wd(p, d, 0.1, 0.9);
      one(dest, (t, keep) => {
        const f = rnd(205, 230);
        keep(thump(dest, t, f, 64, 0.11, 0.004, 0.75, 0.07));
        keep(thump(dest, t, f * 2, 150, 0.06, 0.003, 0.22, 0.03));
        // air popping out of the barrel + the hollow tube ringing once
        keep(burst(dest, t, {
          buf: pinkBuf, type: "lowpass", q: 0.7, f0: 2400, f1: 420, sweep: 0.07, attack: 0.003, peak: 0.5, tc: 0.03,
        }));
        keep(burst(dest, t + 0.005, {
          buf: pinkBuf, type: "bandpass", q: 7, f0: rnd(300, 340), attack: 0.004, peak: 0.5, tc: 0.07,
        }));
        // the round leaving: a tiny upward "fwip"
        keep(tone(dest, t + 0.02, "sine", 620, 1500, 0.07, 0.05, 0.01, 0.025));
        keep(whoosh(dest, t + 0.02, 900, 2600, 1500, 0.05, 0.1, 0.07, 2, whiteBuf));
        keep(tick(dest, t + 0.09, 2600, 0.04)); // the spring settling
      });
      return;
    }
    const pistol = kind === "pistol";
    const near = (1 - d) * (1 - d);
    const k = (pistol ? 1.45 : 1) * rnd(0.94, 1.06);
    const lvl = pistol ? 0.8 : 1;
    const dest = wd(p, d, 0.12, lvl);
    one(dest, (t, keep) => {
      if (near > 0.02) {
        // CRACK: the supersonic snap, a few milliseconds of everything
        keep(burst(dest, t, {
          buf: whiteBuf, type: "highpass", q: 0.6, f0: 1600 * k, attack: 0.001, peak: 0.9 * near, tc: 0.012,
        }));
        keep(burst(dest, t, {
          buf: whiteBuf, type: "bandpass", q: 0.8, f0: 3400 * k, f1: 900 * k, sweep: 0.04,
          attack: 0.001, peak: 0.6 * near, tc: 0.022,
        }));
        // slap-back off the nearest wall
        keep(burst(dest, t + rnd(0.085, 0.13), {
          buf: pinkBuf, type: "bandpass", q: 0.7, f0: 1500 * k, f1: 600, sweep: 0.06,
          attack: 0.004, peak: 0.24 * near, tc: 0.04,
        }));
      }
      // the body: chest thump + the bark of the muzzle blast
      keep(thump(dest, t, 190 * k, 48, 0.06, 0.002, (pistol ? 0.5 : 0.8) * (0.35 + 0.65 * near), pistol ? 0.04 : 0.06));
      keep(burst(dest, t, {
        buf: pinkBuf, type: "lowpass", q: 0.8, f0: 2600 * k * (1 - 0.6 * d), f1: 300, sweep: 0.09,
        attack: 0.002, peak: 0.75 * (0.3 + 0.7 * near), tc: pistol ? 0.035 : 0.055,
      }));
      // the tail rolling away; the further the shot, the more of the sound is tail
      keep(burst(dest, t + 0.02 + d * 0.05, {
        buf: pinkBuf, type: "lowpass", q: 0.5, rate: 0.7, f0: 1300 - 800 * d, f1: 180, sweep: 0.5 + d * 0.5,
        attack: 0.02 + 0.05 * d, peak: 0.2 + 0.3 * d, tc: 0.16 + 0.36 * d,
      }));
      if (d > 0.4) keep(thump(dest, t, 110, 52, 0.12, 0.01, 0.5 * d, 0.1)); // far: just a dull pop
      if (!pistol && near > 0.3) keep(clang(dest, t + 0.03, rnd(1700, 2300), 0.012 * near, 0.03, 3)); // action cycling
    });
  }

  function bulletWhiz(pan = 0) {
    if (!ready() || !gate("whiz", 0.04)) return;
    const t = ctx.currentTime + 0.004;
    const p0 = clamp(num(pan, 0), -1, 1) || (Math.random() < 0.5 ? -0.7 : 0.7);
    const g = mkGain(1);
    let last = g;
    if (ctx.createStereoPanner) {
      // passes the head: starts on its side, ends on the other
      const pn = ctx.createStereoPanner();
      pn.pan.setValueAtTime(clamp(p0, -1, 1), t);
      pn.pan.linearRampToValueAtTime(clamp(-p0 * 0.8, -1, 1), t + 0.16);
      g.connect(pn);
      last = pn;
    }
    last.connect(wBus);
    const k = rnd(0.85, 1.2);
    let tEnd = burst(g, t, {
      buf: whiteBuf, type: "bandpass", q: 7, f0: 5200 * k, f1: 1100 * k, sweep: 0.13,
      attack: 0.03, peak: 0.5, tc: 0.03,
    });
    tEnd = Math.max(tEnd, tone(g, t, "sine", 2900 * k, 800 * k, 0.14, 0.05, 0.03, 0.025));
    tEnd = Math.max(tEnd, burst(g, t + 0.02, {
      buf: pinkBuf, type: "bandpass", q: 1.5, f0: 900, f1: 380, sweep: 0.12, attack: 0.03, peak: 0.16, tc: 0.03,
    }));
    release(g, tEnd + 0.15);
  }

  function ricochet(pan = 0) {
    if (!ready() || !gate("rico", 0.03)) return;
    const dest = wd(clamp(num(pan, 0), -1, 1) + rnd(-0.1, 0.1), 0, 0.3);
    one(dest, (t, keep) => {
      const f = rnd(2600, 4200);
      keep(tick(dest, t, rnd(3000, 5000), 0.3, 0.006));
      keep(thump(dest, t, 300, 120, 0.03, 0.002, 0.2, 0.015));
      // "p-teeeww": a tumbling whine sliding away, with a warble
      const g = ctx.createGain();
      const e = env(g.gain, t + 0.008, 0.006, 0.085, rnd(0.09, 0.16));
      const o = osc("sine", f, t + 0.008, e);
      o.frequency.exponentialRampToValueAtTime(f * rnd(0.28, 0.42), t + rnd(0.3, 0.5));
      const v = osc("sine", rnd(28, 46), t + 0.008, e);
      const vg = mkGain(f * 0.05);
      v.connect(vg);
      vg.connect(o.frequency);
      o.connect(g);
      g.connect(dest);
      keep(e);
      keep(clang(dest, t, rnd(1500, 2400), 0.03, 0.05, 3));
    });
  }

  function bulletHit(surface = "dirt", pan = 0) {
    if (!ready() || !gate("bhit", 0.03)) return;
    const dest = wd(clamp(num(pan, 0), -1, 1) + rnd(-0.08, 0.08), 0, 0.12);
    one(dest, (t, keep) => {
      if (surface === "metal") {
        keep(tick(dest, t, 4200, 0.3));
        keep(clang(dest, t, rnd(900, 1500), 0.14, rnd(0.09, 0.16), 5));
        keep(thump(dest, t, 240, 120, 0.03, 0.002, 0.2, 0.02));
        keep(crackle(dest, t, 0.12, 5000, 0.06, 0.3, false)); // sparks
      } else if (surface === "wood") {
        keep(knock(dest, t, rnd(240, 320), 0.34, 0.03));
        keep(crackle(dest, t + 0.005, 0.16, 2400, 0.1, 0.3, false)); // splinters
        keep(tick(dest, t + rnd(0.05, 0.1), rnd(2200, 3000), 0.05, 0.008));
      } else if (surface === "concrete") {
        keep(burst(dest, t, { buf: whiteBuf, type: "highpass", q: 0.6, f0: 2400, attack: 0.001, peak: 0.36, tc: 0.012 }));
        keep(thump(dest, t, 260, 110, 0.03, 0.002, 0.26, 0.02));
        keep(crackle(dest, t + 0.01, 0.3, 3200, 0.08, 0.22, false)); // chips falling
        keep(burst(dest, t, { buf: pinkBuf, type: "bandpass", q: 0.8, f0: 1200, attack: 0.004, peak: 0.16, tc: 0.05 }));
      } else if (surface === "leaves") {
        keep(tick(dest, t, 3200, 0.12));
        keep(fabricRustle(dest, t, 0.2, rnd(3800, 5600), 1, 0.14, 4));
        keep(fabricRustle(dest, t + 0.08, 0.22, rnd(5000, 7000), 1.2, 0.05, 3));
      } else {
        // dirt: a thud and a spit of earth
        keep(thump(dest, t, rnd(130, 160), 52, 0.05, 0.003, 0.36, 0.035));
        keep(burst(dest, t, {
          buf: pinkBuf, type: "lowpass", q: 0.6, f0: 2400, f1: 500, sweep: 0.06, attack: 0.003, peak: 0.4, tc: 0.03,
        }));
        keep(crackle(dest, t + 0.02, 0.2, 2600, 0.05, 0.2, false));
      }
    });
  }

  function emptyClick() {
    if (!ready() || !gate("empty", 0.08)) return;
    const dest = out(0, 0.05);
    one(dest, (t, keep) => {
      // a dry spring and a hollow "tk" - nothing in the tube
      keep(tick(dest, t, 2600, 0.16));
      keep(knock(dest, t, 420, 0.12, 0.012));
      keep(tick(dest, t + 0.07, 1800, 0.12, 0.008));
      keep(thump(dest, t + 0.07, 300, 210, 0.03, 0.003, 0.09, 0.02));
      keep(tone(dest, t + 0.075, "sine", 660, 640, 0.03, 0.012, 0.004, 0.04)); // the empty tube
    });
  }

  function aimWarn(pan = 0) {
    if (!ready() || !gate("aim", 0.09)) return;
    const dest = wd(clamp(num(pan, 0), -1, 1) * 0.8, 0, 0.12);
    one(dest, (t, keep) => {
      // short, thin, rising two-tone: "being aimed at". Reads over gunfire, never harsh.
      const bp = filt("bandpass", 1500, 1.4);
      bp.connect(dest);
      keep(tone(bp, t, "square", 987.8, 987.8, 0.06, 0.1, 0.005, 0.012));
      keep(tone(bp, t + 0.09, "square", 1318.5, 1396.9, 0.1, 0.11, 0.005, 0.03));
      keep(tone(dest, t + 0.09, "sine", 2637, 2794, 0.09, 0.02, 0.005, 0.04));
    });
  }

  function shotDown() {
    if (!ctx || !duck || ctx.state === "closed") return;
    const t = ctx.currentTime + 0.004;
    // every world sound falls away within a quarter of a second. Released by stopAll() / sadTheme(true);
    // as a safety net the world also comes back by itself, slowly, long after the ring is gone.
    duck.gain.cancelScheduledValues(t);
    duck.gain.setValueAtTime(duck.gain.value, t);
    duck.gain.linearRampToValueAtTime(0, t + 0.25);
    duck.gain.setValueAtTime(0, t + 8);
    duck.gain.linearRampToValueAtTime(1, t + 10.5);
    setLoop("screamCharge", 0, buildScreamCharge, 0.3);
    if (!ready()) return;
    const dest = outTo(storyBus, storyVerb, 0, 0.3);
    afterG = dest;
    let tEnd = t;
    const keep = (e) => { if (e > tEnd) tEnd = e; };
    // ONE enormous close shot: crack, chest thump, a wall of air - and it is already over
    keep(burst(dest, t, { buf: whiteBuf, type: "highpass", q: 0.6, f0: 1200, attack: 0.001, peak: 1.5, tc: 0.016 }));
    keep(burst(dest, t, {
      buf: whiteBuf, type: "bandpass", q: 0.7, f0: 3200, f1: 500, sweep: 0.08, attack: 0.001, peak: 1.1, tc: 0.04,
    }));
    keep(thump(dest, t, 170, 30, 0.22, 0.002, 1.5, 0.1));
    keep(thump(dest, t, 340, 70, 0.08, 0.002, 0.6, 0.04));
    keep(burst(dest, t, {
      buf: pinkBuf, type: "lowpass", q: 0.7, f0: 3000, f1: 110, sweep: 0.35, attack: 0.002, peak: 1.2, tc: 0.09,
    }));
    // the high ring that is left: two close tones beating slowly, fading for four seconds
    const ring = ctx.createGain();
    ring.gain.setValueAtTime(0, t);
    ring.gain.linearRampToValueAtTime(0.05, t + 0.2);
    ring.gain.setTargetAtTime(0, t + 0.3, 0.85);
    const a = osc("sine", 3951, t, t + 4.6);
    const b = osc("sine", 3958.5, t, t + 4.6);
    const c = osc("sine", 7902, t, t + 4.6);
    const cg = mkGain(0.12);
    a.connect(ring);
    b.connect(ring);
    c.connect(cg);
    cg.connect(ring);
    ring.connect(dest);
    keep(t + 4.7);
    // one heavy, muffled heartbeat under it
    const lp = filt("lowpass", 120, 0.7);
    lp.connect(dest);
    for (let i = 0; i < 3; i++) {
      const tb = t + 0.7 + i * 1.15;
      const pk = 0.7 - i * 0.2;
      keep(thump(lp, tb, 62, 38, 0.1, 0.014, pk, 0.08));
      keep(thump(lp, tb + 0.27, 54, 34, 0.1, 0.014, pk * 0.7, 0.09));
    }
    release(dest, tEnd + 0.3);
  }

  // ---- people (stylised gibberish: vowels only, never words, never cruel) -----------

  /** One spoken syllable with a soft consonant edge. */
  function syl(dest, t, f0, f1, dur, peak, vowel, hard) {
    if (hard) {
      burst(dest, t - 0.012, {
        buf: whiteBuf, type: "bandpass", q: 1.2, f0: rnd(1800, 3200), attack: 0.004, peak: peak * 0.16, tc: 0.012,
      });
    }
    return vox(dest, t, f0, f1, dur, peak, vowel || pick(VOWELS), rnd(4.5, 6), 0.012);
  }

  function guardVoice(kind = "huh", pan = 0, dist = 0) {
    if (!ready() || !gate("gv", 0.06)) return;
    const radio = kind === "radio";
    const k = rnd(0.86, 1.18); // every guard has his own pitch
    const world = wd(clamp(num(pan, 0), -1, 1) * 0.85, dist, 0.14, radio ? 0.75 : 1);
    let dest = world;
    if (radio) {
      // a small speaker: narrow band, a little squelch at each end
      const bp = filt("bandpass", 1900, 1.3);
      const hp = filt("highpass", 700, 0.7);
      bp.connect(hp);
      hp.connect(world);
      dest = bp;
    }
    const A = VOWELS[0], O = VOWELS[1], U = VOWELS[2], E = VOWELS[3], SCH = VOWELS[4], AW = VOWELS[5];
    const t = ctx.currentTime + 0.016;
    let tEnd = t;
    const keep = (e) => { if (e > tEnd) tEnd = e; return e; };
    if (kind === "hey") {
      keep(syl(dest, t, 205 * k, 150 * k, 0.26, 0.75, E, true));
      keep(syl(dest, t, 410 * k, 300 * k, 0.2, 0.1, A));
    } else if (kind === "alert") {
      keep(syl(dest, t, 170 * k, 190 * k, 0.11, 0.6, E, true));
      keep(syl(dest, t + 0.15, 190 * k, 215 * k, 0.11, 0.65, A, true));
      keep(syl(dest, t + 0.3, 240 * k, 170 * k, 0.32, 0.8, A, true));
    } else if (kind === "search") {
      // muttering to himself, low and slow
      const fs = [118, 108, 124, 100];
      for (let i = 0; i < 4; i++) {
        keep(syl(dest, t + i * rnd(0.2, 0.26), fs[i] * k, fs[i] * k * rnd(0.92, 1.05), rnd(0.12, 0.17), 0.3, pick([U, SCH, O])));
      }
    } else if (kind === "lost") {
      // "aaah... meh." a shrug you can hear
      keep(syl(dest, t, 150 * k, 128 * k, 0.3, 0.42, A));
      keep(syl(dest, t + 0.42, 122 * k, 98 * k, 0.24, 0.36, SCH));
      keep(burst(dest, t + 0.62, {
        buf: pinkBuf, type: "bandpass", q: 0.8, f0: 1300, f1: 700, sweep: 0.3, attack: 0.08, peak: 0.05, tc: 0.1,
      }));
    } else if (kind === "hurt") {
      // comic "oof!"
      keep(thump(dest, t, 150, 60, 0.06, 0.004, 0.3, 0.04));
      keep(syl(dest, t + 0.02, 185 * k, 105 * k, 0.2, 0.7, O));
    } else if (kind === "down") {
      // "ooouuugh...": a long deflating groan, then a sigh. He is having a nap.
      const g = ctx.createGain();
      g.connect(dest);
      keep(vox(g, t, 172 * k, 74 * k, 0.75, 0.6, O, 7, 0.03));
      keep(vox(g, t + 0.05, 344 * k, 150 * k, 0.6, 0.08, U, 7, 0.03));
      keep(burst(dest, t + 0.6, {
        buf: pinkBuf, type: "bandpass", q: 0.7, f0: 1200, f1: 500, sweep: 0.5, attack: 0.15, peak: 0.07, tc: 0.16,
      }));
    } else if (radio) {
      keep(burst(dest, t, { buf: whiteBuf, type: "highpass", q: 0.5, f0: 1500, attack: 0.004, peak: 0.3, tc: 0.03 }));
      keep(tone(dest, t + 0.02, "square", 1320, 1320, 0.05, 0.1, 0.004, 0.01));
      let tt = t + 0.16;
      const n = irnd(5, 7);
      for (let i = 0; i < n; i++) {
        const f = rnd(125, 175) * k;
        const dur = rnd(0.07, 0.13);
        keep(syl(dest, tt, f, f * rnd(0.88, 1.12), dur, 0.8, pick(VOWELS), Math.random() < 0.5));
        tt += dur + rnd(0.03, 0.09);
      }
      keep(crackle(dest, t + 0.1, tt - t, 2200, 0.05, 0.2, false));
      keep(burst(dest, tt + 0.03, { buf: whiteBuf, type: "highpass", q: 0.5, f0: 1500, attack: 0.004, peak: 0.34, tc: 0.045 }));
    } else if (kind === "laugh") {
      const n = irnd(4, 6);
      for (let i = 0; i < n; i++) {
        const f = (210 - i * 16) * k;
        keep(syl(dest, t + i * 0.13, f, f * 0.84, 0.075, 0.5 - i * 0.04, i % 2 ? A : AW, true));
      }
    } else if (kind === "yawn") {
      const g = ctx.createGain();
      g.connect(dest);
      keep(vox(g, t, 120 * k, 215 * k, 0.55, 0.4, A, 0, 0));
      keep(vox(g, t + 0.5, 215 * k, 100 * k, 0.8, 0.42, AW, 5, 0.02));
      keep(burst(dest, t, {
        buf: pinkBuf, type: "bandpass", q: 0.8, f0: 700, f1: 1500, sweep: 0.5, attack: 0.3, peak: 0.05, tc: 0.12,
      }));
      keep(syl(dest, t + 1.42, 112 * k, 104 * k, 0.12, 0.2, U));
    } else if (kind === "order") {
      // three barked syllables: firm, level, the last one drops
      keep(syl(dest, t, 165 * k, 168 * k, 0.1, 0.65, A, true));
      keep(syl(dest, t + 0.16, 168 * k, 170 * k, 0.1, 0.65, E, true));
      keep(syl(dest, t + 0.32, 172 * k, 122 * k, 0.2, 0.75, O, true));
    } else {
      // "huh?"
      keep(syl(dest, t, 128 * k, 196 * k, 0.24, 0.5, SCH));
    }
    release(dest, tEnd + 0.15);
  }

  function punch() {
    if (!ready() || !gate("punch", 0.03)) return;
    const dest = wOut(rnd(-0.15, 0.15), 0.08);
    one(dest, (t, keep) => {
      // short swish, then a padded, cartoon "bap"
      keep(whoosh(dest, t, 700, 2400, 1200, 0.035, 0.03, 0.14, 2, whiteBuf));
      const th = t + 0.035;
      keep(thump(dest, th, rnd(170, 200), 58, 0.07, 0.003, 0.6, 0.05));
      keep(burst(dest, th, {
        buf: pinkBuf, type: "bandpass", q: 0.8, f0: rnd(1200, 1600), f1: 500, sweep: 0.05, attack: 0.002, peak: 0.6, tc: 0.025,
      }));
      keep(burst(dest, th, { buf: whiteBuf, type: "highpass", q: 0.5, f0: 3000, attack: 0.001, peak: 0.14, tc: 0.008 }));
      keep(fabricRustle(dest, th + 0.01, 0.1, 2600, 1, 0.05, 2));
    });
  }

  function bodyFall(surface = "dirt") {
    if (!ready() || !gate("bfall", 0.03)) return;
    const dest = wOut(rnd(-0.2, 0.2), 0.1);
    one(dest, (t, keep) => {
      // knees, then the rest: two soft heavy thuds and a rustle of uniform
      keep(thump(dest, t, 120, 46, 0.09, 0.006, 0.4, 0.06));
      const tb = t + rnd(0.13, 0.18);
      keep(thump(dest, tb, 96, 34, 0.14, 0.006, 0.7, 0.1));
      keep(burst(dest, tb, {
        buf: pinkBuf, type: "lowpass", q: 0.6, f0: 1500, f1: 260, sweep: 0.12, attack: 0.005, peak: 0.5, tc: 0.06,
      }));
      keep(fabricRustle(dest, t + 0.02, 0.3, 2100, 0.9, 0.09, 5));
      if (surface === "metal") {
        keep(clang(dest, tb, rnd(300, 420), 0.16, 0.25, 5));
        keep(rattle(dest, tb + 0.05, 0.3, 2600, 3, 0.05, 0.3));
      } else if (surface === "wood") {
        keep(knock(dest, tb, 150, 0.4, 0.06));
        keep(creak(dest, tb + 0.08, 240, 0.2, 0.03));
      } else if (surface === "concrete") {
        keep(burst(dest, tb, { buf: pinkBuf, type: "bandpass", q: 1, f0: 1900, attack: 0.002, peak: 0.3, tc: 0.016 }));
        keep(clang(dest, tb + 0.06, 2400, 0.025, 0.05, 3)); // a buckle
      } else if (surface === "leaves") {
        keep(fabricRustle(dest, tb, 0.4, 4400, 0.9, 0.16, 6));
        keep(crackle(dest, tb, 0.3, 3400, 0.07, 0.25, false));
      } else {
        keep(burst(dest, tb + 0.02, {
          buf: pinkBuf, type: "bandpass", q: 0.6, f0: 900, f1: 500, sweep: 0.3, attack: 0.05, peak: 0.12, tc: 0.12,
        })); // dust
        keep(crackle(dest, tb + 0.03, 0.25, 2600, 0.04, 0.18, false));
      }
    });
  }

  function buildSiren(L, t, kind) {
    loopOut(L, wBus, wVerb, 0.45);
    const far = t + 1e6;
    if (kind === "circus") {
      // a hand-cranked siren: a rotor whine that surges with every turn of the handle, and an alarm bell
      L.scale = 0.5;
      const a = osc("sawtooth", 520, t, far);
      const b = osc("square", 523, t, far);
      const bg = mkGain(0.3);
      const bp = filt("bandpass", 1100, 1.2);
      const g = mkGain(0.12);
      a.connect(bp);
      b.connect(bg);
      bg.connect(bp);
      bp.connect(g);
      g.connect(L.gain);
      L.nodes.push(a, b);
      // the crank: an uneven push-pull (two LFOs that never line up)
      lfo(L, t, 0.42, 210, a.frequency);
      lfo(L, t, 0.42, 210, b.frequency);
      lfo(L, t, 1.31, 28, a.frequency);
      lfo(L, t, 1.31, 28, b.frequency);
      lfo(L, t, 0.42, 420, bp.frequency);
      lfo(L, t, 0.84, 0.035, g.gain);
      let next = t + 0.1;
      every(L, 300, (now) => {
        if (next < now) next = now + 0.05;
        while (next < now + 0.8) {
          // the bell: a quick, slightly uneven hammer
          clang(L.gain, next, 1480 * rnd(0.995, 1.005), rnd(0.04, 0.06), 0.16, 4);
          tick(L.gain, next, 3200, 0.02);
          next += rnd(0.105, 0.135);
        }
      });
    } else {
      // base klaxon: two horn tones, slow, each one swelling and sagging like a big compressor horn
      L.scale = 0.6;
      const lp = filt("lowpass", 2400, 0.7);
      const bp = filt("bandpass", 900, 0.9);
      const g = mkGain(0);
      bp.connect(lp);
      lp.connect(g);
      g.connect(L.gain);
      const oscs = [osc("sawtooth", 392, t, far), osc("sawtooth", 393.6, t, far), osc("square", 196, t, far)];
      const og = [0.5, 0.45, 0.22];
      for (let i = 0; i < 3; i++) {
        const x = mkGain(og[i]);
        oscs[i].connect(x);
        x.connect(bp);
        L.nodes.push(oscs[i]);
      }
      lfo(L, t, 31, 0.012, g.gain); // the horn's reed buzz
      let next = t + 0.05;
      let hi = false;
      every(L, 300, (now) => {
        if (next < now) { next = now + 0.05; }
        while (next < now + 1.2) {
          hi = !hi;
          const f = hi ? 440 : 349.2;
          const mult = [1, 1.004, 0.5];
          for (let i = 0; i < 3; i++) {
            oscs[i].frequency.setValueAtTime(f * mult[i] * 0.94, next);
            oscs[i].frequency.linearRampToValueAtTime(f * mult[i], next + 0.12);
            oscs[i].frequency.setTargetAtTime(f * mult[i] * 0.97, next + 0.6, 0.12);
          }
          g.gain.setTargetAtTime(0.16, next, 0.04);
          g.gain.setTargetAtTime(0.02, next + 0.7, 0.07);
          next += 0.95;
        }
      });
    }
  }

  function siren(on, kind = "base") {
    setLoop("siren", on ? 1 : 0, buildSiren, 0.5, kind === "circus" ? "circus" : "base");
  }

  function buildSearchlight(L, t) {
    loopOut(L, wBus, wVerb, 0.06);
    L.scale = 0.5;
    const far = t + 1e6;
    // a big lamp ballast: mains hum with its harmonics and a fizzing arc on top
    const hum = mkGain(0.09);
    const fs = [100, 200.3, 300.5, 400];
    const as = [1, 0.5, 0.3, 0.12];
    for (let i = 0; i < fs.length; i++) {
      const o = osc(i === 2 ? "triangle" : "sine", fs[i], t, far);
      const x = mkGain(as[i]);
      o.connect(x);
      x.connect(hum);
      L.nodes.push(o);
    }
    hum.connect(L.gain);
    lfo(L, t, 0.17, 0.02, hum.gain);
    const fizz = bed(L, t, whiteBuf, "bandpass", 3600, 1.4, 0.018, null, 1);
    lfo(L, t, 100, 0.016, fizz.g.gain);
    lfo(L, t, 0.23, 600, fizz.f.frequency);
  }

  function searchlightHum(level) {
    setLoop("searchlight", level, buildSearchlight, 0.4);
  }

  function explosion(dist = 0) {
    if (!ready() || !gate("boom", 0.1)) return;
    const d = clamp(num(dist, 0), 0, 1);
    const near = 1 - d;
    const dest = wd(rnd(-0.1, 0.1), d * 0.8, 0.35, 1.25);
    one(dest, (t, keep) => {
      // the crack of the drum bursting (near only), then the "whoomp" of the fuel going up
      if (near > 0.15) {
        keep(burst(dest, t, { buf: whiteBuf, type: "highpass", q: 0.5, f0: 900, attack: 0.001, peak: 0.9 * near, tc: 0.03 }));
        keep(crackle(dest, t, 0.4, 1800, 0.3 * near, 0.35, false));
      }
      keep(thump(dest, t, 110, 24, 0.7, 0.006, 1.1, 0.34));
      keep(thump(dest, t, 220, 44, 0.25, 0.005, 0.5, 0.12));
      keep(burst(dest, t, {
        buf: pinkBuf, type: "lowpass", q: 0.6, rate: 0.8, f0: 3200 - 2000 * d, f1: 90, sweep: 0.9,
        attack: 0.004, peak: 1.0, tc: 0.3,
      }));
      // fireball: a rolling, breathing roar that rises and dies
      keep(rumble(dest, t + 0.05, 2.4, 520, 0.6, 5, 0.5));
      keep(whoosh(dest, t + 0.08, 300, 1500, 240, 0.35, 1.2, 0.3, 0.7, pinkBuf));
      // second, softer whump as the next drum goes
      keep(thump(dest, t + 0.42, 84, 26, 0.5, 0.01, 0.6, 0.25));
      keep(burst(dest, t + 0.42, {
        buf: pinkBuf, type: "lowpass", q: 0.6, rate: 0.7, f0: 1400, f1: 100, sweep: 0.6, attack: 0.01, peak: 0.5, tc: 0.25,
      }));
      // debris raining down afterwards
      if (near > 0.2) {
        keep(crackle(dest, t + 0.5, 1.6, 2400, 0.09 * near, 0.14, false));
        for (let i = 0; i < 5; i++) {
          const td = t + rnd(0.7, 2.1);
          if (Math.random() < 0.5) keep(clang(dest, td, rnd(500, 1400), 0.04 * near, rnd(0.06, 0.14), 4));
          else keep(thump(dest, td, rnd(120, 200), 70, 0.05, 0.004, 0.14 * near, 0.03));
        }
      }
    });
  }

  // ---- items ----------------------------------------------------------------------

  function paperRustle() {
    if (!ready() || !gate("paper", 0.05)) return;
    const dest = out(rnd(-0.1, 0.1), 0.05);
    one(dest, (t, keep) => {
      keep(crackle(dest, t, rnd(0.16, 0.24), 3000, 0.11, 0.4, false));
      keep(fabricRustle(dest, t, 0.2, rnd(4800, 6400), 0.8, 0.09, 4));
      keep(fabricRustle(dest, t + 0.03, 0.14, 2400, 0.9, 0.04, 2));
    });
  }

  function paperUnfold() {
    if (!ready() || !gate("paper", 0.05)) return;
    const dest = out(rnd(-0.1, 0.1), 0.07);
    one(dest, (t, keep) => {
      // three folds opening, each a crinkle, and the sheet snapping flat
      for (let i = 0; i < 3; i++) {
        const tf = t + i * rnd(0.2, 0.26);
        keep(crackle(dest, tf, rnd(0.13, 0.19), 2600 + i * 500, 0.1, 0.35, i === 2));
        keep(fabricRustle(dest, tf, 0.18, rnd(4200, 6000), 0.8, 0.08, 3));
      }
      keep(thump(dest, t + 0.68, 260, 140, 0.04, 0.004, 0.1, 0.025));
      keep(burst(dest, t + 0.68, { buf: whiteBuf, type: "bandpass", q: 0.8, f0: 3200, attack: 0.003, peak: 0.12, tc: 0.02 }));
    });
  }

  function armorClank(weight = 0.5) {
    if (!ready() || !gate("clank", 0.03)) return;
    const w = clamp(num(weight, 0.5), 0, 1);
    const dest = wOut(rnd(-0.15, 0.15), 0.14);
    one(dest, (t, keep) => {
      const f = 1300 - 850 * w;
      keep(clang(dest, t, f * rnd(0.94, 1.06), 0.09 + 0.1 * w, 0.06 + 0.22 * w, 5));
      keep(thump(dest, t, 240 - 110 * w, 80, 0.04, 0.003, 0.16 + 0.3 * w, 0.03 + 0.03 * w));
      keep(tick(dest, t, 3600, 0.1));
      if (w > 0.35) keep(clang(dest, t + rnd(0.05, 0.09), f * 1.34, 0.05 * w, 0.1, 4)); // a second plate answering
      if (w > 0.7) keep(rattle(dest, t + 0.04, 0.25, 2400, 3, 0.05, 0.3));
    });
  }

  function leverPull() {
    if (!ready() || !gate("lever", 0.15)) return;
    const dest = wOut(0, 0.14);
    one(dest, (t, keep) => {
      // ratchet teeth, a groan of the arm, the heavy "ka-chunk" as it seats
      for (let i = 0; i < 5; i++) {
        const tk = t + i * (0.055 - i * 0.004);
        keep(tick(dest, tk, 2400 + i * 160, 0.12));
        keep(clang(dest, tk, 1700 + i * 90, 0.02, 0.02, 3));
      }
      keep(creak(dest, t + 0.02, 210, 0.28, 0.05));
      keep(thump(dest, t + 0.32, 150, 56, 0.08, 0.004, 0.55, 0.06));
      keep(clang(dest, t + 0.32, 420, 0.12, 0.2, 5));
      keep(knock(dest, t + 0.32, 260, 0.2, 0.03));
      keep(rattle(dest, t + 0.36, 0.2, 2200, 3, 0.04, 0.3));
    });
  }

  function gateOpen(heavy = false) {
    if (!ready() || !gate("gate", 0.3)) return;
    const dest = wOut(0, heavy ? 0.3 : 0.16);
    one(dest, (t, keep) => {
      if (heavy) {
        // bolts thrown, a motor taking the load, chain running, the long groan of steel - and the stop
        keep(clang(dest, t, 300, 0.2, 0.3, 5));
        keep(thump(dest, t, 130, 50, 0.08, 0.004, 0.5, 0.07));
        const dur = 2.1;
        const g = ctx.createGain();
        const e = swell(g.gain, t + 0.15, 0.3, 0.1, t + 0.15 + dur, 0.1);
        const m = osc("sawtooth", 58, t + 0.15, e);
        m.frequency.linearRampToValueAtTime(82, t + 0.7);
        m.frequency.setTargetAtTime(74, t + 0.7, 0.3);
        const lp = filt("lowpass", 420, 1.5);
        m.connect(lp);
        lp.connect(g);
        g.connect(dest);
        keep(e);
        keep(rattle(dest, t + 0.2, dur, 2600, 3, 0.07, 0.45));
        keep(rumble(dest, t + 0.2, dur, 260, 0.3, 6, 0.5));
        for (let i = 0; i < 4; i++) {
          const f = rnd(150, 260);
          keep(creak(dest, t + 0.3 + i * 0.47 + rnd(0, 0.1), f, rnd(0.4, 0.6), 0.07));
          keep(creak(dest, t + 0.33 + i * 0.47, f * 2.02, 0.4, 0.025));
        }
        keep(thump(dest, t + 0.2 + dur, 96, 34, 0.14, 0.004, 0.8, 0.12));
        keep(clang(dest, t + 0.2 + dur, 210, 0.24, 0.5, 6));
        keep(rattle(dest, t + 0.25 + dur, 0.5, 2000, 2.5, 0.06, 0.25));
      } else {
        keep(tick(dest, t, 2800, 0.14));
        keep(clang(dest, t, 1500, 0.05, 0.06, 4));
        keep(creak(dest, t + 0.06, rnd(300, 380), 0.55, 0.06));
        keep(creak(dest, t + 0.1, rnd(520, 640), 0.4, 0.025));
        keep(rattle(dest, t + 0.1, 0.5, 3600, 3, 0.04, 0.25));
        keep(knock(dest, t + 0.66, 220, 0.2, 0.03));
      }
    });
  }

  function fenceRattle() {
    if (!ready() || !gate("fence", 0.08)) return;
    const dest = wOut(rnd(-0.2, 0.2), 0.14);
    one(dest, (t, keep) => {
      // chain-link: a shiver of thousands of little wire contacts, running outward and dying
      keep(rattle(dest, t, rnd(0.5, 0.7), rnd(3800, 4600), 2.2, 0.16, 0.6));
      keep(rattle(dest, t + 0.03, 0.45, rnd(6200, 7400), 3, 0.07, 0.5));
      keep(thump(dest, t, 180, 90, 0.05, 0.004, 0.16, 0.035));
      const f = rnd(700, 900);
      for (let i = 0; i < 4; i++) keep(clang(dest, t + i * rnd(0.045, 0.07), f * (1 + i * 0.07), 0.035 - i * 0.006, 0.12, 4));
      keep(tone(dest, t, "sine", rnd(96, 110), 88, 0.4, 0.03, 0.02, 0.12)); // the post humming
    });
  }

  function buildTruck(L, t) {
    loopOut(L, wBus, wVerb, 0.1);
    L.scale = 0.6;
    const far = t + 1e6;
    // a big diesel: slow firing pulses, a rattling body, exhaust breath; it revs lazily
    const fire = osc("sawtooth", 34, t, far);
    const sub = osc("sine", 34, t, far);
    const lp = filt("lowpass", 240, 1.4);
    const g = mkGain(0.22);
    const sg = mkGain(0.3);
    fire.connect(lp);
    lp.connect(g);
    sub.connect(sg);
    sg.connect(g);
    g.connect(L.gain);
    L.nodes.push(fire, sub);
    lfo(L, t, 17, 0.1, g.gain); // the lumpy half-order
    const clat = bed(L, t, pinkBuf, "bandpass", 1500, 1.6, 0.03, null, 1);
    const chop = osc("square", 34, t, far);
    const cg = mkGain(0.03);
    chop.connect(cg);
    cg.connect(clat.g.gain);
    L.nodes.push(chop);
    const ex = bed(L, t, pinkBuf, "lowpass", 520, 0.6, 0.07, null, 0.7);
    lfo(L, t, 8.5, 0.03, ex.g.gain);
    // lazy revs
    const rev = (o, depth) => { lfo(L, t, 0.13, depth, o.frequency); lfo(L, t, 0.31, depth * 0.4, o.frequency); };
    rev(fire, 5);
    rev(sub, 5);
    rev(chop, 5);
    lfo(L, t, 0.13, 60, lp.frequency);
  }

  function truckEngine(on) {
    setLoop("truck", on ? 1 : 0, buildTruck, 0.8);
  }

  // ---- helicopter -----------------------------------------------------------------

  const H = { on: false, rpm: 0.6, load: 0.2, dist: 0, t0: 0 };

  function buildHeli(L, t) {
    loopOut(L, wBus, wVerb, 0.1);
    L.scale = 0.85;
    const far = t + 1e6;
    const mix = mkGain(1);
    const lp = filt("lowpass", 16000, 0.5);
    mix.connect(lp);
    lp.connect(L.gain);

    // the blade-pass clock: a narrow periodic pulse (sum of cosines), one peak per blade
    const N = 14;
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    for (let k = 1; k < N; k++) re[k] = Math.exp(-0.2 * k);
    const blade = ctx.createOscillator();
    blade.setPeriodicWave(ctx.createPeriodicWave(re, im));
    blade.frequency.setValueAtTime(1.2, t);
    blade.start(t);
    blade.stop(far);

    const am = (depth, gainNode) => {
      const d = mkGain(depth);
      blade.connect(d);
      d.connect(gainNode.gain);
      return d;
    };

    // 1. blade slap: the "wop-wop": low-passed air, opened once per blade
    const slapSrc = noise(pinkBuf, t, far, 0.8);
    const slapLP = filt("lowpass", 600, 0.9);
    const slapG = mkGain(0.03);
    slapSrc.connect(slapLP);
    slapLP.connect(slapG);
    slapG.connect(mix);
    const slapD = am(0.2, slapG);

    // 2. the pressure pulse you feel in the chest
    const sub = osc("sine", 40, t, far);
    const subG = mkGain(0);
    sub.connect(subG);
    subG.connect(mix);
    const subD = am(0.1, subG);

    // 3. heavy "chop" under load: a sharper, brighter crack on every blade
    const chopSrc = noise(whiteBuf, t, far, 1);
    const chopBP = filt("bandpass", 1300, 0.9);
    const chopG = mkGain(0);
    chopSrc.connect(chopBP);
    chopBP.connect(chopG);
    chopG.connect(mix);
    const chopD = am(0, chopG);

    // 4. the swish of the tips
    const swSrc = noise(whiteBuf, t, far, 1.2);
    const swHP = filt("highpass", 3200, 0.5);
    const swG = mkGain(0.004);
    swSrc.connect(swHP);
    swHP.connect(swG);
    swG.connect(mix);
    const swD = am(0.008, swG);

    // 5. turbine: a whine with its fifth, through a resonance that tracks it
    const tur = osc("sawtooth", 260, t, far);
    const tur2 = osc("sawtooth", 391, t, far);
    const tur2G = mkGain(0.5);
    const turBP = filt("bandpass", 900, 3);
    const turG = mkGain(0.002);
    tur.connect(turBP);
    tur2.connect(tur2G);
    tur2G.connect(turBP);
    turBP.connect(turG);
    turG.connect(mix);
    const hiss = bed(L, t, whiteBuf, "bandpass", 5200, 0.8, 0.0, mix, 1);

    // 6. engine / gearbox drone
    const drone = osc("sawtooth", 30, t, far);
    const drone2 = osc("triangle", 60.4, t, far);
    const droneLP = filt("lowpass", 260, 0.8);
    const droneG = mkGain(0.02);
    drone.connect(droneLP);
    drone2.connect(droneLP);
    droneLP.connect(droneG);
    droneG.connect(mix);

    // 7. tail rotor buzz
    const tail = osc("square", 20, t, far);
    const tailBP = filt("bandpass", 950, 1.6);
    const tailG = mkGain(0);
    tail.connect(tailBP);
    tailBP.connect(tailG);
    tailG.connect(mix);

    L.nodes.push(blade, slapSrc, sub, chopSrc, swSrc, tur, tur2, drone, drone2, tail);
    L.h = {
      mix, lp, blade, slapLP, slapG, slapD, sub, subD, chopBP, chopD, swG, swD,
      tur, tur2, turBP, turG, hiss, drone, drone2, droneG, tail, tailG,
    };
    H.t0 = t;
    every(L, 50, heliApply);
  }

  function heliParams(L, now, r, load, dist, tc) {
    const h = L.h;
    const bladeHz = 1.2 + 18 * r;                      // two blades: ~12 Hz at idle, ~19 Hz flat out
    sp(h.blade.frequency, bladeHz, now, tc);
    sp(h.slapLP.frequency, 380 + 520 * r + 1000 * load, now, tc);
    sp(h.slapG.gain, 0.03 + 0.2 * r, now, tc);
    sp(h.slapD.gain, (0.2 + 0.55 * r) * (1 + 0.7 * load), now, tc);
    sp(h.sub.frequency, 36 + 26 * r, now, tc);
    sp(h.subD.gain, 0.1 + 0.36 * r + 0.25 * load * r, now, tc);
    sp(h.chopBP.frequency, 1100 + 1100 * load, now, tc);
    sp(h.chopD.gain, 0.34 * load * r, now, tc);
    sp(h.swG.gain, 0.004 + 0.03 * r, now, tc);
    sp(h.swD.gain, 0.008 + 0.04 * r, now, tc);
    const tf = 230 + 2300 * Math.pow(r, 1.3) - 170 * load * r; // the turbine sags when it is asked for more
    sp(h.tur.frequency, tf, now, tc);
    sp(h.tur2.frequency, tf * (1.503 + 0.012 * load), now, tc); // ...and its partials drift apart: strained
    sp(h.turBP.frequency, clamp(tf * 1.5, 300, 6000), now, tc);
    sp(h.turG.gain, 0.002 + 0.03 * r + 0.035 * load * r, now, tc);
    sp(h.hiss.g.gain, 0.012 * r + 0.02 * load * r, now, tc);
    sp(h.drone.frequency, 26 + 60 * r - 8 * load * r, now, tc);
    sp(h.drone2.frequency, (26 + 60 * r - 8 * load * r) * 2.013, now, tc);
    sp(h.droneG.gain, 0.02 + 0.13 * r + 0.1 * load * r, now, tc);
    sp(h.tail.frequency, bladeHz * 5.3, now, tc);
    sp(h.tailG.gain, 0.014 * r, now, tc);
    sp(h.lp.frequency, 16000 * Math.pow(0.05, dist), now, tc);
    sp(h.mix.gain, 1 - 0.78 * dist, now, tc);
  }

  function heliApply(now) {
    const L = loops.heli;
    if (!L || !L.h) return;
    const s = clamp((now - H.t0) / 3, 0, 1);            // the 3 s spool-up
    const spool = s * s * (3 - 2 * s);
    heliParams(L, now, clamp(H.rpm, 0, 1) * spool, clamp(H.load, 0, 1) * spool, clamp(H.dist, 0, 1), 0.09);
  }

  const heli = {
    start() {
      if (H.on && (loops.heli || want.heli)) return;
      H.on = true;
      H.rpm = 0.6;
      H.load = 0.2;
      H.dist = 0;
      setLoop("heli", 1, buildHeli, 0.4);
      if (!ready()) return;
      const dest = wOut(0, 0.1);
      one(dest, (t, keep) => {
        // starter: igniter ticks, the starter motor whining up, the "whump" of light-off
        for (let i = 0; i < 9; i++) keep(tick(dest, t + 0.05 + i * (0.11 - i * 0.006), 3400, 0.07));
        const g = ctx.createGain();
        const e = swell(g.gain, t, 0.5, 0.07, t + 2.6, 0.25);
        const o = osc("sawtooth", 150, t, e);
        o.frequency.exponentialRampToValueAtTime(1700, t + 2.9);
        const bp = filt("bandpass", 400, 2);
        bp.frequency.setValueAtTime(400, t);
        bp.frequency.exponentialRampToValueAtTime(3400, t + 2.9);
        o.connect(bp);
        bp.connect(g);
        g.connect(dest);
        keep(e);
        keep(thump(dest, t + 1.0, 90, 40, 0.2, 0.02, 0.3, 0.12));
        keep(burst(dest, t + 1.0, {
          buf: pinkBuf, type: "lowpass", q: 0.6, f0: 300, f1: 1400, sweep: 1.6, attack: 0.3, peak: 0.16, tc: 0.5,
        }));
      });
    },
    stop(crashed = false) {
      const was = H.on;
      H.on = false;
      const L = loops.heli;
      if (L && L.h && ctx && ctx.state !== "closed") {
        const now = ctx.currentTime;
        if (crashed) {
          heliParams(L, now, 0.05, 0, H.dist, 0.07);     // the rotor stops dead
        } else {
          heliParams(L, now, 0.03, 0, H.dist, 0.8);      // a long spool-down
        }
      }
      setLoop("heli", 0, buildHeli, crashed ? 0.3 : 3.2);
      if (crashed && was && ready()) {
        const dest = wOut(0, 0.15);
        one(dest, (t, keep) => {
          // the turbine choking: a fast falling whine and a cough
          keep(tone(dest, t, "sawtooth", 1500, 160, 0.45, 0.04, 0.01, 0.1));
          keep(burst(dest, t + 0.1, {
            buf: pinkBuf, type: "lowpass", q: 0.7, f0: 900, f1: 160, sweep: 0.3, attack: 0.02, peak: 0.2, tc: 0.1,
          }));
        });
      }
    },
    set(rpm, load, dist = 0) {
      H.rpm = clamp(num(rpm, H.rpm), 0, 1);
      H.load = clamp(num(load, H.load), 0, 1);
      H.dist = clamp(num(dist, 0), 0, 1);
    },
    get on() { return H.on; },
  };

  function buildWind(L, t) {
    loopOut(L, wBus, wVerb, 0.05);
    // air over the ears: a wide moving band, a low buffet, and at speed a thin whistle through the frame
    const body = bed(L, t, pinkBuf, "bandpass", 500, 0.5, 0.3, null, 0.9);
    lfo(L, t, 0.13, 140, body.f.frequency);
    lfo(L, t, 0.31, 0.08, body.g.gain);
    lfo(L, t, 0.83, 0.04, body.g.gain);
    const low = bed(L, t, pinkBuf, "lowpass", 160, 0.7, 0.3, null, 0.5);
    lfo(L, t, 0.47, 0.12, low.g.gain);
    const wh = bed(L, t, whiteBuf, "bandpass", 1500, 9, 0, null, 1);
    lfo(L, t, 0.21, 260, wh.f.frequency);
    L.set = (lv, tt) => {
      sp(body.f.frequency, 360 + 900 * lv, tt, 0.3);
      sp(low.f.frequency, 120 + 160 * lv, tt, 0.3);
      sp(wh.g.gain, 0.3 * Math.max(0, lv - 0.45), tt, 0.3);
      sp(wh.f.frequency, 1100 + 1400 * lv, tt, 0.3);
    };
  }

  function wind(level) {
    setLoop("wind", level, buildWind, 0.6);
  }

  function gust(strength = 0.6, pan = 0) {
    if (!ready() || !gate("gust", 0.15)) return;
    const s = clamp(num(strength, 0.6), 0.05, 1);
    const t = ctx.currentTime + 0.004;
    const p0 = clamp(num(pan, 0), -1, 1);
    const g = mkGain(1);
    let last = g;
    if (ctx.createStereoPanner) {
      // it arrives from its side and blows through to the other
      const pn = ctx.createStereoPanner();
      pn.pan.setValueAtTime(p0, t);
      pn.pan.linearRampToValueAtTime(clamp(-p0 * 0.6, -1, 1), t + 1.8);
      g.connect(pn);
      last = pn;
    }
    last.connect(wBus);
    const up = 0.5 + 0.4 * (1 - s);
    let tEnd = whoosh(g, t, 260, 700 + 900 * s, 300, up, 1.1, 0.5 * s, 0.6, pinkBuf);
    tEnd = Math.max(tEnd, whoosh(g, t + 0.1, 900, 2200 + 1500 * s, 1000, up, 0.8, 0.12 * s, 1.4, whiteBuf));
    tEnd = Math.max(tEnd, rumble(g, t, up + 1.2, 150, 0.4 * s, 4, 0.5));
    if (s > 0.5) tEnd = Math.max(tEnd, whoosh(g, t + 0.2, 1300, 2100, 1500, up, 0.6, 0.05 * s, 12, whiteBuf)); // whistle
    release(g, tEnd + 0.15);
  }

  function crash(size = 0.7) {
    if (!ready() || !gate("crash", 0.1)) return;
    const s = clamp(num(size, 0.7), 0.05, 1);
    const dest = wOut(rnd(-0.1, 0.1), 0.22, 0.6 + 0.6 * s);
    one(dest, (t, keep) => {
      // IMPACT: sub thump + the crunch of sheet metal folding
      keep(thump(dest, t, 120, 26, 0.3, 0.004, 0.9 * s + 0.2, 0.16));
      keep(burst(dest, t, {
        buf: pinkBuf, type: "lowpass", q: 0.7, f0: 4200, f1: 260, sweep: 0.25, attack: 0.002, peak: 0.9, tc: 0.09,
      }));
      keep(burst(dest, t, { buf: whiteBuf, type: "highpass", q: 0.5, f0: 2000, attack: 0.001, peak: 0.4, tc: 0.02 }));
      keep(rattle(dest, t, 0.5 + 0.5 * s, 1300, 0.8, 0.5, 0.5));
      const n = irnd(4, 5) + ((s * 4) | 0);
      for (let i = 0; i < n; i++) {
        keep(clang(dest, t + Math.pow(Math.random(), 1.6) * (0.3 + 0.5 * s), rnd(180, 900), rnd(0.08, 0.2), rnd(0.1, 0.4), 5));
      }
      // tearing / buckling groans
      keep(creak(dest, t + 0.05, rnd(130, 190), 0.5, 0.1));
      keep(creak(dest, t + 0.2, rnd(240, 340), 0.4, 0.06));
      // glass
      const ng = 6 + ((s * 12) | 0);
      for (let i = 0; i < ng; i++) {
        keep(bell(dest, t + 0.03 + Math.pow(Math.random(), 1.7) * 0.6, rnd(2200, 6400), rnd(0.012, 0.045), rnd(0.03, 0.09)));
      }
      keep(crackle(dest, t + 0.02, 0.5, 3600, 0.12 * s, 0.3, false));
      // debris tail: bits bouncing, sliding, settling
      const tail = 0.8 + 1.6 * s;
      keep(crackle(dest, t + 0.4, tail, 2400, 0.07, 0.14, false));
      keep(rumble(dest, t + 0.2, tail, 300, 0.25 * s, 5, 0.5));
      for (let i = 0; i < 3 + ((s * 4) | 0); i++) {
        const td = t + 0.5 + Math.random() * tail;
        keep(clang(dest, td, rnd(600, 2200), rnd(0.02, 0.05), rnd(0.05, 0.14), 4));
        keep(thump(dest, td, rnd(140, 220), 80, 0.04, 0.004, 0.1, 0.025));
      }
      // a hubcap that will not lie down
      if (s > 0.5) {
        const tw = t + 0.9;
        for (let i = 0; i < 7; i++) keep(clang(dest, tw + i * (0.16 - i * 0.02), 1250, 0.03 - i * 0.003, 0.07, 3));
      }
    });
  }

  function metalScrape(pan = 0) {
    if (!ready() || !gate("scrape", 0.12)) return;
    const dest = wd(clamp(num(pan, 0), -1, 1) * 0.8, 0, 0.14);
    one(dest, (t, keep) => {
      // skid on metal: a stick-slip screech, a band of grinding, sparks
      const dur = rnd(0.4, 0.6);
      const f = rnd(1300, 1900);
      const g = ctx.createGain();
      const e = swell(g.gain, t, 0.03, 0.045, t + dur, 0.06);
      const o = osc("sawtooth", f, t, e);
      o.frequency.linearRampToValueAtTime(f * rnd(0.7, 0.86), t + dur);
      const fm = osc("sine", rnd(60, 95), t, e);
      const fg = mkGain(f * 0.12);
      fm.connect(fg);
      fg.connect(o.frequency);
      const bp = filt("bandpass", f * 1.7, 3);
      o.connect(bp);
      bp.connect(g);
      g.connect(dest);
      keep(e);
      keep(rattle(dest, t, dur, rnd(2600, 3600), 5, 0.3, 0.8));
      keep(rumble(dest, t, dur, 500, 0.25, 4, 0.8));
      keep(crackle(dest, t, dur, 5200, 0.07, 0.3, false));
    });
  }

  function buildWarnBeep(L, t) {
    L.gain.connect(bus);
    L.scale = 0.5;
    // cockpit master caution: beep-beep ... beep-beep, two pitches, a small speaker
    const bp = filt("bandpass", 1900, 1.5);
    bp.connect(L.gain);
    let next = t + 0.02;
    every(L, 250, (now) => {
      if (next < now) next = now + 0.03;
      while (next < now + 0.8) {
        tone(bp, next, "square", 1568, 1568, 0.07, 0.14, 0.004, 0.008);
        tone(bp, next + 0.13, "square", 1975.5, 1975.5, 0.07, 0.14, 0.004, 0.008);
        next += 0.52;
      }
    });
  }

  function warnBeep(on) {
    setLoop("warnBeep", on ? 1 : 0, buildWarnBeep, 0.3);
  }

  function buildRotorWash(L, t) {
    loopOut(L, wBus, wVerb, 0.04);
    L.scale = 0.7;
    // downwash hitting the ground: a wide torn hiss that flutters with the blades, dust and grit in it
    const a = bed(L, t, whiteBuf, "bandpass", 1900, 0.5, 0.12, null, 1.1);
    lfo(L, t, 13.5, 0.05, a.g.gain);
    lfo(L, t, 0.37, 500, a.f.frequency);
    const b = bed(L, t, pinkBuf, "lowpass", 420, 0.6, 0.22, null, 0.7);
    lfo(L, t, 13.5, 0.07, b.g.gain);
    lfo(L, t, 0.61, 0.06, b.g.gain);
    const grit = bed(L, t, whiteBuf, "highpass", 5200, 0.5, 0.03, null, 1.3);
    lfo(L, t, 1.7, 0.02, grit.g.gain);
  }

  function rotorWash(level) {
    setLoop("rotorWash", level, buildRotorWash, 0.4);
  }

  // ---- circus ---------------------------------------------------------------------

  // waltz fragments: [beat, midi, beats]; 4 bars of 3/4 each; chords per bar
  const CAL = [
    { m: [[0, 72, 1], [1, 76, 1], [2, 79, 1], [3, 84, 2], [5, 79, 1], [6, 81, 1], [7, 77, 1], [8, 74, 1], [9, 76, 3]], c: [0, 0, 1, 0] },
    { m: [[0, 79, 1.5], [1.5, 77, 0.5], [2, 76, 1], [3, 74, 2], [5, 71, 1], [6, 72, 1], [7, 76, 1], [8, 79, 1], [9, 84, 3]], c: [0, 1, 0, 0] },
    { m: [[0, 69, 1], [1, 72, 1], [2, 76, 1], [3, 75, 2], [5, 72, 1], [6, 71, 1], [7, 68, 1], [8, 71, 1], [9, 69, 3]], c: [3, 3, 4, 3] },
    { m: [[0, 84, 1], [1, 83, 1], [2, 84, 1], [3, 81, 1], [4, 77, 1], [5, 81, 1], [6, 79, 1], [7, 76, 1], [8, 79, 1], [9, 72, 3]], c: [0, 2, 0, 0] },
  ];
  const CAL_CH = [
    [48, [60, 64, 67]],   // C
    [43, [59, 62, 65]],   // G7
    [41, [60, 65, 69]],   // F
    [45, [60, 64, 69]],   // Am
    [40, [59, 62, 68]],   // E7
  ];

  /** One steam-whistle note: a breathy chiff, a square pipe a little out of tune, pressure sagging in. */
  function calNote(dest, t, f, dur, peak) {
    const g = ctx.createGain();
    const tEnd = swell(g.gain, t, 0.035, peak, t + dur * 0.84, 0.03);
    const a = osc("square", f * 0.982, t, tEnd);
    a.frequency.linearRampToValueAtTime(f, t + 0.07);
    a.detune.value = rnd(-16, 16);
    const b = osc("sine", f * 2.006, t, tEnd);
    const ag = mkGain(0.32);
    const lp = filt("lowpass", Math.min(5200, f * 4.5), 0.6);
    const vib = osc("sine", rnd(5, 6.2), t, tEnd);
    const vg = mkGain(f * 0.006);
    vib.connect(vg);
    vg.connect(a.frequency);
    a.connect(ag);
    ag.connect(lp);
    b.connect(lp);
    lp.connect(g);
    g.connect(dest);
    burst(dest, t, {
      buf: whiteBuf, type: "bandpass", q: 2, f0: Math.min(6500, f * 3), attack: 0.008, peak: peak * 0.5, tc: 0.025,
    });
    return tEnd;
  }

  /** A waltz fragment on the calliope. Returns its end time. */
  function calliopeInto(dest, t, n, bars, vol) {
    const fr = CAL[((n | 0) % CAL.length + CAL.length) % CAL.length];
    const bs = 0.335;
    const nb = Math.min(4, bars || 4);
    let tEnd = t;
    for (let bar = 0; bar < nb; bar++) {
      const ch = CAL_CH[fr.c[bar]];
      const tb = t + bar * 3 * bs;
      tEnd = Math.max(tEnd, calNote(dest, tb, midi(ch[0]), bs * 0.9, 0.1 * vol));          // oom
      for (let k = 1; k < 3; k++) {                                                       // pah pah
        for (let j = 0; j < 3; j++) calNote(dest, tb + k * bs + rnd(0, 0.012), midi(ch[1][j]), bs * 0.45, 0.032 * vol);
      }
    }
    for (let i = 0; i < fr.m.length; i++) {
      const ev = fr.m[i];
      if (ev[0] >= nb * 3) break;
      const tn = t + ev[0] * bs + rnd(0, 0.014);
      tEnd = Math.max(tEnd, calNote(dest, tn, midi(ev[1]), ev[2] * bs, 0.085 * vol));
      calNote(dest, tn, midi(ev[1] + 12), ev[2] * bs, 0.025 * vol);
    }
    // the bellows / steam under it all
    burst(dest, t, {
      buf: pinkBuf, type: "bandpass", q: 0.6, f0: 2400, attack: 0.3, peak: 0.02 * vol, tc: nb * 3 * bs * 0.4,
    });
    return tEnd + 0.2;
  }

  function calliope(n = 0) {
    if (!ready() || !gate("calliope", 0.5)) return;
    const dest = wOut(rnd(-0.1, 0.1), 0.25);
    one(dest, (t, keep) => {
      // it wheezes awake first: air, a sagging first pipe, then the tune
      keep(burst(dest, t, {
        buf: pinkBuf, type: "bandpass", q: 0.8, f0: 900, f1: 2600, sweep: 0.3, attack: 0.2, peak: 0.1, tc: 0.08,
      }));
      keep(calliopeInto(dest, t + 0.3, num(n, 0), 4, 1));
    });
  }

  /** One flap of heavy canvas. */
  function flapInto(dest, t, s, keep) {
    keep(thump(dest, t, rnd(100, 125), 56, 0.09, 0.012, 0.4 * s, 0.06));
    keep(burst(dest, t, {
      buf: pinkBuf, type: "lowpass", q: 0.6, rate: rnd(0.8, 1.1),
      f0: rnd(1300, 1900), f1: 260, sweep: 0.14, attack: 0.012, peak: 0.5 * s, tc: 0.06,
    }));
    keep(fabricRustle(dest, t + 0.02, rnd(0.2, 0.32), rnd(1500, 2400), 0.8, 0.1 * s, 4));
    if (Math.random() < 0.6) {
      // the slack running back along the cloth: a softer second flap
      keep(thump(dest, t + rnd(0.16, 0.24), rnd(120, 150), 70, 0.07, 0.014, 0.18 * s, 0.045));
      keep(fabricRustle(dest, t + 0.2, 0.2, 2000, 0.9, 0.06 * s, 3));
    }
    if (Math.random() < 0.4) keep(creak(dest, t + rnd(0.05, 0.2), rnd(260, 380), rnd(0.18, 0.3), 0.03 * s)); // a guy rope
  }

  function canvasFlap(strength = 0.6) {
    if (!ready() || !gate("flap", 0.06)) return;
    const dest = wOut(rnd(-0.4, 0.4), 0.12);
    one(dest, (t, keep) => flapInto(dest, t, clamp(num(strength, 0.6), 0.1, 1.2), keep));
  }

  function buildGeneratorCore(L, t, dest, sputter) {
    const far = t + 1e6;
    // a small petrol generator: putt-putt firing, a rattly cover, exhaust
    const fire = osc("sawtooth", 46, t, far);
    const lp = filt("lowpass", 300, 2);
    const g = mkGain(0.2);
    fire.connect(lp);
    lp.connect(g);
    g.connect(dest);
    const putt = osc("square", 23, t, far);
    const pg = mkGain(0.09);
    putt.connect(pg);
    pg.connect(g.gain);
    L.nodes.push(fire, putt);
    const ex = bed(L, t, pinkBuf, "bandpass", 700, 0.8, 0.05, dest, 0.8);
    const eg = mkGain(0.035);
    putt.connect(eg);
    eg.connect(ex.g.gain);
    const cover = bed(L, t, whiteBuf, "bandpass", 2600, 4, 0.012, dest, 1);
    lfo(L, t, 46, 0.01, cover.g.gain);
    lfo(L, t, 0.19, 1.6, fire.frequency);
    lfo(L, t, 0.19, 0.8, putt.frequency);
    if (sputter) {
      // running out of fuel: it stumbles, nearly dies, catches again
      let next = t + 0.4;
      every(L, 300, (now) => {
        if (next < now) next = now + 0.05;
        while (next < now + 0.8) {
          const hole = rnd(0.12, 0.4);
          sp(g.gain, 0.03, next, 0.03);
          sp(fire.frequency, rnd(26, 34), next, 0.06);
          sp(putt.frequency, rnd(13, 17), next, 0.06);
          sp(g.gain, 0.2, next + hole, 0.04);
          sp(fire.frequency, 46, next + hole, 0.1);
          sp(putt.frequency, 23, next + hole, 0.1);
          thump(dest, next + hole, 110, 50, 0.06, 0.004, 0.16, 0.04); // the backfire that catches it
          next += hole + rnd(0.3, 1.5);
        }
      });
    }
  }

  function buildGenerator(L, t, sputter) {
    loopOut(L, wBus, wVerb, 0.08);
    L.scale = 0.6;
    buildGeneratorCore(L, t, L.gain, sputter);
  }

  function generator(on, sputter = false) {
    setLoop("generator", on ? 1 : 0, buildGenerator, 0.5, !!sputter);
  }

  function buildCircus(L, t) {
    loopOut(L, wBus, wVerb, 0.16);
    // 1. the generator, far behind the wagons
    const genLP = filt("lowpass", 520, 0.5);
    const genG = mkGain(0.22);
    genLP.connect(genG);
    genG.connect(L.gain);
    buildGeneratorCore(L, t, genLP, false);
    // 2. night air moving over the tents
    const air = bed(L, t, pinkBuf, "bandpass", 620, 0.4, 0.022, null, 0.7);
    lfo(L, t, 0.05, 220, air.f.frequency);
    lfo(L, t, 0.083, 0.012, air.g.gain);
    // 3. the leftover crowd: a few people still awake somewhere, heard through canvas
    const mur = bed(L, t, pinkBuf, "bandpass", 380, 0.9, 0.022, null, 0.6);
    const mlp = filt("lowpass", 560, 0.5);
    mur.g.disconnect();
    mur.g.connect(mlp);
    mlp.connect(L.gain);
    lfo(L, t, 0.11, 0.012, mur.g.gain);
    lfo(L, t, 0.29, 80, mur.f.frequency);
    lfo(L, t, 2.3, 0.004, mur.g.gain);

    let nextCricket = t + 0.5;
    let nextFlap = t + 2;
    let nextCal = t + rnd(9, 16);
    let nextLaugh = t + rnd(12, 25);
    let calN = irnd(0, 3);
    const cf = [4100, 4520, 4980];
    every(L, 400, (now) => {
      if (nextCricket < now) nextCricket = now + 0.1;
      while (nextCricket < now + 0.9) {
        cricketPhrase(L, nextCricket, pick(cf) * rnd(0.98, 1.02), rnd(-0.9, 0.9), rnd(0.25, 0.8));
        nextCricket += rnd(0.5, 1.9);
      }
      if (nextFlap < now + 0.9) {
        const tf = Math.max(nextFlap, now + 0.05);
        const d = outTo(L.gain, wVerb, rnd(-0.8, 0.8), 0.2, rnd(0.25, 0.6));
        let e = tf;
        flapInto(d, tf, rnd(0.4, 0.9), (x) => { if (x > e) e = x; return x; });
        release(d, e + 0.2);
        nextFlap = tf + rnd(2.5, 8);
      }
      if (nextCal < now + 0.9) {
        // 2-4 bars of the waltz drifting across the field on the wind
        const tc = Math.max(nextCal, now + 0.05);
        const bars = irnd(2, 4);
        const len = bars * 3 * 0.335;
        const lp = filt("lowpass", rnd(1300, 2100), 0.6);
        const g = mkGain(0);
        g.gain.setValueAtTime(0, tc);
        g.gain.linearRampToValueAtTime(rnd(0.3, 0.5), tc + len * 0.4);
        g.gain.linearRampToValueAtTime(rnd(0.12, 0.3), tc + len * 0.7);
        g.gain.setTargetAtTime(0, tc + len * 0.85, 0.25);
        lp.connect(g);
        const d = outTo(L.gain, wVerb, rnd(-0.6, 0.6), 0.6, 1);
        g.connect(d);
        const e = calliopeInto(lp, tc, calN++, bars, 0.7);
        release(lp, e + 1.5);
        release(d, e + 1.6);
        nextCal = tc + len + rnd(18, 40);
      }
      if (nextLaugh < now + 0.9) {
        // somebody far off laughs at something, or a tin cup falls over
        const tl = Math.max(nextLaugh, now + 0.05);
        const lp = filt("lowpass", 1100, 0.5);
        const d = outTo(L.gain, wVerb, rnd(-0.8, 0.8), 0.7, 0.2);
        lp.connect(d);
        let e = tl;
        if (Math.random() < 0.6) {
          const k = rnd(0.9, 1.3);
          for (let i = 0; i < 4; i++) e = vox(lp, tl + i * 0.14, (200 - i * 14) * k, 160 * k, 0.08, 0.5, VOWELS[0], 0, 0);
        } else {
          e = clang(lp, tl, rnd(900, 1400), 0.3, 0.2, 4);
          clang(lp, tl + 0.18, rnd(900, 1400), 0.15, 0.15, 4);
        }
        release(lp, e + 0.3);
        release(d, e + 0.4);
        nextLaugh = tl + rnd(14, 34);
      }
    });
  }

  function circusAmbience(on) {
    setLoop("circus", on ? 1 : 0, buildCircus, 1.6);
  }

  function cageRattle() {
    if (!ready() || !gate("cage", 0.08)) return;
    const dest = wOut(rnd(-0.1, 0.1), 0.16);
    one(dest, (t, keep) => {
      // the whole door jumping in its frame: bars ringing against each other, the latch chattering
      keep(thump(dest, t, 150, 70, 0.06, 0.004, 0.4, 0.045));
      const n = irnd(5, 7);
      const f = rnd(620, 760);
      for (let i = 0; i < n; i++) {
        const tb = t + i * rnd(0.035, 0.06);
        keep(clang(dest, tb, f * pick([1, 1.12, 1.26, 0.94]), 0.11 * (1 - i / (n + 2)), rnd(0.09, 0.2), 5));
        keep(tick(dest, tb, rnd(2600, 3800), 0.08));
      }
      keep(rattle(dest, t, 0.4, 2800, 3, 0.1, 0.5));
      keep(creak(dest, t + 0.1, rnd(300, 400), 0.2, 0.03));
    });
  }

  function latchBreak() {
    if (!ready() || !gate("latch", 0.2)) return;
    const dest = wOut(0, 0.25);
    one(dest, (t, keep) => {
      // SNAP - the hasp shears, the pieces ring away across the floor, the door swings
      keep(burst(dest, t, { buf: whiteBuf, type: "highpass", q: 0.6, f0: 1800, attack: 0.001, peak: 0.6, tc: 0.012 }));
      keep(thump(dest, t, 260, 80, 0.05, 0.003, 0.6, 0.04));
      keep(clang(dest, t, 880, 0.22, 0.4, 6));
      keep(clang(dest, t + 0.01, 1318, 0.08, 0.25, 4));
      let tb = t + 0.22;
      let gap = 0.17;
      for (let i = 0; i < 6; i++) {
        keep(clang(dest, tb, rnd(1900, 2600), 0.07 - i * 0.01, 0.06, 4)); // the broken piece bouncing
        tb += gap;
        gap *= 0.68;
      }
      keep(creak(dest, t + 0.3, rnd(250, 320), 0.7, 0.07));
      keep(creak(dest, t + 0.35, rnd(480, 560), 0.6, 0.03));
      keep(clang(dest, t + 1.05, 520, 0.08, 0.3, 5)); // the door meeting its stop
    });
  }

  function strikerBell() {
    if (!ready() || !gate("striker", 0.25)) return;
    const dest = wOut(0, 0.4);
    one(dest, (t, keep) => {
      // high striker: THWACK on the pad, the puck zipping up the rail, DING!
      keep(thump(dest, t, 180, 60, 0.07, 0.003, 0.6, 0.05));
      keep(knock(dest, t, 240, 0.4, 0.03));
      keep(tone(dest, t + 0.03, "triangle", 300, 1900, 0.3, 0.05, 0.02, 0.02));
      keep(whoosh(dest, t + 0.03, 800, 4200, 4600, 0.3, 0.03, 0.06, 4, whiteBuf));
      const tb = t + 0.36;
      keep(tick(dest, tb, 4200, 0.2));
      keep(clang(dest, tb, 1760, 0.3, 1.1, 6));
      keep(bell(dest, tb, 1760, 0.16, 1.3));
      keep(bell(dest, tb, 3520, 0.05, 0.6));
      // the bell shimmering as it swings
      const g = ctx.createGain();
      const e = env(g.gain, tb, 0.01, 0.05, 0.9);
      const o = osc("sine", 1764, tb, e);
      const tr = mkGain(0.5);
      const l = osc("sine", 7, tb, e);
      const lg = mkGain(0.5);
      l.connect(lg);
      lg.connect(tr.gain);
      o.connect(tr);
      tr.connect(g);
      g.connect(dest);
      keep(e);
    });
  }

  function bottles() {
    if (!ready() || !gate("bottles", 0.15)) return;
    const dest = wOut(rnd(-0.2, 0.2), 0.2);
    one(dest, (t, keep) => {
      // a row of empties going over: hollow tonks, glass on glass, one rolling away
      const n = irnd(4, 6);
      for (let i = 0; i < n; i++) {
        const tb = t + i * rnd(0.06, 0.13);
        const f = rnd(420, 760);
        keep(tone(dest, tb, "sine", f, f * 0.985, 0.05, 0.1, 0.004, 0.06)); // the air in the bottle
        keep(bell(dest, tb, rnd(2200, 4400), 0.07, rnd(0.05, 0.12)));
        keep(tick(dest, tb, rnd(3600, 5200), 0.1));
        if (Math.random() < 0.5) keep(bell(dest, tb + rnd(0.05, 0.12), rnd(2600, 5000), 0.035, 0.06));
      }
      // the roller
      const tr = t + 0.5;
      keep(rattle(dest, tr, 0.9, 1800, 2.5, 0.05, 0.35));
      const g = ctx.createGain();
      const e = swell(g.gain, tr, 0.1, 0.03, tr + 0.7, 0.12);
      const o = osc("sine", 560, tr, e);
      o.frequency.linearRampToValueAtTime(520, tr + 0.9);
      const tm = mkGain(0.5);
      const l = osc("sine", 9, tr, e);
      l.frequency.linearRampToValueAtTime(3, tr + 0.9);
      const lg = mkGain(0.5);
      l.connect(lg);
      lg.connect(tm.gain);
      o.connect(tm);
      tm.connect(g);
      g.connect(dest);
      keep(e);
      keep(bell(dest, tr + 0.95, 3100, 0.04, 0.1)); // ...and stops against something
    });
  }

  // ---- jungle ---------------------------------------------------------------------

  const JL = { birds: 1, insects: 1, wind: 1 };

  /** One call of bird species `sp` into dest. Returns the time it ends. */
  function birdCall(dest, t, species, k) {
    let e = t;
    const up = (x) => { if (x > e) e = x; };
    let tt = t;
    if (species === 0) {
      // the whistler: two long pure notes, "fee - bee"
      up(tone(dest, tt, "sine", 3100 * k, 3060 * k, 0.26, 0.032, 0.03, 0.04));
      up(tone(dest, tt + 0.4, "sine", 2590 * k, 2520 * k, 0.34, 0.03, 0.03, 0.06));
    } else if (species === 1) {
      // the triller: one note repeated, faster and faster
      const n = irnd(9, 14);
      let gap = 0.13;
      for (let i = 0; i < n; i++) {
        up(tone(dest, tt, "sine", 3650 * k, 4300 * k, 0.04, 0.024, 0.008, 0.012));
        tt += gap;
        gap = Math.max(0.045, gap * 0.86);
      }
    } else if (species === 2) {
      // the parrot: two or three cheerful rasping squawks
      const n = irnd(2, 3);
      for (let i = 0; i < n; i++) {
        up(rasp(dest, tt, 900 * k, 720 * k, 2500 * k, 2.2, rnd(60, 85), rnd(0.14, 0.2), 0.11));
        tt += rnd(0.24, 0.34);
      }
    } else if (species === 3) {
      // the liquid one: a rising "bloo-OOP" and a gurgle of droplets after it
      up(tone(dest, tt, "sine", 520 * k, 2900 * k, 0.28, 0.035, 0.06, 0.03));
      for (let i = 0; i < 4; i++) {
        const f = rnd(1500, 2600) * k;
        up(thump(dest, tt + 0.36 + i * 0.05, f, f * 1.6, 0.04, 0.005, 0.022, 0.016));
      }
    } else if (species === 4) {
      // the dove: "hoo, hoo, hooooo"
      const ds = [0.2, 0.2, 0.5];
      for (let i = 0; i < 3; i++) {
        up(tone(dest, tt, "sine", 480 * k, 440 * k, ds[i], 0.045, 0.05, 0.06));
        tt += ds[i] + 0.16;
      }
    } else if (species === 5) {
      // the toucan: a dry rhythmic croak
      const n = irnd(4, 7);
      for (let i = 0; i < n; i++) {
        up(rasp(dest, tt, 300 * k, 280 * k, 1150 * k, 4, 48, 0.07, 0.12));
        tt += 0.19;
      }
    } else {
      // the warbler: a tumble of tiny high slurs
      const n = irnd(6, 10);
      for (let i = 0; i < n; i++) {
        const f = rnd(4200, 6000) * k;
        up(tone(dest, tt, "sine", f, f * rnd(0.75, 1.35), 0.05, 0.018, 0.01, 0.014));
        tt += rnd(0.07, 0.11);
      }
    }
    return e;
  }

  // every species has its own two perches (pan of the caller, pan of the one that answers)
  const PERCH = [[-0.6, 0.5], [0.7, -0.2], [0.2, -0.8], [-0.3, 0.8], [0.5, -0.5], [-0.8, 0.1], [0, 0.6]];

  function buildJungle(L, t, time) {
    loopOut(L, wBus, wVerb, 0.1);
    L.scale = 0.9;
    const far = t + 1e6;
    const day = time === "day";
    const night = time === "night";
    const dawn = time === "dawn";
    const mist = time === "mist";

    const birdG = mkGain(JL.birds);
    const birdGate = mkGain(1);       // the scream closes this: the birds are the last thing to come back
    const insG = mkGain(JL.insects);
    const windG = mkGain(JL.wind);
    birdG.connect(birdGate);
    birdGate.connect(L.gain);
    insG.connect(L.gain);
    windG.connect(L.gain);
    const sendTo = (node, amt) => { const s = mkGain(amt); node.connect(s); s.connect(wVerb); };
    sendTo(birdGate, 0.4);
    sendTo(insG, 0.12);
    L.layers = { birds: birdG, insects: insG, wind: windG };
    L.birdGate = birdGate;

    // wind in the leaves: a slow canopy sigh and the dry shimmer of big leaves
    const can = bed(L, t, pinkBuf, "bandpass", 900, 0.4, mist ? 0.012 : 0.03, windG, 0.8);
    lfo(L, t, 0.041, 380, can.f.frequency);
    lfo(L, t, 0.067, mist ? 0.006 : 0.016, can.g.gain);
    const leaf = bed(L, t, whiteBuf, "bandpass", 4600, 0.7, mist ? 0.002 : 0.007, windG, 1.2);
    lfo(L, t, 0.067, mist ? 0.0015 : 0.005, leaf.g.gain);
    lfo(L, t, 0.19, 900, leaf.f.frequency);
    // the deep, still air under the canopy
    const deep = bed(L, t, pinkBuf, "lowpass", 140, 0.6, 0.03, null, 0.5);
    lfo(L, t, 0.09, 0.012, deep.g.gain);

    // cicadas (day / dawn): two beds that are silent until the scheduler swells them
    let cic1 = null;
    let cic2 = null;
    if (day || dawn) {
      cic1 = bed(L, t, whiteBuf, "bandpass", 6300, 5, 0, null, 1);
      cic1.g.disconnect();
      const am1 = mkGain(0.5);
      cic1.g.connect(am1);
      am1.connect(insG);
      lfo(L, t, 53, 0.5, am1.gain);                  // the buzz itself
      cic2 = bed(L, t, whiteBuf, "bandpass", 4300, 9, 0, null, 0.9);
      cic2.g.disconnect();
      const am2 = mkGain(0.5);
      cic2.g.connect(am2);
      am2.connect(insG);
      lfo(L, t, 6.3, 0.5, am2.gain);                 // "zee-zee-zee-zee"
    }
    if (night) {
      // a steady silver sheet of tree crickets under the single voices
      const sheet = bed(L, t, whiteBuf, "bandpass", 5200, 14, 0.07, insG, 1);
      lfo(L, t, 17, 0.035, sheet.g.gain);
      const sheet2 = bed(L, t, whiteBuf, "bandpass", 3900, 16, 0.045, insG, 1);
      lfo(L, t, 11.3, 0.02, sheet2.g.gain);
    }

    const voice = (target, pan, vol, cut) => {
      // a panned voice inside a layer; `cut` darkens it (far away)
      const d = outTo(target, target, pan, 0, vol);
      if (!cut) return [d, d];
      const lp = filt("lowpass", cut, 0.5);
      lp.connect(d);
      return [lp, d];
    };
    const done = (pair, e) => { release(pair[0], e + 0.2); if (pair[1] !== pair[0]) release(pair[1], e + 0.25); };

    const t0 = t;
    let nextBird = t + (dawn ? 2 : mist ? 3 : 0.6);
    let nextCic = t + rnd(3, 8);
    let nextCic2 = t + rnd(8, 16);
    let nextMonkey = t + rnd(8, 20);
    let nextFrog = t + 0.4;
    let nextPeep = t + 1;
    let nextCricket = t + 0.3;
    let nextOwl = t + rnd(4, 9);
    let nextGrowl = t + rnd(20, 40);
    let nextDrip = t + 0.5;
    const cf = [4250, 4700, 5150];
    const answers = []; // [time, species, k, pan, vol]

    every(L, 400, (now) => {
      const horizon = now + 0.9;
      // ---- birds: phrases, and the answers they provoke
      if (!night) {
        if (nextBird < now) nextBird = now + 0.08;
        // dawn: the chorus builds over the first minute, from one whistler to everybody
        const build = dawn ? clamp((now - t0) / 55, 0.06, 1) : 1;
        while (nextBird < horizon) {
          let species;
          if (mist) species = pick([0, 4, 4, 3]);
          else if (dawn && build < 0.3) species = pick([0, 4, 0, 6]);
          else species = irnd(0, 6);
          const k = rnd(0.94, 1.07);
          const pr = PERCH[species];
          const vol = rnd(0.45, 1) * (mist ? 0.6 : 1);
          const v = voice(birdG, pr[0] + rnd(-0.12, 0.12), vol, mist ? 2600 : 0);
          const e = birdCall(v[0], nextBird, species, k);
          done(v, e);
          if (Math.random() < (mist ? 0.25 : 0.6)) {
            // call and answer: the same kind of bird, from the other perch, a little late and a little different
            answers.push([e + rnd(0.25, 1.0), species, k * rnd(0.95, 1.08), pr[1] + rnd(-0.12, 0.12), vol * rnd(0.4, 0.8)]);
          }
          const dens = mist ? 0.14 : dawn ? 0.15 + 1.15 * build : 1;
          nextBird += rnd(0.7, 3.4) / dens;
        }
        for (let i = answers.length - 1; i >= 0; i--) {
          const a = answers[i];
          if (a[0] < horizon) {
            const ta = Math.max(a[0], now + 0.02);
            const v = voice(birdG, a[3], a[4], mist ? 2200 : 0);
            done(v, birdCall(v[0], ta, a[1], a[2]));
            answers.splice(i, 1);
          }
        }
      }
      // ---- cicadas: a bed that swells for a while, then stops all at once
      if (cic1 && nextCic < horizon) {
        const ts = Math.max(nextCic, now + 0.05);
        const len = rnd(6, 13);
        const pk = rnd(0.05, 0.09) * (dawn ? 0.6 : 1);
        cic1.g.gain.setTargetAtTime(pk, ts, rnd(1, 2));
        cic1.g.gain.setTargetAtTime(0, ts + len, 0.1);
        cic1.f.frequency.setTargetAtTime(rnd(5800, 6900), ts, 0.5);
        nextCic = ts + len + rnd(5, 16);
      }
      if (cic2 && nextCic2 < horizon) {
        const ts = Math.max(nextCic2, now + 0.05);
        const len = rnd(4, 8);
        cic2.g.gain.setTargetAtTime(rnd(0.06, 0.1) * (dawn ? 0.6 : 1), ts, 0.6);
        cic2.g.gain.setTargetAtTime(0, ts + len, 0.25);
        nextCic2 = ts + len + rnd(9, 22);
      }
      // ---- far monkeys (day): a whooping run that climbs and speeds up
      if (day && nextMonkey < horizon) {
        const tm = Math.max(nextMonkey, now + 0.05);
        const v = voice(L.gain, rnd(-0.9, 0.9), rnd(0.16, 0.3), 1500);
        const s2 = mkGain(0.9);
        v[1].connect(s2);
        s2.connect(wVerb);
        const n = irnd(4, 8);
        const k = rnd(0.9, 1.25);
        let tt = tm;
        let gap = 0.3;
        let e = tm;
        for (let i = 0; i < n; i++) {
          const f = (300 + i * 34) * k;
          e = vox(v[0], tt, f, f * 1.5, 0.15, 0.6, VOWELS[i === n - 1 ? 0 : 2], 0, 0);
          tt += gap;
          gap = Math.max(0.15, gap * 0.88);
        }
        done(v, e + 0.3);
        nextMonkey = tm + rnd(14, 38);
      }
      // ---- night: frogs, crickets, owls, and once in a while something big, far away, that is not interested in you
      if (night) {
        if (nextFrog < now) nextFrog = now + 0.05;
        while (nextFrog < horizon) {
          const v = voice(insG, rnd(-0.9, 0.9), rnd(0.3, 0.9), 0);
          const k = rnd(0.85, 1.2);
          let e = rasp(v[0], nextFrog, 108 * k, 100 * k, 820 * k, 4, 42, 0.11, 0.11);
          e = Math.max(e, rasp(v[0], nextFrog + 0.15, 112 * k, 126 * k, 1300 * k, 4, 46, 0.14, 0.1));
          if (Math.random() < 0.5) e = Math.max(e, rasp(v[0], nextFrog + 0.62, 108 * k, 100 * k, 820 * k, 4, 42, 0.11, 0.08));
          done(v, e);
          nextFrog += rnd(0.5, 2.6);
        }
        if (nextPeep < now) nextPeep = now + 0.05;
        while (nextPeep < horizon) {
          // peepers: tiny rising "pweep"s in a run
          const v = voice(insG, rnd(-0.9, 0.9), rnd(0.3, 0.8), 0);
          const f = rnd(2500, 3100);
          const n = irnd(2, 6);
          let e = nextPeep;
          for (let i = 0; i < n; i++) e = tone(v[0], nextPeep + i * 0.21, "sine", f, f * 1.12, 0.07, 0.02, 0.01, 0.02);
          done(v, e);
          nextPeep += rnd(1.2, 4.5);
        }
        if (nextCricket < now) nextCricket = now + 0.05;
        while (nextCricket < horizon) {
          cricketPhrase({ gain: insG }, nextCricket, pick(cf) * rnd(0.98, 1.02), rnd(-0.9, 0.9), rnd(0.3, 0.9));
          nextCricket += rnd(0.5, 1.8);
        }
        if (nextOwl < horizon) {
          const to = Math.max(nextOwl, now + 0.05);
          const k = rnd(0.9, 1.1);
          const pan = rnd(-0.8, 0.8);
          const hoot = (tt, kk, vol, p) => {
            const v = voice(birdG, p, vol, 1800);
            let e = tone(v[0], tt, "sine", 372 * kk, 352 * kk, 0.26, 0.06, 0.05, 0.07);
            tone(v[0], tt + 0.42, "sine", 372 * kk, 360 * kk, 0.12, 0.05, 0.03, 0.04);
            e = tone(v[0], tt + 0.6, "sine", 380 * kk, 330 * kk, 0.42, 0.06, 0.05, 0.1);
            done(v, e);
            return e;
          };
          const e = hoot(to, k, rnd(0.5, 0.9), pan);
          if (Math.random() < 0.6) hoot(e + rnd(0.6, 1.6), k * 1.12, rnd(0.25, 0.5), -pan); // its mate, further off
          nextOwl = to + rnd(9, 24);
        }
        if (nextGrowl < horizon) {
          const tg = Math.max(nextGrowl, now + 0.05);
          const v = voice(L.gain, rnd(-0.7, 0.7), 0.3, 420);
          const s2 = mkGain(1);
          v[1].connect(s2);
          s2.connect(wVerb);
          const e = rasp(v[0], tg, 62, 50, 260, 1.5, 19, 1.8, 0.5, 0.6);
          done(v, e);
          nextGrowl = tg + rnd(30, 70);
        }
      }
      // ---- drips (mist: the main event; otherwise a few)
      if (mist || dawn || night) {
        if (nextDrip < now) nextDrip = now + 0.05;
        while (nextDrip < horizon) {
          const v = voice(L.gain, rnd(-0.9, 0.9), rnd(0.3, 1), 0);
          const s2 = mkGain(mist ? 0.7 : 0.3);
          v[1].connect(s2);
          s2.connect(wVerb);
          const f = rnd(900, 2400);
          let e = thump(v[0], nextDrip, f, f * rnd(1.4, 1.9), 0.05, 0.004, rnd(0.02, 0.05), rnd(0.02, 0.04));
          if (Math.random() < 0.4) e = fabricRustle(v[0], nextDrip + 0.01, 0.07, 3600, 1.2, 0.02, 2); // onto a leaf
          done(v, e);
          nextDrip += mist ? rnd(0.25, 1.6) : rnd(1.5, 5);
        }
      }
    });
  }

  function jungleAmbience(on, time = "day") {
    const tm = time === "night" || time === "dawn" || time === "mist" ? time : "day";
    setLoop("jungle", on ? 1 : 0, buildJungle, 2.4, tm);
  }

  function buildRiver(L, t) {
    loopOut(L, wBus, wVerb, 0.08);
    L.scale = 0.5;
    // a wide slow river: low body, mid wash, bright riffles, and bubbles turning over
    const low = bed(L, t, pinkBuf, "lowpass", 420, 0.5, 0.2, null, 0.8);
    lfo(L, t, 0.17, 0.04, low.g.gain);
    const mid = bed(L, t, pinkBuf, "bandpass", 1300, 0.6, 0.09, null, 1.1);
    lfo(L, t, 0.29, 300, mid.f.frequency);
    lfo(L, t, 0.43, 0.025, mid.g.gain);
    const hi = bed(L, t, whiteBuf, "bandpass", 4200, 0.8, 0.02, null, 1.2);
    lfo(L, t, 0.37, 900, hi.f.frequency);
    let next = t + 0.1;
    every(L, 400, (now) => {
      if (next < now) next = now + 0.05;
      while (next < now + 0.9) {
        const f = rnd(420, 1500);
        thump(L.gain, next, f, f * rnd(1.3, 1.8), rnd(0.03, 0.07), 0.005, rnd(0.012, 0.035), rnd(0.015, 0.03));
        next += rnd(0.04, 0.22);
      }
    });
  }

  function river(level) {
    setLoop("river", level, buildRiver, 0.8);
  }

  function buildRain(L, t) {
    loopOut(L, wBus, wVerb, 0.06);
    L.scale = 0.7;
    L.lv = 0.5;
    // far hiss of the canopy, the body of the fall, and single drops close by on leaves and ground
    const hiss = bed(L, t, whiteBuf, "highpass", 4200, 0.5, 0.05, null, 1.1);
    lfo(L, t, 0.13, 0.012, hiss.g.gain);
    const body = bed(L, t, pinkBuf, "bandpass", 1500, 0.4, 0.14, null, 1);
    lfo(L, t, 0.09, 0.03, body.g.gain);
    lfo(L, t, 0.21, 300, body.f.frequency);
    const low = bed(L, t, pinkBuf, "lowpass", 300, 0.5, 0.06, null, 0.6);
    L.set = (lv, tt) => {
      L.lv = lv;
      sp(low.g.gain, 0.02 + 0.2 * lv * lv, tt, 0.4);      // heavy rain roars
      sp(body.f.frequency, 1900 - 700 * lv, tt, 0.4);
    };
    let next = t + 0.05;
    every(L, 300, (now) => {
      if (next < now) next = now + 0.03;
      while (next < now + 0.7) {
        const r = Math.random();
        const pan = rnd(-0.9, 0.9);
        const d = outTo(L.gain, wVerb, pan, 0, rnd(0.4, 1));
        let e;
        if (r < 0.5) {
          e = tick(d, next, rnd(2600, 6000), rnd(0.03, 0.08), rnd(0.004, 0.01));           // on a leaf
        } else if (r < 0.8) {
          e = thump(d, next, rnd(260, 520), 180, 0.03, 0.003, rnd(0.03, 0.07), 0.016);      // on the ground
        } else {
          const f = rnd(900, 2000);
          e = thump(d, next, f, f * 1.6, 0.04, 0.004, rnd(0.02, 0.05), 0.02);               // into a puddle
        }
        release(d, e + 0.1);
        next += rnd(0.012, 0.09) / (0.25 + L.lv);
      }
    });
  }

  function rain(level) {
    setLoop("rain", level, buildRain, 1);
  }

  function jungleLayers(o, seconds = 1.5) {
    if (!o || typeof o !== "object") return;
    const secs = Math.max(0.3, num(seconds, 1.5));
    const keys = ["birds", "insects", "wind"];
    for (let i = 0; i < 3; i++) if (typeof o[keys[i]] === "number") JL[keys[i]] = clamp(o[keys[i]], 0, 1);
    if (typeof o.river === "number") setLoop("river", o.river, buildRiver, secs);
    if (typeof o.rain === "number") setLoop("rain", o.rain, buildRain, secs);
    const J = loops.jungle;
    if (!J || !J.layers || !ctx || ctx.state === "closed") return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const p = J.layers[keys[i]].gain;
      p.cancelScheduledValues(t);
      p.setTargetAtTime(JL[keys[i]], t, secs / 3.5);
    }
  }

  function thunder(dist = 0.5) {
    if (!ready() || !gate("thunder", 0.4)) return;
    const d = clamp(num(dist, 0.5), 0, 1);
    const dest = wd(rnd(-0.5, 0.5), d * 0.5, 0.4, 1.2);
    one(dest, (t, keep) => {
      if (d < 0.6) {
        // close: the sky tears first
        const n = 1 - d / 0.6;
        keep(burst(dest, t, { buf: whiteBuf, type: "highpass", q: 0.5, f0: 1500, attack: 0.002, peak: 0.6 * n, tc: 0.05 }));
        keep(crackle(dest, t, 0.5, 1400, 0.4 * n, 0.4, false));
        keep(thump(dest, t + 0.03, 150, 30, 0.4, 0.004, 0.9 * n, 0.2));
      }
      // the roll: it arrives in waves, off every hill, and takes its time to leave
      const dur = 2.6 + 2.6 * d;
      const t1 = t + 0.05 + d * 0.3;
      keep(rumble(dest, t1, dur, 240 - 110 * d, 0.9, 7, 0.5));
      keep(rumble(dest, t1 + 0.1, dur * 0.7, 700 - 400 * d, 0.3 * (1 - d * 0.6), 5, 0.7));
      keep(thump(dest, t1, 70, 24, 1.2, 0.05, 0.6, 0.6));
      keep(thump(dest, t1 + dur * rnd(0.3, 0.5), 60, 24, 0.9, 0.08, 0.4, 0.5));
    });
  }

  function birdsFlush(n = 12, pan = 0) {
    if (!ready() || !gate("flush", 0.3)) return;
    const count = clamp(num(n, 12) | 0, 1, 24);
    const p0 = clamp(num(pan, 0), -1, 1);
    const dest = wOut(0, 0.25);
    one(dest, (t, keep) => {
      // the branch letting go, then every bird at once: wingbeats climbing away, alarm calls scattering
      keep(fabricRustle(dest, t, 0.4, 3800, 0.9, 0.2, 6));
      keep(crackle(dest, t, 0.25, 3000, 0.06, 0.3, false));
      for (let i = 0; i < count; i++) {
        const tb = t + Math.pow(Math.random(), 1.5) * 0.7;
        const d = outTo(dest, dest, clamp(p0 + rnd(-0.6, 0.6), -1, 1), 0, 1);
        const rate = rnd(11, 17);
        const flaps = irnd(5, 11);
        for (let j = 0; j < flaps; j++) {
          const tf = tb + j / rate;
          const a = (1 - j / (flaps + 2)) * 0.2;
          keep(burst(d, tf, {
            buf: pinkBuf, type: "bandpass", q: 0.9, f0: rnd(700, 1100), f1: rnd(1700, 2400), sweep: 0.03,
            attack: 0.008, peak: a, tc: 0.012,
          }));
        }
        if (i % 2 === 0) {
          const f = rnd(2600, 4200);
          const calls = irnd(2, 5);
          for (let j = 0; j < calls; j++) {
            keep(tone(d, tb + 0.05 + j * rnd(0.09, 0.14), "sine", f * 1.2, f * 0.8, 0.05, 0.05 * (1 - j / (calls + 1)), 0.006, 0.014));
          }
        }
      }
      // the leaves they left, still moving
      keep(fabricRustle(dest, t + 0.5, 0.6, 4600, 0.9, 0.07, 5));
    });
  }

  function mysteryCall(closeness = 0.5, pan = 0) {
    if (!ready() || !gate("mystery", 0.4)) return;
    const c = clamp(num(closeness, 0.5), 0, 1);
    // far: dark, small, drowned in the forest's echo. Near: warm, clear, dry - and unmistakably a voice.
    const world = outTo(wBus, wVerb, clamp(num(pan, 0), -1, 1) * 0.85, 0.9 - 0.75 * c, 0.3 + 0.7 * c);
    const lp = filt("lowpass", 480 * Math.pow(11, c), 0.6);
    lp.connect(world);
    const t = ctx.currentTime + 0.02;
    // the first three notes of the PLATYPUS theme (1 3 5 in D), as a low warbling growl-trill
    const notes = [146.83, 185, 220];
    const durs = [0.42, 0.42, 0.95];
    let tEnd = t;
    let tt = t;
    for (let i = 0; i < 3; i++) {
      const f = notes[i];
      const dur = durs[i];
      const from = i === 0 ? f * 0.86 : notes[i - 1];     // each note is scooped up into, like a throat would
      // growl: the body of the call
      const g = ctx.createGain();
      const e = swell(g.gain, tt, 0.07, 0.42, tt + dur * 0.86, 0.06);
      const o = osc("sawtooth", from, tt, e);
      o.frequency.exponentialRampToValueAtTime(f, tt + 0.1);
      const o2 = osc("triangle", from * 2, tt, e);
      o2.frequency.exponentialRampToValueAtTime(f * 2.005, tt + 0.1);
      const flt = filt("lowpass", 620, 1.2);
      const fm = filt("bandpass", 980, 3);
      const fmG = mkGain(0.5);
      const tr = mkGain(0.6);
      const l = osc("sine", i === 2 ? 17 : 23, tt, e);     // the trill
      if (i === 2) l.frequency.linearRampToValueAtTime(27, tt + dur);
      const lg = mkGain(0.4);
      l.connect(lg);
      lg.connect(tr.gain);
      const o2g = mkGain(0.5);
      o.connect(flt);
      o.connect(fm);
      fm.connect(fmG);
      fmG.connect(tr);
      o2.connect(o2g);
      o2g.connect(flt);
      flt.connect(tr);
      tr.connect(g);
      g.connect(lp);
      // the almost-musical part: a soft whistle two octaves up riding on the growl, warbling
      const w = ctx.createGain();
      const ew = swell(w.gain, tt + 0.03, 0.08, 0.05 + 0.05 * c, tt + dur * 0.8, 0.07);
      const ow = osc("sine", from * 4, tt + 0.03, ew);
      ow.frequency.exponentialRampToValueAtTime(f * 4, tt + 0.12);
      if (i === 2) ow.frequency.setTargetAtTime(f * 4 * 1.06, tt + dur * 0.5, 0.15); // the last note lifts: a question
      const v = osc("sine", 9, tt + 0.03, ew);
      const vg = mkGain(f * 4 * 0.022);
      v.connect(vg);
      vg.connect(ow.frequency);
      ow.connect(w);
      w.connect(lp);
      tEnd = Math.max(tEnd, e, ew);
      tt += dur + 0.04;
    }
    // breath at the end of the call
    tEnd = Math.max(tEnd, burst(lp, tt - 0.25, {
      buf: pinkBuf, type: "bandpass", q: 0.9, f0: 900, f1: 500, sweep: 0.4, attack: 0.12, peak: 0.05, tc: 0.12,
    }));
    release(lp, tEnd + 0.2);
    release(world, tEnd + 0.25);
  }

  function vines() {
    if (!ready() || !gate("vines", 0.2)) return;
    const dest = wOut(0, 0.14);
    one(dest, (t, keep) => {
      // pushing through a hanging curtain: heavy leaves dragging, stems knocking, it closing behind you
      for (let i = 0; i < 5; i++) {
        const tv = t + i * rnd(0.13, 0.2);
        keep(fabricRustle(dest, tv, rnd(0.25, 0.4), rnd(2600, 5200), 0.8, rnd(0.1, 0.18), irnd(4, 6)));
      }
      keep(fabricRustle(dest, t + 0.1, 0.8, 1500, 0.7, 0.08, 7));
      for (let i = 0; i < 4; i++) keep(knock(dest, t + rnd(0.1, 0.9), rnd(300, 620), rnd(0.04, 0.09), 0.02));
      keep(creak(dest, t + 0.25, rnd(260, 360), 0.3, 0.03));
      keep(crackle(dest, t + 0.1, 0.7, 3600, 0.035, 0.2, false));
      keep(fabricRustle(dest, t + 1.0, 0.5, 3400, 0.8, 0.07, 5));
    });
  }

  function logCreak() {
    if (!ready() || !gate("log", 0.2)) return;
    const dest = wOut(rnd(-0.15, 0.15), 0.2);
    one(dest, (t, keep) => {
      // a big old trunk taking weight: a slow low groan, fibres ticking, a hollow settle
      const f = rnd(92, 120);
      keep(creak(dest, t, f, 0.9, 0.16));
      keep(creak(dest, t + 0.04, f * 2.03, 0.8, 0.07));
      keep(creak(dest, t + 0.5, f * 1.48, 0.6, 0.05));
      for (let i = 0; i < 5; i++) keep(tick(dest, t + rnd(0.1, 0.9), rnd(1500, 2600), rnd(0.03, 0.07), 0.008));
      keep(knock(dest, t + 0.95, 130, 0.22, 0.07));
    });
  }

  // ---- tribe ----------------------------------------------------------------------

  /** A platypus phrase in a given mood at pitch factor k (the friendChirp moods + greet / cheer / war / mourn). */
  function chirpMood(dest, t, keep, mood, k) {
    if (mood === "greet") {
      // "kwee-kwip! prrr": two bright up-chirps and a friendly little trill
      keep(chirp(dest, t, 980 * k, 1500 * k, 0.12, 0.13));
      keep(chirp(dest, t + 0.16, 1500 * k, 1900 * k, 0.08, 0.12));
      keep(chirp(dest, t + 0.3, 1700 * k, 1760 * k, 0.22, 0.09, 22, 0.03));
    } else if (mood === "cheer") {
      // a long whoop up and three happy yips
      keep(chirp(dest, t, 900 * k, 2200 * k, 0.28, 0.14));
      for (let i = 0; i < 3; i++) keep(chirp(dest, t + 0.34 + i * 0.09, 1900 * k, 2400 * k, 0.05, 0.11));
    } else if (mood === "war") {
      // a growl-trill that rises into a bark: brave, not nasty
      keep(rasp(dest, t, 78 * k, 124 * k, 420, 1.4, 26, 0.34, 0.5));
      keep(chirp(dest, t + 0.26, 700 * k, 1500 * k, 0.14, 0.16, 30, 0.05));
      keep(chirp(dest, t + 0.44, 1400 * k, 1100 * k, 0.1, 0.13));
    } else if (mood === "mourn") {
      // a long low falling hoot with a tremble, and a smaller one after it
      keep(chirp(dest, t, 760 * k, 520 * k, 0.9, 0.09, 5, 0.02));
      keep(chirp(dest, t + 1.1, 600 * k, 430 * k, 0.7, 0.06, 5, 0.025));
    } else if (mood === "call") {
      keep(chirp(dest, t, 920 * k, 1380 * k, 0.16, 0.13));
      keep(chirp(dest, t + 0.2, 1380 * k, 1560 * k, 0.34, 0.12, 7, 0.012));
    } else if (mood === "giggle") {
      const n = irnd(5, 7);
      for (let i = 0; i < n; i++) {
        const f = (i % 2 ? 1500 : 1820) * k * (1 - i * 0.035);
        keep(chirp(dest, t + i * 0.075, f, f * 1.12, 0.05, 0.1 - i * 0.008));
      }
    } else if (mood === "curious") {
      keep(chirp(dest, t, 820 * k, 860 * k, 0.08, 0.09));
      keep(chirp(dest, t + 0.13, 900 * k, 1620 * k, 0.24, 0.12));
    } else if (mood === "sad") {
      keep(chirp(dest, t, 1040 * k, 660 * k, 0.5, 0.09, 6, 0.015));
      keep(chirp(dest, t + 0.62, 820 * k, 600 * k, 0.34, 0.06, 6, 0.018));
    } else if (mood === "scared") {
      for (let i = 0; i < 3; i++) {
        const f = rnd(1650, 1900) * k;
        keep(chirp(dest, t + i * 0.12, f, f * 0.78, 0.09, 0.1, 28, 0.03));
      }
    } else if (mood === "sleepy") {
      keep(chirp(dest, t, 720 * k, 470 * k, 0.6, 0.07, 4, 0.01));
      keep(burst(dest, t + 0.05, {
        buf: pinkBuf, type: "bandpass", q: 1, f0: 1100, f1: 600, sweep: 0.5, attack: 0.2, peak: 0.03, tc: 0.14,
      }));
    } else if (mood === "growl") {
      keep(purr(dest, t, 0.75, 0.34, rnd(72, 86) * Math.sqrt(k), rnd(22, 27)));
      keep(burst(dest, t, {
        buf: pinkBuf, type: "bandpass", q: 1.4, f0: 380, f1: 300, sweep: 0.6, attack: 0.25, peak: 0.05, tc: 0.14,
      }));
    } else {
      // "happy"
      keep(chirp(dest, t, 1050 * k, 1520 * k, 0.07, 0.12));
      keep(chirp(dest, t + 0.1, 1250 * k, 1800 * k, 0.07, 0.12));
      keep(chirp(dest, t + 0.2, 1480 * k, 2250 * k, 0.11, 0.13));
    }
  }

  function tribeChirp(mood, volume = 1, pan = 0, pitch = 1) {
    if (!ready() || !gate("tchirp", 0.03)) return;
    const vol = clamp(num(volume, 1), 0, 1.5);
    if (vol < 0.004) return;
    const dest = wOut(clamp(num(pan, 0), -1, 1) * 0.8, 0.16, vol);
    const k = clamp(num(pitch, 1), 0.4, 2.5) * rnd(0.96, 1.05);
    one(dest, (t, keep) => chirpMood(dest, t, keep, mood, k));
  }

  function buildChatter(L, t) {
    loopOut(L, wBus, wVerb, 0.2);
    L.scale = 0.75;
    L.lv = 0.5;
    L.set = (lv) => { L.lv = lv; };
    // a low contented bed: many small bodies purring
    const bedP = bed(L, t, pinkBuf, "bandpass", 300, 1.2, 0.05, null, 0.6);
    lfo(L, t, 24, 0.03, bedP.g.gain);
    lfo(L, t, 0.21, 0.02, bedP.g.gain);
    let next = t + 0.05;
    const MOODS = ["happy", "curious", "call", "giggle", "greet"];
    every(L, 350, (now) => {
      if (next < now) next = now + 0.04;
      while (next < now + 0.8) {
        const d = outTo(L.gain, L.gain, rnd(-0.95, 0.95), 0, rnd(0.25, 0.75));
        const k = pick([0.8, 0.9, 1, 1, 1.1, 1.25, 1.5]) * rnd(0.96, 1.04); // elders ... pups
        let e = next;
        const keep = (x) => { if (x > e) e = x; return x; };
        const r = Math.random();
        if (r < 0.34) {
          // a scrap of a chirp
          const f = rnd(900, 1700) * k;
          const n = irnd(1, 3);
          for (let i = 0; i < n; i++) keep(chirp(d, next + i * rnd(0.08, 0.13), f * rnd(0.9, 1.1), f * rnd(1.1, 1.5), rnd(0.05, 0.1), 0.09));
        } else if (r < 0.56) {
          chirpMood(d, next, keep, pick(MOODS), k);
        } else if (r < 0.8) {
          keep(purr(d, next, rnd(0.4, 0.9), 0.2, rnd(70, 96) * Math.sqrt(k), rnd(21, 28)));
        } else {
          // growl-trill ending in a small chirp
          keep(rasp(d, next, 88 * k, 104 * k, 460, 1.5, rnd(22, 28), 0.3, 0.26));
          keep(chirp(d, next + 0.26, 1000 * k, 1300 * k, 0.07, 0.07));
        }
        release(d, e + 0.15);
        next += rnd(0.1, 0.5) / (0.25 + 1.1 * L.lv);
      }
    });
  }

  function tribeChatter(level) {
    setLoop("tribeChatter", level, buildChatter, 0.8);
  }

  function tribeCheer(size = 0.7) {
    if (!ready() || !gate("tcheer", 0.25)) return;
    const s = clamp(num(size, 0.7), 0.05, 1);
    const dest = wOut(0, 0.3, 0.85);
    one(dest, (t, keep) => {
      // the whole camp at once: whoops and yips from every side, tails slapping the ground
      const n = 6 + ((s * 16) | 0);
      const span = 0.8 + 1.4 * s;
      for (let i = 0; i < n; i++) {
        const tv = t + Math.pow(Math.random(), 1.3) * span;
        const d = outTo(dest, dest, rnd(-0.95, 0.95), 0, rnd(0.35, 0.8));
        const k = pick([0.8, 0.9, 1, 1.1, 1.25, 1.5]) * rnd(0.96, 1.04);
        chirpMood(d, tv, keep, pick(["cheer", "cheer", "happy", "greet", "giggle"]), k);
      }
      const slaps = 4 + ((s * 12) | 0);
      for (let i = 0; i < slaps; i++) {
        const ts = t + 0.1 + Math.random() * span;
        keep(thump(dest, ts, rnd(150, 200), 80, 0.04, 0.003, rnd(0.1, 0.22), 0.03));
        keep(burst(dest, ts, {
          buf: pinkBuf, type: "bandpass", q: 0.9, f0: rnd(1200, 2000), attack: 0.002, peak: rnd(0.08, 0.16), tc: 0.014,
        }));
      }
      // one big voice on top when everybody is in
      if (s > 0.6) keep(chirp(dest, t + 0.1, 800, 2100, 0.4, 0.1, 9, 0.02));
    });
  }

  function warCry() {
    if (!ready() || !gate("warcry", 0.4)) return;
    const dest = wOut(0, 0.3, 0.9);
    one(dest, (t, keep) => {
      // one deep log-drum hit, then the tribe: "RRRRR-ee-YAH!" from a dozen throats, not quite together
      keep(thump(dest, t, 110, 62, 0.1, 0.004, 0.8, 0.14));
      keep(knock(dest, t, 180, 0.4, 0.05));
      for (let i = 0; i < 9; i++) {
        const d = outTo(dest, dest, rnd(-0.9, 0.9), 0, rnd(0.4, 0.8));
        const k = pick([0.8, 0.9, 1, 1, 1.12, 1.3]) * rnd(0.97, 1.04);
        const tv = t + 0.1 + rnd(0, 0.14);
        keep(rasp(d, tv, 74 * k, 132 * k, 440, 1.3, rnd(22, 29), 0.5, 0.5));
        keep(chirp(d, tv + 0.42, 760 * k, 1560 * k, 0.16, 0.15, 28, 0.05));
        keep(chirp(d, tv + 0.62, 1560 * k, 1180 * k, 0.26, 0.15, 9, 0.02));
      }
      keep(thump(dest, t + 0.72, 110, 62, 0.1, 0.004, 0.8, 0.14));
      keep(knock(dest, t + 0.72, 180, 0.4, 0.05));
      keep(burst(dest, t + 0.72, {
        buf: pinkBuf, type: "bandpass", q: 0.7, f0: 1500, attack: 0.004, peak: 0.2, tc: 0.03,
      }));
    });
  }

  /** One hit on a hollow log. */
  function logDrum(dest, t, f, peak) {
    thump(dest, t, f * 2.42, f * 2.36, 0.03, 0.003, peak * 0.22, 0.03);
    burst(dest, t, { buf: pinkBuf, type: "bandpass", q: 1.6, f0: f * 4.2, attack: 0.002, peak: peak * 0.5, tc: 0.01 });
    return thump(dest, t, f * 1.18, f, 0.04, 0.003, peak, 0.085 + 6 / f);
  }

  const DR_LOW = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0];
  const DR_MID = [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1];
  const DR_HI = [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1];
  let drumSync = 0.08;

  function buildTribeDrums(L, t, bpm) {
    loopOut(L, wBus, wVerb, 0.22);
    L.int = 0.5;
    L.set = (lv) => { L.int = lv; };
    const s16 = 60 / bpm / 4;
    // beat 1 lands on the caller's next beat; the drummers come in there
    let t0 = ctx.currentTime + drumSync;
    while (t0 < t + 0.02) t0 += s16 * 4;
    let n = 0;
    const lowP = outTo(L.gain, L.gain, -0.25, 0, 1);
    const midP = outTo(L.gain, L.gain, 0.3, 0, 1);
    const hiP = outTo(L.gain, L.gain, 0.6, 0, 1);
    const shP = outTo(L.gain, L.gain, -0.6, 0, 1);
    every(L, 200, (now) => {
      for (let guard = 0; guard < 64; guard++) {
        const ts = t0 + n * s16;
        if (ts > now + 0.6) break;
        if (ts > now + 0.01) {
          const s = n & 15;
          const bar = (n >> 4) & 3;
          const it = L.int;
          const hum = rnd(-0.005, 0.006);
          const acc = s % 4 === 0 ? 1 : 0.8;
          const fill = bar === 3 && s >= 12;
          if (DR_LOW[s]) logDrum(lowP, ts + hum, s === 0 ? 92 : 104, 0.55 * acc);
          if (it > 0.3 && (DR_MID[s] || fill)) logDrum(midP, ts + hum, fill ? 168 + (s - 12) * 16 : 156, 0.36 * (fill ? 0.9 + (s - 12) * 0.08 : acc));
          if (it > 0.55 && DR_HI[s]) logDrum(hiP, ts + hum, s % 3 === 0 ? 262 : 233, 0.16 * acc);
          if (it > 0.75) {
            // seed-pod shaker on every 16th, pushing the off-beats
            burst(shP, ts + hum, {
              buf: whiteBuf, type: "bandpass", q: 1.5, f0: 6200, attack: 0.004, peak: s % 2 ? 0.07 : 0.035, tc: 0.012,
            });
          }
          if (it > 0.9 && s === 8 && bar % 2 === 1) {
            // somebody slaps a tail on the two of every second bar
            thump(L.gain, ts, 170, 90, 0.04, 0.003, 0.2, 0.03);
            burst(L.gain, ts, { buf: pinkBuf, type: "bandpass", q: 0.9, f0: 1700, attack: 0.002, peak: 0.16, tc: 0.016 });
          }
        }
        n++;
      }
    });
  }

  function tribeDrums(on, intensity = 0.5, nextBeatInSeconds, bpm) {
    drumSync = clamp(num(nextBeatInSeconds, 0.08), 0, 4);
    setLoop("tribeDrums", on ? clamp(num(intensity, 0.5), 0.05, 1) : 0, buildTribeDrums, 0.4, clamp(num(bpm, 96), 50, 200));
  }

  function buildFire(L, t) {
    loopOut(L, wBus, wVerb, 0.06);
    L.scale = 0.7;
    L.lv = 0.5;
    L.set = (lv) => { L.lv = lv; };
    // the soft roar of the flames, fluttering; over it single cracks, pops and the hiss of sap
    const roar = bed(L, t, pinkBuf, "lowpass", 360, 0.6, 0.16, null, 0.6);
    lfo(L, t, 7.3, 0.04, roar.g.gain);
    lfo(L, t, 0.43, 0.05, roar.g.gain);
    lfo(L, t, 1.9, 60, roar.f.frequency);
    const air = bed(L, t, pinkBuf, "bandpass", 1100, 0.6, 0.035, null, 0.9);
    lfo(L, t, 3.1, 0.015, air.g.gain);
    let next = t + 0.05;
    every(L, 300, (now) => {
      if (next < now) next = now + 0.03;
      while (next < now + 0.7) {
        const r = Math.random();
        const d = outTo(L.gain, L.gain, rnd(-0.4, 0.4), 0, rnd(0.4, 1));
        let e;
        if (r < 0.6) {
          e = tick(d, next, rnd(1800, 5200), rnd(0.05, 0.16), rnd(0.003, 0.008));          // crack
        } else if (r < 0.85) {
          e = thump(d, next, rnd(300, 700), rnd(120, 200), 0.02, 0.002, rnd(0.08, 0.2), 0.012); // pop
          tick(d, next, 2600, 0.08);
        } else {
          e = crackle(d, next, rnd(0.15, 0.4), 3000, 0.06, 0.3, false);                     // a run of sparks
        }
        release(d, e + 0.1);
        next += rnd(0.03, 0.4) / (0.3 + L.lv);
      }
    });
  }

  function fire(level) {
    setLoop("fire", level, buildFire, 0.6);
  }

  function craft(kind = "weave") {
    if (!ready() || !gate("craft", 0.05)) return;
    const dest = wOut(rnd(-0.1, 0.1), 0.1);
    one(dest, (t, keep) => {
      if (kind === "bone") {
        // two dry bony clicks and a scrape
        const f = rnd(1300, 1700);
        keep(knock(dest, t, f * 0.5, 0.2, 0.012));
        keep(tone(dest, t, "sine", f, f * 0.98, 0.02, 0.06, 0.002, 0.02));
        keep(knock(dest, t + 0.1, f * 0.56, 0.16, 0.012));
        keep(tone(dest, t + 0.1, "sine", f * 1.19, f * 1.17, 0.02, 0.05, 0.002, 0.02));
        keep(rattle(dest, t + 0.16, 0.14, 3200, 3, 0.05, 0.6));
      } else if (kind === "tie") {
        // a vine drawn through and knotted: a rising creak and a soft snap
        keep(fabricRustle(dest, t, 0.2, 3000, 1, 0.08, 3));
        keep(tone(dest, t + 0.05, "triangle", 320, 560, 0.22, 0.03, 0.05, 0.03));
        keep(creak(dest, t + 0.05, 380, 0.24, 0.04));
        keep(tick(dest, t + 0.3, 2400, 0.12));
        keep(thump(dest, t + 0.3, 300, 180, 0.03, 0.003, 0.1, 0.02));
      } else if (kind === "tighten") {
        // the pull that goes right: fibres stretching up in pitch, then a satisfying "thock"
        keep(creak(dest, t, 300, 0.3, 0.05));
        keep(tone(dest, t, "triangle", 260, 620, 0.3, 0.035, 0.08, 0.02));
        keep(fabricRustle(dest, t, 0.3, 3600, 1.1, 0.06, 4));
        keep(knock(dest, t + 0.32, 330, 0.3, 0.035));
        keep(pluck(dest, t + 0.33, midi(74), 0.07, 0.3, 0.3));
      } else if (kind === "done") {
        // finished: a last snug pull, then a warm little wooden fanfare (D - F# - A - d)
        keep(creak(dest, t, 340, 0.18, 0.04));
        keep(knock(dest, t + 0.16, 300, 0.26, 0.03));
        const n = [62, 66, 69, 74];
        for (let i = 0; i < 4; i++) {
          const tn = t + 0.26 + i * 0.1;
          keep(knock(dest, tn, midi(n[i]), 0.16, 0.09));
          keep(pluck(dest, tn, midi(n[i] + 12), 0.08, i === 3 ? 0.9 : 0.3, 0.3));
        }
        keep(bell(dest, t + 0.56, midi(86), 0.035, 0.7));
        keep(fabricRustle(dest, t + 0.2, 0.3, 4600, 0.9, 0.05, 4));
      } else if (kind === "slip") {
        // it slips: a quick falling zip, a floppy slap. No harm done.
        keep(tone(dest, t, "triangle", 700, 240, 0.16, 0.05, 0.01, 0.03));
        keep(whoosh(dest, t, 3600, 1400, 700, 0.06, 0.12, 0.1, 2, whiteBuf));
        keep(thump(dest, t + 0.17, 150, 90, 0.05, 0.006, 0.16, 0.04));
        keep(fabricRustle(dest, t + 0.17, 0.16, 2600, 1, 0.08, 3));
      } else {
        // weave: leaf over, leaf under: two soft swishes and a fibre creak
        keep(fabricRustle(dest, t, 0.16, rnd(3600, 5000), 1, 0.1, 3));
        keep(whoosh(dest, t, 1800, 4200, 2600, 0.08, 0.08, 0.05, 2, whiteBuf));
        keep(fabricRustle(dest, t + 0.17, 0.16, rnd(4200, 5800), 1, 0.09, 3));
        keep(creak(dest, t + 0.1, rnd(420, 560), 0.12, 0.022));
      }
    });
  }

  function eatFruit() {
    if (!ready() || !gate("fruit", 0.08)) return;
    const dest = wOut(rnd(-0.1, 0.1), 0.06);
    one(dest, (t, keep) => {
      // a juicy crunch, two wet chomps and a happy gulp
      keep(crackle(dest, t, 0.12, 1800, 0.22, 0.5, false));
      keep(burst(dest, t, {
        buf: pinkBuf, type: "bandpass", q: 1.2, f0: 1900, f1: 800, sweep: 0.07, attack: 0.003, peak: 0.3, tc: 0.03,
      }));
      bloops(dest, t + 0.02, 3, 500, 1400, 0.1, 0.06, keep);
      for (let i = 0; i < 2; i++) {
        const tc = t + 0.2 + i * 0.16;
        keep(burst(dest, tc, {
          buf: pinkBuf, type: "lowpass", q: 1.5, f0: 1100, f1: 340, sweep: 0.06, attack: 0.008, peak: 0.24, tc: 0.03,
        }));
        keep(crackle(dest, tc, 0.07, 2400, 0.08, 0.4, false));
        bloops(dest, tc, 2, 600, 1500, 0.06, 0.04, keep);
      }
      keep(thump(dest, t + 0.56, 260, 520, 0.07, 0.01, 0.1, 0.03)); // gulp
    });
  }

  function materialPickup(kind = "leaf") {
    if (!ready() || !gate("mat", 0.05)) return;
    const dest = wOut(rnd(-0.1, 0.1), 0.16);
    one(dest, (t, keep) => {
      let note = 74;
      if (kind === "vine") {
        // a vine pulled free: a stretch, a snap, the leaves shaking
        keep(tone(dest, t, "triangle", 240, 520, 0.14, 0.04, 0.03, 0.02));
        keep(tick(dest, t + 0.15, 2200, 0.16));
        keep(fabricRustle(dest, t + 0.14, 0.22, 3600, 1, 0.1, 4));
        note = 71;
      } else if (kind === "bone") {
        // dry and hollow
        keep(knock(dest, t, 700, 0.24, 0.016));
        keep(tone(dest, t, "sine", 1500, 1470, 0.03, 0.06, 0.002, 0.03));
        keep(knock(dest, t + 0.09, 880, 0.14, 0.012));
        note = 78;
      } else if (kind === "stone") {
        keep(thump(dest, t, 300, 160, 0.03, 0.002, 0.3, 0.02));
        keep(tick(dest, t, 3200, 0.2));
        keep(crackle(dest, t + 0.02, 0.1, 3000, 0.05, 0.3, false));
        note = 69;
      } else if (kind === "wood") {
        keep(knock(dest, t, 260, 0.3, 0.04));
        keep(knock(dest, t + 0.08, 330, 0.18, 0.03));
        note = 66;
      } else {
        // leaf: plucked off its stem
        keep(tick(dest, t, 2800, 0.12));
        keep(fabricRustle(dest, t, 0.2, rnd(4200, 5600), 1, 0.13, 4));
        keep(fabricRustle(dest, t + 0.1, 0.14, 6400, 1.2, 0.05, 3));
      }
      keep(pluck(dest, t + 0.1, midi(note), 0.1, 0.3, 0.35));
      keep(pluck(dest, t + 0.18, midi(note + 7), 0.08, 0.4, 0.35));
    });
  }

  // ---- potions --------------------------------------------------------------------

  function buildCauldron(L, t) {
    loopOut(L, wBus, wVerb, 0.2);
    L.scale = 0.8;
    L.lv = 0.5;
    // a big iron pot: the simmer, the hollow drone of the pot itself, thick bubbles rising and bursting
    const sim = bed(L, t, whiteBuf, "bandpass", 3000, 0.8, 0.02, null, 1);
    lfo(L, t, 0.6, 0.008, sim.g.gain);
    const low = bed(L, t, pinkBuf, "lowpass", 220, 1.2, 0.14, null, 0.5);
    lfo(L, t, 0.31, 0.05, low.g.gain);
    const pot = bed(L, t, pinkBuf, "bandpass", 410, 14, 0.12, null, 0.8);
    lfo(L, t, 0.17, 14, pot.f.frequency);
    L.set = (lv, tt) => {
      L.lv = lv;
      sp(sim.g.gain, 0.008 + 0.04 * lv, tt, 0.3);
      sp(sim.f.frequency, 2400 + 1800 * lv, tt, 0.3);
    };
    let next = t + 0.05;
    every(L, 300, (now) => {
      if (next < now) next = now + 0.03;
      while (next < now + 0.7) {
        const d = outTo(L.gain, L.gain, rnd(-0.3, 0.3), 0, rnd(0.4, 1));
        const big = Math.random() < 0.25;
        const f = big ? rnd(130, 240) : rnd(260, 680);
        // "bl-OOP": the bubble rises in pitch as it shrinks, and pops
        let e = thump(d, next, f, f * rnd(1.6, 2.3), big ? 0.11 : 0.06, 0.008, big ? 0.24 : 0.12, big ? 0.05 : 0.03);
        if (big) e = Math.max(e, tick(d, next + 0.11, rnd(1500, 2400), 0.05, 0.008));
        release(d, e + 0.1);
        next += rnd(0.05, 0.45) / (0.2 + 1.3 * L.lv);
      }
    });
  }

  function cauldron(level) {
    setLoop("cauldron", level, buildCauldron, 0.6);
  }

  function ingredient(i = 0, correct = true) {
    if (!ready() || !gate("ingr", 0.08)) return;
    const idx = clamp(num(i, 0) | 0, 0, 2);
    const dest = wOut(0, 0.25);
    one(dest, (t, keep) => {
      // plop into the pot
      splashInto(dest, t, 0.3, keep);
      keep(thump(dest, t, 200, 420, 0.08, 0.008, 0.2, 0.04));
      if (correct) {
        // the pot answers with the next note of a rising chord (D, F#, A) and a curl of sparkle
        const n = [62, 66, 69][idx];
        keep(pluck(dest, t + 0.14, midi(n), 0.13, 0.7, 0.3));
        keep(bell(dest, t + 0.14, midi(n + 12), 0.05, 0.6));
        keep(bell(dest, t + 0.24, midi(n + 19), 0.03, 0.5));
        keep(crackle(dest, t + 0.16, 0.5, 5600, 0.02, 0.14, false));
        keep(tone(dest, t + 0.14, "sine", midi(n) * 0.5, midi(n) * 0.5, 0.4, 0.05, 0.1, 0.2));
      } else {
        // wrong: the brew burps a sour, sagging two-note "bleh"
        const lp = filt("lowpass", 800, 2);
        lp.connect(dest);
        keep(tone(lp, t + 0.14, "sawtooth", 155.6, 150, 0.14, 0.12, 0.02, 0.03));
        keep(tone(lp, t + 0.32, "sawtooth", 146.8, 104, 0.3, 0.12, 0.02, 0.06));
        bloops(dest, t + 0.2, 3, 160, 320, 0.3, 0.1, keep);
        keep(burst(dest, t + 0.16, {
          buf: pinkBuf, type: "bandpass", q: 0.8, f0: 700, f1: 300, sweep: 0.4, attack: 0.06, peak: 0.1, tc: 0.12,
        }));
      }
    });
  }

  function stir(onBeat = true) {
    if (!ready() || !gate("stir", 0.08)) return;
    const dest = wOut(0, 0.2);
    one(dest, (t, keep) => {
      // the paddle going round: thick liquid swirling, the spoon knocking the rim
      keep(whoosh(dest, t, 300, 900, 380, 0.16, 0.22, 0.26, 1.4, pinkBuf));
      bloops(dest, t + 0.05, 3, 240, 700, 0.25, 0.07, keep);
      if (onBeat) {
        // in time: the brew sings back, bright and whole
        keep(knock(dest, t, 420, 0.16, 0.03));
        keep(pluck(dest, t, midi(74), 0.11, 0.5, 0.3));
        keep(bell(dest, t, midi(86), 0.04, 0.5));
        keep(whoosh(dest, t + 0.02, 1800, 5200, 3000, 0.14, 0.2, 0.03, 3, whiteBuf));
      } else {
        // out of time: a dull clonk and a slop
        keep(knock(dest, t, 230, 0.2, 0.03));
        keep(clang(dest, t, 300, 0.05, 0.08, 3));
        keep(burst(dest, t + 0.06, {
          buf: pinkBuf, type: "lowpass", q: 1.2, f0: 700, f1: 240, sweep: 0.12, attack: 0.02, peak: 0.16, tc: 0.05,
        }));
      }
    });
  }

  function brewDone() {
    if (!ready() || !gate("brew", 0.3)) return;
    const dest = wOut(0, 0.45);
    one(dest, (t, keep) => {
      // the brew turns: one big soft "FOOM" of bubbles, then light pouring upward
      keep(thump(dest, t, 120, 320, 0.3, 0.03, 0.4, 0.12));
      keep(whoosh(dest, t, 300, 3200, 1600, 0.4, 0.5, 0.2, 0.9, pinkBuf));
      bloops(dest, t, 8, 300, 1600, 0.5, 0.08, keep);
      keep(pad(dest, t + 0.2, [midi(50), midi(57), midi(62), midi(66), midi(69)], 1.4, 0.07, 0.5, 0.6, 2400));
      const n = [62, 66, 69, 74, 78, 81, 86, 90];
      for (let i = 0; i < n.length; i++) {
        keep(bell(dest, t + 0.25 + i * 0.075, midi(n[i]), 0.08 - i * 0.004, 0.3 + i * 0.07));
        if (i % 2 === 0) keep(pluck(dest, t + 0.25 + i * 0.075, midi(n[i]), 0.06, 0.4, 0.3));
      }
      keep(crackle(dest, t + 0.5, 1.1, 6000, 0.03, 0.14, false));
    });
  }

  function brewFail() {
    if (!ready() || !gate("brew", 0.3)) return;
    const dest = wOut(0, 0.25);
    one(dest, (t, keep) => {
      // "pfffff": a puff of grey smoke, a sad little slide downhill, the pot gurgling empty
      keep(thump(dest, t, 140, 70, 0.1, 0.01, 0.34, 0.07));
      keep(whoosh(dest, t, 2600, 900, 300, 0.05, 0.6, 0.3, 0.7, pinkBuf));
      const lp = filt("lowpass", 900, 2.5);
      lp.connect(dest);
      keep(tone(lp, t + 0.12, "sawtooth", 233, 220, 0.2, 0.1, 0.03, 0.04));
      keep(tone(lp, t + 0.38, "sawtooth", 196, 110, 0.5, 0.1, 0.03, 0.1));
      keep(crackle(dest, t + 0.05, 0.6, 3000, 0.05, 0.2, false));
      // glug-glug-glug down the drain
      for (let i = 0; i < 5; i++) {
        const f = 420 - i * 50;
        keep(thump(dest, t + 0.75 + i * 0.11, f, f * 0.6, 0.07, 0.01, 0.12 - i * 0.015, 0.03));
      }
    });
  }

  function potionPickup() {
    if (!ready() || !gate("ppick", 0.08)) return;
    const dest = out(0, 0.3);
    one(dest, (t, keep) => {
      // glass against a claw, the liquid sloshing once, two glowing notes
      keep(bell(dest, t, rnd(2600, 3200), 0.09, 0.08));
      keep(tick(dest, t, 4600, 0.1));
      bloops(dest, t + 0.04, 3, 500, 1100, 0.14, 0.07, keep);
      keep(pluck(dest, t + 0.08, midi(78), 0.11, 0.4, 0.35));
      keep(pluck(dest, t + 0.18, midi(85), 0.11, 0.7, 0.35));
      keep(bell(dest, t + 0.18, midi(97), 0.03, 0.6));
    });
  }

  function potionThrow() {
    if (!ready() || !gate("pthrow", 0.08)) return;
    const dest = wOut(0, 0.1);
    one(dest, (t, keep) => {
      // a lobbed bottle: the swish of the arm, the bottle tumbling (a glassy flutter), liquid slapping inside
      keep(whoosh(dest, t, 500, 1900, 900, 0.09, 0.2, 0.22, 1.6, pinkBuf));
      const g = ctx.createGain();
      const e = swell(g.gain, t + 0.04, 0.05, 0.03, t + 0.4, 0.08);
      const o = osc("sine", 1500, t + 0.04, e);
      o.frequency.linearRampToValueAtTime(1150, t + 0.5);
      const tr = mkGain(0.5);
      const l = osc("sine", 13, t + 0.04, e);
      const lg = mkGain(0.5);
      l.connect(lg);
      lg.connect(tr.gain);
      o.connect(tr);
      tr.connect(g);
      g.connect(dest);
      keep(e);
      bloops(dest, t + 0.05, 2, 600, 1200, 0.2, 0.04, keep);
    });
  }

  function potionSmash(pan = 0) {
    if (!ready() || !gate("psmash", 0.05)) return;
    const dest = wd(clamp(num(pan, 0), -1, 1) * 0.8, 0, 0.35);
    one(dest, (t, keep) => {
      // a small bottle bursting, the potion splashing out, the magic fizzing up and away
      keep(burst(dest, t, { buf: whiteBuf, type: "highpass", q: 0.6, f0: 2600, attack: 0.002, peak: 0.3, tc: 0.03 }));
      keep(thump(dest, t, 320, 120, 0.05, 0.003, 0.24, 0.03));
      for (let i = 0; i < 10; i++) {
        keep(bell(dest, t + Math.pow(Math.random(), 1.6) * 0.3, rnd(2400, 6400), rnd(0.015, 0.05), rnd(0.03, 0.08)));
      }
      splashInto(dest, t + 0.01, 0.4, keep);
      keep(crackle(dest, t + 0.05, 0.9, 4200, 0.07, 0.25, false));
      keep(whoosh(dest, t + 0.05, 1500, 5200, 6500, 0.5, 0.3, 0.07, 2, whiteBuf));
      const n = [74, 78, 81, 86, 90];
      for (let i = 0; i < n.length; i++) keep(bell(dest, t + 0.12 + i * 0.08, midi(n[i]), 0.04, 0.35));
    });
  }

  function transform(seconds = 2.6) {
    if (!ready() || !gate("transform", 0.2)) return;
    const dur = clamp(num(seconds, 2.6), 0.8, 8);
    const dest = wOut(0, 0.5);
    one(dest, (t, keep) => {
      const tB = t + dur; // the bloom
      // 1. the swirl: air and light winding upward, faster and faster
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, tB);
      g.gain.setTargetAtTime(0, tB, 0.12);
      const src = noise(pinkBuf, t, tB + 1, 1.1);
      const bp = filt("bandpass", 300, 2.4);
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(4800, tB);
      const tr = mkGain(0.6);
      const l = osc("sine", 3, t, tB + 1);
      l.frequency.exponentialRampToValueAtTime(15, tB);
      const lg = mkGain(0.4);
      l.connect(lg);
      lg.connect(tr.gain);
      src.connect(bp);
      bp.connect(tr);
      tr.connect(g);
      g.connect(dest);
      // 2. three voices climbing two octaves, entering one after the other (D, A, d): warm, never shrill
      const base = [146.83, 220, 293.66];
      for (let i = 0; i < 3; i++) {
        const ts = t + i * dur * 0.18;
        const gv = ctx.createGain();
        gv.gain.setValueAtTime(0, ts);
        gv.gain.linearRampToValueAtTime(0.055, tB - 0.05);
        gv.gain.setTargetAtTime(0, tB, 0.2);
        const a = osc("sine", base[i], ts, tB + 1.5);
        const b = osc("triangle", base[i] * 1.004, ts, tB + 1.5);
        a.frequency.exponentialRampToValueAtTime(base[i] * 4, tB);
        b.frequency.exponentialRampToValueAtTime(base[i] * 4.01, tB);
        const bg = mkGain(0.3);
        const v = osc("sine", 5.5, ts, tB + 1.5);
        const vg = mkGain(base[i] * 0.03);
        v.connect(vg);
        vg.connect(a.frequency);
        a.connect(gv);
        b.connect(bg);
        bg.connect(gv);
        gv.connect(dest);
      }
      // 3. sparkles gathering: sparse at first, a shower by the end, climbing a D major scale
      const SC = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88, 90, 93];
      const nSp = Math.round(8 + dur * 7);
      for (let i = 0; i < nSp; i++) {
        const x = Math.sqrt((i + Math.random()) / nSp);          // denser toward the end
        const deg = clamp(Math.round(x * (SC.length - 1) + rnd(-2, 2)), 0, SC.length - 1);
        keep(bell(dest, t + x * dur, midi(SC[deg] + 12), 0.016 + 0.03 * x, 0.12 + 0.2 * x));
      }
      keep(crackle(dest, t + dur * 0.3, dur * 0.7, 5600, 0.035, 0.16, true));
      // 4. THE BLOOM: a soft major chord opening like a flower, a deep gentle breath under it
      keep(pad(dest, tB, [midi(38), midi(50), midi(57), midi(62), midi(66), midi(69), midi(76)], 1.5, 0.085, 0.14, 0.7, 2600));
      keep(thump(dest, tB, 110, 55, 0.5, 0.03, 0.34, 0.25));
      const BL = [74, 78, 81, 86, 90, 93];
      for (let i = 0; i < BL.length; i++) {
        keep(bell(dest, tB + i * 0.055, midi(BL[i]), 0.07 - i * 0.006, 0.9));
        keep(pluck(dest, tB + i * 0.055, midi(BL[i] - 12), 0.05, 1.1, 0.3));
      }
      keep(whoosh(dest, tB, 5000, 2400, 900, 0.03, 1.2, 0.1, 0.7, whiteBuf));
      keep(crackle(dest, tB + 0.05, 1.3, 6500, 0.03, 0.14, false));
      // 5. ...and one new platypus chirp: a small, surprised, delighted "kwee?"
      const k = rnd(1.05, 1.2);
      keep(chirp(dest, tB + 0.75, 900 * k, 1250 * k, 0.1, 0.11));
      keep(chirp(dest, tB + 0.9, 1200 * k, 1750 * k, 0.2, 0.12, 8, 0.012));
      keep(tB + 1.2);
    });
  }

  function livingPotion() {
    if (!ready() || !gate("living", 0.5)) return;
    const dest = wOut(0, 0.5);
    one(dest, (t, keep) => {
      // three slow glass heartbeats, each one a glow: lub (D) - dub (A), fading, over a held breath of light
      keep(pad(dest, t, [midi(50), midi(62), midi(69), midi(78)], 2.4, 0.045, 0.8, 0.6, 2200));
      for (let i = 0; i < 3; i++) {
        const tb = t + 0.1 + i * 0.95;
        const a = 1 - i * 0.22;
        keep(bell(dest, tb, midi(74), 0.11 * a, 0.5));
        keep(pluck(dest, tb, midi(62), 0.1 * a, 0.6, 0.2));
        keep(thump(dest, tb, 73.4, 60, 0.2, 0.03, 0.2 * a, 0.12));
        keep(bell(dest, tb + 0.26, midi(81), 0.08 * a, 0.7));
        keep(pluck(dest, tb + 0.26, midi(69), 0.07 * a, 0.7, 0.2));
        keep(thump(dest, tb + 0.26, 55, 46, 0.2, 0.03, 0.14 * a, 0.14));
        // the glow itself: a soft swell of high air after each beat
        keep(whoosh(dest, tb, 3000, 6000, 4000, 0.3, 0.4, 0.018 * a, 3, whiteBuf));
      }
      keep(bell(dest, t + 2.6, midi(86), 0.03, 0.9));
    });
  }

  // ---- THE SCREAM -----------------------------------------------------------------

  let screamCurve = null;
  let afterG = null;     // the ring + heartbeat of the last scream / shotDown (stopAll fades it)

  function buildScreamCharge(L, t) {
    L.gain.connect(bus);
    const s = mkGain(0.25);
    L.gain.connect(s);
    s.connect(verbIn);
    const far = t + 1e6;
    // the inhale: air being pulled in, tightening ...
    const inh = bed(L, t, pinkBuf, "bandpass", 600, 1, 0.3, null, 1);
    // ... into a whistle-tone that climbs, with a nervous flutter
    const wh = osc("sine", 700, t, far);
    const wh2 = osc("triangle", 1400, t, far);
    const whG = mkGain(0);
    const wh2G = mkGain(0.12);
    wh.connect(whG);
    wh2.connect(wh2G);
    wh2G.connect(whG);
    whG.connect(L.gain);
    L.nodes.push(wh, wh2);
    const flut = osc("sine", 8, t, far);
    const flG = mkGain(0);
    flut.connect(flG);
    flG.connect(wh.frequency);
    L.nodes.push(flut);
    const body = osc("sine", 70, t, far);          // the chest filling: felt more than heard
    const bodyG = mkGain(0);
    body.connect(bodyG);
    bodyG.connect(L.gain);
    L.nodes.push(body);
    L.set = (lv, tt) => {
      // L.gain already follows the level; keep the breath audible when the charge has only just begun
      const f = 700 * Math.pow(2, 2.3 * lv);
      sp(inh.f.frequency, 500 + 3400 * lv, tt, 0.06);
      sp(inh.f.Q, 1 + 9 * lv * lv, tt, 0.06);
      sp(inh.g.gain, 0.3 / Math.max(0.18, lv), tt, 0.06);
      sp(wh.frequency, f, tt, 0.06);
      sp(wh2.frequency, f * 2.003, tt, 0.06);
      sp(whG.gain, 0.02 + 0.14 * lv * lv, tt, 0.06);
      sp(flut.frequency, 7 + 16 * lv, tt, 0.06);
      sp(flG.gain, f * 0.012 * lv, tt, 0.06);
      sp(body.frequency, 60 + 50 * lv, tt, 0.06);
      sp(bodyG.gain, 0.3 * lv, tt, 0.06);
    };
  }

  function screamCharge(frac) {
    setLoop("screamCharge", clamp(num(frac, 0), 0, 1), buildScreamCharge, 0.3);
  }

  function scream(power = 1, controlled = true) {
    const p = clamp(num(power, 1), 0, 1);
    const ctl = controlled !== false;
    const D = 0.5 + 0.5 * p;                 // the scream
    const S = ctl ? 1.2 + 2 * p : 4;         // THE SILENCE
    setLoop("screamCharge", 0, buildScreamCharge, 0.3);
    if (!ready()) return S;
    const t = ctx.currentTime + 0.012;
    const tD = t + D;
    const tBack = tD + S;

    // the world: flattened at once by the scream, gone when it ends, back over 1.5 s after the silence
    duck.gain.cancelScheduledValues(t);
    duck.gain.setValueAtTime(duck.gain.value, t);
    duck.gain.linearRampToValueAtTime(0.25, t + 0.07);
    duck.gain.linearRampToValueAtTime(0, tD);
    duck.gain.setValueAtTime(0, tBack);
    duck.gain.linearRampToValueAtTime(1, tBack + 1.5);
    // the birds come back last
    const J = loops.jungle;
    if (J && J.birdGate) {
      J.birdGate.gain.cancelScheduledValues(t);
      J.birdGate.gain.setTargetAtTime(0, t, 0.03);
      J.birdGate.gain.setTargetAtTime(1, tBack + 1.4, 0.9);
    }

    // ---- the voice: everything below is summed, driven hard through a shaper and sent to the limiter
    if (!screamCurve) {
      screamCurve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) screamCurve[i] = Math.tanh(((i / 1023) * 2 - 1) * 4);
    }
    const pre = ctx.createGain();
    pre.gain.setValueAtTime(0, t);
    pre.gain.linearRampToValueAtTime(1, t + 0.025);
    pre.gain.setValueAtTime(1, tD - 0.03);
    pre.gain.linearRampToValueAtTime(0, tD + 0.02);       // it does not fade. It STOPS.
    const brk = mkGain(1);                               // break-up (uncontrolled only)
    const drive = ctx.createWaveShaper();
    drive.curve = screamCurve;
    drive.oversample = "2x";
    const post = mkGain(0.55 + 0.45 * p);
    pre.connect(brk);
    brk.connect(drive);
    drive.connect(post);
    post.connect(storyBus);
    const vs = mkGain(0.32);
    post.connect(vs);
    vs.connect(storyVerb);                                // its echo is the only thing left in the silence
    const tStop = tD + 0.3;

    const f0 = (ctl ? 1320 : 1180) * rnd(0.98, 1.02);
    const srcs = [osc("sawtooth", f0 * 0.5, t, tStop), osc("sawtooth", f0 * 0.5, t, tStop), osc("square", f0 * 0.25, t, tStop)];
    srcs[1].detune.value = 17;
    const mult = [1, 1, 0.5];
    const vib = osc("sine", 6.5, t, tStop);
    vib.frequency.linearRampToValueAtTime(ctl ? 11 : 15, tD);
    const vibG = ctx.createGain();
    vibG.gain.setValueAtTime(f0 * 0.01, t);
    vibG.gain.linearRampToValueAtTime(f0 * (ctl ? 0.035 : 0.06), tD);
    vib.connect(vibG);
    const voiceMix = mkGain(1);
    for (let i = 0; i < 3; i++) {
      const o = srcs[i];
      const m = mult[i];
      // the pitch: torn upward in 70 ms, pushed a little higher, sagging only at the very end
      o.frequency.setValueAtTime(f0 * 0.5 * m, t);
      o.frequency.exponentialRampToValueAtTime(f0 * m, t + 0.07);
      o.frequency.linearRampToValueAtTime(f0 * 1.12 * m, t + D * 0.6);
      o.frequency.linearRampToValueAtTime(f0 * 0.84 * m, tD);
      vibG.connect(o.frequency);
      if (!ctl) {
        // the voice cracks: it flips up a fifth for an instant, three or four times
        const cracks = irnd(3, 4);
        for (let c = 0; c < cracks; c++) {
          const tc = t + 0.12 + ((c + Math.random() * 0.7) / cracks) * (D - 0.2);
          o.detune.setValueAtTime((i === 1 ? 17 : 0) + 700, tc);
          o.detune.setValueAtTime(i === 1 ? 17 : 0, tc + rnd(0.03, 0.07));
        }
      }
      const og = mkGain(i === 2 ? 0.35 : 0.6);
      o.connect(og);
      og.connect(voiceMix);
    }
    // formants: a mouth opening as wide as it goes
    const FM = [[1150, 4, 1.0], [2750, 6, 0.8], [3900, 7, 0.45], [6200, 5, 0.2]];
    for (let i = 0; i < FM.length; i++) {
      const bp = filt("bandpass", FM[i][0], FM[i][1]);
      bp.frequency.setValueAtTime(FM[i][0] * 0.8, t);
      bp.frequency.exponentialRampToValueAtTime(FM[i][0] * 1.12, t + D * 0.5);
      const fg = mkGain(FM[i][2]);
      voiceMix.connect(bp);
      bp.connect(fg);
      fg.connect(pre);
    }
    const direct = filt("lowpass", 4200, 0.5);
    const dg = mkGain(0.12);
    voiceMix.connect(direct);
    direct.connect(dg);
    dg.connect(pre);
    // noise: the air itself tearing
    const n1 = noise(whiteBuf, t, tStop, 1);
    const n1f = filt("bandpass", 3000, 0.6);
    const n1g = mkGain(ctl ? 0.3 : 0.5);
    n1.connect(n1f);
    n1f.connect(n1g);
    n1g.connect(pre);
    const n2 = noise(pinkBuf, t, tStop, 0.7);
    const n2f = filt("lowpass", 700, 0.7);
    const n2g = mkGain(0.5);
    n2.connect(n2f);
    n2f.connect(n2g);
    n2g.connect(pre);
    if (!ctl) {
      // raw: the whole thing stutters and tears, it is not something it knows how to do
      const n = 48;
      const c = new Float32Array(n);
      let v = 1;
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.3) v = rnd(0.15, 0.6);
        else v += (1 - v) * 0.6;
        c[i] = v;
      }
      c[0] = 1;
      c[n - 1] = 1;
      brk.gain.setValueCurveAtTime(c, t + 0.05, D - 0.06);
    }
    // the sub drop: bypasses the shaper so it stays one clean falling floor under everything
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0, t);
    subG.gain.linearRampToValueAtTime(0.9, t + 0.03);
    subG.gain.setValueAtTime(0.9, tD - 0.05);
    subG.gain.linearRampToValueAtTime(0, tD + 0.03);
    const sub = osc("sine", 130, t, tStop);
    sub.frequency.exponentialRampToValueAtTime(30, tD);
    const sub2 = osc("triangle", 260, t, tStop);
    sub2.frequency.exponentialRampToValueAtTime(60, tD);
    const sub2g = mkGain(0.3);
    sub.connect(subG);
    sub2.connect(sub2g);
    sub2g.connect(subG);
    subG.connect(post);
    // the front of it: a shockwave leaving
    thump(post, t, 240, 50, 0.12, 0.003, 0.9, 0.07);
    burst(post, t, { buf: whiteBuf, type: "highpass", q: 0.5, f0: 1500, attack: 0.001, peak: 0.7, tc: 0.02 });

    // ---- THE SILENCE: what is left
    const after = outTo(storyBus, storyVerb, 0, 0.25);
    afterG = after;
    // the air falling back in where the sound was
    thump(after, tD, 80, 24, 0.5, 0.012, 0.6, 0.2);
    // a faint high ring (two tones beating), fading through the silence
    const ring = ctx.createGain();
    ring.gain.setValueAtTime(0, tD);
    ring.gain.linearRampToValueAtTime(ctl ? 0.014 : 0.022, tD + 0.15);
    ring.gain.setTargetAtTime(0, tD + 0.2, S / 2.6);
    const r1 = osc("sine", 4186, tD, tBack + 1.6);
    const r2 = osc("sine", 4193, tD, tBack + 1.6);
    r1.connect(ring);
    r2.connect(ring);
    ring.connect(after);
    // a muffled heartbeat, its own, loud inside its head and slowing as the world returns
    const hb = filt("lowpass", 115, 0.7);
    hb.connect(after);
    let tb = tD + 0.42;
    let gap = 0.78;
    for (let i = 0; i < 8 && tb < tBack - 0.25; i++) {
      const pk = 0.55 * Math.min(1, 0.6 + i * 0.3) * (tb > tBack - 1.2 ? 0.6 : 1);
      thump(hb, tb, 62, 38, 0.1, 0.014, pk, 0.075);
      thump(hb, tb + 0.24, 54, 34, 0.1, 0.014, pk * 0.7, 0.085);
      tb += gap;
      gap += 0.05;
    }
    release(post, tStop + 0.2);
    release(after, tBack + 2);
    return S;
  }

  function screamFizzle() {
    setLoop("screamCharge", 0, buildScreamCharge, 0.3);
    if (!ready() || !gate("fizzle", 0.2)) return;
    const dest = out(0, 0.12);
    one(dest, (t, keep) => {
      // a squeak that cracks ...
      const k = rnd(0.95, 1.08);
      keep(chirp(dest, t, 1500 * k, 2100 * k, 0.07, 0.12));
      keep(chirp(dest, t + 0.07, 2500 * k, 1300 * k, 0.1, 0.09, 40, 0.06));
      // ... and a cough: two little "khh"s
      for (let i = 0; i < 2; i++) {
        const tc = t + 0.34 + i * 0.2;
        keep(burst(dest, tc, {
          buf: pinkBuf, type: "bandpass", q: 1.1, f0: 1500, f1: 700, sweep: 0.08, attack: 0.006, peak: 0.34 - i * 0.1, tc: 0.035,
        }));
        keep(rasp(dest, tc, 300 * k, 210 * k, 900, 2, 60, 0.08, 0.14 - i * 0.04));
        keep(thump(dest, tc, 160, 90, 0.04, 0.004, 0.16, 0.03));
      }
    });
  }

  // ---- dream ----------------------------------------------------------------------

  const DREAM_SCALE = [66, 68, 70, 73, 75, 78, 80, 82, 85, 87]; // F# pentatonic out of F# lydian: nothing can clash

  function buildDream(L, t) {
    L.gain.connect(bus);
    const s = mkGain(0.9);
    L.gain.connect(s);
    s.connect(verbIn);
    L.scale = 0.9;
    const far = t + 1e6;
    // slow glass pad: F# lydian over a low D, every partial breathing at its own pace
    const padLP = filt("lowpass", 1700, 0.5);
    const padG = mkGain(0.028);
    padLP.connect(padG);
    padG.connect(L.gain);
    lfo(L, t, 0.05, 500, padLP.frequency);
    const notes = [38, 50, 54, 61, 66, 68, 73, 77];
    const amps = [0.9, 0.7, 0.6, 0.5, 0.5, 0.4, 0.35, 0.22];
    for (let i = 0; i < notes.length; i++) {
      const f = midi(notes[i]);
      const a = osc("sine", f, t, far);
      const b = osc("sine", f * 1.003, t, far);
      const g = mkGain(amps[i] * 0.6);
      a.connect(g);
      b.connect(g);
      g.connect(padLP);
      L.nodes.push(a, b);
      lfo(L, t, 0.031 + i * 0.013, amps[i] * 0.35, g.gain);
    }
    // glass: a thin high shimmer, like a wet finger on a rim
    const rim = osc("sine", midi(90), t, far);
    const rimG = mkGain(0.004);
    rim.connect(rimG);
    rimG.connect(L.gain);
    L.nodes.push(rim);
    lfo(L, t, 0.07, 0.004, rimG.gain);
    lfo(L, t, 4.6, 5, rim.frequency);
    // far air
    const air = bed(L, t, pinkBuf, "bandpass", 700, 0.6, 0.012, null, 0.5);
    lfo(L, t, 0.04, 300, air.f.frequency);

    let nextChime = t + 1.5;
    let nextBreath = t + 4;
    every(L, 400, (now) => {
      if (nextChime < now) nextChime = now + 0.1;
      while (nextChime < now + 0.9) {
        // far wind chimes: two to five notes knocked by one breath of wind
        const d = outTo(L.gain, L.gain, rnd(-0.8, 0.8), 0, rnd(0.4, 1));
        const n = irnd(2, 5);
        let e = nextChime;
        let deg = irnd(2, DREAM_SCALE.length - 1);
        for (let i = 0; i < n; i++) {
          deg = clamp(deg + irnd(-2, 2), 0, DREAM_SCALE.length - 1);
          e = Math.max(e, bell(d, nextChime + i * rnd(0.12, 0.3), midi(DREAM_SCALE[deg] + 12), rnd(0.012, 0.03), rnd(0.6, 1.2)));
        }
        release(d, e + 0.2);
        nextChime += rnd(2.5, 7);
      }
      if (nextBreath < now + 0.9) {
        // a reversed breath: it grows out of nothing and is cut off
        const tb = Math.max(nextBreath, now + 0.05);
        const rise = rnd(1.4, 2.4);
        const d = outTo(L.gain, L.gain, rnd(-0.6, 0.6), 0, 1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, tb);
        g.gain.linearRampToValueAtTime(0.0001, tb + 0.01);
        g.gain.exponentialRampToValueAtTime(rnd(0.03, 0.05), tb + rise);
        g.gain.setTargetAtTime(0, tb + rise, 0.025);
        const src = noise(pinkBuf, tb, tb + rise + 0.4, 0.9);
        const f0 = rnd(500, 900);
        const bp = filt("bandpass", f0, 1.6);
        bp.frequency.setValueAtTime(f0, tb);
        bp.frequency.exponentialRampToValueAtTime(f0 * rnd(1.6, 2.4), tb + rise);
        src.connect(bp);
        bp.connect(g);
        g.connect(d);
        // and a reversed note inside it
        const gn = ctx.createGain();
        gn.gain.setValueAtTime(0, tb);
        gn.gain.linearRampToValueAtTime(0.0001, tb + 0.01);
        gn.gain.exponentialRampToValueAtTime(0.02, tb + rise);
        gn.gain.setTargetAtTime(0, tb + rise, 0.02);
        const on = osc("sine", midi(pick(DREAM_SCALE)), tb, tb + rise + 0.3);
        on.connect(gn);
        gn.connect(d);
        release(d, tb + rise + 0.6);
        nextBreath = tb + rise + rnd(5, 12);
      }
    });
  }

  function dreamAmbience(on) {
    setLoop("dream", on ? 1 : 0, buildDream, 2);
  }

  function dissolve(pan = 0) {
    if (!ready() || !gate("dissolve", 0.05)) return;
    const dest = outTo(bus, verbIn, clamp(num(pan, 0), -1, 1) * 0.8, 0.5, 1);
    one(dest, (t, keep) => {
      // a figure of glass turning to mist: a long airy "fffff" thinning upward, sparkles falling out of it
      keep(whoosh(dest, t, 1400, 5200, 7500, 0.25, 0.7, 0.12, 1.2, whiteBuf));
      keep(whoosh(dest, t, 500, 1100, 2400, 0.2, 0.6, 0.1, 0.9, pinkBuf));
      const n = irnd(9, 12);
      const top = irnd(6, 9);
      for (let i = 0; i < n; i++) {
        const x = i / n;
        const deg = clamp(top - Math.round(x * top) + irnd(-1, 1), 0, DREAM_SCALE.length - 1);
        keep(bell(dest, t + 0.08 + x * 0.9 + rnd(0, 0.05), midi(DREAM_SCALE[deg] + 12), 0.04 * (1 - x * 0.6), 0.25));
      }
      keep(tone(dest, t, "sine", 740, 370, 0.9, 0.025, 0.1, 0.25)); // the shape of him, sighing away
    });
  }

  function farVoice(syllables = 5, urgency = 0) {
    if (!ready() || !gate("farvoice", 0.15)) return;
    const u = clamp(num(urgency, 0), 0, 1);
    const n = clamp(num(syllables, 5) | 0, 1, 12);
    // Wobble's voice with no Wobble: from very far, through water, and it gets higher the more it matters
    const dry = outTo(bus, verbIn, rnd(-0.3, 0.3), 1.6, 0.26 + 0.14 * u);
    const lp = filt("lowpass", 1500 + 1300 * u, 0.6);
    const hp = filt("highpass", 300, 0.5);
    lp.connect(hp);
    hp.connect(dry);
    const t = ctx.currentTime + 0.02;
    let tt = t;
    let tEnd = t;
    const base = 108 * (1.15 + 0.75 * u);
    for (let i = 0; i < n; i++) {
      const dur = rnd(0.09, 0.14) * (1 - 0.3 * u) * (i === n - 1 ? 1.8 : 1);
      // the line rises toward its end when it is urgent ("...wait, don't go!"), falls gently when it is not
      const contour = u > 0.5 ? 1 + 0.22 * (i / n) : 1 - 0.08 * (i / n);
      const f = base * contour * rnd(0.94, 1.08);
      const v = pick(VOWELS);
      const g = ctx.createGain();
      const e = swell(g.gain, tt, 0.02, 1, tt + dur * 0.6, dur * 0.22);
      const o = osc("sawtooth", f, tt, e);
      const tri = osc("triangle", f, tt, e);
      const bend = i === n - 1 ? (u > 0.5 ? 1.18 : 0.86) : rnd(0.92, 1.1);
      o.frequency.linearRampToValueAtTime(f * bend, tt + dur);
      tri.frequency.linearRampToValueAtTime(f * bend, tt + dur);
      const vb = osc("sine", rnd(5.5, 7.5), tt, e);
      const vbG = mkGain(f * 0.02);
      vb.connect(vbG);
      vbG.connect(o.frequency);
      vbG.connect(tri.frequency);
      const pre = filt("lowpass", 2800, 0.5);
      const fa = filt("bandpass", v[0], 5);
      const fb = filt("bandpass", v[1], 7);
      const ga = mkGain(0.62);
      const gb = mkGain(0.34);
      const gt = mkGain(0.085);
      o.connect(pre);
      pre.connect(fa);
      pre.connect(fb);
      fa.connect(ga);
      fb.connect(gb);
      tri.connect(gt);
      ga.connect(g);
      gb.connect(g);
      gt.connect(g);
      g.connect(lp);
      if (e > tEnd) tEnd = e;
      tt += dur + rnd(0.05, 0.1) * (1 - 0.45 * u);
    }
    // a glassy halo on the last syllable, so the ear can find it in the dark
    tEnd = Math.max(tEnd, bell(dry, tt - 0.1, midi(u > 0.5 ? 85 : 78), 0.03, 0.8));
    release(lp, tEnd + 0.2);
    release(dry, tEnd + 0.3);
  }

  function pillarShatter(n = 0) {
    if (!ready() || !gate("pillar", 0.06)) return;
    const idx = Math.abs(num(n, 0) | 0);
    const dest = outTo(bus, verbIn, rnd(-0.4, 0.4), 0.6, 1);
    one(dest, (t, keep) => {
      // a glass pillar: it sings its own note as it goes (each pillar a different one), then comes down in pieces
      const note = DREAM_SCALE[idx % DREAM_SCALE.length];
      keep(bell(dest, t, midi(note), 0.14, 1.1));
      keep(bell(dest, t, midi(note - 12), 0.08, 0.9));
      keep(burst(dest, t, { buf: whiteBuf, type: "highpass", q: 0.6, f0: 2000, attack: 0.002, peak: 0.36, tc: 0.045 }));
      keep(thump(dest, t, 180, 46, 0.2, 0.004, 0.5, 0.12));
      keep(burst(dest, t, {
        buf: pinkBuf, type: "lowpass", q: 0.6, f0: 2600, f1: 300, sweep: 0.2, attack: 0.004, peak: 0.4, tc: 0.08,
      }));
      keep(crackle(dest, t, 0.7, 3000, 0.1, 0.3, false));
      for (let i = 0; i < 26; i++) {
        const ts = t + Math.pow(Math.random(), 1.5) * 1.1;
        keep(bell(dest, ts, rnd(1800, 6400), rnd(0.012, 0.05), rnd(0.04, 0.16)));
      }
      // the big pieces landing
      for (let i = 0; i < 4; i++) {
        const tp = t + 0.3 + i * rnd(0.12, 0.22);
        keep(thump(dest, tp, rnd(110, 170), 60, 0.06, 0.004, 0.24 - i * 0.04, 0.05));
        keep(bell(dest, tp, midi(note + pick([0, 7, 12])) * 2, 0.03, 0.3));
      }
      keep(crackle(dest, t + 0.8, 0.8, 4600, 0.035, 0.12, false));
    });
  }

  // ---- boss: the Platypus King ----------------------------------------------------

  /** His voice: a huge platypus. Deep growl-trill body + a mouth formant + the octave of a real chirp on top. */
  function kingVoice(dest, t, f0, f1, dur, peak, amHz) {
    let e = rasp(dest, t, f0, f1, 300, 1.1, amHz, dur, peak, dur * 0.2);
    e = Math.max(e, rasp(dest, t, f0 * 2.01, f1 * 2.01, 760, 2.2, amHz * 1.02, dur, peak * 0.6, dur * 0.2));
    e = Math.max(e, rasp(dest, t, f0 * 4, f1 * 4, 1500, 3, amHz, dur * 0.9, peak * 0.22, dur * 0.25));
    e = Math.max(e, tone(dest, t, "sine", f0 * 0.5, f1 * 0.5, dur, peak * 0.5, dur * 0.2, dur * 0.12));
    return e;
  }

  function bossRoar(size = 1) {
    if (!ready() || !gate("roar", 0.3)) return;
    const s = clamp(num(size, 1), 0.2, 1.5);
    const dest = wOut(0, 0.4, 0.7 + 0.3 * Math.min(1, s));
    one(dest, (t, keep) => {
      const dur = 0.9 + 0.7 * s;
      // intake, then the roar: it rises, holds, and rolls downhill
      keep(whoosh(dest, t, 300, 900, 500, 0.16, 0.05, 0.1, 1, pinkBuf));
      const tr = t + 0.16;
      keep(kingVoice(dest, tr, 96, 60, dur, 0.9, 21));
      keep(kingVoice(dest, tr + 0.03, 131, 82, dur * 0.8, 0.4, 27));
      keep(burst(dest, tr, {
        buf: pinkBuf, type: "bandpass", q: 0.7, rate: 0.8, f0: 900, f1: 380, sweep: dur,
        attack: 0.12, peak: 0.4, tc: dur * 0.3,
      }));
      keep(rumble(dest, tr, dur + 0.5, 150, 0.6 * s, 5, 0.5));
      // because he is, after all, a platypus: a giant "KWEEE" riding on top
      keep(chirp(dest, tr + 0.02, 330, 520, 0.2, 0.08, 20, 0.04));
      keep(chirp(dest, tr + 0.22, 520, 300, dur * 0.7, 0.07, 22, 0.05));
    });
  }

  function bossStep(strength = 0.7) {
    if (!ready() || !gate("bstep", 0.08)) return;
    const s = clamp(num(strength, 0.7), 0.05, 1.2);
    const dest = wOut(rnd(-0.15, 0.15), 0.25);
    one(dest, (t, keep) => {
      keep(thump(dest, t, 78, 26, 0.22, 0.006, 0.95 * s, 0.14));
      keep(thump(dest, t, 150, 50, 0.1, 0.005, 0.4 * s, 0.06));
      keep(burst(dest, t, {
        buf: pinkBuf, type: "lowpass", q: 0.6, f0: 1500, f1: 200, sweep: 0.15, attack: 0.004, peak: 0.6 * s, tc: 0.07,
      }));
      keep(crackle(dest, t + 0.04, 0.4, 2200, 0.05 * s, 0.2, false)); // pebbles jumping
      keep(clang(dest, t + 0.02, rnd(380, 520), 0.03 * s, 0.1, 4));   // his armour shifting
    });
  }

  function bossWindup(kind = "sweep") {
    if (!ready() || !gate("windup", 0.15)) return;
    const dest = wOut(0, 0.3);
    one(dest, (t, keep) => {
      if (kind === "slam") {
        // 1.0 s: he rears. A deep growl climbing an octave, armour creaking, the air pulled upward.
        keep(kingVoice(dest, t, 52, 108, 1.0, 0.6, 18));
        keep(creak(dest, t + 0.1, 160, 0.7, 0.07));
        keep(whoosh(dest, t, 200, 1300, 1500, 0.95, 0.05, 0.22, 1, pinkBuf));
        keep(tone(dest, t, "sine", 196, 392, 0.98, 0.07, 0.6, 0.02));
        keep(clang(dest, t + 0.5, 480, 0.04, 0.2, 4));
      } else if (kind === "charge") {
        // 1.1 s: three paw-scrapes, each quicker, a snort, a rising whine. Get out of the lane.
        const at = [0, 0.36, 0.64];
        for (let i = 0; i < 3; i++) {
          keep(thump(dest, t + at[i], 96, 44, 0.1, 0.005, 0.5 + i * 0.1, 0.07));
          keep(rattle(dest, t + at[i] + 0.02, 0.2, 1500, 1, 0.24, 0.6));
          keep(tone(dest, t + at[i], "triangle", 330 * (1 + i * 0.19), 330 * (1 + i * 0.19), 0.08, 0.05, 0.01, 0.03));
        }
        keep(burst(dest, t + 0.84, {
          buf: pinkBuf, type: "bandpass", q: 1.2, f0: 700, f1: 1600, sweep: 0.2, attack: 0.03, peak: 0.36, tc: 0.06,
        }));
        keep(kingVoice(dest, t + 0.8, 80, 130, 0.3, 0.45, 30));
        keep(tone(dest, t + 0.5, "sine", 262, 587, 0.58, 0.06, 0.4, 0.02));
      } else if (kind === "pound") {
        // 0.9 s: "hm - HM!" two stepped grunts a fifth apart, both paws going up
        keep(kingVoice(dest, t, 98, 94, 0.3, 0.5, 24));
        keep(tone(dest, t, "triangle", 196, 196, 0.26, 0.06, 0.03, 0.04));
        keep(clang(dest, t, 520, 0.04, 0.12, 4));
        keep(kingVoice(dest, t + 0.42, 147, 150, 0.44, 0.7, 28));
        keep(tone(dest, t + 0.42, "triangle", 293.7, 311, 0.44, 0.07, 0.03, 0.03));
        keep(clang(dest, t + 0.42, 660, 0.05, 0.14, 4));
        keep(whoosh(dest, t + 0.42, 300, 1500, 1700, 0.45, 0.04, 0.16, 1.2, pinkBuf));
      } else if (kind === "spit") {
        // 0.8 s: a wet gurgle rising in his throat and a hissing breath in
        for (let i = 0; i < 9; i++) {
          const f = 160 + i * 42;
          keep(thump(dest, t + i * 0.075 + rnd(0, 0.02), f, f * 1.7, 0.06, 0.008, 0.2, 0.03));
        }
        keep(rasp(dest, t, 70, 120, 520, 2, 34, 0.75, 0.3, 0.3));
        keep(whoosh(dest, t + 0.1, 900, 4200, 4600, 0.66, 0.04, 0.14, 2.5, whiteBuf));
        keep(tone(dest, t + 0.2, "sine", 440, 880, 0.56, 0.035, 0.4, 0.02));
      } else {
        // sweep, 0.7 s: the tail drawn back - a long rising swish and a tightening creak
        keep(whoosh(dest, t, 260, 2200, 2600, 0.66, 0.04, 0.3, 1.4, pinkBuf));
        keep(tone(dest, t, "sawtooth", 110, 300, 0.66, 0.03, 0.4, 0.02));
        keep(tone(dest, t, "sine", 220, 600, 0.66, 0.06, 0.4, 0.02));
        keep(creak(dest, t + 0.1, 200, 0.5, 0.08));
        keep(kingVoice(dest, t, 70, 92, 0.6, 0.3, 22));
      }
    });
  }

  function bossSwipe() {
    if (!ready() || !gate("bswipe", 0.1)) return;
    const t = ctx.currentTime + 0.004;
    const g = mkGain(1);
    let last = g;
    if (ctx.createStereoPanner) {
      const pn = ctx.createStereoPanner();
      const side = Math.random() < 0.5 ? -1 : 1;
      pn.pan.setValueAtTime(-0.8 * side, t);
      pn.pan.linearRampToValueAtTime(0.8 * side, t + 0.3);
      g.connect(pn);
      last = pn;
    }
    last.connect(wBus);
    // a tree-trunk of a tail going past: a huge low whoosh with a hissing edge
    let e = whoosh(g, t, 180, 1300, 260, 0.14, 0.28, 0.9, 0.8, pinkBuf);
    e = Math.max(e, whoosh(g, t + 0.02, 900, 4200, 1200, 0.12, 0.2, 0.2, 1.6, whiteBuf));
    e = Math.max(e, thump(g, t + 0.1, 120, 40, 0.2, 0.05, 0.4, 0.1));
    e = Math.max(e, tone(g, t, "sine", 420, 150, 0.3, 0.05, 0.1, 0.06));
    release(g, e + 0.15);
  }

  function bossSlam() {
    if (!ready() || !gate("bslam", 0.15)) return;
    const dest = wOut(0, 0.4, 1.2);
    one(dest, (t, keep) => {
      // the ground takes it: sub drop, a crack through the rock, everything loose jumping, a long rolling tail
      keep(thump(dest, t, 110, 22, 0.5, 0.004, 1.2, 0.26));
      keep(thump(dest, t, 220, 44, 0.16, 0.003, 0.6, 0.08));
      keep(burst(dest, t, { buf: whiteBuf, type: "highpass", q: 0.5, f0: 1300, attack: 0.001, peak: 0.6, tc: 0.02 }));
      keep(burst(dest, t, {
        buf: pinkBuf, type: "lowpass", q: 0.6, f0: 3600, f1: 120, sweep: 0.5, attack: 0.002, peak: 1.0, tc: 0.16,
      }));
      keep(crackle(dest, t, 0.5, 1800, 0.25, 0.35, false));
      keep(rumble(dest, t + 0.05, 1.6, 240, 0.6, 5, 0.5));
      keep(crackle(dest, t + 0.3, 1.2, 2600, 0.07, 0.15, false));
      keep(clang(dest, t + 0.02, 330, 0.1, 0.4, 5));
      for (let i = 0; i < 5; i++) keep(thump(dest, t + rnd(0.25, 1.1), rnd(120, 220), 70, 0.05, 0.004, rnd(0.06, 0.16), 0.03));
    });
  }

  function buildBossCharge(L, t) {
    loopOut(L, wBus, wVerb, 0.2);
    L.scale = 0.95;
    // a gallop: da-da-DUM, da-da-DUM, the ground drumming under him, armour jangling, breath like a bellows
    const rum = bed(L, t, pinkBuf, "lowpass", 130, 0.7, 0.3, null, 0.5);
    lfo(L, t, 7.6, 0.14, rum.g.gain);
    const jing = bed(L, t, whiteBuf, "bandpass", 2600, 3, 0.02, null, 1);
    lfo(L, t, 7.6, 0.018, jing.g.gain);
    let next = t + 0.02;
    let n = 0;
    every(L, 200, (now) => {
      if (next < now) next = now + 0.02;
      while (next < now + 0.6) {
        const cyc = 0.4;
        const at = [0, 0.1, 0.2];
        const pk = [0.5, 0.6, 0.95];
        for (let i = 0; i < 3; i++) {
          const th = next + at[i];
          thump(L.gain, th, 84 + i * 6, 28, 0.14, 0.004, pk[i], 0.07 + i * 0.02);
          burst(L.gain, th, {
            buf: pinkBuf, type: "lowpass", q: 0.6, f0: 1300, f1: 220, sweep: 0.08, attack: 0.003, peak: pk[i] * 0.5, tc: 0.04,
          });
        }
        clang(L.gain, next + 0.2, rnd(420, 560), 0.035, 0.1, 4);
        if (n % 2 === 0) {
          // a snort every second stride
          burst(L.gain, next + 0.26, {
            buf: pinkBuf, type: "bandpass", q: 1.1, f0: 900, f1: 500, sweep: 0.12, attack: 0.02, peak: 0.2, tc: 0.04,
          });
          rasp(L.gain, next + 0.26, 86, 70, 420, 1.5, 30, 0.12, 0.2);
        }
        n++;
        next += cyc;
      }
    });
  }

  function bossCharge(on) {
    setLoop("bossCharge", on ? 1 : 0, buildBossCharge, 0.3);
  }

  function bossHitWall() {
    if (!ready() || !gate("bwall", 0.2)) return;
    const dest = wOut(0, 0.4, 1.15);
    one(dest, (t, keep) => {
      // WHAM. Rock cracking, his armour ringing like a dropped bell ... and then the little birds: he is dizzy.
      keep(thump(dest, t, 130, 26, 0.4, 0.003, 1.2, 0.2));
      keep(burst(dest, t, {
        buf: pinkBuf, type: "lowpass", q: 0.6, f0: 4200, f1: 180, sweep: 0.35, attack: 0.002, peak: 1.0, tc: 0.12,
      }));
      keep(burst(dest, t, { buf: whiteBuf, type: "highpass", q: 0.5, f0: 1600, attack: 0.001, peak: 0.5, tc: 0.02 }));
      keep(clang(dest, t, 246, 0.26, 0.9, 6));
      keep(clang(dest, t + 0.01, 370, 0.12, 0.6, 5));
      keep(crackle(dest, t, 0.7, 1600, 0.22, 0.3, false));
      keep(rumble(dest, t + 0.1, 1.4, 300, 0.4, 5, 0.5));
      for (let i = 0; i < 5; i++) keep(thump(dest, t + rnd(0.3, 1.2), rnd(110, 200), 60, 0.06, 0.004, rnd(0.08, 0.2), 0.04));
      keep(kingVoice(dest, t + 0.12, 150, 70, 0.5, 0.5, 14)); // "hrrnngh"
      // dizzy: a wobbling whistle going round and round, with stars
      const g = ctx.createGain();
      const e = swell(g.gain, t + 0.5, 0.2, 0.05, t + 2.0, 0.25);
      const o = osc("sine", 880, t + 0.5, e);
      o.frequency.linearRampToValueAtTime(700, t + 2.3);
      const w = osc("sine", 3.2, t + 0.5, e);
      const wg = mkGain(120);
      w.connect(wg);
      wg.connect(o.frequency);
      o.connect(g);
      g.connect(dest);
      keep(e);
      for (let i = 0; i < 7; i++) keep(bell(dest, t + 0.6 + i * 0.21, midi(pick([86, 88, 91, 93, 98])), 0.03, 0.2));
    });
  }

  function bossHurt(weakSpot = false) {
    if (!ready() || !gate("bhurt", 0.05)) return;
    const dest = wOut(rnd(-0.1, 0.1), 0.25);
    one(dest, (t, keep) => {
      if (weakSpot) {
        // it lands: a deep padded thump, a bright "got him" ping, and an outraged yelp two octaves above his dignity
        keep(thump(dest, t, 170, 46, 0.1, 0.004, 0.75, 0.07));
        keep(burst(dest, t, {
          buf: pinkBuf, type: "lowpass", q: 0.6, f0: 2400, f1: 400, sweep: 0.07, attack: 0.003, peak: 0.6, tc: 0.035,
        }));
        keep(bell(dest, t, midi(86), 0.07, 0.25));
        keep(bell(dest, t + 0.05, midi(93), 0.05, 0.35));
        keep(kingVoice(dest, t + 0.03, 196, 104, 0.4, 0.6, 34));
        keep(chirp(dest, t + 0.03, 700, 420, 0.3, 0.1, 30, 0.06));
        keep(crackle(dest, t, 0.25, 3600, 0.05, 0.25, false));
      } else {
        // armour: a dull heavy clank that goes nowhere, and an unimpressed "hmf"
        keep(clang(dest, t, rnd(250, 300), 0.22, 0.2, 6));
        keep(thump(dest, t, 150, 80, 0.04, 0.003, 0.4, 0.03));
        keep(tick(dest, t, 2600, 0.2));
        keep(burst(dest, t, { buf: pinkBuf, type: "bandpass", q: 1.5, f0: 900, attack: 0.002, peak: 0.3, tc: 0.02 }));
        keep(kingVoice(dest, t + 0.1, 92, 78, 0.16, 0.3, 24));
      }
    });
  }

  function bossPhase() {
    if (!ready() || !gate("bphase", 0.5)) return;
    const dest = wOut(0, 0.45, 1.1);
    one(dest, (t, keep) => {
      // plates of armour bursting off, then he gathers himself: a rising power-growl that opens into a roar
      keep(thump(dest, t, 140, 30, 0.3, 0.004, 1.0, 0.16));
      keep(burst(dest, t, { buf: whiteBuf, type: "highpass", q: 0.5, f0: 1500, attack: 0.001, peak: 0.5, tc: 0.03 }));
      for (let i = 0; i < 6; i++) {
        const tc = t + 0.03 + Math.pow(Math.random(), 1.4) * 0.9;
        keep(clang(dest, tc, rnd(300, 1100), rnd(0.08, 0.18), rnd(0.15, 0.5), 5));
      }
      keep(rattle(dest, t, 0.9, 2200, 1.5, 0.2, 0.4));
      const tr = t + 0.5;
      keep(kingVoice(dest, tr, 55, 110, 0.9, 0.6, 16));
      keep(whoosh(dest, tr, 200, 2400, 2600, 0.9, 0.06, 0.3, 0.9, pinkBuf));
      keep(pad(dest, tr, [midi(38), midi(45), midi(51), midi(57)], 0.9, 0.09, 0.8, 0.2, 900));  // D phrygian colour (Eb on top)
      const tx = tr + 0.95;
      keep(thump(dest, tx, 100, 24, 0.5, 0.004, 1.1, 0.24));
      keep(kingVoice(dest, tx, 104, 60, 1.3, 0.95, 22));
      keep(kingVoice(dest, tx + 0.03, 139, 80, 1.0, 0.4, 28));
      keep(rumble(dest, tx, 1.8, 180, 0.7, 5, 0.5));
      keep(chirp(dest, tx + 0.02, 360, 560, 0.2, 0.08, 20, 0.04));
      keep(chirp(dest, tx + 0.22, 560, 300, 0.9, 0.07, 22, 0.05));
      keep(crackle(dest, tx, 0.9, 2000, 0.12, 0.25, false));
    });
  }

  /** A crown hitting stone, bouncing ever faster, then spinning itself flat like a dropped coin. */
  function crownInto(dest, t, keep, vol) {
    const f = rnd(1150, 1300);
    let tb = t;
    let gap = 0.3;
    for (let i = 0; i < 7; i++) {
      const a = vol * (1 - i * 0.12);
      keep(clang(dest, tb, f * (i % 2 ? 1.06 : 1), 0.16 * a, 0.25, 6));
      keep(tick(dest, tb, 4200, 0.14 * a));
      keep(thump(dest, tb, 300, 160, 0.03, 0.002, 0.12 * a, 0.02));
      tb += gap;
      gap *= 0.7;
    }
    // the spin-down: a ring whose wobble accelerates until it stops dead
    const dur = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, tb);
    g.gain.linearRampToValueAtTime(0.07 * vol, tb + 0.05);
    g.gain.linearRampToValueAtTime(0.05 * vol, tb + dur - 0.05);
    g.gain.linearRampToValueAtTime(0, tb + dur);
    const tr = mkGain(0.5);
    const l = osc("sine", 7, tb, tb + dur + 0.05);
    l.frequency.exponentialRampToValueAtTime(42, tb + dur);
    const lg = mkGain(0.5);
    l.connect(lg);
    lg.connect(tr.gain);
    for (let i = 0; i < 3; i++) {
      const o = osc("sine", f * CLANG[i], tb, tb + dur + 0.05);
      const og = mkGain(1 / (1 + i));
      o.connect(og);
      og.connect(tr);
    }
    tr.connect(g);
    g.connect(dest);
    keep(rattle(dest, tb, dur, 3200, 4, 0.05 * vol, 0.5));
    keep(tb + dur + 0.1);
    keep(clang(dest, tb + dur, f * 0.5, 0.05 * vol, 0.1, 4)); // flat. Done.
    return tb + dur;
  }

  function crownClatter() {
    if (!ready() || !gate("crown", 0.3)) return;
    const dest = wOut(rnd(-0.2, 0.2), 0.3);
    one(dest, (t, keep) => { crownInto(dest, t, keep, 1); });
  }

  function kingFall() {
    if (!ready() || !gate("kingfall", 1)) return;
    const dest = wOut(0, 0.45, 1.15);
    one(dest, (t, keep) => {
      // 0.0 - 1.9  the long groan: all the air and all the fight going out of him, sliding down two octaves
      keep(kingVoice(dest, t, 150, 46, 1.9, 0.75, 12));
      keep(tone(dest, t, "sine", 300, 92, 1.8, 0.05, 0.3, 0.2));
      keep(burst(dest, t + 0.3, {
        buf: pinkBuf, type: "bandpass", q: 0.7, f0: 1100, f1: 300, sweep: 1.5, attack: 0.5, peak: 0.16, tc: 0.4,
      }));
      keep(creak(dest, t + 0.5, 130, 0.9, 0.1));       // armour folding as he topples
      keep(creak(dest, t + 0.9, 190, 0.7, 0.06));
      keep(whoosh(dest, t + 1.5, 200, 700, 300, 0.7, 0.1, 0.3, 0.8, pinkBuf)); // the fall itself: displaced air
      // 1.0 - 3.1  the crown comes off, clatters, rolls, spins flat
      const crown = outTo(dest, dest, 0.35, 0, 1);
      crownInto(crown, t + 1.0, keep, 0.8);
      // 2.3  the body hits the ground
      const tb = t + 2.3;
      keep(thump(dest, tb, 100, 20, 0.7, 0.004, 1.3, 0.34));
      keep(thump(dest, tb, 200, 40, 0.2, 0.003, 0.6, 0.1));
      keep(burst(dest, tb, {
        buf: pinkBuf, type: "lowpass", q: 0.6, f0: 3000, f1: 100, sweep: 0.6, attack: 0.003, peak: 1.0, tc: 0.2,
      }));
      keep(clang(dest, tb, 220, 0.2, 0.7, 6));
      keep(clang(dest, tb + 0.05, 311, 0.1, 0.5, 5));
      keep(crackle(dest, tb, 0.6, 1600, 0.2, 0.3, false));
      keep(rumble(dest, tb + 0.05, 1.3, 200, 0.6, 4, 0.5));
      keep(thump(dest, tb + 0.34, 84, 30, 0.3, 0.006, 0.5, 0.16)); // the tail, last
      // 2.5 - 4.3  dust and pebbles settling, thinner and thinner
      keep(rumble(dest, tb + 0.2, 1.8, 900, 0.14, 3, 0.9));
      keep(crackle(dest, tb + 0.3, 1.6, 3000, 0.06, 0.12, false));
      for (let i = 0; i < 6; i++) {
        const tp = tb + 0.4 + Math.pow(Math.random(), 0.8) * 1.4;
        keep(tick(dest, tp, rnd(1800, 3600), rnd(0.03, 0.08), 0.008));
      }
      // one last breath out. Then nothing.
      keep(burst(dest, tb + 0.8, {
        buf: pinkBuf, type: "bandpass", q: 0.8, f0: 700, f1: 320, sweep: 0.9, attack: 0.3, peak: 0.1, tc: 0.25,
      }));
    });
  }

  // ---- housekeeping (levels 6-11) ---------------------------------------------------

  /** Extra: muffle the WORLD bus (flashbacks, inside the armoury): 0 = open ... 1 = behind a wall. */
  function muffle(amount = 0, seconds = 0.4) {
    if (!ctx || !wLP || ctx.state === "closed") return;
    const a = clamp(num(amount, 0), 0, 1);
    const f = 20000 * Math.pow(0.02, a); // 20 kHz ... 400 Hz
    const t = ctx.currentTime;
    const tc = Math.max(0.02, num(seconds, 0.4) / 3);
    wLP.frequency.cancelScheduledValues(t);
    wLP.frequency.setTargetAtTime(f, t, tc);
    wVerbLP.frequency.cancelScheduledValues(t);
    wVerbLP.frequency.setTargetAtTime(f, t, tc);
  }

  function stopAll2() {
    H.on = false;
    JL.birds = 1;
    JL.insects = 1;
    JL.wind = 1;
    if (afterG && ctx && ctx.state !== "closed") {
      afterG.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      afterG = null;
    }
    stopAll(); // kills every loop above (they all live in `loops`), restores the duck and the world low-pass
  }


  // =========================================================================== extensions 3 (levels 12-13, LEVELS3.md B2)
  // All procedural, through the world bus (wOut / loops on wBus). Positional sounds take world (x, z): they are panned
  // and attenuated against the ear set by setEar(x, z, yaw) (the level / world calls it with the player each frame;
  // without it the ear sits at the origin). Every `level` bed returns { stop() } (and level 0 stops it too).
  let earX = 0, earZ = 0, earYaw = 0;
  function setEar(x, z, yaw) { earX = num(x, 0); earZ = num(z, 0); earYaw = num(yaw, 0); }
  function at(x, z, range) {
    if (typeof x !== "number" || typeof z !== "number") return { pan: 0, g: 1 };
    const dx = x - earX, dz = z - earZ, d = Math.hypot(dx, dz);
    // the listener faces +z rotated by yaw; right is (cos yaw, -sin yaw)
    const side = d > 0.01 ? (dx * Math.cos(earYaw) - dz * Math.sin(earYaw)) / d : 0;
    const r = range || 30;
    return { pan: clamp(side * 0.8, -0.9, 0.9), g: clamp(1 / (1 + (d / r) * (d / r) * 3), 0.04, 1), d };
  }
  const bedHandle = (name) => ({ stop() { setLoop(name, 0, null, 0.8); } });
  const vary = (k) => k * rnd(0.94, 1.06);

  // ---- the volcano ----------------------------------------------------------------
  function lavaBubble(x, z) {
    if (!ready() || !gate("lavaBubble", 0.06)) return;
    const p = at(x, z, 18);
    const dest = wOut(p.pan, 0.12, p.g);
    one(dest, (t, keep) => {
      const f = rnd(60, 140);
      keep(thump(dest, t, f, f * rnd(1.6, 2.4), rnd(0.08, 0.15), 0.02, 0.3, rnd(0.06, 0.12)));
      keep(burst(dest, t + rnd(0.08, 0.14), { buf: pinkBuf, type: "bandpass", q: 1.4, f0: rnd(500, 1000), attack: 0.003, peak: 0.12, tc: 0.025 }));
      if (Math.random() < 0.5) keep(crackle(dest, t + 0.1, 0.4, 4000, 0.05, 0.2, false));
    });
  }
  function buildLavaBed(L, t) {
    loopOut(L, wBus, wVerb, 0.18);
    L.scale = 0.9;
    const roar = bed(L, t, pinkBuf, "lowpass", 140, 0.7, 0.45, null, 0.45);
    lfo(L, t, 0.11, 40, roar.f.frequency);
    lfo(L, t, 0.17, 0.12, roar.g.gain);
    const sub = osc("sine", 36, t, t + 1e6); const subG = mkGain(0.1); sub.connect(subG); subG.connect(L.gain); L.nodes.push(sub);
    lfo(L, t, 0.23, 0.05, subG.gain);
    const hiss = bed(L, t, whiteBuf, "highpass", 3800, 0.5, 0.012, null, 1);
    lfo(L, t, 0.31, 0.006, hiss.g.gain);
    const cr = bed(L, t, whiteBuf, "bandpass", 2600, 0.8, 0.0, null, 1.1);
    let next = t + 0.1;
    every(L, 350, (now) => {
      if (next < now) next = now + 0.03;
      while (next < now + 0.8) {
        // crackle: a stony fizz in short bursts
        cr.g.gain.setValueAtTime(0, next);
        cr.g.gain.linearRampToValueAtTime(rnd(0.01, 0.04), next + 0.01);
        cr.g.gain.setTargetAtTime(0, next + 0.02, rnd(0.02, 0.08));
        if (Math.random() < 0.35) { const f = rnd(60, 150); thump(L.gain, next, f, f * 2, 0.12, 0.02, rnd(0.08, 0.18), 0.08); }
        next += rnd(0.08, 0.5);
      }
    });
  }
  function lavaAmbience(level) { setLoop("lavaBed", level, buildLavaBed, 1.2); return bedHandle("lavaBed"); }
  function eruption(x, z, size = 1) {
    if (!ready() || !gate("eruption", 0.12)) return;
    const s = clamp(num(size, 1), 0.1, 1.6);
    const p = at(x, z, 80);
    const dest = wOut(p.pan * 0.6, 0.4, clamp(0.35 + 0.65 * p.g, 0, 1));
    one(dest, (t, keep) => {
      keep(thump(dest, t, 70, 24, 0.6, 0.008, 0.6 * Math.min(1, s), 0.5));
      keep(rumble(dest, t, 1.4 + s, 300, 0.5 * s, 5, 0.5));
      keep(burst(dest, t, { buf: pinkBuf, type: "lowpass", f0: 1800, f1: 200, sweep: 0.5, attack: 0.004, peak: 0.35 * s, tc: 0.25 }));
      keep(rattle(dest, t + 0.3, 1.0 + s * 0.6, 2400, 1.2, 0.12 * s, 0.25));
      keep(crackle(dest, t + 0.05, 1.2, 3000, 0.08 * s, 0.3, false));
    });
  }
  function steamVent(x, z) {
    if (!ready() || !gate("steamVent", 0.3)) return;
    const p = at(x, z, 16);
    const dest = wOut(p.pan, 0.1, p.g);
    one(dest, (t, keep) => {
      keep(whoosh(dest, t, 1800, 4200, 2600, 0.08, 1.1, 0.16, 0.6, whiteBuf));
      keep(whoosh(dest, t, 400, 900, 500, 0.1, 0.9, 0.12, 0.5, pinkBuf));
    });
  }
  function rockCrack() {
    if (!ready() || !gate("rockCrack", 0.05)) return;
    const dest = wOut(rnd(-0.2, 0.2), 0.2);
    one(dest, (t, keep) => {
      keep(burst(dest, t, { buf: whiteBuf, type: "bandpass", q: 0.9, f0: 2400, f1: 900, sweep: 0.05, attack: 0.001, peak: 0.35, tc: 0.03 }));
      keep(thump(dest, t, 180, 60, 0.08, 0.002, 0.3, 0.06));
      keep(rattle(dest, t + 0.03, 0.35, 3200, 1.5, 0.12, 0.35));
    });
  }
  function buildGrind(L, t) {
    loopOut(L, wBus, wVerb, 0.25);
    const g = bed(L, t, pinkBuf, "lowpass", 220, 0.9, 0.5, null, 0.35);
    lfo(L, t, 0.7, 60, g.f.frequency); lfo(L, t, 1.3, 0.2, g.g.gain);
    const s = bed(L, t, pinkBuf, "bandpass", 700, 2.5, 0.06, null, 0.5);
    lfo(L, t, 2.1, 200, s.f.frequency);
  }
  let grindT = null;
  function rockGrind(level) {
    const l = clamp(num(level, 0.6), 0, 1);
    setLoop("grind", l, buildGrind, 0.4);
    // a grind is always a moment: it fades on its own after ~2 s unless renewed
    if (grindT) clearTimeout(grindT);
    if (l > 0) grindT = setTimeout(() => { grindT = null; setLoop("grind", 0, buildGrind, 1.2); }, 1800);
    return bedHandle("grind");
  }
  function magmorRoar(size = 1) {
    if (!ready() || !gate("magmorRoar", 0.25)) return;
    const s = clamp(num(size, 1), 0.1, 1.5);
    const dest = wOut(0, 0.45, 0.9);
    one(dest, (t, keep) => {
      const dur = 0.8 + s * 1.4;
      // a mountain's throat: low formant growl + boiling rumble + stone grit
      keep(vox(dest, t, 55, 38, dur, 0.28 * s, [300, 700], 6, 0.06));
      keep(vox(dest, t + 0.05, 82, 50, dur * 0.9, 0.16 * s, [420, 950], 4.5, 0.05));
      keep(rumble(dest, t, dur + 0.4, 260, 0.6 * s, 6, 0.4));
      keep(rattle(dest, t + 0.1, dur, 1800, 1.1, 0.08 * s, 0.3));
      keep(thump(dest, t, 50, 30, 0.8, 0.02, 0.4 * s, 0.4));
    });
  }
  function magmorStep() {
    if (!ready() || !gate("magmorStep", 0.2)) return;
    const dest = wOut(rnd(-0.1, 0.1), 0.35);
    one(dest, (t, keep) => {
      keep(thump(dest, t, 62, 26, 0.35, 0.004, 0.55, 0.3));
      keep(burst(dest, t, { buf: pinkBuf, type: "lowpass", f0: 900, f1: 120, sweep: 0.3, attack: 0.003, peak: 0.3, tc: 0.18 }));
      keep(burst(dest, t + 0.05, { buf: pinkBuf, type: "bandpass", q: 0.8, f0: 600, attack: 0.01, peak: 0.12, tc: 0.4 })); // the lava slapping back
    });
  }
  const PENTA6 = [0, 2, 4, 7, 9, 12];
  function spellChime(i = 0) {
    if (!ready()) return;
    const dest = wOut(clamp((num(i, 0) - 2) * 0.25, -0.6, 0.6), 0.5);
    const f = 523.25 * Math.pow(2, PENTA6[clamp(i | 0, 0, 5)] / 12);
    one(dest, (t, keep) => {
      keep(bell(dest, t, f, 0.16, 1.1));
      keep(bell(dest, t + 0.01, f * 2, 0.05, 0.6));
      keep(tone(dest, t, "sine", f / 2, f / 2, 1.6, 0.05, 0.3, 0.5)); // the stone hums under it
    });
  }
  function dreamWake() {
    if (!ready()) return;
    const dest = wOut(0, 0.7);
    one(dest, (t, keep) => {
      // a white rush up, a bright chord, a breath
      keep(whoosh(dest, t, 300, 5000, 3000, 0.7, 0.8, 0.12, 0.5, whiteBuf));
      [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => keep(bell(dest, t + 0.6 + k * 0.05, f, 0.08, 1.4)));
      keep(pad(dest, t + 0.5, [261.6, 392, 523.3], 1.6, 0.06, 0.2, 0.6, 2200));
    });
  }
  function windGust(level = 0.6) { gust(level, rnd(-0.7, 0.7)); }
  function windWhoosh(pan = 0) {
    if (!ready() || !gate("windWhoosh", 0.08)) return;
    const dest = wOut(clamp(num(pan, 0), -1, 1), 0.2);
    one(dest, (t, keep) => {
      keep(whoosh(dest, t, 500, 2600, 900, 0.18, 0.5, 0.2, 1.2, pinkBuf));
      keep(whoosh(dest, t + 0.04, 1500, 5200, 2000, 0.15, 0.35, 0.05, 2, whiteBuf));
    });
  }
  function buildRush(L, t) {
    loopOut(L, wBus, wVerb, 0.1);
    const a = bed(L, t, pinkBuf, "bandpass", 600, 0.6, 0.3, null, 1);
    const b = bed(L, t, whiteBuf, "highpass", 3000, 0.5, 0.03, null, 1);
    lfo(L, t, 0.4, 150, a.f.frequency); lfo(L, t, 0.27, 0.08, a.g.gain); lfo(L, t, 0.5, 0.01, b.g.gain);
    L.set = (lv, tt) => { a.f.frequency.setTargetAtTime(400 + lv * 900, tt, 0.4); };
  }
  function flightRush(level) { setLoop("rush", level, buildRush, 0.8); return bedHandle("rush"); }

  // ---- the camp --------------------------------------------------------------------
  function campFire(level) { const r = fire(level); return r || bedHandle("fire"); }
  function eatCrunch() {
    if (!ready() || !gate("eatCrunch", 0.08)) return;
    const dest = wOut(rnd(-0.15, 0.15), 0.05);
    one(dest, (t, keep) => {
      for (let i = 0; i < 3; i++) {
        const tt = t + i * rnd(0.13, 0.19);
        keep(burst(dest, tt, { buf: whiteBuf, type: "bandpass", q: 1.4, f0: rnd(1800, 3200), attack: 0.002, peak: rnd(0.12, 0.2), tc: 0.03 }));
        keep(rattle(dest, tt + 0.01, 0.08, 4200, 2, 0.06, 0.5));
        keep(thump(dest, tt, 160, 90, 0.05, 0.002, 0.08, 0.03));
      }
    });
  }
  function splashSmall() { splash(0.25); }
  function firefly() {
    if (!ready() || !gate("firefly", 0.05)) return;
    const dest = wOut(rnd(-0.5, 0.5), 0.4);
    one(dest, (t, keep) => {
      const f = rnd(1800, 2600);
      keep(bell(dest, t, f, 0.05, 0.25));
      keep(bell(dest, t + 0.07, f * 1.5, 0.03, 0.2));
    });
  }
  function owl() {
    if (!ready() || !gate("owl", 1)) return;
    const dest = wOut(rnd(-0.8, 0.8), 0.6, 0.6);
    one(dest, (t, keep) => {
      // hoo... hoo-hoo
      const f = rnd(330, 370);
      keep(vox(dest, t, f * 1.05, f * 0.94, 0.45, 0.12, [380, 800], 0, 0));
      keep(vox(dest, t + 0.7, f * 1.02, f * 0.92, 0.22, 0.1, [380, 800], 0, 0));
      keep(vox(dest, t + 0.98, f * 1.0, f * 0.9, 0.42, 0.11, [380, 800], 0, 0));
    });
  }
  function buildCrickets(L, t) {
    loopOut(L, wBus, wVerb, 0.2);
    const carriers = [4300, 4700, 5100];
    for (let k = 0; k < 3; k++) {
      const o = osc("sine", carriers[k], t, t + 1e6), g = mkGain(0), am = osc("square", 28 + k * 3, t, t + 1e6), amG = mkGain(0.012);
      am.connect(amG); amG.connect(g.gain); o.connect(g); g.connect(L.gain); L.nodes.push(o, am);
      lfo(L, t, 0.5 + k * 0.13, 0.008, g.gain);
    }
  }
  function cricketNight(level) { setLoop("crickets", level, buildCrickets, 1.5); return bedHandle("crickets"); }
  function buildForest(L, t) {
    loopOut(L, wBus, wVerb, 0.3);
    const air = bed(L, t, pinkBuf, "bandpass", 500, 0.5, 0.1, null, 0.6);
    lfo(L, t, 0.07, 0.045, air.g.gain);
    const leaves = bed(L, t, whiteBuf, "bandpass", 2400, 0.8, 0.018, null, 1);
    lfo(L, t, 0.19, 0.012, leaves.g.gain);
    every(L, 1600, (now) => {
      const r = Math.random();
      if (r < 0.18) creak(L.gain, now + 0.2, rnd(160, 260), rnd(0.6, 1.2), 0.03);                                   // a branch creaks
      else if (r < 0.3) crackle(L.gain, now + 0.1, 0.25, 2500, 0.03, 0.3, false);                                    // twigs
      else if (r < 0.36) { const f = rnd(1300, 1700); chirp(L.gain, now + 0.1, f, f * 0.8, 0.15, 0.02); }             // a night bird
    });
  }
  function forestNight(level) { setLoop("forestNight", level, buildForest, 1.5); return bedHandle("forestNight"); }

  // ---- wolves ----------------------------------------------------------------------
  function wolfHowl(x, z, n = 1) {
    if (!ready() || !gate("wolfHowl", 0.4)) return;
    const p = at(x, z, 60);
    const dest = wOut(p.pan, 0.7, clamp(0.25 + p.g, 0, 1));
    const count = clamp(num(n, 1) | 0, 1, 4);
    one(dest, (t, keep) => {
      for (let i = 0; i < count; i++) {
        const tt = t + i * rnd(0.5, 1.1), f = rnd(380, 470) * (i ? rnd(0.85, 1.15) : 1);
        // rises, holds with a wavering vibrato, sags
        const g = mkGain(0);
        const dur = rnd(2.2, 3.2);
        g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.11, tt + 0.5); g.gain.setValueAtTime(0.11, tt + dur * 0.7); g.gain.linearRampToValueAtTime(0, tt + dur);
        const o = osc("sawtooth", f * 0.75, tt, tt + dur + 0.05);
        o.frequency.linearRampToValueAtTime(f, tt + 0.6); o.frequency.setValueAtTime(f, tt + dur * 0.65); o.frequency.exponentialRampToValueAtTime(f * 0.7, tt + dur);
        const v = osc("sine", 5.2, tt, tt + dur + 0.05), vg = mkGain(f * 0.012); v.connect(vg); vg.connect(o.frequency);
        const fa = filt("bandpass", 700, 4), fb = filt("bandpass", 1150, 6), lp = filt("lowpass", 2200, 0.5);
        o.connect(lp); lp.connect(fa); lp.connect(fb); fa.connect(g); fb.connect(g); g.connect(dest);
        keep(tt + dur + 0.1);
      }
    });
  }
  function wolfGrowl() {
    if (!ready() || !gate("wolfGrowl", 0.3)) return;
    const dest = wOut(rnd(-0.4, 0.4), 0.15);
    one(dest, (t, keep) => {
      keep(vox(dest, t, 95, 80, 1.1, 0.16, [400, 900], 22, 0.15));
      keep(rumble(dest, t, 1.1, 500, 0.14, 8, 0.8));
    });
  }
  function wolfBark() {
    if (!ready() || !gate("wolfBark", 0.12)) return;
    const dest = wOut(rnd(-0.4, 0.4), 0.2);
    one(dest, (t, keep) => {
      keep(vox(dest, t, 420, 260, 0.14, 0.2, [700, 1400], 0, 0));
      keep(burst(dest, t, { buf: pinkBuf, type: "bandpass", q: 1, f0: 900, attack: 0.003, peak: 0.16, tc: 0.04 }));
    });
  }
  function wolfYelp() {
    if (!ready() || !gate("wolfYelp", 0.1)) return;
    const dest = wOut(rnd(-0.4, 0.4), 0.25);
    one(dest, (t, keep) => {
      keep(vox(dest, t, 700, 1100, 0.12, 0.16, [900, 2000], 0, 0));
      keep(vox(dest, t + 0.16, 900, 600, 0.22, 0.12, [900, 1800], 9, 0.04));
    });
  }
  function buildPaws(L, t) {
    loopOut(L, wBus, wVerb, 0.1);
    const pant = bed(L, t, pinkBuf, "bandpass", 1400, 1.2, 0.0, null, 1); // a pack panting under the paws
    lfo(L, t, 3.1, 0.03, pant.g.gain);
    every(L, 120, (now) => {
      if (Math.random() < 0.8) {
        const tt = now + rnd(0, 0.1);
        burst(L.gain, tt, { buf: pinkBuf, type: "bandpass", q: 1.2, f0: rnd(500, 900), attack: 0.002, peak: rnd(0.12, 0.24), tc: 0.025 });
        thump(L.gain, tt, rnd(80, 100), 50, 0.05, 0.004, rnd(0.08, 0.16), 0.03);
        if (Math.random() < 0.3) crackle(L.gain, tt + 0.01, 0.08, 3000, 0.04, 0.3, false); // litter kicked up
      }
    });
  }
  function pawRun(level) { setLoop("paws", level, buildPaws, 0.3); return bedHandle("paws"); }

  // ---- the Far Lands -----------------------------------------------------------------
  function stoneTurn() {
    if (!ready() || !gate("stoneTurn", 0.15)) return;
    const dest = wOut(rnd(-0.2, 0.2), 0.3);
    one(dest, (t, keep) => {
      keep(rumble(dest, t, 0.55, 420, 0.3, 4, 0.7));
      keep(creak(dest, t, 120, 0.5, 0.06));
      keep(thump(dest, t + 0.5, 110, 50, 0.12, 0.003, 0.35, 0.1)); // the clunk into place
    });
  }
  const runeHums = {};
  function runeHum(i = 0, on = true) {
    const k = "rune" + (i | 0);
    if (!on) { setLoop(k, 0, null, 1); return; }
    setLoop(k, 0.5, (L, t) => {
      loopOut(L, wBus, wVerb, 0.5);
      const f = 130.8 * Math.pow(2, PENTA6[clamp(i | 0, 0, 5)] / 12);
      for (const m of [1, 2, 3.01]) { const o = osc("sine", f * m, t, t + 1e6), g = mkGain(0.05 / m); o.connect(g); g.connect(L.gain); L.nodes.push(o); lfo(L, t, 0.3 + m * 0.1, 0.02 / m, g.gain); }
    }, 1);
    void runeHums;
    return bedHandle(k);
  }
  function buildPortal(L, t) {
    loopOut(L, wBus, wVerb, 0.5);
    const d = bed(L, t, pinkBuf, "lowpass", 160, 0.7, 0.3, null, 0.5);
    lfo(L, t, 0.5, 40, d.f.frequency);
    const sw = bed(L, t, pinkBuf, "bandpass", 700, 3, 0.07, null, 0.8);
    lfo(L, t, 0.33, 400, sw.f.frequency);
    for (const f of [110, 164.8, 220.4]) { const o = osc("sine", f, t, t + 1e6), g = mkGain(0.035); o.connect(g); g.connect(L.gain); L.nodes.push(o); lfo(L, t, 0.13 + f * 0.0007, 0.02, g.gain); }
    const sh = bed(L, t, whiteBuf, "highpass", 6000, 0.5, 0.01, null, 1);
    lfo(L, t, 6, 0.006, sh.g.gain);
  }
  function portalHum(level) { setLoop("portal", level, buildPortal, 1.2); return bedHandle("portal"); }
  function portalOpen() {
    if (!ready()) return;
    const dest = wOut(0, 0.8);
    one(dest, (t, keep) => {
      keep(rumble(dest, t, 1.6, 300, 0.5, 4, 0.5));
      keep(burst(dest, t + 1.2, { buf: whiteBuf, type: "lowpass", f0: 400, f1: 9000, sweep: 0.5, attack: 0.4, peak: 0.25, tc: 0.4 }));
      [220, 277.2, 329.6, 440, 554.4].forEach((f, k) => keep(bell(dest, t + 1.3 + k * 0.06, f * 2, 0.07, 1.6)));
      keep(thump(dest, t + 1.3, 80, 30, 0.6, 0.01, 0.5, 0.4));
    });
  }
  function portalKnock() {
    if (!ready()) return;
    const dest = wOut(0, 0.6);
    one(dest, (t, keep) => {
      keep(burst(dest, t, { buf: whiteBuf, type: "lowpass", f0: 12000, f1: 300, sweep: 0.4, attack: 0.002, peak: 0.45, tc: 0.15 }));
      keep(thump(dest, t, 90, 28, 0.4, 0.002, 0.6, 0.25));
      keep(whoosh(dest, t + 0.05, 2000, 400, 200, 0.05, 0.6, 0.18, 0.8, pinkBuf));
      keep(tone(dest, t + 0.3, "sine", 2200, 2100, 1.6, 0.025, 0.1, 0.6)); // ears ringing
    });
  }

  // ---- babies & robots ------------------------------------------------------------------
  function babyChirp(i = 0) {
    if (!ready() || !gate("babyChirp" + (i | 0), 0.08)) return;
    const dest = wOut(rnd(-0.3, 0.3), 0.12);
    const k = [1, 1.12, 1.26][clamp(i | 0, 0, 2)] * rnd(0.97, 1.03);
    one(dest, (t, keep) => {
      keep(chirp(dest, t, 1700 * k, 2500 * k, 0.07, 0.1));
      keep(chirp(dest, t + 0.1, 2100 * k, 1600 * k, 0.09, 0.08));
      // one in eight: a tiny electronic click under the chirp (the illusion leaking)
      if (Math.random() < 0.125) keep(burst(dest, t + 0.02, { buf: whiteBuf, type: "highpass", f0: 7000, attack: 0.0005, peak: 0.05, tc: 0.004 }));
    });
  }
  function babyCry(i = 0) {
    if (!ready() || !gate("babyCry" + (i | 0), 0.4)) return;
    const dest = wOut(rnd(-0.3, 0.3), 0.15);
    const k = [1, 1.1, 1.22][clamp(i | 0, 0, 2)];
    one(dest, (t, keep) => {
      keep(vox(dest, t, 900 * k, 1200 * k, 0.35, 0.09, [1100, 2600], 8, 0.04));
      keep(vox(dest, t + 0.45, 1100 * k, 800 * k, 0.5, 0.08, [1100, 2400], 8, 0.05));
    });
  }
  function robotServo() {
    if (!ready() || !gate("robotServo", 0.1)) return;
    const dest = wOut(rnd(-0.3, 0.3), 0.1);
    one(dest, (t, keep) => {
      const f = rnd(300, 500);
      keep(tone(dest, t, "sawtooth", f, f * 1.6, 0.25, 0.06, 0.02, 0.04));
      keep(tone(dest, t + 0.28, "sawtooth", f * 1.6, f * 1.2, 0.15, 0.05, 0.02, 0.03));
      keep(burst(dest, t + 0.45, { buf: whiteBuf, type: "bandpass", q: 3, f0: 3000, attack: 0.001, peak: 0.16, tc: 0.012 }));
      keep(thump(dest, t + 0.45, 260, 180, 0.03, 0.001, 0.12, 0.02, "triangle")); // the joint locking
    });
  }
  function robotLaser() {
    if (!ready() || !gate("robotLaser", 0.08)) return;
    const dest = wOut(rnd(-0.2, 0.2), 0.2);
    one(dest, (t, keep) => {
      keep(tone(dest, t, "square", 1800, 600, 0.5, 0.05, 0.01, 0.1));
      keep(tone(dest, t, "sawtooth", 905, 302, 0.5, 0.04, 0.01, 0.1));
      keep(burst(dest, t, { buf: whiteBuf, type: "bandpass", q: 2, f0: 5000, attack: 0.002, peak: 0.06, tc: 0.3 }));
    });
  }
  function robotBeep(i = 0) {
    if (!ready() || !gate("robotBeep", 0.05)) return;
    const dest = wOut(rnd(-0.3, 0.3), 0.08);
    one(dest, (t, keep) => { const f = [1320, 1760, 990, 2093][(i | 0) & 3]; keep(tone(dest, t, "square", f, f, 0.08, 0.07, 0.003, 0.01)); keep(tone(dest, t + 0.1, "square", f * 1.5, f * 1.5, 0.06, 0.055, 0.003, 0.01)); });
  }
  function rocketBurst() {
    if (!ready() || !gate("rocketBurst", 0.15)) return;
    const dest = wOut(rnd(-0.2, 0.2), 0.3);
    one(dest, (t, keep) => {
      keep(burst(dest, t, { buf: pinkBuf, type: "lowpass", f0: 600, f1: 3000, sweep: 0.3, attack: 0.02, peak: 0.3, tc: 0.35 }));
      keep(rumble(dest, t, 0.9, 500, 0.25, 5, 0.9));
      keep(tone(dest, t, "sawtooth", 120, 260, 0.8, 0.05, 0.05, 0.2));
    });
  }

  // ---- the house -------------------------------------------------------------------
  function hammer(material = "wood") {
    if (!ready() || !gate("hammer", 0.06)) return;
    const dest = wOut(rnd(-0.2, 0.2), 0.15);
    const stone = material === "stone";
    one(dest, (t, keep) => {
      keep(thump(dest, t, stone ? 240 : 170, stone ? 120 : 80, 0.05, 0.001, 0.4, stone ? 0.04 : 0.07, "triangle"));
      keep(burst(dest, t, { buf: whiteBuf, type: "bandpass", q: stone ? 3 : 1.5, f0: stone ? 3200 : 1400, attack: 0.001, peak: 0.25, tc: stone ? 0.03 : 0.05 }));
      if (stone) keep(bell(dest, t, 1900, 0.03, 0.15));
    });
  }
  function sawWood() {
    if (!ready() || !gate("saw", 0.4)) return;
    const dest = wOut(rnd(-0.2, 0.2), 0.1);
    one(dest, (t, keep) => {
      for (let i = 0; i < 4; i++) {
        const tt = t + i * 0.26, push = (i & 1) === 0; // push strokes bite harder and lower than pull strokes
        keep(whoosh(dest, tt, push ? 1300 : 1700, push ? 3000 : 3800, 2200, 0.1, 0.12, push ? 0.3 : 0.22, 3, whiteBuf));
        keep(rattle(dest, tt + 0.02, 0.18, push ? 2400 : 3000, 2.5, 0.07, 0.7)); // the teeth catching
      }
      keep(burst(dest, t + 1.05, { buf: pinkBuf, type: "bandpass", q: 1, f0: 900, attack: 0.003, peak: 0.12, tc: 0.05 })); // sawdust patters down
    });
  }
  function placeLog() {
    if (!ready() || !gate("placeLog", 0.1)) return;
    const dest = wOut(rnd(-0.2, 0.2), 0.2);
    one(dest, (t, keep) => {
      keep(thump(dest, t, 120, 55, 0.12, 0.003, 0.5, 0.12));
      keep(thump(dest, t + 0.09, 140, 70, 0.08, 0.003, 0.2, 0.08));
      keep(burst(dest, t, { buf: pinkBuf, type: "bandpass", q: 1.2, f0: 700, attack: 0.002, peak: 0.15, tc: 0.06 }));
    });
  }
  function placeStone() {
    if (!ready() || !gate("placeStone", 0.1)) return;
    const dest = wOut(rnd(-0.2, 0.2), 0.2);
    one(dest, (t, keep) => {
      keep(thump(dest, t, 150, 70, 0.08, 0.002, 0.45, 0.07));
      keep(rattle(dest, t + 0.02, 0.25, 2600, 1.5, 0.1, 0.4));
    });
  }
  function thatchRustle() {
    if (!ready() || !gate("thatch", 0.1)) return;
    const dest = wOut(rnd(-0.2, 0.2), 0.12);
    one(dest, (t, keep) => { keep(fabricRustle(dest, t, 0.5, 2800, 0.8, 0.12, 5)); keep(fabricRustle(dest, t + 0.1, 0.4, 1500, 0.8, 0.08, 3)); });
  }
  function snoreWho(who) {
    if (!ready() || !gate("snore_" + who, 1.2)) return;
    const dest = wOut(rnd(-0.3, 0.3), 0.15, 0.8);
    const k = who === "pip" ? 1.5 : who === "baby" ? 2.2 : who === "burra" ? 0.75 : 1;
    one(dest, (t, keep) => {
      keep(rumble(dest, t, 1.1, 300 * k, 0.12, 3, 0.6 * k));
      keep(vox(dest, t + 0.2, 90 * k, 70 * k, 0.8, 0.05, [500, 1100], 30, 0.2));
      keep(whoosh(dest, t + 1.3, 1200 * k, 2200 * k, 900 * k, 0.4, 0.5, 0.04, 1, whiteBuf)); // the breath out, a little whistle
    });
  }
  function buildBirds(L, t) {
    loopOut(L, wBus, wVerb, 0.35);
    every(L, 700, (now) => {
      if (Math.random() < 0.55) {
        const tt = now + rnd(0, 0.5), f = rnd(2400, 3600), n = 2 + ((Math.random() * 4) | 0);
        for (let i = 0; i < n; i++) chirp(L.gain, tt + i * rnd(0.08, 0.14), f * rnd(0.9, 1.15), f * rnd(0.7, 1.3), rnd(0.05, 0.1), rnd(0.02, 0.04));
      }
    });
  }
  function morningBirds(level) { setLoop("morningBirds", level, buildBirds, 1.5); return bedHandle("morningBirds"); }
  function clockTick() {
    if (!ready() || !gate("clockTick", 0.2)) return;
    const dest = wOut(0, 0.3);
    one(dest, (t, keep) => { keep(burst(dest, t, { buf: whiteBuf, type: "bandpass", q: 4, f0: 3200, attack: 0.0005, peak: 0.5, tc: 0.012 })); keep(thump(dest, t, 900, 700, 0.015, 0.0005, 0.3, 0.014, "triangle")); keep(knock(dest, t + 0.003, 420, 0.12, 0.02)); /* a wooden case under the tick */ });
  }

  return {
    resume,
    setListenerMuted,
    cushionStep,
    cushionLand,
    jump,
    sting,
    stingHit,
    zapCharge,
    zapFire,
    zapHit,
    dummyHit,
    humanHit,
    humanSwing,
    playerHurt,
    wizardBlip,
    wizardAppear,
    uiClick,
    introBoom,
    introRise,
    objective,
    victory,
    startAmbience,
    stopAmbience,
    // extensions (levels 2-5)
    stopAll: stopAll2, titleCard, levelUnlock,
    step, zooAmbience, waterfall, splash, diveIn, surface, underwater, ballBounce, doorOpen,
    friendChirp, eat, yawn, nuzzle, snore,
    coin, payout, questDone, friendship, trickWhoosh, trickLand, comboUp,
    crowd, crowdBed, panic,
    showMusic, preShow, afterShow,
    lullaby, alarm, glassShatter, heartDrop, sadTheme, wizardMotif, lavaRumble, chainCreak, timerTick,
    tailSlap, tailSlapHit, pickup, drop, throwWhoosh, cushionHit, posterFall, eyeOpen, sensePulse,
    // extensions 2 (levels 6-11, LEVELS2.md B2)
    checkpoint, denied, armyUp, armyDown, gearOn, visorOn,
    gunshot, bulletWhiz, ricochet, bulletHit, emptyClick, aimWarn, shotDown,
    guardVoice, punch, bodyFall, siren, searchlightHum, explosion,
    heli, wind, gust, crash, metalScrape, warnBeep, rotorWash,
    circusAmbience, calliope, canvasFlap, cageRattle, latchBreak, bell: strikerBell, generator, bottles,
    jungleAmbience, jungleLayers, river, rain, thunder, birdsFlush, mysteryCall, vines, logCreak,
    tribeChatter, tribeChirp, tribeCheer, warCry, tribeDrums, fire, craft, eatFruit, materialPickup,
    cauldron, ingredient, stir, brewDone, brewFail, potionPickup, potionThrow, potionSmash, transform, livingPotion,
    screamCharge, scream, screamFizzle,
    dreamAmbience, dissolve, farVoice, pillarShatter,
    bossRoar, bossStep, bossWindup, bossSwipe, bossSlam, bossCharge, bossHitWall, bossHurt, bossPhase, kingFall, crownClatter,
    paperRustle, paperUnfold, armorClank, leverPull, gateOpen, fenceRattle, truckEngine,
    muffle,
    // extensions 3 (levels 12-13, LEVELS3.md B2)
    setEar, lavaBubble, lavaAmbience, eruption, steamVent, rockCrack, rockGrind, magmorRoar, magmorStep, spellChime, dreamWake,
    windGust, windWhoosh, flightRush, campFire, eatCrunch, splashSmall, firefly, owl, cricketNight, forestNight,
    wolfHowl, wolfGrowl, wolfBark, wolfYelp, pawRun, stoneTurn, runeHum, portalHum, portalOpen, portalKnock,
    babyChirp, babyCry, robotServo, robotLaser, robotBeep, rocketBurst, hammer, sawWood, placeLog, placeStone, thatchRustle,
    morningBirds, clockTick,
    // the hook for src/music.js (LEVELS2.md B1): a gain that feeds the master compressor -> limiter -> soft clip -> mute chain
    // directly (NOT through the heartDrop duck), plus the reverb send and the noise buffers. null until resume() has built the graph.
    musicBus() {
      if (!ctx || !bus) return null;
      if (!musicBusNode) { musicBusNode = ctx.createGain(); musicBusNode.gain.value = 1; musicBusNode.connect(storyBus); }
      return { ctx, input: musicBusNode, verb: storyVerb, room: verbIn, white: whiteBuf, pink: pinkBuf, duck };
    },
    get context() { return ctx; },
  };
}
