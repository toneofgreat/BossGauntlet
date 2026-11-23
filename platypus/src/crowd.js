// crowd.js — the people of PLATYPUS levels 2–5 (LEVELS.md B4).
//   createCrowd(ctx) -> { group, update, reset, setLane, stroll, gather, disperse, watchers, react,
//                         tossCoin, panic, staff[2], audience }
// Visitors: ONE InstancedMesh (whole person + optional hat/phone/pram/balloon, posed in the vertex
// shader from a few per-instance channels) + one instanced blob-shadow draw.
// Staff: two skinned, procedurally animated humans (1 skinned draw each, + bucket for the keeper).
// Audience: ONE InstancedMesh of a 40-triangle seated figure animated in the vertex shader + one
// Points draw of camera flashes.
// No DOM, no listeners, no per-frame allocations.

const PI = Math.PI, TAU = PI * 2;
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function sstep(a, b, v) { v = clamp((v - a) / (b - a), 0, 1); return v * v * (3 - 2 * v); }
function damp(cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-rate * dt)); }
function wrapPi(a) { while (a > PI) a -= TAU; while (a < -PI) a += TAU; return a; }
function rng32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------------------------------
// tiny mesher: lofts of elliptical rings stacked bottom -> top (so the winding faces outward)

let loftRot = 0;
function mesher() { return { p: [], a: [], idx: [], n: 0 }; }

// rings: [cx, y, cz, rx, rz, ...extra]; aux: array | (ring, ri, j) -> array (per-vertex data)
// capB / capT: undefined = open, number = apex offset in y from the end ring (0 = flat)
function loft(m, rings, sides, aux, capB, capT) {
  const base = m.n, nr = rings.length;
  const auxOf = (r, ri, j) => (typeof aux === "function" ? aux(r, ri, j) : aux);
  for (let i = 0; i < nr; i++) {
    const r = rings[i];
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * TAU + loftRot;
      m.p.push(r[0] + r[3] * Math.cos(a), r[1], r[2] + r[4] * Math.sin(a));
      m.a.push(auxOf(r, i, j));
      m.n++;
    }
  }
  for (let i = 0; i < nr - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const j2 = (j + 1) % sides;
      const a = base + i * sides + j, b = base + (i + 1) * sides + j;
      const c = base + i * sides + j2, d = base + (i + 1) * sides + j2;
      m.idx.push(a, b, c, b, d, c);
    }
  }
  if (capB !== undefined) {
    const r = rings[0];
    m.p.push(r[0], r[1] + capB, r[2]); m.a.push(auxOf(r, 0, 0));
    const c = m.n++;
    for (let j = 0; j < sides; j++) m.idx.push(c, base + j, base + ((j + 1) % sides));
  }
  if (capT !== undefined) {
    const r = rings[nr - 1], o = base + (nr - 1) * sides;
    m.p.push(r[0], r[1] + capT, r[2]); m.a.push(auxOf(r, nr - 1, 0));
    const c = m.n++;
    for (let j = 0; j < sides; j++) m.idx.push(c, o + ((j + 1) % sides), o + j);
  }
}

function ball(m, cx, cy, cz, rx, ry, rz, sides, segs, aux) {
  const rings = [];
  for (let k = 1; k < segs; k++) {
    const t = (k / segs) * PI, s = Math.sin(t);
    rings.push([cx, cy - ry * Math.cos(t), cz, rx * s, rz * s]);
  }
  const cap = ry * (1 - Math.cos(PI / segs));
  loft(m, rings, sides, aux, -cap, cap);
}

function auxAttr(THREE, m, from, size) {
  const arr = new Float32Array(m.n * size);
  for (let i = 0; i < m.n; i++) for (let k = 0; k < size; k++) arr[i * size + k] = m.a[i][from + k];
  return new THREE.BufferAttribute(arr, size);
}


// shared GLSL
const GLSL_UNPACK = `
vec3 cwUnpack(float v){
  float c = floor(v + 0.5);
  float r = floor(c / 65536.0);
  float g = floor((c - r * 65536.0) / 256.0);
  float b = c - r * 65536.0 - g * 256.0;
  return pow(vec3(r, g, b) / 255.0, vec3(2.2));
}
void cwRotX(inout vec3 p, inout vec3 n, vec3 piv, float a){
  float s = sin(a), c = cos(a); p -= piv;
  p = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c) + piv;
  n = vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c);
}
void cwRotY(inout vec3 p, inout vec3 n, vec3 piv, float a){
  float s = sin(a), c = cos(a); p -= piv;
  p = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c) + piv;
  n = vec3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c);
}
void cwRotZ(inout vec3 p, inout vec3 n, vec3 piv, float a){
  float s = sin(a), c = cos(a); p -= piv;
  p = vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z) + piv;
  n = vec3(n.x * c - n.y * s, n.x * s + n.y * c, n.z);
}
`;

// ==========================================================================================
// VISITORS
// ==========================================================================================

const V_MAX = 24;
// skeleton constants of the visitor figure (metres, adult 1.72 tall, faces +Z, its left = +X)
const V_HIPX = 0.085, V_HIPY = 0.88, V_KNEEY = 0.49, V_SHX = 0.2, V_SHY = 1.38, V_ELY = 1.1, V_NECKY = 1.46;
// accessory bits
const ACC_HAT = 1, ACC_PHONE = 2, ACC_PRAM = 4, ACC_BALLOON = 8, ACC_LONGHAIR = 16, F_SLEEVES = 32, F_SHORTS = 64;
// part ids: 0 torso 1 head 2 armL 3 foreL 4 armR 5 foreR 6 thighL 7 shinL 8 thighR 9 shinR 10 pram 11 balloon
// colour slots: 0 shirt 1 pants 2 skin 3 hair 4 accent 5 balloon 6 dark 7 pale 8 sleeve 9 lower leg

function buildVisitorGeometry(THREE) {
  const m = mesher();
  const A = (part, slot, acc, shade) => [part, slot, acc || 0, shade === undefined ? 1 : shade];
  // torso (pelvis -> neck), 6 sides
  loft(m, [
    [0, 0.80, 0, 0.135, 0.095, 1], [0, 0.93, 0, 0.15, 0.105, 1], [0, 0.96, 0, 0.152, 0.107, 0],
    [0, 1.12, 0, 0.14, 0.1, 0], [0, 1.3, 0.005, 0.175, 0.112, 0], [0, 1.4, 0, 0.165, 0.095, 0],
    [0, 1.45, 0, 0.06, 0.06, 2], [0, 1.5, 0.005, 0.05, 0.052, 2],
  ], 6, (r, ri) => A(0, r[5], 0, ri === 0 ? 0.8 : 1), 0);
  // head, hair cap, eyes
  ball(m, 0, 1.6, 0.012, 0.082, 0.112, 0.094, 6, 4, A(1, 2));
  loft(m, [[0, 1.6, -0.018, 0.09, 0.092], [0, 1.675, -0.012, 0.086, 0.092], [0, 1.715, -0.004, 0.05, 0.056]],
    6, A(1, 3), undefined, 0.012);
  loft(m, [[0, 1.47, -0.05, 0.075, 0.045], [0, 1.62, -0.04, 0.092, 0.07]], 5, A(1, 3, ACC_LONGHAIR, 0.92), 0);
  for (const s of [-1, 1]) {
    const ex = s * 0.034, ey = 1.615, ez = 0.1, base = m.n;
    m.p.push(ex - 0.012, ey, ez, ex + 0.012, ey, ez, ex, ey + 0.014, ez - 0.002, ex, ey - 0.014, ez - 0.002);
    for (let k = 0; k < 4; k++) m.a.push(A(1, 6)); m.n += 4;
    m.idx.push(base, base + 2, base + 1, base, base + 1, base + 3);
  }
  // hat: brim + crown
  loft(m, [[0, 1.685, 0.01, 0.16, 0.17], [0, 1.69, 0.005, 0.092, 0.098], [0, 1.755, 0, 0.08, 0.086]],
    6, A(1, 4, ACC_HAT), 0, 0.012);
  // arms
  for (const s of [1, -1]) {
    const pu = s > 0 ? 2 : 4, x = s * V_SHX;
    loft(m, [[x * 1.03, V_ELY, 0, 0.037, 0.039], [x, 1.25, 0, 0.044, 0.047], [x * 0.98, 1.385, 0, 0.046, 0.05]],
      5, A(pu, 0), undefined, 0.03);
    loft(m, [[x * 1.05, 0.8, 0.01, 0.022, 0.03, 2], [x * 1.05, 0.87, 0.005, 0.027, 0.03, 2],
      [x * 1.04, 0.875, 0.005, 0.03, 0.033, 8], [x * 1.03, V_ELY, 0, 0.037, 0.039, 8]],
      5, (r) => A(pu + 1, r[5]), -0.03);
  }
  // phone in the right hand (part 5)
  loft(m, [[-0.21, 0.74, 0.045, 0.038, 0.007, 6], [-0.21, 0.88, 0.045, 0.038, 0.007, 6]], 4, A(5, 6, ACC_PHONE), 0, 0);
  // legs + shoes
  for (const s of [1, -1]) {
    const pt = s > 0 ? 6 : 8, x = s * V_HIPX;
    loft(m, [[x, V_KNEEY, 0, 0.052, 0.055], [x, 0.7, 0, 0.068, 0.072], [x * 1.05, 0.88, 0, 0.074, 0.08]], 5, A(pt, 1));
    loft(m, [[x, 0.075, 0, 0.036, 0.04, 9], [x, 0.3, -0.008, 0.048, 0.052, 9], [x, V_KNEEY, 0, 0.052, 0.055, 1]],
      5, (r, ri) => A(pt + 1, ri === 2 ? 1 : 9));
    loft(m, [[x, 0, 0.04, 0.046, 0.115], [x, 0.085, 0.025, 0.042, 0.085]], 5, A(pt + 1, 6), 0, 0);
  }
  // pram (pushed in front): tub, hood, handle, 4 wheels
  loft(m, [[0, 0.42, 0.78, 0.2, 0.3], [0, 0.72, 0.8, 0.23, 0.36]], 4, A(10, 4, ACC_PRAM), 0, 0);
  loft(m, [[0, 0.72, 0.63, 0.22, 0.17], [0, 0.98, 0.6, 0.17, 0.1]], 4, A(10, 4, ACC_PRAM, 0.8), undefined, 0);
  loft(m, [[0, 0.7, 0.5, 0.2, 0.014], [0, 1.03, 0.43, 0.2, 0.014]], 4, A(10, 6, ACC_PRAM), undefined, 0);
  for (const sx of [-1, 1]) for (const z of [0.56, 1.0]) {
    const base = m.n, cx = sx * 0.21, R = 0.11;
    m.p.push(cx, 0.11, z); m.a.push(A(10, 6, ACC_PRAM)); m.n++;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      m.p.push(cx, 0.11 + R * Math.sin(a), z + R * Math.cos(a)); m.a.push(A(10, 6, ACC_PRAM)); m.n++;
    }
    for (let k = 0; k < 6; k++) {
      const u = base + 1 + k, v = base + 1 + ((k + 1) % 6);
      if (sx > 0) m.idx.push(base, v, u); else m.idx.push(base, u, v);
    }
  }
  loft(m, [[0, 0.11, 0.78, 0.03, 0.22], [0, 0.43, 0.78, 0.03, 0.22]], 4, A(10, 6, ACC_PRAM, 1.6));
  // balloon on a string from the left hand
  const bx = 0.2, by = 1.24, bz = 0.46;
  ball(m, bx, by + 0.98, bz, 0.15, 0.18, 0.15, 6, 4, A(11, 5, ACC_BALLOON));
  loft(m, [[bx, by, bz, 0.005, 0.005], [bx, by + 0.8, bz, 0.005, 0.005]], 3, A(11, 7, ACC_BALLOON));

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(m.p), 3));
  g.setAttribute("aPart", auxAttr(THREE, m, 0, 4));
  g.setIndex(m.idx);
  g.computeVertexNormals();
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 40);
  return g;
}

