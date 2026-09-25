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
// ---- §13: the Time Warp — the clock arch, the tower, and the Lettuce Realm ----------
export const TW_GATE = Object.freeze([96, FLOOR_TOP, -14]);      // the clock arch's floor pad
export const TW_PED = Object.freeze([110, FLOOR_TOP, -12]);      // the off-rack pedestal
export const TW_TOWER = Object.freeze([-80, 120]);               // tower centre (x, z), base high in the sky
export const TW_START = Object.freeze([-80, 61.3, 131]);         // where the gate drops you (on the base disc)
export const TW_TOP = Object.freeze([-80, 146, 120]);            // the summit platform's top
export const LETTUCE_SPAWN = Object.freeze([0, 4.3, 590]);       // the realm's spawn plaza
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
  } else if (ornament === "timewarp") {
    // a clock caught mid-tick: a dial of twelve floating hour marks ringing the blade,
    // two golden hands, three drifting gears and a spiral of escaping seconds-sand
    for (let i = 0; i < 12; i++) { const a = i * 0.5236; add({ shape: "box", size: [0.15, 0.4, 0.15], off: [Math.cos(a) * 1.45, 1.9 + Math.sin(a) * 1.45, 0], rotation: [0, 0, 90 - a * 57.29578], color: i % 3 === 0 ? "#e0b23a" : "#7ec8ff", material: "neon" }); }
    add({ shape: "box", size: [0.13, 1.2, 0.13], off: [0, 2.45, 0.1], color: "#e0b23a", material: "neon" });                    // minute hand
    add({ shape: "box", size: [0.13, 0.8, 0.13], off: [0.32, 2.1, 0.1], rotation: [0, 0, -55], color: "#ffd23a", material: "neon" }); // hour hand
    add({ shape: "sphere", size: [0.2, 0.2, 0.2], off: [0, 1.9, 0.1], color: "#dff4ff", material: "neon" });                   // the pin
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.5; add({ shape: "cylinder", size: [0.6, 0.16, 0.6], off: [Math.cos(a) * 0.95, 0.3 + i * 0.55, Math.sin(a) * 0.95], rotation: [90, 0, i * 40], color: "#b98a4e", material: "metal" }); add({ shape: "sphere", size: [0.16, 0.16, 0.16], off: [Math.cos(a) * 0.95, 0.3 + i * 0.55, Math.sin(a) * 0.95], color: "#e0b23a", material: "metal" }); } // gears adrift
    for (let s = 0; s < 7; s++) { const a = s * 1.7; add({ shape: "sphere", size: [0.13, 0.13, 0.13], off: [Math.cos(a) * (0.4 + s * 0.06), -0.5 - s * 0.16, Math.sin(a) * (0.4 + s * 0.06)], color: s % 2 ? "#ffd23a" : "#dff4ff", material: "neon" }); } // sand spiralling out of the hourglass pommel
  }
}

function ring(cx, cz, r, a) { return [cx + r * Math.cos(a), cz + r * Math.sin(a)]; }

// A wall torch: a bracket + a flame. Purely decorative (never collides). Every flame's
// position is recorded so game.js can rain embers out of the ones near the player.
let torchSpots = [];
function torch(parts, x, y, z, flame) {
  parts.push(P({ shape: "cylinder", size: [0.2, 1.2, 0.2], position: [x, y, z], color: "#3a2a1a", material: "wood", canCollide: false }));
  parts.push(P({ shape: "sphere", size: [0.7, 1.0, 0.7], position: [x, y + 0.9, z], color: flame || "#ff8c1a", material: "lava", canCollide: false }));
  parts.push(P({ shape: "sphere", size: [0.35, 0.5, 0.35], position: [x, y + 1.2, z], color: "#ffe45c", material: "neon", canCollide: false }));
  torchSpots.push({ x, y: y + 1.4, z, color: flame || "#ff8c1a" });
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
    // §13: offRack blades leave the classic twelve their pads and indexes; the Time
    // Warp's pedestal stands across the aisle instead, beside its clock arch.
    const x = sw.offRack ? TW_PED[0] : X0 + (i - 2) * DX;
    const pz = sw.offRack ? TW_PED[2] : PED_Z;
    const padZ = sw.offRack ? -4.6 : PAD_Z;
    const pedCol = sw.id === "timewarp" ? "#141028" : sw.id === "killstreak" ? "#0a0710" : sw.id === "cheese" ? "#7a5310" : "#1d1826";
    parts.push(P({ shape: "cylinder", size: [4.8, 3, 4.8], position: [x, FLOOR_TOP + 1.5, pz], color: pedCol, material: "metal" }));
    parts.push(P({ shape: "cylinder", size: [4, 0.4, 4], position: [x, FLOOR_TOP + 3.05, pz], color: sw.id === "killstreak" ? "#1a1220" : "#2a2336", material: "metal", canCollide: false }));
    parts.push(P({ shape: "cylinder", size: [5.4, 0.3, 5.4], position: [x, FLOOR_TOP + 3.15, pz], color: sw.colors.gem, material: "neon", canCollide: false }));
    if (sw.id === "killstreak") { // the scratched-out plaque, and a red warning ring
      parts.push(P({ size: [2.2, 1.1, 0.2], position: [x, FLOOR_TOP + 1.6, pz - 2.5], rotation: [12, 0, 0], color: "#565d70", material: "metal", canCollide: false }));
      for (let k = 0; k < 3; k++) parts.push(P({ size: [1.7, 0.09, 0.24], position: [x - 0.1 + k * 0.12, FLOOR_TOP + 1.35 + k * 0.3, pz - 2.56], rotation: [12, 0, -14 + k * 13], color: "#12141c", material: "plastic", canCollide: false }));
    }
    if (sw.id === "cheese") { // crumbs and a cheese-rind ring at the base
      for (let k = 0; k < 5; k++) { const a = k * 1.26 + 0.4; parts.push(P({ shape: "sphere", size: [0.4, 0.28, 0.4], position: [x + Math.cos(a) * 2.9, FLOOR_TOP + 0.15, pz + Math.sin(a) * 2.9], color: "#e8b62a", material: "plastic", canCollide: false })); }
    }
    if (sw.id === "timewarp") { // a clock face inlaid around the base, hour ticks and all
      parts.push(P({ shape: "cylinder", size: [7.4, 0.14, 7.4], position: [x, FLOOR_TOP + 0.1, pz], color: "#1a1433", material: "metal", canCollide: false }));
      for (let k = 0; k < 12; k++) { const a = k * 0.5236; parts.push(P({ size: [0.5, 0.12, 0.22], position: [x + Math.cos(a) * 3.2, FLOOR_TOP + 0.2, pz + Math.sin(a) * 3.2], rotation: [0, -a * 57.29578, 0], color: k % 3 === 0 ? "#e0b23a" : "#7ec8ff", material: "neon", canCollide: false })); }
    }
    const cy = FLOOR_TOP + 4.6;
    const spin = [];
    swordModel(parts, sw.id, x, cy, pz, sw.colors, sw.ornament, spin);
    const padId = `bt_sword${i}`;
    parts.push({ id: padId, shape: "cylinder", size: [4.8, 0.3, 4.8], position: [x, FLOOR_TOP + 0.2, padZ], color: sw.id === "timewarp" ? "#7ec8ff" : sw.id === "killstreak" ? "#4a0f14" : sw.id === "cheese" ? "#ffd23a" : "#e0b23a", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: padId, cooldownS: 0.8 }] });
    out.swordPads.push({ i, id: sw.id, padId, x, center: [x, cy, pz], spin, labelPos: [x, FLOOR_TOP + 8.4, pz] });
  }

  // §10: the Obby of Oof's gate — a cheese arch at the hall's west end, opposite the rack
  const GX = 0, GZ = -14;
  for (const sx of [-1, 1]) parts.push(P({ size: [1.4, 7, 1.4], position: [GX + sx * 3.6, FLOOR_TOP + 3.5, GZ], color: "#e8a33a", material: "plastic" }));
  parts.push(P({ shape: "wedge", size: [8.6, 2.4, 1.6], position: [GX, FLOOR_TOP + 7.8, GZ], rotation: [0, 0, 0], color: "#ffd23a", material: "plastic", canCollide: false }));
  for (let k = 0; k < 4; k++) parts.push(P({ shape: "sphere", size: [0.5, 0.5, 0.3], position: [GX - 2.6 + k * 1.7, FLOOR_TOP + 7.6 + (k % 2) * 0.5, GZ - 0.6], color: "#c9971f", material: "plastic", canCollide: false })); // holes in the arch
  parts.push({ id: "bt_obby_enter", shape: "cylinder", size: [5, 0.3, 5], position: [GX, FLOOR_TOP + 0.2, GZ], color: "#ffd23a", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "bt_obby_enter", cooldownS: 1.5 }] });
  out.obbyGate = [GX, FLOOR_TOP + 9.6, GZ];

  // §13: the CLOCK ARCH at the hall's east end — the way to the Time Warp Tower. Dark
  // pillars, a golden clock face over the lintel, and a pale-blue pad that ticks.
  const [WX, , WZ] = TW_GATE;
  for (const sx of [-1, 1]) {
    parts.push(P({ size: [1.5, 8, 1.5], position: [WX + sx * 3.6, FLOOR_TOP + 4, WZ], color: "#2a1a4a", material: "metal" }));
    parts.push(P({ size: [1.9, 0.5, 1.9], position: [WX + sx * 3.6, FLOOR_TOP + 8.2, WZ], color: "#e0b23a", material: "metal", canCollide: false }));
  }
  parts.push(P({ size: [9.4, 1.2, 1.7], position: [WX, FLOOR_TOP + 8.9, WZ], color: "#1a1433", material: "metal", canCollide: false }));
  // the clock HANGS in the archway (the hall's ceiling sits at wall-top 12, so the face
  // lives between the pillars, not above them): twelve marks, two hands, a warm pin
  parts.push(P({ size: [0.16, 1.4, 0.16], position: [WX, FLOOR_TOP + 7.6, WZ], color: "#e0b23a", material: "metal", canCollide: false })); // the chain
  for (let k = 0; k < 12; k++) { const a = k * 0.5236; parts.push(P({ size: [0.3, 0.3, 0.24], position: [WX + Math.cos(a) * 1.6, FLOOR_TOP + 5.3 + Math.sin(a) * 1.6, WZ], color: k % 3 === 0 ? "#e0b23a" : "#7ec8ff", material: "neon", canCollide: false })); }
  parts.push(P({ size: [0.2, 1.2, 0.2], position: [WX, FLOOR_TOP + 5.8, WZ - 0.1], color: "#e0b23a", material: "neon", canCollide: false }));
  parts.push(P({ size: [0.2, 0.85, 0.2], position: [WX + 0.38, FLOOR_TOP + 5.5, WZ - 0.1], rotation: [0, 0, -60], color: "#ffd23a", material: "neon", canCollide: false }));
  parts.push(P({ shape: "sphere", size: [0.3, 0.3, 0.3], position: [WX, FLOOR_TOP + 5.3, WZ - 0.14], color: "#dff4ff", material: "neon", canCollide: false }));
  // swirling "sand" up the pillars
  for (let k = 0; k < 8; k++) { const sx = k % 2 ? 1 : -1; parts.push(P({ shape: "sphere", size: [0.26, 0.26, 0.26], position: [WX + sx * (3.6 - (k % 4) * 0.3), FLOOR_TOP + 1.5 + k * 0.9, WZ - 0.9], color: k % 2 ? "#ffd23a" : "#7ec8ff", material: "neon", canCollide: false })); }
  parts.push({ id: "bt_tw_enter", shape: "cylinder", size: [5, 0.3, 5], position: [WX, FLOOR_TOP + 0.2, WZ], color: "#7ec8ff", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "bt_tw_enter", cooldownS: 1.5 }] });
  out.twGate = [WX, FLOOR_TOP + 11, WZ];

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

