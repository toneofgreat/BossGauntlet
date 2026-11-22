// circus.js - the circus at night (LEVELS2.md B10). createCircus(ctx) -> world (key "circus").
// A travelling circus after the last show: a striped big top, a wagon row, a midway, a back lot and a helipad.
// Everything static is baked into a handful of vertex-coloured meshes; cloth moves in the vertex shader; lamps are
// emissive meshes + additive cones + ground discs (no real lights). update() writes uniforms and a few matrices.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const pt = (x, y, z, yaw) => (yaw === undefined ? { x, y, z } : { x, y, z, yaw });
const camPair = (px, py, pz, lx, ly, lz) => ({ pos: pt(px, py, pz), look: pt(lx, ly, lz) });

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------------------------------------ layout
const LOT = { minX: -40, maxX: 40, minZ: -30, maxZ: 52 };
const TENT = { x: 0, z: 8, r: 17, wallH: 3.6, poleH: 14, poleX: 5 };
const RING_R = 6.5, CURB_W = 0.35, CURB_H = 0.35;
const BL_R0 = 9.2, BL_R1 = 15.2; // bleachers
const FENCE_Z = 39; // the inner fence in front of the helipad
const GATE_HALF = 1.6;
const GAP_X = -18; // the loose board
const PAD = { x: 0, z: 46, r: 5 };
const CAGE = { x: -30, z: -20, x0: -31.5, x1: -28.5, z0: -21, z1: -19, floor: 0.9, doorHalf: 0.6 };
// tent doors: direction from the tent centre, half-width
const DOORS = [
  { name: "doorWest", ux: -1, uz: 0, half: 1.7 },
  { name: "doorSouth", ux: 0, uz: -1, half: 2.2 },
  { name: "doorNorth", ux: 0, uz: 1, half: 1.5 },
];
// aisles through the bleachers (constant width): the three door passages and the four diagonals
const D = Math.SQRT1_2;
const AISLES = [
  { ux: -1, uz: 0, half: 1.8 }, { ux: 0, uz: -1, half: 2.3 }, { ux: 0, uz: 1, half: 1.7 },
  { ux: D, uz: D, half: 2.0 }, { ux: -D, uz: D, half: 2.0 }, { ux: -D, uz: -D, half: 2.0 }, { ux: D, uz: -D, half: 2.0 },
];
// wagons: long axis = local +z (yaw PI/2 = along world x). Two staggered lines.
const WAGONS = [
  { x: -20, z: -20.4, yaw: Math.PI / 2 + 0.03 }, { x: -12.5, z: -20.5, yaw: Math.PI / 2 - 0.04 }, { x: -5.5, z: -20.3, yaw: Math.PI / 2 + 0.02 },
  { x: -23, z: -15.8, yaw: Math.PI / 2 - 0.02 }, { x: -15.5, z: -15.6, yaw: Math.PI / 2 + 0.05 }, { x: -8, z: -15.7, yaw: Math.PI / 2 - 0.03 },
];
const WAGON_HL = 2.5, WAGON_HW = 1.1;
const CALLIOPE = { x: 12, z: 31, yaw: Math.PI / 2 };
const TRUCK = { x: -12, z: 33, yaw: 0, hl: 3.0, hw: 1.2 };
const BOOTH = { x: 22, z: -6 };
const GENERATOR = { x: 30, z: 12 };
const BELL = { x: -2, z: -18 };
const PROPS = { x: -9, z: 14 };
const DRAPE = { x: 9, z: 2 };
const HAY = { x: 0, z: 27 };
const BARRELS = [{ x: -22, z: 2 }, { x: -9.2, z: 30.6 }, { x: 24, z: 14 }];
const CRATES = [
  [-5.0, 31.7, 0.75], [-6.2, 32.8, 0.6], [5.6, 34.6, 0.75], [9.4, 28.2, 0.7], [-7.4, 36.6, 0.7], [8.4, 36.8, 0.75], [3.2, 37.2, 0.6],
  [-26.5, -10.5, 0.7], [-2.4, -13.6, 0.65], [18.6, -15, 0.7], [20.5, 22, 0.75], [-20, 20, 0.7], [15.5, 26.5, 0.65],
];
const STALLS = [{ x: 34, z: -14 }, { x: 34, z: -4 }, { x: 34, z: 6 }, { x: 34, z: 16 }];
// static lamp pools (lit 0.8)
const LAMPS = [
  { x: 0, z: -12, r: 4.6 }, { x: -9.5, z: -17.5, r: 3.0 }, { x: 27, z: -12, r: 4.2 }, { x: 27, z: 4, r: 4.2 },
  { x: 0, z: 33, r: 5.0 }, { x: -3.6, z: 37.6, r: 2.6 }, { x: 3.6, z: 37.6, r: 2.6 }, { x: 22.5, z: -8, r: 2.6 },
];
const SPOT_R = 2.6;

const ENVS = {
  night: { background: 0x070b1a, fog: [0x0a1126, 34, 128], hemi: [0x6f83b8, 0x3a2f28, 0.95], sun: [0xa9c1ff, 0.62], sunDir: [0.42, 0.72, -0.36], far: 150, dark: true },
  dark: { background: 0x04060f, fog: [0x060a18, 22, 100], hemi: [0x4a5a8c, 0x1c1814, 0.7], sun: [0x93aef5, 0.5], sunDir: [0.42, 0.72, -0.36], far: 150, dark: true },
  alarm: { background: 0x0b0d1c, fog: [0x141126, 36, 128], hemi: [0x9aa0c8, 0x57382c, 1.15], sun: [0xc9d2ff, 0.7], sunDir: [0.42, 0.72, -0.36], far: 150, dark: true },
};

// ------------------------------------------------------------------------------------------------ baker
// Accumulates transformed primitives into one vertex-coloured BufferGeometry (position, normal, color, aSway).
function createBaker(THREE) {
  const pos = [], nor = [], col = [], sway = [];
  const M = new THREE.Matrix4(), B = new THREE.Matrix4(), T = new THREE.Matrix4(), N = new THREE.Matrix3();
  const v = new THREE.Vector3(), c = new THREE.Color(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, "YXZ"), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  const unitBox = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const cyls = {};
  const rnd = mulberry(77);
  const cyl = (seg, open) => {
    const k = seg + (open ? "o" : "c");
    if (!cyls[k]) cyls[k] = new THREE.CylinderGeometry(1, 1, 1, seg, 1, !!open).toNonIndexed();
    return cyls[k];
  };
  const api = {
    ao: 0.28, jitter: 0.05,
    base(x, y, z, yaw) { B.makeRotationY(yaw || 0); B.setPosition(x || 0, y || 0, z || 0); return api; },
    // geo: non-indexed geometry in unit space; ao darkens the low vertices; top = radius scale of the +y end (cones)
    add(geo, hex, top) {
      T.multiplyMatrices(B, M);
      N.getNormalMatrix(T);
      const P = geo.attributes.position, Nn = geo.attributes.normal;
      c.set(hex);
      const j = 1 + (rnd() - 0.5) * 2 * api.jitter;
      const r = c.r * j, g = c.g * j, b = c.b * j;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i);
        const ly = v.y;
        if (top !== undefined && ly > 0) { v.x *= top; v.z *= top; }
        v.applyMatrix4(T);
        pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(Nn, i).applyMatrix3(N).normalize();
        nor.push(v.x, v.y, v.z);
        const k = 1 - api.ao * (0.5 - clamp(ly, -0.5, 0.5));
        col.push(r * k, g * k, b * k);
        sway.push(0);
      }
      return api;
    },
    box(hex, x, y, z, sx, sy, sz, ry, rx, rz) {
      e.set(rx || 0, ry || 0, rz || 0); q.setFromEuler(e);
      M.compose(p.set(x, y, z), q, s.set(sx, sy, sz));
      return api.add(unitBox, hex);
    },
    // upright (or rotated) cylinder: r1 = top radius, r0 = bottom radius, centred at (x, y, z)
    cyl(hex, x, y, z, r1, r0, h, seg, rx, ry, rz, open) {
      e.set(rx || 0, ry || 0, rz || 0); q.setFromEuler(e);
      M.compose(p.set(x, y, z), q, s.set(r0, h, r0));
      return api.add(cyl(seg || 8, open), hex, r0 > 0 ? r1 / r0 : 1);
    },
    // a round bar from a to b
    beam(hex, x0, y0, z0, x1, y1, z1, r, seg) {
      dir.set(x1 - x0, y1 - y0, z1 - z0);
      const len = dir.length();
      if (len < 1e-5) return api;
      q.setFromUnitVectors(up, dir.divideScalar(len));
      M.compose(p.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), q, s.set(r, len, r));
      return api.add(cyl(seg || 5, true), hex);
    },
    // a raw triangle in BASE space, own colours and sway weights (cloth)
    tri(ax, ay, az, bx, by, bz, cx, cy, cz, hexA, hexB, hexC, wa, wb, wc) {
      const o = pos.length;
      v.set(ax, ay, az).applyMatrix4(B); pos.push(v.x, v.y, v.z); const Ax = v.x, Ay = v.y, Az = v.z;
      v.set(bx, by, bz).applyMatrix4(B); pos.push(v.x, v.y, v.z); const Bx = v.x, By = v.y, Bz = v.z;
      v.set(cx, cy, cz).applyMatrix4(B); pos.push(v.x, v.y, v.z);
      s.set(Bx - Ax, By - Ay, Bz - Az); p.set(v.x - Ax, v.y - Ay, v.z - Az); s.cross(p).normalize();
      for (let i = 0; i < 3; i++) nor.push(s.x, s.y, s.z);
      c.set(hexA); col.push(c.r, c.g, c.b);
      c.set(hexB === undefined ? hexA : hexB); col.push(c.r, c.g, c.b);
      c.set(hexC === undefined ? hexA : hexC); col.push(c.r, c.g, c.b);
      sway.push(wa || 0, wb || 0, wc || 0);
      return o;
    },
    quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, hex, wa, wb, wc, wd, hex2) {
      const h2 = hex2 === undefined ? hex : hex2;
      api.tri(ax, ay, az, bx, by, bz, cx, cy, cz, hex, hex, h2, wa, wb, wc);
      api.tri(ax, ay, az, cx, cy, cz, dx, dy, dz, hex, h2, h2, wa, wc, wd);
    },
    count() { return pos.length / 9; },
    // smooth = average the normals of coincident vertices (cloth)
    build(smooth) {
      if (smooth) {
        const map = new Map();
        const key = (i) => Math.round(pos[i] * 200) + "," + Math.round(pos[i + 1] * 200) + "," + Math.round(pos[i + 2] * 200);
        for (let i = 0; i < pos.length; i += 3) {
          const k = key(i);
          let a = map.get(k);
          if (!a) { a = [0, 0, 0]; map.set(k, a); }
          a[0] += nor[i]; a[1] += nor[i + 1]; a[2] += nor[i + 2];
        }
        for (let i = 0; i < pos.length; i += 3) {
          const a = map.get(key(i));
          const l = Math.hypot(a[0], a[1], a[2]) || 1;
          nor[i] = a[0] / l; nor[i + 1] = a[1] / l; nor[i + 2] = a[2] / l;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nor), 3));
      g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
      g.setAttribute("aSway", new THREE.BufferAttribute(new Float32Array(sway), 1));
      g.computeBoundingSphere();
      return g;
    },
  };
  B.identity(); M.identity();
  return api;
}

// ------------------------------------------------------------------------------------------------ 2D helpers
function makeObb(x, z, yaw, hl, hw, h) { return { x, z, yaw, c: Math.cos(yaw), s: Math.sin(yaw), hl, hw, h: h || 2 }; }
function inObb(o, x, z, m) {
  const dx = x - o.x, dz = z - o.z;
  const lz = dx * o.s + dz * o.c, lx = dx * o.c - dz * o.s;
  return lz > -o.hl - m && lz < o.hl + m && lx > -o.hw - m && lx < o.hw + m;
}
// does the segment cross the box? (slab clipping in the box's frame)
function segObb(o, x0, z0, x1, z1) {
  let dx = x0 - o.x, dz = z0 - o.z;
  const az = dx * o.s + dz * o.c, ax = dx * o.c - dz * o.s;
  dx = x1 - o.x; dz = z1 - o.z;
  const bz = dx * o.s + dz * o.c, bx = dx * o.c - dz * o.s;
  let t0 = 0, t1 = 1;
  const ex = bx - ax, ez = bz - az;
  if (Math.abs(ex) < 1e-9) { if (ax < -o.hw || ax > o.hw) return false; }
  else {
    let a = (-o.hw - ax) / ex, b = (o.hw - ax) / ex;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1) return false;
  }
  if (Math.abs(ez) < 1e-9) { if (az < -o.hl || az > o.hl) return false; }
  else {
    let a = (-o.hl - az) / ez, b = (o.hl - az) / ez;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1) return false;
  }
  return true;
}
// push obj out of the box (radius r) along the axis of least penetration
function pushObb(o, obj, r) {
  const dx = obj.x - o.x, dz = obj.z - o.z;
  let lz = dx * o.s + dz * o.c, lx = dx * o.c - dz * o.s;
  const pz = o.hl + r - Math.abs(lz), px = o.hw + r - Math.abs(lx);
  if (pz <= 0 || px <= 0) return false;
  if (px < pz) lx = (lx < 0 ? -1 : 1) * (o.hw + r); else lz = (lz < 0 ? -1 : 1) * (o.hl + r);
  obj.x = o.x + lx * o.c + lz * o.s;
  obj.z = o.z - lx * o.s + lz * o.c;
  return true;
}

function bump(x, z) {
  const dt = Math.hypot(x - TENT.x, z - TENT.z), dp = Math.hypot(x - PAD.x, z - PAD.z);
  const m = sm(18.5, 23, dt) * sm(6, 9, dp);
  return 0.07 * (Math.sin(x * 0.31 + 1.3) * Math.cos(z * 0.27) + Math.sin(x * 0.13 - z * 0.19 + 2)) * m;
}
function inCage(x, z) { return x > CAGE.x0 && x < CAGE.x1 && z > CAGE.z0 && z < CAGE.z1; }
function heightAt(x, z) {
  if (inCage(x, z)) return CAGE.floor;
  const dx = x - TENT.x, dz = z - TENT.z, d2 = dx * dx + dz * dz;
  if (d2 < (RING_R + CURB_W) * (RING_R + CURB_W)) return d2 < RING_R * RING_R ? 0.04 : CURB_H;
  return bump(x, z);
}
function inBleacher(x, z, m) {
  const dx = x - TENT.x, dz = z - TENT.z, d = Math.sqrt(dx * dx + dz * dz);
  if (d < BL_R0 - m || d > BL_R1 + m) return false;
  for (let i = 0; i < AISLES.length; i++) {
    const a = AISLES[i];
    if (dx * a.ux + dz * a.uz > 0 && Math.abs(dx * a.uz - dz * a.ux) < a.half - m) return false;
  }
  return true;
}

// ------------------------------------------------------------------------------------------------ textures
function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
const GW = 84, GH = 86, GX0 = -42, GZ0 = -32; // ground texture window

