// src/games/speed/scripts/layout.js — the avenue, as data. Spec 24 §3. Pure ESM (no
// THREE, no DOM, no ctx) so rule 24:S3 can build the real world and measure it.
//
// One straight avenue along +x: a treadmill plaza at the start, then the six zones in a
// line. Each zone is an entrance pad, a lane, and a crate pedestal at the far end with
// its Keeper. The treadmill and the Keepers are proper machines/robots now — the belt
// takes its colours from the current tier (game.js recolours it on upgrade), and each
// biome carries scenery so the six zones read as different places.

import { ZONES, treadmillById } from "./config.js";

export const FLOOR_TOP = 4;
export const SPAWN = Object.freeze([18, FLOOR_TOP + 0.2, 0]); // open avenue, clear of the belt
export const SPAWN_YAW = 90;
export const KILL_Y = -20;

export const LANE_HALF_Z = 12; // wider now — it is one open danger field, not lanes
export const WALL_H = 12;

export const TREAD = Object.freeze({ cx: 0, cz: 0, w: 10, d: 16 });
export const UPGRADE_PAD = Object.freeze({ cx: 0, cz: 12 });

// The SAFE ZONE is everything x < SAFE_X (the treadmill base). Keepers can chase you all
// the way back but never cross this line; reach it carrying a crate and it is yours.
export const SAFE_X = 26;

const ZONE_PITCH = 40;   // crates are closer together now — one continuous gauntlet
const ZONE0_X = 44;      // first crate x
// The Void (index 6) and Flash (index 7) sit far out past a big gap — an epic run into a
// vast dark expanse, then a bigger blazing one. The gaps are long but capped so the run
// back stays possible with the top treadmills, shoes and abilities (a literal 100x/25x
// — 4,000 then 100,000 studs — would be an 18-minute run and past float precision).
const EPIC_GAP = Object.freeze({ 6: 120, 7: 220 });

// Crates sit along +x with no gates or safe gaps between them (spec 24 §11). The Keeper
// guards its crate; grabbing a crate wakes it and every Keeper between it and safety.
export function zonePedestalX(i) {
  let x = ZONE0_X;
  for (let k = 1; k <= i; k++) x += EPIC_GAP[k] || ZONE_PITCH;
  return x;
}
export function zoneEntranceX(i) { return zonePedestalX(i); } // kept for the smoke helper
// The Keeper guards its crate from just BEHIND it (the far side from safety), so
// grabbing gives you a head start to turn and flee — it isn't an instant tag.
export function zoneKeeperHomeX(i) { return zonePedestalX(i) + 9; }

const C = Object.freeze({
  plaza: "#2f333f", plazaTrim: "#464c5c", wall: "#3a4050", wallTrim: "#4a5165",
  pad: "#f5c542", pedestal: "#c9d2e4", pedTrim: "#8a93a6",
  crate: "#8c5a3c", crateTrim: "#f5c542", crateDark: "#5f3d20",
  keeperDark: "#2a2f3a", keeperTrim: "#8a93a6", keeperEye: "#ffd93d",
  sign: "#12141c",
});

let nextId = 0;
const idFor = (p) => `${p}_${++nextId}`;
const part = (p, def) => ({ id: idFor(p), material: "plastic", canCollide: true, ...def });

