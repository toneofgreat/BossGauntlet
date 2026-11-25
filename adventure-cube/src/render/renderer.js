// renderer.js - Adventure Cube's renderer (RENDER owns src/render/**). API frozen by CONTRACT.md section 5.1.
//
// Frame structure (all Canvas2D, tuned for an Intel UHD 620 at 1280x720):
//   screen space : sky (1-px gradient stretched) -> sun -> clouds -> lightning -> mountains -> fog -> hills -> fog ->
//                  far trees -> god rays -> mid trees -> near trunks -> fog            (backdrop.js, baked layers)
//   world space  : back deco (trees, bushes) -> terrain chunks (terrain.js, baked 8x8-tile canvases) -> signs,
//                  checkpoints, goal, crumbles, springs, movers, hazards -> player shadow + cube (cube.js) ->
//                  pulses -> swaying grass tufts -> water with reflections (water.js) -> particles -> front deco
//   screen space : rain/motes/fireflies (ambient.js) -> foreground foliage -> lightning flash -> grade + vignette
//   edit mode    : the same world + overlay.js
// Expensive art is baked once (per theme / per chunk); per frame only drawImage, alpha and transforms change.
import { T, PW, PH, TILE, isSlope, slopeH, TILE_CHARS, charToCode } from "../sim/constants.js";
import { compileLevel, levelHash } from "../sim/level.js";
import { artFor } from "./themes.js";
import { makeCanvas, hash, clamp, css, rrect } from "./util.js";
import { texturesFor, patternsFor } from "./textures.js";
import { createTerrain, bakeTileThumb } from "./terrain.js";
import { createBackdrop } from "./backdrop.js";
import { createSprites, drawSprite, DECO_GLOW } from "./sprites.js";
import { createCubePaint, drawCube, drawDizzy, createCubeAnimator } from "./cube.js";
import { createParticles, PK } from "./particles.js";
import { createWater } from "./water.js";
import { createAmbient } from "./ambient.js";
import { drawCheckpoints, drawGoal, drawSigns, drawSprings, drawCrumbles, drawMovers, drawHazards, drawPulses, drawDecoList } from "./entities.js";
import { drawEditOverlay } from "./overlay.js";

const MASS = new Uint8Array(18); for (const c of [1, 2, 3, 4, 6, 7, 8, 9, 10, 11]) MASS[c] = 1;
const spriteLibs = new Map();
const cubePaints = new Map();
function libFor(A) {
  let s = spriteLibs.get(A.id);
  if (!s) {
    const tex = texturesFor(A);
    const P = patternsFor(makeCanvas(2, 2).getContext("2d"), tex);
    s = { spr: createSprites(A, P), P, thumbs: new Map() };
    spriteLibs.set(A.id, s);
  }
  return s;
}
function paintFor(A) { let p = cubePaints.get(A.id); if (!p) { p = createCubePaint(A); cubePaints.set(A.id, p); } return p; }

