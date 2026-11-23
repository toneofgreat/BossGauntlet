// zoo.js - the zoo habitat: the home of levels 2, 3 and 5 (and the last minute of level 4). LEVELS.md B3.
//
// A naturalistic enclosure: layered rock terraces and boulders (lofted, strata-stepped, mossy), a clear pool
// fed by a stream from a horseshoe waterfall, fish, reeds / ferns / grass swaying in the wind, logs, a sandy
// bank, a burrow, a thick glass viewing wall with the visitor hall behind it, the keeper door, signs, lamps,
// posters, backdrop gum trees and a sky dome with five times of day.
//
// How it is put together (everything static is merged; nothing here allocates per frame):
//   ground  = one heightfield (sand / grass splat, damp shoreline, caustics + depth tint under water)
//   rocks   = every walkable rock is a "mesa": an analytic footprint + top height. The SAME description
//             drives heightAt() and the lofted mesh, so what you see is what you stand on.
//   water   = one transparent mesh for pool + stream + plunge pool + the sheet on the fall's ledge;
//             the bed's "refraction" is a wobble of the bed's own texture coordinates under the surface.
//   lights  = none. Lamps, hall lights and the alarm beacon are shader terms on this world's own
//             materials plus additive sprites, all driven by setTime().
//
// Draw calls: sky 1, terrain 1, rocks 2 (+1 shadow), logs 1 (+1 shadow), water 1, waterfall 1, fish 1,
// reeds 1, ferns 1, grass 1, leaf litter + lily pads 1, pebbles 1, trees 1, architecture 1, glass 1, door 1,
// poster 1, riddle 1, signs 1, toys 2, glows 1  = 23 (+2 in the shadow pass). About 75k triangles.

const PI = Math.PI, TAU = PI * 2;
const HALL_Y = 0.12; // floor of the visitor hall and the service path
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapPi = (a) => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- value noise (build time only). px / py: integer periods, 0 = not periodic ----
const perm = new Uint8Array(512), nval = new Float32Array(256);
{
  const r = rng(90210);
  for (let i = 0; i < 256; i++) { perm[i] = i; nval[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
}
const pmod = (i, p) => ((i % p) + p) % p;
function vnoise(x, y, px, py) {
  let xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  let x1 = xi + 1, y1 = yi + 1;
  if (px) { xi = pmod(xi, px); x1 = pmod(x1, px); }
  if (py) { yi = pmod(yi, py); y1 = pmod(y1, py); }
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = nval[perm[perm[xi & 255] + (yi & 255)]], b = nval[perm[perm[x1 & 255] + (yi & 255)]];
  const c = nval[perm[perm[xi & 255] + (y1 & 255)]], d = nval[perm[perm[x1 & 255] + (y1 & 255)]];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct, px, py) {
  let s = 0, amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) {
    s += amp * vnoise(x + o * 17.3, y + o * 9.1, px, py);
    tot += amp; amp *= 0.5; x *= 2; y *= 2; px *= 2; py *= 2;
  }
  return s / tot;
}

// ------------------------------------------------------------------------------------------------
// The lie of the land (pure functions; the mesh builders and heightAt() both use them)
// ------------------------------------------------------------------------------------------------
const POOL = { x: -5.5, z: 2, rx: 4.5, rz: 3.5, n: 2.5 };
// normalised pool radius: < 1 in the pool, 1 on the shoreline
function poolRho(x, z) {
  const u = (x - POOL.x) / POOL.rx, v = (z - POOL.z) / POOL.rz;
  const a = Math.atan2(v, u);
  const wob = 1 + 0.06 * Math.sin(a * 3 + 0.6) + 0.045 * Math.sin(a * 5 - 1.2) + 0.025 * Math.sin(a * 9 + 2);
  return Math.pow(Math.pow(Math.abs(u), POOL.n) + Math.pow(Math.abs(v), POOL.n), 1 / POOL.n) / wob;
}

// the waterfall: a rounded rock spur (top y = 2.2) whose tip the water spills over in a horseshoe
const FALL = { x: -9.45, z: -7.75, r: 1.0, top: 2.2, b0: 290, b1: 400 }; // bearings in degrees, clockwise from +z
const bearing = (deg) => { const a = (deg * PI) / 180; return [Math.sin(a), Math.cos(a)]; };
// channels: the plunge crescent under the fall, and the stream down to the pool. [x, z, half width, depth]
const CHANNELS = [];
{
  const cres = [];
  const bs = [290, 320, 350, 20, 45], ds = [0.3, 0.44, 0.5, 0.44, 0.3];
  for (let i = 0; i < bs.length; i++) { const b = bearing(bs[i]); cres.push([FALL.x + b[0] * 1.45, FALL.z + b[1] * 1.45, 0.55, ds[i]]); }
  CHANNELS.push(cres);
  const b5 = bearing(5);
  CHANNELS.push([
    [FALL.x + b5[0] * 1.55, FALL.z + b5[1] * 1.55, 0.6, 0.5],
    [-8.8, -5.3, 0.5, 0.2], [-8.1, -4.25, 0.5, 0.18], [-7.5, -3.2, 0.5, 0.18], [-7.25, -2.2, 0.55, 0.18],
    [-7.0, -1.1, 0.7, 0.24], [-6.8, 0.0, 0.9, 0.4],
  ]);
}
const STREAM = CHANNELS[1];
const chanOut = { depth: 0, bank: 1, fx: 0, fz: 0, e: 9 };
// depth of the nearest channel at a point, how "bank" it is (0 at the waterline .. 1 dry), flow direction
function channel(x, z) {
  let depth = 0, bank = 1, best = 9, fx = 0, fz = 0;
  for (let c = 0; c < CHANNELS.length; c++) {
    const pts = CHANNELS[c];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const ex = b[0] - a[0], ez = b[1] - a[1];
      const t = clamp(((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez), 0, 1);
      const dx = x - (a[0] + ex * t), dz = z - (a[1] + ez * t);
      const e = Math.sqrt(dx * dx + dz * dz) - lerp(a[2], b[2], t);
      if (e < 0) { const d = lerp(a[3], b[3], t) * (1 - sstep(-0.3, 0, e)); if (d > depth) depth = d; }
      const bk = sstep(0, 0.6, e);
      if (bk < bank) bank = bk;
      if (e < best) {
        best = e;
        const l = Math.sqrt(ex * ex + ez * ez) || 1;
        const sp = c === 0 ? 0.25 : 1;
        // the crescent drains toward its middle (where the stream leaves), the stream runs downhill
        const dir = c === 0 ? (i < 2 ? 1 : -1) : 1;
        fx = (ex / l) * sp * dir; fz = (ez / l) * sp * dir;
      }
    }
  }
  chanOut.depth = depth; chanOut.bank = bank; chanOut.fx = fx; chanOut.fz = fz; chanOut.e = best;
  return chanOut;
}

function dryBase(x, z) {
  let h = 0.21 + (fbm(x * 0.33 + 3.1, z * 0.33 + 7.7, 3, 0, 0) - 0.5) * 0.1;
  // the ground banks up against the rock walls (not at the keeper door, not at the glass)
  const door = 1 - sstep(1.2, 2.2, Math.abs(z + 2)) * 1;
  const wx = sstep(11.5, 12.8, Math.abs(x)) * (x > 0 ? 1 - door : 1);
  const wz = sstep(-8.6, -9.9, z);
  h += 0.24 * Math.max(wx, wz);
  return h;
}

// the ground without rocks: dry land, beach, pool bed, stream bed
function groundOnly(x, z) {
  if (z > 10.0 || x > 13.0) return HALL_Y;
  const dry = dryBase(x, z);
  const rho = poolRho(x, z);
  const ang = Math.atan2((z - POOL.z) / POOL.rz, (x - POOL.x) / POOL.rx);
  const east = sstep(0.2, 0.9, Math.cos(ang)); // the sand bank side shelves gently
  let wet = 0, land = 1;
  if (rho < 1) {
    wet = 1.75 * sstep(0, lerp(0.42, 0.8, east), 1 - rho);
    const ddx = x + 6.5, ddz = z - 2.5;
    wet += 0.08 * Math.exp(-(ddx * ddx + ddz * ddz) * 0.5) * sstep(0, 0.4, 1 - rho);
    land = 0;
  } else {
    land = sstep(0, lerp(0.9, 1.7, east), (rho - 1) * 3.6);
  }
  const ch = channel(x, z);
  if (ch.depth > wet) wet = ch.depth;
  if (ch.bank < land) land = ch.bank;
  return wet > 0 ? -wet : dry * land;
}

// 0 = sand, 1 = grass / moss ground cover
function grassWeight(x, z) {
  const n = fbm(x * 0.45 + 11, z * 0.45 + 5, 3, 0, 0);
  let w = 0.12;
  w = Math.max(w, sstep(10.2, 12.2, Math.abs(x)) * 0.85);
  w = Math.max(w, sstep(-6.8, -9.2, z) * 0.8);
  const fx = x - 11, fz = z - 3;
  w = Math.max(w, 0.95 * (1 - sstep(1.6, 3.4, Math.sqrt(fx * fx + fz * fz))));
  w = Math.max(w, 0.7 * (1 - sstep(1.2, 3.2, Math.hypot(x + 3, z + 6.5))));
  w = Math.max(w, 0.75 * (1 - sstep(1.0, 2.6, Math.hypot(x + 11, z - 7))));
  // sand: the bank east of the pool, the show area at the glass, round the water, at the door
  const bank = (1 - sstep(4.0, 6.0, Math.abs(x - 1.5) * 1.3)) * (1 - sstep(3.5, 5.5, Math.abs(z - 2.5)));
  w *= 1 - bank;
  w *= 1 - sstep(6.4, 7.6, z) * 0.85;
  w *= 1 - (1 - sstep(0.9, 2.4, Math.hypot(x - 12.3, z + 2)));
  const rho = poolRho(x, z);
  w *= sstep(1.12, 1.4, rho);
  w *= sstep(0.3, 1.0, channel(x, z).e);
  return clamp(w + (n - 0.5) * 0.7 * sstep(0.05, 0.4, w), 0, 1);
}

// ------------------------------------------------------------------------------------------------
// Mesas: every rock you can stand on. shapes: [x, z, rx, rz, rotDeg, n] superellipses (union).
// ------------------------------------------------------------------------------------------------
function mesa(shapes, h, o) {
  o = o || {};
  const m = {
    shapes: shapes.map((s) => { const r = ((s[4] || 0) * PI) / 180; return { x: s[0], z: s[1], rx: s[2], rz: s[3], c: Math.cos(r), s: Math.sin(r), n: s[5] || 2.6 }; }),
    h, dome: o.dome || 0, bevel: o.bevel === undefined ? 0.04 : o.bevel, base: o.base, flare: o.flare === undefined ? 0.14 : o.flare,
    under: o.under || 0, layers: o.layers || Math.max(2, Math.round(h / 0.32)), moss: o.moss === undefined ? 0.45 : o.moss,
    wet: o.wet || 0, noise: o.noise === undefined ? 0.07 : o.noise, cast: !!o.cast, seed: o.seed || 1, warm: o.warm || 0,
    cx: o.cx, cz: o.cz, bx: 0, bz: 0, br: 0,
  };
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const s of m.shapes) { const r = Math.max(s.rx, s.rz) * 1.02; x0 = Math.min(x0, s.x - r); x1 = Math.max(x1, s.x + r); z0 = Math.min(z0, s.z - r); z1 = Math.max(z1, s.z + r); }
  m.bx = (x0 + x1) / 2; m.bz = (z0 + z1) / 2; m.br = Math.hypot(x1 - x0, z1 - z0) / 2;
  if (m.cx === undefined) { m.cx = m.shapes[0].x; m.cz = m.shapes[0].z; }
  return m;
}
// <= 1 inside the footprint, 1 on its edge
function mesaQ(m, x, z) {
  let q = 1e9;
  const sh = m.shapes;
  for (let i = 0; i < sh.length; i++) {
    const s = sh[i];
    const dx = x - s.x, dz = z - s.z;
    const u = Math.abs((dx * s.c + dz * s.s) / s.rx), v = Math.abs((-dx * s.s + dz * s.c) / s.rz);
    if (u > 1 || v > 1) continue;
    const qq = Math.pow(Math.pow(u, s.n) + Math.pow(v, s.n), 1 / s.n);
    if (qq < q) q = qq;
  }
  return q;
}
// like mesaQ but defined outside the footprint too (build time: edge search and contact shade)
function mesaQFar(m, x, z) {
  let q = 1e9;
  for (const s of m.shapes) {
    const dx = x - s.x, dz = z - s.z;
    const u = Math.abs((dx * s.c + dz * s.s) / s.rx), v = Math.abs((-dx * s.s + dz * s.c) / s.rz);
    const qq = Math.pow(Math.pow(u, s.n) + Math.pow(v, s.n), 1 / s.n);
    if (qq < q) q = qq;
  }
  return q;
}
function mesaTop(m, q) {
  const e = q > 0.75 ? (q - 0.75) * 4 : 0;
  return m.h - m.dome * q * q - m.bevel * e * e;
}

const MESAS = [
  // the lookout: five overlapping slabs climbing from (3.5, -4.5) to the top at (5.5, -7), rises <= 0.35
  mesa([[4.1, -5.25, 1.0, 0.7, 38, 3]], 0.55, { cast: true, seed: 11, moss: 0.3 }),
  mesa([[4.5, -5.75, 1.05, 0.75, 38, 3]], 0.9, { cast: true, seed: 12, moss: 0.3 }),
  mesa([[4.9, -6.25, 1.1, 0.75, 38, 3]], 1.25, { cast: true, seed: 13, moss: 0.35 }),
  mesa([[5.25, -6.7, 1.15, 0.8, 38, 3]], 1.56, { cast: true, seed: 14, moss: 0.35 }),
  mesa([[5.8, -7.5, 1.35, 1.15, 20, 3]], 1.8, { cast: true, seed: 15, moss: 0.4, bevel: 0.05 }),
  // the massif behind it
  mesa([[6.6, -9.2, 1.6, 1.0, 5, 2.6]], 3.0, { cast: true, seed: 16, dome: 0.3, moss: 0.6, flare: 0.2 }),
  mesa([[4.2, -9.1, 1.5, 1.0, -8, 2.6]], 2.4, { cast: true, seed: 17, dome: 0.25, moss: 0.6, flare: 0.2 }),
  mesa([[7.6, -8.2, 0.8, 0.7, 30, 2.4]], 1.1, { seed: 18, dome: 0.15, moss: 0.5 }),
  // the burrow mound in the south-east corner (the nest is at its mouth)
  mesa([[10.42, -8.68, 1.9, 1.3, 50, 2.4]], 1.5, { cast: true, seed: 19, dome: 0.45, moss: 0.85, flare: 0.22, noise: 0.09 }),
  mesa([[11.9, -6.6, 0.7, 0.55, 10, 2.3]], 0.75, { seed: 20, dome: 0.2, moss: 0.6 }),
  // sun rock: big, flat, warm
  mesa([[-1, -2.5, 1.5, 1.1, 15, 2.8]], 0.5, { cast: true, seed: 21, dome: 0.02, bevel: 0.06, moss: 0.08, warm: 1, flare: 0.1 }),
  // diving rock over the pool, with a step up from the land side
  mesa([[-2.3, 5.15, 1.25, 0.85, 40, 2.6]], 0.9, { cast: true, seed: 22, base: -1.6, under: 0.16, moss: 0.25, flare: 0.05 }),
  mesa([[-1.3, 5.95, 0.8, 0.65, 40, 2.5]], 0.55, { seed: 23, moss: 0.3 }),
  // show rocks in front of the glass
  mesa([[3, 7.2, 1.3, 0.9, 0, 3]], 0.36, { cast: true, seed: 24, bevel: 0.05, moss: 0.1, warm: 0.6, flare: 0.1, layers: 2 }),
  mesa([[4.6, 7.0, 0.7, 0.5, 0, 3]], 0.31, { seed: 25, bevel: 0.05, moss: 0.1, warm: 0.6, flare: 0.1, layers: 2 }),
  // the waterfall spur (round tip + a body running back into the south wall) and its steps (rises 0.4)
  mesa([[FALL.x, FALL.z, 1.0, 1.0, 0, 2], [FALL.x, -9.05, 0.72, 1.5, 0, 4]], FALL.top,
    { cast: true, seed: 26, cx: FALL.x, cz: -8.4, bevel: 0.05, layers: 6, flare: 0.1, under: 0.12, moss: 0.7, wet: 0.7, noise: 0.05 }),
  mesa([[-8.25, -7.35, 0.6, 0.5, 0, 2.6]], 0.6, { seed: 27, moss: 0.55, wet: 0.4, layers: 2 }),
  mesa([[-8.4, -7.95, 0.62, 0.52, 0, 2.6]], 1.0, { seed: 28, moss: 0.55, wet: 0.3, layers: 3 }),
  mesa([[-8.45, -8.6, 0.62, 0.52, 0, 2.6]], 1.4, { seed: 29, moss: 0.55, wet: 0.2, layers: 4 }),
  mesa([[-8.5, -9.25, 0.68, 0.56, 0, 2.6]], 1.8, { seed: 30, moss: 0.6, wet: 0.2, layers: 5 }),
  // boulders: along the south wall
  mesa([[-3.5, -8.7, 1.6, 1.0, -10, 2.5]], 1.9, { cast: true, seed: 31, dome: 0.3, moss: 0.65, flare: 0.2 }),
  mesa([[-1.2, -9.0, 1.1, 0.8, 12, 2.4]], 1.2, { seed: 32, dome: 0.25, moss: 0.6 }),
  mesa([[0.8, -8.95, 0.8, 0.7, -20, 2.3]], 0.7, { seed: 33, dome: 0.2, moss: 0.55 }),
  mesa([[-5.9, -9.2, 0.9, 0.7, 5, 2.4]], 1.05, { seed: 34, dome: 0.22, moss: 0.7, wet: 0.2 }),
  // west wall and round the pool
  mesa([[-12.0, -2.5, 0.8, 1.2, 0, 2.4]], 1.4, { seed: 35, dome: 0.3, moss: 0.7, flare: 0.2 }),
  mesa([[-11.2, 1.3, 0.7, 0.55, 25, 2.3]], 0.7, { seed: 36, dome: 0.2, moss: 0.6 }),
  mesa([[-10.55, -0.7, 0.5, 0.45, -15, 2.2]], 0.45, { seed: 37, dome: 0.14, moss: 0.5 }),
  mesa([[-11.9, 8.2, 0.9, 0.8, 0, 2.4]], 0.95, { seed: 38, dome: 0.25, moss: 0.65 }),
  mesa([[-8.2, 8.6, 1.1, 0.7, 10, 2.5]], 0.6, { seed: 39, dome: 0.18, moss: 0.5 }),
  mesa([[-5.6, -2.2, 0.9, 0.6, 20, 2.5]], 0.55, { seed: 40, dome: 0.15, moss: 0.4 }),
  mesa([[-8.3, 3.6, 0.7, 0.55, 30, 2.4]], 0.34, { seed: 41, dome: 0.1, base: -1.9, moss: 0.3, wet: 0.5, under: 0.05 }), // basking rock in the pool
  mesa([[-3.6, -1.6, 0.55, 0.45, -30, 2.3]], 0.3, { seed: 42, dome: 0.1, base: -0.9, moss: 0.3, wet: 0.5 }),
  // east side
  mesa([[11.8, 6.8, 0.9, 1.1, 0, 2.4]], 1.1, { seed: 43, dome: 0.3, moss: 0.65, flare: 0.2 }),
  mesa([[12.0, 0.9, 0.6, 0.7, 0, 2.3]], 0.62, { seed: 44, dome: 0.2, moss: 0.6 }),
  mesa([[8.6, 8.9, 0.8, 0.5, -8, 2.4]], 0.5, { seed: 45, dome: 0.16, moss: 0.4 }),
  mesa([[7.4, -3.6, 0.6, 0.5, 35, 2.3]], 0.42, { seed: 46, dome: 0.13, moss: 0.35, warm: 0.4 }),
  mesa([[0.2, -5.0, 0.55, 0.42, 60, 2.3]], 0.38, { seed: 47, dome: 0.12, moss: 0.4 }),
];
// 1 m lookup grid of mesa lists over x [-14, 14), z [-11, 11)
const CW = 28, CH = 22;
const CELLS = [];
for (let i = 0; i < CW * CH; i++) CELLS.push([]);
for (const m of MESAS) {
  const x0 = Math.max(0, Math.floor(m.bx - m.br + 14)), x1 = Math.min(CW - 1, Math.floor(m.bx + m.br + 14));
  const z0 = Math.max(0, Math.floor(m.bz - m.br + 11)), z1 = Math.min(CH - 1, Math.floor(m.bz + m.br + 11));
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) CELLS[cz * CW + cx].push(m);
}
// the log bridge over the stream: you walk along the top of the log
const BRIDGE = { ax: -6.2, az: -3.6, bx: -8.8, bz: -2.8, y: 0.27, r: 0.3, dx: 0, dz: 0, len: 0 };
BRIDGE.len = Math.hypot(BRIDGE.bx - BRIDGE.ax, BRIDGE.bz - BRIDGE.az);
BRIDGE.dx = (BRIDGE.bx - BRIDGE.ax) / BRIDGE.len; BRIDGE.dz = (BRIDGE.bz - BRIDGE.az) / BRIDGE.len;
const HOLLOW = { x: 2, z: -6, dx: -0.97, dz: 0.243, len: 2.4, ro: 0.62, ri: 0.5 };
const SUNK = { x: -4, y: -1.3, z: 0.5, dx: 0.8, dz: 0.6, len: 2.2, ro: 0.58, ri: 0.46 };

// baked ground (smooth everywhere, so bilinear is exact enough); rocks stay analytic so their edges stay sharp
const GX0 = -18, GZ0 = -12, GCELL = 0.125, GNX = 289, GNZ = 229;
const GROUND = new Float32Array(GNX * GNZ);
for (let j = 0; j < GNZ; j++) for (let i = 0; i < GNX; i++) GROUND[j * GNX + i] = groundOnly(GX0 + i * GCELL, GZ0 + j * GCELL);
function groundAt(x, z) {
  let u = (x - GX0) / GCELL, v = (z - GZ0) / GCELL;
  if (u < 0) u = 0; else if (u > GNX - 1.001) u = GNX - 1.001;
  if (v < 0) v = 0; else if (v > GNZ - 1.001) v = GNZ - 1.001;
  const i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = j * GNX + i;
  const a = GROUND[k], b = GROUND[k + 1], c = GROUND[k + GNX], d = GROUND[k + GNX + 1];
  return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
}
function rockAt(x, z) {
  let h = -9;
  if (x > -13.9 && x < 13.9 && z > -10.9 && z < 10.9) {
    const list = CELLS[((z + 11) | 0) * CW + ((x + 14) | 0)];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const dx = x - m.bx, dz = z - m.bz;
      if (dx * dx + dz * dz > m.br * m.br) continue;
      const q = mesaQ(m, x, z);
      if (q < 1) { const t = mesaTop(m, q); if (t > h) h = t; }
    }
  }
  return h;
}
function bridgeAt(x, z) {
  const lx = x - BRIDGE.ax, lz = z - BRIDGE.az;
  const t = lx * BRIDGE.dx + lz * BRIDGE.dz;
  if (t < 0 || t > BRIDGE.len) return -9;
  const d = Math.abs(-lx * BRIDGE.dz + lz * BRIDGE.dx);
  if (d > BRIDGE.r * 0.96) return -9;
  return BRIDGE.y + Math.sqrt(BRIDGE.r * BRIDGE.r - d * d);
}
function heightAt(x, z) {
  let h = groundAt(x, z);
  const r = rockAt(x, z);
  if (r > h) h = r;
  if (x < -5.9 && x > -9.1 && z < -2.4 && z > -4) { const b = bridgeAt(x, z); if (b > h) h = b; }
  return h;
}
function waterAt(x, z) {
  if (z > 9.9 || x > 12.9 || x < -12.9 || z < -9.9) return -Infinity;
  return heightAt(x, z) < -0.004 ? 0 : -Infinity;
}
const floorAt = (x, z) => { const h = heightAt(x, z), w = waterAt(x, z) - 0.1; return w > h ? w : h; };
const depthAt = (x, z) => (waterAt(x, z) === 0 ? Math.max(0, -heightAt(x, z)) : 0);
const inPool = (x, z) => poolRho(x, z) < 1 && waterAt(x, z) === 0;
// the shallow sheet of water on top of the waterfall spur
function onFallTop(x, z) {
  const dx = x - FALL.x, dz = z - FALL.z;
  if (dx * dx + dz * dz < 0.85 * 0.85) return true;
  return Math.abs(dx) < 0.42 && z < FALL.z && z > -10;
}
function surfaceAt(x, z) {
  if (z > 10 || x > 13) return "rock";
  const g = groundAt(x, z), r = rockAt(x, z), b = bridgeAt(x, z);
  if (b > g && b > r) return "wood";
  if (r > g) return r > 2 && onFallTop(x, z) ? "water" : "rock";
  if (g < -0.004) return "water";
  const hx = x - HOLLOW.x, hz = z - HOLLOW.z;
  if (Math.abs(hx * HOLLOW.dx + hz * HOLLOW.dz) < HOLLOW.len / 2 && Math.abs(-hx * HOLLOW.dz + hz * HOLLOW.dx) < HOLLOW.ri) return "wood";
  return grassWeight(x, z) > 0.5 ? "grass" : "sand";
}