// ---- the treadmill: a real machine, coloured by tier ------------------------------
// Returns { beltIds, stripeIds, glowIds, screenId } so game.js can recolour the belt and
// light the glow bars when you buy a better treadmill.
function buildTreadmill(parts, tm) {
  const beltIds = [], stripeIds = [], glowIds = [];
  const bx = TREAD.cx, bz = TREAD.cz, bw = TREAD.w, bd = TREAD.d;
  const deckY = FLOOR_TOP + 0.7;

  parts.push(part("tm_motor", { size: [bw + 1.4, 2.2, 3], position: [bx, FLOOR_TOP + 1.1, bz - bd / 2 - 0.5], color: C.plazaTrim, material: "metal" }));
  const motorTrim = part("tm_motortrim", { size: [bw + 0.6, 0.5, 3.2], position: [bx, FLOOR_TOP + 2.3, bz - bd / 2 - 0.5], color: tm.belt, material: tm.mat, canCollide: false });
  parts.push(motorTrim); beltIds.push(motorTrim.id);

  const deck = { id: idFor("tm_deck"), size: [bw, 0.6, bd], position: [bx, deckY, bz], color: "#14161c", material: "metal", canCollide: true };
  parts.push(deck);
  const surf = { id: idFor("tm_surf"), size: [bw - 0.6, 0.24, bd - 0.4], position: [bx, deckY + 0.42, bz], color: tm.belt, material: tm.mat, canCollide: false };
  parts.push(surf); beltIds.push(surf.id);
  for (let s = 0; s < 8; s++) {
    const st = { id: idFor("tm_stripe"), size: [bw - 1.4, 0.1, 0.7], position: [bx, deckY + 0.56, bz - bd / 2 + 1.4 + s * 1.9], color: tm.stripe, material: tm.mat, canCollide: false };
    parts.push(st); stripeIds.push(st.id);
  }

  for (const side of [-1, 1]) {
    parts.push(part("tm_side", { size: [0.8, 1.4, bd], position: [bx + side * (bw / 2 + 0.4), FLOOR_TOP + 1.1, bz], color: "#20242e", material: "metal" }));
    const railBar = part("tm_railbar", { shape: "cylinder", size: [0.35, bd, 0.35], position: [bx + side * (bw / 2 + 0.4), FLOOR_TOP + 2.2, bz], rotation: [90, 0, 0], color: tm.rail, material: tm.mat, canCollide: false });
    parts.push(railBar); beltIds.push(railBar.id);
    parts.push(part("tm_upright", { shape: "cylinder", size: [0.4, 2.6, 0.4], position: [bx + side * (bw / 2 + 0.4), FLOOR_TOP + 2.3, bz + bd / 2 - 0.6], color: "#20242e", material: "metal" }));
  }
  parts.push(part("tm_handle", { shape: "cylinder", size: [0.35, bw + 1.6, 0.35], position: [bx, FLOOR_TOP + 3.5, bz + bd / 2 - 0.6], rotation: [0, 0, 90], color: tm.rail, material: tm.mat, canCollide: false }));
  parts.push(part("tm_console", { size: [4.4, 1.8, 0.6], position: [bx, FLOOR_TOP + 3.4, bz + bd / 2 - 0.3], color: "#181b22", material: "metal", canCollide: false }));
  const screen = { id: idFor("tm_screen"), size: [3.6, 1.2, 0.12], position: [bx, FLOOR_TOP + 3.5, bz + bd / 2 - 0.05], color: tm.glow || "#2a3550", material: "neon", canCollide: false };
  parts.push(screen); glowIds.push(screen.id);

  for (const side of [-1, 1]) {
    const g = { id: idFor("tm_glow"), size: [0.3, 0.14, bd - 1], position: [bx + side * (bw / 2 - 0.6), deckY + 0.58, bz], color: tm.glow || tm.stripe, material: "neon", canCollide: false };
    parts.push(g); glowIds.push(g.id);
  }

  // Each treadmill wears its OWN detail (added 2026-09-13) — not just a recolour. These
  // are decorative parts unique to the tier, hung around the machine.
  buildTreadmillDetail(parts, tm, bx, bz, bw, bd);

  return { beltIds, stripeIds, glowIds, screenId: screen.id };
}

