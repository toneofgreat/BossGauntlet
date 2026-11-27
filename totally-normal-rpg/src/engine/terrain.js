// terrain.js - region heightfields (CONTRACT 5.6 terrain spec), baked to grids so physics, WORLD placement and the
// rendered mesh agree exactly (triangle interpolation with the mesh's diagonal). Splat-shaded MeshStandardMaterial:
// grass / dry grass / dirt road / rock (by slope, triplanar-lite) / sand / forest floor, macro variation, detail
// normals, wet banks. Pure height/surface functions are importable in node (no DOM at module level).

import { fbm, ridged, vnoise, smoothstep, clamp, lerp } from "./noise.js";

export const NONE = -1e9;
const HOLE = -1e8; // anything below this in a grid is a hole

// ---------------------------------------------------------------------------------------------------------------
// region layout
export const REGIONS = {
  main: { x0: -220, z0: -120, x1: 220, z1: 560, cell: 2, water: -0.6 },
  desert: { x0: -400, z0: -2400, x1: 400, z1: -1600, cell: 4, water: NONE },
  forest: { x0: -2300, z0: -250, x1: -1700, z1: 250, cell: 3, water: NONE },
  hollowDesert: { x0: -300, z0: -4450, x1: 300, z1: -3850, cell: 4, water: NONE }
};
const REGION_ORDER = ["main", "desert", "forest", "hollowDesert"];

export function regionAt(x, z) {
  for (let i = 0; i < REGION_ORDER.length; i++) {
    const r = REGIONS[REGION_ORDER[i]];
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return REGION_ORDER[i];
  }
  return "none";
}

// ---------------------------------------------------------------------------------------------------------------
// main valley
const PADS = [
  // circular: { x, z, r, y, f (falloff) }
  { x: 0, z: 0, r: 36, y: 0, f: 12 },          // lobby
  { x: 0, z: 148, r: 18, y: -1.5, f: 10 },     // rat king ring (sunken)
  { x: 0, z: 240, r: 50, y: 0, f: 12 },        // village
  { x: -80, z: 236, r: 18, y: 0, f: 12 },      // barn
  { x: 0, z: 300, r: 22, y: 0, f: 12 },        // guard post
  { x: 30, z: -6, r: 10, y: 0, f: 12 }         // graves
];
const RECTS = [
  { x0: -40, z0: 70, x1: 40, z1: 130, y: 0, f: 12 },   // rat field (half extents 40 x 30)
  { x0: -50, z0: 395, x1: 50, z1: 515, y: 18, f: 34 }  // castle plateau (wide falloff = a natural hill)
];
const ROAD_SEGS = [[0, 10, 0, 175], [0, 175, 0, 332], [0, 332, 0, 400]];
const VILLAGE = { x: 0, z: 240, r: 34 };
export const RIVER = { z: 60, half: 6, bed: -2.5, surface: -0.6 };
export const WATERFALL = { x: -69.5, top: 13.4, cliffX0: -66, cliffX1: -69, z0: 40, z1: 80 };
export const CAVE_POCKET = { x0: -96, x1: -69, z0: 56.5, z1: 63.5 };

function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

export function roadDist(x, z) {
  let d = 1e9;
  for (let i = 0; i < ROAD_SEGS.length; i++) {
    const s = ROAD_SEGS[i];
    d = Math.min(d, segDist(x, z, s[0], s[1], s[2], s[3]));
  }
  d = Math.min(d, Math.abs(Math.hypot(x - VILLAGE.x, z - VILLAGE.z) - VILLAGE.r));
  return d;
}

function rectDist(x, z, r) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

function cliffWeight(x, z) {
  // waterfall plateau west of x=-66 between z 40..80 (soft 10 m edges along z)
  const wx = smoothstep(WATERFALL.cliffX0, WATERFALL.cliffX1, x);
  const wz = smoothstep(WATERFALL.z0 - 10, WATERFALL.z0, z) * smoothstep(WATERFALL.z1 + 10, WATERFALL.z1, z);
  return wx * wz;
}

