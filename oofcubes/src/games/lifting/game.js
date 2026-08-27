// src/games/lifting/game.js — Weight Lifting Simulator's entry module. Spec 09 §5.1 (boot
// flow), §5.15 (dispose) own this file; everything else is wired from here into scripts/.
//
// §5.6's portals, travel and lava gate now live in `scripts/worlds.js` and §5.14's FX
// pools in `scripts/fx.js`, the two modules §4's table names — this file just wires them.

import { fmt, rebirthById } from "./scripts/config.js";
import * as stateMod from "./scripts/state.js";
import * as worlds from "./scripts/worlds.js";
import * as fx from "./scripts/fx.js";
import * as lift from "./scripts/lift.js";
import * as board from "./scripts/board.js";
import * as ui from "./scripts/ui.js";

export const meta = {
  slug: "lifting",
  name: "Weight Lifting Simulator",
  icon: "🏋️",
  description: "Tap to lift. Get huge. Lift the Moon.",
  version: "1.0.0",
};

// §5.6's gym spawn, matching place.json's `spawn`.
const GYM_SPAWN = [0, 0.5, 24];
// Lift-driven panel refreshes coalesce to this many seconds of sim time. At 13 lifts/s
// (8 manual + 5 auto) a per-lift re-render would be pure waste; a fifth of a second is
// still faster than a player can read a price.
const UI_REFRESH_S = 0.2;

let state = null;
let subs = [];
let hud = { strength: "", multi: "", rebirth: "" };
let uiDirty = false;
let uiTimer = 0;
let rebirthPending = false;
let confirmHandle = null; // the open rebirth confirm, so dispose can take it back down

// ---------------------------------------------------------------------------
// §5.7 the rebirth confirm
// ---------------------------------------------------------------------------

// A rebirth is destructive and permanent, so it never happens on one tap. The gate is
// checked FIRST: a rebirth that cannot happen is refused with its own toast rather than
// asking the player to confirm something that will then be denied.
//
// The prompt is ui.openConfirm (the game's own overlay), not ctx.services.ui.dialog: the
// platform dialog returns a bare Promise with no dismiss API, so a Place teardown
// mid-confirm left its modal sitting over the Hub. openConfirm hands back a handle, held
// here and closed in dispose. See the note at ui.js's openConfirm; reported.
function requestRebirth(ctx, id) {
  if (rebirthPending) return { ok: false, reason: "busy" };
  const r = rebirthById(id);
  if (!r) return { ok: false, reason: "unknown" };
  const gate = stateMod.canRebirth(state, id);
  if (!gate.ok) {
    ctx.services.ui.toast(gate.message, { icon: "🔒" });
    ctx.engine.audio.playSfx("denied");
    return gate;
  }

  const lost = ["all " + fmt(state.strength) + " Strength"];
  if (r.wipeItems) lost.push("every item except the Pencil");
  if (r.wipeLevel) lost.push("all " + state.rebirthLevel + " rebirth levels");
  const kept = ["lifetime Strength", "titles", "badges", "Oofbux", "unlocked worlds"];
  if (state.autoUnlocked) kept.push("the autoclicker");

  rebirthPending = true;
  confirmHandle = ui.openConfirm({
    title: r.name + " — this cannot be undone",
    body: "YOU LOSE: " + lost.join(", ") + ".\n"
      + "YOU KEEP: " + kept.join(", ") + ".\n"
      + "YOU GAIN: " + r.blurb,
    confirmLabel: "REBIRTH",
    cancelLabel: "Cancel",
    onChoice: (choice) => {
      rebirthPending = false;
      confirmHandle = null;
      if (choice !== "confirm" || !state) return; // dispose can win the race
      stateMod.tryRebirth(ctx, state, id);
    },
  });
  return { ok: true, reason: "confirming" };
}

function dismissRebirthConfirm() {
  if (confirmHandle) confirmHandle.close(); // silent: onChoice does not fire
  confirmHandle = null;
  rebirthPending = false;
}

