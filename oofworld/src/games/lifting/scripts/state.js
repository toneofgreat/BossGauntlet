// src/games/lifting/scripts/state.js — spec 09 §3.1 (the save), §5.2 (the multiplier and
// addStrength), §5.7 (rebirths), §5.8 (titles), §5.9 (Power Surges), §5.10 (aura grants)
// and §5.12 (Oofbux + badges). Every number the player owns lives here; every consequence
// of changing one (toast, sfx, payout, badge, mobility) fires from here so no caller can
// award something twice by forgetting a step.
//
// Nothing in this file touches the DOM or the scene. Its one presentation dependency is
// board.js's particle burst (§5.2/§5.9 both call for one at the avatar) — board.js
// no-ops until init, which keeps this module loadable and testable headless against a
// stub ctx, the way M4-T03's task line asks for.

import {
  ITEMS, REBIRTHS, TITLES, OOFBUX_AWARDS, REWARD_AURAS, TUNING, REQ_GATE_TEXT,
  fmt, itemById, rebirthById, titleForLifetime, surgeStepsForStrength, surgeMobilityForSteps,
} from "./config.js";
import { burst } from "./fx.js";

const SCHEMA_VERSION = 1;
const ITEM_IDS = new Set(ITEMS.map((it) => it.id));
const TITLE_NAMES = new Set(TITLES.map((t) => t.name));
const AWARD_KEYS = new Set(OOFBUX_AWARDS.map((a) => a.key));
// §5.12's lifetime rows in ascending threshold order — the hot path walks an index into
// this instead of re-scanning `oofbuxPaid` on every lift.
const LIFETIME_AWARDS = OOFBUX_AWARDS.filter((a) => a.kind === "lifetime");

// §5.12: r5b's badge is `dumbbell-multi`, every other rebirth is `rebirth<n>`.
const REBIRTH_BADGE = Object.freeze({
  r1: "rebirth1", r2: "rebirth2", r3: "rebirth3", r4: "rebirth4",
  r5: "rebirth5", r5b: "dumbbell-multi", r6: "rebirth6",
});

// Which save flag each REBIRTHS `grants` value sets (§3.4 / §5.7's effects column).
const GRANT_FLAG = Object.freeze({
  auto: "autoUnlocked", space: "spaceUnlocked", dumbbell: "dumbbellUnlocked",
  dumbbellMulti: "dumbbellMulti", lava: "lavaUnlocked",
});

// Platform defaults the Place must hand back (spec 03; restated by §5.9 and §5.15).
const BASE_WALK = 16;
const BASE_JUMP = 50;

// onChange subscribers. Module-level rather than per-state so ui.js/lift.js can subscribe
// before anything mutates; `load` clears the list because a load starts a fresh Place and
// a listener from the previous one is by definition a leak (§7 criterion 24).
let listeners = new Set();

export function onChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// A listener that throws must not abort the mutation that notified it — same contract as
// the platform emitter (spec 04 §5.1).
function emit(state, reason) {
  for (const cb of [...listeners]) {
    try {
      cb(reason, state);
    } catch (err) {
      console.error("[oof] lifting state listener error", reason, err);
    }
  }
}

// ---------------------------------------------------------------------------
// §3.1 load / serialize / save
// ---------------------------------------------------------------------------

function defaults() {
  return {
    schemaVersion: SCHEMA_VERSION,
    strength: 0,
    lifetime: 0,
    rebirthLevel: 0,
    spaceUnlocked: false,
    dumbbellUnlocked: false,
    dumbbellMulti: false,
    lavaUnlocked: false,
    autoUnlocked: false,
    mega100k: false,
    items: ["pencil"],
    equippedItem: "pencil",
    equippedTitle: "",
    titleAuto: true,
    oofbuxPaid: [],
    stats: { lifts: 0, playSeconds: 0 },
  };
}

function mergeNumber(raw, key, fallback) {
  const v = raw[key];
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
}

