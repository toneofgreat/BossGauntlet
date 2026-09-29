// src/games/showdown/scripts/maps/forgotten.js - Showdown's FORGOTTEN CITY ground.
// Spec 25 §3.2, music `voidchill`. The same streets a thousand years later and somewhere
// else: cobble under drifted sand, roofless marble colonnades, a cracked ziggurat, two
// drowned plazas, a buried amphitheatre, a collapsed aqueduct, headless statues, and
// glyph stones that are the only thing still lit.
//
// PURE, and that is a contract and not a preference (config.js MODULE CONTRACT, §3.2):
// this module imports NOTHING - not even config.js - touches no ctx, no THREE, no DOM and
// no browser global, and has no side effects at module scope. That is what lets
// tools/validate.js import() it under Node and assert this ground's geometry (rule 25:S1)
// without a renderer, and what lets ten sibling authors write ten files that agree.
// The consequence is that every TUNE number this file has to honour is restated here as a
// local constant with the config key it mirrors named beside it. If one of those numbers
// moves in config.js, it moves here in the same commit.
//
// NO PART CARRIES AN `id`. world.js stamps every def with its own monotonic uid(prefix)
// immediately before parts.create, because partsById.set(def.id, record) is unchecked - a
// reused id silently overwrites the record and leaks the old collider - and because
// removePartInternal never drops a part's behaviorStateByPartId entry, so a rebuilt part
// with a stable id is handed the PREVIOUS round's behaviour list and a weapon pad comes
// back already fired (§3.4). Rule 25:S1 asserts the absence of `id` on every part.
//
// HOW THIS GROUND IS BUILT CHEAPLY. A part with canCollide:false and zero behaviours
// registers no collider at all, so every ornament here - facing stones, rubble, vines,
// roots, drifted sand, fallen drums, glyphs - is `deco` and free against the 3000 live
// colliders the smoke run asserts. `solid` is reserved for the blockout a fighter stands
// on, walks around or hides behind. A canCollide:false part WITH a behaviour is a sensor,
// and that is exactly and only what a weapon pad is (§7.2).
//
// THE BUDGET, and why this ground stops well short of its ceiling. It builds about 1120
// parts of TUNE.MAP_PARTS_MAX 1800 and about 280 colliders of MAP_COLLIDER_MAX 900. The
// slack is not laziness: §10.3 budgets every peer's weapon prop against the same
// MAP_PARTS_MAX (up to 19 of them, repositioned every tick), the effects layer takes
// TUNE.VFX_MAX 120 more, and the smoke run asserts live colliders stay under 3000 with the
// largest map standing, the lobby, the obby and three Wardens all present (§17.3.9).
//
// THE SHAPE OF A FIGHT HERE. The ziggurat is the high ground and it is worth taking: the
// summit carries a weapon pad and sees the whole ground. It is contestable from four
// sides, which is the point - a single stair would make it a fortress rather than a prize:
//   south  a stepped wedge stair, one flight per terrace, the obvious route
//   west   the same, so two attackers can never be held by one defender
//   east   the collapsed aqueduct, which lands on the third terrace across a 7-stud gap
//   north  a giant root grown up the face, plus collapse rubble, the scramble route
// Fog is authored at far 220 (§3.3), so the far side of the ground reads as a silhouette
// and the glyph stones are what you navigate by.

// =====================================================================================
// The band. `origin` for this ground is MAPS[2].origin = [3300, 0, 0] in config.js; the
// three grounds sit side by side in XZ and never stacked, because killY is one number for
// the whole Place and a lower map's floor would sit under it (§3). Everything below is
// authored in RELATIVE studs and lifted into the band by at(); that way the whole ground
// can be re-centred by changing one number.
// =====================================================================================

const ORIGIN_X = 3300;          // mirrors config.MAPS "forgotten" origin[0]
const ORIGIN_Z = 0;             // mirrors config.MAPS "forgotten" origin[2]
const HALF = 200;               // the ground's half extent in XZ, so 400 x 400 of city
const GROUND_TOP = 0;           // the street surface; spawns stand 0.2 above it
const TILE = 50;                // paving tile edge; 8 x 8 of them cover the band
const TILE_THICK = 10;          // thick enough that a tile's own side walls a sunken plaza
const SUNK_TOP = -6;            // the drowned plazas' floor, six studs under the street
const WADE_TOP = -5.3;          // the top of the shallow water over that floor
const ORCHESTRA_TOP = -8;       // the amphitheatre floor, the lowest surface on the ground
const KILL_Y = -40;             // mirrors TUNE.KILL_Y: every surface above must clear it
const PERCH_TOP = 90;           // mirrors TUNE.PERCH_ABOVE_ORIGIN[1] (§3.2)
const WEAPON_PAD_COUNT = 12;    // mirrors TUNE.WEAPON_PADS_PER_MAP (§7.2)
const WARDEN_SPOT_COUNT = 3;    // mirrors TUNE.WARDEN_COUNT (§9)

// Colours. Lower-case six-digit hex everywhere, because the part schema's colour pattern
// is ^#[0-9a-f]{6}$ and an upper-case letter is a hard validator error (§17.1). The
// palette is deliberately desaturated: a ruin at dusk, with one cold light in it.
const C = {
  cobble: "#6d675e",        // street stone, weathered pale grey-brown
  cobbleDark: "#565046",    // the underside of everything, and shadowed courses
  cobbleWorn: "#7d766b",    // the courses the wind has scoured back to bare stone
  marble: "#cfc8b8",        // colonnade shafts, statues, the ziggurat's facing
  marbleDim: "#b4ac9c",
  marbleShadow: "#9a9182",
  sand: "#c4ae84",          // the drift that is swallowing all of it
  sandPale: "#d6c49c",
  sandDark: "#a89571",
  root: "#4a3a2c",          // the trees that took the city apart
  rootPale: "#5d4a37",
  vine: "#3f6b4a",
  vineLeaf: "#4f8055",
  water: "#4f7f95",         // there is no water material, so shallow water is `ice`
  glyph: "#6fe0d2",         // the glyph light: cold jade, the only light source here
  glyphViolet: "#a184e8",   // the deeper glyphs, and the obelisk inlay
  galaxy: "#2a1a4a",        // the floating obelisks, mirroring MAPS "forgotten" sky
  bronze: "#8a7238",        // statue collars and door fittings, material `gold` darkened
};

// The ziggurat, outermost terrace first. Each terrace rises 4 studs, which is inside a
// fighter's jump arc but not free: FIGHT_JUMP_POWER 52 against gravity 196.2 apexes at
// 52*52/(2*196.2) = 6.9 studs, so a terrace edge is a hop and a two-terrace edge is not.
// Every terrace box starts at ZIG_BURY so no terrace floats over the collapse rubble.
const ZIG = [
  { half: 44, top: 4 },
  { half: 38, top: 8 },
  { half: 32, top: 12 },
  { half: 26, top: 16 },
  { half: 20, top: 20 },
  { half: 14, top: 24 },
  { half: 8, top: 28 },
];
const ZIG_BURY = -4;
const ZIG_TOP = ZIG[ZIG.length - 1].top;

// The two drowned plazas and the buried amphitheatre, as footprints on the paving grid.
// Each one is a whole number of 50-stud tiles, so paveGround() can simply not lay the
// tiles they occupy instead of pretending a solid slab can be carved (it cannot: there is
// no CSG anywhere on ctx.engine.parts).
const FORUM = { x0: -200, x1: -100, z0: -50, z1: 50 };     // the drowned forum, west
const COURT = { x0: 50, x1: 150, z0: 50, z1: 150 };        // the tidal court, north-east
const BOWL = { cx: -100, cz: 100, half: 50 };              // the buried amphitheatre
const BOWL_BOX = { x0: -150, x1: -50, z0: 50, z1: 150 };

// The amphitheatre's seating, outermost band first: radius floor, and the top of that
// band's seats. Four bands of 2-stud risers, so the bowl is walked rather than jumped.
const BOWL_BANDS = [
  { r: 42, top: -2 },
  { r: 34, top: -4 },
  { r: 26, top: -6 },
];
const BOWL_OUTER_R = 50;        // the bowl is inscribed in its 100-stud footprint
const BOWL_CORNER = 28;         // |dx| and |dz| past this is sand drift at street level

