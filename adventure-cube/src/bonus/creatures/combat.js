// creatures/combat.js - damage math, hits, deaths + drops, melee swings, bow + arrows (CREATURES owns). DOM-free.
// Family friendly: a defeated animal vanishes in a puff ("animal:die") and leaves meat / hide drops. No gore.
import { T } from "../core/const.js";
import { tileAt } from "../core/physics.js";
import { SOLID, LIQUID } from "../data/tiles.js";
import { ANIMAL_DEFS, SPAWN } from "../data/animals.js";
import { spawnDrop } from "../world/index.js";
import { invCount, invRemove } from "../craft/inventory.js";
import { onHit } from "./ai.js";

// ---- pure math (tests use these) ----
// damage a tool deals to an animal kind. opts: { sleeping, arrow }
export function damageFor(tool, kind, opts) {
  const d = ANIMAL_DEFS[kind];
  if (!d || !tool) return 0;
  let dmg = tool.dmg || 0;
  if (opts && opts.sleeping) dmg *= SPAWN.sneakMul;                   // sneak attack on a sleeping animal
  if (kind === "fish" && tool.type === "spear") dmg *= 1.5;           // spear fishing
  const armor = (d.armor || 0) * (opts && opts.arrow ? 0.5 : 1);      // arrows half-pierce thick hides
  return Math.max(1, Math.round(dmg - armor));
}
// knockback (px/step) a tool gives before the animal's kbResist
export function knockbackFor(tool) {
  return 3 + (tool.tier || 0) * 1.2 + (tool.type === "hammer" ? 2 : tool.type === "spear" ? 1 : 0);
}
// how many animals one swing can hit
export const maxTargets = (tool) => (tool.type === "sword" ? 3 : tool.type === "spear" ? 2 : 1);
// swings needed to defeat an awake animal with a tool (balance helper)
export const hitsToKill = (tool, kind) => Math.ceil(ANIMAL_DEFS[kind].hp / damageFor(tool, kind));

// damage one animal (any source). kb = knockback px/step before resistance. -> true when it died
export function hitAnimal(G, a, dmg, fromX, kb = 3) {
  if (!a || a.hp <= 0 || !(dmg > 0)) return false;
  const d = ANIMAL_DEFS[a.kind];
  a.hp -= dmg; a.hurtT = 14; a.invT = SPAWN.iframes;
  const s = a.x + a.w / 2 >= fromX ? 1 : -1, k = kb * (1 - (d.kbResist || 0)) * (a.state === "charge" || a.state === "lunge" ? 0.25 : 1);
  if (k > 0.2) {
    a.vx = s * k; a.vy = Math.min(a.vy, -Math.min(4, 1.2 + k * 0.4)); a.grounded = false;
    a.kbT = Math.round(4 + k * 1.5);
  }
  if (a.state === "sleep") a.state = "idle";
  onHit(G, a, d, fromX);
  G.bus.emit("animal:hit", { a, dmg, hp: Math.max(0, a.hp) });
  if (a.hp <= 0) { killAnimal(G, a); return true; }
  return false;
}

// roll an animal's drops -> [[id, n]] (uses G.rng)
export function rollDrops(G, kind) {
  const out = [];
  for (const [id, lo, hi, ch] of ANIMAL_DEFS[kind].drops) if (G.rng() < ch) { const n = G.rng.int(lo, hi); if (n > 0) out.push([id, n]); }
  return out;
}
export function killAnimal(G, a) {
  const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
  a.hp = 0; a.state = "dead";
  for (const [id, n] of rollDrops(G, a.kind)) spawnDrop(G, id, n, cx, cy - 4);
  const i = G.animals.indexOf(a); if (i >= 0) G.animals.splice(i, 1);
  G.stats.hunted = (G.stats.hunted || 0) + 1;
  G.bus.emit("animal:die", { a, x: cx, y: cy, kind: a.kind });
}