function makeVisitorMaterial(THREE, uTime, uLamp) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCwTime = uTime;
    sh.uniforms.uCwLamp = uLamp;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>
attribute vec4 aPart;
attribute vec4 aColA;
attribute vec4 aColB;
attribute vec4 aAnim;
attribute vec4 aArms;
attribute vec4 aMisc;
uniform float uCwTime;
varying vec3 vCwCol;
${GLSL_UNPACK}`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
vec3 cwP = position; vec3 cwN = objectNormal;
{
  float part = aPart.x;
  float flags = aColB.z;
  if (aPart.z > 0.5) cwP *= mod(floor(flags / aPart.z + 0.001), 2.0);
  float ph = aAnim.x, amp = aAnim.y;
  float yOff = aAnim.w - ${V_HIPY.toFixed(2)} * (1.0 - cos(0.55 * amp * sin(ph)));
  if (part > 5.5 && part < 9.5) {
    float sd = part < 7.5 ? 1.0 : -1.0;
    float p = ph + (sd > 0.0 ? 0.0 : 3.14159265);
    float th = -0.55 * amp * sin(p);
    float kn = amp * (0.1 + 0.95 * pow(max(0.0, cos(p)), 1.5));
    if (mod(part, 2.0) > 0.5) cwRotX(cwP, cwN, vec3(sd * ${V_HIPX}, ${V_KNEEY}, 0.0), kn);
    cwRotX(cwP, cwN, vec3(sd * ${V_HIPX}, ${V_HIPY}, 0.0), th);
  } else if (part > 1.5 && part < 5.5) {
    float sd = part < 3.5 ? 1.0 : -1.0;
    float raise = sd > 0.0 ? aArms.x : aArms.y;
    float elbow = sd > 0.0 ? aArms.z : aArms.w;
    float inn = sd > 0.0 ? aMisc.x : aMisc.y;
    vec3 shp = vec3(sd * ${V_SHX}, ${V_SHY}, 0.0);
    float swing = sd * 0.45 * amp * sin(ph) * (1.0 - clamp(abs(raise) * 4.0, 0.0, 1.0));
    if (mod(part, 2.0) > 0.5) cwRotX(cwP, cwN, vec3(sd * ${V_SHX}, ${V_ELY}, 0.0), -elbow - 0.15 * amp);
    cwRotX(cwP, cwN, shp, swing - raise * 3.14159265);
    float w = smoothstep(0.55, 0.95, raise);
    cwRotY(cwP, cwN, shp, -sd * inn * (1.0 - w));
    cwRotZ(cwP, cwN, shp, sd * inn * w);
  } else if (part > 0.5 && part < 1.5) {
    vec3 nk = vec3(0.0, ${V_NECKY}, 0.0);
    cwP = nk + (cwP - nk) * aColB.w;
    cwRotX(cwP, cwN, nk, aMisc.w);
    cwRotY(cwP, cwN, nk, aMisc.z);
  } else if (part > 10.5) {
    float hgt = cwP.y - 1.24;
    float k = fract(aColB.y * 0.01371) * 6.2832;
    cwP.x += hgt * 0.13 * sin(uCwTime * 1.3 + k);
    cwP.z += hgt * (0.1 * sin(uCwTime * 0.9 + k * 1.7) - 0.28 * amp);
  }
  if (part < 5.5) cwRotX(cwP, cwN, vec3(0.0, ${V_HIPY}, 0.0), aAnim.z);
  if (part < 9.5 || part > 10.5) cwP.y += yOff;
  float slot = aPart.y;
  vec3 c;
  if (slot < 0.5) c = cwUnpack(aColA.x);
  else if (slot < 1.5) c = cwUnpack(aColA.y);
  else if (slot < 2.5) c = cwUnpack(aColA.z);
  else if (slot < 3.5) c = cwUnpack(aColA.w);
  else if (slot < 4.5) c = cwUnpack(aColB.x);
  else if (slot < 5.5) c = cwUnpack(aColB.y) * 1.15;
  else if (slot < 6.5) c = vec3(0.012);
  else if (slot < 7.5) c = vec3(0.8);
  else if (slot < 8.5) c = mod(floor(flags / 32.0 + 0.001), 2.0) > 0.5 ? cwUnpack(aColA.x) : cwUnpack(aColA.z);
  else c = mod(floor(flags / 64.0 + 0.001), 2.0) > 0.5 ? cwUnpack(aColA.z) : cwUnpack(aColA.y);
  vCwCol = c * aPart.w;
  objectNormal = cwN;
}`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = cwP;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCwCol;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vCwCol;");
  };
  mat.customProgramCacheKey = () => "platy-visitors";
  return mat;
}

const SKIN = [0xf6d3b8, 0xeebf9c, 0xd9a47c, 0xb97f55, 0x8d5a38, 0x5e3a24];
const HAIR = [0x1c1612, 0x3a2616, 0x6b4423, 0xa8752f, 0xd9b45a, 0x8c8c8c, 0xb5462a, 0x111118];
const SHIRT = [0xe5484d, 0x3d7fd9, 0xf2c230, 0x39a86b, 0xf08a3c, 0x9a5fd0, 0xf2f0ea, 0x2f3b55, 0xe86aa6, 0x38b6c4,
  0x7a8f3a, 0xd6d0c0, 0xc23b3b, 0x4f6fb0];
const PANTS = [0x2c3a55, 0x3c3c40, 0x6b5a45, 0x8a8f99, 0x26402e, 0x54657d, 0xb8a888, 0x1f2430];
const BALLOON = [0xff4b55, 0xffd23a, 0x4db8ff, 0x7be36b, 0xff8fd0];

const M_OFF = 0, M_STROLL = 1, M_TOLOOK = 2, M_LOOK = 3, M_WATCH = 4, M_LEAVE = 5, M_PANIC = 6;
const R_KIND = { ooh: 1, clap: 2, cheer: 3, point: 4, laugh: 5, gasp: 6, wave: 7 };
const R_DUR = [0, 1.5, 2.3, 2.5, 2.0, 1.9, 1.3, 2.3];
const R_SOUND = { ooh: "ooh", clap: "clap", cheer: "cheer", point: "ooh", laugh: "laugh", gasp: "gasp", wave: "ooh" };
const V_EXIT = 1.5, TOSS_REL = 0.38, PEND_MAX = 32;

function makeBlobTexture(THREE) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.55, "rgba(255,255,255,0.55)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

function slotX(k) {
  const row = k < 9 ? 0 : k < 18 ? 1 : 2, j = k - row * 9;
  return (((j + 1) >> 1) * 0.66 + (row === 1 ? 0.33 : 0)) * (j & 1 ? 1 : -1);
}
const bySlotX = (a, b) => slotX(a) - slotX(b);
const byX = (a, b) => a.x - b.x;

