// rng.js - seeded randomness + exact-arithmetic noise for the bonus level (CORE owns, frozen). DOM-free.
// World generation must only use these (integer hashing + + - * / floor): the same seed gives the same world in
// every browser, which is what lets the save store just the seed plus a diff.

// integer hash of (x, y, seed) -> [0, 1)
export function hash2(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 0x9e3779b9, 1274126177);
  h = Math.imul(h ^ (h >>> 15), 2246822519 | 0);
  h = Math.imul(h ^ (h >>> 13), 3266489917 | 0);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// mulberry32: rng() -> [0, 1). rng.int(a, b) inclusive. rng.pick(array). rng.state get/set (save/restore)
export function createRng(seed) {
  let a = (seed >>> 0) || 1;
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  Object.defineProperty(r, "state", { get: () => a >>> 0, set: (v) => { a = v >>> 0 || 1; } });
  return r;
}

const smooth = (t) => t * t * (3 - 2 * t);
// 1D value noise in [0,1): period-free, exact arithmetic
export function noise1(x, s = 0) {
  const i = Math.floor(x), f = x - i;
  const a = hash2(i, 0, s), b = hash2(i + 1, 0, s);
  return a + (b - a) * smooth(f);
}
export function fbm1(x, s = 0, oct = 4) {
  let v = 0, amp = 0.5, fr = 1, tot = 0;
  for (let o = 0; o < oct; o++) { v += noise1(x * fr, s + o * 131) * amp; tot += amp; amp *= 0.5; fr *= 2; }
  return v / tot;
}
// 2D value noise in [0,1)
export function noise2(x, y, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  const top = a + (b - a) * fx, bot = c + (d - c) * fx;
  return top + (bot - top) * fy;
}
export function fbm2(x, y, s = 0, oct = 3) {
  let v = 0, amp = 0.5, fr = 1, tot = 0;
  for (let o = 0; o < oct; o++) { v += noise2(x * fr, y * fr, s + o * 977) * amp; tot += amp; amp *= 0.5; fr *= 2; }
  return v / tot;
}
// a seed from any string/number
export function seedFrom(v) {
  if (typeof v === "number" && isFinite(v)) return (v >>> 0) || 1;
  if (typeof v === "string" && /^\d{1,9}$/.test(v)) return (+v >>> 0) || 1; // "1234" == 1234
  const s = String(v == null ? "" : v);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 1;
}
