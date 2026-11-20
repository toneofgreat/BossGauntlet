// src/games/cats/scripts/filmcat.js - drawCat v2: the photoreal Biscuit painter (re-exported by filmkit.js).
//
// drawCat(g, x, y, size, opts)
//   (x, y)  ground point under the middle of the cat (where the contact shadow sits)
//   size    height at the SHOULDER when standing, in pixels (FILMS.md model sheet). A standing
//           cat's head top is ~1.4 x size; a sitting cat is ~1.75 x size tall.
//   opts    pose 'sit'|'stand'|'walk'|'run'|'sleep'|'loaf'|'look'|'pounce'
//           phase 0..1 gait cycle (walk/run) or crouch->leap progress (pounce)
//           facing 1 (right) | -1 (left)
//           headTurn -1..1 (0 = head in profile along facing, 1 = looking at the camera, <0 away)
//           headTilt -1..1 (+ = nose up), t (seconds: breathing, tail sway, ear flicks, blinks)
//           tail 0..1 sway amount, tailUp 0..1 (question-mark "happy" tail), blink 0..1
//           eyesGlow 0..1, pupil 0..1 (0 slit, 1 round; default from opts.dark), wet 0..1
//           ears -1..1 (-1 flat/scared, +1 pricked), mouth 0..1 (meow), gaze -1..1
//           light {x, y, color, strength} rim/key light in the SAME coordinate space as x, y
//           coat {...} override (see COATS / BISCUIT), collar true, bell true, shadow true,
//           ground (shadow colour), alpha, lod 0..2 (forced detail), tailPose/tailPoseK, tailGlow, glint
//   v2 lighting options (all optional; without them opts.light is both key and rim, as in v1):
//           key {x, y, color, strength}  the key light (form shading + catchlights); default opts.light
//           rim {x, y, color, strength}  the edge/back light; default opts.light
//           fill  colour of the shadow side (sky / bounce), e.g. "#1c2a48" at night
//           ambient colour laid over the whole cat, ambientK 0..1 (default 0.22) - e.g. moonlight
//           backlit 0..1 translucent ear glow + warm subsurface edge (default from rim strength)
//           castShadow 0..1 soft cast shadow away from the light (default 0.5 when light + shadow)
//           autoBlink true (natural blinks from t when blink is not given), breath 1 (breathing amount)
//           flat true: skip the layered photographic passes (cheap path, as for tiny cats)
//
// How it works (v2). Every cat bigger than ~40 device px is painted into a private offscreen layer:
//   1. anatomy: a skull built as a 3D model projected for any yaw (the silhouette is the smoothed
//      radial union of the skull, cheek, muzzle, whisker-pad and chin volumes), torso/limb/tail
//      volumes from the pose, soft tabby markings drawn on each part so they follow its form;
//   2. fur as a material: a cached tileable guard-hair texture (clumps, crevices, sheen) laid over
//      every part with the 'overlay' blend and rotated along that part's fur flow (radial on the face),
//      stray hairs on the silhouette, contact AO where a part sits on another;
//   3. light, from the finished silhouette at 1/4 and 1/10 resolution (cheap, GPU friendly blurs):
//      a soft terminator away from the key light, a broad key highlight, ambient occlusion that
//      darkens thin parts and edges, a thin rim + warm subsurface glow that spills past the edge,
//      an ambient tint, then a blurred copy behind the cat as the soft fur fringe;
//   4. the wet/specular bits that must stay crisp (eyes with iris texture, cornea and catchlight,
//      nose leather, tapered whiskers, brass bell) on top; then the layer is composited once.
// Tiny cats (crowds) take the old direct path. Static textures live in filmcattex.js.

import { TAU, clamp, lerp, smooth, mix, rgba, rng, spline, sampleSpline, tube, ellipsePath, ik, glow, crescent, makeCanvas, parseColor, hash, isCpuMode, ctx2d, softAdd } from "./filmcore.js";
import { furTile, radialFur, irisSprite } from "./filmcattex.js";

export const BISCUIT = Object.freeze({
  base: "#d07e38", light: "#efb87e", dark: "#8c4718", stripe: "#90400f", tip: "#7a3510",
  belly: "#f3ddbd", white: "#f5efe5", nose: "#d98a7c", noseEdge: "#9c5246", innerEar: "#d99a8a",
  iris: "#a9ac38", irisInner: "#dcc35a", liner: "#22150b",
  pattern: "mackerel", bib: true, socks: "front", muzzle: true, stripeAlpha: 0.72, bentEar: true,
  sheen: 1,
});