function voidWeight(x, z) {
  if (z < -50 || z > 40) return 0;
  // edge line wobbles but stays west of the fence gap at (-37, -4)
  let ex = -40 + vnoise(z * 0.09, 3.7, 9) * 2.2;
  if (z > -14 && z < 6) ex = Math.min(ex, -39.2);
  const wx = smoothstep(ex + 1.2, ex - 1.2, x);
  const wz = smoothstep(-46, -40, z) * smoothstep(36, 30, z);
  return wx * wz;
}

function riverProfile(d) {
  // bed -2.5 in the middle, water line (-0.6) at d=6, low bank 0.4 at d=8.5
  return RIVER.bed + 1.9 * smoothstep(2.5, 6.0, d) + 1.0 * smoothstep(6.0, 8.5, d);
}

function mainBase(x, z) {
  let h = fbm(x * 0.0075 + 3.1, z * 0.0075 - 1.7, 4, 1) * 6 + fbm(x * 0.03, z * 0.03, 2, 2) * 0.7;
  // rim mountains enclosing the valley
  const ex = Math.max(0, Math.abs(x) - 150) / 55;
  const ez0 = Math.max(0, -60 - z) / 45;
  const ez1 = Math.max(0, z - 525) / 30;
  const e = Math.max(ex, ez0, ez1);
  if (e > 0) {
    const rim = smoothstep(0, 1, Math.min(1, e)) * (28 + ridged(x * 0.012, z * 0.012, 3, 5) * 26) + Math.max(0, e - 1) * 20;
    h += rim;
  }
  return h;
}

function mainHeight(x, z) {
  if (x >= CAVE_POCKET.x0 && x <= CAVE_POCKET.x1 && z >= CAVE_POCKET.z0 && z <= CAVE_POCKET.z1) return NONE;
  let h = mainBase(x, z);
  // pads
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i];
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r + p.f) {
      const w = 1 - smoothstep(p.r, p.r + p.f, d);
      h = lerp(h, p.y, w);
    }
  }
  for (let i = 0; i < RECTS.length; i++) {
    const r = RECTS[i];
    const d = rectDist(x, z, r);
    if (d < r.f) h = lerp(h, r.y, 1 - smoothstep(0, r.f, d));
  }
  // castle road: rises linearly 0 -> 18 over z 335..400, 8 m wide, embankment falloff 8 m
  if (z > 326 && z < 410 && Math.abs(x) < 14) {
    const ry = 18 * clamp((z - 335) / 65, 0, 1);
    const w = (1 - smoothstep(4, 12, Math.abs(x))) * smoothstep(326, 335, z) * (1 - smoothstep(400, 410, z));
    h = lerp(h, ry, w);
  }
  // waterfall plateau
  const cw = cliffWeight(x, z);
  if (cw > 0) h = lerp(h, 14 + fbm(x * 0.05, z * 0.05, 2, 6) * 1.2, cw);
  // river (carved last), upper river on the plateau
  const dz = Math.abs(z - RIVER.z);
  if (dz < 14 && x > -230) {
    const base = cw * 14 * smoothstep(WATERFALL.z0, WATERFALL.z0 + 1, z) * smoothstep(WATERFALL.z1, WATERFALL.z1 - 1, z);
    let prof = riverProfile(dz) + base;
    // plunge pool under the waterfall
    if (x > -72 && x < -56) prof -= 1.0 * (1 - smoothstep(-66, -56, x)) * (1 - smoothstep(3, 6, dz));
    const w = 1 - smoothstep(8.5, 14, dz);
    if (dz < 8.5) h = prof; else h = lerp(h, prof, w);
  }
  // void cliff
  const vw = voidWeight(x, z);
  if (vw > 0) h = lerp(h, -400, vw);
  return h;
}