function createVisitors(ctx, staff) {
  const THREE = ctx.THREE;
  const group = new THREE.Group();
  group.name = "visitors";
  const uTime = { value: 0 }, uLamp = { value: 0 };
  const geo = buildVisitorGeometry(THREE);
  const mesh = new THREE.InstancedMesh(geo, makeVisitorMaterial(THREE, uTime, uLamp), V_MAX);
  mesh.frustumCulled = false; mesh.visible = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const colA = new Float32Array(V_MAX * 4), colB = new Float32Array(V_MAX * 4);
  const anim = new Float32Array(V_MAX * 4), arms = new Float32Array(V_MAX * 4), misc = new Float32Array(V_MAX * 4);
  const mkAttr = (name, arr, dyn) => {
    const a = new THREE.InstancedBufferAttribute(arr, 4);
    if (dyn) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, a);
    return a;
  };
  mkAttr("aColA", colA); mkAttr("aColB", colB);
  const atAnim = mkAttr("aAnim", anim, true), atArms = mkAttr("aArms", arms, true), atMisc = mkAttr("aMisc", misc, true);
  group.add(mesh);

  const blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2),
    new THREE.MeshBasicMaterial({ map: makeBlobTexture(THREE), color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false }), V_MAX);
  blobs.frustumCulled = false; blobs.visible = false;
  blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(blobs);

  const rnd = rng32(90210);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const P = [];
  for (let i = 0; i < V_MAX; i++) {
    const kid = i % 3 === 2;
    const pram = i === 3 || i === 13;
    let flags = 0;
    if (rnd() < 0.32) flags |= ACC_HAT;
    const phone = !kid && !pram && rnd() < 0.42;
    if (phone) flags |= ACC_PHONE;
    if (pram) flags |= ACC_PRAM;
    const balloon = !pram && !phone && (kid ? rnd() < 0.5 : rnd() < 0.08);
    if (balloon) flags |= ACC_BALLOON;
    if (rnd() < 0.42) flags |= ACC_LONGHAIR;
    if (rnd() < 0.45) flags |= F_SLEEVES;
    if (rnd() < (kid ? 0.55 : 0.28)) flags |= F_SHORTS;
    const scale = kid ? 0.55 + rnd() * 0.2 : 0.92 + rnd() * 0.14;
    colA[i * 4] = pick(SHIRT); colA[i * 4 + 1] = pick(PANTS);
    colA[i * 4 + 2] = pick(SKIN); colA[i * 4 + 3] = pick(HAIR);
    colB[i * 4] = pick(SHIRT); colB[i * 4 + 1] = pick(BALLOON);
    colB[i * 4 + 2] = flags; colB[i * 4 + 3] = kid ? 1.22 + rnd() * 0.1 : 1.0;
    P.push({
      i, on: false, kid, pram, phone, balloon, scale, wide: 0.88 + rnd() * 0.26,
      pace: (0.8 + rnd() * 0.4) * Math.pow(scale, 0.6), seed: rnd() * 100,
      x: 0, z: 0, yaw: 0, sp: 0, dir: 1, laneZ: 0, mode: M_OFF, t: 0, tx: 0, tz: 0, arrived: false,
      phase: rnd() * TAU, appear: 0, rK: 0, rT: 0, rDur: 0, rAmp: 0, rDelay: 0, tossT: -1, tossBusy: 0,
      out: 0, stum: 0, glance: 0, ch: new Float32Array(10),
    });
  }

  const lane = { x0: -12, x1: 12, z0: 10.8, z1: 14.2, y: NaN, glassZ: 10 };
  let strollN = 0, panicOn = false, spawnT = 0, trimT = 0, focusX = 0, focusZ = 6, floorY = 0;
  const pendP = new Array(PEND_MAX).fill(null), pendCb = new Array(PEND_MAX).fill(null), pendT = new Float32Array(PEND_MAX);
  let pendN = 0;
  const from = { x: 0, y: 0, z: 0 };
  const o = new Float32Array(10);
  let mixE = 0;
  function mix(k, v) { o[k] += (v - o[k]) * mixE; }
  const sortBuf = [], slotBuf = [];

  const laneLo = () => Math.max(lane.z0, lane.glassZ + 1.9);
  const randLane = () => lerp(laneLo(), lane.z1 - 0.2, rnd());
  const nearEnd = (x) => (x - lane.x0 < lane.x1 - x ? -1 : 1);

  function activate(p, mode) {
    p.on = true; p.mode = mode; p.appear = 0; p.sp = 0; p.arrived = false; p.rK = 0; p.tossT = -1; p.tossBusy = 0;
    p.stum = 0; p.t = 2 + rnd() * 7; p.laneZ = randLane(); p.ch.fill(0);
  }
  function spawn(side, mode, noPram) {
    let n = 0;
    for (let i = 0; i < V_MAX; i++) if (!P[i].on && !(noPram && P[i].pram)) n++;
    if (!n) return null;
    let k = Math.floor(rnd() * n);
    for (let i = 0; i < V_MAX; i++) {
      const p = P[i];
      if (p.on || (noPram && p.pram) || k-- !== 0) continue;
      activate(p, mode);
      p.dir = -side; p.x = side < 0 ? lane.x0 - V_EXIT : lane.x1 + V_EXIT; p.z = p.laneZ; p.yaw = p.dir * PI / 2;
      return p;
    }
    return null;
  }
  function count(mode) { let n = 0; for (let i = 0; i < V_MAX; i++) if (P[i].on && P[i].mode === mode) n++; return n; }
  function countActive() { let n = 0; for (let i = 0; i < V_MAX; i++) if (P[i].on) n++; return n; }

  function setLane(walkway, glassZ) {
    if (walkway) {
      lane.x0 = walkway.x0; lane.x1 = walkway.x1; lane.z0 = walkway.z0; lane.z1 = walkway.z1;
      lane.y = typeof walkway.y === "number" ? walkway.y : NaN;
    }
    if (typeof glassZ === "number") lane.glassZ = glassZ;
  }

  function release(p) {
    p.mode = M_STROLL; p.arrived = false; p.t = 3 + rnd() * 6; p.laneZ = randLane(); p.dir = rnd() < 0.5 ? -1 : 1;
  }
  function disperse() {
    for (let i = 0; i < V_MAX; i++) {
      const p = P[i];
      if (!p.on || p.mode === M_PANIC) continue;
      if (p.mode === M_WATCH) release(p);
      if (strollN === 0) { p.mode = M_LEAVE; p.dir = nearEnd(p.x); }
    }
  }

  function stroll(n) {
    strollN = clamp(Math.round(n || 0), 0, V_MAX);
    if (panicOn) return;
    if (strollN === 0) { disperse(); return; }
    if (countActive() === 0) {
      for (let k = 0; k < strollN; k++) {
        const p = spawn(rnd() < 0.5 ? -1 : 1, M_STROLL);
        if (!p) break;
        p.x = lerp(lane.x0 + 0.5, lane.x1 - 0.5, (k + 0.2 + rnd() * 0.6) / strollN);
        p.appear = 1; p.sp = p.pace;
      }
    }
  }

  function assignSpots() {
    sortBuf.length = 0;
    for (let i = 0; i < V_MAX; i++) if (P[i].on && P[i].mode === M_WATCH) sortBuf.push(P[i]);
    const c = sortBuf.length;
    let nk = 0;
    for (let i = 0; i < c; i++) if (sortBuf[i].kid) nk++;
    sortBuf.sort(byX);
    for (let pass = 0; pass < 2; pass++) {
      // pass 0: children take the first (front, central) slots; pass 1: adults take the rest
      const k0 = pass === 0 ? 0 : nk, k1 = pass === 0 ? nk : c;
      slotBuf.length = 0;
      for (let k = k0; k < k1; k++) slotBuf.push(k);
      slotBuf.sort(bySlotX);
      let q = 0;
      for (let i = 0; i < c; i++) {
        const p = sortBuf[i];
        if ((p.kid ? 0 : 1) !== pass) continue;
        const k = slotBuf[q++], row = k < 9 ? 0 : k < 18 ? 1 : 2;
        p.tx = clamp(focusX + slotX(k), lane.x0 + 0.3, lane.x1 - 0.3);
        p.tz = lane.glassZ + (row === 0 ? (p.kid ? 0.6 : 0.72) : row === 1 ? 1.42 : 2.1) + (p.seed % 1) * 0.08;
      }
    }
  }

  function gather(x, n) {
    if (panicOn) return;
    n = clamp(Math.round(n || 0), 0, V_MAX - 2);
    focusX = x; focusZ = lane.glassZ - 4;
    let c = count(M_WATCH);
    while (c < n) {
      let best = null, bd = 1e9;
      for (let i = 0; i < V_MAX; i++) {
        const p = P[i];
        if (!p.on || p.pram || p.mode === M_WATCH || p.mode === M_PANIC) continue;
        const d = Math.abs(p.x - x) + (p.mode === M_LEAVE ? 6 : 0);
        if (d < bd) { bd = d; best = p; }
      }
      if (!best || bd > 11) {
        const side = nearEnd(x);
        const s = spawn(c & 1 ? -side : side, M_WATCH, true);
        if (s) { best = s; s.x += (s.x < 0 ? 1 : -1) * rnd() * 0.8; s.appear = 0.5; }
        else if (!best) break;
      }
      best.mode = M_WATCH; best.arrived = false;
      c++;
    }
    while (c > n) {
      let far = null, fd = -1;
      for (let i = 0; i < V_MAX; i++) {
        const p = P[i];
        if (!p.on || p.mode !== M_WATCH) continue;
        const d = Math.abs(p.x - x) + (p.kid ? 0 : 3);
        if (d > fd) { fd = d; far = p; }
      }
      if (!far) break;
      release(far);
      c--;
    }
    assignSpots();
  }
  function isWatching(p) { return p.on && ((p.mode === M_WATCH && p.arrived) || p.mode === M_LOOK); }
  function watchers(x, radius = 5) {
    let n = 0;
    for (let i = 0; i < V_MAX; i++) if (isWatching(P[i]) && Math.abs(P[i].x - x) <= radius) n++;
    return n;
  }

  function react(kind, intensity = 0.6) {
    const id = R_KIND[kind];
    if (!id) return;
    intensity = clamp(intensity, 0, 1.5);
    let any = 0;
    for (let i = 0; i < V_MAX; i++) if (isWatching(P[i])) any++;
    const all = any === 0;
    let done = 0;
    for (let i = 0; i < V_MAX; i++) {
      const p = P[i];
      if (!p.on || p.mode === M_PANIC || (!all && !isWatching(p))) continue;
      if (done > 0 && rnd() > 0.55 + 0.5 * intensity) continue;
      p.rK = id === 4 && done > 0 && rnd() < 0.55 ? 1 : id;
      p.rT = 0; p.rDelay = done === 0 ? 0 : rnd() * 0.3;
      p.rDur = R_DUR[id] * (0.7 + 0.6 * Math.min(1, intensity)) * (0.85 + rnd() * 0.3);
      p.rAmp = clamp(0.55 + 0.6 * intensity, 0.5, 1.3);
      done++;
    }
    const a = ctx.audio;
    if (done > 0 && a && typeof a.crowd === "function") {
      const k = kind === "point" || kind === "wave" ? 0.5 : 1;
      a.crowd(R_SOUND[kind], clamp(intensity * k * (all ? 0.6 : 1) * (0.55 + 0.45 * Math.min(1, done / 5)), 0, 1), true);
    }
  }

  function tossCoin(cb) {
    if (pendN >= PEND_MAX || typeof cb !== "function") return false;
    let best = null;
    for (let i = 0; i < V_MAX; i++) {
      const p = P[i];
      if (!p.on || p.mode !== M_WATCH || !p.arrived) continue;
      if (!best || p.tossBusy < best.tossBusy) best = p;
    }
    if (!best) return false;
    const T = best.tossBusy + TOSS_REL + (best.tossBusy > 0 ? 0 : rnd() * 0.18);
    best.tossBusy = T + 0.22;
    pendP[pendN] = best; pendCb[pendN] = cb; pendT[pendN] = T; pendN++;
    return true;
  }
  function handOf(p, raise) {
    const s = p.scale, lx = -0.2 * s * p.wide, ly = (1.38 - 0.55 * Math.cos(raise * PI)) * s, lz = 0.55 * Math.sin(raise * PI) * s;
    const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    from.x = p.x + lx * c + lz * sn; from.y = floorY + ly; from.z = p.z - lx * sn + lz * c;
    return from;
  }

  function panic(on) {
    on = !!on;
    if (on === panicOn) return;
    panicOn = on;
    const mid = (lane.x0 + lane.x1) / 2;
    for (let i = 0; i < V_MAX; i++) {
      const p = P[i];
      if (!p.on) continue;
      if (on) { p.mode = M_PANIC; p.out = 2 + rnd() * 9; p.t = rnd() * 1.2; p.dir = rnd() < 0.5 ? -1 : 1; p.rK = 0; p.arrived = false; }
      else if (p.mode === M_PANIC) { p.out = 0; p.dir = p.x < mid ? -1 : 1; }
    }
    spawnT = 0;
    if (on) {
      // an empty hall (night) fills at once: people are already running when the eye opens
      for (let n = countActive(); n < 7; n++) {
        const p = spawn(rnd() < 0.5 ? -1 : 1, M_PANIC);
        if (!p) break;
        p.x = lerp(lane.x0 + 0.8, lane.x1 - 0.8, rnd()); p.laneZ = lerp(lane.glassZ + 0.8, lane.z1, rnd()); p.z = p.laneZ;
        p.dir = rnd() < 0.5 ? -1 : 1; p.yaw = p.dir * PI / 2; p.appear = 1; p.sp = 2.5;
        p.out = 3 + rnd() * 9; p.t = rnd() * 1.5;
      }
    }
  }

  function reset() {
    for (let i = 0; i < V_MAX; i++) { P[i].on = false; P[i].mode = M_OFF; }
    for (let i = 0; i < pendN; i++) { pendP[i] = null; pendCb[i] = null; }
    pendN = 0; strollN = 0; panicOn = false; spawnT = 0; trimT = 0;
    mesh.visible = false; blobs.visible = false;
  }

  function walk(p, dx, dz, want, dt, turn) {
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    p.sp = damp(p.sp, want, 5, dt);
    p.x += dx * p.sp * dt; p.z += dz * p.sp * dt;
    if (turn) p.yaw += wrapPi(Math.atan2(dx, dz) - p.yaw) * Math.min(1, dt * 7);
  }
  function faceGlass(p, dt) { p.yaw += wrapPi(PI - p.yaw) * Math.min(1, dt * 5); }

  function step(p, dt, time) {
    const ch = p.ch;
    p.appear = Math.min(1, p.appear + dt * 2.5);
    p.stum = Math.max(0, p.stum - dt * 1.6);
    if (p.tossBusy > 0) p.tossBusy = Math.max(0, p.tossBusy - dt);
    let watching = false;
    switch (p.mode) {
      case M_STROLL:
      case M_LEAVE: {
        const leave = p.mode === M_LEAVE;
        walk(p, p.dir, clamp((p.laneZ - p.z) * 0.8, -0.6, 0.6), p.pace * (leave ? 1.2 : 1), dt, true);
        p.t -= dt;
        if (!leave && p.t <= 0) {
          p.t = 4 + rnd() * 8;
          if (rnd() < 0.6 && p.x > lane.x0 + 1.5 && p.x < lane.x1 - 1.5) {
            p.mode = M_TOLOOK;
            p.tx = clamp(p.x + p.dir * (1 + rnd() * 2), lane.x0 + 0.6, lane.x1 - 0.6);
            p.tz = lane.glassZ + (p.pram ? 1.95 : count(M_WATCH) > 0 ? 2.0 + rnd() * 0.5 : 0.8 + rnd() * 0.6);
          } else if (rnd() < 0.2) p.dir = -p.dir;
        }
        break;
      }
      case M_TOLOOK: {
        const dx = p.tx - p.x, dz = p.tz - p.z;
        if (dx * dx + dz * dz < 0.02) { p.mode = M_LOOK; p.t = 3.5 + rnd() * 7; }
        else walk(p, dx, dz, p.pace, dt, true);
        break;
      }
      case M_LOOK:
        p.sp = damp(p.sp, 0, 8, dt); faceGlass(p, dt); watching = true;
        p.t -= dt;
        if (p.t <= 0) { p.mode = M_STROLL; p.t = 5 + rnd() * 9; p.laneZ = randLane(); if (rnd() < 0.3) p.dir = -p.dir; }
        break;
      case M_WATCH: {
        const dx = p.tx - p.x, dz = p.tz - p.z, d2 = dx * dx + dz * dz;
        if (!p.arrived) {
          if (d2 < 0.02) p.arrived = true;
          else walk(p, dx, dz, p.pace * 1.6 + 0.4, dt, true);
        } else {
          watching = true;
          if (d2 > 6) p.arrived = false;
          else if (d2 > 0.004) walk(p, dx, dz, Math.min(0.8, Math.sqrt(d2) * 3), dt, false);
          else p.sp = damp(p.sp, 0, 8, dt);
          faceGlass(p, dt);
        }
        break;
      }
      case M_PANIC: {
        p.t -= dt; p.out -= dt;
        if (p.out > 0) {
          if (p.t <= 0) { p.t = 0.7 + rnd() * 1.9; if (rnd() < 0.45) p.dir = -p.dir; p.laneZ = lerp(lane.glassZ + 0.8, lane.z1, rnd()); }
          if (p.x > lane.x1 - 0.6) p.dir = -1; else if (p.x < lane.x0 + 0.6) p.dir = 1;
        }
        walk(p, p.dir, clamp((p.laneZ - p.z) * 1.5, -0.9, 0.9), (2.6 + (p.seed % 1) * 1.4) * Math.pow(p.scale, 0.5) * (1 - 0.65 * p.stum), dt, true);
        break;
      }
    }
    if (p.x < lane.x0 - V_EXIT - 0.05 || p.x > lane.x1 + V_EXIT + 0.05) {
      if (p.mode === M_WATCH || p.mode === M_TOLOOK) p.x = clamp(p.x, lane.x0 - V_EXIT, lane.x1 + V_EXIT);
      else { p.on = false; p.mode = M_OFF; return; }
    }
    p.z = clamp(p.z, lane.glassZ + 0.5, lane.z1 + 0.3);
    const gait = 1.15 * Math.pow(p.scale, 0.7), amp = clamp(p.sp / gait, 0, 1.6);
    p.phase += dt * TAU * p.sp / (1.5 * p.scale * (0.7 + 0.3 * amp));
    if (p.phase > TAU * 16) p.phase -= TAU * 16;

    // base channels: raiseL raiseR elbowL elbowR inL inR lean bounce headYaw headPitch
    let rl = 0, rr = 0, el = 0.12, er = 0.12, il = 0, ir = 0, lean = 0.03 * amp, hy = 0, hp = 0;
    if (p.pram) { rl = rr = 0.22; el = er = 0.5; }
    if (p.balloon) { rl = 0.25; el = 1.0; }
    if (watching) {
      lean += p.kid ? 0.02 : 0.06;
      if (p.phone) { rr = 0.47; er = 1.25; ir = 0.2; }
      hy = clamp(wrapPi(Math.atan2(focusX - p.x, focusZ - p.z) - p.yaw), -0.9, 0.9);
      hp = p.kid ? 0.03 : 0.14;
    } else if (p.mode === M_PANIC) {
      if (!p.pram) { rl = rr = 0.86; el = er = 0.45; }
      lean = 0.2 + 0.5 * p.stum;
    } else {
      // strollers glance through the glass now and then
      p.glance = damp(p.glance, Math.sin(time * 0.37 + p.seed) > 0.35 ? 1 : 0, 3, dt);
      hy = clamp(wrapPi(PI - p.yaw), -1, 1) * 0.75 * p.glance;
    }
    ch[0] = damp(ch[0], rl, 8, dt); ch[1] = damp(ch[1], rr, 8, dt); ch[2] = damp(ch[2], el, 8, dt);
    ch[3] = damp(ch[3], er, 8, dt); ch[4] = damp(ch[4], il, 8, dt); ch[5] = damp(ch[5], ir, 8, dt);
    ch[6] = damp(ch[6], lean, 8, dt); ch[8] = damp(ch[8], hy, 6, dt); ch[9] = damp(ch[9], hp, 6, dt);
    ch[7] = (p.kid ? 0.035 : 0.012) * amp * Math.abs(Math.sin(p.phase));
    for (let k = 0; k < 10; k++) o[k] = ch[k];
    const sd = p.seed;
    if (p.mode === M_PANIC && !p.pram) {
      const f = time * 9 + sd;
      o[0] += 0.09 * Math.sin(f); o[1] -= 0.09 * Math.sin(f); o[4] = 0.3 * Math.sin(f * 1.3); o[5] = -o[4];
      o[8] = 0.5 * Math.sin(time * 3.1 + sd);
    }
    if (p.rK) {
      p.rT += dt;
      const t = p.rT - p.rDelay;
      if (t > p.rDur) p.rK = 0;
      else if (t > 0) {
        const a = p.rAmp, free = !p.pram && !p.balloon;
        mixE = sstep(0, 0.16, t) * (1 - sstep(p.rDur - 0.4, p.rDur, t));
        switch (p.rK) {
          case 1: mix(6, 0.2 * a); mix(9, 0.12); if (free) { mix(0, 0.06); mix(2, 0.5); } break;
          case 2: {
            const c = 0.36 + 0.2 * Math.sin(t * TAU * (3.6 + (sd % 1)) + sd);
            if (free) { mix(0, 0.3); mix(2, 1.25); mix(4, c); }
            mix(1, 0.3); mix(3, 1.25); mix(5, free ? c : 0.5); mix(7, 0.012 * a);
            break;
          }
          case 3: {
            const w = 0.28 * Math.sin(t * 7.5 + sd);
            if (free) { mix(0, 0.9 + 0.05 * Math.sin(t * 9)); mix(2, 0.25); mix(4, w); }
            mix(1, 0.92); mix(3, 0.25); mix(5, w);
            mix(7, 0.09 * a * Math.abs(Math.sin(t * TAU * 2.1 + sd))); mix(9, -0.12);
            break;
          }
          case 4: mix(1, 0.5); mix(3, 0.05); mix(5, 0.12); mix(6, 0.1); break;
          case 5: mix(6, -0.1); mix(9, -0.16); mix(7, 0.03 * a * Math.abs(Math.sin(t * TAU * 4.6)));
            mix(1, 0.13); mix(3, 1.0); mix(5, 0.45); break;
          case 6: if (free) { mix(0, 0.6); mix(2, 2.1); mix(4, 0.5); }
            mix(1, 0.6); mix(3, 2.1); mix(5, 0.5); mix(6, -0.09); mix(9, -0.06); break;
          case 7: mix(1, 0.94); mix(3, 0.2); mix(5, 0.38 * Math.sin(t * TAU * 2.3)); break;
        }
      }
    }
    if (p.tossT >= 0) {
      p.tossT += dt;
      const t = p.tossT;
      if (t > 0.72) p.tossT = -1;
      else {
        o[1] = t < 0.2 ? lerp(o[1], -0.14, sstep(0, 0.2, t)) : t < TOSS_REL ? lerp(-0.14, 0.72, sstep(0.2, TOSS_REL, t)) : lerp(0.72, o[1], sstep(TOSS_REL, 0.72, t));
        o[3] = t < TOSS_REL ? lerp(0.9, 0.1, sstep(0.2, TOSS_REL, t)) : 0.15; o[5] = 0.05;
      }
    }
    const i4 = p.i * 4;
    anim[i4] = p.phase; anim[i4 + 1] = amp; anim[i4 + 2] = o[6]; anim[i4 + 3] = o[7];
    arms[i4] = o[0]; arms[i4 + 1] = o[1]; arms[i4 + 2] = o[2]; arms[i4 + 3] = o[3];
    misc[i4] = o[4]; misc[i4 + 1] = o[5]; misc[i4 + 2] = o[8]; misc[i4 + 3] = o[9];
  }

  function update(dt, time) {
    uTime.value = time;
    { const w = ctx.world; uLamp.value = w && w.lampU ? w.lampU.value : 0; }
    if (Number.isFinite(lane.y)) floorY = lane.y;
    else {
      const w = ctx.world;
      const h = w && typeof w.heightAt === "function" ? w.heightAt((lane.x0 + lane.x1) / 2, (lane.z0 + lane.z1) / 2) : 0;
      floorY = Number.isFinite(h) ? h : 0;
    }
    // population upkeep
    let nStroll = 0, nWatch = 0, nAll = 0;
    for (let i = 0; i < V_MAX; i++) {
      const p = P[i];
      if (!p.on) continue;
      nAll++;
      if (p.mode === M_WATCH) nWatch++;
      else if (p.mode >= M_STROLL && p.mode <= M_LOOK) nStroll++;
    }
    if (panicOn) {
      if (nAll < 9) {
        spawnT -= dt;
        if (spawnT <= 0) {
          spawnT = 0.3 + rnd() * 0.9;
          const p = spawn(rnd() < 0.5 ? -1 : 1, M_PANIC);
          if (p) { p.out = 3 + rnd() * 8; p.t = 1 + rnd() * 2; p.appear = 0.6; }
        }
      }
    } else {
      const want = nWatch > 0 ? Math.max(Math.min(strollN, 2), strollN - nWatch) : strollN;
      if (nStroll < want) {
        spawnT -= dt;
        if (spawnT <= 0) { spawnT = 1.5 + rnd() * 3; spawn(rnd() < 0.5 ? -1 : 1, M_STROLL); }
      } else if (nStroll > want) {
        trimT -= dt;
        if (trimT <= 0) {
          trimT = 1.2;
          for (let i = 0; i < V_MAX; i++) {
            const p = P[i];
            if (p.on && p.mode === M_STROLL) { p.mode = M_LEAVE; p.dir = nearEnd(p.x); break; }
          }
        }
      }
    }
    // pending coin tosses
    for (let k = pendN - 1; k >= 0; k--) {
      const p = pendP[k];
      pendT[k] -= dt;
      if (pendT[k] <= TOSS_REL && pendT[k] > 0 && p.tossT < 0) p.tossT = Math.max(0, TOSS_REL - pendT[k]);
      if (pendT[k] <= 0) {
        const cb = pendCb[k];
        pendN--;
        pendP[k] = pendP[pendN]; pendCb[k] = pendCb[pendN]; pendT[k] = pendT[pendN];
        pendP[pendN] = null; pendCb[pendN] = null;
        p.tossT = TOSS_REL;
        cb(handOf(p, 0.72));
      }
    }
    for (let i = 0; i < V_MAX; i++) if (P[i].on) step(P[i], dt, time);
    // keep people out of each other (and bump while panicking), and out of the staff's way
    for (let i = 0; i < V_MAX; i++) {
      const a = P[i];
      if (!a.on || (a.mode === M_WATCH && a.arrived)) continue;
      for (let j = i + 1; j < V_MAX; j++) {
        const b = P[j];
        if (!b.on || (b.mode === M_WATCH && b.arrived)) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        if (Math.abs(dx) > 0.7 || Math.abs(dz) > 0.55) continue;
        const push = (0.55 - Math.abs(dz)) * Math.min(1, dt * 4) * (dz >= 0 ? 1 : -1);
        a.z -= push * 0.5; b.z += push * 0.5;
        if (panicOn && a.mode === M_PANIC && b.mode === M_PANIC && Math.abs(dx) < 0.45 && a.stum <= 0 && b.stum <= 0 && a.dir !== b.dir) {
          a.stum = 1; b.stum = 0.8; a.dir = -a.dir; a.sp *= 0.3; b.sp *= 0.5;
        }
      }
      for (let s = 0; s < staff.length; s++) {
        const st = staff[s];
        if (!st.visible) continue;
        const dx = st.x - a.x, dz = st.z - a.z;
        if (Math.abs(dx) < 1.1 && Math.abs(dz) < 0.7) a.z -= (0.7 - Math.abs(dz)) * Math.min(1, dt * 5) * (dz >= 0 ? 1 : -1);
      }
    }
    // write instances
    const mA = mesh.instanceMatrix.array, bA = blobs.instanceMatrix.array;
    let any = false;
    for (let i = 0; i < V_MAX; i++) {
      const p = P[i], k = i * 16;
      for (let q = 0; q < 16; q++) { mA[k + q] = 0; bA[k + q] = 0; }
      mA[k + 15] = 1; bA[k + 15] = 1;
      if (!p.on) continue;
      any = true;
      const s = p.scale * (0.2 + 0.8 * sstep(0, 1, p.appear)), c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
      mA[k] = c * s * p.wide; mA[k + 2] = -sn * s * p.wide; mA[k + 5] = s; mA[k + 8] = sn * s; mA[k + 10] = c * s;
      mA[k + 12] = p.x; mA[k + 13] = floorY; mA[k + 14] = p.z;
      const bs = (p.pram ? 1.3 : 0.75) * s, fo = p.pram ? 0.45 * s : 0;
      bA[k] = bs; bA[k + 5] = 1; bA[k + 10] = bs;
      bA[k + 12] = p.x + sn * fo; bA[k + 13] = floorY + 0.02; bA[k + 14] = p.z + c * fo;
    }
    mesh.visible = blobs.visible = any;
    if (any) {
      mesh.instanceMatrix.needsUpdate = true; blobs.instanceMatrix.needsUpdate = true;
      atAnim.needsUpdate = true; atArms.needsUpdate = true; atMisc.needsUpdate = true;
    }
  }

  return { group, update, reset, setLane, stroll, gather, disperse, watchers, react, tossCoin, panic,
    setFocus(x, z) { focusX = x; focusZ = z; },
    get count() { return countActive(); }, get panicking() { return panicOn; }, people: P, mesh };
}

