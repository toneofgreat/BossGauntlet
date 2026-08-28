// src/games/lifting/scripts/config.js — every frozen table and pure helper Weight
// Lifting Simulator's logic modules read from. Spec 09 §3.2-3.7 (record schemas),
// §5.5 (the 28 items, normative), §5.6 (ZONES), §5.7 (REBIRTHS), §5.8 (TITLES),
// §5.9 (SURGES), §5.10 (REWARD_AURAS), §5.12 (OOFBUX_AWARDS/BADGES)
// and §6 (TUNING) own this file. Pure data + pure helper functions only: no imports,
// no ctx, no DOM — this file is imported under Node by tooling exactly like
// src/games/obby/scripts/config.js, so nothing here may touch a browser global.
//
// Item descriptions are copied verbatim from the original's `Config.Items` (Lua) per
// spec 09 §5.5, sourced from the owner's original lifting-sim source (see spec 09's
// header note on where the source lives). `kettlebell`'s desc is this port's own
// addition, given directly by spec 09 §5.5.

// ---------------------------------------------------------------------------
// §3.3 prim + §3.2 item record builders. Small factories (not state) so the 28-row,
// ~150-prim transcription below stays readable and every prim carries the full
// §3.3 field set explicitly (rotation/transparency/spin defaulted to 0 rather than
// left absent) — items.js can then read every field unconditionally rather than
// re-implementing §3.3's defaulting rules itself. That completeness is this file's
// own judgement call, not a spec requirement.
// ---------------------------------------------------------------------------

function prim(shape, size, offset, color, material, opts = {}) {
  return Object.freeze({
    shape,
    size: Object.freeze(size.slice()),
    offset: Object.freeze(offset.slice()),
    rotation: Object.freeze((opts.rotation || [0, 0, 0]).slice()),
    color,
    material,
    transparency: opts.transparency || 0,
    spin: opts.spin || 0,
  });
}

function item(id, name, cost, power, world, req, desc, prims) {
  return Object.freeze({ id, name, cost, power, world, req, desc, prims: Object.freeze(prims) });
}

// ---------------------------------------------------------------------------
// §5.5 ITEMS — all 28 rows, normative. Order, ids, costs, powers, worlds and reqs
// are transcribed exactly from §5.5's table; nothing here is re-derived. Prim
// recipes are transcribed from §5.5's per-item DSL rows; a "N×" row is expanded to
// its N literal prims below (every ± / {a,b,c} combination named).
//
// Two rows in §5.5's DSL contain an unresolved edit artifact (an "→" mid-row with a
// dangling fragment before it and no color/material on the fragment): `house`'s
// second prim ("box [0.01,1.9,0.01]→ *roof:* cone [...]") and `situps`'s roller pair
// ("2× cyl [...] at (±0.0,0.75,-1.05)→ *rollers:* rot (0,0,90) at (0,0.8,-1.0) and
// (0,0.55,-1.15)"). Both are read here as "the text after the arrow is the real
// prim, the text before it is a superseded scratch fragment" — the pre-arrow
// fragment has no color/material and its "±0.0" is degenerate (two coincident
// points), while the post-arrow text is fully specified. Reported as a spec gap;
// not a fix to a normative number, just a reading of malformed markup.
// ---------------------------------------------------------------------------

