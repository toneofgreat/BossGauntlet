// films/f18.js - Chapter 18 "The Procession" (FILMS.md f18). Pre-dawn cloud stairs climbing a huge violet
// sky; you climb, and behind you every cat you ever found climbs too. At the top: the paw ring, dark and cold.
// Photographic pass: one motivated key everywhere - the sun, still below the rose horizon ahead and right -
// so cloud tops, fur and coat edges are rim-lit warm, and everything facing the lens sits in the cool,
// blue-violet light of the sky dome. Every surface that matters is a baked, per-pixel lit field: the cloud
// sea and high deck, each cloud step (a lit fbm heightfield with silver-lined edges), three cumulus towers
// (union-of-spheres volumes, backlit), the summit plateau, the paw stones (ellipsoid normal maps, pitted
// granite, frost) and the silver torus. Per-pixel work only ever runs inside those bakes, a few rows at a
// time from a time-boxed warm queue, so no frame after the fade-in does a full bake.
// draw(g, t, W, H) is a pure function of t; caches only ever hold static art.
import * as K from "../filmkit.js";
import { inLayer, put, CROWD, catBackSprite, cloudRow, coneHat, lines } from "./lib1820.js";

const D = 66;
const TAU = Math.PI * 2;
// Story switch: Biscuit walks at the head of the parade and sits by your boots at the summit (critic note).
// FILMS.md f19 reveals him on the far side of the portal; set false to keep him off-screen in this chapter.
const BISCUIT_ON_SCREEN = true;

// ---- palette (FILMS.md f18: deep blue-violet above, rose at the horizon, cloud tops lit pink) --------------
const NEAR = { key: "f18near", lit: "#e8a6a6", mid: "#5e4e92", shade: "#1e1c4c" };
const RIM = "#ffbea4";
const AMB = "#2e2c66"; // the sky dome: what lights everything facing the lens
const SHADOW = "#100e2e";
const SC = (c) => K.parseColor(c);
const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : 0);

// ---- progressive per-pixel bakes (own cache: the kit's caches can clear themselves mid-film) ---------------
// A job fills its canvas `rows` rows per step; get() finishes whatever is left synchronously, so drawing never
// depends on how much warming happened (draw stays pure); warming only moves the cost to earlier frames.
const JOB = new Map();
function job(key, w, h, rows, fn, post) {
  let j = JOB.get(key);
  if (!j) {
    const c = K.makeCanvas(w, h);
    j = { c, s: c.getContext("2d"), w, h, rows, fn, post, y: 0, done: false, out: null };
    JOB.set(key, j);
  }
  return j;
}
const PIX = [0, 0, 0, 0];
function jobStep(j) {
  if (j.done) return false;
  const n = Math.min(j.rows, j.h - j.y);
  const img = j.s.createImageData(j.w, n);
  const Dt = img.data;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < j.w; x++) {
      PIX[3] = 255;
      j.fn(x, j.y + y, PIX);
      const i = (y * j.w + x) * 4;
      Dt[i] = PIX[0]; Dt[i + 1] = PIX[1]; Dt[i + 2] = PIX[2]; Dt[i + 3] = PIX[3];
    }
  }
  j.s.putImageData(img, 0, j.y);
  j.y += n;
  if (j.y >= j.h) { j.done = true; j.out = j.post ? j.post(j.c) : j.c; }
  return true;
}
function jobGet(j) { while (!j.done) jobStep(j); return j.out; }

// Light the edges of a sprite that face (dx, dy) (device px): the part of the silhouette whose neighbour
// toward the light is empty. Bake-time only (or on small per-frame canvases via `scratch`).
function edgeLight(c, dx, dy, color, alpha, mode = "lighter", scratch = null, cw = c.width, ch = c.height) {
  const m = scratch || K.makeCanvas(cw, ch);
  const s = m.getContext("2d");
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalAlpha = 1;
  s.globalCompositeOperation = "copy";
  s.drawImage(c, 0, 0, cw, ch, 0, 0, cw, ch);
  s.globalCompositeOperation = "destination-out";
  s.drawImage(c, 0, 0, cw, ch, -dx, -dy, cw, ch);
  s.globalCompositeOperation = "source-in";
  s.fillStyle = color;
  s.fillRect(0, 0, cw, ch);
  s.globalCompositeOperation = "source-over";
  const g = c.getContext("2d");
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = alpha;
  g.globalCompositeOperation = mode;
  g.drawImage(m, 0, 0, cw, ch, 0, 0, cw, ch);
  g.restore();
}
function blurCopy(src, px, pad = 0) {
  const c = K.makeCanvas(src.width + pad * 2, src.height + pad * 2);
  const s = c.getContext("2d");
  if (K.hasFilter()) s.filter = `blur(${K.qblur(px)}px)`;
  s.drawImage(src, pad, pad);
  s.filter = "none";
  return c;
}

// ---- the baked cloud sea: a perspective heightfield of cumulus tops, lit from a sun below the horizon ------
const SEA_W = 640, SEA_H = 240, SEA_S = 2, SEA_STRIPS = 12, SEA_X = -160;
const SEA_COL = { deep: SC("#1b1a4a"), amb: SC("#5a579e"), lit: SC("#ffae98"), hot: SC("#ffdcc6"), haze: SC("#e2a0b2"), hazeFar: SC("#ffc6b6") };
function seaH(x, z, oct) {
  const cov = K.texFbm(x * 0.09, z * 0.11, 71, 2) * 0.5 + 0.5;
  let h = 0, a = 1, f = 0.3, n = 0;
  for (let o = 0; o < oct; o++) {
    const q = 1 - Math.abs(K.texNoise(x * f * 0.8, z * f * 1.3, 180 + o * 37));
    h += (1 - q * q) * a;
    n += a; a *= 0.48; f *= 2.07;
  }
  return (n > 0 ? h / n : 0.5) * (0.35 + cov * 0.9) + cov * 0.8;
}
function seaPixel(px, py, out) {
  const dy = (py + 0.5) * SEA_S + 0.8;
  const z = 120 / dy;
  const xs = (px + 0.5) * SEA_S - 640;
  const x = (xs * z) / 300;
  const foot = (z * SEA_S) / 300 + ((z * z * SEA_S) / 120) * 0.35;
  const oct = Math.max(1, Math.min(5, Math.floor(Math.log2(1.6 / foot))));
  const e = 0.05;
  const h = seaH(x, z, oct), hx = seaH(x + e, z, oct), hz = seaH(x, z + e, oct);
  let nx = (-(hx - h) / e) * 0.55, ny = 1, nz = (-(hz - h) / e) * 0.55;
  const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
  const Lx = 0.32, Ly = 0.22, Lz = 0.92;
  const diff = Math.max(0, (nx * Lx + ny * Ly + nz * Lz + 0.35) / 1.35);
  let sh = 1;
  for (let k = 1; k <= 3; k++) {
    const s = k * 0.35;
    const hs = seaH(x + Lx * s, z + Lz * s, Math.min(oct, 3));
    sh = Math.min(sh, K.clamp(1 - (hs - h - Ly * s * 0.9) * 1.8));
  }
  const ao = K.clamp(0.25 + h * 0.6);
  const C = SEA_COL;
  const amb = K.clamp(ny * 0.8) * ao;
  const lit = Math.pow(diff, 1.3) * sh;
  let r = C.deep[0] + (C.amb[0] - C.deep[0]) * amb, g = C.deep[1] + (C.amb[1] - C.deep[1]) * amb, b = C.deep[2] + (C.amb[2] - C.deep[2]) * amb;
  r += C.lit[0] * lit * 0.68; g += C.lit[1] * lit * 0.68; b += C.lit[2] * lit * 0.68;
  const rimk = Math.pow(lit, 5) * 0.35;
  r += C.hot[0] * rimk; g += C.hot[1] * rimk; b += C.hot[2] * rimk;
  // aerial perspective: rose haze thickening to the horizon (stronger forward scatter than before)
  const fh = 1 - Math.exp(-z * 0.085);
  const hzc = 1 - Math.exp(-z * 0.014);
  const HR = C.haze[0] + (C.hazeFar[0] - C.haze[0]) * hzc, HG = C.haze[1] + (C.hazeFar[1] - C.haze[1]) * hzc, HB = C.haze[2] + (C.hazeFar[2] - C.haze[2]) * hzc;
  out[0] = Math.min(255, r + (HR - r) * fh);
  out[1] = Math.min(255, g + (HG - g) * fh);
  out[2] = Math.min(255, b + (HB - b) * fh);
  out[3] = 255;
}
const seaStrip = (i) => K.texBake("f18sea2:" + i, SEA_W, SEA_H / SEA_STRIPS, (u, v, out, x, y) => seaPixel(x, y + (i * SEA_H) / SEA_STRIPS, out));

// ---- the high cloud deck: wind-stretched altostratus seen from below, undersides lit by the hidden sun -----
const DECK_W = 640, DECK_H = 140, DECK_S = 2;
const DECK_COL = { dark: SC("#262458"), mid: SC("#6e5490"), warm: SC("#ff9c86"), hot: SC("#ffd6b8") };
function deckPixel(px, py, out) {
  const dy = (DECK_H - py - 0.5) * DECK_S + 6;
  const z = 160 / dy;
  const xs = (px + 0.5) * DECK_S - 640;
  const x = (xs * z) / 300;
  const foot = (z * z * DECK_S) / 160;
  const oct = Math.max(1, Math.min(5, Math.floor(Math.log2(2 / Math.max(0.02, foot))) + 1));
  const w = K.texFbm(x * 0.08, z * 0.3, 905, 2);
  const n = K.texFbm(x * 0.12 + w * 0.6, z * 0.9, 911, oct) * 0.5 + 0.5;
  const big = K.texFbm(x * 0.03, z * 0.12, 917, 2) * 0.5 + 0.5;
  let d = K.clamp((n - 0.56 + big * 0.35) * 2.6);
  d = d * d * (3 - 2 * d);
  const az = Math.exp(-Math.pow((xs - 240) / 520, 2));
  const low = Math.exp(-dy / 90);
  const warm = K.clamp(low * (0.55 + az * 0.6) + az * 0.12);
  const thick = K.clamp(n * 1.2 - 0.2);
  const C = DECK_COL;
  const lit = warm * (1 - thick * 0.45);
  const m = 0.3 + low * 0.5;
  let r = C.dark[0] + (C.mid[0] - C.dark[0]) * m, g = C.dark[1] + (C.mid[1] - C.dark[1]) * m, b = C.dark[2] + (C.mid[2] - C.dark[2]) * m;
  r += (C.warm[0] - r) * lit; g += (C.warm[1] - g) * lit; b += (C.warm[2] - b) * lit;
  const hot = Math.pow(lit, 3) * (1 - thick) * 0.6;
  r += (C.hot[0] - r) * hot; g += (C.hot[1] - g) * hot; b += (C.hot[2] - b) * hot;
  out[0] = r; out[1] = g; out[2] = b;
  out[3] = 255 * d * Math.pow(K.clamp((dy - 10) / 110), 1.5) * 0.9;
}
const deckBake = () => K.texBake("f18deck", DECK_W, DECK_H, (u, v, out, x, y) => deckPixel(x, y, out));
let SEA = null;
const SEA_DONE = new Set();
function seaCanvas() {
  if (SEA) return SEA;
  const c = K.makeCanvas(SEA_W, SEA_H);
  const s = c.getContext("2d");
  for (let i = 0; i < SEA_STRIPS; i++) s.drawImage(seaStrip(i), 0, (i * SEA_H) / SEA_STRIPS);
  SEA = c;
  return c;
}
let DECK = null;
const deckCanvas = () => DECK || (DECK = deckBake());
function warmSky(n = 1) {
  if (SEA) return false;
  for (let i = 0; i < SEA_STRIPS && n > 0; i++) if (!SEA_DONE.has(i)) { seaStrip(i); SEA_DONE.add(i); n--; }
  if (n > 0 && !DECK) { deckCanvas(); n--; }
  if (n > 0 && SEA_DONE.size === SEA_STRIPS) seaCanvas();
  return true;
}