// ==========================================================================================
// STAFF — two skinned, procedurally animated humans (keeper, handler)
// ==========================================================================================

const SB = { hips: 0, spine: 1, chest: 2, neck: 3, head: 4, armL: 5, foreL: 6, handL: 7, armR: 8, foreR: 9, handR: 10,
  thighL: 11, shinL: 12, footL: 13, thighR: 14, shinR: 15, footR: 16 };
// parent, bind x, y, z (model faces +Z; its left is +X)
const S_BONES = [
  [-1, 0, 0.92, 0], [0, 0, 1.04, 0], [1, 0, 1.22, 0], [2, 0, 1.47, 0], [3, 0, 1.54, 0],
  [2, 0.205, 1.4, 0], [5, 0.215, 1.12, 0], [6, 0.22, 0.86, 0],
  [2, -0.205, 1.4, 0], [8, -0.215, 1.12, 0], [9, -0.22, 0.86, 0],
  [0, 0.095, 0.9, 0], [11, 0.095, 0.5, 0], [12, 0.095, 0.1, 0],
  [0, -0.095, 0.9, 0], [14, -0.095, 0.5, 0], [15, -0.095, 0.1, 0],
];
const S_LEG = 0.4, S_ANKLE = 0.12;

function buildStaffGeometry(THREE, look) {
  const m = mesher();
  const C = {};
  const tmp = new THREE.Color();
  for (const k in look.colors) { tmp.set(look.colors[k]); C[k] = [tmp.r, tmp.g, tmp.b]; }
  const ax = (r) => { const c = C[r[5]]; return [c[0], c[1], c[2], r[6], r[7] === undefined ? r[6] : r[7], r[8] || 0]; };
  const flat = (key, bone, k = 1) => { const c = C[key]; return [c[0] * k, c[1] * k, c[2] * k, bone, bone, 0]; };
  const T = 16, L = 10;
  const H = SB.hips, SP = SB.spine, CH = SB.chest, NK = SB.neck, HD = SB.head;
  // torso
  loft(m, [
    [0, 0.83, 0, 0.12, 0.1, "pants", H], [0, 0.92, 0, 0.168, 0.118, "pants", H],
    [0, 0.975, 0, 0.166, 0.116, "pants", H, SP, 0.4], [0, 0.975, 0, 0.171, 0.121, "belt", H, SP, 0.4],
    [0, 1.0, 0, 0.171, 0.121, "belt", H, SP, 0.5], [0, 1.0, 0, 0.166, 0.116, "shirt", H, SP, 0.5],
    [0, 1.1, 0, 0.152, 0.108, "shirt", SP], [0, 1.22, 0.004, 0.172, 0.118, "shirt", SP, CH, 0.5],
    [0, 1.33, 0.008, 0.19, 0.124, "shirt", CH], [0, 1.405, 0, 0.186, 0.106, "shirt", CH],
    [0, 1.452, 0, 0.105, 0.088, "shirt", CH], [0, 1.478, 0, 0.07, 0.072, "collar", CH, NK, 0.5],
    [0, 1.492, 0, 0.056, 0.06, "skin", NK], [0, 1.56, 0.004, 0.054, 0.058, "skin", NK, HD, 0.6],
  ], T, ax, 0);
  // head with a painted hairline
  const hc = 1.64, hry = 0.118, hs = 9, rings = [];
  for (let k = 1; k < hs; k++) {
    const t = (k / hs) * PI, y = hc - hry * Math.cos(t), s = Math.sin(t);
    const jaw = y < hc ? lerp(0.78, 1, clamp((y - (hc - hry)) / hry, 0, 1)) : 1;
    rings.push([0, y, 0.012 + 0.012 * (1 - jaw), 0.08 * s * jaw, 0.095 * s * (0.9 + 0.1 * jaw)]);
  }
  const hcap = hry * (1 - Math.cos(PI / hs));
  loft(m, rings, T, (r, ri, j) => {
    const z = Math.sin((j / T) * TAU), y = r[1];
    const hair = y > hc + 0.066 || (z < -0.15 && y > hc - 0.055) || (z < 0.5 && y > hc + 0.036);
    return flat(hair ? "hair" : "skin", HD);
  }, -hcap, hcap);
  ball(m, 0, 1.628, 0.106, 0.013, 0.022, 0.016, 6, 4, flat("skin", HD, 0.9));
  ball(m, 0, 1.59, 0.089, 0.022, 0.0045, 0.006, 6, 4, flat("lip", HD));
  for (const s of [1, -1]) {
    ball(m, s * 0.031, 1.662, 0.089, 0.0085, 0.0085, 0.006, 6, 4, flat("eye", HD));
    ball(m, s * 0.031, 1.683, 0.091, 0.017, 0.004, 0.006, 6, 4, flat("hair", HD));
    ball(m, s * 0.081, 1.645, 0.004, 0.01, 0.024, 0.015, 6, 4, flat("skin", HD, 0.95));
  }
  if (look.cap) {
    loft(m, [[0, 1.69, 0.006, 0.089, 0.104], [0, 1.735, 0.004, 0.085, 0.099], [0, 1.768, 0, 0.058, 0.068]],
      T, flat("cap", HD), 0, 0.014);
    ball(m, 0, 1.696, 0.132, 0.073, 0.007, 0.076, 8, 4, flat("cap", HD, 0.8));
  }
  // arms
  const sl = look.longSleeves ? "shirt" : "skin";
  for (const s of [1, -1]) {
    const A = s > 0 ? SB.armL : SB.armR, F = A + 1, Hn = A + 2;
    loft(m, [
      [s * 0.215, 1.12, 0, 0.039, 0.041, sl, A, F, 0.5], [s * 0.213, 1.165, 0, 0.041, 0.043, sl, A, F, 0.12],
      [s * 0.21, 1.25, 0, 0.044, 0.047, sl, A], [s * 0.21, 1.25, 0, 0.05, 0.053, "shirt", A],
      [s * 0.207, 1.36, 0, 0.052, 0.056, "shirt", A], [s * 0.203, 1.41, 0, 0.046, 0.05, "shirt", A],
    ], L, ax, undefined, 0.028);
    loft(m, [
      [s * 0.22, 0.87, 0, 0.027, 0.03, sl, F, Hn, 0.5], [s * 0.22, 0.9, 0, 0.03, 0.033, sl, F],
      [s * 0.218, 1.0, 0, 0.037, 0.04, sl, F], [s * 0.216, 1.08, 0, 0.04, 0.042, sl, F, A, 0.12],
      [s * 0.215, 1.12, 0, 0.039, 0.041, sl, F, A, 0.5],
    ], L, ax);
    ball(m, s * 0.22, 0.812, 0.008, 0.02, 0.06, 0.04, 8, 5, flat("hand", Hn));
  }
  // legs and boots
  for (const s of [1, -1]) {
    const Th = s > 0 ? SB.thighL : SB.thighR, Sh = Th + 1, Ft = Th + 2, x = s * 0.095;
    loft(m, [
      [x, 0.5, 0, 0.056, 0.058, "pants", Th, Sh, 0.5], [x, 0.55, 0, 0.058, 0.061, "pants", Th, Sh, 0.12],
      [x, 0.7, 0, 0.072, 0.076, "pants", Th], [x * 1.04, 0.84, 0, 0.086, 0.09, "pants", Th],
      [x * 1.05, 0.91, 0, 0.085, 0.092, "pants", Th, H, 0.35],
    ], L, ax, undefined, 0.02);
    loft(m, [
      [x, 0.09, 0, 0.042, 0.046, "boots", Sh, Ft, 0.5], [x, 0.15, 0, 0.044, 0.047, "boots", Sh],
      [x, 0.27, -0.006, 0.05, 0.054, "boots", Sh], [x, 0.27, -0.006, 0.047, 0.051, "pants", Sh],
      [x, 0.38, -0.008, 0.052, 0.056, "pants", Sh], [x, 0.46, 0, 0.054, 0.057, "pants", Sh, Th, 0.12],
      [x, 0.5, 0, 0.056, 0.058, "pants", Sh, Th, 0.5],
    ], L, ax);
    loft(m, [[x, 0, 0.045, 0.047, 0.125, "boots", Ft], [x, 0.05, 0.045, 0.05, 0.128, "boots", Ft],
      [x, 0.1, 0.015, 0.044, 0.08, "boots", Ft]], 8, ax, 0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(m.p), 3));
  g.setAttribute("color", auxAttr(THREE, m, 0, 3));
  const si = new Uint16Array(m.n * 4), sw = new Float32Array(m.n * 4);
  for (let i = 0; i < m.n; i++) {
    const a = m.a[i];
    si[i * 4] = a[3]; si[i * 4 + 1] = a[4]; sw[i * 4] = 1 - a[5]; sw[i * 4 + 1] = a[5];
  }
  g.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4));
  g.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
  g.setIndex(m.idx);
  g.computeVertexNormals();
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 3);
  return g;
}

