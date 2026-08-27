// src/games/obby/game.js — the Difficulty Chart Obby Place: builds the generated world
// out of layout.js's stage descriptors, then runs checkpoints, first-completion Oofbux
// and the per-Place save. Spec 08 §5.11-§5.13 (materialization + wiring) and §5.9
// (progression) own this file; everything reaches the platform through `ctx` only.
// SLICE: spec 08 §4 splits this across world.js / labels.js / progress.js / ui.js. The
// slice owns one entry module, so those four sections live here behind the same
// function names §4's table gives them — a later file move, not a rewrite.

import { buildLayout } from "./scripts/layout.js";
import { ROSTER, PALETTE, KIND_MAP, REWARDS, BADGES, MUSIC_BANDS, TUNE } from "./scripts/config.js";
import { createUI, refresh as refreshPanel, destroyUI } from "./scripts/ui.js";

export const meta = {
  slug: "obby",
  name: "Difficulty Chart Obby",
  icon: "🏔️",
  description: "Climb the difficulty chart one stage at a time. Every checkpoint saves — the gold podium waits at the top!",
  version: "1.0.0",
};

const STAGE_COUNT = ROSTER.length;
const WIN_PAD_COOLDOWN_S = 1; // §5.12: the win pad's touchEvent cooldown

let layout = null;
let state = null;
let subs = [];
let labelHeld = new Map(); // stageN -> [{ tex, mat, geo }] — disposed with the stage
let ui = null;

// §5.11's live window. Stage descriptors are cheap; their parts are not, so only the
// stages either side of the player are ever real.
const world = {
  live: new Map(),      // stageN -> engine part ids
  labels: new Map(),    // stageN -> engine part ids (addCustom label planes)
  queue: [],            // pending creations, drained MATERIALIZE_PER_TICK per tick
  window: [0, 0],
  catchId: null,
};

// ---------------------------------------------------------------------------
// §5.12 StagePart -> engine part def (the binding mapping table lives in config.js).
// ---------------------------------------------------------------------------

function partId(stage, p, i) {
  if (p.kind === "cpPad") return "cp" + stage.n;
  if (p.kind === "winPad") return "winpad";
  return `s${stage.n}_${i}`;
}

function behaviorsFor(map, spin) {
  const out = [];
  if (map.spinner) out.push({ type: "spinner", axis: "y", speed: spin });
  if (map.kill) out.push({ type: "kill" });
  if (map.touch === "checkpoint") out.push({ type: "touchEvent", event: "checkpoint", cooldownS: TUNE.TP_COOLDOWN_S });
  if (map.touch === "winpad") out.push({ type: "touchEvent", event: "winpad", cooldownS: WIN_PAD_COOLDOWN_S });
  return out;
}

function partDef(stage, p, i) {
  const map = KIND_MAP[p.kind];
  const pal = PALETTE[stage.diff];
  return {
    id: partId(stage, p, i),
    shape: map.shape,
    size: p.size.slice(),
    position: p.pos.slice(),
    rotation: [0, p.yaw, 0],
    color: map.diff ? pal.color : map.diffColor ? stage.color : map.color,
    material: map.diff ? pal.mat : map.material,
    transparency: map.diff ? pal.t : map.t,
    anchored: true,
    canCollide: map.canCollide !== false,
    behaviors: behaviorsFor(map, p.spin),
  };
}

// ---------------------------------------------------------------------------
// §5.12.3 labels — canvas-texture text planes; the Place schema cannot carry text.
// ---------------------------------------------------------------------------

function drawLabel(spec, big) {
  const canvas = document.createElement("canvas");
  canvas.width = big ? 512 : 256;
  canvas.height = big ? 128 : 64;
  const g = canvas.getContext("2d");
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = spec.color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `bold ${big ? 56 : 28}px system-ui, sans-serif`;
  const lines = spec.text.split("\n");
  const step = canvas.height / (lines.length + 1);
  lines.forEach((line, i) => g.fillText(line, canvas.width / 2, step * (i + 1), canvas.width * 0.92));
  return canvas;
}

