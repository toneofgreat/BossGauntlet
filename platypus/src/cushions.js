// cushions.js — the endless field of white cushions.
//
// One cushion is a rounded-square pillow:
//   plan     : superellipse  |x/a|^n + |z/a|^n = 1
//   top      : y = SEAM + H * f(x/a, z/a),  f = (1 - r^m)^p * (1 - k (px pz)^2)
//              (r = superellipse norm, so level sets are rounded squares; the product term
//              thins the corners = the "pinch"), minus gaussian tuft dimples
//   seam     : piped cord swept around the equator
//   skirt    : the visible outer part of the underside, curving back under to the floor
//   buttons  : five small domes sitting in the tuft dimples
// Normals of the base shape are analytic (exact gradient of f). Tuft dimples, pleats, wrinkles,
// seam puckers and the cord twist are shaded by a generated tangent-space normal map + an
// AO/roughness map; a small tiling weave normal map is layered on top in the fragment shader.
//
// The field is three InstancedMesh LOD tiers on a wrapping grid plus one dark floor quad:
// 4 draw calls, about 91k triangles at the default 17 x 17 grid.
// Squish is a per-instance attribute (press centre + spring depth) applied in the vertex
// shader with an analytically corrected normal, so nothing is rebuilt per frame.

// ---------------------------------------------------------------------------------------------
// Shape constants (metres, object space of one cushion; y = 0 is the crown level)
// ---------------------------------------------------------------------------------------------
const SPACING = 3.05;
const A_HALF = 1.47; // half width of the fabric footprint (piping adds PIPE_R)
const SEAM_Y = -0.36; // height of the piped equator
const FLOOR_Y = -0.7; // gap floor
const H_TOP = 0.36; // crown height above the seam
const H_BOT = SEAM_Y - FLOOR_Y; // depth of the underside below the seam
const N_EXP = 5.5; // superellipse exponent of the plan
const M_TOP = 2.4, P_TOP = 0.7; // top profile  (1 - r^m)^p
const M_BOT = 2.2, P_BOT = 0.62; // underside profile
const PINCH = 0.42; // corner thinning
const PIPE_R = 0.027;
const TUFT_OFF = 0.45 * A_HALF; // tufts at the centre and (+-TUFT_OFF, +-TUFT_OFF)
const TUFTS = [0, 0, TUFT_OFF, TUFT_OFF, -TUFT_OFF, TUFT_OFF, TUFT_OFF, -TUFT_OFF, -TUFT_OFF, -TUFT_OFF];
const DIMPLE_SHARP = 0.055, SIG_SHARP = 0.085; // tight tuft pull
const DIMPLE_WIDE = 0.035, SIG_WIDE = 0.26; // broad sag around each tuft
const BUTTON_R = 0.05, BUTTON_H = 0.028;
const GAP_WALK_DROP = 0.1; // how far heightAt sinks below the seam inside a gap
const GAP_WALK_WIDTH = 0.22;

// Squish (spring) constants
const SQ_A0 = 0.03; // whole-crown sag per unit depth (m)
const SQ_A1 = 0.12; // local dip per unit depth (m)
const SQ_SIGMA = 0.42; // radius of the local dip (m)
const SQ_INV_SIG2 = 1 / (SQ_SIGMA * SQ_SIGMA);
const SPRING_W = 13; // rad/s
const SPRING_Z = 0.32; // damping ratio (soft overshoot)
const SPRING_J = 16; // velocity kick per unit force
const SPRING_VMAX = 40;
const SPRING_DMAX = 1.7, SPRING_DMIN = -0.5;
const MAX_SPRINGS = 16;

// Texture layout (macro normal map and AO/roughness map share it)
const TEX = 512;
const ROW_CORD = 20; // rows [0, 20)  : twisted cord strip for the piping (tiles in u)
const ROW_FACE = 40; // rows [20, 40) : plain fabric (buttons); rows [40, 512) : cushion face
const V_FACE = ROW_FACE / TEX;
const WEAVE_TEX = 256;
const WEAVE_REP = 18;

// ---------------------------------------------------------------------------------------------
// Small maths helpers
// ---------------------------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smooth01(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

