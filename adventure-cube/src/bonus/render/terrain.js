// render/terrain.js - the bonus world's tiles: painted materials baked into 16x16-tile chunk canvases (lazy, LRU,
// re-baked per chunk on "tile" events), cave back walls, mining cracks, animated water, ore glints.
// Every detail is seeded by WORLD tile coordinates and each chunk also paints a 1-tile margin (clipped by the canvas),
// so neighbouring chunks agree pixel-for-pixel and an edit only re-bakes the chunks around it.
import { T } from "../core/const.js";
import { texturesFor, patternsFor } from "../../render/textures.js";
import { artFor } from "../../render/themes.js";
import { makeCanvas, hash, rng, rrect, css, shade, mix, rgb, noiseGrid, whiteGrid, paintTex, lerp3, cl01, lg, TAU, PAL } from "./kit.js";

export const CH = 16;              // tiles per chunk side
const PX_BUDGET = 14e6;            // baked chunk pixels kept (LRU)
// tile codes (data/tiles.js, frozen)
const AIR = 0, DIRT = 1, GRASS = 2, STONE = 3, COAL = 4, IRON = 5, GOLD = 6, CRYSTAL = 7, CLAY = 8, SAND = 9, GRAVEL = 10,
  WATER = 11, BEDROCK = 12, PLANKS = 13, COBBLE = 14, BRICK = 15, GLASS = 16, MOSSY = 17, SNOW = 18;
const NATURAL = new Uint8Array(32); for (const c of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 17, 18]) NATURAL[c] = 1;
const BUILT = new Uint8Array(32); for (const c of [13, 14, 15, 16]) BUILT[c] = 1;
const SOLIDISH = new Uint8Array(32); for (let c = 0; c < 32; c++) SOLIDISH[c] = NATURAL[c] || BUILT[c];
// material class for organic outlines (same class = no rounded seam between them)
const CLS = new Uint8Array(32);
CLS[DIRT] = CLS[GRASS] = CLS[SNOW] = 1; CLS[STONE] = CLS[COAL] = CLS[IRON] = CLS[GOLD] = CLS[CRYSTAL] = CLS[MOSSY] = 2;
CLS[CLAY] = 3; CLS[SAND] = 4; CLS[GRAVEL] = 5; CLS[BEDROCK] = 6;
export const BIOME_NAMES = ["meadow", "forest", "pinewood", "hills", "river"];

// ---------------------------------------------------------------------------------------------- textures
let TEX = null;
function textures() {
  if (TEX) return TEX;
  const A = artFor("forest"), base = texturesFor(A);
  const N = 256;
  const sandTex = (() => {
    const n = noiseGrid(N, 4, 4, 501, 4), w = whiteGrid(N, 502), rip = noiseGrid(N, 2, 16, 503, 2);
    const a = rgb("#d8c48a"), b = rgb("#c2a86c"), c = rgb("#efe0ae"), d = rgb("#9c8456");
    return paintTex(N, (i, x, y, o) => {
      lerp3(b, a, cl01(n[i] * 1.6 - 0.2), o);
      const r = Math.sin((y / N) * TAU * 10 + rip[i] * 6) * 0.5 + 0.5;
      if (r > 0.8) lerp3(o, c, (r - 0.8) * 2, o);
      if (w[i] > 0.93) lerp3(o, c, 0.6, o); else if (w[i] < 0.06) lerp3(o, d, 0.5, o);
    });
  })();
  const clayTex = (() => {
    const n = noiseGrid(N, 4, 4, 511, 4), band = noiseGrid(N, 2, 8, 512, 3), w = whiteGrid(N, 513);
    const a = rgb("#a9765c"), b = rgb("#8a5a44"), c = rgb("#c4947a"), d = rgb("#6e4636");
    return paintTex(N, (i, x, y, o) => {
      lerp3(b, a, cl01(n[i] * 1.7 - 0.3), o);
      const s = Math.sin(((y / N) * 7 + band[i] * 1.4) * TAU) * 0.5 + 0.5;
      if (s > 0.75) lerp3(o, c, (s - 0.75) * 1.6, o); else if (s < 0.12) lerp3(o, d, (0.12 - s) * 2.5, o);
      const f = 0.95 + w[i] * 0.08; o[0] *= f; o[1] *= f; o[2] *= f;
    });
  })();
  const bedTex = (() => {
    const n = noiseGrid(N, 4, 4, 521, 5), r = noiseGrid(N, 8, 8, 522, 2), w = whiteGrid(N, 523);
    const a = rgb("#2e2b2c"), b = rgb("#4a4546"), c = rgb("#6d6766");
    return paintTex(N, (i, x, y, o) => {
      lerp3(a, b, cl01(n[i] * 2 - 0.5), o);
      const ridge = 1 - Math.abs(2 * r[i] - 1);
      if (ridge > 0.9) lerp3(o, c, (ridge - 0.9) * 7, o);
      if (w[i] > 0.97) lerp3(o, c, 0.6, o);
    });
  })();
  const P = patternsFor(makeCanvas(2, 2).getContext("2d"), { soil: base.soil, rock: base.rock, back: base.back, sand: sandTex, clay: clayTex, bed: bedTex });
  TEX = { P };
  return TEX;
}

