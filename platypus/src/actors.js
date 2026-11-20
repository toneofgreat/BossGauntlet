// actors.js — training dummy + human opponent.
// Everything is procedural: lofted BufferGeometry, canvas textures, pose-driven animation.
// No DOM access except offscreen canvases. No listeners. No per-frame allocations.
//
//   createDummy(THREE) -> { group, update, hit, shock, defeat, reset, alive, radius }
//   createHuman(THREE) -> { group, update, windup, strike, hurt, stung, shocked, defeat, taunt, radius, height }
//
// Draw calls: dummy = 2 meshes (+1 instanced straw burst only after defeat); human = 1 skinned mesh
// with 2 material groups + 1 net bag.

const TAU = Math.PI * 2;
const AX = [1, 0, 0];
const AY = [0, 1, 0];
const AZ = [0, 0, 1];
const WHITE = [1, 1, 1];
const B0 = [0, 0, 0];
const UVT = [0, 0];

// ───────────────────────────────────────────────────────────── small math helpers

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth01(v) { v = clamp01(v); return v * v * (3 - 2 * v); }
function smoothstep(a, b, v) { return smooth01((v - a) / (b - a)); }
function sgnpow(v, p) { return v < 0 ? -Math.pow(-v, p) : Math.pow(v, p); }

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

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
function addS(a, b, s) { return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; }

// sRGB hex -> linear rgb triple (vertex colours live in linear working space)
function hex(h) {
  const f = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [f((h >> 16) & 255), f((h >> 8) & 255), f(h & 255)];
}
function shade(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }

// ───────────────────────────────────────────────────────────── geometry builder (build time only)

function makeBuilder() {
  return { pos: [], uv: [], col: [], si: [], sw: [], sm: [], idx: [[], []], n: 0, smooth: 1 };
}

function pushVert(b, x, y, z, u, v, col, bn, sm) {
  b.pos.push(x, y, z);
  b.uv.push(u, v);
  b.col.push(col[0], col[1], col[2]);
  b.si.push(bn[0], bn[1], 0, 0);
  b.sw.push(1 - bn[2], bn[2], 0, 0);
  b.sm.push(sm);
  return b.n++;
}

// Generalised loft: a stack of superellipse rings, each with its own centre, radii and
// (optionally) frame, colour and bone weights. Winding is auto-oriented outward.
//   ring: { c:[x,y,z], ru, rv, ax?, az?, col?, b?:[bone0, bone1, weight1] }
//   o: { segs, exp, mat, a0, a1, ax, az, col, b, sm, uv(x,y,z,kf,len,out), ur, vr, capA, capB }
function loft(b, rings, o) {
  o = o || {};
  const segs = o.segs || 12;
  const p = 2 / (o.exp || 2);
  const mat = o.mat || 0;
  const a0 = o.a0 || 0;
  const a1 = o.a1 === undefined ? TAU : o.a1;
  const dax = o.ax || AX;
  const daz = o.az || AZ;
  const sm = o.sm !== undefined ? o.sm : b.smooth++;
  const ur = o.ur || 4;
  const vr = o.vr || 20;
  const base = b.n;
  const row = segs + 1;
  let len = 0;
  const lens = [];

  for (let i = 0; i < rings.length; i++) {
    const R = rings[i];
    const ax = R.ax || dax;
    const az = R.az || daz;
    const col = R.col || o.col || WHITE;
    const bn = R.b || o.b || B0;
    if (i > 0) {
      const Q = rings[i - 1];
      len += Math.hypot(R.c[0] - Q.c[0], R.c[1] - Q.c[1], R.c[2] - Q.c[2], (R.ru - Q.ru) * 0.5);
    }
    lens.push(len);
    for (let k = 0; k <= segs; k++) {
      const kf = k / segs;
      const th = a0 + (a1 - a0) * kf;
      const sx = sgnpow(Math.cos(th), p) * R.ru;
      const sz = sgnpow(Math.sin(th), p) * R.rv;
      const x = R.c[0] + ax[0] * sx + az[0] * sz;
      const y = R.c[1] + ax[1] * sx + az[1] * sz;
      const z = R.c[2] + ax[2] * sx + az[2] * sz;
      if (o.uv) o.uv(x, y, z, kf, len, UVT);
      else { UVT[0] = kf * ur; UVT[1] = len * vr; }
      pushVert(b, x, y, z, UVT[0], UVT[1], col, bn, sm);
    }
  }

  // orientation
  let flip = false;
  let dA = null;
  for (let i = 0; i < rings.length - 1; i++) {
    const d = [rings[i + 1].c[0] - rings[i].c[0], rings[i + 1].c[1] - rings[i].c[1], rings[i + 1].c[2] - rings[i].c[2]];
    if (Math.hypot(d[0], d[1], d[2]) > 1e-7) {
      const R = rings[i];
      const nrm = cross(R.az || daz, R.ax || dax);
      flip = dot(nrm, d) < 0;
      if (i === 0) dA = norm(d);
      break;
    }
  }
  if (o.flip) flip = !flip;
  const I = b.idx[mat];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < segs; k++) {
      const a = base + i * row + k;
      const bq = a + 1;
      const c = a + row;
      const d = c + 1;
      if (!flip) I.push(a, c, bq, bq, c, d);
      else I.push(a, bq, c, bq, d, c);
    }
  }

  // caps (value = outward bulge distance; true/0 = flat)
  const cap = (ri, bulge, isStart) => {
    const R = rings[ri];
    let dir = dA || [0, 0, 0];
    if (!isStart || !dA) {
      const Q = rings[isStart ? Math.min(1, rings.length - 1) : Math.max(0, rings.length - 2)];
      dir = norm([R.c[0] - Q.c[0], R.c[1] - Q.c[1], R.c[2] - Q.c[2]]);
      if (isStart) dir = [-dir[0], -dir[1], -dir[2]];
    } else {
      dir = [-dA[0], -dA[1], -dA[2]];
    }
    const cx = R.c[0] + dir[0] * bulge;
    const cy = R.c[1] + dir[1] * bulge;
    const cz = R.c[2] + dir[2] * bulge;
    if (o.uv) o.uv(cx, cy, cz, 0.5, lens[ri], UVT);
    else { UVT[0] = 0.5 * ur; UVT[1] = lens[ri] * vr; }
    const ci = pushVert(b, cx, cy, cz, UVT[0], UVT[1], R.col || o.col || WHITE, R.b || o.b || B0, sm);
    const r0 = base + ri * row;
    for (let k = 0; k < segs; k++) {
      if (isStart !== flip) I.push(ci, r0 + k, r0 + k + 1);
      else I.push(ci, r0 + k + 1, r0 + k);
    }
  };
  if (o.capA !== undefined && o.capA !== false) cap(0, o.capA === true ? 0 : o.capA, true);
  if (o.capB !== undefined && o.capB !== false) cap(rings.length - 1, o.capB === true ? 0 : o.capB, false);
}

// Ellipsoid as a loft along `ay` (default +Y) with radii rx (along ax), ry (along ay), rz (along az).
function ellip(b, c, rx, ry, rz, o) {
  o = o || {};
  const n = o.rings || 6;
  const ay = o.ay || AY;
  const rings = [];
  for (let i = 0; i <= n; i++) {
    const ph = -Math.PI / 2 + (Math.PI * i) / n;
    const s = Math.sin(ph);
    const cr = Math.max(Math.cos(ph), 0.03);
    rings.push({ c: addS(c, ay, ry * s), ru: rx * cr, rv: rz * cr });
  }
  loft(b, rings, Object.assign({ segs: 10, capA: 0, capB: 0 }, o));
}

// Torus: centre c, in-plane orthonormal axes U, V, major R, minor r.
function torus(b, c, U, V, R, r, o) {
  o = o || {};
  const n = o.around || 20;
  const N = cross(U, V);
  const rings = [];
  for (let j = 0; j <= n; j++) {
    const t = (TAU * j) / n;
    const rad = [U[0] * Math.cos(t) + V[0] * Math.sin(t), U[1] * Math.cos(t) + V[1] * Math.sin(t), U[2] * Math.cos(t) + V[2] * Math.sin(t)];
    const Rr = o.Rv ? Math.hypot(R * Math.cos(t), o.Rv * Math.sin(t)) : R;
    const cc = o.Rv
      ? [c[0] + U[0] * R * Math.cos(t) + V[0] * o.Rv * Math.sin(t), c[1] + U[1] * R * Math.cos(t) + V[1] * o.Rv * Math.sin(t), c[2] + U[2] * R * Math.cos(t) + V[2] * o.Rv * Math.sin(t)]
      : addS(c, rad, Rr);
    rings.push({ c: cc, ru: r, rv: r, ax: rad, az: N });
  }
  loft(b, rings, Object.assign({ segs: 6 }, o));
}

// Thin tapered blade/spike from p along dir.
function blade(b, p, dir, len, r, o) {
  dir = norm(dir);
  const ref = Math.abs(dir[1]) < 0.9 ? AY : AX;
  const u = norm(cross(dir, ref));
  const v = cross(dir, u);
  const bend = o.bend || 0;
  const rings = [
    { c: p, ru: r, rv: r * 0.7 },
    { c: addS(addS(p, dir, len * 0.55), v, bend * len * 0.5), ru: r * 0.8, rv: r * 0.55 },
    { c: addS(addS(p, dir, len), v, bend * len), ru: r * 0.12, rv: r * 0.12 },
  ];
  loft(b, rings, Object.assign({ segs: 3, ax: u, az: v, capA: 0, capB: 0 }, o));
}

