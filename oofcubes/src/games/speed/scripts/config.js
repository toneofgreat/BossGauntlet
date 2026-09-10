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
  // The two end-game areas (added 2026-09-13). The Void is a vast dark expanse far past
  // the last gate; the Flash is bigger still — the ultimate. Both need top treadmills,
  // shoes and buffs (their Keepers run faster than base pace, so a pace buff is required).
  Object.freeze({ key: "void", name: "The Void", icon: "🕳️", keeper: 68, firstReachOofbux: 700, color: "#2a1a4a", sky: "#05030f" }),
  Object.freeze({ key: "flash", name: "The Flash Zone", icon: "🌟", keeper: 80, firstReachOofbux: 1000, color: "#ffe23a", sky: "#fffbe0" }),
  // Past the sun: THE finale (added 2026-09-10). The Big Bang — a blinding singularity
  // erupting into newborn rainbow galaxies, and a Keeper at the very edge of what is
  // beatable. Its crate pays ~30x the Flash's Coins. (A literal "15x the sun Keeper"
  // would be ~1200 studs/sec — utterly unbeatable, since the engine caps run-pace near
  // 100 [WALK_MAX_BUFFED 92]; so its Keeper is instead the fastest a run can still out-pace
  // at max shoes + the best pace buff. Same honesty as §12's capped 100x/25x lengths.)
  Object.freeze({ key: "bang", name: "The Big Bang", icon: "💥", keeper: 90, firstReachOofbux: 1500, color: "#ff5ccb", sky: "#12001a" }),
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

// ---------------------------------------------------------------------------------
// Treadmills (spec 24 §4, expanded 2026-09-11). Seventeen tiers in the owner's order,
// rusty up to the LIGHTNING treadmill at the top. Each multiplies how fast the belt
// trains you (`gain`) and costs steeply more (Coins). You always own `rusty`; the rest
// are bought at the shop. `belt`/`stripe`/`rail`/`mat`/`glow` drive the look in
// layout.js so every tier is visibly a different, better machine.
// ---------------------------------------------------------------------------------
export const TREADMILLS = Object.freeze([
  Object.freeze({ id: "rusty",    name: "Rusty Treadmill",       gain: 1.0,  cost: 0,        belt: "#5a4a3a", stripe: "#3a2f24", rail: "#6b5a45", mat: "metal",   glow: null }),
  Object.freeze({ id: "dirt",     name: "Dirt Treadmill",        gain: 1.4,  cost: 400,      belt: "#6b4a2c", stripe: "#4a3320", rail: "#7a5a3a", mat: "plastic", glow: null }),
  Object.freeze({ id: "wooden",   name: "Wooden Treadmill",      gain: 1.9,  cost: 1400,     belt: "#8a5a34", stripe: "#5f3d20", rail: "#a06a3a", mat: "wood",    glow: null }),
  Object.freeze({ id: "metal",    name: "Metal Treadmill",       gain: 2.6,  cost: 4200,     belt: "#7d8694", stripe: "#565d70", rail: "#9aa3b8", mat: "metal",   glow: null }),
  Object.freeze({ id: "stone",    name: "Stone Treadmill",       gain: 3.5,  cost: 12000,    belt: "#5c6478", stripe: "#3b4152", rail: "#8a93a6", mat: "plastic", glow: null }),
  Object.freeze({ id: "dplate",   name: "Diamond-Plate Treadmill", gain: 4.8, cost: 34000,   belt: "#9aa3b8", stripe: "#6b7386", rail: "#c7cdd9", mat: "metal",   glow: null }),
  Object.freeze({ id: "gold",     name: "Gold Treadmill",        gain: 6.5,  cost: 95000,    belt: "#e0b23a", stripe: "#9c7a12", rail: "#f5cd30", mat: "metal",   glow: "#ffd93d" }),
  Object.freeze({ id: "diamond",  name: "Diamond Treadmill",     gain: 8.8,  cost: 260000,   belt: "#59d6e6", stripe: "#2a9fb5", rail: "#bff2fa", mat: "glass",   glow: "#7af0ff" }),
  Object.freeze({ id: "cherry",   name: "Cherry Treadmill",      gain: 12,   cost: 700000,   belt: "#e86a9c", stripe: "#b03c6c", rail: "#ffc0d8", mat: "wood",    glow: "#ff9ec8" }),
  Object.freeze({ id: "speedster", name: "Speedster Treadmill",  gain: 16,   cost: 1.9e6,    belt: "#2f7fff", stripe: "#1a4fbf", rail: "#8fc0ff", mat: "neon",    glow: "#40a0ff" }),
  Object.freeze({ id: "hacker",   name: "Hacker Treadmill",      gain: 22,   cost: 5.2e6,    belt: "#0f1a10", stripe: "#1f8f2a", rail: "#3ddc84", mat: "neon",    glow: "#3ddc84" }),
  Object.freeze({ id: "devil",    name: "Devil Treadmill",       gain: 30,   cost: 1.4e7,    belt: "#1b0e0e", stripe: "#c0281a", rail: "#ff5a2f", mat: "lava",    glow: "#ff3a1a" }),
  Object.freeze({ id: "heavenly", name: "Heavenly Treadmill",    gain: 41,   cost: 3.8e7,    belt: "#fbf6e8", stripe: "#e6cf7a", rail: "#fff4c0", mat: "neon",    glow: "#fff0b0" }),
  Object.freeze({ id: "godly",    name: "Godly Treadmill",       gain: 56,   cost: 1.0e8,    belt: "#ffe58a", stripe: "#e0a622", rail: "#fffbe0", mat: "neon",    glow: "#ffd93d" }),
  Object.freeze({ id: "tornado",  name: "Tornado Treadmill",     gain: 76,   cost: 2.8e8,    belt: "#7d8fb0", stripe: "#4a5a80", rail: "#c9d6f0", mat: "neon",    glow: "#a0c0ff" }),
  Object.freeze({ id: "flash",    name: "Flash Treadmill",       gain: 103,  cost: 7.6e8,    belt: "#ffe23a", stripe: "#c0a012", rail: "#fff59e", mat: "neon",    glow: "#ffee00" }),
  Object.freeze({ id: "lightning", name: "Lightning Treadmill",  gain: 140,  cost: 2.1e9,    belt: "#3a5cff", stripe: "#e8f0ff", rail: "#bfd4ff", mat: "neon",    glow: "#7ab0ff" }),
]);
export function treadmillById(id) { return TREADMILLS.find((t) => t.id === id) || TREADMILLS[0]; }
export function treadmillIndex(id) { const i = TREADMILLS.findIndex((t) => t.id === id); return i < 0 ? 0 : i; }

