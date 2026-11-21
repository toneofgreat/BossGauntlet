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
        keep(thump(dest, t, rnd(170, 200), 96, 0.04, 0.004, 0.26 * v, 0.024));
        keep(burst(dest, t, {
          buf: pinkBuf, type: "bandpass", q: 1.1, f0: rnd(1500, 2100), f1: 900, sweep: 0.03,
          attack: 0.003, peak: 0.3 * v, tc: 0.014,
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
    stopAll, titleCard, levelUnlock,
    step, zooAmbience, waterfall, splash, diveIn, surface, underwater, ballBounce, doorOpen,
    friendChirp, eat, yawn, nuzzle, snore,
    coin, payout, questDone, friendship, trickWhoosh, trickLand, comboUp,
    crowd, crowdBed, panic,
    showMusic, preShow, afterShow,
    lullaby, alarm, glassShatter, heartDrop, sadTheme, wizardMotif, lavaRumble, chainCreak, timerTick,
    tailSlap, tailSlapHit, pickup, drop, throwWhoosh, cushionHit, posterFall, eyeOpen, sensePulse,
    get context() { return ctx; },
  };
}
