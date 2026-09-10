// src/games/speed/game.js — Speed Simulator. Spec 24 owns this Place.
//
// Stand on the treadmill and hold to run — Speed climbs, mapped to real run-pace. Out-run
// each zone's Keeper (a robot guard) to its crate; cracking it pays Coins, rarer
// cosmetics, and — at 30% / 5% / 0.5% — a Buff/ability. Coins buy better treadmills (17
// tiers, rusty → lightning) and shoes/motor. Buffs go in an inventory; you equip up to
// three (never while a Keeper is chasing) from a bar at the bottom of the screen, and
// they multiply training, pace, Coins, luck, and how slow the Keepers run.
//
// The Keepers are hazards, not players — single-eyed metal guards. ARCHITECTURE §9.

import {
  ZONES, walkForBuffed, gainPerSec, fmt,
  motorCost, shoesCost, AUTO_RUN_COST, MOTOR_MAX, SHOES_MAX, CRATE_COOLDOWN_S,
  TREADMILLS, treadmillById, treadmillIndex,
  BUFFS, buffById, BUFF_RARITY, MAX_EQUIPPED, rollBuff, combinedEffect,
} from "./scripts/config.js";
import { buildWorld, FLOOR_TOP, TREAD } from "./scripts/layout.js";
import { tableFor, weightTotal, oddsText, rollCrate, RARITY } from "./scripts/crates.js";

export const meta = {
  slug: "speed",
  name: "Speed Simulator",
  icon: "🏃",
  description: "Run the treadmill, out-run the Keepers, crack crates, collect buffs, upgrade, repeat.",
  version: "2.0.0",
};

const SAVE_VERSION = 2;
const HUD_EVERY_S = 0.2;
const TAG_R = 3.2;
const KEEPER_RETURN = 26;

let world = null;
let live = new Map();
let subs = [];
let save = null;
let armed = new Set();
let keeperPos = [];
let cooldown = [];
let onTreadmill = false;
let runT = 0;
let hudAt = 0;
let panelOpen = false;
let welcomed = false;
let buffBar = null;      // the fixed bottom-of-screen equipped-buffs bar
let openInventory = null; // set to a fn while a Place is live

// ---------------------------------------------------------------------------------

function defaultSave() {
  return {
    schemaVersion: SAVE_VERSION,
    speed: 0, coins: 0, motor: 0, shoes: 0, auto: false,
    treadmill: "rusty", reached: ZONES.map(() => false),
    buffs: [], equipped: [],
  };
}

function loadSave(ctx) {
  let s = null;
  try { s = ctx.services.saves.load(); } catch { s = null; }
  const d = defaultSave();
  // v1 and v2 both load; v1 simply lacks treadmill/buffs and gets the defaults.
  if (s && typeof s === "object" && (s.schemaVersion === 1 || s.schemaVersion === 2)) {
    d.speed = Number.isFinite(s.speed) && s.speed > 0 ? s.speed : 0;
    d.coins = Number.isFinite(s.coins) && s.coins > 0 ? s.coins : 0;
    d.motor = Number.isInteger(s.motor) ? Math.max(0, Math.min(MOTOR_MAX, s.motor)) : 0;
    d.shoes = Number.isInteger(s.shoes) ? Math.max(0, Math.min(SHOES_MAX, s.shoes)) : 0;
    d.auto = !!s.auto;
    if (Array.isArray(s.reached)) d.reached = ZONES.map((_, i) => !!s.reached[i]);
    if (typeof s.treadmill === "string" && treadmillById(s.treadmill).id === s.treadmill) d.treadmill = s.treadmill;
    if (Array.isArray(s.buffs)) d.buffs = s.buffs.filter((id) => buffById(id));
    if (Array.isArray(s.equipped)) d.equipped = s.equipped.filter((id) => buffById(id) && d.buffs.includes(id)).slice(0, MAX_EQUIPPED);
  }
  save = d;
}

function saveNow(ctx) {
  try { ctx.services.saves.save(save); } catch { /* a full quota is not worth a lost run */ }
}