// ---- §13a: the TIME WARP TOWER — tiny parts, lava, lava spinners, insane jumps -------
// The whole climb lives inside r ~13 of the centre while the base disc is r 15, so any
// FALL lands back on the base disc — start the climb over — while LAVA kills outright
// and sends you to the lobby checkpoint. Every hop obeys the courtyard's law (spec 26
// §11): ≤ ~5.5 across, ≤ 3 up — hard, never impossible.
function buildTimewarpTower(parts) {
  const [TX, TZ] = TW_TOWER;
  const S = Math.PI / 2; // due south (+z): where the gate drops you
  const rp = (a, r) => [TX + Math.cos(a) * r, TZ + Math.sin(a) * r];
  const pad = (a, r, top, w, col, extraBehaviors) => {
    const [px, pz] = rp(a, r);
    const def = { size: [w, 0.6, w], position: [px, top - 0.3, pz], rotation: [0, -a * 57.29578, 0], color: col || "#5a4a7a", material: "plastic" };
    if (extraBehaviors) def.behaviors = extraBehaviors;
    parts.push(P(def));
  };
  const arm = (y, len, speed) => parts.push(P({ size: [len, 0.5, 0.9], position: [TX, y, TZ], color: "#ff5a1f", material: "lava", canCollide: true, behaviors: [{ type: "spinner", axis: "y", speed }, { type: "kill" }] }));

  // the base disc, its trim, and ten pale watch-fires around the rim
  parts.push(P({ shape: "cylinder", size: [30, 2, 30], position: [TX, 60, TZ], color: "#2a2336", material: "metal" }));
  parts.push(P({ shape: "cylinder", size: [27, 0.2, 27], position: [TX, 61.11, TZ], color: "#3a2f5e", canCollide: false }));
  for (let i = 0; i < 10; i++) { const [px, pz] = rp(i * 0.628, 13.6); torch(parts, px, 61.6, pz, "#7ec8ff"); }
  // the core: one obsidian column wearing glowing clock bands
  parts.push(P({ shape: "cylinder", size: [6, 82, 6], position: [TX, 102, TZ], color: "#141020", material: "metal" }));
  for (let y = 72; y <= 132; y += 12) parts.push(P({ shape: "cylinder", size: [6.6, 0.5, 6.6], position: [TX, y, TZ], color: "#7ec8ff", material: "neon", canCollide: false }));
  // start arch + the two warnings
  for (const sx of [-1, 1]) parts.push(P({ size: [0.8, 5, 0.8], position: [TX + sx * 3, 63.5, TZ + 12.5], color: "#2a1a4a", material: "metal" }));
  parts.push(P({ size: [6.8, 1, 1], position: [TX, 66.3, TZ + 12.5], color: "#e0b23a", material: "neon", canCollide: false }));
  parts.push(P({ size: [0.4, 0.4, 0.4], position: [TX, 63.4, TZ + 9.5], color: "#1a1226", canCollide: false, behaviors: [{ type: "text", text: "THE TIME WARP TOWER", size: 2.6 }] }));
  parts.push(P({ size: [0.4, 0.4, 0.4], position: [TX, 61.7, TZ + 7], color: "#1a1226", canCollide: false, behaviors: [{ type: "text", text: "fall = start over • lava = back to the lobby", size: 1.4 }] }));

  // S1 — five tiny pads spiralling off the rim
  for (let i = 1; i <= 5; i++) pad(S + 0.5 * i, 10, 61 + 2.5 * i, 1.4, i % 2 ? "#7ec8ff" : "#5a4a7a");
  // S2 — a breather ledge, then a 0.7-wide beam in toward the core with two lava hops
  pad(S + 3.0, 10, 76, 3, "#3a2f5e");
  {
    const a = S + 3.0, [bx, bz] = rp(a, 6.9);
    parts.push(P({ size: [5.5, 0.5, 0.7], position: [bx, 75.75, bz], rotation: [0, -a * 57.29578, 0], color: "#b98a4e", material: "wood" }));
    for (const r of [8.3, 5.8]) { const [lx, lz] = rp(a, r); parts.push(P({ size: [0.8, 0.8, 0.8], position: [lx, 76.4, lz], color: "#ff5a1f", material: "lava", canCollide: true, behaviors: [{ type: "kill" }] })); }
  }
  // S3 — collar one, swept whole by the first lava spinner
  parts.push(P({ shape: "cylinder", size: [11, 0.6, 11], position: [TX, 75.7, TZ], color: "#2a2336", material: "metal" }));
  arm(76.75, 11, 80);
  // S4 — eight 1.2-stud pads spiralling the core, past a burning band you must not hug
  for (let i = 0; i < 8; i++) pad(S + 3.0 + 0.85 * (i + 1), 5.6, 78.6 + 2.6 * i, 1.2, i % 2 ? "#e0b23a" : "#5a4a7a");
  parts.push(P({ shape: "cylinder", size: [7, 1.2, 7], position: [TX, 87, TZ], color: "#ff5a1f", material: "lava", canCollide: true, behaviors: [{ type: "kill" }] }));
  // S5 — the ferry: a moving platform out to a spinner-swept island
  const A5 = S + 3.0 + 0.85 * 8 + 0.5;
  {
    const [w1x, w1z] = rp(A5, 6.8), [w2x, w2z] = rp(A5, 7.8); // stops just shy of the island's rim
    parts.push(P({ size: [2.2, 0.5, 2.2], position: [w1x, 96.95, w1z], color: "#35a3e0", material: "neon", canCollide: true, behaviors: [{ type: "movingPlatform", waypoints: [[w1x, 96.95, w1z], [w2x, 96.95, w2z]], speed: 4, pauseS: 0.7, mode: "pingpong" }] }));
    const [ix, iz] = rp(A5, 12);
    parts.push(P({ shape: "cylinder", size: [6, 1, 6], position: [ix, 96.7, iz], color: "#2a2336", material: "metal" }));
    parts.push(P({ size: [5.5, 0.5, 0.8], position: [ix, 97.95, iz], color: "#ff5a1f", material: "lava", canCollide: true, behaviors: [{ type: "spinner", axis: "y", speed: 150 }, { type: "kill" }] }));
  }
  // S6 — five 1.1-stud pads arcing back in and up to collar two
  for (let i = 0; i < 5; i++) pad(A5 + 0.55 * (i + 1), 10.5 - 1.1 * i, 100 + 2.6 * i, 1.1, i % 2 ? "#7ec8ff" : "#5a4a7a");
  // S7 — collar two: TWO lava spinners, opposite ways, different heights
  parts.push(P({ shape: "cylinder", size: [11, 0.6, 11], position: [TX, 110.7, TZ], color: "#2a2336", material: "metal" }));
  arm(111.75, 11, 100);
  arm(112.4, 8, -140);
  // S8 — three 0.8-wide wall-hug beams stacked like stairs, a lava stud on each
  const AE = A5 + 0.55 * 5 + 0.7;
  for (let k = 0; k < 3; k++) {
    const a = AE + 0.95 * k, top = 113.5 + 2.8 * k, [bx, bz] = rp(a, 6.9);
    parts.push(P({ size: [6.5, 0.5, 0.8], position: [bx, top - 0.25, bz], rotation: [0, 90 - a * 57.29578, 0], color: "#b98a4e", material: "wood" }));
    parts.push(P({ size: [0.85, 0.7, 0.85], position: [bx, top + 0.35, bz], color: "#ff5a1f", material: "lava", canCollide: true, behaviors: [{ type: "kill" }] }));
  }
  // S9 — the final spiral: eight 1-stud pads out at r 9.2 — far enough out that a head
  // (avatar ≈ 5 tall) never grazes the summit disc (r 8, underside 144.8) on the top
  // hops. Two of the pads slowly spin underfoot.
  const A9 = AE + 0.95 * 2 + 0.62;
  for (let i = 0; i < 8; i++) {
    const spinny = i === 3 || i === 6;
    pad(A9 + 0.58 * i, 9.2, 121.9 + 2.7 * i, 1.0, spinny ? "#b98a4e" : i % 2 ? "#e0b23a" : "#241a2e", spinny ? [{ type: "spinner", axis: "y", speed: 140 }] : null);
  }
  // S10 — one last 1-stud pad, then the leap onto the summit's rim
  pad(A9 + 0.58 * 8, 9.4, 143.4, 1.0, "#ff5a3a");
  parts.push(P({ shape: "cylinder", size: [8, 2, 8], position: [TX, 144, TZ], color: "#1a1433", material: "metal" }));
  parts.push(P({ shape: "cylinder", size: [16, 1.2, 16], position: [TX, 145.4, TZ], color: "#2a2336", material: "metal" }));
  parts.push(P({ shape: "cylinder", size: [14.5, 0.16, 14.5], position: [TX, 146.09, TZ], color: "#3a2f5e", canCollide: false }));
  // the summit: an hourglass, a standing clock, four fires, and the way onward
  const HX = TX, HZ = TZ - 5.5;
  for (const sy of [146.4, 152.4]) parts.push(P({ shape: "cylinder", size: [4.6, 0.5, 4.6], position: [HX, sy, HZ], color: "#4a2f18", material: "wood", canCollide: false }));
  for (let k = 0; k < 3; k++) { const a = k * 2.09; parts.push(P({ size: [0.4, 6.4, 0.4], position: [HX + Math.cos(a) * 2.1, 149.4, HZ + Math.sin(a) * 2.1], color: "#b98a4e", material: "wood", canCollide: false })); }
  parts.push(P({ shape: "sphere", size: [3.4, 2.4, 3.4], position: [HX, 148.1, HZ], color: "#bfe3ff", material: "glass", canCollide: false }));
  parts.push(P({ shape: "sphere", size: [3.4, 2.4, 3.4], position: [HX, 151.1, HZ], color: "#bfe3ff", material: "glass", canCollide: false }));
  parts.push(P({ shape: "sphere", size: [1.9, 1.3, 1.9], position: [HX, 147.7, HZ], color: "#ffd23a", material: "neon", canCollide: false }));
  parts.push(P({ shape: "sphere", size: [1.1, 1.6, 1.1], position: [HX, 149.6, HZ], color: "#ffd23a", material: "neon", canCollide: false }));
  for (let i = 0; i < 4; i++) { const [px, pz] = rp(i * 1.5708 + 0.785, 6.8); torch(parts, px, 146.6, pz, "#7ec8ff"); }
  parts.push(P({ size: [0.4, 0.4, 0.4], position: [TX, 148.4, TZ + 3], color: "#1a1226", canCollide: false, behaviors: [{ type: "text", text: "the green ring goes SOMEWHERE", size: 1.8 }] }));
  parts.push({ id: "bt_tw_top", shape: "cylinder", size: [7, 0.3, 7], position: [TX, 146.25, TZ], color: "#3ddc84", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "bt_tw_top", cooldownS: 2 }] });
}

