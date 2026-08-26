// src/games/obby/scripts/config.js — the obby's frozen tables: difficulty rows, the
// stage roster, platform palette, the StagePart -> engine-part map, rewards, badges,
// music bands and the tuning constants. Spec 08 §5.2, §5.3, §5.9.6-§5.9.8, §5.12, §6
// own this file. Pure data + mulberry32: no imports, no ctx, no DOM — layout.js is
// imported under Node by the route check (spec 08 §8.1 R0), so nothing here may touch
// a browser global.

// ---------------------------------------------------------------------------
// Headings and the path anchor — §5.1 (yaw convention) / §5.4 step 1.
// ---------------------------------------------------------------------------

// yaw 0 = +Z; rotation about +Y maps +Z -> +X at 90°.
export const HEADINGS = Object.freeze({
  E: Object.freeze({ ux: 1, uz: 0, yaw: 90 }),
  S: Object.freeze({ ux: 0, uz: 1, yaw: 0 }),
  W: Object.freeze({ ux: -1, uz: 0, yaw: -90 }),
});

// The plaza top-centre. Its parts live in place.json; the generator emits none for it.
export const ANCHOR = Object.freeze([-1560, 100, 0]);

// ---------------------------------------------------------------------------
// §5.2 DIFFS — index order matters (it drives the §5.3 theme rotation).
// SLICE: the slice ramps through 8 of spec 08 §5.2's 21 difficulties. The 13 rows
// from Difficult (idx 10) to Dilly Impossible (idx 20), plus Simply Walk (idx 3) and
// Easy (idx 7), append here verbatim from §5.2's table — every column below is that
// table's column, so the remaining rows are data, not code.
// ---------------------------------------------------------------------------

// Specials (§5.2): one stage each, no theme, no generation params.
function special(idx, name, color, order) {
  return Object.freeze({
    idx, name, color, count: 1, special: order, tower: null,
    p0: null, p1: null, gMin: null, gMax: null, size: null,
    decoy: 0, spin: 0, head: false, beam: 0, checker: false, hug: false, glitch: false,
  });
}

export const DIFFS = Object.freeze([
  special(0, "The Beginning", "#ffffff", 1),
  special(1, "Exist", "#e8e8e8", 2),
  special(2, "Just Jump", "#d0f0ff", 3),
  special(4, "Walk Around It", "#ffe8c0", 5),
  Object.freeze({
    idx: 5, name: "Cake Walk", color: "#f7a8d8", count: 5, special: 0, tower: null,
    p0: 6, p1: 8, gMin: 2, gMax: 3, size: 8,
    decoy: 0, spin: 0, head: false, beam: 0, checker: false, hug: false, glitch: false,
  }),
  Object.freeze({
    idx: 6, name: "Effortless", color: "#9ff781", count: 5, special: 0, tower: null,
    p0: 8, p1: 10, gMin: 3, gMax: 4, size: 7,
    decoy: 0, spin: 0, head: false, beam: 0, checker: false, hug: false, glitch: false,
  }),
  Object.freeze({
    idx: 8, name: "Medium", color: "#fffe00", count: 10, special: 0, tower: 30,
    p0: 12, p1: 16, gMin: 4.5, gMax: 5.5, size: 5.5,
    decoy: 0.15, spin: 8, head: false, beam: 0, checker: false, hug: false, glitch: false,
  }),
  Object.freeze({
    idx: 9, name: "Hard", color: "#fd7c00", count: 5, special: 0, tower: 35,
    p0: 15, p1: 18, gMin: 5, gMax: 6, size: 5,
    decoy: 0.18, spin: 10, head: true, beam: 0, checker: false, hug: false, glitch: false,
  }),
]);

// ---------------------------------------------------------------------------
// §5.3 ROSTER — the stage list the generator walks, one row per stage.
// SLICE: 8 of §5.3's 90 rows, renumbered 1..8 — the ramp's first rung of each
// difficulty the slice ships (§5.3 stages 1, 2, 3, 5, 6, 11, 21, 31). `srcN` keeps the
// row's number in the full 90-stage roster so the §5.9.7 badge table and the §5.9.8
// music bands still key off spec numbering; filling §5.3's other 82 rows in restores
// `n === srcN` and `srcN` goes away. Row shape is §5.3's: n, difficulty, theme, plats.
//
// `theme` reproduces §5.3's derivation, not a hand pick: avail = themesFor(diff)
// (§5.6 order), off = (idx·3) % avail.length, theme(s) = avail[(s−1+off) % len].
//   Cake Walk  idx 5, 7 themes, off 1 -> stairs     Medium idx 8,  9 themes, off 6 -> decoy
//   Effortless idx 6, 7 themes, off 4 -> longshot   Hard   idx 9, 10 themes, off 7 -> spin
// `plats` is §5.2's budget formula at s = 1, which is exactly p0.
// ---------------------------------------------------------------------------

