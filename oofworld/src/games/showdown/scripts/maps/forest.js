// src/games/showdown/scripts/maps/forest.js - Showdown (spec 25). The GIANT FOREST ground:
// spec 25 §3.2's first row, music `clash`, palette grass/wood/snow, "trees the size of
// towers ... a fallen trunk you can walk the length of, a mushroom ring, a three-level
// canopy walkway, a boulder field, and an `ice` streambed (there is no water material)".
//
// One export: build() -> MapBuild. world.js queues these defs at t = 20 s of the
// intermission and drains them at TUNE.DRAIN_PER_TICK into ctx.engine.parts.create, then
// removes every one of them again in release() (§3.4). Nothing here touches the world.
//
// PURE, and the MODULE CONTRACT means that literally: this file imports NOTHING - not
// three.js, not ctx, not even ../config.js - so tools/validate.js can import() it under
// plain Node and assert its geometry (rule 25:S1). The one thing that therefore looks
// like a house-rule break is deliberate and unavoidable: the counts and ceilings this
// builder has to obey live in TUNE and CANNOT be imported, so they are restated below as
// named constants, each citing the TUNE row it mirrors. They are copies, and the way the
// copies are kept honest is rule 25:S1 plus the invariant list in the banner over
// build()'s return - not a second source of truth.
//
// No `id` on any part. world.js stamps every def with its own monotonic uid(prefix) at
// materialize time, because partsById.set(def.id, record) is unchecked - a reused id
// silently overwrites the record and leaks the old collider, and a rebuilt part with a
// stable id is handed the PREVIOUS round's behaviorStateByPartId entry, so a re-built
// touchEvent weapon pad would come back carrying its old fired/cooldown (§3.4).
//
// Nothing here is randomised at run time. Variety comes from a seeded LCG created fresh
// inside build(), so every peer who materializes this ground gets the same forest and
// round N+1's forest is identical to round N's - which matters, because two clients fight
// on what they each built locally, and a boulder in one client's lane and not the other's
// is a divergence nobody can see.
//
// THE CHEAPEST DETAIL IN THE REPO, and the whole reason a 1200-part ground fits under a
// 900-collider ceiling: a part with canCollide:false and NO behaviour registers no
// collider at all (src/engine/parts.js registerColliderForDef). So every leaf, frond,
// firefly, rope rail, vine and moss patch here is canCollide:false over a small skeleton
// of colliding blockout, and a weapon pad is the third case - canCollide:false WITH a
// touchEvent behaviour, which registers a SENSOR (§7.2).
//
// Shape and material vocabulary is the closed 13 and 16 of spec 04 (src/engine/place.js
// SHAPES/MATERIALS). There is no water, no dirt, no stone and no leaves material, so the
// stream is `ice`, the earth is `grass` shaded brown, and the menhirs are `cobble` and
// `marble`. Round shapes are written [diameter, height, diameter] with size[0] === size[2]
// because that is what `cylinder` hard-requires and what every other round shape collides
// as (a cylinder of radius min(x,z)/2).

// =====================================================================================
// The band, restated from config.js (see the banner: this file may not import it)
// =====================================================================================

const OX = 900;              // MAPS[0].origin[0] - the forest band's centre in x (§3)
const OZ = 0;                // MAPS[0].origin[2]
const HALF = 180;            // the ground is 360 x 360 studs in XZ, side by side in XZ
                             // with the city (x 2100) and the forgotten city (x 3300) and
                             // never stacked, because killY is one number for the Place.

const GROUND_TOP = 0;        // the forest floor's walkable surface
const GROUND_THICK = 8;      // slab thickness; the floor's underside is y -8
const RIVER_TOP = -5;        // the ice streambed, five studs below the floor
const RAVINE_TOP = -14;      // the ravine floor, fourteen below
const RAVINE_WALL_H = 15;    // walls run y -15 .. 0, flush with the floor slabs' tops
const PERCH_Y = 90;          // TUNE.PERCH_ABOVE_ORIGIN[1]: landmarks.perch is
                             // origin + [0, 90, 0] (§3.2). It is where a DEAD FIGHTER
                             // watches from, and it needs a floor under it: the engine
                             // relocates you to your checkpoint unconditionally 1.0 s
                             // after death (§12), so a perch over open air would drop the
                             // spectator to killY on a loop.

// The two counts that are EXACT, mirrored from TUNE, and consumed below so the loops are
// what enforces them rather than a comment claiming they are enforced. Rule 25:S1 is the
// outer gate on both.
const WEAPON_PAD_COUNT = 12; // TUNE.WEAPON_PADS_PER_MAP (§7.2) - exactly this many
const WARDEN_SPOT_COUNT = 3; // TUNE.WARDEN_COUNT (§9) - exactly this many

// The ceilings and floors this ground is measured against are cited here rather than
// declared, because nothing in the builder computes anything from them and a constant no
// line of code reads is not a constraint, it is a claim:
//   - TUNE.MAP_PARTS_MAX 1800 and TUNE.MAP_COLLIDER_MAX 900 (§3.2). This ground comes in
//     at roughly 1565 parts of which about 362 register a collider, so there is room for
//     the Wardens, the held-weapon props for up to nineteen peers (§10.3) and the effect
//     parts, all of which are budgeted against the same 1800.
//   - §3.2 asks for at least twenty spawns, the ROOM_MAX of the relay, so no two fighters
//     can start inside each other; SPAWNS_LOCAL below carries twenty-four. §4.1 is what
//     assigns which fighter takes which index.
//   - TUNE.KILL_Y is -40 and it is the GROUNDS' death plane. The deepest geometry here is
//     the ravine floor slab's underside at -22 and the deepest walkable surface is the
//     ravine floor at -14, so a fighter who falls off the log bridge lands and fights on
//     rather than dying, and only leaving the ground's edge kills.

// The three levels of the canopy walkway (§3.2, "a three-level canopy walkway"). They sit
// under PERCH_Y on purpose: §3.2 wants the perch "clear of every rooftop", and a spectator
// parked at 90 should be looking DOWN on the top walkway rather than standing in it.
const CANOPY_Y = [26, 52, 78];

// =====================================================================================
// Palette. Subtly varied rather than one green slab: five floor greens, five barks, three
// canopy greens per tier of height, and browns for litter and bare earth. Lower-case hex
// only - the part schema's colour pattern is /^#[0-9a-f]{6}$/ and an uppercase digit is a
// hard error, not a warning.
// =====================================================================================

const FLOOR_GREENS = ["#3c6b38", "#436f3a", "#4a7a40", "#35602f", "#47733b", "#3f6c34"];
const LITTER_BROWNS = ["#6b5a36", "#5c4c2e", "#7a6742", "#4f4228"];
const BARKS = ["#5a4632", "#6b5340", "#4a3a2a", "#7a6148", "#3f3225", "#63503b"];
const CANOPY_GREENS = ["#2e5f33", "#3a7a3e", "#4f9450", "#28532c", "#437f40"];
const FIR_GREENS = ["#27512d", "#2f6136", "#356b3a"];
const FERN_GREENS = ["#4a8a46", "#58a04f", "#3f7d3d", "#6aa84f"];
const MOSS_GREENS = ["#5b7f3a", "#6d914a", "#4e7033"];
const ICE_BLUES = ["#a8d8e0", "#bfe6ec", "#8fc8d4", "#9ed2dc"];
const ROCK_GREYS = ["#8a8a82", "#74746c", "#9a9a92", "#807f77"];
const PLANK_WOODS = ["#8a6c45", "#7b5f3c", "#96784f"];

// =====================================================================================
// Reserved ground: the places nothing may be scattered into. Every entry is a LOCAL
// (x, z) plus a radius, and `blocked()` below is what every generated prop is filtered
// through. This is the mechanism behind three of §3.2's requirements at once - spawns not
// inside geometry, pads on reachable surfaces, warden spots "in the open".
// =====================================================================================

// The clearing at the map's middle. The stone circle stands in it, the perch floats 90
// studs over it, and nothing else grows here: it is the one place on the ground with clear
// sky, which is what makes it the fight's centre and the Wardens' approach.
const CLEARING = { x: 0, z: 10, r: 36 };