// A distinct ornament set per treadmill tier. Engine parts are box/cylinder/sphere/wedge
// only (no cone/torus), so every flourish is built from those.
function buildTreadmillDetail(parts, tm, bx, bz, bw, bd) {
  const y0 = FLOOR_TOP;
  const frontZ = bz + bd / 2;   // the console end
  const backZ = bz - bd / 2;    // the motor end
  const dp = (o) => parts.push(part("tm_det_" + tm.id, { canCollide: false, ...o }));
  const L = bx - bw / 2 - 0.4, R = bx + bw / 2 + 0.4; // rail lines
  switch (tm.id) {
    case "rusty":
      for (const [x, z] of [[L, backZ + 3], [R, bz], [bx - 2, frontZ - 1]]) dp({ shape: "sphere", size: [0.9, 0.7, 0.9], position: [x, y0 + 1.4, z], color: "#7a3a1a" });
      dp({ shape: "cylinder", size: [0.3, 1, 0.3], position: [R, y0 + 2.6, backZ + 2], rotation: [0, 0, 40], color: "#3a2f24", material: "metal" }); // a loose bolt sticking out
      break;
    case "dirt":
      for (const [x, z] of [[L, bz + 2], [R, bz - 2], [bx + 2, backZ + 2]]) dp({ shape: "sphere", size: [1, 0.8, 1], position: [x, y0 + 1.1, z], color: "#4a3320" });
      dp({ shape: "cylinder", size: [0.2, 1.2, 0.2], position: [L, y0 + 2, bz + 2], color: "#37a04c" }); // a weed
      dp({ shape: "sphere", size: [0.8, 0.8, 0.8], position: [L, y0 + 2.6, bz + 2], color: "#2f8f4a" });
      break;
    case "wooden":
      for (let i = 0; i < 3; i++) dp({ size: [0.2, 0.1, bd - 2], position: [bx - 2 + i * 2, y0 + 1.35, bz], color: "#5f3d20", material: "wood" }); // grain lines
      dp({ shape: "sphere", size: [0.6, 0.6, 0.6], position: [bx + 1.5, y0 + 1.4, bz + 3], color: "#4a3320", material: "wood" }); // a knot
      break;
    case "metal":
      for (const [x, z] of [[L, backZ + 2], [L, frontZ - 2], [R, backZ + 2], [R, frontZ - 2]]) dp({ shape: "sphere", size: [0.5, 0.5, 0.5], position: [x, y0 + 1.5, z], color: "#c7cdd9", material: "metal" }); // rivets
      dp({ shape: "cylinder", size: [1.2, 0.3, 1.2], position: [bx - 3, y0 + 3.7, frontZ - 0.2], rotation: [90, 0, 0], color: "#20242e", material: "metal" }); // a gauge
      break;
    case "stone":
      for (const [x, z, s] of [[L, bz + 3, 1], [R, bz - 3, 1.2], [bx + 2, backZ + 2, 0.9]]) dp({ size: [1.4 * s, 1.2 * s, 1.4 * s], position: [x, y0 + 1.2, z], rotation: [0, x * 30, 0], color: "#4a5165" }); // rough chunks
      break;
    case "dplate":
      for (let i = 0; i < 5; i++) dp({ shape: "wedge", size: [0.5, 0.4, 0.5], position: [bx - 3 + i * 1.5, y0 + 1.4, bz + 2], rotation: [0, 45, 0], color: "#c7cdd9", material: "metal" }); // tread bumps
      break;
    case "gold":
      dp({ size: [2, 0.5, 0.6], position: [bx, y0 + 4.6, frontZ - 0.2], color: "#ffd93d", material: "metal" }); // crown base
      for (const x of [-0.7, 0, 0.7]) dp({ size: [0.4, 0.7, 0.5], position: [bx + x, y0 + 5.1, frontZ - 0.2], color: "#ffd93d", material: "metal" }); // crown points
      for (const [x, z] of [[L, bz + 2], [R, bz - 2]]) dp({ shape: "cylinder", size: [0.7, 0.15, 0.7], position: [x, y0 + 1.5, z], rotation: [90, 0, 0], color: "#f5cd30", material: "metal" }); // coins
      break;
    case "diamond":
      for (const [x, z] of [[L, bz + 3], [R, bz - 3], [bx, backZ + 1.5]]) dp({ shape: "wedge", size: [0.8, 1.4, 0.8], position: [x, y0 + 2.6, z], rotation: [180, x * 40, 0], color: "#7af0ff", material: "glass" }); // gem shards
      break;
    case "cherry":
      dp({ shape: "cylinder", size: [0.3, 3, 0.3], position: [L, y0 + 2.5, backZ + 3], rotation: [0, 0, 20], color: "#6b4423", material: "wood" }); // branch
      for (const [x, z] of [[L - 0.5, backZ + 3.5], [L + 0.6, backZ + 2], [R, bz + 1], [bx + 2, frontZ - 1]]) dp({ shape: "sphere", size: [0.6, 0.6, 0.6], position: [x, y0 + 3.6, z], color: "#ff9ec8", material: "neon" }); // blossoms
      break;
    case "speedster":
      for (let i = 0; i < 4; i++) dp({ size: [1.8 - i * 0.3, 0.2, 0.2], position: [R + 0.6, y0 + 2.5, bz - 2 + i * 1.3], color: "#40a0ff", material: "neon" }); // speed lines
      dp({ shape: "wedge", size: [bw + 1, 0.4, 1.2], position: [bx, y0 + 3.4, backZ - 0.4], rotation: [200, 0, 0], color: "#1a4fbf", material: "neon" }); // spoiler
      break;
    case "hacker":
      for (let i = 0; i < 6; i++) dp({ size: [0.4 + (i % 3) * 0.4, 0.5, 0.1], position: [L - 0.5, y0 + 1.4 + i * 0.8, bz - 2 + (i % 2) * 3], color: "#3ddc84", material: "neon" }); // code bars
      break;
    case "devil":
      for (const x of [-1, 1]) dp({ shape: "wedge", size: [0.6, 1.6, 0.6], position: [bx + x * 1.4, y0 + 5, frontZ - 0.2], rotation: [0, 0, x * 18], color: "#ff3a1a", material: "lava" }); // horns
      dp({ shape: "cylinder", size: [0.3, 4, 0.3], position: [bx, y0 + 2, backZ - 1], rotation: [30, 0, 0], color: "#c0281a", material: "lava" }); // tail
      dp({ shape: "sphere", size: [0.7, 1, 0.7], position: [bx, y0 + 4, backZ - 2.5], color: "#ff5a2f", material: "lava" }); // tail tip
      break;
    case "heavenly":
      dp({ shape: "cylinder", size: [2.4, 0.2, 2.4], position: [bx, y0 + 6, bz], rotation: [90, 0, 0], color: "#fff0b0", material: "neon" }); // halo (flat ring-ish)
      for (const x of [-1, 1]) dp({ shape: "wedge", size: [2.6, 3, 0.4], position: [bx + x * (bw / 2 + 1.4), y0 + 3.4, bz], rotation: [0, x * 90, 0], color: "#fbf6e8", material: "neon" }); // wings
      break;
    case "godly":
      dp({ size: [2.6, 0.6, 0.7], position: [bx, y0 + 5.4, frontZ - 0.2], color: "#ffd93d", material: "neon" });
      for (const x of [-1, -0.5, 0, 0.5, 1]) dp({ shape: "wedge", size: [0.4, 1, 0.5], position: [bx + x * 1, y0 + 6, frontZ - 0.2], color: "#fffbe0", material: "neon" }); // radiant crown
      break;
    case "tornado":
      for (let i = 0; i < 5; i++) dp({ shape: "cylinder", size: [2.4 - i * 0.4, 0.6, 2.4 - i * 0.4], position: [bx, y0 + 4 + i * 1.2, bz], rotation: [0, i * 40, 0], color: "#a0c0ff", material: "neon" }); // funnel
      break;
    case "flash":
      for (const [x, z] of [[L - 0.5, bz + 2], [R + 0.5, bz - 2], [bx, backZ - 0.5]]) {
        dp({ shape: "wedge", size: [0.5, 1.6, 0.3], position: [x, y0 + 3, z], rotation: [0, 0, 25], color: "#ffee00", material: "neon" });
        dp({ shape: "wedge", size: [0.5, 1.6, 0.3], position: [x + 0.4, y0 + 1.8, z], rotation: [0, 0, -25], color: "#ffee00", material: "neon" });
      }
      break;
    case "lightning":
      // the ultimate: a storm cloud over the deck with electric arcs shooting down
      dp({ shape: "sphere", size: [4, 1.6, 3], position: [bx, y0 + 8, bz], color: "#2a3550" });
      dp({ shape: "sphere", size: [2.6, 1.2, 2.2], position: [bx - 1.6, y0 + 8.2, bz + 1], color: "#3a4560" });
      dp({ shape: "sphere", size: [2.6, 1.2, 2.2], position: [bx + 1.6, y0 + 8.2, bz - 1], color: "#3a4560" });
      for (const [x, z, r] of [[bx - 1, bz + 2, 12], [bx + 1.4, bz - 2, -14], [bx, backZ + 2, 8]]) {
        dp({ shape: "wedge", size: [0.5, 2.4, 0.4], position: [x, y0 + 6, z], rotation: [0, 0, r], color: "#7ab0ff", material: "neon" });
        dp({ shape: "wedge", size: [0.5, 2.4, 0.4], position: [x + 0.5, y0 + 3.6, z], rotation: [0, 0, -r], color: "#e8f0ff", material: "neon" });
      }
      for (const side of [-1, 1]) dp({ shape: "sphere", size: [0.6, 0.6, 0.6], position: [bx + side * (bw / 2 + 0.4), y0 + 3.2, frontZ - 0.6], color: "#3a5cff", material: "neon" }); // charged rail caps
      break;
    default:
      break;
  }
}

