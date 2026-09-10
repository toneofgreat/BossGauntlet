// src/games/speed/game.js — Speed Simulator. Spec 24 owns this Place.
//
// The loop (redesigned 2026-09-12, spec 24 §11): train Speed on the auto-running
// treadmill in the SAFE ZONE, then run out into one continuous danger field and STEAL a
// crate. The moment you grab it, every Keeper between you and safety wakes and chases —
// you must carry it back across the safe line before they catch you. Make it and the
// crate is yours (Coins, cosmetics, buffs, and rarely an active ability). Get caught and
// you drop it. Keepers never cross into the safe zone.
//
// Buffs are passive multipliers (equip 3). Abilities are active powers on cooldowns
// (equip 1, fire with the ⚡ button): freeze the Keepers, blink to safety, drop a decoy,
// or jinx nearby players. The Keepers are hazards, not players (ARCHITECTURE §9).

import {
  ZONES, walkForBuffed, gainPerSec, fmt,
  motorCost, shoesCost, MOTOR_MAX, SHOES_MAX, CRATE_COOLDOWN_S,
  TREADMILLS, treadmillById, treadmillIndex,
  BUFFS, buffById, BUFF_RARITY, MAX_EQUIPPED, rollBuff, combinedEffect,
  ABILITIES, abilityById, rollAbility,
} from "./scripts/config.js";
import { buildWorld, FLOOR_TOP, TREAD } from "./scripts/layout.js";
import { tableFor, weightTotal, oddsText, rollCrate, RARITY } from "./scripts/crates.js";

export const meta = {
  slug: "speed",
  name: "Speed Simulator",
  icon: "🏃",
  description: "Train, steal a crate, and out-run the Keepers back to safety. Buffs, abilities, 17 treadmills.",
  version: "3.0.0",
};

const SAVE_VERSION = 3;
const HUD_EVERY_S = 0.2;
const TAG_R = 3.4;
const KEEPER_RETURN = 26;

let world = null;
let safeX = 26;
let live = new Map();
let subs = [];
let save = null;
let carrying = null;          // zone index of the crate you are carrying, or null
let chasing = new Set();      // keeper indices currently pursuing you
let keeperPos = [];
let keeperStunUntil = [];     // per-keeper: sim time it is stunned until
let keeperFreezeUntil = 0;    // all chasing keepers frozen until this sim time
let decoy = null;             // { x, z, until } while a Hologram Decoy is out
let carryIds = [];            // the floating crate parts that ride you
let cooldown = [];            // per-crate: seconds until it can be stolen again
let abilityReady = {};        // ability id -> sim time it is off cooldown
let jinxedUntil = 0;          // you are stunned by another player's Jinx until this time
let onTreadmill = false;
let lastMusic = "clash";  // Place music switches to chill out in the Void/Flash end-game
let runT = 0;
let hudAt = 0;
let panelOpen = false;
let welcomed = false;
let buffBar = null;
let openInventory = null;
let actionButtons = null;
let abilityBtn = null;        // the fixed ⚡ activate button

// ---------------------------------------------------------------------------------

function defaultSave() {
  return {
    schemaVersion: SAVE_VERSION,
    speed: 0, coins: 0, motor: 0, shoes: 0,
    treadmill: "rusty", reached: ZONES.map(() => false),
    buffs: [], equipped: [], abilities: [], ability: null,
  };
}

function loadSave(ctx) {
  let s = null;
  try { s = ctx.services.saves.load(); } catch { s = null; }
  const d = defaultSave();
  if (s && typeof s === "object" && s.schemaVersion >= 1 && s.schemaVersion <= SAVE_VERSION) {
    d.speed = Number.isFinite(s.speed) && s.speed > 0 ? s.speed : 0;
    d.coins = Number.isFinite(s.coins) && s.coins > 0 ? s.coins : 0;
    d.motor = Number.isInteger(s.motor) ? Math.max(0, Math.min(MOTOR_MAX, s.motor)) : 0;
    d.shoes = Number.isInteger(s.shoes) ? Math.max(0, Math.min(SHOES_MAX, s.shoes)) : 0;
    if (Array.isArray(s.reached)) d.reached = ZONES.map((_, i) => !!s.reached[i]);
    if (typeof s.treadmill === "string" && treadmillById(s.treadmill).id === s.treadmill) d.treadmill = s.treadmill;
    if (Array.isArray(s.buffs)) d.buffs = s.buffs.filter((id) => buffById(id));
    if (Array.isArray(s.equipped)) d.equipped = s.equipped.filter((id) => buffById(id) && d.buffs.includes(id)).slice(0, MAX_EQUIPPED);
    if (Array.isArray(s.abilities)) d.abilities = s.abilities.filter((id) => abilityById(id));
    if (typeof s.ability === "string" && d.abilities.includes(s.ability)) d.ability = s.ability;
  }
  save = d;
}