// ---------------------------------------------------------------------------------
// Buffs / abilities (spec 24 §9, added 2026-09-11). Ten commons, five rares that are
// "kinda OP", three godlies that are OP — dropped from crates at 30% / 5% / 0.5%. You
// equip at most THREE (never while a Keeper is chasing you). Each carries multipliers
// that stack multiplicatively while equipped:
//   train — Speed gained on the belt · pace — run-speed (helps beat Keepers)
//   coin  — crate Coins · luck — chance of a buff drop · keeperSlow — Keepers run slower
// `look` is a two-tone [core, glow] for the detailed icon drawn in the bottom bar.
// ---------------------------------------------------------------------------------
export const BUFF_RARITY = Object.freeze({
  common: { label: "Common", tint: "#7ac74f", chance: 0.30 },
  rare: { label: "Rare", tint: "#35a3e0", chance: 0.05 },
  godly: { label: "Godly", tint: "#f7c948", chance: 0.005 },
});

const buff = (id, name, rarity, icon, eff, look, blurb) => Object.freeze({ id, name, rarity, icon, eff: Object.freeze(eff), look, blurb });

export const BUFFS = Object.freeze([
  // ---- 10 commons (small, friendly boosts) ----
  buff("c_boots", "Swift Boots", "common", "👟", { pace: 1.10 }, ["#7ac74f", "#c8f0a8"], "Light on your feet: +10% pace."),
  buff("c_energy", "Energy Drink", "common", "🥤", { train: 1.15 }, ["#e0562f", "#ffb37a"], "+15% Speed gained on the belt."),
  buff("c_coin", "Lucky Coin", "common", "🪙", { coin: 1.15 }, ["#e0b23a", "#fff0a0"], "+15% Coins from crates."),
  buff("c_magnet", "Coin Magnet", "common", "🧲", { coin: 1.12 }, ["#d94436", "#ffb0a8"], "+12% Coins from crates."),
  buff("c_feather", "Feather", "common", "🪶", { pace: 1.08 }, ["#c7cdd9", "#ffffff"], "+8% pace, weightless."),
  buff("c_spark", "Spark Plug", "common", "🔌", { train: 1.12 }, ["#f5cd30", "#fff59e"], "+12% training speed."),
  buff("c_clover", "Clover", "common", "🍀", { luck: 1.20 }, ["#37a04c", "#9ee0a8"], "+20% chance of a buff drop."),
  buff("c_wind", "Tailwind", "common", "🌬️", { pace: 1.09 }, ["#8bd0e6", "#d8f2fa"], "+9% pace on a good breeze."),
  buff("c_gears", "Oiled Gears", "common", "⚙️", { train: 1.13 }, ["#8a93a6", "#d0d6e0"], "+13% training speed."),
  buff("c_piggy", "Piggy Bank", "common", "🐷", { coin: 1.18 }, ["#ff9ec8", "#ffd0e4"], "+18% Coins from crates."),
  // ---- 5 rares (kinda OP) ----
  buff("r_rocket", "Rocket Skates", "rare", "🚀", { pace: 1.45 }, ["#35a3e0", "#bff2fa"], "+45% pace — leave Keepers behind."),
  buff("r_goldmine", "Gold Mine", "rare", "⛏️", { coin: 1.6 }, ["#e0b23a", "#fff0a0"], "+60% Coins from every crate."),
  buff("r_fortune", "Fortune Idol", "rare", "🔮", { luck: 2.2 }, ["#6b3fa0", "#d0b0ff"], "×2.2 buff-drop chance."),
  buff("r_turbo", "Turbo Core", "rare", "🌀", { train: 1.7 }, ["#2f7fff", "#a0c8ff"], "+70% training speed."),
  buff("r_phantom", "Phantom Cloak", "rare", "👻", { keeperSlow: 0.30 }, ["#5c6478", "#c9d6f0"], "Keepers run 30% slower at you."),
  // ---- 3 godlies (OP, and they look amazing) ----
  buff("g_flash", "The Flash", "godly", "⚡", { pace: 2.4, keeperSlow: 0.15 }, ["#ffe23a", "#fff7c0"], "×2.4 pace. Nothing catches you."),
  buff("g_midas", "Midas Heart", "godly", "💛", { coin: 3.0, luck: 1.5 }, ["#ffd93d", "#fffbe0"], "×3 Coins and ×1.5 luck. Everything is gold."),
  buff("g_destiny", "Destiny", "godly", "🌟", { luck: 3.0, keeperSlow: 0.45, train: 1.5 }, ["#7ab0ff", "#e8f0ff"], "×3 luck, half-speed Keepers, +50% training."),

  // ---- 10 more commons (added 2026-09-13) ----
  buff("c_skate", "Roller Skate", "common", "🛼", { pace: 1.11 }, ["#35a3e0", "#bff2fa"], "+11% pace."),
  buff("c_coffee", "Espresso", "common", "☕", { train: 1.14 }, ["#6b4423", "#c8946a"], "+14% training speed."),
  buff("c_ticket", "Golden Ticket", "common", "🎫", { coin: 1.14 }, ["#e0b23a", "#fff0a0"], "+14% Coins from crates."),
  buff("c_horse", "Lucky Horse", "common", "🐴", { luck: 1.18 }, ["#8c5a3c", "#d9b48f"], "+18% buff-drop chance."),
  buff("c_wing", "Wing Pin", "common", "🪽", { pace: 1.09 }, ["#c7cdd9", "#ffffff"], "+9% pace."),
  buff("c_battery", "Battery", "common", "🔋", { train: 1.12 }, ["#37a04c", "#9ee0a8"], "+12% training speed."),
  buff("c_ring", "Gold Ring", "common", "💍", { coin: 1.16 }, ["#e0b23a", "#fff0a0"], "+16% Coins from crates."),
  buff("c_star2", "Wishing Star", "common", "⭐", { luck: 1.15 }, ["#f5cd30", "#fff59e"], "+15% buff-drop chance."),
  buff("c_kite", "Kite", "common", "🪁", { pace: 1.08 }, ["#e0245e", "#ffb0c8"], "+8% pace on the breeze."),
  buff("c_bell", "Coin Bell", "common", "🔔", { coin: 1.13 }, ["#e0b23a", "#fff0a0"], "+13% Coins from crates."),
  // ---- 5 more rares ----
  buff("r_jet", "Jet Pack", "rare", "🛩️", { pace: 1.5 }, ["#35a3e0", "#bff2fa"], "+50% pace."),
  buff("r_vault", "Bank Vault", "rare", "🏦", { coin: 1.7 }, ["#e0b23a", "#fff0a0"], "+70% Coins from crates."),
  buff("r_charm", "Evil-Eye Charm", "rare", "🧿", { luck: 2.4 }, ["#2f7fff", "#a0c8ff"], "×2.4 buff-drop chance."),
  buff("r_reactor", "Reactor Core", "rare", "☢️", { train: 1.8 }, ["#37a04c", "#c8f0a8"], "+80% training speed."),
  buff("r_wraith", "Wraith Veil", "rare", "🫥", { keeperSlow: 0.32 }, ["#5c6478", "#c9d6f0"], "Keepers run 32% slower at you."),
  // ---- 1 more godly ----
  buff("g_cosmos", "Cosmos", "godly", "🌌", { coin: 3.5, luck: 2.0, pace: 1.4 }, ["#6b3fa0", "#d0b0ff"], "×3.5 Coins, ×2 luck, +40% pace. The universe on your side."),
]);
export function buffById(id) { return BUFFS.find((b) => b.id === id) || null; }
export const MAX_EQUIPPED = 3;

