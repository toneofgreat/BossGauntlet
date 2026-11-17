// src/games/cats/scripts/filmcat.js - drawCat: the realistic Biscuit painter (re-exported by filmkit.js).
//
// drawCat(g, x, y, size, opts)
//   (x, y)  ground point under the middle of the cat (where the contact shadow sits)
//   size    height at the SHOULDER when standing, in pixels (FILMS.md model sheet). A standing
//           cat's head top is ~1.4 x size; a sitting cat is ~1.75 x size tall.
//   opts    pose 'sit'|'stand'|'walk'|'run'|'sleep'|'loaf'|'look'|'pounce'
//           phase 0..1 gait cycle (walk/run) or crouch->leap progress (pounce)
//           facing 1 (right) | -1 (left)
//           headTurn -1..1 (0 = head in profile along facing, 1 = looking at the camera, <0 away)
//           headTilt -1..1 (+ = nose up), t (seconds: breathing, tail sway, ear flicks)
//           tail 0..1 sway amount, tailUp 0..1 (question-mark "happy" tail), blink 0..1
//           eyesGlow 0..1, pupil 0..1 (0 slit, 1 round; default from opts.dark), wet 0..1
//           ears -1..1 (-1 flat/scared, +1 pricked), mouth 0..1 (meow), gaze -1..1
//           light {x, y, color, strength} rim/key light in the SAME coordinate space as x, y
//           coat {...} override (see COATS / BISCUIT), collar true, bell true, shadow true,
//           ground (shadow colour), alpha
//
// Built from layered bezier shapes with gradient shading, a 3D-projected head (eyes, ears and
// muzzle move correctly as the head turns), mackerel stripes masked to each body part,
// seeded fur strokes along the contours, rim light from opts.light and a soft contact shadow.

import { TAU, clamp, lerp, smooth, mix, rgba, rng, spline, sampleSpline, tube, ellipsePath, ik, glow, crescent } from "./filmcore.js";

export const BISCUIT = Object.freeze({
  base: "#d9822b", light: "#f0b066", dark: "#9a4f17", stripe: "#7a3a10", tip: "#6e3410",
  belly: "#f3d2a2", white: "#f6efe4", nose: "#d98a80", noseEdge: "#a55a50", innerEar: "#e8a08a",
  iris: "#a8b23a", irisInner: "#d9b24a", liner: "#2a1a0c",
  pattern: "mackerel", bib: true, socks: "front", muzzle: true, stripeAlpha: 0.72, bentEar: true,
});

// A few ready coats for "other cats". Use as drawCat(..., { coat: COATS.grey }).
export const COATS = Object.freeze({
  biscuit: BISCUIT,
  grey: { base: "#8a8f96", light: "#b4b8bd", dark: "#555a62", stripe: "#3a3e46", tip: "#2e3138", belly: "#c9ccd0", bib: false, socks: false, muzzle: true, iris: "#c9b24a", irisInner: "#e3c25a", bentEar: false },
  black: { base: "#1c1a1e", light: "#3a363c", dark: "#0e0d10", stripe: "#151317", tip: "#121014", belly: "#28252a", pattern: "solid", bib: false, socks: false, muzzle: false, iris: "#d8a832", irisInner: "#f0c64a", nose: "#3a2a2c", noseEdge: "#1a1012", innerEar: "#6a4a4c", bentEar: false },
  cream: { base: "#e8d2a8", light: "#f6e8cc", dark: "#c3a77a", stripe: "#c09a68", tip: "#b08a58", belly: "#f6ecda", bib: true, socks: false, muzzle: true, stripeAlpha: 0.35, bentEar: false },
  siamese: { base: "#efe3cf", light: "#fbf4e8", dark: "#cdbb9e", stripe: "#4a3428", tip: "#3a281e", belly: "#f7efe2", pattern: "points", bib: false, socks: false, muzzle: false, iris: "#6fa6d8", irisInner: "#a8d0f0", nose: "#5a4038", noseEdge: "#3a2820", innerEar: "#7a5a50", bentEar: false },
  tuxedo: { base: "#1e1c20", light: "#3c383e", dark: "#0f0e11", stripe: "#171519", tip: "#151317", belly: "#f4f1ec", pattern: "solid", bib: true, socks: "all", muzzle: true, white: "#f4f1ec", iris: "#9fbf4a", irisInner: "#d3c94a", nose: "#d48a86", innerEar: "#6a4a4c", bentEar: false },
  calico: { base: "#f2ede4", light: "#fbf8f2", dark: "#cfc6b8", stripe: "#d98a3a", tip: "#2a2420", belly: "#f7f3ec", pattern: "calico", patch2: "#2a2420", bib: false, socks: false, muzzle: true, bentEar: false },
});

// ------------------------------------------------------------------------------------------------
// Poses. Local space: units of size/60, facing +x, ground y = 0, up is -y.
function gait(phi, stride, lift, duty) {
  phi = ((phi % 1) + 1) % 1;
  if (phi < duty) return [stride / 2 - (phi / duty) * stride, 0, 0];
  const s = (phi - duty) / (1 - duty);
  return [-stride / 2 + smooth(s) * stride, -Math.sin(Math.PI * s) * lift, Math.sin(Math.PI * s)];
}
const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

function frontLeg(root, foot, curl, side, lens = [21, 21]) {
  const wrist = [foot[0] - 1.5, foot[1] - 6.2];
  const pv = rot(2.2, 5.4, curl * 1.3);
  const paw = [wrist[0] + pv[0], wrist[1] + pv[1]];
  const a = ik(root[0], root[1], wrist[0], wrist[1], lens[0], lens[1], 1);
  const b = ik(root[0], root[1], wrist[0], wrist[1], lens[0], lens[1], -1);
  const elbow = a[0] < b[0] ? a : b;
  return { kind: "front", side, pts: [root, elbow, wrist], widths: [14, 9.2, 5.8], paw: { x: paw[0] + 1.2, y: paw[1] - 0.6, rx: 5.2, ry: 3.3, rot: curl * 1.1 }, sock: wrist[1] };
}
function hindLeg(root, foot, lift, side, lens = [21, 22]) {
  const hock = [foot[0] - 7 - 3 * lift, foot[1] - 13 + 3 * lift];
  const a = ik(root[0], root[1], hock[0], hock[1], lens[0], lens[1], 1);
  const b = ik(root[0], root[1], hock[0], hock[1], lens[0], lens[1], -1);
  const knee = a[0] > b[0] ? a : b;
  const paw = [foot[0] + 1.5 + lift * 1.5, foot[1] - 3 + lift * 0.5];
  const ax = knee[0] - root[0], ay = knee[1] - root[1];
  return {
    kind: "hind", side, pts: [root, knee, hock, [paw[0] - 2, paw[1]]], widths: [16, 10, 6.2, 5.4],
    paw: { x: paw[0], y: paw[1], rx: 5.4, ry: 3.2, rot: lift * 0.5 },
    mass: { x: root[0] + ax * 0.42 - 2, y: root[1] + ay * 0.42, rx: 19, ry: 14, rot: Math.atan2(ay, ax) },
  };
}
// Torso outline from a spine (croup Cr -> withers Wt) and (along, down) pairs.
function torsoFrom(Cr, Wt, pairs, depthK = 1) {
  const dx = Wt[0] - Cr[0], dy = Wt[1] - Cr[1];
  const L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L;
  const nx = -uy, ny = ux;
  const out = [];
  for (const [a, d] of pairs) out.push(Cr[0] + ux * a * L + nx * d * depthK, Cr[1] + uy * a * L + ny * d * depthK);
  return out;
}
const STAND_PAIRS = [
  [1.27, 2], [1.22, 14], [1.12, 26], [0.95, 32.5], [0.7, 32.5], [0.45, 30.5], [0.22, 29.5], [0.04, 25],
  [-0.1, 18], [-0.16, 8], [-0.09, -1.5], [0.12, -3], [0.45, -0.6], [0.8, -1.2], [0.98, -3.6], [1.14, -5],
];
function spinePts(Cr, Wt, arch = 0) {
  const mx = (Cr[0] + Wt[0]) / 2, my = (Cr[1] + Wt[1]) / 2;
  const dx = Wt[0] - Cr[0], dy = Wt[1] - Cr[1];
  const L = Math.hypot(dx, dy);
  return [Cr[0] - dx * 0.08, Cr[1] - dy * 0.08, mx + (dy / L) * arch, my - (dx / L) * arch, Wt[0], Wt[1]];
}

function poseStand(o, kind) {
  const p = o.phase || 0;
  const t = o.t || 0;
  let bob = 0, stride = 0, lift = 0, duty = 0.62;
  if (kind === "walk") { bob = -1.1 * Math.cos(p * TAU * 2); stride = 22; lift = 6.5; }
  const breath = Math.sin(t * 2.1) * 0.35;
  const Cr = [-36, -60 + bob * 0.6], Wt = [32, -62 + bob];
  const torso = torsoFrom(Cr, Wt, STAND_PAIRS, 1 + breath * 0.01);
  const legs = [];
  const fRoot = (dx) => [34 + dx, -46 + bob];
  const hRoot = (dx) => [-31 + dx, -50 + bob * 0.6];
  const off = { nh: 0, nf: 0.25, fh: 0.5, ff: 0.75 };
  const g = (k) => (kind === "walk" ? gait(p + off[k], stride, lift, duty) : [k[1] === "f" ? 0 : 0, 0, 0]);
  const s = { nf: g("nf"), ff: g("ff"), nh: g("nh"), fh: g("fh") };
  if (kind !== "walk") { s.ff = [4, 0, 0]; s.fh = [5, 0, 0]; s.nf = [-1, 0, 0]; s.nh = [-2, 0, 0]; }
  legs.push(hindLeg(hRoot(3), [-34 + s.fh[0] + 3, s.fh[1]], s.fh[2], "far"));
  legs.push(frontLeg(fRoot(3), [37 + s.ff[0] + 2, s.ff[1]], s.ff[2], "far"));
  legs.push(hindLeg(hRoot(0), [-34 + s.nh[0], s.nh[1]], s.nh[2], "near"));
  legs.push(frontLeg(fRoot(0), [37 + s.nf[0], s.nf[1]], s.nf[2], "near"));
  const head = { x: 51, y: -73 + bob * 0.5, R: 16.5, turn: 0.2, tilt: 0 };
  const tailBase = [-44, -57 + bob * 0.6];
  return {
    torso, spine: spinePts(Cr, Wt, 1), stripeLen: 21, legs, head, neck: { from: [41, -58 + bob], w0: 28, w1: 23 },
    tail: { base: tailBase, rest: [[-10, 8], [-6, 14], [-2, 15], [4, 10], [6, -4]], carry: [[-13, 3], [-13, 4], [-12, 2], [-10, -2], [-6, -6]], up: [[-6, -14], [-1, -18], [2, -17], [8, -9], [9, -1]], behind: true },
    shadow: { x: 0, w: 58 }, bib: { x: 46, y: -58, rx: 9, ry: 15 }, belly: [0, -30],
  };
}