function saveNow(ctx) {
  try { ctx.services.saves.save(save); } catch { /* a full quota is not worth a lost run */ }
}

function eff() { return combinedEffect(save.equipped); }
function trainRate() { return gainPerSec(save.motor) * treadmillById(save.treadmill).gain * eff().train; }
function isChased() { return chasing.size > 0; }

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
  badge(thing, size) {
    const s = size || 44;
    const wrap = DOM.el("div", `position:relative;width:${s}px;height:${s}px;flex:none;`);
    const tint = thing.rarity ? BUFF_RARITY[thing.rarity].tint : "#f5c948";
    const ring = DOM.el("div", `position:absolute;inset:0;border-radius:12px;background:`
      + `radial-gradient(circle at 50% 35%, ${thing.look[1]}, ${thing.look[0]});`
      + `box-shadow:0 0 10px ${thing.look[1]}, inset 0 0 6px rgba(255,255,255,.35);`
      + `border:2px solid ${tint};`);
    const glyph = DOM.el("div", `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;`
      + `font-size:${Math.round(s * 0.5)}px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.5));`, thing.icon);
    wrap.append(ring, glyph);
    return wrap;
  },
};

// ---- buff bar (equipped passives) -------------------------------------------------

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
    if (bf) buffBar.appendChild(DOM.badge(bf, 42));
    else buffBar.appendChild(DOM.el("div", "width:42px;height:42px;border-radius:12px;flex:none;"
      + "border:2px dashed rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;"
      + "color:rgba(255,255,255,.3);font-size:20px;", "＋"));
  }
}

// ---- the ⚡ ability button (bottom-right) ------------------------------------------

function buildAbilityButton(ctx) {
  const b = document.createElement("button");
  b.setAttribute("style", "position:fixed;right:14px;bottom:40px;z-index:40;width:64px;height:64px;"
    + "border-radius:16px;border:2px solid rgba(255,255,255,.18);cursor:pointer;pointer-events:auto;"
    + "font-size:30px;background:rgba(14,16,24,.8);color:#f2f4fa;box-shadow:0 2px 8px rgba(0,0,0,.4);");
  b.addEventListener("click", () => activateAbility(ctx));
  document.body.appendChild(b);
  abilityBtn = b;
  refreshAbilityButton();
}
function refreshAbilityButton() {
  if (!abilityBtn) return;
  const ab = save.ability ? abilityById(save.ability) : null;
  if (!ab) {
    abilityBtn.textContent = "⚡";
    abilityBtn.title = "No ability equipped — find one in a crate, then equip it in the inventory";
    abilityBtn.style.opacity = "0.45";
    return;
  }
  const readyAt = abilityReady[ab.id] || 0;
  const cd = Math.max(0, readyAt - runT);
  abilityBtn.title = ab.name + " — " + (cd > 0 ? Math.ceil(cd) + "s" : "ready (tap)");
  if (cd > 0) {
    abilityBtn.textContent = Math.ceil(cd) + "";
    abilityBtn.style.fontSize = "18px";
    abilityBtn.style.opacity = "0.6";
    abilityBtn.style.background = "rgba(14,16,24,.8)";
  } else {
    abilityBtn.textContent = ab.icon;
    abilityBtn.style.fontSize = "30px";
    abilityBtn.style.opacity = "1";
    abilityBtn.style.background = "radial-gradient(circle at 50% 35%, " + ab.look[1] + ", rgba(14,16,24,.85))";
  }
}

// ---- on-screen shop / upgrade buttons (mobile) ------------------------------------