// Finish: welded smooth normals (by position within a smoothing group), groups per material.
function finish(THREE, b, skinned) {
  const n = b.n;
  const pos = b.pos;
  const nx = new Float32Array(n * 3);
  const keyOf = new Int32Array(n);
  const map = new Map();
  let nk = 0;
  for (let i = 0; i < n; i++) {
    const k = b.sm[i] + '|' + Math.round(pos[i * 3] * 20000) + '|' + Math.round(pos[i * 3 + 1] * 20000) + '|' + Math.round(pos[i * 3 + 2] * 20000);
    let id = map.get(k);
    if (id === undefined) { id = nk++; map.set(k, id); }
    keyOf[i] = id;
  }
  const acc = new Float64Array(nk * 3);
  const index = [];
  const groups = [];
  for (let m = 0; m < b.idx.length; m++) {
    const I = b.idx[m];
    if (!I.length) continue;
    groups.push([index.length, I.length, m]);
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], bb = I[t + 1], c = I[t + 2];
      const e1x = pos[bb * 3] - pos[a * 3], e1y = pos[bb * 3 + 1] - pos[a * 3 + 1], e1z = pos[bb * 3 + 2] - pos[a * 3 + 2];
      const e2x = pos[c * 3] - pos[a * 3], e2y = pos[c * 3 + 1] - pos[a * 3 + 1], e2z = pos[c * 3 + 2] - pos[a * 3 + 2];
      const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
      for (let q = 0; q < 3; q++) {
        const id = keyOf[I[t + q]] * 3;
        acc[id] += fx; acc[id + 1] += fy; acc[id + 2] += fz;
      }
      index.push(a, bb, c);
    }
  }
  for (let i = 0; i < n; i++) {
    const id = keyOf[i] * 3;
    const l = Math.hypot(acc[id], acc[id + 1], acc[id + 2]);
    if (l > 1e-12) {
      nx[i * 3] = acc[id] / l; nx[i * 3 + 1] = acc[id + 1] / l; nx[i * 3 + 2] = acc[id + 2] / l;
    } else {
      nx[i * 3 + 1] = 1;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nx, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  if (skinned) {
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(b.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(b.sw, 4));
  }
  g.setIndex(index);
  if (groups.length > 1 || (groups.length === 1 && groups[0][2] !== 0)) {
    for (let i = 0; i < groups.length; i++) g.addGroup(groups[i][0], groups[i][1], groups[i][2]);
  }
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

function makeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

// ═════════════════════════════════════════════════════════════ TRAINING DUMMY

const ATLAS = 512;
const CELL_TARGET = [0, 0, 256, 256];
const CELL_PLAIN = [256, 0, 512, 256];
const CELL_FACE = [0, 256, 256, 512];
const CELL_WOOD = [256, 256, 512, 384];
const CELL_STRAW = [256, 384, 384, 512];
const CELL_ROPE = [384, 384, 448, 512];
const CELL_METAL = [448, 384, 512, 512];
const DUMMY_PIVOT_Y = 0.07;

function cellUV(cell, s, t, out) {
  s = clamp01(s);
  t = clamp01(t);
  const px = cell[0] + 4 + s * (cell[2] - cell[0] - 8);
  const py = cell[3] - 4 - t * (cell[3] - cell[1] - 8);
  out[0] = px / ATLAS;
  out[1] = 1 - py / ATLAS;
}

function drawDummyAtlas() {
  const cv = makeCanvas(ATLAS, ATLAS);
  const g = cv.getContext('2d');
  const rnd = mulberry32(90210);

  // burlap tile (drawn once, blitted into three cells so planar seams line up exactly)
  const bt = makeCanvas(256, 256);
  const bg = bt.getContext('2d');
  const img = bg.createImageData(256, 256);
  const d = img.data;
  const P = 6;
  const rowVar = [];
  const colVar = [];
  for (let i = 0; i < 64; i++) { rowVar.push(0.86 + rnd() * 0.28); colVar.push(0.86 + rnd() * 0.28); }
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const cx = (x / P) | 0;
      const cy = (y / P) | 0;
      const tx = (x % P) + 0.5;
      const ty = (y % P) + 0.5;
      let sh;
      let tv;
      if ((cx + cy) & 1) { sh = Math.sin((Math.PI * ty) / P); tv = rowVar[cy]; }
      else { sh = Math.sin((Math.PI * tx) / P); tv = colVar[cx]; }
      const blot = 0.94 + 0.06 * Math.sin(x * 0.031 + 1.7) * Math.sin(y * 0.027 + 0.4);
      const k = (0.5 + 0.5 * sh) * tv * blot * (0.93 + rnd() * 0.14);
      const o = (y * 256 + x) * 4;
      d[o] = Math.min(255, 196 * k);
      d[o + 1] = Math.min(255, 160 * k);
      d[o + 2] = Math.min(255, 104 * k);
      d[o + 3] = 255;
    }
  }
  bg.putImageData(img, 0, 0);
  g.drawImage(bt, 0, 0);
  g.drawImage(bt, 256, 0);
  g.drawImage(bt, 0, 256);

  const THREAD = '#2a1f16';
  const stitchLine = (x0, y0, x1, y1, step) => {
    const L = Math.hypot(x1 - x0, y1 - y0);
    const ux = (x1 - x0) / L;
    const uy = (y1 - y0) / L;
    g.strokeStyle = THREAD;
    g.lineCap = 'round';
    g.lineWidth = 3;
    for (let s = step * 0.5; s < L; s += step) {
      const px = x0 + ux * s;
      const py = y0 + uy * s;
      g.beginPath();
      g.moveTo(px - uy * 5 - ux * 1.5, py + ux * 5 - uy * 1.5);
      g.lineTo(px + uy * 5 + ux * 1.5, py - ux * 5 + uy * 1.5);
      g.stroke();
    }
  };
  const patch = (x, y, w, h, tone) => {
    g.fillStyle = tone;
    g.globalAlpha = 0.55;
    g.fillRect(x, y, w, h);
    g.globalAlpha = 1;
    stitchLine(x, y, x + w, y, 9);
    stitchLine(x + w, y, x + w, y + h, 9);
    stitchLine(x + w, y + h, x, y + h, 9);
    stitchLine(x, y + h, x, y, 9);
  };

  // ── target (torso front). Torso planar map: t = (y-0.54)/0.51, target centre y = 0.80
  {
    const cx = 128;
    const cy = 256 * (1 - 0.51);
    g.save();
    g.translate(cx, cy);
    g.scale(1, 53 / 61);
    const radii = [61, 47, 33, 19, 8];
    const cols = ['#a8231c', '#efe5cc', '#a8231c', '#efe5cc', '#a8231c'];
    for (let i = 0; i < radii.length; i++) {
      g.globalAlpha = 0.86;
      g.fillStyle = cols[i];
      g.beginPath();
      for (let a = 0; a <= 48; a++) {
        const th = (a / 48) * TAU;
        const rr = radii[i] * (1 + 0.025 * Math.sin(th * 5 + i * 1.3) + 0.012 * Math.sin(th * 11 + i));
        if (a === 0) g.moveTo(Math.cos(th) * rr, Math.sin(th) * rr);
        else g.lineTo(Math.cos(th) * rr, Math.sin(th) * rr);
      }
      g.closePath();
      g.fill();
    }
    // worn paint: scratches that let the burlap show through
    g.globalAlpha = 0.35;
    g.strokeStyle = '#b8955f';
    g.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) {
      const a = rnd() * TAU;
      const r = rnd() * 58;
      const l = 5 + rnd() * 14;
      const aa = rnd() * TAU;
      g.beginPath();
      g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      g.lineTo(Math.cos(a) * r + Math.cos(aa) * l, Math.sin(a) * r + Math.sin(aa) * l);
      g.stroke();
    }
    g.restore();
    g.globalAlpha = 1;
    patch(160, 196, 40, 32, '#8a6a3c');
    stitchLine(60, 214, 108, 226, 10);
  }
  // back of torso / plain cell: a long vertical seam and a patch
  stitchLine(256 + 128, 20, 256 + 128, 236, 11);
  patch(256 + 52, 120, 44, 36, '#7d6038');

  // ── stitched face. Head planar map: s = x/0.14*0.5+0.5, t = (y-1.02)/0.29
  {
    const oy = 256;
    const eyeY = oy + 256 * (1 - 0.6);
    const drawX = (cx, cy, r) => {
      g.strokeStyle = THREAD;
      g.lineCap = 'round';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(cx - r, cy - r); g.lineTo(cx + r, cy + r);
      g.moveTo(cx + r, cy - r); g.lineTo(cx - r, cy + r);
      g.stroke();
      g.fillStyle = THREAD;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.arc(cx + (i & 1 ? r : -r), cy + (i & 2 ? r : -r), 3.2, 0, TAU);
        g.fill();
      }
    };
    drawX(128 - 42, eyeY, 13);
    drawX(128 + 42, eyeY + 2, 12);
    // brows: a determined scowl
    g.strokeStyle = THREAD;
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(128 - 62, eyeY - 30); g.lineTo(128 - 26, eyeY - 21);
    g.moveTo(128 + 62, eyeY - 29); g.lineTo(128 + 26, eyeY - 20);
    g.stroke();
    // mouth: stitched wobbly grimace
    const my = oy + 256 * (1 - 0.32);
    g.lineWidth = 3.5;
    g.beginPath();
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      const x = 128 - 50 + u * 100;
      const y = my + Math.sin(u * Math.PI) * 9 + Math.sin(u * 17) * 1.6;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      const x = 128 - 46 + u * 92;
      const y = my + Math.sin(u * Math.PI) * 9;
      g.beginPath();
      g.moveTo(x - 1.5, y - 7); g.lineTo(x + 1.5, y + 7);
      g.stroke();
    }
    patch(168, oy + 136, 34, 28, '#8a6a3c');
    // rosy painted cheek dot
    g.globalAlpha = 0.45;
    g.fillStyle = '#b5482f';
    g.beginPath(); g.arc(70, oy + 160, 11, 0, TAU); g.fill();
    g.globalAlpha = 1;
  }

  // ── wood (grain runs along the cell's vertical axis)
  {
    const [x0, y0, x1, y1] = CELL_WOOD;
    g.fillStyle = '#7a5532';
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (let i = 0; i < 150; i++) {
      const x = x0 + rnd() * (x1 - x0);
      const w = 0.6 + rnd() * 2.2;
      g.globalAlpha = 0.12 + rnd() * 0.25;
      g.strokeStyle = rnd() < 0.6 ? '#4d3219' : '#a57a49';
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, y0);
      const wob = (rnd() - 0.5) * 8;
      g.bezierCurveTo(x + wob, y0 + 40, x - wob, y0 + 90, x + wob * 0.5, y1);
      g.stroke();
    }
    g.globalAlpha = 0.5;
    g.strokeStyle = '#3c2612';
    g.lineWidth = 1.2;
    for (let k = 0; k < 2; k++) {
      const kx = x0 + 50 + k * 120 + rnd() * 30;
      const ky = y0 + 30 + rnd() * 60;
      for (let r = 2; r < 11; r += 3) { g.beginPath(); g.ellipse(kx, ky, r * 0.6, r, 0, 0, TAU); g.stroke(); }
    }
    g.globalAlpha = 1;
  }
  // ── straw
  {
    const [x0, y0, x1, y1] = CELL_STRAW;
    g.fillStyle = '#d6b655';
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (let i = 0; i < 90; i++) {
      const x = x0 + rnd() * (x1 - x0);
      g.globalAlpha = 0.2 + rnd() * 0.3;
      g.strokeStyle = rnd() < 0.5 ? '#a8862f' : '#f0d98a';
      g.lineWidth = 0.8 + rnd() * 1.6;
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (rnd() - 0.5) * 6, y1); g.stroke();
    }
    g.globalAlpha = 1;
  }
  // ── rope (diagonal twist)
  {
    const [x0, y0, x1, y1] = CELL_ROPE;
    g.fillStyle = '#b79a68';
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.save();
    g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    g.strokeStyle = '#6f5a36';
    g.lineWidth = 3;
    g.globalAlpha = 0.7;
    for (let y = y0 - 80; y < y1 + 10; y += 9) {
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y + 44); g.stroke();
    }
    g.restore();
    g.globalAlpha = 1;
  }
  // ── metal
  {
    const [x0, y0, x1, y1] = CELL_METAL;
    g.fillStyle = '#7d8288';
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (let i = 0; i < 40; i++) {
      g.globalAlpha = 0.15;
      g.fillStyle = rnd() < 0.5 ? '#4f5357' : '#aab0b6';
      g.fillRect(x0 + rnd() * 60, y0 + rnd() * 124, 2 + rnd() * 6, 1 + rnd() * 2);
    }
    g.globalAlpha = 1;
  }
  return cv;
}