// The collapsed aqueduct, the east approach to the ziggurat. Deck top 14, which is two
// studs over the ziggurat's third terrace, so the last jump is across and slightly down.
const AQ_DECK_TOP = 14;
const AQ_DECK_Z = 0;
const AQ_DECK_W = 12;
// Standing spans, west edge to east edge. The 46..53 hole is the collapse the ground is
// named for: a 7-stud gap, against a 10.6-stud running jump (FIGHT_WALK_SPEED 20 across
// 2*52/196.2 = 0.53 s of air), so it is a real jump and not a formality.
const AQ_SPANS = [
  { x0: 36, x1: 46 },
  { x0: 53, x1: 89 },
  { x0: 91, x1: 129 },
  { x0: 130, x1: 166 },
];
const AQ_PIERS = [50, 70, 110, 148, 163];

// The colonnade avenue: two roofless rows with a processional way between them. Pulled to
// z -76/-104 rather than -66/-94 so no column stands within 11 studs of a spawn ring.
const AVENUE_Z = -90;
const COL_ROWS = [-76, -104];
const COL_X0 = -140;
const COL_STEP = 28;
const COL_COUNT = 11;

// The eight half-buried house shells, hand-placed rather than scattered so none of them
// can land on a spawn: each is at least 28 studs from the nearest spawn ring position.
const SHELLS = [
  [-175, -170], [-95, -178], [-15, -172], [80, -178],
  [172, -108], [176, 92], [92, 176], [-176, 152],
];

// Spawn rings (§3.2 wants at least 20, the ROOM_MAX). Sixteen on an inner ring and eight
// on an outer one: the closest pair is 45.6 studs apart, so no two fighters can start
// inside each other whatever rank §4.1 hands them. The inner ring is offset 11.25 deg so
// that no spawn lands on the aqueduct ramp, in a column, or in a house shell; some of it
// lands in the drowned plazas and on the amphitheatre seating on purpose, and spawnY()
// puts those fighters on the real surface there rather than six studs above it.
const SPAWN_RINGS = [
  { r: 116, n: 16, a0: 11.25 },
  { r: 168, n: 8, a0: 22.5 },
];

// Warden spots (§9), in relative studs. All three are open street, inside a spawn ring's
// sightline, and none is on the ziggurat: a Warden that started on the high ground would
// hold the one thing the round is fought over before anybody had climbed to it.
const WARDEN_SPOTS = [[0, 70], [-60, -60], [100, -60]];

// =====================================================================================
// Helpers. All pure, all total.
// =====================================================================================

// Relative studs to absolute, in this ground's band.
function at(rx, y, rz) {
  return [ORIGIN_X + rx, y, ORIGIN_Z + rz];
}

// A tiny local generator. The language's own random source is off limits to a Place that
// has to agree with itself across peers and across a validator run (§3.2), so variety here
// is seeded: same seed, same ruin, every time, on every client. That matters more than it
// looks - two clients walking two different rubble fields would be fighting on two
// different grounds while each believed the round was shared.
function seeded(seed) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function inBox(rx, rz, box) {
  return rx >= box.x0 && rx <= box.x1 && rz >= box.z0 && rz <= box.z1;
}

// The walkable top at a point, ignoring the ziggurat and the built structures. Scatter,
// spawns and warden spots all read it, which is why it is one function rather than three
// guesses: a rubble block placed at the street surface inside a drowned plaza would hang
// six studs in the air, and a spawn there would drop a fighter on arrival.
function groundTopAt(rx, rz) {
  if (inBox(rx, rz, FORUM) || inBox(rx, rz, COURT)) return SUNK_TOP;
  if (inBox(rx, rz, BOWL_BOX)) {
    const dx = rx - BOWL.cx;
    const dz = rz - BOWL.cz;
    // The four corners of the bowl's square footprint are sand drift at street level -
    // solid, and tested here with exactly the extent the drift boxes are given, so there
    // is no sliver where this function and the geometry disagree.
    if (Math.abs(dx) >= BOWL_CORNER && Math.abs(dz) >= BOWL_CORNER) return GROUND_TOP;
    const r = Math.hypot(dx, dz);
    if (r >= BOWL_OUTER_R) return GROUND_TOP;
    for (const band of BOWL_BANDS) if (r >= band.r) return band.top;
    return ORCHESTRA_TOP;
  }
  return GROUND_TOP;
}

// The ziggurat's footprint, plus two studs of apron. Scatter skips it: the terraces are
// authored solid and a rubble block dropped at street level inside them would be buried.
function onZiggurat(rx, rz) {
  return Math.max(Math.abs(rx), Math.abs(rz)) <= ZIG[0].half + 2;
}

// The spawn ring positions in relative studs. build() lifts these into the band and the
// keep-out test below reads the same list, so the two can never disagree about where a
// fighter starts.
function spawnRel() {
  const out = [];
  for (const ring of SPAWN_RINGS) {
    for (let k = 0; k < ring.n; k++) out.push(polar(ring.r, ring.a0 + (360 / ring.n) * k));
  }
  return out;
}

// Keep-out circles: no scatter is dropped within `r` studs of a spawn, a weapon pad or a
// warden spot. This is not tidiness. The root clusters put one SOLID knee on the ground for
// cover, and a solid knee landing on a spawn would wedge an arriving fighter inside it, or
// on a pad would stand between a fighter and the only weapon in that corner of the map.
// Scatter that lands inside a circle is skipped rather than nudged, because nudging moves
// the ruin around for a reason a reader cannot see.
function clearOfPlay(rx, rz, r) {
  for (const [sx, sz] of spawnRel()) if (Math.hypot(rx - sx, rz - sz) < r) return false;
  for (const p of PAD_SPOTS) if (Math.hypot(rx - p.rx, rz - p.rz) < r) return false;
  for (const [wx, wz] of WARDEN_SPOTS) if (Math.hypot(rx - wx, rz - wz) < r) return false;
  return true;
}

// A box segment of a circle: its local X runs along the tangent at angle `aDeg`. The
// yaw that does that is -(aDeg + 90): rotating local +X by yaw t gives (cos t, -sin t),
// and the tangent at a is (-sin a, cos a), which solves to t = -(a + 90).
//
// The result is wrapped into (-180, 180]. The part schema clamps every rotation component
// to -360..360, so a segment at 348.75 deg round the bowl would otherwise ask for a yaw of
// -438.75 and be rejected outright - the amphitheatre's last three seat rings and the
// perch's rim would simply never build.
function tangentYaw(aDeg) {
  return wrapDeg(-(aDeg + 90));
}

function wrapDeg(deg) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

function polar(r, aDeg) {
  const a = (aDeg * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
}

// The two part pushers. `solid` is the blockout a fighter touches; `deco` is everything
// else and costs no collider at all (canCollide:false with zero behaviours registers
// none). Nothing here ever writes `id`, and `anchored` is left off because the runtime
// default is true and a runtime part is never instanced, so it stays mutable and
// removable either way.
// Neither closure reads `this`, so either one can be handed round as a bare value where a
// feature wants to alternate between them (the collapse scree does exactly that).
function maker(parts) {
  return {
    solid: (def) => { parts.push({ material: "cobble", ...def, canCollide: true }); },
    deco: (def) => { parts.push({ material: "cobble", ...def, canCollide: false }); },
  };
}

// =====================================================================================
// The street: 8 x 8 paving tiles, minus the twelve the plazas and the bowl occupy.
// =====================================================================================

function paveGround(m, rng) {
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const cx = -HALF + TILE / 2 + TILE * i;
      const cz = -HALF + TILE / 2 + TILE * j;
      if (inBox(cx, cz, FORUM) || inBox(cx, cz, COURT) || inBox(cx, cz, BOWL_BOX)) continue;
      // One collider per tile, 52 in all. The tile is thick so that where it borders a
      // sunken plaza its own side face IS the plaza wall, with nothing to see under it.
      m.solid({
        size: [TILE, TILE_THICK, TILE],
        position: at(cx, GROUND_TOP - TILE_THICK / 2, cz),
        color: (i + j) % 2 === 0 ? C.cobble : C.cobbleDark,
      });
    }
  }

  // Cracked courses and drifted sand over the paving. Thin, non-colliding, and rotated a
  // degree or two off the grid so the street reads as heaved rather than tiled.
  for (let k = 0; k < 54; k++) {
    const rx = -HALF + 12 + rng() * (2 * HALF - 24);
    const rz = -HALF + 12 + rng() * (2 * HALF - 24);
    if (onZiggurat(rx, rz)) continue;
    const top = groundTopAt(rx, rz);
    const w = 5 + rng() * 13;
    const d = 4 + rng() * 9;
    // ONE roll decides both colour and material. Two rolls gave sand-coloured cobble and
    // stone-coloured sand about half the time, which reads as a texture bug rather than a
    // ruin; the same pairing rule holds everywhere below.
    const drift = rng() < 0.45;
    m.deco({
      size: [w, 0.5, d],
      position: at(rx, top + 0.22, rz),
      rotation: [0, rng() * 360, 0],
      color: drift ? C.sand : C.cobbleWorn,
      material: drift ? "sand" : "cobble",
    });
  }

  // Drifts: `dome` collides as the cylinder around it, but these are deco so the shape is
  // free. They are what makes the ruin look half-swallowed rather than merely broken.
  for (let k = 0; k < 26; k++) {
    const rx = -HALF + 20 + rng() * (2 * HALF - 40);
    const rz = -HALF + 20 + rng() * (2 * HALF - 40);
    if (onZiggurat(rx, rz)) continue;
    const w = 9 + rng() * 16;
    m.deco({
      shape: "dome",
      size: [w, 1.6 + rng() * 2.4, w],
      position: at(rx, groundTopAt(rx, rz) + 0.1, rz),
      color: rng() < 0.5 ? C.sand : C.sandPale,
      material: "sand",
    });
  }
}