function nextTreadmill() { return TREADMILLS[treadmillIndex(save.treadmill) + 1] || null; }
function buyNextTreadmill(ctx) {
  const next = nextTreadmill();
  if (!next || save.coins < next.cost) { ctx.engine.audio.playSfx("denied"); return false; }
  save.coins -= next.cost; save.treadmill = next.id;
  recolorTreadmill(ctx); saveNow(ctx); ctx.engine.audio.playSfx("purchase");
  ctx.services.ui.toast(`New treadmill: ${next.name}!`, { icon: "🏃", duration: 4 });
  refreshActionButtons(); emitState(ctx);
  return true;
}
function bigBtn(label, onTap) {
  const b = document.createElement("button");
  b.setAttribute("style", "min-height:44px;padding:10px 14px;border-radius:12px;border:none;cursor:pointer;"
    + "font:inherit;font-weight:800;font-size:14px;white-space:nowrap;pointer-events:auto;"
    + "background:rgba(14,16,24,.78);color:#f2f4fa;border:1px solid rgba(255,255,255,.14);"
    + "box-shadow:0 2px 8px rgba(0,0,0,.35);backdrop-filter:blur(4px);");
  b.textContent = label;
  b.addEventListener("click", onTap);
  return b;
}
function buildActionButtons(ctx) {
  const wrap = document.createElement("div");
  wrap.setAttribute("style", "position:fixed;left:12px;bottom:40px;z-index:40;display:flex;flex-direction:column;gap:8px;pointer-events:none;");
  const shopBtn = bigBtn("🛠 Upgrades", () => openShop(ctx));
  const treadBtn = bigBtn("⬆ Treadmill", () => buyNextTreadmill(ctx));
  wrap.append(shopBtn, treadBtn);
  document.body.appendChild(wrap);
  actionButtons = { wrap, treadBtn };
  refreshActionButtons();
}
function refreshActionButtons() {
  if (!actionButtons) return;
  const b = actionButtons.treadBtn;
  const next = nextTreadmill();
  if (!next) { b.textContent = "⬆ Treadmill: MAXED ⚡"; b.style.opacity = "0.6"; b.disabled = true; return; }
  const afford = save.coins >= next.cost;
  b.disabled = false;
  b.textContent = `⬆ ${next.name.replace(" Treadmill", "")} — ${fmt(next.cost)} 🪙`;
  b.style.opacity = afford ? "1" : "0.65";
  b.style.background = afford ? "rgba(34,120,60,.85)" : "rgba(14,16,24,.78)";
}

// ---- inventory (buffs + abilities) ------------------------------------------------

function openInventoryPanel(ctx) {
  if (panelOpen) return;
  const panel = ctx.services.ui.openPanel({ title: "🎒 Buffs & Abilities", onClose: () => { panelOpen = false; } });
  panelOpen = true;
  const body = panel.bodyEl;
  if (!body) { panelOpen = false; return; }

  const status = DOM.el("div", "text-align:center;font-weight:800;margin-bottom:4px;");
  const note = DOM.el("div", "text-align:center;color:var(--oof-text-dim,#8a93a6);font-size:var(--oof-size-sm,13px);margin-bottom:10px;");
  const list = DOM.el("div", "");
  body.append(status, note, list);

  function repaint() {
    status.textContent = `Buffs ${save.equipped.length}/${MAX_EQUIPPED} · Ability ${save.ability ? "1/1" : "0/1"}`;
    note.textContent = isChased()
      ? "⚠ A Keeper is chasing you — you can't change gear right now."
      : "Equip up to three buffs (passive) and one ability (tap ⚡ to use).";
    list.textContent = "";
    const canChange = !isChased();

    // abilities section
    if (save.abilities.length) {
      list.append(DOM.el("div", "font-weight:800;margin:6px 0 4px;", "⚡ Abilities"));
      for (const id of save.abilities) {
        const ab = abilityById(id); if (!ab) continue;
        const equipped = save.ability === id;
        const row = DOM.el("div", "display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;margin-bottom:6px;"
          + "background:var(--oof-bg-2,#171a24);border:1px solid " + (equipped ? "#f5c948" : "var(--oof-line,#2b3040)") + ";");
        row.append(DOM.badge(ab, 40));
        const mid = DOM.el("div", "flex:1;min-width:0;");
        mid.append(DOM.el("div", "font-weight:700;", ab.name));
        mid.append(DOM.el("div", "font-size:var(--oof-size-sm,13px);color:var(--oof-text-dim,#8a93a6);", ab.blurb));
        row.append(mid);
        row.append(DOM.btn(equipped ? "Unequip" : "Equip", () => {
          if (isChased()) return;
          save.ability = equipped ? null : id;
          saveNow(ctx); refreshAbilityButton(); repaint(); emitState(ctx); ctx.engine.audio.playSfx("click");
        }, !canChange));
        list.append(row);
      }
    }

    // buffs section
    list.append(DOM.el("div", "font-weight:800;margin:10px 0 4px;", "✨ Buffs"));
    if (!save.buffs.length) {
      list.append(DOM.el("div", "color:var(--oof-text-dim,#8a93a6);padding:8px;",
        "No buffs yet. Steal crates and bring them home — 3 in 10 give a buff, and rarer ones are something else."));
    } else {
      const order = { godly: 0, rare: 1, common: 2 };
      const owned = save.buffs.map(buffById).filter(Boolean).sort((a, b) => order[a.rarity] - order[b.rarity]);
      for (const bf of owned) {
        const equipped = save.equipped.includes(bf.id);
        const full = save.equipped.length >= MAX_EQUIPPED;
        const row = DOM.el("div", "display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;margin-bottom:6px;"
          + "background:var(--oof-bg-2,#171a24);border:1px solid " + (equipped ? BUFF_RARITY[bf.rarity].tint : "var(--oof-line,#2b3040)") + ";");
        row.append(DOM.badge(bf, 40));
        const mid = DOM.el("div", "flex:1;min-width:0;");
        mid.append(DOM.el("div", "font-weight:700;", bf.name));
        mid.append(DOM.el("div", "font-size:var(--oof-size-sm,13px);color:" + BUFF_RARITY[bf.rarity].tint + ";", BUFF_RARITY[bf.rarity].label));
        mid.append(DOM.el("div", "font-size:var(--oof-size-sm,13px);color:var(--oof-text-dim,#8a93a6);", bf.blurb));
        row.append(mid);
        row.append(DOM.btn(equipped ? "Unequip" : (full ? "3 equipped" : "Equip"), () => {
          if (isChased()) return;
          if (equipped) save.equipped = save.equipped.filter((x) => x !== bf.id);
          else if (save.equipped.length < MAX_EQUIPPED) save.equipped.push(bf.id);
          saveNow(ctx); refreshBuffBar(); repaint(); emitState(ctx); ctx.engine.audio.playSfx("click");
        }, !canChange || (!equipped && full)));
        list.append(row);
      }
    }
  }
  repaint();
}

