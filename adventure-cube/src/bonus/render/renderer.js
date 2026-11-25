// render/renderer.js - ALL bonus-level drawing (BONUS_RENDER owns; API frozen: BONUS.md 9.1). DOM.
//
//   const r = createBonusRenderer(canvas)
//   r.setGame(G)              // new/loaded game: (re)bake caches, subscribe to G.bus; unsubscribes the previous game
//   r.frame(view)             // view = { G, camera, alpha, time, dt, cssW, cssH, paused }
//   r.drawIcon(ctx, id, x, y, size)   // item icon into ANY 2D context (hotbar, panels), x/y = top-left css px
//   r.drawHouse(ctx, level, x, y, w, h, opts) // house level 0..20 fitted into the box (HOUSE panel), any ctx
//   r.destroy()               // unsubscribe + drop caches
//
// Frame pipeline (UHD 620 budget): sky + biome parallax on the main canvas (a few drawImages) -> the world on one
// offscreen layer (baked terrain chunks, trees, house, objects, animals, cube, water, particles) -> ONE low-res
// darkness map composited over the world layer ("source-atop": the sky stays untouched) -> glowing things (flames,
// lit windows, ore glints, embers, fireworks) -> target highlight -> world layer onto the main canvas -> screen fx.
// No per-frame full-screen 'lighter', no animated blur, gradients cached. Extra API (compatible): r.stats().
import { T, PW, PH, PLOT_W } from "../core/const.js";
import { sun, dayF } from "../core/time.js";
import { TILE_DEFS, OBJECT_DEFS, TREE_DEFS } from "../data/tiles.js";
import { ITEMS } from "../data/items.js";
import { houseLevel } from "../data/house.js";
import { hasPerk } from "../house/index.js";
import { invSelected } from "../craft/inventory.js";
import { makeCanvas, clamp, glowSprite, shadowSprite, TAU } from "./kit.js";
import { createTerrain } from "./terrain.js";
import { createSky } from "./sky.js";
import { createLight } from "./light.js";
import { createFx, FX, chipIndex } from "./fx.js";
import { createTrees } from "./trees.js";
import { createObjects } from "./objects.js";
import { createAnimals } from "./animals.js";
import { createHouse } from "./house.js";
import { createHero } from "./hero.js";
import { bakeIcon } from "./icons.js";

const BIOME_P = ["meadow", "forest", "pinewood", "hills", "forest"]; // river -> forest parallax
const TILE_CHIP = ["", "dirt", "grass", "stone", "coal", "iron", "gold", "crystal", "clay", "sand", "gravel", "glass", "bedrock", "plank", "stone", "brick", "glass", "stone", "snow"];