// Ready coats for "other cats". Use as drawCat(..., { coat: COATS.grey }).
export const COATS = Object.freeze({
  biscuit: BISCUIT,
  grey: { base: "#8b8f95", light: "#c3c5c8", dark: "#50545b", stripe: "#33363c", tip: "#2a2c31", belly: "#d3d3d2", white: "#ecebe7", bib: true, socks: false, muzzle: true, iris: "#c6ae46", irisInner: "#e6c862", nose: "#8e6e6c", noseEdge: "#5a4442", innerEar: "#c7a3a0", stripeAlpha: 0.6, bentEar: false },
  black: { base: "#1d1a1d", light: "#4b4146", dark: "#0b0a0c", stripe: "#141114", tip: "#110f12", belly: "#252125", white: "#2a2629", pattern: "solid", bib: false, socks: false, muzzle: false, iris: "#cf9628", irisInner: "#f2c64e", nose: "#2c2326", noseEdge: "#120c0e", innerEar: "#5c464a", bentEar: false, sheen: 1.6 },
  cream: { base: "#e6cfa4", light: "#f6e8cc", dark: "#bf9f72", stripe: "#c09a68", tip: "#b08a58", belly: "#f6ecda", bib: true, socks: false, muzzle: true, stripeAlpha: 0.35, bentEar: false },
  siamese: { base: "#ebdfcb", light: "#faf3e6", dark: "#c9b79b", stripe: "#4a3428", tip: "#3a281e", belly: "#f6eee0", pattern: "points", bib: false, socks: false, muzzle: false, iris: "#5f9ad6", irisInner: "#a9d2f4", nose: "#4e3830", noseEdge: "#2e2018", innerEar: "#6e5048", bentEar: false },
  tuxedo: { base: "#1e1c20", light: "#46404a", dark: "#0f0e11", stripe: "#171519", tip: "#151317", belly: "#f4f1ec", pattern: "solid", bib: true, socks: "all", muzzle: true, white: "#f4f1ec", iris: "#9fbf4a", irisInner: "#d3c94a", nose: "#d48a86", innerEar: "#6a4a4c", bentEar: false, sheen: 1.4 },
  calico: { base: "#f1ece3", light: "#fbf8f2", dark: "#cbc2b4", stripe: "#d4843c", tip: "#2a2420", belly: "#f7f3ec", pattern: "calico", patch2: "#262022", bib: false, socks: false, muzzle: true, bentEar: false, nose: "#e0a09a" },
  white: { base: "#ece8e1", light: "#fbf9f5", dark: "#b9b0a5", stripe: "#d6cfc4", tip: "#d6cfc4", belly: "#f6f3ee", white: "#fbf9f5", pattern: "solid", bib: false, socks: false, muzzle: true, iris: "#86b4dc", irisInner: "#cfe6f4", nose: "#eba4a2", noseEdge: "#c07070", innerEar: "#efb4b0", stripeAlpha: 0, bentEar: false },
  ghost: { base: "#9cbade", light: "#d4e4f6", dark: "#5a78a8", stripe: "#9fc0ea", tip: "#bcd6ff", belly: "#cfe0f2", white: "#e2ecf8", nose: "#c8d8f8", noseEdge: "#90a8d8", innerEar: "#dfe8ff", iris: "#e8f6ff", irisInner: "#ffffff", liner: "#5a7ab0", pattern: "solid", bib: false, socks: false, muzzle: true, stripeAlpha: 0.2, bentEar: false, ghost: true },
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
  return { kind: "front", side, pts: [root, elbow, wrist], widths: [15, 9.4, 6], paw: { x: paw[0] + 1.2, y: paw[1] - 0.6, rx: 5.0, ry: 3.2, rot: curl * 1.1 }, sock: wrist[1], lift: curl };
}
function hindLeg(root, foot, lift, side, lens = [21, 22]) {
  const hock = [foot[0] - 7 - 3 * lift, foot[1] - 13 + 3 * lift];
  const a = ik(root[0], root[1], hock[0], hock[1], lens[0], lens[1], 1);
  const b = ik(root[0], root[1], hock[0], hock[1], lens[0], lens[1], -1);
  const knee = a[0] > b[0] ? a : b;
  const paw = [foot[0] + 1.5 + lift * 1.5, foot[1] - 3 + lift * 0.5];
  const ax = knee[0] - root[0], ay = knee[1] - root[1];
  return {
    kind: "hind", side, pts: [root, knee, hock, [paw[0] - 2, paw[1]]], widths: [16, 10, 6, 5.4],
    paw: { x: paw[0], y: paw[1], rx: 5.2, ry: 3.1, rot: lift * 0.5 }, lift,
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
// a real cat's back line: withers bump, a slight dip behind them, the lumbar rise, the croup falling to the tail
const STAND_PAIRS = [
  // underside: deep chest behind the elbows, a real tuck-up at the loin (the waist), then the thigh
  [1.27, 2], [1.22, 14], [1.12, 26], [0.95, 32.5], [0.74, 31], [0.52, 27.5], [0.32, 25], [0.14, 25.5], [0.02, 23],
  [-0.1, 18], [-0.16, 8], [-0.1, -1.8], [0.12, -3.4], [0.42, -1.2], [0.7, -0.4], [0.9, -2.6], [1.08, -5.2],
];
function spinePts(Cr, Wt, arch = 0) {
  const mx = (Cr[0] + Wt[0]) / 2, my = (Cr[1] + Wt[1]) / 2;
  const dx = Wt[0] - Cr[0], dy = Wt[1] - Cr[1];
  const L = Math.hypot(dx, dy);
  return [Cr[0] - dx * 0.08, Cr[1] - dy * 0.08, mx + (dy / L) * arch, my - (dx / L) * arch, Wt[0], Wt[1]];
}
// surface volumes (anatomy cues): k > 0 a rounded mass catching light, k < 0 a crease / hollow
function volsStand(Cr, Wt) {
  return [
    { x: Wt[0] - 7, y: Wt[1] + 11, r: 13, k: 1 }, // shoulder blade
    { x: Wt[0] - 1, y: Wt[1] + 30, r: 8, k: -1 }, // elbow pit
    { x: lerp(Cr[0], Wt[0], 0.5), y: lerp(Cr[1], Wt[1], 0.5) + 15, r: 17, k: 0.6 }, // ribcage
    { x: Cr[0] + 17, y: Cr[1] + 27, r: 9, k: -1 }, // flank fold in front of the stifle
    { x: Cr[0] + 4, y: Cr[1] + 9, r: 14, k: 1 }, // hip
  ];
}

function poseStand(o, kind) {
  const p = o.phase || 0;
  const t = o.t || 0;
  let bob = 0, stride = 0, lift = 0, duty = 0.62, roll = 0;
  if (kind === "walk") { bob = -1.1 * Math.cos(p * TAU * 2); stride = 22; lift = 6.5; roll = Math.sin(p * TAU) * 1.2; }
  const breath = Math.sin(t * 2.1) * 0.35 * (o.breath == null ? 1 : o.breath);
  // walking: the shoulders and hips rise and fall out of phase (weight shift), the spine flexes
  const Cr = [-36, -60 + bob * 0.6 - roll * 0.5], Wt = [32, -62 + bob + roll * 0.5];
  const torso = torsoFrom(Cr, Wt, STAND_PAIRS, 1 + breath * 0.02);
  const legs = [];
  const fRoot = (dx) => [34 + dx, -46 + bob];
  const hRoot = (dx) => [-31 + dx, -50 + bob * 0.6];
  const off = { nh: 0, nf: 0.25, fh: 0.5, ff: 0.75 };
  const g = (k) => (kind === "walk" ? gait(p + off[k], stride, lift, duty) : [0, 0, 0]);
  const s = { nf: g("nf"), ff: g("ff"), nh: g("nh"), fh: g("fh") };
  if (kind !== "walk") { s.ff = [4, 0, 0]; s.fh = [5, 0, 0]; s.nf = [-1, 0, 0]; s.nh = [-2, 0, 0]; }
  legs.push(hindLeg(hRoot(3), [-34 + s.fh[0] + 3, s.fh[1]], s.fh[2], "far"));
  legs.push(frontLeg(fRoot(3), [37 + s.ff[0] + 2, s.ff[1]], s.ff[2], "far"));
  legs.push(hindLeg(hRoot(0), [-34 + s.nh[0], s.nh[1]], s.nh[2], "near"));
  legs.push(frontLeg(fRoot(0), [37 + s.nf[0], s.nf[1]], s.nf[2], "near"));
  // head bob lags the shoulders a little (secondary motion)
  const hb = kind === "walk" ? -1.1 * Math.cos(p * TAU * 2 - 0.6) : 0;
  const head = { x: 51, y: -73 + hb * 0.6, R: 16.5, turn: 0.2, tilt: 0 };
  const tailBase = [-44, -57 + bob * 0.6];
  return {
    torso, spine: spinePts(Cr, Wt, 1), stripeLen: 21, legs, head, neck: { from: [41, -58 + bob], w0: 28, w1: 22 },
    tail: { base: tailBase, rest: [[-10, 8], [-6, 14], [-2, 15], [4, 10], [6, -4]], carry: [[-13, 3], [-13, 4], [-12, 2], [-10, -2], [-6, -6]], up: [[-6, -14], [-1, -18], [2, -17], [8, -9], [9, -1]], behind: true, wave: kind === "walk" ? 0.5 : 0 },
    shadow: { x: 0, w: 58 }, bib: { x: 46, y: -58, rx: 9, ry: 15 }, belly: [0, -30], vols: volsStand(Cr, Wt),
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
    shadow: { x: 0, w: 70, lift: air }, bib: { x: Wt[0] + 14, y: Wt[1] + 4, rx: 9, ry: 13 }, belly: [0, -30], vols: volsStand(Cr, Wt),
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
      shadow: { x: 4, w: 62 }, bib: { x: 42, y: -32, rx: 8, ry: 12 }, belly: [0, -18], vols: volsStand(Cr, Wt),
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
    shadow: { x: fx, w: 70, lift: up / 42 }, bib: { x: Wt[0] + 12, y: Wt[1] + 6, rx: 8, ry: 12 }, belly: [fx, -up - 30], vols: volsStand(Cr, Wt),
  };
}

function poseSit(o, look) {
  const t = o.t || 0;
  const breath = Math.sin(t * 2.1) * 0.5 * (o.breath == null ? 1 : o.breath);
  const torso = [
    22, -73, 27, -60 + breath * 0.2, 28 + breath * 0.3, -46, 22.5, -32, 18, -16, 13, -2.6, -6, -0.8, -21, -2.4, -30, -11, -32, -27,
    -25, -46, -12, -61 - breath * 0.4, 2, -74,
  ];
  const legs = [
    frontLeg([22, -40], [27, 0], 0, "far", [16, 19]),
    frontLeg([16, -40], [21, 0], 0, "near", [16, 19]),
  ];
  legs[0].widths = [10, 7.2, 5.4];
  legs[1].widths = [10.5, 7.6, 5.6];
  // the near haunch + its foot lying flat in front of it
  const hind = { kind: "hind", side: "near", pts: [[-13, -6], [0, -4], [8, -3.2]], widths: [9, 7, 5.6], paw: { x: 10, y: -3, rx: 5.2, ry: 3.0, rot: 0 }, mass: { x: -9, y: -18, rx: 20, ry: 16, rot: -0.55 } };
  legs.push(hind);
  const head = { x: 16, y: -89, R: 16.5, turn: 0.55, tilt: look ? 0.32 : 0 };
  return {
    torso, spine: [-32, -6, -31, -28, -22, -50, -5, -68], stripeLen: 21, legs, head, neck: { from: [10, -70], w0: 26, w1: 22 },
    tail: { base: [-29, -6], rest: [[8, 3], [16, 0.5], [17, 0], [13, -2]], up: [[8, 3], [16, 0.5], [17, 0], [11, -6]], behind: false, ground: true },
    shadow: { x: -4, w: 42 }, bib: { x: 22, y: -62, rx: 8, ry: 17 }, belly: [22, -40], sit: true,
    vols: [{ x: 14, y: -56, r: 12, k: 1 }, { x: -16, y: -26, r: 17, k: 0.8 }, { x: 6, y: -22, r: 8, k: -1 }, { x: -20, y: -50, r: 11, k: 0.5 }],
  };
}

function poseLoaf(o) {
  const t = o.t || 0;
  const breath = Math.sin(t * 2.1) * 0.5 * (o.breath == null ? 1 : o.breath);
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
    vols: [{ x: -6, y: -32, r: 20, k: 0.8 }, { x: 26, y: -30, r: 12, k: 0.7 }, { x: -30, y: -20, r: 13, k: 0.6 }],
  };
}

function poseSleep(o) {
  const t = o.t || 0;
  // sleeping breath: slower and deeper, the whole flank rising
  const b = Math.sin(t * 1.6) * 0.9 * (o.breath == null ? 1 : o.breath);
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
    vols: [{ x: -8, y: -28, r: 18, k: 0.9 }, { x: -28, y: -16, r: 12, k: 0.6 }],
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
// Helpers
const FUR_SEED = 1337;
const lum = (c) => { const p = parseColor(c); return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255; };

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
    // a travelling wave: each segment lags the one before it, so the tail makes S-curves
    ang += (Math.sin(t * 1.4 - i * 0.7) * 0.12 * sway + Math.sin(t * 0.53 - i * 0.9 + 1.3) * 0.05 * sway +
      (T.wave ? Math.sin((o.phase || 0) * TAU * 2 - i * 0.9) * 0.12 * T.wave : 0)) * wob;
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

function boxOf(pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
  }
  return [x0, y0, x1, y1];
}

function furGradient(g, P, C, far) {
  const top = P.sit ? -80 : Math.min(P.spine[1], P.spine[3], P.spine[5]) - 4;
  const gr = g.createLinearGradient(0, top, 0, 2);
  const k = far ? 0.3 : 0;
  gr.addColorStop(0, mix(mix(C.base, C.dark, 0.3), "#000", k));
  gr.addColorStop(0.35, mix(C.base, "#000", k));
  gr.addColorStop(0.72, mix(mix(C.base, C.light, 0.4), "#000", k));
  gr.addColorStop(1, mix(mix(C.light, C.belly, 0.4), "#000", k + 0.12));
  return gr;
}
function bellyGrad(g, P, C) {
  const sp = P.spine;
  const mx = (sp[0] + sp[sp.length - 2]) / 2, my = (sp[1] + sp[sp.length - 1]) / 2;
  const bg = g.createLinearGradient(mx, my, P.belly[0], P.belly[1]);
  bg.addColorStop(0, rgba(mix(C.base, C.dark, 0.45), 0.55));
  bg.addColorStop(0.45, rgba(C.base, 0));
  bg.addColorStop(0.85, rgba(C.belly, 0.45));
  bg.addColorStop(1, rgba(C.belly, 0.7));
  return bg;
}
function furEdge(g, P, C) {
  const top = P.sit ? -80 : Math.min(P.spine[1], P.spine[3], P.spine[5]) - 4;
  const gr = g.createLinearGradient(0, top, 0, 2);
  gr.addColorStop(0, mix(C.base, C.dark, 0.3));
  gr.addColorStop(0.55, mix(C.base, C.dark, 0.2));
  gr.addColorStop(1, mix(C.dark, "#000000", 0.3));
  return gr;
}

// Soft-edged fill: a wide faint pass, a mid pass and the core, so markings melt into the fur.
function softFill(g, path, color, alpha, feather) {
  g.save();
  g.lineJoin = "round";
  g.strokeStyle = rgba(color, alpha * 0.22);
  g.lineWidth = feather * 2;
  g.stroke(path);
  g.strokeStyle = rgba(color, alpha * 0.3);
  g.lineWidth = feather;
  g.stroke(path);
  g.fillStyle = rgba(color, alpha * 0.85);
  g.fill(path);
  g.restore();
}
// Each part's own roundness: darken just inside its outline (clipped), soft.
function innerEdge(F, path, w, alpha, color) {
  if (!F.layered) return;
  const g = F.g;
  g.save();
  g.clip(path);
  g.lineJoin = "round";
  g.strokeStyle = rgba(color || F.aoCol, alpha * 0.5);
  g.lineWidth = w * 2;
  g.stroke(path);
  g.strokeStyle = rgba(color || F.aoCol, alpha * 0.6);
  g.lineWidth = w;
  g.stroke(path);
  g.restore();
}
// Contact AO: darken what is already painted (only inside the layer) around a part about to go on top.
function aoHalo(F, path, w, alpha) {
  if (!F.layered || alpha <= 0) return;
  const g = F.g;
  g.save();
  g.globalCompositeOperation = "source-atop";
  g.lineJoin = "round";
  g.strokeStyle = rgba(F.aoCol, alpha * 0.45);
  g.lineWidth = w * 2.2;
  g.stroke(path);
  g.strokeStyle = rgba(F.aoCol, alpha * 0.6);
  g.lineWidth = w;
  g.stroke(path);
  g.restore();
}
// Fur texture over a part, rotated along its fur flow (overlay blend: strand contrast only).
function furOverlay(F, path, angle, alpha, ox = 0, oy = 0) {
  if (!F.layered || F.furA <= 0 || alpha <= 0) return;
  const g = F.g;
  const pat = F.furPat;
  if (!pat || !pat.setTransform) return;
  const m = new DOMMatrix().translateSelf(ox, oy).rotateSelf((angle * 180) / Math.PI).scaleSelf(F.furK, F.furK);
  pat.setTransform(m);
  g.save();
  g.globalCompositeOperation = "overlay";
  g.globalAlpha *= clamp(alpha * F.furA);
  g.fillStyle = pat;
  g.fill(path);
  g.restore();
}
// Soft anatomical volumes (shoulder blade, hip, ribcage, creases) inside a clipped part.
function volumes(F, vols) {
  if (!vols) return;
  const g = F.g;
  const C = F.C;
  const Lx = F.K.x, Ly = F.K.y;
  for (const v of vols) {
    if (v.k > 0) {
      const hx = v.x + Lx * v.r * 0.35, hy = v.y + Ly * v.r * 0.35;
      const gr = g.createRadialGradient(hx, hy, 0, v.x, v.y, v.r);
      gr.addColorStop(0, rgba(F.hiCol, 0.2 * v.k * F.hiK));
      gr.addColorStop(1, rgba(F.hiCol, 0));
      g.fillStyle = gr;
      g.fillRect(v.x - v.r, v.y - v.r, v.r * 2, v.r * 2);
      const sx = v.x - Lx * v.r * 0.55, sy = v.y - Ly * v.r * 0.55;
      const sg = g.createRadialGradient(sx, sy, v.r * 0.3, sx, sy, v.r * 1.05);
      sg.addColorStop(0, rgba(mix(C.dark, "#000", 0.3), 0.12 * v.k));
      sg.addColorStop(1, rgba(C.dark, 0));
      g.fillStyle = sg;
      g.fillRect(sx - v.r * 1.1, sy - v.r * 1.1, v.r * 2.2, v.r * 2.2);
    } else {
      const gr = g.createRadialGradient(v.x, v.y, 0, v.x, v.y, v.r);
      gr.addColorStop(0, rgba(mix(C.dark, "#000", 0.35), 0.3 * -v.k));
      gr.addColorStop(1, rgba(C.dark, 0));
      g.fillStyle = gr;
      g.fillRect(v.x - v.r, v.y - v.r, v.r * 2, v.r * 2);
    }
  }
}

// Fluff: a fringe of fine hairs across a sampled outline, pointing outward, so no edge is a
// vector line. Call it BEFORE filling the part (the fill hides the inner half); it returns the
// strokes on the lit side so rimFluff() can light them after the part is shaded.
function fluff(F, samples, cx, cy, seed, len, every, style, lw) {
  const g = F.g, o = F.o, L = F.L;
  const R = rng(seed);
  const wet = clamp(o.wet || 0);
  const all = new Path2D(), lit = new Path2D();
  const n = samples.length;
  for (let i = 0; i < n; i += every) {
    if (R() < 0.26) continue;
    const a = samples[(i + 1) % n], b = samples[(i - 1 + n) % n];
    let tx = a[0] - b[0], ty = a[1] - b[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const slide = (R() - 0.5) * tl * 0.5;
    const x = samples[i][0] + tx * slide, y = samples[i][1] + ty * slide;
    let nx = -ty, ny = tx;
    if (nx * (x - cx) + ny * (y - cy) < 0) { nx = -nx; ny = -ny; }
    // mostly short, a few long strays
    const l = len * 0.55 * (0.4 + R() * 1.0 + (R() < 0.08 ? 1.2 : 0)) * (1 - wet * 0.4);
    const sw = (R() - 0.5) * 1.1 - 0.45 - wet * 0.3; // fur lies back toward the tail
    const dx = nx * Math.cos(sw) - ny * Math.sin(sw), dy = nx * Math.sin(sw) + ny * Math.cos(sw);
    const sx = x - nx * l * 0.6, sy = y - ny * l * 0.6;
    const ex = sx + dx * l * (1.25 + wet * 0.3), ey = sy + dy * l * (1.25 + wet * 0.3);
    const bend = (R() - 0.5) * l * 0.3;
    all.moveTo(sx, sy);
    all.quadraticCurveTo((sx + ex) / 2 - dy * bend, (sy + ey) / 2 + dx * bend, ex, ey);
    if (nx * L.x + ny * L.y > 0.2) { lit.moveTo(sx, sy); lit.lineTo(ex, ey); }
  }
  g.save();
  g.lineCap = "round";
  g.lineWidth = lw;
  g.globalAlpha *= F.layered ? 0.75 : 0.6;
  g.strokeStyle = style;
  g.stroke(all);
  g.restore();
  return lit;
}
function rimFluff(F, lit, lw) {
  const g = F.g, L = F.L;
  if (!(L.rim > 0) || !lit || F.layered) return;
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  g.lineWidth = lw * 0.7;
  g.strokeStyle = rgba(L.color, 0.32 * L.rim);
  g.stroke(lit);
  g.restore();
}
// crescent smoothing steps: soft multi-step edges only where they can be seen (direct path >= 64 px)
const csteps = (F, n) => (F.lod > 0 && F.px >= 64 ? n : 1);
// Legacy per-part sculpt (the direct path only; the layered path lights the whole silhouette).
function sculpt(F, path, box, k = 1) {
  if (F.layered) return;
  const g = F.g, L = F.L;
  const d = Math.max(box[2] - box[0], box[3] - box[1]);
  crescent(g, path, L.x * d * 0.18, L.y * d * 0.18, "#1f0b02", 0.26 * k, box, "source-over", csteps(F, 3));
  if (F.lod > 0 && F.px >= 64) crescent(g, path, -L.x * d * 0.07, -L.y * d * 0.07, "#fff4dc", 0.1, box, "source-over", 2);
  if (L.rim > 0) crescent(g, path, -L.x * L.rw, -L.y * L.rw, L.color, 0.7 * L.rim, box, "lighter", csteps(F, 3));
}

// Seeded fur strokes inside a clipped region (direct path only: the layered path uses the texture).
function furStrokes(F, box, count, seed, dirFn) {
  if (F.layered || F.lod < 1) return;
  const g = F.g, C = F.C, wet = F.o.wet || 0;
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
  g.lineWidth = F.lw;
  g.strokeStyle = rgba(C.light, 0.18 + wet * 0.1);
  g.stroke(hi);
  g.strokeStyle = rgba(C.dark, 0.16 + wet * 0.15);
  g.stroke(lo);
}

// wet fur: clumped spikes with specular glints along the top line of a part
function wetSpikes(F, samples, cx, cy, seed) {
  const o = F.o;
  if (!(o.wet > 0.15) || F.lod < 1) return;
  const g = F.g, C = F.C;
  const R = rng(seed);
  const wv = clamp(o.wet);
  const dark = new Path2D(), spec = new Path2D();
  for (let i = 0; i < samples.length; i += 2) {
    if (R() < 0.55) continue;
    const a = samples[(i + 1) % samples.length], b = samples[(i - 1 + samples.length) % samples.length];
    let tx = a[0] - b[0], ty = a[1] - b[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    let nx = -ty, ny = tx;
    const [x, y] = samples[i];
    if (nx * (x - cx) + ny * (y - cy) < 0) { nx = -nx; ny = -ny; }
    const l = (0.9 + R() * 1.6) * wv;
    const ex = x + nx * l - tx * l * 0.9, ey = y + ny * l - ty * l * 0.9;
    // a clumped wet spike: a thin triangle
    dark.moveTo(x - tx * 0.7, y - ty * 0.7);
    dark.lineTo(ex, ey);
    dark.lineTo(x + tx * 0.7, y + ty * 0.7);
    dark.closePath();
    if (ny < 0.2) { spec.moveTo(x - nx * 0.6, y - ny * 0.6); spec.lineTo(lerp(x, ex, 0.6), lerp(y, ey, 0.6)); }
  }
  g.fillStyle = mix(C.base, C.dark, 0.35);
  g.fill(dark);
  g.save();
  g.lineCap = "round";
  g.lineWidth = Math.max(F.u1 * 0.8, 0.3);
  g.strokeStyle = rgba("#eef4ff", 0.55 * wv);
  g.stroke(spec);
  g.restore();
}

// ------------------------------------------------------------------------------------------------
// The head: a small 3D model (ellipsoids + feature points) projected for any yaw.
function headModel(P, o, C) {
  const h = P.head;
  const R = h.R;
  const turn = clamp(o.headTurn == null ? h.turn : o.headTurn, -0.6, 1);
  const yaw = turn * Math.PI * 0.5;
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const tilt = -(h.tilt || 0) - clamp(o.headTilt || 0, -1, 1) * 0.42;
  let blink = clamp(h.sleep ? 1 : (o.blink || 0));
  // natural blinks: a quick lid close every few seconds, deterministic in t
  if (!h.sleep && o.blink == null && o.autoBlink !== false && o.t != null) {
    const per = 4.6, cyc = Math.floor(o.t / per);
    const ph = o.t - cyc * per - (0.4 + hash(cyc, 7) * 3.4);
    if (ph > 0 && ph < 0.2) blink = Math.max(blink, Math.sin((ph / 0.2) * Math.PI));
  }
  const ears = clamp(o.ears || 0, -1, 1);
  const mouth = clamp(o.mouth || 0);
  const pr = (x, y, z) => [(x * cs - z * sn) * R, -y * R, x * sn + z * cs];
  const rx3 = (ax, az) => R * Math.sqrt((ax * cs) * (ax * cs) + (az * sn) * (az * sn));
  const jaw = mouth * 0.22;
  const pieces = [
    [-0.15, 0.1, 0, 0.83, 0.7, 0.9], // cranium
    [0.03, -0.3, 0.57, 0.5, 0.44, 0.44], // cheeks (zygomatic fullness)
    [0.03, -0.3, -0.57, 0.5, 0.44, 0.44],
    [0.55, 0.09, 0, 0.43, 0.31, 0.38], // brow / bridge
    [0.88, -0.22, 0, 0.32, 0.25, 0.35], // muzzle
    [0.9, -0.29, 0.15, 0.22, 0.19, 0.2], // whisker pads
    [0.9, -0.29, -0.15, 0.22, 0.19, 0.2],
    [0.74, -0.48 - jaw, 0, 0.22, 0.14, 0.19], // chin
  ];
  return { h, R, turn, cs, sn, tilt, blink, ears, mouth, jaw, pr, rx3, pieces, t: o.t || 0, leftZ: o.facing === -1 ? -1 : 1 };
}
// The head silhouette: the smoothed radial union of every projected volume. No seams, no lumps.
function headOutline(H) {
  const { pr, rx3, R } = H;
  const E = H.pieces.map((q) => { const c = pr(q[0], q[1], q[2]); return [c[0], c[1], rx3(q[3], q[5]), q[4] * R]; });
  const o0 = pr(0.2, -0.04, 0);
  const N = 60;
  const r = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const th = (k / N) * TAU, dx = Math.cos(th), dy = Math.sin(th);
    let best = 0;
    for (const [cx, cy, rx, ry] of E) {
      const ux = o0[0] - cx, uy = o0[1] - cy;
      const ia = 1 / (rx * rx), ib = 1 / (ry * ry);
      const a = dx * dx * ia + dy * dy * ib, b = 2 * (ux * dx * ia + uy * dy * ib), c = ux * ux * ia + uy * uy * ib - 1;
      const D = b * b - 4 * a * c;
      if (D < 0) continue;
      const tf = (-b + Math.sqrt(D)) / (2 * a);
      if (tf > best) best = tf;
    }
    r[k] = best || 0.5 * R;
  }
  // close small creases (where two volumes meet), then a light smooth
  for (let it = 0; it < 2; it++) {
    const c = r.slice();
    for (let k = 0; k < N; k++) r[k] = Math.max(c[k], (c[(k + N - 1) % N] + c[(k + 1) % N]) * 0.5);
  }
  const s = r.slice();
  for (let k = 0; k < N; k++) r[k] = (s[(k + N - 1) % N] + 2 * s[k] + s[(k + 1) % N]) / 4;
  const pts = [];
  for (let k = 0; k < N; k++) {
    const th = (k / N) * TAU;
    pts.push(o0[0] + Math.cos(th) * r[k], o0[1] + Math.sin(th) * r[k]);
  }
  const path = new Path2D();
  spline(path, pts, true);
  return { path, pts, o0 };
}

function earDefs(H, C) {
  const { pr, sn, cs, ears, t } = H;
  const defs = [];
  for (const s of [1, -1]) {
    const back = ears < 0 ? -ears : 0;
    const fwd = ears > 0 ? ears : 0;
    // ear flicks: brief, sharp twitches (different timing per ear)
    const fl = Math.sin(t * 0.9 + s * 2.1) - 0.965;
    const flick = Math.max(0, fl) * 7 + Math.max(0, Math.sin(t * 0.37 + s * 1.3) - 0.985) * 9;
    const Fb = [0.24, 0.66, s * 0.2];
    const Bb = [-0.3, 0.58, s * 0.8];
    const T = [-0.06 - back * 0.55 + fwd * 0.08 - flick * 0.03, 1.4 - back * 0.55 + fwd * 0.05 - flick * 0.05, s * (0.66 + back * 0.4 + flick * 0.04)];
    const n = [0.9 - back * 0.6, 0.12, s * 0.42];
    const D = n[0] * sn + n[2] * cs;
    defs.push({ s, Fb, Bb, T, D, depth: pr(-0.1, 0.9, s * 0.6)[2], bent: C.bentEar && s === H.leftZ });
  }
  defs.sort((a, b) => a.depth - b.depth);
  return defs;
}

function drawEar(F, H, e) {
  const g = F.g, C = F.C, L = F.L, lod = F.lod;
  const { pr, R } = H;
  const Fb = pr(...e.Fb), Bb = pr(...e.Bb), T = pr(...e.T);
  {
    const wmin = 0.28 * R, dw = Fb[0] - Bb[0];
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
    ear.quadraticCurveTo((Pa[0] + Pb[0]) / 2, Math.min(Pa[1], Pb[1]) - 0.03 * R, Pb[0], Pb[1]);
    ear.quadraticCurveTo(lerp(Pb[0], Bb[0], 0.5) - 0.09 * R, lerp(Pb[1], Bb[1], 0.5), Bb[0], Bb[1]);
    ear.closePath();
    tip = [(Pa[0] + Pb[0]) / 2, (Pa[1] + Pb[1]) / 2];
    const fold = [lerp(tip[0], mid[0], 0.22) + (Fb[0] - Bb[0]) * 0.08, lerp(tip[1], mid[1], 0.22)];
    const flap = new Path2D();
    flap.moveTo(Pa[0], Pa[1]);
    flap.quadraticCurveTo(lerp(Pa[0], fold[0], 0.5) + (Pa[0] - Pb[0]) * 0.12, lerp(Pa[1], fold[1], 0.5), fold[0], fold[1]);
    flap.quadraticCurveTo(lerp(Pb[0], fold[0], 0.5) - (Pa[0] - Pb[0]) * 0.12, lerp(Pb[1], fold[1], 0.5), Pb[0], Pb[1]);
    flap.closePath();
    e.fold = { Pa, Pb, fold, flap, ear };
  } else {
    // a rounded-tip pinna: convex leading edge, slightly concave trailing edge
    const bulge = 0.1 * R;
    const nT = [lerp(T[0], mid[0], 0.07), lerp(T[1], mid[1], 0.07)];
    ear.moveTo(Fb[0], Fb[1]);
    ear.quadraticCurveTo(lerp(Fb[0], T[0], 0.55) + 0.07 * R, lerp(Fb[1], T[1], 0.55) - bulge * 0.4, lerp(T[0], Fb[0], 0.08), lerp(T[1], Fb[1], 0.08));
    ear.quadraticCurveTo(T[0], T[1] - 0.02 * R, lerp(T[0], Bb[0], 0.1), lerp(T[1], Bb[1], 0.1));
    ear.quadraticCurveTo(lerp(Bb[0], nT[0], 0.5) - bulge * 0.7, lerp(Bb[1], nT[1], 0.5), Bb[0], Bb[1]);
    ear.closePath();
  }
  const furTop = mix(C.base, C.light, 0.2);
  const gr = g.createLinearGradient(0, tip[1], 0, mid[1]);
  gr.addColorStop(0, mix(C.base, C.dark, C.pattern === "points" ? 0.9 : 0.5));
  gr.addColorStop(1, furTop);
  g.fillStyle = gr;
  g.fill(ear);
  if (C.pattern === "points") { g.fillStyle = rgba(C.stripe, 0.85); g.fill(ear); }
  if (C.pattern === "calico" && e.s === 1) { g.fillStyle = rgba(C.patch2, 0.92); g.fill(ear); }
  else if (C.pattern === "calico") { g.fillStyle = rgba(C.stripe, 0.85); g.fill(ear); }
  const v = clamp(e.D);
  if (e.D > 0.05) {
    const iF = [lerp(Fb[0], Bb[0], 0.14), lerp(Fb[1], Bb[1], 0.14)];
    const iB = [lerp(Bb[0], Fb[0], 0.2 + 0.55 * (1 - v)), lerp(Bb[1], Fb[1], 0.2 + 0.55 * (1 - v))];
    const iT = [lerp(tip[0], mid[0], 0.17), lerp(tip[1], mid[1], 0.17)];
    const inner = new Path2D();
    inner.moveTo(iF[0], iF[1]);
    inner.quadraticCurveTo((iF[0] + iT[0]) / 2 + 0.02 * R, (iF[1] + iT[1]) / 2, iT[0], iT[1]);
    inner.quadraticCurveTo((iB[0] + iT[0]) / 2 - 0.05 * R, (iB[1] + iT[1]) / 2 + 0.05 * R, iB[0], iB[1]);
    inner.quadraticCurveTo(mid[0], mid[1] + 0.12 * R, iF[0], iF[1]);
    // the pinna: thin skin, pink where light gets through, deep shadow down in the canal
    const deep = [lerp(mid[0], iT[0], 0.15), lerp(mid[1], iT[1], 0.15)];
    const ig = g.createLinearGradient(iT[0], iT[1], deep[0], deep[1]);
    ig.addColorStop(0, mix(C.innerEar, C.dark, 0.3));
    ig.addColorStop(0.45, C.innerEar);
    ig.addColorStop(1, mix(C.innerEar, "#2a1008", 0.62));
    g.globalAlpha = 0.35 + 0.65 * v;
    g.fillStyle = ig;
    g.fill(inner);
    // the inner rim of skin catches light; the cavity shades under the leading edge
    g.save();
    g.clip(inner);
    const sh = g.createLinearGradient(iF[0], iF[1], iB[0], iB[1]);
    sh.addColorStop(0, rgba("#2a1008", 0.35));
    sh.addColorStop(0.5, rgba("#2a1008", 0));
    g.fillStyle = sh;
    g.fill(inner);
    const bl = F.backlit;
    if (bl > 0) {
      // translucency: a warm red glow through the thin skin when the light is behind the head
      const gc = mix(C.innerEar, "#ff5a2a", 0.55);
      const rg = g.createRadialGradient(iT[0], iT[1] + 0.2 * R, 0, iT[0], iT[1] + 0.2 * R, 0.6 * R);
      rg.addColorStop(0, rgba(gc, 0.75 * bl));
      rg.addColorStop(1, rgba(gc, 0));
      g.globalCompositeOperation = "lighter";
      g.fillStyle = rg;
      g.fill(inner);
    }
    g.restore();
    // pale ear furnishings: long fine hairs from the inner edges sweeping up and out
    if (lod > 0) {
      const R2 = rng(e.s * 7 + 3);
      const tufts = new Path2D();
      const n = lod > 1 ? 16 : 9;
      for (let i = 0; i < n; i++) {
        const u = R2();
        const bx = lerp(iF[0], iB[0], u * 0.85), by = lerp(iF[1], iB[1], u * 0.85) + 0.05 * R;
        const k = 0.4 + R2() * 0.35;
        const ex = lerp(bx, iT[0], k) + (R2() - 0.5) * 0.12 * R, ey = lerp(by, iT[1], k);
        tufts.moveTo(bx, by);
        tufts.quadraticCurveTo(lerp(bx, ex, 0.5) + (lerp(iF[0], iB[0], 0.5) - bx) * 0.15, lerp(by, ey, 0.5), ex, ey);
      }
      g.lineCap = "round";
      g.lineWidth = Math.max(0.03 * R, F.u1 * 0.7);
      g.strokeStyle = rgba(mix(C.white || "#f6efe4", C.light, 0.3), 0.6);
      g.stroke(tufts);
    }
    g.globalAlpha = 1;
  } else if (F.layered) {
    // the back of the ear: furred, a little darker toward the tip
    innerEdge(F, ear, 0.12 * R, 0.25);
  }
  if (e.fold) {
    const fg = g.createLinearGradient(tip[0], tip[1], e.fold.fold[0], e.fold.fold[1]);
    fg.addColorStop(0, mix(C.base, C.dark, 0.25));
    fg.addColorStop(1, mix(C.base, C.dark, 0.6));
    g.save();
    g.clip(e.fold.ear);
    g.globalAlpha = 0.4;
    g.fillStyle = C.dark;
    g.translate(0, 0.04 * R);
    g.fill(e.fold.flap);
    g.translate(0, -0.04 * R);
    g.globalAlpha = 1;
    g.fillStyle = fg;
    g.fill(e.fold.flap);
    g.strokeStyle = rgba("#fff2dc", 0.3);
    g.lineWidth = 0.025 * R;
    g.beginPath();
    g.moveTo(e.fold.Pa[0], e.fold.Pa[1]);
    g.lineTo(e.fold.Pb[0], e.fold.Pb[1]);
    g.stroke();
    g.restore();
  }
  if (!F.layered && L.rim > 0 && F.lod > 0) {
    const eb = [Math.min(Fb[0], Bb[0], T[0]) - 2, Math.min(Fb[1], Bb[1], T[1]) - 2, Math.max(Fb[0], Bb[0], T[0]) + 2, Math.max(Fb[1], Bb[1], T[1]) + 2];
    crescent(g, ear, -L.x * 0.1 * R, -L.y * 0.1 * R, L.color, 0.6 * L.rim, eb, "lighter", csteps(F, 2));
  }
}

// Phase 1 of the head: everything that is FUR (ears, skull, markings, muzzle) - lit with the body.
function drawHeadFur(F, H) {
  const g = F.g, C = F.C, L = F.L, lod = F.lod;
  const { h, R, pr, rx3, sn, cs, jaw } = H;
  g.save();
  g.translate(h.x, h.y);
  g.rotate(H.tilt);
  for (const e of earDefs(H, C)) drawEar(F, H, e);
  const HO = headOutline(H);
  const headPath = HO.path;
  H.path = HO.path;
  const lc = pr(0.35, 0.45, 0.3);
  const hg = g.createRadialGradient(lc[0] + F.K.x * 0.3 * R, lc[1] - 0.2 * R, 0.1 * R, 0, 0.1 * R, 1.6 * R);
  hg.addColorStop(0, mix(C.base, C.light, 0.4));
  hg.addColorStop(0.55, C.base);
  hg.addColorStop(1, mix(C.base, C.dark, 0.55));
  let headLit = null;
  if (lod > 0) {
    // fur fringe around the cheeks / jaw / back of the skull: sampled from the real outline
    const samp = [];
    const P = HO.pts;
    for (let i = 0; i < P.length; i += 2) samp.push([P[i], P[i + 1]]);
    const style = rgba(mix(C.base, C.dark, 0.12), 0.7);
    headLit = fluff(F, lod > 1 ? sampleSpline(HO.pts, true, 2) : samp, HO.o0[0], HO.o0[1], 99, 0.07 * R, 1, style, F.lw);
    // cheek ruff: longer tufts flaring back from the jowls (a mature tom's fullness)
    if (lod > 1) {
      for (const s of [1, -1]) {
        if (0.3 * sn + s * 0.95 * cs < -0.1) continue;
        const c = pr(0.0, -0.42, s * 0.75);
        const R3 = rng(s * 11 + 5);
        const tuft = new Path2D();
        for (let i = 0; i < 10; i++) {
          const a = Math.PI * (0.55 + R3() * 0.35) * (cs * s > 0 ? 1 : 1);
          const x0 = c[0] + (R3() - 0.5) * 0.3 * R, y0 = c[1] + (R3() - 0.5) * 0.2 * R;
          const l = (0.12 + R3() * 0.12) * R;
          tuft.moveTo(x0, y0);
          tuft.lineTo(x0 + Math.cos(a) * l * (sn > 0.5 ? -s : -1), y0 + Math.sin(a) * l);
        }
        g.lineCap = "round";
        g.lineWidth = F.lw;
        g.strokeStyle = rgba(mix(C.base, C.light, 0.3), 0.6);
        g.stroke(tuft);
      }
    }
  }
  g.fillStyle = hg;
  g.fill(headPath);

  g.save();
  g.clip(headPath);
  // calico: a black patch over one eye + ear side, orange on the crown of the other
  if (C.pattern === "calico") {
    const a = pr(0.3, 0.45, 0.5), b = pr(0.0, 0.5, -0.45);
    const ga = g.createRadialGradient(a[0], a[1], 0, a[0], a[1], 0.75 * R);
    ga.addColorStop(0, rgba(C.patch2, 0.95)); ga.addColorStop(0.75, rgba(C.patch2, 0.9)); ga.addColorStop(1, rgba(C.patch2, 0));
    g.fillStyle = ga; g.fillRect(-2 * R, -2 * R, 4 * R, 4 * R);
    const gb = g.createRadialGradient(b[0], b[1], 0, b[0], b[1], 0.8 * R);
    gb.addColorStop(0, rgba(C.stripe, 0.95)); gb.addColorStop(0.7, rgba(C.stripe, 0.85)); gb.addColorStop(1, rgba(C.stripe, 0));
    g.fillStyle = gb; g.fillRect(-2 * R, -2 * R, 4 * R, 4 * R);
  }
  // points (Siamese mask): dense on the muzzle, fading up over the eyes
  if (C.pattern === "points") {
    const m = pr(0.8, -0.22, 0);
    const mg = g.createRadialGradient(m[0], m[1], 0, m[0], m[1], 1.05 * R);
    mg.addColorStop(0, rgba(C.stripe, 1));
    mg.addColorStop(0.6, rgba(C.stripe, 0.85));
    mg.addColorStop(1, rgba(C.stripe, 0));
    g.fillStyle = mg;
    g.fillRect(-2 * R, -2 * R, 4 * R, 4 * R);
  }
  // muzzle, chin, whisker pads and spectacles: soft-edged pale fur (the muzzle stays pale even on points)
  const pale = C.muzzle ? C.white : mix(C.base, C.light, 0.55);
  const soft = (cx, cy, cz, r, a, col = pale) => {
    const p = pr(cx, cy, cz);
    const rr = r * R;
    const gr = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], rr);
    gr.addColorStop(0, rgba(col, a));
    gr.addColorStop(0.55, rgba(col, a * 0.75));
    gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr;
    g.fillRect(p[0] - rr, p[1] - rr, rr * 2, rr * 2);
  };
  if (C.pattern !== "points") {
    soft(0.93, -0.29, 0.16, 0.3, 0.95);
    soft(0.93, -0.29, -0.16, 0.3, 0.95);
    soft(0.76, -0.52 - jaw, 0, 0.27, 0.95);
    soft(0.45, -0.75, 0, 0.42, C.muzzle ? 0.85 : 0.45);
    // spectacles: the pale rims of fur around each eye
    for (const s of [1, -1]) soft(0.6, 0.12, s * 0.42, 0.24, 0.42, mix(pale, C.light, 0.4));
    for (const s of [1, -1]) soft(0.64, 0.05, s * 0.42, 0.22, 0.3);
  }
  // forehead M, crown stripes, cheek swirls
  if (C.pattern !== "solid" && C.pattern !== "points" && C.pattern !== "calico" && lod > 0 && (C.stripeAlpha == null || C.stripeAlpha > 0)) {
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
    // the "M": four short strokes rising from the brow
    for (const z of [-0.26, -0.09, 0.09, 0.26]) line([[0.8, z * 0.7], [0.62, z * 0.92], [0.42, z * (Math.abs(z) > 0.2 ? 1.2 : 0.6)]]);
    // crown lines running back over the skull
    for (const z of [-0.15, 0, 0.15]) line([[0.62, z, -0.05], [0.8, z, -0.45], [0.84, z, -0.85], [0.72, z * 1.2, -1.2]]);
    const sa = (C.stripeAlpha || 0.7);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = rgba(C.stripe, sa * 0.22);
    g.lineWidth = 0.13 * R;
    g.stroke(stripe);
    g.strokeStyle = rgba(C.stripe, sa * 0.55);
    g.lineWidth = 0.06 * R;
    g.stroke(stripe);
    // cheek "mascara" lines sweeping back from the outer eye corner
    const cheek = new Path2D();
    for (const s of [1, -1]) {
      const a = pr(0.44, 0.08, s * 0.64), b = pr(0.14, -0.04, s * 0.92), c = pr(-0.18, -0.24, s * 0.92);
      if ((0.3 * sn + s * 0.95 * cs) < 0.05) continue;
      cheek.moveTo(a[0], a[1]);
      cheek.quadraticCurveTo(b[0], b[1], c[0], c[1]);
      const d = pr(0.3, -0.22, s * 0.84), e2 = pr(0.0, -0.36, s * 0.9);
      cheek.moveTo(d[0], d[1]);
      cheek.quadraticCurveTo((d[0] + e2[0]) / 2, (d[1] + e2[1]) / 2 + 0.05 * R, e2[0], e2[1]);
    }
    g.strokeStyle = rgba(C.stripe, sa * 0.18);
    g.lineWidth = 0.1 * R;
    g.stroke(cheek);
    g.strokeStyle = rgba(C.stripe, sa * 0.4);
    g.lineWidth = 0.045 * R;
    g.stroke(cheek);
  }
  // hollows: under the cheekbone and beside the muzzle (anatomy reads through the fur)
  if (lod > 0) {
    for (const s of [1, -1]) {
      if (0.3 * sn + s * 0.95 * cs < 0) continue;
      const p = pr(0.55, -0.18, s * 0.42);
      const gr = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], 0.22 * R);
      gr.addColorStop(0, rgba(mix(C.dark, "#000", 0.3), 0.16));
      gr.addColorStop(1, rgba(C.dark, 0));
      g.fillStyle = gr;
      g.fillRect(p[0] - 0.3 * R, p[1] - 0.3 * R, 0.6 * R, 0.6 * R);
    }
    // eye sockets: the brow ridge shades the upper eye area
    for (const s of [1, -1]) {
      const D = 0.72 * sn + s * 0.69 * cs;
      if (D < -0.05) continue;
      const p = pr(0.66, 0.2, s * 0.37);
      const gr = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], 0.24 * R);
      gr.addColorStop(0, rgba(mix(C.dark, "#000", 0.4), 0.3));
      gr.addColorStop(1, rgba(C.dark, 0));
      g.fillStyle = gr;
      g.fillRect(p[0] - 0.3 * R, p[1] - 0.3 * R, 0.6 * R, 0.6 * R);
    }
  }
  // fur flowing back from the nose
  if (F.layered) {
    const nz = pr(1.12, -0.12, 0);
    const spr = radialFur();
    const rr = 2.3 * R;
    g.save();
    g.globalCompositeOperation = "overlay";
    g.globalAlpha *= clamp(F.furA * 0.95);
    g.drawImage(spr, nz[0] - rr, nz[1] - rr, rr * 2, rr * 2);
    g.restore();
    // crisp strands on top (the sprite is soft when magnified): flowing back and down off the face
    furOverlay(F, headPath, Math.atan2(0.35 + 0.65 * (1 - Math.abs(cs)), -cs), 0.55, 5, 9);
  } else if (lod > 0) {
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
    g.lineWidth = F.lw;
    g.strokeStyle = rgba(C.light, 0.28);
    g.stroke(hi);
    g.strokeStyle = rgba(C.dark, 0.22);
    g.stroke(lo);
  }
  // top light: crown a touch brighter, underside of the jaw in occlusion
  const ao = g.createLinearGradient(0, -0.9 * R, 0, 0.9 * R);
  ao.addColorStop(0, rgba("#fff6e0", 0.08));
  ao.addColorStop(0.6, "rgba(0,0,0,0)");
  ao.addColorStop(1, rgba("#2a1205", 0.34));
  g.fillStyle = ao;
  g.fillRect(-2 * R, -1.5 * R, 4 * R, 3 * R);
  g.restore();
  innerEdge(F, headPath, 0.16 * R, 0.22);
  // the ruff: tufts from the jaw and throat lying over the neck, so the head grows out of the body
  if (F.layered && lod > 1) {
    const Rr = rng(808);
    const P = HO.pts, n = P.length / 2;
    const tufts = new Path2D(), pale = new Path2D();
    for (let i = 0; i < n; i++) {
      const x = P[i * 2], y = P[i * 2 + 1];
      if (y < HO.o0[1] + 0.15 * R) continue;
      for (let k = 0; k < 3; k++) {
        let nx = x - HO.o0[0], ny = y - HO.o0[1];
        const l0 = Math.hypot(nx, ny) || 1;
        nx /= l0; ny /= l0;
        const a = Math.atan2(ny + 0.6, nx - 0.35 * cs) + (Rr() - 0.5) * 0.5;
        const len = (0.1 + Rr() * 0.14) * R;
        const sx = x - nx * 0.08 * R + (Rr() - 0.5) * 0.08 * R, sy = y - ny * 0.08 * R;
        const p = C.bib && Math.abs(x - pr(0.6, 0, 0)[0]) < 0.45 * R ? pale : tufts;
        p.moveTo(sx, sy);
        p.quadraticCurveTo(sx + Math.cos(a) * len * 0.5, sy + Math.sin(a) * len * 0.5 - 0.02 * R, sx + Math.cos(a + 0.2) * len, sy + Math.sin(a + 0.2) * len);
      }
    }
    g.lineCap = "round";
    g.lineWidth = F.lw * 1.4;
    g.strokeStyle = rgba(mix(C.base, C.light, 0.1), 0.38);
    g.stroke(tufts);
    g.strokeStyle = rgba(mix(C.white, C.light, 0.3), 0.3);
    g.stroke(pale);
  }
  if (!F.layered) {
    const hb = [-1.4 * R, -1.1 * R, 1.5 * R, 1.0 * R];
    crescent(g, headPath, L.x * 0.22 * R, L.y * 0.22 * R, "#1a0a02", 0.22, hb, "source-over", csteps(F, 3));
    if (L.rim > 0) crescent(g, headPath, -L.x * 0.09 * R, -L.y * 0.09 * R, L.color, 0.65 * L.rim, hb, "lighter", csteps(F, 3));
    rimFluff(F, headLit, F.lw);
  }
  g.restore();
}

