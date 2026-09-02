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
// §5.2 DIFFS — all 21 rows, index order binding (it drives the §5.3 theme rotation).
// Every column below is §5.2's column, verbatim.
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
  special(3, "Simply Walk", "#c8ffc8", 4),
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
    idx: 7, name: "Easy", color: "#75f347", count: 5, special: 0, tower: null,
    p0: 10, p1: 12, gMin: 4, gMax: 4.8, size: 6,
    decoy: 0.1, spin: 0, head: false, beam: 0, checker: false, hug: false, glitch: false,
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
  Object.freeze({
    idx: 10, name: "Difficult", color: "#ff0536", count: 5, special: 0, tower: 40,
    p0: 18, p1: 21, gMin: 5.5, gMax: 6.5, size: 4.5,
    decoy: 0.2, spin: 12, head: true, beam: 2, checker: false, hug: false, glitch: false,
  }),
  Object.freeze({
    idx: 11, name: "Challenging", color: "#b01030", count: 5, special: 0, tower: 45,
    p0: 21, p1: 24, gMin: 6, gMax: 6.6, size: 4,
    decoy: 0.22, spin: 12, head: true, beam: 2, checker: true, hug: false, glitch: false,
  }),
  Object.freeze({
    idx: 12, name: "Intense", color: "#661717", count: 5, special: 0, tower: 50,
    p0: 24, p1: 27, gMin: 6, gMax: 7, size: 3.5,
    decoy: 0.25, spin: 14, head: true, beam: 2, checker: true, hug: true, glitch: false,
  }),
  Object.freeze({
    idx: 13, name: "Remorseless", color: "#ff00ea", count: 5, special: 0, tower: 55,
    p0: 27, p1: 30, gMin: 6.5, gMax: 7, size: 3,
    decoy: 0.25, spin: 16, head: true, beam: 2, checker: true, hug: true, glitch: false,
  }),
  Object.freeze({
    idx: 14, name: "Insane", color: "#0034ff", count: 5, special: 0, tower: 60,
    p0: 30, p1: 33, gMin: 6.5, gMax: 7.5, size: 2.8,
    decoy: 0.28, spin: 18, head: true, beam: 1.5, checker: true, hug: true, glitch: false,
  }),
  Object.freeze({
    idx: 15, name: "Extreme", color: "#00a2ff", count: 5, special: 0, tower: 65,
    p0: 33, p1: 36, gMin: 7, gMax: 7.5, size: 2.5,
    decoy: 0.3, spin: 20, head: true, beam: 1.5, checker: true, hug: true, glitch: false,
  }),
  Object.freeze({
    idx: 16, name: "Terrifying", color: "#7f00ff", count: 10, special: 0, tower: 75,
    p0: 36, p1: 40, gMin: 7, gMax: 8, size: 2.2,
    decoy: 0.3, spin: 22, head: true, beam: 1.5, checker: true, hug: true, glitch: false,
  }),
  Object.freeze({
    idx: 17, name: "Catastrophic", color: "#ffffff", count: 5, special: 0, tower: 80,
    p0: 40, p1: 44, gMin: 7.5, gMax: 8, size: 2,
    decoy: 0.32, spin: 24, head: true, beam: 1.5, checker: true, hug: true, glitch: false,
  }),
  Object.freeze({
    idx: 18, name: "NIL", color: "#4a4a4a", count: 5, special: 0, tower: 85,
    p0: 44, p1: 48, gMin: 7.5, gMax: 8.2, size: 2,
    decoy: 0.32, spin: 24, head: true, beam: 1.5, checker: true, hug: true, glitch: true,
  }),
  Object.freeze({
    // #1a0000 -> #e0564a -> #ff9e93. The first was a red so dark it read as black next
    // to NIL's grey and Dilly's near-black; the second was readable but still a mid
    // red, and the owner asked twice, so this is a pale salmon that cannot be mistaken
    // for any of the dark tiers around it.
    // near-black — three unreadable tiers in a row at the end of the chart. Lightened
    // 2026-08-28 at the owner's request; it is now plainly red.
    idx: 19, name: "Megadeath", color: "#ff9e93", count: 3, special: 0, tower: 88,
    p0: 48, p1: 52, gMin: 8, gMax: 8.5, size: 1.8,
    decoy: 0.35, spin: 24, head: true, beam: 1.5, checker: true, hug: true, glitch: false,
  }),
  Object.freeze({
    idx: 20, name: "Dilly Impossible", color: "#14000a", count: 2, special: 0, tower: 90,
    p0: 55, p1: 55, gMin: 8.2, gMax: 8.7, size: 1.6,
    decoy: 0.4, spin: 24, head: true, beam: 1.5, checker: true, hug: true, glitch: false,
  }),
  // §5.2 NOT POSSIBLE (added 2026-08-28) — the chart's last difficulty.
  //
  // Read the gap numbers before changing them. `maxJumpGap(0)` is 8.733 studs: that is
  // the furthest this avatar can EVER jump on flat ground, from spec 03's gravity, walk
  // speed and jump velocity. Dilly Impossible already asks 8.7. There is no room left
  // above it, and a longer gap would not be a harder jump — it would be an unreachable
  // one, which the route gate (08:R3) rejects and a player could never pass.
  //
  // So this tier is not harder by distance. It is harder because EVERY hop is the
  // maximum one: gMin equals gMax, so there is no short jump to breathe on. The
  // platforms are the smallest in the chart (1.4), half the landings have a decoy
  // beside them, the spinners are the fastest, glitch cubes are on, and it owns the
  // wraparound theme — a ring of maximal hops orbiting a pillar, with nothing under it.
  Object.freeze({
    idx: 21, name: "Not Possible", color: "#ff36c8", count: 2, special: 0, tower: 93,
    // 8.65, not 8.7. §5.5 GAP_MAX is 8.7 and the lattice rounding in F() can add a
    // hundredth, so pinning both ends at the ceiling puts some hops a whisker over it and
    // 08:R3 rejects the chart. 8.65 keeps every jump maximal and legal — and the tier is
    // not hard because of one long jump anyway, it is hard because there is no short one.
    // A band, not a single number, and a narrow one: 8.3 is the highest FLOOR in the
    // chart (Dilly Impossible's is 8.2), so there is no easy hop anywhere in the tier.
    // The width exists because a 6-step wraparound ring cannot be uniform — its hops
    // vary by about a third of a stud around the circle — while a 4-step ring is exact.
    p0: 58, p1: 58, gMin: 8.3, gMax: 8.65, size: 1.4,
    decoy: 0.5, spin: 26, head: true, beam: 1.4, checker: true, hug: true, glitch: true,
  }),
]);

