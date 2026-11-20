// src/games/cats/scripts/filmtex.js - cached procedural textures for the film kit (photoreal pass).
// Re-exported through filmenv.js -> filmkit.js. Every texture is built ONCE per (name, options)
// into an offscreen canvas (per-pixel work happens only here, at cache-build time), kept in a
// memory-capped LRU cache, and then drawn with plain drawImage / pattern fills - so draw(g, t)
// stays a cheap pure function of t.
//
// API (o = options object, all optional):
//  noise     texNoise(x,y,seed,px,py) gradient noise [-1,1] (tileable with integer periods px,py)
//            texFbm(x,y,seed,oct,px,py) [-1,1]   texRidged(x,y,seed,oct,px,py) [0,1]
//            texVoronoi(x,y,seed,px,py) -> {f1,f2,id,cx,cy} (shared object, copy what you keep)
//  textures  texture(name,{seed,size,...}) -> canvas (tileable; canvas.avg = mean css colour)
//            names: turf soil mud asphalt puddles cobble brick plaster wood bark granite sand lavarock
//                   lava quilt fabric wallpaper metal shingle siding glassdrops cloud nebula noise foliage
//                   relief (neutral grey, use with soft-light) macro cardboard
//            textures are lit (height -> normals, cavity AO, optional spec) from the upper left at build
//  drawing   texPattern(g,name,o) -> CanvasPattern   texRect(g,name,x,y,w,h,{scale,ox,oy,alpha,tint,tintAlpha,mode,rot,tex})
//            texFill(g,name,path,{...same}) fills a Path2D   texAvg(name,o) -> css colour
//            groundPlane(g,W,H,{tex,texOpts,horizon,scale,focal,camX,camZ,cx,y0,y1,x0,x1,fog,fogAmt,tint,tintAlpha,
//                        wet,sky,puddles,puddleScale,rot90,variation,alpha,strips,cache})
//  cache     texCacheStats() -> {count, bytes}   texPrewarm(list, budgetMs) -> remaining   TEXTURE_NAMES
//            texBake(key, w, h, fn(u,v,out,x,y)) -> canvas (your own cached per-pixel raster)

import { TAU, clamp, lerp, mix, rgba, parseColor, makeCanvas, sprite } from "./filmcore.js";

// ---- integer hash + noise ------------------------------------------------------------------------
function ih(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul((s | 0) + 0x9e37, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return h ^ (h >>> 16); // signed int32: stays a small integer, no heap numbers in the hot loops
}
const rnd = (x, y, s) => (ih(x, y, s) >>> 0) / 4294967296;
const GX = new Float32Array(256), GY = new Float32Array(256);
for (let i = 0; i < 256; i++) { GX[i] = Math.cos((i / 256) * TAU); GY[i] = Math.sin((i / 256) * TAU); }
const wrap = (v, p) => (p > 0 ? ((v % p) + p) % p : v);
const seedNum = (s) => {
  if (typeof s === "number") return Math.floor(s * 7919) | 0;
  let h = 7;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h | 0;
};

// texNoise(x, y, seed, px, py) - 2D gradient (Perlin-style) noise in about [-1, 1].
export function texNoise(x, y, seed = 0, px = 0, py = 0) {
  const fxl = Math.floor(x), fyl = Math.floor(y);
  const fx = x - fxl, fy = y - fyl;
  let x0 = fxl | 0, y0 = fyl | 0;
  let x1 = x0 + 1, y1 = y0 + 1;
  const pX = px | 0, pY = py | 0;
  if (pX > 0) { x0 = x0 % pX; if (x0 < 0) x0 += pX; x1 = x0 + 1; if (x1 >= pX) x1 = 0; }
  if (pY > 0) { y0 = y0 % pY; if (y0 < 0) y0 += pY; y1 = y0 + 1; if (y1 >= pY) y1 = 0; }
  const s = Math.imul((seed | 0) + 0x9e37, 0x9e3779b1);
  const ax = Math.imul(x0, 0x27d4eb2d), bx = Math.imul(x1, 0x27d4eb2d);
  const ay = Math.imul(y0, 0x165667b1) ^ s, by = Math.imul(y1, 0x165667b1) ^ s;
  let h00 = ax ^ ay; h00 = Math.imul(h00 ^ (h00 >>> 15), 0x85ebca6b); h00 = (h00 ^ (h00 >>> 13)) & 255;
  let h10 = bx ^ ay; h10 = Math.imul(h10 ^ (h10 >>> 15), 0x85ebca6b); h10 = (h10 ^ (h10 >>> 13)) & 255;
  let h01 = ax ^ by; h01 = Math.imul(h01 ^ (h01 >>> 15), 0x85ebca6b); h01 = (h01 ^ (h01 >>> 13)) & 255;
  let h11 = bx ^ by; h11 = Math.imul(h11 ^ (h11 >>> 15), 0x85ebca6b); h11 = (h11 ^ (h11 >>> 13)) & 255;
  const n00 = GX[h00] * fx + GY[h00] * fy;
  const n10 = GX[h10] * (fx - 1) + GY[h10] * fy;
  const n01 = GX[h01] * fx + GY[h01] * (fy - 1);
  const n11 = GX[h11] * (fx - 1) + GY[h11] * (fy - 1);
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = n00 + (n10 - n00) * u, b = n01 + (n11 - n01) * u;
  return (a + (b - a) * v) * 1.42;
}
// texFbm - fractal sum, roughly [-1, 1]. Periods double with each octave so tiling is preserved.
export function texFbm(x, y, seed = 0, oct = 5, px = 0, py = 0, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < oct; o++) {
    sum += texNoise(x * f, y * f, (seed | 0) + o * 131, px * f, py * f) * amp;
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}
// texRidged - ridged multifractal in [0, 1]: sharp crests (cracks, bark furrows, mountain ridges).
export function texRidged(x, y, seed = 0, oct = 5, px = 0, py = 0) {
  let sum = 0, amp = 0.5, f = 1, w = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    let n = 1 - Math.abs(texNoise(x * f, y * f, (seed | 0) + o * 977, px * f, py * f));
    n *= n;
    n *= w;
    w = clamp(n * 2);
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
const VOR = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 };
// texVoronoi - cellular noise: f1/f2 = nearest/second distances (cell units), id = cell hash.
export function texVoronoi(x, y, seed = 0, px = 0, py = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0, cx = 0, cy = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cxI = ix + i, cyI = iy + j;
      const wx = wrap(cxI, px), wy = wrap(cyI, py);
      const h = ih(wx, wy, seed | 0);
      const fx = cxI + 0.12 + ((h & 1023) / 1023) * 0.76, fy = cyI + 0.12 + (((h >>> 10) & 1023) / 1023) * 0.76;
      const d = Math.hypot(fx - x, fy - y);
      if (d < f1) { f2 = f1; f1 = d; id = h; cx = fx; cy = fy; } else if (d < f2) f2 = d;
    }
  }
  VOR.f1 = f1; VOR.f2 = f2; VOR.id = id; VOR.cx = cx; VOR.cy = cy;
  return VOR;
}