// Phase 2 of the head: the crisp, wet, specular features (eyes, nose, mouth, whiskers).
function drawHeadFeatures(F, H) {
  const g = F.g, C = F.C, L = F.L, o = F.o, lod = F.lod;
  const { h, R, pr, rx3, sn, cs, turn, blink, mouth, jaw } = H;
  g.save();
  g.translate(h.x, h.y);
  g.rotate(H.tilt);
  // light falling on a feature (head space normal ~ screen direction from the skull centre)
  const shadeAt = (p) => {
    const l = Math.hypot(p[0], p[1]) || 1;
    const d = (p[0] / l) * F.K.x + (p[1] / l) * F.K.y;
    return clamp(0.5 - 0.5 * d) * F.shadeK;
  };

  const eyeOrder = [-1, 1].map((s) => ({ s, D: (0.72 * sn + s * 0.69 * cs) })).sort((a, b) => a.D - b.D);
  const drawEye = (s, D) => {
    if (D < -0.08) return;
    const vis = clamp((D + 0.08) / 0.5);
    const I = pr(0.7, 0.12, s * 0.2), O = pr(0.52, 0.24, s * 0.55);
    let ux = O[0] - I[0], uy = O[1] - I[1];
    let w = Math.hypot(ux, uy);
    const minW = 0.2 * R * vis;
    if (w < minW) {
      const dir = ux === 0 ? -1 : Math.sign(ux);
      ux = dir * minW; uy = uy * (minW / Math.max(w, 1e-3)); w = minW;
    }
    ux /= w; uy /= w;
    const cx = (I[0] + O[0]) / 2, cy = (I[1] + O[1]) / 2;
    const nx = uy, ny = -ux;
    const up = ny < 0 ? 1 : -1;
    const px = nx * up, py = ny * up;
    const hw = w / 2;
    const bh0 = 0.155 * R;
    const bh = bh0 * (1 - blink * 0.97);
    const iC = [cx - ux * hw * 1.02, cy - uy * hw * 1.02 + 0.035 * R], oC = [cx + ux * hw, cy + uy * hw - 0.01 * R];
    const shade = shadeAt([cx, cy]);
    if (bh < 0.02 * R) {
      // closed: the lid seam with a soft fur fold above it
      g.lineCap = "round";
      g.strokeStyle = rgba(mix(C.dark, "#000", 0.3), 0.35);
      g.lineWidth = 0.09 * R;
      g.beginPath();
      g.moveTo(iC[0], iC[1]);
      g.quadraticCurveTo(cx + px * 0.02 * R, cy + py * 0.02 * R + 0.06 * R, oC[0], oC[1]);
      g.stroke();
      g.strokeStyle = C.liner;
      g.lineWidth = 0.045 * R;
      g.stroke();
      return;
    }
    const eye = new Path2D();
    eye.moveTo(iC[0], iC[1]);
    eye.bezierCurveTo(cx - ux * hw * 0.55 + px * bh * 1.3, cy - uy * hw * 0.55 + py * bh * 1.3, cx + ux * hw * 0.42 + px * bh * 1.42, cy + uy * hw * 0.42 + py * bh * 1.42, oC[0], oC[1]);
    eye.bezierCurveTo(cx + ux * hw * 0.5 - px * bh * 1.12, cy + uy * hw * 0.5 - py * bh * 1.12, cx - ux * hw * 0.55 - px * bh * 1.22, cy - uy * hw * 0.55 - py * bh * 1.22, iC[0], iC[1]);
    const gz = clamp(o.gaze || 0, -1, 1) * hw * 0.3;
    const ex = cx + ux * gz, ey = cy + uy * gz + 0.01 * R;
    const ir = Math.max(hw * 1.08, bh0 * 1.4);
    const ang = Math.atan2(uy, ux);
    g.fillStyle = mix(C.iris, "#000", 0.55);
    g.fill(eye);
    g.save();
    g.clip(eye);
    // iris: a photographic texture, foreshortened as the head turns
    const fs = 0.55 + 0.45 * vis;
    g.save();
    g.translate(ex, ey);
    g.rotate(ang);
    g.scale(fs, 1);
    if (lod > 0) g.drawImage(irisSprite(C.iris, C.irisInner, C.liner), -ir, -ir, ir * 2, ir * 2);
    else {
      const ig = g.createRadialGradient(0, 0, 0, 0, 0, ir);
      ig.addColorStop(0, C.irisInner); ig.addColorStop(0.7, C.iris); ig.addColorStop(1, C.liner);
      g.fillStyle = ig; g.fillRect(-ir, -ir, ir * 2, ir * 2);
    }
    // pupil: a vertical slit in bright light, a round black pool in the dark
    const pup = clamp(o.pupil == null ? (o.dark ? 0.85 : 0.3) : o.pupil);
    const pw = ir * lerp(0.1, 0.62, pup), ph = ir * lerp(0.92, 0.64, pup);
    const eg = clamp(o.eyesGlow || 0);
    const glowC = "#c8ff7a";
    const pc = eg > 0 ? mix("#030405", glowC, eg * 0.9) : "#030405";
    g.rotate(-ang);
    g.fillStyle = rgba(pc, 0.45);
    g.beginPath();
    g.ellipse(0, 0, pw * 1.18 + 0.01 * R, ph * 1.04, 0, 0, TAU);
    g.fill();
    g.fillStyle = pc;
    g.beginPath();
    g.ellipse(0, 0, pw, ph, 0, 0, TAU);
    g.fill();
    g.restore();
    // light through the cornea pools in the lower iris, opposite the catchlight
    const lgx = ex - px * bh * 0.5, lgy = ey - py * bh * 0.5;
    const cg = g.createRadialGradient(lgx, lgy, 0, lgx, lgy, hw * 0.95);
    cg.addColorStop(0, rgba(mix(C.irisInner, "#fff3b0", 0.5), 0.38));
    cg.addColorStop(1, rgba(C.irisInner, 0));
    g.globalCompositeOperation = "lighter";
    g.fillStyle = cg;
    g.fill(eye);
    g.globalCompositeOperation = "source-over";
    // the upper lid and lashes shade the top of the eye
    const lg = g.createLinearGradient(cx + px * bh * 1.35, cy + py * bh * 1.35, cx - px * bh * 0.15, cy - py * bh * 0.15);
    lg.addColorStop(0, "rgba(8,4,0,0.8)");
    lg.addColorStop(0.5, "rgba(8,4,0,0.25)");
    lg.addColorStop(1, "rgba(8,4,0,0)");
    g.fillStyle = lg;
    g.fill(eye);
    if (shade > 0.01) { g.fillStyle = rgba("#000", shade * 0.55); g.fill(eye); }
    // the wet cornea: a broad faint sky reflection, then the key light's catchlight (a softbox)
    const sky = g.createLinearGradient(cx + px * bh, cy + py * bh, cx, cy);
    sky.addColorStop(0, "rgba(220,235,255,0.0)");
    sky.addColorStop(0.5, "rgba(220,235,255,0.10)");
    sky.addColorStop(1, "rgba(220,235,255,0)");
    g.fillStyle = sky;
    g.fill(eye);
    const kx = clamp(F.K.x, -1, 1), ky = clamp(F.K.y, -1, 0.2);
    const hx = ex + kx * hw * 0.38 - ux * hw * 0.08, hy = ey + Math.min(ky * bh * 0.55, -bh * 0.25);
    const cc = mix("#ffffff", F.K.color, 0.25);
    const ca = (0.95 - shade * 0.5) * (0.55 + 0.45 * vis);
    g.fillStyle = rgba(cc, ca * 0.22);
    g.beginPath();
    g.ellipse(hx, hy, 0.08 * R * (0.5 + 0.5 * vis), 0.06 * R, ang, 0, TAU);
    g.fill();
    g.fillStyle = rgba(cc, ca);
    g.beginPath();
    g.ellipse(hx, hy, 0.034 * R * (0.5 + 0.5 * vis), 0.026 * R, ang, 0, TAU);
    g.fill();
    // a second, small fill-light reflection low on the opposite side
    g.fillStyle = rgba("#ffffff", 0.18 * vis);
    g.beginPath();
    g.ellipse(ex - kx * hw * 0.35, ey + bh * 0.45, 0.025 * R, 0.018 * R, 0, 0, TAU);
    g.fill();
    // third eyelid: a hint of the pale membrane in the inner corner
    g.fillStyle = rgba("#c9aea6", 0.55);
    g.beginPath();
    g.moveTo(iC[0] - ux * 0.02 * R, iC[1]);
    g.quadraticCurveTo(iC[0] + ux * hw * 0.22, iC[1] + uy * hw * 0.22 - py * bh * 0.2, iC[0] + ux * hw * 0.05 + px * bh * 0.5, iC[1] + uy * hw * 0.05 + py * bh * 0.5);
    g.closePath();
    g.fill();
    g.restore();
    // lid margin (cats really do have dark "eyeliner") + a wet line on the lower lid
    g.lineJoin = "round";
    g.strokeStyle = rgba(C.liner, 0.8);
    g.lineWidth = Math.max(0.024 * R, F.u1 * 1.1);
    g.stroke(eye);
    g.save();
    g.translate(-px * 0.035 * R, -py * 0.035 * R);
    g.strokeStyle = rgba("#ffffff", 0.12);
    g.lineWidth = 0.02 * R;
    g.beginPath();
    g.moveTo(cx - ux * hw * 0.5, cy - uy * hw * 0.5 - py * bh * 1.0);
    g.quadraticCurveTo(cx, cy - py * bh * 1.25, cx + ux * hw * 0.5, cy + uy * hw * 0.5 - py * bh * 1.0);
    g.stroke();
    g.restore();
    if (eg > 0) glow(g, ex, ey, bh0 * 3.2, glowC, eg * 0.8);
  };

  // the far eye's inner corner tucks behind the bridge of the nose (clip the bridge out of it)
  if (eyeOrder[0].D > -0.08 && turn < 0.85) {
    const br = new Path2D();
    br.rect(-3 * R, -3 * R, 6 * R, 6 * R);
    const c = pr(0.62, 0.1, 0);
    ellipsePath(br, c[0], c[1], rx3(0.16, 0.12), 0.34 * R, 0);
    g.save();
    g.clip(br, "evenodd");
    drawEye(eyeOrder[0].s, eyeOrder[0].D);
    g.restore();
  } else drawEye(eyeOrder[0].s, eyeOrder[0].D);
  drawEye(eyeOrder[1].s, eyeOrder[1].D);

  // nose leather + mouth
  if (turn > -0.35) {
    const a = pr(1.12, -0.05, 0.12), b = pr(1.12, -0.05, -0.12), c = pr(1.17, -0.19, 0);
    const nose = new Path2D();
    const top = pr(1.15, -0.015, 0);
    nose.moveTo(a[0], a[1]);
    nose.quadraticCurveTo(top[0], top[1] - 0.035 * R, b[0], b[1]);
    nose.quadraticCurveTo(lerp(b[0], c[0], 0.65), lerp(b[1], c[1], 0.35), c[0], c[1]);
    nose.quadraticCurveTo(lerp(a[0], c[0], 0.65), lerp(a[1], c[1], 0.35), a[0], a[1]);
    const ng = g.createLinearGradient(0, top[1], 0, c[1]);
    ng.addColorStop(0, mix(C.nose, "#fff", 0.12));
    ng.addColorStop(0.6, C.nose);
    ng.addColorStop(1, C.noseEdge);
    g.fillStyle = ng;
    g.fill(nose);
    g.save();
    g.clip(nose);
    // nostrils: dark commas at the lower outer corners, visible on the camera side
    for (const s of [1, -1]) {
      const D = 0.6 * sn + s * 0.8 * cs;
      if (D < -0.2) continue;
      const q = pr(1.15, -0.13, s * 0.065);
      g.fillStyle = rgba(mix(C.noseEdge, "#000", 0.6), 0.85);
      g.beginPath();
      g.ellipse(q[0], q[1], rx3(0.045, 0.03) + 0.005 * R, 0.022 * R, s * 0.5 * (cs >= 0 ? 1 : -1), 0, TAU);
      g.fill();
    }
    // the planum's pebbled texture reads as a soft sheen on top
    const nh = g.createRadialGradient(top[0], top[1] + 0.03 * R, 0, top[0], top[1] + 0.03 * R, 0.1 * R);
    nh.addColorStop(0, "rgba(255,255,255,0.5)");
    nh.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = nh;
    g.fillRect(top[0] - 0.12 * R, top[1] - 0.1 * R, 0.24 * R, 0.24 * R);
    g.restore();
    g.strokeStyle = rgba(C.noseEdge, 0.7);
    g.lineWidth = 0.025 * R;
    g.stroke(nose);
    // philtrum + mouth line
    const m0 = pr(1.16, -0.2, 0), m1 = pr(1.12, -0.33, 0);
    const mouthP = new Path2D();
    mouthP.moveTo(m0[0], m0[1]);
    mouthP.lineTo(m1[0], m1[1]);
    for (const s of [1, -1]) {
      const e = pr(0.98, -0.39, s * 0.18), cc = pr(1.08, -0.4, s * 0.07);
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
      // the little fangs
      g.fillStyle = "#f4efe6";
      for (const s of [1, -1]) {
        const f = pr(1.02, -0.43 - jaw * 0.1, s * 0.09);
        g.beginPath();
        g.moveTo(f[0] - 0.02 * R, f[1]);
        g.lineTo(f[0] + 0.02 * R, f[1]);
        g.lineTo(f[0], f[1] + 0.07 * R * clamp(jaw * 6));
        g.closePath();
        g.fill();
      }
    }
    g.strokeStyle = rgba(C.liner, 0.65);
    g.lineWidth = 0.03 * R;
    g.stroke(mouthP);
    const sh = shadeAt(top);
    if (sh > 0.01) { g.fillStyle = rgba("#000", sh * 0.4); g.fill(nose); }
  }

  // whisker follicles: rows of dark dots on the pads
  if (lod > 1) {
    g.fillStyle = rgba(mix(C.dark, "#000", 0.4), 0.28);
    for (const s of [1, -1]) {
      const D = 0.5 * sn + s * 0.85 * cs;
      if (D < 0) continue;
      for (let r = 0; r < 4; r++) for (let k = 0; k < 3 + (r % 2); k++) {
        const j = hash(r * 7 + k, s + 3) - 0.5;
        const p = pr(1.02 - k * 0.065 - (r % 2) * 0.03 + j * 0.02, -0.22 - r * 0.048 + j * 0.015, s * (0.2 + k * 0.06));
        g.beginPath();
        g.arc(p[0], p[1], 0.011 * R, 0, TAU);
        g.fill();
      }
    }
  }

  // whiskers: long, thin, tapered, catching the light; plus eyebrow whiskers
  if (lod > 0) {
    const thick = new Path2D(), thin = new Path2D();
    const add = (a, b, c) => {
      // split the quadratic at 0.5: fat root half, fine tip half (a taper)
      const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
      const m = [(ab[0] + bc[0]) / 2, (ab[1] + bc[1]) / 2];
      thick.moveTo(a[0], a[1]);
      thick.quadraticCurveTo(ab[0], ab[1], m[0], m[1]);
      thin.moveTo(m[0], m[1]);
      thin.quadraticCurveTo(bc[0], bc[1], c[0], c[1]);
    };
    const nW = lod > 1 ? 5 : 4;
    for (const s of [1, -1]) {
      const D = 0.5 * sn + s * 0.85 * cs;
      for (let i = 0; i < nW; i++) {
        const st = [1.02 - (i % 3) * 0.05, -0.24 - i * 0.04, s * (0.24 + (i % 2) * 0.04)];
        const len = 1.35 + ((i * 7) % 3) * 0.16 - (i === nW - 1 ? 0.3 : 0);
        const dir = [0.42 - i * 0.05, -0.04 - i * 0.075, s * 1];
        const en = [st[0] + dir[0] * len, st[1] + dir[1] * len, st[2] + dir[2] * len];
        const mi = [st[0] + dir[0] * len * 0.5, st[1] + dir[1] * len * 0.5 + 0.07, st[2] + dir[2] * len * 0.5];
        const a = pr(...st), b = pr(...mi), c = pr(...en);
        if (D < -0.2 && Math.abs(c[0] - a[0]) < 0.3 * R) continue;
        add(a, b, [c[0], c[1] + 0.1 * R]);
      }
      if (D > 0.3) {
        for (let i = 0; i < 2; i++) {
          const a = pr(0.62, 0.34 + i * 0.05, s * (0.36 + i * 0.08)), c = pr(0.66, 0.62 + i * 0.05, s * (0.72 + i * 0.08));
          add(a, [(a[0] + c[0]) / 2, Math.min(a[1], c[1]) - 0.06 * R], c);
        }
      }
    }
    g.lineCap = "round";
    const wsz = clamp((F.px - 30) / 160, 0.3, 1);
    const base = Math.max(Math.min(0.016 * R, F.u1 * 1.6), F.u1 * (0.55 + 0.45 * wsz));
    const wl = clamp(lum(C.light) * 2.5, 0.35, 1);
    const wc = C.whisker || mix("#fbf6ee", L.color, L.rim * 0.3);
    g.lineWidth = base;
    g.strokeStyle = rgba(wc, 0.62 * wl * (0.5 + 0.5 * wsz));
    g.stroke(thick);
    g.lineWidth = base * 0.55;
    g.strokeStyle = rgba(wc, 0.42 * wl * (0.5 + 0.5 * wsz));
    g.stroke(thin);
  }
  g.restore();
}

