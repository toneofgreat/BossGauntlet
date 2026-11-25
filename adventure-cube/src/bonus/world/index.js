// world/index.js - the living world: tiles, mining, trees (chop / fall / regrow / reseed), objects (stations,
// chests, bushes, rocks, torches), placing, ground drops + pickup, and the slow natural renewal that keeps
// resources from ever running out (WORLD owns; API frozen: BONUS.md 3). DOM-free, G.rng only.
//
// Renewal (all off-screen, >= RENEW_DIST tiles from the cube, so nothing pops in front of the player):
//   - stumps regrow into saplings -> young -> mature trees; mature oaks regrow apples at dawn
//   - forests reseed saplings while there are fewer trees than the world started with (world.treeTarget)
//   - natural objects (tall grass, flowers, bushes, mushrooms, loose rocks) respawn up to world.natTarget
//   - mined ore / clay / sand is owed back (world.debt) and re-forms as small deposits in untouched rock
//   - bare dirt under the open sky grows grass again; cracks heal after DMG_FORGET steps without hits
// WORLD additions (compatible): RENEW_DIST, RESPAWN, world.base (generated tiles), world.debt, world.bare,
//   world.treeTarget, world.natTarget, world.ponds; "obj:regrow" also fires for a respawned natural object and
//   "tree:plant" carries natural: true for a reseeded sapling; tiles next to water flood when broken.
import { T, PLOT_W } from "../core/const.js";
import { tileAt, moveBody } from "../core/physics.js";
import { TILE, TILE_DEFS, TREE_DEFS, TREE_GROW, OBJECT_DEFS, PLACE_TILE, BIOME, SOLID, isSolid, isLiquid } from "../data/tiles.js";
import { ITEMS } from "../data/items.js";
import { createInv, invAdd, invSave, invLoad } from "../craft/inventory.js";
import { SNOW_ROW } from "./gen.js";

const DROP = 12;            // drop body size px
const DROP_LIFE = 18000;    // steps (5 min)
const DROP_MAX = 180;       // ground drops kept at once (oldest go first)
const MAGNET = 2.4;         // tiles: drops fly to the player from this far
const PICKUP = 0.7;         // tiles
const DMG_FORGET = 240;     // steps without hits before a cracked tile heals
export const RENEW_DIST = 26; // tiles: renewal only happens at least this far from the cube

// mined tiles that re-form elsewhere: code -> { from: base tile codes it may replace, d: [min, max] rows below
// the generated surface, where: column filter, blob: max tiles per deposit }
export const RESPAWN = {
  [TILE.COAL_ORE]: { from: [TILE.STONE], d: [3, 60], blob: 4 },
  [TILE.IRON_ORE]: { from: [TILE.STONE], d: [12, 70], blob: 4 },
  [TILE.GOLD_ORE]: { from: [TILE.STONE], d: [34, 85], blob: 3 },
  [TILE.CRYSTAL]: { from: [TILE.STONE], d: [52, 95], blob: 3 },
  [TILE.CLAY]: { from: [TILE.DIRT, TILE.STONE], d: [1, 9], where: "wet", blob: 4 },
  [TILE.SAND]: { from: [TILE.DIRT], d: [1, 6], where: "wet", blob: 4 },
};
// natural object kinds that may respawn in each biome (index = BIOME)
const NAT_BIOME = [
  ["tallgrass", "flowers", "bush", "boulder"],
  ["tallgrass", "bush", "mushroom", "boulder", "flowers"],
  ["mushroom", "boulder", "tallgrass", "bush"],
  ["boulder", "tallgrass", "flowers"],
  [],
];

// ------------------------------------------------------------------ lifecycle
export function init(G) {
  const w = G.world;
  w.base = new Uint8Array(w.tiles);   // the generated tiles (mods are the diff against these)
  w.mods = w.mods || new Map();       // tile index -> code (saved)
  w.dmg = new Map();                  // tile index -> { w: work so far, t: frame of last hit }
  w.drops = w.drops || [];
  w.debt = {};                        // tile code -> tiles owed back by renewal (saved)
  w.bare = new Set();                 // dirt cells that may grow grass again (rebuilt on load)
  if (w.treeTarget == null) w.treeTarget = w.trees.length;
  w.natTarget = {};
  for (const o of w.objects) if (OBJECT_DEFS[o.kind] && OBJECT_DEFS[o.kind].natural) w.natTarget[o.kind] = (w.natTarget[o.kind] || 0) + 1;
  w.ponds = w.ponds || [];
  rebuildLights(G);
  G.bus.on("time:day", () => {
    for (const tr of w.trees) { const d = TREE_DEFS[tr.kind]; if (tr.stage === 3 && d.fruit && tr.fruit < 3 && G.rng() < 0.5) tr.fruit++; }
  });
}