// A crate's buff roll (spec 24 §9). One draw, biased by `luck`: godly band first, then
// rare, then common, else nothing. Returns a buff or null.
export function rollBuff(luck = 1, rand = Math.random) {
  const gC = BUFF_RARITY.godly.chance * luck;
  const rC = BUFF_RARITY.rare.chance * luck;
  const cC = BUFF_RARITY.common.chance * luck;
  const r = rand();
  let pool = null;
  if (r < gC) pool = "godly";
  else if (r < gC + rC) pool = "rare";
  else if (r < gC + rC + cC) pool = "common";
  if (!pool) return null;
  const options = BUFFS.filter((b) => b.rarity === pool);
  return options[Math.floor(rand() * options.length) % options.length];
}

// The combined effect of a set of equipped buff ids — multipliers multiply, keeperSlow
// adds and is capped at 0.85 so a Keeper is never fully frozen.
export function combinedEffect(equippedIds) {
  const e = { train: 1, pace: 1, coin: 1, luck: 1, keeperSlow: 0 };
  for (const id of equippedIds || []) {
    const b = buffById(id);
    if (!b) continue;
    if (b.eff.train) e.train *= b.eff.train;
    if (b.eff.pace) e.pace *= b.eff.pace;
    if (b.eff.coin) e.coin *= b.eff.coin;
    if (b.eff.luck) e.luck *= b.eff.luck;
    if (b.eff.keeperSlow) e.keeperSlow = Math.min(0.85, e.keeperSlow + b.eff.keeperSlow);
  }
  return e;
}

