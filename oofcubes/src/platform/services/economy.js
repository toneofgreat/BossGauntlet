// src/platform/services/economy.js — the single Oofbux ledger: award/spend with
// per-source rolling rate caps, a transaction ring buffer, the onChange platform
// subscription, the collectible:collected payout bridge, and the ctx-facing API.
// Spec 07 §5.5-§5.6. Imports only from ./saves.js (spec 07 §4) — every mutation goes
// through saves.getDomain("economy")/markDirty so persistence stays saves.js's alone.

import { getDomain, markDirty } from "./saves.js";

// ---- tuning constants, spec 07 §6 (the single source for these numbers) ----
const MAX_BALANCE = 1000000000;
const MAX_AWARD_PER_CALL = 100000;
const TX_LOG_MAX = 50;
const CAP_WINDOW_S = 60;

// SOURCE_CAPS — spec 07 §6, exported/frozen. Max Oofbux per rolling CAP_WINDOW_S
// window per source token; null = uncapped.
export const SOURCE_CAPS = Object.freeze({
  "*": 100,
  start: null,
  daily: null,
  badge: null,
  import: null,
  smoke: null,
  collectible: 120,
  hub: 60,
  demo: 50,
  obby: 1200,
  studio: null,
  lifting: 900,
  tycoon: 1200,
});

const REASON_RE = /^[a-z][a-z0-9:._-]*$/;

function validateAmount(amount) {
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AWARD_PER_CALL) {
    throw new TypeError("bad Oofbux amount: " + amount);
  }
}

function validateReason(reason) {
  if (typeof reason !== "string" || reason.length === 0 || reason.length > 64 || !REASON_RE.test(reason)) {
    throw new TypeError("bad reason: " + reason);
  }
}

function sourceToken(reason) {
  const i = reason.indexOf(":");
  return i === -1 ? reason : reason.slice(0, i);
}

// Spec 07 §5.5: "cap = SOURCE_CAPS[token] ?? SOURCE_CAPS['*']" as literally written
// would collapse every explicitly-null (uncapped) token — start/daily/badge/import/
// smoke/studio — back down to the default 100 cap, because `??` treats `null` as
// nullish exactly like `undefined`. That contradicts the same section's own stated
// semantics ("null = uncapped") one paragraph earlier. Implemented here with an
// explicit key-presence check instead, which is the only reading consistent with
// "null = uncapped": an *unlisted* token falls back to SOURCE_CAPS["*"], a token
// explicitly mapped to null stays uncapped. Reported as a spec defect (see task
// output) rather than reproduced.
function capFor(token) {
  return Object.prototype.hasOwnProperty.call(SOURCE_CAPS, token) ? SOURCE_CAPS[token] : SOURCE_CAPS["*"];
}

// ---- module state (private) ---------------------------------------------------------
let eco = null;
let initialized = false;
const changeSubs = new Set(); // fn({ balance, delta, reason })
let emitter = null;
const capState = new Map(); // sourceToken -> { windowStart, windowTotal, warned }
let deps = null; // { ui } | null

// initEconomy(deps) — spec 07 §5.5. deps = { ui } (ui may be absent in unit tests).
// Idempotent guard: a second call is a double-boot bug.
export function initEconomy(depsArg) {
  if (initialized) throw new Error("economy already initialized");
  initialized = true;
  deps = depsArg || null;
  eco = getDomain("economy");
}

export function getBalance() {
  return eco.balance;
}

export function canAfford(amount) {
  validateAmount(amount);
  return eco.balance >= amount;
}