// splat for main: [road, sand, forest, dry] in 0..1
function mainSplat(x, z, h, out) {
  const rd = roadDist(x, z);
  let road = 1 - smoothstep(1.5, 2.6, rd + vnoise(x * 0.4, z * 0.4, 11) * 0.5);
  if (Math.abs(z - RIVER.z) < 9 && z > 50 && z < 70) road = 0;
  // castle road
  if (z > 330 && z < 402 && Math.abs(x) < 4.5) road = Math.max(road, 1 - smoothstep(3, 4.4, Math.abs(x)));
  // dirt yards: rat king ring floor, guard post yard, village square edge wear, castle courtyard
  const rk = Math.hypot(x, z - 148);
  if (rk < 17) road = Math.max(road, 0.85);
  if (Math.abs(x) < 15 && Math.abs(z - 300) < 10) road = Math.max(road, 0.7);
  const vs = Math.hypot(x, z - 240);
  if (vs < 20) road = Math.max(road, 0.55 * (1 - smoothstep(14, 20, vs)) + 0.25 * (vnoise(x * 0.2, z * 0.2, 12) * 0.5 + 0.5));
  if (x > -50 && x < 50 && z > 398 && z < 512) road = Math.max(road, 0.6);
  // sand on the river banks (both rivers)
  const dz = Math.abs(z - RIVER.z);
  let sand = 1 - smoothstep(6.5, 9.5, dz + vnoise(x * 0.15, z * 0.15, 13) * 1.5);
  if (h < -1.2 && dz < 14) sand = Math.max(sand, 0.6);
  const dry = clamp(fbm(x * 0.02 + 5, z * 0.02, 2, 14) * 0.9 + 0.35 + Math.max(0, h - 8) * 0.03, 0, 1);
  out[0] = clamp(road, 0, 1); out[1] = clamp(sand, 0, 1); out[2] = 0; out[3] = dry;
}

// ---------------------------------------------------------------------------------------------------------------
// desert / forest / hollow desert
function duneHeight(x, z, seed) {
  // long dunes across a prevailing wind, warped
  const wx = x + fbm(x * 0.004, z * 0.004, 2, seed) * 60;
  const wz = z + fbm(z * 0.004, x * 0.004, 2, seed + 1) * 60;
  const r = ridged(wx * 0.006, wz * 0.011, 3, seed + 2);
  return (r - 0.45) * 7 + fbm(x * 0.02, z * 0.02, 2, seed + 3) * 1.2;
}

function desertHeight(x, z) {
  let h = duneHeight(x, z, 21) * 4 / 3.5;
  const d = Math.hypot(x, z + 1700);
  h = lerp(h, 0, 1 - smoothstep(30, 70, d));
  // the desert exit standing area (cycle 1) and the flower
  const d2 = Math.hypot(x, z + 1850);
  h = lerp(h, 0, 1 - smoothstep(15, 40, d2));
  const d3 = Math.hypot(x - 95, z + 1950);
  h = lerp(h, 0.3, 1 - smoothstep(6, 18, d3));
  // edge rise (hidden by fog; keeps the looping illusion)
  const e = Math.max(Math.abs(x), Math.abs(z + 2000)) - 360;
  if (e > 0) h += e * 0.25;
  return h;
}

function forestHeight(x, z) {
  let h = fbm(x * 0.012, z * 0.012, 3, 31) * 1.5 + fbm(x * 0.05, z * 0.05, 2, 32) * 0.35;
  const az = Math.abs(z);
  h *= smoothstep(2.5, 22, az);
  const dc = Math.hypot(x + 2160, z);
  h = lerp(h, 0, 1 - smoothstep(25, 40, dc));
  const e = Math.max(Math.abs(x + 2000) - 280, az - 230);
  if (e > 0) h += e * 0.4;
  return h;
}

function hollowHeight(x, z) {
  let h = duneHeight(x, z, 41);
  const d = Math.hypot(x, z + 4150);
  h = lerp(h, 0, 1 - smoothstep(70, 95, d));
  const d2 = Math.hypot(x, z + 3990);
  h = lerp(h, 0, 1 - smoothstep(30, 50, d2));
  // the girl's dune: a gentle 1.2 m rise around (0,-4080)
  const dg = Math.hypot(x, z + 4084);
  h += 1.2 * (1 - smoothstep(2, 12, dg));
  const e = Math.max(Math.abs(x), Math.abs(z + 4150)) - 270;
  if (e > 0) h += e * 0.3;
  return h;
}