// =====================================================================================
// A drowned plaza: a sunken floor, six studs of shallow water over it, and broken steps
// down on two sides so it is a place you fight in rather than a pit you fall into.
// =====================================================================================

function drownedPlaza(m, rng, box, colonnade) {
  const cx = (box.x0 + box.x1) / 2;
  const cz = (box.z0 + box.z1) / 2;
  const w = box.x1 - box.x0;
  const d = box.z1 - box.z0;

  // One collider for the whole floor. Its top is SUNK_TOP and it reaches to -12, under
  // the street tiles' -10, so there is no seam to see through.
  m.solid({ size: [w, 6, d], position: at(cx, SUNK_TOP - 3, cz), color: C.cobbleDark });

  // The water. There is no water material in the sixteen (§3.2), so it is `ice` at a
  // cold blue with most of its transparency: you wade through it, because at 0.6 studs
  // deep and canCollide:false with no behaviour it has no collider to wade against.
  m.deco({
    size: [w - 4, 1, d - 4],
    position: at(cx, WADE_TOP - 0.5, cz),
    color: C.water, material: "ice", transparency: 0.55,
  });

  // Two flights of broken steps, on the +x and -z edges, three risers of two studs each.
  for (let s = 0; s < 3; s++) {
    const y = GROUND_TOP - 1.5 - s * 1.5;
    m.solid({
      size: [7, 3, 16],
      position: at(box.x1 - 3.5 - s * 6, y - 1.5, cz + 6),
      color: C.cobbleWorn,
    });
    m.solid({
      size: [16, 3, 7],
      position: at(cx - 6, y - 1.5, box.z0 + 3.5 + s * 6),
      color: C.cobbleWorn,
    });
  }

  // A stub colonnade around two sides, roofs long gone, and half of it in the water.
  for (let k = 0; k < colonnade; k++) {
    const side = k % 2 === 0;
    const rx = side ? box.x0 + 12 + (k / 2 | 0) * 22 : box.x1 - 10;
    const rz = side ? box.z0 + 9 : box.z0 + 14 + ((k - 1) / 2 | 0) * 24;
    const h = 7 + rng() * 9;
    m.solid({
      shape: "cylinder", size: [4, h, 4],
      position: at(rx, SUNK_TOP + h / 2, rz),
      color: C.marbleDim, material: "marble",
    });
    m.deco({
      shape: "cylinder", size: [5.6, 1.2, 5.6],
      position: at(rx, SUNK_TOP + 0.6, rz),
      color: C.marbleShadow, material: "marble",
    });
    // A broken top: the shaft ends in a jagged wedge rather than a capital, because the
    // whole conceit of this ground is that nothing kept its roof.
    m.deco({
      shape: "wedge", size: [4, 1.6, 4],
      position: at(rx, SUNK_TOP + h + 0.8, rz),
      rotation: [0, rng() * 360, 0],
      color: C.marble, material: "marble",
    });
  }

  // Toppled drums and slabs in the water, some of them solid so they are cover and a way
  // to stand dry. A cylinder with rotation [0, yaw, 90] lies on its side: its collider is
  // the rotated OBB, so the walkable top is the centre plus the radius.
  for (let k = 0; k < 7; k++) {
    const rx = box.x0 + 14 + rng() * (w - 28);
    const rz = box.z0 + 14 + rng() * (d - 28);
    const len = 10 + rng() * 16;
    const push = k % 2 === 0 ? m.solid : m.deco;
    push({
      shape: "cylinder", size: [4, len, 4],
      position: at(rx, SUNK_TOP + 2, rz),
      rotation: [0, rng() * 360, 90],
      color: C.marbleDim, material: "marble",
    });
  }
  for (let k = 0; k < 12; k++) {
    const rx = box.x0 + 8 + rng() * (w - 16);
    const rz = box.z0 + 8 + rng() * (d - 16);
    m.deco({
      size: [1.6 + rng() * 3, 1.2 + rng() * 2, 1.6 + rng() * 3],
      position: at(rx, SUNK_TOP + 0.8, rz),
      rotation: [0, rng() * 360, 0],
      color: rng() < 0.5 ? C.cobble : C.marbleShadow,
    });
  }
}

// =====================================================================================
// The buried amphitheatre. Four bands of seating around a sand-filled orchestra, with the
// square footprint's four corners drifted over at street level - which is what "buried"
// means here: you drop into it from the street on two sides and walk in over the drift on
// the other two.
// =====================================================================================

function amphitheatre(m, rng) {
  // The orchestra floor: the lowest walkable surface on this ground, 32 studs above KILL_Y
  // and therefore never the void's business.
  m.solid({
    shape: "cylinder", size: [54, 4, 54],
    position: at(BOWL.cx, ORCHESTRA_TOP - 2, BOWL.cz),
    color: C.sandDark, material: "sand",
  });

  // Seating. Sixteen segments a band, each a box turned to the tangent, so the ring is
  // walkable the whole way round and a fighter can circle the bowl at any height.
  BOWL_BANDS.forEach((band, bi) => {
    const rOuter = bi === 0 ? BOWL_OUTER_R : BOWL_BANDS[bi - 1].r;
    const rMid = (band.r + rOuter) / 2;
    const width = rOuter - band.r;
    const seg = (2 * Math.PI * rMid) / 16 + 1.5;
    for (let k = 0; k < 16; k++) {
      const aDeg = k * 22.5 + (bi % 2) * 11.25;
      const [dx, dz] = polar(rMid, aDeg);
      const h = band.top - ORCHESTRA_TOP + 4;
      m.solid({
        size: [seg, h, width],
        position: at(BOWL.cx + dx, band.top - h / 2, BOWL.cz + dz),
        rotation: [0, tangentYaw(aDeg), 0],
        color: bi % 2 === 0 ? C.marbleDim : C.marbleShadow,
        material: "marble",
      });
    }
  });

  // The corner drifts. Solid, street-level, and exactly the extent groundTopAt() tests
  // for, so scatter and spawns land on them instead of inside them.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      m.solid({
        size: [22, 12, 22],
        position: at(BOWL.cx + sx * 39, GROUND_TOP - 6, BOWL.cz + sz * 39),
        color: C.sand, material: "sand",
      });
      m.deco({
        shape: "dome", size: [26, 4, 26],
        position: at(BOWL.cx + sx * 39, GROUND_TOP, BOWL.cz + sz * 39),
        color: C.sandPale, material: "sand",
      });
    }
  }

  // The stage wall behind the orchestra, broken to a stump, and the two doors through it
  // that the actors used. Solid: it is the only cover in the bowl.
  for (let k = 0; k < 5; k++) {
    m.solid({
      size: [9, 5 + (k % 2) * 4, 3],
      position: at(BOWL.cx - 18 + k * 9, ORCHESTRA_TOP + (5 + (k % 2) * 4) / 2, BOWL.cz - 22),
      color: C.marbleDim, material: "marble",
    });
  }
  m.deco({
    size: [46, 1.4, 3.6],
    position: at(BOWL.cx, ORCHESTRA_TOP + 9.6, BOWL.cz - 22),
    color: C.marble, material: "marble",
  });

  // Sand over the lower seats, fallen masonry on the orchestra floor.
  for (let k = 0; k < 16; k++) {
    const aDeg = rng() * 360;
    const [dx, dz] = polar(6 + rng() * 40, aDeg);
    const rx = BOWL.cx + dx;
    const rz = BOWL.cz + dz;
    const masonry = rng() < 0.5;
    m.deco({
      size: [2 + rng() * 5, 1 + rng() * 2.4, 2 + rng() * 5],
      position: at(rx, groundTopAt(rx, rz) + 0.9, rz),
      rotation: [0, rng() * 360, rng() * 12 - 6],
      color: masonry ? C.marbleShadow : C.sandDark,
      material: masonry ? "marble" : "sand",
    });
  }
}