// ---- cache -----------------------------------------------------------------------------------------
const CACHE = new Map();
let BYTES = 0;
const CAP = 96 * 1024 * 1024;
export function texCacheStats() { return { count: CACHE.size, bytes: BYTES }; }
function cacheGet(key) {
  const c = CACHE.get(key);
  if (c) { CACHE.delete(key); CACHE.set(key, c); }
  return c;
}
function cachePut(key, c) {
  const b = c.width * c.height * 4;
  while (BYTES + b > CAP && CACHE.size) {
    const [k0, c0] = CACHE.entries().next().value;
    CACHE.delete(k0);
    BYTES -= c0.width * c0.height * 4;
  }
  CACHE.set(key, c);
  BYTES += b;
}

// ---- surface builder: albedo + height -> lit, ambient-occluded texture -------------------------
// sample(u, v, S) fills S.h (height 0..1), S.r/S.g/S.b (0..255 albedo), optional S.a (0..1),
// S.e (emissive 0..1 added on top, colour S.er/S.eg/S.eb), S.sp (specular 0..1).
function surface(w, h, o, sample) {
  const N = w * h;
  const Hf = new Float32Array(N), C = new Float32Array(N * 3), A = new Float32Array(N), E = new Float32Array(N * 4), SP = new Float32Array(N);
  const S = { h: 0, r: 0, g: 0, b: 0, a: 1, e: 0, er: 255, eg: 160, eb: 60, sp: 0 };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      S.h = 0; S.a = 1; S.e = 0; S.sp = 0;
      sample(x / w, y / h, S, x, y);
      const i = y * w + x;
      Hf[i] = S.h; C[i * 3] = S.r; C[i * 3 + 1] = S.g; C[i * 3 + 2] = S.b; A[i] = S.a; SP[i] = S.sp;
      if (S.e > 0) { E[i * 4] = S.e; E[i * 4 + 1] = S.er; E[i * 4 + 2] = S.eg; E[i * 4 + 3] = S.eb; }
    }
  }
  // blurred height for cavity / ambient occlusion (separable box, wrapping)
  const rad = o.aoRadius || Math.max(2, Math.round(w / 64));
  const tmp = new Float32Array(N), Hb = new Float32Array(N);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let k = -rad; k <= rad; k++) acc += Hf[y * w + wrap(k, w)];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / (rad * 2 + 1);
      acc += Hf[y * w + wrap(x + rad + 1, w)] - Hf[y * w + wrap(x - rad, w)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -rad; k <= rad; k++) acc += tmp[wrap(k, h) * w + x];
    for (let y = 0; y < h; y++) {
      Hb[y * w + x] = acc / (rad * 2 + 1);
      acc += tmp[wrap(y + rad + 1, h) * w + x] - tmp[wrap(y - rad, h) * w + x];
    }
  }
  const bump = (o.bump == null ? 1 : o.bump) * w / 64;
  const aoK = o.ao == null ? 2.2 : o.ao;
  let lx = -0.45, ly = -0.65, lz = 0.62;
  if (o.light) { lx = o.light[0]; ly = o.light[1]; lz = o.light[2]; }
  const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
  const amb = o.ambient == null ? 0.42 : o.ambient;
  // half vector for a viewer straight above (spec on bumps)
  let hx = lx, hy = ly, hz = lz + 1;
  const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
  const c = makeCanvas(w, h);
  const g = c.getContext("2d");
  const img = g.createImageData(w, h);
  const D = img.data;
  let sr = 0, sg = 0, sb = 0, sa = 0;
  for (let y = 0; y < h; y++) {
    const ym = wrap(y - 1, h) * w, yp = wrap(y + 1, h) * w;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const dx = Hf[y * w + wrap(x + 1, w)] - Hf[y * w + wrap(x - 1, w)];
      const dy = Hf[yp + x] - Hf[ym + x];
      let nx = -dx * bump, ny = -dy * bump, nz = 1;
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const ndl = Math.max(0, nx * lx + ny * ly + nz * lz);
      let lit = Math.min(1.3, amb + (1 - amb) * ndl / lz);
      const ao = clamp(1 + (Hf[i] - Hb[i]) * aoK, 0.25, 1.2);
      lit *= ao;
      let spec = 0;
      if (SP[i] > 0) { const nh = Math.max(0, nx * hx + ny * hy + nz * hz); spec = SP[i] * Math.pow(nh, 40) * 255; }
      let r = C[i * 3] * lit + spec, gg = C[i * 3 + 1] * lit + spec, b = C[i * 3 + 2] * lit + spec;
      const e = E[i * 4];
      if (e > 0) { r += E[i * 4 + 1] * e; gg += E[i * 4 + 2] * e; b += E[i * 4 + 3] * e; }
      const a = A[i];
      D[i * 4] = r; D[i * 4 + 1] = gg; D[i * 4 + 2] = b; D[i * 4 + 3] = a * 255;
      sr += Math.min(255, r) * a; sg += Math.min(255, gg) * a; sb += Math.min(255, b) * a; sa += a;
    }
  }
  g.putImageData(img, 0, 0);
  c.avg = sa > 0 ? `rgb(${(sr / sa) | 0},${(sg / sa) | 0},${(sb / sa) | 0})` : "rgb(0,0,0)";
  return c;
}
// plain RGBA field (no lighting) - for alpha masks, clouds, nebulae, noise
function field(w, h, fn) {
  const c = makeCanvas(w, h);
  const g = c.getContext("2d");
  const img = g.createImageData(w, h);
  const D = img.data;
  const out = [0, 0, 0, 0];
  let sr = 0, sg = 0, sb = 0, sa = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      fn(x / w, y / h, out, x, y);
      const i = (y * w + x) * 4;
      D[i] = out[0]; D[i + 1] = out[1]; D[i + 2] = out[2]; D[i + 3] = out[3];
      const a = out[3] / 255;
      sr += out[0] * a; sg += out[1] * a; sb += out[2] * a; sa += a;
    }
  }
  g.putImageData(img, 0, 0);
  c.avg = sa > 0 ? `rgb(${(sr / sa) | 0},${(sg / sa) | 0},${(sb / sa) | 0})` : "rgb(0,0,0)";
  return c;
}
const col = (c) => parseColor(c);
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function setC(S, c, k = 1) { S.r = c[0] * k; S.g = c[1] * k; S.b = c[2] * k; }
function mixC(S, a, b, t, k = 1) { S.r = (a[0] + (b[0] - a[0]) * t) * k; S.g = (a[1] + (b[1] - a[1]) * t) * k; S.b = (a[2] + (b[2] - a[2]) * t) * k; }
function mixInto(S, c, t) { S.r += (c[0] - S.r) * t; S.g += (c[1] - S.g) * t; S.b += (c[2] - S.b) * t; }

