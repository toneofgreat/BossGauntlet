// STORY module (CONTRACT 9): run flow (beginRun / startCycle / remember), phases, dialogue, objective director,
// secrets registry, ending state machine, story interactables. ctx.story = the api returned by init.
import { phaseIndex, isPhase, isLegalTransition, normalizeResume, cycleStartPhase } from "./phases.js";
import { SECRET_TOTAL, secretDef, countFound, listSecrets } from "./secrets.js";
import { createDirector } from "./objectives.js";
import { createDialogue } from "./dialogue.js";
import { createEndings, ENDING_IDS } from "./endings.js";
import { createProps } from "./props.js";
import { PROPS, TIPS, SPEAKERS, PITCH } from "./lines.js";

const POST_KING = phaseIndex("postKing"), AREA2 = phaseIndex("area2"), AREA3 = phaseIndex("area3");
// zones that are only reachable after crossing the bridge
const PAST_BRIDGE = { ratField: 1, ratKing: 1, gate2: 1, village: 1, barn: 1, guardPost: 1, gate3: 1, castle: 1, throne: 1 };

function clone(o) { return o === undefined || o === null ? o : JSON.parse(JSON.stringify(o)); }
function defaultRun(cycle) {
  return { cycle, level: 0, phase: cycleStartPhase(cycle),
    equip: { sword: "fists", armor: null, morph: null, crown: null, charm: null },
    owned: {}, kills: {}, villagerNoWood: 0, flags: {}, buried: {}, deaths: 0, startedAt: Date.now(), kingWins: 0 };
}
function withTimeout(p, ms) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("timeout")), ms);
    Promise.resolve(p).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}
function warn(e) { console.warn("[story]", e); }