// ---------------------------------------------------------------------------
// §5.3 ROSTER — all 90 stages, one row per stage: n, diff, name, theme, tower, plats.
//
// `theme` and `plats` are §5.3's derivation, not a hand pick. Theme:
//   avail = themesFor(diff) (§5.6 order), off = (idx·3) % avail.length,
//   theme(s) = avail[(s−1+off) % avail.length]   — towers and specials carry none.
// Budget: §5.2's formula over normals = count − (tower ? 1 : 0),
//   normals === 1 ? p0 : round(p0 + (s−1)/(normals−1) · (p1−p0)),  towers 5 × p1.
// Both were generated from those rules and checked row-for-row against §5.3's printed
// table before landing here; validate's 08:R1 holds that table as its own fixture, so
// an edit to DIFFS that moves any theme or budget fails the route check rather than
// silently reshaping the game.
//
// Stage numbering is now spec numbering: the slice's `srcN` indirection is gone
// because n === srcN for every row, which is what §5.9.7's badge table and §5.9.8's
// music bands key off.

export const ROSTER = Object.freeze([
  Object.freeze({ n: 1, diff: "The Beginning", name: "The Beginning", theme: null, tower: false, plats: null }),
  Object.freeze({ n: 2, diff: "Exist", name: "Exist", theme: null, tower: false, plats: null }),
  Object.freeze({ n: 3, diff: "Just Jump", name: "Just Jump", theme: null, tower: false, plats: null }),
  Object.freeze({ n: 4, diff: "Simply Walk", name: "Simply Walk", theme: null, tower: false, plats: null }),
  Object.freeze({ n: 5, diff: "Walk Around It", name: "Walk Around It", theme: null, tower: false, plats: null }),
  Object.freeze({ n: 6, diff: "Cake Walk", name: "Cake Walk 1", theme: "stairs", tower: false, plats: 6 }),
  Object.freeze({ n: 7, diff: "Cake Walk", name: "Cake Walk 2", theme: "zigzag", tower: false, plats: 7 }),
  Object.freeze({ n: 8, diff: "Cake Walk", name: "Cake Walk 3", theme: "tiny", tower: false, plats: 7 }),
  Object.freeze({ n: 9, diff: "Cake Walk", name: "Cake Walk 4", theme: "longshot", tower: false, plats: 8 }),
  Object.freeze({ n: 10, diff: "Cake Walk", name: "Cake Walk 5", theme: "walkrun", tower: false, plats: 8 }),
  Object.freeze({ n: 11, diff: "Effortless", name: "Effortless 1", theme: "longshot", tower: false, plats: 8 }),
  Object.freeze({ n: 12, diff: "Effortless", name: "Effortless 2", theme: "walkrun", tower: false, plats: 9 }),
  Object.freeze({ n: 13, diff: "Effortless", name: "Effortless 3", theme: "mixed", tower: false, plats: 9 }),
  Object.freeze({ n: 14, diff: "Effortless", name: "Effortless 4", theme: "jumps", tower: false, plats: 10 }),
  Object.freeze({ n: 15, diff: "Effortless", name: "Effortless 5", theme: "stairs", tower: false, plats: 10 }),
  Object.freeze({ n: 16, diff: "Easy", name: "Easy 1", theme: "walkrun", tower: false, plats: 10 }),
  Object.freeze({ n: 17, diff: "Easy", name: "Easy 2", theme: "decoy", tower: false, plats: 11 }),
  Object.freeze({ n: 18, diff: "Easy", name: "Easy 3", theme: "mixed", tower: false, plats: 11 }),
  Object.freeze({ n: 19, diff: "Easy", name: "Easy 4", theme: "jumps", tower: false, plats: 12 }),
  Object.freeze({ n: 20, diff: "Easy", name: "Easy 5", theme: "stairs", tower: false, plats: 12 }),
  Object.freeze({ n: 21, diff: "Medium", name: "Medium 1", theme: "decoy", tower: false, plats: 12 }),
  Object.freeze({ n: 22, diff: "Medium", name: "Medium 2", theme: "spin", tower: false, plats: 13 }),
  Object.freeze({ n: 23, diff: "Medium", name: "Medium 3", theme: "mixed", tower: false, plats: 13 }),
  Object.freeze({ n: 24, diff: "Medium", name: "Medium 4", theme: "jumps", tower: false, plats: 14 }),
  Object.freeze({ n: 25, diff: "Medium", name: "Medium 5", theme: "stairs", tower: false, plats: 14 }),
  Object.freeze({ n: 26, diff: "Medium", name: "Medium 6", theme: "zigzag", tower: false, plats: 15 }),
  Object.freeze({ n: 27, diff: "Medium", name: "Medium 7", theme: "tiny", tower: false, plats: 15 }),
  Object.freeze({ n: 28, diff: "Medium", name: "Medium 8", theme: "longshot", tower: false, plats: 16 }),
  Object.freeze({ n: 29, diff: "Medium", name: "Medium 9", theme: "walkrun", tower: false, plats: 16 }),
  Object.freeze({ n: 30, diff: "Medium", name: "Medium Tower", theme: "tower", tower: true, plats: 80 }),
  Object.freeze({ n: 31, diff: "Hard", name: "Hard 1", theme: "spin", tower: false, plats: 15 }),
  Object.freeze({ n: 32, diff: "Hard", name: "Hard 2", theme: "squeeze", tower: false, plats: 16 }),
  Object.freeze({ n: 33, diff: "Hard", name: "Hard 3", theme: "mixed", tower: false, plats: 17 }),
  Object.freeze({ n: 34, diff: "Hard", name: "Hard 4", theme: "jumps", tower: false, plats: 18 }),
  Object.freeze({ n: 35, diff: "Hard", name: "Hard Tower", theme: "tower", tower: true, plats: 90 }),
  Object.freeze({ n: 36, diff: "Difficult", name: "Difficult 1", theme: "squeeze", tower: false, plats: 18 }),
  Object.freeze({ n: 37, diff: "Difficult", name: "Difficult 2", theme: "beams", tower: false, plats: 19 }),
  Object.freeze({ n: 38, diff: "Difficult", name: "Difficult 3", theme: "mixed", tower: false, plats: 20 }),
  Object.freeze({ n: 39, diff: "Difficult", name: "Difficult 4", theme: "jumps", tower: false, plats: 21 }),
  Object.freeze({ n: 40, diff: "Difficult", name: "Difficult Tower", theme: "tower", tower: true, plats: 105 }),
  Object.freeze({ n: 41, diff: "Challenging", name: "Challenging 1", theme: "beams", tower: false, plats: 21 }),
  Object.freeze({ n: 42, diff: "Challenging", name: "Challenging 2", theme: "checker", tower: false, plats: 22 }),
  Object.freeze({ n: 43, diff: "Challenging", name: "Challenging 3", theme: "mixed", tower: false, plats: 23 }),
  Object.freeze({ n: 44, diff: "Challenging", name: "Challenging 4", theme: "jumps", tower: false, plats: 24 }),
  Object.freeze({ n: 45, diff: "Challenging", name: "Challenging Tower", theme: "tower", tower: true, plats: 120 }),
  Object.freeze({ n: 46, diff: "Intense", name: "Intense 1", theme: "jumps", tower: false, plats: 24 }),
  Object.freeze({ n: 47, diff: "Intense", name: "Intense 2", theme: "stairs", tower: false, plats: 25 }),
  Object.freeze({ n: 48, diff: "Intense", name: "Intense 3", theme: "zigzag", tower: false, plats: 26 }),
  Object.freeze({ n: 49, diff: "Intense", name: "Intense 4", theme: "tiny", tower: false, plats: 27 }),
  Object.freeze({ n: 50, diff: "Intense", name: "Intense Tower", theme: "tower", tower: true, plats: 135 }),
  Object.freeze({ n: 51, diff: "Remorseless", name: "Remorseless 1", theme: "tiny", tower: false, plats: 27 }),
  Object.freeze({ n: 52, diff: "Remorseless", name: "Remorseless 2", theme: "longshot", tower: false, plats: 28 }),
  Object.freeze({ n: 53, diff: "Remorseless", name: "Remorseless 3", theme: "walkrun", tower: false, plats: 29 }),
  Object.freeze({ n: 54, diff: "Remorseless", name: "Remorseless 4", theme: "decoy", tower: false, plats: 30 }),
  Object.freeze({ n: 55, diff: "Remorseless", name: "Remorseless Tower", theme: "tower", tower: true, plats: 150 }),
  Object.freeze({ n: 56, diff: "Insane", name: "Insane 1", theme: "decoy", tower: false, plats: 30 }),
  Object.freeze({ n: 57, diff: "Insane", name: "Insane 2", theme: "spin", tower: false, plats: 31 }),
  Object.freeze({ n: 58, diff: "Insane", name: "Insane 3", theme: "squeeze", tower: false, plats: 32 }),
  Object.freeze({ n: 59, diff: "Insane", name: "Insane 4", theme: "beams", tower: false, plats: 33 }),
  Object.freeze({ n: 60, diff: "Insane", name: "Insane Tower", theme: "tower", tower: true, plats: 165 }),
  Object.freeze({ n: 61, diff: "Extreme", name: "Extreme 1", theme: "beams", tower: false, plats: 33 }),
  Object.freeze({ n: 62, diff: "Extreme", name: "Extreme 2", theme: "checker", tower: false, plats: 34 }),
  Object.freeze({ n: 63, diff: "Extreme", name: "Extreme 3", theme: "mixed", tower: false, plats: 35 }),
  Object.freeze({ n: 64, diff: "Extreme", name: "Extreme 4", theme: "jumps", tower: false, plats: 36 }),
  Object.freeze({ n: 65, diff: "Extreme", name: "Extreme Tower", theme: "tower", tower: true, plats: 180 }),
  Object.freeze({ n: 66, diff: "Terrifying", name: "Terrifying 1", theme: "jumps", tower: false, plats: 36 }),
  Object.freeze({ n: 67, diff: "Terrifying", name: "Terrifying 2", theme: "stairs", tower: false, plats: 37 }),
  Object.freeze({ n: 68, diff: "Terrifying", name: "Terrifying 3", theme: "zigzag", tower: false, plats: 37 }),
  Object.freeze({ n: 69, diff: "Terrifying", name: "Terrifying 4", theme: "tiny", tower: false, plats: 38 }),
  Object.freeze({ n: 70, diff: "Terrifying", name: "Terrifying 5", theme: "longshot", tower: false, plats: 38 }),
  Object.freeze({ n: 71, diff: "Terrifying", name: "Terrifying 6", theme: "walkrun", tower: false, plats: 39 }),
  Object.freeze({ n: 72, diff: "Terrifying", name: "Terrifying 7", theme: "decoy", tower: false, plats: 39 }),
  Object.freeze({ n: 73, diff: "Terrifying", name: "Terrifying 8", theme: "spin", tower: false, plats: 40 }),
  Object.freeze({ n: 74, diff: "Terrifying", name: "Terrifying 9", theme: "squeeze", tower: false, plats: 40 }),
  Object.freeze({ n: 75, diff: "Terrifying", name: "Terrifying Tower", theme: "tower", tower: true, plats: 200 }),
  Object.freeze({ n: 76, diff: "Catastrophic", name: "Catastrophic 1", theme: "tiny", tower: false, plats: 40 }),
  Object.freeze({ n: 77, diff: "Catastrophic", name: "Catastrophic 2", theme: "longshot", tower: false, plats: 41 }),
  Object.freeze({ n: 78, diff: "Catastrophic", name: "Catastrophic 3", theme: "walkrun", tower: false, plats: 43 }),
  Object.freeze({ n: 79, diff: "Catastrophic", name: "Catastrophic 4", theme: "decoy", tower: false, plats: 44 }),
  Object.freeze({ n: 80, diff: "Catastrophic", name: "Catastrophic Tower", theme: "tower", tower: true, plats: 220 }),
  Object.freeze({ n: 81, diff: "NIL", name: "NIL 1", theme: "decoy", tower: false, plats: 44 }),
  Object.freeze({ n: 82, diff: "NIL", name: "NIL 2", theme: "spin", tower: false, plats: 45 }),
  Object.freeze({ n: 83, diff: "NIL", name: "NIL 3", theme: "squeeze", tower: false, plats: 47 }),
  Object.freeze({ n: 84, diff: "NIL", name: "NIL 4", theme: "beams", tower: false, plats: 48 }),
  Object.freeze({ n: 85, diff: "NIL", name: "NIL Tower", theme: "tower", tower: true, plats: 240 }),
  Object.freeze({ n: 86, diff: "Megadeath", name: "Megadeath 1", theme: "beams", tower: false, plats: 48 }),
  Object.freeze({ n: 87, diff: "Megadeath", name: "Megadeath 2", theme: "checker", tower: false, plats: 52 }),
  Object.freeze({ n: 88, diff: "Megadeath", name: "Megadeath Tower", theme: "tower", tower: true, plats: 260 }),
  Object.freeze({ n: 89, diff: "Dilly Impossible", name: "Dilly Impossible 1", theme: "jumps", tower: false, plats: 55 }),
  Object.freeze({ n: 90, diff: "Dilly Impossible", name: "Dilly Impossible Tower", theme: "tower", tower: true, plats: 275 }),
  Object.freeze({ n: 91, diff: "Not Possible", name: "Not Possible 1", theme: "wrap", tower: false, plats: 58 }),
  Object.freeze({ n: 92, diff: "Not Possible", name: "Not Possible 2", theme: "mixed", tower: false, plats: 58 }),
  Object.freeze({ n: 93, diff: "Not Possible", name: "Not Possible Tower", theme: "tower", tower: true, plats: 290 }),
]);

