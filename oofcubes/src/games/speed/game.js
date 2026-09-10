// src/games/speed/game.js — Speed Simulator. Spec 24 owns this Place.
//
// The loop: stand on the treadmill and hold to run — your Speed climbs. Speed is mapped
// to how fast you actually move (config.walkFor). Walk into a Zone and its Keeper — a
// robot guard, faster in every zone — sprints to cut you off between the entrance and
// the crate. Beat it to the pedestal and the crate opens: Coins, and sometimes a rarer
// cosmetic. Coins upgrade the treadmill (a stronger motor trains you faster, better
// shoes turn Speed into real pace), which is how you out-run the next, faster Keeper.
//
// The Keepers are hazards, not players: single-eyed metal guards with a number.
// ARCHITECTURE §9 forbids anything that reads as a fake player, and these do not.

import {
  ZONES, walkFor, gainPerSec, fmt,
  motorCost, shoesCost, AUTO_RUN_COST, MOTOR_MAX, SHOES_MAX, CRATE_COOLDOWN_S,
} from "./scripts/config.js";
import { buildWorld, FLOOR_TOP, TREAD } from "./scripts/layout.js";
import { tableFor, weightTotal, oddsText, rollCrate, RARITY } from "./scripts/crates.js";

export const meta = {
  slug: "speed",
  name: "Speed Simulator",
  icon: "🏃",
  description: "Run the treadmill, out-run the Keepers, crack their crates, upgrade, repeat.",
  version: "1.0.0",
};

const SAVE_VERSION = 1;
const HUD_EVERY_S = 0.2;
const TAG_R = 3.2;          // how close a Keeper must get to bounce you
const KEEPER_RETURN = 26;   // speed a disengaged Keeper walks home at

let world = null;
let live = new Map();       // layout id -> engine id (ids are stable, so identity map)
let subs = [];
let save = null;
let armed = new Set();      // zone indices currently being contested
let keeperPos = [];         // per-zone current [x,z] of the Keeper root
let cooldown = [];          // per-zone seconds until the crate can be cracked again
let onTreadmill = false;
let runT = 0;
let hudAt = 0;
let panelOpen = false;
let welcomed = false;

// ---------------------------------------------------------------------------------

function defaultSave() {
  return {
    schemaVersion: SAVE_VERSION,
    speed: 0, coins: 0, motor: 0, shoes: 0, auto: false,
    reached: ZONES.map(() => false), // first-reach Oofbux latch, per zone
  };
}

function loadSave(ctx) {
  let s = null;
  try { s = ctx.services.saves.load(); } catch { s = null; }
  const d = defaultSave();
  if (s && typeof s === "object" && s.schemaVersion === SAVE_VERSION) {
    d.speed = Number.isFinite(s.speed) && s.speed > 0 ? s.speed : 0;
    d.coins = Number.isFinite(s.coins) && s.coins > 0 ? s.coins : 0;
    d.motor = Number.isInteger(s.motor) ? Math.max(0, Math.min(MOTOR_MAX, s.motor)) : 0;
    d.shoes = Number.isInteger(s.shoes) ? Math.max(0, Math.min(SHOES_MAX, s.shoes)) : 0;
    d.auto = !!s.auto;
    if (Array.isArray(s.reached)) d.reached = ZONES.map((_, i) => !!s.reached[i]);
  }
  save = d;
}

function saveNow(ctx) {
  try { ctx.services.saves.save(save); } catch { /* a full quota is not worth a lost run */ }
}

// ---------------------------------------------------------------------------------

const DOM = {
  el(tag, style, text) {
    const e = document.createElement(tag);
    if (style) e.setAttribute("style", style);
    if (text != null) e.textContent = text;
    return e;
  },
  btn(label, onClick, disabled) {
    const b = DOM.el("button", "padding:8px 12px;border-radius:8px;border:none;cursor:pointer;font:inherit;"
      + "font-weight:700;background:" + (disabled ? "var(--oof-line,#333a48)" : "var(--oof-accent,#ff7a1a)") + ";"
      + "color:" + (disabled ? "var(--oof-text-dim,#8a93a6)" : "#141018") + ";", label);
    b.disabled = !!disabled;
    if (!disabled) b.addEventListener("click", onClick);
    return b;
  },
};

// ---------------------------------------------------------------------------------

function keeperHome(i) {
  return [world.zones[i].keeperHomeX, 0];
}

