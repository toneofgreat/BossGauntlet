// src/games/showdown/scripts/maps/city.js - Showdown's CITY ground. Spec 25 §3.2. Pure.
//
// One crossroads, four blocks, at dusk. Long sightlines down two avenues, and roofs worth
// holding: a brick tenement with a real stairwell and a fire escape, a glass office you
// walk up through its own atrium, a multi-storey car park whose vehicle ramps climb four
// decks, a market hall, a shop row, and a construction site whose scaffold run and girders
// are the only way onto the half-built frame. Ground weapons sit on twelve pads, on the
// street and on the roofs, and every one of them is walkable-to (§7.2).
//
// PURE, and that is a rule rather than a style (§3.2): this file imports NOTHING - not
// even scripts/config.js - touches no ctx, no THREE, no DOM and no browser global, and
// takes its variety from no platform-wide random source, so tools/validate.js can import() it
// under Node and assert its geometry (rule 25:S1). The numbers that also live in config.js -
// the origin, the lighting, the fog far - are therefore mirrored here by hand, each saying so.
//
// NO PART CARRIES AN `id`. world.js stamps every def with its own monotonic uid at
// materialize time, because partsById.set(def.id, record) is unchecked - a reused id
// silently overwrites the record and leaks the old collider - and because
// removePartInternal never drops a part's behaviorStateByPartId entry, so a rebuilt pad
// with a stable id would come back holding the previous round's fired/cooldown (§3.4).
//
// THE COLLIDER BUDGET IS THE WHOLE DESIGN. A part with canCollide:false and NO behaviour
// registers no collider at all (src/engine/parts.js:199-209), so every window, sign, wheel,
// railing, duct, cable and piece of litter below is dressing that costs a draw call and
// nothing else, over a small blockout of solid walls, floors, ramps and cover. That is how
// this ground stays under TUNE.MAP_COLLIDER_MAX 900 while looking like a city. The two
// helpers are named `solid` and `deco` so the accounting is readable line by line; every
// part goes through one of them and nothing writes canCollide by hand.
//
// A WEDGE'S WALKABLE FACE, because every ramp here depends on it: with no rotation a wedge
// of size [w, h, run] slopes DOWN from its -z edge to its +z edge (the slope plane of
// src/engine/physics.js:96-99 passes through local (0,+half.y,-half.z) and
// (0,-half.y,+half.z)), so `face: "north"` means the climb heads toward -z and is written
// with no rotation, and `face: "south"` carries rotation [0,180,0]. Slopes are walkable to
// SLOPE_MAX_DEG 55, so every flight below keeps run > rise, and the top of a wedge is a
// LINE rather than a platform - which is why each flight's high edge abuts the deck above
// along its full width, or lands on a real slab that overlaps that deck by a stud.
//
// A CYLINDER COLLIDES AS A CYLINDER OF RADIUS min(x,z)/2, so every round part is sized as a
// DIAMETER, and sphere/cylinder sizes keep x === z (src/engine/place.js:311-323).

// =====================================================================================
// Where this ground sits, and the vertical grid everything is built on
// =====================================================================================

// config.MAPS[1].origin, mirrored (§3): the three grounds sit side by side in XZ and never
// stacked, because killY is one number for the whole Place and a lower map's floor would be
// under it. Every position below is written local and shifted through `at`.
const OX = 2100;
const OZ = 0;

// The ground plate's half extent. `bounds` adds four studs of slack so a kerb or a parapet
// that overhangs by a fraction is still inside the box rule 25:S1 checks.
const HALF = 122;

const at = (x, y, z) => [OX + x, y, OZ + z];

// ONE floor-to-floor grid for the whole ground, and it is worth saying why: a fighter
// reads a city by its heights, and eleven studs between every deck means one rule covers
// every plank, every drop and every level change on the map. Eleven is also comfortably
// above a fighter's jump apex (FIGHT_JUMP_POWER 52 against gravity 196.2 is 6.9 studs), so
// NO building level can be jumped up to: the ramps, the stairs, the fire escape and the two
// planks are the only ways up, which is what makes the rooftop routes legible rather than
// guesswork. The two deliberate hops on this ground are sideways and level - the bus roof
// off the shelter canopy, and the top girder's five-stud gap to the frame - and each one is
// called out where it is built, because "you can jump this" has to be a decision somebody
// wrote down rather than something a fighter discovers by dying.
const STREET = 0;      // the road: the ground plate's top
const KERB = 0.5;      // pavement, plaza and block-plate tops. One 0.5 step, well under
                       // physics.js's STEP_HEIGHT 1.1, so no kerb ever needs a jump.
const L1 = 11.5;
const L2 = 22.5;
const L3 = 33.5;
const L4 = 44.5;       // the car park roof, the highest walkable deck on this ground

// TUNE.PERCH_ABOVE_ORIGIN[1], mirrored: landmarks.perch sits origin + [0, 90, 0], clear of
// every rooftop here (the tallest parapet tops out at 45.9 and the crane at 63), because a
// dead fighter watches the round from it and the LOBBY perch is 2100 studs away, past a fog
// far of 300 and past the camera's far plane (§12.1).
const PERCH_Y = 90;

// =====================================================================================
// The palette. Lower-case six-digit hex only - the part schema's colour pattern is
// ^#[0-9a-f]{6}$ and an uppercase digit is a hard error (src/engine/place.js:238).
// Dusk, so the concretes run cool and the light in this map comes off the neon.
// =====================================================================================

const C = {
  road: "#33363f", line: "#d8d2b4", kerb: "#8e8f96", pave: "#6f7179",
  plaza: "#c6bda8", plazaInlay: "#a99e88",
  conc: "#9a9ba3", concDark: "#6a6b73", concWet: "#565962",
  brick: "#8e4a3a", brickDark: "#6a3428", trim: "#b8a492",
  glass: "#8fc4dd", glassDark: "#41647a",
  steel: "#7e848f", steelDark: "#4a4f58", rust: "#8a5a32",
  wood: "#7a5433", woodPale: "#a98455", sand: "#c8b38a", cobble: "#5f6068",
  pink: "#ff3d7f", cyan: "#3de0ff", amber: "#ffb03a", green: "#3ddc84", red: "#e0443a",
  lamp: "#ffd9a0", water: "#8fd8ef", leaf: "#3f7d3a", bark: "#4a3826",
  carRed: "#b4392f", carBlue: "#2f5fa8", carPale: "#d6d8dd", carTaxi: "#e0b23a",
  tarp: "#c8543a", dark: "#2a2c33", gold: "#e0b23a",
};

// =====================================================================================
// Helpers. `solid` is a collider, `deco` is not - see the header on why that split is the
// budget. Neither ever writes an `id`; world.js owns those (§3.4).
// =====================================================================================

function solid(parts, def) {
  parts.push({ shape: "box", material: "concrete", anchored: true, canCollide: true, ...def });
}

function deco(parts, def) {
  parts.push({ shape: "box", material: "plastic", anchored: true, canCollide: false, ...def });
}

// A walkable flight. `low`/`high` are the walking surfaces at the two ends, so the wedge's
// height is the rise and its centre is the midpoint; `run` is the horizontal depth along
// the climb and must exceed the rise (55 deg is the engine's limit). `face` names the
// direction the climb heads: "north" is -z with no rotation, "south" is +z at yaw 180,
// "west" is -x at yaw 90 and "east" is +x at yaw -90 (a yaw of 90 takes local +z onto
// world +x, so the high edge at local -z lands on world -x).
const FACE_YAW = { north: 0, south: 180, west: 90, east: -90 };

function flight(parts, o) {
  const rise = o.high - o.low;
  solid(parts, {
    shape: "wedge",
    size: [o.width, rise, o.run],
    position: at(o.x, (o.low + o.high) / 2, o.z),
    rotation: [0, FACE_YAW[o.face], 0],
    color: o.color || C.concDark,
    material: o.material || "concrete",
  });
}

// A deterministic 0..1 source. The platform-wide random source is out for anything two peers
// must agree on (§17.1), and every client builds this ground for itself, so the litter, the
// window tints and the parked cars have to land in the same places for everybody. A plain LCG,
// seeded by hand per section so editing one section does not reshuffle the next.
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// =====================================================================================
// THE PADS (§7.2). TUNE.WEAPON_PADS_PER_MAP is 12 and this list is the single source of
// truth for both the returned PadDefs and the sensor parts, so the two can never drift.
//
// A pad is canCollide:false WITH a touchEvent behaviour, which is exactly what makes it a
// sensor rather than a wall - and never a `collectible`, because a collectible of
// kind:"oofbux" is bridged to a real payout by the economy service and a ground full of
// them would quietly print Oofbux. `event` matches the engine's id charset
// ^[A-Za-z0-9_-]{1,32}$ (src/engine/place.js:232) and game.js routes `touch:<event>`.
//
// Four are at street level, one is in an alley, one is inside the tenement, and six are on
// decks and roofs - so holding a roof is worth something but never the only way to arm
// yourself. Every one of them is on a surface something below walks up to; the comment on
// each names the route, because "reachable" is an assertion this file has to keep.
// =====================================================================================

const WEAPON_PADS = [
  { id: "ave-west", kind: "weapon", event: "sd_city_pad01", position: at(-52, STREET + 0.2, 4) },      // road, west avenue by the bus
  { id: "cross-north", kind: "weapon", event: "sd_city_pad02", position: at(4, STREET + 0.2, -50) },   // road, north cross street
  { id: "plaza-east", kind: "weapon", event: "sd_city_pad03", position: at(76, KERB + 0.2, -44) },      // plaza deck, between fountain and stalls
  { id: "market-roof", kind: "weapon", event: "sd_city_pad04", position: at(92, L1 + 0.2, -96) },       // market hall roof, up the west ramp
  { id: "alley-west", kind: "weapon", event: "sd_city_pad05", position: at(-58, KERB + 0.2, 72) },      // the tenement/office alley floor
  { id: "tenement-hall", kind: "weapon", event: "sd_city_pad06", position: at(-84, KERB + 0.2, 50) },   // tenement ground floor, through the door
  { id: "tenement-roof", kind: "weapon", event: "sd_city_pad07", position: at(-95, L3 + 0.2, 50) },     // tenement roof, up the fire escape
  { id: "office-roof", kind: "weapon", event: "sd_city_pad08", position: at(-38, L2 + 0.2, 68) },       // office roof, up the atrium or the plank
  { id: "shops-roof", kind: "weapon", event: "sd_city_pad09", position: at(36, L1 + 0.2, 60) },         // shop row roof, up the yard ramp
  { id: "carpark-two", kind: "weapon", event: "sd_city_pad10", position: at(70, L2 + 0.2, 44) },        // car park deck two, up the vehicle ramps
  { id: "carpark-roof", kind: "weapon", event: "sd_city_pad11", position: at(70, L4 + 0.2, 40) },       // car park roof, under the big sign
  { id: "scaffold-top", kind: "weapon", event: "sd_city_pad12", position: at(-98, L3 + 0.2, -80) },     // scaffold run, top deck
];

// =====================================================================================
// Ground, streets, pavements and the four block plates
// =====================================================================================

