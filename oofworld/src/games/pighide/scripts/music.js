// src/games/pighide/scripts/music.js - the round-following soundtrack. Each tick it
// works out which of the six pighide_* engine tracks the current phase wants (and at
// what intensity) and asks the engine for it only when something changed.
//
//   lobby   pighide_lobby   (intensity 1 while the start countdown runs)
//   hide    pighide_hide    (30 s, ends on the cage release; a joiner starts mid-way)
//   seek    pighide_chase   (intensity 0 -> 1 -> 2 as the clock runs and pigs fall)
//           pighide_frenzy  (last FRENZY_AT_S seconds, or the last pig standing)
//   result  pighide_pigswin / pighide_hunterwin (an aborted round goes back to lobby)
//
// Everyone hears the phase's music whatever their role (caged hunter, caught pig,
// spectator, joiner). If something else owns the music (the boombox), this yields until
// it hands back. Sim-driven only: no timers.

import { TUNE, MUSIC } from "./config.js";

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function createMusic(ctx, S) {
  const ids = MUSIC.ids;
  const own = new Set(Object.values(ids));
  const stingers = new Set([ids.pigsWin, ids.hunterWin]);
  const busy = new Set([ids.hide, ids.chase, ids.frenzy]);
  let sentLvl = -1;
  let frenzyRn = -1;   // the round whose seek has latched into the frenzy
  let lvlRn = -1;      // the round seekLvl belongs to
  let seekLvl = 0;     // only rises within a round

  function audio() {
    const a = ctx.engine && ctx.engine.audio;
    return a && typeof a.playMusic === "function" ? a : null;
  }

  function want() {
    const clock = Number.isFinite(S.clock) ? S.clock : 0;
    const many = S.pigsTotal >= 2;
    switch (S.phase) {
      case "hide": {
        const bar = Math.floor((TUNE.HIDE_S - clock) / MUSIC.HIDE_BAR_S);
        return { id: ids.hide, lvl: 0, startBar: clamp(Number.isFinite(bar) ? bar : 0, 0, 11) };
      }
      case "seek": {
        if (clock <= MUSIC.FRENZY_AT_S || (many && S.pigsLeft === 1)) frenzyRn = S.rn;
        if (frenzyRn === S.rn) return { id: ids.frenzy, lvl: 0 };
        if (lvlRn !== S.rn) { lvlRn = S.rn; seekLvl = 0; }
        let raw = 0;
        if (clock <= MUSIC.LVL1_AT_S || (many && S.pigsLeft < S.pigsTotal)) raw = 1;
        if (clock <= MUSIC.LVL2_AT_S || (many && S.pigsLeft <= Math.ceil(S.pigsTotal / 2))) raw = 2;
        seekLvl = Math.max(seekLvl, raw);
        return { id: ids.chase, lvl: seekLvl };
      }
      case "result": {
        const reason = S.result ? S.result.reason : null;
        if (reason === "time") return { id: ids.pigsWin, lvl: 0 };
        if (reason === "hunter") return { id: ids.hunterWin, lvl: 0 };
        return { id: ids.lobby, lvl: 0 };
      }
      default:
        return { id: ids.lobby, lvl: S.startPending ? 1 : 0 };
    }
  }

  function fadeFor(from, to) {
    if (to === ids.hide) return { fadeMs: 600 };
    if (to === ids.chase) return { fadeMs: from === ids.hide ? 120 : 300 };
    if (to === ids.frenzy) return from === ids.chase ? { fadeMs: 250, sync: true } : { fadeMs: 300 };
    if (stingers.has(to)) return { fadeMs: 150 };
    if (to === ids.lobby) {
      if (stingers.has(from)) return { fadeMs: 1500 };
      if (busy.has(from)) return { fadeMs: 900 };
    }
    return {};
  }

  function update() {
    const a = audio();
    if (!a) return;
    const w = want();
    let cur = null;
    try { cur = a.currentTrack(); } catch { /* fine */ }
    if (cur && !own.has(cur)) {         // the boombox (or another owner) has the music;
      sentLvl = -1;                     // a handback restarts our track at level 0, so resend
      return;
    }
    if (cur !== w.id) {
      const o = fadeFor(cur, w.id);
      o.intensity = w.lvl;
      if (w.startBar) o.startBar = w.startBar;
      try { a.playMusic(w.id, o); } catch { /* audio is optional */ }
      sentLvl = w.lvl;
      return;
    }
    if (w.lvl !== sentLvl) {
      try { a.playMusic(w.id, { intensity: w.lvl }); } catch { /* fine */ }
      sentLvl = w.lvl;
    }
  }

  function dispose() {
    const a = audio();
    if (!a) return;
    try {
      const cur = a.currentTrack();
      if (cur && own.has(cur)) a.stopMusic({ fadeMs: 600 });
    } catch { /* fine */ }
  }

  return { update, dispose };
}
