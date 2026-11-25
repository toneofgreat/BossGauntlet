// creatures/ai.js - per-kind behaviours (CREATURES owns). DOM-free; randomness only from G.rng.
// Each brain(G, a, d, env) sets the animal's state + horizontal drive for this step (and may jump); index.js then
// applies gravity + collision. A brain may return "despawn" (night hunters leaving at dawn, stranded fish).
//
// states (animal.state, RENDER picks poses from these):
//   idle    standing, looking around          graze   head down, eating (herbivores)
//   wander  walking slowly                     sleep   curled up at night (sneak attacks x2)
//   flee    running away                       flutter pheasant flapping in the air
//   windup  telegraph: boar paws the ground, bear rears up, wolf crouches, goat lowers its head
//   charge  boar ram in a straight line        skid    boar sliding to a stop after a charge
//   dazed   boar after ramming a wall          recover boar catching its breath (vulnerable)
//   chase   goat / bear running at the player  butt    goat head-butt dash
//   swipe   bear paw swipe (hits at the end)   return  bear walking back to its den
//   prowl   wolf trotting toward the player    circle  wolf circling at the pack ring
//   lunge   wolf leaping at the player         retreat backing off after an attack
//   swim    fish swimming                      jump    fish leaping out at the surface
import { T } from "../core/const.js";
import { hurtPlayer } from "../core/player.js";
import { SPAWN, HOSTILE } from "../data/animals.js";
import { drive, canGo, overlapsPlot, liquidCell, solidCell, integrate } from "./move.js";

const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

// ---- shared helpers -------------------------------------------------------------------------------------------
// walk/run in direction `want` (0 = brake). mode "calm" turns around at obstacles; "run"/"charge" stop at them
// (a.blocked = true). Hostiles never step into a walled plot.
export function move(G, a, d, env, want, speed, mode = "calm", accel = 0.4) {
  a.blocked = false;
  if (a.kbT > 0) { drive(a, 0, 0, 0.12); return; }
  if (want) {
    a.facing = want;
    let ok = true;
    if (env.walls && HOSTILE[a.kind]) {
      const n = want * (Math.abs(a.vx) + speed + 2);
      if (!overlapsPlot(G, a.x, a.x + a.w) && overlapsPlot(G, a.x + n, a.x + a.w + n)) ok = false;
    }
    const jump = mode === "charge" ? 1 : d.jump || 1, drop = (d.drop || 3) + (mode === "calm" ? 0 : 3);
    if (ok) ok = canGo(G, a, want, jump, drop, a.inWater || a.wet);
    if (!ok) { a.blocked = true; if (mode === "calm") a.facing = -want; want = 0; }
  }
  drive(a, want, speed, accel);
}

// contact attack: hurts the player when the bodies touch (reach = extra px in front). Respects the cube's i-frames.
export function strike(G, a, d, env, reach = 0) {
  if (a.atkCd > 0 || env.pdead || !d.dmg) return false;
  const p = G.player;
  const x0 = a.x - (a.facing < 0 ? reach : 0), x1 = a.x + a.w + (a.facing > 0 ? reach : 0);
  if (x0 < p.x + p.w && x1 > p.x && a.y < p.y + p.h && a.y + a.h > p.y) {
    a.atkCd = d.cd;
    G.bus.emit("animal:attack", { a });
    hurtPlayer(G, d.dmg, a.x + a.w / 2, d.kb, a.kind);
    return true;
  }
  return false;
}

function windup(G, a, t) { a.state = "windup"; a.t = t; a.vx *= 0.3; G.bus.emit("animal:windup", { a }); }
const faceP = (a, env) => { if (env.dx) a.facing = sgn(env.dx); };

// how far (tiles) this animal notices the cube
function sightOf(d, env, a) {
  let s = d.sight;
  if (env.quiet) s *= SPAWN.quietSight;
  if (env.night && d.ai !== "pack") s *= 0.8;
  if (a.state === "sleep") s = env.quiet ? 1 : 1.6;          // creep up, stop, strike
  return s;
}