function buildGround(parts) {
  // One plate for the whole ground: 244 x 244 studs of road for ONE collider. Its top is
  // y 0 and its underside sits at -2, a long way above TUNE.KILL_Y -40, which is the
  // grounds' death plane and has to stay below every walkable surface here (§3).
  solid(parts, { size: [244, 2, 244], position: at(0, -1, 0), color: C.concDark, material: "concrete" });

  // The two carriageways, painted on. Dressing, because the plate underneath already
  // collides - the road surface is a colour, not a second floor. The cross street sits a
  // hundredth of a stud higher so the two do not z-fight where they meet.
  deco(parts, { size: [244, 0.14, 26], position: at(0, 0.07, 0), color: C.road, material: "concrete" });
  deco(parts, { size: [26, 0.14, 244], position: at(0, 0.08, 0), color: C.road, material: "concrete" });

  // Pavements, one 0.5 step up. Four runs: the avenue's two sides full length, and the
  // cross street's four segments, which stop short of the junction so the avenue's runs
  // cover the corners rather than two slabs fighting over the same top face.
  for (const z of [-16, 16]) {
    solid(parts, { size: [244, 1, 6], position: at(0, 0, z), color: C.pave, material: "concrete" });
  }
  for (const x of [-16, 16]) {
    for (const z of [-70, 70]) {
      solid(parts, { size: [6, 1, 102], position: at(x, 0, z), color: C.pave, material: "concrete" });
    }
  }

  // Kerbstones: a paler lip along each pavement's road edge. Dressing.
  for (const z of [-13.2, 13.2]) {
    deco(parts, { size: [244, 0.56, 0.7], position: at(0, 0.28, z), color: C.kerb, material: "concrete" });
  }
  for (const x of [-13.2, 13.2]) {
    for (const z of [-70, 70]) {
      deco(parts, { size: [0.7, 0.56, 102], position: at(x, 0.28, z), color: C.kerb, material: "concrete" });
    }
  }

  // The four block plates, also one 0.5 step up, each abutting the pavements at 19 studs
  // out so there is no seam to fall into. The NW block is a construction site, so its
  // plate is churned sand; the NE block is the fountain plaza, so its plate is marble.
  solid(parts, { size: [102, 1, 102], position: at(-70, 0, -70), color: C.sand, material: "sand" });
  solid(parts, { size: [102, 1, 102], position: at(70, 0, -70), color: C.plaza, material: "marble" });
  solid(parts, { size: [102, 1, 102], position: at(-70, 0, 70), color: C.conc, material: "concrete" });
  solid(parts, { size: [102, 1, 102], position: at(70, 0, 70), color: C.conc, material: "concrete" });

  // Plaza inlay and paving joints, so the marble reads as laid rather than poured.
  for (let i = 0; i < 9; i++) {
    deco(parts, { size: [100, 0.1, 1], position: at(70, 0.55, -119 + i * 11.5), color: C.plazaInlay, material: "marble" });
    deco(parts, { size: [1, 0.1, 100], position: at(21 + i * 11.5, 0.56, -70), color: C.plazaInlay, material: "marble" });
  }

  // Centre lines. The junction is left unpainted, which is what a junction looks like.
  for (let i = 0; i < 19; i++) {
    const x = -114 + i * 12.6;
    if (Math.abs(x) > 17) deco(parts, { size: [7, 0.1, 0.8], position: at(x, 0.16, 0), color: C.line, material: "concrete" });
    const z = -114 + i * 12.6;
    if (Math.abs(z) > 17) deco(parts, { size: [0.8, 0.1, 7], position: at(0, 0.17, z), color: C.line, material: "concrete" });
  }

  // Four crossings at the junction, six bars each.
  for (let k = 0; k < 6; k++) {
    const o = -10 + k * 4;
    deco(parts, { size: [3.4, 0.1, 5], position: at(-16.5, 0.18, o), color: C.line, material: "concrete" });
    deco(parts, { size: [3.4, 0.1, 5], position: at(16.5, 0.18, o), color: C.line, material: "concrete" });
    deco(parts, { size: [5, 0.1, 3.4], position: at(o, 0.18, -16.5), color: C.line, material: "concrete" });
    deco(parts, { size: [5, 0.1, 3.4], position: at(o, 0.18, 16.5), color: C.line, material: "concrete" });
  }

  // Drain covers and a service hatch or two, because a street with nothing on it reads flat.
  const r = rng(101);
  for (let i = 0; i < 10; i++) {
    const along = -108 + i * 24;
    const side = r() < 0.5 ? -11.4 : 11.4;
    deco(parts, { shape: "cylinder", size: [2.2, 0.12, 2.2], position: at(along, 0.15, side), color: C.steelDark, material: "metal" });
    deco(parts, { shape: "cylinder", size: [2.2, 0.12, 2.2], position: at(side, 0.16, along), color: C.steelDark, material: "metal" });
  }
}

// =====================================================================================
// Street furniture: traffic lights, lamps, the bus stop, and the parked cover
// =====================================================================================

function trafficLight(parts, x, z, yaw) {
  // The post collides: a city fight wants thin cover you can break line of sight behind,
  // and a 0.7-stud post is the cheapest honest piece of it on the map.
  solid(parts, { shape: "cylinder", size: [0.7, 9, 0.7], position: at(x, KERB + 4.5, z), color: C.steelDark, material: "metal" });
  deco(parts, { size: [1.4, 3.6, 1.2], position: at(x, KERB + 9.2, z), rotation: [0, yaw, 0], color: C.dark, material: "metal" });
  deco(parts, { shape: "sphere", size: [0.75, 0.75, 0.75], position: at(x, KERB + 10.3, z), color: C.red, material: "neon" });
  deco(parts, { shape: "sphere", size: [0.75, 0.75, 0.75], position: at(x, KERB + 9.2, z), color: C.amber, material: "neon" });
  deco(parts, { shape: "sphere", size: [0.75, 0.75, 0.75], position: at(x, KERB + 8.1, z), color: C.green, material: "neon" });
  deco(parts, { size: [0.9, 1.6, 0.8], position: at(x, KERB + 5.4, z), rotation: [0, yaw, 0], color: C.steelDark, material: "metal" });
}

function streetLamp(parts, x, z, armX, armZ) {
  deco(parts, { shape: "cylinder", size: [0.6, 12, 0.6], position: at(x, KERB + 6, z), color: C.steel, material: "metal" });
  deco(parts, { size: [Math.abs(armX) * 2 + 0.4, 0.4, Math.abs(armZ) * 2 + 0.4], position: at(x + armX, KERB + 12, z + armZ), color: C.steel, material: "metal" });
  deco(parts, { size: [2.6, 0.5, 1.4], position: at(x + armX * 2, KERB + 11.7, z + armZ * 2), color: C.lamp, material: "neon" });
  deco(parts, { size: [3, 0.3, 1.8], position: at(x + armX * 2, KERB + 12.05, z + armZ * 2), color: C.steelDark, material: "metal" });
}

function busStop(parts) {
  const x = -46, z = -16.4;
  // Shelter. The back panel and the canopy both collide - the canopy at 5.1 is the first
  // rung of the only rooftop route that starts on the pavement, and the bus roof beside it
  // is the second.
  solid(parts, { size: [15, 4.6, 0.4], position: at(x, KERB + 2.5, z - 2), color: C.glass, material: "glass", transparency: 0.32 });
  solid(parts, { size: [16, 0.4, 5.4], position: at(x, KERB + 4.9, z), color: C.steelDark, material: "metal" });
  for (const dx of [-7.4, 7.4]) {
    deco(parts, { shape: "cylinder", size: [0.5, 4.6, 0.5], position: at(x + dx, KERB + 2.3, z + 2.2), color: C.steel, material: "metal" });
  }
  solid(parts, { size: [11, 0.4, 1.6], position: at(x, KERB + 1.6, z - 1.2), color: C.wood, material: "wood" });
  for (const dx of [-4.6, 0, 4.6]) {
    deco(parts, { shape: "cylinder", size: [0.4, 1.4, 0.4], position: at(x + dx, KERB + 0.7, z - 1.2), color: C.steelDark, material: "metal" });
  }
  deco(parts, { size: [4.4, 2.4, 0.2], position: at(x + 5.6, KERB + 3, z - 1.7), color: C.cyan, material: "neon", transparency: 0.25 });
  deco(parts, { shape: "cylinder", size: [0.4, 7, 0.4], position: at(x - 9, KERB + 3.5, z + 1), color: C.steel, material: "metal" });
  deco(parts, { size: [0.3, 2.2, 3.4], position: at(x - 9, KERB + 6.4, z + 1), color: C.cyan, material: "neon" });

  // A bus at the stop: twenty-six studs of cover on the road, and a roof at 6.2 you take
  // from the shelter canopy at 5.1 with a 2.7-stud hop. That hop is deliberate and it is one
  // of only two on this ground; nothing a fighter needs is up there, it is just a good place
  // to be standing when somebody walks down the avenue.
  const bx = -40, bz = -7;
  solid(parts, { size: [26, 6, 8], position: at(bx, STREET + 3.2, bz), color: C.carPale, material: "metal" });
  deco(parts, { size: [26.3, 1.1, 8.3], position: at(bx, STREET + 5.4, bz), color: C.pink, material: "neon" });
  for (let i = 0; i < 6; i++) {
    deco(parts, { size: [3, 2, 8.4], position: at(bx - 10.5 + i * 4.2, STREET + 4.3, bz), color: C.glassDark, material: "glass", transparency: 0.3 });
  }
  deco(parts, { size: [1.2, 2.6, 8.4], position: at(bx + 12.6, STREET + 4.2, bz), color: C.glassDark, material: "glass", transparency: 0.3 });
  for (const dx of [-9, 8.4]) {
    for (const dz of [-4.2, 4.2]) {
      deco(parts, { shape: "cylinder", size: [2.6, 1.2, 2.6], position: at(bx + dx, STREET + 1.3, bz + dz), rotation: [0, 0, 90], color: C.dark, material: "plastic" });
    }
  }
  deco(parts, { size: [5, 1, 0.3], position: at(bx + 13.2, STREET + 5.2, bz), color: C.amber, material: "neon" });
  deco(parts, { size: [26.4, 0.5, 8.4], position: at(bx, STREET + 6.3, bz), color: C.steel, material: "metal" });
}

// A parked car: one solid body, everything else dressing. The body top at 2.9 is a step a
// fighter uses to get onto a bus roof or over a barrier, so the size is not arbitrary.
function car(parts, x, z, yaw, body, roofSign) {
  solid(parts, { size: [9.4, 2.4, 4.4], position: at(x, STREET + 1.7, z), rotation: [0, yaw, 0], color: body, material: "metal" });
  deco(parts, { size: [5, 1.7, 4.2], position: at(x, STREET + 3.4, z), rotation: [0, yaw, 0], color: body, material: "metal" });
  deco(parts, { size: [4.4, 1.3, 4.3], position: at(x, STREET + 3.5, z), rotation: [0, yaw, 0], color: C.glassDark, material: "glass", transparency: 0.3 });
  const c = Math.cos((yaw * Math.PI) / 180), s = Math.sin((yaw * Math.PI) / 180);
  for (const dx of [-3.1, 3.1]) {
    for (const dz of [-2.2, 2.2]) {
      deco(parts, {
        shape: "cylinder", size: [2.2, 1, 2.2],
        position: at(x + dx * c + dz * s, STREET + 1.1, z - dx * s + dz * c),
        rotation: [0, yaw, 90], color: C.dark, material: "plastic",
      });
    }
  }
  deco(parts, { size: [0.4, 0.7, 3.2], position: at(x + 4.8 * c, STREET + 1.9, z - 4.8 * s), rotation: [0, yaw, 0], color: C.lamp, material: "neon" });
  deco(parts, { size: [0.4, 0.7, 3.2], position: at(x - 4.8 * c, STREET + 1.9, z + 4.8 * s), rotation: [0, yaw, 0], color: C.red, material: "neon" });
  if (roofSign) {
    deco(parts, { size: [2.4, 0.8, 1], position: at(x, STREET + 4.5, z), rotation: [0, yaw, 0], color: C.amber, material: "neon" });
  }
}

