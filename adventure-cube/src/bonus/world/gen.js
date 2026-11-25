// gen.js - seeded world generation for the bonus level (WORLD owns; API frozen: BONUS.md 3.2). DOM-free.
// generateWorld(seed) -> { W, H, seed, tiles, surface, biome, segments, river, spawn, houseX, houseY, protect,
//                          trees, objects, nextId,
//                          + WORLD additions: ponds [{x0, x1, waterTop}], treeTarget, natTarget {kind: n} }
// Exact arithmetic only (core/rng.js noise + the seeded rng): the same seed rebuilds the same world in any
// browser, so a save stores only the seed + the tiles that changed (world.mods).
//
// Passes: 1 biome layout -> 2 surface heights -> 3 ponds -> 4 columns (soil, snow, sand, bedrock) -> 5 soft
// pockets (clay, sand, gravel, dirt) -> 6 caves (worms, caverns, surface entrances) -> 7 underground pools ->
// 8 moss -> 9 ores (+ crystal geodes, guaranteed deposits) -> 10 live surface -> 11 trees + objects (+ caves)
import { WORLD_W, WORLD_H, PLOT_W } from "../core/const.js";
import { hash2, createRng, noise1, fbm1, fbm2, noise2 } from "../core/rng.js";
import { TILE, BIOME, BIOMES, TREE_DEFS, OBJECT_DEFS, SOLID } from "../data/tiles.js";

export const SURF = 46;        // meadow ground row (first solid row) at spawn and on the house plot
export const SPAWN_X = 400;    // spawn column; the house plot starts at SPAWN_X + 4
export const SNOW_ROW = SURF - 21; // hill tops above this row wear snow

// biome height params: off = rows above (-) / below (+) SURF, amp = hill amplitude in rows, freq = hill frequency,
// det = small post-smoothing detail (rows) so slopes are not too regular
const BH = [
  /* meadow */ { off: 0, amp: 2.5, freq: 0.035, det: 0.5 },
  /* forest */ { off: -1, amp: 5, freq: 0.05, det: 1 },
  /* pinewood */ { off: -3, amp: 8, freq: 0.06, det: 1.4 },
  /* hills */ { off: -13, amp: 18, freq: 0.045, det: 2.6 },
  /* river */ { off: 0, amp: 1, freq: 0.05, det: 0 },
];

