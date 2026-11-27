// AUDIO - music.js: step sequencer track players, persistent layers, the music manager (base track + override
// stack + crossfades), stings with ducking, and an OfflineAudioContext renderer used by tools/audiocheck.cjs.
// Scheduling is lookahead based (the caller ticks every ~25 ms and asks for `now + lookahead`); a player never
// "bursts" missed steps after a main-thread stall, it skips ahead instead.
import { TRACKS, STINGS } from "./tracks.js";
import { INSTRUMENTS, MELODIC, warmJobs } from "./instruments.js";
import { SFX, LOOPS, genericLoop } from "./sfx.js";
import { gain, filter, osc, src, noiseBuffer, mtof, rng, rand, panner } from "./synth.js";
import { createGraph } from "./graph.js";

function hashId(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const warned = new Set();
function warnOnce(key, e) { if (warned.has(key)) return; warned.add(key); try { console.warn("[audio]", key, e || ""); } catch (x) { /* ignore */ } }

// ---------------------------------------------------------------- note playing (shared by tracks and stings)
function makePlay(m) {
  return function play(inst, t, p) {
    const fn = INSTRUMENTS[inst];
    if (!fn) { warnOnce("no instrument " + inst); return 0; }
    try {
      if (m.ng) {
        if (p.lead && m.rand() < 0.1) return 0; // NG+: melodies sometimes skip a note
        if (p.n !== undefined) p.n -= 1;          // transposed down a minor 2nd
        if (p.notes) p.notes = p.notes.map((x) => x - 1);
        const end = fn(m, t, p);
        if (p.lead && MELODIC.has(inst)) fn(m, t, Object.assign({}, p, { v: (p.v ?? 0.5) * 0.35, detune: (p.detune || 0) + 28, pan: -(p.pan || 0.3) }));
        return end;
      }
      return fn(m, t, p);
    } catch (e) { warnOnce("instrument " + inst, e); return 0; }
  };
}
function makeSfx(m) {
  return function sfx(id, t, p = {}) {
    const fn = SFX[id];
    if (!fn) { warnOnce("no sfx " + id); return 0; }
    try {
      const g = gain(m.ac, p.vol ?? 1);
      g.connect(p.pan ? panner(m.ac, p.pan, m.dry) : m.dry);
      return fn(m.ac, g, t, { rate: p.rate || 1 });
    } catch (e) { warnOnce("sfx " + id, e); return 0; }
  };
}

// ---------------------------------------------------------------- persistent layers
function lfoTo(ac, t, rate, depth, param, list) { const lg = gain(ac, depth, param); list.push(osc(ac, "sine", rate, t, t + 36000, lg)); }
function makeLayer(m, t, kind, p) {
  const ac = m.ac, list = [];
  const out = gain(ac, 0, m.dry);
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(p.v ?? 0.3, t + (p.a ?? 2.5));
  const ws = gain(ac, p.wet ?? 0.25, m.wet);
  out.connect(ws);
  let sub = null;
  const noiseBed = (kind2, type, f, q, g0, into) => {
    const g = gain(ac, g0, into || out);
    const fl = filter(ac, type, f, q, g);
    list.push(src(ac, noiseBuffer(ac, kind2), t, fl, { loop: true, offset: rand(0, 2.5) }));
    return { g, fl };
  };
  if (kind === "sub") {
    (p.notes || [26]).forEach((n, i) => list.push(osc(ac, "sine", mtof(n), t, t + 36000, gain(ac, 0.5 / (i + 1), out))));
    lfoTo(ac, t, 0.08, (p.v ?? 0.3) * 0.25, out.gain, list);
  } else if (kind === "wind") {
    const b = noiseBed("pink", "bandpass", p.f ?? 450, p.q ?? 0.7, 1);
    lfoTo(ac, t, p.rate ?? 0.07, (p.f ?? 450) * 0.5, b.fl.frequency, list);
    lfoTo(ac, t, (p.rate ?? 0.07) * 1.6, 0.35, b.g.gain, list);
  } else if (kind === "trees") {
    const a = noiseBed("pink", "bandpass", 650, 0.6, 0.8);
    lfoTo(ac, t, 0.06, 300, a.fl.frequency, list);
    lfoTo(ac, t, 0.09, 0.3, a.g.gain, list);
    const b = noiseBed("white", "highpass", 2800, 0.5, 0.18);
    lfoTo(ac, t, 0.13, 0.12, b.g.gain, list);
  } else if (kind === "rain") {
    sub = LOOPS.rain(ac, out, t);
  } else if (kind === "drone") {
    const f = mtof(p.n ?? 26);
    const lp = filter(ac, "lowpass", p.cut ?? 500, 0.7, out);
    const c = osc(ac, "sine", f, t, t + 36000, lp);
    list.push(c);
    const mg = gain(ac, f * 1.1, c.frequency);
    list.push(osc(ac, "sine", f * (p.ratio ?? 2.005), t, t + 36000, mg));
    lfoTo(ac, t, 0.07, f * 0.9, mg.gain, list);
    list.push(osc(ac, "triangle", f / 2, t, t + 36000, gain(ac, 0.5, lp)));
  }
  return {
    tick: sub ? sub.tick : null,
    stop(tt, fade) {
      try {
        out.gain.cancelScheduledValues(tt);
        out.gain.setValueAtTime(out.gain.value, tt);
        out.gain.linearRampToValueAtTime(0, tt + fade);
        for (const s of list) { try { s.stop(tt + fade + 0.05); } catch (e) { /* stopped */ } }
        if (sub) sub.stop(tt, fade);
      } catch (e) { warnOnce("layer stop", e); }
    },
  };
}

// ---------------------------------------------------------------- track player
export function createPlayer(ac, def, out, wetOut, opts = {}) {
  const fade = gain(ac, 0, out), stut = gain(ac, 1, fade), dry = gain(ac, def.gain ?? 1, stut);
  const wfade = gain(ac, 0, wetOut), wstut = gain(ac, 1, wfade), wet = gain(ac, def.gain ?? 1, wstut);
  const layers = [], timers = [];
  const m = {
    ac, dry, wet, def, ng: !!def.ng, loop: 0, intensity: 0, explicitIntensity: 0, tempoMul: 1, flat: 0, state: {},
    halfUntil: 0, startT: 0,
    rand: rng(hashId(def.id) ^ (opts.seed || 0)),
    layer(kind, p = {}) { layers.push(makeLayer(m, m.startT, kind, p)); },
    lyric(text, t) {
      if (!opts.onLyric) return;
      const ms = Math.max(0, (t - ac.currentTime) * 1000);
      timers.push(setTimeout(() => { try { opts.onLyric(text); } catch (e) { /* ignore */ } }, ms));
    },
    stutter(t, d, rate = 16) {
      const n = Math.max(2, Math.floor(d * rate));
      for (const g of [stut, wstut]) {
        for (let i = 0; i < n; i++) g.gain.setValueAtTime(i % 2 ? 0.05 : 1, t + (i * d) / n);
        g.gain.setValueAtTime(1, t + d);
      }
    },
    cut(t, d) { for (const g of [stut, wstut]) { g.gain.setValueAtTime(1, t); g.gain.linearRampToValueAtTime(0, t + 0.03); g.gain.setValueAtTime(0, t + d - 0.05); g.gain.linearRampToValueAtTime(1, t + d); } },
  };
  m.play = makePlay(m);
  m.sfx = makeSfx(m);
  const spb = def.spb || 4, spbar = def.stepsPerBar || 16, bars = def.bars || 1;
  let i = 0, next = 0, stopped = false, stopAt = Infinity;
  const sd = () => 60 / (def.bpm * m.tempoMul * (m.ng ? 0.92 : 1) * (next < m.halfUntil ? 0.5 : 1)) / spb;
  const player = {
    m, id: def.id,
    get stopAt() { return stopAt; },
    get stopped() { return stopped; },
    start(t0, fadeIn = 2) {
      m.startT = t0;
      for (const g of [fade, wfade]) { g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1, t0 + Math.max(0.02, fadeIn)); }
      try { if (def.setup) def.setup(m, t0); } catch (e) { warnOnce("setup " + def.id, e); }
      let lead = 0;
      try { if (def.intro) lead = def.intro(m, t0) || 0; } catch (e) { warnOnce("intro " + def.id, e); }
      next = t0 + lead;
    },
    schedule(until, now) {
      if (stopped && next > stopAt) return;
      if (now !== undefined && next < now - 0.06) { let guard = 0; while (next < now && guard++ < 4096) { next += sd(); i++; } }
      const lim = Math.min(until, stopAt);
      let guard = 0;
      while (next < lim && guard++ < 512) {
        const s = i % spbar, bar = Math.floor(i / spbar) % bars;
        if (s === 0 && bar === 0) m.loop = Math.floor(i / (spbar * bars));
        m.intensity = Math.max(m.explicitIntensity, def.autoIntensity ? Math.min(3, Math.floor((next - m.startT) / def.autoIntensity)) : 0);
        const d = sd();
        if (m.ng && s === 0 && bar % 4 === 0 && m.rand() < 0.6) m.play("revSwell", next, { n: (def.root || 50) + 13, d: d * spbar, v: 0.35 });
        try { def.step(m, bar, s, next, d); } catch (e) { warnOnce("step " + def.id, e); }
        i++;
        next += d;
      }
      for (const L of layers) if (L.tick) L.tick(now ?? 0, until);
    },
    stop(t, fadeOut = 2) {
      if (stopped) return stopAt;
      stopped = true;
      stopAt = t + fadeOut;
      for (const g of [fade, wfade]) {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + Math.max(0.02, fadeOut));
      }
      for (const L of layers) L.stop(t, fadeOut);
      for (const tm of timers) clearTimeout(tm);
      timers.length = 0;
      return stopAt;
    },
    dispose() { try { fade.disconnect(); wfade.disconnect(); } catch (e) { /* ignore */ } },
    halfTime(now, sec) { m.halfUntil = now + sec; },
  };
  return player;
}