function buildStreetFurniture(parts) {
  trafficLight(parts, -14.6, -14.6, 45);
  trafficLight(parts, 14.6, -14.6, -45);
  trafficLight(parts, -14.6, 14.6, 135);
  trafficLight(parts, 14.6, 14.6, -135);

  // Lamps down both avenues, arms hanging over the carriageway.
  for (const x of [-96, -68, 68, 96]) {
    streetLamp(parts, x, -16, 0, 1.6);
    streetLamp(parts, x, 16, 0, -1.6);
  }
  for (const z of [-96, -68, 68, 96]) {
    streetLamp(parts, -16, z, 1.6, 0);
    streetLamp(parts, 16, z, -1.6, 0);
  }

  busStop(parts);

  // Parked cover on both carriageways, well clear of every spawn and of the crossings.
  car(parts, -70, -6, 0, C.carBlue, false);
  car(parts, -18, 6, 180, C.carRed, false);
  car(parts, 30, -6, 0, C.carPale, false);
  car(parts, 88, 6, 180, C.carTaxi, true);
  car(parts, -6, -46, 90, C.carRed, false);
  car(parts, 6, 52, -90, C.carBlue, false);
  car(parts, -6, -88, 90, C.carTaxi, true);
  car(parts, 6, 92, -90, C.carPale, false);

  // Litter bins, bollards, a hydrant and a newspaper box along the pavements.
  const r = rng(202);
  for (let i = 0; i < 12; i++) {
    const along = -104 + i * 19;
    const side = r() < 0.5 ? -17 : 17;
    deco(parts, { shape: "cylinder", size: [2, 2.6, 2], position: at(along, KERB + 1.3, side), color: C.steelDark, material: "metal" });
    deco(parts, { shape: "cylinder", size: [2.2, 0.3, 2.2], position: at(along, KERB + 2.7, side), color: C.steel, material: "metal" });
  }
  for (let i = 0; i < 10; i++) {
    deco(parts, { shape: "cylinder", size: [0.8, 2.2, 0.8], position: at(-13, KERB + 1.1, -24 - i * 9), color: C.amber, material: "plastic" });
    deco(parts, { shape: "cylinder", size: [0.8, 2.2, 0.8], position: at(13, KERB + 1.1, 24 + i * 9), color: C.amber, material: "plastic" });
  }
  deco(parts, { shape: "cylinder", size: [1.4, 2.4, 1.4], position: at(-24, KERB + 1.2, -17), color: C.red, material: "metal" });
  deco(parts, { size: [2, 3, 1.2], position: at(24, KERB + 1.5, 17), color: C.cyan, material: "metal" });
}

// =====================================================================================
// NE block: the fountain plaza, the market stalls and the market hall
// =====================================================================================

function bench(parts, x, z, yaw) {
  solid(parts, { size: [8, 0.4, 2], position: at(x, KERB + 1.5, z), rotation: [0, yaw, 0], color: C.wood, material: "wood" });
  deco(parts, { size: [8, 1.8, 0.3], position: at(x, KERB + 2.2, z), rotation: [0, yaw, 0], color: C.woodPale, material: "wood" });
  for (const dx of [-3.2, 3.2]) {
    deco(parts, { size: [0.5, 1.4, 1.8], position: at(x + dx, KERB + 0.7, z), rotation: [0, yaw, 0], color: C.steelDark, material: "metal" });
  }
}

function planter(parts, x, z) {
  solid(parts, { size: [6, 2, 6], position: at(x, KERB + 1, z), color: C.concDark, material: "concrete" });
  deco(parts, { size: [5.4, 0.3, 5.4], position: at(x, KERB + 2.1, z), color: C.leaf, material: "grass" });
  deco(parts, { shape: "cylinder", size: [0.8, 4, 0.8], position: at(x, KERB + 4.2, z), color: C.bark, material: "wood" });
  deco(parts, { shape: "sphere", size: [5.6, 5.6, 5.6], position: at(x, KERB + 7.4, z), color: C.leaf, material: "grass" });
  deco(parts, { shape: "sphere", size: [3.2, 3.2, 3.2], position: at(x + 1.4, KERB + 6, z - 1.2), color: "#4f9145", material: "grass" });
}

function fountain(parts) {
  const x = 40, z = -44;
  // The basin collides as one cylinder of radius 13, which is the plaza's centrepiece and
  // its only round cover. The water is `ice`, because there is no water material in the
  // sixteen (§3.2).
  solid(parts, { shape: "cylinder", size: [26, 1.6, 26], position: at(x, KERB + 0.8, z), color: C.trim, material: "marble" });
  deco(parts, { shape: "ring", size: [27, 0.5, 27], position: at(x, KERB + 1.7, z), color: C.conc, material: "marble" });
  deco(parts, {
    shape: "cylinder", size: [23.4, 0.3, 23.4], position: at(x, KERB + 1.65, z),
    color: C.water, material: "ice", transparency: 0.2,
    // One of exactly TWO parts on this ground that carries a lamp. The renderer lights at
    // most two point lights on the low tier, which SwiftShader and every phone report, so a
    // third would simply not be lit (§3.3). This is the plaza's; the car park's sign is the
    // other, and atmosphere everywhere else comes from fog colour and the neon material.
    light: { color: C.water, intensity: 1.8, range: 46 },
  });
  solid(parts, { shape: "cylinder", size: [4.4, 8, 4.4], position: at(x, KERB + 4.4, z), color: C.trim, material: "marble" });
  deco(parts, { shape: "dome", size: [13, 2.4, 13], position: at(x, KERB + 3.4, z), color: C.trim, material: "marble" });
  deco(parts, { shape: "dome", size: [7.4, 1.8, 7.4], position: at(x, KERB + 7.2, z), color: C.trim, material: "marble" });
  deco(parts, { shape: "sphere", size: [2.2, 2.2, 2.2], position: at(x, KERB + 9.4, z), color: C.gold, material: "gold" });
  // Jets and the arcs they fall in.
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const jx = x + Math.cos(a) * 8.4, jz = z + Math.sin(a) * 8.4;
    deco(parts, { shape: "cylinder", size: [0.6, 4.2, 0.6], position: at(jx, KERB + 4, jz), color: C.water, material: "ice", transparency: 0.35 });
    deco(parts, { shape: "sphere", size: [1.2, 1.2, 1.2], position: at(jx, KERB + 6.4, jz), color: C.water, material: "ice", transparency: 0.4 });
    deco(parts, { shape: "sphere", size: [0.8, 0.8, 0.8], position: at(x + Math.cos(a) * 11, KERB + 3.4, z + Math.sin(a) * 11), color: C.water, material: "ice", transparency: 0.45 });
  }
}

function stall(parts, x, z, canopy) {
  // Counter and crate collide, everything else is dressing. Five of these give the plaza
  // waist-high cover you can fight around without turning it into a maze.
  solid(parts, { size: [9, 2.4, 3.4], position: at(x, KERB + 1.2, z), color: C.woodPale, material: "wood" });
  deco(parts, { size: [9.6, 0.3, 4], position: at(x, KERB + 2.5, z), color: C.wood, material: "wood" });
  for (const dx of [-4.2, 4.2]) {
    for (const dz of [-1.5, 1.5]) {
      deco(parts, { shape: "cylinder", size: [0.35, 5, 0.35], position: at(x + dx, KERB + 2.5, z + dz), color: C.steel, material: "metal" });
    }
  }
  deco(parts, { size: [10.4, 0.4, 5.4], position: at(x, KERB + 5.1, z), color: canopy, material: "plastic" });
  for (let i = 0; i < 5; i++) {
    deco(parts, { size: [1.9, 0.5, 5.6], position: at(x - 4.2 + i * 2.1, KERB + 5.35, z), color: i % 2 ? canopy : C.trim, material: "plastic" });
  }
  solid(parts, { size: [2.6, 2.6, 2.6], position: at(x + 6.2, KERB + 1.3, z + 1.4), color: C.wood, material: "wood" });
  const r = rng(303 + Math.round(x + z));
  for (let i = 0; i < 6; i++) {
    deco(parts, {
      shape: "sphere", size: [1, 1, 1],
      position: at(x - 3.6 + i * 1.5, KERB + 2.9, z + (r() - 0.5) * 2),
      color: i % 3 === 0 ? C.red : i % 3 === 1 ? C.amber : C.green, material: "plastic",
    });
  }
  deco(parts, { size: [6, 1.4, 0.2], position: at(x, KERB + 6.2, z - 2.6), color: C.cyan, material: "neon" });
}

// A run of windows on one facade. Pure dressing: panes, sills and heads, no colliders, and
// this is where most of the "detailed" in "insanely detailed" actually comes from.
function windows(parts, o) {
  for (let f = 0; f < o.floors; f++) {
    const y = o.baseY + f * 11 + 4.4;
    for (let b = 0; b < o.bays; b++) {
      const s = o.x0 + b * o.step;
      const pos = o.axis === "x" ? at(s, y, o.face) : at(o.face, y, s);
      const size = o.axis === "x" ? [o.w, 4.4, 0.3] : [0.3, 4.4, o.w];
      deco(parts, { size, position: pos, color: o.tint, material: "glass", transparency: 0.28 });
      const framePos = o.axis === "x" ? at(s, y - 2.5, o.face) : at(o.face, y - 2.5, s);
      const frameSize = o.axis === "x" ? [o.w + 1, 0.4, 0.5] : [0.5, 0.4, o.w + 1];
      deco(parts, { size: frameSize, position: framePos, color: o.trim, material: "concrete" });
    }
    const bandPos = o.axis === "x" ? at(o.x0 + ((o.bays - 1) * o.step) / 2, y + 2.9, o.face) : at(o.face, y + 2.9, o.x0 + ((o.bays - 1) * o.step) / 2);
    const bandSize = o.axis === "x" ? [(o.bays - 1) * o.step + o.w + 2, 0.5, 0.4] : [0.4, 0.5, (o.bays - 1) * o.step + o.w + 2];
    deco(parts, { size: bandSize, position: bandPos, color: o.trim, material: "concrete" });
  }
}