export function generateWorld(seed) {
  seed = (seed >>> 0) || 1;
  const W = WORLD_W, H = WORLD_H;
  const R = createRng(seed ^ 0x9e3779b9);
  const tiles = new Uint8Array(W * H);
  const biome = new Uint8Array(W);
  const surface = new Int16Array(W);
  const idx = (x, y) => y * W + x;

  // ---- 1. biome layout (macro layout fixed, boundaries jittered by the seed) ----
  const j = (n) => R.int(-n, n);
  const b1 = 105 + j(10), b2 = 235 + j(10), r0 = 318 + j(6), r1 = r0 + 16 + R.int(0, 4), m0 = 372 + j(3), m1 = 478 + j(6);
  const b3 = 600 + j(10), b4 = 690 + j(10);
  const segments = [
    [BIOME.HILLS, 0, b1], [BIOME.PINEWOOD, b1, b2], [BIOME.FOREST, b2, r0], [BIOME.RIVER, r0, r1], [BIOME.FOREST, r1, m0],
    [BIOME.MEADOW, m0, m1], [BIOME.FOREST, m1, b3], [BIOME.PINEWOOD, b3, b4], [BIOME.HILLS, b4, W],
  ];
  for (const [b, x0, x1] of segments) for (let x = x0; x < x1; x++) biome[x] = b;

  const spawnX = SPAWN_X, houseX = SPAWN_X + 4, houseY = SURF;
  const homeL = spawnX - 30, homeR = houseX + PLOT_W + 30;          // no shallow caves / ponds / entrances here
  const nearHome = (x, m = 0) => x > homeL - m && x < homeR + m;
  const nearRiver = (x, m) => x > r0 - m && x < r1 + m;

  // ---- 2. surface heights: per-biome hills, smoothed across biome borders, then fine detail ----
  const raw = new Float64Array(W), det = new Float64Array(W);
  for (let x = 0; x < W; x++) {
    const p = BH[biome[x]];
    let h = SURF + p.off + (fbm1(x * p.freq, seed + 11, 4) - 0.5) * 2 * p.amp;
    // hills: a ridged second octave gives sharper peaks and saddles
    if (biome[x] === BIOME.HILLS) h -= (1 - Math.abs(2 * noise1(x * 0.028, seed + 12) - 1)) * 7 - 3.5;
    raw[x] = h; det[x] = p.det;
  }
  const sm = new Float64Array(W), dsm = new Float64Array(W);
  const K = 7;
  for (let x = 0; x < W; x++) {
    let s = 0, d = 0, n = 0;
    for (let k = -K; k <= K; k++) { const xx = Math.min(W - 1, Math.max(0, x + k)); s += raw[xx]; d += det[xx]; n++; }
    sm[x] = s / n + (fbm1(x * 0.19, seed + 13, 2) - 0.5) * 2 * (d / n);
  }
  // flatten spawn + plot (with soft shoulders), keep river banks at or above the water line
  const flatL = spawnX - 3, flatR = houseX + PLOT_W + 2;
  for (let x = 0; x < W; x++) {
    let h = sm[x];
    const d = x < flatL ? flatL - x : x > flatR ? x - flatR : 0;
    if (d < 10) { const t = d / 10; h = SURF + (h - SURF) * t * t * (3 - 2 * t); }
    if (x >= r0 - 8 && x < r1 + 8) h = Math.min(h, SURF);
    surface[x] = Math.max(8, Math.min(H - 30, Math.floor(h + 0.5)));
  }

  // ---- 3. water columns: the river + a few forest / pinewood ponds ----
  const waterTop = SURF + 1;
  const wTop = new Int16Array(W).fill(-1), wBed = new Int16Array(W);
  for (let x = r0; x < r1; x++) {
    const u = (x - r0 + 0.5) / (r1 - r0);              // 0..1 across the river
    const depth = 2 + Math.floor(5 * (1 - (2 * u - 1) * (2 * u - 1)));
    wTop[x] = waterTop; wBed[x] = waterTop + depth;
  }
  const ponds = [];
  for (const [b, x0, x1] of segments) {
    if (b !== BIOME.FOREST && b !== BIOME.PINEWOOD) continue;
    const want = x1 - x0 > 90 ? 2 : x1 - x0 > 45 ? 1 : 0;
    for (let k = 0; k < want; k++) {
      const pw = R.int(7, 12);
      let best = -1, bestV = 1e9;
      for (let c = 0; c < 8; c++) {
        const px = x0 + 8 + R.int(0, Math.max(0, x1 - x0 - pw - 16));
        if (nearHome(px, 15) || nearHome(px + pw, 15) || nearRiver(px, 14) || nearRiver(px + pw, 14)) continue;
        if (ponds.some((q) => px < q.x1 + 14 && px + pw > q.x0 - 14)) continue;
        let lo = 1e9, hi = -1e9;
        for (let x = px - 3; x < px + pw + 3; x++) { lo = Math.min(lo, surface[x]); hi = Math.max(hi, surface[x]); }
        if (hi - lo < bestV) { bestV = hi - lo; best = px; }
      }
      if (best < 0 || bestV > 6) continue;
      const px = best;
      let sum = 0; for (let x = px; x < px + pw; x++) sum += surface[x];
      const L = Math.round(sum / pw);                  // bank row; water starts one row below
      for (let x = px - 4; x < px + pw + 4; x++) {     // banks: fill dips up to the bank row, ease steep shoulders
        if (x >= px && x < px + pw) continue;
        const e = x < px ? px - x : x - (px + pw - 1);
        surface[x] = Math.min(surface[x], L + (e > 2 ? 1 : 0));
        if (surface[x] < L - e) surface[x] = L - e;
      }
      for (let x = px; x < px + pw; x++) {
        const u = (x - px + 0.5) / pw;
        wTop[x] = L + 1; wBed[x] = L + 1 + 1 + Math.floor(3 * (1 - (2 * u - 1) * (2 * u - 1)));
      }
      ponds.push({ x0: px, x1: px + pw, waterTop: L + 1 });
    }
  }

  // ---- 4. fill columns: grass / snow / moss caps, dirt, stone, jagged bedrock; sand under water ----
  for (let x = 0; x < W; x++) {
    let s = surface[x];
    const wet = wTop[x] >= 0, bed = wet ? wBed[x] : s;
    if (wet) surface[x] = s = bed;
    const b = biome[x];
    const dirtDepth = b === BIOME.HILLS ? 1 + Math.floor(hash2(x, 1, seed) * 3) : (b === BIOME.MEADOW ? 4 : 3) + Math.floor(fbm1(x * 0.1, seed + 3, 2) * 4);
    const steep = x > 0 && x < W - 1 && (Math.abs(surface[x - 1] - s) >= 2 || Math.abs(surface[x + 1] - s) >= 2);
    const rock = Math.floor(noise1(x * 0.37, seed + 5) * 2.99);    // 0..2 extra bedrock rows
    for (let y = 0; y < H; y++) {
      let t = TILE.AIR;
      if (wet && y >= wTop[x] && y < bed) t = TILE.WATER;
      else if (y >= s) {
        const dd = y - s;
        if (dd === 0) {
          if (wet) t = TILE.SAND;
          else if (b === BIOME.HILLS && s < SNOW_ROW && !steep) t = TILE.SNOW;
          else if (b === BIOME.HILLS && (steep || s < SURF - 20)) t = TILE.MOSSY;
          else t = TILE.GRASS;
        } else if (dd < dirtDepth) t = wet ? (dd < 2 ? TILE.SAND : TILE.CLAY) : TILE.DIRT;
        else if (dd < dirtDepth + 3 && noise2(x * 0.3, y * 0.5, seed + 7) > 0.62) t = TILE.DIRT;  // ragged soil line
        else t = TILE.STONE;
      }
      if (y >= H - 2 - rock || (y === H - 3 - rock && hash2(x, y, seed) < 0.5)) t = TILE.BEDROCK;
      tiles[idx(x, y)] = t;
    }
  }
  // sand banks next to the river and the ponds
  const banks = (x0, x1, m, rows) => {
    for (let x = x0 - m; x < x1 + m; x++) {
      if (x < 0 || x >= W || wTop[x] >= 0) continue;
      const s = surface[x], e = x < x0 ? x0 - x : x - x1 + 1;
      for (let y = s; y < s + rows - (e > m - 2 ? 1 : 0); y++) tiles[idx(x, y)] = TILE.SAND;
    }
  };
  banks(r0, r1, 4, 2);
  for (const q of ponds) banks(q.x0, q.x1, 2, 1);

  // ---- 5. soft pockets: clay near water + meadow, sand lenses near water, gravel + dirt pockets in stone ----
  const nearPond = (x, m) => ponds.some((q) => x > q.x0 - m && x < q.x1 + m);
  for (let x = 0; x < W; x++) {
    const s = surface[x], wetZone = nearRiver(x, 26) || nearPond(x, 12), meadow = biome[x] === BIOME.MEADOW;
    for (let y = s + 1; y < H - 5; y++) {
      const i = idx(x, y), t = tiles[i];
      if (t !== TILE.DIRT && t !== TILE.STONE) continue;
      const d = y - s;
      if (d < 9 && (wetZone || meadow) && noise2(x * 0.18, y * 0.3, seed + 21) > (wetZone ? 0.68 : 0.74)) tiles[i] = TILE.CLAY;
      else if (d < 7 && wetZone && t === TILE.DIRT && noise2(x * 0.2, y * 0.35, seed + 22) > 0.7) tiles[i] = TILE.SAND;
      else if (t === TILE.STONE && noise2(x * 0.15, y * 0.15, seed + 23) > 0.88) tiles[i] = TILE.GRAVEL;
      else if (t === TILE.STONE && d < 26 && noise2(x * 0.11, y * 0.13, seed + 24) > 0.86) tiles[i] = TILE.DIRT;
    }
  }

  // ---- 6. caves: worm tunnels + deep caverns + a few surface entrances (none near home) ----
  for (let x = 1; x < W - 1; x++) {
    const s = surface[x], hills = biome[x] === BIOME.HILLS, home = nearHome(x);
    const top = s + (hills ? 4 : home ? 14 : 7);
    for (let y = top; y < H - 4; y++) {
      const i = idx(x, y);
      if (tiles[i] === TILE.WATER || tiles[i] === TILE.BEDROCK) continue;
      const worm = Math.abs(fbm2(x * 0.045, y * 0.07, seed + 31, 3) - 0.5) < (hills ? 0.034 : 0.024);
      const cavern = y > s + 18 && noise2(x * 0.05, y * 0.08, seed + 37) > (hills ? 0.75 : 0.8);
      if (worm || cavern) tiles[i] = TILE.AIR;
    }
  }
  const carve = (cx, cy, r) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 1 || x >= W - 1 || y < 1 || y >= H - 5) continue;
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r + 0.3) continue;
      const i = idx(x, y);
      if (tiles[i] !== TILE.WATER && tiles[i] !== TILE.BEDROCK) tiles[i] = TILE.AIR;
    }
  };
  const ENTR = { [BIOME.HILLS]: 3, [BIOME.PINEWOOD]: 2, [BIOME.FOREST]: 1 };
  for (const [b, x0, x1] of segments) {
    const n = ENTR[b] || 0;
    for (let k = 0; k < n; k++) {
      let ex = x0 + Math.floor(((k + 0.25 + R() * 0.5) / n) * (x1 - x0));
      if (nearHome(ex, 22) || nearRiver(ex, 14) || nearPond(ex, 6) || ex < 6 || ex > W - 7) continue;
      let dir = R() < 0.5 ? -1 : 1, cy = surface[ex] - 1, cx = ex + 0.5;
      const len = R.int(26, 44);
      for (let st = 0; st < len; st++) {
        carve(cx, cy, st < 3 ? 1.2 : 1.1 + noise1(st * 0.3, seed + ex) * 0.9);
        cx += dir * (0.55 + R() * 0.5); cy += 0.55 + R() * 0.45;
        if (R() < 0.08) dir = -dir;
        if (nearHome(Math.floor(cx), 16) || nearRiver(Math.floor(cx), 8)) break;
      }
    }
  }
  // never carve under the river or the ponds (no draining)
  for (let x = r0 - 2; x < r1 + 2; x++) for (let y = waterTop; y < SURF + 12; y++) if (tiles[idx(x, y)] === TILE.AIR && y >= surface[x]) tiles[idx(x, y)] = TILE.STONE;
  for (const q of ponds) for (let x = q.x0 - 2; x < q.x1 + 2; x++) for (let y = q.waterTop; y < q.waterTop + 10; y++) if (tiles[idx(x, y)] === TILE.AIR && y >= surface[x]) tiles[idx(x, y)] = TILE.STONE;

  // ---- 7. underground pools: cavern floors fill with still water (bottom-up, at most 3 rows deep) ----
  const depth = new Uint8Array(W * H);
  for (let y = H - 6; y > SURF + 8; y--) {
    let x = 1;
    while (x < W - 1) {
      if (tiles[idx(x, y)] !== TILE.AIR || !SOLID[tiles[idx(x - 1, y)]]) { x++; continue; }
      let e = x, ok = true, deep = 0, wetBelow = 0;
      while (e < W - 1 && tiles[idx(e, y)] === TILE.AIR) {
        const below = tiles[idx(e, y + 1)];
        if (below === TILE.WATER) { deep = Math.max(deep, depth[idx(e, y + 1)]); wetBelow++; }
        else if (!SOLID[below]) ok = false;
        if (tiles[idx(e, y - 1)] !== TILE.AIR && tiles[idx(e, y - 1)] !== TILE.WATER) ok = ok && wetBelow > 0; // no thin tunnel puddles
        if (y < surface[e] + 26 || nearHome(e)) ok = false;
        e++;
      }
      if (ok && SOLID[tiles[idx(e, y)]] && e - x <= 34 && (wetBelow > 0 || e - x >= 5) && deep < 3 && noise2(x * 0.04, y * 0.05, seed + 39) > 0.5) {
        for (let k = x; k < e; k++) { tiles[idx(k, y)] = TILE.WATER; depth[idx(k, y)] = deep + 1; }
      }
      x = e + 1;
    }
  }

  // ---- 8. moss on damp cave walls (forest / pinewood / river, shallow) and around pools ----
  const exposed = (x, y) => tiles[idx(x - 1, y)] === TILE.AIR || tiles[idx(x + 1, y)] === TILE.AIR || tiles[idx(x, y - 1)] === TILE.AIR || tiles[idx(x, y + 1)] === TILE.AIR;
  const wetNb = (x, y) => tiles[idx(x - 1, y)] === TILE.WATER || tiles[idx(x + 1, y)] === TILE.WATER || tiles[idx(x, y - 1)] === TILE.WATER;
  for (let x = 1; x < W - 1; x++) {
    const s = surface[x], damp = biome[x] === BIOME.FOREST || biome[x] === BIOME.PINEWOOD || biome[x] === BIOME.RIVER;
    for (let y = s + 2; y < H - 5; y++) {
      const i = idx(x, y);
      if (tiles[i] !== TILE.STONE) continue;
      if ((damp && y < s + 28 && exposed(x, y) && noise2(x * 0.25, y * 0.25, seed + 45) > 0.55) || (wetNb(x, y) && y > s + 10)) tiles[i] = TILE.MOSSY;
    }
  }

  // ---- 9. ores (stone only), deeper = rarer; hills richer, pinewood a bit richer in iron ----
  for (let x = 0; x < W; x++) {
    const s = surface[x], hills = biome[x] === BIOME.HILLS, rich = hills ? 0.025 : 0, ironR = rich + (biome[x] === BIOME.PINEWOOD ? 0.012 : 0);
    for (let y = s + 3; y < H - 2; y++) {
      const i = idx(x, y);
      if (tiles[i] !== TILE.STONE) continue;
      const d = y - s;
      if (d >= 52 && noise2(x * 0.3, y * 0.3, seed + 41) > 0.94 - rich) tiles[i] = TILE.CRYSTAL;
      else if (d >= 34 && noise2(x * 0.28, y * 0.28, seed + 43) > 0.93 - rich) tiles[i] = TILE.GOLD_ORE;
      else if (d >= 12 && noise2(x * 0.26, y * 0.26, seed + 47) > 0.9 - ironR) tiles[i] = TILE.IRON_ORE;
      else if (d >= 3 && noise2(x * 0.24, y * 0.36, seed + 53) > 0.88 - rich) tiles[i] = TILE.COAL_ORE;  // flatter seams
    }
  }
  // crystal geodes: deep cave walls sometimes sparkle
  for (let x = 1; x < W - 1; x++) {
    const s = surface[x];
    for (let y = s + 48; y < H - 4; y++) {
      const i = idx(x, y);
      if (tiles[i] === TILE.STONE && exposed(x, y) && noise2(x * 0.09, y * 0.09, seed + 57) > 0.8 && hash2(x, y, seed + 58) < 0.5) tiles[i] = TILE.CRYSTAL;
    }
  }
  // guaranteed deposits near home (so a run never depends on luck) and far away
  const blob = (cx, cy, n, t) => {
    let x = cx, y = cy;
    for (let k = 0; k < n; k++) {
      if (x > 0 && x < W - 1 && y > 0 && y < H - 3) { const i = idx(x, y); if (tiles[i] !== TILE.WATER && tiles[i] !== TILE.BEDROCK) tiles[i] = t; }
      const r = hash2(k, cx * 31 + cy, seed + t);
      if (r < 0.25) x++; else if (r < 0.5) x--; else if (r < 0.75) y++; else y--;
    }
  };
  blob(spawnX - 13, SURF + 2, 8, TILE.CLAY);
  blob(spawnX - 24, SURF + 3, 10, TILE.CLAY);
  blob(spawnX - 22, surface[spawnX - 22] + 5, 7, TILE.COAL_ORE);
  blob(houseX + PLOT_W + 10, surface[houseX + PLOT_W + 10] + 7, 7, TILE.COAL_ORE);
  blob(spawnX - 34, surface[spawnX - 34] + 16, 6, TILE.IRON_ORE);
  blob(houseX + PLOT_W + 22, surface[houseX + PLOT_W + 22] + 18, 6, TILE.IRON_ORE);
  blob(60, surface[60] + 38, 6, TILE.GOLD_ORE);
  blob(W - 60, surface[W - 60] + 38, 6, TILE.GOLD_ORE);
  blob(70, surface[70] + 56, 6, TILE.CRYSTAL);
  blob(W - 70, surface[W - 70] + 56, 6, TILE.CRYSTAL);

  // ---- 10. live surface (first solid-or-water row per column) after caves ----
  for (let x = 0; x < W; x++) { let y = 0; while (y < H - 1 && tiles[idx(x, y)] === TILE.AIR) y++; surface[x] = y; }

  // ---- 11. trees (groves + clearings) and natural objects ----
  let nextId = 1;
  const trees = [], objects = [], used = new Uint8Array(W);
  const plotL = houseX - 3, plotR = houseX + PLOT_W + 2;
  const ground = (x) => tiles[idx(x, surface[x])];
  const okCol = (x) => x > 2 && x < W - 3 && !used[x] && !(x >= plotL && x <= plotR) && !(x >= spawnX - 1 && x <= spawnX + 1) &&
    !nearRiver(x, 2) && wTop[x] < 0 && (ground(x) === TILE.GRASS || ground(x) === TILE.SNOW) &&
    Math.abs(surface[x - 1] - surface[x]) <= 1 && Math.abs(surface[x + 1] - surface[x]) <= 1 &&
    tiles[idx(x, surface[x] - 1)] === TILE.AIR;
  const addTree = (kind, x) => {
    const def = TREE_DEFS[kind];
    trees.push({ id: nextId++, kind, x, y: surface[x], stage: 3, hp: def.hp, growT: 0, fruit: def.fruit && hash2(x, 7, seed) < 0.35 ? 1 + Math.floor(hash2(x, 8, seed) * 3) : 0, seed: Math.floor(hash2(x, 9, seed) * 1e6) });
    used[x] = 1; if (x > 0) used[x - 1] = 1; if (x < W - 1) used[x + 1] = 1;
  };
  const addObj = (kind, x, y) => {
    if (y == null) { y = surface[x] - 1; used[x] = 1; }
    objects.push({ id: nextId++, kind, x, y, hp: OBJECT_DEFS[kind].hp, t: 0, n: kind === "bush" ? 3 : 0, seed: Math.floor(hash2(x, 13 + y, seed) * 1e6) });
  };
  // guaranteed starter trees + rocks west of spawn (the house plot is east)
  addTree("oak", spawnX - 5); addTree("birch", spawnX - 10);
  addObj("boulder", spawnX - 7); addObj("boulder", spawnX - 16); addObj("tallgrass", spawnX - 3); addObj("bush", spawnX - 13);
  let x = 3;
  while (x < W - 3) {
    const b = biome[x];
    const grove = noise1(x * 0.045, seed + 61);         // 0 = clearing .. 1 = dense grove
    let gap;
    if (b === BIOME.FOREST) gap = grove > 0.55 ? R.int(3, 5) : grove > 0.25 ? R.int(5, 8) : R.int(9, 15);
    else if (b === BIOME.PINEWOOD) gap = grove > 0.35 ? R.int(3, 5) : R.int(6, 10);
    else if (b === BIOME.MEADOW) gap = R.int(13, 24);
    else if (b === BIOME.HILLS) gap = surface[x] < SNOW_ROW ? R.int(12, 20) : R.int(7, 13);
    else gap = 3;
    if (b !== BIOME.RIVER && okCol(x) && !nearHome(x, -24)) {
      const r = R();
      const birchy = noise1(x * 0.03, seed + 63) > 0.6;
      let kind = "oak";
      if (b === BIOME.FOREST) kind = birchy ? (r < 0.8 ? "birch" : "oak") : (r < 0.78 ? "oak" : "birch");
      else if (b === BIOME.PINEWOOD) kind = r < 0.06 ? "ancient" : r < 0.92 ? "pine" : "oak";
      else if (b === BIOME.HILLS) kind = "pine";
      else kind = r < 0.65 ? "oak" : "birch";
      if (kind === "ancient" && !(okCol(x - 2) && okCol(x + 2))) kind = "pine";
      addTree(kind, x);
      if (kind === "ancient") { used[x - 2] = used[x + 2] = 1; }
      x += gap;
    } else x += b === BIOME.RIVER ? gap : 1;   // a slope or a pond here: try the next column
  }
  const OBJ_P = [ // per biome: [kind, chance] (flowers + bushes come in patches, see below)
    [["tallgrass", 0.15], ["flowers", 0.09], ["bush", 0.06], ["boulder", 0.015]],
    [["tallgrass", 0.07], ["bush", 0.05], ["mushroom", 0.04], ["boulder", 0.02], ["flowers", 0.02]],
    [["mushroom", 0.07], ["boulder", 0.04], ["tallgrass", 0.03], ["bush", 0.02]],
    [["boulder", 0.1], ["tallgrass", 0.05], ["flowers", 0.02]],
    [],
  ];
  for (let x = 3; x < W - 3; x++) {
    if (used[x] || (x >= plotL && x <= plotR) || wTop[x] >= 0) continue;
    const t = ground(x);
    if (t !== TILE.GRASS && t !== TILE.MOSSY && t !== TILE.SNOW) continue;
    if (tiles[idx(x, surface[x] - 1)] !== TILE.AIR) continue;
    if (t === TILE.SNOW && hash2(x, 19, seed) > 0.3) continue;            // snow fields stay mostly bare
    const patch = noise1(x * 0.08, seed + 65) * 1.6;                       // 0..1.6: patches of flowers / berries
    const r = hash2(x, 17, seed);
    let acc = 0;
    for (const [kind, p] of OBJ_P[biome[x]]) { acc += p * (kind === "flowers" || kind === "bush" ? patch : 1); if (r < acc) { addObj(kind, x); break; } }
  }
  const natTarget = {};
  for (const o of objects) natTarget[o.kind] = (natTarget[o.kind] || 0) + 1;
  // cave floors: mushrooms in damp caves, loose rocks everywhere (not counted in the surface respawn targets)
  for (let x = 3; x < W - 3; x++) {
    const s = surface[x], damp = biome[x] !== BIOME.HILLS;
    let lastY = -9;
    for (let y = s + 6; y < H - 5; y++) {
      if (tiles[idx(x, y)] !== TILE.AIR || tiles[idx(x, y - 1)] !== TILE.AIR) continue;
      const g = tiles[idx(x, y + 1)];
      if (g !== TILE.STONE && g !== TILE.DIRT && g !== TILE.MOSSY && g !== TILE.GRAVEL) continue;
      if (y - lastY < 3) continue;
      const r = hash2(x, y, seed + 71);
      if (damp && r < 0.045) { addObj("mushroom", x, y); lastY = y; }
      else if (r > 0.97) { addObj("boulder", x, y); lastY = y; }
    }
  }

  return {
    W, H, seed, tiles, surface, biome, segments: segments.map(([b, x0, x1]) => [BIOMES[b], x0, x1]),
    river: { x0: r0, x1: r1, waterTop },
    ponds,                                                // WORLD addition: still forest ponds
    spawn: { x: spawnX, y: surface[spawnX] },            // tile column + ground row (feet on top of that row)
    houseX, houseY,                                       // plot left column, plot ground row (first solid row)
    protect: { x0: houseX, y0: houseY - 24, x1: houseX + PLOT_W - 1, y1: houseY + 2 }, // tiles no one may edit
    trees, objects, nextId,
    treeTarget: trees.length, natTarget,                  // WORLD addition: natural respawn keeps these counts
  };
}

// FNV hash of the tile array (tests: same seed -> same world)
export function worldHash(world) {
  let h = 2166136261;
  const t = world.tiles;
  for (let i = 0; i < t.length; i++) { h ^= t[i]; h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, "0");
}
