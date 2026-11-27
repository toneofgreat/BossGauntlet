// zones.js - WORLD's pure data: zone table, named points, spawn lists, layout constants (DESIGN 6, CONTRACT 6).
// No DOM / THREE use here, so node can import it for tests (src/world/dev/test.mjs).
// Builders may refine a point at build time (e.g. a kitten placed exactly on a roof) through `setPoint`.

export const DEG = Math.PI / 180;

// --- village layout (DESIGN 6.1 says ring r=34 at 0,45..315 deg; the main road (x=0) and the village ring road
// (r=34) would run straight through houses 0/4 and every doorstep, so WORLD rotates the ring by 22.5 deg and pushes the
// houses out to r=40: doors face the square and open onto the ring road; villagers spawn 3 m in front of each door).
export const VILLAGE = { cx: 0, cz: 240, houseR: 40, houseW: 8, houseD: 6.5, angle0: 22.5 * DEG, step: 45 * DEG };
export function villageHouse(k) {
  const a = VILLAGE.angle0 + k * VILLAGE.step;
  const s = Math.sin(a), c = Math.cos(a);
  const r = VILLAGE.houseR;
  const door = r - VILLAGE.houseD / 2;
  return {
    k, a,
    x: VILLAGE.cx + s * r, z: VILLAGE.cz + c * r,
    yaw: a + Math.PI,                                     // local +Z (door side) faces the square
    door: { x: VILLAGE.cx + s * door, z: VILLAGE.cz + c * door },
    spawn: { x: VILLAGE.cx + s * (door - 3), z: VILLAGE.cz + c * (door - 3) },
  };
}

export const ROYAL_POSTS = [[-15, 420], [-5, 420], [5, 420], [15, 420], [-8, 432], [8, 432]];

// Zone table. bounds: x0..x1, z0..z1, y0..y1 (zoneAt picks the smallest containing area).
function Z(id, name, region, atmo, music, b, spawn, extra) {
  return Object.assign({ id, name, region, atmo, music,
    bounds: { x0: b[0], z0: b[1], x1: b[2], z1: b[3], y0: b[4], y1: b[5] },
    spawn: { pos: { x: spawn[0], y: spawn[1], z: spawn[2] }, yaw: spawn[3] } }, extra || {});
}
const PI = Math.PI;
export const ZONE_DEFS = [
  Z("lobby", "The Lobby House", "main", "day", "area1", [-38, -38, 40, 36, -60, 80], [0, 0, 15, 0], { view: 260 }),
  Z("graves", "The Old Graves", "main", "day", "area1", [21, -16, 39, 4, -20, 40], [30, 0, 0, PI], { view: 250 }),
  Z("voidEdge", "The Edge", "main", "day", "area1", [-60, -40, -31, 30, -500, 60], [-33, 0, -4, -PI / 2], { view: 250 }),
  Z("path1", "The Old Road", "main", "day", "area1", [-12, 36, 12, 51, -20, 40], [0, 0, 40, 0], { view: 250 }),
  Z("bridge", "Nessa's Bridge", "main", "day", "area1", [-14, 51, 14, 72, -20, 40], [0, 2.2, 53, 0], { view: 220 }),
  Z("waterfall", "The Waterfall", "main", "day", "area1", [-90, 36, -55, 84, -20, 50], [-62, 0, 48, -PI / 2], { view: 220 }),
  Z("rookieShack", "Rookie's Shack", "main", "houseInterior", "area1", [-96, 52, -78, 68, -10, 12], [-82, 1, 60, -PI / 2], { view: 120 }),
  Z("ratField", "The Rat Field", "main", "day", "area1", [-38, 72, 38, 128, -20, 40], [0, 0, 80, 0], { view: 230 }),
  Z("ratKing", "The Old Mill", "main", "day", "area1", [-24, 128, 28, 170, -20, 40], [0, 0, 128, 0], { view: 230 }),
  Z("gate2", "The Village Gate", "main", "afternoon", "area2", [-14, 170, 14, 186, -20, 40], [0, 0, 172, 0], { view: 260 }),
  Z("village", "Brindlewick", "main", "afternoon", "area2", [-60, 186, 60, 290, -20, 60], [0, 0, 192, 0], { view: 320 }),
  Z("barn", "The Old Barn", "main", "afternoon", "area2", [-100, 214, -60, 258, -10, 30], [-66, 0, 236, -PI / 2], { view: 200 }),
  Z("guardPost", "The Guard Post", "main", "afternoon", "area2", [-26, 288, 26, 322, -20, 50], [0, 0, 297, 0], { view: 260 }),
  Z("gate3", "The Castle Road", "main", "golden", "area3", [-14, 322, 14, 398, -20, 60], [0, 0, 326, 0], { view: 330 }),
  Z("castle", "Castle Aldmoor", "main", "golden", "area3", [-50, 398, 50, 516, 0, 90], [0, 18, 419, 0], { view: 600 }),
  Z("throne", "The Throne Room", "main", "throne", "area3", [-13, 480, 13, 511, 15, 40], [0, 20, 483, 0], { view: 120 }),
  Z("kingDark", "The Dark", "none", "kingDark", "king", [1960, -40, 2040, 40, -100, 100], [2000, 0, 22, PI], { view: 200 }),
  Z("desert", "The Desert", "desert", "desertFog", "desert", [-420, -2420, 420, -1580, -100, 200], [0, 0, -1710, PI], { view: 900 }),
  Z("forest", "The Forest", "forest", "forest", "forestQuiet", [-2300, -250, -1700, 250, -100, 200], [-1760, 0, 0, -PI / 2], { view: 700 }),
  Z("forestHouse", "The House in the Forest", "forest", "houseInterior", "house", [-2185, -25, -2135, 25, -20, 40], [-2162, 0, 0, PI / 2], { view: 300 }),
  Z("hollowDesert", "A Desert Again", "hollowDesert", "hollowDesert", "desert", [-300, -4450, 300, -3850, -100, 300], [0, 0, -3990, PI], { view: 700 }),
  Z("finalArena", "The End of the Map", "none", "final", "final", [-150, 7850, 150, 8150, -500, 500], [0, 0, 8050, PI], { view: 900 }),
];
export const ZONE_IDS = ZONE_DEFS.map((z) => z.id);