function paintGround(S) {
  const cv = makeCanvas(S, S), g = cv.getContext("2d"), rnd = mulberry(4242);
  const X = (x) => ((x - GX0) / GW) * S, Z = (z) => ((z - GZ0) / GH) * S, R = (r) => (r / GW) * S;
  g.fillStyle = "#3f4f2c"; g.fillRect(0, 0, S, S);
  const blob = (x, z, r, rgb, a) => {
    const gr = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), R(r));
    gr.addColorStop(0, "rgba(" + rgb + "," + a + ")"); gr.addColorStop(0.6, "rgba(" + rgb + "," + a * 0.7 + ")"); gr.addColorStop(1, "rgba(" + rgb + ",0)");
    g.fillStyle = gr; g.beginPath(); g.arc(X(x), Z(z), R(r), 0, TAU); g.fill();
  };
  // grass variation
  for (let i = 0; i < 520; i++) blob(GX0 + rnd() * GW, GZ0 + rnd() * GH, 1.5 + rnd() * 4, rnd() < 0.5 ? "58,76,40" : "46,58,34", 0.35);
  // trampled dirt: around the tent, the wagon lanes, the midway, the way to the gate
  const DIRT = "112,92,68";
  for (let i = 0; i < 46; i++) { const a = (i / 46) * TAU; blob(TENT.x + Math.cos(a) * 19, TENT.z + Math.sin(a) * 19, 3.6, DIRT, 0.55); }
  for (let x = -27; x <= -1; x += 1.6) { blob(x, -18, 2.2, DIRT, 0.6); blob(x, -12.6, 2.0, DIRT, 0.45); blob(x, -23.7, 1.8, DIRT, 0.4); }
  for (let z = -22; z <= 22; z += 1.6) { blob(27 + Math.sin(z * 0.4) * 0.8, z, 4.4, DIRT, 0.55); }
  for (let z = -22; z <= -9; z += 1.4) blob(0, z, 3.0, DIRT, 0.6);
  for (let z = 25; z <= 46; z += 1.4) blob(Math.sin(z) * 0.5, z, 2.6, DIRT, 0.55);
  for (let z = -18; z <= 8; z += 1.5) blob(-25 + (z + 18) * 0.24, z, 1.8, DIRT, 0.4);
  for (let x = -18; x <= 18; x += 1.6) blob(x, 33 + Math.sin(x * 0.5), 3.2, DIRT, 0.35);
  // the tent floor
  g.fillStyle = "#6f5b44"; g.beginPath(); g.arc(X(TENT.x), Z(TENT.z), R(17.4), 0, TAU); g.fill();
  for (let i = 0; i < 260; i++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * 17; blob(TENT.x + Math.cos(a) * r, TENT.z + Math.sin(a) * r, 0.8 + rnd() * 2, rnd() < 0.5 ? "128,104,76" : "92,74,56", 0.3); }
  // the hippodrome track and the sawdust ring
  g.strokeStyle = "rgba(150,124,90,0.7)"; g.lineWidth = R(2.2); g.beginPath(); g.arc(X(TENT.x), Z(TENT.z), R(7.9), 0, TAU); g.stroke();
  g.fillStyle = "#c9a877"; g.beginPath(); g.arc(X(TENT.x), Z(TENT.z), R(RING_R + 0.05), 0, TAU); g.fill();
  for (let i = 0; i < 300; i++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * RING_R; blob(TENT.x + Math.cos(a) * r, TENT.z + Math.sin(a) * r, 0.3 + rnd() * 0.9, rnd() < 0.5 ? "226,196,146" : "168,136,92", 0.35); }
  g.strokeStyle = "rgba(120,92,58,0.45)"; g.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) { const a0 = rnd() * TAU; g.beginPath(); g.arc(X(TENT.x), Z(TENT.z), R(1 + i * 0.62 + rnd() * 0.2), a0, a0 + 4); g.stroke(); }
  // the helipad
  g.fillStyle = "#7d7f80"; g.beginPath(); g.arc(X(PAD.x), Z(PAD.z), R(PAD.r + 0.35), 0, TAU); g.fill();
  for (let i = 0; i < 160; i++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * PAD.r; blob(PAD.x + Math.cos(a) * r, PAD.z + Math.sin(a) * r, 0.3 + rnd() * 0.8, rnd() < 0.5 ? "140,142,142" : "96,98,100", 0.3); }
  g.strokeStyle = "#e8c53a"; g.lineWidth = R(0.3); g.beginPath(); g.arc(X(PAD.x), Z(PAD.z), R(PAD.r - 0.5), 0, TAU); g.stroke();
  g.strokeStyle = "#f2efe6"; g.lineWidth = R(0.5); g.lineCap = "butt";
  g.beginPath();
  g.moveTo(X(PAD.x - 1.3), Z(PAD.z - 2)); g.lineTo(X(PAD.x - 1.3), Z(PAD.z + 2));
  g.moveTo(X(PAD.x + 1.3), Z(PAD.z - 2)); g.lineTo(X(PAD.x + 1.3), Z(PAD.z + 2));
  g.moveTo(X(PAD.x - 1.3), Z(PAD.z)); g.lineTo(X(PAD.x + 1.3), Z(PAD.z));
  g.stroke();
  // fine speckle everywhere (straw, stones), confetti near the entrance
  for (let i = 0; i < 9000; i++) {
    const v = (40 + rnd() * 120) | 0;
    g.fillStyle = "rgba(" + v + "," + ((v * 0.95) | 0) + "," + ((v * 0.7) | 0) + ",0.22)";
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  const CONF = ["#d8453a", "#f0d25a", "#4fa3d8", "#f2efe6", "#6fc46a"];
  g.globalAlpha = 0.6;
  for (let i = 0; i < 500; i++) {
    g.fillStyle = CONF[(rnd() * 5) | 0];
    const a = rnd() * TAU, r = rnd() * 7;
    g.fillRect(X(Math.cos(a) * r * 0.7), Z(-12 + Math.sin(a) * r), 1.6, 1.6);
  }
  g.globalAlpha = 1;
  return cv;
}

const ATLAS = {
  wagonA: [0, 0, 512, 224], wagonB: [512, 0, 512, 224], wagonC: [0, 224, 512, 224], calliope: [512, 224, 512, 224],
  poster: [0, 448, 320, 448], tickets: [320, 448, 352, 128], stall0: [320, 576, 352, 96], stall1: [320, 672, 352, 96],
  stall2: [320, 768, 352, 96], stall3: [320, 864, 352, 96], staff: [672, 448, 352, 128], striker: [672, 576, 96, 448], star: [768, 576, 256, 256],
};
function paintAtlas() {
  const S = 1024, cv = makeCanvas(S, S), g = cv.getContext("2d"), rnd = mulberry(99);
  g.fillStyle = "#222"; g.fillRect(0, 0, S, S);
  g.textAlign = "center"; g.textBaseline = "middle";
  const GOLD = "#e7b94a", GOLD2 = "#8f6a1c";
  const scroll = (x, y, r, flip) => {
    g.strokeStyle = GOLD; g.lineWidth = Math.max(2, r * 0.16); g.lineCap = "round";
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = t * 4.4 * (flip ? -1 : 1) + (flip ? Math.PI : 0), rr = r * (1 - t * 0.82);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.stroke();
  };
  const panel = (rc, bg, bg2, line1, line2, textCol) => {
    const x = rc[0], y = rc[1], w = rc[2], h = rc[3];
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, bg); gr.addColorStop(1, bg2);
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    // plank lines and wear
    g.strokeStyle = "rgba(0,0,0,0.18)"; g.lineWidth = 1.5;
    for (let i = 1; i < 12; i++) { g.beginPath(); g.moveTo(x + (w * i) / 12, y); g.lineTo(x + (w * i) / 12, y + h); g.stroke(); }
    for (let i = 0; i < 220; i++) { g.fillStyle = "rgba(0,0,0," + rnd() * 0.12 + ")"; g.fillRect(x + rnd() * (w - 4), y + rnd() * (h - 20), 1 + rnd() * 3, 3 + rnd() * 16); }
    // gilded frame + corner scrolls
    g.strokeStyle = GOLD2; g.lineWidth = 9; g.strokeRect(x + 10, y + 10, w - 20, h - 20);
    g.strokeStyle = GOLD; g.lineWidth = 4; g.strokeRect(x + 10, y + 10, w - 20, h - 20);
    g.lineWidth = 2; g.strokeRect(x + 22, y + 22, w - 44, h - 44);
    const r = Math.min(34, h * 0.16);
    scroll(x + 22 + r * 1.3, y + 22 + r * 1.3, r, false); scroll(x + w - 22 - r * 1.3, y + 22 + r * 1.3, r, true);
    scroll(x + 22 + r * 1.3, y + h - 22 - r * 1.3, r, true); scroll(x + w - 22 - r * 1.3, y + h - 22 - r * 1.3, r, false);
    const big = line2 ? h * 0.3 : h * 0.4;
    g.font = "bold " + big + "px Georgia, serif";
    const cy = y + h * (line2 ? 0.4 : 0.5);
    g.fillStyle = "rgba(0,0,0,0.55)"; g.fillText(line1, x + w / 2 + 3, cy + 4, w - 150);
    g.fillStyle = textCol || GOLD; g.fillText(line1, x + w / 2, cy, w - 150);
    if (line2) {
      g.font = "italic bold " + h * 0.17 + "px Georgia, serif";
      g.fillStyle = "#f6ead0"; g.fillText(line2, x + w / 2, y + h * 0.7, w - 170);
    }
  };
  panel(ATLAS.wagonA, "#8e1f1c", "#5e1210", "GRAND CIRCUS", "wonders of the world");
  panel(ATLAS.wagonB, "#1e4d6b", "#12314a", "MENAGERIE", "rare & curious beasts");
  panel(ATLAS.wagonC, "#27543a", "#173524", "THE AMAZING PLATYPUS", "do not feed");
  panel(ATLAS.calliope, "#6a2a6e", "#3d1642", "STEAM CALLIOPE", "music of the spheres");
  panel(ATLAS.tickets, "#8e1f1c", "#5e1210", "TICKETS", null, "#f6ead0");
  panel(ATLAS.stall0, "#1e4d6b", "#12314a", "RING TOSS", null, "#f6ead0");
  panel(ATLAS.stall1, "#8e1f1c", "#5e1210", "POPCORN", null, "#f6ead0");
  panel(ATLAS.stall2, "#27543a", "#173524", "PRIZES", null, "#f6ead0");
  panel(ATLAS.stall3, "#b0792a", "#7a4f16", "LEMONADE", null, "#f6ead0");
  panel(ATLAS.staff, "#2a2a2e", "#18181c", "STAFF ONLY", null, "#f0d25a");
  // the poster
  {
    const x = ATLAS.poster[0], y = ATLAS.poster[1], w = ATLAS.poster[2], h = ATLAS.poster[3];
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, "#f3e2b4"); gr.addColorStop(1, "#e2c88c");
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.strokeStyle = "#a3261f"; g.lineWidth = 10; g.strokeRect(x + 9, y + 9, w - 18, h - 18);
    g.save(); g.beginPath(); g.rect(x + 16, y + 16, w - 32, h - 32); g.clip();
    for (let i = 0; i < 24; i += 2) {
      g.fillStyle = "rgba(214,84,48,0.4)"; g.beginPath(); g.moveTo(x + w / 2, y + h * 0.56);
      g.arc(x + w / 2, y + h * 0.56, w, (i / 24) * TAU, ((i + 1) / 24) * TAU); g.fill();
    }
    g.restore();
    g.fillStyle = "#a3261f"; g.font = "bold 40px Georgia, serif"; g.fillText("THE AMAZING", x + w / 2, y + 62, w - 40);
    g.font = "bold 62px Georgia, serif"; g.fillStyle = "#3a1c12"; g.fillText("PLATYPUS", x + w / 2 + 2, y + 124, w - 30);
    g.fillStyle = "#c4352a"; g.fillText("PLATYPUS", x + w / 2, y + 121, w - 30);
    // the star of the show: a platypus on a drum
    const cx = x + w / 2, cy = y + h * 0.56;
    g.fillStyle = "#5b3a22";
    g.beginPath(); g.ellipse(cx, cy, 78, 34, -0.08, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(cx - 98, cy + 10, 44, 17, 0.12, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(cx + 70, cy - 12, 30, 24, 0, 0, TAU); g.fill();
    g.fillStyle = "#2c2c30"; g.beginPath(); g.ellipse(cx + 112, cy - 6, 30, 11, 0.05, 0, TAU); g.fill();
    g.fillStyle = "#3d2616";
    const feet = [-44, -8, 34, 60];
    for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(cx + feet[i], cy + 32, 13, 8, 0, 0, TAU); g.fill(); }
    g.fillStyle = "#fff"; g.beginPath(); g.arc(cx + 80, cy - 20, 5, 0, TAU); g.fill();
    g.fillStyle = "#000"; g.beginPath(); g.arc(cx + 81, cy - 20, 2.6, 0, TAU); g.fill();
    g.fillStyle = "#c4352a"; g.fillRect(cx - 70, cy + 40, 140, 46);
    g.strokeStyle = "#f0d25a"; g.lineWidth = 4;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(cx - 70 + i * 23.3, cy + 40); g.lineTo(cx - 58 + i * 23.3, cy + 86); g.stroke(); }
    g.fillStyle = "#f0d25a"; g.fillRect(cx - 74, cy + 36, 148, 7); g.fillRect(cx - 74, cy + 83, 148, 7);
    g.fillStyle = "#a3261f"; g.fillRect(x + 30, y + h - 112, w - 60, 62);
    g.fillStyle = "#f6ead0"; g.font = "bold 46px Georgia, serif"; g.fillText("TONIGHT", x + w / 2, y + h - 80, w - 80);
    g.fillStyle = "#3a1c12"; g.font = "italic 20px Georgia, serif"; g.fillText("one night only", x + w / 2, y + h - 30);
  }
  // the high-striker scale
  {
    const x = ATLAS.striker[0], y = ATLAS.striker[1], w = ATLAS.striker[2], h = ATLAS.striker[3];
    g.fillStyle = "#f3e2b4"; g.fillRect(x, y, w, h);
    const cols = ["#6fc46a", "#b7d24a", "#f0d25a", "#f09a3a", "#d8453a"];
    for (let i = 0; i < 5; i++) { g.fillStyle = cols[i]; g.fillRect(x + 8, y + h - 12 - (i + 1) * ((h - 24) / 5), w - 16, (h - 24) / 5 - 4); }
    g.fillStyle = "#3a1c12"; g.font = "bold 22px Georgia, serif";
    for (let i = 0; i < 5; i++) g.fillText(String((i + 1) * 20), x + w / 2, y + h - 12 - (i + 0.5) * ((h - 24) / 5));
  }
  // a painted star
  {
    const x = ATLAS.star[0], y = ATLAS.star[1], w = ATLAS.star[2], h = ATLAS.star[3];
    g.fillStyle = "#8e1f1c"; g.fillRect(x, y, w, h);
    g.fillStyle = "#f0d25a"; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, r = i % 2 ? w * 0.18 : w * 0.44; g.lineTo(x + w / 2 + Math.cos(a) * r, y + h / 2 + Math.sin(a) * r); }
    g.closePath(); g.fill();
  }
  return cv;
}

