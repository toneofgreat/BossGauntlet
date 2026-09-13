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

// ---- §10/§11 landmarks (game.js / quest.js read these; every one is world-absolute) --
export const OBBY_START = Object.freeze([54, 120.5, -260]);      // the Obby of Oof's first plank
export const BALCONY = Object.freeze([514, 2.6, 0]);             // the vine-hidden balcony's floor top
export const CUBE_POS = Object.freeze([514, 4.1, -2.5]);         // the six-faced thing that waits
export const DOOR_POS = Object.freeze([519.4, 5.8, 3]);          // the stone door with no handle
export const BOOK1_POS = Object.freeze([526, 4.4, 3]);           // the hermit's lectern
export const RING_CENTER = Object.freeze([420, 90, 0]);          // the ring the sky keeps
export const TREE_POS = Object.freeze([110, 52]);                // the old tree's trunk (courtyard)
export const SCOPE_TOP = Object.freeze([110, 84, 52]);           // canopy deck top / telescope
export const SKY_ISLE = Object.freeze([142, 101, 74]);           // the star island (rebirth shrine)
export const SKY_COORDS = Object.freeze([77, -41]);              // what the matched stars spell out
export const CRATER = Object.freeze([77, 150, -41]);             // where the rocket goes to dig
export const ROCKET_POS = Object.freeze([132, 30]);              // the courtyard launch kiosk
// The cloud steps up to the ring (spawned only once book one is read): a climbable
// spiral from the tall east pillar's cap (top y 23 at ~51°, r 50) in toward the ring's
// altar. Every hop is ≤ ~5.5 across and 3 up — hard, never impossible (jump apex 6.37).
export const CLOUD_STEPS = Object.freeze((() => {
  const steps = [];
  let a = 0.9, r = 50.5, y = 26;
  while (y < 86) { steps.push(Object.freeze([420 + r * Math.cos(a), y, r * Math.sin(a)])); a += 5 / r; r = Math.max(5, r - 2.4); y += 3; }
  return steps;
})());
// The star bridge (spawned only once the stars are matched): canopy deck -> star isle.
export const STAR_STEPS = Object.freeze([
  [116, 86, 56], [121, 88.5, 60], [126, 91, 63.5], [130, 93.5, 66.5], [133.5, 96, 68.5], [136.8, 98.5, 70.8],
].map((p) => Object.freeze(p)));

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
  } else if (ornament === "cheese") {
    // a wheel-aged masterpiece: swiss holes down the blade, a drip skirt, orbiting wedge
    // bits, and a little grey admirer on the pommel
    for (let s = 0; s < 6; s++) { const y = 0.7 + s * 0.55; add({ shape: "sphere", size: [0.2, 0.2, 0.22], off: [(s % 2 ? 0.07 : -0.07), y, 0], color: "#c9971f", material: "plastic" }); }
    for (let i = 0; i < 5; i++) { const a = i * 1.26; add({ shape: "wedge", size: [0.5, 0.34, 0.4], off: [Math.cos(a) * 1.1, 1.6 + (i % 2) * 0.9, Math.sin(a) * 1.1], rotation: [0, i * 72, 0], color: "#ffd23a", material: "plastic" }); }
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.5; add({ shape: "sphere", size: [0.16, 0.34, 0.16], off: [Math.cos(a) * 0.4, -0.1 - (i % 2) * 0.5, Math.sin(a) * 0.4], color: "#e8b62a", material: "plastic" }); } // drips
    add({ shape: "sphere", size: [0.44, 0.4, 0.5], off: [0.1, -1.62, 0.3], color: "#8a93a6", material: "plastic" });   // the mouse
    for (const sx of [-1, 1]) add({ shape: "sphere", size: [0.16, 0.16, 0.08], off: [0.1 + sx * 0.14, -1.4, 0.42], color: "#c9ccd6", material: "plastic" });
    add({ shape: "sphere", size: [0.07, 0.07, 0.07], off: [0.1, -1.6, 0.56], color: "#12141c", material: "plastic" }); // nose
  } else if (ornament === "killstreak") {
    // obsidian and tally-marks: a red neon core, five floating counting-runes, a black
    // crown, and smoke coiling off the edge — the rack's most dangerous-looking thing
    add({ shape: "box", size: [0.08, 3.0, 0.18], off: [0, 1.9, 0], color: "#ff2a2a", material: "neon" });               // burning core
    for (let s = 0; s < 5; s++) { const a = s * 1.257; add({ shape: "box", size: [0.1, 0.7, 0.1], off: [Math.cos(a) * 1.15, 1.5 + (s % 3) * 0.7, Math.sin(a) * 1.15], rotation: [0, 0, s === 4 ? 55 : 0], color: "#ff2a2a", material: "neon" }); } // tally runes (the fifth crossed)
    for (let s = 0; s < 4; s++) add({ shape: "wedge", size: [0.3, 0.55, 0.3], off: [Math.cos(s * 1.57 + 0.78) * 0.42, -1.55, Math.sin(s * 1.57 + 0.78) * 0.42], color: "#0a0710", material: "metal" }); // black crown
    add({ shape: "sphere", size: [0.3, 0.3, 0.3], off: [0, -1.28, 0], color: "#ff5a3a", material: "lava" });           // ember pommel
    for (let s = 0; s < 4; s++) add({ shape: "sphere", size: [0.34 - s * 0.05, 0.5, 0.34 - s * 0.05], off: [0.34 + s * 0.12, 2.2 + s * 0.55, -0.1 - (s % 2) * 0.2], color: "#241a2e", material: "plastic" }); // smoke coil
    add({ shape: "wedge", size: [0.5, 1.0, 0.2], off: [-0.4, 3.1, 0], rotation: [0, 0, 35], color: "#1a1220", material: "metal" }); // jagged counter-tip
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
    if (side === 1) {
      // §11: the south wall parts around a gate (x 98..108) into the tree courtyard
      parts.push(P({ size: [104, WALL_H, 1], position: [46, FLOOR_TOP + WALL_H / 2, HALF], color: "#4a3d63" }));
      parts.push(P({ size: [6, WALL_H, 1], position: [111, FLOOR_TOP + WALL_H / 2, HALF], color: "#4a3d63" }));
      parts.push(P({ size: [10, 3, 1.2], position: [103, FLOOR_TOP + WALL_H - 1.5, HALF], color: "#4a3d63" })); // gate lintel
      parts.push(P({ size: [10.6, 0.5, 1.4], position: [103, FLOOR_TOP + WALL_H - 3, HALF], color: "#3ddc84", material: "neon", canCollide: false }));
    } else {
      parts.push(P({ size: [LEN, WALL_H, 1], position: [54, FLOOR_TOP + WALL_H / 2, side * HALF], color: "#4a3d63" }));
    }
    parts.push(P({ size: [LEN, 0.5, 1.2], position: [54, FLOOR_TOP + WALL_H, side * HALF], color: "#e0b23a", material: "neon", canCollide: false }));
    // wall pilasters + torches (the south run skips the one that stood in the gate)
    for (let s = 0; s < 7; s++) { if (side === 1 && s === 6) continue; const x = 16 + s * 15; parts.push(P({ size: [1.4, WALL_H, 1.4], position: [x, FLOOR_TOP + WALL_H / 2, side * (HALF - 0.4)], color: "#2f2640", canCollide: false })); torch(parts, x, FLOOR_TOP + 7, side * (HALF - 1.6), "#ff7a1a"); }
  }
  parts.push(P({ size: [1, WALL_H, HALF * 2], position: [-6, FLOOR_TOP + WALL_H / 2, 0], color: "#2f2640" }));
  parts.push(P({ size: [1, WALL_H, HALF * 2], position: [116, FLOOR_TOP + WALL_H / 2, 0], color: "#2f2640" }));
  parts.push(P({ size: [LEN, 0.8, HALF * 2], position: [54, FLOOR_TOP + WALL_H, 0], color: "#1a1522", canCollide: false }));
  // a title banner over the entry
  parts.push(P({ size: [0.4, 4, 12], position: [-5.4, FLOOR_TOP + 8, 0], color: "#c0392b", material: "neon", canCollide: false }));
  parts.push(P({ shape: "wedge", size: [2, 2, 12], position: [-4, FLOOR_TOP + 5.4, 0], rotation: [0, 0, 90], color: "#7d1f16", canCollide: false }));
  // jazzy uplights
  for (let s = 0; s < 8; s++) { parts.push(P({ shape: "cylinder", size: [0.5, 0.4, 0.5], position: [12 + s * 13, FLOOR_TOP + 0.2, -13], color: "#ff7a1a", material: "neon", canCollide: false })); parts.push(P({ shape: "cylinder", size: [0.5, 0.4, 0.5], position: [12 + s * 13, FLOOR_TOP + 0.2, 13], color: "#35a3e0", material: "neon", canCollide: false })); }

  // twelve pedestals along the far wall — the two SECRET blades first, parked on the
  // LEFT of the ten (x runs 0.8, 10.4, then the classic 20..106.4) — each with a
  // slowly-turning display sword + a touch pad
  const PED_Z = 12, PAD_Z = 5.5, X0 = 20, DX = 9.6;
  out.swordPads = [];
  for (let i = 0; i < SWORDS.length; i++) {
    const sw = SWORDS[i];
    const x = X0 + (i - 2) * DX;
    const pedCol = sw.id === "killstreak" ? "#0a0710" : sw.id === "cheese" ? "#7a5310" : "#1d1826";
    parts.push(P({ shape: "cylinder", size: [4.8, 3, 4.8], position: [x, FLOOR_TOP + 1.5, PED_Z], color: pedCol, material: "metal" }));
    parts.push(P({ shape: "cylinder", size: [4, 0.4, 4], position: [x, FLOOR_TOP + 3.05, PED_Z], color: sw.id === "killstreak" ? "#1a1220" : "#2a2336", material: "metal", canCollide: false }));
    parts.push(P({ shape: "cylinder", size: [5.4, 0.3, 5.4], position: [x, FLOOR_TOP + 3.15, PED_Z], color: sw.colors.gem, material: "neon", canCollide: false }));
    if (sw.id === "killstreak") { // the scratched-out plaque, and a red warning ring
      parts.push(P({ size: [2.2, 1.1, 0.2], position: [x, FLOOR_TOP + 1.6, PED_Z - 2.5], rotation: [12, 0, 0], color: "#565d70", material: "metal", canCollide: false }));
      for (let k = 0; k < 3; k++) parts.push(P({ size: [1.7, 0.09, 0.24], position: [x - 0.1 + k * 0.12, FLOOR_TOP + 1.35 + k * 0.3, PED_Z - 2.56], rotation: [12, 0, -14 + k * 13], color: "#12141c", material: "plastic", canCollide: false }));
    }
    if (sw.id === "cheese") { // crumbs and a cheese-rind ring at the base
      for (let k = 0; k < 5; k++) { const a = k * 1.26 + 0.4; parts.push(P({ shape: "sphere", size: [0.4, 0.28, 0.4], position: [x + Math.cos(a) * 2.9, FLOOR_TOP + 0.15, PED_Z + Math.sin(a) * 2.9], color: "#e8b62a", material: "plastic", canCollide: false })); }
    }
    const cy = FLOOR_TOP + 4.6;
    const spin = [];
    swordModel(parts, sw.id, x, cy, PED_Z, sw.colors, sw.ornament, spin);
    const padId = `bt_sword${i}`;
    parts.push({ id: padId, shape: "cylinder", size: [4.8, 0.3, 4.8], position: [x, FLOOR_TOP + 0.2, PAD_Z], color: sw.id === "killstreak" ? "#4a0f14" : sw.id === "cheese" ? "#ffd23a" : "#e0b23a", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: padId, cooldownS: 0.8 }] });
    out.swordPads.push({ i, id: sw.id, padId, x, center: [x, cy, PED_Z], spin, labelPos: [x, FLOOR_TOP + 8.4, PED_Z] });
  }

  // §10: the Obby of Oof's gate — a cheese arch at the hall's west end, opposite the rack
  const GX = 0, GZ = -14;
  for (const sx of [-1, 1]) parts.push(P({ size: [1.4, 7, 1.4], position: [GX + sx * 3.6, FLOOR_TOP + 3.5, GZ], color: "#e8a33a", material: "plastic" }));
  parts.push(P({ shape: "wedge", size: [8.6, 2.4, 1.6], position: [GX, FLOOR_TOP + 7.8, GZ], rotation: [0, 0, 0], color: "#ffd23a", material: "plastic", canCollide: false }));
  for (let k = 0; k < 4; k++) parts.push(P({ shape: "sphere", size: [0.5, 0.5, 0.3], position: [GX - 2.6 + k * 1.7, FLOOR_TOP + 7.6 + (k % 2) * 0.5, GZ - 0.6], color: "#c9971f", material: "plastic", canCollide: false })); // holes in the arch
  parts.push({ id: "bt_obby_enter", shape: "cylinder", size: [5, 0.3, 5], position: [GX, FLOOR_TOP + 0.2, GZ], color: "#ffd23a", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "bt_obby_enter", cooldownS: 1.5 }] });
  out.obbyGate = [GX, FLOOR_TOP + 9.6, GZ];

  // §12: two leaderboard frames on the entry wall — the boards themselves are canvas
  // sprites game.js hangs at out.boardSpots (kills north, swords south)
  out.boardSpots = [];
  for (const side of [-1, 1]) {
    parts.push(P({ size: [0.5, 9.6, 7.6], position: [-5.1, FLOOR_TOP + 7.5, side * 10], color: "#1d1826", material: "metal", canCollide: false }));
    parts.push(P({ size: [0.6, 0.4, 8], position: [-5.1, FLOOR_TOP + 12.5, side * 10], color: "#e0b23a", material: "neon", canCollide: false }));
    torch(parts, -4.4, FLOOR_TOP + 3.4, side * 14.6, "#35a3e0");
    out.boardSpots.push([-4.7, FLOOR_TOP + 7.5, side * 10]);
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
  // tiered coliseum stands: seating rings climbing OUTWARD (radius rr). Each tier is a
  // ring of tangent box segments — a solid cylinder would roof the whole arena and sit
  // between the camera and the player. SOLID since §11: the climb to the vines starts on
  // these seats, so they collide (and yes, you can flee a duel into the stands now).
  for (let t = 1; t <= 5; t++) {
    const rr = R + t * 4, ty = FLOOR_TOP - 2.4 + t * 2.2, col = t % 2 ? "#7d6e58" : "#8c7a60", N = 36;
    const seg = 2 * rr * Math.sin(Math.PI / N) + 0.8;
    for (let s = 0; s < N; s++) { const a = (s / N) * Math.PI * 2, [px, pz] = ring(CX, CZ, rr, a); parts.push(P({ size: [seg, 2.4, 4.4], position: [px, ty, pz], rotation: [0, 90 - a * 57.29578, 0], color: col })); }
  }
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

// ---- §10: the Obby of Oof — ONE stage, high over the void, meaner than every tower ----
// killY (-40) is the failure path: any fall (or lava touch) respawns at the lobby
// checkpoint, exactly the "fall and you're out" contract. Tops of all planks sit at the
// listed y + half height; the course runs south (−z) from OBBY_START.
function buildObby(parts) {
  const X = 54, Z0 = -260, TOP = 120;
  const plank = (x, z, top, w, d, col) => parts.push(P({ size: [w, 1, d], position: [x, top - 0.5, z], color: col || "#e8a33a", material: "plastic" }));
  // start platform + a nervous little sign arch
  plank(X, Z0, TOP, 6, 6, "#ffd23a");
  for (const sx of [-1, 1]) parts.push(P({ size: [0.6, 4, 0.6], position: [X + sx * 2.4, TOP + 2, Z0 - 2.6], color: "#c9971f", canCollide: false }));
  parts.push(P({ size: [5.8, 1.1, 0.5], position: [X, TOP + 4.2, Z0 - 2.6], color: "#7d1f16", material: "neon", canCollide: false }));
  // 1) three tiny zigzag pads
  plank(X + 2.5, Z0 - 8.4, TOP, 1.6, 1.6);
  plank(X - 2.5, Z0 - 16.8, TOP, 1.6, 1.6);
  plank(X + 2.5, Z0 - 25.2, TOP, 1.6, 1.6);
  // 2) the beam — 0.7 wide, with two lava cubes to hop over mid-walk
  parts.push(P({ size: [0.7, 1, 13], position: [X, TOP - 0.5, Z0 - 36.5], color: "#b98a4e", material: "wood" }));
  for (const z of [Z0 - 34, Z0 - 39]) parts.push({ id: `bt_obby_lava_${Math.abs(Math.round(z))}`, size: [0.72, 0.9, 0.9], position: [X, TOP + 0.45, z], color: "#ff5a1f", material: "lava", canCollide: true, behaviors: [{ type: "kill" }] });
  // 3) a breather pad, then the moving platform ride
  plank(X, Z0 - 50, TOP + 1.5, 2, 2);
  parts.push({ id: "bt_obby_mover", size: [2.4, 0.5, 2.4], position: [X, TOP + 1, Z0 - 54], color: "#35a3e0", material: "neon", canCollide: true, behaviors: [{ type: "movingPlatform", waypoints: [[X, TOP + 1, Z0 - 54], [X, TOP + 1, Z0 - 70]], speed: 5, pauseS: 0.6, mode: "pingpong" }] });
  plank(X, Z0 - 74, TOP + 2, 2, 2);
  // 4) the zigzag ascent — four 1.4-stud pads climbing 2.5 a hop
  plank(X - 3.5, Z0 - 80, TOP + 4.5, 1.4, 1.4);
  plank(X + 3.5, Z0 - 84, TOP + 7, 1.4, 1.4);
  plank(X - 3.5, Z0 - 88, TOP + 9.5, 1.4, 1.4);
  plank(X + 3.5, Z0 - 92, TOP + 12, 1.4, 1.4);
  // 5) the prize ledge: a giant wheel of cheese and the win pad
  plank(X, Z0 - 102, TOP + 12, 10, 10, "#ffd23a");
  parts.push(P({ shape: "cylinder", size: [6, 2.6, 6], position: [X, TOP + 13.3, Z0 - 105], rotation: [0, 0, 90], color: "#ffd23a", material: "plastic", canCollide: false }));
  for (let k = 0; k < 6; k++) { const a = k * 1.05; parts.push(P({ shape: "sphere", size: [0.8, 0.8, 0.5], position: [X - 1.4 + (k % 3) * 1.4, TOP + 12.6 + Math.sin(a) * 1.6, Z0 - 103.4], color: "#c9971f", material: "plastic", canCollide: false })); }
  parts.push({ id: "bt_obby_win", shape: "cylinder", size: [5, 0.3, 5], position: [X, TOP + 12.2, Z0 - 100], color: "#3ddc84", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "bt_obby_win", cooldownS: 2 }] });
}