// =====================================================================================
// The ziggurat: seven terraces, two wedge stairs, a root scramble, and the collapse that
// makes the whole east corner climbable. This is the high ground (§3.2's verticality).
// =====================================================================================

function ziggurat(m, rng) {
  // Nested solid boxes, each from ZIG_BURY up to its own top. Seven colliders for the
  // whole mass, and no terrace can float over the rubble piled against it.
  ZIG.forEach((tier, ti) => {
    const h = tier.top - ZIG_BURY;
    m.solid({
      size: [tier.half * 2, h, tier.half * 2],
      position: at(0, ZIG_BURY + h / 2, 0),
      color: ti % 2 === 0 ? C.cobble : C.cobbleDark,
    });
  });

  // Facing stones: a course of blocks standing slightly proud of each terrace's edge, so
  // the mass reads as built out of stones rather than extruded. All deco, all free.
  ZIG.forEach((tier, ti) => {
    const prev = ti === 0 ? GROUND_TOP : ZIG[ti - 1].top;
    const band = tier.top - prev;
    for (let k = 0; k < 14; k++) {
      const t = (k + 0.5) / 14;
      const edge = tier.half + 0.35;
      const along = -tier.half + t * tier.half * 2;
      const side = (ti + k) % 4;
      const px = side === 0 ? along : side === 1 ? edge : side === 2 ? along : -edge;
      const pz = side === 0 ? -edge : side === 1 ? along : side === 2 ? edge : along;
      // A quarter of the facing is robbed marble, older than the ziggurat that wears it.
      const robbed = rng() < 0.25;
      m.deco({
        size: [3.2 + rng() * 2.4, band * (0.55 + rng() * 0.3), 1.1],
        position: at(px, prev + band * 0.5, pz),
        rotation: [0, side === 0 || side === 2 ? 0 : 90, 0],
        color: robbed ? C.marbleShadow : C.cobbleWorn,
        material: robbed ? "marble" : "cobble",
      });
    }
  });

  // The two stairs. One wedge a terrace, 4 up over 6 across, i.e. 33.7 deg, which is well
  // inside the walkable slope (a 50 deg wedge is climbable, a 60 deg one slides). A
  // wedge's high edge is its local -Z, so yaw 0 climbs toward -z and yaw -90 climbs
  // toward +x; the south stair therefore sits on +z and the west stair on -x, and each
  // wedge's high edge lands exactly on the terrace top it serves.
  ZIG.forEach((tier, ti) => {
    const prev = ti === 0 ? GROUND_TOP : ZIG[ti - 1].top;
    m.solid({
      shape: "wedge", size: [8, 4, 6],
      position: at(0, prev + 2, tier.half + 3),
      color: C.cobbleWorn,
    });
    m.solid({
      shape: "wedge", size: [8, 4, 6],
      position: at(-(tier.half + 3), prev + 2, 0),
      rotation: [0, -90, 0],
      color: C.cobbleWorn,
    });
    // Balustrade stumps flanking both stairs, so the route reads from the ground.
    for (const s of [-1, 1]) {
      m.deco({
        size: [1.4, 2.6, 6],
        position: at(s * 5, prev + 1.3 + 2, tier.half + 3),
        color: C.marbleShadow, material: "marble",
      });
      m.deco({
        size: [6, 2.6, 1.4],
        position: at(-(tier.half + 3), prev + 1.3 + 2, s * 5),
        color: C.marbleShadow, material: "marble",
      });
    }
  });

  // The north scramble: a giant root grown up the face. A cylinder rotated about X leans
  // its axis over; at 62 deg from vertical the top surface arrives about level with the
  // second terrace, so the hand-off onto the stone is a step and not a jump. Solid,
  // because being able to run up it is the whole point of a fourth approach.
  const rootLen = 27;
  const tilt = 62;
  const rad = (tilt * Math.PI) / 180;
  const rootCz = -60 + (rootLen / 2) * Math.sin(rad);
  const rootCy = -1 + (rootLen / 2) * Math.cos(rad);
  for (const s of [-1, 0, 1]) {
    const push = s === 0 ? m.solid : m.deco;
    push({
      shape: "cylinder", size: [s === 0 ? 6.5 : 4, rootLen + s * 3, s === 0 ? 6.5 : 4],
      position: at(s * 7.5, rootCy, rootCz + s * 2),
      rotation: [tilt, s * 14, 0],
      color: s === 0 ? C.root : C.rootPale, material: "wood",
    });
  }
  // Rubble stacked under the root, so the bottom of the scramble is a step up rather than
  // a ledge, and so the north face reads as the one the trees actually broke.
  for (let k = 0; k < 4; k++) {
    m.solid({
      size: [8 - k, 2 + k * 1.6, 6],
      position: at(-3 + k * 2, GROUND_TOP + (2 + k * 1.6) / 2, -56 + k * 5),
      rotation: [0, rng() * 20 - 10, 0],
      color: C.cobbleWorn,
    });
  }

  // The crack. The east corner of the upper terraces came down, and what came down is
  // still there: a scree of blocks a fighter can pick their way up, plus the scar it left.
  for (let k = 0; k < 11; k++) {
    const t = k / 10;
    const rx = 21 + t * 26;
    const rz = -21 - t * 20;
    const h = 2.4 + rng() * 3;
    const faced = rng() < 0.3;
    const push = k % 3 === 0 ? m.solid : m.deco;
    push({
      size: [5 + rng() * 4, h, 5 + rng() * 4],
      position: at(rx, GROUND_TOP + (1 - t) * 9 + h / 2, rz),
      rotation: [rng() * 16 - 8, rng() * 360, rng() * 16 - 8],
      color: faced ? C.marbleShadow : C.cobble,
      material: faced ? "marble" : "cobble",
    });
  }
  m.deco({
    size: [2.4, 22, 3.4],
    position: at(19, 12, -19),
    rotation: [0, 45, 6],
    color: C.cobbleDark,
  });

  // Vines down the north and west faces, hanging off the terrace lips.
  for (let k = 0; k < 14; k++) {
    const ti = 1 + ((k * 3) % 5);
    const tier = ZIG[ti];
    const along = -tier.half + rng() * tier.half * 2;
    const west = k % 2 === 0;
    const len = 4 + rng() * 7;
    m.deco({
      shape: "cylinder", size: [0.7, len, 0.7],
      position: at(west ? -tier.half - 0.4 : along, tier.top - len / 2, west ? along : -tier.half - 0.4),
      rotation: [rng() * 8, 0, rng() * 8],
      color: C.vine, material: "grass",
    });
    m.deco({
      shape: "sphere", size: [2.2, 2.2, 2.2],
      position: at(west ? -tier.half - 0.4 : along, tier.top - len, west ? along : -tier.half - 0.4),
      color: C.vineLeaf, material: "grass",
    });
  }

  // The summit. A cracked altar, four stub columns where the shrine's roof used to sit,
  // and the glyph pylon that lights it - the one thing on this ground visible from every
  // spawn, which is what makes the high ground worth walking to.
  m.solid({
    size: [7, 1.6, 5],
    position: at(0, ZIG_TOP + 0.8, -4),
    color: C.marble, material: "marble",
  });
  for (const sx of [-5, 5]) {
    for (const sz of [-5, 5]) {
      m.deco({
        shape: "cylinder", size: [2.2, 5.5, 2.2],
        position: at(sx, ZIG_TOP + 2.75, sz),
        color: C.marbleDim, material: "marble",
      });
      m.deco({
        shape: "wedge", size: [2.2, 1.2, 2.2],
        position: at(sx, ZIG_TOP + 6.1, sz),
        rotation: [0, sx * sz > 0 ? 30 : -30, 0],
        color: C.marble, material: "marble",
      });
    }
  }
  m.deco({
    size: [11, 1.2, 1.6],
    position: at(0, ZIG_TOP + 6.4, -5),
    color: C.marbleShadow, material: "marble",
  });
}

// =====================================================================================
// The collapsed aqueduct: the east approach, and the ground's one real jump.
// =====================================================================================