// ---- keepers ----------------------------------------------------------------------

function keeperHome(i) { return [world.zones[i].keeperHomeX, 0]; }
function placeKeeper(ctx, i) {
  const z = world.zones[i];
  const [kx, kz] = keeperPos[i];
  for (const k of z.keeper) {
    try { ctx.engine.parts.setPosition(k.id, [kx + k.off[0], FLOOR_TOP + k.off[1], kz + k.off[2]]); } catch { /* gone */ }
  }
}
function resetKeeper(ctx, i) { keeperPos[i] = keeperHome(i); placeKeeper(ctx, i); }

// ---- steal / carry / deliver / drop ----------------------------------------------

function startCarry(ctx, i) {
  if (carrying !== null || cooldown[i] > 0 || panelOpen) return;
  carrying = i;
  // wake this crate's Keeper and every Keeper between it and safety (indices <= i),
  // with a short grab grace so you always get a moment to turn and run.
  chasing = new Set();
  for (let k = 0; k <= i; k++) { chasing.add(k); keeperStunUntil[k] = runT + 0.6; }
  // the crate now rides above your head
  spawnCarryCrate(ctx);
  ctx.engine.audio.playSfx("whoosh");
  ctx.services.ui.toast(`You grabbed the ${ZONES[i].name} crate! RUN back to the safe zone!`, { icon: "🏃", duration: 5 });
  emitState(ctx);
}

function spawnCarryCrate(ctx) {
  removeCarryCrate(ctx);
  try {
    carryIds.push(ctx.engine.parts.create({ size: [2.2, 2.2, 2.2], position: [0, -50, 0], color: "#8c5a3c", material: "wood", canCollide: false }));
    carryIds.push(ctx.engine.parts.create({ size: [2.4, 0.4, 2.4], position: [0, -50, 0], color: "#f5c948", material: "neon", canCollide: false }));
  } catch { /* fine */ }
}
function removeCarryCrate(ctx) {
  for (const id of carryIds) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
  carryIds = [];
}
function placeCarryCrate(ctx, p) {
  if (!carryIds.length) return;
  try { ctx.engine.parts.setPosition(carryIds[0], [p[0], p[1] + 6.4, p[2]]); } catch { /* gone */ }
  if (carryIds[1]) { try { ctx.engine.parts.setPosition(carryIds[1], [p[0], p[1] + 7.6, p[2]]); } catch { /* gone */ } }
}

