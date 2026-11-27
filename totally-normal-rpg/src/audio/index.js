// AUDIO - index.js: ctx.audio (CONTRACT 11). One AudioContext, created on the first gesture (audio.unlock()).
// Everything is synthesized (see synth/instruments/voice/sfx/tracks). Calls made before unlock are remembered
// (music state, loops, songs) and start as soon as the context runs; one-shot sfx before unlock are dropped.
import { createGraph } from "./graph.js";
import { createMusic, createPlayer, renderOffline } from "./music.js";
import { SFX, LOOPS, genericLoop, SFX_IDS, UI_IDS } from "./sfx.js";
import { speak } from "./voice.js";
import { TRACKS, TRACK_IDS, STING_IDS } from "./tracks.js";
import { clamp, rand } from "./synth.js";

export { renderOffline };

const MAX_VOICES = 24;
const VOICE_IDS = new Set(["hurt", "player_death", "grunt", "villager_shout", "king_laugh", "king_whisper", "rookie_oof", "sob", "meow", "void_hum"]);
const STEP_OF = {
  grass: "step_grass", dirt: "step_dirt", wood: "step_wood", stone: "step_stone", rock: "step_stone", cobble: "step_stone",
  sand: "step_sand", forest: "step_forest", water: "step_puddle", puddle: "step_puddle", metal: "step_metal",
  obsidian: "step_stone", hay: "step_grass", plank: "step_wood", snow: "step_sand",
};
// reverb send per zone (sfx bus)
const ZONE_WET = { throne: 0.38, kingDark: 0.32, castle: 0.22, forestHouse: 0.12, rookieShack: 0.2, waterfall: 0.25, collapse: 0.3, finalArena: 0.35, desert: 0.05, hollowDesert: 0.08 };
// ambience beds per zone (extra to contract: AUDIO plays these quietly, non-positional)
const AMB = {
  lobby: [["birds", 0.5], ["wind", 0.22]], graves: [["birds", 0.4], ["wind", 0.25]], path1: [["birds", 0.5], ["wind", 0.2]],
  voidEdge: [["wind", 0.5]], bridge: [["birds", 0.35], ["wind", 0.18], ["river", 0.22]], waterfall: [["birds", 0.25], ["wind", 0.15]],
  ratField: [["birds", 0.5], ["wind", 0.22]], ratKing: [["birds", 0.3], ["wind", 0.2]], gate2: [["birds", 0.4], ["wind", 0.2]],
  village: [["birds", 0.3], ["wind", 0.18], ["chickens", 0.35], ["dog", 0.22]], barn: [["wind", 0.25], ["chickens", 0.2]],
  guardPost: [["birds", 0.25], ["wind", 0.25]], gate3: [["wind", 0.3], ["birds", 0.2], ["crickets", 0.22]], castle: [["wind", 0.35], ["birds", 0.12], ["crickets", 0.16]],
};
const curve = (v) => Math.pow(clamp(+v || 0, 0, 1), 1.6);