function poseRun(o) {
  const p = o.phase || 0;
  const f = Math.cos(p * TAU);
  const air = Math.max(0, Math.sin(p * TAU * 2 + 1.2));
  const y0 = -3 - air * 5;
  const Cr = [-38 - 7 * f, -55 + y0 + 3 * f], Wt = [33 + 7 * f, -58 + y0];
  const arch = f < 0 ? -f * 7 : 0;
  const torso = torsoFrom(Cr, Wt, STAND_PAIRS, 0.88);
  const foot = (phi, A, B) => [A * Math.cos(phi * TAU), Math.max(-B, Math.min(0, Math.sin(phi * TAU) < 0 ? Math.sin(phi * TAU) * B : 0))];
  const fr = Wt[0] + 2, hr = Cr[0] + 5;
  const nf = foot(p + 0.08, 26, 14), ff = foot(p, 26, 14);
  const nh = foot(p + 0.53, 24, 12), fh = foot(p + 0.45, 24, 12);
  const legs = [
    hindLeg([hr + 3, Cr[1] + 10], [hr + fh[0], fh[1]], -fh[1] / 12, "far"),
    frontLeg([fr + 3, Wt[1] + 14], [fr + 4 + ff[0], ff[1]], -ff[1] / 14, "far"),
    hindLeg([hr, Cr[1] + 10], [hr - 1 + nh[0], nh[1]], -nh[1] / 12, "near"),
    frontLeg([fr, Wt[1] + 14], [fr + 2 + nf[0], nf[1]], -nf[1] / 14, "near"),
  ];
  const head = { x: Wt[0] + 26, y: Wt[1] - 6 + f * 1.5, R: 16.5, turn: 0, tilt: 0.1 };
  return {
    torso, spine: spinePts(Cr, Wt, arch), stripeLen: 19, legs, head, neck: { from: [Wt[0] + 12, Wt[1] + 2], w0: 25, w1: 21 },
    tail: { base: [Cr[0] - 8, Cr[1] + 2], rest: [[-16, 1], [-16, 3], [-16, 2], [-14, -2]], up: [[-16, -4], [-15, -6], [-14, -4], [-10, -2]], behind: true, wave: 1 },
    shadow: { x: 0, w: 70, lift: air }, bib: { x: Wt[0] + 14, y: Wt[1] + 4, rx: 9, ry: 13 }, belly: [0, -30],
  };
}

function posePounce(o) {
  const p = clamp(o.phase || 0);
  const t = o.t || 0;
  if (p < 0.5) {
    const w = Math.sin(t * 9) * 1.2 * smooth(p * 4);
    const Cr = [-34 + w, -42], Wt = [30, -34];
    const torso = torsoFrom(Cr, Wt, STAND_PAIRS, 0.95);
    const legs = [
      hindLeg([-28 + w, -34], [-16 + w, 0], 0, "far", [18, 18]),
      frontLeg([33, -22], [46, 0], 0, "far", [14, 14]),
      hindLeg([-30 + w, -34], [-19 + w, 0], 0, "near", [18, 18]),
      frontLeg([31, -22], [42, 0], 0, "near", [14, 14]),
    ];
    return {
      torso, spine: spinePts(Cr, Wt, 2), stripeLen: 20, legs, head: { x: 54, y: -38, R: 16.5, turn: 0.15, tilt: 0.05 },
      neck: { from: [40, -32], w0: 26, w1: 22 },
      tail: { base: [-42 + w, -42], rest: [[-14, 4], [-14, 6], [-14, 4], [-10, 1]], up: [[-14, 2], [-14, 2], [-12, 2], [-8, 0]], behind: true },
      shadow: { x: 4, w: 62 }, bib: { x: 42, y: -32, rx: 8, ry: 12 }, belly: [0, -18],
    };
  }
  const q = (p - 0.5) * 2;
  const up = Math.sin(Math.PI * q) * 42;
  const fx = q * 50;
  const tilt = (0.5 - q) * 0.55;
  const c = Math.cos(-tilt), s = Math.sin(-tilt);
  const R2 = (x, y) => [fx + x * c - y * s, -up + y * c + x * s];
  const Cr = R2(-40, -40), Wt = R2(36, -44);
  const torso = torsoFrom(Cr, Wt, STAND_PAIRS, 0.85);
  const legs = [
    hindLeg(R2(-35, -30), R2(-62, -12), 0.2, "far", [21, 22]),
    frontLeg(R2(37, -28), R2(70, -24), 0.2, "far"),
    hindLeg(R2(-37, -30), R2(-66, -10), 0.2, "near", [21, 22]),
    frontLeg(R2(35, -28), R2(66, -20), 0.2, "near"),
  ];
  const hp = R2(62, -54);
  return {
    torso, spine: spinePts(Cr, Wt, 0), stripeLen: 19, legs, head: { x: hp[0], y: hp[1], R: 16.5, turn: 0, tilt: tilt * 0.6 },
    neck: { from: R2(46, -42), w0: 25, w1: 21 },
    tail: { base: R2(-48, -40), rest: [[-16, 3], [-16, 2], [-16, 0], [-14, -3]], up: [[-16, 3], [-16, 2], [-16, 0], [-14, -3]], behind: true, wave: 0.6 },
    shadow: { x: fx, w: 70, lift: up / 42 }, bib: { x: Wt[0] + 12, y: Wt[1] + 6, rx: 8, ry: 12 }, belly: [fx, -up - 30],
  };
}

function poseSit(o, look) {
  const t = o.t || 0;
  const breath = Math.sin(t * 2.1) * 0.5;
  const torso = [
    22, -73, 27, -60, 27.5, -46, 22, -32, 18, -16, 13, -2.6, -6, -0.8, -21, -2.4, -30, -11, -32, -27,
    -25, -46, -12, -61 - breath * 0.4, 2, -74,
  ];
  const legs = [
    frontLeg([22, -40], [27, 0], 0, "far", [16, 19]),
    frontLeg([16, -40], [21, 0], 0, "near", [16, 19]),
  ];
  legs[0].widths = [10, 7.6, 5.6];
  legs[1].widths = [10.5, 8, 5.8];
  // the near haunch + its foot lying flat in front of it
  const hind = { kind: "hind", side: "near", pts: [[-13, -6], [0, -4], [8, -3.2]], widths: [9, 7, 5.6], paw: { x: 10, y: -3, rx: 5.4, ry: 3.1, rot: 0 }, mass: { x: -9, y: -18, rx: 20, ry: 16, rot: -0.55 } };
  legs.push(hind);
  const head = { x: 16, y: -89, R: 16.5, turn: 0.55, tilt: look ? 0.32 : 0 };
  return {
    torso, spine: [-32, -6, -31, -28, -22, -50, -5, -68], stripeLen: 21, legs, head, neck: { from: [10, -70], w0: 26, w1: 23 },
    tail: { base: [-29, -6], rest: [[8, 3], [16, 0.5], [17, 0], [13, -2]], up: [[8, 3], [16, 0.5], [17, 0], [11, -6]], behind: false, ground: true },
    shadow: { x: -4, w: 42 }, bib: { x: 22, y: -62, rx: 8, ry: 17 }, belly: [22, -40], sit: true,
  };
}

function poseLoaf(o) {
  const t = o.t || 0;
  const breath = Math.sin(t * 2.1) * 0.5;
  const torso = [
    38, -38, 44, -24, 42, -6, 30, -1, -20, -1, -38, -6, -44, -20, -38, -34 - breath * 0.3, -18, -41 - breath * 0.5, 8, -42, 26, -42,
  ];
  const legs = [
    { kind: "front", side: "near", pts: [[30, -10], [38, -5]], widths: [8, 6], paw: { x: 41, y: -3.2, rx: 5, ry: 3, rot: 0 }, sock: -12 },
  ];
  return {
    torso, spine: [-42, -14, -30, -36, 0, -42, 26, -42], stripeLen: 24, legs, head: { x: 40, y: -46, R: 16.5, turn: 0.45, tilt: -0.05 },
    neck: { from: [32, -40], w0: 24, w1: 22 },
    tail: { base: [-40, -6], rest: [[10, 3], [18, 1], [18, 0], [14, -1]], up: [[10, 3], [18, 1], [18, 0], [14, -3]], behind: false, ground: true },
    shadow: { x: 0, w: 52 }, bib: { x: 40, y: -30, rx: 8, ry: 10 }, belly: [0, -10],
  };
}

function poseSleep(o) {
  const t = o.t || 0;
  const b = Math.sin(t * 1.6) * 0.8;
  const torso = [
    30, -26, 34, -10, 26, -1, -10, 0, -32, -4, -40, -16, -34, -30 - b * 0.5, -14, -38 - b, 8, -37 - b, 24, -32,
  ];
  return {
    torso, spine: [-40, -10, -32, -30, -8, -38, 18, -34], stripeLen: 20, legs: [
      { kind: "front", side: "near", pts: [[16, -8], [30, -5]], widths: [8, 6], paw: { x: 33, y: -4, rx: 5, ry: 3, rot: 0.2 }, sock: -12 },
    ],
    head: { x: 30, y: -20, R: 14.5, turn: 0.75, tilt: -0.35, sleep: true },
    neck: null,
    tail: { base: [-36, -6], rest: [[12, 6], [22, 2], [22, 0], [16, -3]], up: [[12, 6], [22, 2], [22, 0], [16, -3]], behind: false, ground: true },
    shadow: { x: -2, w: 50 }, bib: { x: 28, y: -14, rx: 8, ry: 9 }, belly: [0, -6],
  };
}