// ---- generators --------------------------------------------------------------------------------
const GEN = {
  // short lawn seen from above/grazing: clumps, blade speckle, a little straw and clover
  turf(w, h, o, s) {
    const base = col(o.color || "#53702f"), dark = col(o.dark || "#1f2e14"), dry = col(o.dryColor || "#9a9150"), tip = col("#a9b86a");
    const dryAmt = o.dry == null ? 0.3 : o.dry;
    return surface(w, h, { bump: 1.5, ao: 3.2, ambient: 0.32 }, (u, v, S, x, y) => {
      const big = texFbm(u * 3, v * 3, s, 4, 3, 3);
      const mid = texFbm(u * 12, v * 12, s + 1, 3, 12, 12);
      const blade = texNoise(u * 48, v * 14, s + 5, 48, 14) * 0.5 + (rnd(x, y >> 1, s + 9) - 0.5) * 1.1;
      const g = rnd(x, y, s + 3) - 0.5;
      S.h = 0.35 * (blade * 0.5 + 0.5) + 0.35 * (mid * 0.5 + 0.5) + 0.2 * (big * 0.5 + 0.5) + g * 0.1;
      mixC(S, dark, base, clamp(0.15 + S.h * 1.05 + g * 0.15));
      mixInto(S, dry, clamp((big - 0.1) * 2) * dryAmt * (0.6 + blade * 0.4));
      if (blade > 0.5) mixInto(S, tip, (blade - 0.5) * 1.1);
      S.r *= 1 + mid * 0.08;
    });
  },
  // bare earth: fbm tone, pebbles, root crumbs; o.wet darkens and adds gloss
  soil(w, h, o, s) {
    const a = col(o.color || "#5a4330"), b = col(o.dark || "#2e2219"), peb = col("#8a7a68");
    const wet = clamp(o.wet || 0);
    return surface(w, h, { bump: 1.2, ao: 2.6 }, (u, v, S) => {
      const n = texFbm(u * 6, v * 6, s, 5, 6, 6);
      const vo = texVoronoi(u * 26, v * 26, s + 1, 26, 26);
      const pebble = (vo.id & 15) === 0 ? sm(0.1 + ((vo.id >>> 6) & 15) / 60, 0.05, vo.f1) : 0;
      const fine = texNoise(u * 128, v * 128, s + 2, 128, 128);
      S.h = 0.5 + n * 0.3 + fine * 0.08 + pebble * 0.5;
      mixC(S, b, a, clamp(0.5 + n * 0.8 + fine * 0.15));
      if (pebble > 0) mixInto(S, peb, pebble * (0.5 + ((vo.id >>> 4) & 15) / 30));
      if (wet) { const k = 1 - wet * 0.45; S.r *= k; S.g *= k; S.b *= k * 1.02; S.sp = wet * 0.5 * (n > 0 ? 1 : 0.4); }
    });
  },
  mud(w, h, o, s) { return GEN.soil(w, h, { ...o, wet: o.wet == null ? 0.8 : o.wet, color: o.color || "#4a3626" }, s); },
  // asphalt: aggregate speckle, tar stains, hairline cracks, optional wet gloss
  asphalt(w, h, o, s) {
    const base = col(o.color || "#4a4b4e"), tar = col("#1d1e21"), stone = col("#8d8c88");
    const wet = clamp(o.wet || 0);
    return surface(w, h, { bump: 0.9, ao: 2.4, ambient: 0.5 }, (u, v, S, x, y) => {
      const n = texFbm(u * 5, v * 5, s, 4, 5, 5);
      const grit = rnd(x, y, s + 7);
      const agg = texNoise(u * 120, v * 120, s + 3, 120, 120);
      const crack = texRidged(u * 3, v * 3, s + 11, 3, 3, 3) * (0.6 + 0.4 * clamp(n + 0.5));
      S.h = 0.5 + agg * 0.25 + (grit - 0.5) * 0.25;
      mixC(S, tar, base, clamp(0.55 + n * 0.5));
      if (agg > 0.45) mixInto(S, stone, (agg - 0.45) * 1.2);
      const k = 0.88 + grit * 0.24;
      S.r *= k; S.g *= k; S.b *= k;
      if (crack > 0.86) { const c = sm(0.86, 0.96, crack); S.h -= c * 0.5; mixInto(S, tar, c * 0.85); }
      if (wet) { const d = 1 - wet * 0.55; S.r *= d; S.g *= d; S.b *= d * 1.05; S.sp = wet * 0.8; }
    });
  },
  // puddle mask: reflective tint in rgb, coverage in alpha (soft rims)
  puddles(w, h, o, s) {
    const c = col(o.color || "#7f93b0");
    const cover = o.cover == null ? 0.35 : o.cover;
    const th = 0.35 - cover * 0.7;
    return field(w, h, (u, v, out) => {
      const n = texFbm(u * 3, v * 3, s, 5, 3, 3) + texNoise(u * 24, v * 24, s + 3, 24, 24) * 0.06;
      const a = sm(th, th + 0.05, n);
      const k = 0.85 + 0.15 * texNoise(u * 9, v * 9, s + 8, 9, 9);
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; out[3] = a * 255;
    });
  },
  // cobblestones: domed voronoi setts, sunken mortar with moss, per-stone tone
  cobble(w, h, o, s) {
    const base = col(o.color || "#77736c"), mortar = col("#2c2a26"), moss = col("#4a5a2a");
    const n0 = o.cells || 9, wet = clamp(o.wet || 0), mossAmt = o.moss == null ? 0.5 : o.moss;
    return surface(w, h, { bump: 2.2, ao: 3.2, ambient: 0.38 }, (u, v, S) => {
      const vo = texVoronoi(u * n0, v * n0, s, n0, n0);
      const edge = vo.f2 - vo.f1;
      const id = vo.id;
      const rough = texFbm(u * 40, v * 40, s + 2, 3, 40, 40);
      const dome = sm(0.02, 0.32, edge);
      S.h = dome * (0.75 + ((id >>> 3) & 15) / 60) + rough * 0.06;
      const tone = 0.72 + ((id & 255) / 255) * 0.5;
      setC(S, base, tone);
      S.r *= 1 + (((id >>> 9) & 15) / 15 - 0.5) * 0.12;
      S.b *= 1 + (((id >>> 13) & 15) / 15 - 0.5) * 0.1;
      const k = 0.9 + rough * 0.25;
      S.r *= k; S.g *= k; S.b *= k;
      if (edge < 0.08) {
        const m = sm(0.08, 0.02, edge);
        mixInto(S, mortar, m);
        const mm = clamp(texNoise(u * 14, v * 14, s + 5, 14, 14) * 1.6 + 0.2) * mossAmt;
        mixInto(S, moss, m * mm);
      }
      if (wet) { const d = 1 - wet * 0.4; S.r *= d; S.g *= d; S.b *= d; S.sp = wet * dome * 0.9; }
    });
  },
  // running-bond brick wall with recessed mortar, burnt/varied bricks, efflorescence
  brick(w, h, o, s) {
    const base = col(o.color || "#8a4a36"), mortar = col(o.mortar || "#9a948a"), burnt = col("#4a2a22"), salt = col("#bdb4a6");
    const rows = o.rows || 8, per = o.per || 4;
    const wet = clamp(o.wet || 0);
    return surface(w, h, { bump: 2, ao: 2.6, ambient: 0.4 }, (u, v, S) => {
      const r = Math.floor(v * rows);
      const off = (r % 2) * 0.5;
      const bxF = u * per + off;
      const bi = Math.floor(bxF);
      const lx = bxF - bi, ly = v * rows - r;
      const bw = w / per, bh = h / rows;
      const dEdge = Math.min(Math.min(lx, 1 - lx) * bw, Math.min(ly, 1 - ly) * bh);
      const mw = Math.max(1.2, bh * 0.12);
      const id = ih(wrap(bi, per), r, s);
      const n = texFbm(u * 16, v * 16, s + 1, 4, 16, 16);
      const fine = texNoise(u * 96, v * 96, s + 2, 96, 96);
      const bev = sm(mw, mw + bh * 0.18, dEdge);
      S.h = bev * 0.8 + n * 0.08 + fine * 0.05;
      const tone = 0.78 + ((id & 255) / 255) * 0.42;
      mixC(S, base, burnt, ((id >>> 8) & 255) > 215 ? 0.55 : ((id >>> 8) & 255) / 255 * 0.25, tone);
      const k = 0.9 + n * 0.2 + fine * 0.08;
      S.r *= k; S.g *= k; S.b *= k;
      if (dEdge < mw + 0.6) mixC(S, mortar, mortar, 0, 0.85 + fine * 0.1);
      mixInto(S, salt, clamp((texFbm(u * 3, v * 3, s + 9, 3, 3, 3) - 0.25) * 1.5) * 0.35);
      if (wet) { const d = 1 - wet * 0.35; S.r *= d; S.g *= d; S.b *= d; S.sp = wet * 0.3; }
    });
  },
  // painted plaster/render: low relief trowel marks, grime stains, optional hairline cracks
  plaster(w, h, o, s) {
    const base = col(o.color || "#cdbfa9"), grime = col(o.grime || "#6a5e50");
    const stain = o.stain == null ? 0.35 : o.stain;
    return surface(w, h, { bump: 0.8, ao: 1.6, ambient: 0.55 }, (u, v, S) => {
      const n = texFbm(u * 5, v * 5, s, 5, 5, 5);
      const trowel = texNoise(u * 14, v * 7, s + 4, 14, 7);
      const fine = texNoise(u * 140, v * 140, s + 2, 140, 140);
      let crack = 0;
      if (o.cracks && texNoise(u * 2, v * 2, s + 12, 2, 2) > 0.2) {
        const cf = (a, b) => texNoise(a * 3, b * 3, s + 6, 3, 3) + texNoise(a * 9, b * 9, s + 7, 9, 9) * 0.3;
        const c0 = cf(u, v), du = 1 / w;
        const gm = Math.hypot(cf(u + du, v) - c0, cf(u, v + du) - c0) + 1e-5;
        crack = (1 - clamp(Math.abs(c0) / gm / 0.55)) * 0.6; // ~1 texel wide line along the zero crossing
      }
      S.h = 0.5 + trowel * 0.12 + fine * 0.05 + n * 0.08;
      setC(S, base, 0.94 + n * 0.08 + fine * 0.04);
      const st = clamp((texFbm(u * 2, v * 2, s + 8, 4, 2, 2) + v * 0.4 - 0.35) * 1.6) * stain;
      mixInto(S, grime, st * 0.6);
      if (crack > 0) { const c = crack; S.h -= c * 0.3; mixInto(S, grime, c * 0.75); }
    });
  },
  // wood: planks along x with grain rings, fibres, knots, end joints and dark gaps
  wood(w, h, o, s) {
    const base = col(o.color || "#8a5a36"), dark = col(o.dark || "#4a2e1a"), light = col(mix(o.color || "#8a5a36", "#e2b88a", 0.35));
    const P = o.planks || 4, L = o.joints || 1;
    return surface(w, h, { bump: 0.9, ao: 2.2, ambient: 0.45, light: [-0.3, -0.5, 0.8] }, (u, v, S) => {
      const pi = Math.floor(v * P), ly = v * P - pi;
      const pid = ih(pi, 1, s);
      const jx = u * L + (pid & 1023) / 1023;
      const ji = Math.floor(jx), lx = jx - ji;
      const id2 = ih(pi, wrap(ji, L), s + 3);
      const warp = texFbm(u * 3, v * P * 0.5, s + (id2 & 63), 3, 3, 0) * 2.2;
      const ring = 0.5 + 0.5 * Math.sin((ly * 3.5 + warp + (id2 & 255) / 40) * TAU * 1.6);
      const fib = texNoise(u * 4, v * 220, s + 7, 4, 220) * 0.5 + texNoise(u * 18, v * 400, s + 8, 18, 400) * 0.5;
      let kn = 0;
      if ((id2 & 7) === 0) {
        const kx = ((id2 >>> 3) & 255) / 255, kyl = 0.3 + (((id2 >>> 11) & 255) / 255) * 0.4;
        const dxk = (lx - kx) * w / L / (h / P), dyk = (ly - kyl);
        const d = Math.hypot(dxk * 0.5, dyk);
        kn = sm(0.16, 0.0, d);
      }
      const tone = 0.82 + ((pid >>> 12) & 255) / 255 * 0.3;
      mixC(S, dark, light, clamp(ring * 0.55 + fib * 0.18 + 0.3 - kn * 0.8), tone);
      mixInto(S, base, 0.35);
      S.h = 0.6 + fib * 0.06 - ring * 0.04;
      const gap = Math.min(ly, 1 - ly) * h / P, gapX = Math.min(lx, 1 - lx) * w / L;
      if (gap < 1.4 || gapX < 1) { S.h = 0; setC(S, dark, 0.35); }
      else if (gap < 3) S.h *= 0.85;
      if (o.varnish) S.sp = 0.35;
    });
  },
  // bark: vertical ridged furrows, grey-brown with lichen flecks (tile vertically on trunks)
  bark(w, h, o, s) {
    const base = col(o.color || "#5a4a3c"), deep = col("#1e1712"), lich = col("#8f9a72");
    return surface(w, h, { bump: 2.6, ao: 3.4, ambient: 0.35, light: [-0.8, -0.3, 0.55] }, (u, v, S) => {
      const r = texRidged(u * 6, v * 1.5, s, 5, 6, 0);
      const plate = texRidged(u * 10 + texNoise(u * 4, v * 3, s + 2, 4, 3) * 0.6, v * 3, s + 4, 3, 10, 3);
      const fine = texNoise(u * 60, v * 30, s + 5, 60, 30);
      S.h = r * 0.7 + plate * 0.3 + fine * 0.05;
      mixC(S, deep, base, clamp(S.h * 1.25));
      const l = texFbm(u * 5, v * 5, s + 9, 4, 5, 5);
      if (l > 0.3) mixInto(S, lich, sm(0.3, 0.5, l) * 0.55 * clamp(S.h * 1.5));
    });
  },
  // granite / weathered stone: three-mineral speckle, tonal fbm, lichen crusts, pits
  granite(w, h, o, s) {
    const base = col(o.color || "#7a7670"), dk = col("#2e2c2a"), lt = col("#c4beb2"), lich = col(o.lichenColor || "#a6a65a"), lich2 = col("#c78a3a");
    const lichen = o.lichen == null ? 0.5 : o.lichen;
    return surface(w, h, { bump: 1.6, ao: 2.6, ambient: 0.4 }, (u, v, S, x, y) => {
      const n = texFbm(u * 4, v * 4, s, 5, 4, 4);
      const rr = texRidged(u * 3, v * 3, s + 1, 4, 3, 3);
      const sp = rnd(x, y, s + 3), sp2 = texNoise(u * 90, v * 90, s + 4, 90, 90);
      S.h = 0.5 + n * 0.3 + rr * 0.2 + sp2 * 0.04;
      setC(S, base, 0.85 + n * 0.25);
      if (sp2 > 0.5) mixInto(S, dk, 0.55);
      else if (sp2 < -0.55) mixInto(S, lt, 0.5);
      const k = 0.92 + sp * 0.16;
      S.r *= k; S.g *= k; S.b *= k;
      const l = texFbm(u * 6, v * 6, s + 7, 4, 6, 6) + (1 - v) * 0.1;
      if (lichen > 0 && l > 0.25) {
        const m = sm(0.25, 0.4, l) * lichen;
        mixInto(S, (ih(Math.floor(u * 6), Math.floor(v * 6), s) & 3) === 0 ? lich2 : lich, m * (0.7 + sp * 0.3));
        S.h += m * 0.08 * sp;
      }
    });
  },
  // sand: warm grain, wind ripples, darker damp patches
  sand(w, h, o, s) {
    const base = col(o.color || "#c9ab7c"), dk = col("#8a6e48");
    return surface(w, h, { bump: 1.4, ao: 1.8, ambient: 0.45 }, (u, v, S, x, y) => {
      const n = texFbm(u * 4, v * 4, s, 4, 4, 4);
      const rip = Math.sin((v * 22 + texFbm(u * 3, v * 3, s + 2, 3, 3, 3) * 1.8) * TAU);
      const g = rnd(x, y, s + 1);
      S.h = 0.5 + rip * 0.12 * (o.ripples == null ? 1 : o.ripples) + (g - 0.5) * 0.1;
      mixC(S, dk, base, clamp(0.7 + n * 0.5 + (g - 0.5) * 0.2));
    });
  },
  // basalt / lava rock: vesicles, ridged fractures; `glow` makes the cracks emissive
  lavarock(w, h, o, s) {
    const base = col(o.color || "#3a3533"), dk = col("#141212");
    const glowAmt = o.glow == null ? 0 : o.glow;
    return surface(w, h, { bump: 2, ao: 3, ambient: 0.35 }, (u, v, S, x, y) => {
      const n = texFbm(u * 5, v * 5, s, 5, 5, 5);
      const vo = texVoronoi(u * 30, v * 30, s + 2, 30, 30);
      const hole = (vo.id & 15) === 0 ? sm(0.12 + ((vo.id >>> 6) & 15) / 70, 0.04, vo.f1) : 0;
      const cr = texRidged(u * 4, v * 4, s + 5, 4, 4, 4);
      const g = rnd(x, y, s + 9);
      S.h = 0.55 + n * 0.35 - hole * 0.35 - sm(0.85, 0.97, cr) * 0.5;
      mixC(S, dk, base, clamp(0.6 + n * 0.7 + (g - 0.5) * 0.25 - hole * 0.6));
      if (glowAmt > 0) {
        const c = sm(0.8, 0.97, cr) * glowAmt;
        if (c > 0) { S.e = c; S.er = 255; S.eg = 120 + c * 100; S.eb = 30 + c * 40; }
      }
    });
  },
  lava(w, h, o, s) { return GEN.lavarock(w, h, { ...o, glow: o.glow == null ? 1 : o.glow }, s); },
  // patchwork quilt: puffy squares, fabric weave, quilting stitches
  quilt(w, h, o, s) {
    const cols = (o.colors || ["#4a6fa5", "#e0b25a", "#c2575b", "#7a9a6a", "#e8dcc6"]).map(col);
    const n0 = o.cells || 4;
    return surface(w, h, { bump: 1.6, ao: 2.6, ambient: 0.45 }, (u, v, S) => {
      const cx = Math.floor(u * n0), cy = Math.floor(v * n0);
      const lx = u * n0 - cx, ly = v * n0 - cy;
      const id = ih(cx, cy, s);
      const c = cols[(cx + cy * 2 + (id & 1)) % cols.length];
      const puff = Math.sin(lx * Math.PI) * Math.sin(ly * Math.PI);
      const weave = Math.sin(u * w * 1.6) * Math.sin(v * h * 1.6);
      S.h = Math.pow(puff, 0.6) * 0.8 + weave * 0.03;
      setC(S, c, 0.92 + weave * 0.05);
      // small print on alternate patches
      if ((id & 3) === 1 && Math.sin(lx * 22) * Math.sin(ly * 22) > 0.7) mixInto(S, [255, 248, 235], 0.35);
      const e = Math.min(lx, 1 - lx, ly, 1 - ly);
      if (e < 0.06) { const st = (Math.floor((lx + ly) * 60) % 2) ? 0.2 : 0; mixInto(S, [240, 230, 210], st); }
    });
  },
  // woven fabric (cotton / wool): fine twill weave plus slub noise
  fabric(w, h, o, s) {
    const base = col(o.color || "#7a4a3a");
    const f = o.weave || 0.9;
    return surface(w, h, { bump: 0.8, ao: 1.4, ambient: 0.5 }, (u, v, S, x, y) => {
      const tw = Math.sin((x + y) * f * 1.4) * 0.5 + Math.sin(x * f * 2.2) * Math.sin(y * f * 2.2) * 0.5;
      const slub = texNoise(u * 8, v * 64, s, 8, 64) * 0.5 + texNoise(u * 64, v * 8, s + 1, 64, 8) * 0.5;
      S.h = 0.5 + tw * 0.2 + slub * 0.1;
      setC(S, base, 0.9 + tw * 0.08 + slub * 0.08);
    });
  },
  // wallpaper: vertical stripes + a repeating damask-ish motif, paper grain and age
  wallpaper(w, h, o, s) {
    const base = col(o.color || "#b8a07a"), ink = col(o.ink || mix(o.color || "#b8a07a", "#3a2a1a", 0.35)), age = col("#6a5232");
    const motif = o.motif || "damask";
    return surface(w, h, { bump: 0.35, ao: 1, ambient: 0.6 }, (u, v, S, x, y) => {
      let m = 0;
      if (motif === "stripe") m = (u * 4) % 1 < 0.28 ? 1 : 0;
      else {
        const lx = ((u * 2) % 1) - 0.5, ly = ((v * 2) % 1) - 0.5;
        const ax = Math.abs(lx);
        const r = Math.hypot(ax * 1.4, ly);
        const petal = Math.abs(Math.sin(Math.atan2(ly, ax) * 3)) * 0.12 + 0.18;
        m = r < petal ? 1 : 0;
        if (Math.abs(r - 0.32) < 0.012 && ly < 0) m = 1;
        if (ax < 0.012 && ly > 0.1) m = 1;
        const lx2 = (((u * 2) + 0.5) % 1) - 0.5, ly2 = (((v * 2) + 0.5) % 1) - 0.5;
        if (Math.hypot(lx2, ly2) < 0.05) m = 1;
      }
      const grain = rnd(x, y, s) - 0.5;
      const n = texFbm(u * 3, v * 3, s + 1, 4, 3, 3);
      S.h = 0.5 + m * 0.2 + grain * 0.05;
      setC(S, base, 1 + grain * 0.05);
      if (m) mixInto(S, ink, 0.45);
      mixInto(S, age, clamp(n * 0.6 + 0.1) * (o.age == null ? 0.4 : o.age));
    });
  },
  // brushed / painted metal: anisotropic streaks, scratches, optional rust
  metal(w, h, o, s) {
    const base = col(o.color || "#8a8d92"), rust = col("#7a3e1e");
    const rustAmt = o.rust || 0;
    return surface(w, h, { bump: 0.6, ao: 1.5, ambient: 0.5 }, (u, v, S, x, y) => {
      const br = texNoise(u * 2, v * 60, s, 2, 60) * 0.6 + (rnd(x >> 2, y, s + 1) - 0.5) * 0.8;
      const n = texFbm(u * 4, v * 4, s + 2, 3, 4, 4);
      S.h = 0.5 + br * 0.08;
      setC(S, base, 0.88 + br * 0.12 + n * 0.08);
      S.sp = 0.6;
      if ((rnd(x >> 3, y, s + 3) > 0.995)) { mixInto(S, [230, 230, 235], 0.4); }
      if (rustAmt > 0) { const r = clamp((texFbm(u * 6, v * 6, s + 4, 5, 6, 6) - 0.1) * 2) * rustAmt; mixInto(S, rust, r); S.h += r * 0.2; S.sp *= 1 - r; }
    });
  },
  // roof shingles: staggered rows of tabs with drop shadows and granule speckle
  shingle(w, h, o, s) {
    const base = col(o.color || "#3a3a3e");
    const rows = o.rows || 8, per = o.per || 5;
    return surface(w, h, { bump: 2.2, ao: 2.8, ambient: 0.4, light: [-0.3, -0.85, 0.5] }, (u, v, S, x, y) => {
      const r = Math.floor(v * rows), ly = v * rows - r;
      const bxF = u * per + (r % 2) * 0.5 + ((ih(r, 0, s) & 255) / 255) * 0.2;
      const bi = Math.floor(bxF), lx = bxF - bi;
      const id = ih(wrap(bi, per), r, s);
      const g = rnd(x, y, s + 1);
      S.h = ly * 0.8 + (g - 0.5) * 0.08;
      setC(S, base, 0.75 + ((id & 255) / 255) * 0.35);
      const k = 0.9 + g * 0.2;
      S.r *= k; S.g *= k; S.b *= k;
      if (Math.min(lx, 1 - lx) * w / per < 1) { S.h *= 0.4; S.r *= 0.5; S.g *= 0.5; S.b *= 0.5; }
      if (ly > 0.92) { S.r *= 0.55; S.g *= 0.55; S.b *= 0.55; }
    });
  },
  // painted lap siding (clapboard): overlapping boards with shadow lines and paint wear
  siding(w, h, o, s) {
    const base = col(o.color || "#d8cbb4"), wear = col("#8a7a66");
    const rows = o.rows || 10;
    return surface(w, h, { bump: 2.4, ao: 2.4, ambient: 0.45, light: [-0.2, -0.9, 0.45] }, (u, v, S, x, y) => {
      const ly = (v * rows) % 1;
      const grain = texNoise(u * 6, v * 120, s, 6, 120);
      S.h = ly * 0.9;
      setC(S, base, 0.95 + grain * 0.04);
      const n = texFbm(u * 4, v * 4, s + 2, 4, 4, 4);
      mixInto(S, wear, clamp(n - 0.25) * 0.5);
    });
  },
  // raindrops on glass: alpha texture of lensing beads (dark rim, bright cap, caustic)
  glassdrops(w, h, o, s) {
    const dens = o.density == null ? 1 : o.density;
    return field(w, h, (u, v, out) => {
      out[0] = out[1] = out[2] = 0; out[3] = 0;
      const vo = texVoronoi(u * 12, v * 12, s, 12, 12);
      const id = vo.id;
      if (((id & 255) / 255) > 0.26 * dens + 0.08) return;
      const r = 0.12 + ((id >>> 8) & 255) / 255 * 0.2;
      const dx = (u * 12 - vo.cx) / r, dy = (v * 12 - vo.cy) / (r * 1.1);
      const d = Math.hypot(dx, dy);
      if (d > 1) return;
      // a water bead is a tiny lens: mostly see-through, a dark refracted rim, one specular point
      // toward the light, and a soft caustic on the opposite side
      const rim = sm(0.55, 0.95, d) * (1 - sm(0.95, 1, d));
      const spec = sm(0.3, 0.05, Math.hypot(dx + 0.38, dy + 0.42));
      const caus = sm(0.55, 0.1, Math.hypot(dx - 0.18, dy - 0.5)) * 0.35;
      const l = clamp(spec + caus);
      out[0] = 18 + 237 * l; out[1] = 24 + 231 * l; out[2] = 34 + 221 * l;
      out[3] = 255 * clamp(rim * 0.32 + spec * 0.9 + caus * 0.5 + 0.05);
    });
  },
  // cloud density (white, alpha = density): billowy fbm with soft threshold
  cloud(w, h, o, s) {
    const cover = o.cover == null ? 0.5 : o.cover;
    return field(w, h, (u, v, out) => {
      const n = texFbm(u * 4 + texFbm(u * 2, v * 2, s + 3, 3, 2, 2) * 0.5, v * 4, s, 6, 4, 4);
      const a = sm(0.35 - cover * 0.7, 0.75 - cover * 0.5, n * 0.5 + 0.5);
      out[0] = out[1] = out[2] = 255; out[3] = a * 255;
    });
  },
  // nebula / milky-way glow: domain-warped colour fbm, alpha = brightness
  nebula(w, h, o, s) {
    const cols = (o.colors || ["#2a3a7a", "#7a3a8a", "#d08a6a"]).map(col);
    return field(w, h, (u, v, out) => {
      const wx = texFbm(u * 3, v * 3, s + 1, 4, 3, 3), wy = texFbm(u * 3 + 5.2, v * 3, s + 2, 4, 3, 3);
      const n = texFbm(u * 3 + wx * 0.8, v * 3 + wy * 0.8, s, 6, 3, 3) * 0.5 + 0.5;
      const d = texRidged(u * 4 + wx, v * 4 + wy, s + 4, 4, 4, 4);
      const a = clamp(Math.pow(n, 2.2) * 1.4 - d * 0.25);
      const t = clamp(n * 1.3 - 0.2);
      const c = t < 0.5 ? [lerp(cols[0][0], cols[1][0], t * 2), lerp(cols[0][1], cols[1][1], t * 2), lerp(cols[0][2], cols[1][2], t * 2)]
        : [lerp(cols[1][0], cols[2][0], t * 2 - 1), lerp(cols[1][1], cols[2][1], t * 2 - 1), lerp(cols[1][2], cols[2][2], t * 2 - 1)];
      out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; out[3] = a * 255;
    });
  },
  // neutral film-like noise (grey around 128) for dithering gradients / grit overlays
  noise(w, h, o, s) {
    return field(w, h, (u, v, out, x, y) => {
      const n = (rnd(x, y, s) + rnd(x, y, s + 1) - 1) * (o.amp || 60) + texNoise(u * 16, v * 16, s + 2, 16, 16) * 20;
      out[0] = out[1] = out[2] = 128 + n; out[3] = 255;
    });
  },
  // dense foliage (hedge / bush / canopy fill): leaf cells lit from above with deep gaps
  foliage(w, h, o, s) {
    const base = col(o.color || "#3d5a2c"), dk = col("#0e170b"), lt = col(mix(o.color || "#3d5a2c", "#d8e870", 0.35));
    return surface(w, h, { bump: 2.4, ao: 3.6, ambient: 0.3, light: [-0.4, -0.8, 0.5] }, (u, v, S) => {
      const vo = texVoronoi(u * 22, v * 22, s, 22, 22);
      const leaf = sm(0.55, 0.1, vo.f1);
      const n = texFbm(u * 4, v * 4, s + 1, 4, 4, 4);
      S.h = leaf * 0.6 + n * 0.3 + 0.2;
      mixC(S, dk, base, clamp(leaf * 1.1 + n * 0.3));
      const tint = ((vo.id & 255) / 255 - 0.5) * 0.25;
      S.r *= 1 + tint; S.g *= 1 + tint * 0.4;
      if (leaf > 0.7) mixInto(S, lt, (leaf - 0.7) * 0.8 * clamp(n + 0.6));
    });
  },
};