// A parapet around a roof, with an optional gap on one side so a plank or a gangway has
// somewhere to land. Parapets collide: a roof you slide off by accident is not cover, it is
// a punishment, and the deliberate ways down are the gap, the stairs and the drop you choose.
function parapet(parts, o) {
  const { x0, x1, z0, z1, top, color } = o;
  const h = o.height || 1.4, t = 0.5;
  const skip = o.gap || {};
  if (skip.side !== "north") solid(parts, { size: [x1 - x0, h, t], position: at((x0 + x1) / 2, top + h / 2, z0 + t / 2), color, material: "concrete" });
  if (skip.side !== "south") solid(parts, { size: [x1 - x0, h, t], position: at((x0 + x1) / 2, top + h / 2, z1 - t / 2), color, material: "concrete" });
  if (skip.side !== "west") solid(parts, { size: [t, h, z1 - z0], position: at(x0 + t / 2, top + h / 2, (z0 + z1) / 2), color, material: "concrete" });
  if (skip.side !== "east") solid(parts, { size: [t, h, z1 - z0], position: at(x1 - t / 2, top + h / 2, (z0 + z1) / 2), color, material: "concrete" });
  // The gapped side comes back as two stubs either side of the opening, so the only way
  // off that edge is the one the route intends. `gap.at` is measured along the side that
  // carries it - an x for the north and south runs, a z for the east and west ones - and it
  // is clamped into the side's own range, because getting that axis wrong once produced a
  // 205-stud parapet stub that stretched across two blocks.
  if (skip.side) {
    const along = skip.side === "north" || skip.side === "south" ? [x0, x1] : [z0, z1];
    const fixed = skip.side === "north" ? z0 + t / 2 : skip.side === "south" ? z1 - t / 2 : skip.side === "west" ? x0 + t / 2 : x1 - t / 2;
    const mid = Math.min(Math.max(skip.at, along[0] + skip.width / 2), along[1] - skip.width / 2);
    const g0 = mid - skip.width / 2, g1 = mid + skip.width / 2;
    for (const seg of [[along[0], g0], [g1, along[1]]]) {
      const len = seg[1] - seg[0];
      if (len <= 0.2) continue;
      const mid = (seg[0] + seg[1]) / 2;
      if (skip.side === "north" || skip.side === "south") {
        solid(parts, { size: [len, h, t], position: at(mid, top + h / 2, fixed), color, material: "concrete" });
      } else {
        solid(parts, { size: [t, h, len], position: at(fixed, top + h / 2, mid), color, material: "concrete" });
      }
    }
  }
}

// Rooftop plant: a vent block you can crouch behind, its fan, and a duct run. The block
// collides, the spinning-looking bits do not.
function roofVent(parts, x, y, z, w) {
  solid(parts, { size: [w, 2.2, w * 0.8], position: at(x, y + 1.1, z), color: C.steelDark, material: "metal" });
  deco(parts, { shape: "cylinder", size: [w * 0.6, 0.5, w * 0.6], position: at(x, y + 2.4, z), color: C.steel, material: "metal" });
  for (let i = 0; i < 4; i++) {
    deco(parts, { size: [w * 0.55, 0.14, 0.5], position: at(x, y + 2.6, z), rotation: [0, i * 45, 0], color: C.conc, material: "metal" });
  }
  deco(parts, { shape: "cylinder", size: [1.4, 3, 1.4], position: at(x + w * 0.8, y + 1.5, z), color: C.steel, material: "metal" });
  deco(parts, { shape: "cylinder", size: [1.4, 0.4, 1.4], position: at(x + w * 0.8, y + 3.2, z), color: C.steelDark, material: "metal" });
}

function buildPlazaBlock(parts) {
  fountain(parts);

  for (const [x, z] of [[40, -22], [40, -66], [18.5, -44], [61.5, -44]]) bench(parts, x, z, x === 40 ? 0 : 90);
  for (const [x, z] of [[24, -26], [56, -26], [24, -62], [56, -62]]) planter(parts, x, z);

  stall(parts, 92, -28, C.tarp);
  stall(parts, 92, -42, C.cyan);
  stall(parts, 92, -56, C.amber);
  stall(parts, 64, -28, C.green);
  stall(parts, 64, -42, C.tarp);

  // ---- the market hall: x 70..114, z -116..-76, one tall storey, roof at L1 ----------
  // Walls are full height with a real ten-stud doorway in the south face, because an
  // interior you cannot walk into is a box, not a building, and the brief says so.
  const wy = (KERB + L1) / 2, wh = L1 - KERB;
  solid(parts, { size: [1.2, wh, 40], position: at(70.6, wy, -96), color: C.brick, material: "brick" });
  solid(parts, { size: [1.2, wh, 40], position: at(113.4, wy, -96), color: C.brick, material: "brick" });
  solid(parts, { size: [44, wh, 1.2], position: at(92, wy, -115.4), color: C.brick, material: "brick" });
  solid(parts, { size: [17, wh, 1.2], position: at(78.5, wy, -76.6), color: C.brick, material: "brick" });
  solid(parts, { size: [17, wh, 1.2], position: at(105.5, wy, -76.6), color: C.brick, material: "brick" });
  solid(parts, { size: [10, 3, 1.2], position: at(92, L1 - 1.5, -76.6), color: C.brick, material: "brick" });
  solid(parts, { size: [45, 0.8, 41], position: at(92, L1 - 0.4, -96), color: C.conc, material: "concrete" });

  // The way up: a ramp along the west face, then a landing that overlaps the roof by four
  // studs. The landing is not decoration - a wedge's top is a line, so without a slab there
  // the last step onto the roof would be a step onto nothing.
  flight(parts, { x: 66, z: -66, low: KERB, high: L1, run: 16, width: 16, face: "north", color: C.concDark });
  solid(parts, { size: [16, 0.8, 5], position: at(66, L1 - 0.4, -76.5), color: C.concDark, material: "concrete" });
  for (let i = 0; i < 5; i++) {
    deco(parts, { shape: "cylinder", size: [0.3, 3.4, 0.3], position: at(58.4, KERB + 2 + i * 2.2, -74 + i * 4 - 8), color: C.steel, material: "metal" });
  }

  parapet(parts, { x0: 69.5, x1: 114.5, z0: -116.5, z1: -75.5, top: L1, color: C.brickDark, gap: { side: "south", at: 72, width: 8 } });
  roofVent(parts, 78, L1, -108, 5);
  roofVent(parts, 104, L1, -86, 4.4);
  deco(parts, { size: [22, 0.5, 8], position: at(92, L1 + 1.1, -98), color: C.steelDark, material: "metal" });

  // Facade: clerestory glazing, a fascia with the hall's name on it, and a neon bar.
  windows(parts, { axis: "x", face: -76.2, x0: 76, step: 8, bays: 5, w: 5, floors: 1, baseY: KERB + 2, tint: C.glass, trim: C.trim });
  windows(parts, { axis: "z", face: 114.1, x0: -110, step: 9, bays: 4, w: 5, floors: 1, baseY: KERB + 2, tint: C.glass, trim: C.trim });
  deco(parts, { size: [30, 2.6, 0.4], position: at(92, L1 - 2, -77.3), color: C.dark, material: "metal" });
  deco(parts, {
    size: [26, 1.8, 0.3], position: at(92, L1 - 2, -77.6), color: C.amber, material: "neon",
    behaviors: [{ type: "text", text: "CITY MARKET", size: 3 }],
  });
  for (let i = 0; i < 6; i++) {
    deco(parts, { shape: "star", size: [1.6, 1.6, 0.3], position: at(76 + i * 6.4, L1 + 1.4, -77.4), color: i % 2 ? C.pink : C.cyan, material: "neon" });
  }

  // Inside: trestle tables, a stack of empty crates, strip lights under the roof.
  for (let i = 0; i < 4; i++) {
    solid(parts, { size: [30, 0.4, 3], position: at(92, KERB + 2.2, -110 + i * 9), color: C.woodPale, material: "wood" });
    for (const dx of [-13, 13]) {
      deco(parts, { size: [0.6, 2.2, 2.6], position: at(92 + dx, KERB + 1.1, -110 + i * 9), color: C.steelDark, material: "metal" });
    }
    deco(parts, { size: [28, 0.3, 1.2], position: at(92, L1 - 1.4, -110 + i * 9), color: C.lamp, material: "neon" });
  }
  solid(parts, { size: [3, 3, 3], position: at(74, KERB + 1.5, -112), color: C.wood, material: "wood" });
  solid(parts, { size: [3, 3, 3], position: at(74, KERB + 4.5, -112), color: C.wood, material: "wood" });
  deco(parts, { size: [3.2, 0.3, 3.2], position: at(74, KERB + 6.2, -112), color: C.woodPale, material: "wood" });
}

// =====================================================================================
// NW block: the construction site, the scaffold run, the girders and the frame
// =====================================================================================