function aqueduct(m, rng) {
  // The ramp up off the street. A wedge with yaw 90 climbs toward -x, so this one runs
  // 32 studs west and 14 up: 23.6 deg, an easy walk, because the interesting part of this
  // route is the gap at the far end and not the way onto it.
  m.solid({
    shape: "wedge", size: [AQ_DECK_W, AQ_DECK_TOP, 32],
    position: at(182, AQ_DECK_TOP / 2, AQ_DECK_Z),
    rotation: [0, 90, 0],
    color: C.cobbleWorn,
  });

  // The standing spans. Each is one solid deck slab; the holes between them are the
  // collapse, and the 46..53 one is the 7-stud jump.
  for (const span of AQ_SPANS) {
    const len = span.x1 - span.x0;
    m.solid({
      size: [len, 2, AQ_DECK_W],
      position: at((span.x0 + span.x1) / 2, AQ_DECK_TOP - 1, AQ_DECK_Z),
      color: C.cobble,
    });
    // A parapet down both sides of the deck, deco so it never narrows the walkway the
    // collider actually gives you.
    for (const sz of [-1, 1]) {
      m.deco({
        size: [len, 1.8, 1.2],
        position: at((span.x0 + span.x1) / 2, AQ_DECK_TOP + 0.9, AQ_DECK_Z + sz * (AQ_DECK_W / 2 - 0.6)),
        color: C.cobbleWorn,
      });
    }
    // The water channel the thing was built for, dry for a thousand years.
    m.deco({
      size: [len - 1, 0.5, AQ_DECK_W - 5],
      position: at((span.x0 + span.x1) / 2, AQ_DECK_TOP + 0.25, AQ_DECK_Z),
      color: C.sandDark, material: "sand",
    });
  }

  // Piers, and the arches between them. The piers are solid because they are cover at
  // street level; the arch haunches are deco, since an arch whose collider is its
  // bounding box would wall off the street under the deck.
  AQ_PIERS.forEach((px, pi) => {
    m.solid({
      size: [10, 20, AQ_DECK_W + 2],
      position: at(px, 3, AQ_DECK_Z),
      color: pi % 2 === 0 ? C.cobble : C.cobbleDark,
    });
    m.deco({
      size: [13, 2, AQ_DECK_W + 4],
      position: at(px, 12, AQ_DECK_Z),
      color: C.cobbleWorn,
    });
    for (const s of [-1, 1]) {
      m.deco({
        shape: "wedge", size: [AQ_DECK_W, 7, 9],
        position: at(px + s * 9.5, 8.5, AQ_DECK_Z),
        rotation: [0, s > 0 ? -90 : 90, 0],
        color: C.cobbleDark,
      });
    }
  });

  // The span that fell. It is still lying where it landed, tilted against a pier, and it
  // is solid: a fighter who will not take the 7-stud jump can climb the wreck instead, at
  // the cost of dropping to street level to do it.
  m.solid({
    size: [16, 2.4, 11],
    position: at(49, 6.2, AQ_DECK_Z + 1),
    rotation: [0, 8, 26],
    color: C.cobble,
  });
  m.solid({
    size: [9, 2.4, 10],
    position: at(46, 2.4, AQ_DECK_Z - 6),
    rotation: [0, -22, 9],
    color: C.cobbleDark,
  });
  for (let k = 0; k < 10; k++) {
    const rx = 38 + rng() * 26;
    const rz = AQ_DECK_Z - 12 + rng() * 24;
    m.deco({
      size: [2 + rng() * 4, 1.4 + rng() * 2.4, 2 + rng() * 4],
      position: at(rx, groundTopAt(rx, rz) + 1, rz),
      rotation: [rng() * 20 - 10, rng() * 360, rng() * 20 - 10],
      color: rng() < 0.5 ? C.cobble : C.cobbleWorn,
    });
  }

  // Roots have got into the masonry and are prising the last spans apart.
  for (let k = 0; k < 9; k++) {
    const px = AQ_PIERS[k % AQ_PIERS.length];
    m.deco({
      shape: "cylinder", size: [1.4, 13 + rng() * 6, 1.4],
      position: at(px + rng() * 8 - 4, 5 + rng() * 6, AQ_DECK_Z + (k % 2 === 0 ? 7 : -7)),
      rotation: [rng() * 30 - 15, rng() * 360, rng() * 26 - 13],
      color: C.root, material: "wood",
    });
  }
}

// =====================================================================================
// The colonnade avenue, its architrave fragments, and the columns that came down.
// =====================================================================================

function colonnade(m, rng) {
  const standing = [];
  for (const rowZ of COL_ROWS) {
    for (let k = 0; k < COL_COUNT; k++) {
      const rx = COL_X0 + k * COL_STEP;
      const fallen = rng() < 0.28;
      if (fallen) {
        // A stump, and the shaft lying where it fell across the processional way. Solid:
        // a fallen column is the best cover on a flat street.
        m.solid({
          shape: "cylinder", size: [4.4, 2.4, 4.4],
          position: at(rx, GROUND_TOP + 1.2, rowZ),
          color: C.marbleShadow, material: "marble",
        });
        const towardAvenue = rowZ < AVENUE_Z ? 1 : -1;
        m.solid({
          shape: "cylinder", size: [4.4, 17, 4.4],
          position: at(rx + rng() * 6 - 3, GROUND_TOP + 2.2, rowZ + towardAvenue * 9),
          rotation: [0, 82 + rng() * 16, 90],
          color: C.marbleDim, material: "marble",
        });
        for (let d = 0; d < 3; d++) {
          m.deco({
            shape: "cylinder", size: [4.2, 2.4, 4.2],
            position: at(rx + 8 + d * 5 + rng() * 3, GROUND_TOP + 2.1, rowZ + towardAvenue * (13 + d * 2)),
            rotation: [0, rng() * 360, 90],
            color: C.marbleShadow, material: "marble",
          });
        }
        continue;
      }
      // A standing column: one solid shaft, and a base, two fluting bands and a capital
      // that cost nothing. About a third have lost their capital as well.
      const h = 16 + rng() * 3;
      m.solid({
        shape: "cylinder", size: [4.4, h, 4.4],
        position: at(rx, GROUND_TOP + 1.5 + h / 2, rowZ),
        color: C.marble, material: "marble",
      });
      m.deco({
        shape: "cylinder", size: [6.2, 1.5, 6.2],
        position: at(rx, GROUND_TOP + 0.75, rowZ),
        color: C.marbleDim, material: "marble",
      });
      for (const fy of [0.32, 0.66]) {
        m.deco({
          shape: "cylinder", size: [4.8, 0.5, 4.8],
          position: at(rx, GROUND_TOP + 1.5 + h * fy, rowZ),
          color: C.marbleShadow, material: "marble",
        });
      }
      const capped = rng() > 0.34;
      if (capped) {
        m.deco({
          shape: "cylinder", size: [5.8, 1.6, 5.8],
          position: at(rx, GROUND_TOP + 1.5 + h + 0.8, rowZ),
          color: C.marble, material: "marble",
        });
        standing.push([rx, rowZ, GROUND_TOP + 1.5 + h + 1.6]);
      } else {
        m.deco({
          shape: "wedge", size: [4.4, 2, 4.4],
          position: at(rx, GROUND_TOP + 1.5 + h + 1, rowZ),
          rotation: [0, rng() * 360, 0],
          color: C.marbleDim, material: "marble",
        });
      }
    }
  }

  // The architrave. Almost all of it is on the ground; six lintels are still up, which is
  // enough to tell you there was a roof and enough to prove there is not one now.
  for (let k = 0; k + 1 < standing.length; k += 3) {
    const a = standing[k];
    const b = standing[k + 1];
    if (a[1] !== b[1] || Math.abs(a[0] - b[0]) > COL_STEP + 2) continue;
    m.deco({
      size: [Math.abs(a[0] - b[0]) + 5, 2.2, 5],
      position: at((a[0] + b[0]) / 2, Math.min(a[2], b[2]) + 1.1, a[1]),
      color: C.marbleDim, material: "marble",
    });
  }

  // Paving down the processional way, so the avenue reads as a street and not a gap
  // between two rows of stone.
  for (let k = 0; k < 11; k++) {
    m.deco({
      size: [26, 0.6, 20],
      position: at(-140 + k * 28, GROUND_TOP + 0.25, AVENUE_Z),
      rotation: [0, rng() * 4 - 2, 0],
      color: k % 2 === 0 ? C.cobbleWorn : C.cobble,
    });
  }
}

// =====================================================================================
// Statues, every one of them missing its head. Plinth and body are solid, because a
// fighting ground needs waist-high cover you can break a sightline behind; arms and
// shoulders are deco so nobody snags on them.
// =====================================================================================

