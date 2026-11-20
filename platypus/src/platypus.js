// platypus.js — the player character.
// A single lofted, skinned body (fur) + a leather mesh (bill, feet, claws, spurs) + eyes.
// 3 draw calls, ~15k triangles, one shared 21-bone skeleton. Everything is procedural.
//
// Local space: +Z forward (bill), +Y up, +X is the animal's LEFT. Origin on the ground under the body.
// Foot indices: 0 = FL, 1 = FR, 2 = HL, 3 = HR.

const PI = Math.PI;
const TAU = Math.PI * 2;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
const frac = (x) => x - Math.floor(x);
const lin = (c) => Math.pow(c < 0 ? 0 : c, 2.2); // sRGB-ish -> linear for vertex colours

// ---------------------------------------------------------------------------------------------
// Anatomy tables. Stations are [z, halfWidth, centreY, halfHeightUp, halfHeightDown].
// Total length 1.0: tail tip z = -0.5, bill tip z = +0.5.
// ---------------------------------------------------------------------------------------------
const BODY_ST = [
  [-0.500, 0.004, 0.068, 0.002, 0.002], // tail tip
  [-0.492, 0.030, 0.069, 0.008, 0.007],
  [-0.470, 0.058, 0.071, 0.014, 0.012],
  [-0.430, 0.078, 0.075, 0.019, 0.016],
  [-0.380, 0.086, 0.081, 0.024, 0.019], // broad paddle
  [-0.330, 0.085, 0.090, 0.030, 0.023],
  [-0.285, 0.080, 0.102, 0.040, 0.032], // tail base (slight waist)
  [-0.245, 0.084, 0.118, 0.058, 0.048],
  [-0.200, 0.103, 0.138, 0.082, 0.072], // rump
  [-0.140, 0.126, 0.152, 0.100, 0.092], // hips
  [-0.060, 0.137, 0.156, 0.106, 0.100],
  [0.020, 0.138, 0.156, 0.105, 0.101], // widest
  [0.100, 0.130, 0.154, 0.100, 0.097],
  [0.170, 0.116, 0.150, 0.092, 0.090], // shoulders
  [0.225, 0.099, 0.142, 0.080, 0.078], // (almost no neck)
  [0.270, 0.086, 0.132, 0.069, 0.066],
  [0.305, 0.076, 0.122, 0.060, 0.056], // head
  [0.330, 0.067, 0.114, 0.051, 0.047],
  [0.352, 0.055, 0.106, 0.038, 0.035],
  [0.368, 0.036, 0.100, 0.022, 0.020],
  [0.374, 0.004, 0.098, 0.002, 0.002], // hidden under the bill
];

// Upper bill + frontal shield (the leathery cuff that flares back over the face).
const BILL_ST = [
  [0.322, 0.058, 0.113, 0.045, 0.040], // tucked into the fur
  [0.330, 0.0685, 0.113, 0.0535, 0.047], // shield rim
  [0.342, 0.068, 0.110, 0.049, 0.042],
  [0.356, 0.066, 0.104, 0.038, 0.030],
  [0.372, 0.059, 0.099, 0.025, 0.016],
  [0.392, 0.060, 0.096, 0.019, 0.009], // narrowest
  [0.420, 0.065, 0.094, 0.016, 0.007],
  [0.450, 0.071, 0.093, 0.014, 0.006], // spatulate flare
  [0.472, 0.069, 0.092, 0.012, 0.006],
  [0.487, 0.057, 0.092, 0.010, 0.005],
  [0.496, 0.037, 0.092, 0.007, 0.004],
  [0.500, 0.004, 0.092, 0.002, 0.002],
];

const LOWER_BILL_ST = [
  [0.346, 0.004, 0.088, 0.002, 0.004],
  [0.352, 0.044, 0.088, 0.004, 0.022],
  [0.375, 0.050, 0.086, 0.004, 0.016],
  [0.410, 0.057, 0.086, 0.004, 0.012],
  [0.445, 0.060, 0.086, 0.004, 0.010],
  [0.468, 0.054, 0.087, 0.004, 0.008],
  [0.480, 0.038, 0.087, 0.003, 0.006],
  [0.486, 0.004, 0.088, 0.001, 0.001],
];

const rnd = (z, r) => [z, r, 0, r, r];
const FRONT_UPPER_ST = [rnd(-0.035, 0.004), rnd(-0.02, 0.034), rnd(0, 0.047), rnd(0.05, 0.043), rnd(0.1, 0.036), rnd(0.118, 0.02), rnd(0.124, 0.003)];
const FRONT_LOWER_ST = [rnd(-0.03, 0.003), rnd(-0.018, 0.024), rnd(0, 0.035), rnd(0.05, 0.03), rnd(0.085, 0.024), rnd(0.105, 0.021), rnd(0.116, 0.012), rnd(0.12, 0.003)];
const HIND_UPPER_ST = [rnd(-0.04, 0.004), rnd(-0.022, 0.04), rnd(0, 0.054), rnd(0.05, 0.048), rnd(0.1, 0.04), rnd(0.12, 0.022), rnd(0.126, 0.003)];
const HIND_LOWER_ST = [rnd(-0.03, 0.003), rnd(-0.018, 0.026), rnd(0, 0.039), rnd(0.05, 0.033), rnd(0.09, 0.026), rnd(0.108, 0.022), rnd(0.12, 0.012), rnd(0.124, 0.003)];

// Bind-pose joint positions (group space).
const J = {
  hips: [0, 0.155, -0.11],
  spine1: [0, 0.155, -0.01],
  spine2: [0, 0.155, 0.08],
  chest: [0, 0.155, 0.17],
  neck: [0, 0.14, 0.245],
  head: [0, 0.125, 0.3],
  tail1: [0, 0.13, -0.21],
  tail2: [0, 0.1, -0.3],
  tail3: [0, 0.085, -0.39],
};
// Art pass: a platypus is low-slung. Drop the whole animal towards the ground, flatten the trunk a
// little, fatten the tail (it stores fat) and shorten the limbs so it sprawls rather than stands.
const LOW = 0.04;
const LEG_K = 0.85;
for (const st of BODY_ST) {
  const tailW = 1 - Math.min(1, Math.max(0, (st[0] + 0.3) / 0.1));
  st[2] -= LOW - 0.004 * tailW;
  st[3] *= 0.93 + 0.42 * tailW;
  st[4] *= 0.88 + 0.42 * tailW;
}
for (const st of BILL_ST) st[2] -= LOW;
for (const st of LOWER_BILL_ST) st[2] -= LOW;
for (const k in J) J[k][1] -= LOW;
for (const tab of [FRONT_UPPER_ST, FRONT_LOWER_ST, HIND_UPPER_ST, HIND_LOWER_ST]) {
  const lower = tab === FRONT_LOWER_ST || tab === HIND_LOWER_ST;
  for (const st of tab) { st[0] *= LEG_K; const k = lower ? 0.86 : 0.94; st[1] *= k; st[3] *= k; st[4] *= k; }
}
// bone indices
const B_HIPS = 0, B_SPINE1 = 1, B_SPINE2 = 2, B_CHEST = 3, B_NECK = 4, B_HEAD = 5, B_TAIL1 = 6, B_TAIL2 = 7, B_TAIL3 = 8, B_LEG0 = 9;

const FWD_CHAIN = [[B_SPINE1, J.spine1[2]], [B_SPINE2, J.spine2[2]], [B_CHEST, J.chest[2]], [B_NECK, J.neck[2]], [B_HEAD, J.head[2]]];
const BACK_CHAIN = [[B_TAIL1, J.tail1[2]], [B_TAIL2, J.tail2[2]], [B_TAIL3, J.tail3[2]]];

const ANKLE_H = 0.022; // ankle joint height above the sole
const EYE_Z = 0.308;
const EYE_TH = 0.95; // elevation angle of the eye on the head ring
const EYE_R = 0.0105;

const STING_DUR = 0.56;
const STING_HIT = 0.24;
const STING_SPIN_T0 = 0.05;
const STING_SPIN_LEN = 0.38;
const ZAP_DUR = 0.95;
const ZAP_FIRE = 0.42;

