// audio/index.js - bonus music, ambience and sfx (BONUS_AUDIO owns; API frozen: BONUS.md 10). DOM (WebAudio).
//   const ba = createBonusAudio(app)
//   ba.setGame(G)    // subscribe to G.bus (unsubscribes the previous game)
//   ba.start()       // entering the bonus screen: music + ambience for the current time of day
//   ba.stop()        // leaving: stop bonus music/ambience/sfx, unsubscribe
//   ba.frame(dt)     // every animation frame: day/night music crossfade, ambience mix, volume/mute follow
// Extra (tests / debug, optional): ba.play(name, opts, x?, y?) -> bool, ba.stats(), ba.SOUND_NAMES.
//
// Music: two original songs (songs/homestead_day.js, songs/homestead_night.js) played through the main engine's
//   app.audio._play(songObject, {fadeIn, fadeOut}) (so the music volume slider + duck apply). dawn/day -> day song,
//   dusk/night -> night song, 4 s crossfades.
// SFX + ambience: our own graph on app.audio.context:
//   sounds (sfx.js) -> sfxG -+-> bus (master * sfx volume, 0 when muted) -> compressor -> destination
//   ambience.js -> ambG  ----+        small convolver "forest air" reverb <- sends
// Frequent sounds (chop, dig, pick, swing, thud, jump, pickup) are rendered once per variant with an
// OfflineAudioContext in the background ("baked") and then played as one buffer source each; until a variant is
// baked it plays live. Voices are capped (MAX_VOICES) and every sound has a re-trigger gap.
import { phase } from "../core/time.js";
import { T } from "../core/const.js";
import { impulse } from "../../audio/dsp.js";
import { SOUNDS, SOUND_NAMES, makeKit } from "./sfx.js";
import { route } from "./events.js";
import { createAmbience, env } from "./ambience.js";
import DAY from "./songs/homestead_day.js";
import NIGHT from "./songs/homestead_night.js";

export { SOUND_NAMES };
export const SONGS = { day: DAY, night: NIGHT };
const MAX_VOICES = 16;
export const SFX_GAIN = 1.2; // sfx sit a little above the music (the compressor catches the big ones)
const HEAR_TILES = 30; // positional sounds farther than this are skipped
const BAKE_VARIANTS_MAX = 4;