export function createBonusRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let G = null;
  const offs = [];
  const fx = createFx();
  const terrain = createTerrain(), sky = createSky(), light = createLight();
  const trees = createTrees(fx, FX), objects = createObjects(fx, FX), animals = createAnimals(fx, FX), house = createHouse();
  const iconCache = new Map();
  const iconWorld = (id) => iconFor(id, 64);
  const hero = createHero(iconWorld);
  let wl = makeCanvas(8, 8), w = wl.getContext("2d");
  let vign = null, vignKey = "", hurtVign = null;
  let hurtFlash = 0, sleepT = 0, faintA = 0, celebrate = 0, fireworksT = 0, lastLevel = -1, buildSparkT = 0;
  let quality = 1, slowT = 0, fastT = 0, frameAvg = 16;
  const timings = { total: 0, sky: 0, world: 0, light: 0, glow: 0 };
  const glints = [];
  const tasks = []; // idle-time warm-up bakes
  let lastTime = 0, zz = 0;

  function iconFor(id, px) {
    const b = px <= 24 ? 24 : px <= 32 ? 32 : px <= 48 ? 48 : px <= 64 ? 64 : px <= 96 ? 96 : 128;
    const k = id + "|" + b;
    let c = iconCache.get(k);
    if (!c) { c = bakeIcon(id, b); iconCache.set(k, c); }
    return c;
  }

  // ------------------------------------------------------------------ game binding
  function setGame(g) {
    for (const f of offs) f(); offs.length = 0;
    G = g;
    if (!G) return;
    terrain.setGame(G);
    fx.clear();
    lastLevel = G.house ? G.house.level : 0;
    const on = (t, f) => offs.push(G.bus.on(t, f));
    on("tile", (d) => terrain.onTile(d.tx, d.ty));
    on("tile:hit", (d) => {
      const cx = (d.tx + 0.5) * T, cy = (d.ty + 0.5) * T, c = chipIndex(TILE_CHIP[d.tile] || "stone");
      const px = G.player.x + PW / 2, side = px < cx ? -1 : 1;
      for (let i = 0; i < 5; i++) fx.emit(FX.chip, cx + side * 12, cy + (Math.random() - 0.5) * 14, side * (40 + Math.random() * 120), -60 - Math.random() * 140, 0.8, 4 + Math.random() * 3, c);
      fx.emit(FX.dust, cx + side * 14, cy, side * 30, -10, 0.7, 22, c);
      if (d.tile >= 3 && d.tile <= 7 || d.tile === 14 || d.tile === 15 || d.tile === 17) for (let i = 0; i < 3; i++) fx.emit(FX.spark, cx + side * 14, cy + (Math.random() - 0.5) * 10, side * (80 + Math.random() * 160), -80 - Math.random() * 120, 0.35, 6, 0);
    });
    on("tile:break", (d) => {
      const cx = (d.tx + 0.5) * T, cy = (d.ty + 0.5) * T, c = chipIndex(TILE_CHIP[d.tile] || "stone");
      for (let i = 0; i < 12; i++) fx.emit(FX.chip, cx + (Math.random() - 0.5) * 24, cy + (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 220, -80 - Math.random() * 180, 1, 4 + Math.random() * 4, c);
      for (let i = 0; i < 4; i++) fx.emit(FX.dust, cx + (Math.random() - 0.5) * 20, cy + (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 50, -20, 1, 30 + Math.random() * 16, c);
      if (d.tile === 6 || d.tile === 7) for (let i = 0; i < 8; i++) fx.emit(FX.sparkle, cx + (Math.random() - 0.5) * 30, cy + (Math.random() - 0.5) * 30, 0, -30, 0.9, 12, 0);
    });
    on("tile:tooHard", (d) => { const cx = (d.tx + 0.5) * T, cy = (d.ty + 0.5) * T; for (let i = 0; i < 6; i++) fx.emit(FX.spark, cx, cy, (Math.random() - 0.5) * 260, -60 - Math.random() * 160, 0.3, 7, 0); });
    on("tree:hit", (d) => trees.onHit(d.tree, G.player.x + PW / 2));
    on("tree:fall", (d) => trees.onFall(d.tree, d.dir));
    on("tree:tooHard", (d) => { const cx = (d.tree.x + 0.5) * T, cy = d.tree.y * T - 18; for (let i = 0; i < 5; i++) fx.emit(FX.spark, cx, cy, (Math.random() - 0.5) * 200, -100, 0.3, 6, 0); });
    on("tree:plant", (d) => puffAt((d.tree.x + 0.5) * T, d.tree.y * T - 6, 4, 2));
    on("tree:grow", (d) => { const cx = (d.tree.x + 0.5) * T, cy = d.tree.y * T - 20; for (let i = 0; i < 5; i++) fx.emit(FX.sparkle, cx + (Math.random() - 0.5) * 40, cy - Math.random() * 60, 0, -20, 1, 10, 0); });
    on("obj:hit", (d) => { const o = d.obj, def = OBJECT_DEFS[o.kind] || { w: 1 }; const cx = (o.x + def.w / 2) * T, cy = (o.y + 0.5) * T; const c = o.kind === "boulder" ? chipIndex("stone") : o.kind === "bush" || o.kind === "tallgrass" || o.kind === "flowers" ? chipIndex("leaf") : chipIndex("wood"); for (let i = 0; i < 5; i++) fx.emit(o.kind === "bush" || o.kind === "tallgrass" ? FX.leaf : FX.chip, cx, cy, (Math.random() - 0.5) * 160, -60 - Math.random() * 120, 0.9, 6, o.kind === "bush" ? 1 : c); });
    on("obj:break", (d) => { const o = d.obj, def = OBJECT_DEFS[o.kind] || { w: 1 }; puffAt((o.x + def.w / 2) * T, (o.y + 0.5) * T, 8, 1); });
    on("obj:place", (d) => { const o = d.obj, def = OBJECT_DEFS[o.kind] || { w: 1 }; puffAt((o.x + def.w / 2) * T, (o.y + 1) * T - 4, 6, 2); });
    on("obj:regrow", (d) => { const o = d.obj; for (let i = 0; i < 4; i++) fx.emit(FX.sparkle, (o.x + 0.5) * T + (Math.random() - 0.5) * 24, (o.y + 0.5) * T, 0, -16, 0.8, 9, 0); });
    on("harvest", (d) => { if (d.obj) { const o = d.obj; for (let i = 0; i < 6; i++) fx.emit(FX.chip, (o.x + 0.5) * T, (o.y + 0.5) * T, (Math.random() - 0.5) * 120, -100 - Math.random() * 80, 0.8, 5, chipIndex("berry")); } });
    on("place", (d) => { if (ITEMS[d.id] && ITEMS[d.id].block) puffAt((d.tx + 0.5) * T, (d.ty + 1) * T - 4, 5, 2); });
    on("pickup", () => hero.an.pop());
    on("player:jump", (d) => { hero.an.jump(); if (!d.water) puffAt(G.player.x + PW / 2, G.player.y + PH, 3, 2); });
    on("player:land", (d) => { hero.an.land(d.impact || 4); if ((d.impact || 0) > 6) for (let i = 0; i < 5; i++) fx.emit(FX.dust, d.x + (Math.random() - 0.5) * 20, d.y - 2, (Math.random() - 0.5) * 80, -10 - Math.random() * 20, 0.6, 16, chipIndex("dirt")); });
    on("player:splash", (d) => { for (let i = 0; i < 10; i++) fx.emit(FX.drop, d.x + (Math.random() - 0.5) * 20, d.y, (Math.random() - 0.5) * 140, -120 - Math.random() * 160, 1, 6, 0); fx.emit(FX.ring, d.x, d.y + 6, 0, 0, 0.8, 30, 0); });
    on("player:hurt", () => { hurtFlash = 1; });
    on("player:die", (d) => puffAt(d.x, d.y, 8, 1));
    on("player:respawn", (d) => { faintA = Math.max(faintA, 1); for (let i = 0; i < 10; i++) fx.emit(FX.sparkle, d.x + (Math.random() - 0.5) * 40, d.y + (Math.random() - 0.5) * 40, 0, -30, 1, 12, 0); });
    on("animal:die", (d) => animals.onDie(d.a, d.x, d.y, d.kind));
    on("animal:attack", (d) => animals.onAttack(d.a));
    on("animal:hit", (d) => { const a = d.a; for (let i = 0; i < 4; i++) fx.emit(FX.dust, a.x + a.w / 2, a.y + a.h / 2, (Math.random() - 0.5) * 80, -40, 0.5, 14, chipIndex("white")); fx.emit(FX.sparkle, a.x + a.w / 2, a.y + a.h * 0.3, 0, -10, 0.35, 16, 0); });
    on("shoot", () => {});
    on("craft", () => hero.an.pop());
    on("player:eat", (d) => { const p = G.player; for (let i = 0; i < 6; i++) fx.emit(FX.chip, p.x + PW / 2 + p.facing * 12, p.y + PH * 0.6, p.facing * 40 + (Math.random() - 0.5) * 60, -60 - Math.random() * 60, 0.6, 4, chipIndex(d.raw ? "berry" : "wood")); hero.an.pop(); });
    on("sleep", (d) => { if (d.start) sleepT = 1.8; });
    on("house:upgrade", (d) => {
      celebrate = 2.5;
      if (d.level >= 20 && !d.debug) fireworksT = 9; else if (d.level >= 20) fireworksT = 4;
      house.get(d.level);
    });
    on("garden:ripe", () => {});
    // warm-up bakes in idle frames
    tasks.length = 0;
    const near = new Set(); for (const t of G.world.trees) if (Math.abs(t.x - G.player.x / T) < 120) near.add(t.kind);
    tasks.push(() => house.get(G.house.level));
    for (const k of near) tasks.push(() => trees.warm([k]));
    tasks.push(() => animals.warm(["rabbit", "deer", "pheasant"]));
    tasks.push(() => sky.warm(["meadow"])); tasks.push(() => sky.warm(["forest"])); tasks.push(() => sky.warm(["pinewood"])); tasks.push(() => sky.warm(["hills"]));
    tasks.push(() => animals.warm(["boar", "wolf", "goat", "bear", "fish"]));
  }
  function puffAt(x, y, n, col) { for (let i = 0; i < n; i++) fx.emit(FX.puff, x + (Math.random() - 0.5) * 16, y + (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 60, -20 - Math.random() * 30, 0.7, 16 + Math.random() * 10, col); }

  function ensureLayer(dw, dh) {
    if (wl.width !== dw || wl.height !== dh) { wl.width = dw; wl.height = dh; w = wl.getContext("2d"); }
  }
  function vignette(cssW, cssH) {
    const key = cssW + "x" + cssH;
    if (vignKey !== key) {
      vignKey = key;
      vign = makeCanvas(256, 256); let g = vign.getContext("2d");
      let gr = g.createRadialGradient(128, 128, 60, 128, 128, 182); gr.addColorStop(0, "rgba(8,12,4,0)"); gr.addColorStop(1, "rgba(8,12,4,0.42)"); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      hurtVign = makeCanvas(256, 256); g = hurtVign.getContext("2d");
      gr = g.createRadialGradient(128, 128, 70, 128, 128, 182); gr.addColorStop(0, "rgba(200,20,10,0)"); gr.addColorStop(1, "rgba(200,20,10,0.7)"); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    }
  }

  // ------------------------------------------------------------------ the frame
  function frame(view) {
    const g = view.G || G; if (!g) return;
    if (g !== G) setGame(g);
    const t0 = performance.now();
    const cam = view.camera, cssW = view.cssW, cssH = view.cssH, k = canvas.width / Math.max(1, cssW), z = cam.zoom;
    const time = view.time || 0, dt = Math.min(0.1, Math.max(0, view.dt || 0.016));
    const s = sun(G), f = dayF(G), night = clamp((0.8 - s) / 0.65, 0, 1);
    const p = G.player, alpha = view.alpha == null ? 1 : view.alpha;
    // auto quality: drop the world layer to 3/4 resolution when frames are slow for a while
    frameAvg += ((dt * 1000) - frameAvg) * 0.05;
    if (frameAvg > 21 && !view.paused) { slowT += dt; fastT = 0; if (slowT > 3 && quality > 0.75) { quality = 0.75; slowT = 0; } }
    else { slowT = 0; }
    const q = quality, dw = Math.round(canvas.width * q), dh = Math.round(canvas.height * q);
    ensureLayer(dw, dh);
    const a = k * z * q;                                    // world px -> layer px
    const e = k * q * (cssW / 2 - cam.x * z), ff = k * q * (cssH / 2 - cam.y * z);
    terrain.setScale(clamp(Math.round(k * z * 4) / 4, 0.75, 2));
    const vx0 = cam.x - cam.halfW, vx1 = cam.x + cam.halfW, vy0 = cam.y - cam.halfH, vy1 = cam.y + cam.halfH;
    const tx0 = Math.floor(vx0 / T) - 1, tx1 = Math.ceil(vx1 / T) + 1, ty0 = Math.floor(vy0 / T) - 1, ty1 = Math.ceil(vy1 / T) + 1;
    fx.update(dt);
    trees.update(dt);

    // ---- 1. sky + parallax (main canvas, css px) ----
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    const tS = performance.now();
    const skyVisible = vy0 < (G.world.H * T) && minSurfaceInView(tx0, tx1) * T > vy0;
    if (skyVisible) sky.draw(ctx, cssW, cssH, cam, f, s, biomeWeights(cam.x), time);
    else { ctx.fillStyle = "#0a0806"; ctx.fillRect(0, 0, cssW, cssH); }
    timings.sky = performance.now() - tS;

    // ---- 2. world layer ----
    const tW = performance.now();
    w.setTransform(1, 0, 0, 1, 0, 0); w.globalCompositeOperation = "source-over"; w.globalAlpha = 1;
    w.clearRect(0, 0, dw, dh);
    w.setTransform(a, 0, 0, a, e, ff);
    w.imageSmoothingEnabled = true;
    const wd = G.world;
    // house
    const hx = wd.houseX * T, hy = wd.houseY * T, lvl = G.house.level | 0;
    if (lvl !== lastLevel) { lastLevel = lvl; }
    let H = null;
    if (hx + (PLOT_W + 4) * T > vx0 && hx - 4 * T < vx1) H = house.draw(w, hx, hy, lvl, G.house.buildT == null ? 9999 : G.house.buildT);
    // trees
    trees.draw(w, wd.trees, tx0, tx1, time);
    // terrain chunks
    const nb = terrain.drawChunks(w, tx0, ty0, tx1, ty1, 3);
    terrain.drawCracks(w, tx0, ty0, tx1, ty1, TILE_DEFS);
    // house live bits that sit in front of the wall (garden produce)
    if (H) houseFront(w, H.e.meta, hx, hy, time, G.house);
    // objects
    const solidAt = (x, y) => terrain.SOLIDISH[terrain.get(x, y)] === 1;
    objects.draw(w, wd.objects, tx0, tx1, time, solidAt);
    // drops
    drawDrops(w, wd.drops, vx0, vx1, time);
    // animals
    animals.draw(w, G.animals || [], alpha, time, dt, vx0, vx1, night);
    // projectiles
    drawArrows(w, G.projectiles || [], alpha);
    // the cube
    const px = p.ox + (p.x - p.ox) * alpha + PW / 2, py = p.oy + (p.y + p.smoothY - p.oy) * alpha + PH / 2;
    const sel = invSelected(G.inv), selId = sel ? sel.id : null;
    const crown = hasPerk(G, "crown");
    w.drawImage(shadowSprite(), px - 16, py + PH / 2 - 5, 32, 9);
    const flame = hero.draw(w, G, px, py, view, selId, crown);
    // water in front
    terrain.drawWater(w, tx0, ty0, tx1, ty1, time);
    // particles (normal)
    fx.draw(w, a, e, ff, vx0, vy0, vx1, vy1, false);
    w.setTransform(a, 0, 0, a, e, ff);
    if (H && H.front != null) buildFront(w, hx, H.front, H.e, time);
    timings.world = performance.now() - tW;

    // ---- 3. darkness ----
    const tL = performance.now();
    const lit = s < 0.999 || ty1 > minSurfaceInView(tx0, tx1) + 2;
    if (lit) {
      light.build(tx0 - 1, ty0 - 1, tx1 - tx0 + 3, ty1 - ty0 + 3, terrain.openTop, wd.W, wd.H, solidAt, s, f, wd.surface);
      const fl = 0.92 + Math.sin(time * 9) * 0.04 + Math.sin(time * 23) * 0.03;
      for (const L of wd.lights || []) light.punch(L.x, L.y, L.r * (L.kind === "campfire" || L.kind === "torch" ? fl : 1), 1);
      if (flame) light.punch(flame[0], flame[1], (selId && ITEMS[selId] && ITEMS[selId].light) || 5, 1);
      light.punch(px, py, 2.4, 0.55);
      if (H) houseLights(H.e.meta, hx, hy, night, fl);
      terrain.oreGlints(tx0, ty0, tx1, ty1, glints);
      for (let i = 0; i < glints.length; i += 3) if (glints[i + 2] === 7) light.punch((glints[i] + 0.5) * T, (glints[i + 1] + 0.5) * T, 2.2, 0.6);
      light.composite(w, a, e, ff);
    } else glints.length = 0;
    timings.light = performance.now() - tL;

    // ---- 4. glow pass ----
    const tG = performance.now();
    w.setTransform(a, 0, 0, a, e, ff);
    objects.drawGlow(w, wd.objects, tx0, tx1, time, night, solidAt, true);
    if (H) houseGlow(w, H.e.meta, hx, hy, time, night, lvl);
    if (flame) heldFlame(w, flame[0], flame[1], time, night, selId);
    oreGlow(w, time, night);
    w.globalCompositeOperation = "lighter";
    fx.draw(w, a, e, ff, vx0, vy0, vx1, vy1, true);
    w.globalCompositeOperation = "source-over";
    w.setTransform(a, 0, 0, a, e, ff);
    animals.drawEyes(w, night);
    w.setTransform(a, 0, 0, a, e, ff);
    ambient(dt, vx0, vx1, vy0, vy1, night, s);
    timings.glow = performance.now() - tG;
    // ---- 5. target highlight + placement ghost ----
    drawTarget(w, time);

    // ---- 6. compose ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(wl, 0, 0, canvas.width, canvas.height);
    // ---- 7. screen effects (css px) ----
    ctx.setTransform(k, 0, 0, k, 0, 0);
    vignette(cssW, cssH);
    if (p.inWater) { ctx.fillStyle = "rgba(30,90,140,0.16)"; ctx.fillRect(0, 0, cssW, cssH); }
    ctx.globalAlpha = 0.85; ctx.drawImage(vign, 0, 0, cssW, cssH); ctx.globalAlpha = 1;
    if (hurtFlash > 0.01) { ctx.globalAlpha = hurtFlash; ctx.drawImage(hurtVign, 0, 0, cssW, cssH); ctx.globalAlpha = 1; hurtFlash *= Math.exp(-dt * 3.5); }
    if (p.dead) faintA = Math.max(faintA, Math.min(1, 1 - (p.deadT || 0) / 90) * 0.95);
    else if (faintA > 0) faintA = Math.max(0, faintA - dt * 1.4);
    if (faintA > 0.01) { ctx.fillStyle = `rgba(6,4,10,${faintA.toFixed(3)})`; ctx.fillRect(0, 0, cssW, cssH); }
    if (sleepT > 0) {
      const u = sleepT; sleepT -= dt;
      const al = u > 1.4 ? (1.8 - u) / 0.4 : u > 0.7 ? 1 : u / 0.7;
      ctx.fillStyle = `rgba(4,6,16,${clamp(al, 0, 1).toFixed(3)})`; ctx.fillRect(0, 0, cssW, cssH);
      if (al > 0.5) { ctx.fillStyle = `rgba(220,230,255,${((al - 0.5) * 2).toFixed(3)})`; ctx.font = "600 28px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("z z z", cssW / 2, cssH / 2); }
    }
    if (celebrate > 0) celebrate -= dt;
    if (fireworksT > 0) { fireworksT -= dt; if (Math.random() < dt * 2.2) firework(hx + (4 + Math.random() * 16) * T, hy - (10 + Math.random() * 10) * T); }
    // idle-time warm-up
    if (tasks.length && performance.now() - t0 < 9 && nb === 0) { const tk = tasks.shift(); try { tk(); } catch (err) { console.error(err); } }
    timings.total = performance.now() - t0;
    lastTime = time;
  }

  // lowest (smallest row) generated surface in the view (to skip the sky when deep underground)
  function minSurfaceInView(x0, x1) {
    const s = G.world.surface; let m = 1e9;
    for (let x = Math.max(0, x0); x <= Math.min(G.world.W - 1, x1); x += 2) if (s[x] < m) m = s[x];
    return m === 1e9 ? 0 : m;
  }
  const wts = {};
  function biomeWeights(cx) {
    for (const b of BIOME_P) wts[b] = 0;
    const b = G.world.biome, W = G.world.W, c = Math.floor(cx / T); let n = 0;
    for (let x = c - 24; x <= c + 24; x += 3) { const i = Math.max(0, Math.min(W - 1, x)); wts[BIOME_P[b[i]] || "forest"] += 1; n++; }
    for (const k2 in wts) wts[k2] /= n;
    return wts;
  }

  // ------------------------------------------------------------------ pieces
  function drawDrops(c, drops, vx0, vx1, t) {
    const sh = shadowSprite();
    for (const d of drops) {
      if (d.x < vx0 - 20 || d.x > vx1 + 20) continue;
      const bob = Math.sin(t * 3 + d.id) * 2, cx = d.x + 6, cy = d.y + 6;
      c.globalAlpha = 0.7; c.drawImage(sh, cx - 9, d.y + 10, 18, 5); c.globalAlpha = 1;
      c.drawImage(iconFor(d.item, 32), cx - 9, cy - 11 + bob, 18, 18);
      if (d.n > 1) { c.fillStyle = "rgba(255,255,255,0.9)"; c.beginPath(); c.arc(cx + 7, cy + 3 + bob, 2, 0, TAU); c.fill(); }
    }
  }
  function drawArrows(c, ps, alpha) {
    for (const q of ps) {
      const x = q.ox == null ? q.x : q.ox + (q.x - q.ox) * alpha, y = q.oy == null ? q.y : q.oy + (q.y - q.oy) * alpha;
      const ang = Math.atan2(q.vy || 0, q.vx || 1);
      c.save(); c.translate(x, y); c.rotate(ang);
      c.strokeStyle = "#c8a46a"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-14, 0); c.lineTo(4, 0); c.stroke();
      c.fillStyle = "#9a9a96"; c.beginPath(); c.moveTo(8, 0); c.lineTo(3, -2.6); c.lineTo(3, 2.6); c.closePath(); c.fill();
      c.fillStyle = "#e8e2d0"; c.beginPath(); c.moveTo(-14, 0); c.lineTo(-18, -3.5); c.lineTo(-11, 0); c.lineTo(-18, 3.5); c.closePath(); c.fill();
      c.restore();
    }
  }
  function houseFront(c, M, hx, hy, t, h) {
    const ready = (h.garden && h.garden.ready) | 0;
    M.garden.forEach((b, i) => {
      const x = hx + b.x, y = hy + b.y, ripe = i < ready;
      for (let k2 = 0; k2 < 4; k2++) {
        const fx0 = x + 5 + k2 * (b.w - 10) / 3, sway = Math.sin(t * 1.8 + i + k2) * 0.8;
        if (ripe) {
          if ((i + k2) % 2) { c.fillStyle = "#3f7a24"; c.beginPath(); c.ellipse(fx0 + sway, y - 4, 3.2, 3, 0, 0, TAU); c.fill(); for (const [bx, by] of [[-1.5, -5], [1.5, -3.5], [0, -2.5]]) { c.fillStyle = "#c2334a"; c.beginPath(); c.arc(fx0 + bx + sway, y + by, 1.3, 0, TAU); c.fill(); } }
          else { c.strokeStyle = "#5f9a36"; c.lineWidth = 1.2; for (const a2 of [-0.4, 0, 0.4]) { c.beginPath(); c.moveTo(fx0, y); c.lineTo(fx0 + Math.sin(a2) * 7 + sway, y - 8); c.stroke(); } c.fillStyle = "#ee8a2a"; c.fillRect(fx0 - 1.6, y - 1, 3.2, 3); }
        } else { c.fillStyle = "#4f8a2e"; c.beginPath(); c.ellipse(fx0 + sway * 0.5, y - 1.5, 2, 1.4, 0, 0, TAU); c.fill(); }
      }
    });
    // banners (cloth waves)
    for (const bn of M.banners) {
      const x = hx + bn.x, y = hy + bn.y;
      if (bn.pennant || bn.flag) {
        const len = bn.w, hh = bn.h;
        c.fillStyle = bn.col; c.beginPath(); c.moveTo(x, y);
        for (let i = 0; i <= 8; i++) { const u = i / 8; c.lineTo(x + u * len, y + Math.sin(t * 5 - u * 4) * 3 * u + (bn.pennant ? u * hh * 0.5 : 0)); }
        for (let i = 8; i >= 0; i--) { const u = i / 8; c.lineTo(x + u * len, y + (bn.pennant ? hh * (1 - u) * 0.5 + u * hh * 0.5 : hh) + Math.sin(t * 5 - u * 4) * 3 * u); }
        c.closePath(); c.fill();
        if (bn.gold) { c.fillStyle = "#e8c050"; c.fillRect(x + 2, y + hh * 0.4, len * 0.7, 3); }
      } else {
        c.fillStyle = bn.col;
        c.beginPath(); c.moveTo(x, y);
        c.lineTo(x + bn.w, y);
        for (let i = 0; i <= 6; i++) { const u = i / 6; c.lineTo(x + bn.w + Math.sin(t * 2 + u * 3) * 1.5 * u, y + u * bn.h); }
        c.lineTo(x + bn.w / 2, y + bn.h * 0.82); c.lineTo(x, y + bn.h);
        for (let i = 6; i >= 0; i--) { const u = i / 6; c.lineTo(x + Math.sin(t * 2 + u * 3) * 1.5 * u, y + u * bn.h); }
        c.closePath(); c.fill();
        c.fillStyle = "rgba(0,0,0,0.18)"; c.fillRect(x + bn.w * 0.7, y, bn.w * 0.3, bn.h * 0.8);
        if (bn.emblem === "cube") { c.fillStyle = "#e8c050"; c.fillRect(x + bn.w / 2 - 6, y + bn.h * 0.3, 12, 12); c.fillStyle = "#3a2410"; c.fillRect(x + bn.w / 2 - 3, y + bn.h * 0.3 + 4, 2, 2); c.fillRect(x + bn.w / 2 + 1, y + bn.h * 0.3 + 4, 2, 2); }
        else if (bn.emblem === "bear") { c.fillStyle = "#e8c050"; c.beginPath(); c.arc(x + bn.w / 2, y + bn.h * 0.42, 7, 0, TAU); c.fill(); c.beginPath(); c.arc(x + bn.w / 2 - 6, y + bn.h * 0.42 - 6, 2.6, 0, TAU); c.arc(x + bn.w / 2 + 6, y + bn.h * 0.42 - 6, 2.6, 0, TAU); c.fill(); }
      }
    }
    // chimney smoke
    if (h.level >= 3) for (const ch of M.chimneys) if (Math.random() < 0.09) fx.emit(FX.smoke, hx + ch.x + (Math.random() - 0.5) * 6, hy + ch.y, 6 + Math.random() * 8, -22 - Math.random() * 10, 4 + Math.random() * 2, 20 + Math.random() * 10, Math.random() < 0.5 ? 0 : 1);
  }
  function houseLights(M, hx, hy, night, fl) {
    // wall torches / lamps light a few tiles (overlapping holes add up, so a big house keeps them modest)
    for (const fi of M.fires) light.punch(hx + fi.x, hy + fi.y, (fi.torch ? 3.6 : fi.oven ? 4 : 7) * fl, fi.torch ? 0.8 : 1);
    for (const L of M.lamps) light.punch(hx + L.x, hy + L.y, L.crystal ? 5 : 4, 0.75);
    // windows only lift the darkness a little around themselves (the warm look comes from houseGlow's additive halo);
    // at most the 6 lowest ones, so a big keep stays a dark, lamplit silhouette instead of daylit stone
    if (night > 0.05) {
      const ws = M.windows.length > 6 ? (M._lowWin || (M._lowWin = M.windows.slice().sort((a, b) => b.y - a.y).slice(0, 6))) : M.windows;
      for (const wn of ws) light.punch(hx + wn.x + wn.w / 2, hy + wn.y + wn.h / 2, 0.9 + 0.5 * wn.w / T, 0.3 * night);
    }
    for (const cr of M.crystals) light.punch(hx + cr.x, hy + cr.y, 4, 0.6);
  }
  function houseGlow(c, M, hx, hy, t, night, lvl) {
    const halo = glowSprite(128, "#ffb050", 0.5);
    for (const fi of M.fires) {
      const x = hx + fi.x, y = hy + fi.y, sc = fi.s;
      c.globalCompositeOperation = "lighter"; c.globalAlpha = (0.3 + 0.5 * night) * Math.min(1, sc + 0.3); c.drawImage(halo, x - 70 * sc, y - 12 - 70 * sc, 140 * sc, 140 * sc);
      c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
      objects.flame(c, x, y, 22 * sc + 4, 7 * sc + 1, t, fi.x);
      if (!fi.torch && Math.random() < 0.06) fx.emit(FX.ember, x + (Math.random() - 0.5) * 8, y - 12 * sc, (Math.random() - 0.5) * 16, -40, 1.3, 4, 0);
    }
    // windows warm at night (the hearth glows a little all day from level 5)
    const wa = lvl >= 5 ? Math.max(night, 0.0) : night * 0.5;
    if (wa > 0.02) {
      for (const wn of M.windows) {
        const x = hx + wn.x, y = hy + wn.y, flick = 0.92 + Math.sin(t * 3 + wn.x) * 0.05;
        c.globalAlpha = wa * 0.85 * flick;
        c.fillStyle = wn.crystal ? "#9ff0ff" : wn.warm || "#ffcf7a";
        c.beginPath(); if (wn.arch) { c.moveTo(x, y + wn.h); c.lineTo(x, y + wn.w / 2); c.arc(x + wn.w / 2, y + wn.w / 2, wn.w / 2, Math.PI, 0); c.lineTo(x + wn.w, y + wn.h); c.closePath(); } else c.rect(x, y, wn.w, wn.h); c.fill();
        c.fillStyle = "rgba(90,50,20,0.55)"; c.fillRect(x + wn.w / 2 - 1.2, y, 2.4, wn.h); c.fillRect(x, y + wn.h * (wn.arch ? 0.55 : 0.5) - 1.2, wn.w, 2.4);
        c.globalCompositeOperation = "lighter"; c.globalAlpha = wa * 0.35;
        c.drawImage(wn.crystal ? glowSprite(128, "#7fe0ff", 0.5) : halo, x + wn.w / 2 - wn.w * 1.3, y + wn.h / 2 - wn.h * 1.3, wn.w * 2.6, wn.h * 2.6);
        c.globalCompositeOperation = "source-over";
      }
      c.globalAlpha = 1;
    }
    for (const L of M.lamps) {
      const x = hx + L.x, y = hy + L.y;
      c.globalCompositeOperation = "lighter"; c.globalAlpha = 0.2 + 0.6 * night;
      c.drawImage(L.crystal ? glowSprite(128, "#7fe0ff", 0.5) : glowSprite(128, "#ffd27a", 0.45), x - 30, y - 30, 60, 60);
      c.globalCompositeOperation = "source-over"; c.globalAlpha = 0.6 + 0.4 * night;
      c.fillStyle = L.crystal ? "#c8f8ff" : "#fff0b0"; c.fillRect(x - 3, y - 5, 6, 10); c.globalAlpha = 1;
    }
    if (M.crystals.length) {
      c.globalCompositeOperation = "lighter";
      for (let i = 0; i < M.crystals.length; i++) {
        const cr = M.crystals[i], ph = Math.sin(t * 1.7 + i * 1.3);
        c.globalAlpha = 0.25 + 0.2 * ph + 0.3 * night;
        c.drawImage(glowSprite(128, i % 3 === 0 ? "#ff9ad8" : i % 3 === 1 ? "#9affd8" : "#9ad8ff", 0.5), hx + cr.x - 40, hy + cr.y - 40, 80, 80);
      }
      c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
      if (Math.random() < 0.15) { const cr = M.crystals[(Math.random() * M.crystals.length) | 0]; fx.emit(FX.sparkle, hx + cr.x + (Math.random() - 0.5) * 30, hy + cr.y + (Math.random() - 0.5) * 40, 0, -10, 1, 12, 0); }
    }
  }
  function buildFront(c, hx, frontY, e, t) {
    // scaffolding line + dust along the rising build front
    const x0 = hx - 1 * T, x1 = hx + (PLOT_W + 1) * T;
    c.fillStyle = "#a07850";
    c.fillRect(x0 + 2 * T, frontY - 4, x1 - x0 - 4 * T, 4);
    for (let x = x0 + 2 * T; x < x1 - 2 * T; x += 64) c.fillRect(x, frontY - 4, 4, 40);
    if (Math.random() < 0.7) fx.emit(FX.dust, x0 + 2 * T + Math.random() * (x1 - x0 - 4 * T), frontY, (Math.random() - 0.5) * 40, -10, 0.9, 26, chipIndex("plank"));
    if (Math.random() < 0.4) fx.emit(FX.sparkle, x0 + 2 * T + Math.random() * (x1 - x0 - 4 * T), frontY - Math.random() * 30, 0, -20, 0.7, 12, 0);
    if (Math.random() < 0.3) fx.emit(FX.chip, x0 + 2 * T + Math.random() * (x1 - x0 - 4 * T), frontY - 6, (Math.random() - 0.5) * 100, -120, 0.8, 5, chipIndex("plank"));
  }
  function heldFlame(c, x, y, t, night, id) {
    if (id === "lantern") {
      c.globalCompositeOperation = "lighter"; c.globalAlpha = 0.3 + 0.5 * night; c.drawImage(glowSprite(128, "#ffd27a", 0.45), x - 34, y - 34, 68, 68);
      c.globalCompositeOperation = "source-over"; c.globalAlpha = 1; return;
    }
    c.globalCompositeOperation = "lighter"; c.globalAlpha = 0.3 + 0.5 * night; c.drawImage(glowSprite(128, "#ffb050", 0.5), x - 40, y - 40, 80, 80);
    c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
    objects.flame(c, x, y + 4, 11, 3, t, 7);
    if (Math.random() < 0.05) fx.emit(FX.ember, x, y - 6, (Math.random() - 0.5) * 10, -30, 0.9, 3, 0);
  }
  function oreGlow(c, t, night) {
    if (!glints.length) return;
    const gs = glowSprite(64, "#7fe0ff", 0.5), gg = glowSprite(32, "#fff2a0", 0.4);
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < glints.length; i += 3) {
      const x = glints[i], y = glints[i + 1], cd = glints[i + 2], h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      if (cd === 7) { c.globalAlpha = 0.18 + 0.12 * Math.sin(t * 1.5 + (h % 7)) + 0.25 * night; c.drawImage(gs, x * T - 8, y * T - 8, T + 16, T + 16); }
      const ph = (t * 0.7 + (h % 100) / 100) % 1;
      if (ph < 0.12) { const sx = x * T + 6 + (h % 20), sy = y * T + 6 + ((h >> 5) % 20), sz = Math.sin(ph / 0.12 * Math.PI) * 10; c.globalAlpha = 0.9; c.drawImage(gg, sx - sz / 2, sy - sz / 2, sz, sz); }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
  }
  function ambient(dt, vx0, vx1, vy0, vy1, night, s) {
    const p = G.player, ty = Math.floor((p.y + PH) / T), tx = Math.floor((p.x + PW / 2) / T);
    const above = ty <= G.world.surface[Math.max(0, Math.min(G.world.W - 1, tx))] + 1;
    if (!above) { if (Math.random() < dt * 3) fx.emit(FX.dust, vx0 + Math.random() * (vx1 - vx0), vy0 + Math.random() * (vy1 - vy0), 4, 2, 3, 6, chipIndex("white")); return; }
    if (night > 0.6 && Math.random() < dt * 4) { // fireflies
      const x = vx0 + Math.random() * (vx1 - vx0), sx = Math.floor(x / T), sy = G.world.surface[Math.max(0, Math.min(G.world.W - 1, sx))];
      fx.emit(FX.sparkle, x, sy * T - 10 - Math.random() * 70, (Math.random() - 0.5) * 20, -4, 2.5, 7, 0);
    }
    if (s > 0.7 && Math.random() < dt * 2) { // drifting leaves near trees
      const x = vx0 + Math.random() * (vx1 - vx0), sx = Math.floor(x / T), b = G.world.biome[Math.max(0, Math.min(G.world.W - 1, sx))];
      if (b === 1 || b === 2) fx.emit(FX.leaf, x, vy0 + Math.random() * (vy1 - vy0) * 0.4, 20 + Math.random() * 20, 10, 4, 7, (Math.random() * 6) | 0);
    }
  }
  function firework(x, y) {
    fx.emit(FX.firework, x, y, 0, 0, 0.3, 24, 6);
    const col = (Math.random() * 8) | 0, n = 46;
    for (let i = 0; i < n; i++) { const an = (i / n) * TAU, v = 160 + Math.random() * 60; fx.emit(FX.firework, x, y, Math.cos(an) * v, Math.sin(an) * v, 1.3 + Math.random() * 0.5, 9, (col + (i % 3 === 0 ? 1 : 0)) % 8); }
  }
  function drawTarget(c, t) {
    const tg = G.target, p = G.player;
    if (!tg || p.dead) return;
    const pulse = 0.55 + Math.sin(t * 5) * 0.2;
    c.lineWidth = 1.6;
    const box = (x, y, ww, hh, r = 5) => {
      c.strokeStyle = "rgba(0,0,0,0.35)"; c.beginPath(); rr(c, x + 1, y + 1.5, ww, hh, r); c.stroke();
      c.strokeStyle = `rgba(255,255,240,${pulse.toFixed(3)})`; c.beginPath(); rr(c, x, y, ww, hh, r); c.stroke();
    };
    if (tg.kind === "tile") box(tg.tx * T + 1, tg.ty * T + 1, T - 2, T - 2);
    else if (tg.kind === "tree" && tg.tree) {
      const tr = tg.tree, def = TREE_DEFS[tr.kind] || { h: 3 }, hh = tr.stage >= 3 ? 3 : tr.stage === 2 ? 2 : 1, ww = tr.kind === "ancient" ? 3 : 1;
      box((tr.x - (ww - 1) / 2) * T + 3, (tr.y - hh) * T, ww * T - 6, hh * T - 2, 8);
    } else if (tg.kind === "object" && tg.obj) { const d = OBJECT_DEFS[tg.obj.kind] || { w: 1, h: 1 }; box(tg.obj.x * T + 1, (tg.obj.y + 1 - d.h) * T + 1, d.w * T - 2, d.h * T - 2); }
    if (tg.place) {
      const sel = invSelected(G.inv);
      if (sel) {
        const d = ITEMS[sel.id] && ITEMS[sel.id].place && OBJECT_DEFS[ITEMS[sel.id].place];
        const ww = d ? d.w : 1, hh = d ? d.h : 1;
        c.globalAlpha = 0.5; c.drawImage(iconFor(sel.id, 64), tg.place.tx * T + (ww * T - T) / 2, (tg.place.ty + 1) * T - T, T, T); c.globalAlpha = 1;
        c.setLineDash([4, 4]); c.strokeStyle = "rgba(150,255,150,0.85)"; c.lineWidth = 1.4; c.strokeRect(tg.place.tx * T + 2, (tg.place.ty + 1 - hh) * T + 2, ww * T - 4, hh * T - 4); c.setLineDash([]);
      }
    }
  }
  function rr(c, x, y, ww, hh, r) {
    c.moveTo(x + r, y); c.lineTo(x + ww - r, y); c.arcTo(x + ww, y, x + ww, y + r, r); c.lineTo(x + ww, y + hh - r); c.arcTo(x + ww, y + hh, x + ww - r, y + hh, r);
    c.lineTo(x + r, y + hh); c.arcTo(x, y + hh, x, y + hh - r, r); c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
  }

  // ------------------------------------------------------------------ icons + house preview (any context)
  function drawIcon(c, id, x, y, size) {
    if (!ITEMS[id] || !(size > 0)) return;
    const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    const tf = c.getTransform ? c.getTransform() : null, sc = tf ? Math.hypot(tf.a, tf.b) : 1;
    const px = Math.ceil(size * Math.max(1, sc > 1.01 ? sc : dpr));
    const img = iconFor(id, Math.min(128, px));
    const was = c.imageSmoothingEnabled; c.imageSmoothingEnabled = true;
    c.drawImage(img, x, y, size, size);
    c.imageSmoothingEnabled = was;
  }
  function drawHouse(c, level, x, y, ww, hh) {
    const lv = Math.max(0, Math.min(20, level | 0));
    house.preview(c, lv, x, y, ww, hh);
  }

  return {
    setGame, frame, drawIcon, drawHouse,
    destroy() { for (const f of offs) f(); offs.length = 0; G = null; terrain.clear(); house.clear(); iconCache.clear(); fx.clear(); },
    get game() { return G; },
    stats() { return { quality, chunks: terrain.count, particles: fx.count, icons: iconCache.size, timings: Object.assign({}, timings) }; },
  };
}