// ------------------------------------------------------------------------------------------------ shaders
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = normalize( position );
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;
const SKY_FRAG = /* glsl */ `
uniform float uTime, uStars;
uniform vec3 uZenith, uHorizon, uMoonDir;
varying vec3 vDir;
float hash3( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
void main() {
	vec3 d = normalize( vDir );
	float h = clamp( d.y, 0.0, 1.0 );
	vec3 col = mix( uHorizon, uZenith, pow( h, 0.45 ) );
	// stars: two cell sizes, twinkling
	vec3 p = d * 70.0; vec3 ip = floor( p ); vec3 fp = fract( p ) - 0.5;
	float s = hash3( ip );
	float tw = 0.7 + 0.3 * sin( uTime * ( 1.0 + s * 3.0 ) + s * 40.0 );
	float st = step( 0.972, s ) * ( 1.0 - smoothstep( 0.05, 0.3, length( fp + ( vec3( hash3( ip + 1.0 ), hash3( ip + 2.0 ), hash3( ip + 3.0 ) ) - 0.5 ) * 0.5 ) ) ) * tw;
	p = d * 150.0; ip = floor( p ); fp = fract( p ) - 0.5; s = hash3( ip + 9.0 );
	st += step( 0.955, s ) * ( 1.0 - smoothstep( 0.1, 0.42, length( fp ) ) ) * 0.4;
	col += vec3( 0.86, 0.9, 1.0 ) * st * uStars * smoothstep( 0.02, 0.25, d.y );
	// the moon and its halo
	float m = dot( d, normalize( uMoonDir ) );
	col += vec3( 0.95, 0.96, 1.0 ) * smoothstep( 0.99925, 0.9995, m ) * 1.2;
	col += vec3( 0.32, 0.4, 0.62 ) * pow( max( m, 0.0 ), 48.0 ) * 0.5;
	// a ragged line of trees on the horizon
	float a = atan( d.z, d.x );
	float tree = 0.035 + 0.016 * sin( a * 37.0 ) + 0.011 * sin( a * 91.0 + 1.7 ) + 0.008 * sin( a * 203.0 );
	col = mix( vec3( 0.012, 0.018, 0.03 ), col, smoothstep( tree, tree + 0.006, d.y ) );
	gl_FragColor = vec4( col, 1.0 );
	#include <colorspace_fragment>
}
`;
const DISC_VERT = /* glsl */ `
attribute vec4 aCol;
varying vec2 vUv;
varying vec4 vCol;
void main() {
	vUv = uv * 2.0 - 1.0;
	vCol = aCol;
	gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
}
`;
const DISC_FRAG = /* glsl */ `
uniform float uLamp, uSpot;
varying vec2 vUv;
varying vec4 vCol;
void main() {
	float d = length( vUv );
	float a = ( 1.0 - smoothstep( 0.5, 1.0, d ) ) * ( 0.7 + 0.3 * ( 1.0 - d ) );
	float lv = vCol.a < 0.5 ? uLamp : uSpot;
	gl_FragColor = vec4( vCol.rgb * a * lv, 1.0 );
	#include <colorspace_fragment>
}
`;
const CONE_VERT = /* glsl */ `
attribute vec4 aCol;
varying float vH;
varying vec3 vN, vV;
varying vec4 vCol;
void main() {
	vH = - position.y;
	vCol = aCol;
	vec4 mv = modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
	vN = normalize( normalMatrix * mat3( instanceMatrix ) * normal );
	vV = normalize( - mv.xyz );
	gl_Position = projectionMatrix * mv;
}
`;
const CONE_FRAG = /* glsl */ `
uniform float uLamp, uSpot;
varying float vH;
varying vec3 vN, vV;
varying vec4 vCol;
void main() {
	float edge = pow( abs( dot( normalize( vN ), normalize( vV ) ) ), 1.4 );
	float a = ( pow( 1.0 - vH, 1.3 ) * 0.85 + 0.07 ) * edge * smoothstep( 1.0, 0.9, vH );
	float lv = vCol.a < 0.5 ? uLamp : uSpot;
	gl_FragColor = vec4( vCol.rgb * a * lv * 0.5, 1.0 );
	#include <colorspace_fragment>
}
`;
const MIST_VERT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vPh;
void main() {
	vUv = uv * 2.0 - 1.0;
	vPh = instanceMatrix[ 3 ].x * 0.37 + instanceMatrix[ 3 ].z * 0.21;
	vec4 wp = instanceMatrix * vec4( position, 1.0 );
	wp.x += sin( uTime * 0.05 + vPh ) * 1.6;
	wp.z += cos( uTime * 0.04 + vPh * 1.3 ) * 1.2;
	gl_Position = projectionMatrix * modelViewMatrix * wp;
}
`;
const MIST_FRAG = /* glsl */ `
uniform float uTime, uOp;
uniform vec3 uCol;
varying vec2 vUv;
varying float vPh;
void main() {
	float d = length( vUv );
	float a = ( 1.0 - smoothstep( 0.15, 1.0, d ) ) * uOp * ( 0.65 + 0.35 * sin( uTime * 0.13 + vPh ) );
	gl_FragColor = vec4( uCol, a );
	#include <colorspace_fragment>
}
`;
const SWAY_PARS = /* glsl */ `
attribute float aSway;
uniform float uTime, uAmp;
uniform vec4 uShock;
`;
const SWAY_BEGIN = /* glsl */ `
vec3 transformed = vec3( position );
{
	float sw = aSway * uAmp * ( sin( uTime * 1.3 + position.x * 0.45 + position.z * 0.6 ) * 0.07 + sin( uTime * 2.9 + position.y * 1.7 + position.x * 1.1 ) * 0.03 );
	vec2 sd = position.xz - uShock.xy;
	float sl = max( length( sd ), 0.001 );
	float sf = uShock.w * ( 1.0 - smoothstep( 0.0, 2.5, abs( sl - uShock.z ) ) ) * aSway;
	transformed += normal * sw + vec3( sd.x, 0.0, sd.y ) / sl * sf * 0.6;
}
`;

// ================================================================================================ the world
export function createCircus(ctx) {
  const THREE = ctx.THREE;
  const sfx = (name, a, b, c) => { const au = ctx.audio, f = au && au[name]; return typeof f === "function" ? f.call(au, a, b, c) : undefined; };
  const vfx = (name, a, b, c, d, e) => { const fx = ctx.fx, f = fx && fx[name]; return typeof f === "function" ? f.call(fx, a, b, c, d, e) : undefined; };
  const rnd = mulberry(20261);
  const group = new THREE.Group();
  group.name = "circus";
  const lot = new THREE.Group(), interior = new THREE.Group();
  group.add(lot, interior);

  const U = {
    uTime: { value: 0 },
    uShock: ctx.fx && ctx.fx.shock && ctx.fx.shock.uniform ? ctx.fx.shock.uniform : { value: new THREE.Vector4(0, 0, 0, 0) },
    uLamp: { value: 1 }, uSpot: { value: 1 },
  };
  function patchSway(mat, amp, key) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime; sh.uniforms.uShock = U.uShock; sh.uniforms.uAmp = { value: amp };
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + SWAY_PARS).replace("#include <begin_vertex>", SWAY_BEGIN);
    };
    mat.customProgramCacheKey = () => key;
    return mat;
  }
  const stdMat = (o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.9, metalness: 0 }, o || {}));
  const addMesh = (parent, geo, mat, cast, recv) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !!cast; m.receiveShadow = !!recv;
    m.matrixAutoUpdate = false; m.updateMatrix();
    parent.add(m);
    return m;
  };

  // ---------------------------------------------------------------------------------------------- sky + ground
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uStars: { value: 1 }, uZenith: { value: new THREE.Color(0x05081a) }, uHorizon: { value: new THREE.Color(0x16203c) }, uMoonDir: { value: new THREE.Vector3(0.42, 0.72, -0.36) } },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(138, 28, 14), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  group.add(sky);

  const groundTex = new THREE.CanvasTexture(paintGround(1024));
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = 4;
  {
    const g = new THREE.PlaneGeometry(GW, GH, 60, 62).rotateX(-Math.PI / 2).translate(GX0 + GW / 2, 0, GZ0 + GH / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, bump(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    addMesh(group, g, new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }), false, true);
    // the dark land beyond the fence
    const far = new THREE.RingGeometry(30, 150, 40, 1).rotateX(-Math.PI / 2).translate(0, -0.12, 11);
    addMesh(group, far, new THREE.MeshStandardMaterial({ color: 0x27331d, roughness: 1 }), false, false);
  }

  // ---------------------------------------------------------------------------------------------- the big top
  const RED = 0xb3261e, CREAM = 0xeadfc4, GOLD = 0xd8a93a, WOOD = 0x7a5a3a, WOOD_D = 0x4f3a26, IRON = 0x34363c, ROPE = 0xb9a67c;
  const APEX_Y = 13.2;
  const roofV = new THREE.Vector3();
  // point on the roof: th = bearing around the tent, t = 0 at the eave .. 1 at the ridge
  function roofPoint(th, t, out) {
    const ex = TENT.x + Math.cos(th) * TENT.r, ez = TENT.z + Math.sin(th) * TENT.r;
    const ax = clamp(ex, -TENT.poleX, TENT.poleX), az = TENT.z;
    const y = lerp(TENT.wallH, APEX_Y, t) - 1.25 * Math.sin(Math.PI * t) + 0.55 * Math.exp(-((t - 0.36) * (t - 0.36)) / 0.012);
    return out.set(lerp(ex, ax, t), y, lerp(ez, az, t));
  }
  function doorAt(th) {
    for (let i = 0; i < DOORS.length; i++) {
      const d = DOORS[i];
      let da = th - Math.atan2(d.uz, d.ux);
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < Math.asin(d.half / TENT.r)) return d;
    }
    return null;
  }
  const canvasBake = createBaker(THREE);
  {
    const b = canvasBake, NG = 40, NU = 3, NT = 10;
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), Dv = new THREE.Vector3();
    const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    // emits the quad with its normal on the side of (ox, oy, oz)
    const out = (a, bb, c, d, hex, wa, wb, wc, wd, ox, oy, oz) => {
      e1.subVectors(bb, a); e2.subVectors(d, a); n.crossVectors(e1, e2);
      if (n.x * ox + n.y * oy + n.z * oz >= 0) b.quad(a.x, a.y, a.z, bb.x, bb.y, bb.z, c.x, c.y, c.z, d.x, d.y, d.z, hex, wa, wb, wc, wd);
      else b.quad(a.x, a.y, a.z, d.x, d.y, d.z, c.x, c.y, c.z, bb.x, bb.y, bb.z, hex, wa, wd, wc, wb);
    };
    const gore = (th, u, t, o) => {
      roofPoint(th, t, o);
      o.y -= 0.17 * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (1.15 - t);
      return o;
    };
    const w = (u, t) => Math.sin(Math.PI * u) * Math.sin(Math.PI * t);
    for (let i = 0; i < NG; i++) {
      const th0 = (i / NG) * TAU, th1 = ((i + 1) / NG) * TAU, hex = i % 2 ? CREAM : RED, alt = i % 2 ? RED : CREAM;
      for (let iu = 0; iu < NU; iu++) {
        const u0 = iu / NU, u1 = (iu + 1) / NU, ta = lerp(th0, th1, u0), tb = lerp(th0, th1, u1);
        const om = (ta + tb) / 2, ox = Math.cos(om), oz = Math.sin(om);
        for (let it = 0; it < NT; it++) {
          const t0 = it / NT, t1 = (it + 1) / NT;
          gore(ta, u0, t0, A); gore(tb, u1, t0, B); gore(tb, u1, t1, C); gore(ta, u0, t1, Dv);
          out(A, B, C, Dv, hex, w(u0, t0), w(u1, t0), w(u1, t1), w(u0, t1), ox * 0.3, 1, oz * 0.3);
        }
        // the scalloped valance hanging from the eave
        const r = TENT.r + 0.1, y0 = TENT.wallH + 0.04, dip = 0.3 + 0.28 * Math.sin(Math.PI * (iu + 0.5) / NU);
        A.set(TENT.x + Math.cos(ta) * r, y0, TENT.z + Math.sin(ta) * r); B.set(TENT.x + Math.cos(tb) * r, y0, TENT.z + Math.sin(tb) * r);
        C.set(TENT.x + Math.cos(tb) * r, y0 - dip * 0.75, TENT.z + Math.sin(tb) * r); Dv.set(TENT.x + Math.cos(ta) * r, y0 - dip * 0.75, TENT.z + Math.sin(ta) * r);
        out(A, B, C, Dv, alt, 0, 0, 0.5, 0.5, ox, 0, oz);
        e1.set(TENT.x + Math.cos(om) * r, y0 - dip - 0.12, TENT.z + Math.sin(om) * r);
        e2.subVectors(C, Dv); n.subVectors(e1, Dv); n.crossVectors(e2, n);
        if (n.x * ox + n.z * oz >= 0) b.tri(Dv.x, Dv.y, Dv.z, C.x, C.y, C.z, e1.x, e1.y, e1.z, GOLD, GOLD, GOLD, 0.5, 0.5, 0.9);
        else b.tri(C.x, C.y, C.z, Dv.x, Dv.y, Dv.z, e1.x, e1.y, e1.z, GOLD, GOLD, GOLD, 0.5, 0.5, 0.9);
      }
    }
    // the side wall, with the doors left open (a lintel of canvas over each)
    const NW = 96, NV = 3;
    for (let i = 0; i < NW; i++) {
      const th0 = (i / NW) * TAU, th1 = ((i + 1) / NW) * TAU, om = (th0 + th1) / 2;
      const door = doorAt(om);
      const yLow = door ? (door.name === "doorSouth" ? 3.05 : 2.5) : 0;
      const hex = i % 2 ? CREAM : RED;
      for (let iv = 0; iv < NV; iv++) {
        const v0 = iv / NV, v1 = (iv + 1) / NV;
        const y0 = lerp(yLow, TENT.wallH, v0), y1 = lerp(yLow, TENT.wallH, v1);
        const r0 = TENT.r + 0.1 * Math.sin(Math.PI * v0), r1 = TENT.r + 0.1 * Math.sin(Math.PI * v1);
        A.set(TENT.x + Math.cos(th0) * r0, y0, TENT.z + Math.sin(th0) * r0); B.set(TENT.x + Math.cos(th1) * r0, y0, TENT.z + Math.sin(th1) * r0);
        C.set(TENT.x + Math.cos(th1) * r1, y1, TENT.z + Math.sin(th1) * r1); Dv.set(TENT.x + Math.cos(th0) * r1, y1, TENT.z + Math.sin(th0) * r1);
        const s0 = Math.sin(Math.PI * v0) * (door ? 0.3 : 0.8), s1 = Math.sin(Math.PI * v1) * (door ? 0.3 : 0.8);
        out(A, B, C, Dv, hex, s0, s0, s1, s1, Math.cos(om), 0, Math.sin(om));
      }
    }
  }
  const canvasGeo = canvasBake.build(true);
  const canvasOut = addMesh(group, canvasGeo, patchSway(stdMat({ roughness: 0.82 }), 1, "circus-canvas-out"), false, false);
  const canvasIn = addMesh(group, canvasGeo, patchSway(stdMat({ roughness: 0.9, side: THREE.BackSide, color: 0xd9c8b0 }), 1, "circus-canvas-in"), false, false);
  // an unseen stand-in that keeps the moonlight out of the tent whichever shell is showing
  {
    const sb = createBaker(THREE), a = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), e = new THREE.Vector3();
    for (let i = 0; i < 20; i++) {
      const th0 = (i / 20) * TAU, th1 = ((i + 1) / 20) * TAU;
      for (let it = 0; it < 3; it++) {
        roofPoint(th0, it / 3, a); roofPoint(th1, it / 3, c); roofPoint(th1, (it + 1) / 3, d); roofPoint(th0, (it + 1) / 3, e);
        sb.quad(a.x, a.y, a.z, e.x, e.y, e.z, d.x, d.y, d.z, c.x, c.y, c.z, 0);
      }
      roofPoint(th0, 0, a); roofPoint(th1, 0, c);
      sb.quad(a.x, 0, a.z, a.x, a.y, a.z, c.x, c.y, c.z, c.x, 0, c.z, 0);
    }
    const m = addMesh(group, sb.build(), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }), true, false);
    m.scale.set(0.97, 0.96, 0.97); m.position.set(0, 0, TENT.z * 0.03); m.updateMatrix();
  }

  // ---------------------------------------------------------------------------------------------- bakers and lists
  const L = createBaker(THREE), Tn = createBaker(THREE), I = createBaker(THREE), Cl = createBaker(THREE), Em = createBaker(THREE);
  Em.ao = 0; Em.jitter = 0; Cl.ao = 0;
  const gy = heightAt;
  const colliders = [], cover = [];
  const collide = (x, z, r) => { colliders.push({ x, z, r, on: true }); };
  const wagonObbs = [], solids = [], sightBlocks = [];
  const dPos = [], dNor = [], dUv = [];
  // a painted panel from the atlas, facing yaw
  function decal(name, x, y, z, yaw, w, h) {
    const r = ATLAS[name], u0 = r[0] / 1024, u1 = (r[0] + r[2]) / 1024, v1 = 1 - r[1] / 1024, v0 = 1 - (r[1] + r[3]) / 1024;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw), nx = Math.sin(yaw), nz = Math.cos(yaw), hw = w / 2, hh = h / 2;
    const P = (sx, sy, u, v) => { dPos.push(x + rx * hw * sx + nx * 0.014, y + hh * sy, z + rz * hw * sx + nz * 0.014); dNor.push(nx, 0, nz); dUv.push(u, v); };
    P(-1, -1, u0, v0); P(1, -1, u1, v0); P(1, 1, u1, v1); P(-1, -1, u0, v0); P(1, 1, u1, v1); P(-1, 1, u0, v1);
  }
  const bulbs = [], wires = [];
  const BULB_COLS = [0xffd9a0, 0xffd9a0, 0xffd9a0, 0xff6a4a, 0xffc040, 0x7fd0ff, 0x9dff9a];
  const FLAG_COLS = [0xc4352a, 0xf0d25a, 0x2f7fb8, 0xeadfc4, 0x3f9a5a];
  // a sagging line between two points carrying bulbs (kind 0) or bunting (kind 1)
  function strand(x0, y0, z0, x1, y1, z1, sag, n, kind) {
    let px = x0, py = y0, pz = z0;
    const len = Math.hypot(x1 - x0, z1 - z0) || 1, tx = (x1 - x0) / len, tz = (z1 - z0) / len;
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = lerp(x0, x1, t), y = lerp(y0, y1, t) - sag * 4 * t * (1 - t), z = lerp(z0, z1, t);
      wires.push(px, py, pz, x, y, z);
      const mx = (px + x) / 2, my = (py + y) / 2, mz = (pz + z) / 2;
      if (kind === 1) {
        const c = FLAG_COLS[i % 5], w = Math.min(0.2, (len / n) * 0.42);
        Cl.base(0, 0, 0, 0);
        Cl.tri(mx - tx * w, my, mz - tz * w, mx + tx * w, my, mz + tz * w, mx, my - 0.46, mz, c, c, c, 0, 0, 1.6);
      } else bulbs.push(mx, my - 0.08, mz, kind === 2 ? 0 : (bulbs.length / 4) % 7 | 0);
      px = x; py = y; pz = z;
    }
  }
  const discs = [], cones = [];
  const WARM = [1.0, 0.72, 0.38];
  function lampPost(x, z, r, h) {
    h = h || 4.3;
    const y = gy(x, z);
    L.base(x, y, z, 0);
    L.cyl(IRON, 0, h / 2, 0, 0.05, 0.08, h, 6).cyl(IRON, 0, 0.12, 0, 0.16, 0.2, 0.24, 6);
    L.cyl(0x2c3a30, 0, h + 0.05, 0, 0.08, 0.42, 0.24, 8);
    Em.base(x, y, z, 0).cyl(0xffe2b0, 0, h - 0.12, 0, 0.13, 0.1, 0.14, 6);
    discs.push({ x, y: y + 0.035, z, r: r * 1.12, col: WARM, kind: 0, k: 0.5 });
    cones.push({ x, y: y + h - 0.05, z, tx: x, ty: y, tz: z, r: r * 0.92, col: WARM, kind: 0, k: 0.3 });
    collide(x, z, 0.22);
  }
  function wheel(b, x, y, z, r, rim, spoke) {
    const side = x < 0 ? -1 : 1;
    b.cyl(rim, x, y, z, r, r, 0.11, 12, 0, 0, Math.PI / 2);
    b.cyl(GOLD, x + side * 0.03, y, z, 0.13, 0.13, 0.2, 6, 0, 0, Math.PI / 2);
    for (let k = 0; k < 4; k++) b.box(spoke, x + side * 0.062, y, z, 0.03, r * 1.86, 0.075, 0, (k * Math.PI) / 4, 0);
  }
  const toWorld = (w, lx, lz, o) => { const c = Math.cos(w.yaw), s = Math.sin(w.yaw); o.x = w.x + lx * c + lz * s; o.z = w.z - lx * s + lz * c; return o; };
  const tw = { x: 0, z: 0 };
  function wagon(w, body, roof, panel, lit) {
    const y = gy(w.x, w.z);
    const prevAo = L.ao;
    L.base(w.x, y, w.z, w.yaw);
    L.box(WOOD_D, 0, 0.8, 0, 1.7, 0.16, 4.9);
    L.box(body, 0, 1.94, 0, 2.1, 2.1, 4.8);
    L.box(GOLD, 0, 2.97, 0, 2.18, 0.09, 4.88).box(GOLD, 0, 0.93, 0, 2.18, 0.08, 4.88);
    for (let i = 0; i < 4; i++) L.box(GOLD, i & 1 ? 1.06 : -1.06, 1.95, i & 2 ? 2.41 : -2.41, 0.11, 2.0, 0.11);
    L.box(roof, 0, 3.07, 0, 2.44, 0.12, 5.12).box(roof, 0, 3.25, 0, 1.25, 0.26, 4.4).box(0x2a1a14, 0, 3.24, 0, 1.28, 0.14, 4.0);
    L.ao = 0.1;
    wheel(L, -1.0, 0.55, 1.6, 0.55, 0x6a1512, 0xe0b040); wheel(L, 1.0, 0.55, 1.6, 0.55, 0x6a1512, 0xe0b040);
    wheel(L, -1.0, 0.55, -1.6, 0.55, 0x6a1512, 0xe0b040); wheel(L, 1.0, 0.55, -1.6, 0.55, 0x6a1512, 0xe0b040);
    L.ao = prevAo;
    L.cyl(IRON, 0, 0.55, 1.6, 0.05, 0.05, 2.0, 5, 0, 0, Math.PI / 2).cyl(IRON, 0, 0.55, -1.6, 0.05, 0.05, 2.0, 5, 0, 0, Math.PI / 2);
    // the back door with its steps, the drawbar in front
    L.box(0x3a2418, 0, 1.85, -2.41, 0.8, 1.7, 0.05).box(GOLD, 0.28, 1.8, -2.45, 0.06, 0.06, 0.04);
    L.box(WOOD, 0, 0.62, -2.72, 0.9, 0.06, 0.34).box(WOOD, 0, 0.3, -3.02, 0.9, 0.06, 0.34);
    L.beam(WOOD_D, 0, 0.72, 2.45, 0, 0.3, 4.0, 0.05, 5);
    if (lit) {
      Em.base(w.x, y, w.z, w.yaw).box(0xffc070, 0, 2.2, 2.41, 0.6, 0.55, 0.04);
      L.box(GOLD, 0, 2.2, 2.42, 0.72, 0.67, 0.03);
    }
    decal(panel, toWorld(w, 1.062, 0, tw).x, y + 1.95, tw.z, w.yaw + Math.PI / 2, 4.3, 1.88);
    decal(panel, toWorld(w, -1.062, 0, tw).x, y + 1.95, tw.z, w.yaw - Math.PI / 2, 4.3, 1.88);
    const o = makeObb(w.x, w.z, w.yaw, WAGON_HL, WAGON_HW, 3.2);
    wagonObbs.push(o); sightBlocks.push(o);
    for (let k = -1; k <= 1; k++) { toWorld(w, 0, k * 1.5, tw); cover.push({ x: tw.x, z: tw.z, r: 1.25, h: 3.2 }); }
  }

  // ---------------------------------------------------------------------------------------------- the lot
  // board fences
  {
    L.jitter = 0.14;
    const board = (x, z, along) => {
      const h = 2.05 + rnd() * 0.22;
      L.base(x, gy(x, z), z, 0);
      L.box(rnd() < 0.5 ? 0x6b5038 : 0x5a4330, 0, h / 2, 0, along ? 0.56 : 0.05, h, along ? 0.05 : 0.56, 0, 0, (rnd() - 0.5) * 0.03);
    };
    for (let x = LOT.minX + 0.3; x < LOT.maxX; x += 0.6) { board(x, LOT.minZ, true); board(x, LOT.maxZ, true); }
    for (let z = LOT.minZ + 0.3; z < LOT.maxZ; z += 0.6) { board(LOT.minX, z, false); board(LOT.maxX, z, false); }
    for (let x = LOT.minX + 0.9; x < LOT.maxX; x += 0.6) {
      if (Math.abs(x) < GATE_HALF + 0.25 || Math.abs(x - GAP_X) < 0.34) continue;
      board(x, FENCE_Z, true);
    }
    L.jitter = 0.05;
    // rails and posts
    L.base(0, 0, 0, 0);
    for (let s = 0; s < 2; s++) {
      const y = s ? 1.6 : 0.5;
      L.box(WOOD_D, 0, y, LOT.minZ + 0.06, 80, 0.1, 0.06).box(WOOD_D, 0, y, LOT.maxZ - 0.06, 80, 0.1, 0.06);
      L.box(WOOD_D, LOT.minX + 0.06, y, 11, 0.06, 0.1, 82).box(WOOD_D, LOT.maxX - 0.06, y, 11, 0.06, 0.1, 82);
      L.box(WOOD_D, -20.9, y, FENCE_Z - 0.06, 38.2, 0.1, 0.06).box(WOOD_D, 20.9, y, FENCE_Z - 0.06, 38.2, 0.1, 0.06);
    }
    // the loose board: hanging by one nail
    L.base(GAP_X, gy(GAP_X, FENCE_Z), FENCE_Z, 0).box(0x6b5038, 0.32, 1.05, 0.05, 0.56, 2.0, 0.05, 0, 0, 0.42);
    // gate posts with lanterns
    for (let s = -1; s <= 1; s += 2) {
      L.base(s * (GATE_HALF + 0.14), 0, FENCE_Z, 0).box(WOOD_D, 0, 1.4, 0, 0.24, 2.8, 0.24).cyl(IRON, 0, 2.86, 0, 0.1, 0.16, 0.12, 6);
      Em.base(s * (GATE_HALF + 0.14), 0, FENCE_Z, 0).cyl(0xffd9a0, 0, 3.0, 0, 0.09, 0.09, 0.18, 6);
    }
    decal("staff", 3.1, 1.45, FENCE_Z - 0.04, Math.PI, 1.6, 0.58);
  }
  // wagons
  const WAGON_LOOK = [[0x8e1f1c, 0x3a2a22, "wagonA"], [0x1e4d6b, 0x2a2a30, "wagonB"], [0x27543a, 0x3a2a22, "wagonA"], [0x1e4d6b, 0x3a2a22, "wagonB"], [0x8e1f1c, 0x2a2a30, "wagonA"], [0xb0792a, 0x3a2a22, "wagonB"]];
  for (let i = 0; i < WAGONS.length; i++) wagon(WAGONS[i], WAGON_LOOK[i][0], WAGON_LOOK[i][1], WAGON_LOOK[i][2], i === 1 || i === 5);
  wagon(CALLIOPE, 0x6a2a6e, 0x2a2a30, "calliope", false);
  {
    L.base(CALLIOPE.x, gy(CALLIOPE.x, CALLIOPE.z), CALLIOPE.z, CALLIOPE.yaw);
    for (let i = 0; i < 11; i++) L.cyl(GOLD, 0, 3.38 + (0.35 + 0.07 * i) / 2, -1.5 + i * 0.3, 0.07, 0.07, 0.35 + 0.07 * i, 6);
    strand(CALLIOPE.x - 2.4, 3.2, CALLIOPE.z - 1.25, CALLIOPE.x + 2.4, 3.2, CALLIOPE.z - 1.25, 0.12, 10, 0);
  }
  // the poster the cage looks at (on the end of the first wagon)
  decal("poster", WAGONS[3].x - WAGON_HL - 0.05, gy(-25.5, -15.8) + 2.0, WAGONS[3].z + 0.05, -Math.PI / 2, 1.25, 1.75);

  // the cage wagon
  {
    const y = bump(CAGE.x, CAGE.z);
    L.base(CAGE.x, y, CAGE.z, Math.PI / 2);
    L.box(WOOD, 0, 0.82, 0, 2.14, 0.16, 3.14).box(GOLD, 0, 0.82, 0, 2.2, 0.06, 3.2);
    L.box(0x7a1a18, 0, 2.76, 0, 2.34, 0.14, 3.34).box(GOLD, 0, 2.67, 0, 2.2, 0.06, 3.2);
    L.box(0x27543a, 0, 3.4, 0, 0.08, 1.15, 2.7);
    for (let i = 0; i < 4; i++) L.box(GOLD, i & 1 ? 1.0 : -1.0, 1.78, i & 2 ? 1.5 : -1.5, 0.1, 1.82, 0.1);
    L.ao = 0.1;
    wheel(L, -1.02, 0.5, 1.0, 0.5, 0x6a1512, 0xe0b040); wheel(L, 1.02, 0.5, 1.0, 0.5, 0x6a1512, 0xe0b040);
    wheel(L, -1.02, 0.5, -1.0, 0.5, 0x6a1512, 0xe0b040); wheel(L, 1.02, 0.5, -1.0, 0.5, 0x6a1512, 0xe0b040);
    L.ao = 0.28;
    for (let z = -1.3; z <= 1.31; z += 0.2) { L.beam(IRON, -1.0, 0.9, z, -1.0, 2.66, z, 0.022, 5); L.beam(IRON, 1.0, 0.9, z, 1.0, 2.66, z, 0.022, 5); }
    for (let x = -0.8; x <= 0.81; x += 0.2) {
      L.beam(IRON, x, 0.9, -1.5, x, 2.66, -1.5, 0.022, 5);
      if (Math.abs(x) > CAGE.doorHalf + 0.05) L.beam(IRON, x, 0.9, 1.5, x, 2.66, 1.5, 0.022, 5);
    }
    L.box(IRON, -0.63, 1.78, 1.5, 0.06, 1.78, 0.06).box(IRON, 0.63, 1.78, 1.5, 0.06, 1.78, 0.06);
    L.box(0xc9b26a, 0, 0.93, -1.05, 1.8, 0.08, 0.8).box(0xb89e58, 0.3, 0.96, -1.2, 1.0, 0.1, 0.45, 0.3);
    L.beam(WOOD_D, 0, 0.7, -1.55, 0, 0.3, -3.0, 0.05, 5);
    decal("wagonC", CAGE.x, y + 3.4, CAGE.z - 0.042, Math.PI, 2.6, 1.1);
    decal("wagonC", CAGE.x, y + 3.4, CAGE.z + 0.042, 0, 2.6, 1.1);
  }
  // the high striker (the bell distraction)
  {
    const y = gy(BELL.x, BELL.z);
    L.base(BELL.x, y, BELL.z, 0);
    L.box(0x8e1f1c, 0, 0.14, 0, 1.0, 0.28, 1.3).box(WOOD, 0, 2.85, 0.3, 0.42, 5.2, 0.12).box(GOLD, 0, 5.5, 0.3, 0.6, 0.12, 0.2);
    L.cyl(GOLD, 0, 5.22, 0.2, 0.05, 0.24, 0.2, 10).box(0x2a2a2e, 0, 0.36, -0.3, 0.5, 0.16, 0.5);
    decal("striker", BELL.x, y + 2.75, BELL.z + 0.23, Math.PI, 0.34, 4.5);
    collide(BELL.x, BELL.z + 0.2, 0.5);
  }
  // ticket booth
  {
    const y = gy(BOOTH.x, BOOTH.z);
    L.base(BOOTH.x, y, BOOTH.z, 0);
    L.box(0x8e1f1c, 0, 1.15, 0, 1.8, 2.3, 1.8).box(0x1a1412, -0.9, 1.6, 0, 0.06, 0.8, 1.1).box(WOOD, -1.0, 1.15, 0, 0.3, 0.07, 1.3);
    for (let i = 0; i < 4; i++) L.box(CREAM, i & 1 ? 0.9 : -0.9, 1.15, i & 2 ? 0.9 : -0.9, 0.14, 2.32, 0.14);
    L.cyl(0x27543a, 0, 2.75, 0, 0.08, 1.6, 0.9, 4, 0, Math.PI / 4).cyl(GOLD, 0, 3.28, 0, 0.09, 0.09, 0.2, 6);
    Em.base(BOOTH.x, y, BOOTH.z, 0).box(0xffc070, -0.88, 1.6, 0, 0.03, 0.6, 0.9);
    decal("tickets", BOOTH.x - 0.92, y + 2.25, BOOTH.z, -Math.PI / 2, 1.6, 0.58);
    decal("poster", BOOTH.x, y + 1.3, BOOTH.z - 0.91, Math.PI, 0.95, 1.33);
    const o = makeObb(BOOTH.x, BOOTH.z, 0, 0.95, 0.95, 3);
    solids.push(o); sightBlocks.push(o);
    discs.push({ x: BOOTH.x + 0.5, y: y + 0.035, z: BOOTH.z - 2, r: 2.9, col: WARM, kind: 0, k: 0.5 });
    for (let i = 0; i < 4; i++) {
      const a0 = i * Math.PI / 2 + Math.PI / 4, a1 = a0 + Math.PI / 2;
      strand(BOOTH.x + Math.cos(a0) * 1.32, y + 2.36, BOOTH.z + Math.sin(a0) * 1.32, BOOTH.x + Math.cos(a1) * 1.32, y + 2.36, BOOTH.z + Math.sin(a1) * 1.32, 0.03, 5, 0);
    }
  }
  // midway stalls
  for (let i = 0; i < STALLS.length; i++) {
    const s = STALLS[i], y = gy(s.x, s.z), c = [0x1e4d6b, 0x8e1f1c, 0x27543a, 0xb0792a][i];
    L.base(s.x, y, s.z, 0);
    L.box(c, -0.8, 0.5, 0, 0.5, 1.0, 3.2).box(WOOD, -0.8, 1.03, 0, 0.62, 0.06, 3.3).box(c, 1.0, 1.4, 0, 0.1, 2.8, 3.2);
    L.box(WOOD_D, -1.0, 1.4, 1.55, 0.1, 2.8, 0.1).box(WOOD_D, -1.0, 1.4, -1.55, 0.1, 2.8, 0.1).box(WOOD_D, -1.0, 2.84, 0, 0.14, 0.14, 3.3);
    L.box(WOOD, 0.7, 1.5, 0, 0.4, 0.05, 3.0).box(WOOD, 0.7, 2.0, 0, 0.4, 0.05, 3.0);
    for (let k = 0; k < 7; k++) L.box(FLAG_COLS[(k + i) % 5], 0.7, 1.66 + (k % 2) * 0.5, -1.2 + k * 0.4, 0.24, 0.26, 0.24, k);
    // the striped awning
    Cl.base(s.x, y, s.z, 0);
    for (let k = 0; k < 8; k++) {
      const z0 = -1.65 + k * 0.4125, z1 = z0 + 0.4125, hex = k % 2 ? CREAM : c;
      Cl.quad(1.0, 2.86, z0, 1.0, 2.86, z1, -1.7, 2.3, z1, -1.7, 2.3, z0, hex, 0, 0, 0.5, 0.5);
      Cl.quad(-1.7, 2.3, z0, -1.7, 2.3, z1, -1.7, 2.02, z1, -1.7, 2.02, z0, hex, 0.5, 0.5, 1.2, 1.2);
    }
    decal("stall" + i, s.x - 1.08, y + 2.52, s.z, -Math.PI / 2, 2.5, 0.68);
    strand(s.x - 1.72, y + 2.28, s.z - 1.65, s.x - 1.72, y + 2.28, s.z + 1.65, 0.05, 9, 0);
    const o = makeObb(s.x + 0.1, s.z, 0, 1.65, 1.15, 3);
    solids.push(o); sightBlocks.push(o);
  }
  // the generator
  {
    const y = gy(GENERATOR.x, GENERATOR.z);
    L.base(GENERATOR.x, y, GENERATOR.z, Math.PI / 2);
    L.box(WOOD_D, -0.4, 0.07, 0, 0.12, 0.14, 2.0).box(WOOD_D, 0.4, 0.07, 0, 0.12, 0.14, 2.0);
    L.box(0x2f5a44, 0, 0.66, -0.1, 0.95, 1.0, 1.5).box(0x1f2a26, 0, 0.7, -0.87, 0.8, 0.7, 0.06).cyl(IRON, 0.3, 1.5, 0.4, 0.05, 0.05, 0.75, 6).cyl(IRON, 0.3, 1.9, 0.4, 0.09, 0.07, 0.1, 6);
    L.cyl(0x8a3a22, 0, 0.55, 1.0, 0.3, 0.3, 0.9, 10).box(0xc4352a, -0.52, 1.0, 0.2, 0.06, 0.4, 0.06, 0, 0, 0.5);
    Em.base(GENERATOR.x, y, GENERATOR.z, 0).box(0x9dff9a, 0.1, 1.0, -0.5, 0.08, 0.08, 0.03);
    const o = makeObb(GENERATOR.x, GENERATOR.z, Math.PI / 2, 1.2, 0.6, 1.3);
    solids.push(o);
  }
  // the truck
  {
    const y = gy(TRUCK.x, TRUCK.z);
    L.base(TRUCK.x, y, TRUCK.z, TRUCK.yaw);
    L.box(0x2a2a2c, 0, 0.72, 0, 1.6, 0.2, 5.8);
    L.box(0x3f5a3a, 0, 1.6, 1.75, 2.2, 1.55, 1.5).box(0x3f5a3a, 0, 1.25, 2.7, 2.0, 0.85, 0.5).box(0x141a22, 0, 1.95, 2.52, 1.9, 0.6, 0.04).box(0x141a22, -1.11, 1.95, 1.8, 0.03, 0.55, 0.9).box(0x141a22, 1.11, 1.95, 1.8, 0.03, 0.55, 0.9);
    L.box(WOOD_D, 0, 0.95, -1.0, 2.3, 0.14, 3.9).box(0x8a8468, 0, 1.95, -1.0, 2.24, 1.7, 3.8).box(0x7a745c, 0, 2.86, -1.0, 1.7, 0.16, 3.8);
    L.box(0x2a2a2c, -1.32, 0.55, 1.7, 0.36, 0.07, 1.5).box(0x2a2a2c, 1.32, 0.55, 1.7, 0.36, 0.07, 1.5);
    L.cyl(0xc9c4b0, -0.75, 1.3, 2.97, 0.14, 0.14, 0.06, 8, Math.PI / 2).cyl(0xc9c4b0, 0.75, 1.3, 2.97, 0.14, 0.14, 0.06, 8, Math.PI / 2);
    L.ao = 0.1;
    for (let i = 0; i < 4; i++) { const sx = i & 1 ? 1.05 : -1.05, sz = i & 2 ? 2.0 : -1.9; L.cyl(0x18181a, sx, 0.48, sz, 0.48, 0.48, 0.3, 12, 0, 0, Math.PI / 2).cyl(0x6a6a6a, sx * 1.12, 0.48, sz, 0.2, 0.2, 0.08, 8, 0, 0, Math.PI / 2); }
    L.ao = 0.28;
    const o = makeObb(TRUCK.x, TRUCK.z, TRUCK.yaw, TRUCK.hl, TRUCK.hw, 3);
    solids.push(o); sightBlocks.push(o);
    for (let k = -1; k <= 1; k++) cover.push({ x: TRUCK.x, z: TRUCK.z + k * 1.9, r: 1.3, h: 2.9 });
  }
  // the hay stack by the back flap: a nook of bales open toward the tent
  {
    const HAYC = 0xc8b060, HAYD = 0xb09848;
    L.jitter = 0.1;
    const bale = (x, y, z, ry) => L.base(HAY.x + x, gy(HAY.x + x, HAY.z + z) + y, HAY.z + z, ry).box(rnd() < 0.5 ? HAYC : HAYD, 0, 0.26, 0, 1.1, 0.52, 0.6);
    for (let i = -1; i <= 1; i++) { bale(i * 1.15, 0, 1.3, 0); bale(i * 1.15 + 0.2, 0.52, 1.32, 0.05); }
    bale(-0.5, 1.04, 1.3, -0.1); bale(0.7, 1.04, 1.34, 0.08);
    for (let s = -1; s <= 1; s += 2) { bale(s * 1.5, 0, 0.55, Math.PI / 2); bale(s * 1.5, 0, -0.5, Math.PI / 2 + 0.06); bale(s * 1.5, 0.52, 0.1, Math.PI / 2 - 0.05); }
    L.base(HAY.x, gy(HAY.x, HAY.z), HAY.z, 0).cyl(HAYC, 0, 0.2, 0.1, 0.25, 1.05, 0.4, 9).cyl(HAYD, 0.2, 0.42, 0.2, 0.1, 0.55, 0.24, 7);
    L.jitter = 0.05;
    const o1 = makeObb(HAY.x, HAY.z + 1.31, Math.PI / 2, 1.85, 0.36, 1.5), o2 = makeObb(HAY.x - 1.5, HAY.z + 0.05, 0, 1.05, 0.34, 1), o3 = makeObb(HAY.x + 1.5, HAY.z + 0.05, 0, 1.05, 0.34, 1);
    solids.push(o1, o2, o3); sightBlocks.push(o1, o2, o3);
    cover.push({ x: HAY.x, z: HAY.z + 1.3, r: 1.2, h: 1.5 });
  }
  // barrels on their sides (hide spots), crates (cover)
  for (let i = 0; i < BARRELS.length; i++) {
    const p = BARRELS[i], y = gy(p.x, p.z), ry = i * 1.1 + 0.4;
    L.base(p.x, y, p.z, ry);
    L.cyl(0x7a5230, 0, 0.56, 0, 0.5, 0.5, 1.3, 12, Math.PI / 2, 0, 0, true).cyl(0x4a3020, 0, 0.56, 0, 0.56, 0.56, 1.0, 12, Math.PI / 2, 0, 0, true);
    L.cyl(IRON, 0, 0.56, 0.5, 0.575, 0.575, 0.06, 12, Math.PI / 2, 0, 0, true).cyl(IRON, 0, 0.56, -0.5, 0.575, 0.575, 0.06, 12, Math.PI / 2, 0, 0, true);
    L.cyl(0x1a120c, 0, 0.56, -0.62, 0.49, 0.49, 0.04, 12, Math.PI / 2).box(WOOD_D, 0.45, 0.06, 0, 0.14, 0.12, 0.5).box(WOOD_D, -0.45, 0.06, 0, 0.14, 0.12, 0.5);
  }
  for (let i = 0; i < CRATES.length; i++) {
    const c = CRATES[i], s = c[2] * 1.3, y = gy(c[0], c[1]), ry = rnd() * 1.5;
    L.base(c[0], y, c[1], ry);
    L.box(i % 3 ? 0x8a6a44 : 0x74583a, 0, s / 2, 0, s, s, s);
    L.box(WOOD_D, 0, s / 2, s / 2, s * 1.02, 0.1, 0.03, 0, 0, 0.78).box(WOOD_D, s / 2, s / 2, 0, 0.03, 0.1, s * 1.02, 0, 0.78, 0);
    if (i % 2 === 0) L.box(0x74583a, 0.08, s + s * 0.32, -0.05, s * 0.64, s * 0.64, s * 0.64, 0.5);
    collide(c[0], c[1], c[2]);
    cover.push({ x: c[0], z: c[1], r: c[2], h: i % 2 === 0 ? s * 1.6 : s });
  }
  // the cannon and a few props by the main entrance
  {
    const x = 8, z = -13.5, y = gy(x, z);
    L.base(x, y, z, 0.7);
    L.ao = 0.1;
    wheel(L, -0.62, 0.6, 0, 0.6, 0x6a1512, 0xe0b040); wheel(L, 0.62, 0.6, 0, 0.6, 0x6a1512, 0xe0b040);
    L.ao = 0.28;
    L.cyl(0x8e1f1c, 0, 1.0, 0.3, 0.3, 0.38, 2.4, 12, 1.05).cyl(GOLD, 0, 1.58, 1.3, 0.34, 0.34, 0.14, 12, 1.05).beam(WOOD_D, 0, 0.55, -0.2, 0, 0.1, -1.5, 0.07, 5);
    collide(x, z, 1.0);
  }
  for (let i = 0; i < 7; i++) lampPost(LAMPS[i].x, LAMPS[i].z, LAMPS[i].r);
  // helipad: corner lamps and the windsock
  for (let i = 0; i < 4; i++) {
    const x = PAD.x + (i & 1 ? 4.3 : -4.3), z = PAD.z + (i & 2 ? 4.3 : -4.3);
    L.base(x, gy(x, z), z, 0).cyl(IRON, 0, 0.22, 0, 0.06, 0.1, 0.44, 6);
    Em.base(x, gy(x, z), z, 0).cyl(0xffb040, 0, 0.5, 0, 0.07, 0.09, 0.12, 6);
    discs.push({ x, y: gy(x, z) + 0.04, z, r: 1.5, col: [1.0, 0.6, 0.2], kind: 0, k: 0.45 });
  }
  {
    const x = 6.6, z = 50.4;
    L.base(x, gy(x, z), z, 0).cyl(IRON, 0, 2.6, 0, 0.04, 0.07, 5.2, 6);
    Cl.base(x, gy(x, z) + 5.1, z, 0.5);
    for (let k = 0; k < 5; k++) {
      const z0 = k * 0.36, z1 = z0 + 0.36, r0 = 0.3 - k * 0.035, r1 = r0 - 0.035, hex = k % 2 ? 0xf2efe6 : 0xf07a2a, w0 = k * 0.5, w1 = (k + 1) * 0.5;
      for (let j = 0; j < 6; j++) {
        const a0 = (j / 6) * TAU, a1 = ((j + 1) / 6) * TAU;
        Cl.quad(Math.cos(a0) * r0, Math.sin(a0) * r0 - z0 * 0.25, z0, Math.cos(a1) * r0, Math.sin(a1) * r0 - z0 * 0.25, z0, Math.cos(a1) * r1, Math.sin(a1) * r1 - z1 * 0.25, z1, Math.cos(a0) * r1, Math.sin(a0) * r1 - z1 * 0.25, z1, hex, w0, w0, w1, w1);
      }
    }
    collide(x, z, 0.2);
  }

  // ---------------------------------------------------------------------------------------------- tent rigging (always shown)
  {
    for (let s = -1; s <= 1; s += 2) {
      const x = s * TENT.poleX;
      Tn.base(x, 0, TENT.z, 0);
      Tn.cyl(0xe8e0cc, 0, 7.15, 0, 0.14, 0.19, 14.3, 10);
      for (let k = 0; k < 5; k++) Tn.cyl(RED, 0, 1.2 + k * 2.9, 0, 0.2, 0.2, 0.5, 10);
      Tn.cyl(GOLD, 0, 14.42, 0, 0.02, 0.16, 0.3, 8).cyl(IRON, 0, 0.15, 0, 0.3, 0.36, 0.3, 8);
      collide(x, TENT.z, 0.38);
      // the pennant
      Cl.base(x, 14.3, TENT.z, 0.3 * s);
      for (let k = 0; k < 5; k++) {
        const x0 = k * 0.36, x1 = x0 + 0.36, h0 = 0.42 * (1 - k / 5), h1 = 0.42 * (1 - (k + 1) / 5), hex = k % 2 ? GOLD : RED;
        Cl.quad(x0, -h0, 0, x1, -h1, 0, x1, h1, 0, x0, h0, 0, hex, k * 0.7, (k + 1) * 0.7, (k + 1) * 0.7, k * 0.7);
      }
    }
    // wall poles, guy ropes and stakes at every seam
    const NG = 40;
    for (let i = 0; i < NG; i++) {
      const th = (i / NG) * TAU, c = Math.cos(th), s = Math.sin(th);
      if (doorAt(th)) continue;
      const x = TENT.x + c * (TENT.r + 0.06), z = TENT.z + s * (TENT.r + 0.06);
      Tn.base(0, 0, 0, 0);
      Tn.cyl(0xd8d0bc, x, TENT.wallH / 2, z, 0.045, 0.045, TENT.wallH, 5);
      const sx = TENT.x + c * 20.7, sz = TENT.z + s * 20.7, sy = gy(sx, sz);
      Tn.beam(ROPE, x, TENT.wallH - 0.05, z, sx, sy + 0.12, sz, 0.018, 4);
      Tn.beam(WOOD_D, sx + c * 0.12, sy + 0.4, sz + s * 0.12, sx - c * 0.05, sy - 0.05, sz - s * 0.05, 0.04, 5);
    }
    // the marquee over the main entrance, a poster stand on each side
    Tn.base(0, 0, TENT.z - TENT.r, 0);
    Tn.box(RED, -2.5, 2.0, -0.7, 0.26, 4.0, 0.26).box(RED, 2.5, 2.0, -0.7, 0.26, 4.0, 0.26).box(0x5e1210, 0, 4.0, -0.7, 5.6, 1.7, 0.16).box(GOLD, 0, 4.9, -0.7, 5.8, 0.1, 0.22).box(GOLD, 0, 3.12, -0.7, 5.8, 0.08, 0.22);
    decal("wagonA", 0, 4.0, TENT.z - TENT.r - 0.79, Math.PI, 3.6, 1.56);
    for (let s = -1; s <= 1; s += 2) {
      Tn.box(WOOD_D, s * 3.9, 1.3, -1.3, 1.2, 2.0, 0.08, s * -0.25).beam(WOOD_D, s * 3.9, 2.2, -1.25, s * 3.9, 0, -0.6, 0.04, 4);
      decal("poster", s * 3.9 - Math.sin(Math.PI - s * 0.25) * 0.05, 1.42, TENT.z - TENT.r - 1.3 - 0.05, Math.PI - s * 0.25, 1.05, 1.47);
      collide(s * 3.9, TENT.z - TENT.r - 1.1, 0.6);
    }
    // marquee bulbs in an arch; the entrance lamp hangs from it
    for (let i = 0; i < 18; i++) { const a = (i / 17) * Math.PI; bulbs.push(-Math.cos(a) * 2.75, 3.1 + Math.sin(a) * 2.2, TENT.z - TENT.r - 0.84, 0); }
    discs.push({ x: LAMPS[0].x, y: 0.035, z: LAMPS[0].z, r: LAMPS[0].r * 1.12, col: WARM, kind: 0, k: 0.55 });
    cones.push({ x: 0, y: 3.9, z: TENT.z - TENT.r - 0.9, tx: LAMPS[0].x, ty: 0, tz: LAMPS[0].z, r: LAMPS[0].r * 0.9, col: WARM, kind: 0, k: 0.3 });
    Em.base(0, 0, 0, 0).cyl(0xffe2b0, 0, 3.0, TENT.z - TENT.r - 0.86, 0.14, 0.1, 0.16, 6);
  }
  // strings of bulbs and bunting
  {
    const NE = 72, r = TENT.r + 0.2;
    for (let i = 0; i < NE; i++) { const th = (i / NE) * TAU; bulbs.push(TENT.x + Math.cos(th) * r, TENT.wallH + 0.1, TENT.z + Math.sin(th) * r, i % 7); }
    // down the roof from each king pole
    for (let s = -1; s <= 1; s += 2) {
      for (let k = 0; k < 5; k++) {
        const th = (s > 0 ? 0 : Math.PI) + (k - 2) * 0.62;
        for (let j = 1; j < 13; j++) { roofPoint(th, 1 - j / 13.5, roofV); bulbs.push(roofV.x, roofV.y + 0.12, roofV.z, (j + k) % 7); }
      }
    }
    // lot: entrance avenue, wagon lane, midway zigzag, back lot
    strand(-2.6, 3.9, -9.8, -4.5, 4.4, -13, 0.3, 8, 0); strand(2.6, 3.9, -9.8, 4.5, 4.4, -13, 0.3, 8, 0);
    L.base(0, 0, 0, 0);
    const post = (x, z, h) => { L.cyl(WOOD_D, x, gy(x, z) + h / 2, z, 0.05, 0.07, h, 5); collide(x, z, 0.16); return gy(x, z) + h; };
    post(-4.5, -13, 4.4); post(4.5, -13, 4.4);
    strand(-4.5, 4.4, -13, 4.5, 4.4, -13, 0.5, 14, 1);
    const pA = post(-3.2, -24.6, 4.2), pB = post(-26.5, -18.2, 4.2), pC = post(-14.2, -17.5, 4.4);
    strand(-26.5, pB, -18.2, -14.2, pC, -17.5, 0.55, 16, 1); strand(-14.2, pC, -17.5, -3.2, pA, -24.6, 0.55, 16, 0);
    let px = 21, pz = -21, ph = post(px, pz, 4.3);
    for (let i = 1; i <= 6; i++) {
      const x = i % 2 ? 31.6 : 21, z = -21 + i * 7, h = post(x, z, 4.3);
      strand(px, ph, pz, x, h, z, 0.6, 14, 0);
      if (i % 2) strand(px, ph - 0.5, pz, x, h - 0.5, z, 0.5, 16, 1);
      px = x; pz = z; ph = h;
    }
    const g0 = post(-9, 26.2, 4.2), g1 = post(9, 26.2, 4.2);
    strand(-1.6, 2.7, 25.2, -9, g0, 26.2, 0.3, 9, 1); strand(1.6, 2.7, 25.2, 9, g1, 26.2, 0.3, 9, 1);
    strand(-9, g0, 26.2, -1.74, 2.95, FENCE_Z, 0.7, 16, 0); strand(9, g1, 26.2, 1.74, 2.95, FENCE_Z, 0.7, 16, 0);
    strand(-20, 2.2, LOT.minZ + 0.1, 20, 2.2, LOT.minZ + 0.1, 0.25, 60, 1);
  }

  // ---------------------------------------------------------------------------------------------- inside the big top
  {
    I.ao = 0.2;
    // the ring curb
    for (let i = 0; i < 44; i++) {
      const th = ((i + 0.5) / 44) * TAU, r = RING_R + CURB_W / 2;
      I.base(TENT.x + Math.cos(th) * r, 0, TENT.z + Math.sin(th) * r, -th);
      I.box(i % 2 ? 0xd9d0b8 : 0xc4352a, 0, CURB_H / 2, 0, CURB_W, CURB_H, (TAU * r) / 44 + 0.02).box(GOLD, 0, CURB_H + 0.012, 0, CURB_W * 0.5, 0.025, (TAU * r) / 44 + 0.02);
    }
    // two performers' tubs in the ring
    for (let s = -1; s <= 1; s += 2) {
      I.base(TENT.x + s * 3.4, 0.04, TENT.z - 4.2, 0).cyl(0x2f7fb8, 0, 0.3, 0, 0.42, 0.56, 0.6, 12).cyl(0xf0d25a, 0, 0.61, 0, 0.44, 0.44, 0.03, 12);
      collide(TENT.x + s * 3.4, TENT.z - 4.2, 0.56);
    }
    // bleachers: six tiers on trestles, a striped skirt in front (you can crawl in under it)
    const NS = 84, dth = TAU / NS;
    for (let i = 0; i < NS; i++) {
      const th = (i + 0.5) * dth, c = Math.cos(th), s = Math.sin(th);
      const ok = (r) => inBleacher(TENT.x + Math.cos(th - dth / 2) * r, TENT.z + Math.sin(th - dth / 2) * r, 0) && inBleacher(TENT.x + Math.cos(th + dth / 2) * r, TENT.z + Math.sin(th + dth / 2) * r, 0);
      let any = false;
      for (let k = 0; k < 6; k++) {
        const r = BL_R0 + k + 0.5;
        if (!ok(r)) continue;
        any = true;
        const y = 0.9 + k * 0.42, arc = r * dth + 0.03;
        I.base(TENT.x + c * r, 0, TENT.z + s * r, -th);
        I.box(k % 2 ? 0x9a7a52 : 0x8a6c48, 0, y, 0, 0.98, 0.06, arc).box(0x6a5238, 0.12, y + 0.24, 0, 0.3, 0.05, arc);
        I.box(i % 2 ? 0xb3261e : 0xd9d0b8, -0.49, k === 0 ? 0.64 : y - 0.21, 0, 0.03, k === 0 ? 0.56 : 0.42, arc);
      }
      if (any && i % 2 === 0) {
        I.base(TENT.x, 0, TENT.z, -th);
        if (ok(BL_R1 - 0.3)) { I.beam(WOOD_D, BL_R1 - 0.1, 0, 0, BL_R1 - 0.1, 3.7, 0, 0.05, 5).beam(WOOD_D, BL_R1 - 0.1, 3.0, 0, BL_R0 + 0.2, 0.9, 0, 0.045, 5); }
        if (ok(BL_R0 + 3.2)) I.beam(WOOD_D, BL_R0 + 3, 0, 0, BL_R0 + 3, 2.1, 0, 0.045, 5);
        if (ok(BL_R0 + 0.4)) I.beam(WOOD_D, BL_R0 + 0.15, 0, 0, BL_R0 + 0.15, 0.9, 0, 0.04, 5);
      }
      if (any && ok(BL_R1 - 0.3)) { I.base(TENT.x + c * (BL_R1 - 0.1), 0, TENT.z + s * (BL_R1 - 0.1), -th); I.box(WOOD_D, 0, 3.7, 0, 0.06, 0.08, (BL_R1 - 0.1) * dth + 0.03); }
    }
    // quarter poles holding the roof up
    for (let i = 0; i < 16; i++) {
      const th = ((i + 0.5) / 16) * TAU;
      roofPoint(th, 0.36, roofV);
      if (!inBleacher(roofV.x, roofV.z, -0.3)) continue;
      I.base(0, 0, 0, 0).cyl(0xd8d0bc, roofV.x, roofV.y / 2, roofV.z, 0.06, 0.07, roofV.y, 6);
    }
    // aerial rigging: platforms, a tightrope, two trapezes, the spotlight housings
    I.base(0, 0, TENT.z, 0);
    for (let s = -1; s <= 1; s += 2) {
      I.box(WOOD, s * 4.45, 8.6, 0, 1.0, 0.07, 1.1).beam(IRON, s * 4.0, 8.6, 0.5, s * 4.9, 10.2, 0, 0.02, 4).beam(IRON, s * 4.0, 8.6, -0.5, s * 4.9, 10.2, 0, 0.02, 4);
      for (let k = 0; k < 9; k++) I.box(WOOD, s * 4.82, 0.6 + k * 0.95, 0.24, 0.05, 0.05, 0.42);
      I.cyl(0x1c1c20, s * 4.75, 11.0, 0, 0.2, 0.26, 0.5, 8, 0, 0, s * 0.5);
      I.beam(ROPE, s * 1.9, 12.4, -0.5, s * 1.9, 9.3, -0.5, 0.012, 4).beam(ROPE, s * 1.9, 12.4, 0.5, s * 1.9, 9.3, 0.5, 0.012, 4).beam(GOLD, s * 1.9, 9.3, -0.55, s * 1.9, 9.3, 0.55, 0.025, 5);
    }
    I.beam(ROPE, -4.9, 8.72, 0, 4.9, 8.72, 0, 0.014, 4);
    Em.base(0, 0, TENT.z, 0).cyl(0xfff4d8, -4.62, 10.82, 0, 0.17, 0.17, 0.05, 8, 0, 0, -0.5).cyl(0xfff4d8, 4.62, 10.82, 0, 0.17, 0.17, 0.05, 8, 0, 0, 0.5);
    // the costume rack inside the performers' entrance
    {
      const x = -13.5, z0 = 7.3, z1 = 9.8;
      I.base(0, 0, 0, 0).beam(IRON, x, 0, z0, x, 1.75, z0, 0.03, 5).beam(IRON, x, 0, z1, x, 1.75, z1, 0.03, 5).beam(IRON, x, 1.72, z0, x, 1.72, z1, 0.025, 5);
      const G = [0xc4352a, 0xf0d25a, 0x2f7fb8, 0x8a3fa0, 0xeadfc4, 0x3f9a5a, 0xd86a9a, 0x2a2a30, 0xf07a2a, 0xc4352a];
      for (let k = 0; k < 10; k++) I.box(G[k], x + (k % 2) * 0.04, 1.02 - (k % 3) * 0.08, z0 + 0.2 + k * 0.235, 0.5, 1.25 - (k % 3) * 0.16, 0.14, (k % 2) * 0.1);
      const o = makeObb(x, (z0 + z1) / 2, 0, (z1 - z0) / 2, 0.32, 1.8);
      solids.push(o); sightBlocks.push(o);
    }
    // the prop pile (the bottles stand on the small crate)
    {
      const x = PROPS.x, z = PROPS.z;
      I.base(x, 0, z, 0.3);
      I.box(0x5a3a26, -0.75, 0.32, 0.65, 1.3, 0.64, 0.8).box(GOLD, -0.75, 0.5, 0.65, 1.34, 0.05, 0.84).box(0x8a6a44, -0.5, 0.95, 0.6, 0.6, 0.6, 0.6, 0.4);
      I.box(0x8a6a44, 0.55, 0.3, -0.5, 0.7, 0.6, 0.7);
      // a unicycle leaning on the trunk, juggling clubs, a hoop
      I.cyl(0x18181a, 0.1, 0.33, 0.9, 0.33, 0.33, 0.05, 14, 0, 0, Math.PI / 2 - 0.25).beam(IRON, 0.1, 0.33, 0.9, 0.38, 1.05, 0.9, 0.02, 4).box(0x8e1f1c, 0.42, 1.08, 0.9, 0.12, 0.05, 0.3);
      for (let k = 0; k < 4; k++) I.cyl(k % 2 ? 0xf0d25a : 0xc4352a, -1.5 + k * 0.16, 0.07, -0.1 + (k % 2) * 0.3, 0.03, 0.07, 0.42, 6, Math.PI / 2, k * 0.9);
      collide(x - 0.85, z + 0.45, 0.85); collide(x + 0.67, z - 0.3, 0.52);
      cover.push({ x: x - 0.85, z: z + 0.45, r: 0.85, h: 1.2 });
    }
    // the drape: a frame with a heavy curtain, by the south-east aisle
    {
      const yaw = Math.atan2(6, 9), tx = Math.sin(yaw), tz = Math.cos(yaw), hl = 1.3;
      const x0 = DRAPE.x - tx * hl, z0 = DRAPE.z - tz * hl, x1 = DRAPE.x + tx * hl, z1 = DRAPE.z + tz * hl;
      I.base(0, 0, 0, 0).beam(WOOD_D, x0, 0, z0, x0, 2.5, z0, 0.04, 5).beam(WOOD_D, x1, 0, z1, x1, 2.5, z1, 0.04, 5).beam(WOOD_D, x0, 2.46, z0, x1, 2.46, z1, 0.035, 5);
      Cl.base(0, 0, 0, 0);
      const nx = tz, nz = -tx;
      for (let k = 0; k < 10; k++) {
        const a = k / 10, b = (k + 1) / 10, oa = (k % 2 ? 0.07 : -0.07), ob = -oa;
        const ax = lerp(x0, x1, a) + nx * oa, az = lerp(z0, z1, a) + nz * oa, bx = lerp(x0, x1, b) + nx * ob, bz = lerp(z0, z1, b) + nz * ob;
        Cl.quad(ax, 0.08, az, bx, 0.08, bz, bx, 2.44, bz, ax, 2.44, az, 0x243a7a, 0.7, 0.7, 0, 0, 0x2c4690);
        Cl.quad(ax, 0.08, az, bx, 0.08, bz, bx, 0.3, bz, ax, 0.3, az, GOLD, 0.7, 0.7, 0.62, 0.62);
      }
      const o = makeObb(DRAPE.x, DRAPE.z, yaw, hl, 0.14, 2.4);
      sightBlocks.push(o);
      collide(x0, z0, 0.14); collide(x1, z1, 0.14);
    }
    // sawdust lamp glow that never goes out entirely: the ring's working light
    discs.push({ x: TENT.x, y: 0.06, z: TENT.z, r: 7.4, col: [1.0, 0.8, 0.5], kind: 0, k: 0.1 });
  }

  // ---------------------------------------------------------------------------------------------- meshes
  addMesh(lot, L.build(), stdMat(), true, true);
  addMesh(group, Tn.build(), stdMat(), true, true);
  addMesh(interior, I.build(), stdMat({ color: 0xfff0dc }), false, true);
  const clothMat = patchSway(stdMat({ side: THREE.DoubleSide, roughness: 0.85 }), 1.6, "circus-cloth");
  addMesh(group, Cl.build(), clothMat, false, false);
  const emMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  addMesh(group, Em.build(), emMat, false, false);
  const atlasTex = new THREE.CanvasTexture(paintAtlas());
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = 4;
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(dPos), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(dNor), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(dUv), 2));
    addMesh(group, g, new THREE.MeshStandardMaterial({ map: atlasTex, roughness: 0.8, emissive: 0xffffff, emissiveMap: atlasTex, emissiveIntensity: 0.22, side: THREE.DoubleSide }), false, false);
  }
  // wires
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(wires), 3));
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x15130f }));
    m.matrixAutoUpdate = false;
    group.add(m);
  }
  // bulbs: one InstancedMesh, tinted per bulb
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const dummy = new THREE.Object3D(), tmpC = new THREE.Color();
  {
    const n = bulbs.length / 4;
    const m = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.075, 1), bulbMat, n);
    for (let i = 0; i < n; i++) {
      dummy.position.set(bulbs[i * 4], bulbs[i * 4 + 1], bulbs[i * 4 + 2]);
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, tmpC.set(BULB_COLS[bulbs[i * 4 + 3] | 0]));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false; m.matrixAutoUpdate = false;
    group.add(m);
  }

  // ---------------------------------------------------------------------------------------------- light pools, cones, mist
  const DYN = 5; // ring spot 0, ring spot 1, lot searchlight 0, lot searchlight 1, the calliope's glow
  const nDisc = discs.length + DYN, nCone = cones.length + 4, dI0 = discs.length, cI0 = cones.length;
  const discCol = new Float32Array(nDisc * 4), coneCol = new Float32Array(nCone * 4);
  const lightUniforms = { uLamp: U.uLamp, uSpot: U.uSpot };
  const discGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  discGeo.setAttribute("aCol", new THREE.InstancedBufferAttribute(discCol, 4));
  const discMesh = new THREE.InstancedMesh(discGeo, new THREE.ShaderMaterial({
    uniforms: lightUniforms, vertexShader: DISC_VERT, fragmentShader: DISC_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }), nDisc);
  const coneGeo = new THREE.ConeGeometry(1, 1, 20, 1, true).translate(0, -0.5, 0);
  coneGeo.setAttribute("aCol", new THREE.InstancedBufferAttribute(coneCol, 4));
  const coneMesh = new THREE.InstancedMesh(coneGeo, new THREE.ShaderMaterial({
    uniforms: lightUniforms, vertexShader: CONE_VERT, fragmentShader: CONE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  }), nCone);
  discMesh.frustumCulled = false; coneMesh.frustumCulled = false;
  discMesh.renderOrder = 2; coneMesh.renderOrder = 3;
  group.add(discMesh, coneMesh);
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);
  function setDisc(i, x, y, z, r) {
    dummy.position.set(x, y, z); dummy.quaternion.identity(); dummy.scale.set(r, 1, r); dummy.updateMatrix();
    discMesh.setMatrixAt(i, dummy.matrix);
  }
  function setCone(i, ax, ay, az, tx, ty, tz, r) {
    vA.set(tx - ax, ty - ay, tz - az);
    const len = vA.length();
    dummy.position.set(ax, ay, az);
    if (len > 1e-4) dummy.quaternion.setFromUnitVectors(DOWN, vA.divideScalar(len)); else dummy.quaternion.identity();
    dummy.scale.set(r, len, r); dummy.updateMatrix();
    coneMesh.setMatrixAt(i, dummy.matrix);
  }
  const setCol = (arr, i, c, k, kind) => { arr[i * 4] = c[0] * k; arr[i * 4 + 1] = c[1] * k; arr[i * 4 + 2] = c[2] * k; arr[i * 4 + 3] = kind; };
  for (let i = 0; i < discs.length; i++) { const d = discs[i]; setDisc(i, d.x, d.y, d.z, d.r); setCol(discCol, i, d.col, d.k, d.kind); }
  for (let i = 0; i < cones.length; i++) { const c = cones[i]; setCone(i, c.x, c.y, c.z, c.tx, c.ty, c.tz, c.r); setCol(coneCol, i, c.col, c.k, c.kind); }
  const SPOT_COL = [1.0, 0.94, 0.78];
  for (let i = 0; i < 4; i++) { setCol(discCol, dI0 + i, SPOT_COL, i < 2 ? 0.8 : 0.7, 1); setCol(coneCol, cI0 + i, SPOT_COL, i < 2 ? 0.55 : 0.5, 1); setDisc(dI0 + i, 0, -50, 0, 0.001); setCone(cI0 + i, 0, -50, 0, 0, -51, 0, 0.001); }
  setCol(discCol, dI0 + 4, [0.9, 0.5, 1.0], 0, 0);
  setDisc(dI0 + 4, CALLIOPE.x, gy(CALLIOPE.x, CALLIOPE.z - 2) + 0.04, CALLIOPE.z - 1.6, 4.2);
  discMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); coneMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const mistMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uOp: { value: 0.1 }, uCol: { value: new THREE.Color(0x9fb2d6) } },
    vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, transparent: true, depthWrite: false, fog: false,
  });
  {
    const N = 12, m = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), mistMat, N);
    let n = 0, guard = 0;
    while (n < N && guard++ < 400) {
      const x = lerp(LOT.minX + 6, LOT.maxX - 6, rnd()), z = lerp(LOT.minZ + 5, LOT.maxZ - 5, rnd());
      if (Math.hypot(x - TENT.x, z - TENT.z) < 25 || Math.hypot(x - PAD.x, z - PAD.z) < 9) continue;
      dummy.position.set(x, 0.32 + rnd() * 0.25, z); dummy.quaternion.identity(); dummy.scale.set(7 + rnd() * 5, 1, 6 + rnd() * 5); dummy.updateMatrix();
      m.setMatrixAt(n++, dummy.matrix);
    }
    m.count = n; m.frustumCulled = false; m.renderOrder = 1;
    lot.add(m);
  }

  // ---------------------------------------------------------------------------------------------- moving parts
  const cageY = bump(CAGE.x, CAGE.z);
  const doorMesh = (() => {
    const b = createBaker(THREE);
    b.box(IRON, 0, 0.9, 0.6, 0.05, 0.06, 1.2).box(IRON, 0, 0.03, 0.6, 0.05, 0.06, 1.2).box(IRON, 0, 1.76, 0.6, 0.05, 0.06, 1.2);
    for (let z = 0.06; z <= 1.16; z += 0.18) b.beam(IRON, 0, 0, z, 0, 1.76, z, 0.022, 5);
    b.box(GOLD, 0.04, 0.9, 1.12, 0.05, 0.16, 0.12);
    const m = new THREE.Mesh(b.build(), stdMat({ metalness: 0.3, roughness: 0.6 }));
    m.position.set(CAGE.x1, cageY + 0.9, CAGE.z - CAGE.doorHalf);
    m.castShadow = true;
    lot.add(m);
    return m;
  })();
  const latchMat = new THREE.MeshBasicMaterial({ color: 0xffd24a });
  const latchMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.16), latchMat);
  latchMesh.position.set(CAGE.x1 + 0.03, cageY + 1.8, CAGE.z + CAGE.doorHalf + 0.03);
  lot.add(latchMesh);
  const gateY = gy(0, FENCE_Z);
  const gateMesh = (() => {
    const b = createBaker(THREE), w = GATE_HALF * 2;
    b.box(WOOD_D, w / 2, 0.25, 0, w, 0.12, 0.07).box(WOOD_D, w / 2, 1.95, 0, w, 0.12, 0.07).box(WOOD_D, 0.06, 1.1, 0, 0.12, 1.82, 0.07).box(WOOD_D, w - 0.06, 1.1, 0, 0.12, 1.82, 0.07);
    for (let x = 0.3; x < w - 0.2; x += 0.3) b.box(0x6b5038, x, 1.1, 0, 0.2, 1.7, 0.04);
    b.box(WOOD_D, w / 2, 1.1, -0.04, w * 1.1, 0.1, 0.03, 0, 0, 0.5);
    b.box(0xc4352a, w / 2, 1.15, -0.08, w + 0.5, 0.12, 0.08); // the bar you slap
    const m = new THREE.Mesh(b.build(), stdMat());
    m.position.set(-GATE_HALF, gateY, FENCE_Z);
    m.castShadow = true;
    lot.add(m);
    return m;
  })();
  const bellY = gy(BELL.x, BELL.z);
  const puck = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.08), new THREE.MeshStandardMaterial({ color: 0xc4352a, roughness: 0.5 }));
  puck.position.set(BELL.x, bellY + 0.75, BELL.z + 0.19);
  lot.add(puck);
  const N_BOTTLE = 6;
  const bottleMesh = (() => {
    const b = createBaker(THREE);
    b.ao = 0.1;
    b.cyl(0x3f8a55, 0, 0.11, 0, 0.045, 0.045, 0.22, 7).cyl(0x3f8a55, 0, 0.25, 0, 0.016, 0.045, 0.07, 7).cyl(0x35764a, 0, 0.32, 0, 0.016, 0.016, 0.08, 6);
    const m = new THREE.InstancedMesh(b.build(), stdMat({ roughness: 0.25, metalness: 0.1 }), N_BOTTLE);
    m.frustumCulled = false;
    interior.add(m);
    return m;
  })();
  // the bottle crate sits at local (0.55, -0.5) of the pile, turned 0.3
  const bottleBase = { x: PROPS.x + 0.55 * Math.cos(0.3) - 0.5 * Math.sin(0.3), z: PROPS.z - 0.55 * Math.sin(0.3) - 0.5 * Math.cos(0.3), y: 0.6 };
  function poseBottles(t) {
    for (let i = 0; i < N_BOTTLE; i++) {
      const k = t < 0 ? 0 : clamp((t - i * 0.06) / 0.55, 0, 1), e = k * k;
      const ox = (i - 2.5) * 0.1, oz = ((i * 7) % 3 - 1) * 0.09;
      dummy.position.set(bottleBase.x + ox + e * (0.45 + (i % 3) * 0.16), bottleBase.y * (1 - e) + 0.045 * e, bottleBase.z + oz - e * (0.2 + (i % 2) * 0.3));
      dummy.rotation.set(e * 0.4 * (i % 2 ? 1 : -1), i * 1.3, -e * (Math.PI / 2) - Math.sin(k * Math.PI) * 0.4);
      dummy.scale.setScalar(1); dummy.updateMatrix();
      bottleMesh.setMatrixAt(i, dummy.matrix);
    }
    bottleMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------------------------- world queries
  const cageObb = makeObb(CAGE.x, CAGE.z, Math.PI / 2, 1.5, 1.0, 2.8);
  const DRAPE_HIDE = { x: DRAPE.x + (9 / Math.hypot(9, 6)) * 0.75, z: DRAPE.z - (6 / Math.hypot(9, 6)) * 0.75, r: 1.0 };
  let mode = "night", modeT = 0, lampLv = 1, spotLv = 1, bulbLv = 1;
  const spots = [{ x: TENT.x + 3.5, z: TENT.z, r: SPOT_R }, { x: TENT.x - 3.6, z: TENT.z, r: SPOT_R }];
  const lotSpots = [{ x: -14, z: -20, r: 5 }, { x: 0, z: 33, r: 5 }];
  const gate = { opened: false, t: 0, bar: pt(0, gateY + 1.15, FENCE_Z - 0.1), open() { gate.opened = true; } };
  const cage = {
    door: { opened: false, t: 0, open() { cage.door.opened = true; } },
    latch: {
      hits: 0, pos: pt(CAGE.x1 + 0.03, cageY + 1.8, CAGE.z + CAGE.doorHalf + 0.03),
      hit() { if (cage.latch.hits >= 3) return false; cage.latch.hits++; cage.rattle(); return cage.latch.hits >= 3; },
    },
    shake: 0,
    rattle() { cage.shake = 0.45; },
  };

  function doorOpen(dx, dz, shrink) {
    for (let i = 0; i < DOORS.length; i++) {
      const d = DOORS[i];
      if (dx * d.ux + dz * d.uz > 0 && Math.abs(dx * d.uz - dz * d.ux) < d.half - shrink) return true;
    }
    return false;
  }
  function sight(x0, z0, x1, z1) {
    for (let i = 0; i < sightBlocks.length; i++) if (segObb(sightBlocks[i], x0, z0, x1, z1)) return false;
    // the tent wall: a circle with three openings
    const dx = x1 - x0, dz = z1 - z0, fx = x0 - TENT.x, fz = z0 - TENT.z;
    const a = dx * dx + dz * dz;
    if (a < 1e-8) return true;
    const b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - TENT.r * TENT.r;
    const disc = b * b - 4 * a * c;
    if (disc <= 0) return true;
    const sq = Math.sqrt(disc);
    let t = (-b - sq) / (2 * a);
    if (t > 0 && t < 1 && !doorOpen(fx + dx * t, fz + dz * t, 0.1)) return false;
    t = (-b + sq) / (2 * a);
    if (t > 0 && t < 1 && !doorOpen(fx + dx * t, fz + dz * t, 0.1)) return false;
    return true;
  }
  function hidden(x, z) {
    if (inCage(x, z)) return x < CAGE.x0 + 1.15;
    for (let i = 0; i < wagonObbs.length; i++) if (inObb(wagonObbs[i], x, z, 0.4)) return true;
    if (inBleacher(x, z, -0.15)) return true;
    let dx = x - HAY.x, dz = z - HAY.z;
    if (dx * dx + dz * dz < 0.81) return true;
    dx = x - DRAPE_HIDE.x; dz = z - DRAPE_HIDE.z;
    if (dx * dx + dz * dz < DRAPE_HIDE.r * DRAPE_HIDE.r) return true;
    for (let i = 0; i < BARRELS.length; i++) { dx = x - BARRELS[i].x; dz = z - BARRELS[i].z; if (dx * dx + dz * dz < 0.4) return true; }
    return false;
  }
  function lit(x, z) {
    let v = 0.15;
    if (mode !== "dark") {
      for (let i = 0; i < LAMPS.length; i++) {
        const l = LAMPS[i], d = Math.hypot(x - l.x, z - l.z);
        if (d < l.r) { const k = 0.15 + 0.65 * (1 - sm(l.r * 0.78, l.r, d)); if (k > v) v = k; }
      }
      for (let i = 0; i < 2; i++) { const s = spots[i], dx = x - s.x, dz = z - s.z; if (dx * dx + dz * dz < s.r * s.r) v = 1; }
    }
    if (mode === "dark") return v * 0.3;
    if (mode === "alarm") {
      for (let i = 0; i < 2; i++) { const s = lotSpots[i], dx = x - s.x, dz = z - s.z; if (dx * dx + dz * dz < s.r * s.r) v = 1; }
      if (v < 0.6 && !hidden(x, z)) v = 0.6;
    }
    return v;
  }
  function surfaceAt(x, z) {
    if (inCage(x, z)) return "wood";
    let dx = x - PAD.x, dz = z - PAD.z;
    if (dx * dx + dz * dz < PAD.r * PAD.r) return "concrete";
    dx = x - TENT.x; dz = z - TENT.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 18.6 * 18.6) {
      if (d2 > 15.4 * 15.4 && doorOpen(dx, dz, 0)) return "canvas";
      return "dirt";
    }
    if (x > 19 && z > -23 && z < 23) return "dirt";
    if (x < 1 && x > -28.5 && z < -11 && z > -25.5) return "dirt";
    if (Math.abs(x) < 3.5 && (z > 25 || z < -9)) return "dirt";
    return "grass";
  }
  function pushBleacher(obj, r) {
    if (!inBleacher(obj.x, obj.z, r)) return;
    const dx = obj.x - TENT.x, dz = obj.z - TENT.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    let best = d - (BL_R0 - r), kind = 0, bi = -1;
    if (BL_R1 + r - d < best) { best = BL_R1 + r - d; kind = 1; }
    for (let i = 0; i < AISLES.length; i++) {
      const a = AISLES[i];
      if (dx * a.ux + dz * a.uz <= 0) continue;
      const pen = Math.abs(dx * a.uz - dz * a.ux) - (a.half - r);
      if (pen < best) { best = pen; kind = 2; bi = i; }
    }
    if (kind === 0) { const k = (BL_R0 - r) / d; obj.x = TENT.x + dx * k; obj.z = TENT.z + dz * k; }
    else if (kind === 1) { const k = (BL_R1 + r) / d; obj.x = TENT.x + dx * k; obj.z = TENT.z + dz * k; }
    else {
      // slide sideways into the aisle: remove the lateral excess
      const a = AISLES[bi], cr = dx * a.uz - dz * a.ux, want = (cr < 0 ? -1 : 1) * (a.half - r), dl = want - cr;
      obj.x += a.uz * dl; obj.z -= a.ux * dl;
    }
  }
  function confine(obj, radius) {
    const r = radius || 0.35, tall = r >= 0.42;
    // the cage: bars all round, the door on +x
    const inDoor = cage.door.opened && !tall && Math.abs(obj.z - CAGE.z) < CAGE.doorHalf - 0.22 && obj.x > CAGE.x1 - 0.6 && obj.x < CAGE.x1 + r + 0.1;
    if (!inDoor) {
      if (!tall && inCage(obj.x, obj.z)) {
        obj.x = clamp(obj.x, CAGE.x0 + 0.32, CAGE.x1 - 0.32); obj.z = clamp(obj.z, CAGE.z0 + 0.32, CAGE.z1 - 0.32);
        return;
      }
      pushObb(cageObb, obj, r);
    }
    for (let i = 0; i < solids.length; i++) pushObb(solids[i], obj, r);
    if (tall) {
      for (let i = 0; i < wagonObbs.length; i++) pushObb(wagonObbs[i], obj, r);
      pushBleacher(obj, r);
    }
    // the tent wall
    const dx = obj.x - TENT.x, dz = obj.z - TENT.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d > 1 && Math.abs(d - TENT.r) < 0.25 + r && !doorOpen(dx, dz, r * 0.7)) {
      const k = (TENT.r + (d < TENT.r ? -1 : 1) * (0.25 + r)) / d;
      obj.x = TENT.x + dx * k; obj.z = TENT.z + dz * k;
    }
    // the inner fence
    if (Math.abs(obj.z - FENCE_Z) < 0.25 + r) {
      const open = (gate.opened && Math.abs(obj.x) < GATE_HALF - r * 0.6) || (!tall && Math.abs(obj.x - GAP_X) < 0.42);
      if (!open) obj.z = FENCE_Z + (obj.z < FENCE_Z ? -1 : 1) * (0.25 + r);
    }
    obj.x = clamp(obj.x, LOT.minX + 0.3 + r, LOT.maxX - 0.3 - r);
    obj.z = clamp(obj.z, LOT.minZ + 0.3 + r, LOT.maxZ - 0.3 - r);
  }

  // ---------------------------------------------------------------------------------------------- lights
  let world = null;
  function setLights(m, seconds) {
    if (m !== "night" && m !== "dark" && m !== "alarm") m = "night";
    modeT = m !== "night" && seconds > 0 ? seconds : 0;
    if (m === mode) return;
    mode = m;
    world.lights = m;
    if (ctx.world === world && ctx.setEnv) ctx.setEnv(ENVS[m], m === "dark" ? 0.35 : 0.8);
  }

  // ---------------------------------------------------------------------------------------------- distractions
  const hitP = new THREE.Vector3();
  let genOff = 0;
  const distractions = {
    bell: {
      x: BELL.x, z: BELL.z, radius: 12, used: false, t: -1,
      trigger() { const d = distractions.bell; if (d.t >= 0 && d.t < 1.1) return; d.used = true; d.t = 0; d.rung = false; },
      reset() { const d = distractions.bell; d.used = false; d.t = -1; puck.position.y = bellY + 0.75; },
    },
    bottles: {
      x: PROPS.x, z: PROPS.z, radius: 7, used: false, t: -1,
      trigger() { const d = distractions.bottles; if (d.used) return; d.used = true; d.t = 0; sfx("bottles"); },
      reset() { const d = distractions.bottles; d.used = false; d.t = -1; poseBottles(-1); },
    },
    generator: {
      x: GENERATOR.x, z: GENERATOR.z, radius: 0, used: false, seconds: 8,
      trigger() {
        const d = distractions.generator;
        if (mode === "dark") return;
        d.used = true;
        sfx("generator", true, true); genOff = 2.2;
        setLights("dark", d.seconds);
      },
      reset() { distractions.generator.used = false; if (genOff > 0) { genOff = 0; sfx("generator", false); } },
    },
    calliope: {
      x: CALLIOPE.x, z: CALLIOPE.z, radius: 14, used: false, t: -1, seconds: 10,
      trigger() { const d = distractions.calliope; if (d.t >= 0) return; d.used = true; d.t = 0; sfx("calliope", 1); },
      reset() { const d = distractions.calliope; d.used = false; d.t = -1; setCol(discCol, dI0 + 4, [0.9, 0.5, 1.0], 0, 0); discGeo.attributes.aCol.needsUpdate = true; },
    },
  };

  // ---------------------------------------------------------------------------------------------- update
  let inside = false, lastTime = 0;
  function placeSpots(time) {
    const a = (time * TAU) / 9, b = (time * TAU) / 13;
    spots[0].x = TENT.x + 3.5 * Math.cos(a); spots[0].z = TENT.z + 3.5 * Math.sin(a);
    spots[1].x = TENT.x - 3.6 * Math.cos(b); spots[1].z = TENT.z + 3.3 * Math.sin(2 * b);
    lotSpots[0].x = -13 + 13 * Math.cos(time * 0.5); lotSpots[0].z = -19 + 6 * Math.sin(time * 0.71);
    lotSpots[1].x = 13 * Math.sin(time * 0.43 + 1); lotSpots[1].z = 32.5 + 4.5 * Math.cos(time * 0.8);
  }
  function update(dt, time, fxp, fzp) {
    lastTime = time;
    U.uTime.value = time;
    if (modeT > 0) { modeT -= dt; if (modeT <= 0) setLights("night"); }
    if (genOff > 0) { genOff -= dt; if (genOff <= 0) sfx("generator", false); }
    // lamp levels ease toward the mode (a dying flicker on the way down)
    const wantLamp = mode === "dark" ? 0.05 : mode === "alarm" ? 1.2 : 1, wantSpot = mode === "dark" ? 0 : mode === "alarm" ? 1.25 : 1, k = Math.min(1, dt * 5);
    lampLv += (wantLamp - lampLv) * k; spotLv += (wantSpot - spotLv) * k; bulbLv += ((mode === "dark" ? 0.07 : 1) - bulbLv) * k;
    const fl = mode === "dark" && lampLv > 0.12 ? 0.6 + 0.4 * Math.sin(time * 47) : 1;
    U.uLamp.value = lampLv * fl; U.uSpot.value = spotLv;
    bulbMat.color.setScalar(bulbLv * fl);
    emMat.color.setScalar(0.2 + 0.8 * Math.min(1, lampLv) * fl);
    // the ring spots, and the lot searchlights in an alarm
    placeSpots(time);
    for (let i = 0; i < 2; i++) {
      const s = spots[i];
      setDisc(dI0 + i, s.x, 0.075, s.z, s.r * 1.08);
      setCone(cI0 + i, TENT.x + (i ? 4.62 : -4.62), 10.8, TENT.z, s.x, 0.05, s.z, s.r);
      const q = lotSpots[i];
      if (mode === "alarm") {
        setDisc(dI0 + 2 + i, q.x, gy(q.x, q.z) + 0.05, q.z, q.r * 1.08);
        setCone(cI0 + 2 + i, i ? TENT.poleX : -TENT.poleX, 14.4, TENT.z, q.x, 0, q.z, q.r);
      } else {
        setDisc(dI0 + 2 + i, 0, -50, 0, 0.001);
        setCone(cI0 + 2 + i, 0, -50, 0, 0, -51, 0, 0.001);
      }
    }
    discMesh.instanceMatrix.needsUpdate = true; coneMesh.instanceMatrix.needsUpdate = true;
    // cage door, latch, gate
    const dr = cage.door;
    if (dr.opened && dr.t < 1) dr.t = Math.min(1, dr.t + dt / 0.7);
    if (cage.shake > 0) cage.shake = Math.max(0, cage.shake - dt);
    const e = 1 - (1 - dr.t) * (1 - dr.t);
    doorMesh.rotation.y = e * 1.95 + (dr.opened ? Math.sin(dr.t * 9) * 0.12 * (1 - dr.t) : Math.sin(time * 55) * 0.035 * (cage.shake / 0.45));
    doorMesh.position.x = CAGE.x1 + (dr.opened ? 0 : Math.sin(time * 71) * 0.012 * (cage.shake / 0.45));
    latchMesh.visible = cage.latch.hits < 3;
    if (latchMesh.visible) {
      latchMat.color.setScalar(0.55 + 0.45 * Math.sin(time * 4.5) + cage.shake);
      latchMesh.rotation.x = cage.latch.hits * 0.35 + Math.sin(time * 60) * 0.2 * (cage.shake / 0.45);
    }
    if (gate.opened && gate.t < 1) gate.t = Math.min(1, gate.t + dt / 1.1);
    const ge = gate.t * gate.t * (3 - 2 * gate.t);
    gateMesh.rotation.y = -ge * 1.7;
    // the high striker
    const bl = distractions.bell;
    if (bl.t >= 0) {
      bl.t += dt;
      const up = Math.min(1, bl.t / 0.42), y = bl.t < 0.42 ? Math.sin((up * Math.PI) / 2) : Math.max(0, 1 - ((bl.t - 0.42) / 0.7) * ((bl.t - 0.42) / 0.7));
      puck.position.y = bellY + 0.75 + 4.3 * y;
      if (!bl.rung && bl.t >= 0.42) { bl.rung = true; sfx("bell"); vfx("hitBurst", hitP.set(BELL.x, bellY + 5.2, BELL.z + 0.15), 0xffe08a); }
      if (bl.t > 1.2) bl.t = -1;
    }
    const bo = distractions.bottles;
    if (bo.t >= 0 && bo.t < 1.2) { bo.t += dt; poseBottles(bo.t); }
    const ca = distractions.calliope;
    if (ca.t >= 0) {
      ca.t += dt;
      const lv = ca.t < ca.seconds ? 0.35 + 0.25 * Math.sin(time * 6.3) * Math.sin(time * 2.1) : 0;
      discCol[(dI0 + 4) * 4] = 0.9 * lv; discCol[(dI0 + 4) * 4 + 1] = 0.5 * lv; discCol[(dI0 + 4) * 4 + 2] = lv;
      discGeo.attributes.aCol.needsUpdate = true;
      if (ca.t >= ca.seconds) ca.t = -1;
    }
    // inside the tent: the outer shell and the lot go, the bleachers and the ring show (and the reverse)
    if (fxp !== undefined) {
      const d = Math.hypot(fxp - TENT.x, fzp - TENT.z);
      if (inside ? d > 17.4 : d < 16.6) inside = !inside;
      canvasOut.visible = !inside;
      lot.visible = !(inside && d < 14.5);
      interior.visible = d < 23;
    }
  }

  function reset() {
    cage.door.opened = false; cage.door.t = 0; cage.latch.hits = 0; cage.shake = 0;
    gate.opened = false; gate.t = 0;
    distractions.bell.reset(); distractions.bottles.reset(); distractions.generator.reset(); distractions.calliope.reset();
    modeT = 0;
    setLights("night");
    lampLv = 1; spotLv = 1; bulbLv = 1;
    doorMesh.rotation.y = 0; gateMesh.rotation.y = 0; latchMesh.visible = true;
    inside = false; canvasOut.visible = true; lot.visible = true; interior.visible = true;
    placeSpots(lastTime);
  }

  // ---------------------------------------------------------------------------------------------- named points, routes
  const P = {
    cage: pt(CAGE.x, CAGE.floor, CAGE.z, Math.PI / 2),
    cageBack: pt(CAGE.x0 + 0.6, CAGE.floor, CAGE.z, Math.PI / 2),
    cageDoor: pt(-28.2, 0, -20, Math.PI / 2), cageOut: pt(-26.5, 0, -20, Math.PI / 2),
    latch: cage.latch.pos,
    cp1: pt(-25, 0, -17, 0.3), bell: pt(BELL.x, 0, BELL.z), bellPad: pt(BELL.x, 0, BELL.z - 0.75, 0),
    doorWest: pt(-17, 0, 8, Math.PI / 2), doorSouth: pt(0, 0, -9, 0), doorNorth: pt(0, 0, 25, 0),
    ring: pt(0, 0.04, 8), cp2: pt(-15, 0, 8, Math.PI / 2), props: pt(PROPS.x, 0, PROPS.z), bottles: pt(bottleBase.x, 0.6, bottleBase.z),
    drape: pt(DRAPE.x, 0, DRAPE.z), drapeHide: pt(DRAPE_HIDE.x, 0, DRAPE_HIDE.z),
    booth: pt(BOOTH.x, 0, BOOTH.z), generator: pt(GENERATOR.x, 0, GENERATOR.z), generatorLever: pt(GENERATOR.x - 0.2, 0, GENERATOR.z - 0.95),
    cp3: pt(0, 0, 27, 0), hay: pt(HAY.x, 0, HAY.z), truck: pt(TRUCK.x, 0, TRUCK.z, 0), truckDriver: pt(-13.75, 0, 34.6, Math.atan2(GAP_X + 13.75, FENCE_Z - 34.6)),
    calliope: pt(CALLIOPE.x, 0, CALLIOPE.z), calliopeCrank: pt(CALLIOPE.x, 0, CALLIOPE.z - 1.7, 0),
    gate: pt(0, 0, FENCE_Z, 0), gateBar: pt(0, 0, FENCE_Z - 0.75, 0), gateGap: pt(GAP_X, 0, FENCE_Z, 0),
    helipad: pt(PAD.x, 0, PAD.z), heliSpot: pt(0, 0.05, 46, 0), cp4: pt(0, 0, 41.5, 0),
    camCage: camPair(-31.1, 1.5, -20.65, -19, 3.4, -9.5),
    camWide: camPair(-34, 9, -30, 0, 6, 8),
    camRing: camPair(-11.5, 4.4, 1.5, 0.5, 0.9, 9),
    camGate: camPair(-3.2, 2.3, 26.2, 0.3, 1.3, 41),
    camPad: camPair(6.5, 3.2, 38.6, 0, 1.2, 46),
  };
  for (const k in P) { const p = P[k]; if (p.pos === undefined && k !== "latch" && k !== "bottles" && k !== "heliSpot") p.y = heightAt(p.x, p.z); }
  const ringRoute = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 2; ringRoute.push(i % 4 === 0 ? { x: TENT.x + Math.cos(a) * 7.9, z: TENT.z + Math.sin(a) * 7.9, wait: 1.5 } : { x: TENT.x + Math.cos(a) * 7.9, z: TENT.z + Math.sin(a) * 7.9 }); }
  const routes = {
    wagonsA: [{ x: -19.5, z: -23.7, wait: 1.5 }, { x: -27.2, z: -23.7 }, { x: -27.2, z: -21.6, wait: 1.2 }, { x: -27.2, z: -23.7 }],
    wagonsB: [{ x: -3.5, z: -11.6, wait: 2 }, { x: -19.2, z: -11.6 }, { x: -19.2, z: -18.5, wait: 1 }, { x: -11.6, z: -18.5 }, { x: -11.6, z: -11.6 }],
    tentDoor: [{ x: 1.2, z: -10.6, wait: 4, yaw: Math.PI }],
    ringA: ringRoute,
    ringB: [{ x: 0, z: 16.4, wait: 2 }, { x: 0, z: 23.2, wait: 2.5 }],
    midway: [{ x: 24, z: -18, wait: 2 }, { x: 24, z: 18, wait: 2 }, { x: 28, z: 18 }, { x: 28, z: -18 }],
    gateL: [{ x: -2.3, z: 37.9, wait: 5, yaw: Math.PI }],
    gateR: [{ x: 2.3, z: 37.9, wait: 5, yaw: Math.PI }],
    lotSweep: [{ x: -8, z: 29.6, wait: 1.5 }, { x: 7.6, z: 29.6 }, { x: 7.6, z: 35.6, wait: 1.5 }, { x: -8, z: 35.6 }],
    truckPost: [{ x: P.truckDriver.x, z: P.truckDriver.z, wait: 6, yaw: P.truckDriver.yaw }],
  };
  const dustCol = 0x8f7a5c;

  world = {
    name: "circus", group, env: ENVS.night, ENV: ENVS, maxStep: 0.45, lights: "night",
    heightAt, surfaceAt, sight, hidden, lit, confine, cover, colliders,
    camBounds: { minX: LOT.minX + 0.6, maxX: LOT.maxX - 0.6, minZ: LOT.minZ + 0.6, maxZ: LOT.maxZ - 0.6, maxY: 13 },
    P, routes, wagons: WAGONS, barrels: BARRELS, crates: CRATES.map((c) => ({ x: c[0], z: c[1], r: c[2] })), lamps: LAMPS, spots, lotSpots,
    tent: TENT, ringR: RING_R, lot: LOT,
    cage, gate, distractions, setLights,
    get inside() { return inside; },
    update, reset,
    onEnter() { if (mode !== "night" && ctx.setEnv) ctx.setEnv(ENVS[mode], 0); },
    onFootstep(wx, wz, strength, footIndex, wet, pan) {
      const s = surfaceAt(wx, wz);
      sfx("step", s, strength, pan);
      if (s === "dirt" && (footIndex < 2 || strength > 0.7)) vfx("footDust", wx, heightAt(wx, wz) + 0.02, wz, strength * 0.4, dustCol);
    },
    onJump(x, z, floorY) { if (surfaceAt(x, z) === "dirt") vfx("footDust", x, floorY + 0.03, z, 0.6, dustCol); },
    onLand(x, z, floorY, impact) {
      const s = surfaceAt(x, z);
      sfx("step", s, 0.75 + 0.5 * impact, 0);
      if (s === "dirt" || s === "grass") vfx("footDust", x, floorY + 0.03, z, 0.5 + impact, dustCol);
    },
  };
  poseBottles(-1);
  placeSpots(0);
  update(0, 0);
  return world;
}