// Giant trees: [localX, localZ, trunkHeight, trunkRadius]. Every centre is within 130
// studs of the middle, so the rim where the spawns sit (|x| or |z| about 156) stays open
// ground: a fighter must never boot inside a trunk, and §4.1 teleports them onto these
// spawns with no clearance test of its own.
const TREES = [
  [-58, -110, 112, 9],   // north-west giant, the tallest on the ground
  [14, -118, 98, 8],     // north; carries the level-three deck
  [78, -96, 118, 10],    // north-east giant, the widest trunk
  [-118, -30, 88, 7],    // west, over the hut trail
  [-70, 52, 106, 9],     // south-west; two decks, levels one and two
  [62, 40, 92, 8],       // south-east of the clearing; two decks and the level-two stair
  [108, -28, 100, 9],    // east; the level-two to level-three ramp starts here
  [-120, 44, 84, 7],     // west, leaning over the ravine trail
  [-38, 86, 78, 7],      // south, on the ravine's north rim
  [96, 82, 110, 9],      // south-east giant
  [58, 114, 94, 8],      // east of the ravine's dead end
  [-30, -36, 96, 8],     // beside the clearing; the ground-to-canopy stair winds up it
];

// Which trunk carries a deck at which level, as [treeIndex, levelIndex].
const DECKS = [
  [11, 0], [4, 0], [5, 0], [8, 0],   // level one, y 26
  [5, 1], [9, 1], [6, 1], [4, 1],    // level two, y 52
  [2, 2], [1, 2], [0, 2],            // level three, y 78
];

// Walkway spans, as [treeA, treeB, levelIndex]. Every span is level, because a plank
// tilted with a compound Euler rotation is a wager about which way it ends up facing,
// and a walkway you cannot trust is worse than a staircase. Every CLIMB is a stair.
const SPANS = [
  [11, 4, 0], [4, 8, 0], [8, 5, 0], [5, 11, 0],   // level one loop, four sides
  [5, 9, 1], [9, 6, 1], [4, 5, 1],                // level two, the long east run
  [2, 1, 2], [1, 0, 2],                           // level three, the north crown
];

// The feature landmarks, all LOCAL. Named here so the scatter, the pads and the spawns
// can all agree about where they are.
const HUT = { x: -112, z: -122 };          // the ruined ranger hut
const MUSHROOMS = { x: 118, z: -130, r: 26 };
const BOULDER_FIELD = { x: 126, z: -8 };
const LOG_BRIDGE = { x: -40, z: 114, len: 60 };   // over the ravine, running along z
const FORD_WEST = { x: -70 };              // the west stepping-stone crossing of the river
const FORD_EAST = { x: 60 };               // the east one
const PLANK_FORD = { x: 140 };             // a fallen sapling laid across the river
const RAVINE_STAIR = { x: -140 };          // the scree stair down through the south wall
const RAVINE_EXIT = { z: 114 };            // the boulder steps up at the east dead end

// The river runs west to east across the whole ground; the ravine runs west to east too
// but only as far as x 40, so the east side of the map is one unbroken lane and the west
// side is cut in two. That asymmetry is the point: §3.2 wants sightlines broken and lanes
// between landmarks, and a symmetrical ground has neither.
const RIVER_Z0 = -76, RIVER_Z1 = -44;
const RAVINE_Z0 = 96, RAVINE_Z1 = 132, RAVINE_X1 = 40;

// The twenty-four spawns (§3.2 asks for at least twenty). All on the rim, all on floor at
// y 0 - deliberately NOT in the river or the ravine, so `groundYAt` is only ever consulted
// for props and a fighter never boots five studs under the water line. Spread around all
// four edges so no two are closer than about 36 studs.
const SPAWNS_LOCAL = [
  [-150, -156], [-110, -156], [-70, -156], [-30, -156],   // north edge
  [10, -156], [50, -156], [90, -156], [130, -156],
  [156, -120], [156, -84], [156, -20], [156, 20],         // east edge
  [156, 60], [156, 100],
  [120, 160], [60, 160], [0, 160], [-60, 160], [-120, 160],   // south edge
  [-156, 80], [-156, 36], [-156, -8], [-156, -100], [-156, -136],   // west edge
];

// The twelve weapon pads (§7.2: TUNE.WEAPON_PADS_PER_MAP, exactly). `y` is the FEET height
// of the surface the pad lies on, so a pad is always a flat disc a fighter walks over and
// never a thing to trip on. Spread over six kinds of surface on purpose - six on the floor,
// one in the stream, one on the ravine floor, one on the fallen log and three on the three
// canopy levels - so the rarity roll of §7.2 is not a thing you farm standing in one place.
//
// A PAD CARRIES NO TIER, and that is the spec rather than an omission. §7.2 rolls the
// rarity at TOUCH time from TUNE.RARITY_WEIGHTS, biased by §7.3's luck gate, and then picks
// uniformly among THIS map's rows of that tier; a per-pad tier would make the weights, the
// luck unlock and the "every tier represented on every ground" invariant of §7.1 all dead
// letters. The tier tag a PadDef has is `kind`, and for these twelve it is "weapon".
const PADS_LOCAL = [
  { id: "forest-altar", x: 0, z: 10, y: 3.2 },        // on the stone circle's altar dais
  { id: "forest-hut", x: -112, z: -122, y: 0.8 },     // the ranger hut's plank floor
  { id: "forest-log", x: -40, z: 114, y: 11.3 },      // mid-span on the fallen log
  { id: "forest-ford", x: -70, z: -58, y: 0.8 },      // a stepping stone in the stream
  { id: "forest-ravine", x: -140, z: 108, y: -14 },   // the ravine floor, deep and dark
  { id: "forest-boulder", x: 126, z: -8, y: 11.2 },   // the flat cap of the biggest boulder
  { id: "forest-deck-one", x: -58, z: 52, y: 26 },    // level one of the canopy walkway
  { id: "forest-deck-two", x: 84, z: 82, y: 52 },     // level two
  { id: "forest-deck-three", x: 14, z: -104, y: 78 }, // level three, the highest pad
  { id: "forest-rings", x: 118, z: -130, y: 0 },      // the middle of the mushroom ring
  { id: "forest-glade", x: 140, z: 60, y: 0 },        // the open east glade
  { id: "forest-corner", x: 154, z: 152, y: 0 },      // the south-east corner thicket
];

// The three Rogue Warden spots (§9: TUNE.WARDEN_COUNT). All in open floor, all visible
// from at least one spawn edge, all at least 140 studs apart, and none of them under the
// canopy walkway - §9.5 already has to teleport a Warden that cannot close on a fighter,
// and starting one boxed in under a deck would spend its first six seconds on that rule.
const WARDEN_LOCAL = [
  [0, 46],       // just outside the stone circle, in the clearing
  [-92, -100],   // the north-west flat, between the hut and the tall giant
  [128, 106],    // the east lane, past the ravine's dead end
];

// Scatter counts. Every one of these is canCollide:false dressing with no behaviour, so
// they cost a draw call each and not a collider, and the whole block lands well inside
// PARTS_MAX with room for the colliding skeleton.
const N_BUSH = 58;
const N_FERN = 26;        // three fronds each
const N_TUFT = 62;
const N_FLOWER = 26;
const N_LITTER = 44;
const N_SAPLING = 20;     // two parts each
const N_FIREFLY = 36;
const N_VINE = 30;

// =====================================================================================
// Pure helpers
// =====================================================================================

// A 32-bit LCG. Deterministic, seeded by a literal, and created fresh per build() call so
// nothing about this module is mutable state that could survive a dispose (§17.4).
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Which of the three floor levels is under a point. The ravine only cuts as far east as
// RAVINE_X1, so east of that the ravine band is ordinary floor.
function groundYAt(lx, lz) {
  if (lz > RIVER_Z0 && lz < RIVER_Z1) return RIVER_TOP;
  if (lz > RAVINE_Z0 && lz < RAVINE_Z1 && lx < RAVINE_X1) return RAVINE_TOP;
  return GROUND_TOP;
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}

