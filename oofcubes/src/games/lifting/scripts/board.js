// src/games/lifting/scripts/board.js — spec 09 §5.11's TOP LIFTERS board and its ghost
// rivals, plus §5.6's 12 pedestal displays and their shared decor tick.
//
// The gain-text pool, the particle bursts and the over-head title tag used to live here
// too; they are §4's `scripts/fx.js` now and moved there wholesale.
//
// SPEC AMENDMENT (§4, §5.6): §5.6 said "`worlds.init` builds each display" while the same
// sentence puts their spin in "`board.update`'s shared decor tick", and neither §4 nor
// §5.1 gives worlds.js an `update` to tick them from. Build and tick belong to one owner,
// so the displays are built here, next to the tick, and both spec lines now say
// `board.init`. See the header of worlds.js. Reported.
//
// Everything hangs off ONE THREE.Group registered with parts.addCustom, so §5.15's
// teardown is a single remove + a single recursive dispose and parts.count() lands back
// exactly where it started (spec 04 §5.5).

import { TUNING, fmt } from "./config.js";
import { buildItemGroup, spinItemGroup, disposeItemGroup } from "./items.js";

const DEG = Math.PI / 180;

// §5.11's board: 8 x 10 x 0.3 studs at the gym mount, face pointing down −X (place.json
// parks its two posts at x 58, z −62/−54). A +Z-facing plane turns to −X at yaw −90°.
const BOARD_POS = [58, 8, -58];
const BOARD_YAW_DEG = -90;
const BOARD_SIZE = [8, 10, 0.3];
const BOARD_TEX_W = 512;
const BOARD_TEX_H = 640;
const BOARD_HEADER_H = 120; // 640 − 10 rows x 52 px
const BOARD_ROW_H = 52;
const BOARD_ROWS = 10;

// §5.6's pedestal table: [x, z, itemId] per zone, in the order that section lists them.
// The y comes from the pedestal box (6x2x6 centred at y 1, so its top is y 2). Space and
// lava coordinates are §5.6's own; the dumbbell four are the "analogous offsets" §5.6
// leaves unstated, read off place.json's dumbbell-pedestal-0..3 so the display always
// lands on the plinth that exists rather than on a number invented twice.
const PEDESTAL_TOP_Y = 2;
const DISPLAYS = Object.freeze([
  Object.freeze([-760, -40, "moon"]),
  Object.freeze([-740, -80, "earth"]),
  Object.freeze([-660, -80, "sun"]),
  Object.freeze([-640, -40, "blackhole"]),
  Object.freeze([-60, -740, "protein"]),
  Object.freeze([-40, -780, "dumbbell"]),
  Object.freeze([40, -780, "situps"]),
  Object.freeze([60, -740, "universe"]),
  Object.freeze([660, -60, "lavaball"]),
  Object.freeze([740, -60, "lavaplanet"]),
  Object.freeze([660, 60, "lavaeclipse"]),
  Object.freeze([740, 60, "gdstar"]),
]);

// ---- module closure; dispose() puts every one of these back to null/empty ----
let root = null;       // the single addCustom subtree
let rootId = null;
let board = null;      // { mesh, canvas, c2d, tex }
let displays = [];     // the 12 pedestal item groups
let lastBoardSlot = -1;
let ghostKing = false;

// ---------------------------------------------------------------------------
// §5.11 ghosts + ranking
// ---------------------------------------------------------------------------

// §3.6 defines the ghost clock as "save.stats.playSeconds + current-session sim seconds".
// game.js already accrues the session's dt INTO stats.playSeconds every step (§5.1's
// update order), so the two terms are the same number — adding ctx.time as well would
// double-count it. Reported as a spec wording gap.
// The board's rows: the other players in this Place's room, plus you. Sorted desc, top
// 10 kept — and you are ALWAYS kept: past rank 10 you replace the last row and show your
// true rank (§5.11).
//
// §5.11 used to fill this with ten invented rivals whose totals doubled every twenty
// minutes of your own playtime, so the board always had someone just ahead of you. They
// are gone (amended 2026-08-27): a leaderboard whose names belong to nobody is a
// progress bar wearing a scoreboard's clothes, and now that a room can hold twenty real
// lifters there is a real one to show. `others` comes from the room roster and is empty
// when you are playing alone or offline — then the board is just you, honestly.
export function entries(state, others) {
  const rows = [];
  for (const o of others || []) {
    const value = o && o.state && Number.isFinite(o.state.lifetime) ? o.state.lifetime : 0;
    rows.push({ name: o.name, value, isPlayer: false });
  }
  rows.push({ name: "You", value: state.lifetime, isPlayer: true });
  rows.sort((a, b) => b.value - a.value);
  const playerRank = rows.findIndex((r) => r.isPlayer) + 1;
  const top = rows.slice(0, BOARD_ROWS).map((r, i) => ({ ...r, rank: i + 1 }));
  if (playerRank > BOARD_ROWS) {
    top[BOARD_ROWS - 1] = { name: "You", value: state.lifetime, isPlayer: true, rank: playerRank };
  }
  return top;
}

// Spec 13 §5's roster, read through ctx like every other service. Absent entirely when
// the relay was never configured, so every access is guarded and the answer is "nobody".
function rosterFor(ctx) {
  const net = ctx.services && ctx.services.net;
  if (!net || typeof net.roster !== "function") return [];
  const list = net.roster();
  return Array.isArray(list) ? list : [];
}

// ---------------------------------------------------------------------------
// §5.11 board canvas
// ---------------------------------------------------------------------------

const MEDAL_TINT = ["#d4af37", "#c8c8cd", "#cd7f32"];

