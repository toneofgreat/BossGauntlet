// src/games/speed/scripts/crates.js — one loot table per zone. Spec 24 §5. Pure.
//
// Each zone's crate has its own rows across five rarities. A row is either Coins (the
// money that buys treadmill upgrades) or a catalogue cosmetic (granted through
// ctx.services.avatar, so no new catalogue entries — these ids already exist). The
// displayed odds are computed from the SAME weights the roll sums (rule 24:S2), so the
// panel can never lie about the drop rates. Better zones: bigger coins, rarer items.

export const RARITY = Object.freeze({
  common: { label: "Common", tint: "#9aa3b8" },
  uncommon: { label: "Uncommon", tint: "#7ac74f" },
  rare: { label: "Rare", tint: "#35a3e0" },
  epic: { label: "Epic", tint: "#6b3fa0" },
  legendary: { label: "Legendary", tint: "#f7c948" },
});

const coins = (weight, rarity, amount, icon) => ({ weight, rarity, kind: "coins", amount, icon });
const item = (weight, rarity, id, icon, note) => ({ weight, rarity, kind: "item", id, icon, note });

// Zone tables, keyed by zone key. Weights are integers; they need not sum to any round
// number — oddsText divides by the real total. Coin amounts climb steeply by zone so a
// late crate funds a real upgrade and an early one is pocket change.
export const TABLES = Object.freeze({
  grass: Object.freeze([
    coins(52, "common", 25, "🪙"),
    coins(28, "uncommon", 60, "🪙"),
    coins(12, "rare", 140, "💰"),
    item(6, "epic", "trail_bubble", "🫧", "Bubble Trail"),
    item(2, "legendary", "aura_sparkle", "✨", "Sparkle Aura"),
  ]),
  ridge: Object.freeze([
    coins(50, "common", 90, "🪙"),
    coins(30, "uncommon", 220, "🪙"),
    coins(12, "rare", 520, "💰"),
    item(6, "epic", "trail_neon", "💫", "Neon Trail"),
    item(2, "legendary", "aura_frost", "❄️", "Frost Aura"),
  ]),
  neon: Object.freeze([
    coins(48, "common", 320, "🪙"),
    coins(30, "uncommon", 780, "💰"),
    coins(13, "rare", 1800, "💰"),
    item(6, "epic", "hat_propeller", "🚁", "Propeller Hat"),
    item(3, "legendary", "trail_rainbow", "🌈", "Rainbow Trail"),
  ]),
  storm: Object.freeze([
    coins(46, "common", 1100, "💰"),
    coins(31, "uncommon", 2600, "💰"),
    coins(13, "rare", 6000, "💰"),
    item(7, "epic", "aura_storm", "🌩️", "Storm Aura"),
    item(3, "legendary", "gear_torch", "🔦", "Torch"),
  ]),
  volcano: Object.freeze([
    coins(44, "common", 3800, "💰"),
    coins(32, "uncommon", 9000, "💰"),
    coins(14, "rare", 21000, "💎"),
    item(7, "epic", "aura_ember", "🔥", "Ember Aura"),
    item(3, "legendary", "trail_fire", "🔥", "Fire Trail"),
  ]),
  light: Object.freeze([
    coins(42, "common", 13000, "💎"),
    coins(33, "uncommon", 30000, "💎"),
    coins(15, "rare", 72000, "💎"),
    item(7, "epic", "aura_void", "🌀", "Void Aura"),
    item(3, "legendary", "hat_crown", "👑", "Crown"),
  ]),
  // The two end-game crates (2026-09-13) — huge Coins and the five new auras, the Flash
  // crate holding SUPERNOVA, the best aura in the game.
  void: Object.freeze([
    coins(40, "common", 45000, "💎"),
    coins(33, "uncommon", 110000, "💎"),
    coins(15, "rare", 260000, "💎"),
    item(8, "epic", "aura_comet", "☄️", "Comet Halo"),
    item(6, "epic", "aura_inferno", "🔥", "Inferno"),
    item(4, "legendary", "aura_galaxy", "🌌", "Galaxy Swirl"),
  ]),
  // Weights sum to 1000 so the two headline drops read as exact odds: Fireheart 10%,
  // Timewarp (with the Time Hammer) 0.1%. "Beating The Flash" cracks this crate.
  flash: Object.freeze([
    coins(500, "common", 160000, "💎"),
    coins(250, "uncommon", 380000, "💎"),
    coins(140, "rare", 900000, "💎"),
    item(100, "epic", "aura_fireheart", "🔥", "Fireheart — a fiery aura (10%)"),
    item(8, "epic", "aura_prism", "🌈", "Prism Burst"),
    item(1, "legendary", "aura_timewarp", "🕰️", "TIMEWARP + the Time Hammer — a whole cosmos (0.1%)"),
    item(1, "legendary", "aura_supernova", "🌟", "SUPERNOVA"),
  ]),
  // The Big Bang (2026-09-10) — the finale past the sun. Coins are ~30x the Flash crate's,
  // and it is the hardest place in the game to reach the best aura.
  bang: Object.freeze([
    coins(38, "common", 4800000, "💎"),
    coins(33, "uncommon", 11400000, "💎"),
    coins(16, "rare", 27000000, "💎"),
    item(9, "epic", "aura_galaxy", "🌌", "Galaxy Swirl"),
    item(4, "legendary", "aura_supernova", "🌟", "SUPERNOVA — the best aura in the game"),
  ]),
});

export function tableFor(zoneKey) { return TABLES[zoneKey] || TABLES.grass; }

export function weightTotal(zoneKey) {
  return tableFor(zoneKey).reduce((a, r) => a + r.weight, 0);
}

export function oddsText(weight, total) {
  if (!weight) return "—";
  const one = Math.round(total / weight);
  return `1 in ${one}`;
}

// Seeded PRNG for the odds test (a hand-rolled LCG was wrong before — mulberry32 with a
// fixed seed is reproducible and uniform; the game passes Math.random). Spec 24 §8.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollCrate(zoneKey, rand = Math.random) {
  const table = tableFor(zoneKey);
  const total = weightTotal(zoneKey);
  let r = rand() * total;
  for (const row of table) {
    r -= row.weight;
    if (r < 0) return row;
  }
  return table[table.length - 1]; // rounding safety
}