export function step(G) {
  const w = G.world, f = G.frame;
  stepDrops(G);
  if (f % 30 === 0) for (const [i, d] of w.dmg) if (f - d.t > DMG_FORGET) { w.dmg.delete(i); G.bus.emit("tile:heal", { tx: i % w.W, ty: Math.floor(i / w.W) }); }
  if (f % 60 === 0) {
    for (const tr of w.trees) {
      if (tr.stage >= 3) continue;
      tr.growT -= 60;
      if (tr.growT <= 0) {
        tr.stage++;
        tr.growT = tr.stage === 1 ? TREE_GROW.saplingToYoung : tr.stage === 2 ? TREE_GROW.youngToMature : 0;
        tr.hp = TREE_DEFS[tr.kind].hp;
        G.bus.emit("tree:grow", { tree: tr });
      }
    }
    for (const o of w.objects) {
      if (o.kind === "bush" && o.n === 0) { o.t -= 60; if (o.t <= 0) { o.n = 3; G.bus.emit("obj:regrow", { obj: o }); } }
    }
  }
  if (f % 150 === 75) regrowGrass(G);
  if (f % 300 === 140) respawnNatural(G);
  if (f % 600 === 290) reseedTree(G);
  if (f % 900 === 450) renewDeposits(G);
}

// ---- save: compact. Tile mods are run-length encoded: "delta:code[*run],..." in base 36, sorted by index ----
export function encodeMods(mods) {
  const keys = Array.from(mods.keys()).sort((a, b) => a - b), out = [];
  let prev = -1, k = 0;
  while (k < keys.length) {
    const i0 = keys[k], c = mods.get(i0);
    let run = 1;
    while (k + run < keys.length && keys[k + run] === i0 + run && mods.get(keys[k + run]) === c) run++;
    out.push((i0 - prev).toString(36) + ":" + c.toString(36) + (run > 1 ? "*" + run.toString(36) : ""));
    prev = i0 + run - 1; k += run;
  }
  return out.join(",");
}
export function decodeMods(s) {
  const out = [];
  if (Array.isArray(s)) { for (let k = 0; k + 1 < s.length; k += 2) out.push([s[k] | 0, s[k + 1] | 0]); return out; } // v1 flat [i, c, ...]
  if (typeof s !== "string" || !s) return out;
  let prev = -1;
  for (const tok of s.split(",")) {
    const m = /^([0-9a-z]+):([0-9a-z]+)(?:\*([0-9a-z]+))?$/.exec(tok);
    if (!m) continue;
    const i0 = prev + parseInt(m[1], 36), c = parseInt(m[2], 36), run = m[3] ? parseInt(m[3], 36) : 1;
    for (let r = 0; r < run; r++) out.push([i0 + r, c]);
    prev = i0 + run - 1;
  }
  return out;
}
export function save(G) {
  const w = G.world;
  const debt = {}; for (const k in w.debt) if (w.debt[k] > 0) debt[k] = w.debt[k];
  return {
    v: 2,
    mods: encodeMods(w.mods),
    trees: w.trees.map((t) => [t.id, t.kind, t.x, t.y, t.stage, t.hp, t.growT, t.fruit, t.seed]),
    objects: w.objects.map((o) => { const a = [o.id, o.kind, o.x, o.y, o.hp, o.t, o.n, o.seed]; if (o.inv) a.push(invSave(o.inv)); return a; }),
    drops: w.drops.map((d) => [d.item, d.n, Math.round(d.x), Math.round(d.y), d.d == null ? -1 : d.d, d.age]),
    debt,
  };
}
export function load(G, data) {
  if (!data) return;
  const w = G.world, n = w.tiles.length;
  w.mods = new Map();
  for (const [i, c] of decodeMods(data.mods)) {
    if (i < 0 || i >= n || !TILE_DEFS[c]) continue;
    w.tiles[i] = c;
    if (c !== w.base[i]) w.mods.set(i, c);
  }
  w.dmg = new Map();
  if (Array.isArray(data.trees)) w.trees = data.trees.filter((t) => Array.isArray(t) && TREE_DEFS[t[1]] && Number.isFinite(+t[2]) && Number.isFinite(+t[3])).map((t) => ({ id: t[0], kind: t[1], x: +t[2] | 0, y: +t[3] | 0, stage: t[4] | 0, hp: Number.isFinite(+t[5]) ? +t[5] : TREE_DEFS[t[1]].hp || 1, growT: t[6] | 0, fruit: t[7] | 0, seed: t[8] | 0 }));
  if (Array.isArray(data.objects)) {
    w.objects = data.objects.map((o) => {
      if (!o || typeof o !== "object") return null;
      const c = Array.isArray(o) ? { id: o[0], kind: o[1], x: o[2], y: o[3], hp: o[4], t: o[5] | 0, n: o[6] | 0, seed: o[7] | 0, inv: o[8] } : Object.assign({}, o);
      const d = OBJECT_DEFS[c.kind];
      if (!d || !Number.isFinite(+c.x) || !Number.isFinite(+c.y)) return null;
      c.x = +c.x | 0; c.y = +c.y | 0;
      if (d.slots) c.inv = invLoad(createInv(d.slots), c.inv); else delete c.inv;
      return c;
    }).filter(Boolean);
  }
  if (Array.isArray(data.drops)) w.drops = data.drops.filter((d) => Array.isArray(d) && ITEMS[d[0]] && Number.isFinite(+d[1]) && d[1] > 0 && Number.isFinite(+d[2]) && Number.isFinite(+d[3])).slice(-DROP_MAX).map((d) => ({ id: G.nextId++, item: d[0], n: Math.max(1, +d[1] | 0), x: +d[2], y: +d[3], w: DROP, h: DROP, vx: 0, vy: 0, grounded: false, d: !Number.isFinite(+d[4]) || d[4] == null || d[4] < 0 ? undefined : +d[4], age: d[5] | 0 }));
  w.debt = {};
  if (data.debt) for (const k in data.debt) if (RESPAWN[k] && data.debt[k] > 0) w.debt[k] = data.debt[k] | 0;
  w.bare = new Set();
  for (const i of w.mods.keys()) { noteBare(G, i); if (i + w.W < n) noteBare(G, i + w.W); }
  rebuildLights(G);
}