function buildSite(parts) {
  // Hoarding along the two street edges, with a gap where the site gate is. The panels
  // collide, so the site fights differently from the plaza: fewer sightlines, more corners.
  for (let i = 0; i < 6; i++) {
    const x = -112 + i * 15;
    if (x > -78 && x < -60) continue;
    solid(parts, { size: [14, 4, 0.8], position: at(x, KERB + 2, -22), color: C.tarp, material: "metal" });
    deco(parts, { size: [14.4, 0.4, 1.1], position: at(x, KERB + 4.2, -22), color: C.amber, material: "metal" });
  }
  for (let i = 0; i < 6; i++) {
    solid(parts, { size: [0.8, 4, 14], position: at(-22, KERB + 2, -112 + i * 15), color: C.tarp, material: "metal" });
    deco(parts, { size: [1.1, 0.4, 14.4], position: at(-22, KERB + 4.2, -112 + i * 15), color: C.amber, material: "metal" });
  }
  deco(parts, { size: [12, 3, 0.3], position: at(-69, KERB + 5.4, -22), color: C.amber, material: "neon",
    behaviors: [{ type: "text", text: "SITE ENTRANCE - HARD HATS", size: 2.4 }] });

  // ---- the scaffold run: three decks, three flights, x -108..-88 -------------------
  // Each flight's high edge abuts the deck above along its full width, and each deck runs
  // long enough at the other end to carry the next flight's foot - which is why L1 reaches
  // z -120 and L2 reaches z -40 while the top deck is the short one.
  solid(parts, { size: [20, 0.6, 64], position: at(-98, L1 - 0.3, -88), color: C.woodPale, material: "wood" });
  solid(parts, { size: [20, 0.6, 64], position: at(-98, L2 - 0.3, -72), color: C.woodPale, material: "wood" });
  solid(parts, { size: [20, 0.6, 48], position: at(-98, L3 - 0.3, -80), color: C.woodPale, material: "wood" });
  flight(parts, { x: -98, z: -48, low: KERB, high: L1, run: 16, width: 12, face: "north", color: C.woodPale, material: "wood" });
  flight(parts, { x: -98, z: -112, low: L1, high: L2, run: 16, width: 12, face: "south", color: C.woodPale, material: "wood" });
  flight(parts, { x: -98, z: -48, low: L2, high: L3, run: 16, width: 12, face: "north", color: C.woodPale, material: "wood" });

  // Standards, ledgers, braces and toe boards. All dressing: the scaffold's colliders are
  // its three decks and three flights and nothing else.
  for (let i = 0; i < 9; i++) {
    const z = -118 + i * 9.6;
    for (const x of [-107.4, -88.6]) {
      deco(parts, { shape: "cylinder", size: [0.5, 46, 0.5], position: at(x, KERB + 23, z), color: C.steel, material: "metal" });
    }
    for (const y of [L1, L2, L3]) {
      deco(parts, { size: [19.6, 0.35, 0.35], position: at(-98, y + 1.1, z), color: C.steel, material: "metal" });
    }
  }
  for (const y of [L1, L2, L3]) {
    for (const x of [-107.4, -88.6]) {
      deco(parts, { size: [0.35, 0.35, 62], position: at(x, y + 1.1, -88), color: C.steel, material: "metal" });
      deco(parts, { size: [0.4, 0.5, 62], position: at(x, y + 0.5, -88), color: C.woodPale, material: "wood" });
    }
    for (let i = 0; i < 6; i++) {
      deco(parts, { size: [0.3, 12, 0.3], position: at(-107.4, y + 5, -114 + i * 12), rotation: [34, 0, 0], color: C.steel, material: "metal" });
    }
  }

  // ---- the half-built frame, reached only by girder ---------------------------------
  for (const y of [L1, L2, L3]) {
    solid(parts, { size: [26, 0.8, 26], position: at(-50, y - 0.4, -90), color: C.conc, material: "concrete" });
  }
  for (const x of [-62, -38]) {
    for (const z of [-102, -78]) {
      solid(parts, { shape: "cylinder", size: [1.6, 46, 1.6], position: at(x, KERB + 23, z), color: C.conc, material: "concrete" });
    }
  }
  for (const [x, z] of [[-50, -90], [-62, -90], [-38, -90], [-50, -102], [-50, -78]]) {
    deco(parts, { shape: "cylinder", size: [1.4, 46, 1.4], position: at(x, KERB + 23, z), color: C.conc, material: "concrete" });
  }
  // Two girders across the gap, one at each of the lower levels, and a third at the top that
  // stops five studs short. So the frame's lower two plates are walked to and its top plate
  // is the one place on this ground you can only jump to - five studs flat, which a fighter
  // clears easily and which is the whole point. No weapon pad sits on it: a pad a player
  // could miss is a pad that does not count as reachable.
  solid(parts, { size: [26, 0.8, 3.2], position: at(-75.5, L1 - 0.4, -84), color: C.rust, material: "metal" });
  solid(parts, { size: [26, 0.8, 3.2], position: at(-75.5, L2 - 0.4, -90), color: C.rust, material: "metal" });
  solid(parts, { size: [20, 0.8, 2.6], position: at(-78, L3 - 0.4, -96), color: C.rust, material: "metal" });
  for (const [cx, y, cz, len] of [[-75.5, L1, -84, 26], [-75.5, L2, -90, 26], [-78, L3, -96, 20]]) {
    deco(parts, { size: [len, 0.4, 4.4], position: at(cx, y - 0.9, cz), color: C.rust, material: "metal" });
    deco(parts, { size: [len, 0.4, 4.4], position: at(cx, y + 0.1, cz), color: C.rust, material: "metal" });
    for (let i = 0; i < 5; i++) {
      deco(parts, { shape: "cylinder", size: [0.3, 3.2, 0.3], position: at(cx - len / 2 + 2 + i * ((len - 4) / 4), y + 1.6, cz + 1.8), color: C.amber, material: "metal" });
    }
    deco(parts, { size: [len, 0.25, 0.25], position: at(cx, y + 3.1, cz + 1.8), color: C.amber, material: "metal" });
  }
  // Rebar sticking out of the frame's top plate, and formwork left on the middle one.
  const r = rng(404);
  for (let i = 0; i < 14; i++) {
    deco(parts, { shape: "cylinder", size: [0.28, 4 + r() * 3, 0.28], position: at(-61 + i * 1.7, L3 + 2, -78 + r() * 3), color: C.rust, material: "metal" });
  }
  for (let i = 0; i < 6; i++) {
    deco(parts, { size: [8, 0.3, 3], position: at(-58 + i * 3.4, L2 + 0.6, -100 + r() * 6), rotation: [0, r() * 30 - 15, 0], color: C.woodPale, material: "wood" });
  }

  // ---- site plant and spoil ---------------------------------------------------------
  // The crane: dressing from mast to hook. It is the ground's landmark from the lobby side
  // and it is also the reason the site reads as unfinished rather than bombed.
  for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
    deco(parts, { shape: "cylinder", size: [1, 62, 1], position: at(-34 + dx, KERB + 31, -112 + dz), color: C.amber, material: "metal" });
  }
  for (let i = 0; i < 12; i++) {
    deco(parts, { size: [3.6, 0.3, 0.3], position: at(-34, KERB + 4 + i * 5, -113.6), color: C.amber, material: "metal" });
    deco(parts, { size: [0.3, 0.3, 3.6], position: at(-32.4, KERB + 6.5 + i * 5, -112), color: C.amber, material: "metal" });
  }
  deco(parts, { size: [64, 1.4, 2.2], position: at(-6, KERB + 62, -112), color: C.amber, material: "metal" });
  deco(parts, { size: [16, 1.2, 2], position: at(-46, KERB + 62, -112), color: C.amber, material: "metal" });
  deco(parts, { size: [3, 2.4, 3.4], position: at(-34, KERB + 64.6, -112), color: C.dark, material: "metal" });
  deco(parts, { size: [0.3, 26, 0.3], position: at(4, KERB + 48, -112), color: C.steelDark, material: "metal" });
  deco(parts, { size: [2.4, 2.4, 2.4], position: at(4, KERB + 34, -112), color: C.steelDark, material: "metal" });

  // Mixer, skip, pipe stacks, sand heaps, a site hut, warning lamps.
  solid(parts, { size: [8, 4, 6], position: at(-104, KERB + 2, -30), color: C.steelDark, material: "metal" });
  deco(parts, { shape: "cylinder", size: [5, 6, 5], position: at(-104, KERB + 5.5, -30), rotation: [0, 0, 28], color: C.amber, material: "metal" });
  solid(parts, { size: [12, 5, 7], position: at(-60, KERB + 2.5, -34), color: C.rust, material: "metal" });
  for (let i = 0; i < 9; i++) {
    deco(parts, { shape: "tube", size: [2.2, 14, 2.2], position: at(-84 + (i % 3) * 2.6, KERB + 1.1 + Math.floor(i / 3) * 2.3, -40), rotation: [0, 0, 90], color: C.concDark, material: "concrete" });
  }
  deco(parts, { shape: "dome", size: [18, 6, 18], position: at(-40, KERB, -58), color: C.sand, material: "sand" });
  deco(parts, { shape: "dome", size: [12, 4, 12], position: at(-28, KERB, -70), color: C.sand, material: "sand" });
  solid(parts, { size: [12, 7, 9], position: at(-112, KERB + 3.5, -50), color: C.carPale, material: "metal" });
  deco(parts, { size: [3, 5, 0.3], position: at(-106, KERB + 3, -50), color: C.glassDark, material: "glass", transparency: 0.3 });
  deco(parts, { size: [12.6, 0.5, 9.6], position: at(-112, KERB + 7.3, -50), color: C.steelDark, material: "metal" });
  for (let i = 0; i < 8; i++) {
    deco(parts, { shape: "sphere", size: [0.9, 0.9, 0.9], position: at(-76 + i * 2, KERB + 0.6, -24), color: C.amber, material: "neon" });
  }
  for (let i = 0; i < 10; i++) {
    deco(parts, { shape: "cone", size: [2, 3, 2], position: at(-108 + i * 9, KERB + 1.5, -26 - (i % 3) * 3), color: C.tarp, material: "plastic" });
    deco(parts, { shape: "cylinder", size: [3, 0.3, 3], position: at(-108 + i * 9, KERB + 0.2, -26 - (i % 3) * 3), color: C.dark, material: "plastic" });
  }
}

// =====================================================================================
// SW block: the brick tenement, the glass office, and the alley between them
// =====================================================================================

