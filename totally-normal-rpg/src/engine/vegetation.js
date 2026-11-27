// vegetation.js - instanced vegetation (CONTRACT 5.6):
//  * GPU grass + flowers: a fixed lattice of instanced clumps wrapped around the camera (nearest replica), heights and
//    density read in the vertex shader from per-region textures (no CPU work per frame). Wind sway, player push,
//    distance fade, density scaled by quality.
//  * CPU-scattered trees (oak, birch, pine), bushes, rocks, cacti, dry shrubs as InstancedMeshes with 3 LODs:
//    full mesh (< lodNear, shadow casting), simplified (< lodMid), camera-facing impostor (< lodFar, rendered at
//    init from the real tree). LOD buckets are rebuilt 4x per second without allocation.
// exclude()/excludeRect() must be called before scatter() (WORLD footprints).

import { fbm, vnoise, hash2i, rng, smoothstep, clamp } from "./noise.js";
import { REGIONS, roadDist, NONE, RIVER } from "./terrain.js";

const TAU = Math.PI * 2;

// --------------------------------------------------------------------------------------------------------------
// small geometry builder
function GB() {
  const b = { p: [], n: [], uv: [], i: [], c: [] };
  b.vert = (x, y, z, nx, ny, nz, u, v) => { b.p.push(x, y, z); b.n.push(nx, ny, nz); b.uv.push(u, v); return b.p.length / 3 - 1; };
  b.tri = (a, c, d) => { b.i.push(a, c, d); };
  return b;
}
function toGeo(THREE, b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(b.p, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(b.n, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
  g.setIndex(b.i);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
// tapered tube from p0 to p1 (arrays), radii r0..r1
function tube(b, p0, p1, r0, r1, seg, rings, uvU, uvV, wob = 0, seed = 1) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
  const L = Math.hypot(dx, dy, dz) || 1e-4;
  const ax = dx / L, ay = dy / L, az = dz / L;
  // perpendicular frame
  let ux = 0, uy = 0, uz = 1;
  if (Math.abs(az) > 0.9) { ux = 1; uz = 0; }
  // u = normalize(cross(a, tmp)); v = cross(a, u)
  let cx = ay * uz - az * uy, cy = az * ux - ax * uz, cz = ax * uy - ay * ux;
  let cl = Math.hypot(cx, cy, cz); cx /= cl; cy /= cl; cz /= cl;
  const vx = ay * cz - az * cy, vy = az * cx - ax * cz, vz = ax * cy - ay * cx;
  const start = b.p.length / 3;
  const R = rng(seed);
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const rad = r0 + (r1 - r0) * t;
    const wx = (R() - 0.5) * wob * (r > 0 && r < rings ? 1 : 0), wz = (R() - 0.5) * wob * (r > 0 && r < rings ? 1 : 0);
    const ox = p0[0] + dx * t + wx, oy = p0[1] + dy * t, oz = p0[2] + dz * t + wz;
    for (let s = 0; s <= seg; s++) {
      const a = s / seg * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = cx * ca + vx * sa, ny = cy * ca + vy * sa, nz = cz * ca + vz * sa;
      b.vert(ox + nx * rad, oy + ny * rad, oz + nz * rad, nx, ny, nz, s / seg * uvU, t * uvV * L);
    }
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) {
    const a = start + r * (seg + 1) + s, c = a + seg + 1;
    b.tri(a, c, a + 1); b.tri(a + 1, c, c + 1);
  }
}
// a leaf card centred at c with half size w,h, rotated by yaw/pitch/roll; normals blended toward (pos - nc)
function card(b, c, w, h, yaw, pitch, roll, nc, nBlend, uv) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  // basis: right r, up u (card plane), normal f
  function rot(x, y, z) {
    // roll (z), pitch (x), yaw (y)
    let x1 = x * cr - y * sr, y1 = x * sr + y * cr, z1 = z;
    let y2 = y1 * cp - z1 * sp, z2 = y1 * sp + z1 * cp, x2 = x1;
    return [x2 * cy + z2 * sy, y2, -x2 * sy + z2 * cy];
  }
  const f = rot(0, 0, 1);
  const corners = [[-w, -h, 0, uv[0], uv[1]], [w, -h, 0, uv[2], uv[1]], [w, h, 0, uv[2], uv[3]], [-w, h, 0, uv[0], uv[3]]];
  const idx = [];
  for (const k of corners) {
    const q = rot(k[0], k[1], k[2]);
    const px = c[0] + q[0], py = c[1] + q[1], pz = c[2] + q[2];
    let nx = px - nc[0], ny = py - nc[1], nz = pz - nc[2];
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    nx = nx * nBlend + f[0] * (1 - nBlend); ny = ny * nBlend + f[1] * (1 - nBlend) + 0.15; nz = nz * nBlend + f[2] * (1 - nBlend);
    const l2 = Math.hypot(nx, ny, nz) || 1;
    idx.push(b.vert(px, py, pz, nx / l2, ny / l2, nz / l2, k[3], k[4]));
  }
  b.tri(idx[0], idx[1], idx[2]); b.tri(idx[0], idx[2], idx[3]);
}

