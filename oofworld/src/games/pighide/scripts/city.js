// src/games/pighide/scripts/city.js - PIG HIDE's world data and runtime dressing.
// Spec 27 §2.2 and §3 own this file (M16-T02).
//
// Two halves:
//   1. Pure data that describes the permanent city built in ../place.json: the city
//      bounds, the lobby points the round teleports to, the kiosks, the sixteen pig drop
//      points, the hide-spot inventory and the nine districts. Every array below is a
//      LITERAL on purpose: rules:27 (P3, P4) parse this file as text, and smoke imports it.
//      The literals were laid out together with place.json, so a point listed here is
//      clear of every canCollide part there (P3: 1.5 studs) and every hide spot is
//      reachable on foot from the city ground (P4).
//   2. createCity(ctx): the only runtime dressing (§3.6). One THREE.Group hung on the
//      scene through parts.addCustom, holding the fountain water and droplets, three
//      drifting clouds, the turning gold pig on the City Gate and six waddling pigeons
//      in the Farmers Market. Nothing in it collides. It also eases the sky through a
//      slow day, dusk, night and dawn cycle with renderer.applyLighting (a gentle one:
//      night keeps enough ambient light to play, and the 24 street lamps carry it).
//
// No timers, no storage, no DOM: everything advances on update(dt).

// ===================================================================================
// ===== SECTION: frame (§2.2, §3.1) =================================================
// ===================================================================================

export const BOUNDS = Object.freeze({ minX: -160, maxX: 160, minZ: -160, maxZ: 160, minY: -10, maxY: 90 });
export const PLACE_BOUNDS = Object.freeze({ minX: -170, maxX: 170, minZ: -258, maxZ: 170 });
export const LOBBY = Object.freeze({ center: Object.freeze([0, 0, -215]), half: Object.freeze([70, 40]) });
export const SPAWN = Object.freeze([0, 0.1, -215]);

// Ring of 12 points, radius 10, around the lobby centre. Index by rank % 12 (§4.5).
export const LOBBY_RETURN = [
  [0, 0.1, -205],
  [5, 0.1, -206.34],
  [8.66, 0.1, -210],
  [10, 0.1, -215],
  [8.66, 0.1, -220],
  [5, 0.1, -223.66],
  [0, 0.1, -225],
  [-5, 0.1, -223.66],
  [-8.66, 0.1, -220],
  [-10, 0.1, -215],
  [-8.66, 0.1, -210],
  [-5, 0.1, -206.34],
];

// Inside the closed Hunter Cage (8x8 steel bars, roof at y 8).
export const HUNTER_CAGE = [30, 0.1, -192];
// Just inside the City Gate.
export const HUNTER_RELEASE = [0, 0.1, -150];
// Inside the open-top Pig Pen (14x14 fence, h 3).
export const PIG_PEN = [-30, 0.1, -192];

// Round-start drops (§3.3): two per outer district (the yard has one, beside the sewer),
// one in Fountain Square. All >= 25 studs from HUNTER_RELEASE. Use PIG_DROPS[(rank * 5) % 16].
export const PIG_DROPS = [
  [-120, 0.1, -110],
  [-90, 0.1, -86],
  [0, 0.1, -88],
  [-24, 0.1, -136],
  [130, 0.1, -94],
  [104, 0.1, -144],
  [-128, 0.1, 0],
  [-86, 0.1, 0],
  [0, 0.1, 18],
  [86, 0.1, 22],
  [-140, 0.1, 132],
  [-100, 0.1, 128],
  [-8, 0.1, 89],
  [24, 0.1, 104],
  [112, 0.1, 108],
  [121, 0.1, 136],
];

// Lobby kiosks (§3.2). pos is where the player stands; the panel opens within radius.
export const KIOSKS = [
  { id: "pig-skins", label: "Pig Skin Boutique", pos: [-50, 0.1, -222], radius: 6, panel: "pig-skins" },
  { id: "pig-lab", label: "Pig Upgrade Lab", pos: [-50, 0.1, -240], radius: 6, panel: "pig-lab" },
  { id: "hunter-skins", label: "Hunter Armory", pos: [50, 0.1, -222], radius: 6, panel: "hunter-skins" },
  { id: "hunter-range", label: "Hunter Range", pos: [50, 0.1, -240], radius: 6, panel: "hunter-range" },
  { id: "radar", label: "Radar Vault", pos: [0, 0.1, -251.5], radius: 6, panel: "radar" },
];

