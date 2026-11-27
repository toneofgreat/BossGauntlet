// stats.js - progression math (DESIGN 4.1-4.5, 4.7). Pure: no DOM, no THREE (node-importable).
import { CATALOG, computeMult, variant, isUpgrade, ownsAny } from "./items.js";

export const CYCLE = { recMul: 2, hpMul: 1.5, dmgMul: 1.4 };

// per-kind numbers. levels = base levels per kill (multiplied by MULT unless flat).
export const KINDS = {
  rat:         { name: "Small Rat",   rec: 1,      hp: 30,   levels: 1,      aggro: 6 },
  goldenRat:   { name: "Golden Rat",  rec: 1,      hp: 60,   levels: 5,      aggro: 6 },
  ratKing:     { name: "The Rat King", rec: 5,     hp: 520,  levels: 3,      boss: true },
  villager:    { name: "Villager",    rec: 50,     hp: 450,  levels: 10,     aggro: 10 },
  fydor:       { name: "Fydor",       rec: 500,    hp: 1400, levels: 50,     boss: true },
  myles:       { name: "Myles",       rec: 500,    hp: 1400, levels: 50,     boss: true },
  royalGuard:  { name: "Royal Guard", rec: 55000,  hp: 1500, levels: 500,    aggro: 10 },
  king:        { name: "The King",    rec: 100000, hp: 6000, levels: 100000, flat: true, boss: true },
  shadowGuard: { name: "Shadow Guard", rec: 100000, hp: 300, levels: 0 },
  cat:         { name: "Big Tom",     rec: 5000,   hp: 2500, levels: 1000,   boss: true },
  rookie:      { name: "Rookie",      rec: 0,      hp: 900,  levels: 100,    boss: true },
};

// thresholds (CONTRACT 8.3). c1 = cycle-1 value. type: auto (given), claim (shop), gate (requirement)
export const THRESHOLDS = [
  { id: "smelly_armor",   v: 5,       c1: 5,       type: "auto" },
  { id: "area2",          v: 50,      c1: 100,     type: "gate" },
  { id: "cheese_armor",   v: 125,     c1: 125,     type: "auto" },
  { id: "villager_morph", v: 200,     c1: 200,     type: "claim" },
  { id: "iron_armor",     v: 1000,    c1: 1000,    type: "claim" },
  { id: "area3",          v: 50000,   c1: 100000,  type: "gate" },
  { id: "kingPortal",     v: 100000,  c1: 200000,  type: "gate" },
  { id: "golden_armor",   v: 250000,  c1: 250000,  type: "claim" },
  { id: "kings_crown",    v: 1000000, c1: 1000000, type: "auto" },
];
const TH_BY_ID = {};
for (const t of THRESHOLDS) TH_BY_ID[t.id] = t;

export function need(id, cycle = 0) {
  const t = TH_BY_ID[id];
  if (!t) return 0;
  return cycle >= 1 ? t.c1 : t.v;
}
export function threshold(id) { return TH_BY_ID[id] || null; }

export function recFor(kind, cycle = 0, level = 0) {
  if (kind === "rookie") return Math.max(1, level);
  const k = KINDS[kind];
  const r = k ? k.rec : 1;
  return Math.max(1, cycle >= 1 ? r * CYCLE.recMul : r);
}
export function hpFor(kind, cycle = 0) {
  const k = KINDS[kind];
  const h = k ? k.hp : 100;
  return Math.round(cycle >= 1 ? h * CYCLE.hpMul : h);
}
export function dmgMulFor(cycle = 0) { return cycle >= 1 ? CYCLE.dmgMul : 1; }

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
// DESIGN 4.5 log-ratio power formula
export function outMul(level, rec) {
  const L = Math.max(1, level), R = Math.max(1, rec || 1);
  const r = Math.log10(L / R);
  return clamp(Math.pow(10, 0.6 * r), 0.25, 4);
}
export function inMul(level, rec) {
  const L = Math.max(1, level), R = Math.max(1, rec || 1);
  const r = Math.log10(L / R);
  return clamp(Math.pow(10, -0.6 * r), 0.25, 4);
}
export function levelsFor(base, mult, flat = false) {
  return flat ? Math.round(base) : Math.round(base * mult);
}
export const CRIT_CHANCE = 0.1;
export const CRIT_MUL = 1.5;
export const HEAVY_MUL = 2.5;
export const HEAVY_HOLD = 0.6;
export const PLAYER_IFRAMES = 0.35;
export const REGEN_DELAY = 5;
export const REGEN_RATE = 6;