// --------------------------------------------------------------------------------------------------------------
// tree / plant generators -> { wood:GB|null, leaf:GB|null }
function genOak(lod, seed) {
  const R = rng(seed), wood = GB(), leaf = GB();
  const top = [0.25, 3.3, 0.1];
  tube(wood, [0, -0.3, 0], top, lod === 0 ? 0.42 : 0.36, 0.24, lod === 0 ? 9 : 6, lod === 0 ? 4 : 2, 2, 0.35, 0.05, seed);
  const clusters = [];
  const nb = lod === 0 ? 5 : 3;
  for (let k = 0; k < nb; k++) {
    const a = k / nb * TAU + R() * 0.8;
    const out = 2.0 + R() * 1.3, up = 5.0 + R() * 2.0;
    const end = [Math.cos(a) * out, up, Math.sin(a) * out];
    const st = [top[0] * 0.8, 2.6 + R() * 0.8, top[2] * 0.8];
    if (lod === 0) tube(wood, st, end, 0.17, 0.06, 6, 3, 1, 0.35, 0.12, seed + k * 7);
    clusters.push(end);
  }
  clusters.push([0.2, 7.6, 0.1]);
  clusters.push([0.4, 5.2, -0.3]);
  const cc = [0.2, 6.0, 0.0];
  const per = lod === 0 ? 12 : 4;
  const sz = lod === 0 ? 1.05 : 1.9;
  for (const c of clusters) {
    for (let k = 0; k < per; k++) {
      const th = R() * TAU, ph = Math.acos(2 * R() - 1), rr = (lod === 0 ? 1.5 : 1.2) * Math.cbrt(R());
      const p = [c[0] + Math.sin(ph) * Math.cos(th) * rr, c[1] + Math.cos(ph) * rr * 0.75, c[2] + Math.sin(ph) * Math.sin(th) * rr];
      card(leaf, p, sz, sz, R() * TAU, (R() - 0.5) * 1.6, R() * TAU, cc, 0.8, [0, 0, 1, 1]);
    }
  }
  return { wood, leaf };
}
function genBirch(lod, seed) {
  const R = rng(seed), wood = GB(), leaf = GB();
  const lean = (R() - 0.5) * 0.6;
  tube(wood, [0, -0.2, 0], [lean, 8.5, lean * 0.5], 0.2, 0.06, lod === 0 ? 8 : 5, lod === 0 ? 5 : 2, 1, 0.5, 0.06, seed);
  if (lod === 0) for (let k = 0; k < 4; k++) {
    const a = R() * TAU, y = 4 + k * 1.1;
    tube(wood, [lean * y / 8.5, y, 0], [Math.cos(a) * 1.4, y + 1.6, Math.sin(a) * 1.4], 0.06, 0.02, 4, 1, 1, 0.5, 0, seed + k);
  }
  const cc = [lean * 0.6, 7.0, 0];
  const n = lod === 0 ? 46 : 12, sz = lod === 0 ? 0.85 : 1.6;
  for (let k = 0; k < n; k++) {
    const y = 4.2 + R() * 5.2, rad = (1.0 + 1.0 * Math.sin((y - 4) / 5.5 * Math.PI)) * Math.sqrt(R());
    const a = R() * TAU;
    card(leaf, [lean * y / 8.5 + Math.cos(a) * rad, y, Math.sin(a) * rad], sz, sz * 1.1, R() * TAU, (R() - 0.5) * 1.2, R() * TAU, cc, 0.75, [0, 0, 1, 1]);
  }
  return { wood, leaf };
}
function genPine(lod, seed) {
  const R = rng(seed), wood = GB(), leaf = GB();
  const H = 12;
  tube(wood, [0, -0.3, 0], [0, H, 0], 0.32, 0.04, lod === 0 ? 8 : 5, lod === 0 ? 4 : 2, 2, 0.4, 0.03, seed);
  const tiers = lod === 0 ? 9 : 5;
  const cc = [0, 6.5, 0];
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const y = 2.4 + f * (H - 2.6);
    const rad = 3.3 * (1 - f) + 0.5;
    const n = lod === 0 ? 7 : 5;
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU + t * 0.9 + R() * 0.4;
      const ca = Math.cos(a), sa = Math.sin(a);
      const len = rad * (0.85 + R() * 0.3);
      // card from trunk outward, drooping
      const mid = [ca * len * 0.5, y - len * 0.22, sa * len * 0.5];
      // yaw so the card's local +y axis points outward: use pitch ~ -1.2 (mostly horizontal)
      card(leaf, mid, len * 0.32, len * 0.55, -a + Math.PI / 2, -1.25 + R() * 0.2, 0, cc, 0.55, [0, 0, 1, 1]);
    }
  }
  card(leaf, [0, H - 0.2, 0], 0.5, 1.0, 0, 0, 0, cc, 0.3, [0, 0, 1, 1]);
  card(leaf, [0, H - 0.2, 0], 0.5, 1.0, Math.PI / 2, 0, 0, cc, 0.3, [0, 0, 1, 1]);
  return { wood, leaf };
}
function genBush(seed, dry) {
  const R = rng(seed), leaf = GB();
  const cc = [0, 0.4, 0];
  for (let k = 0; k < (dry ? 9 : 14); k++) {
    const th = R() * TAU, rr = 0.6 * Math.sqrt(R());
    card(leaf, [Math.cos(th) * rr, 0.45 + R() * 0.5, Math.sin(th) * rr], 0.6, 0.55, R() * TAU, (R() - 0.5) * 1.0, R() * TAU, cc, 0.8, [0, 0, 1, 1]);
  }
  return { wood: null, leaf };
}
function genCactus(seed) {
  const R = rng(seed), wood = GB();
  const H = 4.5 + R() * 1.5;
  tube(wood, [0, -0.2, 0], [0, H, 0], 0.36, 0.3, 12, 4, 1, 0.25, 0, seed);
  // dome top
  const top = [0, H, 0];
  for (let k = 0; k < 2; k++) {
    const side = k === 0 ? 1 : -1, y0 = 1.8 + R() * 1.2;
    const out = 0.9 + R() * 0.3;
    tube(wood, [side * 0.25, y0, 0], [side * out, y0 + 0.25, 0], 0.22, 0.22, 10, 2, 1, 0.25, 0, seed + k);
    tube(wood, [side * out, y0 + 0.1, 0], [side * out, y0 + 1.5 + R() * 1.0, 0], 0.22, 0.19, 10, 3, 1, 0.25, 0, seed + k + 5);
  }
  tube(wood, top, [0, H + 0.25, 0], 0.3, 0.12, 12, 1, 1, 0.25, 0, seed + 9);
  return { wood, leaf: null };
}

// --------------------------------------------------------------------------------------------------------------
// leaf / needle textures (RGBA with alpha)
function leafCanvas(kind) {
  const S = 256;
  const c = document.createElement("canvas"); c.width = S; c.height = S;
  const g = c.getContext("2d");
  g.clearRect(0, 0, S, S);
  const R = rng(kind === "pine" ? 7 : kind === "birch" ? 11 : kind === "dry" ? 13 : 5);
  if (kind === "pine") {
    // a branch spray: central twig + needles
    g.lineCap = "round";
    for (let s = 0; s < 3; s++) {
      const x0 = S * (0.35 + s * 0.15), y0 = S * 0.98;
      g.strokeStyle = "rgb(70,52,36)"; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(S * 0.5 + (s - 1) * 20, S * 0.05); g.stroke();
      for (let k = 0; k < 140; k++) {
        const t = R();
        const bx = x0 + (S * 0.5 + (s - 1) * 20 - x0) * t, by = y0 + (S * 0.05 - y0) * t;
        const side = R() < 0.5 ? -1 : 1, len = (1 - t * 0.6) * (24 + R() * 20);
        const ang = -Math.PI / 2 + side * (0.9 + R() * 0.5);
        const sh = 0.6 + R() * 0.6;
        g.strokeStyle = `rgb(${(28 * sh) | 0},${(62 * sh) | 0},${(30 * sh) | 0})`; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(ang) * len, by + Math.sin(ang) * len); g.stroke();
      }
    }
  } else {
    const base = kind === "birch" ? [92, 132, 46] : kind === "dry" ? [128, 100, 58] : [58, 92, 34];
    for (let k = 0; k < 260; k++) {
      // clumped inside a soft disc
      const a = R() * TAU, r = Math.sqrt(R()) * S * 0.44;
      const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
      const len = (kind === "birch" ? 9 : 12) + R() * 8, w = len * (kind === "dry" ? 0.35 : 0.55);
      const sh = 0.55 + R() * 0.75 - (r / (S * 0.44)) * 0.2;
      g.save(); g.translate(x, y); g.rotate(R() * TAU);
      g.fillStyle = `rgb(${Math.min(255, base[0] * sh) | 0},${Math.min(255, base[1] * sh) | 0},${Math.min(255, base[2] * sh) | 0})`;
      g.beginPath(); g.ellipse(0, 0, w, len, 0, 0, TAU); g.fill();
      g.strokeStyle = `rgba(30,40,15,0.35)`; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -len); g.lineTo(0, len); g.stroke();
      g.restore();
    }
    if (kind !== "dry") {
      g.strokeStyle = "rgba(60,45,30,0.9)"; g.lineWidth = 2.5;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + (R() - 0.5) * S * 0.7, S / 2 + (R() - 0.5) * S * 0.7); g.stroke(); }
    }
  }
  return c;
}

