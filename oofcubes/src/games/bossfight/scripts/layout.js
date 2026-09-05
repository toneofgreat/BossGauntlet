// src/games/bossfight/scripts/layout.js — the valley, as data. Spec 22 §3 owns this.
//
// Pure ESM: no DOM, no THREE, no ctx — rule 22:B2 imports this and audits the real
// geometry (gates that truly seal, arenas wider than a boss's charge), the same
// run-the-real-generator discipline specs 08 and 21 use.
//
// One valley along +x: spawn plaza → grass arena → wood gate → wood arena → lava gate
// → lava arena. The walls are taller than any jump; the gates are real collidable
// parts that the game sinks into the floor when the boss before them dies.

export const SPAWN = Object.freeze([0, 4.32, 0]); // plaza disc top 4.22 + the 0.1 settle
export const SPAWN_YAW = 90;        // facing +x, down the valley
export const KILL_Y = -20;

export const FLOOR_TOP = 4;         // top surface of every walkable slab
export const WALL_H = 16;           // taller than the 6.37-stud jump apex by miles
export const VALLEY_Z = 30;         // walls at z = ±VALLEY_Z

// Arena discs. Radius comfortably beyond every boss's furthest reach: the widest
// charge is Mossback's (overshoot 10 from center per spec §4), and rule 22:B2 checks
// r > overshoot + 6 for each boss against BOSS_SPEC.
export const ARENAS = Object.freeze({
  grass: Object.freeze({ cx: 66, cz: 0, r: 26 }),
  wood: Object.freeze({ cx: 140, cz: 0, r: 26 }),
  lava: Object.freeze({ cx: 216, cz: 0, r: 24 }),
});

// Gates: a slab across the full valley width. `gateId` is the part the game sinks;
// its flanks are ordinary wall and never move. Opened-by: the arena you must clear.
export const GATES = Object.freeze([
  Object.freeze({ id: "gateWood", x: 103, opens: "wood", needs: "grass" }),
  Object.freeze({ id: "gateLava", x: 178, opens: "lava", needs: "wood" }),
]);

const C = Object.freeze({
  plaza: "#9aa3b0", plazaTrim: "#7d8694",
  grass: "#4f9e3f", grassDark: "#3c7d30", flower1: "#e0245e", flower2: "#f5cd30",
  dirt: "#8c5a3c", trunk: "#6b4423", leaves: "#2f8f4a",
  wood: "#a07040", woodDark: "#6b4a2c", plank: "#b98a4e",
  stone: "#5c6478", obsidian: "#1f2027", lava: "#ff5a1f", ember: "#ffb347",
  gate: "#454c5c", gateGlow: "#9fe870",
});

let nextId = 0;
function id(prefix) { nextId += 1; return `${prefix}_${nextId}`; }

function part(prefix, def) {
  return { id: id(prefix), material: "plastic", canCollide: true, ...def };
}

// A tree: trunk + two crown spheres. Decorative but solid — hiding behind one works.
function tree(parts, x, z, s = 1) {
  parts.push(part("tree", { shape: "cylinder", size: [1.6 * s, 7 * s, 1.6 * s],
    position: [x, FLOOR_TOP + 3.5 * s, z], color: C.trunk, material: "wood" }));
  parts.push(part("tree", { shape: "sphere", size: [7 * s, 7 * s, 7 * s],
    position: [x, FLOOR_TOP + 8.5 * s, z], color: C.leaves }));
  parts.push(part("tree", { shape: "sphere", size: [5 * s, 5 * s, 5 * s],
    position: [x + 2 * s, FLOOR_TOP + 10.5 * s, z + 1 * s], color: C.grass }));
}