export const ITEMS = Object.freeze([
  item("pencil", "Pencil", 0, 1, "gym", null,
    "A real No. 2 pencil - yellow, sharpened, pink eraser. Everyone starts somewhere.",
    [
      prim("cylinder", [0.06, 1.4, 0.06], [0, 0, 0], "#f5cd30", "plastic", { rotation: [0, 0, 90] }),
      prim("cone", [0.06, 0.18, 0.06], [0.79, 0, 0], "#d9b48f", "plastic", { rotation: [0, 0, -90] }),
      prim("sphere", [0.05, 0.05, 0.05], [0.9, 0, 0], "#2e3345", "plastic"),
      prim("cylinder", [0.065, 0.12, 0.065], [-0.76, 0, 0], "#e0245e", "plastic", { rotation: [0, 0, 90] }),
    ]),

  item("rock", "Rock", 50, 2, "gym", null,
    "A chunky gray rock straight off the ground. Heavier than it looks.",
    [
      prim("sphere", [0.9, 0.7, 0.8], [0, 0, 0], "#9aa3b8", "plastic"),
      prim("sphere", [0.5, 0.4, 0.45], [0.35, 0.2, 0.15], "#8a92a6", "plastic"),
      prim("sphere", [0.35, 0.3, 0.3], [-0.4, -0.1, -0.2], "#aab2c4", "plastic"),
    ]),

  item("book", "Book", 250, 4, "gym", null,
    "A thick hardcover book. Knowledge is power. Literally, in here.",
    [
      prim("box", [1.6, 0.35, 1.2], [0, 0, 0], "#2a67c9", "plastic"),
      prim("box", [1.5, 0.27, 1.1], [0.04, 0, 0], "#f2f4fa", "plastic"),
      prim("box", [0.12, 0.37, 1.22], [-0.76, 0, 0], "#1b4a94", "plastic"),
    ]),

  item("lamp", "Small Lamp", 1250, 5, "gym", null,
    "A little desk lamp with a warm glowing bulb. Unplugged, probably.",
    [
      prim("cylinder", [0.35, 0.08, 0.35], [0, -0.5, 0], "#c7cdd9", "metal"),
      prim("cylinder", [0.05, 0.7, 0.05], [0, -0.1, 0], "#c7cdd9", "metal"),
      prim("cone", [0.4, 0.45, 0.4], [0, 0.4, 0], "#f7c948", "plastic"),
      prim("sphere", [0.12, 0.12, 0.12], [0, 0.18, 0], "#fff4c2", "neon"),
    ]),

  item("kettlebell", "Kettlebell", 4000, 8, "gym", null,
    "A cast-iron kettlebell. Now it's a real workout.",
    [
      prim("sphere", [0.55, 0.55, 0.55], [0, -0.1, 0], "#2e3345", "metal"),
      prim("torus", [0.28, 0.09, 0], [0, 0.45, 0], "#2e3345", "metal", { rotation: [90, 0, 0] }),
      prim("box", [0.5, 0.06, 0.5], [0, 0.14, 0], "#d94436", "plastic"),
    ]),

  // SPEC CONFLICT, RESOLVED (§5.5 vs §10). §5.5 says copy the original's descs verbatim,
  // and the original's candle desc is "Burns you 1 HP per second unless you have 100K
  // strength" — a health system OofCubes does not have. §10 explicitly drops HP/candle
  // damage and re-specs the candle to halved gains, which is what §5.3 and lift.js
  // actually implement (CANDLE_BURN_FACTOR 0.5 below CANDLE_SAFE). §10 is the later and
  // more specific ruling, so it wins: the desc below describes the real effect and no
  // longer promises a mechanic the game cannot deliver. §5.5's "verbatim" instruction is
  // amended to except descs whose mechanic §10 removed. Reported.
  item("candle", "Candle", 10000, 20, "gym", "r1",
    "Tiny but literally on fire. Too hot to grip - halves your gains below 100K Strength!",
    [
      prim("cylinder", [0.18, 0.6, 0.18], [0, 0, 0], "#f2f4fa", "plastic"),
      prim("cylinder", [0.02, 0.1, 0.02], [0, 0.35, 0], "#2e3345", "plastic"),
      prim("sphere", [0.09, 0.14, 0.09], [0, 0.46, 0], "#ff8c1a", "neon"),
      prim("cylinder", [0.22, 0.05, 0.22], [0, -0.32, 0], "#e8a33d", "metal"),
    ]),

  item("tv", "TV", 35000, 35, "gym", "r1",
    "A big flatscreen TV, remote included. Do NOT drop it.",
    [
      prim("box", [2.4, 1.4, 0.12], [0, 0, 0], "#1b1b1b", "plastic"),
      prim("box", [2.2, 1.2, 0.06], [0, 0, -0.05], "#35a3e0", "neon"),
      prim("box", [0.5, 0.1, 0.3], [0, -0.8, 0], "#2e3345", "plastic"),
      prim("box", [1.2, 0.06, 0.3], [0, -0.88, 0], "#2e3345", "plastic"),
    ]),

  item("house", "House", 1e6, 50, "gym", "r1",
    "An entire house. Roof, door, windows, chimney. You lift it.",
    [
      prim("box", [2.6, 1.6, 2.2], [0, 0, 0], "#e8a33d", "plastic"),
      prim("cone", [1.9, 1.1, 1.9], [0, 1.35, 0], "#d94436", "plastic", { rotation: [0, 45, 0] }),
      prim("box", [0.5, 0.9, 0.08], [0, -0.35, -1.11], "#8c5a3c", "wood"),
      prim("box", [0.5, 0.5, 0.08], [0.8, 0.2, -1.11], "#bfe8ff", "glass"),
      prim("box", [0.5, 0.5, 0.08], [-0.8, 0.2, -1.11], "#bfe8ff", "glass"),
      prim("box", [0.35, 0.7, 0.35], [0.9, 1.5, 0.5], "#9aa3b8", "plastic"),
    ]),

  item("cybertruck", "Cybertruck", 2e6, 70, "gym", "r2",
    "A stainless steel triangle truck. Shatterproof windows not included.",
    [
      prim("box", [1.2, 0.5, 3.0], [0, -0.2, 0], "#c7cdd9", "metal"),
      prim("box", [1.1, 0.45, 1.6], [0, 0.25, 0.2], "#c7cdd9", "metal", { rotation: [-12, 0, 0] }),
      prim("box", [1.0, 0.35, 1.3], [0, 0.3, 0.15], "#2e3345", "glass", { rotation: [-12, 0, 0], transparency: 0.3 }),
      prim("cylinder", [0.3, 0.25, 0.3], [0.62, -0.45, 0.95], "#1b1b1b", "plastic", { rotation: [0, 0, 90] }),
      prim("cylinder", [0.3, 0.25, 0.3], [0.62, -0.45, -0.95], "#1b1b1b", "plastic", { rotation: [0, 0, 90] }),
      prim("cylinder", [0.3, 0.25, 0.3], [-0.62, -0.45, 0.95], "#1b1b1b", "plastic", { rotation: [0, 0, 90] }),
      prim("cylinder", [0.3, 0.25, 0.3], [-0.62, -0.45, -0.95], "#1b1b1b", "plastic", { rotation: [0, 0, 90] }),
    ]),

  item("tree", "Tree", 5e6, 100, "gym", "r2",
    "A full-grown tree, roots and all. Nature is heavy.",
    [
      prim("cylinder", [0.3, 1.6, 0.3], [0, -0.7, 0], "#8c5a3c", "wood"),
      prim("sphere", [1.3, 1.1, 1.3], [0, 0.6, 0], "#37a04c", "plastic"),
      prim("sphere", [0.9, 0.8, 0.9], [0.5, 1.1, 0.3], "#2f8a40", "plastic"),
      prim("sphere", [0.7, 0.6, 0.7], [-0.55, 1.0, -0.2], "#43b45a", "plastic"),
    ]),

  item("train", "Train", 25e6, 400, "gym", "r2",
    "A whole locomotive with a coal car. All aboard the gain train.",
    [
      prim("box", [1.2, 1.2, 3.6], [0, 0, 0], "#d94436", "metal"),
      prim("cylinder", [0.55, 1.2, 0.55], [0, 0.3, -1.4], "#2e3345", "metal", { rotation: [90, 0, 0] }),
      prim("box", [1.3, 0.5, 1.2], [0, 0.85, 1.1], "#2e3345", "metal"),
      prim("cylinder", [0.18, 0.5, 0.18], [0, 0.95, -1.4], "#1b1b1b", "metal"),
      prim("cylinder", [0.32, 0.2, 0.32], [0.62, -0.65, -1.2], "#1b1b1b", "metal", { rotation: [0, 0, 90] }),
      prim("cylinder", [0.32, 0.2, 0.32], [0.62, -0.65, 0], "#1b1b1b", "metal", { rotation: [0, 0, 90] }),
      prim("cylinder", [0.32, 0.2, 0.32], [0.62, -0.65, 1.2], "#1b1b1b", "metal", { rotation: [0, 0, 90] }),
      prim("cylinder", [0.32, 0.2, 0.32], [-0.62, -0.65, -1.2], "#1b1b1b", "metal", { rotation: [0, 0, 90] }),
      prim("cylinder", [0.32, 0.2, 0.32], [-0.62, -0.65, 0], "#1b1b1b", "metal", { rotation: [0, 0, 90] }),
      prim("cylinder", [0.32, 0.2, 0.32], [-0.62, -0.65, 1.2], "#1b1b1b", "metal", { rotation: [0, 0, 90] }),
    ]),

  item("moon", "Moon", 125e6, 550, "space", "space",
    "The actual Moon. Craters, dust and all. One small lift for man...",
    [
      prim("sphere", [1.6, 1.6, 1.6], [0, 0, 0], "#c7cdd9", "plastic", { spin: 20 }),
      prim("sphere", [0.35, 0.12, 0.35], [0.6, 0.5, -1.35], "#9aa3b8", "plastic"),
      prim("sphere", [0.5, 0.14, 0.5], [-0.5, -0.3, -1.3], "#9aa3b8", "plastic"),
      prim("sphere", [0.25, 0.1, 0.25], [0.2, -0.7, -1.35], "#9aa3b8", "plastic"),
    ]),

  item("pluto", "Pluto", 225e6, 750, "space", "space",
    "Still a planet in our hearts. Icy, tiny, extremely liftable.",
    [
      prim("sphere", [1.2, 1.2, 1.2], [0, 0, 0], "#d9b48f", "plastic", { spin: 25 }),
      prim("sphere", [0.5, 0.2, 0.4], [0, 0.35, -1.0], "#f2f4fa", "plastic"),
    ]),

  item("mars", "Mars", 350e6, 1000, "space", "space",
    "The red planet, polar ice caps included. Rover sold separately.",
    [
      prim("sphere", [1.4, 1.4, 1.4], [0, 0, 0], "#e8641b", "plastic", { spin: 22 }),
      prim("sphere", [0.4, 0.15, 0.4], [0, 1.28, 0], "#f2f4fa", "plastic"),
      prim("sphere", [0.4, 0.15, 0.4], [0, -1.28, 0], "#f2f4fa", "plastic"),
    ]),

  item("earth", "Earth", 500e6, 1500, "space", "space",
    "Home sweet home - oceans, continents, clouds. Careful with it.",
    [
      prim("sphere", [1.5, 1.5, 1.5], [0, 0, 0], "#2a67c9", "plastic", { spin: 18 }),
      prim("sphere", [0.6, 0.25, 0.5], [0.5, 0.4, -1.25], "#37a04c", "plastic"),
      prim("sphere", [0.5, 0.2, 0.6], [-0.55, -0.25, -1.2], "#37a04c", "plastic"),
      prim("sphere", [1.53, 0.3, 1.53], [0, 0.6, 0], "#f2f4fa", "plastic", { transparency: 0.55 }),
    ]),

  item("neptune", "Neptune", 750e6, 2500, "space", "space",
    "A deep-blue ice giant with howling winds. Very cold. Very heavy.",
    [
      prim("sphere", [1.6, 1.6, 1.6], [0, 0, 0], "#4b56d2", "plastic", { spin: 26 }),
      prim("sphere", [1.63, 0.25, 1.63], [0, 0.2, 0], "#8ea0ff", "plastic", { transparency: 0.4 }),
    ]),

  item("jupiter", "Jupiter", 1e9, 4000, "space", "space",
    "The biggest planet, Great Red Spot and all. 318 Earths of gains.",
    [
      prim("sphere", [1.9, 1.9, 1.9], [0, 0, 0], "#e8a33d", "plastic", { spin: 30 }),
      prim("sphere", [1.93, 0.3, 1.93], [0, 0.35, 0], "#9b6a3f", "plastic", { transparency: 0.25 }),
      prim("sphere", [1.93, 0.25, 1.93], [0, -0.3, 0], "#d9b48f", "plastic", { transparency: 0.25 }),
      prim("sphere", [0.5, 0.35, 0.2], [0.9, -0.5, -1.6], "#d94436", "plastic"),
    ]),

  item("sun", "Sun", 3e9, 8000, "space", "space",
    "A blazing ball of plasma. Do not look directly at your dumbbell.",
    [
      prim("sphere", [2.0, 2.0, 2.0], [0, 0, 0], "#f7c948", "neon", { spin: 15 }),
      prim("sphere", [2.15, 2.15, 2.15], [0, 0, 0], "#ff8c1a", "neon", { transparency: 0.7 }),
      prim("torus", [2.5, 0.06, 0], [0, 0, 0], "#ff8c1a", "neon", { rotation: [90, 0, 0], transparency: 0.5, spin: 40 }),
    ]),

  item("blackhole", "Black Hole", 100e12, 14000, "space", "r4",
    "Infinite density, swirling accretion disk. It lifts back.",
    [
      prim("sphere", [1.2, 1.2, 1.2], [0, 0, 0], "#0c0c14", "plastic"),
      prim("torus", [1.9, 0.22, 0], [0, 0, 0], "#ff8c1a", "neon", { rotation: [80, 0, 0], spin: 90 }),
      prim("torus", [2.4, 0.1, 0], [0, 0, 0], "#6b3fa0", "neon", { rotation: [80, 0, 0], transparency: 0.4, spin: -60 }),
    ]),

  item("protein", "Protein Bar", 0, 0.1, "dumbbell", "dumbbell",
    "Chocolate flavored, 20g protein. The humble beginning... again.",
    [
      prim("box", [0.9, 0.25, 0.45], [0, 0, 0], "#8c5a3c", "plastic"),
      prim("box", [0.2, 0.27, 0.47], [0, 0, 0], "#f7c948", "plastic"),
      prim("box", [0.92, 0.1, 0.46], [0, 0.14, 0], "#6b4a2c", "plastic"),
    ]),

  item("dumbbell", "Dumbbell", 1000, 1, "dumbbell", "dumbbell",
    "A real hex dumbbell. Finally, actual gym equipment.",
    [
      prim("cylinder", [0.09, 1.1, 0.09], [0, 0, 0], "#9aa3b8", "metal", { rotation: [0, 0, 90] }),
      prim("cylinder", [0.38, 0.3, 0.38], [0.55, 0, 0], "#2e3345", "metal", { rotation: [0, 0, 90] }),
      prim("cylinder", [0.38, 0.3, 0.38], [-0.55, 0, 0], "#2e3345", "metal", { rotation: [0, 0, 90] }),
      prim("cylinder", [0.3, 0.12, 0.3], [0.78, 0, 0], "#2e3345", "metal", { rotation: [0, 0, 90] }),
      prim("cylinder", [0.3, 0.12, 0.3], [-0.78, 0, 0], "#2e3345", "metal", { rotation: [0, 0, 90] }),
    ]),

  item("pushups", "Pushup Bars", 100e3, 5, "dumbbell", "dumbbell",
    "A pair of steel pushup bars. The floor is your enemy now.",
    [
      prim("cylinder", [0.06, 0.9, 0.06], [0.5, 0.25, 0], "#c7cdd9", "metal", { rotation: [90, 0, 0] }),
      prim("cylinder", [0.06, 0.9, 0.06], [-0.5, 0.25, 0], "#c7cdd9", "metal", { rotation: [90, 0, 0] }),
      prim("box", [0.5, 0.08, 0.2], [0.5, -0.15, 0.3], "#2e3345", "plastic"),
      prim("box", [0.5, 0.08, 0.2], [0.5, -0.15, -0.3], "#2e3345", "plastic"),
      prim("box", [0.5, 0.08, 0.2], [-0.5, -0.15, 0.3], "#2e3345", "plastic"),
      prim("box", [0.5, 0.08, 0.2], [-0.5, -0.15, -0.3], "#2e3345", "plastic"),
    ]),

  item("situps", "Situp Bench", 1e9, 150, "dumbbell", "dumbbell",
    "An inclined situp bench with padded rollers. Core of steel.",
    [
      prim("box", [0.9, 0.15, 2.6], [0, 0.3, 0], "#d94436", "plastic", { rotation: [-18, 0, 0] }),
      prim("box", [0.8, 0.5, 0.15], [0, -0.25, 1.1], "#2e3345", "metal"),
      prim("cylinder", [0.16, 0.5, 0.16], [0, 0.8, -1.0], "#f7c948", "plastic", { rotation: [0, 0, 90] }),
      prim("cylinder", [0.16, 0.5, 0.16], [0, 0.55, -1.15], "#f7c948", "plastic", { rotation: [0, 0, 90] }),
      prim("box", [0.7, 0.1, 0.5], [0, -0.3, -0.9], "#2e3345", "metal"),
    ]),

  item("universe", "The Universe", 10e15, 10000, "dumbbell", "dumbbell",
    "Every galaxy, star and atom in one swirling ball. Yes, you are also in it.",
    [
      prim("sphere", [1.8, 1.8, 1.8], [0, 0, 0], "#0c0c14", "plastic", { transparency: 0.15, spin: 12 }),
      prim("sphere", [0.25, 0.25, 0.25], [0.7, 0.4, -0.6], "#f2f4fa", "neon"),
      prim("sphere", [0.18, 0.18, 0.18], [-0.6, -0.3, 0.5], "#35e0e0", "neon"),
      prim("sphere", [0.15, 0.15, 0.15], [0.2, -0.7, -0.4], "#e0245e", "neon"),
      prim("torus", [1.1, 0.05, 0], [0, 0, 0], "#6b3fa0", "neon", { rotation: [60, 0, 30], transparency: 0.3, spin: 25 }),
    ]),

  item("lavaball", "Lava Ball", 10e15, 15000, "lava", "lava",
    "A roiling sphere of molten rock. Oven mitts strongly recommended.",
    [
      prim("sphere", [1.4, 1.4, 1.4], [0, 0, 0], "#ff5722", "neon", { spin: 18 }),
      prim("sphere", [1.45, 1.45, 1.45], [0, 0, 0], "#2e1510", "plastic", { transparency: 0.45 }),
      prim("sphere", [0.3, 0.2, 0.3], [0.5, 0.6, -1.15], "#f7c948", "neon"),
    ]),

  item("lavaplanet", "Lava Planet", 1e18, 125000, "lava", "lava",
    "An entire world of magma oceans and obsidian crust.",
    [
      prim("sphere", [1.8, 1.8, 1.8], [0, 0, 0], "#4a2018", "plastic", { spin: 14 }),
      prim("sphere", [0.7, 0.25, 0.6], [0.5, 0.5, -1.5], "#ff5722", "neon"),
      prim("sphere", [0.6, 0.2, 0.7], [-0.6, -0.4, -1.45], "#ff8c1a", "neon"),
      prim("torus", [1.85, 0.08, 0], [0, 0, 0], "#ff5722", "neon", { rotation: [90, 0, 0], spin: 30 }),
    ]),

  item("lavaeclipse", "Lava Eclipse", 10e18, 150000, "lava", "lava",
    "A burning sun eclipsed by a molten moon - a ring of pure fire.",
    [
      prim("sphere", [1.7, 1.7, 1.7], [0, 0, 0], "#ff8c1a", "neon"),
      prim("sphere", [1.5, 1.5, 1.5], [0, 0, -0.5], "#1b0e0a", "plastic"),
      prim("torus", [1.75, 0.12, 0], [0, 0, -0.5], "#ff5722", "neon", { rotation: [0, 0, 0], spin: 20 }),
    ]),

  item("gdstar", "GD Star", 1e21, 450000, "lava", "lava",
    "The legendary golden star. The final lift. Shines brighter than the sun.",
    [
      prim("sphere", [1.2, 1.2, 1.2], [0, 0, 0], "#f7c948", "neon", { spin: 25 }),
      prim("cone", [0.3, 0.9, 0.3], [0, 1.4, 0], "#f7c948", "neon", { rotation: [0, 0, 0] }),
      prim("cone", [0.3, 0.9, 0.3], [1.33, 0.43, 0], "#f7c948", "neon", { rotation: [0, 0, -72] }),
      prim("cone", [0.3, 0.9, 0.3], [0.82, -1.13, 0], "#f7c948", "neon", { rotation: [0, 0, -144] }),
      prim("cone", [0.3, 0.9, 0.3], [-0.82, -1.13, 0], "#f7c948", "neon", { rotation: [0, 0, 144] }),
      prim("cone", [0.3, 0.9, 0.3], [-1.33, 0.43, 0], "#f7c948", "neon", { rotation: [0, 0, 72] }),
      prim("torus", [1.9, 0.06, 0], [0, 0, 0], "#f2f4fa", "neon", { rotation: [90, 0, 0], transparency: 0.4, spin: -35 }),
    ]),
]);