// --------------------------------------------------------------------------------------------------------------
// GPU grass + flowers shader injection
const GRASS_PARS = /* glsl */`
attribute vec3 iOff;
uniform vec3 uCam;
uniform float uPeriod, uTime, uWind, uDensity, uFadeR, uInner, uBladeH, uKind;
uniform vec3 uPlayer;
uniform sampler2D tHgt, tDens;
uniform vec4 uHgtA, uDensA;
varying vec3 vGCol;
varying float vGTip;
float g_hash(float n) { return fract(sin(n) * 43758.5453123); }
`;
const GRASS_BEGIN = /* glsl */`
vec2 lat = iOff.xy;
vec2 wxz = lat + uPeriod * floor((uCam.xz - lat) / uPeriod + 0.5);
float rnd = iOff.z;
vec2 hcoord = (wxz - uHgtA.xy) / uHgtA.z;
vec2 hsize = vec2(textureSize(tHgt, 0));
vec2 uvh = (hcoord + 0.5) / hsize;
vec2 dsize = vec2(textureSize(tDens, 0));
vec2 uvd = ((wxz - uDensA.xy) / uDensA.z + 0.5) / dsize;
float inside = step(0.0, uvd.x) * step(uvd.x, 1.0) * step(0.0, uvd.y) * step(uvd.y, 1.0);
vec4 dens = texture2D(tDens, uvd);
float gh = texture2D(tHgt, uvh).r;
float dist = length(wxz - uCam.xz);
float chan = uKind > 0.5 ? dens.g : dens.r;
float keep = inside * step(rnd, chan * uDensity) * (1.0 - smoothstep(uFadeR * 0.7, uFadeR, dist)) * smoothstep(uInner * 0.85, uInner, dist);
float r2 = g_hash(rnd * 91.7 + 3.1);
float r3 = g_hash(rnd * 47.3 + 9.7);
float sc = keep * (0.8 + r2 * 0.38);
float ang = r3 * 6.2831853;
float ca = cos(ang), sa = sin(ang);
vec3 p = position;
float hy = p.y;
p.y *= uBladeH * (0.7 + dens.a * 0.6);
p.xz = vec2(p.x * ca - p.z * sa, p.x * sa + p.z * ca);
p *= sc;
// wind: two travelling waves + gusts
float wph = uTime * 1.6 + wxz.x * 0.19 + wxz.y * 0.13;
float gust = 0.55 + 0.45 * sin(uTime * 0.37 + wxz.x * 0.021 + wxz.y * 0.017);
float bend = (sin(wph) * 0.55 + sin(wph * 2.3 + rnd * 6.0) * 0.18) * uWind * gust;
vec2 wdir = vec2(0.8, 0.6);
float h2 = hy * hy;
p.xz += wdir * bend * h2 * 0.35 * sc;
// player push
vec2 dp = wxz - uPlayer.xz;
float pd = length(dp) + 1e-3;
float push = (1.0 - smoothstep(0.2, 1.1, pd)) * step(abs(uPlayer.y - gh), 1.2);
p.xz += dp / pd * push * h2 * 0.45 * sc;
p.y -= push * h2 * 0.25 * sc;
vec3 transformed = vec3(wxz.x + p.x, gh + p.y, wxz.y + p.z);
float dry = dens.b;
vec3 lush0 = vec3(0.035, 0.07, 0.016), lush1 = vec3(0.075, 0.15, 0.03);
vec3 dry0 = vec3(0.09, 0.08, 0.04), dry1 = vec3(0.26, 0.22, 0.10);
vec3 c1 = mix(lush1, dry1, dry);
vec3 c0 = mix(c1 * 0.5, mix(lush0, dry0, dry), 0.35);
c1 *= 0.82 + r2 * 0.36;
c1.r *= 0.9 + r3 * 0.25;
vGCol = mix(c0, c1, hy);
vGTip = hy;
if (uKind > 0.5) {
  float pick = g_hash(rnd * 13.1);
  vec3 fc = pick < 0.25 ? vec3(0.9, 0.88, 0.8) : pick < 0.5 ? vec3(0.95, 0.75, 0.12) : pick < 0.7 ? vec3(0.5, 0.25, 0.75) : pick < 0.85 ? vec3(0.85, 0.15, 0.1) : vec3(0.3, 0.4, 0.9);
  vGCol = hy > 0.8 ? fc * 0.8 : vec3(0.08, 0.16, 0.04);
}
`;
const GRASS_NORMAL = /* glsl */`
vec3 objectNormal = vec3(0.0, 1.0, 0.0);
#ifdef USE_TANGENT
vec3 objectTangent = vec3(1.0, 0.0, 0.0);
#endif
`;
const GRASS_FRAG_PARS = /* glsl */`
varying vec3 vGCol;
varying float vGTip;
uniform vec3 uSunDirV;
uniform vec3 uSunColV;
`;

// wind for trees (InstancedMesh: instanceMatrix available)
const TREE_BEGIN = /* glsl */`
#include <begin_vertex>
#ifdef USE_INSTANCING
vec3 tiP = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
vec3 tiP = vec3(0.0);
#endif
float thw = max(position.y - 1.2, 0.0) * uSwayK;
float tph = uTime * 1.1 + tiP.x * 0.13 + tiP.z * 0.17;
float tgust = 0.6 + 0.4 * sin(uTime * 0.31 + tiP.x * 0.02);
transformed.x += (sin(tph) * 0.10 + sin(tph * 2.7 + position.y) * 0.03) * thw * uWind * tgust;
transformed.z += (cos(tph * 0.83) * 0.07) * thw * uWind * tgust;
#ifdef TN_LEAF
transformed += objectNormal * sin(uTime * 5.0 + position.x * 3.0 + position.z * 2.0 + tiP.x) * 0.04 * uWind * min(thw * 3.0, 1.0);
#endif
`;