// Named points (CONTRACT 6). `t:1` = snap y to terrain at runtime (desert/forest/hollow pockets have dunes).
const P = (x, y, z, t) => ({ x, y, z, t: t ? 1 : 0 });
export const POINTS = {
  spawn: P(0, 0, 15),
  bridgeFar: P(0, 0, 72),
  ratField: P(0, 0, 100),
  ratKingGate: P(0, 0, 132),
  gate2: P(0, 0, 175),
  villageSquare: P(0, 0, 240),
  exchange: P(10.5, 0, 228.5),
  guardPost: P(0, 0, 300),
  gate3: P(0, 0, 329),
  courtyard: P(0, 18, 425),
  kingPortal: P(0, 18, 474),
  throneDoor: P(0, 20, 484),
  throneSeat: P(0, 21, 505.6),
  lobbyBack: P(0, 0, -12),
  graveShovel: P(32, 0, -2.4),
  grave0: P(25, 0, -8), grave1: P(27, 0, -8), grave2: P(29, 0, -8),
  grave3: P(31, 0, -8), grave4: P(33, 0, -8), grave5: P(35, 0, -8),
  voidLeap: P(-36.6, 0, -4),
  well: P(0, 0, 240),
  towerLetter: P(14, 12, 308),
  portrait: P(-30, 18, 465),
  basement: P(2, -3.2, -5),
  underBridge: P(-1.5, -0.35, 60),
  waterfallCave: P(-75, 1, 60),
  kitten0: P(-4, 7.2, -1),
  kitten1: P(18, 0, 108),
  kitten2: P(0, 0, 0),                 // set by area2 (chimney of house 1)
  barnDoor: P(-71, 0, 236),
  rookieShack: P(-88, 1, 60),
  cactusFlower: P(95, 0, -1950, 1),
  totem: P(-1900, 0, 32, 1),
  desertArrive: P(0, 0, -1710, 1),
  forestArrive: P(-1760, 0, 0, 1),
  forestHouseDoorOut: P(-2156.2, 0, 0, 1),
  forestHouseDoorFront: P(-2153, 0, 0, 1),
  desertExitNg: P(0, 0, -1850, 1),
  forestHouseInside: P(-2162, 0, 0, 1),
  hollowArrive: P(0, 0, -3990, 1),
  girl: P(0, 1.0, -4080),
  hollowFar: P(0, 0, -4320, 1),
  hollowArena: P(0, 0, -4150, 1),
  homePortal: P(0, 0, -3985, 1),
  finalArrive: P(0, 0, 8050),
  finalBoss: P(0, 0, 7930),
  kingArrive: P(2000, 0, 22),
  kingSpot: P(2000, 0, -10),
  forestBackPortal: P(-1746, 0, 0, 1),
  desertBackPortal: P(0, 0, -1696, 1),
  // extras (WORLD additions)
  kingReturn: P(2000, 0, 24),
  kingReturnArrive: P(0, 18, 469),
  desertBackArrive: P(0, 0, -8.5),
  homeArrive: P(0, 0, 15),
  greatHall: P(0, 18, 465),
  watchtowerTop: P(14, 12, 308),
  ratKingCenter: P(0, -1.5, 148),
  throneCenter: P(0, 20, 495),
  mill: P(17, 0, 157),
  voidFence: P(-37, 0, -4),
};
export function setPoint(name, x, y, z) {
  const p = POINTS[name] || (POINTS[name] = P(0, 0, 0));
  p.x = x; p.y = y; p.z = z; p.t = 0;
}