function makeLabel(ctx, spec, stageN) {
  const THREE = ctx.engine.THREE;
  const tex = new THREE.CanvasTexture(drawLabel(spec, spec.w > 12));
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  // DoubleSide: a sign is read on the way in and on the way past, and the §3.4 yaw
  // points a plane's front along the heading, i.e. away from the climber.
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  const geo = new THREE.PlaneGeometry(spec.w, spec.h);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
  mesh.rotation.y = (spec.yaw * Math.PI) / 180;
  if (!labelHeld.has(stageN)) labelHeld.set(stageN, []);
  labelHeld.get(stageN).push({ tex, mat, geo });
  return ctx.engine.parts.addCustom(mesh);
}

// ---------------------------------------------------------------------------
// §5.11 windowed materialization. All 90 stages exist as descriptors; only stages
// [current − WINDOW_BEHIND, current + WINDOW_AHEAD] are ever live parts. The whole
// world is ~5700 parts, which is past both MAX_LIVE_PARTS and the engine's runtime
// cap — the window is what makes a 90-stage obby a thing the engine can hold.
// ---------------------------------------------------------------------------

function releaseStage(ctx, sn) {
  for (const id of world.live.get(sn) || []) ctx.engine.parts.remove(id);
  for (const id of world.labels.get(sn) || []) ctx.engine.parts.remove(id);
  for (const held of labelHeld.get(sn) || []) {
    held.tex.dispose();
    held.mat.dispose();
    held.geo.dispose();
  }
  world.live.delete(sn);
  world.labels.delete(sn);
  labelHeld.delete(sn);
}

function drainQueue(ctx, max) {
  let made = 0;
  while (world.queue.length && made < max) {
    const item = world.queue.shift();
    // The window can move on between enqueue and drain; a stage that left is not built.
    if (!world.live.has(item.n)) continue;
    if (item.def) world.live.get(item.n).push(ctx.engine.parts.create(item.def));
    else world.labels.get(item.n).push(makeLabel(ctx, item.label, item.n));
    made += 1;
  }
}