export function rawHeight(region, x, z) {
  switch (region) {
    case "main": return mainHeight(x, z);
    case "desert": return desertHeight(x, z);
    case "forest": return forestHeight(x, z);
    case "hollowDesert": return hollowHeight(x, z);
    default: return NONE;
  }
}

function rawSplat(region, x, z, h, out) {
  if (region === "main") { mainSplat(x, z, h, out); return; }
  if (region === "forest") {
    const trail = 1 - smoothstep(1.4, 2.6, Math.abs(z) + vnoise(x * 0.3, z * 0.3, 33) * 0.6);
    const onTrail = x < -1745 && x > -2150 ? trail : 0;
    const dc = Math.hypot(x + 2160, z);
    out[0] = Math.max(onTrail, (1 - smoothstep(8, 14, dc)) * 0.6);
    out[1] = 0;
    out[2] = clamp(0.75 + vnoise(x * 0.05, z * 0.05, 34) * 0.3, 0, 1) * (1 - out[0]);
    out[3] = 0.3;
    return;
  }
  // deserts: full sand, a little dry crust variation
  out[0] = 0; out[1] = 1; out[2] = 0; out[3] = clamp(0.5 + vnoise(x * 0.03, z * 0.03, 35) * 0.5, 0, 1);
}

// ---------------------------------------------------------------------------------------------------------------
// baked grids (shared by physics + mesh + vegetation)
const GRIDS = {};

export async function bakeRegion(name, yieldFn) {
  if (GRIDS[name]) return GRIDS[name];
  const R = REGIONS[name];
  const nx = Math.round((R.x1 - R.x0) / R.cell) + 1;
  const nz = Math.round((R.z1 - R.z0) / R.cell) + 1;
  const h = new Float32Array(nx * nz);
  const splat = new Uint8Array(nx * nz * 4);
  const sp = [0, 0, 0, 0];
  for (let j = 0; j < nz; j++) {
    const z = R.z0 + j * R.cell;
    for (let i = 0; i < nx; i++) {
      const x = R.x0 + i * R.cell;
      const y = rawHeight(name, x, z);
      h[j * nx + i] = y;
      rawSplat(name, x, z, y, sp);
      const o = (j * nx + i) * 4;
      splat[o] = sp[0] * 255; splat[o + 1] = sp[1] * 255; splat[o + 2] = sp[2] * 255; splat[o + 3] = sp[3] * 255;
    }
    if (yieldFn && (j & 31) === 31) await yieldFn();
  }
  const G = { name, x0: R.x0, z0: R.z0, x1: R.x1, z1: R.z1, cell: R.cell, nx, nz, h, splat, water: R.water };
  GRIDS[name] = G;
  return G;
}

export function bakeRegionSync(name) {
  // node tests: synchronous bake
  if (GRIDS[name]) return GRIDS[name];
  let G = null;
  const p = bakeRegion(name, null);
  p.then((g) => { G = g; });
  return GRIDS[name] || G;
}

export function grid(name) { return GRIDS[name] || null; }

function gridHeight(G, x, z) {
  const fx = (x - G.x0) / G.cell, fz = (z - G.z0) / G.cell;
  if (fx < 0 || fz < 0 || fx > G.nx - 1 || fz > G.nz - 1) return NONE;
  let ix = Math.floor(fx), iz = Math.floor(fz);
  if (ix >= G.nx - 1) ix = G.nx - 2;
  if (iz >= G.nz - 1) iz = G.nz - 2;
  const u = fx - ix, v = fz - iz;
  const i00 = iz * G.nx + ix;
  const H = G.h;
  const h00 = H[i00], h10 = H[i00 + 1], h01 = H[i00 + G.nx], h11 = H[i00 + G.nx + 1];
  if (h00 < HOLE || h10 < HOLE || h01 < HOLE || h11 < HOLE) return NONE;
  if (u >= v) return h00 + (h10 - h00) * u + (h11 - h10) * v;
  return h00 + (h11 - h01) * u + (h01 - h00) * v;
}