// ---- cloud steps: a baked, lit heightfield slab (tread lumps facing the sun, a billowed shaded riser, ------
// silver-lined edges where the low sun shines through the thin rim). Sprite space 300 x 140, tread centre
// (150, 46), ~244 wide. Six variants at 1x, two at 2x for steps close to the lens.
const SLC = { lit: SC("#ffd2c2"), hot: SC("#fff0e6"), mid: SC("#9a7eba"), shade: SC("#3a3674"), deep: SC("#1d1a4e") };
function slabPixel(X, Y, seed, out) {
  const u = (X - 150) / 122, dyc = Y - 46;
  const lump = K.texFbm(X * 0.045, Y * 0.09, seed, 3);
  const dep = (28 + 36 * Math.max(0, 1 - u * u)) * (0.7 + 0.6 * (K.texFbm(X * 0.018, 0.5, seed + 5, 2) * 0.5 + 0.5));
  const ry = dyc < 0 ? 24 : 24 + dep;
  const e = Math.hypot(u, dyc / ry);
  const bil = Math.abs(K.texNoise(X * 0.05, 3.5, seed + 3));
  // the rim is a chain of billows (ridged noise along the outline), not a clean ellipse
  const ang = Math.atan2(dyc / ry, u);
  const puff = 1 - Math.abs(K.texNoise(Math.cos(ang) * 3.2 + 7, Math.sin(ang) * 3.2 + 7, seed + 21));
  const puff2 = 1 - Math.abs(K.texNoise(Math.cos(ang) * 8 + 3, Math.sin(ang) * 8 + 3, seed + 23));
  const rEdge = 0.97 + lump * 0.06 + puff * puff * 0.13 + puff2 * 0.035 - (dyc > 0 ? bil * 0.16 * K.clamp(dyc / 24) : 0);
  if (e >= rEdge) { out[3] = 0; return; }
  let d = K.clamp((rEdge - e) / 0.05);
  d = d * d * (3 - 2 * d);
  const front = 24 * Math.sqrt(Math.max(0, 1 - u * u));
  const below = dyc - front;
  if (below > 3) {
    const w = K.texFbm(X * 0.07, Y * 0.13, seed + 7, 3) * 0.5 + 0.5;
    d *= K.clamp(1.3 - (below / (dep + 2)) * (0.55 + w * 0.95));
  }
  if (d <= 0.004) { out[3] = 0; return; }
  const C = SLC;
  const roll = K.clamp((below + 6) / 11);
  let r = 0, g = 0, b = 0;
  if (roll < 1) {
    // tread: soft lumps; slopes facing away from the lens (toward the sun) catch the warm light
    const h0 = K.texFbm(X * 0.022, Y * 0.075, seed + 9, 3);
    const hx = K.texFbm((X + 2) * 0.022, Y * 0.075, seed + 9, 3), hy = K.texFbm(X * 0.022, (Y + 1) * 0.075, seed + 9, 3);
    const gx = (hx - h0) * 8, gy = (hy - h0) * 15;
    const sl = (-gx * 0.35 + gy * 0.8) * 1.7;
    const lam = 0.5 + (0.5 * sl) / (1 + Math.abs(sl));
    const far = K.clamp(0.5 - dyc / 48);
    const k = K.clamp(0.22 + lam * 0.52 + far * 0.24);
    r = C.mid[0] + (C.lit[0] - C.mid[0]) * k; g = C.mid[1] + (C.lit[1] - C.mid[1]) * k; b = C.mid[2] + (C.lit[2] - C.mid[2]) * k;
    const hot = Math.pow(lam, 4) * far * 0.18;
    r += (C.hot[0] - r) * hot; g += (C.hot[1] - g) * hot; b += (C.hot[2] - b) * hot;
    // the near half of the tread curves toward the lens and leaves the light
    const nearK = K.clamp((dyc + front * 0.2) / (front + 4)) * 0.35;
    r += (C.mid[0] - r) * nearK; g += (C.mid[1] - g) * nearK; b += (C.mid[2] - b) * nearK;
  }
  if (roll > 0) {
    // riser: billows lit from the sky above, in their own shadow below, occluded under the lip
    const b0 = K.texFbm(X * 0.05, Y * 0.08, seed + 11, 3);
    const by = K.texFbm(X * 0.05, (Y + 2) * 0.08, seed + 11, 3) - b0;
    const up = K.clamp(0.5 + by * 10);
    const vert = K.clamp(below / (dep + 4));
    const k = K.clamp((0.18 + up * 0.55) * (1 - vert * 0.6));
    let rr = C.shade[0] + (C.mid[0] - C.shade[0]) * k, gg = C.shade[1] + (C.mid[1] - C.shade[1]) * k, bb = C.shade[2] + (C.mid[2] - C.shade[2]) * k;
    const ao = Math.exp(-Math.max(0, below) / 5) * 0.45 + vert * 0.3;
    rr += (C.deep[0] - rr) * ao; gg += (C.deep[1] - gg) * ao; bb += (C.deep[2] - bb) * ao;
    r += (rr - r) * roll; g += (gg - g) * roll; b += (bb - b) * roll;
  }
  // silver lining: the sun (far, right) shines through the thin rim of the slab
  const edgeK = 1 - K.clamp((rEdge - e) / 0.13);
  const sunFace = K.clamp(0.3 - (dyc / ry) * 0.6 + u * 0.45);
  const lin = edgeK * edgeK * sunFace * (dyc < front ? 0.75 : 0.35);
  r += (C.hot[0] - r) * lin; g += (C.hot[1] - g) * lin; b += (C.hot[2] - b) * lin;
  out[0] = r; out[1] = g; out[2] = b; out[3] = 255 * d;
}
const slabJob = (i, hi) => {
  const s = hi ? 2 : 1, seed = 6100 + i * 17;
  return job("slab" + i + ":" + hi, 300 * s, 140 * s, hi ? 6 : 10, (x, y, out) => slabPixel((x + 0.5) / s, (y + 0.5) / s, seed, out));
};
// slab(g, x, y, w, seed) - x, y = centre of the tread; w = tread width
function slab(g, x, y, w, seed = 0, alpha = 1) {
  const T = g.getTransform();
  const big = w * Math.hypot(T.a, T.b) > 300 * K.pixelScale();
  const c = big ? jobGet(slabJob(((seed % 2) + 2) % 2, 1)) : jobGet(slabJob(((seed % 6) + 6) % 6, 0));
  const k = w / 244;
  if (alpha < 0.999) { g.save(); g.globalAlpha *= alpha; }
  g.drawImage(c, x - 150 * k, y - 46 * k, 300 * k, 140 * k);
  if (alpha < 0.999) g.restore();
}

// ---- cumulus towers: union of spheres (domain-warped), backlit by the hidden sun: dark violet bodies, lit
// sky-facing tops, a glowing silver rim and translucent wisps on the sun side, shadowed undersides.
const TOWER_W = 320, TOWER_H = 280, TOWER_BASE = 258;
const TWC = { deep: SC("#221d50"), shade: SC("#493d86"), top: SC("#c890b0"), hot: SC("#ffd0b8"), haze: SC("#e0a0b4") };
const TOWERS = [{ seed: 1, haze: 0.16 }, { seed: 2, haze: 0.42 }, { seed: 3, haze: 0.64 }];
const TPUFF = [];
function towerPuffs(i) {
  if (TPUFF[i]) return TPUFF[i];
  const R = K.rng("f18tower" + i);
  const P = [];
  for (let k = 0; k < 9; k++) P.push([40 + R() * 240, 232 + R() * 16, 26 + R() * 22, (R() - 0.5) * 20]);
  let cx = 160 + (R() - 0.5) * 30, cy = 222, r = 60;
  for (let l = 0; l < 6; l++) {
    for (let k = 0; k < 3; k++) P.push([cx + (R() - 0.5) * r * 1.3, cy + (R() - 0.5) * r * 0.3, r * (0.6 + R() * 0.45), (R() - 0.5) * r * 0.5]);
    cx += (R() - 0.5) * 26 + 5; cy -= r * 0.72; r *= 0.8;
  }
  return (TPUFF[i] = P);
}
function towerPixel(X, Y, i, out) {
  const P = towerPuffs(i), seed = 7700 + i * 13;
  const wx = X + K.texFbm(X * 0.035, Y * 0.035, seed, 3) * 13 + K.texFbm(X * 0.13, Y * 0.13, seed + 5, 2) * 4.5;
  const wy = Y + K.texFbm(X * 0.035 + 5.3, Y * 0.035, seed + 1, 3) * 13 + K.texFbm(X * 0.13 + 2.1, Y * 0.13, seed + 6, 2) * 4.5;
  let best = -1e9, nx = 0, ny = 0, nz = 0, th = 0, rr = 1;
  for (let k = 0; k < P.length; k++) {
    const p = P[k];
    const dx = wx - p[0], dy = wy - p[1];
    const q = p[2] * p[2] - dx * dx - dy * dy;
    if (q <= 0) continue;
    const zz = Math.sqrt(q);
    if (zz + p[3] > best) { best = zz + p[3]; nx = dx / p[2]; ny = dy / p[2]; nz = zz / p[2]; th = zz; rr = p[2]; }
  }
  if (best < -1e8) { out[3] = 0; return; }
  const ero = K.texFbm(X * 0.09, Y * 0.09, seed + 2, 3) * 0.5 + 0.5;
  let a = K.clamp(th / 6) * K.clamp(1.25 - ero * 0.7 * (1 - K.clamp(th / (rr * 0.45))));
  a *= K.clamp((TOWER_BASE + 6 - Y) / 26);
  if (a <= 0.004) { out[3] = 0; return; }
  const C = TWC;
  const low = K.clamp((Y - 110) / 150);
  const sky = K.clamp(0.42 - ny * 0.6);
  const rim = Math.pow(1 - nz, 2.4) * K.clamp(nx * 0.8 - ny * 0.35 + 0.12);
  const trans = Math.exp(-th / 8) * K.clamp(nx * 0.6 + 0.5);
  const cav = K.clamp(nz * 1.5);
  // shadow side faces the lens and the west: dark; tops catch the rose sky; the sun side burns through
  const west = K.clamp(-nx * 0.6 + 0.4);
  const k = (0.2 + 0.8 * sky * (1 - low * 0.75)) * (0.6 + 0.4 * cav) * (1 - west * 0.35);
  let r = C.deep[0] + (C.shade[0] - C.deep[0]) * k, g = C.deep[1] + (C.shade[1] - C.deep[1]) * k, b = C.deep[2] + (C.shade[2] - C.deep[2]) * k;
  const tk = Math.pow(sky, 2.5) * (1 - low) * 0.6;
  r += (C.top[0] - r) * tk; g += (C.top[1] - g) * tk; b += (C.top[2] - b) * tk;
  const hk = K.clamp(rim * 1.25 + trans * 0.6) * (1 - low * 0.45);
  r += (C.hot[0] - r) * hk; g += (C.hot[1] - g) * hk; b += (C.hot[2] - b) * hk;
  const hz = K.clamp(TOWERS[i].haze * (0.6 + low * 0.7));
  r += (C.haze[0] - r) * hz; g += (C.haze[1] - g) * hz; b += (C.haze[2] - b) * hz;
  out[0] = r; out[1] = g; out[2] = b; out[3] = 255 * a;
}
const towerJob = (i) => job("tower" + i, TOWER_W, TOWER_H, 14, (x, y, out) => towerPixel(x + 0.5, y + 0.5, i, out));
// tower(g, x, baseY, h, i) - x = centre, baseY = where it stands in the sea, h = drawn height
function tower(g, x, baseY, h, i, alpha = 1) {
  const c = jobGet(towerJob(i));
  const k = h / TOWER_H;
  g.save();
  g.globalAlpha *= alpha;
  g.drawImage(c, x - (TOWER_W / 2) * k, baseY - TOWER_BASE * k, TOWER_W * k, TOWER_H * k);
  g.restore();
}