// texture(name, o) -> canvas (cached). o.size (default 128, square; features scale with u,v so a bigger size is only sharper) or o.w/o.h; o.seed.
const texKey = (name, o) => name + ":" + Math.max(16, Math.round(o.w || o.size || 128)) + "x" + Math.max(16, Math.round(o.h || o.size || 128)) + ":" + JSON.stringify(o);
export function texture(name, o = {}) {
  const gen = GEN[name] || GEN.noise;
  const w = Math.max(16, Math.round(o.w || o.size || 128)), h = Math.max(16, Math.round(o.h || o.size || 128));
  const key = texKey(name, o);
  let c = cacheGet(key);
  if (c) return c;
  try { c = gen(w, h, o, seedNum(o.seed == null ? 1 : o.seed)); } catch (err) { console.warn("[filmkit] texture failed", name, err); c = makeCanvas(w, h); c.avg = "#808080"; }
  cachePut(key, c);
  return c;
}
// texBake(key, w, h, fn) -> canvas: bake your own per-pixel raster once (cached with the textures).
// fn(u, v, out[4], x, y) writes rgba 0..255 into out.
export function texBake(key, w, h, fn) {
  const k = "bake:" + key + ":" + w + "x" + h;
  let c = cacheGet(k);
  if (c) return c;
  try { c = field(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), fn); } catch (err) { console.warn("[filmkit] texBake failed", key, err); c = makeCanvas(w, h); c.avg = "#000"; }
  cachePut(k, c);
  return c;
}
export function texAvg(name, o = {}) { return texture(name, o).avg; }
// texPrewarm(list, budgetMs) - build textures ahead of time (e.g. from a player's update(dt) during a
// title card) so a shot's first frame does not stall. list: ["turf", ["brick", {seed: 2}], ...].
// Builds until the time budget is spent; returns how many are still unbuilt (call again next tick).
export function texPrewarm(list, budgetMs = 8) {
  const t0 = performance.now();
  let left = 0;
  for (const it of list || []) {
    const name = Array.isArray(it) ? it[0] : it, o = (Array.isArray(it) && it[1]) || {};
    if (CACHE.has(texKey(name, o))) continue;
    if (performance.now() - t0 > budgetMs) { left++; continue; }
    texture(name, o);
  }
  return left;
}
export const TEXTURE_NAMES = Object.freeze(Object.keys(GEN));

