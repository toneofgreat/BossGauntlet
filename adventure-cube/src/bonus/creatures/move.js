// creatures/move.js - animal locomotion: gravity, swimming, terrain probing (walls, cliffs, water), hop-over jumps,
// world bounds, plot walls. DOM-free (CREATURES owns).
import { T } from "../core/const.js";
import { moveBody, HIT_X, tileAt } from "../core/physics.js";
import { SOLID, LIQUID } from "../data/tiles.js";

export const GRAV = 0.6, MAX_FALL = 10;
const solid = (G, tx, ty) => SOLID[tileAt(G, tx, ty)] === 1;
const liquid = (G, tx, ty) => LIQUID[tileAt(G, tx, ty)] === 1;
export { solid as solidCell, liquid as liquidCell };

// vertical take-off speed that clears h tiles (+ a little margin) under GRAV
export const jumpV = (h) => Math.sqrt(2 * GRAV * (h * T + 10));

// probe the terrain one step ahead of a walking animal in direction dir.
// -> { wall: tiles of solid wall in front (0 = none, 9 = world edge / too tall), drop: tiles of fall ahead (0 = flat
//      or up), water: the first thing below the front cell is water }
export function probe(G, a, dir) {
  const W = G.world.W;
  const ax = dir > 0 ? Math.floor((a.x + a.w + 2) / T) : Math.floor((a.x - 2) / T);
  const out = { wall: 0, drop: 0, water: false, ax };
  if (ax < 1 || ax >= W - 1) { out.wall = 9; return out; }
  const fy = Math.floor((a.y + a.h - 1) / T);           // the row the feet stand in
  const bodyRows = Math.max(1, Math.ceil(a.h / T));
  let h = 0;
  while (h < 5 && solid(G, ax, fy - h)) h++;
  if (h > 0) {
    // room above the wall for the whole body?
    for (let r = 0; r < bodyRows; r++) if (solid(G, ax, fy - h - r)) { out.wall = 9; return out; }
    out.wall = h;
    return out;
  }
  if (liquid(G, ax, fy)) { out.water = true; return out; }
  let d = 0;
  while (d < 9 && !solid(G, ax, fy + 1 + d) && !liquid(G, ax, fy + 1 + d)) d++;
  out.drop = d;
  if (d < 9 && liquid(G, ax, fy + 1 + d)) out.water = true;
  return out;
}

// Decide whether the animal may keep moving in dir. Jumps hop-able walls (sets vy). opts: { jump, drop, water }
// (max tiles it hops, max tiles it steps down, may enter water). -> true = go, false = blocked
export function canGo(G, a, dir, jumpTiles, maxDrop, allowWater) {
  if (!a.grounded && !allowWater) return true;            // airborne: keep momentum
  const pr = probe(G, a, dir);
  if (pr.wall) {
    if (pr.wall > jumpTiles) return false;
    if (a.grounded || allowWater) a.vy = -jumpV(pr.wall);
    return true;
  }
  if (pr.water && !allowWater) return false;
  if (pr.drop > maxDrop) return false;
  return true;
}

// accelerate vx toward want * speed
export function drive(a, want, speed, accel = 0.4) {
  const target = want * speed;
  a.vx += Math.max(-accel, Math.min(accel, target - a.vx));
}

// gravity / buoyancy for land animals, then collide. Keeps the body inside the world. -> moveBody flags
export function physics(G, a, gravMul = 1, maxFall = MAX_FALL) {
  if (a.inWater) {
    // land animals paddle up and float; drag in water
    a.vy = Math.max(a.vy - 0.35, -2.2); a.vx *= 0.92;
  } else a.vy = Math.min(a.vy + GRAV * gravMul, maxFall);
  return integrate(G, a);
}
export function integrate(G, a) {
  a.vx = Math.max(-24, Math.min(24, a.vx)); a.vy = Math.max(-24, Math.min(24, a.vy));
  const f = moveBody(G, a);
  const w = G.world, maxX = (w.W - 1) * T - a.w;
  if (a.x < T) { a.x = T; if (a.vx < 0) a.vx = 0; }
  else if (a.x > maxX) { a.x = maxX; if (a.vx > 0) a.vx = 0; }
  if (a.y > (w.H - 3) * T) { a.y = (w.H - 3) * T - a.h; a.vy = 0; }  // never fall out of the world (bedrock floor)
  return f;
}
export { HIT_X };

// is the px x range [x0, x1) inside the house plot (+1 tile margin)?
export function overlapsPlot(G, x0, x1) {
  const w = G.world, p0 = (w.houseX - 1) * T, p1 = (w.houseX + 25) * T;
  return x1 > p0 && x0 < p1;
}