// graze / idle / wander cycle; sleeping at night for kinds with `sleeps`; optional leash to a.homeX
function calm(G, a, d, env, walk = 0.4) {
  if (d.sleeps === "night" && env.night && a.state !== "sleep" && a.kbT <= 0 && a.grounded) { a.state = "sleep"; a.t = 600; }
  if (a.state === "sleep") {
    if (!env.night) { a.state = "idle"; a.t = 60; }
    move(G, a, d, env, 0, 0); return;
  }
  if (a.state !== "idle" && a.state !== "graze" && a.state !== "wander") { a.state = "idle"; a.t = 30; }
  if (--a.t <= 0) {
    if (a.state === "wander") { a.state = d.ai !== "pack" && d.ai !== "territorial" && G.rng() < 0.6 ? "graze" : "idle"; a.t = G.rng.int(70, 220); }
    else { a.state = "wander"; a.t = G.rng.int(60, 200); if (G.rng() < 0.5) a.facing = -a.facing; }
  }
  if (a.state === "wander") {
    if (a.homeX != null) { const off = a.x + a.w / 2 - a.homeX; if (Math.abs(off) > 9 * T) a.facing = off > 0 ? -1 : 1; }
    move(G, a, d, env, a.facing, d.speed * walk, "calm");
    if (a.kind === "rabbit" && a.grounded && !a.blocked && a.anim % 22 === 0) a.vy = -2.8;  // bunny hops
  } else move(G, a, d, env, 0, 0);
}

// ---- flee: rabbit, deer ---------------------------------------------------------------------------------------
function flee(G, a, d, env) {
  const s = sightOf(d, env, a);
  if (a.state !== "flee" && !env.pdead && env.dist < s) {
    a.state = "flee"; a.t = 150; a.dir = env.dx > 0 ? -1 : 1;
    if (G.rng() < 0.3) G.bus.emit("animal:sound", { a, sound: d.sound });
  }
  if (a.state !== "flee") return calm(G, a, d, env);
  if (!env.pdead && env.dist < d.sight * 1.6 && a.t < 50) a.t = 50;   // keep running while the cube is close
  if (--a.t <= 0) { a.state = "idle"; a.t = 50; a.panic = 0; return move(G, a, d, env, 0, 0); }
  // run away from the cube, unless cornered: then dash past it for a moment
  if (a.dashT > 0) a.dashT--; else a.dir = env.dx > 0 ? -1 : 1;
  const speed = d.speed * (a.panic > 0 ? 1.15 : 1);
  move(G, a, d, env, a.dir, speed, "run", 0.5);
  if (a.blocked && a.dashT <= 0) { a.dir = -a.dir; a.dashT = 45; }
  if (a.kind === "rabbit" && a.grounded && a.kbT <= 0) {
    if (G.rng() < 1 / 70) { a.vy = -6; a.vx *= 0.35; }                // zig-zag jink: stop dead, spring up
    else if (a.anim % 13 === 0) a.vy = -3.3;                          // hopping sprint
  }
}

// ---- flutter: pheasant ----------------------------------------------------------------------------------------
function flutter(G, a, d, env) {
  if (a.flap > 0) a.flap--;
  const s = sightOf(d, env, a);
  if (a.state !== "flee" && a.state !== "flutter" && !env.pdead && env.dist < s) {
    a.state = "flee"; a.t = 130; G.bus.emit("animal:sound", { a, sound: d.sound });
    if (a.grounded) { a.vy = -6.2; a.flap = 30; }                     // startled take-off
  }
  if (a.state !== "flee" && a.state !== "flutter") { a.grav = 1; return calm(G, a, d, env, 0.35); }
  if (!env.pdead && env.dist < d.sight * 1.5 && a.t < 40) a.t = 40;
  if (--a.t <= 0 && a.grounded) { a.state = "idle"; a.t = 60; a.grav = 1; return move(G, a, d, env, 0, 0); }
  const dir = env.dx > 0 ? -1 : 1;
  move(G, a, d, env, dir, d.speed, "run", 0.5);
  if (a.grounded && (a.blocked || a.anim % 26 === 0)) { a.vy = -6.2; a.flap = 28; a.vx = dir * d.speed; }
  a.state = a.grounded ? "flee" : "flutter";
  a.grav = a.flap > 0 ? 0.32 : 0.75;
  a.maxFall = a.flap > 0 || !a.grounded ? 2.4 : 10;
}