const ITEMS_BY_ID = new Map(ITEMS.map((it) => [it.id, it]));

// §5.13's shop-row lock text, keyed by an item's `req`. §5.13 gives explicit strings
// for r1/space/dumbbell/lava/r4 but never prints one for "r2" even though three
// items (cybertruck/tree/train) gate on it — an omission against the r1/r4 pattern
// this table otherwise follows. "Requires Rebirth 2" completes that pattern; flagged
// as a spec gap rather than silently assumed.
export const REQ_GATE_TEXT = Object.freeze({
  r1: "Requires Rebirth 1",
  r2: "Requires Rebirth 2",
  r4: "Requires Rebirth 4",
  space: "Requires the Space World (Rebirth 3)",
  dumbbell: "Requires the Dumbbell World (Rebirth 5)",
  lava: "Requires the Lava Zone (Rebirth 6)",
});

// ---------------------------------------------------------------------------
// §5.6 ZONES — one row per zone. §5.6 gives this as prose tables (center/ground/
// structures) plus a separate ARRIVAL table and a Portals table; no formal record
// schema is named for "a zone" anywhere in §3, so this shape is this file's own
// judgement call, built to carry exactly what worlds.js's `travel`/`zoneOf` (§4)
// need: footprint bounds for zoneOf, arrival pose + gate flag + lock toast for
// travel, and the region id place.json also uses so the two files agree by
// construction (both owned by this task). `icon` values are §5.13 element 7's
// Travel-panel emoji, reused here rather than re-declared in ui.js.
// ---------------------------------------------------------------------------

