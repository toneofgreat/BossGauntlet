// src/games/battles/scripts/layout.js — Battles. Spec 26. Pure.
//
// One Place, two rooms far apart on +x: a jazzy LOBBY (a hall lined with ten sword
// pedestals) and a stone ARENA (a coliseum bowl you fall out of into the void). buildWorld()
// returns every part plus the positions the game loop needs — sword pads (with the spin
// offsets that slowly turn each display sword), spawn rings, and the training-dummy spots.
//
// A cylinder's COLLISION radius is min(size[0],size[2])/2, so any floor a player stands on
// is sized as a DIAMETER (2*R), never the radius.

import { SWORDS } from "./swords.js";

export const FLOOR_TOP = 4;
export const LOBBY_SPAWN = Object.freeze([12, FLOOR_TOP + 0.3, 0]);
export const LOBBY_YAW = 90;
export const ARENA_CENTER = Object.freeze([420, 0]);
export const ARENA_RADIUS = 56;
export const VOID_Y = -12;

let seq = 0;
const P = (def) => ({ id: `bt_${seq++}`, material: "plastic", canCollide: true, ...def });

// ---- a slowly-turning, over-built display sword ------------------------------------
// Records each part's offset from the sword's vertical axis so game.js can spin it. `off`
// is relative to (cx,cy,cz); the model runs from the pommel (~cy-1.5) to the tip (~cy+3.9).
function swordModel(parts, key, cx, cy, cz, c, ornament, spin) {
  let n = 0;
  const add = (o) => {
    const id = `sword_${key}_${n++}`;
    const off = o.off, rot = o.rotation || [0, 0, 0];
    parts.push({ id, shape: o.shape || "box", size: o.size, position: [cx + off[0], cy + off[1], cz + off[2]], rotation: rot, color: o.color, material: o.material || "plastic", canCollide: false });
    spin.push({ id, dx: off[0], dy: off[1], dz: off[2], rot });
  };
  // ---- base: blade, fuller glint, tip, guard, grip, pommel, gems ----
  add({ shape: "box", size: [0.28, 3.4, 0.1], off: [0, 1.9, 0], color: c.blade, material: "metal" });
  add({ shape: "box", size: [0.11, 3.2, 0.16], off: [0, 1.95, 0], color: c.edge, material: "neon" });
  add({ shape: "wedge", size: [0.28, 0.6, 0.14], off: [0, 3.75, 0], color: c.edge, material: "metal" });
  add({ shape: "box", size: [1.6, 0.26, 0.34], off: [0, 0.1, 0], color: c.guard, material: "metal" });
  add({ shape: "sphere", size: [0.32, 0.32, 0.32], off: [-0.78, 0.1, 0], color: c.guard, material: "metal" });
  add({ shape: "sphere", size: [0.32, 0.32, 0.32], off: [0.78, 0.1, 0], color: c.guard, material: "metal" });
  add({ shape: "cylinder", size: [0.17, 1.15, 0.17], off: [0, -0.55, 0], color: c.hilt, material: "wood" });
  add({ shape: "cylinder", size: [0.21, 0.16, 0.21], off: [0, -0.2, 0], color: c.guard, material: "metal" });
  add({ shape: "cylinder", size: [0.21, 0.16, 0.21], off: [0, -0.9, 0], color: c.guard, material: "metal" });
  add({ shape: "sphere", size: [0.36, 0.36, 0.36], off: [0, -1.25, 0], color: c.gem, material: "neon" });
  add({ shape: "sphere", size: [0.26, 0.26, 0.26], off: [0, 0.1, 0.18], color: c.gem, material: "neon" });

  // ---- ornament: each tier wears more than the last ----
  if (ornament === "jewelled") {
    add({ shape: "sphere", size: [0.22, 0.22, 0.22], off: [-0.78, 0.32, 0], color: c.gem, material: "neon" });
    add({ shape: "sphere", size: [0.22, 0.22, 0.22], off: [0.78, 0.32, 0], color: c.gem, material: "neon" });
    for (let i = 0; i < 4; i++) add({ shape: "wedge", size: [0.14, 0.4, 0.14], off: [Math.cos(i * 1.57) * 0.24, -1.55, Math.sin(i * 1.57) * 0.24], color: c.guard, material: "metal" }); // pommel crown
  } else if (ornament === "spiked") {
    for (let s = 0; s < 5; s++) { const y = 0.7 + s * 0.6; add({ shape: "wedge", size: [0.5, 0.24, 0.24], off: [0.24, y, 0], rotation: [0, 0, -90], color: c.guard, material: "metal" }); add({ shape: "wedge", size: [0.5, 0.24, 0.24], off: [-0.24, y, 0], rotation: [0, 0, 90], color: c.guard, material: "metal" }); }
    add({ shape: "sphere", size: [0.55, 0.55, 0.55], off: [0, 3.4, 0], color: c.guard, material: "metal" });
    for (let i = 0; i < 5; i++) add({ shape: "wedge", size: [0.5, 0.3, 0.3], off: [Math.cos(i * 1.3) * 0.4, 3.4, Math.sin(i * 1.3) * 0.4], rotation: [0, i * 74, 90], color: c.gem, material: "neon" });
  } else if (ornament === "orbital") {
    for (let i = 0; i < 4; i++) { const a = i * 1.57; add({ shape: "sphere", size: [0.34, 0.34, 0.34], off: [Math.cos(a) * 0.95, 1.6, Math.sin(a) * 0.95], color: c.hilt, material: "metal" }); }
    add({ shape: "cylinder", size: [2.1, 0.08, 2.1], off: [0, 1.6, 0], rotation: [0, 0, 0], color: c.edge, material: "neon" }); // accretion disc
    add({ shape: "cylinder", size: [1.4, 0.06, 1.4], off: [0, 2.5, 0], rotation: [16, 0, 12], color: c.gem, material: "neon" });
  } else if (ornament === "finned") {
    for (const sx of [-1, 1]) { add({ shape: "wedge", size: [0.7, 1.4, 0.12], off: [sx * 0.55, 0.7, 0], rotation: [0, 0, sx * 40], color: c.guard, material: "metal" }); add({ shape: "box", size: [0.06, 2.6, 0.4], off: [sx * 0.28, 1.9, 0], color: c.edge, material: "neon" }); }
    for (let s = 0; s < 3; s++) add({ shape: "box", size: [0.05, 1.6, 0.3], off: [0, 0.5 + s * 1.0, -0.4], color: c.gem, material: "neon" }); // motion streaks
  } else if (ornament === "winged") {
    for (const sx of [-1, 1]) { add({ shape: "wedge", size: [1.9, 1.2, 0.12], off: [sx * 1.15, 0.5, 0], rotation: [0, 0, sx * 22], color: c.guard, material: "metal" }); add({ shape: "wedge", size: [1.3, 0.8, 0.1], off: [sx * 0.95, 0.55, 0], rotation: [0, 0, sx * 22], color: c.edge, material: "neon" }); }
    add({ shape: "sphere", size: [0.5, 0.5, 0.5], off: [0, 0.1, 0.2], color: c.gem, material: "neon" });
  } else if (ornament === "serpent") {
    for (let s = 0; s < 5; s++) { const a = s * 1.25, y = -0.9 + s * 0.4; add({ shape: "cylinder", size: [0.3, 0.14, 0.3], off: [Math.cos(a) * 0.28, y, Math.sin(a) * 0.28], rotation: [90, 0, 0], color: c.guard, material: "metal" }); }
    for (const sx of [-1, 1]) add({ shape: "wedge", size: [0.16, 0.6, 0.16], off: [sx * 0.35, 0.4, 0.2], rotation: [40, 0, 0], color: "#f6ffe0", material: "plastic" }); // fangs
    add({ shape: "sphere", size: [0.24, 0.24, 0.24], off: [0, 3.2, 0.14], color: c.gem, material: "neon" });
  } else if (ornament === "thorn") {
    for (let s = 0; s < 6; s++) { const a = s * 1.05, y = 0.6 + s * 0.5; add({ shape: "cylinder", size: [0.13, 0.6, 0.13], off: [Math.cos(a) * 0.22, y, Math.sin(a) * 0.22], rotation: [90, s * 30, 0], color: "#2f8f4a", material: "plastic" }); add({ shape: "wedge", size: [0.22, 0.22, 0.16], off: [Math.cos(a) * 0.36, y, Math.sin(a) * 0.36], rotation: [0, a * 57, -90], color: "#1f6b34", material: "plastic" }); }
    for (let i = 0; i < 5; i++) { const a = i * 1.26; add({ shape: "sphere", size: [0.5, 0.22, 0.5], off: [Math.cos(a) * 0.5, 1.2 + (i % 2) * 1.4, Math.sin(a) * 0.5], color: "#3ddc84", material: "plastic" }); }
    add({ shape: "sphere", size: [0.26, 0.26, 0.26], off: [0.2, 2.0, 0.2], color: "#e0245e", material: "neon" });
    add({ shape: "sphere", size: [0.24, 0.24, 0.24], off: [-0.24, 2.7, -0.1], color: "#e0245e", material: "neon" });
  } else if (ornament === "trainer") {
    for (let s = 0; s < 3; s++) add({ shape: "cylinder", size: [0.7, 0.06, 0.7], off: [0, 1.1 + s * 0.9, 0], rotation: [90, 0, 0], color: c.gem, material: "neon" });
    add({ shape: "sphere", size: [0.5, 0.5, 0.5], off: [0, -1.5, 0], color: "#d9c48f", material: "plastic" }); // straw tuft
  } else if (ornament === "meteor") {
    for (let i = 0; i < 6; i++) { const a = i * 1.05, y = 0.8 + (i % 3) * 1.0; add({ shape: "wedge", size: [0.4, 0.4, 0.4], off: [Math.cos(a) * 0.5, y, Math.sin(a) * 0.5], rotation: [0, i * 60, i * 20], color: c.hilt, material: "metal" }); add({ shape: "sphere", size: [0.2, 0.2, 0.2], off: [Math.cos(a) * 0.62, y, Math.sin(a) * 0.62], color: c.gem, material: "neon" }); }
    for (let i = 0; i < 5; i++) add({ shape: "wedge", size: [0.2, 0.5, 0.2], off: [Math.cos(i * 1.26) * 0.34, -1.5, Math.sin(i * 1.26) * 0.34], color: "#ff8c1a", material: "lava" }); // flaming crown
  }
}

