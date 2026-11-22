// tribe.js - the hidden platypus tribe (LEVELS2.md B8).
//   members   five NAMED characters on the full platypus model (Moss, Old Burra, Tika, Rok, Nib). Each runs the
//             same three layers as Pip (friend.js): a behaviour that says where it would like to be, an aliveness
//             layer (glances, hesitations, nods) and locomotion over the world's ground and water. At most FOUR
//             full models are drawn; a fifth wanted member is shown as a stand-in in the instanced crowd.
//   village   the many: up to 36 instanced platypuses with homes, moods, strolls, gatherings and cheers.
//   food, materials, bench   the things of level 9: eight food items, twelve pickups, the crafting frame.
// Nothing allocates in update().
import * as PLATY from "./platypus.js";

export const TRIBE_LOOKS = {
  home: { furs: [0x4a3424, 0x5a3f2a, 0x6b4a30, 0x7a5a3c, 0x8a6a48, 0x5e4630, 0x3f2c1e, 0x9a7a52], paint: null },
  rival: { furs: [0x6e6e72, 0x5a5b60, 0x82838a, 0x4a4b50, 0x76777c], paint: 0xb3261e },
  war: { paint: 0xf2efe6 },
};

const WALK = 1.6, RUN = 3.4, SWIM = 3.4, GRAV = 17, TURN = 7, RADIUS = 0.32;
const MAX_STEP = 0.45, MAX_HOP = 0.95;
const TAU = Math.PI * 2;
const EMPTY = Object.freeze({});
const VILLAGE_MAX = 36, STAND_INS = 5, CROWD_MAX = VILLAGE_MAX + STAND_INS;
const FOOD_N = 8, MAT_N = 12;
const FOOD_KINDS = ["berries", "grub", "crayfish", "egg"];
const MAT_KINDS = ["leaf", "vine", "bone"];
const MOODS = ["calm", "curious", "cheer", "feast", "sleep", "alarm", "war", "mourn"];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
function wrap(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
function hash(i, k) {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const MEMBER_DEFS = {
  moss: { name: "Moss", pitch: 1.12, pace: 1.08, fur: 0x5b5136, opts: { variant: "tribe", seed: 7, fur: 0x5b5136, scale: 0.92, collar: 0x4f8a3a }, standScale: 0.92 },
  burra: { name: "Old Burra", pitch: 0.7, pace: 0.62, fur: 0x6b5a4c, opts: { variant: "tribe", seed: 3, fur: 0x6b5a4c, elder: true }, standScale: 0.98, extra: "beads" },
  tika: { name: "Tika", pitch: 1.0, pace: 1.0, fur: 0xb08d5e, opts: { variant: "tribe", seed: 11, fur: 0xb08d5e, scale: 0.9 }, standScale: 0.9, extra: "sash" },
  rok: { name: "Rok", pitch: 0.8, pace: 1.0, fur: 0x3d2b1f, opts: { variant: "tribe", seed: 5, fur: 0x3d2b1f, scale: 1.05, paint: 0xf2efe6 }, standScale: 1.05, paint: 0xf2efe6 },
  nib: { name: "Nib", pitch: 1.45, pace: 0.95, fur: 0x8a6a48, opts: { variant: "tribe", seed: 9, fur: 0x8a6a48, young: true }, standScale: 0.55, extra: "hat" },
};
const MEMBER_KEYS = ["moss", "burra", "tika", "rok", "nib"];

// ------------------------------------------------------------------------------------------------ geometry helpers
function makeBuilder(THREE) {
  const pos = [], nor = [], col = [], idx = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color(), c2 = new THREE.Color(), nm = new THREE.Matrix3();
  return {
    // geo: any BufferGeometry; m: Matrix4 | null; hex: colour; hex2: optional second colour blended along the geometry's own Y
    add(geo, m, hex, hex2) {
      const p = geo.attributes.position, nn = geo.attributes.normal, gc = geo.attributes.color;
      const base = pos.length / 3;
      if (m) nm.getNormalMatrix(m);
      let y0 = Infinity, y1 = -Infinity;
      if (hex2 !== undefined) for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        c.setHex(hex);
        if (hex2 !== undefined) c.lerp(c2.setHex(hex2), (v.y - y0) / (y1 - y0 || 1));
        if (gc) { c.r *= gc.getX(i); c.g *= gc.getY(i); c.b *= gc.getZ(i); }
        if (m) v.applyMatrix4(m);
        pos.push(v.x, v.y, v.z);
        if (nn) { n.fromBufferAttribute(nn, i); if (m) n.applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z); } else nor.push(0, 1, 0);
        col.push(c.r, c.g, c.b);
      }
      if (geo.index) for (let i = 0; i < geo.index.count; i++) idx.push(base + geo.index.getX(i));
      else for (let i = 0; i < p.count; i++) idx.push(base + i);
      geo.dispose();
      return this;
    },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      return g;
    },
  };
}

// a big glossy leaf lying along +Z: pointed tip, folded along the midrib, pale veins
function leafGeometry(THREE, len, halfW) {
  const NU = 12, NV = 6;
  const pos = [], col = [], idx = [];
  for (let iu = 0; iu <= NU; iu++) {
    const u = iu / NU;
    const w = halfW * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.85) * (1 - 0.18 * u) + 0.004;
    for (let iv = 0; iv <= NV; iv++) {
      const s = (iv / NV) * 2 - 1;
      const x = s * w;
      const y = 0.07 * len * Math.sin(Math.PI * u) + Math.abs(s) * w * 0.34 - 0.1 * len * u * u + Math.sin(u * 9 + s * 2) * 0.006 * Math.abs(s);
      pos.push(x, y, (u - 0.5) * len);
      const vein = Math.max(Math.exp(-s * s * 60), 0.55 * Math.exp(-Math.pow(Math.sin((u * 7 + Math.abs(s) * 1.6) * Math.PI), 2) * 14) * Math.abs(s));
      const k = 0.78 + 0.22 * (1 - Math.abs(s)) + vein * 0.5;
      col.push(k * (0.9 + vein * 0.5), k, k * (0.8 + vein * 0.3));
    }
  }
  for (let iu = 0; iu < NU; iu++) for (let iv = 0; iv < NV; iv++) {
    const a = iu * (NV + 1) + iv, b = a + 1, c = a + NV + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildPropGeometries(THREE) {
  const M = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(sx === undefined ? 1 : sx, sy === undefined ? (sx === undefined ? 1 : sx) : sy, sz === undefined ? (sx === undefined ? 1 : sx) : sz));
  const G = {};
  // ---- materials
  G.leaf = makeBuilder(THREE)
    .add(leafGeometry(THREE, 0.66, 0.2), M(0, 0.02, 0), 0x2f8f3c)
    .add(new THREE.CylinderGeometry(0.008, 0.012, 0.16, 5), M(0, 0.02, -0.4, Math.PI / 2 - 0.2, 0, 0), 0x5a7a2c)
    .build();
  {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * TAU * 3.1; const r = 0.15 + 0.02 * Math.sin(t * 17); pts.push(new THREE.Vector3(Math.cos(a) * r, 0.03 + t * 0.1 + Math.sin(a * 2) * 0.008, Math.sin(a) * r)); }
    pts.push(new THREE.Vector3(0.24, 0.04, 0.1));
    const b = makeBuilder(THREE).add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 84, 0.017, 5, false), null, 0x6b7a34, 0x4d6a26);
    for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.4; b.add(leafGeometry(THREE, 0.11, 0.035), M(Math.cos(a) * 0.17, 0.07 + i * 0.022, Math.sin(a) * 0.17, 0.3, -a, 0.4), 0x4f9a3a); }
    G.vine = b.build();
  }
  {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3((t - 0.5) * 0.5, 0.035 + 0.11 * Math.sin(Math.PI * t), 0.05 * Math.sin(Math.PI * t * 0.8))); }
    G.bone = makeBuilder(THREE)
      .add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.02, 6, false), null, 0xe9e1c9)
      .add(new THREE.IcosahedronGeometry(0.034, 1), M(-0.25, 0.035, 0, 0, 0, 0, 1, 0.8, 1), 0xddd3b6)
      .add(new THREE.IcosahedronGeometry(0.026, 1), M(0.25, 0.035, 0.03), 0xddd3b6)
      .build();
  }
  // ---- food
  {
    const b = makeBuilder(THREE);
    const at = [[0, 0.04, 0], [0.05, 0.035, 0.02], [-0.045, 0.035, 0.03], [0.01, 0.035, -0.05], [0.02, 0.085, 0.01], [-0.03, 0.08, -0.02], [0.055, 0.04, -0.04], [-0.02, 0.04, 0.07]];
    for (let i = 0; i < at.length; i++) b.add(new THREE.IcosahedronGeometry(0.034 + (i % 3) * 0.004, 1), M(at[i][0], at[i][1], at[i][2]), i % 3 === 0 ? 0x5a2a86 : i % 3 === 1 ? 0x8a1f52 : 0x6a2470);
    b.add(leafGeometry(THREE, 0.16, 0.05), M(-0.02, 0.1, 0.02, 0.2, 0.8, 0), 0x3c9a40);
    G.berries = b.build();
  }
  {
    const b = makeBuilder(THREE);
    for (let i = 0; i < 6; i++) { const t = i / 5; b.add(new THREE.SphereGeometry(0.03, 8, 6), M((t - 0.5) * 0.16, 0.03 + Math.sin(t * Math.PI) * 0.012, Math.sin(t * 5) * 0.012, 0, 0, 0, 0.72 + 0.2 * Math.sin(t * Math.PI), 1 - 0.25 * Math.abs(t - 0.5), 1), i === 5 ? 0xa9742f : 0xefe4b8); }
    G.grub = b.build();
  }
  {
    const b = makeBuilder(THREE);
    const red = 0xc8502a, dark = 0x8f3118;
    for (let i = 0; i < 6; i++) { const t = i / 5; b.add(new THREE.SphereGeometry(0.03, 8, 6), M(0, 0.032 - t * 0.008, 0.07 - t * 0.19, 0, 0, 0, 1.15 - 0.6 * t, 0.8 - 0.25 * t, 1.25), i % 2 ? dark : red); }
    b.add(new THREE.SphereGeometry(0.03, 8, 6), M(0, 0.02, -0.16, 0, 0, 0, 1.5, 0.22, 1.1), red); // tail fan
    b.add(new THREE.SphereGeometry(0.034, 8, 6), M(0, 0.034, 0.1, 0, 0, 0, 0.95, 0.8, 1.2), red); // head
    for (const s of [-1, 1]) {
      b.add(new THREE.CylinderGeometry(0.007, 0.009, 0.09, 5), M(s * 0.045, 0.03, 0.14, Math.PI / 2, 0, s * -0.5), dark);
      b.add(new THREE.SphereGeometry(0.022, 8, 6), M(s * 0.07, 0.03, 0.2, 0, s * 0.3, 0, 0.75, 0.55, 1.7), red); // claw
      b.add(new THREE.CylinderGeometry(0.002, 0.003, 0.16, 4), M(s * 0.02, 0.05, 0.2, Math.PI / 2 - 0.35, 0, s * -0.25), dark); // antenna
      for (let k = 0; k < 3; k++) b.add(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 4), M(s * 0.045, 0.014, 0.05 - k * 0.04, 0, 0, s * 1.05), dark); // legs
    }
    G.crayfish = b.build();
  }
  G.egg = makeBuilder(THREE)
    .add(new THREE.SphereGeometry(0.05, 12, 9), M(0, 0.055, 0, 0.25, 0, 0.2, 1, 1.28, 1), 0xd9e4d2, 0xf3f1e4)
    .add(leafGeometry(THREE, 0.2, 0.07), M(0, 0.004, 0, 0, 0.6, 0), 0x6d7f3a)
    .build();
  // ---- the crafting frame (origin on the ground, the ridge pole along X, the worker sits on the -Z side)
  {
    const b = makeBuilder(THREE);
    const wood = 0x6b4a2e, wood2 = 0x8a6440;
    for (const s of [-1, 1]) {
      b.add(new THREE.CylinderGeometry(0.02, 0.03, 0.62, 6), M(s * 0.5, 0.29, 0.11, -0.36, 0, 0), wood, wood2);
      b.add(new THREE.CylinderGeometry(0.02, 0.03, 0.62, 6), M(s * 0.5, 0.29, -0.11, 0.36, 0, 0), wood, wood2);
      b.add(new THREE.TorusGeometry(0.034, 0.01, 5, 10), M(s * 0.5, 0.5, 0, 0, Math.PI / 2, 0), 0x7c8a3c);
      b.add(new THREE.IcosahedronGeometry(0.07, 1), M(s * 0.56, 0.02, 0.24, 0, s, 0, 1.2, 0.6, 1), 0x8f8a80);
      b.add(new THREE.IcosahedronGeometry(0.06, 1), M(s * 0.44, 0.02, -0.25, 0, s * 2, 0, 1.1, 0.55, 1), 0x7d786f);
    }
    b.add(new THREE.CylinderGeometry(0.02, 0.024, 1.18, 6), M(0, 0.52, 0, 0, 0, Math.PI / 2), wood2, wood);
    b.add(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 5), M(0, 0.2, 0.19, 0, 0, Math.PI / 2), wood);
    G.frame = b.build();
  }
  // ---- what the named ones wear
  {
    const b = makeBuilder(THREE);
    b.add(new THREE.TorusGeometry(1, 0.045, 4, 22), M(0, 0, 0, 0, 0, 0, 0.088, 0.072, 0.088), 0x5a4630);
    for (let i = 0; i < 11; i++) {
      const a = Math.PI + ((i - 5) / 5) * 1.25; // across the chest
      b.add(new THREE.IcosahedronGeometry(i === 5 ? 0.02 : 0.013, 1), M(Math.sin(a) * 0.088, Math.cos(a) * 0.072, 0, 0, 0, 0, 1, i === 5 ? 1.5 : 1, 1), i === 5 ? 0xd9a441 : i % 2 ? 0xf0e8d2 : 0xc9bfa2);
    }
    G.beads = b.build();
  }
  {
    const b = makeBuilder(THREE);
    b.add(new THREE.TorusGeometry(1, 0.085, 5, 26), M(0, 0, 0, 0, 0, 0, 0.112, 0.094, 0.112), 0x55782f, 0x7a9440);
    for (let i = 0; i < 3; i++) b.add(new THREE.ConeGeometry(0.006, 0.085, 5), M(0.07 + i * 0.016, 0.075 - i * 0.012, 0.012, 0, 0, -0.5 - i * 0.12), 0xf2ead4);
    b.add(leafGeometry(THREE, 0.09, 0.03), M(-0.085, 0.06, 0, 0.2, 0, 0.9), 0x4f9a3a);
    G.sash = b.build();
  }
  {
    // an oversized leaf worn as a hat: a floppy cone with a wavy brim and the stalk as its point
    const prof = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2(0.004 + 0.118 * Math.pow(t, 0.8), 0.075 * (1 - Math.pow(t, 1.5)) - 0.012 * t * t)); }
    const cone = new THREE.LatheGeometry(prof, 14);
    const p = cone.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z); p.setY(i, p.getY(i) + Math.sin(Math.atan2(z, x) * 3) * 0.014 * (r / 0.12) * (r / 0.12)); }
    cone.computeVertexNormals();
    G.hat = makeBuilder(THREE)
      .add(cone, null, 0x3f8a36, 0x5fae45)
      .add(new THREE.CylinderGeometry(0.004, 0.007, 0.05, 5), M(0.006, 0.095, 0, 0, 0, -0.35), 0x6b7a34)
      .build();
  }
  return G;
}