export function heightAt(x, z) {
  const r = regionAt(x, z);
  if (r === "none") return NONE;
  const G = GRIDS[r];
  if (G) return gridHeight(G, x, z);
  return rawHeight(r, x, z);
}

// normal into out {x,y,z}; returns out
export function normalAt(x, z, out) {
  const e = 0.6;
  const hl = heightAt(x - e, z), hr = heightAt(x + e, z), hd = heightAt(x, z - e), hu = heightAt(x, z + e);
  if (hl <= NONE || hr <= NONE || hd <= NONE || hu <= NONE) { out.x = 0; out.y = 1; out.z = 0; return out; }
  let nx = -(hr - hl) / (2 * e), nz = -(hu - hd) / (2 * e), ny = 1;
  const l = Math.hypot(nx, ny, nz);
  out.x = nx / l; out.y = ny / l; out.z = nz / l;
  return out;
}

const _n = { x: 0, y: 1, z: 0 };
const _sp = [0, 0, 0, 0];
export function surfaceAt(x, z) {
  const r = regionAt(x, z);
  if (r === "desert" || r === "hollowDesert") return "sand";
  if (r === "none") return "rock";
  const G = GRIDS[r];
  let road, sand, forest;
  if (G) {
    const i = clamp(Math.round((x - G.x0) / G.cell), 0, G.nx - 1), j = clamp(Math.round((z - G.z0) / G.cell), 0, G.nz - 1);
    const o = (j * G.nx + i) * 4;
    road = G.splat[o] / 255; sand = G.splat[o + 1] / 255; forest = G.splat[o + 2] / 255;
  } else {
    rawSplat(r, x, z, heightAt(x, z), _sp);
    road = _sp[0]; sand = _sp[1]; forest = _sp[2];
  }
  normalAt(x, z, _n);
  if (_n.y < 0.72) return "rock";
  if (road > 0.5) return "dirt";
  if (sand > 0.5) return "sand";
  if (r === "forest") return "forest";
  return "grass";
}

// water surface at (x,z) or NONE (only the main valley river)
export function waterLevelAt(x, z) {
  if (Math.abs(z - RIVER.z) > 7.5 || x < -220 || x > 220) return NONE;
  if (x < WATERFALL.x) return WATERFALL.top;
  return RIVER.surface;
}

