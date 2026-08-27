// src/platform/services/badges.js — spec 07 §5.7: the badge registry, the award path
// with its 10-Oofbux bonus, and the counters that feed the thresholds.
//
// Strict by design: `award` refuses an id that is not registered rather than inventing
// one. A badge nobody can see the name of is worse than no badge, and a typo that
// silently stores a phantom id is a bug you find months later on someone's save.

import * as saves from "./saves.js";

const BADGE_AWARD_OOFBUX = 10; // §5.7.2 step 4
const PLAYTIME_FLUSH_S = 10; // §5.7.4
const ID_RE = /^[a-z][a-z0-9-]*\.[a-z0-9-]{1,32}$/;

const B = (id, name, icon, description, secret = false) => Object.freeze({
  id, name, icon, description, secret, scope: id.slice(0, id.indexOf(".")),
});

export const BADGES = Object.freeze([
  // --- platform badges (spec 07 §5.7.1), in that table's order ---
  B("oof.welcome", "Welcome Oofer", "👋", "Boot OofCubes for the first time."),
  B("oof.explorer", "Grand Tour", "🗺️", "Visit the Obby, Lifting, and Tycoon Places."),
  B("oof.frequent-flyer", "Frequent Flyer", "🚪", "Enter Places 25 times."),
  B("oof.first-oofbux", "First Oofbux", "🪙", "Earn your first Oofbux."),
  B("oof.hundredaire", "Hundredaire", "💰", "Earn 100 lifetime Oofbux."),
  B("oof.thousandaire", "Thousandaire", "💎", "Earn 1,000 lifetime Oofbux."),
  B("oof.bux-magnate", "Bux Magnate", "🏦", "Earn 10,000 lifetime Oofbux."),
  B("oof.big-spender", "Big Spender", "🛍️", "Spend 500 lifetime Oofbux."),
  B("oof.fashionista", "Fashionista", "🎩", "Buy 5 items from the Catalog."),
  B("oof.streak-3", "Regular", "📅", "Reach a 3-day login streak."),
  B("oof.streak-7", "Devoted", "🔥", "Reach a 7-day login streak."),
  B("oof.oof", "Oof.", "💀", "Die 100 times."),
  B("oof.mega-oof", "Mega Oof", "☠️", "Die 1,000 times.", true),
  B("oof.survivor", "Survivor", "🚩", "Reach 25 checkpoints."),
  B("oof.bouncer", "Bouncer", "🦘", "Launch off bounce pads 100 times."),
  B("oof.collector", "Collector", "🧲", "Grab 100 collectibles."),
  B("oof.hour-of-oof", "Hour of Oof", "⏰", "Play for 1 hour total."),
  B("oof.ten-hours", "Living Here", "🕰️", "Play for 10 hours total."),
  B("oof.badge-collector", "Badge Collector", "🏅", "Earn 10 badges."),
  B("oof.completionist", "Completionist", "👑", "Earn 30 badges.", true),
  B("oof.night-owl", "Night Owl", "🦉", "Play between midnight and 5 AM.", true),
  B("oof.early-bird", "Early Bird", "🐦", "Play between 5 and 8 AM."),
  B("demo.goal", "Demo Goal", "🧪", "Touch the gold pad in the Demo Yard.", true),

  // --- per-place badges (specs 06/08/09/10) ---
  // The one sanctioned cross-file touch: a Place's implementing task appends its rows
  // here rather than owning a registry of its own, so every badge in the platform is
  // nameable from one list — which is what the hub's badge wall reads.
  B("hub.cloudclimber", "Cloud Climber", "☁️", "Find the way up to the cloud over the plaza.", true),

  // obby (spec 08 §5.9.7) — one per difficulty conquered, plus the run itself
  B("obby.basics", "Off The Island", "🐣", "Clear the five starting stages."),
  B("obby.cake-walk", "Cake Walker", "🍰", "Clear every Cake Walk stage."),
  B("obby.effortless", "Effortless", "🍃", "Clear every Effortless stage."),
  B("obby.easy", "Easy Peasy", "🟢", "Clear every Easy stage."),
  B("obby.medium", "Medium Rare", "🟡", "Clear the Medium Tower."),
  B("obby.hard", "Hard Hat", "🟠", "Clear the Hard Tower."),
  B("obby.difficult", "Difficult Days", "🔴", "Clear the Difficult Tower."),
  B("obby.challenging", "Challenge Accepted", "🟥", "Clear the Challenging Tower."),
  B("obby.intense", "Intense Focus", "🔥", "Clear the Intense Tower."),
  B("obby.remorseless", "No Remorse", "💜", "Clear the Remorseless Tower."),
  B("obby.insane", "Certified Insane", "🔵", "Clear the Insane Tower."),
  B("obby.extreme", "Extreme Machine", "🧊", "Clear the Extreme Tower."),
  B("obby.terrifying", "Fear Is Fake", "👻", "Clear the Terrifying Tower."),
  B("obby.catastrophic", "Catastrophe Averted", "⚪", "Clear the Catastrophic Tower."),
  B("obby.nil", "Undefined Behavior", "🌫️", "Clear the NIL Tower."),
  B("obby.megadeath", "Megadeath Survivor", "💀", "Clear the Megadeath Tower."),
  B("obby.dilly", "Dilly Impossible??", "🌈", "Clear the Dilly Impossible Tower."),
  B("obby.winner", "OBBY WINNER", "🏆", "Touch the gold pad at the top of the obby."),

  // tycoon (spec 10 §5.11)
  B("tycoon.open-for-business", "Open For Business", "🏭", "Buy your first paid dropper."),
  B("tycoon.fully-upgraded", "Fully Upgraded", "✖️", "Reach the x9 multiplier."),
  B("tycoon.dropper-collector", "Dropper Collector", "🌈", "Own all 11 droppers."),
  B("tycoon.sky-boss", "Sky Boss", "🚁", "Ride the Boss Chopper."),
  B("tycoon.true-boss", "True Boss", "👑", "Build the Golden Boss Statue."),

  // lifting (spec 09 §5.12) — ids and triggers are normative (the table below); this
  // registry's job is display metadata (name/icon/description), which §5.12 explicitly
  // leaves to this file (spec 09 §9's task L5) rather than to the Place's own config.js
  // (see that file's BADGES export, which carries id + trigger only, on purpose).
  B("lifting.first-lift", "First Rep", "💪", "Make your first lift in Weight Lifting Simulator."),
  B("lifting.club-100k", "100K Club", "🏆", "Reach 100,000 Strength."),
  B("lifting.rebirth1", "Reborn", "🌀", "Complete your first Rebirth."),
  B("lifting.rebirth2", "Twice Reborn", "🌀", "Complete Rebirth 2."),
  B("lifting.rebirth3", "Thrice Reborn", "🌀", "Complete Rebirth 3."),
  B("lifting.rebirth4", "Rebirth Regular", "🌀", "Complete Rebirth 4."),
  B("lifting.rebirth5", "Rebirth Master", "🌀", "Complete Rebirth 5."),
  B("lifting.rebirth6", "Final Rebirth", "🌀", "Complete Rebirth 6, the top of the ladder."),
  B("lifting.dumbbell-multi", "Dumbbell Domination", "🏋️", "Complete the Dumbbell Zone rebirth."),
  B("lifting.gd-star", "Star Power", "⭐", "Buy the GD Star."),
  B("lifting.all-items", "Full Inventory", "🎒", "Own all 28 items."),
  B("lifting.title-rock", "The Rock", "🪨", "Unlock the title \"The Rock\"."),
  B("lifting.ghost-king", "Top Lifter", "👑", "Be rank 1 on the Top Lifters board with someone to beat."),
]);