// Run-pace with a buff pace multiplier. Buffed pace may exceed the base WALK_MAX (so a
// pace buff really does out-run a fast Keeper) but is still capped under the engine's
// hard 100 ceiling.
export const WALK_MAX_BUFFED = 92;
export function walkForBuffed(speed, shoes, paceMult) {
  return Math.min(WALK_MAX_BUFFED, walkFor(speed, shoes) * (paceMult || 1));
}

// ---------------------------------------------------------------------------------
// Special ABILITIES (spec 24 §11, added 2026-09-12). Five active, triggered powers you
// activate with the on-screen ⚡ button, each on its own cooldown. Dropped from crates at
// ABILITY_DROP (1%) — rare and exciting. You equip ONE at a time. Unlike buffs (passive
// multipliers), these fire on demand: freeze the Keepers chasing you, blink to safety,
// drop a decoy, or jinx nearby players. `look` is the two-tone for the badge.
// ---------------------------------------------------------------------------------
export const ABILITY_DROP = 0.01; // 1% per crate crack
export const ABILITIES = Object.freeze([
  Object.freeze({ id: "a_freeze", name: "Boss Freeze", icon: "❄️", look: ["#35a3e0", "#d0f2ff"], cooldownS: 300, kind: "freeze", durS: 4,
    blurb: "Freeze EVERY chasing Keeper solid for 4 seconds. 5-min cooldown." }),
  Object.freeze({ id: "a_shock", name: "Shockwave", icon: "⚡", look: ["#f5cd30", "#fff59e"], cooldownS: 300, kind: "shock", radius: 24, durS: 3,
    blurb: "Stun every Keeper near you for 3 seconds. 5-min cooldown." }),
  Object.freeze({ id: "a_blink", name: "Blink", icon: "💨", look: ["#7ac74f", "#d8f5c8"], cooldownS: 180, kind: "blink", dist: 28,
    blurb: "Dash 28 studs toward safety in a blink. 3-min cooldown." }),
  Object.freeze({ id: "a_decoy", name: "Hologram Decoy", icon: "🪞", look: ["#6b3fa0", "#d0b0ff"], cooldownS: 240, kind: "decoy", durS: 5,
    blurb: "Leave a decoy the Keepers chase for 5 seconds. 4-min cooldown." }),
  Object.freeze({ id: "a_jinx", name: "Jinx", icon: "😵", look: ["#e0245e", "#ffb0c8"], cooldownS: 240, kind: "jinx", radius: 18, durS: 2,
    blurb: "Stun nearby PLAYERS for 2 seconds — and rattle the Keepers. 4-min cooldown." }),
]);
export function abilityById(id) { return ABILITIES.find((a) => a.id === id) || null; }

export function rollAbility(luck = 1, rand = Math.random) {
  if (rand() < ABILITY_DROP * luck) return ABILITIES[Math.floor(rand() * ABILITIES.length) % ABILITIES.length];
  return null;
}