// ---- stairs: a catmull-rom path through [x, y, width] control points, cut into equal steps ----------------
function buildStair(ctrl, spacing) {
  const dense = [];
  const P = (i) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < 24; k++) {
      const u = k / 24, u2 = u * u, u3 = u2 * u;
      const v = [0, 1, 2].map((j) => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u3));
      dense.push(v);
    }
  }
  dense.push(ctrl[ctrl.length - 1].slice());
  const acc = [0];
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1], b = dense[i];
    acc.push(acc[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]) / ((a[2] + b[2]) / 2));
  }
  const total = acc[acc.length - 1];
  const n = Math.max(2, Math.round(total / spacing) + 1);
  const steps = [];
  let j = 0;
  for (let s = 0; s < n; s++) {
    const target = (s / (n - 1)) * total;
    while (j < acc.length - 2 && acc[j + 1] < target) j++;
    const f = (target - acc[j]) / Math.max(1e-6, acc[j + 1] - acc[j]);
    const a = dense[j], b = dense[j + 1];
    steps.push({ x: K.lerp(a[0], b[0], f), y: K.lerp(a[1], b[1], f), w: K.lerp(a[2], b[2], f), dx: b[0] - a[0] });
  }
  return steps;
}
function stairAt(S, f, lane = 0) {
  const n = S.length;
  f = K.clamp(f, 0, n - 1.001);
  const i = Math.floor(f), u = f - i;
  const a = S[i], b = S[i + 1];
  const e = K.smooth(K.clamp((u - 0.62) / 0.38));
  const w = K.lerp(a.w, b.w, e);
  const x = K.lerp(a.x, b.x, e) + lane * w * 0.24;
  const gy = K.lerp(a.y, b.y, e);
  const hop = Math.sin(Math.PI * e);
  const y = gy - hop * w * 0.014;
  const dir = (b.x - a.x) >= 0 ? 1 : -1;
  return { x, y, gy, hop, w, dir, i };
}
const S1 = buildStair([[110, 640, 560], [330, 500, 330], [430, 380, 170], [560, 280, 96], [520, 205, 56], [610, 150, 32], [690, 112, 18], [730, 92, 10]], 0.3);
const S2 = buildStair([[-260, 720, 600], [60, 640, 500], [320, 500, 400], [520, 360, 300], [610, 268, 200], [660, 205, 124], [720, 154, 72], [780, 118, 38], [820, 98, 18]], 0.3);
const S3 = buildStair([[920, 640, 320], [600, 560, 210], [280, 500, 140], [170, 440, 100], [380, 395, 74], [660, 352, 56], [760, 310, 42], [560, 272, 31], [330, 242, 23], [250, 212, 17], [410, 184, 13], [590, 160, 10], [660, 136, 7.5], [580, 116, 6], [520, 102, 4.6]], 0.3);

// ---- shared scenery -------------------------------------------------------------------------------------------
function heaven(g, W, H, t, hz, o = {}) {
  const sx = o.sunX == null ? W * 0.72 : o.sunX;
  g.save();
  g.translate(-100, -100);
  K.sky(g, W + 200, H + 200, { top: "#0a0d30", mid: "#2c2a68", bottom: "#ee9e90", horizon: (hz + 100) / (H + 200), haze: 0.75, sun: { x: sx + 100, y: hz + 146, color: "#ff9874" } });
  g.restore();
  const sa = o.stars == null ? 1 : o.stars;
  if (sa > 0.01) {
    g.save();
    g.globalAlpha *= sa * 0.8;
    K.stars(g, W, H, 18, 1.1, t, { yMax: hz * 0.6 });
    g.restore();
  }
  g.save();
  g.globalAlpha *= o.deck == null ? 1 : o.deck;
  g.drawImage(deckCanvas(), SEA_X, hz - DECK_H * DECK_S + 4, DECK_W * DECK_S, DECK_H * DECK_S);
  g.restore();
  // forward scatter around the hidden sun: a broad rose dome and a near-clipped core right on the horizon,
  // which the lens turns into a photographic sunrise glow (bloom + red halation)
  K.glow(g, sx, hz + 18, W * 0.62, "#ff8c7c", 0.22);
  K.glow(g, sx, hz + 10, W * 0.2, "#ffc8a6", 0.3);
  K.glow(g, sx, hz + 2, W * 0.07, "#fff0e2", 0.55);
}
function cloudSea(g, W, H, t, hz, sx = 700) {
  g.fillStyle = "#18173f";
  g.fillRect(-W, hz + SEA_H * SEA_S - 2, W * 3, H * 2);
  g.drawImage(seaCanvas(), SEA_X, hz, SEA_W * SEA_S, SEA_H * SEA_S);
  // the brightest air sits right on the horizon (forward scatter): a band, not a line, hotter toward the sun
  g.save();
  const gr = g.createLinearGradient(0, hz - 40, 0, hz + 80);
  gr.addColorStop(0, "rgba(255,190,172,0)");
  gr.addColorStop(0.33, "rgba(255,196,176,0.42)");
  gr.addColorStop(0.5, "rgba(255,186,170,0.2)");
  gr.addColorStop(1, "rgba(255,190,172,0)");
  g.fillStyle = gr;
  g.fillRect(-W, hz - 40, W * 3, 120);
  g.restore();
  g.save();
  g.translate(sx, hz);
  g.scale(4.5, 0.32);
  K.glow(g, 0, 0, 110, "#fff2e6", 0.5);
  g.restore();
}
function contact(g, x, gy, w, lift = 0, a = 0.55) {
  if (w < 1.5) return;
  K.shadowBlob(g, x, gy, w * (1 - lift * 0.25), w * 0.16 * (1 - lift * 0.25), { alpha: a * (1 - lift * 0.6), color: SHADOW, soft: 1.2 });
}

// ---- crowd cats: own sprite cache (one per coat / pose / gait frame / size bucket), edge-lit at bake ----------
// The kit cat is drawn with the sky as a cool key and the sun as a warm rim, then the silhouette edges that
// face the sun get an extra warm rim and the undersides a cool sky bounce.
const CATC = new Map();
const catBase = (size) => (size <= 12 ? 18 : size <= 50 ? 36 : size <= 100 ? 72 : Math.ceil(size / 16) * 16);
function catSpec(size, ci, o = {}) {
  const coat = ci < 0 ? K.COATS.biscuit : CROWD[ci % CROWD.length];
  const tailUp = o.tailUp == null ? 0.6 : o.tailUp;
  const base = catBase(size), ox = base * 3.3 * 0.48, oy = base * 2.4 * 0.86;
  const par = !!o.parade;
  const pose = o.pose || "walk";
  const rim = par ? { x: ox + 2400, y: oy - base * 0.6 - 260, color: "#ffb49c", strength: 1.6 } : { x: ox + 900, y: oy - 2200, color: "#ffbca6", strength: 1.35 };
  const key = { x: ox - 700, y: oy - 2000, color: "#a8a4e4", strength: 0.7 };
  return {
    base, steps: base === 18 ? Math.min(o.steps || 8, 6) : (o.steps || 8), hat: !!o.hat,
    edge: par ? [1, -0.32] : [0.25, -1],
    o: { pose, coat, collar: false, bell: false, tail: 0.6, tailUp, key, rim, fill: "#22204c", ambient: "#4a478c", ambientK: 0.3, backlit: par ? 0.75 : 0.45, pupil: 0.8 },
    key: (par ? "p" : "s") + (ci < 0 ? "B" : ci % CROWD.length) + ":" + pose + (o.hat ? "h" : "") + ":" + tailUp + ":" + base,
  };
}
function catSprite(spec, q) {
  const px = K.pixelScale();
  const k = spec.key + ":" + q + "/" + spec.steps + "@" + px;
  let c = CATC.get(k);
  if (c) return c;
  const base = spec.base, S = base < 40 ? 1.25 : 1;
  const SW = base * 3.3, SH = base * 2.4, ox = SW * 0.48, oy = SH * 0.86;
  c = K.makeCanvas(SW * S * px, SH * S * px);
  const s = c.getContext("2d");
  s.setTransform(px * S, 0, 0, px * S, 0, 0);
  try {
    const oo = Object.assign({}, spec.o, { facing: 1, phase: q / spec.steps, t: (q / spec.steps) * 2.3 });
    K.drawCat(s, ox, oy, base, oo);
    if (spec.hat) {
      const u = base / 60;
      const Hh = spec.o.pose === "sit" ? [16, -89] : [51, -73];
      coneHat(s, ox + (Hh[0] - 2) * u, oy + (Hh[1] - 13.5) * u, base * 0.42, 0.32, { rim: "#ffb49c" });
    }
    const e = Math.max(1, base * 0.03 * S * px);
    const [ex, ey] = spec.edge;
    edgeLight(c, ex * e, ey * e, "#ffc4a4", 0.5);
    edgeLight(c, ex * e * 2.4, ey * e * 2.4, "#ff9e84", 0.22);
    edgeLight(c, 0, e * 1.4, "#7a7ed0", 0.3);
  } catch (err) { console.warn("[f18] cat sprite", k, err); }
  c.m = { SW, SH, ox, oy };
  CATC.set(k, c);
  return c;
}
function drawCat18(g, x, y, size, facing, spec, ph, alpha = 1) {
  if (!(size > 0.5)) return;
  const q = Math.floor((((ph % 1) + 1) % 1) * spec.steps);
  const c = catSprite(spec, q);
  const m = c.m, sc = size / spec.base;
  g.save();
  if (alpha < 0.999) g.globalAlpha *= alpha;
  g.translate(x, y);
  g.scale((facing === -1 ? -1 : 1) * sc, sc);
  g.drawImage(c, -m.ox, -m.oy, m.SW, m.SH);
  g.restore();
}
// a cat on the stairs: contact shadow, a soft cast shadow falling toward the lens (the sun is ahead), the sprite
function stairCat(g, x, y, size, dir, ci, ph, o = {}) {
  if (o.gy != null && size > 3) {
    const lift = K.clamp((o.gy - y) / (size * 0.4));
    K.shadowBlob(g, x - dir * size * 0.05 - size * 0.12, o.gy + size * 0.1, size * 0.85, size * 0.2, { alpha: 0.32 * (1 - lift * 0.6), color: SHADOW, soft: 1.6 });
    contact(g, x + dir * size * 0.08, o.gy, size * 0.62, lift, 0.55);
  }
  drawCat18(g, x, y, size, dir, catSpec(size, ci, o), ph, o.alpha == null ? 1 : o.alpha);
}
const wishes = (list, need) => {
  const out = [];
  for (const [size, ci, o] of list) {
    const spec = catSpec(size, ci, o);
    for (let q = 0; q < spec.steps; q++) out.push({ need, spec, q });
  }
  return out;
};

