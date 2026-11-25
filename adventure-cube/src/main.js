// main.js - boot, the `app` context, screen switching, the rAF loop and the window.__cube debug seam. INTEGRATE owns.
// The `app` shape is frozen (CONTRACT.md section 10). INTEGRATE additions: app.attract (the living title backdrop),
// app.forceTouch (settings: always show touch buttons), app.areas (area select screen: app.areas.play(id)).
// Deep links: ?level=<community level id> plays that level; ?area=area1|area2|area3 plays an unlocked area.
import { createRenderer } from "./render/renderer.js";
import { createAudio } from "./audio/engine.js";
import { createInput } from "./input.js";
import * as online from "./online.js";
import { rateAsync } from "./ai/rate-client.js";
import { createPlayScreen } from "./game.js";
import { createTitleScreen, createAreasScreen, createAttract, applySettings } from "./ui/menu.js";
import { createBuilderScreen } from "./builder/editor.js";
import { createBrowseScreen } from "./builder/browse.js";
import { AREAS, loadArea } from "./levels/index.js";
import testLevel from "./levels/test.js";
import { T, PW, PH } from "./sim/constants.js";

const canvas = document.getElementById("game");
const ui = document.getElementById("ui");
const PROG_KEY = "adventurecube.progress.v1";

const storage = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* blocked */ } },
};

const input = createInput(document.getElementById("touch"));
const app = {
  canvas, ui, storage, online, input,
  renderer: createRenderer(canvas),
  audio: createAudio(),
  rate: (level, opts) => rateAsync(level, opts),
  viewW: 960, viewH: 540,
  sim: null,              // the live sim while the play screen is active
  forceTouch: false,
  screens: {}, current: null, currentName: "",
  progress: {
    get() {
      const p = Object.assign({ done: {}, best: {}, unlockAll: false }, storage.get(PROG_KEY, {}) || {});
      if (!p.done || typeof p.done !== "object") p.done = {};
      if (!p.best || typeof p.best !== "object") p.best = {};
      return p;
    },
    complete(id, ms) { const p = app.progress.get(); p.done[id] = true; if (!p.best[id] || ms < p.best[id]) p.best[id] = ms; storage.set(PROG_KEY, p); },
  },
  show(name, params) {
    if (app.current && app.current.exit) { try { app.current.exit(); } catch (e) { console.error(e); } }
    app.current = app.screens[name]; app.currentName = name;
    if (app.current && app.current.enter) app.current.enter(params || {});
  },
  // playLevel(level, { key, onExit(result), onWin(result), ...game.js extras })
  playLevel(level, opts = {}) { app.show("play", Object.assign({ level }, opts)); },
  // screens without their own world view call this to keep a living background behind their DOM
  drawBackdrop(dt, now) { app.attract.frame(dt, now, 0); },
};
// touch buttons honour the "always show" setting
const setActive0 = input.setActive.bind(input);
input.setActive = (on, force = false) => setActive0(on, force || app.forceTouch);

app.attract = createAttract(app);
app.screens.title = createTitleScreen(app);
app.screens.areas = app.areas = createAreasScreen(app);
app.screens.play = createPlayScreen(app);
app.screens.builder = createBuilderScreen(app);
app.screens.browse = createBrowseScreen(app);
applySettings(app);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  app.viewW = w; app.viewH = h;
  app.renderer.resize(w, h, window.devicePixelRatio || 1);
  app.attract.resize();
  for (const s of Object.values(app.screens)) if (s.resize) s.resize();
}
window.addEventListener("resize", resize);
resize();

const unlock = () => app.audio.unlock();
window.addEventListener("pointerdown", unlock, { capture: true });
window.addEventListener("keydown", unlock, { capture: true });

// storm background lightning -> thunder, delayed like real thunder (closer flashes = sooner, louder)
app.renderer.onFlash = (strength) => {
  if (app.currentName !== "play") return;
  const s = Math.max(0, Math.min(1, +strength || 0.5));
  app.audio.sfx("thunder", { vol: 0.35 + s * 0.6, at: 0.25 + (1 - s) * 1.4, impact: s });
};

let last = performance.now(), fps = 60, fpsAcc = 0, fpsN = 0, worst = 0, worstShown = 0;
function loop(now) {
  const raw = (now - last) / 1000; last = now;
  const dt = Math.min(0.25, raw);
  fpsAcc += dt; fpsN++; if (raw > worst) worst = raw;
  if (fpsAcc >= 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; worstShown = worst; worst = 0; }
  try { if (app.current && app.current.frame) app.current.frame(dt, now); }
  catch (e) { console.error(e); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---- debug / test seam (used by tools/playtest.cjs; safe to leave in production) ----
async function resolveLevel(lv) { return typeof lv === "string" ? (lv === "test" ? testLevel : await loadArea(lv)) : lv; }
window.__cube = {
  app,
  get sim() { return app.sim; },
  state() {
    const s = app.sim && app.sim.state;
    const base = { screen: app.currentName, fps: Math.round(fps), worstMs: Math.round(worstShown * 1000) };
    if (!s) return base;
    return Object.assign(base, {
      level: app.sim.level.name, frame: s.frame, x: s.x, y: s.y, tx: Math.floor((s.x + PW / 2) / T), ty: Math.floor((s.y + PH / 2) / T),
      vx: s.vx, vy: s.vy, grounded: s.grounded, dead: s.dead, deaths: s.deaths, won: s.won, winFrame: s.winFrame, cp: s.cp,
    });
  },
  // put the player's feet on tile (tx, ty+1)'s top, centered in column tx
  teleport(tx, ty) {
    const s = app.sim && app.sim.state; if (!s) return false;
    s.x = (tx + 0.5) * T - PW / 2; s.y = (ty + 1) * T - PH; s.vx = 0; s.vy = 0; s.ride = -1; s.grounded = false; return true;
  },
  setInput(bits) { app.input.setOverride(bits); },
  // loadLevel(level object | "area1" | "area2" | "area3" | "test", opts) -> Promise, starts play mode
  async loadLevel(lv, opts = {}) {
    app.playLevel(await resolveLevel(lv), Object.assign({ key: null }, opts));
    return true;
  },
  // replay(level | id, inputs, speed = 1, opts): play a recorded input tape (e.g. the AI rater's route)
  async replay(lv, inputs, speed = 1, opts = {}) {
    app.playLevel(await resolveLevel(lv), Object.assign({ key: null }, opts, { replay: Uint8Array.from(inputs), speed }));
    return true;
  },
  playArea: (id) => app.areas.play(id),
  show: (name, params) => app.show(name, params),
};

// ---- boot: deep links, else the title
(async () => {
  const q = new URLSearchParams(location.search);
  const lid = q.get("level"), aid = q.get("area");
  if (lid && /^[a-z0-9]{8}$/.test(lid)) {
    app.show("title");
    const r = await app.online.getLevel(lid);
    if (r.ok) { app.playLevel(r.level, { key: lid, difficulty: r.meta && r.meta.difficulty, sub: "Community level by " + (r.level.author || "someone"), title: r.level.name, exitLabel: "Community", onExit: () => app.show("browse", { open: lid }) }); return; }
    app.show("browse", {});
    return;
  }
  if (aid && AREAS.some((a) => a.id === aid)) {
    const p = app.progress.get(), i = AREAS.findIndex((a) => a.id === aid);
    if (i === 0 || p.done[AREAS[i - 1].id] || p.unlockAll) { app.show("title"); app.areas.play(aid); return; }
  }
  app.show("title");
})();
