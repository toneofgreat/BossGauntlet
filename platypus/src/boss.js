// boss.js — the Platypus King (LEVELS2.md B7).
//
// The model is createPlatypus(THREE, { variant: "king" }) — 3.2 m of near-black, scarred platypus —
// plus what makes him a king: a heavy dented gold crown (a separate object, so it can fall), bone-and-
// bronze armor on the chest, shoulders and tail base (the ankles and the underside of the tail are
// bare: the weak spots), and a tattered deep-red cape that is animated in its vertex shader.
// About 13 draw calls and 26k triangles with everything showing.
//
// The fight: every attack is telegraphed three ways at once (the body's wind-up, a ground marker that
// fills over exactly the wind-up, and a sound), then resolved against the player here. The level
// listens to boss.onEvent and frames it (HUD, music, checkpoints, camera).
//
// Conventions: metres, +Y up, yaw 0 faces +Z, forward = (sin yaw, cos yaw). `group` is added to the
// world's group by the level and stays at the origin; the King moves inside it.

import { createPlatypus, platypusSurface, platypusBodyRing, PLATYPUS_JOINTS } from "./platypus.js";

const PI = Math.PI, TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lin = (c) => Math.pow(c < 0 ? 0 : c, 2.2);
const wrap = (a) => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };

const KING_SCALE = 3.2;
const MAX_HP = 300, PHASE_HP = 100;
const BILL_REACH = 1.66;            // how far ahead of his centre the bill lands in the slam
const PHASE_WIND = [1, 0.9, 0.8];
const ASSIST_WIND = [1, 1.15, 1.3], ASSIST_DMG = [1, 0.75, 0.5];
const GAP = [1.15, 0.95, 0.75];     // seconds between attacks (never below 0.6)
const WALK = [2.3, 2.7, 2.2], CHARGE_SPEED = [13, 14.5, 16];
const HINT_ARMOR = "His armor is too thick — wait for an opening!";

function mulberry(seed) {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// small geometry builder (positions + vertex colours)
// ---------------------------------------------------------------------------------------------
function makeB() { return { pos: [], col: [], idx: [], extra: [] }; }
function bV(b, x, y, z, c, k) {
  const kk = k === undefined ? 1 : k;
  b.pos.push(x, y, z);
  b.col.push(lin(c[0] * kk), lin(c[1] * kk), lin(c[2] * kk));
  return b.pos.length / 3 - 1;
}
function bGrid(b, base, ni, nj) {
  const row = nj + 1;
  for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
    const a = base + i * row + j, c = a + row;
    b.idx.push(a, a + 1, c, a + 1, c + 1, c);
  }
}
function bCone(b, x, y, z, dx, dy, dz, r, h, c, segs) {
  const l = Math.hypot(dx, dy, dz) || 1;
  dx /= l; dy /= l; dz /= l;
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(dy) > 0.9) { ux = 1; uy = 0; }
  let sx = dy * uz - dz * uy, sy = dz * ux - dx * uz, sz = dx * uy - dy * ux;
  const sl = Math.hypot(sx, sy, sz) || 1;
  sx /= sl; sy /= sl; sz /= sl;
  ux = sy * dz - sz * dy; uy = sz * dx - sx * dz; uz = sx * dy - sy * dx;
  const base = b.pos.length / 3;
  for (let i = 0; i <= 2; i++) {
    const t = i / 2, rr = r * (1 - t) * (1 - 0.25 * t) + 0.0006, bend = h * 0.12 * t * t;
    for (let j = 0; j <= segs; j++) {
      const an = (j / segs) * TAU, ca = Math.cos(an) * rr, sa = Math.sin(an) * rr;
      bV(b, x + dx * h * t + sx * ca + ux * (sa + bend), y + dy * h * t + sy * ca + uy * (sa + bend), z + dz * h * t + sz * ca + uz * (sa + bend), c, 0.8 + 0.25 * t);
    }
  }
  bGrid(b, base, 2, segs);
}
function bBall(b, x, y, z, rx, ry, rz, c, k) {
  const base = b.pos.length / 3, NI = 4, NJ = 6;
  for (let i = 0; i <= NI; i++) {
    const ph = (i / NI) * PI, sp = Math.sin(ph), cp = Math.cos(ph);
    for (let j = 0; j <= NJ; j++) {
      const th = (j / NJ) * TAU;
      bV(b, x + Math.cos(th) * sp * rx, y + cp * ry, z + Math.sin(th) * sp * rz, c, (k || 1) * (0.75 + 0.35 * (cp * 0.5 + 0.5)));
    }
  }
  bGrid(b, base, NI, NJ);
}
function bFinish(THREE, b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
  if (b.extra.length) g.setAttribute("aCape", new THREE.Float32BufferAttribute(b.extra, 2));
  g.setIndex(b.idx);
  g.computeVertexNormals();
  return g;
}

const C_GOLD = [0.92, 0.68, 0.2], C_GOLD_D = [0.6, 0.4, 0.1], C_RUBY = [0.42, 0.04, 0.05];
const C_BONE = [0.84, 0.78, 0.63], C_BONE_D = [0.6, 0.53, 0.4], C_BRONZE = [0.52, 0.33, 0.14], C_BRONZE_D = [0.3, 0.2, 0.1];

// The crown: a thick band with a rolled rim, five points, dents, five dull red stones. Model units
// (the King's scale is applied by his skeleton): origin at the centre of the band's base.
function buildCrown(THREE) {
  const b = makeB();
  const N = 40, R = 0.054;
  const dent = (th, yk) => 1 + 0.03 * Math.sin(th * 3 + 1) * Math.sin(th * 7 + 0.4) - 0.13 * Math.exp(-Math.pow(wrap(th - 2.2) / 0.3, 2)) * yk - 0.06 * Math.exp(-Math.pow(wrap(th + 0.9) / 0.2, 2)) * yk;
  const point = (th) => { const u = (th / TAU) * 5; const f = Math.abs(u - Math.round(u)) * 2; return Math.pow(1 - f, 1.6); }; // 1 at a point, 0 between
  // rows: inner base, outer base, rim roll, band, band top, crest (points)
  const ROWS = [[-0.002, 0.93, 0.7], [-0.004, 1.03, 0.8], [0.004, 1.075, 1.05], [0.011, 1.0, 0.92], [0.031, 1.01, 1.0], [0.034, 1.04, 1.08], [0.036, 1.05, 1.0]];
  const base = b.pos.length / 3;
  for (let i = 0; i < ROWS.length; i++) {
    for (let j = 0; j <= N; j++) {
      const th = (j / N) * TAU, pt = point(th);
      let y = ROWS[i][0], rr = R * ROWS[i][1];
      if (i === ROWS.length - 1) { y += 0.008 + 0.046 * pt; rr *= 1 + 0.07 * pt; }
      rr *= dent(th, sat((y + 0.004) / 0.04));
      const dark = i === 3 || i === 4 ? 0.88 + 0.12 * Math.sin(th * 20) * Math.sin(th * 20) : 1;
      bV(b, Math.cos(th) * rr, y, Math.sin(th) * rr, i <= 1 ? C_GOLD_D : C_GOLD, ROWS[i][2] * dark);
    }
  }
  bGrid(b, base, ROWS.length - 1, N);
  // inner wall, so the crown reads as thick when it lies on the ground
  const b2 = b.pos.length / 3;
  for (let i = 0; i < 2; i++) for (let j = 0; j <= N; j++) {
    const th = (j / N) * TAU, pt = point(th);
    const y = i === 0 ? -0.002 : 0.044 + 0.046 * pt;
    const rr = R * (i === 0 ? 0.93 : 1.0 + 0.06 * pt) * dent(th, i);
    bV(b, Math.cos(th) * rr, y, Math.sin(th) * rr, C_GOLD_D, 0.6 + 0.2 * i);
  }
  bGrid(b, b2, 1, N);
  for (let k = 0; k < 5; k++) {
    const th = (k / 5) * TAU, c = Math.cos(th), s = Math.sin(th), rr = R * dent(th, 0.5);
    bBall(b, c * rr * 1.03, 0.021, s * rr * 1.03, 0.0085, 0.0085, 0.0085, C_RUBY, 1.1);       // the stones
    bBall(b, c * R * 1.12 * dent(th, 1), 0.092, s * R * 1.12 * dent(th, 1), 0.0062, 0.0062, 0.0062, C_GOLD, 1.1); // a bead on every point
  }
  return bFinish(THREE, b);
}