// ------------------------------------------------------------------------------------------------
function limbPath(leg) {
  const path = new Path2D();
  const pts = [];
  for (const q of leg.pts) pts.push(q[0], q[1]);
  tube(path, pts, leg.widths, 5, true, true);
  ellipsePath(path, leg.paw.x, leg.paw.y, leg.paw.rx, leg.paw.ry, leg.paw.rot);
  if (leg.mass) ellipsePath(path, leg.mass.x, leg.mass.y, leg.mass.rx, leg.mass.ry, leg.mass.rot);
  const box = boxOf(pts.concat([leg.paw.x - 6, leg.paw.y + 4, leg.paw.x + 6, leg.paw.y - 4]).concat(leg.mass ? [leg.mass.x - leg.mass.rx, leg.mass.y - leg.mass.rx, leg.mass.x + leg.mass.rx, leg.mass.y + leg.mass.rx] : []));
  return { path, pts, box };
}
function drawLimb(F, leg, far, seed) {
  const g = F.g, C = F.C, o = F.o, lod = F.lod;
  const { path, pts, box } = limbPath(leg);
  // contact occlusion on the body around the leg - but only below the elbow: the upper leg grows
  // out of the shoulder / chest, it is not a separate tube with a rim
  const below = new Path2D();
  const cutY = leg.pts.length > 2 ? leg.pts[1][1] - 2 : leg.pts[0][1] + 3;
  below.rect(box[0] - 20, cutY, box[2] - box[0] + 40, box[3] - cutY + 20);
  if (!far && !leg.mass && F.layered) { g.save(); g.clip(below); aoHalo(F, path, 3.4, 0.24); g.restore(); }
  g.fillStyle = furGradient(g, o._P, C, far);
  g.fill(path);
  g.save();
  g.clip(path);
  if (leg.kind === "front" && !far) { g.fillStyle = bellyGrad(g, o._P, C); g.fill(path); }
  if (leg.mass && F.layered) volumes(F, [{ x: leg.mass.x + 2, y: leg.mass.y - 5, r: leg.mass.rx * 1.1, k: far ? 0.3 : 0.6 }]);
  if (C.pattern === "calico" && leg.mass) {
    const R0 = rng(seed + 3);
    const p = new Path2D();
    ellipsePath(p, leg.mass.x + (R0() - 0.5) * 8, leg.mass.y - 4, leg.mass.rx * 0.8, leg.mass.ry * 0.7, R0());
    softFill(g, p, seed % 2 ? C.patch2 : C.stripe, 0.9, 2);
  }
  if (C.pattern !== "solid" && C.pattern !== "points" && C.pattern !== "calico" && (C.stripeAlpha == null || C.stripeAlpha > 0)) {
    // leg bands + thigh bars, broken and soft
    const st = new Path2D();
    const S = sampleSpline(pts, false, 6);
    for (let k = 1; k < 4; k++) {
      const i = Math.floor((S.length - 1) * (0.22 + k * 0.17));
      const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      const w = 6.5;
      st.moveTo(S[i][0] - dy * w, S[i][1] + dx * w);
      st.quadraticCurveTo(S[i][0] + dx * 2.2, S[i][1] + dy * 2.2, S[i][0] + dy * w, S[i][1] - dx * w);
    }
    if (leg.mass) {
      // two or three broken bars slanting across the thigh (never concentric rings)
      const m = leg.mass;
      const ca = Math.cos(m.rot), sa = Math.sin(m.rot);
      for (let k = -1; k <= 1; k++) {
        const ox = m.x + ca * k * m.rx * 0.45 - 2, oy = m.y + sa * k * m.rx * 0.45 - 3;
        const l = m.ry * (0.55 - Math.abs(k) * 0.12);
        st.moveTo(ox - 0.35 * l, oy - l);
        st.quadraticCurveTo(ox + 0.1 * l, oy - 0.1 * l, ox - 0.05 * l, oy + l * 0.7);
      }
    }
    const sa = (C.stripeAlpha || 0.7);
    g.lineCap = "round";
    g.strokeStyle = rgba(C.stripe, sa * 0.2);
    g.lineWidth = 4.6;
    g.stroke(st);
    g.strokeStyle = rgba(C.stripe, sa * 0.42);
    g.lineWidth = 2.2;
    g.stroke(st);
  }
  if (C.pattern === "points") {
    const y0 = leg.mass ? leg.paw.y - 26 : box[1], y1 = leg.paw.y + 2;
    const pg = g.createLinearGradient(0, y0, 0, y1);
    pg.addColorStop(0, rgba(C.stripe, 0));
    pg.addColorStop(0.45, rgba(C.stripe, 0.85));
    pg.addColorStop(1, rgba(C.stripe, 0.97));
    g.fillStyle = pg;
    g.fill(path);
  }
  const sock = C.socks === "all" || (C.socks === "front" && leg.kind === "front");
  if (sock) {
    const sy = (leg.sock != null ? leg.sock : leg.paw.y - 6) - 2;
    const sg = g.createLinearGradient(0, sy - 4, 0, sy + 2);
    sg.addColorStop(0, rgba(C.white, 0));
    sg.addColorStop(1, rgba(far ? mix(C.white, "#7a7068", 0.35) : C.white, 1));
    g.fillStyle = sg;
    g.fillRect(box[0] - 8, sy - 4, box[2] - box[0] + 16, 30);
  }
  // fur flows down the leg
  const a0 = Math.atan2(leg.paw.y - pts[1], leg.paw.x - pts[0]);
  furOverlay(F, path, a0, far ? 0.6 : 0.9, seed * 13, seed * 7);
  furStrokes(F, box, far ? 30 : (lod > 1 ? 160 : 50), seed, () => Math.PI / 2 + 0.25);
  // toes: clefts between the toe pads, soft fluff over the paw, toe beans when the paw is lifted
  if (lod > 0) {
    const p = leg.paw;
    g.strokeStyle = rgba(mix(C.dark, "#000", 0.5), F.layered ? 0.35 : 0.4);
    g.lineWidth = 0.5;
    g.beginPath();
    for (const dx of [-0.2, 0.22]) {
      g.moveTo(p.x + p.rx * (0.45 + dx), p.y - p.ry * 0.15);
      g.quadraticCurveTo(p.x + p.rx * (0.55 + dx), p.y + p.ry * 0.3, p.x + p.rx * (0.6 + dx), p.y + p.ry * 0.85);
    }
    g.stroke();
    if ((leg.lift || 0) > 0.55 && lod > 1) {
      g.fillStyle = rgba(mix(C.nose, "#3a2020", 0.25), 0.85);
      g.beginPath();
      g.ellipse(p.x - p.rx * 0.1, p.y + p.ry * 0.55, p.rx * 0.35, p.ry * 0.3, p.rot, 0, TAU);
      g.fill();
    }
  }
  if (far && F.layered) { g.fillStyle = rgba(F.aoCol, 0.28); g.fill(path); }
  g.restore();
  if (!leg.mass || far) {
    if (F.layered) { g.save(); g.clip(below); innerEdge(F, path, 2.4, far ? 0.25 : 0.16); g.restore(); }
  }
  if (!far && !F.layered && F.lod > 0) crescent(g, path, F.L.x * 4, F.L.y * 4, "#1f0b02", 0.16, box, "source-over", csteps(F, 2));
  if (far && !F.layered) {
    if (F.px >= 64) sculpt(F, path, box, 1.2);
    g.fillStyle = "rgba(40,16,6,0.22)";
    g.fill(path);
  }
  return { path, box };
}