function buildDummyAssets(THREE) {
  const tex = new THREE.CanvasTexture(drawDummyAtlas());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const rnd = mulberry32(4242);
  const gray = (v) => [v, v, v];
  const planar = (cell, x0, x1, y0, y1) => (x, y, z, kf, len, out) => cellUV(cell, (x - x0) / (x1 - x0), (y - y0) / (y1 - y0), out);
  const wrap = (cell, vScale, s0, s1) => (x, y, z, kf, len, out) => cellUV(cell, lerp(s0 === undefined ? 0 : s0, s1 === undefined ? 1 : s1, kf), len * vScale, out);
  const flatXZ = (cell, r) => (x, y, z, kf, len, out) => cellUV(cell, x / (2 * r) + 0.5, z / (2 * r) + 0.5, out);

  // ── static base
  const bb = makeBuilder();
  loft(bb, [
    { c: [0, 0.0, 0], ru: 0.29, rv: 0.29, col: gray(0.7) },
    { c: [0, 0.045, 0], ru: 0.3, rv: 0.3, col: gray(0.85) },
    { c: [0, 0.062, 0], ru: 0.285, rv: 0.285 },
    { c: [0, 0.066, 0], ru: 0.1, rv: 0.1, col: gray(0.9) },
    { c: [0, 0.075, 0], ru: 0.085, rv: 0.085, col: gray(0.6) },
  ], { segs: 22, uv: flatXZ(CELL_WOOD, 0.3), capA: 0, capB: 0 });
  // four iron bolts
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    ellip(bb, [Math.cos(a) * 0.21, 0.064, Math.sin(a) * 0.21], 0.02, 0.012, 0.02, { segs: 7, rings: 4, uv: wrap(CELL_METAL, 2) });
  }
  const baseGeo = finish(THREE, bb, false);

  // ── rocking body (built in world coords, translated so the pivot is the origin)
  const b = makeBuilder();
  // coil spring
  {
    const rings = [];
    const turns = 4;
    const steps = turns * 10;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * turns * TAU;
      const rad = [Math.cos(t), 0, Math.sin(t)];
      rings.push({ c: [rad[0] * 0.05, 0.07 + (i / steps) * 0.17, rad[2] * 0.05], ru: 0.011, rv: 0.011, ax: rad, az: AY });
    }
    loft(b, rings, { segs: 5, uv: wrap(CELL_METAL, 0.6), col: gray(0.85), capA: 0, capB: 0 });
  }
  // iron collar + wooden post
  loft(b, [
    { c: [0, 0.225, 0], ru: 0.062, rv: 0.062 },
    { c: [0, 0.235, 0], ru: 0.066, rv: 0.066 },
    { c: [0, 0.27, 0], ru: 0.062, rv: 0.062 },
    { c: [0, 0.275, 0], ru: 0.045, rv: 0.045 },
  ], { segs: 12, uv: wrap(CELL_METAL, 2), capA: 0 });
  loft(b, [
    { c: [0, 0.26, 0], ru: 0.043, rv: 0.043, col: gray(0.75) },
    { c: [0, 0.45, 0], ru: 0.041, rv: 0.041 },
    { c: [0, 0.62, 0], ru: 0.04, rv: 0.04, col: gray(0.7) },
  ], { segs: 10, exp: 2.6, uv: wrap(CELL_WOOD, 2.6, 0, 0.5) });

  // torso sack — front half shows the painted target, back half plain burlap
  {
    const T = [
      [0.555, 0.062, 0.058, 0.55],
      [0.585, 0.085, 0.075, 0.6],
      [0.615, 0.155, 0.122, 0.82],
      [0.68, 0.192, 0.146, 0.95],
      [0.8, 0.206, 0.156, 1.0],
      [0.9, 0.2, 0.15, 1.0],
      [0.97, 0.165, 0.128, 0.95],
      [1.015, 0.085, 0.076, 0.7],
      [1.045, 0.062, 0.06, 0.55],
    ];
    const rings = T.map((r) => ({ c: [0, r[0], 0], ru: r[1], rv: r[2], col: gray(r[3]) }));
    const sm = b.smooth++;
    loft(b, rings, { segs: 12, exp: 2.35, a0: 0, a1: Math.PI, sm, uv: planar(CELL_TARGET, -0.22, 0.22, 0.54, 1.05), capA: 0, capB: 0 });
    loft(b, rings, { segs: 12, exp: 2.35, a0: Math.PI, a1: TAU, sm, uv: planar(CELL_PLAIN, -0.22, 0.22, 0.54, 1.05), capA: 0, capB: 0 });
  }
  // head sack — front half carries the stitched face
  {
    const rings = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const ph = -Math.PI / 2 + (Math.PI * i) / n;
      const y = 1.165 + 0.14 * Math.sin(ph);
      let cr = Math.cos(ph);
      if (i === 0) cr = 0.42;          // gathered into the neck tie
      if (i === n) cr = 0.06;
      const sag = 1 + 0.07 * Math.max(0, -Math.sin(ph)); // sack slumps a little at the jowls
      rings.push({ c: [0, y, 0.004], ru: 0.136 * cr * sag, rv: 0.128 * cr * sag, col: gray(i === 0 ? 0.6 : 0.82 + 0.18 * clamp01(i / 4)) });
    }
    const sm = b.smooth++;
    loft(b, rings, { segs: 12, exp: 2.15, a0: 0, a1: Math.PI, sm, uv: planar(CELL_FACE, -0.14, 0.14, 1.02, 1.31), capB: 0 });
    loft(b, rings, { segs: 12, exp: 2.15, a0: Math.PI, a1: TAU, sm, uv: planar(CELL_PLAIN, -0.14, 0.14, 1.02, 1.31), capB: 0 });
  }
  // cross-arm: wooden bar, burlap sleeves, rope ties
  loft(b, [
    { c: [-0.44, 0.93, 0], ru: 0.027, rv: 0.027 },
    { c: [0.44, 0.93, 0], ru: 0.027, rv: 0.027 },
  ], { segs: 8, ax: AY, az: AZ, uv: wrap(CELL_WOOD, 1.1, 0.5, 1), capA: 0.004, capB: 0.004 });
  for (let s = -1; s <= 1; s += 2) {
    const sleeveUV = (x, y, z, kf, len, out) => cellUV(CELL_PLAIN, (Math.abs(x) - 0.12) / 0.44, (y - 0.8) / 0.51, out);
    loft(b, [
      { c: [s * 0.15, 0.925, 0], ru: 0.075, rv: 0.07, col: gray(0.8) },
      { c: [s * 0.24, 0.925, 0], ru: 0.066, rv: 0.062 },
      { c: [s * 0.33, 0.928, 0], ru: 0.058, rv: 0.055 },
      { c: [s * 0.375, 0.93, 0], ru: 0.04, rv: 0.04, col: gray(0.7) },
      { c: [s * 0.4, 0.93, 0], ru: 0.05, rv: 0.05, col: gray(0.85) },
    ], { segs: 10, ax: AY, az: AZ, uv: sleeveUV });
    torus(b, [s * 0.378, 0.93, 0], AY, AZ, 0.04, 0.011, { around: 12, segs: 5, uv: wrap(CELL_ROPE, 3) });
  }
  torus(b, [0, 1.035, 0], AX, AZ, 0.066, 0.013, { around: 14, segs: 5, uv: wrap(CELL_ROPE, 3) });
  torus(b, [0, 1.022, 0], AX, AZ, 0.07, 0.011, { around: 14, segs: 5, uv: wrap(CELL_ROPE, 3) });
  torus(b, [0, 0.588, 0], AX, AZ, 0.078, 0.013, { around: 14, segs: 5, uv: wrap(CELL_ROPE, 3) });
  // dangling rope end at the neck
  loft(b, [
    { c: [0.03, 1.03, 0.07], ru: 0.009, rv: 0.009 },
    { c: [0.045, 0.99, 0.1], ru: 0.009, rv: 0.009 },
    { c: [0.05, 0.94, 0.125], ru: 0.011, rv: 0.011 },
  ], { segs: 5, uv: wrap(CELL_ROPE, 3), capB: 0.004 });

  // straw tufts
  const strawUV = (x, y, z, kf, len, out) => cellUV(CELL_STRAW, kf, len * 6, out);
  const straw = (p, dir, len) => {
    const v = 0.72 + rnd() * 0.36;
    blade(b, p, dir, len, 0.0075 + rnd() * 0.004, { uv: strawUV, col: [v, v * (0.94 + rnd() * 0.08), v * 0.9], bend: (rnd() - 0.5) * 0.5 });
  };
  for (let s = -1; s <= 1; s += 2) {
    for (let i = 0; i < 13; i++) {
      straw([s * 0.395, 0.93 + (rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.04], [s, (rnd() - 0.5) * 1.0, (rnd() - 0.5) * 1.0], 0.1 + rnd() * 0.07);
    }
  }
  for (let i = 0; i < 15; i++) {
    const a = (i / 15) * TAU + rnd() * 0.3;
    straw([Math.cos(a) * 0.06, 1.03, Math.sin(a) * 0.06], [Math.cos(a), -0.35 - rnd() * 0.5, Math.sin(a)], 0.07 + rnd() * 0.05);
  }
  for (let i = 0; i < 15; i++) {
    const a = (i / 15) * TAU + rnd() * 0.3;
    straw([Math.cos(a) * 0.055, 0.585, Math.sin(a) * 0.055], [Math.cos(a) * 0.75, -1, Math.sin(a) * 0.75], 0.08 + rnd() * 0.06);
  }
  for (let i = 0; i < 9; i++) {
    straw([(rnd() - 0.5) * 0.07, 1.285, (rnd() - 0.5) * 0.07], [(rnd() - 0.5) * 1.1, 1, (rnd() - 0.5) * 1.1], 0.045 + rnd() * 0.04);
  }

  const bodyGeo = finish(THREE, b, false);
  bodyGeo.translate(0, -DUMMY_PIVOT_Y, 0);
  bodyGeo.computeBoundingSphere();
  bodyGeo.computeBoundingBox();

  // loose straw for the defeat burst (one instanced blade)
  const sb = makeBuilder();
  blade(sb, [0, -0.07, 0], AY, 0.14, 0.008, { col: hex(0xd9bc5e), bend: 0.25 });
  const strawGeo = finish(THREE, sb, false);
  const strawMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });

  return { tex, baseGeo, bodyGeo, strawGeo, strawMat };
}