// ---- a Keeper: a proper single-eyed guard robot -----------------------------------
function keeperParts(i, zone) {
  const spec = [
    { key: "hips", shape: "box", size: [2.6, 1.2, 1.9], off: [0, 1.7, 0], color: C.keeperDark, mat: "metal" },
    { key: "body", shape: "box", size: [2.4, 2.6, 1.7], off: [0, 3.3, 0], color: zone.color, mat: "metal" },
    { key: "chest", shape: "box", size: [1.8, 1.0, 0.3], off: [0, 3.6, -0.85], color: C.keeperDark, mat: "metal" },
    { key: "vent", shape: "box", size: [1.4, 0.2, 0.2], off: [0, 3.1, -0.9], color: zone.color, mat: "neon" },
    { key: "neck", shape: "cylinder", size: [0.9, 0.6, 0.9], off: [0, 4.8, 0], color: C.keeperDark, mat: "metal" },
    { key: "head", shape: "box", size: [1.8, 1.5, 1.7], off: [0, 5.6, 0], color: zone.color, mat: "metal" },
    { key: "visor", shape: "box", size: [1.7, 0.7, 0.2], off: [0, 5.7, -0.86], color: "#0e1018", mat: "metal" },
    { key: "eye", shape: "sphere", size: [0.7, 0.7, 0.7], off: [0, 5.7, -1.0], color: C.keeperEye, mat: "neon" },
    { key: "antenna", shape: "cylinder", size: [0.14, 1.4, 0.14], off: [0.5, 6.9, 0], color: C.keeperTrim, mat: "metal" },
    { key: "anttip", shape: "sphere", size: [0.35, 0.35, 0.35], off: [0.5, 7.6, 0], color: zone.color, mat: "neon" },
    { key: "shoulderL", shape: "sphere", size: [1.0, 1.0, 1.0], off: [-1.5, 4.1, 0], color: C.keeperDark, mat: "metal" },
    { key: "shoulderR", shape: "sphere", size: [1.0, 1.0, 1.0], off: [1.5, 4.1, 0], color: C.keeperDark, mat: "metal" },
    { key: "armL", shape: "cylinder", size: [0.6, 2.6, 0.6], off: [-1.7, 2.9, 0.1], rotation: [12, 0, 8], color: zone.color, mat: "metal" },
    { key: "armR", shape: "cylinder", size: [0.6, 2.6, 0.6], off: [1.7, 2.9, 0.1], rotation: [12, 0, -8], color: zone.color, mat: "metal" },
    { key: "fistL", shape: "sphere", size: [0.7, 0.7, 0.7], off: [-1.9, 1.7, 0.4], color: C.keeperTrim, mat: "metal" },
    { key: "fistR", shape: "sphere", size: [0.7, 0.7, 0.7], off: [1.9, 1.7, 0.4], color: C.keeperTrim, mat: "metal" },
    { key: "legL", shape: "cylinder", size: [0.8, 2.2, 0.8], off: [-0.7, 0.7, 0], color: C.keeperDark, mat: "metal" },
    { key: "legR", shape: "cylinder", size: [0.8, 2.2, 0.8], off: [0.7, 0.7, 0], color: C.keeperDark, mat: "metal" },
    { key: "footL", shape: "wedge", size: [0.9, 0.5, 1.4], off: [-0.7, 0.2, -0.3], color: C.keeperTrim, mat: "metal" },
    { key: "footR", shape: "wedge", size: [0.9, 0.5, 1.4], off: [0.7, 0.2, -0.3], color: C.keeperTrim, mat: "metal" },
  ];
  return spec.map((sPart) => ({
    key: sPart.key, off: sPart.off,
    def: part("keeper" + i, { shape: sPart.shape, size: sPart.size, rotation: sPart.rotation || [0, 0, 0], color: sPart.color, material: sPart.mat || "metal", canCollide: false }),
  }));
}