export async function init(ctx) {
  const bus = ctx.bus, state = ctx.state;
  let ac = null, G = null, timer = 0, lastTick = 0, lookahead = 0.1;
  let paused = false, sfxWet = 0.12, unlocking = false;
  const vols = { master: state.settings.master, music: state.settings.music, sfx: state.settings.sfx };
  const voices = [];
  const loops = [];             // { id, vol, pos, pn, g, L, stopped }  (arrays: no iterator allocation per frame)
  const songs = [];             // { id, pos, pn, lp, player, stopped }
  const removeFrom = (arr, x) => { const k = arr.indexOf(x); if (k >= 0) arr.splice(k, 1); };
  let ambience = [];            // [{ id, handle }]
  let ambienceOverride = null;
  let heartExplicit = 0, heartLow = 0, nextHeart = 0;
  let zoneTimer = 0, lastLevelSfx = 0, last4Hz = 0;
  const warn = (k, e) => { try { console.warn("[audio]", k, e || ""); } catch (x) { /* ignore */ } };

  const music = createMusic({ onLyric: (text) => bus.emit("audio:lyric", { text }) });

  // ------------------------------------------------------------ context + unlock
  function unlock() {
    try {
      if (!ac) {
        const AC = (typeof window !== "undefined") && (window.AudioContext || window.webkitAudioContext);
        if (!AC) return;
        try { ac = new AC({ latencyHint: "interactive" }); } catch (e) { ac = new AC(); }
        let lite = false;
        try {
          const q = ctx.engine && ctx.engine.quality ? ctx.engine.quality.level : 2;
          const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
          lite = q === 0 || (coarse && q <= 1);
        } catch (e) { /* ignore */ }
        G = createGraph(ac, { lite });
        applyVolumes(0);
        // iOS: play one silent buffer inside the gesture
        try { const b = ac.createBuffer(1, 1, ac.sampleRate); const s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0); } catch (e) { /* ignore */ }
        music.attach(ac, G);
        for (const r of loops) if (!r.stopped && !r.L) startLoop(r);
        for (const s of songs) if (!s.stopped && !s.player) startSong(s);
        timer = setInterval(tick, 25);
      }
      if (ac.state !== "running" && !unlocking && !(typeof document !== "undefined" && document.hidden)) {
        unlocking = true;
        const pr = ac.resume();
        if (pr && pr.then) pr.then(() => { unlocking = false; }, () => { unlocking = false; }); else unlocking = false;
      }
    } catch (e) { warn("unlock", e); }
  }
  const gesture = () => unlock();
  if (typeof window !== "undefined") {
    for (const ev of ["pointerdown", "keydown", "touchend", "mousedown"]) window.addEventListener(ev, gesture, { capture: true, passive: true });
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (!ac) return;
      try { if (document.hidden) ac.suspend(); else ac.resume(); } catch (e) { /* ignore */ }
    });
  }

  // ------------------------------------------------------------ volumes / duck / muffle
  function applyVolumes(tc = 0.05) {
    if (!G) return;
    const now = ac.currentTime;
    const set = (param, v) => { if (tc) param.setTargetAtTime(v, now, tc); else param.value = v; };
    set(G.master.gain, curve(vols.master) * 0.95);
    set(G.musicVol.gain, curve(vols.music) * 0.62 * (paused ? 0.45 : 1));
    set(G.sfxVol.gain, curve(vols.sfx) * 0.95);
    set(G.uiVol.gain, curve(vols.sfx) * 0.6);
  }
  function setVolumes(v = {}) {
    if (v.master !== undefined) vols.master = v.master; else vols.master = state.settings.master;
    if (v.music !== undefined) vols.music = v.music; else vols.music = state.settings.music;
    if (v.sfx !== undefined) vols.sfx = v.sfx; else vols.sfx = state.settings.sfx;
    applyVolumes();
  }
  function muffle(on, dur = 0.3) {
    if (!G) return;
    const now = ac.currentTime, p = G.muffle.frequency;
    p.cancelScheduledValues(now);
    p.setValueAtTime(Math.max(40, p.value), now);
    p.exponentialRampToValueAtTime(on ? 620 : 20000, now + Math.max(0.02, dur));
  }

  // ------------------------------------------------------------ 3D helpers
  function setPos(pn, pos) {
    if (!pn || !pos) return;
    if (pn.positionX) { pn.positionX.value = pos.x || 0; pn.positionY.value = pos.y || 0; pn.positionZ.value = pos.z || 0; }
    else if (pn.setPosition) pn.setPosition(pos.x || 0, pos.y || 0, pos.z || 0);
  }
  function makePanner(pos, ref = 3, roll = 1.1) {
    const pn = ac.createPanner();
    pn.panningModel = "equalpower";
    pn.distanceModel = "inverse";
    pn.refDistance = ref;
    pn.maxDistance = 500;
    pn.rolloffFactor = roll;
    setPos(pn, pos);
    return pn;
  }
  const LPOS = { x: 0, y: 0, z: 0 };
  function updateListener() {
    const cam = ctx.camera;
    if (!ac || !cam || !cam.matrixWorld) return;
    const e = cam.matrixWorld.elements, L = ac.listener;
    const px = e[12], py = e[13], pz = e[14], fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
    LPOS.x = px; LPOS.y = py; LPOS.z = pz;
    if (L.positionX) {
      L.positionX.value = px; L.positionY.value = py; L.positionZ.value = pz;
      L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz;
      L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz;
    } else if (L.setPosition) { L.setPosition(px, py, pz); L.setOrientation(fx, fy, fz, ux, uy, uz); }
  }
  const dist2 = (p) => { const dx = (p.x || 0) - LPOS.x, dy = (p.y || 0) - LPOS.y, dz = (p.z || 0) - LPOS.z; return dx * dx + dy * dy + dz * dz; };

  // ------------------------------------------------------------ sfx voices
  function purge(now) {
    for (let k = voices.length - 1; k >= 0; k--) if (voices[k].end < now) voices.splice(k, 1);
  }
  function kill(v, now) {
    try { v.g.gain.cancelScheduledValues(now); v.g.gain.setValueAtTime(v.g.gain.value, now); v.g.gain.linearRampToValueAtTime(0, now + 0.03); } catch (e) { /* ignore */ }
    setTimeout(() => { try { v.g.disconnect(); } catch (e) { /* ignore */ } }, 80);
    v.end = 0;
  }
  function steal(now) {
    let vi = -1;
    for (let k = 0; k < voices.length; k++) {
      const v = voices[k];
      if (vi < 0 || v.vol < voices[vi].vol - 0.05 || (Math.abs(v.vol - voices[vi].vol) <= 0.05 && v.start < voices[vi].start)) vi = k;
    }
    if (vi >= 0) { kill(voices[vi], now); voices.splice(vi, 1); }
  }
  function sfx(id, o = {}) {
    if (!ac || ac.state === "closed") return null;
    const fn = SFX[id];
    if (!fn) { warnUnknown(id); return null; }
    try {
      const now = ac.currentTime + 0.004;
      purge(now);
      while (voices.length >= MAX_VOICES) steal(now);
      let vol = o.vol ?? 1;
      if (id === "tinnitus" && state.settings.reduceFlashing) vol *= 0.55;
      if (id === "jumpscare") vol = Math.min(vol, 1) * 0.9;
      const g = ac.createGain();
      g.gain.value = vol;
      const isUi = UI_IDS.has(id);
      const dest = isUi ? G.uiIn : VOICE_IDS.has(id) ? G.voiceIn : G.sfxIn;
      let pn = null;
      if (o.pos) { pn = makePanner(o.pos); g.connect(pn); pn.connect(dest); } else g.connect(dest);
      if (!isUi && sfxWet > 0) { const s = ac.createGain(); s.gain.value = sfxWet; g.connect(s); s.connect(G.sfxRevIn); }
      let rate = o.rate ?? 1;
      if (o.detune) rate *= Math.pow(2, o.detune / 1200);
      const end = fn(ac, g, now, { rate });
      const v = { g, end: end + 0.1, vol, start: now };
      voices.push(v);
      if (id === "tinnitus") { muffle(true, 0.05); setTimeout(() => muffle(false, 1.6), 2600); }
      if (id === "jumpscare" && music.id === "final") music.cue("halfTime", 2.5);
      return {
        id,
        stop(fade = 0.05) { if (!ac) return; const t = ac.currentTime; try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + Math.max(0.01, fade)); } catch (e) { /* ignore */ } v.end = t + fade; },
        setVol(x) { if (ac) g.gain.setTargetAtTime(x, ac.currentTime, 0.05); },
        setPos(p) { setPos(pn, p); },
      };
    } catch (e) { warn("sfx " + id, e); return null; }
  }
  const unknown = new Set();
  function warnUnknown(id) { if (!unknown.has(id)) { unknown.add(id); warn("unknown sfx id " + id); } }

  // ------------------------------------------------------------ loops
  function startLoop(r) {
    try {
      const now = ac.currentTime + 0.02;
      r.g = ac.createGain();
      r.g.gain.value = r.vol;
      if (r.pos) { r.pn = makePanner(r.pos, 4, 1); r.g.connect(r.pn); r.pn.connect(G.sfxIn); } else r.g.connect(G.sfxIn);
      if (sfxWet > 0 && r.pos) { const s = ac.createGain(); s.gain.value = sfxWet * 0.7; r.g.connect(s); s.connect(G.sfxRevIn); }
      const mk = LOOPS[r.id] || (SFX[r.id] ? genericLoop(r.id) : null);
      if (!mk) { warnUnknown(r.id); r.stopped = true; return; }
      r.L = mk(ac, r.g, now);
    } catch (e) { warn("loop " + r.id, e); r.stopped = true; }
  }
  function loop(id, o = {}) {
    const r = { id, vol: o.vol ?? 1, pos: o.pos ? { x: o.pos.x, y: o.pos.y, z: o.pos.z } : null, pn: null, g: null, L: null, stopped: false };
    loops.push(r);
    if (ac) startLoop(r);
    return {
      stop(fade = 0.3) {
        if (r.stopped) return;
        r.stopped = true;
        removeFrom(loops, r);
        if (r.L && ac) {
          const t = ac.currentTime;
          try { r.L.stop(t, fade); } catch (e) { /* ignore */ }
          const g = r.g;
          setTimeout(() => { try { g.disconnect(); } catch (e) { /* ignore */ } }, (fade + 0.5) * 1000);
        }
      },
      setVol(v) { r.vol = v; if (r.g && ac) r.g.gain.setTargetAtTime(v, ac.currentTime, 0.1); },
      setPos(p) { if (!p) return; if (!r.pos) r.pos = { x: 0, y: 0, z: 0 }; r.pos.x = p.x; r.pos.y = p.y; r.pos.z = p.z; setPos(r.pn, p); },
    };
  }

  // ------------------------------------------------------------ the girl's song (3D, gets clearer when close)
  function startSong(s) {
    try {
      const now = ac.currentTime;
      s.lp = ac.createBiquadFilter(); s.lp.type = "lowpass"; s.lp.frequency.value = 3000;
      s.pn = makePanner(s.pos || LPOS, 5, 1.3);
      s.lp.connect(s.pn); s.pn.connect(G.voiceIn);
      s.player = createPlayer(ac, TRACKS[s.id], s.lp, G.sfxRevIn, { onLyric: (text) => { if (!s.stopped) bus.emit("audio:lyric", { text }); } });
      s.player.start(now + 0.1, 1.5);
    } catch (e) { warn("song", e); s.stopped = true; }
  }
  function song(id, o = {}) {
    if (!TRACKS[id]) { warn("unknown song " + id); return { stop() {}, setPos() {} }; }
    const s = { id, pos: o.pos ? { x: o.pos.x, y: o.pos.y, z: o.pos.z } : null, pn: null, lp: null, player: null, stopped: false };
    songs.push(s);
    if (ac) startSong(s);
    return {
      stop(fade = 1) {
        if (s.stopped) return;
        s.stopped = true;
        bus.emit("audio:lyric", { text: "" });
        if (s.player && ac) {
          const end = s.player.stop(ac.currentTime, fade);
          setTimeout(() => { removeFrom(songs, s); s.player.dispose(); }, (end - ac.currentTime + 0.5) * 1000);
        } else removeFrom(songs, s);
      },
      setPos(p) { if (!p) return; if (!s.pos) s.pos = { x: 0, y: 0, z: 0 }; s.pos.x = p.x; s.pos.y = p.y; s.pos.z = p.z; setPos(s.pn, p); },
    };
  }

  // ------------------------------------------------------------ voice
  function voice(text, o = {}) {
    if (!ac) return null;
    try {
      const now = ac.currentTime + 0.02;
      const g = ac.createGain();
      g.gain.value = o.vol ?? 1;
      let pn = null;
      if (o.pos) { pn = makePanner(o.pos, 4); g.connect(pn); pn.connect(G.voiceIn); } else g.connect(G.voiceIn);
      const send = ac.createGain();
      send.gain.value = o.kind === "hollow" ? 0.55 : sfxWet;
      g.connect(send); send.connect(G.sfxRevIn);
      return speak(ac, g, now, text, { kind: o.kind || "blip", pitch: o.pitch || 1 });
    } catch (e) { warn("voice", e); return null; }
  }

  // ------------------------------------------------------------ ambience beds
  function setAmbience(list) {
    const want = list || [];
    // stop the ones not wanted, keep the ones that persist (adjust volume)
    const keep = [];
    for (const a of ambience) {
      const w = want.find((x) => x[0] === a.id);
      if (w) { a.handle.setVol(w[1] * 0.5); keep.push(a); } else a.handle.stop(2);
    }
    for (const [id, v] of want) if (!keep.find((a) => a.id === id)) keep.push({ id, handle: loop(id, { vol: v * 0.5 }) });
    ambience = keep;
  }
  function zoneAmbience(zone) {
    if (ambienceOverride) return;
    if (!state.rt.playing) { setAmbience(null); return; }
    let list = AMB[zone] || null;
    if (list && state.run.cycle >= 1) list = list.filter((x) => x[0] !== "birds" && x[0] !== "chickens").map((x) => [x[0], x[1] * (x[0] === "wind" ? 1.3 : 1)]);
    setAmbience(list);
  }

  // ------------------------------------------------------------ scheduler tick (timer + every frame)
  function tick() {
    if (!ac || ac.state !== "running") return;
    try {
      const nowMs = (typeof performance !== "undefined" ? performance.now() : Date.now());
      const gap = lastTick ? nowMs - lastTick : 25;
      lastTick = nowMs;
      // main-thread stalls: widen the window so music does not drop out; relax back slowly
      if (gap > 60) lookahead = Math.min(0.6, Math.max(lookahead, (gap / 1000) * 1.5 + 0.1));
      else lookahead = Math.max(0.1, lookahead * 0.995);
      const now = ac.currentTime, until = now + lookahead;
      music.tick(lookahead);
      for (let k = 0; k < loops.length; k++) {
        const r = loops[k];
        if (!r.L || !r.L.tick) continue;
        if (r.pos && dist2(r.pos) > 150 * 150) continue;
        r.L.tick(now, until + 0.05);
      }
      for (let k = 0; k < songs.length; k++) if (songs[k].player) songs[k].player.schedule(until, now);
      // heartbeat layer (low HP / chase / explicit)
      const h = Math.max(heartExplicit, heartLow);
      if (h > 0.02) {
        if (nextHeart < now) nextHeart = now + 0.05;
        while (nextHeart < until) {
          const g = ac.createGain();
          g.gain.value = 0.25 + 0.55 * h;
          g.connect(G.sfxIn);
          SFX.heartbeat(ac, g, nextHeart, { rate: 1 });
          setTimeout(() => { try { g.disconnect(); } catch (e) { /* ignore */ } }, 2000);
          nextHeart += 60 / (62 + 70 * h);
        }
      }
    } catch (e) { warn("tick", e); }
  }
  function slow() {
    // 4 Hz: low-HP heartbeat, song distance filter
    const pl = state.player;
    if (state.rt.playing && pl.alive && pl.maxHp > 0 && pl.hp / pl.maxHp < 0.25) heartLow = clamp(1 - (pl.hp / pl.maxHp) / 0.25, 0.35, 1) * 0.8;
    else heartLow = 0;
    if (!ac) return;
    const now = ac.currentTime;
    for (const s of songs) {
      if (!s.lp || !s.pos) continue;
      const d = Math.sqrt(dist2(s.pos));
      s.lp.frequency.setTargetAtTime(clamp(16000 * Math.exp(-d / 28), 700, 16000), now, 0.3);
    }
  }
  if (ctx.engine && ctx.engine.addSystem) {
    ctx.engine.addSystem("audio", (dt) => {
      try {
        updateListener();
        tick();
        const rt = ctx.engine.realTime || 0;
        if (rt - last4Hz >= 0.25 || rt < last4Hz) { last4Hz = rt; slow(); }
      } catch (e) { warn("system", e); }
    }, 70);
  } else {
    setInterval(slow, 250);
  }

  // ------------------------------------------------------------ bus wiring
  const ngId = (id) => (id && state.run.cycle >= 1 && TRACKS[id + "_ng"] ? id + "_ng" : id);
  let zoneDelay = 0;
  bus.on("settings:change", (p) => { if (!p || p.key === "master" || p.key === "music" || p.key === "sfx" || !p.key) setVolumes(); });
  bus.on("game:pause", (p) => { paused = !!(p && p.paused); applyVolumes(0.15); });
  bus.on("player:step", (p) => {
    if (!p) return;
    const id = STEP_OF[p.surface] || "step_dirt";
    sfx(id, { vol: p.run ? 0.55 : 0.4, rate: rand(0.9, 1.1) });
    const eq = state.run.equip || {};
    if (eq.charm === "toms_bell") sfx("bell", { vol: 0.18, rate: rand(0.96, 1.04) });
    if (eq.armor === "bad_golden_armor") sfx("step_metal", { vol: 0.3, rate: rand(0.95, 1.05) });
    else if ((eq.armor === "iron_armor" || eq.armor === "golden_armor" || eq.armor === "bad_iron_armor") && Math.random() < 0.3) sfx("armor_rustle", { vol: 0.18 });
  });
  bus.on("player:jump", () => sfx("jump", { vol: 0.45 }));
  bus.on("player:dodge", () => sfx("dodge", { vol: 0.6 }));
  bus.on("player:land", (p) => {
    const f = Math.abs((p && p.fall) || 0);
    if (f > 12) sfx("land_hard", { vol: 0.7 });
    else if (f > 3.5) sfx("land", { vol: clamp(0.25 + f * 0.04, 0.25, 0.65) });
  });
  bus.on("secret:found", (p) => { if (p && String(p.id).indexOf("end_") !== 0) music.sting("secret"); });
  bus.on("item:get", (p) => { if (p && p.first) music.sting("itemGet"); });
  bus.on("unlock", () => music.sting("unlock"));
  bus.on("milestone", () => music.sting("levelUp"));
  bus.on("level:gain", (p) => {
    const t = ac ? ac.currentTime : 0;
    if (!p || t - lastLevelSfx < 0.15) return;
    lastLevelSfx = t;
    sfx("level_up", { vol: 0.3, rate: 1 + Math.min(0.5, Math.log10((p.amount || 1) + 1) * 0.08) });
  });
  const COMBAT_BOSSES = new Set(["ratKing", "fydor", "myles", "guards", "king", "cat", "rookie"]);
  // Big Tom purrs (low, positional at the barn) for as long as his fight lasts
  let tomPurr = null;
  bus.on("boss:start", (p) => {
    try { if (p && (p.kind === "cat" || p.id === "cat") && !tomPurr) tomPurr = loop("purr", { vol: 0.55, pos: { x: -80, y: 1.5, z: 236 } }); } catch (e) { warn("purr", e); }
  });
  bus.on("zone:enter", (p) => { try { if (tomPurr && p && p.id !== "barn") { tomPurr.stop(1); tomPurr = null; } } catch (e) { warn("purr", e); } });
  bus.on("boss:end", (p) => {
    try { if (tomPurr && p && (p.kind === "cat" || p.id === "cat")) { tomPurr.stop(1.2); tomPurr = null; } } catch (e) { warn("purr", e); }
  });
  bus.on("boss:end", (p) => {
    if (!p || !p.won) return;
    if (p.kind === "hollow1" || p.id === "hollow1") music.sting("throneResolve");
    else if (COMBAT_BOSSES.has(p.kind) || COMBAT_BOSSES.has(p.id)) music.sting("bossWin");
  });
  bus.on("player:died", () => music.sting("death"));
  // ending stings: EVENTS plays end_<id> at the right beat of each ending cinematic (playing it here as well
  // sounded it twice, seconds apart)
  bus.on("zone:enter", (p) => {
    if (!p) return;
    sfxWet = ZONE_WET[p.id] ?? 0.12;
    zoneAmbience(p.id);
  });
  bus.on("game:start", () => { zoneAmbience(state.world.zone); });
  bus.on("run:reset", () => {
    music.clearStack(1);
    heartExplicit = 0;
    if (zoneDelay) { clearTimeout(zoneDelay); zoneDelay = 0; }
    for (const s of songs.splice(0)) { s.stopped = true; if (s.player && ac) s.player.stop(ac.currentTime, 0.5); }
    ambienceOverride = null;
    setAmbience(null);
  });

  // ------------------------------------------------------------ public API
  const api = {
    unlock,
    music(id, o = {}) {
      if (zoneDelay) { clearTimeout(zoneDelay); zoneDelay = 0; }
      if (id && !TRACKS[id]) warn("unknown track " + id);
      music.setBase(id || null, o.fade ?? 2);
      if (id === "title" || id === "title_ng" || id === "redTitle") { ambienceOverride = null; setAmbience(null); }
    },
    zoneMusic(id, o = {}) {
      const want = ngId(id);
      if (zoneDelay) { clearTimeout(zoneDelay); zoneDelay = 0; }
      if (want && !TRACKS[want]) { warn("unknown track " + want); return; }
      if (music.base === want) return;
      const go = () => { zoneDelay = 0; music.setBase(want || null, o.fade ?? 2); };
      if (o.delay > 0) {
        // fade the old base out now (title ducks out), start the zone track after the delay
        if (music.base && music.base !== want) music.setBase(null, Math.min(2.5, o.delay));
        zoneDelay = setTimeout(go, o.delay * 1000);
      } else go();
    },
    pushMusic(tag, id, o = {}) { const want = ngId(id); if (want && !TRACKS[want]) { warn("unknown track " + want); return; } music.push(tag, want, o.fade ?? 1.5); },
    popMusic(tag, o = {}) { music.pop(tag, o.fade ?? 2); },
    stinger(id) { return music.sting(id); },
    sfx,
    loop,
    song,
    voice,
    setVolumes,
    duck(amount = 0.6, dur = 1) { music.duck(clamp(amount, 0, 1), Math.max(0.05, dur)); },
    muffle,
    heartbeat(x = 0) { heartExplicit = clamp(+x || 0, 0, 1); },
    // extras (contract additions)
    cue(name, sec = 1) { music.cue(name, sec); },            // "halfTime" | "silence" | "stutter" on the current track
    setIntensity(x) { music.setIntensity(x); },               // chase/collapse layers 0..3 (also rises on its own)
    ambience(list) { ambienceOverride = list ? true : null; setAmbience(list || null); if (!list) zoneAmbience(state.world.zone); },
    get current() { return music.id; },
    get unlocked() { return !!ac && ac.state === "running"; },
    get context() { return ac; },
    get tracks() { return TRACK_IDS.slice(); },
    get sfxIds() { return SFX_IDS.slice(); },
    get stingIds() { return STING_IDS.slice(); },
    get now() { return ac ? ac.currentTime : 0; },
    renderOffline,
    stats() { return { state: ac ? ac.state : "none", voices: voices.length, loops: loops.length, songs: songs.length, track: music.id, lookahead }; },
  };
  try {
    if (typeof window !== "undefined") {
      window.__tnrpg = window.__tnrpg || {};
      window.__tnrpg.audio = api;
    }
  } catch (e) { /* ignore */ }
  return api;
}