// ---------------------------------------------------------------------------------------------
// Loft builder
// ---------------------------------------------------------------------------------------------
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function sampleStations(st, f, out) {
  const n = st.length;
  let i = Math.floor(f);
  if (i > n - 2) i = n - 2;
  if (i < 0) i = 0;
  const t = f - i;
  const a = st[i > 0 ? i - 1 : 0], b = st[i], c = st[i + 1], d = st[i + 2 < n ? i + 2 : n - 1];
  for (let k = 0; k < 5; k++) out[k] = cr(a[k], b[k], c[k], d[k], t);
  // z must stay inside its interval; widths never negative
  const zlo = Math.min(b[0], c[0]), zhi = Math.max(b[0], c[0]);
  out[0] = clamp(out[0], zlo, zhi);
  if (out[1] < 0.0003) out[1] = 0.0003;
  if (out[3] < 0.0003) out[3] = 0.0003;
  if (out[4] < 0.0003) out[4] = 0.0003;
  return out;
}

function ringAtZ(st, z, out) {
  let lo = 0, hi = st.length - 1;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) * 0.5;
    sampleStations(st, mid, out);
    if (out[0] < z) lo = mid; else hi = mid;
  }
  return sampleStations(st, (lo + hi) * 0.5, out);
}

function makeBuilder() {
  return { pos: [], uv: [], col: [], si: [], sw: [], glow: [], idx: [], seams: [] };
}

