// src/games/bossfight/game.js — Boss Battles. Spec 22 owns this Place.
//
// Three fights in a line, gated: Mossback (grass) → Timberjaw (wood) → Magmarok
// (lava). The action button is a SWING — reach 7, a 100° arc, no purchase needed
// (spec 22 §2.5) — and the player has an arena HP bar instead of one-touch death.
//
// The first kill of each boss pays Oofbux ONCE, EVER: the latch is the save's
// killed.<key> transitioning false→true, so deaths, reloads and reruns cannot double
// it (spec 22 §2.2). Repeat kills pay the small repeat amount and no badge.

import { buildValley, SPAWN, ARENAS, GATES, FLOOR_TOP } from "./scripts/layout.js";
import {
  createFight, trophyParts, BOSS_SPEC,
  PLAYER_HP, SWING, HIT_IFRAMES_S, REGEN_DELAY_S, REGEN_PER_S,
} from "./scripts/bosses.js";

export const meta = {
  slug: "bossfight",
  name: "Boss Battles",
  icon: "⚔️",
  description: "Three bosses, one valley: grass, wood, lava. First kills pay out.",
  version: "1.0.0",
};

const SAVE_VERSION = 1;
const HUD_EVERY_S = 0.2;

let valley = null;
let live = new Map();          // layout id -> engine id
let fights = [];               // one controller per boss, in order
let trophies = [];             // engine ids of placed trophy heads
let subs = [];
let saveState = null;
let hp = PLAYER_HP;
let iframes = 0;
let sinceHit = 999;
let swingCd = 0;
let dead = false;
let runT = 0;
let hudAt = 0;
let welcomed = false;
let swings = 0;      // action presses that produced a swing (bf:state observability)
let swingHits = 0;   // swings that connected with a boss
let lastSwing = null; // diagnostic snapshot of the most recent swing (bf:state)

// ---------------------------------------------------------------------------------

function defaultSave() {
  return {
    schemaVersion: SAVE_VERSION,
    killed: { grass: false, wood: false, lava: false },
    kills: { grass: 0, wood: 0, lava: 0 },
    deaths: 0,
    bestTimeS: { grass: null, wood: null, lava: null },
  };
}

function loadSave(ctx) {
  let s = null;
  try { s = ctx.services.saves.load(); } catch { s = null; }
  const d = defaultSave();
  if (s && typeof s === "object" && s.schemaVersion === SAVE_VERSION) {
    for (const k of ["grass", "wood", "lava"]) {
      d.killed[k] = Boolean(s.killed && s.killed[k]);
      d.kills[k] = Number.isInteger(s.kills && s.kills[k]) ? s.kills[k] : 0;
      const bt = s.bestTimeS && s.bestTimeS[k];
      d.bestTimeS[k] = Number.isFinite(bt) && bt > 0 ? bt : null;
    }
    d.deaths = Number.isInteger(s.deaths) ? s.deaths : 0;
  }
  saveState = d;
}

function saveNow(ctx) {
  try { ctx.services.saves.save(saveState); } catch { /* quota is not worth a lost kill */ }
}

// ---------------------------------------------------------------------------------

function specFor(key) {
  return BOSS_SPEC.find((s) => s.key === key);
}

function openGate(ctx, gateLayoutId, silent) {
  const id = live.get(gateLayoutId);
  if (!id) return;
  const parts = ctx.engine.parts;
  // The gate stays visible but stops being a wall — sunk glassy, unmistakably open.
  try { parts.setCanCollide(id, false); } catch { /* gone */ }
  try { parts.setTransparency(id, 0.82); } catch { /* gone */ }
  if (!silent) ctx.engine.audio.playSfx("warp");
}

function syncGates(ctx, silent) {
  for (const g of GATES) {
    if (saveState.killed[g.needs]) openGate(ctx, g.id, silent);
  }
}

function placeTrophy(ctx, key) {
  const spec = specFor(key);
  const at = valley.plinthTop[key];
  if (!spec || !at) return;
  for (const def of trophyParts(spec, at)) {
    try { trophies.push(ctx.engine.parts.create({ ...def, canCollide: false })); } catch { /* shelf stays bare */ }
  }
}