// ---- §11: the vines, the balcony, the cube, the door and the hermit's room ----------
function buildSecretPath(parts) {
  const [CX, CZ] = ARENA_CENTER;
  // moss + the vine curtain on the stands' outer face, due east (angle 0)
  for (let s = 0; s < 9; s++) {
    const z = -5 + s * 1.25, len = 9 + (s % 3) * 2.4;
    parts.push(P({ size: [0.7, len, 0.55], position: [CX + 78.4, 15.5 - len / 2, z], color: s % 2 ? "#2f8f4a" : "#1f6b34", material: "plastic", canCollide: false }));
    if (s % 2 === 0) parts.push(P({ shape: "sphere", size: [0.5, 0.5, 0.5], position: [CX + 78.6, 15.5 - len, z], color: "#3ddc84", material: "plastic", canCollide: false }));
  }
  parts.push(P({ size: [3, 2.2, 8], position: [CX + 77.6, 14.2, 0], color: "#2f8f4a", material: "plastic", canCollide: false })); // the "green beard" seen from afar
  // the climb DOWN behind the curtain: four shelves to the balcony
  const shelves = [[CX + 82, 12.6, 0], [CX + 86, 10.2, -2], [CX + 89, 7.4, 1], [CX + 92, 4.6, 0]];
  for (const [sx, sy, sz] of shelves) parts.push(P({ size: [2.6, 0.5, 2.6], position: [sx, sy, sz], color: "#2f8f4a", material: "plastic" }));
  // the balcony (floor top = BALCONY[1])
  parts.push(P({ size: [12, 1, 10], position: [BALCONY[0], BALCONY[1] - 0.5, BALCONY[2]], color: "#8a7a60", material: "metal" }));
  for (const sz of [-5, 5]) parts.push(P({ size: [12, 1.1, 0.5], position: [BALCONY[0], BALCONY[1] + 0.55, sz], color: "#6b5d48", material: "metal", canCollide: false }));
  torch(parts, BALCONY[0] - 5, BALCONY[1] + 2.4, BALCONY[2] - 4, "#35a3e0");
  // the six-faced thing that WAITS (game.js slowly turns it and hangs its label)
  parts.push({ id: "bt_cube_body", size: [3, 3, 3], position: [CUBE_POS[0], CUBE_POS[1], CUBE_POS[2]], rotation: [0, 25, 0], color: "#12101c", material: "metal", canCollide: false });
  for (const [ox, oy, oz] of [[1.6, 0, 0], [-1.6, 0, 0], [0, 1.6, 0], [0, 0, 1.6], [0, 0, -1.6], [0, -1.6, 0]]) parts.push(P({ shape: "sphere", size: [0.34, 0.34, 0.34], position: [CUBE_POS[0] + ox, CUBE_POS[1] + oy, CUBE_POS[2] + oz], color: "#ff2a2a", material: "neon", canCollide: false }));
  parts.push({ id: "bt_cube", shape: "cylinder", size: [6, 0.3, 6], position: [CUBE_POS[0], BALCONY[1] + 0.16, CUBE_POS[2]], color: "#7c3aed", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "bt_cube", cooldownS: 1.5 }] });
  // the hermit's room: 12x12, one sealed stone door in its west wall
  const RX = 526, RZ = 3, H = 8;
  parts.push(P({ size: [12, 1, 12], position: [RX, BALCONY[1] - 0.5, RZ], color: "#6b5d48", material: "wood" }));
  parts.push(P({ size: [12, 1, 12], position: [RX, BALCONY[1] + H + 0.5, RZ], color: "#4a3d30", canCollide: false }));
  parts.push(P({ size: [1, H, 12], position: [RX + 6, BALCONY[1] + H / 2, RZ], color: "#8a7a60" }));                    // east
  for (const sz of [-1, 1]) parts.push(P({ size: [12, H, 1], position: [RX, BALCONY[1] + H / 2, RZ + sz * 6], color: "#8a7a60" })); // north/south
  // west wall parts around the door hole (door slab is its own removable part)
  parts.push(P({ size: [1, H, 4.3], position: [RX - 6, BALCONY[1] + H / 2, RZ - 3.85], color: "#8a7a60" }));
  parts.push(P({ size: [1, H, 4.3], position: [RX - 6, BALCONY[1] + H / 2, RZ + 3.85], color: "#8a7a60" }));
  parts.push(P({ size: [1, H - 6.4, 3.4], position: [RX - 6, BALCONY[1] + 6.4 + (H - 6.4) / 2, RZ], color: "#8a7a60" }));
  parts.push({ id: "bt_door", size: [1.1, 6.4, 3.4], position: [DOOR_POS[0], DOOR_POS[1], DOOR_POS[2]], color: "#565d70", material: "metal", canCollide: true });
  for (let k = 0; k < 3; k++) parts.push(P({ shape: "sphere", size: [0.3, 0.3, 0.2], position: [DOOR_POS[0] - 0.6, DOOR_POS[1] - 1.6 + k * 1.6, DOOR_POS[2]], color: "#ff2a2a", material: "neon", canCollide: false }));
  // inside: lectern + the glowing book, a bedroll, a cold bowl — somebody LIVED here
  parts.push(P({ shape: "cylinder", size: [1.4, 1.6, 1.4], position: [BOOK1_POS[0], BALCONY[1] + 0.8, BOOK1_POS[2]], color: "#4a2f18", material: "wood", canCollide: false })); // walk-through furniture: it sits ON the touch pad
  parts.push(P({ size: [1.7, 0.28, 1.2], position: [BOOK1_POS[0], BOOK1_POS[1] - 0.5, BOOK1_POS[2]], rotation: [0, 0, 8], color: "#7d1f16", material: "plastic", canCollide: false }));
  parts.push(P({ size: [1.5, 0.1, 1.0], position: [BOOK1_POS[0], BOOK1_POS[1] - 0.32, BOOK1_POS[2]], rotation: [0, 0, 8], color: "#ffe6a0", material: "neon", canCollide: false }));
  parts.push({ id: "bt_book1", shape: "cylinder", size: [4, 0.3, 4], position: [BOOK1_POS[0], BALCONY[1] + 0.16, BOOK1_POS[2]], color: "#ffe6a0", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "bt_book1", cooldownS: 1.5 }] });
  parts.push(P({ size: [4, 0.4, 1.8], position: [RX + 3, BALCONY[1] + 0.2, RZ - 3.6], rotation: [0, 12, 0], color: "#7d6e58", material: "plastic", canCollide: false })); // bedroll
  parts.push(P({ shape: "cylinder", size: [0.9, 0.4, 0.9], position: [RX - 3, BALCONY[1] + 0.2, RZ - 4], color: "#4a2f18", material: "wood", canCollide: false }));       // the bowl
  torch(parts, RX + 5, BALCONY[1] + 3.4, RZ + 5, "#ff7a1a");
}