// ---- you: from behind, lit by the sun ahead; drawn into a small layer so the coat gets real detail ----------
function drawPersonLit(g, x, y, h, t, ph, o) {
  K.drawPerson(g, x, y, h, {
    view: o.view || "back", facing: o.facing || 1, walk: o.walk !== false, phase: ph, t,
    hood: false, bell: true, hair: "#3e2618", shadow: false, alpha: o.alpha,
    light: { x: x + (o.lx == null ? 300 : o.lx), y: y - h * 0.4 + (o.ly == null ? 40 : o.ly), color: RIM, strength: 1.25, z: -0.55 },
    ambient: o.ambient || AMB,
  });
}
// static detail overlays in body units (h = 100), baked once
const hairTex = () => K.sprite("f18hair", 24, 24, (s) => {
  const R = K.rng("f18hair");
  s.lineCap = "round";
  for (let i = 0; i < 150; i++) {
    const a = -Math.PI / 2 + (R() - 0.5) * 2.8;
    const x0 = 12 + Math.cos(a) * 1.5, y0 = 3 + Math.sin(a) * 0.5;
    const len = 8 + R() * 14;
    const bend = (R() - 0.5) * 5;
    const dark = R() > 0.3;
    s.strokeStyle = dark ? `rgba(20,10,8,${(0.25 + R() * 0.35).toFixed(2)})` : `rgba(150,100,70,${(0.08 + R() * 0.14).toFixed(2)})`;
    s.lineWidth = 0.18 + R() * 0.3;
    const dx = (x0 - 12) * 4 + (R() - 0.5) * 10;
    s.beginPath();
    s.moveTo(x0, y0);
    s.quadraticCurveTo(x0 + dx * 0.5 + bend, y0 + len * 0.5, x0 + dx, y0 + len);
    s.stroke();
  }
});
const foldTex = () => K.sprite("f18folds", 32, 44, (s) => {
  // origin: (16, 0) = centre of the shoulders (body y -78); 44 tall = down to the hem (y -34)
  const fold = (pts, w, a) => {
    s.lineCap = "round";
    s.strokeStyle = `rgba(30,14,40,${a})`;
    s.lineWidth = w;
    s.beginPath(); s.moveTo(pts[0], pts[1]); s.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]); s.stroke();
    s.strokeStyle = `rgba(255,236,190,${a * 0.5})`;
    s.lineWidth = w * 0.5;
    s.beginPath(); s.moveTo(pts[0], pts[1] - w * 0.7); s.quadraticCurveTo(pts[2], pts[3] - w * 0.7, pts[4], pts[5] - w * 0.7); s.stroke();
  };
  if (K.hasFilter()) s.filter = "blur(0.5px)";
  // pulls from the shoulder blades toward the waist, a waist crease, sleeve creases at the elbows
  fold([9, 4, 12, 14, 14, 24], 1.1, 0.35);
  fold([23, 4, 20, 14, 18, 24], 1.1, 0.35);
  fold([8, 26, 16, 29, 24, 26], 1.2, 0.3);
  fold([10, 33, 16, 31, 22, 34], 0.9, 0.22);
  fold([2, 12, 3, 15, 2, 18], 0.9, 0.35);
  fold([30, 12, 29, 15, 30, 18], 0.9, 0.35);
  fold([1, 20, 2.5, 22, 1.5, 25], 0.8, 0.3);
  fold([31, 20, 29.5, 22, 30.5, 25], 0.8, 0.3);
  // the centre-back seam with a stitched highlight beside it, a yoke seam across the shoulders
  s.filter = "none";
  s.strokeStyle = "rgba(40,22,30,0.4)"; s.lineWidth = 0.35;
  s.beginPath(); s.moveTo(16, 3); s.lineTo(16, 43); s.stroke();
  s.strokeStyle = "rgba(255,240,200,0.35)"; s.lineWidth = 0.2;
  s.beginPath(); s.moveTo(16.5, 3); s.lineTo(16.5, 43); s.stroke();
  s.strokeStyle = "rgba(40,22,30,0.3)"; s.lineWidth = 0.35;
  s.beginPath(); s.moveTo(4, 7); s.quadraticCurveTo(16, 9.5, 28, 7); s.stroke();
  s.strokeStyle = "rgba(255,240,200,0.25)"; s.lineWidth = 0.2;
  s.beginPath(); s.moveTo(4, 7.5); s.quadraticCurveTo(16, 10, 28, 7.5); s.stroke();
  // fabric weave: a faint fine noise
  const R = K.rng("f18weave");
  for (let i = 0; i < 500; i++) {
    s.fillStyle = R() > 0.5 ? "rgba(255,240,200,0.06)" : "rgba(30,14,30,0.08)";
    s.fillRect(R() * 32, R() * 44, 0.3 + R() * 0.5, 0.25);
  }
});
let KIDC = null, KIDM = null;
function kidLit(g, x, y, h, t, ph, o) {
  const T = g.getTransform();
  const sc = Math.hypot(T.a, T.b);
  if (h * sc < 70 * K.pixelScale()) { drawPersonLit(g, x, y, h, t, ph, o); return; }
  const bw = h * 0.64, bh = h * 1.16, bx = x - bw / 2, by = y - h * 1.12;
  const cw = Math.ceil(bw * sc), ch = Math.ceil(bh * sc);
  if (!KIDC || KIDC.width < cw || KIDC.height < ch) {
    KIDC = K.makeCanvas(Math.max(cw, KIDC ? KIDC.width : 0), Math.max(ch, KIDC ? KIDC.height : 0));
    KIDM = K.makeCanvas(KIDC.width, KIDC.height);
  }
  const s = KIDC.getContext("2d");
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalAlpha = 1;
  s.globalCompositeOperation = "source-over";
  s.clearRect(0, 0, cw + 2, ch + 2);
  s.setTransform(sc, 0, 0, sc, -bx * sc, -by * sc);
  drawPersonLit(s, x, y, h, t, ph, Object.assign({}, o, { alpha: undefined }));
  s.save();
  s.translate(x, y);
  s.scale(h / 100, h / 100);
  s.globalCompositeOperation = "source-atop";
  // hair: a mass of strands, darker at the nape, with the sun catching the right side
  s.save();
  s.beginPath(); s.ellipse(0, -93, 9.6, 9.6, 0, 0, TAU); s.rect(-12, -86, 24, 0); s.clip();
  s.fillStyle = "rgba(24,12,10,0.3)"; s.fillRect(-12, -104, 24, 22);
  s.drawImage(hairTex(), -12, -103, 24, 24);
  const hg = s.createRadialGradient(9, -97, 0, 9, -97, 12);
  hg.addColorStop(0, "rgba(255,180,130,0.3)");
  hg.addColorStop(0.5, "rgba(255,160,120,0.15)");
  hg.addColorStop(1, "rgba(255,160,120,0)");
  s.fillStyle = hg; s.fillRect(-12, -105, 24, 22);
  const ng = s.createLinearGradient(0, -92, 0, -83);
  ng.addColorStop(0, "rgba(10,6,20,0)");
  ng.addColorStop(1, "rgba(10,6,20,0.45)");
  s.fillStyle = ng; s.fillRect(-12, -92, 24, 9);
  s.restore();
  // the hood lies on the shoulders and throws a soft shadow onto the coat below it
  const sg = s.createLinearGradient(0, -79, 0, -69);
  sg.addColorStop(0, "rgba(14,8,34,0.5)");
  sg.addColorStop(1, "rgba(14,8,34,0)");
  s.fillStyle = sg;
  s.beginPath(); s.ellipse(0, -76, 13, 6, 0, 0, TAU); s.fill();
  // coat: folds, seams, weave
  s.drawImage(foldTex(), -16, -78, 32, 44);
  // cloud-wet boots: darker, a cold sheen on the toes
  const bg = s.createLinearGradient(0, -17, 0, 0);
  bg.addColorStop(0, "rgba(16,8,30,0.15)");
  bg.addColorStop(0.4, "rgba(16,8,30,0.42)");
  bg.addColorStop(1, "rgba(10,6,24,0.55)");
  s.fillStyle = bg; s.fillRect(-14, -17, 28, 18);
  // cool violet fill: the back faces the lens and the dark western sky
  const fg = s.createLinearGradient(-14, 0, 14, 0);
  fg.addColorStop(0, "rgba(64,60,160,0.34)");
  fg.addColorStop(0.6, "rgba(64,60,160,0.14)");
  fg.addColorStop(1, "rgba(64,60,160,0)");
  s.fillStyle = fg; s.fillRect(-16, -106, 32, 108);
  s.restore();
  // warm rim on the sun side (right, a little up): a hot line and a softer wrap
  const e = (h / 100) * sc;
  edgeLight(KIDC, e * 1.1, -e * 0.45, "#ffc29a", 0.85, "lighter", KIDM, cw, ch);
  edgeLight(KIDC, e * 2.6, -e * 0.9, "#ff9a7c", 0.3, "lighter", KIDM, cw, ch);
  g.save();
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  g.drawImage(KIDC, 0, 0, cw, ch, bx, by, cw / sc, ch / sc);
  g.restore();
}
function kid(g, x, y, h, t, o = {}) {
  const gy = o.gy == null ? y : o.gy;
  const ph = o.phase == null ? t * 0.9 : o.phase;
  y += h * 0.025;
  if (o.walk !== false) y -= Math.abs(Math.sin(ph * TAU)) * h * 0.012;
  const lift = K.clamp((gy + h * 0.025 - y) / Math.max(1, h * 0.1));
  // contact occlusion: a tight dark pool right under the boots, a broad soft one around it
  K.shadowBlob(g, x + h * 0.012, gy + h * 0.022, h * 0.15 * (1 - lift * 0.2), h * 0.03, { alpha: 0.95 * (1 - lift * 0.5), color: SHADOW, soft: 1.3 });
  K.shadowBlob(g, x + h * 0.01, gy + h * 0.02, h * 0.3, h * 0.06, { alpha: 0.35 * (1 - lift * 0.5), color: SHADOW, soft: 2 });
  // backlit: the shadow falls toward the lens, long and soft across the cloud
  K.shadowBlob(g, x - h * 0.02, gy + h * 0.09, h * 0.12, h * 0.08, { alpha: 0.5 * (1 - lift * 0.5), color: SHADOW, soft: 1.6 });
  kidLit(g, x, y, h, t, ph, o);
  if (h > 30) {
    // the boots stand in the soft top of the cloud: a little lit mist wraps them
    const mg = g.createRadialGradient(x, gy + h * 0.015, 0, x, gy + h * 0.015, h * 0.16);
    mg.addColorStop(0, "rgba(226,186,200,0.55)");
    mg.addColorStop(0.45, "rgba(204,160,190,0.3)");
    mg.addColorStop(1, "rgba(190,150,184,0)");
    g.save(); g.translate(x, gy + h * 0.015); g.scale(1, 0.3); g.translate(-x, -(gy + h * 0.015));
    g.fillStyle = mg; g.beginPath(); g.arc(x, gy + h * 0.015, h * 0.16, 0, TAU); g.fill();
    g.restore();
  }
}

// draw a stair far -> near, then the actors far -> near on top
function drawStair(g, S, actors, from = S.length - 1, to = 0) {
  for (let i = from; i >= to; i--) {
    const s = S[i];
    if (s.w > 2.5) slab(g, s.x, s.y, s.w, i * 7 + 3);
  }
  actors.sort((a, b) => b.f - a.f);
  for (const a of actors) if (a.f >= to - 1) a.draw(g);
}
function hazeLayer(L, color, a) {
  L.save();
  L.setTransform(1, 0, 0, 1, 0, 0);
  L.globalCompositeOperation = "source-atop";
  L.fillStyle = K.rgba(color, a);
  L.fillRect(0, 0, L.canvas.width, L.canvas.height);
  L.restore();
}

