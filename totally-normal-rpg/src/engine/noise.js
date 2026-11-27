// noise.js - deterministic hash + value noise helpers shared by terrain, vegetation and texture generation.
// Pure math, no allocation, safe in node.

export function hash2i(x, z, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hash1(n) {
  let h = Math.imul(n | 0, 2654435761) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

// value noise in [-1, 1]
export function vnoise(x, z, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fade(fx), v = fade(fz);
  const a = hash2i(ix, iz, seed), b = hash2i(ix + 1, iz, seed);
  const c = hash2i(ix, iz + 1, seed), d = hash2i(ix + 1, iz + 1, seed);
  return ((a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v) * 2 - 1;
}

export function fbm(x, z, oct = 4, seed = 0, lac = 2.03, gain = 0.5) {
  let s = 0, amp = 1, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x * f, z * f, seed + i * 17) * amp;
    norm += amp; amp *= gain; f *= lac;
  }
  return s / norm;
}

// ridged noise in [0,1] (1 at ridges)
export function ridged(x, z, oct = 3, seed = 0) {
  let s = 0, amp = 1, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(vnoise(x * f, z * f, seed + i * 31));
    s += n * n * amp; norm += amp; amp *= 0.5; f *= 2.1;
  }
  return s / norm;
}

// tileable value noise (period p cells) in [0,1], for textures
export function tnoise(x, y, p, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fade(fx), v = fade(fy);
  const x0 = ((ix % p) + p) % p, y0 = ((iy % p) + p) % p;
  const x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
  const a = hash2i(x0, y0, seed), b = hash2i(x1, y0, seed);
  const c = hash2i(x0, y1, seed), d = hash2i(x1, y1, seed);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}

export function tfbm(x, y, p, oct = 4, seed = 0) {
  let s = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    s += tnoise(x * f, y * f, p * f, seed + i * 13) * amp;
    norm += amp; amp *= 0.5; f *= 2;
  }
  return s / norm;
}

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
export function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
export function lerp(a, b, t) { return a + (b - a) * t; }

// small seeded PRNG (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
