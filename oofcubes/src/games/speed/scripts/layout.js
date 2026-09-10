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

export const LANE_HALF_Z = 9;
export const WALL_H = 12;

export const TREAD = Object.freeze({ cx: 0, cz: 0, w: 10, d: 16 });
export const UPGRADE_PAD = Object.freeze({ cx: 0, cz: 12 });

const ZONE_PITCH = 66;
const ZONE0_X = 34;
const LANE_LEN = 48;

export function zoneEntranceX(i) { return ZONE0_X + i * ZONE_PITCH; }
export function zonePedestalX(i) { return zoneEntranceX(i) + LANE_LEN; }
export function zoneKeeperHomeX(i) { return zoneEntranceX(i) + LANE_LEN * 0.55; }

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
  return { beltIds, stripeIds, glowIds, screenId: screen.id };
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
  }
}

export function buildWorld(treadmillId) {
  nextId = 0;
  const parts = [];
  const tm = treadmillById(treadmillId);
  const lastX = zonePedestalX(ZONES.length - 1);
  const floorLen = lastX + 30;

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

  const zones = [];
  for (let i = 0; i < ZONES.length; i++) {
    const zone = ZONES[i];
    const ex = zoneEntranceX(i);
    const px = zonePedestalX(i);
    parts.push(part("zonefloor", { size: [LANE_LEN + 8, 0.22, LANE_HALF_Z * 2], position: [(ex + px) / 2, FLOOR_TOP + 0.11, 0], color: zone.color, canCollide: false }));

    const entranceId = idFor("entrance" + i);
    parts.push({ id: entranceId, size: [3, 0.4, LANE_HALF_Z * 2 - 2], position: [ex, FLOOR_TOP + 0.2, 0], color: "#f2f4fa", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "sp_zone" + i, cooldownS: 0.5 }] });
    for (const side of [-1, 1]) {
      parts.push(part("gatepost" + i, { size: [1.4, 10, 1.4], position: [ex, FLOOR_TOP + 5, side * (LANE_HALF_Z - 0.4)], color: zone.color, material: "metal" }));
    }
    parts.push(part("gatetop" + i, { size: [2.2, 1.6, LANE_HALF_Z * 2], position: [ex, FLOOR_TOP + 10, 0], color: zone.color, material: "neon", canCollide: false }));
    parts.push(part("sign" + i, { size: [5, 2.4, 0.4], position: [ex, FLOOR_TOP + 7, LANE_HALF_Z - 0.6], color: C.sign, canCollide: false }));

    parts.push(part("pedbase" + i, { shape: "cylinder", size: [6, 1, 6], position: [px, FLOOR_TOP + 0.5, 0], color: C.pedTrim, material: "metal", canCollide: true }));
    parts.push(part("pedestal" + i, { shape: "cylinder", size: [4.6, 2, 4.6], position: [px, FLOOR_TOP + 1.6, 0], color: C.pedestal, material: "metal" }));
    parts.push(part("pedglow" + i, { shape: "cylinder", size: [4.8, 0.2, 4.8], position: [px, FLOOR_TOP + 2.6, 0], color: zone.color, material: "neon", canCollide: false }));
    const crateId = idFor("crate" + i);
    parts.push({ id: crateId, size: [3, 3, 3], position: [px, FLOOR_TOP + 4.1, 0], color: C.crate, material: "wood", canCollide: false, behaviors: [{ type: "touchEvent", event: "sp_crate" + i, cooldownS: 0.4 }] });
    parts.push(part("cratelid" + i, { size: [3.3, 0.5, 3.3], position: [px, FLOOR_TOP + 5.7, 0], color: C.crateTrim, material: "neon", canCollide: false }));
    parts.push(part("crateband1" + i, { size: [3.2, 0.5, 3.2], position: [px, FLOOR_TOP + 4.1, 0], color: C.crateTrim, canCollide: false }));
    parts.push(part("crateband2" + i, { size: [0.5, 3.2, 3.2], position: [px, FLOOR_TOP + 4.1, 0], color: C.crateDark, canCollide: false }));

    const keeper = keeperParts(i, zone);
    for (const k of keeper) parts.push(k.def);
    zoneScenery(parts, i, zone, ex, px);

    zones.push({ key: zone.key, entranceId, crateId, entranceX: ex, pedestalX: px, keeperHomeX: zoneKeeperHomeX(i), keeper: keeper.map((k) => ({ id: k.def.id, off: k.off })) });
  }

  return { parts, tread, upgradeId, zones, floorLen };
}