function zone(id, name, icon, center, size, arrival, arrivalYaw, req, lockedMessage) {
  const [cx, cz] = [center[0], center[2]];
  const [hw, hd] = [size[0] / 2, size[1] / 2];
  return Object.freeze({
    id,
    name,
    icon,
    center: Object.freeze(center.slice()),
    size: Object.freeze(size.slice()),
    regionId: "zone_" + id,
    bounds: Object.freeze({
      min: Object.freeze([cx - hw, -20, cz - hd]),
      max: Object.freeze([cx + hw, 100, cz + hd]),
    }),
    arrival: Object.freeze(arrival.slice()),
    arrivalYaw,
    req,
    lockedMessage,
  });
}

export const ZONES = Object.freeze([
  zone("gym", "Gym", "🏟️", [0, 0, 0], [300, 300], [0, 0.5, 24], 180, null, null),
  zone("space", "Space World", "🪐", [-700, 0, 0], [300, 300], [-700, 1, 80], 180,
    "spaceUnlocked", "Reach Rebirth 3 to unlock the SPACE WORLD!"),
  zone("dumbbell", "Dumbbell World", "🏋️", [0, 0, -700], [300, 300], [0, 1, -620], 0,
    "dumbbellUnlocked", "Buy Rebirth 5 to unlock the DUMBBELL WORLD!"),
  // Lava's footprint is 200x200 per §5.6 (the other three are 300x300).
  zone("lava", "Lava Zone", "🌋", [700, 0, 0], [200, 200], [640, 1, 0], 90,
    "lavaUnlocked", "Reach Rebirth 6 to open the LAVA ZONE!"),
]);