function poseFor(o) {
  switch (o.pose) {
    case "walk": return poseStand(o, "walk");
    case "run": return poseRun(o);
    case "pounce": return posePounce(o);
    case "sit": return poseSit(o, false);
    case "look": return poseSit(o, true);
    case "loaf": return poseLoaf(o);
    case "sleep": return poseSleep(o);
    default: return poseStand(o, "stand");
  }
}

// ------------------------------------------------------------------------------------------------
// Painting helpers (all in local units; the context is scaled so 1 unit = size/60 px).
const FUR_SEED = 1337;

function tailPts(P, o) {
  const T = P.tail;
  const t = o.t || 0;
  const sway = (o.tail == null ? 0.5 : o.tail);
  const up = clamp(o.tailUp == null ? (o.pose === "walk" ? 0.5 : 0) : o.tailUp);
  const carry = T.carry || T.rest;
  const pts = [T.base[0], T.base[1]];
  let x = T.base[0], y = T.base[1];
  let ang = 0;
  for (let i = 0; i < T.rest.length; i++) {
    const r = up < 0.5 ? T.rest[i] : carry[i], u = up < 0.5 ? carry[i] : T.up[i];
    const k = up < 0.5 ? up * 2 : (up - 0.5) * 2;
    let dx = lerp(r[0], u[0], k), dy = lerp(r[1], u[1], k);
    // opts.tailPose [[dx, dy] x 4] + tailPoseK 0..1: blend toward an explicit tail shape (a point, a sweep)
    if (o.tailPose && o.tailPose[i] && o.tailPoseK > 0) { const q = clamp(o.tailPoseK); dx = lerp(dx, o.tailPose[i][0], q); dy = lerp(dy, o.tailPose[i][1], q); }
    const wob = T.ground ? (i >= 2 ? 1 : 0.15) : 1;
    ang += (Math.sin(t * 1.4 - i * 0.7) * 0.12 * sway + (T.wave ? Math.sin((o.phase || 0) * TAU * 2 - i) * 0.12 * T.wave : 0)) * wob;
    [dx, dy] = rot(dx, dy, ang);
    x += dx; y += dy;
    pts.push(x, y);
  }
  return pts;
}

function coatOf(o) {
  const c = Object.assign({}, BISCUIT, o.coat || {});
  if (o.wet > 0) {
    const w = clamp(o.wet) * 0.38;
    for (const k of ["base", "light", "dark", "belly", "white", "stripe"]) c[k] = mix(c[k], "#1a0e06", k === "white" ? w * 0.6 : w);
  }
  return c;
}

function furGradient(g, P, C, far) {
  const top = P.sit ? -80 : Math.min(P.spine[1], P.spine[3], P.spine[5]) - 4;
  const gr = g.createLinearGradient(0, top, 0, 2);
  const k = far ? 0.28 : 0;
  gr.addColorStop(0, mix(mix(C.base, C.dark, 0.35), "#000", k));
  gr.addColorStop(0.35, mix(C.base, "#000", k));
  gr.addColorStop(0.75, mix(mix(C.base, C.light, 0.55), "#000", k));
  gr.addColorStop(1, mix(C.light, "#000", k + 0.1));
  return gr;
}

function bellyGrad(g, P, C) {
  const sp = P.spine;
  const mx = (sp[0] + sp[sp.length - 2]) / 2, my = (sp[1] + sp[sp.length - 1]) / 2;
  const bg = g.createLinearGradient(mx, my, P.belly[0], P.belly[1]);
  bg.addColorStop(0, rgba(mix(C.base, C.dark, 0.45), 0.55));
  bg.addColorStop(0.45, rgba(C.base, 0));
  bg.addColorStop(0.85, rgba(C.belly, 0.5));
  bg.addColorStop(1, rgba(C.belly, 0.72));
  return bg;
}
// Darker gradient for the fur fringe: edges read as soft, slightly shadowed fur.
function furEdge(g, P, C) {
  const top = P.sit ? -80 : Math.min(P.spine[1], P.spine[3], P.spine[5]) - 4;
  const gr = g.createLinearGradient(0, top, 0, 2);
  gr.addColorStop(0, mix(C.base, C.dark, 0.4));
  gr.addColorStop(0.55, mix(C.base, C.dark, 0.3));
  gr.addColorStop(1, mix(C.dark, "#000000", 0.35));
  return gr;
}

// Sculpt a filled silhouette: a soft core shadow on the side away from the light and a rim of
// light on the lit edge. Works on the whole silhouette (no internal edges); no clip needed.
function sculpt(g, path, L, box, k = 1) {
  const d = Math.max(box[2] - box[0], box[3] - box[1]);
  crescent(g, path, L.x * d * 0.18, L.y * d * 0.18, "#1f0b02", 0.26 * k, box, "source-over", 3);
  crescent(g, path, L.x * d * 0.05, L.y * d * 0.05, "#1a0a02", 0.16 * k, box, "source-over", 2);
  crescent(g, path, -L.x * d * 0.07, -L.y * d * 0.07, "#fff4dc", 0.1, box, "source-over", 2);
  if (L.rim > 0) crescent(g, path, -L.x * L.rw, -L.y * L.rw, L.color, 0.7 * L.rim, box, "lighter", 3);
}

// Fluff: a fringe of short strokes across a sampled outline, pointing outward, so no edge is a
// vector line. Call it BEFORE filling the part (the fill hides the inner half); it returns the
// strokes on the lit side so rimFluff() can light them after the part is shaded.
function fluff(g, samples, cx, cy, L, o, seed, len, every, style, lw) {
  const R = rng(seed);
  const wet = clamp(o.wet || 0);
  const all = new Path2D(), lit = new Path2D();
  const n = samples.length;
  for (let i = 0; i < n; i += every) {
    // irregular spacing: skip ~1 in 4 samples and slide the root along the edge, so the fringe
    // never reads as a comb of evenly spaced teeth
    if (R() < 0.26) continue;
    const a = samples[(i + 1) % n], b = samples[(i - 1 + n) % n];
    let tx = a[0] - b[0], ty = a[1] - b[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const slide = (R() - 0.5) * tl * 0.5;
    const x = samples[i][0] + tx * slide, y = samples[i][1] + ty * slide;
    let nx = -ty, ny = tx;
    if (nx * (x - cx) + ny * (y - cy) < 0) { nx = -nx; ny = -ny; }
    const l = len * 0.55 * (0.45 + R() * 1.1) * (1 - wet * 0.4);
    const sw = (R() - 0.5) * 1.1 - 0.45; // fur lies back toward the tail
    const dx = nx * Math.cos(sw) - ny * Math.sin(sw), dy = nx * Math.sin(sw) + ny * Math.cos(sw);
    const sx = x - nx * l * 0.6, sy = y - ny * l * 0.6;
    const ex = sx + dx * l * (1.25 + wet * 0.3), ey = sy + dy * l * (1.25 + wet * 0.3);
    all.moveTo(sx, sy);
    all.lineTo(ex, ey);
    if (nx * L.x + ny * L.y > 0.2) { lit.moveTo(sx, sy); lit.lineTo(ex, ey); }
  }
  g.save();
  g.lineCap = "round";
  g.lineWidth = lw;
  g.globalAlpha *= 0.6;
  g.strokeStyle = style;
  g.stroke(all);
  g.restore();
  return lit;
}
function rimFluff(g, lit, L, lw) {
  if (!(L.rim > 0) || !lit) return;
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  g.lineWidth = lw * 0.7;
  g.strokeStyle = rgba(L.color, 0.32 * L.rim);
  g.stroke(lit);
  g.restore();
}

// Seeded fur texture strokes inside a clipped region.
function furTexture(g, box, C, count, seed, dirFn, wet, lw = 0.7) {
  const R = rng(seed);
  const hi = new Path2D(), lo = new Path2D();
  const [x0, y0, x1, y1] = box;
  for (let i = 0; i < count; i++) {
    const x = lerp(x0, x1, R()), y = lerp(y0, y1, R());
    const a = dirFn(x, y) + (R() - 0.5) * 0.5;
    const l = 2.2 + R() * 2.8;
    const p = R() < 0.5 ? hi : lo;
    p.moveTo(x, y);
    p.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
  }
  g.lineCap = "round";
  g.lineWidth = lw;
  g.strokeStyle = rgba(C.light, 0.18 + (wet || 0) * 0.1);
  g.stroke(hi);
  g.strokeStyle = rgba(C.dark, 0.16 + (wet || 0) * 0.15);
  g.stroke(lo);
}

function boxOf(pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
  }
  return [x0, y0, x1, y1];
}