function drawTail(F, P) {
  const g = F.g, C = F.C, o = F.o, lod = F.lod;
  const pts = tailPts(P, o);
  const path = new Path2D();
  const res = tube(path, pts, [7.4, 6.8, 6, 5.2, 4.2], 5, false, true);
  const box0 = boxOf(pts);
  if (!P.tail.behind) aoHalo(F, path, 3, 0.45);
  let tailLit = null;
  if (lod > 0) {
    const samp = res.L.concat(res.R.slice().reverse()).map((q) => [q[0], q[1]]);
    tailLit = fluff(F, samp, (box0[0] + box0[2]) / 2, (box0[1] + box0[3]) / 2, 55, 1.9, 1, furEdge(g, P, C), F.lw);
    wetSpikes(F, samp, (box0[0] + box0[2]) / 2, (box0[1] + box0[3]) / 2, 57);
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
    const sa = (C.stripeAlpha == null ? 0.7 : C.stripeAlpha) * (C.pattern === "points" ? 1.2 : 0.85);
    if (C.pattern !== "calico" && C.pattern !== "points" && sa > 0) {
      g.lineCap = "round";
      g.lineWidth = 5.6;
      g.strokeStyle = rgba(C.stripe, sa * 0.25);
      g.stroke(rings);
      g.lineWidth = 2.8;
      g.strokeStyle = rgba(C.stripe, sa * 0.7);
      g.stroke(rings);
    }
    const tipP = S[n - 1];
    const tg = g.createRadialGradient(tipP[0], tipP[1], 0, tipP[0], tipP[1], 9);
    const tc = C.pattern === "calico" ? C.patch2 : C.tip;
    tg.addColorStop(0, rgba(tc, 0.95));
    tg.addColorStop(1, rgba(tc, 0));
    g.fillStyle = tg;
    g.fillRect(tipP[0] - 10, tipP[1] - 10, 20, 20);
  }
  if (C.pattern === "points") {
    // the tail darkens from a smoky base to a full-colour tip
    const tg2 = g.createLinearGradient(pts[0], pts[1], pts[pts.length - 2], pts[pts.length - 1]);
    tg2.addColorStop(0, rgba(C.stripe, 0.45));
    tg2.addColorStop(0.35, rgba(C.stripe, 0.88));
    tg2.addColorStop(1, rgba(C.stripe, 0.97));
    g.fillStyle = tg2;
    g.fill(path);
  }
  const box = boxOf(pts);
  const ta = Math.atan2(pts[pts.length - 1] - pts[1], pts[pts.length - 2] - pts[0]);
  furOverlay(F, path, ta, 1, 31, 17);
  furStrokes(F, [box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 4], lod > 1 ? 90 : 30, 77, () => ta);
  g.restore();
  innerEdge(F, path, 2.4, 0.3);
  sculpt(F, path, [box[0] - 5, box[1] - 5, box[2] + 5, box[3] + 5], 0.9);
  rimFluff(F, tailLit, F.lw);
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

function collarGeom(P, o) {
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
  const bp = [lerp(mid[0], front[0], clamp(1 - turn) * 0.7), lerp(mid[1] + sag * 0.3, front[1], clamp(1 - turn) * 0.7) + 3.4];
  return { front, back, mid, sag, bp, turn };
}
function drawCollarBand(F, P) {
  const g = F.g, C = F.C, o = F.o;
  const { front, back, mid, sag } = collarGeom(P, o);
  const band = new Path2D();
  band.moveTo(back[0], back[1]);
  band.quadraticCurveTo(mid[0], mid[1] + sag * 0.6, front[0], front[1]);
  g.save();
  g.lineCap = "round";
  // the band sinks into the fur: a soft shadow line first
  g.lineWidth = 4.2;
  g.strokeStyle = rgba(F.aoCol, 0.35);
  g.translate(0, 0.6);
  g.stroke(band);
  g.translate(0, -0.6);
  // leather: red, a darker lower edge, a narrow sheen on the upper edge, stitching
  g.lineWidth = 2.9;
  g.strokeStyle = o.wet ? "#7a1a20" : "#a8222b";
  g.stroke(band);
  g.lineWidth = 1.2;
  g.translate(0, 1.0);
  g.strokeStyle = "rgba(50,6,10,0.7)";
  g.stroke(band);
  g.translate(0, -1.9);
  g.strokeStyle = o.wet ? "rgba(255,210,210,0.55)" : "rgba(255,170,160,0.38)";
  g.lineWidth = 0.6;
  g.stroke(band);
  if (F.lod > 1) {
    g.translate(0, 0.9);
    g.setLineDash([0.9, 0.9]);
    g.strokeStyle = "rgba(255,200,190,0.28)";
    g.lineWidth = 0.25;
    g.stroke(band);
    g.setLineDash([]);
  }
  g.restore();
  // bib tufts over the collar so it sits IN the fur
  const R = rng(5);
  g.strokeStyle = rgba(C.bib ? C.white : C.light, 0.7);
  g.lineWidth = F.lw;
  g.lineCap = "round";
  g.beginPath();
  for (let i = 0; i < (F.lod > 1 ? 14 : 7); i++) {
    const u = 0.15 + R() * 0.75;
    const x = lerp(back[0], front[0], u), y = lerp(back[1], front[1], u) + sag * (1 - Math.abs(u - 0.5) * 2) * 0.9;
    g.moveTo(x, y + 1.8);
    g.lineTo(x + (R() - 0.5) * 1.2, y - 0.9);
  }
  g.stroke();
}
// the brass bell: a real metal sphere reflecting sky above and ground below, hot specular, a slot
function drawBell(F, P) {
  const g = F.g, o = F.o, L = F.L;
  if (o.bell === false) return;
  const { bp } = collarGeom(P, o);
  const r = 2.6;
  const kx = F.K.x, ky = F.K.y;
  // shadow on the fur under the bell
  g.fillStyle = rgba(F.aoCol, 0.35);
  g.beginPath();
  g.ellipse(bp[0] + 0.4, bp[1] + r * 0.9, r * 1.05, r * 0.45, 0, 0, TAU);
  g.fill();
  // the ring loop to the collar
  g.strokeStyle = "#6a4a1a";
  g.lineWidth = 0.55;
  g.beginPath();
  g.ellipse(bp[0], bp[1] - r * 1.05, r * 0.32, r * 0.28, 0, 0, TAU);
  g.stroke();
  const bg = g.createLinearGradient(bp[0], bp[1] - r, bp[0], bp[1] + r);
  // environment: bright sky/room above the horizon, dark ground below, a sharp horizon line
  bg.addColorStop(0, "#f6dc8c");
  bg.addColorStop(0.42, "#c8922e");
  bg.addColorStop(0.5, "#5a3a10");
  bg.addColorStop(0.62, "#8a5c1c");
  bg.addColorStop(1, "#3a2408");
  g.fillStyle = bg;
  g.beginPath();
  g.arc(bp[0], bp[1], r, 0, TAU);
  g.fill();
  // spherical falloff toward the rim (fresnel-dark edge on brass)
  const rg = g.createRadialGradient(bp[0] + kx * r * 0.3, bp[1] + ky * r * 0.3, r * 0.2, bp[0], bp[1], r);
  rg.addColorStop(0, "rgba(0,0,0,0)");
  rg.addColorStop(0.75, "rgba(30,15,0,0.15)");
  rg.addColorStop(1, "rgba(30,15,0,0.6)");
  g.fillStyle = rg;
  g.beginPath();
  g.arc(bp[0], bp[1], r, 0, TAU);
  g.fill();
  // slot + sound hole
  g.strokeStyle = "rgba(30,18,4,0.95)";
  g.lineWidth = 0.42;
  g.beginPath();
  g.moveTo(bp[0] - r * 0.72, bp[1] + r * 0.25);
  g.quadraticCurveTo(bp[0], bp[1] + r * 0.38, bp[0] + r * 0.72, bp[1] + r * 0.25);
  g.moveTo(bp[0], bp[1] + r * 0.3);
  g.lineTo(bp[0], bp[1] + r * 0.92);
  g.stroke();
  g.fillStyle = "rgba(20,10,2,0.95)";
  g.beginPath();
  g.arc(bp[0], bp[1] + r * 0.3, r * 0.14, 0, TAU);
  g.fill();
  // the key light's hotspot + a hard specular
  const hx = bp[0] + clamp(kx, -0.7, 0.7) * r * 0.45, hy = bp[1] + clamp(ky, -0.9, 0.1) * r * 0.45;
  g.fillStyle = "rgba(255,250,225,0.95)";
  g.beginPath();
  g.ellipse(hx, hy, r * 0.22, r * 0.15, -0.5, 0, TAU);
  g.fill();
  glow(g, hx, hy, r * 1.2, "#fff2c0", 0.35 + (o.glint || 0));
  if (L.rim > 0) {
    const rx = bp[0] - L.x * r * 0.8, ry = bp[1] - L.y * r * 0.8;
    glow(g, rx, ry, r * 0.9, L.color, 0.35 * L.rim);
  }
  if (o.glint) glow(g, hx, hy, r * 2.2, "#fff2c0", o.glint);
}

// ------------------------------------------------------------------------------------------------
// The body: torso + neck, with volumes, markings and fur.
function drawBody(F, P) {
  const g = F.g, C = F.C, o = F.o, lod = F.lod;
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
    bodyLit = fluff(F, samp, (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2 + 4, 31, 1.9, 1, furEdge(g, P, C), F.lw);
    wetSpikes(F, samp, (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2 + 4, 33);
  }
  g.fillStyle = furGradient(g, P, C, false);
  g.fill(body);
  g.save();
  g.clip(body);
  g.fillStyle = bellyGrad(g, P, C);
  g.fill(body);
  if (F.layered) volumes(F, P.vols);
  const sa = C.stripeAlpha == null ? 0.7 : C.stripeAlpha;
  if (C.pattern === "calico") {
    // organic patches: wobbly blobs, soft at the edges, orange and black
    const R = rng(21);
    for (let i = 0; i < 6; i++) {
      const px = lerp(bb[0] + 6, bb[2] - 6, R()), py = lerp(bb[1], bb[3] - 12, R());
      const rr = 8 + R() * 10;
      const pts = [];
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * TAU, q = rr * (0.7 + R() * 0.5);
        pts.push(px + Math.cos(a) * q * 1.3, py + Math.sin(a) * q * 0.9);
      }
      const p = new Path2D();
      spline(p, pts, true);
      softFill(g, p, i % 2 ? C.patch2 : C.stripe, 0.92, 2.4);
    }
  } else if (C.pattern !== "solid" && C.pattern !== "points" && sa > 0) {
    // mackerel stripes: narrow, wavy, sometimes broken, running from the dorsal line down the flank
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
      const w0 = 2.4 + R() * 1.3;
      const wob = (R() - 0.5) * 6;
      const sx = SS[i][0] - nx * 2, sy = SS[i][1] - ny * 2;
      const brk = R() < 0.35 ? 0.45 + R() * 0.2 : 2;
      const P1 = [sx, sy, sx + nx * len * 0.5 - dx * (3 + wob * 0.3), sy + ny * len * 0.5 - dy * (3 + wob * 0.3), sx + nx * len - dx * (1 + wob), sy + ny * len - dy * (1 + wob)];
      if (brk < 1) {
        // a broken stripe: two segments with a gap
        const mx = lerp(P1[0], P1[2], brk), my = lerp(P1[1], P1[3], brk);
        tube(st, [P1[0], P1[1], mx, my], [w0, w0 * 0.85], 3, true, true);
        const qx = lerp(P1[2], P1[4], 0.15), qy = lerp(P1[3], P1[5], 0.15);
        tube(st, [qx, qy, P1[4], P1[5]], [w0 * 0.75, 0.4], 3, true, true);
      } else tube(st, P1, [w0, w0 * 0.8, 0.4], 4, true, true);
    }
    softFill(g, st, C.stripe, sa * 0.85, 1.6);
    // the dorsal stripe: a darker band along the spine
    const d = new Path2D();
    spline(d, sp, false);
    g.lineCap = "round";
    g.lineWidth = 7.5;
    g.strokeStyle = rgba(C.stripe, sa * 0.2);
    g.stroke(d);
    g.lineWidth = 4;
    g.strokeStyle = rgba(C.stripe, sa * 0.4);
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
    const bw = mix(C.white, C.light, 0.1);
    wg.addColorStop(0, rgba(bw, 0.95));
    wg.addColorStop(0.35, rgba(bw, 0.8));
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
  // fur flows back from the withers and down the flanks
  const sp = P.spine;
  const vx = sp[0] - sp[sp.length - 2], vy = sp[1] - sp[sp.length - 1];
  const ang = Math.atan2(vy, vx);
  const a1 = ang + 0.35, a2 = ang - 0.35;
  const down = Math.sin(a1) > Math.sin(a2) ? a1 : a2;
  furOverlay(F, body, down, 1, 0, 0);
  furStrokes(F, bb, lod > 1 ? 650 : 140, FUR_SEED + 1, (px, py) => {
    const dy = (py - bb[1]) / Math.max(1, bb[3] - bb[1]);
    return ang - (0.25 + 0.8 * dy);
  });
  if (o.wet > 0) {
    // wet: clumped fur shows as darker partings + specular streaks along the top of the coat
    const R = rng(8);
    const SS = sampleSpline(P.spine, false, 6);
    g.lineCap = "round";
    g.strokeStyle = rgba(mix(C.dark, "#000", 0.4), 0.3 * clamp(o.wet));
    g.lineWidth = 0.7;
    g.beginPath();
    for (let i = 0; i < SS.length; i++) {
      const [sx, sy] = SS[i];
      g.moveTo(sx + (R() - 0.5) * 8, sy + 3 + R() * 8);
      g.lineTo(sx + (R() - 0.5) * 8 - 3, sy + 8 + R() * 10);
    }
    g.stroke();
    g.strokeStyle = rgba("#e4ecff", 0.3 * clamp(o.wet));
    g.lineWidth = 0.8;
    g.beginPath();
    for (let i = 0; i < SS.length; i += 2) {
      const [sx, sy] = SS[i];
      g.moveTo(sx + (R() - 0.5) * 6, sy + 1 + R() * 4);
      g.lineTo(sx + (R() - 0.5) * 6 - 3, sy + 4 + R() * 6);
    }
    g.stroke();
  }
  g.restore();
  return { body, bb, bodyLit };
}

// ------------------------------------------------------------------------------------------------
// Light rig: key (form light), rim (edge light), fill / ambient colours, all in local flipped space.
function lightRig(o, x, y, size) {
  const toLocal = (Lt) => {
    const cxw = x, cyw = y - size * 0.8;
    const lx = (Lt.x - cxw) * o.facing, ly = Lt.y - cyw;
    const l = Math.hypot(lx, ly) || 1;
    return { x: lx / l, y: ly / l };
  };
  const S = size / 60;
  let L = { x: -0.45, y: -0.9, color: "#fff1d6", rim: 0, rw: 3 };
  const rimL = o.rim && typeof o.rim === "object" ? o.rim : o.light;
  if (rimL) {
    const d = toLocal(rimL);
    L = { x: d.x, y: d.y, color: rimL.color || "#fff1d6", rim: clamp(rimL.strength == null ? 1 : rimL.strength, 0, 2), rw: clamp(3 / S, 0.9, 2.6) };
  }
  const keyL = o.key || o.light;
  let K = { x: -0.45, y: -0.9, color: "#fff4e4", strength: 1 };
  if (keyL) {
    const d = toLocal(keyL);
    K = { x: d.x, y: d.y, color: keyL.color || "#fff1d6", strength: clamp(keyL.strength == null ? 1 : keyL.strength, 0, 2) };
  }
  return { L, K };
}

function catBounds(P, o) {
  let b = boxOf(P.torso);
  const grow = (x0, y0, x1, y1) => { b = [Math.min(b[0], x0), Math.min(b[1], y0), Math.max(b[2], x1), Math.max(b[3], y1)]; };
  for (const leg of P.legs) {
    for (const q of leg.pts) grow(q[0] - 9, q[1] - 9, q[0] + 9, q[1] + 9);
    grow(leg.paw.x - 7, leg.paw.y - 5, leg.paw.x + 7, leg.paw.y + 5);
    if (leg.mass) grow(leg.mass.x - leg.mass.rx - 2, leg.mass.y - leg.mass.rx - 2, leg.mass.x + leg.mass.rx + 2, leg.mass.y + leg.mass.rx + 2);
  }
  const h = P.head, R = h.R;
  grow(h.x - 2.6 * R, h.y - 2.0 * R, h.x + 2.6 * R, h.y + 1.6 * R);
  const tp = tailPts(P, o);
  const tb = boxOf(tp);
  grow(tb[0] - 9, tb[1] - 9, tb[2] + 9, tb[3] + 9);
  if (o.tailGlow && o.tailGlow.alpha > 0) grow(tb[0] - 20, tb[1] - 20, tb[2] + 20, tb[3] + 20);
  return [b[0] - 5, b[1] - 5, b[2] + 5, b[3] + 5];
}

// ------------------------------------------------------------------------------------------------
// Offscreen pool (reused every frame; grows to the largest cat drawn).
const POOL = {};
// Each cat drawn within one frame gets its own set of scratch canvases (up to CAT_SLOTS sets): a
// second cat that repainted canvases the first had just been drawn from made the graphics card copy
// every one of them (a two-cat shot ran at 8 fps). catFrame() marks the start of a frame.
const CAT_SLOTS = 4;
let CATN = 0, SLOT = 0;
export function catFrame() { CATN = 0; }
function poolCanvas(name, w, h) {
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  if (SLOT) name += "@" + SLOT;
  if (isCpuMode()) name += "#cpu"; // probes get their own CPU-backed pool (see filmcore cpuMode)
  let c = POOL[name];
  if (!c) { c = POOL[name] = makeCanvas(Math.max(32, w), Math.max(32, h)); c._g = softAdd(ctx2d(c)); }
  else if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); c._g = softAdd(ctx2d(c)); }
  const x = c._g;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = 1;
  x.globalCompositeOperation = "source-over";
  x.imageSmoothingEnabled = true;
  x.clearRect(0, 0, Math.min(c.width, w + 3), Math.min(c.height, h + 3));
  return c;
}