const PATS = new WeakMap();
// texPattern(g, name, o) -> a repeating CanvasPattern for the texture (cached per context).
export function texPattern(g, name, o = {}) {
  const c = texture(name, o);
  let m = PATS.get(c);
  if (!m) { m = new WeakMap(); PATS.set(c, m); }
  let p = m.get(g);
  if (!p) { p = g.createPattern(c, "repeat"); m.set(g, p); }
  return p;
}
const texOpts = (name, o) => (o.tex && typeof o.tex === "object" ? o.tex : o.texOpts || { seed: o.seed == null ? 1 : o.seed });
function setPatXf(p, a, b, c, d, e, f) {
  if (p && p.setTransform && typeof DOMMatrix !== "undefined") p.setTransform(new DOMMatrix([a, b, c, d, e, f]));
}
// texRect(g, name, x, y, w, h, {scale, ox, oy, rot, alpha, tint, tintAlpha, mode, tex:{generator opts}})
// Tiles the texture over a rectangle. scale = on-screen size of one tile in px (default = texture size).
export function texRect(g, name, x, y, w, h, o = {}) {
  const p = new Path2D();
  p.rect(x, y, w, h);
  texFill(g, name, p, { ...o, _x: x, _y: y });
}
// texFill(g, name, path, {...}) - same as texRect, but fills any Path2D.
export function texFill(g, name, path, o = {}) {
  const to = texOpts(name, o);
  const c = texture(name, to);
  const pat = texPattern(g, name, to);
  const sc = (o.scale || c.width) / c.width, sy = (o.scaleY || o.scale || c.height) / c.height;
  const rot = o.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot);
  setPatXf(pat, cs * sc, sn * sc, -sn * sy, cs * sy, (o._x || 0) + (o.ox || 0), (o._y || 0) + (o.oy || 0));
  g.save();
  g.globalAlpha *= o.alpha == null ? 1 : o.alpha;
  if (o.mode) g.globalCompositeOperation = o.mode;
  g.fillStyle = pat;
  g.fill(path);
  if (o.tint) {
    g.globalCompositeOperation = o.tintMode || "multiply";
    g.globalAlpha = (o.alpha == null ? 1 : o.alpha) * (o.tintAlpha == null ? 0.6 : o.tintAlpha);
    g.fillStyle = o.tint;
    g.fill(path);
  }
  g.restore();
}

