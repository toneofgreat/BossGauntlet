// src/games/tycoon/game.js — Boss Tycoon's entry module: load the save, build the
// plot, run spec 10 §5.15's per-step order, hand everything back on dispose.
// Spec 10 §3.1 (save), §5.13 (HUD) and §5.15 (lifecycle) own this file.

import { TUNING, PURCHASES, fmt, computeIncome, computeMultiplier } from "./scripts/config.js";
import {
  buildStatic, updatePlot, disposePlot,
  updateDrops, disposeDrops,
  updatePurchases, checkMilestones, saveNow,
  equipGear, redeemCode,
} from "./scripts/plot.js";
import { createHud } from "./scripts/hud.js";

export const meta = {
  slug: "tycoon",
  name: "Boss Tycoon",
  icon: "🏭",
  description: "Droppers, upgrades, secret codes — become the Boss.",
  version: "1.0.0",
};

const SAVE_SCHEMA_VERSION = 1; // spec 10 §3.1

let state = null;
let hud = null;

// §3.1's save, field for field. Anything the slice does not write yet (codes,
// boostRemaining, equipped) is still stored, so a save written now survives the
// sections that start using it (§5.11 codes, §5.7 gear).
function defaultSave() {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    cash: 0,
    totalEarned: 0,
    purchased: {},
    codes: [],
    milestones: [],
    boostRemaining: 0,
    equipped: null,
  };
}

function loadSave(ctx) {
  const save = defaultSave();
  const raw = ctx.services.saves.load();
  if (!raw) return save;
  if (raw.schemaVersion !== SAVE_SCHEMA_VERSION) {
    ctx.services.ui.toast("Save was from a newer version — reset", { icon: "⚠️" });
    return save;
  }
  if (typeof raw.cash === "number" && raw.cash >= 0) save.cash = raw.cash;
  if (typeof raw.totalEarned === "number" && raw.totalEarned >= 0) save.totalEarned = raw.totalEarned;
  if (raw.purchased && typeof raw.purchased === "object") save.purchased = Object.assign({}, raw.purchased);
  if (Array.isArray(raw.codes)) save.codes = raw.codes.slice();
  if (Array.isArray(raw.milestones)) save.milestones = raw.milestones.slice();
  if (typeof raw.boostRemaining === "number" && raw.boostRemaining > 0) save.boostRemaining = raw.boostRemaining;
  if (typeof raw.equipped === "string") save.equipped = raw.equipped;
  return save;
}

// §3.2's runtime state. The slice carries the fields its sections read; the rest
// (auraParts, heli, swingCooldownUntil, hud DOM refs) arrive with §5.7-§5.9.
function createState(save) {
  return {
    save,
    incomePerSec: computeIncome(save),
    multiplier: computeMultiplier(save),
    drops: [],
    dropperClocks: {},
    padsById: {},
    builtParts: {},
    labels: {},
    padDebounceUntil: 0,
    poorToastAt: 0,
    lastCashSfxAt: -TUNING.CASH_SFX_THROTTLE,
    saveTimer: 0,
    // §5.8/§5.9/§5.1's moving scenery, filled in by their builders and driven by
    // updatePlot. Empty until the purchase that creates them.
    auras: [],
    chopper: null,
    doorPartId: null,
    plotTime: 0,
    hud: { cash: null, income: null, mult: null },
  };
}

// §5.13's Cash pill, multiplier and boost chips, CODES panel and gear hotbar are a
// game-owned DOM layer in scripts/hud.js. The platform HUD chips stay too — the
// only HUD surface ctx exposes (spec 04 §5.7) — and writes only on change.
// The hotbar shows only gear the save actually owns, so it stays empty until the
// first gear pad is bought and never offers something that would be refused.
function refreshGearHud() {
  if (!hud || !state) return;
  const owned = PURCHASES.filter((p) => p.kind === "gear" && state.save.purchased[p.id]);
  hud.setGear(owned, state.save.equipped);
}

// §5.13 — the tycoon's own HUD is the one that shows Cash, income, multiplier and
// boost. The platform HUD's stat chips are NOT also driven with the same three
// numbers: two rows saying the same thing is worse than one, and they collide.
// The platform HUD keeps what is platform-wide, which is Oofbux.
function updateHud() {
  if (!hud || !state) return;
  const cash = fmt(state.save.cash);
  if (cash !== state.hud.cash) {
    state.hud.cash = cash;
    hud.setCash(cash);
  }
  const income = "+" + fmt(state.incomePerSec) + "/s";
  if (income !== state.hud.income) {
    state.hud.income = income;
    hud.setIncome(income);
  }
  const mult = String(state.multiplier);
  if (mult !== state.hud.mult) {
    state.hud.mult = mult;
    hud.setMultiplier(mult);
  }
  hud.setBoost(state.save.boostRemaining);
  refreshGearHud();
}

export function init(ctx) {
  // §5.15 step 2: d01 is never auto-granted — its FREE pad is the tutorial step.
  state = createState(loadSave(ctx));
  buildStatic(ctx, state);
  hud = createHud({
    redeem: (text) => redeemCode(ctx, state, text),
    equip: (id) => { equipGear(ctx, state, id); refreshGearHud(); },
  });
  // A save can arrive with gear already equipped; the stats have to follow it.
  if (state.save.equipped) equipGear(ctx, state, state.save.equipped);
  updateHud();
  checkMilestones(ctx, state); // a restored save may predate a milestone's payout
  // SLICE: §5.15 step 4's `window.__oofDebug.tycoon` hook (grantCash/buy/redeem)
  // cannot be written: validate rule 04:V6 makes the identifier an error inside
  // src/games/**, and spec 04 §5.7 forbids games touching it at all. tools/smoke.js
  // drives this Place through the shell's own hooks instead. Reported with this task.
}

export function update(dt, ctx) {
  if (!state) return; // a step that races dispose must not resurrect the Place
  // §5.15's order: boost timer -> drops -> purchases -> gear -> plot -> HUD -> save.
  if (state.save.boostRemaining > 0) {
    state.save.boostRemaining = Math.max(0, state.save.boostRemaining - dt);
  }
  updateDrops(ctx, state, dt);
  updatePurchases(ctx, state);
  updatePlot(ctx, state, dt);
  updateHud();
  state.saveTimer += dt;
  if (state.saveTimer >= TUNING.AUTOSAVE_INTERVAL) saveNow(ctx, state);
}

export function dispose(ctx) {
  if (!state) return;
  saveNow(ctx, state);
  disposeDrops(ctx, state);
  disposePlot(ctx, state);
  if (hud) hud.dispose();
  hud = null;
  // §5.15: gear stats are the Place's, so they go back to the platform defaults on
  // the way out — carrying a Magic Carpet's 30 walk speed into the obby would break it.
  ctx.player.setWalkSpeed(16);
  ctx.player.setJumpPower(50);
  // SLICE: §5.15's walk/jump reset belongs to §5.4's gear, which is the only thing
  // that changes them; the slice never touches either stat.
  state = null;
}
