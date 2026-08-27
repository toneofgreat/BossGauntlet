// src/games/lifting/scripts/worlds.js — spec 09 §4's worlds module: §5.6's portal wiring,
// zone travel, the lava gate and the zone-arrival toasts, plus the `zoneOf` lookup §4
// names.
//
// All of this except zoneOf used to live in game.js. §4's module table names this file
// and lists `init/travel/zoneOf/dispose`, so it is here now. Pure move: the travel gate,
// the toast copy, the checkpoint write and the gate sync are the ones game.js ran.
//
// SPEC AMENDMENT (§4, §5.6). §4 described this module as "code-generated decor + portal
// wiring" and §5.6 said "`worlds.init` builds each display via `items.buildItemGroup`",
// while the SAME §5.6 sentence puts those displays' spin in "`board.update`'s shared
// decor tick" and §5.1/§4 give this module no `update` export to tick them from. Build
// and tick belong to one owner, so the 12 pedestal displays stay in board.js next to the
// tick that drives them, and both spec lines are amended to say `board.init` builds them.
// This module is portal wiring + travel + zoneOf. Reported.

import { PORTAL_EVENTS, TUNING, ZONES, zoneById } from "./config.js";
import { onChange } from "./state.js";

// §5.6: the lava gate is a solid wall until Rebirth 6 opens it.
const LAVA_GATE_PART = "lava-gate-fill";
const LAVA_GATE_T_LOCKED = 0.35;
const LAVA_GATE_T_OPEN = 0.7;

// ---- module closure; dispose() puts all of it back ----
let stateRef = null;
let subs = [];
let zoneToastAt = new Map();

// ---------------------------------------------------------------------------
// §5.6 zone travel
// ---------------------------------------------------------------------------

export function travel(ctx, state, zoneId) {
  const zone = zoneById(zoneId);
  if (!zone) return { ok: false, reason: "unknown" };
  if (zone.req && !state[zone.req]) {
    ctx.services.ui.toast(zone.lockedMessage, { icon: "🔒" });
    ctx.engine.audio.playSfx("denied");
    return { ok: false, reason: "locked" };
  }
  const arrival = zone.arrival.slice();
  ctx.player.teleport(arrival, zone.arrivalYaw);
  // §5.6: the checkpoint moves with you, so dying in a lava pool puts you back at the
  // lava arrival pad and not across the map in the gym (§7 criterion 23).
  ctx.player.setCheckpoint(arrival.slice());
  ctx.engine.audio.playSfx("teleport");
  return { ok: true };
}

// §4: which zone a world position is standing in, or null when it is in none of the four
// footprints (the empty space between zones). Pure lookup over config.js's `bounds`,
// which §5.6's zone rows exist to carry.
export function zoneOf(pos) {
  if (!pos) return null;
  const [x, y, z] = pos;
  for (const zone of ZONES) {
    const { min, max } = zone.bounds;
    if (x >= min[0] && x <= max[0] && y >= min[1] && y <= max[1] && z >= min[2] && z <= max[2]) {
      return zone.id;
    }
  }
  return null;
}

function syncLavaGate(ctx) {
  const parts = ctx.engine.parts;
  if (!parts.get(LAVA_GATE_PART)) return; // a trimmed place.json must not crash the Place
  parts.setCanCollide(LAVA_GATE_PART, !stateRef.lavaUnlocked);
  parts.setTransparency(LAVA_GATE_PART, stateRef.lavaUnlocked ? LAVA_GATE_T_OPEN : LAVA_GATE_T_LOCKED);
}

function onRegionEnter(ctx, regionId) {
  const zone = ZONES.find((z) => z.regionId === regionId);
  if (!zone) return;
  const last = zoneToastAt.get(zone.id);
  if (last !== undefined && ctx.time - last < TUNING.ZONE_TOAST_COOLDOWN_S) return;
  zoneToastAt.set(zone.id, ctx.time);
  ctx.services.ui.toast("— " + zone.name.toUpperCase() + " —", { icon: zone.icon });
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

export function init(ctx, state) {
  stateRef = state;
  subs = [];
  zoneToastAt = new Map();

  // §5.6 portals: place.json's fill plates fire touchEvent, one per destination.
  for (const event of Object.keys(PORTAL_EVENTS)) {
    const zoneId = PORTAL_EVENTS[event];
    subs.push(ctx.events.on("touch:" + event, () => travel(ctx, stateRef, zoneId)));
  }
  subs.push(ctx.events.on("region:enter", (e) => onRegionEnter(ctx, e && e.regionId)));
  // The gate is world state, so this module owns both its initial sync and the one
  // Rebirth 6 triggers — no caller has to remember to re-sync it (§5.6).
  subs.push(onChange((reason) => {
    if (reason === "rebirth") syncLavaGate(ctx);
  }));
  syncLavaGate(ctx);
}

export function dispose(ctx) {
  for (const off of subs) off();
  subs = [];
  stateRef = null;
  zoneToastAt = new Map();
}