// live modifiers from equipped buffs + the current treadmill
function eff() { return combinedEffect(save.equipped); }
function trainRate() { return gainPerSec(save.motor) * treadmillById(save.treadmill).gain * eff().train; }
function isChased() { return armed.size > 0; }

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
      + "font-weight:700;white-space:nowrap;background:" + (disabled ? "var(--oof-line,#333a48)" : "var(--oof-accent,#ff7a1a)") + ";"
      + "color:" + (disabled ? "var(--oof-text-dim,#8a93a6)" : "#141018") + ";", label);
    b.disabled = !!disabled;
    if (!disabled) b.addEventListener("click", onClick);
    return b;
  },
  // a detailed two-tone buff badge — a rounded core with a glow ring and the emoji
  badge(bf, size) {
    const s = size || 44;
    const wrap = DOM.el("div", `position:relative;width:${s}px;height:${s}px;flex:none;`);
    const ring = DOM.el("div", `position:absolute;inset:0;border-radius:12px;background:`
      + `radial-gradient(circle at 50% 35%, ${bf.look[1]}, ${bf.look[0]});`
      + `box-shadow:0 0 10px ${bf.look[1]}, inset 0 0 6px rgba(255,255,255,.35);`
      + `border:2px solid ${BUFF_RARITY[bf.rarity].tint};`);
    const glyph = DOM.el("div", `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;`
      + `font-size:${Math.round(s * 0.5)}px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.5));`, bf.icon);
    wrap.append(ring, glyph);
    return wrap;
  },
};

// ---------------------------------------------------------------------------------
// The bottom-of-screen buff bar: three slots showing what is equipped. Clicking it
// opens the inventory (spec 24 §9). Fixed, pointer-events only on itself.
// ---------------------------------------------------------------------------------

function buildBuffBar() {
  const bar = DOM.el("div", "position:fixed;left:50%;bottom:42px;transform:translateX(-50%);z-index:40;"
    + "display:flex;gap:8px;padding:8px 10px;border-radius:14px;pointer-events:auto;cursor:pointer;"
    + "background:rgba(14,16,24,.72);border:1px solid rgba(255,255,255,.10);backdrop-filter:blur(4px);");
  bar.title = "Your buffs — click to open the inventory";
  bar.addEventListener("click", () => { if (openInventory) openInventory(); });
  document.body.appendChild(bar);
  return bar;
}

function refreshBuffBar() {
  if (!buffBar) return;
  buffBar.textContent = "";
  for (let i = 0; i < MAX_EQUIPPED; i++) {
    const id = save.equipped[i];
    const bf = id ? buffById(id) : null;
    if (bf) {
      buffBar.appendChild(DOM.badge(bf, 42));
    } else {
      buffBar.appendChild(DOM.el("div", "width:42px;height:42px;border-radius:12px;flex:none;"
        + "border:2px dashed rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;"
        + "color:rgba(255,255,255,.3);font-size:20px;", "＋"));
    }
  }
}

function openInventoryPanel(ctx) {
  if (panelOpen) return;
  const panel = ctx.services.ui.openPanel({ title: "🎒 Buffs & Abilities", onClose: () => { panelOpen = false; } });
  panelOpen = true;
  const body = panel.bodyEl;
  if (!body) { panelOpen = false; return; }

  const status = DOM.el("div", "text-align:center;font-weight:800;margin-bottom:4px;");
  const note = DOM.el("div", "text-align:center;color:var(--oof-text-dim,#8a93a6);font-size:var(--oof-size-sm,13px);margin-bottom:10px;");
  body.append(status, note);
  const listWrap = DOM.el("div", "");
  body.append(listWrap);

  function repaint() {
    status.textContent = `Equipped ${save.equipped.length}/${MAX_EQUIPPED}`;
    note.textContent = isChased()
      ? "⚠ A Keeper is chasing you — you can't change buffs right now."
      : "Equip up to three. They stack while equipped.";
    listWrap.textContent = "";
    if (!save.buffs.length) {
      listWrap.append(DOM.el("div", "text-align:center;color:var(--oof-text-dim,#8a93a6);padding:16px;",
        "No buffs yet. Crack crates — 3 in 10 give one, and the rare and godly ones are something else."));
      return;
    }
    // owned buffs, godly first
    const order = { godly: 0, rare: 1, common: 2 };
    const owned = save.buffs.map(buffById).filter(Boolean).sort((a, b) => order[a.rarity] - order[b.rarity]);
    for (const bf of owned) {
      const equipped = save.equipped.includes(bf.id);
      const row = DOM.el("div", "display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;margin-bottom:6px;"
        + "background:var(--oof-bg-2,#171a24);border:1px solid " + (equipped ? BUFF_RARITY[bf.rarity].tint : "var(--oof-line,#2b3040)") + ";");
      row.append(DOM.badge(bf, 40));
      const mid = DOM.el("div", "flex:1;min-width:0;");
      mid.append(DOM.el("div", "font-weight:700;", `${bf.name}`));
      mid.append(DOM.el("div", "font-size:var(--oof-size-sm,13px);color:" + BUFF_RARITY[bf.rarity].tint + ";", BUFF_RARITY[bf.rarity].label));
      mid.append(DOM.el("div", "font-size:var(--oof-size-sm,13px);color:var(--oof-text-dim,#8a93a6);", bf.blurb));
      row.append(mid);
      const canChange = !isChased();
      const full = save.equipped.length >= MAX_EQUIPPED;
      const label = equipped ? "Unequip" : (full ? "3 equipped" : "Equip");
      const disabled = !canChange || (!equipped && full);
      row.append(DOM.btn(label, () => {
        if (isChased()) return;
        if (equipped) save.equipped = save.equipped.filter((x) => x !== bf.id);
        else if (save.equipped.length < MAX_EQUIPPED) save.equipped.push(bf.id);
        saveNow(ctx);
        refreshBuffBar();
        repaint();
        emitState(ctx);
        ctx.engine.audio.playSfx("click");
      }, disabled));
      listWrap.append(row);
    }
  }
  repaint();
}