// ------------------------------------------------------------------------------------------------
// Shader text
// ------------------------------------------------------------------------------------------------
// --- pieces spliced into MeshStandardMaterial (see patch()) ---
const VS_WORLD = /* glsl */ `
	vec4 zwp = vec4( transformed, 1.0 );
	#ifdef USE_INSTANCING
		zwp = instanceMatrix * zwp;
	#endif
	zWorld = ( modelMatrix * zwp ).xyz;
`;
const VS_PLANT = /* glsl */ `
	#ifdef USE_INSTANCING
		vec3 zip = instanceMatrix[ 3 ].xyz;
	#else
		vec3 zip = vec3( 0.0 );
	#endif
	float zph = zip.x * 0.61 + zip.z * 0.83 + color.g * 6.2832;
	float zsw = sin( zTime * zWind.z + zph ) + 0.45 * sin( zTime * zWind.z * 2.3 + zph * 1.9 );
	transformed.xz += zWind.xy * ( zsw * color.r );
`;
const VS_FISH = /* glsl */ `
	float zb = clamp( ( 0.3 - position.z ) * 1.1, 0.0, 1.0 );
	transformed.x += sin( aFish.x + position.z * 5.5 ) * zb * zb * 0.2 * aFish.y + sin( aFish.x + 1.2 ) * 0.03 * aFish.y * position.z;
`;
const VS_PAPER = /* glsl */ `
	transformed.z += zCurl * ( sin( position.x * 9.0 + 1.0 ) * 0.03 + position.y * position.y * 0.22 );
`;
const FS_PARS = /* glsl */ `
	varying vec3 zWorld;
	uniform float zTime;
	uniform sampler2D zCaus;
	uniform float zCausK;
	uniform vec3 zTint;
	uniform vec4 zAlarm;
	uniform float zLamp;
`;
// the bed seen through the surface: its texture coordinates wobble (cheap stand-in for refraction)
const FS_MAP_WOBBLE = /* glsl */ `
	#ifdef USE_MAP
		vec2 zUv = vMapUv;
		float zk = smoothstep( 0.02, 0.4, -zWorld.y ) * 0.014;
		zUv += vec2( sin( zWorld.z * 5.3 + zTime * 2.1 ), cos( zWorld.x * 4.7 + zTime * 1.7 ) ) * zk;
		diffuseColor *= texture2D( map, zUv );
	#endif
`;
// vertex colour = ( moss / grass weight, damp, baked shade )
const FS_SPLAT = /* glsl */ `
	vec3 zm = texture2D( zTex2, vMapUv * zSplat.x ).rgb;
	float zmk = smoothstep( 0.38, 0.62, vColor.r + ( zm.g - zSplat.y ) * 0.9 ) * step( 0.02, vColor.r );
	diffuseColor.rgb = mix( diffuseColor.rgb, zm * zSplat.z, zmk );
	diffuseColor.rgb *= mix( 1.0, 0.6, vColor.g ) * vColor.b;
`;
const FS_SPLAT_ROUGH = /* glsl */ `
	roughnessFactor = mix( roughnessFactor, 0.3, vColor.g * 0.8 );
`;
const FS_PLANT = /* glsl */ `
	diffuseColor.rgb *= vColor.b;
`;
// caustics and absorption under the water line
const FS_UNDERWATER = /* glsl */ `
	if ( zWorld.y < 0.0 ) {
		float zd = -zWorld.y;
		vec2 zc = zWorld.xz * 0.42;
		float zc1 = texture2D( zCaus, zc + vec2( zTime * 0.021, zTime * 0.013 ) ).r;
		float zc2 = texture2D( zCaus, zc * 1.31 + vec2( -zTime * 0.017, zTime * 0.024 ) + 0.37 ).r;
		float zca = min( zc1, zc2 ) * 2.4 + zc1 * zc2;
		diffuseColor.rgb *= 1.0 + zca * zCausK * smoothstep( 0.0, 0.15, zd ) * exp( -zd * 0.35 );
		diffuseColor.rgb *= mix( vec3( 1.0 ), zTint, 1.0 - exp( -zd * 1.3 ) );
	}
`;
// lamps (frame lamps every 6 m, hall ceiling lamps every 4 m, the door lamp) and the alarm beacon's sweep
const FS_GLOW = /* glsl */ `
	{
		vec3 zalb = diffuseColor.rgb;
		if ( zLamp > 0.001 ) {
			float zlx = zWorld.x - ( floor( ( zWorld.x + 12.0 ) / 6.0 ) * 6.0 - 9.0 );
			vec3 zd1 = vec3( zlx, zWorld.y - 2.5, zWorld.z - 9.6 );
			float zg1 = smoothstep( 10.3, 9.9, zWorld.z ) / ( 1.0 + dot( zd1, zd1 ) * 0.2 );
			float zhx = zWorld.x - floor( zWorld.x / 4.0 + 0.5 ) * 4.0;
			float zg2 = smoothstep( 10.2, 10.6, zWorld.z ) * ( 0.45 + 0.65 / ( 1.0 + zhx * zhx * 0.5 ) );
			vec3 zd3 = zWorld - vec3( 12.2, 2.6, -2.0 );
			float zg3 = 1.0 / ( 1.0 + dot( zd3, zd3 ) * 0.45 );
			outgoingLight += zalb * vec3( 1.0, 0.78, 0.5 ) * zLamp * ( zg1 * 1.25 + zg2 * 1.05 + zg3 * 0.9 );
		}
		if ( zAlarm.z > 0.001 ) {
			vec2 zdv = zWorld.xz - vec2( 12.2, -2.0 );
			float zdl = length( zdv ) + 0.001;
			float zsw = pow( max( dot( zdv / zdl, zAlarm.xy ), 0.0 ), 5.0 );
			// a pulsing red wash that falls off from the beacon (dark troughs between pulses) + the turning beam
			float zpu = zAlarm.w * zAlarm.w;
			outgoingLight += zalb * vec3( 1.0, 0.07, 0.04 ) * zAlarm.z * ( ( 0.04 + zpu * 0.3 ) / ( 1.0 + zdl * 0.05 ) + zsw * 1.7 / ( 1.0 + zdl * 0.06 ) );
		}
	}
`;

const WATER_VS = /* glsl */ `
	attribute float aDepth;
	attribute vec2 aFlow;
	varying vec3 vW;
	varying float vDepth;
	varying vec2 vFlow;
	varying float vFog;
	void main() {
		vec4 wp = modelMatrix * vec4( position, 1.0 );
		vW = wp.xyz;
		vDepth = aDepth;
		vFlow = aFlow;
		vec4 mv = viewMatrix * wp;
		vFog = -mv.z;
		gl_Position = projectionMatrix * mv;
	}
`;
const WATER_FS = /* glsl */ `
	uniform float uTime;
	uniform sampler2D uNorm;
	uniform sampler2D uNoise;
	uniform vec3 uSun;
	uniform vec3 uSunCol;
	uniform vec3 uZen;
	uniform vec3 uHor;
	uniform vec3 uRim;
	uniform vec3 uShallow;
	uniform vec3 uDeep;
	uniform float uLight;
	uniform vec3 uFogCol;
	uniform vec2 uFog;
	uniform vec4 uRip[ 4 ];
	uniform vec4 uFall;
	varying vec3 vW;
	varying float vDepth;
	varying vec2 vFlow;
	varying float vFog;
	void main() {
		vec2 p = vW.xz;
		// two-phase flow so the stream runs without the texture ever stretching
		float ph = uTime * 0.4;
		float f0 = fract( ph );
		float f1 = fract( ph + 0.5 );
		float wgt = abs( 1.0 - 2.0 * f0 );
		vec2 dr = vec2( uTime * 0.021, uTime * 0.013 );
		vec2 fl = vFlow * 1.5;
		vec2 nS = texture2D( uNorm, p * 0.31 + dr ).xy - 0.5;
		vec2 nA = texture2D( uNorm, p * 0.73 - dr.yx * 1.3 - fl * f0 ).xy - 0.5;
		vec2 nB = texture2D( uNorm, p * 0.73 - dr.yx * 1.3 - fl * f1 + 0.37 ).xy - 0.5;
		vec2 nxy = nS * 0.9 + mix( nA, nB, wgt ) * ( 1.2 + length( vFlow ) * 1.2 );
		// rings from feet, landings and splashes
		for ( int i = 0; i < 4; i ++ ) {
			vec2 d = p - uRip[ i ].xy;
			float age = uTime - uRip[ i ].z;
			float dl = length( d ) + 0.0001;
			float ring = ( dl - age * 1.15 ) / 0.11;
			float wv = exp( -ring * ring ) * uRip[ i ].w * clamp( 1.0 - age / 2.4, 0.0, 1.0 ) * step( 0.0, age );
			nxy += ( d / dl ) * wv * cos( ring * 1.6 ) * 1.3;
		}
		vec3 N = normalize( vec3( nxy.x * 0.34, 1.0, nxy.y * 0.34 ) );
		vec3 V = normalize( cameraPosition - vW );
		float ndv = abs( dot( N, V ) );
		float fres = 0.025 + 0.975 * pow( 1.0 - ndv, 5.0 );
		vec3 R = reflect( -V, N );
		R.y = abs( R.y );
		vec3 sky = mix( uHor, uZen, smoothstep( 0.0, 0.7, R.y ) );
		sky = mix( uRim, sky, smoothstep( 0.06, 0.34, R.y ) );
		float sd = max( dot( R, uSun ), 0.0 );
		vec3 glint = uSunCol * ( pow( sd, 260.0 ) * 2.4 + pow( sd, 26.0 ) * 0.1 );
		float df = 1.0 - exp( -vDepth * 1.25 );
		vec3 body = mix( uShallow, uDeep, df ) * uLight;
		float a = mix( 0.1, 0.74, df );
		vec3 col = mix( body, sky, fres ) + glint;
		a = clamp( a + fres * 0.85 + glint.g, 0.0, 1.0 );
		a *= smoothstep( 0.0, 0.035, vDepth );
		// foam: a thin lapping line along the shore, and the churn under the waterfall
		float nz = texture2D( uNoise, p * 0.9 + vec2( uTime * 0.03, -uTime * 0.02 ) ).r;
		float lapW = 0.05 + 0.02 * sin( uTime * 0.9 + p.x * 1.3 + p.y * 0.7 );
		float lap = smoothstep( 0.004, 0.02, vDepth ) * ( 1.0 - smoothstep( lapW * 0.6, lapW, vDepth ) ) * smoothstep( 0.35, 0.6, nz ) * 0.6;
		vec2 fd = p - uFall.xy;
		float fr = length( fd ) + 0.001;
		float churn = texture2D( uNoise, p * 1.7 + vec2( uTime * 0.23, uTime * 0.17 ) ).g;
		float fallFoam = ( 1.0 - smoothstep( 0.0, 0.6, abs( fr - uFall.z ) ) ) * smoothstep( 0.42, 0.62, dot( fd / fr, vec2( -0.259, 0.966 ) ) ) * step( vW.y, 0.5 );
		fallFoam *= 0.45 + 0.75 * churn;
		float foam = clamp( lap + fallFoam, 0.0, 1.0 );
		col = mix( col, vec3( 0.95, 0.98, 1.0 ) * ( 0.3 + 0.7 * uLight ), foam );
		a = max( a, foam * 0.88 );
		if ( cameraPosition.y < vW.y ) {
			// the surface from below: a bright wobbling ceiling
			float wn = clamp( 0.55 + N.x * 1.6 + N.z * 1.2, 0.0, 1.0 );
			col = mix( uDeep * uLight * 1.6, uZen * 0.85 + uSunCol * 0.15, wn * 0.75 );
			a = 0.84;
		}
		col = mix( col, uFogCol, smoothstep( uFog.x, uFog.y, vFog ) );
		gl_FragColor = vec4( col, a );
		#include <colorspace_fragment>
	}
`;

const FALL_VS = /* glsl */ `
	attribute float aKind;
	varying vec2 vUv;
	varying float vKind;
	varying float vFog;
	void main() {
		vUv = uv;
		vKind = aKind;
		vec4 mv = modelViewMatrix * vec4( position, 1.0 );
		vFog = -mv.z;
		gl_Position = projectionMatrix * mv;
	}
`;
const FALL_FS = /* glsl */ `
	uniform float uTime;
	uniform sampler2D uNoise;
	uniform float uLight;
	uniform vec3 uFogCol;
	uniform vec2 uFog;
	varying vec2 vUv;
	varying float vKind;
	varying float vFog;
	void main() {
		vec3 col;
		float a;
		if ( vKind < 0.5 ) {
			// the curtain: long streaks that speed up as they fall and break apart lower down
			float v = pow( vUv.y, 0.75 );
			float s1 = texture2D( uNoise, vec2( vUv.x * 2.6, v * 0.55 - uTime * 0.62 ) ).r;
			float s2 = texture2D( uNoise, vec2( vUv.x * 6.1 + 0.3, v * 0.9 - uTime * 0.97 ) ).g;
			float streak = s1 * 0.6 + s2 * 0.4;
			float body = smoothstep( 0.3, 0.6, streak + 0.3 * ( 1.0 - vUv.y ) );
			float edge = smoothstep( 0.0, 0.1, vUv.x ) * smoothstep( 1.0, 0.9, vUv.x );
			a = body * edge * mix( 0.9, 0.62, vUv.y );
			col = mix( vec3( 0.6, 0.79, 0.86 ), vec3( 1.0 ), smoothstep( 0.5, 0.85, streak ) );
		} else {
			// mist billowing at the foot
			vec2 c = vUv - 0.5;
			float r = clamp( 1.0 - dot( c, c ) * 4.0, 0.0, 1.0 );
			float n = texture2D( uNoise, vUv * 0.45 + vec2( uTime * 0.05, -uTime * 0.16 ) + vKind * 0.31 ).r;
			a = r * r * ( 0.12 + 0.4 * n );
			col = vec3( 0.93, 0.97, 1.0 );
		}
		col *= 0.25 + 0.75 * uLight;
		col = mix( col, uFogCol, smoothstep( uFog.x, uFog.y, vFog ) );
		gl_FragColor = vec4( col, a );
		#include <colorspace_fragment>
	}
`;

const GLASS_VS = /* glsl */ `
	varying vec3 vW;
	varying float vFog;
	void main() {
		vec4 wp = modelMatrix * vec4( position, 1.0 );
		vW = wp.xyz;
		vec4 mv = viewMatrix * wp;
		vFog = -mv.z;
		gl_Position = projectionMatrix * mv;
	}
`;
const GLASS_FS = /* glsl */ `
	uniform sampler2D uSmudge;
	uniform vec3 uZen;
	uniform vec3 uHor;
	uniform float uLight;
	uniform vec4 uHole;
	uniform vec4 uAlarm;
	uniform vec3 uFogCol;
	uniform vec2 uFog;
	varying vec3 vW;
	varying float vFog;
	float hash1( float n ) { return fract( sin( n * 12.9898 ) * 43758.5453 ); }
	void main() {
		vec3 V = normalize( cameraPosition - vW );
		float ndv = abs( V.z );
		float fres = 0.04 + 0.96 * pow( 1.0 - ndv, 5.0 );
		// soft diagonal reflections that slide as you move along the glass
		float s = vW.x * 0.9 + vW.y * 1.7 + cameraPosition.x * 0.35;
		float streak = smoothstep( 0.72, 1.0, sin( s ) * 0.5 + 0.5 ) * 0.1 + smoothstep( 0.9, 1.0, sin( s * 2.7 + 1.3 ) * 0.5 + 0.5 ) * 0.05;
		// thick glass: a green edge where each pane meets its frame (posts every 2 m)
		float pu = fract( vW.x * 0.5 ) * 2.0;
		float ex = min( pu, 2.0 - pu );
		float ey = min( vW.y - 0.39, 2.38 - vW.y );
		float rim = 1.0 - smoothstep( 0.0, 0.07, min( ex, ey ) );
		float smudge = texture2D( uSmudge, vec2( vW.x * 0.26, ( vW.y - 0.39 ) * 0.5 ) ).r;
		vec3 refl = mix( uHor, uZen, 0.4 );
		vec3 col = refl * ( fres * 1.1 + streak ) + vec3( 0.32, 0.6, 0.5 ) * rim * 0.5 * uLight + vec3( 0.9 ) * smudge * 0.22 * ( 0.35 + 0.65 * uLight );
		float a = clamp( fres * 0.9 + streak + rim * 0.4 + smudge * 0.22 + 0.04, 0.0, 0.92 );
		if ( uHole.w > 0.5 ) {
			vec2 d = vec2( vW.x - uHole.x, vW.y - uHole.y );
			float dist = length( d ) + 0.0001;
			float ang = atan( d.y, d.x );
			float jag = 0.8 + 0.15 * sin( ang * 7.0 + 1.3 ) + 0.11 * sin( ang * 13.0 + 4.1 ) + 0.07 * sin( ang * 29.0 + 0.7 );
			float r = length( d / vec2( uHole.z, uHole.z * 1.45 ) );
			float paneL = floor( uHole.x * 0.5 ) * 2.0;
			float inPane = step( paneL + 0.035, vW.x ) * step( vW.x, paneL + 1.965 );
			if ( r < jag && inPane > 0.5 ) discard;
			// cracks: spokes running out from the hole, a few rings tying them together, frosting at the edge
			float sp = ang * ( 19.0 / 6.2831853 ) + 0.35 * sin( ang * 3.0 );
			float sid = floor( sp );
			float sd = abs( fract( sp ) - 0.5 ) * ( 6.2831853 / 19.0 ) * dist;
			float reach = 0.9 + 1.9 * hash1( sid + 3.0 );
			float spoke = ( 1.0 - smoothstep( 0.004, 0.013, sd ) ) * ( 1.0 - smoothstep( reach * 0.6, reach, dist - uHole.z * 0.7 ) );
			float rg = dist * 2.3 + 0.25 * sin( ang * 5.0 );
			float ring = ( 1.0 - smoothstep( 0.012, 0.035, abs( fract( rg ) - 0.5 ) / 2.3 ) ) * step( 0.55, hash1( sid * 7.0 + floor( rg ) ) ) * ( 1.0 - smoothstep( 1.0, 2.2, dist ) );
			float frost = ( 1.0 - smoothstep( 0.0, 0.3, r - jag ) ) * inPane * 0.4;
			float crack = clamp( spoke + ring * 0.6 + frost, 0.0, 1.0 );
			vec3 cc = vec3( 0.82, 0.92, 1.0 ) * ( 0.3 + 0.7 * uLight ) + vec3( 1.0, 0.12, 0.08 ) * uAlarm.z * ( 0.35 + 0.4 * uAlarm.w );
			col = mix( col, cc, crack );
			a = max( a, crack * 0.85 );
		}
		col = mix( col, uFogCol, smoothstep( uFog.x, uFog.y, vFog ) * 0.6 );
		gl_FragColor = vec4( col, a );
		#include <colorspace_fragment>
	}
`;

const GLOW_VS = /* glsl */ `
	attribute vec3 aOff;
	attribute vec3 aCol;
	attribute float aKind;
	uniform float uLamp;
	uniform vec4 uAlarm;
	varying vec2 vUv;
	varying vec3 vCol;
	varying float vKind;
	void main() {
		vUv = uv;
		vKind = aKind;
		vec4 mv;
		if ( aKind < 0.5 ) {
			// lamp halo, always facing the camera
			vCol = aCol * uLamp;
			mv = modelViewMatrix * vec4( position, 1.0 );
			mv.xy += aOff.xy;
		} else if ( aKind < 1.5 ) {
			// beacon halo
			vCol = aCol * uAlarm.z * ( 0.55 + 0.45 * uAlarm.w );
			mv = modelViewMatrix * vec4( position, 1.0 );
			mv.xy += aOff.xy;
		} else {
			// the beacon's turning beam
			vCol = aCol * uAlarm.z;
			vec3 o = vec3( aOff.x * uAlarm.x - aOff.z * uAlarm.y, aOff.y, aOff.x * uAlarm.y + aOff.z * uAlarm.x );
			mv = modelViewMatrix * vec4( position + o, 1.0 );
		}
		gl_Position = projectionMatrix * mv;
	}
`;
const GLOW_FS = /* glsl */ `
	varying vec2 vUv;
	varying vec3 vCol;
	varying float vKind;
	void main() {
		float a;
		if ( vKind < 1.5 ) {
			float r = clamp( 1.0 - length( vUv - 0.5 ) * 2.0, 0.0, 1.0 );
			a = r * r * ( 0.55 + 0.45 * r );
		} else {
			a = ( 1.0 - vUv.x ) * ( 1.0 - vUv.x ) * ( 1.0 - abs( vUv.y - 0.5 ) * 2.0 ) * 0.3;
		}
		gl_FragColor = vec4( vCol * a, 1.0 );
		#include <colorspace_fragment>
	}
`;

const SKY_VS = /* glsl */ `
	varying vec3 vDir;
	void main() {
		vDir = position;
		// the dome is centred on the camera: rotation only
		gl_Position = projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 );
	}
`;
const SKY_FS = /* glsl */ `
	uniform float uTime;
	uniform sampler2D uNoise;
	uniform sampler2D uStars;
	uniform vec3 uSun;
	uniform vec3 uDisc;
	uniform vec3 uZen;
	uniform vec3 uHor;
	uniform vec3 uCloud;
	uniform float uCloudAmt;
	uniform float uNight;
	uniform vec4 uAlarm;
	varying vec3 vDir;
	void main() {
		vec3 d = normalize( vDir );
		float h = max( d.y, 0.0 );
		vec3 col = mix( uHor, uZen, pow( smoothstep( 0.0, 0.8, h ), 0.65 ) );
		float sd = max( dot( d, uSun ), 0.0 );
		col += uDisc * ( smoothstep( 0.9993, 0.9997, sd ) * 3.0 + pow( sd, 40.0 ) * 0.28 + pow( sd, 6.0 ) * 0.07 );
		vec2 cuv = d.xz / ( h + 0.28 ) * 0.22 + vec2( uTime * 0.0035, uTime * 0.0012 );
		float c = texture2D( uNoise, cuv ).r * 0.62 + texture2D( uNoise, cuv * 2.7 + 0.31 ).g * 0.38;
		float cm = smoothstep( 1.0 - uCloudAmt, 1.0 - uCloudAmt + 0.22, c ) * smoothstep( 0.03, 0.3, d.y );
		float st = texture2D( uStars, d.xz / ( h + 0.45 ) * 1.6 ).r;
		col += vec3( 0.9, 0.95, 1.0 ) * st * uNight * smoothstep( 0.05, 0.35, d.y ) * ( 1.0 - cm );
		col = mix( col, uCloud + uDisc * pow( sd, 5.0 ) * 0.25, cm * 0.88 );
		col += vec3( 0.5, 0.03, 0.02 ) * uAlarm.z * ( 0.25 + 0.3 * uAlarm.w ) * ( 1.0 - h );
		gl_FragColor = vec4( col, 1.0 );
		#include <colorspace_fragment>
	}
`;