// Hide-spot inventory (§3.4): p is where a pig stands to be hidden there.
export const HIDE_SPOTS = [
  { id: "apartments-cabinet-1", kind: "cabinet", district: "apartments", p: [-134, 0.1, -146.5] },
  { id: "apartments-under-bed-1", kind: "under-bed", district: "apartments", p: [-132.5, 8.1, -144] },
  { id: "apartments-bathtub-1", kind: "bathtub", district: "apartments", p: [-131.5, 16.1, -146.5] },
  { id: "apartments-cabinet-2", kind: "cabinet", district: "apartments", p: [-79.5, 0.1, -147.6] },
  { id: "apartments-wardrobe-1", kind: "wardrobe", district: "apartments", p: [-79, 8.1, -146.5] },
  { id: "apartments-closet-1", kind: "closet", district: "apartments", p: [-78.5, 16.1, -145.6] },
  { id: "apartments-water-tank-1", kind: "water-tank", district: "apartments", p: [-130, 24.1, -138] },
  { id: "apartments-rooftop-1", kind: "rooftop", district: "apartments", p: [-142, 24.1, -132] },
  { id: "apartments-rooftop-2", kind: "rooftop", district: "apartments", p: [-64.2, 16.1, -129] },
  { id: "apartments-bush-1", kind: "bush", district: "apartments", p: [-100, 0.1, -78] },
  { id: "market-under-table-1", kind: "under-table", district: "market", p: [-20, 0.1, -114] },
  { id: "market-under-table-2", kind: "under-table", district: "market", p: [20, 0.1, -114] },
  { id: "market-crate-stack-1", kind: "crate-stack", district: "market", p: [-40, 0.1, -145] },
  { id: "market-crate-stack-2", kind: "crate-stack", district: "market", p: [38, 0.1, -145] },
  { id: "market-hay-1", kind: "hay", district: "market", p: [-40, 0.1, -82] },
  { id: "market-hay-2", kind: "hay", district: "market", p: [40, 0.1, -82] },
  { id: "market-barrel-1", kind: "barrel", district: "market", p: [-6, 0.1, -143.8] },
  { id: "market-barrel-2", kind: "barrel", district: "market", p: [6, 0.1, -73.8] },
  { id: "market-truck-back-1", kind: "truck-back", district: "market", p: [24, 1.1, -146] },
  { id: "shops-bread-aisle-1", kind: "bread-aisle", district: "shops", p: [74, 0.1, -118.8] },
  { id: "shops-under-table-1", kind: "under-table", district: "shops", p: [78, 0.1, -110] },
  { id: "shops-closet-1", kind: "closet", district: "shops", p: [86, 0.1, -122] },
  { id: "shops-ball-pit-1", kind: "ball-pit", district: "shops", p: [104, 0.1, -118] },
  { id: "shops-clothes-rack-1", kind: "clothes-rack", district: "shops", p: [128, 0.1, -120.8] },
  { id: "shops-clothes-rack-2", kind: "clothes-rack", district: "shops", p: [136, 0.1, -120.8] },
  { id: "shops-closet-2", kind: "closet", district: "shops", p: [154, 0.1, -118] },
  { id: "shops-phone-booth-1", kind: "phone-booth", district: "shops", p: [74, 0.1, -84] },
  { id: "shops-closet-3", kind: "closet", district: "shops", p: [98, 0.1, -84.5] },
  { id: "park-hedge-maze-1", kind: "hedge-maze", district: "park", p: [-148, 0.1, -18.3] },
  { id: "park-hedge-maze-2", kind: "hedge-maze", district: "park", p: [-132, 0.1, -24.3] },
  { id: "park-bush-1", kind: "bush", district: "park", p: [-96, 0.1, 16] },
  { id: "park-bush-2", kind: "bush", district: "park", p: [-78, 0.1, 28] },
  { id: "park-bush-3", kind: "bush", district: "park", p: [-92, 0.1, 29] },
  { id: "park-bush-4", kind: "bush", district: "park", p: [-150, 0.1, 8] },
  { id: "park-bush-5", kind: "bush", district: "park", p: [-150, 0.1, 34] },
  { id: "park-bush-6", kind: "bush", district: "park", p: [-108, 0.1, 38] },
  { id: "park-bush-7", kind: "bush", district: "park", p: [-72, 0.1, -36] },
  { id: "park-bush-8", kind: "bush", district: "park", p: [-118, 0.1, 10] },
  { id: "park-mud-1", kind: "mud", district: "park", p: [-130, 0.1, 30] },
  { id: "park-mud-2", kind: "mud", district: "park", p: [-100, 0.1, 4] },
  { id: "park-mud-3", kind: "mud", district: "park", p: [-80, 0.1, -14] },
  { id: "park-mud-4", kind: "mud", district: "park", p: [-118, 0.1, -14] },
  { id: "park-tube-slide-1", kind: "tube-slide", district: "park", p: [-93, 0.1, -14] },
  { id: "park-tube-slide-2", kind: "tube-slide", district: "park", p: [-82, 0.1, -25] },
  { id: "park-under-table-1", kind: "under-table", district: "park", p: [-134, 0.5, 22] },
  { id: "square-fountain-1", kind: "fountain", district: "square", p: [0, 0.1, 0] },
  { id: "square-fountain-2", kind: "fountain", district: "square", p: [0, 0.1, -10.5] },
  { id: "square-phone-booth-1", kind: "phone-booth", district: "square", p: [-38, 0.1, 8] },
  { id: "square-phone-booth-2", kind: "phone-booth", district: "square", p: [38, 0.1, -8] },
  { id: "square-under-stage-1", kind: "under-stage", district: "square", p: [-4, 0.1, 35] },
  { id: "square-under-stage-2", kind: "under-stage", district: "square", p: [5, 0.1, 35] },
  { id: "yard-pipe-1", kind: "pipe", district: "yard", p: [76, 0.1, -30] },
  { id: "yard-pipe-2", kind: "pipe", district: "yard", p: [76, 0.1, -18] },
  { id: "yard-pipe-3", kind: "pipe", district: "yard", p: [92, 0.1, 34] },
  { id: "yard-rooftop-1", kind: "rooftop", district: "yard", p: [144, 11.5, -30] },
  { id: "yard-crate-stack-1", kind: "crate-stack", district: "yard", p: [128, 0.1, 30.5] },
  { id: "yard-dumpster-1", kind: "dumpster", district: "yard", p: [78, 0.1, 40] },
  { id: "yard-dumpster-2", kind: "dumpster", district: "yard", p: [88, 0.1, 40] },
  { id: "yard-dumpster-3", kind: "dumpster", district: "yard", p: [154, 0.1, 10] },
  { id: "yard-hay-1", kind: "hay", district: "yard", p: [92, 0.1, -2] },
  { id: "yard-closet-1", kind: "closet", district: "yard", p: [134, 0.1, -40] },
  { id: "yard-sewer-1", kind: "sewer", district: "yard", p: [112, -8.9, -30] },
  { id: "yard-sewer-2", kind: "sewer", district: "yard", p: [112, -8.9, 18] },
  { id: "yard-sewer-3", kind: "sewer", district: "yard", p: [97, -8.9, 0] },
  { id: "yard-sewer-4", kind: "sewer", district: "yard", p: [105, -8.9, 30] },
  { id: "barn-hayloft-1", kind: "hayloft", district: "barn", p: [-130, 8.1, 115] },
  { id: "barn-hay-1", kind: "hay", district: "barn", p: [-130, 8.1, 115] },
  { id: "barn-hay-2", kind: "hay", district: "barn", p: [-145, 0.1, 116] },
  { id: "barn-hay-3", kind: "hay", district: "barn", p: [-108, 0.1, 76] },
  { id: "barn-hay-4", kind: "hay", district: "barn", p: [-96, 0.1, 82] },
  { id: "barn-hay-5", kind: "hay", district: "barn", p: [-150, 0.1, 80] },
  { id: "barn-hay-6", kind: "hay", district: "barn", p: [-84, 0.1, 140] },
  { id: "barn-hay-7", kind: "hay", district: "barn", p: [-96, 0.1, 150] },
  { id: "barn-hay-8", kind: "hay", district: "barn", p: [-116, 0.1, 146] },
  { id: "barn-mud-1", kind: "mud", district: "barn", p: [-105, 0.1, 105] },
  { id: "barn-coop-1", kind: "coop", district: "barn", p: [-84, 0.1, 128.5] },
  { id: "barn-silo-1", kind: "silo", district: "barn", p: [-150, 0.1, 146] },
  { id: "parking-car-trunk-1", kind: "car-trunk", district: "parking", p: [-32, 0.1, 76.4] },
  { id: "parking-car-trunk-2", kind: "car-trunk", district: "parking", p: [-32, 0.1, 101.6] },
  { id: "parking-car-trunk-3", kind: "car-trunk", district: "parking", p: [-24, 0.1, 76.4] },
  { id: "parking-car-trunk-4", kind: "car-trunk", district: "parking", p: [-24, 0.1, 101.6] },
  { id: "parking-car-trunk-5", kind: "car-trunk", district: "parking", p: [-16, 0.1, 76.4] },
  { id: "parking-car-trunk-6", kind: "car-trunk", district: "parking", p: [-16, 0.1, 101.6] },
  { id: "parking-car-trunk-7", kind: "car-trunk", district: "parking", p: [-8, 0.1, 76.4] },
  { id: "parking-car-trunk-8", kind: "car-trunk", district: "parking", p: [-8, 0.1, 101.6] },
  { id: "parking-car-trunk-9", kind: "car-trunk", district: "parking", p: [0, 0.1, 76.4] },
  { id: "parking-car-trunk-10", kind: "car-trunk", district: "parking", p: [0, 0.1, 101.6] },
  { id: "parking-bus-1", kind: "bus", district: "parking", p: [-22, 1.1, 123] },
  { id: "parking-truck-back-1", kind: "truck-back", district: "parking", p: [10, 1.1, 138] },
  { id: "parking-truck-back-2", kind: "truck-back", district: "parking", p: [10, 1.1, 150] },
  { id: "parking-clothes-rack-1", kind: "clothes-rack", district: "parking", p: [27, 0.1, 131] },
  { id: "alleys-alley-1", kind: "alley", district: "alleys", p: [97.5, 0.1, 85] },
  { id: "alleys-alley-2", kind: "alley", district: "alleys", p: [80, 0.1, 105.5] },
  { id: "alleys-alley-3", kind: "alley", district: "alleys", p: [125.5, 0.1, 120] },
  { id: "alleys-dumpster-1", kind: "dumpster", district: "alleys", p: [106, 0.1, 116] },
  { id: "alleys-dumpster-2", kind: "dumpster", district: "alleys", p: [116, 0.1, 116] },
  { id: "alleys-dumpster-3", kind: "dumpster", district: "alleys", p: [120, 0.1, 150] },
  { id: "alleys-trash-pile-1", kind: "trash-pile", district: "alleys", p: [104, 0.1, 148] },
  { id: "alleys-trash-pile-2", kind: "trash-pile", district: "alleys", p: [110, 0.1, 152] },
  { id: "alleys-trash-pile-3", kind: "trash-pile", district: "alleys", p: [112, 0.1, 130] },
  { id: "alleys-porta-potty-1", kind: "porta-potty", district: "alleys", p: [102, 0.1, 140.4] },
  { id: "alleys-porta-potty-2", kind: "porta-potty", district: "alleys", p: [108, 0.1, 140.4] },
  { id: "alleys-porta-potty-3", kind: "porta-potty", district: "alleys", p: [114, 0.1, 140.4] },
  { id: "alleys-barrel-1", kind: "barrel", district: "alleys", p: [119, 0.1, 130] },
  { id: "alleys-rooftop-1", kind: "rooftop", district: "alleys", p: [106, 16.1, 76] },
  { id: "alleys-rooftop-2", kind: "rooftop", district: "alleys", p: [117, 16.1, 90] },
];

