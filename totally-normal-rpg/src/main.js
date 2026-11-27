// main.js - boot, ctx, init order (CONTRACT 2), window.__tnrpg base hooks (CONTRACT 13).
// Modules are loaded with dynamic import() so a missing or broken module never black-screens the game.
import * as THREE from "./engine/three.js";
import { createBus } from "./engine/bus.js";
import { createState } from "./engine/state.js";

const ctx = { THREE, bus: createBus(), state: createState(), scene: null, camera: null, renderer: null,
  engine: null, save: null, audio: null, ui: null, world: null, combat: null, story: null, events: null };
const errors = [];
window.__tnrpg = {
  ctx, errors, ready: false,
  state() { try { return JSON.parse(JSON.stringify(ctx.state)); } catch (e) { return null; } }
};
window.addEventListener("error", (e) => { if (errors.length < 200) errors.push("error: " + (e.message || String(e.error))); });
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason;
  if (errors.length < 200) errors.push("rejection: " + (r && r.message ? r.message : String(r)));
});

const boot = document.getElementById("boot");
function bootText(t, err) {
  if (!boot) return;
  const p = boot.querySelector("p");
  if (p) p.textContent = t;
  if (err) boot.classList.add("err");
}

async function step(key, path) {
  try {
    const mod = await import(path);
    if (!mod || typeof mod.init !== "function") throw new Error(path + " has no init()");
    const api = await mod.init(ctx);
    ctx[key] = api || null;
    return api;
  } catch (e) {
    console.error("[main] init " + key + " failed", e);
    errors.push("init " + key + ": " + (e && e.message ? e.message : String(e)));
    return null;
  }
}

(async () => {
  ctx.engine = await step("engine", "./engine/index.js");     // sets ctx.scene / ctx.camera / ctx.renderer too
  if (!ctx.engine) { bootText("This browser could not start the 3D view (WebGL). Try another browser.", true); return; }
  await step("save", "./combat/save.js");                     // loads localStorage into ctx.state
  await step("audio", "./audio/index.js");
  await step("ui", "./ui/index.js");                          // title screen shows now
  if (boot) { boot.classList.add("done"); setTimeout(() => boot.remove(), 700); }
  await step("world", "./world/index.js");
  await step("combat", "./combat/index.js");
  await step("story", "./story/index.js");
  await step("events", "./events/index.js");
  try { ctx.engine.vegetation.scatter(); } catch (e) { console.error("[main] scatter", e); errors.push("scatter: " + e.message); }
  ctx.engine.start();
  window.__tnrpg.ready = true;
  ctx.bus.emit("game:ready", {});
})();