function placeKeeper(ctx, i) {
  const z = world.zones[i];
  const [kx, kz] = keeperPos[i];
  // face the player: the eye is at -z locally, so yaw so -z points along travel. We keep
  // it simple — the guard always faces down-lane (−x, toward the entrance it defends).
  for (const k of z.keeper) {
    try {
      ctx.engine.parts.setPosition(k.id, [kx + k.off[0], FLOOR_TOP + k.off[1], kz + k.off[2]]);
    } catch { /* a lost limb is not a lost guard */ }
  }
}

function resetKeeper(ctx, i) {
  keeperPos[i] = keeperHome(i);
  placeKeeper(ctx, i);
}

// ---------------------------------------------------------------------------------
// The crate: reaching the pedestal cracks it. One roll, granted immediately, shown in a
// panel with the zone's real odds (read off the same weights, spec 24 §5).
// ---------------------------------------------------------------------------------

function crackCrate(ctx, i) {
  const zone = ZONES[i];
  if (cooldown[i] > 0 || panelOpen) return;
  const row = rollCrate(zone.key);
  let gotText;
  if (row.kind === "coins") {
    save.coins += row.amount;
    gotText = `${fmt(row.amount)} Coins`;
  } else {
    const had = ctx.services.avatar.owns(row.id);
    ctx.services.avatar.grantItem(row.id, "speed");
    // A duplicate cosmetic pays Coins instead, so a crate is never a dud (spec 24 §5).
    if (had) { save.coins += 500; gotText = `${row.note} (already owned) → 500 Coins`; }
    else gotText = row.note;
  }
  // First time you ever reach this zone's crate: a one-time platform Oofbux reward.
  if (!save.reached[i]) {
    save.reached[i] = true;
    ctx.services.economy.award(zone.firstReachOofbux, "speed:" + zone.key);
    ctx.services.badges.award("zone" + (i + 1));
    if (ZONES.every((_, z) => save.reached[z])) ctx.services.badges.award("all");
  }
  cooldown[i] = CRATE_COOLDOWN_S;
  armed.delete(i);
  resetKeeper(ctx, i);
  saveNow(ctx);
  ctx.engine.audio.playSfx("fanfare");
  openCratePanel(ctx, i, row, gotText);
  emitState(ctx);
}

function openCratePanel(ctx, i, wonRow, gotText) {
  const zone = ZONES[i];
  const panel = ctx.services.ui.openPanel({ title: `${zone.icon} ${zone.name} Crate`, onClose: () => { panelOpen = false; } });
  panelOpen = true;
  const body = panel.bodyEl;
  if (!body) { panelOpen = false; return; }

  const won = DOM.el("div", "text-align:center;font-size:var(--oof-size-lg,20px);font-weight:800;margin-bottom:4px;", `You got: ${gotText}`);
  const sub = DOM.el("div", "text-align:center;color:var(--oof-text-dim,#8a93a6);font-size:var(--oof-size-sm,13px);margin-bottom:12px;",
    "Every drop and its real odds — read off the same weights the roll uses.");
  body.append(won, sub);

  const total = weightTotal(zone.key);
  for (const row of tableFor(zone.key)) {
    const isWon = row === wonRow;
    const line = DOM.el("div", "display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;margin-bottom:6px;"
      + "background:var(--oof-bg-2,#171a24);border:1px solid " + (isWon ? RARITY[row.rarity].tint : "var(--oof-line,#2b3040)") + ";");
    line.append(DOM.el("span", "font-size:20px;line-height:1;", row.icon));
    const mid = DOM.el("div", "flex:1;min-width:0;");
    mid.append(DOM.el("div", "font-weight:700;", row.kind === "coins" ? `${fmt(row.amount)} Coins` : row.note));
    mid.append(DOM.el("div", "font-size:var(--oof-size-sm,13px);color:" + RARITY[row.rarity].tint + ";", RARITY[row.rarity].label));
    line.append(mid);
    line.append(DOM.el("span", "font-variant-numeric:tabular-nums;color:var(--oof-text-dim,#8a93a6);white-space:nowrap;", oddsText(row.weight, total)));
    body.append(line);
  }
}

// ---------------------------------------------------------------------------------
// The upgrade shop: Coins from crates buy a stronger motor, better shoes, and auto-run.
// ---------------------------------------------------------------------------------

