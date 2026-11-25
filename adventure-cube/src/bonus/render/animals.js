// render/animals.js - painted, multi-part animated animals (BONUS_RENDER). DOM (bake) + per-frame transforms.
// Each kind has baked parts (torso, neck+head, tail; white silhouettes for hurt flashes) and vector legs with knees,
// driven by a gait phase from the distance travelled: walk / trot / gallop, rabbit hops, flutter, swim. Idle animals
// breathe, graze, flick ears and swish tails; telegraph poses on windup (boar paws, bear rears, wolf crouches).
// No gore ever: death is a soft puff (fx) and the logic's drops.
import { bake, blit, silhouette, rng, mix, shade, lg, rg, ell, poly, TAU, shadowSprite } from "./kit.js";

const S = 3; // bake scale

// fur strokes inside an ellipse
function fur(g, cx, cy, rx, ry, col, n, len, r, ang = 0) {
  g.strokeStyle = col; g.lineWidth = 0.55;
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 0.92, x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(ang) * len * (0.6 + r() * 0.6), y - Math.sin(ang) * len * 0.5 + (r() - 0.5) * 0.8); g.stroke();
  }
}
// shaded body ellipse (lit top-left, counter-shaded belly, dark underside)
function bodyBlob(g, cx, cy, rx, ry, C, r, extra) {
  g.fillStyle = lg(g, 0, cy - ry, 0, cy + ry, [[0, C.light], [0.45, C.base], [0.8, shade(C.base, 0.85)], [1, C.dark]]);
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); if (extra) extra(g); g.fill();
  if (C.belly) { g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.clip(); ell(g, cx + rx * 0.1, cy + ry * 0.95, rx * 0.75, ry * 0.42, C.belly); g.restore(); }
  fur(g, cx, cy, rx, ry, "rgba(255,240,220,0.22)", 50, 2.6, r);
  fur(g, cx, cy, rx, ry, "rgba(30,15,5,0.25)", 40, 2.4, r);
  g.fillStyle = rg(g, cx - rx * 0.3, cy - ry * 0.5, 0, rx * 0.7, [[0, "rgba(255,250,235,0.28)"], [1, "rgba(255,250,235,0)"]]);
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill();
}
const eye = (g, x, y, s = 1.2) => { ell(g, x, y, s, s, "#120a06"); ell(g, x - s * 0.35, y - s * 0.35, s * 0.35, s * 0.35, "rgba(255,255,255,0.9)"); };