// ------------------------------------------------------------------------------------------------
// Times of day. ENV = what the engine's lights / fog get; SKY = what this world's own shaders get.
// ------------------------------------------------------------------------------------------------
const ENV = {
  morning: { background: 0xd7e3e6, fog: [0xd3e1e6, 7, 44], hemi: [0xcfe4f2, 0x77806a, 1.15], sun: [0xffe0b8, 1.75], sunDir: [0.72, 0.36, 0.42], far: 90, dark: false },
  noon: { background: 0xb5d9f2, fog: [0xbfdcf0, 24, 85], hemi: [0xdcefff, 0x8a7f5c, 1.35], sun: [0xfff3da, 2.3], sunDir: [-0.4, 0.82, 0.36], far: 90, dark: false },
  evening: { background: 0xffc48a, fog: [0xf5bd8c, 16, 70], hemi: [0xffd9b0, 0x6a5a4a, 1.0], sun: [0xffa35a, 2.2], sunDir: [-0.78, 0.3, 0.4], far: 90, dark: false },
  night: { background: 0x0a1226, fog: [0x0c1529, 12, 60], hemi: [0x34497a, 0x10141f, 0.6], sun: [0x8fb0ff, 0.6], sunDir: [-0.32, 0.74, 0.5], far: 90, dark: true },
  alarm: { background: 0x0e060c, fog: [0x150810, 10, 55], hemi: [0x4a2c40, 0x140a0e, 0.5], sun: [0xff7a66, 0.42], sunDir: [-0.32, 0.74, 0.5], far: 90, dark: true },
};
const SKY = {
  morning: { zen: 0x6fa3cf, hor: 0xf0dfc8, cloud: 0xfff2e2, disc: 0xffe6c0, rim: 0x4a5a45, cloudAmt: 0.5, night: 0, lamp: 0.12, alarm: 0, caus: 0.7, light: 0.85 },
  noon: { zen: 0x3f86d8, hor: 0xb5d9f2, cloud: 0xffffff, disc: 0xfff6dd, rim: 0x3f5236, cloudAmt: 0.42, night: 0, lamp: 0, alarm: 0, caus: 1, light: 1 },
  evening: { zen: 0x4a5fa8, hor: 0xffb56b, cloud: 0xffc79a, disc: 0xffb070, rim: 0x4a3a2c, cloudAmt: 0.5, night: 0.08, lamp: 0.5, alarm: 0, caus: 0.75, light: 0.8 },
  night: { zen: 0x050a1c, hor: 0x16223f, cloud: 0x1b2542, disc: 0xcfdcff, rim: 0x070b14, cloudAmt: 0.34, night: 1, lamp: 1, alarm: 0, caus: 0.22, light: 0.2 },
  alarm: { zen: 0x0b0610, hor: 0x2a0d14, cloud: 0x2a1018, disc: 0xffb0a0, rim: 0x0c0507, cloudAmt: 0.34, night: 0.5, lamp: 0.35, alarm: 1, caus: 0.15, light: 0.2 },
};