// deterministic per-cell random in [0, 1)
function cellHash(i, j, k) {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(k | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Profile value only (hot path for heightAt). px, pz in footprint units; returns 0 outside.
function profileTop(px, pz) {
  const s = Math.pow(Math.abs(px), N_EXP) + Math.pow(Math.abs(pz), N_EXP);
  if (s >= 1) return 0;
  const q = 1 - Math.pow(s, M_TOP / N_EXP);
  const pp = px * pz;
  return Math.pow(q, P_TOP) * (1 - PINCH * pp * pp);
}

// Profile with analytic gradient. out = [f, df/dpx, df/dpz]. Valid for s < 1.
function profileGrad(px, pz, m, p, out) {
  const ax = Math.abs(px), az = Math.abs(pz);
  const s = Math.pow(ax, N_EXP) + Math.pow(az, N_EXP);
  if (s >= 1) {
    out[0] = 0; out[1] = 0; out[2] = 0;
    return out;
  }
  const e = m / N_EXP;
  const q = 1 - Math.pow(s, e);
  const B = Math.pow(q, p);
  const dBds = s > 1e-12 ? -p * Math.pow(q, p - 1) * e * Math.pow(s, e - 1) : 0;
  const dsx = ax > 0 ? N_EXP * Math.pow(ax, N_EXP - 1) * (px < 0 ? -1 : 1) : 0;
  const dsz = az > 0 ? N_EXP * Math.pow(az, N_EXP - 1) * (pz < 0 ? -1 : 1) : 0;
  const pp = px * pz;
  const P = 1 - PINCH * pp * pp;
  out[0] = B * P;
  out[1] = P * dBds * dsx + B * (-2 * PINCH * px * pz * pz);
  out[2] = P * dBds * dsz + B * (-2 * PINCH * pz * px * px);
  return out;
}

function dimpleWide(x, z) {
  let d = 0;
  const inv = 1 / (SIG_WIDE * SIG_WIDE);
  for (let t = 0; t < 10; t += 2) {
    const dx = x - TUFTS[t], dz = z - TUFTS[t + 1];
    const d2 = (dx * dx + dz * dz) * inv;
    if (d2 < 12) d += DIMPLE_WIDE * Math.exp(-d2);
  }
  return d;
}

function dimpleSharp(x, z) {
  let d = 0;
  const inv = 1 / (SIG_SHARP * SIG_SHARP);
  for (let t = 0; t < 10; t += 2) {
    const dx = x - TUFTS[t], dz = z - TUFTS[t + 1];
    const d2 = (dx * dx + dz * dz) * inv;
    if (d2 < 12) d += DIMPLE_SHARP * Math.exp(-d2);
  }
  return d;
}

// ---------------------------------------------------------------------------------------------
// Superellipse boundary, resampled so vertices follow a blend of arc length and turning angle
// (more vertices where the outline bends: the corners stay round even at the low LOD).
// ---------------------------------------------------------------------------------------------
function boundaryPoint(theta, out) {
  const c = Math.cos(theta), s = Math.sin(theta);
  const R = Math.pow(Math.pow(Math.abs(c), N_EXP) + Math.pow(Math.abs(s), N_EXP), -1 / N_EXP);
  out[0] = R * c;
  out[1] = R * s;
  return out;
}

function makeBoundaryTable() {
  const NS = 4096;
  const bx = new Float64Array(NS + 1), bz = new Float64Array(NS + 1);
  const arc = new Float64Array(NS + 1), turn = new Float64Array(NS + 1);
  const tmp = [0, 0];
  for (let i = 0; i <= NS; i++) {
    boundaryPoint((i / NS) * Math.PI * 2, tmp);
    bx[i] = tmp[0];
    bz[i] = tmp[1];
  }
  let ptx = 0, ptz = 0;
  for (let i = 1; i <= NS; i++) {
    const tx = bx[i] - bx[i - 1], tz = bz[i] - bz[i - 1];
    const len = Math.hypot(tx, tz);
    arc[i] = arc[i - 1] + len;
    if (i > 1) {
      const cr = ptx * tz - ptz * tx, dt = ptx * tx + ptz * tz;
      turn[i] = turn[i - 1] + Math.abs(Math.atan2(cr, dt));
    }
    ptx = tx;
    ptz = tz;
  }
  // close the turning integral (segment NS -> segment 1)
  const tx0 = bx[1] - bx[0], tz0 = bz[1] - bz[0];
  const closing = Math.abs(Math.atan2(ptx * tz0 - ptz * tx0, ptx * tx0 + ptz * tz0));
  const turnTotal = turn[NS] + closing;
  // turn[] is defined at segment ends; shift by half the closing step so it is symmetric about theta = 0
  for (let i = 1; i <= NS; i++) turn[i] += closing * 0.5;
  turn[NS] = turnTotal;
  return { NS, arc, turn, arcTotal: arc[NS], turnTotal };
}

// returns { x[], z[] (unit footprint coords), gx[], gz[] (outward unit normal in plan), s[] (arc fraction) }
function sampleBoundary(table, M, turnWeight) {
  const { NS, arc, turn, arcTotal, turnTotal } = table;
  const x = new Float64Array(M + 1), z = new Float64Array(M + 1);
  const gx = new Float64Array(M + 1), gz = new Float64Array(M + 1), s = new Float64Array(M + 1);
  const tmp = [0, 0];
  let j = 0;
  for (let m = 0; m <= M; m++) {
    const target = m / M;
    let theta, sFrac;
    if (m === 0) { theta = 0; sFrac = 0; }
    else if (m === M) { theta = Math.PI * 2; sFrac = 1; }
    else {
      const tau = (k) => (1 - turnWeight) * (arc[k] / arcTotal) + turnWeight * (turn[k] / turnTotal);
      while (j < NS - 1 && tau(j + 1) < target) j++;
      const t0 = tau(j), t1 = tau(j + 1);
      const fr = t1 > t0 ? (target - t0) / (t1 - t0) : 0;
      theta = ((j + fr) / NS) * Math.PI * 2;
      sFrac = (arc[j] + (arc[j + 1] - arc[j]) * fr) / arcTotal;
    }
    boundaryPoint(theta, tmp);
    x[m] = tmp[0];
    z[m] = tmp[1];
    s[m] = sFrac;
    // outward normal in plan = gradient of the superellipse norm
    let nx = Math.pow(Math.abs(tmp[0]), N_EXP - 1) * (tmp[0] < 0 ? -1 : 1);
    let nz = Math.pow(Math.abs(tmp[1]), N_EXP - 1) * (tmp[1] < 0 ? -1 : 1);
    const nl = Math.hypot(nx, nz) || 1;
    gx[m] = nx / nl;
    gz[m] = nz / nl;
  }
  return { x, z, gx, gz, s };
}

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------
function buildCushionGeometry(THREE, table, opt) {
  const { M, K, skirt, pipeSides, buttons, sharp, wide, cordRepeats, turnWeight } = opt;
  const bnd = sampleBoundary(table, M, turnWeight);

  const pos = [], nor = [], uvs = [], col = [], aft = [], idx = [];
  const g = [0, 0, 0];

  function vert(x, y, z, nx, ny, nz, u, v, c, f, top) {
    const l = Math.hypot(nx, ny, nz) || 1;
    pos.push(x, y, z);
    nor.push(nx / l, ny / l, nz / l);
    uvs.push(u, v);
    col.push(c, c, c);
    aft.push(f, top);
    return pos.length / 3 - 1;
  }
  // push a triangle, flipping it if its geometric normal disagrees with the vertex normals
  function tri(a, b, c) {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const e1x = pos[b * 3] - ax, e1y = pos[b * 3 + 1] - ay, e1z = pos[b * 3 + 2] - az;
    const e2x = pos[c * 3] - ax, e2y = pos[c * 3 + 1] - ay, e2z = pos[c * 3 + 2] - az;
    const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
    const sx = nor[a * 3] + nor[b * 3] + nor[c * 3];
    const sy = nor[a * 3 + 1] + nor[b * 3 + 1] + nor[c * 3 + 1];
    const sz = nor[a * 3 + 2] + nor[b * 3 + 2] + nor[c * 3 + 2];
    if (fx * sx + fy * sy + fz * sz >= 0) idx.push(a, b, c);
    else idx.push(a, c, b);
  }
  const faceU = (px) => 0.5 + 0.5 * px;
  const faceV = (pz) => V_FACE + (1 - V_FACE) * (0.5 + 0.5 * pz);
  const dimple = (x, z) => (wide ? dimpleWide(x, z) : 0) + (sharp ? dimpleSharp(x, z) : 0);
  const ringR = (t) => 0.4 * t + 0.6 * Math.sin(t * Math.PI * 0.5);

  // ---- top face ----------------------------------------------------------------------------
  const centre = vert(0, SEAM_Y + H_TOP - dimple(0, 0), 0, 0, 1, 0, faceU(0), faceV(0), 1, 1, 1);
  const rings = [];
  for (let k = 1; k <= K; k++) {
    const r = k === K ? 1 : ringR(k / K);
    const ring = new Array(M);
    for (let m = 0; m < M; m++) {
      const px = r * bnd.x[m], pz = r * bnd.z[m];
      const x = px * A_HALF, z = pz * A_HALF;
      if (k === K) {
        // on the seam: the surface is vertical, the normal is the outward plan normal
        ring[m] = vert(x, SEAM_Y, z, bnd.gx[m], 0, bnd.gz[m], faceU(px), faceV(pz), 0.58, 0, 1);
      } else {
        profileGrad(px, pz, M_TOP, P_TOP, g);
        const f = g[0];
        const c = 0.58 + 0.42 * smooth01(f / 0.5);
        ring[m] = vert(
          x, SEAM_Y + H_TOP * f - dimple(x, z), z,
          (-H_TOP * g[1]) / A_HALF, 1, (-H_TOP * g[2]) / A_HALF,
          faceU(px), faceV(pz), c, f, 1
        );
      }
    }
    rings.push(ring);
  }
  for (let m = 0; m < M; m++) tri(centre, rings[0][m], rings[0][(m + 1) % M]);
  for (let k = 1; k < K; k++) {
    const r0 = rings[k - 1], r1 = rings[k];
    for (let m = 0; m < M; m++) {
      const n = (m + 1) % M;
      tri(r0[m], r1[m], r1[n]);
      tri(r0[m], r1[n], r0[n]);
    }
  }

  // ---- skirt: outer part of the underside, curving back under towards the floor --------------
  {
    let prev = null;
    for (let j = 0; j < skirt.length; j++) {
      const r = skirt[j];
      const ring = new Array(M);
      const depthT = j / (skirt.length - 1);
      const c = 0.5 - 0.3 * depthT;
      for (let m = 0; m < M; m++) {
        const px = r * bnd.x[m], pz = r * bnd.z[m];
        const x = px * A_HALF, z = pz * A_HALF;
        if (r >= 1) {
          ring[m] = vert(x, SEAM_Y, z, bnd.gx[m], 0, bnd.gz[m], faceU(px), faceV(pz), c, 0, 0);
        } else {
          profileGrad(px, pz, M_BOT, P_BOT, g);
          ring[m] = vert(
            x, SEAM_Y - H_BOT * g[0], z,
            (-H_BOT * g[1]) / A_HALF, -1, (-H_BOT * g[2]) / A_HALF,
            faceU(px), faceV(pz), c, 0, 0
          );
        }
      }
      if (prev) {
        for (let m = 0; m < M; m++) {
          const n = (m + 1) % M;
          tri(prev[m], ring[m], ring[n]);
          tri(prev[m], ring[n], prev[n]);
        }
      }
      prev = ring;
    }
  }

  // ---- piping: a cord swept along the seam ------------------------------------------------
  if (pipeSides > 0) {
    const cols = [];
    for (let m = 0; m <= M; m++) {
      const mm = m === M ? 0 : m;
      const cx = bnd.x[mm] * A_HALF, cz = bnd.z[mm] * A_HALF;
      const ox = bnd.gx[mm], oz = bnd.gz[mm];
      const u = cordRepeats * bnd.s[m];
      const colm = new Array(pipeSides + 1);
      for (let s = 0; s <= pipeSides; s++) {
        const a = Math.PI + (s / pipeSides) * Math.PI * 2; // uv seam hidden on the inside
        const ca = Math.cos(a), sa = Math.sin(a);
        const v = (1.5 + (17 * s) / pipeSides) / TEX;
        const c = 0.62 + 0.3 * (0.5 + 0.5 * sa);
        colm[s] = vert(
          cx + PIPE_R * ca * ox, SEAM_Y + PIPE_R * sa, cz + PIPE_R * ca * oz,
          ca * ox, sa, ca * oz, u, v, c, 0, 0
        );
      }
      cols.push(colm);
    }
    for (let m = 0; m < M; m++) {
      for (let s = 0; s < pipeSides; s++) {
        tri(cols[m][s], cols[m + 1][s], cols[m + 1][s + 1]);
        tri(cols[m][s], cols[m + 1][s + 1], cols[m][s + 1]);
      }
    }
  }

  // ---- tuft buttons ----------------------------------------------------------------------
  if (buttons) {
    const SEG = 10;
    const radii = [0.4, 0.75, 1];
    const uvR = 6 / TEX, uvU = 0.5, uvV = 30 / TEX;
    for (let t = 0; t < 10; t += 2) {
      const tx = TUFTS[t], tz = TUFTS[t + 1];
      const fBase = profileTop(tx / A_HALF, tz / A_HALF);
      const yb = SEAM_Y + H_TOP * fBase - dimpleWide(tx, tz) - dimpleSharp(tx, tz) + 0.002;
      const c0 = vert(tx, yb + BUTTON_H, tz, 0, 1, 0, uvU, uvV, 0.96, fBase, 1);
      let prev = null;
      for (let j = 0; j < radii.length; j++) {
        const rr = radii[j];
        const hh = BUTTON_H * Math.sqrt(Math.max(0, 1 - rr * rr));
        const ring = new Array(SEG);
        for (let s = 0; s < SEG; s++) {
          const a = (s / SEG) * Math.PI * 2;
          const dx = Math.cos(a) * rr, dz = Math.sin(a) * rr;
          // ellipsoid normal: (x / R^2, y / H^2, z / R^2)
          const nx = (dx * BUTTON_R) / (BUTTON_R * BUTTON_R);
          const nz = (dz * BUTTON_R) / (BUTTON_R * BUTTON_R);
          const ny = Math.max(hh, BUTTON_H * 0.12) / (BUTTON_H * BUTTON_H);
          ring[s] = vert(
            tx + dx * BUTTON_R, yb + hh, tz + dz * BUTTON_R, nx, ny, nz,
            uvU + uvR * dx, uvV + uvR * dz, 0.96 - 0.3 * rr * rr * rr, fBase, 1
          );
        }
        for (let s = 0; s < SEG; s++) {
          const n = (s + 1) % SEG;
          if (!prev) tri(c0, ring[s], ring[n]);
          else {
            tri(prev[s], ring[s], ring[n]);
            tri(prev[s], ring[n], prev[n]);
          }
        }
        prev = ring;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nor), 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
  geo.setAttribute("aFT", new THREE.BufferAttribute(new Float32Array(aft), 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(idx), 1));
  geo.boundingBox = new THREE.Box3(
    new THREE.Vector3(-A_HALF - PIPE_R, FLOOR_Y, -A_HALF - PIPE_R),
    new THREE.Vector3(A_HALF + PIPE_R, 0.05, A_HALF + PIPE_R)
  );
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -0.35, 0), 2.2);
  geo.userData.triangles = idx.length / 3;
  return geo;
}

// ---------------------------------------------------------------------------------------------
// Generated textures (built once at start-up)
// ---------------------------------------------------------------------------------------------
function makeLattice(seed) {
  const rnd = mulberry32(seed);
  const lat = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) lat[i] = rnd() * 2 - 1;
  return lat;
}

// value noise in [-1, 1]; mask = lattice period - 1 (power of two, <= 256)
function vnoise(lat, x, y, mask) {
  const xf = Math.floor(x), yf = Math.floor(y);
  let tx = x - xf, ty = y - yf;
  tx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
  ty = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
  const x0 = xf & mask, x1 = (xf + 1) & mask;
  const y0 = (yf & mask) << 8, y1 = ((yf + 1) & mask) << 8;
  const a = lat[y0 | x0], b = lat[y0 | x1], c = lat[y1 | x0], d = lat[y1 | x1];
  const top = a + (b - a) * tx;
  return top + (c + (d - c) * tx - top) * ty;
}

function fbm(lat, x, y) {
  return (
    vnoise(lat, x, y, 255) * 0.533 +
    vnoise(lat, x * 2.03 + 17.1, y * 2.03 - 9.4, 255) * 0.267 +
    vnoise(lat, x * 4.11 - 31.7, y * 4.11 + 5.2, 255) * 0.133 +
    vnoise(lat, x * 8.2 + 3.3, y * 8.2 + 41.9, 255) * 0.067
  );
}

function finishTexture(THREE, tex, repeatT, aniso) {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = repeatT ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = aniso;
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

// Macro maps: tangent-space normal map + AO (R) / roughness (G) map.
function buildMacroTextures(THREE, aniso, cordSegMetres) {
  const W = TEX, Ht = TEX;
  const lat = makeLattice(0x51ed270b);
  const hgt = new Float32Array(W * Ht);
  const aoA = new Float32Array(W * Ht);
  const rgA = new Float32Array(W * Ht);
  const rnd = mulberry32(0x9a3c11);
  const phase = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
  const folds = [9, 8, 9, 8, 9];
  const invS2 = 1 / (SIG_SHARP * SIG_SHARP), invW2 = 1 / (SIG_WIDE * SIG_WIDE);
  const invAo2 = 1 / (SIG_SHARP * 1.7 * (SIG_SHARP * 1.7));

  // ---- cord strip: three-ply style twist, periodic in u ------------------------------------
  const TWISTS = 14, STRANDS = 4;
  for (let y = 0; y < ROW_CORD; y++) {
    const q = (y - 1.5) / 17;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const s = Math.abs(Math.sin(Math.PI * (TWISTS * u + STRANDS * q)));
      const k = y * W + x;
      hgt[k] = 0.0038 * Math.pow(s, 0.6);
      aoA[k] = 0.72 + 0.28 * s;
      rgA[k] = 0.86;
    }
  }
  // ---- plain strip (buttons) ----------------------------------------------------------------
  for (let y = ROW_CORD; y < ROW_FACE; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      hgt[k] = 0;
      aoA[k] = 1;
      rgA[k] = 0.8;
    }
  }
  // ---- cushion face ---------------------------------------------------------------------------
  for (let y = ROW_FACE; y < Ht; y++) {
    const pz = ((y + 0.5 - ROW_FACE) / (Ht - ROW_FACE)) * 2 - 1;
    const z = pz * A_HALF;
    for (let x = 0; x < W; x++) {
      const px = ((x + 0.5) / W) * 2 - 1;
      const xm = px * A_HALF;
      const k = y * W + x;
      let h = 0, ao = 1, rough = 0.93;

      const nLow = vnoise(lat, xm * 2.3 + 60, z * 2.3 + 60, 255);
      // tufts: dimple, radiating pleats, painted button (for the LODs without button geometry)
      for (let t = 0; t < 5; t++) {
        const dx = xm - TUFTS[t * 2], dz = z - TUFTS[t * 2 + 1];
        const d2 = dx * dx + dz * dz;
        if (d2 > 1.1) continue;
        const d = Math.sqrt(d2);
        h -= DIMPLE_SHARP * Math.exp(-d2 * invS2) + DIMPLE_WIDE * Math.exp(-d2 * invW2);
        ao -= 0.46 * Math.exp(-d2 * invAo2) + 0.1 * Math.exp(-d2 * invW2);
        if (d2 < 0.5 && d > 1e-4) {
          const tt = d / 0.085;
          const env = tt * Math.exp(1 - tt);
          const fold = Math.cos(Math.atan2(dz, dx) * folds[t] + phase[t] + 1.4 * nLow);
          h += 0.0052 * env * (fold - 0.35 * fold * fold);
          if (fold < 0) ao += 0.16 * env * fold;
        }
        if (d < BUTTON_R) {
          const bb = d / BUTTON_R;
          h += BUTTON_H * Math.sqrt(1 - bb * bb);
          ao += 0.34 * (1 - bb * bb);
          rough = 0.8;
        }
        const rim = (d - BUTTON_R) / 0.012;
        if (rim > -3 && rim < 3) ao -= 0.2 * Math.exp(-rim * rim);
      }

      // filling lumps + soft creases
      const lump = fbm(lat, xm * 1.7 + 11, z * 1.7 + 23);
      h += 0.011 * lump;
      const wx = xm + 0.18 * vnoise(lat, xm * 1.3 + 90, z * 1.3 + 14, 255);
      const wz = z + 0.18 * vnoise(lat, xm * 1.3 + 33, z * 1.3 + 71, 255);
      const ridge = 1 - Math.abs(vnoise(lat, wx * 3.4 + 5, wz * 3.4 + 8, 255));
      const mask = smooth01(vnoise(lat, xm * 0.9 + 120, z * 0.9 + 77, 255) * 1.6 + 0.35);
      const r6 = ridge * ridge * ridge;
      const crease = r6 * r6 * mask;
      h -= 0.0042 * crease;
      ao -= 0.1 * crease;

      // seam puckers: short folds running in from the piping
      const sN = Math.pow(Math.abs(px), N_EXP) + Math.pow(Math.abs(pz), N_EXP);
      const r = Math.pow(sN, 1 / N_EXP);
      const edge = smooth01((r - 0.74) / 0.26);
      if (edge > 0) {
        const th = Math.atan2(pz, px);
        const e2 = edge * edge;
        const pk = Math.cos(th * 84 + 3.2 * nLow + 2.1 * lump);
        h += 0.0042 * e2 * pk * (0.55 + 0.45 * vnoise(lat, th * 6 + 200, 0.5, 255));
        ao -= 0.1 * e2;
      }

      rough += 0.07 * vnoise(lat, xm * 5 + 150, z * 5 + 150, 255);
      hgt[k] = h;
      aoA[k] = ao;
      rgA[k] = rough;
    }
  }

  // ---- heights -> tangent-space normals (per-region metric so slopes are in real units) -------
  const nData = new Uint8Array(W * Ht * 4);
  const oData = new Uint8Array(W * Ht * 4);
  const duFace = (2 * A_HALF) / W, dvFace = (2 * A_HALF) / (Ht - ROW_FACE);
  const duCord = cordSegMetres / W, dvCord = (Math.PI * 2 * PIPE_R) / 17;
  for (let y = 0; y < Ht; y++) {
    let ya, yb, du, dv;
    if (y < ROW_CORD) { ya = 0; yb = ROW_CORD; du = duCord; dv = dvCord; }
    else if (y < ROW_FACE) { ya = ROW_CORD; yb = ROW_FACE; du = duFace; dv = dvFace; }
    else { ya = ROW_FACE; yb = Ht; du = duFace; dv = dvFace; }
    const yU = Math.min(y + 1, yb - 1), yD = Math.max(y - 1, ya);
    const invDv = yU > yD ? 1 / ((yU - yD) * dv) : 0;
    const invDu = 1 / (2 * du);
    for (let x = 0; x < W; x++) {
      const xL = (x - 1) & (W - 1), xR = (x + 1) & (W - 1);
      const nx = -(hgt[y * W + xR] - hgt[y * W + xL]) * invDu;
      const ny = -(hgt[yU * W + x] - hgt[yD * W + x]) * invDv;
      const il = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const k = (y * W + x) * 4;
      nData[k] = Math.round((nx * il * 0.5 + 0.5) * 255);
      nData[k + 1] = Math.round((ny * il * 0.5 + 0.5) * 255);
      nData[k + 2] = Math.round((il * 0.5 + 0.5) * 255);
      nData[k + 3] = 255;
      const ao = aoA[y * W + x], rg = rgA[y * W + x];
      oData[k] = Math.round((ao < 0.25 ? 0.25 : ao > 1 ? 1 : ao) * 255);
      oData[k + 1] = Math.round((rg < 0.6 ? 0.6 : rg > 1 ? 1 : rg) * 255);
      oData[k + 2] = 0;
      oData[k + 3] = 255;
    }
  }
  const normalMap = finishTexture(THREE, new THREE.DataTexture(nData, W, Ht, THREE.RGBAFormat, THREE.UnsignedByteType), false, aniso);
  const ormMap = finishTexture(THREE, new THREE.DataTexture(oData, W, Ht, THREE.RGBAFormat, THREE.UnsignedByteType), false, aniso);
  return { normalMap, ormMap };
}