function ring(cx, cz, r, a) { return [cx + r * Math.cos(a), cz + r * Math.sin(a)]; }

// A wall torch: a bracket + a flame. Purely decorative (never collides).
function torch(parts, x, y, z, flame) {
  parts.push(P({ shape: "cylinder", size: [0.2, 1.2, 0.2], position: [x, y, z], color: "#3a2a1a", material: "wood", canCollide: false }));
  parts.push(P({ shape: "sphere", size: [0.7, 1.0, 0.7], position: [x, y + 0.9, z], color: flame || "#ff8c1a", material: "lava", canCollide: false }));
  parts.push(P({ shape: "sphere", size: [0.35, 0.5, 0.35], position: [x, y + 1.2, z], color: "#ffe45c", material: "neon", canCollide: false }));
}

function buildLobby(parts, out) {
  const LEN = 120, HALF = 20, WALL_H = 12;
  parts.push(P({ size: [LEN, 1, HALF * 2], position: [54, FLOOR_TOP - 0.5, 0], color: "#3b3348", material: "plastic" }));
  parts.push(P({ size: [LEN - 8, 0.12, 10], position: [54, FLOOR_TOP + 0.07, 0], color: "#5a3c6e", material: "plastic", canCollide: false }));
  // checker inlay down the aisle for a finished floor
  for (let i = 0; i < 12; i++) parts.push(P({ size: [3, 0.14, 3], position: [12 + i * 9, FLOOR_TOP + 0.08, (i % 2 ? 3 : -3)], color: "#6a4d80", material: "plastic", canCollide: false }));
  for (const side of [-1, 1]) {
    parts.push(P({ size: [LEN, WALL_H, 1], position: [54, FLOOR_TOP + WALL_H / 2, side * HALF], color: "#4a3d63" }));
    parts.push(P({ size: [LEN, 0.5, 1.2], position: [54, FLOOR_TOP + WALL_H, side * HALF], color: "#e0b23a", material: "neon", canCollide: false }));
    // wall pilasters + torches
    for (let s = 0; s < 7; s++) { const x = 16 + s * 15; parts.push(P({ size: [1.4, WALL_H, 1.4], position: [x, FLOOR_TOP + WALL_H / 2, side * (HALF - 0.4)], color: "#2f2640", canCollide: false })); torch(parts, x, FLOOR_TOP + 7, side * (HALF - 1.6), "#ff7a1a"); }
  }
  parts.push(P({ size: [1, WALL_H, HALF * 2], position: [-6, FLOOR_TOP + WALL_H / 2, 0], color: "#2f2640" }));
  parts.push(P({ size: [1, WALL_H, HALF * 2], position: [116, FLOOR_TOP + WALL_H / 2, 0], color: "#2f2640" }));
  parts.push(P({ size: [LEN, 0.8, HALF * 2], position: [54, FLOOR_TOP + WALL_H, 0], color: "#1a1522", canCollide: false }));
  // a title banner over the entry
  parts.push(P({ size: [0.4, 4, 12], position: [-5.4, FLOOR_TOP + 8, 0], color: "#c0392b", material: "neon", canCollide: false }));
  parts.push(P({ shape: "wedge", size: [2, 2, 12], position: [-4, FLOOR_TOP + 5.4, 0], rotation: [0, 0, 90], color: "#7d1f16", canCollide: false }));
  // jazzy uplights
  for (let s = 0; s < 8; s++) { parts.push(P({ shape: "cylinder", size: [0.5, 0.4, 0.5], position: [12 + s * 13, FLOOR_TOP + 0.2, -13], color: "#ff7a1a", material: "neon", canCollide: false })); parts.push(P({ shape: "cylinder", size: [0.5, 0.4, 0.5], position: [12 + s * 13, FLOOR_TOP + 0.2, 13], color: "#35a3e0", material: "neon", canCollide: false })); }

  // ten pedestals along the far wall, each with a slowly-turning display sword + a touch pad
  const PED_Z = 12, PAD_Z = 5.5, X0 = 20, DX = 9.6;
  out.swordPads = [];
  for (let i = 0; i < SWORDS.length; i++) {
    const sw = SWORDS[i];
    const x = X0 + i * DX;
    parts.push(P({ shape: "cylinder", size: [4.8, 3, 4.8], position: [x, FLOOR_TOP + 1.5, PED_Z], color: "#1d1826", material: "metal" }));
    parts.push(P({ shape: "cylinder", size: [4, 0.4, 4], position: [x, FLOOR_TOP + 3.05, PED_Z], color: "#2a2336", material: "metal", canCollide: false }));
    parts.push(P({ shape: "cylinder", size: [5.4, 0.3, 5.4], position: [x, FLOOR_TOP + 3.15, PED_Z], color: sw.colors.gem, material: "neon", canCollide: false }));
    const cy = FLOOR_TOP + 4.6;
    const spin = [];
    swordModel(parts, sw.id, x, cy, PED_Z, sw.colors, sw.ornament, spin);
    const padId = `bt_sword${i}`;
    parts.push({ id: padId, shape: "cylinder", size: [4.8, 0.3, 4.8], position: [x, FLOOR_TOP + 0.2, PAD_Z], color: "#e0b23a", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: padId, cooldownS: 0.8 }] });
    out.swordPads.push({ i, id: sw.id, padId, x, center: [x, cy, PED_Z], spin, labelPos: [x, FLOOR_TOP + 8.4, PED_Z] });
  }
}

