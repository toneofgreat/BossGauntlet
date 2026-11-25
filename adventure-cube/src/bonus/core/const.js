// const.js - shared numbers for the BONUS level (CORE owns, frozen). DOM-free. See BONUS.md section 2.
// World units = px at zoom 1, +y down, one tile T = 32 px, fixed 60 Hz steps (same as the main game).
export { T, FPS, STEP_MS, PW, PH } from "../../sim/constants.js";

// ---- input bits (one number per step; LEFT/RIGHT/JUMP are the main game's bits) ----
export const B_LEFT = 1, B_RIGHT = 2, B_JUMP = 4;
export const B_ACTION = 8;   // held: swing the selected item (mine / chop / attack). Repeats every tool cooldown.
export const B_USE = 16;     // edge: eat / place / interact (door, bed, bush, chest, station)
export const B_UP = 32;      // held: aim up   (auto-aim targets the tile above the head)
export const B_DOWN = 64;    // held: aim down (auto-aim targets the tile under the feet)

// ---- world size (tiles) ----
export const WORLD_W = 800;
export const WORLD_H = 120;
export const PLOT_W = 24;          // the house plot is 24 tiles wide, flat, east of spawn

// ---- reach (tiles, measured from the player's center to the target tile/animal center) ----
export const REACH_POINTER = 4.5;  // pointer-aimed tiles
export const REACH_AUTO = 1.6;     // auto-aim (keyboard / touch without a tapped target)

// ---- day / night: one day = DAY_FRAMES steps. f = time.t / DAY_FRAMES in [0,1) ----
export const DAY_FRAMES = 36000;   // 10 real minutes at 60 Hz
export const PHASES = [            // [name, fStart] in order; a phase lasts until the next one starts
  ["dawn", 0], ["day", 0.06], ["dusk", 0.62], ["night", 0.70],
];
export const NEW_GAME_F = 0.08;    // a new game starts in the morning

// ---- player survival (CRAFT tunes the drain/regen numbers in craft/index.js; these are the caps) ----
export const HP_MAX = 100;
export const HUNGER_MAX = 100;
export const HURT_IFRAMES = 40;     // invulnerable steps after taking damage
export const DEATH_STEPS = 90;      // faint pause before respawning at home
export const FALL_SAFE_TILES = 10;  // falls up to this many tiles are free; then 5 hp per extra tile

// ---- swimming ----
export const SWIM_G = 0.16, SWIM_MAX_FALL = 1.6, SWIM_UP = 0.5, SWIM_UP_MAX = 2.8, SWIM_RUN = 2.0;

// ---- autosave ----
export const SAVE_KEY = "adventurecube.bonus.v1";
export const SAVE_VERSION = 1;
export const AUTOSAVE_STEPS = 1800; // every 30 s of play
