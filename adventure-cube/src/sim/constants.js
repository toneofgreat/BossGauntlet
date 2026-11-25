// constants.js - shared, frozen numbers for Adventure Cube. NO DOM. See CONTRACT.md section 3.
// World units are pixels at zoom 1. +y is DOWN. One tile = T px.

export const T = 32;            // tile size in world px
export const FPS = 60;          // fixed simulation rate (steps per second)
export const STEP_MS = 1000 / FPS;

// ---- input bitmask (one byte per sim step) ----
export const IN_LEFT = 1;
export const IN_RIGHT = 2;
export const IN_JUMP = 4;

// ---- tiles: char in level.tiles rows <-> numeric code in the compiled grid ----
// The code of a char is its index in TILE_CHARS.
export const TILE_CHARS = ".#RWI-/\\abcd^v<>~B";
export const TILE = Object.freeze({
  EMPTY: 0,      // '.'  air
  GROUND: 1,     // '#'  earth / soil (renderer: grass top when exposed; theme decides look)
  ROCK: 2,       // 'R'  stone / boulder / cliff rock
  WOOD: 3,       // 'W'  fallen log / planks (solid)
  ICE: 4,        // 'I'  ice (solid, slippery: low accel + low friction)
  ONEWAY: 5,     // '-'  branch / thin ledge: solid only from above (jump up through it)
  SLOPE_R: 6,    // '/'  45 deg, rises to the right (low left edge, high right edge)
  SLOPE_L: 7,    // '\'  45 deg, rises to the left
  SLOPE_R_LO: 8, // 'a'  22.5 deg rising right, lower half (0 -> 16 px)
  SLOPE_R_HI: 9, // 'b'  22.5 deg rising right, upper half (16 -> 32 px)
  SLOPE_L_HI: 10,// 'c'  22.5 deg rising left, upper half (32 -> 16 px left to right)
  SLOPE_L_LO: 11,// 'd'  22.5 deg rising left, lower half (16 -> 0 px left to right)
  SPIKE_U: 12,   // '^'  thorns on a floor, pointing up
  SPIKE_D: 13,   // 'v'  thorns hanging from a ceiling, pointing down
  SPIKE_L: 14,   // '<'  thorns on the LEFT face of a wall (the wall is to the right), pointing left
  SPIKE_R: 15,   // '>'  thorns on the RIGHT face of a wall (the wall is to the left), pointing right
  WATER: 16,     // '~'  stream / pond / deep water: death
  BACK: 17,      // 'B'  background rock / cave wall: NOT solid, decoration only
});
export const TILE_COUNT = TILE_CHARS.length;
export const charToCode = (ch) => { const i = TILE_CHARS.indexOf(ch); return i < 0 ? 0 : i; };
export const codeToChar = (c) => TILE_CHARS[c] || ".";

export const isFullSolid = (c) => c >= 1 && c <= 4;
export const isSlope = (c) => c >= 6 && c <= 11;
export const isSpike = (c) => c >= 12 && c <= 15;
export const isHazardTile = (c) => c >= 12 && c <= 16;

// Slope surface height (px above the tile's bottom edge) at fraction fx in [0,1] across the tile.
export function slopeH(c, fx) {
  switch (c) {
    case 6: return T * fx;
    case 7: return T * (1 - fx);
    case 8: return T * 0.5 * fx;
    case 9: return T * 0.5 + T * 0.5 * fx;
    case 10: return T - T * 0.5 * fx;
    case 11: return T * 0.5 - T * 0.5 * fx;
  }
  return 0;
}
// +1 if the slope's high side is its right edge, -1 if left.
export const slopeHighSide = (c) => (c === 6 || c === 8 || c === 9 ? 1 : -1);

// Hazard hit rects in tile-local px [x0, y0, x1, y1] (spikes are smaller than their cell = fair).
// (v2: 3 px narrower on each side and 3 px lower than v1 - a 3-wide floor patch had a 3-frame takeoff window at
// running speed, now 5; 1-wide 23 frames, 2-wide 14; 4-wide still can not be cleared from flat ground)
export const SPIKE_RECT = Object.freeze({
  12: [7, 17, 25, 32],
  13: [7, 0, 25, 15],
  14: [17, 7, 32, 25],
  15: [0, 7, 15, 25],
});
export const WATER_TOP_INSET = 10; // the top water tile of a column only kills below this many px

// ---- player physics (px per step / px per step^2) ----
export const PW = 26, PH = 26;        // player cube AABB
export const RUN_MAX = 3.5;
export const GROUND_ACCEL = 0.35, GROUND_DECEL = 0.5, GROUND_TURN = 0.8;
export const AIR_ACCEL = 0.25, AIR_DECEL = 0.06, AIR_TURN = 0.35;
export const ICE_ACCEL = 0.07, ICE_DECEL = 0.025, ICE_TURN = 0.1;
export const JUMP_V = -9.4;
export const G_UP = 0.48;      // gravity while rising and jump held (or after a spring)
export const G_CUT = 1.3;      // gravity while rising and jump released (variable jump height)
export const G_DOWN = 0.62;    // gravity while falling
export const MAX_FALL = 10.5;
export const COYOTE = 6;       // frames after leaving ground that a jump still works
export const JUMP_BUFFER = 6;  // frames a jump press is remembered before landing
export const SPRING_V = -14.5; // spring launch speed (times entity.p)
export const STEP_UP = 8;      // px: ledge lips this small are stepped onto (slope seams, corner forgiveness)
export const STICK_DOWN = 10;  // px: grounded player sticks to ground this far below (walking down slopes)
export const CORNER = 6;       // px: head-bump corner correction
export const HURT_INSET = 3;   // px: player hurt box is inset this much on every side
export const DEATH_FRAMES = 40;
export const CRUMBLE_DELAY = 32;     // frames a crumble block shakes after first stood on
export const CRUMBLE_RESPAWN = 150;  // frames it stays gone
export const PULSE_WARN = 45;        // frames before a pulse fires that renderers telegraph it

// ---- ids ----
export const THEMES = Object.freeze(["forest", "highlands", "storm"]);
export const MUSIC_IDS = Object.freeze(["area1", "area2", "area3", "campfire", "rapids", "aurora", "thunderdrum", "moonlit"]);
export const ENTITY_TYPES = Object.freeze(["crumble", "spring", "mover", "hazard", "pulse", "sign", "deco"]);
export const HAZARD_KINDS = Object.freeze(["thornball", "boulder", "wasp", "spark"]);
export const PULSE_KINDS = Object.freeze(["lightning", "geyser", "steam"]);
export const MOVER_KINDS = Object.freeze(["log", "plank", "stone", "leaf"]);
export const DECO_KINDS = Object.freeze([
  "oak", "pine", "birch", "deadtree", "bush", "fern", "flowers", "mushrooms", "stump", "boulder",
  "grass", "reeds", "lantern", "cairn", "bones", "crystal",
]);