const ZONES_BY_ID = new Map(ZONES.map((z) => [z.id, z]));

// §5.6's Portals table, verbatim: touchEvent name, fill color and the toast/gate a
// non-lava portal shows when its `req` flag is false. The lava gate is special
// (canCollide toggles instead of a teleport-refusal toast — §5.6) so it is not a
// travel-portal row here; ZONES.lava already carries its lockedMessage for the
// Travel panel, and place.json encodes the gate's initial canCollide/transparency
// directly since that half is static world state, not a lookup table.
export const PORTAL_EVENTS = Object.freeze({
  portal_space: "space",
  portal_dumbbell: "dumbbell",
  portal_lava: "lava",
  portal_gym: "gym",
});

// ---------------------------------------------------------------------------
// §5.7 REBIRTHS — the 7 rows, §3.4 schema fields verbatim (id/name/cost/wipeItems/
// wipeLevel/setLevel/grants/blurb) plus one addition of this file's own: `gate`, a
// pure `(state) => bool` mirroring §5.7's "gate (beyond cost)" column exactly. §3.4
// only specifies the save-mutation fields; the gate predicates are prose in §5.7's
// table and have to live *somewhere* machine-readable for tryRebirth to consume
// without re-deriving them — encoding them here (next to the numbers they gate)
// keeps the one normative source in one file instead of two.
//
// `wipeItems:false` rows (r5b, r6) still zero `strength` — that is unconditional on
// every successful rebirth per §5.7's wipe(items) definition and the "strength→0
// only" phrasing on those two rows; there is no separate "strength-only" flag
// because none is needed.
// ---------------------------------------------------------------------------