// ------------------------------------------------------------------------------------------------
// The head: a small 3D model (ellipsoids + feature points) projected for any yaw.
function drawHead(g, P, C, o, L, lod) {
  const h = P.head;
  const R = h.R;
  const turn = clamp(o.headTurn == null ? h.turn : o.headTurn, -0.6, 1);
  const yaw = turn * Math.PI * 0.5;
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const tilt = -(h.tilt || 0) - clamp(o.headTilt || 0, -1, 1) * 0.42;
  const blink = clamp(h.sleep ? 1 : (o.blink || 0));
  const ears = clamp(o.ears || 0, -1, 1);
  const mouth = clamp(o.mouth || 0);
  const t = o.t || 0;
  // project a head-space point (x fwd, y up, z toward camera at yaw 0) -> [sx, sy, depth]
  const pr = (x, y, z) => [(x * cs - z * sn) * R, -y * R, x * sn + z * cs];
  const rx3 = (ax, az) => R * Math.sqrt((ax * cs) * (ax * cs) + (az * sn) * (az * sn));
  const leftZ = o.facing === -1 ? -1 : 1; // the cat's own left side
  g.save();
  g.translate(h.x, h.y);
  g.rotate(tilt);

  const ell = (p, cx, cy, cz, ax, ay, az) => {
    const c = pr(cx, cy, cz);
    ellipsePath(p, c[0], c[1], rx3(ax, az), ay * R, 0);
    return c;
  };
  const jaw = mouth * 0.22;
  const pieces = [
    [-0.12, 0.06, 0, 0.88, 0.72, 0.9],
    [0.1, -0.3, 0.55, 0.52, 0.46, 0.45],
    [0.1, -0.3, -0.55, 0.52, 0.46, 0.45],
    [0.5, 0.18, 0, 0.5, 0.4, 0.4],
    [0.86, -0.22, 0, 0.32, 0.25, 0.36],
    [0.9, -0.28, 0.15, 0.22, 0.19, 0.2],
    [0.9, -0.28, -0.15, 0.22, 0.19, 0.2],
    [0.74, -0.49 - jaw, 0, 0.23, 0.15, 0.2],
  ];
  const headPath = new Path2D();
  for (const q of pieces) ell(headPath, ...q);

  // ears (behind the skull, base hidden by it)
  const earDefs = [];
  for (const s of [1, -1]) {
    const back = ears < 0 ? -ears : 0;
    const fwd = ears > 0 ? ears : 0;
    const flick = Math.max(0, Math.sin(t * 0.9 + s * 2.1) - 0.96) * 6;
    const Fb = [0.22, 0.66, s * 0.2];
    const Bb = [-0.26, 0.6, s * 0.78];
    const T = [-0.04 - back * 0.55 + fwd * 0.08, 1.45 - back * 0.55 + fwd * 0.05 - flick * 0.05, s * (0.62 + back * 0.4)];
    const n = [0.9 - back * 0.6, 0.12, s * 0.42];
    const D = n[0] * sn + n[2] * cs;
    earDefs.push({ s, Fb, Bb, T, D, depth: pr(-0.1, 0.9, s * 0.6)[2], bent: C.bentEar && s === leftZ });
  }
  earDefs.sort((a, b) => a.depth - b.depth);
  const furTop = mix(C.base, C.light, 0.25);
  const drawEar = (e) => {
    const Fb = pr(...e.Fb), Bb = pr(...e.Bb), T = pr(...e.T);
    // an ear seen edge-on still has thickness at the base: never let it collapse to a hairline
    {
      const wmin = 0.26 * R, dw = Fb[0] - Bb[0];
      if (Math.abs(dw) < wmin) { const m = (Fb[0] + Bb[0]) / 2, sg = dw >= 0 ? 1 : -1; Fb[0] = m + sg * wmin / 2; Bb[0] = m - sg * wmin / 2; }
    }
    const mid = [(Fb[0] + Bb[0]) / 2, (Fb[1] + Bb[1]) / 2];
    const ear = new Path2D();
    let tip = T;
    if (e.bent) {
      // the famous bent tip: the top ~22% folds forward and down
      const Pa = [lerp(Fb[0], T[0], 0.76), lerp(Fb[1], T[1], 0.76)];
      const Pb = [lerp(Bb[0], T[0], 0.78), lerp(Bb[1], T[1], 0.78)];
      ear.moveTo(Fb[0], Fb[1]);
      ear.quadraticCurveTo(lerp(Fb[0], Pa[0], 0.5) + 0.04 * R, lerp(Fb[1], Pa[1], 0.5), Pa[0], Pa[1]);
      ear.lineTo(Pb[0], Pb[1]);
      ear.quadraticCurveTo(lerp(Pb[0], Bb[0], 0.5) - 0.08 * R, lerp(Pb[1], Bb[1], 0.5), Bb[0], Bb[1]);
      ear.closePath();
      tip = [(Pa[0] + Pb[0]) / 2, (Pa[1] + Pb[1]) / 2];
      // the folded-over tip: a short filled triangle lying ON the ear (hinged at Pa-Pb, pointing
      // down toward the base, nudged forward), clipped to the ear so it never pokes out as a line
      const fold = [lerp(tip[0], mid[0], 0.34) + (Fb[0] - Bb[0]) * 0.12, lerp(tip[1], mid[1], 0.34)];
      const flap = new Path2D();
      flap.moveTo(Pa[0], Pa[1]);
      flap.quadraticCurveTo(lerp(Pa[0], fold[0], 0.5) + (Pa[0] - Pb[0]) * 0.12, lerp(Pa[1], fold[1], 0.5), fold[0], fold[1]);
      flap.quadraticCurveTo(lerp(Pb[0], fold[0], 0.5) - (Pa[0] - Pb[0]) * 0.12, lerp(Pb[1], fold[1], 0.5), Pb[0], Pb[1]);
      flap.closePath();
      e.fold = { Pa, Pb, fold, flap, ear };
    } else {
      const bulge = 0.1 * R;
      ear.moveTo(Fb[0], Fb[1]);
      ear.quadraticCurveTo(lerp(Fb[0], T[0], 0.5) + 0.06 * R, lerp(Fb[1], T[1], 0.5) - bulge * 0.3, T[0], T[1]);
      ear.quadraticCurveTo(lerp(Bb[0], T[0], 0.5) - bulge, lerp(Bb[1], T[1], 0.5), Bb[0], Bb[1]);
      ear.closePath();
    }
    const gr = g.createLinearGradient(0, tip[1], 0, mid[1]);
    gr.addColorStop(0, mix(C.base, C.dark, 0.55));
    gr.addColorStop(1, furTop);
    g.fillStyle = gr;
    g.fill(ear);
    if (e.D > 0.05) {
      const v = clamp(e.D);
      const iF = [lerp(Fb[0], Bb[0], 0.14), lerp(Fb[1], Bb[1], 0.14)];
      const iB = [lerp(Bb[0], Fb[0], 0.22 + 0.55 * (1 - v)), lerp(Bb[1], Fb[1], 0.22 + 0.55 * (1 - v))];
      const iT = [lerp(tip[0], mid[0], 0.2), lerp(tip[1], mid[1], 0.2)];
      const inner = new Path2D();
      inner.moveTo(iF[0], iF[1]);
      inner.quadraticCurveTo((iF[0] + iT[0]) / 2, (iF[1] + iT[1]) / 2, iT[0], iT[1]);
      inner.quadraticCurveTo((iB[0] + iT[0]) / 2 - 0.05 * R, (iB[1] + iT[1]) / 2 + 0.05 * R, iB[0], iB[1]);
      inner.quadraticCurveTo(mid[0], mid[1] + 0.1 * R, iF[0], iF[1]);
      const ig = g.createLinearGradient(iT[0], iT[1], mid[0], mid[1]);
      ig.addColorStop(0, mix(C.innerEar, C.dark, 0.25));
      ig.addColorStop(0.55, C.innerEar);
      ig.addColorStop(1, mix(C.innerEar, "#5a2a1a", 0.45));
      g.globalAlpha = 0.35 + 0.65 * v;
      g.fillStyle = ig;
      g.fill(inner);
      // pale ear furnishings
      if (lod > 0) {
        const R2 = rng(e.s * 7 + 3);
        const tufts = new Path2D();
        for (let i = 0; i < 9; i++) {
          const u = R2();
          const bx = lerp(iF[0], iB[0], u), by = lerp(iF[1], iB[1], u) + 0.04 * R;
          tufts.moveTo(bx, by);
          tufts.quadraticCurveTo(lerp(bx, iT[0], 0.3), lerp(by, iT[1], 0.3), lerp(bx, iT[0], 0.45 + R2() * 0.25), lerp(by, iT[1], 0.45 + R2() * 0.25));
        }
        g.lineWidth = 0.035 * R;
        g.strokeStyle = rgba(C.white || "#f6efe4", 0.7);
        g.stroke(tufts);
      }
      g.globalAlpha = 1;
    }
    if (e.fold) {
      const fg = g.createLinearGradient(tip[0], tip[1], e.fold.fold[0], e.fold.fold[1]);
      fg.addColorStop(0, mix(furTop, "#fff2dc", 0.25));
      fg.addColorStop(1, mix(C.base, C.dark, 0.55));
      g.save();
      g.clip(e.fold.ear);
      // the soft shadow the flap casts just below itself
      g.globalAlpha = 0.35;
      g.fillStyle = C.dark;
      g.translate(0, 0.035 * R);
      g.fill(e.fold.flap);
      g.translate(0, -0.035 * R);
      g.globalAlpha = 1;
      g.fillStyle = fg;
      g.fill(e.fold.flap);
      // the crease along the hinge catches a little light
      g.strokeStyle = rgba("#fff2dc", 0.35);
      g.lineWidth = 0.025 * R;
      g.beginPath();
      g.moveTo(e.fold.Pa[0], e.fold.Pa[1]);
      g.lineTo(e.fold.Pb[0], e.fold.Pb[1]);
      g.stroke();
      g.restore();
    }
    if (L.rim > 0) {
      const eb = [Math.min(Fb[0], Bb[0], T[0]) - 2, Math.min(Fb[1], Bb[1], T[1]) - 2, Math.max(Fb[0], Bb[0], T[0]) + 2, Math.max(Fb[1], Bb[1], T[1]) + 2];
      crescent(g, ear, -L.x * 0.1 * R, -L.y * 0.1 * R, L.color, 0.6 * L.rim, eb, "lighter", 2);
    }
  };
  for (const e of earDefs) drawEar(e);

  // skull: one gradient across every piece so they merge without seams
  const lc = pr(0.35, 0.45, 0.3);
  const hg = g.createRadialGradient(lc[0] + L.x * 0.3 * R, lc[1] - 0.2 * R, 0.1 * R, 0, 0.1 * R, 1.6 * R);
  hg.addColorStop(0, mix(C.base, C.light, 0.45));
  hg.addColorStop(0.55, C.base);
  hg.addColorStop(1, mix(C.base, C.dark, 0.6));
  // fur fringe around the cheeks / jaw / back of the skull (behind the fill)
  let headLit = null;
  if (lod > 0) {
    const samp = [];
    const k = lod > 1 ? 2 : 1;
    for (const s of [1, -1]) {
      const c = pr(0.14, -0.3, s * 0.55);
      const rx = rx3(0.52, 0.45), ry = 0.48 * R;
      for (let i = 0; i <= 10 * k; i++) {
        const a = Math.PI * (0.1 + (i / k) * 0.08);
        samp.push([c[0] + Math.cos(a) * rx, c[1] + Math.sin(a) * ry]);
      }
    }
    for (let i = 0; i < 18 * k; i++) {
      const a = Math.PI * (-1.0 + (i / k) * 0.055);
      samp.push([-0.12 * R * cs - Math.cos(a) * rx3(0.88, 0.9), 0.06 * R + Math.sin(a) * 0.72 * R]);
    }
    headLit = fluff(g, samp, 0, -0.1 * R, L, o, 99, 0.065 * R, 1, mix(C.base, C.dark, 0.3), o._lw);
  }
  g.fillStyle = hg;
  g.fill(headPath);

  g.save();
  g.clip(headPath);
  // points (Siamese mask)
  if (C.pattern === "points") {
    const m = pr(0.75, -0.2, 0);
    const mg = g.createRadialGradient(m[0], m[1], 0, m[0], m[1], 1.1 * R);
    mg.addColorStop(0, rgba(C.stripe, 0.95));
    mg.addColorStop(1, rgba(C.stripe, 0));
    g.fillStyle = mg;
    g.fillRect(-2 * R, -2 * R, 4 * R, 4 * R);
  }
  // forehead M and crown stripes
  if (C.pattern !== "solid" && lod > 0) {
    const stripe = new Path2D();
    const surf = (y, z) => -0.12 + 0.88 * Math.sqrt(Math.max(0, 1 - ((y - 0.06) / 0.72) ** 2 - (z / 0.9) ** 2)) + Math.max(0, 0.42 - Math.abs(y - 0.45)) * 0.6;
    const line = (pts) => {
      let started = false;
      for (const [y, z, dx] of pts) {
        const x = surf(y, z) + (dx || 0);
        const n = [x / 0.85, (y - 0.05) / 0.7, z / 0.81];
        const D = n[0] * sn + n[2] * cs;
        const p = pr(x, y, z);
        if (D < -0.05) { started = false; continue; }
        if (!started) { stripe.moveTo(p[0], p[1]); started = true; } else stripe.lineTo(p[0], p[1]);
      }
    };
    for (const z of [-0.26, -0.09, 0.09, 0.26]) line([[0.8, z * 0.7], [0.6, z * 0.9], [0.38, z * (Math.abs(z) > 0.2 ? 1.2 : 0.6)]]);
    for (const z of [-0.14, 0, 0.14]) line([[0.62, z, -0.05], [0.8, z, -0.45], [0.82, z, -0.85], [0.7, z, -1.2]]);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = rgba(C.stripe, (C.stripeAlpha || 0.7) * 0.75);
    g.lineWidth = 0.075 * R;
    g.stroke(stripe);
    // cheek "mascara" swirls
    const cheek = new Path2D();
    for (const s of [1, -1]) {
      const a = pr(0.44, 0.06, s * 0.62), b = pr(0.12, -0.06, s * 0.92), c = pr(-0.2, -0.28, s * 0.9);
      if ((0.3 * sn + s * 0.95 * cs) < 0.05) continue;
      cheek.moveTo(a[0], a[1]);
      cheek.quadraticCurveTo(b[0], b[1], c[0], c[1]);
      const d = pr(0.3, -0.24, s * 0.82), e2 = pr(0.0, -0.38, s * 0.86);
      cheek.moveTo(d[0], d[1]);
      cheek.lineTo(e2[0], e2[1]);
    }
    g.lineWidth = 0.055 * R;
    g.strokeStyle = rgba(C.stripe, (C.stripeAlpha || 0.7) * 0.42);
    g.stroke(cheek);
  }
  // muzzle, chin and spectacles: soft-edged pale fur
  const pale = C.muzzle ? C.white : mix(C.base, C.light, 0.6);
  const soft = (cx, cy, cz, r, a) => {
    const p = pr(cx, cy, cz);
    const rr = r * R;
    const gr = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], rr);
    gr.addColorStop(0, rgba(pale, a));
    gr.addColorStop(0.55, rgba(pale, a * 0.8));
    gr.addColorStop(1, rgba(pale, 0));
    g.fillStyle = gr;
    g.fillRect(p[0] - rr, p[1] - rr, rr * 2, rr * 2);
  };
  soft(0.93, -0.29, 0.16, 0.3, 0.95);
  soft(0.93, -0.29, -0.16, 0.3, 0.95);
  soft(0.76, -0.52 - jaw, 0, 0.27, 0.95);
  soft(0.45, -0.75, 0, 0.42, C.muzzle ? 0.9 : 0.5);
  for (const s of [1, -1]) soft(0.64, 0.05, s * 0.42, 0.22, 0.35);
  // fine fur texture flowing back from the nose
  if (lod > 0) {
    const nz = pr(1.15, -0.05, 0);
    const Rr = rng(404);
    const hi = new Path2D(), lo = new Path2D();
    const N = lod > 1 ? 240 : 70;
    for (let i = 0; i < N; i++) {
      const x = (Rr() * 2.6 - 1.3) * R, y = (Rr() * 2.1 - 1.15) * R;
      const a = Math.atan2(y - nz[1], x - nz[0]) + (Rr() - 0.5) * 0.5;
      const l = (0.05 + Rr() * 0.06) * R;
      const p = Rr() < 0.5 ? hi : lo;
      p.moveTo(x, y);
      p.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    }
    g.lineCap = "round";
    g.lineWidth = o._lw;
    g.strokeStyle = rgba(C.light, 0.28);
    g.stroke(hi);
    g.strokeStyle = rgba(C.dark, 0.22);
    g.stroke(lo);
  }
  // ambient occlusion under the chin / jaw line, top light
  const ao = g.createLinearGradient(0, -0.9 * R, 0, 0.9 * R);
  ao.addColorStop(0, rgba("#fff6e0", 0.1));
  ao.addColorStop(0.6, "rgba(0,0,0,0)");
  ao.addColorStop(1, rgba("#2a1205", 0.32));
  g.fillStyle = ao;
  g.fillRect(-2 * R, -1.5 * R, 4 * R, 3 * R);
  g.restore();

  // eyes: far eye first, then the bridge redrawn over it (natural occlusion), then the near eye
  const eyeOrder = [-1, 1].map((s) => ({ s, D: (0.72 * sn + s * 0.69 * cs) })).sort((a, b) => a.D - b.D);
  const drawEye = (s, D) => {
    if (D < -0.08) return;
    const vis = clamp((D + 0.08) / 0.5);
    const I = pr(0.7, 0.13, s * 0.2), O = pr(0.52, 0.23, s * 0.55);
    let ux = O[0] - I[0], uy = O[1] - I[1];
    let w = Math.hypot(ux, uy);
    const minW = 0.2 * R * vis;
    if (w < minW) {
      const dir = ux === 0 ? -1 : Math.sign(ux);
      ux = dir * minW; uy = uy * (minW / Math.max(w, 1e-3)); w = minW;
    }
    ux /= w; uy /= w;
    const cx = (I[0] + O[0]) / 2, cy = (I[1] + O[1]) / 2;
    const nx = uy, ny = -ux; // perpendicular
    const up = ny < 0 ? 1 : -1; // make (nx,ny)*up point up the screen
    const px = nx * up, py = ny * up;
    const hw = w / 2;
    const bh = 0.15 * R * (1 - blink * 0.97);
    const iC = [cx - ux * hw, cy - uy * hw + 0.02 * R], oC = [cx + ux * hw, cy + uy * hw];
    // spectacle ring
    g.lineWidth = 0.07 * R;
    g.strokeStyle = rgba(mix(pale, C.light, 0.3), 0.18);
    g.beginPath();
    g.ellipse(cx, cy, hw * 1.25, 0.24 * R, Math.atan2(uy, ux), 0, TAU);
    g.stroke();
    if (bh < 0.02 * R) {
      g.strokeStyle = C.liner;
      g.lineWidth = 0.055 * R;
      g.beginPath();
      g.moveTo(iC[0], iC[1]);
      g.quadraticCurveTo(cx - px * 0.05 * R, cy - py * 0.05 * R + 0.05 * R, oC[0], oC[1]);
      g.stroke();
      return;
    }
    const eye = new Path2D();
    eye.moveTo(iC[0], iC[1]);
    eye.bezierCurveTo(cx - ux * hw * 0.55 + px * bh * 1.25, cy - uy * hw * 0.55 + py * bh * 1.25, cx + ux * hw * 0.45 + px * bh * 1.4, cy + uy * hw * 0.45 + py * bh * 1.4, oC[0], oC[1]);
    eye.bezierCurveTo(cx + ux * hw * 0.5 - px * bh * 1.15, cy + uy * hw * 0.5 - py * bh * 1.15, cx - ux * hw * 0.5 - px * bh * 1.2, cy - uy * hw * 0.5 - py * bh * 1.2, iC[0], iC[1]);
    const gz = clamp(o.gaze || 0, -1, 1) * hw * 0.3;
    const ex = cx + ux * gz * (s === 1 ? 1 : 1), ey = cy + uy * gz;
    const ir = Math.max(hw, bh * 1.3) * 1.05;
    const ig = g.createRadialGradient(ex, ey, 0, ex, ey, ir);
    ig.addColorStop(0, C.irisInner);
    ig.addColorStop(0.38, mix(C.irisInner, C.iris, 0.5));
    ig.addColorStop(0.72, C.iris);
    ig.addColorStop(0.93, mix(C.iris, "#1d2a0c", 0.55));
    ig.addColorStop(1, C.liner);
    g.fillStyle = ig;
    g.fill(eye);
    g.save();
    g.clip(eye);
    // iris fibres
    if (lod > 1) {
      const fib = new Path2D();
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU;
        fib.moveTo(ex + Math.cos(a) * ir * 0.3, ey + Math.sin(a) * ir * 0.3);
        fib.lineTo(ex + Math.cos(a + 0.1) * ir * 0.85, ey + Math.sin(a + 0.1) * ir * 0.85);
      }
      g.lineWidth = 0.012 * R;
      g.strokeStyle = rgba("#fff6c0", 0.22);
      g.stroke(fib);
    }
    const pup = clamp(o.pupil == null ? (o.dark ? 0.85 : 0.32) : o.pupil);
    const pg = g.createRadialGradient(ex, ey, 0, ex, ey, bh * 1.2);
    const glowC = "#c8ff7a";
    const eg = clamp(o.eyesGlow || 0);
    pg.addColorStop(0, eg > 0 ? mix("#05070a", glowC, eg * 0.9) : "#05070a");
    pg.addColorStop(1, eg > 0 ? mix("#0b0d08", glowC, eg * 0.5) : "#0b0d08");
    g.fillStyle = pg;
    g.beginPath();
    g.ellipse(ex, ey, Math.max(0.02 * R, bh * lerp(0.16, 0.85, pup) * (0.4 + 0.6 * vis)), bh * 1.05, Math.atan2(uy, ux) + Math.PI / 2 - Math.PI / 2, 0, TAU);
    g.fill();
    // light through the cornea pools in the lower iris, opposite the catchlight
    const lgx = ex - px * bh * 0.55, lgy = ey - py * bh * 0.55;
    const cg = g.createRadialGradient(lgx, lgy, 0, lgx, lgy, hw * 0.9);
    cg.addColorStop(0, "rgba(255,236,150,0.42)");
    cg.addColorStop(1, "rgba(255,236,150,0)");
    g.fillStyle = cg;
    g.fill(eye);
    // upper lid shadow
    const lg = g.createLinearGradient(cx + px * bh * 1.3, cy + py * bh * 1.3, cx - px * bh * 0.2, cy - py * bh * 0.2);
    lg.addColorStop(0, "rgba(10,4,0,0.75)");
    lg.addColorStop(1, "rgba(10,4,0,0)");
    g.fillStyle = lg;
    g.fill(eye);
    // catchlights
    const hx = cx - ux * hw * 0.28 + px * bh * 0.45 + L.x * 0.03 * R, hy = cy - uy * hw * 0.28 + py * bh * 0.45;
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.beginPath();
    g.ellipse(hx, hy, 0.055 * R * (0.5 + 0.5 * vis), 0.045 * R, 0, 0, TAU);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.22)";
    g.beginPath();
    g.ellipse(cx + ux * hw * 0.25 - px * bh * 0.5, cy + uy * hw * 0.25 - py * bh * 0.5, 0.11 * R * vis, 0.05 * R, Math.atan2(uy, ux), 0, TAU);
    g.fill();
    g.restore();
    g.lineJoin = "round";
    g.strokeStyle = C.liner;
    g.lineWidth = 0.05 * R;
    g.stroke(eye);
    if (eg > 0) glow(g, ex, ey, bh * 3.2, glowC, eg * 0.8);
  };

  drawEye(eyeOrder[0].s, eyeOrder[0].D);
  if (eyeOrder[0].D > -0.08 && turn < 0.85) {
    // re-lay the bridge + muzzle over the far eye's inner corner
    const br = new Path2D();
    ell(br, 0.5, 0.18, 0, 0.5, 0.4, 0.4);
    ell(br, 0.86, -0.22, 0, 0.32, 0.25, 0.36);
    g.save();
    g.clip(br);
    g.fillStyle = hg;
    g.fill(br);
    soft(0.93, -0.29, 0.16, 0.3, 0.95);
    soft(0.93, -0.29, -0.16, 0.3, 0.95);
    g.restore();
  }
  drawEye(eyeOrder[1].s, eyeOrder[1].D);

  // nose leather + mouth
  if (turn > -0.35) {
    const a = pr(1.12, -0.04, 0.12), b = pr(1.12, -0.04, -0.12), c = pr(1.17, -0.19, 0);
    const nose = new Path2D();
    const top = pr(1.15, -0.01, 0);
    nose.moveTo(a[0], a[1]);
    nose.quadraticCurveTo(top[0], top[1] - 0.03 * R, b[0], b[1]);
    nose.quadraticCurveTo(lerp(b[0], c[0], 0.6), lerp(b[1], c[1], 0.4), c[0], c[1]);
    nose.quadraticCurveTo(lerp(a[0], c[0], 0.6), lerp(a[1], c[1], 0.4), a[0], a[1]);
    const ng = g.createLinearGradient(0, top[1], 0, c[1]);
    ng.addColorStop(0, mix(C.nose, "#fff", 0.15));
    ng.addColorStop(1, C.noseEdge);
    g.fillStyle = ng;
    g.fill(nose);
    g.strokeStyle = rgba(C.noseEdge, 0.8);
    g.lineWidth = 0.03 * R;
    g.stroke(nose);
    g.fillStyle = "rgba(255,255,255,0.45)";
    g.beginPath();
    g.ellipse(top[0] + (a[0] - top[0]) * 0.3, top[1] + 0.05 * R, 0.05 * R, 0.025 * R, 0, 0, TAU);
    g.fill();
    // philtrum + mouth line
    const m0 = pr(1.16, -0.2, 0), m1 = pr(1.13, -0.32, 0);
    const mouthP = new Path2D();
    mouthP.moveTo(m0[0], m0[1]);
    mouthP.lineTo(m1[0], m1[1]);
    for (const s of [1, -1]) {
      const e = pr(0.99, -0.38, s * 0.17), cc = pr(1.09, -0.39, s * 0.07);
      mouthP.moveTo(m1[0], m1[1]);
      mouthP.quadraticCurveTo(cc[0], cc[1], e[0], e[1]);
    }
    if (mouth > 0.02) {
      const mo = pr(1.0, -0.42 - jaw * 0.5, 0);
      g.fillStyle = "#3a1414";
      g.beginPath();
      g.ellipse(mo[0], mo[1], rx3(0.16, 0.16), (0.04 + jaw * 0.5) * R, 0, 0, TAU);
      g.fill();
      g.fillStyle = "#c85a68";
      g.beginPath();
      g.ellipse(mo[0], mo[1] + jaw * 0.25 * R, rx3(0.1, 0.1), jaw * 0.25 * R, 0, 0, TAU);
      g.fill();
    }
    g.strokeStyle = rgba(C.liner, 0.7);
    g.lineWidth = 0.035 * R;
    g.stroke(mouthP);
  }

  // whisker follicle dots
  if (lod > 1) {
    g.fillStyle = rgba(C.dark, 0.55);
    for (const s of [1, -1]) {
      for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) {
        const D = 0.5 * sn + s * 0.85 * cs;
        if (D < 0) continue;
        const p = pr(1.02 - k * 0.07, -0.23 - r * 0.06, s * (0.2 + k * 0.06));
        g.beginPath();
        g.arc(p[0], p[1], 0.018 * R, 0, TAU);
        g.fill();
      }
    }
  }

  // rim light on the head silhouette
  {
    const hb = [-1.4 * R, -1.1 * R, 1.5 * R, 1.0 * R];
    crescent(g, headPath, L.x * 0.22 * R, L.y * 0.22 * R, "#1a0a02", 0.22, hb, "source-over", 3);
    if (L.rim > 0) crescent(g, headPath, -L.x * 0.09 * R, -L.y * 0.09 * R, L.color, 0.65 * L.rim, hb, "lighter", 3);
    rimFluff(g, headLit, L, o._lw);
  }

  // whiskers + eyebrow whiskers
  if (lod > 0) {
    const wk = new Path2D();
    for (const s of [1, -1]) {
      const D = 0.5 * sn + s * 0.85 * cs;
      for (let i = 0; i < 5; i++) {
        const st = [1.02 - (i % 3) * 0.05, -0.25 - i * 0.035, s * (0.24 + (i % 2) * 0.04)];
        const len = 1.25 + (i % 3) * 0.18;
        const dir = [0.42 - i * 0.04, -0.06 - i * 0.07, s * 1];
        const en = [st[0] + dir[0] * len, st[1] + dir[1] * len, st[2] + dir[2] * len];
        const mi = [st[0] + dir[0] * len * 0.5, st[1] + dir[1] * len * 0.5 + 0.05, st[2] + dir[2] * len * 0.5];
        const a = pr(...st), b = pr(...mi), c = pr(...en);
        if (D < -0.2 && Math.abs(c[0] - a[0]) < 0.3 * R) continue;
        wk.moveTo(a[0], a[1]);
        wk.quadraticCurveTo(b[0], b[1], c[0], c[1] + 0.08 * R);
      }
      if (D > 0.3) {
        for (let i = 0; i < 2; i++) {
          const a = pr(0.62, 0.34 + i * 0.05, s * (0.36 + i * 0.08)), c = pr(0.66, 0.6 + i * 0.04, s * (0.7 + i * 0.08));
          wk.moveTo(a[0], a[1]);
          wk.quadraticCurveTo((a[0] + c[0]) / 2, Math.min(a[1], c[1]) - 0.05 * R, c[0], c[1]);
        }
      }
    }
    g.lineCap = "round";
    // small cats get finer, fainter whiskers (a 1 px stroke on a 30 px cat reads as a white broom)
    const wsz = clamp((60 / (o._px || 1)) / 80, 0.35, 1);
    g.lineWidth = Math.max(0.018 * R, o._px * (0.45 + 0.35 * wsz));
    g.strokeStyle = rgba(mix("#ffffff", L.color, L.rim * 0.3), 0.72 * (0.45 + 0.55 * wsz));
    g.stroke(wk);
  }
  g.restore();
}

