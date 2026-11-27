// humanoid.js - procedural skinned humanoids (CONTRACT 5.9). One SkinnedMesh, one shared material (vertex colours +
// per-vertex roughness/metalness/emissive), ~1.5-2.5k triangles, rigid parts bound to a 19-bone skeleton.
// Geometry is cached per (build, hair, beard, hat, dress, cape); each humanoid gets its own colour/emissive buffers.
// Procedural animation: idle/walk/run blend by speed, airborne poses, and one-shot / looping actions with masks.
//
// Attach convention: h.hand (right hand): grip at origin, the held object's +Y points forward out of the fist
// (along the forearm's forward when the arm hangs), so a sword modelled along +Y (hilt at 0) is held correctly.
// h.head: top of the skull (hats, crowns). sockets.back / sockets.body for the back and chest.

const TAU = Math.PI * 2;
const B = { hips: 0, spine: 1, chest: 2, neck: 3, head: 4, uaL: 5, faL: 6, haL: 7, uaR: 8, faR: 9, haR: 10, thL: 11, shL: 12, ftL: 13, thR: 14, shR: 15, ftR: 16, capeA: 17, capeB: 18 };
const NB = 19;
const PARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 2, 8, 9, 0, 11, 12, 0, 14, 15, 2, 17];
const UPPER = new Uint8Array(NB); [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].forEach((i) => { UPPER[i] = 1; });

// roles -> colour slots
const ROLE = { skin: 0, shirt: 1, pants: 2, hair: 3, cape: 4, dress: 5, boots: 6, belt: 7, eyes: 8, mouth: 9, hat: 10, metal: 11, gold: 12, white: 13, brow: 14 };
const ROLE_RM = [[0.55, 0], [0.9, 0], [0.88, 0], [0.6, 0], [0.85, 0], [0.88, 0], [0.65, 0], [0.55, 0], [0.18, 0], [0.6, 0], [0.85, 0], [0.32, 1], [0.28, 1], [0.4, 0], [0.7, 0]];

function propsFor(build) {
  const p = {
    hipsY: 0.98, spine: 0.12, chest: 0.16, neck: 0.25, head: 0.07, shX: 0.19, shY: 0.2, ua: 0.29, fa: 0.26,
    hipX: 0.095, hipY: -0.05, th: 0.44, sh: 0.42,
    chestW: 0.175, chestD: 0.11, waistW: 0.145, waistD: 0.095, hipW: 0.165, hipD: 0.105,
    armR: 0.052, faR: 0.043, thR: 0.082, shR: 0.058, headR: 0.1, headH: 0.125, neckR: 0.05, belly: 0
  };
  if (build === "slim") { p.chestW *= 0.88; p.chestD *= 0.9; p.waistW *= 0.86; p.hipW *= 0.9; p.armR *= 0.85; p.faR *= 0.85; p.thR *= 0.88; p.shR *= 0.88; }
  if (build === "heavy") { p.chestW *= 1.28; p.chestD *= 1.3; p.waistW *= 1.38; p.waistD *= 1.5; p.hipW *= 1.2; p.armR *= 1.25; p.faR *= 1.2; p.thR *= 1.22; p.shR *= 1.15; p.shX *= 1.15; p.hipX *= 1.12; p.belly = 0.05; p.neckR *= 1.3; }
  if (build === "child") {
    p.hipsY = 0.86; p.th = 0.38; p.sh = 0.36; p.hipY = -0.05; p.spine = 0.11; p.chest = 0.14; p.neck = 0.21; p.head = 0.07;
    p.headR = 0.13; p.headH = 0.16; p.shX = 0.16; p.ua = 0.25; p.fa = 0.22; p.chestW *= 0.82; p.waistW *= 0.85; p.hipW *= 0.85;
    p.armR *= 0.8; p.faR *= 0.8; p.thR *= 0.85; p.shR *= 0.85; p.neckR *= 0.8;
  }
  return p;
}

// bind-pose bone positions (world, model space) and local offsets
function boneLayout(p) {
  const local = new Array(NB);
  local[B.hips] = [0, p.hipsY, 0];
  local[B.spine] = [0, p.spine, 0];
  local[B.chest] = [0, p.chest, 0];
  local[B.neck] = [0, p.neck, 0];
  local[B.head] = [0, p.head, 0];
  local[B.uaL] = [p.shX, p.shY, 0]; local[B.uaR] = [-p.shX, p.shY, 0];
  local[B.faL] = [0, -p.ua, 0]; local[B.faR] = [0, -p.ua, 0];
  local[B.haL] = [0, -p.fa, 0]; local[B.haR] = [0, -p.fa, 0];
  local[B.thL] = [p.hipX, p.hipY, 0]; local[B.thR] = [-p.hipX, p.hipY, 0];
  local[B.shL] = [0, -p.th, 0]; local[B.shR] = [0, -p.th, 0];
  local[B.ftL] = [0, -p.sh, 0]; local[B.ftR] = [0, -p.sh, 0];
  local[B.capeA] = [0, p.neck - 0.04, -p.chestD - 0.03];
  local[B.capeB] = [0, -0.5, 0];
  const world = new Array(NB);
  for (let i = 0; i < NB; i++) {
    const l = local[i], pa = PARENT[i];
    world[i] = pa < 0 ? [l[0], l[1], l[2]] : [world[pa][0] + l[0], world[pa][1] + l[1], world[pa][2] + l[2]];
  }
  return { local, world };
}