// a light context for stings (no stepping)
function stingCtx(ac, dryOut, wetOut) {
  const dry = gain(ac, 1, dryOut), wet = gain(ac, 1, wetOut);
  const m = { ac, dry, wet, ng: false, rand: Math.random, state: {} };
  m.play = makePlay(m);
  m.sfx = makeSfx(m);
  return m;
}

// ---------------------------------------------------------------- music manager
export function createMusic({ onLyric } = {}) {
  let ac = null, G = null;
  let base = null;
  const stack = [];
  let cur = null;           // { id, player }
  const fading = [];
  let warmQ = [];
  let duckUntil = 0;
  const lastSting = { id: "", t: -1 };
  let secretWait = 0;

  function effective() { return stack.length ? stack[stack.length - 1].id : base; }
  function apply(fade = 2) {
    if (!ac) return;
    const id = effective();
    const want = id && TRACKS[id] ? id : null;
    if (cur && cur.id === want) return;
    const now = ac.currentTime;
    if (cur) { cur.player.stop(now, Math.max(0.05, fade)); fading.push(cur.player); cur = null; }
    if (want) {
      const def = TRACKS[want];
      const p = createPlayer(ac, def, G.duck, G.duckW, { onLyric });
      p.start(now + 0.06, Math.max(0.05, fade));
      cur = { id: want, player: p };
      if (def.warm) warmQ = warmQ.concat(warmJobs(ac, def.warm));
      if (def.base && TRACKS[def.base] && TRACKS[def.base].warm) warmQ = warmQ.concat(warmJobs(ac, TRACKS[def.base].warm));
    }
  }
  function ramp(param, to, t, dur) { param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); param.linearRampToValueAtTime(to, t + dur); }
  function duck(amount, dur) {
    if (!ac) return;
    const now = ac.currentTime, lvl = Math.max(0, 1 - amount);
    duckUntil = Math.max(duckUntil, now + dur);
    for (const g of [G.duck, G.duckW]) {
      ramp(g.gain, lvl, now, 0.08);
      g.gain.setValueAtTime(lvl, duckUntil);
      g.gain.linearRampToValueAtTime(1, duckUntil + 1.2);
    }
  }
  return {
    attach(a, g) { ac = a; G = g; apply(1.5); },
    get id() { return cur ? cur.id : null; },
    get base() { return base; },
    effective,
    setBase(id, fade = 2) { base = id || null; apply(fade); },
    push(tag, id, fade = 1.5) {
      for (let k = stack.length - 1; k >= 0; k--) if (stack[k].tag === tag) stack.splice(k, 1);
      stack.push({ tag, id });
      apply(fade);
    },
    pop(tag, fade = 2) {
      let hit = false;
      for (let k = stack.length - 1; k >= 0; k--) if (stack[k].tag === tag) { stack.splice(k, 1); hit = true; break; }
      if (hit) apply(fade);
    },
    clearStack(fade = 1.5) { if (stack.length) { stack.length = 0; apply(fade); } },
    setIntensity(x) { if (cur) cur.player.m.explicitIntensity = Math.max(0, Math.min(3, x | 0)); },
    cue(name, sec = 1) {
      if (!ac || !cur) return;
      const now = ac.currentTime;
      if (name === "halfTime") cur.player.halfTime(now, sec);
      else if (name === "silence") cur.player.m.cut(now + 0.01, Math.max(0.1, sec));
      else if (name === "stutter") cur.player.m.stutter(now + 0.01, Math.max(0.1, sec), 24);
    },
    duck,
    sting(id) {
      const S = STINGS[id];
      if (!ac || !S) { if (!S) warnOnce("no sting " + id); return false; }
      const now = ac.currentTime;
      // two stings in one moment: the first wins - except ending stings (they always play) and the secret chime,
      // which waits until the guard has passed instead of being swallowed
      if (now - lastSting.t < 0.5 && !(id.length > 4 && id.slice(0, 4) === "end_")) {
        if (id === "secret" && !secretWait) {
          secretWait = setTimeout(() => { secretWait = 0; try { this.sting("secret"); } catch (e) { /* ignore */ } }, (0.55 - (now - lastSting.t)) * 1000 + 20);
          return true;
        }
        return false;
      }
      lastSting.id = id; lastSting.t = now;
      try {
        const m = stingCtx(ac, G.stingIn, G.stingWet);
        const end = S.fn(m, now + 0.04);
        duck(S.duck ?? 0.6, Math.max(0.5, end - now));
        setTimeout(() => { try { m.dry.disconnect(); m.wet.disconnect(); } catch (e) { /* ignore */ } }, (end - now + 8) * 1000);
      } catch (e) { warnOnce("sting " + id, e); }
      return true;
    },
    tick(lookahead) {
      if (!ac) return;
      const now = ac.currentTime;
      if (cur) cur.player.schedule(now + lookahead, now);
      for (let k = fading.length - 1; k >= 0; k--) {
        const p = fading[k];
        if (now > p.stopAt + 0.25) { p.dispose(); fading.splice(k, 1); }
        else p.schedule(now + lookahead, now);
      }
      // pre-render instrument buffers for the current track, a few ms per tick
      if (warmQ.length) {
        const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
        while (warmQ.length) {
          const job = warmQ.shift();
          try { job(); } catch (e) { warnOnce("warm", e); }
          if ((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0 > 6) break;
        }
      }
    },
  };
}