// ------------------------------------------------------------------------------------------------
function drawLimb(g, leg, C, L, o, far, lod, seed) {
  const path = new Path2D();
  const pts = [];
  for (const q of leg.pts) pts.push(q[0], q[1]);
  tube(path, pts, leg.widths, 5, true, true);
  ellipsePath(path, leg.paw.x, leg.paw.y, leg.paw.rx, leg.paw.ry, leg.paw.rot);
  if (leg.mass) ellipsePath(path, leg.mass.x, leg.mass.y, leg.mass.rx, leg.mass.ry, leg.mass.rot);
  const box = boxOf(pts.concat([leg.paw.x - 6, leg.paw.y + 4]).concat(leg.mass ? [leg.mass.x - leg.mass.rx, leg.mass.y - leg.mass.rx, leg.mass.x + leg.mass.rx, leg.mass.y + leg.mass.rx] : []));
  g.fillStyle = furGradient(g, o._P, C, far);
  g.fill(path);
  g.save();
  g.clip(path);
  if (leg.kind === "front" && !far) { g.fillStyle = bellyGrad(g, o._P, C); g.fill(path); }
  if (C.pattern !== "solid" && C.pattern !== "points") {
    // leg bands + thigh arcs
    const st = new Path2D();
    const S = sampleSpline(pts, false, 6);
    for (let k = 1; k < 4; k++) {
      const i = Math.floor((S.length - 1) * (0.25 + k * 0.17));
      const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      const w = 7;
      st.moveTo(S[i][0] - dy * w, S[i][1] + dx * w);
      st.quadraticCurveTo(S[i][0] + dx * 2, S[i][1] + dy * 2, S[i][0] + dy * w, S[i][1] - dx * w);
    }
    if (leg.mass) {
      // mackerel bars across the thigh, slanting down and back like the flank stripes
      const m = leg.mass;
      const ca = Math.cos(m.rot), sa = Math.sin(m.rot);
      for (let k = -1; k <= 1; k++) {
        const ox = m.x + ca * k * m.rx * 0.42, oy = m.y + sa * k * m.rx * 0.42;
        st.moveTo(ox - sa * m.ry * 0.8, oy + ca * m.ry * 0.8 * -1);
        st.quadraticCurveTo(ox - ca * 3, oy - sa * 3, ox + sa * m.ry * 0.7, oy - ca * m.ry * 0.7 * -1);
      }
    }
    g.lineCap = "round";
    g.strokeStyle = rgba(C.stripe, (C.stripeAlpha || 0.7) * 0.45);
    g.lineWidth = 2.4;
    g.stroke(st);
  }
  if (C.pattern === "points") {
    const pg = g.createLinearGradient(0, box[1], 0, box[3]);
    pg.addColorStop(0, rgba(C.stripe, 0));
    pg.addColorStop(0.6, rgba(C.stripe, 0.85));
    pg.addColorStop(1, rgba(C.stripe, 0.95));
    g.fillStyle = pg;
    g.fill(path);
  }
  const sock = C.socks === "all" || (C.socks === "front" && leg.kind === "front");
  if (sock) {
    const sy = (leg.sock != null ? leg.sock : leg.paw.y - 6) - 2;
    const sg = g.createLinearGradient(0, sy - 3, 0, sy + 2);
    sg.addColorStop(0, rgba(C.white, 0));
    sg.addColorStop(1, rgba(far ? mix(C.white, "#7a7068", 0.35) : C.white, 1));
    g.fillStyle = sg;
    g.fillRect(box[0] - 8, sy - 3, box[2] - box[0] + 16, 30);
  }
  if (lod > 0) furTexture(g, box, C, far ? 30 : (lod > 1 ? 160 : 50), seed, () => Math.PI / 2 + 0.25, o.wet, o._lw);
  // toe clefts
  if (lod > 1) {
    const p = leg.paw;
    g.strokeStyle = rgba("#3a2416", 0.4);
    g.lineWidth = 0.5;
    g.beginPath();
    for (const dx of [-0.2, 0.25]) {
      g.moveTo(p.x + p.rx * (0.45 + dx), p.y - p.ry * 0.1);
      g.lineTo(p.x + p.rx * (0.6 + dx), p.y + p.ry * 0.85);
    }
    g.stroke();
  }
  g.restore();
  if (!far) crescent(g, path, L.x * 4, L.y * 4, "#1f0b02", 0.16, box, "source-over", 2);
  if (far) {
    sculpt(g, path, L, box, 1.2);
    g.fillStyle = "rgba(40,16,6,0.22)";
    g.fill(path);
  }
  return { path, box };
}