function buildTenement(parts) {
  // x -114..-68, z 40..76. Three storeys, a real stairwell in the south-west corner, and a
  // fire escape on the alley face. Walls run the full height in one piece each, with the
  // south face split around a twelve-stud doorway - a lintel over a gap, not a box.
  const wh = L3 - KERB, wy = (KERB + L3) / 2;
  solid(parts, { size: [46, wh, 1.2], position: at(-91, wy, 40.6), color: C.brick, material: "brick" });
  solid(parts, { size: [1.2, wh, 36], position: at(-113.4, wy, 58), color: C.brick, material: "brick" });
  solid(parts, { size: [1.2, wh, 36], position: at(-68.6, wy, 58), color: C.brick, material: "brick" });
  solid(parts, { size: [17, wh, 1.2], position: at(-105.5, wy, 75.4), color: C.brick, material: "brick" });
  solid(parts, { size: [17, wh, 1.2], position: at(-76.5, wy, 75.4), color: C.brick, material: "brick" });
  solid(parts, { size: [12, 25.5, 1.2], position: at(-91, 20.75, 75.4), color: C.brick, material: "brick" });

  // Floors and roof, each in two slabs so the stairwell has a real void to climb through:
  // the opening is x -114..-98, z 60..76, and the roof leaves it open to the sky, which
  // doubles as the fast way back down from the roof to the second floor.
  for (const y of [L1, L2, L3]) {
    solid(parts, { size: [46, 0.8, 20], position: at(-91, y - 0.4, 50), color: C.concDark, material: "concrete" });
    solid(parts, { size: [30, 0.8, 16], position: at(-83, y - 0.4, 68), color: C.concDark, material: "concrete" });
  }

  // Two interior flights and the landing the upper one stands on. The first is the full
  // sixteen studs wide and its top edge meets the floor slab above along all sixteen; the
  // second is half that and needs a slab at its foot, which shares an edge with the floor.
  flight(parts, { x: -106, z: 67.4, low: KERB, high: L1, run: 14.8, width: 16, face: "north" });
  flight(parts, { x: -102, z: 67.4, low: L1, high: L2, run: 14.8, width: 8, face: "north" });
  solid(parts, { size: [8, 0.8, 5], position: at(-102, L1 - 0.4, 72.3), color: C.concDark, material: "concrete" });
  for (const y of [KERB, L1, L2]) {
    deco(parts, { size: [0.3, 0.3, 14.8], position: at(-98.4, y + 12, 67.4), rotation: [-37, 0, 0], color: C.steelDark, material: "metal" });
  }
  deco(parts, { size: [16.4, 0.3, 0.3], position: at(-106, L3 + 1.2, 60.2), color: C.steelDark, material: "metal" });
  deco(parts, { size: [0.3, 0.3, 16.4], position: at(-98.2, L3 + 1.2, 68), color: C.steelDark, material: "metal" });

  // Interior partitions, with gaps for doorways, and the furniture of three flats.
  for (const y of [KERB, L1, L2]) {
    solid(parts, { size: [0.8, 9.6, 12], position: at(-98, y + 4.8, 46), color: C.trim, material: "concrete" });
    solid(parts, { size: [16, 9.6, 0.8], position: at(-89, y + 4.8, 52), color: C.trim, material: "concrete" });
    deco(parts, { size: [0.9, 0.4, 12.4], position: at(-98, y + 9.8, 46), color: C.woodPale, material: "wood" });
    solid(parts, { size: [8, 1.8, 4], position: at(-76, y + 0.9, 46), color: C.woodPale, material: "wood" });
    deco(parts, { size: [8.4, 0.5, 4.4], position: at(-76, y + 2, 46), color: C.trim, material: "plastic" });
    solid(parts, { size: [6, 2.6, 3], position: at(-74, y + 1.3, 70), color: C.wood, material: "wood" });
    deco(parts, { size: [10, 0.3, 4], position: at(-84, y + 7.6, 44), color: C.lamp, material: "neon" });
    deco(parts, { shape: "sphere", size: [1.6, 1.6, 1.6], position: at(-90, y + 8.4, 64), color: C.lamp, material: "neon" });
  }

  // Facades: sash windows on both long faces, a shopfront at street level, brick banding.
  windows(parts, { axis: "x", face: 40.2, x0: -108, step: 8.4, bays: 5, w: 4.4, floors: 3, baseY: KERB, tint: C.glass, trim: C.trim });
  windows(parts, { axis: "x", face: 75.8, x0: -110, step: 9, bays: 3, w: 4.4, floors: 3, baseY: KERB, tint: C.glass, trim: C.trim });
  windows(parts, { axis: "z", face: -113.8, x0: 46, step: 9, bays: 4, w: 4.4, floors: 3, baseY: KERB, tint: C.glass, trim: C.trim });
  deco(parts, { size: [46.6, 0.6, 1.8], position: at(-91, L3 + 0.3, 40.4), color: C.brickDark, material: "brick" });
  deco(parts, { size: [46.6, 0.6, 1.8], position: at(-91, L3 + 0.3, 75.6), color: C.brickDark, material: "brick" });
  deco(parts, { size: [14, 4, 0.4], position: at(-91, KERB + 9, 76), color: C.pink, material: "neon" });

  // ---- the fire escape: three zigzag flights in one twelve-stud footprint -----------
  // The whole thing lives in the alley on the east face, and it is the route a fighter
  // learns first: dumpster, landing, landing, gangway, roof.
  solid(parts, { size: [9, 0.8, 10], position: at(-63, L1 - 0.4, 50), color: C.steelDark, material: "metal" });
  solid(parts, { size: [9, 0.8, 10], position: at(-63, L2 - 0.4, 72), color: C.steelDark, material: "metal" });
  flight(parts, { x: -63, z: 61, low: KERB, high: L1, run: 12, width: 7, face: "north", color: C.steelDark, material: "metal" });
  flight(parts, { x: -63, z: 61, low: L1, high: L2, run: 12, width: 7, face: "south", color: C.steelDark, material: "metal" });
  flight(parts, { x: -63, z: 61, low: L2, high: L3, run: 12, width: 7, face: "north", color: C.steelDark, material: "metal" });
  // The gangway sits half a stud proud of both the wall head and the roof, so stepping onto
  // the roof is two 0.5 steps rather than a blocked wall.
  solid(parts, { size: [12, 0.5, 6], position: at(-68, L3 + 0.25, 52), color: C.steelDark, material: "metal" });
  for (const y of [L1, L2]) {
    deco(parts, { size: [0.3, 3.4, 10.4], position: at(-58.6, y + 1.7, y === L1 ? 50 : 72), color: C.steelDark, material: "metal" });
    deco(parts, { size: [9.4, 0.3, 0.3], position: at(-63, y + 3.4, y === L1 ? 45.2 : 67.2), color: C.steelDark, material: "metal" });
  }
  for (let i = 0; i < 6; i++) {
    deco(parts, { size: [0.3, 0.3, 12.4], position: at(-59.6, KERB + 3 + i * 5.5, 61), rotation: [-42, 0, 0], color: C.steelDark, material: "metal" });
  }

  // ---- the roof: parapet, plant, a water tank, and the gap the gangway lands in -----
  parapet(parts, { x0: -114, x1: -68, z0: 40, z1: 76, top: L3, color: C.brickDark, gap: { side: "east", at: 52, width: 8 } });
  roofVent(parts, -104, L3, 46, 5);
  roofVent(parts, -86, L3, 46, 4.2);
  solid(parts, { shape: "cylinder", size: [8, 6, 8], position: at(-104, L3 + 5, 70), color: C.rust, material: "metal" });
  for (const [dx, dz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) {
    deco(parts, { shape: "cylinder", size: [0.6, 2.4, 0.6], position: at(-104 + dx, L3 + 1.2, 70 + dz), color: C.steelDark, material: "metal" });
  }
  deco(parts, { shape: "cone", size: [8.4, 1.6, 8.4], position: at(-104, L3 + 8.6, 70), color: C.steelDark, material: "metal" });
  deco(parts, { shape: "cylinder", size: [0.4, 9, 0.4], position: at(-72, L3 + 5, 70), color: C.steel, material: "metal" });
  for (let i = 0; i < 4; i++) {
    deco(parts, { size: [3.4, 0.2, 0.2], position: at(-72, L3 + 6.5 + i * 1.1, 70), color: C.steel, material: "metal" });
  }
  deco(parts, { size: [8, 0.4, 12], position: at(-78, L3 + 0.9, 64), color: C.steelDark, material: "metal" });
}

function buildOffice(parts) {
  // x -54..-20, z 46..78. Glass, two storeys, and you walk up the inside of it: the atrium
  // void is x -54..-40, z 64..78 on both levels, with one flight per level.
  const wh = L2 - KERB, wy = (KERB + L2) / 2;
  solid(parts, { size: [1.2, wh, 32], position: at(-53.4, wy, 62), color: C.glass, material: "glass", transparency: 0.3 });
  solid(parts, { size: [1.2, wh, 32], position: at(-20.6, wy, 62), color: C.glass, material: "glass", transparency: 0.3 });
  solid(parts, { size: [34, wh, 1.2], position: at(-37, wy, 46.6), color: C.glass, material: "glass", transparency: 0.3 });
  solid(parts, { size: [11, wh, 1.2], position: at(-48.5, wy, 77.4), color: C.glass, material: "glass", transparency: 0.3 });
  solid(parts, { size: [11, wh, 1.2], position: at(-25.5, wy, 77.4), color: C.glass, material: "glass", transparency: 0.3 });
  solid(parts, { size: [12, 14.5, 1.2], position: at(-37, 15.75, 77.4), color: C.glass, material: "glass", transparency: 0.3 });

  solid(parts, { size: [34, 0.8, 18], position: at(-37, L1 - 0.4, 55), color: C.conc, material: "concrete" });
  solid(parts, { size: [20, 0.8, 14], position: at(-30, L1 - 0.4, 71), color: C.conc, material: "concrete" });
  solid(parts, { size: [35, 0.8, 19], position: at(-37, L2 - 0.4, 54.5), color: C.conc, material: "concrete" });
  solid(parts, { size: [21, 0.8, 14], position: at(-30, L2 - 0.4, 71), color: C.conc, material: "concrete" });

  flight(parts, { x: -47, z: 70.4, low: KERB, high: L1, run: 12.8, width: 14, face: "north", color: C.conc });
  flight(parts, { x: -43.5, z: 70.4, low: L1, high: L2, run: 12.8, width: 7, face: "north", color: C.conc });
  solid(parts, { size: [7, 0.8, 5], position: at(-43.5, L1 - 0.4, 74.3), color: C.conc, material: "concrete" });
  for (const y of [KERB, L1]) {
    deco(parts, { size: [0.3, 3.2, 12.8], position: at(-39.6, y + 12.4, 70.4), rotation: [-40, 0, 0], color: C.cyan, material: "neon" });
  }

  // Curtain walling, mullions, and the two floors of desks behind it.
  windows(parts, { axis: "x", face: 46.1, x0: -50, step: 7, bays: 5, w: 5.4, floors: 2, baseY: KERB, tint: C.glass, trim: C.steel });
  windows(parts, { axis: "z", face: -53.9, x0: 50, step: 7.6, bays: 4, w: 5.4, floors: 2, baseY: KERB, tint: C.glass, trim: C.steel });
  windows(parts, { axis: "z", face: -20.1, x0: 50, step: 7.6, bays: 4, w: 5.4, floors: 2, baseY: KERB, tint: C.glass, trim: C.steel });
  for (let i = 0; i < 6; i++) {
    deco(parts, { size: [0.5, wh, 0.5], position: at(-52 + i * 6.4, wy, 46.2), color: C.steel, material: "metal" });
  }
  for (const y of [KERB, L1]) {
    solid(parts, { size: [0.8, 9, 14], position: at(-32, y + 4.5, 54), color: C.trim, material: "concrete" });
    for (let i = 0; i < 4; i++) {
      solid(parts, { size: [6, 1.8, 3.4], position: at(-48 + i * 7, y + 0.9, 52), color: C.trim, material: "wood" });
      deco(parts, { size: [6.4, 0.4, 3.8], position: at(-48 + i * 7, y + 2, 52), color: C.steel, material: "metal" });
      deco(parts, { size: [2.4, 1.6, 0.3], position: at(-48 + i * 7, y + 2.8, 51), color: C.cyan, material: "neon" });
    }
    deco(parts, { size: [30, 0.3, 1.4], position: at(-37, y + 9.4, 56), color: C.lamp, material: "neon" });
    deco(parts, { size: [30, 0.3, 1.4], position: at(-37, y + 9.4, 64), color: C.lamp, material: "neon" });
  }

  // The roof: parapet with a gap where the plank from the tenement lands, plant room,
  // vents, a dish. The plant room's top at 27 is the highest thing on this side of the map
  // that is not the car park.
  parapet(parts, { x0: -54.5, x1: -19.5, z0: 45, z1: 78, top: L2, color: C.steel, gap: { side: "west", at: 72, width: 8 } });
  solid(parts, { size: [11, 4.4, 9], position: at(-28, L2 + 2.2, 52), color: C.conc, material: "concrete" });
  roofVent(parts, -44, L2, 52, 4.4);
  deco(parts, { shape: "dome", size: [6, 3, 6], position: at(-24, L2 + 5.9, 52), rotation: [30, 0, 0], color: C.carPale, material: "plastic" });
  deco(parts, { shape: "cylinder", size: [0.5, 3, 0.5], position: at(-24, L2 + 5.2, 52), color: C.steel, material: "metal" });
  deco(parts, { size: [16, 3, 0.4], position: at(-37, L2 + 3, 45.4), color: C.cyan, material: "neon" });

  // The plank: tenement fire-escape landing at L2 to this roof at L2, half a stud proud of
  // both so neither end is a blocked step. Two roofs linked by a board is the city's oldest
  // shortcut and the reason holding one roof is never enough.
  solid(parts, { size: [10, 0.5, 3.4], position: at(-56.5, L2 + 0.25, 72), color: C.woodPale, material: "wood" });
  deco(parts, { size: [10.4, 0.2, 0.3], position: at(-56.5, L2 + 0.6, 73.9), color: C.rust, material: "metal" });
}

function buildAlleyWest(parts) {
  // The alley floor: cobble laid over the block plate, so it reads as older than the street.
  deco(parts, { size: [14, 0.14, 38], position: at(-61, KERB + 0.07, 59), color: C.cobble, material: "cobble" });
  // Dumpsters and crates. The dumpster tops at 4.1 are the first step of the fire escape,
  // which is why they are solid and why they stand where they stand.
  solid(parts, { size: [8, 3.6, 5], position: at(-62, KERB + 1.8, 68.5), color: C.green, material: "metal" });
  deco(parts, { size: [8.4, 0.4, 5.4], position: at(-62, KERB + 3.8, 68.5), color: "#2f6b3a", material: "metal" });
  solid(parts, { size: [7, 3.2, 4.4], position: at(-62, KERB + 1.6, 44), color: C.rust, material: "metal" });
  solid(parts, { size: [2.8, 2.8, 2.8], position: at(-57, KERB + 1.4, 56), color: C.wood, material: "wood" });
  solid(parts, { size: [2.8, 2.8, 2.8], position: at(-57, KERB + 4.2, 56), color: C.wood, material: "wood" });
  const r = rng(505);
  for (let i = 0; i < 7; i++) {
    deco(parts, { size: [3, 0.3, 2], position: at(-58 + r() * 3, KERB + 0.2, 48 + i * 4), rotation: [0, r() * 60, 0], color: C.woodPale, material: "wood" });
  }
  for (let i = 0; i < 5; i++) {
    deco(parts, { shape: "tube", size: [1.6, 9, 1.6], position: at(-55.4, KERB + 6 + i * 0.2, 50 + i * 6), rotation: [90, 0, 0], color: C.rust, material: "metal" });
  }
  deco(parts, { size: [0.3, 5, 9], position: at(-67.9, KERB + 4, 58), color: C.pink, material: "neon", transparency: 0.4 });
  deco(parts, { shape: "cylinder", size: [7, 0.12, 7], position: at(-61, KERB + 0.16, 62), color: C.water, material: "ice", transparency: 0.5 });
  for (let i = 0; i < 4; i++) {
    deco(parts, { size: [2.6, 1.6, 0.2], position: at(-64, KERB + 6 + i * 3, 50 + i * 7), color: C.amber, material: "neon" });
  }
}

// =====================================================================================
// SE block: the shop row, the alley, and the multi-storey car park
// =====================================================================================

function buildShopRow(parts) {
  // x 24..48, z 28..102. One storey, three shopfronts on the cross-street face, a service
  // door onto the alley, and a walled yard at the north end whose ramp is the roof access.
  const wh = L1 - KERB, wy = (KERB + L1) / 2;
  for (const [z0, z1] of [[28, 33], [39, 51], [57, 69], [75, 102]]) {
    solid(parts, { size: [1.2, wh, z1 - z0], position: at(24.6, wy, (z0 + z1) / 2), color: C.brick, material: "brick" });
  }
  for (const z of [36, 54, 72]) {
    solid(parts, { size: [1.2, 3, 6], position: at(24.6, L1 - 1.5, z), color: C.brick, material: "brick" });
  }
  solid(parts, { size: [1.2, wh, 30], position: at(47.4, wy, 44), color: C.brick, material: "brick" });
  solid(parts, { size: [1.2, wh, 28], position: at(47.4, wy, 87), color: C.brick, material: "brick" });
  solid(parts, { size: [1.2, 3, 15], position: at(47.4, L1 - 1.5, 66.5), color: C.brick, material: "brick" });
  solid(parts, { size: [24, wh, 1.2], position: at(36, wy, 28.6), color: C.brick, material: "brick" });
  solid(parts, { size: [8, wh, 1.2], position: at(28, wy, 101.4), color: C.brick, material: "brick" });
  solid(parts, { size: [8, wh, 1.2], position: at(44, wy, 101.4), color: C.brick, material: "brick" });
  solid(parts, { size: [8, 3, 1.2], position: at(36, L1 - 1.5, 101.4), color: C.brick, material: "brick" });
  // The roof stops at z 84, which leaves the yard open to the sky - and gives the ramp a
  // full-width edge to meet, so no landing slab is needed here.
  solid(parts, { size: [25, 0.8, 57], position: at(36, L1 - 0.4, 55.5), color: C.concDark, material: "concrete" });
  flight(parts, { x: 36, z: 92, low: KERB, high: L1, run: 16, width: 16, face: "north", color: C.concDark });

  parapet(parts, { x0: 23.5, x1: 48.5, z0: 27, z1: 84, top: L1, color: C.brickDark, gap: { side: "east", at: 50, width: 8 } });
  roofVent(parts, 30, L1, 36, 4.4);
  roofVent(parts, 42, L1, 76, 4);
  deco(parts, { size: [10, 0.4, 20], position: at(36, L1 + 1, 56), color: C.steelDark, material: "metal" });
  // A hoarding sign standing on the roof, which is what a shop row looks like from a rooftop.
  deco(parts, { size: [0.5, 8, 22], position: at(24.2, L1 + 4, 56), color: C.dark, material: "metal" });
  deco(parts, { size: [0.3, 6, 18], position: at(23.9, L1 + 4, 56), color: C.pink, material: "neon" });
  for (const dz of [-8, 8]) {
    deco(parts, { shape: "cylinder", size: [0.4, 8, 0.4], position: at(24.6, L1 + 4, 56 + dz), color: C.steel, material: "metal" });
  }

  // Shopfronts: glazing, awnings, signs, shutters half down on the one that shut early.
  const awn = [C.tarp, C.cyan, C.green];
  for (let i = 0; i < 3; i++) {
    const z = 36 + i * 18;
    deco(parts, { size: [0.3, 7, 10], position: at(24.1, KERB + 4, z), color: C.glass, material: "glass", transparency: 0.26 });
    deco(parts, { shape: "wedge", size: [3.6, 2, 11], position: at(22.2, KERB + 8.4, z), rotation: [0, 0, -90], color: awn[i], material: "plastic" });
    deco(parts, { size: [0.3, 2, 11], position: at(23.9, KERB + 9.6, z), color: awn[i], material: "neon" });
    deco(parts, { size: [0.4, 1.4, 7], position: at(23.7, KERB + 10.4, z), color: i === 1 ? C.amber : C.cyan, material: "neon" });
    if (i === 2) {
      for (let k = 0; k < 6; k++) {
        deco(parts, { size: [0.3, 0.5, 10], position: at(23.9, KERB + 4.4 + k * 0.7, z), color: C.steel, material: "metal" });
      }
    }
  }
  // Inside: counters, shelving, stock.
  for (let i = 0; i < 3; i++) {
    const z = 36 + i * 18;
    solid(parts, { size: [12, 2.2, 3], position: at(34, KERB + 1.1, z), color: C.woodPale, material: "wood" });
    deco(parts, { size: [12.4, 0.3, 3.4], position: at(34, KERB + 2.3, z), color: C.wood, material: "wood" });
    for (let k = 0; k < 3; k++) {
      deco(parts, { size: [10, 0.3, 2], position: at(42, KERB + 2 + k * 2.6, z), color: C.woodPale, material: "wood" });
      for (let j = 0; j < 4; j++) {
        deco(parts, { size: [1.4, 1.6, 1.4], position: at(38.6 + j * 2.2, KERB + 3 + k * 2.6, z), color: j % 2 ? C.amber : C.cyan, material: "plastic" });
      }
    }
    deco(parts, { size: [16, 0.3, 1.2], position: at(36, L1 - 1.6, z), color: C.lamp, material: "neon" });
  }
  solid(parts, { size: [3, 3, 3], position: at(30, KERB + 1.5, 94), color: C.wood, material: "wood" });
  solid(parts, { size: [3, 3, 3], position: at(30, KERB + 4.5, 94), color: C.wood, material: "wood" });
}

function buildCarPark(parts) {
  // x 58..106, z 28..78. Four decks, no walls: columns, spandrels and barriers, which is
  // what a car park is and which keeps its sightlines long on every level. The vehicle
  // ramps switch back in two lanes at the east end, x 82..106, and each one's high edge
  // meets a landing that overlaps the deck by a stud (the header on wedges says why).
  for (const x of [62, 74]) {
    for (const z of [34, 46, 58, 70]) {
      solid(parts, { shape: "cylinder", size: [1.8, 44, 1.8], position: at(x, KERB + 22, z), color: C.conc, material: "concrete" });
    }
  }
  const LEVELS = [L1, L2, L3, L4];
  LEVELS.forEach((y, i) => {
    // The deck, and the landing at the ramp end. Together they are the level.
    solid(parts, { size: [25, 0.8, 50], position: at(70.5, y - 0.4, 53), color: C.conc, material: "concrete" });
    solid(parts, { size: [24, 0.8, 6], position: at(94, y - 0.4, i % 2 ? 31 : 49), color: C.conc, material: "concrete" });
    // The flight up to this level. Odd levels climb south in the west lane, even levels
    // climb north in the east lane, so the two lanes never share a footprint.
    const west = i % 2 === 0;
    flight(parts, {
      x: west ? 88 : 100, z: i % 2 ? 43 : 37, low: i === 0 ? KERB : LEVELS[i - 1], high: y,
      run: 18, width: 12, face: west ? "south" : "north", color: C.concDark,
    });
    // Barriers: the west edge in two pieces with the plank gap between them, and the north
    // edge whole. The south edge is deliberately open - it is the drop everybody learns.
    solid(parts, { size: [0.5, 1.3, 16], position: at(58.3, y + 0.65, 36), color: C.concDark, material: "concrete" });
    solid(parts, { size: [0.5, 1.3, 20], position: at(58.3, y + 0.65, 68), color: C.concDark, material: "concrete" });
    solid(parts, { size: [25, 1.3, 0.5], position: at(70.5, y + 0.65, 77.7), color: C.concDark, material: "concrete" });
    // Spandrels and bay markings, all dressing.
    for (const z of [28.4, 77.6]) {
      deco(parts, { size: [48, 1.6, 0.6], position: at(82, y + 0.8, z), color: C.concDark, material: "concrete" });
    }
    deco(parts, { size: [0.6, 1.6, 50], position: at(58.2, y + 0.8, 53), color: C.concDark, material: "concrete" });
    for (let k = 0; k < 7; k++) {
      deco(parts, { size: [10, 0.1, 0.4], position: at(65, y + 0.12, 32 + k * 7), color: C.line, material: "concrete" });
    }
    deco(parts, { size: [22, 0.3, 1], position: at(70.5, y + 8.4, 40), color: C.lamp, material: "neon" });
    deco(parts, { size: [22, 0.3, 1], position: at(70.5, y + 8.4, 66), color: C.lamp, material: "neon" });
    deco(parts, { size: [3.4, 2.2, 0.3], position: at(60, y + 2, 29), color: i % 2 ? C.cyan : C.amber, material: "neon" });
  });

  // Cars left on the decks: cover on every level, and the reason the ramps read as ramps.
  car(parts, 66, 34, 90, C.carRed, false);
  car(parts, 66, 62, 90, C.carPale, false);
  car(parts, 66, 46, 90, C.carBlue, false);
  car(parts, 66, 70, 90, C.carTaxi, true);
  // The two on the upper decks sit a level up; `car` writes its own STREET-relative body,
  // so the deck cars are drawn as their own pair of solids instead of re-using it.
  for (const [y, z, col] of [[L1, 40, C.carBlue], [L2, 66, C.carRed], [L3, 40, C.carPale], [L2, 34, C.carTaxi]]) {
    solid(parts, { size: [4.4, 2.4, 9.4], position: at(66, y + 1.2, z), color: col, material: "metal" });
    deco(parts, { size: [4.2, 1.7, 5], position: at(66, y + 2.9, z), color: col, material: "metal" });
    deco(parts, { size: [4.3, 1.3, 4.4], position: at(66, y + 3, z), color: C.glassDark, material: "glass", transparency: 0.3 });
    for (const dx of [-2.2, 2.2]) {
      for (const dz of [-3.1, 3.1]) {
        deco(parts, { shape: "cylinder", size: [2.2, 1, 2.2], position: at(66 + dx, y + 0.6, z + dz), rotation: [0, 90, 90], color: C.dark, material: "plastic" });
      }
    }
  }

  // ---- the roof: the big sign, the overrun, the plant, and the parapet -------------
  parapet(parts, { x0: 58, x1: 106, z0: 28, z1: 78, top: L4, color: C.concDark, gap: { side: "west", at: 50, width: 8 } });
  solid(parts, { size: [10, 4.6, 8], position: at(96, L4 + 2.3, 70), color: C.concDark, material: "concrete" });
  roofVent(parts, 64, L4, 36, 5);
  roofVent(parts, 78, L4, 72, 4.4);
  // The sign: the second and last lamp on this ground (§3.3). It stands proud of the roof
  // on two legs, so from the street it is the thing you navigate the city by.
  for (const dx of [-11, 11]) {
    deco(parts, { shape: "cylinder", size: [0.8, 9, 0.8], position: at(82 + dx, L4 + 4.5, 30.4), color: C.steelDark, material: "metal" });
  }
  deco(parts, { size: [26, 6, 0.6], position: at(82, L4 + 6.6, 30.2), color: C.dark, material: "metal" });
  deco(parts, {
    size: [23, 4.4, 0.3], position: at(82, L4 + 6.6, 29.8), color: C.pink, material: "neon",
    light: { color: C.pink, intensity: 2.4, range: 70 },
  });
  for (let i = 0; i < 5; i++) {
    deco(parts, { shape: "diamond", size: [1.8, 1.8, 0.4], position: at(73 + i * 4.5, L4 + 10.2, 29.9), color: i % 2 ? C.cyan : C.amber, material: "neon" });
  }
  deco(parts, { shape: "cylinder", size: [0.4, 10, 0.4], position: at(96, L4 + 9.6, 70), color: C.steel, material: "metal" });
  deco(parts, { shape: "sphere", size: [1, 1, 1], position: at(96, L4 + 14.8, 70), color: C.red, material: "neon" });

  // The plank from the shop row roof onto deck one, through both parapet gaps.
  solid(parts, { size: [12, 0.5, 3.4], position: at(53, L1 + 0.25, 50), color: C.woodPale, material: "wood" });
  deco(parts, { size: [12.4, 0.2, 0.3], position: at(53, L1 + 0.6, 51.9), color: C.rust, material: "metal" });
}

function buildAlleyEast(parts) {
  deco(parts, { size: [10, 0.14, 70], position: at(53, KERB + 0.07, 60), color: C.cobble, material: "cobble" });
  solid(parts, { size: [8, 3.6, 5], position: at(53, KERB + 1.8, 34), color: C.green, material: "metal" });
  solid(parts, { size: [7, 3.2, 4.4], position: at(53, KERB + 1.6, 92), color: C.rust, material: "metal" });
  solid(parts, { size: [3, 3, 3], position: at(51, KERB + 1.5, 70), color: C.wood, material: "wood" });
  const r = rng(606);
  for (let i = 0; i < 8; i++) {
    deco(parts, { size: [2.6, 0.3, 1.8], position: at(50 + r() * 5, KERB + 0.2, 32 + i * 8), rotation: [0, r() * 70, 0], color: C.woodPale, material: "wood" });
  }
  for (let i = 0; i < 6; i++) {
    deco(parts, { shape: "tube", size: [1.4, 8, 1.4], position: at(48.4, KERB + 5 + (i % 2) * 0.3, 34 + i * 11), rotation: [90, 0, 0], color: C.rust, material: "metal" });
  }
  for (let i = 0; i < 5; i++) {
    deco(parts, { size: [2.2, 1.4, 0.2], position: at(50, KERB + 7 + (i % 2) * 2, 36 + i * 13), color: C.amber, material: "neon" });
  }
  deco(parts, { shape: "cylinder", size: [6, 0.12, 6], position: at(53, KERB + 0.16, 58), color: C.water, material: "ice", transparency: 0.5 });
}

// =====================================================================================
// The pad parts, built from the one WEAPON_PADS list above
// =====================================================================================

function buildPads(parts) {
  for (const pad of WEAPON_PADS) {
    // canCollide:false WITH a behaviour, which is what makes it a sensor rather than a wall
    // (src/engine/parts.js:199-209). It does register a collider, so the twelve of them are
    // counted against TUNE.MAP_COLLIDER_MAX like anything else.
    parts.push({
      shape: "cylinder", size: [4.4, 0.3, 4.4], position: pad.position.slice(),
      color: C.cyan, material: "neon", anchored: true, canCollide: false,
      behaviors: [{ type: "touchEvent", event: pad.event, cooldownS: 0.5 }],
    });
    // A ring and a hovering marker so a pad reads as a pad from across a street. Dressing.
    parts.push({
      shape: "ring", size: [6, 0.2, 6], position: [pad.position[0], pad.position[1] + 0.1, pad.position[2]],
      color: C.amber, material: "neon", anchored: true, canCollide: false,
    });
    parts.push({
      shape: "diamond", size: [1.6, 2.4, 1.6], position: [pad.position[0], pad.position[1] + 3.4, pad.position[2]],
      color: C.cyan, material: "neon", anchored: true, canCollide: false, transparency: 0.2,
    });
  }
}

// =====================================================================================
// The perch (§3.2, §12.1): a small railed deck over the crossroads at origin + [0, 90, 0],
// which is where a dead fighter watches from. It is built as real parts, non-colliding
// except for its floor, because a spectator's own avatar is teleported onto it every tick
// and something has to hold them up.
// =====================================================================================

function buildPerch(parts) {
  solid(parts, { shape: "cylinder", size: [16, 0.8, 16], position: at(0, PERCH_Y - 0.4, 0), color: C.steelDark, material: "metal" });
  deco(parts, { shape: "ring", size: [17, 0.4, 17], position: at(0, PERCH_Y + 0.3, 0), color: C.cyan, material: "neon" });
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5;
    deco(parts, { shape: "cylinder", size: [0.4, 3.2, 0.4], position: at(Math.cos(a) * 7.4, PERCH_Y + 1.6, Math.sin(a) * 7.4), color: C.steel, material: "metal" });
  }
  deco(parts, { shape: "ring", size: [16, 0.3, 16], position: at(0, PERCH_Y + 3.1, 0), color: C.steel, material: "metal" });
  deco(parts, { shape: "dome", size: [10, 3, 10], position: at(0, PERCH_Y + 3.4, 0), color: C.dark, material: "metal", transparency: 0.45 });
}

