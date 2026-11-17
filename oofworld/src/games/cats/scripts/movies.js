// src/games/cats/scripts/movies.js - "Biscuit's Story": the MOVIES gallery, the full-screen film
// player, the procedural score, the narrator and the unlock logic (one movie per 5 cats found).
//
//   createMovies(ctx, deps) -> { update(dt), openGallery(), play(id), onCount(n), isOpen(),
//                                closeAll(), dispose(), debug: { list(), loaded(id), renderAt(id, t, canvas), state() } }
//   deps = { count(), isBusy(), loadSeen() -> "0101...", saveSeen(str), setBadge?(bool) }
//
// Films are ES modules under ./films/fNN.js exporting `film` (see FILMS.md and filmkit.js); each is
// loaded on demand through a literal dynamic import, defensively: a film that is missing or throws
// shows a "coming soon" poster and can never take the game down. draw(g, t, W, H) is a pure
// function of t, so the player can seek anywhere. NO BROWSER TIMERS (rule 04:V6): playback,
// fades, the score scheduler and the narrator are all driven by update(dt).

import * as K from "./filmkit.js";

const FILM_LOADERS = [
  () => import("./films/f00.js"),
  () => import("./films/f01.js"),
  () => import("./films/f02.js"),
  () => import("./films/f03.js"),
  () => import("./films/f04.js"),
  () => import("./films/f05.js"),
  () => import("./films/f06.js"),
  () => import("./films/f07.js"),
  () => import("./films/f08.js"),
  () => import("./films/f09.js"),
  () => import("./films/f10.js"),
  () => import("./films/f11.js"),
  () => import("./films/f12.js"),
  () => import("./films/f13.js"),
  () => import("./films/f14.js"),
  () => import("./films/f15.js"),
  () => import("./films/f16.js"),
  () => import("./films/f17.js"),
  () => import("./films/f18.js"),
  () => import("./films/f19.js"),
  () => import("./films/f20.js"),
];
const COUNT = FILM_LOADERS.length;
const PER_MOVIE = 5;

// The catalogue from FILMS.md, so the gallery and the unlock prompt can name a film before (or
// without) loading its module. A loaded module's own fields win.
const CATALOG = [
  ["Prologue", "The Night He Left", 72], ["Chapter 1", "The Plaza of Lost Cats", 60], ["Chapter 2", "The Hole in the Fence", 64],
  ["Chapter 3", "Missing", 66], ["Chapter 4", "The Box in the Rain", 74], ["Chapter 5", "The Shadow at the Gate", 64],
  ["Chapter 6", "The Toy Mouse", 66], ["Chapter 7", "Thunder", 68], ["Chapter 8", "The Mountain of Fire", 62],
  ["Chapter 9", "Security Footage", 70], ["Chapter 10", "So Close", 72], ["Chapter 11", "Nothing", 58],
  ["Chapter 12", "Echoes", 66], ["Chapter 13", "The Lantern Cats", 64], ["Chapter 14", "Almost", 66],
  ["Chapter 15", "Too Loud", 60], ["Chapter 16", "He Was Never Lost", 80], ["Chapter 17", "Brave", 70],
  ["Chapter 18", "The Procession", 66], ["Chapter 19", "The Bell", 64], ["Finale", "Home", 80],
];

const PLAYER_Z = 215;
const PROMPT_Z = 216;
const FRAME_S = 1 / 30;
const LW = 960, LH = 540;
const INTRO_DELAY_S = 1.4;
const CONTROLS_IDLE_S = 2.6;
const SUB_FADE_S = 0.25;
const SCORE_LOOKAHEAD_S = 0.6;
const POSTER_W = 320, POSTER_H = 180;

