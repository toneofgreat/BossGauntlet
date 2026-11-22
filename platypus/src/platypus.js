// platypus.js — the player character (and, as the "friend" variant, Pip).
// A single lofted, skinned body (fur) + a leather mesh (bill, feet, claws, spurs) + eyes.
// 3 draw calls, ~15k triangles, one 21-bone skeleton per instance. Everything is procedural.
// Geometry and textures are built once per module and shared by every instance; materials are per instance.
//
// Animation is layered: the level-1 locomotion (gait, jump, sting, zap) is the base; swimming, the
// persistent poses (sit, sleep, carry ...), lookAt and the one-shot actions (tricks, tail slap, eat ...)
// only ADD to a set of pose channels and foot targets, so they blend over the base and over each other.
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
const seg = (a, b, x) => sat((x - a) / (b - a));
const bump = (a, b, c, d, x) => smooth(a, b, x) * (1 - smooth(c, d, x)); // 0 -> 1 over a..b, 1 -> 0 over c..d
const backOut = (t, k) => { const u = t - 1; return 1 + (k + 1) * u * u * u + k * u * u; }; // ease out with overshoot

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
const B_JAW = B_LEG0 + 12; // the lower bill hinges on its own bone (identity at rest), so the bill can open
const J_JAW = [0, 0.088 - 0.04, 0.35];

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

// LEVELS.md B1 — these numbers are binding (dur / apex in seconds, height = body rise inside the group).
const TRICKS = {
  spin: { dur: 0.9, apex: 0.45, height: 0.25 },
  backflip: { dur: 1.15, apex: 0.5, height: 0.9 },
  tailStand: { dur: 1.6, apex: 0.7, height: 0.35 },
  roll: { dur: 0.9, apex: 0.45, height: 0 },
  twirlLeap: { dur: 1.2, apex: 0.55, height: 1.1 },
  wave: { dur: 1.1, apex: 0.5, height: 0 },
  bow: { dur: 1.2, apex: 0.6, height: 0 },
  waterLeap: { dur: 1.4, apex: 0.6, height: 1.3 },
  diveFlip: { dur: 1.0, apex: 0.5, height: 0 },
  tailSplash: { dur: 0.8, apex: 0.35, height: 0 },
};
const TRICK_ID = { spin: 0, backflip: 1, tailStand: 2, roll: 3, twirlLeap: 4, wave: 5, bow: 6, waterLeap: 7, diveFlip: 8, tailSplash: 9 };
const TRICK_LAND = { spin: 0.7, backflip: 0.86, twirlLeap: 1.0, waterLeap: 1.12 }; // touchdown ("land" event)
const SLAP_DUR = 0.7, SLAP_HIT = 0.28;
const THROW_DUR = 0.5, THROW_RELEASE = 0.22;
const EAT_DUR = 1.4, EAT_BITES = [0.3, 0.65, 1.0];
const WAKE_DUR = 2.2, PLAYBOW_DUR = 1.1, NUZZLE_DUR = 1.4, SHAKE_DUR = 0.8;

function hexLin(hex, out) {
  let n = hex;
  if (typeof n === 'string') n = parseInt(n.replace('#', '').replace('0x', ''), 16);
  n = (+n || 0) >>> 0;
  out[0] = lin(((n >> 16) & 255) / 255); out[1] = lin(((n >> 8) & 255) / 255); out[2] = lin((n & 255) / 255);
  return out;
}

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

// Geometry + textures: built once, shared by every instance.
let ASSETS = null;
let ASSET_REFS = 0;

function buildAssets(THREE) {
  // ---- scratch (build time only) ----
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
    // masks for per-instance recolouring in the shader: x = dark fur (0 on the cream belly),
    // y = bib (throat/chest, up the lower flanks) + cheek patch (used by the friend variant)
    v.gx = t1;
    const bib = smooth(0.5, -0.05, s) * smooth(0.1, 0.19, z) * (1 - smooth(0.31, 0.35, z));
    const cheek = (1 - sat(Math.abs(elev - 0.3) / 0.55)) * smooth(0.275, 0.3, z) * (1 - smooth(0.345, 0.368, z));
    v.gy = Math.max(bib, cheek);
  }

  function limbVert(v) {
    v.gx = 1; v.gy = 0;
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
  const furGeo = finish(furB, { skin: true, glow: true });

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
  loft(leaB, LOWER_BILL_ST, { sub: 3, segs: 20, uScale: 3, vScale: 14, nTop: 3, nBot: 2.2, vert: lowerBillVert, bone: B_JAW });

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

  return { furGeo, leatherGeo, eyeGeo, furMap, furNormal, leatherNormal, eyeY, spurTip, eyeX, bodySkin };
}