function rebirth(id, name, cost, wipeItems, wipeLevel, setLevel, grants, blurb, gate) {
  return Object.freeze({ id, name, cost, wipeItems, wipeLevel, setLevel, grants, blurb, gate });
}

export const REBIRTHS = Object.freeze([
  rebirth("r1", "Rebirth 1", 2500, true, false, 1, null,
    "x3 multiplier. Resets your Strength and items.",
    (s) => s.rebirthLevel === 0),
  rebirth("r2", "Rebirth 2", 1.2e6, true, false, 2, "auto",
    "x15 multiplier + AUTOCLICKER (auto-lift every 0.2s, forever). Resets Strength and items.",
    (s) => s.rebirthLevel === 1),
  rebirth("r3", "Rebirth 3", 100e6, true, false, 3, "space",
    "x125 multiplier + SPACE WORLD (permanent extra x3). Resets Strength and items.",
    (s) => s.rebirthLevel === 2),
  rebirth("r4", "Rebirth 4", 15e9, true, false, 4, null,
    "x50,000 multiplier. Resets Strength and items.",
    (s) => s.rebirthLevel === 3),
  rebirth("r5", "Rebirth 5", 1e15, true, true, null, "dumbbell",
    "Unlocks the DUMBBELL WORLD... but resets Strength, items AND all rebirths. The ultimate sacrifice.",
    (s) => s.rebirthLevel === 4 && !s.dumbbellUnlocked),
  rebirth("r5b", "Rebirth 5 ★", 1e15, false, false, null, "dumbbellMulti",
    "Permanent x50,000 DUMBBELL MULTI. Only takes your Strength this time.",
    (s) => s.dumbbellUnlocked && !s.dumbbellMulti),
  rebirth("r6", "Rebirth 6", 50e15, false, false, null, "lava",
    "Permanent x40 multi + opens the LAVA ZONE gate. Takes your Strength only.",
    (s) => s.dumbbellMulti && !s.lavaUnlocked),
]);

const REBIRTHS_BY_ID = new Map(REBIRTHS.map((r) => [r.id, r]));

// ---------------------------------------------------------------------------
// §5.8 TITLES — the 11 rows, on LIFETIME strength. Ascending threshold order is
// binding (titleForLifetime below assumes it, as does the "crosses a threshold"
// unlock check in state.js).
// ---------------------------------------------------------------------------

function title(threshold, name, color) {
  return Object.freeze({ threshold, name, color });
}

export const TITLES = Object.freeze([
  title(1, "Noobie", "#aaaaaa"),
  title(1e3, "Starter", "#ffffff"),
  title(2e3, "Beginner", "#aaff7f"),
  title(3e3, "Rookie", "#3cc83c"),
  title(5e5, "Pro", "#00e6ff"),
  title(150e6, "Hacker", "#00ff46"),
  title(5e9, "1010101", "#00ff00"),
  title(125e9, "Bot", "#648cd2"),
  title(200e9, "Hecker", "#ff2828"),
  title(100e12, "God", "#ffd700"),
  title(1e20, "The Rock", "#a0a09b"),
]);

// ---------------------------------------------------------------------------
// §5.9 SURGES — the 21 mobility-milestone thresholds, on CURRENT strength. A flat
// number array (no record wrapper) matching §5.9's own presentation; `steps =
// count(thresholds <= strength)` per §5.9, implemented below as surgeStepsForStrength.
// ---------------------------------------------------------------------------

export const SURGES = Object.freeze([
  1e3, 1e4, 1e5, 1e6, 5e6, 1e7, 1e8, 1e9, 1e10, 1e11,
  1e12, 1e13, 1e14, 1e15, 1e16, 1e17, 1e18, 1e19, 1e20, 1e21, 1e22,
]);

// ---------------------------------------------------------------------------
// §5.11's ten invented rivals (NoodleArms … xX_GymDemon_Xx) and their doubling formula
// are withdrawn (amended 2026-08-27). The TOP LIFTERS board is built from the real
// players in the room now — see board.js `entries`. Nothing replaced them here because
// nothing here can know who is online; that is the net service's job, and the board
// reads it through ctx.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// §3.7/§5.10 REWARD_AURAS — the 4 grant-only Catalog items this Place defines.
// `appearance` fields are §5.10's table, verbatim (spec 05 §3.6's aura schema);
// only the fields §5.10 actually lists for each row are present; the rest take
// spec 05's own appearance defaults, which this file does not know or restate.
// `trigger` is this file's own addition (not part of the §3.7 catalog-item schema)
// documenting §5.10's "Grant triggers" table in a form state.js can act on without
// re-deriving it; the actual `PLACE_REWARDS` append into catalog-data.js is task
// L1's *other* file (out of this task's owned-files list — see final report).
// ---------------------------------------------------------------------------

function rewardAura(id, name, rarity, appearance, trigger) {
  return Object.freeze({
    id, name, rarity, grantOnly: true, price: null, sourcePlace: "lifting",
    appearance: Object.freeze(appearance), trigger,
  });
}