const dummyAssetCache = new WeakMap();
function getDummyAssets(THREE) {
  let a = dummyAssetCache.get(THREE);
  if (!a) { a = buildDummyAssets(THREE); dummyAssetCache.set(THREE, a); }
  return a;
}

export function createDummy(THREE) {
  const A = getDummyAssets(THREE);
  const STRAW_N = 16;

  const group = new THREE.Group();
  group.name = 'dummy';
  const mat = new THREE.MeshStandardMaterial({
    map: A.tex, bumpMap: A.tex, bumpScale: 0.55, vertexColors: true, roughness: 0.94, metalness: 0,
    emissive: 0x000000,
  });
  const base = new THREE.Mesh(A.baseGeo, mat);
  base.castShadow = true;
  group.add(base);
  const pivot = new THREE.Group();
  pivot.position.y = DUMMY_PIVOT_Y;
  group.add(pivot);
  const body = new THREE.Mesh(A.bodyGeo, mat);
  body.castShadow = true;
  body.frustumCulled = false; // it rocks and topples well outside its rest bounds
  pivot.add(body);

  const burst = new THREE.InstancedMesh(A.strawGeo, A.strawMat, STRAW_N);
  burst.frustumCulled = false;
  burst.visible = false;
  group.add(burst);
  const sp = new Float32Array(STRAW_N * 3);
  const sv = new Float32Array(STRAW_N * 3);
  const sr = new Float32Array(STRAW_N * 3);
  const sw = new Float32Array(STRAW_N * 3);
  const tmp = new THREE.Object3D();
  const axis = new THREE.Vector3();

  let tx = 0, tz = 0, vx = 0, vz = 0;       // lean (direction in local XZ, magnitude = angle)
  let twist = 0, vTwist = 0;
  let squash = 0, vSquash = 0;
  let shockT = 0;
  let flash = 0;
  let fallT = -1;
  let fallX = 0, fallZ = -1;
  let lastX = 0, lastZ = -1;
  let burstT = -1;
  let clock = 0;

  const toLocal = (dx, dz) => {
    const l = Math.hypot(dx, dz);
    if (l < 1e-5) { lastX = 0; lastZ = -1; return; }
    dx /= l; dz /= l;
    const yaw = group.rotation.y;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    lastX = dx * c - dz * s;
    lastZ = dx * s + dz * c;
  };

  const api = {
    group,
    alive: true,
    radius: 0.3,
    height: 1.3,

    update(dt, time) {
      clock = time !== undefined ? time : clock + dt;
      // lean spring (semi-implicit Euler, stable at dt <= 0.05)
      const K = 74, D = 4.4;
      vx += (-K * tx - D * vx) * dt; tx += vx * dt;
      vz += (-K * tz - D * vz) * dt; tz += vz * dt;
      vTwist += (-60 * twist - 4.5 * vTwist) * dt; twist += vTwist * dt;
      vSquash += (-260 * squash - 14 * vSquash) * dt; squash += vSquash * dt;

      let fall = 0;
      if (fallT >= 0) {
        fallT += dt;
        const T = 0.5;
        if (fallT < T) {
          const u = fallT / T;
          fall = 1.4 * u * u;
        } else {
          const q = fallT - T;
          fall = 1.4 - 0.16 * Math.exp(-5.5 * q) * Math.abs(Math.sin(q * 10));
        }
      }
      let lx = tx + fallX * fall;
      let lz = tz + fallZ * fall;
      let jx = 0, jy = 0, jz = 0, er = 0, eg = 0, eb = 0;
      if (shockT > 0) {
        shockT -= dt;
        const e = clamp01(shockT / 0.15);
        lx += (Math.random() - 0.5) * 0.16 * e;
        lz += (Math.random() - 0.5) * 0.16 * e;
        jx = (Math.random() - 0.5) * 0.03 * e;
        jz = (Math.random() - 0.5) * 0.03 * e;
        jy = Math.random() * 0.02 * e;
        const f = (Math.random() < 0.55 ? 1 : 0.18) * e;
        er = 0.18 * f; eg = 0.5 * f; eb = 1.0 * f;
      }
      if (flash > 0) {
        flash = Math.max(0, flash - dt * 5);
        er += 0.3 * flash; eg += 0.22 * flash; eb += 0.12 * flash;
      }
      mat.emissive.setRGB(er, eg, eb);

      const m = Math.hypot(lx, lz);
      if (m > 1e-5) pivot.quaternion.setFromAxisAngle(axis.set(lz / m, 0, -lx / m), Math.min(m, 1.5));
      else pivot.quaternion.set(0, 0, 0, 1);
      pivot.rotateY(twist + (shockT > 0 ? (Math.random() - 0.5) * 0.2 : 0));
      pivot.position.set(jx, DUMMY_PIVOT_Y + jy, jz);
      const sq = Math.max(-0.2, Math.min(0.2, squash));
      pivot.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);

      if (burstT >= 0 && burstT < 2.6) {
        burstT += dt;
        for (let i = 0; i < STRAW_N; i++) {
          const o = i * 3;
          if (sp[o + 1] > 0.03) {
            sv[o + 1] -= 6.5 * dt;
            const drag = 1 - 1.6 * dt;
            sv[o] *= drag; sv[o + 2] *= drag;
            sp[o] += sv[o] * dt; sp[o + 1] += sv[o + 1] * dt; sp[o + 2] += sv[o + 2] * dt;
            sr[o] += sw[o] * dt; sr[o + 1] += sw[o + 1] * dt; sr[o + 2] += sw[o + 2] * dt;
            if (sp[o + 1] <= 0.03) { sp[o + 1] = 0.03; sr[o] = Math.PI / 2; sr[o + 2] = 0; }
          }
          tmp.position.set(sp[o], sp[o + 1], sp[o + 2]);
          tmp.rotation.set(sr[o], sr[o + 1], sr[o + 2]);
          tmp.updateMatrix();
          burst.setMatrixAt(i, tmp.matrix);
        }
        burst.instanceMatrix.needsUpdate = true;
      }
    },

    hit(dirX, dirZ, strength) {
      const s = strength === undefined ? 1 : Math.max(0, Math.min(3, strength));
      toLocal(dirX || 0, dirZ || 0);
      const k = api.alive ? 4.4 : 0.6;
      vx += lastX * s * k;
      vz += lastZ * s * k;
      vTwist += (Math.random() - 0.5) * 5 * s * (api.alive ? 1 : 0.2);
      vSquash += 1.6 * s;
      flash = Math.min(1, 0.6 + s * 0.4);
    },

    shock() {
      shockT = 0.8;
      vSquash -= 1.2;
    },

    defeat() {
      if (!api.alive) return;
      api.alive = false;
      fallT = 0;
      fallX = lastX; fallZ = lastZ;
      vTwist += 3;
      // pop the straw out of the chest
      burstT = 0;
      burst.visible = true;
      for (let i = 0; i < STRAW_N; i++) {
        const o = i * 3;
        const a = Math.random() * TAU;
        const sp0 = 0.6 + Math.random() * 1.6;
        sp[o] = (Math.random() - 0.5) * 0.2; sp[o + 1] = 0.7 + Math.random() * 0.4; sp[o + 2] = (Math.random() - 0.5) * 0.2;
        sv[o] = Math.cos(a) * sp0 - fallX * 0.6; sv[o + 1] = 1.6 + Math.random() * 2.2; sv[o + 2] = Math.sin(a) * sp0 - fallZ * 0.6;
        sr[o] = Math.random() * TAU; sr[o + 1] = Math.random() * TAU; sr[o + 2] = Math.random() * TAU;
        sw[o] = (Math.random() - 0.5) * 14; sw[o + 1] = (Math.random() - 0.5) * 14; sw[o + 2] = (Math.random() - 0.5) * 14;
      }
    },

    reset() {
      api.alive = true;
      tx = tz = vx = vz = twist = vTwist = squash = vSquash = 0;
      shockT = 0; flash = 0; fallT = -1; burstT = -1;
      lastX = 0; lastZ = -1;
      burst.visible = false;
      mat.emissive.setRGB(0, 0, 0);
      pivot.quaternion.set(0, 0, 0, 1);
      pivot.position.set(0, DUMMY_PIVOT_Y, 0);
      pivot.scale.set(1, 1, 1);
    },
  };
  return api;
}

// ═════════════════════════════════════════════════════════════ HUMAN

// bone table: name, parent index, bind position (model space, metres)
const HB = [
  ['hips', -1, 0, 0.96, 0],
  ['spine', 0, 0, 1.08, 0],
  ['chest', 1, 0, 1.24, 0],
  ['neck', 2, 0, 1.47, -0.008],
  ['head', 3, 0, 1.55, 0],
  ['hat', 4, 0, 1.7, 0],
  ['hair', 4, 0, 1.66, 0],
  ['lids', 4, 0, 1.628, 0.03],
  ['armL', 2, 0.195, 1.42, -0.008],
  ['foreL', 8, 0.215, 1.14, -0.008],
  ['handL', 9, 0.225, 0.89, 0],
  ['armR', 2, -0.195, 1.42, -0.008],
  ['foreR', 11, -0.215, 1.14, -0.008],
  ['handR', 12, -0.225, 0.89, 0],
  ['thighL', 0, 0.09, 0.93, 0],
  ['shinL', 14, 0.095, 0.5, 0],
  ['footL', 15, 0.095, 0.085, 0],
  ['thighR', 0, -0.09, 0.93, 0],
  ['shinR', 17, -0.095, 0.5, 0],
  ['footR', 18, -0.095, 0.085, 0],
];
const BN = { hips: 0, spine: 1, chest: 2, neck: 3, head: 4, hat: 5, hair: 6, lids: 7, armL: 8, foreL: 9, handL: 10, armR: 11, foreR: 12, handR: 13, thighL: 14, shinL: 15, footL: 16, thighR: 17, shinR: 18, footR: 19 };

