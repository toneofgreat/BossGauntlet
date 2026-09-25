// src/games/tycoon/scripts/tower.js — floors 2 and 3 of the plot, and the detail that
// makes floor 1 look like a factory rather than a belt in a box. Spec 10 §5.13 owns this
// file (added 2026-09-25).
//
// Three things worth knowing before reading:
//
// 1. **Each floor is self-contained.** Its droppers drop onto ITS belt and ride to ITS
//    collector. No chutes between floors, no holes in the slabs: a drop falls 6 studs and
//    rides 50, exactly like the ground floor's, and `inCollector` tests every owned
//    floor's region. That is what let two more floors ship without touching the drop
//    lifecycle at all.
// 2. **The tower is offset from the helipad.** Floors 2 and 3 cover x ±34, z −18…+50,
//    which leaves the Boss Chopper's pad at z −30 under open sky and keeps the Roof Ramp
//    (x 44) outside the wall line — you walk up the ramp, in through the east doorway.
// 3. **No dropper is gated behind another purchase.** Every dropper row in config.js has
//    `requires: null`, on all three floors: the only thing between a player and a dropper
//    is its price. A FLOOR is a building, and a floor never requires a dropper either.

import { LAYOUT, TUNING, fmt } from "./config.js";

const FL = LAYOUT.FLOORS;

// ---------------------------------------------------------------------------
// small helpers — the same shape as plot.js's, passed in so this module never
// reaches into the Place's state bookkeeping itself
// ---------------------------------------------------------------------------

function part(size, position, color, extra) {
  return Object.assign({
    shape: "box", size, position, rotation: [0, 0, 0], color,
    material: "plastic", transparency: 0, anchored: true, canCollide: true, behaviors: [],
  }, extra);
}

// ---------------------------------------------------------------------------
// one floor's production line: belt, side walls, collector bin
// ---------------------------------------------------------------------------

export function buildFloorLine(add, label, floorIndex) {
  const f = FL[floorIndex];
  const bx = f.beltX;
  const beltY = f.top + 0.5; // the belt's centre; its surface sits at f.top + 1
  add(part([6, 1, f.beltLength], [bx, beltY, f.beltZ], LAYOUT.BELT_COLOR, {
    behaviors: [{ type: "conveyor", direction: [0, 0, -1], speed: TUNING.CONVEYOR_SPEED }],
  }));
  for (const sx of [-1, 1]) {
    add(part([0.5, 2, f.beltLength], [bx + sx * LAYOUT.BELT_WALL_X, beltY + 1, f.beltZ], LAYOUT.BELT_WALL_COLOR));
  }
  // Rollers under the belt, so it reads as machinery and not as a painted stripe.
  // SIZE ORDER MATTERS: a cylinder is [diameter, length, diameter] along its OWN axis
  // (spec 03 §3.1), so a roller lying across the belt is [0.8, 7.4, 0.8] turned a quarter
  // turn — [7.4, 0.8, 0.8] draws a 0.8-wide disc and collides as an OBB 7.4 studs TALL.
  for (let z = f.beltZ - f.beltLength / 2 + 6; z <= f.beltZ + f.beltLength / 2 - 6; z += 14) {
    add(part([0.8, 7.4, 0.8], [bx, beltY - 0.6, Math.round(z * 10) / 10], "#5c6478", {
      shape: "cylinder", rotation: [0, 0, 90], material: "metal",
    }));
  }
  // The bin, its glow, and a chute hood over it.
  const binZ = f.binZ;
  add(part([10, 1, 8], [bx, f.top + 0.5, binZ], LAYOUT.BIN_COLOR, { material: "metal" }));
  add(part([10, 4, 1], [bx, f.top + 2.5, binZ - 4.5], LAYOUT.BIN_COLOR));
  add(part([10, 0.4, 8], [bx, f.top + 2.1, binZ], LAYOUT.BIN_GLOW_COLOR, {
    material: "neon", transparency: 0.5, canCollide: false,
    light: { color: LAYOUT.BIN_GLOW_COLOR, intensity: 1.6, range: 26 },
  }));
  for (const sx of [-1, 1]) {
    add(part([1, 5, 8], [bx + sx * 5.5, f.top + 3, binZ], "#2c2c34", { material: "metal" }));
  }
  add(part([12, 1, 9], [bx, f.top + 5.5, binZ], "#3a3a44", { material: "metal" }));
  label("collector" + floorIndex, [bx, f.top + 8, binZ], ["COLLECTOR"], LAYOUT.BIN_GLOW_COLOR, 10, 2);
}

// ---------------------------------------------------------------------------
// one floor's shell: walls with windows, a ceiling, pillars, lamps, and the stair
// up to the floor above
// ---------------------------------------------------------------------------