function openShop(ctx) {
  if (panelOpen) return;
  const panel = ctx.services.ui.openPanel({ title: "🛠 Treadmill Upgrades", onClose: () => { panelOpen = false; } });
  panelOpen = true;
  const body = panel.bodyEl;
  if (!body) { panelOpen = false; return; }

  const coinLine = DOM.el("div", "text-align:center;font-weight:800;margin-bottom:12px;font-size:var(--oof-size-lg,20px);");
  body.append(coinLine);

  function row(title, desc, level, max, costFn, apply) {
    const wrap = DOM.el("div", "padding:10px;border-radius:8px;margin-bottom:8px;background:var(--oof-bg-2,#171a24);border:1px solid var(--oof-line,#2b3040);");
    const top = DOM.el("div", "display:flex;align-items:center;gap:8px;");
    const mid = DOM.el("div", "flex:1;min-width:0;");
    mid.append(DOM.el("div", "font-weight:700;", `${title}  ${max != null ? `(Lv ${level}/${max})` : (level ? "✓ owned" : "")}`));
    mid.append(DOM.el("div", "font-size:var(--oof-size-sm,13px);color:var(--oof-text-dim,#8a93a6);", desc));
    top.append(mid);
    const maxed = max != null ? level >= max : !!level;
    const cost = maxed ? 0 : costFn(level);
    const afford = save.coins >= cost;
    const b = DOM.btn(maxed ? "MAX" : `${fmt(cost)} 🪙`, () => {
      if (maxed || save.coins < cost) return;
      save.coins -= cost;
      apply();
      saveNow(ctx);
      ctx.engine.audio.playSfx("buy");
      repaint();
      emitState(ctx);
    }, maxed || !afford);
    top.append(b);
    wrap.append(top);
    body.append(wrap);
  }

  function repaint() {
    coinLine.textContent = `🪙 ${fmt(save.coins)} Coins`;
    // clear rows (keep the coin line)
    while (body.children.length > 1) body.removeChild(body.lastChild);
    row("Motor", `Train faster on the belt (+6 Speed/sec per level). Now ${gainPerSec(save.motor)}/sec.`,
      save.motor, MOTOR_MAX, motorCost, () => { save.motor++; });
    row("Running Shoes", `Turn Speed into real pace — beat faster Keepers. Level ${save.shoes}.`,
      save.shoes, SHOES_MAX, shoesCost, () => { save.shoes++; });
    row("Auto-Run", "The treadmill runs on its own — no need to hold the button.",
      save.auto ? 1 : 0, null, () => AUTO_RUN_COST, () => { save.auto = true; });
  }
  repaint();
}

// ---------------------------------------------------------------------------------

function hud(ctx) {
  const ui = ctx.services.ui;
  ui.setHudStat("spSpeed", { icon: "🏃", label: "Speed", value: fmt(save.speed) });
  ui.setHudStat("spCoins", { icon: "🪙", label: "Coins", value: fmt(save.coins) });
  const reached = save.reached.filter(Boolean).length;
  ui.setHudStat("spZones", { icon: "🏁", label: "Zones", value: `${reached}/${ZONES.length}` });
  if (onTreadmill) {
    ui.setHudStat("spTread", { icon: "⚡", label: "Treadmill", value: save.auto ? "auto-running" : "hold E to run" });
  } else {
    ui.removeHudStat("spTread");
  }
}

function emitState(ctx) {
  try {
    ctx.events.emit("sp:state", {
      speed: save.speed, coins: save.coins, motor: save.motor, shoes: save.shoes, auto: save.auto,
      reached: save.reached.slice(), armed: [...armed], cooldown: cooldown.slice(),
      walk: walkFor(save.speed, save.shoes), onTreadmill,
      keepers: world ? world.zones.map((_, i) => keeperPos[i] ? keeperPos[i].slice() : null) : [],
    });
  } catch { /* an events hiccup must not stop the run */ }
}

// ---------------------------------------------------------------------------------