// groundPlane(g, W, H, o) - a textured ground receding to the horizon in true perspective.
//  o.tex       texture name (default "turf") ; o.texOpts generator options
//  o.horizon   horizon y (px, or a 0..1 fraction of H; default 0.6)
//  o.scale     on-screen width of one texture tile at the bottom edge (px, default 220)
//  o.focal     focal length in px (default W) - smaller = steeper, more top-down look
//  o.camX/camZ scroll the ground sideways / forwards in tiles (animate with t for dolly moves)
//  o.y1        bottom of the plane (default H) ; o.y0 top clip (a floor that starts below the eye line)
//  o.x0/o.x1   horizontal clip
//  o.fog       far haze colour (default = texture average) ; o.fogAmt (0..1, default 0.85)
//  o.tint      multiply tint colour ; o.tintAlpha
//  o.wet       0..1: darker, glossy, sky-reflecting (o.sky colour) with puddles (o.puddles 0..1)
//  o.alpha     overall alpha ; o.strips quality (default 44) ; o.rot90 turns the texture (floorboards
//              running away from camera) ; o.variation macro light/dark patches (0..1, default 0.55)
//  o.puddleScale tile size of the puddle mask (default 2.6 x scale)
//  o.cache     static grounds (no camX/camZ motion) are rendered once into a cached layer and then
//              cost one drawImage per frame; pass cache:false to force live drawing, true to force caching
export function groundPlane(g, W, H, o = {}) {
  const animated = (o.camX || 0) !== 0 || (o.camZ || 0) !== 0;
  if (o.cache === false || (animated && o.cache !== true)) { paintGround(g, W, H, o); return; }
  let hz = o.horizon == null ? 0.6 : o.horizon;
  if (hz <= 1.5) hz *= H;
  const top = Math.max(0, Math.floor(o.y0 == null ? hz : Math.max(hz, o.y0)));
  const y1 = Math.min(H, Math.ceil(o.y1 == null ? H : o.y1));
  if (y1 - top < 1) return;
  const spr = sprite("ground:" + JSON.stringify(o) + ":" + W + "x" + H, W, y1 - top, (s) => { s.translate(0, -top); paintGround(s, W, H, { ...o, _cached: true }); });
  g.drawImage(spr, 0, top, W, y1 - top);
}
function paintGround(g, W, H, o) {
  const name = o.tex || "turf";
  const to = o.texOpts || { seed: o.seed == null ? 1 : o.seed };
  let hz = o.horizon == null ? 0.6 : o.horizon;
  if (hz <= 1.5) hz *= H;
  const y1 = o.y1 == null ? H : o.y1;
  if (y1 <= hz + 1) return;
  const x0 = o.x0 == null ? 0 : o.x0, x1 = o.x1 == null ? W : o.x1;
  const c = texture(name, to);
  const ts = c.width;
  const scale = o.scale || 220;
  const f = o.focal || W;
  const D = H - hz;
  // pinhole camera: a tile spans T(y) = scale*(y-hz)/D px at row y, so its depth is z = f*D/(scale*(y-hz))
  // tiles, i.e. texture row v(y) = C / (y - hz)
  const C = (ts * f * (H - hz)) / scale;
  const camX = (o.camX || 0) * ts, camZ = (o.camZ || 0) * ts;
  const cx = o.cx == null ? W / 2 : o.cx;
  // thin strips keep converging lines straight (one strip = one affine slice); cached grounds can afford many
  const N = o.strips || Math.round(Math.max(44, o._cached ? (y1 - hz) / (o.rot90 ? 1 : 2.5) : 0));
  const dMin = 0.6, dMax = y1 - hz;
  const rot90 = !!o.rot90;
  // mip fade: where a texel shrinks below ~0.6 px the pattern only shimmers, so far strips fade
  // into the texture's mean colour (drawn underneath) - what a real lens + mipmaps would show.
  const fadeY = hz + Math.max(4, D * (ts / scale) * 0.4);
  const strips = (pat, mode, alpha, sc = scale, fade = true, ox = 0) => {
    g.save();
    const A = g.globalAlpha * alpha;
    if (mode) g.globalCompositeOperation = mode;
    g.fillStyle = pat;
    const Cs = (ts * f * (H - hz)) / sc;
    let ya = hz + dMin;
    for (let k = 1; k <= N; k++) {
      const yb = hz + dMin * Math.pow(dMax / dMin, k / N);
      const va = Cs / (ya - hz) + camZ * scale / sc, vb = Cs / (yb - hz) + camZ * scale / sc;
      const ym = (ya + yb) / 2;
      const T = sc * (ym - hz) / D;           // tile width on screen at this row
      const a = T / ts;
      const d = (yb - ya) / (vb - va);
      const e = cx - (camX * scale / sc + ts * 0.5 + ox) * a, ff = ya - va * d;
      if (rot90) setPatXf(pat, 0, d, a, 0, e, ff); else setPatXf(pat, a, 0, 0, d, e, ff);
      g.globalAlpha = A * (fade ? clamp((ym - hz) / (fadeY - hz) - 0.15) : 1);
      if (g.globalAlpha > 0.004) g.fillRect(x0, ya - 0.35, x1 - x0, yb - ya + 0.7);
      ya = yb;
    }
    g.restore();
  };
  g.save();
  g.beginPath();
  const yTop = o.y0 == null ? hz : Math.max(hz, o.y0);
  g.rect(x0, yTop, x1 - x0, y1 - yTop);
  g.clip();
  const pat = texPattern(g, name, to);
  g.save();
  g.globalAlpha *= o.alpha == null ? 1 : o.alpha;
  g.fillStyle = c.avg;
  g.fillRect(x0, yTop, x1 - x0, y1 - yTop);
  g.restore();
  strips(pat, null, o.alpha == null ? 1 : o.alpha);
  // macro variation: big soft light/dark patches at several times the tile size break the tiling
  const mv = o.variation == null ? 0.55 : o.variation;
  if (mv > 0) strips(texPattern(g, "macro", { seed: (to.seed || 1) + 5 }), "soft-light", mv * (o.alpha == null ? 1 : o.alpha), scale * 4.3, false, 37);
  const wet = clamp(o.wet || 0);
  if (wet > 0) {
    const sky = o.sky || "#8da2bf";
    // darker, more saturated wet surface
    g.globalCompositeOperation = "multiply";
    g.fillStyle = rgba("#55606e", wet * 0.55);
    g.fillRect(x0, hz, x1 - x0, y1 - hz);
    g.globalCompositeOperation = "source-over";
    // puddles reflecting the sky (fresnel: brighter toward the horizon)
    const pc = o.puddles == null ? 0.35 : o.puddles;
    if (pc > 0) {
      const pt = texPattern(g, "puddles", { seed: (to.seed || 1) + 17, cover: pc, color: mix(sky, "#000000", 0.35) });
      strips(pt, "source-over", wet * 0.85, o.puddleScale || scale * 2.6, true, 91);
    }
    const fr = g.createLinearGradient(0, hz, 0, y1);
    fr.addColorStop(0, rgba(sky, 0.4 * wet));
    fr.addColorStop(0.2, rgba(sky, 0.1 * wet));
    fr.addColorStop(1, rgba(sky, 0));
    g.globalCompositeOperation = "screen";
    g.fillStyle = fr;
    g.fillRect(x0, hz, x1 - x0, y1 - hz);
    g.globalCompositeOperation = "source-over";
  }
  if (o.tint) {
    g.globalCompositeOperation = o.tintMode || "multiply";
    g.fillStyle = rgba(o.tint, o.tintAlpha == null ? 0.7 : o.tintAlpha);
    g.fillRect(x0, hz, x1 - x0, y1 - hz);
    g.globalCompositeOperation = "source-over";
  }
  // atmospheric perspective: far ground dissolves into the haze (also hides minification shimmer)
  const fogC = o.fog || (o.tint ? mix(c.avg, o.tint, 0.5) : c.avg);
  const fa = o.fogAmt == null ? 0.85 : o.fogAmt;
  if (fa > 0) {
    const fg = g.createLinearGradient(0, hz, 0, hz + D * 0.55);
    fg.addColorStop(0, rgba(fogC, fa));
    fg.addColorStop(0.08, rgba(fogC, fa * 0.6));
    fg.addColorStop(0.3, rgba(fogC, fa * 0.18));
    fg.addColorStop(1, rgba(fogC, 0));
    g.fillStyle = fg;
    g.fillRect(x0, hz, x1 - x0, D * 0.55 + 1);
  }
  g.restore();
}
