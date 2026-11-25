// creatures/index.js - animals: spawning, AI, combat, drops, arrows (CREATURES owns; API frozen: BONUS.md 6.3).
// DOM-free. Behaviours live in ai.js, terrain + physics in move.js, damage / arrows in combat.js, spawning in
// spawn.js. Step order inside creatures.step: spawn attempt -> arrows -> every animal (timers, brain, physics).
//
// animal = { id, kind, x, y, w, h, vx, vy, ox, oy, grounded, facing, hp, maxHp, state, t, hurtT, atkCd, aggroT,
//            inWater, anim, seed,
//            // CREATURES additions (RENDER may read): invT (hit immunity steps), kbT (knocked back, no control),
//            // pack (wolf pack id = leader id, 0 otherwise), homeX (bear den px), dir (locked run/charge dir), calmT (post-faint calm),
//            // lungeCd, gone (wolf leaving for good), flap (pheasant wing beats), goalY (fish target row), callT, dry, panic, blocked, grav }
// states: see ai.js header (idle graze wander sleep flee flutter windup charge skid dazed recover chase butt swipe
//         return prowl circle lunge retreat swim jump).
// G.creatureState = { spawnT, calmT (no hostile spawns after a faint), packs: { [packId]: { last, howled } } }   (contract addition; rebuilt on load)
import { T, PLOT_W } from "../core/const.js";
import { bodyInWater, liquidAt } from "../core/physics.js";
import { phase } from "../core/time.js";
import { ANIMAL_DEFS, SPAWN, HOSTILE } from "../data/animals.js";
import { invSelected } from "../craft/inventory.js";
import { hasPerk } from "../house/index.js";
import { BRAINS } from "./ai.js";
import { physics, overlapsPlot } from "./move.js";
import { trySpawn } from "./spawn.js";
import { hitAnimal, meleeHit, shoot, stepProjectiles, damageFor, knockbackFor, maxTargets, hitsToKill, rollDrops } from "./combat.js";

export { hitAnimal, meleeHit, shoot, damageFor, knockbackFor, maxTargets, hitsToKill, rollDrops, trySpawn };

const RESPAWN_CALM_R = 14; // tiles
export function init(G) {
  G.animals = G.animals || []; G.projectiles = G.projectiles || [];
  G.creatureState = { spawnT: 0, packs: {}, calmT: 0 };
  // wolves leave while the cube sleeps; after a faint every hostile calms down for a while
  G.bus.on("sleep", (e) => { if (e && e.start) removeWhere(G, (a) => ANIMAL_DEFS[a.kind].ai === "pack"); });
  G.bus.on("player:die", () => {
    G.creatureState.calmT = SPAWN.faintCalm;
    for (const a of G.animals) if (ANIMAL_DEFS[a.kind].ai === "pack") a.gone = true;   // the pack wanders off
  });
  // after a faint, non-pack hostiles near where the cube wakes stay calm for the whole faintCalm (until hit), so an
  // idle player is not fainted over and over by a boar or bear grazing next to the respawn point
  G.bus.on("player:respawn", (e) => {
    const px = e ? e.x : G.player.x, py = e ? e.y : G.player.y;
    G.creatureState.wakeX = px;
    for (const a of G.animals) if (HOSTILE[a.kind]) {
      a.aggroT = 0; a.atkCd = 180;
      if (ANIMAL_DEFS[a.kind].ai !== "pack") {
        a.state = "idle"; a.t = 120;
        if (Math.hypot(a.x + a.w / 2 - px, a.y + a.h / 2 - py) < RESPAWN_CALM_R * T) { a.calmT = SPAWN.faintCalm; a.calmX = px; }
      }
    }
  });
}

