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

    bus.connect(comp);
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
    get context() { return ctx; },
  };
}