function drawTail(g, P, C, L, o, lod) {
  const pts = tailPts(P, o);
  const path = new Path2D();
  const res = tube(path, pts, [7.2, 6.6, 6, 5.4, 4.6], 5, false, true);
  const box0 = boxOf(pts);
  let tailLit = null;
  if (lod > 0) {
    const samp = res.L.concat(res.R.slice().reverse()).map((q) => [q[0], q[1]]);
    tailLit = fluff(g, samp, (box0[0] + box0[2]) / 2, (box0[1] + box0[3]) / 2, L, o, 55, 1.6, 1, furEdge(g, P, C), o._lw);
  }
  g.fillStyle = furGradient(g, P, C, false);
  g.fill(path);
  g.save();
  g.clip(path);
  if (C.pattern !== "solid") {
    const S = res.S;
    const rings = new Path2D();
    const n = S.length;
    for (let i = 3; i < n - 1; i += 4) {
      const a = S[i - 1], b = S[i + 1];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      rings.moveTo(S[i][0] - dy * 6, S[i][1] + dx * 6);
      rings.quadraticCurveTo(S[i][0] - dx * 2, S[i][1] - dy * 2, S[i][0] + dy * 6, S[i][1] - dx * 6);
    }
    g.lineWidth = 3.2;
    g.strokeStyle = rgba(C.pattern === "points" ? C.stripe : C.stripe, (C.stripeAlpha || 0.7) * (C.pattern === "points" ? 1.2 : 0.85));
    g.stroke(rings);
    const tipP = S[n - 1];
    const tg = g.createRadialGradient(tipP[0], tipP[1], 0, tipP[0], tipP[1], 9);
    tg.addColorStop(0, rgba(C.tip, 0.95));
    tg.addColorStop(1, rgba(C.tip, 0));
    g.fillStyle = tg;
    g.fillRect(tipP[0] - 10, tipP[1] - 10, 20, 20);
  }
  if (C.pattern === "points") { g.fillStyle = rgba(C.stripe, 0.75); g.fill(path); }
  const box = boxOf(pts);
  if (lod > 0) furTexture(g, [box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 4], C, lod > 1 ? 90 : 30, 77, () => Math.atan2(pts[pts.length - 1] - pts[1], pts[pts.length - 2] - pts[0]), o.wet, o._lw);
  g.restore();
  sculpt(g, path, L, [box[0] - 5, box[1] - 5, box[2] + 5, box[3] + 5], 0.9);
  rimFluff(g, tailLit, L, o._lw);
  // opts.tailGlow {color, core, alpha, trail: [[tailPoseK, alpha], ...]}: a glowing tip + its trail
  const TG = o.tailGlow;
  if (TG && TG.alpha > 0) {
    for (const [k, a] of TG.trail || []) {
      const q = tailPts(P, Object.assign({}, o, { tailPoseK: k }));
      glow(g, q[q.length - 2], q[q.length - 1], 7, TG.color || "#ff5a1e", TG.alpha * a);
    }
    glow(g, pts[pts.length - 2], pts[pts.length - 1], 12, TG.color || "#ff5a1e", TG.alpha * 0.8);
    glow(g, pts[pts.length - 2], pts[pts.length - 1], 4, TG.core || "#ffe07a", TG.alpha);
  }
}