// ---- geometry builder --------------------------------------------------------------------------------------
function Builder() {
  return { p: [], n: [], role: [], si: [], sw: [], idx: [] };
}
function pushV(b, x, y, z, nx, ny, nz, role, b0, b1, w1) {
  b.p.push(x, y, z); b.n.push(nx, ny, nz); b.role.push(role);
  b.si.push(b0, b1 || 0, 0, 0); b.sw.push(1 - (w1 || 0), w1 || 0, 0, 0);
  return b.p.length / 3 - 1;
}
// ellipsoid / lathe-ish blob: profile = [[t (0 bottom..1 top), rx, rz]...] between y0..y1 around (cx, cz)
function lathe(b, bone, role, cx, cz, y0, y1, prof, seg, opts) {
  const o = opts || {};
  const start = b.p.length / 3;
  const rings = prof.length;
  for (let r = 0; r < rings; r++) {
    const [t, rx, rz] = prof[r];
    const y = y0 + (y1 - y0) * t;
    for (let s = 0; s <= seg; s++) {
      const a = s / seg * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      let x = cx + sa * rx, z = cz + ca * rz;
      if (o.fwd) z += o.fwd * Math.max(0, ca) * (1 - Math.abs(t - 0.5) * 2);
      // normal: approximate from ellipse + profile slope
      const prev = prof[Math.max(0, r - 1)], next = prof[Math.min(rings - 1, r + 1)];
      const dr = ((next[1] + next[2]) - (prev[1] + prev[2])) * 0.5;
      const dy = (next[0] - prev[0]) * (y1 - y0) || 1e-4;
      const rmn = (rx + rz) * 0.5;
      let nx = sa / Math.max(rx, 1e-4) * rmn, nz = ca / Math.max(rz, 1e-4) * rmn, ny = -dr / dy;
      if (r === 0 && rx < 1e-3) { nx = 0; ny = -1; nz = 0; }
      if (r === rings - 1 && rx < 1e-3) { nx = 0; ny = 1; nz = 0; }
      const l = Math.hypot(nx, ny, nz) || 1;
      const w1 = o.blend ? o.blend(y) : 0;
      pushV(b, x, y, z, nx / l, ny / l, nz / l, role, bone, o.bone2 != null ? o.bone2 : 0, w1);
    }
  }
  for (let r = 0; r < rings - 1; r++) for (let s = 0; s < seg; s++) {
    const a = start + r * (seg + 1) + s, c = a + seg + 1;
    b.idx.push(a, a + 1, c, a + 1, c + 1, c);
  }
  return start;
}
function ellipsoid(b, bone, role, c, r, seg, rings, clip) {
  const start = b.p.length / 3;
  for (let j = 0; j <= rings; j++) {
    const v = j / rings, ph = v * Math.PI;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg, th = u * TAU;
      let nx = Math.sin(ph) * Math.sin(th), ny = -Math.cos(ph), nz = Math.sin(ph) * Math.cos(th);
      let x = c[0] + nx * r[0], y = c[1] + ny * r[1], z = c[2] + nz * r[2];
      if (clip) { const q = clip(x, y, z); x = q[0]; y = q[1]; z = q[2]; }
      const l = Math.hypot(nx / r[0], ny / r[1], nz / r[2]) || 1;
      pushV(b, x, y, z, nx / r[0] / l, ny / r[1] / l, nz / r[2] / l, role, bone);
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
    const a = start + j * (seg + 1) + i, d = a + seg + 1;
    b.idx.push(a, a + 1, d, a + 1, d + 1, d);
  }
}
function box(b, bone, role, c, h, rotY) {
  const ca = Math.cos(rotY || 0), sa = Math.sin(rotY || 0);
  const F = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const f of F) {
    const u = f[0] !== 0 ? [0, 1, 0] : [1, 0, 0];
    const v = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
    const s = b.p.length / 3;
    for (const [a, d] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      let x = (f[0] + u[0] * a + v[0] * d) * h[0], y = (f[1] + u[1] * a + v[1] * d) * h[1], z = (f[2] + u[2] * a + v[2] * d) * h[2];
      const rx = x * ca + z * sa, rz = -x * sa + z * ca;
      const nx = f[0] * ca + f[2] * sa, nz = -f[0] * sa + f[2] * ca;
      pushV(b, c[0] + rx, c[1] + y, c[2] + rz, nx, f[1], nz, role, bone);
    }
    b.idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
  }
}