// ------------------------------------------------------------------ tiles
export { tileAt };
export const solidAt = (G, tx, ty) => isSolid(tileAt(G, tx, ty));
export const waterAt = (G, tx, ty) => isLiquid(tileAt(G, tx, ty));
export function isProtected(G, tx, ty) {
  const p = G.world.protect;
  return !!p && tx >= p.x0 && tx <= p.x1 && ty >= p.y0 && ty <= p.y1;
}
// first solid-or-water row of column tx (live)
export function surfaceAt(G, tx) {
  const w = G.world;
  if (tx < 0 || tx >= w.W) return 0;
  let y = 0;
  while (y < w.H - 1 && w.tiles[y * w.W + tx] === TILE.AIR) y++;
  return y;
}
// change a tile (records the diff + emits "tile"). Returns false when out of bounds / unchanged.
// Removing a solid tile also pops what stood on it (objects, a tree rooted there, unsupported wall lights).
export function setTile(G, tx, ty, code) {
  const w = G.world;
  if (tx < 0 || tx >= w.W || ty < 0 || ty >= w.H || !TILE_DEFS[code]) return false;
  const i = ty * w.W + tx, from = w.tiles[i];
  if (from === code) return false;
  w.tiles[i] = code;
  if (w.base && code === w.base[i]) w.mods.delete(i); else w.mods.set(i, code);
  w.dmg.delete(i);
  G.bus.emit("tile", { tx, ty, from, to: code });
  noteBare(G, i);
  if (ty + 1 < w.H) noteBare(G, i + w.W);
  if (SOLID[from] && !SOLID[code]) unsupported(G, tx, ty);
  return true;
}
function unsupported(G, tx, ty) {
  const w = G.world;
  for (const o of w.objects.slice()) {
    const d = OBJECT_DEFS[o.kind];
    if (d.wall) { if (Math.abs(o.x - tx) <= 1 && Math.abs(o.y - ty) <= 1 && !wallSupport(G, o.x, o.y)) breakObject(G, o); }
    else if (o.y === ty - 1 && tx >= o.x && tx < o.x + d.w) breakObject(G, o);
  }
  for (const tr of w.trees.slice()) if (tr.y === ty && tr.x === tx) uproot(G, tr);
}
const wallSupport = (G, tx, ty) => solidAt(G, tx - 1, ty) || solidAt(G, tx + 1, ty) || solidAt(G, tx, ty + 1) || solidAt(G, tx, ty - 1) || ty > G.world.surface[tx];