function contactShadow(g, P, o) {
  const sh = P.shadow;
  const lift = clamp(sh.lift || 0);
  const w = sh.w * (1 - lift * 0.35);
  const col = o.ground || "#000000";
  // broad soft occlusion + a tighter, darker core right under the body
  for (const [k, a, f] of [[1, 0.36, 0.13], [0.55, 0.3, 0.09]]) {
    const sg = g.createRadialGradient(0, 0, 0, 0, 0, w * k);
    sg.addColorStop(0, rgba(col, a * (1 - lift * 0.6)));
    sg.addColorStop(0.5, rgba(col, a * 0.45 * (1 - lift * 0.6)));
    sg.addColorStop(1, rgba(col, 0));
    g.save();
    g.translate(sh.x, -0.5);
    g.scale(1, f);
    g.fillStyle = sg;
    g.beginPath();
    g.arc(0, 0, w * k, 0, TAU);
    g.fill();
    g.restore();
  }
  if (!lift) {
    // each planted paw presses its own little dark contact
    for (const leg of P.legs) {
      if (leg.paw.y < -6) continue;
      const pg = g.createRadialGradient(leg.paw.x, 0, 0, leg.paw.x, 0, leg.paw.rx * 1.4);
      pg.addColorStop(0, rgba(col, 0.5));
      pg.addColorStop(1, rgba(col, 0));
      g.save();
      g.translate(leg.paw.x, 0);
      g.scale(1, 0.28);
      g.translate(-leg.paw.x, 0);
      g.fillStyle = pg;
      g.beginPath();
      g.arc(leg.paw.x, 0, leg.paw.rx * 1.4, 0, TAU);
      g.fill();
      g.restore();
    }
  }
}