function buildBody(p, L, o) {
  const b = Builder();
  const W = L.world;
  const hp = W[B.hips], spn = W[B.spine], ch = W[B.chest], nk = W[B.neck], hd = W[B.head];
  const SEG = 12, LSEG = 9;
  // pelvis (pants)
  lathe(b, B.hips, ROLE.pants, 0, 0, hp[1] - 0.12, spn[1] + 0.02, [[0, p.hipW * 0.72, p.hipD * 0.8], [0.35, p.hipW, p.hipD], [1, p.waistW, p.waistD]], SEG);
  // belt
  lathe(b, B.spine, ROLE.belt, 0, 0, spn[1] - 0.005, spn[1] + 0.04, [[0, p.waistW * 1.04, p.waistD * 1.05], [1, p.waistW * 1.04, p.waistD * 1.05]], SEG);
  // abdomen (shirt)
  lathe(b, B.spine, ROLE.shirt, 0, 0, spn[1] + 0.03, ch[1] + 0.01, [[0, p.waistW * 1.01, p.waistD * 1.02 + p.belly], [1, p.chestW * 0.93, p.chestD * 0.96 + p.belly * 0.6]], SEG, { fwd: p.belly });
  // chest
  lathe(b, B.chest, ROLE.shirt, 0, 0, ch[1], nk[1] + 0.03, [[0, p.chestW * 0.93, p.chestD * 0.96], [0.45, p.chestW, p.chestD], [0.82, p.chestW * 0.92, p.chestD * 0.9], [1, p.neckR * 1.6, p.neckR * 1.4]], SEG);
  // neck
  lathe(b, B.neck, ROLE.skin, 0, 0.005, nk[1] - 0.02, hd[1] + 0.03, [[0, p.neckR * 1.1, p.neckR], [1, p.neckR * 0.95, p.neckR * 0.9]], 8);
  // head
  const hc = [0, hd[1] + p.headH * 0.9, 0.012];
  lathe(b, B.head, ROLE.skin, 0, 0.012, hd[1] + 0.005, hd[1] + p.headH * 1.9, [
    [0, 0.001, 0.001], [0.06, p.headR * 0.55, p.headR * 0.62], [0.2, p.headR * 0.78, p.headR * 0.9], [0.42, p.headR * 0.95, p.headR * 1.04],
    [0.62, p.headR, p.headR * 1.06], [0.82, p.headR * 0.9, p.headR * 0.96], [0.95, p.headR * 0.55, p.headR * 0.6], [1, 0.001, 0.001]], SEG);
  const fy = hd[1] + p.headH * 0.95; // eye line
  const fz = 0.012 + p.headR * 1.0;
  // nose, ears, eyes, brows, mouth
  ellipsoid(b, B.head, ROLE.skin, [0, fy - p.headH * 0.2, fz + 0.012], [0.016, 0.03, 0.022], 6, 4);
  ellipsoid(b, B.head, ROLE.skin, [p.headR * 0.97, fy - 0.01, 0.0], [0.014, 0.03, 0.022], 6, 4);
  ellipsoid(b, B.head, ROLE.skin, [-p.headR * 0.97, fy - 0.01, 0.0], [0.014, 0.03, 0.022], 6, 4);
  const eyeX = p.headR * 0.36, eyeR = p.headR * 0.13;
  ellipsoid(b, B.head, ROLE.white, [eyeX, fy, fz - 0.012], [eyeR * 1.15, eyeR * 0.8, eyeR * 0.7], 8, 5);
  ellipsoid(b, B.head, ROLE.white, [-eyeX, fy, fz - 0.012], [eyeR * 1.15, eyeR * 0.8, eyeR * 0.7], 8, 5);
  ellipsoid(b, B.head, ROLE.eyes, [eyeX, fy, fz - 0.004], [eyeR * 0.6, eyeR * 0.6, eyeR * 0.45], 6, 4);
  ellipsoid(b, B.head, ROLE.eyes, [-eyeX, fy, fz - 0.004], [eyeR * 0.6, eyeR * 0.6, eyeR * 0.45], 6, 4);
  box(b, B.head, ROLE.brow, [eyeX, fy + eyeR * 1.7, fz - 0.008], [eyeR * 1.5, 0.006, 0.008], 0);
  box(b, B.head, ROLE.brow, [-eyeX, fy + eyeR * 1.7, fz - 0.008], [eyeR * 1.5, 0.006, 0.008], 0);
  box(b, B.head, ROLE.mouth, [0, fy - p.headH * 0.48, fz - 0.016], [p.headR * 0.26, 0.005, 0.008], 0);
  // hair cap: ellipsoid clipped at a hairline that is low at the back and high at the front
  if (o.hair) {
    const hr = [p.headR * 1.07, p.headH * 1.0, p.headR * 1.12];
    const hcc = [0, hd[1] + p.headH * 1.02, 0.006];
    ellipsoid(b, B.head, ROLE.hair, hcc, hr, 12, 8, (x, y, z) => {
      const line = hd[1] + p.headH * (z > 0 ? 1.05 + z * 2.6 : 0.5 - z * 1.2);
      if (y < line) return [x * 0.96, line, z * 0.96];
      return [x, y, z];
    });
  }
  if (o.beard) {
    ellipsoid(b, B.head, ROLE.hair, [0, fy - p.headH * 0.55, 0.035], [p.headR * 0.85, p.headH * 0.55, p.headR * 0.75], 10, 6, (x, y, z) => {
      if (z < 0.02) return [x * 0.9, y, 0.02 + (z - 0.02) * 0.2];
      if (y > fy - p.headH * 0.28 && Math.abs(x) < p.headR * 0.45) return [x, fy - p.headH * 0.3, z];
      return [x, y, z];
    });
  }
  // arms
  for (const side of [1, -1]) {
    const ua = side > 0 ? B.uaL : B.uaR, fa = side > 0 ? B.faL : B.faR, ha = side > 0 ? B.haL : B.haR;
    const s = W[ua], f = W[fa], h = W[ha];
    ellipsoid(b, ua, ROLE.shirt, [s[0], s[1] - 0.01, s[2]], [p.armR * 1.35, p.armR * 1.25, p.armR * 1.3], 8, 5);
    lathe(b, ua, ROLE.shirt, s[0], s[2], f[1] - 0.02, s[1], [[0, p.faR * 1.15, p.faR * 1.15], [0.6, p.armR, p.armR * 1.05], [1, p.armR * 1.15, p.armR * 1.15]], LSEG);
    lathe(b, fa, ROLE.shirt, f[0], f[2], h[1] + 0.04, f[1] + 0.02, [[0, p.faR * 0.85, p.faR * 0.8], [0.15, p.faR * 0.95, p.faR * 0.9], [0.7, p.faR * 1.08, p.faR * 1.05], [1, p.faR * 1.1, p.faR * 1.1]], LSEG);
    lathe(b, fa, ROLE.skin, f[0], f[2], h[1] - 0.005, h[1] + 0.05, [[0, p.faR * 0.75, p.faR * 0.68], [1, p.faR * 0.82, p.faR * 0.75]], 8);
    // hand: palm + fingers block + thumb
    ellipsoid(b, ha, ROLE.skin, [h[0], h[1] - 0.045, h[2] + 0.005], [p.faR * 0.72, 0.05, p.faR * 0.95], 8, 5);
    ellipsoid(b, ha, ROLE.skin, [h[0] - side * 0.0, h[1] - 0.1, h[2] + 0.012], [p.faR * 0.62, 0.035, p.faR * 0.8], 6, 4);
    ellipsoid(b, ha, ROLE.skin, [h[0] - side * p.faR * 0.2, h[1] - 0.055, h[2] + p.faR * 0.95], [0.013, 0.03, 0.014], 5, 3);
  }
  // legs
  for (const side of [1, -1]) {
    const th = side > 0 ? B.thL : B.thR, sh = side > 0 ? B.shL : B.shR, ft = side > 0 ? B.ftL : B.ftR;
    const t = W[th], s = W[sh], f = W[ft];
    lathe(b, th, ROLE.pants, t[0], t[2], s[1] - 0.02, t[1] + 0.06, [[0, p.shR * 1.15, p.shR * 1.15], [0.55, p.thR * 0.95, p.thR], [1, p.thR * 1.1, p.thR * 1.12]], LSEG);
    lathe(b, sh, ROLE.pants, s[0], s[2], f[1] + 0.16, s[1] + 0.02, [[0, p.shR * 0.8, p.shR * 0.85], [0.6, p.shR * 1.05, p.shR * 1.12], [1, p.shR * 1.15, p.shR * 1.15]], LSEG);
    // boot shaft + foot
    lathe(b, sh, ROLE.boots, s[0], s[2], f[1] - 0.02, f[1] + 0.2, [[0, p.shR * 0.95, p.shR * 1.0], [1, p.shR * 0.98, p.shR * 1.02]], LSEG);
    ellipsoid(b, ft, ROLE.boots, [f[0], f[1] - 0.025, f[2] + 0.06], [p.shR * 0.95, 0.05, 0.135], 8, 5, (x, y, z) => [x, Math.max(y, 0.001), z]);
  }
  // dress
  if (o.dress) {
    lathe(b, B.hips, ROLE.dress, 0, 0, hp[1] - p.th * 0.95, spn[1] + 0.05, [[0, p.hipW * 2.1, p.hipD * 2.6], [0.3, p.hipW * 1.75, p.hipD * 2.1], [0.75, p.hipW * 1.15, p.hipD * 1.25], [1, p.waistW * 1.06, p.waistD * 1.08]], 14);
    lathe(b, B.chest, ROLE.dress, 0, 0, ch[1] - 0.01, nk[1] - 0.04, [[0, p.chestW * 0.96, p.chestD * 1.0], [1, p.chestW * 1.02, p.chestD * 1.04]], SEG);
  }
  // cape (two bones, blended by height)
  if (o.cape) {
    const top = W[B.capeA], bot = W[B.capeB];
    const s = b.p.length / 3;
    const rows = 6, cols = 6, y0 = top[1], y1 = Math.max(0.35, bot[1] - 0.15);
    for (let r = 0; r <= rows; r++) {
      const t = r / rows, y = y0 + (y1 - y0) * t;
      const w = p.chestW * (1.05 + t * 0.45);
      for (let c = 0; c <= cols; c++) {
        const u = c / cols * 2 - 1;
        const z = top[2] - Math.abs(u) * 0.02 * (1 - t) - t * 0.03 + (1 - u * u) * 0.025;
        pushV(b, u * w, y, z, 0, 0, -1, ROLE.cape, B.capeA, B.capeB, Math.min(1, Math.max(0, (y0 - y) / (y0 - y1))));
      }
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = s + r * (cols + 1) + c, d = a + cols + 1;
      b.idx.push(a, a + 1, d, a + 1, d + 1, d);
      b.idx.push(a, d, a + 1, a + 1, d, d + 1); // double sided
    }
  }
  // hats
  const top = hd[1] + p.headH * 1.9;
  if (o.hat === "straw") {
    lathe(b, B.head, ROLE.hat, 0, 0, top - 0.06, top + 0.07, [[0, p.headR * 1.12, p.headR * 1.18], [0.8, p.headR * 0.95, p.headR], [1, p.headR * 0.6, p.headR * 0.62]], 12);
    lathe(b, B.head, ROLE.hat, 0, 0, top - 0.075, top - 0.05, [[0, p.headR * 2.5, p.headR * 2.5], [0.5, p.headR * 2.45, p.headR * 2.45], [1, p.headR * 1.1, p.headR * 1.15]], 16);
  } else if (o.hat === "hood") {
    ellipsoid(b, B.head, ROLE.hat, [0, hd[1] + p.headH * 1.0, -0.01], [p.headR * 1.25, p.headH * 1.15, p.headR * 1.3], 12, 8, (x, y, z) => {
      if (z > p.headR * 0.55) return [x * 1.05, y, p.headR * 0.55 + (z - p.headR * 0.55) * 0.2];
      return [x, y, z];
    });
    lathe(b, B.chest, ROLE.hat, 0, -0.01, nk[1] - 0.06, nk[1] + 0.06, [[0, p.chestW * 1.05, p.chestD * 1.15], [1, p.neckR * 2.2, p.neckR * 2.2]], 12);
  } else if (o.hat === "helmet" || o.hat === "royalHelmet") {
    const role = o.hat === "royalHelmet" ? ROLE.white : ROLE.metal;
    ellipsoid(b, B.head, role, [0, hd[1] + p.headH * 1.15, 0.01], [p.headR * 1.14, p.headH * 0.95, p.headR * 1.2], 12, 7, (x, y, z) => {
      const line = hd[1] + p.headH * (z > 0 ? 1.15 : 0.6);
      return y < line ? [x, line, z] : [x, y, z];
    });
    box(b, B.head, role, [0, fy, fz + 0.01], [0.012, p.headH * 0.32, 0.012], 0);
    if (o.hat === "royalHelmet") {
      lathe(b, B.head, ROLE.gold, 0, 0, hd[1] + p.headH * 1.12, hd[1] + p.headH * 1.2, [[0, p.headR * 1.16, p.headR * 1.22], [1, p.headR * 1.16, p.headR * 1.22]], 12);
      box(b, B.head, ROLE.gold, [0, top + 0.06, -0.01], [0.012, 0.07, p.headR * 0.9], 0);
    }
  } else if (o.hat === "crown") {
    lathe(b, B.head, ROLE.gold, 0, 0.005, top - 0.06, top, [[0, p.headR * 0.95, p.headR * 1.0], [1, p.headR * 0.98, p.headR * 1.03]], 12);
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU;
      lathe(b, B.head, ROLE.gold, Math.sin(a) * p.headR * 0.92, Math.cos(a) * p.headR * 0.97 + 0.005, top - 0.01, top + 0.06, [[0, 0.018, 0.012], [1, 0.001, 0.001]], 4);
    }
  } else if (o.hat === "bandana") {
    lathe(b, B.head, ROLE.hat, 0, 0.012, fy + p.headH * 0.28, fy + p.headH * 0.5, [[0, p.headR * 1.04, p.headR * 1.1], [1, p.headR * 1.02, p.headR * 1.08]], 12);
    ellipsoid(b, B.head, ROLE.hat, [0, fy + p.headH * 0.35, -p.headR * 1.1], [0.02, 0.025, 0.03], 5, 3);
  }
  return b;
}