// ---- shot 1 [0-12] wide: the cloud stairs ----------------------------------------------------------------------
// the far stair (steps 12..end) never moves in the world: bake it once, hazed, and let the camera move it
const FAR1 = (() => {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 12; i < S1.length; i++) {
    const s = S1[i];
    x0 = Math.min(x0, s.x - s.w * 0.7); x1 = Math.max(x1, s.x + s.w * 0.7);
    y0 = Math.min(y0, s.y - s.w * 0.25); y1 = Math.max(y1, s.y + s.w * 0.45);
  }
  return { x0: Math.floor(x0), y0: Math.floor(y0), w: Math.ceil(x1 - x0), h: Math.ceil(y1 - y0) };
})();
let FAR1C = null;
function far1() {
  if (FAR1C) return FAR1C;
  const px = K.pixelScale() * 1.25;
  const c = K.makeCanvas(FAR1.w * px, FAR1.h * px);
  const s = c.getContext("2d");
  s.setTransform(px, 0, 0, px, -FAR1.x0 * px, -FAR1.y0 * px);
  drawStair(s, S1, [], S1.length - 1, 12);
  hazeLayer(s, "#e6aabc", 0.36);
  return (FAR1C = c);
}
function shot1(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 0, 12));
  const hz = 318;
  K.withCamera(g, W, H, { x: 480 + p * 20, y: 290 - p * 26, zoom: 1.03 + p * 0.05, shakeT: t, shakeAmt: 0.6 }, (c) => {
    heaven(c, W, H, t, hz, { stars: 1 - 0.55 * p });
    cloudSea(c, W, H, t, hz, W * 0.72);
    // cumulus towers rising out of the sea: far (hazed) to near
    tower(c, 300, hz + 10, 96, 2);
    tower(c, 905, hz + 46, 200, 1);
    tower(c, 60, hz + 190, 360, 0);
    c.drawImage(far1(), FAR1.x0, FAR1.y0, FAR1.w, FAR1.h);
    const kf = 5.2 + t * 0.42;
    const k = stairAt(S1, kf, 0.05);
    drawStair(c, S1, [{ f: kf, draw: (q) => kid(q, k.x, k.y, k.w * 0.5, t, { phase: t * 0.85, gy: k.gy }) }], 11, 0);
  });
  // crepuscular rays: the towers and the deck cut the hidden sun's light into shafts
  K.godRays(g, W * 0.74, 322, W, H, { color: "#ffb8a8", count: 9, strength: 0.16, t, angle: -Math.PI / 2 - 0.45, spread: 1.6, seed: 18 });
}

// ---- shot 2 [12-22] behind you, climbing; pull up and back: you are not alone ----------------------------------
function nearestStep(S, x, y) {
  let best = 0, bd = 1e9;
  S.forEach((s, i) => { const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = i; } });
  return best;
}
const S2K = nearestStep(S2, 500, 380) - 1.5;
// the out-of-focus foreground wisps: baked and blurred once, then only translated
let FG2 = null;
function fg2() {
  if (FG2) return FG2;
  const px = K.pixelScale();
  const raw = K.makeCanvas((960 + 400) * px, 340 * px);
  const s = raw.getContext("2d");
  s.setTransform(px, 0, 0, px, 200 * px, 0);
  cloudRow(s, -200, 1160, 320, 230, NEAR, 7, 0, 0, 0.9);
  return (FG2 = blurCopy(raw, 7 * px));
}
const SHOT2_CATS = [];
for (let j = 1; j <= 14; j++) {
  SHOT2_CATS.push({
    df: j === 1 ? 0.3 : 0.8 + j * 0.55 + K.hash(j, 2) * 0.25,
    lane: j === 1 ? -0.8 : (K.hash(j, 5) - 0.5) * 1.6,
    ci: (j * 3) % CROWD.length,
    sk: (0.1 + K.hash(j, 9) * 0.035) * (j % 5 === 3 ? 0.7 : 1),
    ph: K.hash(j, 1),
  });
}
function shot2(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 12.6, 21.5));
  const kf = S2K + (t - 12) * 0.3;
  const k = stairAt(S2, kf, 0.05);
  const z = K.lerp(1.5, 1.0, p);
  const cx = K.lerp(k.x, 470, p), cy = K.lerp(k.y - k.w * 0.32, 336, p);
  const hz = 300;
  K.withCamera(g, W, H, { x: cx, y: cy, zoom: z, shakeT: t, shakeAmt: 0.8 }, (c) => {
    heaven(c, W, H, t, hz, { stars: 0.42 });
    cloudSea(c, W, H, t, hz, W * 0.72);
    tower(c, 980, hz + 40, 190, 1);
    const actors = [{ f: kf, draw: (q) => kid(q, k.x, k.y, k.w * 0.5, t, { phase: t * 0.8, gy: k.gy }) }];
    for (const m of SHOT2_CATS) {
      const f = kf - m.df;
      if (f < 0) break;
      const s = stairAt(S2, f, m.lane);
      const size = s.w * m.sk;
      actors.push({ f, draw: (q) => stairCat(q, s.x, s.y, size, s.dir, m.ci, t * 1.15 + m.ph, { gy: s.gy }) });
    }
    drawStair(c, S2, actors);
    c.drawImage(fg2(), -200, H + 250 + (1 - p) * 200 - 320, 1360, 340);
  });
  K.dust(g, W, H, t, { seed: 182, count: 18, color: "#ffd2c0", size: 1.2, alpha: 0.25 });
}

// ---- shot 3 [22-34] crane up and back: the long winding line ---------------------------------------------------
function shot3(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 22, 34));
  const hz = 150;
  const adv = (t - 22) * 0.5;
  K.withCamera(g, W, H, { x: 480 - p * 10, y: K.lerp(380, 290, p), zoom: K.lerp(1.32, 1.0, p), shakeT: t, shakeAmt: 0.7 }, (c) => {
    heaven(c, W, H, t, hz, { stars: 0.3, sunX: 700 });
    cloudSea(c, W, H, t, hz, 700);
    const cats = (lo, hi) => {
      const out = [];
      for (let j = 0; j < 104; j++) {
        const f = 3 + j * 0.92 + K.hash(j, 3) * 0.4 + adv;
        if (f < lo || f >= hi || f > S3.length - 6) continue;
        const lane = (K.hash(j, 7) - 0.5) * 1.5;
        const s = stairAt(S3, f, lane);
        const ci = (j * 7 + 2) % CROWD.length;
        const kitten = j % 6 === 4;
        const size = Math.min(48, s.w * (0.17 + K.hash(j, 11) * 0.05) * (kitten ? 0.6 : 1));
        out.push({ f, draw: (q) => stairCat(q, s.x, s.y, size, s.dir, ci, t * 1.2 + K.hash(j, 4), { pose: kitten ? "run" : "walk", gy: s.gy }) });
      }
      return out;
    };
    const lead = Math.min(3 + 103 * 0.92 + K.hash(103, 3) * 0.4 + adv, S3.length - 6);
    const kF = Math.min(lead + 1.4, S3.length - 2);
    const kk = stairAt(S3, kF, 0);
    // aerial perspective in three depth bands: the far line melts into the rose haze as soft silhouettes
    const far = inLayer(c, W, H, "f18s3far", (L) => {
      drawStair(L, S3, cats(44, 999), S3.length - 1, 44);
      K.glow(L, kk.x, kk.y - 5, 12, "#ffd9a0", 0.3);
      contact(L, kk.x, kk.gy, 3.2, 0, 0.5);
      K.drawPerson(L, kk.x, kk.y, 9.5, { view: "side", facing: kk.dir, walk: true, phase: t * 0.9, t, hood: false, bell: true, light: { x: kk.x + 300, y: kk.y - 60, color: "#ffd2b0", strength: 1.6, z: -0.3 }, ambient: AMB, shadow: false });
      hazeLayer(L, "#dca6c4", 0.5);
    });
    put(c, W, H, far, 1, 0.6);
    const mid = inLayer(c, W, H, "f18s3mid", (L) => {
      drawStair(L, S3, cats(18, 44), 43, 18);
      hazeLayer(L, "#d8a2c2", 0.22);
    });
    put(c, W, H, mid, 1);
    K.fog(c, W, H, { y: 300, h: 60, color: "#d79ab8", alpha: 0.14, wisps: true, t, seed: 9 });
    drawStair(c, S3, cats(6, 18), 17, 6);
    // the nearest few are close to the lens: shallow depth of field
    const near = inLayer(c, W, H, "f18s3near", (L) => drawStair(L, S3, cats(0, 6), 5, 0));
    put(c, W, H, near, 1, 1.6 * (1 - p * 0.5));
  });
}

// ---- shot 4's cloud steps, side-on: baked backlit cloud benches (density field + light march toward the sun) ---
const BENCH_W = 256, BENCH_H = 112, BENCH_STRIPS = 4, BENCH_N = 3;
function benchD(u, v, seed) {
  const b = Math.abs(K.texNoise(u * 7, 0.5, seed)) * 0.6 + Math.abs(K.texNoise(u * 15, 1.5, seed + 1)) * 0.4;
  const end = Math.pow(Math.abs(u - 0.5) * 2, 5);
  const top = 0.3 - b * 0.05 + end * 0.45;
  const bot = 0.84 - Math.abs(K.texNoise(u * 5, 3.5, seed + 2)) * 0.16 - Math.abs(K.texNoise(u * 13, 5.5, seed + 4)) * 0.1 - end * 0.3;
  if (v < top - 0.02 || v > bot + 0.02) return 0;
  const inner = K.smooth(K.clamp((v - top) / 0.025)) * (1 - K.smooth(K.clamp((v - (bot - 0.16)) / 0.18)));
  return inner * (0.45 + 0.55 * (1 - Math.abs(K.texFbm(u * 9, v * 7, seed + 3, 4))));
}
function benchPixel(u, v, seed, out) {
  const d = benchD(u, v, seed);
  if (d <= 0.004) { out[0] = out[1] = out[2] = 0; out[3] = 0; return; }
  let od = 0;
  for (let k = 1; k <= 6; k++) od += benchD(u + k * 0.022, v - k * 0.02, seed);
  const T = Math.exp(-od * 0.75);
  const sky = K.clamp(1 - (v - 0.3) * 2.2);
  const silver = Math.pow(T, 3) * (1 - d * 0.6);
  let r = 48 + 150 * sky, g = 38 + 118 * sky, b = 92 + 132 * sky;
  r += (255 - r) * T * 0.35; g += (190 - g) * T * 0.35; b += (176 - b) * T * 0.35;
  r += (255 - r) * silver * 0.55; g += (226 - g) * silver * 0.55; b += (210 - b) * silver * 0.55;
  out[0] = r; out[1] = g; out[2] = b; out[3] = 255 * K.clamp(d * 1.4);
}
const benchStrip = (n, i) => K.texBake("f18bench4:" + n + ":" + i, BENCH_W, BENCH_H / BENCH_STRIPS, (u, v, out, x, y) =>
  benchPixel(x / BENCH_W, (y + (i * BENCH_H) / BENCH_STRIPS) / BENCH_H, 1800 + n * 13, out));
const BENCHES = [], BENCHB = [];
function benchCanvas(n) {
  if (BENCHES[n]) return BENCHES[n];
  const c = K.makeCanvas(BENCH_W, BENCH_H);
  const s = c.getContext("2d");
  for (let i = 0; i < BENCH_STRIPS; i++) s.drawImage(benchStrip(n, i), 0, (i * BENCH_H) / BENCH_STRIPS);
  BENCHES[n] = c;
  return c;
}
const benchBlur = (n) => BENCHB[n] || (BENCHB[n] = blurCopy(benchCanvas(n), 4, 16));
function bench(g, x, y, w, n, alpha = 1, blur = false) {
  const h = (w * BENCH_H) / BENCH_W;
  const nn = ((n % BENCH_N) + BENCH_N) % BENCH_N;
  g.save();
  g.globalAlpha *= alpha;
  if (blur) { const k = w / BENCH_W; g.drawImage(benchBlur(nn), x - w / 2 - 16 * k, y - h * 0.4 - 16 * k, w + 32 * k, h + 32 * k); }
  else g.drawImage(benchCanvas(nn), x - w / 2, y - h * 0.4, w, h);
  g.restore();
}