function bossDown(ctx, key, timeS) {
  const spec = specFor(key);
  const first = !saveState.killed[key];
  saveState.killed[key] = true;
  saveState.kills[key] += 1;
  if (saveState.bestTimeS[key] === null || timeS < saveState.bestTimeS[key]) {
    saveState.bestTimeS[key] = Math.round(timeS * 10) / 10;
  }
  saveNow(ctx);

  if (first) {
    ctx.services.economy.award(spec.reward.first, "bossfight:" + key);
    ctx.services.badges.award(spec.badge);
    placeTrophy(ctx, key);
    ctx.services.ui.toast(`${spec.name} is DOWN! +${spec.reward.first} Oofbux — first kill!`, { icon: spec.icon, duration: 6 });
  } else {
    ctx.services.economy.award(spec.reward.repeat, "bossfight:" + key + "-again");
    ctx.services.ui.toast(`${spec.name} again. +${spec.reward.repeat} Oofbux.`, { icon: spec.icon, duration: 4 });
  }
  if (saveState.killed.grass && saveState.killed.wood && saveState.killed.lava) {
    // award() refuses repeats itself; calling on every lava kill is safe.
    ctx.services.badges.award("all");
  }
  syncGates(ctx, false);
  const g = GATES.find((x) => x.needs === key);
  if (g) ctx.services.ui.toast("A gate grinds open ahead.", { icon: "🚪", duration: 4 });
}

function playerHit(ctx, amount, what) {
  if (dead || iframes > 0) return;
  hp = Math.max(0, hp - amount);
  sinceHit = 0;
  iframes = HIT_IFRAMES_S;
  ctx.engine.audio.playSfx("oof");
  if (hp <= 0 && !dead) {
    dead = true;
    saveState.deaths += 1;
    saveNow(ctx);
    ctx.player.kill(what);
  }
}

function swing(ctx) {
  if (swingCd > 0 || dead) return;
  swingCd = SWING.COOLDOWN_S;
  swings += 1;
  ctx.engine.audio.playSfx("whoosh");
  const p = ctx.player.position();
  // Facing off the avatar's yaw, with the trollobby shield's velocity fallback so a
  // headless run still has a direction (its comment, its convention).
  let look = [1, 0, 0];
  const av = ctx.player.avatar;
  if (av && av.rotation) {
    look = [Math.sin(av.rotation.y), 0, Math.cos(av.rotation.y)];
  } else {
    const v = ctx.player.velocity();
    const l = Math.hypot(v[0], v[2]);
    if (l > 0.5) look = [v[0] / l, 0, v[2] / l];
  }
  const hitTest = (target) => {
    const dx = target[0] - p[0], dz = target[2] - p[2];
    const dist = Math.hypot(dx, dz);
    if (dist > SWING.RANGE) return false;
    const dot = (dx * look[0] + dz * look[2]) / (dist || 1);
    return dot >= Math.cos((SWING.ARC_DEG / 2) * Math.PI / 180);
  };

  // the dummy pops a chime so the plaza teaches the verb
  const dummyId = live.get(valley.dummyId);
  if (dummyId) {
    const dp = [8, FLOOR_TOP + 3.4, -10];
    if (hitTest(dp)) ctx.engine.audio.playSfx("chime");
  }
  lastSwing = { p: p.slice(), look: look.slice(), targets: [] };
  for (const f of fights) {
    if (!f.alive() || !f.isEngaged()) continue;
    const bp = f.pos();
    // the body is fat; swing reach is measured to its surface, not its center
    const reachTo = [bp[0], 0, bp[2]];
    const dx = reachTo[0] - p[0], dz = reachTo[2] - p[2];
    const dist = Math.max(0, Math.hypot(dx, dz) - 4); // body radius allowance
    const rawDist = Math.hypot(bp[0] - p[0], bp[2] - p[2]);
    lastSwing.targets.push({ key: f.key, rawDist: Math.round(rawDist * 100) / 100, dist: Math.round(dist * 100) / 100 });
    if (dist <= SWING.RANGE && hitTest(bp)) {
      if (f.hit(SWING.DAMAGE)) swingHits += 1;
    }
  }
}

// ---------------------------------------------------------------------------------

function hud(ctx) {
  const ui = ctx.services.ui;
  const hearts = Math.round((hp / PLAYER_HP) * 10);
  ui.setHudStat("bfHp", {
    icon: "❤️", label: "HP",
    value: "█".repeat(hearts).padEnd(10, "░") + ` ${hp}/${PLAYER_HP}`,
  });
  const engagedFight = fights.find((f) => f.alive() && f.isEngaged());
  if (engagedFight) {
    const spec = specFor(engagedFight.key);
    ui.setHudStat("bfBoss", {
      icon: spec.icon, label: spec.name + (engagedFight.phase() > 0 ? ` (phase ${engagedFight.phase() + 1})` : ""),
      value: `${engagedFight.hp()}/${engagedFight.maxHp()}`,
    });
  } else {
    ui.removeHudStat("bfBoss");
  }
  const done = ["grass", "wood", "lava"].filter((k) => saveState.killed[k]).length;
  ui.setHudStat("bfProgress", { icon: "🏆", label: "Bosses", value: `${done}/3` });
  ui.setHudStat("bfSwing", { icon: "⚔️", label: "Swing (E)", value: swingCd > 0 ? swingCd.toFixed(1) + "s" : "ready" });
}