function buildBucketGeometry(THREE) {
  const m = mesher();
  const steel = [0.5, 0.53, 0.56], dark = [0.1, 0.07, 0.05];
  loft(m, [[0, -0.395, 0, 0.085, 0.085], [0, -0.385, 0, 0.09, 0.09], [0, -0.185, 0, 0.113, 0.113],
    [0, -0.175, 0, 0.12, 0.12]], 12, steel, 0);
  loft(m, [[0, -0.2, 0, 0.108, 0.108], [0, -0.195, 0, 0.11, 0.11]], 12, dark, undefined, 0);
  // bail handle: a thin half hoop
  const N = 10, base = m.n;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * PI, x = Math.cos(a) * 0.118, y = -0.175 + Math.sin(a) * 0.125;
    for (let k = 0; k < 3; k++) {
      const b = (k / 3) * TAU;
      m.p.push(x + Math.cos(a) * Math.cos(b) * 0.006, y + Math.sin(a) * Math.cos(b) * 0.006, Math.sin(b) * 0.006);
      m.a.push(steel); m.n++;
    }
  }
  for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) {
    const a = base + i * 3 + k, b = base + i * 3 + ((k + 1) % 3), c = a + 3, d = b + 3;
    m.idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(m.p), 3));
  g.setAttribute("color", auxAttr(THREE, m, 0, 3));
  g.setIndex(m.idx);
  g.computeVertexNormals();
  return g;
}

