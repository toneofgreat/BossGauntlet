// src/games/speed/scripts/config.js — Speed Simulator's numbers and pure helpers.
// Spec 24 §3/§4/§6. Pure data + pure functions: no imports, no DOM, no ctx, so
// tools/validate.js can run the real mapping and the real economy curve (rule 24:S1).

// The world run-speed the engine can actually apply tops out at 100 (physics.setWalkSpeed
// clamps there). The Speed STAT grows without limit — it is the HUD number and what the
// Keepers' speeds are compared against — but it is MAPPED to a run-speed that stays well
// under the cap, with diminishing returns, so a bigger number always helps a little and
// never slams into the ceiling.
export const BASE_WALK = 16;   // a standing start, before any training
export const WALK_MAX = 64;    // the fastest legs the mapping will ever grant (< 100 cap)
export const SPEED_SCALE = 50; // how much stat one "doubling" of the log is worth

// Running Shoes widen the gap the stat buys: level 0 barely helps, level 10 is a sprint.
export function shoeFactor(shoes) { return 6 + Math.max(0, Math.min(10, shoes | 0)) * 1.4; }

// stat -> world run-speed (studs/sec). Monotonic in `speed`, asymptotic to WALK_MAX.
export function walkFor(speed, shoes) {
  const s = Math.max(0, Number(speed) || 0);
  const w = BASE_WALK + shoeFactor(shoes) * Math.log2(1 + s / SPEED_SCALE);
  return Math.max(BASE_WALK, Math.min(WALK_MAX, w));
}

// The smallest stat whose run-speed BEATS a keeper by `margin` — used for the "you need
// about N speed" gate text and the reachability test. Inverts walkFor at fixed shoes.
export function speedToBeat(keeperSpeed, shoes, margin = 2) {
  const factor = shoeFactor(shoes);
  const target = keeperSpeed + margin - BASE_WALK;
  if (target <= 0) return 0;
  return Math.ceil((Math.pow(2, target / factor) - 1) * SPEED_SCALE);
}

// Treadmill gain: motor level lifts stat-per-second while you run on it.
export function gainPerSec(motor) { return 8 + Math.max(0, Math.min(10, motor | 0)) * 6; }

export const AUTO_RUN_COST = 2000; // Coins; one-time, then the treadmill runs itself

// Upgrade cost curves (Coins). Level is the CURRENT level being bought (0 -> 1 etc.).
export function motorCost(level) { return Math.round(50 * Math.pow(1.8, level)); }
export function shoesCost(level) { return Math.round(70 * Math.pow(1.85, level)); }
export const MOTOR_MAX = 10;
export const SHOES_MAX = 10;

// The six zones, entrance to finish. `keeper` is how fast that zone's Keeper runs
// (studs/sec, all < WALK_MAX so every one is beatable with enough training + shoes).
// `firstReachOofbux` is paid ONCE, ever, the first time you touch that zone's crate.
export const ZONES = Object.freeze([
  Object.freeze({ key: "grass", name: "Grassy Track", icon: "🌱", keeper: 24, firstReachOofbux: 40, color: "#4f9e3f", sky: "#8fce7a" }),
  Object.freeze({ key: "ridge", name: "Windy Ridge", icon: "🌬️", keeper: 31, firstReachOofbux: 80, color: "#8bd0e6", sky: "#bfe6f2" }),
  Object.freeze({ key: "neon", name: "Neon City", icon: "🌆", keeper: 38, firstReachOofbux: 140, color: "#b64bd6", sky: "#2a1140" }),
  Object.freeze({ key: "storm", name: "Storm Flats", icon: "⛈️", keeper: 45, firstReachOofbux: 220, color: "#5866a8", sky: "#3a4363" }),
  Object.freeze({ key: "volcano", name: "Volcano Rim", icon: "🌋", keeper: 52, firstReachOofbux: 340, color: "#e0562f", sky: "#5a2418" }),
  Object.freeze({ key: "light", name: "Lightspeed Gate", icon: "✨", keeper: 59, firstReachOofbux: 500, color: "#ffd93d", sky: "#101018" }),
]);

// A crate you have reached goes on cooldown so a zone is a repeatable grind, not a
// one-tap infinite faucet. Session-only (not saved): wall-clock is not in the save API.
export const CRATE_COOLDOWN_S = 18;

export function fmt(n) {
  n = Math.floor(Number(n) || 0);
  if (n < 1000) return String(n);
  const units = ["", "K", "M", "B", "T", "Qa", "Qi"];
  let u = 0;
  while (n >= 1000 && u < units.length - 1) { n /= 1000; u++; }
  return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.floor(n)) + units[u];
}
