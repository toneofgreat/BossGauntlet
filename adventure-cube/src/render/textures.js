// textures.js - procedurally painted, seamlessly tiling material textures (soil, rock, bark, ice, back rock),
// generated once per theme and cached for the page's lifetime. Noise is computed as whole octave GRIDS (lattice
// tables + separable smoothstep interpolation), which is ~50x faster than per-pixel hashing.
// Each texture covers TEX_WORLD world px and is stored at TEX_RES canvas px per world px.
import { makeCanvas, hash, rgb } from "./util.js";

export const TEX_WORLD = 128;
export const TEX_RES = 2;
const N = TEX_WORLD * TEX_RES; // 256 (power of two)

const cache = new Map();

// one value-noise octave: px x py lattice cells across the texture, periodic, smoothstep-interpolated
function octave(px, py, s) {
  const L = new Float32Array(px * py);
  for (let i = 0; i < px * py; i++) L[i] = hash(i % px, (i / px) | 0, s);
  const out = new Float32Array(N * N);
  const x0 = new Int32Array(N), x1 = new Int32Array(N), fx = new Float32Array(N);
  for (let x = 0; x < N; x++) { const u = (x / N) * px, i = Math.floor(u); let f = u - i; f = f * f * (3 - 2 * f); x0[x] = i % px; x1[x] = (i + 1) % px; fx[x] = f; }
  for (let y = 0; y < N; y++) {
    const v = (y / N) * py, j = Math.floor(v); let fy = v - j; fy = fy * fy * (3 - 2 * fy);
    const r0 = (j % py) * px, r1 = ((j + 1) % py) * px, o = y * N;
    for (let x = 0; x < N; x++) {
      const a = L[r0 + x0[x]], b = L[r0 + x1[x]], c = L[r1 + x0[x]], d = L[r1 + x1[x]];
      const top = a + (b - a) * fx[x], bot = c + (d - c) * fx[x];
      out[o + x] = top + (bot - top) * fy;
    }
  }
  return out;
}
function fbm(px, py, s, oct, gain = 0.5) {
  const out = new Float32Array(N * N);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const g = octave(px << o, py << o, s + o * 31);
    for (let i = 0; i < N * N; i++) out[i] += g[i] * amp;
    tot += amp; amp *= gain;
  }
  for (let i = 0; i < N * N; i++) out[i] /= tot;
  return out;
}
// bilinear sample of a grid at fractional pixel coords (wrapping)
function sample(G, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const x0 = xi & (N - 1), x1 = (xi + 1) & (N - 1), y0 = (yi & (N - 1)) * N, y1 = ((yi + 1) & (N - 1)) * N;
  const a = G[y0 + x0], b = G[y0 + x1], c = G[y1 + x0], d = G[y1 + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
// per-pixel white noise (fast LCG)
function white(s) { const w = new Float32Array(N * N); let a = (s * 2654435761) >>> 0 || 1; for (let i = 0; i < N * N; i++) { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; w[i] = a / 4294967296; } return w; }

function paint(fn) {
  const c = makeCanvas(N, N), g = c.getContext("2d");
  const img = g.createImageData(N, N), d = img.data;
  const out = [0, 0, 0];
  for (let y = 0, i = 0; y < N; y++) for (let x = 0; x < N; x++, i++) {
    fn(i, x, y, out);
    const k = i * 4;
    d[k] = out[0]; d[k + 1] = out[1]; d[k + 2] = out[2]; d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
const lerp3 = (A, B, t, o) => { o[0] = A[0] + (B[0] - A[0]) * t; o[1] = A[1] + (B[1] - A[1]) * t; o[2] = A[2] + (B[2] - A[2]) * t; return o; };
const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function soilTex(A) {
  const base = rgb(A.soil.base), dark = rgb(A.soil.dark), light = rgb(A.soil.light), grain = rgb(A.soil.grain);
  const n = fbm(4, 4, 11, 5), clod = octave(16, 16, 12), w = white(13), w2 = octave(128, 128, 14);
  return paint((i, x, y, o) => {
    const t = cl((n[i] - 0.32) * 1.9);
    lerp3(dark, base, t, o);
    if (t > 0.62) lerp3(o, light, (t - 0.62) * 1.2, o);
    const c = clod[i];
    if (c > 0.68) lerp3(o, light, (c - 0.68) * 1.2, o); else if (c > 0.62) lerp3(o, dark, 0.35, o);
    const h = w[i];
    if (h > 0.965) lerp3(o, grain, 0.75, o); else if (h < 0.05) lerp3(o, dark, 0.6, o);
    const f = 0.92 + 0.16 * w2[i];
    o[0] *= f; o[1] *= f; o[2] *= f;
  });
}

function rockTex(A, back) {
  const P = back ? A.back : A.rock;
  const base = rgb(P.base), dark = rgb(P.dark), light = rgb(back ? A.back.base : A.rock.light);
  const strata = back ? 0.05 : A.rock.strata;
  const n = fbm(4, 4, back ? 61 : 21, 5), wv = fbm(2, 8, 22, 3), r = octave(8, 8, 23), w = white(24), w2 = octave(128, 128, 25), big = fbm(2, 2, 26, 2);
  return paint((i, x, y, o) => {
    const band = Math.sin(((y / N) * 9 + wv[i] * 2.2) * Math.PI * 2) * 0.5 + 0.5;
    const ridge = 1 - Math.abs(2 * sample(r, x + wv[i] * 40, y) - 1);
    const t = cl((n[i] - 0.3) * 2.1) * (1 - strata) + band * strata * 2 - strata * 0.5 + (big[i] - 0.5) * 0.35;
    lerp3(dark, base, cl(t * 1.25), o);
    if (t > 0.68) lerp3(o, light, cl((t - 0.68) * 1.6), o);
    if (ridge > 0.93) lerp3(o, dark, (ridge - 0.93) * 9, o);
    const h = w[i];
    if (h > 0.975) lerp3(o, light, 0.5, o); else if (h < 0.03) lerp3(o, dark, 0.5, o);
    const f = 0.93 + 0.14 * w2[i];
    o[0] *= f; o[1] *= f; o[2] *= f;
  });
}

function barkTex(A) {
  const bark = rgb(A.wood.bark), dark = rgb(A.wood.dark), light = rgb(A.wood.light);
  const wv = fbm(2, 2, 31, 3), gr = octave(4, 32, 32), n = fbm(8, 8, 33, 3);
  return paint((i, x, y, o) => {
    const g = sample(gr, x + wv[i] * 64, y);
    const ridge = 1 - Math.abs(2 * g - 1);
    lerp3(dark, bark, cl(ridge * 1.3 - 0.1), o);
    if (ridge > 0.8) lerp3(o, light, (ridge - 0.8) * 2.5 * n[i], o);
    if (ridge < 0.22) lerp3(o, dark, 0.6, o);
    const f = 0.9 + 0.2 * n[i];
    o[0] *= f; o[1] *= f; o[2] *= f;
  });
}

function iceTex(A) {
  const base = rgb(A.ice.base), dark = rgb(A.ice.dark), light = rgb(A.ice.light);
  const n = fbm(4, 4, 41, 5), r = octave(8, 8, 42), st = octave(16, 2, 43);
  return paint((i, x, y, o) => {
    lerp3(dark, base, cl(n[i] * 1.5 - 0.1), o);
    const ridge = 1 - Math.abs(2 * r[i] - 1);
    if (ridge > 0.95) lerp3(o, light, (ridge - 0.95) * 14, o);
    const s = sample(st, x + y, x - y);
    if (s > 0.7) lerp3(o, light, (s - 0.7) * 1.2, o);
  });
}

// returns { soil, rock, back, bark, ice } canvases for theme art A
export function texturesFor(A) {
  let t = cache.get(A.id);
  if (!t) {
    t = { soil: soilTex(A), rock: rockTex(A, false), back: rockTex(A, true), bark: barkTex(A), ice: iceTex(A) };
    cache.set(A.id, t);
  }
  return t;
}

// make patterns usable on ctx in WORLD px units (texture is TEX_RES canvas px per world px)
export function patternsFor(ctx, tex) {
  const out = {};
  for (const k of Object.keys(tex)) {
    const p = ctx.createPattern(tex[k], "repeat");
    if (p && p.setTransform && typeof DOMMatrix !== "undefined") p.setTransform(new DOMMatrix([1 / TEX_RES, 0, 0, 1 / TEX_RES, 0, 0]));
    out[k] = p;
  }
  return out;
}
