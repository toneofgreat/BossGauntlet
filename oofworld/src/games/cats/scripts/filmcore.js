// src/games/cats/scripts/filmcore.js - the maths, colour, canvas and path core of the film kit.
// Film modules never import this file directly: everything here is re-exported by filmkit.js.
//
// Pure Canvas 2D. No timers, no storage, no WebGL. Every painter is a pure function of its
// arguments (static art is cached by string key; caches never hold time-dependent state).
//
// LOGICAL vs DEVICE pixels: films always draw in a W x H logical space (960 x 540). The player
// may render into a bigger backing canvas (1280 x 720) by scaling the context; it tells the kit
// with setPixelScale(s) so offscreen layers and sprites are allocated at device resolution.

export const TAU = Math.PI * 2;

// ---- numbers ------------------------------------------------------------------------------------
function hashSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    let h = Math.floor(seed * 1000003) ^ 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Deterministic PRNG (mulberry32). rng(seed)() -> float in [0, 1).
export function rng(seed) {
  let a = hashSeed(seed);
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stateless hash of a number (and optional seed) -> [0, 1). Use for per-index randomness in
// painters that must stay pure functions of t.
export function hash(n, seed = 0) {
  const x = Math.sin(n * 127.1 + seed * 311.7 + 74.7) * 43758.5453123;
  return x - Math.floor(x);
}

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const seg = (t, a, b) => (b === a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));
export const ease = Object.freeze({
  in: (t) => { t = clamp(t); return t * t * t; },
  out: (t) => { t = clamp(t); return 1 - (1 - t) * (1 - t) * (1 - t); },
  inOut: (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  sine: (t) => { t = clamp(t); return 0.5 - 0.5 * Math.cos(Math.PI * t); },
  back: (t) => { t = clamp(t); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
});
// Fade envelope: 0 before a, ramps up over `inS`, holds, ramps down to 0 at b.
export function env(t, a, b, inS = 0.5, outS = inS) {
  if (t <= a || t >= b) return 0;
  return Math.min(smooth((t - a) / Math.max(1e-6, inS)), smooth((b - t) / Math.max(1e-6, outS)));
}
// 1D value noise in [-1, 1], smooth; fbm = 3 octaves.
export function noise(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i, seed), hash(i + 1, seed), u) * 2 - 1;
}
export function fbm(x, seed = 0) {
  return noise(x, seed) * 0.6 + noise(x * 2.03 + 11.3, seed + 1) * 0.28 + noise(x * 4.11 + 3.7, seed + 2) * 0.12;
}
// A deterministic flash curve: lightning at times [t0, t1, ...]; returns 0..1 brightness.
export function flash(t, times, len = 0.16) {
  let v = 0;
  for (const s of times || []) {
    if (t < s || t > s + len * 4) continue;
    const k = (t - s) / len;
    v = Math.max(v, k < 1 ? 1 - k * 0.35 : Math.exp(-(k - 1) * 2.2) * 0.65);
  }
  return clamp(v);
}

