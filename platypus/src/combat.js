// combat.js — hostile humans, rival platypuses, ally fighters, projectiles (LEVELS2.md B5).
//   createCombat(ctx) -> combat      (shared key "combat")
//
// Rendering: every human is SEGMENT-INSTANCED. Eight InstancedMeshes (torso, hips, head + headgear,
// upper arm, forearm + hand, thigh, shin + boot, prop) are shared by all 24 human slots; each segment
// gets its matrix from a small analytic rig (walk / run / aim / grab / stagger / fall / lie / carry).
// One material for all of them (Lambert + per-instance colours, variant bit masks, screen-door fade,
// glass rim glow, hit flash). + 1 instanced blob shadow, + 1 instanced vision-cone fan,
// + the platypus crowd of B3 (allies and rivals share one crowd of 56).
// No DOM, no listeners, no per-frame allocations.

import * as PLAT from "./platypus.js";

const PI = Math.PI, TAU = PI * 2, HALF_PI = PI / 2;
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function sstep(a, b, v) { v = clamp((v - a) / (b - a), 0, 1); return v * v * (3 - 2 * v); }
function wrapPi(a) { while (a > PI) a -= TAU; while (a < -PI) a += TAU; return a; }
function rnd(a, b) { return a + Math.random() * (b - a); }
function NOOP() {}
// hide instances i0..i1-1: zero scale, but keep m[15] = 1 so the collapsed vertices stay finite
function zeroMats(arr, i0, i1) {
  arr.fill(0, i0 * 16, i1 * 16);
  for (let i = i0; i < i1; i++) arr[i * 16 + 15] = 1;
}
const EMPTY = [];

const H_MAX = 24;        // human slots (alive + bodies)
const CROWD_MAX = 56;    // allies (<= 40) + rivals (<= 16) in one platypus crowd
const ALLY_MAX = 40;
const CONE_MAX = 12;
const BLOB_MAX = 64;
const SHOT_MAX = 24;
const STAGGER_HP = 34;   // below this an enemy is staggered (see the header note in the report)
const CONE_HALF = (38 * PI) / 180;
const GRAB_R = 1.2;
const FIRE_RANGE = 21;
const TOO_CLOSE = 2.0;   // ranged enemies cannot aim at a target this close

// kind table. variant = bit index used by the geometry masks.
const KINDS = {
  guard: { hp: 60, human: true, melee: true, ranged: false, senses: true, range: 9, walk: 1.2, chase: 2.7, windup: 0.6, cones: true, variant: 0, gun: null },
  handler: { hp: 60, human: true, melee: true, ranged: false, senses: true, range: 9, walk: 1.25, chase: 2.7, windup: 0.6, cones: true, variant: 1, gun: null },
  soldier: { hp: 80, human: true, melee: false, ranged: true, senses: true, range: 13, walk: 1.3, chase: 2.4, windup: 0.6, cones: false, variant: 2, gun: "rifle", burst: 3, gap: 0.11 },
  officer: { hp: 80, human: true, melee: false, ranged: true, senses: true, range: 13, walk: 1.25, chase: 2.2, windup: 0.6, cones: false, variant: 3, gun: "pistol", burst: 2, gap: 0.2 },
  dreamSoldier: { hp: 68, human: true, melee: true, ranged: false, senses: false, range: 0, walk: 0.9, chase: 1.45, windup: 1.1, cones: false, variant: 4, gun: null },
  rival: { hp: 40, human: false, melee: true, ranged: false, senses: false, range: 9, walk: 1.5, chase: 3.3, windup: 0.6, cones: false, variant: -1, gun: null },
};

const SKIN = [0xf1c9a8, 0xe3b28c, 0xc99468, 0xa87449, 0x7c4f30, 0x5a3922];
const DEFAULT_LOOKS = {
  home: { furs: [0x5a3d28, 0x6b4a30, 0x4a3222, 0x7a5a3a, 0x8a6b46, 0x54402e], paint: null },
  rival: { furs: [0x7d7f84, 0x6a6c70, 0x8e9094, 0x5c5e62], paint: 0xb3261e },
  war: { paint: 0xf2efe6 },
};

// ------------------------------------------------------------------------------------------------
// tiny mesher: lofts of elliptical rings (bottom -> top, outward winding) and flat boxes, with
// per-vertex colour, colour slot (0 = instance colour A, 1 = instance colour B, 2 = fixed, 3 = glow)
// and a variant bit mask (the vertex shader collapses parts whose mask lacks the instance's bit).