export const ROSTER = Object.freeze([
  Object.freeze({ n: 1, srcN: 1, diff: "The Beginning", name: "The Beginning", theme: null, tower: false, plats: null }),
  Object.freeze({ n: 2, srcN: 2, diff: "Exist", name: "Exist", theme: null, tower: false, plats: null }),
  Object.freeze({ n: 3, srcN: 3, diff: "Just Jump", name: "Just Jump", theme: null, tower: false, plats: null }),
  Object.freeze({ n: 4, srcN: 5, diff: "Walk Around It", name: "Walk Around It", theme: null, tower: false, plats: null }),
  Object.freeze({ n: 5, srcN: 6, diff: "Cake Walk", name: "Cake Walk 1", theme: "stairs", tower: false, plats: 6 }),
  Object.freeze({ n: 6, srcN: 11, diff: "Effortless", name: "Effortless 1", theme: "longshot", tower: false, plats: 8 }),
  Object.freeze({ n: 7, srcN: 21, diff: "Medium", name: "Medium 1", theme: "decoy", tower: false, plats: 12 }),
  Object.freeze({ n: 8, srcN: 31, diff: "Hard", name: "Hard 1", theme: "spin", tower: false, plats: 15 }),
]);

// ---------------------------------------------------------------------------
// §5.12.1 PALETTE — per-difficulty platform look. Colour is §5.2's column.
// ---------------------------------------------------------------------------

export const PALETTE = Object.freeze({
  "The Beginning": Object.freeze({ mat: "plastic", color: "#ffffff", t: 0 }),
  Exist: Object.freeze({ mat: "plastic", color: "#e8e8e8", t: 0 }),
  "Just Jump": Object.freeze({ mat: "plastic", color: "#d0f0ff", t: 0 }),
  "Walk Around It": Object.freeze({ mat: "plastic", color: "#ffe8c0", t: 0 }),
  "Cake Walk": Object.freeze({ mat: "plastic", color: "#f7a8d8", t: 0 }),
  Effortless: Object.freeze({ mat: "plastic", color: "#9ff781", t: 0 }),
  Medium: Object.freeze({ mat: "plastic", color: "#fffe00", t: 0 }),
  Hard: Object.freeze({ mat: "wood", color: "#fd7c00", t: 0 }),
});

// ---------------------------------------------------------------------------
// §5.12 StagePart kind -> engine part def. `diff` marks the columns that read the
// stage's PALETTE row instead of a literal. Behaviours are cloned per part by the
// mapper (spec 04 §3.2 owns their param names).
// ---------------------------------------------------------------------------

export const KIND_MAP = Object.freeze({
  platform: Object.freeze({ shape: "box", diff: true }),
  killTile: Object.freeze({ shape: "box", material: "neon", color: "#ff2244", t: 0.15, kill: true }),
  deco: Object.freeze({ shape: "box", material: "plastic", color: "#8d8d94", t: 0 }),
  wall: Object.freeze({ shape: "box", material: "plastic", color: "#5a5a60", t: 0 }),
  towerShell: Object.freeze({ shape: "box", material: "glass", diffColor: true, t: 0.5 }),
  gate: Object.freeze({ shape: "box", material: "neon", diffColor: true, t: 0 }),
  sign: Object.freeze({ shape: "box", material: "plastic", color: "#101014", t: 0 }),
  killFloor: Object.freeze({ shape: "box", material: "plastic", color: "#000000", t: 1, canCollide: false, kill: true }),
  cpPad: Object.freeze({ shape: "box", material: "neon", color: "#00ff64", t: 0.1, touch: "checkpoint" }),
  spinnerHub: Object.freeze({ shape: "cylinder", material: "metal", color: "#33343a", t: 0 }),
  spinnerBar: Object.freeze({ shape: "box", material: "neon", color: "#ff2244", t: 0, spinner: true, kill: true }),
  winPad: Object.freeze({ shape: "box", material: "neon", color: "#ffd700", t: 0, touch: "winpad" }),
});

// ---------------------------------------------------------------------------
// §5.9.6 REWARDS — Oofbux per first-time stage completion (towers pay 5×, applied by
// the caller). The full 17-difficulty table, so appended stages need no edit here.
// ---------------------------------------------------------------------------

export const REWARDS = Object.freeze({
  "The Beginning": 1, Exist: 1, "Just Jump": 1, "Simply Walk": 1, "Walk Around It": 1,
  "Cake Walk": 2, Effortless: 3, Easy: 4, Medium: 6, Hard: 8, Difficult: 10,
  Challenging: 12, Intense: 15, Remorseless: 18, Insane: 22, Extreme: 26,
  Terrifying: 30, Catastrophic: 40, NIL: 50, Megadeath: 75, "Dilly Impossible": 100,
});

// ---------------------------------------------------------------------------
// §5.9.7 BADGES — ids are auto-prefixed `obby.` by services.badges.
// SLICE: the table ships whole (schema and rows are §5.9.7's), but nothing awards
// from it yet: Badges are out of the playable slice (SLICE.md, "Badges / daily / save
// codes" row), so §5.9.2 step 5's award loop is deferred with the rest of spec 07
// §5.7's registry. `atStageComplete` is a spec-numbered stage, i.e. a ROSTER `srcN`.
// ---------------------------------------------------------------------------

