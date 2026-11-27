// save.js - versioned localStorage save (CONTRACT 8.5). ctx.save. Runs early (after ENGINE).
export const KEY = "tnrpg.save.v1";
export const BAK = "tnrpg.save.bak";
export const VERSION = 1;

export function defaultRun(cycle = 0) {
  return {
    cycle: cycle | 0, level: 0, phase: cycle >= 1 ? "ng" : "intro",
    equip: { sword: "fists", armor: null, morph: null, crown: null, charm: null },
    owned: {}, kills: {}, villagerNoWood: 0, flags: {}, buried: {},
    deaths: 0, startedAt: 0, kingWins: 0,
  };
}
export function defaultProfile() {
  return { name: "", onlineName: "", secrets: {}, endings: {}, runs: 0, playMs: 0, signReads: 0, npcsTalked: {} };
}
export function defaultSettings() {
  return { reduceFlashing: false, master: 0.8, music: 0.7, sfx: 0.9, sensitivity: 1, invertY: false,
    pointerLock: true, quality: "auto", showFps: false, hints: true };
}

function isObj(o) { return o && typeof o === "object" && !Array.isArray(o); }
export function deepCopy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

// fill missing keys from defaults (types from defaults win when the stored one is the wrong type)
export function mergeDefaults(def, src) {
  if (!isObj(src)) return deepCopy(def);
  const out = {};
  for (const k of Object.keys(def)) {
    const d = def[k], s = src[k];
    if (s === undefined) out[k] = deepCopy(d);
    else if (isObj(d) && Object.keys(d).length) out[k] = mergeDefaults(d, s);
    else if (isObj(d)) out[k] = isObj(s) ? deepCopy(s) : {};
    else if (d === null) out[k] = s;
    else if (typeof d === typeof s) out[k] = s;
    else out[k] = deepCopy(d);
  }
  for (const k of Object.keys(src)) if (!(k in out)) out[k] = deepCopy(src[k]);
  return out;
}

// replace the contents of `target` in place (keeps references other modules hold)
function assignInPlace(target, src) {
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, src);
  return target;
}

function storage() {
  try { if (typeof localStorage !== "undefined") return localStorage; } catch (e) { /* blocked */ }
  return null;
}
function rawGet(k) { try { const s = storage(); return s ? s.getItem(k) : null; } catch (e) { return null; } }
function rawSet(k, v) { try { const s = storage(); if (s) { s.setItem(k, v); return true; } } catch (e) { /* quota / private */ } return false; }
function rawDel(k) { try { const s = storage(); if (s) s.removeItem(k); } catch (e) { /* ignore */ } }

export function runInProgress(run) {
  if (!run) return false;
  return (run.startedAt || 0) > 0 || (run.level || 0) > 0 || (run.cycle || 0) > 0 || (run.phase && run.phase !== "intro");
}

export async function init(ctx) {
  const state = ctx.state;
  const bus = ctx.bus;
  let timer = null;
  let lastWrite = 0;
  let loadedOk = false;
  let wiped = false;

  function snapshot() {
    return { v: VERSION, t: Date.now(), profile: state.profile, settings: state.settings, run: state.run,
      choiceSnapshot: state.choiceSnapshot || null };
  }

  function writeNow() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (wiped) return false;
    let json;
    try { json = JSON.stringify(snapshot()); } catch (e) { console.warn("[save] stringify", e); return false; }
    const ok = rawSet(KEY, json);
    lastWrite = Date.now();
    if (ok) { try { bus.emit("save:written", {}); } catch (e) { /* bus logs */ } }
    return ok;
  }
  function write() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; writeNow(); }, 500);
  }

  function load() {
    const raw = rawGet(KEY);
    if (!raw) return false;
    let data = null;
    try { data = JSON.parse(raw); } catch (e) { data = null; }
    if (!data || data.v !== VERSION || !isObj(data.run)) {
      rawSet(BAK, raw);
      console.warn("[save] unreadable or unknown save version; backed up to", BAK);
      return false;
    }
    assignInPlace(state.profile, mergeDefaults(defaultProfile(), data.profile));
    assignInPlace(state.settings, mergeDefaults(defaultSettings(), data.settings));
    assignInPlace(state.run, mergeDefaults(defaultRun(data.run.cycle || 0), data.run));
    if (!state.run.equip.sword) state.run.equip.sword = "fists";
    state.choiceSnapshot = isObj(data.choiceSnapshot) ? mergeDefaults(defaultRun(data.choiceSnapshot.cycle || 1), data.choiceSnapshot) : null;
    return true;
  }

  function has() {
    return runInProgress(state.run);
  }

  function newGame(cycle = 0) {
    assignInPlace(state.run, defaultRun(cycle));
    state.run.startedAt = Date.now();
    if ((cycle | 0) === 0) state.choiceSnapshot = null;
    writeNow();
  }

  function snapshotChoice() {
    state.choiceSnapshot = deepCopy(state.run);
    writeNow();
  }

  function restoreChoice() {
    if (!state.choiceSnapshot) return false;
    assignInPlace(state.run, mergeDefaults(defaultRun(state.choiceSnapshot.cycle || 1), deepCopy(state.choiceSnapshot)));
    writeNow();
    return true;
  }

  function wipe() {
    rawDel(KEY); rawDel(BAK);
    assignInPlace(state.profile, defaultProfile());
    assignInPlace(state.settings, defaultSettings());
    assignInPlace(state.run, defaultRun(0));
    state.choiceSnapshot = null;
  }

  loadedOk = load();

  // autosave triggers (CONTRACT 8.5)
  const soon = () => write();
  bus.on("level:gain", soon);
  bus.on("item:get", () => writeNow());
  bus.on("secret:found", () => writeNow());
  bus.on("zone:enter", soon);
  bus.on("story:phase", () => writeNow());
  bus.on("ending", () => writeNow());
  bus.on("milestone", soon);
  bus.on("settings:change", soon);
  bus.on("game:start", () => {
    if (!state.run.startedAt) state.run.startedAt = Date.now();
    write();
  });

  // play time + periodic autosave (real time, only while playing and not paused)
  let lastReal = -1, sinceAuto = 0;
  if (ctx.engine && ctx.engine.addSystem) {
    ctx.engine.addSystem("save", () => {
      const now = ctx.engine.realTime || 0;
      if (lastReal < 0) { lastReal = now; return; }
      let d = now - lastReal; lastReal = now;
      if (!(d > 0) || d > 1) d = Math.min(Math.max(d, 0), 1);
      if (state.rt.playing && !state.rt.paused) {
        state.profile.playMs = (state.profile.playMs || 0) + d * 1000;
        sinceAuto += d;
        if (sinceAuto >= 20) { sinceAuto = 0; writeNow(); }
      }
    }, 99);
  }

  if (typeof window !== "undefined") {
    const flush = () => { try { writeNow(); } catch (e) { /* ignore */ } };
    window.addEventListener("pagehide", flush);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
    }
    if (window.__tnrpg) {
      window.__tnrpg.wipe = () => { try { wipe(); wiped = true; rawDel(KEY); window.location.reload(); } catch (e) { console.warn("[save]", e); } return true; };
    }
  }

  return { load, write, writeNow, has, newGame, snapshotChoice, restoreChoice, wipe,
    get loaded() { return loadedOk; }, get lastWrite() { return lastWrite; } };
}