// opts (optional): { variant: "player" | "friend" | "tribe" | "king", scale, fur, belly, bill } — the last three are hex
// overrides. "tribe" also takes { seed, elder, young, paint, collar } (LEVELS2.md B3).
export function createPlatypus(THREE, opts) {
  const A = ASSETS || (ASSETS = buildAssets(THREE));
  ASSET_REFS++;
  const { furGeo, leatherGeo, eyeGeo, furMap, furNormal, leatherNormal, eyeY, spurTip } = A;
  opts = opts || {};
  const variant = opts.variant === 'friend' ? 'friend' : opts.variant === 'tribe' ? 'tribe' : opts.variant === 'king' ? 'king' : 'player';
  const isFriend = variant === 'friend';
  const isTribe = variant === 'tribe', isKing = variant === 'king';
  const VX = variantSetup(variant, opts); // tribe / king looks (null for the player and the friend)
  const SC = opts.scale > 0 ? +opts.scale : isFriend ? 0.9 : VX ? VX.scale : 1;

  const group = new THREE.Group();
  group.name = isFriend ? 'platypusFriend' : isTribe ? 'platypusTribe' : isKing ? 'platypusKing' : 'platypus';

  // per-instance colouring: multipliers over the baked vertex colours (all 1 for the player, so the
  // level-1 look is untouched). The friend is a lighter, warmer chestnut with a cream bib and cheeks,
  // a paler bill with one pink freckle, and a slightly rounder tail.
  const H3 = [0, 0, 0];
  const furTint = isFriend ? new THREE.Vector3(2.25, 1.9, 1.5) : new THREE.Vector3(1, 1, 1);
  const bellyTint = isFriend ? new THREE.Vector3(1.08, 1.06, 1.0) : new THREE.Vector3(1, 1, 1);
  const billTint = isFriend ? new THREE.Vector3(3.3, 2.85, 2.6) : new THREE.Vector3(1, 1, 1);
  if (VX) { furTint.fromArray(VX.furTint); bellyTint.fromArray(VX.bellyTint); billTint.fromArray(VX.billTint); }
  if (opts.fur !== undefined && opts.fur !== null) { hexLin(opts.fur, H3); furTint.set(H3[0] / lin(0.34), H3[1] / lin(0.23), H3[2] / lin(0.145)); }
  if (opts.belly !== undefined && opts.belly !== null) { hexLin(opts.belly, H3); bellyTint.set(H3[0] / lin(0.82), H3[1] / lin(0.72), H3[2] / lin(0.56)); }
  if (opts.bill !== undefined && opts.bill !== null) { hexLin(opts.bill, H3); billTint.set(H3[0] / lin(0.17), H3[1] / lin(0.175), H3[2] / lin(0.2)); }

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
    // extensions
    wet: { value: 0 },
    furTint: { value: furTint },
    bellyTint: { value: bellyTint },
    patch: { value: isFriend ? 0.9 : 0 },
    patchColor: { value: new THREE.Vector3(lin(0.93), lin(0.85), lin(0.68)) },
    tailRound: { value: isFriend ? 1 : 0 },
    billTint: { value: billTint },
    freckle: { value: isFriend ? 1 : 0 },
    // tribe / king looks (only the extended shaders read these)
    mark: { value: new THREE.Vector4(0, 0, 0, 0) },
    grey: { value: 0 },
    paint: { value: 0 },
    paintColor: { value: new THREE.Vector3(1, 1, 1) },
    king: { value: new THREE.Vector4(0, 0, 0, 0) }, // x silver ridge, y scars, z tail notch, w brow
  };
  if (VX) {
    U.mark.value.fromArray(VX.mark); U.grey.value = VX.grey; U.king.value.fromArray(VX.king);
    U.tailRound.value = VX.tailRound; U.rimFur.value.setRGB(VX.rim[0], VX.rim[1], VX.rim[2]);
    if (VX.paint !== null) { hexLin(VX.paint, H3); U.paint.value = 1; U.paintColor.value.set(H3[0], H3[1], H3[2]); }
  }

  const furMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.56, metalness: 0,
    map: furMap, normalMap: furNormal,
  });
  if (furNormal) furMat.normalScale.set(0.75, 0.75);
  furMat.onBeforeCompile = (sh) => {
    sh.uniforms.uBristle = U.bristle;
    sh.uniforms.uRimColor = U.rimFur;
    sh.uniforms.uWet = U.wet;
    sh.uniforms.uFurTint = U.furTint;
    sh.uniforms.uBellyTint = U.bellyTint;
    sh.uniforms.uPatch = U.patch;
    sh.uniforms.uPatchColor = U.patchColor;
    sh.uniforms.uTailRound = U.tailRound;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uBristle;\nuniform float uTailRound;\nattribute vec2 aGlow;\nvarying vec2 vPlatyMask;\nfloat platyHash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlatyMask = aGlow;\n{ float ph = platyHash(floor(position * 420.0)); transformed += objectNormal * (uBristle * 0.015 * ph);\n  float tw = uTailRound * (1.0 - smoothstep(-0.36, -0.27, position.z));\n  transformed.x *= 1.0 + 0.15 * tw;\n  transformed.z = mix(transformed.z, -0.36 + (transformed.z + 0.36) * 0.84, tw); }');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uBristle;\nuniform float uWet;\nuniform vec3 uFurTint;\nuniform vec3 uBellyTint;\nuniform float uPatch;\nuniform vec3 uPatchColor;\nvarying vec2 vPlatyMask;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n{ vec3 pTexel = diffuseColor.rgb / max(vColor.rgb, vec3(0.002));\n  vec3 pBase = diffuseColor.rgb * mix(uBellyTint, uFurTint, vPlatyMask.x);\n  diffuseColor.rgb = mix(pBase, uPatchColor * pTexel, vPlatyMask.y * uPatch) * (1.0 - 0.4 * uWet); }')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.2, uWet * 0.85);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float prim = 1.0 - saturate(dot(normalize(vViewPosition), normal));\n  float prim2 = prim * prim;\n  totalEmissiveRadiance += uRimColor * (prim2 * sqrt(prim)) * (0.35 + diffuseColor.rgb * 2.2);\n  totalEmissiveRadiance += vec3(0.2, 0.5, 1.0) * (uBristle * 0.55 * prim2); }');
  };
  if (VX) {
    const baseFur = furMat.onBeforeCompile;
    furMat.onBeforeCompile = (sh) => {
      baseFur(sh);
      sh.uniforms.uMark = U.mark; sh.uniforms.uGrey = U.grey; sh.uniforms.uPaint = U.paint; sh.uniforms.uPaintColor = U.paintColor; sh.uniforms.uKing = U.king;
      sh.vertexShader = sh.vertexShader
        .replace('varying vec2 vPlatyMask;', FUR_X_VERT_DECL)
        .replace('vPlatyMask = aGlow;', FUR_X_VERT_MAIN);
      sh.fragmentShader = sh.fragmentShader
        .replace('varying vec2 vPlatyMask;', FUR_X_FRAG_DECL)
        .replace('#include <roughnessmap_fragment>', FUR_X_FRAG_MAIN);
    };
  }
  furMat.customProgramCacheKey = () => (VX ? 'platypus-fur-2x' : 'platypus-fur-2');

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
    sh.uniforms.uWet = U.wet;
    sh.uniforms.uBillTint = U.billTint;
    sh.uniforms.uFreckle = U.freckle;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aGlow;\nvarying vec2 vPlatyGlow;\nvarying vec3 vPlatyPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlatyGlow = aGlow;\nvPlatyPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPlatyGlow;\nvarying vec3 vPlatyPos;\nuniform float uBillGlow;\nuniform float uSpurGlow;\nuniform vec3 uBillColor;\nuniform vec3 uSpurColor;\nuniform vec3 uRimColor;\nuniform float uWet;\nuniform vec3 uBillTint;\nuniform float uFreckle;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n{ float pBill = step(0.01, vPlatyGlow.x);\n  diffuseColor.rgb *= mix(vec3(1.0), uBillTint, pBill);\n  float pFr = uFreckle * pBill * step(0.05, vPlatyPos.y) * (1.0 - smoothstep(0.0055, 0.0105, length(vPlatyPos.xz - vec2(0.024, 0.43))));\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.17, 0.17), pFr); }')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.16, uWet * 0.7);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float prim = 1.0 - saturate(dot(normalize(vViewPosition), normal));\n  totalEmissiveRadiance += uRimColor * (prim * prim * prim);\n  totalEmissiveRadiance += uBillColor * (vPlatyGlow.x * uBillGlow * (0.55 + 0.9 * prim));\n  totalEmissiveRadiance += uSpurColor * (vPlatyGlow.y * uSpurGlow); }');
  };
  if (VX) {
    const baseLeather = leatherMat.onBeforeCompile;
    leatherMat.onBeforeCompile = (sh) => {
      baseLeather(sh);
      sh.uniforms.uPaint = U.paint; sh.uniforms.uPaintColor = U.paintColor; sh.uniforms.uKing = U.king;
      sh.fragmentShader = sh.fragmentShader
        .replace('uniform float uFreckle;', 'uniform float uFreckle;\nuniform float uPaint;\nuniform vec3 uPaintColor;\nuniform vec4 uKing;')
        .replace('#include <roughnessmap_fragment>', LEATHER_X_FRAG_MAIN);
    };
  }
  leatherMat.customProgramCacheKey = () => (VX ? 'platypus-leather-2x' : 'platypus-leather-2');

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });

  // ---------------------------------------------------------------------------------------------
  // Skeleton
  // ---------------------------------------------------------------------------------------------
  const scaler = new THREE.Group(); // per-instance size; the skeleton is bound at scale 1 and scaled afterwards
  scaler.name = 'platypusScale';
  group.add(scaler);
  const rig = new THREE.Group();
  rig.name = 'platypusRig';
  rig.rotation.order = 'YXZ';
  scaler.add(rig);
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

  const jaw = mkBone('jaw', J_JAW, head, J.head); // index B_JAW: must stay the bone after the twelve leg bones

  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones); // inverses from the bind pose above (leg bones bind at identity)
  scaler.scale.setScalar(SC);
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
  // Extension anchors (LEVELS.md B1)
  // ---------------------------------------------------------------------------------------------
  const tailTip = new THREE.Object3D();
  tailTip.name = 'tailTip';
  tailTip.position.set(0, -0.013, -0.106);
  tail3.add(tailTip);
  const ballAnchor = new THREE.Object3D();
  ballAnchor.name = 'ballAnchor';
  ballAnchor.position.set(0, -0.017, 0.152);
  head.add(ballAnchor);
  // between the front paws, under the bill. Rides on the chest so a carried thing bobs with the walk and
  // follows the throw wind-up; with the carry pose blended in it sits at about (0, 0.17, 0.4) in the group.
  const HOLD_Y = -0.138, HOLD_Z = 0.195;
  const holdAnchor = new THREE.Object3D();
  holdAnchor.name = 'holdAnchor';
  holdAnchor.position.set(0, HOLD_Y, HOLD_Z);
  holdAnchor.rotation.x = 0.29;
  chest.add(holdAnchor);

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
  const tE = new THREE.Vector3(), tP = new THREE.Vector3(), tB = new THREE.Vector3();
  const bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3();
  const mB = new THREE.Matrix4(), mChest = new THREE.Matrix4();
  const air = { x: 0, y: 0, z: 0 };

  // ---- extension state ----
  // X: additive pose channels, cleared every frame and filled by the swim / pose / look / action layers.
  // Conventions: pitch + = nose down, yaw + = nose to the animal's left (+X), roll + = right side down,
  // tailX + = tail up, tailY + = tail to the right (-X).
  const X = {
    rigX: 0, rigY: 0, rigZ: 0, rigPitch: 0, rigYaw: 0, rigRoll: 0, pivY: 0.115, pivZ: 0,
    hipX: 0, hipY: 0, hipZ: 0, pitch: 0, hipYaw: 0, roll: 0, sq: 0, curl: 0, sYaw: 0, sRoll: 0,
    neckX: 0, neckY: 0, neckZ: 0, headX: 0, headY: 0, headZ: 0,
    tailX: 0, t1x: 0, t2x: 0, t3x: 0, tailY: 0, tailZ: 0, tailSrc: 0, nodT: 0, tpT: 0,
    air: 0, airK: 0, lid: 0, lidHard: 0, noBlink: 0, quiet: 0, noBreath: 0, breath: 0, bristle: 0,
    jaw: 0, spur: 0, tailStill: 0, glow: 0,
  };
  function clearX() {
    X.rigX = X.rigY = X.rigZ = X.rigPitch = X.rigYaw = X.rigRoll = 0; X.pivY = 0.115; X.pivZ = 0;
    X.hipX = X.hipY = X.hipZ = X.pitch = X.hipYaw = X.roll = X.sq = X.curl = X.sYaw = X.sRoll = 0;
    X.neckX = X.neckY = X.neckZ = X.headX = X.headY = X.headZ = 0;
    X.tailX = X.t1x = X.t2x = X.t3x = X.tailY = X.tailZ = X.tailSrc = X.nodT = X.tpT = 0;
    X.air = X.airK = X.lid = X.lidHard = X.noBlink = X.quiet = X.noBreath = X.breath = X.bristle = 0;
    X.jaw = X.spur = X.tailStill = X.glow = 0;
    for (let i = 0; i < 4; i++) { const o = FO[i]; o.rw = 0; o.bw = 0; o.w = 0; o.pw = 0; }
  }
  // per-foot overrides: a rig-space target (rw) and a body-relative one (bw: chest space for the front
  // feet, hips space for the hind feet), composited "over" in call order, plus pitch / yaw / web spread.
  const FO = [];
  for (let i = 0; i < 4; i++) FO.push({ rw: 0, rx: 0, ry: 0, rz: 0, bw: 0, bx: 0, by: 0, bz: 0, w: 0, pitch: 0, yaw: 0, fold: 1, roll: 0, pw: 0, pvx: 0, pvy: 0, pvz: 0 });
  // knee / elbow direction override (rig space) for poses where the default sprawl would dig into the ground
  function footPole(i, w, x, y, z) { const o = FO[i]; o.pw = w > 1 ? 1 : w; o.pvx = x; o.pvy = y; o.pvz = z; }
  function footAux(o, w, pitch, yaw, fold, roll) {
    const nw = w + o.w * (1 - w), k = w / nw;
    if (o.w <= 0) o.roll = 0;
    o.pitch += (pitch - o.pitch) * k; o.yaw += (yaw - o.yaw) * k; o.fold += (fold - o.fold) * k; o.roll += ((roll || 0) - o.roll) * k; o.w = nw;
  }
  function footR(i, w, x, y, z, pitch, yaw, fold, roll) {
    if (!(w > 0.0005)) return;
    if (w > 1) w = 1;
    const o = FO[i];
    const nw = w + o.rw * (1 - w), k = w / nw;
    o.rx += (x - o.rx) * k; o.ry += (y - o.ry) * k; o.rz += (z - o.rz) * k; o.rw = nw;
    o.bw *= 1 - w;
    footAux(o, w, pitch, yaw, fold, roll);
  }
  function footB(i, w, x, y, z, pitch, yaw, fold, roll) {
    if (!(w > 0.0005)) return;
    if (w > 1) w = 1;
    const o = FO[i];
    const nw = w + o.bw * (1 - w), k = w / nw;
    o.bx += (x - o.bx) * k; o.by += (y - o.by) * k; o.bz += (z - o.bz) * k; o.bw = nw;
    footAux(o, w, pitch, yaw, fold, roll);
  }

  // one-shot actions
  const A_SPIN = 0, A_BACKFLIP = 1, A_TAILSTAND = 2, A_ROLL = 3, A_TWIRL = 4, A_WAVE = 5, A_BOW = 6, A_WATERLEAP = 7,
    A_DIVEFLIP = 8, A_TAILSPLASH = 9, A_SLAP = 10, A_THROW = 11, A_EAT = 12, A_WAKE = 13, A_PLAYBOW = 14, A_NUZZLE = 15, A_SHAKE = 16;
  let actId = -1, actName = '', actT = 0, actDur = 0, actApex = -1, actLand = -1, actDir = 1, dirFlip = 1;
  const evT = [null, null, null, null, null, null, null, null], evN = [null, null, null, null, null, null, null, null];
  let evC = 0;
  function pushEv(type, name) { if (evC < 8) { evT[evC] = type; evN[evC] = name; evC++; } }

  // persistent poses
  const P_SIT = 0, P_SAD = 1, P_LIMP = 2, P_STILL = 3, P_CURL = 4, P_BALANCE = 5, P_CARRIED = 6, P_SCARED = 7, P_CARRY = 8,
    P_SNEAK = 9, P_STRUGGLE = 10, P_AIM = 11, P_KNEEL = 12, P_PROUD = 13, P_WOUNDED = 14, P_N = 15;
  const POSE_ID = { sit: P_SIT, sad: P_SAD, limp: P_LIMP, still: P_STILL, curl: P_CURL, balance: P_BALANCE, carried: P_CARRIED, scared: P_SCARED,
    sneak: P_SNEAK, struggle: P_STRUGGLE, aim: P_AIM, kneel: P_KNEEL, proud: P_PROUD, wounded: P_WOUNDED };
  const PW = new Float32Array(P_N), PR = new Float32Array(P_N);
  for (let i = 0; i < P_N; i++) PR[i] = 2;
  PR[P_CARRY] = 1 / 0.2;
  let poseCur = -1, poseName = null, sleepOn = false, carrySet = false, carryState = false;
  let swimW = 0, diveW = 0, swimPh = 0, pitchLag = 0, muteFeet = 0;
  let lookOn = false, lookW = 0, lookYawS = 0, lookPitchS = 0;
  const lookTarget = new THREE.Vector3(), lookTmp = new THREE.Vector3();
  let eyeOverride = null;
  let wet = 0;
  // frame values shared with the layer functions
  let fT = 0, fR = 0, fDuty = 0.7, fDt = 0;

  // crossfade from a snapshot of the last drawn pose (used when a one-shot starts, restarts or ends)
  const xfBones = bones.concat([rig]);
  const xfP = [], xfQ = [], xfS = [];
  for (let i = 0; i < xfBones.length; i++) { xfP.push(new THREE.Vector3()); xfQ.push(new THREE.Quaternion()); xfS.push(new THREE.Vector3(1, 1, 1)); }
  const xfTmpQ = new THREE.Quaternion();
  let xfT = 1, xfDur = 0;
  function xfadeStart(dur) {
    for (let i = 0; i < xfBones.length; i++) {
      const b = xfBones[i];
      xfP[i].copy(b.position); xfQ[i].copy(b.quaternion); xfS[i].copy(b.scale);
    }
    xfT = 0; xfDur = dur;
  }

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
    radius: 0.35 * SC,
    // ---- LEVELS.md B1 extensions ----
    tricks: TRICKS,
    trick,
    get acting() { return actId >= 0; },
    onEvent: null,
    tailSlap,
    slapHitTime: SLAP_HIT,
    tailTip,
    holdAnchor,
    setCarry,
    throwAnim,
    throwReleaseTime: THROW_RELEASE,
    eat,
    eatBiteTimes: EAT_BITES,
    sleep,
    wakeStretch,
    pose,
    playBow,
    nuzzle,
    shake,
    lookAt,
    blink,
    setEyes,
    ballAnchor,
    setWet,
    // extras
    variant,
    scale: SC,
    get currentPose() { return poseName; },
    get sleeping() { return sleepOn; },
    get carrying() { return carrySet || carryState; },
    get wet() { return wet; },
    reset,
    length: 1.0 * SC,
    height: 0.27 * SC,
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

  // ---------------- extension API ----------------
  function startAct(id, name, dur, apex, land) {
    xfadeStart(0.12);
    actId = id; actName = name; actT = 0; actDur = dur; actApex = apex; actLand = land;
    dirFlip = -dirFlip; actDir = dirFlip;
    celebrating = false;
    return dur;
  }

  function trick(name) {
    const tr = TRICKS[name];
    if (!tr || TRICK_ID[name] === undefined) return 0;
    const ld = TRICK_LAND[name];
    return startAct(TRICK_ID[name], name, tr.dur, tr.apex, ld === undefined ? -1 : ld);
  }
  function tailSlap() { return startAct(A_SLAP, 'tailSlap', SLAP_DUR, -1, -1); }
  function throwAnim() { return startAct(A_THROW, 'throw', THROW_DUR, -1, -1); }
  function eat() { return startAct(A_EAT, 'eat', EAT_DUR, -1, -1); }
  function wakeStretch() { return startAct(A_WAKE, 'wakeStretch', WAKE_DUR, -1, -1); }
  function playBow() { return startAct(A_PLAYBOW, 'playBow', PLAYBOW_DUR, -1, -1); }
  function nuzzle() { return startAct(A_NUZZLE, 'nuzzle', NUZZLE_DUR, -1, -1); }
  function shake() { return startAct(A_SHAKE, 'shake', SHAKE_DUR, -1, -1); }

  function setCarry(on) { carrySet = !!on; }

  function sleep(on) {
    sleepOn = !!on;
    PR[P_CURL] = 1 / 1.2;
    if (sleepOn) celebrating = false;
  }

  function pose(name, blend) {
    const id = name !== null && name !== undefined && POSE_ID[name] !== undefined ? POSE_ID[name] : -1;
    const rate = 1 / Math.max(blend === undefined ? 0.5 : +blend || 0, 0.02);
    for (let i = 0; i < P_N; i++) {
      if (i === P_CARRY) continue; // driven by setCarry / s.carrying
      if (i === P_CURL && sleepOn && id !== P_CURL) continue; // sleep keeps its own slow blend
      if (i === id || i === poseCur || PW[i] > 0) PR[i] = rate;
    }
    poseCur = id;
    poseName = id >= 0 ? name : null;
    if (id >= 0) celebrating = false;
  }

  function lookAt(v) {
    if (v && typeof v.x === 'number') { lookTarget.set(v.x, v.y || 0, v.z || 0); lookOn = true; } else lookOn = false;
  }
  function blink() { if (blinkT < 0) blinkT = 0; }
  function setEyes(open) { eyeOverride = open === null || open === undefined ? null : sat(+open || 0); }
  function setWet(v) { wet = sat(+v || 0); }

  // back to the freshly-built state (levels call this from enter()/exit(); the caller still owns `group`)
  function reset() {
    actId = -1; evC = 0; xfT = 1; xfDur = 0;
    poseCur = -1; poseName = null; sleepOn = false; carrySet = false;
    for (let i = 0; i < P_N; i++) PW[i] = 0;
    swimW = diveW = 0; lookOn = false; lookW = lookYawS = lookPitchS = 0;
    eyeOverride = null; wet = 0; celebrating = false; celW = 0;
    stingT = zapT = hurtT = -1; stingEnded = true;
    q = qv = nod = nodV = tp = tpV = 0;
    resetFeet(0);
    resetExt();
  }

  function dispose() {
    furMat.dispose(); leatherMat.dispose(); eyeMat.dispose(); disposeExt();
    skeleton.dispose();
    ASSET_REFS--;
    if (ASSET_REFS <= 0 && ASSETS === A) {
      furGeo.dispose(); leatherGeo.dispose(); eyeGeo.dispose();
      if (furMap) furMap.dispose();
      if (furNormal) furNormal.dispose();
      if (leatherNormal) leatherNormal.dispose();
      ASSETS = null; ASSET_REFS = 0;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Layers. Each one only ADDS to X / sets foot overrides, so anything can play over anything.
  // ---------------------------------------------------------------------------------------------

  // Swimming: alternate front-foot rowing (the way a platypus really swims), hind feet folded back as
  // rudders, tail steering, body rocking into each stroke. Diving: the same stroke, harder and deeper,
  // eyes shut, a gentle dolphin ripple down the spine and tail.
  function swimLayer(w, dive, turnNow) {
    const amp = lerp(0.3, 1, sat(fR * 1.7));
    swimPh += lerp(0.85, 2.2, fR) * (1 + 0.3 * dive) * fDt;
    if (swimPh > 1024) swimPh -= 1024;
    const a0 = swimPh * TAU;
    for (let i = 0; i < 4; i++) {
      const f = feet[i];
      if (f.front) {
        const ph = a0 + (i === 1 ? PI : 0);
        const c = Math.cos(ph), sn = Math.sin(ph);
        const power = smooth(-0.15, 0.55, sn); // the foot is sweeping backwards
        const reach = amp * (1 + 0.25 * dive);
        footR(i, w,
          f.side * (0.2 + 0.04 * power * amp + 0.012 * dive),
          0.085 - 0.062 * power * reach + 0.015 * dive,
          f.hz + 0.015 + 0.115 * reach * c,
          lerp(0.1, 1.2, power), f.side * 0.3 * power, lerp(0.66, 1.32, power));
      } else {
        const steer = Math.max(0, f.side * turnNow * 3.2);
        const kick = Math.sin(a0 * 2 + (i === 3 ? PI : 0));
        footR(i, w,
          f.side * (0.148 - 0.02 * dive + 0.06 * steer),
          0.078 + 0.012 * dive + 0.008 * kick * amp,
          f.hz - 0.088 + 0.014 * kick * amp + 0.03 * steer,
          1.15 - 0.5 * steer, f.side * (0.45 + 0.5 * steer), 0.78 + 0.5 * steer);
      }
    }
    const surf = w * (1 - dive);
    X.rigY += surf * (-0.03 + 0.006 * Math.sin(fT * 2.1) + 0.005 * amp * Math.sin(a0 * 2 + 0.7));
    X.pitch += surf * (-0.035 + 0.012 * amp * Math.sin(a0 * 2));
    X.neckX += surf * -0.06; X.headX += surf * -0.05;
    X.sYaw += w * 0.034 * amp * Math.sin(a0 + 0.3);
    X.roll += w * 0.045 * amp * Math.sin(a0 + 0.9);
    X.neckY += w * -0.05 * amp * Math.sin(a0 + 0.3);
    X.tailSrc += w * 0.16 * amp * Math.sin(a0 - 1.3);
    X.tailX += w * -0.04;
    X.quiet += w * sat(fR * 3);
    if (dive > 0) {
      const dw = w * dive;
      X.curl += dw * 0.024 * amp * Math.sin(a0 * 2);
      X.tailX += dw * 0.12 * amp * Math.sin(a0 * 2 - 1.4);
      X.t3x += dw * 0.08 * amp * Math.sin(a0 * 2 - 2.3);
      X.neckX += dw * 0.03;
      if (dw > X.lidHard) X.lidHard = dw;
    }
    // follow-through when the caller pitches the whole animal (dives, surfacing)
    const dp = clamp(group.rotation.x - pitchLag, -0.5, 0.5);
    X.tailX -= w * dp * 0.85;
    X.neckX += w * dp * 0.25;
  }

  // Sitting up on the haunches: rump down, tail flat behind as a third leg, front paws hanging at the
  // chest. `skipPaw` leaves one front paw to the caller (the wave).
  function poseSit(w, skipPaw) {
    X.pitch -= 0.95 * w; X.hipY += 0.06 * w; X.hipZ -= 0.02 * w;
    X.curl += 0.15 * w; X.neckX += 0.25 * w; X.headX += 0.24 * w;
    X.t1x += 0.66 * w; X.t2x += 0.3 * w; X.t3x += 0.14 * w;
    X.roll += w * 0.014 * Math.sin(fT * 0.7);
    X.tailSrc += w * 0.1 * Math.sin(fT * 0.9 + 1);
    for (let i = 0; i < 4; i++) {
      const f = feet[i];
      if (f.front) {
        if (i !== skipPaw) footB(i, w, f.side * 0.075, -0.128 + 0.004 * Math.sin(fT * 1.9 + i), 0.09, 0.9, -f.side * 0.25, 0.85);
      } else footR(i, w, f.side * 0.2, ANKLE_H, f.hz + 0.1, 0, f.side * 0.2, 1);
    }
  }

  function poseSad(w) {
    const sigh = Math.pow(Math.max(0, Math.sin(fT * 0.55)), 6);
    X.neckX += w * (0.045 - 0.03 * sigh); X.headX += w * 0.04;
    X.hipY -= 0.008 * w; X.curl += 0.01 * w; X.tailX -= 0.07 * w; X.sq += 0.06 * w;
    X.breath += w * 0.03 * sigh;
    X.quiet += 0.9 * w; X.noBlink = Math.max(X.noBlink, w);
    // heavy lids and a slow, slow blink
    const u = frac(fT / 3.9);
    const slow = smooth(0, 0.07, u) * (1 - smooth(0.1, 0.19, u));
    X.lid = Math.max(X.lid, w * (0.34 + 0.66 * slow));
  }

  // Favouring the right hind leg: it is carried, toe barely touching; the body hops over the good leg.
  function poseLimp(w) {
    const HR = feet[3];
    const p = frac(phase - feet[2].off + 8);
    const hop = p < fDuty ? Math.sin(PI * p / fDuty) : 0;
    footR(3, 0.85 * w, HR.hx * 0.84, 0.046 - 0.016 * hop * walkW, HR.hz + 0.05, 0.55, 0, 0.82);
    X.roll -= 0.065 * w; X.hipX += 0.014 * w; X.tailY += 0.14 * w;
    X.hipY += w * walkW * (0.006 - 0.02 * hop);
    X.pitch += w * walkW * 0.035 * hop;
    X.nodT += w * walkW * 0.11 * hop;
    X.tpT += w * walkW * 0.1 * hop;
  }

  // Lying on its side, limp. Nothing in here depends on time: once blended in it does not move at all.
  function poseStill(w) {
    X.rigRoll += 1.42 * w; X.rigY += 0.022 * w;
    X.neckY -= 0.04 * w; X.headY -= 0.03 * w; X.headX += 0.08 * w; X.sYaw -= 0.02 * w; X.neckZ -= 0.24 * w; X.headZ -= 0.3 * w;
    X.curl += 0.03 * w;
    X.tailY += 0.3 * w; X.tailZ -= 0.6 * w; X.tailX -= 0.05 * w;
    for (let i = 0; i < 4; i++) {
      const f = feet[i];
      if (f.side > 0) footR(i, w, 0.04, f.front ? 0.004 : -0.004, f.hz + (f.front ? 0.055 : 0.045), 0.5, -0.5, 0.85, -0.9);
      else footR(i, w, -0.098, f.front ? -0.03 : -0.036, f.hz + (f.front ? 0.07 : 0.03), 0.05, f.toe, 0.85, -1.42);
      // limp limbs: elbows and knees fall towards the belly instead of sprawling
      footPole(i, w, f.side > 0 ? 0.1 : 0.35, -1, f.front ? -0.35 : 0.35);
    }
    X.quiet += w; X.noBreath = Math.max(X.noBreath, w); X.noBlink = Math.max(X.noBlink, w);
    if (w > X.lidHard) X.lidHard = w;
  }

  // Asleep: belly down, curled into a ring to the right, bill tucked in, tail folded forward over the
  // nose, feet tucked under, slow deep breaths and the odd dream twitch.
  function poseCurl(w) {
    const br = Math.sin(fT * 1.25);
    X.hipY -= (0.015 - 0.003 * br) * w; X.hipX += 0.1 * w;
    X.roll += 0.08 * w; X.sRoll -= 0.02 * w;
    X.sYaw -= 0.56 * w; X.neckY -= 0.6 * w; X.headY -= 0.5 * w;
    X.neckX += 0.0 * w; X.headX += 0.0 * w; X.headZ += 0.1 * w;
    X.tailY += 2.85 * w; X.t2x += 0.2 * w; X.t3x += 0.3 * w;
    const tw = Math.pow(Math.max(0, Math.sin(fT * 0.83 + 1)), 40) * Math.sin(fT * 31);
    X.t3x += w * 0.05 * tw; X.tailY += w * 0.04 * tw;
    X.breath += w * 0.042 * br;
    for (let i = 0; i < 4; i++) {
      const f = feet[i];
      const inner = f.side < 0 ? 1 : 0;
      if (f.front) footB(i, w, f.side * (0.105 - 0.03 * inner), -0.068, 0.05, 0.12, -f.side * 0.3, 0.8);
      else footB(i, w, f.side * (0.12 - 0.035 * inner), -0.07 + (i === 3 ? 0.01 * tw : 0), 0.035, 0.12, -f.side * 0.2, 0.8);
    }
    X.quiet += w; X.noBreath = Math.max(X.noBreath, w); X.noBlink = Math.max(X.noBlink, w);
    if (w > X.lidHard) X.lidHard = w;
  }

  // A ball on the bill: head up, bill top level, quick little corrections, tail out as a counterweight.
  function poseBalance(w) {
    const c1 = Math.sin(fT * 5.1) * Math.sin(fT * 1.3 + 0.5), c2 = Math.sin(fT * 3.3 + 1);
    X.pitch -= 0.1 * w; X.neckX -= 0.2 * w; X.headX += 0.07 * w;
    X.headZ += w * 0.05 * c1; X.neckZ += w * 0.03 * c1; X.neckY += w * 0.04 * c2; X.hipX += w * 0.006 * c2;
    X.tailX += 0.12 * w; X.tailSrc += w * 0.28 * Math.sin(fT * 3.3 + 2.2);
    X.quiet += w;
  }

  // Held under the belly by a person: everything hangs, slow pendulum swing, now and then a wriggle.
  function poseCarried(w) {
    const wr = smooth(0.5, 0.85, Math.sin(fT * 0.9) * Math.sin(fT * 0.37 + 2));
    for (let i = 0; i < 4; i++) {
      const f = feet[i];
      const sw = 0.028 * Math.sin(fT * 1.6 + i * 2.1) + wr * 0.045 * Math.sin(fT * 13 + i * 1.57);
      footB(i, w, f.side * (f.front ? 0.125 : 0.13), -0.16 + 0.012 * Math.sin(fT * 2.3 + i * 1.7), (f.front ? 0.035 : -0.035) + sw, 0.75, 0, 0.9);
    }
    X.sYaw += w * wr * 0.07 * Math.sin(fT * 9); X.tailSrc += w * (0.25 * Math.sin(fT * 1.6 + 1) + wr * 0.6 * Math.sin(fT * 9 + 1.5));
    X.tailX -= 0.45 * w; X.curl += 0.05 * w; X.neckX -= 0.13 * w; X.headX -= 0.05 * w;
    X.breath += w * 0.008 * Math.sin(fT * 4.2);
  }

  // Frightened: pressed flat, quick shallow breaths, a tremble, the head darting between threats.
  function poseScared(w) {
    const dart = clamp(Math.sin(fT * 2.1) * 4, -1, 1) * 0.5 + clamp(Math.sin(fT * 1.3 + 2) * 5, -1, 1) * 0.5;
    X.hipY -= 0.012 * w; X.sq += 0.2 * w;
    X.neckX += 0.05 * w; X.headX -= 0.07 * w; X.tailX -= 0.02 * w;
    X.breath += w * 0.022 * Math.sin(fT * 10.5); X.noBreath = Math.max(X.noBreath, w);
    X.hipX += w * 0.0018 * Math.sin(fT * 61);
    X.headY += w * 0.26 * dart; X.neckY += w * 0.12 * dart;
    X.bristle = Math.max(X.bristle, 0.22 * w);
    X.quiet += w;
  }

  // Hold: reared up over the thing, both front paws and the bill tip pinning it at holdAnchor, tail on
  // the ground as a prop, and a rolling hind-leg waddle when it walks.
  function poseCarry(w) {
    X.pitch -= 0.5 * w; X.hipY += 0.014 * w; X.hipZ += 0.03 * w;
    X.curl += 0.07 * w; X.neckX += 0.03 * w; X.headX += 0.28 * w;
    X.t1x += 0.42 * w; X.t2x += 0.2 * w; X.t3x += 0.08 * w;
    const sq = Math.sin(fT * 2.2) * 0.003; // the paws keep adjusting their grip a little
    for (let i = 0; i < 2; i++) {
      const f = feet[i];
      footB(i, w, f.side * (0.088 + sq * f.side), HOLD_Y + 0.012, HOLD_Z - 0.02, 0.45, -f.side * 1.0, 1.15);
    }
    X.roll += w * rollP * 1.6 + w * walkW * 0.05 * Math.sin(phase * TAU + 0.5);
    X.hipYaw += w * yawP * 0.5;
    X.hipX += w * walkW * 0.012 * Math.sin(phase * TAU + 0.5);
    X.tailSrc += w * walkW * 0.3 * Math.sin(phase * TAU - 1.0);
    X.quiet += 0.7 * w;
  }

  function poseLayers(dt) {
    for (let i = 0; i < P_N; i++) {
      const target = i === poseCur || (i === P_CURL && sleepOn) || (i === P_CARRY && (carrySet || carryState)) ? 1 : 0;
      const step = PR[i] * dt;
      PW[i] += clamp(target - PW[i], -step, step);
    }
    let w;
    if ((w = PW[P_SIT]) > 0) poseSit(w * w * (3 - 2 * w), -1);
    if ((w = PW[P_SAD]) > 0) poseSad(w * w * (3 - 2 * w));
    if ((w = PW[P_LIMP]) > 0) poseLimp(w * w * (3 - 2 * w));
    if ((w = PW[P_BALANCE]) > 0) poseBalance(w * w * (3 - 2 * w));
    if ((w = PW[P_SCARED]) > 0) poseScared(w * w * (3 - 2 * w));
    if ((w = PW[P_CARRY]) > 0) poseCarry(w * w * (3 - 2 * w));
    if ((w = PW[P_CARRIED]) > 0) poseCarried(w * w * (3 - 2 * w));
    if ((w = PW[P_CURL]) > 0) poseCurl(w * w * (3 - 2 * w));
    if ((w = PW[P_STILL]) > 0) poseStill(w * w * (3 - 2 * w));
    muteFeet = (PW[P_CARRY] > 0.5 ? 3 : 0) | (PW[P_LIMP] > 0.5 ? 8 : 0) | (PW[P_STILL] + PW[P_CURL] + PW[P_CARRIED] + PW[P_SIT] > 0.5 ? 15 : 0);
    muteFeet |= extLayers(dt);
  }

  function lookLayer(dt) {
    let yawT = 0, pitchT = 0;
    if (lookOn) {
      lookTmp.copy(lookTarget);
      group.worldToLocal(lookTmp);
      const lx = lookTmp.x, lz = lookTmp.z - 0.2 * SC, ly = lookTmp.y - 0.1 * SC;
      yawT = clamp(Math.atan2(lx, lz), -1.22, 1.22);
      pitchT = clamp(-Math.atan2(ly, Math.sqrt(lx * lx + lz * lz) + 1e-4), -0.61, 0.61);
    }
    const live = (1 - sat(PW[P_STILL] * 2)) * (1 - sat(PW[P_CURL] * 2)) * (1 - sat(Math.abs(X.rigYaw) + Math.abs(X.rigPitch) + Math.abs(X.rigRoll)));
    lookW = damp(lookW, lookOn ? live : 0, 7, dt);
    lookYawS = damp(lookYawS, yawT, 8, dt);
    lookPitchS = damp(lookPitchS, pitchT, 8, dt);
    if (lookW < 0.001) return;
    const y = lookYawS * lookW, p = lookPitchS * lookW;
    X.sYaw += y * 0.05; X.neckY += y * 0.4; X.headY += y * 0.45;
    X.neckX += p * 0.42; X.headX += p * 0.5; X.curl += p * 0.027;
    X.headZ -= y * 0.06;
    X.quiet += 0.85 * lookW;
  }

  // the wet-dog shake: a roll wave that starts at the head and runs down the spine to the tail tip
  function shakeCurves(s, len, amp) {
    if (s <= 0 || s >= len) return;
    const env = smooth(0, 0.1, s) * (1 - smooth(len - 0.22, len, s)) * amp;
    const ph = s * TAU * lerp(10, 7.5, s / len);
    X.headZ += env * 0.5 * Math.sin(ph); X.neckZ += env * 0.26 * Math.sin(ph - 0.5);
    X.sRoll += env * 0.1 * Math.sin(ph - 1.0); X.roll += env * 0.17 * Math.sin(ph - 1.7);
    X.hipX += env * 0.006 * Math.sin(ph - 1.7);
    X.tailZ += env * 0.3 * Math.sin(ph - 2.6); X.tailY += env * 0.32 * Math.sin(ph - 3.0);
    X.headY += env * 0.08 * Math.sin(ph + 0.6);
    if (env > X.lid) X.lid = env > 1 ? 1 : env;
    X.bristle = Math.max(X.bristle, 0.5 * env);
  }

  // play-bow: forearms and chin on the floor, rump high, tail wagging
  function bowCurves(t, D, playful) {
    const an = bump(0, 0.07, 0.1, 0.2, t);
    const hold = smooth(0.34, 0.46, t) * (1 - smooth(D - 0.42, D - 0.3, t));
    let down = backOut(seg(0.12, 0.44, t), 1.3) * (1 - smooth(D - 0.38, D - 0.08, t));
    if (playful) down *= 1 + 0.1 * hold * Math.sin((t - 0.42) * TAU * 3.2);
    X.sq += 0.1 * an - 0.1 * bump(D - 0.22, D - 0.13, D - 0.09, D, t);
    X.pitch += 0.5 * down - 0.07 * an; X.hipY += 0.092 * down; X.hipZ -= 0.02 * down;
    X.curl -= 0.105 * down; X.neckX -= 0.2 * down - 0.06 * an; X.headX -= 0.13 * down;
    for (let i = 0; i < 2; i++) footR(i, down, feet[i].side * 0.15, ANKLE_H, 0.365, 0, -feet[i].side * 0.12, 1.25);
    X.tailX += 0.26 * down;
    const wag = hold * Math.sin(fT * (playful ? 19 : 15));
    X.tailY += (playful ? 0.5 : 0.24) * wag; X.roll += (playful ? 0.05 : 0.02) * wag;
    if (playful) { X.headZ += 0.22 * hold * Math.sin((t - 0.4) * TAU * 1.8); X.neckY += 0.1 * hold * Math.sin((t - 0.4) * TAU * 1.8 + 0.8); }
    X.lid = Math.max(X.lid, 0.35 * down);
    X.quiet += down > 1 ? 1 : down;
  }

  function actLayer() {
    const t = actT, D = actDur, d = actDir;
    switch (actId) {
      case A_SPIN: {
        const cr = bump(0, 0.09, 0.13, 0.24, t);
        const u = seg(0.15, 0.7, t), hop = 4 * u * (1 - u), lead = Math.sin(PI * u);
        X.sq += 0.4 * cr;
        X.rigY += 0.25 * hop; X.rigYaw += d * TAU * lerp(u, u * u * (3 - 2 * u), 0.55);
        X.air = Math.max(X.air, sat(hop * 3.5));
        X.rigRoll -= d * 0.15 * lead; X.pitch -= 0.08 * lead;
        X.sYaw += d * (0.1 * lead - 0.1 * cr); X.neckY += d * (0.24 * lead * (1 - u) - 0.14 * cr); X.headY += d * (0.2 * lead * (1 - u) - 0.1 * cr);
        X.tailSrc -= d * 0.6 * lead; X.tailX += 0.22 * lead;
        if (t > 0.7) { const s = t - 0.7, v = Math.exp(-s * 14) * Math.sin(s * 30); X.rigRoll += d * 0.05 * v; X.tailY += d * 0.22 * v; }
        break;
      }
      case A_BACKFLIP: {
        const cr = bump(0, 0.12, 0.16, 0.27, t);
        const u = seg(0.2, 0.86, t), hop = 4 * u * (1 - u);
        const throwB = bump(0, 0.06, 0.12, 0.32, u), tuck = bump(0.14, 0.4, 0.62, 0.9, u);
        X.sq += 0.5 * cr - 0.12 * throwB; X.pitch -= 0.05 * cr; X.neckX += 0.03 * cr; X.tailX -= 0.06 * cr;
        X.rigY += 0.9 * hop; X.rigPitch -= TAU * lerp(u, u * u * (3 - 2 * u), 0.75);
        X.air = Math.max(X.air, smooth(0, 0.08, u) * (1 - smooth(0.96, 1, u)));
        X.airK += u < 0.5 ? 1 - smooth(0.04, 0.34, u) : -smooth(0.7, 0.97, u);
        X.curl += 0.2 * tuck - 0.1 * throwB;
        X.neckX += -0.42 * throwB + 0.24 * tuck; X.headX += -0.26 * throwB + 0.15 * tuck;
        X.tailX += 0.5 * throwB - 0.32 * tuck + 0.3 * smooth(0.75, 1, u) * (1 - smooth(0.86, 1.04, t));
        break;
      }
      case A_TAILSTAND: {
        const cr = bump(0, 0.09, 0.13, 0.26, t);
        const fall = seg(1.24, 1.5, t);
        const up = backOut(seg(0.16, 0.58, t), 1.25) * (1 - fall * fall * (0.4 + 0.6 * fall));
        const hold = smooth(0.5, 0.64, t) * (1 - smooth(1.16, 1.28, t));
        const wb = Math.sin(fT * 5.3), wb2 = Math.sin(fT * 8.1 + 1);
        X.sq += 0.4 * cr - 0.1 * bump(0.2, 0.4, 0.5, 0.7, t) + 0.3 * bump(1.46, 1.51, 1.53, 1.6, t);
        X.neckX += 0.12 * cr;
        X.pivY = 0.04; X.pivZ = -0.24;
        X.rigPitch += -1.24 * up + hold * 0.045 * Math.sin(fT * 4.1 + 0.5);
        X.rigRoll += hold * (0.06 * wb + 0.03 * wb2);
        X.rigY += 0.085 * up;
        X.t1x += 0.14 * up; X.t2x += 0.5 * up; X.t3x += 0.6 * up;
        X.tailY -= hold * 0.3 * wb;
        X.curl += 0.12 * up; X.neckX += 0.4 * up; X.headX += 0.4 * up;
        X.air = Math.max(X.air, up > 1 ? 1 : up);
        for (let i = 0; i < 2; i++) {
          const sd = feet[i].side;
          footR(i, up, sd * 0.262, 0.075 + sd * 0.035 * hold * wb, 0.215 + 0.02 * hold * wb2, -0.2, sd * 0.5, 1.3);
        }
        break;
      }
      case A_ROLL: {
        const an = bump(0, 0.06, 0.09, 0.18, t);
        const u = seg(0.12, 0.74, t), rot = lerp(u, u * u * (3 - 2 * u), 0.6), ang = TAU * rot, s1 = Math.sin(PI * u);
        const sa = Math.sin(ang);
        X.rigRoll += d * (ang - 0.14 * an);
        X.rigY += 0.055 * sa * sa - 0.006 * s1; X.rigX -= d * 0.1 * s1;
        const tk = smooth(0, 0.12, u) * (1 - smooth(0.88, 1, u));
        X.air = Math.max(X.air, tk);
        // legs hug the body so it can roll over them
        for (let i = 0; i < 4; i++) {
          footR(i, tk, feet[i].side * 0.14, 0.05, feet[i].hz + (feet[i].front ? 0.03 : 0.02), 0.5, 0, 0.85);
          footPole(i, tk, feet[i].side * 0.2, -1, feet[i].front ? -0.4 : 0.4);
        }
        X.sRoll += d * 0.1 * Math.sin(TAU * u); X.headZ += d * 0.26 * Math.sin(TAU * u); X.tailZ -= d * 0.3 * Math.sin(TAU * u);
        X.curl += 0.09 * s1;
        const belly = bump(0.3, 0.42, 0.58, 0.7, u);
        X.tailX += 0.3 * belly; X.lid = Math.max(X.lid, 0.6 * belly);
        if (belly > 0) {
          // belly up: all four feet pedal at the sky
          for (let i = 0; i < 4; i++) {
            const f = feet[i];
            footR(i, belly, f.side * 0.17, 0.0 + 0.03 * Math.sin(fT * 26 + i * 1.9), f.hz + (f.front ? 0.04 : 0.02) + 0.03 * Math.cos(fT * 26 + i * 1.9), 0.3, 0, 1.25);
          }
        }
        if (t > 0.74) { const s = t - 0.74, v = Math.exp(-s * 16) * Math.sin(s * 34); X.rigRoll += d * 0.1 * v; X.tailY -= d * 0.2 * v; }
        break;
      }
      case A_TWIRL: {
        const cr = bump(0, 0.13, 0.17, 0.28, t);
        const u = seg(0.2, 1.0, t), hop = 4 * u * (1 - u), s1 = Math.sin(PI * u);
        X.sq += 0.55 * cr - 0.13 * bump(0, 0.06, 0.1, 0.3, u);
        X.sYaw += d * (0.08 * s1 - 0.14 * cr); X.neckY += d * (0.3 * s1 - 0.16 * cr);
        X.rigY += 1.1 * hop; X.rigYaw += d * 2 * TAU * lerp(u, u * u * (3 - 2 * u), 0.45);
        X.rigPitch += -0.55 * smooth(0, 0.06, u) * (1 - smooth(0.05, 0.48, u)) + 0.3 * bump(0.5, 0.74, 0.84, 1, u);
        X.rigRoll -= d * 0.13 * s1;
        X.air = Math.max(X.air, smooth(0, 0.05, u) * (1 - smooth(0.96, 1, u)));
        X.airK += u < 0.5 ? 1 - smooth(0.05, 0.4, u) : -smooth(0.66, 0.97, u);
        X.tailSrc -= d * 0.5 * s1; X.tailX += 0.3 * s1; X.curl += 0.08 * bump(0.25, 0.45, 0.55, 0.8, u);
        X.lid = Math.max(X.lid, 0.4 * bump(0.3, 0.45, 0.6, 0.75, u));
        break;
      }
      case A_WAVE: {
        const up = smooth(0.02, 0.3, t) * (1 - smooth(0.84, 1.06, t));
        const paw = d > 0 ? 0 : 1, sd = feet[paw].side;
        const wv = bump(0.2, 0.36, 0.8, 0.95, t), osc = Math.sin((t - 0.3) * TAU * 3.3);
        X.sq += 0.2 * bump(0, 0.05, 0.08, 0.18, t) + 0.2 * bump(0.98, 1.03, 1.05, 1.1, t);
        poseSit(up, paw);
        footB(paw, up * (1 - wv), sd * 0.075, -0.128, 0.09, 0.9, -sd * 0.25, 0.85);
        footB(paw, up * wv, sd * (0.172 + 0.042 * osc), 0.03 + 0.012 * Math.abs(osc), 0.135, -0.75, sd * 0.25 + 0.55 * osc, 1.35);
        X.headZ -= sd * 0.2 * wv; X.headY += sd * 0.16 * wv; X.neckX -= 0.1 * wv;
        X.roll += 0.03 * osc * wv; X.tailSrc += 0.35 * osc * wv;
        X.lid = Math.max(X.lid, 0.45 * wv); X.quiet += up;
        break;
      }
      case A_BOW: bowCurves(t, D, false); break;
      case A_PLAYBOW: bowCurves(t, D, true); break;
      case A_WATERLEAP: {
        const sink = bump(0, 0.09, 0.13, 0.24, t);
        const u = seg(0.15, 1.12, t), hop = 4 * u * (1 - u);
        const out = 1 - smooth(1.14, 1.38, t);
        X.rigY += -0.07 * sink + 1.3 * hop - 0.17 * bump(1.08, 1.2, 1.24, 1.4, t);
        X.rigPitch += lerp(-0.4 * sink, -1.15 * Math.cos(PI * u), smooth(0.12, 0.2, t)) * out;
        X.rigZ += 0.22 * smooth(0.3, 1, u) * out;
        X.rigRoll += d * 0.14 * Math.sin(PI * u);
        X.curl += -0.07 * bump(0, 0.05, 0.2, 0.42, u) + 0.16 * bump(0.36, 0.5, 0.6, 0.86, u);
        X.tailX += -0.4 * bump(0, 0.03, 0.08, 0.26, u) + 0.36 * bump(0.38, 0.5, 0.56, 0.78, u) - 0.15 * bump(0.8, 0.95, 1, 1.1, u);
        X.neckX += -0.1 * bump(0, 0.1, 0.3, 0.5, u) + 0.16 * bump(0.5, 0.7, 0.92, 1, u);
        const tuckW = bump(0.1, 0.2, 1.2, 1.38, t);
        for (let i = 0; i < 4; i++) {
          const f = feet[i];
          footR(i, tuckW, f.side * (f.front ? 0.165 : 0.14), 0.085, f.hz - (f.front ? 0.1 : 0.1), 1.25, f.side * 0.3, 0.68);
        }
        X.lid = Math.max(X.lid, smooth(0.9, 1, u) * out);
        X.quiet += 1;
        break;
      }
      case A_DIVEFLIP: {
        const u = seg(0.06, 0.9, t), ang = TAU * lerp(u, u * u * (3 - 2 * u), 0.7);
        const tuck = bump(0.04, 0.3, 0.68, 0.96, u);
        X.rigPitch += ang;
        X.rigY -= 0.11 * (1 - Math.cos(ang)) * 0.5; X.rigZ += 0.07 * Math.sin(ang);
        X.curl += 0.2 * tuck; X.neckX += 0.2 * tuck; X.headX += 0.1 * tuck;
        X.tailX += -0.36 * tuck + 0.5 * bump(0.72, 0.9, 0.96, 1.12, u) * (1 - smooth(0.9, 1, t));
        X.rigRoll += d * 0.1 * Math.sin(ang * 0.5);
        const pull = bump(0, 0.04, 0.1, 0.36, u); // one big double-handed pull to start the turn
        for (let i = 0; i < 2; i++) footR(i, tuck, feet[i].side * (0.2 + 0.03 * pull), 0.07 - 0.04 * pull, feet[i].hz + 0.11 - 0.2 * smooth(0, 0.34, u), 0.3 + 0.9 * pull, feet[i].side * 0.3, 0.75 + 0.55 * pull);
        for (let i = 2; i < 4; i++) footR(i, tuck, feet[i].side * 0.15, 0.085, feet[i].hz - 0.02, 1.0, feet[i].side * 0.3, 0.75);
        X.lidHard = 1; X.quiet += 1;
        break;
      }
      case A_TAILSPLASH: {
        const wind = smooth(0, 0.24, t), sl = seg(0.265, 0.35, t), slap = sl * sl;
        const rec = 1 - smooth(0.42, 0.76, t);
        const ang = 1.15 * wind * (1 - slap) - 0.26 * slap * rec;
        X.t1x += ang * 0.42; X.t2x += ang * 0.33; X.t3x += ang * 0.25;
        X.pitch += 0.2 * wind * (1 - slap) - 0.1 * bump(0.33, 0.38, 0.42, 0.62, t);
        X.rigY += 0.03 * wind * (1 - slap) - 0.045 * bump(0.33, 0.38, 0.42, 0.72, t);
        X.neckX -= 0.16 * wind * (1 - slap) - 0.1 * bump(0.33, 0.38, 0.42, 0.6, t);
        X.tailY += d * 0.12 * wind * (1 - slap);
        if (t > 0.35) { const s = t - 0.35; X.tailX += 0.12 * Math.exp(-s * 9) * Math.sin(s * 26); }
        X.lid = Math.max(X.lid, 0.85 * bump(0.3, 0.36, 0.45, 0.6, t));
        break;
      }
      case A_SLAP: {
        const coil = bump(0, 0.07, 0.09, 0.18, t);
        const w1 = seg(0.08, SLAP_HIT, t), w2 = seg(0.4, 0.68, t);
        const h1 = Math.sin(PI * w1), h2 = Math.sin(PI * w2);
        X.rigYaw += d * PI * (w1 * w1 + w2 * w2 * (3 - 2 * w2));
        X.rigY += 0.06 * h1 + 0.03 * h2; X.air = Math.max(X.air, 0.9 * h1, 0.7 * h2);
        X.sq += 0.3 * coil + 0.3 * bump(0.27, 0.3, 0.33, 0.46, t);
        const lagc = bump(0.04, 0.15, 0.22, 0.275, t);
        const crack = smooth(0.225, SLAP_HIT, t) * (1 - smooth(0.42, 0.62, t));
        X.tailY += d * (-1.0 * lagc + 0.55 * crack);
        X.tailX += 0.5 * bump(0.04, 0.14, 0.2, 0.27, t) - 0.2 * crack;
        X.sYaw += d * (0.1 * h1 - 0.1 * coil + 0.06 * crack); X.neckY += d * (0.3 * coil + 0.22 * h1 * (1 - w1) - 0.2 * crack); X.headY += d * 0.16 * coil;
        X.rigRoll -= d * 0.1 * h1; X.pitch += 0.06 * crack;
        if (t > SLAP_HIT) {
          // the stop is dead and stiff: a short, fast shudder instead of a floppy follow-through
          const s = t - SLAP_HIT, v = Math.exp(-s * 22) * Math.sin(s * 95);
          X.tailY += d * 0.07 * v; X.rigRoll += 0.035 * v; X.hipX += 0.004 * v; X.t3x += 0.05 * v;
        }
        X.quiet += 1;
        break;
      }
      case A_THROW: {
        const wind = bump(0, 0.13, 0.16, 0.22, t);
        const fl = smooth(0.165, 0.235, t) * (1 - smooth(0.3, 0.5, t));
        // rock back and up with the load, then snap chest and paws forward to fling it
        X.pitch += -0.14 * wind + 0.03 * fl; X.neckX += -0.2 * wind + 0.14 * fl; X.headX += -0.16 * wind - 0.08 * fl;
        X.curl += -0.03 * wind; X.hipZ += -0.035 * wind + 0.075 * fl; X.hipY += 0.012 * fl;
        X.sq += 0.2 * wind - 0.16 * fl; X.t1x += 0.14 * wind - 0.05 * fl; X.tpT += 0.3 * fl;
        for (let i = 0; i < 2; i++) footB(i, fl * 0.95, feet[i].side * 0.1, -0.085, 0.2, 0.1, -feet[i].side * 0.4, 1.3);
        if (t > THROW_RELEASE) { const s = t - THROW_RELEASE, v = Math.exp(-s * 12) * Math.sin(s * 28); X.neckX += 0.08 * v; X.tailX += 0.1 * v; }
        break;
      }
      case A_EAT: {
        const down = smooth(0, 0.2, t) * (1 - smooth(1.14, 1.36, t));
        let jab = 0, chew = 0, lift = 0, tilt = 0;
        for (let k = 0; k < 3; k++) {
          const s = t - EAT_BITES[k];
          jab += Math.exp(-(s * s) / 0.0022);
          if (s > 0.05 && s < 0.34) {
            const e = smooth(0.05, 0.1, s) * (1 - smooth(0.26, 0.34, s));
            chew += e * Math.sin(s * TAU * 9); lift += e; tilt += k === 1 ? -e : e;
          }
        }
        const g = 1 - 0.6 * swimW;
        // each bite: a quick forward jab at the food, then the head comes up, tips to one side and chews
        X.pitch += g * (0.02 * down + 0.025 * jab); X.curl += 0.005 * down;
        X.neckX += g * (0.04 * down + 0.03 * jab) - 0.24 * lift + 0.03 * chew - 0.17 * bump(1.1, 1.2, 1.25, 1.38, t);
        X.headX += g * (0.035 * down + 0.03 * jab) - 0.17 * lift + 0.085 * chew;
        X.hipZ += 0.03 * jab - 0.01 * lift; X.sq += 0.08 * jab;
        X.headZ += 0.17 * tilt; X.neckZ += 0.07 * tilt; X.headY += 0.06 * tilt;
        X.tailX += 0.1 * down; X.tailSrc += 0.3 * down * Math.sin(fT * 9);
        X.lid = Math.max(X.lid, 0.55 * (jab > 1 ? 1 : jab));
        X.quiet += down;
        break;
      }
      case A_WAKE: {
        // a yawn (head tips back, eyes screwed shut, one huge breath) ...
        const yawn = bump(0.05, 0.36, 0.55, 0.82, t);
        X.neckX -= 0.3 * yawn; X.headX -= 0.26 * yawn; X.breath += 0.05 * yawn; X.headZ += 0.1 * yawn * Math.sin(t * 3.2);
        X.lid = Math.max(X.lid, smooth(0.08, 0.28, t) * (1 - smooth(0.62, 0.86, t)));
        // ... the long front-paw stretch: paws walk out, chest down, rump up, toes spread, tail quivers ...
        const st = backOut(seg(0.66, 1.0, t), 1.1) * (1 - smooth(1.3, 1.56, t));
        X.pitch += 0.46 * st; X.hipY += 0.086 * st; X.hipZ -= 0.03 * st; X.curl -= 0.1 * st;
        X.neckX -= 0.13 * st; X.headX -= 0.1 * st;
        for (let i = 0; i < 2; i++) footR(i, st, feet[i].side * 0.14, ANKLE_H, 0.385, 0, -feet[i].side * 0.15, 1.38);
        X.tailX += 0.34 * st + 0.045 * st * Math.sin(fT * 38);
        X.lid = Math.max(X.lid, 0.75 * (st > 1 ? 1 : st));
        // ... and a shake to finish
        shakeCurves(t - 1.52, 0.56, 0.75);
        X.quiet += 1 - smooth(2.0, 2.2, t);
        break;
      }
      case A_NUZZLE: {
        const en = smooth(0, 0.3, t) * (1 - smooth(1.05, 1.4, t));
        const ph = (t - 0.2) * TAU * 1.9;
        X.hipZ += 0.045 * en; X.pitch += 0.03 * en; X.curl -= 0.02 * en;
        X.neckY += 0.28 * en * Math.sin(ph); X.headY += 0.2 * en * Math.sin(ph - 0.5);
        X.headZ += 0.38 * en * Math.sin(ph - 0.9); X.neckZ += 0.12 * en * Math.sin(ph - 0.6);
        X.neckX += en * (-0.05 + 0.07 * Math.sin(ph * 2)); X.headX += 0.05 * en * Math.cos(ph * 2);
        X.sYaw += 0.03 * en * Math.sin(ph - 1.4);
        X.tailSrc += 0.45 * en * Math.sin(t * TAU * 1.3); X.tailX += 0.08 * en;
        X.lid = Math.max(X.lid, 0.7 * en); X.quiet += en;
        break;
      }
      case A_SHAKE: {
        X.sq += 0.16 * bump(0, 0.05, 0.08, 0.16, t) - 0.08 * bump(0.68, 0.73, 0.75, 0.8, t);
        shakeCurves(t - 0.05, 0.68, 1);
        X.quiet += 1;
        break;
      }
      default: actLayerExt(); break;
    }
  }

  // =============================================================================================
  // LEVELS2.md B3 — extensions. Everything below only ADDS layers, one-shots and attachments; with
  // none of it used the model behaves exactly as before.
  // =============================================================================================
  const SPD_K = VX ? 1 / SC : 1;            // tribe / king sizes: feet must not skate at 0.55x or 3.2x
  const BREATH_W = isKing ? 1.05 : VX && VX.elder ? 1.5 : 1.9;
  const EYE_K = VX ? VX.eyeK : 1;
  if (VX) {
    if (VX.headScale !== 1) head.scale.setScalar(VX.headScale);
    eyes.scale.set(EYE_K, EYE_K, EYE_K);
  }

  // ---- anchors ----
  const crownAnchor = new THREE.Object3D();
  crownAnchor.name = 'crownAnchor';
  crownAnchor.position.set(0, 0.058, -0.006);
  head.add(crownAnchor);
  const capeAnchor = new THREE.Object3D();
  capeAnchor.name = 'capeAnchor';
  capeAnchor.position.set(0, 0.081, 0);
  chest.add(capeAnchor);
  const armorChest = new THREE.Object3D(); armorChest.name = 'armorChest'; chest.add(armorChest);
  const armorShoulderL = new THREE.Object3D(); armorShoulderL.name = 'armorShoulderL'; armorShoulderL.position.set(0.105, 0.03, 0.02); chest.add(armorShoulderL);
  const armorShoulderR = new THREE.Object3D(); armorShoulderR.name = 'armorShoulderR'; armorShoulderR.position.set(-0.105, 0.03, 0.02); chest.add(armorShoulderR);
  const armorTail = new THREE.Object3D(); armorTail.name = 'armorTail'; tail1.add(armorTail);
  const armorAnchors = { chest: armorChest, shoulderL: armorShoulderL, shoulderR: armorShoulderR, tail: armorTail };
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  const MUZZLE_BILL_Y = 0.092 - LOW - J.head[1] + 0.004, MUZZLE_BILL_Z = 0.5 - J.head[2] + 0.03;
  muzzle.position.set(0, MUZZLE_BILL_Y, MUZZLE_BILL_Z);
  head.add(muzzle);

  // ---- king-only parts: one milky eye, long venom spurs ----
  const extMats = [], extGeos = [];
  let kingSpurMat = null;
  if (isKing) {
    const mg = new THREE.SphereGeometry(EYE_R * 1.1, 10, 8);
    const mm = new THREE.MeshBasicMaterial({ color: 0xaebccb });
    const milky = new THREE.Mesh(mg, mm);
    milky.name = 'platypusMilkyEye';
    milky.position.set(-A.eyeX - 0.0006, 0, 0);
    eyes.add(milky);
    extGeos.push(mg); extMats.push(mm);
    const SPUR_L = 0.08;
    const sg = new THREE.ConeGeometry(0.0085, SPUR_L, 7, 3);
    kingSpurMat = new THREE.MeshStandardMaterial({ color: 0xd9cc9a, roughness: 0.32, metalness: 0, emissive: 0x000000 });
    extGeos.push(sg); extMats.push(kingSpurMat);
    const yUp = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? 1 : -1;
      dir.set(-side * 0.55, 0.42, -0.72).normalize();
      const m = new THREE.Mesh(sg, kingSpurMat);
      m.name = 'platypusKingSpur';
      m.castShadow = false;
      m.quaternion.setFromUnitVectors(yUp, dir);
      m.position.set(-side * 0.015, 0.004, -0.012).addScaledVector(dir, SPUR_L * 0.5 - 0.006);
      feet[2 + k].foot.add(m);
      (k === 0 ? spurL : spurR).position.set(-side * 0.015, 0.004, -0.012).addScaledVector(dir, SPUR_L - 0.008);
    }
  }
  // ---- tribe: a woven leaf collar ----
  if (VX && VX.collar !== null) {
    const cg = buildCollar(THREE);
    const cm = new THREE.MeshStandardMaterial({ color: VX.collar, vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
    const collar = new THREE.Mesh(cg, cm);
    collar.name = 'platypusCollar';
    collar.position.set(0, -J.chest[1], -J.chest[2]);
    chest.add(collar);
    extGeos.push(cg); extMats.push(cm);
  }

  // ---- state ----
  const A_EXT0 = 17;
  const A_POTION = 17, A_SCREAM = 18, A_FINISH = 19, A_SITUP = 20, A_CHEER = 21,
    A_SWEEP = 22, A_SLAM = 23, A_CHARGE = 24, A_POUND = 25, A_SPIT = 26, A_ROAR = 27, A_STAGGER = 28, A_FALL = 29, A_REAR = 30;
  const ATK_ID = { sweep: A_SWEEP, slam: A_SLAM, charge: A_CHARGE, pound: A_POUND, spit: A_SPIT, roar: A_ROAR, stagger: A_STAGGER, fall: A_FALL, rear: A_REAR };
  let actAT = 0, actW = 0, actWS = 1, actHoldAt = 0, actHold = 0, actHit = -1, actHitEv = null;
  let scrPow = 1, scrCtl = true, scrCharge = 0, scrW = 0;
  let aimOn = false, aimT = 0, aimS = 0, fireT = -1;
  let flaskOn = false, flaskW = 0;
  let galOn = false, galW = 0, galPh = 0, galSF = 0, galSH = 0;
  let colKind = 0, colT = 0;
  let weakGlow = 0;
  const flaskPos = new THREE.Vector3(), holdRest = new THREE.Vector3(0, HOLD_Y, HOLD_Z);
  let flaskMix = 0;
  // gear
  const GEAR_SLOTS = { body: ['leaf', 'suit'], head: ['boneHelm'], eyes: ['glasses'], weapon: ['blaster'], back: ['pack'] };
  const worn = { body: null, head: null, eyes: null, weapon: null, back: null };
  let gearMesh = null, gearMat = null;
  const UG = { show: { value: [0, 0, 0, 0, 0, 0, 0, 0] }, aim: { value: 0 }, kick: { value: 0 }, pivot: { value: new THREE.Vector3(GEAR_PIVOT[0], GEAR_PIVOT[1], GEAR_PIVOT[2]) }, glow: { value: 0.55 } };

  // anim time of a one-shot whose wind-up may be stretched (boss assist / phases) and which may hold a pose
  function animT(t) {
    if (actW > 0) { const wr = actW * actWS; if (t < wr) return t / actWS; t = actW + (t - wr); }
    if (actHold > 0 && t > actHoldAt) t = t < actHoldAt + actHold ? actHoldAt : t - actHold;
    return t;
  }
  function startExt(id, name, dur, hit, hitEv, W, WS, holdAt, hold) {
    actW = W > 0 ? W : 0; actWS = WS > 0 ? WS : 1; actHoldAt = holdAt || 0; actHold = hold > 0 ? hold : 0;
    actHit = hit; actHitEv = hitEv; actAT = 0;
    return startAct(id, name, dur + actW * (actWS - 1) + actHold, -1, -1);
  }
  function crossed(a0, a1, t) { return a0 < t && a1 >= t; }

  function actTimelineExt(t0) {
    const a0 = animT(t0), a1 = animT(actT);
    actAT = a1;
    if (actHit >= 0 && crossed(a0, a1, actHit)) pushEv(actHitEv, actName);
    switch (actId) {
      case A_FINISH:
        if (crossed(a0, a1, 0.62)) { qv += 7; nodV += 3; tpV -= 4; resetFeet(0.25); }
        break;
      case A_SCREAM:
        if (crossed(a0, a1, SCREAM_TIME)) { qv -= 5; nodV -= 4; tpV += 3; }
        break;
      case A_POTION:
        if (crossed(a0, a1, POTION_RELEASE)) { nodV += 2.5; qv -= 2; }
        break;
      case A_CHEER:
        if (crossed(a0, a1, 0.6) || crossed(a0, a1, 0.95)) { qv += 4; tpV -= 3; }
        if (crossed(a0, a1, 1.12)) { qv += 6; nodV += 2; resetFeet(0.2); }
        break;
      case A_SWEEP:
        if (crossed(a0, a1, 1.1)) { qv += 7; nodV += 3; resetFeet(0.3); }
        break;
      case A_SLAM:
        if (crossed(a0, a1, 1.0)) { qv += 8; tpV += 7; }
        if (crossed(a0, a1, 2.62)) { nodV -= 6; qv -= 4; resetFeet(0.2); }
        break;
      case A_POUND:
        if (crossed(a0, a1, 1.1)) { qv += 10; nodV += 3; tpV += 8; resetFeet(0.35); }
        if (crossed(a0, a1, 2.0)) { qv += 5; nodV += 2; }
        break;
      case A_SPIT:
        if (crossed(a0, a1, 0.8) || crossed(a0, a1, 1.0) || crossed(a0, a1, 1.2)) { nodV += 5; qv -= 2.5; tpV += 3; }
        break;
      case A_ROAR:
        if (crossed(a0, a1, 0.5)) { qv += 8; tpV += 6; resetFeet(0.3); }
        break;
      case A_FALL:
        if (crossed(a0, a1, 2.6)) { qv += 14; tpV += 9; }
        if (crossed(a0, a1, 2.94)) { tpV -= 7; }
        break;
      default: break;
    }
  }
  function actEndExt() {
    if (actId === A_FALL) {
      // he stays down: hand over to the motionless "still" pose without a blend
      for (let i = 0; i < P_N; i++) if (i !== P_CARRY) PW[i] = 0;
      PW[P_STILL] = 1; poseCur = P_STILL; poseName = 'still';
    } else if (actId === A_SITUP || actId === A_CHEER || actId === A_FINISH) resetFeet(0.1);
  }

  // ---- shared pose pieces ----
  // up on the hind legs with the tail as a prop (amt 1 = as upright as the sit)
  function rearUp(w, amt) {
    const k = w * amt;
    X.pitch -= 0.95 * k; X.hipY += 0.06 * k; X.hipZ -= 0.02 * k; X.curl += 0.12 * k;
    X.t1x += 0.66 * k; X.t2x += 0.3 * k; X.t3x += 0.14 * k;
    for (let i = 2; i < 4; i++) footR(i, w, feet[i].side * 0.205, ANKLE_H, feet[i].hz + 0.1 * amt, 0, feet[i].side * 0.22, 1.12);
  }
  function plantWide(w, k, zf) {
    for (let i = 0; i < 4; i++) {
      const f = feet[i];
      footR(i, w, f.hx * k, ANKLE_H, f.hz + (f.front ? zf : -zf * 0.6), 0, f.side * 0.14, 1.25);
    }
  }

  // ---- persistent poses (LEVELS2.md B3) ----
  function poseSneak(w) {
    X.hipY -= 0.02 * w; X.sq += 0.1 * w; X.neckX += 0.05 * w; X.headX -= 0.075 * w; X.tailX -= 0.05 * w;
    X.headY += w * 0.11 * Math.sin(fT * 0.85) * (1 - walkW * 0.6);
    if (w > X.tailStill) X.tailStill = w;
    X.quiet += 0.85 * w;
  }
  // carried and fighting it: every limb kicking, the body twisting in the grip, bursts and gasps
  function poseStruggle(w) {
    const burst = 0.6 + 0.4 * Math.sin(fT * 2.3) * Math.sin(fT * 0.71 + 1);
    for (let i = 0; i < 4; i++) {
      const f = feet[i];
      const k = Math.sin(fT * (11.5 + i * 1.3) + i * 1.9) * burst;
      footB(i, w, f.side * (f.front ? 0.135 : 0.14), -0.13 + 0.045 * Math.abs(k), (f.front ? 0.05 : -0.05) + 0.085 * k, 0.4 + 0.5 * k, f.side * 0.2, 1.28);
    }
    X.sYaw += w * 0.12 * burst * Math.sin(fT * 9.5); X.pitch += w * 0.09 * burst * Math.sin(fT * 7.3 + 1);
    X.roll += w * 0.13 * burst * Math.sin(fT * 8.1 + 2); X.curl += 0.04 * w;
    X.tailSrc += w * 0.9 * burst * Math.sin(fT * 10 + 1.5); X.tailX += w * (-0.25 + 0.32 * burst * Math.sin(fT * 11));
    X.neckX -= w * 0.2 * burst * (0.5 + 0.5 * Math.sin(fT * 5)); X.headY += w * 0.32 * burst * Math.sin(fT * 6.7);
    X.headZ += w * 0.2 * burst * Math.sin(fT * 7.9 + 0.7);
    X.jaw += w * 0.3 * Math.max(0, Math.sin(fT * 3.1));
    X.breath += w * 0.02 * Math.sin(fT * 9);
    if (0.35 * w > X.bristle) X.bristle = 0.35 * w;
    if (0.3 * w > X.lid) X.lid = 0.3 * w;
    X.quiet += w;
  }
  function poseAim(w) {
    X.hipY -= 0.008 * w; X.sq += 0.05 * w; X.pitch -= 0.03 * w; X.neckX -= 0.05 * w; X.headX += 0.02 * w;
    X.t1x -= 0.05 * w; X.tailX -= 0.04 * w;
    if (0.6 * w > X.tailStill) X.tailStill = 0.6 * w;
    if (0.22 * w > X.lid) X.lid = 0.22 * w; // sighting squint
    X.quiet += 0.8 * w;
  }
  // bowed before the elder: forearms and chin to the ground, eyes lowered, tail flat
  function poseKneel(w) {
    X.pitch += 0.33 * w; X.hipY += 0.058 * w; X.hipZ -= 0.015 * w; X.curl -= 0.05 * w;
    X.neckX += 0.03 * w; X.headX -= 0.06 * w; X.tailX -= 0.1 * w;
    for (let i = 0; i < 2; i++) footR(i, w, feet[i].side * 0.15, ANKLE_H, 0.335, 0, -feet[i].side * 0.12, 1.1);
    X.breath += w * 0.006 * Math.sin(fT * 1.4);
    if (0.6 * w > X.lid) X.lid = 0.6 * w;
    if (w > X.tailStill) X.tailStill = w;
    X.quiet += w;
  }
  // chest out, head high: a slow, heavy, sure-of-itself idle (the King)
  function poseProud(w) {
    const sv = Math.sin(fT * 0.31) * Math.sin(fT * 0.13 + 1);
    X.pitch -= 0.13 * w; X.hipY += 0.012 * w; X.curl -= 0.035 * w;
    X.neckX -= 0.2 * w; X.headX += 0.11 * w; X.tailX += 0.1 * w;
    X.headY += w * 0.2 * sv; X.neckY += w * 0.1 * sv;
    X.breath += w * 0.012 * Math.sin(fT * 1.05);
    X.tailSrc += w * 0.22 * Math.sin(fT * 0.6 + 2);
    if (0.2 * w > X.lid) X.lid = 0.2 * w;
    X.quiet += 0.8 * w;
  }
  // hurt: favouring the left foreleg, head low, heaving for breath, the tail dragging
  function poseWounded(w) {
    const hv = Math.sin(fT * 4.3);
    const FLf = feet[0];
    const p = frac(phase - feet[1].off + 8);
    const hop = p < fDuty ? Math.sin(PI * p / fDuty) : 0;
    footR(0, 0.8 * w, FLf.hx * 0.86, 0.04 - 0.012 * hop * walkW, FLf.hz + 0.03, 0.5, 0, 0.85);
    X.roll -= 0.07 * w; X.hipX -= 0.012 * w; X.hipY -= w * (0.008 + walkW * 0.016 * hop);
    X.neckX += w * (0.15 + 0.02 * hv); X.headX += 0.05 * w; X.pitch += w * (0.03 + 0.012 * hv + walkW * 0.03 * hop);
    X.breath += w * 0.03 * hv; X.tailX -= 0.1 * w; X.tailY += 0.12 * w;
    X.headZ += w * 0.05 * Math.sin(fT * 0.7);
    X.jaw += w * (0.14 + 0.06 * hv); // panting
    if (0.4 * w > X.lid) X.lid = 0.4 * w;
    X.quiet += 0.85 * w;
  }

  // ---- other persistent layers ----
  // THE SCREAM, charging: one long breath in — chest swelling, head drawn back, fur lifting, a tremble
  function screamChargeLayer(c) {
    const tr = Math.sin(fT * 61) * c * c;
    X.breath += 0.085 * c; X.sq -= 0.07 * c; X.pitch -= 0.09 * c; X.hipZ -= 0.028 * c;
    X.neckX -= 0.24 * c; X.headX -= 0.1 * c; X.curl -= 0.02 * c;
    X.tailX += 0.16 * c; X.hipX += 0.0016 * tr; X.headZ += 0.02 * tr;
    X.jaw += 0.1 * c;
    const b = c * (0.55 + 0.1 * Math.sin(fT * 37));
    if (b > X.bristle) X.bristle = b;
    if (0.35 * c > X.lid) X.lid = 0.35 * c;
    if (0.8 * c > X.tailStill) X.tailStill = 0.8 * c;
    X.noBreath = Math.max(X.noBreath, c);
    X.quiet += c;
  }
  // a flask held up in the right paw, ready to throw; the animal keeps walking on three legs
  function flaskLayer(w) {
    const sw = Math.sin(fT * 2.1) * 0.006;
    X.pitch -= 0.15 * w; X.hipY += 0.01 * w; X.curl += 0.02 * w; X.t1x += 0.2 * w; X.t2x += 0.08 * w;
    X.neckX += 0.07 * w; X.headX += 0.06 * w; X.sYaw += 0.03 * w; X.headY -= 0.1 * w;
    flaskPos.set(-0.155, 0.045 + sw, 0.03);
    footB(1, w, flaskPos.x, flaskPos.y, flaskPos.z, -0.75, 0.15, 1.1);
    X.quiet += 0.6 * w;
  }
  // the gallop of the charge: a bounding rotary gait, spine flexing, head down like a ram
  function gallopLayer(w, dt) {
    const big = sat((SC - 1) / 2.2);
    galPh += lerp(4.3, 2.55, big) * dt;
    if (galPh > 1024) galPh -= 1024;
    const a0 = galPh * TAU;
    for (let i = 0; i < 4; i++) {
      const f = feet[i];
      const th = a0 - (f.front ? 0 : 2.4) - (f.side > 0 ? 0.4 : 0);
      const sn = Math.sin(th), cs = Math.cos(th);
      const up = sn > 0 ? sn : 0; // swing: the foot is off the ground and travelling forward
      footR(i, w, f.hx * (1 + 0.08 * up), ANKLE_H + (f.front ? 0.09 : 0.075) * up, f.hz + (f.front ? 0.03 : -0.01) - (f.front ? 0.15 : 0.13) * cs,
        (f.front ? -0.55 : 0.6) * up, 0, 1 + 0.25 * up);
    }
    const sF = Math.sin(a0 - 0.2), sH = Math.sin(a0 - 2.6);
    if (galSF > 0 && sF <= 0 && w > 0.5 && api.onFootstep) { api.onFootstep(0, feet[0].hx * SC, (feet[0].hz + 0.18) * SC, 1); api.onFootstep(1, feet[1].hx * SC, (feet[1].hz + 0.18) * SC, 1); }
    if (galSH > 0 && sH <= 0 && w > 0.5 && api.onFootstep) { api.onFootstep(2, feet[2].hx * SC, (feet[2].hz + 0.12) * SC, 1); api.onFootstep(3, feet[3].hx * SC, (feet[3].hz + 0.12) * SC, 1); }
    galSF = sF; galSH = sH;
    X.pitch += w * 0.13 * Math.sin(a0 - 0.9); X.rigY += w * 0.05 * (0.5 + 0.5 * Math.sin(a0 - 0.5));
    X.curl += w * 0.065 * Math.sin(a0 - 1.9);
    X.neckX += w * (0.1 - 0.06 * Math.sin(a0 - 0.9)); X.headX -= w * 0.17;
    X.tailX += w * (0.32 + 0.2 * Math.sin(a0 - 2.7)); X.tailSrc += w * 0.25 * Math.sin(a0 * 0.5);
    X.roll += w * 0.03 * Math.sin(a0 * 0.5);
    if (0.35 * w > X.bristle) X.bristle = 0.35 * w;
    if (0.35 * w > X.lid) X.lid = 0.35 * w;
    X.quiet += w;
  }
  // down: "fall" buckles and rolls onto its side; "shot" is knocked sideways off its feet and slides
  function collapseLayer(dt) {
    colT += dt;
    const t = colT;
    if (colKind === 2) {
      const e = smooth(0, 0.2, t), sl = 1 - Math.exp(-t * 3.6), pop = Math.sin(PI * sat(t / 0.34));
      poseStill(e);
      X.rigX -= 0.34 * sl; X.rigYaw += 0.55 * sl; X.rigY += 0.1 * pop * (1 - 0.3 * e);
      X.rigRoll += 0.22 * Math.exp(-t * 5) * Math.sin(t * 14) * e;
      X.tailY += 0.5 * Math.exp(-t * 4) * Math.sin(t * 11);
    } else {
      const buckle = bump(0, 0.1, 0.16, 0.42, t), e = smooth(0.08, 0.5, t);
      X.sq += 0.35 * buckle; X.neckX += 0.2 * buckle;
      poseStill(e);
      if (t > 0.5 && t < 1.4) { const s = t - 0.5; X.rigY += 0.012 * Math.exp(-s * 9) * Math.abs(Math.sin(s * 16)); X.tailX += 0.1 * Math.exp(-s * 7) * Math.sin(s * 20); }
    }
    if (colT > 30) colT = 30;
  }

  // persistent extension layers; returns the feet whose footstep events are muted
  function extLayers(dt) {
    let w, mute = 0;
    if (VX && VX.elder) { X.neckX += 0.07; X.headX += 0.03; X.curl += 0.018; X.hipY -= 0.006; X.tailX -= 0.05; }
    if ((w = PW[P_SNEAK]) > 0) poseSneak(w * w * (3 - 2 * w));
    if ((w = PW[P_AIM]) > 0) poseAim(w * w * (3 - 2 * w));
    if ((w = PW[P_PROUD]) > 0) poseProud(w * w * (3 - 2 * w));
    if ((w = PW[P_WOUNDED]) > 0) { poseWounded(w * w * (3 - 2 * w)); if (w > 0.5) mute |= 1; }
    if ((w = PW[P_KNEEL]) > 0) { poseKneel(w * w * (3 - 2 * w)); if (w > 0.5) mute |= 3; }
    if ((w = PW[P_STRUGGLE]) > 0) { poseStruggle(w * w * (3 - 2 * w)); if (w > 0.5) mute |= 15; }
    // aim: head, neck (and the launcher, in the gear shader) twist toward the target
    aimS = damp(aimS, aimOn ? aimT : 0, 12.5, dt);
    if (aimS > 0.0005 || aimS < -0.0005) { X.sYaw += aimS * 0.06; X.neckY += aimS * 0.34; X.headY += aimS * 0.38; X.headZ -= aimS * 0.05; X.quiet += 0.5; }
    if (fireT >= 0) {
      fireT += dt;
      const k = Math.exp(-fireT * 24);
      X.hipZ -= 0.022 * k; X.pitch -= 0.03 * k; X.neckX += 0.05 * k;
      UG.kick.value = 0.03 * k;
      if (fireT > 0.3) { fireT = -1; UG.kick.value = 0; }
    }
    flaskW = damp(flaskW, flaskOn && !colKind ? 1 : 0, 10, dt);
    flaskMix = flaskW;
    if (flaskW > 0.002) { flaskLayer(flaskW); if (flaskW > 0.5) mute |= 2; }
    scrW = damp(scrW, colKind || actId === A_SCREAM ? 0 : scrCharge, 14, dt);
    if (scrW > 0.002) screamChargeLayer(scrW);
    galW = damp(galW, galOn && !colKind ? 1 : 0, 10, dt);
    if (galW > 0.002) { gallopLayer(galW, dt); mute |= 15; } else { galSF = galSH = 0; }
    if (colKind) { collapseLayer(dt); mute |= 15; }
    return mute;
  }

  // ---- one-shots ----
  function actLayerExt() {
    const a = actAT, d = actDir;
    switch (actId) {
      case A_POTION: {
        // rears a little, the right paw goes up and back, then an overarm fling
        const rear = smooth(0, 0.12, a) * (1 - smooth(0.32, 0.52, a));
        const wind = bump(0, 0.1, 0.13, 0.2, a), fl = smooth(0.15, 0.235, a), fling = fl * (1 - smooth(0.3, 0.5, a));
        X.pitch -= 0.3 * rear; X.hipY += 0.02 * rear; X.curl += 0.03 * rear; X.t1x += 0.26 * rear; X.t2x += 0.1 * rear;
        X.neckX += 0.1 * rear - 0.1 * wind + 0.1 * fling; X.headX += 0.1 * rear;
        X.sYaw += -0.06 * wind + 0.075 * fling; X.hipZ += -0.02 * wind + 0.045 * fling; X.sq += 0.15 * wind - 0.14 * fling;
        X.tpT += 0.3 * fling;
        flaskPos.set(lerp(-0.165, -0.065, fl), lerp(0.075, -0.035, fl) + 0.035 * Math.sin(PI * fl), lerp(-0.012, 0.2, fl));
        footB(1, Math.max(rear, flaskW * (1 - fl)), flaskPos.x, flaskPos.y, flaskPos.z, lerp(-0.9, 0.5, fl), 0.15, 1.3);
        footB(0, rear * 0.85, 0.1, -0.12, 0.085, 0.6, -0.1, 0.95);
        flaskMix = Math.max(flaskMix, a < POTION_RELEASE + 0.03 ? smooth(0, 0.06, a) : 0);
        if (a > POTION_RELEASE) { const s = a - POTION_RELEASE, v = Math.exp(-s * 12) * Math.sin(s * 28); X.neckX += 0.07 * v; X.tailX += 0.1 * v; }
        X.quiet += rear;
        break;
      }
      case A_SCREAM: {
        const D = actDur, pw = 0.6 + 0.4 * scrPow;
        const snap = smooth(0.015, SCREAM_TIME, a), hold = snap * (1 - smooth(D - 0.32, D - 0.04, a));
        const sh1 = Math.sin(a * 83) * 0.6 + Math.sin(a * 131 + 1) * 0.4, sh2 = Math.sin(a * 97 + 2);
        const air = 1 - 0.75 * sat(a / D); // the breath runs out
        if (scrCtl) {
          // braced: feet wide, tail planted, the whole body a horn
          plantWide(hold, 1.24, 0.04);
          X.hipY -= 0.014 * hold; X.pitch -= 0.11 * hold * pw; X.curl -= 0.02 * hold;
          X.neckX -= 0.3 * hold * pw; X.headX -= 0.24 * hold * pw;
          X.t1x -= 0.04 * hold; X.tailX -= 0.05 * hold; if (hold > X.tailStill) X.tailStill = hold;
          X.hipX += 0.0038 * sh1 * hold * pw; X.roll += 0.028 * sh1 * hold * pw; X.headZ += 0.05 * sh2 * hold * pw;
          X.hipZ += 0.03 * snap * (1 - smooth(0.2, 0.5, a)) - 0.012 * hold;
          X.jaw += 0.72 * hold * (0.75 + 0.25 * pw);
          if (0.6 * hold > X.lid) X.lid = 0.6 * hold;
        } else {
          // torn out of it: back arched, limbs flung stiff, eyes screwed shut, shaking apart
          const cv = Math.sin(a * 23) * hold;
          X.curl -= 0.13 * hold * pw; X.pitch += 0.07 * cv; X.sYaw += 0.06 * Math.sin(a * 19 + 1) * hold;
          X.neckX -= 0.44 * hold * pw; X.headX -= 0.34 * hold * pw; X.tailX += 0.5 * hold;
          X.roll += 0.05 * sh1 * hold; X.hipX += 0.005 * sh1 * hold; X.headZ += 0.08 * sh2 * hold;
          for (let i = 0; i < 4; i++) {
            const f = feet[i];
            footB(i, hold, f.side * 0.2, -0.055 + 0.008 * Math.sin(a * 71 + i * 2), f.front ? 0.105 : -0.1, -0.3, f.side * 0.4, 1.4);
          }
          X.jaw += 0.9 * hold;
          if (hold > X.lidHard) X.lidHard = hold;
        }
        X.breath += 0.085 * hold * air - 0.03 * (1 - air) * hold;
        X.sq += -0.1 * bump(0, 0.05, 0.1, 0.24, a) + 0.14 * bump(D - 0.3, D - 0.16, D - 0.1, D, a);
        X.nodT += 0.22 * bump(D - 0.3, D - 0.14, D - 0.1, D, a);
        const br = hold * (0.85 + 0.15 * sh2);
        if (br > X.bristle) X.bristle = br;
        X.noBreath = Math.max(X.noBreath, hold); X.quiet += 1;
        break;
      }
      case A_FINISH: {
        // a short leap, two full turns: the spur kicks out on the first, the tail cracks down on the second
        const cr = bump(0, 0.07, 0.1, 0.18, a);
        const u = seg(0.12, 0.62, a), hop = 4 * u * (1 - u), s1 = Math.sin(PI * u);
        const kick = bump(0.17, 0.25, 0.3, 0.37, a);
        const lagc = bump(0.16, 0.28, 0.345, FINISH_HIT, a), crack = smooth(0.35, FINISH_HIT, a) * (1 - smooth(0.52, 0.72, a));
        X.sq += 0.45 * cr - 0.12 * bump(0.12, 0.18, 0.22, 0.34, a) + 0.25 * bump(0.6, 0.64, 0.67, 0.8, a);
        X.rigY += 0.42 * hop; X.rigZ += 0.16 * s1; X.rigYaw += d * 2 * TAU * lerp(u, u * u * (3 - 2 * u), 0.4);
        X.rigRoll -= d * 0.2 * s1; X.rigPitch += 0.2 * bump(0.3, 0.45, 0.52, 0.64, a) - 0.18 * bump(0.1, 0.16, 0.2, 0.32, a);
        X.air = Math.max(X.air, sat(hop * 3.5));
        X.airK += u < 0.5 ? 1 - smooth(0.05, 0.4, u) : -smooth(0.66, 0.97, u);
        const ki = d > 0 ? 2 : 3;
        footR(ki, kick, feet[ki].side * 0.19, 0.085, -0.34, -0.55, feet[ki].side * 0.35, 1.3);
        const g = (a - 0.27) / 0.06;
        X.spur = Math.max(X.spur, 2.4 * Math.exp(-g * g));
        X.tailY += d * (-1.05 * lagc + 0.6 * crack); X.tailX += 0.55 * lagc - 0.3 * crack;
        X.sYaw += d * (0.1 * s1 - 0.1 * cr + 0.06 * crack); X.neckY += d * (0.26 * s1 * (1 - u) - 0.16 * cr);
        if (a > FINISH_HIT) { const s = a - FINISH_HIT, v = Math.exp(-s * 20) * Math.sin(s * 90); X.tailY += d * 0.07 * v; X.t3x += 0.05 * v; X.rigRoll += 0.03 * v; }
        if (0.4 * s1 > X.lid) X.lid = 0.4 * s1;
        X.quiet += 1;
        break;
      }
      case A_SITUP: {
        // the newborn: lying on its side, a twitch, a roll onto the belly with a shake, up on its haunches, blinking
        const lie = 1 - smooth(0.4, 0.86, a);
        const sit = smooth(0.58, 0.98, a) * (1 - smooth(1.36, 1.58, a));
        const stir = bump(0.05, 0.12, 0.3, 0.42, a);
        if (lie > 0) poseStill(lie);
        if (sit > 0) poseSit(sit, -1);
        X.t3x += 0.07 * stir * Math.sin(a * 41); X.tailY += 0.12 * stir * Math.sin(a * 29);
        X.headZ += 0.1 * stir * Math.sin(a * 23);
        shakeCurves(a - 0.62, 0.5, 0.7);
        const look = bump(0.98, 1.08, 1.22, 1.34, a); // looks down at its own paws
        X.headX += 0.26 * look; X.neckX += 0.1 * look; X.headZ += 0.12 * look * Math.sin((a - 1) * 9);
        for (let i = 0; i < 2; i++) footB(i, look * sit, feet[i].side * 0.07, -0.1 + 0.012 * Math.sin(a * 14 + i * 3), 0.12, 0.4, -feet[i].side * 0.5, 1.3);
        let bl = 0;
        for (let k = 0; k < 3; k++) { const g = (a - (0.96 + 0.17 * k)) / 0.045; bl = Math.max(bl, Math.exp(-g * g)); }
        const lid = Math.max(bl, 1 - smooth(0.5, 0.92, a));
        if (lid > X.lid) X.lid = lid;
        X.sq += 0.15 * bump(1.5, 1.55, 1.57, 1.6, a);
        X.noBlink = 1; X.quiet += 1;
        break;
      }
      case A_CHEER: {
        const up = smooth(0.02, 0.2, a) * (1 - smooth(0.95, 1.16, a));
        const hu = seg(0.26, 0.96, a), h = Math.abs(Math.sin(PI * hu * 2)) * up;
        rearUp(up, 0.85);
        X.neckX += 0.2 * up; X.headX += 0.14 * up - 0.1 * h;
        X.rigY += 0.075 * h; X.sq += 0.18 * bump(0, 0.05, 0.09, 0.2, a) - 0.1 * h;
        for (let i = 0; i < 2; i++) {
          const sd = feet[i].side;
          footB(i, up, sd * (0.16 + 0.02 * h), 0.06 + 0.035 * h + 0.012 * Math.sin(a * 21 + i * PI), 0.1, -0.9, sd * 0.3, 1.36);
        }
        for (let i = 2; i < 4; i++) footR(i, h, feet[i].side * 0.2, ANKLE_H + 0.035, feet[i].hz + 0.085, 0.4, feet[i].side * 0.2, 1.2);
        X.tailSrc += 0.5 * up * Math.sin(a * 17); X.jaw += 0.28 * up;
        if (0.5 * up > X.lid) X.lid = 0.5 * up;
        X.quiet += up;
        break;
      }

      // ------------------------------------------------------------------ the King's attacks
      case A_SWEEP: {
        // coil: head over the shoulder, tail cocked high to one side ... then the whole animal whips round
        // once and the tail scythes across the front (hit) ... a heavy skidding stop
        const coil = smooth(0, 0.6, a) * (1 - smooth(0.74, 0.9, a));
        const u = seg(0.72, 1.08, a), e = u * u * (3 - 2 * u), s1 = Math.sin(PI * u);
        const rec = smooth(1.08, 1.2, a) * (1 - smooth(1.5, 1.9, a));
        X.rigYaw += d * (-0.5 * coil + TAU * e);
        X.sq += 0.22 * coil - 0.1 * s1 + 0.12 * rec;
        X.hipY -= 0.012 * coil; X.sYaw += d * (0.12 * coil - 0.1 * s1); X.roll += d * 0.07 * coil;
        X.neckY += d * (0.4 * coil - 0.3 * s1); X.headY += d * (0.3 * coil - 0.2 * s1); X.neckX += 0.08 * coil;
        X.tailY += d * (-1.2 * coil - 0.4 * s1 * (1 - u) + 0.5 * bump(0.86, 0.9, 1.0, 1.2, a)); X.tailX += 0.34 * coil - 0.12 * s1;
        X.rigY += 0.035 * s1; X.rigRoll -= d * 0.13 * s1;
        X.air = Math.max(X.air, 0.7 * s1);
        if (a > 1.08) { const s = a - 1.08, v = Math.exp(-s * 7) * Math.sin(s * 19); X.rigRoll += d * 0.07 * v; X.tailY += d * 0.3 * v; X.hipX += d * 0.012 * v; }
        X.breath += 0.02 * rec * Math.sin(fT * 6); X.neckX += 0.1 * rec;
        const br = 0.5 * coil + 0.3 * s1;
        if (br > X.bristle) X.bristle = br;
        if (0.4 * coil > X.lid) X.lid = 0.4 * coil;
        X.quiet += 1;
        break;
      }
      case A_SLAM: {
        // rears to his full height, the bill cocked back ... drives it into the ground ... it is stuck:
        // he heaves at it twice, the tail thrashing, then wrenches it free
        const rear = smooth(0, 0.62, a) * (1 - smooth(0.86, 0.985, a));
        const cock = bump(0.4, 0.68, 0.84, 0.94, a);
        const down = smooth(0.87, 1.0, a) * (1 - smooth(2.52, 2.82, a));
        const pull = bump(1.48, 1.62, 1.7, 1.84, a) + bump(1.98, 2.12, 2.2, 2.34, a) + 0.7 * bump(2.44, 2.54, 2.58, 2.66, a);
        rearUp(rear, 1.12);
        X.neckX += 0.3 * rear - 0.36 * cock; X.headX += 0.1 * rear - 0.22 * cock; X.jaw += 0.2 * cock;
        X.rigY += 0.02 * rear * Math.sin(fT * 3.1);
        for (let i = 0; i < 2; i++) {
          const sd = feet[i].side;
          footB(i, rear, sd * 0.15, 0.02 + 0.03 * cock, 0.115, -0.6, sd * 0.3, 1.32);
          footR(i, down, sd * 0.25, ANKLE_H, 0.31 - 0.03 * pull, 0, sd * 0.3, 1.36);
        }
        X.pitch += 0.04 * down - 0.05 * pull; X.hipZ += 0.05 * down - 0.035 * pull;
        X.curl += 0.015 * down; X.neckX += 0.12 * down + 0.05 * pull; X.headX += 0.2 * down;
        if (a > 1.0 && a < 1.5) { const s = a - 1.0, v = Math.exp(-s * 9) * Math.sin(s * 44); X.hipX += 0.006 * v; X.rigRoll += 0.03 * v; X.tailX += 0.3 * v; }
        X.tailSrc += 0.7 * down * Math.sin(fT * 13) * (0.4 + 0.6 * sat(pull)); X.tailX += 0.3 * down * sat(pull);
        for (let i = 2; i < 4; i++) footR(i, sat(pull) * down, feet[i].side * 0.2, ANKLE_H + 0.02 * Math.abs(Math.sin(fT * 15 + i)), feet[i].hz - 0.05, 0.3, feet[i].side * 0.2, 1.2);
        X.sq -= 0.12 * bump(0.86, 0.92, 0.96, 1.0, a);
        const br = 0.5 * rear + 0.3 * sat(pull);
        if (br > X.bristle) X.bristle = br;
        if (0.5 * down > X.lid) X.lid = 0.5 * down;
        X.quiet += 1;
        break;
      }
      case A_CHARGE: {
        // head down, the tail up stiff, one forefoot rakes the ground twice, then he gathers himself
        const low = smooth(0, 0.3, a);
        const rake1 = bump(0.22, 0.32, 0.4, 0.52, a), rake2 = bump(0.56, 0.66, 0.74, 0.86, a);
        const gather = smooth(0.86, 1.08, a);
        const rk = rake1 + rake2, fi = d > 0 ? 0 : 1, f = feet[fi];
        const rz = rake1 > 0 ? seg(0.26, 0.5, a) : seg(0.6, 0.84, a);
        X.hipY -= 0.008 * low + 0.008 * gather; X.sq += 0.06 * low + 0.16 * gather; X.hipZ -= 0.02 * low + 0.035 * gather;
        X.pitch += 0.015 * low; X.neckX += 0.1 * low; X.headX -= 0.2 * low; X.curl += 0.02 * gather;
        X.tailX += 0.42 * low; X.tailSrc += 0.3 * low * Math.sin(fT * 9);
        footR(fi, sat(rk), f.hx * 0.95, ANKLE_H + 0.06 * Math.sin(PI * rz) * (1 - rz), f.hz + 0.14 - 0.24 * rz, 0.5 * (1 - rz), 0, 1.3);
        X.roll -= f.side * 0.04 * sat(rk); X.neckY += f.side * 0.08 * sat(rk);
        X.breath += 0.03 * low * Math.sin(fT * 7); X.jaw += 0.12 * low * (0.5 + 0.5 * Math.sin(fT * 7));
        const br = 0.3 * low + 0.4 * gather;
        if (br > X.bristle) X.bristle = br;
        if (0.4 * low > X.lid) X.lid = 0.4 * low;
        X.quiet += 1;
        break;
      }
      case A_POUND: {
        // up, higher than anything else he does, both forepaws over his head, a held breath — then all of him comes down
        const rear = smooth(0, 0.7, a) * (1 - smooth(0.99, 1.1, a));
        const reach = smooth(0.3, 0.8, a) * (1 - smooth(1.0, 1.1, a));
        const down = smooth(1.0, 1.1, a) * (1 - smooth(1.75, 2.18, a));
        const stomp = bump(1.74, 1.9, 1.94, 2.0, a);
        rearUp(rear, 1.25);
        X.neckX += 0.34 * rear - 0.2 * reach; X.headX += 0.22 * rear - 0.12 * reach; X.curl -= 0.03 * reach;
        X.rigY += 0.015 * reach * Math.sin(fT * 23) * 0.3 + 0.03 * reach; X.jaw += 0.3 * reach;
        for (let i = 0; i < 2; i++) {
          const sd = feet[i].side;
          footB(i, rear, sd * 0.17, 0.02 + 0.09 * reach, 0.1 - 0.04 * reach, -0.9 - 0.3 * reach, sd * 0.35, 1.4);
          footR(i, down * (i === 0 ? 1 - stomp : 1), sd * 0.27, ANKLE_H, 0.27, 0, sd * 0.35, 1.4);
        }
        footR(0, stomp, 0.24, ANKLE_H + 0.075, 0.25, -0.3, 0.2, 1.3);
        X.hipY -= 0.018 * down; X.sq += 0.12 * down; X.neckX += 0.03 * down; X.headX -= 0.05 * down;
        X.breath += 0.03 * down * Math.sin(fT * 5.5); X.jaw += 0.15 * down;
        X.tailX -= 0.1 * down;
        if (a > 1.1 && a < 1.7) { const s = a - 1.1, v = Math.exp(-s * 8) * Math.sin(s * 38); X.hipX += 0.005 * v; X.rigRoll += 0.025 * v; X.tailX += 0.4 * v; X.headZ += 0.08 * v; }
        const br = 0.6 * reach;
        if (br > X.bristle) X.bristle = br;
        if (0.55 * down > X.lid) X.lid = 0.55 * down;
        X.quiet += 1;
        break;
      }
      case A_SPIT: {
        // the head draws back and up, the throat fills ... three hard jabs of the bill
        const draw = smooth(0, 0.55, a) * (1 - smooth(0.74, 0.8, a));
        let jab = 0;
        for (let k = 0; k < 3; k++) { const s = a - (0.8 + 0.2 * k); if (s > -0.05) jab += smooth(-0.05, 0, s) * Math.exp(-Math.max(s, 0) * 13); }
        const aft = smooth(0.78, 0.85, a) * (1 - smooth(1.2, 1.3, a));
        X.neckX -= 0.36 * draw - 0.14 * jab; X.headX -= 0.2 * draw - 0.06 * jab; X.pitch -= 0.08 * draw - 0.03 * jab;
        X.hipZ += -0.035 * draw + 0.04 * jab; X.curl -= 0.02 * draw; X.sq += 0.1 * draw - 0.08 * jab;
        X.breath += 0.06 * draw * (0.8 + 0.2 * Math.sin(fT * 19)); X.noBreath = Math.max(X.noBreath, draw);
        X.jaw += 0.08 * draw + 0.55 * sat(jab) + 0.15 * aft;
        X.tailX += 0.22 * draw - 0.1 * jab; X.headZ += 0.05 * draw * Math.sin(fT * 15);
        X.glow = Math.max(X.glow, 0.5 * draw + 0.5 * sat(jab));
        if (0.4 * draw > X.bristle) X.bristle = 0.4 * draw;
        if (0.5 * draw > X.lid) X.lid = 0.5 * draw;
        X.quiet += 1;
        break;
      }
      case A_ROAR: {
        // one breath in, low — then half-rearing, forefeet stamped wide, the head thrown forward and the bill gaping
        const inh = smooth(0, 0.36, a) * (1 - smooth(0.4, 0.5, a));
        const hold = smooth(0.4, 0.52, a) * (1 - smooth(1.3, 1.7, a));
        const sh1 = Math.sin(a * 71) * 0.6 + Math.sin(a * 113 + 1) * 0.4;
        X.neckX += 0.18 * inh - 0.34 * hold; X.headX += 0.06 * inh - 0.2 * hold; X.hipZ -= 0.03 * inh - 0.035 * hold;
        X.breath += 0.07 * inh + 0.05 * hold * (1 - sat((a - 0.5) / 1.1)); X.sq += 0.14 * inh - 0.08 * hold;
        X.pitch -= 0.3 * hold; X.hipY += 0.012 * hold; X.curl += 0.03 * hold; X.t1x += 0.1 * hold;
        for (let i = 0; i < 2; i++) footR(i, hold, feet[i].hx * 1.3, ANKLE_H, feet[i].hz + 0.075, 0, feet[i].side * 0.3, 1.38);
        X.jaw += 0.82 * hold; X.hipX += 0.004 * sh1 * hold; X.roll += 0.02 * sh1 * hold; X.headZ += 0.05 * sh1 * hold;
        X.tailSrc += 0.8 * hold * Math.sin(a * 9); X.tailX += 0.3 * hold;
        const br = 0.4 * inh + hold;
        if (br > X.bristle) X.bristle = br;
        if (0.45 * hold > X.lid) X.lid = 0.45 * hold;
        X.noBreath = Math.max(X.noBreath, hold); X.quiet += 1;
        break;
      }
      case A_STAGGER: {
        // dazed: reeling from side to side on buckling legs, the head lolling, a shake to clear it
        const env = smooth(0, 0.18, a) * (1 - smooth(1.7, 2.2, a));
        const sw = Math.sin(a * 4.1), sw2 = Math.sin(a * 4.1 - 0.9);
        X.roll += 0.2 * sw * env; X.hipX += 0.032 * sw2 * env; X.sRoll -= 0.03 * sw * env;
        X.hipY -= (0.014 + 0.012 * Math.abs(sw)) * env; X.sq += 0.12 * env;
        X.neckX += 0.15 * env; X.headX += 0.03 * env; X.headZ += 0.34 * Math.sin(a * 3.0 + 0.6) * env; X.neckY += 0.16 * sw2 * env;
        X.tailX -= 0.12 * env; X.tailSrc -= 0.5 * sw * env;
        X.jaw += 0.18 * env; X.breath += 0.025 * env * Math.sin(fT * 6);
        for (let i = 0; i < 4; i++) {
          const f = feet[i];
          const st = Math.max(0, Math.sin(a * 4.1 * 2 + i * 1.7)) * env;
          footR(i, 0.8 * env, f.hx * (1.12 + 0.1 * sw * f.side), ANKLE_H + 0.03 * st, f.hz + 0.04 * sw2 * (f.front ? 1 : -1), 0.2 * st, 0, 1.2);
        }
        shakeCurves(a - 1.9, 0.52, 0.65);
        if (0.65 * env > X.lid) X.lid = 0.65 * env;
        X.quiet += 1;
        break;
      }
      case A_REAR: {
        // the end: up to his full height one last time, pawing at the air, swaying
        const up = smooth(0, 1.3, a);
        const sway = Math.sin(a * 2.2) * smooth(0.6, 1.6, a);
        rearUp(up, 1.22);
        X.neckX += 0.3 * up - 0.3 * smooth(1.2, 2.0, a); X.headX += 0.2 * up - 0.24 * smooth(1.3, 2.1, a);
        X.rigRoll += 0.07 * sway; X.roll += 0.05 * sway; X.headZ += 0.16 * sway; X.rigY += 0.02 * up;
        for (let i = 0; i < 2; i++) {
          const sd = feet[i].side;
          footB(i, up, sd * 0.16, 0.0 + 0.05 * Math.sin(a * 5.2 + i * PI) * up, 0.12 + 0.03 * Math.cos(a * 5.2 + i * PI), -0.7, sd * 0.3, 1.35);
        }
        X.jaw += 0.5 * smooth(0.5, 1.4, a); X.breath += 0.03 * Math.sin(fT * 5) * up;
        X.tailSrc += 0.3 * sway;
        if (0.5 * up > X.lid) X.lid = 0.5 * up;
        X.quiet += 1;
        break;
      }
      case A_FALL: {
        // from full height: a long sway, the legs go, and he comes down on his side like a felled tree;
        // the tail drops last; one more breath; the forepaw uncurls
        const sway = Math.sin(a * 2.2 + 1.2) * (1 - smooth(0.9, 1.5, a));
        const go = seg(1.1, 2.6, a), fall = go * go * go;                 // slow, then all at once
        const up = 1 - smooth(1.1, 2.45, a);
        const dead = smooth(2.6, 3.7, a);
        rearUp(up, 1.22);
        X.neckX += (0.0 - 0.1 * sway) * up + 0.2 * (1 - up) * (1 - fall); X.headX += -0.04 * up;
        X.rigRoll += 0.07 * sway * up; X.headZ += 0.16 * sway * up;
        for (let i = 0; i < 2; i++) {
          const sd = feet[i].side;
          footB(i, up * (1 - fall), sd * 0.16, -0.02 - 0.06 * go, 0.12, -0.3, sd * 0.3, 1.2);
        }
        poseStill(fall);
        if (a > 2.6) {
          const s = a - 2.6, v = Math.exp(-s * 6);
          X.rigY += 0.03 * v * Math.abs(Math.sin(s * 9)); X.rigRoll += 0.05 * v * Math.sin(s * 17);
          X.tailX += 0.5 * (1 - smooth(0.2, 0.36, s)) + 0.12 * Math.exp(-Math.max(s - 0.34, 0) * 9) * Math.sin(Math.max(s - 0.34, 0) * 30);
          X.breath += 0.05 * bump(0.5, 0.9, 1.1, 1.7, s);
          // the forepaw that held the bottle opens
          const open = smooth(1.0, 1.5, s) * (1 - smooth(1.62, 1.9, s));
          footR(0, open * 0.9, 0.1, 0.012, feet[0].hz + 0.13, 0.2, -0.2, 1.4, -0.9);
        } else X.tailX += 0.5 * fall;
        X.jaw += 0.5 * up + 0.16 * (1 - up) * (1 - dead);
        // the eyes: wide, then closing slowly once he is down (poseStill would shut them at once)
        X.lidHard = Math.min(X.lidHard, dead);
        if (dead > X.lid) X.lid = dead;
        X.quiet += 1;
        break;
      }
      default: break;
    }
  }

  // after the skeleton is posed: jaw, hold / muzzle anchors, glows, gear uniforms
  function extPost(dt) {
    jaw.rotation.x = clamp(X.jaw, 0, 1) * 0.62;
    if (flaskMix > 0.001) { tB.copy(flaskPos); tB.y += 0.012; tB.z += 0.014; holdAnchor.position.lerpVectors(holdRest, tB, flaskMix > 1 ? 1 : flaskMix); }
    else holdAnchor.position.copy(holdRest);
    if (worn.weapon) {
      const a = aimS * 0.82, c = Math.cos(a), sn = Math.sin(a);
      const dz = GEAR_MUZZLE[2] - GEAR_PIVOT[2] - UG.kick.value;
      muzzle.position.set(dz * sn, GEAR_MUZZLE[1] - J.chest[1], GEAR_PIVOT[2] - J.chest[2] + dz * c);
      muzzle.rotation.y = a;
      UG.aim.value = a;
    }
    if (X.glow > 0) {
      // venom gathering in the bill (the spit): the existing bill glow, turned green
      U.billColor.value.setRGB(0.35, 1.5, 0.25);
      U.billGlow.value = Math.max(U.billGlow.value, X.glow);
      glowTinted = true;
    } else if (glowTinted) { U.billColor.value.setRGB(0.25, 0.65, 1.6); glowTinted = false; }
    if (kingSpurMat) {
      const g = Math.max(weakGlow * (0.65 + 0.35 * Math.sin(fT * 6.5)), U.spurGlow.value * 0.5);
      kingSpurMat.emissive.setRGB(0.3 * g, 1.1 * g, 0.2 * g);
    }
  }
  let glowTinted = false;

  // ---- API ----
  function setGear(slot, id) {
    const list = GEAR_SLOTS[slot];
    if (!list) return false;
    if (id === undefined) id = null;
    if (id !== null && list.indexOf(id) < 0) return false; // unknown ids are ignored
    if (worn[slot] === id) return true;
    worn[slot] = id;
    if (id !== null && !gearMesh) {
      const G = GEAR || (GEAR = buildGear(THREE, A));
      gearMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
      gearMat.onBeforeCompile = (sh) => {
        sh.uniforms.uGearShow = UG.show; sh.uniforms.uGearAim = UG.aim; sh.uniforms.uGearKick = UG.kick;
        sh.uniforms.uGearPivot = UG.pivot; sh.uniforms.uGearGlow = UG.glow;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', GEAR_VERT_DECL)
          .replace('#include <beginnormal_vertex>', GEAR_VERT_NORMAL)
          .replace('#include <begin_vertex>', GEAR_VERT_BEGIN)
          .replace('#include <project_vertex>', GEAR_VERT_PROJECT);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', GEAR_FRAG_DECL)
          .replace('#include <roughnessmap_fragment>', GEAR_FRAG_ROUGH)
          .replace('#include <emissivemap_fragment>', GEAR_FRAG_EMISSIVE);
      };
      gearMat.customProgramCacheKey = () => 'platypus-gear-1';
      gearMesh = new THREE.SkinnedMesh(G.geo, gearMat);
      gearMesh.name = 'platypusGear';
      gearMesh.castShadow = false;
      gearMesh.receiveShadow = false;
      gearMesh.frustumCulled = false;
      group.add(gearMesh);
      gearMesh.bind(skeleton, bindM);
      api.meshes.push(gearMesh);
    }
    const sv = UG.show.value;
    sv[GP_LEAF] = worn.body === 'leaf' ? 1 : 0;
    sv[GP_GUARDS] = worn.body !== null ? 1 : 0; // the bone shoulder guards stay on over the suit
    sv[GP_SUIT] = worn.body === 'suit' ? 1 : 0;
    sv[GP_HELM] = worn.head !== null ? 1 : 0;
    sv[GP_GLASSES] = worn.eyes !== null ? 1 : 0;
    sv[GP_BLASTER] = worn.weapon !== null ? 1 : 0;
    sv[GP_PACK] = worn.back !== null ? 1 : 0;
    if (gearMesh) gearMesh.visible = !!(worn.body || worn.head || worn.eyes || worn.weapon || worn.back);
    if (slot === 'weapon') {
      if (id !== null) {
        chest.add(muzzle);
        muzzle.position.set(0, GEAR_MUZZLE[1] - J.chest[1], GEAR_MUZZLE[2] - J.chest[2]);
      } else {
        head.add(muzzle);
        muzzle.position.set(0, MUZZLE_BILL_Y, MUZZLE_BILL_Z);
        muzzle.rotation.y = 0;
      }
    }
    return true;
  }
  function gearWorn(slot) { return worn[slot] === undefined ? null : worn[slot]; }
  function setAim(yaw) {
    if (yaw === null || yaw === undefined || !(yaw === yaw)) { aimOn = false; return; }
    aimOn = true; aimT = clamp(+yaw || 0, -1.3, 1.3);
  }
  function fire() { fireT = 0; nodV -= 3.5; qv += 2.5; tpV += 2; return FIRE_DUR; }
  function potionThrow() { return startExt(A_POTION, 'potionThrow', POTION_DUR, POTION_RELEASE, 'release'); }
  function holdFlask(on) { flaskOn = !!on; if (flaskOn) celebrating = false; }
  function screamCharge(f) { scrCharge = sat(+f || 0); if (scrCharge > 0) celebrating = false; }
  function scream(power, controlled) {
    scrPow = sat(power === undefined || power === null ? 1 : +power || 0);
    scrCtl = controlled !== false;
    scrCharge = 0;
    return startExt(A_SCREAM, 'scream', scrCtl ? 0.9 + 0.5 * scrPow : 1.6 + 0.4 * scrPow, SCREAM_TIME, 'scream');
  }
  function finisher() { return startExt(A_FINISH, 'finisher', FINISH_DUR, FINISH_HIT, 'finish'); }
  function collapse(kind) {
    if (colKind) return;
    colKind = kind === 'shot' ? 2 : 1; colT = 0;
    actId = -1; celebrating = false; scrCharge = 0; flaskOn = false; galOn = false;
    stingT = zapT = -1; stingEnded = true;
    xfadeStart(0.08);
  }
  function revive() {
    colKind = 0; colT = 0; actId = -1; evC = 0; xfT = 1; xfDur = 0;
    scrCharge = scrW = 0; flaskW = 0; galW = 0; fireT = -1; UG.kick.value = 0;
    if (poseCur === P_STILL) { poseCur = -1; poseName = null; }
    PW[P_STILL] = 0;
    stingT = zapT = hurtT = -1; stingEnded = true; closeHold = 0;
    q = qv = nod = nodV = tp = tpV = 0;
    resetFeet(0);
  }
  function sitUp() {
    if (poseCur === P_STILL) { poseCur = -1; poseName = null; }
    PW[P_STILL] = 0;
    colKind = 0;
    return startExt(A_SITUP, 'sitUp', SITUP_DUR, -1, null);
  }
  function cheer() { return startExt(A_CHEER, 'cheer', CHEER_DUR, -1, null); }
  // attack(name, windupScale = 1, hold = 0): the wind-up section plays windupScale times slower and the
  // pose just after the hit is held `hold` seconds longer (both for the boss's assist / phase tuning).
  // Returns the real duration.
  function attack(name, windupScale, hold) {
    const id = ATK_ID[name], def = ATTACKS[name];
    if (id === undefined || !def) return 0;
    const d = startExt(id, name, def.dur, def.hit === undefined ? -1 : def.hit, 'hit', def.windup || 0, windupScale, ATK_HOLD[name] || 0, hold);
    pushEv('windup', name);
    galOn = false;
    return d;
  }
  function charging(on) { galOn = !!on; if (galOn) { celebrating = false; galSF = galSH = 0; } }
  function setWeakGlow(v) { weakGlow = sat(+v || 0); }

  function resetExt() {
    colKind = 0; colT = 0; scrCharge = scrW = 0; aimOn = false; aimT = aimS = 0; fireT = -1;
    flaskOn = false; flaskW = flaskMix = 0; galOn = false; galW = 0; galSF = galSH = 0; weakGlow = 0;
    actAT = 0; actW = 0; actWS = 1; actHold = 0; actHit = -1;
    UG.kick.value = 0; UG.aim.value = 0;
    jaw.rotation.x = 0;
    holdAnchor.position.copy(holdRest);
  }
  function disposeExt() {
    for (let i = 0; i < extMats.length; i++) extMats[i].dispose();
    for (let i = 0; i < extGeos.length; i++) extGeos[i].dispose();
    if (gearMat) gearMat.dispose();
  }

  Object.assign(api, {
    setGear, gearWorn, muzzle, setAim, fire,
    potionThrow, potionReleaseTime: POTION_RELEASE, holdFlask,
    screamCharge, scream, screamTime: SCREAM_TIME,
    finisher, finisherHitTime: FINISH_HIT,
    collapse, revive, sitUp, cheer,
    attack, attacks: ATTACKS, charging,
    crownAnchor, capeAnchor, armorAnchors,
    setWeakGlow, jaw,
  });
  Object.defineProperty(api, 'collapsed', { get() { return colKind > 0; }, enumerable: true });
  Object.defineProperty(api, 'aiming', { get() { return aimOn; }, enumerable: true });
  if (isKing) api.radius = 1.5;

  const REST_STATE = { speed: 0, maxSpeed: 3, grounded: true, vy: 0, turn: 0, moving: false };

  function update(dt, s) {
    s = s || REST_STATE;
    if (!(dt >= 0)) dt = 0;
    const maxSpeed = (s.maxSpeed > 0 ? s.maxSpeed : 3) * SPD_K;
    const speed = Math.abs(s.speed || 0) * SPD_K; // the gait works in model units (SPD_K is 1 for the player and the friend)
    const grounded = s.grounded !== false;
    const vy = s.vy || 0;
    const turn = s.turn || 0;
    const moving = s.moving !== undefined ? !!s.moving : speed > 0.05;
    const diving = !!s.diving;
    const swimming = !!s.swimming || diving;
    carryState = !!s.carrying;
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

    // ---------------- one-shot timeline (events are queued and dispatched at the end of update) ----------------
    if (actId >= 0) {
      const t0 = actT;
      actT += dt;
      if (actId >= A_EXT0) actTimelineExt(t0);
      if (actApex >= 0 && t0 < actApex && actT >= actApex) pushEv('apex', actName);
      if (actLand >= 0 && t0 < actLand && actT >= actLand) {
        pushEv('land', actName);
        if (actId !== A_WATERLEAP) { qv += 8; nodV += 4; tpV -= 5; resetFeet(0.28); }
      }
      if (actId === A_SLAP && t0 < SLAP_HIT && actT >= SLAP_HIT) { pushEv('slap', actName); nodV += 2; resetFeet(0.2); }
      else if (actId === A_EAT) {
        for (let k = 0; k < 3; k++) if (t0 < EAT_BITES[k] && actT >= EAT_BITES[k]) pushEv('bite', actName);
      } else if (actId === A_SHAKE && t0 < 0.4 && actT >= 0.4) wet *= 0.35;
      else if (actId === A_TAILSTAND && t0 < 1.5 && actT >= 1.5) { nodV += 3; tpV -= 3; }
      if (actT >= actDur) {
        pushEv('done', actName);
        if (actId >= A_EXT0) actEndExt();
        actId = -1;
        xfadeStart(0.1);
      }
    }

    // ---------------- gait ----------------
    const walking = grounded && !spinning && !swimming && speed > 0.04;
    const suspended = !grounded || spinning || swimming;
    let freq = speed / lerp(0.2, 0.47, r);
    if (freq > 6.8) freq = 6.8;
    const duty = lerp(0.72, 0.5, r);
    const liftH = lerp(0.026, 0.046, r) * (1 + 0.7 * PW[P_SNEAK]);

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
          if (f.df > 0.3 && api.onFootstep && !(muteFeet & (1 << i))) api.onFootstep(i, f.x * SC, f.z * SC, (0.3 + 0.7 * r) * f.df);
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

    // ---------------- extension layers ----------------
    clearX();
    fT = time; fR = r; fDuty = duty; fDt = dt;
    swimW = damp(swimW, swimming ? 1 : 0, 9, dt);
    diveW = damp(diveW, diving ? 1 : 0, 6, dt);
    if (swimW > 0.002) swimLayer(swimW, diveW, turnS);
    pitchLag = damp(pitchLag, group.rotation.x, 5, dt);
    poseLayers(dt);
    if (actId >= 0) actLayer();
    lookLayer(dt);
    if (X.bristle > bristle) bristle = X.bristle;
    const quiet = sat(X.quiet);
    const idleE = idleW * (1 - quiet);
    // wet fur: soaked while swimming, damp from wading, dries by itself in about 8 s
    if (swimming) wet = 1;
    else {
      if (s.inWater && wet < 0.4) wet = 0.4;
      if (wet > 0) { wet -= dt / 8; if (wet < 0) wet = 0; }
    }

    // squash / stretch spring
    const qT = airW * (-0.3 * kUp) + zapDip * 0.12;
    qv += (-(q - qT) * 230 - qv * 17) * dt;
    q += qv * dt;
    if (q > 1) { q = 1; if (qv > 0) qv = 0; }
    if (q < -0.5) { q = -0.5; if (qv < 0) qv = 0; }
    const qq = clamp(q + X.sq, -0.5, 1);

    // idle life
    const breath = Math.sin(time * BREATH_W) * (1 - sat(X.noBreath));
    const idleLook = idleE * Math.sin(time * 0.37) * Math.sin(time * 0.23 + 1.0) * 0.4;
    const sniff = idleE * (Math.sin(time * 2.3) * 0.03 + Math.max(0, Math.sin(time * 0.6)) * Math.sin(time * 11) * 0.012);
    const celS = Math.sin(celT * 6.5), celHop = Math.abs(celS);

    // head pitch spring (positive = nose down)
    const nodT = sniff + walkW * 0.03 * Math.sin(phase * TAU * 2 + 0.6) +
      airW * (-0.12 * kUp + 0.12 * kDn + 0.1 * kMid) + zapDip * 0.17 - flinch * 0.3 +
      celW * (-0.28 + 0.08 * celHop) + spinArc * 0.08 + X.nodT;
    nodV += (-(nod - nodT) * 190 - nodV * 15) * dt;
    nod += nodV * dt;
    nod = clamp(nod, -0.7, 0.7);

    // tail pitch spring (positive = tail up)
    let tpT = walkW * 0.05 * Math.sin(phase * TAU * 2 + 1.0) + idleE * 0.02 * Math.sin(time * 0.9) +
      airW * (-0.22 * kUp + 0.34 * kDn - 0.12 * kMid) + celW * 0.42 * Math.sin(celT * 13) +
      spinArc * 0.22 - zapDip * 0.05 + flinch * 0.2 + X.tpT;
    tpV += (-(tp - tpT) * 130 - tpV * 9.5) * dt;
    tp += tpV * dt;
    tp = clamp(tp, grounded ? -0.14 : -0.5, 0.8);

    // tail yaw: each joint chases the one before it, so the sway travels down the paddle
    const stingBend = stingSide * 0.27 * spinArc;
    const tailSrc = -yawP * 0.9 - turnS * 0.7 + idleE * 0.07 * Math.sin(time * 0.8) +
      stingSide * 0.55 * spinArc + celW * 0.18 * Math.sin(celT * 6.5 + 1.2) + X.tailSrc;
    tailY0 = damp(tailY0, tailSrc * (1 - sat(X.tailStill)), 11, dt);
    tailY1 = damp(tailY1, tailY0 * 1.15, 7.5, dt);
    tailY2 = damp(tailY2, tailY1 * 1.15, 5.5, dt);

    // ---------------- body ----------------
    const shiver = bristle * Math.sin(time * 92) * 0.0032;
    const pitchBody = airW * (-0.26 * kUp + 0.08 * kDn) + zapDip * 0.15 - celW * (0.2 + 0.05 * celHop) +
      walkW * 0.012 * Math.sin(phase * TAU * 2) - flinch * 0.1;
    const curl = airW * (kMid * 0.15 - kUp * 0.07 + kDn * 0.02) + zapDip * 0.03 + Math.max(q, 0) * 0.03 + X.curl;
    const dYaw = (yawC - yawP) / 3 + turnS / 3 + stingBend / 3 + X.sYaw;
    const dRoll = (rollC - rollP) / 3 + X.sRoll;
    const chestX = 0.1 * Math.sin(yawP) + 0.09 * Math.sin(yawP + dYaw - X.sYaw) + 0.09 * Math.sin(yawP + 2 * (dYaw - X.sYaw));
    const drop = Math.max(q, 0) * 0.06 + q * (q < 0 ? 0.02 : 0) + zapDip * 0.014;

    hips.position.set(
      -chestX * 0.5 + shiver + X.hipX,
      J.hips[1] + bob - drop + celW * 0.012 * celHop + X.hipY - Math.max(X.sq, 0) * 0.05,
      J.hips[2] - flinch * 0.05 + X.hipZ
    );
    hips.rotation.set(
      pitchBody + X.pitch,
      yawP + X.hipYaw,
      rollP - turnS * 0.25 * r + celW * 0.12 * celS + flinch * 0.06 * Math.sin(time * 40) - stingSide * 0.18 * spinArc + X.roll
    );
    hips.scale.set(1 + 0.22 * qq, 1 - 0.28 * qq, 1 + 0.05 * qq - 0.03 * Math.min(qq, 0));

    const br = 1 + 0.018 * breath * (0.5 + 0.5 * idleW) + bristle * 0.02 + X.breath;
    spine1.rotation.set(curl, dYaw, dRoll);
    spine2.rotation.set(curl, dYaw, dRoll);
    spine2.scale.set(br, br, 1);
    chest.rotation.set(curl, dYaw, dRoll);
    chest.scale.set(1 / br, 1 / br, 1);

    const lookYaw = idleLook + turnS * 1.1 + celW * 0.22 * Math.sin(celT * 6.5 + 0.6);
    neck.rotation.set(nod * 0.5 + airW * kMid * 0.06 + X.neckX, -(yawC + turnS + stingBend) * 0.55 + lookYaw * 0.45 + X.neckY, -rollC * 0.5 + X.neckZ);
    head.rotation.set(nod * 0.5 + X.headX, -(yawCLag + stingBend) * 0.4 + lookYaw * 0.55 + X.headY, -rollC * 0.4 + idleLook * 0.15 + X.headZ);

    const tY3 = X.tailY / 3;
    tail1.rotation.set(tp * 0.5 - pitchBody * 0.35 + X.tailX * 0.4 + X.t1x, tailY0 + tY3, -rollP * 0.6 + X.tailZ);
    tail2.rotation.set(tp * 0.3 + X.tailX * 0.33 + X.t2x, tailY1 + tY3, X.tailZ);
    tail3.rotation.set(tp * 0.25 + X.tailX * 0.27 + X.t3x, tailY2 + tY3, 0);

    // rig: the sting spin hop, the celebration bounce and the tricks move the whole animal. Rotations
    // turn about a pivot (body centre by default) so flips and rolls spin in place.
    const rigYaw0 = stingT >= 0 ? -stingSide * TAU * spinE : 0;
    const rigY0 = (stingT >= 0 ? 0.075 * spinArc : 0) + celW * 0.045 * celHop;
    rig.rotation.set(X.rigPitch, rigYaw0 + X.rigYaw, X.rigRoll);
    tB.set(0, X.pivY, X.pivZ).applyEuler(rig.rotation);
    rig.position.set(X.rigX - tB.x, rigY0 + X.rigY + (X.pivY - tB.y), X.rigZ + (X.pivZ - tB.z));

    // ---------------- legs (two-bone IK in rig space) ----------------
    hips.updateMatrix();
    spine1.updateMatrix();
    spine2.updateMatrix();
    chest.updateMatrix();
    mChest.multiplyMatrices(hips.matrix, spine1.matrix).multiply(spine2.matrix).multiply(chest.matrix);

    const xAir = X.air > 1 ? 1 : X.air;
    for (let i = 0; i < 4; i++) {
      const f = feet[i];
      const o = FO[i];
      let aw = airW;
      if (i !== kickIdx && spinArc > aw) aw = spinArc;
      if (xAir > aw) aw = xAir;
      airPose(f, airW > 0.02 ? kS : clamp(X.airK, -1, 1));
      let px = lerp(f.x, air.x, aw);
      let py = lerp(ANKLE_H + f.lift, air.y, aw);
      let pz = lerp(f.z, air.z, aw);
      let pitch = f.pitch * (1 - aw) + 0.35 * aw;
      let yaw = f.side * f.toe + f.yaw * (1 - aw);
      let fold = 1 - 0.22 * f.fold * (1 - aw) + 0.14 * aw;
      if (o.w > 0) {
        pitch = lerp(pitch, o.pitch, o.w);
        yaw = lerp(yaw, f.side * f.toe + o.yaw, o.w);
        fold = lerp(fold, o.fold, o.w);
      }
      if (o.rw > 0) {
        px = lerp(px, o.rx, o.rw);
        py = lerp(py, o.ry, o.rw);
        pz = lerp(pz, o.rz, o.rw);
      }
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
      if (o.bw > 0) {
        tB.set(o.bx, o.by, o.bz).applyMatrix4(f.front ? mChest : hips.matrix);
        tA.lerp(tB, o.bw);
      }
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
      tP.copy(f.pole);
      if (o.pw > 0) { tB.set(o.pvx, o.pvy, o.pvz); tP.lerp(tB, o.pw); }
      tP.addScaledVector(tD, -tP.dot(tD));
      if (tP.lengthSq() < 1e-8) tP.set(f.side, 0, 0);
      tP.normalize();
      tE.copy(tS).addScaledVector(tD, along).addScaledVector(tP, h);
      orient(f.upper, tS, tE, stretch);
      orient(f.lower, tE, tA, stretch);
      f.foot.position.copy(tA);
      f.foot.rotation.set(pitch, yaw, o.w > 0 ? o.roll * o.w : 0);
      f.foot.scale.set(fold, 1, 1);
    }

    // ---------------- eyes + shader drivers ----------------
    blinkNext -= dt;
    if (blinkNext <= 0 && blinkT < 0) {
      blinkT = 0;
      blinkNext = 2.2 + Math.random() * 3.8;
      if (X.noBlink > 0.5) blinkT = -1;
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
    if (X.lid > lid) lid = X.lid;
    if (eyeOverride !== null) lid = 1 - eyeOverride;
    if (X.lidHard > lid) lid = X.lidHard;
    eyes.scale.y = EYE_K * (1 - 0.93 * sat(lid));

    U.bristle.value = bristle;
    U.billGlow.value = billGlow;
    U.spurGlow.value = spurGlow > X.spur ? spurGlow : X.spur;
    U.wet.value = wet;
    extPost(dt);

    // ---------------- crossfade out of the previous pose ----------------
    if (xfT < xfDur) {
      xfT += dt;
      if (xfT < xfDur) {
        const k0 = xfT / xfDur, k = k0 * k0 * (3 - 2 * k0);
        for (let i = 0; i < xfBones.length; i++) {
          const b = xfBones[i];
          b.position.lerpVectors(xfP[i], b.position, k);
          b.scale.lerpVectors(xfS[i], b.scale, k);
          xfTmpQ.copy(b.quaternion);
          b.quaternion.copy(xfQ[i]).slerp(xfTmpQ, k);
        }
      }
    }

    // ---------------- events ----------------
    if (evC > 0) {
      const n = evC;
      evC = 0;
      const cb = api.onEvent;
      if (cb) for (let i = 0; i < n; i++) cb(evT[i], evN[i]);
    }
  }

  // settle the rest pose so the model is valid before the first frame
  update(0, { speed: 0, maxSpeed: 3, grounded: true, vy: 0, turn: 0, moving: false, time: 0 });
  group.updateMatrixWorld(true);

  return api;
}

// =================================================================================================
// LEVELS2.md B3 — module-level parts of the extensions
// =================================================================================================
const POTION_DUR = 0.55, POTION_RELEASE = 0.2;
const SCREAM_TIME = 0.12;
const FINISH_DUR = 0.85, FINISH_HIT = 0.4;
const SITUP_DUR = 1.6, CHEER_DUR = 1.2, FIRE_DUR = 0.18;
// The King's attacks — binding numbers (boss.js times its telegraphs with them). "rear" is an extra
// (the last rise before the fall).
const ATTACKS = {
  sweep: { dur: 1.9, windup: 0.9, hit: 0.9, recover: 1.0 },
  slam: { dur: 2.9, windup: 1.0, hit: 1.0, recover: 1.9 },
  charge: { dur: 1.1, windup: 1.1 },
  pound: { dur: 2.2, windup: 1.1, hit: 1.1 },
  spit: { dur: 1.3, windup: 0.8, hit: 0.8 },
  roar: { dur: 1.8, hit: 0.5 },
  stagger: { dur: 2.5 },
  fall: { dur: 4.5, hit: 2.6 },
  rear: { dur: 2.2 },
};
// where attack(name, windupScale, hold) inserts its hold (anim seconds)
const ATK_HOLD = { slam: 1.4, pound: 1.5, stagger: 1.0 };

function mulberry(seed) {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Looks of the "tribe" and "king" variants (null for the player and the friend, whose shaders and
// numbers stay exactly as they were).
function variantSetup(variant, opts) {
  if (variant === 'king') {
    return {
      scale: 3.2, furTint: [0.2, 0.21, 0.26], bellyTint: [0.1, 0.1, 0.115], billTint: [0.55, 0.55, 0.62],
      mark: [0, 0, 0, 0], grey: 0.4, king: [1, 1, 1, 1], tailRound: 0.3, rim: [0.2, 0.23, 0.3],
      paint: null, headScale: 1, eyeK: 0.9, elder: false, young: false, collar: null,
    };
  }
  if (variant !== 'tribe') return null;
  const rnd = mulberry(((opts.seed | 0) * 7919 + 13) | 0);
  const t = rnd(), sz = rnd(), tw = rnd(), mk = rnd(), ms = rnd(), bl = rnd(), bi = rnd();
  const r = lerp(0.24, 0.69, t), g = lerp(0.17, 0.553, t), b = lerp(0.122, 0.369, t); // dark umber ... sandy
  const mark = [0, 0, 0, 0];
  const kind = Math.floor(mk * 5);
  if (kind >= 1 && kind <= 4) mark[kind - 1] = 0.65 + 0.35 * ms;
  const young = !!opts.young, elder = !!opts.elder;
  const bk = lerp(0.8, 1.1, bl), blk = lerp(0.9, 1.7, bi);
  const isHex = (v) => v !== undefined && v !== null && v !== false;
  return {
    scale: young ? 0.55 : lerp(0.82, 1.05, sz),
    furTint: [lin(r) / lin(0.34), lin(g) / lin(0.23), lin(b) / lin(0.145)],
    bellyTint: [bk, bk * 0.98, bk * 0.94], billTint: [blk, blk * 0.97, blk * 0.95],
    mark, grey: elder ? 1 : 0, king: [0, 0, 0, 0], tailRound: lerp(-0.5, 1, tw), rim: [0.3, 0.22, 0.15],
    paint: isHex(opts.paint) ? opts.paint : null, headScale: young ? 1.2 : 1, eyeK: young ? 1.3 : 1,
    elder, young, collar: isHex(opts.collar) ? opts.collar : null,
  };
}

// ---- extended fur / leather shader pieces (tribe and king only) ----
const FUR_X_VERT_DECL = 'varying vec2 vPlatyMask;\nuniform vec4 uKing;\nvarying vec3 vPlatyPos;\nvarying vec3 vPlatyNrm;';
const FUR_X_VERT_MAIN = [
  'vPlatyMask = aGlow;',
  'vPlatyPos = position;',
  'vPlatyNrm = normal;',
  '{ float pbw = uKing.w * smoothstep(0.282, 0.298, position.z) * (1.0 - smoothstep(0.316, 0.336, position.z)) * smoothstep(0.018, 0.04, abs(position.x)) * smoothstep(0.76, 0.9, normal.y);',
  '  transformed += normal * (0.011 * pbw); }',
].join('\n');
const FUR_X_FRAG_DECL = [
  'varying vec2 vPlatyMask;',
  'uniform vec4 uMark;',
  'uniform float uGrey;',
  'uniform float uPaint;',
  'uniform vec3 uPaintColor;',
  'uniform vec4 uKing;',
  'varying vec3 vPlatyPos;',
  'varying vec3 vPlatyNrm;',
  'float platySeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a; vec2 ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }',
].join('\n');
const FUR_X_FRAG_MAIN = [
  '#include <roughnessmap_fragment>',
  '{',
  '  vec3 pp = vPlatyPos;',
  '  vec3 pn = normalize(vPlatyNrm);',
  '  float pTop = smoothstep(0.3, 0.75, pn.y);',
  '  float pax = abs(pp.x);',
  '  float pLum = dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2));',
  '  float pFurTex = 1.0;',
  '  #ifdef USE_MAP',
  '    pFurTex = sampledDiffuseColor.g * 1.5;',
  '  #endif',
  // markings (one per animal, picked by its seed)
  '  float mStripe = uMark.x * pTop * (1.0 - smoothstep(0.014, 0.045, pax)) * smoothstep(-0.3, -0.2, pp.z) * (1.0 - smoothstep(0.22, 0.3, pp.z));',
  '  diffuseColor.rgb *= 1.0 - 0.62 * mStripe;',
  '  float mBlaze = uMark.y * pTop * (1.0 - smoothstep(0.008, 0.028, pax)) * smoothstep(0.23, 0.27, pp.z);',
  '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(pLum) * vec3(3.4, 3.0, 2.3) + 0.01, 0.8 * mBlaze);',
  '  float mMask = uMark.z * smoothstep(0.272, 0.29, pp.z) * (1.0 - smoothstep(0.322, 0.345, pp.z)) * smoothstep(0.2, 0.55, pn.y);',
  '  diffuseColor.rgb *= 1.0 - 0.6 * mMask;',
  '  float mRump = uMark.w * pTop * (1.0 - smoothstep(-0.12, -0.02, pp.z)) * smoothstep(-0.3, -0.2, pp.z);',
  '  mRump *= step(0.5, fract(sin(dot(floor(pp.xz * 70.0), vec2(12.9898, 78.233))) * 43758.5453));',
  '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(pLum) * vec3(3.0, 2.7, 2.1) + 0.008, 0.55 * mRump);',
  // old age: a grey muzzle and brows
  '  float pGrey = uGrey * smoothstep(0.262, 0.34, pp.z) * (0.55 + 0.45 * pTop);',
  '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(pLum * 2.4 + 0.02 * pFurTex), 0.85 * pGrey);',
  // war paint: two hand-smeared stripes across the back
  '  float pw1 = abs(pp.z - 0.112 - 0.007 * sin(pp.x * 55.0));',
  '  float pw2 = abs(pp.z + 0.03 - 0.008 * sin(pp.x * 47.0 + 1.3));',
  '  float pPaint = uPaint * smoothstep(-0.25, 0.1, pn.y) * max(1.0 - smoothstep(0.011, 0.016, pw1), 1.0 - smoothstep(0.009, 0.014, pw2));',
  '  pPaint *= 0.8 + 0.2 * step(0.25, fract(sin(dot(floor(pp.xz * 240.0), vec2(41.3, 17.9))) * 9731.7));',
  '  diffuseColor.rgb = mix(diffuseColor.rgb, uPaintColor, pPaint);',
  '  roughnessFactor = mix(roughnessFactor, 0.85, pPaint);',
  // the King: a silvered ridge, old scars, a notched tail
  '  float kRidge = uKing.x * pTop * (1.0 - smoothstep(0.012, 0.085, pax)) * smoothstep(-0.47, -0.3, pp.z) * (1.0 - smoothstep(0.25, 0.32, pp.z));',
  '  kRidge *= 0.55 + 0.45 * sin(pp.x * 310.0 + sin(pp.z * 40.0) * 2.0);',
  '  diffuseColor.rgb += vec3(0.21, 0.22, 0.245) * (max(kRidge, 0.0) * pFurTex);',
  '  float kFlank = min(min(platySeg(pp.yz, vec2(0.19, 0.075), vec2(0.105, -0.005)), platySeg(pp.yz, vec2(0.192, 0.04), vec2(0.11, -0.045))), platySeg(pp.yz, vec2(0.188, 0.005), vec2(0.115, -0.07)));',
  '  float kFace = min(platySeg(pp.xz, vec2(-0.018, 0.342), vec2(-0.078, 0.272)), platySeg(pp.xz, vec2(-0.04, 0.352), vec2(-0.084, 0.3)));',
  '  float kScar = uKing.y * max((1.0 - smoothstep(0.003, 0.0058, kFlank)) * step(0.06, pp.x), (1.0 - smoothstep(0.0026, 0.005, kFace)) * step(0.076, pp.y) * step(0.255, pp.z));',
  '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.2, 0.19), kScar);',
  '  roughnessFactor = mix(roughnessFactor, 0.42, kScar);',
  '  if (uKing.z > 0.5 && pp.z < -0.3) {',
  '    if (pp.x - 0.046 > abs(pp.z + 0.405) * 1.25) discard;',
  '    if (-pp.x - 0.058 > abs(pp.z + 0.452) * 1.1) discard;',
  '  }',
  '}',
].join('\n');
const LEATHER_X_FRAG_MAIN = [
  '#include <roughnessmap_fragment>',
  '{',
  '  float lBill = step(0.01, vPlatyGlow.x) * step(0.047, vPlatyPos.y);',
  '  float lS = uPaint * lBill * (1.0 - smoothstep(0.007, 0.011, abs(vPlatyPos.z - 0.425 - 0.004 * sin(vPlatyPos.x * 90.0))));',
  '  diffuseColor.rgb = mix(diffuseColor.rgb, uPaintColor, lS);',
  '  float lK = uKing.y * lBill * (1.0 - smoothstep(0.0016, 0.0034, abs((vPlatyPos.x + 0.02) * 0.8 + (vPlatyPos.z - 0.44) * 0.6))) * step(0.39, vPlatyPos.z) * (1.0 - step(0.485, vPlatyPos.z));',
  '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.27, 0.25), lK);',
  '}',
].join('\n');

// ---------------------------------------------------------------------------------------------
// The body surface, for things that must hug it (gear, the collar, the King's armor in boss.js).
// ---------------------------------------------------------------------------------------------
const _RING5 = [0, 0, 0, 0, 0];
// out = [z, halfWidth, centreY, halfHeightUp, halfHeightDown] of the body cross-section at z (model units)
export function platypusBodyRing(z, out) {
  return ringAtZ(BODY_ST, clamp(z, -0.5, 0.374), out || [0, 0, 0, 0, 0]);
}
// A point on the body surface at z: th = PI/2 on the spine, 0 on the animal's left flank (+X), -PI/2 under
// the belly; pushed out along the surface normal by off. out = [x, y, z, nx, ny].
export function platypusSurface(z, th, off, out) {
  out = out || [0, 0, 0, 0, 0];
  ringAtZ(BODY_ST, clamp(z, -0.5, 0.374), _RING5);
  const c = Math.cos(th), s = Math.sin(th);
  const nT = lerp(2.0, 2.3, smooth(-0.3, -0.18, z));
  const nB = lerp(lerp(2.0, 2.9, smooth(-0.3, -0.15, z)), 2.4, smooth(0.2, 0.3, z));
  const n = s >= 0 ? nT : nB;
  const w = _RING5[1], h = s >= 0 ? _RING5[3] : _RING5[4];
  const x = w * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 2 / n);
  const y = (s < 0 ? -1 : 1) * h * Math.pow(Math.abs(s), 2 / n);
  // gradient of the superellipse |x/w|^n + |y/h|^n = 1
  let nx = (c < 0 ? -1 : 1) * Math.pow(Math.abs(x) / w, n - 1) / w, ny = (s < 0 ? -1 : 1) * Math.pow(Math.abs(y) / h, n - 1) / h;
  const l = Math.hypot(nx, ny) || 1;
  nx /= l; ny /= l;
  out[0] = x + nx * off; out[1] = _RING5[2] + y + ny * off; out[2] = z; out[3] = nx; out[4] = ny;
  return out;
}

function buildCollar(THREE) {
  const pos = [], col = [], idx = [], S = [0, 0, 0, 0, 0];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * TAU, odd = i % 2;
    for (let r = 0; r < 3; r++) {
      const z = r === 0 ? 0.247 : r === 1 ? 0.226 : 0.203 - odd * 0.018;
      const off = r === 0 ? 0.004 : r === 1 ? 0.012 : 0.009 + odd * 0.011;
      platypusSurface(z, th, off, S);
      pos.push(S[0], S[1], S[2]);
      const k = (r === 0 ? 0.6 : r === 1 ? 1 : 0.8) * (0.85 + 0.15 * Math.sin(i * 2.7));
      col.push(k, k, k * 0.9);
    }
  }
  for (let i = 0; i < N; i++) for (let r = 0; r < 2; r++) {
    const a = i * 3 + r, b = a + 3;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------------
// Gear: ONE skinned mesh holding every piece; a per-vertex piece id and a uniform mask show what is
// worn, so a full set costs one draw call (~3k triangles). Built on first use, shared by all instances.
// ---------------------------------------------------------------------------------------------
const GP_LEAF = 0, GP_GUARDS = 1, GP_SUIT = 2, GP_HELM = 3, GP_GLASSES = 4, GP_BLASTER = 5, GP_PACK = 6;
const GEAR_Y = 0.238;                        // the launcher's axis above the back
const GEAR_PIVOT = [0, GEAR_Y, 0.085];       // it swivels here (bind space)
const GEAR_MUZZLE = [0, GEAR_Y, 0.25];
let GEAR = null;

const GEAR_VERT_DECL = '#include <common>\nuniform float uGearShow[8];\nuniform float uGearAim;\nuniform float uGearKick;\nuniform vec3 uGearPivot;\nattribute vec4 aGear;\nvarying vec2 vGearFx;';
const GEAR_VERT_NORMAL = '#include <beginnormal_vertex>\nfloat gAimC = cos(uGearAim);\nfloat gAimS = sin(uGearAim);\nif (aGear.w > 0.5) objectNormal = vec3(objectNormal.x * gAimC + objectNormal.z * gAimS, objectNormal.y, objectNormal.z * gAimC - objectNormal.x * gAimS);';
const GEAR_VERT_BEGIN = '#include <begin_vertex>\nvGearFx = aGear.yz;\nif (aGear.w > 0.5) { vec3 gq = transformed - uGearPivot; gq.z -= uGearKick; transformed = uGearPivot + vec3(gq.x * gAimC + gq.z * gAimS, gq.y, gq.z * gAimC - gq.x * gAimS); }';
const GEAR_VERT_PROJECT = '#include <project_vertex>\nif (uGearShow[int(aGear.x + 0.5)] < 0.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);';
const GEAR_FRAG_DECL = '#include <common>\nvarying vec2 vGearFx;\nuniform float uGearGlow;';
const GEAR_FRAG_ROUGH = '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.28, vGearFx.y);';
const GEAR_FRAG_EMISSIVE = '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.2, 1.0, 0.45) * (vGearFx.x * uGearGlow);';

function buildGear(THREE, A) {
  const pos = [], col = [], si = [], sw = [], gear = [], idx = [];
  const SI = [0, 0, 0, 0], SW = [1, 0, 0, 0], S = [0, 0, 0, 0, 0];
  let piece = 0, glow = 0, gloss = 0, aim = 0, bone = -1; // bone < 0: skinned like the body at that z

  function vtx(x, y, z, c, k, zSkin) {
    if (bone >= 0) { SI[0] = bone; SI[1] = SI[2] = SI[3] = 0; SW[0] = 1; SW[1] = SW[2] = SW[3] = 0; }
    else A.bodySkin(clamp(zSkin === undefined ? z : zSkin, -0.5, 0.37), SI, SW);
    const kk = k === undefined ? 1 : k;
    pos.push(x, y, z);
    col.push(lin(c[0] * kk), lin(c[1] * kk), lin(c[2] * kk));
    si.push(SI[0], SI[1], SI[2], SI[3]);
    sw.push(SW[0], SW[1], SW[2], SW[3]);
    gear.push(piece, glow, gloss, aim);
    return pos.length / 3 - 1;
  }
  function grid(base, ni, nj) {
    const row = nj + 1;
    for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
      const a = base + i * row + j, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  // a patch that hugs the body: z0..z1, th0..th1, pushed out by offFn(u, v); colFn(u, v) -> [colour, shade]
  function shell(z0, z1, nz, th0, th1, nth, offFn, colFn) {
    const base = pos.length / 3;
    for (let i = 0; i <= nz; i++) for (let j = 0; j <= nth; j++) {
      const u = i / nz, v = j / nth;
      platypusSurface(lerp(z0, z1, u), lerp(th0, th1, v), offFn(u, v), S);
      const cc = colFn(u, v);
      vtx(S[0], S[1], S[2], cc[0], cc[1]);
    }
    grid(base, nz, nth);
  }
  // a tube along a polyline. ref: a direction never parallel to the path (keeps the cross-section from twisting)
  function tube(pts, rad, segs, c, ref, kFn) {
    const base = pos.length / 3, n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[i > 0 ? i - 1 : 0], b = pts[i < n - 1 ? i + 1 : n - 1];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      let sx = ty * ref[2] - tz * ref[1], sy = tz * ref[0] - tx * ref[2], sz = tx * ref[1] - ty * ref[0];
      const sl = Math.hypot(sx, sy, sz) || 1;
      sx /= sl; sy /= sl; sz /= sl;
      const ux = sy * tz - sz * ty, uy = sz * tx - sx * tz, uz = sx * ty - sy * tx;
      const t = n > 1 ? i / (n - 1) : 0;
      const r = typeof rad === 'function' ? rad(t) : rad;
      for (let j = 0; j <= segs; j++) {
        const an = (j / segs) * TAU, ca = Math.cos(an) * r, sa = Math.sin(an) * r;
        vtx(p[0] + sx * ca + ux * sa, p[1] + sy * ca + uy * sa, p[2] + sz * ca + uz * sa, c, kFn ? kFn(t, j / segs) : 1, p[2]);
      }
    }
    grid(base, n - 1, segs);
  }
  function hoop(z, th0, th1, n, off, rad, c, segs) {
    const pts = [];
    for (let i = 0; i <= n; i++) { platypusSurface(z, lerp(th0, th1, i / n), off, S); pts.push([S[0], S[1], S[2]]); }
    tube(pts, rad, segs || 5, c, [0, 0, 1]);
  }
  function box(cx, cy, cz, hx, hy, hz, c, k, zSkin) {
    const b0 = pos.length / 3;
    for (let i = 0; i < 8; i++) vtx(cx + (i & 1 ? hx : -hx), cy + (i & 2 ? hy : -hy), cz + (i & 4 ? hz : -hz), c, (k === undefined ? 1 : k) * (i & 2 ? 1 : 0.75), zSkin === undefined ? cz : zSkin);
    const F = [0, 1, 3, 2, 4, 6, 7, 5, 0, 4, 5, 1, 2, 3, 7, 6, 0, 2, 6, 4, 1, 5, 7, 3];
    for (let f = 0; f < 24; f += 4) idx.push(b0 + F[f], b0 + F[f + 1], b0 + F[f + 2], b0 + F[f], b0 + F[f + 2], b0 + F[f + 3]);
  }
  // a broad pointed leaf growing from p along d, lying on a surface whose normal is n
  function leaf(px, py, pz, dx, dy, dz, nx, ny, nz, len, wid, c, k) {
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    let sx = dy * nz - dz * ny, sy = dz * nx - dx * nz, sz = dx * ny - dy * nx;
    const sl = Math.hypot(sx, sy, sz) || 1;
    sx /= sl; sy /= sl; sz /= sl;
    const base = pos.length / 3;
    const T = [0, 0.3, 0.68, 1], W = [0.3, 1, 0.72, 0.02];
    for (let i = 0; i < 4; i++) {
      const t = T[i], w = W[i] * wid * 0.5, lift = len * (0.1 * t * t + 0.03);
      const cx = px + dx * len * t + nx * lift, cy = py + dy * len * t + ny * lift, cz = pz + dz * len * t + nz * lift;
      const sh = k * (0.8 + 0.2 * t);
      vtx(cx - sx * w, cy - sy * w, cz - sz * w, c, sh * 0.9, pz);
      vtx(cx + nx * wid * 0.07, cy + ny * wid * 0.07, cz + nz * wid * 0.07, c, sh * 1.12, pz); // midrib
      vtx(cx + sx * w, cy + sy * w, cz + sz * w, c, sh, pz);
    }
    grid(base, 3, 2);
  }

  const C_LEAF_A = [0.2, 0.38, 0.13], C_LEAF_B = [0.3, 0.44, 0.15], C_LEAF_C = [0.47, 0.4, 0.14], C_VINE = [0.26, 0.24, 0.12];
  const C_BONE = [0.87, 0.81, 0.67], C_CORD = [0.33, 0.24, 0.14];
  const C_SUIT = [0.085, 0.09, 0.098], C_PANEL = [0.125, 0.13, 0.135], C_POUCH = [0.14, 0.145, 0.12], C_STRAP = [0.05, 0.052, 0.055], C_BUCKLE = [0.42, 0.42, 0.4];
  const C_FRAME = [0.035, 0.035, 0.04], C_LENS = [0.02, 0.07, 0.045];
  const C_GUN = [0.1, 0.11, 0.125], C_GUN2 = [0.2, 0.21, 0.22], C_BORE = [0.01, 0.01, 0.012], C_LIGHT = [0.1, 0.5, 0.25];
  const C_LEATHER = [0.4, 0.27, 0.15], C_FLAP = [0.5, 0.35, 0.2];
  const rr = mulberry(4242);

  // ---- body "leaf": a mantle of overlapping leaves laced with vine, bone toggles ----
  piece = GP_LEAF; glow = 0; gloss = 0; aim = 0; bone = -1;
  const LEAF_ROWS = [0.205, 0.135, 0.065, -0.005, -0.075];
  for (let r = LEAF_ROWS.length - 1; r >= 0; r--) { // back rows first so the front ones overlap them
    const z = LEAF_ROWS[r], odd = r % 2, n = odd ? 4 : 5;
    for (let k = 0; k < n; k++) {
      const th = PI / 2 + (k - (n - 1) / 2) * 0.43 + (rr() - 0.5) * 0.08;
      platypusSurface(z, th, 0.007, S);
      const lean = Math.cos(th) * 0.5; // the outer leaves hang down the flanks
      const cc = rr() < 0.18 ? C_LEAF_C : rr() < 0.5 ? C_LEAF_A : C_LEAF_B;
      leaf(S[0], S[1], S[2], lean * 0.6, -Math.abs(lean) * 0.5, -1, S[3], S[4], 0, 0.105 + rr() * 0.03, 0.058 + rr() * 0.014, cc, 0.85 + rr() * 0.3);
    }
  }
  hoop(0.17, 0.2, PI - 0.2, 12, 0.013, 0.0042, C_VINE, 5);
  hoop(0.02, 0.25, PI - 0.25, 12, 0.014, 0.0042, C_VINE, 5);
  for (let k = 0; k < 3; k++) for (let h = 0; h < 2; h++) {
    platypusSurface(h ? 0.02 : 0.17, PI / 2 + (k - 1) * 0.62, 0.02, S);
    box(S[0], S[1], S[2], 0.0035, 0.0035, 0.011, C_BONE, 1);
  }

  // ---- rib-bone shoulder guards (worn with "leaf" and over the "suit") ----
  piece = GP_GUARDS;
  for (let sd = -1; sd <= 1; sd += 2) {
    const tie = [];
    for (let k = 0; k < 3; k++) {
      const z = 0.148 + k * 0.036, pts = [];
      for (let i = 0; i <= 7; i++) {
        const t = i / 7, th0 = lerp(0.18, 1.22, t), th = sd > 0 ? th0 : PI - th0;
        platypusSurface(z + 0.006 * Math.sin(PI * t), th, 0.013 + 0.016 * Math.sin(PI * t), S);
        pts.push([S[0], S[1], S[2]]);
        if (i === 4) tie.push([S[0] + S[3] * 0.006, S[1] + S[4] * 0.006, S[2]]);
      }
      tube(pts, (t) => lerp(0.0072, 0.0032, t) * (1 + 0.25 * Math.exp(-t * 14)), 5, C_BONE, [0, 0, 1], (t) => 0.82 + 0.18 * t);
    }
    tie.unshift([tie[0][0], tie[0][1], tie[0][2] - 0.012]);
    tie.push([tie[3][0], tie[3][1], tie[3][2] + 0.012]);
    tube(tie, 0.0028, 4, C_CORD, [0, 1, 0]);
  }

  // ---- body "suit": a matte tactical vest, pouches, straps, a pad on every knee and elbow ----
  piece = GP_SUIT;
  shell(-0.135, 0.218, 11, -PI / 2, PI * 1.5, 22,
    (u) => 0.0075 - 0.0055 * Math.pow(Math.abs(2 * u - 1), 6),
    (u, v) => {
      const top = Math.sin(lerp(-PI / 2, PI * 1.5, v));
      const panel = top > 0.45 && u > 0.18 && u < 0.82 && Math.abs(u - 0.5) > 0.03;
      return [panel ? C_PANEL : C_SUIT, 0.9 + 0.1 * Math.sin(u * 40) * (panel ? 1 : 0)];
    });
  for (let sd = -1; sd <= 1; sd += 2) {
    for (let k = 0; k < 2; k++) {
      platypusSurface(0.1 - k * 0.1, sd > 0 ? 0.42 : PI - 0.42, 0.016, S);
      box(S[0], S[1], S[2], 0.011, 0.02, 0.024, C_POUCH, 1);
      box(S[0] + sd * 0.003, S[1] + 0.012, S[2], 0.0115, 0.009, 0.025, C_PANEL, 1.1);
    }
    platypusSurface(-0.085, PI / 2 - sd * 0.6, 0.015, S);
    box(S[0], S[1], S[2], 0.02, 0.011, 0.022, C_POUCH, 0.95);
  }
  hoop(0.135, -PI / 2, PI * 1.5, 22, 0.0095, 0.0048, C_STRAP, 4);
  hoop(-0.05, -PI / 2, PI * 1.5, 22, 0.0095, 0.0048, C_STRAP, 4);
  gloss = 0.7;
  platypusSurface(0.135, PI / 2, 0.014, S); box(S[0], S[1], S[2], 0.011, 0.004, 0.008, C_BUCKLE, 1);
  platypusSurface(-0.05, PI / 2, 0.014, S); box(S[0], S[1], S[2], 0.011, 0.004, 0.008, C_BUCKLE, 1);
  gloss = 0;
  for (let i = 0; i < 4; i++) {
    bone = B_LEG0 + i * 3 + 1; // the lower limb: its bone space has the joint at the origin and the limb along +Z
    const pts = [[0, 0, -0.016], [0, 0, -0.004], [0, 0, 0.014], [0, 0, 0.03]];
    const base = pos.length / 3;
    const R = [0.031, 0.039, 0.037, 0.03];
    for (let a = 0; a < 4; a++) for (let j = 0; j <= 7; j++) {
      const an = (j / 7) * TAU;
      vtx(Math.cos(an) * R[a], Math.sin(an) * R[a], pts[a][2], a === 1 || a === 2 ? C_PANEL : C_SUIT, 1);
    }
    grid(base, 3, 7);
  }
  bone = -1;

  // ---- head "boneHelm": a skull-cap of bone with a leaf plume ----
  piece = GP_HELM; bone = B_HEAD;
  shell(0.258, 0.336, 6, 1.1, PI - 1.1, 8,
    (u, v) => 0.0085 * Math.pow(Math.max(0, Math.sin(PI * Math.min(1, u * 1.2 + 0.08))), 0.5) * Math.pow(Math.max(0, Math.sin(PI * v)), 0.35) + 0.0015,
    (u, v) => [C_BONE, 0.8 + 0.2 * Math.sin(PI * v) - 0.12 * (Math.abs(v - 0.5) < 0.04 ? 1 : 0)]);
  {
    const pts = [];
    for (let i = 0; i <= 8; i++) { platypusSurface(0.334, lerp(1.1, PI - 1.1, i / 8), 0.006, S); pts.push([S[0], S[1], S[2]]); }
    tube(pts, 0.0042, 4, C_BONE, [0, 0, 1], () => 0.9);
    platypusSurface(0.268, PI / 2, 0.009, S);
    leaf(S[0], S[1], S[2], 0, 0.55, -0.85, 0, 0.85, 0.55, 0.11, 0.04, C_LEAF_B, 1.05);
    leaf(S[0] + 0.012, S[1] - 0.002, S[2], 0.3, 0.4, -0.85, 0, 0.85, 0.55, 0.085, 0.034, C_LEAF_A, 0.95);
    leaf(S[0] - 0.012, S[1] - 0.002, S[2], -0.3, 0.4, -0.85, 0, 0.85, 0.55, 0.085, 0.034, C_LEAF_C, 1);
  }

  // ---- eyes "glasses": a wrap-around visor on a strap ----
  piece = GP_GLASSES; bone = B_HEAD;
  {
    const base = pos.length / 3, NV = 16;
    for (let i = 0; i <= 2; i++) for (let j = 0; j <= NV; j++) {
      const v = j / NV, th = lerp(0.6, PI - 0.6, v), z = lerp(0.294, 0.324, i / 2);
      const eye = Math.min(Math.abs(th - EYE_TH), Math.abs(th - (PI - EYE_TH)));
      const lens = eye < 0.3 && i === 1;
      platypusSurface(z, th, 0.0075 + (i === 1 ? 0.0025 : 0), S);
      glow = lens ? 0.55 : 0; gloss = lens ? 1 : 0.5;
      vtx(S[0], S[1], S[2], eye < 0.34 ? C_LENS : C_FRAME, lens ? 1.3 : 1);
    }
    grid(base, 2, NV);
    glow = 0; gloss = 0;
    hoop(0.286, PI - 0.6, TAU + 0.6, 10, 0.004, 0.0036, C_STRAP, 4);
  }

  // ---- weapon "blaster": a short tube launcher along the spine with a sight ----
  piece = GP_BLASTER; bone = B_CHEST; aim = 1; gloss = 0.55;
  {
    const Y = GEAR_Y, Z0 = -0.005, Z1 = GEAR_MUZZLE[2];
    tube([[0, Y, Z0 - 0.004], [0, Y, Z0], [0, Y, Z0 + 0.03], [0, Y, 0.12], [0, Y, Z1 - 0.04], [0, Y, Z1 - 0.03], [0, Y, Z1], [0, Y, Z1 - 0.012]],
      (t) => [0.004, 0.02, 0.022, 0.0205, 0.0205, 0.026, 0.0265, 0.017][Math.round(t * 7)], 9, C_GUN, [0, 1, 0],
      (t) => (t > 0.99 ? 0.12 : t > 0.6 && t < 0.75 ? 1.5 : 1));
    box(0, Y + 0.027, 0.115, 0.0035, 0.007, 0.014, C_GUN2, 1, 0.1);
    box(0, Y + 0.036, 0.115, 0.007, 0.003, 0.004, C_GUN2, 1.2, 0.1);
    box(0, Y + 0.025, 0.215, 0.0025, 0.005, 0.004, C_GUN2, 1.2, 0.1);
    box(0.021, Y, 0.06, 0.004, 0.008, 0.03, C_GUN2, 0.8, 0.1); // magazine / grip block
    gloss = 0.2; glow = 0.9;
    box(0, Y + 0.022, 0.02, 0.004, 0.003, 0.004, C_LIGHT, 1.5, 0.1);
    glow = 0; gloss = 0.3; aim = 0;
    box(0, Y - 0.02, GEAR_PIVOT[2], 0.016, 0.006, 0.02, C_GUN, 0.8, 0.1); // the mount does not swivel
    box(0, Y - 0.011, GEAR_PIVOT[2], 0.006, 0.006, 0.006, C_GUN2, 1, 0.1);
    gloss = 0; bone = -1;
    hoop(GEAR_PIVOT[2], 0.2, PI - 0.2, 10, 0.011, 0.004, C_STRAP, 4);
  }
  bone = -1; aim = 0; gloss = 0;

  // ---- back "pack": a small satchel ----
  piece = GP_PACK; bone = B_HIPS;
  {
    platypusSurface(-0.105, PI / 2, 0, S);
    const Y = S[1] + 0.02;
    box(0, Y, -0.105, 0.046, 0.021, 0.04, C_LEATHER, 1, -0.1);
    box(0, Y + 0.017, -0.098, 0.048, 0.006, 0.034, C_FLAP, 1.05, -0.1);
    box(0, Y + 0.004, -0.062, 0.049, 0.012, 0.004, C_FLAP, 0.95, -0.1);
    gloss = 0.7;
    box(0, Y + 0.002, -0.056, 0.006, 0.006, 0.003, C_BUCKLE, 1, -0.1);
    gloss = 0; bone = -1;
    hoop(-0.085, -PI / 2, PI * 1.5, 20, 0.005, 0.004, C_CORD, 4);
    hoop(-0.125, -PI / 2, PI * 1.5, 20, 0.005, 0.004, C_CORD, 4);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setAttribute('aGear', new THREE.Float32BufferAttribute(gear, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.15, 0), 0.9);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-0.5, -0.1, -0.7), new THREE.Vector3(0.5, 0.6, 0.7));
  return { geo: g, triangles: idx.length / 3 };
}

// ---------------------------------------------------------------------------------------------
// createPlatypusCrowd — the cheap many: ONE InstancedMesh of a ~370-triangle platypus; every motion
// (gait, rearing, sleeping, falling ...) is computed in the vertex shader from per-instance attributes.
// ---------------------------------------------------------------------------------------------
const CROWD_ANIM = { idle: 0, walk: 1, run: 2, attack: 3, cheer: 4, sleep: 5, sit: 6, down: 7, eat: 8 };
let CROWD_GEO = null;

function buildCrowdGeo(THREE) {
  const pos = [], colA = [], rig = [], idx = [], S = [0, 0, 0, 0, 0];
  function v(x, y, z, fur, belly, dark, eye, px, py, pz, lp) {
    pos.push(x, y, z); colA.push(fur, belly, dark, eye); rig.push(px, py, pz, lp);
    return pos.length / 3 - 1;
  }
  function grid(base, ni, nj) {
    const row = nj + 1;
    for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
      const a = base + i * row + j, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  // body + tail
  const ZS = [-0.5, -0.478, -0.415, -0.335, -0.268, -0.2, -0.11, 0.0, 0.11, 0.19, 0.255, 0.305, 0.345, 0.372];
  const SEG = 8;
  let base = 0;
  for (let i = 0; i < ZS.length; i++) for (let j = 0; j <= SEG; j++) {
    const th = -PI / 2 + ((j % SEG) / SEG) * TAU, z = ZS[i];
    platypusSurface(z, th, 0, S);
    const fur = z < -0.25 ? 1 : smooth(-0.85, -0.25, Math.sin(th));
    const shade = z < -0.25 ? 0.72 : 1;
    v(S[0], S[1], z, fur * shade, (1 - fur) * shade, 0, 0, 0, 0, 0, -1);
  }
  grid(base, ZS.length - 1, SEG);
  // bill
  base = pos.length / 3;
  const BZ = [0.335, 0.36, 0.395, 0.45, 0.485, 0.5], BS = 6, B5 = [0, 0, 0, 0, 0];
  for (let i = 0; i < BZ.length; i++) {
    ringAtZ(BILL_ST, BZ[i], B5);
    for (let j = 0; j <= BS; j++) {
      const th = -PI / 2 + ((j % BS) / BS) * TAU, c = Math.cos(th), s = Math.sin(th);
      const x = B5[1] * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 0.75);
      const y = B5[2] + (s >= 0 ? B5[3] : -(B5[4] + 0.006)) * Math.pow(Math.abs(s), 0.75); // thick enough below to stand for the lower bill
      v(x, y, BZ[i], 0, 0, 1, 0, 0, 0, 0, -1);
    }
  }
  grid(base, BZ.length - 1, BS);
  // legs: a bent tapered limb and a webbed foot, swung about the hip in the shader
  const OFF = [0.4, 0.9, 0.0, 0.5];
  for (let i = 0; i < 4; i++) {
    const front = i < 2, side = i % 2 === 0 ? 1 : -1;
    const hz = front ? 0.185 : -0.135;
    const P = [[side * 0.095, 0.092, hz], [side * 0.172, 0.094, hz + (front ? -0.02 : 0.03)], [side * 0.19, 0.028, hz + (front ? 0.015 : -0.01)]];
    const R = [0.042, 0.03, 0.021];
    base = pos.length / 3;
    for (let a = 0; a < 3; a++) for (let j = 0; j <= 4; j++) {
      const an = (j / 4) * TAU + PI / 4;
      // cross-sections: across the limb at the hip, on the bisector at the knee, level at the ankle
      const ex = a === 0 ? 0 : a === 1 ? side * 0.707 : side, ey = a === 0 ? 1 : a === 1 ? 0.707 : 0;
      const cr = Math.cos(an) * R[a];
      v(P[a][0] + ex * cr, P[a][1] + ey * cr, P[a][2] + Math.sin(an) * R[a], 0.8, 0, 0.2, 0, P[0][0], P[0][1], P[0][2], OFF[i]);
    }
    grid(base, 2, 4);
    // foot fan
    const fr = front ? 0.078 : 0.062, c0 = v(P[2][0], 0.006, P[2][2] - 0.012, 0, 0, 1, 0, P[0][0], P[0][1], P[0][2], OFF[i]);
    const yawF = side * (front ? 0.3 : 0.95);
    let prev = -1;
    for (let k = 0; k <= 4; k++) {
      const an = yawF + (k / 4 - 0.5) * (front ? 1.5 : 1.15);
      const q = v(P[2][0] + Math.sin(an) * fr, 0.004, P[2][2] - 0.012 + Math.cos(an) * fr, 0, 0, 1, 0, P[0][0], P[0][1], P[0][2], OFF[i]);
      if (prev >= 0) idx.push(c0, prev, q);
      prev = q;
    }
  }
  // eyes
  platypusSurface(EYE_Z, EYE_TH, 0.001, S);
  for (let sd = -1; sd <= 1; sd += 2) {
    const ex = sd * S[0], ey = S[1], ez = EYE_Z, r = 0.0125;
    const o = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]];
    base = pos.length / 3;
    for (let k = 0; k < 6; k++) v(ex + o[k][0], ey + o[k][1], ez + o[k][2], 0, 0, 0, 1, ex, ey, ez, -1);
    const F = [0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5];
    for (let k = 0; k < F.length; k++) idx.push(base + F[k]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(colA, 4));
  g.setAttribute('aRig', new THREE.Float32BufferAttribute(rig, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const CROWD_VERT_DECL = [
  '#include <common>',
  'uniform float uCrowdTime;',
  'attribute vec4 aRig;',
  'attribute vec4 aCol;',
  'attribute vec4 aInstA;',
  'attribute vec4 aInstB;',
  'attribute vec4 aInstC;',
  'varying vec3 vCrowdCol;',
  'varying vec3 vCrowdPos;',
  'varying vec4 vCrowdPaint;',
  'varying float vCrowdFade;',
  // a: leg swing, step rate, rear-up, roll      b: drop, hop, hop rate, head dip
  // c: tail lift, leap (attack), curl, breath   d: eyes shut, spine wave, tail sway, front paws up
  'void cwAnim(float id, out vec4 a, out vec4 b, out vec4 c, out vec4 d) {',
  '  a = vec4(0.0, 1.0, 0.0, 0.0); b = vec4(0.0, 0.0, 1.0, 0.0); c = vec4(0.0, 0.0, 0.0, 0.012); d = vec4(0.0, 0.0, 0.07, 0.0);',
  '  if (id < 0.5) { }',
  '  else if (id < 1.5) { a.xy = vec2(0.5, 1.9); d.y = 0.012; d.z = 0.1; }',
  '  else if (id < 2.5) { a.xy = vec2(0.8, 3.3); b.yz = vec2(0.014, 6.6); c.x = 0.15; d.y = 0.02; d.z = 0.12; }',
  '  else if (id < 3.5) { a.xy = vec2(0.3, 3.0); c.x = 0.3; c.y = 1.0; }',
  '  else if (id < 4.5) { a.z = 0.75; b.yz = vec2(0.055, 2.6); c.x = 0.2; d.z = 0.2; d.w = 1.0; }',
  '  else if (id < 5.5) { b.x = 0.03; b.w = 1.0; c.z = 1.0; c.w = 0.03; d.x = 1.0; d.z = 0.0; }',
  '  else if (id < 6.5) { a.z = 0.85; c.x = -0.5; d.z = 0.04; }',
  '  else if (id < 7.5) { a.w = 1.45; c.w = 0.0; d.x = 1.0; d.z = 0.0; }',
  '  else { b.w = 1.0; d.z = 0.1; }',
  '}',
].join('\n');
const CROWD_VERT_NORMAL = [
  '#include <beginnormal_vertex>',
  'vec4 cwA; vec4 cwB; vec4 cwC; vec4 cwD;',
  '{',
  '  vec4 a0; vec4 b0; vec4 c0; vec4 d0; vec4 a1; vec4 b1; vec4 c1; vec4 d1;',
  '  cwAnim(aInstA.y, a0, b0, c0, d0);',
  '  cwAnim(aInstA.x, a1, b1, c1, d1);',
  '  float cwK = smoothstep(0.0, 0.3, uCrowdTime - aInstA.z);',
  '  cwA = mix(a0, a1, cwK); cwB = mix(b0, b1, cwK); cwC = mix(c0, c1, cwK); cwD = mix(d0, d1, cwK);',
  '}',
  'float cwT = uCrowdTime + aInstA.w * 7.0;',
  'float cwCyc = fract(cwT * 1.5);',
  'float cwLeap = cwC.y * sin(3.14159 * smoothstep(0.08, 0.6, cwCyc));',
  'float cwSpin = cwC.y * 6.28318 * smoothstep(0.12, 0.55, cwCyc);',
  'float cwPitch = cwA.z + 0.22 * cwLeap;',
  'float cwCP = cos(cwPitch); float cwSP = sin(cwPitch);',
  'float cwCR = cos(cwA.w); float cwSR = sin(cwA.w);',
  'float cwCS = cos(cwSpin); float cwSS = sin(cwSpin);',
  'objectNormal = vec3(objectNormal.x, objectNormal.y * cwCP + objectNormal.z * cwSP, objectNormal.z * cwCP - objectNormal.y * cwSP);',
  'objectNormal = vec3(objectNormal.x * cwCR - objectNormal.y * cwSR, objectNormal.x * cwSR + objectNormal.y * cwCR, objectNormal.z);',
  'objectNormal = vec3(objectNormal.x * cwCS + objectNormal.z * cwSS, objectNormal.y, objectNormal.z * cwCS - objectNormal.x * cwSS);',
].join('\n');
const CROWD_VERT_BEGIN = [
  '#include <begin_vertex>',
  'vCrowdPos = position;',
  '{',
  '  vec3 p = transformed;',
  '  float ph = cwT * cwA.y;',
  '  if (aCol.w > 0.5) p = mix(p, aRig.xyz, cwD.x * 0.85);',
  '  if (aRig.w >= 0.0) {',
  '    float lp = 6.28318 * (ph + aRig.w);',
  '    float front = step(0.0, aRig.z);',
  '    float ang = cwA.x * sin(lp) - cwD.w * front * 1.5 + cwA.z * (1.0 - front) * 0.5;',
  '    vec3 q = p - aRig.xyz;',
  '    float ca = cos(ang); float sa = sin(ang);',
  '    q = vec3(q.x, q.y * ca - q.z * sa, q.y * sa + q.z * ca);',
  '    q.y += cwA.x * 0.04 * max(0.0, -cos(lp)) * clamp(-q.y * 14.0, 0.0, 1.0);',
  '    q *= 1.0 - 0.35 * max(cwC.z, min(cwA.w, 1.0));',
  '    p = aRig.xyz + q;',
  '  } else {',
  '    float tailK = smoothstep(-0.2, -0.5, p.z);',
  '    float headK = smoothstep(0.16, 0.3, p.z);',
  '    p.x += cwD.y * sin(6.28318 * ph + p.z * 7.0) + cwD.z * 0.35 * tailK * sin(cwT * 1.7 + p.z * 4.0);',
  '    p.y -= headK * (p.z - 0.16) * cwB.w * mix(0.32 * (0.5 + 0.5 * sin(cwT * 4.4)), 0.3, cwD.x);',
  '    p.y += tailK * (-0.2 - p.z) * cwC.x * 0.6;',
  '    p.x -= cwC.z * p.z * p.z * 1.4;',
  '    float bz = 1.0 - smoothstep(0.1, 0.3, abs(p.z));',
  '    p.xy += vec2(p.x, p.y - 0.11) * (cwC.w * bz * sin(cwT * 1.6));',
  '  }',
  '  vec3 r = p - vec3(0.0, 0.03, -0.2);',
  '  r = vec3(r.x, r.y * cwCP + r.z * cwSP, r.z * cwCP - r.y * cwSP);',
  '  p = r + vec3(0.0, 0.03, -0.2);',
  '  r = p - vec3(0.0, 0.1, 0.0);',
  '  r = vec3(r.x * cwCR - r.y * cwSR, r.x * cwSR + r.y * cwCR, r.z);',
  '  p = r + vec3(0.0, 0.1 + 0.03 * cwSR, 0.0);',
  '  p = vec3(p.x * cwCS + p.z * cwSS, p.y, p.z * cwCS - p.x * cwSS);',
  '  p.y += cwB.y * abs(sin(3.14159 * cwT * cwB.z)) + 0.1 * cwLeap - cwB.x;',
  '  p.z += 0.16 * cwLeap;',
  '  transformed = p;',
  '}',
  '{',
  '  vec3 cFur = aInstB.rgb;',
  '  vec3 cBelly = cFur * 0.4 + vec3(0.36, 0.3, 0.2);',
  '  vec3 cDark = mix(vec3(0.016, 0.017, 0.02), cFur, 0.12);',
  '  vCrowdCol = cFur * aCol.x + cBelly * aCol.y + cDark * aCol.z + vec3(0.004) * aCol.w;',
  '}',
  'vCrowdPaint = aInstC;',
  'vCrowdFade = aInstB.a;',
].join('\n');
const CROWD_FRAG_DECL = '#include <common>\nvarying vec3 vCrowdCol;\nvarying vec3 vCrowdPos;\nvarying vec4 vCrowdPaint;\nvarying float vCrowdFade;';
const CROWD_FRAG_COLOR = [
  '#include <color_fragment>',
  '{',
  '  float cwTop = smoothstep(0.1, 0.15, vCrowdPos.y) * step(vCrowdPos.z, 0.3);',
  '  float cwSt = max(1.0 - smoothstep(0.013, 0.019, abs(vCrowdPos.z - 0.11)), 1.0 - smoothstep(0.011, 0.017, abs(vCrowdPos.z + 0.03)));',
  '  diffuseColor.rgb = mix(vCrowdCol, vCrowdPaint.rgb, cwSt * cwTop * vCrowdPaint.a);',
  '  if (vCrowdFade < 0.999) {',
  '    float cwDth = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));',
  '    if (vCrowdFade <= cwDth) discard;',
  '  }',
  '}',
].join('\n');

export function createPlatypusCrowd(THREE, max, opts) {
  max = Math.max(1, Math.min(1024, (max | 0) || 48));
  opts = opts || {};
  const baseGeo = CROWD_GEO || (CROWD_GEO = buildCrowdGeo(THREE));
  const geo = new THREE.BufferGeometry();
  geo.setIndex(baseGeo.index);
  geo.setAttribute('position', baseGeo.attributes.position);
  geo.setAttribute('normal', baseGeo.attributes.normal);
  geo.setAttribute('aCol', baseGeo.attributes.aCol);
  geo.setAttribute('aRig', baseGeo.attributes.aRig);
  const instA = new Float32Array(max * 4), instB = new Float32Array(max * 4), instC = new Float32Array(max * 4);
  const DEF = [lin(0.3), lin(0.2), lin(0.13)];
  for (let i = 0; i < max; i++) {
    instA[i * 4 + 2] = -10;
    instB[i * 4] = DEF[0]; instB[i * 4 + 1] = DEF[1]; instB[i * 4 + 2] = DEF[2]; instB[i * 4 + 3] = 1;
  }
  const attrA = new THREE.InstancedBufferAttribute(instA, 4), attrB = new THREE.InstancedBufferAttribute(instB, 4), attrC = new THREE.InstancedBufferAttribute(instC, 4);
  attrA.setUsage(THREE.DynamicDrawUsage); attrB.setUsage(THREE.DynamicDrawUsage); attrC.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aInstA', attrA);
  geo.setAttribute('aInstB', attrB);
  geo.setAttribute('aInstC', attrC);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.15, 0), 1e5);

  const uTime = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCrowdTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', CROWD_VERT_DECL)
      .replace('#include <beginnormal_vertex>', CROWD_VERT_NORMAL)
      .replace('#include <begin_vertex>', CROWD_VERT_BEGIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', CROWD_FRAG_DECL)
      .replace('#include <color_fragment>', CROWD_FRAG_COLOR);
  };
  mat.customProgramCacheKey = () => 'platypus-crowd-1';

  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.name = 'platypusCrowd';
  mesh.frustumCulled = false;
  mesh.castShadow = !!opts.castShadow;
  mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const M = mesh.instanceMatrix.array;
  for (let i = 0; i < max; i++) { const o = i * 16; M.fill(0, o, o + 16); M[o + 15] = 1; }
  mesh.count = 0;
  const group = new THREE.Group();
  group.name = 'platypusCrowdGroup';
  group.add(mesh);

  const shown = new Uint8Array(max);
  const H3 = [0, 0, 0];
  let clock = 0, hi = 0, dM = true, dA = true, dB = true, dC = true;

  function ok(i) { return i >= 0 && i < max && i === (i | 0); }
  function set(i, x, y, z, yaw, scale, tintHex) {
    if (!ok(i)) return;
    const o = i * 16, s = scale === undefined ? 1 : +scale || 0, c = Math.cos(yaw || 0) * s, sn = Math.sin(yaw || 0) * s;
    M[o] = c; M[o + 1] = 0; M[o + 2] = -sn; M[o + 3] = 0;
    M[o + 4] = 0; M[o + 5] = s; M[o + 6] = 0; M[o + 7] = 0;
    M[o + 8] = sn; M[o + 9] = 0; M[o + 10] = c; M[o + 11] = 0;
    M[o + 12] = +x || 0; M[o + 13] = +y || 0; M[o + 14] = +z || 0; M[o + 15] = 1;
    dM = true;
    if (!shown[i]) { shown[i] = 1; if (i >= hi) hi = i + 1; }
    if (tintHex !== undefined && tintHex !== null) {
      hexLin(tintHex, H3);
      const b = i * 4;
      if (instB[b] !== H3[0] || instB[b + 1] !== H3[1] || instB[b + 2] !== H3[2]) { instB[b] = H3[0]; instB[b + 1] = H3[1]; instB[b + 2] = H3[2]; dB = true; }
    }
  }
  function anim(i, name, phase) {
    if (!ok(i)) return;
    const id = CROWD_ANIM[name];
    if (id === undefined) return;
    const o = i * 4;
    if (instA[o] === id && phase === undefined) return;
    instA[o + 1] = instA[o]; instA[o] = id; instA[o + 2] = clock;
    if (phase !== undefined || instA[o + 3] === 0) instA[o + 3] = phase === undefined ? Math.random() : +phase || 0;
    dA = true;
  }
  function paint(i, hex) {
    if (!ok(i)) return;
    const o = i * 4;
    if (hex === null || hex === undefined || hex === false) { if (instC[o + 3] !== 0) { instC[o + 3] = 0; dC = true; } return; }
    hexLin(hex, H3);
    instC[o] = H3[0]; instC[o + 1] = H3[1]; instC[o + 2] = H3[2]; instC[o + 3] = 1;
    dC = true;
  }
  function hide(i) {
    if (!ok(i)) return;
    const o = i * 16;
    if (shown[i] || M[o] !== 0 || M[o + 5] !== 0) { M.fill(0, o, o + 16); M[o + 15] = 1; dM = true; }
    shown[i] = 0;
    const b = i * 4;
    if (instB[b + 3] !== 1) { instB[b + 3] = 1; dB = true; }
    if (instC[b + 3] !== 0) { instC[b + 3] = 0; dC = true; }
    if (instA[b] !== 0 || instA[b + 1] !== 0) { instA[b] = 0; instA[b + 1] = 0; instA[b + 2] = -10; dA = true; }
    while (hi > 0 && !shown[hi - 1]) hi--;
  }
  function fade(i, f) {
    if (!ok(i)) return;
    const v = sat(f === undefined ? 1 : +f || 0), b = i * 4 + 3;
    if (instB[b] !== v) { instB[b] = v; dB = true; }
  }
  function update(dt, time) {
    if (dt > 0) clock += dt;
    uTime.value = clock;
  }
  function commit() {
    if (dM) { mesh.instanceMatrix.needsUpdate = true; dM = false; }
    if (dA) { attrA.needsUpdate = true; dA = false; }
    if (dB) { attrB.needsUpdate = true; dB = false; }
    if (dC) { attrC.needsUpdate = true; dC = false; }
    mesh.count = hi;
  }
  function dispose() { geo.dispose(); mat.dispose(); }

  return {
    group, mesh, max, set, anim, paint, hide, fade, update, commit, dispose,
    get count() { return hi; },
    get triangles() { return baseGeo.index.count / 3; },
    anims: CROWD_ANIM,
  };
}

// Bind-pose joint positions (model units) for modules that build attachments (boss.js).
export const PLATYPUS_JOINTS = J;