function mergeBool(raw, key, fallback) {
  return typeof raw[key] === "boolean" ? raw[key] : fallback;
}

// §3.1 step 1-3. A save that is missing, not an object, or from another schemaVersion is
// replaced wholesale by the defaults — never partially trusted (§7 criterion 20).
export function load(ctx) {
  listeners = new Set();
  const state = defaults();
  const raw = ctx.services.saves.load();
  if (raw && typeof raw === "object" && !Array.isArray(raw) && raw.schemaVersion === SCHEMA_VERSION) {
    state.strength = mergeNumber(raw, "strength", 0);
    state.lifetime = mergeNumber(raw, "lifetime", 0);
    // 0..4 is the whole domain of §5.2's LADDER; a save claiming 9 would make the
    // multiplier NaN, so it is clamped rather than trusted. §3.1 only asks for >= 0.
    state.rebirthLevel = Math.min(4, Math.floor(mergeNumber(raw, "rebirthLevel", 0)));
    for (const flag of ["spaceUnlocked", "dumbbellUnlocked", "dumbbellMulti", "lavaUnlocked", "autoUnlocked", "mega100k", "titleAuto"]) {
      state[flag] = mergeBool(raw, flag, state[flag]);
    }
    if (Array.isArray(raw.items)) {
      const kept = [];
      for (const id of raw.items) {
        if (typeof id === "string" && ITEM_IDS.has(id) && !kept.includes(id)) kept.push(id);
      }
      state.items = kept;
    }
    if (typeof raw.equippedItem === "string" && ITEM_IDS.has(raw.equippedItem)) {
      state.equippedItem = raw.equippedItem;
    }
    if (typeof raw.equippedTitle === "string" && (raw.equippedTitle === "" || TITLE_NAMES.has(raw.equippedTitle))) {
      state.equippedTitle = raw.equippedTitle;
    }
    if (Array.isArray(raw.oofbuxPaid)) {
      const kept = [];
      for (const key of raw.oofbuxPaid) {
        if (typeof key === "string" && AWARD_KEYS.has(key) && !kept.includes(key)) kept.push(key);
      }
      state.oofbuxPaid = kept;
    }
    if (raw.stats && typeof raw.stats === "object") {
      state.stats.lifts = mergeNumber(raw.stats, "lifts", 0);
      state.stats.playSeconds = mergeNumber(raw.stats, "playSeconds", 0);
    }
  }

  // §3.1 step 3's invariants, applied after the merge so a hand-edited save still boots.
  if (!state.items.includes("pencil")) state.items.unshift("pencil");
  if (!state.items.includes(state.equippedItem)) state.equippedItem = "pencil";
  if (state.equippedTitle && titleThreshold(state.equippedTitle) > state.lifetime) state.equippedTitle = "";

  // Runtime-only fields (§3.1: `multi` is never stored — always derived).
  state.multi = recomputeMulti(state);
  state.surgeSteps = surgeStepsForStrength(state.strength);
  state.titleTop = topTitleName(state.lifetime);
  // Deliberately NOT auto-equipping the best earned title here even when titleAuto is on:
  // §5.8 ties auto-equip to the moment a threshold is CROSSED, and §7 criterion 20 wants
  // load(serialize(s)) to be deep-equal to s, which any load-time mutation would break.
  state.milestoneIdx = 0;
  state.dirty = false;
  state.saveTimer = 0;
  return state;
}

function titleThreshold(name) {
  const row = TITLES.find((t) => t.name === name);
  return row ? row.threshold : Infinity;
}

function topTitleName(lifetime) {
  const row = titleForLifetime(lifetime);
  return row ? row.name : "";
}