// ---- provoked: goat -------------------------------------------------------------------------------------------
function provoked(G, a, d, env) {
  const fighting = a.aggroT > 0 && !env.pdead && env.dist < SPAWN.giveUp;
  if (a.state === "flee") {
    if (--a.t <= 0) { a.state = "idle"; a.t = 60; }
    else return move(G, a, d, env, env.dx > 0 ? -1 : 1, d.speed, "run", 0.5);
  }
  if (!fighting) {
    if (a.state === "chase" || a.state === "windup" || a.state === "butt" || a.state === "retreat") { a.state = "idle"; a.t = 40; a.aggroT = 0; }
    return calm(G, a, d, env, 0.35);
  }
  if (d.fleeHp && a.hp < d.hp * d.fleeHp) { a.state = "flee"; a.t = 300; a.aggroT = 0; return; }
  switch (a.state) {
    case "windup":
      faceP(a, env); move(G, a, d, env, 0, 0);
      if (--a.t <= 0) { a.state = "butt"; a.t = 20; a.dir = a.facing; }
      break;
    case "butt":
      move(G, a, d, env, a.dir, d.speed * 1.7, "charge", 0.8);
      if (strike(G, a, d, env, 4) || a.blocked || --a.t <= 0) { a.state = "retreat"; a.t = 34; }
      break;
    case "retreat":
      move(G, a, d, env, env.dx > 0 ? -1 : 1, d.speed * 0.55, "run");
      if (--a.t <= 0) a.state = "chase";
      break;
    default:
      a.state = "chase";
      if (Math.abs(env.dx) < 2.4 * T && Math.abs(env.dy) < 1.5 * T && a.grounded && a.atkCd <= 0) windup(G, a, d.windup || 16);
      else move(G, a, d, env, sgn(env.dx), d.speed * 0.9, "run");
  }
}

// ---- charge: boar ---------------------------------------------------------------------------------------------
function charge(G, a, d, env) {
  const notice = !env.pdead && (env.dist < d.sight * (env.quiet ? 0.8 : 1) && Math.abs(env.dy) < 3 * T ||
    a.aggroT > 0 && env.dist < SPAWN.giveUp);
  switch (a.state) {
    case "windup":
      faceP(a, env); move(G, a, d, env, 0, 0);
      if (env.pdead) { a.state = "idle"; a.t = 60; break; }
      if (--a.t <= 0) { a.state = "charge"; a.t = 110; a.dir = a.facing; a.hitOnce = false; }
      break;
    case "charge": {
      move(G, a, d, env, a.dir, d.speed, "charge", 0.55);
      if (!a.hitOnce && strike(G, a, d, env, 2)) a.hitOnce = true;
      const passed = sgn(env.dx) !== a.dir && Math.abs(env.dx) > 3 * T;
      if (a.blocked) {
        const pr = Math.abs(a.vx) > 2.5;
        a.state = pr ? "dazed" : "skid"; a.t = pr ? 90 : 30; a.vx = -a.dir * (pr ? 1.5 : 0);
        if (pr) G.bus.emit("animal:sound", { a, sound: d.sound });
      } else if (passed || --a.t <= 0) { a.state = "skid"; a.t = 30; }
      break;
    }
    case "skid":
      a.vx *= 0.9;
      if (Math.abs(a.vx) < 0.4 && --a.t <= 0) { a.state = "recover"; a.t = G.rng.int(40, 70); }
      break;
    case "dazed":
      a.vx *= 0.85;
      if (--a.t <= 0) { a.state = "recover"; a.t = 30; }
      break;
    case "recover":
      a.vx *= 0.8;
      if (--a.t <= 0) { if (notice) windup(G, a, d.windup); else { a.state = "idle"; a.t = 60; } }
      break;
    default:
      if (notice) windup(G, a, d.windup);
      else calm(G, a, d, env, 0.35);
  }
}

// ---- territorial: bear ----------------------------------------------------------------------------------------
function territorial(G, a, d, env) {
  const home = a.homeX != null ? a.homeX : a.x + a.w / 2;
  const fromHome = Math.abs(a.x + a.w / 2 - home);
  const near = !env.pdead && env.dist < sightOf(d, env, a) && Math.abs(env.pcx - home) < SPAWN.giveUp * T;
  switch (a.state) {
    case "windup":
      faceP(a, env); move(G, a, d, env, 0, 0);
      if (--a.t <= 0) { a.state = "chase"; a.aggroT = Math.max(a.aggroT, 600); }
      break;
    case "chase": {
      if (env.pdead || env.dist > SPAWN.giveUp || fromHome > SPAWN.giveUp * 1.4 * T || a.aggroT <= 0) { a.state = "return"; a.aggroT = 0; break; }
      const p = G.player, gap = Math.abs(env.dx) - (a.w + p.w) / 2;
      if (gap < 16 && Math.abs(env.dy) < 1.6 * T && a.atkCd <= 0) { a.state = "swipe"; a.t = 16; faceP(a, env); }
      else move(G, a, d, env, sgn(env.dx), d.speed, "run");
      break;
    }
    case "swipe":
      move(G, a, d, env, 0, 0);
      if (--a.t <= 0) { if (!strike(G, a, d, env, 16)) a.atkCd = d.cd >> 1; a.state = "chase"; }
      break;
    case "return":
      if (near && a.aggroT > 0) { a.state = "chase"; break; }
      move(G, a, d, env, sgn(home - (a.x + a.w / 2)), d.speed * 0.35, "calm");
      if (fromHome < 3 * T || a.blocked) { a.state = "idle"; a.t = 90; }
      break;
    case "sleep":
      if (near) windup(G, a, d.windup);
      else calm(G, a, d, env, 0.25);
      break;
    default:
      if (near) { windup(G, a, d.windup); G.bus.emit("animal:sound", { a, sound: d.sound }); }
      else calm(G, a, d, env, 0.25);
  }
}

