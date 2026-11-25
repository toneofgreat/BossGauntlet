// util.js - small helpers shared by the render modules: canvases, seeded hashing/noise, colors.
// Render code may use trig and randomness freely (it never feeds the sim).

export const TAU = Math.PI * 2;

export function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// integer hash -> [0,1)
export function hash(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 0x9e3779b9, 1274126177);
  h = Math.imul(h ^ (h >>> 15), 2246822519 | 0);
  h = Math.imul(h ^ (h >>> 13), 3266489917 | 0);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// mulberry32 PRNG
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- periodic value noise (lattice tables, fast) ----
const latCache = new Map();
function lattice(p, s) {
  const k = p * 100003 + s;
  let L = latCache.get(k);
  if (!L) {
    L = new Float32Array(p * p);
    for (let y = 0; y < p; y++) for (let x = 0; x < p; x++) L[y * p + x] = hash(x, y, s);
    latCache.set(k, L);
  }
  return L;
}
// 2D value noise in [0,1], periodic with period p lattice cells in both axes
export function vnoise(x, y, p, s = 0) {
  const L = lattice(p, s);
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p;
  const x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
  const a = L[y0 * p + x0], b = L[y0 * p + x1], c = L[y1 * p + x0], d = L[y1 * p + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
// fractal sum, periodic: x,y in base-lattice units, p = base period
export function fbm(x, y, p, s = 0, oct = 4, gain = 0.5) {
  let v = 0, a = 1, n = 0, f = 1;
  for (let o = 0; o < oct; o++) { v += a * vnoise(x * f, y * f, p * f, s + o * 31); n += a; a *= gain; f *= 2; }
  return v / n;
}
// 1D periodic fbm (for skyline profiles): x in [0, p)
export function fbm1(x, p, s = 0, oct = 5, gain = 0.5) { return fbm(x, 0.5, p, s, oct, gain); }

// ---- colors ----
const hexCache = new Map();
export function rgb(c) {
  if (Array.isArray(c)) return c;
  let v = hexCache.get(c);
  if (!v) {
    if (c.startsWith("rgb")) { const m = c.match(/[\d.]+/g) || []; v = [+m[0] || 0, +m[1] || 0, +m[2] || 0]; }
    else {
      const h = c.replace("#", "");
      const n = parseInt(h.length === 3 ? h.split("").map((q) => q + q).join("") : h, 16);
      v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    hexCache.set(c, v);
  }
  return v;
}
export function mixRGB(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
}
export function css(c, a = 1) {
  const C = rgb(c);
  return a >= 1 ? `rgb(${C[0] | 0},${C[1] | 0},${C[2] | 0})` : `rgba(${C[0] | 0},${C[1] | 0},${C[2] | 0},${a})`;
}
export const mix = (a, b, t, al = 1) => css(mixRGB(a, b, t), al);
export function shade(c, f, al = 1) {
  const C = rgb(c);
  return css([Math.min(255, C[0] * f), Math.min(255, C[1] * f), Math.min(255, C[2] * f)], al);
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);

// rounded rect with independent corner radii (tl, tr, br, bl)
export function rrect(ctx, x, y, w, h, tl, tr = tl, br = tl, bl = tl) {
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr); else ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - br);
  if (br) ctx.arcTo(x + w, y + h, x + w - br, y + h, br); else ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + bl, y + h);
  if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl); else ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + tl);
  if (tl) ctx.arcTo(x, y, x + tl, y, tl); else ctx.lineTo(x, y);
  ctx.closePath();
}

// soft radial blob sprite (white or a color), size px square
export function softDot(size, color = "#ffffff", inner = 0, alpha = 1) {
  const c = makeCanvas(size, size), g = c.getContext("2d");
  const r = size / 2, gr = g.createRadialGradient(r, r, r * inner, r, r, r);
  gr.addColorStop(0, css(color, alpha)); gr.addColorStop(0.45, css(color, alpha * 0.45)); gr.addColorStop(1, css(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}

// does this 2D context support ctx.filter (Safari < 18 does not)
let filterOK = null;
export function supportsFilter() {
  if (filterOK === null) {
    try { const g = makeCanvas(2, 2).getContext("2d"); g.filter = "blur(2px)"; filterOK = g.filter === "blur(2px)"; } catch (e) { filterOK = false; }
  }
  return filterOK;
}