// ---------------------------------------------------------------------------------

export function init(ctx) {
  subs = [];
  live = new Map();
  fights = [];
  trophies = [];
  hp = PLAYER_HP;
  iframes = 0;
  sinceHit = 999;
  swingCd = 0;
  dead = false;
  runT = 0;
  hudAt = 0;
  swings = 0;
  swingHits = 0;
  loadSave(ctx);

  valley = buildValley();
  const parts = ctx.engine.parts;
  for (const def of valley.parts) {
    try { live.set(def.id, parts.create(def)); } catch { /* one bad part is not a dead Place */ }
  }

  for (const spec of BOSS_SPEC) {
    const a = ARENAS[spec.key];
    fights.push(createFight({
      parts, spec,
      home: [a.cx, FLOOR_TOP, a.cz],
      floorTop: FLOOR_TOP,
      sfx: (n) => ctx.engine.audio.playSfx(n),
      onPlayerHit: (amount, what) => playerHit(ctx, amount, what),
      onDown: (timeS) => bossDown(ctx, spec.key, timeS),
      onEngage: () => ctx.services.ui.toast(`${spec.name} wakes up!`, { icon: spec.icon, duration: 3 }),
    }));
  }

  // gates that are already earned open silently on load
  syncGates(ctx, true);
  for (const k of ["grass", "wood", "lava"]) if (saveState.killed[k]) placeTrophy(ctx, k);

  subs.push(ctx.engine.input.onAction("action1", () => swing(ctx)));
  if (typeof ctx.engine.input.setActionButton === "function") {
    try { ctx.engine.input.setActionButton(1, { label: "⚔️" }); } catch { /* touch-only nicety */ }
  }

  subs.push(ctx.events.on("player:died", () => {
    // The platform respawns us at the plaza; the current fight resets fully.
    dead = false;
    hp = PLAYER_HP;
    iframes = 1.5;
    sinceHit = 999;
    for (const f of fights) f.reset();
  }));

  hud(ctx);
  if (!welcomed) {
    welcomed = true;
    ctx.services.ui.toast("Swing with E (or the ⚔️ button). Try the training dummy, then head for the meadow.", { icon: "⚔️", duration: 7 });
  }
}

export function update(dt, ctx) {
  runT += dt;
  if (swingCd > 0) swingCd = Math.max(0, swingCd - dt);
  if (iframes > 0) iframes = Math.max(0, iframes - dt);
  sinceHit += dt;
  if (!dead && hp < PLAYER_HP && sinceHit >= REGEN_DELAY_S) {
    hp = Math.min(PLAYER_HP, hp + REGEN_PER_S * dt);
    hp = Math.round(hp * 10) / 10;
  }

  const p = ctx.player.position();
  for (const f of fights) {
    if (!f.alive()) { f.update(dt, p); continue; }
    // a boss behind a still-closed gate sleeps: you cannot be fought through a wall
    const gate = GATES.find((g) => g.opens === f.key);
    if (gate && !saveState.killed[gate.needs]) continue;
    f.update(dt, p);
  }

  if (runT - hudAt >= HUD_EVERY_S) { hudAt = runT; hud(ctx); }
  // The scenario's window (spec 22 §8): state as an event, EVERY tick — a charging
  // boss moves ~0.4 studs per tick, and a throttled snapshot had the fence swinging
  // at where the boss was, not where it is. No module back-doors, no globals.
  {
    try {
      ctx.events.emit("bf:state", {
        hp,
        swings, swingHits, lastSwing,
        killed: { ...saveState.killed },
        kills: { ...saveState.kills },
        fights: fights.map((f) => ({
          key: f.key, hp: f.hp(), alive: f.alive(), engaged: f.isEngaged(),
          shots: f.shotProbe(), pos: f.pos(),
        })),
      });
    } catch { /* an events hiccup must not stop the fight */ }
  }
}

export function dispose(ctx) {
  for (const off of subs) { try { off(); } catch { /* already gone */ } }
  subs = [];
  for (const f of fights) { try { f.dispose(); } catch { /* gone */ } }
  fights = [];
  for (const id of trophies) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
  trophies = [];
  if (ctx && ctx.services && ctx.services.ui) {
    for (const k of ["bfHp", "bfBoss", "bfProgress", "bfSwing"]) ctx.services.ui.removeHudStat(k);
  }
  valley = null;
  live = new Map();
  saveState = null;
}