export function createPlatypus(THREE) {
  const group = new THREE.Group();
  group.name = 'platypus';

  // ---- scratch (build time + run time, never reallocated) ----
  const S5 = [0, 0, 0, 0, 0];
  const V = { x: 0, y: 0, z: 0, th: 0, s: 0, c: 0, cy: 0, w: 0, f: 0, r: 1, g: 1, b: 1, gx: 0, gy: 0 };
  const SI = [0, 0, 0, 0];
  const SW = [1, 0, 0, 0];
  const tmpV = new THREE.Vector3();
  const WTS = new Float32Array(9);

  function evalN(n, z, def) {
    if (typeof n === 'function') return n(z);
    return n || def;
  }

  // Loft a closed tube of superelliptic rings along z. Optional matrix places it afterwards.
  function loft(b, st, o) {
    const sub = o.sub || 4;
    const segs = o.segs || 16;
    const R = (st.length - 1) * sub;
    const base = b.pos.length / 3;
    const m = o.matrix || null;
    const uS = o.uScale || 1, vS = o.vScale || 8;
    for (let i = 0; i <= R; i++) {
      sampleStations(st, i / sub, S5);
      const z = S5[0], w = S5[1], cy = S5[2], hu = S5[3], hd = S5[4];
      const nT = evalN(o.nTop, z, 2), nB = evalN(o.nBot, z, 2);
      for (let j = 0; j <= segs; j++) {
        const jj = j === segs ? 0 : j;
        const th = -PI / 2 + (jj / segs) * TAU;
        const c = Math.cos(th), s = Math.sin(th);
        const nn = s >= 0 ? nT : nB;
        V.x = w * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 2 / nn);
        V.y = cy + (s >= 0 ? hu * Math.pow(s, 2 / nT) : -hd * Math.pow(-s, 2 / nB));
        V.z = z; V.th = th; V.s = s; V.c = c; V.cy = cy; V.w = w; V.f = i / R;
        V.r = 1; V.g = 1; V.b = 1; V.gx = o.glowX || 0; V.gy = o.glowY || 0;
        if (o.vert) o.vert(V);
        if (o.skin) {
          o.skin(V.z, SI, SW);
        } else {
          SI[0] = o.bone || 0; SI[1] = 0; SI[2] = 0; SI[3] = 0;
          SW[0] = 1; SW[1] = 0; SW[2] = 0; SW[3] = 0;
        }
        tmpV.set(V.x, V.y, V.z);
        if (m) tmpV.applyMatrix4(m);
        b.pos.push(tmpV.x, tmpV.y, tmpV.z);
        b.uv.push((j / segs) * uS, z * vS);
        b.col.push(V.r, V.g, V.b);
        b.si.push(SI[0], SI[1], SI[2], SI[3]);
        b.sw.push(SW[0], SW[1], SW[2], SW[3]);
        b.glow.push(V.gx, V.gy);
      }
      b.seams.push(base + i * (segs + 1), base + i * (segs + 1) + segs);
    }
    const row = segs + 1;
    for (let i = 0; i < R; i++) {
      for (let j = 0; j < segs; j++) {
        const a = base + i * row + j, bb = a + 1, c2 = a + row, d = c2 + 1;
        b.idx.push(a, bb, c2, bb, d, c2);
      }
    }
  }

  function finish(b, opt) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    if (opt.skin) {
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(b.si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(b.sw, 4));
    }
    if (opt.glow) g.setAttribute('aGlow', new THREE.Float32BufferAttribute(b.glow, 2));
    g.setIndex(b.idx);
    g.computeVertexNormals();
    // weld normals across the u seam of every ring
    const nrm = g.attributes.normal;
    for (let k = 0; k < b.seams.length; k += 2) {
      const a = b.seams[k], c = b.seams[k + 1];
      let x = nrm.getX(a) + nrm.getX(c), y = nrm.getY(a) + nrm.getY(c), z = nrm.getZ(a) + nrm.getZ(c);
      const l = Math.hypot(x, y, z) || 1;
      x /= l; y /= l; z /= l;
      nrm.setXYZ(a, x, y, z);
      nrm.setXYZ(c, x, y, z);
    }
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.15, 0), 0.9);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-0.5, -0.1, -0.7), new THREE.Vector3(0.5, 0.6, 0.7));
    return g;
  }

  // ---------------------------------------------------------------------------------------------
  // Textures (generated once)
  // ---------------------------------------------------------------------------------------------
  const hasDOM = typeof document !== 'undefined';
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  function strokesCanvas(size, count, bg, lenMin, lenMax, wMin, wMax, alphaMin, alphaMax, shadeFn) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const x = rand() * size, y = rand() * size;
      const len = lerp(lenMin, lenMax, rand());
      const ang = (rand() - 0.5) * 0.34 + Math.sin(x * 0.012 + y * 0.004) * 0.12;
      const dx = Math.sin(ang) * len, dy = Math.cos(ang) * len;
      const bend = (rand() - 0.5) * len * 0.25;
      ctx.strokeStyle = shadeFn(rand());
      ctx.globalAlpha = lerp(alphaMin, alphaMax, rand());
      ctx.lineWidth = lerp(wMin, wMax, rand());
      for (let ox = -1; ox <= 1; ox++) {
        const X = x + ox * size;
        if (X + Math.abs(dx) + 8 < 0 || X - Math.abs(dx) - 8 > size) continue;
        for (let oy = -1; oy <= 0; oy++) {
          const Y = y + oy * size;
          if (Y + len < 0 || Y > size) continue;
          ctx.beginPath();
          ctx.moveTo(X, Y);
          ctx.quadraticCurveTo(X + dx * 0.5 + bend, Y + dy * 0.5, X + dx, Y + dy);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    return cv;
  }

  function normalFromHeight(src, strength) {
    const size = src.width;
    const sctx = src.getContext('2d');
    const h = sctx.getImageData(0, 0, size, size).data;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      const yu = ((y + size - 1) % size) * size, yd = ((y + 1) % size) * size, y0 = y * size;
      for (let x = 0; x < size; x++) {
        const xl = (x + size - 1) % size, xr = (x + 1) % size;
        const dx = (h[(y0 + xr) * 4] - h[(y0 + xl) * 4]) / 255;
        const dy = (h[(yd + x) * 4] - h[(yu + x) * 4]) / 255;
        let nx = -dx * strength, ny = -dy * strength, nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l; ny /= l; nz /= l;
        const o = (y0 + x) * 4;
        d[o] = (nx * 0.5 + 0.5) * 255;
        d[o + 1] = (ny * 0.5 + 0.5) * 255;
        d[o + 2] = (nz * 0.5 + 0.5) * 255;
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  function tex(cv, srgb) {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }

  let furMap = null, furNormal = null, leatherNormal = null;
  if (hasDOM) {
    // albedo: dense fine guard hairs, light/dark variation, flowing along +v (down the body)
    const furCv = strokesCanvas(512, 7500, '#c4bab0', 18, 70, 0.8, 2.2, 0.12, 0.42, (r) => {
      const g = Math.floor(lerp(105, 255, r));
      return 'rgb(' + g + ',' + Math.floor(g * 0.96) + ',' + Math.floor(g * 0.9) + ')';
    });
    furMap = tex(furCv, true);
    const furH = strokesCanvas(256, 4200, '#808080', 9, 38, 0.8, 1.7, 0.2, 0.5, (r) => (r > 0.5 ? '#ffffff' : '#000000'));
    furNormal = tex(normalFromHeight(furH, 2.4), false);

    // leather: pores and fine creases
    const lcv = document.createElement('canvas');
    lcv.width = lcv.height = 256;
    const lctx = lcv.getContext('2d');
    lctx.fillStyle = '#808080';
    lctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const x = rand() * 256, y = rand() * 256, r = lerp(0.8, 2.6, rand());
      lctx.globalAlpha = lerp(0.15, 0.45, rand());
      lctx.fillStyle = rand() > 0.62 ? '#ffffff' : '#000000';
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const X = x + ox * 256, Y = y + oy * 256;
        if (X < -4 || X > 260 || Y < -4 || Y > 260) continue;
        lctx.beginPath();
        lctx.arc(X, Y, r, 0, TAU);
        lctx.fill();
      }
    }
    lctx.globalAlpha = 1;
    leatherNormal = tex(normalFromHeight(lcv, 1.8), false);
  }

  // ---------------------------------------------------------------------------------------------
  // Fur geometry: body loft + 8 limb segments
  // ---------------------------------------------------------------------------------------------
  function bodySkin(z, outI, outW) {
    WTS.fill(0);
    let rem = 1, cur = B_HIPS;
    if (z >= J.hips[2]) {
      for (let k = 0; k < FWD_CHAIN.length; k++) {
        const jz = FWD_CHAIN[k][1];
        const s = smooth(jz - 0.03, jz + 0.03, z);
        WTS[cur] += rem * (1 - s);
        rem *= s;
        cur = FWD_CHAIN[k][0];
      }
    } else {
      for (let k = 0; k < BACK_CHAIN.length; k++) {
        const jz = BACK_CHAIN[k][1];
        const s = 1 - smooth(jz - 0.042, jz + 0.042, z);
        WTS[cur] += rem * (1 - s);
        rem *= s;
        cur = BACK_CHAIN[k][0];
      }
    }
    WTS[cur] += rem;
    let n = 0, total = 0;
    outI[0] = outI[1] = outI[2] = outI[3] = 0;
    outW[0] = outW[1] = outW[2] = outW[3] = 0;
    for (let pass = 0; pass < 4; pass++) {
      let bi = -1, bw = 1e-5;
      for (let k = 0; k < 9; k++) if (WTS[k] > bw) { bw = WTS[k]; bi = k; }
      if (bi < 0) break;
      outI[n] = bi; outW[n] = bw; total += bw; WTS[bi] = 0; n++;
    }
    if (total <= 0) { outI[0] = B_HIPS; outW[0] = 1; total = 1; }
    for (let k = 0; k < 4; k++) outW[k] /= total;
  }

  const C_BACK = [0.275, 0.178, 0.112];
  const C_FLANK = [0.415, 0.29, 0.185];
  const C_BELLY = [0.82, 0.72, 0.56];
  const C_TAILTOP = [0.2, 0.135, 0.095];
  const C_TAILUND = [0.34, 0.255, 0.19];
  const C_FACE = [0.5, 0.375, 0.26];
  const C_SPOT = [0.86, 0.78, 0.62];

  function bodyVert(v) {
    const z = v.z, s = v.s;
    const elev = Math.atan2(s, Math.abs(v.c));
    // groove behind the eye (the eye and ear opening share it)
    const groove = (1 - sat(Math.abs(elev - EYE_TH) / 0.2)) * smooth(0.25, 0.275, z) * (1 - smooth(0.3, 0.316, z));
    if (groove > 0) {
      v.x *= 1 - 0.075 * groove;
      v.y = v.cy + (v.y - v.cy) * (1 - 0.075 * groove);
    }
    const t1 = smooth(-0.8, -0.2, s), t2 = smooth(-0.15, 0.6, s);
    let r = lerp(lerp(C_BELLY[0], C_FLANK[0], t1), C_BACK[0], t2);
    let g = lerp(lerp(C_BELLY[1], C_FLANK[1], t1), C_BACK[1], t2);
    let b = lerp(lerp(C_BELLY[2], C_FLANK[2], t1), C_BACK[2], t2);
    // tail: darker, coarser
    const tw = (1 - smooth(-0.3, -0.2, z)) * 0.85;
    const tt = smooth(-0.3, 0.3, s);
    r = lerp(r, lerp(C_TAILUND[0], C_TAILTOP[0], tt), tw);
    g = lerp(g, lerp(C_TAILUND[1], C_TAILTOP[1], tt), tw);
    b = lerp(b, lerp(C_TAILUND[2], C_TAILTOP[2], tt), tw);
    // face warms and lightens towards the bill
    const hw = smooth(0.29, 0.36, z) * 0.3;
    r = lerp(r, C_FACE[0], hw); g = lerp(g, C_FACE[1], hw); b = lerp(b, C_FACE[2], hw);
    // pale spot just below / in front of the eye
    const spot = (1 - sat(Math.abs(elev - 0.55) / 0.3)) * smooth(0.292, 0.31, z) * (1 - smooth(0.325, 0.34, z));
    r = lerp(r, C_SPOT[0], spot * 0.6); g = lerp(g, C_SPOT[1], spot * 0.6); b = lerp(b, C_SPOT[2], spot * 0.6);
    // natural mottling + dark groove + belly contact shade
    const mott = 1 + Math.sin(z * 37 + v.th * 3) * Math.sin(v.th * 5 + z * 11) * 0.06;
    const shade = mott * (1 - 0.5 * groove) * (1 - 0.18 * smooth(-0.8, -1, s));
    v.r = lin(r * shade); v.g = lin(g * shade); v.b = lin(b * shade);
  }

  function limbVert(v) {
    const t = v.f;
    const k = 1 - 0.45 * smooth(0.35, 1, t);
    const under = 1 - 0.15 * smooth(0, -1, v.s);
    v.r = lin(lerp(C_FLANK[0], C_BACK[0], 0.35) * k * under);
    v.g = lin(lerp(C_FLANK[1], C_BACK[1], 0.35) * k * under);
    v.b = lin(lerp(C_FLANK[2], C_BACK[2], 0.35) * k * under);
  }

  const furB = makeBuilder();
  loft(furB, BODY_ST, {
    sub: 4, segs: 44, uScale: 6, vScale: 8,
    nTop: (z) => lerp(2.0, 2.3, smooth(-0.3, -0.18, z)),
    nBot: (z) => lerp(lerp(2.0, 2.9, smooth(-0.3, -0.15, z)), 2.4, smooth(0.2, 0.3, z)),
    vert: bodyVert, skin: bodySkin,
  });
  for (let i = 0; i < 4; i++) {
    const front = i < 2;
    loft(furB, front ? FRONT_UPPER_ST : HIND_UPPER_ST, { sub: 2, segs: 12, uScale: 2, vScale: 8, vert: limbVert, bone: B_LEG0 + i * 3 });
    loft(furB, front ? FRONT_LOWER_ST : HIND_LOWER_ST, { sub: 2, segs: 12, uScale: 2, vScale: 8, vert: limbVert, bone: B_LEG0 + i * 3 + 1 });
  }
  const furGeo = finish(furB, { skin: true, glow: false });

  // ---------------------------------------------------------------------------------------------
  // Leather geometry: bill + shield, lower bill, nostrils, feet, claws, spurs
  // ---------------------------------------------------------------------------------------------
  const leaB = makeBuilder();
  const mTmp = new THREE.Matrix4();

  function billVert(v) {
    const z = v.z;
    let r = 0.17, g = 0.175, b = 0.2;
    const shield = 1 - smooth(0.345, 0.372, z);
    r = lerp(r, 0.2, shield); g = lerp(g, 0.185, shield); b = lerp(b, 0.185, shield);
    const top = smooth(0.3, 0.95, v.s) * 0.035;
    const edge = 1 - 0.25 * smooth(0.82, 1, Math.abs(v.c));
    const under = 1 - 0.3 * smooth(0, -0.6, v.s);
    const mot = 1 + Math.sin(z * 260 + v.x * 180) * Math.sin(v.x * 330 - z * 90) * 0.06;
    const k = edge * under * mot;
    v.r = lin((r + top) * k); v.g = lin((g + top) * k); v.b = lin((b + top) * k);
    v.gx = 0.3 + 0.7 * smooth(0.34, 0.47, z);
  }
  function lowerBillVert(v) {
    const patch = smooth(0.1, 0.5, Math.sin(v.z * 310) * Math.sin(v.x * 420 + 1.3));
    const r = lerp(0.4, 0.2, patch), g = lerp(0.31, 0.18, patch), b = lerp(0.3, 0.19, patch);
    v.r = lin(r); v.g = lin(g); v.b = lin(b);
    v.gx = 0.5;
  }
  loft(leaB, BILL_ST, { sub: 4, segs: 32, uScale: 3, vScale: 14, nTop: 2.5, nBot: 2.8, vert: billVert, bone: B_HEAD });
  loft(leaB, LOWER_BILL_ST, { sub: 3, segs: 20, uScale: 3, vScale: 14, nTop: 3, nBot: 2.2, vert: lowerBillVert, bone: B_HEAD });

  // nostrils: two dark recessed ovals on top of the bill, about a quarter back from the tip
  const NOSTRIL_ST = [rnd(-0.0075, 0.0004), rnd(-0.005, 0.0032), rnd(0, 0.0046), rnd(0.005, 0.0032), rnd(0.0075, 0.0004)];
  for (let k = 0; k < NOSTRIL_ST.length; k++) { NOSTRIL_ST[k][3] *= 0.5; NOSTRIL_ST[k][4] *= 0.5; }
  function darkVert(v) { v.r = 0.004; v.g = 0.004; v.b = 0.006; v.gx = 0.2; }
  for (let sd = -1; sd <= 1; sd += 2) {
    ringAtZ(BILL_ST, 0.46, S5);
    mTmp.makeRotationY(sd * 0.2);
    mTmp.setPosition(sd * 0.0135, S5[2] + S5[3] * 0.985 - 0.0008, 0.46);
    loft(leaB, NOSTRIL_ST, { sub: 2, segs: 8, vert: darkVert, bone: B_HEAD, matrix: mTmp });
  }

  const CLAW_COL = [0.66, 0.59, 0.45];
  const SPUR_COL = [0.84, 0.77, 0.56];
  function clawVert(v) {
    const k = 0.45 + 0.55 * v.f;
    v.r = lin(CLAW_COL[0] * k); v.g = lin(CLAW_COL[1] * k); v.b = lin(CLAW_COL[2] * k);
  }
  function spurVert(v) {
    const k = 0.6 + 0.4 * v.f;
    v.r = lin(SPUR_COL[0] * k); v.g = lin(SPUR_COL[1] * k); v.b = lin(SPUR_COL[2] * k);
    v.gy = 1;
  }

  // Webbed foot: a domed fan with five digit ridges, authored in foot-bone space
  // (ankle at the origin, sole at y = -ANKLE_H, toes towards +Z).
  function addFoot(b, bone, front) {
    const R = front ? 0.084 : 0.068;
    const A = front ? 0.64 : 0.5;
    const sc = front ? -0.035 : 0.06; // front web bulges past the claws; hind web scallops between toes
    const na = 20, nr = 8, r0 = 0.008, zBack = 0.014;
    const yb = -ANKLE_H + 0.0012;
    const thick = (u, rr) => {
      const e = 1 - Math.pow(Math.abs(2 * u - 1), 8);
      const ridge = Math.pow(Math.cos(10 * PI * u - PI) * 0.5 + 0.5, 3) * 0.0075 * (1 - rr * 0.45);
      return e * sat(rr / 0.14) * (1 - Math.pow(rr, 8)) * (lerp(0.017, 0.0045, rr) + ridge);
    };
    const edgeR = (u) => R * (1 + sc * Math.cos(10 * PI * u - PI));
    for (let side = 0; side < 2; side++) { // 0 = top, 1 = bottom
      const base = b.pos.length / 3;
      for (let i = 0; i <= na; i++) {
        const u = i / na, a = lerp(-A, A, u);
        for (let j = 0; j <= nr; j++) {
          const rr = j / nr;
          const rad = lerp(r0, edgeR(u), Math.pow(rr, 0.9));
          const x = Math.sin(a) * rad, z = Math.cos(a) * rad - zBack;
          const th = thick(u, rr);
          const y = yb + (side === 0 ? th : 0);
          b.pos.push(x, y, z);
          b.uv.push(x * 18, z * 18);
          const ridge = Math.pow(Math.cos(10 * PI * u - PI) * 0.5 + 0.5, 2) * (1 - rr * 0.6);
          const k = side === 0 ? 1 : 0.7;
          b.col.push(lin(lerp(0.1, 0.19, ridge) * k), lin(lerp(0.095, 0.175, ridge) * k), lin(lerp(0.105, 0.175, ridge) * k));
          b.si.push(bone, 0, 0, 0);
          b.sw.push(1, 0, 0, 0);
          b.glow.push(0, 0);
        }
      }
      const row = nr + 1;
      for (let i = 0; i < na; i++) {
        for (let j = 0; j < nr; j++) {
          const p = base + i * row + j, q = p + row, p1 = p + 1, q1 = q + 1;
          if (side === 0) b.idx.push(p, p1, q, p1, q1, q);
          else b.idx.push(p, q, p1, p1, q, q1);
        }
      }
    }
    // claws
    const clawAt = front ? 0.66 : 0.9;
    const len = front ? 0.022 : 0.032;
    const cst = [
      [0, 0.0048, 0, 0.004, 0.003],
      [len * 0.45, 0.0038, -0.001, 0.0034, 0.0026],
      [len * 0.85, 0.002, -0.0035, 0.0018, 0.0014],
      [len, 0.0004, -0.0055, 0.0004, 0.0004],
    ];
    for (let k = 0; k < 5; k++) {
      const u = 0.1 + 0.2 * k, a = lerp(-A, A, u);
      const rad = lerp(r0, edgeR(u), Math.pow(clawAt, 0.9));
      mTmp.makeRotationY(a);
      mTmp.setPosition(Math.sin(a) * rad, yb + thick(u, clawAt) + 0.0015, Math.cos(a) * rad - zBack);
      loft(b, cst, { sub: 2, segs: 6, vert: clawVert, bone, matrix: mTmp });
    }
  }

  const SPUR_LEN = 0.036;
  const spurBase = [new THREE.Vector3(), new THREE.Vector3()];
  const spurTip = [new THREE.Vector3(), new THREE.Vector3()];
  function addSpur(b, bone, side, which) {
    // inner (medial) side of the hind ankle, pointing back, in and slightly up
    const dir = new THREE.Vector3(-side * 0.55, 0.3, -0.78).normalize();
    const xAxis = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    const yAxis = new THREE.Vector3().crossVectors(dir, xAxis);
    const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, dir);
    spurBase[which].set(-side * 0.015, 0.004, -0.012);
    m.setPosition(spurBase[which]);
    const st = [
      [-0.004, 0.0005, 0, 0.0005, 0.0005],
      [0, 0.0066, 0, 0.0066, 0.0066],
      [SPUR_LEN * 0.4, 0.0048, 0.0008, 0.0048, 0.0048],
      [SPUR_LEN * 0.8, 0.0024, 0.0028, 0.0024, 0.0024],
      [SPUR_LEN, 0.0004, 0.0046, 0.0004, 0.0004],
    ];
    loft(b, st, { sub: 2, segs: 7, vert: spurVert, bone, matrix: m });
    spurTip[which].copy(spurBase[which]).addScaledVector(dir, SPUR_LEN);
  }

  for (let i = 0; i < 4; i++) {
    const bone = B_LEG0 + i * 3 + 2;
    addFoot(leaB, bone, i < 2);
    if (i >= 2) addSpur(leaB, bone, i === 2 ? 1 : -1, i - 2);
  }
  const leatherGeo = finish(leaB, { skin: true, glow: true });

  // ---------------------------------------------------------------------------------------------
  // Eyes
  // ---------------------------------------------------------------------------------------------
  ringAtZ(BODY_ST, EYE_Z, S5);
  const eyeX0 = S5[1] * Math.pow(Math.cos(EYE_TH), 2 / 2.3);
  const eyeY0 = S5[2] + S5[3] * Math.pow(Math.sin(EYE_TH), 2 / 2.3);
  let enx = eyeX0 / (S5[1] * S5[1]), eny = (eyeY0 - S5[2]) / (S5[3] * S5[3]);
  const enl = Math.hypot(enx, eny) || 1;
  enx /= enl; eny /= enl;
  const eyeX = eyeX0 - enx * EYE_R * 0.3;
  const eyeY = eyeY0 - eny * EYE_R * 0.3;

  const eyeB = makeBuilder();
  const EYE_ST = [];
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * PI;
    EYE_ST.push(rnd(-Math.cos(a) * EYE_R, Math.max(Math.sin(a) * EYE_R, 0.0003)));
  }
  let eyeSide = 1;
  function eyeVert(v) {
    // catchlight baked towards up / forward / outward
    const d = (v.x * eyeSide * 0.38 + v.y * 0.78 + v.z * 0.5) / (EYE_R * 1.0);
    const hi = smooth(0.915, 0.975, d);
    const wet = smooth(0.2, 0.9, d) * 0.035;
    v.r = lerp(0.012 + wet, 1, hi); v.g = lerp(0.009 + wet, 1, hi); v.b = lerp(0.008 + wet * 1.2, 1, hi);
  }
  for (let sd = -1; sd <= 1; sd += 2) {
    eyeSide = sd;
    mTmp.identity();
    mTmp.setPosition(sd * eyeX, 0, 0);
    loft(eyeB, EYE_ST, { sub: 2, segs: 14, vert: eyeVert, matrix: mTmp });
  }
  const eyeGeo = finish(eyeB, { skin: false, glow: false });

  // ---------------------------------------------------------------------------------------------
  // Materials
  // ---------------------------------------------------------------------------------------------
  const U = {
    bristle: { value: 0 },
    billGlow: { value: 0 },
    spurGlow: { value: 0 },
    rimFur: { value: new THREE.Color(0.3, 0.22, 0.15) },
    rimLeather: { value: new THREE.Color(0.1, 0.13, 0.17) },
    billColor: { value: new THREE.Color(0.25, 0.65, 1.6) },
    spurColor: { value: new THREE.Color(0.45, 1.5, 0.25) },
  };

  const furMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.56, metalness: 0,
    map: furMap, normalMap: furNormal,
  });
  if (furNormal) furMat.normalScale.set(0.75, 0.75);
  furMat.onBeforeCompile = (sh) => {
    sh.uniforms.uBristle = U.bristle;
    sh.uniforms.uRimColor = U.rimFur;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uBristle;\nfloat platyHash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ float ph = platyHash(floor(position * 420.0)); transformed += objectNormal * (uBristle * 0.015 * ph); }');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uBristle;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float prim = 1.0 - saturate(dot(normalize(vViewPosition), normal));\n  float prim2 = prim * prim;\n  totalEmissiveRadiance += uRimColor * (prim2 * sqrt(prim)) * (0.35 + diffuseColor.rgb * 2.2);\n  totalEmissiveRadiance += vec3(0.2, 0.5, 1.0) * (uBristle * 0.55 * prim2); }');
  };
  furMat.customProgramCacheKey = () => 'platypus-fur';

  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.4, metalness: 0,
    normalMap: leatherNormal,
  });
  if (leatherNormal) leatherMat.normalScale.set(0.4, 0.4);
  leatherMat.onBeforeCompile = (sh) => {
    sh.uniforms.uBillGlow = U.billGlow;
    sh.uniforms.uSpurGlow = U.spurGlow;
    sh.uniforms.uBillColor = U.billColor;
    sh.uniforms.uSpurColor = U.spurColor;
    sh.uniforms.uRimColor = U.rimLeather;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aGlow;\nvarying vec2 vPlatyGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlatyGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPlatyGlow;\nuniform float uBillGlow;\nuniform float uSpurGlow;\nuniform vec3 uBillColor;\nuniform vec3 uSpurColor;\nuniform vec3 uRimColor;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float prim = 1.0 - saturate(dot(normalize(vViewPosition), normal));\n  totalEmissiveRadiance += uRimColor * (prim * prim * prim);\n  totalEmissiveRadiance += uBillColor * (vPlatyGlow.x * uBillGlow * (0.55 + 0.9 * prim));\n  totalEmissiveRadiance += uSpurColor * (vPlatyGlow.y * uSpurGlow); }');
  };
  leatherMat.customProgramCacheKey = () => 'platypus-leather';

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });

  // ---------------------------------------------------------------------------------------------
  // Skeleton
  // ---------------------------------------------------------------------------------------------
  const rig = new THREE.Group();
  rig.name = 'platypusRig';
  group.add(rig);
  const bones = [];
  function mkBone(name, pos, parent, parentPos) {
    const b = new THREE.Bone();
    b.name = name;
    if (pos) b.position.set(pos[0] - (parentPos ? parentPos[0] : 0), pos[1] - (parentPos ? parentPos[1] : 0), pos[2] - (parentPos ? parentPos[2] : 0));
    parent.add(b);
    bones.push(b);
    return b;
  }
  const hips = mkBone('hips', J.hips, rig, null);
  const spine1 = mkBone('spine1', J.spine1, hips, J.hips);
  const spine2 = mkBone('spine2', J.spine2, spine1, J.spine1);
  const chest = mkBone('chest', J.chest, spine2, J.spine2);
  const neck = mkBone('neck', J.neck, chest, J.chest);
  const head = mkBone('head', J.head, neck, J.neck);
  const tail1 = mkBone('tail1', J.tail1, hips, J.hips);
  const tail2 = mkBone('tail2', J.tail2, tail1, J.tail1);
  const tail3 = mkBone('tail3', J.tail3, tail2, J.tail2);
  hips.rotation.order = 'YXZ';

  const FOOT_OFF = [0.4, 0.9, 0.0, 0.5]; // lateral sequence, diagonal couplets: HL, FL, HR, FR
  const feet = [];
  for (let i = 0; i < 4; i++) {
    const front = i < 2;
    const side = i % 2 === 0 ? 1 : -1;
    const nm = (front ? 'F' : 'H') + (side > 0 ? 'L' : 'R');
    const upper = mkBone(nm + '_upper', null, rig, null);
    const lower = mkBone(nm + '_lower', null, rig, null);
    const foot = mkBone(nm + '_foot', null, rig, null);
    foot.rotation.order = 'YXZ';
    const hx = side * (front ? 0.182 : 0.184);
    const hz = front ? 0.2 : -0.155;
    feet.push({
      i, front, side, off: FOOT_OFF[i],
      upper, lower, foot,
      a: 0.1 * LEG_K, b: (front ? 0.1 : 0.105) * LEG_K,
      att: front ? new THREE.Vector3(side * 0.1, -0.036, 0.005) : new THREE.Vector3(side * 0.106, -0.036, -0.02),
      pole: front ? new THREE.Vector3(side * 0.8, 0.5, -0.6).normalize() : new THREE.Vector3(side * 0.75, 0.45, 0.5).normalize(),
      toe: front ? 0.3 : 0.95,
      hx, hz, x: hx, z: hz,
      sx: hx, sz: hz, tx: hx, tz: hz,
      lift: 0, pitch: 0, yaw: 0, syaw: 0, fold: 0, df: 0, swing: false,
    });
  }

  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones); // inverses from the bind pose above (leg bones bind at identity)
  const bindM = new THREE.Matrix4();

  const furMesh = new THREE.SkinnedMesh(furGeo, furMat);
  furMesh.name = 'platypusFur';
  furMesh.castShadow = true;
  furMesh.receiveShadow = false;
  furMesh.frustumCulled = false;
  group.add(furMesh);
  furMesh.bind(skeleton, bindM);

  const leatherMesh = new THREE.SkinnedMesh(leatherGeo, leatherMat);
  leatherMesh.name = 'platypusLeather';
  leatherMesh.castShadow = true;
  leatherMesh.receiveShadow = false;
  leatherMesh.frustumCulled = false;
  group.add(leatherMesh);
  leatherMesh.bind(skeleton, bindM);

  const eyes = new THREE.Mesh(eyeGeo, eyeMat);
  eyes.name = 'platypusEyes';
  eyes.frustumCulled = false;
  eyes.position.set(0, eyeY - J.head[1], EYE_Z - J.head[2]);
  head.add(eyes);

  const billTip = new THREE.Object3D();
  billTip.name = 'billTip';
  billTip.position.set(0, 0.092 - LOW - J.head[1], 0.5 - J.head[2]);
  head.add(billTip);
  const spurL = new THREE.Object3D();
  spurL.name = 'spurL';
  spurL.position.copy(spurTip[0]);
  feet[2].foot.add(spurL);
  const spurR = new THREE.Object3D();
  spurR.name = 'spurR';
  spurR.position.copy(spurTip[1]);
  feet[3].foot.add(spurR);

  // ---------------------------------------------------------------------------------------------
  // Animation state
  // ---------------------------------------------------------------------------------------------
  let clock = 0;
  let phase = 0;
  let walkW = 0, airW = 0, kS = 0, celW = 0, celT = 0;
  let yawP = 0, yawC = 0, yawCLag = 0, rollP = 0, rollC = 0, bob = 0, turnS = 0;
  let tailY0 = 0, tailY1 = 0, tailY2 = 0;
  let q = 0, qv = 0; // squash (+) / stretch (-) spring
  let nod = 0, nodV = 0; // head pitch spring
  let tp = 0, tpV = 0; // tail pitch spring
  let wasAir = false, pendingLand = -1;
  let stingT = -1, stingSide = 1, stingEnded = true;
  let zapT = -1, zapFired = false;
  let hurtT = -1;
  let celebrating = false;
  let blinkT = -1, blinkNext = 2.5, closeHold = 0;
  let idleW = 1;

  const tS = new THREE.Vector3(), tA = new THREE.Vector3(), tD = new THREE.Vector3();
  const tE = new THREE.Vector3(), tP = new THREE.Vector3();
  const bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3();
  const mB = new THREE.Matrix4(), mChest = new THREE.Matrix4();
  const air = { x: 0, y: 0, z: 0 };

  function orient(bone, from, to, stretch) {
    bz.subVectors(to, from);
    const l = bz.length();
    if (l < 1e-6) bz.set(0, -1, 0); else bz.multiplyScalar(1 / l);
    bx.set(bz.z, 0, -bz.x); // up x z
    if (bx.lengthSq() < 1e-8) bx.set(1, 0, 0);
    bx.normalize();
    by.crossVectors(bz, bx);
    mB.makeBasis(bx, by, bz);
    bone.quaternion.setFromRotationMatrix(mB);
    bone.position.copy(from);
    bone.scale.set(1, 1, stretch);
  }

  function airPose(f, k) {
    const up = k > 0 ? k : 0, dn = k < 0 ? -k : 0, mid = 1 - up - dn;
    if (f.front) {
      air.x = f.side * (0.19 * up + 0.215 * mid + 0.2 * dn);
      air.y = 0.05 * up + 0.082 * mid + 0.03 * dn;
      air.z = f.hz + 0.08 * up + 0.02 * mid + 0.05 * dn;
    } else {
      air.x = f.side * (0.16 * up + 0.225 * mid + 0.2 * dn);
      air.y = 0.028 * up + 0.075 * mid + 0.028 * dn;
      air.z = f.hz - 0.13 * up + 0.03 * mid;
    }
  }

  function resetFeet(splay) {
    for (let i = 0; i < 4; i++) {
      const f = feet[i];
      f.x = f.hx * (1 + 0.24 * splay);
      f.z = f.hz + (f.front ? 0.035 : -0.035) * splay;
      f.lift = 0; f.pitch = 0; f.yaw = 0; f.fold = 0; f.df = 0; f.swing = false;
    }
  }

  const api = {
    group,
    update,
    onFootstep: null,
    jump,
    land,
    sting,
    stingHitTime: STING_HIT,
    zap,
    zapFireTime: ZAP_FIRE,
    hurt,
    celebrate,
    billTip,
    spurL,
    spurR,
    radius: 0.35,
    // extras
    length: 1.0,
    height: 0.27,
    meshes: [furMesh, leatherMesh, eyes],
    skeleton,
    dispose,
  };

  function jump() {
    qv += 10; // anticipation crouch; the spring rebounds into the launch stretch
    nodV += 3;
    tpV += 4;
    celebrating = false;
  }

  function land(impact) {
    const k = sat(impact === undefined ? 0.5 : impact);
    qv += 4 + 8 * k;
    nodV += 2 + 5 * k;
    tpV -= 3 + 6 * k;
    pendingLand = k;
  }

  function sting() {
    stingT = 0;
    stingSide = -stingSide;
    stingEnded = false;
    qv += 5;
    celebrating = false;
    return STING_DUR;
  }

  function zap() {
    zapT = 0;
    zapFired = false;
    celebrating = false;
    return ZAP_DUR;
  }

  function hurt() {
    hurtT = 0;
    qv += 6;
    nodV -= 6;
    tpV += 5;
    closeHold = 0.28;
    celebrating = false;
  }

  function celebrate() {
    celebrating = true;
    celT = 0;
  }

  function dispose() {
    furGeo.dispose(); leatherGeo.dispose(); eyeGeo.dispose();
    furMat.dispose(); leatherMat.dispose(); eyeMat.dispose();
    if (furMap) furMap.dispose();
    if (furNormal) furNormal.dispose();
    if (leatherNormal) leatherNormal.dispose();
    skeleton.dispose();
  }

  const REST_STATE = { speed: 0, maxSpeed: 3, grounded: true, vy: 0, turn: 0, moving: false };

  function update(dt, s) {
    s = s || REST_STATE;
    if (!(dt >= 0)) dt = 0;
    const maxSpeed = s.maxSpeed > 0 ? s.maxSpeed : 3;
    const speed = Math.abs(s.speed || 0);
    const grounded = s.grounded !== false;
    const vy = s.vy || 0;
    const turn = s.turn || 0;
    const moving = s.moving !== undefined ? !!s.moving : speed > 0.05;
    clock = typeof s.time === 'number' ? s.time : clock + dt;
    const time = clock;
    const r = sat(speed / maxSpeed);

    if (celebrating && (moving || speed > 0.2)) celebrating = false;
    celW = damp(celW, celebrating ? 1 : 0, 9, dt);
    if (celebrating) celT += dt;

    // ---------------- attack timelines ----------------
    let spinning = false, su = 0, spinE = 0, spinArc = 0, kw = 0, kickIdx = -1, spurGlow = 0;
    if (stingT >= 0) {
      stingT += dt;
      su = sat((stingT - STING_SPIN_T0) / STING_SPIN_LEN);
      spinning = su > 0 && su < 1;
      spinE = su * su * (3 - 2 * su);
      spinArc = Math.sin(PI * su);
      kw = sat(su / 0.18) * sat((1 - su) / 0.22);
      if (stingT < STING_SPIN_T0) kw = 0;
      kickIdx = stingSide > 0 ? 2 : 3;
      const g = (stingT - STING_HIT) / 0.075;
      spurGlow = Math.exp(-g * g) * 2.2;
      if (su >= 1 && !stingEnded) {
        stingEnded = true;
        qv += 4.5; // touch-down from the spin hop
        nodV += 2;
        resetFeet(0.25);
      }
      if (stingT >= STING_DUR) { stingT = -1; kickIdx = -1; }
    }

    let zapDip = 0, bristle = 0, billGlow = 0;
    if (zapT >= 0) {
      zapT += dt;
      const t = zapT;
      zapDip = t < 0.5 ? smooth(0, 0.28, t) : 1 - smooth(0.5, 0.9, t);
      if (t < ZAP_FIRE) {
        const c = t / ZAP_FIRE;
        bristle = c * c * (0.8 + 0.2 * Math.sin(time * 70));
        billGlow = c * c * 0.75 * (0.85 + 0.15 * Math.sin(time * 55));
      } else {
        const e = t - ZAP_FIRE;
        bristle = Math.exp(-e * 5) * (0.85 + 0.15 * Math.sin(time * 70));
        billGlow = 2.4 * Math.exp(-e * 7);
        if (!zapFired) {
          zapFired = true;
          nodV -= 5; // recoil as the pulse leaves the bill
          qv -= 3;
          tpV += 6;
        }
      }
      if (t < ZAP_FIRE + 0.1) closeHold = Math.max(closeHold, 0.05);
      if (t >= ZAP_DUR) zapT = -1;
    }

    let flinch = 0;
    if (hurtT >= 0) {
      hurtT += dt;
      flinch = (1 - Math.exp(-hurtT * 40)) * Math.exp(-hurtT * 8);
      bristle = Math.max(bristle, flinch * 0.6);
      if (hurtT > 0.6) hurtT = -1;
    }

    // ---------------- gait ----------------
    const walking = grounded && !spinning && speed > 0.04;
    const suspended = !grounded || spinning;
    let freq = speed / lerp(0.2, 0.47, r);
    if (freq > 6.8) freq = 6.8;
    const duty = lerp(0.72, 0.5, r);
    const liftH = lerp(0.026, 0.046, r);

    if (suspended) {
      if (!grounded) wasAir = true;
      resetFeet(0);
    } else {
      if (wasAir) {
        wasAir = false;
        resetFeet(pendingLand >= 0 ? pendingLand : 0.3);
        pendingLand = -1;
      }
      let adv = 0, fEff = freq;
      if (walking) {
        adv = freq * dt;
      } else {
        fEff = 2.6;
        let need = false;
        for (let i = 0; i < 4; i++) {
          const f = feet[i];
          const ex = f.x - f.hx, ez = f.z - f.hz;
          if (f.swing || ex * ex + ez * ez > 0.0009) { need = true; break; }
        }
        if (need) adv = fEff * dt;
      }
      phase += adv;
      if (phase > 1024) phase -= 1024;
      const T = duty / Math.max(fEff, 0.5);
      const ang = clamp(turn * T * 0.5, -0.5, 0.5);
      const ahead = Math.min(speed * T * 0.5, 0.14);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const a2 = -turn * dt, c2 = Math.cos(a2), s2 = Math.sin(a2);
      for (let i = 0; i < 4; i++) {
        const f = feet[i];
        const p = frac(phase - f.off + 8);
        const st = p < duty;
        if (f.swing && st) {
          // plant
          f.swing = false;
          f.x = f.tx; f.z = f.tz; f.lift = 0; f.fold = 0; f.yaw = 0;
          if (f.df > 0.3 && api.onFootstep) api.onFootstep(i, f.x, f.z, (0.3 + 0.7 * r) * f.df);
        } else if (!f.swing && !st && adv > 0) {
          // lift off
          f.swing = true;
          f.sx = f.x; f.sz = f.z; f.syaw = f.yaw;
        }
        if (f.swing) {
          const t = sat((p - duty) / (1 - duty));
          f.tx = f.hx * ca + f.hz * sa;
          f.tz = -f.hx * sa + f.hz * ca + ahead;
          const e = t * t * (3 - 2 * t);
          const ddx = f.tx - f.sx, ddz = f.tz - f.sz;
          const df = sat(Math.sqrt(ddx * ddx + ddz * ddz) / 0.08);
          f.df = df;
          f.x = f.sx + ddx * e;
          f.z = f.sz + ddz * e;
          const arc = Math.sin(PI * Math.pow(t, 0.8));
          f.lift = liftH * df * arc;
          // heel peels up first (toes trail), then the toes flick up to reach for the plant
          const pt = df * (0.75 * Math.sin(PI * t) * (1 - t) * 2 - 0.45 * Math.sin(PI * t) * t * 1.4);
          f.pitch = damp(f.pitch, pt, 40, dt);
          f.yaw = f.syaw * (1 - e);
          f.fold = df * arc;
        } else {
          // stance: the foot is fixed in the world, so it slides back through local space
          const nx = f.x * c2 + f.z * s2;
          const nz = -f.x * s2 + f.z * c2 - speed * dt;
          f.x = nx; f.z = nz;
          f.yaw = clamp(f.yaw - turn * dt, -0.6, 0.6);
          const lo = walking ? sat((p / duty - 0.8) / 0.2) : 0;
          f.pitch = damp(f.pitch, 0.42 * lo, 30, dt);
          f.lift = 0.012 * lo * lo;
          f.fold = 0;
          // safety: never let a planted foot be dragged beyond what the leg can cover
          const ex = f.x - f.hx, ez = f.z - f.hz;
          const e2 = ex * ex + ez * ez;
          if (e2 > 0.09) {
            const k = 0.3 / Math.sqrt(e2);
            f.x = f.hx + ex * k; f.z = f.hz + ez * k;
          }
        }
      }
    }

    // ---------------- smoothed drivers ----------------
    walkW = damp(walkW, walking ? 1 : 0, 8, dt);
    idleW = damp(idleW, !walking && grounded && stingT < 0 && zapT < 0 && !celebrating ? 1 : 0, 3, dt);
    airW = damp(airW, grounded ? 0 : 1, grounded ? 18 : 12, dt);
    kS = damp(kS, clamp(vy / 4.5, -1, 1), 12, dt);
    const kUp = kS > 0 ? kS : 0, kDn = kS < 0 ? -kS : 0, kMid = 1 - kUp - kDn;
    const gW = 1 - airW;

    const FL = feet[0], FR = feet[1], HL = feet[2], HR = feet[3];
    const yawPT = clamp(-((HL.z - HL.hz) - (HR.z - HR.hz)) * 0.95, -0.34, 0.34) * gW;
    const yawCT = clamp(-((FL.z - FL.hz) - (FR.z - FR.hz)) * 0.8, -0.3, 0.3) * gW;
    yawP = damp(yawP, yawPT, 22, dt);
    yawC = damp(yawC, yawCT, 22, dt);
    yawCLag = damp(yawCLag, yawC, 9, dt);
    rollP = damp(rollP, (HL.lift - HR.lift) * 0.8 * gW, 18, dt);
    rollC = damp(rollC, (FL.lift - FR.lift) * 0.8 * gW, 18, dt);
    bob = damp(bob, ((FL.lift + FR.lift + HL.lift + HR.lift) * 0.085 - 0.012 * r * walkW) * gW, 16, dt);
    turnS = damp(turnS, clamp(turn * 0.06, -0.28, 0.28), 7, dt);

    // squash / stretch spring
    const qT = airW * (-0.3 * kUp) + zapDip * 0.12;
    qv += (-(q - qT) * 230 - qv * 17) * dt;
    q += qv * dt;
    if (q > 1) { q = 1; if (qv > 0) qv = 0; }
    if (q < -0.5) { q = -0.5; if (qv < 0) qv = 0; }

    // idle life
    const breath = Math.sin(time * 1.9);
    const idleLook = idleW * Math.sin(time * 0.37) * Math.sin(time * 0.23 + 1.0) * 0.4;
    const sniff = idleW * (Math.sin(time * 2.3) * 0.03 + Math.max(0, Math.sin(time * 0.6)) * Math.sin(time * 11) * 0.012);
    const celS = Math.sin(celT * 6.5), celHop = Math.abs(celS);

    // head pitch spring (positive = nose down)
    const nodT = sniff + walkW * 0.03 * Math.sin(phase * TAU * 2 + 0.6) +
      airW * (-0.12 * kUp + 0.12 * kDn + 0.1 * kMid) + zapDip * 0.17 - flinch * 0.3 +
      celW * (-0.28 + 0.08 * celHop) + spinArc * 0.08;
    nodV += (-(nod - nodT) * 190 - nodV * 15) * dt;
    nod += nodV * dt;
    nod = clamp(nod, -0.7, 0.7);

    // tail pitch spring (positive = tail up)
    let tpT = walkW * 0.05 * Math.sin(phase * TAU * 2 + 1.0) + idleW * 0.02 * Math.sin(time * 0.9) +
      airW * (-0.22 * kUp + 0.34 * kDn - 0.12 * kMid) + celW * 0.42 * Math.sin(celT * 13) +
      spinArc * 0.22 - zapDip * 0.05 + flinch * 0.2;
    tpV += (-(tp - tpT) * 130 - tpV * 9.5) * dt;
    tp += tpV * dt;
    tp = clamp(tp, grounded ? -0.14 : -0.5, 0.8);

    // tail yaw: each joint chases the one before it, so the sway travels down the paddle
    const stingBend = stingSide * 0.27 * spinArc;
    const tailSrc = -yawP * 0.9 - turnS * 0.7 + idleW * 0.07 * Math.sin(time * 0.8) +
      stingSide * 0.55 * spinArc + celW * 0.18 * Math.sin(celT * 6.5 + 1.2);
    tailY0 = damp(tailY0, tailSrc, 11, dt);
    tailY1 = damp(tailY1, tailY0 * 1.15, 7.5, dt);
    tailY2 = damp(tailY2, tailY1 * 1.15, 5.5, dt);

    // ---------------- body ----------------
    const shiver = bristle * Math.sin(time * 92) * 0.0032;
    const pitchBody = airW * (-0.26 * kUp + 0.08 * kDn) + zapDip * 0.15 - celW * (0.2 + 0.05 * celHop) +
      walkW * 0.012 * Math.sin(phase * TAU * 2) - flinch * 0.1;
    const curl = airW * (kMid * 0.15 - kUp * 0.07 + kDn * 0.02) + zapDip * 0.03 + Math.max(q, 0) * 0.03;
    const dYaw = (yawC - yawP) / 3 + turnS / 3 + stingBend / 3;
    const dRoll = (rollC - rollP) / 3;
    const chestX = 0.1 * Math.sin(yawP) + 0.09 * Math.sin(yawP + dYaw) + 0.09 * Math.sin(yawP + 2 * dYaw);
    const drop = Math.max(q, 0) * 0.06 + q * (q < 0 ? 0.02 : 0) + zapDip * 0.014;

    hips.position.set(
      -chestX * 0.5 + shiver,
      J.hips[1] + bob - drop + celW * 0.012 * celHop,
      J.hips[2] - flinch * 0.05
    );
    hips.rotation.set(
      pitchBody,
      yawP,
      rollP - turnS * 0.25 * r + celW * 0.12 * celS + flinch * 0.06 * Math.sin(time * 40) - stingSide * 0.18 * spinArc
    );
    hips.scale.set(1 + 0.22 * q, 1 - 0.28 * q, 1 + 0.05 * q - 0.03 * Math.min(q, 0));

    const br = 1 + 0.018 * breath * (0.5 + 0.5 * idleW) + bristle * 0.02;
    spine1.rotation.set(curl, dYaw, dRoll);
    spine2.rotation.set(curl, dYaw, dRoll);
    spine2.scale.set(br, br, 1);
    chest.rotation.set(curl, dYaw, dRoll);
    chest.scale.set(1 / br, 1 / br, 1);

    const lookYaw = idleLook + turnS * 1.1 + celW * 0.22 * Math.sin(celT * 6.5 + 0.6);
    neck.rotation.set(nod * 0.5 + airW * kMid * 0.06, -(yawC + turnS + stingBend) * 0.55 + lookYaw * 0.45, -rollC * 0.5);
    head.rotation.set(nod * 0.5, -(yawCLag + stingBend) * 0.4 + lookYaw * 0.55, -rollC * 0.4 + idleLook * 0.15);

    tail1.rotation.set(tp * 0.5 - pitchBody * 0.35, tailY0, -rollP * 0.6);
    tail2.rotation.set(tp * 0.3, tailY1, 0);
    tail3.rotation.set(tp * 0.25, tailY2, 0);

    // rig: only the sting spin hop and the celebration bounce move the whole animal
    if (stingT >= 0) {
      rig.rotation.y = -stingSide * TAU * spinE;
      rig.position.y = 0.075 * spinArc + celW * 0.045 * celHop;
    } else {
      rig.rotation.y = 0;
      rig.position.y = celW * 0.045 * celHop;
    }

    // ---------------- legs (two-bone IK in rig space) ----------------
    hips.updateMatrix();
    spine1.updateMatrix();
    spine2.updateMatrix();
    chest.updateMatrix();
    mChest.multiplyMatrices(hips.matrix, spine1.matrix).multiply(spine2.matrix).multiply(chest.matrix);

    for (let i = 0; i < 4; i++) {
      const f = feet[i];
      let aw = airW;
      if (i !== kickIdx && spinArc > aw) aw = spinArc;
      airPose(f, airW > 0.02 ? kS : 0);
      let px = lerp(f.x, air.x, aw);
      let py = lerp(ANKLE_H + f.lift, air.y, aw);
      let pz = lerp(f.z, air.z, aw);
      let pitch = f.pitch * (1 - aw) + 0.35 * aw;
      let yaw = f.side * f.toe + f.yaw * (1 - aw);
      const fold = 1 - 0.22 * f.fold * (1 - aw) + 0.14 * aw;
      if (i === kickIdx && kw > 0) {
        px = lerp(px, f.side * 0.17, kw);
        py = lerp(py, 0.08, kw);
        pz = lerp(pz, -0.33, kw);
        pitch = lerp(pitch, -0.5, kw);
        yaw += f.side * 0.35 * kw;
      }
      if (celW > 0.001 && f.front) py += celW * 0.05 * Math.max(0, f.side > 0 ? celS : -celS);

      tS.copy(f.att).applyMatrix4(f.front ? mChest : hips.matrix);
      tA.set(px, py, pz);
      tD.subVectors(tA, tS);
      let d = tD.length();
      if (d < 1e-5) { tD.set(0, -1, 0); d = 1e-5; } else tD.multiplyScalar(1 / d);
      const maxL = (f.a + f.b) * 0.995;
      let stretch = 1;
      if (d > maxL) {
        stretch = d / maxL;
        if (stretch > 1.35) {
          stretch = 1.35;
          d = maxL * 1.35;
          tA.copy(tS).addScaledVector(tD, d);
        }
      }
      if (d < 0.03) d = 0.03;
      const aa = f.a * stretch, bb = f.b * stretch;
      const along = clamp((aa * aa - bb * bb + d * d) / (2 * d), -aa, aa);
      const h = Math.sqrt(Math.max(0, aa * aa - along * along));
      tP.copy(f.pole).addScaledVector(tD, -f.pole.dot(tD));
      if (tP.lengthSq() < 1e-8) tP.set(f.side, 0, 0);
      tP.normalize();
      tE.copy(tS).addScaledVector(tD, along).addScaledVector(tP, h);
      orient(f.upper, tS, tE, stretch);
      orient(f.lower, tE, tA, stretch);
      f.foot.position.copy(tA);
      f.foot.rotation.set(pitch, yaw, 0);
      f.foot.scale.set(fold, 1, 1);
    }

    // ---------------- eyes + shader drivers ----------------
    blinkNext -= dt;
    if (blinkNext <= 0 && blinkT < 0) {
      blinkT = 0;
      blinkNext = 2.2 + Math.random() * 3.8;
    }
    let lid = 0;
    if (blinkT >= 0) {
      blinkT += dt;
      lid = Math.sin(PI * sat(blinkT / 0.14));
      if (blinkT >= 0.14) blinkT = -1;
    }
    if (closeHold > 0) {
      closeHold -= dt;
      lid = Math.max(lid, 0.9);
    }
    if (celW > 0.5) lid = Math.max(lid, 0.55); // happy squint
    eyes.scale.y = 1 - 0.93 * sat(lid);

    U.bristle.value = bristle;
    U.billGlow.value = billGlow;
    U.spurGlow.value = spurGlow;
  }

  // settle the rest pose so the model is valid before the first frame
  update(0, { speed: 0, maxSpeed: 3, grounded: true, vy: 0, turn: 0, moving: false, time: 0 });
  group.updateMatrixWorld(true);

  return api;
}