export const REWARD_AURAS = Object.freeze([
  rewardAura("aura_swole", "Swole Aura", "rare", {
    motion: "rise", rate: 10, colors: Object.freeze(["#ff8c1a", "#d94436"]),
    size: Object.freeze([0.18, 0.06]), lifetime: 1.2, radius: 1.1, speed: 1.6,
    height: 0.1, wobble: 0.15,
  }, "mega100k"),
  rewardAura("aura_tide", "Riptide Aura", "epic", {
    motion: "orbit", count: 7, colors: Object.freeze(["#35a3e0"]),
    size: Object.freeze([0.25, 0.25]), radius: 1.7, speed: 120, height: 1.8, bob: 0.5,
  }, "spaceUnlocked"),
  rewardAura("aura_gravity", "Gravity Well", "epic", {
    motion: "pulse", count: 8, colors: Object.freeze(["#6b3fa0", "#0c0c14"]),
    size: Object.freeze([0.2, 0.05]), lifetime: 1.4, radius: 1.5, speed: 2.2, height: 0.3,
  }, "dumbbellMulti"),
  rewardAura("aura_ascended", "Ascended Aura", "legendary", {
    motion: "twinkle", count: 20, rate: 16, colors: Object.freeze(["#f7c948", "#ffffff"]),
    size: Object.freeze([0.16, 0.16]), lifetime: 0.7, radius: 1.6,
  }, "lavaUnlocked+gdstar"),
]);

const REWARD_AURAS_BY_ID = new Map(REWARD_AURAS.map((a) => [a.id, a]));

// ---------------------------------------------------------------------------
// §5.12 OOFBUX_AWARDS — the 15 one-time Oofbux payouts (8 lifetime milestones + 7
// rebirth-success keys). `kind:"lifetime"` rows fire when `lifetime` first reaches
// `threshold`; `kind:"rebirth"` rows fire once when the named REBIRTHS id succeeds.
// Sum: 10+25+50+75+100+100+100+150 = 610 milestone Oofbux + 7*25 = 175 rebirth
// Oofbux = 785, matching §5.12's stated lifetime maximum exactly (self-checked,
// no discrepancy here).
// ---------------------------------------------------------------------------

export const OOFBUX_AWARDS = Object.freeze([
  Object.freeze({ key: "m1e3", amount: 10, kind: "lifetime", threshold: 1e3 }),
  Object.freeze({ key: "m1e5", amount: 25, kind: "lifetime", threshold: 1e5 }),
  Object.freeze({ key: "m1e6", amount: 50, kind: "lifetime", threshold: 1e6 }),
  Object.freeze({ key: "m1e9", amount: 75, kind: "lifetime", threshold: 1e9 }),
  Object.freeze({ key: "m1e12", amount: 100, kind: "lifetime", threshold: 1e12 }),
  Object.freeze({ key: "m1e15", amount: 100, kind: "lifetime", threshold: 1e15 }),
  Object.freeze({ key: "m1e18", amount: 100, kind: "lifetime", threshold: 1e18 }),
  Object.freeze({ key: "m1e21", amount: 150, kind: "lifetime", threshold: 1e21 }),
  Object.freeze({ key: "r1", amount: 25, kind: "rebirth", id: "r1" }),
  Object.freeze({ key: "r2", amount: 25, kind: "rebirth", id: "r2" }),
  Object.freeze({ key: "r3", amount: 25, kind: "rebirth", id: "r3" }),
  Object.freeze({ key: "r4", amount: 25, kind: "rebirth", id: "r4" }),
  Object.freeze({ key: "r5", amount: 25, kind: "rebirth", id: "r5" }),
  Object.freeze({ key: "r5b", amount: 25, kind: "rebirth", id: "r5b" }),
  Object.freeze({ key: "r6", amount: 25, kind: "rebirth", id: "r6" }),
]);

// ---------------------------------------------------------------------------
// §5.12 BADGES — the 13 badge ids and their trigger, in prose (matching §5.12's own
// table text) rather than as predicate functions: unlike REBIRTHS.gate, most of
// these fire on transient events (a purchase, a board-render rank) that aren't a
// pure function of saved state alone, so a description is the honest contract here.
// Display name/icon are NOT this file's job — spec 09 §9 assigns the "13-row append
// to badges.js's marked BADGES region" (the id -> name/icon/description registry)
// to task L5, a file this task does not own.
// ---------------------------------------------------------------------------

export const BADGES = Object.freeze([
  Object.freeze({ id: "first-lift", trigger: "first lift ever (stats.lifts === 1)" }),
  Object.freeze({ id: "club-100k", trigger: "mega100k set" }),
  Object.freeze({ id: "rebirth1", trigger: "rebirth r1 success" }),
  Object.freeze({ id: "rebirth2", trigger: "rebirth r2 success" }),
  Object.freeze({ id: "rebirth3", trigger: "rebirth r3 success" }),
  Object.freeze({ id: "rebirth4", trigger: "rebirth r4 success" }),
  Object.freeze({ id: "rebirth5", trigger: "rebirth r5 success" }),
  Object.freeze({ id: "rebirth6", trigger: "rebirth r6 success" }),
  Object.freeze({ id: "dumbbell-multi", trigger: "rebirth r5b success" }),
  Object.freeze({ id: "gd-star", trigger: "buying gdstar" }),
  Object.freeze({ id: "all-items", trigger: "items contains all 28 ITEMS ids" }),
  Object.freeze({ id: "title-rock", trigger: 'unlocking title "The Rock"' }),
  Object.freeze({ id: "ghost-king", trigger: "rank 1 on the board at render time" }),
]);

// ---------------------------------------------------------------------------
// §6 TUNING — every constant of §6's table, quoted by name; nothing here re-derives
// a value. `LADDER` is duplicated from §5.2's recomputeMulti pseudocode into this
// same object because §6 lists it as one of its own rows.
//
// SPEC DISCREPANCY (transcribed as-is, not fixed — see final report): §5.16's
// pacing table states the endgame "full stack" multiplier as "x20,000,000" at the
// GD Star milestone. Multiplying this section's own constants along the actual
// reachable rebirth path (r6 done => rebirthLevel 0 per r5's wipeLevel, spaceUnlocked,
// dumbbellMulti, lavaUnlocked, mega100k all true) gives
// LADDER[0](1) * SPACE_MULT(3) * DUMBBELL_MULT(50000) * LAVA_MULT(40) * MEGA_MULT(10)
// = 60,000,000 — exactly 3x (a whole SPACE_MULT factor) above §5.16's stated number.
// 50000*40*10 alone equals 20,000,000, suggesting §5.16 may have been written
// assuming SPACE_MULT does not compound with the rest, or a different rebirthLevel
// at endgame than r5's own wipeLevel effect produces. Not resolved here per the
// task's instruction to transcribe normative numbers, not fix them.
// ---------------------------------------------------------------------------