const IMP_PARS = /* glsl */`
attribute vec4 iT;
uniform float uImpW, uImpH;
`;
const IMP_BEGIN = /* glsl */`
vec3 ibP = iT.xyz;
float ibS = iT.w;
vec3 ibTo = cameraPosition - ibP; ibTo.y = 0.0;
ibTo = normalize(ibTo + vec3(1e-4, 0.0, 0.0));
vec3 ibR = vec3(ibTo.z, 0.0, -ibTo.x);
vec3 transformed = ibP + ibR * position.x * uImpW * ibS + vec3(0.0, position.y * uImpH * ibS, 0.0);
`;
const IMP_NORMAL = /* glsl */`
vec3 ibTo2 = cameraPosition - iT.xyz; ibTo2.y = 0.0; ibTo2 = normalize(ibTo2 + vec3(1e-4, 0.0, 0.0));
vec3 objectNormal = normalize(ibTo2 * 0.6 + vec3(0.0, 0.8, 0.0));
`;

// --------------------------------------------------------------------------------------------------------------
export function createVegetation(THREE, engine) {
  const scene = engine.scene;
  const root = new THREE.Group(); root.name = "vegetation"; scene.add(root);
  const exclusions = [];   // { c:true,x,z,r } | { c:false,x0,z0,x1,z1 }
  const shared = { uTime: { value: 0 }, uWind: { value: 1 } };
  let scattered = false;
  let region = "main";
  const regionVisible = { main: true, desert: true, forest: true, hollowDesert: true };
  let quality = engine.quality.params;

  function exclude(x, z, r) { exclusions.push({ c: true, x, z, r }); }
  function excludeRect(x0, z0, x1, z1) {
    exclusions.push({ c: false, x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
  }
  function excluded(x, z, pad) {
    for (let i = 0; i < exclusions.length; i++) {
      const e = exclusions[i];
      if (e.c) { const dx = x - e.x, dz = z - e.z, rr = e.r + pad; if (dx * dx + dz * dz < rr * rr) return true; }
      else if (x > e.x0 - pad && x < e.x1 + pad && z > e.z0 - pad && z < e.z1 + pad) return true;
    }
    return false;
  }

  // ---- materials ----------------------------------------------------------------------------------------------
  function treeMaterial(base, leaf) {
    const m = base;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = shared.uTime; sh.uniforms.uWind = shared.uWind; sh.uniforms.uSwayK = { value: leaf ? 0.12 : 0.1 };
      sh.vertexShader = (leaf ? "#define TN_LEAF\n" : "") + sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime, uWind, uSwayK;")
        .replace("#include <begin_vertex>", TREE_BEGIN);
    };
    m.customProgramCacheKey = () => "tn-tree-" + (leaf ? "l" : "w");
    return m;
  }

  const leafTex = {};
  function leafTexture(kind) {
    if (leafTex[kind]) return leafTex[kind];
    const t = new THREE.CanvasTexture(leafCanvas(kind));
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    leafTex[kind] = t;
    return t;
  }

  // ---- species ------------------------------------------------------------------------------------------------
  const species = {};  // name -> { lods:[{wood,leaf}], imp, inst:{region:[...]}, ... }
  const sp = (name, def) => { species[name] = Object.assign({ name, items: [], lods: [], imp: null, castShadow: true }, def); return species[name]; };

  function buildSpecies() {
    const M = engine.materials;
    const bark = treeMaterial(M.get("bark").clone(), false);
    const birchBark = treeMaterial(M.get("birchBark").clone(), false);
    const cactus = treeMaterial(M.get("cactus").clone(), false);
    const mkLeaf = (kind, color) => treeMaterial(new THREE.MeshStandardMaterial({
      map: leafTexture(kind), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.82, metalness: 0, color: color || 0xffffff
    }), true);
    const leafOak = mkLeaf("oak"), leafBirch = mkLeaf("birch"), leafPine = mkLeaf("pine"), leafDry = mkLeaf("dry"), leafBush = mkLeaf("oak", 0xc8d8b0);
    const defs = [
      ["oak", (l) => genOak(l, 17), bark, leafOak, true],
      ["birch", (l) => genBirch(l, 23), birchBark, leafBirch, true],
      ["pine", (l) => genPine(l, 31), bark, leafPine, true],
      ["bush", () => genBush(41, false), null, leafBush, false],
      ["shrub", () => genBush(43, true), null, leafDry, false],
      ["cactus", () => genCactus(51), cactus, null, false]
    ];
    for (const [name, gen, wm, lm, hasLods] of defs) {
      const s = sp(name, { hasLods });
      const nl = hasLods ? 2 : 1;
      for (let l = 0; l < nl; l++) {
        const g = gen(l);
        s.lods.push({ wood: g.wood && g.wood.p.length ? toGeo(THREE, g.wood) : null, leaf: g.leaf && g.leaf.p.length ? toGeo(THREE, g.leaf) : null, wm, lm });
      }
    }
    // rocks: displaced icosahedron
    const rg = new THREE.IcosahedronGeometry(1, 2);
    const pa = rg.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const n = 1 + vnoise(x * 1.7 + 4, z * 1.7 + y * 1.3, 61) * 0.22 + vnoise(x * 4 + 1, z * 4 - y * 3, 62) * 0.07;
      pa.setXYZ(i, x * n, y * n * (y < 0 ? 0.5 : 0.8), z * n);
    }
    rg.computeVertexNormals();
    const rs = sp("rock", { hasLods: false });
    rs.lods.push({ wood: rg, leaf: null, wm: M.get("rock"), lm: null });
  }

  // instanced meshes per species per LOD
  function makeInstanced(s) {
    const max = Math.max(1, s.items.length);
    s.meshes = [];
    for (let l = 0; l < s.lods.length; l++) {
      const L = s.lods[l];
      const parts = [];
      for (const [geo, mat] of [[L.wood, L.wm], [L.leaf, L.lm]]) {
        if (!geo || !mat) continue;
        const im = new THREE.InstancedMesh(geo, mat, max);
        im.count = 0; im.frustumCulled = false;
        im.castShadow = l === 0 && s.castShadow; im.receiveShadow = true;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        root.add(im);
        parts.push(im);
      }
      s.meshes.push(parts);
    }
  }

  // impostor for tree species, rendered from the full-detail mesh
  function makeImpostor(s) {
    const L = s.lods[0];
    const bb = new THREE.Box3();
    if (L.wood) bb.union(L.wood.boundingBox);
    if (L.leaf) bb.union(L.leaf.boundingBox);
    const w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 1.04, h = bb.max.y * 1.03;
    const rt = new THREE.WebGLRenderTarget(256, 512, { type: THREE.UnsignedByteType });
    rt.texture.generateMipmaps = true; rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
    const sc = new THREE.Scene();
    sc.add(new THREE.AmbientLight(0xffffff, Math.PI * 0.75));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(0.3, 1, 1); sc.add(dl);
    if (L.wood) sc.add(new THREE.Mesh(L.wood, L.wm));
    if (L.leaf) sc.add(new THREE.Mesh(L.leaf, L.lm));
    const cx = (bb.max.x + bb.min.x) / 2;
    const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h, 0, 0.1, 100);
    cam.position.set(cx, 0, 50); cam.lookAt(cx, 0, 0);
    const r = engine.renderer;
    const prevT = r.getRenderTarget();
    const prevC = new THREE.Color(); r.getClearColor(prevC); const prevA = r.getClearAlpha();
    const prevShadow = r.shadowMap.enabled;
    r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear();
    shared.uWind.value = 0;
    r.render(sc, cam);
    shared.uWind.value = 1;
    r.setRenderTarget(prevT); r.setClearColor(prevC, prevA);
    r.shadowMap.enabled = prevShadow;
    const geo = new THREE.InstancedBufferGeometry();
    const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    geo.index = plane.index; geo.attributes.position = plane.attributes.position; geo.attributes.uv = plane.attributes.uv;
    geo.attributes.normal = plane.attributes.normal;
    const max = Math.max(1, s.items.length);
    const iT = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    iT.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iT", iT);
    geo.instanceCount = 0;
    const mat = new THREE.MeshStandardMaterial({ map: rt.texture, alphaTest: 0.5, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uImpW = { value: w }; sh.uniforms.uImpH = { value: h };
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\n" + IMP_PARS)
        .replace("#include <beginnormal_vertex>", IMP_NORMAL)
        .replace("#include <begin_vertex>", IMP_BEGIN);
      sh.fragmentShader = sh.fragmentShader.replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal = normalize(vNormal);");
    };
    mat.customProgramCacheKey = () => "tn-imp-" + s.name;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
    root.add(mesh);
    s.imp = { mesh, geo, iT, rt };
  }

  // ---- scatter ------------------------------------------------------------------------------------------------
  function add(sname, x, y, z, scale, yaw, reg, sx, sy, sz) {
    if (!(y > -1e6) || !isFinite(x) || !isFinite(z)) return; // off-terrain neighbour sample (NONE height)
    const s = species[sname];
    s.items.push({ x, y, z, s: scale, yaw, reg, m: null, sx: sx || 1, sy: sy || 1, sz: sz || 1 });
  }
  function mainTreeOk(x, z, h) {
    if (h < -1 || h > 70) return false;
    if (roadDist(x, z) < 7) return false;
    if (Math.abs(z - RIVER.z) < 11) return false;
    if (Math.hypot(x, z) < 38) return false;
    if (x > -44 && x < 44 && z > 66 && z < 134) return false;
    if (Math.hypot(x, z - 148) < 26) return false;
    if (Math.hypot(x, z - 240) < 58) return false;
    if (Math.hypot(x + 80, z - 236) < 24) return false;
    if (Math.hypot(x, z - 300) < 30) return false;
    if (x > -62 && x < 62 && z > 385 && z < 525) return false;
    if (Math.abs(x) < 12 && z > 320 && z < 400) return false;
    if (Math.hypot(x - 30, z + 6) < 14) return false;
    if (x < -34 && z > -50 && z < 40) return false; // void edge
    if (excluded(x, z, 2.5)) return false;
    return true;
  }
  const _nrm = { x: 0, y: 1, z: 0 };
  function scatterMain() {
    const T = engine.terrain;
    const R = rng(1234);
    const cell = 8;
    for (let z = -120; z < 560; z += cell) for (let x = -220; x < 220; x += cell) {
      const px = x + R() * cell, pz = z + R() * cell;
      const h = T.heightAt(px, pz);
      if (h <= NONE + 1) continue;
      T.normalAt(px, pz, _nrm);
      if (_nrm.y < 0.8) continue;
      if (!mainTreeOk(px, pz, h)) continue;
      const forest = smoothstep(0.05, 0.45, fbm(px * 0.011 + 7, pz * 0.011, 3, 71)) + smoothstep(8, 30, h) * 0.7;
      if (R() > forest * 0.85 + 0.04) continue;
      const r = R();
      const kind = h > 16 ? (r < 0.75 ? "pine" : "birch") : (r < 0.62 ? "oak" : r < 0.9 ? "birch" : "pine");
      add(kind, px, h - 0.1, pz, 0.75 + R() * 0.5, R() * TAU, "main");
    }
    // bushes
    for (let z = -120; z < 560; z += 7) for (let x = -220; x < 220; x += 7) {
      const px = x + R() * 7, pz = z + R() * 7;
      const h = T.heightAt(px, pz);
      if (h <= NONE + 1) continue;
      T.normalAt(px, pz, _nrm);
      if (_nrm.y < 0.82) continue;
      if (roadDist(px, pz) < 4 || Math.abs(pz - RIVER.z) < 8.5 || excluded(px, pz, 1.2)) continue;
      if (Math.hypot(px, pz) < 30 || Math.hypot(px, pz - 240) < 50 || (px > -55 && px < 55 && pz > 388 && pz < 520)) continue;
      if (Math.hypot(px, pz - 148) < 20 || Math.hypot(px, pz - 300) < 25 || (px < -34 && pz > -50 && pz < 40)) continue;
      const d = smoothstep(0.0, 0.5, fbm(px * 0.02 + 3, pz * 0.02, 2, 72));
      if (R() > d * 0.5) continue;
      add("bush", px, h - 0.05, pz, 0.7 + R() * 0.9, R() * TAU, "main");
    }
    // rocks: riverbanks, rims, cliffs, scattered
    for (let z = -120; z < 560; z += 10) for (let x = -220; x < 220; x += 10) {
      const px = x + R() * 10, pz = z + R() * 10;
      const h = T.heightAt(px, pz);
      if (h <= NONE + 1 || h < -50) continue;
      T.normalAt(px, pz, _nrm);
      const nearRiver = Math.abs(Math.abs(pz - RIVER.z) - 7) < 2;
      const steep = _nrm.y < 0.85;
      let p = 0.04 + (nearRiver ? 0.5 : 0) + (steep ? 0.35 : 0) + smoothstep(10, 40, h) * 0.3;
      if (roadDist(px, pz) < 3.5 || excluded(px, pz, 1.5) || Math.hypot(px, pz) < 32 || Math.hypot(px, pz - 240) < 52) continue;
      if (px > -55 && px < 55 && pz > 388 && pz < 520) continue;
      if (Math.abs(px) < 8 && pz > 48 && pz < 72) continue; // bridge
      if (R() > p) continue;
      const s = 0.4 + Math.pow(R(), 2) * (steep ? 2.4 : 1.4);
      add("rock", px, h - s * 0.25, pz, s, R() * TAU, "main", 0.8 + R() * 0.6, 0.6 + R() * 0.5, 0.8 + R() * 0.6);
    }
  }
  function scatterForest() {
    const T = engine.terrain, R = rng(4321);
    const cell = 6;
    for (let z = -140; z < 140; z += cell) for (let x = -2300; x < -1700; x += cell) {
      const px = x + R() * cell, pz = z + R() * cell;
      if (Math.abs(pz) < 5.5 && px < -1740) continue;
      if (Math.hypot(px + 2160, pz) < 25) continue;
      if (excluded(px, pz, 2)) continue;
      if (R() > 0.85) continue;
      const h = T.heightAt(px, pz);
      if (h <= NONE + 1) continue;
      const r = R();
      add(r < 0.9 ? "pine" : "birch", px, h - 0.1, pz, 0.85 + R() * 0.55, R() * TAU, "forest");
    }
    for (let z = -60; z < 60; z += 5) for (let x = -2300; x < -1700; x += 5) {
      const px = x + R() * 5, pz = z + R() * 5;
      if (Math.abs(pz) < 3.2 || Math.hypot(px + 2160, pz) < 16 || excluded(px, pz, 1)) continue;
      if (R() > 0.3) continue;
      add("bush", px, T.heightAt(px, pz) - 0.05, pz, 0.6 + R() * 0.6, R() * TAU, "forest");
      if (R() < 0.25) add("rock", px + 1.5, T.heightAt(px + 1.5, pz) - 0.2, pz, 0.4 + R() * 0.8, R() * TAU, "forest", 1, 0.7, 1.1);
    }
  }
  function scatterDesert(name, x0, z0, x1, z1, ccell, keepOut) {
    const T = engine.terrain, R = rng(name === "desert" ? 999 : 777);
    for (let z = z0; z < z1; z += ccell) for (let x = x0; x < x1; x += ccell) {
      const px = x + R() * ccell, pz = z + R() * ccell;
      if (keepOut(px, pz) || excluded(px, pz, 3)) continue;
      if (R() > 0.55) continue;
      const h = T.heightAt(px, pz);
      if (h <= NONE + 1) continue;
      add("cactus", px, h - 0.15, pz, 0.7 + R() * 0.6, R() * TAU, name);
    }
    for (let z = z0; z < z1; z += 12) for (let x = x0; x < x1; x += 12) {
      const px = x + R() * 12, pz = z + R() * 12;
      if (keepOut(px, pz) || excluded(px, pz, 1)) continue;
      if (R() > 0.3) continue;
      const h = T.heightAt(px, pz);
      if (h <= NONE + 1) continue;
      add("shrub", px, h - 0.05, pz, 0.5 + R() * 0.7, R() * TAU, name);
      if (R() < 0.15) add("rock", px + 2, T.heightAt(px + 2, pz) - 0.3, pz, 0.5 + R() * 1.2, R() * TAU, name, 1.2, 0.6, 1);
    }
  }

  // ---- density textures for GPU grass ------------------------------------------------------------------------
  const regionTex = {};
  function buildRegionTextures(name) {
    const T = engine.terrain;
    const G = T.grid(name);
    if (!G) return null;
    // height texture (R16F) at grid resolution
    const hd = new Uint16Array(G.nx * G.nz);
    for (let i = 0; i < hd.length; i++) {
      const v = G.h[i];
      hd[i] = THREE.DataUtils.toHalfFloat(v < -1e8 ? -500 : Math.max(-60000, Math.min(60000, v)));
    }
    const ht = new THREE.DataTexture(hd, G.nx, G.nz, THREE.RedFormat, THREE.HalfFloatType);
    ht.minFilter = ht.magFilter = THREE.LinearFilter; ht.generateMipmaps = false; ht.needsUpdate = true;
    // density texture (RGBA8): grass, flowers, dry, height variety
    const dc = name === "main" ? 1 : 2;
    const R = REGIONS[name];
    const nx = Math.round((R.x1 - R.x0) / dc) + 1, nz = Math.round((R.z1 - R.z0) / dc) + 1;
    const d = new Uint8Array(nx * nz * 4);
    for (let j = 0; j < nz; j++) {
      const z = R.z0 + j * dc;
      for (let i = 0; i < nx; i++) {
        const x = R.x0 + i * dc;
        const o = (j * nx + i) * 4;
        // splat from nearest grid vertex
        const gi = clamp(Math.round((x - G.x0) / G.cell), 0, G.nx - 1), gj = clamp(Math.round((z - G.z0) / G.cell), 0, G.nz - 1);
        const go = (gj * G.nx + gi) * 4;
        const road = G.splat[go] / 255, sand = G.splat[go + 1] / 255, forest = G.splat[go + 2] / 255, dry = G.splat[go + 3] / 255;
        const h = G.h[gj * G.nx + gi];
        let grass = 0, flow = 0, dr = dry, va = 0.5 + vnoise(x * 0.08, z * 0.08, 81) * 0.5;
        if (h > -1e8) {
          // slope from neighbours
          const hl = G.h[gj * G.nx + Math.max(0, gi - 1)], hr = G.h[gj * G.nx + Math.min(G.nx - 1, gi + 1)];
          const hu = G.h[Math.min(G.nz - 1, gj + 1) * G.nx + gi], hdn = G.h[Math.max(0, gj - 1) * G.nx + gi];
          const sl = Math.hypot(hr - hl, hu - hdn) / (2 * G.cell);
          const flat = 1 - smoothstep(0.55, 0.9, sl);
          const patch = 0.55 + 0.45 * smoothstep(-0.3, 0.4, fbm(x * 0.05, z * 0.05, 2, 82));
          if (name === "main") {
            grass = flat * (1 - road) * (1 - sand * 0.85) * patch;
            dr = dry * 0.5;
            if (G.water > -1e8 && h < G.water + 0.15) grass = 0;
            // pad cores
            // paved / planked / packed floors: no grass at all, only a sparse weed fringe at the outer 2 m
            const rk = Math.hypot(x, z - 148);
            if (rk < 18) grass *= 0.15 * smoothstep(16, 18, rk);
            const vs = Math.hypot(x, z - 240);
            if (vs < 21) grass *= 0.35 * smoothstep(18, 21, vs);
            if (Math.abs(x) < 16 && Math.abs(z - 300) < 11) grass *= 0.2 * Math.max(smoothstep(13.5, 16, Math.abs(x)), smoothstep(8.5, 11, Math.abs(z - 300)));
            if (x > -50 && x < 50 && z > 396 && z < 512) grass *= 0.15 * Math.max(smoothstep(46, 50, Math.abs(x)), 1 - smoothstep(394, 398, z), smoothstep(508, 512, z));
            const meadow = smoothstep(0.1, 0.55, fbm(x * 0.03 + 9, z * 0.03, 2, 83));
            flow = grass * meadow * 0.55;
            if (x > -40 && x < 40 && z > 72 && z < 128) flow *= 1.4;
            if (Math.hypot(x, z) < 34) flow *= 1.3;
          } else if (name === "forest") {
            grass = flat * (1 - road) * 0.3 * patch; flow = 0; dr = 0.35;
          } else {
            grass = flat * 0.07 * patch; flow = 0; dr = 1;
          }
        }
        d[o] = clamp(grass, 0, 1) * 255; d[o + 1] = clamp(flow, 0, 1) * 255; d[o + 2] = clamp(dr, 0, 1) * 255; d[o + 3] = va * 255;
      }
    }
    // WORLD exclusions rasterised
    for (const e of exclusions) {
      const ex0 = e.c ? e.x - e.r : e.x0, ex1 = e.c ? e.x + e.r : e.x1, ez0 = e.c ? e.z - e.r : e.z0, ez1 = e.c ? e.z + e.r : e.z1;
      const i0 = Math.max(0, Math.floor((ex0 - R.x0) / dc)), i1 = Math.min(nx - 1, Math.ceil((ex1 - R.x0) / dc));
      const j0 = Math.max(0, Math.floor((ez0 - R.z0) / dc)), j1 = Math.min(nz - 1, Math.ceil((ez1 - R.z0) / dc));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = R.x0 + i * dc, z = R.z0 + j * dc;
        if (e.c && Math.hypot(x - e.x, z - e.z) > e.r) continue;
        const o = (j * nx + i) * 4; d[o] = 0; d[o + 1] = 0;
      }
    }
    const dt = new THREE.DataTexture(d, nx, nz, THREE.RGBAFormat, THREE.UnsignedByteType);
    dt.minFilter = dt.magFilter = THREE.LinearFilter; dt.generateMipmaps = false; dt.needsUpdate = true;
    regionTex[name] = { ht, dt, hA: new THREE.Vector4(G.x0, G.z0, G.cell, G.nx), dA: new THREE.Vector4(R.x0, R.z0, dc, nx) };
    return regionTex[name];
  }

  // ---- GPU grass meshes ---------------------------------------------------------------------------------------
  const fields = [];  // { mesh, uniforms, base:{period, fade, inner}, kind }
  function bladeClump(n, spread, kind) {
    const b = GB();
    const R = rng(kind === 1 ? 5 : 3);
    for (let k = 0; k < n; k++) {
      const ox = (R() - 0.5) * spread, oz = (R() - 0.5) * spread, a = R() * TAU, lean = 0.15 + R() * 0.3;
      const ca = Math.cos(a), sa = Math.sin(a);
      const pt = (x, y, z) => [ox + x * ca - z * sa, y, oz + x * sa + z * ca];
      if (kind === 0) {
        const w0 = 0.02, w1 = 0.012;
        const v = [pt(-w0, 0, 0), pt(w0, 0, 0), pt(-w1, 0.55, lean * 0.3), pt(w1, 0.55, lean * 0.3), pt(0, 1, lean)];
        const ids = v.map((q, i) => b.vert(q[0], q[1], q[2], 0, 1, 0, i % 2, q[1]));
        b.tri(ids[0], ids[1], ids[3]); b.tri(ids[0], ids[3], ids[2]); b.tri(ids[2], ids[3], ids[4]);
      } else {
        // flower: stem + two crossed petal quads at the top
        const v = [pt(-0.012, 0, 0), pt(0.012, 0, 0), pt(-0.012, 0.82, 0), pt(0.012, 0.82, 0)];
        const ids = v.map((q) => b.vert(q[0], q[1], q[2], 0, 1, 0, 0, q[1]));
        b.tri(ids[0], ids[1], ids[3]); b.tri(ids[0], ids[3], ids[2]);
        for (let c = 0; c < 2; c++) {
          const aa = c * Math.PI / 2, s = 0.07;
          const cx = Math.cos(aa) * s, cz = Math.sin(aa) * s;
          const q = [pt(-cx, 0.86, -cz), pt(cx, 0.86, cz), pt(cx, 1.0, cz), pt(-cx, 1.0, -cz)];
          const id2 = q.map((p) => b.vert(p[0], p[1], p[2], 0, 1, 0, 0, p[1] > 0.95 ? 1 : 0.9));
          b.tri(id2[0], id2[1], id2[2]); b.tri(id2[0], id2[2], id2[3]);
        }
        // a flat disc-ish cap
        const top = [pt(-0.06, 0.93, -0.06), pt(0.06, 0.93, -0.06), pt(0.06, 0.93, 0.06), pt(-0.06, 0.93, 0.06)];
        const id3 = top.map((p) => b.vert(p[0], p[1], p[2], 0, 1, 0, 0, 0.93));
        b.tri(id3[0], id3[2], id3[1]); b.tri(id3[0], id3[3], id3[2]);
      }
    }
    return b;
  }
  function makeField(kind, R, spacing, inner, bladeH, clumpN) {
    const n = Math.round((2 * R) / spacing);
    const count = n * n;
    const g = toGeo(THREE, bladeClump(clumpN, spacing * 0.9, kind));
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = g.index; geo.attributes.position = g.attributes.position; geo.attributes.normal = g.attributes.normal; geo.attributes.uv = g.attributes.uv;
    const off = new Float32Array(count * 3);
    // shuffled so truncating instanceCount thins uniformly
    const order = new Uint32Array(count);
    for (let i = 0; i < count; i++) order[i] = i;
    const Rr = rng(kind * 7 + 99 + n);
    for (let i = count - 1; i > 0; i--) { const j = Math.floor(Rr() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    for (let k = 0; k < count; k++) {
      const i = order[k];
      const gx = i % n, gz = (i / n) | 0;
      off[k * 3] = (gx + Rr()) * spacing;
      off[k * 3 + 1] = (gz + Rr()) * spacing;
      off[k * 3 + 2] = Rr();
    }
    geo.setAttribute("iOff", new THREE.InstancedBufferAttribute(off, 3));
    geo.instanceCount = count;
    const uniforms = {
      uCam: { value: new THREE.Vector3() }, uPeriod: { value: n * spacing }, uTime: shared.uTime, uWind: shared.uWind,
      uDensity: { value: 1 }, uFadeR: { value: R * 0.95 }, uInner: { value: inner }, uBladeH: { value: bladeH }, uKind: { value: kind },
      uPlayer: { value: new THREE.Vector3(0, -1000, 0) }, tHgt: { value: null }, tDens: { value: null },
      uHgtA: { value: new THREE.Vector4() }, uDensA: { value: new THREE.Vector4() }
    };
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\n" + GRASS_PARS)
        .replace("#include <beginnormal_vertex>", GRASS_NORMAL)
        .replace("#include <begin_vertex>", GRASS_BEGIN);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\n" + GRASS_FRAG_PARS)
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = vGCol;")
        // blades are lit with the ground's (up) normal on both faces: no black back faces
        .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal = normalize(vNormal);");
    };
    mat.customProgramCacheKey = () => "tn-grass-" + kind;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
    mesh.renderOrder = -1;
    root.add(mesh);
    const f = { mesh, uniforms, count, kind };
    fields.push(f);
    return f;
  }

  function bindRegion(name) {
    const rt = regionTex[name];
    for (const f of fields) {
      if (!rt) { f.mesh.visible = false; continue; }
      f.mesh.visible = regionVisible[name] !== false && (f.kind === 0 || name === "main");
      f.uniforms.tHgt.value = rt.ht; f.uniforms.tDens.value = rt.dt;
      f.uniforms.uHgtA.value.copy(rt.hA); f.uniforms.uDensA.value.copy(rt.dA);
      f.uniforms.uBladeH.value = f.kind === 1 ? 0.38 : (name === "main" ? 0.34 : name === "forest" ? 0.3 : 0.28);
    }
  }

  function applyQuality(p) {
    quality = p;
    for (const f of fields) {
      const frac = f.kind === 0 ? p.grass : p.flowers;
      f.mesh.geometry.instanceCount = Math.max(1, Math.floor(f.count * frac));
      f.uniforms.uDensity.value = 1;
    }
    lodTimer = 0;
  }

  // ---- LOD update ---------------------------------------------------------------------------------------------
  let lodTimer = 0;
  const camPos = new THREE.Vector3();
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
  function precompute() {
    for (const k in species) {
      for (const it of species[k].items) {
        _e.set(0, it.yaw, 0); _q.setFromEuler(_e);
        _p.set(it.x, it.y, it.z); _s.set(it.s * it.sx, it.s * it.sy, it.s * it.sz);
        _m.compose(_p, _q, _s);
        it.m = new Float32Array(16); _m.toArray(it.m);
      }
    }
  }
  function updateLod() {
    camPos.copy(engine.camera.position);
    const P = quality;
    const fogK = region === "forest" ? 0.6 : region === "desert" || region === "hollowDesert" ? 0.75 : 1;
    const dN = P.lodNear * fogK, dM = P.lodMid * fogK, dF = P.lodFar * fogK;
    for (const k in species) {
      const s = species[k];
      if (!s.meshes) continue;
      const cnt = [0, 0];
      let ic = 0;
      const smallCut = (k === "bush" || k === "shrub") ? dN * 1.6 : (k === "rock" ? dM * 1.3 : (k === "cactus" ? dM : 0));
      const arr0 = s.meshes[0], arr1 = s.meshes[1];
      const items = s.items;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.reg !== region || regionVisible[it.reg] === false) continue;
        const dx = it.x - camPos.x, dz = it.z - camPos.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (!s.hasLods) {
          if (d > smallCut) continue;
          const j = cnt[0]++;
          for (let p = 0; p < arr0.length; p++) arr0[p].instanceMatrix.array.set(it.m, j * 16);
          continue;
        }
        if (d < dN) {
          const j = cnt[0]++;
          for (let p = 0; p < arr0.length; p++) arr0[p].instanceMatrix.array.set(it.m, j * 16);
        } else if (d < dM) {
          const j = cnt[1]++;
          for (let p = 0; p < arr1.length; p++) arr1[p].instanceMatrix.array.set(it.m, j * 16);
        } else if (d < dF && s.imp) {
          const a = s.imp.iT.array, o = ic * 4;
          a[o] = it.x; a[o + 1] = it.y; a[o + 2] = it.z; a[o + 3] = it.s;
          ic++;
        }
      }
      for (let l = 0; l < s.meshes.length; l++) {
        for (const im of s.meshes[l]) { im.count = cnt[l]; im.instanceMatrix.needsUpdate = true; im.instanceMatrix.clearUpdateRanges(); im.instanceMatrix.addUpdateRange(0, Math.max(1, cnt[l]) * 16); }
      }
      if (s.imp) { s.imp.geo.instanceCount = ic; s.imp.iT.needsUpdate = true; s.imp.iT.clearUpdateRanges(); s.imp.iT.addUpdateRange(0, Math.max(1, ic) * 4); }
    }
  }

  // ---- API ----------------------------------------------------------------------------------------------------
  const api = {
    root, exclude, excludeRect, shared,
    get scattered() { return scattered; },
    scatter() {
      if (scattered) return;
      scattered = true;
      try {
        buildSpecies();
        scatterMain();
        scatterForest();
        scatterDesert("desert", -380, -2380, 380, -1620, 22, (x, z) => Math.hypot(x, z + 1700) < 25 || Math.hypot(x - 95, z + 1950) < 8 || Math.hypot(x, z + 1850) < 15);
        scatterDesert("hollowDesert", -280, -4430, 280, -3870, 28, (x, z) => Math.hypot(x, z + 4150) < 75 || Math.hypot(x, z + 3990) < 35 || Math.hypot(x, z + 4084) < 10);
        precompute();
        for (const k in species) makeInstanced(species[k]);
        for (const k of ["oak", "birch", "pine", "cactus"]) { try { makeImpostor(species[k]); } catch (e) { console.warn("[vegetation] impostor", k, e); } }
        for (const r of ["main", "desert", "forest", "hollowDesert"]) buildRegionTextures(r);
        makeField(0, 16, 0.3, 0, 0.34, 7);
        makeField(0, 48, 0.85, 14.5, 0.36, 8);
        makeField(1, 30, 1.1, 0, 0.42, 1);
        applyQuality(engine.quality.params);
        bindRegion(region);
        updateLod();
      } catch (e) {
        console.warn("[vegetation] scatter failed", e);
        try { const g = window.__tnrpg; if (g && g.errors) g.errors.push("vegetation: " + e.message); } catch (e2) { /* ignore */ }
      }
    },
    setRegionVisible(r, on) {
      regionVisible[r] = !!on;
      if (r === region) bindRegion(region);
      lodTimer = 0;
    },
    showRegion(r) {
      region = r;
      root.visible = r !== "none";
      if (scattered) { bindRegion(r); updateLod(); }
    },
    applyQuality,
    update(dt, t) {
      shared.uTime.value = t;
      if (!scattered) return;
      const cam = engine.camera.position;
      const pl = engine.player ? engine.player.position : null;
      for (const f of fields) {
        f.uniforms.uCam.value.copy(cam);
        if (pl) f.uniforms.uPlayer.value.copy(pl); else f.uniforms.uPlayer.value.set(0, -1000, 0);
      }
      lodTimer -= dt;
      if (lodTimer <= 0) { lodTimer = 0.25; updateLod(); }
    },
    stats() {
      const o = {};
      for (const k in species) o[k] = species[k].items.length;
      return o;
    }
  };
  engine.quality.onChange(() => applyQuality(engine.quality.params));
  return api;
}
