// src/games/bus/game.js — The Bus Ride. Spec 25 owns this Place.
//
// You are stuck on a bus. Every second earns 1 Point. Spend them on escalating chaos:
//   - 10 Points: throw a needle at a rider (a one-eyed toy passenger — never a real
//     player; ARCHITECTURE §9). Pure slapstick.
//   - 100 Points: take the wheel. Dodge oncoming traffic in three lanes with ◀ ▶.
//     Clear the run and you're a legend; clip one car and you CRASH.
//   - Crash: everyone on the bus dies, every Point resets to zero, and — across a live
//     room, over the presence channel — everyone else resets too. Then the bus respawns.
//
// Points are Place-internal and session-only (no save, no Oofbux): "it all resets" is the
// whole game. Sim seconds only (dt), never wall clock, so a throttled tab can't out-earn.

import {
  buildBus, FLOOR_TOP, SPAWN, SPAWN_YAW, DRIVER_SEAT,
  LANE_Z, OBSTACLE_SPAWN_X, RESOLVE_X, STEER_X,
} from "./scripts/layout.js";

export const meta = {
  slug: "bus",
  name: "The Bus Ride",
  icon: "🚌",
  description: "A point a second stuck on the bus. Poke a rider, or drive — crash and everyone dies and it all resets.",
  version: "1.0.0",
};

const NEEDLE_COST = 10;
const DRIVE_COST = 100;
const NEEDLE_CD = 0.4;
const NEEDLE_DUR = 0.32;
const DRIVE_TARGET = 8;       // cars to clear for a clean run
const OBST_SPEED0 = 52;       // studs/sec, rises each car
const OBST_INT0 = 1.5;        // seconds between cars, falls each car
const CRASH_DUR = 3.0;
const DODGE_BONUS = 5;
const DRIVE_WIN = 60;
const HUD_EVERY = 0.15;
const PUBLISH_EVERY = 0.5;

let S = null;   // all mutable state, so dispose() can null it in one move
let dom = null;

function fresh() {
  return {
    points: 0, best: 0,
    riders: [], steerId: null,
    flinch: [],            // {rider, t}
    needles: [],           // {id, from, to, t, rider}
    needleCd: 0,
    driving: false, crashT: 0,
    lane: 1, obstacles: [], spawned: 0, cleared: 0, spawnT: 0, obSpeed: OBST_SPEED0,
    prevWalk: 16,
    hudT: 0, pubT: 0,
    myCrash: 0, seenCrash: new Map(),
    nseq: 0, oseq: 0,
    welcomed: false, throwCount: 0,
  };
}

// ---- tiny DOM helpers (a Place builds its own on-screen buttons; the UI service has no
//      action-button API) ----------------------------------------------------------
function btn(label, style) {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText =
    "font:600 15px system-ui,sans-serif;color:#fff;border:none;border-radius:12px;"
    + "padding:12px 16px;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.35);"
    + "touch-action:manipulation;user-select:none;" + (style || "");
  return b;
}

function buildDom(ctx) {
  const flash = document.createElement("div");
  flash.style.cssText =
    "position:fixed;inset:0;background:#c81e1e;opacity:0;pointer-events:none;z-index:60;";

  const wrap = document.createElement("div");
  wrap.style.cssText =
    "position:fixed;left:14px;bottom:120px;display:flex;flex-direction:column;gap:10px;z-index:55;";
  const needleBtn = btn("🪡 Needle — 10", "background:#7c3aed;");
  const driveBtn = btn("🚌 Drive — 100", "background:#d94436;");
  needleBtn.onclick = () => throwNeedle(ctx);
  driveBtn.onclick = () => startDrive(ctx);
  wrap.append(needleBtn, driveBtn);

  const lanes = document.createElement("div");
  lanes.style.cssText =
    "position:fixed;left:50%;bottom:118px;transform:translateX(-50%);display:none;"
    + "gap:22px;z-index:55;";
  const left = btn("◀", "background:#111827;font-size:26px;width:84px;");
  const right = btn("▶", "background:#111827;font-size:26px;width:84px;");
  left.onclick = () => steer(ctx, -1);
  right.onclick = () => steer(ctx, 1);
  lanes.append(left, right);

  document.body.append(flash, wrap, lanes);
  return { flash, wrap, needleBtn, driveBtn, lanes };
}