export function init(ctx) {
  subs = [];
  live = new Map();
  armed = new Set();
  runT = 0;
  hudAt = 0;
  onTreadmill = false;
  panelOpen = false;
  loadSave(ctx);

  world = buildWorld();
  const parts = ctx.engine.parts;
  for (const def of world.parts) {
    try { parts.create(def); live.set(def.id, def.id); } catch { /* one bad part is not a dead Place */ }
  }

  keeperPos = world.zones.map((_, i) => keeperHome(i));
  cooldown = world.zones.map(() => 0);
  for (let i = 0; i < world.zones.length; i++) placeKeeper(ctx, i);

  // entrance pads arm the keeper; pedestals crack the crate; the pad opens the shop
  for (let i = 0; i < ZONES.length; i++) {
    subs.push(ctx.events.on("touch:sp_zone" + i, () => {
      if (cooldown[i] > 0) return;      // still cooling: no contest, just walk up
      if (!armed.has(i)) { armed.add(i); ctx.engine.audio.playSfx("whoosh"); }
    }));
    subs.push(ctx.events.on("touch:sp_crate" + i, () => crackCrate(ctx, i)));
  }
  subs.push(ctx.events.on("touch:sp_upgrade", () => openShop(ctx)));

  // apply the run-speed the current Speed stat buys, right away
  try { ctx.player.setWalkSpeed(walkFor(save.speed, save.shoes)); } catch { /* fine */ }

  hud(ctx);
  emitState(ctx);
  if (!welcomed) {
    welcomed = true;
    ctx.services.ui.toast("Stand on the treadmill and hold E to build Speed. Then out-run the Keepers to their crates!", { icon: "🏃", duration: 7 });
  }
}

export function update(dt, ctx) {
  if (!world) return;
  runT += dt;

  const p = ctx.player.position();

  // ---- treadmill: on the belt + running -> Speed climbs ----
  const onBelt = Math.abs(p[0] - TREAD.cx) <= TREAD.w / 2 + 0.5
    && Math.abs(p[2] - TREAD.cz) <= TREAD.d / 2 + 0.5
    && p[1] <= FLOOR_TOP + 4;
  onTreadmill = onBelt;
  if (onBelt) {
    const running = save.auto || (ctx.engine.input && ctx.engine.input.isDown && ctx.engine.input.isDown("action1"));
    if (running) {
      save.speed += gainPerSec(save.motor) * dt;
      // re-map run-speed as Speed grows, and save occasionally (not every frame)
      try { ctx.player.setWalkSpeed(walkFor(save.speed, save.shoes)); } catch { /* fine */ }
    }
  }

  // ---- keepers: chase while their zone is armed ----
  for (let i = 0; i < world.zones.length; i++) {
    if (cooldown[i] > 0) cooldown[i] = Math.max(0, cooldown[i] - dt);
    const z = world.zones[i];
    const home = keeperHome(i);
    if (armed.has(i)) {
      // move toward the player at this zone's keeper speed
      const kx = keeperPos[i][0], kz = keeperPos[i][1];
      const dx = p[0] - kx, dz = p[2] - kz;
      const d = Math.hypot(dx, dz) || 1;
      const step = ZONES[i].keeper * dt;
      keeperPos[i] = [kx + (dx / d) * step, kz + (dz / d) * step];
      placeKeeper(ctx, i);
      // caught? (and you have NOT already reached the pedestal)
      if (d <= TAG_R && p[0] < z.pedestalX - 3) {
        armed.delete(i);
        resetKeeper(ctx, i);
        try { ctx.player.teleport([z.entranceX - 4, FLOOR_TOP + 1.1, 0], 90); } catch { /* fine */ }
        ctx.engine.audio.playSfx("denied");
        ctx.services.ui.toast(`${ZONES[i].name} Keeper caught you! Train more Speed and try again.`, { icon: ZONES[i].icon, duration: 4 });
      } else if (p[0] < z.entranceX - 6) {
        // you retreated past the entrance — the contest is off
        armed.delete(i);
        resetKeeper(ctx, i);
      }
    } else {
      // drift home if displaced
      const kx = keeperPos[i][0], kz = keeperPos[i][1];
      const dx = home[0] - kx, dz = home[1] - kz;
      const d = Math.hypot(dx, dz);
      if (d > 0.5) {
        const step = Math.min(d, KEEPER_RETURN * dt);
        keeperPos[i] = [kx + (dx / d) * step, kz + (dz / d) * step];
        placeKeeper(ctx, i);
      }
    }
  }

  if (runT - hudAt >= HUD_EVERY_S) { hudAt = runT; hud(ctx); emitState(ctx); saveNow(ctx); }
}

export function dispose(ctx) {
  for (const off of subs) { try { off(); } catch { /* already gone */ } }
  subs = [];
  if (ctx && ctx.services && ctx.services.ui) {
    for (const k of ["spSpeed", "spCoins", "spZones", "spTread"]) ctx.services.ui.removeHudStat(k);
  }
  // restore the default walk speed so the next Place is not stuck at our mapping
  try { ctx.player.setWalkSpeed(16); } catch { /* fine */ }
  world = null;
  live = new Map();
  save = null;
  armed = new Set();
  keeperPos = [];
  cooldown = [];
}