// how much work one swing of `tool` does on tile code c (0 = cannot break it with this tool)
export function tileWork(c, tool) {
  const d = TILE_DEFS[c];
  if (!d || !d.solid || d.tier >= 99 || !tool) return 0;
  if (d.tier > 0 && !(tool.type === "pickaxe" && tool.tier >= d.tier)) return 0;
  if ((d.pref === "pick" || d.pref === "any") && tool.type === "pickaxe") return tool.power;
  if (d.pref === "axe" && tool.type === "axe") return tool.power;
  return 1;
}
// one swing at tile (tx, ty) -> { ok, broke, tooHard }
export function hitTile(G, tx, ty, tool) {
  const w = G.world;
  if (tx < 0 || tx >= w.W || ty < 0 || ty >= w.H) return { ok: false };
  const c = w.tiles[ty * w.W + tx], d = TILE_DEFS[c];
  if (!d || !d.solid) return { ok: false };
  if (isProtected(G, tx, ty)) { G.bus.emit("tile:protected", { tx, ty }); return { ok: false }; }
  const work = tileWork(c, tool);
  if (work <= 0) { G.bus.emit("tile:tooHard", { tx, ty, tile: c, need: d.tier }); return { ok: false, tooHard: true }; }
  const i = ty * w.W + tx;
  const dm = w.dmg.get(i) || { w: 0, t: 0 };
  dm.w += work; dm.t = G.frame;
  if (dm.w < d.hp) {
    w.dmg.set(i, dm);
    G.bus.emit("tile:hit", { tx, ty, tile: c, work: dm.w, hp: d.hp });
    return { ok: true, broke: false };
  }
  // water next to (or above) the broken tile flows in; otherwise it opens to air
  const flood = waterAt(G, tx, ty - 1) || waterAt(G, tx - 1, ty) || waterAt(G, tx + 1, ty);
  setTile(G, tx, ty, flood ? TILE.WATER : TILE.AIR);
  G.bus.emit("tile:break", { tx, ty, tile: c });
  if (RESPAWN[c] && w.base[i] === c) w.debt[c] = (w.debt[c] || 0) + 1;   // natural deposits are owed back
  const cx = (tx + 0.5) * T, cy = (ty + 0.5) * T, p = G.player;
  const toward = Math.sign(p.x + p.w / 2 - cx) * 1.2;
  const nudge = (dr) => { if (dr) dr.vx = toward + (G.rng() - 0.5); };
  if (d.drop) nudge(spawnDrop(G, d.drop[0], d.drop[1], cx, cy));
  if (d.alt && G.rng() < d.alt[2]) nudge(spawnDrop(G, d.alt[0], d.alt[1], cx, cy));
  return { ok: true, broke: true };
}

// ------------------------------------------------------------------ trees
export function treesNear(G, tx, r) {
  const out = [];
  for (const tr of G.world.trees) if (Math.abs(tr.x - tx) <= r) out.push(tr);
  return out;
}
// rows a tree occupies (same as core/action.js treeRows)
function treeSpan(tr) {
  const h = tr.stage >= 3 ? TREE_DEFS[tr.kind].h : tr.stage === 2 ? Math.ceil(TREE_DEFS[tr.kind].h / 2) : 1;
  return [tr.y - h, tr.y - 1];
}
// is cell (tx, ty) inside a tree's trunk (blocks cannot go there)?
function trunkAt(G, tx, ty) {
  for (const tr of G.world.trees) {
    if (tr.x !== tx || tr.stage === 0) continue;
    const [a, b] = treeSpan(tr);
    if (ty >= Math.max(a, tr.y - 3) && ty <= b) return tr;
  }
  return null;
}
// one swing at a tree -> { ok, felled, tooHard }. Stumps can be dug out with an axe (1-2 wood).
export function hitTree(G, tree, tool) {
  const def = TREE_DEFS[tree.kind];
  if (!def || !tool) return { ok: false };
  if (tree.stage === 0) {
    if (tool.type !== "axe") return { ok: false };
    tree.stumpW = (tree.stumpW || 0) + tool.power;
    G.bus.emit("tree:hit", { tree, work: tool.power, hp: 4 - tree.stumpW, max: 4 });
    if (tree.stumpW < 4) return { ok: true, felled: false };
    const i = G.world.trees.indexOf(tree);
    if (i >= 0) G.world.trees.splice(i, 1);
    spawnDrop(G, "wood", G.rng.int(1, 2), (tree.x + 0.5) * T, (tree.y - 0.5) * T);
    G.bus.emit("tree:remove", { tree });
    return { ok: true, felled: true };
  }
  if (tree.stage === 1) { uproot(G, tree); return { ok: true, felled: true }; }
  const axeTier = tool.type === "axe" ? tool.tier : 0;
  if (def.tier > axeTier) { G.bus.emit("tree:tooHard", { tree, need: def.tier }); return { ok: false, tooHard: true }; }
  const work = tool.type === "axe" ? tool.power : 1;
  tree.hp -= work;
  G.bus.emit("tree:hit", { tree, work, hp: Math.max(0, tree.hp), max: def.hp });
  if (tree.hp > 0) return { ok: true, felled: false };
  fell(G, tree, G.player.x + G.player.w / 2 < (tree.x + 0.5) * T ? 1 : -1);
  return { ok: true, felled: true };
}
function fell(G, tree, dir) {
  const def = TREE_DEFS[tree.kind], young = tree.stage === 2;
  const cx = (tree.x + 0.5) * T, cy = (tree.y - 1.5) * T;
  let wood = G.rng.int(def.wood[0], def.wood[1]); if (young) wood = Math.max(1, Math.ceil(wood / 2));
  // the trunk falls away from the chopper (dir); the loot tumbles toward them so it is easy to collect
  const tp = -dir;
  spawnDrop(G, "wood", wood, cx + tp * 10, cy);
  spawnDrop(G, "stick", young ? 1 : G.rng.int(def.sticks[0], def.sticks[1]), cx + tp * 4, cy - 20);
  if (G.rng() < def.sapling * (young ? 0.5 : 1)) spawnDrop(G, "sapling", 1, cx, cy - 30);
  if (tree.fruit && def.fruit) spawnDrop(G, def.fruit, tree.fruit, cx + tp * 14, cy - 40);
  G.bus.emit("tree:fall", { tree, dir, wood, kind: tree.kind });
  tree.stage = 0; tree.hp = def.hp; tree.fruit = 0; tree.growT = TREE_GROW.stumpToSapling; tree.stumpW = 0;
  G.stats.treesFelled = (G.stats.treesFelled || 0) + 1;
}
function uproot(G, tree) {
  const w = G.world, i = w.trees.indexOf(tree);
  if (i < 0) return;
  if (tree.stage >= 2) fell(G, tree, 1);
  w.trees.splice(i, 1);
  if (tree.stage === 1) spawnDrop(G, "sapling", 1, (tree.x + 0.5) * T, (tree.y - 0.5) * T);
  G.bus.emit("tree:remove", { tree });
}
// which kind of tree grows from a sapling / natural seeding in column tx
function treeKindFor(G, tx, natural) {
  const b = G.world.biome[tx], r = G.rng();
  if (b === BIOME.PINEWOOD) return natural && r < 0.04 ? "ancient" : r < 0.9 ? "pine" : "oak";
  if (b === BIOME.HILLS) return "pine";
  if (b === BIOME.FOREST) return r < 0.65 ? "oak" : "birch";
  return r < 0.65 ? "oak" : "birch";
}