export const BADGES = Object.freeze([
  Object.freeze({ id: "basics", name: "Off The Island", icon: "🐣", atStageComplete: 5 }),
  Object.freeze({ id: "cake-walk", name: "Cake Walker", icon: "🍰", atStageComplete: 10 }),
  Object.freeze({ id: "effortless", name: "Effortless", icon: "🍃", atStageComplete: 15 }),
  Object.freeze({ id: "easy", name: "Easy Peasy", icon: "🟢", atStageComplete: 20 }),
  Object.freeze({ id: "medium", name: "Medium Rare", icon: "🟡", atStageComplete: 30 }),
  Object.freeze({ id: "hard", name: "Hard Hat", icon: "🟠", atStageComplete: 35 }),
  Object.freeze({ id: "difficult", name: "Difficult Days", icon: "🔴", atStageComplete: 40 }),
  Object.freeze({ id: "challenging", name: "Challenge Accepted", icon: "🟥", atStageComplete: 45 }),
  Object.freeze({ id: "intense", name: "Intense Focus", icon: "🔥", atStageComplete: 50 }),
  Object.freeze({ id: "remorseless", name: "No Remorse", icon: "💜", atStageComplete: 55 }),
  Object.freeze({ id: "insane", name: "Certified Insane", icon: "🔵", atStageComplete: 60 }),
  Object.freeze({ id: "extreme", name: "Extreme Machine", icon: "🧊", atStageComplete: 65 }),
  Object.freeze({ id: "terrifying", name: "Fear Is Fake", icon: "👻", atStageComplete: 75 }),
  Object.freeze({ id: "catastrophic", name: "Catastrophe Averted", icon: "⚪", atStageComplete: 80 }),
  Object.freeze({ id: "nil", name: "Undefined Behavior", icon: "🌫️", atStageComplete: 85 }),
  Object.freeze({ id: "megadeath", name: "Megadeath Survivor", icon: "💀", atStageComplete: 88 }),
  Object.freeze({ id: "dilly", name: "Dilly Impossible??", icon: "🌈", atStageComplete: 90 }),
  Object.freeze({ id: "winner", name: "OBBY WINNER", icon: "🏆", atStageComplete: 90 }),
]);

// ---------------------------------------------------------------------------
// §5.9.8 MUSIC_BANDS — spec-numbered stage bands (a ROSTER `srcN`), mapped onto the
// spec-02 TRACKS registry. Read through `srcN`, so the slice's compressed ramp still
// crosses a real band boundary (stage 7 = spec stage 21).
// ---------------------------------------------------------------------------

export const MUSIC_BANDS = Object.freeze([
  Object.freeze({ maxStage: 20, track: "plaza" }),
  Object.freeze({ maxStage: 65, track: "ascent" }),
  Object.freeze({ maxStage: 90, track: "pump" }),
]);

// ---------------------------------------------------------------------------
// §6 tuning constants. Every number below is quoted from that table by name; nothing
// re-derives one.
// ---------------------------------------------------------------------------

export const TUNE = Object.freeze({
  SEED: 90,
  BASE_Y: 100,
  MIN_TOP_Y: 60,
  ROW_X_LIMIT: 1600,
  SPIN_R: 4,
  SPIN_BAR_W: 1.2,
  SPIN_BAR_H: 0.8,
  SPIN_PASS_MIN_S: 1.2,
  SPIN_SAFETY: 0.9,
  KILLFLOOR_DROP: 27,
  KILLFLOOR_MARGIN: 20,
  CATCH_DROP: 80,
  CATCH_MARGIN: 200,
  WINDOW_BEHIND: 1,
  WINDOW_AHEAD: 2,
  MAX_LIVE_PARTS: 1200,
  MATERIALIZE_PER_TICK: 60,
  SAVE_DEBOUNCE_S: 2,
  WIN_OOFBUX: 500,
  TP_COOLDOWN_S: 0.5,
  UI_Z: 40,
  LABEL_W: 10,
  LABEL_H: 2.5,
});

// The feasibility envelope. GAP/RISE/COMBO/JUMP_MARGIN are §6's caps; the four physics
// constants are ARCHITECTURE §5 / spec 03 §6 and are what the route check's
// maxJumpGap() (spec 12 §5.2.6) recomputes D(r) from.
export const FEAS = Object.freeze({
  GAP_MAX: 8.7,
  RISE_MAX: 5,
  COMBO_MAX: 9.3,
  JUMP_MARGIN: 0.86,
  CP_GAP_MAX: 4,
  CP_RISE_MAX: 2,
  TOWER_GAP_MAX: 4.8,
  TOWER_RISE_MAX: 3.3,
  HEADHITTER_CLR: 6.75,
  GATE_CLEARANCE_MIN: 12,
  HUG_LEDGE: 1.6,
  GRAVITY: 196.2,
  JUMP_V: 50,
  WALK_SPEED: 16,
  CAP_R: 1,
});

// ---------------------------------------------------------------------------
// §5.4 mulberry32 — the exact reference PRNG; the layout is deterministic in it.
// ---------------------------------------------------------------------------

export function mulberry32(seed) {
  let a = seed | 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