// ---------------------------------------------------------------------------------------------- the terrain object
export function createTerrain() {
  let G = null, W = 0, H = 0, tiles = null, surf = null, biome = null, seed = 0;
  let S = 1;                                  // canvas px per world px of baked chunks
  const chunks = new Map();                   // key -> { c, dirty, used }
  let frameNo = 0, pxUsed = 0;
  let openTop = null;                         // per column: first solid row of the CURRENT tiles (lighting)
  const crackSpr = [];

  const get = (x, y) => (x < 0 || x >= W ? BEDROCK : y < 0 ? AIR : y >= H ? BEDROCK : tiles[y * W + x]);

  function setGame(g) {
    G = g; const w = g.world; W = w.W; H = w.H; tiles = w.tiles; surf = w.surface; biome = w.biome; seed = (w.seed | 0) & 0xffff;
    clear();
    openTop = new Int16Array(W);
    for (let x = 0; x < W; x++) recomputeTop(x);
    textures();
    if (!crackSpr.length) bakeCracks();
  }
  function recomputeTop(x) {
    let y = 0; while (y < H && !SOLIDISH[tiles[y * W + x]]) y++;
    openTop[x] = y;
  }
  function clear() { chunks.clear(); pxUsed = 0; }
  function setScale(s) { if (Math.abs(s - S) > 0.01) { S = s; clear(); } }
  // a tile changed: re-bake the chunks around it, update the column's light top
  function onTile(tx, ty) {
    if (!tiles) return;
    tiles = G.world.tiles;
    if (tx >= 0 && tx < W) recomputeTop(tx);
    // each touched chunk records the tile rect (tile +-1, clamped to the chunk) to repaint in place
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = Math.floor((tx + dx) / CH), cy = Math.floor((ty + dy) / CH);
      const c = chunks.get(key(cx, cy)); if (!c) continue;
      const X0 = cx * CH, Y0 = cy * CH;
      const x0 = Math.max(X0, tx - 1), x1 = Math.min(X0 + CH - 1, tx + 1), y0 = Math.max(Y0, ty - 1), y1 = Math.min(Y0 + CH - 1, ty + 1);
      if (x0 > x1 || y0 > y1) continue;
      const r = c.dirtyR;
      if (!r) c.dirtyR = { x0, y0, x1, y1 }; else { r.x0 = Math.min(r.x0, x0); r.y0 = Math.min(r.y0, y0); r.x1 = Math.max(r.x1, x1); r.y1 = Math.max(r.y1, y1); }
      c.dirty = true;
    }
  }
  // repaint only tile rect r of chunk (cx, cy) in its existing canvas. Tiles up to 2 away (but never past the
  // chunk's own 1-tile margin) are painted under a clip, so the result matches a full bake of that area.
  function repaintRect(ch, cx, cy, r) {
    const X0 = cx * CH, Y0 = cy * CH, X1 = X0 + CH - 1, Y1 = Y0 + CH - 1;
    const g = ch.c.getContext("2d");
    g.save();
    g.setTransform(S, 0, 0, S, -X0 * T * S, -Y0 * T * S);
    g.beginPath(); g.rect(r.x0 * T, r.y0 * T, (r.x1 - r.x0 + 1) * T, (r.y1 - r.y0 + 1) * T); g.clip();
    g.clearRect(r.x0 * T, r.y0 * T, (r.x1 - r.x0 + 1) * T, (r.y1 - r.y0 + 1) * T);
    g.lineCap = "round"; g.lineJoin = "round";
    paintRegion(g, Math.max(X0, r.x0 - 1), Math.max(Y0, r.y0 - 1), Math.min(X1, r.x1 + 1), Math.min(Y1, r.y1 + 1));
    g.restore();
  }
  // progressive bake: strip ch.part (4 tile rows) of a chunk; part becomes null when the chunk is complete
  const STRIPS = 4;
  function bakeStrip(ch, cx, cy) {
    const i = ch.part, X0 = cx * CH, Y0 = cy * CH, n = CH / STRIPS;
    repaintRect(ch, cx, cy, { x0: X0, x1: X0 + CH - 1, y0: Y0 + i * n, y1: Y0 + i * n + n - 1 });
    ch.part = i + 1 >= STRIPS ? null : i + 1;
  }
  // device-pixel snapped chunk blit: whole-pixel edges so neighbouring chunks meet without a light seam
  function blit(ctx, img, x, y, s) {
    const m = ctx.getTransform();
    const dx0 = Math.round(m.a * x + m.e), dy0 = Math.round(m.d * y + m.f);
    const dx1 = Math.round(m.a * (x + s) + m.e), dy1 = Math.round(m.d * (y + s) + m.f);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(img, dx0, dy0, dx1 - dx0, dy1 - dy0);
    ctx.setTransform(m);
  }
  const key = (cx, cy) => cy * 4096 + cx;

  // ------------------------------------------------------------------ bake one chunk
  function bakeChunk(cx, cy, old) {
    const X0 = cx * CH, Y0 = cy * CH, X1 = X0 + CH - 1, Y1 = Y0 + CH - 1;
    const px = Math.ceil(CH * T * S);
    const c = old && old.width === px ? old : makeCanvas(px, px);
    const g = c.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, px, px);
    g.setTransform(S, 0, 0, S, -X0 * T * S, -Y0 * T * S);
    g.lineCap = "round"; g.lineJoin = "round";
    paintRegion(g, X0, Y0, X1, Y1);
    return c;
  }

  function paintRegion(g, X0, Y0, X1, Y1) {
    const P = TEX.P;
    const M0x = X0 - 1, M0y = Y0 - 1, M1x = X1 + 1, M1y = Y1 + 1;  // margin
    const open = (x, y) => !SOLIDISH[get(x, y)];
    // ---- 1. cave back walls (air / water below the generated surface) ----
    const backSoil = new Path2D(), backRock = new Path2D(); let nbS = 0, nbR = 0;
    for (let y = M0y; y <= M1y; y++) for (let x = M0x; x <= M1x; x++) {
      const t = get(x, y); if (SOLIDISH[t]) continue;
      if (x < 0 || x >= W) continue;
      const d = y - surf[x];
      if (d < 0 || (d === 0 && t !== WATER && !SOLIDISH[get(x, y + 1)] && false)) continue;
      if (d < 0) continue;
      if (d < 5 + (hash(x, 3, seed) * 2 | 0)) { backSoil.rect(x * T - 0.5, y * T - 0.5, T + 1, T + 1); nbS++; } else { backRock.rect(x * T - 0.5, y * T - 0.5, T + 1, T + 1); nbR++; }
    }
    if (nbS) { g.fillStyle = P.soil; g.fill(backSoil); g.fillStyle = "rgba(26,16,8,0.62)"; g.fill(backSoil); }
    if (nbR) { g.fillStyle = P.back; g.fill(backRock); g.fillStyle = "rgba(10,10,12,0.5)"; g.fill(backRock); }
    if (nbS || nbR) {
      // cast shadows from the solids onto the back wall + scattered wall texture
      for (let y = M0y; y <= M1y; y++) for (let x = M0x; x <= M1x; x++) {
        if (x < 0 || x >= W || SOLIDISH[get(x, y)] || y < surf[x]) continue;
        const X = x * T, Y = y * T;
        if (SOLIDISH[get(x, y - 1)]) { g.fillStyle = lg(g, 0, Y, 0, Y + 14, [[0, "rgba(0,0,0,0.5)"], [1, "rgba(0,0,0,0)"]]); g.fillRect(X, Y, T, 14); }
        if (SOLIDISH[get(x - 1, y)]) { g.fillStyle = lg(g, X, 0, X + 9, 0, [[0, "rgba(0,0,0,0.38)"], [1, "rgba(0,0,0,0)"]]); g.fillRect(X, Y, 9, T); }
        if (SOLIDISH[get(x + 1, y)]) { g.fillStyle = lg(g, X + T, 0, X + T - 9, 0, [[0, "rgba(0,0,0,0.38)"], [1, "rgba(0,0,0,0)"]]); g.fillRect(X + T - 9, Y, 9, T); }
        const h = hash(x, y, seed + 7);
        if (h < 0.18) { g.fillStyle = "rgba(0,0,0,0.22)"; g.beginPath(); g.ellipse(X + 8 + h * 80, Y + 10 + h * 40, 5 + h * 20, 3 + h * 9, h * 3, 0, TAU); g.fill(); }
        else if (h > 0.9) { g.fillStyle = "rgba(255,240,220,0.07)"; g.beginPath(); g.ellipse(X + 16, Y + 16, 9, 4, 0.3, 0, TAU); g.fill(); }
      }
    }
    // ---- 2. natural mass: one union path with rounded exposed corners, filled with soil ----
    const mass = new Path2D(); let nM = 0;
    const R = 8;
    for (let y = M0y; y <= M1y; y++) for (let x = M0x; x <= M1x; x++) {
      const t = get(x, y); if (!NATURAL[t]) continue;
      nM++;
      const oL = open(x - 1, y), oR = open(x + 1, y), oU = open(x, y - 1), oD = open(x, y + 1);
      rrect(mass, x * T - 0.35, y * T - 0.35, T + 0.7, T + 0.7,
        oL && oU && open(x - 1, y - 1) ? R : 0, oR && oU && open(x + 1, y - 1) ? R : 0, oR && oD && open(x + 1, y + 1) ? R : 0, oL && oD && open(x - 1, y + 1) ? R : 0);
    }
    if (nM) { g.fillStyle = P.soil; g.fill(mass); }
    // ---- 3. other natural materials on top, rounded where they meet a different class ----
    const layers = [[2, P.rock], [3, P.clay], [4, P.sand], [5, P.soil], [6, P.bed]];
    for (const [cls, pat] of layers) {
      const p = new Path2D(); let n = 0;
      for (let y = M0y; y <= M1y; y++) for (let x = M0x; x <= M1x; x++) {
        const t = get(x, y); if (CLS[t] !== cls) continue;
        n++;
        const d = (dx, dy) => CLS[get(x + dx, y + dy)] !== cls;
        const r = cls === 6 ? 5 : 9;
        rrect(p, x * T - 0.35, y * T - 0.35, T + 0.7, T + 0.7,
          d(-1, 0) && d(0, -1) ? r : 0, d(1, 0) && d(0, -1) ? r : 0, d(1, 0) && d(0, 1) ? r : 0, d(-1, 0) && d(0, 1) ? r : 0);
      }
      if (!n) continue;
      if (cls === 5) { g.fillStyle = "#5d5852"; g.fill(p); } else { g.fillStyle = pat; g.fill(p); }
      if (cls === 2) { g.fillStyle = "rgba(20,22,26,0.06)"; g.fill(p); }
      if (cls === 6) { g.fillStyle = P.bed; g.fill(p); }
    }
    // ---- 4. per-tile details (margin included so neighbours agree) ----
    for (let y = M0y; y <= M1y; y++) for (let x = M0x; x <= M1x; x++) {
      const t = get(x, y);
      if (NATURAL[t]) detailNatural(g, t, x, y, open);
      else if (BUILT[t]) detailBuilt(g, t, x, y, open);
    }
    // ---- 5. edge shading on exposed natural faces ----
    for (let y = M0y; y <= M1y; y++) for (let x = M0x; x <= M1x; x++) {
      const t = get(x, y); if (!NATURAL[t]) continue;
      const X = x * T, Y = y * T;
      if (open(x, y + 1)) { g.fillStyle = lg(g, 0, Y + T, 0, Y + T - 10, [[0, "rgba(10,6,2,0.55)"], [1, "rgba(10,6,2,0)"]]); g.fillRect(X, Y + T - 10, T, 10); }
      if (open(x - 1, y)) { g.fillStyle = lg(g, X, 0, X + 8, 0, [[0, "rgba(10,6,2,0.32)"], [1, "rgba(10,6,2,0)"]]); g.fillRect(X, Y, 8, T); }
      if (open(x + 1, y)) { g.fillStyle = lg(g, X + T, 0, X + T - 8, 0, [[0, "rgba(10,6,2,0.4)"], [1, "rgba(10,6,2,0)"]]); g.fillRect(X + T - 8, Y, 8, T); }
      if (open(x, y - 1) && t !== GRASS && t !== SNOW && t !== MOSSY) {
        g.fillStyle = lg(g, 0, Y, 0, Y + 6, [[0, "rgba(255,240,210,0.22)"], [1, "rgba(255,240,210,0)"]]); g.fillRect(X + 1, Y, T - 2, 6);
      }
    }
    // ---- 6. surface caps last (grass blades / snow / moss overhang onto neighbours) ----
    for (let y = M0y; y <= M1y; y++) for (let x = M0x; x <= M1x; x++) {
      const t = get(x, y);
      if ((t === GRASS || t === SNOW || t === MOSSY) && open(x, y - 1)) cap(g, t, x, y, open);
      if (t === SAND && get(x, y - 1) === AIR && (get(x - 1, y - 1) === WATER || get(x + 1, y - 1) === WATER || get(x - 1, y) === WATER || get(x + 1, y) === WATER)) reeds(g, x, y);
    }
  }

  // ------------------------------------------------------------------ natural tile details
  function detailNatural(g, t, x, y, open) {
    const X = x * T, Y = y * T, r = rng((hash(x, y, seed + 11) * 4294967296) >>> 0);
    const depth = x >= 0 && x < W ? y - surf[x] : 99;
    switch (t) {
      case DIRT: case GRASS: case SNOW: {
        // pebbles
        const n = r() < 0.55 ? 1 + (r() * 3 | 0) : 0;
        for (let i = 0; i < n; i++) {
          const px = X + 3 + r() * (T - 6), py = Y + 4 + r() * (T - 8), s = 1.3 + r() * 2.6;
          g.fillStyle = "rgba(20,12,4,0.45)"; g.beginPath(); g.ellipse(px + 0.6, py + 0.8, s, s * 0.72, 0, 0, TAU); g.fill();
          g.fillStyle = mix(PAL.soil.pebble, "#5b5348", r() * 0.6); g.beginPath(); g.ellipse(px, py, s, s * 0.72, r(), 0, TAU); g.fill();
          g.fillStyle = "rgba(255,250,235,0.35)"; g.beginPath(); g.ellipse(px - s * 0.3, py - s * 0.3, s * 0.4, s * 0.25, 0, 0, TAU); g.fill();
        }
        // roots near the surface
        if (depth >= 0 && depth < 3 && r() < 0.5) {
          g.strokeStyle = r() < 0.5 ? "rgba(58,36,20,0.75)" : "rgba(120,90,60,0.45)"; g.lineWidth = 0.9 + r() * 1.2;
          let rx = X + r() * T, ry = Y; g.beginPath(); g.moveTo(rx, ry);
          for (let k = 0; k < 3; k++) { const nx = rx + (r() - 0.5) * 18, ny = ry + 6 + r() * 8; g.quadraticCurveTo(rx + (r() - 0.5) * 10, (ry + ny) / 2, nx, ny); rx = nx; ry = ny; }
          g.stroke();
        }
        if (r() < 0.12) { g.fillStyle = "rgba(30,18,8,0.35)"; g.beginPath(); g.ellipse(X + r() * T, Y + r() * T, 2.5, 1.6, 0, 0, TAU); g.fill(); }
        if (r() < 0.25) { g.fillStyle = "rgba(160,125,85,0.35)"; g.fillRect(X + r() * T, Y + r() * T, 1.4, 1.4); g.fillRect(X + r() * T, Y + r() * T, 1.2, 1.2); }
        break;
      }
      case STONE: case MOSSY: case COAL: case IRON: case GOLD: case CRYSTAL: {
        // cracks + lichen + a highlight chip
        if (r() < 0.6) {
          g.strokeStyle = "rgba(40,38,34,0.55)"; g.lineWidth = 0.9;
          let cx = X + 4 + r() * (T - 8), cy = Y + 4 + r() * (T - 8);
          g.beginPath(); g.moveTo(cx, cy);
          for (let k = 0; k < 3; k++) { cx += (r() - 0.5) * 14; cy += (r() - 0.3) * 10; g.lineTo(cx, cy); }
          g.stroke();
          g.strokeStyle = "rgba(230,225,205,0.25)"; g.beginPath(); g.moveTo(cx + 1, cy + 1); g.lineTo(cx - 4, cy + 1); g.stroke();
        }
        if (t === STONE && r() < 0.3) { g.fillStyle = r() < 0.5 ? "rgba(170,185,120,0.35)" : "rgba(210,205,180,0.3)"; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(X + r() * T, Y + r() * T, 0.8 + r() * 1.8, 0, TAU); g.fill(); } }
        if (t === MOSSY) for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? "rgba(84,130,48,0.6)" : "rgba(120,170,70,0.5)"; g.beginPath(); g.ellipse(X + r() * T, Y + r() * T, 3 + r() * 5, 2 + r() * 3, r() * 3, 0, TAU); g.fill(); }
        if (t === COAL) ore(g, X, Y, r, ["#1b1a1d", "#2c2b30", "#55555c"], 3 + (r() * 3 | 0), 4.5, true);
        else if (t === IRON) ore(g, X, Y, r, ["#7a3f22", "#b8643a", "#e3a27a"], 4 + (r() * 3 | 0), 3.4, false);
        else if (t === GOLD) ore(g, X, Y, r, ["#8a6414", "#e8b938", "#fff2a0"], 4 + (r() * 3 | 0), 3, false);
        else if (t === CRYSTAL) crystal(g, X, Y, r);
        break;
      }
      case CLAY: {
        g.strokeStyle = "rgba(90,50,35,0.25)"; g.lineWidth = 1;
        for (let k = 0; k < 2; k++) { const yy = Y + 6 + r() * 20; g.beginPath(); g.moveTo(X, yy); g.bezierCurveTo(X + 10, yy - 2, X + 22, yy + 2, X + T, yy); g.stroke(); }
        if (r() < 0.4) { g.fillStyle = "rgba(240,200,170,0.25)"; g.beginPath(); g.ellipse(X + r() * T, Y + r() * T, 4, 2, 0, 0, TAU); g.fill(); }
        break;
      }
      case SAND: {
        if (r() < 0.4) { g.fillStyle = "rgba(255,250,230,0.5)"; g.beginPath(); g.ellipse(X + r() * T, Y + 6 + r() * 20, 2.4, 1.2, 0, 0, TAU); g.fill(); }
        if (r() < 0.2) { g.fillStyle = "#f3e9d8"; g.beginPath(); g.ellipse(X + 6 + r() * 20, Y + 8 + r() * 16, 2.2, 1.6, r(), 0, TAU); g.fill(); g.strokeStyle = "rgba(150,120,90,0.6)"; g.lineWidth = 0.5; g.stroke(); }
        break;
      }
      case GRAVEL: {
        for (let k = 0; k < 15; k++) {
          const px = X + r() * T, py = Y + r() * T, s = 1.8 + r() * 3.2, v = 0.55 + r() * 0.6;
          g.fillStyle = "rgba(15,12,10,0.45)"; g.beginPath(); g.ellipse(px + 0.7, py + 0.9, s, s * 0.75, 0, 0, TAU); g.fill();
          g.fillStyle = shade(r() < 0.2 ? "#8b7a68" : "#8e8a84", v); g.beginPath(); g.ellipse(px, py, s, s * 0.75, r() * 3, 0, TAU); g.fill();
          g.fillStyle = "rgba(255,255,255,0.22)"; g.beginPath(); g.ellipse(px - s * 0.3, py - s * 0.35, s * 0.45, s * 0.3, 0, 0, TAU); g.fill();
        }
        break;
      }
      case BEDROCK: {
        g.strokeStyle = "rgba(120,112,110,0.35)"; g.lineWidth = 1.2;
        g.beginPath(); let cx = X + r() * T, cy = Y + r() * 6; g.moveTo(cx, cy); for (let k = 0; k < 3; k++) { cx += (r() - 0.5) * 16; cy += 6 + r() * 6; g.lineTo(cx, cy); } g.stroke();
        break;
      }
    }
  }
  // ore nodules: cols = [dark rim, body, highlight]
  function ore(g, X, Y, r, cols, n, size, glossy) {
    for (let k = 0; k < n; k++) {
      const px = X + 5 + r() * (T - 10), py = Y + 5 + r() * (T - 10), s = size * (0.7 + r() * 0.7);
      const m = 5 + (r() * 3 | 0), pts = [];
      for (let i = 0; i < m; i++) { const a = (i / m) * TAU + r() * 0.5, d = s * (0.7 + r() * 0.5); pts.push(px + Math.cos(a) * d, py + Math.sin(a) * d * 0.85); }
      g.fillStyle = "rgba(10,8,6,0.45)"; g.beginPath(); g.moveTo(pts[0] + 1, pts[1] + 1.2); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i] + 1, pts[i + 1] + 1.2); g.closePath(); g.fill();
      g.fillStyle = cols[0]; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill();
      g.fillStyle = cols[1]; g.beginPath(); g.ellipse(px - s * 0.12, py - s * 0.1, s * 0.72, s * 0.6, r(), 0, TAU); g.fill();
      g.fillStyle = cols[2]; g.beginPath(); g.ellipse(px - s * 0.35, py - s * 0.35, s * (glossy ? 0.38 : 0.28), s * 0.2, -0.5, 0, TAU); g.fill();
    }
    if (glossy) { g.strokeStyle = "rgba(20,20,24,0.6)"; g.lineWidth = 2; g.beginPath(); g.moveTo(X + 2, Y + 8 + r() * 16); g.quadraticCurveTo(X + 16, Y + r() * 32, X + T - 2, Y + 8 + r() * 16); g.stroke(); }
  }
  function crystal(g, X, Y, r) {
    g.fillStyle = "rgba(60,140,190,0.25)"; g.beginPath(); g.arc(X + 16, Y + 16, 13, 0, TAU); g.fill();
    const n = 3 + (r() * 2 | 0);
    for (let k = 0; k < n; k++) {
      const bx = X + 7 + r() * 18, by = Y + 22 + r() * 6, h = 10 + r() * 12, w = 3 + r() * 2.5, a = (r() - 0.5) * 1.1;
      g.save(); g.translate(bx, by); g.rotate(a);
      g.fillStyle = "#3d8fc4"; g.beginPath(); g.moveTo(-w, 0); g.lineTo(-w, -h); g.lineTo(0, -h - w * 1.4); g.lineTo(w, -h); g.lineTo(w, 0); g.closePath(); g.fill();
      g.fillStyle = "#8fe3ff"; g.beginPath(); g.moveTo(-w, 0); g.lineTo(-w, -h); g.lineTo(0, -h - w * 1.4); g.lineTo(0, 0); g.closePath(); g.fill();
      g.fillStyle = "rgba(230,255,255,0.85)"; g.fillRect(-w * 0.7, -h * 0.9, w * 0.35, h * 0.7);
      g.restore();
    }
  }
  // grass / snow / moss caps (overhang a little above the tile)
  function cap(g, t, x, y, open) {
    const X = x * T, Y = y * T, r = rng((hash(x, y, seed + 23) * 4294967296) >>> 0);
    const b = x >= 0 && x < W ? biome[x] : 1;
    const lush = b === 0 ? 1.25 : b === 3 ? 0.7 : b === 2 ? 0.85 : 1;
    const oL = open(x - 1, y), oR = open(x + 1, y);
    if (t === SNOW) {
      g.fillStyle = "#eef4f8"; g.beginPath(); g.moveTo(X - (oL ? 1 : 0), Y + 7);
      for (let i = 0; i <= 4; i++) g.lineTo(X + (i / 4) * T, Y + 6 + Math.sin(x * 3 + i * 1.7) * 2);
      g.lineTo(X + T + (oR ? 1 : 0), Y - 3); g.quadraticCurveTo(X + T / 2, Y - 6, X - (oL ? 1 : 0), Y - 3); g.closePath(); g.fill();
      g.fillStyle = "rgba(160,190,215,0.6)"; g.fillRect(X, Y + 4, T, 2);
      g.fillStyle = "#ffffff"; g.beginPath(); g.ellipse(X + 10 + r() * 12, Y - 2, 8, 2, 0, 0, TAU); g.fill();
      return;
    }
    const isMoss = t === MOSSY;
    const gc = b === 2 ? { dark: "#1f4f22", mid: "#356f2c", light: "#5c9a3e", tip: "#8fbf5a" } : b === 3 ? { dark: "#4a5f22", mid: "#6f8a34", light: "#9cb04e", tip: "#d2c87a" } : PAL.grass;
    // turf band
    g.fillStyle = lg(g, 0, Y - 2, 0, Y + 9, [[0, gc.light], [0.5, gc.mid], [1, gc.dark]]);
    g.beginPath(); g.moveTo(X - (oL ? 0.5 : 0), Y - 1.5);
    g.lineTo(X + T + (oR ? 0.5 : 0), Y - 1.5);
    const dip = isMoss ? 5 : 7;
    for (let i = 4; i >= 0; i--) g.lineTo(X + (i / 4) * T, Y + dip + Math.sin(x * 7.3 + i * 2.1) * 1.6 + (r() * 1.5));
    g.closePath(); g.fill();
    if (oL) { g.fillStyle = gc.dark; g.beginPath(); g.moveTo(X - 0.5, Y); g.lineTo(X + 3, Y); g.lineTo(X + 1.5, Y + 12 + r() * 6); g.lineTo(X - 0.5, Y + 10); g.closePath(); g.fill(); }
    if (oR) { g.fillStyle = gc.dark; g.beginPath(); g.moveTo(X + T + 0.5, Y); g.lineTo(X + T - 3, Y); g.lineTo(X + T - 1.5, Y + 12 + r() * 6); g.lineTo(X + T + 0.5, Y + 10); g.closePath(); g.fill(); }
    // blades
    const n = Math.round((isMoss ? 6 : 13) * lush);
    for (let i = 0; i < n; i++) {
      const bx = X + (i + r()) * (T / n), h = (isMoss ? 2.5 : 4) + r() * (isMoss ? 4 : 8) * lush, lean = (r() - 0.5) * 5, w = 1 + r() * 1.1;
      g.fillStyle = r() < 0.3 ? gc.tip : r() < 0.6 ? gc.light : gc.mid;
      g.beginPath(); g.moveTo(bx - w, Y + 1); g.quadraticCurveTo(bx + lean * 0.3, Y - h * 0.6, bx + lean, Y - h); g.quadraticCurveTo(bx + lean * 0.4 + w * 0.3, Y - h * 0.5, bx + w, Y + 1); g.closePath(); g.fill();
    }
    // flowers / clover (meadow most)
    if (!isMoss && r() < 0.16 * lush * lush) {
      const cols = b === 0 ? ["#f4f1ea", "#ffd84a", "#d96aa6", "#8a7cf0", "#ff9a4a"] : ["#f4f1ea", "#ffd84a", "#c79af0"];
      const k = 1 + (r() * 3 | 0);
      for (let i = 0; i < k; i++) {
        const fx = X + 4 + r() * (T - 8), fh = 6 + r() * 7, col = cols[(r() * cols.length) | 0];
        g.strokeStyle = gc.mid; g.lineWidth = 0.9; g.beginPath(); g.moveTo(fx, Y); g.quadraticCurveTo(fx + 1, Y - fh * 0.5, fx + (r() - 0.5) * 2, Y - fh); g.stroke();
        g.fillStyle = col; for (let p = 0; p < 5; p++) { const a = p * 1.2566; g.beginPath(); g.arc(fx + Math.cos(a) * 1.6, Y - fh + Math.sin(a) * 1.6, 1.25, 0, TAU); g.fill(); }
        g.fillStyle = col === "#ffd84a" ? "#c06a1a" : "#ffd84a"; g.beginPath(); g.arc(fx, Y - fh, 0.95, 0, TAU); g.fill();
      }
    }
  }
  function reeds(g, x, y) {
    const X = x * T, Y = y * T, r = rng((hash(x, y, seed + 31) * 4294967296) >>> 0);
    for (let i = 0; i < 6; i++) {
      const bx = X + 3 + r() * (T - 6), h = 14 + r() * 20, lean = (r() - 0.5) * 6;
      g.strokeStyle = r() < 0.5 ? "#55772e" : "#7a9a3c"; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(bx, Y + 1); g.quadraticCurveTo(bx + lean * 0.3, Y - h * 0.6, bx + lean, Y - h); g.stroke();
      if (r() < 0.45) { g.fillStyle = "#6b4426"; g.beginPath(); g.ellipse(bx + lean * 0.9, Y - h + 4, 1.8, 4.5, lean * 0.04, 0, TAU); g.fill(); }
    }
  }

  // ------------------------------------------------------------------ built blocks
  function detailBuilt(g, t, x, y, open) {
    const X = x * T, Y = y * T, r = rng((hash(x, y, seed + 41) * 4294967296) >>> 0);
    if (t === PLANKS) {
      for (let i = 0; i < 4; i++) {
        const by = Y + i * 8, tone = 0.88 + r() * 0.22;
        g.fillStyle = lg(g, 0, by, 0, by + 8, [[0, shade("#c99a5c", tone * 1.08)], [0.6, shade("#b07f45", tone)], [1, shade("#8a5f31", tone)]]);
        g.fillRect(X, by, T, 8);
        g.strokeStyle = "rgba(90,55,25,0.35)"; g.lineWidth = 0.6;
        for (let k = 0; k < 2; k++) { const gy = by + 2 + r() * 4; g.beginPath(); g.moveTo(X, gy); g.bezierCurveTo(X + 10, gy - 1, X + 20, gy + 1.2, X + T, gy); g.stroke(); }
        g.fillStyle = "rgba(40,22,8,0.75)"; g.fillRect(X, by + 7.2, T, 0.9);
        const seam = X + ((i * 13 + (x * 7)) % 4) * 8 + 4;
        g.fillRect(seam, by, 0.9, 8);
        g.fillStyle = "#3e3a36"; g.beginPath(); g.arc(seam - 2.2, by + 4, 0.8, 0, TAU); g.arc(seam + 3, by + 4, 0.8, 0, TAU); g.fill();
      }
    } else if (t === COBBLE) {
      g.fillStyle = "#5a5650"; g.fillRect(X, Y, T, T);
      const cells = [[0, 0, 14, 12], [14, 0, 18, 13], [0, 12, 10, 10], [10, 13, 13, 10], [23, 13, 9, 10], [0, 22, 17, 10], [17, 23, 15, 9]];
      for (const [cx, cy, cw, chh] of cells) {
        const v = 0.85 + r() * 0.3;
        g.fillStyle = lg(g, X + cx, Y + cy, X + cx + cw, Y + cy + chh, [[0, shade("#b4b1a6", v)], [1, shade("#77746b", v)]]);
        g.beginPath(); rrect(g, X + cx + 1, Y + cy + 1, cw - 2, chh - 2, 4); g.fill();
        g.fillStyle = "rgba(255,255,255,0.18)"; g.beginPath(); g.ellipse(X + cx + cw * 0.38, Y + cy + chh * 0.32, cw * 0.22, chh * 0.13, 0, 0, TAU); g.fill();
      }
    } else if (t === BRICK) {
      g.fillStyle = "#cfc4b2"; g.fillRect(X, Y, T, T);
      for (let row = 0; row < 4; row++) {
        const off = (row + y) % 2 ? 8 : 0;
        for (let k = -1; k < 2; k++) {
          const bx = X + k * 16 + off, by = Y + row * 8, v = 0.82 + r() * 0.3;
          const x0 = Math.max(X, bx + 0.8), x1 = Math.min(X + T, bx + 16 - 0.8);
          if (x1 <= x0) continue;
          g.fillStyle = lg(g, 0, by, 0, by + 8, [[0, shade("#c4684a", v * 1.1)], [1, shade("#9a442c", v)]]);
          g.fillRect(x0, by + 0.8, x1 - x0, 6.4);
          g.fillStyle = "rgba(255,220,200,0.18)"; g.fillRect(x0, by + 0.8, x1 - x0, 1.3);
          if (r() < 0.3) { g.fillStyle = "rgba(60,20,10,0.3)"; g.fillRect(x0 + r() * (x1 - x0 - 2), by + 2 + r() * 3, 1.5, 1.2); }
        }
      }
    } else if (t === GLASS) {
      g.fillStyle = "rgba(170,220,240,0.28)"; g.fillRect(X + 2, Y + 2, T - 4, T - 4);
      g.fillStyle = lg(g, X, Y, X + T, Y + T, [[0, "rgba(255,255,255,0.0)"], [0.3, "rgba(255,255,255,0.45)"], [0.38, "rgba(255,255,255,0.05)"], [0.55, "rgba(255,255,255,0.25)"], [0.6, "rgba(255,255,255,0)"], [1, "rgba(255,255,255,0)"]]);
      g.fillRect(X + 2, Y + 2, T - 4, T - 4);
      g.strokeStyle = "#e9e4d6"; g.lineWidth = 2.2; g.strokeRect(X + 1.1, Y + 1.1, T - 2.2, T - 2.2);
      g.strokeStyle = "rgba(90,80,60,0.6)"; g.lineWidth = 0.6; g.strokeRect(X + 2.4, Y + 2.4, T - 4.8, T - 4.8);
    }
    if (t !== GLASS) {
      // placed blocks: crisp bevel + drop shadow where exposed
      if (open(x, y - 1)) { g.fillStyle = "rgba(255,245,220,0.3)"; g.fillRect(X, Y, T, 1.6); }
      if (open(x, y + 1)) { g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(X, Y + T - 2, T, 2); }
      if (open(x - 1, y)) { g.fillStyle = "rgba(255,245,220,0.16)"; g.fillRect(X, Y, 1.4, T); }
      if (open(x + 1, y)) { g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(X + T - 1.6, Y, 1.6, T); }
    }
  }

  // ------------------------------------------------------------------ crack sprites (5 stages x 2 variants)
  function bakeCracks() {
    for (let v = 0; v < 2; v++) for (let st = 0; st < 5; st++) {
      const c = makeCanvas(64, 64), g = c.getContext("2d"); g.scale(2, 2);
      const r = rng(9001 + v * 77);
      g.lineCap = "round"; g.lineJoin = "round";
      const branches = 2 + st * 2;
      for (let b = 0; b < branches; b++) {
        let x = 16 + (r() - 0.5) * 6, y = 16 + (r() - 0.5) * 6;
        const a0 = r() * TAU, len = 4 + st * 3;
        g.beginPath(); g.moveTo(x, y);
        let a = a0;
        for (let k = 0; k < 4; k++) { a += (r() - 0.5) * 1.1; x += Math.cos(a) * len / 3; y += Math.sin(a) * len / 3; g.lineTo(x, y); }
        g.strokeStyle = "rgba(14,10,8,0.85)"; g.lineWidth = 1.5 + st * 0.15; g.stroke();
        g.strokeStyle = "rgba(255,245,225,0.28)"; g.lineWidth = 0.6; g.save(); g.translate(0.8, 0.8); g.stroke(); g.restore();
      }
      if (st >= 3) { g.fillStyle = "rgba(0,0,0," + (0.08 + st * 0.05) + ")"; g.fillRect(0, 0, 32, 32); }
      crackSpr.push(c);
    }
  }

  // ------------------------------------------------------------------ per-frame drawing
  // view rect in tiles: x0..x1, y0..y1. ctx transform = world px.
  function drawChunks(ctx, x0, y0, x1, y1, budgetMs) {
    frameNo++;
    const cx0 = Math.floor(x0 / CH), cx1 = Math.floor(x1 / CH), cy0 = Math.max(0, Math.floor(y0 / CH)), cy1 = Math.min(Math.floor((H - 1) / CH), Math.floor(y1 / CH));
    const t0 = performance.now();
    let baked = 0;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < -1 || cx * CH > W) continue;
      const k = key(cx, cy); let ch = chunks.get(k);
      if (ch && ch.part != null) { while (ch.part != null) bakeStrip(ch, cx, cy); baked++; }   // finish a prefetch
      if (ch && ch.dirty) {
        // small edits (mining / placing) repaint just the touched tiles: cheap, never deferred
        if (ch.dirtyR) repaintRect(ch, cx, cy, ch.dirtyR); else ch.c = bakeChunk(cx, cy, ch.c);
        ch.dirty = false; ch.dirtyR = null;
      }
      if (!ch) {
        // a missing chunk: bake one per frame (more while inside the budget); the rest get a cheap fill this frame
        if (baked === 0 || performance.now() - t0 < budgetMs) {
          const c = bakeChunk(cx, cy, null);
          ch = { c, dirty: false, dirtyR: null, used: frameNo }; chunks.set(k, ch); pxUsed += c.width * c.height;
          baked++;
        } else { placeholder(ctx, cx, cy); continue; }
      }
      ch.used = frameNo;
      blit(ctx, ch.c, cx * CH * T, cy * CH * T, CH * T);
    }
    // prefetch the ring of chunks around the view, one quarter-chunk strip per frame (spreads a ~full-bake cost
    // over several frames, so walking or digging into a new chunk row finds it ready)
    if (baked === 0 && performance.now() - t0 < 2) {
      let best = null, bd = 1e9;
      const mx = (cx0 + cx1) / 2, my = (cy0 + cy1) / 2;
      for (let dy = cy0 - 1; dy <= cy1 + 1; dy++) for (let dx = cx0 - 1; dx <= cx1 + 1; dx++) {
        if (dy >= cy0 && dy <= cy1 && dx >= cx0 && dx <= cx1) continue;
        if (dy < 0 || dy * CH >= H || dx < -1 || dx * CH > W) continue;
        const c = chunks.get(key(dx, dy));
        if (c && c.part == null) continue;
        const d = (c ? -100 : 0) + Math.abs(dx - mx) + Math.abs(dy - my);   // finish a started one first
        if (d < bd) { bd = d; best = [dx, dy, c]; }
      }
      if (best) {
        let [dx, dy, c] = best;
        if (!c) { const px = Math.ceil(CH * T * S); c = { c: makeCanvas(px, px), dirty: false, dirtyR: null, used: frameNo, part: 0 }; chunks.set(key(dx, dy), c); pxUsed += px * px; }
        bakeStrip(c, dx, dy);
      }
    }
    if (pxUsed > PX_BUDGET) evict();
    return baked;
  }
  // stand-in for a chunk not baked yet: plain dark soil below each column's surface (one frame or two at most)
  function placeholder(ctx, cx, cy) {
    const X0 = cx * CH, Y0 = cy * CH;
    ctx.fillStyle = "#3b2c1f";
    for (let x = Math.max(0, X0); x < Math.min(W, X0 + CH); x++) {
      const top = Math.max(Y0, openTop[x]), bot = Math.min(H, Y0 + CH);
      if (bot > top) ctx.fillRect(x * T, top * T, T + 0.5, (bot - top) * T);
    }
  }
  function evict() {
    const arr = [...chunks.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [k, ch] of arr) {
      if (pxUsed <= PX_BUDGET * 0.8 || ch.used >= frameNo - 2) break;
      chunks.delete(k); pxUsed -= ch.c.width * ch.c.height;
    }
  }
  function bakeAllVisible(x0, y0, x1, y1) {
    for (let cy = Math.max(0, Math.floor(y0 / CH)); cy <= Math.min(Math.floor((H - 1) / CH), Math.floor(y1 / CH)); cy++)
      for (let cx = Math.floor(x0 / CH); cx <= Math.floor(x1 / CH); cx++) {
        const k = key(cx, cy); if (chunks.has(k)) continue;
        const c = bakeChunk(cx, cy, null); chunks.set(k, { c, dirty: false, used: frameNo }); pxUsed += c.width * c.height;
      }
  }
  // mining cracks from world.dmg
  function drawCracks(ctx, x0, y0, x1, y1, defs) {
    const dmg = G.world.dmg; if (!dmg || !dmg.size) return;
    for (const [i, d] of dmg) {
      const tx = i % W, ty = (i / W) | 0;
      if (tx < x0 || tx > x1 || ty < y0 || ty > y1) continue;
      const hp = (defs[tiles[i]] && defs[tiles[i]].hp) || 1, f = Math.min(1, d.w / hp);
      if (f <= 0) continue;
      const st = Math.min(4, Math.floor(f * 5)), v = (tx * 7 + ty * 3) & 1;
      ctx.globalAlpha = 0.55 + f * 0.45;
      ctx.drawImage(crackSpr[v * 5 + st], tx * T, ty * T, T, T);
    }
    ctx.globalAlpha = 1;
  }
  // animated water (drawn in FRONT of entities so swimmers look submerged)
  const DEPTH_COL = [];
  for (let i = 0; i < 10; i++) DEPTH_COL.push(css(mix("#3f93b8", "#0c3554", Math.min(1, i / 7)), 0.5 + Math.min(0.32, i * 0.05)));
  function drawWater(ctx, x0, y0, x1, y1, t) {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      let depth = -1;
      for (let y = Math.max(0, y0 - 12); y <= Math.min(H - 1, y1); y++) {
        const c = tiles[y * W + x];
        if (c !== WATER) { depth = -1; continue; }
        depth++;
        if (y < y0) continue;
        const X = x * T, Y = y * T;
        if (depth === 0 && get(x, y - 1) === AIR) {
          // surface cell: wavy top
          ctx.fillStyle = DEPTH_COL[0];
          ctx.beginPath(); ctx.moveTo(X, Y + T);
          for (let k = 0; k <= 4; k++) { const wx = X + k * 8; ctx.lineTo(wx, Y + 4 + Math.sin(wx * 0.11 + t * 2.1) * 1.6 + Math.sin(wx * 0.31 - t * 3.3) * 0.8); }
          ctx.lineTo(X + T, Y + T); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "rgba(220,248,255,0.75)"; ctx.lineWidth = 1.3; ctx.beginPath();
          for (let k = 0; k <= 4; k++) { const wx = X + k * 8, wy = Y + 4 + Math.sin(wx * 0.11 + t * 2.1) * 1.6 + Math.sin(wx * 0.31 - t * 3.3) * 0.8; if (k) ctx.lineTo(wx, wy); else ctx.moveTo(wx, wy); }
          ctx.stroke();
          ctx.fillStyle = "rgba(200,240,255,0.16)"; ctx.fillRect(X, Y + 6, T, 5);
          const gl = Math.sin(x * 1.7 + t * 1.3);
          if (gl > 0.6) { ctx.fillStyle = "rgba(255,255,255," + ((gl - 0.6) * 1.6).toFixed(2) + ")"; ctx.fillRect(X + 6 + (x * 13) % 14, Y + 7, 6, 1.2); }
        } else {
          ctx.fillStyle = DEPTH_COL[Math.min(9, depth)];
          ctx.fillRect(X, Y, T, T);
          // soft light shafts near the top
          if (depth < 5) { const s = Math.sin(x * 0.9 + t * 0.6) * 0.5 + 0.5; if (s > 0.55) { ctx.fillStyle = "rgba(190,235,255," + ((s - 0.55) * 0.25 * (1 - depth / 5)).toFixed(3) + ")"; ctx.fillRect(X + 4, Y, 10, T); } }
        }
      }
    }
  }
  // glinting ore (emissive pass): gold sparkles + crystal glow, returned for the light map
  function oreGlints(x0, y0, x1, y1, out) {
    out.length = 0;
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      const c = tiles[y * W + x];
      if ((c === GOLD || c === CRYSTAL) && (!SOLIDISH[get(x - 1, y)] || !SOLIDISH[get(x + 1, y)] || !SOLIDISH[get(x, y - 1)] || !SOLIDISH[get(x, y + 1)] || c === CRYSTAL)) out.push(x, y, c);
    }
    return out;
  }

  return {
    setGame, setScale, onTile, drawChunks, bakeAllVisible, drawCracks, drawWater, oreGlints, clear,
    get openTop() { return openTop; }, get scale() { return S; }, get count() { return chunks.size; },
    get, SOLIDISH,
  };
}