// ------------------------------------------------------------------------------------------------
function paintCatPhase1(F) {
  const { P, o } = F;
  if (P.tail.behind) drawTail(F, P);
  for (const leg of P.legs) if (leg.side === "far") drawLimb(F, leg, true, 11);
  const B = drawBody(F, P);
  const union = new Path2D(B.body);
  let ub = B.bb.slice();
  if (P.neck) ub = [Math.min(ub[0], P.head.x - 20), Math.min(ub[1], P.head.y - 10), Math.max(ub[2], P.head.x + 5), ub[3]];
  for (const leg of P.legs) {
    if (leg.side !== "near") continue;
    const r = drawLimb(F, leg, false, 23);
    union.addPath(r.path);
    ub = [Math.min(ub[0], r.box[0]), Math.min(ub[1], r.box[1]), Math.max(ub[2], r.box[2]), Math.max(ub[3], r.box[3])];
  }
  sculpt(F, union, [ub[0] - 8, ub[1] - 8, ub[2] + 8, ub[3] + 8], 1);
  rimFluff(F, B.bodyLit, F.lw);
  if (!P.tail.behind) drawTail(F, P);
  if (o.collar !== false && P.neck) drawCollarBand(F, P);
  // the head's occlusion on the chest / neck below it
  if (F.layered) {
    const h = P.head;
    const g = F.g;
    const H = F.H;
    const ch = H.pr(0.5, -0.75, 0);
    const cxp = h.x + ch[0], cyp = h.y + ch[1] + 2;
    g.save();
    g.globalCompositeOperation = "source-atop";
    const gr = g.createRadialGradient(cxp, cyp, 0, cxp, cyp, h.R * 1.3);
    gr.addColorStop(0, rgba(F.aoCol, 0.45));
    gr.addColorStop(1, rgba(F.aoCol, 0));
    g.fillStyle = gr;
    g.fillRect(cxp - h.R * 1.4, cyp - h.R * 1.4, h.R * 2.8, h.R * 2.8);
    g.restore();
  }
  drawHeadFur(F, F.H);
}
function paintCatPhase2(F) {
  const { P, o, g } = F;
  drawHeadFeatures(F, F.H);
  if (o.collar !== false && P.neck) drawBell(F, P);
  if (o.wet > 0.3) {
    // drips falling from the chin and belly (deterministic in t)
    const t = o.t || 0;
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.9 + i * 0.37) % 1;
      const dx = [-10, 10, 30][i], dy = P.belly[1] + 4 + ph * 22;
      if (ph > 0.85) continue;
      g.fillStyle = rgba("#cfe0ff", 0.55 * clamp(o.wet));
      g.beginPath();
      g.ellipse(dx, dy, 0.6, 1.3, 0, 0, TAU);
      g.fill();
      g.fillStyle = rgba("#ffffff", 0.7 * clamp(o.wet));
      g.beginPath();
      g.arc(dx - 0.2, dy - 0.4, 0.25, 0, TAU);
      g.fill();
    }
  }
}