// animals near the cube are saved so the world does not feel empty after a reload (small: ~30 B each)
export function save(G) {
  const p = G.player, list = G.animals.slice()
    .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x)).slice(0, 24)
    .map((a) => [a.kind, Math.round(a.x), Math.round(a.y), a.hp, a.facing, a.seed, a.homeX == null ? null : Math.round(a.homeX), a.pack || 0]);
  return { v: 1, a: list };
}
export function load(G, d) {
  G.animals.length = 0; G.projectiles.length = 0;
  if (!d || !Array.isArray(d.a)) return;
  const remap = {};
  for (const r of d.a) {
    if (!Array.isArray(r) || !ANIMAL_DEFS[r[0]] || !isFinite(r[1]) || !isFinite(r[2])) continue;
    const a = makeAnimal(G, r[0], r[1], r[2]);
    if (isFinite(r[3]) && r[3] > 0) a.hp = Math.min(a.maxHp, r[3]);
    if (r[4]) a.facing = r[4] > 0 ? 1 : -1;
    if (isFinite(r[5])) a.seed = r[5];
    if (r[6] != null && isFinite(r[6])) a.homeX = r[6];
    if (r[7]) { a.pack = remap[r[7]] || (remap[r[7]] = a.id); a.state = "prowl"; }
  }
}

// create + register an animal with its top-left at px (x, y)
function makeAnimal(G, kind, x, y, setup) {
  const d = ANIMAL_DEFS[kind];
  const a = {
    id: G.nextId++, kind, w: d.w, h: d.h, x, y, vx: 0, vy: 0, ox: x, oy: y,
    grounded: false, facing: G.rng() < 0.5 ? -1 : 1, hp: d.hp, maxHp: d.hp, state: d.ai === "swim" ? "swim" : "idle",
    t: 60 + ((G.rng() * 120) | 0), hurtT: 0, atkCd: 0, aggroT: 0, inWater: false, anim: 0, seed: (G.rng() * 1e6) | 0,
    invT: 0, kbT: 0, pack: 0, homeX: null, dir: 1, lungeCd: 60, flap: 0, goalY: null,
    callT: d.call ? G.rng.int(d.call[0] >> 1, d.call[1]) : 0, dry: 0, panic: 0, blocked: false, grav: 1, maxFall: 10, dashT: 0,
  };
  if (setup) setup(a);
  G.animals.push(a);
  G.bus.emit("animal:spawn", { a });
  return a;
}
// standing in cell (tx, ty): feet on the bottom of the cell (fish: centered in it)
export function spawnAnimal(G, kind, tx, ty) {
  const d = ANIMAL_DEFS[kind];
  if (!d) return null;
  const x = (tx + 0.5) * T - d.w / 2;
  const y = d.ai === "swim" ? (ty + 0.5) * T - d.h / 2 : (ty + 1) * T - d.h;
  return makeAnimal(G, kind, x, y, (a) => {
    if (d.ai === "territorial") a.homeX = x + d.w / 2;
    if (d.ai === "pack") { a.pack = a.id; for (const b of G.animals) if (b.kind === kind && Math.abs(b.x - x) < 12 * T) { a.pack = b.pack; break; } }
  });
}
export function animalsNear(G, px, py, r) {
  const out = [], R = r * T;
  for (const a of G.animals) if (Math.abs(a.x + a.w / 2 - px) <= R && Math.abs(a.y + a.h / 2 - py) <= R) out.push(a);
  return out;
}

function removeWhere(G, fn) {
  for (let i = G.animals.length - 1; i >= 0; i--) { const a = G.animals[i]; if (fn(a)) { G.animals.splice(i, 1); G.bus.emit("animal:despawn", { a }); } }
}

// per-step shared context (one object per game, mutated; no per-step allocation)
function envOf(G) {
  const S = G.creatureState || (G.creatureState = { spawnT: 0, packs: {} });
  const e = S.env || (S.env = {});
  const p = G.player, w = G.world, ph = phase(G);
  e.pcx = p.x + p.w / 2; e.pcy = p.y + p.h / 2; e.pdead = !!p.dead;
  e.phase = ph; e.night = ph === "night";
  e.quiet = Math.abs(p.vx) < 1.3 && p.grounded;
  const s = invSelected(G.inv); e.holdLight = !!(s && (s.id === "torch" || s.id === "lantern"));
  e.lamps = hasPerk(G, "lamps"); e.walls = hasPerk(G, "walls");
  e.homeCx = (w.houseX + PLOT_W / 2) * T; e.homeCy = w.houseY * T;
  e.lights = w.lights || [];
  return e;
}

