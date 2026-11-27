// engine/index.js - builds the renderer, look (sky, light, atmosphere, postfx, materials, terrain, vegetation, water),
// physics, the player (input/touch/controller/camera) and the frame loop. CONTRACT 5.
// export async function init(ctx) -> engine

import { createRenderer, createNoiseTexture } from "./renderer.js";
import { createLoop } from "./loop.js";
import { createQuality } from "./quality.js";
import { createPostfx } from "./postfx.js";
import { createSky } from "./sky.js";
import { createLighting } from "./lighting.js";
import { installHeightFog, createAtmosphere } from "./atmosphere.js";
import { createMaterials } from "./materials.js";
import { createTerrain } from "./terrain.js";
import { createPhysics } from "./physics.js";
import { createWater } from "./water.js";
import { createVegetation } from "./vegetation.js";
import { initPlayer } from "../player/index.js";

function pushErr(msg) {
  try { const g = window.__tnrpg; if (g) { if (!g.errors) g.errors = []; if (g.errors.length < 200) g.errors.push(msg); } } catch (e) { /* ignore */ }
}

export async function init(ctx, opts) {
  const o = opts || {};
  const THREE = ctx.THREE;
  const state = ctx.state, bus = ctx.bus;
  installHeightFog(THREE);

  let canvas = document.getElementById("game");
  if (!canvas) { canvas = document.createElement("canvas"); canvas.id = "game"; document.body.prepend(canvas); }
  const R = createRenderer(THREE, canvas);
  const loop = createLoop(ctx);

  const engine = {
    ctx, loop,
    renderer: R.renderer, scene: R.scene, camera: R.camera,
    devMode: !!o.devMode,
    get time() { return loop.time; },
    get realTime() { return loop.realTime; },
    addSystem: (name, fn, priority = 50) => loop.addSystem(name, fn, priority),
    every: (sec, fn) => loop.every(sec, fn),
    after: (sec, fn) => loop.after(sec, fn),
    yieldFrame: () => loop.yieldFrame(),
    start: null,
    debug: {}
  };
  ctx.engine = engine;
  ctx.scene = R.scene; ctx.camera = R.camera; ctx.renderer = R.renderer;

  const quality = createQuality(ctx);
  engine.quality = quality;
  quality.applySetting(state.settings.quality);
  engine.noiseTexture = createNoiseTexture(THREE);
  engine.materials = createMaterials(THREE, engine);
  const postfx = createPostfx(THREE, engine);
  engine.postfx = postfx;
  const sky = createSky(THREE, engine, engine.noiseTexture);
  R.scene.add(sky.mesh);
  engine.sky = sky;
  const lighting = createLighting(THREE, engine);
  engine.lighting = lighting;
  const atmosphere = createAtmosphere(THREE, engine, sky, lighting, postfx);
  engine.atmosphere = atmosphere;

  // ---- quality -> renderer
  function applyQuality() {
    const p = quality.params;
    const dpr = window.devicePixelRatio || 1;
    R.setPixelRatio(Math.min(p.prCap, quality.level === 0 ? 0.75 : quality.level === 1 ? 1 : dpr));
    lighting.setShadowSize(p.shadow, p.shadowRadius);
    postfx.setQuality(p);
  }
  R.onResize((w, h, pr) => postfx.setSize(w, h, pr));
  quality.onChange(applyQuality);
  applyQuality();
  R.apply();

  // ---- world ground
  const terrain = createTerrain(THREE, engine);
  engine.terrain = terrain;
  await terrain.build();
  const physics = createPhysics(THREE, terrain);
  engine.physics = physics;
  physics.setKillY("main", -60);
  for (const r of ["desert", "forest", "hollowDesert", "none"]) physics.setKillY(r, -40);
  const water = createWater(THREE, engine);
  engine.water = water;
  try { water.build(); } catch (e) { console.warn("[engine] water", e); pushErr("water: " + e.message); }
  const vegetation = createVegetation(THREE, engine);
  engine.vegetation = vegetation;

  // ---- player
  initPlayer(ctx, engine);
  engine.player.teleport({ x: 0, y: 0, z: 4 }, 0);

  // ---- look API
  let region = "main";
  engine.setAtmosphere = (id, op) => { try { atmosphere.set(id, op); } catch (e) { console.warn("[engine] atmosphere", e); } };
  engine.pushAtmosphere = (tag, id, op) => { try { atmosphere.push(tag, id, op); } catch (e) { console.warn("[engine] atmosphere", e); } };
  engine.popAtmosphere = (tag, op) => { try { atmosphere.pop(tag, op); } catch (e) { console.warn("[engine] atmosphere", e); } };
  engine.showRegion = (r) => {
    region = r || "main";
    terrain.showRegion(region);
    vegetation.showRegion(region);
    water.setVisible(region === "main");
    lighting.markEnvDirty();
  };
  Object.defineProperty(engine, "region", { get: () => region });
  engine.showRegion("main");
  atmosphere.set("title", { dur: 0 });
  atmosphere.snap();

  // ---- per-frame visual systems
  engine.addSystem("environment", (dt, t) => {
    try { vegetation.update(dt, t); } catch (e) { warnOnce("vegetation", e); }
    try { water.update(dt, t); } catch (e) { warnOnce("water", e); }
  }, 55);

  const warned = {};
  function warnOnce(k, e) { if (!warned[k]) { warned[k] = true; console.warn("[engine] " + k, e); pushErr(k + ": " + (e && e.message)); } }

  // fps overlay
  let fpsEl = null, fpsAcc = 0, fpsFrames = 0, fpsShown = 0;
  function fpsOverlay(on) {
    if (on && !fpsEl) {
      fpsEl = document.createElement("div");
      fpsEl.id = "fps";
      document.body.appendChild(fpsEl);
    }
    if (fpsEl) fpsEl.style.display = on ? "block" : "none";
  }
  fpsOverlay(!!state.settings.showFps);

  const stats = { fps: 60, ms: 16.7, calls: 0, tris: 0 };
  let frameNo = 0;
  engine.addSystem("render", () => {
    const rdt = loop.realDt;
    frameNo++;
    try { atmosphere.update(rdt); } catch (e) { warnOnce("atmosphere", e); }
    postfx.update(rdt);
    // title: the opaque title card is on top, keep the 3D cheap
    const title = state.ui.screen === "title" && !engine.devMode;
    if (title && frameNo % 3 !== 0) return;
    const cam = R.camera;
    sky.update(cam, engine.time);
    lighting.follow(engine.camera3p ? engine.camera3p.focusPoint : cam.position);
    R.renderer.info.reset();
    postfx.render(R.scene, cam);
    const info = R.renderer.info.render;
    stats.calls = info.calls; stats.tris = info.triangles;
    stats.ms = loop.frameMs; stats.fps = 1000 / Math.max(1, loop.frameMs);
    if (!title && !state.rt.paused) quality.sample(rdt * 1000, rdt);
    if (fpsEl && state.settings.showFps) {
      fpsAcc += rdt; fpsFrames++;
      if (fpsAcc >= 0.5) {
        fpsShown = Math.round(fpsFrames / fpsAcc);
        fpsEl.textContent = fpsShown + " fps  q" + quality.level + "  " + stats.calls + " dc";
        fpsAcc = 0; fpsFrames = 0;
      }
    }
  }, 100);

  // ---- settings / run state
  bus.on("settings:change", (p) => {
    try {
      if (!p) return;
      if (p.key === "quality") quality.applySetting(p.value);
      else if (p.key === "showFps") fpsOverlay(!!p.value);
    } catch (e) { console.warn("[engine]", e); }
  });
  bus.on("run:reset", () => {
    try {
      postfx.reset();
      atmosphere.clearOverrides();
      state.rt.timeScale = 1;
    } catch (e) { console.warn("[engine]", e); }
  });
  bus.on("game:start", () => {
    try { quality.applySetting(state.settings.quality); fpsOverlay(!!state.settings.showFps); } catch (e) { console.warn("[engine]", e); }
  });

  // ---- start
  let started = false;
  engine.start = () => {
    if (started) return;
    started = true;
    try { R.renderer.compile(R.scene, R.camera); } catch (e) { console.warn("[engine] compile", e); }
    loop.start();
  };

  // ---- debug hooks (CONTRACT 5.10 / 13)
  const dbg = {
    fastTime(mult) { state.rt.fast = Math.max(1, Math.min(120, +mult || 1)); return state.rt.fast; },
    fps() { return Math.round(1000 / Math.max(1, loop.frameMs)); },
    teleportTo(x, y, z) {
      try {
        const r = terrain.regionAt(x, z);
        if (r !== "none" && r !== region) engine.showRegion(r);
        let yy = y;
        if (yy == null || isNaN(yy)) { const g = physics.groundAt(x, z, 1e4); yy = g.y > -1e8 ? g.y : 0; }
        engine.player.teleport({ x, y: yy, z });
        return true;
      } catch (e) { console.warn("[engine] teleportTo", e); return false; }
    },
    quality(l) { quality.applySetting(l == null ? "auto" : l); return quality.level; },
    frameStats() { return { fps: Math.round(stats.fps), ms: +stats.ms.toFixed(2), calls: stats.calls, tris: stats.tris }; }
  };
  engine.debug = dbg;
  try {
    const g = window.__tnrpg || (window.__tnrpg = { ctx });
    Object.assign(g, dbg);
  } catch (e) { /* ignore */ }

  return engine;
}