export const TUNING = Object.freeze({
  LADDER: Object.freeze({ 0: 1, 1: 3, 2: 15, 3: 125, 4: 50000 }),
  SPACE_MULT: 3,
  DUMBBELL_MULT: 50000,
  LAVA_MULT: 40,
  MEGA_MULT: 10,
  MEGA_THRESHOLD: 100000,
  CANDLE_SAFE: 100000,
  CANDLE_BURN_FACTOR: 0.5,
  BURN_TOAST_S: 4,
  MANUAL_RATE_MAX: 8,
  HOLD_DELAY_S: 0.4,
  HOLD_INTERVAL_S: 0.25,
  AUTO_INTERVAL_S: 0.2,
  AUTO_SFX_EVERY: 4,
  LIFT_ANIM_S: Object.freeze({ total: 0.45, dip: 0.10, press: 0.15, lockout: 0.10, return: 0.10 }),
  LIFT_OVERHEAD_RISE: 3.0,
  CARRY_HEIGHT_BASE: 2.2,   // full offset is CARRY_HEIGHT_BASE + halfHeight (§5.4)
  CARRY_FORWARD_BASE: 1.0,  // full offset is CARRY_FORWARD_BASE + halfDepth (§5.4)
  // -1 puts the carried item on the avatar BACK; +1 is the original in-front pose.
  // A constant rather than a flipped sign in lift.js so the choice is visible here with
  // the rest of the carry numbers.
  CARRY_SIDE: -1,
  SURGE_STEP_MOB: 0.2,
  SURGE_MOB_CAP: 3.0,
  BOARD_REDRAW_S: 5,
  DISPLAY_SCALE: 2,
  DISPLAY_SPIN_DEG_S: 24,
  TITLE_TAG_Y: 6.1,
  GAIN_TEXT_LIFE_S: 0.8,
  GAIN_TEXT_RISE_UNITS: 2.0,
  FX_POOL_TEXT: 10,
  FX_POOL_BURST: 40,
  SAVE_INTERVAL_S: 10,
  ZONE_TOAST_COOLDOWN_S: 30,
  PORTAL_TOUCH_COOLDOWN_S: 2,
  PLACE_JSON_MAX_PARTS: 800,
  OOFBUX_TOTAL_MAX: 785,
});

// ---------------------------------------------------------------------------
// Pure lookup helpers. Only names that don't collide with a function §4's module
// table assigns to another file (recomputeMulti, addStrength, spend, buyItem,
// equipItem, tryRebirth, equipTitle all belong to state.js; zoneOf belongs to
// worlds.js) — everything below is this file's own math/lookups over its own
// tables, offered so state.js/lift.js/board.js/ui.js/fx.js don't each re-derive it.
// ---------------------------------------------------------------------------

// Cash/Strength display: compact magnitude suffix, 2 decimal digits (trailing
// zeros trimmed), scientific-style suffix ladder up to Dc (1e33) since save.strength
// can reach ~1e30 (§3.1) — well past the K/M/B/T range other Places' fmt()s use.
// Matches §7 criterion 25's spot check: fmt(1234567) === "1.23M".
const FMT_UNITS = Object.freeze([
  [1e33, "Dc"], [1e30, "No"], [1e27, "Oc"], [1e24, "Sp"], [1e21, "Sx"],
  [1e18, "Qi"], [1e15, "Qa"], [1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"],
]);

function trimTrailingZeros(fixedStr) {
  if (fixedStr.indexOf(".") === -1) return fixedStr;
  return fixedStr.replace(/0+$/, "").replace(/\.$/, "");
}

export function fmt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a < 1000) {
    return sign + (Number.isInteger(a) ? String(a) : trimTrailingZeros(a.toFixed(2)));
  }
  for (const [unit, suffix] of FMT_UNITS) {
    if (a >= unit) {
      const scaled = a / unit;
      const text = scaled >= 100 ? String(Math.round(scaled)) : trimTrailingZeros(scaled.toFixed(2));
      return sign + text + suffix;
    }
  }
  return sign + String(a); // unreachable: a >= 1000 always matches the 1e3 tier
}

export function itemById(id) {
  return ITEMS_BY_ID.get(id) || null;
}

export function rebirthById(id) {
  return REBIRTHS_BY_ID.get(id) || null;
}

export function zoneById(id) {
  return ZONES_BY_ID.get(id) || null;
}

export function auraById(id) {
  return REWARD_AURAS_BY_ID.get(id) || null;
}

// §5.8: "Unlocked set is derived: unlocked(t) = lifetime >= t.threshold." Returns
// the highest-threshold unlocked title, or null below Noobie's threshold (1).
export function titleForLifetime(lifetime) {
  let best = null;
  for (const t of TITLES) {
    if (lifetime >= t.threshold && (best === null || t.threshold > best.threshold)) best = t;
  }
  return best;
}

// §5.9: "steps = count(thresholds <= strength)".
export function surgeStepsForStrength(strength) {
  let steps = 0;
  for (const threshold of SURGES) {
    if (strength >= threshold) steps++;
  }
  return steps;
}

// §5.9: "mob = min(3, 1 + 0.2*steps)".
export function surgeMobilityForSteps(steps) {
  return Math.min(TUNING.SURGE_MOB_CAP, 1 + TUNING.SURGE_STEP_MOB * steps);
}

