// src/platform/services/avatar.js — the avatar service facade (spec 05 §4, §5.6-§5.9):
// loads/validates the §3.1 avatar state, owns the player's OofRig, and is the single
// door to the Catalog (buy/equip/grant). Every dependency arrives through init(deps) —
// this module imports nothing from src/platform/ so it stays unit-testable, and never
// touches localStorage itself (spec 07 owns the key space; rule 07:V9).

import { buildRig } from "./avatar/rig.js";
import { DEFAULT_FACE_ID } from "./avatar/faces.js";
import { AVATAR_TUNING } from "./avatar/animator.js";
import {
  BASE_SWATCHES, DEFAULT_BODY_COLORS, DEFAULT_OWNED, getItem, getItemsByType,
} from "./avatar/catalog-data.js";

const SCHEMA_VERSION = 1;                 // §3.1 — v1 has no migrations
const DOMAIN = "avatar";                  // saves domain name (spec 07 §5.1)
const HEX_RE = /^#[0-9a-f]{6}$/i;
const LIMB_KEYS = Object.freeze(["head", "torso", "leftArm", "rightArm", "leftLeg", "rightLeg"]);
// §3.1's equipped slots. The slot name IS the item type (§3.2), which is what makes
// `equipped[item.type] = id` in equip() well-defined.
const EQUIP_SLOTS = Object.freeze(["face", "hat", "gear", "aura", "trail"]);
const CLEARABLE_SLOTS = Object.freeze(["hat", "gear", "aura", "trail"]);
const BUY_REASON_PREFIX = "catalog:";     // spec 07 §5.5's source token for purchases

// ---- module state (private) --------------------------------------------------------
let deps = {};
let state = null;          // the live saves-domain object, mutated in place
let playerRig = null;
let initialized = false;
let emitter = null;        // the current Place emitter (rebound per transition)
let unsubDied = null;
const changeSubs = new Set();

