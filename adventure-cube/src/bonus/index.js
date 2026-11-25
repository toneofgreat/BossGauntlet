// bonus/index.js - the BONUS LEVEL screen (CORE owns; API frozen: BONUS.md 8). DOM.
//   import { createBonusScreen, startBonus } from "./bonus/index.js"
//   app.screens.bonus = createBonusScreen(app)      screen protocol (CONTRACT.md 10): enter(params) exit() frame() resize()
//   startBonus(app, params)                          = app.show("bonus", params) once registered
// params: { seed?: number|string (new world seed), fresh?: bool (ignore + replace the save), onExit?: () => void }
// Main menu routing/unlock lives in src/main.js + src/ui/menu.js (INTEGRATE). main.js loads this module lazily.
import { STEP_MS, T, PW, PH, B_ACTION, SAVE_KEY, SAVE_VERSION } from "./core/const.js";
import { createGame, stepGame } from "./core/game.js";
import { readSave, writeSave, clearSave } from "./core/save.js";
import { createBonusInput } from "./core/input.js";
import { createHud } from "./core/hud.js";
import { installDebug } from "./core/debug.js";
import { createCamera } from "../render/camera.js";
import { createBonusRenderer } from "./render/renderer.js";
import { createBonusAudio } from "./audio/index.js";
import { createCraftUI } from "./craft/ui.js";
import { createHouseUI } from "./house/ui.js";
import { invSelect, HOTBAR } from "./craft/inventory.js";
import { goHome } from "./house/index.js";

export const VIEW_TILES_BONUS = 17; // the shorter screen side shows ~17 tiles (a bit wider than the platformer)