// ---------------------------------------------------------------------------------

function keeperHome(i) { return [world.zones[i].keeperHomeX, 0]; }

function placeKeeper(ctx, i) {
  const z = world.zones[i];
  const [kx, kz] = keeperPos[i];
  for (const k of z.keeper) {
    try { ctx.engine.parts.setPosition(k.id, [kx + k.off[0], FLOOR_TOP + k.off[1], kz + k.off[2]]); } catch { /* a lost limb is not a lost guard */ }
  }
}
function resetKeeper(ctx, i) { keeperPos[i] = keeperHome(i); placeKeeper(ctx, i); }

// ---------------------------------------------------------------------------------

function crackCrate(ctx, i) {
  const zone = ZONES[i];
  if (cooldown[i] > 0 || panelOpen) return;
  const e = eff();
  const row = rollCrate(zone.key);
  let gotText;
  if (row.kind === "coins") {
    const amt = Math.floor(row.amount * e.coin);
    save.coins += amt;
    gotText = `${fmt(amt)} Coins`;
  } else {
    const had = ctx.services.avatar.owns(row.id);
    ctx.services.avatar.grantItem(row.id, "speed");
    if (had) { const bonus = Math.floor(500 * e.coin); save.coins += bonus; gotText = `${row.note} (owned) → ${fmt(bonus)} Coins`; }
    else gotText = row.note;
  }
  // the buff roll (spec 24 §9), biased by luck
  let buffDrop = null;
  const bf = rollBuff(e.luck);
  if (bf) {
    if (save.buffs.includes(bf.id)) { const dup = Math.floor(300 * e.coin); save.coins += dup; buffDrop = { bf, dup }; }
    else { save.buffs.push(bf.id); buffDrop = { bf, dup: 0 }; }
  }
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
  ctx.engine.audio.playSfx(buffDrop && !buffDrop.dup ? "sparkle" : "fanfare");
  openCratePanel(ctx, i, row, gotText, buffDrop);
  emitState(ctx);
}

