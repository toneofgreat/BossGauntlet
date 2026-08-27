// src/games/tycoon/scripts/config.js — every tunable, table and pure helper of Boss
// Tycoon. Spec 10 §3 (schemas), §5.2-§5.4 (BINDING purchase tables), §5.11
// (milestones) and §6 (TUNING) own this file; nothing here touches ctx or the DOM.

// ---------------------------------------------------------------------------
// LAYOUT — spec 10 §5.1 plot geometry. Every number below is quoted from that
// section's tables, never re-derived.
// ---------------------------------------------------------------------------

export const LAYOUT = Object.freeze({
  // Belt (always present, even before any dropper). Top surface y = 1.5.
  BELT_SIZE: [6, 1, 68],
  BELT_POS: [0, 1, -2],
  BELT_COLOR: "#3a3a44",
  BELT_WALL_SIZE: [0.5, 2, 68],
  BELT_WALL_X: 3.25,
  BELT_WALL_Y: 2,
  BELT_WALL_Z: -2,
  BELT_WALL_COLOR: "#2c2c34",

  // Collector.
  BIN_SIZE: [10, 1, 8],
  BIN_POS: [0, 1, -41],
  BIN_COLOR: "#2e7d3f",
  BIN_BACK_SIZE: [10, 4, 1],
  BIN_BACK_POS: [0, 3, -45.5],
  BIN_GLOW_SIZE: [10, 0.4, 8],
  BIN_GLOW_POS: [0, 2.6, -41],
  BIN_GLOW_COLOR: "#3fe06a",
  COLLECTOR_LABEL_POS: [0, 6, -41],

  // Collection region — pure math, no part (§5.1). x, y and minZ are §5.1's values.
  //
  // §5.1 gives maxZ = -37, which no drop can ever reach: the belt's -z end is
  // z = -36 (centre -2, length 68) and spec 03 §5.8's conveyor carry is POSITIONAL
  // — a drop's velocity stays [0,0,0] while it rides — so the instant its support
  // probe leaves the belt it stops dead and drops into the 1-unit gap between belt
  // end and bin. Collection therefore has to overlap the conveyor surface itself,
  // and this slice extends the +z bound to cover the belt's last carried tick
  // (measured z ∈ [-36.14, -36.0], plus 0.5 u of margin) rather than move any part
  // of §5.1's world. Reported as a spec defect with this task.
  COLLECT_MIN: [-5, 0, -45],
  COLLECT_MAX: [5, 6, -35.5],

  // Buy pads (§5.1 "Buy pads" + §5.2 columns).
  PAD_SIZE: [6, 1, 6],
  PAD_COLOR_UNOWNED: "#ffd23f",
  PAD_COLOR_OWNED: "#6b6b6b",
  PAD_LABEL_DY: 5,
  LABEL_COLOR_AFFORD: "#7dff8a",
  LABEL_COLOR_POOR: "#ff7d7d",
  LABEL_COLOR_OWNED: "#9a9aa8",
  LABEL_COLOR_PLAIN: "#ffffff",

  // Dropper machine (four parts per §5.1) and upgrader arch.
  DROPPER_PILLAR_SIZE: [1, 6, 1],
  DROPPER_BODY_SIZE: [4, 4, 4],
  DROPPER_ARM_SIZE: [6, 1, 1.5],
  DROPPER_SPOUT_SIZE: [1.5, 1, 1.5],
  DROPPER_SIDE_X: 7,
  DROPPER_LABEL_Y: 11,
  ARCH_PILLAR_SIZE: [1.5, 6, 1.5],
  ARCH_PILLAR_X: 5,
  ARCH_BEAM_SIZE: [10.5, 1.5, 1.5],
  ARCH_BEAM_Y: 6.5,
  ARCH_COLOR: "#ff6432",
  ARCH_TRANSPARENCY: 0.3,

  // Buildings that exist in the slice (§5.1 "Buildings" table).
  WALLS1_SIZE: [98, 16, 2],
  WALLS1_POS: [0, 8, -58],
  WALLS1_COLOR: "#b4b4b4",
  LIGHT_SIZE: [3, 0.5, 3],
  LIGHT_Y: 15.5,
  LIGHT_COLOR: "#fff2c8",
  LIGHT_XZ: Object.freeze([[20, 20], [-20, 20], [20, -20], [-20, -20], [0, 40], [0, -40]]),
  // the rest of §5.1's Buildings rows
  WALLS3_SIZE: [98, 16, 2],
  WALLS3_POS: [0, 8, 58],
  WALLS2_SIZE: [2, 16, 118],
  WALLS2_X: 49,
  ROOF_SIZE: [100, 1.5, 120],
  ROOF_POS: [0, 16.5, 0],
  DOOR_SIZE: [12, 11, 1.2],
  DOOR_POS: [0, 6, 58],
  DOOR_COLOR: "#ff2a6d",
  DOOR_PULSE_HZ: 0.6,
  RAMP_STEPS: 7,
  RAMP_X: 44,
  RAMP_Z0: -20,
  RAMP_STEP_SIZE: [8, 1, 8],
  RAMP_COLOR: "#8d8d94",
  // §5.8 auras — three orbiting rings over the plot, each tier faster and higher
  AURA_COUNT: 8,
  AURA_TIERS: Object.freeze([
    Object.freeze({ id: "aura1", color: "#ffd23f", radius: 14, height: 4, speed: 40, size: [1.4, 1.4, 1.4] }),
    Object.freeze({ id: "aura2", color: "#ff6a2a", radius: 18, height: 7, speed: 65, size: [1.6, 1.6, 1.6] }),
    Object.freeze({ id: "aura3", color: "#7fd4f2", radius: 22, height: 10, speed: 90, size: [1.8, 1.8, 1.8] }),
  ]),
  // §5.9 chopper — parks over the plot and follows the boss around
  CHOPPER_BODY_SIZE: [6, 3, 12],
  CHOPPER_TAIL_SIZE: [1.2, 1.2, 8],
  CHOPPER_ROTOR_SIZE: [18, 0.4, 1.6],
  CHOPPER_SKID_SIZE: [0.8, 0.8, 10],
  CHOPPER_COLOR: "#f2d024",
  CHOPPER_HEIGHT: 26,
  CHOPPER_FOLLOW: 0.6, // fraction of the gap closed per second
  // §5.10 statue
  STATUE_POS: [0, 1, 46],
  STATUE_COLOR: "#f7c948",

  // The lawn sign — §3.4's st-sign-board carries this line.
  SIGN_TEXT: "BOSS TYCOON — step on glowing pads to buy",
  SIGN_POS: [12, 8, 51.6],
});