// The nine districts (§3.3), row-major from the lobby side (z -111 first).
export const DISTRICTS = [
  { id: "apartments", name: "Oinkwood Apartments", center: [-111, 0, -111] },
  { id: "market", name: "Farmers Market", center: [0, 0, -111] },
  { id: "shops", name: "Main Street", center: [111, 0, -111] },
  { id: "park", name: "Pigglewood Park", center: [-111, 0, 0] },
  { id: "square", name: "Fountain Square", center: [0, 0, 0] },
  { id: "yard", name: "Construction Yard", center: [111, 0, 0] },
  { id: "barn", name: "Barnyard", center: [-111, 0, 111] },
  { id: "parking", name: "Parking & Depot", center: [0, 0, 111] },
  { id: "alleys", name: "Back Alleys", center: [111, 0, 111] },
];

// Every hide-spot kind used above (the 24 required ones and the optional extras).
export const HIDE_KINDS = Object.freeze([...new Set(HIDE_SPOTS.map((h) => h.kind))]);

function deepFreeze(v) {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    for (const k of Object.keys(v)) deepFreeze(v[k]);
    Object.freeze(v);
  }
  return v;
}
for (const v of [LOBBY_RETURN, HUNTER_CAGE, HUNTER_RELEASE, PIG_PEN, PIG_DROPS, KIOSKS, HIDE_SPOTS, DISTRICTS]) deepFreeze(v);