// pose channels
const CHN = ['rootY', 'rootRX', 'rootRZ', 'hipsRX', 'hipsRY', 'hipsRZ', 'spineRX', 'spineRY', 'spineRZ', 'chestRX', 'chestRY', 'chestRZ',
  'neckRX', 'headRX', 'headRY', 'headRZ',
  'armLX', 'armLY', 'armLZ', 'foreL', 'handLX',
  'armRX', 'armRY', 'armRZ', 'foreR', 'handRX',
  'thLX', 'thLZ', 'knL', 'ftL', 'thRX', 'thRZ', 'knR', 'ftR',
  'hatY', 'hatRX', 'hair'];
const C = {};
for (let i = 0; i < CHN.length; i++) C[CHN[i]] = i;

const NET_TILT = (35 * Math.PI) / 180; // pole tilt below the hand's forward axis in bind pose
const H_WINDUP = 0.7;   // seconds from windup() to the net hitting the ground
const H_LAND = 0.12;    // seconds of the downward swing itself
const H_HOLD = 0.22;
const H_RECOVER = 0.34;
const H_SCALE = 0.975;  // model is authored 1.795 tall incl. hat; scaled to 1.75

function buildHumanGeometry(THREE) {
  const b = makeBuilder();
  const CLOTH = 0, SMOOTH = 1;
  const skin = hex(0xd8a47c);
  const skinD = hex(0xc08a66);
  const lip = hex(0x9a4f45);
  const hairC = hex(0x35251a);
  const hatC = hex(0x6d7a43);
  const hatD = hex(0x3a3222);
  const jacket = hex(0xc2552a);
  const jacketD = hex(0x8c3a1c);
  const trouser = hex(0x3d4756);
  const trouserD = hex(0x2c343f);
  const boot = hex(0x4c3324);
  const sole = hex(0x1c1815);
  const wood = hex(0xb7996a);
  const metal = hex(0x8a9098);
  const eyeW = hex(0xf2efe8);
  const iris = hex(0x24170f);
  const zipC = hex(0x2a2a2e);

  const w1 = (a) => [a, 0, 0];
  const w2 = (a, c, w) => [a, c, w];

  // ── pelvis + torso (jacket)
  ellip(b, [0, 0.885, 0], 0.156, 0.1, 0.108, { mat: CLOTH, col: trouser, b: w1(BN.hips), segs: 14, rings: 6, ur: 30, vr: 44 });
  {
    const T = [
      [0.855, 0.166, 0.116, -0.005, w1(BN.hips), jacketD],
      [0.875, 0.171, 0.12, -0.005, w1(BN.hips), jacketD],
      [0.885, 0.171, 0.12, -0.005, w1(BN.hips), jacket],
      [0.94, 0.168, 0.117, -0.004, w1(BN.hips), jacket],
      [1.0, 0.161, 0.112, 0, w2(BN.hips, BN.spine, 0.5), jacket],
      [1.08, 0.155, 0.108, 0.004, w1(BN.spine), jacket],
      [1.16, 0.162, 0.113, 0.008, w2(BN.spine, BN.chest, 0.5), jacket],
      [1.26, 0.178, 0.122, 0.012, w1(BN.chest), jacket],
      [1.35, 0.185, 0.122, 0.008, w1(BN.chest), jacket],
      [1.41, 0.172, 0.11, 0.0, w1(BN.chest), jacket],
      [1.455, 0.128, 0.084, -0.005, w1(BN.chest), jacket],
      [1.48, 0.062, 0.06, -0.008, w2(BN.chest, BN.neck, 0.3), jacketD],
    ];
    loft(b, T.map((r) => ({ c: [0, r[0], r[3]], ru: r[1], rv: r[2], b: r[4], col: r[5] })),
      { mat: CLOTH, segs: 20, exp: 2.3, ur: 36, vr: 44, capA: 0, capB: 0 });
    // zip + storm flap down the front
    const superZ = (x, rx, rz) => rz * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x) / rx, 2.3)), 1 / 2.3);
    loft(b, T.slice(1, 11).map((r) => ({ c: [0, r[0], r[3] + r[2] + 0.001], ru: 0.009, rv: 0.004, b: r[4] })),
      { mat: SMOOTH, segs: 6, col: zipC, capA: 0, capB: 0 });
    // chest pocket flaps and hip pockets
    for (let s = -1; s <= 1; s += 2) {
            ellip(b, [s * 0.095, 0.975, -0.002 + superZ(0.095, 0.164, 0.114) - 0.0065], 0.048, 0.04, 0.0085,
        { mat: CLOTH, col: shade(jacket, 0.82), b: w2(BN.hips, BN.spine, 0.3), segs: 12, rings: 5, exp: 6, ur: 6, vr: 44 });
    }
    // collar (folded sheet around the neck)
    loft(b, [
      { c: [0, 1.458, -0.006], ru: 0.07, rv: 0.068 },
      { c: [0, 1.5, -0.004], ru: 0.08, rv: 0.078 },
      { c: [0, 1.512, -0.004], ru: 0.074, rv: 0.072 },
      { c: [0, 1.47, -0.006], ru: 0.056, rv: 0.055 },
    ], { mat: CLOTH, segs: 16, col: jacketD, b: w2(BN.chest, BN.neck, 0.25), ur: 16, vr: 44 });
  }

  // ── neck + head
  loft(b, [
    { c: [0, 1.44, -0.008], ru: 0.046, rv: 0.048, b: w1(BN.chest), col: skinD },
    { c: [0, 1.485, -0.006], ru: 0.044, rv: 0.046, b: w1(BN.neck), col: skinD },
    { c: [0, 1.535, 0.0], ru: 0.046, rv: 0.05, b: w2(BN.neck, BN.head, 0.7), col: skinD },
  ], { mat: SMOOTH, segs: 12 });
  {
    const Hd = [
      [1.505, 0.028, 0.03, 0.036],
      [1.52, 0.048, 0.055, 0.03],
      [1.545, 0.062, 0.075, 0.022],
      [1.58, 0.072, 0.088, 0.012],
      [1.615, 0.077, 0.094, 0.006],
      [1.655, 0.078, 0.096, 0.0],
      [1.69, 0.074, 0.092, -0.002],
      [1.72, 0.06, 0.076, -0.004],
      [1.737, 0.036, 0.046, -0.004],
    ];
    loft(b, Hd.map((r, i) => ({ c: [0, r[0], r[3]], ru: r[1], rv: r[2], col: i < 2 ? skinD : skin })),
      { mat: SMOOTH, segs: 18, b: w1(BN.head), capA: 0.004, capB: 0.006 });
  }
  const hd = w1(BN.head);
  const face = (c, rx, ry, rz, col, o) => ellip(b, c, rx, ry, rz, Object.assign({ mat: SMOOTH, col, b: hd, segs: 8, rings: 5 }, o || {}));
  for (let s = -1; s <= 1; s += 2) {
    face([s * 0.031, 1.628, 0.084], 0.013, 0.009, 0.009, eyeW);
    face([s * 0.0305, 1.628, 0.0905], 0.0066, 0.0068, 0.0042, iris);
    face([s * 0.032, 1.6485, 0.0895], 0.018, 0.0045, 0.0065, hairC, { ax: norm([1, -s * 0.16, 0]), ay: norm([s * 0.16, 1, 0]) });
    face([s * 0.079, 1.612, -0.002], 0.01, 0.024, 0.015, skinD);
    // cheek
    face([s * 0.04, 1.586, 0.058], 0.026, 0.022, 0.022, skin);
    // eyelids (collapse into the skull unless blinking)
    ellip(b, [s * 0.031, 1.628, 0.0865], 0.015, 0.011, 0.0105, { mat: SMOOTH, col: skinD, b: w1(BN.lids), segs: 8, rings: 5 });
  }
  face([0, 1.6, 0.1], 0.0115, 0.022, 0.016, skin);
  face([0, 1.588, 0.107], 0.0155, 0.0115, 0.0125, skin);
  face([0, 1.558, 0.093], 0.023, 0.0048, 0.0065, lip);
  face([0, 1.528, 0.078], 0.03, 0.018, 0.02, skin); // chin
  // hair under the hat
  face([0, 1.665, -0.022], 0.0885, 0.09, 0.097, hairC, { segs: 14, rings: 7 });
  // static-shock hair spikes (hair bone scales them out of the skull)
  {
    const rnd = mulberry32(77);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + rnd() * 0.3;
      const el = 0.05 + rnd() * 0.85;
      const dir = [Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el) - 0.1];
      blade(b, addS([0, 1.66, -0.01], dir, 0.05), dir, 0.15 + rnd() * 0.05, 0.016, { mat: SMOOTH, col: hairC, b: w1(BN.hair), segs: 4 });
    }
  }
  // ── hat: wide-brimmed explorer hat
  {
    const hb = w1(BN.hat);
    loft(b, [
      { c: [0, 1.688, 0.006], ru: 0.166, rv: 0.178, col: shade(hatC, 0.75) },
      { c: [0, 1.694, 0.006], ru: 0.17, rv: 0.182, col: hatC },
      { c: [0, 1.7, 0.006], ru: 0.166, rv: 0.178, col: hatC },
      { c: [0, 1.708, 0.002], ru: 0.094, rv: 0.108, col: shade(hatC, 0.8) },
      { c: [0, 1.746, 0.0], ru: 0.089, rv: 0.103, col: hatC },
      { c: [0, 1.776, -0.002], ru: 0.08, rv: 0.093, col: hatC },
      { c: [0, 1.79, -0.002], ru: 0.052, rv: 0.062, col: shade(hatC, 1.08) },
    ], { mat: CLOTH, segs: 20, b: hb, ur: 24, vr: 44, capA: 0, capB: 0.005 });
    torus(b, [0, 1.716, 0.001], AX, AZ, 0.094, 0.0075, { Rv: 0.108, around: 20, segs: 5, mat: SMOOTH, col: hatD, b: hb });
  }

  // ── limbs
  for (let s = -1; s <= 1; s += 2) {
    const L = s > 0;
    const arm = L ? BN.armL : BN.armR;
    const fore = L ? BN.foreL : BN.foreR;
    const hand = L ? BN.handL : BN.handR;
    const thigh = L ? BN.thighL : BN.thighR;
    const shin = L ? BN.shinL : BN.shinR;
    const foot = L ? BN.footL : BN.footR;

    // sleeve
    const Aa = [
      [1.44, 0.172, 0.02, w1(arm), jacket],
      [1.426, 0.186, 0.042, w1(arm), jacket],
      [1.39, 0.197, 0.054, w1(arm), jacket],
      [1.33, 0.205, 0.056, w1(arm), jacket],
      [1.22, 0.211, 0.05, w1(arm), jacket],
      [1.17, 0.213, 0.047, w2(arm, fore, 0.25), jacket],
      [1.14, 0.215, 0.0465, w2(arm, fore, 0.5), jacket],
      [1.11, 0.216, 0.0455, w2(arm, fore, 0.75), jacket],
      [1.02, 0.22, 0.043, w1(fore), jacket],
      [0.935, 0.224, 0.038, w1(fore), jacket],
      [0.915, 0.225, 0.041, w1(fore), jacketD],
      [0.9, 0.225, 0.04, w1(fore), jacketD],
      [0.896, 0.225, 0.028, w1(fore), jacketD],
    ];
    loft(b, Aa.map((r) => ({ c: [s * r[1], r[0], -0.008], ru: r[2], rv: r[2] * 1.06, b: r[3], col: r[4] })),
      { mat: CLOTH, segs: 12, ur: 14, vr: 44, capA: 0.012, capB: 0 });
    // wrist
    loft(b, [
      { c: [s * 0.225, 0.905, -0.004], ru: 0.024, rv: 0.027, b: w1(fore) },
      { c: [s * 0.225, 0.875, 0], ru: 0.023, rv: 0.027, b: w1(hand) },
    ], { mat: SMOOTH, segs: 8, col: skinD });
    if (L) {
      // relaxed open hand + thumb
      ellip(b, [0.226, 0.838, 0.004], 0.02, 0.052, 0.035, { mat: SMOOTH, col: skin, b: w1(hand), segs: 10, rings: 6, exp: 2.4 });
      ellip(b, [0.214, 0.852, 0.036], 0.011, 0.028, 0.012, { mat: SMOOTH, col: skin, b: w1(hand), segs: 6, rings: 4, ay: norm([-0.2, 1, -0.45]), az: norm([0, 0.45, 1]) });
    } else {
      // fist wrapped round the net pole
      ellip(b, [-0.226, 0.848, 0.008], 0.031, 0.04, 0.039, { mat: SMOOTH, col: skin, b: w1(hand), segs: 10, rings: 6, exp: 2.5 });
      ellip(b, [-0.212, 0.86, 0.034], 0.012, 0.022, 0.014, { mat: SMOOTH, col: skin, b: w1(hand), segs: 6, rings: 4 });
    }

    // trouser leg
    const Lg = [
      [0.955, 0.09, 0.078, w1(BN.hips), trouser],
      [0.9, 0.091, 0.088, w2(BN.hips, thigh, 0.5), trouser],
      [0.84, 0.092, 0.086, w1(thigh), trouser],
      [0.72, 0.093, 0.078, w1(thigh), trouser],
      [0.6, 0.094, 0.066, w1(thigh), trouser],
      [0.54, 0.095, 0.06, w2(thigh, shin, 0.25), trouser],
      [0.5, 0.095, 0.058, w2(thigh, shin, 0.5), trouser],
      [0.46, 0.095, 0.056, w2(thigh, shin, 0.75), trouser],
      [0.4, 0.095, 0.057, w1(shin), trouser],
      [0.32, 0.095, 0.052, w1(shin), trouser],
      [0.265, 0.095, 0.048, w1(shin), trouserD],
      [0.24, 0.095, 0.044, w1(shin), trouserD],
    ];
    loft(b, Lg.map((r, i) => ({ c: [s * r[1], r[0], i >= 8 && i <= 9 ? -0.006 : 0], ru: r[2], rv: r[2] * 1.1, b: r[3], col: r[4] })),
      { mat: CLOTH, segs: 12, ur: 18, vr: 44, capA: 0, capB: 0 });
    // boot shaft
    loft(b, [
      { c: [s * 0.095, 0.285, 0], ru: 0.047, rv: 0.051, b: w1(shin), col: shade(boot, 0.7) },
      { c: [s * 0.095, 0.29, 0], ru: 0.054, rv: 0.058, b: w1(shin), col: shade(boot, 1.15) },
      { c: [s * 0.095, 0.27, 0], ru: 0.054, rv: 0.058, b: w1(shin) },
      { c: [s * 0.095, 0.18, 0], ru: 0.048, rv: 0.052, b: w1(shin) },
      { c: [s * 0.095, 0.11, 0], ru: 0.046, rv: 0.052, b: w2(shin, foot, 0.4) },
      { c: [s * 0.095, 0.06, 0], ru: 0.045, rv: 0.052, b: w1(foot) },
    ], { mat: SMOOTH, segs: 12, col: boot, capB: 0 });
    // boot foot + sole (lofted along Z)
    const Ft = [
      [-0.076, 0.026, 0.03, 0.046],
      [-0.06, 0.042, 0.044, 0.052],
      [-0.02, 0.047, 0.05, 0.056],
      [0.04, 0.049, 0.044, 0.05],
      [0.1, 0.053, 0.037, 0.043],
      [0.15, 0.049, 0.033, 0.039],
      [0.186, 0.03, 0.022, 0.03],
    ];
    loft(b, Ft.map((r) => ({ c: [s * 0.095, r[3], r[0]], ru: r[1], rv: r[2] })),
      { mat: SMOOTH, segs: 12, exp: 2.5, ax: AX, az: AY, col: boot, b: w1(foot), capA: 0.008, capB: 0.01 });
    loft(b, Ft.map((r) => ({ c: [s * 0.095, 0.013, r[0]], ru: r[1] * 1.06, rv: 0.013 })),
      { mat: SMOOTH, segs: 12, exp: 3, ax: AX, az: AY, col: sole, b: w1(foot), capA: 0.006, capB: 0.008 });
  }

  // ── butterfly net: pole + hoop, rigid on the right hand
  const d = [0, -Math.sin(NET_TILT), Math.cos(NET_TILT)];
  const nrm = [0, Math.cos(NET_TILT), Math.sin(NET_TILT)];
  const grip = [-0.226, 0.85, 0.01];
  const hr = w1(BN.handR);
  loft(b, [
    { c: addS(grip, d, -0.26), ru: 0.012, rv: 0.012, col: shade(wood, 0.7) },
    { c: addS(grip, d, -0.2), ru: 0.0125, rv: 0.0125, col: wood },
    { c: addS(grip, d, 0.9), ru: 0.0105, rv: 0.0105, col: wood },
    { c: addS(grip, d, 0.905), ru: 0.014, rv: 0.014, col: metal },
    { c: addS(grip, d, 0.955), ru: 0.014, rv: 0.014, col: metal },
  ], { mat: SMOOTH, segs: 8, ax: AX, az: nrm, b: hr, capA: 0.006, capB: 0.004 });
  const HOOP_R = 0.17;
  const hoopC = addS(grip, d, 0.95 + HOOP_R);
  torus(b, hoopC, d, AX, HOOP_R, 0.0075, { around: 28, segs: 6, mat: SMOOTH, col: metal, b: hr });

  const geo = finish(THREE, b, true);
  return { geo, hoopC, HOOP_R };
}