// ---- pack: wolves ---------------------------------------------------------------------------------------------
// light / home zones the pack will not enter: -> px x to flee from, or null
function fearSource(G, a, env, cx, cy) {
  for (const L of env.lights) {
    const r = L.r * SPAWN.lightRadiusFear * T;
    if (Math.abs(L.x - cx) < r && Math.hypot(L.x - cx, L.y - cy) < r) return L.x;
  }
  if (env.lamps && Math.abs(cx - env.homeCx) < SPAWN.homeSafe * T && Math.abs(cy - env.homeCy) < SPAWN.homeSafe * T) return env.homeCx;
  return null;
}
function playerSafe(G, env) {
  for (const L of env.lights) if (Math.hypot(L.x - env.pcx, L.y - env.pcy) < L.r * T * 0.85) return true;
  if (env.lamps && Math.abs(env.pcx - env.homeCx) < SPAWN.homeSafe * T && Math.abs(env.pcy - env.homeCy) < SPAWN.homeSafe * T) return true;
  if (env.walls && overlapsPlot(G, G.player.x, G.player.x + G.player.w)) return true;
  return false;
}
function pack(G, a, d, env) {
  const S = G.creatureState, P = S.packs[a.pack] || (S.packs[a.pack] = { last: -9999 });
  const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
  const leaving = !env.night || env.pdead || a.gone;
  if (leaving || d.fleeHp && a.hp < d.hp * d.fleeHp) {
    a.state = "flee";
    move(G, a, d, env, env.dx > 0 ? -1 : 1, d.speed * 0.9, "run");
    if (env.dist > SPAWN.dawnLeave && (leaving || a.hp < d.hp * d.fleeHp)) return "despawn";
    return;
  }
  // light / lamps: back off out of the glow
  const fx = fearSource(G, a, env, cx, cy);
  if (fx !== null && a.state !== "lunge") {
    a.state = "retreat"; a.t = 30;
    move(G, a, d, env, cx >= fx ? 1 : -1, d.speed * 0.8, "run");
    faceP(a, env);
    return;
  }
  const ring = (env.holdLight ? SPAWN.packRingTorch : SPAWN.packRing) * T;
  switch (a.state) {
    case "windup":
      faceP(a, env); move(G, a, d, env, 0, 0);
      if (--a.t <= 0) {
        a.state = "lunge"; a.t = 40; a.dir = a.facing;
        a.vx = a.dir * d.speed * 1.45; a.vy = -4.3; a.grounded = false;
        a.lungeCd = 150 + G.rng.int(0, 60);
      }
      return;
    case "lunge":
      if (a.grounded && a.t < 34) a.vx *= 0.8;
      if (strike(G, a, d, env, 3) || --a.t <= 0 || (a.grounded && Math.abs(a.vx) < 0.5 && a.t < 30)) { a.state = "retreat"; a.t = 45; }
      return;
    case "retreat":
      move(G, a, d, env, env.dx > 0 ? -1 : 1, d.speed * 0.7, "run");
      if (--a.t <= 0) a.state = "circle";
      return;
  }
  if (env.dist > d.sight * 1.4) {
    // prowl toward the cube (they hunt by scent)
    if (a.state !== "prowl") { a.state = "prowl"; }
    move(G, a, d, env, sgn(env.dx), d.speed * 0.55, "run");
    return;
  }
  if (a.state !== "circle") {
    a.state = "circle";
    if (!P.howled) { P.howled = 1; G.bus.emit("animal:sound", { a, sound: "howl" }); }
  }
  // circle at the ring on our own side of the cube, drifting in and out
  const side = cx >= env.pcx ? 1 : -1;
  const goal = env.pcx + side * ring + Math.sin(a.anim * 0.035 + a.seed) * T * 0.9;
  const off = goal - cx;
  if (Math.abs(off) > 10) move(G, a, d, env, sgn(off), d.speed * (Math.abs(off) > 3 * T ? 0.75 : 0.45), "run");
  else move(G, a, d, env, 0, 0);
  faceP(a, env);
  // one lunge at a time per pack
  const gap = SPAWN.lungeGap * (env.holdLight ? 3 : 1);
  if (a.lungeCd <= 0 && G.frame - P.last >= gap && Math.abs(env.dy) < 1.6 * T && env.dist < ring / T + 2.5 && a.grounded && !playerSafe(G, env)) {
    for (const b of G.animals) if (b !== a && b.pack === a.pack && (b.state === "windup" || b.state === "lunge")) return;
    P.last = G.frame;
    windup(G, a, d.windup || 22);
  }
}