// True when (lx, lz) is too close to something the scatter must not grow through: a spawn
// pad, a weapon pad, a Warden's opening ground, a trunk, the clearing, a crossing lane or
// the map's own edge. `margin` is how much slack the caller wants on top.
function blocked(lx, lz, margin) {
  if (Math.abs(lx) > HALF - 6 || Math.abs(lz) > HALF - 6) return true;
  if (dist2(lx, lz, CLEARING.x, CLEARING.z) < (CLEARING.r + margin) ** 2) return true;
  for (const s of SPAWNS_LOCAL) if (dist2(lx, lz, s[0], s[1]) < (13 + margin) ** 2) return true;
  for (const p of PADS_LOCAL) if (dist2(lx, lz, p.x, p.z) < (9 + margin) ** 2) return true;
  for (const w of WARDEN_LOCAL) if (dist2(lx, lz, w[0], w[1]) < (12 + margin) ** 2) return true;
  for (const t of TREES) if (dist2(lx, lz, t[0], t[1]) < (t[3] + 9 + margin) ** 2) return true;
  if (dist2(lx, lz, HUT.x, HUT.z) < (22 + margin) ** 2) return true;
  if (dist2(lx, lz, BOULDER_FIELD.x, BOULDER_FIELD.z) < (18 + margin) ** 2) return true;
  // the two fords, the plank crossing, the log bridge, the scree stair and the ravine exit
  // are LANES: a fern in one is scenery, a colliding sapling in one is a blocked crossing.
  if (lz > RIVER_Z0 - 8 && lz < RIVER_Z1 + 8) {
    for (const fx of [FORD_WEST.x, FORD_EAST.x, PLANK_FORD.x]) if (Math.abs(lx - fx) < 12 + margin) return true;
  }
  if (Math.abs(lx - LOG_BRIDGE.x) < 12 + margin && Math.abs(lz - LOG_BRIDGE.z) < LOG_BRIDGE.len / 2 + 10) return true;
  if (Math.abs(lx - RAVINE_STAIR.x) < 14 + margin && lz > RAVINE_Z0 && lz < RAVINE_Z1 + 12) return true;
  if (lx > RAVINE_X1 - 26 && lx < RAVINE_X1 + 10 && Math.abs(lz - RAVINE_EXIT.z) < 16 + margin) return true;
  return false;
}

// =====================================================================================
// build()
// =====================================================================================