function makeMesher(THREE) {
  const pos = [], col = [], meta = [], idx = [];
  let n = 0, xf = null;
  const tmp = new THREE.Vector3(), c = new THREE.Color();
  function rgb(v) {
    if (typeof v === "number") { c.setHex(v); return [c.r, c.g, c.b]; }
    return v || [1, 1, 1];
  }
  function vert(x, y, z, k, slot, mask) {
    tmp.set(x, y, z);
    if (xf) tmp.applyMatrix4(xf);
    pos.push(tmp.x, tmp.y, tmp.z); col.push(k[0], k[1], k[2]); meta.push(slot, mask);
    return n++;
  }
  // rings: [cx, y, cz, rx, rz]; capB / capT: undefined = open, number = apex offset in y
  function loft(rings, sides, color, slot, mask, capB, capT) {
    const k = rgb(color), base = n, nr = rings.length;
    for (let i = 0; i < nr; i++) {
      const r = rings[i];
      for (let j = 0; j < sides; j++) {
        const a = (j / sides) * TAU + 0.5 * (TAU / sides);
        vert(r[0] + r[3] * Math.cos(a), r[1], r[2] + r[4] * Math.sin(a), k, slot, mask);
      }
    }
    for (let i = 0; i < nr - 1; i++) {
      for (let j = 0; j < sides; j++) {
        const j2 = (j + 1) % sides;
        const a = base + i * sides + j, b = base + (i + 1) * sides + j;
        const cc = base + i * sides + j2, d = base + (i + 1) * sides + j2;
        idx.push(a, b, cc, b, d, cc);
      }
    }
    if (capB !== undefined) {
      const r = rings[0];
      const ci = vert(r[0], r[1] + capB, r[2], k, slot, mask);
      for (let j = 0; j < sides; j++) idx.push(ci, base + j, base + ((j + 1) % sides));
    }
    if (capT !== undefined) {
      const r = rings[nr - 1], top = base + (nr - 1) * sides;
      const ci = vert(r[0], r[1] + capT, r[2], k, slot, mask);
      for (let j = 0; j < sides; j++) idx.push(ci, top + ((j + 1) % sides), top + j);
    }
  }
  const FACES = [
    [1, 0, 0, 0, 1, 0, 0, 0, 1], [-1, 0, 0, 0, 0, 1, 0, 1, 0],
    [0, 1, 0, 0, 0, 1, 1, 0, 0], [0, -1, 0, 1, 0, 0, 0, 0, 1],
    [0, 0, 1, 1, 0, 0, 0, 1, 0], [0, 0, -1, 0, 1, 0, 1, 0, 0],
  ];
  function box(cx, cy, cz, sx, sy, sz, color, slot, mask) {
    const k = rgb(color), hx = sx / 2, hy = sy / 2, hz = sz / 2;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const nx = F[0] * hx, ny = F[1] * hy, nz = F[2] * hz;
      const ux = F[3] * hx, uy = F[4] * hy, uz = F[5] * hz;
      const vx = F[6] * hx, vy = F[7] * hy, vz = F[8] * hz;
      const a = vert(cx + nx - ux - vx, cy + ny - uy - vy, cz + nz - uz - vz, k, slot, mask);
      vert(cx + nx + ux - vx, cy + ny + uy - vy, cz + nz + uz - vz, k, slot, mask);
      vert(cx + nx + ux + vx, cy + ny + uy + vy, cz + nz + uz + vz, k, slot, mask);
      vert(cx + nx - ux + vx, cy + ny - uy + vy, cz + nz - uz + vz, k, slot, mask);
      idx.push(a, a + 1, a + 2, a, a + 2, a + 3);
    }
  }
  function finish() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("aMeta", new THREE.Float32BufferAttribute(meta, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  return { loft, box, finish, setXf(m) { xf = m; }, get tris() { return idx.length / 3; } };
}

const ALL = 31, HUMAN = 15;          // variant masks: bits 0 guard, 1 handler, 2 soldier, 3 officer, 4 dream
const B_GUARD = 1, B_HANDLER = 2, B_SOLDIER = 4, B_OFFICER = 8, B_DREAM = 16;
const g = (v) => [v, v, v];

function buildTorso(THREE) {
  const m = makeMesher(THREE);
  m.loft([[0, 0, 0, 0.15, 0.105], [0, 0.1, 0, 0.15, 0.108], [0, 0.22, 0.005, 0.168, 0.118], [0, 0.34, 0.01, 0.19, 0.126],
    [0, 0.43, 0.005, 0.2, 0.115], [0, 0.48, 0, 0.15, 0.095], [0, 0.515, 0, 0.062, 0.06]], 10, null, 0, ALL, undefined, 0.02);
  // guard: braces over the striped shirt
  for (let s = -1; s <= 1; s += 2) {
    m.box(s * 0.08, 0.27, 0.124, 0.03, 0.4, 0.012, null, 1, B_GUARD);
    m.box(s * 0.08, 0.27, -0.118, 0.03, 0.4, 0.012, null, 1, B_GUARD);
  }
  // handler: chest pockets, a satchel on the hip with its strap
  m.box(0.085, 0.33, 0.128, 0.075, 0.07, 0.014, g(0.82), 0, B_HANDLER);
  m.box(-0.085, 0.33, 0.128, 0.075, 0.07, 0.014, g(0.82), 0, B_HANDLER);
  m.box(0.19, 0.04, -0.01, 0.07, 0.17, 0.19, null, 1, B_HANDLER);
  m.box(0.0, 0.3, 0.132, 0.05, 0.36, 0.01, g(0.85), 1, B_HANDLER);
  // soldier: load-bearing vest, pouches, backpack with a bedroll
  m.loft([[0, 0.13, 0.004, 0.176, 0.126], [0, 0.24, 0.008, 0.184, 0.133], [0, 0.4, 0.008, 0.2, 0.136]], 10, null, 1, B_SOLDIER);
  m.box(0, 0.12, 0.128, 0.27, 0.085, 0.045, g(0.85), 1, B_SOLDIER);
  m.box(0, 0.27, -0.185, 0.25, 0.3, 0.12, g(0.9), 1, B_SOLDIER);
  m.box(0, 0.445, -0.185, 0.28, 0.07, 0.09, g(1.15), 1, B_SOLDIER);
  // officer: collar, shoulder boards, belt strap, buttons
  m.loft([[0, 0.47, 0.002, 0.082, 0.08], [0, 0.515, 0.002, 0.074, 0.072]], 8, g(0.8), 0, B_OFFICER);
  m.box(0.165, 0.468, 0, 0.075, 0.016, 0.065, null, 1, B_OFFICER);
  m.box(-0.165, 0.468, 0, 0.075, 0.016, 0.065, null, 1, B_OFFICER);
  m.box(0.06, 0.26, 0.127, 0.03, 0.42, 0.01, null, 1, B_OFFICER);
  for (let i = 0; i < 2; i++) m.box(0, 0.16 + i * 0.16, 0.128, 0.02, 0.02, 0.012, 0xc9a94a, 2, B_OFFICER);
  return m;
}

function buildHips(THREE) {
  const m = makeMesher(THREE);
  m.loft([[0, -0.11, 0, 0.085, 0.075], [0, -0.05, 0, 0.15, 0.108], [0, 0.03, 0, 0.155, 0.11], [0, 0.1, 0, 0.15, 0.106]], 10, null, 0, ALL, -0.03);
  m.loft([[0, 0.065, 0, 0.159, 0.114], [0, 0.11, 0, 0.158, 0.113]], 10, null, 1, ALL);
  m.box(0, 0.088, 0.114, 0.04, 0.04, 0.012, 0xb9a45a, 2, HUMAN);
  m.box(0.158, 0.02, 0.02, 0.05, 0.11, 0.1, null, 1, B_SOLDIER | B_OFFICER);
  m.box(-0.158, 0.02, 0.0, 0.05, 0.1, 0.12, g(0.9), 1, B_SOLDIER);
  return m;
}

function buildHead(THREE) {
  const m = makeMesher(THREE);
  const skull = [[0, 0.04, 0.01, 0.058, 0.06], [0, 0.072, 0.014, 0.084, 0.09], [0, 0.118, 0.012, 0.097, 0.108],
    [0, 0.168, 0.006, 0.1, 0.11], [0, 0.213, 0, 0.089, 0.099], [0, 0.248, 0, 0.056, 0.063]];
  m.loft([[0, -0.02, 0, 0.05, 0.05], [0, 0.06, 0.004, 0.047, 0.047]], 6, g(0.94), 0, ALL);
  m.loft(skull, 8, null, 0, ALL, -0.012, 0.018);
  // face detail: nose, ears, eyes, brow line, hair at the back
  m.box(0, 0.122, 0.117, 0.026, 0.042, 0.03, g(0.93), 0, HUMAN);
  m.box(0.037, 0.157, 0.101, 0.024, 0.012, 0.012, 0x0c0a09, 2, HUMAN);
  m.box(-0.037, 0.157, 0.101, 0.024, 0.012, 0.012, 0x0c0a09, 2, HUMAN);
  m.box(0, 0.085, 0.104, 0.04, 0.008, 0.012, 0x5a2f28, 2, HUMAN);
  m.loft([[0, 0.1, -0.03, 0.094, 0.092], [0, 0.17, -0.022, 0.103, 0.1], [0, 0.215, -0.014, 0.092, 0.094]], 6, 0x1b1410, 2, HUMAN);
  // flat cap (guard)
  m.loft([[0, 0.212, -0.004, 0.108, 0.118], [0, 0.248, -0.006, 0.113, 0.123], [0, 0.27, -0.012, 0.085, 0.094]], 8, null, 1, B_GUARD, undefined, 0.006);
  m.box(0, 0.22, 0.128, 0.13, 0.012, 0.075, g(0.8), 1, B_GUARD);
  // bush hat (handler)
  m.loft([[0, 0.216, 0, 0.19, 0.2], [0, 0.228, 0, 0.19, 0.2]], 10, null, 1, B_HANDLER, 0, 0);
  m.loft([[0, 0.228, 0, 0.105, 0.115], [0, 0.288, 0, 0.097, 0.107]], 8, g(0.92), 1, B_HANDLER, undefined, 0.01);
  // helmet (soldier, dream soldier)
  m.loft([[0, 0.156, 0, 0.127, 0.139], [0, 0.168, 0, 0.119, 0.13], [0, 0.205, 0, 0.121, 0.133], [0, 0.25, 0, 0.107, 0.118],
    [0, 0.282, 0, 0.068, 0.076]], 8, null, 1, B_SOLDIER | B_DREAM, undefined, 0.014);
  // peaked cap (officer)
  m.loft([[0, 0.205, 0, 0.104, 0.114], [0, 0.236, 0, 0.106, 0.116]], 8, g(0.7), 1, B_OFFICER);
  m.loft([[0, 0.236, 0, 0.124, 0.134], [0, 0.262, -0.006, 0.136, 0.143], [0, 0.276, -0.006, 0.1, 0.11]], 8, null, 1, B_OFFICER, undefined, 0.004);
  m.box(0, 0.21, 0.13, 0.12, 0.01, 0.065, 0x0b0b0c, 2, B_OFFICER);
  m.box(0, 0.25, 0.128, 0.03, 0.03, 0.012, 0xc9a94a, 2, B_OFFICER);
  return m;
}

function buildUpperArm(THREE) {
  const m = makeMesher(THREE);
  m.loft([[0, -0.3, 0, 0.04, 0.042], [0, -0.16, 0, 0.047, 0.05], [0, -0.04, 0, 0.053, 0.056], [0, 0.012, 0, 0.046, 0.049]], 6, null, 0, ALL, undefined, 0.026);
  return m;
}

function buildForearm(THREE) {
  const m = makeMesher(THREE);
  m.loft([[0, -0.262, 0, 0.028, 0.03], [0, -0.14, 0, 0.038, 0.04], [0, -0.02, 0, 0.043, 0.045], [0, 0.016, 0, 0.037, 0.039]], 6, null, 0, ALL, undefined, 0.014);
  m.loft([[0, -0.352, 0.006, 0.017, 0.03], [0, -0.31, 0.006, 0.022, 0.04], [0, -0.262, 0, 0.025, 0.034]], 6, null, 1, ALL, -0.012, 0);
  return m;
}

function buildThigh(THREE) {
  const m = makeMesher(THREE);
  m.loft([[0, -0.455, 0, 0.056, 0.06], [0, -0.3, 0, 0.066, 0.072], [0, -0.12, 0, 0.079, 0.087], [0, 0, 0, 0.083, 0.091]], 6, null, 0, ALL, undefined, 0.022);
  return m;
}

function buildShin(THREE) {
  const m = makeMesher(THREE);
  m.loft([[0, -0.3, -0.004, 0.044, 0.05], [0, -0.2, -0.01, 0.053, 0.059], [0, -0.06, 0, 0.055, 0.059], [0, 0.016, 0, 0.051, 0.055]], 6, null, 0, ALL, undefined, 0.016);
  // boot: shaft + foot + toe
  m.loft([[0, -0.43, 0, 0.05, 0.056], [0, -0.36, 0, 0.049, 0.055], [0, -0.275, -0.004, 0.05, 0.056]], 6, null, 1, ALL);
  m.box(0, -0.42, 0.05, 0.094, 0.06, 0.23, null, 1, ALL);
  m.box(0, -0.426, 0.175, 0.088, 0.048, 0.05, g(0.85), 1, ALL);
  return m;
}

// props: instance variant = prop id. 0 baton, 1 lantern, 2 carry pole + net, 3 rifle, 4 pistol
function buildProp(THREE) {
  const m = makeMesher(THREE);
  // 0 baton: in the forearm frame at the hand, pointing forward
  m.box(0, 0, 0.15, 0.032, 0.032, 0.5, null, 0, 1);
  // 1 lantern: hangs below its origin; the glass glows
  m.loft([[0, -0.085, 0, 0.05, 0.05], [0, -0.05, 0, 0.022, 0.022]], 5, null, 0, 2, undefined, 0.05);
  m.loft([[0, -0.2, 0, 0.038, 0.038], [0, -0.085, 0, 0.042, 0.042]], 5, 0xffc46a, 3, 2);
  m.loft([[0, -0.225, 0, 0.05, 0.05], [0, -0.2, 0, 0.05, 0.05]], 5, null, 0, 2, 0);
  // 2 carry pole (along +Y, grip at the origin) with a hoop net at the top; the bag hangs along -Z
  m.box(0, 0.05, 0, 0.03, 1.9, 0.03, null, 0, 4);
  const rx = new THREE.Matrix4().makeRotationX(HALF_PI);
  rx.setPosition(0, 0.85, -0.02);
  m.setXf(rx);
  m.loft([[0, -0.5, 0, 0.05, 0.05], [0, -0.3, 0, 0.15, 0.15], [0, 0, 0, 0.18, 0.18]], 7, null, 1, 4, -0.03);
  m.loft([[0, -0.012, 0, 0.19, 0.19], [0, 0.014, 0, 0.19, 0.19]], 7, g(0.55), 0, 4);
  m.setXf(null);
  // 3 rifle: along +Z, grip at the origin
  m.box(0, 0, 0.05, 0.04, 0.07, 0.42, null, 0, 8);
  m.box(0, -0.022, -0.27, 0.034, 0.09, 0.24, null, 1, 8);
  m.box(0, 0.012, 0.42, 0.02, 0.02, 0.36, g(0.8), 0, 8);
  m.box(0, -0.075, 0.1, 0.026, 0.1, 0.05, g(0.8), 0, 8);
  m.box(0, -0.012, 0.3, 0.036, 0.04, 0.16, null, 1, 8);
  // 4 pistol: in the forearm frame at the hand; the barrel continues the forearm
  m.box(0, -0.085, 0.03, 0.024, 0.16, 0.036, null, 0, 16);
  m.box(0, -0.03, 0.0, 0.026, 0.06, 0.07, g(0.7), 0, 16);
  return m;
}

function makeHumanMaterial(THREE) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>
attribute vec3 aCol;
attribute vec2 aMeta;
attribute vec4 iColA;
attribute vec3 iColB;
attribute vec4 iFx;
varying vec3 vHmCol;
varying vec3 vHmEmis;
varying vec2 vHmFx;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
transformed *= mod(floor(aMeta.y / exp2(iFx.x) + 0.001), 2.0);`)
      .replace("#include <project_vertex>", `#include <project_vertex>
{
  vec3 hmBase = aMeta.x < 0.5 ? iColA.rgb : (aMeta.x < 1.5 ? iColB : vec3(1.0));
  vec3 hmC = aCol * hmBase;
  vec3 hmN = normalize(transformedNormal);
  vec3 hmV = normalize(-mvPosition.xyz);
  float hmRim = pow(1.0 - abs(dot(hmN, hmV)), 2.0);
  vHmCol = hmC;
  vHmEmis = hmC * (aMeta.x > 2.5 ? 1.5 : 0.0) + hmC * iFx.z * (0.22 + 1.15 * hmRim) + vec3(0.95, 0.9, 0.75) * iFx.w;
  vHmFx = vec2(iFx.y, (aMeta.x < 0.5 && iColA.a > 0.5) ? position.y : -100.0);
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vHmCol;
varying vec3 vHmEmis;
varying vec2 vHmFx;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
diffuseColor.rgb *= vHmCol;
if (vHmFx.y > -50.0) diffuseColor.rgb *= mix(vec3(1.0), vec3(0.72, 0.2, 0.18), step(0.5, fract(vHmFx.y * 11.0)));
if (vHmFx.x < 0.995) {
  float hmD = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (hmD > vHmFx.x) discard;
}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
totalEmissiveRadiance += vHmEmis;`);
  };
  mat.customProgramCacheKey = () => "platy-combat-human";
  return mat;
}

function makeBlobTexture(THREE) {
  const S = 32, data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1;
      const d = Math.sqrt(dx * dx + dy * dy);
      const a = clamp(1 - d, 0, 1);
      const i = (y * S + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
      data[i + 3] = Math.round(255 * a * a * (3 - 2 * a) * 0.62);
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function buildConeGeometry(THREE) {
  const SEG = 12, RINGS = [0.04, 0.55, 0.9, 1.0], BR = [0.75, 0.5, 0.34, 0.0];
  const pos = [], col = [], idx = [];
  for (let r = 0; r < RINGS.length; r++) {
    for (let s = 0; s <= SEG; s++) {
      const a = -CONE_HALF + (s / SEG) * CONE_HALF * 2;
      const edge = 1 - 0.55 * Math.pow(Math.abs(s / SEG * 2 - 1), 3);
      pos.push(Math.sin(a) * RINGS[r], 0, Math.cos(a) * RINGS[r]);
      const b = BR[r] * edge;
      col.push(b, b, b);
    }
  }
  for (let r = 0; r < RINGS.length - 1; r++) {
    for (let s = 0; s < SEG; s++) {
      const a = r * (SEG + 1) + s, b = a + 1, c = a + SEG + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

function bindAll(obj, names) {
  const out = {};
  for (let i = 0; i < names.length; i++) {
    const f = obj && obj[names[i]];
    out[names[i]] = typeof f === "function" ? f.bind(obj) : NOOP;
  }
  return out;
}

// ================================================================================================

export function createCombat(ctx) {
  const THREE = ctx.THREE;
  const player = ctx.player;
  const au = bindAll(ctx.audio, ["guardVoice", "punch", "bodyFall", "gunshot", "bulletWhiz", "ricochet", "bulletHit", "aimWarn",
    "dissolve", "tribeChirp", "step", "humanHit", "stingHit", "zapHit"]);
  const fx = bindAll(ctx.fx, ["telegraph", "telegraphMove", "telegraphCancel", "tracer", "muzzleFlash", "bulletImpact", "dangerZone",
    "dangerCancel", "hitBurst", "stingBurst", "electroPulse", "ring", "dissolve", "sadMotes", "footDust", "dust", "hearts", "leaves"]);

  const group = new THREE.Group();
  group.name = "combat";

  // ---------------------------------------------------------------------------------------------
  // meshes

  const humanMat = makeHumanMaterial(THREE);
  const SEG_DEFS = [
    ["torso", buildTorso, 1], ["hips", buildHips, 1], ["head", buildHead, 1], ["armU", buildUpperArm, 2],
    ["armL", buildForearm, 2], ["thigh", buildThigh, 2], ["shin", buildShin, 2], ["prop", buildProp, 2],
  ];
  const seg = {};
  const segList = [];
  let humanTris = 0;
  const triBreak = {};
  for (let i = 0; i < SEG_DEFS.length; i++) {
    const d = SEG_DEFS[i], m = d[1](THREE), n = H_MAX * d[2];
    const geo = m.finish();
    humanTris += m.tris * n; triBreak[d[0]] = m.tris;
    const colA = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    const colB = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    const fxa = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    fxa.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iColA", colA); geo.setAttribute("iColB", colB); geo.setAttribute("iFx", fxa);
    const mesh = new THREE.InstancedMesh(geo, humanMat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    zeroMats(mesh.instanceMatrix.array, 0, n);
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.name = "combat-" + d[0];
    mesh.visible = false;
    group.add(mesh);
    const s = { mesh, per: d[2], mat: mesh.instanceMatrix.array, colA: colA.array, colB: colB.array, fx: fxa.array, aColA: colA, aColB: colB, aFx: fxa };
    seg[d[0]] = s; segList.push(s);
  }

  const blobGeo = new THREE.PlaneGeometry(1, 1);
  blobGeo.rotateX(-HALF_PI);
  const blobs = new THREE.InstancedMesh(blobGeo, new THREE.MeshBasicMaterial({
    map: makeBlobTexture(THREE), color: 0x000000, transparent: true, depthWrite: false, opacity: 0.9,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }), BLOB_MAX);
  blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  zeroMats(blobs.instanceMatrix.array, 0, BLOB_MAX);
  blobs.frustumCulled = false; blobs.renderOrder = 1; blobs.name = "combat-blobs";
  group.add(blobs);

  const cones = new THREE.InstancedMesh(buildConeGeometry(THREE), new THREE.MeshBasicMaterial({
    color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  }), CONE_MAX);
  cones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  zeroMats(cones.instanceMatrix.array, 0, CONE_MAX);
  cones.frustumCulled = false; cones.renderOrder = 2; cones.name = "combat-cones";
  const coneCol = new THREE.Color();
  for (let i = 0; i < CONE_MAX; i++) cones.setColorAt(i, coneCol.setHex(0xffffff));
  cones.instanceColor.setUsage(THREE.DynamicDrawUsage);
  cones.visible = false;
  group.add(cones);

  // the platypus crowd (allies + rivals)
  let crowd;
  if (typeof PLAT.createPlatypusCrowd === "function") crowd = PLAT.createPlatypusCrowd(THREE, CROWD_MAX, { castShadow: false });
  else {
    if (typeof console !== "undefined") console.warn("combat: createPlatypusCrowd is missing; allies and rivals will not be drawn");
    crowd = { group: new THREE.Group(), max: CROWD_MAX, set: NOOP, anim: NOOP, paint: NOOP, hide: NOOP, fade: NOOP, update: NOOP, commit: NOOP };
  }
  group.add(crowd.group);
  const crowdFree = [];
  const crowdAnim = new Array(CROWD_MAX).fill("");
  for (let i = CROWD_MAX - 1; i >= 0; i--) { crowdFree.push(i); crowd.hide(i); }
  let crowdUsed = 0;

  let looks = DEFAULT_LOOKS;
  import("./tribe.js").then((m) => { if (m && m.TRIBE_LOOKS && m.TRIBE_LOOKS.home && m.TRIBE_LOOKS.rival) looks = m.TRIBE_LOOKS; }).catch(NOOP);

  // ---------------------------------------------------------------------------------------------
  // state

  const enemies = [], bodies = [], allies = [];
  const fallen = [];                 // allies lying still (fading)
  const slots = new Array(H_MAX).fill(null);   // human slot -> enemy
  const anchors = [];
  for (let i = 0; i < H_MAX; i++) { const a = new THREE.Object3D(); a.name = "carryAnchor" + i; group.add(a); anchors.push(a); }
  const shots = [];
  for (let i = 0; i < SHOT_MAX; i++) shots.push({ on: false, t: 0, sx: 0, sy: 0, sz: 0, ax: 0, ay: 0, az: 0, ex: 0, ez: 0, enemy: null, tgt: null, first: false });
  const stash = [];
  for (let i = 0; i < ALLY_MAX; i++) stash.push({ x: 0, z: 0, look: 0, paint: null });
  let stashN = 0, rosterPeak = 0;
  let world = null;
  let now = 0, lastVoiceT = -9, shooters = 0, wasAlerted = 0, wasSearching = 0, thinkGroup = 0, allySerial = 0;
  let conesOn = true, playerWasGrounded = true, humansUsed = 0;
  let mode = "follow", orderX = 0, orderZ = 0, orderR = 0, orderSerial = 0;
  // per-frame player snapshot
  let px = 0, py = 0, pz = 0, pOk = true, pSneak = false, pLit = 0.5, pHid = false, pRun = false;

  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
  const _slot = { x: 0, z: 0 };
  const _zone = { shape: "circle", x: 0, z: 0, r: 1.1, yaw: 0, arc: 0, len: 0, width: 0, seconds: 0.6, colorHex: 0xff3020 };
  const _src = { x: 0, z: 0, kind: "bullet", knock: 1.2 };
  const _res = { enemy: null, result: "miss", count: 0 };
  const _col = new THREE.Color();

  const combat = {
    group, enemies, bodies, allies,
    seen: 0, alertState: "hidden", alerted: 0, alive: 0,
    maxShooters: 2, bulletDamage: 34, aimScale: 1, damageScale: 1, viewScale: 1,
    seenRate: 1,          // extra: multiplies how fast `seen` fills (a level can raise it in a spotlight)
    rivalDamage: 1,       // extra: what a rival's bite takes off ctx.health (level 9 uses hearts)
    frozen: false,        // extra: true = enemies and allies stop thinking (cutscenes); everything still draws
    strikeRange: { sting: 1.2, slap: 1.5, finisher: 1.8 },
    bodyTTL: 12,
    allyDamage: 12, allyRate: 1.2,
    onEvent: null,
    mode: "follow",
    crowd,
    setWorld, update, reset, spawn, spawnBody, showCones, noise, calm, strike, wouldFinish, playerShot, blast,
    addAlly, order, reviveAllies, setAllies, count,
    stats() { return { humanTris, triBreak, humansUsed, crowdUsed, shooters }; },
  };

  function emit(type, a, b) { const f = combat.onEvent; if (f) f(type, a, b); }

  // ---------------------------------------------------------------------------------------------
  // world access (all optional but heightAt)

  function setWorld(w) { world = w || null; }
  function hAt(x, z) { return world && world.heightAt ? world.heightAt(x, z) : 0; }
  function sightOk(x0, z0, x1, z1) { return world && world.sight ? world.sight(x0, z0, x1, z1) !== false : true; }
  function surfAt(x, z) { return world && world.surfaceAt ? world.surfaceAt(x, z) : "dirt"; }
  function impactSurf(x, z) {
    const s = surfAt(x, z);
    return s === "metal" || s === "wood" || s === "concrete" || s === "leaves" || s === "dirt" ? s
      : s === "grass" ? "leaves" : s === "rock" ? "concrete" : "dirt";
  }
  function inWater(x, z) { return !!(world && world.waterAt) && world.waterAt(x, z) > hAt(x, z) + 0.03; }
  function panOf(x, z) { return ctx.bearing ? clamp(Math.sin(ctx.bearing(x, z)), -1, 1) : 0; }
  function farOf(x, z) { return clamp(Math.hypot(x - px, z - pz) / 45, 0, 1); }
  function say(e, kind, force) {
    if (!e.def.human || e.kind === "dreamSoldier") return;
    if (!force && now - lastVoiceT < 0.32) return;
    lastVoiceT = now;
    au.guardVoice(kind, panOf(e.x, e.z), farOf(e.x, e.z));
  }

  function pushOut(o, r, list) {
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.on === false) continue;
      const dx = o.x - c.x, dz = o.z - c.z, rr = c.r + r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2);
        if (d > 1e-4) { o.x = c.x + (dx / d) * rr; o.z = c.z + (dz / d) * rr; } else o.x = c.x + rr;
      }
    }
  }
  function collide(o, r) {
    if (world) pushOut(o, r, world.colliders);
    pushOut(o, r, ctx.colliders);
    if (world && world.confine) world.confine(o, r);
  }

  // ---------------------------------------------------------------------------------------------
  // human slots and looks

  function allocHuman() {
    for (let i = 0; i < H_MAX; i++) if (!slots[i]) return i;
    let best = null;
    for (let i = 0; i < bodies.length; i++) if (bodies[i].enemy.hi >= 0 && (!best || bodies[i].age > best.age)) best = bodies[i];
    if (!best) return -1;
    const hi = best.enemy.hi;
    if (best.kind === "dreamSoldier") fx.dissolve(best.x, best.y, best.z, 0.5, 0xbfd0ff, 20);
    removeBody(best);
    return hi;
  }
  function hideHuman(hi) {
    for (let k = 0; k < segList.length; k++) {
      const s = segList[k];
      zeroMats(s.mat, hi * s.per, (hi + 1) * s.per);
      s.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  function setCol(s, i, a, stripe, b) {
    _col.setHex(a); s.colA[i * 4] = _col.r; s.colA[i * 4 + 1] = _col.g; s.colA[i * 4 + 2] = _col.b; s.colA[i * 4 + 3] = stripe ? 1 : 0;
    _col.setHex(b); s.colB[i * 3] = _col.r; s.colB[i * 3 + 1] = _col.g; s.colB[i * 3 + 2] = _col.b;
    s.aColA.needsUpdate = true; s.aColB.needsUpdate = true;
  }
  function shade(hex, k) {
    const r = clamp(((hex >> 16) & 255) * k, 0, 255) | 0, gg = clamp(((hex >> 8) & 255) * k, 0, 255) | 0, b = clamp((hex & 255) * k, 0, 255) | 0;
    return (r << 16) | (gg << 8) | b;
  }
  function dressHuman(e, skinOpt) {
    const hi = e.hi, kind = e.kind, v = 0.9 + 0.2 * e.seed;
    const skin = SKIN[typeof skinOpt === "number" ? Math.abs(skinOpt | 0) % SKIN.length : (e.seed * 977 | 0) % SKIN.length];
    let shirt, pants, gear, belt, hat, boots, fore, hand, stripe = false;
    if (kind === "guard") {
      shirt = shade(0xe2dccb, v); pants = shade(0x3b3631, v); gear = 0x5b2c22; belt = 0x2a1c14; hat = shade(0x4c4338, v); boots = 0x1c1612;
      fore = skin; hand = skin; stripe = true;
    } else if (kind === "handler") {
      shirt = shade(0xb7a57a, v); pants = shade(0x8a7a55, v); gear = 0x5b4a30; belt = 0x3b2a1a; hat = shade(0xa39268, v); boots = 0x3a2a1c;
      fore = shirt; hand = skin;
    } else if (kind === "soldier") {
      shirt = shade(0x57623f, v); pants = shade(0x4c5639, v); gear = 0x30351f; belt = 0x2a2d1c; hat = shade(0x3e4731, v); boots = 0x15130f;
      fore = shirt; hand = 0x23241c;
    } else if (kind === "officer") {
      shirt = shade(0x4c5541, v); pants = shade(0x464e3c, v); gear = 0x3b2a1a; belt = 0x3b2a1a; hat = 0x3a4130; boots = 0x120f0c;
      fore = shirt; hand = skin;
    } else {
      shirt = pants = fore = shade(0xbfd0ff, 0.92 + 0.08 * e.seed); gear = belt = hat = 0xd9e4ff; boots = 0xa9bcf5; hand = 0xd9e4ff;
    }
    const sk = kind === "dreamSoldier" ? 0xd9e4ff : skin;
    setCol(seg.torso, hi, shirt, stripe, gear);
    setCol(seg.hips, hi, pants, false, belt);
    setCol(seg.head, hi, sk, false, hat);
    for (let s = 0; s < 2; s++) {
      const i = hi * 2 + s;
      setCol(seg.armU, i, shirt, stripe, gear);
      setCol(seg.armL, i, fore, false, hand);
      setCol(seg.thigh, i, pants, false, belt);
      setCol(seg.shin, i, pants, false, boots);
    }
    // props: [0] = right hand, [1] = left hand
    e.propR = kind === "guard" ? 0 : kind === "handler" ? 2 : kind === "soldier" ? 3 : kind === "officer" ? 4 : -1;
    e.propL = kind === "guard" ? 1 : -1;
    const PA = [0x2a2018, 0x2c2c28, 0x7a5a34, 0x1c1d1f, 0x18181a], PB = [0x2a2018, 0x2c2c28, 0xc9b98a, 0x5a3d22, 0x18181a];
    if (e.propR >= 0) setCol(seg.prop, hi * 2, PA[e.propR], false, PB[e.propR]);
    if (e.propL >= 0) setCol(seg.prop, hi * 2 + 1, PA[e.propL], false, PB[e.propL]);
  }

  // ---------------------------------------------------------------------------------------------
  // enemies

  function enemyBehind(x, z) { return Math.abs(wrapPi(Math.atan2(x - this.x, z - this.z) - this.yaw)) > 1.75; }
  function enemyHit(dmg, src) {
    const r = applyHit(this, +dmg || 0, (src && src.kind) || "hit", src && typeof src.x === "number" ? src.x : this.x - Math.sin(this.yaw),
      src && typeof src.z === "number" ? src.z : this.z - Math.cos(this.yaw), src || null);
    return r !== "miss" && r !== "blocked";
  }
  function enemyStun(seconds) { if (this.alive) stunEnemy(this, seconds === undefined ? 1.2 : seconds, false); }
  function enemyKnockOut(src) { if (this.alive) knockOut(this, src || null, "knockout", false); }
  function enemyDistract(x, z, seconds) { distract(this, x, z, seconds === undefined ? 6 : seconds); }
  function enemyAlert(x, z) { if (this.alive && !this.passive) becomeAlert(this, typeof x === "number" ? x : px, typeof z === "number" ? z : pz, true, false); }
  function enemyGoto(x, z, run) {
    if (!this.alive) return;
    this.gotoOn = true; this.gx = x; this.gz = z; this.gotoRun = !!run;
    if (!this.aware && this.state !== "stunned") setState(this, "patrol");
  }
  function enemySetRoute(route, loop) {
    this.route = resolveRoute(route); this.loop = loop !== false; this.ri = 0; this.waitT = 0; this.routeDone = false; this.gotoOn = false;
    if (this.alive && !this.aware && this.state !== "stunned" && this.state !== "suspicious" && this.state !== "search") setState(this, this.route ? "patrol" : "idle");
  }
  function enemyCarry(on) { this.carrying = !!on; this.still = false; }
  function enemyFace(yaw) { this.homeYaw = yaw; if (!this.aware) this.faceYaw = yaw; }
  function enemyRemove() { removeEnemy(this); }

  function resolveRoute(route) {
    if (typeof route === "string") route = world && world.routes ? world.routes[route] : null;
    return route && route.length ? route : null;
  }
  function setState(e, s) { e.state = s; e.t = 0; }

  function spawn(kind, x, z, o) {
    const def = KINDS[kind] || KINDS.guard;
    if (!KINDS[kind]) kind = "guard";
    o = o || {};
    const yaw = +o.yaw || 0;
    const e = {
      kind, x, y: hAt(x, z), z, yaw, r: 0.45, hp: 0, maxHp: 0, alive: true, targetable: true, state: "idle", staggered: false, seen: 0,
      squad: o.squad | 0, passive: !!o.passive, asleep: !!o.asleep, shield: false, windup: 0, carrying: false, carryAnchor: null,
      muzzle: { x, y: 1.3, z }, aimPoint: { x, y: 0, z }, body: null,
      behind: enemyBehind, hit: enemyHit, stun: enemyStun, knockOut: enemyKnockOut, distract: enemyDistract, alert: enemyAlert,
      goto: enemyGoto, setRoute: enemySetRoute, carry: enemyCarry, face: enemyFace, remove: enemyRemove,
      // internals
      def, hi: -1, ci: -1, seed: Math.random(), big: false, scale: 1, tint: 0xffffff, t: 0, age: 0, aware: false,
      route: resolveRoute(o.route), loop: o.loop !== false, ri: 0, waitT: 0, routeDone: false, post: !!o.post, sweep: +o.sweep || 0,
      homeX: x, homeZ: z, homeYaw: yaw, gotoOn: false, gx: 0, gz: 0, gotoRun: false,
      faceYaw: yaw, lookOff: 0, dvx: 0, dvz: 0, vx: 0, vz: 0, kx: 0, kz: 0, hop: 0, hopV: 0, animSpeed: 0, gait: Math.random() * TAU,
      lastX: x, lastZ: z, lostT: 0, losT: Math.random() * 0.1, los: false, vis: false, squadT: -1, reactT: 0, coneRange: def.range, susT: 0, investigate: false,
      stunT: 0, knocked: false, staggerT: 0, venomT: 0, ringT: 0, flash: 0, hitW: 0, lie: 0, fallSign: 1, lieRoll: 0,
      aimW: 0, windW: 0, atkW: 0, stagW: 0, crouchW: 0, grow: 1, fade: 1, glow: 0, shrink: 1, still: false,
      token: false, tokenCd: rnd(0, 0.6), tele: undefined, zone: undefined, tgt: null, pickT: 0, aimDur: 0.75, locked: false, shotsLeft: 0, shotT: 0, shotN: 0,
      strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 0, cx: x, cz: z, coverI: -1, atCover: false, engaged: 0, lastBy: null, hitOnce: false,
      propR: -1, propL: -1, voiceT: rnd(3, 8), gone: false, fleeT: 0, dashT: 0, lockYaw: 0,
      wantAlert: false, returning: false, caught: false, carryRear: false, pulseMark: -1,
    };
    e.maxHp = e.hp = typeof o.hp === "number" ? o.hp : def.hp;
    if (def.human) {
      e.hi = allocHuman();
      if (e.hi >= 0) {
        slots[e.hi] = e;
        e.carryAnchor = anchors[e.hi];
        dressHuman(e, o.skin);
      } else e.carryAnchor = anchors[0];
      if (kind === "dreamSoldier") { e.grow = 0.02; e.fade = 0; e.glow = 0.95; e.targetable = false; }
    } else {
      e.r = 0.35;
      e.ci = crowdFree.length ? crowdFree.pop() : -1;
      if (e.ci >= 0) crowdUsed++;
      e.big = o.skin === "chief";
      e.scale = e.big ? 1.4 : 0.92 + 0.14 * e.seed;
      if (e.big) e.r = 0.5;
      const furs = looks.rival.furs;
      e.tint = furs[(e.seed * 7919 | 0) % furs.length];
      if (e.ci >= 0) { crowd.paint(e.ci, looks.rival.paint); crowdAnim[e.ci] = ""; }
    }
    e.wantAlert = !!o.alert;
    setState(e, e.route ? "patrol" : "idle");
    enemies.push(e);
    combat.alive++;
    return e;
  }

  function count(kind) {
    let n = 0;
    for (let i = 0; i < enemies.length; i++) if (enemies[i].alive && (!kind || enemies[i].kind === kind)) n++;
    return n;
  }

  function releaseToken(e, cd) {
    if (e.tele !== undefined) { fx.telegraphCancel(e.tele); e.tele = undefined; }
    if (e.token) { e.token = false; e.tokenCd = cd === undefined ? rnd(0.3, 0.9) : cd; }
    e.coverI = -1; e.atCover = false; e.locked = false; e.shotsLeft = 0;
  }
  function cancelZone(e) { if (e.zone !== undefined) { fx.dangerCancel(e.zone); e.zone = undefined; } }
  function interrupt(e) {
    cancelZone(e);
    if (e.state === "aim" || e.state === "attack" || e.state === "cover") releaseToken(e);
    if (e.state === "windup" || e.state === "attack" || e.state === "aim" || e.state === "cover") setState(e, e.aware ? "chase" : "idle");
  }

  function becomeAlert(e, x, z, shout, cascaded) {
    if (!e.alive || e.passive) return;
    e.lastX = x; e.lastZ = z; e.lostT = 0; e.asleep = false; e.investigate = false;
    if (e.aware) return;
    e.aware = true; e.seen = 1;
    e.squadT = cascaded ? -1 : 0.8;
    e.reactT = shout ? 0.45 : 0.2;
    if (e.state !== "stunned") setState(e, "alert");
    if (shout) say(e, e.def.ranged ? "alert" : "hey", true);
    emit("spotted", e);
  }
  function loseTrack(e) {
    releaseToken(e); cancelZone(e);
    e.aware = false; e.seen = 0.6; e.tgt = null;
    setState(e, "search"); e.susT = 5;
    say(e, "search");
  }
  function backToRoute(e) {
    e.investigate = false; e.aware = false; e.lookOff = 0;
    if (e.gotoOn || e.route) setState(e, "patrol");
    else if (Math.hypot(e.x - e.homeX, e.z - e.homeZ) > 0.6) { e.gotoOn = true; e.gx = e.homeX; e.gz = e.homeZ; e.gotoRun = false; e.returning = true; setState(e, "patrol"); }
    else setState(e, "idle");
  }
  function distract(e, x, z, seconds) {
    if (!e.alive || e.passive || e.aware || e.state === "stunned" || !e.def.human || e.kind === "dreamSoldier") return;
    const wasCalm = e.state !== "suspicious" && e.state !== "search";
    e.asleep = false; e.investigate = true; e.lastX = x; e.lastZ = z; e.susT = seconds;
    setState(e, "suspicious");
    if (wasCalm) { say(e, "huh"); emit("suspicious", e); }
  }
  function noise(x, z, radius, seconds) {
    const sec = seconds === undefined ? 6 : seconds;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (Math.hypot(e.x - x, e.z - z) <= radius) distract(e, x, z, sec);
    }
  }
  function calm() {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive) continue;
      releaseToken(e, 0.5); cancelZone(e);
      e.seen = 0; e.tgt = null; e.lostT = 0; e.squadT = -1;
      if (e.state !== "stunned") backToRoute(e); else e.aware = false;
    }
    for (let i = 0; i < SHOT_MAX; i++) shots[i].on = false;
  }
  function showCones(on) { conesOn = on !== false; }

  function stunEnemy(e, seconds, knockdown) {
    interrupt(e);
    e.stunT = Math.max(e.stunT, seconds); e.knocked = e.knocked || !!knockdown;
    setState(e, "stunned");
    e.still = false;
  }

  // ---- fallen bodies ----------------------------------------------------------------------------

  function bodyTransform() {
    if (!this.alive) return;
    this.alive = false; this.targetable = false; this.shrinkT = 0.4;
    if (this.enemy) this.enemy.still = false;
  }
  function makeBody(e) {
    const b = { x: e.x, y: e.y, z: e.z, yaw: e.yaw, kind: e.kind, age: 0, alive: true, targetable: true, r: 0.9, enemy: e, transform: bodyTransform,
      shrinkT: -1, fadeT: -1, thud: false, lx: e.x, lz: e.z, lyaw: e.yaw };
    if (e.def.human && e.hi < 0) { b.alive = false; b.targetable = false; b.fadeT = 0; }   // never had a slot (> 24 humans): nothing to leave behind
    e.body = b;
    bodies.push(b);
    return b;
  }
  function removeBody(b) {
    const i = bodies.indexOf(b);
    if (i >= 0) bodies.splice(i, 1);
    b.alive = false; b.targetable = false;
    const e = b.enemy;
    if (e) { e.body = null; freeEnemyVisual(e); e.state = "gone"; e.gone = true; }
  }
  function freeEnemyVisual(e) {
    if (e.hi >= 0 && slots[e.hi] === e) { slots[e.hi] = null; hideHuman(e.hi); }
    e.hi = -1;
    if (e.ci >= 0) { crowd.hide(e.ci); crowdAnim[e.ci] = ""; crowdFree.push(e.ci); crowdUsed--; e.ci = -1; }
  }
  function removeEnemy(e) {
    if (e.gone) return;
    releaseToken(e); cancelZone(e);
    if (e.alive) { e.alive = false; combat.alive = Math.max(0, combat.alive - 1); }
    e.targetable = false; e.staggered = false;
    if (e.body) removeBody(e.body); else freeEnemyVisual(e);
    e.state = "gone"; e.gone = true;
    const i = enemies.indexOf(e);
    if (i >= 0) enemies.splice(i, 1);
  }

  // result: "finish" | "takedown" | "blast" | "knockout"
  function knockOut(e, src, result, silent) {
    if (!e.alive) return;
    releaseToken(e); cancelZone(e);
    e.alive = false; e.targetable = false; e.hp = 0; e.staggered = false; e.staggerT = 0; e.stunT = 0;
    e.aware = false; e.seen = 0; e.tgt = null; e.still = false; e.carrying = false;
    combat.alive = Math.max(0, combat.alive - 1);
    const sx = src && typeof src.x === "number" ? src.x : e.x - Math.sin(e.yaw), sz = src && typeof src.z === "number" ? src.z : e.z - Math.cos(e.yaw);
    let dx = e.x - sx, dz = e.z - sz;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    const power = src && typeof src.power === "number" ? src.power : 0;
    if (e.def.human) {
      const blastHit = result === "blast";
      if (blastHit) { e.yaw = Math.atan2(-dx, -dz); e.faceYaw = e.yaw; e.fallSign = 1; }
      else e.fallSign = Math.abs(wrapPi(Math.atan2(-dx, -dz) - e.yaw)) < HALF_PI ? 1 : -1;
      const k = blastHit ? (5 + 6 * power) * (1 - 0.45 * clamp(d / (src.radius || 10), 0, 1)) : result === "takedown" ? 0.5 : 1.8;
      e.kx = dx * k; e.kz = dz * k;
      e.hopV = blastHit ? 2.6 + 1.6 * power : 0;
      e.lieRoll = (e.seed - 0.5) * 0.5;
      setState(e, "down");
      makeBody(e);
      if (e.kind === "dreamSoldier") { e.glow = 0.55; }
      else if (!silent) say(e, "down", true);
    } else {
      // rivals leave no body: a yelp, a roll, and they run off
      e.kx = dx * 4.5; e.kz = dz * 4.5; e.hopV = 2.2;
      e.fleeT = 3.2; e.faceYaw = Math.atan2(dx, dz);
      setState(e, "gone");
      au.tribeChirp("scared", 0.9, panOf(e.x, e.z), e.big ? 0.7 : 1.15);
      fx.dust(e.x, e.y + 0.05, e.z, 0.5);
    }
    emit("down", e, result);
    if (combat.alive === 0) emit("allDown");
  }

  function spawnBody(kind, x, z, yaw) {
    if (!KINDS[kind] || !KINDS[kind].human) kind = "soldier";
    const e = spawn(kind, x, z, { yaw: yaw || 0, passive: true });
    e.alive = false; e.targetable = false; e.hp = 0;
    combat.alive = Math.max(0, combat.alive - 1);
    e.grow = 1; e.fade = kind === "dreamSoldier" ? 0.5 : 1; e.glow = kind === "dreamSoldier" ? 0.55 : 0;
    e.lie = 1; e.fallSign = 1; e.lieRoll = (e.seed - 0.5) * 0.5;
    setState(e, "down");
    const b = makeBody(e);
    b.thud = true;
    const i = enemies.indexOf(e);
    if (i >= 0) enemies.splice(i, 1);
    return b;
  }

  // ---- the player's attacks ---------------------------------------------------------------------

  function hitFx(e, kind) {
    const human = e.def.human;
    _v1.set(e.x, e.y + (human ? (kind === "sting" ? 0.35 : 0.95) : 0.22), e.z);
    if (kind === "sting") { fx.stingBurst(_v1); au.punch(); }
    else if (kind === "pulse") fx.hitBurst(_v1, 0x9fd8ff);
    else { fx.hitBurst(_v1, e.kind === "dreamSoldier" ? 0xcfdcff : 0xfff0c8); au.punch(); }
    e.flash = 1; e.hitW = 1; e.still = false;
  }

  // one hit on one enemy. Returns "miss" | "blocked" | "hit" | "stagger" | "finish" | "takedown".
  function applyHit(e, dmg, kind, sx, sz, src) {
    if (!e.alive) return "miss";
    if (e.shield || e.grow < 0.95) return "blocked";
    const byAlly = kind === "ally";
    const wasAware = e.aware, fromBehind = e.behind(sx, sz);
    _src.x = sx; _src.z = sz;
    if (e.staggered) {
      hitFx(e, kind);
      knockOut(e, _src, "finish", false);
      if (byAlly && src && src.by) emit("allyKill", src.by, e);
      return "finish";
    }
    if ((kind === "sting" || kind === "slap") && !wasAware && (fromBehind || e.asleep) && !e.passive) {
      hitFx(e, kind);
      knockOut(e, _src, "takedown", true);
      return "takedown";
    }
    hitFx(e, kind);
    if (kind === "finisher") dmg = Math.max(dmg, 50);
    e.hp -= dmg;
    let stag = e.hp < STAGGER_HP || kind === "slap" || (!wasAware && fromBehind && !byAlly);
    if (e.hp <= 0) { e.hp = 1; stag = true; }
    interrupt(e);
    if (kind === "sting") e.venomT = 3;
    if (kind === "slap") stunEnemy(e, 1.2, true);
    else if (kind === "pulse") stunEnemy(e, 2, false);
    if (!e.passive && !e.aware) becomeAlert(e, sx, sz, true, false);
    if (src && src.by) e.lastBy = src.by;
    if (e.def.human) say(e, "hurt"); else au.tribeChirp("scared", 0.5, panOf(e.x, e.z), 1.3);
    emit("hit", e, kind);
    if (stag) {
      e.staggerT = 2.5; e.staggered = true; e.ringT = 0;
      emit("stagger", e);
      return "stagger";
    }
    return "hit";
  }

  function pickTarget(kind, staggeredOnly) {
    const R = combat.strikeRange;
    const range = kind === "sting" ? R.sting : kind === "slap" ? R.slap : R.finisher;
    let best = null, bs = 1e9;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive || !e.targetable) continue;
      if (staggeredOnly && !e.staggered) continue;
      const dx = e.x - player.x, dz = e.z - player.z, d = Math.hypot(dx, dz);
      if (d > range + 0.12 + (e.big ? 0.3 : 0)) continue;
      if (kind === "sting" && d > 0.4 && Math.abs(wrapPi(Math.atan2(dx, dz) - player.yaw)) > PI / 3 + 0.05) continue;
      const s = d - (kind === "finisher" && e.staggered ? 5 : 0);
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  function wouldFinish(kind) {
    if (kind === "pulse") return false;
    return !!pickTarget("finisher", true);
  }

  // NOTE: returns one reused object { enemy, result, count }.
  function strike(kind) {
    _res.enemy = null; _res.result = "miss"; _res.count = 0;
    if (kind === "pulse") {
      if (!player.inWater) return _res;
      // every enemy standing in the same connected water within 7 m (max 3, nearest first)
      let n = 0;
      pulseSerial++;
      while (n < 3) {
        let best = null, bd = 1e9;
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i];
          if (!e.alive || !e.targetable) continue;
          const d = Math.hypot(e.x - player.x, e.z - player.z);
          if (d > 7 || d >= bd || e.pulseMark === pulseSerial) continue;
          if (!inWater(e.x, e.z)) continue;
          if (!inWater(lerp(player.x, e.x, 0.33), lerp(player.z, e.z, 0.33)) || !inWater(lerp(player.x, e.x, 0.66), lerp(player.z, e.z, 0.66))) continue;
          best = e; bd = d;
        }
        if (!best) break;
        best.pulseMark = pulseSerial;
        const from = n === 0 ? _v2 : n === 1 ? _v3 : _v4;
        from.set(player.x, player.y + 0.12, player.z);
        _v1.set(best.x, best.y + 0.3, best.z);
        fx.electroPulse(from, _v1, NOOP);
        const r = applyHit(best, 60, "pulse", player.x, player.z, null);
        if (r !== "miss" && r !== "blocked") {
          au.zapHit();
          if (!_res.enemy) _res.enemy = best;
          if (r === "finish" || _res.result === "miss" || (r === "stagger" && _res.result === "hit")) _res.result = r;
          _res.count++;
        }
        n++;
      }
      return _res;
    }
    const k = kind === "slap" ? "slap" : kind === "finisher" ? "finisher" : "sting";
    const e = pickTarget(k, false);
    if (!e) return _res;
    _res.enemy = e; _res.count = 1;
    _res.result = applyHit(e, k === "slap" ? 40 : k === "finisher" ? 50 : 34, k, player.x, player.z, null);
    return _res;
  }

  // cover test along a segment in plan. tall: only cover at least this high counts.
  // Writes the entry point into _v4 and returns the cover, or null.
  function coverOnSegment(x0, z0, x1, z1, skipX, skipZ, skipR, minH) {
    const list = world && world.cover;
    if (!list) return null;
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz;
    if (L2 < 1e-6) return null;
    let best = null, bu = 2;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.on === false) continue;
      if ((c.h === undefined ? 1.2 : c.h) < minH) continue;
      if (Math.hypot(c.x - skipX, c.z - skipZ) < c.r + skipR) continue;
      const u = clamp(((c.x - x0) * dx + (c.z - z0) * dz) / L2, 0, 1);
      const qx = x0 + dx * u - c.x, qz = z0 + dz * u - c.z;
      const q2 = qx * qx + qz * qz;
      if (q2 > c.r * c.r) continue;
      const ue = Math.max(0, u - Math.sqrt(c.r * c.r - q2) / Math.sqrt(L2));
      if (ue < bu) { bu = ue; best = c; }
    }
    if (best) _v4.set(x0 + dx * bu, 0, z0 + dz * bu);
    coverU = bu;
    return best;
  }
  let coverU = 0, pulseSerial = 0;

  function playerShot(origin, dirX, dirZ, target, dist) {
    const ox = origin.x, oy = origin.y, oz = origin.z;
    let len = typeof dist === "number" && dist > 0 ? dist : 22;
    const dl = Math.hypot(dirX, dirZ) || 1;
    dirX /= dl; dirZ /= dl;
    let e = null;
    if (target && target.alive !== false && typeof target.hit === "function") e = target;
    if (!e) {
      // a free shot still hits whoever stands in its way
      let bd = len;
      for (let i = 0; i < enemies.length; i++) {
        const q = enemies[i];
        if (!q.alive || !q.targetable) continue;
        const rx = q.x - ox, rz = q.z - oz, along = rx * dirX + rz * dirZ;
        if (along < 0.3 || along > bd) continue;
        if (Math.abs(rx * dirZ - rz * dirX) < q.r + 0.15) { bd = along; e = q; }
      }
    }
    let ex, ey, ez;
    if (e) { ex = e.x; ez = e.z; ey = e.y + (e.def.human ? (e.state === "cover" && e.atCover ? 0.75 : 1.05) : 0.22); len = Math.hypot(ex - ox, ez - oz); }
    else { ex = ox + dirX * len; ez = oz + dirZ * len; ey = oy; }
    // tall cover always stops the bolt; low cover only shields an enemy crouching right behind it
    let c = coverOnSegment(ox, oz, ex, ez, ox, oz, 0.3, 1.6);
    if (!c && e && e.state === "cover" && e.atCover) {
      c = coverOnSegment(ox, oz, ex, ez, ox, oz, 0.3, 0.5);
      if (c && Math.hypot(c.x - e.x, c.z - e.z) > c.r + 1.7) c = null;
    }
    if (!c && e && !sightOk(ox, oz, ex, ez)) { e = null; }
    if (c) {
      _v1.set(ox, oy, oz); _v2.set(_v4.x, lerp(oy, ey, coverU), _v4.z);
      fx.tracer(_v1, _v2, 90, 0x9fe8ff);
      fx.bulletImpact(_v2, c.surface || "concrete");
      au.ricochet(panOf(_v2.x, _v2.z));
      return null;
    }
    _v1.set(ox, oy, oz); _v2.set(ex, ey, ez);
    fx.tracer(_v1, _v2, 90, 0x9fe8ff);
    if (!e) { _v2.y = hAt(ex, ez) + 0.05; fx.bulletImpact(_v2, impactSurf(ex, ez)); return null; }
    const r = applyHit(e, 50, "shot", ox, oz, null);
    if (r === "miss" || r === "blocked") { fx.bulletImpact(_v2, "metal"); return null; }
    return e;
  }

  function blast(x, z, radius, power) {
    const p = power === undefined ? 1 : power;
    let n = 0;
    _src.x = x; _src.z = z; _src.power = p; _src.radius = radius;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive) continue;
      if (Math.hypot(e.x - x, e.z - z) > radius) continue;
      e.flash = 1;
      knockOut(e, _src, "blast", true);
      n++;
    }
    _src.power = undefined; _src.radius = undefined;
    for (let i = 0; i < SHOT_MAX; i++) shots[i].on = false;
    return n;
  }

  // ---------------------------------------------------------------------------------------------
  // enemy AI

  function steer(e, tx, tz, speed, stop) {
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    if (d <= stop) { e.dvx = 0; e.dvz = 0; return d; }
    const want = Math.atan2(dx, dz);
    e.faceYaw = want;
    const k = Math.max(0.2, Math.cos(wrapPi(want - e.yaw))) * Math.min(1, d / 0.5 + 0.35);
    e.dvx = (dx / d) * speed * k; e.dvz = (dz / d) * speed * k;
    return d;
  }
  function faceTo(e, x, z) { e.faceYaw = Math.atan2(x - e.x, z - e.z); }
  function speedOf(e, v) { return v * (e.venomT > 0 ? 0.6 : 1); }

  // can this enemy see the player right now?
  function sense(e, d, dt) {
    if (!pOk) return false;
    const K = e.def;
    let range, half;
    if (e.aware) { range = Math.max(K.range, 9) * 1.9; half = 2.2; }
    else {
      range = K.range * combat.viewScale * (0.6 + 0.8 * pLit) * (pSneak ? 0.55 : 1);
      half = CONE_HALF;
      e.coneRange += (range - e.coneRange) * Math.min(1, dt * 6);
    }
    if (d > range) return false;
    if (pHid && d > (e.aware ? 2.4 : 1.6)) return false;
    if (d > 0.8 && Math.abs(wrapPi(Math.atan2(px - e.x, pz - e.z) - (e.yaw + e.lookOff))) > half) return false;
    e.losT -= dt;
    if (e.losT <= 0) { e.los = sightOk(e.x, e.z, px, pz); e.losT = 0.09 + Math.random() * 0.06; }
    return e.los;
  }

  function patrolStep(e, dt) {
    const K = e.def;
    if (e.gotoOn) {
      const d = steer(e, e.gx, e.gz, speedOf(e, e.gotoRun ? K.chase : K.walk), 0.25);
      if (d <= 0.25) {
        e.gotoOn = false;
        if (e.returning) { e.returning = false; e.faceYaw = e.homeYaw; }
        else { e.homeX = e.x; e.homeZ = e.z; e.homeYaw = e.yaw; emit("arrived", e); }
        if (!e.route || e.routeDone) setState(e, "idle");
      }
      return;
    }
    const R = e.route;
    if (!R || e.routeDone) { setState(e, "idle"); return; }
    const p = R[e.ri % R.length];
    if (e.waitT > 0) {
      e.waitT -= dt; e.dvx = 0; e.dvz = 0;
      e.lookOff = 0.6 * Math.sin(e.age * 1.3 + e.seed * 9);
      if (e.waitT <= 0) nextPoint(e);
      return;
    }
    e.lookOff *= 1 - Math.min(1, dt * 4);
    const d = steer(e, p.x, p.z, speedOf(e, K.walk), 0.3);
    if (d <= 0.3) {
      if (p.wait > 0) e.waitT = p.wait; else nextPoint(e);
    }
  }
  function nextPoint(e) {
    const R = e.route;
    if (e.ri + 1 >= R.length && !e.loop) {
      e.routeDone = true; e.homeX = e.x; e.homeZ = e.z; e.homeYaw = e.yaw;
      setState(e, "idle");
      emit("routeEnd", e);
      return;
    }
    e.ri = (e.ri + 1) % R.length;
  }

  function officerNear(e) {
    for (let i = 0; i < enemies.length; i++) {
      const o = enemies[i];
      if (o !== e && o.alive && o.kind === "officer" && o.squad === e.squad && o.state !== "stunned") return true;
    }
    return false;
  }

  function chooseTarget(e) {
    e.tgt = null;
    if (!allies.length) return;
    if (pOk && e.vis && Math.random() < 0.5) return;
    // one of the (up to three) nearest allies in sight
    let n = 0, a0 = null, a1 = null, a2 = null, d0 = 1e9, d1 = 1e9, d2 = 1e9;
    for (let i = 0; i < allies.length; i++) {
      const a = allies[i];
      if (!a.alive || a.state === "hurt" || a.newborn) continue;
      const d = Math.hypot(a.x - e.x, a.z - e.z);
      if (d > FIRE_RANGE) continue;
      if (d < d0) { a2 = a1; d2 = d1; a1 = a0; d1 = d0; a0 = a; d0 = d; }
      else if (d < d1) { a2 = a1; d2 = d1; a1 = a; d1 = d; }
      else if (d < d2) { a2 = a; d2 = d; }
    }
    n = a2 ? 3 : a1 ? 2 : a0 ? 1 : 0;
    if (!n) return;
    const k = (Math.random() * n) | 0;
    const a = k === 0 ? a0 : k === 1 ? a1 : a2;
    if (sightOk(e.x, e.z, a.x, a.z)) e.tgt = a;
    else if (a0 !== a && sightOk(e.x, e.z, a0.x, a0.z)) e.tgt = a0;
  }

  function pickCover(e, tx, tz) {
    const pts = world && world.coverPoints;
    e.coverI = -1; e.atCover = false;
    if (pts && pts.length) {
      let best = -1, bd = 9;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], d = Math.hypot(p.x - e.x, p.z - e.z);
        if (d >= bd || Math.hypot(p.x - tx, p.z - tz) < 5) continue;
        let taken = false;
        for (let j = 0; j < enemies.length; j++) if (enemies[j] !== e && enemies[j].alive && enemies[j].coverI === i) { taken = true; break; }
        if (!taken) { best = i; bd = d; }
      }
      if (best >= 0) { e.coverI = best; e.cx = pts[best].x; e.cz = pts[best].z; return; }
    }
    // no cover point: sidestep across the line to the target
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || 1;
    const side = (Math.random() < 0.5 ? 1 : -1) * rnd(1.4, 2.6);
    e.cx = e.x + (dz / d) * side; e.cz = e.z - (dx / d) * side;
  }

  function startAim(e, tx, tz, ty) {
    e.token = true; shooters++;
    e.aimDur = 0.75 * combat.aimScale * (e.kind !== "officer" && officerNear(e) ? 0.85 : 1);
    e.locked = false;
    e.aimPoint.x = tx; e.aimPoint.y = ty; e.aimPoint.z = tz;
    setState(e, "aim");
    _v1.set(e.muzzle.x, e.muzzle.y, e.muzzle.z); _v2.set(tx, ty, tz);
    e.tele = fx.telegraph(_v1, _v2, e.aimDur, 0xff3020);
    if (e.tgt === null) au.aimWarn(panOf(e.x, e.z));
    emit("aim", e, e.tgt || player);
  }

  function fireShot(e) {
    const first = e.shotN === 0;
    const sc = first ? 0.1 : 0.25;
    const ax = e.aimPoint.x + rnd(-sc, sc), az = e.aimPoint.z + rnd(-sc, sc), ay = e.aimPoint.y;
    const mx = e.muzzle.x, my = e.muzzle.y, mz = e.muzzle.z;
    const dx = ax - mx, dz = az - mz, d = Math.hypot(dx, dz) || 1;
    _v1.set(mx, my, mz); _v2.set(ax, ay, az);
    fx.muzzleFlash(_v1, dx / d, dz / d, 1);
    au.gunshot(farOf(e.x, e.z), panOf(e.x, e.z), e.def.gun);
    let ft = fx.tracer(_v1, _v2, 90, 0xffe9a0);
    if (typeof ft !== "number" || !(ft >= 0)) ft = d / 90;
    for (let i = 0; i < SHOT_MAX; i++) {
      const s = shots[i];
      if (s.on) continue;
      s.on = true; s.t = ft; s.sx = mx; s.sy = my; s.sz = mz; s.ax = ax; s.ay = ay; s.az = az; s.ex = e.x; s.ez = e.z; s.enemy = e; s.tgt = e.tgt; s.first = first;
      break;
    }
    e.shotN++; e.flash = Math.max(e.flash, 0.35); e.hitW = Math.max(e.hitW, 0.5);
    emit("shot", e);
  }

  function resolveShot(s) {
    s.on = false;
    const tgt = s.tgt;
    const isPlayer = !tgt;
    if (isPlayer && !pOk) return;
    if (!isPlayer && !tgt.alive) return;
    const tx = isPlayer ? player.x : tgt.x, tz = isPlayer ? player.z : tgt.z;
    // distance from the target to the shot line (extended a little past the aim point)
    let dx = s.ax - s.sx, dz = s.az - s.sz;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const along = clamp((tx - s.sx) * dx + (tz - s.sz) * dz, 0, L + 2.5);
    const off = Math.hypot(tx - (s.sx + dx * along), tz - (s.sz + dz * along));
    const pan = panOf(s.ax, s.az);
    if (off <= 0.45) {
      // anything solid between the muzzle and the target?
      let blocked = null;
      const list = world && world.cover;
      const D = Math.hypot(tx - s.sx, tz - s.sz) || 1;
      if (list) {
        for (let i = 0; i < list.length && !blocked; i++) {
          const c = list[i];
          if (c.on === false) continue;
          if (Math.hypot(c.x - s.ex, c.z - s.ez) < c.r + 0.9) continue;       // the shooter's own cover
          const u = clamp(((c.x - s.sx) * (tx - s.sx) + (c.z - s.sz) * (tz - s.sz)) / (D * D), 0, 1);
          const qx = s.sx + (tx - s.sx) * u - c.x, qz = s.sz + (tz - s.sz) * u - c.z, q2 = qx * qx + qz * qz;
          if (q2 > c.r * c.r) continue;
          const inside = Math.hypot(tx - c.x, tz - c.z) < c.r;
          const h = c.h === undefined ? 1.2 : c.h;
          if (inside) { if (isPlayer && pSneak) blocked = c; continue; }      // a sandbag ring: safe while sneaking
          const ue = Math.max(0, u - Math.sqrt(c.r * c.r - q2) / D);
          const lineH = s.sy + (0.2 - s.sy) * ue;
          if (h > lineH) { blocked = c; _v4.set(s.sx + (tx - s.sx) * ue, Math.min(h, lineH), s.sz + (tz - s.sz) * ue); }
        }
      }
      if (blocked) {
        if (Math.hypot(tx - blocked.x, tz - blocked.z) < blocked.r) {
          // the ring's wall on the shooter's side
          const bd = Math.hypot(s.sx - blocked.x, s.sz - blocked.z) || 1;
          _v4.set(blocked.x + ((s.sx - blocked.x) / bd) * blocked.r, 0.4, blocked.z + ((s.sz - blocked.z) / bd) * blocked.r);
        }
        _v4.y += hAt(_v4.x, _v4.z);
        fx.bulletImpact(_v4, blocked.surface || "concrete");
        au.ricochet(panOf(_v4.x, _v4.z));
        return;
      }
      if (sightOk(s.sx, s.sz, tx, tz)) {
        if (isPlayer) {
          const dmg = combat.bulletDamage * combat.damageScale;
          _src.x = s.ex; _src.z = s.ez; _src.kind = "bullet"; _src.knock = 1.2;
          if (ctx.health && ctx.health.damage(dmg, _src)) { emit("playerHit", s.enemy, dmg); return; }
          au.bulletWhiz(pan);
        } else {
          hurtAlly(tgt, combat.bulletDamage, s.enemy);
          return;
        }
      }
    } else if (isPlayer && off < 1.9) au.bulletWhiz(pan);
    _v1.set(s.ax, hAt(s.ax, s.az) + 0.04, s.az);
    const surf = impactSurf(s.ax, s.az);
    fx.bulletImpact(_v1, surf);
    au.bulletHit(surf, pan);
  }

  function updateEnemy(e, dt) {
    const K = e.def;
    e.age += dt; e.t += dt;
    if (e.venomT > 0) e.venomT -= dt;
    if (e.staggerT > 0) e.staggerT -= dt;
    if (e.tokenCd > 0) e.tokenCd -= dt;
    e.staggered = e.staggerT > 0 || e.hp < STAGGER_HP;
    e.dvx = 0; e.dvz = 0;
    if (e.grow < 1) {                       // a dream soldier rising out of the quilt
      e.grow = Math.min(1, e.grow + dt / 1.2);
      e.fade = 0.78 * sstep(0, 1, e.grow);
      if (e.grow >= 1) e.targetable = true;
      return;
    }
    if (e.staggered) {
      e.ringT -= dt;
      if (e.ringT <= 0) { e.ringT = 0.55; fx.ring(e.x, e.z, 0xffd24a, e.y + 0.05); }
    }
    if (e.wantAlert) { e.wantAlert = false; becomeAlert(e, px, pz, false, true); }

    if (e.state === "stunned") {
      e.stunT -= dt;
      if (e.stunT <= 0) { e.stunT = 0; e.knocked = false; setState(e, e.aware ? "chase" : "idle"); }
      return;
    }
    if (e.staggerT > 0) return;             // swaying on the spot: cannot act
    const d = Math.hypot(px - e.x, pz - e.z);

    if (!K.human) { updateRival(e, dt, d); return; }

    if (e.passive) {
      e.aware = false; e.seen = 0;
      if (e.state === "patrol") patrolStep(e, dt);
      else if (e.route && !e.routeDone) setState(e, "patrol");
      else if (!e.carrying && pOk && d < 10 && !e.post) faceTo(e, px, pz);
      else if (e.post) e.faceYaw = e.homeYaw;
      return;
    }
    if (!K.senses) {                         // dream soldiers that hunt: always know where you are
      if (!e.aware && pOk) { e.aware = true; setState(e, "chase"); }
      e.vis = pOk; e.lastX = px; e.lastZ = pz; e.lostT = 0;
      meleeAware(e, dt, d);
      return;
    }

    e.vis = sense(e, d, dt);

    if (e.aware) {
      if (e.vis) { e.lostT = 0; e.lastX = px; e.lastZ = pz; }
      else if (e.tgt && e.tgt.alive) e.lostT = Math.min(e.lostT, 3);
      else e.lostT += dt;
      if (e.squadT > 0) {
        e.squadT -= dt;
        if (e.squadT <= 0) {
          e.squadT = -1;
          for (let i = 0; i < enemies.length; i++) {
            const o = enemies[i];
            if (o !== e && o.alive && !o.aware && o.squad === e.squad && Math.hypot(o.x - e.x, o.z - e.z) <= 18) becomeAlert(o, e.lastX, e.lastZ, false, true);
          }
        }
      }
      if (e.lostT >= 6 && e.state !== "aim" && e.state !== "attack" && e.state !== "windup") { loseTrack(e); return; }
      if (e.kind === "officer") {
        e.voiceT -= dt;
        if (e.voiceT <= 0) { e.voiceT = rnd(5, 8); say(e, "order"); }
      }
      if (K.ranged) rangedAware(e, dt, d); else meleeAware(e, dt, d);
      return;
    }

    // ---- unaware: patrol, post, sleep, suspicion ----
    if (e.asleep) {
      e.seen = 0;
      if (pOk && pRun && d < 2.5) { e.asleep = false; e.lastX = px; e.lastZ = pz; e.susT = 3; e.investigate = false; setState(e, "suspicious"); say(e, "huh"); emit("suspicious", e); }
      else { e.voiceT -= dt; if (e.voiceT <= 0) { e.voiceT = rnd(9, 16); if (d < 14) say(e, "yawn"); } }
      return;
    }
    if (e.vis) {
      e.seen += (dt * combat.seenRate) / (1.5 * (d / Math.max(0.5, e.coneRange)) + 0.35);
      e.lastX = px; e.lastZ = pz;
    } else if (pOk && pRun && d < 4 && e.behind(px, pz)) {
      e.seen += 0.5 * dt; e.lastX = px; e.lastZ = pz;
    } else e.seen -= 0.6 * dt;
    e.seen = clamp(e.seen, 0, 1);
    if (e.seen >= 1) { becomeAlert(e, px, pz, true, false); return; }

    if (e.state === "suspicious") {
      if (e.investigate) {
        const dd = steer(e, e.lastX, e.lastZ, speedOf(e, K.walk * 1.15), 1.3);
        if (dd <= 1.3) {
          e.susT -= dt;
          e.lookOff = 0.75 * Math.sin(e.t * 1.7);
          if (e.susT <= 0) { say(e, "lost"); backToRoute(e); }
        }
      } else {
        if (e.seen > 0.7) steer(e, e.lastX, e.lastZ, speedOf(e, 0.9), 1.5); else faceTo(e, e.lastX, e.lastZ);
        if (e.seen < 0.04 && e.t > 2) backToRoute(e);
      }
      return;
    }
    if (e.state === "search") {
      const dd = steer(e, e.lastX, e.lastZ, speedOf(e, 1.7), 0.8);
      if (dd <= 0.8 || e.t > 9) {
        e.susT -= dt;
        e.lookOff = 0.9 * Math.sin(e.t * 1.5);
        if (e.susT <= 0) { say(e, "lost"); emit("lost", e); e.seen = 0; backToRoute(e); }
      }
      return;
    }
    if (e.seen > 0.35) {
      setState(e, "suspicious"); e.investigate = false;
      say(e, "huh"); emit("suspicious", e);
      return;
    }
    if (e.state === "patrol") { patrolStep(e, dt); return; }
    // idle
    if (e.route && !e.routeDone) { setState(e, "patrol"); return; }
    e.faceYaw = e.homeYaw;
    e.lookOff = e.sweep ? e.sweep * Math.sin(e.age * (TAU / 5) + e.seed * TAU) : e.lookOff * (1 - Math.min(1, dt * 3));
  }

  function meleeAware(e, dt, d) {
    const K = e.def;
    if (!pOk) { faceTo(e, e.lastX, e.lastZ); return; }
    if (e.state === "alert") {
      faceTo(e, e.lastX, e.lastZ);
      if (e.t >= e.reactT) setState(e, "chase");
      return;
    }
    if (e.state === "windup") {
      const ally = e.tgt;
      if (ally && !ally.alive) { cancelZone(e); e.tgt = null; setState(e, "chase"); return; }
      faceTo(e, ally ? ally.x : px, ally ? ally.z : pz);
      const wd = (e.windup > 0 ? e.windup : K.windup) * combat.aimScale;
      if (e.t >= wd) {
        e.zone = undefined;
        setState(e, "attack");
        if (ally) { if (Math.hypot(ally.x - e.x, ally.z - e.z) <= GRAB_R + 0.1) knockOutAlly(ally, e); e.tgt = null; }
        else if (d <= GRAB_R && pOk) { e.caught = true; emit("caught", e); }
      }
      return;
    }
    if (e.state === "attack") {
      if (e.t >= (e.caught ? 1.5 : 0.75)) { e.caught = false; setState(e, "chase"); }
      return;
    }
    // chase
    const by = e.lastBy;
    if (by && by.alive && d > 3 && Math.hypot(by.x - e.x, by.z - e.z) < 1.5) {
      e.tgt = by; setState(e, "windup");
      return;
    }
    const tx = e.vis ? px : e.lastX, tz = e.vis ? pz : e.lastZ;
    const dd = steer(e, tx, tz, speedOf(e, K.chase), e.vis ? 0.85 : 0.5);
    if (!e.vis && dd <= 0.5) e.lookOff = 0.8 * Math.sin(e.t * 1.6); else e.lookOff = 0;
    if (e.vis && d <= GRAB_R) {
      e.tgt = null;
      setState(e, "windup");
      _zone.shape = "circle"; _zone.x = px; _zone.z = pz; _zone.r = 1.1; _zone.seconds = (e.windup > 0 ? e.windup : K.windup) * combat.aimScale; _zone.colorHex = 0xff3020;
      e.zone = fx.dangerZone(_zone);
      say(e, "hey", true);
    }
  }

  function rangedAware(e, dt, d) {
    const K = e.def;
    let tgt = e.tgt;
    if (tgt && !tgt.alive) { tgt = e.tgt = null; }
    if (!tgt && !pOk && e.state !== "attack" && e.state !== "cover") {
      if (e.state === "aim") { releaseToken(e); setState(e, "chase"); }
      faceTo(e, e.lastX, e.lastZ);
      return;
    }
    const tx = tgt ? tgt.x : px, tz = tgt ? tgt.z : pz;
    const td = tgt ? Math.hypot(tx - e.x, tz - e.z) : d;
    const ty = (tgt ? tgt.y : py) + 0.2;
    if (e.state === "alert") {
      faceTo(e, e.lastX, e.lastZ);
      if (e.t >= e.reactT) setState(e, "chase");
      return;
    }
    if (e.state === "aim") {
      const frac = e.t / e.aimDur;
      if (!e.locked) {
        if (td < TOO_CLOSE) { releaseToken(e, 0.4); setState(e, "chase"); return; }
        if (frac >= 0.7) e.locked = true;
        else if (tgt || e.vis) { e.aimPoint.x = tx; e.aimPoint.y = ty; e.aimPoint.z = tz; }
      }
      faceTo(e, e.aimPoint.x, e.aimPoint.z);
      if (e.tele !== undefined) {
        _v1.set(e.muzzle.x, e.muzzle.y, e.muzzle.z); _v2.set(e.aimPoint.x, e.aimPoint.y, e.aimPoint.z);
        fx.telegraphMove(e.tele, _v1, _v2);
      }
      if (e.t >= e.aimDur) {
        e.tele = undefined;
        setState(e, "attack");
        e.shotsLeft = K.burst; e.shotT = 0; e.shotN = 0;
      }
      return;
    }
    if (e.state === "attack") {
      faceTo(e, e.aimPoint.x, e.aimPoint.z);
      e.shotT -= dt;
      while (e.shotT <= 0 && e.shotsLeft > 0) { fireShot(e); e.shotsLeft--; e.shotT += K.gap; }
      if (e.shotsLeft <= 0 && e.shotT <= -0.08) {
        setState(e, "cover");
        e.susT = rnd(1.2, 1.8);
        pickCover(e, tx, tz);
      }
      return;
    }
    if (e.state === "cover") {
      const dd = steer(e, e.cx, e.cz, speedOf(e, K.chase), 0.3);
      e.atCover = dd <= 0.3 && e.coverI >= 0;
      if (dd <= 0.3) faceTo(e, tx, tz);
      e.susT -= dt;
      if (e.susT <= 0) { releaseToken(e); setState(e, "chase"); }
      return;
    }
    // chase: pick a target now and then, close in, take a fire token when one is free
    e.pickT -= dt;
    if (e.pickT <= 0) { e.pickT = rnd(0.8, 1.4); chooseTarget(e); return; }
    const canSee = tgt ? true : e.vis;
    if (td < TOO_CLOSE + 0.3) {              // too close to aim: back away, facing the target
      faceTo(e, tx, tz);
      const k = 1.5 / (td || 1);
      e.dvx = (e.x - tx) * k; e.dvz = (e.z - tz) * k;
      return;
    }
    if (canSee && td <= FIRE_RANGE) {
      faceTo(e, tx, tz);
      if (e.tokenCd <= 0 && shooters < combat.maxShooters) { startAim(e, tx, tz, ty); return; }
      // no token: keep the rifle up, drift sideways, close in if far
      e.strafeT -= dt;
      if (e.strafeT <= 0) { e.strafeT = rnd(1.0, 2.2); e.strafe = -e.strafe; }
      const ux = (tx - e.x) / (td || 1), uz = (tz - e.z) / (td || 1);
      const fwd = td > 12 ? 1.2 : td < 6 ? -0.5 : 0;
      e.dvx = uz * e.strafe * 0.7 + ux * fwd; e.dvz = -ux * e.strafe * 0.7 + uz * fwd;
      return;
    }
    steer(e, tgt ? tx : e.lastX, tgt ? tz : e.lastZ, speedOf(e, K.chase), 1.2);
  }

  function updateRival(e, dt, d) {
    const K = e.def;
    if (e.passive) {
      if (e.state === "patrol") patrolStep(e, dt); else if (e.route && !e.routeDone) setState(e, "patrol");
      return;
    }
    // nearest target: the player or an ally
    let tgt = null, td = pOk ? d * 0.85 : 1e9;
    for (let i = 0; i < allies.length; i++) {
      const a = allies[i];
      if (!a.alive || a.state === "hurt" || a.newborn) continue;
      const ad = Math.hypot(a.x - e.x, a.z - e.z);
      if (ad < td) { td = ad; tgt = a; }
    }
    if (e.state === "windup" || e.state === "attack") tgt = e.tgt;
    if (tgt && !tgt.alive) { cancelZone(e); tgt = e.tgt = null; setState(e, "chase"); return; }
    const tx = tgt ? tgt.x : px, tz = tgt ? tgt.z : pz;
    const rd = Math.hypot(tx - e.x, tz - e.z);
    if (e.state === "idle" || e.state === "patrol") {
      if ((tgt || pOk) && (rd <= K.range * combat.viewScale || e.aware)) {
        e.aware = true; setState(e, "chase");
        au.tribeChirp("war", 0.7, panOf(e.x, e.z), e.big ? 0.7 : 1.1);
        emit("spotted", e);
      } else if (e.state === "patrol") patrolStep(e, dt);
      else if (e.route && !e.routeDone) setState(e, "patrol");
      return;
    }
    if (!tgt && !pOk) { setState(e, "idle"); e.aware = false; return; }
    if (e.state === "windup") {
      const wd = (e.windup > 0 ? e.windup : e.big ? 0.8 : K.windup) * combat.aimScale;
      if (!e.big) faceTo(e, tx, tz); else e.faceYaw = e.lockYaw;
      if (e.t >= wd) {
        e.zone = undefined; e.hitOnce = false;
        setState(e, "attack");
        if (e.big) e.dashT = 0.45;
        else {
          e.kx = Math.sin(e.yaw) * 3.2; e.kz = Math.cos(e.yaw) * 3.2; e.hopV = 1.6;
          if (rd <= 1.15 + (tgt ? 0.1 : 0)) rivalBite(e, tgt);
        }
      }
      return;
    }
    if (e.state === "attack") {
      if (e.big && e.dashT > 0) {
        e.dashT -= dt;
        e.dvx = Math.sin(e.lockYaw) * 9; e.dvz = Math.cos(e.lockYaw) * 9;
        if (!e.hitOnce && rd <= 0.95) { e.hitOnce = true; rivalBite(e, tgt); }
      }
      if (e.t >= (e.big ? 1.5 : 0.9)) setState(e, "chase");
      return;
    }
    // chase
    const reach = e.big ? 3.4 : 1.0;
    const dd = steer(e, tx, tz, speedOf(e, K.chase), reach - 0.15);
    if (dd <= reach) {
      e.tgt = tgt;
      setState(e, "windup");
      e.lockYaw = Math.atan2(tx - e.x, tz - e.z);
      if (!tgt) {
        _zone.seconds = (e.windup > 0 ? e.windup : e.big ? 0.8 : K.windup) * combat.aimScale; _zone.colorHex = 0xff3020;
        if (e.big) { _zone.shape = "line"; _zone.x = e.x; _zone.z = e.z; _zone.yaw = e.lockYaw; _zone.len = 4.6; _zone.width = 1.4; }
        else { _zone.shape = "circle"; _zone.x = px; _zone.z = pz; _zone.r = 1.0; }
        e.zone = fx.dangerZone(_zone);
      }
      au.tribeChirp("war", 0.5, panOf(e.x, e.z), e.big ? 0.65 : 1.2);
    }
  }
  function rivalBite(e, tgt) {
    if (tgt) { hurtAlly(tgt, e.big ? 30 : 15, e); return; }
    if (!pOk || !ctx.health) return;
    const dmg = combat.rivalDamage * (e.big ? 2 : 1) * combat.damageScale;
    _src.x = e.x; _src.z = e.z; _src.kind = "melee"; _src.knock = e.big ? 6 : 3;
    if (ctx.health.damage(dmg, _src)) emit("playerHit", e, dmg);
  }

  function moveEnemy(e, dt) {
    const K = e.def;
    const acc = 1 - Math.exp(-dt * (K.human ? 7 : 10));
    e.vx += (e.dvx - e.vx) * acc; e.vz += (e.dvz - e.vz) * acc;
    const kd = Math.exp(-dt * 3.5);
    const ox = e.x, oz = e.z;
    e.x += (e.vx + e.kx) * dt; e.z += (e.vz + e.kz) * dt;
    e.kx *= kd; e.kz *= kd;
    if (e.hopV !== 0 || e.hop > 0) {
      e.hop += e.hopV * dt; e.hopV -= 12 * dt;
      if (e.hop <= 0) { e.hop = 0; e.hopV = 0; }
    }
    // keep apart from other living enemies and off the player
    if (e.alive) {
      for (let i = 0; i < enemies.length; i++) {
        const o = enemies[i];
        if (o === e || !o.alive) continue;
        const dx = e.x - o.x, dz = e.z - o.z, rr = e.r + o.r - 0.08, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) { const dd = Math.sqrt(d2), p = (rr - dd) * 0.5; e.x += (dx / dd) * p; e.z += (dz / dd) * p; }
      }
      const dx = e.x - px, dz = e.z - pz, rr = e.r + 0.3, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) { const dd = Math.sqrt(d2); e.x = px + (dx / dd) * rr; e.z = pz + (dz / dd) * rr; }
    }
    collide(e, e.r);
    e.y = hAt(e.x, e.z);
    const moved = Math.hypot(e.x - ox, e.z - oz);
    const sp = dt > 0 ? Math.hypot(e.vx, e.vz) : 0;
    e.animSpeed += (Math.min(sp, moved / Math.max(dt, 1e-4) + 0.05) - e.animSpeed) * Math.min(1, dt * 10);
    const stride = lerp(0.7, 1.12, sstep(1.7, 2.6, e.animSpeed));
    const g0 = e.gait;
    e.gait += (e.alive ? moved : 0) * (PI / stride);
    if (K.human && e.alive && Math.floor(e.gait / PI) !== Math.floor(g0 / PI)) {
      const d = Math.hypot(e.x - px, e.z - pz);
      if (d < 11) au.step(surfAt(e.x, e.z), 0.12 + 0.3 * (1 - d / 11) * (e.animSpeed > 2 ? 1.3 : 1), panOf(e.x, e.z));
    }
    const rate = (e.aware ? 7.5 : 4) * (K.human ? 1 : 1.6);
    e.yaw += clamp(wrapPi(e.faceYaw - e.yaw), -rate * dt, rate * dt);
    if (moved > 1e-4 || Math.abs(wrapPi(e.faceYaw - e.yaw)) > 1e-3 || e.hop > 0) e.still = false;
  }

  function updateBodies(dt) {
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i], e = b.enemy;
      b.age += dt;
      // the level may move a settled body (level 6 re-places them): follow it
      if (b.x !== b.lx || b.z !== b.lz || b.yaw !== b.lyaw) { e.x = b.x; e.z = b.z; e.yaw = e.faceYaw = b.yaw; e.kx = e.kz = 0; e.still = false; }
      if (e.lie < 1) {
        e.lie = Math.min(1, e.lie + dt / 0.5);
        e.still = false;
        if (e.lie > 0.82 && !b.thud) {
          b.thud = true;
          if (e.kind !== "dreamSoldier") { au.bodyFall(surfAt(e.x, e.z)); fx.footDust(e.x, e.y + 0.05, e.z, 0.8, 0xbfb49a); }
        }
      }
      if (Math.abs(e.kx) + Math.abs(e.kz) > 0.03 || e.hop > 0 || e.hopV !== 0) { e.faceYaw = e.yaw; e.dvx = e.dvz = 0; e.vx = e.vz = 0; moveEnemy(e, dt); e.still = false; }
      else { e.kx = e.kz = 0; e.y = hAt(e.x, e.z); }
      if (e.flash > 0) e.still = false;
      b.x = b.lx = e.x; b.z = b.lz = e.z; b.y = e.y; b.yaw = b.lyaw = e.yaw;
      if (b.shrinkT >= 0) {
        b.shrinkT -= dt; e.shrink = clamp(b.shrinkT / 0.4, 0, 1); e.still = false;
        if (b.shrinkT <= 0) { removeBody(b); continue; }
      } else if (b.fadeT >= 0) {
        b.fadeT -= dt; e.still = false;
        e.fade = (b.kind === "dreamSoldier" ? 0.5 : 1) * clamp(b.fadeT / 1.5, 0, 1);
        if (b.fadeT <= 0) { removeBody(b); continue; }
      } else if (b.age >= combat.bodyTTL) {
        b.fadeT = 1.5; b.alive = false; b.targetable = false;
        if (b.kind === "dreamSoldier") { fx.dissolve(b.x, b.y, b.z, 0.5, 0xbfd0ff, 40); au.dissolve(panOf(b.x, b.z)); }
      } else if (b.kind === "dreamSoldier" && e.fade > 0.5) { e.fade = Math.max(0.5, e.fade - dt * 0.5); e.still = false; }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // allies

  function allyHit(dmg, src) { if (!this.alive) return false; hurtAlly(this, +dmg || 0, (src && src.enemy) || null); return true; }
  function allyKnockOut(src) { if (this.alive) knockOutAlly(this, (src && src.enemy) || null); }

  function lookOf(a, look) {
    const furs = looks.home.furs;
    const s = typeof look === "number" ? Math.abs(look | 0) : (Math.random() * 9973) | 0;
    a.look = s;
    a.tint = furs[s % furs.length];
    a.scale = 0.86 + 0.19 * (((s * 7 + 3) % 11) / 10);
  }

  function addAlly(x, z, o) {
    o = o || {};
    const hero = o.hero || null;
    const a = {
      x, y: hAt(x, z), z, yaw: Math.atan2(px - x, pz - z) || 0, alive: true, hp: 0, maxHp: 0, state: "follow", name: "", r: 0.35, targetable: true,
      hit: allyHit, knockOut: allyKnockOut,
      hero, ci: -1, look: 0, tint: 0xffffff, scale: 1, paint: o.paint === undefined ? null : o.paint, newborn: !!o.newborn, bornT: 0,
      tgt: null, atkCd: rnd(0, 0.6), atkT: -1, hitDone: false, vx: 0, vz: 0, kx: 0, kz: 0, hop: 0, hopV: 0, hopDelay: -1, speed: 0,
      grp: allySerial % 4, serial: allySerial++, heroMode: "", orderSeen: -1, fallT: 0, seed: Math.random(), cheerT: 0, hurt: false,
    };
    a.maxHp = a.hp = typeof o.hp === "number" ? o.hp : 60;
    if (hero) {
      a.name = hero.name || "Hero";
      if (typeof hero.x === "number") { a.x = hero.x; a.z = hero.z; }
    } else {
      a.name = "Ally " + (a.serial + 1);
      lookOf(a, o.look);
      a.ci = crowdFree.length ? crowdFree.pop() : -1;
      if (a.ci >= 0) {
        crowdUsed++;
        crowd.paint(a.ci, a.paint);
        crowdAnim[a.ci] = "";
        setAnim(a.ci, a.newborn ? "down" : "idle");
        crowd.set(a.ci, a.x, a.y, a.z, a.yaw, a.scale, a.tint);
      }
    }
    if (a.newborn) { a.state = "newborn"; a.bornT = 0; }
    allies.push(a);
    if (allies.length > rosterPeak) rosterPeak = allies.length;
    if (ctx.army) ctx.army.add(a);
    return a;
  }

  function setAnim(ci, name) {
    if (ci < 0 || crowdAnim[ci] === name) return;
    crowdAnim[ci] = name;
    crowd.anim(ci, name);
  }
  function heroDo(a, what, opts) {
    const h = a.hero;
    if (!h || a.heroMode === what) return;
    a.heroMode = what;
    if (typeof h.do === "function") h.do(what, opts);
  }

  function hurtAlly(a, dmg, enemy) {
    if (!a.alive || a.state === "hurt") return;
    a.hp -= dmg;
    _v1.set(a.x, a.y + 0.2, a.z);
    fx.hitBurst(_v1, 0xfff0c8);
    if (a.hp <= 0) knockOutAlly(a, enemy);
    else { au.tribeChirp("scared", 0.5, panOf(a.x, a.z), 1.1); a.kx += rnd(-1, 1); a.kz += rnd(-1, 1); }
  }

  function knockOutAlly(a, enemy) {
    if (!a.alive || a.state === "hurt") return;
    a.hp = 0; a.tgt = null;
    if (a.hero) {
      // named members never die on screen: hurt, limps to the rear and sits
      a.state = "hurt"; a.targetable = false;
      a.heroMode = "";
      _slot.x = px - Math.sin(player.yaw) * 6; _slot.z = pz - Math.cos(player.yaw) * 6;
      if (mode === "retreat" || mode === "hold") { _slot.x = orderX; _slot.z = orderZ; }
      heroDo(a, "flee", { to: { x: _slot.x, z: _slot.z } });
      a.hurt = true;
      emit("allyDown", a, enemy || null);
      return;
    }
    a.alive = false; a.targetable = false; a.state = "down"; a.fallT = 0;
    const i = allies.indexOf(a);
    if (i >= 0) allies.splice(i, 1);
    fallen.push(a);
    setAnim(a.ci, "down");
    _v1.set(a.x, a.y + 0.25, a.z);
    fx.sadMotes(_v1, 6);
    // the nearest living ally mourns
    let near = null, nd = 1e9;
    for (let k = 0; k < allies.length; k++) {
      const o = allies[k], d = Math.hypot(o.x - a.x, o.z - a.z);
      if (o.alive && d < nd) { nd = d; near = o; }
    }
    if (near) au.tribeChirp("mourn", 0.8, panOf(near.x, near.z), 1);
    else au.tribeChirp("mourn", 0.6, panOf(a.x, a.z), 1);
    if (ctx.army) ctx.army.lose(a);
    emit("allyDown", a, enemy || null);
  }

  function freeAlly(a) {
    if (a.ci >= 0) { crowd.hide(a.ci); crowdAnim[a.ci] = ""; crowdFree.push(a.ci); crowdUsed--; a.ci = -1; }
  }

  function order(m, point) {
    mode = m === "attack" || m === "hold" || m === "charge" || m === "retreat" ? m : "follow";
    combat.mode = mode;
    if (point) { orderX = point.x; orderZ = point.z; orderR = typeof point.r === "number" ? point.r : 0; }
    else if (mode !== "follow" && mode !== "attack") { orderX = px; orderZ = pz; orderR = 0; }
    orderSerial++;
  }

  // where ally number i (of n) should stand for the current order
  function stationOf(a, i, n, out) {
    if (mode === "follow" || mode === "attack") {
      if (ctx.army && ctx.army.slot) return ctx.army.slot(i, out, 0.9);
      out.x = px - Math.sin(player.yaw) * (1.4 + 0.5 * i); out.z = pz - Math.cos(player.yaw) * (1.4 + 0.5 * i);
      return out;
    }
    if (mode === "hold" && orderR > 1.5) {       // line the rim of the circle
      const ang = (i / Math.max(1, n)) * TAU, r = orderR - 0.8;
      out.x = orderX + Math.sin(ang) * r; out.z = orderZ + Math.cos(ang) * r;
      return out;
    }
    // a loose cluster round the point (golden-angle spiral)
    const r = i === 0 ? 0 : 0.75 * Math.sqrt(i + 0.5), ang = i * 2.39996;
    out.x = orderX + Math.sin(ang) * r; out.z = orderZ + Math.cos(ang) * r;
    return out;
  }

  function allyPickTarget(a) {
    if (mode === "retreat") { a.tgt = null; return; }
    const any = mode === "attack" || mode === "charge";
    const reach = mode === "attack" ? 14 : mode === "hold" ? 4.5 : 9;
    let best = null, bs = 1e9;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive || !e.targetable || e.passive) continue;
      if (!any && !e.aware) continue;
      const d = Math.hypot(e.x - a.x, e.z - a.z);
      if (d > reach) continue;
      if ((mode === "follow" || mode === "attack") && Math.hypot(e.x - px, e.z - pz) > 18) continue;
      const s = d + 2.2 * e.engaged - (a.tgt === e ? 1.5 : 0);
      if (s < bs) { bs = s; best = e; }
    }
    a.tgt = best;
  }

  function updateAlly(a, i, n, dt, think) {
    const hero = a.hero;
    if (a.state === "hurt") { if (hero && typeof hero.x === "number") { a.x = hero.x; a.z = hero.z; a.y = hAt(a.x, a.z); } return; }
    if (a.state === "newborn") {
      // lying on its side where the light set it down, then the sit-up, then it joins
      a.bornT += dt;
      setAnim(a.ci, a.bornT < 0.7 ? "down" : a.bornT < 2.3 ? "sit" : "cheer");
      if (a.bornT > 0.7) a.yaw += clamp(wrapPi(Math.atan2(px - a.x, pz - a.z) - a.yaw), -3 * dt, 3 * dt);
      if (a.bornT >= 3.0) {
        a.newborn = false; a.state = "follow";
        au.tribeChirp("greet", 0.8, panOf(a.x, a.z), 1.2);
        _v1.set(a.x, a.y + 0.35, a.z);
        fx.hearts(_v1, 2);
        emit("allyJoined", a);
      }
      return;
    }
    if (a.atkCd > 0) a.atkCd -= dt;
    if (think) allyPickTarget(a);
    let tgt = a.tgt;
    if (tgt && (!tgt.alive || !tgt.targetable)) tgt = a.tgt = null;
    let dvx = 0, dvz = 0, face = a.yaw, anim = "idle";

    if (tgt) {
      a.state = "attack";
      if (hero) heroDo(a, "fight");
      const dx = tgt.x - a.x, dz = tgt.z - a.z, d = Math.hypot(dx, dz) || 1;
      face = Math.atan2(dx, dz);
      const reach = tgt.r + 0.55;
      if (a.atkT >= 0) {
        // the leaping sting: forward for 0.22 s, the hit, then the hop back
        a.atkT += dt; anim = "attack";
        if (a.atkT < 0.22) { dvx = (dx / d) * 3.2; dvz = (dz / d) * 3.2; }
        else if (!a.hitDone) {
          a.hitDone = true;
          if (d <= reach + 0.5) { _src.x = a.x; _src.z = a.z; hitByAlly.by = a; hitByAlly.x = a.x; hitByAlly.z = a.z; tgt.hit(combat.allyDamage, hitByAlly); }
          a.kx = -(dx / d) * 2.6; a.kz = -(dz / d) * 2.6; a.hopV = 2.0;
        }
        if (a.atkT >= 0.5) { a.atkT = -1; a.atkCd = combat.allyRate - 0.5; }
      } else if (d > reach + 0.25) {
        const sp = 3.6;
        dvx = (dx / d) * sp; dvz = (dz / d) * sp; anim = "run";
      } else if (a.atkCd <= 0) { a.atkT = 0; a.hitDone = false; a.hopV = 2.4; anim = "attack"; }
      else {
        // circle while waiting for the next opening
        const s = a.serial % 2 ? 1 : -1;
        dvx = (dz / d) * s * 1.1; dvz = -(dx / d) * s * 1.1; anim = "walk";
      }
    } else {
      a.state = mode === "attack" ? "follow" : mode;
      a.atkT = -1;
      stationOf(a, i, n, _slot);
      if (hero) {
        // named members steer themselves; combat only reads where they are
        if (mode === "follow" || mode === "attack") heroDo(a, "follow", { dist: 1.6 + 0.5 * (i % 3), side: i % 2 ? 1 : -1 });
        else if (a.orderSeen !== orderSerial || a.heroMode !== "goto") { a.orderSeen = orderSerial; a.heroMode = ""; heroDo(a, "goto", { x: _slot.x, z: _slot.z, run: true }); }
        if (typeof hero.x === "number") { a.x = hero.x; a.z = hero.z; a.y = typeof hero.y === "number" ? hero.y : hAt(a.x, a.z); if (typeof hero.yaw === "number") a.yaw = hero.yaw; }
        return;
      }
      const dx = _slot.x - a.x, dz = _slot.z - a.z, d = Math.hypot(dx, dz);
      const following = mode === "follow" || mode === "attack";
      const stop = following ? 0.35 : 0.3;
      if (d > stop) {
        let sp = d > 1.4 ? 3.4 : Math.max(1.2, Math.min(3.4, player.speed || 0) + 0.3);
        if (following && pSneak) sp = Math.min(sp, d > 4 ? 2.4 : 1.5);
        if (mode === "charge" || mode === "retreat") sp = 3.8;
        sp *= Math.min(1, d / 0.6 + 0.3);
        dvx = (dx / d) * sp; dvz = (dz / d) * sp;
        face = Math.atan2(dx, dz);
        anim = sp > 2.2 ? "run" : "walk";
      } else if (following) face = a.yaw + wrapPi(player.yaw - a.yaw) * Math.min(1, dt * 3);
      else if (mode === "hold" && orderR > 1.5) face = Math.atan2(orderX - a.x, orderZ - a.z);
      if (a.cheerT > 0) { a.cheerT -= dt; anim = "cheer"; }
    }

    if (hero) {
      // fighting: combat moves the member itself
      a.x += (dvx + a.kx) * dt; a.z += (dvz + a.kz) * dt;
      a.kx *= Math.exp(-dt * 5); a.kz *= Math.exp(-dt * 5);
      if (think) collide(a, a.r);
      a.y = hAt(a.x, a.z);
      a.yaw += clamp(wrapPi(face - a.yaw), -9 * dt, 9 * dt);
      if (typeof hero.place === "function") hero.place(a.x, a.z, a.yaw);
      return;
    }

    const acc = 1 - Math.exp(-dt * 9);
    a.vx += (dvx - a.vx) * acc; a.vz += (dvz - a.vz) * acc;
    a.x += (a.vx + a.kx) * dt; a.z += (a.vz + a.kz) * dt;
    const kd = Math.exp(-dt * 5);
    a.kx *= kd; a.kz *= kd;
    // the followers copy the player's jump, one after another
    if (a.hopDelay >= 0) { a.hopDelay -= dt; if (a.hopDelay < 0 && a.hop <= 0) a.hopV = 3.6; }
    if (a.hopV !== 0 || a.hop > 0) {
      a.hop += a.hopV * dt; a.hopV -= 13 * dt;
      if (a.hop <= 0) { a.hop = 0; a.hopV = 0; }
    }
    // never in the player's way
    {
      const dx = a.x - px, dz = a.z - pz, d2 = dx * dx + dz * dz;
      if (d2 < 0.49 && d2 > 1e-6) { const d = Math.sqrt(d2), p = (0.7 - d) * Math.min(1, dt * 12); a.x += (dx / d) * p; a.z += (dz / d) * p; }
    }
    if (think) {
      for (let k = 0; k < allies.length; k++) {
        const o = allies[k];
        if (o === a || o.hero) continue;
        const dx = a.x - o.x, dz = a.z - o.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.3 && d2 > 1e-6) { const d = Math.sqrt(d2), p = (0.55 - d) * 0.5; a.x += (dx / d) * p; a.z += (dz / d) * p; }
      }
      collide(a, a.r);
    }
    a.y = hAt(a.x, a.z);
    a.speed = Math.hypot(a.vx, a.vz);
    if (anim === "run" && a.speed < 1.9) anim = a.speed > 0.25 ? "walk" : "idle";
    if (anim === "walk" && a.speed < 0.2) anim = "idle";
    a.yaw += clamp(wrapPi(face - a.yaw), -10 * dt, 10 * dt);
    setAnim(a.ci, anim);
  }
  const hitByAlly = { kind: "ally", x: 0, z: 0, by: null };

  function placeRing(i, n, x, z, out) {
    if (i === 0 && n === 1) { out.x = x; out.z = z; return out; }
    const r = 0.9 + 0.55 * Math.floor(i / 6), ang = (i % 6) / 6 * TAU + Math.floor(i / 6) * 0.5;
    out.x = x + Math.sin(ang) * r; out.z = z + Math.cos(ang) * r;
    return out;
  }

  // put the squad back: n = living allies wanted IN TOTAL (named heroes included). With x, z everyone is
  // placed round that point; without, the survivors stay and the missing ones re-appear where they last stood.
  function setAllies(n, x, z) {
    n = Math.max(0, n | 0);
    const placed = typeof x === "number" && typeof z === "number";
    for (let i = fallen.length - 1; i >= 0; i--) freeAlly(fallen[i]);
    fallen.length = 0;
    let heroes = 0, crowdN = 0;
    for (let i = 0; i < allies.length; i++) if (allies[i].hero) heroes++; else crowdN++;
    const want = Math.min(ALLY_MAX, Math.max(0, n - heroes));
    for (let i = allies.length - 1; i >= 0 && crowdN > want; i--) {
      const a = allies[i];
      if (a.hero) continue;
      allies.splice(i, 1); freeAlly(a); a.alive = false;
      if (ctx.army) ctx.army.remove(a);
      crowdN--;
    }
    let made = 0;
    while (crowdN < want) {
      const st = !placed && made < stashN ? stash[made] : null;
      let ax, az;
      if (st) { ax = st.x; az = st.z; }
      else if (placed) { ax = x; az = z; }
      else { stationOf(null, crowdN + heroes, want + heroes, _slot); ax = _slot.x; az = _slot.z; }
      addAlly(ax, az, { look: st ? st.look : crowdN * 3 + 1, paint: st ? st.paint : (allies.length && !allies[0].hero ? allies[0].paint : null) });
      crowdN++; made++;
    }
    for (let i = 0; i < allies.length; i++) {
      const a = allies[i];
      a.hp = a.maxHp; a.alive = true; a.targetable = true; a.tgt = null; a.atkT = -1; a.kx = a.kz = a.vx = a.vz = 0; a.hop = 0; a.hopV = 0;
      if (a.state === "hurt" || a.state === "attack") { a.state = "follow"; a.heroMode = ""; a.hurt = false; }
      if (a.newborn) { a.newborn = false; a.state = "follow"; }
      if (placed) {
        placeRing(i, allies.length, x, z, _slot);
        a.x = _slot.x; a.z = _slot.z; a.y = hAt(a.x, a.z);
        if (a.hero && typeof a.hero.place === "function") { a.hero.place(a.x, a.z, a.yaw); a.heroMode = ""; }
      }
    }
    return allies.length;
  }
  function reviveAllies() { return setAllies(Math.max(rosterPeak, allies.length)); }

  // ---------------------------------------------------------------------------------------------
  // rendering: the analytic rig

  const mRoot = new THREE.Matrix4(), mBody = new THREE.Matrix4(), mPel = new THREE.Matrix4(), mTor = new THREE.Matrix4(), mHead = new THREE.Matrix4();
  const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), mC = new THREE.Matrix4(), mT = new THREE.Matrix4();
  const _eu = new THREE.Euler(0, 0, 0, "YXZ"), _sc = new THREE.Vector3();
  function comp(out, parent, tx, ty, tz, rx, ry, rz) {
    _eu.set(rx, ry, rz, "YXZ");
    mT.makeRotationFromEuler(_eu);
    mT.setPosition(tx, ty, tz);
    if (parent) out.multiplyMatrices(parent, mT); else out.copy(mT);
    return out;
  }
  function put(s, i, m) { m.toArray(s.mat, i * 16); }
  function putFx(s, i, variant, fade, glow, flash) { const a = s.fx, k = i * 4; a[k] = variant; a[k + 1] = fade; a[k + 2] = glow; a[k + 3] = flash; }
  function zero(s, i) { zeroMats(s.mat, i, i + 1); }
  function p15(v) { return v <= 0 ? 0 : v * Math.sqrt(v); }

  function drawHuman(e, dt) {
    const hi = e.hi, K = e.def, sd = e.seed, t = now;
    const st = e.state;
    // action weights (smoothed so poses blend)
    const k = Math.min(1, dt * 11);
    const aiming = st === "aim" || st === "attack" || (K.ranged && e.aware && st === "chase" && e.vis && e.animSpeed < 1.2);
    e.aimW += ((K.ranged && aiming ? 1 : 0) - e.aimW) * k;
    e.windW += ((K.melee && st === "windup" ? 1 : 0) - e.windW) * k;
    e.atkW += ((K.melee && st === "attack" && e.t < 0.45 ? 1 : 0) - e.atkW) * Math.min(1, dt * 16);
    const swaying = e.alive && (e.staggerT > 0 || (st === "stunned" && !e.knocked));
    e.stagW += ((swaying ? 1 : 0) - e.stagW) * k;
    e.crouchW += ((st === "cover" && e.atCover ? 1 : 0) - e.crouchW) * Math.min(1, dt * 7);
    if (e.hitW > 0) e.hitW = Math.max(0, e.hitW - dt * 3.5);
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 5);
    // knock-down by a slap: down fast, up again at the end of the stun
    if (e.alive) {
      const wantLie = st === "stunned" && e.knocked && e.stunT > 0.45 ? 1 : 0;
      if (wantLie > e.lie) e.lie = Math.min(1, e.lie + dt / 0.3); else if (wantLie < e.lie) e.lie = Math.max(0, e.lie - dt / 0.45);
    }
    const L = e.lie * e.lie * (3 - 2 * e.lie), fs = e.fallSign;

    const sp = e.animSpeed, mv = sstep(0.05, 0.45, sp), run = sstep(1.7, 2.6, sp);
    const ph = e.gait, s = Math.sin(ph), c = Math.cos(ph);
    const amp = mv * lerp(0.42, 0.8, run);
    let hipL = amp * s, hipR = -amp * s;
    let knL = mv * (0.12 + lerp(0.7, 1.25, run) * p15(c)), knR = mv * (0.12 + lerp(0.7, 1.25, run) * p15(-c));
    const sw = amp * 0.8 * (K.ranged ? 0.3 : 1);
    let shL = -sw * s, shR = sw * s, abL = 0.07, abR = 0.07;
    let elL = 0.16 + 0.75 * run + 0.12 * mv, elR = elL;
    const br = Math.sin(t * 1.5 + sd * 40);
    let lean = 0.03 + 0.2 * run + 0.012 * br, twist = -0.17 * amp * s, pelTw = 0.1 * amp * s;
    let roll = 0.02 * Math.sin(t * 0.6 + sd * 10) * (1 - mv);
    let headYaw = clamp(e.lookOff, -1.2, 1.2), headPitch = 0, crouch = e.crouchW * 1.0;
    let gunPitch = -0.55, gunYaw = 0.95, gunX = 0.03, gunY = 0.26, gunZ = 0.17;

    // what the hands hold
    if (e.kind === "soldier") {
      shR = lerp(0.35, shR + 0.35, 0.25); elR = 1.55; abR = -0.25; shL = 0.8; elL = 1.15; abL = -0.45;
    } else if (e.kind === "guard") { shL = 0.55 + 0.05 * s; elL = 0.95; abL = 0.16; }
    else if (e.kind === "handler") {
      if (e.carrying) { shR = 0.95; elR = 2.0; abR = -0.05; } else { shR = 0.5 + 0.06 * s; elR = 0.9; abR = 0.08; }
    }
    if (e.asleep && e.alive) { lean += 0.2; headPitch = 0.55 + 0.05 * Math.sin(t * 0.9 + sd * 5); }
    // aim
    let w = e.aimW;
    if (w > 0.001) {
      const dAim = Math.hypot(e.aimPoint.x - e.x, e.aimPoint.z - e.z) || 6;
      const down = Math.atan2(1.3, Math.max(2, dAim));
      if (e.kind === "officer") { shR = lerp(shR, 1.45 - down, w); elR = lerp(elR, 0.06, w); abR = lerp(abR, -0.12, w); twist = lerp(twist, 0.28, w); }
      else {
        shR = lerp(shR, 1.12, w); elR = lerp(elR, 1.25, w); abR = lerp(abR, -0.32, w);
        shL = lerp(shL, 1.38, w); elL = lerp(elL, 0.5, w); abL = lerp(abL, -0.55, w);
        gunPitch = lerp(gunPitch, down, w); gunYaw = lerp(gunYaw, 0, w); gunX = lerp(gunX, -0.1, w); gunY = lerp(gunY, 0.4, w); gunZ = lerp(gunZ, 0.2, w);
      }
      lean = lerp(lean, 0.14, w * (1 - mv)); hipL += 0.26 * w * (1 - mv); hipR -= 0.2 * w * (1 - mv); knL += 0.2 * w * (1 - mv); knR += 0.12 * w * (1 - mv);
      headPitch += 0.1 * w;
    }
    // the grab: arms spread wide and low, then the lunge
    w = e.windW;
    if (w > 0.001) {
      lean = lerp(lean, 0.5, w); crouch = Math.max(crouch, 0.55 * w);
      shL = lerp(shL, 0.95, w); shR = lerp(shR, 0.95, w); abL = lerp(abL, 1.05, w); abR = lerp(abR, 1.05, w);
      elL = lerp(elL, 0.35, w); elR = lerp(elR, 0.35, w); headPitch += 0.25 * w;
    }
    w = e.atkW;
    if (w > 0.001) {
      lean = lerp(lean, 0.9, w); crouch = Math.max(crouch, 0.8 * w);
      shL = lerp(shL, 1.25, w); shR = lerp(shR, 1.25, w); abL = lerp(abL, -0.3, w); abR = lerp(abR, -0.3, w);
      elL = lerp(elL, 0.5, w); elR = lerp(elR, 0.5, w);
    }
    // stagger / shock
    w = e.stagW;
    if (w > 0.001) {
      const shock = st === "stunned" ? 1 : 0;
      lean = lerp(lean, 0.38 + 0.1 * Math.sin(t * 5.3 + sd * 7), w);
      roll += w * (0.13 * Math.sin(t * 3.1 + sd * 20) + shock * 0.06 * Math.sin(t * 41));
      shL = lerp(shL, 0.3 + shock * 0.3 * Math.sin(t * 37), w); shR = lerp(shR, 0.25 + shock * 0.3 * Math.sin(t * 33), w);
      elL = lerp(elL, 0.3, w); elR = lerp(elR, 0.3, w); abL = lerp(abL, 0.14 + shock * 0.4, w); abR = lerp(abR, 0.14 + shock * 0.4, w);
      crouch = Math.max(crouch, 0.35 * w); headPitch += 0.42 * w; headYaw += 0.3 * w * Math.sin(t * 2.3);
    }
    if (e.hitW > 0) { lean -= 0.28 * e.hitW; twist += 0.3 * e.hitW * (sd > 0.5 ? 1 : -1); }
    if (crouch > 0.001) { hipL += crouch * 0.95; hipR += crouch * 0.75; knL += crouch * 1.6; knR += crouch * 1.75; lean += crouch * 0.22; }
    // lying / falling
    if (L > 0.001) {
      const buckle = Math.sin(PI * L);
      // on the back: one knee drawn up with the foot flat; face down: a shin a little off the ground. Arms spread on the ground.
      const up = fs > 0, a = 0.2 + 0.45 * sd;
      hipL = lerp(hipL, up ? a : 0, L) + 0.5 * buckle; hipR = lerp(hipR, up ? 0.03 : 0, L) + 0.4 * buckle;
      knL = lerp(knL, up ? 2 * a : 0.15 + 0.3 * sd, L) + 0.9 * buckle; knR = lerp(knR, 0.06, L) + 0.8 * buckle;
      shL = lerp(shL, up ? 0.02 : -0.06, L) + 0.5 * buckle; shR = lerp(shR, up ? 0.02 : -0.06, L) + 0.6 * buckle;
      abL = lerp(abL, 1.0 - 0.6 * sd, L); abR = lerp(abR, 0.5 + 0.7 * sd, L);
      elL = lerp(elL, up ? 0.2 : 0.06, L); elR = lerp(elR, up ? 0.12 : 0.06, L);
      lean = lerp(lean, 0, L); twist = lerp(twist, 0, L); roll = lerp(roll, 0, L); headPitch = lerp(headPitch, -0.1, L); headYaw = lerp(headYaw, fs > 0 ? (sd - 0.5) * 1.6 : (sd > 0.5 ? 1.25 : -1.25), L);
      gunPitch = lerp(gunPitch, 0.2, L); gunYaw = lerp(gunYaw, 1.3, L); gunY = lerp(gunY, 0.1, L); gunX = lerp(gunX, -0.3, L);
    }
    // pelvis height from the supporting leg (so feet stay on the ground in every pose)
    // (the pelvis pitches with the lean and takes the legs with it; a standing foot that is tilted puts
    // its toe or heel lowest; a run has a flight phase, so the hips do not drop to the full split)
    const pelP = lean * 0.3, still = 1 - mv;
    const tL = hipL - pelP, tR = hipR - pelP, sL = Math.sin(tL - knL), sR = Math.sin(tR - knR);
    const extL = 0.45 * Math.cos(tL) + 0.45 * Math.cos(tL - knL) + still * Math.max(-0.2 * sL, 0.06 * sL, 0);
    const extR = 0.45 * Math.cos(tR) + 0.45 * Math.cos(tR - knR) + still * Math.max(-0.2 * sR, 0.06 * sR, 0);
    let legH = Math.max(extL, extR, 0.3);
    if (legH < 0.86) legH += (0.86 - legH) * 0.6 * run;
    const hipH = lerp(legH + 0.03 * mv, 0.9, L);

    comp(mRoot, null, e.x, e.y + e.hop + (e.kind === "soldier" && fs > 0 ? 0.2 : 0.13) * L, e.z, 0, e.yaw, 0);
    comp(mBody, mRoot, 0, 0, fs * 0.86 * L, -fs * L * HALF_PI, 0, e.lieRoll * L);
    const sY = e.grow * e.shrink, sXZ = e.shrink * (0.6 + 0.4 * Math.min(1, e.grow * 2));
    if (sY !== 1 || sXZ !== 1) mBody.scale(_sc.set(sXZ, sY, sXZ));
    comp(mPel, mBody, 0, hipH, 0, lean * 0.3, pelTw, roll);
    comp(mTor, mPel, 0, 0.1, 0, lean, twist, roll * 0.5);
    comp(mHead, mTor, 0, 0.5, 0, headPitch - lean * 0.6, headYaw, 0);

    const variant = K.variant, fade = e.fade, glow = e.glow, flash = e.flash;
    put(seg.hips, hi, mPel); putFx(seg.hips, hi, variant, fade, glow, flash);
    put(seg.torso, hi, mTor); putFx(seg.torso, hi, variant, fade, glow, flash);
    put(seg.head, hi, mHead); putFx(seg.head, hi, variant, fade, glow, flash);

    // arms: index 0 = right (-X), 1 = left (+X)
    for (let side = 0; side < 2; side++) {
      const sg = side ? 1 : -1, i = hi * 2 + side;
      const sh = side ? shL : shR, ab = side ? abL : abR, el = side ? elL : elR;
      comp(mA, mTor, sg * 0.215, 0.44, 0, -sh, 0, sg * ab);
      comp(mB, mA, 0, -0.3, 0, -el, 0, 0);
      put(seg.armU, i, mA); putFx(seg.armU, i, variant, fade, glow, flash);
      put(seg.armL, i, mB); putFx(seg.armL, i, variant, fade, glow, flash);
      const prop = side ? e.propL : e.propR;
      if (prop < 0) zero(seg.prop, i);
      else {
        if (prop === 3) {                      // rifle: posed from the chest, the arms come to it
          comp(mC, mTor, gunX, gunY, gunZ, gunPitch, gunYaw, 0);
          _v1.set(0, 0.012, 0.62).applyMatrix4(mC);
          e.muzzle.x = _v1.x; e.muzzle.y = _v1.y; e.muzzle.z = _v1.z;
        } else if (prop === 4) {               // pistol in the hand
          comp(mC, mB, 0, -0.3, 0, 0, 0, 0);
          _v1.set(0, -0.17, 0.03).applyMatrix4(mC);
          e.muzzle.x = _v1.x; e.muzzle.y = _v1.y; e.muzzle.z = _v1.z;
        } else if (prop === 0) {               // baton in the fist; dropped flat beside the hand once its owner is down
          if (L > 0.6) { _v1.set(0, -0.31, 0).applyMatrix4(mB); comp(mC, null, _v1.x, e.y + e.hop + 0.03, _v1.z, 0, e.yaw + 0.9 - 1.8 * sd, 0); }
          else comp(mC, mB, 0, -0.31, 0, 0, 0, 0);
        }
        else if (prop === 1) {                 // lantern: hangs plumb from the hand
          _v1.set(0, -0.34, 0).applyMatrix4(mB);
          comp(mC, null, _v1.x, Math.max(_v1.y, e.y + e.hop + lerp(0.25, 0.15, L)), _v1.z, 0.06 * Math.sin(ph) * mv * (1 - L), e.yaw, L * 1.2);
        } else if (e.carrying && L < 0.5) {    // carry pole on the shoulder; the rear carrier's points forward
          comp(mC, mTor, -0.2, 0.52, 0.02, -HALF_PI - 0.04, e.carryRear ? PI : 0, 0);
          const an = e.carryAnchor;
          if (an && anchors[hi] === an) {
            _v1.set(-0.2, 0.52 - 0.5 + 0.03 * Math.sin(ph * 2), e.carryRear ? 0.85 : -0.85).applyMatrix4(mTor);
            an.position.set(_v1.x, _v1.y, _v1.z);
            an.rotation.set(0.1 * Math.sin(ph) * mv, e.yaw, 0.12 * Math.sin(ph + 1) * mv);
            an.updateMatrixWorld();
          }
        } else {                               // pole held like a staff
          _v1.set(0, -0.33, 0).applyMatrix4(mB);
          comp(mC, null, _v1.x, lerp(_v1.y, e.y + 0.07, L), _v1.z, 0.1 + (HALF_PI - 0.1) * L, e.yaw + 0.5 * L, -0.06 * (1 - L));
        }
        put(seg.prop, i, mC); putFx(seg.prop, i, prop, fade, glow, flash);
      }
      const hip = side ? hipL : hipR, kn = side ? knL : knR;
      comp(mA, mPel, sg * 0.088, 0, 0, -hip, 0, sg * (0.02 + 0.1 * L * (side ? sd : 1 - sd)));
      comp(mB, mA, 0, -0.45, 0, kn, 0, 0);
      put(seg.thigh, i, mA); putFx(seg.thigh, i, variant, fade, glow, flash);
      put(seg.shin, i, mB); putFx(seg.shin, i, variant, fade, glow, flash);
    }
    if (e.propR < 0 && e.propL < 0) { e.muzzle.x = e.x; e.muzzle.y = e.y + 1.3; e.muzzle.z = e.z; }
  }

  function drawHumans(dt) {
    let any = false, used = 0;
    // which carrying handler is the rear one of a pair?
    for (let i = 0; i < H_MAX; i++) {
      const e = slots[i];
      if (!e || !e.carrying) continue;
      e.carryRear = false;
      for (let j = 0; j < H_MAX; j++) {
        const o = slots[j];
        if (!o || o === e || !o.carrying || !o.alive) continue;
        const dx = o.x - e.x, dz = o.z - e.z;
        if (dx * dx + dz * dz < 16 && dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw) > 0.3) e.carryRear = true;
      }
    }
    for (let i = 0; i < H_MAX; i++) {
      const e = slots[i];
      if (!e) continue;
      used++;
      if (e.still) continue;
      drawHuman(e, dt);
      any = true;
      // a settled body needs no more work until something changes
      if (!e.alive && e.lie >= 1 && e.flash <= 0 && e.hop <= 0 && Math.abs(e.kx) + Math.abs(e.kz) < 0.03 && e.body && e.body.shrinkT < 0 && e.body.fadeT < 0
        && !(e.kind === "dreamSoldier" && e.fade > 0.5)) e.still = true;
    }
    humansUsed = used;
    const vis = used > 0;
    for (let k = 0; k < segList.length; k++) {
      const s = segList[k];
      if (s.mesh.visible !== vis) s.mesh.visible = vis;
      if (any) { s.mesh.instanceMatrix.needsUpdate = true; s.aFx.needsUpdate = true; }
    }
  }

  function drawCrowd(dt) {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.ci < 0 || e.def.human) continue;
      let anim = "idle";
      const st = e.state;
      if (st === "stunned") anim = "down";
      else if (st === "windup") anim = "sit";
      else if (st === "attack") anim = "attack";
      else if (e.animSpeed > 2) anim = "run";
      else if (e.animSpeed > 0.25) anim = "walk";
      setAnim(e.ci, anim);
      const wob = e.staggerT > 0 ? 0.25 * Math.sin(now * 9 + e.seed * 9) : 0;
      crowd.set(e.ci, e.x, e.y + e.hop, e.z, e.yaw + wob, e.scale, e.flash > 0.5 ? 0xffffff : e.tint);
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 5);
    }
    for (let i = 0; i < fleeing.length; i++) {
      const e = fleeing[i];
      setAnim(e.ci, "run");
      crowd.set(e.ci, e.x, e.y + e.hop, e.z, e.yaw, e.scale * clamp(e.fleeT / 0.6, 0, 1), e.tint);
    }
    for (let i = 0; i < allies.length; i++) {
      const a = allies[i];
      if (a.ci < 0) continue;
      crowd.set(a.ci, a.x, a.y + a.hop, a.z, a.yaw, a.scale, a.tint);
    }
    for (let i = 0; i < fallen.length; i++) {
      const a = fallen[i];
      if (a.ci < 0) continue;
      crowd.set(a.ci, a.x, a.y - 0.25 * clamp((a.fallT - 6.5) / 1.5, 0, 1), a.z, a.yaw, a.scale * clamp((8 - a.fallT) / 1.5, 0, 1), a.tint);
    }
    crowd.update(dt, now);
    crowd.commit();
  }
  const fleeing = [];

  function drawCones(dt) {
    let n = 0;
    if (conesOn) {
      for (let i = 0; i < enemies.length && n < CONE_MAX; i++) {
        const e = enemies[i];
        if (!e.alive || !e.def.cones || e.passive || e.asleep || e.state === "stunned" || e.staggerT > 0) continue;
        const r = Math.max(1, e.coneRange);
        comp(mA, null, e.x, e.y + 0.07, e.z, 0, e.yaw + e.lookOff, 0);
        mA.scale(_sc.set(r, 1, r));
        mA.toArray(cones.instanceMatrix.array, n * 16);
        const alert = e.aware, sus = e.state === "suspicious" || e.state === "search" || e.seen > 0.35;
        const pulse = alert ? 0.8 + 0.2 * Math.sin(now * 12) : 1;
        if (alert) coneCol.setRGB(1.0 * pulse, 0.16 * pulse, 0.1 * pulse);
        else if (sus) coneCol.setRGB(1.0, 0.82, 0.2);
        else coneCol.setRGB(0.62 + 0.3 * e.seen, 0.62 + 0.3 * e.seen, 0.62);
        cones.setColorAt(n, coneCol);
        n++;
      }
    }
    if (n !== lastCones || n > 0) {
      if (lastCones > n) zeroMats(cones.instanceMatrix.array, n, lastCones);
      cones.instanceMatrix.needsUpdate = true;
      cones.instanceColor.needsUpdate = true;
      lastCones = n;
    }
    const vis = n > 0;
    if (cones.visible !== vis) cones.visible = vis;
  }
  let lastCones = 0;

  function blobAt(n, x, y, z, yaw, sx, sz) {
    comp(mA, null, x, y + 0.03, z, 0, yaw, 0);
    mA.scale(_sc.set(sx, 1, sz));
    mA.toArray(blobs.instanceMatrix.array, n * 16);
  }
  function drawBlobs() {
    let n = 0;
    for (let i = 0; i < H_MAX; i++) {
      const e = slots[i];
      if (!e || n >= BLOB_MAX) continue;
      const L = e.lie, k = e.fade * e.shrink * Math.min(1, e.grow * 1.5);
      if (k <= 0.02) continue;
      const off = e.fallSign * -0.05 * L;
      blobAt(n++, e.x - Math.sin(e.yaw) * off, e.y, e.z - Math.cos(e.yaw) * off, e.yaw, (0.95 + 0.1 * L) * k, (0.95 + 1.05 * L) * k);
    }
    for (let i = 0; i < enemies.length && n < BLOB_MAX; i++) {
      const e = enemies[i];
      if (e.ci >= 0 && !e.def.human) blobAt(n++, e.x, e.y, e.z, e.yaw, 0.6 * e.scale, 0.95 * e.scale);
    }
    for (let i = 0; i < allies.length && n < BLOB_MAX; i++) {
      const a = allies[i];
      if (a.ci >= 0) blobAt(n++, a.x, a.y, a.z, a.yaw, 0.58 * a.scale, 0.92 * a.scale);
    }
    if (lastBlobs > n) zeroMats(blobs.instanceMatrix.array, n, lastBlobs);
    if (n > 0 || lastBlobs > 0) blobs.instanceMatrix.needsUpdate = true;
    lastBlobs = n;
    const vis = n > 0;
    if (blobs.visible !== vis) blobs.visible = vis;
  }
  let lastBlobs = 0;

  // ---------------------------------------------------------------------------------------------
  // frame

  function update(dt, time) {
    now = typeof time === "number" ? time : now + dt;
    px = player.x; py = player.y; pz = player.z;
    pOk = !(ctx.health && ctx.health.dead) && !(ctx.checkpoint && ctx.checkpoint.respawning) && !(ctx.vehicle && ctx.vehicle.active);
    pSneak = player.maxSpeed <= 1.6 && !!(ctx.input && ctx.input.held && ctx.input.held("down"));
    pRun = !pSneak && (player.speed || 0) > 1.9;
    pLit = world && world.lit ? clamp(world.lit(px, pz), 0, 1) : 0.5;
    pHid = !!(world && world.hidden && world.hidden(px, pz));

    const think = !combat.frozen && dt > 0;
    // fire tokens in use, and how many allies are on each enemy
    shooters = 0;
    for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.token && e.alive) shooters++; e.engaged = 0; }
    for (let i = 0; i < allies.length; i++) { const t = allies[i].tgt; if (t) t.engaged++; }

    if (think) {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e.alive) continue;
        updateEnemy(e, dt);
        if (e.alive && e.grow >= 1) moveEnemy(e, dt);
      }
      for (let i = 0; i < SHOT_MAX; i++) {
        const s = shots[i];
        if (!s.on) continue;
        s.t -= dt;
        if (s.t <= 0) resolveShot(s);
      }
    }
    updateBodies(dt);

    // rivals running off
    for (let i = fleeing.length - 1; i >= 0; i--) {
      const e = fleeing[i];
      e.fleeT -= dt;
      e.dvx = Math.sin(e.faceYaw) * 4.6; e.dvz = Math.cos(e.faceYaw) * 4.6;
      moveEnemy(e, dt);
      if (e.fleeT <= 0) { fleeing.splice(i, 1); freeEnemyVisual(e); e.gone = true; }
    }
    // sweep: enemies that went down leave the live list (bodies keep their human slot)
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.alive) continue;
      enemies.splice(i, 1);
      if (!e.def.human && !e.gone && e.ci >= 0) fleeing.push(e);
    }

    // allies (think in four staggered groups)
    if (think) {
      const grounded = player.grounded !== false;
      const jumped = playerWasGrounded && !grounded && (player.vy || 0) > 1;
      playerWasGrounded = grounded;
      thinkGroup = (thinkGroup + 1) & 3;
      const n = allies.length;
      for (let i = 0; i < allies.length; i++) {
        const a = allies[i];
        if (jumped && !a.hero && !a.tgt && a.state !== "newborn" && mode === "follow") a.hopDelay = 0.16 + 0.07 * i + 0.1 * a.seed;
        updateAlly(a, i, n, dt, a.grp === thinkGroup);
        if (allies[i] !== a) i--;            // it fell during its own update
      }
    }
    for (let i = fallen.length - 1; i >= 0; i--) {
      const a = fallen[i];
      a.fallT += dt;
      if (a.fallT >= 8) { freeAlly(a); fallen.splice(i, 1); }
    }

    // the stealth read-out
    let top = 0, alerted = 0, searching = 0, sus = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive || e.passive) continue;
      if (e.aware) alerted++;
      else if (e.state === "search") searching++;
      else if (e.state === "suspicious") sus++;
      if (e.seen > top) top = e.seen;
    }
    combat.alerted = alerted;
    combat.seen = alerted ? 1 : top;
    combat.alertState = alerted ? "spotted" : searching || sus || top > 0.35 ? "suspicious" : "hidden";
    if (wasAlerted + wasSearching > 0 && alerted + searching === 0 && combat.alive > 0) emit("allClear");
    wasAlerted = alerted; wasSearching = searching;

    drawHumans(dt);
    drawCrowd(dt);
    drawCones(dt);
    drawBlobs();
  }

  function reset() {
    // remember where the squad stood, so setAllies(n) after a reset brings the same ones back
    stashN = 0;
    for (let i = 0; i < allies.length; i++) {
      const a = allies[i];
      if (!a.hero && stashN < ALLY_MAX) { const s = stash[stashN++]; s.x = a.x; s.z = a.z; s.look = a.look; s.paint = a.paint; }
      a.alive = false;
      if (a.hero) { a.heroMode = ""; }
      freeAlly(a);
      if (ctx.army) ctx.army.remove(a);
    }
    allies.length = 0;
    for (let i = 0; i < fallen.length; i++) freeAlly(fallen[i]);
    fallen.length = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      releaseToken(e); cancelZone(e);
      e.alive = false; e.targetable = false; e.gone = true; e.state = "gone"; e.body = null;
      if (e.ci >= 0) { crowd.hide(e.ci); crowdAnim[e.ci] = ""; crowdFree.push(e.ci); crowdUsed--; e.ci = -1; }
    }
    enemies.length = 0;
    for (let i = 0; i < fleeing.length; i++) { const e = fleeing[i]; if (e.ci >= 0) { crowd.hide(e.ci); crowdAnim[e.ci] = ""; crowdFree.push(e.ci); crowdUsed--; e.ci = -1; } e.gone = true; }
    fleeing.length = 0;
    for (let i = 0; i < bodies.length; i++) { const b = bodies[i]; b.alive = false; b.targetable = false; if (b.enemy) { b.enemy.gone = true; b.enemy.state = "gone"; b.enemy.body = null; } }
    bodies.length = 0;
    for (let i = 0; i < H_MAX; i++) { if (slots[i]) { slots[i].hi = -1; slots[i] = null; } }
    for (let k = 0; k < segList.length; k++) { const sg = segList[k]; zeroMats(sg.mat, 0, H_MAX * sg.per); sg.mesh.instanceMatrix.needsUpdate = true; sg.mesh.visible = false; }
    zeroMats(blobs.instanceMatrix.array, 0, BLOB_MAX); blobs.instanceMatrix.needsUpdate = true; blobs.visible = false; lastBlobs = 0;
    zeroMats(cones.instanceMatrix.array, 0, CONE_MAX); cones.instanceMatrix.needsUpdate = true; cones.visible = false; lastCones = 0;
    for (let i = 0; i < SHOT_MAX; i++) shots[i].on = false;
    crowd.commit();
    shooters = 0; wasAlerted = 0; wasSearching = 0; humansUsed = 0; rosterPeak = 0;
    mode = "follow"; combat.mode = mode; orderR = 0;
    combat.seen = 0; combat.alertState = "hidden"; combat.alerted = 0; combat.alive = 0;
    conesOn = true;
    combat.frozen = false;
  }

  return combat;
}