// ---- shot 4 [34-44] tracking side-on, low: the parade ----------------------------------------------------------
const SW4 = 170, SH4 = 30;
const stairY4 = (x) => {
  const k = Math.floor(x / SW4), u = x / SW4 - k;
  const e = K.smooth(K.clamp((u - 0.78) / 0.22));
  return -(k + e) * SH4;
};
// zd: depth across the bench (-1 far .. 1 near): scale, height on screen and draw order follow it
const PARADE = [
  { x0: 560, ci: -1, size: 60, dv: -6, zd: 0.55, lead: 1 },
  { x0: 410, ci: 5, size: 48, dv: 1, zd: -0.6 },
  { x0: 330, ci: 7, size: 29, kitten: true, dv: 3, zd: 0.25 },
  { x0: 268, ci: 9, size: 28, kitten: true, dv: 6, zd: -0.35 },
  { x0: 190, ci: 4, size: 50, hat: true, dv: -1, zd: 0.05 },
  { x0: 20, ci: 1, size: 58, dv: 1, fluff: 1, zd: 0.4 },
  { x0: -150, ci: 2, size: 50, dv: -2, zd: -0.45 },
  { x0: -300, ci: 0, size: 52, zd: 0.2 },
  { x0: -380, ci: 3, size: 27, kitten: true, dv: 6, zd: 0.65 },
].map((m) => Object.assign(m, { sz: m.size * (1 + m.zd * 0.18) * (m.fluff ? 1.1 : 1) })).sort((a, b) => a.zd - b.zd);
function paradeSpec(m, pose) {
  return catSpec(m.sz, m.ci, { pose, steps: 12, tailUp: m.kitten ? 0.9 : 0.7, hat: m.hat, parade: 1 });
}
function shot4(g, W, H, t) {
  const tt = t - 34;
  const v = 46;
  const camX = 200 + tt * v;
  const camY = stairY4(camX) - 70;
  const hz = 360;
  K.withCamera(g, W, H, { x: 480 + tt * v * 0.08, y: 270, zoom: 1, shakeT: t, shakeAmt: 0.4 }, (c) => {
    heaven(c, W, H, t, hz, { stars: 0.22, sunX: W * 0.82 });
    cloudSea(c, W, H, t, hz, W * 0.82);
  });
  K.withCamera(g, W, H, { x: camX, y: camY, zoom: 1, shakeT: t, shakeAmt: 0.9 }, (c) => {
    for (let k = Math.floor((camX - 640) / SW4); k <= Math.floor((camX + 640) / SW4); k++) {
      bench(c, k * SW4 + SW4 * 0.2, -k * SH4 + 2, SW4 * 1.34, k);
    }
    for (const m of PARADE) {
      if (m.ci < 0 && !BISCUIT_ON_SCREEN) continue;
      const x = m.x0 + tt * (v + (m.dv || 0));
      if (Math.abs(x - camX) > 620) continue;
      const gy = stairY4(x) + m.zd * 9;
      let y = gy, lift = 0;
      let pose = "walk", ph = t * (m.kitten ? 1.9 : 1.05) + m.x0 * 0.01;
      if (m.kitten) {
        const u = ((t * 1.4 + m.x0 * 0.013) % 1 + 1) % 1;
        lift = Math.sin(Math.PI * u);
        y -= lift * m.size * 0.5;
        pose = lift > 0.15 ? "run" : "walk";
        ph = lift > 0.15 ? 0.15 + u * 0.7 : ph;
      }
      const sz = m.sz;
      // a soft contact pool on the cloud top, and the shadow thrown back toward the lens by the low sun
      K.shadowBlob(c, x - sz * 0.25, gy - 3, sz * 0.95, sz * 0.12, { alpha: 0.4 * (1 - lift * 0.6), color: SHADOW, soft: 1.8 });
      contact(c, x + sz * 0.05, gy - 4, sz * 0.62, lift, 0.75);
      const spec = paradeSpec(m, pose);
      if (m.fluff) {
        c.save(); c.translate(x, y); c.scale(1.12, 1); c.translate(-x, -y);
        drawCat18(c, x, y, sz, 1, spec, ph);
        c.restore();
      } else drawCat18(c, x, y, sz, 1, spec, ph);
    }
    // foreground lip of cloud, out of focus (pre-blurred benches), passing faster
    for (let k = Math.floor((camX - 900) / 300); k <= Math.floor((camX + 900) / 300); k++) {
      bench(c, k * 300 + 60, stairY4(k * 300) + 150, 520, k + 1, 1, true);
    }
  });
  K.dust(g, W, H, t, { seed: 184, count: 22, color: "#ffd8c4", size: 1.2, alpha: 0.3 });
}

// ---- the dead paw ring: pitted granite slabs (baked ellipsoid normal maps, lit in the world), a silver torus ---
const PAW = [Math.PI / 2, -Math.PI / 2 - 1.14, -Math.PI / 2 - 0.38, -Math.PI / 2 + 0.38, -Math.PI / 2 + 1.14];
const ST = 160; // stone bake size (logical); shape scale matches the old slab sprites
const STC = { alb: SC("#5a5c6e"), alb2: SC("#3c3d4c"), fill: SC("#8a92cc"), sun: SC("#ffa486"), frost: SC("#dce4f6") };
function stoneQ(lx, ly, kind) {
  if (kind) return 1 - (lx / 39) * (lx / 39) - (ly / 53) * (ly / 53);
  let q = 1 - (lx / 63) * (lx / 63) - ((ly + 8) / 38) * ((ly + 8) / 38);
  const lobes = [[-37, 26, 24], [0, 34, 24], [37, 26, 24]];
  for (const [cx, cy, r] of lobes) q = Math.max(q, 1 - ((lx - cx) * (lx - cx) + (ly - cy) * (ly - cy)) / (r * r));
  return q;
}
function stoneH(x, y, kind, ca, sa, seed) {
  const lx = x * ca + y * sa, ly = -x * sa + y * ca;
  const q = stoneQ(lx, ly, kind);
  if (q <= 0) return { q, h: 0, pit: 0 };
  const v = K.texVoronoi(x * 0.11 + 3, y * 0.11 + 7, seed);
  const pit = Math.max(0, 0.13 - v.f1) * 7.7;
  const h = Math.pow(q, 0.5) * 24 + K.texFbm(x * 0.05, y * 0.05, seed + 1, 4) * 1.8 - pit * 1.6;
  return { q, h, pit };
}
function stonePixel(X, Y, kind, ang, seed, out) {
  const x = X - ST / 2, y = Y - ST / 2;
  const ca = Math.cos(-ang), sa = Math.sin(-ang);
  const A = stoneH(x, y, kind, ca, sa, seed);
  if (A.q <= -0.02) { out[3] = 0; return; }
  const B = stoneH(x + 1, y, kind, ca, sa, seed), Cy = stoneH(x, y + 1, kind, ca, sa, seed);
  let nx = -(B.h - A.h), ny = -(Cy.h - A.h), nz = 1;
  if (A.q < 0.06) { const l = Math.hypot(x, y) || 1; nx = x / l * 3; ny = y / l * 3; nz = 0.4; }
  const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
  // the sun low at lower right, beyond the ring: it only reaches the right / lower edges (a warm rim)
  const sun = Math.pow(K.clamp((nx * 0.7 + ny * 0.52 - nz * 0.14 + 0.06) / 1.06), 1.6);
  // the cool sky dome from above
  const fill = K.clamp(-ny * 0.62 + nz * 0.55) * 0.75 + 0.12;
  const ao = K.clamp(1 - A.pit * 0.55) * (0.6 + 0.4 * K.clamp(A.q * 3));
  const mot = K.texFbm(x * 0.03 + 9, y * 0.03, seed + 4, 3) * 0.5 + 0.5;
  const speck = K.hash(Math.floor(X * 1.7) + Math.floor(Y * 1.7) * 977, seed);
  const C = STC;
  const ak = K.clamp(mot * 0.7 + (speck > 0.85 ? 0.35 : speck < 0.12 ? -0.3 : 0));
  const ar = C.alb2[0] + (C.alb[0] - C.alb2[0]) * ak, ag = C.alb2[1] + (C.alb[1] - C.alb2[1]) * ak, ab = C.alb2[2] + (C.alb[2] - C.alb2[2]) * ak;
  let r = ar * (C.fill[0] / 255) * fill * ao * 2.1 + ar * (C.sun[0] / 255) * sun * 2.6;
  let g = ag * (C.fill[1] / 255) * fill * ao * 2.1 + ag * (C.sun[1] / 255) * sun * 2.6;
  let b = ab * (C.fill[2] / 255) * fill * ao * 2.1 + ab * (C.sun[2] / 255) * sun * 2.6;
  // hoar frost settled in the up-facing pits and on top
  const frost = K.clamp(-ny * 1.6 - 0.25) * (speck > 0.55 ? 1 : 0.25) * 0.55;
  r += (C.frost[0] * fill - r) * frost; g += (C.frost[1] * fill - g) * frost; b += (C.frost[2] * fill - b) * frost;
  // a cold glint of sky on the polished crowns
  const spec = Math.pow(K.clamp(-ny * 0.5 + nz * 0.86), 40) * 60;
  r += spec * 0.8; g += spec * 0.86; b += spec;
  out[0] = Math.min(255, r); out[1] = Math.min(255, g); out[2] = Math.min(255, b);
  out[3] = 255 * K.clamp((A.q + 0.02) / 0.05);
}
const stoneJob = (i) => job("stone" + i, ST, ST, 12, (x, y, out) => stonePixel(x + 0.5, y + 0.5, i === 0 ? 0 : 1, i === 0 ? 0 : PAW[i] + Math.PI / 2, 8800 + i * 7, out));
// the silver outline: a thin, slightly emissive torus whose thickness varies, with sky and sun speculars
const RG = 400, RG0 = 186;
function ringPixel(X, Y, out) {
  const dx = X - RG / 2, dy = Y - RG / 2;
  const rr = Math.hypot(dx, dy);
  const off = rr - RG0;
  if (Math.abs(off) > 16) { out[3] = 0; return; }
  const cx = dx / (rr || 1), cy = dy / (rr || 1);
  const th = 2.1 + 1.7 * (K.texFbm(cx * 2.2 + 5, cy * 2.2 + 5, 9301, 3) * 0.5 + 0.5) + Math.max(0, K.texNoise(cx * 30 + 9, cy * 30, 9302)) * 1.2;
  const d = off / th;
  if (Math.abs(d) >= 1) {
    const a = 0.16 * Math.exp(-(Math.abs(off) - th) / 3.5);
    out[0] = 190; out[1] = 204; out[2] = 236; out[3] = 255 * a;
    return;
  }
  const nz = Math.sqrt(1 - d * d);
  const nx = cx * d, ny = cy * d;
  const diff = K.clamp(-ny * 0.7 + nz * 0.6);
  const hsx = 0.35, hsy = 0.3, hsz = 0.89; // half vector to the low sun, lower right
  const sunS = Math.pow(K.clamp(nx * hsx + ny * hsy + nz * hsz), 46) * 1.4;
  const skyS = Math.pow(K.clamp(-ny * 0.38 + nz * 0.93), 28) * 0.55;
  const r = 70 + 70 * diff + 255 * sunS + 200 * skyS + 40;
  const g = 76 + 76 * diff + 214 * sunS + 214 * skyS + 44;
  const b = 100 + 92 * diff + 176 * sunS + 240 * skyS + 58;
  out[0] = Math.min(255, r); out[1] = Math.min(255, g); out[2] = Math.min(255, b);
  out[3] = 255 * K.clamp((1 - Math.abs(d)) * th * 0.9);
}
const ringJob = () => job("ring", RG, RG, 20, (x, y, out) => ringPixel(x + 0.5, y + 0.5, out));
function deadRing(g, x, y, r, t, o = {}) {
  const tilt = o.tilt == null ? 0.06 : o.tilt;
  g.save();
  g.translate(x, y);
  g.scale(1, 1 - tilt);
  const dg = g.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 0.9);
  dg.addColorStop(0, "rgba(14,18,46,0.22)");
  dg.addColorStop(0.8, "rgba(16,22,54,0.28)");
  dg.addColorStop(0.93, "rgba(40,52,96,0.16)");
  dg.addColorStop(1, "rgba(16,22,54,0)");
  g.fillStyle = dg;
  g.beginPath(); g.arc(0, 0, r * 0.9, 0, TAU); g.fill();
  const k = (r * 0.93) / RG0;
  g.drawImage(jobGet(ringJob()), -RG / 2 * k, -RG / 2 * k, RG * k, RG * k);
  g.restore();
  const wob = Math.sin(t * 0.07) * 0.05;
  for (let i = 0; i < 5; i++) {
    const a = PAW[i] + wob;
    const kind = i === 0 ? 0 : 1;
    const bob = Math.sin(t * 0.6 + i * 1.7) * r * 0.012;
    const rr = kind ? r * 0.95 : r * 0.9;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * (1 - tilt) + bob;
    const sz = r * (kind ? 0.27 : 0.42);
    // a soft self-shadow: the stone occludes the membrane just below-left of it
    K.shadowBlob(g, px - sz * 0.08, py + sz * 0.16, sz * 0.95, sz * 0.75, { alpha: 0.25, color: "#05061a", soft: 1.6 });
    g.save();
    g.translate(px, py);
    g.rotate(wob);
    g.drawImage(jobGet(stoneJob(i)), -sz * 1.08, -sz * 1.08, sz * 2.16, sz * 2.16);
    g.restore();
  }
}