function paintBoard(state, others) {
  if (!board) return;
  const g = board.c2d;
  g.clearRect(0, 0, BOARD_TEX_W, BOARD_TEX_H);
  g.fillStyle = "#0e1018";
  g.fillRect(0, 0, BOARD_TEX_W, BOARD_TEX_H);
  g.fillStyle = "#f7c948";
  g.font = "bold 44px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("TOP LIFTERS", BOARD_TEX_W / 2, BOARD_HEADER_H / 2);

  const rows = entries(state, others);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const y = BOARD_HEADER_H + i * BOARD_ROW_H;
    g.fillStyle = i % 2 === 0 ? "#171a24" : "#12141c";
    g.fillRect(0, y, BOARD_TEX_W, BOARD_ROW_H);
    if (i < MEDAL_TINT.length) {
      g.globalAlpha = 0.25;
      g.fillStyle = MEDAL_TINT[i];
      g.fillRect(0, y, BOARD_TEX_W, BOARD_ROW_H);
      g.globalAlpha = 1;
    }
    g.font = "bold 26px system-ui, sans-serif";
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.fillStyle = "#9aa3b8";
    g.fillText("#" + row.rank, 14, y + BOARD_ROW_H / 2);
    g.fillStyle = row.isPlayer ? "#f7c948" : "#f2f4fa";
    g.fillText(row.name, 74, y + BOARD_ROW_H / 2, 230);
    g.textAlign = "right";
    g.fillText(fmt(row.value), BOARD_TEX_W - 14, y + BOARD_ROW_H / 2, 180);
    if (row.isPlayer) {
      g.strokeStyle = "#f7c948";
      g.lineWidth = 2;
      g.strokeRect(1, y + 1, BOARD_TEX_W - 2, BOARD_ROW_H - 2);
    }
  }
  board.tex.needsUpdate = true;
  return rows;
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

// Idempotent by construction: a re-init without a dispose, or a retry after an init that
// threw partway, must not leave a second set of display groups hanging off a lost root.
// dispose() is the only thing that owns those meshes, so it runs first (it is a no-op on
// a cold module), and `displays` is published to the closure only once the build is done.
export function init(ctx, state) {
  dispose(ctx);
  const THREE = ctx.engine.THREE;
  root = new THREE.Group();
  root.name = "lifting-scene";

  // ---- leaderboard ----
  const canvas = document.createElement("canvas");
  canvas.width = BOARD_TEX_W;
  canvas.height = BOARD_TEX_H;
  const tex = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const faceMat = new THREE.MeshBasicMaterial({ map: tex }); // unlit: a board must stay readable at night
  const sideMat = new THREE.MeshLambertMaterial({ color: "#1b1b1b" });
  const geo = new THREE.BoxGeometry(BOARD_SIZE[0], BOARD_SIZE[1], BOARD_SIZE[2]);
  // BoxGeometry's material slots are [+x, −x, +y, −y, +z, −z]; only the +Z face carries
  // the canvas, and the yaw below turns that face toward the gym floor.
  const mesh = new THREE.Mesh(geo, [sideMat, sideMat, sideMat, sideMat, faceMat, sideMat]);
  mesh.position.set(BOARD_POS[0], BOARD_POS[1], BOARD_POS[2]);
  mesh.rotation.y = BOARD_YAW_DEG * DEG;
  root.add(mesh);

  // ---- pedestal displays (§5.6) ----
  const nextDisplays = [];
  for (const [x, z, itemId] of DISPLAYS) {
    const built = buildItemGroup(THREE, itemId);
    built.group.scale.setScalar(TUNING.DISPLAY_SCALE);
    // §5.6: 2.5 + halfHeight x DISPLAY_SCALE above the pedestal top.
    built.group.position.set(x, PEDESTAL_TOP_Y + 2.5 + built.halfHeight * TUNING.DISPLAY_SCALE, z);
    root.add(built.group);
    nextDisplays.push(built.group);
  }

  rootId = ctx.engine.parts.addCustom(root);
  board = { mesh, canvas, c2d: canvas.getContext("2d"), tex };
  displays = nextDisplays;
  lastBoardSlot = -1;
  ghostKing = false;
}

export function update(dt, ctx, state) {
  if (!root) return;

  // §5.6: the displays' shared decor tick — whole-group spin plus each item's own
  // per-prim spins (a spinning Sun inside a spinning display still looks right).
  for (const group of displays) {
    group.rotation.y += TUNING.DISPLAY_SPIN_DEG_S * DEG * dt;
    spinItemGroup(group, dt);
  }

  // §5.11: repaint at most once per BOARD_REDRAW_S of sim time — no per-frame canvas work.
  const slot = Math.floor(ctx.time / TUNING.BOARD_REDRAW_S);
  if (slot !== lastBoardSlot) {
    lastBoardSlot = slot;
    const others = rosterFor(ctx);
    const rows = paintBoard(state, others);
    // Rank 1 only counts when there was somebody to outlift. Alone on the board you are
    // rank 1 the instant you lift anything, which would hand out §5.12's crown for
    // showing up — exactly the hollowness that retiring the invented rivals was meant to
    // remove. The badge id stays `ghost-king` because saves carry it.
    if (!ghostKing && rows && rows.length > 1 && rows[0] && rows[0].isPlayer) {
      ghostKing = true;
      ctx.services.badges.award("ghost-king");
    }
  }
}

export function dispose(ctx) {
  if (rootId !== null) ctx.engine.parts.remove(rootId);
  disposeItemGroup(root); // recursive: board mesh + the 12 displays
  root = null;
  rootId = null;
  board = null;
  displays = [];
  lastBoardSlot = -1;
  ghostKing = false;
}