// ---------------------------------------------------------------------------
// TUNING — spec 10 §6, the single tuning table. Rows the slice does not read yet
// are kept verbatim so §5.5/§5.7-§5.11's algorithms append without re-tuning.
// ---------------------------------------------------------------------------

export const TUNING = Object.freeze({
  DROP_INTERVAL: 2.0,      // s between drops, per dropper
  CONVEYOR_SPEED: 8,       // units/s belt surface velocity
  MAX_LIVE_DROPS: 60,      // perf cap; oldest is force-collected (credited)
  DROP_TTL: 30,            // s before an uncollected drop despawns (no credit)
  DROP_SIZE: 1.2,          // drop cube edge
  DROP_SPAWN_Y: 6,         // spawn height above plot
  KILL_Y: -20,             // below this, drops are removed uncredited
  PAD_DEBOUNCE: 1.0,       // s between purchase attempts
  PAD_RADIUS: 3.5,         // half-extent of pad overlap test (x,z)
  SMACK_RANGE: 6,          // sword smack radius
  SMACK_BONUS: 1.25,       // value multiplier for smacked drops
  SMACK_VELOCITY: [0, 3, -14],
  SWING_COOLDOWN: 0.6,
  SWING_LIFETIME: 0.25,
  UPGRADER_MULT: 3,        // per upgrader (×9 max)
  BOOST_MULT: 2,           // BOSSMODE earnings multiplier
  BOOST_DURATION: 600,     // sim-s added per BOSSMODE redeem (one redeem only)
  AURA_ORBIT_RADIUS: 2.2,
  AURA_ORBIT_SPEED: 1.5,
  HELI_SPEED: 8,
  HELI_RIDE_BADGE_TIME: 10,
  ROTOR_SPEED: 240,        // deg/s spinner
  AUTOSAVE_INTERVAL: 10,   // sim-s
  CASH_SFX_THROTTLE: 0.15, // s min gap between collect sounds
  LABEL_MAX_DIST: 80,      // units label cull distance
  MILESTONE_OOFBUX_TOTAL: 385, // documentation invariant over §5.11's FULL table
});