// ---------------------------------------------------------------------------
// §5.1 step 5 — the platform HUD chips, written only when their text changes
// ---------------------------------------------------------------------------

function refreshHud(ctx) {
  const strength = fmt(state.strength);
  if (strength !== hud.strength) {
    hud.strength = strength;
    ctx.services.ui.setHudStat("strength", { icon: "💪", label: "Strength", value: strength });
  }
  const multi = "x" + fmt(state.multi);
  if (multi !== hud.multi) {
    hud.multi = multi;
    ctx.services.ui.setHudStat("multi", { icon: "✖️", label: "Multi", value: multi });
  }
  const rebirths = String(state.rebirthLevel);
  if (rebirths !== hud.rebirth) {
    hud.rebirth = rebirths;
    ctx.services.ui.setHudStat("rebirth", { icon: "🔄", label: "Rebirths", value: rebirths });
  }
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

export function init(ctx) {
  state = stateMod.load(ctx);
  subs = [];
  hud = { strength: "", multi: "", rebirth: "" };
  uiDirty = false;
  uiTimer = 0;
  rebirthPending = false;
  confirmHandle = null;

  worlds.init(ctx, state); // §5.1 step 2: portals, the lava gate, zone toasts
  fx.init(ctx);            // scene layer first: state's grants may fire a particle burst
  fx.titleTag(ctx, state); // §5.8's over-head tag for whatever title the save carries
  board.init(ctx, state);
  lift.init(ctx, state, {}); // builds the held item for state.equippedItem (§5.1 step 3)
  ui.init(ctx, state, {
    lift: () => lift.requestLift("tap"),
    holdStart: () => lift.setButtonHeld(true),
    holdEnd: () => lift.setButtonHeld(false),
    buy: (id) => stateMod.buyItem(ctx, state, id),
    equip: (id) => stateMod.equipItem(ctx, state, id),
    canRebirth: (id) => stateMod.canRebirth(state, id),
    rebirth: (id) => requestRebirth(ctx, id),
    equipTitle: (name) => stateMod.equipTitle(ctx, state, name),
    setTitleAuto: (on) => stateMod.setTitleAuto(ctx, state, on),
    travel: (zoneId) => worlds.travel(ctx, state, zoneId),
  });

  // Panels and the title tag follow state; lift-driven "gain" churn is coalesced in
  // update() instead of re-rendering thirteen times a second.
  subs.push(stateMod.onChange((reason) => {
    if (reason === "gain") {
      uiDirty = true;
      return;
    }
    if (reason === "title" || reason === "rebirth") fx.titleTag(ctx, state);
    ui.refresh();
  }));

  refreshHud(ctx);
  stateMod.applyGrants(ctx, state); // §5.1 step 6: idempotent badge/aura/mobility catch-up
  ctx.player.setCheckpoint(GYM_SPAWN.slice());
}

export function update(dt, ctx) {
  if (!state) return; // a step racing dispose must not resurrect the Place
  // §5.1's order: lift, fx, board, worlds timers (none in v1), save throttle, play time.
  lift.update(dt, ctx);
  fx.update(dt, ctx);
  board.update(dt, ctx, state);
  stateMod.tickSave(dt, ctx, state);
  state.stats.playSeconds += dt;

  uiTimer += dt;
  if (uiDirty && uiTimer >= UI_REFRESH_S) {
    uiDirty = false;
    uiTimer = 0;
    ui.refresh();
  }
  refreshHud(ctx);
}

export function dispose(ctx) {
  // §5.15, in order: final save, DOM, scene objects, listeners, avatar stats, refs.
  if (state) stateMod.save(ctx, state);
  dismissRebirthConfirm(); // before ui.dispose, while the overlay it lives in still exists
  ui.dispose();
  lift.dispose();
  board.dispose(ctx);
  fx.dispose(ctx);
  worlds.dispose(ctx);
  for (const off of subs) off();
  subs = [];
  stateMod.resetMobility(ctx);
  state = null;
  hud = { strength: "", multi: "", rebirth: "" };
  uiDirty = false;
  uiTimer = 0;
}