// ------------------------------------------------------------------ objects
export function objectAt(G, tx, ty) {
  for (const o of G.world.objects) {
    const d = OBJECT_DEFS[o.kind];
    if (tx >= o.x && tx < o.x + d.w && ty <= o.y && ty > o.y - d.h) return o;
  }
  return null;
}
// objects whose center is within r tiles of px point (px, py); optional filter(obj, def)
export function objectsNear(G, px, py, r, filter) {
  const out = [], R2 = r * T * r * T;
  for (const o of G.world.objects) {
    const d = OBJECT_DEFS[o.kind];
    const cx = (o.x + d.w / 2) * T, cy = (o.y + 1 - d.h / 2) * T;
    if ((cx - px) * (cx - px) + (cy - py) * (cy - py) <= R2 && (!filter || filter(o, d))) out.push(o);
  }
  return out;
}
export function hitObject(G, obj, tool) {
  const d = OBJECT_DEFS[obj.kind];
  if (!d || !tool) return { ok: false };
  const work = (d.pref === "pick" && tool.type === "pickaxe") || (d.pref === "axe" && tool.type === "axe") ? tool.power : 1;
  obj.hp -= work;
  G.bus.emit("obj:hit", { obj, work });
  if (obj.hp <= 0) { breakObject(G, obj); return { ok: true, broke: true }; }
  return { ok: true, broke: false };
}
export function breakObject(G, obj) {
  const w = G.world, i = w.objects.indexOf(obj);
  if (i < 0) return;
  w.objects.splice(i, 1);
  const d = OBJECT_DEFS[obj.kind], cx = (obj.x + d.w / 2) * T, cy = (obj.y + 0.5) * T;
  if (d.drop) spawnDrop(G, d.drop[0], d.drop[1], cx, cy);
  if (d.alt && G.rng() < d.alt[2]) spawnDrop(G, d.alt[0], d.alt[1], cx, cy);
  if (obj.kind === "bush" && obj.n > 0) spawnDrop(G, "berries", obj.n, cx, cy);
  if (obj.inv) for (const s of obj.inv.slots) if (s) spawnDrop(G, s.id, s.n, cx, cy, s.d);
  if (d.light) rebuildLights(G);
  G.bus.emit("obj:break", { obj });
}
// B_USE on an object -> true when something happened
export function useObject(G, obj) {
  const d = OBJECT_DEFS[obj.kind];
  if (!d) return false;
  if (obj.kind === "bush") {
    if (obj.n <= 0) return false;
    const n = G.rng.int(d.harvest[1], d.harvest[2]);
    give(G, d.harvest[0], n, obj);
    obj.n = 0; obj.t = d.regrow;
    G.bus.emit("harvest", { obj, id: d.harvest[0], n });
    return true;
  }
  if (obj.kind === "mushroom") { breakObject(G, obj); return true; }
  if (obj.kind === "chest") { G.bus.emit("ui:open", { panel: "chest", obj }); return true; }
  if (d.station) { G.bus.emit("ui:open", { panel: "craft", station: d.station }); return true; }
  return false;
}
// put items straight into the inventory; what does not fit drops on the ground at obj / the player
export function give(G, id, n, at) {
  const left = invAdd(G.inv, id, n);
  if (n - left > 0) G.bus.emit("pickup", { id, n: n - left });
  if (left > 0) {
    const p = G.player, d = at && OBJECT_DEFS[at.kind];
    spawnDrop(G, id, left, d ? (at.x + d.w / 2) * T : p.x + p.w / 2, d ? (at.y + 0.5) * T : p.y);
  }
}