// a melee swing covering px rect r = {x0,y0,x1,y1} (core/action.js). Swords cleave up to 3, spears 2, others 1.
// Spears and swords stab a little lower so fish can be speared from the bank. -> number of animals hit
export function meleeHit(G, r, tool, dir) {
  const p = G.player, px = p.x + p.w / 2, py = p.y + p.h / 2;
  const deep = tool.type === "spear" ? 30 : tool.type === "sword" ? 16 : 0;
  let hits = null;
  for (const a of G.animals) {
    if (a.hp <= 0 || a.invT > 0) continue;
    const y1 = a.kind === "fish" ? r.y1 + deep : r.y1;
    if (a.x + a.w <= r.x0 || a.x >= r.x1 || a.y + a.h <= r.y0 || a.y >= y1) continue;
    (hits || (hits = [])).push(a);
  }
  if (!hits) return 0;
  if (hits.length > 1) hits.sort((A, B) => Math.abs(A.x + A.w / 2 - px) + Math.abs(A.y + A.h / 2 - py) - Math.abs(B.x + B.w / 2 - px) - Math.abs(B.y + B.h / 2 - py));
  const n = Math.min(hits.length, maxTargets(tool)), kb = knockbackFor(tool);
  for (let i = 0; i < n; i++) {
    const a = hits[i];
    hitAnimal(G, a, damageFor(tool, a.kind, { sleeping: a.state === "sleep" }), px, kb);
  }
  return n;
}

// fire an arrow toward px point (ax, ay). Needs an "arrow" in the inventory. -> true when fired
export function shoot(G, ax, ay, tool) {
  if (invCount(G.inv, "arrow") <= 0) { G.bus.emit("toast", { text: "No arrows - craft some at a workbench" }); return false; }
  invRemove(G.inv, "arrow", 1);
  const p = G.player, sx = p.x + p.w / 2 + p.facing * 6, sy = p.y + p.h / 2 - 4;
  const dx = ax - sx, dy = ay - sy, L = Math.hypot(dx, dy) || 1, v = 13;
  G.projectiles.push({ id: G.nextId++, kind: "arrow", x: sx, y: sy, ox: sx, oy: sy, vx: (dx / L) * v, vy: (dy / L) * v - 1.2, age: 0, dmg: tool.dmg || 7 });
  G.bus.emit("shoot", { x: sx, y: sy });
  return true;
}

const ARROW_LIFE = 240;
function cellAt(G, x, y) { return tileAt(G, Math.floor(x / T), Math.floor(y / T)); }
export function stepProjectiles(G) {
  const P = G.projectiles;
  for (let i = P.length - 1; i >= 0; i--) {
    const q = P[i];
    q.ox = q.x; q.oy = q.y; q.age++;
    const c0 = cellAt(G, q.x, q.y);
    if (LIQUID[c0] === 1) { q.vx *= 0.9; q.vy = q.vy * 0.9 + 0.05; } else q.vy = Math.min(q.vy + 0.25, 14);
    // two half-steps so a fast arrow never skips a thin target
    let hit = null, ground = false;
    for (let s = 0; s < 2 && !hit && !ground; s++) {
      q.x += q.vx / 2; q.y += q.vy / 2;
      if (q.y > G.world.H * T || q.x < 0 || q.x > G.world.W * T) { ground = true; break; }
      if (SOLID[cellAt(G, q.x, q.y)] === 1) { ground = true; break; }
      for (const a of G.animals) if (a.hp > 0 && a.invT <= 0 && q.x > a.x && q.x < a.x + a.w && q.y > a.y && q.y < a.y + a.h) { hit = a; break; }
    }
    if (hit) {
      hitAnimal(G, hit, damageFor({ dmg: q.dmg, type: "bow" }, hit.kind, { arrow: true, sleeping: hit.state === "sleep" }), q.x - q.vx * 3, 3);
      P.splice(i, 1);
      if (G.rng() < 0.5) spawnDrop(G, "arrow", 1, q.x, q.y - 8);
    } else if (ground) {
      P.splice(i, 1);
      if (q.y < G.world.H * T && G.rng() < 0.6) spawnDrop(G, "arrow", 1, q.x - q.vx, q.y - q.vy - 6);
    } else if (q.age > ARROW_LIFE) P.splice(i, 1);
  }
}