// ------------------------------------------------------------------------------------------------ rigs
// body = torso center (feet at y = 0), neck = head pivot, tail = tail root; legs: x of front/hind, top y, upper/lower
// length, widths [upper, lower], hoof color; stride = px per gait cycle; colors.
const RIG = {
  deer: {
    body: [0, -25], neck: [12, -27], tail: [-15, -29], stride: 34, bob: 1.6,
    legs: { front: 10, hind: -11, top: -20, up: 10, lo: 11, w: [3.6, 2.0], hoof: "#2a1a10", col: "#8a5e32" },
    C: { base: "#a0703e", dark: "#5e3e1e", light: "#c9955a", belly: "#efe2cc" },
    torso(g, C, r) { bodyBlob(g, 0, 0, 17, 8.5, C, r); ell(g, -13, -2, 5, 5.5, "rgba(240,228,205,0.85)"); },
    head(g, C, r, v) {
      g.fillStyle = lg(g, 0, -14, 6, 4, [[0, C.light], [1, C.base]]); poly(g, [-4, 4, 4, 4, 9, -11, 4, -13], g.fillStyle);
      g.fillStyle = "rgba(255,240,220,0.7)"; poly(g, [2, 2, 4, 3, 8, -9, 6, -10], g.fillStyle);
      g.fillStyle = lg(g, 4, -16, 18, -9, [[0, C.light], [1, shade(C.base, 0.85)]]);
      g.beginPath(); g.moveTo(3, -13); g.quadraticCurveTo(8, -18, 13, -15); g.quadraticCurveTo(18, -12, 19, -10.5); g.quadraticCurveTo(15, -8.5, 9, -9); g.quadraticCurveTo(4, -9.5, 3, -13); g.fill();
      ell(g, 18.6, -10.6, 1.5, 1.2, "#1a120c"); ell(g, 14, -9.6, 3, 1, "rgba(255,245,230,0.7)");
      eye(g, 10, -14.2, 1.15);
      g.fillStyle = C.base; g.beginPath(); g.moveTo(5, -15); g.quadraticCurveTo(0, -22, -2, -20); g.quadraticCurveTo(1, -16, 4, -13.5); g.fill();
      ell(g, 1.5, -18, 1.2, 2.6, "#e9cdb8", 0.6);
      if (v % 2 === 0) { // antlers
        g.strokeStyle = "#e2cfa8"; g.lineWidth = 1.3;
        g.beginPath(); g.moveTo(7, -16); g.quadraticCurveTo(4, -24, 9, -31); g.moveTo(6, -21); g.lineTo(11, -24); g.moveTo(7, -26); g.lineTo(3, -29); g.moveTo(8, -29); g.lineTo(13, -31); g.stroke();
        g.strokeStyle = "#a88c66"; g.lineWidth = 0.6; g.beginPath(); g.moveTo(7.6, -16); g.quadraticCurveTo(4.6, -24, 9.6, -31); g.stroke();
      }
    },
    tail(g, C) { ell(g, -1, 2, 2.4, 4, C.base, 0.4); ell(g, -1.4, 3, 1.4, 3, "#f6efe2", 0.4); },
  },
  goat: {
    body: [0, -19], neck: [10, -21], tail: [-13, -23], stride: 26, bob: 1.2,
    legs: { front: 8, hind: -9, top: -14, up: 7, lo: 7.5, w: [3.6, 2.4], hoof: "#3a3028", col: "#cfc6b4" },
    C: { base: "#ddd6c8", dark: "#8c8272", light: "#f6f2ea", belly: "#c8bfae" },
    torso(g, C, r) {
      bodyBlob(g, 0, 0, 14, 8.5, C, r);
      g.strokeStyle = "rgba(140,130,110,0.5)"; g.lineWidth = 0.8; for (let i = 0; i < 12; i++) { const x = -12 + i * 2.2; g.beginPath(); g.moveTo(x, 5); g.quadraticCurveTo(x + 1, 9, x - 0.5, 11); g.stroke(); }
    },
    head(g, C, r, v) {
      g.fillStyle = C.base; poly(g, [-4, 4, 4, 3, 8, -8, 3, -10], C.base);
      g.fillStyle = lg(g, 3, -14, 14, -4, [[0, C.light], [1, shade(C.base, 0.85)]]);
      g.beginPath(); g.moveTo(2, -10); g.quadraticCurveTo(7, -15, 11, -11); g.quadraticCurveTo(15, -7, 14, -4.5); g.quadraticCurveTo(10, -4, 7, -5); g.quadraticCurveTo(3, -6, 2, -10); g.fill();
      ell(g, 13.6, -5, 1.2, 1, "#5a4a40");
      g.fillStyle = "#b8ae9c"; g.beginPath(); g.moveTo(10, -4.5); g.quadraticCurveTo(10, 1, 8, 2.5); g.quadraticCurveTo(8.5, -2, 8, -5); g.fill(); // beard
      eye(g, 8, -10.6, 1.05); g.fillStyle = "#c8a040"; g.fillRect(7.5, -10.9, 1, 0.6);
      ell(g, 2, -11, 3, 1.3, C.base, 0.5);
      g.strokeStyle = "#6e6250"; g.lineWidth = 2; g.beginPath(); g.moveTo(5, -13); g.quadraticCurveTo(1, -21, -5, -17); g.stroke();
      g.strokeStyle = "#a89a80"; g.lineWidth = 0.7; g.beginPath(); g.moveTo(4.6, -13.4); g.quadraticCurveTo(1, -20.4, -4.6, -17.6); g.stroke();
    },
    tail(g, C) { ell(g, 0, -1, 2, 3.2, C.base, -0.8); },
  },
  boar: {
    body: [-1, -16], neck: [11, -17], tail: [-17, -19], stride: 24, bob: 1.4,
    legs: { front: 9, hind: -10, top: -9, up: 4.8, lo: 5, w: [4.4, 2.8], hoof: "#1a120c", col: "#3a2c22" },
    C: { base: "#5a4636", dark: "#2a1e16", light: "#7a6450", belly: "#6e5a48" },
    torso(g, C, r) {
      bodyBlob(g, 0, 0, 16, 10, C, r);
      ell(g, 8, -3, 9, 9, C.base); bodyBlob(g, 8, -3, 9, 9, C, r);
      g.strokeStyle = "#1e1510"; g.lineWidth = 1; for (let i = 0; i < 16; i++) { const x = -6 + i * 1.3; g.beginPath(); g.moveTo(x, -9 - Math.sin(i / 16 * Math.PI) * 2); g.lineTo(x - 1, -13 - Math.sin(i / 16 * Math.PI) * 2.5); g.stroke(); }
    },
    head(g, C, r) {
      g.fillStyle = lg(g, 0, -8, 0, 8, [[0, C.light], [1, C.dark]]);
      g.beginPath(); g.moveTo(-4, -8); g.quadraticCurveTo(6, -10, 12, -3); g.lineTo(15, 2); g.quadraticCurveTo(10, 6, 2, 6); g.quadraticCurveTo(-4, 6, -4, -8); g.fill();
      ell(g, 15.2, 1.6, 1.6, 2.4, "#c8a08a"); ell(g, 15.6, 1.2, 0.5, 0.7, "#3a2020"); ell(g, 15.6, 2.4, 0.5, 0.7, "#3a2020");
      g.strokeStyle = "#f2ead6"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(11, 3); g.quadraticCurveTo(13, 0, 12, -2.5); g.stroke();
      eye(g, 6, -3.2, 0.95);
      poly(g, [0, -7, -1, -13, 3, -8], C.dark); poly(g, [0.5, -8, 0, -11.5, 2, -8.5], "#8a6a58");
    },
    tail(g, C) { g.strokeStyle = C.dark; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-3, 2, -2.5, 6); g.stroke(); ell(g, -2.5, 7, 1.2, 1.8, C.dark); },
  },
  wolf: {
    body: [0, -15], neck: [11, -17], tail: [-14, -17], stride: 30, bob: 1.3,
    legs: { front: 10, hind: -11, top: -11, up: 5.8, lo: 6, w: [3.4, 2.2], hoof: "#2a2a2e", col: "#5e6066" },
    C: { base: "#7d7f86", dark: "#3e4046", light: "#b4b6ba", belly: "#d6d2c8" },
    torso(g, C, r) { bodyBlob(g, 0, 0, 15, 6.8, C, r); ell(g, 7, -2, 7, 7, C.base); bodyBlob(g, 7, -1.5, 7.5, 7, C, r); g.fillStyle = "rgba(40,40,46,0.35)"; g.beginPath(); g.ellipse(-2, -5, 12, 2.4, 0, 0, TAU); g.fill(); },
    head(g, C, r) {
      g.fillStyle = C.base; poly(g, [-4, 4, 3, 4, 7, -6, 1, -8], C.base);
      ell(g, 2, 1, 4, 3, C.belly);
      g.fillStyle = lg(g, 0, -12, 0, -2, [[0, C.light], [1, C.base]]);
      g.beginPath(); g.moveTo(1, -8); g.quadraticCurveTo(6, -12, 10, -8); g.lineTo(17, -6); g.quadraticCurveTo(17.5, -4, 16, -3.5); g.lineTo(9, -3); g.quadraticCurveTo(3, -2, 1, -8); g.fill();
      ell(g, 16.8, -5.4, 1.1, 0.9, "#111"); g.strokeStyle = "#2a2a2e"; g.lineWidth = 0.6; g.beginPath(); g.moveTo(10, -3.4); g.lineTo(15.5, -3.6); g.stroke();
      ell(g, 11, -4, 3.5, 1.2, C.belly);
      eye(g, 7.6, -8, 0.95); g.fillStyle = "#e8b838"; g.fillRect(7.1, -8.3, 0.9, 0.5);
      poly(g, [3, -9, 3, -15, 6.5, -10], C.dark); poly(g, [3.6, -10, 3.6, -13.4, 5.6, -10.4], "#c8a890");
    },
    tail(g, C) {
      g.fillStyle = lg(g, 0, 0, -12, 8, [[0, C.base], [0.7, C.dark], [1, "#1e1e22"]]);
      g.beginPath(); g.moveTo(1, -1.5); g.quadraticCurveTo(-8, 0, -12, 9); g.quadraticCurveTo(-9, 10, -6, 6); g.quadraticCurveTo(-2, 3, 1, 2); g.fill();
    },
  },
  bear: {
    body: [0, -24], neck: [18, -26], tail: [-24, -26], stride: 38, bob: 2,
    legs: { front: 15, hind: -16, top: -15, up: 7.6, lo: 7.8, w: [8, 6], hoof: "#1e140c", col: "#4a301c" },
    C: { base: "#6a4628", dark: "#2e1c0e", light: "#94683e", belly: "#5a3a20" },
    torso(g, C, r) {
      bodyBlob(g, 0, 0, 24, 14, C, r);
      bodyBlob(g, 10, -5, 13, 12, C, r);
      fur(g, 0, 0, 24, 14, "rgba(255,220,170,0.18)", 80, 3.6, r);
    },
    head(g, C, r) {
      g.fillStyle = C.base; poly(g, [-6, 8, 6, 8, 10, -4, -2, -8], C.base);
      g.fillStyle = rg(g, 6, -5, 1, 10, [[0, C.light], [1, C.base]]);
      g.beginPath(); g.arc(6, -4, 8, 0, TAU); g.fill();
      g.fillStyle = shade(C.base, 1.15); g.beginPath(); g.moveTo(10, -6); g.quadraticCurveTo(17, -4, 17, 0); g.quadraticCurveTo(12, 3, 8, 1); g.fill();
      ell(g, 16.6, -1, 1.6, 1.3, "#140c08");
      eye(g, 8.6, -6.6, 1.1);
      ell(g, 2, -11, 3, 3, C.base); ell(g, 2, -11, 1.6, 1.6, "#3e2614");
    },
    tail(g, C) { ell(g, 0, 0, 2.6, 2.2, C.dark); },
  },
};
// mouth-open overlays per kind (attack / roar), drawn in head-local space
function mouthOpen(ctx, kind) {
  ctx.fillStyle = "#3a0e0e";
  if (kind === "wolf") { ctx.beginPath(); ctx.moveTo(10, -3.4); ctx.lineTo(16, -3.5); ctx.lineTo(12, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillRect(13, -3.4, 0.8, 1.2); }
  else if (kind === "bear") { ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(16, 1); ctx.lineTo(10, 5); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillRect(14, 1, 1, 1.4); ctx.fillRect(11, 1, 1, 1.4); }
  else if (kind === "boar") { ctx.beginPath(); ctx.moveTo(8, 4); ctx.lineTo(14, 3.5); ctx.lineTo(9, 6.5); ctx.closePath(); ctx.fill(); }
}

function bakeRig(kind, v) {
  const R = RIG[kind], r = rng(500 + v * 97 + kind.length * 13), C = R.C;
  const torso = bake(R.body[0] ? 80 : 80, 50, S, (g) => { g.translate(40, 25); R.torso(g, C, r); }, 40, 25);
  const head = bake(60, 60, S, (g) => { g.translate(20, 40); R.head(g, C, r, v); }, 20, 40);
  const tail = bake(30, 30, S, (g) => { g.translate(15, 12); R.tail(g, C, r); }, 15, 12);
  return { torso, head, tail, wTorso: silhouette(torso), wHead: silhouette(head), wTail: silhouette(tail) };
}

// ---- small animals (single baked bodies + per-frame limbs)
function bakeRabbit(v) {
  const r = rng(71 + v), C = { base: v % 2 ? "#9a8a72" : "#b9a58a", dark: "#5e5040", light: "#d8c8ae", belly: "#ece2d0" };
  const body = bake(40, 30, S, (g) => {
    g.translate(20, 22);
    bodyBlob(g, 0, -6, 7.5, 5.5, C, r);
    bodyBlob(g, -3.5, -5, 5.2, 5, C, r);
    ell(g, -9, -7, 2.8, 2.6, "#f8f4ec");
    bodyBlob(g, 6, -10, 3.8, 3.4, C, r);
    ell(g, 9.4, -9.4, 0.8, 0.6, "#5a3a36"); eye(g, 7, -11, 0.85);
    ell(g, 4.5, -8, 1.6, 1.2, C.belly);
  }, 20, 22);
  const ear = bake(12, 20, S, (g) => { g.translate(6, 18); ell(g, 0, -8, 1.9, 8, C.base, 0); ell(g, 0.3, -8, 0.9, 6.5, "#e8c4b4", 0); }, 6, 18);
  return { body, ear, wBody: silhouette(body), wEar: silhouette(ear), C };
}
function bakePheasant(v) {
  const r = rng(91 + v);
  const body = bake(50, 34, S, (g) => {
    g.translate(30, 26);
    g.fillStyle = lg(g, -6, -12, -22, -20, [[0, "#9a5a2a"], [1, "#4a2a12"]]);
    g.beginPath(); g.moveTo(-4, -10); g.quadraticCurveTo(-14, -16, -24, -21); g.lineTo(-23, -18.5); g.quadraticCurveTo(-14, -12, -4, -7); g.fill();
    g.strokeStyle = "rgba(30,15,5,0.6)"; g.lineWidth = 0.4; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(-6 - i * 2.2, -9.5 - i * 1.3); g.lineTo(-6.5 - i * 2.2, -8 - i * 1.3); g.stroke(); }
    bodyBlob(g, 0, -9, 7.5, 5.2, { base: "#b0642c", dark: "#5a2e12", light: "#e0944c", belly: "#8a4a20" }, r);
    for (let i = 0; i < 18; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.85; ell(g, Math.cos(a) * 7 * d, -9 + Math.sin(a) * 4.8 * d, 0.7, 0.5, i % 2 ? "#2a1408" : "#f2d8a0"); }
    g.fillStyle = lg(g, 4, -16, 8, -10, [[0, "#3a8a6a"], [1, "#1a3a5a"]]); g.beginPath(); g.moveTo(3, -10); g.quadraticCurveTo(5, -16, 7.5, -17); g.lineTo(9, -15); g.quadraticCurveTo(7, -12, 7, -9); g.fill();
    g.strokeStyle = "#f4f1ea"; g.lineWidth = 1; g.beginPath(); g.moveTo(4, -11); g.lineTo(7.6, -11.6); g.stroke();
    ell(g, 8.4, -17, 2.4, 2.1, "#2a4a5a"); ell(g, 8.8, -16.6, 1.3, 1.5, "#d8282a");
    poly(g, [10.4, -17.4, 12.6, -16.6, 10.4, -16.2], "#e8d8a0");
    eye(g, 8.8, -17.6, 0.6);
  }, 30, 26);
  const wing = bake(20, 14, S, (g) => { g.translate(4, 4); g.fillStyle = lg(g, 0, 0, 12, 8, [[0, "#c8844a"], [1, "#6a3a18"]]); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(10, -1, 14, 6); g.quadraticCurveTo(7, 7, 0, 3); g.fill(); g.strokeStyle = "rgba(40,20,8,0.6)"; g.lineWidth = 0.5; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(3 + i * 2.5, 1); g.lineTo(5 + i * 2.5, 5.5); g.stroke(); } }, 4, 4);
  return { body, wing, wBody: silhouette(body), wWing: silhouette(wing) };
}
function bakeFish(v) {
  const r = rng(131 + v);
  const body = bake(34, 16, S, (g) => {
    g.translate(18, 8);
    g.fillStyle = lg(g, 0, -4, 0, 4, [[0, "#5a6a3a"], [0.45, "#9aa880"], [0.55, "#d8a0a0"], [0.7, "#e8e4d8"], [1, "#c8c4b8"]]);
    g.beginPath(); g.moveTo(-9, 0); g.quadraticCurveTo(-4, -5, 4, -4.4); g.quadraticCurveTo(10, -3, 11, 0); g.quadraticCurveTo(10, 3, 4, 3.8); g.quadraticCurveTo(-4, 4.4, -9, 0); g.fill();
    for (let i = 0; i < 14; i++) ell(g, -6 + r() * 14, -3 + r() * 3.5, 0.5, 0.5, "#2a2a1a");
    poly(g, [-1, -4, 2, -7, 4, -4.2], "#6a7a4a");
    eye(g, 7.6, -0.8, 0.8); g.strokeStyle = "rgba(40,30,20,0.4)"; g.lineWidth = 0.5; g.beginPath(); g.moveTo(5.5, -2.5); g.quadraticCurveTo(6.5, 0, 5.5, 2.5); g.stroke();
  }, 18, 8);
  return { body, wBody: silhouette(body) };
}

