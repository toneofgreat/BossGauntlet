// creatures/spawn.js - where and when animals appear (CREATURES owns). DOM-free; randomness only from G.rng.
// Rules (BONUS.md 6.1): off-screen (SPAWN.minDist..maxDist tiles from the cube; fish from fishMinDist, deep in the
// water), by biome + time of day, per-kind caps + a total cap, groups, rare bears; wolves never spawn in light, near
// a lamp-lit house (SPAWN.homeSafe) or inside a walled plot; early nights bring smaller packs.
import { T, PLOT_W } from "../core/const.js";
import { ANIMAL_DEFS, SPAWN, HOSTILE } from "../data/animals.js";
import { BIOMES } from "../data/tiles.js";
import { surfaceAt } from "../world/index.js";
import { hasPerk } from "../house/index.js";
import { solidCell, liquidCell, overlapsPlot } from "./move.js";

export function countKind(G, kind) { let n = 0; for (const a of G.animals) if (a.kind === kind) n++; return n; }

// may a `kind` be active at this time? (time "day" = everything but night)
export const timeOk = (d, night) => d.time === "any" || (d.time === "night" ? night : !night);

// live cap: wolves grow from a pair on night 1 to the full pack by night 3
export function capOf(G, kind) {
  const d = ANIMAL_DEFS[kind];
  return kind === "wolf" ? Math.min(d.cap, 1 + Math.max(1, G.time.day | 0)) : d.cap;
}
// candidate kinds for a column: [[kind, weight]]
export function candidates(G, tx, night, water) {
  const biome = BIOMES[G.world.biome[Math.max(0, Math.min(G.world.W - 1, tx))]];
  const out = [];
  for (const k in ANIMAL_DEFS) {
    const d = ANIMAL_DEFS[k];
    if ((d.ai === "swim") !== !!water) continue;
    if (!water && !d.biomes.includes(biome)) continue;
    if (!timeOk(d, night)) continue;
    if (HOSTILE[k] && G.creatureState && G.creatureState.calmT > 0) continue;
    if (countKind(G, k) >= capOf(G, k)) continue;
    const w = d.weight * (d.biomeMul && d.biomeMul[biome] != null ? d.biomeMul[biome] : 1);
    if (w > 0) out.push([k, w]);
  }
  return out;
}

function nearLight(G, cx, cy, mul) {
  for (const L of G.world.lights || []) if (Math.hypot(L.x - cx, L.y - cy) < L.r * T * mul + T) return true;
  return false;
}
// can an animal of `kind` stand in column tx on the surface? -> top-left px {x, y} or null
export function landSpot(G, kind, tx) {
  const d = ANIMAL_DEFS[kind], w = G.world;
  if (tx < 2 || tx >= w.W - 3) return null;
  const s = surfaceAt(G, tx);
  if (s <= 2 || s >= w.H - 3 || liquidCell(G, tx, s) || !solidCell(G, tx, s)) return null;
  const cols = Math.ceil(d.w / T), rows = Math.ceil(d.h / T);
  for (let c = 0; c < cols; c++) for (let r = 1; r <= rows; r++) if (solidCell(G, tx + c, s - r) || liquidCell(G, tx + c, s - r)) return null;
  const x = (tx + 0.5) * T - d.w / 2, y = s * T - d.h;
  if (HOSTILE[kind]) {
    if (hasPerk(G, "walls") && overlapsPlot(G, x, x + d.w)) return null;
    if (kind === "wolf") {
      if (nearLight(G, x + d.w / 2, y + d.h / 2, SPAWN.lightRadiusFear)) return null;
      if (hasPerk(G, "lamps") && Math.abs(tx - (w.houseX + PLOT_W / 2)) < SPAWN.homeSafe + PLOT_W / 2) return null;
    }
  }
  return { x, y };
}
// a water cell for a fish in column tx (the deeper half) -> {x, y} or null
export function waterSpot(G, tx) {
  const w = G.world;
  if (tx < 2 || tx >= w.W - 2) return null;
  const s = surfaceAt(G, tx);
  if (!liquidCell(G, tx, s)) return null;
  let b = s; while (b < w.H - 1 && liquidCell(G, tx, b + 1)) b++;
  if (b - s < 1) return null;                                     // too shallow
  const row = Math.max(s + 1, Math.floor((s + b + 1) / 2));
  const d = ANIMAL_DEFS.fish;
  return { x: (tx + 0.5) * T - d.w / 2, y: (row + 0.5) * T - d.h / 2 };
}

// one spawn attempt around the player. make(G, kind, x, y, setup) creates + registers one animal (setup runs before
// "animal:spawn"). -> number of animals spawned
export function trySpawn(G, make, env) {
  if (G.animals.length >= SPAWN.maxTotal) return 0;
  const p = G.player, ptx = Math.floor((p.x + p.w / 2) / T), night = env.night;
  const side = G.rng() < 0.5 ? -1 : 1;
  let dist = G.rng.int(SPAWN.fishMinDist, SPAWN.maxDist);
  let tx = ptx + side * dist;
  if (tx < 2 || tx >= G.world.W - 2) return 0;
  const water = liquidCell(G, tx, surfaceAt(G, tx));
  if (!water && dist < SPAWN.minDist) {
    dist = SPAWN.minDist + (dist - SPAWN.fishMinDist) % (SPAWN.maxDist - SPAWN.minDist + 1);
    tx = ptx + side * dist;
    if (tx < 2 || tx >= G.world.W - 2 || liquidCell(G, tx, surfaceAt(G, tx))) return 0;
  }
  const opts = candidates(G, tx, night, water);
  if (!opts.length) return 0;
  let tot = 0; for (const o of opts) tot += o[1];
  let r = G.rng() * tot, kind = opts[0][0];
  for (const [k, w] of opts) { r -= w; if (r < 0) { kind = k; break; } }
  const d = ANIMAL_DEFS[kind];
  if (d.rare && G.rng() >= d.rare) return 0;
  let hi = d.group[1];
  if (kind === "wolf") hi = Math.max(d.group[0], Math.min(hi, 1 + (G.time.day | 0)));   // night 1: pairs; later: 3-4
  let n = G.rng.int(d.group[0], hi);
  n = Math.min(n, capOf(G, kind) - countKind(G, kind), SPAWN.maxTotal - G.animals.length);
  let made = 0, leader = null;
  for (let k = 0; k < n; k++) {
    const x = tx + k * 2 * side;
    const spot = water ? waterSpot(G, x) : landSpot(G, kind, x);
    if (!spot) continue;
    const a = make(G, kind, spot.x, spot.y, (b) => {
      if (kind === "wolf") { b.pack = leader ? leader.id : b.id; b.state = "prowl"; }
      if (kind === "bear") b.homeX = spot.x + d.w / 2;
    });
    if (!a) continue;
    if (kind === "wolf" && !leader) leader = a;
    made++;
  }
  if (leader && Math.abs(leader.x / T - ptx) <= 30) G.bus.emit("animal:sound", { a: leader, sound: "howl" });
  return made;
}