export function buildValley() {
  nextId = 0;
  const parts = [];
  const decorIds = { flowers: [], embers: [] };

  // ---- ground ----------------------------------------------------------------------
  // One long dirt path under everything up to the lava gate; past it, the ground is
  // LAVA — non-collide and lethal by killY — except the obsidian arena disc.
  parts.push(part("ground", { size: [212, 4, VALLEY_Z * 2], position: [84, FLOOR_TOP - 2, 0], color: C.dirt }));
  // biome dressing laid on top (0.2 thick, walkable):
  parts.push(part("plaza", { shape: "cylinder", size: [40, 0.24, 40], position: [0, FLOOR_TOP + 0.1, 0], color: C.plaza }));
  parts.push(part("plaza", { shape: "cylinder", size: [43, 0.1, 43], position: [0, FLOOR_TOP + 0.06, 0], color: C.plazaTrim }));
  parts.push(part("meadow", { shape: "cylinder", size: [ARENAS.grass.r * 2 + 8, 0.24, ARENAS.grass.r * 2 + 8],
    position: [ARENAS.grass.cx, FLOOR_TOP + 0.1, 0], color: C.grass }));
  parts.push(part("woodfloor", { shape: "cylinder", size: [ARENAS.wood.r * 2 + 8, 0.24, ARENAS.wood.r * 2 + 8],
    position: [ARENAS.wood.cx, FLOOR_TOP + 0.1, 0], color: C.plank, material: "wood" }));

  // The lava lake: floor-of-death. The visible lava sheet cannot be stood on; the
  // obsidian disc can. killY (-20) is what actually kills — 22:B2 checks the sheet is
  // non-collide so a step off the disc is a fall, not a walk.
  parts.push(part("lavasheet", { size: [96, 1, VALLEY_Z * 2], position: [238, FLOOR_TOP - 4.5, 0],
    color: C.lava, material: "lava", canCollide: false }));
  parts.push(part("obsidian", { shape: "cylinder", size: [ARENAS.lava.r * 2, 5, ARENAS.lava.r * 2],
    position: [ARENAS.lava.cx, FLOOR_TOP - 2.4, 0], color: C.obsidian }));
  // a bridge from the lava gate onto the disc
  parts.push(part("bridge", { size: [18, 1.2, 8], position: [ARENAS.lava.cx - ARENAS.lava.r - 8, FLOOR_TOP - 0.5, 0],
    color: C.stone, material: "metal" }));

  // ---- the valley walls ------------------------------------------------------------
  for (const side of [-1, 1]) {
    parts.push(part("wall", { size: [300, WALL_H, 3], position: [130, FLOOR_TOP + WALL_H / 2, side * (VALLEY_Z + 1.5)],
      color: C.stone }));
  }
  parts.push(part("wall", { size: [3, WALL_H, VALLEY_Z * 2 + 6], position: [-21.5, FLOOR_TOP + WALL_H / 2, 0], color: C.stone }));
  parts.push(part("wall", { size: [3, WALL_H, VALLEY_Z * 2 + 6], position: [281.5, FLOOR_TOP + WALL_H / 2, 0], color: C.stone }));

  // ---- gates -----------------------------------------------------------------------
  // Full-width slabs; 22:B2 measures that gate + walls leave no crack. The game sinks
  // the whole slab on unlock (parts.setCanCollide false + transparency), so "open" is
  // visible from across the arena.
  const gateIds = {};
  for (const g of GATES) {
    const gate = part("gate", { size: [2.4, WALL_H - 2, VALLEY_Z * 2], position: [g.x, FLOOR_TOP + (WALL_H - 2) / 2, 0],
      color: C.gate, material: "metal" });
    gate.id = g.id; // stable id, promised to the game and to 22:B2
    parts.push(gate);
    gateIds[g.id] = gate.id;
    // glow trim that marks it as a door, not a wall
    parts.push(part("gatetrim", { size: [2.6, 1, VALLEY_Z * 2], position: [g.x, FLOOR_TOP + WALL_H - 2.4, 0],
      color: C.gateGlow, material: "neon", canCollide: false }));
  }

  // ---- plaza dressing --------------------------------------------------------------
  // Trophy plinths: stone columns; the game parents a boss "head" on a kill.
  const plinthTop = {};
  const plinthX = [-10, -13, -16];
  const bossOrder = ["grass", "wood", "lava"];
  for (let i = 0; i < 3; i++) {
    parts.push(part("plinth", { shape: "cylinder", size: [3, 3.4, 3], position: [plinthX[i], FLOOR_TOP + 1.7, -12],
      color: C.plazaTrim, material: "metal" }));
    plinthTop[bossOrder[i]] = [plinthX[i], FLOOR_TOP + 4.6, -12];
  }
  // The training dummy: a hittable target that teaches the swing before any boss can
  // punish not knowing it. The game reads this id.
  const dummy = part("dummy", { size: [2, 2.6, 1.2], position: [8, FLOOR_TOP + 3.4, -10], color: "#d9b48f", material: "wood" });
  parts.push(dummy);
  parts.push(part("dummypost", { shape: "cylinder", size: [0.8, 2.2, 0.8], position: [8, FLOOR_TOP + 1.1, -10],
    color: C.trunk, material: "wood" }));

  // ---- grass biome dressing --------------------------------------------------------
  tree(parts, 44, -20, 1.1); tree(parts, 52, 21, 0.9); tree(parts, 88, -22, 1.25);
  const flowerSpots = [
    [40, 8], [48, -12], [58, 16], [63, -18], [72, 20], [80, -8], [86, 12], [55, 3], [76, -16],
  ];
  for (let i = 0; i < flowerSpots.length; i++) {
    const [fx, fz] = flowerSpots[i];
    const fl = part("flower", { shape: "sphere", size: [0.9, 0.9, 0.9], position: [fx, FLOOR_TOP + 0.9, fz],
      color: i % 2 ? C.flower1 : C.flower2, material: "neon", canCollide: false });
    parts.push(fl);
    decorIds.flowers.push(fl.id);
    parts.push(part("stem", { shape: "cylinder", size: [0.2, 0.9, 0.2], position: [fx, FLOOR_TOP + 0.45, fz],
      color: C.grassDark, canCollide: false }));
  }

  // ---- wood biome dressing ---------------------------------------------------------
  for (const [sx, sz, r] of [[118, -18, 2.2], [126, 20, 1.8], [156, -21, 2.6], [162, 17, 2.0]]) {
    parts.push(part("stump", { shape: "cylinder", size: [r * 2, 2.2, r * 2], position: [sx, FLOOR_TOP + 1.1, sz],
      color: C.woodDark, material: "wood" }));
    parts.push(part("stumptop", { shape: "cylinder", size: [r * 2 - 0.4, 0.2, r * 2 - 0.4], position: [sx, FLOOR_TOP + 2.3, sz],
      color: C.plank, material: "wood", canCollide: false }));
  }
  // a log pile by the gate
  for (let i = 0; i < 3; i++) {
    parts.push(part("logpile", { shape: "cylinder", size: [1.6, 9, 1.6], position: [112, FLOOR_TOP + 0.8 + i * 1.3, 24 - i * 0.4],
      rotation: [0, 0, 90], color: C.trunk, material: "wood" }));
  }
  // sawblade totems: pure menace, no mechanics
  for (const [tx, tz] of [[124, -26], [152, 26]]) {
    parts.push(part("totem", { shape: "cylinder", size: [0.9, 7, 0.9], position: [tx, FLOOR_TOP + 3.5, tz], color: C.woodDark, material: "wood" }));
    parts.push(part("blade", { shape: "cylinder", size: [4.4, 0.4, 4.4], position: [tx, FLOOR_TOP + 7.4, tz],
      rotation: [90, 0, 0], color: "#c7cdd9", material: "metal", canCollide: false,
      behaviors: [{ type: "spinner", axis: "z", speed: 160 }] }));
  }

  // ---- lava biome dressing ---------------------------------------------------------
  // glowing cracks on the obsidian disc, ember pillars around it
  for (const [gx, gz, gl] of [[204, -8, 9], [222, 10, 7], [214, -14, 6], [226, -4, 8]]) {
    parts.push(part("crack", { size: [gl, 0.12, 0.8], position: [gx, FLOOR_TOP + 0.18, gz],
      rotation: [0, (gx * 37) % 180, 0], color: C.lava, material: "neon", canCollide: false }));
  }
  for (const [ex, ez] of [[196, -24], [200, 22], [236, -22], [240, 20]]) {
    parts.push(part("emberpillar", { size: [2.4, 12, 2.4], position: [ex, FLOOR_TOP + 6, ez], color: C.obsidian }));
    const em = part("ember", { shape: "sphere", size: [1.4, 1.4, 1.4], position: [ex, FLOOR_TOP + 13.2, ez],
      color: C.ember, material: "lava", canCollide: false });
    parts.push(em);
    decorIds.embers.push(em.id);
  }
  // obsidian spikes on the rim
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sx = ARENAS.lava.cx + Math.cos(a) * (ARENAS.lava.r - 2);
    const sz = Math.sin(a) * (ARENAS.lava.r - 2);
    if (Math.abs(sz) > VALLEY_Z - 4) continue;
    parts.push(part("spike", { shape: "wedge", size: [2, 4 + (i % 3), 2], position: [sx, FLOOR_TOP + 2 + (i % 3) / 2, sz],
      rotation: [0, i * 61, 0], color: C.obsidian }));
  }

  return {
    parts,
    gateIds,
    dummyId: dummy.id,
    plinthTop,
    decorIds,
  };
}