function openCratePanel(ctx, i, wonRow, gotText, buffDrop) {
  const zone = ZONES[i];
  const panel = ctx.services.ui.openPanel({ title: `${zone.icon} ${zone.name} Crate`, onClose: () => { panelOpen = false; } });
  panelOpen = true;
  const body = panel.bodyEl;
  if (!body) { panelOpen = false; return; }

  body.append(DOM.el("div", "text-align:center;font-size:var(--oof-size-lg,20px);font-weight:800;margin-bottom:4px;", `You got: ${gotText}`));
  if (buffDrop) {
    const banner = DOM.el("div", "display:flex;align-items:center;gap:10px;justify-content:center;margin:8px 0;padding:8px;border-radius:10px;"
      + "background:rgba(255,255,255,.05);border:1px solid " + BUFF_RARITY[buffDrop.bf.rarity].tint + ";");
    banner.append(DOM.badge(buffDrop.bf, 40));
    const t = DOM.el("div", "");
    t.append(DOM.el("div", "font-weight:800;color:" + BUFF_RARITY[buffDrop.bf.rarity].tint + ";",
      `${BUFF_RARITY[buffDrop.bf.rarity].label} BUFF: ${buffDrop.bf.name}`));
    t.append(DOM.el("div", "font-size:var(--oof-size-sm,13px);color:var(--oof-text-dim,#8a93a6);",
      buffDrop.dup ? `Already owned → +${fmt(buffDrop.dup)} Coins` : buffDrop.bf.blurb + " — in your inventory!"));
    banner.append(t);
    body.append(banner);
  }
  body.append(DOM.el("div", "text-align:center;color:var(--oof-text-dim,#8a93a6);font-size:var(--oof-size-sm,13px);margin-bottom:10px;",
    "Every drop and its real odds — read off the same weights the roll uses."));

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

function recolorTreadmill(ctx) {
  const tm = treadmillById(save.treadmill);
  const t = world.tread;
  if (!t) return;
  const set = (id, color) => { try { ctx.engine.parts.setColor(id, color); } catch { /* gone */ } };
  for (const id of t.beltIds) set(id, tm.belt);
  for (const id of t.stripeIds) set(id, tm.stripe);
  for (const id of t.glowIds) set(id, tm.glow || tm.stripe);
  // light the glow bars for tiers that have one
  for (const id of t.glowIds) { try { ctx.engine.parts.setEmissiveIntensity(id, tm.glow ? 1.6 : 0.6); } catch { /* gone */ } }
}

function openShop(ctx) {
  if (panelOpen) return;
  const panel = ctx.services.ui.openPanel({ title: "🛠 Treadmill & Upgrades", onClose: () => { panelOpen = false; } });
  panelOpen = true;
  const body = panel.bodyEl;
  if (!body) { panelOpen = false; return; }

  const coinLine = DOM.el("div", "text-align:center;font-weight:800;margin-bottom:12px;font-size:var(--oof-size-lg,20px);");
  body.append(coinLine);
  const treadWrap = DOM.el("div", "margin-bottom:12px;");
  body.append(treadWrap);
  const upgWrap = DOM.el("div", "");
  body.append(upgWrap);

  function upgRow(where, title, desc, level, max, cost, apply) {
    const wrap = DOM.el("div", "padding:10px;border-radius:8px;margin-bottom:8px;background:var(--oof-bg-2,#171a24);border:1px solid var(--oof-line,#2b3040);");
    const top = DOM.el("div", "display:flex;align-items:center;gap:8px;");
    const mid = DOM.el("div", "flex:1;min-width:0;");
    mid.append(DOM.el("div", "font-weight:700;", `${title}  ${max != null ? `(Lv ${level}/${max})` : (level ? "✓ owned" : "")}`));
    mid.append(DOM.el("div", "font-size:var(--oof-size-sm,13px);color:var(--oof-text-dim,#8a93a6);", desc));
    top.append(mid);
    const maxed = max != null ? level >= max : !!level;
    const afford = save.coins >= cost;
    top.append(DOM.btn(maxed ? "MAX" : `${fmt(cost)} 🪙`, () => {
      if (maxed || save.coins < cost) return;
      save.coins -= cost; apply(); saveNow(ctx); ctx.engine.audio.playSfx("buy"); repaint(); emitState(ctx);
    }, maxed || !afford));
    wrap.append(top);
    where.append(wrap);
  }

  function repaint() {
    coinLine.textContent = `🪙 ${fmt(save.coins)} Coins`;
    // ---- treadmill tier ----
    treadWrap.textContent = "";
    const idx = treadmillIndex(save.treadmill);
    const cur = TREADMILLS[idx];
    const next = TREADMILLS[idx + 1] || null;
    const card = DOM.el("div", "padding:10px;border-radius:10px;background:var(--oof-bg-2,#171a24);border:1px solid var(--oof-accent,#ff7a1a);");
    card.append(DOM.el("div", "font-weight:800;", `Treadmill: ${cur.name}  (${idx + 1}/${TREADMILLS.length})`));
    card.append(DOM.el("div", "font-size:var(--oof-size-sm,13px);color:var(--oof-text-dim,#8a93a6);margin-bottom:6px;",
      `Trains ×${cur.gain.toFixed(cur.gain < 10 ? 1 : 0)} Speed. ${next ? "" : "This is the ultimate treadmill."}`));
    if (next) {
      const row = DOM.el("div", "display:flex;align-items:center;gap:8px;");
      row.append(DOM.el("div", "flex:1;min-width:0;",));
      const mid = DOM.el("div", "flex:1;min-width:0;");
      mid.append(DOM.el("div", "font-weight:700;", `Next: ${next.name}`));
      mid.append(DOM.el("div", "font-size:var(--oof-size-sm,13px);color:var(--oof-text-dim,#8a93a6);", `Trains ×${next.gain.toFixed(next.gain < 10 ? 1 : 0)} Speed`));
      row.append(mid);
      const afford = save.coins >= next.cost;
      row.append(DOM.btn(`${fmt(next.cost)} 🪙`, () => {
        if (save.coins < next.cost) return;
        save.coins -= next.cost; save.treadmill = next.id;
        recolorTreadmill(ctx); saveNow(ctx); ctx.engine.audio.playSfx("purchase");
        ctx.services.ui.toast(`New treadmill: ${next.name}!`, { icon: "🏃", duration: 4 });
        repaint(); emitState(ctx);
      }, !afford));
      card.append(row);
    }
    treadWrap.append(card);
    // ---- motor / shoes / auto ----
    upgWrap.textContent = "";
    upgRow(upgWrap, "Motor", `Train faster (+6/level). Now ${gainPerSec(save.motor)}/sec before the treadmill's ×${treadmillById(save.treadmill).gain}.`,
      save.motor, MOTOR_MAX, motorCost(save.motor), () => { save.motor++; });
    upgRow(upgWrap, "Running Shoes", `Turn Speed into pace — beat faster Keepers. Level ${save.shoes}.`,
      save.shoes, SHOES_MAX, shoesCost(save.shoes), () => { save.shoes++; });
    upgRow(upgWrap, "Auto-Run", "The treadmill runs on its own — no holding needed.",
      save.auto ? 1 : 0, null, AUTO_RUN_COST, () => { save.auto = true; });
  }
  repaint();
}

// ---------------------------------------------------------------------------------

function hud(ctx) {
  const ui = ctx.services.ui;
  ui.setHudStat("spSpeed", { icon: "🏃", label: "Speed", value: fmt(save.speed) });
  ui.setHudStat("spCoins", { icon: "🪙", label: "Coins", value: fmt(save.coins) });
  ui.setHudStat("spTier", { icon: "🏭", label: "Treadmill", value: treadmillById(save.treadmill).name.replace(" Treadmill", "") });
  const reached = save.reached.filter(Boolean).length;
  ui.setHudStat("spZones", { icon: "🏁", label: "Zones", value: `${reached}/${ZONES.length}` });
  if (onTreadmill) ui.setHudStat("spTread", { icon: "⚡", label: "Treadmill", value: save.auto ? "auto-running" : "hold E to run" });
  else ui.removeHudStat("spTread");
}

function emitState(ctx) {
  try {
    const e = eff();
    ctx.events.emit("sp:state", {
      speed: save.speed, coins: save.coins, motor: save.motor, shoes: save.shoes, auto: save.auto,
      treadmill: save.treadmill, buffs: save.buffs.slice(), equipped: save.equipped.slice(),
      reached: save.reached.slice(), armed: [...armed], cooldown: cooldown.slice(),
      walk: walkForBuffed(save.speed, save.shoes, e.pace), onTreadmill, chased: isChased(),
      eff: e,
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

  world = buildWorld(save.treadmill);
  const parts = ctx.engine.parts;
  for (const def of world.parts) {
    try { parts.create(def); live.set(def.id, def.id); } catch { /* one bad part is not a dead Place */ }
  }
  recolorTreadmill(ctx);

  keeperPos = world.zones.map((_, i) => keeperHome(i));
  cooldown = world.zones.map(() => 0);
  for (let i = 0; i < world.zones.length; i++) placeKeeper(ctx, i);

  for (let i = 0; i < ZONES.length; i++) {
    subs.push(ctx.events.on("touch:sp_zone" + i, () => {
      if (cooldown[i] > 0) return;
      if (!armed.has(i)) { armed.add(i); ctx.engine.audio.playSfx("whoosh"); }
    }));
    subs.push(ctx.events.on("touch:sp_crate" + i, () => crackCrate(ctx, i)));
  }
  subs.push(ctx.events.on("touch:sp_upgrade", () => openShop(ctx)));

  buffBar = buildBuffBar();
  refreshBuffBar();
  openInventory = () => openInventoryPanel(ctx);

  try { ctx.player.setWalkSpeed(walkForBuffed(save.speed, save.shoes, eff().pace)); } catch { /* fine */ }

  hud(ctx);
  emitState(ctx);
  if (!welcomed) {
    welcomed = true;
    ctx.services.ui.toast("Hold E on the treadmill to build Speed, then out-run the Keepers to their crates. Crates drop buffs — equip 3 from the bar below!", { icon: "🏃", duration: 8 });
  }
}

export function update(dt, ctx) {
  if (!world) return;
  runT += dt;
  const p = ctx.player.position();
  const e = eff();

  const onBelt = Math.abs(p[0] - TREAD.cx) <= TREAD.w / 2 + 0.5
    && Math.abs(p[2] - TREAD.cz) <= TREAD.d / 2 + 0.5 && p[1] <= FLOOR_TOP + 4;
  onTreadmill = onBelt;
  if (onBelt) {
    const running = save.auto || (ctx.engine.input && ctx.engine.input.isDown && ctx.engine.input.isDown("action1"));
    if (running) {
      save.speed += trainRate() * dt;
      try { ctx.player.setWalkSpeed(walkForBuffed(save.speed, save.shoes, e.pace)); } catch { /* fine */ }
    }
  }

  for (let i = 0; i < world.zones.length; i++) {
    if (cooldown[i] > 0) cooldown[i] = Math.max(0, cooldown[i] - dt);
    const z = world.zones[i];
    const home = keeperHome(i);
    if (armed.has(i)) {
      const kx = keeperPos[i][0], kz = keeperPos[i][1];
      const dx = p[0] - kx, dz = p[2] - kz;
      const d = Math.hypot(dx, dz) || 1;
      const step = ZONES[i].keeper * (1 - e.keeperSlow) * dt; // buffs slow the Keeper
      keeperPos[i] = [kx + (dx / d) * step, kz + (dz / d) * step];
      placeKeeper(ctx, i);
      if (d <= TAG_R && p[0] < z.pedestalX - 3) {
        armed.delete(i);
        resetKeeper(ctx, i);
        try { ctx.player.teleport([z.entranceX - 4, FLOOR_TOP + 1.1, 0], 90); } catch { /* fine */ }
        ctx.engine.audio.playSfx("denied");
        ctx.services.ui.toast(`${ZONES[i].name} Keeper caught you! Train more Speed and try again.`, { icon: ZONES[i].icon, duration: 4 });
        emitState(ctx);
      } else if (p[0] < z.entranceX - 6) {
        armed.delete(i);
        resetKeeper(ctx, i);
      }
    } else {
      const kx = keeperPos[i][0], kz = keeperPos[i][1];
      const dx = home[0] - kx, dz = home[1] - kz;
      const d = Math.hypot(dx, dz);
      if (d > 0.5) {
        const stp = Math.min(d, KEEPER_RETURN * dt);
        keeperPos[i] = [kx + (dx / d) * stp, kz + (dz / d) * stp];
        placeKeeper(ctx, i);
      }
    }
  }

  if (runT - hudAt >= HUD_EVERY_S) { hudAt = runT; hud(ctx); emitState(ctx); saveNow(ctx); }
}

export function dispose(ctx) {
  for (const off of subs) { try { off(); } catch { /* already gone */ } }
  subs = [];
  if (buffBar && buffBar.parentNode) buffBar.parentNode.removeChild(buffBar);
  buffBar = null;
  openInventory = null;
  if (ctx && ctx.services && ctx.services.ui) {
    for (const k of ["spSpeed", "spCoins", "spTier", "spZones", "spTread"]) ctx.services.ui.removeHudStat(k);
  }
  try { ctx.player.setWalkSpeed(16); } catch { /* fine */ }
  world = null; live = new Map(); save = null; armed = new Set(); keeperPos = []; cooldown = [];
}
