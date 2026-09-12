// src/games/battles/scripts/layout.js — Battles. Spec 26. Pure.
//
// One Place, two rooms far apart on +x: a jazzy LOBBY (a hall lined with nine sword
// pedestals) and a stone ARENA (a coliseum bowl you fall out of into the void). buildWorld()
// returns every part plus the positions the game loop needs — sword pads, spawn rings and
// the training-dummy spots. The detailed sword models live here; the swing VFX lives in
// game.js.

import { SWORDS } from "./swords.js";

export const FLOOR_TOP = 4;
export const LOBBY_SPAWN = Object.freeze([12, FLOOR_TOP + 0.3, 0]);
export const LOBBY_YAW = 90;
export const ARENA_CENTER = Object.freeze([420, 0]); // x,z
export const ARENA_RADIUS = 56;
export const VOID_Y = -12;                            // fall below this in the arena = respawn

let seq = 0;
const P = (def) => ({ id: `bt_${seq++}`, material: "plastic", canCollide: true, ...def });

// A deliberately over-built sword model, floating and slowly turnable, for a pedestal.
function swordModel(parts, key, cx, cy, cz, c) {
  const put = (o) => parts.push(P({ id: `sword_${key}_${seq++}`, canCollide: false, ...o }));
  // blade
  put({ shape: "box", size: [0.26, 3.4, 0.09], position: [cx, cy + 1.9, cz], color: c.blade, material: "metal" });
  put({ shape: "box", size: [0.1, 3.3, 0.14], position: [cx, cy + 1.95, cz], color: c.edge, material: "neon" }); // fuller glint
  put({ shape: "wedge", size: [0.28, 0.5, 0.12], position: [cx, cy + 3.7, cz], rotation: [0, 0, 0], color: c.edge, material: "metal" }); // tip
  // guard
  put({ shape: "box", size: [1.5, 0.24, 0.3], position: [cx, cy + 0.1, cz], color: c.guard, material: "metal" });
  put({ shape: "sphere", size: [0.3, 0.3, 0.3], position: [cx - 0.72, cy + 0.1, cz], color: c.guard, material: "metal" });
  put({ shape: "sphere", size: [0.3, 0.3, 0.3], position: [cx + 0.72, cy + 0.1, cz], color: c.guard, material: "metal" });
  // grip + pommel + gem
  put({ shape: "cylinder", size: [0.16, 1.1, 0.16], position: [cx, cy - 0.55, cz], color: c.hilt, material: "wood" });
  put({ shape: "cylinder", size: [0.2, 0.16, 0.2], position: [cx, cy - 0.2, cz], color: c.guard, material: "metal" });
  put({ shape: "cylinder", size: [0.2, 0.16, 0.2], position: [cx, cy - 0.9, cz], color: c.guard, material: "metal" });
  put({ shape: "sphere", size: [0.34, 0.34, 0.34], position: [cx, cy - 1.2, cz], color: c.gem, material: "neon" }); // pommel gem
  put({ shape: "sphere", size: [0.24, 0.24, 0.24], position: [cx, cy + 0.1, cz + 0.16], color: c.gem, material: "neon" }); // guard gem
}

function buildLobby(parts, out) {
  const LEN = 108, HALF = 20, WALL_H = 12;
  // floor + a soft rug down the aisle
  parts.push(P({ size: [LEN, 1, HALF * 2], position: [50, FLOOR_TOP - 0.5, 0], color: "#3b3348", material: "plastic" }));
  parts.push(P({ size: [LEN - 8, 0.12, 10], position: [50, FLOOR_TOP + 0.07, 0], color: "#5a3c6e", material: "plastic", canCollide: false }));
  // walls + a warm trim + a low stage lip along the pedestal side
  for (const side of [-1, 1]) {
    parts.push(P({ size: [LEN, WALL_H, 1], position: [50, FLOOR_TOP + WALL_H / 2, side * HALF], color: "#4a3d63" }));
    parts.push(P({ size: [LEN, 0.5, 1.2], position: [50, FLOOR_TOP + WALL_H, side * HALF], color: "#e0b23a", material: "neon", canCollide: false }));
  }
  parts.push(P({ size: [1, WALL_H, HALF * 2], position: [-4, FLOOR_TOP + WALL_H / 2, 0], color: "#2f2640" }));
  parts.push(P({ size: [1, WALL_H, HALF * 2], position: [104, FLOOR_TOP + WALL_H / 2, 0], color: "#2f2640" }));
  parts.push(P({ size: [LEN, 0.8, HALF * 2], position: [50, FLOOR_TOP + WALL_H, 0], color: "#1a1522", canCollide: false })); // ceiling
  // jazzy uplights along the aisle
  for (let s = 0; s < 8; s++) {
    parts.push(P({ shape: "cylinder", size: [0.5, 0.4, 0.5], position: [12 + s * 12, FLOOR_TOP + 0.2, -14], color: "#ff7a1a", material: "neon", canCollide: false }));
    parts.push(P({ shape: "cylinder", size: [0.5, 0.4, 0.5], position: [12 + s * 12, FLOOR_TOP + 0.2, 14], color: "#35a3e0", material: "neon", canCollide: false }));
  }
  // an entry arch behind spawn
  parts.push(P({ size: [2, WALL_H + 2, HALF * 2 + 2], position: [2, FLOOR_TOP + (WALL_H + 2) / 2, 0], color: "#3a2740", canCollide: false }));

  // nine pedestals along the far wall, each with its floating sword + a touch pad in front
  const PED_Z = 12, PAD_Z = 5.5, X0 = 20, DX = 9.4;
  out.swordPads = [];
  for (let i = 0; i < SWORDS.length; i++) {
    const sw = SWORDS[i];
    const x = X0 + i * DX;
    parts.push(P({ shape: "cylinder", size: [2.4, 3, 2.4], position: [x, FLOOR_TOP + 1.5, PED_Z], color: "#1d1826", material: "metal" }));
    parts.push(P({ shape: "cylinder", size: [2.7, 0.3, 2.7], position: [x, FLOOR_TOP + 3.1, PED_Z], color: sw.colors.gem, material: "neon", canCollide: false }));
    swordModel(parts, sw.id, x, FLOOR_TOP + 4.4, PED_Z, sw.colors);
    const padId = `bt_sword${i}`;
    parts.push({ id: padId, shape: "cylinder", size: [2.4, 0.3, 2.4], position: [x, FLOOR_TOP + 0.2, PAD_Z], color: "#e0b23a", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: padId, cooldownS: 0.8 }] });
    out.swordPads.push({ i, id: sw.id, padId, x, labelPos: [x, FLOOR_TOP + 7.6, PED_Z] });
  }
}