function buildArmor(p, L) {
  const b = Builder();
  const W = L.world;
  const spn = W[B.spine], ch = W[B.chest], nk = W[B.neck], hp = W[B.hips];
  lathe(b, B.chest, 0, 0, 0.004, ch[1] - 0.02, nk[1] + 0.01, [[0, p.chestW * 1.04, p.chestD * 1.12], [0.5, p.chestW * 1.1, p.chestD * 1.2], [1, p.chestW * 0.78, p.chestD * 0.85]], 12);
  lathe(b, B.spine, 0, 0, 0.004, spn[1] + 0.02, ch[1] + 0.01, [[0, p.waistW * 1.1, p.waistD * 1.2 + p.belly], [1, p.chestW * 1.02, p.chestD * 1.1]], 12);
  lathe(b, B.hips, 0, 0, 0, hp[1] - 0.2, spn[1] + 0.01, [[0, p.hipW * 1.35, p.hipD * 1.5], [1, p.waistW * 1.12, p.waistD * 1.22]], 12);
  for (const side of [1, -1]) {
    const ua = side > 0 ? B.uaL : B.uaR, fa = side > 0 ? B.faL : B.faR, sh = side > 0 ? B.shL : B.shR;
    const s = W[ua], f = W[fa], g = W[sh];
    ellipsoid(b, ua, 0, [s[0] + side * 0.02, s[1] + 0.01, s[2]], [p.armR * 2.1, p.armR * 1.4, p.armR * 2.0], 10, 5, (x, y, z) => [x, Math.max(y, s[1] - 0.05), z]);
    lathe(b, fa, 0, f[0], f[2], f[1] - p.fa * 0.85, f[1] - p.fa * 0.25, [[0, p.faR * 1.25, p.faR * 1.25], [1, p.faR * 1.35, p.faR * 1.35]], 8);
    lathe(b, sh, 0, g[0], g[2] + 0.008, g[1] - p.sh * 0.75, g[1] + 0.04, [[0, p.shR * 1.25, p.shR * 1.35], [0.85, p.shR * 1.35, p.shR * 1.45], [1, p.shR * 1.5, p.shR * 1.6]], 8);
  }
  return b;
}

function toGeometry(THREE, b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(b.p, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(b.n, 3));
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(b.si, 4));
  g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(b.sw, 4));
  const n = b.role.length;
  const rm = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { const r = ROLE_RM[b.role[i]]; rm[i * 2] = r[0]; rm[i * 2 + 1] = r[1]; }
  g.setAttribute("rm", new THREE.BufferAttribute(rm, 2));
  g.setIndex(b.idx);
  g.userData.role = new Uint8Array(b.role);
  return g;
}

// ---- caches (per THREE instance) -----------------------------------------------------------------------------
const CACHE = new WeakMap();
function cacheFor(THREE) {
  let c = CACHE.get(THREE);
  if (!c) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 rm;\nattribute float emis;\nvarying vec2 vRM;\nvarying float vEmis;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRM = rm;\nvEmis = emis;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vRM;\nvarying float vEmis;")
        .replace("#include <roughnessmap_fragment>", "float roughnessFactor = vRM.x;")
        .replace("#include <metalnessmap_fragment>", "float metalnessFactor = vRM.y;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vEmis;");
    };
    mat.customProgramCacheKey = () => "tn-humanoid-v1";
    c = { mat, geos: new Map(), armor: new Map() };
    CACHE.set(THREE, c);
  }
  return c;
}

// keyframe helper: smooth interpolation through (times, values)
function kf(t, T, V) {
  if (t <= T[0]) return V[0];
  for (let i = 1; i < T.length; i++) {
    if (t <= T[i]) {
      let u = (t - T[i - 1]) / (T[i] - T[i - 1]);
      u = u * u * (3 - 2 * u);
      return V[i - 1] + (V[i] - V[i - 1]) * u;
    }
  }
  return V[V.length - 1];
}

// pose buffer layout: bone*3 + (x,y,z) ; extra: [NB*3] hipsDY, [NB*3+1] hipsDZ
const PL = NB * 3 + 2;
const DY = NB * 3, DZ = NB * 3 + 1;
function set(o, bone, x, y, z) { const k = bone * 3; if (x != null) o[k] = x; if (y != null) o[k + 1] = y; if (z != null) o[k + 2] = z; }
function addR(o, bone, x, y, z) { const k = bone * 3; o[k] += x || 0; o[k + 1] += y || 0; o[k + 2] += z || 0; }