// §5.11 step 5 — a wide, invisible kill plate under the live window. place.json's
// killY is the last resort below it; this one catches a fall while the stage that
// owns the real kill floor may not even be materialized.
function repositionCatch(ctx) {
  if (world.catchId !== null) {
    ctx.engine.parts.remove(world.catchId);
    world.catchId = null;
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity;
  for (let sn = world.window[0]; sn <= world.window[1]; sn++) {
    for (const p of layout.stages[sn - 1].parts) {
      if (p.kind === "killFloor") continue;
      minX = Math.min(minX, p.pos[0] - p.size[0] / 2);
      maxX = Math.max(maxX, p.pos[0] + p.size[0] / 2);
      minZ = Math.min(minZ, p.pos[2] - p.size[2] / 2);
      maxZ = Math.max(maxZ, p.pos[2] + p.size[2] / 2);
      minY = Math.min(minY, p.pos[1] - p.size[1] / 2);
    }
  }
  if (!Number.isFinite(minY)) return;
  const m = TUNE.CATCH_MARGIN;
  world.catchId = ctx.engine.parts.create({
    id: "obbycatch",
    shape: "box",
    size: [Math.min(2000, maxX - minX + 2 * m), 2, Math.min(2000, maxZ - minZ + 2 * m)],
    position: [(minX + maxX) / 2, minY - TUNE.CATCH_DROP, (minZ + maxZ) / 2],
    rotation: [0, 0, 0],
    color: "#000000",
    material: "plastic",
    transparency: 1,
    anchored: true,
    canCollide: false,
    behaviors: [{ type: "kill" }],
  });
}

// `sync` drains the whole queue before returning — used on init and after a teleport,
// where the player is about to stand somewhere that must already be solid.
function setWindow(ctx, n, sync) {
  const lo = Math.max(1, n - TUNE.WINDOW_BEHIND);
  const hi = Math.min(STAGE_COUNT, n + TUNE.WINDOW_AHEAD);
  if (lo === world.window[0] && hi === world.window[1]) {
    if (sync) drainQueue(ctx, Infinity);
    return;
  }
  world.window = [lo, hi];
  for (const sn of [...world.live.keys()]) {
    if (sn < lo || sn > hi) releaseStage(ctx, sn);
  }
  world.queue = world.queue.filter((item) => item.n >= lo && item.n <= hi);

  // Nearest stage first: if the drain is spread over ticks, the ground under the
  // player appears before the scenery two stages ahead of them.
  const order = [];
  for (let sn = lo; sn <= hi; sn++) order.push(sn);
  order.sort((a, b) => Math.abs(a - n) - Math.abs(b - n) || a - b);
  for (const sn of order) {
    if (world.live.has(sn)) continue;
    world.live.set(sn, []);
    world.labels.set(sn, []);
    const stage = layout.stages[sn - 1];
    stage.parts.forEach((p, i) => world.queue.push({ n: sn, def: partDef(stage, p, i) }));
    for (const spec of stage.labels) world.queue.push({ n: sn, label: spec });
  }
  if (sync) drainQueue(ctx, Infinity);
  repositionCatch(ctx);
}

function destroyWorld(ctx) {
  for (const sn of [...world.live.keys()]) releaseStage(ctx, sn);
  if (world.catchId !== null) ctx.engine.parts.remove(world.catchId);
  world.queue = [];
  world.window = [0, 0];
  world.catchId = null;
  labelHeld = new Map();
}

// ---------------------------------------------------------------------------
// §3.5 save document + §5.9 progression.
// ---------------------------------------------------------------------------

function freshSave() {
  return { schemaVersion: 1, best: 1, current: 1, paid: 0, winner: false, oofs: 0 };
}

// A bad save is replaced, never thrown on (§3.5).
function sanitize(raw) {
  if (!raw || typeof raw !== "object" || raw.schemaVersion !== 1 || typeof raw.winner !== "boolean") return freshSave();
  const inRange = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
  const best = inRange(raw.best, 1, STAGE_COUNT);
  const current = inRange(raw.current, 1, STAGE_COUNT);
  const paid = inRange(raw.paid, 0, STAGE_COUNT);
  const oofs = inRange(raw.oofs, 0, Number.MAX_SAFE_INTEGER);
  if (best === null || current === null || paid === null || oofs === null) return freshSave();
  return { schemaVersion: 1, best, current: Math.min(current, best), paid, winner: raw.winner, oofs };
}

function flushSave(ctx, force) {
  if (!state.dirty) return;
  if (!force && ctx.time - state.lastSaveAt < TUNE.SAVE_DEBOUNCE_S) return;
  ctx.services.saves.save({
    schemaVersion: 1,
    best: state.best,
    current: state.current,
    paid: state.paid,
    winner: state.winner,
    oofs: state.oofs,
  });
  state.lastSaveAt = ctx.time;
  state.dirty = false;
}

function stageRow(n) {
  return ROSTER[n - 1];
}

function cpFeet(n) {
  const cp = layout.stages[n - 1].cp;
  return [cp[0], cp[1], cp[2]]; // pad top = feet
}

function cpYaw(n) {
  return layout.stages[n - 1].cp[3];
}

// §5.9.8 bands are spec stage numbers, which is what the roster now uses directly.
function bandTrack(n) {
  const band = MUSIC_BANDS.find((b) => n <= b.maxStage);
  return (band || MUSIC_BANDS[MUSIC_BANDS.length - 1]).track;
}

// The stage-select's teleport (§5.14). Unlike a checkpoint touch this can jump the
// whole chart, so the window is rebuilt synchronously — the pad has to be real before
// the avatar is standing on it.
function goToStage(ctx, n) {
  const target = Math.max(1, Math.min(state.best, Math.round(n)));
  if (!Number.isFinite(target)) return;
  setWindow(ctx, target, true);
  state.current = target;
  ctx.player.setCheckpoint(cpFeet(target));
  ctx.player.teleport(cpFeet(target), cpYaw(target));
  ctx.engine.audio.playMusic(bandTrack(target));
  state.dirty = true;
  refreshHud(ctx);
}

function refreshUi() {
  if (ui) refreshPanel(ui, { current: state.current, best: state.best });
}

function refreshHud(ctx) {
  ctx.services.ui.setHudStat("stage", { icon: "🏁", label: "Stage", value: `${state.current}/${STAGE_COUNT}` });
  ctx.services.ui.setHudStat("oofs", { icon: "💀", label: "Oofs", value: String(state.oofs) });
  refreshUi();
}

// First-completion pay for every stage in (state.paid, done] — normally exactly one.
// §5.9.2 step 5: a first completion pays, and any badge whose stage it just passed
// fires with it. Both walk the same (paid, done] window, so a run that jumps ahead
// cannot skip a badge either — award() is idempotent, so a repeat pass is free.
function payThrough(ctx, done) {
  if (done <= state.paid) return;
  let total = 0;
  for (let m = state.paid + 1; m <= done; m++) {
    const row = stageRow(m);
    total += REWARDS[row.diff] * (row.tower ? 5 : 1);
    for (const badge of BADGES) {
      if (badge.atStageComplete === m) ctx.services.badges.award(badge.id);
    }
  }
  state.paid = done;
  if (total <= 0) return;
  ctx.services.economy.award(total, "obby:stage" + done);
  ctx.services.ui.toast(`+${total} Oofbux!`, { icon: "💰" });
}

function onCheckpoint(ctx, n) {
  if (!Number.isInteger(n) || n < 1 || n > STAGE_COUNT) return;
  if (n === state.current) return; // pad re-touch
  state.current = n;
  ctx.player.setCheckpoint(cpFeet(n));
  if (n > state.best) {
    state.best = n;
    ctx.engine.audio.playSfx("chime");
    ctx.services.ui.toast(`Checkpoint! Stage ${n} — ${stageRow(n).name}`, { icon: "🏁" });
  }
  payThrough(ctx, n - 1);
  setWindow(ctx, n, false); // the drain rides the next few ticks; +2 ahead buys the time
  ctx.engine.audio.playMusic(bandTrack(n));
  refreshHud(ctx);
  state.dirty = true;
  flushSave(ctx, n === STAGE_COUNT);
}

function onWin(ctx) {
  payThrough(ctx, STAGE_COUNT);
  if (!state.winner) {
    state.winner = true;
    ctx.services.badges.award("winner");
    ctx.services.economy.award(TUNE.WIN_OOFBUX, "obby:winner");
    ctx.services.ui.toast(`YOU BEAT THE OBBY! +${TUNE.WIN_OOFBUX} Oofbux`, { icon: "🏆" });
    ctx.engine.audio.playSfx("win");
  }
  refreshHud(ctx);
  state.dirty = true;
  flushSave(ctx, true);
}

function onDeath(ctx) {
  state.oofs += 1;
  state.dirty = true;
  refreshHud(ctx);
}

// ---------------------------------------------------------------------------
// §5.13 lifecycle.
// ---------------------------------------------------------------------------

export function init(ctx) {
  layout = buildLayout();
  state = sanitize(ctx.services.saves.load());
  state.lastSaveAt = -1e9;
  state.dirty = false;
  setWindow(ctx, state.current, true);
  ui = createUI(
    ROSTER.map((row) => ({ n: row.n, name: row.name, color: PALETTE[row.diff].color })),
    { teleport: (n) => goToStage(ctx, n) }
  );

  // Pad ids are `cp<n>` (§5.12), so the stage number rides on the event's partId. The
  // engine's `checkpoint` behavior is deliberately not used: its monotonic order would
  // fight a game that is the respawn authority (§5.9).
  subs.push(ctx.events.on("touch:checkpoint", (e) => onCheckpoint(ctx, parseInt(String(e.partId).slice(2), 10))));
  subs.push(ctx.events.on("touch:winpad", () => onWin(ctx)));
  subs.push(ctx.events.on("player:died", () => onDeath(ctx)));

  ctx.player.setCheckpoint(cpFeet(state.current));
  if (state.current > 1) ctx.player.teleport(cpFeet(state.current), cpYaw(state.current));
  ctx.engine.audio.playMusic(bandTrack(state.current));
  refreshHud(ctx);
}

// A player can arrive somewhere the window has not built: the stage-select teleports
// there on purpose, and a bounce can fling them. This recovers from that.
//
// It must NEVER fire during ordinary play, and the first version did. It re-centred on
// the NEAREST checkpoint by straight-line distance, which is wrong for a chart that
// snakes: maybeConnector runs a row east to ROW_X_LIMIT, drops south and reverses, so
// the rows sit ~110 studs apart. Halfway along a 438-stud stage your own checkpoint is
// ~190 studs behind you while a checkpoint three stages LATER, on the row behind, is
// ~162 away. On Extreme 1 that deleted stages 60-62 out from under the player on the
// 11th jump and dropped them into the void — reported from play and reproduced.
//
// There is deliberately NO automated regression test for this, because none of the
// harness's probes can express it. Every probe teleports the avatar to a spot and lets
// it settle, and a teleport is precisely what this bug survives: the window re-centres,
// the ground is rebuilt around wherever the avatar now is, and the next sample finds it
// standing. The failure only exists while the player is in continuous motion across a
// stage the window drops mid-jump. Two fences were written for it and both went green
// against this exact function with the guard below disabled; they were removed rather
// than left to imply cover they do not give. If you touch this function, verify it by
// playing the chart, not by trusting scenario:obby.
//
// Physical proximity is simply not the same question as progress along the chain. So:
// if the player is anywhere on ground the window has already built, there is nothing to
// recover from and the window does not move. Only a player who is genuinely nowhere
// near any live stage gets snapped, and then the nearest checkpoint IS the best guess
// available.
const WINDOW_RECHECK_S = 0.25;
const RECENTRE_MARGIN = 30; // studs of slack around a live stage's own footprint
const RECENTRE_FALL = 200; // ...and far more below it, so a long fall never re-centres
let recheckIn = 0;
const stageBoundsCache = new Map();

// The box a stage's own path occupies. Cheap, and computed once per stage per load.
function stageBounds(sn) {
  let b = stageBoundsCache.get(sn);
  if (b) return b;
  const path = layout.stages[sn - 1].path;
  b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const n of path) {
    b.minX = Math.min(b.minX, n.x - n.hx); b.maxX = Math.max(b.maxX, n.x + n.hx);
    b.minY = Math.min(b.minY, n.top); b.maxY = Math.max(b.maxY, n.top);
    b.minZ = Math.min(b.minZ, n.z - n.hz); b.maxZ = Math.max(b.maxZ, n.z + n.hz);
  }
  stageBoundsCache.set(sn, b);
  return b;
}