// ---------------------------------------------------------------------------------------------------------------
// rendering (browser only)
const TERRAIN_VERT_PARS = /* glsl */`
attribute vec4 splat;
varying vec4 vSplat;
varying vec3 vTWorld;
varying vec3 vTNormal;
`;
const TERRAIN_VERT_MAIN = /* glsl */`
vSplat = splat;
vTWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTNormal = normalize(mat3(modelMatrix) * objectNormal);
`;
const TERRAIN_FRAG_PARS = /* glsl */`
uniform sampler2D tGrass, tDirt, tRock, tSand, tNoise, tNGrass, tNDirt, tNRock;
uniform float uWater;
varying vec4 vSplat;
varying vec3 vTWorld;
varying vec3 vTNormal;
float tRoughOut;
vec3 tNrmOut;
`;
const TERRAIN_FRAG_MAP = /* glsl */`
vec3 wp = vTWorld;
vec3 wn = normalize(vTNormal);
float tdist = length(wp - cameraPosition);
vec4 sp = vSplat;
vec4 mac = texture2D(tNoise, wp.xz * 0.0045);
#ifdef TN_LO
vec4 mac2 = mac.gbar;
vec2 uvG = wp.xz / 3.1;
vec3 grass = texture2D(tGrass, uvG).rgb;
#else
vec4 mac2 = texture2D(tNoise, wp.xz * 0.037 + 0.5);
vec2 uvG = wp.xz / 3.1;
vec3 g1 = texture2D(tGrass, uvG).rgb;
vec3 g2 = texture2D(tGrass, wp.xz / 12.7 + 0.37).rgb;
vec3 grass = mix(g1, g2, clamp(0.3 + tdist * 0.012, 0.3, 0.85));
#endif
grass *= mix(vec3(0.82, 0.94, 0.78), vec3(1.12, 1.06, 0.84), mac.r);
grass = mix(grass, grass * vec3(1.32, 1.12, 0.72), clamp(sp.a * 0.7 + (mac2.g - 0.5) * 0.4, 0.0, 1.0) * 0.75);
vec3 dirt = texture2D(tDirt, wp.xz / 2.7).rgb * mix(0.85, 1.1, mac.g);
vec3 sandC = texture2D(tSand, wp.xz / 3.6).rgb * mix(0.92, 1.06, mac.b);
// river banks in the valley: grey-brown silt and gravel rather than desert sand
if (uWater > -100.0) sandC = mix(sandC * vec3(0.66, 0.62, 0.56), dirt * 0.9, 0.35);
vec3 forestC = mix(dirt * vec3(0.5, 0.46, 0.38), grass * vec3(0.55, 0.6, 0.5), mac2.r * 0.6);
float slope = 1.0 - wn.y;
float wRock = smoothstep(0.24, 0.46, slope + (mac2.b - 0.5) * 0.18);
vec3 rockC = vec3(0.0);
vec3 nRock = vec3(0.0, 0.0, 1.0);
if (wRock > 0.01) {
  vec3 an = abs(wn);
  vec2 uvR = an.x > an.z ? wp.zy / 5.5 : wp.xy / 5.5;
  vec3 rs = texture2D(tRock, uvR).rgb;
#ifdef TN_LO
  rockC = rs * mix(0.85, 1.12, mac.r);
#else
  vec3 rt = texture2D(tRock, wp.xz / 5.5).rgb;
  rockC = mix(rs, rt, smoothstep(0.55, 0.85, an.y)) * mix(0.85, 1.12, mac.r);
  nRock = texture2D(tNRock, uvR).xyz * 2.0 - 1.0;
#endif
}
#ifdef TN_LO
float dnz = fract(mac.a * 7.0 + mac2.r);
#else
float dnz = texture2D(tNoise, wp.xz * 0.21).a;
#endif
float road = smoothstep(0.25, 0.65, sp.r + (dnz - 0.5) * 0.45);
vec3 col = grass;
col = mix(col, forestC, sp.b);
col = mix(col, sandC, smoothstep(0.2, 0.8, sp.g + (dnz - 0.5) * 0.3));
col = mix(col, dirt, road);
col = mix(col, rockC, wRock);
float wet = 1.0 - smoothstep(uWater - 0.05, uWater + 0.45, wp.y);
wet *= 1.0 - smoothstep(8.5, 10.5, abs(wp.z - 60.0));   // only the river banks are wet
col *= 1.0 - wet * 0.38;
// far distance: slightly desaturate toward a mean colour (aerial perspective helper)
diffuseColor.rgb = col;
float roughG = 0.94, roughD = 0.92, roughS = 0.97, roughR = 0.86;
float rgh = mix(roughG, roughD, road);
rgh = mix(rgh, roughS, sp.g);
rgh = mix(rgh, roughR, wRock);
tRoughOut = mix(rgh, 0.35, wet);
// detail normals (planar xz frame), weighted
#ifdef TN_LO
tNrmOut = wn;
#else
vec3 nG = texture2D(tNGrass, uvG).xyz * 2.0 - 1.0;
vec3 nD = texture2D(tNDirt, wp.xz / 2.7).xyz * 2.0 - 1.0;
vec2 dn = mix(nG.xy * 0.8, nD.xy * 1.1, max(road, sp.g * 0.6));
float dfade = 1.0 - smoothstep(30.0, 90.0, tdist);
vec3 nw = wn + vec3(dn.x, 0.0, -dn.y) * 0.55 * dfade * (1.0 - wRock);
if (wRock > 0.01) {
  vec3 an = abs(wn);
  vec3 side = an.x > an.z ? vec3(0.0, -nRock.y, nRock.x) : vec3(nRock.x, -nRock.y, 0.0);
  nw += side * 0.6 * wRock * (0.4 + 0.6 * dfade);
}
tNrmOut = normalize(nw);
#endif
`;