// action table: dur (s), mask, fn(t01, time, o, kind)
const T4 = [0, 0.25, 0.45, 1], T4b = [0, 0.3, 0.55, 1], T4c = [0, 0.45, 0.62, 1], T3 = [0, 0.25, 1], T4d = [0, 0.4, 0.6, 1];
const ACTIONS = {
  punch: { dur: 0.42, mask: 1, fn(t, tm, o) {
    set(o, B.uaR, kf(t, T4, [0, 0.35, -1.45, 0]), 0, kf(t, T4, [-0.12, -0.1, -0.05, -0.12]));
    set(o, B.faR, kf(t, T4, [-0.3, -1.9, -0.12, -0.3]), 0, 0);
    set(o, B.chest, null, kf(t, T4, [0, -0.35, 0.42, 0]), null);
    addR(o, B.spine, kf(t, T4, [0, 0, 0.1, 0]), 0, 0);
    set(o, B.uaL, -0.55, 0, 0.12); set(o, B.faL, -1.9, 0, 0);
  } },
  slash: { dur: 0.5, mask: 1, fn(t, tm, o) {
    set(o, B.uaR, kf(t, T4b, [0, -2.5, -0.6, 0]), 0, kf(t, T4b, [-0.1, -0.6, 0.35, -0.1]));
    set(o, B.faR, kf(t, T4b, [-0.3, -1.0, -0.2, -0.3]), 0, 0);
    set(o, B.chest, null, kf(t, T4b, [0, -0.45, 0.5, 0]), null);
    addR(o, B.spine, kf(t, T4b, [0, -0.05, 0.2, 0]), 0, 0);
    set(o, B.uaL, kf(t, T4b, [0, 0.3, -0.4, 0]), 0, 0.2);
  } },
  heavy: { dur: 0.85, mask: 0, fn(t, tm, o) {
    set(o, B.uaR, kf(t, T4c, [0, -2.9, -0.7, 0]), 0, kf(t, T4c, [-0.1, 0.25, 0.1, -0.1]));
    set(o, B.uaL, kf(t, T4c, [0, -2.7, -0.8, 0]), 0, kf(t, T4c, [0.1, -0.25, -0.1, 0.1]));
    set(o, B.faR, kf(t, T4c, [-0.3, -0.6, -0.15, -0.3]), 0, 0);
    set(o, B.faL, kf(t, T4c, [-0.3, -0.6, -0.15, -0.3]), 0, 0);
    addR(o, B.spine, kf(t, T4c, [0, -0.25, 0.45, 0]), 0, 0);
    o[DY] += kf(t, T4c, [0, 0.02, -0.18, 0]);
    set(o, B.thL, kf(t, T4c, [0, -0.1, -0.55, 0]), null, null); set(o, B.shL, kf(t, T4c, [0, 0.2, 0.7, 0]), null, null);
    set(o, B.thR, kf(t, T4c, [0, 0.1, 0.35, 0]), null, null); set(o, B.shR, kf(t, T4c, [0, 0.2, 0.5, 0]), null, null);
  } },
  block: { dur: 1, mask: 1, loop: true, fn(t, tm, o) {
    set(o, B.uaR, -1.3, 0, 0.5); set(o, B.faR, -1.5, 0, 0);
    set(o, B.uaL, -1.2, 0, -0.4); set(o, B.faL, -1.6, 0, 0);
    addR(o, B.chest, 0.1, 0, 0);
  } },
  hurt: { dur: 0.35, mask: 1, fn(t, tm, o) {
    addR(o, B.spine, kf(t, T3, [0, -0.35, 0]), 0, 0);
    addR(o, B.head, kf(t, T3, [0, -0.3, 0]), 0, 0);
    addR(o, B.uaL, 0, 0, kf(t, T3, [0, 0.5, 0])); addR(o, B.uaR, 0, 0, kf(t, T3, [0, -0.5, 0]));
    o[DZ] += kf(t, T3, [0, -0.06, 0]);
  } },
  die: { dur: 1.3, mask: 0, hold: true, fn(t, tm, o) {
    const T = [0, 0.35, 0.6, 1];
    o[DY] = kf(t, T, [0, -0.42, -0.47, -0.78]);
    set(o, B.thL, kf(t, T, [0, -1.3, -1.2, -0.25]), 0, 0); set(o, B.shL, kf(t, T, [0, 2.0, 1.8, 0.35]), 0, 0);
    set(o, B.thR, kf(t, T, [0, -1.1, -1.0, -0.05]), 0, 0); set(o, B.shR, kf(t, T, [0, 1.9, 1.7, 0.2]), 0, 0);
    set(o, B.hips, 0, 0, kf(t, T, [0, 0, 0.3, 1.5]));
    set(o, B.spine, kf(t, T, [0, 0.4, 0.3, 0.05]), 0, 0);
    set(o, B.head, kf(t, T, [0, 0.3, 0.2, -0.1]), 0, kf(t, T, [0, 0, 0.2, 0.3]));
    set(o, B.uaL, kf(t, T, [0, -0.3, -0.2, -0.6]), 0, kf(t, T, [0.1, 0.3, 0.5, 1.0]));
    set(o, B.uaR, kf(t, T, [0, -0.3, -0.2, 0.3]), 0, kf(t, T, [-0.1, -0.3, -0.5, -0.4]));
    set(o, B.faL, -0.3, 0, 0); set(o, B.faR, -0.5, 0, 0);
  } },
  sit: { dur: 1, mask: 0, loop: true, fn(t, tm, o) {
    o[DY] = -0.5; o[DZ] = -0.05;
    set(o, B.thL, -1.5, 0, 0.05); set(o, B.thR, -1.5, 0, -0.05); set(o, B.shL, 1.5, 0, 0); set(o, B.shR, 1.5, 0, 0);
    set(o, B.ftL, 0, 0, 0); set(o, B.ftR, 0, 0, 0);
    set(o, B.spine, 0.05, 0, 0);
    set(o, B.uaL, -0.45, 0, 0.1); set(o, B.uaR, -0.45, 0, -0.1); set(o, B.faL, -0.9, 0, 0); set(o, B.faR, -0.9, 0, 0);
  } },
  kneel: { dur: 1, mask: 0, loop: true, fn(t, tm, o) {
    o[DY] = -0.45;
    set(o, B.thL, -1.45, 0, 0.05); set(o, B.shL, 1.5, 0, 0); set(o, B.ftL, 0, 0, 0);
    set(o, B.thR, 0.25, 0, -0.05); set(o, B.shR, 1.8, 0, 0); set(o, B.ftR, -0.5, 0, 0);
    set(o, B.spine, 0.15, 0, 0); set(o, B.head, 0.3, 0, 0);
    set(o, B.uaL, -0.4, 0, 0.1); set(o, B.faL, -0.7, 0, 0); set(o, B.uaR, -0.1, 0, -0.1); set(o, B.faR, -0.4, 0, 0);
  } },
  dig: { dur: 1.2, mask: 0, loop: true, fn(t, tm, o) {
    const p = Math.sin(t * TAU);
    set(o, B.spine, 0.35 + 0.25 * p, 0, 0);
    set(o, B.uaR, -0.9 - 0.5 * p, 0, 0.25); set(o, B.uaL, -1.0 - 0.5 * p, 0, -0.25);
    set(o, B.faR, -0.4, 0, 0); set(o, B.faL, -0.4, 0, 0);
    o[DY] = -0.08 - 0.05 * p;
    set(o, B.thL, -0.3, 0, 0); set(o, B.thR, 0.2, 0, 0); set(o, B.shL, 0.4, 0, 0); set(o, B.shR, 0.35, 0, 0);
  } },
  wave: { dur: 1.6, mask: 1, fn(t, tm, o) {
    const e = Math.min(1, t * 6) * Math.min(1, (1 - t) * 6);
    set(o, B.uaR, -0.2 * e, 0, -2.5 * e - 0.1);
    set(o, B.faR, -0.4 * e, 0, 0.45 * Math.sin(t * TAU * 3) * e);
    addR(o, B.head, 0, 0, 0.08 * e);
  } },
  talk: { dur: 2.4, mask: 1, fn(t, tm, o) {
    const s = Math.sin(t * TAU);
    set(o, B.uaR, -0.5 - 0.25 * s, 0, -0.15); set(o, B.faR, -1.2 + 0.3 * Math.sin(t * TAU * 2), 0, 0);
    set(o, B.uaL, -0.35 + 0.2 * Math.sin(t * TAU + 1.5), 0, 0.15); set(o, B.faL, -1.0, 0, 0);
    addR(o, B.head, 0.06 * Math.sin(t * TAU * 3), 0.12 * s, 0);
  } },
  cry: { dur: 3, mask: 0, loop: true, fn(t, tm, o) {
    const sob = Math.sin(tm * 22) * 0.025 * (0.5 + 0.5 * Math.sin(tm * 1.3));
    set(o, B.head, 0.55, 0, 0);
    set(o, B.uaL, -1.25, 0, -0.45); set(o, B.uaR, -1.25, 0, 0.45);
    set(o, B.faL, -2.2, 0, 0); set(o, B.faR, -2.2, 0, 0);
    set(o, B.chest, 0.25 + sob, 0, 0);
    o[DY] -= 0.03;
  } },
  sitCry: { dur: 3, mask: 0, loop: true, fn(t, tm, o) {
    const sob = Math.sin(tm * 20) * 0.03 * (0.5 + 0.5 * Math.sin(tm * 1.1));
    o[DY] = -0.82; o[DZ] = -0.05;
    set(o, B.thL, -2.3, 0, 0.12); set(o, B.thR, -2.3, 0, -0.12); set(o, B.shL, 2.45, 0, 0); set(o, B.shR, 2.45, 0, 0);
    set(o, B.ftL, 0.2, 0, 0); set(o, B.ftR, 0.2, 0, 0);
    set(o, B.spine, 0.5 + sob, 0, 0); set(o, B.chest, 0.15, 0, 0); set(o, B.head, 0.75, 0, 0);
    set(o, B.uaL, -1.35, 0, -0.25); set(o, B.uaR, -1.35, 0, 0.25); set(o, B.faL, -1.5, 0, 0); set(o, B.faR, -1.5, 0, 0);
  } },
  scared: { dur: 2, mask: 0, loop: true, fn(t, tm, o) {
    const tr = Math.sin(tm * 31) * 0.02;
    o[DY] = -0.15;
    set(o, B.thL, -0.35, 0, 0); set(o, B.thR, -0.3, 0, 0); set(o, B.shL, 0.6, 0, 0); set(o, B.shR, 0.55, 0, 0);
    set(o, B.spine, 0.3 + tr, 0, 0); set(o, B.head, 0.15, 0, 0);
    set(o, B.uaL, -1.9, 0, -0.35); set(o, B.uaR, -1.9, 0, 0.35); set(o, B.faL, -2.0 + tr, 0, 0); set(o, B.faR, -2.0 - tr, 0, 0);
  } },
  take: { dur: 0.8, mask: 1, fn(t, tm, o) {
    set(o, B.uaR, kf(t, T4d, [0, -1.1, -1.0, 0]), 0, -0.1);
    set(o, B.faR, kf(t, T4d, [-0.3, -0.2, -1.4, -0.3]), 0, 0);
    addR(o, B.spine, kf(t, T4d, [0, 0.35, 0.2, 0]), 0, 0);
  } },
  roll: { dur: 0.45, mask: 0, fn(t, tm, o) {
    const w = Math.sin(Math.PI * t);
    const e = t * t * (3 - 2 * t);
    o[DY] = -0.45 * w;
    set(o, B.hips, TAU * e, 0, 0);
    set(o, B.thL, -2.2 * w, 0, 0); set(o, B.thR, -2.1 * w, 0, 0); set(o, B.shL, 2.4 * w, 0, 0); set(o, B.shR, 2.4 * w, 0, 0);
    set(o, B.spine, 0.8 * w, 0, 0); set(o, B.head, 0.6 * w, 0, 0);
    set(o, B.uaL, -1.4 * w, 0, 0); set(o, B.uaR, -1.4 * w, 0, 0); set(o, B.faL, -1.5 * w, 0, 0); set(o, B.faR, -1.5 * w, 0, 0);
  } },
  jump: { dur: 0.35, mask: 0, fn(t, tm, o) {
    o[DY] += kf(t, T3, [0, -0.12, 0]);
    addR(o, B.thL, kf(t, T3, [0, -0.5, -0.3]), 0, 0); addR(o, B.shL, kf(t, T3, [0, 0.9, 0.4]), 0, 0);
    addR(o, B.thR, kf(t, T3, [0, -0.5, 0.1]), 0, 0); addR(o, B.shR, kf(t, T3, [0, 0.9, 0.3]), 0, 0);
    addR(o, B.uaL, kf(t, T3, [0, 0.4, -0.5]), 0, 0); addR(o, B.uaR, kf(t, T3, [0, 0.4, -0.5]), 0, 0);
  } },
  fall: { dur: 1, mask: 0, loop: true, fn(t, tm, o) { airPose(o, tm, 1); } }
};
function airPose(o, tm, w) {
  addR(o, B.thL, -0.55 * w, 0, 0); addR(o, B.shL, 0.75 * w, 0, 0);
  addR(o, B.thR, -0.1 * w, 0, 0); addR(o, B.shR, 0.45 * w, 0, 0);
  addR(o, B.uaL, -0.35 * w, 0, 0.45 * w); addR(o, B.uaR, -0.25 * w, 0, -0.45 * w);
  addR(o, B.faL, -0.5 * w, 0, 0); addR(o, B.faR, -0.5 * w, 0, 0);
  addR(o, B.head, -0.1 * w, 0, 0);
}
export const ACTION_IDS = ["idle", "walk", "run"].concat(Object.keys(ACTIONS));