// =====================================================================================
// build() - the MapBuild of §3.2's contract
// =====================================================================================

export function build() {
  const parts = [];

  buildGround(parts);
  buildStreetFurniture(parts);
  buildPlazaBlock(parts);
  buildSite(parts);
  buildTenement(parts);
  buildOffice(parts);
  buildAlleyWest(parts);
  buildShopRow(parts);
  buildCarPark(parts);
  buildAlleyEast(parts);
  buildPerch(parts);
  buildPads(parts);

  // Twenty-four starts, which clears the twenty of the room cap with slack, spread down
  // both avenues, round the plaza and onto each block's forecourt. §4.1 is what assigns
  // them - your rank in the lexicographically sorted fighter set - so all this file owes is
  // twenty-four positions no two fighters can start inside each other on, and none of them
  // inside a building, under a vehicle or on top of a pad.
  const spawns = [
    at(-108, STREET + 0.2, 0), at(-84, STREET + 0.2, 7), at(-58, STREET + 0.2, -7),
    at(-30, STREET + 0.2, 7), at(42, STREET + 0.2, -7), at(62, STREET + 0.2, 7),
    at(78, STREET + 0.2, -7), at(108, STREET + 0.2, 0),
    at(0, STREET + 0.2, -108), at(-7, STREET + 0.2, -80), at(7, STREET + 0.2, -60),
    at(-7, STREET + 0.2, -34), at(7, STREET + 0.2, 34), at(-7, STREET + 0.2, 62),
    at(7, STREET + 0.2, 78), at(0, STREET + 0.2, 108),
    at(30, KERB + 0.2, -70), at(104, KERB + 0.2, -60), at(104, KERB + 0.2, -104),
    at(-30, KERB + 0.2, 30), at(-100, KERB + 0.2, 30), at(30, KERB + 0.2, 24),
    at(-100, KERB + 0.2, -24), at(104, KERB + 0.2, 100),
  ];

  // Three Wardens (TUNE.WARDEN_COUNT), all in the open and all visible from a spawn, which
  // is the contract: a Warden that wakes behind a wall cannot telegraph (§9.2). The drum is
  // at most TUNE.WARDEN_BODY_W_MAX 3 studs wide and wardens.js builds it, so these are only
  // the spots: the crossroads, the plaza, and the west avenue by the bus.
  const wardenSpots = [
    at(0, STREET + 0.2, 0),
    at(56, KERB + 0.2, -56),
    at(-40, STREET + 0.2, 6),
  ];

  return {
    parts,
    spawns,
    weaponPads: WEAPON_PADS.map((p) => ({ id: p.id, kind: p.kind, event: p.event, position: p.position.slice() })),
    wardenSpots,
    landmarks: {
      // REQUIRED (§3.2). Everything else here is a convenience for the Wardens' lost-target
      // rule and for a spectator's first look at the ground.
      perch: at(0, PERCH_Y, 0),
      crossroads: at(0, STREET + 0.2, 0),
      fountain: at(40, KERB + 0.2, -44),
      busStop: at(-46, KERB + 0.2, -16),
      marketRoof: at(92, L1 + 0.2, -96),
      tenementRoof: at(-95, L3 + 0.2, 50),
      officeRoof: at(-48, L2 + 0.2, 52),
      carParkRoof: at(70, L4 + 0.2, 44),
      scaffoldTop: at(-98, L3 + 0.2, -80),
      siteFrame: at(-50, L2 + 0.2, -90),
    },
    // config.MAPS[1].lighting, mirrored value for value because a builder imports nothing.
    // `fog.far` is 300 and there is NO `near` key: resolveFog derives near as 0.55 * far and
    // never reads one, then clamps far to the tier maximum - 300 on low, which is what
    // SwiftShader and every phone report (§3.3). So the number written here is the number
    // that renders, and this ground is told apart from the other two by fog COLOUR and by
    // its neon, not by fog distance.
    lighting: {
      skyTop: "#232a44", skyBottom: "#6b5a7a",
      ambient: "#9db2c9", ambientIntensity: 0.7,
      sunColor: "#ffd8a8", sunIntensity: 1.1,
      sunDirection: [0.4, -0.8, 0.3],
      fog: { color: "#2b3049", far: 300 },
    },
    // The box this ground occupies. Four studs of slack past the 244-stud plate, and a
    // ceiling at 100 that clears the perch at 90 and the crane at 63. The fly clamp and
    // rule 25:S1 both read it, and every part above is inside it.
    bounds: { min: [OX - HALF - 4, -6, OZ - HALF - 4], max: [OX + HALF + 4, 100, OZ + HALF + 4] },
  };
}