// ---------------------------------------------------------------- offline render (tests / tools)
// kind: "track" | "sting" | "sfx" | "loop". Returns the rendered AudioBuffer.
export async function renderOffline({ kind = "track", id, seconds = 20, sampleRate = 44100, raw = false, intensity = 0, seed = 0 } = {}) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const off = new OAC(2, Math.ceil(seconds * sampleRate), sampleRate);
  const G = createGraph(off, { limiter: !raw });
  if (kind === "track") {
    const def = TRACKS[id];
    if (!def) throw new Error("no track " + id);
    const p = createPlayer(off, def, G.duck, G.duckW, { seed });
    p.m.explicitIntensity = intensity;
    p.start(0.02, 0.05);
    // schedule incrementally like the live scheduler (keeps the graph small; render time ~ realtime CPU cost)
    p.schedule(0.6, 0);
    if (off.suspend) {
      for (let k = 0.5; k < seconds; k += 0.5) {
        const at = k;
        off.suspend(at).then(() => { p.schedule(Math.min(seconds, at + 0.6), at); off.resume(); });
      }
    } else p.schedule(seconds, 0);
  } else if (kind === "sting") {
    const m = stingCtx(off, G.stingIn, G.stingWet);
    STINGS[id].fn(m, 0.05);
  } else if (kind === "sfx") {
    const g = gain(off, 1, G.sfxIn);
    SFX[id](off, g, 0.05, { rate: 1 });
  } else if (kind === "loop") {
    const L = (LOOPS[id] || genericLoop(id))(off, G.sfxIn, 0.05);
    if (L.tick) L.tick(0, seconds);
  }
  return off.startRendering();
}