// ---------------------------------------------------------------------------
// PURCHASES — spec 10 §3.3 record schema, §5.2 pad grid, §5.3/§5.4 costs.
// ---------------------------------------------------------------------------
//
// Every row of §5.3 and §5.4 at its §5.2 pad slot: 11 droppers, 2 upgraders, 12
// buildings and 5 gear pads. The cost chain is the spec's, which keeps roughly a
// 1.5x step per tier — the pacing §5.12 checks.

// ALL_CORE (§5.4): every dropper, both upgraders and the ten core buildings — 24 ids.
// Gear is deliberately NOT required, so a player who skipped the coils is not locked
// out of the Chopper.
export const ALL_CORE = Object.freeze([
  "d01", "d02", "d03", "d04", "d05", "d06", "d07", "d08", "d09", "d10", "d11",
  "u1", "u2",
  "walls1", "lights", "walls3", "roof", "walls2", "aura1", "laserdoor", "aura2", "ladder", "aura3"
]);

export const PURCHASES = Object.freeze([
  // droppers — §5.3
  Object.freeze({ id: "d01", kind: "dropper", name: "Gray Dropper", cost: 0,
    requires: null, pad: [-22,0.5,44], value: 4, color: "#9e9e9e", dropZ: 30, side: -1 }),
  Object.freeze({ id: "d02", kind: "dropper", name: "White Dropper", cost: 120,
    requires: null, pad: [-22,0.5,36], value: 10, color: "#f5f5f5", dropZ: 24, side: 1 }),
  Object.freeze({ id: "d03", kind: "dropper", name: "Light Green Dropper", cost: 600,
    requires: null, pad: [-22,0.5,28], value: 24, color: "#90d970", dropZ: 18, side: -1 }),
  Object.freeze({ id: "d04", kind: "dropper", name: "Green Dropper", cost: 2500,
    requires: null, pad: [-22,0.5,20], value: 60, color: "#2e9e3f", dropZ: 12, side: 1 }),
  Object.freeze({ id: "d05", kind: "dropper", name: "Yellow Dropper", cost: 8000,
    requires: null, pad: [-22,0.5,12], value: 150, color: "#f2d024", dropZ: 6, side: -1 }),
  Object.freeze({ id: "d06", kind: "dropper", name: "Orange Dropper", cost: 40000,
    requires: null, pad: [-22,0.5,4], value: 400, color: "#f28c24", dropZ: 0, side: 1 }),
  Object.freeze({ id: "d07", kind: "dropper", name: "Red Dropper", cost: 100000,
    requires: null, pad: [-34,0.5,28], value: 900, color: "#d93025", dropZ: -6, side: -1 }),
  Object.freeze({ id: "d08", kind: "dropper", name: "Light Blue Dropper", cost: 250000,
    requires: null, pad: [-34,0.5,20], value: 2000, color: "#7fd4f2", dropZ: -12, side: 1 }),
  Object.freeze({ id: "d09", kind: "dropper", name: "Blue Dropper", cost: 600000,
    requires: null, pad: [-34,0.5,12], value: 4500, color: "#2a62d9", dropZ: -18, side: -1 }),
  Object.freeze({ id: "d10", kind: "dropper", name: "Purple Dropper", cost: 1500000,
    requires: null, pad: [-34,0.5,4], value: 10000, color: "#8a3fd9", dropZ: -24, side: 1 }),
  Object.freeze({ id: "d11", kind: "dropper", name: "Rainbow Dropper", cost: 4000000,
    requires: null, pad: [-34,0.5,-4], value: 25000, color: "RAINBOW", dropZ: -30, side: -1 }),
  // upgraders — §5.3
  Object.freeze({ id: "u1", kind: "upgrader", name: "Upgrader ×3", cost: 300,
    requires: null, pad: [-34,0.5,44], mult: 3, archZ: 20 }),
  Object.freeze({ id: "u2", kind: "upgrader", name: "Mega Upgrader ×3", cost: 15000,
    requires: null, pad: [-34,0.5,36], mult: 3, archZ: -14 }),
  // buildings — §5.4
  Object.freeze({ id: "walls1", kind: "building", name: "Back Wall", cost: 100,
    requires: null, pad: [22,0.5,44] }),
  Object.freeze({ id: "lights", kind: "building", name: "Ceiling Lights", cost: 200,
    requires: null, pad: [22,0.5,36] }),
  Object.freeze({ id: "walls3", kind: "building", name: "Front Wall", cost: 1000,
    requires: null, pad: [22,0.5,28] }),
  Object.freeze({ id: "roof", kind: "building", name: "Roof", cost: 2500,
    requires: null, pad: [22,0.5,20] }),
  Object.freeze({ id: "walls2", kind: "building", name: "Side Walls", cost: 5000,
    requires: null, pad: [22,0.5,12] }),
  Object.freeze({ id: "aura1", kind: "building", name: "Gold Aura", cost: 10000,
    requires: null, pad: [22,0.5,4] }),
  Object.freeze({ id: "laserdoor", kind: "building", name: "Boss Door", cost: 10000,
    requires: "walls3", pad: [34,0.5,44] }),
  Object.freeze({ id: "aura2", kind: "building", name: "Fire Aura", cost: 30000,
    requires: "aura1", pad: [34,0.5,36] }),
  Object.freeze({ id: "ladder", kind: "building", name: "Roof Ramp", cost: 200000,
    requires: "walls2", pad: [34,0.5,28] }),
  Object.freeze({ id: "aura3", kind: "building", name: "Rainbow Aura", cost: 250000,
    requires: "aura2", pad: [34,0.5,20] }),
  Object.freeze({ id: "helicopter", kind: "building", name: "Boss Chopper", cost: 10000000,
    requires: "ALL_CORE", pad: [34,0.5,12] }),
  Object.freeze({ id: "bossstatue", kind: "building", name: "Golden Boss Statue", cost: 250000000,
    requires: "helicopter", pad: [34,0.5,4] }),
  // gear — §5.4, with the stat overrides equipping one applies
  Object.freeze({ id: "sword", kind: "gear", name: "Boss Sword", cost: 200000,
    requires: null, pad: [46,0.5,44], walk: 16, jump: 50 }),
  Object.freeze({ id: "speedcoil", kind: "gear", name: "Speed Coil", cost: 1000000,
    requires: null, pad: [46,0.5,36], walk: 26, jump: 50 }),
  Object.freeze({ id: "gravitycoil", kind: "gear", name: "Gravity Coil", cost: 1000000,
    requires: null, pad: [46,0.5,28], walk: 16, jump: 75 }),
  Object.freeze({ id: "fusioncoil", kind: "gear", name: "Fusion Coil", cost: 20000000,
    requires: null, pad: [46,0.5,20], walk: 24, jump: 70 }),
  Object.freeze({ id: "magiccarpet", kind: "gear", name: "Magic Carpet", cost: 100000000,
    requires: null, pad: [46,0.5,12], walk: 30, jump: 110 }),
]);