// when platypus.js has no crowd yet: everything still runs, nothing is drawn
function makeNullCrowd(THREE, max) {
  const noop = () => {};
  return { group: new THREE.Group(), max, set: noop, anim: noop, paint: noop, hide: noop, fade: noop, update: noop, commit: noop };
}

// ------------------------------------------------------------------------------------------------ factory
export function createTribe(ctx) {
  const THREE = ctx.THREE;
  const P = ctx.player;
  const group = new THREE.Group();
  group.name = "tribe";
  let world = null;
  let clock = 0;

  const sfx = (name, a, b, c, d) => { const au = ctx.audio, f = au && au[name]; if (typeof f === "function") return f.call(au, a, b, c, d); return undefined; };
  const vfx = (name, a, b, c, d, e) => { const o = ctx.fx, f = o && o[name]; if (typeof f === "function") return f.call(o, a, b, c, d, e); return undefined; };
  const heightAt = (x, z) => (world ? world.heightAt(x, z) : 0);
  const waterAt = (x, z) => (world && world.waterAt ? world.waterAt(x, z) : -Infinity);
  function floorAt(x, z) {
    const h = heightAt(x, z), w = waterAt(x, z) - 0.1;
    return w > h ? w : h;
  }
  let earPan = 0, earVol = 1;
  function ears(x, y, z) {
    const cam = ctx.camera;
    if (!cam || !cam.matrixWorld) { earPan = 0; earVol = 1; return; }
    const e = cam.matrixWorld.elements;
    const dx = x - e[12], dy = y - e[13], dz = z - e[14];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    earPan = clamp(((dx * e[0] + dz * e[2]) / (d + 0.6)) * 0.85, -1, 1);
    earVol = clamp(1.2 - d / 16, 0.12, 1);
  }
  function tribeChirp(mood, vol, pitch) {
    const au = ctx.audio;
    if (!au) return;
    if (typeof au.tribeChirp === "function") au.tribeChirp(mood, vol * earVol, earPan, pitch);
    else if (typeof au.friendChirp === "function") au.friendChirp(mood === "greet" || mood === "cheer" ? "happy" : mood === "war" ? "call" : mood === "mourn" ? "sad" : mood, vol * earVol, earPan);
  }
  const beatNow = () => { const mu = ctx.music; return mu && mu.bpm > 0 && typeof mu.beat === "function" ? mu.beat() : (clock * 96) / 60; };

  // ---------------------------------------------------------------- shared props
  const GEO = buildPropGeometries(THREE);
  const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  function makeInst(geo, n, name) {
    const im = new THREE.InstancedMesh(geo, propMat, n);
    im.name = name;
    im.frustumCulled = false;
    im.castShadow = false;
    im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) im.setMatrixAt(i, ZERO);
    im.visible = false;
    group.add(im);
    return im;
  }
  function writeInst(im, i, x, y, z, yaw, pitch, roll, sc) {
    if (!(sc > 0)) { im.setMatrixAt(i, ZERO); im.instanceMatrix.needsUpdate = true; return; }
    _e.set(pitch, yaw, roll, "YXZ");
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sc, sc, sc));
    im.setMatrixAt(i, _m);
    im.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- the crowd (village + member stand-ins)
  let crowd = null;
  function getCrowd() {
    if (!crowd) {
      crowd = typeof PLATY.createPlatypusCrowd === "function" ? PLATY.createPlatypusCrowd(THREE, CROWD_MAX, { castShadow: false }) : makeNullCrowd(THREE, CROWD_MAX);
      group.add(crowd.group);
      for (let i = 0; i < CROWD_MAX; i++) crowd.hide(i);
    }
    return crowd;
  }
  // the member stand-ins get their own small crowd: in the shared one they sat in the top slots, so the whole village
  // (36 x 364 triangles of empty slots) was drawn whenever a single member was a stand-in, even with no village out
  let standCrowd = null;
  function getStandCrowd() {
    if (!standCrowd) {
      standCrowd = typeof PLATY.createPlatypusCrowd === "function" ? PLATY.createPlatypusCrowd(THREE, STAND_INS, { castShadow: false }) : makeNullCrowd(THREE, STAND_INS);
      group.add(standCrowd.group);
      for (let i = 0; i < STAND_INS; i++) standCrowd.hide(i);
    }
    return standCrowd;
  }

  // ================================================================ FOOD
  const fKind = new Int8Array(FOOD_N).fill(-1), fX = new Float32Array(FOOD_N), fY = new Float32Array(FOOD_N), fZ = new Float32Array(FOOD_N), fYaw = new Float32Array(FOOD_N);
  const fS = new Float32Array(FOOD_N), fEat = new Uint8Array(FOOD_N), fCarry = new Array(FOOD_N).fill(null);
  const foodIM = FOOD_KINDS.map((k) => makeInst(GEO[k], FOOD_N, "tribeFood-" + k));
  const FOOD_SCALE = [1.25, 1.3, 1.25, 1.2];
  function foodShow() {
    // only as many instances as the highest slot in use: the unused ones are zero-scaled but would still be drawn
    for (let k = 0; k < 4; k++) { let hi = -1; for (let i = 0; i < FOOD_N; i++) if (fKind[i] === k) hi = i; foodIM[k].visible = hi >= 0; foodIM[k].count = hi + 1; }
  }
  function foodWrite(i) {
    const k = fKind[i];
    for (let q = 0; q < 4; q++) if (q !== k) { foodIM[q].setMatrixAt(i, ZERO); foodIM[q].instanceMatrix.needsUpdate = true; }
    if (k >= 0) writeInst(foodIM[k], i, fX[i], fY[i], fZ[i], fYaw[i], 0, 0, fS[i] * FOOD_SCALE[k]);
  }
  const food = {
    count: FOOD_N,
    place(i, x, z, kind) {
      if (!(i >= 0 && i < FOOD_N)) return -1;
      let k = FOOD_KINDS.indexOf(kind);
      if (k < 0) k = 0;
      fKind[i] = k; fX[i] = x; fZ[i] = z; fY[i] = floorAt(x, z); fYaw[i] = hash(i, 3) * TAU; fS[i] = 1; fEat[i] = 0; fCarry[i] = null;
      foodWrite(i); foodShow();
      return i;
    },
    eat(i) {
      if (!food.active(i)) return false;
      fEat[i] = 1; fCarry[i] = null;
      vfx("hitBurst", _v.set(fX[i], fY[i] + 0.08, fZ[i]), FOOD_KINDS[fKind[i]] === "berries" ? 0x8a2a7a : 0xf2e2b0);
      return true;
    },
    active(i) { return i >= 0 && i < FOOD_N && fKind[i] >= 0 && !fEat[i]; },
    kind(i) { return fKind[i] >= 0 ? FOOD_KINDS[fKind[i]] : null; },
    carried(i) { return !!fCarry[i]; },
    nearest(x, z, max) {
      let best = -1, bd = max > 0 ? max : Infinity;
      for (let i = 0; i < FOOD_N; i++) {
        if (fKind[i] < 0 || fEat[i] || fCarry[i]) continue;
        const d = Math.hypot(fX[i] - x, fZ[i] - z);
        if (d <= bd) { bd = d; best = i; }
      }
      return best;
    },
    pos(i, out) { out.x = fX[i]; out.y = fY[i]; out.z = fZ[i]; return out; },
    // anchor: an Object3D to ride on (a holdAnchor, a back); null lays it on the ground where it is
    carry(i, anchor) {
      if (!(i >= 0 && i < FOOD_N) || fKind[i] < 0) return;
      fCarry[i] = anchor || null;
      if (!anchor) { fY[i] = floorAt(fX[i], fZ[i]); foodWrite(i); }
    },
    clear() {
      for (let i = 0; i < FOOD_N; i++) { fKind[i] = -1; fCarry[i] = null; fEat[i] = 0; foodWrite(i); }
      foodShow();
    },
  };
  function updateFood(dt) {
    for (let i = 0; i < FOOD_N; i++) {
      if (fKind[i] < 0) continue;
      if (fEat[i]) {
        fS[i] -= dt * 4;
        if (fS[i] <= 0) { fKind[i] = -1; fEat[i] = 0; foodWrite(i); foodShow(); } else foodWrite(i);
      } else if (fCarry[i]) {
        fCarry[i].getWorldPosition(_v);
        fX[i] = _v.x; fY[i] = _v.y - 0.03; fZ[i] = _v.z;
        foodWrite(i);
      }
    }
  }

  // ================================================================ MATERIALS + the pieces on the bench
  // each kind is ONE InstancedMesh: slots 0..11 are the pickups, the rest are the pieces laid on the frame
  const BENCH_NEED = { leaf: 4, vine: 2, bone: 2 };
  // instance layout per kind: the bench pieces first (MAT_OFF slots), then the MAT_N loose materials. Only as many
  // instances as are in use are drawn (count), so the empty slots cost nothing.
  const MAT_OFF = [4, 2, 2];
  const matIM = [makeInst(GEO.leaf, MAT_N + 4, "tribeLeaves"), makeInst(GEO.vine, MAT_N + 2, "tribeVines"), makeInst(GEO.bone, MAT_N + 2, "tribeBones")];
  const mKind = new Int8Array(MAT_N).fill(-1), mX = new Float32Array(MAT_N), mY = new Float32Array(MAT_N), mZ = new Float32Array(MAT_N);
  const mH = new Float32Array(MAT_N), mFall = new Float32Array(MAT_N), mPh = new Float32Array(MAT_N), mPop = new Float32Array(MAT_N);
  const mBeacon = new Array(MAT_N).fill(null);
  const BEACON_COL = [0x9dff8a, 0xd8ff7a, 0xfff0c8];
  function matShow() {
    for (let k = 0; k < 3; k++) {
      const onBench = bench.group.visible && (bench.have[MAT_KINDS[k]] > 0) && !benchHidden;
      let hi = -1;
      for (let i = 0; i < MAT_N; i++) if (mKind[i] === k) hi = i;
      matIM[k].visible = onBench || hi >= 0;
      matIM[k].count = hi >= 0 ? MAT_OFF[k] + hi + 1 : onBench ? MAT_OFF[k] : 0;
    }
  }
  function matWrite(i) {
    const k = mKind[i];
    for (let q = 0; q < 3; q++) if (q !== k) { matIM[q].setMatrixAt(MAT_OFF[q] + i, ZERO); matIM[q].instanceMatrix.needsUpdate = true; }
    if (k < 0) return;
    const bob = Math.sin(clock * 1.7 + mPh[i]) * 0.035;
    const hang = mH[i] > 0.05;
    // hanging leaves sway on their stalk; things on the ground hover a little and turn so they read as pickups
    const y = mY[i] + mH[i] + (hang ? 0 : 0.16 + bob);
    const yaw = hang ? mPh[i] + Math.sin(clock * 0.9 + mPh[i]) * 0.3 : clock * 0.7 + mPh[i];
    const pitch = k === 0 ? (hang ? -1.25 + Math.sin(clock * 1.3 + mPh[i]) * 0.12 : 0.25) : mFall[i] > 0 ? clock * 5 : 0.12;
    writeInst(matIM[k], MAT_OFF[k] + i, mX[i], y, mZ[i], yaw, pitch, 0, 1 + mPop[i] * 0.5);
  }
  const materials = {
    count: MAT_N,
    // y: optional height above the ground (a leaf still on its branch); drop(id) lets it spiral down
    spawn(kind, x, z, y) {
      const k = MAT_KINDS.indexOf(kind);
      if (k < 0) return -1;
      for (let i = 0; i < MAT_N; i++) {
        if (mKind[i] >= 0) continue;
        mKind[i] = k; mX[i] = x; mZ[i] = z; mY[i] = floorAt(x, z); mH[i] = y > 0 ? y : 0; mFall[i] = 0; mPh[i] = Math.random() * TAU; mPop[i] = 1;
        const b = vfx("beacon", x, mY[i] + mH[i], z, BEACON_COL[k]);
        mBeacon[i] = b && typeof b.remove === "function" ? b : null;
        matWrite(i); matShow();
        return i;
      }
      return -1;
    },
    kind(id) { return id >= 0 && id < MAT_N && mKind[id] >= 0 ? MAT_KINDS[mKind[id]] : null; },
    active(id) { return id >= 0 && id < MAT_N && mKind[id] >= 0; },
    hanging(id) { return materials.active(id) && mH[id] > 0.05; },
    drop(id) { if (materials.active(id) && mH[id] > 0) mFall[id] = 1; },
    nearest(x, z, max, kind) {
      const k = kind ? MAT_KINDS.indexOf(kind) : -1;
      let best = -1, bd = max > 0 ? max : Infinity;
      for (let i = 0; i < MAT_N; i++) {
        if (mKind[i] < 0 || (k >= 0 && mKind[i] !== k)) continue;
        const d = Math.hypot(mX[i] - x, mZ[i] - z);
        if (d <= bd) { bd = d; best = i; }
      }
      return best;
    },
    pos(id, out) { out.x = mX[id]; out.y = mY[id] + mH[id]; out.z = mZ[id]; return out; },
    collect(id) {
      if (!materials.active(id)) return null;
      const kind = MAT_KINDS[mKind[id]];
      mKind[id] = -1;
      if (mBeacon[id]) { mBeacon[id].remove(); mBeacon[id] = null; }
      matWrite(id); matShow();
      sfx("materialPickup", kind);
      vfx("leaves", mX[id], mY[id] + mH[id] + 0.15, mZ[id], kind === "bone" ? 4 : 9, kind === "bone" ? 0xe9e1c9 : 0x4f9a3a);
      return kind;
    },
    left(kind) {
      const k = MAT_KINDS.indexOf(kind);
      let n = 0;
      for (let i = 0; i < MAT_N; i++) if (mKind[i] >= 0 && (k < 0 || mKind[i] === k)) n++;
      return n;
    },
    clear() {
      for (let i = 0; i < MAT_N; i++) {
        mKind[i] = -1;
        if (mBeacon[i]) { mBeacon[i].remove(); mBeacon[i] = null; }
        matWrite(i);
      }
      matShow();
    },
  };
  function updateMaterials(dt) {
    for (let i = 0; i < MAT_N; i++) {
      if (mKind[i] < 0) continue;
      if (mPop[i] > 0) mPop[i] = Math.max(0, mPop[i] - dt * 3);
      if (mFall[i] > 0 && mH[i] > 0) {
        // a slow spiral down, like a real big leaf
        mH[i] = Math.max(0, mH[i] - dt * 0.85);
        mX[i] += Math.cos(clock * 3.1 + mPh[i]) * dt * 0.35;
        mZ[i] += Math.sin(clock * 3.1 + mPh[i]) * dt * 0.35;
        mY[i] = floorAt(mX[i], mZ[i]);
        if (mH[i] === 0) { mFall[i] = 0; vfx("leaves", mX[i], mY[i] + 0.1, mZ[i], 4, 0x4f9a3a); }
        if (mBeacon[i] && typeof mBeacon[i].set === "function") mBeacon[i].set(mX[i], mY[i] + mH[i], mZ[i]);
      }
      matWrite(i);
    }
  }

  // ================================================================ THE CRAFTING BENCH
  const benchGroup = new THREE.Group();
  benchGroup.name = "tribeBench";
  benchGroup.visible = false;
  const frameMesh = new THREE.Mesh(GEO.frame, propMat);
  frameMesh.castShadow = true;
  frameMesh.receiveShadow = true;
  benchGroup.add(frameMesh);
  group.add(benchGroup);
  let benchHidden = false, benchDirty = false, cinch = 0, cinchV = 0, slip = 0, lift = -1, benchX = 0, benchY = 0, benchZ = 0, benchYaw = 0;
  const pieceIn = { leaf: new Float32Array(4), vine: new Float32Array(2), bone: new Float32Array(2) }; // 0..1 lay-down animation
  const LEAF_X = [-0.3, -0.1, 0.1, 0.3];
  function benchPiece(k, j, lx, ly, lz, yaw, pitch, roll, sc) {
    const c = Math.cos(benchYaw), s = Math.sin(benchYaw);
    writeInst(matIM[k], j, benchX + lx * c + lz * s, benchY + ly, benchZ - lx * s + lz * c, benchYaw + yaw, pitch, roll, sc);
  }
  function benchWrite() {
    const tight = clamp(bench.stage / 3 + cinch, -0.2, 1.3);
    const up = lift >= 0 ? lift : 0;
    const rise = up * up * (3 - 2 * up) * 0.55, spin = up * 2.4, gone = benchHidden ? 0 : lift >= 0 ? 1 - Math.max(0, (up - 0.8) / 0.2) : 1;
    const wob = Math.sin(clock * 38) * slip * 0.05;
    const squeeze = 1 - 0.16 * tight;
    for (let j = 0; j < 4; j++) {
      const a = pieceIn.leaf[j], on = j < bench.have.leaf ? gone : 0;
      // the leaves hang over the ridge pole, overlapping like shingles; each lacing pull draws them together
const sd = j % 2 ? -1 : 1;
      benchPiece(0, j, LEAF_X[j] * squeeze + wob, 0.415 + rise + (1 - a) * 0.35 + (j % 2) * 0.012, sd * (0.2 - 0.03 * tight), (sd > 0 ? 0 : Math.PI) + (j - 1.5) * 0.12 * (1 - tight * 0.6) + spin, 0.6 + 0.08 * tight - (1 - a) * 0.5, 0, on * (0.25 + 0.75 * a) * 0.86);
    }
    for (let j = 0; j < 2; j++) {
      const a = pieceIn.vine[j], on = j < bench.have.vine ? gone : 0, sd = j ? 1 : -1;
      benchPiece(1, j, sd * 0.2 * squeeze, 0.52 + rise + (1 - a) * 0.3, 0, Math.PI / 2 + spin, Math.PI / 2, 0, on * (0.3 + 0.7 * a) * (0.62 - 0.14 * tight));
    }
    for (let j = 0; j < 2; j++) {
      const a = pieceIn.bone[j], on = j < bench.have.bone ? gone : 0, sd = j ? 1 : -1;
      benchPiece(2, j, sd * 0.4 * squeeze - wob, 0.56 + rise + (1 - a) * 0.3, 0.02, Math.PI / 2 + spin, 0, sd * 0.5, on * (0.3 + 0.7 * a) * 0.7);
    }
    matShow();
  }
  const bench = {
    group: benchGroup,
    need: BENCH_NEED,
    have: { leaf: 0, vine: 0, bone: 0 },
    stage: 0,
    taken: false,
    get x() { return benchX; },
    get z() { return benchZ; },
    get ready() { return bench.have.leaf >= BENCH_NEED.leaf && bench.have.vine >= BENCH_NEED.vine && bench.have.bone >= BENCH_NEED.bone; },
    get done() { return bench.stage >= 3; },
    get placed() { return bench.have.leaf + bench.have.vine + bench.have.bone; },
    missing(kind) { return Math.max(0, BENCH_NEED[kind] - bench.have[kind]); },
    place(x, z, yaw) {
      benchX = x; benchZ = z; benchYaw = yaw || 0; benchY = floorAt(x, z);
      benchGroup.position.set(x, benchY, z);
      benchGroup.rotation.y = benchYaw;
      benchGroup.visible = true;
      benchWrite();
    },
    put(kind) {
      if (!(kind in BENCH_NEED) || bench.have[kind] >= BENCH_NEED[kind] || bench.taken) return false;
      pieceIn[kind][bench.have[kind]] = 0;
      bench.have[kind]++;
      benchDirty = true;
      sfx("craft", kind === "leaf" ? "weave" : kind === "vine" ? "tie" : "bone");
      vfx("leaves", benchX, benchY + 0.6, benchZ, 3, kind === "bone" ? 0xe9e1c9 : 0x4f9a3a);
      benchWrite();
      return true;
    },
    // one lacing pull. quality >= 0.5: the vine cinches and the stage goes up; below: it slips, nothing gained
    tighten(quality) {
      if (!bench.ready || bench.done || bench.taken) return false;
      benchDirty = true;
      if (!(quality >= 0.5)) { slip = 1; cinchV -= 1.6; sfx("craft", "slip"); return false; }
      bench.stage++;
      cinch = -1 / 3; cinchV = 0; // the visible tightness springs from the old stage to the new one, with a little overshoot
      return true;
    },
    takeArmor() {
      if (!bench.done || bench.taken) return false;
      bench.taken = true;
      lift = 0;
      benchDirty = true;
      return true;
    },
    reset() {
      bench.have.leaf = bench.have.vine = bench.have.bone = 0;
      bench.stage = 0; bench.taken = false;
      cinch = cinchV = slip = 0; lift = -1; benchHidden = false; benchDirty = false;
      benchWrite();
    },
  };
  function updateBench(dt) {
    if (!benchDirty) return;
    let busy = false;
    for (const k in pieceIn) {
      const arr = pieceIn[k];
      for (let j = 0; j < arr.length; j++) if (j < bench.have[k] && arr[j] < 1) { arr[j] = Math.min(1, arr[j] + dt * 2.6); busy = true; }
    }
    cinchV += (-cinch * 90 - cinchV * 9) * dt;
    cinch += cinchV * dt;
    if (Math.abs(cinch) > 0.002 || Math.abs(cinchV) > 0.02) busy = true; else { cinch = 0; cinchV = 0; }
    if (slip > 0) { slip = Math.max(0, slip - dt * 2.5); busy = true; }
    if (lift >= 0 && !benchHidden) {
      lift += dt / 1.3;
      busy = true;
      if (lift >= 1) {
        // the armor has left the frame: it is the level's (and now the player's)
        benchHidden = true; lift = 1;
        const gear = ctx.gear;
        if (gear && typeof gear.wear === "function" && !(gear.worn && gear.worn.body === "leaf")) gear.wear("body", "leaf", { armor: 0.3 });
        busy = false;
      }
    }
    benchWrite();
    if (!busy) benchDirty = false;
  }

  // ================================================================ NAMED MEMBERS
  const members = {};
  const memberList = [];
  let shownT = 0;

  function createMember(key, def, index) {
    const mgroup = new THREE.Group();
    mgroup.name = "tribe-" + key;
    mgroup.visible = false;
    group.add(mgroup);
    let body = null;
    const seed = hash(index, 9) * 100;
    const pace = def.pace;
    let want = false, shown = false, explicit = false;

    const M = {
      key, group: mgroup, name: def.name, def,
      x: 0, y: 0, z: 0, yaw: 0, speed: 0, pitch: 0, roll: 0, turn: 0,
      behaviour: "idle", busy: false, radius: RADIUS, swimming: false, inWater: false, grounded: true, vy: 0,
      hurt: false, placed: false,
      onEvent: null,
      get body() { return build(); },
      get built() { return !!body; },
      get visible() { return want; },
      set visible(v) { want = !!v; explicit = true; if (want) build(); refreshShown(); },
      get shown() { return shown; },
      place, distTo, lookAt: setLook, do: doBehaviour, emote, found, heal, attachTo, reset, eat,
    };

    function build() {
      if (body) return body;
      body = PLATY.createPlatypus(THREE, def.opts);
      mgroup.add(body.group);
      if (!body.setGear && def.opts.scale === undefined) mgroup.scale.setScalar(def.standScale); // a model without the tribe variant: at least the sizes
      if (def.extra && GEO[def.extra]) {
        const mesh = new THREE.Mesh(GEO[def.extra], propMat);
        mesh.name = def.extra;
        mesh.castShadow = false;
        const bone = body.skeleton && typeof body.skeleton.getBoneByName === "function" ? body.skeleton.getBoneByName(def.extra === "hat" ? "head" : def.extra === "beads" ? "neck" : "chest") : null;
        if (def.extra === "hat") { mesh.position.set(0, 0.052, -0.012); mesh.rotation.set(-0.22, 0, 0.1); mesh.scale.setScalar(1.25); }
        else if (def.extra === "beads") { mesh.position.set(0, -0.012, -0.012); mesh.rotation.set(0.42, 0, 0); }
        else { mesh.position.set(0, -0.03, 0.0); mesh.rotation.set(0, 0.34, 0.1); }
        (bone || body.group).add(mesh);
      }
      body.onFootstep = onStep;
      applyPose(true);
      return body;
    }
    // call a method of the model if the model (and the method) exists
    function bcall(name, a, b) {
      if (!body) return 0;
      const f = body[name];
      return typeof f === "function" ? f.call(body, a, b) : 0;
    }
    function setShown(v) { shown = v; mgroup.visible = v; }
    M._setShown = setShown;
    M._want = () => want && M.placed;

    function hear() { ears(M.x, M.y, M.z); }
    function chirp(mood, vol) { if (!want) return; hear(); tribeChirp(mood, vol === undefined ? 1 : vol, def.pitch); }
    let stepN = 0;
    function onStep(footIndex, lx, lz, strength) {
      if (!shown || M.swimming || !M.grounded || attached) return;
      hear();
      const st = clamp(typeof strength === "number" ? strength : 0.6, 0, 1.5) * 0.55 * earVol;
      const surf = M.inWater ? "water" : world && world.surfaceAt ? world.surfaceAt(M.x, M.z) : "dirt";
      sfx("step", surf, st, earPan);
      stepN++;
      if ((stepN & 3) === 0 && M.speed > 2 && !M.inWater) vfx("footDust", M.x, M.y + 0.02, M.z, 0.25, 0x8a7a5c);
    }

    // events are queued and delivered at the end of update(), so a handler may call do() freely
    const evType = new Array(16).fill(null), evData = new Array(16).fill(null);
    let evN = 0;
    function emit(type, data) { if (evN < 16) { evType[evN] = type; evData[evN] = data === undefined ? null : data; evN++; } }
    function flushEvents() {
      for (let i = 0; i < evN; i++) {
        const t = evType[i], d = evData[i];
        evType[i] = evData[i] = null;
        const cb = M.onEvent;
        if (cb) cb(t, d);
      }
      evN = 0;
    }

    // ---- poses
    let basePose = null, overPose = null, poseNow = null, sleeping = false, carrying = false;
    function applyPose(force) {
      const want2 = shotHoldsPose() ? null : overPose || basePose;
      if (want2 !== poseNow || force) { poseNow = want2; bcall("pose", want2, want2 === "still" ? 0.6 : 0.4); }
    }
    function setSleep(on) {
      if (sleeping === on) return;
      sleeping = on;
      if (body && typeof body.sleep === "function") body.sleep(on); else basePose = on ? "curl" : null;
    }
    function setCarry(on) { if (carrying !== on) { carrying = on; bcall("setCarry", on); } }

    // ---- head
    const lookV = new THREE.Vector3(), forceV = new THREE.Vector3(), glanceV = new THREE.Vector3();
    let explicitLook = null, force = 0, noLook = false, glanceKind = 0, glanceT = 1.5;
    function setLook(target) { explicitLook = target || null; }
    function glanceAtPlayer(secs) { glanceKind = 1; glanceT = secs; }
    function updateLook(dt) {
      if (!body || typeof body.lookAt !== "function") return;
      let kind = 0;
      if (noLook) kind = 0;
      else if (explicitLook) {
        const t = explicitLook;
        if (t.isObject3D) { t.getWorldPosition(lookV); lookV.y += 0.2; } else lookV.set(t.x || 0, typeof t.y === "number" ? t.y : floorAt(t.x || 0, t.z || 0) + 0.2, t.z || 0);
        kind = 2;
      } else if (force === 1) kind = 1;
      else if (force === 2) { lookV.copy(forceV); kind = 2; }
      else {
        const pd = distP();
        glanceT -= dt;
        if (glanceT <= 0) {
          const r = Math.random(), running = M.speed > 2.4;
          if (pd < 9 && r < (running ? 0.3 : 0.6)) glanceAtPlayer(running ? rnd(0.35, 0.7) : rnd(0.9, 2.6));
          else if (r < 0.84 && !running) {
            const a = M.yaw + rnd(-1.6, 1.6), d = rnd(1.5, 4);
            glanceV.set(M.x + Math.sin(a) * d, M.y + rnd(-0.05, 0.9), M.z + Math.cos(a) * d);
            glanceKind = 2; glanceT = rnd(0.7, 1.7);
          } else { glanceKind = 0; glanceT = rnd(0.6, 1.8); }
        }
        kind = glanceKind;
        if (kind === 2) lookV.copy(glanceV);
      }
      if (kind === 1) lookV.set(P.x, P.y + 0.22, P.z);
      body.lookAt(kind ? lookV : null);
    }

    // ---- the movement wish (written by behaviours)
    const mv = { on: false, x: 0, z: 0, speed: 0, face: NaN, keep: 0.6, casual: false, warp: false, slowIn: true };
    function go(x, z, speed, casual) { mv.on = true; mv.x = x; mv.z = z; mv.speed = speed * pace; mv.casual = !!casual; }
    function halt(face) { mv.on = false; mv.face = face === undefined ? NaN : face; }
    const dist = (x, z) => Math.hypot(x - M.x, z - M.z);
    const distP = () => Math.hypot(P.x - M.x, P.z - M.z);
    const yawTo = (x, z) => Math.atan2(x - M.x, z - M.z);
    const yawToPlayer = () => Math.atan2(P.x - M.x, P.z - M.z);
    function travel(x, z, speed, r, casual) {
      if (dist(x, z) <= r) { halt(); return true; }
      go(x, z, speed, casual);
      return false;
    }
    function faceTo(yaw, tol) { halt(yaw); return Math.abs(wrap(yaw - M.yaw)) < (tol || 0.14); }

    // ---- aliveness
    let hesState = 0, hesT = rnd(2.5, 6), speedMul = 1;
    let bob = 0, bobX = 0, bobV = 0, lean = 0, leanWant = 0, tilt = 0, tiltWant = 0, wiggle = 0, lift = 0, liftWant = 0, spin = 0;
    function alive(dt) {
      speedMul = 1 + Math.sin(clock * 0.83 + seed) * 0.05;
      if (!mv.on) { hesState = 0; return; }
      if (mv.casual && dist(mv.x, mv.z) > 1.6) {
        hesT -= dt;
        if (hesT <= 0) {
          if (hesState === 0) { hesState = 1; hesT = rnd(0.25, 0.6); glanceAtPlayer(hesT + 0.5); }
          else if (hesState === 1) { hesState = 2; hesT = rnd(0.45, 0.9); bobV += 1.6; }
          else { hesState = 0; hesT = rnd(3.2, 8); }
        }
        speedMul = hesState === 1 ? 0 : hesState === 2 ? 1.3 : 1 + Math.sin(clock * 0.83 + seed) * 0.12;
      } else if (hesState !== 0) { hesState = 0; hesT = rnd(3.2, 8); }
    }

    // ---- locomotion (the rules of friend.js)
    let mvDist = 0, hopCd = 0, detourT = 0, detourSide = 1, sampT = 0, sampX = 0, sampZ = 0, dogX = 0, dogZ = 0, dogBest = Infinity, dogT = 0, wakeT = 0;
    function avoidOne(cx, cz, cr, hx, hz) {
      const dx = cx - M.x, dz = cz - M.z;
      const ahead = dx * hx + dz * hz;
      if (ahead <= 0 || ahead > mvDist + 0.1) return 0;
      const R = cr + RADIUS + 0.14;
      if (ahead > R + 1.3) return 0;
      const lat = dx * hz - dz * hx;
      const al = lat < 0 ? -lat : lat;
      if (al >= R) return 0;
      return (lat >= 0 ? -1 : 1) * (1 - al / R) * (1 - Math.max(0, ahead - R) / 1.3) * 1.25;
    }
    function avoidance(yawWant) {
      const hx = Math.sin(yawWant), hz = Math.cos(yawWant);
      let s = 0;
      for (let pass = 0; pass < 2; pass++) {
        const list = pass === 0 ? world && world.colliders : ctx.colliders;
        if (!list) continue;
        for (let i = 0; i < list.length; i++) { const c = list[i]; if (c.on !== false) s += avoidOne(c.x, c.z, c.r, hx, hz); }
      }
      if (mv.keep > 0.3 && Math.hypot(mv.x - P.x, mv.z - P.z) > mv.keep + 0.45) s += avoidOne(P.x, P.z, mv.keep - RADIUS, hx, hz);
      // and round each other
      for (let i = 0; i < memberList.length; i++) { const o = memberList[i]; if (o !== M && o._want()) s += avoidOne(o.x, o.z, 0.2, hx, hz) * 0.6; }
      return clamp(s, -1.35, 1.35);
    }
    function hop(v) {
      if (!M.grounded || M.swimming) { bobV += 2.5; return; }
      M.grounded = false; M.vy = v;
      bcall("jump");
    }
    function warpTo(x, z) {
      M.x = x; M.z = z; M.y = floorAt(x, z);
      M.vy = 0; M.grounded = true; M.speed = 0;
      dogBest = Infinity; dogT = 0;
    }
    function locomote(dt, held) {
      const moving = mv.on && !held;
      let target = 0, turned = 0, wantYaw = NaN;
      mvDist = 0;
      if (moving) {
        const dx = mv.x - M.x, dz = mv.z - M.z;
        mvDist = Math.hypot(dx, dz);
        if (mvDist > 1e-3) {
          wantYaw = Math.atan2(dx, dz);
          const weave = mv.casual ? 0.3 : 0.1;
          if (mvDist > 1.1) wantYaw += Math.sin(clock * (mv.casual ? 1.5 : 2.3) + seed) * weave * Math.min(1, (mvDist - 1.1) / 2);
          if (detourT > 0) wantYaw += detourSide * 1.3;
          wantYaw += avoidance(wantYaw);
          target = mv.speed * speedMul;
          if (mv.slowIn) target = Math.min(target, 0.4 + mvDist * 2.6);
          if (M.hurt) target = Math.min(target, 1.0);
        }
      } else if (!isNaN(mv.face)) wantYaw = mv.face;

      if (!isNaN(wantYaw)) {
        const diff = wrap(wantYaw - M.yaw);
        const a = diff < 0 ? -diff : diff;
        const rate = (target > 0 ? TURN : 5.5) * (M.grounded ? 1 : 0.5) * (pace < 0.8 ? 0.6 : 1);
        turned = clamp(diff * Math.min(1, dt * 9), -rate * dt, rate * dt);
        if (target > 0) target *= a > 1.7 ? 0.25 : a > 0.9 ? 0.6 : 1;
      }
      M.yaw = wrap(M.yaw + turned);
      const turnRate = dt > 0 ? turned / dt : 0;
      if (M.swimming) target = Math.min(SWIM, target * 1.12);
      else if (M.inWater) target *= 0.8;
      if (!M.grounded) { if (moving && M.speed < 1.7) M.speed = 1.7; }
      else M.speed += clamp(target - M.speed, -14 * dt, 9 * dt);
      if (M.speed < 0.01 && target === 0) M.speed = 0;

      const ox = M.x, oz = M.z;
      M.x += Math.sin(M.yaw) * M.speed * dt;
      M.z += Math.cos(M.yaw) * M.speed * dt;
      for (let pass = 0; pass < 2; pass++) {
        const list = pass === 0 ? world && world.colliders : ctx.colliders;
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (c.on === false) continue;
          const dx = M.x - c.x, dz = M.z - c.z, r = c.r + RADIUS, d2 = dx * dx + dz * dz;
          if (d2 < r * r && d2 > 1e-6) { const d = Math.sqrt(d2); M.x = c.x + (dx / d) * r; M.z = c.z + (dz / d) * r; }
        }
      }
      // give the player room: the member steps aside, the player is never moved
      if (mv.keep > 0 && !P.hidden) {
        const dx = M.x - P.x, dz = M.z - P.z, d2 = dx * dx + dz * dz, dy = M.y - P.y;
        if (d2 < mv.keep * mv.keep && dy < 0.8 && dy > -0.8) {
          const d = Math.sqrt(d2), push = Math.min(mv.keep - d, 1.8 * dt);
          if (d > 1e-4) { M.x += (dx / d) * push; M.z += (dz / d) * push; }
          else { M.x += Math.sin(M.yaw + 1.6) * push; M.z += Math.cos(M.yaw + 1.6) * push; }
        }
      }
      if (world && world.confine) world.confine(M, RADIUS);

      // ledges: waddle up small ones, hop up to 0.9 m, slide along anything taller
      if (M.x !== ox || M.z !== oz) {
        if (M.grounded) {
          const rise = floorAt(M.x, M.z) - M.y;
          if (rise > MAX_STEP) {
            if (rise <= MAX_HOP && moving && hopCd <= 0) {
              M.x = ox; M.z = oz;
              M.grounded = false; M.swimming = false;
              M.vy = Math.sqrt(2 * GRAV * (rise + 0.24));
              hopCd = 0.35;
              bcall("jump");
            } else {
              const lim = M.y + MAX_STEP;
              if (floorAt(M.x, oz) <= lim) M.z = oz;
              else if (floorAt(ox, M.z) <= lim) M.x = ox;
              else { M.x = ox; M.z = oz; }
            }
          }
        } else {
          const lim = M.y + 0.03;
          if (floorAt(M.x, M.z) > lim) {
            if (floorAt(M.x, oz) <= lim) M.z = oz;
            else if (floorAt(ox, M.z) <= lim) M.x = ox;
            else { M.x = ox; M.z = oz; }
          }
        }
      }
      if (hopCd > 0) hopCd -= dt;

      const s = Math.sin(M.yaw), c = Math.cos(M.yaw);
      const h = floorAt(M.x, M.z);
      const bed = heightAt(M.x, M.z), surf = waterAt(M.x, M.z);
      M.inWater = surf > bed + 0.02 && M.y < surf + 0.05;
      const canSwim = !!(world && world.swim) && surf - 0.1 > bed + 0.1;
      const k10 = Math.min(1, dt * 10);
      if (canSwim && M.grounded) {
        const top = surf - 0.1;
        if (!M.swimming) {
          M.swimming = true;
          if (M.speed > 1 && M.y > top - 0.3 && shown) { hear(); vfx("splash", M.x, surf, M.z, 0.3); sfx("splash", 0.25 * earVol); }
        }
        M.y += clamp(top - M.y, -1.8 * dt, 2.3 * dt);
        if (M.y > top) M.y += (top - M.y) * Math.min(1, dt * 12);
        M.pitch += (0 - M.pitch) * k10;
        M.roll += (clamp(-turnRate * 0.05, -0.25, 0.25) - M.roll) * k10;
        M.vy = 0;
        if (M.speed > 0.5 && shown) { wakeT -= dt; if (wakeT <= 0) { wakeT = 0.22; vfx("wake", M.x, M.z, surf, clamp(M.speed / SWIM, 0.2, 1)); } }
      } else if (M.grounded) {
        M.swimming = false;
        if (h < M.y - 0.55) { M.grounded = false; M.vy = 0; }
        else {
          const hF = floorAt(M.x + s * 0.27, M.z + c * 0.27), hB = floorAt(M.x - s * 0.27, M.z - c * 0.27);
          const hL = floorAt(M.x + c * 0.15, M.z - s * 0.15), hR = floorAt(M.x - c * 0.15, M.z + s * 0.15);
          M.y += (Math.max(h, (hF + hB) * 0.5) - M.y) * Math.min(1, dt * 22);
          M.pitch += (clamp(Math.atan2(hB - hF, 0.54), -0.55, 0.55) * 0.85 - M.pitch) * k10;
          M.roll += (clamp(Math.atan2(hL - hR, 0.3), -0.45, 0.45) * 0.7 - clamp(turnRate * M.speed * 0.022, -0.2, 0.2) - M.roll) * k10;
          M.vy = 0;
        }
      } else {
        M.vy -= GRAV * dt;
        M.y += M.vy * dt;
        const k = Math.min(1, dt * 6);
        M.pitch += (clamp(-M.vy * 0.035, -0.26, 0.16) - M.pitch) * k;
        M.roll += (0 - M.roll) * k;
        if (M.y <= h && M.vy <= 0) {
          const impact = clamp(-M.vy / 8, 0.15, 1);
          M.y = h; M.grounded = true; M.vy = 0;
          bcall("land", impact);
          if (shown) {
            hear();
            if (surf > bed + 0.05) { vfx("splash", M.x, surf, M.z, 0.25 + impact * 0.4); sfx("splash", (0.2 + impact * 0.4) * earVol); }
            else sfx("step", world && world.surfaceAt ? world.surfaceAt(M.x, M.z) : "dirt", (0.5 + impact * 0.6) * 0.55 * earVol, earPan);
          }
        }
      }
      M.turn = turnRate;

      // stuck? try a way round; hopeless (scripted trips only)? just be there, so a level never waits for ever
      if (moving && mvDist > 0.3) {
        sampT += dt;
        if (sampT >= 0.5) {
          if (Math.hypot(M.x - sampX, M.z - sampZ) < 0.1 && mv.speed * speedMul > 0.4) { detourT = 0.75; detourSide = -detourSide; }
          sampT = 0; sampX = M.x; sampZ = M.z;
        }
        if (detourT > 0) detourT -= dt;
        if (mv.warp) {
          if (Math.hypot(mv.x - dogX, mv.z - dogZ) > 0.6) { dogX = mv.x; dogZ = mv.z; dogBest = Infinity; dogT = 0; }
          if (mvDist < dogBest - 0.2) { dogBest = mvDist; dogT = 0; }
          else { dogT += dt; if (dogT > 4.5) warpTo(mv.x, mv.z); }
        }
      } else { sampT = 0; sampX = M.x; sampZ = M.z; detourT = 0; dogT = 0; dogBest = Infinity; }
    }

    // ---- one-shots (emotes and short acts)
    let shotName = null, shotT = 0, shotDur = 0, shotHold = false, shotCue = 0;
    const shotHoldsPose = () => shotName === "bow" || shotName === "nuzzle" || shotName === "eat" || shotName === "cheer" || shotName === "strike";
    function startShot(name, dur, hold) { shotName = name; shotT = 0; shotDur = dur; shotHold = hold; shotCue = 0; M.busy = true; }
    function endShot() {
      if (!shotName) { M.busy = false; return; }
      const n = shotName;
      shotName = null;
      if (n === "sad" || n === "scared" || n === "mourn" || n === "peek") overPose = null;
      tiltWant = 0; wiggle = 0; liftWant = 0;
      M.busy = false;
      if (n === "peek") emit("peeked");
    }
    function heartsNow() {
      if (!shown || !body) return;
      body.billTip.getWorldPosition(forceV);
      forceV.y += 0.12;
      vfx("hearts", forceV, 3);
    }
    function emote(name) {
      if (attached || M.behaviour === "still" || sleeping) return 0;
      endShot();
      switch (name) {
        case "happy": hop(3.1); chirp("happy"); startShot("happy", 0.75, true); break;
        case "chirp": chirp("happy", 0.7); bobV += 2.2; startShot("chirp", 0.35, false); break;
        case "call": hop(2.5); chirp("call"); startShot("call", 0.85, true); break;
        case "curious": chirp("curious", 0.6); tiltWant = Math.random() < 0.5 ? 0.17 : -0.17; startShot("curious", 1.3, true); break;
        case "sad": overPose = "sad"; chirp("sad"); startShot("sad", 3.2, true); break;
        case "scared": overPose = "scared"; chirp("scared"); bobV -= 3; startShot("scared", 4, true); break;
        case "bow": { let d = bcall("playBow"); if (!(d > 0)) { d = 1.1; bobV += 4; } chirp("happy", 0.5); startShot("bow", d, true); break; }
        case "cheer": { let d = bcall("cheer"); if (!(d > 0)) { d = 1.2; hop(3.4); } chirp("cheer"); startShot("cheer", d, true); break; }
        case "war": { let d = bcall("cheer"); if (!(d > 0)) { d = 1.2; hop(2.8); } chirp("war", 1.1); startShot("cheer", d + 0.2, true); break; }
        case "mourn": overPose = "sad"; chirp("mourn", 0.8); startShot("mourn", 4.5, true); break;
        case "sniff": chirp("curious", 0.35); startShot("sniff", 1.6, true); break;
        default: return 0;
      }
      return shotDur;
    }
    function eat() {
      if (attached || M.behaviour === "still") return 0;
      endShot();
      let d = bcall("eat");
      if (!(d > 0)) d = 1.4;
      startShot("eat", d, true);
      return d;
    }
    function tickShot(dt) {
      if (!shotName) return;
      shotT += dt;
      const k = shotDur > 0 ? shotT / shotDur : 1;
      switch (shotName) {
        case "happy": force = 1; if (shotCue === 0 && shotT > 0.14) { shotCue = 1; heartsNow(); } break;
        case "call": force = 1; mv.face = yawToPlayer(); break;
        case "curious": force = 2; forceV.set(P.x, P.y + 0.42, P.z); if (k > 0.8) tiltWant = 0; break;
        case "sniff": {
          force = 2;
          const a = M.yaw + Math.sin(shotT * 5.5) * 0.5;
          forceV.set(M.x + Math.sin(a) * 0.5, M.y - 0.06, M.z + Math.cos(a) * 0.5);
          if (shotCue < 3 && shotT > 0.3 + shotCue * 0.4) { shotCue++; bobV -= 1.4; }
          break;
        }
        case "mourn": noLook = true; break;
        case "eat": if (shotCue < 3 && shotT >= 0.3 + shotCue * 0.35) { shotCue++; hear(); sfx("eatFruit"); } break;
        case "peek": liftWant = k < 0.75 ? 1 : 0; force = 1; break;
        case "strike":
          if (shotCue === 0 && shotT >= 0.2) { shotCue = 1; emit("strike", bh.target); if (shown && body && body.spurR) { body.spurR.getWorldPosition(forceV); vfx("stingBurst", forceV); } hear(); sfx("stingHit"); }
          break;
        case "thecall":
          liftWant = Math.sin(Math.PI * clamp(k, 0, 1));
          leanWant = -0.3 * liftWant;
          noLook = true;
          if (shotCue === 0 && shotT >= 0.35) { shotCue = 1; hear(); sfx("mysteryCall", 1, earPan); wiggle = 0; }
          if (shotCue === 1) wiggle = Math.sin(shotT * 26) * 0.02;
          break;
        default: break;
      }
      if (shotT >= shotDur) endShot();
    }

    // ---- behaviours
    const bh = {
      name: "idle", phase: 0, t: 0, t2: 0, t3: 0, next: 0, i: 0, n: 0, a: 0, side: 1, x: 0, z: 0, yaw: NaN, done: false, waiting: false,
      o: EMPTY, route: null, target: null, cx: 0, cz: 0, radius: 4, dist: 1.3, sideOff: 0.7, run: false, food: -1, beat: -1,
    };
    let attached = null, homeParent = null;
    const probe = { x: 0, y: 0, z: 0 };
    function confined(x, z) { probe.x = x; probe.z = z; if (world && world.confine) world.confine(probe, RADIUS); return probe; }

    function doBehaviour(name, opts) {
      const o = opts || EMPTY;
      // a peek from a hiding place is a moment inside the hiding, not a new behaviour
      if (name === "peek" && bh.name === "hide" && bh.phase === 2) { endShot(); overPose = null; basePose = null; startShot("peek", 1.5, true); bh.t3 = 1.6; return; }
      if (attached) attachTo(null);
      if (name !== "sleep") setSleep(false);
      if (name !== "feed") { if (bh.name === "feed" && bh.food >= 0 && bh.phase > 0 && bh.phase < 4) food.carry(bh.food, null); setCarry(false); }
      basePose = null;
      if (shotName === "sad" || shotName === "scared" || shotName === "mourn" || shotName === "peek") endShot();
      if (name === "hurt") M.hurt = true;
      if (!BEHAVIOURS[name]) name = "idle";
      if (M.hurt && name !== "hurt" && name !== "still") basePose = "limp";
      bh.name = name; bh.o = o;
      bh.phase = 0; bh.t = 0; bh.t2 = 0; bh.t3 = 0; bh.i = 0; bh.n = 0; bh.a = 0;
      bh.done = false; bh.waiting = false; bh.next = rnd(1.5, 3);
      bh.side = Math.random() < 0.5 ? 1 : -1;
      bh.route = o.route || null;
      bh.target = o.target || null;
      bh.yaw = NaN; bh.beat = -1; bh.food = -1;
      spin = 0; tiltWant = 0;
      dogBest = Infinity; dogT = 0; detourT = 0;
      const at = name === "hide" ? o.spot : name === "flee" || name === "hurt" ? o.to : o.at;
      switch (name) {
        case "idle": bh.t = rnd(1.2, 3); break;
        case "wander":
        case "dance":
          bh.cx = o.center ? o.center.x : M.x; bh.cz = o.center ? o.center.z : M.z;
          bh.radius = o.radius > 0 ? o.radius : name === "dance" ? 2.6 : 4;
          bh.a = Math.atan2(M.x - bh.cx, M.z - bh.cz);
          break;
        case "follow":
          bh.dist = o.dist > 0 ? o.dist : 1.3; bh.sideOff = typeof o.side === "number" ? o.side : 0.7; bh.t = rnd(3, 6);
          break;
        case "goto":
          bh.x = o.x || 0; bh.z = o.z || 0; bh.yaw = typeof o.yaw === "number" ? o.yaw : NaN; bh.run = !!o.run;
          break;
        case "lead":
          bh.dist = o.waitDist > 0 ? o.waitDist : 4.5; bh.run = o.run !== false; bh.next = 0.5;
          if (!bh.route || !bh.route.length) bh.done = true;
          break;
        case "feed":
          bh.food = typeof o.food === "number" ? o.food : -1;
          break;
        case "hide": case "sleep": case "sit": case "craft": case "guard": case "flee": case "hurt":
          bh.waiting = !!at;
          bh.x = at ? at.x : M.x; bh.z = at ? at.z : M.z;
          bh.yaw = typeof o.yaw === "number" ? o.yaw : at && typeof at.yaw === "number" ? at.yaw : NaN;
          bh.next = rnd(2, 4);
          break;
        case "still": basePose = "still"; M.speed = 0; endShot(); break;
        default: break;
      }
      M.behaviour = name;
    }

    const BEHAVIOURS = {
      idle(dt) {
        mv.keep = 0.55;
        bh.t -= dt;
        if (bh.phase === 0) {
          halt(bh.yaw);
          if (bh.t <= 0 && !M.busy) {
            const r = Math.random(), pd = distP();
            bh.yaw = NaN;
            if (r < 0.26 && !M.hurt) {
              const a = rnd(0, TAU), d = rnd(0.5, 1.1);
              const c = confined(M.x + Math.sin(a) * d, M.z + Math.cos(a) * d);
              if (Math.abs(floorAt(c.x, c.z) - M.y) < 0.3 && Math.hypot(c.x - P.x, c.z - P.z) > 0.9) { bh.x = c.x; bh.z = c.z; bh.phase = 1; bh.t = 2.5; } else bh.t = 0.3;
            } else if (r < 0.46) { basePose = "sit"; bh.phase = 2; bh.t = rnd(3, 6); }
            else if (r < 0.62 && pd < 7) { emote("curious"); bh.t = rnd(2.2, 4); }
            else if (r < 0.8) { emote("sniff"); bh.t = rnd(2.4, 3.6); }
            else { bh.yaw = pd < 6 ? yawToPlayer() + rnd(-0.3, 0.3) : M.yaw + rnd(-1.4, 1.4); bh.t = rnd(1.5, 3.2); }
          }
        } else if (bh.phase === 1) {
          if (travel(bh.x, bh.z, 0.85, 0.14, false) || bh.t <= 0) { bh.phase = 0; bh.t = rnd(1.8, 4.5); }
        } else {
          halt(); mv.keep = 0;
          if (glanceKind !== 1 && distP() < 6) glanceAtPlayer(1.5);
          if (bh.t <= 0) { basePose = M.hurt ? "limp" : null; bh.phase = 0; bh.t = rnd(1.5, 3.5); }
        }
      },

      wander(dt) {
        bh.t -= dt;
        if (bh.phase === 0) {
          halt();
          const a = rnd(0, TAU), d = Math.sqrt(Math.random()) * bh.radius;
          const c = confined(bh.cx + Math.sin(a) * d, bh.cz + Math.cos(a) * d);
          if (Math.abs(floorAt(c.x, c.z) - M.y) < 1.3 && dist(c.x, c.z) > 0.8) { bh.x = c.x; bh.z = c.z; bh.phase = 1; bh.t = 10; bh.a = rnd(0.75, 1.05); }
        } else if (bh.phase === 1) {
          if (travel(bh.x, bh.z, WALK * bh.a, 0.3, true) || bh.t <= 0) { bh.phase = 2; bh.t = rnd(0.9, 3.4); if (Math.random() < 0.3) emote(Math.random() < 0.5 ? "sniff" : "curious"); }
        } else { halt(); if (bh.t <= 0 && !M.busy) bh.phase = 0; }
      },

      // trots beside / behind the player, waits when they stop
      follow(dt) {
        const ps = Math.sin(P.yaw), pc = Math.cos(P.yaw), rx = pc, rz = -ps;
        const lat = (M.x - P.x) * rx + (M.z - P.z) * rz;
        if (lat > 0.5) bh.side = 1; else if (lat < -0.5) bh.side = -1;
        const pd = distP(), pSpeed = P.speed || 0;
        if (pSpeed < 0.25 && pd < bh.dist + 0.9) {
          const fy = yawToPlayer();
          halt(Math.abs(wrap(fy - M.yaw)) > 0.7 ? fy : NaN);
          bh.t2 += dt;
          if (bh.t2 > bh.t && !M.busy) {
            bh.t2 = 0; bh.t = rnd(4, 8);
            const r = Math.random();
            if (r < 0.35) emote("curious"); else if (r < 0.55) emote("sniff"); else if (r < 0.8) basePose = "sit"; else glanceAtPlayer(2);
          }
          return;
        }
        if (basePose === "sit") basePose = M.hurt ? "limp" : null;
        bh.t2 = 0;
        const sx = P.x - ps * bh.dist * 0.85 + rx * bh.side * bh.sideOff, sz = P.z - pc * bh.dist * 0.85 + rz * bh.side * bh.sideOff;
        const d = dist(sx, sz);
        if (d < 0.22 && pSpeed < 0.4) { halt(); return; }
        mv.warp = pd > 14;
        go(sx, sz, clamp(Math.max(WALK * 0.9, pSpeed * 1.03) + (d - 0.4) * 1.7, 0.6, RUN), pSpeed < 1.2 && d > 2);
      },

      goto() {
        mv.warp = true;
        if (bh.phase === 0) { if (travel(bh.x, bh.z, bh.run ? RUN : WALK, 0.2, !bh.run)) bh.phase = 1; }
        else if (bh.phase === 1) { if (isNaN(bh.yaw) || faceTo(bh.yaw)) { bh.phase = 2; emit("arrived"); } }
        else halt(bh.yaw);
      },

      // runs ahead point by point, waits and calls when the player falls behind
      lead(dt) {
        if (bh.done) { halt(yawToPlayer()); return; }
        const pt = bh.route[bh.i];
        const pd = distP();
        mv.keep = 0.35;
        if (dist(pt.x, pt.z) < 0.6) {
          halt(yawToPlayer());
          force = 1;
          if (Math.hypot(P.x - pt.x, P.z - pt.z) < 1.6) {
            emit("checkpoint", bh.i);
            bh.i++; bh.t = 0; bh.next = rnd(1.6, 2.6); bh.waiting = false; bobV += 2;
            if (bh.i >= bh.route.length) { bh.done = true; emit("arrived"); }
          } else {
            bh.t += dt;
            if (bh.t > bh.next && !M.busy) { bh.t = 0; bh.next = rnd(2.8, 4.4); emote("call"); }
          }
          return;
        }
        if (pd > bh.dist) bh.waiting = true; else if (pd < bh.dist * 0.6) bh.waiting = false;
        if (bh.waiting) {
          halt(yawToPlayer());
          force = 1;
          bh.t += dt;
          if (bh.t > bh.next && !M.busy) { bh.t = 0; bh.next = rnd(2.8, 4.4); emote("call"); }
          return;
        }
        bh.t = 0; bh.next = 0.5;
        mv.warp = true;
        go(pt.x, pt.z, bh.run ? RUN : WALK * 1.25, false);
      },

      sit() {
        const la = bh.o.lookAt;
        if (bh.phase === 0) {
          mv.warp = true;
          if (!bh.waiting || travel(bh.x, bh.z, WALK, 0.2, true)) bh.phase = 1;
          return;
        }
        let ty = yawToPlayer();
        if (la) { if (la.isObject3D) { la.getWorldPosition(forceV); ty = yawTo(forceV.x, forceV.z); force = 2; forceV.y += 0.2; } else { ty = yawTo(la.x, la.z); force = 2; forceV.set(la.x, typeof la.y === "number" ? la.y : floorAt(la.x, la.z) + 0.2, la.z); } }
        else if (!isNaN(bh.yaw)) ty = bh.yaw;
        else force = 1;
        mv.keep = 0;
        if (bh.phase === 1) { if (faceTo(ty, 0.2)) { bh.phase = 2; basePose = "sit"; emit("arrived"); } }
        else halt(Math.abs(wrap(ty - M.yaw)) > 1.1 ? ty : NaN);
      },

      sleep(dt) {
        mv.keep = 0;
        if (bh.phase === 0) { mv.warp = true; if (!bh.waiting || travel(bh.x, bh.z, WALK, 0.2, true)) bh.phase = 1; }
        else if (bh.phase === 1) { if (isNaN(bh.yaw) || faceTo(bh.yaw)) { bh.phase = 2; bh.t = 0; hear(); sfx("yawn"); bcall("setEyes", 0.15); } }
        else if (bh.phase === 2) { halt(bh.yaw); bh.t += dt; leanWant = -0.14 * Math.sin(Math.PI * clamp(bh.t / 1.4, 0, 1)); if (bh.t > 1.4) { bh.phase = 3; bh.t = 0; bcall("setEyes", null); setSleep(true); } }
        else if (bh.phase === 3) { halt(); noLook = true; bh.t += dt; if (bh.t > 1.3) { bh.phase = 4; emit("asleep"); } }
        else { halt(); noLook = true; }
      },

      // walks up, circles once sniffing, touches bills, play-bows
      greet(dt) {
        const pd = distP();
        force = 1;
        if (bh.phase === 0) {
          mv.warp = true; mv.keep = 0.9;
          const a = Math.atan2(M.x - P.x, M.z - P.z);
          if (travel(P.x + Math.sin(a) * 1.15, P.z + Math.cos(a) * 1.15, WALK * 1.2, 0.25, false)) { bh.phase = 1; bh.a = 0; bh.t = a; bh.t2 = 0; chirp("curious", 0.7); }
        } else if (bh.phase === 1) {
          mv.keep = 0.8; mv.slowIn = false;
          const ang = Math.atan2(M.x - P.x, M.z - P.z);
          bh.a += wrap(ang - bh.t); bh.t = ang;
          const lead = ang + bh.side * 0.9;
          go(P.x + Math.sin(lead) * 1.1, P.z + Math.cos(lead) * 1.1, WALK * 1.35, false);
          // nose low, snuffling at the stranger
          force = 2; forceV.set(P.x, P.y + 0.08, P.z);
          bh.t2 += dt;
          if (bh.t2 > 0.7) { bh.t2 = 0; bobV -= 1.5; chirp("curious", 0.35); }
          if (Math.abs(bh.a) >= TAU || pd > 4) { bh.phase = 2; bh.t = 0; }
        } else if (bh.phase === 2) {
          mv.warp = true; mv.keep = 0.6;
          if (travel(P.x + Math.sin(P.yaw) * 0.78, P.z + Math.cos(P.yaw) * 0.78, WALK * 1.2, 0.12, false)) bh.phase = 3;
        } else if (bh.phase === 3) {
          mv.keep = 0;
          if (faceTo(yawToPlayer(), 0.14)) {
            let d = bcall("nuzzle");
            if (!(d > 0)) { d = 1.4; bobV += 3; }
            hear(); sfx("nuzzle");
            endShot(); startShot("nuzzle", d, true);
            bh.phase = 4;
          }
        } else if (bh.phase === 4) {
          mv.keep = 0; halt();
          if (!M.busy) { emote("bow"); heartsNow(); bh.phase = 5; }
        } else if (bh.phase === 5) {
          mv.keep = 0; halt();
          if (!M.busy) { bh.phase = 6; chirp("greet"); emit("greeted"); }
        } else { mv.keep = 0.5; halt(Math.abs(wrap(yawToPlayer() - M.yaw)) > 0.8 ? yawToPlayer() : NaN); }
      },

      // fetches food item i and lays it at the player's feet
      feed(dt) {
        const i = bh.food;
        if (bh.phase === 0) {
          if (!food.active(i)) { bh.phase = 4; emit("fed", i); return; }
          mv.warp = true;
          if (food.carried(i) || travel(fX[i], fZ[i], WALK * 1.3, 0.3, false)) { bh.phase = 1; bh.t = 0; bobV -= 3; }
        } else if (bh.phase === 1) {
          halt();
          bh.t += dt;
          if (bh.t > 0.35) {
            const anchor = body ? body.holdAnchor || body.billTip : null;
            food.carry(i, anchor || mgroup);
            setCarry(true);
            bh.phase = 2;
          }
        } else if (bh.phase === 2) {
          mv.warp = true; mv.keep = 0.55;
          const a = Math.atan2(M.x - P.x, M.z - P.z);
          if (travel(P.x + Math.sin(a) * 0.95, P.z + Math.cos(a) * 0.95, Math.min(WALK * 1.2, 2), 0.16, false)) { bh.phase = 3; bh.t = 0; }
        } else if (bh.phase === 3) {
          mv.keep = 0;
          if (faceTo(yawToPlayer(), 0.2)) {
            bh.t += dt;
            if (bh.t > 0.25) {
              // set it down between the two of them, a nose-length from the player
              const d = distP() || 1;
              fX[i] = P.x + ((M.x - P.x) / d) * 0.42; fZ[i] = P.z + ((M.z - P.z) / d) * 0.42;
              food.carry(i, null);
              setCarry(false);
              bobV -= 4; chirp("happy", 0.6);
              bh.phase = 4;
              emit("fed", i);
            }
          }
        } else { halt(Math.abs(wrap(yawToPlayer() - M.yaw)) > 0.8 ? yawToPlayer() : NaN); force = 1; mv.keep = 0.5; }
      },

      // sits working: paws weaving, now and then pulls a vine tight with the bill
      craft(dt) {
        mv.keep = 0.4;
        if (bh.phase === 0) { mv.warp = true; if (!bh.waiting || travel(bh.x, bh.z, WALK, 0.2, false)) bh.phase = 1; return; }
        if (bh.phase === 1) { if (isNaN(bh.yaw) || faceTo(bh.yaw, 0.2)) { bh.phase = 2; basePose = "sit"; bh.t = 0.6; bh.t2 = rnd(4, 6); emit("arrived"); } return; }
        halt(bh.yaw);
        // eyes on the work, with a proud look up at whoever comes near
        if (distP() < 3 && Math.sin(clock * 0.5 + seed) > 0.72) force = 1;
        else { force = 2; forceV.set(M.x + Math.sin(M.yaw) * 0.42 + Math.sin(clock * 3.1) * 0.06, M.y + 0.2 + Math.sin(clock * 4.3) * 0.03, M.z + Math.cos(M.yaw) * 0.42); }
        bh.t -= dt; bh.t2 -= dt;
        if (bh.t <= 0) {
          bh.t = rnd(0.34, 0.6);
          bobV += (bh.n++ & 1 ? 1.5 : -1.5); tiltWant = (bh.n & 1 ? 0.07 : -0.07);
          if ((bh.n & 3) === 0 && distP() < 7) { hear(); sfx("craft", "weave"); }
        }
        if (bh.t2 <= 0 && !M.busy) {
          bh.t2 = rnd(4.5, 7.5);
          let d = bcall("nuzzle");
          if (!(d > 0)) d = 1.2;
          startShot("nuzzle", d, true);
          leanWant = -0.2;
          if (distP() < 7) { hear(); sfx("craft", "tie"); }
        }
        if (shotName === "nuzzle") leanWant = -0.22 * Math.sin(Math.PI * clamp(shotT / shotDur, 0, 1));
      },

      // circling the fire in the tribe's step: two shuffles and a hop, on the music's beats when it plays
      dance(dt) {
        mv.keep = 0.5; mv.slowIn = false;
        const b = beatNow(), bi = Math.floor(b), frac = b - bi;
        if (bi !== bh.beat) {
          bh.beat = bi;
          const k = ((bi % 4) + 4) % 4;
          if (k === 3) { hop(2.7); if (Math.random() < 0.3) chirp("cheer", 0.5); }
          else bobV += k === 0 ? 3.2 : 2.2;
          if (k === 0 && Math.random() < 0.22 && !M.busy) { bh.t2 = 0.5; }
        }
        // step forward on the beat, hang back between
        bh.a += dt * bh.side * (0.55 + 0.5 * Math.pow(1 - frac, 2)) * (WALK / Math.max(1.2, bh.radius));
        tiltWant = Math.sin(b * Math.PI) * 0.1;
        if (bh.t2 > 0) { bh.t2 -= dt; spin += dt * TAU * 2; if (bh.t2 <= 0) spin = 0; }
        const rr = bh.radius * (1 + Math.sin(b * Math.PI * 0.5 + seed) * 0.06);
        go(bh.cx + Math.sin(bh.a + bh.side * 0.35) * rr, bh.cz + Math.cos(bh.a + bh.side * 0.35) * rr, WALK * 1.25, false);
        force = 2; forceV.set(bh.cx, heightAt(bh.cx, bh.cz) + 0.5, bh.cz);
      },

      guard(dt) {
        mv.keep = 0.5;
        if (bh.phase === 0) { mv.warp = true; if (!bh.waiting || travel(bh.x, bh.z, WALK * 1.2, 0.2, false)) bh.phase = 1; return; }
        const base = isNaN(bh.yaw) ? M.yaw : bh.yaw;
        if (bh.phase === 1) { if (faceTo(base, 0.2)) { bh.phase = 2; emit("arrived"); } return; }
        halt(base);
        // a slow sweep of the tree line; a hard stare at anything close
        if (distP() < 2.5) force = 1;
        else { const a = base + Math.sin(clock * 0.45 + seed) * 0.95; force = 2; forceV.set(M.x + Math.sin(a) * 6, M.y + 0.35, M.z + Math.cos(a) * 6); }
        bh.t += dt;
        if (bh.t > bh.next && !M.busy) { bh.t = 0; bh.next = rnd(6, 11); emote("sniff"); }
      },

      // a hero ally: finds something to fight (opts.target, opts.enemies or tribe.enemies), darts in, stings, hops back
      fight(dt) {
        let t = bh.target;
        if (t && (t.alive === false || t.dead === true || t.down === true || t.hp <= 0)) t = bh.target = null;
        if (!t) {
          bh.t2 -= dt;
          if (bh.t2 <= 0) {
            bh.t2 = 0.3;
            const list = bh.o.enemies || tribe.enemies;
            let bd = 14;
            if (list) for (let i = 0; i < list.length; i++) {
              const e = list[i];
              if (!e || e.alive === false || e.dead === true || e.down === true || e.hp <= 0) continue;
              const d = dist(e.x, e.z);
              if (d < bd) { bd = d; t = e; }
            }
            bh.target = t;
          }
        }
        if (!t) {
          // nothing to fight: stay by the player, wound up
          const pd = distP();
          if (pd > 2.6) go(P.x, P.z, RUN, false); else halt(pd < 1 ? NaN : yawToPlayer());
          bh.phase = 0;
          return;
        }
        mv.keep = 0.4; mv.slowIn = false;
        force = 2; forceV.set(t.x, (t.y || M.y) + 0.5, t.z);
        const d = dist(t.x, t.z), reach = 0.75 + (t.r || t.radius || 0.3);
        bh.t -= dt;
        if (bh.phase === 0) {
          if (d > reach) go(t.x, t.z, RUN, false);
          else if (bh.t <= 0 && faceTo(yawTo(t.x, t.z), 0.35)) {
            let du = bcall("sting");
            if (!(du > 0)) { du = 0.5; bobV += 4; }
            hear(); sfx("sting");
            endShot(); startShot("strike", du, true);
            bh.phase = 1; bh.t = 1.2;
          } else halt(yawTo(t.x, t.z));
        } else if (bh.phase === 1) {
          halt(yawTo(t.x, t.z));
          if (!M.busy) { bh.phase = 2; bh.t3 = 0.45; hop(2.4); }
        } else {
          // hop back out of reach, then circle for the next opening
          bh.t3 -= dt;
          const a = Math.atan2(M.x - t.x, M.z - t.z) + bh.side * 0.7;
          go(t.x + Math.sin(a) * (reach + 1.1), t.z + Math.cos(a) * (reach + 1.1), RUN * 0.8, false);
          if (bh.t3 <= 0 && bh.t <= 0.5) bh.phase = 0;
        }
      },

      flee(dt) {
        mv.keep = 0.3;
        if (bh.phase === 0) {
          mv.warp = true; mv.slowIn = false;
          let tx = bh.x, tz = bh.z;
          if (!bh.waiting) { const a = Math.atan2(M.x - P.x, M.z - P.z); const c = confined(M.x + Math.sin(a) * 4, M.z + Math.cos(a) * 4); tx = c.x; tz = c.z; bh.t += dt; }
          if (travel(tx, tz, RUN, 0.35, false) || (!bh.waiting && bh.t > 3)) { bh.phase = 1; basePose = "scared"; emit("fled"); }
        } else { halt(); if (distP() < 5) force = 1; }
      },

      // hit: limps to the rear (opts.to, or well behind the player) and sits it out. Members never die on screen.
      hurt(dt) {
        mv.keep = 0.3;
        if (bh.phase === 0) {
          basePose = "limp";
          let tx = bh.x, tz = bh.z;
          if (!bh.waiting) { const c = confined(P.x - Math.sin(P.yaw) * 6, P.z - Math.cos(P.yaw) * 6); tx = c.x; tz = c.z; bh.x = tx; bh.z = tz; bh.waiting = true; chirp("scared", 0.8); }
          mv.warp = true;
          bh.t += dt;
          if (travel(tx, tz, 1.0, 0.4, false) || bh.t > 12) { bh.phase = 1; basePose = "sit"; overPose = "sad"; emit("rested"); }
        } else { halt(); if (distP() < 6) force = 1; }
      },

      // rears and makes THE call
      call() {
        if (bh.phase === 0) {
          halt();
          endShot();
          startShot("thecall", 1.7, true);
          bh.phase = 1;
        } else if (bh.phase === 1) {
          halt();
          if (!M.busy) { bh.phase = 2; emit("called"); }
        } else halt();
      },

      hide(dt) {
        if (bh.phase === 0) {
          mv.warp = true; mv.keep = 0.3;
          if (!bh.waiting || travel(bh.x, bh.z, RUN, 0.25, false)) { bh.phase = 1; bh.t = 0; }
        } else if (bh.phase === 1) {
          bh.t += dt; mv.keep = 0;
          if (isNaN(bh.yaw) || faceTo(bh.yaw, 0.2) || bh.t > 0.8) { bh.phase = 2; bh.t = 0; bh.next = rnd(2.5, 4); basePose = "scared"; emit("hidden"); }
        } else if (bh.phase === 2) {
          mv.keep = 0;
          halt();
          if (shotName === "peek") return;
          if (bh.t3 > 0) { bh.t3 = 0; basePose = "scared"; }
          noLook = true;
          bh.t += dt;
          if (bh.t > bh.next) {
            bh.t = 0; bh.next = rnd(4, 6);
            // the young one cannot help giggling - louder the nearer the seeker
            if (def.opts.young) { hear(); tribeChirp("giggle", clamp(1.12 - distP() / 12, 0.12, 1) / Math.max(earVol, 0.12), def.pitch); bh.t2 = 0.5; }
          }
          if (bh.t2 > 0) { bh.t2 -= dt; wiggle = Math.sin(clock * 34) * 0.03 * clamp(bh.t2 / 0.5, 0, 1); }
        } else if (bh.phase === 3) {
          mv.keep = 0; halt(yawToPlayer()); force = 1;
          bh.t += dt;
          if (bh.t > 0.9) { bh.phase = 4; emit("found"); }
        } else { halt(yawToPlayer()); force = 1; }
      },

      // head up over the cover, a look, and down again (when not hiding: a wary rise on the spot)
      peek() {
        if (bh.phase === 0) { halt(); endShot(); startShot("peek", 1.5, true); bh.phase = 1; }
        else halt();
      },

      still() { mv.keep = 0; noLook = true; halt(); },
    };

    function found() {
      if (bh.name !== "hide" || bh.phase >= 3) return false;
      basePose = null; bh.phase = 3; bh.t = 0; wiggle = 0;
      emote("happy");
      return true;
    }
    function heal() {
      M.hurt = false;
      overPose = null;
      if (basePose === "limp") basePose = null;
      if (bh.name === "hurt") doBehaviour("idle");
    }
    // ride on something (Nib on the player's back): parented to the anchor, sitting; null = back on its own feet
    function attachTo(obj, pose) {
      if (obj) {
        if (!attached) homeParent = mgroup.parent;
        doBehaviour("idle");
        attached = obj;
        endShot();
        obj.add(mgroup);
        mgroup.position.set(0, 0, 0);
        mgroup.rotation.set(0, 0, 0);
        M.speed = 0; M.vy = 0; M.grounded = true; M.swimming = false; M.pitch = M.roll = 0;
        basePose = pose === undefined ? "sit" : pose;
        M.behaviour = "attached";
        return;
      }
      if (!attached) return;
      attached.getWorldPosition(_v);
      attached = null;
      if (homeParent) homeParent.add(mgroup); else group.add(mgroup);
      homeParent = null;
      basePose = null;
      M.x = _v.x; M.z = _v.z; M.y = floorAt(_v.x, _v.z);
      bh.name = "idle"; M.behaviour = "idle"; bh.phase = 0; bh.t = 1;
      writeTransform();
    }

    function distTo(x, z) { return Math.hypot(x - M.x, z - M.z); }
    function place(x, z, yaw) {
      M.x = x; M.z = z;
      if (typeof yaw === "number") M.yaw = yaw;
      M.y = floorAt(x, z);
      M.vy = 0; M.grounded = true; M.speed = 0; M.pitch = 0; M.roll = 0;
      M.swimming = !!(world && world.swim) && waterAt(x, z) - 0.1 > heightAt(x, z) + 0.1;
      dogBest = Infinity; dogT = 0; detourT = 0; sampX = x; sampZ = z; sampT = 0;
      bob = bobX = bobV = 0;
      if (!M.placed) { M.placed = true; if (!want && !explicit) { want = true; build(); } refreshShown(); }
      if (!attached) writeTransform();
    }
    function writeTransform() {
      mgroup.position.set(M.x, M.y + lift * 0.11, M.z);
      mgroup.rotation.set(M.pitch + bob + lean - lift * 0.4, M.yaw + spin, M.roll + tilt + wiggle);
    }
    function reset() {
      if (attached) attachTo(null);
      evN = 0;
      endShot();
      shotName = null; M.busy = false;
      overPose = null; M.hurt = false;
      setSleep(false);
      setCarry(false);
      doBehaviour("idle");
      explicitLook = null; force = 0; noLook = false; glanceKind = 0; glanceT = 1;
      bcall("setEyes", null); bcall("lookAt", null);
      applyPose(true);
      M.speed = 0; M.vy = 0; M.grounded = true; M.pitch = 0; M.roll = 0; M.turn = 0; M.swimming = M.inWater = false;
      bob = bobX = bobV = lean = leanWant = tilt = tiltWant = wiggle = lift = liftWant = spin = 0;
      hesState = 0; hesT = rnd(2.5, 6);
      want = false; explicit = false; M.placed = false;
      setShown(false);
      if (mgroup.parent !== group) group.add(mgroup);
      writeTransform();
    }

    const anim = { speed: 0, maxSpeed: RUN, grounded: true, vy: 0, turn: 0, moving: false, time: 0, swimming: false, diving: false, carrying: false, inWater: false };
    // what a crowd stand-in should be doing right now
    M._standAnim = () => (sleeping ? "sleep" : M.speed > 2.2 ? "run" : M.speed > 0.15 ? "walk" : shotName === "cheer" ? "cheer" : shotName === "eat" ? "eat" : basePose === "sit" ? "sit" : basePose === "still" ? "down" : "idle");

    M._update = (dt) => {
      if (!want || !M.placed) return;
      mv.on = false; mv.face = NaN; mv.keep = 0.6; mv.casual = false; mv.warp = false; mv.slowIn = true;
      force = 0; noLook = false; leanWant = 0;
      if (shotName !== "peek" && shotName !== "thecall") liftWant = 0;
      if (attached) { noLook = true; M.speed = 0; attached.getWorldPosition(_v); M.x = _v.x; M.y = _v.y; M.z = _v.z; }
      else {
        BEHAVIOURS[bh.name](dt);
        tickShot(dt);
        alive(dt);
        if (bh.name === "still") { M.speed = 0; M.y += (floorAt(M.x, M.z) - M.y) * Math.min(1, dt * 10); }
        else locomote(dt, (M.busy && shotHold && shotName !== null) || sleeping);
      }
      bobV += (-bobX * 140 - bobV * 13) * dt;
      bobX += bobV * dt;
      bob = clamp(bobX * 0.3, -0.3, 0.3);
      lean += (leanWant - lean) * Math.min(1, dt * 8);
      tilt += (tiltWant - tilt) * Math.min(1, dt * 9);
      lift += (liftWant - lift) * Math.min(1, dt * 7);
      if (attached) mgroup.rotation.set(bob * 0.3, 0, tilt);
      else writeTransform();
      if (body && shown) {
        anim.speed = M.speed; anim.grounded = M.grounded; anim.vy = M.vy; anim.turn = M.turn;
        anim.moving = M.speed > 0.05; anim.time = clock + seed; anim.swimming = M.swimming; anim.inWater = M.inWater; anim.carrying = carrying;
        applyPose(false);
        body.update(dt, anim);
        updateLook(dt);
      }
      flushEvents();
    };

    doBehaviour("idle");
    return M;
  }

  for (let i = 0; i < MEMBER_KEYS.length; i++) {
    const m = createMember(MEMBER_KEYS[i], MEMBER_DEFS[MEMBER_KEYS[i]], i);
    members[MEMBER_KEYS[i]] = m;
    memberList.push(m);
  }

  // at most FOUR full models: the nearest wanted ones to the camera get them, the rest become crowd stand-ins
  const camV = new THREE.Vector3();
  const standOn = new Uint8Array(STAND_INS);
  const dropMask = new Uint8Array(32);
  let maxFull = 4;
  function refreshShown() {
    const cam = ctx.camera;
    if (cam && cam.position) camV.copy(cam.position); else camV.set(P.x, P.y, P.z);
    let n = 0;
    for (let i = 0; i < memberList.length; i++) if (memberList[i]._want()) n++;
    // the farthest are dropped (tribe.maxFull, default 4); a model already shown is kept unless clearly farther (no flicker)
    const cap = maxFull;
    const drops = dropMask; drops.fill(0);
    for (let k = n; k > cap; k--) {
      let worst = -1, drop = -1;
      for (let i = 0; i < memberList.length; i++) {
        const m = memberList[i];
        if (!m._want() || drops[i]) continue;
        const d = Math.hypot(m.x - camV.x, m.z - camV.z) + (m.shown ? 0 : 2.5);
        if (d > worst) { worst = d; drop = i; }
      }
      if (drop >= 0) drops[drop] = 1;
    }
    for (let i = 0; i < memberList.length; i++) {
      const m = memberList[i];
      // far away (another part of the map) a member is drawn by its cheap crowd stand-in, not the full model
      const far = m._want() && Math.hypot(m.x - camV.x, m.z - camV.z) > (m.shown ? 40 : 36);
      const show = m._want() && !drops[i] && !far;
      if (show !== m.shown) m._setShown(show);
      const stand = m._want() && !show;
      if (!stand && standOn[i]) { standOn[i] = 0; if (standCrowd) standCrowd.hide(i); }
    }
  }
  function updateStandIns() {
    for (let i = 0; i < memberList.length; i++) {
      const m = memberList[i];
      if (!m._want() || m.shown) continue;
      const c = getStandCrowd(), slot = i;
      c.set(slot, m.x, m.y, m.z, m.yaw, m.def.standScale, m.def.fur);
      const a = m._standAnim();
      if (standOn[i] !== 1 || m._standName !== a) { m._standName = a; c.anim(slot, a, i * 0.37); c.paint(slot, m.def.paint || null); c.fade(slot, 1); }
      standOn[i] = 1;
    }
  }

  // ================================================================ THE VILLAGE (the many)
  const N = VILLAGE_MAX;
  const vX = new Float32Array(N), vY = new Float32Array(N), vZ = new Float32Array(N), vYaw = new Float32Array(N);
  const vHX = new Float32Array(N), vHZ = new Float32Array(N), vHYaw = new Float32Array(N), vKind = new Uint8Array(N);
  const vTX = new Float32Array(N), vTZ = new Float32Array(N), vTYaw = new Float32Array(N), vSpd = new Float32Array(N);
  const vMoving = new Uint8Array(N), vFace = new Uint8Array(N); // vFace: 0 keep tYaw, 1 the look target / player, 2 the centre, 3 away from the centre
  const vScale = new Float32Array(N), vTint = new Int32Array(N), vYoung = new Uint8Array(N), vPhase = new Float32Array(N);
  const vDelay = new Float32Array(N).fill(-1), vLife = new Float32Array(N), vWave = new Float32Array(N).fill(-1), vBurst = new Float32Array(N);
  const vFade = new Float32Array(N), vFadeT = new Float32Array(N), vGather = new Uint8Array(N), vOut = new Uint8Array(N), vPaint = new Uint8Array(N);
  const vAnim = new Array(N).fill(""), vRest = new Array(N).fill("idle");
  const KIND = { idle: 0, sit: 1, sleep: 2, eat: 3, work: 4 };
  const REST_BY_KIND = ["idle", "sit", "sleep", "eat", "eat"];
  let vTotal = 0, vCount = 0, mood = "calm", cenX = 0, cenZ = 0, gX = 0, gZ = 0, gR = 3, gOn = false, vLook = null, warT = 0;
  const lookP = { x: 0, z: 0 };
  function lookPoint() {
    const t = vLook;
    if (t && t.isObject3D) { t.getWorldPosition(_v); lookP.x = _v.x; lookP.z = _v.z; }
    else if (t) { lookP.x = t.x || 0; lookP.z = t.z || 0; }
    else { lookP.x = P.x; lookP.z = P.z; }
    return lookP;
  }
  function vSetAnim(i, name) {
    if (vAnim[i] === name) return;
    vAnim[i] = name;
    getCrowd().anim(i, name, vPhase[i]);
  }
  function vWrite(i) { getCrowd().set(i, vX[i], vY[i], vZ[i], vYaw[i], vScale[i], vTint[i]); }
  function vGo(i, x, z, yaw, run, rest, face) {
    vTX[i] = x; vTZ[i] = z; vTYaw[i] = yaw; vSpd[i] = (run ? 3.1 : 1.15) * (vYoung[i] ? 1.15 : 1) * (0.85 + hash(i, 5) * 0.3);
    vRest[i] = rest; vFace[i] = face || 0;
    vMoving[i] = Math.hypot(x - vX[i], z - vZ[i]) > 0.12 ? 1 : 0;
  }
  function vPaintSet(i, on) {
    if (vPaint[i] === (on ? 1 : 0)) return;
    vPaint[i] = on ? 1 : 0;
    getCrowd().paint(i, on ? TRIBE_LOOKS.war.paint : null);
  }
  // what agent i does in the current mood
  function vApply(i) {
    if (vGather[i]) return;
    const lp = lookPoint();
    vOut[i] = 0;
    vPaintSet(i, mood === "war" && !vYoung[i]);
    switch (mood) {
      case "curious": {
        // the nearest dozen creep a metre closer; everyone turns to look
        let nearer = 0;
        const d = Math.hypot(vX[i] - lp.x, vZ[i] - lp.z);
        for (let j = 0; j < vCount; j++) if (j !== i && Math.hypot(vX[j] - lp.x, vZ[j] - lp.z) < d) nearer++;
        if (nearer < 12 && d > 2.6) vGo(i, vX[i] + ((lp.x - vX[i]) / d) * 1, vZ[i] + ((lp.z - vZ[i]) / d) * 1, 0, false, "idle", 1);
        else vGo(i, vX[i], vZ[i], 0, false, vKind[i] === KIND.sit ? "sit" : "idle", 1);
        break;
      }
      case "cheer": vGo(i, vX[i], vZ[i], 0, false, "cheer", 1); break;
      case "feast": {
        const cx = gOn ? gX : village.fire ? village.fire.x : cenX, cz = gOn ? gZ : village.fire ? village.fire.z : cenZ;
        const ring = i % 3, a = i * 2.39996 + ring, r = 2.3 + ring * 0.95 + hash(i, 2) * 0.4;
        vGo(i, cx + Math.sin(a) * r, cz + Math.cos(a) * r, a + Math.PI, false, i % 4 === 3 ? "sit" : "eat", 0);
        break;
      }
      case "sleep": {
        // curl up in clusters round the sleeping places
        let bx = vHX[i], bz = vHZ[i], bd = Infinity;
        for (let j = 0; j < vTotal; j++) if (vKind[j] === KIND.sleep) { const d = Math.hypot(vHX[j] - vHX[i], vHZ[j] - vHZ[i]); if (d < bd) { bd = d; bx = vHX[j]; bz = vHZ[j]; } }
        const a = i * 2.39996, r = bd === 0 ? 0 : 0.5 + (i % 3) * 0.32;
        vGo(i, bx + Math.sin(a) * r, bz + Math.cos(a) * r, a + 1.2, false, "sleep", 0);
        break;
      }
      case "alarm": {
        if (vYoung[i]) {
          // the young ones run for the burrows and are gone
          const list = village.burrows;
          let bx = vHX[i], bz = vHZ[i];
          if (list && list.length) { let bd = Infinity; for (let j = 0; j < list.length; j++) { const d = Math.hypot(list[j].x - vX[i], list[j].z - vZ[i]); if (d < bd) { bd = d; bx = list[j].x; bz = list[j].z; } } vOut[i] = 1; }
          vGo(i, bx + (hash(i, 7) - 0.5) * 0.6, bz + (hash(i, 8) - 0.5) * 0.6, 0, true, "sit", 1);
        } else {
          // the grown ones make a line between the camp and the danger
          const t = village.threat || lp;
          let dx = t.x - cenX, dz = t.z - cenZ;
          const d = Math.hypot(dx, dz) || 1;
          dx /= d; dz /= d;
          let rank = 0;
          for (let j = 0; j < i; j++) if (!vYoung[j]) rank++;
          const off = (((rank + 1) >> 1) * (rank & 1 ? 1 : -1)) * 0.78, row = rank % 5 === 4 ? 0.9 : 0;
          const ld = Math.min(d * 0.5, 5.5) - row;
          vGo(i, cenX + dx * ld - dz * off, cenZ + dz * ld + dx * off, Math.atan2(dx, dz), true, "idle", 0);
        }
        break;
      }
      case "war": vGo(i, vX[i], vZ[i], Math.atan2(vX[i] - cenX, vZ[i] - cenZ), false, vYoung[i] ? "sit" : "idle", 0); break;
      case "mourn": vGo(i, vX[i], vZ[i], Math.atan2(cenX - vX[i], cenZ - vZ[i]), false, "sit", 0); break;
      default: vGo(i, vHX[i], vHZ[i], vHYaw[i], false, REST_BY_KIND[vKind[i]], 0); vLife[i] = rnd(3, 14); break;
    }
  }
  const village = {
    max: N,
    fire: null, // { x, z }: where a feast gathers (default: the middle of the spots)
    burrows: null, // [{ x, z }]: where the young ones run on "alarm" (default: their own spots)
    threat: null, // { x, z }: where the danger is on "alarm" (default: the look target / the player)
    get mood() { return mood; },
    get count() { return vCount; },
    get total() { return vTotal; },
    get center() { lookP.x = cenX; lookP.z = cenZ; return lookP; },
    populate(spots) {
      const c = getCrowd();
      vTotal = Math.min(N, spots ? spots.length : 0);
      cenX = cenZ = 0;
      for (let i = 0; i < N; i++) {
        if (i >= vTotal) { c.hide(i); vFade[i] = vFadeT[i] = 0; continue; }
        const s = spots[i];
        vHX[i] = s.x; vHZ[i] = s.z; vHYaw[i] = typeof s.yaw === "number" ? s.yaw : hash(i, 1) * TAU;
        vKind[i] = KIND[s.kind] === undefined ? 0 : KIND[s.kind];
        vYoung[i] = i % 5 === 4 && vKind[i] !== KIND.work ? 1 : 0;
        vScale[i] = vYoung[i] ? 0.5 + hash(i, 3) * 0.12 : 0.82 + hash(i, 3) * 0.23;
        vTint[i] = TRIBE_LOOKS.home.furs[Math.floor(hash(i, 4) * TRIBE_LOOKS.home.furs.length) % TRIBE_LOOKS.home.furs.length];
        vPhase[i] = hash(i, 6);
        vX[i] = vHX[i]; vZ[i] = vHZ[i]; vYaw[i] = vHYaw[i]; vY[i] = floorAt(vX[i], vZ[i]);
        vMoving[i] = 0; vGather[i] = 0; vOut[i] = 0; vDelay[i] = -1; vWave[i] = -1; vBurst[i] = 0; vPaint[i] = 2; vAnim[i] = "";
        vFade[i] = vFadeT[i] = 1;
        cenX += s.x; cenZ += s.z;
        c.fade(i, 1);
        vPaintSet(i, false);
      }
      if (vTotal) { cenX /= vTotal; cenZ /= vTotal; }
      vCount = vTotal;
      mood = "calm"; gOn = false; vLook = null;
      for (let i = 0; i < vTotal; i++) { vApply(i); vSetAnim(i, vRest[i]); vWrite(i); }
    },
    setMood(name, seconds) {
      if (MOODS.indexOf(name) < 0) name = "calm";
      mood = name;
      const sec = seconds === undefined ? 1 : Math.max(0, seconds);
      for (let i = 0; i < vTotal; i++) vDelay[i] = hash(i, 11 + clock) * sec;
      if (sec === 0) for (let i = 0; i < vTotal; i++) { vDelay[i] = -1; vApply(i); }
    },
    // the n nearest (default: everyone) come and stand in rings round a point, facing in
    gather(x, z, radius, n) {
      gX = x; gZ = z; gR = radius > 0 ? radius : 3; gOn = true;
      const want = n > 0 ? Math.min(n, vCount) : vCount;
      for (let i = 0; i < vTotal; i++) vGather[i] = 0;
      for (let k = 0; k < want; k++) {
        let best = -1, bd = Infinity;
        for (let i = 0; i < vCount; i++) { if (vGather[i]) continue; const d = Math.hypot(vX[i] - x, vZ[i] - z); if (d < bd) { bd = d; best = i; } }
        if (best < 0) break;
        const a = k * 2.39996, r = gR * (0.5 + 0.5 * Math.sqrt((k + 0.5) / want));
        vOut[best] = 0;
        vGo(best, x + Math.sin(a) * r, z + Math.cos(a) * r, a + Math.PI, bd > 9, mood === "feast" ? "eat" : mood === "cheer" ? "cheer" : mood === "mourn" || mood === "sleep" ? "sit" : "idle", 2);
        vGather[best] = 1;
      }
    },
    disperse() {
      gOn = false;
      for (let i = 0; i < vTotal; i++) if (vGather[i]) { vGather[i] = 0; vDelay[i] = hash(i, 13) * 1.2; }
    },
    // level 10's losses and level 11's growth: the last ones slip away / new ones are simply there
    setCount(n) {
      n = clamp(n | 0, 0, vTotal);
      for (let i = 0; i < vTotal; i++) vFadeT[i] = i < n ? 1 : 0;
      vCount = n;
    },
    lookAt(target) {
      vLook = target || null;
      for (let i = 0; i < vCount; i++) if (!vMoving[i] && vRest[i] !== "sleep" && !vGather[i]) vFace[i] = target ? 1 : mood === "curious" || mood === "cheer" ? 1 : 0;
    },
    // a ripple of cheers travelling outward from a point (default: the player)
    wave(x, z) {
      if (typeof x !== "number") { x = P.x; z = P.z; }
      for (let i = 0; i < vCount; i++) vWave[i] = Math.hypot(vX[i] - x, vZ[i] - z) / 7 + hash(i, 17) * 0.12;
    },
    pos(i, out) { out.x = vX[i]; out.y = vY[i]; out.z = vZ[i]; return out; },
    hide() { for (let i = 0; i < vTotal; i++) { vFade[i] = vFadeT[i] = 0; if (crowd) crowd.hide(i); } vCount = 0; },
    clear() {
      if (crowd) for (let i = 0; i < N; i++) crowd.hide(i);
      vTotal = vCount = 0; mood = "calm"; gOn = false; vLook = null;
    },
  };
  function updateVillage(dt) {
    if (!vTotal) return;
    const c = getCrowd();
    const lp = lookPoint();
    if (mood === "war") {
      // now and then one of them rears and snaps at the air
      warT -= dt;
      if (warT <= 0 && vCount > 0) { warT = rnd(0.5, 1.4); const i = Math.floor(Math.random() * vCount); if (!vYoung[i] && !vMoving[i]) vBurst[i] = 0.9; }
    }
    for (let i = 0; i < vTotal; i++) {
      // fading in / out
      let write = false;
      if (vFade[i] !== vFadeT[i]) {
        const was = vFade[i], d = vFadeT[i] - was, st = dt / 1.5;
        vFade[i] = Math.abs(d) <= st ? vFadeT[i] : was + Math.sign(d) * st;
        if (vFade[i] <= 0) { c.hide(i); continue; }
        if (was <= 0) { vAnim[i] = ""; write = true; } // back from nothing: the crowd slot needs its pose and place again
        c.fade(i, vFade[i]);
      }
      if (vFade[i] <= 0) continue;
      if (vDelay[i] >= 0) { vDelay[i] -= dt; if (vDelay[i] < 0) vApply(i); }
      if (vMoving[i]) {
        const dx = vTX[i] - vX[i], dz = vTZ[i] - vZ[i], d = Math.hypot(dx, dz);
        const step = vSpd[i] * dt;
        const wy = Math.atan2(dx, dz);
        vYaw[i] += clamp(wrap(wy - vYaw[i]), -6 * dt, 6 * dt);
        if (d <= step || d < 0.06) {
          vX[i] = vTX[i]; vZ[i] = vTZ[i]; vMoving[i] = 0;
          if (vOut[i]) { vFadeT[i] = 0; }
        } else {
          // waddle along the heading (not straight at the target) so turns look like turns
          const k = Math.max(0.25, Math.cos(wrap(wy - vYaw[i])));
          vX[i] += Math.sin(vYaw[i]) * step * k; vZ[i] += Math.cos(vYaw[i]) * step * k;
        }
        vY[i] = floorAt(vX[i], vZ[i]);
        vSetAnim(i, vSpd[i] > 2.2 ? "run" : "walk");
        write = true;
      } else {
        // at rest: face what it should, keep off the player's toes, and live a little
        let fy = vTYaw[i];
        if (vFace[i] === 1) fy = Math.atan2(lp.x - vX[i], lp.z - vZ[i]);
        else if (vFace[i] === 2) fy = Math.atan2(gX - vX[i], gZ - vZ[i]);
        const dy = wrap(fy - vYaw[i]);
        if (dy > 0.02 || dy < -0.02) { vYaw[i] += clamp(dy, -3.2 * dt, 3.2 * dt); write = true; }
        const px = vX[i] - P.x, pz = vZ[i] - P.z, pd2 = px * px + pz * pz;
        if (pd2 < 0.42 && pd2 > 1e-5 && !P.hidden) { const pd = Math.sqrt(pd2), push = Math.min(0.65 - pd, 1.4 * dt); vX[i] += (px / pd) * push; vZ[i] += (pz / pd) * push; vY[i] = floorAt(vX[i], vZ[i]); write = true; }
        let a = vRest[i];
        if (vWave[i] >= 0) { vWave[i] -= dt; if (vWave[i] < 0) vBurst[i] = 1.25; }
        if (vBurst[i] > 0) { vBurst[i] -= dt; a = mood === "war" ? "attack" : "cheer"; }
        vSetAnim(i, a);
        if (mood === "calm" && !vGather[i] && vDelay[i] < 0) {
          vLife[i] -= dt;
          if (vLife[i] <= 0) {
            const home = Math.hypot(vX[i] - vHX[i], vZ[i] - vHZ[i]) < 0.3;
            if (!home) { vGo(i, vHX[i], vHZ[i], vHYaw[i], false, REST_BY_KIND[vKind[i]], 0); vLife[i] = rnd(5, 16); }
            else if (vYoung[i] && vKind[i] !== KIND.sleep) {
              // the young ones tumble about: short dashes round home
              const an = Math.random() * TAU, r = rnd(1.2, 3.4);
              vGo(i, vHX[i] + Math.sin(an) * r, vHZ[i] + Math.cos(an) * r, an, true, "idle", 0); vLife[i] = rnd(0.6, 2.2);
            } else if (vKind[i] === KIND.idle) {
              const an = Math.random() * TAU, r = rnd(0.8, 2.4);
              vGo(i, vHX[i] + Math.sin(an) * r, vHZ[i] + Math.cos(an) * r, an, false, Math.random() < 0.35 ? "sit" : "idle", 0); vLife[i] = rnd(4, 10);
            } else { vTYaw[i] = vHYaw[i] + rnd(-0.5, 0.5); vLife[i] = rnd(6, 18); }
          }
        }
      }
      if (write) vWrite(i);
    }
  }

  // ================================================================ the tribe
  function setWorld(w) { world = w || null; }
  function update(dt, time) {
    if (!(dt > 0)) dt = 0;
    clock = typeof time === "number" ? time : clock + dt;
    for (let i = 0; i < memberList.length; i++) memberList[i]._update(dt);
    shownT -= dt;
    if (shownT <= 0) { shownT = 0.5; refreshShown(); }
    updateStandIns();
    updateVillage(dt);
    updateFood(dt);
    updateMaterials(dt);
    updateBench(dt);
    if (crowd) { crowd.update(dt, clock); crowd.commit(); }
    if (standCrowd) { standCrowd.update(dt, clock); standCrowd.commit(); }
  }
  function reset() {
    for (let i = 0; i < memberList.length; i++) memberList[i].reset();
    for (let i = 0; i < STAND_INS; i++) { standOn[i] = 0; if (standCrowd) standCrowd.hide(i); }
    village.clear();
    village.fire = village.burrows = village.threat = null;
    food.clear();
    materials.clear();
    bench.reset();
    benchGroup.visible = false;
    matShow();
    tribe.enemies = null;
  }

  const tribe = {
    // how many members may be full models at once (the rest are crowd stand-ins)
    get maxFull() { return maxFull; },
    set maxFull(v) { maxFull = Math.max(1, v | 0); },
    group, members, village, food, materials, bench,
    list: memberList,
    enemies: null, // optional: what a member in "fight" looks through when it has no target (combat.enemies)
    LOOKS: TRIBE_LOOKS,
    setWorld, update, reset,
    // the full models and the crowd, built now (behind the title card) rather than at the first visible = true
    warm() { for (let i = 0; i < memberList.length; i++) memberList[i].body; getCrowd(); getStandCrowd(); },
  };
  return tribe;
}