const FONT = '"Fredoka One", "Arial Rounded MT Bold", "Segoe UI", Roboto, system-ui, sans-serif';
const CSS = `
.ftc-mv{position:fixed;inset:0;z-index:${PLAYER_Z};background:#000;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;font-family:${FONT};color:#fff}
.ftc-mv canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}
.ftc-mv-top{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:10px;padding:10px 12px;background:linear-gradient(rgba(0,0,0,.65),rgba(0,0,0,0));transition:opacity .35s}
.ftc-mv-name{flex:1;min-width:0;font-size:16px;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 3px #000}
.ftc-mv-name small{opacity:.7;font-size:13px;margin-right:8px}
.ftc-mv-bar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:10px;padding:12px 14px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.75));transition:opacity .35s}
.ftc-mv.idle .ftc-mv-bar,.ftc-mv.idle .ftc-mv-top{opacity:0}
.ftc-mv-b{pointer-events:auto;min-width:46px;height:46px;border-radius:14px;border:2px solid rgba(255,255,255,.28);background:rgba(30,18,40,.72);color:#fff;font:700 18px ${FONT};cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0 10px}
.ftc-mv-b:active{transform:scale(.94)}
.ftc-mv-x{background:#ff5f8f;border-color:#fff}
.ftc-mv-time{font:600 13px "Segoe UI",Roboto,system-ui,sans-serif;white-space:nowrap;min-width:84px;text-align:center;opacity:.9}
.ftc-mv-range{flex:1;min-width:80px;height:44px;-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer}
.ftc-mv-range::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(90deg,#ff9ad8 var(--p),rgba(255,255,255,.25) var(--p))}
.ftc-mv-range::-moz-range-track{height:6px;border-radius:3px;background:rgba(255,255,255,.25)}
.ftc-mv-range::-moz-range-progress{height:6px;border-radius:3px;background:#ff9ad8}
.ftc-mv-range::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:3px solid #ff9ad8;margin-top:-7px}
.ftc-mv-range::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid #ff9ad8}
.ftc-mv-big{position:absolute;left:50%;top:50%;width:92px;height:92px;margin:-46px 0 0 -46px;border-radius:50%;background:rgba(20,10,30,.6);border:3px solid rgba(255,255,255,.7);display:none;align-items:center;justify-content:center;font-size:40px;pointer-events:none}
.ftc-mv.paused .ftc-mv-big{display:flex}
.ftc-mv-end{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;background:rgba(0,0,0,.55)}
.ftc-mv.ended .ftc-mv-end{display:flex}
.ftc-mv.ended .ftc-mv-big{display:none}
.ftc-mv-end .ftc-mv-b{font-size:17px;padding:0 20px;height:52px}
.ftc-mv-end h3{margin:0;font-size:24px;letter-spacing:1px;text-shadow:0 2px 6px #000;text-align:center;padding:0 12px}
.ftc-mv-grid{display:grid;grid-auto-rows:auto!important;align-items:start;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.ftc-mv-card{position:relative;height:auto!important;background:#2a1d38;border:2px solid rgba(255,255,255,.12);border-radius:14px;padding:6px;cursor:pointer;min-height:44px}
.ftc-mv-card:active{transform:scale(.98)}
.ftc-mv-card canvas{width:100%!important;height:auto!important;max-height:none!important;aspect-ratio:16/9;border-radius:10px;display:block;background:#120c1a}
.ftc-mv-card.locked canvas{filter:blur(5px) brightness(.32) grayscale(.6)}
.ftc-mv-card .ftc-mv-ch{font-size:12px;opacity:.75;margin-top:6px;letter-spacing:1px;text-transform:uppercase}
.ftc-mv-card .ftc-mv-t{font-size:16px;line-height:1.2;margin-top:2px}
.ftc-mv-card .ftc-mv-d{position:absolute;right:12px;top:12px;font:600 12px "Segoe UI",sans-serif;background:rgba(0,0,0,.6);border-radius:6px;padding:1px 6px}
.ftc-mv-card .ftc-mv-new{position:absolute;left:12px;top:12px;font-size:12px;background:#ff5f8f;border-radius:7px;padding:2px 8px;box-shadow:0 0 10px #ff5f8f}
.ftc-mv-card .ftc-mv-lock{position:absolute;left:6px;right:6px;top:6px;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;font-size:17px;text-shadow:0 2px 6px #000}
.ftc-mv-card.locked .ftc-mv-t,.ftc-mv-card.locked .ftc-mv-ch{opacity:.55}
.ftc-mv-next{flex-basis:100%;font:600 14px "Segoe UI",Roboto,system-ui,sans-serif;opacity:.9}
.ftc-mv-prompt{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:${PROMPT_Z};pointer-events:auto;width:min(460px,94vw);background:#1d1328;border:3px solid #ff9ad8;border-radius:18px;padding:12px 14px;box-shadow:0 10px 40px rgba(0,0,0,.6);font-family:${FONT};color:#fff;display:flex;gap:12px;align-items:center;animation:ftc-mv-up .4s cubic-bezier(.2,1.4,.4,1) both}
@keyframes ftc-mv-up{from{transform:translate(-50%,40px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
.ftc-mv-prompt canvas{width:120px!important;height:auto!important;aspect-ratio:16/9;border-radius:8px;flex:none;background:#120c1a}
.ftc-mv-prompt .ftc-mv-pt{flex:1;min-width:0}
.ftc-mv-prompt .ftc-mv-pt b{display:block;font-size:13px;opacity:.8;letter-spacing:1px}
.ftc-mv-prompt .ftc-mv-pt span{display:block;font-size:17px;margin:2px 0 8px}
.ftc-mv-prompt .ftc-mv-row{display:flex;gap:8px;flex-wrap:wrap}
.ftc-mv-prompt .ftc-mv-b{height:44px;font-size:15px}
.ftc-mv-go{background:#ffd75a!important;color:#2a1a00!important;border-color:#fff!important}
body.oof-reduced-motion .ftc-mv-prompt{animation:none}
@media (max-width:520px){.ftc-mv-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}.ftc-mv-time{min-width:64px;font-size:12px}.ftc-mv-bar{gap:6px;padding-left:8px;padding-right:8px}}
`;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function tap(node, fn) {
  node.addEventListener("pointerup", (ev) => { ev.preventDefault(); ev.stopPropagation(); fn(ev); });
  node.addEventListener("pointerdown", (ev) => ev.stopPropagation());
}
const fmt = (s) => {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const padSeen = (str) => (String(str || "").replace(/[^01]/g, "0") + "0".repeat(COUNT)).slice(0, COUNT);

// ------------------------------------------------------------------------------------------------
// The procedural score: pads, bass, piano, bells, strings, rain bed and story cues, generated from
// film.score and scheduled against the playback clock (rescheduled on every seek).
const NOTE = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
const PROG = {
  sad: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]],
  tense: [[0, 3, 7], [0, 3, 8], [1, 5, 8], [0, 3, 7]],
  hopeful: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]],
  mystery: [[0, 3, 7, 14], [5, 9, 12, 16], [0, 3, 7, 10], [2, 6, 9, 13]],
  epic: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]],
  joy: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7, 12]],
  storm: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 11, 14]],
};
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function createScore() {
  let ac = null, master = null, music = null, sfx = null, verb = null, noiseBuf = null;
  let film = null, base = 0, cursor = 0, live = [], rain = null, broken = false;
  let duck = 1;

  function ensure() {
    if (ac || broken) return !!ac;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { broken = true; return false; }
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.55;
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 3;
      master.connect(comp).connect(ac.destination);
      music = ac.createGain();
      music.connect(master);
      sfx = ac.createGain();
      sfx.connect(master);
      // a small generated hall reverb
      verb = ac.createConvolver();
      const len = Math.floor(ac.sampleRate * 2.6);
      const ir = ac.createBuffer(2, len, ac.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        let seed = 1234 + c * 77;
        for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; d[i] = ((seed / 2147483647) * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      }
      verb.buffer = ir;
      const vg = ac.createGain();
      vg.gain.value = 0.32;
      verb.connect(vg).connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      let s2 = 99;
      for (let i = 0; i < nd.length; i++) { s2 = (s2 * 16807) % 2147483647; nd[i] = (s2 / 2147483647) * 2 - 1; }
      return true;
    } catch (err) {
      console.warn("[movies] audio unavailable", err);
      broken = true;
      ac = null;
      return false;
    }
  }
  const at = (ft) => base + ft;
  function track(node, end) { live.push({ node, end }); }
  function stopAll() {
    if (!ac) return;
    for (const l of live) { try { l.node.stop(); } catch { /* already */ } }
    live = [];
    if (rain) { try { rain.src.stop(); } catch { /* fine */ } rain = null; }
  }
  function envGain(ft) {
    const d = film ? film.duration : 60;
    return Math.min(1, Math.max(0, ft / 2.5)) * Math.min(1, Math.max(0, (d - ft) / 3));
  }
  function voice(dest, type, hz, t0, dur, gain, o = {}) {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, t0);
    if (o.detune) osc.detune.setValueAtTime(o.detune, t0);
    if (o.glide) for (const [dt, f] of o.glide) osc.frequency.linearRampToValueAtTime(f, t0 + dt);
    const gn = ac.createGain();
    const a = o.attack == null ? 0.01 : o.attack, r = o.release == null ? 0.3 : o.release;
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.linearRampToValueAtTime(gain, t0 + a);
    if (o.decay) gn.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * o.sustain || 0.0001), t0 + a + o.decay);
    gn.gain.setValueAtTime(o.decay ? Math.max(0.0001, gain * (o.sustain || 0.0001)) : gain, t0 + Math.max(a, dur - r));
    gn.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    let node = gn;
    if (o.lp) {
      const f = ac.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.lp;
      f.Q.value = o.q || 0.7;
      gn.connect(f);
      node = f;
    }
    osc.connect(gn);
    node.connect(dest);
    if (o.wet) { const w = ac.createGain(); w.gain.value = o.wet; node.connect(w).connect(verb); }
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    track(osc, t0 + dur);
  }
  function noise(dest, t0, dur, gain, o = {}) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = o.type || "lowpass";
    f.frequency.setValueAtTime(o.f || 800, t0);
    if (o.fTo) f.frequency.exponentialRampToValueAtTime(o.fTo, t0 + dur);
    f.Q.value = o.q || 0.8;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.linearRampToValueAtTime(gain, t0 + (o.attack || 0.02));
    if (o.am) {
      const lfo = ac.createOscillator();
      const lg = ac.createGain();
      lfo.frequency.value = o.am;
      lg.gain.value = gain * 0.6;
      lfo.connect(lg).connect(gn.gain);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.05);
      track(lfo, t0 + dur);
    }
    gn.gain.setValueAtTime(gain, t0 + Math.max(o.attack || 0.02, dur - (o.release || 0.4)));
    gn.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(gn).connect(dest);
    if (o.wet) { const w = ac.createGain(); w.gain.value = o.wet; gn.connect(w).connect(verb); }
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
    track(src, t0 + dur);
  }

  function cue(name, ft) {
    const t0 = at(ft);
    const now = ac.currentTime;
    if (t0 < now - 0.05) return;
    const s = Math.max(t0, now);
    const root = 36 + (NOTE[(film.score && film.score.key) || "C"] || 0);
    switch (name) {
      case "thunder":
        noise(sfx, s, 3.2, 0.5, { f: 260, fTo: 60, attack: 0.03, release: 2.4, wet: 0.4 });
        noise(sfx, s, 0.25, 0.25, { f: 2400, type: "bandpass", attack: 0.005, release: 0.2 });
        break;
      case "hit":
        voice(sfx, "sine", 70, s, 1.4, 0.6, { glide: [[0.6, 34]], attack: 0.005, release: 1.1, wet: 0.3 });
        noise(sfx, s, 0.9, 0.18, { f: 5000, type: "highpass", attack: 0.005, release: 0.8, wet: 0.5 });
        break;
      case "swell":
        for (const iv of [0, 7, 12, 15, 19]) voice(music, "sawtooth", midiHz(root + 12 + iv), s, 4, 0.025, { attack: 3, release: 0.8, lp: 1400, detune: iv * 1.5, wet: 0.6 });
        noise(sfx, s, 3.6, 0.06, { f: 600, fTo: 4000, attack: 3, release: 0.5, wet: 0.5 });
        break;
      case "drop":
        if (master) {
          master.gain.cancelScheduledValues(s);
          master.gain.setValueAtTime(master.gain.value, s);
          master.gain.linearRampToValueAtTime(0.08, s + 0.08);
          master.gain.setValueAtTime(0.08, s + 1.3);
          master.gain.linearRampToValueAtTime(0.55 * duck, s + 2.2);
        }
        break;
      case "bell":
        for (let i = 0; i < 3; i++) {
          const ts = s + i * 0.11;
          const f0 = 2600 + i * 180;
          voice(sfx, "sine", f0, ts, 1.2, 0.08, { attack: 0.002, decay: 0.9, sustain: 0.02, release: 0.3, wet: 0.5 });
          voice(sfx, "sine", f0 * 2.76, ts, 0.6, 0.03, { attack: 0.002, decay: 0.4, sustain: 0.02, release: 0.2, wet: 0.5 });
        }
        break;
      case "meow": {
        const o = { attack: 0.06, release: 0.25, glide: [[0.18, 760], [0.42, 640], [0.7, 430]], lp: 2600, q: 3, wet: 0.35 };
        voice(sfx, "sawtooth", 520, s, 0.75, 0.16, o);
        voice(sfx, "triangle", 1040, s, 0.75, 0.05, { ...o, glide: [[0.18, 1520], [0.42, 1280], [0.7, 860]] });
        break;
      }
      case "purr":
        noise(sfx, s, 2.6, 0.22, { f: 320, attack: 0.3, release: 0.6, am: 24 });
        voice(sfx, "sawtooth", 26, s, 2.6, 0.1, { attack: 0.3, release: 0.6, lp: 200 });
        break;
      default: break;
    }
  }

  function schedule(fromT, toT) {
    const sc = film.score || {};
    const mood = PROG[sc.mood] ? sc.mood : "sad";
    const prog = PROG[mood];
    const bpm = Math.max(40, Math.min(160, sc.bpm || 70));
    const beat = 60 / bpm;
    const bar = beat * 4;
    const root = 48 + (NOTE[sc.key] || 0);
    const now = ac.currentTime;
    const ok = (ft) => at(ft) >= now - 0.02 && ft < film.duration;
    const major = mood === "hopeful" || mood === "joy";
    for (let b = Math.floor(fromT / bar); b * bar < toT; b++) {
      const bt = b * bar;
      if (bt < fromT || !ok(bt)) continue;
      const ch = prog[((b % prog.length) + prog.length) % prog.length];
      const e = envGain(bt);
      if (e <= 0.01) continue;
      // pad (two detuned saws per chord tone, slow attack)
      for (const iv of ch) {
        for (const d of [-7, 7]) voice(music, mood === "mystery" ? "triangle" : "sawtooth", midiHz(root + iv), at(bt), bar + 1.4, 0.018 * e, { attack: 1.1, release: 1.3, lp: mood === "tense" ? 700 : 1200, detune: d, wet: 0.7 });
      }
      if (mood !== "mystery") voice(music, "triangle", midiHz(root - 12 + ch[0]), at(bt), bar, 0.07 * e, { attack: 0.05, release: 0.6, lp: 500 });
      if ((mood === "mystery" || major || mood === "sad") && b % 2 === 0) {
        const f0 = midiHz(root + 24 + ch[(b >> 1) % ch.length]);
        voice(music, "sine", f0, at(bt + beat * 2), 3, 0.03 * e, { attack: 0.003, decay: 2.2, sustain: 0.05, release: 0.6, wet: 0.8 });
        voice(music, "sine", f0 * 2.76, at(bt + beat * 2), 1.5, 0.008 * e, { attack: 0.003, decay: 1.2, sustain: 0.05, release: 0.3, wet: 0.8 });
      }
      // piano-ish arpeggio
      const steps = major || mood === "epic" ? 8 : mood === "tense" ? 0 : 4;
      for (let i = 0; i < steps; i++) {
        const nt = bt + (bar / steps) * i;
        if (!ok(nt)) continue;
        const r = K.hash(b * 31 + i, 7);
        if (mood === "sad" && r < 0.35) continue;
        const note = root + 12 + ch[i % ch.length] + (i >= ch.length && major ? 12 : 0);
        const g0 = (0.05 + r * 0.02) * e;
        voice(music, "triangle", midiHz(note), at(nt), 1.6, g0, { attack: 0.004, decay: 1.1, sustain: 0.06, release: 0.3, lp: 2600, wet: 0.45 });
        voice(music, "sine", midiHz(note + 12), at(nt), 0.8, g0 * 0.3, { attack: 0.003, decay: 0.5, sustain: 0.04, release: 0.2, wet: 0.45 });
      }
      if (mood === "tense") {
        for (let i = 0; i < 16; i++) {
          const nt = bt + (bar / 16) * i;
          if (!ok(nt)) continue;
          voice(music, "sawtooth", midiHz(root + 24 + (i % 4 === 3 ? 7 : 0)), at(nt), 0.12, 0.012 * e, { attack: 0.005, release: 0.06, lp: 2200 });
        }
      }
      if (mood === "tense" || mood === "epic") {
        for (let i = 0; i < 4; i++) {
          const nt = bt + beat * i;
          if (!ok(nt) || (mood === "epic" && i % 2)) continue;
          voice(music, "sine", 58, at(nt), 0.5, 0.22 * e, { attack: 0.005, release: 0.4, glide: [[0.25, 38]] });
        }
      }
    }
    for (const c of (sc.cues || [])) {
      const [ct, name] = c;
      if (ct >= fromT && ct < toT) cue(name, ct);
    }
  }

  function startRain(ft) {
    const sc = film.score || {};
    if (sc.mood !== "storm" && !sc.rain) return;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 700;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5200;
    const gn = ac.createGain();
    const now = ac.currentTime;
    gn.gain.setValueAtTime(0.0001, now);
    gn.gain.linearRampToValueAtTime(0.09 * envGain(Math.max(ft, 1.5)), now + 0.8);
    const end = at(film.duration);
    if (end > now + 3) { gn.gain.setValueAtTime(0.09, end - 3); gn.gain.linearRampToValueAtTime(0.0001, end); }
    src.connect(hp).connect(lp).connect(gn).connect(music);
    src.start(now);
    rain = { src };
  }

  return {
    load(f) { film = f; },
    // (re)start from film time ft; call on play, resume-after-seek and seek
    start(ft) {
      if (!film || !ensure()) return;
      stopAll();
      try { if (ac.state === "suspended") ac.resume(); } catch { /* fine */ }
      base = ac.currentTime + 0.05 - ft;
      cursor = ft;
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setValueAtTime(0.55 * duck, ac.currentTime);
      try { startRain(ft); } catch (err) { console.warn("[movies] rain", err); }
    },
    pump(ft) {
      if (!ac || !film) return;
      // drift guard: the film clock (update dt) and the audio clock must agree
      if (Math.abs((ac.currentTime - base) - ft) > 0.25) { this.start(ft); }
      const to = ft + SCORE_LOOKAHEAD_S;
      if (to > cursor) {
        try { schedule(cursor, to); } catch (err) { console.warn("[movies] score", err); }
        cursor = to;
      }
      const now = ac.currentTime;
      if (live.length > 64) live = live.filter((l) => l.end > now - 0.5);
    },
    setDuck(d) {
      if (!ac || !master || Math.abs(d - duck) < 0.01) return;
      duck = d;
      const now = ac.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0.55 * d, now + 0.4);
    },
    pause() { stopAll(); try { if (ac && ac.state === "running") ac.suspend(); } catch { /* fine */ } },
    close() {
      stopAll();
      if (ac) { try { ac.close(); } catch { /* fine */ } }
      ac = null; master = null; film = null;
    },
  };
}