function requireInit() {
  if (!state) throw new Error("avatar service not initialized");
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

// ---- §3.1 state: defaults, validation, persistence ---------------------------------

function defaultState() {
  const sources = {};
  for (const id of DEFAULT_OWNED) sources[id] = "default";
  return {
    schemaVersion: SCHEMA_VERSION,
    bodyColors: { ...DEFAULT_BODY_COLORS },
    equipped: { face: DEFAULT_FACE_ID, hat: null, gear: null, aura: null, trail: null },
    owned: [...DEFAULT_OWNED],
    sources,
  };
}

// A limb holds a hex string or a bodycolor item id (§3.1). An id the player does not
// own — or one the Catalog has never heard of — reverts to that limb's default hex.
// Any well-formed hex is kept: §3.1 only mandates the unowned-premium revert, and a
// save code written by a later version may legitimately carry colors setBodyColor
// itself would refuse (§5.6 restricts *writes* to BASE_SWATCHES, not loads).
function normalizeLimb(limb, value, ownedSet) {
  if (typeof value !== "string") return DEFAULT_BODY_COLORS[limb];
  if (HEX_RE.test(value)) return value.toLowerCase();
  const item = getItem(value);
  const swatch = item && item.type === "bodycolor" && item.appearance ? item.appearance.swatch : null;
  if (swatch && ownedSet.has(value)) return value;
  return DEFAULT_BODY_COLORS[limb];
}

function sanitize(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultState();
  if (raw.schemaVersion !== SCHEMA_VERSION) return defaultState();
  // §3.1's "key missing" case reaches us as a bare envelope: the avatar domain's
  // interior is opaque to saves.js (spec 07 §3), so a never-written key comes back as
  // { schemaVersion: 1 } with no interior at all. `owned` is always persisted as an
  // array, so its absence means "nothing stored yet" -> the default state verbatim.
  if (!Array.isArray(raw.owned)) return defaultState();

  const owned = [];
  const ownedSet = new Set();
  for (const id of Array.isArray(raw.owned) ? raw.owned : []) {
    if (typeof id !== "string" || ownedSet.has(id) || !getItem(id)) continue;
    ownedSet.add(id);
    owned.push(id);
  }

  // sources is keyed by owned id; a lost entry falls back to "default", the one value
  // that never claims a Place granted the item.
  const rawSources = raw.sources && typeof raw.sources === "object" ? raw.sources : {};
  const sources = {};
  for (const id of owned) {
    sources[id] = typeof rawSources[id] === "string" && rawSources[id] ? rawSources[id] : "default";
  }

  const bodyColors = {};
  const rawColors = raw.bodyColors && typeof raw.bodyColors === "object" ? raw.bodyColors : {};
  for (const limb of LIMB_KEYS) bodyColors[limb] = normalizeLimb(limb, rawColors[limb], ownedSet);

  const equipped = { face: DEFAULT_FACE_ID, hat: null, gear: null, aura: null, trail: null };
  const rawEquipped = raw.equipped && typeof raw.equipped === "object" ? raw.equipped : {};
  for (const slot of EQUIP_SLOTS) {
    const id = rawEquipped[slot];
    if (typeof id !== "string") continue;
    const item = getItem(id);
    if (!item || item.type !== slot) continue;   // §3.1: ids the Catalog lost are dropped
    equipped[slot] = id;
  }
  if (!equipped.face) equipped.face = DEFAULT_FACE_ID;

  return { schemaVersion: SCHEMA_VERSION, bodyColors, equipped, owned, sources };
}

// saves.js hands out the cached domain object and expects callers to mutate it in
// place, so the sanitized state replaces its contents rather than the reference.
function loadState() {
  const domainObj = deps.saves && typeof deps.saves.getDomain === "function"
    ? deps.saves.getDomain(DOMAIN)
    : null;
  const clean = sanitize(domainObj);
  if (domainObj && typeof domainObj === "object") {
    for (const key of Object.keys(domainObj)) delete domainObj[key];
    Object.assign(domainObj, clean);
    state = domainObj;
  } else {
    state = clean;   // no saves service wired (preview/unit use): in-memory only
  }
  save();            // §3.1: a missing or unparseable key is rewritten with the default
}

function save() {
  if (deps.saves && typeof deps.saves.markDirty === "function") deps.saves.markDirty(DOMAIN);
}

function notify() {
  if (playerRig) playerRig.setState(state);
  const snapshot = getState();
  for (const fn of changeSubs) {
    try {
      fn(snapshot);
    } catch (err) {
      console.error("[oof] avatar onChange subscriber error", err);
    }
  }
}

// Every mutation is validate -> mutate -> save -> onChange (§5.6). No debouncing of
// our own: saves.js already trails the write.
function commit() {
  save();
  notify();
}

// ---- lifecycle ---------------------------------------------------------------------

// bindEvents(emitterArg, slug) — the platform's per-Place rebind hook (spec 07 §5.9
// step 4). §5.6 step 3 subscribes "player:died" at init, but the emitter is rebuilt on
// every Place transition (spec 06 §5.2.4 step 6), so the subscription has to move with
// it or the oof face stops flashing after the first Place change.
export function bindEvents(emitterArg) {
  if (unsubDied) {
    unsubDied();
    unsubDied = null;
  }
  emitter = emitterArg || null;
  if (emitter && typeof emitter.on === "function") {
    unsubDied = emitter.on("player:died", () => {
      if (playerRig) playerRig.flashFace("face_oof", AVATAR_TUNING.OOF_FACE_SECONDS);
    });
  }
}

// init({ saves, economy, ui, events, scene, physics }) — §5.6. `physics` is the
// character controller read every sim step by update() (§2's per-step dependency);
// without it the rig simply stays in the idle pose.
export function init(depsArg) {
  if (initialized) throw new Error("avatar already initialized");
  initialized = true;
  deps = depsArg || {};
  if (!deps.physics) {
    // Loud on purpose: with no controller to read, update() can only ever report idle,
    // so the walk/jump/fall cycles never play. §5.6's dep list omits `physics` while
    // §5.2 requires per-step controller state — see the task's spec-gap note.
    console.warn("[oof] avatar.init: no physics dep — the rig will not leave the idle pose");
  }
  loadState();
  if (deps.scene) playerRig = buildRig(deps.scene, state);
  bindEvents(deps.events || null);
}

// ---- reads --------------------------------------------------------------------------

export function getState() {
  requireInit();
  return deepFreeze(structuredClone(state));
}

// getConfig() — §4's HUD adapter, read by spec 06's avatar button.
export function getConfig() {
  requireInit();
  return Object.freeze({ headColor: state.bodyColors.head, face: state.equipped.face });
}

export function owns(itemId) {
  return Boolean(state) && state.owned.includes(itemId);
}

export function getPlayerRig() {
  return playerRig;
}

export function onChange(cb) {
  if (typeof cb !== "function") return () => {};
  changeSubs.add(cb);
  return () => changeSubs.delete(cb);
}

// ---- rigs ---------------------------------------------------------------------------

// §5.6: with no argument, a randomized ghost/NPC look — free swatches, a free or
// common face, and GHOST_HAT_CHANCE of a common/uncommon hat. Builds its own state
// object, so the persisted avatar is never touched.
function randomGhostState() {
  const bodyColors = {};
  for (const limb of LIMB_KEYS) bodyColors[limb] = pick(BASE_SWATCHES);
  const faces = getItemsByType("face").filter((i) => i.price === 0 || i.rarity === "common");
  const hats = getItemsByType("hat").filter((i) => i.rarity === "common" || i.rarity === "uncommon");
  const face = faces.length ? pick(faces).id : DEFAULT_FACE_ID;
  const hat = hats.length && Math.random() < AVATAR_TUNING.GHOST_HAT_CHANCE ? pick(hats).id : null;
  const owned = hat ? [face, hat] : [face];
  const sources = {};
  for (const id of owned) sources[id] = "default";
  return {
    schemaVersion: SCHEMA_VERSION,
    bodyColors,
    equipped: { face, hat, gear: null, aura: null, trail: null },
    owned,
    sources,
  };
}

export function createRig(customState) {
  return buildRig(deps.scene || null, customState || randomGhostState());
}

// ---- per-sim-step update -------------------------------------------------------------

// §5.2's mode derivation, in the spec's own order: jump, fall, walk, idle.
function deriveAnimState() {
  const physics = deps.physics;
  if (!physics || typeof physics.getVelocity !== "function") return { mode: "idle", speed: 0 };
  const v = physics.getVelocity();
  const speed = Math.hypot(v[0], v[2]);
  const grounded = typeof physics.isGrounded === "function" ? physics.isGrounded() : true;
  if (!grounded) {
    return { mode: v[1] > AVATAR_TUNING.JUMP_VY_THRESHOLD ? "jump" : "fall", speed };
  }
  if (speed >= AVATAR_TUNING.WALK_MODE_MIN_SPEED) return { mode: "walk", speed };
  return { mode: "idle", speed: 0 };
}

export function update(dt) {
  if (!playerRig) return;
  playerRig.setAnimState(deriveAnimState());
  playerRig.update(dt);
}

// ---- mutations (§5.6) ----------------------------------------------------------------

export function setBodyColor(limb, value) {
  requireInit();
  if (!LIMB_KEYS.includes(limb) || typeof value !== "string") return { ok: false, reason: "invalid" };
  if (BASE_SWATCHES.includes(value)) {
    state.bodyColors[limb] = value;
    commit();
    return { ok: true };
  }
  const item = getItem(value);
  const swatch = item && item.type === "bodycolor" && item.appearance ? item.appearance.swatch : null;
  if (!swatch) return { ok: false, reason: "invalid" };
  if (!owns(value)) return { ok: false, reason: "unowned" };
  state.bodyColors[limb] = value;
  commit();
  return { ok: true };
}

export function equip(itemId) {
  requireInit();
  const item = getItem(itemId);
  if (!item || !owns(itemId)) return { ok: false, reason: "unowned" };
  if (item.type === "bodycolor") {
    const preset = item.appearance ? item.appearance.preset : null;
    if (!preset) return { ok: false, reason: "use_setBodyColor" };
    for (const limb of LIMB_KEYS) {
      if (typeof preset[limb] === "string") state.bodyColors[limb] = preset[limb];
    }
    commit();
    return { ok: true };
  }
  state.equipped[item.type] = itemId;
  commit();
  return { ok: true };
}

export function unequip(type) {
  requireInit();
  if (type === "face") {
    state.equipped.face = DEFAULT_FACE_ID;   // §5.6: the face slot is never null
    commit();
    return { ok: true };
  }
  if (!CLEARABLE_SLOTS.includes(type)) return { ok: false };
  state.equipped[type] = null;
  commit();
  return { ok: true };
}

export function buy(itemId) {
  requireInit();
  const item = getItem(itemId);
  if (!item || item.grantOnly || item.price === null) return { ok: false, reason: "invalid" };
  if (owns(itemId)) return { ok: false, reason: "owned" };
  // spec 05 §3.2 allows price 0 while spec 07 §5.5's economy.spend throws on any
  // amount below 1, so a free row is handed over instead of logged as a 0 Oofbux sale.
  if (item.price > 0) {
    const paid = Boolean(deps.economy) && deps.economy.spend(item.price, BUY_REASON_PREFIX + itemId);
    if (!paid) return { ok: false, reason: "broke" };
  }
  state.owned.push(itemId);
  state.sources[itemId] = "catalog";
  commit();                                  // buy never auto-equips (§5.6)
  return { ok: true };
}

// grantItem(itemId, sourceSlug) — §5.9's grant contract: idempotent, never auto-equips,
// so a Place may safely re-call it on every load.
export function grantItem(itemId, sourceSlug) {
  requireInit();
  const item = getItem(itemId);
  if (!item) {
    console.warn("[oof] avatar.grantItem: unknown item", itemId);
    return { ok: false, reason: "unknown" };
  }
  if (owns(itemId)) return { ok: true, alreadyOwned: true };
  state.owned.push(itemId);
  state.sources[itemId] = typeof sourceSlug === "string" && sourceSlug ? sourceSlug : "default";
  commit();
  if (emitter && typeof emitter.emit === "function") {
    emitter.emit("avatar:itemGranted", { itemId, sourceSlug });
  }
  if (deps.ui && typeof deps.ui.toast === "function") deps.ui.toast("Unlocked: " + item.name + "!");
  return { ok: true, alreadyOwned: false };
}