export function step(G) {
  const S = G.creatureState || (G.creatureState = { spawnT: 0, packs: {} });
  const env = envOf(G);
  // ---- spawning ----
  const every = G.animals.length < SPAWN.lowPop ? SPAWN.everyLow : SPAWN.every;
  if (S.calmT > 0) S.calmT--;
  if (++S.spawnT >= every) { S.spawnT = 0; trySpawn(G, makeAnimal, env); }
  // ---- arrows ----
  if (G.projectiles.length) stepProjectiles(G);
  // ---- animals ----
  for (let i = G.animals.length - 1; i >= 0; i--) {
    const a = G.animals[i];
    if (!a) continue;
    const d = ANIMAL_DEFS[a.kind];
    a.ox = a.x; a.oy = a.y; a.anim++;
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    env.dx = env.pcx - cx; env.dy = env.pcy - cy; env.dist = Math.hypot(env.dx, env.dy) / T;
    if (env.dist > SPAWN.despawnDist) { G.animals.splice(i, 1); G.bus.emit("animal:despawn", { a }); continue; }
    if (a.hurtT > 0) a.hurtT--;
    if (a.invT > 0) a.invT--;
    if (a.kbT > 0) a.kbT--;
    if (a.atkCd > 0) a.atkCd--;
    if (a.aggroT > 0) a.aggroT--;
    if (a.lungeCd > 0) a.lungeCd--;
    if (a.calmT > 0) { if (a.aggroT > 0) a.calmT = 0; else a.calmT--; }   // a hit breaks the calm
    a.inWater = bodyInWater(G, a);
    a.wet = a.inWater || liquidAt(G, Math.floor(cx / T), Math.floor((a.y + a.h - 1) / T));
    a.grav = 1; a.maxFall = 10;
    const pdead = env.pdead;
    // calm: the brain ignores the cube (also any non-pack hostile while the cube stays near where it woke)
    if (a.calmT > 0 || S.calmT > 0 && S.wakeX != null && a.aggroT <= 0 && HOSTILE[a.kind] && d.ai !== "pack" && Math.abs(env.pcx - S.wakeX) < RESPAWN_CALM_R * T) env.pdead = true;
    const r = BRAINS[d.ai](G, a, d, env);
    env.pdead = pdead;
    // calm and still close to where the cube woke: amble away from it
    if (r !== "despawn" && a.calmT > 0 && a.kbT <= 0 && a.calmX != null && Math.abs(cx - a.calmX) < RESPAWN_CALM_R * T && d.ai !== "swim") {
      a.facing = cx < a.calmX ? -1 : 1; a.vx = a.facing * d.speed * 0.4;
    }
    if (r === "despawn") { const j = G.animals.indexOf(a); if (j >= 0) G.animals.splice(j, 1); G.bus.emit("animal:despawn", { a }); continue; }
    // a hostile that ends up inside a walled plot walks straight out
    if (env.walls && HOSTILE[a.kind] && overlapsPlot(G, a.x, a.x + a.w) && a.kbT <= 0) {
      const mid = (G.world.houseX + PLOT_W / 2) * T;
      a.facing = cx < mid ? -1 : 1; a.vx = a.facing * d.speed * 0.8;
    }
    if (d.ai !== "swim") physics(G, a, a.grav, a.maxFall);
    if (a.grounded && a.kbT <= 0 && a.state !== "lunge" && a.state !== "charge" && a.state !== "skid" && Math.abs(a.vx) < 0.05) a.vx = 0;
    // idle calls (sparingly, only near the cube)
    if (d.call && --a.callT <= 0) {
      a.callT = G.rng.int(d.call[0], d.call[1]);
      if (env.dist < 25 && a.state !== "sleep" && !(d.ai === "pack" && env.dist < 6)) G.bus.emit("animal:sound", { a, sound: d.sound });
    }
  }
}