// ---- §13b: the LETTUCE REALM — ten lettuces, four binary whispers, one code ----------
export const TW_CODE = "9371"; // 1001 0011 0111 0001 — the four whispers, in order
const LETTUCE_KEYS = Object.freeze(["sight", "happy", "sad", "big", "stud", "ystud", "evil", "secret", "brick", "sewer"]);
export { LETTUCE_KEYS };

// One lettuce: a skirt of leaves, a body, a heart — then whatever the style asks for.
function lettuceModel(parts, out, key, x, y, z, s, style) {
  const ids = [];
  const L = (def) => { const id = `bt_twl_${key}_${ids.length}`; parts.push({ id, material: style.mat || "plastic", canCollide: false, ...def }); ids.push(id); };
  const g = style.greens || ["#3ddc84", "#2f8f4a", "#8be04a"];
  if (style.brick) {
    // the brick lettuce is MASONRY: three courses of staggered bricks and a mortar cap
    for (let row = 0; row < 3; row++) {
      const n = 6 - row, rr = (1.15 - row * 0.3) * s;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + row * 0.5; L({ size: [1.05 * s, 0.7 * s, 0.8 * s], position: [x + Math.cos(a) * rr, y + (0.4 + row * 0.72) * s, z + Math.sin(a) * rr], rotation: [0, -a * 57.29578, 0], color: i % 2 ? "#a24936" : "#7d3527" }); }
    }
    L({ size: [1.0 * s, 0.5 * s, 1.0 * s], position: [x, y + 2.5 * s, z], color: "#8a6a5a" });
  } else {
    for (let i = 0; i < 6; i++) { const a = i * 1.047; L({ shape: "sphere", size: [1.5 * s, 0.8 * s, 1.5 * s], position: [x + Math.cos(a) * 0.95 * s, y + 0.35 * s, z + Math.sin(a) * 0.95 * s], color: g[i % 2] }); }
    for (let i = 0; i < 5; i++) { const a = i * 1.257 + 0.5; L({ shape: "sphere", size: [1.2 * s, 1.15 * s, 1.2 * s], position: [x + Math.cos(a) * 0.62 * s, y + 0.95 * s, z + Math.sin(a) * 0.62 * s], color: g[(i + 1) % 3] }); }
    L({ shape: "sphere", size: [1.35 * s, 1.25 * s, 1.35 * s], position: [x, y + 1.35 * s, z], color: g[2] });
  }
  if (style.studs) for (let i = 0; i < 4; i++) { const a = i * 1.5708 + 0.4; L({ shape: "cylinder", size: [0.34 * s, 0.16 * s, 0.34 * s], position: [x + Math.cos(a) * 0.42 * s, y + 2.0 * s, z + Math.sin(a) * 0.42 * s], color: style.studCol || "#c7cdd9", material: "metal" }); }
  if (style.face) {
    const ey = y + 1.45 * s, fz = z - 1.05 * s, ec = style.eye || "#12141c";
    for (const sx of [-1, 1]) L({ shape: "sphere", size: [0.3 * s, 0.3 * s, 0.18 * s], position: [x + sx * 0.34 * s, ey, fz], color: ec, material: style.face === "evil" ? "neon" : (style.mat || "plastic") });
    if (style.face === "happy") {
      L({ size: [0.56 * s, 0.1 * s, 0.08 * s], position: [x, ey - 0.5 * s, fz], color: "#12141c" });
      for (const sx of [-1, 1]) L({ size: [0.12 * s, 0.16 * s, 0.08 * s], position: [x + sx * 0.36 * s, ey - 0.4 * s, fz], color: "#12141c" });
    } else if (style.face === "sad") {
      L({ size: [0.5 * s, 0.1 * s, 0.08 * s], position: [x, ey - 0.55 * s, fz], color: "#12141c" });
      for (const sx of [-1, 1]) L({ size: [0.12 * s, 0.16 * s, 0.08 * s], position: [x + sx * 0.33 * s, ey - 0.62 * s, fz], color: "#12141c" });
      L({ shape: "sphere", size: [0.14 * s, 0.24 * s, 0.1 * s], position: [x - 0.34 * s, ey - 0.4 * s, fz], color: "#7ec8ff", material: "neon" }); // the tear
    } else if (style.face === "evil") {
      for (const sx of [-1, 1]) L({ size: [0.42 * s, 0.1 * s, 0.08 * s], position: [x + sx * 0.34 * s, ey + 0.26 * s, fz], rotation: [0, 0, sx * -28], color: "#12141c" }); // the brows
      for (const sx of [-1, 1]) L({ shape: "wedge", size: [0.22 * s, 0.6 * s, 0.22 * s], position: [x + sx * 0.5 * s, y + 2.35 * s, z], rotation: [0, 0, sx * -18], color: "#241a2e", material: "metal" }); // the horns
      for (let k = 0; k < 3; k++) L({ shape: "wedge", size: [0.16 * s, 0.2 * s, 0.1 * s], position: [x - 0.24 * s + k * 0.24 * s, ey - 0.52 * s, fz], rotation: [0, 0, k % 2 ? 180 : 0], color: "#f6ffe0" }); // the teeth
    }
  }
  if (style.rainbow) {
    const hues = ["#ff5a3a", "#ffd23a", "#3ddc84", "#35a3e0", "#a05cff"];
    for (let i = 0; i < 8; i++) { const a = i * 0.785; L({ shape: "sphere", size: [0.26 * s, 0.26 * s, 0.26 * s], position: [x + Math.cos(a) * 1.5 * s, y + 1.1 * s + Math.sin(i * 2.1) * 0.5 * s, z + Math.sin(a) * 1.5 * s], color: hues[i % 5], material: "neon" }); }
  }
  if (style.flies) {
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.6; L({ shape: "sphere", size: [0.14, 0.14, 0.14], position: [x + Math.cos(a) * 1.4 * s, y + (1.9 + (i % 2) * 0.5) * s, z + Math.sin(a) * 1.4 * s], color: "#12141c" }); }
    for (let i = 0; i < 3; i++) L({ size: [0.1, 0.7, 0.1], position: [x - 0.4 + i * 0.4, y + 2.6 * s + (i % 2) * 0.3, z], rotation: [0, 0, 12 - i * 12], color: "#8be04a", material: "neon" }); // the stink
  }
  const padD = Math.max(4.4, 3.6 * s);
  const padId = `bt_lett_${key}`;
  parts.push({ id: padId, shape: "cylinder", size: [padD, 0.3, padD], position: [x, y + 0.15, z], color: style.padCol || "#8be04a", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: padId, cooldownS: 1.2 }] });
  ids.push(padId);
  out.lettuces[key] = { ids, pos: [x, y, z], scale: s };
}