function drawCollar(g, P, C, o, L) {
  if (!P.neck && !P.head) return;
  const h = P.head;
  const turn = clamp(o.headTurn == null ? h.turn : o.headTurn, -0.6, 1);
  const from = P.neck ? P.neck.from : [h.x - 8, h.y + 10];
  const cx = lerp(from[0], h.x, 0.62), cy = lerp(from[1], h.y, 0.62) + 2.5;
  let ax = h.x - from[0], ay = h.y - from[1];
  const al = Math.hypot(ax, ay) || 1;
  ax /= al; ay /= al;
  const px = -ay, py = ax;
  const hw = (P.neck ? P.neck.w1 : 22) * 0.52;
  const e1 = [cx + px * hw, cy + py * hw], e2 = [cx - px * hw, cy - py * hw];
  const front = e1[0] > e2[0] ? e1 : e2, back = e1[0] > e2[0] ? e2 : e1;
  const sag = 2 + turn * 5;
  const mid = [(front[0] + back[0]) / 2 + ax * 1.5, (front[1] + back[1]) / 2 + sag];
  const band = new Path2D();
  band.moveTo(back[0], back[1]);
  band.quadraticCurveTo(mid[0], mid[1] + sag * 0.6, front[0], front[1]);
  g.save();
  g.lineCap = "round";
  g.lineWidth = 2.9;
  g.strokeStyle = o.wet ? "#7d1a20" : "#b3262e";
  g.stroke(band);
  g.lineWidth = 1.2;
  g.translate(0, 1.2);
  g.strokeStyle = "rgba(60,8,12,0.7)";
  g.stroke(band);
  g.translate(0, -2.2);
  g.strokeStyle = "rgba(255,170,160,0.35)";
  g.lineWidth = 0.7;
  g.stroke(band);
  g.restore();
  // a few bib tufts over the collar so it sits IN the fur
  const R = rng(5);
  g.strokeStyle = rgba(C.bib ? C.white : C.light, 0.7);
  g.lineWidth = o._lw;
  g.beginPath();
  for (let i = 0; i < 7; i++) {
    const u = 0.2 + R() * 0.7;
    const x = lerp(back[0], front[0], u), y = lerp(back[1], front[1], u) + sag * (1 - Math.abs(u - 0.5) * 2) * 0.9;
    g.moveTo(x, y + 1.8);
    g.lineTo(x + (R() - 0.5) * 1.2, y - 0.8);
  }
  g.stroke();
  if (o.bell !== false) {
    const bp = [lerp(mid[0], front[0], clamp(1 - turn) * 0.7), lerp(mid[1] + sag * 0.3, front[1], clamp(1 - turn) * 0.7) + 3.4];
    const r = 2.6;
    const bg = g.createRadialGradient(bp[0] - r * 0.4, bp[1] - r * 0.4, 0.2, bp[0], bp[1], r * 1.1);
    bg.addColorStop(0, "#fff2c0");
    bg.addColorStop(0.35, "#e3b452");
    bg.addColorStop(0.8, "#a7742a");
    bg.addColorStop(1, "#5a3a10");
    g.fillStyle = bg;
    g.beginPath();
    g.arc(bp[0], bp[1], r, 0, TAU);
    g.fill();
    g.strokeStyle = "rgba(50,30,5,0.85)";
    g.lineWidth = 0.45;
    g.beginPath();
    g.moveTo(bp[0] - r * 0.7, bp[1] + r * 0.2);
    g.lineTo(bp[0] + r * 0.7, bp[1] + r * 0.2);
    g.moveTo(bp[0], bp[1] + r * 0.2);
    g.lineTo(bp[0], bp[1] + r * 0.9);
    g.stroke();
    if (L.rim > 0 || o.glint) glow(g, bp[0] - r * 0.4, bp[1] - r * 0.4, r * 2.2, "#fff2c0", 0.5 + (o.glint || 0));
  }
}