// Inset used by clampToCity so a clamped capsule (radius 1) never jams into the
// perimeter wall, which stands just outside BOUNDS.
const CLAMP_INSET = 1.5;

export function inCity(p) {
  if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[2])) return false;
  return p[0] >= BOUNDS.minX && p[0] <= BOUNDS.maxX && p[2] >= BOUNDS.minZ && p[2] <= BOUNDS.maxZ;
}

export function clampToCity(p) {
  const x = Number.isFinite(p && p[0]) ? p[0] : 0;
  const y = Number.isFinite(p && p[1]) ? p[1] : 0.1;
  const z = Number.isFinite(p && p[2]) ? p[2] : 0;
  return [
    Math.min(BOUNDS.maxX - CLAMP_INSET, Math.max(BOUNDS.minX + CLAMP_INSET, x)),
    Math.min(BOUNDS.maxY, Math.max(BOUNDS.minY, y)),
    Math.min(BOUNDS.maxZ - CLAMP_INSET, Math.max(BOUNDS.minZ + CLAMP_INSET, z)),
  ];
}

// Which district a point is in (null outside the city or on a road). Handy for HUD
// copy ("Hiding in Barnyard") and the smoke test.
export function districtAt(p) {
  if (!inCity(p)) return null;
  const span = (v) => (v <= -62 ? 0 : v >= -46 && v <= 46 ? 1 : v >= 62 ? 2 : -1);
  const ix = span(p[0]), iz = span(p[2]);
  if (ix < 0 || iz < 0) return null;
  return DISTRICTS[iz * 3 + ix];
}