// ---- colour --------------------------------------------------------------------------------------
const COLOR_CACHE = new Map();
export function parseColor(c) {
  if (Array.isArray(c)) return [c[0], c[1], c[2], c[3] == null ? 1 : c[3]];
  const key = String(c);
  const hit = COLOR_CACHE.get(key);
  if (hit) return hit;
  let out = [0, 0, 0, 1];
  const s = key.trim();
  if (s[0] === "#") {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split("").map((x) => x + x).join("");
    const n = parseInt(h.slice(0, 6), 16);
    out = [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  } else {
    const m = /rgba?\(([^)]+)\)/i.exec(s);
    if (m) {
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      out = [p[0] || 0, p[1] || 0, p[2] || 0, p[3] == null ? 1 : p[3]];
    }
  }
  if (COLOR_CACHE.size > 2000) COLOR_CACHE.clear();
  COLOR_CACHE.set(key, out);
  return out;
}
const toCss = (r, g, b, a) => (a >= 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${Math.max(0, a).toFixed(3)})`);
// mix("#ff0000", "#0000ff", 0.5) -> "rgb(127,0,127)"
export function mix(a, b, t) {
  const A = parseColor(a);
  const B = parseColor(b);
  t = clamp(t);
  return toCss(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t), lerp(A[3], B[3], t));
}
// rgba("#ffb347", 0.4) -> "rgba(255,179,71,0.400)"
export function rgba(c, a) {
  const A = parseColor(c);
  return toCss(A[0], A[1], A[2], clamp(a * A[3]));
}
// shade(c, +0.3) lightens toward white, shade(c, -0.3) darkens toward black.
export function shade(c, amt) {
  return amt >= 0 ? mix(c, "#ffffff", amt) : mix(c, "#000000", -amt);
}
// Atmospheric perspective: pull a colour toward the haze colour by `amt`.
export const haze = (c, hazeColor, amt) => mix(c, hazeColor, amt);

// ---- canvases --------------------------------------------------------------------------------------
let PX = 1;
export function setPixelScale(s) { PX = Number.isFinite(s) && s > 0 ? s : 1; }
export function pixelScale() { return PX; }

export function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

let HAS_FILTER = null;
export function hasFilter() {
  if (HAS_FILTER === null) {
    try {
      const g = makeCanvas(2, 2).getContext("2d");
      HAS_FILTER = !!g && typeof g.filter === "string";
      if (HAS_FILTER) { g.filter = "blur(1px)"; HAS_FILTER = g.filter === "blur(1px)"; }
    } catch { HAS_FILTER = false; }
  }
  return HAS_FILTER;
}

const LAYERS = new Map();
const STATS = { layerMiss: 0, spriteMiss: 0, spriteKeys: [] };
// cacheStats() -> cache sizes and miss counters (debug aid: a miss on every frame means a cache key varies with t)
export function cacheStats() { return { layers: LAYERS.size, sprites: SPRITES.size, layerMiss: STATS.layerMiss, spriteMiss: STATS.spriteMiss, recent: STATS.spriteKeys.slice(-8) }; }
// layer(W, H, key) -> { canvas, g, W, H }: a reusable offscreen canvas at device resolution,
// CLEARED, with its context already scaled so you draw in the same logical W x H units.
export function layer(W, H, key = "main") {
  const k = key + "@" + PX;
  let L = LAYERS.get(k);
  const pw = Math.ceil(W * PX);
  const ph = Math.ceil(H * PX);
  if (!L) {
    STATS.layerMiss++;
    if (LAYERS.size > 48) LAYERS.clear();
    const canvas = makeCanvas(pw, ph);
    L = { canvas, g: canvas.getContext("2d"), W, H };
    LAYERS.set(k, L);
  }
  if (L.canvas.width !== pw || L.canvas.height !== ph) { L.canvas.width = pw; L.canvas.height = ph; }
  L.W = W;
  L.H = H;
  const g = L.g;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  g.filter = "none";
  g.clearRect(0, 0, pw, ph);
  g.setTransform(PX, 0, 0, PX, 0, 0);
  return L;
}

const SPRITES = new Map();
// sprite(key, w, h, paint) -> canvas painted ONCE by paint(g, w, h) in logical units and cached.
// Draw it with g.drawImage(c, x, y, w, h). Use for static art (trees, houses, cloud puffs).
export function sprite(key, w, h, paint) {
  const k = key + "@" + PX + ":" + Math.round(w) + "x" + Math.round(h);
  let c = SPRITES.get(k);
  if (c) return c;
  STATS.spriteMiss++;
  STATS.spriteKeys.push(k);
  if (STATS.spriteKeys.length > 32) STATS.spriteKeys.splice(0, 16);
  if (SPRITES.size > 400) SPRITES.clear();
  c = makeCanvas(w * PX, h * PX);
  const g = c.getContext("2d");
  g.setTransform(PX, 0, 0, PX, 0, 0);
  try { paint(g, w, h); } catch (err) { console.warn("[filmkit] sprite paint failed", key, err); }
  c.lw = w;
  c.lh = h;
  SPRITES.set(k, c);
  return c;
}
export function clearCaches() { LAYERS.clear(); SPRITES.clear(); }

// A soft radial glow sprite (white core -> transparent) tinted `color`. Cheap to stamp many.
export function glowSprite(color, hard = 0) {
  return sprite("glow:" + color + ":" + hard, 64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(color, 1));
    gr.addColorStop(clamp(0.12 + hard * 0.5), rgba(color, 0.55 + hard * 0.3));
    gr.addColorStop(0.45, rgba(color, 0.16));
    gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}
// Stamp a glow of radius r at (x, y) with additive blending.
export function glow(g, x, y, r, color, alpha = 1, mode = "lighter") {
  if (alpha <= 0.002 || r <= 0) return;
  const s = glowSprite(color);
  const prevA = g.globalAlpha;
  const prevM = g.globalCompositeOperation;
  g.globalCompositeOperation = mode;
  g.globalAlpha = prevA * clamp(alpha);
  g.drawImage(s, x - r, y - r, r * 2, r * 2);
  g.globalAlpha = prevA;
  g.globalCompositeOperation = prevM;
}

// ---- paths ---------------------------------------------------------------------------------------
// Signed area of a flat point list (> 0 = clockwise on screen, the winding canvas arcs use).
export function area(pts) {
  let a = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
  }
  return a / 2;
}
function reversePts(pts) {
  const out = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i], pts[i + 1]);
  return out;
}

// Catmull-Rom spline through flat points [x0,y0,x1,y1,...] appended to a path or context.
// Closed splines are always wound clockwise, like arcs and ellipses, so several shapes added to
// one Path2D form a true union under the nonzero rule (no cancelled holes where they overlap).
export function spline(p, pts, closed = true, k = 1) {
  if (closed && area(pts) < 0) pts = reversePts(pts);
  const n = pts.length / 2;
  if (n < 2) return p;
  const P = (i) => {
    if (closed) i = ((i % n) + n) % n;
    else i = clamp(i, 0, n - 1);
    return [pts[i * 2], pts[i * 2 + 1]];
  };
  const [x0, y0] = P(0);
  p.moveTo(x0, y0);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2);
    p.bezierCurveTo(
      b[0] + ((c[0] - a[0]) / 6) * k, b[1] + ((c[1] - a[1]) / 6) * k,
      c[0] - ((d[0] - b[0]) / 6) * k, c[1] - ((d[1] - b[1]) / 6) * k,
      c[0], c[1],
    );
  }
  if (closed) p.closePath();
  return p;
}
// Dense samples along the same spline: [[x, y], ...].
export function sampleSpline(pts, closed = true, perSeg = 6) {
  const n = pts.length / 2;
  const out = [];
  if (n < 2) return out;
  const P = (i) => {
    if (closed) i = ((i % n) + n) % n;
    else i = clamp(i, 0, n - 1);
    return [pts[i * 2], pts[i * 2 + 1]];
  };
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2);
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg, t2 = t * t, t3 = t2 * t;
      const f = (A, B, C, D) => 0.5 * (2 * B + (-A + C) * t + (2 * A - 5 * B + 4 * C - D) * t2 + (-A + 3 * B - 3 * C + D) * t3);
      out.push([f(a[0], b[0], c[0], d[0]), f(a[1], b[1], c[1], d[1])]);
    }
  }
  if (!closed) out.push(P(n - 1));
  return out;
}
// Tapered tube along a centre spline: widths is [w0, w1, ...] spread along the length
// (full widths, not radii). Appends a closed outline to `p`. Returns the samples + normals.
export function tube(p, pts, widths, perSeg = 5, capStart = true, capEnd = true) {
  const S = sampleSpline(pts, false, perSeg);
  const n = S.length;
  if (n < 2) return S;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const f = (i / (n - 1)) * (widths.length - 1);
    const j = Math.min(widths.length - 2, Math.floor(f));
    const w = lerp(widths[j], widths[j + 1], f - j) / 2;
    L.push([S[i][0] - dy * w, S[i][1] + dx * w, dx, dy, w]);
    R.push([S[i][0] + dy * w, S[i][1] - dx * w, dx, dy, w]);
  }
  // keep the outline clockwise (see spline) whichever way the centre line runs
  let poly = 0;
  for (let i = 0; i < n - 1; i++) poly += L[i][0] * L[i + 1][1] - L[i + 1][0] * L[i][1];
  poly += L[n - 1][0] * R[n - 1][1] - R[n - 1][0] * L[n - 1][1];
  for (let i = n - 1; i > 0; i--) poly += R[i][0] * R[i - 1][1] - R[i - 1][0] * R[i][1];
  poly += R[0][0] * L[0][1] - L[0][0] * R[0][1];
  if (poly < 0) {
    for (let i = 0; i < n; i++) {
      const a = L[i], b = R[i];
      L[i] = [b[0], b[1], a[2], a[3], a[4]];
      R[i] = [a[0], a[1], a[2], a[3], a[4]];
    }
  }
  p.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) p.lineTo(L[i][0], L[i][1]);
  const e = L[n - 1];
  if (capEnd) p.quadraticCurveTo(S[n - 1][0] + e[2] * e[4] * 1.3, S[n - 1][1] + e[3] * e[4] * 1.3, R[n - 1][0], R[n - 1][1]);
  else p.lineTo(R[n - 1][0], R[n - 1][1]);
  for (let i = n - 2; i >= 0; i--) p.lineTo(R[i][0], R[i][1]);
  const s0 = L[0];
  if (capStart) p.quadraticCurveTo(S[0][0] - s0[2] * s0[4] * 1.2, S[0][1] - s0[3] * s0[4] * 1.2, L[0][0], L[0][1]);
  p.closePath();
  return { S, L, R };
}
export function ellipsePath(p, x, y, rx, ry, rot = 0) {
  p.moveTo(x + Math.cos(rot) * rx, y + Math.sin(rot) * rx);
  p.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  return p;
}
export function roundRect(p, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
  return p;
}
// Two-bone IK: joint position between root (ax, ay) and end (bx, by); bend = +1 / -1 picks side.
export function ik(ax, ay, bx, by, l1, l2, bend = 1) {
  let dx = bx - ax, dy = by - ay;
  let d = Math.hypot(dx, dy) || 1e-6;
  const dm = Math.min(d, (l1 + l2) * 0.999);
  const base = Math.atan2(dy, dx);
  const c = clamp((l1 * l1 + dm * dm - l2 * l2) / (2 * l1 * dm), -1, 1);
  const a = Math.acos(c) * bend;
  return [ax + Math.cos(base + a) * l1, ay + Math.sin(base + a) * l1];
}

// crescent(g, path, dx, dy, color, alpha, box, mode): paints the part of `path` that is NOT
// covered by the same path shifted by (dx, dy) (local units). Because it works on the filled
// silhouette, overlapping sub-shapes never produce internal edges. Shift AWAY from a light to
// get a rim on the lit side; shift TOWARD it to get a core shadow on the far side.
// `box` = [x0, y0, x1, y1] local bounds of the path. `mode` = composite for the result.
let SCRATCH = null;
export function crescent(g, path, dx, dy, color, alpha, box, mode = "source-over", steps = 1) {
  if (alpha <= 0.003) return;
  const T = g.getTransform ? g.getTransform() : null;
  if (!T) return;
  const cw = g.canvas.width, ch = g.canvas.height;
  if (!SCRATCH) SCRATCH = makeCanvas(cw, ch);
  if (SCRATCH.width < cw || SCRATCH.height < ch) { SCRATCH.width = Math.max(SCRATCH.width, cw); SCRATCH.height = Math.max(SCRATCH.height, ch); }
  const s = SCRATCH.getContext("2d");
  const pad = Math.abs(dx) + Math.abs(dy) + 2;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [px, py] of [[box[0] - pad, box[1] - pad], [box[2] + pad, box[1] - pad], [box[0] - pad, box[3] + pad], [box[2] + pad, box[3] + pad]]) {
    const X = T.a * px + T.c * py + T.e, Y = T.b * px + T.d * py + T.f;
    x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y);
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(cw, Math.ceil(x1)); y1 = Math.min(ch, Math.ceil(y1));
  if (x1 <= x0 || y1 <= y0) return;
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalAlpha = 1;
  s.globalCompositeOperation = "source-over";
  s.clearRect(x0, y0, x1 - x0, y1 - y0);
  s.setTransform(T);
  s.fillStyle = color;
  s.fill(path);
  s.globalCompositeOperation = "destination-out";
  for (let i = steps; i >= 1; i--) {
    const k = i / steps;
    s.globalAlpha = i === steps ? 1 : 0.45;
    s.setTransform(T);
    s.translate(dx * k, dy * k);
    s.fill(path);
  }
  s.globalAlpha = 1;
  s.globalCompositeOperation = "source-over";
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = mode;
  g.globalAlpha *= clamp(alpha);
  g.drawImage(SCRATCH, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  g.restore();
}

// Wraps a drawing in save/restore, safely.
export function within(g, fn) {
  g.save();
  try { fn(g); } finally { g.restore(); }
}