// The save document, and nothing else: no `multi`, no dirty flag, no surge cache.
export function serialize(state) {
  return {
    schemaVersion: SCHEMA_VERSION,
    strength: state.strength,
    lifetime: state.lifetime,
    rebirthLevel: state.rebirthLevel,
    spaceUnlocked: state.spaceUnlocked,
    dumbbellUnlocked: state.dumbbellUnlocked,
    dumbbellMulti: state.dumbbellMulti,
    lavaUnlocked: state.lavaUnlocked,
    autoUnlocked: state.autoUnlocked,
    mega100k: state.mega100k,
    items: state.items.slice(),
    equippedItem: state.equippedItem,
    equippedTitle: state.equippedTitle,
    titleAuto: state.titleAuto,
    oofbuxPaid: state.oofbuxPaid.slice(),
    stats: { lifts: state.stats.lifts, playSeconds: state.stats.playSeconds },
  };
}

export function markDirty(state) {
  state.dirty = true;
}

// §3.1's save policy (a) and (c): an immediate write. Every non-lift mutation below ends
// with one of these; the lift path only ever marks dirty.
export function save(ctx, state) {
  try {
    ctx.services.saves.save(serialize(state));
  } catch (err) {
    console.error("[oof] lifting save failed", err);
  }
  state.dirty = false;
  state.saveTimer = 0;
}

// §3.1's save policy (b): lift-driven changes coalesce into one write per
// SAVE_INTERVAL_S of SIM time. Called from game.js's update, never from the lift path.
export function tickSave(dt, ctx, state) {
  state.saveTimer += dt;
  if (state.dirty && state.saveTimer >= TUNING.SAVE_INTERVAL_S) save(ctx, state);
}

// ---------------------------------------------------------------------------
// §5.2 the multiplier
// ---------------------------------------------------------------------------

export function recomputeMulti(state) {
  let m = TUNING.LADDER[state.rebirthLevel] || 1;
  if (state.spaceUnlocked) m *= TUNING.SPACE_MULT;
  if (state.dumbbellMulti) m *= TUNING.DUMBBELL_MULT;
  if (state.lavaUnlocked) m *= TUNING.LAVA_MULT;
  if (state.mega100k) m *= TUNING.MEGA_MULT;
  return m;
}

// §5.2: spending never touches `lifetime`. Callers with a ctx follow a successful spend
// with syncMobility — §5.9's steps can fall as well as rise.
export function spend(state, n) {
  if (state.strength < n) return false;
  state.strength -= n;
  return true;
}

// The ONLY way strength increases (§5.2). Ordered exactly as that section numbers it so
// the 100K multiplier applies from the NEXT lift, not retroactively to this one.
export function addStrength(ctx, state, gain) {
  if (!Number.isFinite(gain) || gain <= 0) return;
  state.strength += gain;
  state.lifetime += gain;
  state.stats.lifts += 1;

  checkMega(ctx, state);
  checkTitles(ctx, state);
  syncMobility(ctx, state, true);
  checkOofbux(ctx, state);

  state.multi = recomputeMulti(state);
  markDirty(state);
  emit(state, "gain");
}

function checkMega(ctx, state) {
  if (state.mega100k || state.lifetime < TUNING.MEGA_THRESHOLD) return;
  state.mega100k = true;
  ctx.services.ui.toast("100K CLUB! Permanent x10 multiplier!", { icon: "🎉", duration: 4000 });
  ctx.services.badges.award("club-100k");
  grantAuras(ctx, state);
  ctx.engine.audio.playSfx("win");
  ctx.engine.camera.shake(0.5, 0.6);
}

// ---------------------------------------------------------------------------
// §5.8 titles — the unlocked set is derived from lifetime, never stored.
// ---------------------------------------------------------------------------

function checkTitles(ctx, state) {
  const name = topTitleName(state.lifetime);
  if (!name || name === state.titleTop) return;
  // A single huge gain can cross several thresholds; the player is told about the
  // highest one they landed on rather than spammed with the ladder they skipped.
  state.titleTop = name;
  ctx.services.ui.toast("Title unlocked: " + name + "!", { icon: "🏷️" });
  ctx.engine.audio.playSfx("win");
  if (name === "The Rock") ctx.services.badges.award("title-rock");
  if (state.titleAuto) {
    state.equippedTitle = name;
    emit(state, "title");
  }
}