export function buildFloorShell(add, floorIndex, opts = {}) {
  const f = FL[floorIndex];
  const y0 = f.top;            // standing surface
  const h = f.height;          // clear height to the ceiling's underside
  const x = LAYOUT.TOWER_HALF_X;
  const zMin = LAYOUT.TOWER_Z_MIN;
  const zMax = LAYOUT.TOWER_Z_MAX;
  const zMid = (zMin + zMax) / 2;
  const depth = zMax - zMin;
  const wallColor = opts.wallColor || "#b4b4b4";
  const trimColor = opts.trimColor || "#8d8d94";
  const glass = opts.glassColor || "#aad4ff";

  // ---- the CEILING above this floor, which is the next floor's ground. Neither floor
  // lays its own: floor 2 stands on the Roof, floor 3 stands on the slab floor 2 laid.
  //
  // When there is a stair up, the slab is laid in FOUR pieces around a stairwell, because
  // a stair into a solid ceiling is a stair to nowhere — floor 3 would be unreachable.
  const slabY = y0 + h + 0.75;
  if (opts.stairUp) {
    const hole = LAYOUT.TOWER_STAIRWELL; // { xMin, xMax, zMin, zMax }
    const west = hole.xMin - (-x - 2);
    const east = (x + 2) - hole.xMax;
    add(part([west, 1.5, depth + 4], [(-x - 2 + hole.xMin) / 2, slabY, zMid], trimColor, { material: "metal" }));
    add(part([east, 1.5, depth + 4], [(hole.xMax + x + 2) / 2, slabY, zMid], trimColor, { material: "metal" }));
    const holeW = hole.xMax - hole.xMin;
    const northD = hole.zMin - (zMin - 2);
    const southD = (zMax + 2) - hole.zMax;
    add(part([holeW, 1.5, northD], [(hole.xMin + hole.xMax) / 2, slabY, (zMin - 2 + hole.zMin) / 2], trimColor, { material: "metal" }));
    add(part([holeW, 1.5, southD], [(hole.xMin + hole.xMax) / 2, slabY, (hole.zMax + zMax + 2) / 2], trimColor, { material: "metal" }));
    // A rail round three sides of the stairwell, so nobody walks backwards off it.
    const railY = slabY + 2.2;
    add(part([holeW, 3, 0.6], [(hole.xMin + hole.xMax) / 2, railY, hole.zMax], "#f5c542", { material: "metal" }));
    for (const hx of [hole.xMin, hole.xMax]) {
      add(part([0.6, 3, hole.zMax - hole.zMin], [hx, railY, (hole.zMin + hole.zMax) / 2], "#f5c542", { material: "metal" }));
    }
  } else {
    add(part([x * 2 + 4, 1.5, depth + 4], [0, slabY, zMid], trimColor, { material: "metal" }));
  }

  // ---- walls: back (north), two sides, and a front with a doorway + windows
  add(part([x * 2, h, 2], [0, y0 + h / 2, zMin], wallColor));
  for (const sx of [-1, 1]) {
    // A side wall in two segments with a window band between them.
    add(part([2, h * 0.35, depth], [sx * x, y0 + h * 0.175, zMid], wallColor));
    add(part([2, h * 0.3, depth], [sx * x, y0 + h * 0.85, zMid], wallColor));
    add(part([1.4, h * 0.35, depth - 4], [sx * x, y0 + h * 0.5, zMid], glass, {
      material: "glass", transparency: 0.55, canCollide: false,
    }));
    // Pilasters, so a 68-stud wall has a rhythm.
    for (let z = zMin + 10; z < zMax; z += 24) {
      add(part([3, h, 3], [sx * x, y0 + h / 2, Math.round(z)], trimColor, { material: "concrete" }));
    }
  }
  // Front wall: two segments and a 14-wide doorway on the east side (x +27 … +13), which
  // is where the Roof Ramp arrives.
  add(part([x - 13, h, 2], [-(13 + (x - 13) / 2), y0 + h / 2, zMax], wallColor));
  add(part([x - 21, h, 2], [21 + (x - 21) / 2, y0 + h / 2, zMax], wallColor));
  add(part([8, h * 0.45, 2], [17, y0 + h * 0.775, zMax], wallColor)); // header over the door
  add(part([26, h * 0.4, 1.4], [-6, y0 + h * 0.55, zMax], glass, {
    material: "glass", transparency: 0.5, canCollide: false,
  }));

  // ---- interior: four pillars, pipes along the ceiling, lamps, a crate stack
  for (const sx of [-1, 1]) {
    for (const z of [zMin + 16, zMax - 16]) {
      add(part([3, h, 3], [sx * 18, y0 + h / 2, z], trimColor, { material: "concrete" }));
    }
  }
  for (const sx of [-1, 1]) {
    add(part([2.2, depth - 6, 2.2], [sx * 26, y0 + h - 2, zMid], "#7a828f", {
      shape: "tube", rotation: [90, 0, 0], material: "metal",
    }));
  }
  for (const z of [zMin + 12, zMid, zMax - 12]) {
    add(part([3.4, 1.6, 3.4], [0, y0 + h - 1.2, z], "#fff2c8", {
      shape: "dome", rotation: [180, 0, 0], material: "neon", canCollide: false,
      light: { color: "#fff2c8", intensity: 2.2, range: 30 },
    }));
  }
  for (let i = 0; i < 3; i++) {
    add(part([3, 3, 3], [30 + i * 0.4, y0 + 1.5 + i * 3, zMax - 8], "#8d6a3f", { material: "wood" }));
  }
  add(part([4, 4, 4], [30, y0 + 2, zMin + 8], "#5c6478", { shape: "prism", material: "metal" }));

  // ---- the stair up, which climbs the full floor height plus the slab's thickness and
  // arrives inside TOWER_STAIRWELL's footprint (see the slab above).
  if (opts.stairUp) {
    const steps = LAYOUT.TOWER_STAIR_STEPS;
    const rise = (h + 1.5) / steps;
    const tread = 5;
    const hole = LAYOUT.TOWER_STAIRWELL;
    const stairX = (hole.xMin + hole.xMax) / 2;
    for (let i = 0; i < steps; i++) {
      add(part([8, rise, tread], [stairX, y0 + rise * (i + 0.5), zMin + 6 + i * tread], "#9aa3b8", {
        material: "concrete",
      }));
    }
    // A lit strip up the stairwell wall, because a stair in a dark corner is a stair
    // nobody finds.
    add(part([0.6, h, tread * steps], [hole.xMin - 0.5, y0 + h / 2, zMid], "#f5c542", {
      material: "neon", transparency: 0.4, canCollide: false,
      light: { color: "#f5c542", intensity: 1.4, range: 26 },
    }));
  }
}