export function createTerrain(THREE, engine) {
  const group = new THREE.Group();
  group.name = "terrain";
  engine.scene.add(group);
  const meshes = {};
  let material = null;
  let shaderRef = null;

  function makeMaterial() {
    const M = engine.materials;
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    const uniforms = {
      tGrass: { value: M.texture("grass") }, tDirt: { value: M.texture("dirt") },
      tRock: { value: M.texture("rock") }, tSand: { value: M.texture("sand") },
      tNoise: { value: engine.noiseTexture },
      tNGrass: { value: M.normalMap("grass") }, tNDirt: { value: M.normalMap("dirt") }, tNRock: { value: M.normalMap("rock") },
      uWater: { value: RIVER.surface }
    };
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\n" + TERRAIN_VERT_PARS)
        .replace("#include <project_vertex>", "#include <project_vertex>\n" + TERRAIN_VERT_MAIN);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\n" + TERRAIN_FRAG_PARS)
        .replace("#include <map_fragment>", TERRAIN_FRAG_MAP)
        .replace("#include <roughnessmap_fragment>", "float roughnessFactor = tRoughOut;")
        .replace("#include <normal_fragment_maps>", "normal = normalize( ( viewMatrix * vec4( tNrmOut, 0.0 ) ).xyz );");
      shaderRef = shader;
    };
    const lo = () => !!(engine.quality && engine.quality.level <= 1);
    const applyLo = () => { const want = lo(); if (!!(m.defines && m.defines.TN_LO !== undefined) !== want) { m.defines = want ? { TN_LO: "" } : {}; m.needsUpdate = true; } };
    applyLo();
    try { engine.quality.onChange(applyLo); } catch (e) { /* */ }
    m.customProgramCacheKey = () => "tnrpg-terrain-v1" + (lo() ? "-lo" : "");
    m.userData.uniforms = uniforms;
    return m;
  }

  async function buildRegionMesh(name) {
    const G = await bakeRegion(name, engine.yieldFrame);
    const { nx, nz, h, splat, cell, x0, z0 } = G;
    const n = nx * nz;
    const pos = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        let y = h[k];
        pos[k * 3] = x0 + i * cell; pos[k * 3 + 2] = z0 + j * cell;
        pos[k * 3 + 1] = y < HOLE ? -50 : y;
        const hl = h[j * nx + Math.max(0, i - 1)], hr = h[j * nx + Math.min(nx - 1, i + 1)];
        const hd = h[Math.max(0, j - 1) * nx + i], hu = h[Math.min(nz - 1, j + 1) * nx + i];
        let ddx = (hr < HOLE || hl < HOLE) ? 0 : (hr - hl) / (2 * cell);
        let ddz = (hu < HOLE || hd < HOLE) ? 0 : (hu - hd) / (2 * cell);
        const l = Math.hypot(ddx, 1, ddz);
        nrm[k * 3] = -ddx / l; nrm[k * 3 + 1] = 1 / l; nrm[k * 3 + 2] = -ddz / l;
      }
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        if (h[a] < HOLE || h[b] < HOLE || h[c] < HOLE || h[d] < HOLE) continue;
        idx.push(a, d, b, a, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute("splat", new THREE.BufferAttribute(splat, 4, true));
    geo.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = "terrain:" + name;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.userData.region = name;
    group.add(mesh);
    meshes[name] = mesh;
    await engine.yieldFrame();
    return mesh;
  }

  const api = {
    group, meshes, NONE,
    heightAt, regionAt, surfaceAt, normalAt, waterLevelAt,
    grid,
    regions: REGIONS,
    async build() {
      material = makeMaterial();
      for (const r of REGION_ORDER) await buildRegionMesh(r);
    },
    showRegion(region) {
      for (const k in meshes) meshes[k].visible = (k === region);
      if (material && material.userData.uniforms) {
        material.userData.uniforms.uWater.value = region === "main" ? RIVER.surface : -1000;
      }
    },
    get material() { return material; }
  };
  return api;
}