// ------------------------------------------------------------------------------------------------
export function drawCat(g, x, y, size, opts = {}) {
  if (!(size > 0)) return;
  const o = Object.assign({ pose: "stand", facing: 1, collar: true, bell: true, shadow: true }, opts);
  o.facing = o.facing === -1 ? -1 : 1;
  const S = size / 60;
  const C = coatOf(o);
  const P = poseFor(o);
  o._P = P;
  o._px = 1 / S;
  o._lw = clamp(1.15 / S, 0.28, 0.85);
  // opts.lod forces a detail level (0 = no fur strokes; cheap for tiny/background cats)
  const lod = o.lod != null ? clamp(Math.round(o.lod), 0, 2) : size < 34 ? 0 : size < 90 ? 1 : 2;
  // light direction in local (flipped) space
  let L = { x: -0.45, y: -0.9, color: "#fff1d6", rim: 0, rw: 3 };
  if (o.light) {
    const cxw = x, cyw = y - size * 0.8;
    let lx = (o.light.x - cxw) * o.facing, ly = o.light.y - cyw;
    const l = Math.hypot(lx, ly) || 1;
    L = { x: lx / l, y: ly / l, color: o.light.color || "#fff1d6", rim: clamp(o.light.strength == null ? 1 : o.light.strength, 0, 2), rw: clamp(3 / S, 0.9, 2.6) };
  }
  g.save();
  if (o.alpha != null) g.globalAlpha *= clamp(o.alpha);
  g.translate(x, y);
  g.scale(o.facing * S, S);

  // contact shadow
  if (o.shadow) {
    const sh = P.shadow;
    const lift = clamp(sh.lift || 0);
    const w = sh.w * (1 - lift * 0.35);
    const sg = g.createRadialGradient(0, 0, 0, 0, 0, w);
    const col = o.ground || "#000000";
    sg.addColorStop(0, rgba(col, 0.42 * (1 - lift * 0.6)));
    sg.addColorStop(0.5, rgba(col, 0.2 * (1 - lift * 0.6)));
    sg.addColorStop(1, rgba(col, 0));
    g.save();
    g.translate(sh.x, -0.5);
    g.scale(1, 0.13);
    g.fillStyle = sg;
    g.beginPath();
    g.arc(0, 0, w, 0, TAU);
    g.fill();
    g.restore();
    if (!lift) {
      g.fillStyle = rgba(col, 0.35);
      for (const leg of P.legs) {
        if (leg.paw.y < -6) continue;
        g.beginPath();
        g.ellipse(leg.paw.x, 0, leg.paw.rx * 1.2, 1.3, 0, 0, TAU);
        g.fill();
      }
    }
  }

  if (P.tail.behind) drawTail(g, P, C, L, o, lod);
  for (const leg of P.legs) if (leg.side === "far") drawLimb(g, leg, C, L, o, true, lod, 11);

  // torso + neck
  const body = new Path2D();
  spline(body, P.torso, true);
  if (P.neck) {
    const nk = new Path2D();
    tube(nk, [P.neck.from[0], P.neck.from[1], P.head.x - 2, P.head.y + 3], [P.neck.w0, P.neck.w1], 4, true, true);
    body.addPath(nk);
  }
  const bb = boxOf(P.torso);
  let bodyLit = null;
  if (lod > 0) {
    const samp = sampleSpline(P.torso, true, lod > 1 ? 12 : 6);
    bodyLit = fluff(g, samp, (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2 + 4, L, o, 31, 1.7, 1, furEdge(g, P, C), o._lw);
  }
  g.fillStyle = furGradient(g, P, C, false);
  g.fill(body);
  g.save();
  g.clip(body);
  // belly / underside paler, along the spine normal
  g.fillStyle = bellyGrad(g, P, C);
  g.fill(body);
  if (C.pattern === "calico") {
    const R = rng(21);
    for (let i = 0; i < 5; i++) {
      const px = lerp(bb[0], bb[2], R()), py = lerp(bb[1], bb[3] - 10, R());
      g.fillStyle = i % 2 ? C.patch2 : C.stripe;
      g.beginPath();
      g.ellipse(px, py, 8 + R() * 10, 6 + R() * 7, R() * 3, 0, TAU);
      g.fill();
    }
  } else if (C.pattern !== "solid" && C.pattern !== "points") {
    // mackerel stripes from the spine toward the belly + a dorsal line
    const sp = P.spine;
    const SS = sampleSpline(sp, false, 8);
    const st = new Path2D();
    const R = rng(FUR_SEED);
    const n = SS.length;
    for (let i = 1; i < n - 1; i += 2) {
      const a = SS[i - 1], b = SS[i + 1];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      const nx = -dy, ny = dx;
      const len = P.stripeLen * (0.75 + R() * 0.35);
      const w0 = 2.6 + R() * 1.4;
      const wob = (R() - 0.5) * 6;
      const sx = SS[i][0] - nx * 2, sy = SS[i][1] - ny * 2;
      tube(st, [sx, sy, sx + nx * len * 0.5 - dx * (3 + wob * 0.3), sy + ny * len * 0.5 - dy * (3 + wob * 0.3), sx + nx * len - dx * (1 + wob), sy + ny * len - dy * (1 + wob)], [w0, w0 * 0.8, 0.4], 4, true, true);
    }
    g.fillStyle = rgba(C.stripe, (C.stripeAlpha || 0.7) * 0.8);
    g.fill(st);
    g.lineWidth = 5.5;
    g.lineCap = "round";
    g.strokeStyle = rgba(C.stripe, (C.stripeAlpha || 0.7) * 0.4);
    const d = new Path2D();
    spline(d, sp, false);
    g.stroke(d);
  }
  if (C.pattern === "points") {
    const pg = g.createRadialGradient(P.head.x, P.head.y, 5, P.head.x, P.head.y, 40);
    pg.addColorStop(0, rgba(C.stripe, 0.5));
    pg.addColorStop(1, rgba(C.stripe, 0));
    g.fillStyle = pg;
    g.fill(body);
  }
  if (C.bib && P.bib) {
    const b = P.bib;
    const wg = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, Math.max(b.rx, b.ry));
    // soft-edged: the white bib melts into the coat instead of reading as a pasted-on patch
    const bw = mix(C.white, C.light, 0.12);
    wg.addColorStop(0, rgba(bw, 0.95));
    wg.addColorStop(0.35, rgba(bw, 0.78));
    wg.addColorStop(0.7, rgba(bw, 0.32));
    wg.addColorStop(1, rgba(bw, 0));
    g.save();
    g.translate(b.x, b.y);
    g.scale(b.rx / Math.max(b.rx, b.ry), b.ry / Math.max(b.rx, b.ry));
    g.translate(-b.x, -b.y);
    g.fillStyle = wg;
    g.beginPath();
    g.arc(b.x, b.y, Math.max(b.rx, b.ry), 0, TAU);
    g.fill();
    g.restore();
  }
  if (lod > 0) {
    const sp = P.spine;
    const vx = sp[0] - sp[sp.length - 2], vy = sp[1] - sp[sp.length - 1];
    const ang = Math.atan2(vy, vx);
    const sgn = -1; // rotate from the tail direction toward the belly normal
    furTexture(g, bb, C, lod > 1 ? 650 : 140, FUR_SEED + 1, (px, py) => {
      const dy = (py - bb[1]) / Math.max(1, bb[3] - bb[1]);
      return ang + sgn * (0.25 + 0.8 * dy);
    }, o.wet, o._lw);
  }
  if (o.wet > 0) {
    // wet sheen: specular streaks along the top of the coat
    const R = rng(8);
    g.strokeStyle = rgba("#dfe9ff", 0.22 * clamp(o.wet));
    g.lineWidth = 0.8;
    g.beginPath();
    const SS = sampleSpline(P.spine, false, 6);
    for (let i = 0; i < SS.length; i += 2) {
      const [sx, sy] = SS[i];
      g.moveTo(sx + (R() - 0.5) * 6, sy + 1 + R() * 4);
      g.lineTo(sx + (R() - 0.5) * 6 - 3, sy + 4 + R() * 6);
    }
    g.stroke();
  }
  g.restore();

  const union = new Path2D(body);
  let ub = bb.slice();
  if (P.neck) ub = [Math.min(ub[0], P.head.x - 20), Math.min(ub[1], P.head.y - 10), Math.max(ub[2], P.head.x + 5), ub[3]];
  for (const leg of P.legs) {
    if (leg.side !== "near") continue;
    const r = drawLimb(g, leg, C, L, o, false, lod, 23);
    union.addPath(r.path);
    ub = [Math.min(ub[0], r.box[0]), Math.min(ub[1], r.box[1]), Math.max(ub[2], r.box[2]), Math.max(ub[3], r.box[3])];
  }
  sculpt(g, union, L, [ub[0] - 8, ub[1] - 8, ub[2] + 8, ub[3] + 8], 1);
  rimFluff(g, bodyLit, L, o._lw);
  if (!P.tail.behind) drawTail(g, P, C, L, o, lod);
  if (o.collar !== false && P.neck) drawCollar(g, P, C, o, L);
  drawHead(g, P, C, o, L, lod);
  if (o.wet > 0.3) {
    // drips falling from the chin and belly (deterministic in t)
    const t = o.t || 0;
    g.fillStyle = rgba("#cfe0ff", 0.6 * clamp(o.wet));
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.9 + i * 0.37) % 1;
      const dx = [-10, 10, 30][i], dy = P.belly[1] + 4 + ph * 22;
      if (ph > 0.85) continue;
      g.beginPath();
      g.ellipse(dx, dy, 0.6, 1.2, 0, 0, TAU);
      g.fill();
    }
  }
  g.restore();
}