function makeWeaveTexture(THREE) {
  const cv = makeCanvas(64, 64);
  const g = cv.getContext('2d');
  const img = g.createImageData(64, 64);
  const rnd = mulberry32(31337);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const cx = x >> 2, cy = y >> 2;
      const over = (cx + cy) & 1;
      const t = over ? (y & 3) : (x & 3);
      const v = 118 + Math.sin(((t + 0.5) / 4) * Math.PI) * 26 + (over ? 5 : -5) + (rnd() - 0.5) * 12;
      const o = (y * 64 + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 2;
  return tex;
}

function makeNetTexture(THREE) {
  const cv = makeCanvas(64, 64);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 5;
  g.beginPath();
  for (let i = 0; i <= 2; i++) {
    g.moveTo(i * 32, 0); g.lineTo(i * 32, 64);
    g.moveTo(0, i * 32); g.lineTo(64, i * 32);
  }
  g.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export function createHuman(THREE) {
  const built = buildHumanGeometry(THREE);

  const group = new THREE.Group();
  group.name = 'human';
  const pivot = new THREE.Group();   // fall / hop / jitter, origin at the feet
  group.add(pivot);
  const model = new THREE.Group();
  model.scale.setScalar(H_SCALE);
  pivot.add(model);

  const matCloth = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, metalness: 0, bumpMap: makeWeaveTexture(THREE), bumpScale: 0.6, emissive: 0x000000,
  });
  const matSmooth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0, emissive: 0x000000 });

  // skeleton
  const bones = [];
  for (let i = 0; i < HB.length; i++) {
    const r = HB[i];
    const bone = new THREE.Bone();
    bone.name = r[0];
    if (r[1] < 0) bone.position.set(r[2], r[3], r[4]);
    else {
      const p = HB[r[1]];
      bone.position.set(r[2] - p[2], r[3] - p[3], r[4] - p[4]);
      bones[r[1]].add(bone);
    }
    bones.push(bone);
  }
  bones[BN.armL].rotation.order = 'ZXY';
  bones[BN.armR].rotation.order = 'ZXY';
  const mesh = new THREE.SkinnedMesh(built.geo, [matCloth, matSmooth]);
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  mesh.frustumCulled = false; // poses (lunge, fall) leave the bind-pose bounds
  model.add(mesh);

  // net bag: its own little mesh on the hand so it can flop to the downhill side of the hoop
  const cT = Math.cos(NET_TILT), sT = Math.sin(NET_TILT);
  let bag;
  {
    const nb = makeBuilder();
    const R = built.HOOP_R;
    loft(nb, [
      { c: [0, 0, 0], ru: R, rv: R },
      { c: [0, -0.09, 0.01], ru: R * 0.9, rv: R * 0.9 },
      { c: [0, -0.2, 0.025], ru: R * 0.68, rv: R * 0.68 },
      { c: [0, -0.3, 0.04], ru: R * 0.4, rv: R * 0.4 },
      { c: [0, -0.37, 0.05], ru: R * 0.14, rv: R * 0.14 },
      { c: [0, -0.39, 0.052], ru: R * 0.03, rv: R * 0.03 },
    ], { segs: 14, ur: 14, vr: 26 });
    const netMat = new THREE.MeshStandardMaterial({
      map: makeNetTexture(THREE), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1, metalness: 0, color: 0xf4f6f2,
    });
    bag = new THREE.Mesh(finish(THREE, nb, false), netMat);
    const hp = HB[BN.handR];
    bag.position.set(built.hoopC[0] - hp[2], built.hoopC[1] - hp[3], built.hoopC[2] - hp[4]);
    // local X = model X, local Y = hoop normal, local Z = pole direction
    const m4 = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, cT, sT), new THREE.Vector3(0, -sT, cT));
    bag.quaternion.setFromRotationMatrix(m4);
    bag.frustumCulled = false;
    bones[BN.handR].add(bag);
  }

  // pose buffers
  const NCH = CHN.length;
  const P = new Float32Array(NCH); // target
  const S = new Float32Array(NCH); // smoothed
  const ov = (i, target, w) => { P[i] += (target - P[i]) * w; };

  const basePos = [];
  for (let i = 0; i < bones.length; i++) basePos.push(bones[i].position.y);

  let phase = 0;
  let clock = 0;
  let att = 0, attT = 0, swingT = 0;
  let hurtT = 0, hurtLX = 0, hurtLZ = 0;
  let stungT = -1;
  let shockT = 0;
  let tauntT = -1;
  let defeated = false, defT = 0;
  let blinkT = 2;
  let lid = 0;
  let bagS = 1;
  let first = true;

  const api = {
    group,
    radius: 0.3,
    height: 1.75,
    alive: true,
    windupTime: H_WINDUP,
    strikeLandTime: H_LAND,
    netReach: 1.15, // metres in front of the feet where the hoop lands
    get attacking() { return att !== 0; },

    update(dt, s) {
      const speed = s && s.speed ? Math.abs(s.speed) : 0;
      clock = s && s.time !== undefined ? s.time : clock + dt;
      const t = clock;

      // ── timers
      if (att === 1) {
        attT += dt;
        if (attT >= H_WINDUP - H_LAND) { att = 2; swingT = attT - (H_WINDUP - H_LAND); }
      } else if (att === 2) {
        swingT += dt;
        if (swingT > H_LAND + H_HOLD + H_RECOVER) att = 0;
      }
      if (hurtT > 0) hurtT = Math.max(0, hurtT - dt);
      if (stungT >= 0) { stungT += dt; if (stungT > 3) stungT = -1; }
      if (shockT > 0) shockT = Math.max(0, shockT - dt);
      if (tauntT >= 0) { tauntT += dt; if (tauntT > 1.7) tauntT = -1; }
      if (defeated) defT += dt;

      // ── base locomotion
      P.fill(0);
      const w = defeated ? 0 : clamp01(speed / 0.9);
      const r = defeated ? 0 : smoothstep(1.7, 3.8, speed);
      if (speed > 0.02 && !defeated) phase += (dt * TAU * speed) / lerp(1.4, 2.5, r);
      const sn = Math.sin(phase), cs = Math.cos(phase);
      const A = (0.44 + 0.38 * r) * w;
      const kL = Math.max(0, cs), kR = Math.max(0, -cs);
      const kn = 0.95 + 0.75 * r;
      P[C.thLX] = -A * sn - 0.1 * r * w;
      P[C.thRX] = A * sn - 0.1 * r * w;
      P[C.knL] = w * (0.1 + kn * kL) + 0.04;
      P[C.knR] = w * (0.1 + kn * kR) + 0.04;
      P[C.ftL] = -(P[C.thLX] + P[C.knL]) * 0.8 + 0.35 * kL * w;
      P[C.ftR] = -(P[C.thRX] + P[C.knR]) * 0.8 + 0.35 * kR * w;
      P[C.rootY] = -0.55 * (1 - Math.cos(A * sn)) + r * w * 0.045 * Math.abs(cs) - 0.004;
      P[C.hipsRY] = -0.14 * w * sn;
      P[C.hipsRZ] = 0.04 * w * cs;
      P[C.chestRY] = 0.24 * w * sn;
      P[C.spineRX] = 0.03 + 0.2 * r * w;
      P[C.headRX] = -0.12 * r * w;
      const aS = (0.42 + 0.45 * r) * w;
      P[C.armLX] = aS * sn;
      P[C.armLZ] = 0.07;
      P[C.foreL] = -0.14 - (0.12 + 1.1 * r) * w - 0.2 * w * Math.max(0, -sn);
      // right arm carries the net, hoop up and forward
      P[C.armRX] = -0.36 - aS * 0.3 * sn;
      P[C.armRZ] = -0.1;
      P[C.foreR] = -1.12 + 0.12 * w * cs;
      P[C.handRX] = 0.05;
      // idle life
      const idle = 1 - w;
      const br = Math.sin(t * 1.7);
      P[C.chestRX] += 0.018 * br;
      P[C.armLZ] += 0.012 * br;
      P[C.hipsRZ] += 0.022 * idle * Math.sin(t * 0.55);
      P[C.spineRZ] -= 0.02 * idle * Math.sin(t * 0.55);
      P[C.headRY] += 0.16 * idle * Math.sin(t * 0.41) + 0.05 * idle * Math.sin(t * 1.13);
      P[C.armRX] += 0.03 * idle * Math.sin(t * 0.9);
      P[C.foreR] += 0.04 * idle * Math.sin(t * 0.9 + 1);

      // ── taunt: pump the net overhead, fist on hip
      if (tauntT >= 0 && !defeated) {
        const e = smooth01(tauntT / 0.2) * smooth01((1.7 - tauntT) / 0.3);
        const pump = Math.sin(tauntT * 11);
        ov(C.armRX, -2.65 + 0.22 * pump, e);
        ov(C.foreR, -0.55 - 0.2 * pump, e);
        ov(C.armRZ, -0.25, e);
        ov(C.armLZ, 0.55, e);
        ov(C.armLY, -1.25, e);
        ov(C.armLX, 0.15, e);
        ov(C.foreL, -1.65, e);
        ov(C.spineRX, -0.14, e);
        ov(C.headRX, -0.22 + 0.06 * pump, e);
        ov(C.headRZ, 0.1, e);
        P[C.rootY] += 0.018 * pump * e;
      }

      // ── attack: telegraphed overhead windup, then slam the net down in front
      if (att !== 0 && !defeated) {
        let wu = 0, ld = 0;
        if (att === 1) wu = smooth01(attT / 0.3);
        else if (swingT < H_LAND) { const u = swingT / H_LAND; ld = u * u; wu = 1 - ld; }
        else ld = 1 - smooth01((swingT - H_LAND - H_HOLD) / H_RECOVER);
        if (wu > 0) {
          const tremble = att === 1 && attT > 0.3 ? Math.sin(attT * 46) * 0.035 : 0;
          ov(C.armRX, -2.95 + tremble, wu);
          ov(C.foreR, -0.75, wu);
          ov(C.handRX, -0.3, wu);
          ov(C.armRZ, -0.16, wu);
          ov(C.spineRX, -0.2, wu);
          ov(C.chestRX, -0.08, wu);
          ov(C.chestRY, -0.26, wu);
          ov(C.headRX, 0.12, wu);
          ov(C.armLX, -0.75, wu);
          ov(C.foreL, -0.7, wu);
          ov(C.knL, 0.3, wu);
          ov(C.knR, 0.3, wu);
          ov(C.thLX, -0.2, wu);
          ov(C.thRX, 0.05, wu);
          ov(C.ftL, -0.1, wu);
          ov(C.ftR, -0.3, wu);
          ov(C.rootY, -0.035, wu);
        }
        if (ld > 0) {
          ov(C.armRX, -0.78, ld);
          ov(C.foreR, -0.14, ld);
          ov(C.handRX, 0.34, ld);
          ov(C.armRZ, -0.05, ld);
          ov(C.spineRX, 0.52, ld);
          ov(C.chestRX, 0.06, ld);
          ov(C.chestRY, 0.2, ld);
          ov(C.headRX, -0.3, ld);
          ov(C.armLX, 0.7, ld);
          ov(C.armLZ, 0.35, ld);
          ov(C.foreL, -0.4, ld);
          ov(C.thLX, -0.85, ld);
          ov(C.knL, 1.05, ld);
          ov(C.ftL, -0.2, ld);
          ov(C.thRX, 0.3, ld);
          ov(C.knR, 0.55, ld);
          ov(C.ftR, -0.6, ld);
          ov(C.rootY, -0.15, ld);
        }
      }

      // ── stung: hop about clutching the left shin
      let hop = 0, er = 0, eg = 0, eb = 0;
      if (stungT >= 0 && !defeated) {
        const e = stungT < 1.15 ? smooth01(stungT / 0.12) * smooth01((1.15 - stungT) / 0.25) : 0;
        if (e > 0) {
          const h = Math.abs(Math.sin(stungT * 10.5));
          hop = 0.11 * h * e;
          ov(C.thLX, -1.3, e);
          ov(C.thLZ, 0.1, e);
          ov(C.knL, 1.75, e);
          ov(C.ftL, 0.3, e);
          ov(C.armLX, -0.95, e);
          ov(C.armLZ, -0.1, e);
          ov(C.foreL, -0.75, e);
          ov(C.spineRX, 0.36, e);
          ov(C.headRX, 0.22, e);
          ov(C.thRX, -0.12, e);
          ov(C.knR, 0.22 + 0.25 * (1 - h), e);
          ov(C.ftR, -0.15, e);
          ov(C.armRX, -0.9, e);
          ov(C.armRZ, -0.6, e);
          ov(C.foreR, -0.5, e);
          ov(C.rootRZ, 0.07 * Math.sin(stungT * 10.5), e);
        }
        const fade = 1 - smooth01((stungT - 2.4) / 0.6);
        const pulse = 0.5 + 0.5 * Math.sin(stungT * 9);
        const gI = (stungT < 0.25 ? 0.55 * (1 - stungT / 0.25) : 0) + (0.07 + 0.16 * pulse) * fade;
        er += 0.12 * gI; eg += 1.0 * gI; eb += 0.2 * gI;
      }

      // ── hurt flinch
      let leanX = 0, leanZ = 0;
      if (hurtT > 0 && !defeated) {
        const u = hurtT / 0.4;
        const e = u * u;
        leanX = hurtLZ * 0.24 * e;
        leanZ = -hurtLX * 0.24 * e;
        ov(C.spineRX, -0.22, e);
        ov(C.headRX, -0.3, e);
        ov(C.armLZ, 0.7, e);
        ov(C.armLX, -0.3, e);
        ov(C.armRZ, -0.45, e);
        ov(C.knL, 0.35, e);
        ov(C.knR, 0.35, e);
        P[C.rootY] -= 0.03 * e;
        P[C.hatY] += 0.03 * e;
        er += 0.5 * e; eg += 0.4 * e; eb += 0.32 * e;
      }

      // ── shocked: rigid star pose, jitter, hair on end
      let jx = 0, jz = 0, jrx = 0, jrz = 0;
      if (shockT > 0 && !defeated) {
        const e = smooth01(shockT / 0.18) * smooth01((0.8 - shockT) / 0.05);
        const R = Math.random;
        ov(C.armLZ, 1.15 + (R() - 0.5) * 0.3, e);
        ov(C.armRZ, -1.15 + (R() - 0.5) * 0.3, e);
        ov(C.armLX, (R() - 0.5) * 0.3, e);
        ov(C.armRX, (R() - 0.5) * 0.3, e);
        ov(C.foreL, -0.35, e);
        ov(C.foreR, -0.35, e);
        ov(C.thLZ, 0.26, e);
        ov(C.thRZ, -0.26, e);
        ov(C.thLX, 0, e);
        ov(C.thRX, 0, e);
        ov(C.knL, 0.05, e);
        ov(C.knR, 0.05, e);
        ov(C.spineRX, -0.12, e);
        ov(C.headRX, -0.26, e);
        ov(C.hair, 1, e);
        ov(C.hatY, 0.13 + R() * 0.03, e);
        ov(C.hatRX, (R() - 0.5) * 0.3, e);
        jx = (R() - 0.5) * 0.035 * e; jz = (R() - 0.5) * 0.035 * e;
        jrx = (R() - 0.5) * 0.07 * e; jrz = (R() - 0.5) * 0.07 * e;
        hop += 0.05 * e;
        const f = (R() < 0.55 ? 1 : 0.15) * e;
        er += 0.2 * f; eg += 0.55 * f; eb += 1.1 * f;
      }

      // ── defeat: stagger, fall flat on the back, bounce, stay
      let fall = 0, lift = 0;
      if (defeated) {
        const t0 = 0.3, t1 = 0.85;
        let air;
        if (defT < t0) {
          const u = defT / t0;
          fall = -0.14 * u * u;
          air = 1;
        } else if (defT < t1) {
          const u = (defT - t0) / (t1 - t0);
          fall = -0.14 - (Math.PI / 2 - 0.14) * u * u;
          air = 1;
        } else {
          const q = defT - t1;
          fall = -Math.PI / 2 + 0.11 * Math.exp(-5 * q) * Math.abs(Math.sin(q * 9));
          air = 0;
        }
        lift = 0.115 * smooth01((defT - t0) / (t1 - t0));
        const g = 1 - air;                      // 0 while falling, 1 once down
        const wind = air * Math.sin(defT * 17);
        ov(C.armLX, lerp(-1.5 + wind * 0.5, 0.0, g), 1);
        ov(C.armRX, lerp(-1.3 - wind * 0.5, 0.0, g), 1);
        ov(C.armLZ, lerp(0.5, 1.25, g), 1);
        ov(C.armRZ, lerp(-0.5, -1.05, g), 1);
        ov(C.foreL, lerp(-0.5, -0.25, g), 1);
        ov(C.foreR, lerp(-0.6, -0.2, g), 1);
        ov(C.handRX, 0, 1);
        ov(C.spineRX, lerp(-0.25, 0.0, g), 1);
        ov(C.headRX, lerp(0.3, -0.12, g), 1);
        ov(C.headRY, 0.45 * g, 1);
        ov(C.thLX, lerp(-0.5, -0.42, g), 1);
        ov(C.knL, lerp(0.5, 0.85, g), 1);
        ov(C.ftL, lerp(0, -0.3, g), 1);
        ov(C.thLZ, 0.16, 1);
        ov(C.thRX, lerp(-0.25, -0.02, g), 1);
        ov(C.thRZ, -0.2, 1);
        ov(C.knR, lerp(0.4, 0.05, g), 1);
        ov(C.ftR, 0.35 * g, 1);
        ov(C.rootY, 0, 1);
        ov(C.hatY, 0.16 * smooth01(defT / t1), 1);
        ov(C.hatRX, -0.7 * smooth01(defT / t1), 1);
        P[C.chestRX] = 0.025 * Math.sin(t * 2.1) * g;
      }

      // ── smooth target -> displayed pose
      const kS = first ? 1 : 1 - Math.exp(-(att === 2 && swingT < H_LAND + 0.08 ? 46 : 16) * dt);
      first = false;
      for (let i = 0; i < NCH; i++) S[i] += (P[i] - S[i]) * kS;

      // ── apply to the rig
      const B = bones;
      pivot.position.set(jx, hop + lift, jz);
      pivot.rotation.set(fall + leanX + jrx + S[C.rootRX], 0, leanZ + jrz + S[C.rootRZ]);
      B[BN.hips].position.y = basePos[BN.hips] + S[C.rootY];
      B[BN.hips].rotation.set(S[C.hipsRX], S[C.hipsRY], S[C.hipsRZ]);
      B[BN.spine].rotation.set(S[C.spineRX], S[C.spineRY], S[C.spineRZ]);
      B[BN.chest].rotation.set(S[C.chestRX], S[C.chestRY], S[C.chestRZ]);
      B[BN.neck].rotation.set(S[C.neckRX] + S[C.headRX] * 0.35, S[C.headRY] * 0.4, 0);
      B[BN.head].rotation.set(S[C.headRX] * 0.65, S[C.headRY] * 0.6, S[C.headRZ]);
      B[BN.armL].rotation.set(S[C.armLX], S[C.armLY], S[C.armLZ]);
      B[BN.foreL].rotation.x = S[C.foreL];
      B[BN.handL].rotation.x = S[C.handLX] + S[C.foreL] * 0.12;
      B[BN.armR].rotation.set(S[C.armRX], S[C.armRY], S[C.armRZ]);
      B[BN.foreR].rotation.x = S[C.foreR];
      B[BN.handR].rotation.x = S[C.handRX];
      // counter-rotate the legs against pelvis yaw so the feet track straight
      B[BN.thighL].rotation.set(S[C.thLX], -S[C.hipsRY], S[C.thLZ] - S[C.hipsRZ]);
      B[BN.shinL].rotation.x = S[C.knL];
      B[BN.footL].rotation.x = S[C.ftL];
      B[BN.thighR].rotation.set(S[C.thRX], -S[C.hipsRY], S[C.thRZ] - S[C.hipsRZ]);
      B[BN.shinR].rotation.x = S[C.knR];
      B[BN.footR].rotation.x = S[C.ftR];
      B[BN.hat].position.y = basePos[BN.hat] + S[C.hatY];
      B[BN.hat].rotation.x = S[C.hatRX];
      const hs = Math.max(0.03, S[C.hair]);
      B[BN.hair].scale.set(hs, hs, hs);

      // blink (eyes shut when down)
      blinkT -= dt;
      if (blinkT < -0.11) blinkT = 2.2 + Math.random() * 3;
      const lidT = defeated && defT > 0.85 ? 1 : (blinkT < 0 ? 1 : 0);
      lid += (lidT - lid) * Math.min(1, dt * 40);
      const ls = Math.max(0.02, lid);
      B[BN.lids].scale.set(ls, ls, ls);

      // net bag flops to whichever side of the hoop is downhill (uses last frame's world matrix)
      const e = B[BN.handR].matrixWorld.elements;
      const ny = e[5] * cT + e[9] * sT;
      const bagT = ny >= 0 ? 1 : -1;
      bagS += (bagT - bagS) * Math.min(1, dt * 9);
      bag.scale.y = Math.abs(bagS) < 0.06 ? (bagS < 0 ? -0.06 : 0.06) : bagS;

      matCloth.emissive.setRGB(er, eg, eb);
      matSmooth.emissive.setRGB(er, eg, eb);
    },

    // Begin the telegraph. Returns seconds until the net hits the ground; the swing fires by itself
    // at that moment (calling strike() then is harmless), or call strike() earlier to swing at once.
    windup() {
      if (defeated) return H_WINDUP;
      att = 1; attT = 0; swingT = 0;
      tauntT = -1;
      return H_WINDUP;
    },

    // Swat the net down at the ground in front. Lands H_LAND (0.12 s) after the swing starts.
    strike() {
      if (defeated) return;
      if (att === 2 && swingT < H_LAND + H_HOLD) return;           // already swinging / just landed
      if (att === 1 && attT >= H_WINDUP - H_LAND - 0.03) return;   // auto-swing is about to fire
      att = 2; swingT = 0;
      tauntT = -1;
    },

    hurt(dirX, dirZ) {
      if (defeated) return;
      const dx = dirX || 0, dz = dirZ || 0;
      const l = Math.hypot(dx, dz);
      if (l > 1e-5) {
        const yaw = group.rotation.y;
        const c = Math.cos(yaw), s = Math.sin(yaw);
        hurtLX = (dx * c - dz * s) / l;
        hurtLZ = (dx * s + dz * c) / l;
      } else { hurtLX = 0; hurtLZ = -1; }
      hurtT = 0.4;
      att = 0;
      tauntT = -1;
    },

    stung() {
      if (defeated) return;
      stungT = 0;
      att = 0;
      tauntT = -1;
    },

    shocked() {
      if (defeated) return;
      shockT = 0.8;
      att = 0;
      tauntT = -1;
    },

    defeat() {
      if (defeated) return;
      defeated = true;
      api.alive = false;
      defT = 0;
      att = 0; hurtT = 0; stungT = -1; shockT = 0; tauntT = -1;
    },

    taunt() {
      if (defeated || att !== 0) return;
      tauntT = 0;
    },

    // extra: stand back up for a fight restart
    reset() {
      defeated = false;
      api.alive = true;
      defT = 0; att = 0; attT = 0; swingT = 0; hurtT = 0; stungT = -1; shockT = 0; tauntT = -1;
      phase = 0;
      first = true;
      bagS = 1;
    },
  };
  return api;
}