function buildArena(parts, out) {
  const [CX, CZ] = ARENA_CENTER, R = ARENA_RADIUS;
  parts.push(P({ shape: "cylinder", size: [R * 2, 2, R * 2], position: [CX, FLOOR_TOP - 1, CZ], color: "#c2a878", material: "plastic" }));
  parts.push(P({ shape: "cylinder", size: [R * 2 - 2, 0.2, R * 2 - 2], position: [CX, FLOOR_TOP + 0.11, CZ], color: "#b09a68", material: "plastic", canCollide: false }));
  // ground cracks + scattered stones for a worn, real floor
  for (let i = 0; i < 14; i++) { const a = i * 0.9, [gx, gz] = ring(CX, CZ, 8 + (i % 5) * 9, a); parts.push(P({ size: [6, 0.14, 0.4], position: [gx, FLOOR_TOP + 0.14, gz], rotation: [0, a * 57, 0], color: "#8a6a3a", canCollide: false })); }
  // cracked centre emblem
  parts.push(P({ shape: "cylinder", size: [20, 0.16, 20], position: [CX, FLOOR_TOP + 0.14, CZ], color: "#8a6a3a", material: "metal", canCollide: false }));
  parts.push(P({ shape: "cylinder", size: [8, 0.2, 8], position: [CX, FLOOR_TOP + 0.16, CZ], color: "#c0392b", material: "neon", canCollide: false }));
  parts.push(P({ shape: "wedge", size: [2.4, 2.4, 2.4], position: [CX, FLOOR_TOP + 1.4, CZ], rotation: [0, 30, 0], color: "#8a6a3a", material: "metal", canCollide: false }));
  // tiered coliseum stands: seating rings climbing OUTWARD (radius rr)
  for (let t = 1; t <= 5; t++) { const rr = R + t * 4; parts.push(P({ shape: "cylinder", size: [rr * 2, 2.4, rr * 2], position: [CX, FLOOR_TOP - 2.4 + t * 2.2, CZ], color: t % 2 ? "#7d6e58" : "#8c7a60", canCollide: false })); }
  // broken pillars around the ring, banners + torches on some
  const PILL = 14;
  for (let i = 0; i < PILL; i++) {
    const a = (i / PILL) * Math.PI * 2, [px, pz] = ring(CX, CZ, R - 3, a), h = 11 + (i % 3) * 4;
    parts.push(P({ shape: "cylinder", size: [3.4, h, 3.4], position: [px, FLOOR_TOP + h / 2, pz], color: "#9a8a70", material: "metal" }));
    parts.push(P({ shape: "cylinder", size: [4, 1, 4], position: [px, FLOOR_TOP + 0.5, pz], color: "#7d6e58", material: "metal", canCollide: false }));
    parts.push(P({ shape: "box", size: [3.4, 1, 3.4], position: [px, FLOOR_TOP + h, pz], color: "#b0a084", canCollide: false }));
    if (i % 2 === 0) { const [ix, iz] = ring(CX, CZ, R - 5, a); parts.push(P({ size: [0.3, 7, 3], position: [ix, FLOOR_TOP + h - 4, iz], color: ["#c0392b", "#2f6fd0", "#3ddc84", "#e0b23a"][(i / 2) % 4], material: "neon", canCollide: false })); }
    if (i % 3 === 0) { const [tx, tz] = ring(CX, CZ, R - 6, a); torch(parts, tx, FLOOR_TOP + h - 2, tz, "#ff7a1a"); }
  }
  // two gate statues flanking the leave pad
  for (const sx of [-1, 1]) {
    const gx = CX + sx * 10, gz = CZ - (R - 8);
    parts.push(P({ shape: "box", size: [2.2, 2, 2.2], position: [gx, FLOOR_TOP + 1, gz], color: "#7d6e58", material: "metal", canCollide: false }));
    parts.push(P({ shape: "cylinder", size: [1.4, 5, 1.4], position: [gx, FLOOR_TOP + 4.5, gz], color: "#9a8a70", material: "metal", canCollide: false }));
    parts.push(P({ shape: "sphere", size: [1.6, 1.6, 1.6], position: [gx, FLOOR_TOP + 7.6, gz], color: "#b0a084", material: "metal", canCollide: false }));
    parts.push(P({ shape: "box", size: [0.4, 4, 0.4], position: [gx + sx * 0.9, FLOOR_TOP + 5, gz], color: "#c9d2e4", material: "metal", canCollide: false })); // a held spear
  }
  // weapon racks near the edge for grit
  for (let i = 0; i < 3; i++) { const a = 0.6 + i * 2.0, [rx, rz] = ring(CX, CZ, R - 10, a); parts.push(P({ size: [3, 0.4, 0.6], position: [rx, FLOOR_TOP + 3, rz], color: "#4a2f18", material: "wood", canCollide: false })); for (let k = -1; k <= 1; k++) parts.push(P({ size: [0.16, 3, 0.16], position: [rx + k * 0.9, FLOOR_TOP + 1.5, rz], color: "#8a93a6", material: "metal", canCollide: false })); }
  // rubble
  for (let i = 0; i < 10; i++) { const a = i * 2.1, [rx, rz] = ring(CX, CZ, 16 + (i % 4) * 8, a); parts.push(P({ shape: "wedge", size: [2, 1.5 + (i % 3), 2], position: [rx, FLOOR_TOP + 0.8, rz], rotation: [0, i * 40, 0], color: "#9a8a70", canCollide: false })); }

  out.arenaSpawns = [];
  for (let i = 0; i < 8; i++) { const [sx, sz] = ring(CX, CZ, 40, (i / 8) * Math.PI * 2); out.arenaSpawns.push([sx, FLOOR_TOP + 0.4, sz]); }
  out.dummySpots = [];
  for (let i = 0; i < 4; i++) { const [dx, dz] = ring(CX, CZ, 24, (i / 4) * Math.PI * 2 + 0.4); out.dummySpots.push([dx, dz]); }
  const leavePos = [CX, FLOOR_TOP + 0.4, CZ - (R - 6)];
  parts.push({ id: "bt_leave", shape: "cylinder", size: [7, 0.3, 7], position: [leavePos[0], FLOOR_TOP + 0.2, leavePos[2]], color: "#3ddc84", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "bt_leave", cooldownS: 1 }] });
  parts.push(P({ size: [8, 3, 0.4], position: [leavePos[0], FLOOR_TOP + 4.4, leavePos[2]], color: "#0f2a18", canCollide: false }));
  parts.push(P({ size: [8.4, 0.5, 0.6], position: [leavePos[0], FLOOR_TOP + 6, leavePos[2]], color: "#3ddc84", material: "neon", canCollide: false }));
  out.leavePos = leavePos;
  out.arenaCenter = [CX, FLOOR_TOP + 0.4, CZ];
}

export function buildWorld() {
  seq = 0;
  const parts = [];
  const out = { parts };
  buildLobby(parts, out);
  buildArena(parts, out);
  return out;
}