// ---- biome scenery so each zone reads as a different place ------------------------
function zoneScenery(parts, i, zone, ex, px) {
  const midX = (ex + px) / 2;
  const put = (o) => parts.push(part("scn" + i, { canCollide: false, ...o }));
  if (zone.key === "grass") {
    for (const [x, z, sc] of [[ex + 12, -14, 1.1], [px - 10, 14, 0.9], [midX, -16, 1.3]]) {
      put({ shape: "cylinder", size: [1.4 * sc, 6 * sc, 1.4 * sc], position: [x, FLOOR_TOP + 3 * sc, z], color: "#6b4423", material: "wood", canCollide: true });
      put({ shape: "sphere", size: [6 * sc, 6 * sc, 6 * sc], position: [x, FLOOR_TOP + 7 * sc, z], color: "#2f8f4a" });
    }
    for (const [x, z] of [[ex + 8, 6], [midX - 6, -8], [px - 6, 10], [midX + 8, 12]]) put({ shape: "sphere", size: [0.9, 0.9, 0.9], position: [x, FLOOR_TOP + 0.9, z], color: "#e0245e", material: "neon" });
  } else if (zone.key === "ridge") {
    for (const [x, z, h] of [[ex + 10, -15, 8], [midX, 15, 11], [px - 8, -14, 9]]) {
      put({ shape: "wedge", size: [5, h, 5], position: [x, FLOOR_TOP + h / 2, z], color: "#7d8694", material: "plastic" });
      put({ shape: "wedge", size: [4.2, h * 0.5, 4.2], position: [x, FLOOR_TOP + h * 0.75, z], color: "#bfe6f2", material: "plastic" });
    }
  } else if (zone.key === "neon") {
    for (const [x, z, h] of [[ex + 8, -16, 14], [midX - 4, 16, 18], [px - 6, -15, 12], [midX + 10, 15, 16]]) {
      put({ size: [5, h, 5], position: [x, FLOOR_TOP + h / 2, z], color: "#1a1030" });
      for (let w = 0; w < 4; w++) put({ size: [5.2, 0.5, 0.6], position: [x, FLOOR_TOP + 3 + w * 3.5, z + 2.55], color: zone.color, material: "neon" });
    }
  } else if (zone.key === "storm") {
    for (const [x, z] of [[ex + 10, -14], [midX, 15], [px - 8, -13]]) {
      put({ shape: "cylinder", size: [1, 9, 1], position: [x, FLOOR_TOP + 4.5, z], color: "#2e3345", material: "metal", canCollide: true });
      put({ shape: "sphere", size: [4, 2.4, 4], position: [x, FLOOR_TOP + 10, z], color: "#3a4363" });
      put({ size: [0.3, 3, 0.3], position: [x + 1, FLOOR_TOP + 6, z], rotation: [0, 0, 18], color: "#ffe23a", material: "neon" });
    }
  } else if (zone.key === "volcano") {
    for (const [x, z] of [[ex + 9, -15], [midX + 4, 15], [px - 7, -14]]) {
      put({ shape: "wedge", size: [4, 6 + (x % 3), 4], position: [x, FLOOR_TOP + 3, z], rotation: [0, x * 30, 0], color: "#1b0e0e" });
      put({ shape: "sphere", size: [1.4, 1.4, 1.4], position: [x, FLOOR_TOP + 6.5, z], color: "#ff5a1f", material: "lava" });
    }
    for (let g = 0; g < 5; g++) put({ size: [8, 0.14, 0.7], position: [midX + (g - 2) * 6, FLOOR_TOP + 0.16, (g % 2 ? 6 : -6)], rotation: [0, g * 25, 0], color: "#ff5a1f", material: "lava" });
  } else if (zone.key === "light") {
    for (const [x, z] of [[ex + 9, -15], [midX, 16], [px - 7, -14], [midX + 8, 14]]) {
      put({ shape: "cylinder", size: [1.2, 13, 1.2], position: [x, FLOOR_TOP + 6.5, z], color: "#101018" });
      put({ shape: "sphere", size: [2.2, 2.2, 2.2], position: [x, FLOOR_TOP + 13.5, z], color: zone.color, material: "neon" });
    }
    for (let s = 0; s < 6; s++) put({ size: [0.5, 0.5, LANE_HALF_Z * 2], position: [midX - 20 + s * 8, FLOOR_TOP + 8, 0], color: "#fff59e", material: "neon" });
  } else if (zone.key === "void") {
    // a vast dark expanse: a black overlay, a black hole with a glowing accretion band,
    // drifting planets, and stars scattered high overhead.
    put({ size: [180, 0.14, LANE_HALF_Z * 2], position: [px + 40, FLOOR_TOP + 0.16, 0], color: "#05030f" });
    put({ shape: "sphere", size: [14, 14, 14], position: [px + 30, FLOOR_TOP + 18, 0], color: "#0a0616" }); // the black hole
    put({ shape: "cylinder", size: [24, 0.5, 24], position: [px + 30, FLOOR_TOP + 18, 0], rotation: [70, 0, 20], color: "#7a3fd0", material: "neon" }); // accretion band
    put({ shape: "cylinder", size: [19, 0.4, 19], position: [px + 30, FLOOR_TOP + 18, 0], rotation: [70, 0, 20], color: "#35a3e0", material: "neon" });
    for (const [x, z, s, c] of [[px + 8, -18, 4, "#35a3e0"], [px + 60, 16, 6, "#c02a6a"], [px + 90, -14, 5, "#e0b23a"]]) put({ shape: "sphere", size: [s, s, s], position: [x, FLOOR_TOP + 12, z], color: c });
    for (let s = 0; s < 40; s++) put({ shape: "sphere", size: [0.5, 0.5, 0.5], position: [px - 20 + s * 6, FLOOR_TOP + 8 + (s % 7) * 2.5, ((s * 53) % 34) - 17], color: "#ffffff", material: "neon" });
  } else if (zone.key === "flash") {
    // THE ultimate: a blinding blaze — a golden expanse, a GIANT sun, and lightning
    // pillars marching off into the light. The best-looking place in the game.
    put({ size: [640, 0.16, LANE_HALF_Z * 2], position: [px + 320, FLOOR_TOP + 0.18, 0], color: "#ffe23a", material: "neon" });
    put({ shape: "sphere", size: [46, 46, 46], position: [px + 120, FLOOR_TOP + 34, 0], color: "#fff59e", material: "neon" }); // the giant sun
    put({ shape: "sphere", size: [58, 58, 58], position: [px + 120, FLOOR_TOP + 34, 0], color: "#ffd93d" });
    for (let s = 0; s < 16; s++) {
      const gx = px + 20 + s * 38;
      put({ shape: "cylinder", size: [2, WALL_H + 8, 2], position: [gx, FLOOR_TOP + (WALL_H + 8) / 2, (s % 2 ? 1 : -1) * (LANE_HALF_Z - 1)], color: "#fffbe0", material: "neon" });
      put({ shape: "wedge", size: [1, 4, 0.6], position: [gx, FLOOR_TOP + 7, (s % 2 ? 1 : -1) * (LANE_HALF_Z - 3)], rotation: [0, 0, 20], color: "#3a5cff", material: "neon" }); // a bolt
    }
    for (let s = 0; s < 30; s++) put({ shape: "sphere", size: [0.7, 0.7, 0.7], position: [px + 10 + s * 20, FLOOR_TOP + 6 + (s % 5) * 3, ((s * 47) % 30) - 15], color: "#ffffff", material: "neon" });
  }
}