function statue(m, rng, rx, rz, yaw, baseTop) {
  m.solid({
    size: [5, 4, 5],
    position: at(rx, baseTop + 2, rz),
    rotation: [0, yaw, 0],
    color: C.marbleDim, material: "marble",
  });
  m.deco({
    size: [6, 0.8, 6],
    position: at(rx, baseTop + 4.4, rz),
    rotation: [0, yaw, 0],
    color: C.marble, material: "marble",
  });
  m.solid({
    shape: "cylinder", size: [3.2, 5.6, 3.2],
    position: at(rx, baseTop + 7.6, rz),
    color: C.marble, material: "marble",
  });
  m.deco({
    size: [2.9, 3.4, 2],
    position: at(rx, baseTop + 12.1, rz),
    rotation: [0, yaw, 0],
    color: C.marble, material: "marble",
  });
  m.deco({
    size: [4.6, 1, 2],
    position: at(rx, baseTop + 13.9, rz),
    rotation: [0, yaw, rng() * 6 - 3],
    color: C.marbleDim, material: "marble",
  });
  // One arm still raised, one gone at the shoulder.
  m.deco({
    shape: "cylinder", size: [1, 4.4, 1],
    position: at(rx + 1.9, baseTop + 14.6, rz),
    rotation: [0, 0, 28],
    color: C.marble, material: "marble",
  });
  // The neck, broken level. No head: that is the ground's one repeated joke, and it is
  // also the honest thing, since nothing here kept its face either.
  m.deco({
    shape: "cylinder", size: [1.5, 0.7, 1.5],
    position: at(rx, baseTop + 14.7, rz),
    color: C.marbleShadow, material: "marble",
  });
  m.deco({
    shape: "ring", size: [3.4, 3.4, 0.5],
    position: at(rx, baseTop + 13.4, rz),
    rotation: [90, yaw, 0],
    color: C.bronze, material: "gold",
  });
}

function statues(m, rng) {
  const spots = [
    [-105, AVENUE_Z, 0], [-35, AVENUE_Z, 180], [35, AVENUE_Z, 0], [105, AVENUE_Z, 180],
    [-150, 20, 90], [130, -150, -45], [-30, 150, 160], [150, 40, -90],
  ];
  for (const [rx, rz, yaw] of spots) statue(m, rng, rx, rz, yaw, groundTopAt(rx, rz));

  // The heads, where they rolled. Deco spheres, because a head you can stand on is a
  // different kind of joke.
  const heads = [[-99, -78], [-30, -101], [41, -80], [-146, 12]];
  for (const [rx, rz] of heads) {
    m.deco({
      shape: "sphere", size: [3, 3, 3],
      position: at(rx, groundTopAt(rx, rz) + 1.5, rz),
      rotation: [rng() * 40 - 20, rng() * 360, rng() * 40 - 20],
      color: C.marble, material: "marble",
    });
    m.deco({
      size: [3.4, 0.6, 3.4],
      position: at(rx, groundTopAt(rx, rz) + 0.3, rz),
      rotation: [0, rng() * 360, 0],
      color: C.sandDark, material: "sand",
    });
  }
}

// =====================================================================================
// The obelisk that is still standing, and the three that are not standing on anything.
// =====================================================================================

function obelisks(m, rng) {
  // The standing obelisk: a landmark on the open east street, 44 studs to the tip, which
  // is well under the perch at 90 so nothing on this ground blocks a spectator's view.
  const rx = 120;
  const rz = -120;
  m.solid({ size: [12, 4, 12], position: at(rx, 2, rz), color: C.marbleDim, material: "marble" });
  m.solid({ size: [6, 14, 6], position: at(rx, 11, rz), color: C.marble, material: "marble" });
  m.deco({ size: [5, 12, 5], position: at(rx, 24, rz), color: C.marble, material: "marble" });
  m.deco({ size: [4, 10, 4], position: at(rx, 35, rz), color: C.marbleDim, material: "marble" });
  m.deco({ shape: "pyramid", size: [4, 4, 4], position: at(rx, 42, rz), color: C.bronze, material: "gold" });
  for (const s of [-1, 1]) {
    m.deco({
      size: [0.4, 30, 0.4],
      position: at(rx + s * 3.1, 24, rz),
      color: C.glyphViolet, material: "neon",
    });
    m.deco({
      size: [0.4, 30, 0.4],
      position: at(rx, 24, rz + s * 3.1),
      color: C.glyphViolet, material: "neon",
    });
  }
  // The steps around it, and the drift that is taking the west side.
  for (let k = 0; k < 4; k++) {
    m.deco({
      size: [16 - k * 1.5, 0.8, 16 - k * 1.5],
      position: at(rx, 0.4 + k * 0.7, rz),
      color: C.cobbleWorn,
    });
  }
  m.deco({
    shape: "dome", size: [20, 5, 20],
    position: at(rx - 8, GROUND_TOP, rz + 4),
    color: C.sand, material: "sand",
  });

  // The three that float, and hum. Deco, deliberately: a platform 30 studs up that no
  // jump can reach is a tease, and one a jump CAN reach would be a better perch than the
  // ziggurat and would quietly replace the high ground this map is built around.
  const floaters = [[-14, 34, 132], [44, 46, -152], [-152, 38, -138]];
  for (const [fx, fy, fz] of floaters) {
    m.deco({
      shape: "diamond", size: [7, 18, 7],
      position: at(fx, fy, fz),
      rotation: [rng() * 10 - 5, rng() * 360, rng() * 10 - 5],
      color: C.galaxy, material: "galaxy",
    });
    m.deco({
      shape: "ring", size: [13, 13, 1],
      position: at(fx, fy - 2, fz),
      rotation: [90, rng() * 360, 0],
      color: C.glyphViolet, material: "neon", transparency: 0.35,
    });
    for (const s of [-1, 1]) {
      m.deco({
        shape: "diamond", size: [2.4, 5, 2.4],
        position: at(fx + s * 6, fy + s * 3, fz - s * 5),
        rotation: [0, rng() * 360, s * 18],
        color: C.galaxy, material: "galaxy",
      });
    }
  }
}

// =====================================================================================
// Glyph stones: the only light source on this ground (§3.2's "dim, fogged").
//
// The renderer lights at most TWO point lights on the low tier, and SwiftShader and every
// phone report low (§3.3), so the atmosphere here is carried by fog colour, `neon` faces
// and `galaxy` inlay - never by lamp count. Six stones carry a `light` block and they sit
// at the six places a fight actually happens, so whichever two the renderer picks are two
// that matter. `light` is omitted entirely on the rest: a "light": null key is a hard
// schema error, not a no-op.
// =====================================================================================

const GLYPH_PYLONS = [
  { rx: 0, rz: 8, top: ZIG_TOP, range: 34 },        // the summit shrine
  { rx: -150, rz: -18, top: SUNK_TOP, range: 30 },  // the drowned forum
  { rx: 96, rz: 96, top: SUNK_TOP, range: 30 },     // the tidal court
  { rx: -100, rz: 112, top: ORCHESTRA_TOP, range: 28 }, // the orchestra floor
  { rx: 40, rz: -8, top: GROUND_TOP, range: 26 },   // under the broken span
  { rx: 132, rz: -120, top: GROUND_TOP, range: 26 },    // the obelisk plaza
];

function glyphStones(m, rng) {
  for (const p of GLYPH_PYLONS) {
    m.solid({
      size: [3, 9, 3],
      position: at(p.rx, p.top + 4.5, p.rz),
      rotation: [0, 18, 2],
      color: C.cobbleDark,
    });
    m.deco({
      size: [2.2, 6, 0.4],
      position: at(p.rx, p.top + 5, p.rz + 1.6),
      rotation: [0, 18, 2],
      color: C.glyph, material: "neon",
      light: { color: C.glyph, intensity: 2.6, range: p.range },
    });
    m.deco({
      shape: "ring", size: [5.5, 5.5, 0.6],
      position: at(p.rx, p.top + 0.3, p.rz),
      rotation: [90, 0, 0],
      color: C.glyph, material: "neon", transparency: 0.4,
    });
  }

  // The unlit ones: twenty-two leaning slabs with a glyph cut into the face. No lamp, so
  // no draw-call cost beyond the mesh, and they still read at distance because `neon` is
  // emissive at any tier.
  for (let k = 0; k < 22; k++) {
    const rx = -HALF + 24 + rng() * (2 * HALF - 48);
    const rz = -HALF + 24 + rng() * (2 * HALF - 48);
    if (onZiggurat(rx, rz) || !clearOfPlay(rx, rz, 8)) continue;
    const top = groundTopAt(rx, rz);
    const h = 3.4 + rng() * 3.6;
    const yaw = rng() * 360;
    m.deco({
      size: [2.6, h, 1],
      position: at(rx, top + h / 2, rz),
      rotation: [rng() * 12 - 6, yaw, rng() * 10 - 5],
      color: C.cobbleDark,
    });
    m.deco({
      size: [1.6, h * 0.6, 0.3],
      position: at(rx, top + h * 0.55, rz + 0.6),
      rotation: [0, yaw, 0],
      color: rng() < 0.4 ? C.glyphViolet : C.glyph, material: "neon",
    });
  }
}