export async function init(ctx) {
  const bus = ctx.bus, state = ctx.state;
  const story = {};
  let started = false;        // a game:start was emitted in this page session
  let launching = false;
  let rememberMode = false;

  const director = createDirector(ctx, story);
  const dlg = createDialogue(ctx, story);
  const endings = createEndings(ctx, story);
  const props = createProps(ctx, story, dlg);

  // ---------------------------------------------------------------------------------------------- helpers
  function after(sec, fn) {
    const safe = () => { try { fn(); } catch (e) { warn(e); } };
    const eng = ctx.engine;
    if (eng && eng.after && state.rt.playing) return eng.after(sec, safe);
    const t = setTimeout(safe, sec * 1000);
    return () => clearTimeout(t);
  }
  function pt(name) { try { return ctx.world && ctx.world.point ? ctx.world.point(name) : null; } catch (e) { return null; } }
  function toast(text, kind, dur) { try { ctx.ui && ctx.ui.toast && ctx.ui.toast(text, { kind: kind || "info", dur: dur || 3.5 }); } catch (e) { warn(e); } }
  function flags() { return state.run.flags || (state.run.flags = {}); }

  // ---------------------------------------------------------------------------------------------- phases
  function setPhase(p, opts) {
    const run = state.run, prev = run.phase;
    if (!isPhase(p)) { console.warn("[story] unknown phase", p); return false; }
    if (p === prev) return true;
    if (!(opts && opts.force) && !isLegalTransition(prev, p, opts)) {
      console.warn("[story] illegal phase transition", prev, "->", p);
      return false;
    }
    run.phase = p;
    bus.emit("story:phase", { phase: p, prev });
    onPhase(p, prev);
    director.markDirty();
    return true;
  }
  function onPhase(p) {
    props.refreshLabels();
    if (p === "choice" && !rememberMode) after(1.5, () => { if (state.run.phase === "choice") toast(PROPS.whatNow, "info", 4); });
  }

  // ---------------------------------------------------------------------------------------------- secrets
  function secretCount() { return { count: countFound(state.profile.secrets), total: SECRET_TOTAL }; }
  function secret(id) {
    const def = secretDef(id);
    if (!def) { console.warn("[story] unknown secret", id); return false; }
    const prof = state.profile;
    const map = prof.secrets || (prof.secrets = {});
    if (map[id]) return false;
    map[id] = Date.now();
    const c = secretCount();
    // endings play their own sting right after; the secret chime would swallow it (music.sting dedup)
    if (id.slice(0, 4) !== "end_") { try { ctx.audio && ctx.audio.stinger && ctx.audio.stinger("secret"); } catch (e) { warn(e); } }
    bus.emit("secret:found", { id, name: def.name, count: c.count, total: c.total });
    try { ctx.save && ctx.save.write && ctx.save.write(); } catch (e) { warn(e); }
    props.refreshLabels();
    return true;
  }

  // ---------------------------------------------------------------------------------------------- subtitles
  function say(speaker, text, opts) {
    text = String(text === undefined || text === null ? "" : text);
    const dur = opts && opts.dur ? opts.dur : Math.max(2, Math.min(7, 1.6 + text.length * 0.05));
    const key = speaker ? String(speaker) : "";
    const lower = key.toLowerCase();
    const hollow = lower === "hollow";
    const label = key ? (SPEAKERS[lower] !== undefined ? SPEAKERS[lower] : key) : "";
    const line = hollow ? text.toLowerCase() : (label ? label + ": " + text : text);
    try { ctx.ui && ctx.ui.subtitle && ctx.ui.subtitle(line, dur); } catch (e) { warn(e); }
    if (key && text) {
      try {
        ctx.audio && ctx.audio.voice && ctx.audio.voice(text, { kind: hollow ? "hollow" : lower === "rookie" ? "rookie" : "blip", pitch: PITCH[lower] || 1 });
      } catch (e) { warn(e); }
    }
    return new Promise((res) => { after(dur, res); });
  }

  // ---------------------------------------------------------------------------------------------- run flow
  async function placePlayer(where) {
    const w = ctx.world, pl = ctx.engine && ctx.engine.player;
    let zone = "lobby", pos = null, yaw = 0;
    if (where === "throneDoor") {
      zone = "throne"; pos = pt("throneDoor") || { x: 0, y: 20, z: 482 }; yaw = 0;
    } else {
      const lz = w && w.zones && w.zones.lobby;
      if (lz && lz.spawn && lz.spawn.pos) { pos = lz.spawn.pos; yaw = lz.spawn.yaw || 0; }
      else pos = pt("spawn") || { x: 0, y: 0, z: 10 };
    }
    let ok = false;
    if (w && w.goto) {
      try { await withTimeout(w.goto(zone, { pos, yaw, fade: false }), 2500); ok = true; } catch (e) { warn(e); }
    }
    if (!ok && pl && pl.teleport) { try { pl.teleport(pos, yaw); } catch (e) { warn(e); } }
  }

  // emit run:reset without letting any handler change the persisted run (used when resuming in-session)
  function protectedReset() {
    const backup = clone(state.run);
    bus.emit("run:reset", { cycle: backup.cycle | 0 });
    const r = state.run;
    for (const k of Object.keys(r)) delete r[k];
    Object.assign(r, backup);
  }

  async function launch(o) {
    const run = state.run;
    await placePlayer(o.place === "throneDoor" ? "throneDoor" : "lobby");
    props.applyRun();
    if (o.newGame) state.profile.runs = (state.profile.runs | 0) + 1;
    if (!run.startedAt) run.startedAt = Date.now();
    state.rt.playing = true;
    started = true;
    director.clearCache();
    director.markDirty();
    bus.emit("game:start", { newGame: !!o.newGame, cycle: run.cycle | 0 });
    director.update();
    if (o.place === "choice") {
      try { ctx.events && ctx.events.enterChoice && ctx.events.enterChoice(); } catch (e) { warn(e); }
    } else if (o.place === "throneDoor") {
      after(0.6, () => {
        const ev = ctx.events;
        if (state.run.phase === "throne" && ev && ev.trigger && !ev.active) {
          Promise.resolve(ev.trigger("throne")).catch(warn);
        }
      });
    }
    try { ctx.save && ctx.save.write && ctx.save.write(); } catch (e) { warn(e); }
  }

  /** ui:play -> place the player, playing = true, emit game:start. opts.newGame: fresh run (already reset) */
  async function beginRun(opts) {
    if (launching) return false;
    launching = true;
    try {
      const newGame = !!(opts && opts.newGame);
      let place = "lobby";
      if (!newGame) {
        if (started) protectedReset();
        const n = normalizeResume(state.run.phase);
        place = n.place;
        if (n.place === "choice") {
          let ok = false;
          try { ok = !!(ctx.save && ctx.save.restoreChoice && ctx.save.restoreChoice()); } catch (e) { warn(e); }
          if (!ok) console.warn("[story] no choice snapshot; resuming choice with the current run");
        }
        state.run.phase = n.phase;   // direct write (D4.10 normalisation)
      }
      await launch({ newGame, place });
      return true;
    } catch (e) { warn(e); return false; }
    finally { launching = false; }
  }

  async function startCycle(n) {
    n = Math.max(0, n | 0);
    if (launching) return false;
    launching = true;
    try {
      let ok = false;
      try { if (ctx.save && ctx.save.newGame) { ctx.save.newGame(n); ok = true; } } catch (e) { warn(e); }
      if (!ok || !state.run) state.run = defaultRun(n);
      state.run.cycle = n;
      state.run.phase = cycleStartPhase(n);
      if (!state.run.flags) state.run.flags = {};
      if (!state.run.buried) state.run.buried = {};
      director.resetRun();
      bus.emit("run:reset", { cycle: n });
      if (n >= 1) secret("ngplus");
      await launch({ newGame: true, place: "lobby" });
      return true;
    } catch (e) { warn(e); return false; }
    finally { launching = false; }
  }

  function newGame() { return startCycle(0); }

  /** "Remember the choice": reload the choice snapshot at the black sword */
  async function remember() {
    if (launching) return false;
    launching = true;
    rememberMode = true;
    try {
      const backup = clone(state.run);
      if (started) bus.emit("run:reset", { cycle: backup.cycle | 0 });
      let ok = false;
      try { ok = !!(ctx.save && ctx.save.restoreChoice && ctx.save.restoreChoice()); } catch (e) { warn(e); }
      if (!ok) {
        const r = state.run;
        for (const k of Object.keys(r)) delete r[k];
        Object.assign(r, backup);
      }
      director.resetRun();
      if (state.run.phase !== "choice" && !setPhase("choice")) setPhase("choice", { force: true });
      await launch({ newGame: false, place: "choice" });
      return true;
    } catch (e) { warn(e); return false; }
    finally { launching = false; rememberMode = false; }
  }

  // ---------------------------------------------------------------------------------------------- bus wiring
  const on = (name, fn) => bus.on(name, (p) => { try { fn(p || {}); } catch (e) { warn(e); } });

  on("ui:play", (p) => {
    let fresh = !!p.newGame;
    if (!fresh) { try { if (ctx.save && ctx.save.has && !ctx.save.has()) fresh = true; } catch (e) { /* */ } }
    (fresh ? startCycle(0) : beginRun({ newGame: false })).catch(warn);
  });

  function markCrossed() {
    const fl = flags();
    if (fl["story.crossed"]) return;
    fl["story.crossed"] = true;
    if ((state.run.cycle | 0) === 0 && state.run.phase === "intro") setPhase("area1");
    director.markDirty();
  }

  on("zone:enter", (p) => {
    const id = p.id, run = state.run, c0 = (run.cycle | 0) === 0, pi = phaseIndex(run.phase);
    if (PAST_BRIDGE[id]) markCrossed();
    if (id === "village" || id === "barn" || id === "guardPost") {
      flags()["story.village"] = true;
      if (c0 && pi < AREA2) setPhase("area2");
    }
    if (id === "castle" || id === "throne") {
      flags()["story.castle"] = true;
      if (c0 && pi < AREA3) setPhase("area3");
    }
    if (id === "rookieShack") secret("waterfall");
    if (TIPS[id]) director.tip(id);
    director.markDirty();
  });

  on("enemy:killed", (p) => {
    const k = p.kind;
    if (k === "cat") secret("catBoss");
    else if (k === "rookie") secret("rookieBoss");
    else if (k === "goldenRat") secret("goldenRat");
    else if (k === "king") {
      after(0.4, () => { if (flags()["combat.kingHitless"]) secret("kingFlawless"); });
      // EVENTS moves the phase on (CONTRACT 10.2); this is only a safety net
      after(3, () => {
        const run = state.run, pi = phaseIndex(run.phase);
        if ((run.cycle | 0) === 0 && pi < POST_KING) setPhase("postKing");
        else if ((run.cycle | 0) >= 1 && run.phase === "ng") setPhase("ngPostKing");
      });
    }
    director.markDirty();
  });

  on("boss:end", (p) => {
    if (!p.won) { director.markDirty(); return; }
    if (p.kind === "cat" || p.id === "cat") secret("catBoss");
    if (p.kind === "rookie" || p.id === "rookie") secret("rookieBoss");
    if (p.id === "guards" || p.kind === "guards") {
      const fl = flags();
      const n = fl["story.guardsWins"] | 0;
      fl["story.guardsWins"] = n + 1;
      const seq = (state.run.cycle | 0) >= 1 ? PROPS.guardsWinNg : n === 0 ? PROPS.guardsWinFirst : (n % 3 === 1 ? PROPS.guardsWinAgain : null);
      if (seq) {
        (async () => { for (const [who, text] of seq) await say(who.toLowerCase(), text, { dur: 3 }); })().catch(warn);
      }
    }
    director.markDirty();
  });

  on("item:get", (p) => {
    if (p.id === "kings_crown" || p.id === "bad_kings_crown") secret("crown");
    if (p.id === "girls_ribbon") secret("girlRibbon");
    props.refreshLabels();
    director.markDirty();
  });
  on("milestone", (p) => { if (p.id === "kings_crown") secret("crown"); director.markDirty(); });
  const dirty = () => director.markDirty();
  for (const ev of ["level:gain", "level:set", "unlock", "item:equip", "player:respawn", "gate:open", "settings:change", "seq:end"]) on(ev, dirty);

  // ---------------------------------------------------------------------------------------------- per-frame
  let acc = 0, objAcc = 0;
  function system(dt) {
    try {
      if (!state.rt.playing) return;
      acc += dt; objAcc += dt;
      if (acc >= 0.2) {
        const step = acc; acc = 0;
        const pl = ctx.engine && ctx.engine.player;
        if (pl && !flags()["story.crossed"]) {
          const x = pl.position.x, z = pl.position.z;
          if (z > 68.5 && z < 600 && x > -60 && x < 60) markCrossed();
        }
        props.update(step);
      }
      if (objAcc >= 0.5 || director.dirty) { objAcc = 0; director.update(); }
    } catch (e) { warn(e); }
  }
  if (ctx.engine && ctx.engine.addSystem) ctx.engine.addSystem("story", system, 20);

  // ---------------------------------------------------------------------------------------------- api
  Object.assign(story, {
    beginRun, setPhase, say, secret, secretCount, startCycle, newGame, remember, after,
    talk: (id) => dlg.talk(id),
    read: (speaker, lines) => dlg.read(speaker, lines),
    objective: (o) => director.force(o === undefined ? null : o),
    reachEnding: (id, opts) => endings.reach(id, opts),
    /** text of a named line for other modules (e.g. story.line("hollow.meet")) */
    line(key) {
      const parts = String(key).split(".");
      let v = PROPS;
      for (const p of parts) { v = v && v[p]; }
      return typeof v === "string" ? v : "";
    },
    endingIds: ENDING_IDS,
    _tip(key) { if (TIPS[key]) toast(TIPS[key], "info", 5); }
  });
  Object.defineProperties(story, {
    phase: { get: () => state.run.phase, enumerable: true },
    secrets: { get: () => listSecrets(state.profile.secrets), enumerable: true },
    endingBusy: { get: () => endings.busy, enumerable: true },
    currentObjective: { get: () => director.current(), enumerable: true }
  });

  props.init();

  // ---------------------------------------------------------------------------------------------- debug (CONTRACT 13)
  const dbg = typeof window !== "undefined" ? window.__tnrpg : null;
  if (dbg) {
    dbg.setCycle = (n) => startCycle(n).catch(() => false);
    dbg.secret = (id) => { try { return secret(id); } catch (e) { return false; } };
    dbg.phase = (p) => {
      try {
        if (!isPhase(p)) return false;
        const prev = state.run.phase;
        if (prev !== p) { state.run.phase = p; bus.emit("story:phase", { phase: p, prev }); onPhase(p, prev); director.markDirty(); }
        return p;
      } catch (e) { return false; }
    };
    // resolves when the ending card is up (true), or false if the ending could not start
    dbg.ending = (id) => new Promise((res) => {
      let done = false;
      const fin = (v) => { if (!done) { done = true; res(v); } };
      endings.reach(id, { force: true, onCard: () => fin(true) }).then((ok) => fin(!!ok), () => fin(false));
    });
    dbg.secrets = () => { try { return listSecrets(state.profile.secrets); } catch (e) { return []; } };
    dbg.objective = () => { try { return director.current(); } catch (e) { return null; } };
  }

  return story;
}