// ------------------------------------------------------------------ placing
const overlaps = (b, tx, ty) => b.x < (tx + 1) * T && b.x + b.w > tx * T && b.y < (ty + 1) * T && b.y + b.h > ty * T;
export function canPlace(G, id, tx, ty) {
  const it = ITEMS[id], w = G.world;
  if (!it || tx < 1 || tx >= w.W - 1 || ty < 1 || ty >= w.H - 2) return false;
  const c = tileAt(G, tx, ty);
  if (isSolid(c) || objectAt(G, tx, ty) || trunkAt(G, tx, ty)) return false;
  if (it.block) {
    if (!PLACE_TILE[id] || isProtected(G, tx, ty)) return false;
    if (overlaps(G.player, tx, ty)) return false;                      // not inside the player
    for (const a of G.animals) if (overlaps(a, tx, ty)) return false;
    return solidAt(G, tx - 1, ty) || solidAt(G, tx + 1, ty) || solidAt(G, tx, ty - 1) || solidAt(G, tx, ty + 1);
  }
  if (isLiquid(c)) return false;
  if (it.place === "sapling") {
    const g = tileAt(G, tx, ty + 1);
    return (g === TILE.GRASS || g === TILE.DIRT || g === TILE.SNOW) && !isSolid(tileAt(G, tx, ty - 1)) &&
      treesNear(G, tx, 2).length === 0 && !isProtected(G, tx, ty);
  }
  const d = OBJECT_DEFS[it.place];
  if (!d) return false;
  if (d.wall) return wallSupport(G, tx, ty);
  for (let k = 0; k < d.w; k++) {
    if (!solidAt(G, tx + k, ty + 1)) return false;
    for (let r = 0; r < d.h; r++) if (solidAt(G, tx + k, ty - r) || isLiquid(tileAt(G, tx + k, ty - r)) || objectAt(G, tx + k, ty - r) || trunkAt(G, tx + k, ty - r)) return false;
  }
  return true;
}
// place item id at (tx, ty). Does NOT touch the inventory (the caller removes the item). -> true on success
export function place(G, id, tx, ty) {
  if (!canPlace(G, id, tx, ty)) return false;
  const it = ITEMS[id];
  if (it.block) return setTile(G, tx, ty, PLACE_TILE[id]);
  if (it.place === "sapling") {
    const tr = { id: G.nextId++, kind: treeKindFor(G, tx, false), x: tx, y: ty + 1, stage: 1, hp: 1, growT: TREE_GROW.saplingToYoung, fruit: 0, seed: (G.rng() * 1e6) | 0 };
    G.world.trees.push(tr);
    G.bus.emit("tree:plant", { tree: tr });
    return true;
  }
  const d = OBJECT_DEFS[it.place];
  const o = { id: G.nextId++, kind: it.place, x: tx, y: ty, hp: d.hp, t: 0, n: 0, seed: (G.rng() * 1e6) | 0 };
  if (d.slots) o.inv = createInv(d.slots);
  G.world.objects.push(o);
  if (d.light) rebuildLights(G);
  G.bus.emit("obj:place", { obj: o });
  return true;
}

// ------------------------------------------------------------------ lights (renderer + creatures read world.lights)
// world.lights = [{ x, y (px center), r (tiles), kind, id }] for every light-giving object. Rebuilt on place/break.
export function rebuildLights(G) {
  const L = [];
  for (const o of G.world.objects) {
    const d = OBJECT_DEFS[o.kind];
    if (d.light) L.push({ x: (o.x + d.w / 2) * T, y: (o.y + 1 - d.h / 2) * T, r: d.light, kind: o.kind, id: o.id });
  }
  G.world.lights = L;
}