// Small tiling plain-weave normal map (threads over/under), layered in the fragment shader.
function buildWeaveTexture(THREE, aniso) {
  const W = WEAVE_TEX, P = 8, T = W / P;
  const lat = makeLattice(0x77aa31);
  const rnd = mulberry32(0x2f6e2b);
  const thick = new Float32Array(T * 2);
  for (let i = 0; i < T * 2; i++) thick[i] = 0.82 + 0.36 * rnd();
  const h = new Float32Array(W * W);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const tx = (x + 0.5) / P, ty = (y + 0.5) / P;
      const cx = Math.floor(tx), cy = Math.floor(ty);
      const a = Math.sin(Math.PI * (tx - cx)), b = Math.sin(Math.PI * (ty - cy));
      let v;
      if ((cx + cy) & 1) v = Math.pow(a, 0.7) * (0.55 + 0.45 * b) * thick[cx % T];
      else v = Math.pow(b, 0.7) * (0.55 + 0.45 * a) * thick[T + (cy % T)];
      // fuzz, tileable (lattice period 64 over 256 px, and 128 over 256 px)
      v += 0.1 * vnoise(lat, x * 0.25, y * 0.25, 63) + 0.07 * vnoise(lat, x * 0.5 + 9, y * 0.5 + 9, 127);
      h[y * W + x] = v;
    }
  }
  const data = new Uint8Array(W * W * 4);
  const STR = 1.5;
  for (let y = 0; y < W; y++) {
    const yU = (y + 1) & (W - 1), yD = (y - 1) & (W - 1);
    for (let x = 0; x < W; x++) {
      const xL = (x - 1) & (W - 1), xR = (x + 1) & (W - 1);
      const nx = -(h[y * W + xR] - h[y * W + xL]) * 0.5 * STR;
      const ny = -(h[yU * W + x] - h[yD * W + x]) * 0.5 * STR;
      const il = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const k = (y * W + x) * 4;
      data[k] = Math.round((nx * il * 0.5 + 0.5) * 255);
      data[k + 1] = Math.round((ny * il * 0.5 + 0.5) * 255);
      data[k + 2] = Math.round((il * 0.5 + 0.5) * 255);
      data[k + 3] = 255;
    }
  }
  return finishTexture(THREE, new THREE.DataTexture(data, W, W, THREE.RGBAFormat, THREE.UnsignedByteType), true, aniso);
}