// ---------------------------------------------------------------------------------------------------------------
// armor plates have no UVs: a small shader patch adds overlapping-plate seams, bevelled lit edges, brushed streaks
// and wear from the bind-pose position, so metal reads as plate (not flat painted cloth)
function plateDetail(m) {
  m.envMapIntensity = 1.6;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vPlateP;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPlateP = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
varying vec3 vPlateP;
float plH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float plN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(plH(i), plH(i + vec2(1, 0)), f.x), mix(plH(i + vec2(0, 1)), plH(i + vec2(1, 1)), f.x), f.y); }`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
{
  float band = fract(vPlateP.y * 8.5);
  float seam = 1.0 - smoothstep(0.0, 0.07, band) * smoothstep(1.0, 0.93, band);
  float bevel = smoothstep(0.72, 0.9, band) * (1.0 - smoothstep(0.9, 0.96, band));
  float ang = atan(vPlateP.x, vPlateP.z);
  float brush = plN(vec2(ang * 3.0, vPlateP.y * 220.0));
  float wear = smoothstep(0.55, 0.8, plN(vPlateP.xy * 18.0 + vPlateP.zz * 7.0));
  diffuseColor.rgb *= (1.0 - seam * 0.55) * (0.9 + brush * 0.14) * (1.0 + bevel * 0.35);
  roughnessFactor = clamp(roughnessFactor * (0.8 + brush * 0.45) + seam * 0.35 - bevel * 0.12 + wear * 0.12, 0.05, 1.0);
}`);
  };
  m.customProgramCacheKey = () => "tnPlate1";
}