// ---------------------------------------------------------------------------
// floor 3's office — what the third floor is FOR
// ---------------------------------------------------------------------------

export function buildOffice(add, label) {
  const f = FL[2];
  const y = f.top;
  const zMid = (LAYOUT.TOWER_Z_MIN + LAYOUT.TOWER_Z_MAX) / 2;
  const ox = 10; // the office's own axis: the east half, clear of the west-side belt

  // Carpet, desk, throne.
  add(part([28, 0.2, 40], [ox, y + 0.1, zMid], "#6b2233", { material: "plastic", canCollide: false }));
  add(part([14, 1, 6], [ox, y + 3.5, zMid - 6], "#5c4630", { material: "wood" }));
  for (const sx of [-1, 1]) {
    add(part([1.2, 3.5, 4.5], [ox + sx * 6, y + 1.75, zMid - 6], "#4a3826", { material: "wood" }));
  }
  add(part([5, 1, 5], [ox, y + 1.2, zMid - 12], "#f7c948", { shape: "cylinder", material: "gold" }));
  add(part([4, 5, 1.2], [ox, y + 4.2, zMid - 14], "#f7c948", { material: "gold" }));
  add(part([4, 1.2, 4], [ox, y + 2.3, zMid - 12], "#6b2233"));
  add(part([1.6, 2.4, 1.6], [ox, y + 8, zMid - 14], "#f7c948", {
    shape: "star", material: "gold",
    behaviors: [{ type: "spinner", axis: "y", speed: 30 }],
  }));

  // The vault: a door, a dial, and gold bars stacked behind glass.
  add(part([12, 12, 1.5], [ox + 6, y + 6, LAYOUT.TOWER_Z_MIN + 2], "#8d94a3", { material: "metal" }));
  add(part([6, 0.8, 6], [ox + 6, y + 6, LAYOUT.TOWER_Z_MIN + 3], "#c7cdd9", {
    shape: "cylinder", rotation: [90, 0, 0], material: "metal",
  }));
  add(part([1, 5, 1], [ox + 6, y + 6, LAYOUT.TOWER_Z_MIN + 3.6], "#f7c948", {
    rotation: [0, 0, 35], material: "gold",
  }));
  for (let i = 0; i < 4; i++) {
    add(part([3, 0.8, 1.4], [ox + 14 + (i % 2) * 0.4, y + 0.6 + i * 0.9, LAYOUT.TOWER_Z_MIN + 5], "#f7c948", {
      material: "gold",
    }));
  }

  // A trophy shelf: three plinths with a diamond, a pipe of coins, a ring.
  const shelfZ = LAYOUT.TOWER_Z_MAX - 10;
  for (let i = 0; i < 3; i++) {
    const x = ox + 2 + i * 6;
    add(part([4, 3, 4], [x, y + 1.5, shelfZ], "#8d8d94", { material: "marble" }));
  }
  add(part([2.4, 3, 2.4], [ox + 2, y + 4.5, shelfZ], "#35e0e0", {
    shape: "diamond", material: "glass", transparency: 0.25,
    light: { color: "#35e0e0", intensity: 1.4, range: 20 },
  }));
  add(part([2.6, 3, 2.6], [ox + 8, y + 4.5, shelfZ], "#f7c948", { shape: "tube", material: "gold" }));
  add(part([3.4, 3.4, 0.8], [ox + 14, y + 4.7, shelfZ], "#ff36c8", {
    shape: "ring", material: "neon",
    behaviors: [{ type: "spinner", axis: "y", speed: 45 }],
  }));

  // A chandelier over the desk.
  add(part([1, 3, 1], [ox, f.top + f.height - 2, zMid - 6], "#5c6478", { material: "metal" }));
  add(part([6, 6, 1.2], [ox, f.top + f.height - 4, zMid - 6], "#fff4c8", {
    shape: "ring", rotation: [90, 0, 0], material: "neon", canCollide: false,
    light: { color: "#fff4c8", intensity: 3, range: 40 },
  }));

  label("officeSign", [ox + 6, y + 12.4, LAYOUT.TOWER_Z_MIN + 2.9], ["THE BOSS"], "#f7c948", 14, 2.4);
}