function deliverCrate(ctx, i) {
  const zone = ZONES[i];
  const e = eff();
  const row = rollCrate(zone.key);
  let gotText;
  if (row.kind === "coins") {
    const amt = Math.floor(row.amount * e.coin);
    save.coins += amt; gotText = `${fmt(amt)} Coins`;
  } else {
    const had = ctx.services.avatar.owns(row.id);
    ctx.services.avatar.grantItem(row.id, "speed");
    if (had) { const bonus = Math.floor(500 * e.coin); save.coins += bonus; gotText = `${row.note} (owned) → ${fmt(bonus)} Coins`; }
    else gotText = row.note;
  }
  // buff roll (30/5/0.5%) and the rare special-ability roll (1%)
  let buffDrop = null, abilityDrop = null;
  const bf = rollBuff(e.luck);
  if (bf) {
    if (save.buffs.includes(bf.id)) { const dup = Math.floor(300 * e.coin); save.coins += dup; buffDrop = { bf, dup }; }
    else { save.buffs.push(bf.id); buffDrop = { bf, dup: 0 }; }
  }
  const ab = rollAbility(e.luck);
  if (ab) {
    if (save.abilities.includes(ab.id)) { const dup = Math.floor(1000 * e.coin); save.coins += dup; abilityDrop = { ab, dup }; }
    else { save.abilities.push(ab.id); if (!save.ability) save.ability = ab.id; abilityDrop = { ab, dup: 0 }; }
  }
  if (!save.reached[i]) {
    save.reached[i] = true;
    ctx.services.economy.award(zone.firstReachOofbux, "speed:" + zone.key);
    ctx.services.badges.award("zone" + (i + 1));
    if (ZONES.every((_, z) => save.reached[z])) ctx.services.badges.award("all");
  }
  cooldown[i] = CRATE_COOLDOWN_S;
  carrying = null; chasing.clear(); removeCarryCrate(ctx);
  for (let k = 0; k < world.zones.length; k++) resetKeeper(ctx, k);
  saveNow(ctx);
  ctx.engine.audio.playSfx(abilityDrop && !abilityDrop.dup ? "sparkle" : "fanfare");
  refreshAbilityButton();
  openCratePanel(ctx, i, row, gotText, buffDrop, abilityDrop);
  emitState(ctx);
}

function dropCrate(ctx) {
  if (carrying === null) return;
  const i = carrying;
  carrying = null; chasing.clear(); removeCarryCrate(ctx);
  for (let k = 0; k < world.zones.length; k++) resetKeeper(ctx, k);
  ctx.engine.audio.playSfx("denied");
  ctx.services.ui.toast(`The Keepers caught you — you dropped the ${ZONES[i].name} crate!`, { icon: "😈", duration: 4 });
  emitState(ctx);
}