// ---------------------------------------------------------------------------
// §5.12.1 PALETTE — per-difficulty platform look. Colour is §5.2's column.
// ---------------------------------------------------------------------------

export const PALETTE = Object.freeze({
  "The Beginning": Object.freeze({ mat: "plastic", color: "#ffffff", t: 0 }),
  Exist: Object.freeze({ mat: "plastic", color: "#e8e8e8", t: 0 }),
  "Just Jump": Object.freeze({ mat: "plastic", color: "#d0f0ff", t: 0 }),
  "Simply Walk": Object.freeze({ mat: "plastic", color: "#c8ffc8", t: 0 }),
  "Walk Around It": Object.freeze({ mat: "plastic", color: "#ffe8c0", t: 0 }),
  "Cake Walk": Object.freeze({ mat: "plastic", color: "#f7a8d8", t: 0 }),
  Effortless: Object.freeze({ mat: "plastic", color: "#9ff781", t: 0 }),
  Easy: Object.freeze({ mat: "grass", color: "#75f347", t: 0 }),
  Medium: Object.freeze({ mat: "plastic", color: "#fffe00", t: 0 }),
  Hard: Object.freeze({ mat: "wood", color: "#fd7c00", t: 0 }),
  Difficult: Object.freeze({ mat: "plastic", color: "#ff0536", t: 0 }),
  Challenging: Object.freeze({ mat: "metal", color: "#b01030", t: 0 }),
  Intense: Object.freeze({ mat: "plastic", color: "#661717", t: 0 }),
  Remorseless: Object.freeze({ mat: "neon", color: "#ff00ea", t: 0 }),
  Insane: Object.freeze({ mat: "plastic", color: "#0034ff", t: 0 }),
  Extreme: Object.freeze({ mat: "ice", color: "#00a2ff", t: 0 }),
  Terrifying: Object.freeze({ mat: "neon", color: "#7f00ff", t: 0 }),
  Catastrophic: Object.freeze({ mat: "neon", color: "#ffffff", t: 0 }),
  NIL: Object.freeze({ mat: "glass", color: "#4a4a4a", t: 0.3 }),
  Megadeath: Object.freeze({ mat: "plastic", color: "#ff9e93", t: 0 }),
  "Dilly Impossible": Object.freeze({ mat: "plastic", color: "#14000a", t: 0 }),
  "Not Possible": Object.freeze({ mat: "neon", color: "#ff36c8", t: 0 }),
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
  // §5.8.3's winners' area wants a gold neon floor and two CELEBRATORY spinners, but
  // §5.12's table has no way to say either: a StagePart carries no colour override, so
  // the floor would take its difficulty's palette, and every spinnerBar is mapped to
  // `kill`, which would make confetti lethal. Two kinds of its own, in §5.12's own
  // shape, say it instead. Spec 08 §5.12 amended in this commit to carry these rows.
  winFloor: Object.freeze({ shape: "box", material: "neon", color: "#ffd700", t: 0 }),
  confettiBar: Object.freeze({ shape: "box", material: "neon", color: "#ff66cc", t: 0, spinner: true }),
  confettiBarAlt: Object.freeze({ shape: "box", material: "neon", color: "#66ccff", t: 0, spinner: true }),
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
  "Not Possible": 150,
});

// ---------------------------------------------------------------------------
// §5.9.7 BADGES — ids are auto-prefixed `obby.` by services.badges.
// SLICE: the table ships whole (schema and rows are §5.9.7's), but nothing awards
// from it yet: Badges are out of the playable slice (SLICE.md, "Badges / daily / save
// codes" row), so §5.9.2 step 5's award loop is deferred with the rest of spec 07
// §5.7's registry. `atStageComplete` is a spec stage number, i.e. a ROSTER `n`.
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
  Object.freeze({ id: "notpossible", name: "Not Possible?!", icon: "🩷", atStageComplete: 93 }),
  // The winner badge follows the END of the chart, which is 93 now, not 90. It is the
  // only row with `grants`: spec 21 §5 pays the Bunny Suit for finishing the chart, and
  // the award loop grants it alongside the badge rather than needing its own hook.
  Object.freeze({ id: "winner", name: "OBBY WINNER", icon: "🏆", atStageComplete: 93,
    grants: "hat_bunny" }),
]);

// ---------------------------------------------------------------------------
// §5.9.8 MUSIC_BANDS — stage bands over the 90-stage roster, mapped onto the spec-02
// TRACKS registry: plaza up to 20, ascent to 65, pump to the summit.
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