// Armor that hugs the body. `origin` = the bind position of the anchor the mesh will hang on.
function lame(b, z0, z1, th0, th1, off0, off1, origin, seedK) {
  const NU = 14, T = [0, 0.14, 0.86, 1], S = [0, 0, 0, 0, 0];
  const base = b.pos.length / 3;
  for (let i = 0; i < T.length; i++) for (let j = 0; j <= NU; j++) {
    const v = j / NU, th = lerp(th0, th1, v);
    const edge = i === 0 || i === T.length - 1 || j === 0 || j === NU;
    const scallop = i === T.length - 1 ? 0.007 * Math.cos(th * 7 + seedK) : 0;
    const z = lerp(z0, z1, T[i]) + scallop;
    const off = lerp(off0, off1, T[i]) + (edge ? 0.0025 : 0) - 0.004 * Math.pow(Math.abs(2 * v - 1), 4);
    platypusSurface(z, th, off, S);
    const grain = 0.86 + 0.14 * Math.sin(th * 23 + z * 90 + seedK) * Math.sin(z * 160);
    bV(b, S[0] - origin[0], S[1] - origin[1], S[2] - origin[2], edge ? C_BRONZE : C_BONE, edge ? 1 : grain);
  }
  bGrid(b, base, T.length - 1, NU);
  // rivets along the leading edge
  for (let k = 0; k < 5; k++) {
    platypusSurface(lerp(z0, z1, 0.1), lerp(th0, th1, 0.1 + 0.2 * k), off0 + 0.004, S);
    bBall(b, S[0] - origin[0], S[1] - origin[1], S[2] - origin[2], 0.005, 0.005, 0.005, C_BRONZE, 1.35);
  }
}
function buildChestArmor(THREE) {
  const b = makeB(), O = PLATYPUS_JOINTS.chest, S = [0, 0, 0, 0, 0];
  // four overlapping lames from the neck back over the shoulders: each one's rear edge rides over the next
  lame(b, 0.262, 0.2, 0.62, PI - 0.62, 0.011, 0.02, O, 0.3);
  lame(b, 0.212, 0.15, 0.56, PI - 0.56, 0.012, 0.022, O, 1.7);
  lame(b, 0.162, 0.1, 0.1, PI - 0.1, 0.012, 0.022, O, 2.9);
  lame(b, 0.112, 0.045, -0.12, PI + 0.12, 0.012, 0.021, O, 4.2);
  // a breastplate under the throat
  lame(b, 0.25, 0.15, -PI / 2 - 0.75, -PI / 2 + 0.75, 0.01, 0.016, O, 5.5);
  // pauldrons: a bronze dome, a bone rim, a tusk
  for (let sd = -1; sd <= 1; sd += 2) {
    platypusSurface(0.192, sd > 0 ? 0.62 : PI - 0.62, 0.014, S);
    const cx = S[0] - O[0], cy = S[1] - O[1], cz = S[2] - O[2];
    const ax = S[3] * 0.85, ay = S[4] * 0.85 + 0.3; // outward and up
    const al = Math.hypot(ax, ay), nx = ax / al, ny = ay / al;
    const tx = -ny, ty = nx; // tangent in the cross-section plane
    const base = b.pos.length / 3, NI = 5, NJ = 12;
    for (let i = 0; i <= NI; i++) {
      const ph = (i / NI) * 1.35, sp = Math.sin(ph), cp = Math.cos(ph);
      for (let j = 0; j <= NJ; j++) {
        const an = (j / NJ) * TAU;
        const ox = Math.cos(an) * sp * 0.056, oz = Math.sin(an) * sp * 0.07, oa = cp * 0.04 - 0.012;
        bV(b, cx + nx * oa + tx * ox, cy + ny * oa + ty * ox, cz + oz, i === NI ? C_BONE : C_BRONZE, i === NI ? 1 : 0.85 + 0.3 * cp + 0.08 * Math.sin(an * 6));
      }
    }
    bGrid(b, base, NI, NJ);
    bCone(b, cx + nx * 0.022, cy + ny * 0.022, cz, nx * 0.75, ny * 0.75 + 0.35, -0.25, 0.013, 0.085, C_BONE, 6);
    bCone(b, cx + nx * 0.016 + tx * 0.02, cy + ny * 0.016 + ty * 0.02, cz - 0.035, nx, ny, -0.5, 0.008, 0.045, C_BONE_D, 5);
  }
  return bFinish(THREE, b);
}
function buildTailArmor(THREE) {
  const b = makeB(), O = PLATYPUS_JOINTS.tail1, S = [0, 0, 0, 0, 0];
  lame(b, -0.105, -0.17, 0.5, PI - 0.5, 0.012, 0.022, O, 0.9);
  lame(b, -0.16, -0.225, 0.52, PI - 0.52, 0.012, 0.021, O, 2.3);
  lame(b, -0.215, -0.285, 0.5, PI - 0.5, 0.011, 0.018, O, 3.6);
  for (let k = 0; k < 3; k++) { // a ridge of bone spikes down the middle
    const z = -0.13 - k * 0.056;
    platypusSurface(z, PI / 2, 0.018, S);
    bCone(b, S[0] - O[0], S[1] - O[1], S[2] - O[2], 0, 1, -0.45, 0.011, 0.05 - k * 0.008, C_BONE, 6);
  }
  return bFinish(THREE, b);
}

// The cape: a sheet from the collar back over the spine and down both flanks to past the tail base,
// authored draped over the body (and over the armor). u = -1..1 across, v = 0 (collar) .. 1 (hem).
function buildCape(THREE) {
  const b = makeB(), O = PLATYPUS_JOINTS.chest, OY = O[1] + 0.081, R = [0, 0, 0, 0, 0];
  const NU = 14, NV = 18;
  for (let j = 0; j <= NV; j++) {
    const v = j / NV, z = lerp(0.215, -0.47, v);
    const half = lerp(0.085, 0.235, Math.pow(v, 0.7));
    platypusBodyRing(z, R);
    const w = R[1] + 0.03, top = R[2] + R[3] + 0.034;
    for (let i = 0; i <= NU; i++) {
      const u = (i / NU) * 2 - 1, x = u * half, ax = Math.abs(x);
      // over the back it follows the body; past the flank it hangs
      let y = ax < w ? R[2] + (R[3] + 0.034) * Math.pow(1 - Math.pow(ax / w, 2.2), 1 / 2.2) : R[2] - (ax - w) * 1.5;
      if (ax > w * 0.82) y = Math.min(y, R[2] + (R[3] + 0.034) * 0.42 - (ax - w * 0.82) * 1.5);
      if (y > top) y = top;
      y = Math.max(y, 0.02) + 0.004 * Math.sin(u * 9 + v * 13);
      const fold = 0.8 + 0.2 * Math.sin(u * 11 + v * 3) * Math.sin(u * 5 - v * 7);
      const stain = 1 - 0.35 * smooth(0.55, 1, v);
      const trim = v < 0.07 || (v > 0.1 && v < 0.125);
      bV(b, x, y - OY, z - O[2], trim ? [0.62, 0.45, 0.14] : [0.42, 0.045, 0.06], trim ? 1 : fold * stain);
      b.extra.push(u, v);
    }
  }
  bGrid(b, 0, NV, NU);
  return bFinish(THREE, b);
}
const CAPE_VERT_DECL = "#include <common>\nuniform float uCapeTime;\nuniform float uCapeFlare;\nuniform float uCapeWalk;\nattribute vec2 aCape;\nvarying vec2 vCape;";
const CAPE_VERT_BEGIN = [
  "#include <begin_vertex>",
  "vCape = aCape;",
  "{",
  "  float cw = aCape.y * aCape.y;",
  "  float ce = cw * (0.35 + 0.65 * abs(aCape.x));",
  "  float cs = sin(uCapeTime * 2.1 + aCape.y * 7.0 + aCape.x * 2.0) + 0.5 * sin(uCapeTime * 3.7 - aCape.y * 11.0 + aCape.x * 5.0);",
  "  transformed.y += ce * (0.006 + 0.012 * uCapeWalk) * cs;",
  "  transformed.x += ce * 0.014 * sin(uCapeTime * 1.7 + aCape.y * 5.0) * (1.0 + uCapeWalk);",
  "  float cf = uCapeFlare * cw;",
  "  transformed.y += cf * (0.15 + 0.045 * sin(uCapeTime * 13.0 + aCape.y * 9.0 + aCape.x * 4.0)) * (0.55 + 0.45 * abs(aCape.x));",
  "  transformed.x += cf * aCape.x * 0.07;",
  "  transformed.z -= cf * 0.07;",
  "}",
].join("\n");
const CAPE_FRAG_DECL = "#include <common>\nuniform float uCapeTear;\nvarying vec2 vCape;";
const CAPE_FRAG_COLOR = [
  "#include <color_fragment>",
  "{",
  "  float cu = vCape.x; float cv = vCape.y;",
  "  float hem = 0.9 + 0.06 * sin(cu * 13.0) + 0.045 * sin(cu * 31.0 + 1.7) + 0.03 * sin(cu * 57.0 + 0.4);",
  "  hem -= uCapeTear * (1.25 + 0.25 * sin(cu * 9.0 + 2.0));",
  "  if (cv > hem) discard;",
  "  float side = 1.0 - 0.05 * smoothstep(0.3, 1.0, cv) * (0.5 + 0.5 * sin(cv * 41.0));",
  "  if (abs(cu) > side) discard;",
  "  if (length((vec2(cu, cv) - vec2(0.42, 0.63)) * vec2(1.0, 2.6)) < 0.11) discard;",
  "  if (length((vec2(cu, cv) - vec2(-0.5, 0.8)) * vec2(1.0, 3.1)) < 0.09) discard;",
  "  if (length((vec2(cu, cv) - vec2(-0.12, 0.47)) * vec2(1.6, 2.2)) < 0.045) discard;",
  "  diffuseColor.rgb *= 1.0 - 0.45 * smoothstep(hem - 0.07, hem, cv);",
  "}",
].join("\n");