export function playerDamage(weaponDmg, heavy, crit, out) {
  return weaponDmg * (heavy ? HEAVY_MUL : 1) * (crit ? CRIT_MUL : 1) * out;
}
export function damageTaken(raw, inc, dr) { return raw * inc * (1 - (dr || 0)); }

// plate colour class (DESIGN 4.5): green when you are >= 2x, red when < 0.5x, white otherwise
export function recClass(level, rec) {
  const L = Math.max(1, level);
  if (L >= rec * 2) return "green";
  if (L < rec * 0.5) return "red";
  return "white";
}

export function fmtInt(n) { return Math.round(n).toLocaleString("en-US"); }
// popups abbreviate >= 1e6 as 1.40M
export function fmtLevels(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  return fmtInt(n);
}

// ---------------------------------------------------------------------------------------------
// Pacing simulation (DESIGN 4.4). Uses the real catalog, the real MULT and the real drop rules
// (wooden sword fixed on villager kill #5, as the table assumes). Returns rows matching the table.
export function simulatePacing(cycle = 0) {
  const run = { level: 0, owned: { fists: true }, equip: { sword: "fists", armor: null, morph: null, crown: null, charm: null },
    kills: {}, flags: {} };
  const v = (id) => variant(id, cycle);
  const give = (baseId) => {
    const id = v(baseId);
    run.owned[id] = true;
    if (isUpgrade(id, run.equip)) run.equip[CATALOG[id].slot] = id;
  };
  const checkThresholds = () => {
    for (const t of THRESHOLDS) {
      if (run.flags[t.id]) continue;
      if (run.level < need(t.id, cycle)) continue;
      run.flags[t.id] = true;
      if (t.type === "auto" || t.type === "claim") give(t.id); // simulation claims immediately
    }
  };
  const kill = (kind) => {
    const k = KINDS[kind];
    const mult = computeMult(run.equip);
    const gained = levelsFor(k.levels, mult, !!k.flat);
    run.level += gained;
    const n = (run.kills[kind] || 0) + 1;
    run.kills[kind] = n;
    // drops (same rules as drops.js, deterministic)
    if (kind === "rat" && !ownsAny(run.owned, "smelly_sword")) give("smelly_sword");
    if (kind === "ratKing" && !run.flags.cheeseDrop) { run.flags.cheeseDrop = true; give("cheese_sword"); }
    if (kind === "villager" && !ownsAny(run.owned, "wooden_sword") && n === 5) give("wooden_sword");
    if ((kind === "fydor" || kind === "myles") && !run.flags.ironDrop) { run.flags.ironDrop = true; give("iron_sword"); }
    if (kind === "royalGuard" && !run.flags.goldDrop) { run.flags.goldDrop = true; give("gold_sword"); }
    if (kind === "king" && !run.flags.staffDrop) { run.flags.staffDrop = true; give("kings_staff"); }
    checkThresholds();
    return gained;
  };
  const plan = [
    { id: "smelly_armor", farm: "rat" },
    { id: "area2", farm: "ratKing" },
    { id: "cheese_armor", farm: "villager" },
    { id: "villager_morph", farm: "villager" },
    { id: "guardsRec", target: recFor("fydor", cycle), farm: "villager" },
    { id: "iron_armor", farm: "guards" },
    { id: "area3", farm: "guards" },
    { id: "royalRec", target: recFor("royalGuard", cycle), farm: "royalGuard" },
    { id: "kingPortal", farm: null },
    { id: "kingFight", farm: "king", fixed: 1 },
    { id: "golden_armor", farm: "royalGuard" },
    { id: "kings_crown", farm: "royalGuard" },
  ];
  const rows = [];
  let total = 0, guardToggle = 0;
  for (const p of plan) {
    const target = p.target != null ? p.target : need(p.id, cycle);
    const perKill = [];
    let kills = 0;
    const startLevel = run.level;
    const step = () => {
      let kind = p.farm;
      if (kind === "guards") { kind = guardToggle++ % 2 ? "myles" : "fydor"; }
      perKill.push(kill(kind));
      kills++;
    };
    if (p.fixed) { for (let i = 0; i < p.fixed; i++) step(); }
    else if (p.farm) { let guard = 0; while (run.level < target && guard++ < 10000) step(); }
    total += kills;
    rows.push({ id: p.id, threshold: target, farm: p.farm, kills, cumulative: total, startLevel, level: run.level,
      perKill, mult: computeMult(run.equip) });
  }
  return { cycle, rows, totalKills: total, finalLevel: run.level, equip: Object.assign({}, run.equip) };
}