export function buildWorld(treadmillId) {
  nextId = 0;
  const parts = [];
  const tm = treadmillById(treadmillId);
  const lastX = zonePedestalX(ZONES.length - 1);
  // extra floor past the last (Flash) crate so its blazing expanse is walkable spectacle
  const floorLen = lastX + 700;

  parts.push(part("ground", { size: [floorLen, 4, LANE_HALF_Z * 2 + 4], position: [floorLen / 2 - 20, FLOOR_TOP - 2, 0], color: C.plaza }));
  for (const side of [-1, 1]) {
    parts.push(part("wall", { size: [floorLen, WALL_H, 2], position: [floorLen / 2 - 20, FLOOR_TOP + WALL_H / 2, side * (LANE_HALF_Z + 1)], color: C.wall }));
    parts.push(part("walltrim", { size: [floorLen, 0.6, 2.3], position: [floorLen / 2 - 20, FLOOR_TOP + WALL_H, side * (LANE_HALF_Z + 1)], color: C.wallTrim, material: "neon", canCollide: false }));
  }
  parts.push(part("wallback", { size: [2, WALL_H, LANE_HALF_Z * 2 + 4], position: [-21, FLOOR_TOP + WALL_H / 2, 0], color: C.wall }));

  parts.push(part("plaza", { shape: "cylinder", size: [26, 0.3, 26], position: [0, FLOOR_TOP + 0.12, 0], color: C.plazaTrim, canCollide: false }));
  const tread = buildTreadmill(parts, tm);

  const upgradeId = idFor("upgradepad");
  parts.push({ id: upgradeId, shape: "cylinder", size: [6, 0.4, 6], position: [UPGRADE_PAD.cx, FLOOR_TOP + 0.2, UPGRADE_PAD.cz], color: C.pad, material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "sp_upgrade", cooldownS: 1.5 }] });
  parts.push(part("upgradepost", { shape: "cylinder", size: [0.8, 4, 0.8], position: [UPGRADE_PAD.cx - 3.7, FLOOR_TOP + 2, UPGRADE_PAD.cz], color: C.plazaTrim, material: "metal" }));
  parts.push(part("upgradesign", { size: [3.4, 1.6, 0.3], position: [UPGRADE_PAD.cx - 3.7, FLOOR_TOP + 4.4, UPGRADE_PAD.cz], color: C.pad, material: "neon", canCollide: false }));

  // ---- the SAFE-ZONE boundary: a big glowing gate at SAFE_X ----
  // Cross back over this line carrying a crate and it is yours; Keepers never pass it.
  for (const side of [-1, 1]) {
    parts.push(part("safepost", { size: [2, WALL_H + 2, 2], position: [SAFE_X, FLOOR_TOP + (WALL_H + 2) / 2, side * (LANE_HALF_Z + 0.5)], color: "#3ddc84", material: "metal" }));
  }
  parts.push(part("safearch", { size: [2.4, 2, LANE_HALF_Z * 2 + 2], position: [SAFE_X, FLOOR_TOP + WALL_H + 1, 0], color: "#3ddc84", material: "neon", canCollide: false }));
  parts.push(part("safeline", { size: [1.2, 0.3, LANE_HALF_Z * 2], position: [SAFE_X, FLOOR_TOP + 0.2, 0], color: "#3ddc84", material: "neon", canCollide: false }));
  parts.push(part("safesign", { size: [7, 2.4, 0.4], position: [SAFE_X, FLOOR_TOP + WALL_H - 2, LANE_HALF_Z - 0.4], color: "#0f2a18", canCollide: false }));
  // a faint danger tint over the whole field past the safe line
  parts.push(part("dangerfloor", { size: [floorLen - SAFE_X, 0.16, LANE_HALF_Z * 2], position: [(SAFE_X + floorLen - 20) / 2 + 10, FLOOR_TOP + 0.09, 0], color: "#3a1520", canCollide: false }));

  const zones = [];
  for (let i = 0; i < ZONES.length; i++) {
    const zone = ZONES[i];
    const px = zonePedestalX(i);
    // a coloured disc under each crate so its zone still reads
    const discR = zone.key === "flash" ? 44 : zone.key === "void" ? 34 : 22;
    parts.push(part("zonedisc" + i, { shape: "cylinder", size: [discR, 0.2, discR], position: [px, FLOOR_TOP + 0.12, 0], color: zone.color, canCollide: false }));

    // A LOW walkable plinth so you can run right up and grab the crate — the crate sits
    // at capsule height, its sensor generous, and nothing tall blocks the approach.
    parts.push(part("plinth" + i, { shape: "cylinder", size: [7, 0.6, 7], position: [px, FLOOR_TOP + 0.3, 0], color: C.pedTrim, material: "metal", canCollide: true }));
    parts.push(part("plinthglow" + i, { shape: "cylinder", size: [7.3, 0.2, 7.3], position: [px, FLOOR_TOP + 0.65, 0], color: zone.color, material: "neon", canCollide: false }));
    const crateId = idFor("crate" + i);
    parts.push({ id: crateId, size: [3.6, 3.6, 3.6], position: [px, FLOOR_TOP + 2.4, 0], color: C.crate, material: "wood", canCollide: false, behaviors: [{ type: "touchEvent", event: "sp_crate" + i, cooldownS: 0.4 }] });
    parts.push(part("cratelid" + i, { size: [3.9, 0.5, 3.9], position: [px, FLOOR_TOP + 4.3, 0], color: C.crateTrim, material: "neon", canCollide: false }));
    parts.push(part("crateband1" + i, { size: [3.7, 0.5, 3.7], position: [px, FLOOR_TOP + 2.4, 0], color: C.crateTrim, canCollide: false }));
    parts.push(part("crateband2" + i, { size: [0.5, 3.7, 3.7], position: [px, FLOOR_TOP + 2.4, 0], color: C.crateDark, canCollide: false }));

    const keeper = keeperParts(i, zone);
    for (const k of keeper) parts.push(k.def);
    zoneScenery(parts, i, zone, px - 26, px);

    zones.push({ key: zone.key, crateId, pedestalX: px, keeperHomeX: zoneKeeperHomeX(i), keeper: keeper.map((k) => ({ id: k.def.id, off: k.off })) });
  }

  return { parts, tread, upgradeId, zones, floorLen, safeX: SAFE_X };
}