// ---- §11: what hangs in the sky — the faint ring, the star isle, the crater ----------
function buildSkyBits(parts) {
  // the ring the sky keeps: ten pale puffs, always there, easy to never look up at
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    parts.push(P({ shape: "sphere", size: [3.4, 1.7, 3.4], position: [RING_CENTER[0] + Math.cos(a) * 20, RING_CENTER[1], RING_CENTER[2] + Math.sin(a) * 20], color: "#dfe8f2", material: "plastic", canCollide: false }));
  }
  // the star isle: a crystal shard floating off the old tree, shrine on top
  const [IX, IY, IZ] = SKY_ISLE;
  parts.push(P({ shape: "cylinder", size: [12, 1.6, 12], position: [IX, IY - 0.8, IZ], color: "#3a2f5e", material: "metal" }));
  parts.push(P({ shape: "wedge", size: [7, 6, 7], position: [IX, IY - 4.6, IZ], rotation: [180, 30, 0], color: "#2a1a4a", material: "metal", canCollide: false }));
  for (let i = 0; i < 5; i++) { const a = i * 1.257; parts.push(P({ shape: "wedge", size: [1.1, 3.4 + (i % 2), 1.1], position: [IX + Math.cos(a) * 4.6, IY + 1.7, IZ + Math.sin(a) * 4.6], rotation: [0, i * 72, 0], color: "#a05cff", material: "neon", canCollide: false })); }
  // the FALLEN STAR — the material itself, hanging over the altar
  parts.push({ id: "bt_star_core", shape: "sphere", size: [1.6, 1.6, 1.6], position: [IX, IY + 4.6, IZ], color: "#fff59e", material: "neon", canCollide: false });
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; parts.push(P({ shape: "wedge", size: [0.5, 1.6, 0.5], position: [IX + Math.cos(a) * 1.4, IY + 4.6, IZ + Math.sin(a) * 1.4], rotation: [0, i * 90 + 25, 90], color: "#ffd23a", material: "neon", canCollide: false })); }
  parts.push({ id: "bt_rebirth", shape: "cylinder", size: [6, 0.3, 6], position: [IX, IY + 0.16, IZ], color: "#ffd23a", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "bt_rebirth", cooldownS: 2 }] });
  // the crater: a scrap of rock at the coordinates the stars spell, crack down its middle
  const [KX, KY, KZ] = CRATER;
  parts.push(P({ size: [9, 2, 9], position: [KX, KY - 1, KZ], color: "#4a3d30", material: "metal" }));
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; parts.push(P({ shape: "wedge", size: [1.6, 1.2 + (i % 2) * 0.8, 1.6], position: [KX + Math.cos(a) * 3.4, KY + 0.5, KZ + Math.sin(a) * 3.4], rotation: [0, i * 60, 0], color: "#5a4a38", material: "metal", canCollide: false })); }
  parts.push(P({ size: [3.4, 0.2, 1.1], position: [KX, KY + 0.12, KZ], rotation: [0, 35, 0], color: "#12101c", material: "plastic", canCollide: false }));
  parts.push(P({ size: [2.2, 0.16, 0.5], position: [KX + 0.6, KY + 0.14, KZ + 0.8], rotation: [0, -20, 0], color: "#ff5a1f", material: "neon", canCollide: false }));
  parts.push({ id: "bt_crater", shape: "cylinder", size: [5.6, 0.3, 5.6], position: [KX, KY + 0.18, KZ], color: "#ff8c1a", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "bt_crater", cooldownS: 1.5 }] });
}