// award(amount, reason) -> newBalance — spec 07 §5.5 / spec 04 §5.7.
export function award(amount, reason) {
  validateAmount(amount);
  validateReason(reason);

  const token = sourceToken(reason);
  const cap = capFor(token);

  let granted;
  if (cap !== null) {
    const now = performance.now() / 1000;
    let state = capState.get(token);
    if (!state || now - state.windowStart >= CAP_WINDOW_S) {
      state = { windowStart: now, windowTotal: 0, warned: false };
      capState.set(token, state);
    }
    const allowed = cap - state.windowTotal;
    granted = Math.max(0, Math.min(amount, allowed));
    if (granted < amount && !state.warned) {
      console.warn("[oof] economy rate cap", token, "granted", granted, "of", amount);
      state.warned = true;
    }
    state.windowTotal += granted;
  } else {
    granted = amount;
  }

  if (granted === 0) return eco.balance;

  granted = Math.min(granted, MAX_BALANCE - eco.balance);
  if (granted === 0) return eco.balance;

  eco.balance += granted;
  if (reason !== "start" && reason !== "import") {
    eco.lifetimeEarned += granted;
  }

  eco.log.push({ t: Date.now(), type: "award", amount: granted, reason, balance: eco.balance });
  if (eco.log.length > TX_LOG_MAX) eco.log.splice(0, eco.log.length - TX_LOG_MAX);
  markDirty("economy");

  notify({ balance: eco.balance, delta: granted, reason });
  return eco.balance;
}

// spend(amount, reason) -> bool — spec 07 §5.5. Sinks are never rate-capped.
export function spend(amount, reason) {
  validateAmount(amount);
  validateReason(reason);
  if (eco.balance < amount) return false;

  eco.balance -= amount;
  eco.lifetimeSpent += amount;
  eco.log.push({ t: Date.now(), type: "spend", amount, reason, balance: eco.balance });
  if (eco.log.length > TX_LOG_MAX) eco.log.splice(0, eco.log.length - TX_LOG_MAX);
  markDirty("economy");

  notify({ balance: eco.balance, delta: -amount, reason });
  return true;
}

function notify(payload) {
  for (const fn of changeSubs) {
    try {
      fn(payload);
    } catch (err) {
      console.error("[oof] economy onChange subscriber error", err);
    }
  }
  if (emitter) emitter.emit("economy:changed", payload);
}

export function getTransactions() {
  return structuredClone(eco.log);
}

export function getLifetime() {
  return { earned: eco.lifetimeEarned, spent: eco.lifetimeSpent };
}

// onChange(fn) -> unsub — platform-side subscription that survives Place transitions
// (the HUD Oofbux chip uses this; ctx.events dies per Place).
export function onChange(fn) {
  changeSubs.add(fn);
  return () => changeSubs.delete(fn);
}

// bindEvents(emitter, slug) — spec 07 §5.5: the collectible payout bridge. This is the
// SOLE path by which the engine's collectible behavior turns into Oofbux — the engine
// only emits collectible:collected (spec 04 §5.2), never imports platform code.
export function bindEvents(emitterArg, slug) {
  emitter = emitterArg;
  if (emitter && typeof emitter.on === "function") {
    emitter.on("collectible:collected", (payload) => {
      if (payload && payload.kind === "oofbux") {
        award(payload.value, `collectible:${slug}`);
      }
    });
  }
}

// createCtxApi() -> ctx.services.economy — spec 04 §5.7 (note the ctx member name is
// `balance`, not `getBalance`).
export function createCtxApi() {
  return Object.freeze({ balance: getBalance, canAfford, award, spend });
}

// claimDaily() -> { claimed, amount?, streak? } — spec 07 §5.6.
// SLICE: the daily login-streak reward (escalating Oofbux bonus, lastClaimDay/streak
// bookkeeping, the "Daily reward +N Oofbux (day N)" toast) is deferred — SLICE.md's
// "Badges / daily / save codes" row scopes the slice to economy+saves' single-device
// loop, not the return-visit hook. Always reporting no claim keeps shell's boot wiring
// (spec 07 §5.9 step 5, `if (d.claimed) badges.checkStreak(d.streak)`) a safe no-op
// until this is filled in from spec 07 §5.6's algorithm.
export function claimDaily() {
  return { claimed: false };
}