const BY_ID = new Map(PURCHASES.map((p) => [p.id, p]));

// ---------------------------------------------------------------------------
// MILESTONES — spec 10 §5.11. `test(save)` reads the §3.1 save; `oofbux` is paid
// through ctx.services.economy with reason "tycoon:<id>", exactly once ever.
// ---------------------------------------------------------------------------
//
// §5.11's five rows, 385 Oofbux in total — the documentation invariant TUNING keeps.
// Cash never converts to Oofbux any other way: cash is worthless outside this Place.

export const MILESTONES = Object.freeze([
  Object.freeze({ id: "first-dropper", label: "Open for business",
    test: (save) => !!save.purchased.d02, oofbux: 10, badgeId: "tycoon.open-for-business" }),
  Object.freeze({ id: "multiplier-9", label: "×9 multiplier",
    test: (save) => !!save.purchased.u1 && !!save.purchased.u2, oofbux: 25, badgeId: "tycoon.fully-upgraded" }),
  Object.freeze({ id: "all-droppers", label: "Every dropper",
    test: (save) => ["d01","d02","d03","d04","d05","d06","d07","d08","d09","d10","d11"].every((id) => save.purchased[id]),
    oofbux: 50, badgeId: "tycoon.dropper-collector" }),
  Object.freeze({ id: "helicopter", label: "Boss Chopper",
    test: (save) => !!save.purchased.helicopter, oofbux: 100, badgeId: null }),
  Object.freeze({ id: "boss-statue", label: "Golden Boss Statue",
    test: (save) => !!save.purchased.bossstatue, oofbux: 200, badgeId: "tycoon.true-boss" }),
]);