function ring(cx, cz, r, a) { return [cx + r * Math.cos(a), cz + r * Math.sin(a)]; }

function buildArena(parts, out) {
  const [CX, CZ] = ARENA_CENTER;
  const R = ARENA_RADIUS;
  // the sand floor (a raised disc — step off the edge and you fall into the void)
  parts.push(P({ shape: "cylinder", size: [R, 2, R], position: [CX, FLOOR_TOP - 1, CZ], color: "#c2a878", material: "plastic" }));
  parts.push(P({ shape: "cylinder", size: [R - 1, 0.2, R - 1], position: [CX, FLOOR_TOP + 0.11, CZ], color: "#b09a68", material: "plastic", canCollide: false }));
  // a cracked centre emblem
  parts.push(P({ shape: "cylinder", size: [10, 0.16, 10], position: [CX, FLOOR_TOP + 0.14, CZ], color: "#8a6a3a", material: "metal", canCollide: false }));
  parts.push(P({ shape: "cylinder", size: [4, 0.2, 4], position: [CX, FLOOR_TOP + 0.16, CZ], color: "#c0392b", material: "neon", canCollide: false }));
  // tiered coliseum stands: concentric step-rings climbing outward
  for (let t = 1; t <= 4; t++) {
    const rr = R + t * 4;
    parts.push(P({ shape: "cylinder", size: [rr, 2.2, rr], position: [CX, FLOOR_TOP - 2 + t * 2, CZ], color: t % 2 ? "#7d6e58" : "#8c7a60", canCollide: false }));
  }
  // broken pillars around the ring, banners on a few
  const PILL = 12;
  for (let i = 0; i < PILL; i++) {
    const a = (i / PILL) * Math.PI * 2;
    const [px, pz] = ring(CX, CZ, R - 3, a);
    const h = 10 + (i % 3) * 4;
    parts.push(P({ shape: "cylinder", size: [1.6, h, 1.6], position: [px, FLOOR_TOP + h / 2, pz], color: "#9a8a70", material: "metal" }));
    parts.push(P({ shape: "box", size: [3, 0.8, 3], position: [px, FLOOR_TOP + h, pz], color: "#b0a084", canCollide: false }));
    if (i % 3 === 0) parts.push(P({ size: [0.3, 6, 2.4], position: [px, FLOOR_TOP + h - 3, pz], color: ["#c0392b", "#2f6fd0", "#3ddc84"][(i / 3) % 3], material: "neon", canCollide: false }));
  }
  // scattered rubble for grit
  for (let i = 0; i < 10; i++) {
    const a = i * 2.1, [rx, rz] = ring(CX, CZ, 14 + (i % 4) * 8, a);
    parts.push(P({ shape: "wedge", size: [2, 1.5 + (i % 3), 2], position: [rx, FLOOR_TOP + 0.8, rz], rotation: [0, i * 40, 0], color: "#9a8a70", canCollide: false }));
  }
  // spawn ring (8) + dummy spots (4) + the leave pad back to the lobby
  out.arenaSpawns = [];
  for (let i = 0; i < 8; i++) { const [sx, sz] = ring(CX, CZ, 40, (i / 8) * Math.PI * 2); out.arenaSpawns.push([sx, FLOOR_TOP + 0.4, sz]); }
  out.dummySpots = [];
  for (let i = 0; i < 4; i++) { const [dx, dz] = ring(CX, CZ, 22, (i / 4) * Math.PI * 2 + 0.4); out.dummySpots.push([dx, dz]); }
  const leavePos = [CX, FLOOR_TOP + 0.4, CZ - (R - 6)];
  parts.push({ id: "bt_leave", shape: "cylinder", size: [3.4, 0.3, 3.4], position: [leavePos[0], FLOOR_TOP + 0.2, leavePos[2]], color: "#3ddc84", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "bt_leave", cooldownS: 1 }] });
  parts.push(P({ size: [7, 3, 0.4], position: [leavePos[0], FLOOR_TOP + 4, leavePos[2]], color: "#0f2a18", canCollide: false }));
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