const LOOK_KEEPER = { cap: true, longSleeves: false, bucket: true,
  colors: { shirt: 0x2f8f4e, collar: 0x1f6a38, pants: 0x8a7a5c, belt: 0x3a2a1c, boots: 0x3b2b20, skin: 0xe2b08a,
    hand: 0xe2b08a, hair: 0x5a3a22, cap: 0x23703c, eye: 0x1a1410, lip: 0xb8705e } };
const LOOK_HANDLER = { cap: false, longSleeves: true, bucket: false,
  colors: { shirt: 0x23272f, collar: 0x15181d, pants: 0x4a4f58, belt: 0x23272f, boots: 0x16161a, skin: 0xd9ab8a,
    hand: 0x1b1d22, hair: 0x18141a, cap: 0x000000, eye: 0x120f0d, lip: 0x9c6455 } };

function createStaff(ctx, look, isKeeper) {
  const THREE = ctx.THREE;
  const group = new THREE.Group();
  group.name = isKeeper ? "keeper" : "handler";
  group.visible = false;
  const bones = [];
  for (let i = 0; i < S_BONES.length; i++) {
    const d = S_BONES[i], b = new THREE.Bone();
    if (d[0] < 0) b.position.set(d[1], d[2], d[3]);
    else { const p = S_BONES[d[0]]; b.position.set(d[1] - p[1], d[2] - p[2], d[3] - p[3]); bones[d[0]].add(b); }
    bones.push(b);
  }
  bones[0].updateMatrixWorld(true);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  const mesh = new THREE.SkinnedMesh(buildStaffGeometry(THREE, look), mat);
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones), new THREE.Matrix4());
  mesh.castShadow = true; mesh.frustumCulled = false;
  group.add(mesh);
  const B = {};
  for (const k in SB) B[k] = bones[SB[k]];

  let bucket = null;
  if (look.bucket) {
    bucket = new THREE.Mesh(buildBucketGeometry(THREE),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55 }));
    bucket.castShadow = true;
    bucket.position.set(0, -0.05, 0);
    B.handL.add(bucket);
  }
  const handAnchor = new THREE.Object3D();
  handAnchor.position.set(0.02, -0.075, 0.03);
  B.handR.add(handAnchor);
  const carryAnchor = new THREE.Object3D();
  carryAnchor.position.set(0, -0.05, 0.23);
  B.chest.add(carryAnchor);
  const qCarry = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, PI / 2, 0, "YXZ"));

  const S = { x: 0, y: 0, z: 0, yaw: 0, sp: 0, ph: 0, hasT: false, tx: 0, tz: 0, cb: null, run: false,
    kneelT: 0, kneelW: 0, kneelClock: 0, kneelCb: null, carry: false, carryW: 0, hold: false, holdW: 0,
    waveT: 0, waveW: 0, reach: false, reachW: 0, rx: 0, ry: 0, rz: 0, look: false, lx: 0, ly: 0, lz: 0,
    hYaw: 0, hPitch: 0, runW: 0, stepK: 0, snapY: true };
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), qReach = new THREE.Quaternion();

  function floorAt(x, z) {
    const w = ctx.world;
    const h = w && typeof w.heightAt === "function" ? w.heightAt(x, z) : 0;
    return Number.isFinite(h) ? h : 0;
  }
  function stopWalk() { S.hasT = false; S.cb = null; }

  function place(x, z, yaw) {
    S.x = x; S.z = z; if (typeof yaw === "number") S.yaw = yaw;
    stopWalk(); S.sp = 0; S.snapY = true; S.y = floorAt(x, z);
    S.hold = isKeeper && !S.carry;
    group.visible = true;
    group.position.set(S.x, S.y, S.z); group.rotation.y = S.yaw;
  }
  function walkTo(x, z, cb, run = false) {
    S.tx = x; S.tz = z; S.cb = typeof cb === "function" ? cb : null; S.run = !!run; S.hasT = true;
    S.kneelT = 0; S.kneelCb = null; S.reach = false;
  }
  function kneel(cb) {
    stopWalk(); S.kneelT = 1; S.kneelClock = 0; S.kneelCb = typeof cb === "function" ? cb : null; S.reach = false;
    return 0.85;
  }
  function stand() { S.kneelT = 0; S.kneelCb = null; S.reach = false; }
  function wave() { S.waveT = 2.0; return 2.0; }
  function carry(on) { S.carry = !!on; if (on) { S.hold = false; S.reach = false; } if (bucket) bucket.visible = !on; }
  function hold(on) { S.hold = !!on; }
  function lookAt(p) { if (p) { S.look = true; S.lx = p.x; S.ly = typeof p.y === "number" ? p.y : S.y + 0.3; S.lz = p.z; } else S.look = false; }
  function reach(p) {
    if (!p) { S.reach = false; return; }
    S.reach = true; S.rx = p.x; S.ry = typeof p.y === "number" ? p.y : S.y + 0.2; S.rz = p.z;
  }
  function reset() {
    stopWalk(); group.visible = false;
    S.sp = 0; S.kneelT = S.kneelW = 0; S.kneelCb = null; S.carry = false; S.carryW = 0; S.hold = false; S.holdW = 0;
    S.waveT = S.waveW = 0; S.reach = false; S.reachW = 0; S.look = false; S.hYaw = S.hPitch = 0; S.run = false; S.runW = 0;
    S.snapY = true;
    if (bucket) bucket.visible = true;
  }

  function update(dt, time) {
    if (!group.visible) return;
    // --- locomotion
    if (S.hasT && S.kneelW < 0.35) {
      const dx = S.tx - S.x, dz = S.tz - S.z, d = Math.hypot(dx, dz);
      const err = d > 0.03 ? wrapPi(Math.atan2(dx, dz) - S.yaw) : 0, tr = dt * (S.run ? 9 : 6);
      S.yaw += clamp(err, -tr, tr);
      const want = (S.run ? 3.4 : 1.35) * clamp(d / 0.5 + 0.25, 0, 1) * Math.max(0.15, Math.cos(err));
      S.sp = damp(S.sp, want, 7, dt);
      const stepLen = S.sp * dt;
      if (d <= Math.max(0.05, stepLen)) {
        S.x = S.tx; S.z = S.tz; S.hasT = false;
        const cb = S.cb; S.cb = null;
        if (cb) cb();
      } else { S.x += (dx / d) * stepLen; S.z += (dz / d) * stepLen; }
    } else S.sp = damp(S.sp, 0, 10, dt);
    const fy = floorAt(S.x, S.z);
    // a sudden rise of more than a tall step is a wall top (staff ignore walls): stay at the current level
    if (S.snapY) S.y = fy; else if (fy - S.y < 0.7) S.y = damp(S.y, fy, 12, dt);
    S.snapY = false;

    // --- weights
    S.kneelW = damp(S.kneelW, S.kneelT, 5, dt);
    if (S.kneelT > 0) {
      S.kneelClock += dt;
      if (S.kneelCb && S.kneelClock >= 0.85) { const cb = S.kneelCb; S.kneelCb = null; S.hold = false; cb(); }
    }
    S.carryW = damp(S.carryW, S.carry ? 1 : 0, 6, dt);
    const holding = !S.carry && ((S.hold && !(S.run && S.hasT)) || handAnchor.children.length > 0);
    S.holdW = damp(S.holdW, holding ? 1 : 0, 6, dt);
    if (S.waveT > 0) S.waveT -= dt;
    S.waveW = damp(S.waveW, S.waveT > 0 ? 1 : 0, 8, dt);
    S.reachW = damp(S.reachW, S.reach ? 1 : 0, 6, dt);
    S.runW = damp(S.runW, S.run && S.sp > 1.7 ? 1 : 0, 5, dt);
    const k = S.kneelW, c = S.carryW, h = S.holdW, wv = S.waveW, r = S.reachW, run = S.runW;
    const m = clamp(S.sp / 1.2, 0, 1);
    S.ph += dt * TAU * S.sp / lerp(1.5, 2.6, run);
    if (S.ph > TAU * 8) S.ph -= TAU * 8;
    const stepK = Math.floor((S.ph - PI / 2) / PI);
    if (stepK !== S.stepK) {
      S.stepK = stepK;
      const a = ctx.audio, pl = ctx.player;
      if (m > 0.3 && a && typeof a.step === "function" && pl) {
        const w = ctx.world, dist = Math.hypot(pl.x - S.x, pl.z - S.z);
        const surf = w && typeof w.surfaceAt === "function" ? w.surfaceAt(S.x, S.z) : "rock";
        if (dist < 14) a.step(surf === "water" ? "water" : surf || "rock", (0.22 + 0.2 * run) * (1 - dist / 14), 0);
      }
    }
    const ph = S.ph, sn = Math.sin(ph), cs = Math.cos(ph);
    const A = lerp(0.5, 0.85, run) * m, K = lerp(1.0, 1.7, run) * m;

    // reaching for something low bends the knees and the back
    let sq = 0;
    if (r > 0.01) sq = r * (1 - sstep(0.35, 0.95, S.ry - S.y));

    // --- legs (rotation about X: negative = forward)
    let thL = -A * sn - 0.04 * m, shL = K * Math.pow(Math.max(0, cs), 1.5) + 0.08 * m;
    let thR = A * sn - 0.04 * m, shR = K * Math.pow(Math.max(0, -cs), 1.5) + 0.08 * m;
    thL = lerp(thL, -1.55, k) - 1.1 * sq; shL = lerp(shL, 2.0, k) + 1.9 * sq;
    thR = lerp(thR, -0.35, k) - 1.1 * sq; shR = lerp(shR, 2.05, k) + 1.9 * sq;
    const extL = S_LEG * (Math.cos(thL) + Math.cos(thL + shL)), extR = S_LEG * (Math.cos(thR) + Math.cos(thR + shR));
    const hipY = S_ANKLE + Math.max(extL, extR) - 0.012 * m;
    B.hips.position.set(0, hipY, -0.1 * k - 0.06 * sq);
    B.hips.rotation.set(0, 0.07 * m * sn, 0.03 * m * cs);
    B.thighL.rotation.x = thL; B.shinL.rotation.x = shL; B.footL.rotation.x = -(thL + shL) * lerp(0.7, 1, Math.max(k, sq));
    B.thighR.rotation.x = thR; B.shinR.rotation.x = shR;
    B.footR.rotation.x = lerp(-(thR + shR) * lerp(0.7, 1, sq), 0.9, k);

    // --- torso
    const breathe = Math.sin(time * 1.7 + (isKeeper ? 0 : 2)) * 0.012;
    const lean = 0.03 + 0.05 * m + 0.14 * run * m + 0.9 * k + 0.8 * sq - 0.07 * c;
    B.spine.rotation.set(lean * 0.6 + breathe, -0.07 * m * sn, 0);
    B.chest.rotation.set(lean * 0.4 + 0.2 * k, -0.06 * m * sn, 0);

    // --- head
    let hy = 0, hp = -lean * 0.55 - 0.1 * k;
    if (S.look) {
      const dx = S.lx - S.x, dz = S.lz - S.z;
      hy = clamp(wrapPi(Math.atan2(dx, dz) - S.yaw), -1.15, 1.15);
      hp += clamp(Math.atan2(S.y + 1.62 - S.ly, Math.hypot(dx, dz)), -0.5, 0.75);
    } else if (c > 0.5) hp += 0.25; else if (k > 0.5) hp += 0.35;
    S.hYaw = damp(S.hYaw, hy, 6, dt); S.hPitch = damp(S.hPitch, hp, 6, dt);
    B.neck.rotation.set(S.hPitch * 0.4, S.hYaw * 0.35, 0);
    B.head.rotation.set(S.hPitch * 0.6, S.hYaw * 0.65, 0);

    // --- arms. Euler XYZ: Y (twist about the limb) is applied before X (flex)
    const A2 = lerp(0.35, 0.7, run) * m, eb = -(0.16 + lerp(0.12, 1.25, run) * m);
    let lx = A2 * sn, ly = 0, lz = bucket && bucket.visible ? 0.22 : 0.05, le = eb;
    let rx = -A2 * sn, ry = 0, rz = -0.05, re = eb, rfz = 0;
    if (bucket && bucket.visible) { lx *= 0.45; le = -0.12; }
    // right hand holding the bowl
    rx = lerp(rx, -0.15, h); re = lerp(re, -1.35, h); ry = lerp(ry, 0.25, h);
    // kneeling: the right hand goes down to the ground in front
    rx = lerp(rx, -1.3, k); re = lerp(re, -0.1, k); ry = lerp(ry, 0, k);
    lx = lerp(lx, -0.5, k * 0.6); le = lerp(le, -0.9, k * 0.6);
    // cradle
    lx = lerp(lx, -0.35, c); le = lerp(le, -1.4, c); ly = lerp(ly, -0.95, c); lz = lerp(lz, 0.05, c);
    rx = lerp(rx, -0.4, c); re = lerp(re, -1.6, c); ry = lerp(ry, 0.9, c);
    // wave
    if (wv > 0.01) {
      rx = lerp(rx, -2.55, wv); rz = lerp(rz, -0.32, wv); ry = lerp(ry, 0, wv); re = lerp(re, -0.5, wv);
      rfz = wv * 0.5 * Math.sin(time * 9.5);
    }
    B.armL.rotation.set(lx, ly, lz); B.foreL.rotation.set(le, 0, 0);
    B.armR.rotation.set(rx, ry, rz); B.foreR.rotation.set(lerp(re, -0.1, r), 0, rfz);
    if (r > 0.01) {
      B.armR.getWorldPosition(v1);
      v2.set(S.rx - v1.x, S.ry - v1.y, S.rz - v1.z);
      if (v2.lengthSq() > 1e-6) {
        v2.normalize();
        B.chest.getWorldQuaternion(q1).invert();
        v2.applyQuaternion(q1);
        qReach.setFromUnitVectors(DOWN, v2);
        B.armR.quaternion.slerp(qReach, r);
      }
    }
    B.handL.rotation.set(0, 0, 0); B.handR.rotation.set(-0.2 * h, 0, 0);
    if (bucket) bucket.rotation.set(-(lx + le) * 0.85, 0, -lz);

    // --- root + anchors (kept level so a bowl or a platypus does not tip with the limb)
    group.position.set(S.x, S.y, S.z);
    group.rotation.y = S.yaw;
    group.updateMatrixWorld(true);
    group.getWorldQuaternion(q2);
    B.handR.getWorldQuaternion(q1).invert();
    handAnchor.quaternion.copy(q1).multiply(q2);
    B.chest.getWorldQuaternion(q1).invert();
    carryAnchor.quaternion.copy(q1).multiply(q2).multiply(qCarry);
  }

  const api = { group, place, walkTo, kneel, stand, wave, carry, hold, lookAt, reach, reset, update,
    carryAnchor, handAnchor, bones: B, height: 1.78, radius: 0.3,
    stop() { stopWalk(); } };
  Object.defineProperties(api, {
    visible: { get() { return group.visible; }, set(v) { group.visible = !!v; if (v) S.snapY = true; }, enumerable: true },
    x: { get() { return S.x; }, set(v) { S.x = v; }, enumerable: true },
    y: { get() { return S.y; }, enumerable: true },
    z: { get() { return S.z; }, set(v) { S.z = v; }, enumerable: true },
    yaw: { get() { return S.yaw; }, set(v) { S.yaw = v; }, enumerable: true },
    walking: { get() { return S.hasT; }, enumerable: true },
    kneeling: { get() { return S.kneelT > 0; }, enumerable: true },
    carrying: { get() { return S.carry; }, enumerable: true },
  });
  return api;
}