// §5.11 CODES — matched after trim().toUpperCase(), each redeemable once. `cash` pays
// straight into the save; `boost` adds sim-seconds of 2x earnings.
export const CODES = Object.freeze([
  Object.freeze({ code: "OOF", cash: 1000, boost: 0, sfx: null, message: "+$1K — welcome, Boss!" }),
  Object.freeze({ code: "7259", cash: 10000, boost: 0, sfx: null, message: "The giant obby remembers. +$10K" }),
  Object.freeze({ code: "CRIMSON", cash: 100000, boost: 0, sfx: null, message: "The book was CRIMSON. +$100K" }),
  Object.freeze({ code: "6420", cash: 1000000, boost: 0, sfx: null, message: "You escaped the lab. +$1M" }),
  Object.freeze({ code: "BOSSMODE", cash: 0, boost: 600, sfx: null, message: "2× BOOST for 10 minutes!" }),
  Object.freeze({ code: "DUCK", cash: 5, boost: 0, sfx: "quack", message: "🦆" }),
]);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// Cash always prints with its $ and a compact magnitude suffix (§5.11's "+$1K" /
// "+$100K" messages, §5.1's pad price lines, §5.12's "$150K" pacing table). The
// suffix letters and amounts are the spec's; the single fraction digit — with a
// trailing ".0" trimmed — is this file's only free choice.
export function fmt(n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  for (const [unit, suffix] of UNITS) {
    if (a >= unit) {
      const scaled = a / unit;
      return sign + "$" + (scaled >= 100 ? String(Math.round(scaled)) : trim1(scaled)) + suffix;
    }
  }
  return sign + "$" + a;
}

const UNITS = Object.freeze([[1e9, "B"], [1e6, "M"], [1e3, "K"]]);

function trim1(v) {
  const s = v.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function getPurchase(id) {
  return BY_ID.get(id) || null;
}

// multiplier = UPGRADER_MULT ^ (owned upgraders) — §5.6 applyPurchase step 2.
export function computeMultiplier(save) {
  let owned = 0;
  for (const p of PURCHASES) {
    if (p.kind === "upgrader" && save.purchased[p.id]) owned++;
  }
  return Math.pow(TUNING.UPGRADER_MULT, owned);
}

// incomePerSec = Σ owned dropper values × multiplier / DROP_INTERVAL (§5.3).
export function computeIncome(save) {
  let sum = 0;
  for (const p of PURCHASES) {
    if (p.kind === "dropper" && save.purchased[p.id]) sum += p.value;
  }
  return (sum * computeMultiplier(save)) / TUNING.DROP_INTERVAL;
}

// PART_BUDGET_ESTIMATE — spec 10 §8's static check: place.json's parts plus the
// worst case this code can add (every purchase built, drops at the cap) must stay
// ≤ 320. Label plates go through ctx.engine.parts.addCustom, which parts.getStats()
// excludes from partCount, so they are excluded here too.
const PLACE_JSON_PARTS = 5;  // §3.4's st-* rows
const STATIC_PLOT_PARTS = 6; // belt + 2 belt walls + bin + back wall + glow ring

function partsFor(p) {
  if (p.kind === "dropper") return 4;  // pillar + body + arm + spout
  if (p.kind === "upgrader") return 3; // 2 pillars + beam
  if (p.id === "walls1") return 1;
  if (p.id === "lights") return LAYOUT.LIGHT_XZ.length;
  return 0;
}

export const PART_BUDGET_ESTIMATE =
  PLACE_JSON_PARTS +
  STATIC_PLOT_PARTS +
  PURCHASES.length + // one buy pad each
  PURCHASES.reduce((n, p) => n + partsFor(p), 0) +
  TUNING.MAX_LIVE_DROPS;