export function createBonusAudio(app) {
  let G = null, off = null, started = false;
  let ac = null, bus = null, comp = null, sfxG = null, ambG = null, revIn = null, K = null, amb = null;
  let curSong = null, songGen = 0;
  const mem = {}, last = Object.create(null), voices = [];
  const baked = new Map(), queue = [], queued = new Set();
  let baking = false;
  const stats = { played: 0, baked: 0, live: 0, dropped: 0, skippedFar: 0, gapped: 0 };

  function context() {
    const c = app.audio && app.audio.context;
    if (!c || c.state === "closed") return null;
    if (c !== ac) build(c);
    return ac;
  }
  function build(c) {
    ac = c;
    bus = ac.createGain(); bus.gain.value = 0;
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -8; comp.knee.value = 6; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.15;
    bus.connect(comp); comp.connect(ac.destination);
    sfxG = ac.createGain(); sfxG.gain.value = SFX_GAIN; sfxG.connect(bus);
    ambG = ac.createGain(); ambG.gain.value = 0.8; ambG.connect(bus);
    const cv = ac.createConvolver();
    const ir = impulse(ac.sampleRate, 1.6, { damp: 0.55, seed: 23 });
    const b = ac.createBuffer(2, ir[0].length, ac.sampleRate); b.getChannelData(0).set(ir[0]); b.getChannelData(1).set(ir[1]);
    cv.buffer = b; revIn = ac.createGain(); revIn.gain.value = 0.6; revIn.connect(cv); cv.connect(bus);
    K = makeKit(ac, revIn);
    baked.clear(); queue.length = 0; queued.clear();
    applyVolume(true);
  }
  function applyVolume(now) {
    if (!bus) return;
    const v = app.audio.getVolume ? app.audio.getVolume() : { master: 0.9, sfx: 0.8 };
    const target = app.audio.muted ? 0 : (v.master ?? 0.9) * (v.sfx ?? 0.8);
    if (now) bus.gain.value = target;
    else if (Math.abs(bus.gain.value - target) > 0.001) bus.gain.setTargetAtTime(target, ac.currentTime, 0.05);
  }

  // ------------------------------------------------------------------ sfx
  const keyOf = (name, o) => name + "|" + Object.keys(o).filter((k) => k !== "pitch" && k !== "vol").sort().map((k) => k + "=" + o[k]).join(",");
  function bakeNext() {
    if (baking || !queue.length || !started || !ac) return;
    const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!OAC) { queue.length = 0; return; }
    const { key, name, o } = queue.shift();
    const S = SOUNDS[name], sr = ac.sampleRate;
    baking = true;
    let oc;
    try { oc = new OAC(1, Math.ceil((S.len + 0.05) * sr), sr); } catch (e) { baking = false; return; }
    const KO = makeKit(oc, null);
    let sendAmt = 0;
    KO.send = (n, a) => { sendAmt = Math.max(sendAmt, a || 0); };
    const g = oc.createGain(); g.connect(oc.destination);
    try { S.play(KO, g, 0, o); } catch (e) { baking = false; return; }
    oc.startRendering().then((buf) => {
      const list = baked.get(key) || [];
      list.push({ buf, send: sendAmt });
      baked.set(key, list);
      stats.baked++;
      if (list.length < Math.min(S.bake, BAKE_VARIANTS_MAX)) queue.push({ key, name, o });
      else queued.delete(key);
    }).catch(() => {}).then(() => { baking = false; setTimeout(bakeNext, 30); });
  }
  function wantBake(key, name, o) {
    if (queued.has(key)) return;
    queued.add(key); queue.push({ key, name, o: Object.assign({}, o, { pitch: 1 }) });
    setTimeout(bakeNext, 60);
  }
  // play a sound now (or `at` seconds later); x, y = px source position (pan + distance) or undefined = at the player
  function play(name, o = {}, x, y, at = 0) {
    const S = SOUNDS[name];
    if (!S || !started || !context()) return false;
    if (ac.state !== "running" && typeof ac.startRendering !== "function") return false;
    const now = ac.currentTime;
    if (!at && last[name] !== undefined && now - last[name] < S.gap) { stats.gapped++; return false; }
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i] < now) voices.splice(i, 1);
    if (voices.length >= MAX_VOICES + (S.pri >= 2 ? 6 : S.pri === 1 ? 2 : 0)) { stats.dropped++; return false; }
    let vol = o.vol ?? 1, pan = 0;
    if (x != null && G && G.player) {
      const p = G.player, dx = x - (p.x + p.w / 2), dy = (y != null ? y : p.y) - (p.y + p.h / 2);
      const dist = Math.hypot(dx, dy) / T;
      if (dist > HEAR_TILES) { stats.skippedFar++; return false; }
      vol *= Math.max(0.12, Math.min(1, 1 - (dist - 5) / (HEAR_TILES - 5)));
      pan = Math.max(-0.85, Math.min(0.85, dx / (14 * T)));
    }
    if (!at) last[name] = now;
    const t = now + 0.008 + at;
    const out = ac.createGain(); out.gain.value = vol;
    out.connect(K.pan(sfxG, pan));
    voices.push(t + S.len);
    stats.played++;
    const pitch = o.pitch || 1;
    if (S.bake) {
      const key = keyOf(name, o), list = baked.get(key);
      if (list && list.length >= Math.min(S.bake, BAKE_VARIANTS_MAX)) {
        const v = list[Math.floor(Math.random() * list.length)];
        const src = ac.createBufferSource(); src.buffer = v.buf; src.playbackRate.value = pitch * (1 + (Math.random() * 2 - 1) * 0.025);
        src.connect(out); if (v.send) K.send(out, v.send);
        src.start(t);
        src.onended = () => { try { out.disconnect(); } catch (e) { /* gone */ } };
        return true;
      }
      wantBake(key, name, o);
    }
    stats.live++;
    try { S.play(K, out, t, o); } catch (e) { return false; }
    if (typeof setTimeout !== "undefined") setTimeout(() => { try { out.disconnect(); } catch (e) { /* gone */ } }, (S.len + at + 2.2) * 1000);
    return true;
  }
  function onEvent(type, d) {
    if (!started) return;
    const list = route(type, d, G, mem);
    if (!list) return;
    for (const r of list) {
      if (play(r.s, r.o || {}, r.x, r.y, r.at || 0) && r.duck && app.audio.duck) app.audio.duck(r.duck, r.duckFor || 1.2);
    }
  }

  // ------------------------------------------------------------------ music
  function music(force) {
    if (!G || !started || !app.audio._play) return;
    const ph = phase(G), want = ph === "night" || ph === "dusk" ? "night" : "day";
    if (!force && want === curSong) return;
    const first = curSong === null;
    curSong = want;
    const song = SONGS[want], gen = ++songGen;
    const go = () => { if (started && gen === songGen) app.audio._play(song, { fadeIn: first ? 1.5 : 4, fadeOut: first ? 1 : 4 }); };
    const pw = app.audio._prewarm ? app.audio._prewarm(song) : null;
    if (pw && pw.then) pw.then(go, go); else go();
  }

  return {
    SOUND_NAMES,
    setGame(g) {
      if (off) off(); off = null; G = g;
      if (!G) return;
      off = G.bus.on("*", onEvent);
      if (started) { music(); }
    },
    start() {
      if (started) { music(false); return; } // a reload / new world while active: keep playing, follow the new phase
      started = true;
      curSong = null;
      music(true);
      if (context() && !amb) amb = createAmbience(ac, ambG, K);
    },
    stop() {
      started = false;
      songGen++;
      if (off) off(); off = null;
      if (amb) amb.stop(1.2); amb = null;
      const cs = app.audio.currentSong;
      if ((cs === DAY.id || cs === NIGHT.id) && app.audio.stopSong) app.audio.stopSong({ fadeOut: 1.2 });
      curSong = null;
      queue.length = 0; queued.clear();
      if (bus && ac) {
        const b = bus, c = comp, t = ac.currentTime;
        b.gain.cancelScheduledValues(t); b.gain.setValueAtTime(b.gain.value, t); b.gain.linearRampToValueAtTime(0, t + 1.3);
        setTimeout(() => { try { b.disconnect(); c.disconnect(); } catch (e) { /* gone */ } }, 1600);
      }
      ac = null; bus = null; K = null;
    },
    frame(dt) {
      if (!started) return;
      if (!context()) return;
      applyVolume(false);
      music(false);
      if (!amb) amb = createAmbience(ac, ambG, K);
      if (G && G.player && G.world) amb.update(dt || 0, env(G));
    },
    // ---- tests / debug ----
    play: (name, o, x, y, at) => play(name, o || {}, x, y, at || 0),
    stats: () => Object.assign({ voices: voices.length, bakedKeys: baked.size, queue: queue.length, song: curSong }, stats),
  };
}