// The photographic light passes, on the finished silhouette in layer A (device px, region w x h).
function lightPasses(F, A, w, h) {
  const ga = A._g;
  const px = F.px;
  ga.setTransform(1, 0, 0, 1, 0, 0);
  const q1 = clamp(px / 90, 1.5, 4.5), q2 = clamp(px / 16, 3, 24);
  const w1 = Math.max(2, Math.ceil(w / q1)), h1 = Math.max(2, Math.ceil(h / q1));
  const w2 = Math.max(2, Math.ceil(w / q2)), h2 = Math.max(2, Math.ceil(h / q2));
  const lo1 = poolCanvas("lo1", w1, h1);
  lo1._g.imageSmoothingQuality = "high";
  lo1._g.drawImage(A, 0, 0, w, h, 0, 0, w1, h1);
  const lo2 = poolCanvas("lo2", w2, h2);
  lo2._g.imageSmoothingQuality = "high";
  lo2._g.drawImage(lo1, 0, 0, w1, h1, 0, 0, w2, h2);
  const sx2 = w / w2, sy2 = h / h2, sx1 = w / w1, sy1 = h / h1;
  const K = F.Kd, Ld = F.Ld;
  // ---- shading: key highlight band, terminator, ambient occlusion (one low-res canvas) ----
  const sh = poolCanvas("sh", w2, h2);
  const x2 = sh._g;
  const shift = px * 0.25;
  if (F.hiK > 0.01) {
    x2.fillStyle = F.hiCol;
    x2.fillRect(0, 0, w2, h2);
    x2.globalCompositeOperation = "destination-out";
    x2.drawImage(lo2, 0, 0, w2, h2, -K.x * shift * 0.4 / sx2, -K.y * shift * 0.4 / sy2, w2, h2);
    x2.globalCompositeOperation = "source-over";
    // the band only lives inside the cat: keep it but fade to 0 alpha by the key amount
    x2.globalCompositeOperation = "destination-in";
    x2.globalAlpha = clamp(0.22 * Math.min(F.hiK, 1.1));
    x2.fillRect(0, 0, w2, h2);
    x2.globalAlpha = 1;
    x2.globalCompositeOperation = "source-over";
  }
  const dk = poolCanvas("dk", w2, h2);
  const xd = dk._g;
  xd.fillStyle = F.shCol;
  xd.fillRect(0, 0, w2, h2);
  xd.globalCompositeOperation = "destination-out";
  xd.drawImage(lo2, 0, 0, w2, h2, K.x * shift / sx2, K.y * shift / sy2, w2, h2);
  xd.globalCompositeOperation = "destination-in";
  xd.globalAlpha = clamp(F.shadeK);
  xd.fillRect(0, 0, w2, h2);
  xd.globalAlpha = 1;
  xd.globalCompositeOperation = "source-over";
  x2.drawImage(dk, 0, 0);
  // occlusion: thin parts and the silhouette edge fall off (fur at grazing angles shows undercoat)
  const ao = poolCanvas("dk", w2, h2);
  const xa = ao._g;
  xa.fillStyle = F.aoCol;
  xa.fillRect(0, 0, w2, h2);
  xa.globalCompositeOperation = "destination-out";
  xa.drawImage(lo2, 0, 0);
  xa.globalCompositeOperation = "destination-in";
  xa.globalAlpha = clamp(F.aoK);
  xa.fillRect(0, 0, w2, h2);
  xa.globalAlpha = 1;
  xa.globalCompositeOperation = "source-over";
  x2.drawImage(ao, 0, 0);
  ga.globalCompositeOperation = "source-atop";
  ga.drawImage(sh, 0, 0, w2, h2, 0, 0, w, h);
  // ---- ambient tint (moonlight, firelight) ----
  if (F.ambient) {
    ga.globalAlpha = F.ambientK;
    ga.fillStyle = F.ambient;
    ga.fillRect(0, 0, w, h);
    ga.globalAlpha = 1;
  }
  // ---- rim + subsurface: a thin edge on the light side that spills past the silhouette ----
  if (F.L.rim > 0.01) {
    // band = cat(soft) minus cat shifted away from the light; the shift exceeds the blur radius
    // so the side away from the light stays fully covered (no all-round outline)
    const rm = poolCanvas("rim", w1, h1);
    const xr = rm._g;
    xr.fillStyle = F.rimCol;
    xr.fillRect(0, 0, w1, h1);
    xr.globalCompositeOperation = "destination-out";
    const rs = Math.max(1.5 * q1, px * 0.01);
    xr.drawImage(lo1, 0, 0, w1, h1, -Ld.x * rs / sx1, -Ld.y * rs / sy1, w1, h1);
    xr.drawImage(lo1, 0, 0, w1, h1, -Ld.x * rs * 1.6 / sx1, -Ld.y * rs * 1.6 / sy1, w1, h1);
    xr.globalCompositeOperation = "destination-in";
    xr.drawImage(lo1, 0, 0);
    xr.globalCompositeOperation = "source-over";
    // inside the silhouette the rim replaces the fur colour (no clipping to white on pale coats);
    // a faint additive spill past the edge is the light scattering through the outer hairs
    const rk = Math.min(F.L.rim, 1.6) * (1 - lum(F.C.base) * 0.45);
    ga.globalCompositeOperation = "source-atop";
    ga.globalAlpha = clamp(0.5 * rk, 0, 0.85);
    ga.drawImage(rm, 0, 0, w1, h1, 0, 0, w, h);
    ga.globalCompositeOperation = "lighter";
    ga.globalAlpha = clamp(0.16 * rk);
    ga.drawImage(rm, 0, 0, w1, h1, 0, 0, w, h);
    ga.globalAlpha = 1;
  }
  // ---- the soft fur fringe: a blurred copy of the lit cat behind it ----
  const fz = poolCanvas("lo1b", w1, h1);
  fz._g.imageSmoothingQuality = "high";
  fz._g.drawImage(A, 0, 0, w, h, 0, 0, w1, h1);
  ga.globalCompositeOperation = "destination-over";
  ga.globalAlpha = F.ghost ? 0.9 : 0.85;
  ga.drawImage(fz, 0, 0, w1, h1, 0, 0, w, h);
  if (F.ghost) {
    const fz2 = poolCanvas("lo2b", w2, h2);
    fz2._g.drawImage(fz, 0, 0, w1, h1, 0, 0, w2, h2);
    ga.globalCompositeOperation = "lighter";
    ga.globalAlpha = 0.22;
    ga.drawImage(fz2, 0, 0, w2, h2, 0, 0, w, h);
  }
  ga.globalAlpha = 1;
  ga.globalCompositeOperation = "source-over";
  return { lo1, w1, h1 };
}

// ------------------------------------------------------------------------------------------------
export function drawCat(g, x, y, size, opts = {}) {
  if (!(size > 0)) return;
  const slot0 = SLOT;
  SLOT = CATN++ % CAT_SLOTS;
  try { drawCat0(g, x, y, size, opts); } finally { SLOT = slot0; }
}
function drawCat0(g, x, y, size, opts) {
  const o = Object.assign({ pose: "stand", facing: 1, collar: true, bell: true, shadow: true }, opts);
  o.facing = o.facing === -1 ? -1 : 1;
  const S = size / 60;
  const C = coatOf(o);
  const P = poseFor(o);
  o._P = P;
  const T = g.getTransform ? g.getTransform() : null;
  const dev = T ? Math.sqrt(Math.abs(T.a * T.d - T.b * T.c)) || 1 : 1;
  const px = size * dev; // device pixels at the shoulder
  // opts.lod forces a detail level (0 = no fur strokes; cheap for tiny/background cats)
  const lod = o.lod != null ? clamp(Math.round(o.lod), 0, 2) : px < 34 ? 0 : px < 90 ? 1 : 2;
  const { L, K } = lightRig(o, x, y, size);
  const layered = !!(T && typeof DOMMatrix !== "undefined" && lod > 0 && px >= 40 && !o.flat);
  const bl = o.backlit != null ? clamp(o.backlit) : clamp(L.rim * 0.45 * (L.y < 0.3 ? 1 : 0.4));
  const sheen = C.sheen == null ? 1 : C.sheen;
  const baseLum = lum(C.base);
  const F = {
    g, o, C, P, lod, layered, L, K, px,
    u1: 1 / (S * dev),
    lw: layered ? clamp(0.75 / (S * dev), 0.12, 0.8) : clamp(1.15 / S, 0.28, 0.85),
    backlit: bl,
    // shadow colours are always darker than the darkest fur on the coat (they are painted
    // source-atop, so a pale "shadow" would lift dark points / patches instead of shading them)
    aoCol: mix(lum(C.stripe) < lum(C.dark) && C.pattern !== "solid" ? C.stripe : C.dark, "#000000", 0.62),
    shCol: mix(mix(lum(C.stripe) < lum(C.dark) && C.pattern !== "solid" ? C.stripe : C.dark, "#000000", 0.55), o.fill || "#1a0d06", o.fill ? 0.45 : 0.2),
    hiCol: mix(mix(C.light, "#ffffff", 0.15), K.color, 0.45),
    rimCol: mix(L.color, mix(C.light, "#ff8a50", 0.5), bl * 0.35),
    hiK: K.strength * clamp(baseLum * 2.2 * sheen, 0.25, 1.4),
    shadeK: clamp(0.66 * (0.6 + 0.4 * K.strength)),
    aoK: 0.42,
    ambient: o.ambient || null,
    ambientK: clamp(o.ambientK == null ? 0.22 : o.ambientK),
    ghost: !!C.ghost,
    furA: layered ? 0.72 * clamp((px - 36) / 110) * (o.wet > 0 ? 1 - clamp(o.wet) * 0.3 : 1) * clamp(0.55 + baseLum, 0.6, 1.1) : 0,
  };
  F.H = headModel(P, o, C);

  g.save();
  if (o.alpha != null) g.globalAlpha *= clamp(o.alpha);
  g.translate(x, y);
  g.scale(o.facing * S, S);
  if (o.shadow) contactShadow(g, P, o);

  if (!layered) {
    F.Kd = K;
    paintCatPhase1(F);
    paintCatPhase2(F);
    g.restore();
    return;
  }
  // ---- the layered photographic path ----
  const M = g.getTransform();
  const lb = catBounds(P, o);
  let dx0 = 1e9, dy0 = 1e9, dx1 = -1e9, dy1 = -1e9;
  for (const [lx, ly] of [[lb[0], lb[1]], [lb[2], lb[1]], [lb[0], lb[3]], [lb[2], lb[3]]]) {
    const X = M.a * lx + M.c * ly + M.e, Y = M.b * lx + M.d * ly + M.f;
    dx0 = Math.min(dx0, X); dy0 = Math.min(dy0, Y); dx1 = Math.max(dx1, X); dy1 = Math.max(dy1, Y);
  }
  const cw = g.canvas ? g.canvas.width : 4096, ch = g.canvas ? g.canvas.height : 4096;
  const pad = Math.ceil(px * 0.06) + 4;
  dx0 = Math.max(-pad, Math.floor(dx0) - pad); dy0 = Math.max(-pad, Math.floor(dy0) - pad);
  dx1 = Math.min(cw + pad, Math.ceil(dx1) + pad); dy1 = Math.min(ch + pad, Math.ceil(dy1) + pad);
  const w = dx1 - dx0, h = dy1 - dy0;
  if (w <= 2 || h <= 2 || w * h > 16e6) { g.restore(); return; }
  const A = poolCanvas("A", w, h);
  const ga = A._g;
  ga.setTransform(M.a, M.b, M.c, M.d, M.e - dx0, M.f - dy0);
  // light directions in device space (for the silhouette passes)
  const dirDev = (v) => { const X = M.a * v.x + M.c * v.y, Y = M.b * v.x + M.d * v.y; const l = Math.hypot(X, Y) || 1; return { x: X / l, y: Y / l }; };
  F.Kd = dirDev(K);
  F.Ld = dirDev(L);
  F.g = ga;
  // the fur texture: strands ~4.5% of the shoulder height, a 64 px mip when minified
  const dpt = Math.min(1.3, px / 330); // device px per texture px at level 0
  const lvl = dpt < 0.6 ? 1 : 0;
  const tile = furTile(lvl);
  F.furPat = ga.createPattern(tile, "repeat");
  F.furK = (dpt * (lvl ? 2 : 1)) / (S * dev);
  paintCatPhase1(F);
  ga.save();
  const LP = lightPasses(F, A, w, h);
  ga.restore();
  ga.setTransform(M.a, M.b, M.c, M.d, M.e - dx0, M.f - dy0);
  paintCatPhase2(F);
  ga.setTransform(1, 0, 0, 1, 0, 0);
  // cast shadow from the key light: the silhouette laid flat on the ground, soft
  const castK = o.castShadow != null ? clamp(o.castShadow) : (o.light || o.key) && o.shadow ? 0.5 : 0;
  const keyW = o.key || o.light;
  g.restore();
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (castK > 0 && keyW) {
    const gx = M.e, gy = M.f; // device ground point (x, y)
    const lwx = T.a * keyW.x + T.c * keyW.y + T.e, lwy = T.b * keyW.x + T.d * keyW.y + T.f;
    const hy = gy - lwy;
    if (hy > 4) {
      const s = clamp((gx - lwx) / hy, -1.6, 1.6);
      const flat = 0.16;
      const shc = poolCanvas("cast", LP.w1, LP.h1);
      const xs = shc._g;
      xs.drawImage(LP.lo1, 0, 0);
      xs.globalCompositeOperation = "source-in";
      xs.fillStyle = o.ground || "#000000";
      xs.fillRect(0, 0, LP.w1, LP.h1);
      xs.globalCompositeOperation = "source-over";
      g.globalAlpha *= (o.alpha != null ? clamp(o.alpha) : 1) * 0.42 * castK * clamp(K.strength, 0.3, 1.2);
      // (X, Y) -> (X + s * (gy - Y), gy + flat * (gy - Y))
      g.setTransform(1, 0, -s, -flat, s * gy, gy + flat * gy);
      g.drawImage(shc, 0, 0, LP.w1, LP.h1, dx0, dy0, w, h);
    }
  }
  g.restore();
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (o.alpha != null) g.globalAlpha *= clamp(o.alpha);
  g.drawImage(A, 0, 0, w, h, dx0, dy0, w, h);
  g.restore();
}
