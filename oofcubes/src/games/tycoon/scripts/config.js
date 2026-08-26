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

// SLICE: the Boss Sword (§5.7), auras (§5.8), Boss Chopper (§5.9), Golden Boss
// Statue (§5.10) and the CODES table with its Codes panel (§5.11, §5.13) are out of
// the playable slice; the TUNING rows above are the ones those sections read
// unchanged when they land.

// ---------------------------------------------------------------------------
// PURCHASES — spec 10 §3.3 record schema, §5.2 pad grid, §5.3/§5.4 costs.
// ---------------------------------------------------------------------------
//
// SLICE: the slice ships the first rows of §5.3/§5.4 — the FREE gray dropper, one
// paid dropper, the first ×3 upgrader and two decor unlocks. The remaining 25
// records (d03-d11, u2, the walls/roof/aura/door/ramp/chopper/statue line and all
// five gear pads) are a pure append of §5.3/§5.4's rows at their §5.2 pad slots;
// no record below changes shape when they land.

export const PURCHASES = Object.freeze([
  Object.freeze({ id: "d01", kind: "dropper", name: "Gray Dropper", cost: 0,
    requires: null, pad: [-22, 0.5, 44], value: 4, color: "#9e9e9e", dropZ: 30, side: -1 }),
  Object.freeze({ id: "d02", kind: "dropper", name: "White Dropper", cost: 120,
    requires: null, pad: [-22, 0.5, 36], value: 10, color: "#f5f5f5", dropZ: 24, side: 1 }),
  Object.freeze({ id: "u1", kind: "upgrader", name: "Upgrader ×3", cost: 300,
    requires: null, pad: [-34, 0.5, 44], mult: 3, archZ: 20 }),
  Object.freeze({ id: "walls1", kind: "building", name: "Back Wall", cost: 100,
    requires: null, pad: [22, 0.5, 44] }),
  Object.freeze({ id: "lights", kind: "building", name: "Ceiling Lights", cost: 200,
    requires: null, pad: [22, 0.5, 36] }),
]);

const BY_ID = new Map(PURCHASES.map((p) => [p.id, p]));

// ---------------------------------------------------------------------------
// MILESTONES — spec 10 §5.11. `test(save)` reads the §3.1 save; `oofbux` is paid
// through ctx.services.economy with reason "tycoon:<id>", exactly once ever.
// ---------------------------------------------------------------------------
//
// SLICE: multiplier-9 (u2), all-droppers (d01-d11), helicopter and boss-statue —
// the other 375 of §5.11's 385 Oofbux — append with the purchases they test, and
// their rows in badges.js's registry (§5.11 BADGES) come with them.

export const MILESTONES = Object.freeze([
  Object.freeze({
    id: "first-dropper",
    label: "Open for business",
    test: (save) => !!save.purchased.d02,
    oofbux: 10,
    badgeId: "tycoon.open-for-business",
  }),
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