function onLiveGround(p) {
  for (let sn = world.window[0]; sn <= world.window[1]; sn++) {
    if (sn < 1 || sn > STAGE_COUNT) continue;
    const b = stageBounds(sn);
    if (p[0] >= b.minX - RECENTRE_MARGIN && p[0] <= b.maxX + RECENTRE_MARGIN
      && p[2] >= b.minZ - RECENTRE_MARGIN && p[2] <= b.maxZ + RECENTRE_MARGIN
      && p[1] >= b.minY - RECENTRE_FALL && p[1] <= b.maxY + RECENTRE_MARGIN) return true;
  }
  return false;
}

function recentreWindow(dt, ctx) {
  recheckIn -= dt;
  if (recheckIn > 0) return;
  recheckIn = WINDOW_RECHECK_S;
  const p = ctx.player.position();
  if (onLiveGround(p)) return;
  let nearest = state.current;
  let best = Infinity;
  for (let sn = 1; sn <= STAGE_COUNT; sn++) {
    const cp = layout.stages[sn - 1].cp;
    const dx = cp[0] - p[0];
    const dy = cp[1] - p[1];
    const dz = cp[2] - p[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) { best = d; nearest = sn; }
  }
  if (nearest >= world.window[0] && nearest <= world.window[1]) return;
  setWindow(ctx, nearest, true); // sync: the ground under them has to be there now
}

export function update(dt, ctx) {
  recentreWindow(dt, ctx);
  drainQueue(ctx, TUNE.MATERIALIZE_PER_TICK);
  flushSave(ctx, false);
}

export function dispose(ctx) {
  for (const off of subs) off();
  subs = [];
  destroyUI(ui);
  ui = null;
  if (state) flushSave(ctx, true);
  stageBoundsCache.clear();
  destroyWorld(ctx);
  layout = null;
  state = null;
}