// ---------------------------------------------------------------------------------------------
// Shader injection
// ---------------------------------------------------------------------------------------------
const FADE_PARS_FRAG = /* glsl */ `
uniform vec2 uFocus;
uniform vec2 uFade;
uniform vec3 uFadeColor;
varying vec2 vFieldPos;
`;
const FADE_FRAG = /* glsl */ `
#include <fog_fragment>
gl_FragColor.rgb = mix( gl_FragColor.rgb, uFadeColor, smoothstep( uFade.x, uFade.y, length( vFieldPos - uFocus ) ) );
`;

function patchCushionShader(shader, uniforms) {
  shader.uniforms.uSq = uniforms.uSq;
  shader.uniforms.uWeave = uniforms.uWeave;
  shader.uniforms.uWeaveRep = uniforms.uWeaveRep;
  shader.uniforms.uWeaveAmt = uniforms.uWeaveAmt;
  shader.uniforms.uStripV = uniforms.uStripV;
  shader.uniforms.uFocus = uniforms.uFocus;
  shader.uniforms.uFade = uniforms.uFade;
  shader.uniforms.uFadeColor = uniforms.uFadeColor;

  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      /* glsl */ `#include <common>
attribute vec2 aFT;      // x: base profile value f (0 at the seam .. 1 at the crown), y: 1 on the top face
attribute vec4 aSquish;  // per instance: xy = press centre (object xz), z = spring depth
uniform vec4 uSq;        // A0, A1, 1/sigma^2, 1/H
varying vec2 vFieldPos;`
    )
    .replace(
      "#include <color_vertex>",
      /* glsl */ `#include <color_vertex>
vec2 sqV = position.xz - aSquish.xy;
float sqG = exp( - dot( sqV, sqV ) * uSq.z );
float sqLocal = aSquish.z * uSq.y * sqG;
float sqD = aSquish.z * uSq.x + sqLocal;
vec2 sqGradD = sqLocal * ( - 2.0 * uSq.z ) * sqV;
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR )
	vColor.rgb *= 1.0 - clamp( sqLocal * aFT.x * aFT.y * 2.0, - 0.08, 0.3 );
#endif`
    )
    .replace(
      "#include <beginnormal_vertex>",
      /* glsl */ `#include <beginnormal_vertex>
// exact normal of the squished top:  y' = SEAM + ( H - D(x,z) ) * f(x,z)
objectNormal.xz += aFT.y * ( objectNormal.y * aFT.x * sqGradD - sqD * uSq.w * objectNormal.xz );
objectNormal = normalize( objectNormal );`
    )
    .replace(
      "#include <begin_vertex>",
      /* glsl */ `#include <begin_vertex>
transformed.y -= sqD * aFT.x * aFT.y;`
    )
    .replace(
      "#include <project_vertex>",
      /* glsl */ `#include <project_vertex>
#ifdef USE_INSTANCING
	vFieldPos = ( instanceMatrix * vec4( transformed, 1.0 ) ).xz;
#else
	vFieldPos = transformed.xz;
#endif`
    );

  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      /* glsl */ `#include <common>
uniform sampler2D uWeave;
uniform vec2 uWeaveRep;
uniform float uWeaveAmt;
uniform float uStripV;
${FADE_PARS_FRAG}`
    )
    .replace(
      "#include <normal_fragment_maps>",
      /* glsl */ `#ifdef USE_NORMALMAP_TANGENTSPACE
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	vec3 weaveN = texture2D( uWeave, vNormalMapUv * uWeaveRep ).xyz * 2.0 - 1.0;
	mapN.xy += weaveN.xy * ( uWeaveAmt * step( uStripV, vNormalMapUv.y ) );
	normal = normalize( tbn * mapN );
#endif`
    )
    .replace(
      "#include <emissivemap_fragment>",
      /* glsl */ `#include <emissivemap_fragment>
// cheap fabric rim (stands in for the physical sheen lobe)
float fz = 1.0 - saturate( dot( normalize( vViewPosition ), normal ) );
totalEmissiveRadiance += vec3( 1.0, 0.957, 0.902 ) * ( fz * fz * fz * 0.10 );`
    )
    .replace("#include <fog_fragment>", FADE_FRAG);
}