// ---- swim: fish -----------------------------------------------------------------------------------------------
function swim(G, a, d, env) {
  const cx = a.x + a.w / 2, cy = a.y + a.h / 2, tx = Math.floor(cx / T), ty = Math.floor(cy / T);
  if (!a.inWater) {
    // airborne after a leap, or stranded on land: flop toward water
    a.dry = (a.dry || 0) + 1;
    a.vy = Math.min(a.vy + 0.4, 8);
    if (a.grounded && a.anim % 28 === 0) { a.vy = -3; a.vx = a.facing * 1.4; if (G.rng() < 0.3) a.facing = -a.facing; }
    else if (a.grounded) a.vx *= 0.8;
    integrate(G, a);
    if (a.dry > 900) return "despawn";
    return;
  }
  a.dry = 0;
  let top = ty, bot = ty;
  while (top > 0 && liquidCell(G, tx, top - 1)) top--;
  while (bot < G.world.H - 1 && liquidCell(G, tx, bot + 1)) bot++;
  if (a.state === "flee") { if (--a.t <= 0) { a.state = "swim"; a.t = 40; } }
  else {
    a.state = "swim";
    const pWet = G.player.inWater;
    if (!env.pdead && env.dist < (pWet ? d.sight : 2.2)) { a.state = "flee"; a.t = 50; a.facing = env.dx > 0 ? -1 : 1; a.goalY = bot; }
    else if (--a.t <= 0) {
      a.t = G.rng.int(90, 240);
      a.goalY = G.rng() < 0.18 ? top : G.rng.int(top, bot);
      if (G.rng() < 0.35) a.facing = -a.facing;
    }
  }
  if (a.goalY == null || a.goalY < top || a.goalY > bot) a.goalY = Math.round((top + bot) / 2);
  // turn at the banks
  const fx = Math.floor((cx + a.facing * (a.w / 2 + 3)) / T);
  if (!liquidCell(G, fx, ty)) { a.facing = -a.facing; a.vx *= -0.5; }
  const speed = a.state === "flee" ? d.speed * 2 : d.speed * 0.45;
  drive(a, a.kbT > 0 ? 0 : a.facing, speed, a.state === "flee" ? 0.5 : 0.08);
  const gy = (a.goalY + 0.5) * T;
  a.vy += Math.max(-0.15, Math.min(0.15, (gy - cy) * 0.01 - a.vy * 0.08));
  a.vy = Math.max(-1.6, Math.min(1.6, a.vy));
  // leap at the surface now and then (a chance to spear it from the bank)
  if (a.state === "swim" && ty === top && a.goalY === top && !solidCell(G, tx, top - 1) && G.rng() < 0.012) {
    a.vy = -4.6; a.state = "jump"; G.bus.emit("animal:sound", { a, sound: "splash" });
  }
  integrate(G, a);
}

export const BRAINS = { flee, flutter, provoked, charge, territorial, pack, swim };

// reaction to being hurt (called by combat.hitAnimal before the death check)
export function onHit(G, a, d, fromX) {
  const away = a.x + a.w / 2 >= fromX ? 1 : -1;
  switch (d.ai) {
    case "flee": case "flutter":
      a.state = "flee"; a.t = 240; a.panic = 1; a.dir = away; a.dashT = 0;
      if (d.ai === "flutter" && a.grounded) { a.vy = -6; a.flap = 30; }
      break;
    case "swim": a.state = "flee"; a.t = 60; a.facing = away; break;
    case "provoked": a.aggroT = 300; if (a.state !== "windup" && a.state !== "butt") a.state = "chase"; break;
    case "charge":
      a.aggroT = 600;
      if (a.state === "windup") a.t = Math.min(a.t, 4);               // poke it while it paws the ground: it rams at once
      else if (a.state !== "charge" && a.state !== "skid") windup(G, a, 20);
      break;
    case "territorial":
      a.aggroT = 900;
      if (a.state !== "chase" && a.state !== "swipe" && a.state !== "windup") windup(G, a, 30);
      break;
    case "pack":
      if (a.state !== "lunge") { a.state = "retreat"; a.t = 30; }
      for (const b of G.animals) if (b.pack === a.pack && b.state === "prowl") b.state = "circle";
      break;
  }
}