function openCratePanel(ctx, i, wonRow, gotText, buffDrop, abilityDrop) {
  const zone = ZONES[i];
  const panel = ctx.services.ui.openPanel({ title: `${zone.icon} ${zone.name} Crate — delivered!`, onClose: () => { panelOpen = false; } });
  panelOpen = true;
  const body = panel.bodyEl;
  if (!body) { panelOpen = false; return; }
  body.append(DOM.el("div", "text-align:center;font-size:var(--oof-size-lg,20px);font-weight:800;margin-bottom:4px;", `You got: ${gotText}`));
  const banner = (thing, tint, label, sub) => {
    const b = DOM.el("div", "display:flex;align-items:center;gap:10px;justify-content:center;margin:8px 0;padding:8px;border-radius:10px;"
      + "background:rgba(255,255,255,.05);border:1px solid " + tint + ";");
    b.append(DOM.badge(thing, 40));
    const t = DOM.el("div", "");
    t.append(DOM.el("div", "font-weight:800;color:" + tint + ";", label));
    t.append(DOM.el("div", "font-size:var(--oof-size-sm,13px);color:var(--oof-text-dim,#8a93a6);", sub));
    b.append(t);
    body.append(b);
  };
  if (abilityDrop) banner(abilityDrop.ab, "#f5c948",
    `⚡ SPECIAL ABILITY: ${abilityDrop.ab.name}`,
    abilityDrop.dup ? `Already owned → +${fmt(abilityDrop.dup)} Coins` : abilityDrop.ab.blurb + " — equipped!");
  if (buffDrop) banner(buffDrop.bf, BUFF_RARITY[buffDrop.bf.rarity].tint,
    `${BUFF_RARITY[buffDrop.bf.rarity].label} BUFF: ${buffDrop.bf.name}`,
    buffDrop.dup ? `Already owned → +${fmt(buffDrop.dup)} Coins` : buffDrop.bf.blurb + " — in your inventory!");
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

// ---- abilities --------------------------------------------------------------------

function activateAbility(ctx) {
  const id = save.ability;
  const ab = id ? abilityById(id) : null;
  if (!ab) { ctx.services.ui.toast("Equip an ability first — find one in a crate.", { icon: "⚡", duration: 3 }); return; }
  if ((abilityReady[ab.id] || 0) > runT) { ctx.engine.audio.playSfx("denied"); return; }
  abilityReady[ab.id] = runT + ab.cooldownS;
  const p = ctx.player.position();
  if (ab.kind === "freeze") {
    keeperFreezeUntil = runT + ab.durS;
    ctx.services.ui.toast("Boss Freeze! Every Keeper is frozen solid.", { icon: "❄️", duration: 3 });
  } else if (ab.kind === "shock") {
    for (let i = 0; i < world.zones.length; i++) {
      if (Math.hypot(p[0] - keeperPos[i][0], p[2] - keeperPos[i][1]) <= ab.radius) keeperStunUntil[i] = runT + ab.durS;
    }
    ctx.services.ui.toast("Shockwave! Nearby Keepers stunned.", { icon: "⚡", duration: 3 });
  } else if (ab.kind === "blink") {
    try { ctx.player.teleport([Math.max(safeX - 2, p[0] - ab.dist), p[1], p[2]], 90); } catch { /* fine */ }
    ctx.services.ui.toast("Blink!", { icon: "💨", duration: 2 });
  } else if (ab.kind === "decoy") {
    decoy = { x: p[0], z: p[2], until: runT + ab.durS };
    ctx.services.ui.toast("Decoy dropped — the Keepers chase it!", { icon: "🪞", duration: 3 });
  } else if (ab.kind === "jinx") {
    // broadcast to nearby players over the presence STATE channel (no new net message
    // type — publish/state is already forwarded). Others honour it if they are close.
    try {
      const net = ctx.services.net;
      if (net && typeof net.publish === "function") net.publish({ jinx: { t: runT, x: p[0], z: p[2], r: ab.radius, d: ab.durS } });
    } catch { /* offline: no one to jinx */ }
    for (let i = 0; i < world.zones.length; i++) {
      if (Math.hypot(p[0] - keeperPos[i][0], p[2] - keeperPos[i][1]) <= ab.radius) keeperStunUntil[i] = runT + ab.durS;
    }
    ctx.services.ui.toast("Jinx! Nearby players stunned.", { icon: "😵", duration: 3 });
  }
  ctx.engine.audio.playSfx("sparkle");
  refreshAbilityButton();
  emitState(ctx);
}

// another player's Jinx: freeze our own movement briefly if we are close to its source.
function readIncomingJinx(ctx, p) {
  try {
    const net = ctx.services.net;
    if (!net || typeof net.roster !== "function") return;
    for (const peer of net.roster()) {
      const j = peer && peer.state && peer.state.jinx;
      if (!j) continue;
      // fresh (published within ~0.4 s of its stamp reaching us) and near us
      if (Math.hypot(p[0] - j.x, p[2] - j.z) <= (j.r || 16)) {
        // we cannot trust the peer's clock, so honour it once per distinct stamp
        if (!readIncomingJinx._seen) readIncomingJinx._seen = new Set();
        const key = peer.id + ":" + j.t;
        if (!readIncomingJinx._seen.has(key)) {
          readIncomingJinx._seen.add(key);
          jinxedUntil = runT + (j.d || 2);
          ctx.services.ui.toast("You were Jinxed! Frozen for a moment.", { icon: "😵", duration: 3 });
        }
      }
    }
  } catch { /* presence hiccup */ }
}

// ---------------------------------------------------------------------------------

function recolorTreadmill(ctx) {
  const tm = treadmillById(save.treadmill);
  const t = world.tread;
  if (!t) return;
  const set = (id, color) => { try { ctx.engine.parts.setColor(id, color); } catch { /* gone */ } };
  for (const id of t.beltIds) set(id, tm.belt);
  for (const id of t.stripeIds) set(id, tm.stripe);
  for (const id of t.glowIds) { set(id, tm.glow || tm.stripe); try { ctx.engine.parts.setEmissiveIntensity(id, tm.glow ? 1.6 : 0.6); } catch { /* gone */ } }
}

function openShop(ctx) {
  if (panelOpen) return;
  const panel = ctx.services.ui.openPanel({ title: "🛠 Treadmill & Upgrades", onClose: () => { panelOpen = false; } });
  panelOpen = true;
  const body = panel.bodyEl;
  if (!body) { panelOpen = false; return; }
  const coinLine = DOM.el("div", "text-align:center;font-weight:800;margin-bottom:12px;font-size:var(--oof-size-lg,20px);");
  const treadWrap = DOM.el("div", "margin-bottom:12px;");
  const upgWrap = DOM.el("div", "");
  body.append(coinLine, treadWrap, upgWrap);

  function upgRow(where, title, desc, level, max, cost, apply) {
    const wrap = DOM.el("div", "padding:10px;border-radius:8px;margin-bottom:8px;background:var(--oof-bg-2,#171a24);border:1px solid var(--oof-line,#2b3040);");
    const top = DOM.el("div", "display:flex;align-items:center;gap:8px;");
    const mid = DOM.el("div", "flex:1;min-width:0;");
    mid.append(DOM.el("div", "font-weight:700;", `${title}  (Lv ${level}/${max})`));
    mid.append(DOM.el("div", "font-size:var(--oof-size-sm,13px);color:var(--oof-text-dim,#8a93a6);", desc));
    top.append(mid);
    const maxed = level >= max;
    const afford = save.coins >= cost;
    top.append(DOM.btn(maxed ? "MAX" : `${fmt(cost)} 🪙`, () => {
      if (maxed || save.coins < cost) return;
      save.coins -= cost; apply(); saveNow(ctx); ctx.engine.audio.playSfx("buy"); repaint(); emitState(ctx);
    }, maxed || !afford));
    wrap.append(top); where.append(wrap);
  }
  function repaint() {
    coinLine.textContent = `🪙 ${fmt(save.coins)} Coins`;
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
      const mid = DOM.el("div", "flex:1;min-width:0;");
      mid.append(DOM.el("div", "font-weight:700;", `Next: ${next.name}`));
      mid.append(DOM.el("div", "font-size:var(--oof-size-sm,13px);color:var(--oof-text-dim,#8a93a6);", `Trains ×${next.gain.toFixed(next.gain < 10 ? 1 : 0)} Speed`));
      row.append(mid);
      row.append(DOM.btn(`${fmt(next.cost)} 🪙`, () => { if (buyNextTreadmill(ctx)) repaint(); }, save.coins < next.cost));
      card.append(row);
    }
    treadWrap.append(card);
    upgWrap.textContent = "";
    upgRow(upgWrap, "Motor", `Train faster (+6/level). Now ${gainPerSec(save.motor)}/sec before the treadmill's ×${treadmillById(save.treadmill).gain}.`,
      save.motor, MOTOR_MAX, motorCost(save.motor), () => { save.motor++; });
    upgRow(upgWrap, "Running Shoes", `Turn Speed into pace — beat faster Keepers. Level ${save.shoes}.`,
      save.shoes, SHOES_MAX, shoesCost(save.shoes), () => { save.shoes++; });
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
  ui.setHudStat("spZones", { icon: "🏁", label: "Crates", value: `${reached}/${ZONES.length}` });
  if (carrying !== null) ui.setHudStat("spCarry", { icon: "📦", label: "Carrying!", value: "get to the safe zone!" });
  else if (onTreadmill) ui.setHudStat("spCarry", { icon: "⚡", label: "Treadmill", value: "training…" });
  else ui.removeHudStat("spCarry");
}

function emitState(ctx) {
  try {
    const e = eff();
    ctx.events.emit("sp:state", {
      speed: save.speed, coins: save.coins, motor: save.motor, shoes: save.shoes,
      treadmill: save.treadmill, buffs: save.buffs.slice(), equipped: save.equipped.slice(),
      abilities: save.abilities.slice(), ability: save.ability,
      reached: save.reached.slice(), carrying, chasing: [...chasing], cooldown: cooldown.slice(),
      walk: walkForBuffed(save.speed, save.shoes, e.pace), onTreadmill, chased: isChased(), safeX, eff: e,
      abilityReady: { ...abilityReady }, runT,
      keepers: world ? world.zones.map((_, i) => keeperPos[i] ? keeperPos[i].slice() : null) : [],
    });
  } catch { /* an events hiccup must not stop the run */ }
}

// ---------------------------------------------------------------------------------

export function init(ctx) {
  subs = [];
  live = new Map();
  carrying = null; chasing = new Set();
  keeperFreezeUntil = 0; decoy = null; jinxedUntil = 0; carryIds = [];
  abilityReady = {};
  runT = 0; hudAt = 0; onTreadmill = false; panelOpen = false;
  lastMusic = "clash"; // place.json starts on clash; the end-game switches to voidchill
  loadSave(ctx);

  world = buildWorld(save.treadmill);
  safeX = world.safeX;
  const parts = ctx.engine.parts;
  for (const def of world.parts) {
    try { parts.create(def); live.set(def.id, def.id); } catch { /* one bad part is not a dead Place */ }
  }
  recolorTreadmill(ctx);

  keeperPos = world.zones.map((_, i) => keeperHome(i));
  keeperStunUntil = world.zones.map(() => 0);
  cooldown = world.zones.map(() => 0);
  for (let i = 0; i < world.zones.length; i++) placeKeeper(ctx, i);

  for (let i = 0; i < ZONES.length; i++) {
    subs.push(ctx.events.on("touch:sp_crate" + i, () => startCarry(ctx, i)));
  }
  subs.push(ctx.events.on("touch:sp_upgrade", () => openShop(ctx)));

  buffBar = buildBuffBar();
  refreshBuffBar();
  buildActionButtons(ctx);
  buildAbilityButton(ctx);
  openInventory = () => openInventoryPanel(ctx);

  try { ctx.player.setWalkSpeed(walkForBuffed(save.speed, save.shoes, eff().pace)); } catch { /* fine */ }

  hud(ctx);
  emitState(ctx);
  if (!welcomed) {
    welcomed = true;
    ctx.services.ui.toast("Stand on the treadmill to train (it runs for you). Then run out, STEAL a crate, and race it back past the green line before the Keepers catch you!", { icon: "🏃", duration: 9 });
  }
}

export function update(dt, ctx) {
  if (!world) return;
  runT += dt;
  const p = ctx.player.position();
  const e = eff();
  const safe = p[0] < safeX;

  // Out in the Void/Flash end-game the frantic track gives way to a calm, dreamy one.
  // Hysteresis (enter at 300, leave at 270) so it never flickers at the boundary.
  const wantMusic = (lastMusic === "voidchill" ? p[0] >= 270 : p[0] >= 300) ? "voidchill" : "clash";
  if (wantMusic !== lastMusic) {
    try { ctx.engine.audio.playMusic(wantMusic); } catch { /* audio may be muted */ }
    lastMusic = wantMusic;
  }

  // incoming Jinx from another player freezes us
  readIncomingJinx(ctx, p);
  const frozenSelf = jinxedUntil > runT;

  // treadmill auto-run (only when not carrying and not frozen)
  const onBelt = Math.abs(p[0] - TREAD.cx) <= TREAD.w / 2 + 0.5
    && Math.abs(p[2] - TREAD.cz) <= TREAD.d / 2 + 0.5 && p[1] <= FLOOR_TOP + 4;
  onTreadmill = onBelt;
  if (onBelt && !frozenSelf) {
    save.speed += trainRate() * dt;
  }
  try { ctx.player.setWalkSpeed(frozenSelf ? 0 : walkForBuffed(save.speed, save.shoes, e.pace)); } catch { /* fine */ }

  // carrying: follow the crate, deliver on reaching safety
  if (carrying !== null) {
    placeCarryCrate(ctx, p);
    if (safe) { deliverCrate(ctx, carrying); }
  }

  // keepers
  const frozen = keeperFreezeUntil > runT;
  const target = decoy && decoy.until > runT ? [decoy.x, decoy.z] : [p[0], p[2]];
  for (let i = 0; i < world.zones.length; i++) {
    if (cooldown[i] > 0) cooldown[i] = Math.max(0, cooldown[i] - dt);
    const home = keeperHome(i);
    if (chasing.has(i) && carrying !== null) {
      const stunned = frozen || keeperStunUntil[i] > runT;
      if (!stunned) {
        const kx = keeperPos[i][0], kz = keeperPos[i][1];
        const dx = target[0] - kx, dz = target[1] - kz;
        const d = Math.hypot(dx, dz) || 1;
        const step = ZONES[i].keeper * (1 - e.keeperSlow) * dt;
        let nx = kx + (dx / d) * step, nz = kz + (dz / d) * step;
        if (nx < safeX) nx = safeX; // never cross into the safe zone
        keeperPos[i] = [nx, nz];
        placeKeeper(ctx, i);
      }
      // caught?
      if (!safe && Math.hypot(p[0] - keeperPos[i][0], p[2] - keeperPos[i][1]) <= TAG_R) { dropCrate(ctx); break; }
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

  if (runT - hudAt >= HUD_EVERY_S) { hudAt = runT; hud(ctx); refreshActionButtons(); refreshAbilityButton(); emitState(ctx); saveNow(ctx); }
}

export function dispose(ctx) {
  for (const off of subs) { try { off(); } catch { /* already gone */ } }
  subs = [];
  removeCarryCrate(ctx);
  for (const node of [buffBar, actionButtons && actionButtons.wrap, abilityBtn]) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }
  buffBar = null; actionButtons = null; abilityBtn = null; openInventory = null;
  if (ctx && ctx.services && ctx.services.ui) {
    for (const k of ["spSpeed", "spCoins", "spTier", "spZones", "spCarry"]) ctx.services.ui.removeHudStat(k);
  }
  try { ctx.player.setWalkSpeed(16); } catch { /* fine */ }
  world = null; live = new Map(); save = null;
  carrying = null; chasing = new Set(); keeperPos = []; keeperStunUntil = []; cooldown = []; carryIds = [];
}