const defsById = new Map();
let deps = null;
let emitter = null;
let bound = [];
let pendingPlayS = 0;
let started = false;

function domain() {
  return saves.getDomain("badges");
}

function progress() {
  const d = domain();
  if (!d.progress) {
    d.progress = { deaths: 0, bounces: 0, collects: 0, checkpoints: 0, placeEnters: 0, catalogBuys: 0 };
  }
  return d.progress;
}

// initBadges(deps) — deps = { ui, economy }.
export function initBadges(depsArg) {
  if (started) throw new Error("initBadges called twice");
  started = true;
  deps = depsArg || {};
  defsById.clear();
  for (const def of BADGES) defsById.set(def.id, def);
  award("oof.welcome");
  checkTimeOfDay();
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("visibilitychange", onVisible);
  }
}

function onVisible() {
  if (document.visibilityState === "visible") checkTimeOfDay();
}

// Wall clock on purpose: "play at 2am" is a calendar fact, not a sim-time one.
function checkTimeOfDay() {
  const h = new Date().getHours();
  if (h <= 4) award("oof.night-owl");
  else if (h <= 7) award("oof.early-bird");
}

// award(fullId) -> did it land this call?
export function award(badgeId) {
  const def = defsById.get(badgeId);
  if (!def) {
    console.warn("[oof] unknown badge", badgeId);
    return false;
  }
  const d = domain();
  if (d.earned[badgeId]) return false;
  d.earned[badgeId] = Date.now();
  saves.markDirty("badges");
  if (deps && deps.economy && typeof deps.economy.award === "function") {
    deps.economy.award(BADGE_AWARD_OOFBUX, "badge");
  }
  if (deps && deps.ui && typeof deps.ui.toast === "function") {
    deps.ui.toast("Badge earned: " + def.name, { icon: def.icon, duration: 4000 });
  }
  if (emitter) emitter.emit("badge:awarded", { badgeId });
  // Meta badges. Safe to recurse: the earned check above stops the second pass.
  const count = Object.keys(d.earned).length;
  if (count >= 10) award("oof.badge-collector");
  if (count >= 30) award("oof.completionist");
  return true;
}