// ---------------------------------------------------------------------------------------------
// The paper. Two textures drawn once on the same parchment in the same ink: what the platypus sees
// (confident, meaningless loops and hooks) and what the player may read for a moment.
// ---------------------------------------------------------------------------------------------
const PAPER_LINES = ["NEVER", "APPROACH", "THE FARLANDS"];
function drawPaper(readable) {
  if (typeof document === "undefined") return null;
  const W = 512, H = 640;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const rnd = mulberry(77);
  // parchment
  const bg = g.createRadialGradient(W * 0.48, H * 0.45, 40, W * 0.5, H * 0.5, 420);
  bg.addColorStop(0, "#e9d9ae"); bg.addColorStop(0.7, "#d9c391"); bg.addColorStop(1, "#b99a62");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    g.globalAlpha = 0.03 + rnd() * 0.05;
    g.fillStyle = rnd() > 0.5 ? "#7a5a2a" : "#fff4d0";
    const r = 1 + rnd() * 9;
    g.beginPath(); g.ellipse(rnd() * W, rnd() * H, r * (1 + rnd() * 2), r, rnd() * PI, 0, TAU); g.fill();
  }
  for (let i = 0; i < 5; i++) { // water stains
    g.globalAlpha = 0.07; g.strokeStyle = "#6a4a1c"; g.lineWidth = 2 + rnd() * 3;
    g.beginPath(); g.ellipse(rnd() * W, rnd() * H, 30 + rnd() * 70, 22 + rnd() * 50, rnd() * PI, 0, TAU); g.stroke();
  }
  // creases: folded in three and once down the middle
  g.globalAlpha = 0.22; g.lineWidth = 2;
  for (const y of [H / 3, (2 * H) / 3]) {
    g.strokeStyle = "#6b5126"; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= W; x += 32) g.lineTo(x, y + (rnd() - 0.5) * 3); g.stroke();
    g.strokeStyle = "#fff6d8"; g.beginPath(); g.moveTo(0, y + 3); g.lineTo(W, y + 3); g.stroke();
  }
  g.strokeStyle = "#6b5126"; g.beginPath(); g.moveTo(W / 2, 0); for (let y = 0; y <= H; y += 32) g.lineTo(W / 2 + (rnd() - 0.5) * 3, y); g.stroke();
  // burnt, nibbled edges
  g.globalAlpha = 1;
  const eg = g.createLinearGradient(0, 0, W, 0);
  eg.addColorStop(0, "rgba(70,45,15,0.55)"); eg.addColorStop(0.06, "rgba(70,45,15,0)"); eg.addColorStop(0.94, "rgba(70,45,15,0)"); eg.addColorStop(1, "rgba(70,45,15,0.55)");
  g.fillStyle = eg; g.fillRect(0, 0, W, H);
  const eg2 = g.createLinearGradient(0, 0, 0, H);
  eg2.addColorStop(0, "rgba(70,45,15,0.5)"); eg2.addColorStop(0.05, "rgba(70,45,15,0)"); eg2.addColorStop(0.95, "rgba(70,45,15,0)"); eg2.addColorStop(1, "rgba(70,45,15,0.5)");
  g.fillStyle = eg2; g.fillRect(0, 0, W, H);

  // the ink: three lines, the same layout either way
  const ink = "#2a1708";
  const ir = mulberry(readable ? 501 : 502);
  g.fillStyle = ink; g.strokeStyle = ink; g.lineCap = "round"; g.lineJoin = "round";
  g.textBaseline = "alphabetic"; g.textAlign = "left";
  const SIZES = [92, 74, 60], YS = [150, 262, 362];
  const lr = mulberry(9);
  for (let li = 0; li < 3; li++) {
    const text = PAPER_LINES[li];
    g.font = "bold " + SIZES[li] + "px Georgia, 'Times New Roman', serif";
    // letter slots (measured once, so the scribbles sit exactly where the letters would)
    let total = 0; const ws = [];
    for (let k = 0; k < text.length; k++) { const w = text[k] === " " ? SIZES[li] * 0.34 : g.measureText(text[k]).width + 3; ws.push(w); total += w; }
    const fit = Math.min(1, (W - 70) / total);
    let x = (W - total * fit) / 2;
    for (let k = 0; k < text.length; k++) {
      const w = ws[k] * fit, jy = (lr() - 0.5) * 7, rot = (lr() - 0.5) * 0.09, sz = SIZES[li] * fit;
      if (text[k] !== " ") {
        g.save();
        g.translate(x + w / 2, YS[li] + jy); g.rotate(rot);
        g.globalAlpha = 0.82 + ir() * 0.16;
        if (readable) {
          g.font = "bold " + Math.round(sz) + "px Georgia, 'Times New Roman', serif";
          g.textAlign = "center";
          g.fillText(text[k], 0, 0);
        } else {
          // a confident nonsense glyph: a loop or two, a hook, sometimes a dot or a bar
          g.lineWidth = sz * 0.09;
          const hw = w * 0.38, hh = sz * 0.62;
          g.beginPath();
          let px = (ir() - 0.5) * hw, py = -ir() * hh;
          g.moveTo(px, py);
          const n = 2 + Math.floor(ir() * 3);
          for (let q = 0; q < n; q++) {
            const nx = (ir() - 0.5) * 2 * hw, ny = -ir() * hh;
            g.bezierCurveTo(px + (ir() - 0.5) * 2.4 * hw, py - (ir() - 0.3) * hh, nx + (ir() - 0.5) * 2.4 * hw, ny + (ir() - 0.5) * hh, nx, ny);
            px = nx; py = ny;
          }
          g.stroke();
          if (ir() < 0.45) { g.beginPath(); g.arc((ir() - 0.5) * hw, -hh * (1.05 + ir() * 0.12), sz * 0.05, 0, TAU); g.fill(); }
          if (ir() < 0.3) { g.lineWidth = sz * 0.06; g.beginPath(); g.moveTo(-hw, -hh * 0.45); g.lineTo(hw, -hh * (0.4 + ir() * 0.15)); g.stroke(); }
          if (ir() < 0.3) { g.lineWidth = sz * 0.07; g.beginPath(); g.moveTo(hw * 0.2, 0); g.quadraticCurveTo(hw * 0.4, sz * 0.2, -hw * 0.3, sz * 0.22); g.stroke(); }
        }
        g.restore();
      }
      x += w;
    }
  }
  // the drawing (the same on both): a cliff edge with nothing beyond it, and a paw print, crossed out
  g.globalAlpha = 0.85; g.lineWidth = 4.5;
  g.beginPath(); g.moveTo(70, 470); g.lineTo(150, 466); g.lineTo(205, 472); g.lineTo(212, 500); g.lineTo(204, 540); g.lineTo(214, 584); g.stroke();
  g.lineWidth = 2.5;
  for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(84 + k * 21, 474); g.lineTo(76 + k * 21, 490); g.stroke(); }
  for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(236 + k * 9, 520 + k * 22); g.quadraticCurveTo(250 + k * 9, 512 + k * 22, 264 + k * 9, 520 + k * 22); g.stroke(); }
  g.save(); g.translate(380, 520);
  g.beginPath(); g.ellipse(0, 12, 26, 22, 0, 0, TAU); g.fill();
  for (let k = 0; k < 4; k++) { const a = -1.1 + k * 0.73; g.beginPath(); g.ellipse(Math.sin(a) * 40, -18 - Math.cos(a) * 22, 9, 12, a, 0, TAU); g.fill(); }
  g.lineWidth = 7; g.globalAlpha = 0.9; g.strokeStyle = "#5a1208";
  g.beginPath(); g.moveTo(-58, -62); g.lineTo(56, 52); g.moveTo(56, -60); g.lineTo(-56, 54); g.stroke();
  g.restore();
  g.globalAlpha = 1;
  return cv;
}
function buildPaperGeo(THREE) {
  const W = 0.34, H = 0.425, NX = 8, NY = 10;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const u = i / NX, v = j / NY;
    // folded in three and once down the middle, then opened: shallow tents along the creases, a curled corner
    const tent = 0.011 * (Math.abs(((v * 3) % 1) - 0.5) * 2) + 0.008 * Math.abs(u - 0.5) * 2;
    const curl = 0.03 * Math.pow(sat((u - 0.72) / 0.28), 2) * Math.pow(sat((v - 0.7) / 0.3), 2);
    pos.push((u - 0.5) * W, tent + curl + 0.004, (0.5 - v) * H);
    uv.push(u, v);
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = j * (NX + 1) + i, c = a + NX + 1;
    idx.push(a, c, a + 1, a + 1, c, c + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// =================================================================================================
export function createBoss(ctx) {
  const THREE = ctx.THREE, fx = ctx.fx, audio = ctx.audio;
  const group = new THREE.Group();
  group.name = "boss";

  // ------------------------------------------------------------------ the model
  const body = createPlatypus(THREE, { variant: "king" });
  body.group.name = "platypusKing";
  group.add(body.group);
  const ATT = body.attacks;

  const metalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.36, metalness: 0.5, emissive: 0x2b1a04, side: THREE.DoubleSide });
  const crownGeo = buildCrown(THREE);
  const crownMesh = new THREE.Mesh(crownGeo, metalMat);
  crownMesh.name = "kingCrown";
  crownMesh.castShadow = true;
  const crownGroup = new THREE.Group();
  crownGroup.name = "kingCrownGroup";
  crownGroup.add(crownMesh);
  const CROWN_REST_Y = -0.011, CROWN_TILT_X = -0.09, CROWN_TILT_Z = 0.13;
  function seatCrown() {
    body.crownAnchor.add(crownGroup);
    crownGroup.position.set(0, CROWN_REST_Y, 0);
    crownGroup.rotation.set(CROWN_TILT_X, 0.4, CROWN_TILT_Z);
    crownGroup.scale.setScalar(1);
    crownGroup.visible = true;
  }
  seatCrown();

  const armorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.52, metalness: 0.22, side: THREE.DoubleSide });
  const chestGeo = buildChestArmor(THREE), tailGeo = buildTailArmor(THREE);
  const chestArmor = new THREE.Mesh(chestGeo, armorMat);
  chestArmor.name = "kingArmorChest";
  chestArmor.castShadow = true;
  body.armorAnchors.chest.add(chestArmor);
  const tailArmor = new THREE.Mesh(tailGeo, armorMat);
  tailArmor.name = "kingArmorTail";
  body.armorAnchors.tail.add(tailArmor);

  const UC = { time: { value: 0 }, flare: { value: 0 }, walk: { value: 0 }, tear: { value: 0 } };
  const capeGeo = buildCape(THREE);
  const capeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  capeMat.onBeforeCompile = (sh) => {
    sh.uniforms.uCapeTime = UC.time; sh.uniforms.uCapeFlare = UC.flare; sh.uniforms.uCapeWalk = UC.walk; sh.uniforms.uCapeTear = UC.tear;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", CAPE_VERT_DECL).replace("#include <begin_vertex>", CAPE_VERT_BEGIN);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", CAPE_FRAG_DECL).replace("#include <color_fragment>", CAPE_FRAG_COLOR);
  };
  capeMat.customProgramCacheKey = () => "king-cape-1";
  const cape = new THREE.Mesh(capeGeo, capeMat);
  cape.name = "kingCape";
  cape.frustumCulled = false;
  cape.castShadow = false;
  body.capeAnchor.add(cape);

  // the weak spots: a faint pulsing glow at both ankles and under the tail, only while he is open
  const glowGeo = new THREE.SphereGeometry(1, 10, 8);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x9dff5a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const glows = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(glowGeo, glowMat);
    m.name = "kingWeakGlow";
    m.visible = false;
    m.renderOrder = 5;
    glows.push(m);
  }
  body.spurL.add(glows[0]); glows[0].position.set(0.012, 0.004, 0.03);
  body.spurR.add(glows[1]); glows[1].position.set(-0.012, 0.004, 0.03);
  body.armorAnchors.tail.add(glows[2]); glows[2].position.set(0, -0.055, -0.07);

  // ------------------------------------------------------------------ the paper
  const paperGroup = new THREE.Group();
  paperGroup.name = "kingPaper";
  paperGroup.visible = false;
  group.add(paperGroup);
  const UP = { read: { value: 0 }, text: { value: null } };
  const cvA = drawPaper(false), cvB = drawPaper(true);
  let texA = null, texB = null;
  if (cvA && cvB) {
    texA = new THREE.CanvasTexture(cvA); texA.colorSpace = THREE.SRGBColorSpace; texA.anisotropy = 4;
    texB = new THREE.CanvasTexture(cvB); texB.colorSpace = THREE.SRGBColorSpace; texB.anisotropy = 4;
    UP.text.value = texB;
  }
  const paperGeo = buildPaperGeo(THREE);
  const paperMat = new THREE.MeshStandardMaterial({ color: texA ? 0xffffff : 0xd9c391, map: texA, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  paperMat.onBeforeCompile = (sh) => {
    sh.uniforms.uPaperRead = UP.read; sh.uniforms.uPaperText = UP.text;
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uPaperRead;\nuniform sampler2D uPaperText;")
      .replace("#include <map_fragment>", "#ifdef USE_MAP\n\tvec4 sampledDiffuseColor = mix(texture2D(map, vMapUv), texture2D(uPaperText, vMapUv), uPaperRead);\n\tdiffuseColor *= sampledDiffuseColor;\n#endif");
  };
  paperMat.customProgramCacheKey = () => "king-paper-1";
  const paperMesh = new THREE.Mesh(paperGeo, paperMat);
  paperMesh.name = "kingPaperMesh";
  paperMesh.receiveShadow = true;
  paperGroup.add(paperMesh);
  const pickGeo = new THREE.BoxGeometry(0.62, 0.34, 0.68);
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const paperPick = new THREE.Mesh(pickGeo, pickMat);
  paperPick.name = "kingPaperPick";
  paperPick.position.y = 0.12;
  paperGroup.add(paperPick);

  // ------------------------------------------------------------------ state
  let world = null;
  const arena = { x: 0, z: 0, r: 15 };
  const pillars = [];                    // { x, z, r, hits, broken }
  const pillarSnap = [[], [], []];       // pillar hits at the start of each phase (checkpoint restore)
  let started = false, paused = false, dying = false, dead = false, finalWait = false;
  let state = "idle", stT = 0;           // stT: seconds in the current state
  let cur = "", atkT = 0, atkW = 0, atkTotal = 0, atkHitDone = false, atkAux = 0;
  let gapT = 0, sinceOpening = 0, sinceCharge = 0, last1 = "", last2 = "", queued = "", stalkT = 0;
  let openT = 0, hintShown = false, hurtSfxT = 0;
  let allyBudget = 0, alliesAuto = null, alliesTried = false;
  let speedNow = 0, yawRate = 0, stepSfxT = 0;
  let px = 0, pz = 0, pvx = 0, pvz = 0, pInit = false;
  let slowT = 0, slowBase = 0, slowed = false;
  let lockYaw = 0, tgtX = 0, tgtZ = 0, zoneId = -1, zoneT = 0, zoneX = 0, zoneZ = 0, zoneYaw = 0, locked = false, lunge0 = 0, lungeD = 0;
  let chargeLeft = 0, chargeHit = false, chargeStunned = false;
  let dT = 0, dStep = 0;                 // defeat timeline
  let flareT = 0, tearT = -1, capeGone = false;
  let clock = 0;
  const rings = [{ id: -1, prev: 0, hit: false }, { id: -1, prev: 0, hit: false }];
  const spits = [{ on: false, launch: 0, land: 0, x: 0, z: 0, fired: false, zone: -1 }, { on: false, launch: 0, land: 0, x: 0, z: 0, fired: false, zone: -1 }, { on: false, launch: 0, land: 0, x: 0, z: 0, fired: false, zone: -1 }];
  let spitN = 0;
  // crown physics (after it comes off), in group space
  const crown = { group: crownGroup, x: 0, z: 0, resting: true, off: false };
  const cv = new THREE.Vector3(), cw = new THREE.Vector3(), cq = new THREE.Quaternion(), cq2 = new THREE.Quaternion(), cAxis = new THREE.Vector3();
  let cBounces = 0, cRollT = -1, cRollDir = 0, cRollSpeed = 0, cGround = 0;
  // paper flight
  let pfT = -1, pfX = 0, pfZ = 0, pfY0 = 0, pfGround = 0, pfYaw = 0;
  const PAPER_FLIGHT = 2.4;

  const S = { speed: 0, maxSpeed: 6, grounded: true, vy: 0, turn: 0, moving: false };
  const zoneOpt = { shape: "circle", x: 0, z: 0, r: 1, yaw: 0, arc: 0, len: 0, width: 0, seconds: 1, colorHex: 0xff3020 };
  const src = { x: 0, z: 0, kind: "melee", knock: 3 };
  const tV = new THREE.Vector3(), tV2 = new THREE.Vector3(), tTo = { x: 0, y: 0, z: 0 };
  const dropData = { potion: { x: 0, z: 0 }, paper: { x: 0, z: 0 } };
  const collider = { x: 0, z: 0, r: 1.2, on: false };

  const boss = {
    group, body,
    x: 0, z: 0, yaw: 0, r: 1.5,
    hp: MAX_HP, maxHp: MAX_HP, phase: 0, alive: true, vulnerable: false, state: "idle",
    assist: 0,
    onEvent: null,
    allies: null,                // optional: a live array of { x, z, alive } (default: combat.allies, found by itself)
    arena, pillars, collider,
    crown,
    paper: null,
    setWorld, setArena, place, start, pause, update, reset, hit, defeat, setHp, setPhase, paperShot, dispose,
    get started() { return started; },
    get paused() { return paused; },
    get dying() { return dying; },
    get dead() { return dead; },
    get attack() { return cur; },
  };

  function emit(type, a, b) { const cb = boss.onEvent; if (cb) cb(type, a, b); }
  function setState(s) { state = s; boss.state = s; stT = 0; }
  function groundAt(x, z) { return world && typeof world.heightAt === "function" ? world.heightAt(x, z) : 0; }
  function windScale() { return Math.max(0.7, PHASE_WIND[boss.phase] * ASSIST_WIND[clamp(boss.assist | 0, 0, 2)]); }
  function dmgScale() { return ASSIST_DMG[clamp(boss.assist | 0, 0, 2)]; }
  function openExtra() { return (boss.assist | 0) >= 2 ? 0.5 : 0; }
  function playerDist() { const p = ctx.player; return Math.hypot(p.x - boss.x, p.z - boss.z); }
  function yawTo(x, z) { return Math.atan2(x - boss.x, z - boss.z); }
  function turnToward(target, rate, dt) {
    const d = wrap(target - boss.yaw), step = clamp(d, -rate * dt, rate * dt);
    boss.yaw = wrap(boss.yaw + step);
    yawRate = dt > 0 ? step / dt : 0;
    return Math.abs(d - step);
  }
  function hurtPlayer(amount, name, knock, kind, fromX, fromZ) {
    const h = ctx.health;
    if (!h || typeof h.damage !== "function") return false;
    src.x = fromX; src.z = fromZ; src.kind = kind; src.knock = knock;
    if (!h.damage(amount * dmgScale(), src)) return false;
    emit("hitPlayer", name);
    return true;
  }
  function cancelZone() { if (zoneId >= 0) { fx.dangerCancel(zoneId); zoneId = -1; } }
  function cancelAll() {
    cancelZone();
    for (let i = 0; i < 3; i++) { const s = spits[i]; if (s.on && s.zone >= 0 && !s.fired) fx.dangerCancel(s.zone); s.on = false; s.zone = -1; }
    spitN = 0;
    if (state === "charging") { body.charging(false); audio.bossCharge(false); }
  }
  function open(sec) {
    boss.vulnerable = true; openT = sec; sinceOpening = 0;
    body.setWeakGlow(1);
    for (let i = 0; i < 3; i++) glows[i].visible = true;
    emit("opening", sec);
  }
  function close(silent) {
    if (!boss.vulnerable) return;
    boss.vulnerable = false; openT = 0;
    body.setWeakGlow(0);
    for (let i = 0; i < 3; i++) glows[i].visible = false;
    if (!silent) emit("closed");
  }
  function idlePose() { body.pose(boss.phase >= 2 ? "wounded" : "proud", 0.5); }
  function toGap(extra) {
    cur = "";
    gapT = Math.max(0.6, GAP[boss.phase] + (boss.assist > 0 ? 0.25 : 0) + (extra || 0));
    setState("stalk"); stalkT = 0;
    idlePose();
  }

  // ------------------------------------------------------------------ set-up API
  function setWorld(w) { world = w || null; }
  function setArena(a) {
    if (!a) return;
    arena.x = +a.x || 0; arena.z = +a.z || 0; arena.r = a.r > 0 ? +a.r : 15;
    pillars.length = 0;
    const list = a.pillars;
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) pillars.push({ x: +list[i].x || 0, z: +list[i].z || 0, r: list[i].r > 0 ? +list[i].r : 0.9, hits: 0, broken: false });
    } else {
      const n = list > 0 ? list | 0 : 4, rr = a.pillarRadius > 0 ? +a.pillarRadius : 9;
      // N, E, S, W
      for (let i = 0; i < n; i++) { const an = (i / n) * TAU; pillars.push({ x: arena.x + Math.sin(an) * rr, z: arena.z + Math.cos(an) * rr, r: 0.9, hits: 0, broken: false }); }
    }
    for (let p = 0; p < 3; p++) { pillarSnap[p].length = 0; for (let i = 0; i < pillars.length; i++) pillarSnap[p].push(0); }
  }
  function place(x, z, yaw) {
    boss.x = +x || 0; boss.z = +z || 0;
    if (yaw !== undefined) boss.yaw = +yaw || 0;
    syncModel();
  }
  function syncModel() {
    body.group.position.set(boss.x, groundAt(boss.x, boss.z), boss.z);
    body.group.rotation.y = boss.yaw;
    collider.x = boss.x; collider.z = boss.z;
  }
  function snapPillars(p) { const a = pillarSnap[p]; for (let i = 0; i < pillars.length; i++) a[i] = pillars[i].hits; }
  function useCollider(on) {
    collider.on = on;
    const list = ctx.colliders;
    if (on && Array.isArray(list) && list.indexOf(collider) < 0) list.push(collider);
  }
  function findAllies() {
    if (boss.allies) return boss.allies;
    if (!alliesTried && typeof ctx.shared === "function") {
      alliesTried = true;
      // the shared combat module, if a level has made one (never creates it: the factory below throws before anything is stored)
      try { const c = ctx.shared("combat", () => { throw new Error("none"); }); alliesAuto = c && Array.isArray(c.allies) ? c.allies : null; } catch (e) { alliesAuto = null; }
    }
    return alliesAuto;
  }

  function start() {
    started = true; paused = false; dying = false; dead = false; finalWait = false;
    boss.alive = true; boss.phase = 0; boss.hp = MAX_HP;
    close(true);
    cancelAll();
    snapPillars(0);
    sinceOpening = 0; sinceCharge = 0; last1 = last2 = queued = ""; alliesTried = false;
    useCollider(true);
    body.pose("proud", 0.3);
    body.attack("roar");
    audio.bossRoar(1);
    flareT = 1.2;
    cur = "roar"; atkT = 0; atkTotal = ATT.roar.dur; atkHitDone = true;
    setState("intro");
  }
  function pause(on) { paused = !!on; if (paused) { speedNow = 0; yawRate = 0; } }

  // ------------------------------------------------------------------ damage to him
  function floorHp() { return MAX_HP - PHASE_HP * (boss.phase + 1); }
  function busy() { return state === "phaseStagger" || state === "phaseRoar" || state === "intro" || state === "return"; }
  function applyDamage(d) {
    if (!(d > 0) || dying || dead || finalWait || busy()) return;
    const fl = floorHp();
    boss.hp = Math.max(fl, boss.hp - d);
    if (boss.hp <= fl) {
      if (boss.phase < 2) phaseChange(boss.phase + 1);
      else finalStagger();
    }
  }
  function weakSpot(info) {
    // the ankle nearest to where the blow came from
    body.spurL.getWorldPosition(tV); body.spurR.getWorldPosition(tV2);
    if (info && typeof info.x === "number") {
      const dl = Math.hypot(tV.x - info.x, tV.z - info.z), dr = Math.hypot(tV2.x - info.x, tV2.z - info.z);
      if (dr < dl) tV.copy(tV2);
    }
    return tV;
  }
  function hit(dmg, info) {
    if (!started || dead || dying || !boss.alive) return "none";
    dmg = +dmg || 0;
    const kind = info && info.kind;
    if (kind === "ally") {
      // the army chips at him whatever his guard, 8 hp/s at most between them
      const d = Math.min(dmg, allyBudget);
      if (d > 0 && !finalWait && !busy()) { allyBudget -= d; applyDamage(d); }
      return boss.vulnerable ? "weak" : "armor";
    }
    if (finalWait) {
      fx.stingBurst(weakSpot(info));
      audio.bossHurt(true);
      emit("hit", "weak");
      defeat();
      return "weak";
    }
    if (busy()) {
      if (hurtSfxT <= 0) { audio.bossHurt(false); hurtSfxT = 0.25; }
      return "armor";
    }
    if (boss.vulnerable) {
      audio.bossHurt(true);
      fx.stingBurst(weakSpot(info));
      body.hurt();
      emit("hit", "weak");
      applyDamage(dmg * 3);
      return "weak";
    }
    if (hurtSfxT <= 0) { audio.bossHurt(false); hurtSfxT = 0.18; }
    if (info && typeof info.x === "number") { tV.set(lerp(info.x, boss.x, 0.6), groundAt(boss.x, boss.z) + 0.8, lerp(info.z, boss.z, 0.6)); fx.hitBurst(tV, 0xffd9a0); }
    if (!hintShown && ctx.ui && typeof ctx.ui.hint === "function") { hintShown = true; ctx.ui.hint(HINT_ARMOR, 3); }
    emit("hit", "armor");
    applyDamage(dmg * 0.2);
    return "armor";
  }

  function phaseChange(n) {
    cancelAll();
    close(false);
    boss.phase = n;
    boss.hp = MAX_HP - PHASE_HP * n;
    snapPillars(n);
    queued = ""; cur = "stagger";
    body.pose(n >= 2 ? "wounded" : "proud", 0.6);
    body.attack("stagger");
    audio.bossPhase();
    speedNow = 0; yawRate = 0;
    setState("phaseStagger");
    emit("phase", n);
  }
  function finalStagger() {
    cancelAll();
    close(true);
    boss.hp = 0;
    finalWait = true;
    boss.vulnerable = true;
    body.setWeakGlow(1);
    for (let i = 0; i < 3; i++) glows[i].visible = true;
    body.pose("wounded", 0.4);
    body.attack("stagger");
    cur = "stagger"; speedNow = 0; yawRate = 0;
    setState("final");
    emit("finalStagger");
  }

  // ------------------------------------------------------------------ the end
  function defeat() {
    if (dying || dead) return;
    cancelAll();
    finalWait = false; dying = true; boss.alive = false; boss.hp = 0;
    boss.vulnerable = false;
    body.setWeakGlow(0);
    for (let i = 0; i < 3; i++) glows[i].visible = false;
    useCollider(false);
    if (slowed) { ctx.player.maxSpeed = slowBase; slowed = false; slowT = 0; }
    body.pose(null, 0.3);
    body.attack("rear");
    cur = "rear"; speedNow = 0; yawRate = 0;
    dT = 0; dStep = 0;
    setState("dying");
    emit("defeated");
  }
  function crownOff() {
    if (crown.off) return;
    crown.off = true; crown.resting = false;
    group.updateMatrixWorld(true);
    crownGroup.updateMatrixWorld(true);
    crownGroup.matrixWorld.decompose(cv, cq, cw);
    group.worldToLocal(cv);
    group.add(crownGroup);
    crownGroup.position.copy(cv);
    crownGroup.quaternion.copy(cq);
    crownGroup.scale.setScalar(KING_SCALE);
    // it slips off backwards and to his left as his head goes back
    const sy = Math.sin(boss.yaw), cy = Math.cos(boss.yaw);
    cw.set(-sy * 1.3 + cy * 1.1, 1.6, -cy * 1.3 - sy * 1.1);     // velocity
    cAxis.set(cy, 0.3, -sy).normalize();                          // tumble axis
    cBounces = 0; cRollT = -1;
    emit("crownOff");
  }
  function updateCrown(dt) {
    if (!crown.off || crown.resting) return;
    const R = 0.054 * KING_SCALE;
    const p = crownGroup.position;
    if (cRollT < 0) {
      cw.y -= 17 * dt;
      p.x += cw.x * dt; p.y += cw.y * dt; p.z += cw.z * dt;
      cq.setFromAxisAngle(cAxis, 7.5 * dt);
      crownGroup.quaternion.premultiply(cq);
      cGround = groundAt(p.x, p.z);
      if (p.y < cGround + R * 0.55 && cw.y < 0) {
        p.y = cGround + R * 0.55;
        cBounces++;
        tV.set(p.x, p.y, p.z); fx.crownSpark(tV);
        if (cBounces >= 3 || cw.y > -1.6) {
          // onto its rim: it rolls away in a tightening curve
          cRollT = 0; cRollDir = Math.atan2(cw.x, cw.z); cRollSpeed = clamp(Math.hypot(cw.x, cw.z), 1.2, 2.6);
        } else {
          cw.y = -cw.y * 0.42; cw.x *= 0.7; cw.z *= 0.7;
          cAxis.set(cw.z, 0.2, -cw.x).normalize();
        }
      }
    } else {
      cRollT += dt;
      const T = 2.3, u = sat(cRollT / T), sp = cRollSpeed * (1 - u) * (1 - u);
      cRollDir += (1.1 + 2.2 * u) * dt;
      p.x += Math.sin(cRollDir) * sp * dt; p.z += Math.cos(cRollDir) * sp * dt;
      cGround = groundAt(p.x, p.z);
      // upright on its rim while it rolls, then it wobbles down flat like a dropped coin
      const flat = smooth(0.55, 1, u), wob = (1 - flat) * 0.12 * Math.sin(cRollT * 9) + flat * (1 - u) * 0.5 * Math.sin(cRollT * 21);
      const tilt = (PI / 2) * (1 - flat) + wob;
      cq.setFromAxisAngle(cAxis.set(0, 1, 0), cRollDir);
      cq2.setFromAxisAngle(cAxis.set(1, 0, 0), tilt);
      cq.multiply(cq2);
      cq2.setFromAxisAngle(cAxis.set(0, 1, 0), cRollT * sp * 3);
      cq.multiply(cq2);
      crownGroup.quaternion.slerp(cq, sat(dt * 12));
      p.y = cGround + lerp(0.004 * KING_SCALE, R, Math.abs(Math.sin(tilt)));
      if (u >= 1) {
        crown.resting = true;
        cq.setFromAxisAngle(cAxis.set(0, 1, 0), cRollDir);
        crownGroup.quaternion.copy(cq);
        p.y = cGround + 0.004 * KING_SCALE;
      }
    }
    crown.x = p.x; crown.z = p.z;
  }
  function updateDefeat(dt) {
    dT += dt;
    const fallAt = ATT.rear.dur;
    if (dStep === 0 && dT >= fallAt) { dStep = 1; body.attack("fall"); cur = "fall"; flareT = 0.8; }
    if (dStep === 1 && dT >= fallAt + 0.3) { dStep = 2; audio.kingFall(); }
    if (dStep === 2 && dT >= fallAt + 0.6) { dStep = 3; crownOff(); }
    if (dStep === 3 && dT >= fallAt + ATT.fall.hit) {
      dStep = 4;
      // he lands on his right side: the dust goes up along the whole length of him
      const sy = Math.sin(boss.yaw), cy = Math.cos(boss.yaw);
      const gx = boss.x - cy * 0.5, gz = boss.z + sy * 0.5;
      fx.slam(gx, gz, 3.2);
      fx.footDust(gx + sy * 1.2, groundAt(gx, gz), gz + cy * 1.2, 1, 0x9c8c72);
      fx.footDust(gx - sy * 1.2, groundAt(gx, gz), gz - cy * 1.2, 1, 0x9c8c72);
      emit("landed");
    }
    if (dStep === 4 && dT >= fallAt + ATT.fall.hit + 1.35) {
      dStep = 5;
      // out of the opening forepaw
      const fl = body.skeleton.getBoneByName("FL_foot");
      if (fl) fl.getWorldPosition(tV); else tV.set(boss.x, 0, boss.z);
      const dx = tV.x - boss.x, dz = tV.z - boss.z, d = Math.hypot(dx, dz) || 1;
      dropData.potion.x = tV.x + (dx / d) * 0.55; dropData.potion.z = tV.z + (dz / d) * 0.55;
      dropData.paper.x = tV.x + (dx / d) * 1.2 - (dz / d) * 0.7; dropData.paper.z = tV.z + (dz / d) * 1.2 + (dx / d) * 0.7;
      emit("drop", dropData);
    }
    if (dStep === 5 && dT >= fallAt + ATT.fall.dur + 0.1) {
      dStep = 6; dead = true; cur = "";
      body.pose("still", 0.02);
      setState("dead");
    }
  }

  // ------------------------------------------------------------------ checkpoint restore
  function restoreLooks() {
    seatCrown();
    crown.off = false; crown.resting = true; crown.x = boss.x; crown.z = boss.z;
    capeGone = boss.phase >= 2; tearT = -1;
    UC.tear.value = capeGone ? 1 : 0;
    cape.visible = !capeGone;
    UC.flare.value = 0; flareT = 0;
    paperGroup.visible = false; pfT = -1; paper.resting = false; UP.read.value = 0;
  }
  function clearFight() {
    cancelAll();
    close(true);
    for (let i = 0; i < 2; i++) rings[i].id = -1;
    if (slowed) { ctx.player.maxSpeed = slowBase; slowed = false; }
    slowT = 0;
    finalWait = false; dying = false; dead = false; boss.alive = true;
    cur = ""; queued = ""; last1 = last2 = ""; sinceOpening = 0; sinceCharge = 0;
    speedNow = 0; yawRate = 0; allyBudget = 0; dT = 0; dStep = 0;
    body.reset();
    body.revive();
    body.pose(null, 0.02);
  }
  function setHp(hp) {
    boss.hp = clamp(+hp || 0, 0, MAX_HP);
    boss.phase = boss.hp > 2 * PHASE_HP ? 0 : boss.hp > PHASE_HP ? 1 : 2;
  }
  function setPhase(n) {
    n = clamp(n | 0, 0, 2);
    clearFight();
    boss.phase = n; boss.hp = MAX_HP - PHASE_HP * n;
    const snap = pillarSnap[n];
    for (let i = 0; i < pillars.length; i++) {
      const h = snap[i] || 0, was = pillars[i].broken;
      pillars[i].hits = h; pillars[i].broken = h >= 3;
      if (was !== pillars[i].broken) emit("pillar", i, pillars[i].broken);
    }
    for (let p = n + 1; p < 3; p++) for (let i = 0; i < pillars.length; i++) pillarSnap[p][i] = snap[i] || 0;
    restoreLooks();
    started = true; paused = false;
    useCollider(true);
    idlePose();
    gapT = 1.0;
    setState("return"); // he walks back to the centre of the ring
  }
  function reset() {
    clearFight();
    started = false; paused = false;
    boss.hp = MAX_HP; boss.phase = 0; boss.assist = 0; hintShown = false;
    for (let i = 0; i < pillars.length; i++) { pillars[i].hits = 0; pillars[i].broken = false; }
    for (let p = 0; p < 3; p++) for (let i = 0; i < pillars.length; i++) pillarSnap[p][i] = 0;
    restoreLooks();
    useCollider(false);
    pInit = false; alliesTried = false;
    setState("idle");
    syncModel();
  }

  // ------------------------------------------------------------------ attacks
  function zone(shape, x, z, r, yaw, arc, len, width, seconds) {
    zoneOpt.shape = shape; zoneOpt.x = x; zoneOpt.z = z; zoneOpt.r = r; zoneOpt.yaw = yaw; zoneOpt.arc = arc; zoneOpt.len = len; zoneOpt.width = width;
    zoneOpt.seconds = Math.max(0.06, seconds);
    return fx.dangerZone(zoneOpt);
  }
  function clampTarget() {
    // where the bill can come down: 1.7 .. 4.1 m from him
    const p = ctx.player;
    let dx = p.x - boss.x, dz = p.z - boss.z;
    const d = Math.hypot(dx, dz) || 1e-3, k = clamp(d, 1.7, 4.1) / d;
    tgtX = boss.x + dx * k; tgtZ = boss.z + dz * k;
  }
  function begin(name) {
    const def = ATT[name], ws = windScale();
    cur = name; atkT = 0; atkHitDone = false; atkAux = 0; locked = false;
    atkW = (def.windup || 0) * ws;
    const hold = name === "slam" || name === "pound" ? openExtra() : 0;
    atkTotal = body.attack(name, ws, hold);
    body.pose(boss.phase >= 2 ? "wounded" : null, 0.3);
    audio.bossWindup(name);
    last2 = last1; last1 = name;
    if (name === "charge") sinceCharge = 0; else sinceCharge++;
    speedNow = 0;
    const p = ctx.player;
    if (name === "sweep") {
      lockYaw = boss.yaw;
      zoneId = zone("cone", boss.x, boss.z, 5.0, boss.yaw, (150 * PI) / 180, 0, 0, atkW);
    } else if (name === "slam") {
      clampTarget();
      zoneX = tgtX; zoneZ = tgtZ; zoneT = 0;
      zoneId = zone("circle", tgtX, tgtZ, 2.4, 0, 0, 0, 0, atkW);
    } else if (name === "charge") {
      zoneYaw = boss.yaw; zoneT = 0;
      zoneId = zone("line", boss.x, boss.z, 0, boss.yaw, 0, 18, 2.6, atkW + 0.35);
    } else if (name === "pound") {
      zoneId = zone("circle", boss.x, boss.z, 3.0, 0, 0, 0, 0, atkW);
    } else if (name === "spit") {
      zoneId = -1; spitN = 0;
      for (let k = 0; k < 3; k++) {
        const s = spits[k];
        s.on = true; s.fired = false; s.zone = -1;
        s.launch = atkW + 0.2 * k; s.land = atkW + 0.55 + 0.4 * k;
      }
      atkAux = 0; // zones laid so far
    }
    setState("attack");
    emit("telegraph", name);
    void p;
  }
  function insideArena(x, z, margin) {
    const dx = x - arena.x, dz = z - arena.z, d = Math.hypot(dx, dz), lim = arena.r - margin;
    if (d > lim) { tTo.x = arena.x + (dx / d) * lim; tTo.z = arena.z + (dz / d) * lim; } else { tTo.x = x; tTo.z = z; }
  }
  function stun(cx, cz) {
    // into a stone or the wall: the long opening
    body.charging(false);
    audio.bossCharge(false);
    audio.bossHitWall();
    fx.slam(cx, cz, 1.8);
    boss.x -= Math.sin(boss.yaw) * 0.6; boss.z -= Math.cos(boss.yaw) * 0.6;
    const extra = openExtra();
    atkTotal = body.attack("stagger", 1, 0.1 + extra);
    cur = "stagger"; atkT = 0; speedNow = 0; flareT = 0.5;
    chargeStunned = true;
    setState("stunned");
    open(2.6 + extra);
  }
  function updateAttack(dt) {
    atkT += dt;
    const p = ctx.player;
    switch (cur) {
      case "sweep": {
        if (!atkHitDone && atkT >= atkW) {
          atkHitDone = true; zoneId = -1;
          audio.bossSwipe();
          emit("attack", "sweep");
          const d = playerDist();
          if (d < 5.0 + 0.3 && p.grounded !== false && Math.abs(wrap(yawTo(p.x, p.z) - lockYaw)) < (75 * PI) / 180 + 0.08) hurtPlayer(25, "sweep", 6, "melee", boss.x, boss.z);
          fx.footDust(boss.x + Math.sin(lockYaw) * 2.6, groundAt(boss.x, boss.z), boss.z + Math.cos(lockYaw) * 2.6, 1, 0x9c8c72);
          flareT = 0.5;
        }
        break;
      }
      case "slam": {
        const lockAt = Math.max(0, atkW - 0.5);
        if (!locked) {
          // the circle follows the player until half a second before the bill comes down
          clampTarget();
          turnToward(yawTo(tgtX, tgtZ), 2.6, dt);
          zoneT += dt;
          const moved = Math.hypot(tgtX - zoneX, tgtZ - zoneZ);
          if (atkT >= lockAt || (moved > 0.3 && zoneT > 0.08)) {
            cancelZone();
            zoneX = tgtX; zoneZ = tgtZ; zoneT = 0;
            zoneId = zone("circle", tgtX, tgtZ, 2.4, 0, 0, 0, 0, atkW - atkT);
          }
          if (atkT >= lockAt) {
            locked = true; tgtX = zoneX; tgtZ = zoneZ;
            lunge0 = 0; lungeD = clamp(Math.hypot(tgtX - boss.x, tgtZ - boss.z) - BILL_REACH, -0.5, 2.5);
            lockYaw = yawTo(tgtX, tgtZ);
          }
        } else if (!atkHitDone) {
          turnToward(lockYaw, 4, dt);
          // the last instant: his whole weight goes forward so the bill lands in the circle
          const u = smooth(atkW - 0.16, atkW, atkT), step = (u - lunge0) * lungeD;
          lunge0 = u;
          boss.x += Math.sin(boss.yaw) * step; boss.z += Math.cos(boss.yaw) * step;
        }
        if (!atkHitDone && atkT >= atkW) {
          atkHitDone = true; zoneId = -1;
          audio.bossSlam();
          fx.slam(tgtX, tgtZ, 2.4);
          emit("attack", "slam");
          if (Math.hypot(p.x - tgtX, p.z - tgtZ) < 2.4 + 0.2) hurtPlayer(30, "slam", 5, "melee", tgtX, tgtZ);
          open(1.8 + openExtra()); // the bill is stuck
        }
        break;
      }
      case "charge": {
        const lockAt = atkW * 0.7;
        if (!locked) {
          turnToward(yawTo(p.x, p.z), 3.2, dt);
          zoneT += dt;
          if (atkT >= lockAt || (Math.abs(wrap(boss.yaw - zoneYaw)) > 0.05 && zoneT > 0.08)) {
            cancelZone();
            zoneYaw = boss.yaw; zoneT = 0;
            zoneId = zone("line", boss.x, boss.z, 0, boss.yaw, 0, 18, 2.6, atkW - atkT + 0.35);
          }
          if (atkT >= lockAt) { locked = true; lockYaw = boss.yaw; }
        }
        if (atkT >= atkW) {
          zoneId = -1;
          chargeLeft = 18; chargeHit = false; chargeStunned = false;
          body.charging(true);
          audio.bossCharge(true);
          emit("attack", "charge");
          setState("charging");
        }
        break;
      }
      case "pound": {
        if (!atkHitDone && atkT >= atkW) {
          atkHitDone = true; zoneId = -1;
          audio.bossSlam();
          fx.slam(boss.x, boss.z, 3.0);
          emit("attack", "pound");
          if (playerDist() < 3.0 + 0.2 && p.grounded !== false) hurtPlayer(20, "pound", 5, "melee", boss.x, boss.z);
          rings[0].id = fx.shockRing(boss.x, boss.z, 9, 12); rings[0].prev = 0; rings[0].hit = false;
          atkAux = boss.phase >= 2 ? 1 : 0; // a second ring is owed
          open(1.2 + openExtra());
          flareT = 0.6;
        }
        if (atkAux === 1 && atkT >= atkW + 0.9) {
          atkAux = 0;
          audio.bossStep(1);
          fx.slam(boss.x + Math.sin(boss.yaw) * 0.9, boss.z + Math.cos(boss.yaw) * 0.9, 1.3);
          rings[1].id = fx.shockRing(boss.x, boss.z, 9, 12); rings[1].prev = 0; rings[1].hit = false;
        }
        break;
      }
      case "spit": {
        // three circles: where the player stands, then where the player is heading
        const ws = atkW / (ATT.spit.windup || 0.8);
        while (atkAux < 3 && atkT >= 0.4 * atkAux * ws) {
          const s = spits[atkAux], lead = atkAux === 0 ? 0 : (s.land - atkT) * 0.8;
          insideArena(p.x + pvx * lead, p.z + pvz * lead, 1.0);
          s.x = tTo.x; s.z = tTo.z;
          s.zone = zone("circle", s.x, s.z, 1.5, 0, 0, 0, 0, s.land - atkT);
          atkAux++;
        }
        turnToward(yawTo(p.x, p.z), 1.6, dt);
        break;
      }
      default: break;
    }
    // venom in flight outlives the animation
    if (cur === "spit") {
      let live = false;
      for (let k = 0; k < 3; k++) {
        const s = spits[k];
        if (!s.on) continue;
        live = true;
        if (!s.fired && atkT >= s.launch && s.zone >= 0) {
          s.fired = true;
          body.billTip.getWorldPosition(tV);
          tTo.x = s.x; tTo.z = s.z; tTo.y = groundAt(s.x, s.z) + 0.05;
          fx.venomGlob(tV, tTo, Math.max(0.2, s.land - atkT));
          if (k === 0) emit("attack", "spit");
        }
        if (atkT >= s.land) {
          s.on = false;
          if (Math.hypot(p.x - s.x, p.z - s.z) < 1.5 + 0.15 && hurtPlayer(15, "spit", 1.5, "blast", s.x, s.z)) {
            slowT = 2;
            if (!slowed) { slowed = true; slowBase = p.maxSpeed; }
            emit("slow", 2);
          }
        }
      }
      if (!live && atkT >= atkTotal) finishAttack();
      return;
    }
    if (atkT >= atkTotal && state === "attack") finishAttack();
  }
  function finishAttack() {
    const was = cur;
    // phase 3 strings attacks together
    if (boss.phase >= 2 && !queued) { if (was === "sweep") queued = "slam"; }
    toGap(queued ? -1 : 0);
  }
  function updateCharging(dt) {
    const p = ctx.player, v = CHARGE_SPEED[boss.phase], step = Math.min(v * dt, chargeLeft);
    const sy = Math.sin(boss.yaw), cy = Math.cos(boss.yaw);
    boss.x += sy * step; boss.z += cy * step;
    chargeLeft -= step;
    speedNow = v; yawRate = 0;
    flareT = Math.max(flareT, 0.25);
    if (!chargeHit) {
      const dx = p.x - boss.x, dz = p.z - boss.z;
      if (dx * dx + dz * dz < 1.9 * 1.9) { chargeHit = true; hurtPlayer(35, "charge", 9, "melee", boss.x - sy * 1.5, boss.z - cy * 1.5); }
    }
    for (let i = 0; i < pillars.length; i++) {
      const q = pillars[i];
      if (q.broken) continue;
      const dx = q.x - boss.x, dz = q.z - boss.z, lim = 1.3 + q.r;
      if (dx * dx + dz * dz < lim * lim && dx * sy + dz * cy > 0) {
        q.hits++; q.broken = q.hits >= 3;
        emit("pillar", i, q.broken);
        stun(lerp(boss.x, q.x, 0.6), lerp(boss.z, q.z, 0.6));
        return;
      }
    }
    const ax = boss.x - arena.x, az = boss.z - arena.z, ad = Math.hypot(ax, az);
    if (ad > arena.r - 1.5 && ax * sy + az * cy > 0) {
      stun(boss.x + sy * 1.5, boss.z + cy * 1.5);
      return;
    }
    if (chargeLeft <= 0) {
      // nothing in the way: he skids to a stop
      body.charging(false);
      audio.bossCharge(false);
      fx.footDust(boss.x + sy * 1.2, groundAt(boss.x, boss.z), boss.z + cy * 1.2, 1, 0x9c8c72);
      speedNow = 0;
      if (boss.phase >= 2) queued = "pound";
      atkT = 0; atkTotal = 0.75;
      setState("skid");
    }
  }
  function choose() {
    const d = playerDist(), ph = boss.phase;
    if (queued) { const q = queued; queued = ""; return q; }
    if (sinceOpening > 20) return "slam";
    if (sinceCharge >= 3) return "charge";
    let wSweep = d < 5.5 ? 3 : 0.3, wSlam = d < 5 ? 2.5 : 1, wCharge = d > 5 ? 3 : 1.2;
    let wPound = ph >= 1 ? (d < 6 ? 2 : 0.6) : 0, wSpit = ph >= 1 ? (d > 4 ? 2.2 : 0.5) : 0;
    if (last1 === last2) { // never the same attack three times running
      if (last1 === "sweep") wSweep = 0; else if (last1 === "slam") wSlam = 0; else if (last1 === "charge") wCharge = 0; else if (last1 === "pound") wPound = 0; else if (last1 === "spit") wSpit = 0;
    }
    let r = Math.random() * (wSweep + wSlam + wCharge + wPound + wSpit);
    if ((r -= wSweep) < 0) return "sweep";
    if ((r -= wSlam) < 0) return "slam";
    if ((r -= wCharge) < 0) return "charge";
    if ((r -= wPound) < 0) return "pound";
    return "spit";
  }
  function keepInside(margin) {
    const dx = boss.x - arena.x, dz = boss.z - arena.z, d = Math.hypot(dx, dz), lim = arena.r - margin;
    if (d > lim && d > 0) { boss.x = arena.x + (dx / d) * lim; boss.z = arena.z + (dz / d) * lim; }
    for (let i = 0; i < pillars.length; i++) {
      const q = pillars[i];
      if (q.broken) continue;
      const qx = boss.x - q.x, qz = boss.z - q.z, qd = Math.hypot(qx, qz), ql = q.r + 1.35;
      if (qd < ql && qd > 1e-4) { boss.x = q.x + (qx / qd) * ql; boss.z = q.z + (qz / qd) * ql; }
    }
  }
  let wantAtk = "";
  function updateStalk(dt) {
    const p = ctx.player;
    gapT -= dt; stalkT += dt;
    if (!wantAtk && gapT <= 0.35) wantAtk = choose();
    const d = playerDist();
    const range = wantAtk === "sweep" ? 4.3 : wantAtk === "slam" ? 5.2 : wantAtk === "pound" ? 4.6 : 30;
    const off = turnToward(yawTo(p.x, p.z), boss.phase >= 2 ? 2.0 : 2.4, dt);
    // he comes on at a walk; never into the player
    const want = d > Math.min(range, 3.0) ? WALK[boss.phase] : 0;
    speedNow += clamp(want * (off < 1.0 ? 1 : 0.3) - speedNow, -8 * dt, 5 * dt);
    boss.x += Math.sin(boss.yaw) * speedNow * dt; boss.z += Math.cos(boss.yaw) * speedNow * dt;
    keepInside(1.7);
    if (gapT > 0 || !wantAtk) return;
    const facing = off < (wantAtk === "pound" || wantAtk === "spit" ? 3.2 : 0.3);
    if ((d <= range && facing) || gapT < -1.3) {
      // could not get near enough: something that does not need to be near
      let name = wantAtk;
      if (d > range) name = boss.phase >= 1 && last1 === "charge" ? "spit" : "charge";
      wantAtk = "";
      begin(name);
    }
  }
  function updateRings() {
    const p = ctx.player;
    for (let i = 0; i < 2; i++) {
      const g = rings[i];
      if (g.id < 0) continue;
      const r = fx.shockRadius(g.id);
      if (r < 0) { g.id = -1; continue; }
      if (!g.hit && p.grounded !== false) {
        const d = Math.hypot(p.x - ringX, p.z - ringZ);
        if (d > g.prev - 0.3 && d < r + 0.3 && d > 2.2) { g.hit = true; hurtPlayer(20, "pound", 4, "melee", ringX, ringZ); }
      }
      g.prev = r;
    }
  }
  let ringX = 0, ringZ = 0;

  // ------------------------------------------------------------------ per frame
  function onStep(i, lx, lz, strength) {
    if (!started) return;
    const sy = Math.sin(boss.yaw), cy = Math.cos(boss.yaw);
    const wx = boss.x + lx * cy + lz * sy, wz = boss.z - lx * sy + lz * cy;
    if (stepSfxT <= 0) { audio.bossStep(clamp(0.45 + 0.5 * strength, 0, 1)); stepSfxT = state === "charging" ? 0.12 : 0.2; }
    fx.footDust(wx, groundAt(wx, wz), wz, state === "charging" ? 1 : 0.5, 0x9c8c72);
  }
  body.onFootstep = onStep;

  function update(dt, time) {
    if (!(dt >= 0)) dt = 0;
    clock += dt;
    const p = ctx.player;
    if (dt > 0 && p) {
      if (!pInit) { px = p.x; pz = p.z; pInit = true; }
      const k = 1 - Math.exp(-dt * 6);
      pvx += ((p.x - px) / dt - pvx) * k; pvz += ((p.z - pz) / dt - pvz) * k;
      px = p.x; pz = p.z;
    }
    if (hurtSfxT > 0) hurtSfxT -= dt;
    if (stepSfxT > 0) stepSfxT -= dt;

    if (started && !paused && p) {
      stT += dt;
      if (!dying && !dead) sinceOpening += dt;
      // the opening closes by itself
      if (boss.vulnerable && !finalWait) { openT -= dt; if (openT <= 0) close(false); }
      // the army: 1 hp/s for each ally within 4 m, 8 hp/s at most
      allyBudget = Math.min(8, allyBudget + 8 * dt);
      if (!dying && !dead && !finalWait && !busy()) {
        const list = findAllies();
        if (list) {
          let n = 0;
          for (let i = 0; i < list.length; i++) { const a = list[i]; if (a && a.alive !== false && Math.abs(a.x - boss.x) < 4 && Math.abs(a.z - boss.z) < 4 && Math.hypot(a.x - boss.x, a.z - boss.z) < 4) n++; }
          if (n > 0) { const d = Math.min(Math.min(n, 8) * dt, allyBudget); allyBudget -= d; applyDamage(d); }
        }
      }
      switch (state) {
        case "intro":
          atkT += dt;
          if (atkT >= atkTotal) toGap(0.2);
          break;
        case "stalk": updateStalk(dt); break;
        case "attack": speedNow = 0; yawRate = 0; updateAttack(dt); break;
        case "charging": updateCharging(dt); break;
        case "skid":
          atkT += dt; speedNow = 0;
          if (atkT >= atkTotal) toGap(0);
          break;
        case "stunned":
          atkT += dt;
          if (atkT >= atkTotal) toGap(0);
          break;
        case "phaseStagger":
          if (stT >= ATT.stagger.dur) {
            body.attack("roar");
            audio.bossRoar(1.2);
            cur = "roar"; atkHitDone = false; flareT = 1.3;
            if (boss.phase >= 2 && !capeGone) tearT = 0;
            setState("phaseRoar");
          }
          break;
        case "phaseRoar":
          if (!atkHitDone && stT >= ATT.roar.hit) {
            atkHitDone = true;
            // everyone is thrown back 5 m (no damage)
            const dx = p.x - boss.x, dz = p.z - boss.z, d = Math.hypot(dx, dz) || 1;
            if (d < 16) { p.kx += (dx / d) * 35; p.kz += (dz / d) * 35; }
            fx.shockRing(boss.x, boss.z, 16, 9, 0xd8c8a6);
            emit("roar", boss.phase);
          }
          if (stT >= ATT.roar.dur) {
            emit("summon", boss.phase === 1 ? 4 : 6);
            sinceOpening = 0; sinceCharge = 0;
            toGap(0.4);
          }
          break;
        case "final":
          // swaying in the middle of the ring, open, waiting for the one last blow
          speedNow = 0; yawRate = 0;
          if (!body.acting) { body.attack("stagger"); cur = "stagger"; }
          break;
        case "return": {
          const dx = arena.x - boss.x, dz = arena.z - boss.z, d = Math.hypot(dx, dz);
          if (d > 0.6 && stT < 6) {
            turnToward(Math.atan2(dx, dz), 2.6, dt);
            speedNow += clamp(WALK[boss.phase] * 1.2 - speedNow, -8 * dt, 5 * dt);
            boss.x += Math.sin(boss.yaw) * speedNow * dt; boss.z += Math.cos(boss.yaw) * speedNow * dt;
          } else toGap(0.2);
          break;
        }
        case "dying": updateDefeat(dt); break;
        default: speedNow = 0; yawRate = 0; break;
      }
      if (rings[0].id >= 0 || rings[1].id >= 0) updateRings(); else { ringX = boss.x; ringZ = boss.z; }
      if (state !== "charging" && state !== "dying" && state !== "dead") keepInside(1.45);
      // venom: slowed for two seconds
      if (slowed) {
        slowT -= dt;
        if (slowT > 0) p.maxSpeed = slowBase * 0.55;
        else { p.maxSpeed = slowBase; slowed = false; }
      }
    } else { speedNow = 0; yawRate = 0; }

    // the model
    syncModel();
    S.speed = speedNow; S.turn = yawRate; S.moving = speedNow > 0.05;
    S.maxSpeed = state === "charging" ? 16 : 6;
    body.update(dt, S);

    // cape, glows
    UC.time.value = clock;
    if (flareT > 0) flareT -= dt;
    const fl = state === "charging" ? 1 : flareT > 0 ? Math.min(1, flareT * 2.5) : 0;
    UC.flare.value += (fl - UC.flare.value) * (1 - Math.exp(-dt * 7));
    UC.walk.value += (sat(speedNow / 3) - UC.walk.value) * (1 - Math.exp(-dt * 5));
    if (tearT >= 0) {
      tearT += dt;
      UC.tear.value = sat(tearT / 1.3);
      if (tearT >= 1.3) { tearT = -1; capeGone = true; cape.visible = false; }
    }
    if (boss.vulnerable) {
      const s = 0.034 + 0.008 * Math.sin(clock * 6.5);
      glows[0].scale.setScalar(s); glows[1].scale.setScalar(s); glows[2].scale.setScalar(s * 1.7);
      glowMat.opacity = 0.26 + 0.12 * Math.sin(clock * 6.5);
    }
    updateCrown(dt);
    if (!crown.off) { crown.x = boss.x; crown.z = boss.z; }
    updatePaper(dt);
  }

  // ------------------------------------------------------------------ the paper
  const paper = {
    group: paperGroup, pick: paperPick, resting: false,
    x: 0, y: 0, z: 0,
    cam: { pos: new THREE.Vector3(), look: new THREE.Vector3() },
    place(x, z) {
      pfT = -1;
      paper.x = +x || 0; paper.z = +z || 0; paper.y = groundAt(paper.x, paper.z) + 0.012;
      paperGroup.position.set(paper.x, paper.y, paper.z);
      paperGroup.rotation.set(0, pfYaw, 0);
      paperGroup.visible = true;
      paper.resting = true;
      paperShot(paper.cam);
    },
    flutterDown(x, z) {
      pfX = +x || 0; pfZ = +z || 0; pfGround = groundAt(pfX, pfZ) + 0.012; pfY0 = pfGround + 1.7;
      pfYaw = boss.yaw + 0.6;
      pfT = 0; paper.resting = false;
      paperGroup.visible = true;
      updatePaper(0);
      return PAPER_FLIGHT;
    },
    setReadable(v) { UP.read.value = sat(+v || 0); },
    get readable() { return UP.read.value; },
    hide() { paperGroup.visible = false; pfT = -1; paper.resting = false; },
    paperShot,
  };
  boss.paper = paper;
  function updatePaper(dt) {
    if (pfT < 0) return;
    pfT += dt;
    const u = sat(pfT / PAPER_FLIGHT);
    // a see-saw: it slides one way, stalls, tips, slides back, each swing lower and shorter
    const swings = 3.5, a = u * swings * PI, amp = (1 - u) * (1 - u);
    const sx = Math.sin(a) * 0.5 * amp, tilt = Math.cos(a) * 0.75 * amp;
    const y = lerp(pfY0, pfGround, u * u * 0.35 + u * 0.65) + 0.1 * amp * Math.abs(Math.sin(a));
    const cy = Math.cos(pfYaw), sy = Math.sin(pfYaw);
    paper.x = pfX + cy * sx; paper.z = pfZ - sy * sx; paper.y = y;
    paperGroup.position.set(paper.x, y, paper.z);
    paperGroup.rotation.set(0.25 * amp * Math.sin(a * 0.5 + 1), pfYaw, -tilt);
    if (u >= 1) {
      pfT = -1;
      paper.x = pfX; paper.z = pfZ; paper.y = pfGround;
      paperGroup.position.set(pfX, pfGround, pfZ);
      paperGroup.rotation.set(0, pfYaw, 0);
      paper.resting = true;
      audio.paperRustle();
      tV.set(pfX, pfGround + 0.05, pfZ); fx.paperGlint(tV);
      paperShot(paper.cam);
    }
  }
  // a close-up camera pose 0.45 m above the resting paper, the top of the page at the top of the screen
  function paperShot(out) {
    out = out || paper.cam;
    if (!out.pos) out.pos = new THREE.Vector3();
    if (!out.look) out.look = new THREE.Vector3();
    const cy = Math.cos(pfYaw), sy = Math.sin(pfYaw);
    out.look.x = paper.x; out.look.y = paper.y; out.look.z = paper.z;
    out.pos.x = paper.x - sy * 0.09; out.pos.y = paper.y + 0.45; out.pos.z = paper.z - cy * 0.09;
    return out;
  }

  function dispose() {
    body.dispose();
    crownGeo.dispose(); chestGeo.dispose(); tailGeo.dispose(); capeGeo.dispose(); glowGeo.dispose(); paperGeo.dispose(); pickGeo.dispose();
    metalMat.dispose(); armorMat.dispose(); capeMat.dispose(); glowMat.dispose(); paperMat.dispose(); pickMat.dispose();
    if (texA) texA.dispose();
    if (texB) texB.dispose();
  }

  restoreLooks();
  setArena({ x: 0, z: 0, r: 15, pillars: 4 });
  syncModel();
  return boss;
}