export function createRenderer(canvas, opts = {}) {
  const ctx = canvas.getContext("2d", { alpha: false });
  let dprRaw = 1, dpr = 1, cssW = 960, cssH = 540, quality = "high", autoQuality = opts.autoQuality !== false;
  let level = null, C = null, A = null, seed = 1, lib = null;
  const terrain = createTerrain(), backdrop = createBackdrop(), water = createWater(), parts = createParticles(), ambient = createAmbient();
  const an = createCubeAnimator();
  let decoItems = [], tufts = new Float32Array(0), nTufts = 0, surf = new Float32Array(0), nSurf = 0, decoDirty = false;
  let springAnim = [], cpAnim = [], crumbleBack = [];
  let lastSim = null, lastFrameNo = -1, slowT = 0, dtEma = 1 / 60, poofDone = false, runDustT = 0, leafT = 0, splashT = 0;
  let lists = { signs: [], springs: [], crumbles: [], movers: [], hazards: [], pulses: [] };
  let shake = 0;
  const cubeP = { sx: 1, sy: 1, rot: 0, look: { x: 0, y: 0 }, blink: 0, mood: "idle", alpha: 1, t: 0, fear: 0 };
  // per-frame context handed to the entity / overlay painters (one object, reused)
  const R = { ctx, A: null, spr: null, t: 0, dt: 0, f: 0, alpha: 1, sim: null, mode: "play", LV: null, vx0: 0, vy0: 0, vx1: 0, vy1: 0, a: 1, e: 0, ff: 0,
    signs: null, springs: null, crumbles: null, movers: null, hazards: null, pulses: null, springAnim: null, cpAnim: null, crumbleBack: null,
    parts, newFrame: false, onStrike: null, cubePaint: null, tileThumb: null };

  function applyArt(art) {
    if (A === art) return;
    const ta = performance.now();
    A = art; lib = libFor(A);
    timings.textures = +(performance.now() - ta).toFixed(1);
    parts.setArt(A); water.setArt(A); ambient.setArt(A);
    backdrop.setArt(A, dpr);
    R.A = A; R.spr = lib.spr; R.cubePaint = paintFor(A);
  }

  function buildLists(LV) {
    const L = { signs: [], springs: [], crumbles: [], movers: [], hazards: [], pulses: [] };
    for (const e of LV.entities || []) {
      if (e.t === "sign") L.signs.push(e); else if (e.t === "spring") L.springs.push(e); else if (e.t === "crumble") L.crumbles.push(e);
      else if (e.t === "mover") L.movers.push(e); else if (e.t === "hazard") L.hazards.push(e); else if (e.t === "pulse") L.pulses.push(e);
    }
    return L;
  }

  // ---- automatic decoration: seeded per world tile, so edits only change decoration near the edit ----
  function computeDeco() {
    decoDirty = false;
    const W = C.W, H = C.H, g = terrain.grid, spr = lib.spr;
    const items = [];
    const occ = new Set();
    const mark = (x, y) => { occ.add(y * W + x); occ.add(y * W + x - 1); occ.add(y * W + x + 1); };
    for (const e of level.entities) if (e.t === "spring" || e.t === "sign" || e.t === "crumble") mark(Math.floor(e.x), Math.floor(e.y));
    for (const p of level.checkpoints || []) mark(p.x, p.y);
    if (level.goal) { mark(level.goal.x, level.goal.y); mark(level.goal.x - 1, level.goal.y); mark(level.goal.x + 1, level.goal.y); }
    if (level.start) mark(level.start.x, level.start.y);
    const add = (spr, x, y, k, flip, front, alpha = 1, glow = null) => items.push({ spr, x, y, k, flip, front, alpha, glow, hw: Math.max(-spr.ox, spr.w + spr.ox) * k, hh: -spr.oy * k });
    for (const e of level.entities) {
      if (e.t !== "deco") continue;
      const v = Math.floor(hash(Math.floor(e.x * 7), Math.floor(e.y * 3), 9) * 3);
      add(spr.deco(e.kind, v), (e.x + 0.5) * T, (e.y + 1) * T, e.s || 1, hash(Math.floor(e.x), Math.floor(e.y), 4) < 0.5, e.layer === "front", 1, DECO_GLOW[e.kind] || null);
    }
    const tf = [], sf = [];
    let lastTree = -99;
    const at = (x, y) => (x < 0 || x >= W || y < 0 || y >= H ? 0 : g[y * W + x]);
    for (let x = 0; x < W; x++) {
      for (let y = 1; y < H; y++) {
        const c = g[y * W + x], up = g[(y - 1) * W + x];
        if (!MASS[c] || up !== 0) continue;
        sf.push(x * T, y * T);
        if (!(c === TILE.GROUND || c === TILE.ROCK || isSlope(c))) continue;
        let head = 1; while (head < 8 && y - head - 1 >= 0 && at(x, y - head - 1) === 0) head++;
        const near = (k) => k >= 12 && k <= 16;
        const hazNear = near(at(x - 1, y - 1)) || near(at(x + 1, y - 1)) || near(at(x - 2, y - 1)) || near(at(x + 2, y - 1));
        if ((c === TILE.GROUND || isSlope(c)) && hash(x, y, seed + 400) < (A.cap === "snow" ? 0.35 : 0.8)) {
          const n = 1 + (hash(x, y, seed + 401) < 0.5 ? 1 : 0);
          for (let i = 0; i < n; i++) {
            const tx = x * T + 3 + hash(x, y, seed + 402 + i) * 26;
            const ty = isSlope(c) ? y * T + T - slopeH(c, (tx - x * T) / T) : y * T;
            tf.push(tx, ty + 1.5, Math.floor(hash(x, y, seed + 404 + i) * 6), hash(x, i, seed + 406) * 6.28);
          }
        }
        if (isSlope(c)) continue;
        if (head >= 7 && x - lastTree >= 5 && hash(x, y, seed + 410) < 0.2 && !occ.has(y * W + x - W)) {
          const kind = A.deco[Math.floor(hash(x, y, seed + 411) * A.deco.length)];
          add(spr.deco(kind, Math.floor(hash(x, y, seed + 412) * 3)), x * T + 16, y * T + 2, 0.75 + hash(x, y, seed + 413) * 0.45, hash(x, y, seed + 414) < 0.5, false);
          lastTree = x; continue;
        }
        if (head >= 2 && !hazNear && !occ.has((y - 1) * W + x) && hash(x, y, seed + 420) < 0.14) {
          const kind = A.small[Math.floor(hash(x, y, seed + 421) * A.small.length)];
          if ((kind === "bones" || kind === "crystal") && hash(x, y, seed + 422) < 0.6) continue;
          add(spr.deco(kind, Math.floor(hash(x, y, seed + 423) * 3)), x * T + 16, y * T + 1, 0.7 + hash(x, y, seed + 424) * 0.4, hash(x, y, seed + 425) < 0.5, false, 1, DECO_GLOW[kind] || null);
        }
      }
    }
    items.sort((p, q) => p.x - q.x);
    decoItems = items;
    tufts = Float32Array.from(tf); nTufts = tf.length / 4;
    surf = Float32Array.from(sf); nSurf = sf.length / 2;
  }
  // first item index with x >= v (items sorted by x)
  function lower(arr, v, stride, key) {
    let lo = 0, hi = key === "obj" ? arr.length : arr.length / stride;
    while (lo < hi) { const m = (lo + hi) >> 1; const x = key === "obj" ? arr[m].x : arr[m * stride]; if (x < v) lo = m + 1; else hi = m; }
    return lo;
  }

  const timings = {};
  function setLevel(lv) {
    const t0 = performance.now();
    C = compileLevel(lv);
    level = C.level;
    const t1 = performance.now();
    applyArt(artFor(level.theme));
    const t2 = performance.now();
    seed = parseInt(levelHash(level), 16) | 0;
    terrain.setLevel(A, C.W, C.H, C.grid, seed);
    computeDeco();
    const t3 = performance.now();
    timings.firstTerrain = undefined; timings.compile = +(t1 - t0).toFixed(1); timings.art = +(t2 - t1).toFixed(1); timings.deco = +(t3 - t2).toFixed(1); timings.backdrop = +backdrop.bakeMs.toFixed(1);
    lists = buildLists(level);
    springAnim = new Array(lists.springs.length).fill(0); cpAnim = new Array((level.checkpoints || []).length).fill(0); crumbleBack = new Array(lists.crumbles.length).fill(0);
    parts.clear(); an.reset(); lastSim = null; poofDone = false;
  }

  function updateTiles(src, x0, y0, x1, y1) {
    if (!level) { setLevel(src); return; }
    if (src.w !== level.w || src.h !== level.h || (src.theme || "forest") !== level.theme) { setLevel(src); return; }
    x0 = Math.max(0, Math.min(x0, x1)); y0 = Math.max(0, Math.min(y0, y1)); x1 = Math.min(level.w - 1, Math.max(x0, x1)); y1 = Math.min(level.h - 1, Math.max(y0, y1));
    const W = level.w, g = C.grid;
    for (let y = y0; y <= y1; y++) {
      const row = src.tiles[y];
      for (let x = x0; x <= x1; x++) g[y * W + x] = charToCode(row[x]);
    }
    level.tiles = src.tiles.slice();
    terrain.updateTiles(g, x0, y0, x1, y1);
    decoDirty = true;
  }

  // ---- surface height under world x near feet y (for tilt + shadows) ----
  function surfaceBelow(wx, fromY, maxDown) {
    const g = terrain.grid, W = C.W, H = C.H;
    const tx = Math.floor(wx / T);
    if (tx < 0 || tx >= W) return Infinity;
    for (let ty = Math.max(0, Math.floor((fromY - 4) / T)); ty < H && ty * T <= fromY + maxDown; ty++) {
      const c = g[ty * W + tx];
      let sy = Infinity;
      if (c >= 1 && c <= 4) sy = ty * T;
      else if (c === TILE.ONEWAY) sy = ty * T;
      else if (c >= 6 && c <= 11) sy = ty * T + T - slopeH(c, (wx - tx * T) / T);
      if (sy >= fromY - 4 && sy <= fromY + maxDown) return sy;
    }
    return Infinity;
  }

  // ---- events from the sim -> particles, anims ----
  function handleEvents(view) {
    const evs = view.events; if (!evs || !evs.length) return;
    const s = view.sim && view.sim.state;
    for (const ev of evs) {
      const x = ev.x, y = ev.y;
      switch (ev.type) {
        case "jump":
          an.impulse(2.4);
          for (let i = 0; i < 5; i++) parts.spawn(PK.dust, x + (Math.random() - 0.5) * 16, y + 12, (Math.random() - 0.5) * 50, -10 - Math.random() * 15, 0.45, 9 + Math.random() * 5, i & 1);
          break;
        case "land": {
          const k = ev.a || 1;
          an.impulse(-Math.min(4.5, k * 0.42)); an.landT = Math.min(0.2, 0.05 + k * 0.016);
          const n = Math.min(14, Math.floor(k * 1.3));
          for (let i = 0; i < n; i++) { const d = i & 1 ? 1 : -1; parts.spawn(PK.dust, x + d * (6 + Math.random() * 8), y + 12, d * (30 + Math.random() * 60 * k / 6), -6 - Math.random() * 18, 0.5 + Math.random() * 0.25, 8 + Math.random() * 6 + k, i & 1); }
          if (A.id === "storm" && k > 2) for (let i = 0; i < 6; i++) parts.spawn(PK.drop, x + (Math.random() - 0.5) * 22, y + 11, (Math.random() - 0.5) * 120, -80 - Math.random() * 90, 0.6, 4, 0);
          if (k > 8.5) shake = Math.max(shake, 2.2);
          break;
        }
        case "bonk":
          an.impulse(-2);
          for (let i = 0; i < 4; i++) parts.spawn(PK.chip, x + (Math.random() - 0.5) * 20, y - 13, (Math.random() - 0.5) * 80, 20 + Math.random() * 40, 0.8, 4, i);
          break;
        case "spring":
          if (ev.a >= 0 && ev.a < springAnim.length) springAnim[ev.a] = view.time;
          an.impulse(3.4);
          for (let i = 0; i < 10; i++) parts.spawn(PK.spark, x + (Math.random() - 0.5) * 24, y + 12, (Math.random() - 0.5) * 120, -40 - Math.random() * 80, 0.5, 8, 0);
          break;
        case "die": {
          shake = Math.max(shake, 5); poofDone = false;
          const cause = ev.a;
          if (cause === "water") { water.ripple(x, y + 13, 5); for (let i = 0; i < 22; i++) parts.spawn(PK.drop, x + (Math.random() - 0.5) * 20, y, (Math.random() - 0.5) * 220, -120 - Math.random() * 220, 1, 5, 0); }
          else if (cause === "spike") for (let i = 0; i < 10; i++) parts.spawn(PK.leaf, x, y, (Math.random() - 0.5) * 200, -80 - Math.random() * 120, 1.4, 9, i);
          else if (cause === "pulse") for (let i = 0; i < 16; i++) parts.spawn(PK.spark, x, y, (Math.random() - 0.5) * 260, -60 - Math.random() * 160, 0.6, 9, 0);
          break;
        }
        case "respawn":
          an.popT = 0.35; poofDone = false;
          for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.283; parts.spawn(PK.spark, x + Math.cos(a) * 6, y + Math.sin(a) * 6, Math.cos(a) * 90, Math.sin(a) * 90, 0.5, 8, 0); }
          break;
        case "checkpoint": {
          if (ev.a >= 0 && ev.a < cpAnim.length) cpAnim[ev.a] = view.time;
          const p = level.checkpoints[ev.a];
          if (p) for (let i = 0; i < 22; i++) parts.spawn(PK.spark, p.x * T + 18 + Math.random() * 20, p.y * T - 26 + Math.random() * 14, (Math.random() - 0.5) * 140, -40 - Math.random() * 120, 0.8, 8, 0);
          break;
        }
        case "win":
          an.happyT = view.time;
          for (let i = 0; i < 90; i++) parts.spawn(PK.confetti, x + (Math.random() - 0.5) * 30, y - 10, (Math.random() - 0.5) * 420, -220 - Math.random() * 300, 2.4 + Math.random(), 6 + Math.random() * 3, i);
          break;
        case "crumble": {
          const c = lists.crumbles[ev.a]; if (c) for (let i = 0; i < 4; i++) parts.spawn(PK.dust, c.x * T + Math.random() * c.w * T, c.y * T + T, (Math.random() - 0.5) * 20, 10, 0.6, 8, 0);
          break;
        }
        case "crumble_break": {
          const c = lists.crumbles[ev.a];
          if (c) for (let i = 0; i < 8 + c.w * 4; i++) parts.spawn(PK.chip, c.x * T + Math.random() * c.w * T, c.y * T + Math.random() * T, (Math.random() - 0.5) * 90, -20 - Math.random() * 80, 1.2, 4 + Math.random() * 5, i);
          if (c) for (let i = 0; i < 6; i++) parts.spawn(PK.dust, c.x * T + Math.random() * c.w * T, c.y * T + 16, (Math.random() - 0.5) * 40, -10, 0.8, 14, i & 1);
          break;
        }
        case "crumble_back":
          if (ev.a >= 0 && ev.a < crumbleBack.length) crumbleBack[ev.a] = view.time;
          break;
      }
    }
  }

  // ---- the player ----
  function drawPlayer(view) {
    const sim = view.sim, s = sim.state, t = view.time, dt = Math.min(0.05, view.dt || 0.016);
    const al = view.alpha == null ? 1 : view.alpha, pv = view.prev;
    const x = pv ? pv.x + (s.x - pv.x) * al : s.x, y = pv ? pv.y + (s.y - pv.y) * al : s.y;
    const cx = x + PW / 2, feet = y + PH;
    // squash/stretch spring
    let sub = dt; while (sub > 0) { const h = Math.min(sub, 1 / 120); an.sqV += (-420 * an.sq - 20 * an.sqV) * h; an.sq += an.sqV * h * 0.12; sub -= h; }
    an.sq = clamp(an.sq, -0.42, 0.42);
    an.landT = Math.max(0, an.landT - dt); an.popT = Math.max(0, an.popT - dt);
    // blink
    an.blinkT -= dt; if (an.blinkT < -0.14) an.blinkT = 2 + Math.random() * 3.5;
    const blink = an.blinkT < 0 ? 1 - Math.abs(an.blinkT + 0.07) / 0.07 : 0;
    // fear + hazard direction
    const nd = sim.nearestHazard(96), fear = nd === Infinity ? 0 : clamp(1 - nd / 96, 0, 1);
    let hx = 0, hy = 0;
    if (fear > 0.2) {
      const g = terrain.grid, W = C.W, tx0 = Math.floor(cx / T), ty0 = Math.floor((y + PH / 2) / T);
      let best = 1e9;
      for (let ty = ty0 - 3; ty <= ty0 + 3; ty++) for (let tx = tx0 - 3; tx <= tx0 + 3; tx++) {
        if (tx < 0 || ty < 0 || tx >= W || ty >= C.H) continue;
        const c = g[ty * W + tx]; if (c < 12 || c > 16) continue;
        const dx = tx * T + 16 - cx, dy = ty * T + 16 - (y + PH / 2), d = dx * dx + dy * dy;
        if (d < best) { best = d; hx = dx; hy = dy; }
      }
      const tmp = { x: 0, y: 0 };
      for (let i = 0; i < sim.compiled.hazards.length; i++) { sim.hazardPos(i, s.frame, tmp); const dx = tmp.x - cx, dy = tmp.y - (y + PH / 2), d = dx * dx + dy * dy; if (d < best) { best = d; hx = dx; hy = dy; } }
      const l = Math.sqrt(hx * hx + hy * hy) || 1; hx /= l; hy /= l;
    }
    // mood
    let mood = "idle";
    if (s.won) mood = "happy";
    else if (s.dead) mood = "dead";
    else if (fear > 0.35) mood = "worried";
    else if (an.landT > 0) mood = "land";
    else if (!s.grounded && s.vy < -1.5) mood = "jump";
    else if (!s.grounded && s.vy > 6.5) mood = "fall";
    else if (s.grounded && Math.abs(s.vx) > 2.6) mood = "run";
    // look
    const tlx = fear > 0.2 ? hx * 0.9 : clamp(s.vx / 3.5, -1, 1) * 0.85 + s.facing * 0.15;
    const tly = fear > 0.2 ? hy * 0.8 : clamp(s.vy / 9, -0.8, 1);
    const kL = 1 - Math.exp(-dt * 14);
    an.lookX += (tlx - an.lookX) * kL; an.lookY += (tly - an.lookY) * kL;
    // tilt from the terrain under the two bottom corners
    let targetRot = 0, pivX = cx, pivY = feet;
    if (s.grounded && s.ride < 0 && !s.dead) {
      const yl = surfaceBelow(x + 1.5, feet - 10, 40), yr = surfaceBelow(x + PW - 1.5, feet - 10, 40);
      if (yl !== Infinity && yr !== Infinity && Math.abs(yl - yr) > 0.5) {
        targetRot = clamp(Math.atan2(yr - yl, PW - 3), -0.8, 0.8);
        pivX = yl < yr ? x + 1.5 : x + PW - 1.5; pivY = Math.min(yl, yr);
      }
    }
    an.rot += (targetRot - an.rot) * (1 - Math.exp(-dt * 20));
    // contact shadow
    const sy = s.ride >= 0 && s.grounded ? feet : surfaceBelow(cx, feet - 2, 200);
    if (sy !== Infinity && !(s.dead && s.deadT <= 22)) {
      const d = Math.max(0, sy - feet), k = clamp(1 - d / 170, 0, 1);
      const w = 34 * (0.5 + 0.5 * k);
      ctx.globalAlpha = 0.5 * k; ctx.drawImage(lib.spr.shadow(), cx - w / 2, sy - 4.5, w, 9); ctx.globalAlpha = 1;
    }
    // death: dizzy spin + shrink, then a puff of leaves and debris
    if (s.dead) {
      if (s.deadT <= 22) {
        if (!poofDone) {
          poofDone = true;
          const py = y + PH / 2;
          for (let i = 0; i < 8; i++) parts.spawn(PK.puff, cx + (Math.random() - 0.5) * 14, py + (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, 0.7, 22 + Math.random() * 12, i & 1);
          for (let i = 0; i < 10; i++) parts.spawn(PK.leaf, cx, py, (Math.random() - 0.5) * 240, -60 - Math.random() * 160, 1.3, 9, i);
          for (let i = 0; i < 6; i++) parts.spawn(PK.chip, cx, py, (Math.random() - 0.5) * 200, -100 - Math.random() * 120, 1, 6, i);
        }
        return;
      }
      const u = (40 - s.deadT) / 18;
      ctx.save(); ctx.translate(cx, y + PH / 2); ctx.rotate(Math.sin(u * 9) * 0.35); ctx.scale(1 - u * 0.25, 1 - u * 0.25);
      cubeP.sx = 1; cubeP.sy = 1; cubeP.rot = 0; cubeP.mood = "dead"; cubeP.look.x = 0; cubeP.look.y = 0; cubeP.blink = 0; cubeP.alpha = 1; cubeP.t = t; cubeP.fear = 0;
      drawCube(ctx, R.cubePaint, cubeP); drawDizzy(ctx, t);
      ctx.restore();
      return;
    }
    // scale
    let sq = an.sq;
    if (!s.grounded) sq += clamp(Math.abs(s.vy) * 0.012, 0, 0.1) * (s.vy < 0 ? 1 : 0.6);
    let sy2 = 1 + sq, sx2 = 1 - sq * 0.55;
    let pop = 1; if (an.popT > 0) { const u = 1 - an.popT / 0.35; pop = u < 0.6 ? u / 0.6 * 1.15 : 1.15 - (u - 0.6) / 0.4 * 0.15; }
    let hop = 0;
    if (s.won) hop = -Math.abs(Math.sin((t - an.happyT) * 7)) * 9;
    ctx.save();
    if (an.rot !== 0) { ctx.translate(pivX, pivY); ctx.rotate(an.rot); ctx.translate(-pivX, -pivY); }
    if (s.grounded || s.won) { ctx.translate(cx, feet + hop); ctx.scale(sx2 * pop, sy2 * pop); ctx.translate(0, -PH / 2); }
    else { ctx.translate(cx, y + PH / 2); ctx.scale(sx2 * pop, sy2 * pop); }
    cubeP.sx = sx2; cubeP.sy = sy2; cubeP.mood = mood; cubeP.look.x = an.lookX; cubeP.look.y = an.lookY; cubeP.blink = blink; cubeP.alpha = 1; cubeP.t = t; cubeP.fear = fear;
    drawCube(ctx, R.cubePaint, cubeP);
    ctx.restore();
    // running dust / skid
    runDustT -= dt;
    if (s.grounded && Math.abs(s.vx) > 2.8 && runDustT <= 0) {
      runDustT = 0.085;
      if (A.id === "storm") parts.spawn(PK.drop, cx - Math.sign(s.vx) * 10, feet - 1, -s.vx * 12 + (Math.random() - 0.5) * 30, -50 - Math.random() * 60, 0.45, 4, 0);
      else parts.spawn(PK.dust, cx - Math.sign(s.vx) * 10, feet - 2, -s.vx * 10, -8 - Math.random() * 10, 0.4, 7 + Math.random() * 4, 0);
    }
    if (s.won && Math.random() < dt * 8) parts.spawn(PK.spark, cx + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30, 0, -20, 0.6, 9, 0);
  }

  // ---- swaying grass tufts (in front of the player's feet) ----
  function drawTufts(view, px, py, pvx) {
    if (!nTufts) return;
    const t = view.time, a = R.a, e = R.e, f = R.ff;
    const i0 = lower(tufts, R.vx0 - 20, 4), spr = lib.spr;
    const gust = Math.sin(t * 0.6) * 0.5 + 0.5;
    for (let i = i0; i < nTufts; i++) {
      const x = tufts[i * 4]; if (x > R.vx1 + 20) break;
      const y = tufts[i * 4 + 1]; if (y < R.vy0 - 20 || y > R.vy1 + 20) continue;
      const s = spr.tuft(tufts[i * 4 + 2] | 0);
      let k = Math.sin(t * 2.1 + tufts[i * 4 + 3] + x * 0.02) * 0.1 + gust * 0.14 * (A.id === "storm" ? 2 : 1);
      const dx = x - px, dy = y - py;
      if (Math.abs(dx) < 22 && dy > -6 && dy < 30) k += clamp(dx / 22, -1, 1) * 0.55 * (1 - Math.abs(dx) / 22) + pvx * 0.06;
      ctx.setTransform(a, 0, -a * k, a, a * x + e, a * y + f);
      ctx.drawImage(s.c, s.ox, s.oy, s.w, s.h);
    }
    ctx.setTransform(a, 0, 0, a, e, f);
  }

  function tileThumb(ch) {
    const key = "tile:" + ch;
    let c = lib.thumbs.get(key);
    if (!c) { c = thumbTile(A, lib, ch, 64); lib.thumbs.set(key, c); }
    return c;
  }
  R.tileThumb = tileThumb;

  // ======================================================================================================== frame
  function frame(view) {
    if (!view || !view.camera) return;
    if (!level) { const src = view.sim ? view.sim.level : view.level; if (!src) return; setLevel(src); }
    if (view.mode === "edit" && view.level && (view.level.w !== level.w || view.level.h !== level.h || (view.level.theme || "forest") !== level.theme)) setLevel(view.level);
    if (decoDirty) computeDeco();
    const mode = view.mode || "play", cam = view.camera, sim = mode === "play" ? view.sim : null;
    const dt = Math.min(0.1, view.dt || 0.016), t = view.time || 0;
    if (sim && sim !== lastSim) { lastSim = sim; an.reset(); poofDone = false; }
    // auto quality
    if (autoQuality && mode === "play" && dt < 0.09) {
      dtEma += (dt - dtEma) * 0.05;
      if (quality === "high" && dtEma > 1 / 46) { slowT += dt; if (slowT > 3) { setQuality("low"); slowT = 0; } } else slowT = Math.max(0, slowT - dt);
    }
    const LV = mode === "edit" && view.level ? view.level : level;
    if (mode === "edit") lists = buildLists(LV);
    const f = view.frame != null ? view.frame : sim ? sim.state.frame : 0;
    R.newFrame = f !== lastFrameNo; lastFrameNo = f;
    R.hideSigns = !!view.hideSigns; R.touch = !!view.touch;   // view additions: attract hides signs; touch swaps sign text
    shake = Math.max(0, shake - dt * 18);
    const sh = shake + (cam.shake || 0);
    const shx = sh ? (Math.random() - 0.5) * 2 * sh : 0, shy = sh ? (Math.random() - 0.5) * 2 * sh : 0;
    const z = cam.zoom, a = dpr * z;
    const ox = cssW / 2 - cam.x * z + shx, oy = cssH / 2 - cam.y * z + shy;
    const e = dpr * ox, ff = dpr * oy;
    const hw = cssW / 2 / z, hh = cssH / 2 / z;
    Object.assign(R, { A, spr: lib.spr, t, dt, f, alpha: view.alpha == null ? 1 : view.alpha, sim, mode, LV, vx0: cam.x - hw, vx1: cam.x + hw, vy0: cam.y - hh, vy1: cam.y + hh, a, e, ff,
      signs: lists.signs, springs: lists.springs, crumbles: lists.crumbles, movers: lists.movers, hazards: lists.hazards, pulses: lists.pulses, springAnim, cpAnim, crumbleBack });
    if (sim) handleEvents(view);
    parts.update(dt, t);

    // ---------------- backdrop ----------------
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    const rise = Math.max(0, (level.h * T - hh) - cam.y);
    backdrop.drawBack(ctx, view, quality, rise);

    // ---------------- world ----------------
    ctx.setTransform(a, 0, 0, a, e, ff);
    const items = decoItems, d0 = Math.max(0, lower(items, R.vx0 - 160, 1, "obj") - 0), d1 = Math.min(items.length, lower(items, R.vx1 + 160, 1, "obj"));
    drawDecoList(R, items, d0, d1, false);
    // glows of lanterns / crystals behind the terrain edge
    for (let i = d0; i < d1; i++) { const d = items[i]; if (!d.glow) continue; const G = d.glow, s = G.r * 2 * d.k * (1 + Math.sin(t * 3 + i) * 0.06); ctx.globalAlpha = G.a; ctx.drawImage(lib.spr.glow(G.color), d.x + (d.flip ? -G.x : G.x) * d.k - s / 2, d.y + G.y * d.k - s / 2, s, s); }
    ctx.globalAlpha = 1;
    const tt0 = performance.now();
    terrain.draw(ctx, a, e, ff, R.vx0 - 2, R.vy0 - 2, R.vx1 + 2, R.vy1 + 2, mode === "edit" ? 8 : 5, quality, mode);
    if (timings.firstTerrain === undefined) timings.firstTerrain = +(performance.now() - tt0).toFixed(1);
    ctx.setTransform(a, 0, 0, a, e, ff);

    drawCheckpoints(R);
    drawGoal(R);
    drawSigns(R);   // after the posts so a checkpoint never covers sign text
    drawCrumbles(R);
    drawSprings(R);
    drawMovers(R);
    drawHazards(R);

    let px = -1e9, py = -1e9, pvx = 0;
    if (sim) {
      const s = sim.state; px = s.x + PW / 2; py = s.y + PH; pvx = s.vx;
      drawPlayer(view);
      ctx.setTransform(a, 0, 0, a, e, ff);
    }
    drawPulses(R);
    drawTufts(view, px, py, pvx);
    water.draw(ctx, canvas, terrain.get, C.W, C.H, a, e, ff, R.vx0, R.vy0, R.vx1, R.vy1, t, quality, dpr);
    ctx.setTransform(a, 0, 0, a, e, ff);
    // ambient world particles: falling leaves, rain splashes
    if (mode !== "edit") {
      leafT -= dt;
      const lf = A.ambient.leaves;
      if (lf && leafT <= 0) { leafT = 1 / lf * (0.5 + Math.random()); parts.spawn(PK.leaf, R.vx0 + Math.random() * (R.vx1 - R.vx0), R.vy0 - 10, (A.id === "storm" ? 80 : 15) + Math.random() * 20, 20, 7, 8 + Math.random() * 3, Math.floor(Math.random() * 3)); }
      if (A.ambient.rain && nSurf) {
        splashT -= dt;
        while (splashT <= 0) {
          splashT += quality === "low" ? 0.06 : 0.025;
          const i0 = lower(surf, R.vx0, 2), i1 = lower(surf, R.vx1, 2);
          if (i1 <= i0) break;
          const k = i0 + Math.floor(Math.random() * (i1 - i0));
          const sx = surf[k * 2] + Math.random() * T, sy = surf[k * 2 + 1];
          if (sy < R.vy0 || sy > R.vy1) continue;
          if (Math.random() < 0.5) parts.spawn(PK.ring, sx, sy, 0, 0, 0.25, 5, 0);
          else parts.spawn(PK.drop, sx, sy - 1, (Math.random() - 0.5) * 50, -40 - Math.random() * 50, 0.3, 3, 0);
        }
      }
    }
    parts.draw(ctx, a, e, ff, R.vx0, R.vy0, R.vx1, R.vy1);
    ctx.setTransform(a, 0, 0, a, e, ff);
    drawDecoList(R, items, d0, d1, true);
    if (mode === "edit") { ctx.setTransform(a, 0, 0, a, e, ff); drawEditOverlay(R, view); }

    // ---------------- screen space ----------------
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (mode !== "edit") ambient.draw(ctx, view, quality);
    if (mode !== "edit" && quality !== "low") backdrop.drawFront(ctx, view);
    backdrop.drawGrade(ctx);
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ================================================================================================== thumbnails
  function drawThumb(c2, item, x, y, size, theme = "forest") {
    const art = artFor(theme), L = libFor(art);
    const key = JSON.stringify(item) + "@" + Math.round(size);
    let cv = L.thumbs.get(key);
    if (!cv) { cv = makeThumb(art, L, item, Math.max(32, Math.min(160, Math.ceil(size * 2)))); L.thumbs.set(key, cv); }
    c2.drawImage(cv, x, y, size, size);
  }

  function setQuality(q) {
    quality = q === "low" ? "low" : "high";
    parts.setBudget(quality === "low" ? 220 : 480);
    resize(cssW, cssH, dprRaw);
  }

  function resize(w, h, ratio) {
    cssW = w; cssH = h; dprRaw = ratio || 1;
    dpr = Math.min(dprRaw, quality === "low" ? 1.25 : 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    backdrop.resize(w, h, dpr); ambient.resize(w, h);
    if (A) backdrop.setArt(A, dpr);
  }

  const api = {
    resize, setLevel, updateTiles, frame, drawThumb, setQuality,
    get quality() { return quality; },
    get level() { return level; },
    onFlash: null,
    stats() { return { quality, dpr, particles: parts.count, deco: decoItems.length, tufts: nTufts, timings }; },
  };
  backdrop.onFlash = (s) => { if (api.onFlash) api.onFlash(s); };
  R.onStrike = (sx, sy) => { shake = Math.max(shake, 2.5); };
  return api;
}

// ================================================================================================== thumbnail art
function thumbTile(A, L, ch, px) {
  const code = TILE_CHARS.indexOf(ch);
  if (code === TILE.WATER) {
    const c = makeCanvas(px, px), g = c.getContext("2d"), s = px / T;
    g.scale(s, s);
    const gr = g.createLinearGradient(0, 4, 0, T); gr.addColorStop(0, css(A.water.band, 0.95)); gr.addColorStop(1, css(A.water.deep, 0.95));
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, T); for (let x = 0; x <= T; x += 2) g.lineTo(x, 5 + Math.sin(x * 0.4) * 1.4); g.lineTo(T, T); g.closePath(); g.fill();
    g.strokeStyle = css(A.water.surf, 0.9); g.lineWidth = 1.2; g.beginPath(); for (let x = 0; x <= T; x += 2) g.lineTo(x, 5 + Math.sin(x * 0.4) * 1.4); g.stroke();
    return c;
  }
  if (code <= 0) return makeCanvas(px, px);
  return bakeTileThumb(A, L.P, code, px);
}

function makeThumb(A, L, item, px) {
  const c = makeCanvas(px, px), g = c.getContext("2d"), s = px / 40;
  // soft themed backdrop tile
  const bg = g.createLinearGradient(0, 0, 0, px);
  bg.addColorStop(0, css(A.sky[1][1], 0.55)); bg.addColorStop(1, css(A.sky[A.sky.length - 1][1], 0.35));
  g.fillStyle = bg; g.beginPath(); rrect(g, 0, 0, px, px, px * 0.18); g.fill();
  const spr = L.spr;
  const fit = (sp, ax, ay, pad = 4) => { // draw sprite sp (anchor-relative) scaled to fit the tile
    const k = Math.min((40 - pad * 2) / sp.w, (40 - pad * 2) / sp.h);
    const w = sp.w * k, h = sp.h * k;
    g.drawImage(sp.c, (20 - w / 2) * s, (20 - h / 2) * s, w * s, h * s);
  };
  if (item.tile) {
    const tc = thumbTile(A, L, item.tile, px);
    g.drawImage(tc, 4 * s, 4 * s, 32 * s, 32 * s);
    return c;
  }
  const kind = item.kind;
  if (item.marker === "start") {
    g.save(); g.translate(20 * s, 21 * s); g.scale(s * 1.15, s * 1.15);
    drawCube(g, paintFor(A), { sx: 1, sy: 1, rot: 0, look: { x: 0.3, y: 0 }, blink: 0, mood: "idle", alpha: 1, t: 0, fear: 0 });
    g.restore(); return c;
  }
  if (item.marker === "goal") { fit(spr.goal(), 0, 0, 2); return c; }
  if (item.marker === "checkpoint") {
    fit(spr.post(), 0, 0, 3);
    g.fillStyle = "#35c46a"; g.beginPath(); g.moveTo(21 * s, 7 * s); g.lineTo(31 * s, 10 * s); g.lineTo(21 * s, 13.5 * s); g.closePath(); g.fill();
    return c;
  }
  switch (item.entity) {
    case "crumble": fit(spr.crumble(1), 0, 0, 5); break;
    case "spring": fit(spr.spring(item.p || 1), 0, 0, 4); break;
    case "mover": fit(spr.mover(kind || "log", 2), 0, 0, 3); break;
    case "hazard": fit(spr.hazard(kind || "thornball"), 0, 0, kind === "spark" ? -2 : 5); break;
    case "sign": fit(spr.sign("Hello!"), 0, 0, 4); break;
    case "deco": fit(spr.deco(kind || "oak", 0), 0, 0, 3); break;
    case "pulse": {
      g.save(); g.scale(s, s);
      if ((kind || "lightning") === "lightning") {
        g.fillStyle = "rgba(160,180,255,0.35)"; g.fillRect(14, 4, 12, 32);
        g.strokeStyle = "#fff"; g.lineWidth = 2.2; g.lineJoin = "round"; g.beginPath(); g.moveTo(22, 4); g.lineTo(16, 17); g.lineTo(23, 19); g.lineTo(17, 36); g.stroke();
        g.strokeStyle = "rgba(170,200,255,0.8)"; g.lineWidth = 5; g.globalAlpha = 0.4; g.stroke(); g.globalAlpha = 1;
      } else if (kind === "geyser") {
        const gr = g.createLinearGradient(0, 6, 0, 36); gr.addColorStop(0, "#f0fbff"); gr.addColorStop(1, "#4f9ad0");
        g.fillStyle = gr; g.beginPath(); g.moveTo(15, 36); g.lineTo(14, 10); g.quadraticCurveTo(20, 2, 26, 10); g.lineTo(25, 36); g.closePath(); g.fill();
        g.fillStyle = "#fff"; for (const [x, y] of [[12, 9], [28, 8], [20, 4]]) { g.beginPath(); g.arc(x, y, 2, 0, 6.3); g.fill(); }
      } else {
        for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(235,235,235,${0.85 - i * 0.15})`; g.beginPath(); g.arc(20 + Math.sin(i * 1.7) * 4, 32 - i * 8, 6 + i * 1.5, 0, 6.3); g.fill(); }
      }
      g.fillStyle = "rgba(20,20,20,0.6)"; g.beginPath(); g.ellipse(20, 36, 8, 2.2, 0, 0, 6.3); g.fill();
      g.restore();
      break;
    }
    default: g.fillStyle = "#999"; g.fillRect(10 * s, 10 * s, 20 * s, 20 * s);
  }
  return c;
}