// ==========================================================================================
// ARENA AUDIENCE (level 4) — one instanced 40-triangle seated figure + camera flashes
// ==========================================================================================

const AUD_TRIS = 40, AUD_MAX_TRIS = 28000, FLASH_N = 110;

function buildAudienceGeometry(THREE) {
  // origin = the seat surface under the sitter, facing +Z
  // parts: 0 torso 1 head 2 armL 3 armR 4 legs; slots: 0 shirt 1 skin 2 hair 3 trousers
  const m = mesher();
  loftRot = PI / 4;
  loft(m, [[0, 0, 0, 0.27, 0.17], [0, 0.52, 0, 0.32, 0.17]], 4, (r, ri) => [0, 0, ri === 0 ? 0.75 : 1], undefined, 0.03);
  let n = 0;
  loft(m, [[0, 0.71, 0.01, 0.125, 0.13]], 4, () => (++n === 6 ? [1, 2, 1] : [1, 1, 1]), -0.12, 0.13);
  loftRot = 0;
  for (const s of [1, -1]) {
    loft(m, [[s * 0.28, 0.12, 0.03, 0.045, 0.05], [s * 0.27, 0.5, 0.01, 0.06, 0.065]], 3,
      (r, ri) => [s > 0 ? 2 : 3, ri === 0 ? 1 : 0, 1]);
  }
  // lap: top, front and the two sides of a box (thighs forward)
  const b = m.n, X = 0.19, Y0 = -0.02, Y1 = 0.13, Z0 = 0.04, Z1 = 0.46;
  m.p.push(-X, Y1, Z0, X, Y1, Z0, X, Y1, Z1, -X, Y1, Z1, -X, Y0, Z1, X, Y0, Z1, -X, Y0, Z0, X, Y0, Z0);
  for (let i = 0; i < 8; i++) { m.a.push([4, 3, i < 4 ? 1 : 0.7]); m.n++; }
  m.idx.push(b, b + 3, b + 2, b, b + 2, b + 1, b + 3, b + 4, b + 5, b + 3, b + 5, b + 2,
    b, b + 6, b + 4, b, b + 4, b + 3, b + 1, b + 2, b + 5, b + 1, b + 5, b + 7);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(m.p), 3));
  g.setAttribute("aPart", auxAttr(THREE, m, 0, 3));
  g.setIndex(m.idx);
  g.computeVertexNormals();
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);
  return g;
}