// ================================================================================================
export function createZoo(ctx) {
  const THREE = ctx.THREE;
  const player = ctx.player;
  const maxAniso = ctx.renderer && ctx.renderer.capabilities && ctx.renderer.capabilities.getMaxAnisotropy ? ctx.renderer.capabilities.getMaxAnisotropy() : 1;

  function sfx(name, a, b, c) { const o = ctx.audio, f = o && o[name]; return typeof f === "function" ? f.call(o, a, b, c) : undefined; }
  function vfx(name, a, b, c, d, e, f) { const o = ctx.fx, fn = o && o[name]; return typeof fn === "function" ? fn.call(o, a, b, c, d, e, f) : undefined; }

  // ----------------------------------------------------------------------------------------------
  // Textures (all painted once, here)
  // ----------------------------------------------------------------------------------------------
  function mkCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function mkTex(canvas, o) {
    o = o || {};
    const t = new THREE.CanvasTexture(canvas);
    if (o.srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (o.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.max(1, Math.min(o.aniso || 4, maxAniso));
    if (o.mips === false) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
    return t;
  }
  // fn(u, v, out) fills out.{h, r, g, b, ro} -> { map, normalMap, roughnessMap }
  function bakeSurface(size, fn, nStrength) {
    const H = new Float32Array(size * size);
    const ca = mkCanvas(size, size), cn = mkCanvas(size, size), cr = mkCanvas(size, size);
    const ga = ca.getContext("2d"), gn = cn.getContext("2d"), gr = cr.getContext("2d");
    const ia = ga.createImageData(size, size), im = gn.createImageData(size, size), ir = gr.createImageData(size, size);
    const o = { h: 0, r: 0, g: 0, b: 0, ro: 1 };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      fn(x / size, y / size, o);
      const i = y * size + x, k = i * 4;
      H[i] = o.h;
      ia.data[k] = o.r * 255; ia.data[k + 1] = o.g * 255; ia.data[k + 2] = o.b * 255; ia.data[k + 3] = 255;
      const q = o.ro * 255;
      ir.data[k] = q; ir.data[k + 1] = q; ir.data[k + 2] = q; ir.data[k + 3] = 255;
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const xl = (x + size - 1) % size, xr = (x + 1) % size, yu = (y + size - 1) % size, yd = (y + 1) % size;
      const dx = (H[y * size + xr] - H[y * size + xl]) * nStrength;
      const dy = (H[yd * size + x] - H[yu * size + x]) * nStrength; // canvas rows run down, v runs up
      const l = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const k = (y * size + x) * 4;
      im.data[k] = (-dx * l * 0.5 + 0.5) * 255; im.data[k + 1] = (dy * l * 0.5 + 0.5) * 255; im.data[k + 2] = (l * 0.5 + 0.5) * 255; im.data[k + 3] = 255;
    }
    ga.putImageData(ia, 0, 0); gn.putImageData(im, 0, 0); gr.putImageData(ir, 0, 0);
    return { map: mkTex(ca, { srgb: true, aniso: 8 }), normalMap: mkTex(cn, { aniso: 4 }), roughnessMap: mkTex(cr) };
  }
  function bakeData(size, fn) {
    const c = mkCanvas(size, size), g = c.getContext("2d"), im = g.createImageData(size, size);
    const o = { r: 0, g: 0, b: 0 };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      fn(x / size, y / size, o);
      const k = (y * size + x) * 4;
      im.data[k] = o.r * 255; im.data[k + 1] = o.g * 255; im.data[k + 2] = o.b * 255; im.data[k + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    return c;
  }
  // normal + roughness derived from a painted canvas (leaves, bark-like details)
  function deriveMaps(canvas, nStrength) {
    const w = canvas.width, h = canvas.height;
    const src = canvas.getContext("2d").getImageData(0, 0, w, h).data;
    const cn = mkCanvas(w, h), cr = mkCanvas(w, h);
    const gn = cn.getContext("2d"), gr = cr.getContext("2d");
    const im = gn.createImageData(w, h), ir = gr.createImageData(w, h);
    const L = (x, y) => { const k = (clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)) * 4; return (src[k] * 0.3 + src[k + 1] * 0.6 + src[k + 2] * 0.1) / 255; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (L(x + 1, y) - L(x - 1, y)) * nStrength, dy = (L(x, y + 1) - L(x, y - 1)) * nStrength;
      const l = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const k = (y * w + x) * 4;
      im.data[k] = (-dx * l * 0.5 + 0.5) * 255; im.data[k + 1] = (dy * l * 0.5 + 0.5) * 255; im.data[k + 2] = (l * 0.5 + 0.5) * 255; im.data[k + 3] = 255;
      const q = (0.5 + 0.35 * (1 - L(x, y))) * 255;
      ir.data[k] = q; ir.data[k + 1] = q; ir.data[k + 2] = q; ir.data[k + 3] = 255;
    }
    gn.putImageData(im, 0, 0); gr.putImageData(ir, 0, 0);
    return { normalMap: mkTex(cn, { repeat: false }), roughnessMap: mkTex(cr, { repeat: false }) };
  }

  // rock: horizontal strata (v), each layer its own tone, dark bedding grooves, grain, pits, ochre staining
  const rockMaps = bakeSurface(256, (u, v, o) => {
    const warp = fbm(u * 4, v * 4, 3, 4, 4);
    const L = v * 12 + warp * 1.7 + 0.35 * vnoise(u * 16, v * 2, 16, 2);
    const li = Math.floor(L), lf = L - li;
    const lt = nval[perm[pmod(li, 12) * 7 + 3]];
    const groove = sstep(0, 0.09, lf);
    const grain = fbm(u * 24, v * 24, 3, 24, 24);
    const blot = fbm(u * 5 + 9, v * 5, 3, 5, 5);
    const pit = vnoise(u * 64, v * 64, 64, 64) > 0.83 ? 1 : 0;
    o.h = 0.35 * lt + 0.32 * groove + 0.28 * grain - 0.18 * pit;
    const tone = 0.78 + 0.3 * (lt - 0.5) + 0.24 * (grain - 0.5) - (1 - groove) * 0.3 - pit * 0.1;
    const warm = clamp((blot - 0.38) * 2.2, 0, 1);
    o.r = (0.66 + 0.12 * warm) * tone; o.g = (0.61 + 0.03 * warm) * tone; o.b = (0.54 - 0.07 * warm) * tone;
    o.ro = 0.84 + 0.12 * grain;
  }, 5);
  // sand: wind ripples, grain, the odd dark speck - fine enough to take footprints
  const sandMaps = bakeSurface(256, (u, v, o) => {
    const grain = vnoise(u * 128, v * 128, 128, 128);
    const mid = fbm(u * 12, v * 12, 3, 12, 12);
    const rip = Math.sin((v * 14 + mid * 1.3 + 0.25 * Math.sin(u * TAU * 2)) * TAU) * 0.5 + 0.5;
    o.h = 0.3 * rip + 0.4 * grain + 0.3 * mid;
    const t = 0.86 + 0.16 * mid + 0.1 * (grain - 0.5) + 0.04 * rip - (grain > 0.94 ? 0.2 : 0);
    o.r = 0.87 * t; o.g = 0.77 * t; o.b = 0.58 * t;
    o.ro = 0.92;
  }, 2.2);
  // bark: deep furrows running along the log (v)
  const barkMaps = bakeSurface(128, (u, v, o) => {
    const w = fbm(u * 3, v * 2, 2, 3, 2);
    const r = Math.pow(fbm(u * 14 + w * 1.6, v * 3, 3, 14, 3), 1.4);
    const fine = vnoise(u * 64, v * 16, 64, 16);
    o.h = r * 0.8 + fine * 0.2;
    const t = 0.25 + 0.95 * r + 0.15 * (fine - 0.5);
    o.r = 0.5 * t + 0.03; o.g = 0.38 * t + 0.02; o.b = 0.27 * t + 0.02;
    o.ro = 0.9;
  }, 6);
  // plaster / pavers for the hall: 2 x 2 slabs per repeat with recessed joints
  const plasterMaps = bakeSurface(128, (u, v, o) => {
    const n = fbm(u * 8, v * 8, 3, 8, 8), f = vnoise(u * 64, v * 64, 64, 64);
    const ju = Math.abs(((u * 2) % 1) - 0.5), jv = Math.abs(((v * 2) % 1) - 0.5);
    const joint = sstep(0.47, 0.495, Math.max(ju, jv));
    o.h = 0.6 + 0.2 * n + 0.1 * f - 0.5 * joint;
    const t = 0.9 + 0.12 * (n - 0.5) + 0.05 * (f - 0.5) - 0.22 * joint;
    o.r = t; o.g = t; o.b = t;
    o.ro = 0.82 + 0.1 * n;
  }, 3);
  // moss / grass ground cover (albedo only; it is splatted over rock and sand)
  const mossTex = mkTex(bakeData(128, (u, v, o) => {
    const m = fbm(u * 8, v * 8, 4, 8, 8), f = vnoise(u * 96, v * 96, 96, 96);
    const t = clamp(m * 0.75 + f * 0.35, 0, 1);
    o.r = lerp(0.17, 0.46, t); o.g = lerp(0.27, 0.58, t); o.b = lerp(0.08, 0.2, t);
  }), { srgb: true, aniso: 4 });
  // two independent noises (clouds, falling water, foam)
  const noiseTex = mkTex(bakeData(128, (u, v, o) => {
    o.r = fbm(u * 6, v * 6, 4, 6, 6); o.g = fbm(u * 6 + 31, v * 6 + 17, 4, 6, 6); o.b = 0;
  }));
  // water ripples as a normal map
  const waterNorm = (() => {
    const S = 128, H = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) H[y * S + x] = fbm((x / S) * 6 + 5, (y / S) * 6 + 2, 4, 6, 6);
    return mkTex(bakeData(S, (u, v, o) => {
      const x = Math.round(u * S) % S, y = Math.round(v * S) % S;
      const dx = (H[y * S + ((x + 1) % S)] - H[y * S + ((x + S - 1) % S)]) * 6, dy = (H[((y + 1) % S) * S + x] - H[((y + S - 1) % S) * S + x]) * 6;
      const l = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      o.r = -dx * l * 0.5 + 0.5; o.g = -dy * l * 0.5 + 0.5; o.b = l * 0.5 + 0.5;
    }));
  })();
  // caustics: the bright web between the cells of a tileable Voronoi pattern
  const causTex = (() => {
    const K = 6, pts = [], r = rng(4242);
    for (let i = 0; i < K * K; i++) pts.push(r(), r());
    return mkTex(bakeData(256, (u, v, o) => {
      const px = u * K, py = v * K, cx = Math.floor(px), cy = Math.floor(py);
      let f1 = 9, f2 = 9;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const gx = cx + i, gy = cy + j, k = (pmod(gy, K) * K + pmod(gx, K)) * 2;
        const dx = gx + pts[k] - px, dy = gy + pts[k + 1] - py, d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      const e = Math.pow(1 - clamp((f2 - f1) * 2.6, 0, 1), 4);
      o.r = o.g = o.b = e;
    }), { mips: false });
  })();
  const starTex = (() => {
    const c = mkCanvas(256, 256), g = c.getContext("2d"), r = rng(77);
    g.fillStyle = "#000"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 300; i++) {
      const b = Math.pow(r(), 3), s = b > 0.6 ? 1.6 : 1;
      g.fillStyle = "rgba(255,255,255," + (0.25 + 0.75 * b).toFixed(3) + ")";
      g.fillRect(r() * 255, r() * 255, s, s);
    }
    return mkTex(c);
  })();

  // glass smudges: handprints, nose prints and wipe marks, mostly at child height
  const smudgeTex = (() => {
    const c = mkCanvas(512, 256), g = c.getContext("2d"), r = rng(909);
    g.fillStyle = "#000"; g.fillRect(0, 0, 512, 256);
    const blob = (x, y, rx, ry, rot, a) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, "rgba(255,255,255," + a + ")"); gr.addColorStop(0.7, "rgba(255,255,255," + a * 0.7 + ")"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.scale(rx, ry); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore();
    };
    for (let i = 0; i < 9; i++) {
      // a hand: palm and five fingers
      const x = 30 + r() * 450, y = 120 + r() * 100, rot = (r() - 0.5) * 1.2, s = 0.7 + r() * 0.5, a = 0.25 + r() * 0.35;
      blob(x, y, 11 * s, 12 * s, rot, a);
      for (let f = 0; f < 5; f++) {
        const fa = rot - 1.05 + f * 0.5;
        blob(x + Math.sin(fa) * 22 * s, y - Math.cos(fa) * 22 * s, 3.2 * s, 8 * s, fa, a * 0.9);
      }
    }
    for (let i = 0; i < 7; i++) blob(r() * 512, 150 + r() * 80, 5 + r() * 4, 4 + r() * 3, r() * 3, 0.3 + r() * 0.3); // noses
    g.lineCap = "round";
    for (let i = 0; i < 6; i++) {
      // long greasy wipes
      g.strokeStyle = "rgba(255,255,255," + (0.05 + r() * 0.08).toFixed(3) + ")"; g.lineWidth = 8 + r() * 16;
      const x = r() * 512, y = 40 + r() * 190;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 60, y - 40 + r() * 80, x + 110 + r() * 80, y + (r() - 0.5) * 60); g.stroke();
    }
    return mkTex(c);
  })();

  // leaves atlas (512 x 512, alpha): A reed blade, B cattail fuzz, C fern frond, D grass tuft, E lily pad, F dry leaf
  const leafCanvas = (() => {
    const c = mkCanvas(512, 512), g = c.getContext("2d"), r = rng(3131);
    g.clearRect(0, 0, 512, 512);
    // A: reed blade, tip up
    let gr = g.createLinearGradient(0, 512, 0, 0);
    gr.addColorStop(0, "#47652a"); gr.addColorStop(0.55, "#6f9440"); gr.addColorStop(1, "#b3bf68");
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(8, 512); g.quadraticCurveTo(2, 220, 32, 2); g.quadraticCurveTo(62, 220, 56, 512); g.closePath(); g.fill();
    g.strokeStyle = "rgba(34,62,20,0.6)"; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 512); g.lineTo(32, 16); g.stroke();
    g.strokeStyle = "rgba(205,225,140,0.35)"; g.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) { const x = 14 + i * 9; g.beginPath(); g.moveTo(x, 512); g.quadraticCurveTo(x, 250, 32, 40); g.stroke(); }
    // B: cattail fuzz
    g.fillStyle = "#5c3a1d"; g.fillRect(64, 0, 64, 128);
    for (let i = 0; i < 260; i++) { g.fillStyle = r() < 0.5 ? "rgba(120,82,44,0.6)" : "rgba(48,28,12,0.6)"; g.fillRect(64 + r() * 62, r() * 126, 2, 3); }
    // C: fern frond, tip up: a rachis with paired, tapering pinnae
    g.strokeStyle = "#3d5a22"; g.lineWidth = 4; g.beginPath(); g.moveTo(256, 512); g.lineTo(256, 8); g.stroke();
    for (let k = 0; k < 24; k++) {
      const y = 496 - k * 20.5, t = k / 23;
      const len = 116 * Math.pow(Math.sin(PI * (0.12 + 0.88 * (1 - t) * 0.92)), 0.8) * (0.55 + 0.45 * (1 - t));
      for (const side of [-1, 1]) {
        const tone = 0.8 + r() * 0.35;
        g.fillStyle = "rgb(" + Math.round(62 * tone) + "," + Math.round(122 * tone) + "," + Math.round(44 * tone) + ")";
        g.beginPath();
        g.moveTo(256, y + 7);
        g.quadraticCurveTo(256 + side * len * 0.55, y + 12, 256 + side * len, y - 16);
        g.quadraticCurveTo(256 + side * len * 0.45, y - 14, 256, y - 8);
        g.closePath(); g.fill();
        g.strokeStyle = "rgba(28,60,18,0.5)"; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(256, y); g.lineTo(256 + side * len * 0.9, y - 13); g.stroke();
      }
    }
    // D: grass tuft
    for (let k = 0; k < 30; k++) {
      const bx = 448 + (r() - 0.5) * 36, tx = 448 + (r() - 0.5) * 118, ty = 14 + r() * 130, tone = 0.75 + r() * 0.5;
      g.fillStyle = "rgb(" + Math.round(88 * tone) + "," + Math.round(132 * tone) + "," + Math.round(52 * tone) + ")";
      g.beginPath(); g.moveTo(bx - 4, 256); g.quadraticCurveTo((bx + tx) / 2 - 6, (256 + ty) / 2, tx, ty); g.quadraticCurveTo((bx + tx) / 2 + 6, (256 + ty) / 2, bx + 4, 256); g.closePath(); g.fill();
    }
    // E: lily pad with its notch and veins
    gr = g.createRadialGradient(448, 320, 4, 448, 320, 58);
    gr.addColorStop(0, "#7fae4c"); gr.addColorStop(0.8, "#4f8a3a"); gr.addColorStop(1, "#3a6c30");
    g.fillStyle = gr; g.beginPath(); g.moveTo(448, 320); g.arc(448, 320, 58, 0.22, TAU - 0.22); g.closePath(); g.fill();
    g.strokeStyle = "rgba(190,225,150,0.4)"; g.lineWidth = 1.5;
    for (let k = 0; k < 11; k++) { const a = 0.4 + (k / 10) * (TAU - 0.8); g.beginPath(); g.moveTo(448, 320); g.lineTo(448 + Math.cos(a) * 54, 320 + Math.sin(a) * 54); g.stroke(); }
    // F: a dry gum leaf
    g.fillStyle = "#a07a45"; g.beginPath(); g.moveTo(394, 448); g.quadraticCurveTo(448, 400, 504, 448); g.quadraticCurveTo(448, 492, 394, 448); g.fill();
    g.strokeStyle = "rgba(70,45,20,0.7)"; g.lineWidth = 2; g.beginPath(); g.moveTo(394, 448); g.lineTo(504, 448); g.stroke();
    return c;
  })();
  const leafTex = mkTex(leafCanvas, { srgb: true, repeat: false, aniso: 4 });
  const leafDerived = deriveMaps(leafCanvas, 2.5);
  const LEAF_UV = (x0, y0, x1, y1) => ({ u0: x0 / 512, u1: x1 / 512, vt: 1 - y0 / 512, vb: 1 - y1 / 512 });
  const UV_REED = LEAF_UV(2, 0, 62, 512), UV_CAT = LEAF_UV(68, 4, 124, 124), UV_FERN = LEAF_UV(132, 4, 380, 512);
  const UV_TUFT = LEAF_UV(386, 4, 510, 256), UV_LILY = LEAF_UV(388, 260, 508, 380), UV_DRY = LEAF_UV(390, 400, 508, 496);

  // backdrop gum trees (two silhouettes side by side, alpha)
  const treeTex = (() => {
    const c = mkCanvas(512, 512), g = c.getContext("2d"), r = rng(555);
    g.clearRect(0, 0, 512, 512);
    for (let t = 0; t < 2; t++) {
      const ox = t * 256, lean = t ? -14 : 10;
      // trunk and limbs, pale like a river red gum
      g.strokeStyle = t ? "#b9ae9c" : "#a89a86"; g.lineCap = "round";
      g.lineWidth = 20; g.beginPath(); g.moveTo(ox + 128, 512); g.quadraticCurveTo(ox + 128 + lean, 360, ox + 128 + lean * 1.6, 230); g.stroke();
      for (let b = 0; b < 6; b++) {
        const y0 = 380 - b * 38, dir = b % 2 ? 1 : -1;
        g.lineWidth = 9 - b; g.beginPath(); g.moveTo(ox + 128 + lean * (1 - y0 / 512) * 1.4, y0);
        g.quadraticCurveTo(ox + 128 + dir * 40, y0 - 50, ox + 128 + dir * (58 + r() * 34), y0 - 92 - r() * 30); g.stroke();
      }
      // foliage: dark masses first, lit clumps on top
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < 110; i++) {
          const a = r() * TAU, rr = Math.sqrt(r());
          const x = ox + 128 + lean + Math.cos(a) * rr * 104, y = 168 + Math.sin(a) * rr * 148 - pass * 10;
          if (y > 400) continue;
          const tone = 0.55 + pass * 0.24 + r() * 0.18;
          g.fillStyle = "rgba(" + Math.round(84 * tone) + "," + Math.round(112 * tone) + "," + Math.round(64 * tone) + ",1)";
          g.beginPath(); g.ellipse(x, y, 9 + r() * 15, 6 + r() * 10, r() * 3, 0, TAU); g.fill();
        }
      }
    }
    return mkTex(c, { srgb: true, repeat: false });
  })();

  // a small fish, side on (u: tail -> head over 0..0.78, v: belly -> back), fins in the last strip
  const fishTex = (() => {
    const c = mkCanvas(256, 128), g = c.getContext("2d"), r = rng(8);
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, "#4f5d34"); gr.addColorStop(0.3, "#8f9460"); gr.addColorStop(0.55, "#d2cba6"); gr.addColorStop(1, "#f3eedd");
    g.fillStyle = gr; g.fillRect(0, 0, 204, 128);
    g.strokeStyle = "rgba(40,48,30,0.28)"; g.lineWidth = 1;
    for (let y = 6; y < 124; y += 9) for (let x = 4 + ((y / 9) % 2) * 5; x < 176; x += 10) { g.beginPath(); g.arc(x, y, 5, -0.9, 0.9); g.stroke(); }
    g.fillStyle = "rgba(30,40,30,0.5)"; g.fillRect(8, 52, 170, 5); // lateral stripe
    g.fillStyle = "rgba(235,120,40,0.4)"; g.fillRect(0, 0, 26, 128); // warm tail root
    g.strokeStyle = "rgba(60,50,40,0.6)"; g.lineWidth = 2; g.beginPath(); g.arc(160, 66, 22, -1.1, 1.1); g.stroke(); // gill cover
    g.fillStyle = "#f6f1df"; g.beginPath(); g.arc(184, 50, 7.5, 0, TAU); g.fill();
    g.fillStyle = "#111"; g.beginPath(); g.arc(185, 50, 4.2, 0, TAU); g.fill();
    g.fillStyle = "#e08a3a"; g.fillRect(204, 0, 52, 128);
    g.strokeStyle = "rgba(120,50,10,0.6)"; g.lineWidth = 1.5;
    for (let y = 4; y < 128; y += 7) { g.beginPath(); g.moveTo(204, y); g.lineTo(256, y + (r() - 0.5) * 4); g.stroke(); }
    return mkTex(c, { srgb: true, repeat: false });
  })();

  // ---- lettering ----
  const FONT_DISPLAY = "Impact, 'Arial Black', 'Helvetica Neue', Arial, sans-serif";
  const FONT_TEXT = "'Trebuchet MS', 'Helvetica Neue', Arial, sans-serif";
  const FONT_HAND = "'Comic Sans MS', 'Chalkboard SE', 'Bradley Hand', cursive";
  function fitText(g, text, maxW, size, font, weight) {
    let s = size;
    for (let i = 0; i < 40; i++) {
      g.font = (weight || "900") + " " + s + "px " + font;
      if (g.measureText(text).width <= maxW) break;
      s = Math.max(8, s * 0.94);
    }
    return s;
  }
  function star(g, x, y, r, col) {
    g.fillStyle = col; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -PI / 2 + (i * PI) / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }
  // a simple, friendly platypus silhouette facing right (bill at +x)
  function drawPlatypus(g, x, y, s, rot, body, bill) {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
    g.fillStyle = body;
    g.beginPath(); g.ellipse(-64, 2, 34, 13, 0.08, 0, TAU); g.fill(); // tail paddle
    g.beginPath(); g.ellipse(0, 0, 52, 24, 0, 0, TAU); g.fill(); // body
    g.beginPath(); g.ellipse(46, -6, 22, 18, -0.15, 0, TAU); g.fill(); // head
    for (const fx of [-26, 24]) { g.beginPath(); g.ellipse(fx, 24, 13, 7, 0.3, 0, TAU); g.fill(); } // feet
    g.fillStyle = bill;
    g.beginPath(); g.ellipse(76, -1, 21, 8.5, 0.04, 0, TAU); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(52, -13, 3.6, 0, TAU); g.fill();
    g.fillStyle = "#111"; g.beginPath(); g.arc(53, -13, 2, 0, TAU); g.fill();
    g.restore();
  }

  // THE poster. Redrawn only by poster.setText().
  const posterCanvas = mkCanvas(1024, 683);
  const posterTex = mkTex(posterCanvas, { srgb: true, repeat: false, aniso: 16 });
  function paintPoster(line1, line2) {
    const g = posterCanvas.getContext("2d"), W = 1024, H = 683, r = rng(2024);
    const bg = g.createRadialGradient(512, 250, 40, 512, 300, 640);
    bg.addColorStop(0, "#3d8be0"); bg.addColorStop(0.55, "#1c4aa6"); bg.addColorStop(1, "#0b1c4d");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // spotlight rays
    g.save(); g.translate(512, 250);
    for (let i = 0; i < 24; i += 2) { g.fillStyle = "rgba(255,255,255,0.07)"; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 900, (i / 24) * TAU, ((i + 1) / 24) * TAU); g.closePath(); g.fill(); }
    g.restore();
    for (let i = 0; i < 26; i++) star(g, 40 + r() * 944, 30 + r() * 300, 5 + r() * 11, r() < 0.5 ? "#ffe27a" : "#ffffff");
    // a hoop, and the star of the show leaping through it
    g.lineWidth = 20; g.strokeStyle = "#f4f1e6"; g.beginPath(); g.ellipse(512, 190, 62, 128, 0, 0, TAU); g.stroke();
    g.setLineDash([36, 36]); g.strokeStyle = "#e23b2e"; g.beginPath(); g.ellipse(512, 190, 62, 128, 0, 0, TAU); g.stroke(); g.setLineDash([]);
    drawPlatypus(g, 512, 186, 1.55, -0.2, "#5a3a22", "#2a2422");
    g.lineWidth = 20; g.strokeStyle = "#f4f1e6"; g.beginPath(); g.ellipse(512, 190, 62, 128, 0, -PI / 2, PI / 2); g.stroke();
    g.setLineDash([36, 36]); g.strokeStyle = "#e23b2e"; g.beginPath(); g.ellipse(512, 190, 62, 128, 0, -PI / 2, PI / 2); g.stroke(); g.setLineDash([]);
    // title
    g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
    const s1 = fitText(g, line1, 900, 132, FONT_DISPLAY);
    g.lineWidth = Math.max(8, s1 * 0.14); g.strokeStyle = "#0a1538"; g.strokeText(line1, 512, 408);
    const tg = g.createLinearGradient(0, 408 - s1 / 2, 0, 408 + s1 / 2);
    tg.addColorStop(0, "#fff3a6"); tg.addColorStop(1, "#ffb82e");
    g.fillStyle = tg; g.fillText(line1, 512, 408);
    // ribbon with the countdown
    g.fillStyle = "#8f1a14"; g.beginPath(); g.moveTo(120, 494); g.lineTo(190, 540); g.lineTo(120, 600); g.lineTo(230, 600); g.lineTo(230, 494); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(904, 494); g.lineTo(834, 540); g.lineTo(904, 600); g.lineTo(794, 600); g.lineTo(794, 494); g.closePath(); g.fill();
    g.fillStyle = "#d9352a"; g.fillRect(190, 476, 644, 112);
    g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(190, 476, 644, 12);
    const s2 = fitText(g, line2, 590, 96, FONT_DISPLAY);
    g.lineWidth = Math.max(5, s2 * 0.1); g.strokeStyle = "#5e0f0b"; g.strokeText(line2, 512, 535);
    g.fillStyle = "#ffffff"; g.fillText(line2, 512, 535);
    g.font = "700 30px " + FONT_TEXT; g.fillStyle = "#d8e6ff"; g.fillText("LIVE AT THE ZOO   •   EVERYONE WELCOME", 512, 634);
    g.lineWidth = 10; g.strokeStyle = "#f4ecd2"; g.strokeRect(14, 14, W - 28, H - 28);
    posterTex.needsUpdate = true;
  }

  // the riddle note
  const riddleTex = (() => {
    const c = mkCanvas(512, 548), g = c.getContext("2d"), r = rng(31);
    g.fillStyle = "#f4ecd4"; g.fillRect(0, 0, 512, 548);
    for (let i = 0; i < 500; i++) { g.fillStyle = "rgba(150,120,70," + (0.03 + r() * 0.07).toFixed(3) + ")"; g.fillRect(r() * 512, r() * 548, 1 + r() * 3, 1 + r() * 3); }
    g.strokeStyle = "rgba(120,100,60,0.22)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 274); g.lineTo(512, 268); g.moveTo(258, 0); g.lineTo(252, 548); g.stroke(); // old folds
    g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#1e2b58";
    const lines = ["WHY DID", "THE PLATYPUS", "CROSS", "THE ROAD?"];
    for (let i = 0; i < 4; i++) {
      const s = fitText(g, lines[i], 440, i === 1 ? 70 : 86, FONT_HAND, "700");
      g.save(); g.translate(256, 110 + i * 100); g.rotate((r() - 0.5) * 0.05); g.font = "700 " + s + "px " + FONT_HAND; g.fillText(lines[i], 0, 0); g.restore();
    }
    drawPlatypus(g, 256, 492, 0.62, 0, "#6b4a2c", "#2c2624");
    g.fillStyle = "rgba(60,40,20,0.55)";
    g.beginPath(); g.arc(28, 28, 5, 0, TAU); g.arc(484, 28, 5, 0, TAU); g.fill(); // pin holes
    g.strokeStyle = "rgba(90,70,40,0.5)"; g.lineWidth = 6; g.strokeRect(3, 3, 506, 542);
    return mkTex(c, { srgb: true, repeat: false, aniso: 16 });
  })();

  // wall signs + the pencilled answer, one atlas (1024 x 1024)
  const signTex = (() => {
    const c = mkCanvas(1024, 1024), g = c.getContext("2d");
    g.clearRect(0, 0, 1024, 1024);
    g.textAlign = "center"; g.textBaseline = "middle";
    // species board (0, 0, 1024, 512)
    g.fillStyle = "#1f4d3f"; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = "#f2e9cf"; g.fillRect(18, 18, 988, 476);
    g.fillStyle = "#1f4d3f"; g.fillRect(18, 18, 988, 132);
    g.fillStyle = "#f6e7a8"; g.font = "900 104px " + FONT_DISPLAY; g.fillText("PLATYPUS", 330, 88);
    g.fillStyle = "#cfe3d2"; g.font = "italic 600 40px " + FONT_TEXT; g.fillText("Ornithorhynchus anatinus", 740, 92);
    drawPlatypus(g, 250, 300, 1.7, 0, "#5a3a22", "#2a2422");
    g.textAlign = "left"; g.fillStyle = "#26352c"; g.font = "700 38px " + FONT_TEXT;
    const facts = ["Lays eggs — and makes milk!", "Finds food with its bill,", "eyes shut, by electricity.", "Tail as tough as a paddle."];
    for (let i = 0; i < facts.length; i++) g.fillText(facts[i], 470, 218 + i * 56);
    g.fillStyle = "#8a6a2a"; g.font = "600 30px " + FONT_TEXT; g.fillText("Home: rivers and creeks of eastern Australia", 60, 452);
    // wayfinding (0, 512, 512, 208)
    g.textAlign = "center";
    g.fillStyle = "#23405e"; g.fillRect(0, 512, 512, 208);
    g.strokeStyle = "#f2e9cf"; g.lineWidth = 6; g.strokeRect(10, 522, 492, 188);
    g.fillStyle = "#ffffff"; g.font = "900 54px " + FONT_DISPLAY;
    g.fillText("← KOALAS", 256, 578); g.fillText("REPTILES →", 256, 656);
    // please don't tap (512, 512, 512, 208)
    g.fillStyle = "#f6d94c"; g.fillRect(512, 512, 512, 208);
    g.strokeStyle = "#2a2a2a"; g.lineWidth = 8; g.strokeRect(522, 522, 492, 188);
    g.fillStyle = "#1c1c1c"; g.font = "900 50px " + FONT_DISPLAY; g.fillText("PLEASE DON'T TAP", 768, 578);
    g.font = "900 50px " + FONT_DISPLAY; g.fillText("ON THE GLASS", 768, 636);
    g.font = "italic 600 28px " + FONT_TEXT; g.fillText("someone might be napping", 768, 686);
    // feeding times (0, 720, 512, 304)
    g.fillStyle = "#7a3b22"; g.fillRect(0, 720, 512, 304);
    g.fillStyle = "#f2e9cf"; g.fillRect(14, 734, 484, 276);
    g.fillStyle = "#7a3b22"; g.font = "900 62px " + FONT_DISPLAY; g.fillText("FEEDING TIMES", 256, 790);
    g.fillStyle = "#26352c"; g.font = "900 78px " + FONT_DISPLAY; g.fillText("10:00  &  3:00", 256, 880);
    g.font = "600 32px " + FONT_TEXT; g.fillText("yabbies, worms and wriggly things", 256, 962);
    // the answer, faint as old pencil (512, 720, 512, 304), transparent ground
    g.fillStyle = "#8f8a82"; g.font = "italic 700 76px " + FONT_HAND;
    g.save(); g.translate(768, 872); g.rotate(-0.05);
    g.fillText("TO GET TO", 0, -52); g.fillText("PLATYFY", 0, 52);
    g.strokeStyle = "#9a958d"; g.lineWidth = 4; g.beginPath(); g.moveTo(-150, 104); g.quadraticCurveTo(0, 116, 150, 100); g.stroke();
    g.restore();
    return mkTex(c, { srgb: true, repeat: false, aniso: 16 });
  })();

  // the keeper door, both faces
  const doorTex = (() => {
    const c = mkCanvas(256, 512), g = c.getContext("2d"), r = rng(12);
    const gr = g.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, "#2f5a45"); gr.addColorStop(0.5, "#3b6d55"); gr.addColorStop(1, "#2c5441");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
    g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 4; g.strokeRect(14, 14, 228, 484);
    for (let i = 0; i < 60; i++) { g.fillStyle = "rgba(20,30,20," + (0.05 + r() * 0.1).toFixed(3) + ")"; g.fillRect(r() * 256, r() * 512, 2 + r() * 12, 1 + r() * 3); }
    g.fillStyle = "#1a2a2e"; g.fillRect(78, 60, 100, 86); // wired window
    g.strokeStyle = "rgba(170,200,200,0.5)"; g.lineWidth = 1;
    for (let i = 0; i <= 10; i++) { g.beginPath(); g.moveTo(78 + i * 10, 60); g.lineTo(78 + i * 10, 146); g.stroke(); }
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(78, 60 + i * 10.75); g.lineTo(178, 60 + i * 10.75); g.stroke(); }
    g.strokeStyle = "#c9c9c0"; g.lineWidth = 5; g.strokeRect(76, 58, 104, 90);
    g.fillStyle = "#f6d94c"; g.fillRect(48, 186, 160, 74);
    g.strokeStyle = "#1c1c1c"; g.lineWidth = 4; g.strokeRect(52, 190, 152, 66);
    g.fillStyle = "#1c1c1c"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "900 30px " + FONT_DISPLAY; g.fillText("KEEPERS", 128, 210); g.fillText("ONLY", 128, 240);
    g.fillStyle = "#b9b9b2"; g.fillRect(0, 440, 256, 72); // kick plate
    g.fillStyle = "#8d8d86"; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(22 + i * 42.4, 452, 3, 0, TAU); g.fill(); }
    g.fillStyle = "#d7d2c2"; g.fillRect(200, 268, 34, 12); // handle
    return mkTex(c, { srgb: true, repeat: false, aniso: 8 });
  })();

  // ----------------------------------------------------------------------------------------------
  // Materials. Every lit material is a MeshStandardMaterial with small splices (see the FS_* / VS_* text).
  // ----------------------------------------------------------------------------------------------
  const U = {
    zTime: { value: 0 }, zCaus: { value: causTex }, zCausK: { value: 1 },
    zTint: { value: new THREE.Color(0.4, 0.78, 0.8) }, zAlarm: { value: new THREE.Vector4(1, 0, 0, 0) }, zLamp: { value: 0 },
  };
  function patch(mat, kind, extra) {
    mat.customProgramCacheKey = () => "zoo-" + kind;
    mat.onBeforeCompile = (sh) => {
      for (const k in U) sh.uniforms[k] = U[k];
      if (extra) for (const k in extra) sh.uniforms[k] = extra[k];
      let vp = "varying vec3 zWorld;\nuniform float zTime;\n", vb = "";
      if (kind === "plant") { vp += "uniform vec3 zWind;\n"; vb = VS_PLANT; }
      else if (kind === "fish") { vp += "attribute vec2 aFish;\n"; vb = VS_FISH; }
      else if (kind === "paper") { vp += "uniform float zCurl;\n"; vb = VS_PAPER; }
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\n" + vp)
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n" + vb)
        .replace("#include <project_vertex>", "#include <project_vertex>\n" + VS_WORLD);
      let fp = FS_PARS, fs = sh.fragmentShader;
      if (kind === "splat") {
        fp += "uniform sampler2D zTex2;\nuniform vec3 zSplat;\n";
        fs = fs.replace("#include <map_fragment>", FS_MAP_WOBBLE)
          .replace("#include <color_fragment>", FS_SPLAT)
          .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n" + FS_SPLAT_ROUGH);
      } else if (kind === "plant") {
        fs = fs.replace("#include <color_fragment>", FS_PLANT);
      }
      sh.fragmentShader = fs
        .replace("#include <common>", "#include <common>\n" + fp)
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n" + (kind === "plant" ? "" : FS_UNDERWATER))
        .replace("#include <opaque_fragment>", FS_GLOW + "\n#include <opaque_fragment>");
    };
    return mat;
  }
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 1, metalness: 0 }, o));

  const terrainMat = patch(std({ map: sandMaps.map, normalMap: sandMaps.normalMap, roughnessMap: sandMaps.roughnessMap, vertexColors: true }), "splat",
    { zTex2: { value: mossTex }, zSplat: { value: new THREE.Vector3(1.7, 0.42, 0.95) } });
  terrainMat.normalScale.set(0.7, 0.7);
  const rockMat = patch(std({ map: rockMaps.map, normalMap: rockMaps.normalMap, roughnessMap: rockMaps.roughnessMap, vertexColors: true }), "splat",
    { zTex2: { value: mossTex }, zSplat: { value: new THREE.Vector3(2.3, 0.42, 0.78) } });
  const barkMat = patch(std({ map: barkMaps.map, normalMap: barkMaps.normalMap, roughnessMap: barkMaps.roughnessMap, vertexColors: true }), "plain");
  const archMat = patch(std({ map: plasterMaps.map, normalMap: plasterMaps.normalMap, roughnessMap: plasterMaps.roughnessMap, vertexColors: true }), "plain");
  archMat.normalScale.set(0.5, 0.5);
  const leafMat = patch(std({ map: leafTex, normalMap: leafDerived.normalMap, roughnessMap: leafDerived.roughnessMap, alphaTest: 0.5, vertexColors: true }), "plant",
    { zWind: { value: new THREE.Vector3(0.05, 0.03, 1.25) } });
  leafMat.normalScale.set(0.6, 0.6);
  const treeMat = patch(std({ map: treeTex, alphaTest: 0.5, vertexColors: true }), "plant", { zWind: { value: new THREE.Vector3(0.22, 0.1, 0.7) } });
  const fishMat = patch(std({ map: fishTex, roughness: 0.35, side: THREE.DoubleSide }), "fish");
  const toyMat = patch(std({ roughness: 0.38, vertexColors: true }), "plain");
  const doorMat = patch(std({ map: doorTex, roughness: 0.55, metalness: 0.2 }), "plain");
  const posterMat = patch(std({ map: posterTex, roughness: 0.6 }), "plain");
  const signMat = patch(std({ map: signTex, roughness: 0.7, alphaTest: 0.35 }), "plain");
  const riddleCurl = { value: 0 };
  const riddleMat = patch(std({ map: riddleTex, roughness: 0.85, side: THREE.DoubleSide }), "paper", { zCurl: riddleCurl });

  const group = new THREE.Group();
  group.name = "zoo";

  // ----------------------------------------------------------------------------------------------
  // Geometry helpers. Winding: Q(a, b, c, d) is counter-clockwise seen from the front.
  // ----------------------------------------------------------------------------------------------
  const newGeo = () => ({ p: [], uv: [], c: [], i: [], nn: null, count: 0 });
  function V(g, x, y, z, u, v, r, gg, b) { g.p.push(x, y, z); g.uv.push(u, v); g.c.push(r, gg, b); return g.count++; }
  const Q = (g, a, b, c, d) => { g.i.push(a, b, c, a, c, d); };
  const T = (g, a, b, c) => { g.i.push(a, b, c); };
  function weldNormals(geo) {
    const p = geo.attributes.position.array, n = geo.attributes.normal.array, map = new Map();
    const key = (i) => Math.round(p[i * 3] * 250) + "," + Math.round(p[i * 3 + 1] * 250) + "," + Math.round(p[i * 3 + 2] * 250);
    const cnt = p.length / 3;
    for (let i = 0; i < cnt; i++) {
      const k = key(i);
      let a = map.get(k);
      if (!a) { a = [0, 0, 0]; map.set(k, a); }
      a[0] += n[i * 3]; a[1] += n[i * 3 + 1]; a[2] += n[i * 3 + 2];
    }
    for (let i = 0; i < cnt; i++) {
      const a = map.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1;
      n[i * 3] = a[0] / l; n[i * 3 + 1] = a[1] / l; n[i * 3 + 2] = a[2] / l;
    }
  }
  function finish(g, weld) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(g.p, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(g.c, 3));
    geo.setIndex(g.i);
    if (g.nn) geo.setAttribute("normal", new THREE.Float32BufferAttribute(g.nn, 3));
    else { geo.computeVertexNormals(); if (weld) weldNormals(geo); }
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
  // an axis-aligned box with world-scaled UVs
  function box(g, x0, y0, z0, x1, y1, z1, r, gg, b, s) {
    s = s || 0.5;
    const f = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, m) => {
      const uv = (x, y, z) => (m === 0 ? [z * s, y * s] : m === 1 ? [x * s, z * s] : [x * s, y * s]);
      const ua = uv(ax, ay, az), ub = uv(bx, by, bz), uc = uv(cx, cy, cz), ud = uv(dx, dy, dz);
      Q(g, V(g, ax, ay, az, ua[0], ua[1], r, gg, b), V(g, bx, by, bz, ub[0], ub[1], r, gg, b), V(g, cx, cy, cz, uc[0], uc[1], r, gg, b), V(g, dx, dy, dz, ud[0], ud[1], r, gg, b));
    };
    f(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 0);
    f(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, 0);
    f(x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0, 1);
    f(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 1);
    f(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 2);
    f(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 2);
  }

  // ----------------------------------------------------------------------------------------------
  // Terrain
  // ----------------------------------------------------------------------------------------------
  const NEST = { x: 9, z: -7.5 };
  const NEST_F = (() => { const l = Math.hypot(9, 7.5); return { x: -9 / l, z: 7.5 / l }; })(); // the burrow faces the middle of the habitat
  function contactShade(x, z, y) {
    if (y < 0) return 1;
    let s = 1;
    for (let i = 0; i < MESAS.length; i++) {
      const m = MESAS[i], dx = x - m.bx, dz = z - m.bz, rr = m.br * 1.5 + 0.2;
      if (dx * dx + dz * dz > rr * rr) continue;
      const q = mesaQFar(m, x, z);
      if (q < 1.45) s = Math.min(s, lerp(0.55, 1, sstep(0.95, 1.45, q)));
    }
    const dw = Math.min(13 - Math.abs(x), z + 10);
    if (dw < 1.3) s = Math.min(s, lerp(0.58, 1, sstep(0.25, 1.3, dw)));
    const lx = x - BRIDGE.ax, lz = z - BRIDGE.az, lt = clamp(lx * BRIDGE.dx + lz * BRIDGE.dz, 0, BRIDGE.len);
    s = Math.min(s, lerp(0.62, 1, sstep(0.2, 0.7, Math.hypot(lx - BRIDGE.dx * lt, lz - BRIDGE.dz * lt))));
    const hx = x - HOLLOW.x, hz = z - HOLLOW.z, ht = clamp(hx * HOLLOW.dx + hz * HOLLOW.dz, -HOLLOW.len / 2, HOLLOW.len / 2);
    s = Math.min(s, lerp(0.5, 1, sstep(0.3, 1.0, Math.hypot(hx - HOLLOW.dx * ht, hz - HOLLOW.dz * ht))));
    s = Math.min(s, lerp(0.6, 1, sstep(0.3, 1.2, Math.hypot(x - NEST.x + NEST_F.x * 0.3, z - NEST.z + NEST_F.z * 0.3))));
    return s;
  }
  {
    const g = newGeo(), X0 = -13.25, Z0 = -10.75, C = 0.25, NX = 106, NZ = 83;
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const x = X0 + i * C, z = Z0 + j * C;
      let y = groundOnly(x, z);
      if (x > 13.02 || z > 9.85) y = -0.4;
      const gw = y < 0.02 ? 0 : grassWeight(x, z);
      const damp = y < 0 ? 0 : 1 - sstep(0.0, 0.15, y);
      V(g, x, y, z, x * 0.36, z * 0.36, gw, damp, contactShade(x, z, y));
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
      T(g, a, c, b); T(g, b, c, d);
    }
    const mesh = new THREE.Mesh(finish(g), terrainMat);
    mesh.name = "zoo-terrain";
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ----------------------------------------------------------------------------------------------
  // Rocks: mesas (lofted from their own height description), the burrow hood, the perimeter walls
  // ----------------------------------------------------------------------------------------------
  function addMesa(g, m) {
    const rnd = rng(m.seed * 7919 + 13);
    const p1 = rnd() * TAU, p2 = rnd() * TAU, p3 = rnd() * TAU;
    const probe = (th) => {
      let lo = 0, hi = m.br * 2 + 1;
      const c = Math.cos(th), s = Math.sin(th);
      for (let k = 0; k < 22; k++) { const mid = (lo + hi) / 2; if (mesaQFar(m, m.cx + c * mid, m.cz + s * mid) < 1) lo = mid; else hi = mid; }
      return lo;
    };
    let per = 0;
    { let pr = probe(0), px = pr, pz = 0; for (let k = 1; k <= 24; k++) { const th = (k / 24) * TAU, r = probe(th), x = Math.cos(th) * r, z = Math.sin(th) * r; per += Math.hypot(x - px, z - pz); px = x; pz = z; } }
    const N = clamp(Math.round(per / 0.3), 14, 52);
    const rad = [], nearW = [];
    for (let j = 0; j < N; j++) {
      const th = (j / N) * TAU, r = probe(th);
      rad.push(r);
      nearW.push(groundOnly(m.cx + Math.cos(th) * (r + 0.15), m.cz + Math.sin(th) * (r + 0.15)) < 0.1);
    }
    const base = m.base !== undefined ? m.base : Math.min(groundOnly(m.cx, m.cz), 0.1) - 0.45;
    const edgeY = mesaTop(m, 1), L = m.layers, uRep = Math.max(2, Math.round(per * 0.45)), vOff = m.seed * 0.137;
    const ts = [], jit = [];
    for (let l = 0; l < L; l++) { ts.push([l / L, l, 0]); ts.push([(l + 0.7) / L, l, 1]); jit.push(0.7 + rnd() * 0.6); }
    ts.push([1, L, 0]);
    const rows = [];
    for (let k = 0; k < ts.length; k++) {
      const t = ts[k][0], l = ts[k][1], sub = ts[k][2];
      const y = base + (edgeY - base) * t;
      const fl = t >= 1 ? 0 : m.flare * ((1 - l / L) * jit[l] + 0.2);
      const un = m.under * Math.pow(1 - t, 0.6);
      const fade = Math.min(1, (1 - t) * 4);
      const mossK = sub ? 0.6 : l > 0 ? 0.85 : 0.3;
      const row = [];
      for (let j = 0; j <= N; j++) {
        const jj = j % N, th = (jj / N) * TAU;
        const nz = m.noise * (Math.sin(th * 3 + p1 + l * 1.3) * 0.5 + Math.sin(th * 7 + p2 - l * 2.1) * 0.3 + Math.sin(th * 13 + p3 + l * 0.7) * 0.2) * fade;
        const s = 1 + fl - un + nz;
        const x = m.cx + Math.cos(th) * rad[jj] * s, z = m.cz + Math.sin(th) * rad[jj] * s;
        const nn = fbm(x * 0.9 + 4, z * 0.9 + y * 0.7, 2, 0, 0);
        const moss = y < 0.03 ? 0 : clamp(m.moss * mossK + (nn - 0.5) * 0.7, 0, 1) * sstep(0.03, 0.25, y);
        let wet = y < 0 ? 0 : m.wet * (0.6 + 0.4 * nn);
        if (nearW[jj] && y >= 0) wet = Math.max(wet, 1 - sstep(0.04, 0.34, y));
        const ao = (0.5 + 0.5 * t) * (sub ? 0.92 : 1) + m.warm * 0.06;
        row.push(V(g, x, y, z, (j / N) * uRep, y * 0.45 + vOff, moss, wet, ao));
      }
      rows.push(row);
    }
    for (let k = 0; k < rows.length - 1; k++) for (let j = 0; j < N; j++) Q(g, rows[k][j], rows[k + 1][j], rows[k + 1][j + 1], rows[k][j + 1]);
    // the top: rings shrinking to the middle, heights straight from the walkable surface
    const fr = [1, 0.86, 0.6, 0.3], caps = [];
    for (let k = 0; k < fr.length; k++) {
      const row = [];
      for (let j = 0; j <= N; j++) {
        const jj = j % N, th = (jj / N) * TAU;
        const x = m.cx + Math.cos(th) * rad[jj] * fr[k], z = m.cz + Math.sin(th) * rad[jj] * fr[k];
        const y = mesaTop(m, k === 0 ? 1 : Math.min(1, mesaQFar(m, x, z)));
        const nn = fbm(x * 1.1 + 9, z * 1.1 + 2, 2, 0, 0);
        const moss = clamp(m.moss * (k === 0 ? 0.9 : 1.15) + (nn - 0.5) * 0.9, 0, 1);
        row.push(V(g, x, y, z, x * 0.45, z * 0.45, moss, m.wet * 0.8, 1 + m.warm * 0.08));
      }
      caps.push(row);
    }
    for (let k = 0; k < fr.length - 1; k++) for (let j = 0; j < N; j++) Q(g, caps[k][j], caps[k + 1][j], caps[k + 1][j + 1], caps[k][j + 1]);
    const cy = mesaTop(m, Math.min(1, mesaQFar(m, m.cx, m.cz)));
    const ci = V(g, m.cx, cy, m.cz, m.cx * 0.45, m.cz * 0.45, clamp(m.moss * 1.1, 0, 1), m.wet * 0.8, 1 + m.warm * 0.08);
    const last = caps[fr.length - 1];
    for (let j = 0; j < N; j++) T(g, last[j], ci, last[j + 1]);
  }

  // the burrow mouth: a rock hood with a dark earth tunnel running back into the mound
  function addHood(g, cx, cy, cz, dx, dz, depth, Ro, Ri) {
    const sx = -dz, sz = dx; // side = d x up
    const K = 5, M = 12, rnd = rng(606);
    const outer = [], inner = [];
    for (let k = 0; k <= K; k++) {
      const t = k / K, ox = cx + dx * depth * t, oz = cz + dz * depth * t;
      const ro = Ro * (1 + 0.16 * Math.sin(t * 2.6 + 0.4)) + (k === 0 ? -0.06 : 0), ri = Ri * (1 - 0.25 * t);
      const ra = [], rb = [];
      for (let j = 0; j <= M; j++) {
        const ph = (j / M) * PI, c = Math.cos(ph), s = Math.sin(ph);
        const bump = 1 + (rnd() - 0.5) * 0.16;
        const yo = cy + s * ro * bump * 0.92;
        ra.push(V(g, ox + sx * c * ro * bump, yo, oz + sz * c * ro * bump, (j / M) * 3, t * depth * 0.5, clamp(0.5 + s * 0.4 + (rnd() - 0.5) * 0.4, 0, 1), 0, 0.72 + 0.28 * s));
        rb.push(V(g, ox + sx * c * ri, cy + s * ri * 0.95, oz + sz * c * ri, (j / M) * 2, t * depth * 0.5, 0, 0, lerp(0.3, 0.03, t)));
      }
      outer.push(ra); inner.push(rb);
    }
    for (let k = 0; k < K; k++) for (let j = 0; j < M; j++) {
      Q(g, outer[k][j], outer[k + 1][j], outer[k + 1][j + 1], outer[k][j + 1]);
      Q(g, inner[k][j], inner[k][j + 1], inner[k + 1][j + 1], inner[k + 1][j]);
    }
    // the lip (front face) and the black end of the tunnel
    const fo = [], fi = [];
    for (let j = 0; j <= M; j++) {
      const a = outer[0][j] * 3, b = inner[0][j] * 3;
      fo.push(V(g, g.p[a], g.p[a + 1], g.p[a + 2], j * 0.3, 0.6, 0.35, 0, 0.8));
      fi.push(V(g, g.p[b], g.p[b + 1], g.p[b + 2], j * 0.3, 0.3, 0.1, 0, 0.42));
    }
    for (let j = 0; j < M; j++) Q(g, fo[j], fo[j + 1], fi[j + 1], fi[j]);
    const ex = cx + dx * depth, ez = cz + dz * depth;
    const ce = V(g, ex, cy + Ri * 0.3, ez, 0, 0, 0, 0, 0.02);
    for (let j = 0; j < M; j++) T(g, inner[K][j], inner[K][j + 1], ce);
  }

  // perimeter rock walls (west, south, east): a stepped, bulging curtain 3.3 - 4.8 m tall with a mossy top
  function addWalls(g) {
    const pts = [], ds = 0.33;
    const add = (x, z, nx, nz, leg) => pts.push({ x, z, nx, nz, leg, s: 0 });
    for (let z = 10.2; z > -8.5; z -= ds) add(-13, z, 1, 0, 0);
    for (let a = 0; a <= 1.0001; a += 0.125) { const th = PI + (a * PI) / 2; add(-11.5 + Math.cos(th) * 1.5, -8.5 + Math.sin(th) * 1.5, -Math.cos(th), -Math.sin(th), 1); }
    for (let x = -11.5 + ds; x < 11.5; x += ds) add(x, -10, 0, 1, 2);
    for (let a = 0; a <= 1.0001; a += 0.125) { const th = 1.5 * PI + (a * PI) / 2; add(11.5 + Math.cos(th) * 1.5, -8.5 + Math.sin(th) * 1.5, -Math.cos(th), -Math.sin(th), 3); }
    for (let z = -8.5 + ds; z <= 10.2; z += ds) add(13, z, -1, 0, 4);
    for (let i = 1; i < pts.length; i++) pts[i].s = pts[i - 1].s + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const R = 10, L = 5, cols = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const H = 3.3 + 1.5 * fbm(p.s * 0.11 + 2, 0.5, 3, 0, 0) + 0.5 * Math.sin(p.s * 0.21 + 1);
      const toe = 0.3 + 0.3 * vnoise(p.s * 0.4, 3.3, 0, 0);
      const dFall = Math.hypot(p.x - FALL.x, p.z - FALL.z);
      const col = [];
      for (let j = 0; j <= R + 3; j++) {
        let y, w, moss, ao;
        if (j <= R) {
          const t = j / R, lay = Math.min(L - 1, Math.floor(t * L));
          y = -0.3 + (H + 0.3) * t;
          w = toe * Math.pow(1 - t, 1.5) + 0.34 * (1 - (lay + sstep(0.72, 1, t * L - lay)) / L)
            + (fbm(p.s * 0.8, t * 3.2 + lay * 5.7, 3, 0, 0) - 0.5) * 0.5 * (0.35 + 0.65 * (1 - t));
          w = clamp(w, -0.25, 0.68);
          const nn = fbm(p.s * 0.6 + 7, t * 4, 2, 0, 0);
          moss = clamp(0.25 + 0.45 * t * t + (nn - 0.5) * 1.1, 0, 1) * sstep(0.2, 0.7, y);
          ao = 0.52 + 0.48 * t;
        } else {
          const k = j - R;
          y = k === 1 ? H + 0.07 : k === 2 ? H - 0.12 : H - 1.3;
          w = k === 1 ? -0.5 : k === 2 ? -1.7 : -2.5;
          moss = 0.9; ao = 1;
        }
        const wet = y > 0 ? clamp(1.1 - dFall / 3.2, 0, 0.8) : 0;
        col.push(V(g, p.x + p.nx * w, y, p.z + p.nz * w, p.s * 0.45, y * 0.45 + (j > R ? (j - R) * 0.4 : 0), moss, wet, ao));
      }
      cols.push(col);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const zm = (pts[i].z + pts[i + 1].z) / 2;
      const door = pts[i].leg === 4 && zm > -2.95 && zm < -1.05;
      for (let j = 0; j < R + 3; j++) {
        if (door && g.p[cols[i][j] * 3 + 1] < 2.3) continue; // the keeper door's opening
        Q(g, cols[i + 1][j], cols[i + 1][j + 1], cols[i][j + 1], cols[i][j]);
      }
    }
  }
  {
    const gA = newGeo(), gB = newGeo();
    for (const m of MESAS) addMesa(m.cast ? gA : gB, m);
    const hoodBack = 1.25, hoodFront = 0.4;
    addHood(gA, NEST.x + NEST_F.x * hoodFront, groundAt(NEST.x, NEST.z) - 0.06, NEST.z + NEST_F.z * hoodFront, -NEST_F.x, -NEST_F.z, hoodFront + hoodBack, 0.98, 0.62);
    addWalls(gB);
    const a = new THREE.Mesh(finish(gA, true), rockMat);
    a.name = "zoo-rocks"; a.castShadow = true; a.receiveShadow = true;
    const b = new THREE.Mesh(finish(gB, true), rockMat);
    b.name = "zoo-rockwork"; b.receiveShadow = true;
    group.add(a, b);
  }

  // ----------------------------------------------------------------------------------------------
  // Logs (one mesh): the bridge, the walk-through hollow log, the sunken log, a drift log on the west shore
  // ----------------------------------------------------------------------------------------------
  function addLog(g, ax, ay, az, bx, by, bz, ro, ri, seed) {
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    dx /= len; dy /= len; dz /= len;
    const hl = Math.hypot(dx, dz) || 1;
    const sx = -dz / hl, sz = dx / hl; // side = d x up (level)
    const ux = -sz * dy, uy = sz * dx - sx * dz, uz = sx * dy; // up' = side x d
    const K = Math.max(3, Math.ceil(len / 0.3)), M = 12, rnd = rng(seed);
    const ph = rnd() * TAU;
    const ring = (t, r, tone, flip, uo) => {
      const row = [], cx = ax + dx * len * t, cy = ay + dy * len * t, cz = az + dz * len * t;
      for (let j = 0; j <= M; j++) {
        const a = (j / M) * TAU, c = Math.cos(a), s = Math.sin(a);
        const rr = r * (1 + 0.05 * Math.sin(a * 3 + t * 5 + ph) + 0.04 * Math.sin(t * 9 + ph * 2));
        const lit = 0.72 + 0.28 * (flip ? 0.2 : s * 0.5 + 0.5);
        const mossy = !flip && s > 0.35 && vnoise(t * len * 2 + seed, a * 1.5, 0, 0) > 0.45 ? 1 : 0;
        row.push(V(g, cx + (sx * c + ux * s) * rr, cy + uy * s * rr, cz + (sz * c + uz * s) * rr, (j / M) * 2 + uo, t * len * 0.5,
          tone[0] * lit * (mossy ? 0.72 : 1), tone[1] * lit * (mossy ? 1.05 : 1), tone[2] * lit * (mossy ? 0.6 : 1)));
      }
      return row;
    };
    const BARK = [1, 1, 1], DARK = [0.34, 0.3, 0.26], CUT = [1.7, 1.45, 1.05];
    const outer = [];
    for (let k = 0; k <= K; k++) outer.push(ring(k / K, ro, BARK, false, 0));
    for (let k = 0; k < K; k++) for (let j = 0; j < M; j++) Q(g, outer[k][j], outer[k + 1][j], outer[k + 1][j + 1], outer[k][j + 1]);
    if (ri) {
      const inner = [];
      for (let k = 0; k <= K; k++) inner.push(ring(k / K, ri, DARK, true, 0.3));
      for (let k = 0; k < K; k++) for (let j = 0; j < M; j++) Q(g, inner[k][j], inner[k][j + 1], inner[k + 1][j + 1], inner[k + 1][j]);
      const o0 = ring(0, ro, CUT, true, 0), i0 = ring(0, ri, CUT, true, 0), o1 = ring(1, ro, CUT, true, 0), i1 = ring(1, ri, CUT, true, 0);
      for (let j = 0; j < M; j++) { Q(g, o0[j], o0[j + 1], i0[j + 1], i0[j]); Q(g, o1[j], i1[j], i1[j + 1], o1[j + 1]); }
    } else {
      const o0 = ring(0, ro, CUT, true, 0), o1 = ring(1, ro, CUT, true, 0);
      const c0 = V(g, ax, ay, az, 0.5, 0, CUT[0], CUT[1], CUT[2]), c1 = V(g, bx, by, bz, 0.5, 0, CUT[0], CUT[1], CUT[2]);
      for (let j = 0; j < M; j++) { T(g, o0[j], o0[j + 1], c0); T(g, o1[j + 1], o1[j], c1); }
    }
  }
  const colliders = [];
  {
    const g = newGeo();
    addLog(g, BRIDGE.ax - BRIDGE.dx * 0.15, BRIDGE.y + 0.02, BRIDGE.az - BRIDGE.dz * 0.15, BRIDGE.bx + BRIDGE.dx * 0.15, BRIDGE.y - 0.02, BRIDGE.bz + BRIDGE.dz * 0.15, BRIDGE.r, 0, 51);
    const hy = groundAt(HOLLOW.x, HOLLOW.z) + 0.42, hh = HOLLOW.len / 2;
    addLog(g, HOLLOW.x - HOLLOW.dx * hh, hy, HOLLOW.z - HOLLOW.dz * hh, HOLLOW.x + HOLLOW.dx * hh, hy + 0.03, HOLLOW.z + HOLLOW.dz * hh, HOLLOW.ro, HOLLOW.ri, 52);
    const sh = SUNK.len / 2;
    addLog(g, SUNK.x - SUNK.dx * sh, SUNK.y - 0.04, SUNK.z - SUNK.dz * sh, SUNK.x + SUNK.dx * sh, SUNK.y + 0.04, SUNK.z + SUNK.dz * sh, SUNK.ro, SUNK.ri, 53);
    addLog(g, -11.6, 0.28, 3.1, -9.5, -0.12, 3.95, 0.2, 0, 54);
    addLog(g, 8.9, 0.34, 5.6, 10.3, 0.3, 6.5, 0.17, 0, 55);
    const mesh = new THREE.Mesh(finish(g, true), barkMat);
    mesh.name = "zoo-logs"; mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    // the hollow log's walls: you go through it, not across it
    for (let k = 0; k <= 8; k++) {
      const t = (k / 8 - 0.5) * (HOLLOW.len - 0.1);
      for (const side of [-1, 1]) colliders.push({ x: HOLLOW.x + HOLLOW.dx * t - HOLLOW.dz * 0.62 * side, z: HOLLOW.z + HOLLOW.dz * t + HOLLOW.dx * 0.62 * side, r: 0.05, on: true });
    }
    // the hood's two feet
    for (const side of [-1, 1]) colliders.push({ x: NEST.x + NEST_F.x * 0.1 - NEST_F.z * 0.86 * side, z: NEST.z + NEST_F.z * 0.1 + NEST_F.x * 0.86 * side, r: 0.12, on: true });
  }

  // ----------------------------------------------------------------------------------------------
  // Plants: instanced cards, alpha-tested, swaying in the vertex shader. vertex colour = (sway, phase, shade)
  // ----------------------------------------------------------------------------------------------
  const newCard = () => ({ p: [], uv: [], c: [], i: [], nn: [], count: 0 });
  function CV(g, x, y, z, u, v, sway, phase, shade, nx, ny, nz) {
    const l = Math.hypot(nx, ny, nz) || 1;
    g.p.push(x, y, z); g.uv.push(u, v); g.c.push(sway, phase, shade); g.nn.push(nx / l, ny / l, nz / l);
    return g.count++;
  }
  const CQ = (g, a, b, c, d) => { g.i.push(a, b, c, a, c, d, a, c, b, a, d, c); }; // both faces, one (upward) normal
  // a strip of `segs` quads along a curve. at(t) -> [x, y, z], side vector (sx, sz) * halfWidth(t)
  function strip(g, segs, at, sx, sz, hw, uv, swayK, phase, shade0, shade1) {
    let prevL = -1, prevR = -1;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs, p = at(t), w = hw(t);
      const v = lerp(uv.vb, uv.vt, t), sh = lerp(shade0, shade1, t);
      const nx = p[0] * 0.6, nz = p[2] * 0.6;
      const l = CV(g, p[0] - sx * w, p[1], p[2] - sz * w, uv.u0, v, swayK * t * t, phase, sh, nx, 1, nz);
      const r = CV(g, p[0] + sx * w, p[1], p[2] + sz * w, uv.u1, v, swayK * t * t, phase, sh, nx, 1, nz);
      if (s > 0) CQ(g, prevL, prevR, r, l);
      prevL = l; prevR = r;
    }
  }
  const reedGeo = (() => {
    const g = newCard(), rnd = rng(71);
    for (let b = 0; b < 6; b++) {
      const a = (b / 6) * TAU + rnd() * 0.7, lean = 0.06 + rnd() * 0.2, h = 0.72 + rnd() * 0.28, ph = rnd();
      const ca = Math.cos(a), sa = Math.sin(a);
      strip(g, 4, (t) => [ca * (0.03 + lean * t * t), h * t, sa * (0.03 + lean * t * t)], -sa, ca, (t) => 0.034 * (1 - t * 0.5), UV_REED, 1, ph, 0.7, 1.05);
      if (b % 3 === 0) {
        // a cattail head on a stem
        const sx = ca * 0.02, sz = sa * 0.02, y0 = h * 0.86, y1 = h * 1.04, r = 0.02, rows = [[], []];
        for (let j = 0; j <= 5; j++) {
          const q = (j / 5) * TAU, c = Math.cos(q), s = Math.sin(q);
          rows[0].push(CV(g, sx + c * r, y0, sz + s * r, lerp(UV_CAT.u0, UV_CAT.u1, j / 5), UV_CAT.vb, 0.85, ph, 1, c, 0.4, s));
          rows[1].push(CV(g, sx + c * r, y1, sz + s * r, lerp(UV_CAT.u0, UV_CAT.u1, j / 5), UV_CAT.vt, 1, ph, 1, c, 0.4, s));
        }
        for (let j = 0; j < 5; j++) g.i.push(rows[0][j], rows[1][j], rows[1][j + 1], rows[0][j], rows[1][j + 1], rows[0][j + 1]);
        strip(g, 1, (t) => [sx, lerp(0, y0, t), sz], -sa, ca, () => 0.006, UV_REED, 0.8, ph, 0.7, 0.8);
      }
    }
    return finish(g);
  })();
  const fernGeo = (() => {
    const g = newCard(), rnd = rng(72);
    for (let f = 0; f < 7; f++) {
      const a = (f / 7) * TAU + rnd() * 0.5, len = 0.5 + rnd() * 0.22, lift = 0.55 + rnd() * 0.35, ph = rnd();
      const ca = Math.cos(a), sa = Math.sin(a);
      strip(g, 4, (t) => [ca * len * (0.04 + t), len * (lift * t - 0.62 * t * t) + 0.02, sa * len * (0.04 + t)], -sa, ca, () => 0.12, UV_FERN, 0.7, ph, 0.62, 1.08);
    }
    return finish(g);
  })();
  const tuftGeo = (() => {
    const g = newCard();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * PI + 0.3, ca = Math.cos(a), sa = Math.sin(a);
      strip(g, 1, (t) => [0, 0.3 * t, 0], ca, sa, () => 0.17, UV_TUFT, 1, k * 0.21, 0.7, 1.05);
    }
    return finish(g);
  })();
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpE = new THREE.Euler();
  function instanced(geo, mat, list, name) {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      tmpE.set(o.tx || 0, o.yaw, o.tz || 0, "YXZ");
      tmpQ.setFromEuler(tmpE);
      tmpP.set(o.x, o.y, o.z);
      tmpS.set(o.s, o.sy || o.s, o.s);
      mesh.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.name = name;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  {
    const rnd = rng(1001);
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
    const clear = (x, z) => rockAt(x, z) < -5 && Math.abs(x) < 12.3 && z > -9.4 && z < 9.5;
    // reeds: the big stand at the pool's north-west corner (a hiding place), then along the west and south shores
    const reeds = [];
    for (let tries = 0; reeds.length < 46 && tries < 600; tries++) {
      const x = -10.5 + gauss() * 1.25, z = 5.5 + gauss() * 1.15, y = groundAt(x, z);
      if (!clear(x, z) || y < -0.4) continue;
      reeds.push({ x, y: y - 0.04, z, yaw: rnd() * TAU, s: 1.15 + rnd() * 0.5, sy: 1.5 + rnd() * 0.75, tx: (rnd() - 0.5) * 0.12 });
    }
    for (let tries = 0; reeds.length < 118 && tries < 3000; tries++) {
      const a = PI * 0.45 + rnd() * PI * 1.25, rr = 1.0 + (rnd() - 0.3) * 0.16;
      let x = POOL.x + Math.cos(a) * POOL.rx * rr, z = POOL.z + Math.sin(a) * POOL.rz * rr;
      if (tries % 4 === 0) { const p = STREAM[1 + ((rnd() * 5) | 0)], sd = rnd() < 0.5 ? -1 : 1; x = p[0] + sd * (0.55 + rnd() * 0.45); z = p[1] + (rnd() - 0.5) * 1.1; }
      const y = groundAt(x, z);
      if (!clear(x, z) || y < -0.3 || y > 0.2 || Math.hypot(x + 7.5, z + 3.2) < 1.5) continue;
      reeds.push({ x, y: y - 0.04, z, yaw: rnd() * TAU, s: 0.9 + rnd() * 0.5, sy: 1.0 + rnd() * 0.8, tx: (rnd() - 0.5) * 0.12 });
    }
    instanced(reedGeo, leafMat, reeds, "zoo-reeds");
    // ferns: the thicket at (11, 3) (a hiding place), then tucked against rocks and walls
    const ferns = [];
    for (let tries = 0; ferns.length < 30 && tries < 400; tries++) {
      const x = 11 + gauss() * 1.25, z = 3 + gauss() * 1.3;
      if (!clear(x, z)) continue;
      ferns.push({ x, y: groundAt(x, z) - 0.02, z, yaw: rnd() * TAU, s: 0.95 + rnd() * 0.75 });
    }
    for (let tries = 0; ferns.length < 84 && tries < 4000; tries++) {
      let x, z;
      if (tries % 3 === 0) { const m = MESAS[(rnd() * MESAS.length) | 0], a = rnd() * TAU; x = m.bx + Math.cos(a) * (m.br * 0.75 + 0.2); z = m.bz + Math.sin(a) * (m.br * 0.75 + 0.2); }
      else if (rnd() < 0.5) { x = (rnd() < 0.5 ? -1 : 1) * (11.7 + rnd() * 0.5); z = -9 + rnd() * 18; }
      else { x = -12 + rnd() * 24; z = -9.3 + rnd() * 0.6; }
      const y = groundAt(x, z);
      if (!clear(x, z) || y < 0.12 || grassWeight(x, z) < 0.25 || (x > 11 && Math.abs(z + 2) < 1.6)) continue;
      ferns.push({ x, y: y - 0.02, z, yaw: rnd() * TAU, s: 0.7 + rnd() * 0.7 });
    }
    instanced(fernGeo, leafMat, ferns, "zoo-ferns");
    const tufts = [];
    for (let tries = 0; tufts.length < 280 && tries < 9000; tries++) {
      const x = -12.2 + rnd() * 24.4, z = -9.3 + rnd() * 18.8, y = groundAt(x, z);
      if (!clear(x, z) || y < 0.1 || grassWeight(x, z) < 0.35 + rnd() * 0.3) continue;
      tufts.push({ x, y: y - 0.02, z, yaw: rnd() * TAU, s: 0.7 + rnd() * 0.9, sy: 0.6 + rnd() * 1.0 });
    }
    instanced(tuftGeo, leafMat, tufts, "zoo-grass");

    // pebbles along the waterline and in the stream bed
    const pg = newGeo(), prnd = rng(73);
    const rowsP = [];
    for (let k = 0; k <= 4; k++) {
      const lat = (k / 4) * PI - PI / 2, row = [];
      for (let j = 0; j <= 8; j++) {
        const lo = (j / 8) * TAU, b = 1 + (k > 0 && k < 4 ? (prnd() - 0.5) * 0.22 : 0);
        const jj = j === 8 ? 0 : j;
        if (j === 8) { const src = row[0] * 3; row.push(V(pg, pg.p[src], pg.p[src + 1], pg.p[src + 2], 1.2, k * 0.3, 0, 0.35, 0.95)); }
        else row.push(V(pg, Math.cos(lo) * Math.cos(lat) * b, Math.sin(lat) * 0.6 * b, Math.sin(lo) * Math.cos(lat) * b, (jj / 8) * 1.2, k * 0.3, 0, 0.35, 0.95));
      }
      rowsP.push(row);
    }
    for (let k = 0; k < 4; k++) for (let j = 0; j < 8; j++) Q(pg, rowsP[k][j], rowsP[k + 1][j], rowsP[k + 1][j + 1], rowsP[k][j + 1]);
    const pebbles = [];
    for (let tries = 0; pebbles.length < 130 && tries < 9000; tries++) {
      const x = -12 + rnd() * 12.5, z = -9 + rnd() * 15.5, y = groundAt(x, z);
      if (y > 0.13 || y < -0.5 || rockAt(x, z) > -5) continue;
      const s = 0.04 + rnd() * rnd() * 0.13;
      pebbles.push({ x, y: y + s * 0.2, z, yaw: rnd() * TAU, s, sy: s * (0.6 + rnd() * 0.5), tx: (rnd() - 0.5) * 0.5 });
    }
    instanced(finish(pg, true), rockMat, pebbles, "zoo-pebbles");

    // leaf litter in the burrow and under the trees' side, lily pads on the pool: flat cards, one mesh
    const lg = newCard();
    const flat = (x, y, z, size, yaw, uv, shade) => {
      const c = Math.cos(yaw) * size, s = Math.sin(yaw) * size;
      const a = CV(lg, x - c + s, y, z - s - c, uv.u0, uv.vb, 0, 0, shade, 0, 1, 0), b = CV(lg, x + c + s, y, z + s - c, uv.u1, uv.vb, 0, 0, shade, 0, 1, 0);
      const d = CV(lg, x - c - s, y, z - s + c, uv.u0, uv.vt, 0, 0, shade, 0, 1, 0), e = CV(lg, x + c - s, y, z + s + c, uv.u1, uv.vt, 0, 0, shade, 0, 1, 0);
      lg.i.push(a, d, b, b, d, e);
    };
    for (let i = 0; i < 46; i++) {
      const a = rnd() * TAU, rr = Math.sqrt(rnd()) * 0.95, x = NEST.x - NEST_F.x * 0.25 + Math.cos(a) * rr, z = NEST.z - NEST_F.z * 0.25 + Math.sin(a) * rr * 0.9;
      flat(x, groundAt(x, z) + 0.012 + i * 0.0006, z, 0.1 + rnd() * 0.07, rnd() * TAU, UV_DRY, 0.75 + rnd() * 0.4);
    }
    for (let tries = 0, n = 0; n < 40 && tries < 900; tries++) {
      const x = -12 + rnd() * 24, z = -9.2 + rnd() * 18.4, y = groundAt(x, z);
      if (!clear(x, z) || y < 0.14 || grassWeight(x, z) < 0.3) continue;
      flat(x, y + 0.014, z, 0.07 + rnd() * 0.06, rnd() * TAU, UV_DRY, 0.7 + rnd() * 0.5); n++;
    }
    for (let tries = 0, n = 0; n < 15 && tries < 900; tries++) {
      const a = PI * 0.55 + rnd() * PI * 0.95, rr = 0.62 + rnd() * 0.3;
      const x = POOL.x + Math.cos(a) * POOL.rx * rr, z = POOL.z + Math.sin(a) * POOL.rz * rr;
      if (groundAt(x, z) > -0.25 || rockAt(x, z) > -5 || Math.hypot(x + 5.5, z - 4.5) < 1.3) continue;
      flat(x, 0.012 + n * 0.0007, z, 0.16 + rnd() * 0.12, rnd() * TAU, UV_LILY, 0.9 + rnd() * 0.25); n++;
    }
    const litter = new THREE.Mesh(finish(lg), leafMat);
    litter.name = "zoo-litter"; litter.receiveShadow = true;
    group.add(litter);

    // gum trees beyond the walls: crossed cards
    const tg = newCard();
    const tree = (x, z, h) => {
      const w = h * 0.62, col = rnd() < 0.5 ? 0 : 0.5, ph = rnd(), yaw = rnd() * PI, shade = 0.75 + rnd() * 0.4;
      for (let k = 0; k < 2; k++) {
        const a = yaw + (k * PI) / 2, c = (Math.cos(a) * w) / 2, s = (Math.sin(a) * w) / 2;
        const nx = -x * 0.03, nz = -z * 0.03;
        const p0 = CV(tg, x - c, -0.3, z - s, col + 0.004, 0.002, 0, ph, shade * 0.8, nx, 1, nz), p1 = CV(tg, x + c, -0.3, z + s, col + 0.496, 0.002, 0, ph, shade * 0.8, nx, 1, nz);
        const p2 = CV(tg, x + c, h, z + s, col + 0.496, 0.998, 1, ph, shade, nx, 1, nz), p3 = CV(tg, x - c, h, z - s, col + 0.004, 0.998, 1, ph, shade, nx, 1, nz);
        CQ(tg, p0, p1, p2, p3);
      }
    };
    for (let i = 0; i < 16; i++) tree(-15.6 - rnd() * 7, -14 + i * 2.3 + rnd() * 1.4, 7.5 + rnd() * 4);
    for (let i = 0; i < 18; i++) tree(-18 + i * 2.2 + rnd() * 1.4, -12.6 - rnd() * 7, 7.5 + rnd() * 4.5);
    for (let i = 0; i < 14; i++) tree(18.2 + rnd() * 7, -14 + i * 2.6 + rnd() * 1.4, 7.5 + rnd() * 4);
    for (let i = 0; i < 16; i++) tree(-19 + i * 2.5 + rnd() * 1.4, 17 + rnd() * 7, 8.5 + rnd() * 4.5);
    const trees = new THREE.Mesh(finish(tg), treeMat);
    trees.name = "zoo-trees";
    group.add(trees);
  }

  // ----------------------------------------------------------------------------------------------
  // Architecture: glass frame, visitor hall, service path, door portal, lamp fittings - one mesh
  // ----------------------------------------------------------------------------------------------
  const LAMP_X = [-9, -3, 3, 9], HALL_LAMP_X = [-12, -8, -4, 0, 4, 8, 12];
  const POSTER = { x: 5, y: 2.4, z: 14.9, w: 1.8, h: 1.2 }, RIDDLE = { x: 6.3, y: 1.75, z: 14.9, w: 0.56, h: 0.6 };
  {
    const g = newGeo();
    const CONC = [0.66, 0.64, 0.6], METAL = [0.13, 0.13, 0.14], WALL = [0.86, 0.83, 0.76], DARK = [0.05, 0.05, 0.06];
    const B = (x0, y0, z0, x1, y1, z1, c, s) => box(g, x0, y0, z0, x1, y1, z1, c[0], c[1], c[2], s);
    // visitor hall
    B(-17.2, -0.2, 10.3, 17.2, HALL_Y, 15.0, [0.62, 0.6, 0.56], 1);
    B(-17.2, HALL_Y, 14.92, 17.2, 3.75, 15.3, WALL);
    B(-17.2, HALL_Y, 14.9, 17.2, 1.05, 14.92, [0.25, 0.42, 0.4]);
    B(-17.2, 3.75, 10.45, 17.2, 3.95, 15.3, [0.42, 0.44, 0.42]);
    B(-17.2, 3.45, 10.45, 17.2, 3.75, 10.6, [0.18, 0.3, 0.24]);
    for (const sx of [-1, 1]) {
      // hall ends: a wall with a wide opening to the next exhibit / the service path
      const x0 = sx < 0 ? -13.6 : 13.45, x1 = x0 + 0.15;
      B(x0, HALL_Y, 10.65, x1, 3.75, 11.4, CONC);
      B(x0, 2.6, 11.4, x1, 3.75, 14.6, CONC);
      B(x0, HALL_Y, 14.6, x1, 3.75, 14.92, CONC);
      // the pillar where the glass meets the rock
      B(sx < 0 ? -13.75 : 12.98, -0.2, 9.7, sx < 0 ? -12.98 : 13.75, 4.6, 10.65, CONC);
    }
    B(-17.4, HALL_Y, 10.3, -17.2, 3.75, 15.3, DARK);
    B(-17.2, HALL_Y, 10.3, -13.75, 3.75, 10.45, DARK);
    // glass: kerb, rails, posts every 2 m
    B(-13.05, -0.3, 9.78, 13.05, 0.34, 10.3, [0.5, 0.48, 0.44]);
    B(-13, 0.34, 9.95, 13, 0.39, 10.05, METAL);
    B(-13, 2.38, 9.93, 13, 2.46, 10.07, METAL);
    for (let x = -12; x <= 12; x += 2) B(x - 0.04, 0.39, 9.95, x + 0.04, 2.38, 10.05, METAL);
    for (const x of LAMP_X) B(x - 0.12, 2.46, 9.84, x + 0.12, 2.56, 10.02, METAL);
    for (const x of HALL_LAMP_X) B(x - 0.25, 3.66, 12.45, x + 0.25, 3.75, 12.75, [0.97, 0.95, 0.86]);
    // service path east of the habitat, behind the rockwork
    B(13.6, -0.2, -10.7, 16.6, HALL_Y, 10.3, [0.5, 0.5, 0.48], 1);
    B(16.5, HALL_Y, -10.7, 16.8, 3.2, 15.3, [0.55, 0.6, 0.52]);
    B(13.6, HALL_Y, -11.0, 16.8, 3.2, -10.7, [0.55, 0.6, 0.52]);
    B(13.45, -0.2, -10.7, 13.65, 3.0, -3.0, CONC);
    B(13.45, -0.2, -1.0, 13.65, 3.0, 9.7, CONC);
    // keeper door portal through the rock
    const PORT = [0.6, 0.6, 0.57];
    B(12.3, -0.2, -3.0, 13.65, 2.5, -2.6, PORT);
    B(12.3, -0.2, -1.4, 13.65, 2.5, -1.0, PORT);
    B(12.3, 2.12, -3.0, 13.65, 2.95, -1.0, PORT);
    B(12.3, -0.2, -2.6, 13.65, 0.13, -1.4, [0.5, 0.5, 0.48]);
    B(12.2, 2.62, -2.12, 12.3, 2.74, -1.88, [0.97, 0.95, 0.86]);
    B(12.16, 2.8, -2.08, 12.3, 2.94, -1.92, [0.75, 0.08, 0.06]);
    B(-0.1, 3.25, 14.78, 0.1, 3.45, 14.92, [0.75, 0.08, 0.06]);
    // benches
    for (const bx of [-6.5, 10.6]) {
      B(bx - 0.9, 0.52, 14.42, bx + 0.9, 0.6, 14.88, [0.52, 0.37, 0.22]);
      B(bx - 0.8, HALL_Y, 14.5, bx - 0.7, 0.52, 14.84, METAL);
      B(bx + 0.7, HALL_Y, 14.5, bx + 0.8, 0.52, 14.84, METAL);
    }
    // poster frame, and the two pins of the riddle note
    const FR = [0.3, 0.2, 0.12], px0 = POSTER.x - POSTER.w / 2, px1 = POSTER.x + POSTER.w / 2, py0 = POSTER.y - POSTER.h / 2, py1 = POSTER.y + POSTER.h / 2;
    B(px0 - 0.05, py0 - 0.05, 14.875, px1 + 0.05, py0, 14.92, FR);
    B(px0 - 0.05, py1, 14.875, px1 + 0.05, py1 + 0.05, 14.92, FR);
    B(px0 - 0.05, py0, 14.875, px0, py1, 14.92, FR);
    B(px1, py0, 14.875, px1 + 0.05, py1, 14.92, FR);
    for (const sx of [-1, 1]) {
      const x = RIDDLE.x + sx * (RIDDLE.w / 2 - 0.03), y = RIDDLE.y + RIDDLE.h / 2 - 0.03;
      B(x - 0.009, y - 0.009, 14.872, x + 0.009, y + 0.009, 14.9, [0.8, 0.1, 0.08]);
    }
    // the world beyond: plain ground round the habitat so no view ends in nothing
    const GR = [0.3, 0.4, 0.2];
    B(-70, -0.5, -70, -13.2, -0.03, 70, GR, 0.2);
    B(16.8, -0.5, -70, 70, -0.03, 70, GR, 0.2);
    B(-13.2, -0.5, -70, 16.8, -0.03, -10.7, GR, 0.2);
    B(-13.2, -0.5, 15.3, 16.8, -0.03, 70, GR, 0.2);
    const mesh = new THREE.Mesh(finish(g), archMat);
    mesh.name = "zoo-architecture"; mesh.receiveShadow = true;
    group.add(mesh);
  }

  // the keeper door (swings out into the service path)
  const doorPivot = new THREE.Group();
  doorPivot.position.set(13.3, HALL_Y + 0.01, -2.6);
  {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 1.2), doorMat);
    leaf.position.set(0, 1.0, 0.6);
    leaf.receiveShadow = true;
    doorPivot.add(leaf);
    group.add(doorPivot);
  }

  // posters and signs on the hall's back wall (they face -z, into the habitat)
  const posterMesh = new THREE.Mesh(new THREE.PlaneGeometry(POSTER.w, POSTER.h), posterMat);
  posterMesh.position.set(POSTER.x, POSTER.y, POSTER.z);
  posterMesh.rotation.y = PI;
  posterMesh.name = "zoo-poster";
  group.add(posterMesh);
  // the riddle hangs from two pins; it swings on the viewer's-left one (+x) when the other lets go
  const riddlePivot = new THREE.Group();
  const PIN = { x: RIDDLE.x + RIDDLE.w / 2 - 0.03, y: RIDDLE.y + RIDDLE.h / 2 - 0.03, z: RIDDLE.z - 0.012 };
  riddlePivot.position.set(PIN.x, PIN.y, PIN.z);
  riddlePivot.rotation.y = PI;
  const riddleMesh = new THREE.Mesh(new THREE.PlaneGeometry(RIDDLE.w, RIDDLE.h, 6, 6).translate(RIDDLE.w / 2 - 0.03, -RIDDLE.h / 2 + 0.03, 0), riddleMat);
  riddleMesh.name = "zoo-riddle";
  riddlePivot.add(riddleMesh);
  group.add(riddlePivot);
  const riddleProxy = new THREE.Mesh(new THREE.BoxGeometry(RIDDLE.w + 0.16, RIDDLE.h + 0.16, 0.12), new THREE.MeshBasicMaterial({ visible: false }));
  riddleProxy.position.set(RIDDLE.x, RIDDLE.y, RIDDLE.z - 0.03);
  riddleProxy.name = "zoo-riddle-pick";
  group.add(riddleProxy);
  {
    const g = newGeo();
    // a board on the wall: (x0 .. x1) seen from the habitat reads left to right from the larger x
    const board = (xc, yc, w, h, z, px0, py0, px1, py1) => {
      const u0 = px0 / 1024, u1 = px1 / 1024, v1 = 1 - py0 / 1024, v0 = 1 - py1 / 1024, x0 = xc - w / 2, x1 = xc + w / 2, y0 = yc - h / 2, y1 = yc + h / 2;
      Q(g, V(g, x1, y0, z, u0, v0, 1, 1, 1), V(g, x0, y0, z, u1, v0, 1, 1, 1), V(g, x0, y1, z, u1, v1, 1, 1, 1), V(g, x1, y1, z, u0, v1, 1, 1, 1));
    };
    board(-3, 2.2, 2.4, 1.2, 14.9, 0, 0, 1024, 512);
    board(-9.6, 2.5, 1.4, 0.57, 14.9, 0, 512, 512, 720);
    board(1.3, 1.75, 0.9, 0.366, 14.9, 512, 512, 1024, 720);
    board(9.4, 2.3, 1.2, 0.71, 14.9, 0, 720, 512, 1024);
    board(RIDDLE.x, RIDDLE.y - 0.02, 0.46, 0.273, 14.914, 512, 720, 1024, 1024); // the answer, behind the riddle
    const mesh = new THREE.Mesh(finish(g), signMat);
    mesh.name = "zoo-signs";
    group.add(mesh);
  }

  // toys: the hoop standing on the sand, the ring floating in the pool
  const HOOP = { x: 6.5, y: 0.75, z: 4, yaw: PI / 2, nx: 1, nz: 0, r: 0.55 };
  const RING = { x: -5.5, y: 0.15, z: 4.5, yaw: PI / 2, nx: 1, nz: 0, r: 0.6 };
  function addTorus(g, cx, cy, cz, R, r, colA, colB, stripes) {
    // ring in the y-z plane (axis along x)
    const A = 36, Bn = 10, rows = [];
    for (let a = 0; a <= A; a++) {
      const th = (a / A) * TAU, ez = Math.cos(th), ey = Math.sin(th), col = Math.floor((a % A) / (A / stripes)) % 2 ? colB : colA, row = [];
      for (let b = 0; b <= Bn; b++) {
        const ph = (b / Bn) * TAU, cr = Math.cos(ph) * r, cn = -Math.sin(ph) * r; // n = e1 x e2 = z x y = -x
        row.push(V(g, cx + cn, cy + ey * (R + cr), cz + ez * (R + cr), a / A, b / Bn, col[0], col[1], col[2]));
      }
      rows.push(row);
    }
    for (let a = 0; a < A; a++) for (let b = 0; b < Bn; b++) Q(g, rows[a][b], rows[a + 1][b], rows[a + 1][b + 1], rows[a][b + 1]);
  }
  {
    const g = newGeo(), gy = groundAt(HOOP.x, HOOP.z);
    addTorus(g, HOOP.x, HOOP.y, HOOP.z, HOOP.r + 0.045, 0.045, [0.88, 0.14, 0.1], [0.96, 0.95, 0.9], 12);
    box(g, HOOP.x - 0.3, gy - 0.05, HOOP.z - 0.16, HOOP.x + 0.3, gy + 0.035, HOOP.z + 0.16, 0.2, 0.3, 0.6);
    const mesh = new THREE.Mesh(finish(g, true), toyMat);
    mesh.name = "zoo-hoop"; mesh.receiveShadow = true;
    group.add(mesh);
  }
  const ringMesh = (() => {
    const g = newGeo();
    addTorus(g, 0, 0, 0, RING.r + 0.07, 0.07, [0.98, 0.78, 0.12], [0.16, 0.5, 0.86], 8);
    const mesh = new THREE.Mesh(finish(g, true), toyMat);
    mesh.name = "zoo-ring";
    mesh.position.set(RING.x, RING.y, RING.z);
    group.add(mesh);
    return mesh;
  })();

  // ----------------------------------------------------------------------------------------------
  // Shared uniforms of this world's own shaders
  // ----------------------------------------------------------------------------------------------
  const cur = {
    zen: new THREE.Color(), hor: new THREE.Color(), cloud: new THREE.Color(), disc: new THREE.Color(), rim: new THREE.Color(),
    cloudAmt: 0.4, night: 0, lamp: 0, alarm: 0, caus: 1,
  };
  const todFrom = { zen: new THREE.Color(), hor: new THREE.Color(), cloud: new THREE.Color(), disc: new THREE.Color(), rim: new THREE.Color(), cloudAmt: 0, night: 0, lamp: 0, alarm: 0, caus: 0 };
  const todTo = { zen: new THREE.Color(), hor: new THREE.Color(), cloud: new THREE.Color(), disc: new THREE.Color(), rim: new THREE.Color(), cloudAmt: 0, night: 0, lamp: 0, alarm: 0, caus: 0 };
  const E = {
    uTime: U.zTime, uAlarm: U.zAlarm, uLamp: U.zLamp, uNoise: { value: noiseTex },
    uSun: { value: new THREE.Vector3(-0.4, 0.82, 0.36).normalize() }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
    uZen: { value: cur.zen }, uHor: { value: cur.hor }, uRim: { value: cur.rim },
    uFogCol: { value: new THREE.Color(0xbfdcf0) }, uFog: { value: new THREE.Vector2(24, 85) }, uLight: { value: 1 },
  };

  // sky dome (rides with the camera, drawn first)
  {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: E.uTime, uNoise: E.uNoise, uStars: { value: starTex }, uSun: E.uSun, uDisc: { value: cur.disc }, uZen: E.uZen, uHor: E.uHor,
        uCloud: { value: cur.cloud }, uCloudAmt: { value: 0.4 }, uNight: { value: 0 }, uAlarm: E.uAlarm,
      },
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 12), mat);
    sky.name = "zoo-sky"; sky.renderOrder = -10; sky.frustumCulled = false;
    group.add(sky);
    E.sky = mat.uniforms;
  }

  // water: pool + stream + plunge crescent on a grid, plus the thin sheet on the waterfall's ledge
  const ripples = [new THREE.Vector4(0, 0, -100, 0), new THREE.Vector4(0, 0, -100, 0), new THREE.Vector4(0, 0, -100, 0), new THREE.Vector4(0, 0, -100, 0)];
  let ripCursor = 0;
  {
    const X0 = -12.25, Z0 = -9.5, C = 0.25, NX = 49, NZ = 64;
    const gy = new Float32Array((NX + 1) * (NZ + 1)), vid = new Int32Array((NX + 1) * (NZ + 1)).fill(-1);
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) gy[j * (NX + 1) + i] = groundOnly(X0 + i * C, Z0 + j * C);
    const pos = [], dep = [], flow = [], idx = [];
    const vert = (i, j) => {
      const k = j * (NX + 1) + i;
      if (vid[k] >= 0) return vid[k];
      const x = X0 + i * C, z = Z0 + j * C;
      pos.push(x, 0, z); dep.push(Math.max(0, -gy[k]));
      const ch = channel(x, z), f = (1 - sstep(0.0, 0.5, ch.e)) * sstep(0.8, 1.0, poolRho(x, z));
      flow.push(ch.fx * f, ch.fz * f);
      return (vid[k] = pos.length / 3 - 1);
    };
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * (NX + 1) + i;
      if (Math.min(gy[k], gy[k + 1], gy[k + NX + 1], gy[k + NX + 2]) > 0.03) continue;
      const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
    // the sheet on top of the spur: a disc over the tip, a channel back to the spring in the wall
    const ty = FALL.top + 0.022, base = pos.length / 3;
    pos.push(FALL.x, ty, FALL.z); dep.push(0.11); flow.push(0, 0.35);
    const SEG = 24;
    for (let k = 0; k <= SEG; k++) {
      const deg = (k / SEG) * 360, b = bearing(deg);
      const lip = ((deg - FALL.b0 + 720) % 360) <= FALL.b1 - FALL.b0;
      pos.push(FALL.x + b[0] * 1.0, ty - (lip ? 0.01 : 0), FALL.z + b[1] * 1.0); dep.push(lip ? 0.1 : 0); flow.push(b[0] * 0.6, b[1] * 0.6);
      if (k > 0) idx.push(base, base + k, base + k + 1);
    }
    const cb = pos.length / 3;
    for (let k = 0; k <= 5; k++) {
      const z = lerp(-10.0, FALL.z, k / 5);
      for (let c = -1; c <= 1; c++) { pos.push(FALL.x + c * 0.42, ty, z); dep.push(c === 0 ? 0.11 : 0); flow.push(0, 0.6); }
      if (k > 0) for (let c = 0; c < 2; c++) { const a = cb + (k - 1) * 3 + c, b2 = a + 1, c2 = a + 3, d2 = a + 4; idx.push(a, c2, b2, b2, c2, d2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("aDepth", new THREE.Float32BufferAttribute(dep, 1));
    geo.setAttribute("aFlow", new THREE.Float32BufferAttribute(flow, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: E.uTime, uNorm: { value: waterNorm }, uNoise: E.uNoise, uSun: E.uSun, uSunCol: E.uSunCol, uZen: E.uZen, uHor: E.uHor, uRim: E.uRim,
        uShallow: { value: new THREE.Color(0.36, 0.62, 0.56) }, uDeep: { value: new THREE.Color(0.04, 0.22, 0.27) }, uLight: E.uLight,
        uFogCol: E.uFogCol, uFog: E.uFog, uRip: { value: ripples }, uFall: { value: new THREE.Vector4(FALL.x, FALL.z, 1.38, 0) },
      },
      vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "zoo-water"; mesh.renderOrder = 1;
    group.add(mesh);
  }
  // waterfall: a curved curtain round the tip of the spur, and mist cards at its foot
  {
    const pos = [], uv = [], kind = [], idx = [];
    const NA = 16, NV = 9;
    for (let i = 0; i <= NA; i++) {
      const b = bearing(lerp(FALL.b0, FALL.b1, i / NA));
      for (let j = 0; j <= NV; j++) {
        const t = j / NV, r = 1.0 + 0.34 * t, y = FALL.top + 0.02 - (FALL.top + 0.04) * t * t;
        pos.push(FALL.x + b[0] * r, y, FALL.z + b[1] * r); uv.push(i / NA, t); kind.push(0);
      }
    }
    for (let i = 0; i < NA; i++) for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, b = a + NV + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const mist = (deg, r, y, w, h, k) => {
      const b = bearing(deg), cx = FALL.x + b[0] * r, cz = FALL.z + b[1] * r, tx = b[1] * w * 0.5, tz = -b[0] * w * 0.5, n = pos.length / 3;
      pos.push(cx - tx, y, cz - tz, cx + tx, y, cz + tz, cx + tx, y + h, cz + tz, cx - tx, y + h, cz - tz);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1); kind.push(k, k, k, k);
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    };
    for (let k = 0; k < 6; k++) mist(lerp(FALL.b0 + 8, FALL.b1 - 8, k / 5), 1.42 + (k % 2) * 0.16, -0.12, 1.25, 1.0, 1 + k);
    for (let k = 0; k < 3; k++) mist(lerp(FALL.b0 + 20, FALL.b1 - 20, k / 2), 1.2, 0.5, 1.0, 1.1, 8 + k);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute("aKind", new THREE.Float32BufferAttribute(kind, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: E.uTime, uNoise: E.uNoise, uLight: E.uLight, uFogCol: E.uFogCol, uFog: E.uFog },
      vertexShader: FALL_VS, fragmentShader: FALL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "zoo-waterfall"; mesh.renderOrder = 2;
    group.add(mesh);
  }

  // the glass: one quad; frame, smudges, reflections and (when broken) the hole and cracks are in its shader
  const glassHole = new THREE.Vector4(0, 1.6, 0.95, 0);
  {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([-13, 0.39, 10, 13, 0.39, 10, 13, 2.38, 10, -13, 2.38, 10], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      uniforms: { uSmudge: { value: smudgeTex }, uZen: E.uZen, uHor: E.uHor, uLight: E.uLight, uHole: { value: glassHole }, uAlarm: E.uAlarm, uFogCol: E.uFogCol, uFog: E.uFog },
      vertexShader: GLASS_VS, fragmentShader: GLASS_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "zoo-glass"; mesh.renderOrder = 3;
    group.add(mesh);
  }

  // glows: lamp halos, the alarm beacons and their turning beams (additive, one mesh)
  const glowMesh = (() => {
    const pos = [], off = [], col = [], kind = [], uv = [], idx = [];
    const sprite = (x, y, z, size, c, k) => {
      const n = pos.length / 3, h = size / 2;
      for (const q of [[-h, -h, 0, 0], [h, -h, 1, 0], [h, h, 1, 1], [-h, h, 0, 1]]) { pos.push(x, y, z); off.push(q[0], q[1], 0); col.push(c[0], c[1], c[2]); kind.push(k); uv.push(q[2], q[3]); }
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    };
    const beam = (x, y, z, c) => {
      for (const dir of [1, -1]) for (const flat of [0, 1]) {
        const n = pos.length / 3, Lb = 7 * dir, wN = 0.06, wF = 1.5;
        const q = flat ? [[0, 0, -wN, 0, 0], [Lb, 0, -wF, 1, 0], [Lb, 0, wF, 1, 1], [0, 0, wN, 0, 1]] : [[0, -wN, 0, 0, 0], [Lb, -wF * 0.5, 0, 1, 0], [Lb, wF * 0.5, 0, 1, 1], [0, wN, 0, 0, 1]];
        for (const v of q) { pos.push(x, y, z); off.push(v[0], v[1], v[2]); col.push(c[0], c[1], c[2]); kind.push(2); uv.push(v[3], v[4]); }
        idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      }
    };
    const WARM = [1.0, 0.72, 0.4], HALLC = [1.0, 0.9, 0.7], RED = [1.0, 0.1, 0.06];
    for (const x of LAMP_X) sprite(x, 2.44, 9.86, 1.1, WARM, 0);
    for (const x of HALL_LAMP_X) sprite(x, 3.62, 12.6, 1.5, HALLC, 0);
    sprite(12.14, 2.68, -2, 0.9, WARM, 0);
    sprite(12.1, 2.88, -2, 1.5, RED, 1); beam(12.1, 2.88, -2, RED);
    sprite(0, 3.35, 14.72, 1.5, RED, 1); beam(0, 3.35, 14.72, RED);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("aOff", new THREE.Float32BufferAttribute(off, 3));
    geo.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute("aKind", new THREE.Float32BufferAttribute(kind, 1));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uLamp: E.uLamp, uAlarm: E.uAlarm },
      vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "zoo-glows"; mesh.renderOrder = 4; mesh.frustumCulled = false; mesh.visible = false;
    group.add(mesh);
    return mesh;
  })();

  // ----------------------------------------------------------------------------------------------
  // Fish: one InstancedMesh, the swimming wiggle is in the vertex shader (per-instance phase + strength)
  // ----------------------------------------------------------------------------------------------
  const FISH_N = 14;
  const fishGeo = (() => {
    const pos = [], uv = [], idx = [];
    const zs = [-0.4, -0.32, -0.2, -0.05, 0.1, 0.25, 0.38, 0.46, 0.5];
    const ws = [0.018, 0.035, 0.06, 0.085, 0.095, 0.09, 0.07, 0.04, 0.004];
    const hs = [0.04, 0.065, 0.11, 0.15, 0.165, 0.15, 0.11, 0.06, 0.006];
    const M = 8;
    for (let k = 0; k < zs.length; k++) for (let j = 0; j <= M; j++) {
      const a = (j / M) * TAU - PI / 2; // start at the belly so the seam is underneath
      pos.push(-ws[k] * Math.cos(a), hs[k] * Math.sin(a), zs[k]);
      uv.push(((zs[k] + 0.4) / 0.9) * 0.78 + 0.004, 0.5 + 0.5 * Math.sin(a));
    }
    for (let k = 0; k < zs.length - 1; k++) for (let j = 0; j < M; j++) {
      const a = k * (M + 1) + j, b = a + M + 1;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
    const fin = (pts) => { const n = pos.length / 3; for (let i = 0; i < 3; i++) { pos.push(pts[i][0], pts[i][1], pts[i][2]); uv.push(0.82 + 0.16 * (i === 1 ? 1 : 0), 0.1 + 0.4 * i); } idx.push(n, n + 1, n + 2); };
    fin([[0, 0.04, -0.4], [0, 0.16, -0.64], [0, 0, -0.55]]);
    fin([[0, 0.04, -0.4], [0, 0, -0.55], [0, -0.04, -0.4]]);
    fin([[0, -0.04, -0.4], [0, 0, -0.55], [0, -0.16, -0.64]]);
    fin([[0, 0.155, 0.14], [0, 0.26, -0.03], [0, 0.135, -0.2]]);
    fin([[0, -0.14, -0.04], [0, -0.21, -0.17], [0, -0.1, -0.27]]);
    fin([[-0.088, -0.03, 0.22], [-0.21, -0.09, 0.09], [-0.084, -0.075, 0.12]]);
    fin([[0.088, -0.03, 0.22], [0.21, -0.09, 0.09], [0.084, -0.075, 0.12]]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  })();
  const fishAttr = new THREE.InstancedBufferAttribute(new Float32Array(FISH_N * 2), 2);
  fishAttr.setUsage(THREE.DynamicDrawUsage);
  fishGeo.setAttribute("aFish", fishAttr);
  const fishMesh = new THREE.InstancedMesh(fishGeo, fishMat, FISH_N);
  fishMesh.name = "zoo-fish";
  fishMesh.frustumCulled = false;
  fishMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  {
    const c = new THREE.Color(), r = rng(99);
    for (let i = 0; i < FISH_N; i++) { c.setRGB(0.85 + r() * 0.3, 0.85 + r() * 0.25, 0.75 + r() * 0.35); fishMesh.setColorAt(i, c); }
  }
  group.add(fishMesh);
  const OWN_CHILDREN = group.children.length; // anything a level adds after this is a visitor to the world (friend, props...)

  const fX = new Float32Array(FISH_N), fY = new Float32Array(FISH_N), fZ = new Float32Array(FISH_N), fYaw = new Float32Array(FISH_N);
  const fPit = new Float32Array(FISH_N), fSp = new Float32Array(FISH_N), fWag = new Float32Array(FISH_N), fAmp = new Float32Array(FISH_N);
  const fWy = new Float32Array(FISH_N), fWt = new Float32Array(FISH_N), fTy = new Float32Array(FISH_N), fScare = new Float32Array(FISH_N);
  const fFlee = new Float32Array(FISH_N), fSize = new Float32Array(FISH_N), fCruise = new Float32Array(FISH_N), fBack = new Float32Array(FISH_N);
  const fAlive = new Uint8Array(FISH_N), fShown = new Float32Array(FISH_N);
  let fishRnd = rng(4711);
  function fishWrite(i) {
    const e = fishMesh.instanceMatrix.array, o = i * 16, s = fSize[i] * fShown[i];
    const cy = Math.cos(fYaw[i]), sy = Math.sin(fYaw[i]), cp = Math.cos(fPit[i]), sp = Math.sin(fPit[i]);
    e[o] = cy * s; e[o + 1] = 0; e[o + 2] = -sy * s; e[o + 3] = 0;
    e[o + 4] = sy * sp * s; e[o + 5] = cp * s; e[o + 6] = cy * sp * s; e[o + 7] = 0;
    e[o + 8] = sy * cp * s; e[o + 9] = -sp * s; e[o + 10] = cy * cp * s; e[o + 11] = 0;
    e[o + 12] = fX[i]; e[o + 13] = fY[i]; e[o + 14] = fZ[i]; e[o + 15] = 1;
    fishAttr.array[i * 2] = fWag[i]; fishAttr.array[i * 2 + 1] = fAmp[i];
  }
  function fishPlace(i, fromStream) {
    if (fromStream) { fX[i] = -7.0 + (fishRnd() - 0.5) * 0.3; fZ[i] = -1.0; fY[i] = -0.14; fYaw[i] = 0.1; }
    else {
      for (let t = 0; t < 40; t++) {
        const a = fishRnd() * TAU, rr = Math.sqrt(fishRnd()) * 0.72;
        fX[i] = POOL.x + Math.cos(a) * POOL.rx * rr; fZ[i] = POOL.z + Math.sin(a) * POOL.rz * rr;
        if (heightAt(fX[i], fZ[i]) < -0.8) break;
      }
      fY[i] = -0.3 - fishRnd() * 0.8; fYaw[i] = fishRnd() * TAU;
    }
    fPit[i] = 0; fSp[i] = 0.9; fWag[i] = fishRnd() * TAU; fAmp[i] = 0.7; fWy[i] = fYaw[i]; fWt[i] = fishRnd() * 2; fTy[i] = fY[i];
    fScare[i] = 0; fFlee[i] = 0; fBack[i] = 0; fAlive[i] = 1; fShown[i] = fromStream ? 0.01 : 1;
    fSize[i] = 0.2 + ((i * 7) % 5) * 0.022; fCruise[i] = 0.78 + ((i * 3) % 7) * 0.04;
  }
  function fishThreat(i, tx, ty, tz) {
    const dx = fX[i] - tx, dy = fY[i] - ty, dz = fZ[i] - tz, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > 1.96) return;
    // from behind they notice late: sneak up on their tails
    const ahead = -(dx * Math.sin(fYaw[i]) + dz * Math.cos(fYaw[i]));
    if (ahead < -0.25 * Math.sqrt(d2) && d2 > 0.5625) return;
    fScare[i] = 0.9; fFlee[i] = Math.atan2(dx, dz);
  }
  function fishUpdate(dt, time) {
    const kids = group.children;
    for (let i = 0; i < FISH_N; i++) {
      if (!fAlive[i]) {
        if (fBack[i] > 0 && fish.respawn) { fBack[i] -= dt; if (fBack[i] <= 0) fishPlace(i, true); }
        continue;
      }
      if (fShown[i] < 1) fShown[i] = Math.min(1, fShown[i] + dt * 1.5);
      if (player && !player.hidden) fishThreat(i, player.x, player.y, player.z);
      for (let k = OWN_CHILDREN; k < kids.length; k++) {
        const p = kids[k].position;
        if (p.y < 0.3 && p.x > -11 && p.x < 0 && p.z > -2.5 && p.z < 6.5 && kids[k].visible) fishThreat(i, p.x, p.y, p.z);
      }
      fWt[i] -= dt;
      if (fWt[i] <= 0) {
        fWt[i] = 1.4 + fishRnd() * 3.2;
        fWy[i] = fYaw[i] + (fishRnd() - 0.5) * 2.4;
        fTy[i] = -0.22 - fishRnd() * 1.2;
      }
      const scared = fScare[i] > 0;
      if (scared) fScare[i] -= dt;
      let want = scared ? fFlee[i] : fWy[i];
      let sx = Math.sin(want), sz = Math.cos(want);
      // keep to the deep water
      const hx = Math.sin(fYaw[i]), hz = Math.cos(fYaw[i]);
      const ax = fX[i] + hx * 0.9, az = fZ[i] + hz * 0.9;
      if (heightAt(ax, az) > -0.55 || poolRho(ax, az) > 0.96) {
        const cxh = POOL.x + Math.cos(i * 2.4) * 1.6 - fX[i], czh = POOL.z + Math.sin(i * 2.4) * 1.1 - fZ[i], l = Math.hypot(cxh, czh) || 1;
        sx += (cxh / l) * 2.5; sz += (czh / l) * 2.5;
        fWy[i] = Math.atan2(cxh, czh);
      }
      // a little room from each other
      for (let j = 0; j < FISH_N; j++) {
        if (j === i || !fAlive[j]) continue;
        const dx = fX[i] - fX[j], dz = fZ[i] - fZ[j], dy = fY[i] - fY[j], d2 = dx * dx + dz * dz + dy * dy;
        if (d2 < 0.2 && d2 > 1e-5) { const k = (0.2 - d2) * 6; sx += dx * k; sz += dz * k; }
      }
      want = Math.atan2(sx, sz);
      const turn = wrapPi(want - fYaw[i]), rate = (scared ? 9 : 2.4) * dt;
      fYaw[i] += clamp(turn, -rate, rate);
      const wantSp = scared ? 3.2 : fCruise[i] * (0.8 + 0.4 * Math.max(0, Math.sin(time * 1.3 + i * 1.7)));
      fSp[i] += (wantSp - fSp[i]) * Math.min(1, dt * (scared ? 10 : 1.6));
      const nx = fX[i] + Math.sin(fYaw[i]) * fSp[i] * dt, nz = fZ[i] + Math.cos(fYaw[i]) * fSp[i] * dt;
      const bed = heightAt(nx, nz);
      if (bed > -0.32) fYaw[i] += (i % 2 ? 3 : -3) * dt; // nosing into the bank: turn along it
      else { fX[i] = nx; fZ[i] = nz; }
      const floor = heightAt(fX[i], fZ[i]) + 0.14;
      const ty = clamp(scared ? fTy[i] - 0.25 : fTy[i], floor, -0.14);
      const vy = clamp(ty - fY[i], -(scared ? 1.4 : 0.5) * dt, (scared ? 1.4 : 0.5) * dt);
      fY[i] += vy;
      if (fY[i] < floor) fY[i] = floor;
      fPit[i] += (clamp(-(vy / Math.max(dt, 1e-4)) / Math.max(fSp[i], 0.3), -0.6, 0.6) - fPit[i]) * Math.min(1, dt * 5);
      fWag[i] += dt * (5 + fSp[i] * 8);
      fAmp[i] += (0.55 + 0.45 * Math.min(1, fSp[i] / 2) - fAmp[i]) * Math.min(1, dt * 6);
      fishWrite(i);
    }
    fishMesh.instanceMatrix.needsUpdate = true;
    fishAttr.needsUpdate = true;
  }
  function fishHide(i) {
    fAlive[i] = 0; fShown[i] = 0;
    const e = fishMesh.instanceMatrix.array, o = i * 16;
    for (let k = 0; k < 12; k++) e[o + k] = 0;
    e[o + 13] = -50;
    fishMesh.instanceMatrix.needsUpdate = true;
  }
  const fish = {
    count: FISH_N,
    respawn: true,
    mesh: fishMesh,
    pos(i, out) { out.x = fX[i]; out.y = fY[i]; out.z = fZ[i]; return out; },
    alive(i) { return i >= 0 && i < FISH_N && fAlive[i] === 1; },
    nearest(x, y, z, maxDist) {
      let best = -1, bd = maxDist === undefined ? Infinity : maxDist * maxDist;
      for (let i = 0; i < FISH_N; i++) {
        if (!fAlive[i]) continue;
        const dx = fX[i] - x, dy = fY[i] - y, dz = fZ[i] - z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 <= bd) { bd = d2; best = i; }
      }
      return best;
    },
    catch(i) {
      if (!this.alive(i)) return false;
      vfx("bubbles", fX[i], fY[i], fZ[i], 7, 0);
      fishHide(i);
      fBack[i] = 25;
      return true;
    },
    scare(x, y, z, r) {
      const rr = (r === undefined ? 1.4 : r) ** 2;
      for (let i = 0; i < FISH_N; i++) {
        if (!fAlive[i]) continue;
        const dx = fX[i] - x, dy = fY[i] - y, dz = fZ[i] - z;
        if (dx * dx + dy * dy + dz * dz < rr) { fScare[i] = 1.1; fFlee[i] = Math.atan2(dx, dz); }
      }
    },
    reset() {
      fishRnd = rng(4711);
      this.respawn = true;
      for (let i = 0; i < FISH_N; i++) { fishPlace(i, false); fishWrite(i); }
      fishMesh.instanceMatrix.needsUpdate = true;
      fishAttr.needsUpdate = true;
    },
  };
  fish.reset();

  // ----------------------------------------------------------------------------------------------
  // Glass, door, posters
  // ----------------------------------------------------------------------------------------------
  const glass = {
    z: 10, x0: -13, x1: 13, height: 2.4, broken: false,
    // removes a ragged pane-wide section centred on x (cracks run on into the neighbouring panes)
    shatter(x, y) {
      x = clamp(typeof x === "number" ? x : 5.3, -12.4, 12.4);
      y = clamp(typeof y === "number" ? y : 1.6, 1.0, 1.9);
      glassHole.set(x, y, 0.95, 1);
      this.broken = true;
      this.hole = { x, y };
      vfx("glassShards", x, y, 10, 0, 1, 60);
    },
    reset() { glassHole.w = 0; this.broken = false; this.hole = null; },
    hole: null,
  };

  let doorWant = 0, doorK = 0;
  const door = {
    isOpen: false,
    open(on) {
      on = on !== false;
      if (on !== this.isOpen) sfx("doorOpen");
      this.isOpen = on; doorWant = on ? 1 : 0;
    },
    reset() { this.isOpen = false; doorWant = 0; doorK = 0; doorPivot.rotation.y = 0; },
  };

  let posterL1 = "", posterL2 = "";
  const poster = {
    mesh: posterMesh,
    setText(line1, line2) {
      line1 = String(line1 === undefined ? "" : line1); line2 = String(line2 === undefined ? "" : line2);
      if (line1 === posterL1 && line2 === posterL2) return;
      posterL1 = line1; posterL2 = line2;
      paintPoster(line1, line2);
    },
    get text() { return [posterL1, posterL2]; },
  };
  poster.setText("PLATYPUS TRICKS", "IN 2 DAYS");

  // the riddle note: one pin lets go and it swings on the other, that one tears, it flutters to the floor
  const RIDDLE_T = 2.6, SWING_T = 1.0, DROP_T = 1.45;
  const SWING_EQ = -Math.atan2(RIDDLE.w / 2 - 0.03, RIDDLE.h / 2 - 0.03);
  const swingAt = (t) => SWING_EQ * (1 - Math.exp(-2.4 * t) * Math.cos(7.2 * t));
  let riddleT = -1;
  function riddlePose(t) {
    const m = riddleMesh;
    if (t < 0) { m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); riddleCurl.value = 0; return; }
    if (t < SWING_T) {
      m.position.set(0, 0, 0); m.rotation.set(0, 0, swingAt(t));
      riddleCurl.value = 0.25 * Math.sin((t / SWING_T) * PI);
      return;
    }
    const u = clamp((t - SWING_T) / DROP_T, 0, 1), fall = Math.pow(u, 1.7), still = 1 - u;
    const drop = HALL_Y + 0.014 - PIN.y;
    m.position.set(0.16 * Math.sin(u * 9.5) * still - 0.1 * u, drop * fall, 0.42 * sstep(0, 0.8, u) + 0.05 * Math.sin(u * 13) * still);
    m.rotation.set((-PI / 2) * sstep(0.05, 0.92, u) + 0.35 * Math.sin(u * 12) * still, 0, lerp(swingAt(SWING_T), SWING_EQ - 0.5, u) + 0.45 * Math.sin(u * 10.5) * still);
    riddleCurl.value = 0.7 * Math.sin(u * PI) + 0.06 * u;
  }
  const riddle = {
    object: riddleProxy,
    mesh: riddleMesh,
    fallen: false,
    falling: false,
    fall() {
      if (this.fallen || this.falling) return RIDDLE_T;
      this.falling = true; riddleT = 0;
      sfx("posterFall");
      return RIDDLE_T;
    },
    reset() { this.fallen = false; this.falling = false; riddleT = -1; riddlePose(-1); },
  };

  // ----------------------------------------------------------------------------------------------
  // Time of day
  // ----------------------------------------------------------------------------------------------
  let timeName = "noon", prevName = "noon", todK = 1, todDur = 0, underwater = false, uwSound = false, beamA = 0;
  const hexInto = (dst, src) => { dst.zen.set(src.zen); dst.hor.set(src.hor); dst.cloud.set(src.cloud); dst.disc.set(src.disc); dst.rim.set(src.rim); dst.cloudAmt = src.cloudAmt; dst.night = src.night; dst.lamp = src.lamp; dst.alarm = src.alarm; dst.caus = src.caus; };
  function skyApply(k) {
    const a = todFrom, b = todTo;
    cur.zen.copy(a.zen).lerp(b.zen, k); cur.hor.copy(a.hor).lerp(b.hor, k); cur.cloud.copy(a.cloud).lerp(b.cloud, k);
    cur.disc.copy(a.disc).lerp(b.disc, k); cur.rim.copy(a.rim).lerp(b.rim, k);
    cur.cloudAmt = lerp(a.cloudAmt, b.cloudAmt, k); cur.night = lerp(a.night, b.night, k); cur.lamp = lerp(a.lamp, b.lamp, k);
    cur.alarm = lerp(a.alarm, b.alarm, k); cur.caus = lerp(a.caus, b.caus, k);
    E.sky.uCloudAmt.value = cur.cloudAmt; E.sky.uNight.value = cur.night;
    U.zLamp.value = cur.lamp; U.zCausK.value = cur.caus; U.zAlarm.value.z = cur.alarm;
    glowMesh.visible = cur.lamp > 0.004 || cur.alarm > 0.004;
  }
  // the view from under the surface: the same sun, in blue-green murk
  const UNDER = {};
  for (const name in ENV) {
    const e = ENV[name], d = e.dark ? 0.3 : 1;
    const c = new THREE.Color(0x2a8794).multiplyScalar(d);
    UNDER[name] = { background: c, fog: [c, 0.2, e.dark ? 7 : 11], hemi: [new THREE.Color(0x9fe0e6).multiplyScalar(d), new THREE.Color(0x1d4f55).multiplyScalar(d), 1.15], sun: [e.sun[0], e.sun[1] * 0.75], sunDir: e.sunDir, far: e.far, dark: e.dark };
  }
  const mixEnv = { background: new THREE.Color(), fog: [new THREE.Color(), 0, 0], hemi: [new THREE.Color(), new THREE.Color(), 0], sun: [new THREE.Color(), 0], sunDir: [0, 1, 0], far: 90, dark: false };
  const cA = new THREE.Color(), cB = new THREE.Color();
  function envMix(a, b, k) {
    const m = mixEnv;
    m.background.copy(cA.set(a.background)).lerp(cB.set(b.background), k);
    m.fog[0].copy(cA.set(a.fog[0])).lerp(cB.set(b.fog[0]), k); m.fog[1] = lerp(a.fog[1], b.fog[1], k); m.fog[2] = lerp(a.fog[2], b.fog[2], k);
    m.hemi[0].copy(cA.set(a.hemi[0])).lerp(cB.set(b.hemi[0]), k); m.hemi[1].copy(cA.set(a.hemi[1])).lerp(cB.set(b.hemi[1]), k); m.hemi[2] = lerp(a.hemi[2], b.hemi[2], k);
    m.sun[0].copy(cA.set(a.sun[0])).lerp(cB.set(b.sun[0]), k); m.sun[1] = lerp(a.sun[1], b.sun[1], k);
    for (let i = 0; i < 3; i++) m.sunDir[i] = lerp(a.sunDir[i], b.sunDir[i], k);
    m.dark = b.dark;
    return m;
  }
  const smooth = (k) => k * k * (3 - 2 * k);
  function setTime(name, seconds) {
    if (!ENV[name]) name = "noon";
    seconds = seconds > 0 ? seconds : 0;
    hexInto(todFrom, { zen: cur.zen, hor: cur.hor, cloud: cur.cloud, disc: cur.disc, rim: cur.rim, cloudAmt: cur.cloudAmt, night: cur.night, lamp: cur.lamp, alarm: cur.alarm, caus: cur.caus });
    hexInto(todTo, SKY[name]);
    prevName = timeName; timeName = name;
    todDur = seconds; todK = seconds > 0 ? 0 : 1;
    if (!seconds) skyApply(1);
    world.env = ENV[name];
    world.time = name;
    if (ctx.world === world) {
      if (underwater) ctx.setEnv(UNDER[name], Math.min(seconds, 1));
      else ctx.setEnv(ENV[name], seconds);
    }
  }
  function setUnderwater(on) {
    if (on === underwater) return;
    underwater = on;
    if (ctx.world !== world) return;
    if (on) ctx.setEnv(UNDER[timeName], 0);
    else if (todK < 1 && todDur > 0) {
      // back above the surface in the middle of a slow change of light: pick the blend up where it should be
      ctx.setEnv(envMix(ENV[prevName], ENV[timeName], smooth(todK)), 0);
      ctx.setEnv(ENV[timeName], todDur * (1 - todK));
    } else ctx.setEnv(ENV[timeName], 0);
  }

  // ----------------------------------------------------------------------------------------------
  // Named points
  // ----------------------------------------------------------------------------------------------
  const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
  const pt = (x, z, yaw) => ({ x, y: floorAt(x, z), z, yaw: yaw === undefined ? yawTo(x, z, 0, 0) : yaw });
  const p3 = (x, y, z, yaw) => ({ x, y, z, yaw: yaw || 0 });
  const cam = (x, y, z, lx, ly, lz) => ({ x, y, z, pos: { x, y, z }, look: { x: lx, y: ly, z: lz } });
  const nestYaw = yawTo(NEST.x, NEST.z, 0, 0);
  const P = {
    nest: pt(NEST.x, NEST.z, nestYaw), nestFriend: pt(8.1, -6.9, nestYaw),
    lookout: pt(5.5, -7, yawTo(5.5, -7, 0, 2)), lookoutFoot: pt(3.5, -4.5, yawTo(3.5, -4.5, 5.5, -7)),
    hollowLog: pt(HOLLOW.x, HOLLOW.z, Math.atan2(HOLLOW.dx, HOLLOW.dz)),
    logBridge: pt(-7.5, -3.2, Math.atan2(BRIDGE.dx, BRIDGE.dz)), logBridgeA: pt(BRIDGE.ax, BRIDGE.az, Math.atan2(BRIDGE.dx, BRIDGE.dz)), logBridgeB: pt(BRIDGE.bx, BRIDGE.bz, Math.atan2(BRIDGE.dx, BRIDGE.dz)),
    fallTop: pt(-9.5, -7, 0), fallSteps: pt(-7.6, -7.4, yawTo(-7.6, -7.4, -8.4, -8)), fallBehind: pt(-10.6, -8.3, yawTo(-10.6, -8.3, -10.7, -6.4)),
    fallFoot: p3(FALL.x - 0.25, -0.1, FALL.z + 1.5, 0),
    reeds: pt(-10.5, 5.5, yawTo(-10.5, 5.5, POOL.x, POOL.z)), ferns: pt(11, 3), sandbank: pt(0.5, 2.5, yawTo(0.5, 2.5, POOL.x, POOL.z)),
    sunRock: pt(-1, -2.5), divingRock: pt(-2, 5.5, yawTo(-2, 5.5, POOL.x, POOL.z)),
    poolCenter: p3(POOL.x, -0.1, POOL.z), poolDeep: p3(-6.5, -1.7, 2.5), sunkenLog: Object.assign(p3(SUNK.x, SUNK.y, SUNK.z, Math.atan2(SUNK.dx, SUNK.dz)), { r: SUNK.ri }),
    streamMouth: pt(-7.0, -1.1, 0),
    showRock: pt(3, 7.2, 0), showFriend: pt(4.6, 7.0, 0),
    hoop: pt(HOOP.x, HOOP.z, PI / 2), ring: p3(RING.x, -0.1, RING.z, PI / 2), ballSpot: pt(4, 1), bowl: pt(10, -1.5), bowlFriend: pt(10.9, -0.6, yawTo(10.9, -0.6, 10, -1.5)),
    doorIn: pt(12.3, -2, -PI / 2), doorOut: pt(14.5, -2, -PI / 2), outside: pt(14.5, 9, 0), hallCorner: pt(14.5, 12.5, -PI / 2), hallEnd: pt(9, 12.5, -PI / 2),
    glassMid: p3(0, HALL_Y, 10, 0), leapFrom: pt(5, 7.6, yawTo(5, 7.6, 5.6, 12.4)), leapTo: pt(5.6, 12.4, yawTo(5, 7.6, 5.6, 12.4)),
    poster: p3(POSTER.x, POSTER.y, POSTER.z, PI), riddle: p3(RIDDLE.x, RIDDLE.y, RIDDLE.z, PI),
    riddleFloor: p3(RIDDLE.x + 0.1, HALL_Y + 0.02, RIDDLE.z - 0.5, PI), answer: p3(RIDDLE.x, RIDDLE.y - 0.02, 14.914, PI),
    posterCam: cam(5.4, 2.2, 11.3, POSTER.x, POSTER.y, POSTER.z), posterClose: cam(5.0, 2.4, 12.6, POSTER.x, POSTER.y, POSTER.z),
    camWide: cam(-11, 6.5, 9, 0, 0.5, -1), camNest: cam(6.6, 1.1, -5.4, NEST.x, floorAt(NEST.x, NEST.z) + 0.2, NEST.z),
    camPool: cam(-1, 1.6, 6.5, POOL.x, 0, POOL.z), camGlass: cam(0, 1.5, 4, 0, 1.2, 10),
  };
  // the way the water runs from the top of the fall to the pool (level 5's slide)
  const slide = [p3(-9.5, FALL.top, -7, 0), p3(FALL.x - 0.1, FALL.top, FALL.z + 0.95, 0), p3(FALL.x - 0.05, 0.4, FALL.z + 1.4, 0)];
  for (const s of STREAM) slide.push(p3(s[0], -0.1, s[1], 0));
  slide.push(p3(-6.5, -0.1, 1.4, 0));

  // ----------------------------------------------------------------------------------------------
  // The world object
  // ----------------------------------------------------------------------------------------------
  const HAB = { x0: -12.25, x1: 12.25, z0: -9.3, z1: 9.6 };
  function confine(obj, radius) {
    const r = radius || 0;
    if (obj.z < 10 && obj.x > -13 && obj.x < 13) {
      // inside the habitat (the keeper door's recess lets you a little further east)
      const xe = Math.abs(obj.z + 2) < 0.55 ? 12.75 : HAB.x1;
      if (obj.x < HAB.x0 + r) obj.x = HAB.x0 + r; else if (obj.x > xe - r) obj.x = xe - r;
      if (obj.z < HAB.z0 + r) obj.z = HAB.z0 + r; else if (obj.z > HAB.z1 - r) obj.z = HAB.z1 - r;
    } else {
      // on the people side: the hall and the service path
      if (obj.x < -16.9 + r) obj.x = -16.9 + r; else if (obj.x > 16.3 - r) obj.x = 16.3 - r;
      if (obj.z < -10.4 + r) obj.z = -10.4 + r; else if (obj.z > 14.75 - r) obj.z = 14.75 - r;
    }
  }
  function ripple(x, z, strength) {
    const v = ripples[ripCursor];
    ripCursor = (ripCursor + 1) % ripples.length;
    v.set(x, z, U.zTime.value, clamp(strength === undefined ? 1 : strength, 0, 2));
  }

  let stepN = 0, wakeT = 0, bubbleT = 0, mistT = 0, clock = 0, sunLum = 1;
  const world = {
    name: "zoo",
    group,
    swim: true,
    maxStep: 0.45,
    colliders,
    env: ENV.noon,
    ENV,
    time: "noon",
    P,
    heightAt, waterAt, depthAt, inPool, surfaceAt, floorAt, confine, ripple,
    camBounds: { minX: -12.3, maxX: 12.3, minZ: -9.4, maxZ: 9.55, maxY: 6 },
    walkway: { x0: -12, x1: 12, z0: 10.8, z1: 14.2, y: HALL_Y },
    glass, fish, poster, riddle, door, setTime,
    lampU: U.zLamp, // the lamp level 0..1 (other modules light their own materials in the hall with it)
    hoop: HOOP, ring: RING,
    fall: { x: FALL.x, z: FALL.z, top: FALL.top, footX: P.fallFoot.x, footZ: P.fallFoot.z },
    stream: STREAM.map((s) => ({ x: s[0], z: s[1] })),
    slide,
    pool: { x: POOL.x, z: POOL.z, rx: POOL.rx, rz: POOL.rz, surface: 0, depth: 1.8 },
    get underwater() { return underwater; },

    update(dt, time) {
      clock += dt;
      U.zTime.value = clock;
      if (todK < 1) { todK = Math.min(1, todK + dt / Math.max(todDur, 1e-3)); skyApply(smooth(todK)); }
      if (cur.alarm > 0.001) {
        beamA += dt * 2.3;
        U.zAlarm.value.x = Math.cos(beamA); U.zAlarm.value.y = Math.sin(beamA);
        U.zAlarm.value.w = 0.5 + 0.5 * Math.sin(clock * 5.2);
      }
      fishUpdate(dt, clock);
      if (doorK !== doorWant) {
        doorK = doorWant > doorK ? Math.min(doorWant, doorK + dt / 0.8) : Math.max(doorWant, doorK - dt / 0.8);
        doorPivot.rotation.y = smooth(doorK) * 1.85;
      }
      if (riddle.falling) {
        riddleT += dt;
        riddlePose(Math.min(riddleT, SWING_T + DROP_T));
        if (riddleT >= RIDDLE_T) { riddle.falling = false; riddle.fallen = true; }
      }
      ringMesh.position.y = RING.y + Math.sin(clock * 1.7) * 0.018;
      ringMesh.rotation.x = Math.sin(clock * 1.1) * 0.05;
      ringMesh.rotation.z = Math.sin(clock * 0.83 + 1) * 0.04;
      // is the camera under the surface?
      const cp = ctx.camera.position;
      if (underwater ? cp.y > 0.02 || waterAt(cp.x, cp.z) !== 0 : cp.y < -0.06 && waterAt(cp.x, cp.z) === 0) setUnderwater(!underwater);
      // the swimmer's wake and bubbles
      if (player && !player.hidden && !player.scripted) {
        if (player.swimming && !player.diving && player.speed > 0.4) {
          wakeT -= dt;
          if (wakeT <= 0) { wakeT = 0.14; vfx("wake", player.x, player.z, 0, clamp(player.speed / 3.4, 0.2, 1)); ripple(player.x, player.z, 0.5); }
        } else if (player.diving) {
          bubbleT -= dt;
          if (bubbleT <= 0) { bubbleT = 0.45 + Math.random() * 0.4; vfx("bubbles", player.x, player.y + 0.15, player.z, 2, 0); }
        }
      }
      // spray where the fall hits the plunge pool
      mistT -= dt;
      if (mistT <= 0) {
        mistT = 0.7 + Math.random() * 0.5;
        const b = bearing(lerp(FALL.b0 + 6, FALL.b1 - 6, Math.random()));
        vfx("splash", FALL.x + b[0] * 1.36, 0, FALL.z + b[1] * 1.36, 0.16);
        ripple(FALL.x + b[0] * 1.5, FALL.z + b[1] * 1.5, 0.5);
      }
    },

    onFootstep(wx, wz, strength, footIndex, wet, pan) {
      const s = surfaceAt(wx, wz);
      stepN++;
      if (wet || s === "water") {
        sfx("step", "water", strength, pan);
        const onTop = heightAt(wx, wz) > 1;
        if (!onTop) { ripple(wx, wz, 0.4 + strength * 0.5); if (stepN % 2 === 0) vfx("splash", wx, 0, wz, 0.08 + 0.1 * strength); }
        return;
      }
      sfx("step", s, strength, pan);
      const y = heightAt(wx, wz) + 0.02;
      if (s === "sand") { if (footIndex < 2 || strength > 0.7) vfx("sandPuff", wx, y, wz, strength * 0.5); }
      else if (s === "rock" || s === "wood") { if (strength > 0.85) vfx("dust", wx, y, wz, strength * 0.3); }
    },
    onJump(x, z, floorY) {
      if (waterAt(x, z) === 0) { vfx("splash", x, 0, z, 0.25); ripple(x, z, 1); }
      else if (surfaceAt(x, z) === "sand") vfx("sandPuff", x, floorY + 0.03, z, 0.8);
      else vfx("dust", x, floorY + 0.03, z, 0.4);
    },
    onLand(x, z, floorY, impact, wet) {
      if (wet || waterAt(x, z) === 0) {
        sfx("splash", 0.3 + 0.6 * impact);
        vfx("splash", x, 0, z, 0.3 + 0.6 * impact);
        ripple(x, z, 1 + impact);
        fish.scare(x, -0.4, z, 1.2 + impact);
        return;
      }
      const s = surfaceAt(x, z);
      sfx("step", s, 0.75 + 0.5 * impact, 0);
      if (s === "sand") vfx("sandPuff", x, floorY + 0.03, z, 0.6 + impact);
      else vfx("dust", x, floorY + 0.03, z, 0.3 + 0.6 * impact);
    },
    onSwim(on, x, z) {
      if (on) { sfx("splash", 0.35); vfx("splash", x, 0, z, 0.35); ripple(x, z, 1.2); }
      else { sfx("step", "water", 0.6, 0); ripple(x, z, 0.8); }
    },
    onDive(under, x, z) {
      if (under) { sfx("diveIn"); sfx("underwater", true); uwSound = true; vfx("bubbles", x, -0.3, z, 8, 0); vfx("splash", x, 0, z, 0.3); }
      else { sfx("surface"); sfx("underwater", false); uwSound = false; vfx("splash", x, 0, z, 0.45); }
      ripple(x, z, 1.4);
    },
    // the engine re-styled the lights: follow with this world's own shaders
    onEnv(o) {
      E.uSun.value.copy(o.dir);
      sunLum = o.sun * (o.sunC.r * 0.3 + o.sunC.g * 0.6 + o.sunC.b * 0.1);
      E.uSunCol.value.copy(o.sunC).multiplyScalar(clamp(o.sun / 2.3, 0, 1.2));
      E.uFogCol.value.copy(o.fog);
      E.uFog.value.set(o.near, o.far);
      E.uLight.value = clamp((sunLum * 0.3 + o.hemi * (o.sky.r * 0.3 + o.sky.g * 0.6 + o.sky.b * 0.1) * 0.45) / 1.19, 0.08, 1.15);
    },
    onEnter() { underwater = false; },
    onLeave() {
      underwater = false;
      if (uwSound) { sfx("underwater", false); uwSound = false; }
    },
    reset() {
      glass.reset(); riddle.reset(); door.reset(); fish.reset();
      for (let i = 0; i < ripples.length; i++) ripples[i].set(0, 0, -100, 0);
      if (uwSound) { sfx("underwater", false); uwSound = false; }
      underwater = false;
      setTime("noon", 0);
    },
  };
  hexInto(cur, SKY.noon);
  setTime("noon", 0);
  return world;
}
