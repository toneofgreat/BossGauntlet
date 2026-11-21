// progress.js - which levels are unlocked / beaten. Saved in localStorage; works (unsaved) without it.
const KEY = "platypus.progress.v1";
export const LEVEL_COUNT = 5;
// Levels go live on platyfy one at a time as each is finished; everywhere else (local testing) all are open.
const LIVE_RELEASED = 3;
const RELEASED = (typeof location !== "undefined" && /platyfy.com$/.test(location.hostname)) ? LIVE_RELEASED : LEVEL_COUNT;

export function createProgress() {
  const st = { unlocked: 1, beaten: [false, false, false, false, false] };
  try {
    const raw = window.localStorage.getItem(KEY);
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o.unlocked === "number") {
      st.unlocked = Math.max(1, Math.min(RELEASED, o.unlocked | 0));
      for (let i = 0; i < LEVEL_COUNT; i++) st.beaten[i] = !!(o.beaten && o.beaten[i]);
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
    reset() { st.unlocked = 1; for (let i = 0; i < LEVEL_COUNT; i++) st.beaten[i] = false; save(); },
  };
}