export function createBonusScreen(app) {
  let G = null, renderer = null, audio = null, input = null, hud = null, uis = [], unbind = [], root = null;
  let acc = 0, active = false, params = {}, speed = 1, lastSave = 0, overrideBits = null, overrideAim;
  let noSave = false; // true while the slot holds a world this version cannot load (newer/damaged): never write over it
  const camera = createCamera();
  camera.fitZoom = () => Math.max(0.5, Math.min(camera.viewH, camera.viewW) / (VIEW_TILES_BONUS * T));
  const panels = new Map();
  const listeners = [];
  const on = (t, e, f, o) => { t.addEventListener(e, f, o); listeners.push([t, e, f, o]); };

  // ---- the ctx every bonus UI module receives (BONUS.md 8.1) ----
  const ctx = {
    app,
    get G() { return G; },
    get renderer() { return renderer; },
    get audio() { return audio; },
    get input() { return input; },
    get root() { return root; },
    get isTouch() { return app.input.isTouch || app.forceTouch; },
    panel: null,
    registerPanel(name, h) { panels.set(name, h); },
    openPanel(name, data) {
      if (ctx.panel) { const h = panels.get(ctx.panel); ctx.panel = null; if (h) h.close(); }
      if (!name || !panels.has(name)) { setTouch(); return; }
      ctx.panel = name; panels.get(name).open(data || {});
      if (input) { input.release(B_ACTION); input.clearAim(); }
      setTouch();
      app.audio.sfx("click", { vol: 0.5 });
    },
    closePanel() { ctx.openPanel(null); },
    toast(text, ms) { if (hud) hud.toast(text, ms); },
    save() { if (G && !noSave && writeSave(app.storage, G)) { lastSave = performance.now(); return true; } return false; },
  };
  const setTouch = () => app.input.setActive(active && !ctx.panel);

  function bindGame(g) {
    for (const f of unbind) f(); unbind = [];
    for (const u of uis) u.destroy(); uis = [];
    G = g;
    renderer.setGame(G); audio.setGame(G);
    unbind.push(...hud.bind(G));
    unbind.push(G.bus.on("ui:open", (d) => ctx.openPanel(d.panel, d)));
    unbind.push(G.bus.on("autosave", () => ctx.save()));
    unbind.push(G.bus.on("house:upgrade", () => { if (!G.headless) ctx.save(); }));
    uis.push(createCraftUI(ctx), createHouseUI(ctx));
    const p = G.player;
    camera.setViewport(app.viewW, app.viewH);
    camera.snap(worldBox(), p.x + PW / 2, p.y + PH / 2);
    acc = 0;
  }
  const worldBox = () => ({ w: G.world.W, h: G.world.H });
  function newWorld(seed) {
    noSave = false; // an explicit "New world" replaces whatever the slot held
    clearSave(app.storage);
    const s = seed == null ? (Math.random() * 1e9) >>> 0 : seed;
    bindGame(createGame({ seed: s }));
    ctx.save();
    audio.start();
  }
  function onKey(e) {
    if (e.code === "Escape" || e.code === "KeyP") { ctx.openPanel(ctx.panel ? null : "pause"); return true; }
    if (e.code === "KeyE" || e.code === "KeyI" || e.code === "Tab") { ctx.openPanel(ctx.panel === "craft" ? null : "craft"); return true; }
    if (e.code === "KeyH") { ctx.openPanel(ctx.panel === "house" ? null : "house"); return true; }
    return false;
  }
  function onHotbar(i) {
    if (!G) return;
    if (i === "+1") invSelect(G.inv, G.inv.sel + 1); else if (i === "-1") invSelect(G.inv, G.inv.sel - 1); else invSelect(G.inv, i);
  }
  function quit() {
    ctx.save();
    if (params.onExit) params.onExit(); else app.show("title");
  }

  const screen = {
    get active() { return active; },
    enter(p) {
      params = p || {};
      active = true;
      root = document.createElement("div"); root.className = "bz-root";
      app.ui.appendChild(root);
      document.body.classList.toggle("bz-touch", !!ctx.isTouch);
      renderer = createBonusRenderer(app.canvas);
      audio = createBonusAudio(app);
      input = createBonusInput(app, { onKey, onHotbar });
      hud = createHud(ctx, { quit, home: () => { if (G && goHome(G)) { ctx.closePanel(); camera.snap(worldBox(), G.player.x + PW / 2, G.player.y + PH / 2); } }, newWorld: () => { ctx.closePanel(); newWorld(); }, settings: () => import("../ui/menu.js").then((m) => m.openSettings && m.openSettings(app)) });
      noSave = false;
      let raw = null; try { raw = app.storage.get(SAVE_KEY, null); } catch (e) { raw = null; }
      const saved = params.fresh ? null : readSave(app.storage);
      let g = null, blocked = null;
      if (saved) { try { g = createGame({ save: saved }); } catch (e) { console.error("bonus save unreadable", e); g = null; blocked = "damaged"; } }
      else if (!params.fresh && raw && typeof raw === "object") blocked = (raw.v | 0) > SAVE_VERSION ? "newer" : "damaged";
      if (blocked) {
        // keep the slot untouched (plus a backup copy) and play a temporary world until the player picks "New world"
        noSave = true;
        try { app.storage.set(SAVE_KEY + ".backup", raw); } catch (e) { /* storage full: the slot itself is still intact */ }
      }
      if (!g) { if (params.fresh) clearSave(app.storage); g = createGame({ seed: params.seed == null ? (Math.random() * 1e9) >>> 0 : params.seed }); }
      bindGame(g);
      if (!blocked && (!saved || params.fresh)) ctx.save();
      audio.start();
      on(window, "blur", () => { if (!ctx.panel) ctx.openPanel("pause"); });
      on(document, "visibilitychange", () => { if (document.hidden) { ctx.save(); if (!ctx.panel) ctx.openPanel("pause"); } });
      on(window, "pagehide", () => ctx.save());
      setTouch();
      installDebug(screen, ctx);
      if (blocked) ctx.toast(blocked === "newer" ? "Your saved world was made by a newer version of the game, so it is kept safe and not loaded. This is a practice world that will not be saved; choose New world in the pause menu to replace the old one." : "Your saved world could not be loaded, so it is kept safe and not overwritten. This is a practice world that will not be saved; choose New world in the pause menu to replace the old one.", 9000);
      else if (!G.flags.hello) { G.flags.hello = 1; ctx.toast(ctx.isTouch ? "Tap a tree (or HIT) to chop it!" : "Walk to a tree and hold J (or click it) to chop!", 4000); }
    },
    exit() {
      ctx.save();
      active = false;
      if (ctx.panel) { const h = panels.get(ctx.panel); ctx.panel = null; if (h) h.close(); }
      for (const [t, e, f, o] of listeners) t.removeEventListener(e, f, o); listeners.length = 0;
      for (const f of unbind) f(); unbind = [];
      for (const u of uis) u.destroy(); uis = [];
      panels.clear();
      if (hud) hud.destroy(); hud = null;
      if (input) input.destroy(); input = null;
      if (audio) audio.stop(); audio = null;
      if (renderer) renderer.destroy(); renderer = null;
      if (root) root.remove(); root = null;
      document.body.classList.remove("bz-touch");
      app.input.setActive(false);
      G = null;
    },
    resize() { camera.setViewport(app.viewW, app.viewH); },
    frame(dt, now) {
      if (!active || !G) return;
      const pad = input.padEdges();
      if (pad.start) ctx.openPanel(ctx.panel === "craft" ? null : "craft");
      if (pad.lb) onHotbar("-1"); if (pad.rb) onHotbar("+1");
      if (!ctx.panel) {
        acc = Math.max(0, acc) + Math.max(0, Math.min(dt, 0.1)) * 1000 * speed;
        let n = 0;
        while (acc >= STEP_MS && n < 8 * speed) {
          const bits = overrideBits !== null ? overrideBits : input.bits();
          const aim = overrideAim !== undefined ? overrideAim : input.aim(camera);
          stepGame(G, bits, aim);
          acc -= STEP_MS; n++;
        }
        if (acc > STEP_MS * 4) acc = 0;
      }
      const a = ctx.panel ? 1 : Math.min(1, acc / STEP_MS), p = G.player;
      const px = p.ox + (p.x - p.ox) * a + PW / 2, py = p.oy + (p.y + p.smoothY - p.oy) * a + PH / 2;
      camera.follow(worldBox(), px, py, p.vx, dt);
      renderer.frame({ G, camera, alpha: a, time: now / 1000, dt, cssW: app.viewW, cssH: app.viewH, paused: !!ctx.panel });
      audio.frame(dt);
      hud.frame(G);
      for (const u of uis) u.frame(dt);
    },
    // ---- test seam helpers (core/debug.js) ----
    get G() { return G; },
    get camera() { return camera; },
    get ctx() { return ctx; },
    setSpeed(n) { speed = Math.max(1, Math.min(16, n | 0)); },
    setOverride(bits, aim) { overrideBits = bits === null || bits === undefined ? null : bits | 0; overrideAim = aim; },
    newWorld,
    load(save) { noSave = false; bindGame(createGame({ save })); audio.start(); },
    get noSave() { return noSave; },
    get lastSave() { return lastSave; },
  };
  return screen;
}

export function startBonus(app, params) {
  if (!app.screens.bonus) app.screens.bonus = createBonusScreen(app);
  app.show("bonus", params || {});
}
export { HOTBAR };