function patchFloorShader(shader, uniforms) {
  shader.uniforms.uFocus = uniforms.uFocus;
  shader.uniforms.uFade = uniforms.uFade;
  shader.uniforms.uFadeColor = uniforms.uFadeColor;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec2 vFieldPos;")
    .replace("#include <project_vertex>", "#include <project_vertex>\nvFieldPos = transformed.xz;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\n" + FADE_PARS_FRAG)
    .replace("#include <fog_fragment>", FADE_FRAG);
}

// ---------------------------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------------------------
export function createCushionField(THREE, { renderer = null, gridSize = 17 } = {}) {
  const N = Math.max(9, gridSize | 1); // odd
  const HALF = (N - 1) >> 1;
  const HYST = 0.62 * SPACING;
  const fieldRadius = (HALF + 0.5) * SPACING - HYST;
  const fadeEnd = fieldRadius - 0.5;
  const fadeStart = fadeEnd * 0.64;

  let aniso = 1;
  if (renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy) {
    aniso = Math.max(1, Math.min(4, renderer.capabilities.getMaxAnisotropy()));
  }

  // ---- geometry ------------------------------------------------------------------------------
  const table = makeBoundaryTable();
  const perimeter = table.arcTotal * A_HALF;
  const cordRepeats = Math.max(1, Math.round(perimeter / 0.45));
  const geos = [
    buildCushionGeometry(THREE, table, {
      M: 64, K: 20, skirt: [1, 0.97, 0.9, 0.78], pipeSides: 6, buttons: true, sharp: true, wide: true,
      cordRepeats, turnWeight: 0.4,
    }),
    buildCushionGeometry(THREE, table, {
      M: 32, K: 7, skirt: [1, 0.93, 0.78], pipeSides: 3, buttons: false, sharp: false, wide: true,
      cordRepeats, turnWeight: 0.5,
    }),
    buildCushionGeometry(THREE, table, {
      M: 16, K: 3, skirt: [1, 0.8], pipeSides: 0, buttons: false, sharp: false, wide: false,
      cordRepeats, turnWeight: 0.6,
    }),
  ];

  // ---- textures + material ---------------------------------------------------------------------
  const { normalMap, ormMap } = buildMacroTextures(THREE, aniso, perimeter / cordRepeats);
  const weaveMap = buildWeaveTexture(THREE, aniso);
  // the full-screen shader: keep 4x anisotropy only on the macro normal map
  ormMap.anisotropy = Math.min(2, aniso);
  weaveMap.anisotropy = Math.min(2, aniso);
  const fadeColor = new THREE.Color(0xffffff);

  const cushionUniforms = {
    uSq: { value: new THREE.Vector4(SQ_A0, SQ_A1, SQ_INV_SIG2, 1 / H_TOP) },
    uWeave: { value: weaveMap },
    uWeaveRep: { value: new THREE.Vector2(WEAVE_REP, WEAVE_REP / (1 - V_FACE)) },
    uWeaveAmt: { value: 0.5 },
    uStripV: { value: ROW_CORD / TEX },
    uFocus: { value: new THREE.Vector2(0, 0) },
    uFade: { value: new THREE.Vector2(fadeStart, fadeEnd) },
    uFadeColor: { value: fadeColor },
  };
  const floorUniforms = {
    uFocus: { value: new THREE.Vector2(0, 0) },
    uFade: cushionUniforms.uFade,
    uFadeColor: cushionUniforms.uFadeColor,
  };

  const material = new THREE.MeshStandardMaterial({
    color: 0xf5f2ec,
    roughness: 1,
    metalness: 0,
    roughnessMap: ormMap,
    aoMap: ormMap,
    aoMapIntensity: 1,
    normalMap,
    normalScale: new THREE.Vector2(1, 1),
    vertexColors: true,
  });
  material.onBeforeCompile = (shader) => patchCushionShader(shader, cushionUniforms);
  material.customProgramCacheKey = () => "platy-cushion-v2";

  const floorMaterial = new THREE.MeshBasicMaterial({ color: 0x8a8798 });
  floorMaterial.onBeforeCompile = (shader) => patchFloorShader(shader, floorUniforms);
  floorMaterial.customProgramCacheKey = () => "platy-cushion-floor-v1";

  // ---- LOD tiers by grid offset (fixed: only the matrices change when the field recentres) -----
  const tierOf = new Uint8Array(N * N);
  const idxOf = new Uint16Array(N * N);
  const counts = [0, 0, 0];
  for (let oz = -HALF; oz <= HALF; oz++) {
    for (let ox = -HALF; ox <= HALF; ox++) {
      const cheb = Math.max(Math.abs(ox), Math.abs(oz));
      const tier = cheb <= 1 ? 0 : cheb <= 3 ? 1 : 2;
      const slot = (oz + HALF) * N + (ox + HALF);
      tierOf[slot] = tier;
      idxOf[slot] = counts[tier]++;
    }
  }

  const group = new THREE.Group();
  group.name = "cushionField";
  const inner = new THREE.Group();
  group.add(inner);

  const meshes = [], squishArr = [], squishAttr = [];
  const squishDirty = [false, false, false];
  let triangles = 2;
  for (let t = 0; t < 3; t++) {
    const arr = new Float32Array(counts[t] * 4);
    const attr = new THREE.InstancedBufferAttribute(arr, 4);
    attr.setUsage(THREE.DynamicDrawUsage);
    geos[t].setAttribute("aSquish", attr);
    const mesh = new THREE.InstancedMesh(geos[t], material, counts[t]);
    mesh.name = "cushions-lod" + t;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    inner.add(mesh);
    meshes.push(mesh);
    squishArr.push(arr);
    squishAttr.push(attr);
    triangles += geos[t].userData.triangles * counts[t];
  }

  // dark gap floor: one big quad that follows the focus and dissolves into white with the field
  const FLOOR_SIZE = 900;
  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([-FLOOR_SIZE, 0, -FLOOR_SIZE, -FLOOR_SIZE, 0, FLOOR_SIZE, FLOOR_SIZE, 0, FLOOR_SIZE, FLOOR_SIZE, 0, -FLOOR_SIZE]),
      3
    )
  );
  floorGeo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  floorGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const floor = new THREE.Mesh(floorGeo, floorMaterial);
  floor.name = "cushionGapFloor";
  floor.frustumCulled = false;
  floor.position.set(0, FLOOR_Y, 0);
  group.add(floor);

  // ---- per-cell variation (pure function of the cell, so wrapping never changes a cushion) ----
  let cpI = 0x7fffffff, cpJ = 0x7fffffff;
  let cpCos = 1, cpSin = 0, cpAngle = 0, cpSxz = 1, cpSy = 1, cpX = 0, cpZ = 0, cpY = 0, cpTint = 0, cpBright = 1;
  function cellParams(i, j) {
    if (i === cpI && j === cpJ) return;
    cpI = i;
    cpJ = j;
    const quarter = Math.floor(cellHash(i, j, 1) * 4);
    cpAngle = quarter * Math.PI * 0.5 + (cellHash(i, j, 2) - 0.5) * 0.056;
    cpCos = Math.cos(cpAngle);
    cpSin = Math.sin(cpAngle);
    cpSxz = 0.968 + 0.032 * cellHash(i, j, 3);
    cpSy = 0.96 + 0.08 * cellHash(i, j, 4);
    cpX = i * SPACING + (cellHash(i, j, 5) - 0.5) * 0.024;
    cpZ = j * SPACING + (cellHash(i, j, 6) - 0.5) * 0.024;
    cpY = FLOOR_Y * (1 - cpSy); // keep the underside on the floor
    cpTint = cellHash(i, j, 7);
    cpBright = 0.965 + 0.035 * cellHash(i, j, 8);
  }

  // world point -> cell + cushion object space. Results in loc*.
  let locI = 0, locJ = 0, locX = 0, locZ = 0;
  function toLocal(x, z) {
    locI = Math.round(x / SPACING);
    locJ = Math.round(z / SPACING);
    cellParams(locI, locJ);
    const wx = x - cpX, wz = z - cpZ;
    locX = (wx * cpCos - wz * cpSin) / cpSxz;
    locZ = (wx * cpSin + wz * cpCos) / cpSxz;
  }

  // ---- squish springs -------------------------------------------------------------------------
  const spActive = new Uint8Array(MAX_SPRINGS);
  const spI = new Int32Array(MAX_SPRINGS), spJ = new Int32Array(MAX_SPRINGS);
  const spD = new Float32Array(MAX_SPRINGS), spV = new Float32Array(MAX_SPRINGS);
  const spX = new Float32Array(MAX_SPRINGS), spZ = new Float32Array(MAX_SPRINGS);
  const spTX = new Float32Array(MAX_SPRINGS), spTZ = new Float32Array(MAX_SPRINGS);
  let activeCount = 0;

  let centreI = 0, centreJ = 0;

  function writeSquish(k, depth) {
    const ox = spI[k] - centreI, oz = spJ[k] - centreJ;
    if (ox < -HALF || ox > HALF || oz < -HALF || oz > HALF) return;
    const slot = (oz + HALF) * N + (ox + HALF);
    const tier = tierOf[slot];
    const o = idxOf[slot] * 4;
    const arr = squishArr[tier];
    arr[o] = spX[k];
    arr[o + 1] = spZ[k];
    arr[o + 2] = depth;
    squishDirty[tier] = true;
  }

  function press(x, z, force) {
    if (!(force > 0)) return;
    toLocal(x, z);
    const lim = A_HALF * 0.92;
    const lx = locX < -lim ? -lim : locX > lim ? lim : locX;
    const lz = locZ < -lim ? -lim : locZ > lim ? lim : locZ;
    let k = -1, free = -1, weakest = 0, weakestE = Infinity;
    for (let s = 0; s < MAX_SPRINGS; s++) {
      if (spActive[s]) {
        if (spI[s] === locI && spJ[s] === locJ) { k = s; break; }
        const e = Math.abs(spD[s]) + Math.abs(spV[s]) * 0.08;
        if (e < weakestE) { weakestE = e; weakest = s; }
      } else if (free < 0) free = s;
    }
    if (k < 0) {
      if (free >= 0) {
        k = free;
        activeCount++;
      } else {
        k = weakest;
        writeSquish(k, 0); // release the cushion this spring was driving
      }
      spActive[k] = 1;
      spI[k] = locI;
      spJ[k] = locJ;
      spD[k] = 0;
      spV[k] = 0;
      spX[k] = lx;
      spZ[k] = lz;
    }
    spTX[k] = lx;
    spTZ[k] = lz;
    let v = spV[k] + force * SPRING_J;
    if (v > SPRING_VMAX) v = SPRING_VMAX;
    spV[k] = v;
  }

  function heightAt(x, z) {
    toLocal(x, z);
    const px = locX / A_HALF, pz = locZ / A_HALF;
    const s = Math.pow(Math.abs(px), N_EXP) + Math.pow(Math.abs(pz), N_EXP);
    let y;
    if (s >= 1) {
      // in the gap between cushions: settle a little below the piped seam (a body spans the gap)
      const out = (Math.pow(s, 1 / N_EXP) - 1) * A_HALF;
      y = SEAM_Y - GAP_WALK_DROP * smooth01(out / GAP_WALK_WIDTH);
    } else {
      const q = 1 - Math.pow(s, M_TOP / N_EXP);
      const pp = px * pz;
      const f = Math.pow(q, P_TOP) * (1 - PINCH * pp * pp);
      y = SEAM_Y + H_TOP * f - dimpleWide(locX, locZ);
      if (activeCount > 0) {
        for (let k = 0; k < MAX_SPRINGS; k++) {
          if (spActive[k] && spI[k] === locI && spJ[k] === locJ) {
            const dx = locX - spX[k], dz = locZ - spZ[k];
            y -= spD[k] * (SQ_A0 + SQ_A1 * Math.exp(-(dx * dx + dz * dz) * SQ_INV_SIG2)) * f;
            break;
          }
        }
      }
    }
    return cpY + cpSy * y;
  }

  // ---- recentring ------------------------------------------------------------------------------
  const _m = new THREE.Matrix4();
  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _c = new THREE.Color();

  function recentre(ci, cj) {
    centreI = ci;
    centreJ = cj;
    const baseX = ci * SPACING, baseZ = cj * SPACING;
    inner.position.set(baseX, 0, baseZ);
    inner.updateMatrix();
    for (let oz = -HALF; oz <= HALF; oz++) {
      for (let ox = -HALF; ox <= HALF; ox++) {
        const slot = (oz + HALF) * N + (ox + HALF);
        const tier = tierOf[slot], index = idxOf[slot];
        cellParams(ci + ox, cj + oz);
        _p.set(cpX - baseX, cpY, cpZ - baseZ);
        _q.setFromAxisAngle(_up, cpAngle);
        _s.set(cpSxz, cpSy, cpSxz);
        _m.compose(_p, _q, _s);
        meshes[tier].setMatrixAt(index, _m);
        // warm <-> cool white
        const t = cpTint, b = cpBright;
        _c.setRGB(b * (1.0 - 0.04 * t), b * (0.985 - 0.005 * t), b * (0.955 + 0.045 * t));
        meshes[tier].setColorAt(index, _c);
      }
    }
    for (let t = 0; t < 3; t++) {
      meshes[t].instanceMatrix.needsUpdate = true;
      if (meshes[t].instanceColor) meshes[t].instanceColor.needsUpdate = true;
      squishArr[t].fill(0);
      squishDirty[t] = true;
    }
    for (let k = 0; k < MAX_SPRINGS; k++) if (spActive[k]) writeSquish(k, spD[k]);
  }

  function stepSprings(h) {
    const follow = 1 - Math.exp(-16 * h);
    for (let k = 0; k < MAX_SPRINGS; k++) {
      if (!spActive[k]) continue;
      let d = spD[k], v = spV[k];
      v += (-SPRING_W * SPRING_W * d - 2 * SPRING_Z * SPRING_W * v) * h;
      d += v * h;
      if (d > SPRING_DMAX) { d = SPRING_DMAX; if (v > 0) v = 0; }
      else if (d < SPRING_DMIN) { d = SPRING_DMIN; if (v < 0) v = 0; }
      spD[k] = d;
      spV[k] = v;
      spX[k] += (spTX[k] - spX[k]) * follow;
      spZ[k] += (spTZ[k] - spZ[k]) * follow;
    }
  }

  function update(dt, focusX, focusZ) {
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    if (!Number.isFinite(focusX)) focusX = 0;
    if (!Number.isFinite(focusZ)) focusZ = 0;

    let ci = centreI, cj = centreJ;
    if (Math.abs(focusX - ci * SPACING) > HYST) ci = Math.round(focusX / SPACING);
    if (Math.abs(focusZ - cj * SPACING) > HYST) cj = Math.round(focusZ / SPACING);
    if (ci !== centreI || cj !== centreJ) recentre(ci, cj);

    cushionUniforms.uFocus.value.set(focusX - inner.position.x, focusZ - inner.position.z);
    floor.position.set(focusX, FLOOR_Y - 0.002, focusZ);

    if (activeCount > 0 && dt > 0) {
      if (dt > 0.02) {
        stepSprings(dt * 0.5);
        stepSprings(dt * 0.5);
      } else stepSprings(dt);
      for (let k = 0; k < MAX_SPRINGS; k++) {
        if (!spActive[k]) continue;
        if (Math.abs(spD[k]) < 0.002 && Math.abs(spV[k]) < 0.03) {
          spActive[k] = 0;
          spD[k] = 0;
          spV[k] = 0;
          activeCount--;
          writeSquish(k, 0);
        } else writeSquish(k, spD[k]);
      }
    }
    for (let t = 0; t < 3; t++) {
      if (squishDirty[t]) {
        squishAttr[t].needsUpdate = true;
        squishDirty[t] = false;
      }
    }
  }

  function setFade(start, end) {
    cushionUniforms.uFade.value.set(start, Math.max(start + 0.01, Math.min(end, fieldRadius)));
  }

  function dispose() {
    for (let t = 0; t < 3; t++) {
      geos[t].dispose();
      meshes[t].dispose();
    }
    floorGeo.dispose();
    material.dispose();
    floorMaterial.dispose();
    normalMap.dispose();
    ormMap.dispose();
    weaveMap.dispose();
  }

  recentre(0, 0);
  update(0, 0, 0);

  return {
    group,
    update,
    heightAt,
    press,
    SPACING,
    // extras
    setFade,
    dispose,
    fadeColor, // THREE.Color the field dissolves into at its rim (default white)
    fadeStart,
    fadeEnd,
    fieldRadius,
    seamY: SEAM_Y, // height of the valleys between cushions (piped seam)
    floorY: FLOOR_Y, // dark gap floor
    cushionSize: A_HALF * 2,
    material,
    triangles,
    drawCalls: 4,
  };
}