// ------------------------------------------------------------------ renewal
const farFromPlayer = (G, tx) => Math.abs(tx - Math.floor((G.player.x + G.player.w / 2) / T)) >= RENEW_DIST;
const inPlotZone = (G, tx) => tx >= G.world.houseX - 3 && tx <= G.world.houseX + PLOT_W + 2;
const wetCol = (G, tx) => {
  const w = G.world;
  if (tx > w.river.x0 - 26 && tx < w.river.x1 + 26) return true;
  for (const q of w.ponds) if (tx > q.x0 - 12 && tx < q.x1 + 12) return true;
  return false;
};
// a free natural spot on the live surface of column tx (the air cell the thing would stand in), or -1
function surfaceSpot(G, tx, grounds) {
  const w = G.world;
  if (tx < 3 || tx >= w.W - 3 || inPlotZone(G, tx) || Math.abs(tx - w.spawn.x) <= 1) return -1;
  const s = surfaceAt(G, tx);
  if (s < 2 || !grounds.includes(tileAt(G, tx, s))) return -1;
  if (tileAt(G, tx, s - 1) !== TILE.AIR || tileAt(G, tx, s - 2) !== TILE.AIR) return -1;
  if (Math.abs(surfaceAt(G, tx - 1) - s) > 1 || Math.abs(surfaceAt(G, tx + 1) - s) > 1) return -1;
  if (s > w.surface[tx] + 3) return -1;                         // a pit the player dug, not the meadow
  if (objectAt(G, tx, s - 1)) return -1;
  return s - 1;
}
function reseedTree(G) {
  const w = G.world;
  if (w.trees.length >= w.treeTarget) return;
  for (let k = 0; k < 6; k++) {
    const tx = G.rng.int(3, w.W - 4);
    if (!farFromPlayer(G, tx)) continue;
    const b = w.biome[tx];
    if (b === BIOME.RIVER || (b === BIOME.MEADOW && G.rng() < 0.6)) continue;  // meadows stay open
    const y = surfaceSpot(G, tx, [TILE.GRASS, TILE.SNOW]);
    if (y < 0 || treesNear(G, tx, 3).length) continue;
    if (tileAt(G, tx, y + 1) === TILE.SNOW && y + 1 < SNOW_ROW - 4) continue;
    let kind = treeKindFor(G, tx, true);
    if (kind === "ancient" && (treesNear(G, tx, 4).length || surfaceSpot(G, tx - 1, [TILE.GRASS]) !== y || surfaceSpot(G, tx + 1, [TILE.GRASS]) !== y)) kind = "pine";
    const tr = { id: G.nextId++, kind, x: tx, y: y + 1, stage: 1, hp: 1, growT: TREE_GROW.saplingToYoung, fruit: 0, seed: (G.rng() * 1e6) | 0 };
    w.trees.push(tr);
    G.bus.emit("tree:plant", { tree: tr, natural: true });
    return;
  }
}
function respawnNatural(G) {
  const w = G.world, have = {};
  for (const o of w.objects) if (OBJECT_DEFS[o.kind].natural) have[o.kind] = (have[o.kind] || 0) + 1;
  let kind = null, gap = 0;
  for (const k in w.natTarget) { const g = w.natTarget[k] - (have[k] || 0); if (g > gap) { gap = g; kind = k; } }
  if (!kind) return;
  for (let k = 0; k < 8; k++) {
    const tx = G.rng.int(3, w.W - 4);
    if (!farFromPlayer(G, tx) || !NAT_BIOME[w.biome[tx]].includes(kind)) continue;
    const y = surfaceSpot(G, tx, [TILE.GRASS, TILE.MOSSY]);
    if (y < 0 || trunkAt(G, tx, y) || treesNear(G, tx, 0).length) continue;
    const d = OBJECT_DEFS[kind];
    const o = { id: G.nextId++, kind, x: tx, y, hp: d.hp, t: 0, n: kind === "bush" ? 3 : 0, seed: (G.rng() * 1e6) | 0 };
    w.objects.push(o);
    G.bus.emit("obj:regrow", { obj: o, natural: true });
    return;
  }
}
function renewDeposits(G) {
  const w = G.world;
  for (const key in w.debt) {
    const owed = w.debt[key];
    if (!(owed > 0)) continue;
    const code = +key, rule = RESPAWN[code];
    if (!rule) { delete w.debt[key]; continue; }
    const fits = (x, y) => {
      if (x < 1 || x >= w.W - 1 || y < 1 || y >= w.H - 4) return false;
      const i = y * w.W + x, dd = y - w.surface[x];
      return dd >= rule.d[0] && dd <= rule.d[1] && w.tiles[i] === w.base[i] && rule.from.includes(w.base[i]) && !isProtected(G, x, y);
    };
    for (let k = 0; k < 12; k++) {
      let x = G.rng.int(1, w.W - 2);
      if (!farFromPlayer(G, x) || (rule.where === "wet" && !wetCol(G, x))) continue;
      let y = w.surface[x] + G.rng.int(rule.d[0], rule.d[1]);
      if (!fits(x, y)) continue;
      let n = Math.min(owed, rule.blob, 2 + G.rng.int(0, rule.blob - 2)), placed = 0;
      for (let s = 0; s < n * 3 && placed < n; s++) {
        if (fits(x, y) && farFromPlayer(G, x)) { setTile(G, x, y, code); placed++; }
        const r = G.rng();
        if (r < 0.3) x++; else if (r < 0.6) x--; else if (r < 0.8) y++; else y--;
      }
      w.debt[key] = owed - placed;
      if (w.debt[key] <= 0) delete w.debt[key];
      break;
    }
  }
}
// dirt cells that might grow grass: dirt with open air above, near the generated surface
function noteBare(G, i) {
  const w = G.world;
  if (w.tiles[i] !== TILE.DIRT || i < w.W) return;
  const x = i % w.W, y = (i / w.W) | 0;
  if (y > w.surface[x] + 4 || w.tiles[i - w.W] !== TILE.AIR) return;
  w.bare.add(i);
}
function regrowGrass(G) {
  const w = G.world;
  if (!w.bare.size) return;
  let n = 0;
  for (const i of w.bare) {
    if (++n > 48) break;
    const x = i % w.W, y = (i / w.W) | 0;
    if (w.tiles[i] !== TILE.DIRT || w.tiles[i - w.W] !== TILE.AIR || y > w.surface[x] + 4) { w.bare.delete(i); continue; }
    let seedOk = w.base[i] === TILE.GRASS;
    for (let dy = -1; dy <= 1 && !seedOk; dy++) for (let dx = -1; dx <= 1; dx += 2) if (tileAt(G, x + dx, y + dy) === TILE.GRASS) { seedOk = true; break; }
    if (seedOk && G.rng() < 0.2) { w.bare.delete(i); setTile(G, x, y, TILE.GRASS); }
  }
}

