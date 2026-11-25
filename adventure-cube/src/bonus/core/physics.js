// physics.js - tile collision for every moving body in the bonus level (CORE owns; API frozen: BONUS.md 2.3).
// DOM-free. Same feel as the main sim (src/sim) but on the mutable bonus grid, with full-solid tiles only, one-way
// platforms from G.platforms, a 1-tile auto step-up for the player, and swimming in water tiles.
// body = { x, y (top-left px), w, h, vx, vy, grounded }   (+ player extras: smoothY)
import { T } from "./const.js";
import { SOLID, LIQUID, TILE } from "../data/tiles.js";

// tile code with walls: left/right of the world and below it = bedrock, above = air
export function tileAt(G, tx, ty) {
  const w = G.world;
  if (tx < 0 || tx >= w.W || ty >= w.H) return TILE.BEDROCK;
  if (ty < 0) return TILE.AIR;
  return w.tiles[ty * w.W + tx];
}
export const solidAt = (G, tx, ty) => SOLID[tileAt(G, tx, ty)] === 1;
export const liquidAt = (G, tx, ty) => LIQUID[tileAt(G, tx, ty)] === 1;

// any solid tile overlapping the px rect [l, r) x [t, b)
export function solidRect(G, l, t, r, b) {
  const x0 = Math.floor(l / T), x1 = Math.floor((r - 0.001) / T), y0 = Math.floor(t / T), y1 = Math.floor((b - 0.001) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (SOLID[tileAt(G, tx, ty)] === 1) return true;
  return false;
}
// is the body's center in water?
export const bodyInWater = (G, b) => LIQUID[tileAt(G, Math.floor((b.x + b.w / 2) / T), Math.floor((b.y + b.h / 2) / T))] === 1;

export const HIT_X = 1, HIT_Y = 2, LANDED = 4, BONKED = 8, STEPPED = 16;

// move b by (vx, vy) with collision. opts: { stepUp: false, platforms: true }. Updates b.x, b.y, b.grounded and
// zeroes the blocked velocity component. Returns HIT_X | HIT_Y | LANDED | BONKED | STEPPED flags.
// Velocities must stay below one tile per step (|v| < 32); every caller clamps far below that.
export function moveBody(G, b, opts) {
  const stepUp = !!(opts && opts.stepUp), plats = !opts || opts.platforms !== false;
  let flags = 0;
  const wasGrounded = b.grounded;
  // ---- horizontal ----
  if (b.vx !== 0) {
    let nx = b.x + b.vx;
    const t = b.y, bt = b.y + b.h;
    const y0 = Math.floor(t / T), y1 = Math.floor((bt - 0.001) / T);
    let blockX = null;
    if (b.vx > 0) {
      const tx = Math.floor((nx + b.w - 0.001) / T);
      for (let ty = y0; ty <= y1; ty++) if (SOLID[tileAt(G, tx, ty)] === 1) { blockX = tx * T - b.w; break; }
    } else {
      const tx = Math.floor(nx / T);
      for (let ty = y0; ty <= y1; ty++) if (SOLID[tileAt(G, tx, ty)] === 1) { blockX = (tx + 1) * T; break; }
    }
    if (blockX !== null) {
      // 1-tile auto step-up (player only): feet row blocked, room above at both positions
      const ny = y1 * T - b.h;
      if (stepUp && wasGrounded && b.y - ny <= T + 0.5 && b.y - ny > 0 &&
          !solidRect(G, b.x, ny, b.x + b.w, b.y + b.h) && !solidRect(G, nx, ny, nx + b.w, ny + b.h)) {
        if (b.smoothY !== undefined) b.smoothY += b.y - ny;
        b.y = ny; b.x = nx; flags |= STEPPED;
      } else { b.x = blockX; b.vx = 0; flags |= HIT_X; }
    } else b.x = nx;
  }
  // ---- vertical ----
  const oldBot = b.y + b.h;
  let ny = b.y + b.vy;
  b.grounded = false;
  const l = b.x, r = b.x + b.w;
  const x0 = Math.floor(l / T), x1 = Math.floor((r - 0.001) / T);
  if (b.vy > 0) {
    const ty = Math.floor((ny + b.h - 0.001) / T);
    let land = null;
    for (let tx = x0; tx <= x1; tx++) if (SOLID[tileAt(G, tx, ty)] === 1) { land = ty * T; break; }
    if (plats && G.platforms) {
      for (const p of G.platforms) {
        if (r <= p.x || l >= p.x + p.w) continue;
        if (oldBot <= p.y + 0.01 && ny + b.h >= p.y && (land === null || p.y < land)) land = p.y;
      }
    }
    if (land !== null) { ny = land - b.h; b.grounded = true; flags |= HIT_Y | LANDED; }
  } else if (b.vy < 0) {
    const ty = Math.floor(ny / T);
    for (let tx = x0; tx <= x1; tx++) if (SOLID[tileAt(G, tx, ty)] === 1) { ny = (ty + 1) * T; flags |= HIT_Y | BONKED; break; }
  } else {
    // resting: probe 1 px below for ground
    const ty = Math.floor((b.y + b.h + 0.5) / T);
    for (let tx = x0; tx <= x1; tx++) if (SOLID[tileAt(G, tx, ty)] === 1 && Math.abs(ty * T - (b.y + b.h)) < 0.6) { b.grounded = true; break; }
    if (!b.grounded && plats && G.platforms) for (const p of G.platforms) if (!(r <= p.x || l >= p.x + p.w) && Math.abs(p.y - (b.y + b.h)) < 0.6) { b.grounded = true; break; }
  }
  b.y = ny;
  if (flags & HIT_Y) b.vy = 0;
  if (flags & LANDED && wasGrounded) flags &= ~LANDED; // only report real landings
  return flags;
}