// bits like "1001" as glowing bar-glyphs; n golden dots above say WHICH digit this is
function binaryGlyphs(parts, bits, x, y, z, axis, n) {
  const bar = (bx, by, bz, w, h) => parts.push(P({ size: axis === "x" ? [w, h, 0.14] : [0.14, h, w], position: [bx, by, bz], color: "#3ddc84", material: "neon", canCollide: false }));
  for (let i = 0; i < bits.length; i++) {
    const off = (i - (bits.length - 1) / 2) * 2.2;
    const gx = axis === "x" ? x + off : x, gz = axis === "z" ? z + off : z;
    if (bits[i] === "1") bar(gx, y, gz, 0.26, 1.7);
    else {
      const sx = axis === "x" ? 0.45 : 0, sz = axis === "z" ? 0.45 : 0;
      bar(gx - sx, y, gz - sz, 0.2, 1.7); bar(gx + sx, y, gz + sz, 0.2, 1.7);
      bar(gx, y + 0.75, gz, 1.05, 0.2); bar(gx, y - 0.75, gz, 1.05, 0.2);
    }
  }
  for (let d = 0; d < n; d++) {
    const off = (d - (n - 1) / 2) * 0.9;
    parts.push(P({ shape: "sphere", size: [0.34, 0.34, 0.34], position: [axis === "x" ? x + off : x, y + 1.8, axis === "z" ? z + off : z], color: "#ffd23a", material: "neon", canCollide: false }));
  }
}

function sign(parts, x, y, z, text, size) {
  parts.push(P({ size: [0.4, 0.4, 0.4], position: [x, y, z], color: "#1a1226", canCollide: false, behaviors: [{ type: "text", text, size: size || 2 }] }));
}