// ---- shot 5 [44-54] the top: a flat cloud plateau and the dark ring --------------------------------------------
// The plateau: a near, flatter perspective heightfield (lit like the sea, brighter), its far lip heaped with
// NEAR-palette billows whose tops catch the sun. Baked once at half resolution in world space.
const PL_X0 = -140, PL_Y0 = 340, PL_S = 2, PL_W = 640, PL_H = 140;
const PLC = { deep: SC("#221e54"), amb: SC("#7068ae"), lit: SC("#ffb8a6"), hot: SC("#ffe2d0"), haze: SC("#d89cb6") };
const lipY = (X) => 404 - Math.abs(K.texNoise(X * 0.011, 0.5, 4401)) * 14 - Math.abs(K.texNoise(X * 0.034, 1.5, 4402)) * 6;
function plateauH(x, z, oct = 4) {
  let h = 0, a = 1, f = 0.55, n = 0;
  for (let o = 0; o < oct; o++) {
    const q = K.texFbm(x * f, z * f * 0.75, 4410 + o * 31, 1) * 0.5 + 0.5;
    h += q * q * (3 - 2 * q) * a; n += a; a *= 0.5; f *= 2.1;
  }
  return h / n;
}
function plateauPixel(px, py, out) {
  const X = PL_X0 + (px + 0.5) * PL_S, Y = PL_Y0 + (py + 0.5) * PL_S;
  const ly = lipY(X);
  if (Y < ly - 1.5) { out[3] = 0; return; }
  const a = K.clamp((Y - ly + 1.5) / 3);
  const dy = Y - ly + 14;
  const z = 46 / dy;
  const x = ((X - 480) * z) / 240;
  // octaves limited by the pixel footprint (grazing angle at the lip): no aliasing bands, just softness
  const foot = (z * PL_S) / 240 + ((z * z * PL_S) / 46) * 0.9;
  const oct = Math.max(1, Math.min(4, Math.floor(Math.log2(0.9 / (foot * 1.4)))));
  const e = 0.04;
  const h = plateauH(x, z, oct), hx = plateauH(x + e, z, oct), hz = plateauH(x, z + e, oct);
  let nx = (-(hx - h) / e) * 0.3, ny = 1, nz = (-(hz - h) / e) * 0.3;
  const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
  const diff = K.clamp((nx * 0.35 + ny * 0.28 + nz * 0.89 + 0.3) / 1.3);
  const C = PLC;
  const amb = K.clamp(0.35 + h * 0.6);
  let r = C.deep[0] + (C.amb[0] - C.deep[0]) * amb, g = C.deep[1] + (C.amb[1] - C.deep[1]) * amb, b = C.deep[2] + (C.amb[2] - C.deep[2]) * amb;
  const lit = Math.pow(diff, 1.5);
  r += C.lit[0] * lit * 0.5; g += C.lit[1] * lit * 0.5; b += C.lit[2] * lit * 0.5;
  // the lip rolls over toward the sun: a warm rim, hottest toward the sun (x ~ 840)
  const lip = Math.exp(-(Y - ly) / 3.5) * (0.35 + 0.65 * Math.exp(-Math.pow((X - 840) / 380, 2)));
  r += (C.hot[0] - r) * lip * 0.8; g += (C.hot[1] - g) * lip * 0.8; b += (C.hot[2] - b) * lip * 0.8;
  const fh = Math.exp(-(Y - ly) / 26) * 0.35;
  r += (C.haze[0] - r) * fh; g += (C.haze[1] - g) * fh; b += (C.haze[2] - b) * fh;
  out[0] = Math.min(255, r); out[1] = Math.min(255, g); out[2] = Math.min(255, b); out[3] = 255 * a;
}
const plateauJob = () => job("plateau", PL_W, PL_H, 8, plateauPixel, (src) => {
  const c = K.makeCanvas(PL_W, PL_H);
  const s = c.getContext("2d");
  // the billows heaped along the far lip (behind the surface), then the surface over them
  s.setTransform(1 / PL_S, 0, 0, 1 / PL_S, -PL_X0 / PL_S, -PL_Y0 / PL_S);
  cloudRow(s, PL_X0, PL_X0 + PL_W * PL_S, 440, 84, NEAR, 4, 0, 0, 1);
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.drawImage(src, 0, 0);
  edgeLight(c, 0.6, -1.4, "#ffc4a4", 0.6);
  edgeLight(c, 1.2, -2.6, "#ff9c86", 0.25);
  return c;
});
function plateau(g) {
  g.drawImage(jobGet(plateauJob()), PL_X0, PL_Y0, PL_W * PL_S, PL_H * PL_S);
}
// Biscuit, sitting by your boots: full-detail kit cat, the sun as a hot rim through his ears
function biscuitSit(g, x, y, size, t, o = {}) {
  K.shadowBlob(g, x + size * 0.05, y, size * 0.9, size * 0.14, { alpha: 0.7, color: SHADOW, soft: 1.3 });
  K.shadowBlob(g, x - size * 0.2, y + size * 0.12, size * 0.9, size * 0.22, { alpha: 0.35, color: SHADOW, soft: 1.8 });
  K.drawCat(g, x, y, size, {
    pose: "sit", facing: 1, coat: K.COATS.biscuit, t, collar: false, bell: false, tail: 0.5,
    headTilt: o.headTilt || 0, gaze: o.gaze,
    key: { x: x - 400, y: y - 900, color: "#a6a2e6", strength: 0.65 },
    rim: { x: x + 900, y: y - 120, color: "#ffb49c", strength: 1.6 },
    fill: "#24224e", ambient: "#3e3c80", ambientK: 0.32, backlit: 0.85, pupil: 0.85,
  });
}
// the first cats arriving behind you, soft in the foreground: pre-blurred back sprites
let FG5 = null;
function fg5() {
  if (FG5) return FG5;
  const mk = (ci, side) => {
    const src = backSprite(ci, 1, 0, side);
    return blurCopy(src, 6 * (src.width / 110) * 0.6, 24);
  };
  return (FG5 = [mk(1, 1), mk(0, -1)]);
}
function shot5(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 44, 54));
  const bump = Math.exp(-Math.max(0, t - 44) * 6) * (t >= 44 ? 1 : 0);
  const hz = 330;
  const RX = 560, RY = 200, RR = 150;
  K.withCamera(g, W, H, { x: K.lerp(480, 510, p), y: K.lerp(270, 262, p) + bump * 6, zoom: K.lerp(1.0, 1.08, p), shakeT: t, shakeAmt: 0.8 + bump * 4 }, (c) => {
    heaven(c, W, H, t, hz, { stars: 0.36, sunX: 840 });
    cloudSea(c, W, H, t, hz, 840);
    tower(c, 120, hz + 22, 120, 2);
    // the gate hangs in the air beyond the lip: its shadow is a faint smudge on the sea far below
    K.shadowBlob(c, RX, hz + 40, RR * 0.8, 10, { alpha: 0.25, color: SHADOW, soft: 2 });
    deadRing(c, RX, RY + Math.sin(t * 0.5) * 2, RR, t);
    plateau(c);
    // you, arriving at the top: a few slow steps toward it, then still. Footprints pressed into the cloud.
    const walk = K.seg(t, 44.3, 48.3);
    const we = K.ease.out(walk);
    const kx = K.lerp(300, 336, we), ky = K.lerp(474, 446, we);
    const kh = K.lerp(196, 188, walk);
    for (let i = 0; i < 6; i++) {
      const u = i / 6;
      if (we < u + 0.1) break;
      const fx = K.lerp(300, 336, u) + (i % 2 ? 1 : -1) * kh * 0.035, fy = K.lerp(474, 446, u) + 3;
      const fw = kh * 0.04 * (1 + (474 - fy) * -0.004);
      K.shadowBlob(c, fx, fy, fw, fw * 0.32, { alpha: 0.4, color: "#16123c", soft: 0.8 });
      c.fillStyle = "rgba(255,200,190,0.12)";
      c.beginPath(); c.ellipse(fx + fw * 0.1, fy - fw * 0.16, fw * 0.8, fw * 0.12, 0, Math.PI, TAU); c.fill();
    }
    if (BISCUIT_ON_SCREEN) {
      const look = K.smooth(K.seg(t, 49.6, 50.6)) * (1 - K.smooth(K.seg(t, 52.4, 53.4)));
      biscuitSit(c, kx + kh * 0.24, ky + 2, kh * 0.19, t, { headTilt: look * 0.22 });
    }
    kid(c, kx, ky, kh, t, { walk: walk < 1, phase: walk < 1 ? 0.25 + (t - 44.3) * 0.36 : 0.25 + 4 * 0.36, lx: 260, ly: -120, gy: ky });
    const a = K.smooth(K.seg(t, 49, 52.5));
    if (a > 0.01) {
      const [b0, b1] = fg5();
      const draw = (img, x, y, h, al) => {
        const k = h / 100, pad = (24 * 110) / (img.width - 48);
        c.save(); c.globalAlpha *= al;
        c.drawImage(img, x - (55 + pad) * k, y - (130 + pad) * k, (110 + pad * 2) * k, (134 + pad * 2) * k);
        c.restore();
      };
      draw(b0, 90, 570 - a * 40, 120, a);
      draw(b1, 840, 590 - a * 50, 150, a);
    }
  });
  K.dust(g, W, H, t, { seed: 185, count: 16, color: "#e6ecff", size: 1.1, alpha: 0.22 });
}