export function has(badgeId) {
  return !!domain().earned[badgeId];
}

export function list() {
  return Object.keys(domain().earned);
}

export function getDef(badgeId) {
  return defsById.get(badgeId) || null;
}

export function checkStreak(streak) {
  if (streak >= 3) award("oof.streak-3");
  if (streak >= 7) award("oof.streak-7");
}

// The §5.7.1 trigger column as a table. Every threshold is re-tested after any counter
// moves, which is cheap and means a counter that jumps (an import, a migration) still
// pays out the badges it passed.
function checkThresholds() {
  const p = progress();
  const life = deps && deps.economy && typeof deps.economy.getLifetime === "function"
    ? deps.economy.getLifetime() : { earned: 0, spent: 0 };
  const profile = saves.getDomain("profile") || {};
  const visited = Array.isArray(profile.visitedPlaces) ? profile.visitedPlaces : [];
  const pairs = [
    ["oof.explorer", ["obby", "lifting", "tycoon"].every((s) => visited.includes(s))],
    ["oof.frequent-flyer", p.placeEnters >= 25],
    ["oof.first-oofbux", life.earned >= 1],
    ["oof.hundredaire", life.earned >= 100],
    ["oof.thousandaire", life.earned >= 1000],
    ["oof.bux-magnate", life.earned >= 10000],
    ["oof.big-spender", life.spent >= 500],
    ["oof.fashionista", p.catalogBuys >= 5],
    ["oof.oof", p.deaths >= 100],
    ["oof.mega-oof", p.deaths >= 1000],
    ["oof.survivor", p.checkpoints >= 25],
    ["oof.bouncer", p.bounces >= 100],
    ["oof.collector", p.collects >= 100],
    ["oof.hour-of-oof", (profile.totalPlayS || 0) >= 3600],
    ["oof.ten-hours", (profile.totalPlayS || 0) >= 36000],
  ];
  for (const [id, ok] of pairs) if (ok) award(id);
}

// bindEvents(emitter, slug) — re-bound on every Place transition against the fresh
// emitter, so nothing survives a Place it belonged to.
export function bindEvents(emitterArg, slug) {
  for (const off of bound) off();
  bound = [];
  emitter = emitterArg || null;
  if (!emitter) return;
  const bump = (key, n = 1) => {
    progress()[key] += n;
    saves.markDirty("badges");
    checkThresholds();
  };
  bound.push(emitter.on("place:loaded", () => {
    if (slug !== "hub" && slug !== "demo") bump("placeEnters");
    else checkThresholds();
  }));
  bound.push(emitter.on("player:died", () => bump("deaths")));
  bound.push(emitter.on("bounce:launched", () => bump("bounces")));
  bound.push(emitter.on("collectible:collected", () => bump("collects")));
  bound.push(emitter.on("checkpoint:reached", () => bump("checkpoints")));
  bound.push(emitter.on("economy:changed", (e) => {
    if (e && e.delta < 0 && typeof e.reason === "string" && e.reason.startsWith("catalog:")) {
      bump("catalogBuys");
      return;
    }
    checkThresholds();
  }));
}

// tick(dt) — playtime accrues in sim seconds and flushes in chunks, so a session does
// not mark the profile dirty sixty times a second.
export function tick(dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  pendingPlayS += dt;
  if (pendingPlayS < PLAYTIME_FLUSH_S) return;
  const profile = saves.getDomain("profile");
  if (profile) {
    profile.totalPlayS = (profile.totalPlayS || 0) + pendingPlayS;
    saves.markDirty("profile");
  }
  pendingPlayS = 0;
  checkThresholds();
}

// createCtxApi(slug) — what a Place sees. Place code passes bare local ids and this
// prefixes them with the slug, so a game can never award another game's badge.
export function createCtxApi(slug) {
  const full = (id) => (String(id).includes(".") ? String(id) : slug + "." + id);
  return Object.freeze({
    award: (id) => award(full(id)),
    has: (id) => has(full(id)),
    list: () => list(),
    // The hub's badge wall reads the whole registry; scoping would hide the badges
    // it exists to display.
    all: () => all(),
    getDef: (id) => getDef(full(id)),
  });
}

// The badge wall's read (spec 06 §5.1): every definition in registry order, each
// carrying when it was earned, or null.
export function all() {
  const earned = domain().earned;
  return BADGES.map((def) => ({ ...def, earned: earned[def.id] || null }));
}

export const REGISTRY_ID_RE = ID_RE;