// =====================================================================================
// Roots and vines, breaking through stone, and the house shells the sand is taking.
// =====================================================================================

function overgrowth(m, rng) {
  // Root clusters: a knot of leaning cylinders through the paving, with the slab they
  // lifted tipped up beside them.
  for (let k = 0; k < 15; k++) {
    const rx = -HALF + 30 + rng() * (2 * HALF - 60);
    const rz = -HALF + 30 + rng() * (2 * HALF - 60);
    if (onZiggurat(rx, rz) || !clearOfPlay(rx, rz, 13)) continue;
    const top = groundTopAt(rx, rz);
    const n = 3 + ((k * 7) % 3);
    for (let i = 0; i < n; i++) {
      const len = 7 + rng() * 11;
      // The thickness is drawn ONCE and used for both x and z: a cylinder whose size[0]
      // and size[2] differ is a schema error, and two rng() calls would have differed on
      // every root here (the first pass of this file did exactly that).
      const thick = 1.2 + rng() * 1.4;
      m.deco({
        shape: "cylinder", size: [thick, len, thick],
        position: at(rx + rng() * 7 - 3.5, top + len * 0.3, rz + rng() * 7 - 3.5),
        rotation: [42 + rng() * 40, rng() * 360, rng() * 30 - 15],
        color: rng() < 0.5 ? C.root : C.rootPale, material: "wood",
      });
    }
    m.deco({
      size: [6 + rng() * 4, 0.8, 5 + rng() * 4],
      position: at(rx + 4, top + 1.6, rz + 3),
      rotation: [rng() * 34 + 8, rng() * 360, rng() * 16 - 8],
      color: C.cobbleWorn,
    });
    // One knee of the root arches high enough to be cover, so the overgrowth is not
    // purely scenery on a ground where a broken sightline is the only defence there is.
    if (k % 3 === 0) {
      m.solid({
        shape: "cylinder", size: [3, 11, 3],
        position: at(rx - 2, top + 2.4, rz - 2),
        rotation: [74, rng() * 360, 0],
        color: C.root, material: "wood",
      });
    }
  }

  // Vine drapes, hung wherever there is a wall left to hang from.
  for (let k = 0; k < 18; k++) {
    const rx = -HALF + 26 + rng() * (2 * HALF - 52);
    const rz = -HALF + 26 + rng() * (2 * HALF - 52);
    if (onZiggurat(rx, rz) || !clearOfPlay(rx, rz, 7)) continue;
    const top = groundTopAt(rx, rz);
    const len = 5 + rng() * 8;
    m.deco({
      shape: "cylinder", size: [0.6, len, 0.6],
      position: at(rx, top + len / 2 + 1, rz),
      rotation: [rng() * 14 - 7, 0, rng() * 14 - 7],
      color: C.vine, material: "grass",
    });
    for (let i = 0; i < 2; i++) {
      // A sphere needs all three sizes equal, so the leaf bundle's diameter is one draw.
      const leaf = 2 + rng();
      m.deco({
        shape: "sphere", size: [leaf, leaf, leaf],
        position: at(rx + rng() * 3 - 1.5, top + 1 + len * (0.3 + i * 0.4), rz + rng() * 3 - 1.5),
        color: i === 0 ? C.vineLeaf : C.vine, material: "grass",
      });
    }
  }
}

function houseShells(m, rng) {
  for (const [rx, rz] of SHELLS) {
    const top = groundTopAt(rx, rz);
    const yaw = rng() * 360;
    // Three wall fragments of different heights around a floor that is mostly sand. Solid:
    // these are the only rooms on the ground, and a room is where a common weapon beats a
    // legendary one.
    const walls = [
      { dx: 0, dz: -9, w: 20, h: 9, r: 0 },
      { dx: -9.5, dz: 0, w: 18, h: 6.5, r: 90 },
      { dx: 8, dz: 7, w: 10, h: 4.5, r: 0 },
    ];
    const cos = Math.cos((yaw * Math.PI) / 180);
    const sin = Math.sin((yaw * Math.PI) / 180);
    for (const wall of walls) {
      // wrapDeg, because `yaw + wall.r` runs past 360 for any shell turned more than 270
      // degrees, and a rotation component outside -360..360 is a schema error: two of
      // these eight shells lost a wall to exactly that before this was wrapped.
      const wallYaw = wrapDeg(yaw + wall.r);
      const wx = rx + wall.dx * cos - wall.dz * sin;
      const wz = rz + wall.dx * sin + wall.dz * cos;
      m.solid({
        size: [wall.w, wall.h, 2.4],
        position: at(wx, top + wall.h / 2, wz),
        rotation: [0, wallYaw, 0],
        color: rng() < 0.5 ? C.cobble : C.cobbleDark,
      });
      // The broken top course, stepped down at one end.
      m.deco({
        size: [wall.w * 0.4, 1.6, 2.8],
        position: at(wx + wall.w * 0.22 * cos, top + wall.h + 0.8, wz + wall.w * 0.22 * sin),
        rotation: [0, wallYaw, rng() * 8 - 4],
        color: C.cobbleWorn,
      });
    }
    m.deco({
      size: [20, 0.6, 20],
      position: at(rx, top + 0.3, rz),
      rotation: [0, yaw, 0],
      color: C.sandDark, material: "sand",
    });
    m.deco({
      shape: "dome", size: [17, 4.5, 17],
      position: at(rx + 5, top, rz + 5),
      color: C.sand, material: "sand",
    });
    for (let k = 0; k < 4; k++) {
      m.deco({
        size: [2 + rng() * 3.4, 1.4 + rng() * 2, 2 + rng() * 3.4],
        position: at(rx + rng() * 18 - 9, top + 1, rz + rng() * 18 - 9),
        rotation: [rng() * 18 - 9, rng() * 360, rng() * 18 - 9],
        color: rng() < 0.5 ? C.cobbleWorn : C.cobbleDark,
      });
    }
  }
}

// =====================================================================================
// The perch (§3.2, §12.1). REQUIRED, and it is a real place rather than a coordinate: a
// dead fighter's checkpoint is set to it before the round starts, so if there were nothing
// solid here the engine's unvetoable 1.0 s respawn would drop them straight back onto the
// ground they just died on. It sits at origin + [0, 90, 0], which is 46 studs clear of the
// tallest thing on the map (the standing obelisk's tip at 44) and directly over the
// ziggurat, so the whole ground reads from it inside a fog far of 220.
// =====================================================================================

function perchIsland(m, rng) {
  m.solid({
    shape: "cylinder", size: [26, 2, 26],
    position: at(0, PERCH_TOP - 1, 0),
    color: C.cobble,
  });
  m.deco({
    shape: "dome", size: [26, 7, 26],
    position: at(0, PERCH_TOP - 8.5, 0),
    rotation: [180, 0, 0],
    color: C.cobbleDark,
  });
  // A broken rim, four stub columns and a fallen lintel: the same ruin as the ground
  // below, torn out of it, which is why roots still hang off the underside.
  for (let k = 0; k < 10; k++) {
    const [dx, dz] = polar(11.6, k * 36);
    m.deco({
      size: [4.4, 1.6 + rng() * 1.6, 1.6],
      position: at(dx, PERCH_TOP + 0.8, dz),
      rotation: [0, tangentYaw(k * 36), 0],
      color: k % 2 === 0 ? C.marbleShadow : C.cobbleWorn,
      material: k % 2 === 0 ? "marble" : "cobble",
    });
  }
  for (let k = 0; k < 4; k++) {
    const [dx, dz] = polar(7.5, 45 + k * 90);
    m.deco({
      shape: "cylinder", size: [2.2, 6 + (k % 2) * 2, 2.2],
      position: at(dx, PERCH_TOP + 3 + (k % 2), dz),
      color: C.marble, material: "marble",
    });
  }
  m.deco({
    size: [12, 1.4, 2.6],
    position: at(0, PERCH_TOP + 7.4, -7.5),
    rotation: [0, 4, 0],
    color: C.marbleDim, material: "marble",
  });
  m.deco({
    size: [2.4, 6.5, 0.4],
    position: at(0, PERCH_TOP + 3.2, 3),
    color: C.glyph, material: "neon",
    light: { color: C.glyph, intensity: 2.2, range: 40 },
  });
  for (let k = 0; k < 7; k++) {
    const [dx, dz] = polar(4 + rng() * 8, rng() * 360);
    const len = 6 + rng() * 9;
    const thick = 1 + rng();
    m.deco({
      shape: "cylinder", size: [thick, len, thick],
      position: at(dx, PERCH_TOP - 4 - len / 2, dz),
      rotation: [rng() * 24 - 12, rng() * 360, rng() * 24 - 12],
      color: rng() < 0.5 ? C.root : C.rootPale, material: "wood",
    });
  }
}

