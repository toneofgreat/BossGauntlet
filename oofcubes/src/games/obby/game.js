// src/games/obby/game.js — the Difficulty Chart Obby Place: builds the generated world
// out of layout.js's stage descriptors, then runs checkpoints, first-completion Oofbux
// and the per-Place save. Spec 08 §5.11-§5.13 (materialization + wiring) and §5.9
// (progression) own this file; everything reaches the platform through `ctx` only.
// SLICE: spec 08 §4 splits this across world.js / labels.js / progress.js / ui.js. The
// slice owns one entry module, so those four sections live here behind the same
// function names §4's table gives them — a later file move, not a rewrite.

import { buildLayout } from "./scripts/layout.js";
import { ROSTER, PALETTE, KIND_MAP, REWARDS, MUSIC_BANDS, TUNE } from "./scripts/config.js";

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
let partIds = [];
let labelIds = [];
let labelHeld = []; // { tex, mat, geo } — disposed in dispose(), never garbage alone

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

function makeLabel(ctx, spec) {
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
  labelHeld.push({ tex, mat, geo });
  return ctx.engine.parts.addCustom(mesh);
}

// ---------------------------------------------------------------------------
// §5.11 materialization.
// SLICE: §5.11's sliding window (WINDOW_BEHIND/AHEAD, MATERIALIZE_PER_TICK, the catch
// plate) exists because 90 stages are ~7000 parts. The slice's 8 stages are ~150, so
// every stage is live at once — well inside TUNE.MAX_LIVE_PARTS. setWindow/tickWorld
// fill in from §5.11 with the remaining §5.3 roster rows.
// ---------------------------------------------------------------------------

function buildWorld(ctx) {
  const defs = [];
  for (const stage of layout.stages) {
    stage.parts.forEach((p, i) => defs.push(partDef(stage, p, i)));
  }
  partIds = ctx.engine.parts.createMany(defs);
  for (const stage of layout.stages) {
    for (const spec of stage.labels) labelIds.push(makeLabel(ctx, spec));
  }
}

function destroyWorld(ctx) {
  for (const id of partIds) ctx.engine.parts.remove(id);
  for (const id of labelIds) ctx.engine.parts.remove(id);
  for (const held of labelHeld) {
    held.tex.dispose();
    held.mat.dispose();
    held.geo.dispose();
  }
  partIds = [];
  labelIds = [];
  labelHeld = [];
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

// §5.9.8 bands are numbered in the full 90-stage roster, so they are read through the
// row's `srcN` (see config.js ROSTER).
function bandTrack(n) {
  const src = stageRow(n).srcN;
  const band = MUSIC_BANDS.find((b) => src <= b.maxStage);
  return (band || MUSIC_BANDS[MUSIC_BANDS.length - 1]).track;
}

function refreshHud(ctx) {
  ctx.services.ui.setHudStat("stage", { icon: "🏁", label: "Stage", value: `${state.current}/${STAGE_COUNT}` });
  ctx.services.ui.setHudStat("oofs", { icon: "💀", label: "Oofs", value: String(state.oofs) });
}

// First-completion pay for every stage in (state.paid, done] — normally exactly one.
// SLICE: §5.9.2 step 5's badge awards are deferred with the rest of Badges (SLICE.md);
// config.js already carries §5.9.7's table for them.
function payThrough(ctx, done) {
  if (done <= state.paid) return;
  let total = 0;
  for (let m = state.paid + 1; m <= done; m++) {
    const row = stageRow(m);
    total += REWARDS[row.diff] * (row.tower ? 5 : 1);
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
  ctx.engine.audio.playMusic(bandTrack(n));
  refreshHud(ctx);
  state.dirty = true;
  flushSave(ctx, n === STAGE_COUNT);
}

function onWin(ctx) {
  payThrough(ctx, STAGE_COUNT);
  if (!state.winner) {
    state.winner = true;
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
  buildWorld(ctx);

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

export function update(dt, ctx) {
  flushSave(ctx, false);
}

export function dispose(ctx) {
  for (const off of subs) off();
  subs = [];
  if (state) flushSave(ctx, true);
  destroyWorld(ctx);
  layout = null;
  state = null;
}