export function createHumanoid(THREE, engine, opts) {
  const o = Object.assign({
    height: 1.8, build: "normal", skin: "#e0b090", shirt: "#6b7d5a", pants: "#4a3c2c", hair: "#3a2a1a", beard: false,
    hat: null, cape: null, dress: null, eyes: "normal"
  }, opts || {});
  const C = cacheFor(THREE);
  const P = propsFor(o.build);
  const L = boneLayout(P);
  const keyOf = (hat) => [o.build, o.hair ? 1 : 0, o.beard ? 1 : 0, hat || "-", o.dress ? 1 : 0, o.cape ? 1 : 0].join("|");
  function geoFor(hat) {
    const k = keyOf(hat);
    let g = C.geos.get(k);
    if (!g) {
      g = toGeometry(THREE, buildBody(P, L, { hair: !!o.hair, beard: !!o.beard, hat, dress: !!o.dress, cape: !!o.cape }));
      C.geos.set(k, g);
    }
    return g;
  }
  let hat = o.hat;

  // per-instance geometry sharing the cached attributes
  function instanceGeo(base) {
    const g = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "skinIndex", "skinWeight", "rm"]) g.setAttribute(name, base.attributes[name]);
    g.setIndex(base.index);
    const n = base.attributes.position.count;
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("emis", new THREE.BufferAttribute(new Float32Array(n), 1));
    g.userData.role = base.userData.role;
    return g;
  }

  // skeleton
  const bones = [];
  for (let i = 0; i < NB; i++) {
    const b = new THREE.Bone();
    b.name = Object.keys(B)[i];
    b.position.set(L.local[i][0], L.local[i][1], L.local[i][2]);
    bones.push(b);
    if (PARENT[i] >= 0) bones[PARENT[i]].add(b);
  }
  const root = new THREE.Group();
  root.name = "humanoid";
  let geo = instanceGeo(geoFor(hat));
  const mesh = new THREE.SkinnedMesh(geo, C.mat);
  mesh.add(bones[0]);
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.4);
  mesh.frustumCulled = true;
  root.add(mesh);
  const scale = o.height / (L.world[B.head][1] + P.headH * 1.9);
  root.scale.setScalar(scale);

  // sockets
  const hand = new THREE.Object3D(); hand.name = "hand";
  hand.position.set(0, -0.085, 0.012); hand.rotation.x = Math.PI / 2;
  bones[B.haR].add(hand);
  const handL = new THREE.Object3D(); handL.position.set(0, -0.085, 0.012); handL.rotation.x = Math.PI / 2; bones[B.haL].add(handL);
  const head = new THREE.Object3D(); head.name = "head";
  head.position.set(0, P.headH * 1.9, 0.012);
  bones[B.head].add(head);
  const back = new THREE.Object3D(); back.position.set(0, 0.12, -P.chestD - 0.05); back.rotation.set(0, 0, 0.6); bones[B.chest].add(back);
  const body = new THREE.Object3D(); body.position.set(0, 0.1, 0); bones[B.chest].add(body);

  // colours
  const colors = {};
  const tmp = new THREE.Color();
  function lin(hex, def) { tmp.set(hex == null ? def : hex); return [tmp.r, tmp.g, tmp.b]; }
  let eyeMode = o.eyes;
  let armorTint = null;
  function roleColor(role) {
    switch (role) {
      case ROLE.skin: return colors.skin;
      case ROLE.shirt: return armorTint ? armorTint : colors.shirt;
      case ROLE.pants: return colors.pants;
      case ROLE.hair: return colors.hair;
      case ROLE.brow: return colors.brow;
      case ROLE.cape: return colors.cape;
      case ROLE.dress: return colors.dress;
      case ROLE.boots: return colors.boots;
      case ROLE.belt: return colors.belt;
      case ROLE.eyes: return eyeMode === "red" ? colors.red : eyeMode === "glow" ? colors.glow : eyeMode === "none" ? colors.skin : colors.eyes;
      case ROLE.white: return eyeMode === "none" ? colors.skin : (hat === "royalHelmet" ? colors.royal : colors.white);
      case ROLE.mouth: return colors.mouth;
      case ROLE.hat: return colors.hat;
      case ROLE.metal: return colors.metal;
      case ROLE.gold: return colors.gold;
      default: return colors.shirt;
    }
  }
  function setColorSlots(c) {
    if (c.skin !== undefined) colors.skin = lin(c.skin, "#e0b090");
    if (c.shirt !== undefined) colors.shirt = lin(c.shirt, "#6b7d5a");
    if (c.pants !== undefined) colors.pants = lin(c.pants, "#4a3c2c");
    if (c.hair !== undefined) colors.hair = lin(c.hair || "#3a2a1a", "#3a2a1a");
    if (c.cape !== undefined) colors.cape = lin(c.cape || "#5a1e1e", "#5a1e1e");
    if (c.dress !== undefined) colors.dress = lin(c.dress || "#eeeeee", "#eeeeee");
    colors.brow = colors.hair ? colors.hair.map((v) => v * 0.8) : [0.05, 0.04, 0.03];
    colors.mouth = colors.skin.map((v, i) => v * (i === 0 ? 0.62 : 0.45));
  }
  colors.boots = lin("#3a2a1e"); colors.belt = lin("#2a1c12"); colors.eyes = lin("#1c140e"); colors.red = lin("#ff1a1a");
  colors.glow = lin("#f4f4ff"); colors.white = lin("#e9e4dc"); colors.metal = lin("#9aa0a8"); colors.gold = lin("#d4a640");
  colors.royal = lin("#eceae4");
  const HAT_COL = { straw: "#c8a860", hood: "#4a4038", bandana: "#9a2a22", helmet: "#9aa0a8", royalHelmet: "#eceae4", crown: "#d4a640" };
  colors.hat = lin(HAT_COL[hat] || "#6a5a40");
  setColorSlots({ skin: o.skin, shirt: o.shirt, pants: o.pants, hair: o.hair, cape: o.cape, dress: o.dress });

  function paint() {
    const role = geo.userData.role;
    const ca = geo.attributes.color.array, ea = geo.attributes.emis.array;
    for (let i = 0; i < role.length; i++) {
      const c = roleColor(role[i]);
      ca[i * 3] = c[0]; ca[i * 3 + 1] = c[1]; ca[i * 3 + 2] = c[2];
      ea[i] = role[i] === ROLE.eyes ? (eyeMode === "red" ? 6 : eyeMode === "glow" ? 5 : 0) : 0;
    }
    geo.attributes.color.needsUpdate = true;
    geo.attributes.emis.needsUpdate = true;
  }
  paint();

  // armour mesh (lazy)
  let armor = null;
  function armorMesh() {
    if (armor) return armor;
    let ag = C.armor.get(o.build);
    if (!ag) { ag = toGeometry(THREE, buildArmor(P, L)); C.armor.set(o.build, ag); }
    const m = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 1, roughness: 0.35 });
    plateDetail(m);
    armor = new THREE.SkinnedMesh(ag, m);
    armor.bind(skeleton, mesh.bindMatrix);
    armor.castShadow = true; armor.receiveShadow = true;
    armor.boundingSphere = mesh.boundingSphere;
    armor.visible = false;
    root.add(armor);
    return armor;
  }

  // ---- animation state ----------------------------------------------------------------------------------------
  const base = new Float32Array(PL), act = new Float32Array(PL), fin = new Float32Array(PL);
  let phase = 0, time = 0;
  let cur = null;          // { id, def, t, dur, loop, w, resolve, speed, ending }
  let forced = null;       // "walk" | "run" while looped
  let speedS = 0, airS = 0;
  let visible = true;
  const finished = [];

  function settle(a) { if (a && a.resolve) { const r = a.resolve; a.resolve = null; r(); } }

  function play(action, popts) {
    const po = popts || {};
    if (action === "idle") { forced = null; const old = cur; cur = null; settle(old); return Promise.resolve(); }
    if (action === "walk" || action === "run") {
      forced = action; const old = cur; cur = null; settle(old);
      if (po.loop) return Promise.resolve();
      return new Promise((res) => { setTimeout(() => { if (forced === action) forced = null; res(); }, 1200 / (po.speed || 1)); });
    }
    const def = ACTIONS[action];
    if (!def) { console.warn("[humanoid] unknown action", action); return Promise.resolve(); }
    const old = cur;
    const loop = po.loop != null ? !!po.loop : !!def.loop;
    return new Promise((resolve) => {
      cur = { id: action, def, t: 0, dur: def.dur / (po.speed || 1), loop, w: old ? old.w : 0, resolve, speed: po.speed || 1, ending: false };
      settle(old);
    });
  }

  function computeBase(dt, speed, airborne) {
    base.fill(0);
    const sp = forced === "run" ? 6.5 : forced === "walk" ? 1.6 : speed;
    speedS += (sp - speedS) * Math.min(1, dt * 10);
    airS += ((airborne ? 1 : 0) - airS) * Math.min(1, dt * 8);
    const s0 = speedS;
    const wI = 1 - smooth(0.08, 1.3, s0);
    const wR = smooth(3.8, 6.8, s0);
    const stride = (1.45 + wR * 1.0) * (o.height / 1.8);
    phase = (phase + s0 * dt / stride) % 1;
    const s = Math.sin(phase * TAU), c = Math.cos(phase * TAU);
    const A = (0.42 + wR * 0.42) * (1 - wI);
    const Bk = (0.55 + wR * 0.85) * (1 - wI);
    set(base, B.thL, -A * s, 0, 0.02); set(base, B.thR, A * s, 0, -0.02);
    set(base, B.shL, Bk * Math.max(0, c) + 0.08 * (1 - wI), 0, 0);
    set(base, B.shR, Bk * Math.max(0, -c) + 0.08 * (1 - wI), 0, 0);
    set(base, B.ftL, A * s * 0.3 - base[B.shL * 3] * 0.25, 0, 0);
    set(base, B.ftR, -A * s * 0.3 - base[B.shR * 3] * 0.25, 0, 0);
    const aA = A * 0.8;
    const br = Math.sin(time * 1.7);
    set(base, B.uaL, aA * s, 0, 0.07 + br * 0.012 * wI);
    set(base, B.uaR, -aA * s, 0, -0.07 - br * 0.012 * wI);
    set(base, B.faL, -0.18 - wR * 1.0 - Math.max(0, s) * 0.25 * (1 - wI), 0, 0);
    set(base, B.faR, -0.18 - wR * 1.0 - Math.max(0, -s) * 0.25 * (1 - wI), 0, 0);
    set(base, B.spine, wR * 0.16, s * 0.07 * (1 - wI), 0);
    set(base, B.chest, br * 0.02 * wI, -s * 0.11 * (1 - wI), 0);
    set(base, B.head, -wR * 0.1, Math.sin(time * 0.31) * 0.12 * wI, 0);
    set(base, B.neck, 0, 0, 0);
    base[DY] = -0.03 * Math.abs(s) * (1 - wI) * (1 + wR) + br * 0.004 * wI;
    // cape sway
    set(base, B.capeA, 0.08 + Math.min(0.5, s0 * 0.07) + Math.sin(time * 2.1) * 0.03, 0, 0);
    set(base, B.capeB, 0.05 + Math.min(0.35, s0 * 0.05) + Math.sin(time * 2.6 + 1) * 0.04, 0, 0);
    if (airS > 0.01) airPose(base, time, airS);
  }

  function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  function applyPose(pz) {
    for (let i = 0; i < NB; i++) {
      bones[i].rotation.set(pz[i * 3], pz[i * 3 + 1], pz[i * 3 + 2]);
    }
    bones[B.hips].position.set(0, L.local[B.hips][1] + pz[DY], pz[DZ]);
  }

  function update(dt, speed = 0, airborne = false) {
    time += dt;
    if (!visible) return;
    computeBase(dt, speed, airborne);
    if (cur) {
      cur.t += dt;
      const def = cur.def;
      let tt = cur.t / cur.dur;
      if (tt >= 1) {
        if (cur.loop) { cur.t -= cur.dur; tt = cur.t / cur.dur; }
        else if (def.hold) tt = 1;
        else { const done = cur; cur = null; settle(done); applyPose(base); return; }
      }
      // weight envelope
      const fadeIn = 0.08, fadeOut = 0.12;
      cur.w = Math.min(1, cur.w + dt / fadeIn);
      let w = cur.w;
      if (!cur.loop && !def.hold) { const rem = (1 - tt) * cur.dur; if (rem < fadeOut) w = Math.min(w, rem / fadeOut); }
      act.set(base);
      if (def.mask === 0) {
        // full-body actions start from a neutral pose so locomotion does not leak in
        for (let i = 0; i < NB; i++) if (!UPPER[i] || i === 0) { act[i * 3] = 0; act[i * 3 + 1] = 0; act[i * 3 + 2] = 0; }
        if (cur.id !== "jump") { act[DY] = 0; act[DZ] = 0; }
        if (cur.id === "jump" || cur.id === "fall") { act.set(base); }
      }
      def.fn(tt, time, act, cur.id);
      for (let i = 0; i < NB; i++) {
        const m = def.mask === 0 || UPPER[i];
        for (let k = 0; k < 3; k++) { const j = i * 3 + k; fin[j] = m ? base[j] + (act[j] - base[j]) * w : base[j]; }
      }
      fin[DY] = def.mask === 0 ? base[DY] + (act[DY] - base[DY]) * w : base[DY] + (act[DY] - base[DY]) * w;
      fin[DZ] = base[DZ] + (act[DZ] - base[DZ]) * w;
      applyPose(fin);
    } else {
      applyPose(base);
    }
  }

  const h = {
    root, hand, handL, head, mesh, skeleton, bones, sockets: { hand, handL, head, back, body },
    get action() { return cur ? cur.id : (forced || null); },
    update, play,
    setEyes(mode) { eyeMode = mode || "normal"; paint(); },
    get eyes() { return eyeMode; },
    setColors(c) { setColorSlots(c || {}); paint(); },
    setHat(name) {
      hat = name || null;
      colors.hat = lin(HAT_COL[hat] || "#6a5a40");
      const old = geo;
      geo = instanceGeo(geoFor(hat));
      mesh.geometry = geo;
      paint();
      // only dispose the per-instance buffers (shared attributes stay alive in the cache)
      old.deleteAttribute("color"); old.deleteAttribute("emis");
    },
    get hat() { return hat; },
    setArmor(look) {
      if (!look) { armorTint = null; if (armor) armor.visible = false; paint(); return; }
      if (look.plates) {
        const a = armorMesh();
        a.material.color.set(look.color || "#9aa0a8");
        a.material.metalness = look.metalness != null ? look.metalness : 1;
        a.material.roughness = look.roughness != null ? look.roughness : 0.35;
        a.visible = true;
        armorTint = null;
      } else {
        if (armor) armor.visible = false;
        armorTint = lin(look.color || "#6b7d5a");
      }
      paint();
    },
    setVisible(v) { visible = !!v; root.visible = visible; },
    get visible() { return visible; },
    setShadow(on) { mesh.castShadow = !!on; if (armor) armor.castShadow = !!on; },
    dispose() {
      settle(cur); cur = null;
      if (root.parent) root.parent.remove(root);
      geo.deleteAttribute("color"); geo.deleteAttribute("emis");
      if (armor) armor.material.dispose();
      skeleton.dispose();
    },
    proportions: P
  };
  update(0, 0, false);
  return h;
}