function buildLettuceRealm(parts, out) {
  out.lettuces = {};
  // ---- the ground: four slabs leaving a 6x6 hole at (30, 725) — the sewer's mouth ----
  parts.push(P({ size: [300, 2, 172], position: [0, 3, 636], color: "#4a8f44", material: "grass" }));
  parts.push(P({ size: [300, 2, 122], position: [0, 3, 789], color: "#4a8f44", material: "grass" }));
  parts.push(P({ size: [177, 2, 6], position: [-61.5, 3, 725], color: "#4a8f44", material: "grass" }));
  parts.push(P({ size: [117, 2, 6], position: [91.5, 3, 725], color: "#4a8f44", material: "grass" }));

  // ---- spawn plaza ----
  parts.push(P({ shape: "cylinder", size: [13, 0.2, 13], position: [0, 4.1, 590], color: "#b0a084", canCollide: false }));
  for (const sx of [-1, 1]) parts.push(P({ size: [0.9, 6.5, 0.9], position: [sx * 4.2, 7.2, 585], color: "#5a3a1f", material: "wood" }));
  parts.push(P({ size: [9.6, 1, 1], position: [0, 10.7, 585], color: "#3ddc84", material: "neon", canCollide: false }));
  sign(parts, 0, 12.4, 585, "🥬 FIND THE TEN LETTUCES", 3);
  sign(parts, 0, 8.6, 585, "fall anywhere and you wake up right here", 1.4);
  parts.push({ id: "bt_tw_realm_home", size: [2, 0.2, 2], position: [0, 4.1, 592], color: "#b0a084", material: "plastic", canCollide: false });
  parts.push({ id: "bt_tw_leave", shape: "cylinder", size: [5, 0.3, 5], position: [-11, 4.2, 587], color: "#7ec8ff", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "bt_tw_leave", cooldownS: 1.5 }] });
  sign(parts, -11, 7.6, 587, "⌛ back to the swords", 1.6);

  // #1 — the one in PLAIN SIGHT, steps from where you land
  lettuceModel(parts, out, "sight", 12, 4, 599, 1, {});

  // ---- the farm (west): fence, rows, barn, and the glass-roofed smiler ----
  const FX = -85, FZ = 690;
  for (let px = -108; px <= -62; px += 6) for (const pz of [672, 708]) parts.push(P({ size: [0.5, 2.6, 0.5], position: [px, 5.3, pz], color: "#5a3a1f", material: "wood" }));
  for (const pz2 of [672, 708]) parts.push(P({ size: [46, 0.3, 0.24], position: [-85, 6.1, pz2], color: "#6b4423", material: "wood", canCollide: false }));
  for (const px2 of [-108, -62]) { for (let pz = 678; pz <= 702; pz += 6) { if (px2 === -62 && pz === 690) continue; parts.push(P({ size: [0.5, 2.6, 0.5], position: [px2, 5.3, pz], color: "#5a3a1f", material: "wood" })); } parts.push(P({ size: [0.24, 0.3, px2 === -62 ? 12 : 36], position: [px2, 6.1, px2 === -62 ? 678 : 690], color: "#6b4423", material: "wood", canCollide: false })); }
  for (let r = 0; r < 5; r++) {
    const rz = 677 + r * 6.5;
    parts.push(P({ size: [40, 0.18, 2.4], position: [-85, 4.1, rz], color: "#5a3a1f", canCollide: false }));
    for (let cx = -103; cx <= -67; cx += 4.5) { if (Math.abs(cx - FX) < 5.5 && Math.abs(rz - FZ) < 5.5) continue; parts.push(P({ shape: "sphere", size: [1.1, 0.75, 1.1], position: [cx, 4.5, rz], color: (cx + r) % 2 ? "#3ddc84" : "#2f8f4a", canCollide: false })); }
  }
  // the barn: HOLLOW, with a REAL door in its east face — players always try the barn,
  // so let them in. The FIRST whisper stays scratched on the OUTSIDE of the west wall.
  parts.push(P({ size: [12, 7, 1], position: [-120, 7.5, 685.5], color: "#c0392b" }));
  parts.push(P({ size: [12, 7, 1], position: [-120, 7.5, 694.5], color: "#c0392b" }));
  parts.push(P({ size: [1, 7, 10], position: [-125.5, 7.5, 690], color: "#c0392b" }));
  parts.push(P({ size: [1, 7, 2.5], position: [-114.5, 7.5, 687.25], color: "#c0392b" })); // east wall, north of the doorway
  parts.push(P({ size: [1, 7, 2.5], position: [-114.5, 7.5, 692.75], color: "#c0392b" })); // and south of it
  parts.push(P({ size: [1, 1, 4], position: [-114.5, 10.5, 690], color: "#c0392b" }));     // lintel: the doorway runs z 688.5..691.5, six studs high
  parts.push(P({ size: [0.3, 5.6, 3.2], position: [-114, 6.8, 686.4], rotation: [0, 24, 0], color: "#4a2f18", material: "wood", canCollide: false })); // the door, swung open
  // a wedge's tall face sits at its -z side, so the ridge halves flip AWAY from centre
  parts.push(P({ shape: "wedge", size: [12.6, 3.2, 5.4], position: [-120, 12.6, 687.3], rotation: [0, 180, 0], color: "#7d1f16" }));
  parts.push(P({ shape: "wedge", size: [12.6, 3.2, 5.4], position: [-120, 12.6, 692.7], color: "#7d1f16" }));
  parts.push(P({ size: [4, 2.2, 4], position: [-122.4, 5.1, 687.6], color: "#d9c48f", material: "grass" }));    // hay inside
  parts.push(P({ size: [2.6, 1.5, 2.6], position: [-118.4, 4.75, 692.4], color: "#d9c48f", material: "grass" }));
  sign(parts, -120, 9.4, 690, "just hay in here — the whisper is OUTSIDE, on the back wall", 1.3);
  binaryGlyphs(parts, "1001", -126.4, 7.5, 690, "z", 1);
  sign(parts, -110, 10.4, 682, "THE FARM — something smiles under glass", 1.8);
  // the glass roof, the smiler beneath it, the crier on top of it, and the hay ramp up
  for (const cx of [-88.2, -81.8]) for (const cz of [686.8, 693.2]) parts.push(P({ size: [0.5, 5.2, 0.5], position: [cx, 6.6, cz], color: "#8a93a6", material: "metal" }));
  parts.push(P({ size: [7.4, 0.4, 7.4], position: [FX, 9.4, FZ], color: "#bfe3ff", material: "glass" }));
  lettuceModel(parts, out, "happy", FX, 4, FZ, 1, { face: "happy" });
  lettuceModel(parts, out, "sad", FX, 9.6, FZ, 0.85, { face: "sad" });
  parts.push(P({ size: [4, 3, 4], position: [-76, 5.5, 684], color: "#d9c48f", material: "grass" }));
  parts.push(P({ size: [0.3, 3.1, 4.1], position: [-76, 5.5, 684], color: "#b98a4e", material: "wood", canCollide: false })); // the bale's twine
  parts.push(P({ size: [2.6, 1.5, 2.6], position: [-72.6, 4.75, 682.4], color: "#b98a4e", material: "wood" }));               // a step up to the bale
  // a scarecrow keeping no crows away
  parts.push(P({ size: [0.4, 5, 0.4], position: [-98, 6.5, 674], color: "#6b4423", material: "wood", canCollide: false }));
  parts.push(P({ size: [3, 0.4, 0.4], position: [-98, 8, 674], color: "#6b4423", material: "wood", canCollide: false }));
  parts.push(P({ shape: "sphere", size: [1, 1, 1], position: [-98, 9.4, 674], color: "#e0cfa0", canCollide: false }));

  // #4 — the BIG one, out on the map's south-east edge
  lettuceModel(parts, out, "big", 136, 4, 836, 4.2, { face: "happy" });
  sign(parts, 122, 8.4, 822, "something ENORMOUS grows out here →", 1.8);
  for (let k = 0; k < 6; k++) parts.push(P({ shape: "cylinder", size: [1.7, 0.14, 1.7], position: [40 + k * 17, 4.1, 630 + k * 36], color: "#b0a084", canCollide: false }));

  // ---- the GIANT'S HOUSE (east): an obby up the furniture to the rafters ----
  {
    const N = 663.75, Sz = 696.25, W = 70.75, E = 113.25;
    parts.push(P({ size: [44, 26, 1.5], position: [92, 17, N], color: "#8c7a60" }));
    parts.push(P({ size: [14, 26, 1.5], position: [77, 17, Sz], color: "#8c7a60" }));
    parts.push(P({ size: [20, 26, 1.5], position: [104, 17, Sz], color: "#8c7a60" }));
    parts.push(P({ size: [10, 13, 1.5], position: [89, 23.5, Sz], color: "#8c7a60" })); // over the door
    parts.push(P({ size: [1.5, 26, 34], position: [W, 17, 680], color: "#7d6e58" }));
    parts.push(P({ size: [1.5, 26, 34], position: [E, 17, 680], color: "#7d6e58" }));
    for (const wx of [78, 106]) parts.push(P({ size: [5, 5, 0.3], position: [wx, 18, Sz - 0.9], color: "#ffe6a0", material: "neon", canCollide: false })); // lit windows
    // door frame
    for (const sx of [-1, 1]) parts.push(P({ size: [1, 13.5, 1], position: [89 + sx * 5.4, 10.75, Sz], color: "#4a2f18", material: "wood", canCollide: false }));
    sign(parts, 89, 19.5, Sz + 2, "THE GIANT'S HOUSE — bricks live in the rafters", 1.8);
    // ceiling (attic floor), with the hole over the grandfather clock
    parts.push(P({ size: [42.5, 1.5, 15.25], position: [92, 27.75, 671.4], color: "#6b5d48", material: "wood" }));
    parts.push(P({ size: [42.5, 1.5, 10.25], position: [92, 27.75, 691.1], color: "#6b5d48", material: "wood" }));
    parts.push(P({ size: [35.25, 1.5, 7], position: [95.6, 27.75, 682.5], color: "#6b5d48", material: "wood" }));
    // roof planes + gable fills
    // rotation.x > 0 tips a plane's +z edge DOWN — each plane's apex edge must rise
    parts.push(P({ size: [48, 1.2, 21], position: [92, 36, 671.5], rotation: [-35, 0, 0], color: "#7d3527" }));
    parts.push(P({ size: [48, 1.2, 21], position: [92, 36, 688.5], rotation: [35, 0, 0], color: "#7d3527" }));
    for (const gx of [W, E]) { parts.push(P({ size: [1.5, 4, 26], position: [gx, 32, 680], color: "#7d6e58" })); parts.push(P({ size: [1.5, 4, 16], position: [gx, 36, 680], color: "#7d6e58" })); parts.push(P({ size: [1.5, 4, 7], position: [gx, 40, 680], color: "#7d6e58" })); }
    // furniture: stool → table → sofa → lamp → shelves → grandfather clock → the hole
    parts.push(P({ size: [4, 2.5, 4], position: [99, 5.25, 688], color: "#b98a4e", material: "wood" }));
    parts.push(P({ size: [10, 1, 6], position: [92, 8, 680], color: "#6b4423", material: "wood" }));
    for (const [lx, lz] of [[88, 678], [96, 678], [88, 682], [96, 682]]) parts.push(P({ size: [0.8, 3.5, 0.8], position: [lx, 6.25, lz], color: "#4a2f18", material: "wood", canCollide: false }));
    parts.push(P({ size: [12, 5, 7], position: [82, 6.5, 669], color: "#7c3aed" }));
    for (const cx of [79, 85]) parts.push(P({ size: [5.5, 1.4, 6.5], position: [cx, 9.7, 669], color: "#8a5cf0" }));
    parts.push(P({ size: [12, 4.4, 2], position: [82, 11, 664.9], color: "#6a3ad0" })); // backrest, top 13.2
    parts.push(P({ size: [0.5, 9, 0.5], position: [75, 8.5, 667], color: "#3e444f", material: "metal", canCollide: false }));
    parts.push(P({ shape: "cylinder", size: [3, 1.4, 3], position: [75, 13.9, 667], color: "#ffe6a0" })); // shade, top 14.6
    // three bookcases STEPPED along the west wall — an oof is ~5 tall, so every top
    // keeps open air above it (the old stacked shelves left 2.2 studs: unstandable)
    parts.push(P({ size: [2.5, 13.5, 4], position: [72.6, 10.75, 672], color: "#5a3a1f", material: "wood" }));   // top 17.5
    parts.push(P({ size: [2.5, 16.5, 4], position: [72.6, 12.25, 677.2], color: "#4a2f18", material: "wood" })); // top 20.5
    parts.push(P({ size: [2, 19, 2.6], position: [72.6, 13.5, 680.9], color: "#5a3a1f", material: "wood" }));    // top 23 — head pokes up through the attic hole
    for (let sh = 0; sh < 3; sh++) for (let b = 0; b < 3; b++) parts.push(P({ size: [0.24, 2.1, 1.1], position: [73.95 - (sh === 2 ? 0.25 : 0), 6.5 + sh * 4.4, 670.9 + sh * 5.2 + b * 1.3], color: ["#c0392b", "#2f6fd0", "#3ddc84", "#e0b23a"][(sh + b) % 4], material: "plastic", canCollide: false })); // spines on the case fronts
    // the grandfather clock, parked right under the attic hole
    parts.push(P({ size: [3.5, 21.5, 3], position: [74.5, 14.75, 682.5], color: "#4a2f18", material: "wood" })); // top 25.5
    parts.push(P({ shape: "cylinder", size: [2.2, 0.3, 2.2], position: [74.5, 22.5, 680.8], rotation: [90, 0, 0], color: "#ffe6a0", material: "neon", canCollide: false }));
    parts.push(P({ size: [0.16, 0.9, 0.1], position: [74.5, 22.9, 680.7], color: "#12141c", canCollide: false }));
    parts.push(P({ shape: "sphere", size: [0.9, 0.9, 0.3], position: [74.5, 17.5, 680.9], color: "#e0b23a", material: "metal", canCollide: false })); // the pendulum
    // the attic: crates, the collar beam, the gable shelf and its masonry prize
    // both crates sit SOUTH of the collar beam's line (z 679.4..680.6) — a crate under
    // the beam wedges the avatar's feet against it and nothing can stand there
    parts.push(P({ size: [5, 2.6, 5], position: [87, 29.8, 683.5], color: "#6b4423", material: "wood" }));
    parts.push(P({ size: [4, 2.6, 4], position: [96, 32.4, 683], color: "#5a3a1f", material: "wood" }));
    parts.push(P({ size: [24, 0.8, 1.2], position: [100, 33.9, 680], color: "#4a2f18", material: "wood" }));   // top 34.3 — a stud lower keeps heads clear of the roof planes
    parts.push(P({ size: [4.5, 0.8, 4.5], position: [110.5, 33.9, 680], color: "#5a3a1f", material: "wood" }));
    lettuceModel(parts, out, "brick", 110.5, 34.3, 680, 1.1, { brick: true });
    binaryGlyphs(parts, "0111", 112.4, 37.5, 680, "z", 3);
    // a proud chimney (decor) off the east end
    parts.push(P({ size: [5, 22, 5], position: [106, 26, 668], color: "#a24936" }));
    parts.push(P({ size: [6, 1.2, 6], position: [106, 37.6, 668], color: "#7d3527", canCollide: false }));
  }

  // ---- the SEWER: a shack, a shaft, a toxic tunnel, and what festers at the end ----
  {
    // an open-ended canopy — walk in from EITHER side (spawn approaches from the
    // north) and the floor simply is not there. The glowing rim says: on purpose.
    parts.push(P({ size: [1.2, 5.5, 9], position: [26.2, 6.75, 725], color: "#565d70", material: "metal" }));
    parts.push(P({ size: [1.2, 5.5, 9], position: [33.8, 6.75, 725], color: "#565d70", material: "metal" }));
    parts.push(P({ size: [10, 0.8, 11], position: [30, 9.9, 725], color: "#3e444f", material: "metal" }));
    sign(parts, 30, 11.6, 725, "THE SEWER — hold your nose", 2);
    sign(parts, 30, 7, 719.2, "walk in — the HOLE is the way down", 1.3);
    parts.push(P({ size: [7.2, 0.2, 0.5], position: [30, 4.12, 721.6], color: "#8be04a", material: "neon", canCollide: false }));
    parts.push(P({ size: [7.2, 0.2, 0.5], position: [30, 4.12, 728.4], color: "#8be04a", material: "neon", canCollide: false }));
    parts.push(P({ size: [0.5, 0.2, 6.6], position: [26.6, 4.12, 725], color: "#8be04a", material: "neon", canCollide: false }));
    parts.push(P({ size: [0.5, 0.2, 6.6], position: [33.4, 4.12, 725], color: "#8be04a", material: "neon", canCollide: false }));
    for (let k = 0; k < 3; k++) parts.push(P({ size: [0.24, 1.4, 0.24], position: [27.5 + k * 2.5, 3.2, 728.6], color: "#8be04a", material: "neon", canCollide: false })); // drips at the mouth
    // the shaft duct (open at the bottom into the chamber)
    for (const [wx, wz, sx2, sz2] of [[26.5, 725, 1, 7], [33.5, 725, 1, 7], [30, 721.4, 8, 1], [30, 728.6, 8, 1]]) parts.push(P({ size: [sx2, 8, sz2], position: [wx, -2, wz], color: "#3e444f", material: "metal" }));
    // chamber A under the shack — its ceiling leaves the 6x6 shaft OPEN (a single slab
    // here once sealed the sewer shut three studs down: the realm's cruellest bug)
    parts.push(P({ size: [12, 1, 12], position: [30, -12, 725], color: "#565d70", material: "metal" }));
    parts.push(P({ size: [12, 1, 3], position: [30, 0.5, 720.5], color: "#3e444f", material: "metal" }));
    parts.push(P({ size: [12, 1, 3], position: [30, 0.5, 729.5], color: "#3e444f", material: "metal" }));
    parts.push(P({ size: [3, 1, 6], position: [25.5, 0.5, 725], color: "#3e444f", material: "metal" }));
    parts.push(P({ size: [3, 1, 6], position: [34.5, 0.5, 725], color: "#3e444f", material: "metal" }));
    parts.push(P({ size: [12, 12, 1], position: [30, -5.5, 718.5], color: "#4a4f5e", material: "metal" }));
    parts.push(P({ size: [12, 12, 1], position: [30, -5.5, 731.5], color: "#4a4f5e", material: "metal" }));
    parts.push(P({ size: [1, 12, 12], position: [36.5, -5.5, 725], color: "#4a4f5e", material: "metal" }));
    for (const jz of [719.5, 730.5]) parts.push(P({ size: [1, 12, 1], position: [23.5, -5.5, jz], color: "#4a4f5e", material: "metal" }));
    torch(parts, 34, -8, 728, "#4ad14a");
    // the tunnel west: two walkways with gaps, a glowing channel, pipes to tightrope
    const wkN = [[-31, 22], [-6, 16], [16, 16]];   // [centerX, length] — north walkway (z 721.5)
    const wkS = [[-25, 34], [11, 26]];             // south walkway (z 728.5), gap offset from north's
    for (const [cx2, len] of wkN) parts.push(P({ size: [len, 1, 3], position: [cx2, -12, 721.5], color: "#565d70", material: "metal" }));
    for (const [cx2, len] of wkS) parts.push(P({ size: [len, 1, 3], position: [cx2, -12, 728.5], color: "#565d70", material: "metal" }));
    parts.push(P({ size: [66, 0.7, 4], position: [-9, -12.1, 725], color: "#4ad14a", material: "lava", canCollide: true, behaviors: [{ type: "kill" }] }));
    for (const [gx2, gw] of [[-17, 6], [5, 6]]) parts.push(P({ size: [gw, 0.7, 3], position: [gx2, -12.1, 721.5], color: "#4ad14a", material: "lava", canCollide: true, behaviors: [{ type: "kill" }] })); // the north gaps run green
    parts.push(P({ size: [6, 0.7, 3], position: [-5, -12.1, 728.5], color: "#4ad14a", material: "lava", canCollide: true, behaviors: [{ type: "kill" }] })); // and the south one
    for (const px3 of [-17, 5]) parts.push(P({ shape: "cylinder", size: [0.9, 7, 0.9], position: [px3, -11.2, 721.5], rotation: [0, 0, 90], color: "#8a93a6", material: "metal" })); // pipes over the north gaps
    parts.push(P({ shape: "cylinder", size: [0.9, 7, 0.9], position: [-5, -11.2, 728.5], rotation: [0, 0, 90], color: "#8a93a6", material: "metal" }));
    parts.push(P({ size: [66, 1, 10], position: [-9, 0.5, 725], color: "#3e444f", material: "metal" }));
    parts.push(P({ size: [66, 12, 1], position: [-9, -5.5, 719.5], color: "#4a4f5e", material: "metal" }));
    parts.push(P({ size: [66, 12, 1], position: [-9, -5.5, 730.5], color: "#4a4f5e", material: "metal" }));
    for (let k = 0; k < 5; k++) parts.push(P({ shape: "cylinder", size: [1.2, 10, 1.2], position: [-36 + k * 14, -1.4, 725], rotation: [90, 0, 0], color: "#6a7383", material: "metal", canCollide: false })); // overhead mains
    for (let k = 0; k < 4; k++) parts.push(P({ size: [1.8, 2.4, 0.2], position: [-30 + k * 13, -8, 719.9], color: "#2f8f4a", canCollide: false })); // slime
    parts.push(P({ size: [7, 0.5, 0.8], position: [-9, -10.9, 725], color: "#4ad14a", material: "lava", canCollide: true, behaviors: [{ type: "spinner", axis: "y", speed: 130 }, { type: "kill" }] })); // the stirrer
    // chamber B: the prize, the SECOND whisper, and the way back up
    parts.push(P({ size: [14, 1, 16], position: [-49, -12, 725], color: "#565d70", material: "metal" }));
    parts.push(P({ size: [14, 1, 16], position: [-49, 0.5, 725], color: "#3e444f", material: "metal" }));
    parts.push(P({ size: [1, 12, 16], position: [-56.5, -5.5, 725], color: "#4a4f5e", material: "metal" }));
    parts.push(P({ size: [14, 12, 1], position: [-49, -5.5, 716.5], color: "#4a4f5e", material: "metal" }));
    parts.push(P({ size: [14, 12, 1], position: [-49, -5.5, 733.5], color: "#4a4f5e", material: "metal" }));
    for (const [jz2, jl] of [[718.25, 3.5], [731.75, 3.5]]) parts.push(P({ size: [1, 12, jl], position: [-41.5, -5.5, jz2], color: "#4a4f5e", material: "metal" }));
    torch(parts, -54, -8, 719, "#4ad14a");
    torch(parts, -54, -8, 731, "#4ad14a");
    lettuceModel(parts, out, "sewer", -50, -11.5, 725, 1.1, { greens: ["#6b7a3a", "#4a5a2a", "#8a8a4a"], flies: true, padCol: "#4ad14a" });
    binaryGlyphs(parts, "0011", -55.8, -6.5, 725, "z", 2);
    parts.push(P({ size: [3, 0.4, 3], position: [-45, -11.3, 719.5], color: "#7ec8ff", material: "neon", behaviors: [{ type: "teleport", target: "bt_tw_sewer_out", cooldownS: 2 }] }));
    sign(parts, -45, -8.6, 719.5, "up and out", 1.3);
    parts.push({ id: "bt_tw_sewer_out", size: [2, 0.3, 2], position: [38, 4.15, 731], color: "#565d70", material: "metal", canCollide: false });
  }

  // ---- the SKY OBBY: three legs, no checkpoints, each crueller than the last ----
  {
    parts.push(P({ size: [10, 0.8, 10], position: [0, 4.4, 762], color: "#e0b23a" }));
    sign(parts, 0, 9.6, 758, "THE IMPOSSIBLE OBBY", 2.6);
    sign(parts, 0, 7.6, 758, "no checkpoints. not sorry.", 1.4);
    const opad = (x, top, z, w, col) => parts.push(P({ size: [w, 0.6, w], position: [x, top - 0.3, z], color: col, material: "plastic" }));
    // leg one — twelve 1.3-stud pads
    for (let i = 0; i < 12; i++) opad(i % 2 ? 2 : -2, 7.4 + 2.6 * i, 770 + 3.6 * i, 1.3, i % 2 ? "#e0b23a" : "#c0392b");
    for (const [mx, my, mz] of [[-7, 15, 781], [7, 26, 792]]) parts.push(P({ size: [1.3, 1.3, 1.3], position: [mx, my, mz], color: "#ff5a1f", material: "lava", canCollide: true, behaviors: [{ type: "kill" }] })); // hovering menace
    parts.push(P({ size: [8, 1, 8], position: [0, 38.2, 815], color: "#8a93a6", material: "metal" }));
    lettuceModel(parts, out, "stud", 0, 38.7, 816.5, 0.9, { greens: ["#8a93a6", "#6a7383", "#c7cdd9"], mat: "metal", studs: true, padCol: "#c7cdd9" });
    sign(parts, 0, 43.4, 815, "3× HARDER STARTS HERE", 1.8);
    // leg two — fourteen 1.05-stud hops back north, with a swept disc and a ferry
    for (let i = 0; i < 14; i++) {
      const x = 8 + (i % 2 ? 1.8 : -1.8), top = 41.3 + 2.7 * i, z = 812 - 4 * i;
      if (i === 6) {
        parts.push(P({ shape: "cylinder", size: [6, 0.8, 6], position: [8, top - 0.4, z], color: "#2a2336", material: "metal" }));
        parts.push(P({ size: [5.5, 0.45, 0.8], position: [8, top + 0.75, z], color: "#ff5a1f", material: "lava", canCollide: true, behaviors: [{ type: "spinner", axis: "y", speed: 120 }, { type: "kill" }] }));
      } else if (i === 10) {
        parts.push(P({ size: [2, 0.5, 2], position: [8, top - 0.25, z + 1.5], color: "#35a3e0", material: "neon", canCollide: true, behaviors: [{ type: "movingPlatform", waypoints: [[8, top - 0.25, z + 1.5], [8, top - 0.25, z - 1.5]], speed: 3.5, pauseS: 0.6, mode: "pingpong" }] }));
      } else opad(x, top, z, 1.05, i % 2 ? "#e0b23a" : "#7c3aed");
    }
    parts.push(P({ size: [8, 1, 8], position: [8, 78.6, 754], color: "#8a93a6", material: "metal" }));
    lettuceModel(parts, out, "ystud", 8, 79.1, 752.5, 0.9, { greens: ["#ffd23a", "#e0b23a", "#fff59e"], mat: "metal", studs: true, studCol: "#e0b23a", padCol: "#ffd23a" });
    sign(parts, 8, 83.8, 754, "YOUR NIGHTMARE", 2);
    // leg three — sixteen 0.95-stud hops, two swept discs, one 0.6-wide beam
    for (let i = 0; i < 16; i++) {
      const x = 16 + (i % 2 ? 1.6 : -1.6), top = 81.8 + 2.8 * i, z = 757 + 3.8 * i;
      if (i === 4 || i === 12) {
        parts.push(P({ shape: "cylinder", size: [6.4, 0.8, 6.4], position: [16, top - 0.4, z], color: "#241a2e", material: "metal" }));
        parts.push(P({ size: [5.8, 0.45, 0.8], position: [16, top + 0.75, z], color: "#ff5a1f", material: "lava", canCollide: true, behaviors: [{ type: "spinner", axis: "y", speed: i === 4 ? 150 : -170 }, { type: "kill" }] }));
      } else if (i === 8) {
        parts.push(P({ size: [0.6, 0.5, 6.4], position: [16, top - 0.25, z + 1.6], color: "#4a0f14", material: "metal" }));
        parts.push(P({ size: [0.7, 0.7, 0.7], position: [16, top + 0.3, z + 1.6], color: "#ff5a1f", material: "lava", canCollide: true, behaviors: [{ type: "kill" }] }));
      } else opad(x, top, z, 0.95, i % 2 ? "#4a0f14" : "#241a2e"); // pad 9 floats over the beam's far end — without it the next rise is 5.6, unjumpable
    }
    parts.push(P({ size: [12, 1, 12], position: [16, 126, 820], color: "#141020", material: "metal" }));
    for (const [tx2, tz2] of [[11, 815], [21, 815], [11, 825], [21, 825]]) torch(parts, tx2, 127.6, tz2, "#ff2a2a");
    lettuceModel(parts, out, "evil", 16, 126.5, 821, 1.15, { greens: ["#241a2e", "#3a2f5e", "#4a0f14"], face: "evil", eye: "#ff2a2a", padCol: "#ff2a2a" });
    sign(parts, 16, 132.6, 820, "THE NIGHTMARE'S HEART", 2);
    parts.push(P({ size: [3, 0.4, 3], position: [11.5, 126.7, 817], color: "#7ec8ff", material: "neon", behaviors: [{ type: "teleport", target: "bt_tw_realm_home", cooldownS: 2 }] }));
    sign(parts, 11.5, 129.8, 817, "step home", 1.3);
  }

  // ---- the VAULT (north-west): a crag, a keypad, a door with no handle ----
  {
    const VX = -120, VZ = 612.75;
    parts.push(P({ size: [12, 13, 1.5], position: [VX, 10.5, 603.25], color: "#6a7383", material: "metal" }));
    parts.push(P({ size: [1.5, 13, 10], position: [-125.75, 10.5, 608], color: "#6a7383", material: "metal" }));
    parts.push(P({ size: [1.5, 13, 10], position: [-114.25, 10.5, 608], color: "#6a7383", material: "metal" }));
    parts.push(P({ size: [15, 2, 12], position: [VX, 18, 608], color: "#565d70", material: "metal" }));
    parts.push(P({ size: [4, 13, 1.5], position: [-124, 10.5, VZ], color: "#6a7383", material: "metal" }));
    parts.push(P({ size: [4, 13, 1.5], position: [-116, 10.5, VZ], color: "#6a7383", material: "metal" }));
    parts.push(P({ size: [4, 5, 1.5], position: [VX, 14.5, VZ], color: "#6a7383", material: "metal" }));
    for (let k = 0; k < 5; k++) parts.push(P({ shape: "wedge", size: [4.5, 2.6 + (k % 2), 4.5], position: [-126 + k * 3.1, 20 + (k % 2) * 0.8, 606 + (k % 3) * 2.5], rotation: [0, k * 50, 0], color: k % 2 ? "#565d70" : "#6a7383", material: "metal", canCollide: false }));
    parts.push({ id: "bt_tw_vault", size: [3.8, 8, 1], position: [VX, 8, VZ], color: "#3e444f", material: "metal", canCollide: true });
    for (let k = 0; k < 3; k++) parts.push(P({ shape: "sphere", size: [0.3, 0.3, 0.2], position: [VX - 1.4, 5.5 + k * 2.2, VZ + 0.6], color: "#e0245e", material: "neon", canCollide: false }));
    sign(parts, VX, 18.6, VZ + 1.5, "THE VAULT — it counts in binary", 2);
    sign(parts, VX, 16.6, VZ + 1.5, "four whispers, four digits, in dot order", 1.3);
    lettuceModel(parts, out, "secret", VX, 4, 607.5, 1, { greens: ["#3ddc84", "#35a3e0", "#a05cff"], mat: "neon", rainbow: true, padCol: "#a05cff" });
    binaryGlyphs(parts, "0001", VX, 8, 602.3, "x", 4);
    // the keypad kiosk
    parts.push(P({ size: [1.1, 3.2, 1.1], position: [-115.5, 5.6, 616.5], color: "#2f2640", material: "metal" }));
    parts.push(P({ size: [1.7, 1.3, 0.4], position: [-115.5, 7.5, 616.3], rotation: [-25, 0, 0], color: "#12141c", material: "metal", canCollide: false }));
    for (let k = 0; k < 9; k++) parts.push(P({ size: [0.3, 0.3, 0.14], position: [-115.9 + (k % 3) * 0.4, 7.9 - Math.floor(k / 3) * 0.38, 616.05 - Math.floor(k / 3) * 0.18], rotation: [-25, 0, 0], color: "#3ddc84", material: "neon", canCollide: false }));
    parts.push({ id: "bt_tw_keypad", shape: "cylinder", size: [4.4, 0.3, 4.4], position: [-115.5, 4.2, 617], color: "#e0245e", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "bt_tw_keypad", cooldownS: 1.2 }] });
  }

  // ---- realm dressing: trees, flowers, clouds ----
  for (const [ex, ez, eh] of [[-40, 640, 9], [55, 620, 11], [-20, 780, 10], [70, 760, 8], [-90, 630, 9], [120, 640, 10]]) {
    parts.push(P({ shape: "cylinder", size: [1.6, eh, 1.6], position: [ex, 4 + eh / 2, ez], color: "#5a3a1f", material: "wood" }));
    parts.push(P({ shape: "sphere", size: [7, 5, 7], position: [ex, 4 + eh + 1.6, ez], color: "#2f8f4a", canCollide: false }));
    parts.push(P({ shape: "sphere", size: [5, 3.6, 5], position: [ex + 2, 4 + eh + 3.6, ez - 1], color: "#3f7d3a", canCollide: false }));
  }
  for (let k = 0; k < 14; k++) { const fx = -130 + (k * 37) % 260, fz = 570 + (k * 53) % 250; parts.push(P({ shape: "sphere", size: [0.4, 0.4, 0.4], position: [fx, 4.25, fz], color: ["#e0245e", "#ffd23a", "#35a3e0", "#fff59e"][k % 4], material: "neon", canCollide: false })); }
  for (const [cx3, cy3, cz3] of [[-60, 70, 700], [80, 84, 620], [20, 96, 800]]) for (let k = 0; k < 3; k++) parts.push(P({ shape: "sphere", size: [9 - k * 2, 3.4, 7 - k], position: [cx3 + k * 4 - 4, cy3 + k * 1.2, cz3], color: "#f2f7ff", canCollide: false }));
}

export function buildWorld() {
  seq = 0;
  torchSpots = [];
  const parts = [];
  const out = { parts, torches: torchSpots };
  buildLobby(parts, out);
  buildArena(parts, out);
  buildObby(parts);
  buildSecretPath(parts);
  buildSkyBits(parts);
  buildCourtyard(parts, out);
  buildTimewarpTower(parts);
  buildLettuceRealm(parts, out);
  return out;
}