export function build() {
  const rnd = lcg(0x5d0f0e57);   // one seed, one forest, every peer and every round
  const parts = [];

  // The one place a part literal is written. Three things it takes off every call site:
  //   - `collide` is a required argument rather than a default, because
  //     normalizeRuntimePart defaults canCollide to TRUE and a dressing part that forgot
  //     it would be a collider nobody asked for and a step a fighter trips on;
  //   - a ROUND part is written [diameter, height] and this is what mirrors the diameter
  //     onto z. `cylinder` hard-errors unless size[0] === size[2], and every other round
  //     shape collides as a cylinder of radius min(x,z)/2 anyway, so typing the same
  //     number twice at four hundred call sites only ever buys a chance to mistype it;
  //   - a `sphere` is one diameter on all three axes, which its schema also hard-requires.
  const ROUND_SHAPES = ["cylinder", "cone", "prism", "dome", "capsule", "tube", "ring", "star"];
  const put = (shape, size, position, color, material, collide, extra) => {
    const s = shape === "sphere" ? [size[0], size[0], size[0]]
      : ROUND_SHAPES.indexOf(shape) >= 0 ? [size[0], size[1], size[0]]
        : [size[0], size[1], size[2]];
    const def = { shape, size: s, position, color, material, anchored: true, canCollide: collide };
    if (extra) {
      // Rotation is capped at +/-360 per axis by the part schema, and the spiral stairs and
      // the root buttresses derive their yaw from an angle that winds past a full turn
      // twice, so every component is wrapped rather than trusted. 359.9 and 719.9 are the
      // same rotation; only one of them is a legal part.
      if (extra.rotation) def.rotation = extra.rotation.map((v) => v % 360);
      if (extra.transparency !== undefined) def.transparency = extra.transparency;
      if (extra.behaviors) def.behaviors = extra.behaviors;
    }
    parts.push(def);
    return def;
  };
  // Every part in this file is placed from LOCAL coordinates and lifted into the band here,
  // so there is exactly one place the origin is added and no chance of a half-converted one.
  const at = (lx, y, lz) => [OX + lx, y, OZ + lz];
  const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
  const between = (lo, hi) => lo + rnd() * (hi - lo);

  // -----------------------------------------------------------------------------------
  // 1. The floor, in twenty-five slabs. Deliberately not one 360-stud plate: a single
  // colour over the whole ground is what "reads as one green slab" means, and slabs also
  // let the river and the ravine simply be GAPS in the floor rather than something cut
  // out of it (nothing in the part schema subtracts).
  // -----------------------------------------------------------------------------------
  const slab = (x0, x1, z0, z1, top, color, material) => {
    put("box", [x1 - x0, GROUND_THICK, z1 - z0],
      at((x0 + x1) / 2, top - GROUND_THICK / 2, (z0 + z1) / 2), color, material, true);
  };
  // north forest, six tiles either side of z -128
  const northX = [-180, -60, 60, 180];
  for (let i = 0; i < 3; i++) {
    slab(northX[i], northX[i + 1], -180, -128, GROUND_TOP, FLOOR_GREENS[i], "grass");
    slab(northX[i], northX[i + 1], -128, RIVER_Z0, GROUND_TOP, FLOOR_GREENS[i + 3], "grass");
  }
  // the streambed, three tiles of ice five studs down (§3.2: there is no water material)
  for (let i = 0; i < 3; i++) slab(northX[i], northX[i + 1], RIVER_Z0, RIVER_Z1, RIVER_TOP, ICE_BLUES[i], "ice");
  // the wide south band, ten tiles, the clearing in the middle of it
  const southX = [-180, -90, -30, 30, 100, 180];
  for (let i = 0; i < 5; i++) {
    slab(southX[i], southX[i + 1], RIVER_Z1, 26, GROUND_TOP, FLOOR_GREENS[i], "grass");
    slab(southX[i], southX[i + 1], 26, RAVINE_Z0, GROUND_TOP, FLOOR_GREENS[(i + 2) % FLOOR_GREENS.length], "grass");
  }
  // the ravine floor (two tiles, fourteen down) and the unbroken east lane beside it
  slab(-180, -70, RAVINE_Z0, RAVINE_Z1, RAVINE_TOP, "#4a4136", "grass");
  slab(-70, RAVINE_X1, RAVINE_Z0, RAVINE_Z1, RAVINE_TOP, "#53483a", "grass");
  slab(RAVINE_X1, 180, RAVINE_Z0, RAVINE_Z1, GROUND_TOP, FLOOR_GREENS[2], "grass");
  // the south strip beyond the ravine
  slab(-180, -70, RAVINE_Z1, 180, GROUND_TOP, FLOOR_GREENS[4], "grass");
  slab(-70, RAVINE_X1, RAVINE_Z1, 180, GROUND_TOP, FLOOR_GREENS[1], "grass");
  slab(RAVINE_X1, 180, RAVINE_Z1, 180, GROUND_TOP, FLOOR_GREENS[3], "grass");

  // -----------------------------------------------------------------------------------
  // 2. The river. The streambed slabs already make the banks (their cut faces run y -8 to
  // 0 against a bed at -5), so all that is left is the water you see, the reeds, and the
  // three ways across. The "water" is a transparent ice plate floating at knee height over
  // the bed: you wade, you are visible, and the crossing lanes are the fast route.
  // -----------------------------------------------------------------------------------
  for (let i = 0; i < 3; i++) {
    put("box", [120, 0.5, RIVER_Z1 - RIVER_Z0 - 1], at(-120 + i * 120, -1.6, (RIVER_Z0 + RIVER_Z1) / 2),
      "#bfe6ec", "ice", false, { transparency: 0.55 });
  }
  for (let i = 0; i < 26; i++) {   // ripples and shallows, flat plates on the bed
    const rx = between(-176, 176), rz = between(RIVER_Z0 + 3, RIVER_Z1 - 3);
    put("cylinder", [between(5, 13), 0.3], at(rx, RIVER_TOP + 0.2, rz), pick(ICE_BLUES), "ice", false);
  }
  // reeds along both banks, and bank rocks that break the sightline down the stream
  for (let i = 0; i < 34; i++) {
    const rx = between(-176, 176), north = rnd() < 0.5;
    const rz = north ? RIVER_Z0 - between(1, 5) : RIVER_Z1 + between(1, 5);
    put("cone", [between(1.6, 3), between(4, 8)], at(rx, GROUND_TOP, rz), pick(FERN_GREENS), "grass", false,
      { rotation: [between(-9, 9), between(0, 359), between(-9, 9)] });
  }
  for (let i = 0; i < 12; i++) {
    const rx = between(-170, 170), north = rnd() < 0.5;
    const rz = north ? RIVER_Z0 - between(2, 7) : RIVER_Z1 + between(2, 7);
    const d = between(6, 12);
    put("sphere", [d, d, d], at(rx, GROUND_TOP - d / 3, rz), pick(ROCK_GREYS), "concrete", true);
  }
  // Two stepping-stone fords and a fallen sapling. Four stones seven studs apart: a
  // fighter at FIGHT_WALK_SPEED 20 and FIGHT_JUMP_POWER 52 clears seven comfortably, and
  // seven is short enough that the crossing is a lane rather than a platforming section.
  for (const ford of [FORD_WEST.x, FORD_EAST.x]) {
    for (let i = 0; i < 4; i++) {
      const sz = RIVER_Z0 + 4 + i * 7;
      put("cylinder", [between(8.5, 10.5), 8], at(ford + between(-2.5, 2.5), 0.8 - 4, sz), pick(ROCK_GREYS), "concrete", true);
      put("cylinder", [7, 0.3], at(ford, 0.95, sz), pick(MOSS_GREENS), "grass", false);   // moss cap, dressing only
    }
  }
  put("box", [5, 1.6, 36], at(PLANK_FORD.x, 0.2, (RIVER_Z0 + RIVER_Z1) / 2), pick(BARKS), "wood", true);
  put("cylinder", [4.4, 34], at(PLANK_FORD.x, -0.9, (RIVER_Z0 + RIVER_Z1) / 2), pick(BARKS), "wood", false,
    { rotation: [90, 0, 0] });
  for (let i = 0; i < 4; i++) {
    put("cylinder", [1.4, between(4, 8)], at(PLANK_FORD.x + (i % 2 ? 2.6 : -2.6), 1.2, RIVER_Z0 + 6 + i * 7),
      pick(BARKS), "wood", false, { rotation: [between(50, 80), between(0, 359), 0] });
  }

  // -----------------------------------------------------------------------------------
  // 3. The ravine. The floor slabs bottom out at -22 and the neighbouring floor bottoms
  // out at -8, so without walls a fighter down there would see a six-stud gap of nothing
  // between the two. The walls run y -15 to 0 so their tops are flush with the floor and
  // nobody stubs a toe on a lip at the rim. The south wall is built in two pieces: the gap
  // at RAVINE_STAIR is the way in.
  // -----------------------------------------------------------------------------------
  const wall = (lx, lz, sx, sz, color) => put("box", [sx, RAVINE_WALL_H, sz], at(lx, -RAVINE_WALL_H / 2, lz), color, "concrete", true);
  wall(-70, RAVINE_Z0 - 1, 220, 4, "#6a5c46");                       // north rim
  wall(-165, RAVINE_Z1 - 1.5, 30, 4, "#6a5c46");                     // south rim, west of the stair
  wall(-45, RAVINE_Z1 - 1.5, 170, 4, "#6a5c46");                     // south rim, east of the stair
  wall(RAVINE_X1 + 0.5, (RAVINE_Z0 + RAVINE_Z1) / 2, 1.5, 40, "#6a5c46");   // the east dead end
  wall(-178, (RAVINE_Z0 + RAVINE_Z1) / 2, 4, 40, "#6a5c46");         // the west end, at the map edge
  // rock strata across both faces, and root ends poking out of them, all dressing
  for (let i = 0; i < 22; i++) {
    const rx = between(-176, RAVINE_X1 - 4), north = rnd() < 0.5;
    put("box", [between(10, 26), between(1.2, 3), 1.2], at(rx, between(-13, -2), north ? RAVINE_Z0 + 0.4 : RAVINE_Z1 - 2.4),
      pick(["#7a6a50", "#5f533f", "#8b7a5e", "#4d4335"]), "concrete", false);
  }
  for (let i = 0; i < 12; i++) {
    const rx = between(-170, RAVINE_X1 - 8), north = rnd() < 0.5;
    put("cylinder", [between(1, 2.4), between(4, 11)], at(rx, between(-11, -2), north ? RAVINE_Z0 + 1 : RAVINE_Z1 - 3),
      pick(BARKS), "wood", false, { rotation: [between(60, 110), between(0, 359), 0] });
  }
  // the scree stair down through the south wall's gap: nine steps, -1.6 each
  for (let i = 0; i < 9; i++) {
    put("box", [17, 2.6, 3.2], at(RAVINE_STAIR.x, -i * 1.6 - 1.3, RAVINE_Z1 + 1 - i * 2.2),
      pick(["#7c6c52", "#6c5d46", "#8a7a5c"]), "concrete", true);
  }
  // the boulder steps back out at the east dead end, so pad `forest-ravine` is never a
  // one-way trip - §3.2 wants no unreachable pads, and a pit with one entrance is worse
  for (let i = 0; i < 3; i++) {
    const d = 11 - i * 1.5;
    put("sphere", [d, d, d], at(24 + i * 6.5, RAVINE_TOP + 2.5 + i * 4.6 - d / 2, RAVINE_EXIT.z + between(-2, 2)),
      pick(ROCK_GREYS), "concrete", true);
  }
  // rubble, ferns and a shaft of pale quartz on the ravine floor
  for (let i = 0; i < 16; i++) {
    const rx = between(-172, RAVINE_X1 - 8), rz = between(RAVINE_Z0 + 5, RAVINE_Z1 - 5);
    const d = between(3, 8);
    put("sphere", [d, d, d], at(rx, RAVINE_TOP - d / 3, rz), pick(ROCK_GREYS), "cobble", false);
  }
  for (let i = 0; i < 10; i++) {
    put("prism", [between(3, 6), between(5, 12)], at(between(-170, 20), RAVINE_TOP + 2, between(RAVINE_Z0 + 6, RAVINE_Z1 - 6)),
      pick(["#e8eef2", "#d6e2ea"]), "snow", false, { rotation: [between(-12, 12), between(0, 359), between(-12, 12)] });
  }

  // -----------------------------------------------------------------------------------
  // 4. The giant trees. Twelve of them, trunks 78 to 118 studs, which is what "trees the
  // size of towers" is in studs. Per tree: one colliding trunk, six colliding root
  // buttresses you can run up, and then everything else - bark rings, branch stubs,
  // canopy - is canCollide:false, because a canopy you could stand on would put a fighter
  // somewhere the Wardens of §9.5 could not follow.
  // -----------------------------------------------------------------------------------
  for (const [tx, tz, th, tr] of TREES) {
    const bark = pick(BARKS);
    put("cylinder", [tr * 2, th, tr * 2], at(tx, th / 2, tz), bark, "wood", true);
    for (let i = 0; i < 3; i++) {   // bark rings: the trunk reads as bark, not a pole
      put("cylinder", [tr * 2 + between(0.8, 2.2), between(2, 4), tr * 2 + 1.5], at(tx, between(8, th - 12), tz),
        pick(BARKS), "wood", false);
    }
    // Six root buttresses as wedge ramps facing out. A wedge collides as a wedge, so these
    // really are runnable: they lift a fighter five studs off the floor and break the
    // sightline along a trunk, which is the cover §3.2 asks for at ground level.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + (tx * 0.017 + tz * 0.011);
      const rr = tr + 5;
      put("wedge", [tr * 0.9, 5.5, tr + 9], at(tx + Math.cos(a) * rr, 2.75, tz + Math.sin(a) * rr),
        bark, "wood", true, { rotation: [0, (a * 180) / Math.PI + 90, 0] });
      put("cylinder", [between(3, 6), 0.4], at(tx + Math.cos(a) * (rr + 7), GROUND_TOP + 0.2, tz + Math.sin(a) * (rr + 7)),
        pick(MOSS_GREENS), "grass", false);
    }
    for (let i = 0; i < 5; i++) {   // branch stubs, angled out of the trunk
      const a = rnd() * Math.PI * 2;
      const by = between(th * 0.4, th * 0.92);
      put("cylinder", [between(2, 4.5), between(12, 26)], at(tx + Math.cos(a) * (tr + 5), by, tz + Math.sin(a) * (tr + 5)),
        bark, "wood", false, { rotation: [between(55, 85), (a * 180) / Math.PI, 0] });
    }
    // Three canopy masses. Sizes are uniform on all three axes because `sphere` requires
    // it; the dome and the fir cone keep x === z for the same reason every round shape does.
    const cd = tr * 4.2 + between(6, 14);
    put("sphere", [cd, cd, cd], at(tx, th + cd * 0.24, tz), pick(CANOPY_GREENS), "grass", false);
    put("dome", [cd * 0.82, cd * 0.4, cd * 0.82], at(tx + between(-9, 9), th + cd * 0.42, tz + between(-9, 9)),
      pick(CANOPY_GREENS), "grass", false);
    put("cone", [cd * 0.5, cd * 0.55, cd * 0.5], at(tx + between(-6, 6), th + cd * 0.6, tz + between(-6, 6)),
      pick(FIR_GREENS), "grass", false);
    // one fir standing beside each giant, for the silhouette the spec asks for
    const fa = rnd() * Math.PI * 2, fr = tr + between(20, 30);
    const fh = between(26, 46);
    put("cylinder", [between(3, 5), fh * 0.45], at(tx + Math.cos(fa) * fr, fh * 0.22, tz + Math.sin(fa) * fr), pick(BARKS), "wood", false);
    put("cone", [fh * 0.5, fh, fh * 0.5], at(tx + Math.cos(fa) * fr, fh * 0.6, tz + Math.sin(fa) * fr), pick(FIR_GREENS), "grass", false);
  }

  // -----------------------------------------------------------------------------------
  // 5. The three-level canopy walkway (§3.2). Decks around the trunks, level plank spans
  // between them, and stairs where a level changes. This is what makes the forest fight
  // "vertical and full of cover": three tiers, each with its own sightlines, and a fighter
  // on level three can see the clearing and nothing under the canopy.
  // -----------------------------------------------------------------------------------
  const deckAt = (ti, li) => {
    const t = TREES[ti], y = CANOPY_Y[li], d = t[3] * 2 + 22;
    put("cylinder", [d, 1.6, d], at(t[0], y - 0.8, t[1]), pick(PLANK_WOODS), "wood", true);
    // A `tube` is a real hollow solid, so a short wide one is a rail you can see through
    // and never a wall - and canCollide:false means it is not a rail you bump into either.
    put("tube", [d - 1.5, 3.2, d - 1.5], at(t[0], y + 1.6, t[1]), pick(BARKS), "wood", false);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      put("cylinder", [1.4, 3.6], at(t[0] + Math.cos(a) * (d / 2 - 1.4), y + 1.8, t[1] + Math.sin(a) * (d / 2 - 1.4)),
        pick(BARKS), "wood", false);
    }
    put("cylinder", [d * 0.6, 0.3], at(t[0], y + 0.15, t[1]), pick(MOSS_GREENS), "grass", false);
    return [t[0], y, t[1]];
  };
  for (const [ti, li] of DECKS) deckAt(ti, li);

  // A level plank run between two decks. Rotation is yaw ONLY: a box rotated about y is
  // unambiguous, and the segment's local z is its length, so the run needs no pitch.
  const span = (ax, az, bx, bz, y, width) => {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    const yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
    const n = Math.max(2, Math.round(len / 22));
    const segLen = len / n;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const cx = ax + dx * t, cz = az + dz * t;
      put("box", [width, 1.2, segLen - 0.4], at(cx, y - 0.6, cz), pick(PLANK_WOODS), "wood", true, { rotation: [0, yaw, 0] });
      // rope rails, both sides, as thin boxes so yaw is the only rotation in play
      for (const s of [-1, 1]) {
        put("box", [0.5, 0.5, segLen - 0.6], at(cx + (Math.cos((yaw * Math.PI) / 180) * s * width) / 2, y + 2.4,
          cz - (Math.sin((yaw * Math.PI) / 180) * s * width) / 2), "#6a5a3c", "wood", false, { rotation: [0, yaw, 0] });
      }
      // a stub post every other segment, and a hanging vine off it
      if (i % 2 === 0) {
        put("cylinder", [1.1, 3.4], at(cx, y + 1.5, cz + 0.2), pick(BARKS), "wood", false);
        put("cylinder", [0.7, between(6, 16)], at(cx, y - 1 - between(3, 8), cz), pick(FERN_GREENS), "grass", false);
      }
    }
  };
  for (const [a, b, li] of SPANS) {
    span(TREES[a][0], TREES[a][1], TREES[b][0], TREES[b][1], CANOPY_Y[li], 6.5);
  }

  // A stair is a run of level treads, never a tilted ramp, for the same reason the spans
  // are level. `turns` > 0 winds it around a trunk; 0 runs it straight between two points.
  const stair = (cx, cz, r, y0, y1, steps, a0, turns, tread) => {
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const a = a0 + turns * Math.PI * 2 * t;
      put("box", tread, at(cx + Math.cos(a) * r, y0 + (y1 - y0) * t - 0.7, cz + Math.sin(a) * r),
        pick(PLANK_WOODS), "wood", true, { rotation: [0, (a * 180) / Math.PI + 90, 0] });
    }
  };
  // Thirty steps, not eighteen, and the number is arithmetic rather than taste. At r 16 and
  // 1.8 turns the arc a spiral covers is about 181 studs; over eighteen treads that is 10
  // studs a step against a 5.5-stud tread, so every step was a 4.5-stud HOP and the way up
  // to the canopy was a platforming section nobody asked for. Thirty treads of 7 studs over
  // the same arc is 6 studs a step with the treads overlapping, and a 0.8-stud rise: a
  // staircase you walk up while looking somewhere else, which is what a fight needs.
  //
  // Ground -> level one, winding twice around the trunk beside the clearing.
  stair(TREES[11][0], TREES[11][1], TREES[11][3] + 8, 2.4, CANOPY_Y[0], 30, 0.4, 1.8, [9, 1.4, 7]);
  // level one -> level two, around the south-east giant
  stair(TREES[5][0], TREES[5][1], TREES[5][3] + 8, CANOPY_Y[0] + 1.4, CANOPY_Y[1], 30, 2.1, 1.8, [9, 1.4, 7]);
  // level two -> level three: a straight stepped run from the east giant's deck to the
  // north-east giant's, which is the only way up to the highest walkway and therefore the
  // one lane a fighter holding level three has to watch
  {
    const a = TREES[6], b = TREES[2], steps = 16;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const cx = a[0] + (b[0] - a[0]) * t, cz = a[1] + (b[1] - a[1]) * t;
      const yaw = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
      put("box", [7.5, 1.4, 6], at(cx, CANOPY_Y[1] + (CANOPY_Y[2] - CANOPY_Y[1]) * t - 0.7, cz),
        pick(PLANK_WOODS), "wood", true, { rotation: [0, yaw, 0] });
      if (i % 3 === 0) put("cylinder", [0.8, between(8, 18)], at(cx + 4, CANOPY_Y[1] + (CANOPY_Y[2] - CANOPY_Y[1]) * t - 8, cz),
        pick(FERN_GREENS), "grass", false);
    }
  }

  // -----------------------------------------------------------------------------------
  // 6. The perch (§3.2, §12.1), and the windfall branches that climb to it. The perch is
  // origin + [0, 90, 0] and it is REQUIRED, because TUNE.PERCH is the LOBBY perch 900
  // studs west - from there a dead fighter would watch an empty lobby through a fog far
  // clamped to 300. It gets a real floor, because the engine relocates you to your
  // checkpoint whether or not there is anything under it.
  //
  // The twenty-two windfall steps make it climbable from level three as well, which is
  // what keeps it honest as a fight position rather than a balcony only the dead can use.
  // -----------------------------------------------------------------------------------
  put("cylinder", [26, 1.6, 26], at(0, PERCH_Y - 0.8, 0), "#8a6c45", "wood", true);
  put("tube", [24, 3.6, 24], at(0, PERCH_Y + 1.8, 0), "#6b5340", "wood", false);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    put("cylinder", [1.5, 4], at(Math.cos(a) * 11.5, PERCH_Y + 2, Math.sin(a) * 11.5), "#6b5340", "wood", false);
    put("cylinder", [0.8, between(10, 26)], at(Math.cos(a) * 12.5, PERCH_Y - 3 - between(4, 12), Math.sin(a) * 12.5),
      pick(FERN_GREENS), "grass", false);
  }
  put("dome", [30, 7, 30], at(0, PERCH_Y - 8, 0), pick(CANOPY_GREENS), "grass", false);   // the bough it rests in
  put("cylinder", [15, 0.3], at(0, PERCH_Y + 0.15, 0), pick(MOSS_GREENS), "grass", false);
  {
    const a = TREES[1], steps = 22;
    const ax = a[0], az = a[1], bx = 0, bz = 0;
    for (let i = 1; i <= steps; i++) {
      const t = i / (steps + 1);
      // a lateral bow, so the climb spirals in rather than running dead straight and the
      // hop length stays near six studs the whole way
      const bow = Math.sin(t * Math.PI) * 34;
      const cx = ax + (bx - ax) * t - bow * 0.35;
      const cz = az + (bz - az) * t + bow * 0.12;
      const cy = CANOPY_Y[2] + (PERCH_Y - CANOPY_Y[2]) * t;
      put("cylinder", [between(6, 7.6), 1.2], at(cx, cy - 0.6, cz), pick(BARKS), "wood", true);
      put("dome", [between(8, 13), between(2.5, 5)], at(cx, cy + 0.4, cz), pick(CANOPY_GREENS), "grass", false);
    }
  }

  // -----------------------------------------------------------------------------------
  // 7. The fallen log bridge over the ravine (§3.2's "fallen trunk you can walk the length
  // of"). The log itself is a canCollide:false cylinder, because a round log collides as a
  // cylinder and a fighter would slide off its shoulder; the thing you actually walk is a
  // flat colliding plank laid along its crown, coloured to match. That split is the honest
  // way to build any round walkable in this engine.
  // -----------------------------------------------------------------------------------
  {
    const { x: lx, z: lz, len } = LOG_BRIDGE;
    const logBark = "#5a4632";
    put("cylinder", [18, len, 18], at(lx, 2, lz), logBark, "wood", false, { rotation: [90, 0, 0] });
    put("box", [11, 2, len], at(lx, 10.3, lz), "#63503b", "wood", true);
    for (let i = 0; i < 5; i++) {   // bark rings along the trunk
      put("cylinder", [19.4, 2.4, 19.4], at(lx, 2, lz - len / 2 + 6 + i * 12), pick(BARKS), "wood", false, { rotation: [90, 0, 0] });
    }
    put("cylinder", [17, 1], at(lx, 2, lz - len / 2 - 0.4), "#7a6148", "wood", false, { rotation: [90, 0, 0] });   // the sawn end
    for (let i = 0; i < 8; i++) {   // moss along the crown, and broken branch stubs
      put("cylinder", [between(4, 8), 0.3], at(lx + between(-3, 3), 11.4, lz + between(-len / 2 + 4, len / 2 - 4)), pick(MOSS_GREENS), "grass", false);
    }
    for (let i = 0; i < 4; i++) {
      put("cylinder", [between(2, 3.6), between(8, 16)], at(lx + (i % 2 ? 8 : -8), between(2, 6), lz + between(-20, 20)),
        logBark, "wood", false, { rotation: [0, 0, i % 2 ? 68 : -68] });
    }
    // root plate at the upslope end, and a rail of shelf fungus down one side
    put("dome", [26, 12, 26], at(lx, 1, lz - len / 2 - 6), logBark, "wood", false);
    for (let i = 0; i < 7; i++) {
      put("cylinder", [between(3, 6), 0.8], at(lx + 6.4, between(4, 9), lz + between(-24, 24)),
        pick(["#c9a24a", "#b08a3c", "#d8bb66"]), "plastic", false, { rotation: [0, 0, 82] });
    }
  }

  // -----------------------------------------------------------------------------------
  // 8. Mossy boulders. Twenty-two of them: the east field (which is where the boulder pad
  // sits), a scatter over the whole ground, and the few in the ravine already placed above.
  // Half-buried spheres, so their tops are walkable at a believable height, and the big one
  // gets a flat colliding cap because you cannot stand on the crown of a sphere.
  // -----------------------------------------------------------------------------------
  {
    // the big one, and its two stepping stones, under pad `forest-boulder`
    put("sphere", [16, 16, 16], at(BOULDER_FIELD.x, 3, BOULDER_FIELD.z), "#7c7b73", "concrete", true);
    put("cylinder", [11, 1.4, 11], at(BOULDER_FIELD.x, 10.5, BOULDER_FIELD.z), "#5b7f3a", "grass", true);
    put("sphere", [11, 11, 11], at(BOULDER_FIELD.x - 11, 1.2, BOULDER_FIELD.z + 5), "#8a8a82", "concrete", true);
    put("sphere", [9, 9, 9], at(BOULDER_FIELD.x - 18, 0.2, BOULDER_FIELD.z + 10), "#74746c", "concrete", true);
    for (let i = 0; i < 7; i++) {   // the rest of the field, cover rather than platform
      const a = (i / 7) * Math.PI * 2 + 0.4, r = between(20, 34);
      const d = between(7, 15);
      const bx = BOULDER_FIELD.x + Math.cos(a) * r, bz = BOULDER_FIELD.z + Math.sin(a) * r;
      put("sphere", [d, d, d], at(bx, groundYAt(bx, bz) + d / 2 - d / 3, bz), pick(ROCK_GREYS), "concrete", true);
      put("dome", [d * 0.8, d * 0.28, d * 0.8], at(bx, groundYAt(bx, bz) + d * 0.6, bz), pick(MOSS_GREENS), "grass", false);
    }
    // eleven more scattered over the whole ground, wherever the scatter filter allows
    let placed = 0;
    for (let guard = 0; guard < 240 && placed < 11; guard++) {
      const bx = between(-170, 170), bz = between(-170, 170);
      if (blocked(bx, bz, 8)) continue;
      const d = between(8, 17);
      const gy = groundYAt(bx, bz);
      put("sphere", [d, d, d], at(bx, gy + d / 6, bz), pick(ROCK_GREYS), "concrete", true);
      put("dome", [d * 0.78, d * 0.3, d * 0.78], at(bx, gy + d * 0.62, bz), pick(MOSS_GREENS), "grass", false);
      put("sphere", [d * 0.3, d * 0.3, d * 0.3], at(bx + d * 0.8, gy + d * 0.1, bz - d * 0.5), pick(ROCK_GREYS), "cobble", false);
      placed++;
    }
  }

  // -----------------------------------------------------------------------------------
  // 9. The ruined ranger hut. A real interior with one doorway and one window, a chimney,
  // a roof you can get onto over the woodpile, and the pad `forest-hut` on the plank floor:
  // a room is the strongest cover on the ground, and a room with two ways in is a fight
  // rather than a hiding place.
  // -----------------------------------------------------------------------------------
  {
    const hx = HUT.x, hz = HUT.z;
    put("box", [24, 1.6, 20], at(hx, 0, hz), "#7b5f3c", "wood", true);                      // plank floor, top y 0.8
    for (const [sx, sz] of [[-10, -8], [10, -8], [-10, 8], [10, 8]]) {
      put("cylinder", [2.6, 4], at(hx + sx, -1.6, hz + sz), "#4a3a2a", "wood", false);   // stilts
    }
    put("box", [24, 10, 1.4], at(hx, 5.8, hz - 9.5), "#6b5340", "wood", true);              // back wall
    put("box", [1.4, 10, 20], at(hx - 11.5, 5.8, hz), "#6b5340", "wood", true);             // west wall
    put("box", [1.4, 6, 9], at(hx + 11.5, 3.8, hz - 5), "#6b5340", "wood", true);           // east wall, collapsed top
    put("box", [1.4, 10, 7], at(hx + 11.5, 5.8, hz + 6), "#6b5340", "wood", true);
    put("box", [7, 10, 1.4], at(hx - 8, 5.8, hz + 9.5), "#6b5340", "wood", true);           // front wall, doorway between
    put("box", [8, 10, 1.4], at(hx + 7.5, 5.8, hz + 9.5), "#6b5340", "wood", true);
    put("box", [4, 3, 1.4], at(hx - 0.5, 9.3, hz + 9.5), "#6b5340", "wood", true);          // lintel over the door
    put("box", [24, 1.4, 20], at(hx, 11.4, hz), "#5c4c2e", "wood", true);                   // the roof, walkable
    put("wedge", [25, 5, 21], at(hx, 14, hz), "#4a3a2a", "wood", false, { rotation: [0, 0, 0] });
    put("wedge", [25, 5, 21], at(hx, 14, hz), "#4a3a2a", "wood", false, { rotation: [0, 180, 0] });
    put("cylinder", [4.5, 18, 4.5], at(hx - 9, 9, hz - 6), "#8a5d4a", "brick", true);        // chimney
    put("box", [5.4, 1.2, 5.4], at(hx - 9, 18.4, hz - 6), "#74746c", "cobble", false);
    // the woodpile you climb to the roof by, then the shutters, bench, barrel and crates
    for (let i = 0; i < 4; i++) {
      put("box", [7, 2.6, 5], at(hx + 15, 1.3 + i * 2.6, hz + 2), pick(PLANK_WOODS), "wood", true);
    }
    for (let i = 0; i < 6; i++) {
      put("cylinder", [between(1.4, 2.4), 6.5], at(hx + 15 + between(-2, 2), 11.5, hz + 2 + between(-1.6, 1.6)),
        pick(BARKS), "wood", false, { rotation: [90, between(0, 359), 0] });
    }
    put("box", [0.6, 5, 4.5], at(hx + 5.5, 5.5, hz + 10.4), "#7a6148", "wood", false, { rotation: [0, 18, 0] });
    put("box", [0.6, 5, 4.5], at(hx + 10.5, 5.5, hz + 10.4), "#7a6148", "wood", false, { rotation: [0, -24, 0] });
    put("box", [8, 0.8, 2.4], at(hx - 4, 2.6, hz - 6), "#8a6c45", "wood", true);            // bench
    put("box", [1, 2, 2.4], at(hx - 7.4, 1.6, hz - 6), "#6b5340", "wood", false);
    put("box", [1, 2, 2.4], at(hx - 0.6, 1.6, hz - 6), "#6b5340", "wood", false);
    put("tube", [5, 6, 5], at(hx + 6, 3.8, hz - 6), "#7b5f3c", "wood", true);                // rain barrel
    put("cylinder", [4.2, 0.4, 4.2], at(hx + 6, 6.6, hz - 6), "#a8d8e0", "ice", false, { transparency: 0.45 });
    put("box", [4, 4, 4], at(hx - 16, 2, hz - 2), "#6b5340", "wood", true);                  // crates outside the door
    put("box", [3.4, 3.4, 3.4], at(hx - 16, 5.7, hz - 2), "#7a6148", "wood", true);
    put("box", [3, 0.5, 2.2], at(hx - 16, 7.6, hz - 2), "#c9a24a", "plastic", false);        // a lantern, dark
    // moss, a hole in the roof, and the sign the rangers left
    for (let i = 0; i < 9; i++) {
      put("cylinder", [between(3, 7), 0.3], at(hx + between(-11, 11), 12.2, hz + between(-9, 9)), pick(MOSS_GREENS), "grass", false);
    }
    put("box", [6, 0.8, 4], at(hx + 4, 12.3, hz - 3), "#3f3225", "wood", false);   // the hole in the roof
    put("box", [7, 0.6, 3.4], at(hx - 2, 13.6, hz + 11.5), "#8a6c45", "wood", false, { rotation: [0, 0, 8] });
    for (let i = 0; i < 7; i++) {   // the path of trodden earth up to the door
      put("cylinder", [between(6, 10), 0.3], at(hx + between(-3, 3) + i * 1.5, 0.2, hz + 13 + i * 7), pick(LITTER_BROWNS), "grass", false);
    }
  }

  // -----------------------------------------------------------------------------------
  // 10. The clearing and its stone circle (§3.2 by way of the "mushroom ring" and the open
  // ground a fight needs a middle). Nine menhirs on a 22-stud ring, two lintels still up,
  // one fallen, and an altar dais that carries pad `forest-altar` - the most contested
  // twelve studs on the ground, in the open, under the perch, with three lanes into it.
  // -----------------------------------------------------------------------------------
  {
    const cx = CLEARING.x, cz = CLEARING.z;
    put("cylinder", [34, 0.5, 34], at(cx, 0.25, cz), "#7ba05b", "grass", false);            // worn turf
    put("cylinder", [16, 4, 16], at(cx, 1.2, cz), "#9a9a92", "marble", true);               // the altar dais, top y 3.2
    put("cylinder", [11, 0.4, 11], at(cx, 3.4, cz), "#8f8b80", "marble", false);
    put("ring", [9, 0.3, 9], at(cx, 3.5, cz), "#d6e2ea", "snow", false);                    // a carved ring, dressing
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const mx = cx + Math.cos(a) * 22, mz = cz + Math.sin(a) * 22;
      const mh = between(12, 17);
      put("prism", [7, mh, 7], at(mx, mh / 2 - 1, mz), pick(ROCK_GREYS), "cobble", true,
        { rotation: [between(-7, 7), (a * 180) / Math.PI, between(-7, 7)] });
      put("cylinder", [7.6, 0.6, 7.6], at(mx, mh - 1.2, mz), pick(["#8f8b80", "#a2a098"]), "marble", false);
      if (i === 2 || i === 6) {   // a lintel still bridging two stones
        const a2 = ((i + 1) / 9) * Math.PI * 2;
        const lx2 = cx + Math.cos((a + a2) / 2) * 22, lz2 = cz + Math.sin((a + a2) / 2) * 22;
        put("box", [4.5, 2.4, 17], at(lx2, mh + 0.4, lz2), pick(ROCK_GREYS), "cobble", false,
          { rotation: [0, ((a + a2) / 2 * 180) / Math.PI, 0] });
      }
    }
    // the fallen menhir: a non-colliding prism on its side plus a colliding walk plate
    put("prism", [7, 18, 7], at(cx + 30, 3, cz - 12), "#74746c", "cobble", false, { rotation: [0, 0, 90] });
    put("box", [6, 1.4, 17], at(cx + 30, 6.2, cz - 12), "#807f77", "cobble", true, { rotation: [0, 22, 0] });
    for (let i = 0; i < 10; i++) {   // rune plates and scattered chips
      const a = rnd() * Math.PI * 2, r = between(9, 30);
      put("cylinder", [between(2, 5), 0.3], at(cx + Math.cos(a) * r, 0.25, cz + Math.sin(a) * r), pick(["#8f8b80", "#d6e2ea"]), "marble", false);
    }
  }

  // -----------------------------------------------------------------------------------
  // 11. The mushroom ring (§3.2). Twelve on a 26-stud ring around pad `forest-rings`;
  // three of them are grown enough to collide, so the ring is also a short hop-course and
  // a fighter can break a sightline by standing on a cap.
  // -----------------------------------------------------------------------------------
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const mx = MUSHROOMS.x + Math.cos(a) * MUSHROOMS.r, mz = MUSHROOMS.z + Math.sin(a) * MUSHROOMS.r;
    const big = i % 4 === 0;
    const cap = pick(["#b8453c", "#c9563f", "#a83d52", "#d06a45"]);
    if (big) {
      put("cylinder", [5.5, 9, 5.5], at(mx, 4.5, mz), "#e8d9b0", "plastic", true);
      put("dome", [16, 6, 16], at(mx, 9, mz), cap, "plastic", true);
      put("ring", [13, 0.3, 13], at(mx, 15.2, mz), "#f2ead0", "plastic", false);
    } else {
      const sh = between(4, 7);
      put("cylinder", [between(2.2, 3.4), sh], at(mx, sh / 2, mz), "#e8d9b0", "plastic", false);
      put("dome", [between(7, 11), between(3, 5)], at(mx, sh, mz), cap, "plastic", false);
    }
    for (let k = 0; k < 2; k++) {   // the little ones crowding the base
      put("dome", [between(1.6, 3), between(1, 2)], at(mx + between(-5, 5), 0.2, mz + between(-5, 5)), cap, "plastic", false);
    }
  }
  put("cylinder", [26, 0.3, 26], at(MUSHROOMS.x, 0.22, MUSHROOMS.z), "#5b7f3a", "grass", false);   // the fairy ring's turf

  // -----------------------------------------------------------------------------------
  // 12. The twelve weapon pads (§7.2). Each is ONE sensor - canCollide:false WITH a
  // touchEvent behaviour, which is what registers a collider as a sensor and what makes a
  // pad a pad - plus two canCollide:false discs of dressing so it reads from a distance.
  // They are `touchEvent` and never `collectible`: a collectible of kind "oofbux" is
  // bridged to a real payout by the economy service, so a ground full of them would
  // quietly print money (§7.2).
  //
  // cooldownS 0.5 is the SENSOR's debounce and nothing else. The 25 s re-arm of
  // TUNE.WEAPON_RESPAWN_S belongs to game.js, which owns `padsArmed`; a behaviour param is
  // read once into its runtime and can never be rewritten from a Place (§11), so the pad
  // could not hold the real timer even if it wanted to.
  // -----------------------------------------------------------------------------------
  const weaponPads = [];
  // WEAPON_PAD_COUNT, not PADS_LOCAL.length: the loop is what makes the count exact, so a
  // thirteenth row added to the table below cannot quietly ship a thirteenth pad.
  for (let i = 0; i < WEAPON_PAD_COUNT; i++) {
    const p = PADS_LOCAL[i];
    const event = `sd_forest_pad${i < 9 ? "0" : ""}${i + 1}`;
    put("cylinder", [7, 0.6, 7], at(p.x, p.y + 0.3, p.z), "#cfe8b8", "neon", false,
      { behaviors: [{ type: "touchEvent", event, cooldownS: 0.5 }] });
    put("ring", [9.5, 0.3, 9.5], at(p.x, p.y + 0.12, p.z), "#8fce7a", "neon", false);
    put("cylinder", [3, 0.4, 3], at(p.x, p.y + 0.45, p.z), "#f2f0a0", "neon", false);
    weaponPads.push({ id: p.id, position: at(p.x, p.y, p.z), kind: "weapon", event });
  }

  // -----------------------------------------------------------------------------------
  // 13. Undergrowth, ferns, saplings, litter and fireflies: the whole visual budget, and
  // none of it a collider. Every candidate goes through blocked(), which is what keeps a
  // fern out of a spawn, a sapling out of a crossing and anything at all out of the
  // clearing. The guard counters bound the loops, because a rejected candidate must not be
  // able to spin a pure function forever.
  // -----------------------------------------------------------------------------------
  const scatter = (count, margin, fn) => {
    let placed = 0;
    for (let guard = 0; guard < count * 14 && placed < count; guard++) {
      const lx = between(-174, 174), lz = between(-174, 174);
      if (blocked(lx, lz, margin)) continue;
      fn(lx, lz, groundYAt(lx, lz));
      placed++;
    }
  };
  scatter(N_BUSH, 0, (lx, lz, gy) => {
    const d = between(6, 13);
    put("dome", [d, d * between(0.42, 0.7), d], at(lx, gy, lz), pick(CANOPY_GREENS), "grass", false);
  });
  scatter(N_FERN, 0, (lx, lz, gy) => {
    const col = pick(FERN_GREENS);
    for (let k = 0; k < 3; k++) {
      put("wedge", [1.4, between(3.5, 6), between(4, 7)], at(lx + between(-1.6, 1.6), gy + 1.6, lz + between(-1.6, 1.6)),
        col, "grass", false, { rotation: [between(-22, 22), between(0, 359), between(-22, 22)] });
    }
  });
  scatter(N_TUFT, 0, (lx, lz, gy) => {
    put("cone", [between(2.5, 5), between(3, 6.5)], at(lx, gy + 1, lz), pick(FERN_GREENS), "grass", false,
      { rotation: [between(-12, 12), between(0, 359), between(-12, 12)] });
  });
  scatter(N_FLOWER, 0, (lx, lz, gy) => {
    const d = between(1, 2);
    put("sphere", [d, d, d], at(lx, gy + between(1.5, 3), lz), pick(["#e8d9b0", "#d9dce8", "#e0a8c8", "#f2e08a"]), "plastic", false);
    put("cylinder", [0.4, between(2, 3.4)], at(lx, gy + 1.2, lz), "#4a8a46", "grass", false);
  });
  scatter(N_LITTER, 0, (lx, lz, gy) => {
    put("cylinder", [between(7, 16), 0.3], at(lx, gy + 0.2, lz), pick(LITTER_BROWNS), "grass", false);
  });
  // Saplings are the one scattered thing that is tall enough to matter for a sightline, so
  // they get the widest margin: a sapling in a spawn is a fighter's first frame blocked.
  scatter(N_SAPLING, 6, (lx, lz, gy) => {
    const h = between(14, 26);
    put("cylinder", [between(2, 3.4), h * 0.55], at(lx, gy + h * 0.27, lz), pick(BARKS), "wood", false);
    put("cone", [h * 0.42, h * 0.62, h * 0.42], at(lx, gy + h * 0.68, lz), pick(FIR_GREENS), "grass", false);
  });
  // Fireflies: small emissive `neon` motes at waist to head height, with NO `light` block
  // on any of them. §3.3 is explicit that atmosphere never comes from lamp count - the
  // renderer lights at most two point lights on the low tier that SwiftShader and every
  // phone report, and the Supernova emote of §10.2 already spends one of the two.
  scatter(N_FIREFLY, 0, (lx, lz, gy) => {
    const d = between(0.6, 1.2);
    put("sphere", [d, d, d], at(lx, gy + between(3, 16), lz), pick(["#f2f0a0", "#e8f2b8", "#fff2cf"]), "neon", false);
  });
  // Vines hanging out of the canopy, for the vertical read a three-level walkway needs
  scatter(N_VINE, 0, (lx, lz, gy) => {
    put("cylinder", [between(0.6, 1.1), between(14, 34)], at(lx, gy + between(22, 54), lz), pick(FERN_GREENS), "grass", false);
  });
  // Three scuffs of bare earth where the Wardens reassemble (§9.3), so the spot reads as
  // deliberate before the drum is there and after one is broken.
  for (const [wx, wz] of WARDEN_LOCAL) {
    put("cylinder", [9, 0.3, 9], at(wx, GROUND_TOP + 0.2, wz), "#5c4c2e", "grass", false);
    put("ring", [11, 0.3, 11], at(wx, GROUND_TOP + 0.22, wz), "#6b5a36", "grass", false);
  }

  // -----------------------------------------------------------------------------------
  // The MapBuild (§3.2 / MODULE CONTRACT). What rule 25:S1 checks, and what is true here:
  //   - parts.length <= PARTS_MAX, colliding parts <= COLLIDER_MAX
  //   - spawns.length >= SPAWN_MIN, all on floor above KILL_Y, none inside geometry
  //   - weaponPads.length === WEAPON_PAD_COUNT, every one on a reachable surface
  //   - wardenSpots.length === WARDEN_SPOT_COUNT, spaced and in the open
  //   - landmarks.perch exists, sits at origin + [0, PERCH_Y, 0], and is inside bounds
  //   - no part carries an `id`; every colour is lower-case six-digit hex
  // -----------------------------------------------------------------------------------
  const spawns = SPAWNS_LOCAL.map(([sx, sz]) => at(sx, groundYAt(sx, sz) + 0.2, sz));
  const wardenSpots = WARDEN_LOCAL.slice(0, WARDEN_SPOT_COUNT).map(([wx, wz]) => at(wx, groundYAt(wx, wz), wz));

  return {
    parts,
    spawns,
    weaponPads,
    wardenSpots,
    landmarks: {
      perch: at(0, PERCH_Y, 0),                 // REQUIRED (§3.2, §12.1)
      clearing: at(CLEARING.x, GROUND_TOP, CLEARING.z),
      altar: at(CLEARING.x, 3.2, CLEARING.z),
      hut: at(HUT.x, 0.8, HUT.z),
      hutRoof: at(HUT.x, 12.1, HUT.z),
      logBridge: at(LOG_BRIDGE.x, 11.3, LOG_BRIDGE.z),
      ravineFloor: at(-140, RAVINE_TOP, 114),
      riverFord: at(FORD_WEST.x, 0.8, -58),
      mushroomRing: at(MUSHROOMS.x, GROUND_TOP, MUSHROOMS.z),
      boulderField: at(BOULDER_FIELD.x, 11.2, BOULDER_FIELD.z),
      canopyOne: at(TREES[11][0], CANOPY_Y[0], TREES[11][1]),
      canopyTwo: at(TREES[5][0], CANOPY_Y[1], TREES[5][1]),
      canopyThree: at(TREES[1][0], CANOPY_Y[2], TREES[1][1]),
    },
    // The spec 04 §3.3 config world.js hands renderer.applyLighting on the first drained
    // batch, mirroring MAPS[0].lighting value for value (this file may not import it).
    // fog.far is 300 and there is NO `near` key: resolveFog derives fogNear as 0.55 * far,
    // never reads a near key, and clamps far to 300 on the low tier that SwiftShader and
    // phones report - so 300 is the number that actually renders, and on the low tier the
    // three grounds are told apart by fog COLOUR and by their materials, not by distance.
    lighting: {
      skyTop: "#4f8fd0", skyBottom: "#a8e08a",
      ambient: "#cfe8b8", ambientIntensity: 0.85,
      sunColor: "#fff2cf", sunIntensity: 1.35,
      sunDirection: [-0.35, -1, -0.25],
      fog: { color: "#7fb86a", far: 300 },
    },
    // The box the ground occupies. Twelve studs of slack in XZ past the floor's own edge,
    // down to -26 (the ravine slabs' underside is -22) and up to 168, which clears the
    // tallest canopy mass. TUNE.FLY_CEILING_Y is measured off bounds.min[1] and the hover
    // is clamped to bounds in XZ, so these two corners are load-bearing and not decoration.
    bounds: { min: [OX - HALF - 12, -26, OZ - HALF - 12], max: [OX + HALF + 12, 168, OZ + HALF + 12] },
  };
}