// ------------------------------------------------------------------ drops
// spawn a ground item at px center (cx, cy). d = tool durability (tools only).
export function spawnDrop(G, item, n, cx, cy, d) {
  if (!ITEMS[item] || !(n > 0)) return null;
  const w = G.world;
  const dr = { id: G.nextId++, item, n, x: cx - DROP / 2, y: cy - DROP / 2, w: DROP, h: DROP, vx: (G.rng() - 0.5) * 2, vy: -2.5 - G.rng() * 2, grounded: false, d, age: 0 };
  unstick(G, dr);
  w.drops.push(dr);
  if (w.drops.length > DROP_MAX) {                 // too much litter: the oldest disappears
    let oi = 0; for (let k = 1; k < w.drops.length; k++) if (w.drops[k].age > w.drops[oi].age) oi = k;
    w.drops.splice(oi, 1);
  }
  G.bus.emit("drop:spawn", { drop: dr });
  return dr;
}
// a drop inside a solid tile pops up to the first free cell above it
function unstick(G, d) {
  let tx = Math.floor((d.x + DROP / 2) / T), ty = Math.floor((d.y + DROP / 2) / T), k = 0;
  if (!solidAt(G, tx, ty)) return false;
  while (k < 6 && solidAt(G, tx, ty)) { ty--; k++; }
  d.y = (ty + 1) * T - DROP - 0.5; d.vy = 0;
  return true;
}
function roomFor(G, id, d) {
  const it = ITEMS[id];
  for (const s of G.inv.slots) if (!s || (d == null && s.id === id && s.n < it.stack)) return true;
  return false;
}
function stepDrops(G) {
  const w = G.world, p = G.player, pcx = p.x + p.w / 2, pcy = p.y + p.h / 2, f = G.frame;
  const merge = f % 20 === 0;
  for (let i = w.drops.length - 1; i >= 0; i--) {
    const d = w.drops[i];
    d.age++;
    if (d.age > DROP_LIFE || d.y > w.H * T) { w.drops.splice(i, 1); continue; }
    const dx = pcx - (d.x + DROP / 2), dy = pcy - (d.y + DROP / 2), dist = Math.hypot(dx, dy);
    if (!p.dead && d.age > 20 && dist < MAGNET * T && roomFor(G, d.item, d.d)) {
      if (dist < PICKUP * T) {
        const left = invAdd(G.inv, d.item, d.n, d.d);
        if (left < d.n) G.bus.emit("pickup", { id: d.item, n: d.n - left, x: d.x, y: d.y });
        if (left <= 0) { w.drops.splice(i, 1); continue; }
        d.n = left;
      } else { d.vx += (dx / dist) * 0.9; d.vy += (dy / dist) * 0.9; d.vx *= 0.85; d.vy *= 0.85; d.x += d.vx; d.y += d.vy; d.grounded = false; continue; }
    }
    if (isLiquid(tileAt(G, Math.floor((d.x + 6) / T), Math.floor((d.y + 6) / T)))) { d.vy = Math.max(d.vy - 0.3, -1); d.vx *= 0.9; }
    else d.vy = Math.min(d.vy + 0.4, 8);
    if (d.grounded) d.vx *= 0.8;
    if (Math.abs(d.vx) < 0.02) d.vx = 0;
    if (merge && unstick(G, d)) continue;
    moveBody(G, d);
    // settled stacks of the same item merge (fewer bodies, easier pickup)
    if (merge && d.grounded && d.d == null) {
      const max = ITEMS[d.item].stack;
      for (let k = i - 1; k >= 0; k--) {
        const o = w.drops[k];
        if (o.item !== d.item || o.d != null || !o.grounded || o.n + d.n > max) continue;
        if (Math.abs(o.x - d.x) < 20 && Math.abs(o.y - d.y) < 20) { o.n += d.n; o.age = Math.min(o.age, d.age); w.drops.splice(i, 1); break; }
      }
    }
  }
}

// ------------------------------------------------------------------ queries for others
export const biomeAt = (G, tx) => G.world.biome[Math.max(0, Math.min(G.world.W - 1, tx))];
export const plot = (G) => ({ x: G.world.houseX, y: G.world.houseY, w: PLOT_W });