// ------------------------------------------------------------------------------------------------ drawer
export function createAnimals(fx, FXK) {
  const rigs = new Map(), small = new Map();
  const st = new Map();  // id -> anim state
  const sh = shadowSprite();
  const getRig = (kind, seed) => { const v = (seed >>> 0) % 2, k = kind + v; let R = rigs.get(k); if (!R) { R = bakeRig(kind, v); rigs.set(k, R); } return R; };
  const getSmall = (kind, seed) => { const v = (seed >>> 0) % 2, k = kind + v; let R = small.get(k); if (!R) { R = kind === "rabbit" ? bakeRabbit(v) : kind === "pheasant" ? bakePheasant(v) : bakeFish(v); small.set(k, R); } return R; };
  const eyes = []; // wolf eye glints for the glow pass: x, y pairs

  function stateOf(a) {
    let s = st.get(a.id);
    if (!s) { s = { ph: Math.random() * TAU, lx: a.x, speed: 0, graze: 0, grazeT: 2 + Math.random() * 5, atkT: 0, ear: 0, seen: 0, rear: 0, crouch: 0, flap: 0 }; st.set(a.id, s); }
    return s;
  }
  function onAttack(a) { const s = st.get(a.id); if (s) s.atkT = 0.35; }
  function onDie(a, x, y, kind) {
    st.delete(a.id);
    const big = kind === "bear" ? 1.8 : kind === "deer" || kind === "boar" || kind === "wolf" || kind === "goat" ? 1.2 : 0.7;
    for (let i = 0; i < 14 * big; i++) fx.emit(FXK.puff, x + (Math.random() - 0.5) * 24 * big, y + (Math.random() - 0.5) * 16 * big, (Math.random() - 0.5) * 90, -30 - Math.random() * 60, 0.9 + Math.random() * 0.5, 22 * big + Math.random() * 16, Math.random() < 0.5 ? 0 : 1);
    for (let i = 0; i < 6 * big; i++) fx.emit(kind === "pheasant" ? FXK.feather : FXK.leaf, x, y - 6, (Math.random() - 0.5) * 160, -60 - Math.random() * 120, 2.2, kind === "pheasant" ? 9 : 7, (Math.random() * 6) | 0);
    for (let i = 0; i < 5; i++) fx.emit(FXK.sparkle, x + (Math.random() - 0.5) * 30, y - Math.random() * 20, 0, -20, 0.8, 10, 0);
  }

  function drawQuad(ctx, a, R, s, x, y, t, flash) {
    const K = RIG[a.kind], Lg = K.legs, P = getRig(a.kind, a.seed | 0);
    const sp = s.speed, gallop = sp > 2.2, moving = sp > 0.15;
    const ph = s.ph;
    let bob = moving ? -Math.abs(Math.sin(ph)) * K.bob * (gallop ? 1.8 : 1) : 0, pitch = gallop ? Math.sin(ph) * 0.07 : 0;
    let headA = 0, crouch = s.crouch, rear = s.rear;
    const breath = moving ? 0 : Math.sin(t * 2.2 + (a.seed | 0)) * 0.022;
    if (!moving && s.graze > 0) headA = 0.95 * s.graze;
    if (a.state === "windup" && a.kind === "boar") { headA = 0.35; bob = Math.sin(t * 30) * 0.6; }
    if (gallop && (a.kind === "boar" || a.kind === "goat")) headA = Math.max(headA, 0.3);
    if (s.atkT > 0) headA = a.kind === "goat" || a.kind === "boar" ? 0.55 : -0.15;
    const legA = (off, front) => {
      if (!moving) return { u: 0, l: 0 };
      const amp = gallop ? 0.75 : 0.42, p = ph + off;
      const u = Math.sin(p) * amp;
      const bend = Math.max(0, front ? -Math.cos(p) : Math.cos(p)) * (gallop ? 1.1 : 0.7);
      return { u, l: front ? u - bend : u + bend };
    };
    ctx.save();
    ctx.translate(x, y);
    if (a.facing < 0) ctx.scale(-1, 1);
    if (rear > 0) { ctx.translate(Lg.hind, 0); ctx.rotate(-rear * 0.85); ctx.translate(-Lg.hind, 0); }
    ctx.translate(0, bob + crouch * 4);
    ctx.rotate(pitch);
    const legCol = flash ? "#ffffff" : shade(Lg.col, 0.72), legNear = flash ? "#ffffff" : Lg.col;
    const off = gallop ? [0, 0.35, Math.PI * 0.8, Math.PI * 0.8 + 0.35] : [0, Math.PI, Math.PI, 0]; // hindNear, hindFar, frontNear, frontFar
    const leg = (lx, a2, col, front) => {
      const kneeX = lx + Math.sin(a2.u) * Lg.up, kneeY = Lg.top + Math.cos(a2.u) * Lg.up + crouch * (front ? 2 : 1);
      const fx2 = kneeX + Math.sin(a2.l) * Lg.lo, fy2 = Math.min(-crouch * 3.5 + kneeY + Math.cos(a2.l) * Lg.lo, kneeY + Lg.lo) ;
      ctx.strokeStyle = col; ctx.lineCap = "round";
      ctx.lineWidth = Lg.w[0]; ctx.beginPath(); ctx.moveTo(lx, Lg.top - 3); ctx.lineTo(kneeX, kneeY); ctx.stroke();
      ctx.lineWidth = Lg.w[1]; ctx.beginPath(); ctx.moveTo(kneeX, kneeY); ctx.lineTo(fx2, fy2); ctx.stroke();
      ctx.fillStyle = flash ? "#fff" : Lg.hoof; ctx.beginPath(); ctx.ellipse(fx2 + 0.8, fy2 - 0.6, Lg.w[1] * 0.75, Lg.w[1] * 0.55, 0, 0, TAU); ctx.fill();
    };
    // windup paws (boar): near front leg scrapes
    let fNear = legA(off[2], true), fFar = legA(off[3], true);
    if (a.state === "windup" && a.kind === "boar") fNear = { u: 0.3 + Math.sin(t * 16) * 0.45, l: 0.1 + Math.sin(t * 16) * 0.6 };
    if (rear > 0) { fNear = { u: -1.1 * rear, l: -0.4 * rear }; fFar = { u: -0.8 * rear, l: -0.2 * rear }; }
    leg(Lg.hind + 1.5, legA(off[1], false), legCol, false);
    leg(Lg.front + 1.5, fFar, legCol, true);
    // tail
    const tailA = Math.sin(t * (moving ? 7 : 2.4) + (a.seed | 0)) * (a.kind === "wolf" ? 0.12 : 0.25) + (a.state === "flee" && a.kind === "deer" ? -0.9 : 0) + (a.kind === "wolf" && (a.state === "windup" || crouch > 0) ? 0.35 : 0);
    ctx.save(); ctx.translate(K.tail[0], K.tail[1]); ctx.rotate(tailA); blit(ctx, flash ? P.wTail : P.tail, 0, 0); ctx.restore();
    // torso (breathing)
    ctx.save(); ctx.translate(K.body[0], K.body[1]); ctx.scale(1, 1 + breath); blit(ctx, flash ? P.wTorso : P.torso, 0, 0); ctx.restore();
    // head
    ctx.save(); ctx.translate(K.neck[0], K.neck[1]); ctx.rotate(headA - (rear > 0 ? -rear * 0.5 : 0) + Math.sin(t * 1.3 + (a.seed | 0)) * 0.03);
    blit(ctx, flash ? P.wHead : P.head, 0, 0);
    if (!flash && (s.atkT > 0 || rear > 0.5)) mouthOpen(ctx, a.kind);
    if (a.kind === "wolf" && !flash) { const m = ctx.getTransform(); s.eye = [m.e, m.f, m.a, m.b, m.c, m.d]; }
    ctx.restore();
    leg(Lg.hind - 1, legA(off[0], false), legNear, false);
    leg(Lg.front - 1, fNear, legNear, true);
    ctx.restore();
  }

  function drawRabbit(ctx, a, s, x, y, t, flash) {
    const P = getSmall("rabbit", a.seed | 0), moving = s.speed > 0.2;
    const hop = moving ? Math.abs(Math.sin(s.ph)) : 0;
    ctx.save(); ctx.translate(x, y - hop * 6); if (a.facing < 0) ctx.scale(-1, 1);
    ctx.rotate(moving ? Math.cos(s.ph) * 0.15 * Math.sign(Math.sin(s.ph)) : 0);
    // hind feet / front paws
    ctx.fillStyle = flash ? "#fff" : P.C.dark;
    ctx.beginPath(); ctx.ellipse(-3 + (moving ? -hop * 3 : 0), -1, 4.5, 1.4, moving ? -hop * 0.5 : 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(5 + (moving ? hop * 3 : 0), -1, 1.6, 1.1, 0, 0, TAU); ctx.fill();
    const sc = moving ? 1 + hop * 0.12 : 1 + Math.sin(t * 3 + (a.seed | 0)) * 0.02;
    ctx.save(); ctx.scale(sc, 2 - sc); blit(ctx, flash ? P.wBody : P.body, 0, 0); ctx.restore();
    const earA = -0.35 + (moving ? -0.4 * hop : Math.sin(t * 0.9 + (a.seed | 0)) * 0.12) + (a.state === "flee" ? -0.5 : 0);
    for (const [ox, k] of [[4.6, 0.9], [6, 1]]) { ctx.save(); ctx.translate(ox, -12.5); ctx.rotate(earA * k); blit(ctx, flash ? P.wEar : P.ear, 0, 0); ctx.restore(); }
    // nibbling nose
    if (!moving && !flash) { ctx.fillStyle = "#d8a0a0"; ctx.fillRect(9.4, -9.6 + Math.sin(t * 18) * 0.25, 0.8, 0.8); }
    ctx.restore();
  }
  function drawPheasant(ctx, a, s, x, y, t, flash) {
    const P = getSmall("pheasant", a.seed | 0), moving = s.speed > 0.2, air = !a.grounded;
    ctx.save(); ctx.translate(x, y); if (a.facing < 0) ctx.scale(-1, 1);
    // legs
    const p = s.ph;
    ctx.strokeStyle = flash ? "#fff" : "#8a6a4a"; ctx.lineWidth = 1;
    for (const o of [0, Math.PI]) {
      const sw = moving && !air ? Math.sin(p + o) * 0.6 : air ? 0.8 : 0;
      ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(Math.sin(sw) * 3, -2.5); ctx.lineTo(Math.sin(sw) * 5 + 1, 0); ctx.stroke();
    }
    const peck = !moving && s.graze > 0 ? s.graze : 0;
    ctx.save(); ctx.rotate(peck * 0.5 + (moving ? Math.sin(p * 2) * 0.05 : 0)); blit(ctx, flash ? P.wBody : P.body, 0, 0);
    const wa = air ? Math.sin(t * 30) * 1.1 - 0.3 : 0.05;
    ctx.save(); ctx.translate(-1, -11); ctx.rotate(wa); blit(ctx, flash ? P.wWing : P.wing, 0, 0); ctx.restore();
    ctx.restore();
    ctx.restore();
  }
  function drawFish(ctx, a, s, x, y, t, flash) {
    const P = getSmall("fish", a.seed | 0), sw = Math.sin(t * (s.speed > 0.5 ? 16 : 6) + (a.seed | 0));
    ctx.save(); ctx.translate(x, y - 4); if (a.facing < 0) ctx.scale(-1, 1);
    ctx.rotate(Math.max(-0.4, Math.min(0.4, (a.vy || 0) * 0.15)));
    ctx.save(); ctx.translate(-8.5, 0); ctx.rotate(sw * 0.4);
    ctx.fillStyle = flash ? "#fff" : "#6a7a52"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-6, -4); ctx.quadraticCurveTo(-4.5, 0, -6, 4); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.rotate(sw * 0.05); blit(ctx, flash ? P.wBody : P.body, 0, 0);
    ctx.restore();
  }

  // draw all animals in view. alpha = interpolation; dt seconds.
  function draw(ctx, animals, alpha, t, dt, vx0, vx1, night) {
    eyes.length = 0;
    for (const a of animals) {
      const x = a.ox + (a.x - a.ox) * alpha + a.w / 2, y = a.oy + (a.y - a.oy) * alpha + a.h;
      if (x < vx0 - 80 || x > vx1 + 80) continue;
      const s = stateOf(a);
      const v = Math.abs(a.x - s.lx); s.lx = a.x;
      const speedNow = Math.min(8, v / Math.max(dt * 60, 0.3));
      s.speed += (speedNow - s.speed) * Math.min(1, dt * 10);
      const K = RIG[a.kind], stride = K ? K.stride : a.kind === "rabbit" ? 22 : a.kind === "pheasant" ? 12 : 20;
      s.ph += (v / stride) * TAU;
      // idle behaviours
      if (s.speed < 0.15 && (a.state === "idle" || a.state === "wander" || a.state === "graze") && a.grounded) {
        s.grazeT -= dt; if (s.grazeT < 0) { s.grazing = !s.grazing; s.grazeT = s.grazing ? 2 + Math.random() * 3 : 3 + Math.random() * 6; }
      } else s.grazing = false;
      s.graze += ((s.grazing ? 1 : 0) - s.graze) * Math.min(1, dt * 4);
      if (s.atkT > 0) s.atkT -= dt;
      const rearing = a.kind === "bear" && (a.state === "windup" || a.state === "rear");
      s.rear += ((rearing ? 1 : 0) - s.rear) * Math.min(1, dt * 6);
      const crouching = a.kind === "wolf" && (a.state === "windup" || a.state === "crouch" || a.state === "stalk");
      s.crouch += ((crouching ? 1 : 0) - s.crouch) * Math.min(1, dt * 8);
      // shadow
      if (a.kind !== "fish") ctx.drawImage(sh, x - a.w * 0.65, y - 5, a.w * 1.3, 10);
      const flashA = a.hurtT > 0 ? Math.min(1, a.hurtT / 8) * 0.85 : 0;
      for (let pass = 0; pass < (flashA > 0 ? 2 : 1); pass++) {
        const flash = pass === 1;
        if (flash) ctx.globalAlpha = flashA;
        if (RIG[a.kind]) drawQuad(ctx, a, RIG[a.kind], s, x, y, t, flash);
        else if (a.kind === "rabbit") drawRabbit(ctx, a, s, x, y, t, flash);
        else if (a.kind === "pheasant") drawPheasant(ctx, a, s, x, y, t, flash);
        else if (a.kind === "fish") drawFish(ctx, a, s, x, y, t, flash);
        else { ctx.fillStyle = "#a08060"; ctx.fillRect(x - a.w / 2, y - a.h, a.w, a.h); }
        ctx.globalAlpha = 1;
      }
      if (a.kind === "wolf" && s.eye && night > 0.3) eyes.push(s.eye);
      // boar windup dust
      if (a.state === "windup" && a.kind === "boar" && Math.random() < 0.3) fx.emit(FXK.dust, x + a.facing * 10, y - 2, -a.facing * 30, -20, 0.6, 14, 2);
      if (a.state === "charge" && Math.random() < 0.25) fx.emit(FXK.dust, x - a.facing * 12, y - 2, -a.facing * 20, -10, 0.5, 12, 2);
    }
    if (st.size > animals.length + 20) { const ids = new Set(animals.map((a) => a.id)); for (const k of st.keys()) if (!ids.has(k)) st.delete(k); }
  }
  // glowing wolf eyes at night (glow pass; device-space matrices captured during draw)
  function drawEyes(ctx, night) {
    if (!eyes.length) return;
    ctx.save();
    for (const m of eyes) {
      ctx.setTransform(m[2], m[3], m[4], m[5], m[0], m[1]);
      ctx.globalAlpha = Math.min(1, night);
      ctx.fillStyle = "rgba(255,220,120,0.95)"; ctx.beginPath(); ctx.arc(7.6, -8, 1.1, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,200,80,0.3)"; ctx.beginPath(); ctx.arc(7.6, -8, 3, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  return { draw, drawEyes, onAttack, onDie, warm(kinds) { for (const k of kinds) { if (RIG[k]) { getRig(k, 0); getRig(k, 1); } else if (k === "rabbit" || k === "pheasant" || k === "fish") { getSmall(k, 0); getSmall(k, 1); } } } };
}