// ------------------------------------------------------------------------------------------------
export function createMovies(ctx, deps) {
  const ui = ctx.services && ctx.services.ui;
  const sfx = (name) => { try { ctx.engine.audio.playSfx(name); } catch { /* optional */ } };
  const toast = (msg, icon) => { try { ui.toast(msg, { icon: icon || "🎬", duration: 3500 }); } catch { /* optional */ } };

  const style = el("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const films = Array.from({ length: COUNT }, (_, id) => ({ id, status: "idle", film: null, err: null, poster: null, waiters: [] }));
  let seen = "0".repeat(COUNT);
  try { seen = padSeen(deps.loadSeen()); } catch { seen = "0".repeat(COUNT); }
  let lastCount = safeCount();
  // The prologue auto-plays once for a new player. Automated browsers (navigator.webdriver) never
  // get it unasked: a cinematic covering the screen would only get in a test run's way.
  let automated = false;
  try { automated = !!(window.navigator && window.navigator.webdriver); } catch { automated = false; }
  let introWait = seen[0] === "1" || automated ? -1 : INTRO_DELAY_S;
  let promptQueue = [];
  let prompt = null;
  let gallery = null;
  let player = null;
  let voiceOn = true;
  let badge = null;
  let disposed = false;

  function safeCount() { try { return Math.max(0, deps.count() | 0); } catch { return 0; } }
  const unlocked = (id, n = safeCount()) => id === 0 || n >= id * PER_MOVIE;
  const meta = (id) => {
    const f = films[id].film;
    const c = CATALOG[id] || ["Chapter " + id, "Untitled", 60];
    return {
      chapter: (f && f.chapter) || c[0], title: (f && f.title) || c[1],
      duration: f && f.duration > 0 ? f.duration : c[2], tagline: (f && f.tagline) || "",
    };
  };

  function load(id) {
    const rec = films[id];
    if (!rec) return Promise.resolve(null);
    if (rec.status === "ready") return Promise.resolve(rec.film);
    if (rec.status === "failed") return Promise.resolve(null);
    if (rec.status === "loading") return new Promise((res) => rec.waiters.push(res));
    rec.status = "loading";
    let p;
    try { p = FILM_LOADERS[id](); } catch (err) { p = Promise.reject(err); }
    return Promise.resolve(p).then((mod) => {
      const f = mod && mod.film;
      if (!f || typeof f.draw !== "function" || !(f.duration > 0)) throw new Error("module exports no valid film");
      rec.film = f;
      rec.status = "ready";
      return f;
    }).catch((err) => {
      rec.status = "failed";
      rec.err = String(err && err.message ? err.message : err);
      console.warn(`[movies] film ${id} is not available (coming soon):`, rec.err);
      return null;
    }).then((f) => {
      if (disposed) return null;
      const w = rec.waiters.splice(0);
      for (const fn of w) fn(f);
      return f;
    });
  }

  function saveSeenStr() {
    try { deps.saveSeen(seen); } catch (err) { console.warn("[movies] save failed", err); }
  }
  function markSeen(id) {
    if (seen[id] === "1") return;
    seen = seen.slice(0, id) + "1" + seen.slice(id + 1);
    saveSeenStr();
    refreshBadge();
    if (gallery) renderGallery();
  }
  function hasNew() {
    const n = safeCount();
    for (let i = 0; i < COUNT; i++) if (unlocked(i, n) && seen[i] !== "1") return true;
    return false;
  }
  function refreshBadge() {
    const b = hasNew();
    if (b === badge) return;
    badge = b;
    try { if (typeof deps.setBadge === "function") deps.setBadge(b); } catch { /* optional */ }
  }

  // ---- drawing helpers ----------------------------------------------------------------------------
  function drawFilm(g, film, t, scale) {
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    g.filter = "none";
    g.fillStyle = "#000";
    g.fillRect(0, 0, LW, LH);
    K.setPixelScale(scale);
    try {
      film.draw(g, t, LW, LH);
      return true;
    } catch (err) {
      g.setTransform(scale, 0, 0, scale, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "#0b0812";
      g.fillRect(0, 0, LW, LH);
      K.title(g, LW, LH, "This scene is still being painted", "Coming soon", 1, { size: 34 });
      return err;
    } finally {
      g.setTransform(scale, 0, 0, scale, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
      g.filter = "none";
      g.shadowBlur = 0;
      g.shadowColor = "rgba(0,0,0,0)";
    }
  }
  function comingSoon(cv, id, soon = true) {
    const g = cv.getContext("2d");
    const s = cv.width / LW;
    g.setTransform(s, 0, 0, s, 0, 0);
    K.setPixelScale(s);
    const gr = g.createLinearGradient(0, 0, 0, LH);
    gr.addColorStop(0, "#241733");
    gr.addColorStop(1, "#0d0814");
    g.fillStyle = gr;
    g.fillRect(0, 0, LW, LH);
    K.pawprints(g, [{ x: LW / 2, y: LH * 0.42, a: 0, s: 60, alpha: 0.55, flat: 1 }], 0.6);
    const m = meta(id);
    K.title(g, LW, LH, m.title, m.chapter, 1, { y: LH * 0.62, size: 52 });
    g.setTransform(s, 0, 0, s, 0, 0);
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.font = `600 30px ${FONT}`;
    g.textAlign = "center";
    g.fillText(soon ? "COMING SOON" : "NEW MOVIE", LW / 2, LH * 0.82);
  }
  function renderPoster(cv, id) {
    const rec = films[id];
    if (rec.status !== "ready") { comingSoon(cv, id); return; }
    const g = cv.getContext("2d");
    const res = drawFilm(g, rec.film, rec.film.poster == null ? rec.film.duration * 0.4 : rec.film.poster, cv.width / LW);
    if (res !== true) comingSoon(cv, id);
  }

  // ---- gallery --------------------------------------------------------------------------------------
  function openGallery() {
    closeGallery(true);
    closePrompt(); // the gallery shows the NEW badge itself
    promptQueue = [];
    const node = el("div", "ftc-modal");
    node.dataset.ftc = "movie-gallery";
    const sh = el("div", "ftc-sheet");
    const head = el("div", "ftc-head");
    const tt = el("div", "ftc-title", "🎬 BISCUIT'S STORY");
    const x = el("button", "ftc-x", "✕");
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    tap(x, () => closeGallery());
    const next = el("div", "ftc-mv-next");
    const prog = el("div", "ftc-prog");
    const bar = el("i");
    prog.appendChild(bar);
    head.append(tt, x, next, prog);
    const body = el("div", "ftc-body");
    const grid = el("div", "ftc-mv-grid");
    body.appendChild(grid);
    sh.append(head, body);
    node.appendChild(sh);
    node.addEventListener("pointerup", (ev) => { if (ev.target === node) closeGallery(); });
    node.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    node.addEventListener("wheel", (ev) => ev.stopPropagation(), { passive: true });
    document.body.appendChild(node);
    gallery = { node, grid, next, bar, cards: [], pumpT: 0 };
    renderGallery();
    for (let i = 0; i < COUNT; i++) load(i);
    sfx("ui_open");
  }
  function renderGallery() {
    if (!gallery) return;
    const n = safeCount();
    let nextAt = 0;
    for (let i = 1; i < COUNT; i++) if (!unlocked(i, n)) { nextAt = i * PER_MOVIE; break; }
    gallery.next.textContent = nextAt ? `Next movie at ${nextAt} cats (you have ${n})` : "All 21 movies unlocked!";
    const prevAt = nextAt ? nextAt - PER_MOVIE : 100;
    gallery.bar.style.width = (nextAt ? Math.max(0, Math.min(1, (n - prevAt) / PER_MOVIE)) * 100 : 100) + "%";
    const old = new Map(gallery.cards.map((c) => [c.id, c]));
    gallery.grid.textContent = "";
    gallery.cards = [];
    for (let id = 0; id < COUNT; id++) {
      const m = meta(id);
      const open = unlocked(id, n);
      const card = el("div", "ftc-mv-card" + (open ? "" : " locked"));
      card.dataset.film = String(id);
      const prev = old.get(id);
      const cv = prev ? prev.canvas : el("canvas");
      if (!prev) { cv.width = POSTER_W; cv.height = POSTER_H; }
      card.appendChild(cv);
      card.append(el("div", "ftc-mv-ch", m.chapter), el("div", "ftc-mv-t", m.title), el("div", "ftc-mv-d", fmt(m.duration)));
      if (open && seen[id] !== "1") card.appendChild(el("div", "ftc-mv-new", "NEW"));
      if (!open) card.appendChild(el("div", "ftc-mv-lock", `🔒 Find ${id * PER_MOVIE} cats`));
      tap(card, () => {
        if (!unlocked(id)) { sfx("denied"); toast(`Find ${id * PER_MOVIE} cats to unlock this movie (you have ${safeCount()})`, "🔒"); return; }
        play(id);
      });
      gallery.grid.appendChild(card);
      gallery.cards.push({ id, canvas: cv, done: prev ? prev.done : false });
    }
  }
  function pumpPosters(dt) {
    if (!gallery) return;
    gallery.pumpT += dt;
    if (gallery.pumpT < 0.05) return;
    gallery.pumpT = 0;
    for (const c of gallery.cards) {
      if (c.done) continue;
      const st = films[c.id].status;
      if (st === "loading" || st === "idle") continue;
      c.done = true;
      try { renderPoster(c.canvas, c.id); } catch (err) { console.warn("[movies] poster", c.id, err); }
      return; // one poster per tick keeps frames smooth
    }
  }
  function closeGallery(silent) {
    if (!gallery) return;
    gallery.node.remove();
    gallery = null;
    if (!silent) sfx("ui_close");
  }

  // ---- unlock prompt ----------------------------------------------------------------------------------
  function onCount(n) {
    n = Math.max(0, n | 0);
    let newest = -1;
    for (let id = 1; id < COUNT; id++) if (id * PER_MOVIE > lastCount && id * PER_MOVIE <= n) newest = id;
    lastCount = Math.max(lastCount, n);
    if (newest > 0) {
      promptQueue = [newest]; // only the newest one is worth announcing
      if (gallery) renderGallery();
    }
    refreshBadge();
  }
  function showPrompt(id) {
    closePrompt();
    const node = el("div", "ftc-mv-prompt");
    node.dataset.ftc = "movie-prompt";
    const cv = el("canvas");
    cv.width = 192;
    cv.height = 108;
    const txt = el("div", "ftc-mv-pt");
    const m = meta(id);
    txt.append(el("b", "", "🎬 NEW MOVIE UNLOCKED"), el("span", "", `${m.chapter}: ${m.title}`));
    const row = el("div", "ftc-mv-row");
    const go = el("button", "ftc-mv-b ftc-mv-go", "▶ WATCH NOW");
    go.type = "button";
    const later = el("button", "ftc-mv-b", "LATER");
    later.type = "button";
    tap(go, () => { closePrompt(); play(id); });
    tap(later, () => { closePrompt(); sfx("ui_close"); });
    row.append(go, later);
    txt.appendChild(row);
    node.append(cv, txt);
    node.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    node.addEventListener("pointerup", (ev) => ev.stopPropagation());
    document.body.appendChild(node);
    prompt = { id, node, canvas: cv, drawn: false };
    sfx("sparkle");
  }
  function closePrompt() {
    if (!prompt) return;
    prompt.node.remove();
    prompt = null;
  }

  // ---- player -----------------------------------------------------------------------------------------
  function pickScale() {
    const dpr = window.devicePixelRatio || 1;
    return dpr >= 1.5 && window.innerWidth > 1100 ? 1280 / LW : 1;
  }
  function play(id, opts = {}) {
    id = Number(id);
    if (!Number.isInteger(id) || id < 0 || id >= COUNT) return false;
    if (!unlocked(id) && !opts.force) { toast(`Find ${id * PER_MOVIE} cats to unlock this movie`, "🔒"); return false; }
    closePrompt();
    const rec = films[id];
    if (rec.status === "failed") { toast(`"${meta(id).title}" is coming soon!`, "🎬"); return false; }
    openPlayer(id, !!opts.intro);
    if (rec.status !== "ready") {
      load(id).then((f) => {
        if (!player || player.id !== id) return;
        if (!f) { closePlayer(); toast(`"${meta(id).title}" is coming soon!`, "🎬"); return; }
        attachFilm(f);
      });
    } else attachFilm(rec.film);
    markSeen(id);
    return true;
  }

  function openPlayer(id, intro) {
    // "Next movie" goes player -> player: keep the game track to restore later, never restart it in between
    const inheritedTrack = player ? player.prevTrack : undefined;
    if (player) player.prevTrack = null;
    closePlayer(true);
    const node = el("div", "ftc-mv paused");
    node.dataset.ftc = "movie";
    const scale = pickScale();
    const cv = el("canvas");
    cv.width = Math.round(LW * scale);
    cv.height = Math.round(LH * scale);
    const g = cv.getContext("2d");
    const big = el("div", "ftc-mv-big", "▶");
    const top = el("div", "ftc-mv-top");
    const m = meta(id);
    const name = el("div", "ftc-mv-name");
    name.append(el("small", "", m.chapter), document.createTextNode(m.title));
    const voiceB = el("button", "ftc-mv-b", voiceOn ? "🔊" : "🔇");
    voiceB.type = "button";
    voiceB.title = "Narrator voice";
    voiceB.setAttribute("aria-label", "Narrator voice on/off");
    const x = el("button", "ftc-mv-b ftc-mv-x", intro ? "SKIP ✕" : "✕");
    x.type = "button";
    x.setAttribute("aria-label", "Close the movie");
    top.append(name, voiceB, x);
    const bar = el("div", "ftc-mv-bar");
    const pp = el("button", "ftc-mv-b", "▶");
    pp.type = "button";
    pp.setAttribute("aria-label", "Play or pause");
    const time = el("div", "ftc-mv-time", "0:00 / " + fmt(m.duration));
    const range = el("input", "ftc-mv-range");
    range.type = "range";
    range.min = "0";
    range.max = String(m.duration);
    range.step = "0.05";
    range.value = "0";
    range.setAttribute("aria-label", "Seek");
    range.style.setProperty("--p", "0%");
    const replay = el("button", "ftc-mv-b", "⟲");
    replay.type = "button";
    replay.setAttribute("aria-label", "Replay from the start");
    bar.append(pp, time, range, replay);
    const end = el("div", "ftc-mv-end");
    const endT = el("h3", "", "");
    const again = el("button", "ftc-mv-b", "⟲ Watch again");
    again.type = "button";
    const nextB = el("button", "ftc-mv-b ftc-mv-go", "▶ Next movie");
    nextB.type = "button";
    const done = el("button", "ftc-mv-b", "Close");
    done.type = "button";
    end.append(endT, again, nextB, done);
    node.append(cv, big, top, bar, end);
    document.body.appendChild(node);

    player = {
      id, intro, node, canvas: cv, g, scale, film: null, t: 0, playing: false, ended: false,
      acc: FRAME_S, drawMs: 8, dirty: true, idle: 0, nextVoice: 0, subs: [], score: createScore(),
      els: { pp, time, range, voiceB, x, endT, nextB, name }, prevTrack: null, seeking: false,
    };
    if (inheritedTrack !== undefined) player.prevTrack = inheritedTrack;
    else { try { player.prevTrack = ctx.engine.audio.currentTrack(); } catch { player.prevTrack = null; } }
    try { ctx.engine.audio.stopMusic(); } catch { /* optional */ }

    const stop = (ev) => ev.stopPropagation();
    node.addEventListener("pointerdown", stop);
    node.addEventListener("pointermove", () => { if (player) { player.idle = 0; node.classList.remove("idle"); } });
    node.addEventListener("wheel", stop, { passive: true });
    node.addEventListener("contextmenu", (ev) => ev.preventDefault());
    tap(cv, () => { if (!player) return; if (node.classList.contains("idle")) { player.idle = 0; node.classList.remove("idle"); return; } toggle(); });
    tap(big, () => toggle());
    tap(pp, () => toggle());
    tap(x, () => closePlayer());
    tap(done, () => closePlayer());
    tap(again, () => { seek(0); setPlaying(true); });
    tap(replay, () => { seek(0); setPlaying(true); });
    tap(nextB, () => { const n = player.id + 1; if (n < COUNT && unlocked(n)) play(n); });
    tap(voiceB, () => {
      voiceOn = !voiceOn;
      voiceB.textContent = voiceOn ? "🔊" : "🔇";
      if (!voiceOn) cancelSpeech();
    });
    range.addEventListener("pointerdown", (ev) => { ev.stopPropagation(); if (player) player.seeking = true; });
    range.addEventListener("pointerup", (ev) => { ev.stopPropagation(); if (player) { player.seeking = false; seek(Number(range.value)); } });
    range.addEventListener("input", () => { if (player) seek(Number(range.value), true); });
    range.addEventListener("change", () => { if (player) { player.seeking = false; seek(Number(range.value)); } });
    // first frame: a soft black card until the film module arrives
    g.fillStyle = "#000";
    g.fillRect(0, 0, cv.width, cv.height);
    sfx("ui_open");
  }

  function attachFilm(film) {
    if (!player) return;
    player.film = film;
    player.subs = Array.isArray(film.subs) ? film.subs.filter((s) => Array.isArray(s) && s.length >= 3) : [];
    player.voice = Array.isArray(film.voice) ? film.voice.filter((v) => Array.isArray(v) && v.length >= 2).slice().sort((a, b) => a[0] - b[0]) : [];
    const m = meta(player.id);
    player.els.range.max = String(film.duration);
    player.els.name.textContent = "";
    player.els.name.append(el("small", "", m.chapter), document.createTextNode(m.title));
    player.score.load(film);
    player.dirty = true;
    setPlaying(true);
  }

  function setPlaying(on) {
    if (!player || !player.film) return;
    if (on && player.t >= player.film.duration - 0.05) seek(0);
    player.playing = !!on;
    player.ended = false;
    player.node.classList.toggle("paused", !on);
    player.node.classList.remove("ended");
    player.els.pp.textContent = on ? "❚❚" : "▶";
    if (on) {
      player.score.start(player.t);
      player.nextVoice = player.voice.findIndex((v) => v[0] >= player.t - 0.05);
      if (player.nextVoice < 0) player.nextVoice = player.voice.length;
    } else {
      player.score.pause();
      cancelSpeech();
    }
  }
  function toggle() {
    if (!player || !player.film) return;
    if (player.ended) { seek(0); setPlaying(true); return; }
    setPlaying(!player.playing);
  }
  function seek(t, dragging) {
    if (!player || !player.film) return;
    player.t = Math.max(0, Math.min(player.film.duration, t));
    player.dirty = true;
    player.ended = false;
    player.node.classList.remove("ended");
    cancelSpeech();
    player.nextVoice = player.voice.findIndex((v) => v[0] >= player.t - 0.05);
    if (player.nextVoice < 0) player.nextVoice = player.voice.length;
    if (player.playing && !dragging) player.score.start(player.t);
    else if (player.playing && dragging) player.score.pause();
    syncUi();
  }
  function syncUi() {
    if (!player || !player.film) return;
    const d = player.film.duration;
    player.els.time.textContent = `${fmt(player.t)} / ${fmt(d)}`;
    if (!player.seeking) player.els.range.value = String(player.t);
    player.els.range.style.setProperty("--p", ((player.t / d) * 100).toFixed(2) + "%");
  }
  function onEnded() {
    if (!player) return;
    player.playing = false;
    player.ended = true;
    player.score.pause();
    player.node.classList.add("ended", "paused");
    player.node.classList.remove("idle");
    player.els.pp.textContent = "▶";
    const n = player.id + 1;
    const canNext = n < COUNT && unlocked(n);
    player.els.nextB.style.display = canNext ? "" : "none";
    player.els.endT.textContent = player.id === 0 ? "Find him." : n < COUNT && !canNext ? `Find ${n * PER_MOVIE} cats for the next movie` : meta(player.id).title;
  }
  function closePlayer(silent) {
    if (!player) return;
    const p = player;
    player = null;
    cancelSpeech();
    try { p.score.close(); } catch { /* fine */ }
    p.node.remove();
    if (p.prevTrack) { try { ctx.engine.audio.playMusic(p.prevTrack); } catch { /* optional */ } }
    if (!silent) sfx("ui_close");
  }

  // ---- narrator -----------------------------------------------------------------------------------------
  let chosenVoice = null;
  function pickVoice() {
    if (chosenVoice) return chosenVoice;
    try {
      const vs = window.speechSynthesis.getVoices() || [];
      const en = vs.filter((v) => /^en/i.test(v.lang));
      const pref = [/natural/i, /Google UK English Male/i, /Daniel/i, /Google US English/i, /Samantha/i, /Microsoft (Guy|Ryan|Aria|Jenny)/i];
      for (const re of pref) { const v = en.find((x) => re.test(x.name)); if (v) { chosenVoice = v; break; } }
      if (!chosenVoice) chosenVoice = en[0] || null;
    } catch { chosenVoice = null; }
    return chosenVoice;
  }
  function speak(text, o = {}) {
    if (!voiceOn) return;
    try {
      const ss = window.speechSynthesis;
      if (!ss || typeof window.SpeechSynthesisUtterance !== "function") return;
      const u = new window.SpeechSynthesisUtterance(String(text));
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = (v && v.lang) || "en-GB";
      u.rate = Math.max(0.5, Math.min(1.5, o.rate || 0.92));
      u.pitch = Math.max(0.5, Math.min(1.6, o.pitch || 1));
      u.volume = 1;
      ss.speak(u);
    } catch { /* speech is optional */ }
  }
  function cancelSpeech() {
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch { /* fine */ }
  }
  function speaking() {
    try { return !!(window.speechSynthesis && window.speechSynthesis.speaking); } catch { return false; }
  }

  // ---- per tick ---------------------------------------------------------------------------------------
  function tickPlayer(dt) {
    const p = player;
    if (!p || !p.film) return;
    const d = p.film.duration;
    if (p.playing && !p.seeking) {
      const prev = p.t;
      p.t = Math.min(d, p.t + dt);
      if (p.t !== prev) p.dirty = true;
      while (p.nextVoice < p.voice.length && p.voice[p.nextVoice][0] <= p.t) {
        const v = p.voice[p.nextVoice++];
        if (p.t - v[0] < 1.0) speak(v[1], v[2] || {});
      }
      p.score.pump(p.t);
      p.score.setDuck(voiceOn && speaking() ? 0.62 : 1);
      p.idle += dt;
      if (p.idle > CONTROLS_IDLE_S) p.node.classList.add("idle");
      if (p.t >= d) onEnded();
    }
    p.acc += dt;
    // adaptive pacing: painting may use at most ~1/3 of the main thread, so a slow device (or a
    // software-rendered one) drops to 20, 15 or 10 fps instead of starving the game behind it
    const interval = Math.min(0.1, Math.max(FRAME_S, (p.drawMs * 3) / 1000));
    if (p.dirty && (p.acc >= interval || !p.playing)) {
      p.acc = 0;
      p.dirty = false;
      const t0 = performance.now();
      const res = drawFilm(p.g, p.film, p.t, p.scale);
      p.drawMs = p.drawMs * 0.8 + (performance.now() - t0) * 0.2;
      if (res !== true && !p.warned) { p.warned = true; console.warn(`[movies] film ${p.id} draw failed at t=${p.t.toFixed(2)}`, res); }
      // subtitles: every line is shown, fading over SUB_FADE_S at each end
      for (const s of p.subs) {
        if (p.t < s[0] || p.t > s[1]) continue;
        const a = Math.min(1, (p.t - s[0]) / SUB_FADE_S, (s[1] - p.t) / SUB_FADE_S);
        K.subtitle(p.g, LW, LH, s[2], a);
      }
      syncUi();
    }
  }

  function update(dt) {
    if (disposed) return;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
    let busy = false;
    try { busy = !!deps.isBusy(); } catch { busy = false; }
    if (introWait >= 0 && !player) {
      if (films[0].status === "idle") load(0);
      if (!busy) introWait -= step;
      if (introWait < 0) {
        if (films[0].status === "ready") play(0, { intro: true });
        else if (films[0].status === "failed") introWait = -1;
        else introWait = 0.1;
      }
    }
    if (promptQueue.length && !prompt && !player && !gallery && !busy) {
      const id = promptQueue.shift();
      if (unlocked(id)) {
        showPrompt(id);
      }
    }
    // the prompt never fetches a film by itself (WATCH NOW does): a loaded film gives its poster,
    // anything else a title card
    if (prompt && !prompt.drawn && films[prompt.id].status !== "loading") {
      prompt.drawn = true;
      try {
        if (films[prompt.id].status === "ready") renderPoster(prompt.canvas, prompt.id);
        else comingSoon(prompt.canvas, prompt.id, films[prompt.id].status === "failed");
      } catch (err) { console.warn("[movies] prompt poster", err); }
    }
    pumpPosters(step);
    try { tickPlayer(step); } catch (err) { console.warn("[movies] player", err); }
  }

  function onKey(ev) {
    if (!player) {
      if (gallery && ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); closeGallery(); }
      return;
    }
    const k = ev.key;
    if (k === "Escape") { closePlayer(); }
    else if (k === " " || k === "k" || k === "K") { toggle(); }
    else if (k === "ArrowLeft" && player.film) { seek(player.t - 5); }
    else if (k === "ArrowRight" && player.film) { seek(player.t + 5); }
    else if (k === "m" || k === "M") { voiceOn = !voiceOn; player.els.voiceB.textContent = voiceOn ? "🔊" : "🔇"; if (!voiceOn) cancelSpeech(); }
    else { ev.stopPropagation(); return; }
    ev.preventDefault();
    ev.stopPropagation();
  }
  function onKeyUp(ev) { if (player) ev.stopPropagation(); }
  function onVis() { if (document.hidden && player && player.playing) setPlaying(false); }
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onKeyUp, true);
  document.addEventListener("visibilitychange", onVis);
  refreshBadge();

  return {
    update, openGallery, onCount,
    play: (id) => play(id),
    isOpen: () => (player ? "movie" : prompt ? "movie-prompt" : gallery ? "movies" : null),
    // a hidden unlock prompt is re-queued (it comes back once nothing else is open), never lost
    closeAll() { if (prompt) promptQueue = [prompt.id]; closePlayer(true); closePrompt(); closeGallery(true); },
    hasNew,
    dispose() {
      disposed = true;
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("visibilitychange", onVis);
      closePlayer(true);
      closePrompt();
      closeGallery(true);
      style.remove();
      K.clearCaches();
    },
    debug: {
      list: () => films.map((r) => ({ id: r.id, status: r.status, title: meta(r.id).title, chapter: meta(r.id).chapter, unlocked: unlocked(r.id), seen: seen[r.id] === "1", err: r.err })),
      loaded: (id) => !!(films[id] && films[id].status === "ready"),
      // renders film `id` at time t into `canvas` (any size, 16:9 is best); resolves to the draw ms
      renderAt(id, t, canvas) {
        return load(id).then((f) => {
          if (!f || !canvas) return -1;
          const t0 = performance.now();
          const res = drawFilm(canvas.getContext("2d"), f, t, canvas.width / LW);
          return res === true ? performance.now() - t0 : -1;
        });
      },
      state: () => ({
        open: player ? "movie" : prompt ? "movie-prompt" : gallery ? "movies" : null,
        playing: !!(player && player.playing), id: player ? player.id : null, t: player ? player.t : 0,
        seen, prompt: prompt ? prompt.id : null, queued: promptQueue.slice(), badge: hasNew(),
      }),
    },
  };
}