function makeAudienceMaterial(THREE, U) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uAuTime = U.time; sh.uniforms.uAuExcite = U.excite; sh.uniforms.uAuWaveX = U.waveX; sh.uniforms.uAuGlow = U.glow;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>
attribute vec3 aPart;
attribute vec4 aInst;
uniform float uAuTime;
uniform float uAuExcite;
uniform float uAuWaveX;
varying vec3 vCwCol;
${GLSL_UNPACK}`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
vec3 cwP = position; vec3 cwN = objectNormal;
{
  float part = aPart.x, seed = aInst.w, e = uAuExcite, t = uAuTime;
  float h1 = fract(seed * 7.31), h2 = fract(seed * 13.7);
  float wv = (instanceMatrix[3].x - uAuWaveX) / 2.6;
  float wave = exp(-wv * wv);
  float standW = clamp(smoothstep(0.62, 0.95, e + (h1 - 0.5) * 0.3) + wave, 0.0, 1.0);
  float clapW = smoothstep(0.2, 0.5, e + (h2 - 0.5) * 0.3) * (1.0 - standW);
  float bob = 0.045 * smoothstep(0.12, 0.6, e) * abs(sin(t * (5.5 + h1 * 1.5) + seed * 40.0));
  float hop = standW * (0.03 + 0.09 * e) * abs(sin(t * 6.5 + seed * 31.0));
  float rise = 0.4 * standW;
  if (part > 3.5) {
    cwRotX(cwP, cwN, vec3(0.0, 0.06, 0.06), standW * 1.5708);
    cwP.y += rise + hop * step(0.2, cwP.y);
  } else {
    if (part > 1.5) {
      float sd = part < 2.5 ? 1.0 : -1.0;
      float handW = clamp(1.0 - (cwP.y - 0.12) / 0.38, 0.0, 1.0);
      float raise = standW * (0.84 + 0.1 * sin(t * 7.0 + seed * 50.0)) + clapW * 0.3;
      vec3 shp = vec3(sd * 0.27, 0.5, 0.01);
      cwP.x -= sd * clapW * handW * (0.1 + 0.1 * sin(t * (11.0 + h1 * 4.0) + seed * 60.0));
      cwRotX(cwP, cwN, shp, -raise * 3.14159265);
      cwRotZ(cwP, cwN, shp, sd * standW * (0.12 + 0.3 * sin(t * (4.0 + h2 * 2.0) + seed * 9.0)));
    }
    float sway = (0.015 + 0.05 * e) * sin(t * (1.1 + h2) + seed * 20.0);
    cwP.x += sway * cwP.y;
    cwP.y += rise + bob + hop;
  }
  float slot = aPart.y;
  vec3 c = slot < 0.5 ? cwUnpack(aInst.x) : slot < 1.5 ? cwUnpack(aInst.y) : slot < 2.5 ? cwUnpack(aInst.z) : vec3(0.03, 0.035, 0.05);
  vCwCol = c * aPart.z;
  objectNormal = cwN;
}`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = cwP;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCwCol;\nuniform float uAuGlow;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vCwCol;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vCwCol * uAuGlow;");
  };
  mat.customProgramCacheKey = () => "platy-audience";
  return mat;
}

function createAudience(ctx) {
  const THREE = ctx.THREE;
  const group = new THREE.Group();
  group.name = "audience";
  const U = { time: { value: 0 }, excite: { value: 0 }, waveX: { value: 1e4 }, glow: { value: 0.05 },
    rate: { value: 0 }, scale: { value: 260 } };
  const geo = buildAudienceGeometry(THREE);
  const mat = makeAudienceMaterial(THREE, U);
  const flashMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uRate: U.rate, uScale: U.scale },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
attribute float aSeed;
uniform float uTime; uniform float uRate; uniform float uScale;
varying float vA;
void main(){
  float per = 1.7 + fract(aSeed * 17.3) * 3.2;
  float tt = fract(uTime / per + aSeed) * per;
  float on = step(fract(aSeed * 5.77) + 0.001, uRate);
  vA = on * smoothstep(0.0, 0.03, tt) * (1.0 - smoothstep(0.05, 0.2, tt));
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = vA > 0.002 ? uScale * (0.7 + fract(aSeed * 3.1) * 0.7) / max(0.5, -mv.z) : 0.0;
}`,
    fragmentShader: `
varying float vA;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float g = smoothstep(0.5, 0.0, length(d));
  float star = max(0.0, 1.0 - abs(d.x) * 16.0) * max(0.0, 1.0 - abs(d.y) * 2.4)
             + max(0.0, 1.0 - abs(d.y) * 16.0) * max(0.0, 1.0 - abs(d.x) * 2.4);
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * (g * g * 1.3 + star * 0.7) * vA, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  let mesh = null, points = null, builtN = -1, waveR = 20;
  let target = 0, waveT = -1, rate = 0, rateHold = 0, lastNow = -1;
  const WAVE_DUR = 2.8;

  function build(seats) {
    const total = seats ? Math.floor(seats.length / 4) : 0;
    const n = Math.min(total, Math.floor(AUD_MAX_TRIS / AUD_TRIS));
    if (mesh && n === builtN) { reset(); return; }
    if (mesh) { group.remove(mesh); mesh.dispose(); mesh.geometry.dispose(); mesh = null; }
    if (points) { group.remove(points); points.geometry.dispose(); points = null; }
    builtN = n;
    if (n <= 0) return;
    const rnd = rng32(4242);
    const g = geo.clone();
    mesh = new THREE.InstancedMesh(g, mat, n);
    mesh.frustumCulled = false;
    const inst = new Float32Array(n * 4);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const fp = new Float32Array(FLASH_N * 3), fs = new Float32Array(FLASH_N);
    waveR = 6;
    for (let i = 0; i < n; i++) {
      const k = Math.min(total - 1, Math.floor((i * total) / n)) * 4;
      const kid = rnd() < 0.12, sc = kid ? 0.72 + rnd() * 0.1 : 0.93 + rnd() * 0.15;
      p.set(seats[k], seats[k + 1], seats[k + 2]);
      q.setFromAxisAngle(up, seats[k + 3] + (rnd() - 0.5) * 0.24);
      s.set(sc * (0.92 + rnd() * 0.16), sc, sc);
      M.compose(p, q, s);
      mesh.setMatrixAt(i, M);
      inst[i * 4] = SHIRT[Math.floor(rnd() * SHIRT.length)];
      inst[i * 4 + 1] = SKIN[Math.floor(rnd() * SKIN.length)];
      inst[i * 4 + 2] = HAIR[Math.floor(rnd() * HAIR.length)];
      inst[i * 4 + 3] = rnd();
      waveR = Math.max(waveR, Math.abs(seats[k]) + 5);
    }
    for (let f = 0; f < FLASH_N; f++) {
      const k = Math.floor(rnd() * total) * 4, yaw = seats[k + 3];
      fp[f * 3] = seats[k] + Math.sin(yaw) * 0.3;
      fp[f * 3 + 1] = seats[k + 1] + 0.72 + rnd() * 0.3;
      fp[f * 3 + 2] = seats[k + 2] + Math.cos(yaw) * 0.3;
      fs[f] = rnd();
    }
    g.setAttribute("aInst", new THREE.InstancedBufferAttribute(inst, 4));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.onBeforeRender = tick;
    group.add(mesh);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(fp, 3));
    pg.setAttribute("aSeed", new THREE.BufferAttribute(fs, 1));
    pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 80);
    points = new THREE.Points(pg, flashMat);
    points.frustumCulled = false;
    points.renderOrder = 5;
    group.add(points);
    reset();
  }

  function step(dt, now) {
    U.time.value = now;
    U.excite.value = damp(U.excite.value, target, 2.5, dt);
    const e = U.excite.value;
    U.glow.value = 0.05 + 0.2 * e;
    if (waveT >= 0) {
      waveT += dt;
      if (waveT > WAVE_DUR) { waveT = -1; U.waveX.value = 1e4; }
      else U.waveX.value = lerp(-waveR, waveR, waveT / WAVE_DUR);
    }
    if (rateHold > 0) rateHold -= dt; else rate = damp(rate, 0, 1.6, dt);
    U.rate.value = Math.max(rate, 0.22 * sstep(0.55, 1, e));
    U.scale.value = 0.36 * ctx.renderer.domElement.height;
  }
  // self-driven from the render loop, so it animates whether or not anybody calls update()
  function tick() {
    const tm = ctx.time, now = tm ? tm.now : 0;
    if (now === lastNow) return;
    const dt = lastNow < 0 ? 0 : clamp(now - lastNow, 0, 0.1);
    lastNow = now;
    step(dt, now);
  }

  function setExcitement(v) { target = clamp(+v || 0, 0, 1); }
  function wave() { if (waveT < 0) waveT = 0; }
  function flashes(r = 1) { rate = clamp(+r || 0, 0, 1); rateHold = rate > 0 ? 2.2 : 0; }
  function reset() {
    target = 0; U.excite.value = 0; waveT = -1; U.waveX.value = 1e4; rate = 0; rateHold = 0; U.rate.value = 0;
    U.glow.value = 0.05; lastNow = -1;
  }

  return { group, build, setExcitement, wave, flashes, reset, update() { tick(); },
    get excitement() { return U.excite.value; }, get count() { return Math.max(0, builtN); } };
}

// ==========================================================================================

export function createCrowd(ctx) {
  const THREE = ctx.THREE;
  const group = new THREE.Group();
  group.name = "crowd";
  const staff = [createStaff(ctx, LOOK_KEEPER, true), createStaff(ctx, LOOK_HANDLER, false)];
  const visitors = createVisitors(ctx, staff);
  const audience = createAudience(ctx);
  group.add(visitors.group, staff[0].group, staff[1].group);

  function update(dt, time) {
    visitors.update(dt, time);
    staff[0].update(dt, time);
    staff[1].update(dt, time);
    audience.update();
  }
  function reset() {
    visitors.reset();
    staff[0].reset();
    staff[1].reset();
    audience.reset();
  }

  return {
    group, update, reset,
    setLane: visitors.setLane, stroll: visitors.stroll, gather: visitors.gather, disperse: visitors.disperse,
    watchers: visitors.watchers, react: visitors.react, tossCoin: visitors.tossCoin, panic: visitors.panic,
    setFocus: visitors.setFocus,
    staff, keeper: staff[0], handler: staff[1], audience, visitors,
  };
}