function refreshButtons() {
  if (!dom || !S) return;
  const busy = S.driving || S.crashT > 0;
  const set = (b, ok) => { b.disabled = !ok; b.style.opacity = ok ? "1" : "0.45"; };
  set(dom.needleBtn, !busy && S.points >= NEEDLE_COST);
  set(dom.driveBtn, !busy && S.points >= DRIVE_COST);
  dom.wrap.style.display = S.driving ? "none" : "flex";
  dom.lanes.style.display = S.driving ? "flex" : "none";
}

function hud(ctx) {
  ctx.services.ui.setHudStat("bus-points", {
    icon: S.driving ? "🚌" : "🎟️",
    label: S.driving ? `Dodged ${S.cleared}/${DRIVE_TARGET}` : "Points",
    value: String(Math.floor(S.points)),
  });
  // Observability seam (spec 25 §8): the Place's state on an event, so a smoke test can
  // read it without reaching into game internals. Never touches window.
  try { ctx.events.emit("bus:state", debugState()); } catch { /* no bus */ }
}

function toast(ctx, text, icon, duration) {
  try { ctx.services.ui.toast(text, { icon, duration: duration || 2600 }); } catch { /* headless */ }
}

// ---- needle ------------------------------------------------------------------------
function nearestRider(ctx) {
  const p = ctx.player.position ? ctx.player.position() : SPAWN;
  let best = null, bd = 1e9;
  for (const r of S.riders) {
    const dx = r.headPos[0] - p[0], dz = r.headPos[2] - p[2];
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

function throwNeedle(ctx) {
  if (!S || S.driving || S.crashT > 0 || S.needleCd > 0) return;
  if (S.points < NEEDLE_COST) { toast(ctx, "Ride a little longer — needles cost 10.", "🪡"); return; }
  const rider = nearestRider(ctx);
  if (!rider) return;
  S.points -= NEEDLE_COST;
  S.needleCd = NEEDLE_CD;
  const p = ctx.player.position ? ctx.player.position() : [SPAWN[0], SPAWN[1] + 2, SPAWN[2]];
  const id = "bus_needle_" + (S.nseq++);
  const from = [p[0], p[1] + 2, p[2]];
  ctx.engine.parts.create({ id, shape: "cylinder", size: [0.16, 1.8, 0.16], position: from, rotation: [0, 0, 90], color: "#dfe7f2", material: "metal", canCollide: false });
  S.needles.push({ id, from, to: rider.headPos.slice(), t: 0, rider });
  S.throwCount++;
  try { ctx.services.badges.award("needle"); } catch { /* no badge service */ }
  try { ctx.engine.audio.playSfx("click"); } catch { /* optional */ }
  hud(ctx); refreshButtons();
}

function stepNeedles(ctx, dt) {
  for (let i = S.needles.length - 1; i >= 0; i--) {
    const n = S.needles[i];
    n.t += dt;
    const k = Math.min(1, n.t / NEEDLE_DUR);
    const x = n.from[0] + (n.to[0] - n.from[0]) * k;
    const y = n.from[1] + (n.to[1] - n.from[1]) * k + Math.sin(k * Math.PI) * 1.5; // a little arc
    const z = n.from[2] + (n.to[2] - n.from[2]) * k;
    try { ctx.engine.parts.setPosition(n.id, [x, y, z]); } catch { /* gone */ }
    if (k >= 1) {
      try { ctx.engine.parts.remove(n.id); } catch { /* gone */ }
      S.needles.splice(i, 1);
      // the rider yelps: eye flashes red and the head pops up briefly
      const r = n.rider;
      try { ctx.engine.parts.setColor(r.eyeId, "#ff2a2a"); } catch { /* gone */ }
      S.flinch.push({ rider: r, t: 0.5 });
      toast(ctx, "Poke! A rider yelps and rubs the spot.", "💉", 1800);
    }
  }
  for (let i = S.flinch.length - 1; i >= 0; i--) {
    const fl = S.flinch[i];
    fl.t -= dt;
    const r = fl.rider;
    const bump = Math.max(0, fl.t) * 1.2;
    try { ctx.engine.parts.setPosition(r.headId, [r.headPos[0], r.headPos[1] + bump, r.headPos[2]]); } catch { /* gone */ }
    if (fl.t <= 0) {
      try { ctx.engine.parts.setColor(r.eyeId, "#101216"); } catch { /* gone */ }
      try { ctx.engine.parts.setPosition(r.headId, r.headPos); } catch { /* gone */ }
      S.flinch.splice(i, 1);
    }
  }
}

// ---- drive ------------------------------------------------------------------------
function showSteer(ctx) {
  try { ctx.engine.parts.setPosition(S.steerId, [STEER_X, FLOOR_TOP + 1.3, LANE_Z[S.lane]]); } catch { /* gone */ }
}
function hideSteer(ctx) {
  try { ctx.engine.parts.setPosition(S.steerId, [STEER_X, -60, 0]); } catch { /* gone */ }
}

function startDrive(ctx) {
  if (!S || S.driving || S.crashT > 0) return;
  if (S.points < DRIVE_COST) { toast(ctx, "Driving costs 100 Points — keep riding.", "🚌"); return; }
  S.points -= DRIVE_COST;
  S.driving = true;
  S.lane = 1; S.obstacles = []; S.spawned = 0; S.cleared = 0; S.spawnT = 0.7; S.obSpeed = OBST_SPEED0;
  S.prevWalk = (ctx.player.getWalkSpeed ? ctx.player.getWalkSpeed() : 16) || 16;
  try { ctx.player.setWalkSpeed(0); } catch { /* fine */ }
  try { ctx.player.teleport(DRIVER_SEAT, SPAWN_YAW); } catch { /* fine */ }
  showSteer(ctx);
  try { ctx.services.badges.award("drive"); } catch { /* fine */ }
  toast(ctx, "You grabbed the wheel! Dodge the traffic — ◀ ▶", "🚦", 3200);
  hud(ctx); refreshButtons();
}

function steer(ctx, dir) {
  if (!S || !S.driving) return;
  S.lane = Math.max(0, Math.min(2, S.lane + dir));
  showSteer(ctx);
}

function spawnObstacle(ctx) {
  const laneIdx = (S.oseq + Math.floor(S.spawned * 2.3)) % 3; // varied but deterministic
  S.oseq++;
  const cone = S.spawned % 3 === 2;
  const id = "bus_ob_" + (S.oseq);
  const z = LANE_Z[laneIdx];
  // tall enough to clear the low hood, so the driver sees each one coming
  const oy = cone ? FLOOR_TOP + 2.8 : FLOOR_TOP + 2.3;
  if (cone) {
    ctx.engine.parts.create({ id, shape: "cylinder", size: [1.9, 5.4, 1.9], position: [OBSTACLE_SPAWN_X, oy, z], color: "#ff7a1a", material: "plastic", canCollide: false });
  } else {
    const carCol = ["#e0245e", "#2f6fd0", "#3ddc84", "#a05cff"][S.spawned % 4];
    ctx.engine.parts.create({ id, shape: "box", size: [4.8, 4.4, 5], position: [OBSTACLE_SPAWN_X, oy, z], color: carCol, material: "metal", canCollide: false });
  }
  S.obstacles.push({ id, laneIdx, x: OBSTACLE_SPAWN_X, speed: S.obSpeed, y: oy });
  S.spawned++;
  S.obSpeed += 4;
}

function stepDrive(ctx, dt) {
  // spawn until the full run is on the road
  if (S.spawned < DRIVE_TARGET) {
    S.spawnT -= dt;
    if (S.spawnT <= 0) { spawnObstacle(ctx); S.spawnT = Math.max(0.8, OBST_INT0 - S.spawned * 0.07); }
  }
  for (let i = S.obstacles.length - 1; i >= 0; i--) {
    const o = S.obstacles[i];
    o.x -= o.speed * dt;
    try { ctx.engine.parts.setPosition(o.id, [o.x, o.y, LANE_Z[o.laneIdx]]); } catch { /* gone */ }
    if (o.x <= RESOLVE_X) {
      if (o.laneIdx === S.lane) { crash(ctx, true); return; }
      // dodged
      try { ctx.engine.parts.remove(o.id); } catch { /* gone */ }
      S.obstacles.splice(i, 1);
      S.points += DODGE_BONUS;
      S.cleared++;
      if (S.cleared >= DRIVE_TARGET) { winDrive(ctx); return; }
    }
  }
}

function winDrive(ctx) {
  S.points += DRIVE_WIN;
  endDrive(ctx);
  toast(ctx, `Legendary driving! +${DRIVE_WIN} Points. You kept everyone alive.`, "🏆", 3600);
  try { ctx.services.badges.award("survive"); } catch { /* fine */ }
  hud(ctx); refreshButtons();
}

function endDrive(ctx) {
  S.driving = false;
  for (const o of S.obstacles) { try { ctx.engine.parts.remove(o.id); } catch { /* gone */ } }
  S.obstacles = [];
  hideSteer(ctx);
  try { ctx.player.setWalkSpeed(S.prevWalk || 16); } catch { /* fine */ }
  try { ctx.player.teleport(SPAWN, SPAWN_YAW); } catch { /* fine */ }
}

// ---- crash: everyone dies, everything resets --------------------------------------
function crash(ctx, mine) {
  if (S.crashT > 0) return;
  endDrive(ctx);
  S.crashT = CRASH_DUR;
  S.points = 0;
  if (mine) { S.myCrash++; try { ctx.services.badges.award("crash"); } catch { /* fine */ } }
  // every rider slumps grey and topples
  for (const r of S.riders) {
    try { ctx.engine.parts.setColor(r.bodyId, "#6b7280"); } catch { /* gone */ }
    try { ctx.engine.parts.setColor(r.headId, "#8a94a3"); } catch { /* gone */ }
    try { ctx.engine.parts.setColor(r.eyeId, "#c81e1e"); } catch { /* gone */ }
    try { ctx.engine.parts.setRotation(r.bodyId, [0, 0, 78]); } catch { /* gone */ }
    try { ctx.engine.parts.setPosition(r.headId, [r.headPos[0] + 1.4, FLOOR_TOP + 0.9, r.headPos[2]]); } catch { /* gone */ }
  }
  S.flinch = [];
  try { ctx.player.setWalkSpeed(0); } catch { /* fine */ }
  try { ctx.engine.audio.playSfx("oof"); } catch { /* optional */ }
  toast(ctx, mine ? "💥 YOU CRASHED THE BUS — EVERYONE DIED!" : "💥 THE BUS CRASHED — EVERYONE DIED!", "💥", 3000);
  hud(ctx); refreshButtons();
}

function resetAfterCrash(ctx) {
  for (const r of S.riders) {
    try { ctx.engine.parts.setColor(r.bodyId, r.bodyColor); } catch { /* gone */ }
    try { ctx.engine.parts.setColor(r.headId, r.headColor); } catch { /* gone */ }
    try { ctx.engine.parts.setColor(r.eyeId, "#101216"); } catch { /* gone */ }
    try { ctx.engine.parts.setRotation(r.bodyId, [0, 0, 0]); } catch { /* gone */ }
    try { ctx.engine.parts.setPosition(r.headId, r.headPos); } catch { /* gone */ }
  }
  if (dom) dom.flash.style.opacity = "0";
  try { ctx.player.setWalkSpeed(S.prevWalk || 16); } catch { /* fine */ }
  try { ctx.player.teleport(SPAWN, SPAWN_YAW); } catch { /* fine */ }
  toast(ctx, "🚌 A new bus pulls up. Everyone's back — and every Point is gone.", "🚌", 3200);
  hud(ctx); refreshButtons();
}

// ---- lifecycle --------------------------------------------------------------------
export function init(ctx) {
  S = fresh();
  const world = buildBus();
  S.riders = world.riders;
  S.steerId = world.steerId;
  for (const def of world.parts) {
    try { ctx.engine.parts.create(def); } catch { /* one bad part is not a dead Place */ }
  }
  dom = buildDom(ctx);
  hud(ctx);
  refreshButtons();
  toast(ctx, "Stuck on the bus. +1 Point a second. Spend them on chaos.", "🚌", 4200);
}

export function update(dt, ctx) {
  if (!S) return;
  if (S.needleCd > 0) S.needleCd = Math.max(0, S.needleCd - dt);

  // crash freeze-frame: fade the red flash, then respawn the world
  if (S.crashT > 0) {
    S.crashT -= dt;
    if (dom) dom.flash.style.opacity = String(Math.max(0, Math.min(0.72, (S.crashT / CRASH_DUR) * 0.72)));
    if (S.crashT <= 0) { S.crashT = 0; resetAfterCrash(ctx); }
    return; // nothing else ticks while the bus is a wreck
  }

  // points: a second is a point, riding or driving
  S.points += dt;
  if (S.points > S.best) S.best = S.points;
  if (Math.floor(S.points) >= 30) { try { ctx.services.badges.award("ride"); } catch { /* fine */ } }

  stepNeedles(ctx, dt);
  if (S.driving) stepDrive(ctx, dt);

  // presence: publish our score + crash counter; a peer's crash resets everyone here too
  S.pubT -= dt;
  if (S.pubT <= 0) {
    S.pubT = PUBLISH_EVERY;
    const net = ctx.services.net;
    if (net && typeof net.publish === "function") {
      try { net.publish({ points: Math.floor(S.points), crash: S.myCrash }); } catch { /* solo */ }
    }
  }
  const net = ctx.services.net;
  if (net && typeof net.roster === "function") {
    let roster = [];
    try { roster = net.roster() || []; } catch { roster = []; }
    for (const p of roster) {
      const c = p && p.state && Number.isFinite(p.state.crash) ? p.state.crash : 0;
      const seen = S.seenCrash.get(p.id);
      if (seen === undefined) { S.seenCrash.set(p.id, c); continue; } // first sighting: no trigger
      if (c > seen) { S.seenCrash.set(p.id, c); if (S.crashT <= 0) { crash(ctx, false); return; } }
    }
  }

  S.hudT -= dt;
  if (S.hudT <= 0) { S.hudT = HUD_EVERY; hud(ctx); refreshButtons(); }
}

export function dispose(ctx) {
  if (S) {
    for (const n of S.needles) { try { ctx.engine.parts.remove(n.id); } catch { /* gone */ } }
    for (const o of S.obstacles) { try { ctx.engine.parts.remove(o.id); } catch { /* gone */ } }
    try { if (S.driving) ctx.player.setWalkSpeed(S.prevWalk || 16); } catch { /* fine */ }
  }
  if (dom) {
    dom.flash.remove(); dom.wrap.remove(); dom.lanes.remove();
    dom = null;
  }
  try { ctx.services.ui.removeHudStat("bus-points"); } catch { /* fine */ }
  S = null;
}

// Test seam (spec 25 §8): read state without waiting for a repaint.
export function debugState() {
  if (!S) return null;
  return { points: Math.floor(S.points), driving: S.driving, crashing: S.crashT > 0, cleared: S.cleared, lane: S.lane };
}