// ===================================================================================
// ===== SECTION: lighting cycle (runtime dressing) ==================================
// ===================================================================================

// LIGHTING_DAY is place.json's lighting block, verbatim (§3.1).
export const LIGHTING_DAY = deepFreeze({
  skyTop: "#4f93e0", skyBottom: "#ffe2bf", ambient: "#fff1e6", ambientIntensity: 0.95,
  sunColor: "#fff2dc", sunIntensity: 1.25, sunDirection: [-0.35, -1, -0.25],
  fog: { color: "#f2dcc4", near: 220, far: 420 },
});
const LIGHTING_DUSK = deepFreeze({
  skyTop: "#3d4f9a", skyBottom: "#ff9a6a", ambient: "#ffd2b8", ambientIntensity: 0.82,
  sunColor: "#ffb27a", sunIntensity: 0.95, sunDirection: [-0.85, -0.45, -0.2],
  fog: { color: "#e8a888", near: 200, far: 400 },
});
const LIGHTING_NIGHT = deepFreeze({
  skyTop: "#0f1636", skyBottom: "#33305e", ambient: "#9aa8e0", ambientIntensity: 0.62,
  sunColor: "#a9bcff", sunIntensity: 0.42, sunDirection: [0.3, -1, 0.35],
  fog: { color: "#26294a", near: 180, far: 380 },
});
// One full day in sim seconds (two five-minute rounds), and its keyframes as fractions.
export const DAY_CYCLE_S = 600;
const CYCLE_KEYS = [
  [0.0, LIGHTING_DAY], [0.5, LIGHTING_DAY], [0.62, LIGHTING_DUSK], [0.72, LIGHTING_NIGHT],
  [0.88, LIGHTING_NIGHT], [0.96, LIGHTING_DUSK], [1.0, LIGHTING_DAY],
];
// applyLighting rebuilds the sky texture, so it runs every few seconds and only on a change.
const LIGHT_REFRESH_S = 6;

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(c) {
  return "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
function lerpHex(a, b, t) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t));
}
const lerp = (a, b, t) => a + (b - a) * t;
function lerpLighting(a, b, t) {
  return {
    skyTop: lerpHex(a.skyTop, b.skyTop, t),
    skyBottom: lerpHex(a.skyBottom, b.skyBottom, t),
    ambient: lerpHex(a.ambient, b.ambient, t),
    ambientIntensity: lerp(a.ambientIntensity, b.ambientIntensity, t),
    sunColor: lerpHex(a.sunColor, b.sunColor, t),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    sunDirection: [0, 1, 2].map((i) => lerp(a.sunDirection[i], b.sunDirection[i], t)),
    fog: { color: lerpHex(a.fog.color, b.fog.color, t), near: lerp(a.fog.near, b.fog.near, t), far: lerp(a.fog.far, b.fog.far, t) },
  };
}
// The lighting for a moment in the day cycle (seconds since the Place loaded).
export function lightingAt(seconds) {
  const f = (((seconds % DAY_CYCLE_S) + DAY_CYCLE_S) % DAY_CYCLE_S) / DAY_CYCLE_S;
  for (let i = 1; i < CYCLE_KEYS.length; i++) {
    const [f1, l1] = CYCLE_KEYS[i];
    if (f <= f1) {
      const [f0, l0] = CYCLE_KEYS[i - 1];
      const t = f1 > f0 ? (f - f0) / (f1 - f0) : 0;
      // smoothstep so the sky eases in and out of each keyframe
      return lerpLighting(l0, l1, t * t * (3 - 2 * t));
    }
  }
  return lerpLighting(LIGHTING_DAY, LIGHTING_DAY, 0);
}

