// progress.js - which levels are unlocked / beaten, personal bests and the Level 4 show record.
// Saved in localStorage; works (unsaved) without it. Saves of every older version (5, 11 levels, no bests) load
// unchanged: missing entries read as false / 0.
const KEY = "platypus.progress.v1";
export const LEVEL_COUNT = 13;
// Levels go live on platyfy one at a time as each is finished; everywhere else (local testing) all are open.
const LIVE_RELEASED = 13;
const RELEASED = (typeof location !== "undefined" && /platyfy.com$/.test(location.hostname)) ? LIVE_RELEASED : LEVEL_COUNT;
export const L4_HARD_WINS = 5; // normal Level 4 wins that unlock hard mode

const num = (v) => (typeof v === "number" && isFinite(v) && v > 0 ? Math.floor(v) : 0);

export function createProgress() {
  const st = { unlocked: 1, beaten: new Array(LEVEL_COUNT).fill(false), best: new Array(LEVEL_COUNT).fill(0),
    l4wins: 0, l4hardWins: 0, l4bestCoins: 0, l4bestHardCoins: 0 };
  try {
    const raw = window.localStorage.getItem(KEY);
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o.unlocked === "number") {
      st.unlocked = Math.max(1, Math.min(RELEASED, o.unlocked | 0));
      for (let i = 0; i < LEVEL_COUNT; i++) st.beaten[i] = !!(o.beaten && o.beaten[i]);
      // a level beaten before the next one was released still opens it once it is
      for (let i = 0; i < LEVEL_COUNT; i++) if (st.beaten[i] && i + 2 > st.unlocked) st.unlocked = Math.min(RELEASED, i + 2);
      if (Array.isArray(o.best)) for (let i = 0; i < LEVEL_COUNT; i++) st.best[i] = num(o.best[i]);
      st.l4wins = num(o.l4wins);
      // wins from before this was counted: Level 4 beaten = 1 win
      if (o.l4wins === undefined && st.beaten[3]) st.l4wins = 1;
      st.l4hardWins = num(o.l4hardWins);
      st.l4bestCoins = num(o.l4bestCoins);
      st.l4bestHardCoins = num(o.l4bestHardCoins);
    }
  } catch (e) { /* private mode, blocked storage: play without saving */ }
  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ }
  }
  return {
    get unlocked() { return st.unlocked; },
    get beaten() { return st.beaten; },
    isUnlocked(n) { return n >= 1 && n <= st.unlocked; },
    isBeaten(n) { return !!st.beaten[n - 1]; },
    // marks level n beaten; returns the level number that this newly unlocked (0 if none)
    beat(n) {
      st.beaten[n - 1] = true;
      let un = 0;
      if (n < RELEASED && st.unlocked < n + 1) { st.unlocked = n + 1; un = n + 1; }
      save();
      return un;
    },
    unlock(n) { st.unlocked = Math.max(st.unlocked, Math.min(RELEASED, n | 0)); save(); },
    reset() {
      st.unlocked = 1;
      for (let i = 0; i < LEVEL_COUNT; i++) { st.beaten[i] = false; st.best[i] = 0; }
      st.l4wins = st.l4hardWins = st.l4bestCoins = st.l4bestHardCoins = 0;
      save();
    },
    // ---- personal bests (ms, 0 = none) ----
    best(n) { return st.best[n - 1] || 0; },
    // true when ms is a new personal best (it is then saved)
    setBest(n, ms) {
      ms = Math.round(ms);
      if (!(n >= 1 && n <= LEVEL_COUNT) || !(ms > 0)) return false;
      const b = st.best[n - 1];
      if (b && b <= ms) return false;
      st.best[n - 1] = ms;
      save();
      return true;
    },
    // ---- Level 4 ----
    get l4wins() { return st.l4wins; },
    get l4hardWins() { return st.l4hardWins; },
    get l4hardUnlocked() { return st.l4wins >= L4_HARD_WINS; },
    get l4bestCoins() { return st.l4bestCoins; },
    get l4bestHardCoins() { return st.l4bestHardCoins; },
    // returns true when this win is the one that unlocked hard mode
    addL4Win(hard) {
      const was = st.l4wins >= L4_HARD_WINS;
      if (hard) st.l4hardWins++; else st.l4wins++;
      save();
      return !was && st.l4wins >= L4_HARD_WINS;
    },
    // returns true when it is a new best for that mode
    setL4Coins(c, hard) {
      c = Math.max(0, Math.floor(c || 0));
      const k = hard ? "l4bestHardCoins" : "l4bestCoins";
      if (c <= st[k]) return false;
      st[k] = c;
      save();
      return true;
    },
  };
}