export function equipTitle(ctx, state, name) {
  if (name !== "" && !TITLE_NAMES.has(name)) return { ok: false, reason: "unknown" };
  if (name !== "" && state.lifetime < titleThreshold(name)) {
    ctx.services.ui.toast("Title locked — reach " + fmt(titleThreshold(name)) + " lifetime Strength!", { icon: "🔒" });
    ctx.engine.audio.playSfx("denied");
    return { ok: false, reason: "locked" };
  }
  state.equippedTitle = name;
  // §5.8: a manual equip (including "(none)") turns the auto-follow off; the panel's
  // AUTO toggle is the only way back on.
  state.titleAuto = false;
  save(ctx, state);
  emit(state, "title");
  return { ok: true };
}

export function setTitleAuto(ctx, state, on) {
  state.titleAuto = !!on;
  if (state.titleAuto) {
    const name = topTitleName(state.lifetime);
    if (name) state.equippedTitle = name;
  }
  save(ctx, state);
  emit(state, "title");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// §5.9 Power Surges — mobility milestones on CURRENT strength.
// ---------------------------------------------------------------------------

// allowFx is false during boot and after a rebirth: the step count changes there without
// the player having done anything worth a toast.
export function syncMobility(ctx, state, allowFx) {
  const steps = surgeStepsForStrength(state.strength);
  if (steps === state.surgeSteps) return;
  const rising = steps > state.surgeSteps;
  state.surgeSteps = steps;
  const mob = surgeMobilityForSteps(steps);
  ctx.player.setWalkSpeed(BASE_WALK * mob);
  ctx.player.setJumpPower(BASE_JUMP * mob);
  if (!rising || !allowFx) return; // §5.9: no FX on decrease
  ctx.services.ui.toast("POWER SURGE! Speed x" + mob.toFixed(1), { icon: "⚡" });
  ctx.engine.audio.playSfx("win");
  const feet = ctx.player.position();
  burst(ctx, [feet[0], feet[1] + 2.5, feet[2]], "#f7c948", 20);
}

// §5.15 step 5 — explicit, even though the shell also resets these on Place exit.
export function resetMobility(ctx) {
  ctx.player.setWalkSpeed(BASE_WALK);
  ctx.player.setJumpPower(BASE_JUMP);
}

// ---------------------------------------------------------------------------
// §5.12 Oofbux + badges, §5.10 aura grants — all idempotent, all re-runnable at boot.
// ---------------------------------------------------------------------------

function payOofbux(ctx, state, key) {
  if (state.oofbuxPaid.includes(key)) return false;
  const row = OOFBUX_AWARDS.find((a) => a.key === key);
  if (!row) return false;
  state.oofbuxPaid.push(key);
  ctx.services.economy.award(row.amount, "lifting:" + key);
  // Spec 07's economy service emits `economy:changed` but never toasts an award, so
  // §5.12's game-side toast is the one the player sees.
  ctx.services.ui.toast("+" + row.amount + " Oofbux!", { icon: "⬡" });
  return true;
}

function checkOofbux(ctx, state) {
  const rows = LIFETIME_AWARDS;
  let paid = false;
  while (state.milestoneIdx < rows.length && state.lifetime >= rows[state.milestoneIdx].threshold) {
    paid = payOofbux(ctx, state, rows[state.milestoneIdx].key) || paid;
    state.milestoneIdx++;
  }
  // A payout is worth an immediate write: it is real currency, not a lift tick.
  if (paid) save(ctx, state);
}

function auraEarned(state, trigger) {
  // §5.10's one compound trigger; the other three are a single save flag.
  if (trigger === "lavaUnlocked+gdstar") return state.lavaUnlocked && state.items.includes("gdstar");
  return !!state[trigger];
}

// §5.10: grantItem is idempotent (spec 05 §5.9 rule 3), so this is safe to re-run on every
// boot and after every unlock. The sfx fires only on a genuinely new grant.
export function grantAuras(ctx, state) {
  for (const aura of REWARD_AURAS) {
    if (!auraEarned(state, aura.trigger)) continue;
    const res = ctx.services.avatar.grantItem(aura.id, "lifting");
    if (res && res.ok && res.alreadyOwned === false) ctx.engine.audio.playSfx("win");
  }
}

// §5.1 step 6 / §5.12: re-derive every badge this save has already earned. Repeat awards
// return false and cost nothing.
export function applyGrants(ctx, state) {
  const b = ctx.services.badges;
  if (state.stats.lifts >= 1) b.award("first-lift");
  if (state.mega100k) b.award("club-100k");
  // How far up the ladder this save has EVER been. rebirthLevel alone is not enough:
  // r5 wipes it back to 0 (§5.7), so the permanent unlock flags are what remember that
  // r1..r5 happened at all — each one implies every rebirth below it.
  let everLevel = state.rebirthLevel;
  if (state.autoUnlocked) everLevel = Math.max(everLevel, 2);
  if (state.spaceUnlocked) everLevel = Math.max(everLevel, 3);
  if (state.dumbbellUnlocked) everLevel = 5;
  for (let n = 1; n <= Math.min(5, everLevel); n++) b.award("rebirth" + n);
  if (state.dumbbellMulti) b.award("dumbbell-multi");
  if (state.lavaUnlocked) b.award("rebirth6");
  if (state.items.includes("gdstar")) b.award("gd-star");
  if (state.items.length === ITEMS.length) b.award("all-items");
  if (state.titleTop === "The Rock") b.award("title-rock");
  grantAuras(ctx, state);
  // §5.9 at boot: syncMobility only acts on a CHANGE in step count, and load() already
  // cached the restored strength's steps — so the stats are pushed once directly here,
  // or a save loaded at 1e6 Strength would walk at the platform default.
  const mob = surgeMobilityForSteps(state.surgeSteps);
  ctx.player.setWalkSpeed(BASE_WALK * mob);
  ctx.player.setJumpPower(BASE_JUMP * mob);
}

// ---------------------------------------------------------------------------
// §5.2 shop: buy / equip
// ---------------------------------------------------------------------------

// §5.5's req gate table.
export function reqMet(state, req) {
  if (!req) return true;
  if (req === "r1") return state.rebirthLevel >= 1;
  if (req === "r2") return state.rebirthLevel >= 2;
  if (req === "r4") return state.rebirthLevel >= 4;
  if (req === "space") return state.spaceUnlocked;
  if (req === "dumbbell") return state.dumbbellUnlocked;
  if (req === "lava") return state.lavaUnlocked;
  return false;
}

export function buyItem(ctx, state, id) {
  const item = itemById(id);
  if (!item) return { ok: false, reason: "unknown" };
  if (state.items.includes(id)) return { ok: false, reason: "owned" };
  if (!reqMet(state, item.req)) {
    ctx.services.ui.toast(REQ_GATE_TEXT[item.req] || "Locked!", { icon: "🔒" });
    ctx.engine.audio.playSfx("denied");
    return { ok: false, reason: "locked" };
  }
  if (!spend(state, item.cost)) {
    ctx.services.ui.toast("Not enough Strength!", { icon: "💪" });
    ctx.engine.audio.playSfx("denied");
    return { ok: false, reason: "broke" };
  }
  state.items.push(id);
  ctx.services.ui.toast("Bought " + item.name + "!", { icon: "🛒" });
  ctx.engine.audio.playSfx("buy");
  if (id === "gdstar") ctx.services.badges.award("gd-star");
  if (state.items.length === ITEMS.length) ctx.services.badges.award("all-items");
  grantAuras(ctx, state); // gdstar can complete aura_ascended (§5.10)
  syncMobility(ctx, state, false); // the price just lowered current strength
  equipItem(ctx, state, id); // §5.2: a purchase auto-equips, and saves
  emit(state, "buy");
  return { ok: true };
}

export function equipItem(ctx, state, id) {
  if (!state.items.includes(id)) return { ok: false, reason: "unowned" };
  state.equippedItem = id;
  save(ctx, state);
  emit(state, "equip"); // lift.js rebuilds the held group off this
  return { ok: true };
}

// ---------------------------------------------------------------------------
// §5.7 rebirths — destructive and permanent, so the gate is checkable BEFORE the
// confirm dialog game.js puts in front of it.
// ---------------------------------------------------------------------------

function grantOwned(state, grants) {
  const flag = GRANT_FLAG[grants];
  return flag ? !!state[flag] : false;
}

// §5.7's two gate texts. A row whose one-shot effect is already owned reads "Already
// done!"; anything else is missing its prerequisite rebirth.
function gateMessage(state, r) {
  const index = REBIRTHS.indexOf(r);
  const prev = index > 0 ? REBIRTHS[index - 1].name : null;
  if (r.setLevel !== null) {
    return state.rebirthLevel >= r.setLevel ? "Already done!" : "Requires " + prev + " first!";
  }
  if (grantOwned(state, r.grants)) return "Already done!";
  return prev ? "Requires " + prev + " first!" : "Locked!";
}

// canRebirth(state, id) -> { ok, reason?, message? }. Not in §4's export table: game.js
// needs the verdict BEFORE it opens the confirm dialog, so that a rebirth that cannot
// happen is refused with its own toast instead of asking the player to confirm nothing.
export function canRebirth(state, id) {
  const r = rebirthById(id);
  if (!r) return { ok: false, reason: "unknown", message: "Unknown rebirth." };
  if (!r.gate(state)) return { ok: false, reason: "locked", message: gateMessage(state, r) };
  if (state.strength < r.cost) return { ok: false, reason: "broke", message: "Need " + fmt(r.cost) + " Strength!" };
  return { ok: true };
}

export function tryRebirth(ctx, state, id) {
  const r = rebirthById(id);
  if (!r) return { ok: false, reason: "unknown" };
  const gate = canRebirth(state, id);
  if (!gate.ok) {
    ctx.services.ui.toast(gate.message, { icon: "🔒", variant: "danger" });
    ctx.engine.audio.playSfx("denied");
    return gate;
  }

  // Effects in §5.7's stated order. Strength always goes to zero — the "strength→0 only"
  // rows (r5b, r6) differ from the others only in keeping items and level.
  state.strength = 0;
  if (r.wipeItems) {
    state.items = ["pencil"];
    state.equippedItem = "pencil";
  }
  if (r.wipeLevel) state.rebirthLevel = 0;
  if (r.setLevel !== null) state.rebirthLevel = r.setLevel;
  if (r.grants && GRANT_FLAG[r.grants]) state[GRANT_FLAG[r.grants]] = true;
  state.multi = recomputeMulti(state);

  ctx.services.ui.toast(r.name.toUpperCase() + "! Multi is now x" + fmt(state.multi) + "!", { icon: "🌀", duration: 4000 });
  ctx.engine.audio.playSfx("fanfare");
  ctx.engine.camera.shake(0.6, 0.8);
  const feet = ctx.player.position();
  burst(ctx, [feet[0], feet[1] + 2.5, feet[2]], "#f7c948", 30);

  ctx.services.badges.award(REBIRTH_BADGE[r.id]);
  payOofbux(ctx, state, r.id);
  grantAuras(ctx, state);
  syncMobility(ctx, state, false); // strength is 0 now: steps fall, silently
  save(ctx, state);
  emit(state, "rebirth"); // rebuilds the held group when wipeItems took it away
  return { ok: true };
}