// ---- shot 6 [54-66] wide from behind the crowd: a hundred cats sit and wait -------------------------------------
// back-view sitters, re-lit: the sun is ahead of them, so ear tips and head outlines carry a warm rim
const BK = new Map();
function backSprite(ci, v, up, side) {
  const key = ci + ":" + v + ":" + up + ":" + side + "@" + K.pixelScale();
  let c = BK.get(key);
  if (c) return c;
  const src = catBackSprite(ci, { v, tailUp: !!up, side, rim: "#ffb49c", amb: "#5c58a0", rimDir: [0.42, -0.9] });
  c = K.makeCanvas(src.width, src.height);
  c.getContext("2d").drawImage(src, 0, 0);
  const e = src.width / 110;
  edgeLight(c, 0.8 * e, -1.8 * e, "#ffc8a6", 0.85);
  edgeLight(c, 1.6 * e, -4 * e, "#ff9c84", 0.32);
  BK.set(key, c);
  return c;
}
const CROWD6 = (() => {
  const out = [];
  const R = K.rng("f18crowd");
  const rows = 11;
  for (let r = 0; r < rows; r++) {
    const d = r / (rows - 1);
    const y = 352 + Math.pow(d, 1.7) * 230;
    const h = 9 + Math.pow(d, 1.7) * 115;
    const n = Math.round(K.lerp(16, 6, d));
    const spread = K.lerp(330, 900, d);
    for (let i = 0; i < n; i++) {
      const x = 480 + ((i + 0.5) / n - 0.5) * spread * 2 + (R() - 0.5) * spread * 0.12;
      if (d < 0.25 && Math.abs(x - 480) < 40) continue;
      out.push({ x, y: y + (R() - 0.5) * h * 0.12, h: h * (0.85 + R() * 0.3), ci: Math.floor(R() * 10), v: R() > 0.5 ? 1 : 0, side: R() > 0.5 ? 1 : -1, jit: R() });
    }
  }
  const R2 = K.rng("f18crowd-pose");
  for (const m of out) { m.lean = (R2() - 0.5) * 0.18; m.wid = 0.86 + R2() * 0.28; m.up = R2() > 0.62 ? 1 : 0; }
  out.sort((a, b) => a.y - b.y);
  out.forEach((m, i) => { m.sit = 54.6 + (i / out.length) * 4.6 + m.jit * 0.6; });
  return out;
})();
const RING6 = { x: 480, y: 172 };
function sitter(q, m, t) {
  const arrive = K.ease.out(K.seg(t, m.sit - 1.6, m.sit - 0.2));
  const rise = 1 - K.ease.inOut(K.seg(t, m.sit - 0.3, m.sit + 0.5));
  const gait = rise > 0.5 && arrive < 1 ? Math.abs(Math.sin((t + m.x * 0.01) * 7)) * m.h * 0.035 : 0;
  const gy = m.y + (1 - arrive) * m.h * 0.3;
  const x = m.x + (1 - arrive) * (m.x - 480) * 0.05;
  const lift = gait / Math.max(1, m.h * 0.1);
  // contact occlusion on the cloud floor, then a soft shadow thrown toward the lens
  K.shadowBlob(q, x, gy, m.h * 0.36 * m.wid, m.h * 0.06, { alpha: 0.7 * (1 - lift * 0.6), color: SHADOW, soft: 1.2 });
  K.shadowBlob(q, x - m.h * 0.08, gy + m.h * 0.09, m.h * 0.5, m.h * 0.14, { alpha: 0.3, color: SHADOW, soft: 1.8 });
  const spr = backSprite(m.ci, m.v, m.up, m.side);
  const k = m.h / 100;
  q.save();
  q.translate(x, gy - gait);
  q.transform(1, 0, -m.lean * (1 - rise), 1, 0, 0);
  q.scale(k * (1 - rise * 0.12) * m.wid, k * (1 + rise * 0.28));
  q.drawImage(spr, -55, -130, 110, 134);
  q.restore();
}
function shot6(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 54, 66));
  const hz = 300;
  K.withCamera(g, W, H, { x: 480, y: K.lerp(240, 300, p), zoom: K.lerp(1.0, 1.12, p), shakeT: t, shakeAmt: 0.6 }, (c) => {
    heaven(c, W, H, t, hz, { stars: 0.3, sunX: 840 });
    cloudSea(c, W, H, t, hz, 840);
    tower(c, 120, hz + 30, 150, 1);
    tower(c, 820, hz + 8, 80, 2);
    deadRing(c, RING6.x, RING6.y + Math.sin(t * 0.5) * 1.2, 92, t);
    kid(c, 480, 322, 62, t, { walk: false, phase: 0.25, lx: 200, ly: -60, gy: 322 });
    if (BISCUIT_ON_SCREEN) {
      K.shadowBlob(c, 495, 322, 8, 1.4, { alpha: 0.8, color: SHADOW, soft: 1.2 });
      drawCat18(c, 495, 322.5, 11, 1, catSpec(11, -1, { pose: "sit", steps: 1, tailUp: 0.3, parade: 1 }), 0);
    }
    const far = [], mid = [], near = [];
    for (const m of CROWD6) (m.h < 24 ? far : m.h < 50 ? mid : near).push(m);
    // aerial perspective: the far rows fade into the rose haze, not just shrink
    const Lf = inLayer(c, W, H, "f18s6far", (q) => { for (const m of far) sitter(q, m, t); hazeLayer(q, "#c890b4", 0.42); });
    put(c, W, H, Lf, 1);
    const Lm = inLayer(c, W, H, "f18s6mid", (q) => { for (const m of mid) sitter(q, m, t); hazeLayer(q, "#c08cb4", 0.16); });
    put(c, W, H, Lm, 1);
    K.fog(c, W, H, { y: 336, h: 50, color: "#c890b4", alpha: 0.14, wisps: false });
    const Ln = inLayer(c, W, H, "f18s6near", (q) => { for (const m of near) sitter(q, m, t); });
    put(c, W, H, Ln, 1, 1.8);
  });
  K.godRays(g, 840, 300, W, H, { color: "#ffb8a8", count: 7, strength: 0.08, t, angle: -Math.PI / 2 - 0.6, spread: 1.4, seed: 186 });
}

// ---- the warm queue: every bake, in the order the film needs it, a few ms per frame ---------------------------
let JOBS = null, JOB_I = 0;
function jobs() {
  if (JOBS) return JOBS;
  const L = [];
  const pix = (need, jf) => { let j = null; L.push({ need, step: () => jobStep(j || (j = jf())), done: () => !!j && j.done }); };
  const once = (need, fn) => { let d = false; L.push({ need, step: () => { if (!d) { d = true; fn(); } }, done: () => d }); };
  for (let i = 0; i < 6; i++) pix(0, () => slabJob(i, 0));
  for (let i = 0; i < 2; i++) pix(0, () => slabJob(i, 1));
  for (let i = 0; i < 3; i++) pix(0, () => towerJob(i));
  once(0.6, far1);
  once(11, fg2);
  const W2 = wishes([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((ci) => [[30, ci, {}], [60, ci, {}]]), 12);
  const W3 = wishes([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((ci) => [[10, ci, {}], [30, ci, {}]]).concat([0, 2, 4, 6, 8].flatMap((ci) => [[10, ci, { pose: "run" }], [30, ci, { pose: "run" }]])), 22);
  const W4 = [];
  for (const m of PARADE) {
    for (const pose of m.kitten ? ["walk", "run"] : ["walk"]) {
      const spec = paradeSpec(m, pose);
      for (let q = 0; q < spec.steps; q++) W4.push({ need: 34, spec, q });
    }
  }
  for (const w of W2.concat(W3, W4)) once(w.need, () => catSprite(w.spec, w.q));
  for (let n = 0; n < BENCH_N; n++) for (let i = 0; i < BENCH_STRIPS; i++) once(33, () => benchStrip(n, i));
  for (let n = 0; n < BENCH_N; n++) once(33.5, () => benchBlur(n));
  for (let i = 0; i < 5; i++) pix(43, () => stoneJob(i));
  pix(43, ringJob);
  pix(43.5, plateauJob);
  once(48, fg5);
  once(53, () => catSprite(catSpec(11, -1, { pose: "sit", steps: 1, tailUp: 0.3, parade: 1 }), 0));
  const seen = new Set();
  for (const m of CROWD6) {
    const k = m.ci + ":" + m.v + ":" + m.up + ":" + m.side;
    if (seen.has(k)) continue;
    seen.add(k);
    once(53.5, () => backSprite(m.ci, m.v, m.up, m.side));
  }
  L.sort((a, b) => a.need - b.need);
  return (JOBS = L);
}
// fills caches only; never changes what is drawn
function warmQueue(ms) {
  const L = jobs();
  const t0 = now();
  while (JOB_I < L.length && L[JOB_I].done()) JOB_I++;
  for (let i = JOB_I; i < L.length; i++) {
    if (L[i].done()) continue;
    L[i].step();
    if (now() - t0 > ms) return;
  }
}

// ---- assembly ---------------------------------------------------------------------------------------------------
const SHOTS = [[0, 12, shot1], [12, 22, shot2], [22, 34, shot3], [34, 44, shot4], [44, 54, shot5], [54, 66.01, shot6]];

const L18 = lines([
  [3.0, 7.0, "The stairs went up into the sky."],
  [13.0, 17.0, "You thought you were climbing alone."],
  [19.0, 23.0, "But they came. All of them."],
  [24.0, 29.5, "Every cat you ever found, walking with you."],
  [35.0, 40.0, "A whole parade, just for one orange cat."],
  [45.0, 49.5, "At the top, the portal. Dark."],
  [50.0, 53.5, "No light. No way through.", { rate: 0.88, pitch: 0.97 }],
  [56.0, 63.0, "And a hundred cats, waiting to see what you would do."],
]);

// lens grade: pre-dawn - cool lifted blacks, warm highlights, gentle contrast; the hidden sun's core blooms
// with a red halation, as a sunrise does on film
const GRADE = {
  exposure: 0.95, temp: -0.04, tint: 0.02, contrast: 1.08, sat: 0.94, hdr: 1.15,
  lift: [0.012, 0.01, 0.034], gamma: [1, 1, 1.02], gain: [1.04, 0.99, 0.96],
  bloom: 0.34, threshold: 0.92, halation: 0.6, grain: 0.05, vignette: 0.45, ca: 0.5, weave: 1,
};

export const film = {
  id: 18,
  title: "The Procession",
  chapter: "Chapter 18",
  unlockAt: 90,
  duration: D,
  poster: 34,
  tagline: "You are not walking alone.",
  subs: L18.subs,
  voice: L18.voice,
  score: { mood: "epic", key: "G", bpm: 84, cues: [[3, "swell"], [18, "purr"], [32, "swell"], [44, "hit"], [58, "swell"]] },
  grade: GRADE,
  gradeAt(t) {
    const k = K.smooth(K.seg(t, 43, 46));
    return { temp: K.lerp(-0.04, -0.12, k), exposure: K.lerp(0.95, 0.9, k) };
  },
  draw(g, t, W, H) {
    g.save();
    if (W !== 960 || H !== 540) g.scale(W / 960, H / 540);
    W = 960; H = 540;
    try {
      g.fillStyle = "#0e0d2c";
      g.fillRect(0, 0, W, H);
      if (t < 0.5) {
        // under the black of the fade-in: bake instead of drawing
        if (!warmSky(3)) warmQueue(40);
      } else {
        for (const [a, b, fn] of SHOTS) if (t >= a && t < b) { fn(g, W, H, t); break; }
        if (t >= 66.01) shot6(g, W, H, 66);
        // amortised background baking on 5 of every 6 frames (a few ms, plus at most one kit cat bake)
        if (Math.round(t * 60) % 6 !== 0) warmQueue(2.5);
      }
      K.letterbox(g, W, H, 1);
      const ta = K.env(t, 2, 6, 1.0, 1.2);
      if (ta > 0) K.title(g, W, H, "The Procession", "Chapter 18", ta, { glow: "#ffb8a8", y: H * 0.3 });
      K.fadeBlack(g, W, H, 1 - K.smooth(K.seg(t, 0, 1.6)));
      K.fadeBlack(g, W, H, K.smooth(K.seg(t, 64.4, 66)));
    } finally {
      g.restore();
    }
  },
};