// ---- §11: the courtyard, the hollow tree, the canopy deck and the rocket kiosk -------
function buildCourtyard(parts, out) {
  const [TX, TZ] = TREE_POS;
  parts.push(P({ size: [60, 1, 60], position: [110, FLOOR_TOP - 0.5, 50], color: "#3f7d3a", material: "plastic" }));       // lawn
  parts.push(P({ size: [60, 0.14, 60], position: [110, FLOOR_TOP + 0.06, 50], color: "#4a8f44", material: "plastic", canCollide: false }));
  for (const [hx, hz, hw, hd] of [[110, 79.2, 60, 1.6], [80.8, 50, 1.6, 60], [139.2, 50, 1.6, 60]]) parts.push(P({ size: [hw, 2.2, hd], position: [hx, FLOOR_TOP + 1.1, hz], color: "#2f6b2a", material: "plastic" })); // hedges (north side is the lobby wall)
  for (let s = 0; s < 7; s++) parts.push(P({ shape: "cylinder", size: [1.7, 0.16, 1.7], position: [104 + Math.sin(s * 0.8) * 2.4, FLOOR_TOP + 0.1, 23 + s * 4.2], color: "#b0a084", material: "plastic", canCollide: false })); // stepping stones, gate -> tree
  // THE TREE. A hollow trunk: ten tangent bark slats around r 5.3 (one southern slat is
  // the doorway — sealed by bt_treedoor until the riddle is understood), a spiral of
  // tiny ledges inside, a top-south WINDOW out to two branch hops, and the canopy deck.
  const SLATS = 10, TRUNK_H = 76;
  for (let s = 0; s < SLATS; s++) {
    const a = Math.PI / 2 + (s / SLATS) * Math.PI * 2; // slat 0 dead south (+z): the doorway
    const bx = TX + 5.3 * Math.cos(a), bz = TZ + 5.3 * Math.sin(a);
    const doorway = s === 0, windowSlat = s === 1; // the window slat stops short of the top
    const h = doorway ? TRUNK_H - 6.4 : windowSlat ? TRUNK_H - 7 : TRUNK_H;
    const yBase = doorway ? FLOOR_TOP + 6.4 : FLOOR_TOP;
    parts.push(P({ size: [3.9, h, 1.5], position: [bx, yBase + h / 2, bz], rotation: [0, 90 - (a * 57.29578), 0], color: s % 2 ? "#4a2f18" : "#5a3a1f", material: "wood" }));
  }
  parts.push({ id: "bt_treedoor", size: [3.6, 6.4, 1.6], position: [TX, FLOOR_TOP + 3.2, TZ + 5.3], color: "#3a2414", material: "wood", canCollide: true });
  parts.push(P({ shape: "sphere", size: [0.5, 0.5, 0.3], position: [TX, FLOOR_TOP + 4.6, TZ + 6.2], color: "#3ddc84", material: "neon", canCollide: false })); // a mossy "knot" that is clearly a lock
  parts.push({ id: "bt_tree", shape: "cylinder", size: [5, 0.3, 5], position: [TX, FLOOR_TOP + 0.2, TZ + 8], color: "#2f8f4a", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "bt_tree", cooldownS: 1.5 }] });
  // inside: 23 tiny ledges spiralling up (three of them SPIN — the most annoying jumps
  // ever built on purpose), two more up to the window sill, then out and around
  for (let s = 0; s < 23; s++) {
    const a = Math.PI / 2 + s * 0.9, y = FLOOR_TOP + 4 + s * 2.85;
    const lx = TX + 3.1 * Math.cos(a), lz = TZ + 3.1 * Math.sin(a);
    const def = { size: [1.5, 0.4, 1.5], position: [lx, y, lz], rotation: [0, -a * 57.29578, 0], color: s % 2 ? "#6b4423" : "#7d5230", material: "wood" };
    if (s === 8 || s === 15 || s === 22) { def.behaviors = [{ type: "spinner", axis: "y", speed: 120 }]; def.color = "#b98a4e"; }
    parts.push(P(def));
  }
  // the sill pair under the window slat (126°), then three branches AROUND the deck's
  // rim (r > 9 so the deck never roofs the jump), then up onto the deck itself
  parts.push(P({ size: [1.5, 0.4, 1.5], position: [TX - 1.6, FLOOR_TOP + 68.6, TZ + 2.4], color: "#6b4423", material: "wood" }));
  parts.push(P({ size: [1.6, 0.4, 1.6], position: [TX - 2.9, FLOOR_TOP + 71.4, TZ + 3.9], color: "#7d5230", material: "wood" }));
  parts.push(P({ size: [2, 0.5, 2], position: [TX - 6.5, FLOOR_TOP + 73.5, TZ + 8.5], color: "#5a3a1f", material: "wood" }));
  parts.push(P({ size: [2, 0.5, 2], position: [TX - 2.5, FLOOR_TOP + 76.2, TZ + 10.5], color: "#5a3a1f", material: "wood" }));
  parts.push(P({ size: [2, 0.5, 2], position: [TX + 3.5, FLOOR_TOP + 78.8, TZ + 10], color: "#5a3a1f", material: "wood" }));
  // the canopy deck (top = SCOPE_TOP[1]) + railing + leaf cover that hides it from below
  parts.push(P({ shape: "cylinder", size: [18, 1, 18], position: [TX, SCOPE_TOP[1] - 0.5, TZ], color: "#5a3a1f", material: "wood" }));
  for (let s = 0; s < 12; s++) { const a = (s / 12) * Math.PI * 2; parts.push(P({ size: [4.8, 1.1, 0.4], position: [TX + 8.7 * Math.cos(a), SCOPE_TOP[1] + 0.55, TZ + 8.7 * Math.sin(a)], rotation: [0, 90 - a * 57.29578, 0], color: "#4a2f18", material: "wood", canCollide: false })); }
  for (let s = 0; s < 9; s++) { const a = s * 0.7, rr = 6 + (s % 3) * 3.4; parts.push(P({ shape: "sphere", size: [7 + (s % 3) * 2, 4.4, 7 + (s % 3) * 2], position: [TX + rr * Math.cos(a), SCOPE_TOP[1] + 4.4 + (s % 2) * 2.2, TZ + rr * Math.sin(a)], color: s % 2 ? "#2f8f4a" : "#3f7d3a", material: "plastic", canCollide: false })); }
  for (let s = 0; s < 6; s++) { const a = s * 1.05 + 0.5; parts.push(P({ shape: "sphere", size: [5.5, 3.4, 5.5], position: [TX + 7.6 * Math.cos(a), SCOPE_TOP[1] - 3.2, TZ + 7.6 * Math.sin(a)], color: "#2f6b2a", material: "plastic", canCollide: false })); } // skirt of leaves hiding the deck's underside
  // the telescope: a brass tube aimed at the north-east sky
  parts.push(P({ shape: "cylinder", size: [2.4, 1.2, 2.4], position: [TX, SCOPE_TOP[1] + 0.6, TZ - 4], color: "#4a2f18", material: "wood", canCollide: false })); // walk-through: it stands ON the touch pad
  parts.push(P({ shape: "cylinder", size: [1.1, 4.6, 1.1], position: [TX, SCOPE_TOP[1] + 2.9, TZ - 5.4], rotation: [-42, 0, 0], color: "#b98a4e", material: "metal", canCollide: false }));
  parts.push(P({ shape: "cylinder", size: [1.5, 0.9, 1.5], position: [TX, SCOPE_TOP[1] + 4.4, TZ - 6.9], rotation: [-42, 0, 0], color: "#8c6a3f", material: "metal", canCollide: false }));
  parts.push({ id: "bt_scope", shape: "cylinder", size: [4.4, 0.3, 4.4], position: [TX, SCOPE_TOP[1] + 0.16, TZ - 4], color: "#7ec8ff", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "bt_scope", cooldownS: 1.5 }] });
  // the rocket kiosk: pad, a proud little rocket, and its touch ring
  const [RX2, RZ2] = ROCKET_POS;
  parts.push(P({ shape: "cylinder", size: [9, 0.6, 9], position: [RX2, FLOOR_TOP + 0.3, RZ2], color: "#565d70", material: "metal" }));
  parts.push({ id: "bt_rocket_body", shape: "cylinder", size: [2.6, 7, 2.6], position: [RX2, FLOOR_TOP + 4.1, RZ2], color: "#e8e4f0", material: "metal", canCollide: false });
  parts.push({ id: "bt_rocket_nose", shape: "wedge", size: [2.2, 2.6, 2.2], position: [RX2, FLOOR_TOP + 8.9, RZ2], color: "#c0392b", material: "plastic", canCollide: false });
  for (let k = 0; k < 3; k++) { const a = k * 2.09; parts.push({ id: `bt_rocket_fin${k}`, shape: "wedge", size: [0.4, 2.4, 1.8], position: [RX2 + Math.cos(a) * 1.6, FLOOR_TOP + 1.6, RZ2 + Math.sin(a) * 1.6], rotation: [0, -k * 120, 0], color: "#c0392b", material: "plastic", canCollide: false }); }
  parts.push(P({ shape: "sphere", size: [0.9, 0.9, 0.9], position: [RX2 + 1.1, FLOOR_TOP + 5.6, RZ2 - 1.1], color: "#7ec8ff", material: "glass", canCollide: false })); // porthole
  parts.push({ id: "bt_rocket", shape: "cylinder", size: [7.6, 0.3, 7.6], position: [RX2, FLOOR_TOP + 0.62, RZ2], color: "#7ec8ff", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "bt_rocket", cooldownS: 1.5 }] });
  out.rocketPad = [RX2, FLOOR_TOP + 0.9, RZ2];
}

export function buildWorld() {
  seq = 0;
  const parts = [];
  const out = { parts };
  buildLobby(parts, out);
  buildArena(parts, out);
  buildObby(parts);
  buildSecretPath(parts);
  buildSkyBits(parts);
  buildCourtyard(parts, out);
  return out;
}