// ===================================================================================
// ===== SECTION: createCity (§3.6) ==================================================
// ===================================================================================

const FOUNTAIN = [0, 0, 0];
const GATE_PIG = [0, 17, -160];
const PIGEON_LOOPS = [
  [-30, -113, 3.2, 0.55], [-8, -111, 2.6, -0.7], [8, -116, 3, 0.62],
  [30, -113, 2.8, -0.5], [0, -90, 3.4, 0.45], [-14, -151, 2.4, -0.8],
];
const CLOUDS = [
  { x: -120, y: 78, z: -60, s: 1.2 }, { x: 40, y: 86, z: 70, s: 1.5 }, { x: 160, y: 72, z: -180, s: 1.0 },
];
const CLOUD_PUFFS = [[0, 0, 0, 14], [10, -1, 3, 10], [-10, -1, -2, 11], [4, 4, -3, 9], [-4, 3, 4, 8]];
const CLOUD_SPEED = 2.2;
const CLOUD_WRAP = 280;
const DROPS_TOP = 16;
const DROPS_LOW = 20;

/**
 * Builds the runtime dressing. opts.dayCycle (default true) turns the sky cycle on.
 * Returns { update(dt, S), dispose() }.
 */
export function createCity(ctx, opts = {}) {
  const THREE = ctx.engine.THREE;
  const parts = ctx.engine.parts;
  const renderer = ctx.engine.renderer;
  const dayCycle = opts.dayCycle !== false && renderer && typeof renderer.applyLighting === "function";

  const geos = [];
  const mats = [];
  const G = (g) => (geos.push(g), g);
  const M = (m) => (mats.push(m), m);
  const lambert = (color, extra = {}) => M(new THREE.MeshLambertMaterial({ color, ...extra }));

  const root = new THREE.Group();
  root.name = "ph-city-dressing";
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const tmpP = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  function setInst(mesh, i, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
    tmpE.set(rx, ry, rz);
    tmpQ.setFromEuler(tmpE);
    tmpP.set(x, y, z);
    tmpS.set(sx, sy, sz);
    tmpM.compose(tmpP, tmpQ, tmpS);
    mesh.setMatrixAt(i, tmpM);
  }
  function instanced(geo, mat, n) {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(m);
    return m;
  }

  // ---- fountain: a turning translucent water bell over the bowl, plus droplets ----
  const waterMat = M(new THREE.MeshLambertMaterial({ color: "#9fd8f5", transparent: true, opacity: 0.55, depthWrite: false }));
  const bell = new THREE.Mesh(G(new THREE.CylinderGeometry(0.5, 3.2, 2.6, 18, 1, true)), waterMat);
  bell.position.set(FOUNTAIN[0], 10.4, FOUNTAIN[2]);
  root.add(bell);
  const column = new THREE.Mesh(G(new THREE.CylinderGeometry(0.35, 0.5, 3.4, 10, 1, true)), waterMat);
  column.position.set(FOUNTAIN[0], 12.6, FOUNTAIN[2]);
  root.add(column);
  const dropGeo = G(new THREE.SphereGeometry(0.22, 6, 4));
  const drops = instanced(dropGeo, M(new THREE.MeshBasicMaterial({ color: "#d8f2ff", transparent: true, opacity: 0.85 })), DROPS_TOP + DROPS_LOW);

  // ---- clouds: one instanced batch of puffs ----
  const cloudMat = M(new THREE.MeshLambertMaterial({ color: "#ffffff", emissive: "#3a3f4a", transparent: true, opacity: 0.92, depthWrite: false }));
  const clouds = instanced(G(new THREE.SphereGeometry(0.5, 10, 8)), cloudMat, CLOUDS.length * CLOUD_PUFFS.length);
  const cloudX = CLOUDS.map((c) => c.x);

  // ---- gold pig on the City Gate: three instanced batches (spheres, cylinders, cones) ----
  const gold = lambert("#d4a428", { emissive: "#4a3200" });
  const pigRoot = new THREE.Group();
  pigRoot.position.set(GATE_PIG[0], GATE_PIG[1], GATE_PIG[2]);
  root.add(pigRoot);
  const pigBalls = new THREE.InstancedMesh(G(new THREE.SphereGeometry(0.5, 16, 12)), gold, 2);
  setInst(pigBalls, 0, 0, 2.2, 0, 3.4, 2.6, 2.6); // body
  setInst(pigBalls, 1, 1.9, 2.9, 0, 2, 2, 2); // head
  const pigSticks = new THREE.InstancedMesh(G(new THREE.CylinderGeometry(0.5, 0.5, 1, 10)), gold, 5);
  setInst(pigSticks, 0, 2.9, 2.8, 0, 0.9, 0.5, 0.9, 0, 0, Math.PI / 2); // snout
  [[-0.9, -0.6], [-0.9, 0.6], [0.8, -0.6], [0.8, 0.6]].forEach(([x, z], i) => setInst(pigSticks, i + 1, x, 0.6, z, 0.55, 1.2, 0.55)); // legs
  const pigCones = new THREE.InstancedMesh(G(new THREE.ConeGeometry(0.5, 1, 8)), gold, 2);
  setInst(pigCones, 0, 1.7, 4, -0.55, 0.7, 0.9, 0.5, -0.3, 0, 0.2);
  setInst(pigCones, 1, 1.7, 4, 0.55, 0.7, 0.9, 0.5, 0.3, 0, 0.2);
  for (const m of [pigBalls, pigSticks, pigCones]) { m.frustumCulled = false; pigRoot.add(m); }

  // ---- pigeons: bodies and heads, two instanced batches ----
  const pigeonBodies = instanced(G(new THREE.SphereGeometry(0.5, 8, 6)), lambert("#8d929c"), PIGEON_LOOPS.length);
  const pigeonHeads = instanced(G(new THREE.SphereGeometry(0.5, 8, 6)), lambert("#4f6a78"), PIGEON_LOOPS.length);

  const rootId = parts.addCustom(root);

  let t = 0;
  let lightAt = LIGHT_REFRESH_S; // first refresh after LIGHT_REFRESH_S; boot stays on place.json's day
  let lightKey = "";
  let disposed = false;

  function update(dt) {
    if (disposed || !(dt > 0)) return;
    t += dt;

    bell.rotation.y += dt * 1.6;
    column.scale.set(1, 1 + Math.sin(t * 7) * 0.06, 1);

    // droplets: top ring falls from the spout into the bowl, low ring from the bowl
    // lip into the basin. Each has its own phase so the stream looks continuous.
    for (let i = 0; i < DROPS_TOP + DROPS_LOW; i++) {
      const top = i < DROPS_TOP;
      const n = top ? DROPS_TOP : DROPS_LOW;
      const k = top ? i : i - DROPS_TOP;
      const a = (k / n) * Math.PI * 2 + (top ? 0 : 0.15);
      const ph = (t * (top ? 1.1 : 0.8) + k * 0.37) % 1;
      const r = top ? lerp(0.4, 3.3, ph) : lerp(3.5, 9.6, ph);
      const y = top ? 11.6 - 3.3 * ph * ph + 1.1 * ph * (1 - ph) * 4 : 8 - 7.6 * ph * ph + 0.9 * ph * (1 - ph) * 4;
      setInst(drops, i, FOUNTAIN[0] + Math.cos(a) * r, y, FOUNTAIN[2] + Math.sin(a) * r, 1, 1.4, 1);
    }
    drops.instanceMatrix.needsUpdate = true;

    // clouds drift east and wrap
    let ci = 0;
    CLOUDS.forEach((c, j) => {
      cloudX[j] += dt * CLOUD_SPEED * (0.8 + j * 0.2);
      if (cloudX[j] > CLOUD_WRAP) cloudX[j] = -CLOUD_WRAP;
      for (const [dx, dy, dz, d] of CLOUD_PUFFS) {
        const s = d * c.s;
        setInst(clouds, ci++, cloudX[j] + dx * c.s, c.y + dy * c.s, c.z + dz * c.s, s, s * 0.62, s * 0.8);
      }
    });
    clouds.instanceMatrix.needsUpdate = true;

    // gold pig: turn and bob
    pigRoot.rotation.y = t * 0.6;
    pigRoot.position.y = GATE_PIG[1] + Math.sin(t * 1.4) * 0.25;

    // pigeons waddle around their loops, heads bobbing forward as they step
    PIGEON_LOOPS.forEach(([cx, cz, r, w], i) => {
      const a = t * w + i * 1.7;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const fx = -Math.sin(a) * Math.sign(w), fz = Math.cos(a) * Math.sign(w); // walking direction
      const step = Math.sin(t * 9 + i);
      const hop = Math.abs(step) * 0.12;
      setInst(pigeonBodies, i, x, 0.55 + hop, z, 0.9, 0.7, 1.2, 0, Math.atan2(fx, fz), step * 0.15);
      const nod = 0.5 + step * 0.12;
      setInst(pigeonHeads, i, x + fx * nod, 1.05 + hop, z + fz * nod, 0.5, 0.5, 0.5);
    });
    pigeonBodies.instanceMatrix.needsUpdate = true;
    pigeonHeads.instanceMatrix.needsUpdate = true;

    if (dayCycle) {
      lightAt -= dt;
      if (lightAt <= 0) {
        lightAt = LIGHT_REFRESH_S;
        const cfg = lightingAt(t);
        const key = JSON.stringify(cfg);
        if (key !== lightKey) { lightKey = key; renderer.applyLighting(cfg); }
      }
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    try { parts.remove(rootId); } catch { /* already gone */ }
    for (const m of [drops, clouds, pigBalls, pigSticks, pigCones, pigeonBodies, pigeonHeads]) {
      try { m.dispose(); } catch { /* fine */ }
    }
    for (const g of geos) { try { g.dispose(); } catch { /* fine */ } }
    for (const m of mats) { try { m.dispose(); } catch { /* fine */ } }
    geos.length = 0;
    mats.length = 0;
    if (dayCycle) {
      try { renderer.applyLighting(LIGHTING_DAY); } catch { /* fine */ }
    }
  }

  update(1e-6);
  return { update, dispose };
}