// ---------------------------------------------------------------------------
// floor 1's detail pass — the ground floor gets the same treatment
// ---------------------------------------------------------------------------

export function buildGroundDetail(add) {
  // Rollers under the original belt, matching the upper floors'.
  for (let z = -32; z <= 28; z += 14) {
    add(part([0.8, 7.4, 0.8], [0, 0.9, z], "#5c6478", {
      shape: "cylinder", rotation: [0, 0, 90], material: "metal",
    }));
  }
  // A hood over the collector, and two floodlights on it.
  add(part([12, 1, 9], [0, 5.5, -41], "#3a3a44", { material: "metal" }));
  for (const sx of [-1, 1]) {
    add(part([1, 5, 8], [sx * 5.5, 3, -41], "#2c2c34", { material: "metal" }));
    add(part([2.4, 1.4, 2.4], [sx * 4, 6.4, -41], "#fff2c8", {
      shape: "dome", rotation: [180, 0, 0], material: "neon", canCollide: false,
      light: { color: "#fff2c8", intensity: 1.8, range: 26 },
    }));
  }
  // Painted floor markings along the belt run, and two pipe runs overhead.
  for (const sx of [-1, 1]) {
    add(part([1.2, 0.1, 64], [sx * 5, 0.06, -2], "#f5c542", { canCollide: false }));
    add(part([2, 60, 2], [sx * 30, 14, 0], "#7a828f", {
      shape: "tube", rotation: [90, 0, 0], material: "metal",
    }));
  }
  // Hazard cones where the belt turns into the bin.
  for (const sx of [-1, 1]) {
    add(part([2, 3, 2], [sx * 7, 1.5, -36], "#e8641b", { shape: "cone", material: "plastic" }));
  }
}

// ---------------------------------------------------------------------------
// the dropper machine, for any floor (plot.js's buildDropper delegates here)
// ---------------------------------------------------------------------------

export function dropperParts(add, label, p) {
  const L = LAYOUT;
  const f = FL[p.floor || 0];
  const y = f.top;
  const bx = f.beltX;
  const x = bx + L.DROPPER_SIDE_X * p.side;
  const color = p.color === "RAINBOW" ? "#ff36c8" : p.color;
  add(part(L.DROPPER_PILLAR_SIZE, [x, y + 3, p.dropZ], color));
  add(part([5, 1, 5], [x, y + 0.5, p.dropZ], "#5c6478", { material: "concrete" }));
  add(part(L.DROPPER_BODY_SIZE, [x, y + 8, p.dropZ], color));
  add(part([2.4, 1.6, 2.4], [x, y + 10.6, p.dropZ], color, { shape: "prism", material: "metal" }));
  add(part(L.DROPPER_ARM_SIZE, [bx + (L.DROPPER_SIDE_X / 2) * p.side, y + 8, p.dropZ], color));
  add(part(L.DROPPER_SPOUT_SIZE, [bx, y + 7, p.dropZ], color, {
    material: "neon", canCollide: false,
    light: { color: color, intensity: 1.2, range: 16 },
  }));
  label("machine:" + p.id, [x, y + L.DROPPER_LABEL_Y + 2, p.dropZ],
    [p.name, fmt(p.value) + " each"], color, 8, 2.4);
}