// deterministic rng so every build is identical
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Spawn lists (CONTRACT 6: world.spawns(kind) -> [{ pos, yaw, radius }])
function S(x, y, z, yaw, radius) { return { pos: { x, y, z }, yaw, radius: radius || 0 }; }
export function buildSpawns() {
  const out = {};
  const r = rng(71);
  out.rat = [];
  for (let i = 0; i < 12; i++) {
    const col = i % 4, row = (i / 4) | 0;
    const x = -24 + col * 16 + (r() - 0.5) * 6;
    const z = 86 + row * 13 + (r() - 0.5) * 5;
    out.rat.push(S(+x.toFixed(2), 0, +z.toFixed(2), r() * Math.PI * 2, 4));
  }
  out.ratKing = [S(0, -1.5, 152, PI, 0)];
  out.villager = [];
  for (let k = 0; k < 8; k++) {
    const h = villageHouse(k);
    out.villager.push(S(+h.spawn.x.toFixed(2), 0, +h.spawn.z.toFixed(2), h.yaw, 1.5));
  }
  out.fydor = [S(-5, 0, 302, PI, 0)];
  out.myles = [S(5, 0, 302, PI, 0)];
  out.royalGuard = ROYAL_POSTS.map(([x, z]) => S(x, 18, z, PI, 2));
  out.king = [S(2000, 0, -10, 0, 0)];
  out.cat = [S(-80, 6.25, 240, PI / 2, 0)];
  out.rookie = [S(-89, 1, 60, PI / 2, 0)];
  out.shadowRat = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    out.shadowRat.push(S(+(Math.sin(a) * 7).toFixed(2), 20, +(497 + Math.cos(a) * 7).toFixed(2), a + PI, 1));
  }
  return out;
}

// Atmosphere preset per zone when the zone is "dark" inside (forest house at night is pushed by EVENTS).
export const INTERIOR_ATMO = { rookieShack: "houseInterior", forestHouse: "houseInterior" };

// Portal table: id -> { pos, yaw (ring facing), to (zone), arrive (point), active default }
export const PORTALS = {
  kingPortal: { pos: [0, 18, 474], yaw: 0, to: "kingDark", arrive: "kingArrive", arriveYaw: PI, active: true, color: "black" },
  kingReturn: { pos: [2000, 0, 24], yaw: PI, to: "castle", arrive: "kingReturnArrive", arriveYaw: PI, active: false, color: "black" },
  lobbyBack: { pos: [0, 0, -12], yaw: 0, to: "desert", arrive: "desertArrive", arriveYaw: PI, active: false, color: "violet" },
  desertBack: { pos: [0, 0, -1696], yaw: PI, to: "lobby", arrive: "desertBackArrive", arriveYaw: 0, active: true, color: "violet" },
  desertExit: { pos: [0, 0, -1850], yaw: 0, to: "forest", arrive: "forestArrive", arriveYaw: -PI / 2, active: false, color: "violet" },
  forestBack: { pos: [-1746, 0, 0], yaw: -PI / 2, to: "desert", arrive: "desertArrive", arriveYaw: PI, active: true, color: "violet" },
  homePortal: { pos: [0, 0, -3985], yaw: PI, to: "lobby", arrive: "homeArrive", arriveYaw: 0, active: false, color: "violet" },
};

export const GRAVE_NAMES = ["The Rat King", "The Villagers", "Fydor & Myles", "The Royal Guards", "The King", "Elsie"];
export const GRAVE_ITEMS = ["cheese_sword", "wooden_sword", "iron_sword", "gold_sword", "kings_staff", "girls_ribbon"];

export const GATES = {
  area2: { pos: [0, 0, 178], approach: -1 },   // approach side: -1 = from lower z
  area3: { pos: [0, 0, 332], approach: -1 },
};

// smallest-containing zone lookup (pure; index.js wraps it)
export function zoneAtPure(defs, x, y, z) {
  let best = null, bestA = Infinity;
  for (let i = 0; i < defs.length; i++) {
    const b = defs[i].bounds;
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || y < b.y0 || y > b.y1) continue;
    const a = (b.x1 - b.x0) * (b.z1 - b.z0);
    if (a < bestA) { bestA = a; best = defs[i].id; }
  }
  return best;
}