// =====================================================================================
// Weapon pads (§7.2). Exactly TUNE.WEAPON_PADS_PER_MAP of them, spread over every height
// band the ground has: three on the ziggurat, two in the drowned forum, one in the tidal
// court, one on the orchestra floor, two on the aqueduct, and three on the street.
//
// A pad is canCollide:false WITH a touchEvent behaviour, which is exactly what makes it a
// sensor rather than a wall. It is NEVER `collectible`: a collectible of kind "oofbux" is
// bridged to a real payout by the economy service, so a ground full of them would quietly
// print Oofbux. The behaviour's own cooldownS is only there to stop a fighter standing on
// the pad re-firing it every tick; the real 25 s re-arm is WEAPON_RESPAWN_S in game code,
// because a behaviour param cannot be rewritten once initBehaviorRuntime has read it.
// =====================================================================================

const PAD_SPOTS = [
  { id: "zig-summit", event: "fg_pad_summit", rx: 0, rz: 4, top: ZIG_TOP },
  { id: "zig-terrace", event: "fg_pad_terrace", rx: 23, rz: 0, top: ZIG[3].top },
  { id: "zig-apron", event: "fg_pad_apron", rx: 0, rz: -41, top: ZIG[0].top },
  { id: "forum-west", event: "fg_pad_forum_w", rx: -175, rz: -25, top: SUNK_TOP },
  { id: "forum-east", event: "fg_pad_forum_e", rx: -125, rz: 25, top: SUNK_TOP },
  { id: "tidal-court", event: "fg_pad_court", rx: 120, rz: 120, top: SUNK_TOP },
  { id: "orchestra", event: "fg_pad_orchestra", rx: -100, rz: 100, top: ORCHESTRA_TOP },
  { id: "span-deck", event: "fg_pad_span", rx: 112, rz: 0, top: AQ_DECK_TOP },
  { id: "span-stub", event: "fg_pad_stub", rx: 41, rz: 0, top: AQ_DECK_TOP },
  { id: "obelisk", event: "fg_pad_obelisk", rx: 106, rz: -106, top: GROUND_TOP },
  { id: "avenue", event: "fg_pad_avenue", rx: -40, rz: -90, top: GROUND_TOP },
  { id: "shell-east", event: "fg_pad_shell", rx: 176, rz: 92, top: GROUND_TOP },
];

function weaponPads(m) {
  const pads = [];
  for (const spot of PAD_SPOTS) {
    // The glyph the weapon lies on. Deco with no behaviour, so it registers no collider
    // and a fighter running over the pad never trips on it.
    m.deco({
      shape: "cylinder", size: [5.4, 0.3, 5.4],
      position: at(spot.rx, spot.top + 0.15, spot.rz),
      color: C.glyph, material: "neon", transparency: 0.3,
    });
    m.deco({
      shape: "ring", size: [6.6, 6.6, 0.5],
      position: at(spot.rx, spot.top + 0.28, spot.rz),
      rotation: [90, 0, 0],
      color: C.glyphViolet, material: "neon", transparency: 0.35,
    });
    for (let k = 0; k < 3; k++) {
      const [dx, dz] = polar(3.4, 90 + k * 120);
      m.deco({
        size: [0.9, 1.4, 0.9],
        position: at(spot.rx + dx, spot.top + 0.7, spot.rz + dz),
        rotation: [0, k * 40, 0],
        color: C.cobbleDark,
      });
    }
    // The sensor. Five studs across and four tall, centred so it overlaps the player
    // capsule from feet to chest: a flat 0.5-stud plate is easy to step over between
    // ticks at FIGHT_WALK_SPEED 20.
    m.deco({
      size: [5, 4, 5],
      position: at(spot.rx, spot.top + 1.9, spot.rz),
      color: C.glyph, material: "neon", transparency: 0.92,
      behaviors: [{ type: "touchEvent", event: spot.event, cooldownS: 0.5 }],
    });
    pads.push({
      id: spot.id,
      position: at(spot.rx, spot.top, spot.rz),
      kind: "weapon",
      event: spot.event,
    });
  }
  return pads;
}

// =====================================================================================
// build() - the whole ground, in one pure call (§3.2).
// =====================================================================================

export function build() {
  const parts = [];
  const m = maker(parts);
  // One generator, threaded through every feature in a fixed order, so the ruin is the
  // same ruin on every client and in every validator run. Nothing here reads a clock.
  const rng = seeded(0x5d0f9e21);

  // Order matters only in one way: world.js drains DRAIN_PER_TICK (90) parts a tick, so
  // the street, the ziggurat and the plazas are queued first and the ornament last. A
  // fighter who spawns mid-drain stands on stone rather than falling through a map that
  // is still arriving.
  paveGround(m, rng);
  drownedPlaza(m, rng, FORUM, 6);
  drownedPlaza(m, rng, COURT, 5);
  amphitheatre(m, rng);
  ziggurat(m, rng);
  aqueduct(m, rng);
  perchIsland(m, rng);
  colonnade(m, rng);
  statues(m, rng);
  obelisks(m, rng);
  glyphStones(m, rng);
  overgrowth(m, rng);
  houseShells(m, rng);
  const weaponPadList = weaponPads(m);

  // Spawns. Feet positions, 0.2 above whatever surface is actually there - which for a
  // fifth of them is a drowned plaza floor or an amphitheatre seat, not the street. The
  // 0.2 matters: ctx.player.position() is the FEET and physics.getPosition() is the
  // centre, and a spawn authored at a surface's own y would start the capsule half inside
  // the stone.
  const spawns = spawnRel().map(([rx, rz]) => at(rx, groundTopAt(rx, rz) + 0.2, rz));

  const wardenSpots = WARDEN_SPOTS.map(([rx, rz]) => at(rx, groundTopAt(rx, rz) + 0.2, rz));

  return {
    parts,
    spawns,
    weaponPads: weaponPadList,
    wardenSpots,
    landmarks: {
      // REQUIRED (§3.2). The lobby perch, TUNE.PERCH, is 3300 studs away, past a fog far
      // of 220 and past the camera's 1200 far plane, so a dead fighter watching from it
      // would watch an empty lobby.
      perch: at(0, PERCH_TOP, 0),
      summit: at(0, ZIG_TOP, 0),
      forum: at(-150, SUNK_TOP, 0),
      court: at(100, SUNK_TOP, 100),
      bowl: at(BOWL.cx, ORCHESTRA_TOP, BOWL.cz),
      // Every landmark below is a place a player can actually be PUT: a feet position with
      // solid floor at that exact height and nothing solid above it. That is why spanBreak
      // is the last standing stub at 41 rather than the middle of the hole at 49, and why
      // the obelisk's landmark is the street twelve studs off its plinth rather than the
      // plinth itself - a landmark inside a solid is a teleport that ends in a wall.
      spanBreak: at(41, AQ_DECK_TOP, 0),
      obelisk: at(120, GROUND_TOP, -134),
      avenue: at(0, GROUND_TOP, AVENUE_Z),
    },
    // Mirrors config.MAPS "forgotten".lighting, because this builder may not import it.
    // Dusk over a ruin: a violet-black sky, a cold weak sun and a near-black fog.
    // fog.far is 220 and there is NO `near` key: resolveFog derives fogNear as
    // 0.55 * fogFar and never reads one, then clamps far to the tier maximum, which is
    // 300 on low - and SwiftShader and every phone report low (§3.3). So 220 is the
    // number that renders, and this ground is told apart from the forest and the city by
    // fog COLOUR and by its galaxy and neon materials, not by fog distance.
    lighting: {
      skyTop: "#150b28",
      skyBottom: "#4a2f6a",
      ambient: "#b9a8d8",
      ambientIntensity: 0.6,
      sunColor: "#d8c8ff",
      sunIntensity: 0.85,
      sunDirection: [-0.2, -0.9, 0.4],
      fog: { color: "#1b1030", far: 220 },
    },
    // The axis-aligned box this ground occupies, with 10 studs of margin past the outer
    // paving so every part is strictly inside it (rule 25:S1). min[1] is what the flight
    // ceiling is measured from (FLY_CEILING_Y 120 above it, i.e. 102 here, which clears
    // the perch at 90), and it is 22 studs above KILL_Y so nothing solid hangs near the
    // death plane.
    bounds: {
      min: [ORIGIN_X - HALF - 10, KILL_Y + 22, ORIGIN_Z - HALF - 10],
      max: [ORIGIN_X + HALF + 10, PERCH_TOP + 22, ORIGIN_Z + HALF + 10],
    },
  };
}
