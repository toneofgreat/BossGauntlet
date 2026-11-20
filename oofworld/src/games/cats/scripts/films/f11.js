// films/f11.js - Chapter 11 "Nothing" (FILMS.md f11). The nil Void, shot like a real night film: an
// endless floor of pale stone tiles you only ever see inside your flashlight's pool, a dusty
// volumetric beam, faint amber pawprints, lost things drifting through the light, hundreds of
// patient eyeshines, and the bell that makes them all look the same way.
// Lighting model: the floor is textured albedo MULTIPLIED by a light map (inverse-square pools with a
// reflector hotspot + corona ring + spill) plus a gloss-mapped specular sheen; everything outside
// the light is black. The GPU lens adds bloom / halation / grain / vignette (film.grade).
// Pure function of t; everything is drawn in a 960 x 540 space.
import * as K from "../filmkit.js";

const D = 58;
const VOID = "#030306", GRID = "#1a1a2a", TORCH = "#fff3d0", HOT = "#ffffff", COLD = "#c8c8ff";

// ---- fast tileable value noise for the bakes (a lookup table per seed: ~50x cheaper than the kit's
// gradient noise, so every texture here bakes in a few ms instead of seconds) ---------------------
const VNT = new Map();
function vtab(seed) {
  let t = VNT.get(seed);
  if (!t) {
    const R = K.rng("f11vn" + seed);
    t = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) t[i] = R() * 2 - 1;
    VNT.set(seed, t);
  }
  return t;
}
// value noise in [-1, 1] with integer period (px, py) <= 256 (tileable when x, y = u * period)
function vnoise(x, y, seed, px = 256, py = 256) {
  const t = vtab(seed);
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py, x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = t[(y0 << 8) | x0], b = t[(y0 << 8) | x1], c = t[(y1 << 8) | x0], d = t[(y1 << 8) | x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function vfbm(x, y, seed, oct, px, py) {
  let s = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < oct; o++) {
    s += vnoise(x * f, y * f, seed + o * 7, Math.min(256, px * f), Math.min(256, py * f)) * amp;
    norm += amp; amp *= 0.5; f *= 2;
  }
  return s / norm;
}
function vridged(x, y, seed, oct, px, py) {
  let s = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < oct; o++) {
    const n = 1 - Math.abs(vnoise(x * f, y * f, seed + o * 7, Math.min(256, px * f), Math.min(256, py * f)));
    s += n * n * amp; norm += amp; amp *= 0.5; f *= 2;
  }
  return s / norm;
}

// ---- the stone floor: a baked 4 x 4 tile albedo texture + gloss map + mip chain ----------------------
const TEX_N = 384, TILES = 4;
// The slab texture is the one big bake (384^2 px): it is computed row by row, a slice per call of
// tileBakeStep(budgetMs) during the black opening, so no single frame stalls; tileAlbedo() finishes
// whatever is left on demand and returns the cached canvas.
const TILEJOB = { img: null, y: 0, canvas: null, out: [0, 0, 0, 0] };
function tileBakeStep(budget = 1e9) {
  const J = TILEJOB;
  if (J.canvas) return true;
  const t0 = performance.now();
  if (!J.img) { J.c = K.makeCanvas(TEX_N, TEX_N); J.img = J.c.getContext("2d").createImageData(TEX_N, TEX_N); }
  const D = J.img.data, out = J.out;
  while (J.y < TEX_N) {
    for (let x = 0; x < TEX_N; x++) {
      tilePixel(x / TEX_N, J.y / TEX_N, out);
      const i = (J.y * TEX_N + x) * 4;
      D[i] = out[0]; D[i + 1] = out[1]; D[i + 2] = out[2]; D[i + 3] = 255;
    }
    J.y++;
    if (performance.now() - t0 > budget) return false;
  }
  J.c.getContext("2d").putImageData(J.img, 0, 0);
  J.canvas = J.c; J.img = null;
  return true;
}
function tileAlbedo() {
  if (!TILEJOB.canvas) tileBakeStep();
  return TILEJOB.canvas;
}
function tilePixel(u, v, out) {
  // honed limestone slabs: per-slab tone (+-6%), broad clouding, fine mottle, pale veins, pits; a
  // recessed dusty grout groove whose far lip (the next slab's near edge, facing the camera and the
  // torch) catches light, while the near slab's far edge turns away into the groove's shadow
  {
    const tu = u * TILES, tv = v * TILES;
    const ix = Math.floor(tu), iy = Math.floor(tv), fu = tu - ix, fv = tv - iy;
    const ex = Math.min(fu, 1 - fu);
    const tone = (K.hash(ix * 7 + iy * 13, 41) - 0.5) * 0.12, warm = (K.hash(ix * 3 + iy * 11, 42) - 0.5) * 0.035;
    const big = vfbm(u * 3, v * 3, 51, 4, 3, 3);
    const mid = vfbm(u * 14, v * 14, 52, 3, 14, 14);
    const fine = vfbm(u * 48, v * 48, 55, 2, 48, 48);
    const vein = vridged(u * 5 + big * 0.6, v * 5, 53, 4, 5, 5);
    const sp = vnoise(u * 150, v * 150, 54, 150, 150);
    const pit = sp > 0.62 ? (sp - 0.62) * 0.5 : 0;
    let L = 0.42 * (1 + tone) + big * 0.045 + mid * 0.03 + fine * 0.014 + Math.pow(vein, 6) * 0.07 + sp * 0.012 - pit;
    // eased arrises: side edges round off, the far edge (fv -> 1) turns away from the light
    L *= 0.9 + 0.1 * K.clamp((ex - 0.008) / 0.03);
    L *= 1 - 0.22 * K.clamp(1 - (1 - fv - 0.006) / 0.02);
    const lip = K.clamp(1 - Math.abs(fv - 0.012) / 0.008) * K.clamp((ex - 0.006) / 0.01);
    L *= 1 + 0.16 * lip;
    // grout: recessed and dusty, mid grey (never black), darker in the shadowed half of the groove
    const groutD = Math.min(ex, fv < 0.5 ? fv : 1 - fv);
    const gr = K.clamp((groutD - 0.0025) / 0.0045);
    const groutL = (0.27 + mid * 0.04 + sp * 0.02) * (fv > 0.5 ? 0.8 : 1);
    L = K.lerp(groutL, L, gr) * 1.5;            // exposure baked in: the torch pool is never clipped
    out[0] = 255 * L * (1.03 + warm); out[1] = 255 * L; out[2] = 255 * L * (0.95 - warm); out[3] = 255;
  }
}
function tileGloss() {
  // polished but used: smudges, scuffs, matte grout
  return K.texBake("f11gloss:v3", TEX_N / 2, TEX_N / 2, (u, v, out) => {
    const tu = u * TILES, tv = v * TILES;
    const fu = tu - Math.floor(tu), fv = tv - Math.floor(tv);
    const e = Math.min(fu, 1 - fu, fv, 1 - fv);
    const sm = K.texFbm(u * 6, v * 6, 61, 4, 6, 6);
    const sc = K.texRidged(u * 9, v * 22, 62, 3, 9, 22);
    const gl = K.clamp(0.55 + sm * 0.5 - Math.pow(sc, 4) * 0.4) * K.clamp((e - 0.01) / 0.02);
    out[0] = out[1] = out[2] = 255 * gl; out[3] = 255;
  });
}
const MIPS = new Map();
function mips(tex, key) {
  let m = MIPS.get(key);
  if (m) return m;
  m = [tex];
  let c = tex;
  for (let i = 0; i < 4; i++) {
    const n = K.makeCanvas(Math.max(8, c.width >> 1), Math.max(8, c.height >> 1));
    const x = n.getContext("2d");
    x.imageSmoothingEnabled = true;
    x.drawImage(c, 0, 0, n.width, n.height);
    m.push(n);
    c = n;
  }
  MIPS.set(key, m);
  return m;
}
const PATS = new WeakMap();
function patFor(g, c) {
  let m = PATS.get(c);
  if (!m) { m = new WeakMap(); PATS.set(c, m); }
  let p = m.get(g);
  if (!p) { p = g.createPattern(c, "repeat"); m.set(g, p); }
  return p;
}

// a floor plane seen from a camera at height h above it, horizon at screen y = hy, focal f, pan
function floorCam(hy, h, f, cx = 480, panX = 0, panZ = 0) {
  return {
    hy, h, f, cx, panX, panZ,
    P(X, Z) { const z = Math.max(0.05, Z - panZ); return [cx + (X - panX) * f / z, hy + h * f / z]; },
    Zat(sy) { return h * f / Math.max(0.001, sy - hy) + panZ; },
  };
}
// paint the (unlit) textured floor into rect [x0,y0,x1,y1] in true perspective: thin affine strips,
// each sampling the mip level that matches its on-screen texel size (no shimmer at distance)
function paintFloor(g, cam, rect, which = "albedo", err = 1) {
  const [x0, y0, x1, y1] = rect;
  const top = Math.max(y0, cam.hy + 0.8), bot = Math.min(y1, 540);
  if (bot <= top || x1 <= x0) return;
  const base = which === "gloss" ? tileGloss() : tileAlbedo();
  const chain = mips(base, which);
  g.save();
  g.beginPath(); g.rect(x0, top, x1 - x0, bot - top); g.clip();
  g.fillStyle = which === "gloss" ? "#5a5a5a" : "#5e5b55";
  g.fillRect(x0, top, x1 - x0, bot - top);
  // rows: thin strips (geometric near the horizon, <= 5 px elsewhere); columns: each cell gets its own
  // skew so lines of constant X converge to the vanishing point instead of stair-stepping
  const d0 = top - cam.hy, d1 = bot - cam.hy;
  const gq = Math.pow(d1 / d0, 1 / 56);
  let ya = top;
  while (ya < bot - 0.01) {
    const yb = Math.min(bot, ya + Math.min(5, (ya - cam.hy) * (gq - 1) + 0.6));
    const ym = (ya + yb) / 2;
    const za = cam.h * cam.f / (ya - cam.hy) + cam.panZ, zb = cam.h * cam.f / (yb - cam.hy) + cam.panZ;
    const unit = (ym - cam.hy) / cam.h;             // screen px per world unit at this row
    const vunit = (yb - ya) / Math.max(1e-4, za - zb);
    const lvl = K.clamp(Math.floor(Math.log2(Math.max(1e-3, base.width / TILES / Math.sqrt(unit * vunit))) - 0.6), 0, chain.length - 1);
    const c = chain[lvl], T = c.width / TILES;      // texels per world unit at this mip
    const a = unit / T, d = -(yb - ya) / ((za - zb) * T);
    const ff = ya - za * T * d;
    const p = patFor(g, c);
    g.fillStyle = p;
    const colW = Math.max(0.25, 2 * err * cam.h / Math.max(0.5, yb - ya));
    const Xa = cam.panX + (x0 - cam.cx) / unit, Xb = cam.panX + (x1 - cam.cx) / unit;
    for (let Xs = Xa; Xs < Xb; Xs += colW) {
      const Xc = Xs + colW / 2;
      const sk = (Xc - cam.panX) / cam.h;
      const e = cam.cx - cam.panX * unit - sk * (ym - ff);
      p.setTransform(new DOMMatrix([a, 0, sk * d, d, e, ff]));
      const sx = cam.cx + (Xs - cam.panX) * unit;
      g.fillRect(sx - 0.6, ya - 0.4, colW * unit + 1.2, yb - ya + 0.8);
    }
    ya = yb;
  }
  g.restore();
}
// a flashlight's footprint (cached): reflector hotspot, a faint corona ring, wide soft spill
// An LED torch footprint, baked: a hot centre, a bright corona ring at the reflector's edge, a dimmer
// spill annulus with a soft but defined outer edge, faint concentric reflector rings and a little
// die mottling (no torch throws a perfect gradient)
function torchPoolSprite() {
  return K.texBake("f11pool:v3", 192, 192, (u, v, out) => {
    const x = u - 0.5, y = v - 0.5, d = Math.hypot(x, y) * 2;
    if (d >= 1) { out[0] = out[1] = out[2] = 255; out[3] = 0; return; }
    const hot = 0.9 * Math.exp(-Math.pow(d / 0.16, 2));
    const body = 0.42 * (1 - K.smooth(K.clamp((d - 0.18) / 0.16)));
    const ring = 0.2 * Math.exp(-Math.pow((d - 0.33) / 0.035, 2));
    const spill = 0.17 * (1 - K.smooth(K.clamp((d - 0.62) / 0.3)));
    const rings = 0.007 * Math.sin(d * 44) * Math.exp(-Math.pow((d - 0.5) / 0.14, 2));
    const mott = vfbm(u * 5, v * 5, 77, 3, 5, 5) * 0.035 * (1 - d);
    const a = K.clamp(hot + body + ring + spill + rings + mott);
    out[0] = out[1] = out[2] = 255; out[3] = 255 * a;
  });
}
// a soft light wedge (cached): apex at the left middle, smooth angular falloff (reflector beam profile)
// times inverse-square-ish falloff along its length. Drawn rotated + stretched for any cone.
const WEDGE_HALF = Math.atan(128 / 512);
function wedgeSprite() {
  return K.texBake("f11wedge:v1", 512, 256, (u, v, out) => {
    const x = u * 512, y = (v - 0.5) * 256;
    const a = Math.atan2(Math.abs(y), Math.max(1, x)) / WEDGE_HALF;   // 0 axis .. 1 sprite edge
    const r = Math.hypot(x, y) / 512;
    const ang = Math.exp(-Math.pow(a / 0.55, 2) * 1.6) * 0.75 + 0.25 * Math.exp(-Math.pow(a / 0.85, 4) * 2);
    const rad = (1 / (1 + Math.pow(r * 1.9, 2))) * K.clamp((1.02 - r) / 0.2) * K.clamp(x / 6);
    out[0] = out[1] = out[2] = 255; out[3] = 255 * K.clamp(ang * rad);
  });
}
// stamp the wedge from (x, y) along angle for length len with half-angle sp
function wedge(c, x, y, angle, len, sp, alpha = 1) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.globalAlpha *= alpha;
  const hh = len * Math.tan(Math.min(1.3, sp)) * 1.25;
  c.drawImage(wedgeSprite(), 0, -hh, len, hh * 2);
  c.restore();
}
// draw a light (pool) into a light map: { x, y, rx, ry, I, color, wide }
function lightInto(m, L) {
  const spr = torchPoolSprite();
  m.save();
  m.globalCompositeOperation = "lighter";
  m.globalAlpha = K.clamp(L.I == null ? 1 : L.I);
  m.drawImage(spr, L.x - L.rx, L.y - L.ry, L.rx * 2, L.ry * 2);
  m.restore();
}
// the lit floor: albedo x light map (+ gloss sheen at the specular point), added onto black
// the two static-camera floors (shot 1 and shot 5), painted once
const CAM1 = floorCam(110, 1.5, 420, 480), CAM5 = floorCam(250, 1.0, 420, 480, -0.3, 0);
const FL1 = { key: "s1", cam: CAM1, rect: [0, 111, 960, 540] }, FL5 = { key: "s5", cam: CAM5, rect: [0, 251, 960, 540] };
function cachedFloor(c) {
  const [x0, y0, x1, y1] = c.rect;
  return K.sprite("f11fl:" + c.key, x1 - x0, y1 - y0, (s) => { s.translate(-x0, -y0); paintFloor(s, c.cam, c.rect, "albedo", 1.0); });
}
const CAM3 = floorCam(4, 1.0, 800, 480), FL3 = { key: "s3", cam: CAM3, rect: [0, 5, 960, 540] };
/// Progressive prewarm. Every heavy cache (floors, textures, sprites, the cat's gait sprites) has a
// slot. During the black opening (t < 1.6) frames build as many slots as fit in ~120 ms each (a
// stall there is invisible); later slots (the cheap cat sprites) build one per frame in their time
// window [ts, ts + 1.6). After a seek only the slots near t run and the rest build lazily.
// Only caches change: the picture is still a pure function of t.
let WARM = null;
const WARMED = new Set();
function warmList() {
  if (WARM) return WARM;
  const L = [
    [0.02, () => tileBakeStep(90)], [0.05, () => mips(tileAlbedo(), "albedo")], [0.08, () => cachedFloor(FL1)],
    [0.1, () => torchPoolSprite()], [0.12, () => wedgeSprite()], [0.14, () => bokehSprite()],
    [0.16, () => { almond("#a8f07a"); almond("#ffd462"); almond("#d8ee6a"); }],
    [0.2, () => { printTinted(PRINT_DUST); printTinted(PRINT_GLOW); }],
    [0.3, () => catSprite("w", 0)], [0.4, () => fistSprite()], [0.5, () => cachedFloor(FL3)],
    [0.6, () => cachedFloor(FL5)], [0.7, () => bootsArt()], [0.8, () => knurlTex()],
    [0.9, () => fenceSprite()], [1.0, () => chairSprite()], [1.1, () => lampSprite()], [1.2, () => bookSprite()],
    [1.3, () => mittenSprite()], [1.4, () => ballSprite()], [1.5, () => catSprite("s", 0)],
  ];
  // the rest of the black cat's gait / sniff sprites (a few ms each) during the title
  for (let i = 1; i < CAT_PH; i++) L.push([4.2 + i * 0.25, () => catSprite("w", i)]);
  for (let i = 1; i < SNIFF_N; i++) L.push([7.2 + i * 0.25, () => catSprite("s", i)]);
  L.sort((a, b) => a[0] - b[0]);
  WARM = L;
  return L;
}
function warmAt(t) {
  const L = warmList();
  const black = t < 1.6;
  const t0 = black ? performance.now() : 0;
  for (let i = 0; i < L.length; i++) {
    const ts = L[i][0];
    if (black ? ts >= 1.6 : t < ts) break;
    if (WARMED.has(i) || (!black && t >= ts + 1.6)) continue;
    if (L[i][1]() === false) return;           // a progressive job: more next frame (later slots depend on it)
    WARMED.add(i);
    if (!black || performance.now() - t0 > 120) return;
  }
}
function litFloor(g, cam, rect0, lights, o = {}) {
  // whole-pixel rect so the clip edges never leave a half-lit seam
  const rect = [Math.floor(Math.max(0, rect0[0])), Math.floor(Math.max(0, rect0[1])), Math.ceil(Math.min(960, rect0[2])), Math.ceil(Math.min(540, rect0[3]))];
  const F = K.layer(960, 540, "f11floor");
  if (o.cache) {
    // static camera: the whole floor region is painted once into a sprite, then just stamped
    const [sx0, sy0, sx1, sy1] = o.cache.rect;
    const spr = cachedFloor(o.cache);
    F.g.save();
    F.g.beginPath(); F.g.rect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]); F.g.clip();
    F.g.drawImage(spr, sx0, sy0, sx1 - sx0, sy1 - sy0);
    F.g.restore();
  } else paintFloor(F.g, cam, rect, "albedo", o.err || 1);
  const M = K.layer(480, 270, "f11lm");
  M.g.scale(0.5, 0.5);
  M.g.fillStyle = "#000"; M.g.fillRect(0, 0, 960, 540);
  for (const L of lights) lightInto(M.g, L);
  // specular sheen where the torch reflects toward the camera: an extra tight lobe in the light map,
  // so the stone's own mottling breaks it up (polish varies with the albedo)
  // (a glossy reflection of a light stretches toward the camera: narrow and long down the screen)
  if (o.spec) {
    const sr = o.spec.r, sl = o.spec.long || 1.7;
    lightInto(M.g, { x: o.spec.x, y: o.spec.y, rx: sr * 0.5, ry: sr * sl * 0.5, I: o.spec.I * 0.8 });
    lightInto(M.g, { x: o.spec.x, y: o.spec.y + sr * sl * 0.15, rx: sr * 0.3, ry: sr * sl * 0.4, I: o.spec.I * 0.35 });
  }
  // torch colour over the whole light map (white-hot core stays near white)
  M.g.globalCompositeOperation = "multiply";
  M.g.fillStyle = o.color || "#ffe9c4"; M.g.fillRect(0, 0, 960, 540);
  F.g.save();
  F.g.beginPath(); F.g.rect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]); F.g.clip();
  F.g.globalCompositeOperation = "multiply";
  F.g.imageSmoothingEnabled = true;
  F.g.drawImage(M.canvas, 0, 0, 960, 540);
  F.g.restore();
  const gain = o.gain == null ? 1 : o.gain;
  g.save();
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = Math.min(1, gain);
  g.drawImage(F.canvas, 0, 0, 960, 540);
  if (gain > 1) { g.globalAlpha = gain - 1; g.drawImage(F.canvas, 0, 0, 960, 540); }
  g.restore();
}
// the faint grid of nothing: the grout lines read just above black far beyond the light
function grid(g, cam, o = {}) {
  const x0 = o.x0 == null ? -30 : o.x0, x1 = o.x1 == null ? 30 : o.x1;
  const z0 = o.z0 == null ? 0.6 : o.z0, z1 = o.z1 == null ? 40 : o.z1;
  const col = o.color || GRID, a = o.alpha == null ? 1 : o.alpha, st = o.step || 1;
  g.lineWidth = o.width || 1;
  // contrast fades continuously with distance (geometric bands), so the floor sinks into the haze
  const bands = [];
  for (let za = z0; za < z1; za *= 1.35) bands.push([za, Math.min(z1, za * 1.35), Math.exp(-(za * 1.17 - z0) / (o.fade || 4.5))]);
  for (const [za, zb, k] of bands) {
    if (zb <= z0 || za >= z1) continue;
    g.strokeStyle = K.rgba(col, a * k);
    g.beginPath();
    for (let X = Math.ceil(x0 / st) * st; X <= x1; X += st) {
      const p0 = cam.P(X, Math.max(za, z0)), p1 = cam.P(X, Math.min(zb, z1));
      g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]);
    }
    for (let Z = Math.ceil(Math.max(za, z0) / st) * st; Z < Math.min(zb, z1) || (zb >= z1 && Z <= z1); Z += st) {
      const p0 = cam.P(x0, Z), p1 = cam.P(x1, Z);
      g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]);
    }
    g.stroke();
  }
}
// draw something through a light mask: paint(c) into a layer, then keep only what mask(m) lights
// opaque: solid things stay solid outside the light (they fall to near black and still occlude
// the hazy beam behind them) instead of fading out
function lit(g, W, H, key, paint, mask, alpha = 1, mode = "source-over", opaque = false) {
  const L = K.layer(W, H, key);
  paint(L.g);
  applyMask(L, W, H, mask, opaque);
  g.save();
  g.globalCompositeOperation = mode;
  g.globalAlpha *= alpha;
  g.drawImage(L.canvas, 0, 0, W, H);
  g.restore();
}
function applyMask(L, W, H, mask, opaque) {
  const M = K.layer(W / 2, H / 2, "f11mask");
  M.g.scale(0.5, 0.5);
  mask(M.g);
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  L.g.globalAlpha = 1;
  L.g.imageSmoothingEnabled = true;
  if (opaque) {
    const D = K.layer(W / 2, H / 2, "f11dark");
    D.g.setTransform(1, 0, 0, 1, 0, 0);
    D.g.fillStyle = "#030204"; D.g.fillRect(0, 0, D.canvas.width, D.canvas.height);
    D.g.globalCompositeOperation = "destination-out";
    D.g.drawImage(M.canvas, 0, 0);
    L.g.globalCompositeOperation = "source-atop";
    L.g.drawImage(D.canvas, 0, 0, L.canvas.width, L.canvas.height);
  } else {
    L.g.globalCompositeOperation = "destination-in";
    L.g.drawImage(M.canvas, 0, 0, L.canvas.width, L.canvas.height);
  }
  L.g.globalCompositeOperation = "source-over";
}
// the beam's outline: a wedge from the torch tip (tx, ty) wrapping the pool ellipse
function conePath(tx, ty, px, py, rx, ry, k = 1) {
  const ang = Math.atan2(py - ty, px - tx);
  const nx = -Math.sin(ang), ny = Math.cos(ang);
  const w = Math.hypot(rx * nx, ry * ny) * k;
  const p = new Path2D();
  p.moveTo(tx, ty);
  p.lineTo(px + nx * w, py + ny * w);
  p.ellipse(px, py, rx * k, ry * k, 0, Math.atan2(ny, nx), Math.atan2(-ny, -nx), true);
  p.closePath();
  return p;
}
// the beam in the air: nested soft wedges at quarter res, broken up by drifting haze (cloud texture)
function cone(g, t, tx, ty, px, py, rx, ry, a = 1) {
  const Lc = K.layer(240, 135, "f11cone");
  const c = Lc.g;
  c.scale(0.25, 0.25);
  c.globalCompositeOperation = "lighter";
  for (const [k, al] of [[1.05, 0.035], [0.8, 0.045], [0.55, 0.06], [0.3, 0.06], [0.14, 0.05]]) {
    const gr = c.createLinearGradient(tx, ty, px, py);
    gr.addColorStop(0, K.rgba(k < 0.2 ? HOT : TORCH, al * 3.2 * a));
    gr.addColorStop(0.18, K.rgba(TORCH, al * 1.6 * a));
    gr.addColorStop(0.6, K.rgba(TORCH, al * 0.8 * a));
    gr.addColorStop(1, K.rgba(TORCH, al * 0.55 * a));
    c.fillStyle = gr;
    c.fill(conePath(tx, ty, px, py, rx, ry, k));
  }
  haze(c, t, 0.55);
  g.save();
  g.globalCompositeOperation = "lighter";
  g.imageSmoothingEnabled = true;
  g.drawImage(Lc.canvas, 0, 0, Lc.canvas.width, Lc.canvas.height, 0, 0, 960, 540);
  g.restore();
}
// eat drifting holes out of a quarter-res light layer (the beam passes through uneven haze)
function haze(c, t, amt) {
  const pat = K.texPattern(c, "cloud", { seed: 5, cover: 0.45 });
  if (pat.setTransform) pat.setTransform(new DOMMatrix([2.2, 0, 0, 1.4, -t * 9, t * 3]));
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = "destination-out";
  c.globalAlpha = amt;
  c.fillStyle = pat;
  c.fillRect(0, 0, c.canvas.width, c.canvas.height);
  c.globalAlpha = 1;
  c.globalCompositeOperation = "source-over";
}
// dust motes visible only inside the cone (tip t, axis toward p, half-angle sp); a few big soft ones
// close to the lens are out of focus (bokeh discs)
function beamMotes(g, t, tx, ty, px, py, sp, o = {}) {
  const n = o.count || 110, seed = o.seed || 3;
  const ax = px - tx, ay = py - ty, al = Math.hypot(ax, ay) || 1;
  const spr = K.glowSprite(o.color || "#fff2d8");
  const [bx, by, bw, bh] = o.area || [0, 0, 960, 540];
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const x = bx + ((K.hash(i, seed) * bw + K.noise(t * 0.12 + i, seed) * 60 + t * 3) % bw + bw) % bw;
    const y = by + ((K.hash(i + 0.5, seed) * bh + K.noise(t * 0.1 + i * 3, seed + 1) * 40 - t * 2) % bh + bh) % bh;
    const vx = x - tx, vy = y - ty, vl = Math.hypot(vx, vy) || 1;
    const cos = (vx * ax + vy * ay) / (vl * al);
    const inside = K.clamp((cos - Math.cos(sp)) / (1 - Math.cos(sp)) * 2.2);
    if (inside <= 0.01 || vl > al * 1.15) continue;
    const near = K.hash(i + 0.7, seed) < (o.nearK || 0.06);   // drifting right in front of the lens
    // depth sort: o.only "far" draws the motes behind the subject, "near" the few in front of it
    if ((o.only === "far" && near) || (o.only === "near" && !near)) continue;
    const s = near ? 6 + K.hash(i + 0.9, seed) * 9 : (o.size || 1.4) * (0.5 + K.hash(i + 0.2, seed));
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.7 + i));
    g.globalAlpha = inside * tw * (1 - vl / (al * 1.2)) * (o.alpha || 0.8) * (near ? 0.07 : 1);
    g.drawImage(near ? bokehSprite() : spr, x - s * 2, y - s * 2, s * 4, s * 4);
  }
  g.restore();
}
// an out-of-focus mote: a soft-edged disc with a slightly brighter rim (a lens bokeh), not a star
function bokehSprite() {
  return K.texBake("f11bokeh", 48, 48, (u, v, out) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    const a = K.clamp((1 - d) / 0.14) * (0.62 + 0.38 * K.clamp((d - 0.55) / 0.35));
    out[0] = 255; out[1] = 244; out[2] = 222; out[3] = 255 * a * 0.6;
  });
}
function coldMotes(g, W, H, t, n = 40, seed = 7, a = 0.35) {
  K.dust(g, W, H, t, { seed, color: COLD, count: n, size: 1.0, alpha: a });
}

/// ---- eyeshine in the dark --------------------------------------------------------------------------
// ~140 pairs spread in depth over the floor. Each pair is two small almonds (the tapetum glow seen
// through the lids) with a hot core, a dark slit and a soft scatter halo; far pairs are smaller,
// dimmer and softer (atmospheric falloff). The whole field is painted into one cached layer and
// re-painted only when the quantised time (1/30 s) or the shot changes, so it costs one drawImage on
// most frames (the per-frame field was the t = 45 spike).
const EYES = (() => {
  const R = K.rng("f11eyes2");
  const out = [];
  for (let i = 0; i < 140; i++) {
    const depth = Math.pow(R(), 1.15);              // 0 near .. 1 far
    const x = R() * 1000 - 20;
    const y = K.lerp(392, 262, depth) + (R() - 0.5) * 64 * (1 - depth * 0.7);
    const s = K.lerp(5.6, 1.1, depth);              // half-width of one almond, px
    const h = R();
    const col = h < 0.5 ? "#a8f07a" : h < 0.78 ? "#ffd462" : "#d8ee6a";
    out.push({ x, y, s, col, depth, open: 40.6 + R() * 5.2, ph: R() * 10, per: 4.5 + R() * 5, tilt: (R() - 0.5) * 0.25 });
  }
  out.sort((a, b) => b.depth - a.depth);            // far first
  return out;
})();
function hexRgb(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
// one almond of eyeshine (baked per colour): a soft-lidded lens shape, saturated rim, hot centre
function almond(col) {
  const [r, gg, b] = hexRgb(col);
  return K.texBake("f11almond:" + col, 64, 40, (u, v, out) => {
    const x = (u - 0.5) * 2.2, y = (v - 0.5) * 2.2;
    const hh = 0.78 * Math.pow(Math.max(0, 1 - x * x), 0.8);         // lid curve
    const m = K.clamp((hh - Math.abs(y)) / 0.2) * K.clamp((1 - Math.abs(x)) / 0.12);
    const d = Math.hypot(x * 0.95, y * 1.25);
    const core = Math.exp(-d * d * 4.5);
    const k = 0.55 + 0.45 * core;
    out[0] = Math.min(255, r * k + 255 * core * 0.55);
    out[1] = Math.min(255, gg * k + 255 * core * 0.55);
    out[2] = Math.min(255, b * k + 255 * core * 0.45);
    out[3] = 255 * m * (0.7 + 0.3 * core);
  });
}
// a pair: open 0..1 (lids), look -1..1 (slit offset), gapK (pair spacing, < 1 when the head turns),
// bright (scene-linear multiplier), blur 0.. (defocus)
function eyePair(g, x, y, s, col, open, look = 0, gapK = 1, bright = 1, blur = 0, tilt = 0) {
  if (open <= 0.03 || bright <= 0.01) return;
  const gap = s * 3.1 * gapK;
  const halo = K.glowSprite(col), hot = K.glowSprite("#fffbe8");
  const r = s * (1 + blur * 1.3);
  const A = Math.min(1.4, bright / (1 + blur * 1.6));
  g.save();
  g.globalCompositeOperation = "lighter";
  for (const sd of [-1, 1]) {
    const ex = x + sd * gap / 2, ey = y + sd * tilt * s;
    g.globalAlpha = Math.min(1, 0.13 * A);
    g.drawImage(halo, ex - r * 4, ey - r * 3, r * 8, r * 6);
    if (blur > 0.9) {
      // defocused: a soft disc squashed by the lids
      g.globalAlpha = Math.min(1, 0.75 * A);
      g.drawImage(halo, ex - r * 1.4, ey - r * 1.1 * open, r * 2.8, r * 2.2 * open);
      continue;
    }
    g.globalAlpha = Math.min(1, 0.95 * A);
    g.drawImage(almond(col), ex - r, ey - r * 0.62 * open, r * 2, r * 1.24 * open);
    g.globalAlpha = Math.min(1, 0.55 * A * open);
    g.drawImage(hot, ex - r * 0.45 + look * s * 0.3, ey - r * 0.3 * open, r * 0.9, r * 0.6 * open);
  }
  g.restore();
  if (s * (1 + blur) > 1.6 && blur < 0.9 && open > 0.3) {
    // the vertical slit pupil, sliding toward where the cat looks
    g.fillStyle = `rgba(3,3,4,${(0.78 * Math.min(1, s / 3)).toFixed(3)})`;
    g.beginPath();
    for (const sd of [-1, 1]) {
      const ex = x + sd * gap / 2 + look * s * 0.42, ey = y + sd * tilt * s;
      g.ellipse(ex, ey, Math.max(0.35, s * 0.15), s * 0.52 * open, 0, 0, K.TAU);
    }
    g.fill();
  }
}
// o: ring (time), bell {x, y} (what they turn to), allOpen, scale, dx, dy, shine(x, y), focusDepth,
// blurK, skip(e), dim
function eyeState(e, t, o) {
  const sc = o.scale || 1;
  let x = e.x * (o.sx || 1) + (o.dx || 0), y = e.y + (o.dy || 0);
  let open = o.allOpen ? 1 : K.smooth(K.seg(t, e.open, e.open + 0.9));
  // slow, unhurried blinks, each on its own clock
  const bt = ((t + e.ph) % e.per) / e.per;
  if (bt > 0.93) open *= 1 - 0.95 * Math.sin((bt - 0.93) / 0.07 * Math.PI);
  let look = 0, gapK = 1;
  if (o.ring != null && o.bell && t > o.ring) {
    // the ring reaches each cat after a delay that grows with its distance from the bell, so the
    // reaction rolls outward as a wave: a quick blink (0.12 s), then the eyes and head turn to it
    const dx = o.bell.x - x, dy = o.bell.y - y, dist = Math.hypot(dx, dy);
    const tr = o.ring + 0.04 + dist * 0.004;
    const b = (t - tr) / 0.12;
    if (b > 0 && b < 1) open *= 1 - 0.96 * Math.sin(b * Math.PI);
    const look0 = K.ease.out(K.clamp((t - tr - 0.06) / 0.22));         // the eyes lead...
    const turn = K.ease.inOut(K.clamp((t - tr - 0.14) / 0.55));        // ...the head follows
    const dir = K.clamp(dx / 240, -1, 1);
    look = dir * look0;
    gapK = 1 - 0.3 * turn * Math.abs(dir);
    x += dir * turn * e.s * sc * 1.5;
    y += K.clamp(dy / 300, -1, 1) * turn * e.s * sc * 0.5;
  }
  return { x, y, open, look, gapK };
}
function paintEyes(g, t, o) {
  const sc = o.scale || 1;
  for (const e of EYES) {
    if (o.skip && o.skip(e)) continue;
    const st = eyeState(e, t, o);
    if (st.open <= 0.03) continue;
    const shine = o.shine ? o.shine(st.x, st.y) : 0;
    const blur = o.focusDepth == null ? 0 : Math.abs(e.depth - o.focusDepth) * (o.blurK || 1.2);
    // inverse-square-ish dimming and haze with depth; the ones in the beam flare
    const bright = (o.dim || 1) * K.lerp(1.15, 0.32, e.depth) * (1 + shine * 1.4);
    eyePair(g, st.x, st.y, e.s * sc * (1 + shine * 0.15), e.col, st.open, st.look, st.gapK, bright, blur, e.tilt);
  }
}
const EYECACHE = { key: "", c: null };
function eyeField(g, t, o = {}) {
  const ps = K.pixelScale();
  const key = (o.id || "") + ":" + Math.round(t * 30) + "@" + ps;
  let c = EYECACHE.c;
  if (!c || c.width !== Math.ceil(960 * ps) || c.height !== Math.ceil(540 * ps)) {
    c = EYECACHE.c = K.makeCanvas(Math.ceil(960 * ps), Math.ceil(540 * ps));
    EYECACHE.key = "";
  }
  if (EYECACHE.key !== key) {
    const e = c.getContext("2d");
    e.setTransform(1, 0, 0, 1, 0, 0);
    e.clearRect(0, 0, c.width, c.height);
    e.setTransform(ps, 0, 0, ps, 0, 0);
    paintEyes(e, Math.round(t * 30) / 30, o);
    EYECACHE.key = key;
  }
  g.drawImage(c, 0, 0, 960, 540);
}

// ---- SHOT 1 [0-12] black; click; the beam sweeps the endless floor; title printed on the fog --------
function torchOn(t) {
  // click at 1.6, a stutter, then steady (with a faint living flicker)
  if (t < 1.6) return 0;
  if (t < 1.68) return 0.85;
  if (t < 1.8) return 0.08;
  return 0.96 + 0.04 * Math.sin(t * 31) * Math.sin(t * 7.7);
}
function shotSweep(g, t, W, H) {
  g.fillStyle = VOID; g.fillRect(0, 0, W, H);
  const on = torchOn(t);
  if (on <= 0) return;
  // handheld: the torch hand breathes and wanders a little
  const hx = K.noise(t * 0.6, 3) * 0.12, hz = K.noise(t * 0.5, 4) * 0.18;
  const cam = CAM1;
  // the pool's path on the floor: sweep in from the left, rest at centre, drift right and back
  const a1 = K.ease.inOut(K.seg(t, 1.6, 4.0)), a2 = K.ease.inOut(K.seg(t, 8.2, 10.2)), a3 = K.ease.inOut(K.seg(t, 10.2, 12.2));
  const X = K.lerp(-3.2, 0, a1) + a2 * 2.6 - a3 * 1.6 + Math.sin(t * 0.7) * 0.15 + hx;
  const Z = 3.7 + Math.sin(t * 0.45) * 0.3 + hz;
  const [px, py] = cam.P(X, Z);
  // the footprint of a ~25 degree beam from 1.5 m: wide, foreshortened, the far edge spreads further
  const rx = 2.0 * 420 / Z, ry = rx * (1.5 / Z) * 1.1;
  const tx = 980, ty = 600;
  grid(g, cam, { alpha: 0.16 * on, z0: 1.2, z1: 16 });
  const rect = [px - rx * 2.1, py - ry * 2.0, px + rx * 2.1, Math.min(540, py + ry * 2.6)];
  litFloor(g, cam, rect, [
    { x: px, y: py + ry * 0.05, rx: rx * 1.15, ry: ry * 1.2, I: on },
    { x: px + (tx - px) * 0.12, y: py + ry * 0.55, rx: rx * 2.1, ry: ry * 2.1, I: 0.3 * on },
  ], { spec: { x: px + (tx - px) * 0.06, y: py + ry * 0.55, r: rx * 0.55, long: 2.2, I: 0.32 * on }, gain: 1.05, cache: FL1 });
  // the beam in the haze, from the lens just out of frame (bottom right) down to the pool
  cone(g, t, tx, ty, px, py, rx * 0.9, ry * 0.9, on * 1.7);
  // the title, printed on the haze INSIDE the beam (4-8): low alpha, only where the cone is
  const ta = K.env(t, 4, 8, 1.0, 1.2);
  if (ta > 0) {
    lit(g, W, H, "f11title", (c) => K.title(c, W, H, "Nothing", "Chapter 11", 1, { y: 250, color: "#f3e6cc", glow: "#ffe2b0" }),
      (m) => {
        m.save(); m.fillStyle = "#fff";
        for (const [k, al] of [[1.1, 0.25], [0.9, 0.35], [0.7, 0.4]]) { m.globalAlpha = al; m.fill(conePath(tx, ty, px, py, rx, ry, k)); }
        m.restore();
        haze(m, t * 0.7, 0.35);
      },
      ta * on * 0.55, "lighter");
  }
  beamMotes(g, t, tx, ty, px, py, 0.3, { count: 170, size: 1.3 });
  // the lens bezel just out of shot: its flare creeps in at the corner
  K.glow(g, tx - 10, ty - 10, 110, TORCH, 0.4 * on);
  K.glow(g, tx - 20, ty - 20, 30, HOT, 0.5 * on);
}

// ---- SHOT 2 [12-20] wide from far away: a tiny warm light in an ocean of black ---------------------
// A long lens from ~4 m up and 26 m back: the floor is a true ground plane, so the torch's pool is a
// flat, wide ellipse lying ON it ahead and to the right of you, joined to your hand by a thin dusty
// cone. You stand with your back to us, lit only by the warm bounce off that pool (a rim on the
// edges, warm on the legs), a soft shadow pooled behind you, a touch out of focus at this distance.
function shotFar(g, t, W, H) {
  g.fillStyle = VOID; g.fillRect(0, 0, W, H);
  const p = K.ease.inOut(K.seg(t, 12, 20.4));
  // a very slow crane up and back (the camera rises and the lens widens a little)
  const h = K.lerp(3.6, 4.6, p), f = K.lerp(780, 700, p);
  const cam = floorCam(K.lerp(262, 250, p), h, f, 480 + K.noise(t * 0.3, 9) * 2, 0, 0);
  const kX = -0.5, kZ = 26;
  const [kx, ky] = cam.P(kX, kZ);
  const ks = 1.45 * f / kZ;                                   // you are ~1.45 m tall (~43 -> 39 px)
  // the beam lands a few metres ahead of you, to the right; the pool wanders with your hand
  const fX = 2.1 + Math.sin(t * 0.3) * 0.25 + K.noise(t * 0.5, 61) * 0.1, fZ = 32;
  const [px, py] = cam.P(fX, fZ);
  const Rx = 1.5, Rz = 2.6;                                   // the oblique beam stretches its pool along Z
  const rx = Rx * f / fZ, ry = Rz * h * f / (fZ * fZ);
  const adapt = K.smooth(K.seg(t, 12.3, 15.5));               // the floor round you fades up as your eyes adjust
  grid(g, cam, { alpha: 0.11, z0: 14, z1: 80, x0: -40, x1: 40, step: 2, fade: 22 });
  const hand = [kx + ks * 0.2, ky - ks * 0.47];
  const rect = [Math.min(px, kx) - rx * 2.4, Math.min(py, ky) - ks * 0.4, Math.max(px, kx) + rx * 2.4, Math.max(py, ky) + ry * 4 + 8];
  litFloor(g, cam, rect, [
    { x: px, y: py, rx: rx * 1.3, ry: ry * 1.3, I: 1 },
    { x: (px + kx) / 2, y: (py + ky) / 2 + 2, rx: rx * 1.9, ry: ry * 2.6, I: 0.16 + 0.08 * adapt },   // spill along the way
  ], { spec: { x: px - rx * 0.1, y: py + ry * 0.7, r: rx * 0.45, long: 1.4, I: 0.2 }, gain: 1.0 });
  // the soft shadow you throw toward the camera (the pool and the spill are both in front of you)
  K.shadowBlob(g, kx - 1, ky + 2.5, ks * 0.17, ks * 0.07, { alpha: 0.75 });
  K.shadowBlob(g, kx - ks * 0.05, ky + ks * 0.12, ks * 0.12, ks * 0.1, { alpha: 0.35, soft: 1.6 });
  // the beam in the haze: a thin cone from the lens in your hand down to the pool
  cone(g, t, hand[0], hand[1], px, py, rx * 0.95, ry * 0.95, 1.25);
  // you: back to camera, rim-lit by the pool, warm bounce on the legs; a slight defocus
  const KW = 140, KH = 120, kox = kx - KW / 2, koy = ky - KH + 16;
  const L = K.layer(KW, KH, "f11kid");
  L.g.translate(-kox, -koy);
  K.drawPerson(L.g, kx, ky, ks, {
    view: "back", hood: true, t, breathe: true,
    light: { x: px, y: py - ks * 0.2, color: TORCH, strength: 0.75, z: -0.85 }, ambient: "#020304", fill: "#020203",
  });
  // back to camera: the front light is the pool, so only the edges catch it; darken the body core
  L.g.globalCompositeOperation = "source-atop";
  L.g.fillStyle = "rgba(2,2,4,0.45)"; L.g.fillRect(kx - ks * 0.12, ky - ks * 1.05, ks * 0.24, ks * 1.05);
  L.g.globalCompositeOperation = "source-atop";
  const bg = L.g.createRadialGradient(px, py, 0, px, py, Math.hypot(px - kx, py - ky) + ks * 0.9);
  bg.addColorStop(0, "rgba(255,206,150,0.0)"); bg.addColorStop(0.7, "rgba(255,196,140,0.16)"); bg.addColorStop(1, "rgba(255,196,140,0)");
  L.g.fillStyle = bg; L.g.fillRect(kx - ks, ky - ks * 1.2, ks * 2, ks * 1.3);
  const lg = L.g.createLinearGradient(0, ky - ks * 0.45, 0, ky);
  lg.addColorStop(0, "rgba(255,190,130,0)"); lg.addColorStop(1, "rgba(255,190,130,0.14)");
  L.g.fillStyle = lg; L.g.fillRect(kx - ks, ky - ks * 0.45, ks * 2, ks * 0.46);
  L.g.globalCompositeOperation = "source-over";
  g.save(); g.translate(kox, koy); K.dof(g, L.canvas, 0.9); g.restore();
  // the lens itself, a hot point in your hand
  K.glow(g, hand[0], hand[1], ks * 0.3, TORCH, 0.45);
  K.glow(g, hand[0], hand[1], ks * 0.06, HOT, 0.9);
  beamMotes(g, t, hand[0], hand[1], px, py, 0.4, { count: 40, size: 0.8, seed: 5, nearK: 0 });
  coldMotes(g, W, H, t, 18, 8, 0.14);
}

// ---- SHOT 3 [20-30] low on the floor in the beam: faint amber pawprints ---------------------------
// A static camera a metre above the stone, looking along the floor. The beam rests on one print, then
// pans on to a second and a third further away: each smaller and flatter in perspective, the pool
// shrinking and flattening with them. The prints are faint dusty residue, not decals.
const PRINTS = [
  { X: -0.12, Z: 1.95, a: 0.18 }, { X: 0.14, Z: 2.75, a: -0.1 }, { X: -0.04, Z: 3.75, a: 0.12 }, { X: 0.16, Z: 4.9, a: -0.06 },
];
const PRINT_DUST = "#8c6c46", PRINT_GLOW = "#d8a874";       // amber, saturation held near 0.5
const PRINT_W = 0.3;                                      // world width of one print (pads + dust)
// one paw print (toes up): a baked density field. Pads are soft and irregular, broken up by fbm so
// some toe beans are only partly there, smudged along one direction where the paw slid as it
// lifted, with fine dust kicked out round the edges
function printSprite() {
  const pads = [[0, 0.1, 0.2, 0.15, 0, 1], [-0.205, -0.17, 0.065, 0.085, -0.35, 0.55], [-0.075, -0.255, 0.068, 0.09, -0.1, 0.95], [0.075, -0.255, 0.068, 0.09, 0.1, 0.8], [0.205, -0.17, 0.065, 0.085, 0.35, 0.4]];
  return K.texBake("f11print:v6", 128, 128, (u, v, out) => {
    const n = vfbm(u * 9, v * 9, 71, 4, 9, 9);
    const n2 = vfbm(u * 22, v * 22, 73, 3, 22, 22);
    const gr = vnoise(u * 90, v * 90, 72, 90, 90);
    let dens = 0;
    // smear: sample the pads a little up-right as well, fading (the paw dragged as it lifted)
    for (let k = 0; k < 4; k++) {
      const x = u - 0.5 - k * 0.018, y = v - 0.5 + k * 0.012, wk = [1, 0.45, 0.25, 0.12][k];
      for (const [cx, cy, rx, ry, a, keep] of pads) {
        const ca = Math.cos(a), sa = Math.sin(a);
        const lx = (x - cx) * ca + (y - cy) * sa, ly = -(x - cx) * sa + (y - cy) * ca;
        let d = Math.hypot(lx / rx, ly / ry);
        if (cy > 0) d *= 1 + 0.25 * Math.max(0, -ly / ry) * (Math.abs(lx / rx) < 0.35 ? 1 : 0.2);
        const edge = K.clamp((1.05 + n * 0.45 - d) / 0.45);
        // partial bean: only `keep` of it took the dust, decided by a coarse noise field
        const part = K.clamp((n2 * 0.9 + keep - 0.35) / 0.3);
        dens = Math.max(dens, edge * part * wk);
      }
    }
    const core = 1 - 0.25 * K.clamp(1 - Math.abs(n) * 3);    // pressed centres carry less
    const spray = Math.max(0, gr - 0.5) * 1.4 * K.clamp(1 - dens * 2) * K.clamp(0.9 - Math.hypot(u - 0.5, v - 0.5) * 2);
    const d2 = K.clamp(dens * core * (0.8 + gr * 0.3 + n * 0.35) * 1.2 + spray * 0.4);
    out[0] = 255; out[1] = 255; out[2] = 255; out[3] = 255 * d2;
  });
}
function printTinted(col) {
  return K.sprite("f11printc:" + col, 128, 128, (s) => {
    s.drawImage(printSprite(), 0, 0, 128, 128);
    s.globalCompositeOperation = "source-in";
    s.fillStyle = col; s.fillRect(0, 0, 128, 128);
  });
}
// where the beam rests over time: print 1, pan to print 2 (23-24.6), to print 3 (26.4-28), then drift on
function printAim(t) {
  const P = PRINTS;
  const k1 = K.ease.inOut(K.seg(t, 22.9, 24.6)), k2 = K.ease.inOut(K.seg(t, 26.3, 28.1)), k3 = K.ease.inOut(K.seg(t, 29.0, 30.6)) * 0.45;
  let X = P[0].X, Z = P[0].Z;
  X = K.lerp(X, P[1].X, k1); Z = K.lerp(Z, P[1].Z, k1);
  X = K.lerp(X, P[2].X, k2); Z = K.lerp(Z, P[2].Z, k2);
  X = K.lerp(X, P[3].X, k3); Z = K.lerp(Z, P[3].Z, k3);
  // the hand overshoots a touch and settles; a little tremor
  const over = Math.sin(K.clamp((t - 24.6) / 0.8) * Math.PI) * 0.06 * (t > 24.6 && t < 25.4 ? 1 : 0) + Math.sin(K.clamp((t - 28.1) / 0.8) * Math.PI) * 0.08 * (t > 28.1 && t < 28.9 ? 1 : 0);
  return [X + K.noise(t * 0.7, 31) * 0.025, Z + over + K.noise(t * 0.6, 32) * 0.035];
}
function shotPrints(g, t, W, H) {
  g.fillStyle = VOID; g.fillRect(0, 0, W, H);
  const cam = CAM3;
  const [fx, fz] = printAim(t);
  const [px, py] = cam.P(fx, fz);
  const rx = 0.42 * cam.f / fz, ry = 0.56 * cam.h * cam.f / (fz * fz);
  // the operator tilts up a little to follow the beam (2D camera: the floor stays cached)
  const tilt = (fz - PRINTS[0].Z) * 34;
  K.withCamera(g, W, H, { x: 480 + (fx - PRINTS[0].X) * 60, y: 270 - tilt * 0.5, zoom: 1.0, shakeT: t, shakeAmt: 0.5 }, () => {
    const tx = 760 + K.noise(t * 0.4, 33) * 8, ty = -170;
    grid(g, cam, { alpha: 0.1, z0: 1.2, z1: 14, x0: -6, x1: 6, fade: 3 });
    const rect = [px - rx * 1.9, Math.max(6, py - ry * 2.2), px + rx * 1.9, Math.min(540, py + ry * 3.2 + 40)];
    litFloor(g, cam, rect, [
      { x: px, y: py, rx: rx * 1.2, ry: ry * 1.25, I: 1 },
      { x: px + rx * 0.15, y: py + ry * 0.6, rx: rx * 2.0, ry: ry * 2.2, I: 0.16 },
    ], { spec: { x: px + rx * 0.08, y: py + ry * 0.85, r: rx * 0.45, long: 1.8, I: 0.16 }, gain: 0.62, cache: FL3 });
    // the prints: dusty residue that shows where the beam lights it, and a faint glow of their own
    const dust = printTinted(PRINT_DUST), lum = printTinted(PRINT_GLOW);
    PRINTS.forEach((pr, i) => {
      const [sx, sy] = cam.P(pr.X, pr.Z);
      const sw = PRINT_W * cam.f / pr.Z, flat = cam.h / pr.Z;     // true ground-plane foreshortening
      const d = Math.hypot((sx - px) / rx, (sy - py) / ry);
      const light = K.clamp(1.15 - d * 0.95);
      const rv = [20, 23.9, 27.3, 29.9][i];
      const seen = K.clamp(K.smooth(K.seg(t, rv, rv + 0.8)) * 0.6 + light);   // revealed by the beam, then a faint afterglow
      g.save();
      g.translate(sx, sy);
      g.scale(1, flat * 1.25);
      g.rotate(pr.a);
      const s2 = sw * 1.25;
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.05 * seen;
      g.drawImage(lum, -s2 * 0.9, -s2 * 0.95, s2 * 1.8, s2 * 1.8);    // soft emissive halo
      g.globalAlpha = 0.09 * seen;
      g.drawImage(lum, -s2 / 2, -s2 / 2, s2, s2);
      if (light > 0.01) {
        g.globalCompositeOperation = "source-over"; g.globalAlpha = light * 0.85;
        g.drawImage(dust, -s2 / 2, -s2 / 2, s2, s2);
        g.globalCompositeOperation = "lighter"; g.globalAlpha = light * 0.22;
        g.drawImage(lum, -s2 / 2, -s2 / 2, s2, s2);
      }
      g.restore();
      // a faint emissive core the lens can bloom a little
      K.glow(g, sx, sy - sw * 0.05 * flat, sw * 0.5, "#ffd9a8", 0.1 * seen + 0.08 * light);
    });
    // hit 20: the first print breathes in
    const hit = K.env(t, 20, 21.6, 0.1, 1.2);
    if (hit > 0) { const [sx, sy] = cam.P(PRINTS[0].X, PRINTS[0].Z); K.glow(g, sx, sy, 60, "#e0b07a", 0.14 * hit); }
    // the beam in the haze, from your torch above and behind the camera down to the pool
    cone(g, t, tx, ty, px, py, rx, ry, 1.1);
    beamMotes(g, t, tx, ty, px, py, 0.2, { count: 90, size: 1.1, seed: 9 });
  });
}

// ---- SHOT 4 [30-40] lost things drift through the beam ---------------------------------------------
// each lost thing is painted once (sprite, local origin at its centre) with real materials, then
// stamped turning slowly and lit per frame by the torch (directional shade + beam mask)
function woodPath(g, path, o = {}) {
  // one wood texture for every board, shifted per board (each new seed would generate a new texture)
  const sd = o.seed || 3;
  K.texFill(g, "wood", path, { scale: o.scale || 90, rot: o.rot || 0, tex: { seed: 3 }, ox: sd * 37, oy: sd * 53, tint: o.tint, tintAlpha: o.tintAlpha });
}
function fenceSprite() {
  return K.sprite("f11fence:v3", 340, 170, (g) => {
    g.translate(170, 85);
    const R = K.rng("fence");
    // two rails behind the pickets (weathered bare wood)
    for (const ry of [-28, 30]) {
      const p = new Path2D(); p.rect(-165, ry - 8, 330, 16);
      woodPath(g, p, { scale: 80, rot: Math.PI / 2, seed: 4, tint: "#8a7a64", tintAlpha: 0.5 });
      const sh = g.createLinearGradient(0, ry - 8, 0, ry + 8);
      sh.addColorStop(0, "rgba(255,240,220,0.12)"); sh.addColorStop(1, "rgba(0,0,0,0.45)");
      g.fillStyle = sh; g.fill(p);
    }
    // pickets: old white paint over grey wood, flaking; slightly uneven heights and leans
    for (let i = 0; i < 6; i++) {
      const w = 30, x = -150 + i * 54 + (R() - 0.5) * 4, top = -62 + (R() - 0.5) * 8, lean = (R() - 0.5) * 0.04;
      g.save();
      g.rotate(lean);
      const pk = new Path2D();
      pk.moveTo(x, 80); pk.lineTo(x, top + 14); pk.lineTo(x + w / 2, top - 4); pk.lineTo(x + w, top + 14); pk.lineTo(x + w, 80); pk.closePath();
      woodPath(g, pk, { scale: 70, rot: Math.PI / 2, seed: 7 + i });
      g.save(); g.clip(pk);
      // paint film with flaking patches
      K.texFill(g, "plaster", pk, { scale: 90, tex: { seed: 11 }, ox: i * 41, oy: i * 29, alpha: 0.6, tint: "#9a9488", tintAlpha: 0.7 });
      for (let k = 0; k < 7; k++) {
        const fx = x + R() * w, fy = top + R() * 130, fw = 2 + R() * 8, fh = 1 + R() * 4;
        g.fillStyle = "rgba(96,82,66,0.75)"; g.beginPath(); g.ellipse(fx, fy, fw, fh, R() - 0.5, 0, K.TAU); g.fill();
      }
      // cylinder-ish shading across the board + AO under the rails
      const sg = g.createLinearGradient(x, 0, x + w, 0);
      sg.addColorStop(0, "rgba(255,250,240,0.12)"); sg.addColorStop(0.5, "rgba(0,0,0,0)"); sg.addColorStop(1, "rgba(30,24,18,0.4)");
      g.fillStyle = sg; g.fillRect(x, top - 6, w, 160);
      for (const ry of [-28, 30]) { const ag = g.createLinearGradient(0, ry + 8, 0, ry + 18); ag.addColorStop(0, "rgba(0,0,0,0.35)"); ag.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = ag; g.fillRect(x, ry + 8, w, 10); }
      g.restore();
      for (const ry of [-28, 30]) { g.fillStyle = "#4a4038"; g.beginPath(); g.arc(x + w / 2, ry, 1.6, 0, K.TAU); g.fill(); g.fillStyle = "rgba(160,90,40,0.4)"; g.beginPath(); g.ellipse(x + w / 2, ry + 4, 1.4, 4, 0, 0, K.TAU); g.fill(); }
      g.restore();
    }
  });
}
function chairSprite() {
  // a wooden kitchen chair in 3/4 perspective: seat, four turned legs, spindle back; real wood grain
  return K.sprite("f11chair:v3", 200, 260, (g) => {
    g.translate(100, 140);
    const legP = (pts, w) => { const p = new Path2D(); K.tube(p, pts, [w, w * 0.92, w * 0.8]); return p; };
    const shadeTube = (p, x0, x1, dk) => {
      const sg = g.createLinearGradient(x0, 0, x1, 0);
      sg.addColorStop(0, `rgba(0,0,0,${0.5 + dk})`); sg.addColorStop(0.35, "rgba(255,230,200,0.12)"); sg.addColorStop(0.6, "rgba(0,0,0,0.05)"); sg.addColorStop(1, `rgba(0,0,0,${0.55 + dk})`);
      g.fillStyle = sg; g.fill(p);
    };
    const parts = [
      [[-50, -12, -52, 44, -54, 100], 8, 0.25], [[38, -22, 37, 32, 36, 86], 7, 0.3],
      [[-50, -12, -48, -66, -46, -122], 8, 0], [[38, -22, 40, -75, 42, -130], 8, 0.05],
    ];
    for (const [pts, w, dk] of parts) { const p = legP(pts, w); woodPath(g, p, { scale: 60, rot: Math.PI / 2, seed: 21, tint: "#6a4020", tintAlpha: 0.55 }); shadeTube(p, pts[0] - w, pts[0] + w, dk); }
    // top rail
    const rail = new Path2D();
    rail.moveTo(-50, -126); rail.quadraticCurveTo(-4, -138, 44, -136); rail.lineTo(44, -118); rail.quadraticCurveTo(-4, -121, -48, -108); rail.closePath();
    woodPath(g, rail, { scale: 70, seed: 22, tint: "#7a4a24", tintAlpha: 0.5 });
    const rg = g.createLinearGradient(0, -138, 0, -108); rg.addColorStop(0, "rgba(255,230,200,0.2)"); rg.addColorStop(1, "rgba(0,0,0,0.45)"); g.fillStyle = rg; g.fill(rail);
    for (let i = 1; i < 5; i++) { const x = -50 + i * 18; const p = legP([x, -110 - i * 0.6, x + 0.5, -66, x + 1, -22 - i * 2], 4.5); woodPath(g, p, { scale: 50, rot: Math.PI / 2, seed: 23 + i, tint: "#6a4020", tintAlpha: 0.55 }); shadeTube(p, x - 3, x + 3, 0.1); }
    // seat: top face (grain across), front and side edges darker
    const seat = new Path2D();
    seat.moveTo(-62, 6); seat.lineTo(30, -6); seat.lineTo(58, -30); seat.lineTo(-30, -20); seat.closePath();
    woodPath(g, seat, { scale: 110, rot: 0.12, seed: 24, tint: "#9a6a3a", tintAlpha: 0.45 });
    const sg = g.createLinearGradient(-60, 0, 58, -30); sg.addColorStop(0, "rgba(0,0,0,0.1)"); sg.addColorStop(1, "rgba(255,235,205,0.14)"); g.fillStyle = sg; g.fill(seat);
    const fe = new Path2D(); fe.moveTo(-62, 6); fe.lineTo(30, -6); fe.lineTo(30, 4); fe.lineTo(-62, 16); fe.closePath();
    woodPath(g, fe, { scale: 80, seed: 25, tint: "#3a2210", tintAlpha: 0.75 });
    const se = new Path2D(); se.moveTo(30, -6); se.lineTo(58, -30); se.lineTo(58, -20); se.lineTo(30, 4); se.closePath();
    woodPath(g, se, { scale: 80, seed: 26, tint: "#4a2c14", tintAlpha: 0.7 });
    // front legs + stretcher
    for (const [pts, w, dk] of [[[-58, 14, -60, 66, -62, 120], 8, 0], [[28, 2, 29, 58, 30, 112], 8, 0.2], [[-58, 70, -15, 66, 28, 62], 4, 0.25]]) {
      const p = legP(pts, w); woodPath(g, p, { scale: 60, rot: Math.PI / 2, seed: 27, tint: "#6a4020", tintAlpha: 0.55 }); shadeTube(p, pts[0] - w, pts[0] + w, dk);
    }
    K.aoEdge(g, -62, 16, 30, 4, { width: 10, alpha: 0.45, side: -1 });
  });
}
function lampSprite() {
  // a cast-iron street lamp post (off): tapered fluted pole, base collar, swan-neck arm, lantern
  return K.sprite("f11lamp:v3", 120, 300, (g) => {
    g.translate(40, 290);
    const pole = new Path2D();
    pole.moveTo(-9, 0); pole.lineTo(-4, -240); pole.lineTo(4, -240); pole.lineTo(9, 0); pole.closePath();
    K.texFill(g, "metal", pole, { scale: 60, tex: { seed: 4 }, tint: "#2a2e34", tintAlpha: 0.75 });
    const pg = g.createLinearGradient(-9, 0, 9, 0);
    pg.addColorStop(0, "rgba(0,0,0,0.65)"); pg.addColorStop(0.35, "rgba(200,210,225,0.25)"); pg.addColorStop(0.5, "rgba(0,0,0,0)"); pg.addColorStop(1, "rgba(0,0,0,0.7)");
    g.fillStyle = pg; g.fill(pole);
    // flutes + rust streaks
    g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 0.8;
    g.beginPath(); for (const fx of [-3, 0, 3]) { g.moveTo(fx * 1.6, -2); g.lineTo(fx * 0.8, -236); } g.stroke();
    g.fillStyle = "rgba(140,70,30,0.35)"; g.fillRect(-2, -150, 2, 60); g.fillRect(3, -60, 1.5, 40);
    const col = new Path2D(); col.rect(-12, -18, 24, 18); col.rect(-7, -152, 14, 9);
    K.texFill(g, "metal", col, { scale: 40, tex: { seed: 4 }, ox: 17, tint: "#1e2126", tintAlpha: 0.8 });
    g.strokeStyle = "#2e3238"; g.lineWidth = 4; g.lineCap = "round";
    g.beginPath(); g.moveTo(0, -236); g.quadraticCurveTo(10, -262, 34, -258); g.stroke();
    g.strokeStyle = "rgba(200,210,225,0.2)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-1, -238); g.quadraticCurveTo(9, -263, 33, -260); g.stroke();
    // lantern: cap, glass panes (dusty, a reflection), frame, finial
    const hx = 40, hy = -252;
    g.fillStyle = "#15171b";
    g.beginPath(); g.moveTo(hx - 18, hy); g.lineTo(hx + 18, hy); g.lineTo(hx + 8, hy - 12); g.lineTo(hx - 8, hy - 12); g.closePath(); g.fill();
    g.fillRect(hx - 2, hy - 18, 4, 7);
    const pane = new Path2D(); pane.moveTo(hx - 15, hy); pane.lineTo(hx + 15, hy); pane.lineTo(hx + 10, hy + 30); pane.lineTo(hx - 10, hy + 30); pane.closePath();
    const gg = g.createLinearGradient(hx - 14, 0, hx + 14, 0);
    gg.addColorStop(0, "rgba(90,100,110,0.45)"); gg.addColorStop(0.5, "rgba(150,160,170,0.4)"); gg.addColorStop(1, "rgba(60,66,74,0.5)");
    g.fillStyle = gg; g.fill(pane);
    K.texFill(g, "glassdrops", pane, { scale: 40, alpha: 0.25, mode: "screen" });
    g.strokeStyle = "#15171b"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx, hy + 30); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(hx - 11, hy + 3, 1.5, 22);
    g.fillStyle = "#15171b"; g.fillRect(hx - 11, hy + 30, 22, 4);
  });
}
function bookSprite() {
  // an open cloth-bound hardback, pages fanned, lines of print
  return K.sprite("f11book:v3", 120, 80, (g) => {
    g.translate(60, 44);
    const cover = new Path2D();
    cover.moveTo(-52, -18); cover.lineTo(0, -8); cover.lineTo(52, -18); cover.lineTo(54, 20); cover.lineTo(0, 30); cover.lineTo(-54, 20); cover.closePath();
    K.texFill(g, "fabric", cover, { scale: 24, tex: { seed: 9 }, ox: 13, tint: "#2e4a78", tintAlpha: 0.85 });
    for (let k = 4; k >= 0; k--) {
      for (const sd of [-1, 1]) {
        const p = new Path2D();
        p.moveTo(0, -6 + k); p.quadraticCurveTo(sd * 24, -20 + k * 1.5, sd * (48 - k), -16 + k * 1.6);
        p.lineTo(sd * (49 - k), 16 + k * 0.6); p.quadraticCurveTo(sd * 24, 12 + k, 0, 26 + k * 0.4); p.closePath();
        g.fillStyle = `rgb(${214 - k * 12},${204 - k * 12},${180 - k * 12})`; g.fill(p);
        if (!k) {
          const pg = g.createLinearGradient(0, 0, sd * 48, 0);
          pg.addColorStop(0, "rgba(60,40,20,0.4)"); pg.addColorStop(0.25, "rgba(0,0,0,0)"); pg.addColorStop(1, "rgba(80,60,30,0.15)");
          g.fillStyle = pg; g.fill(p);
          K.texFill(g, "noise", p, { scale: 30, alpha: 0.12, mode: "multiply" });
        }
      }
    }
    g.strokeStyle = "rgba(50,40,30,0.3)"; g.lineWidth = 0.9;
    for (const sd of [-1, 1]) for (let l = 0; l < 7; l++) {
      const y = -9 + l * 4.5;
      g.beginPath(); g.moveTo(sd * 8, y + 2); g.quadraticCurveTo(sd * 24, y - 3, sd * (40 - (l % 3) * 4), y - 1); g.stroke();
    }
  });
}
function mittenSprite() {
  // a child's knitted wool mitten (cranberry), stocking-stitch Vs, a ribbed cream cuff, the thumb
  // standing off the side; soft form shading and fuzzy edge fibres
  return K.sprite("f11mitt:v2", 110, 130, (g) => {
    g.translate(55, 62);
    const m = new Path2D();
    m.moveTo(-20, 30); m.bezierCurveTo(-24, 6, -26, -20, -18, -38); m.bezierCurveTo(-10, -54, 14, -54, 20, -36);
    m.bezierCurveTo(25, -18, 24, 8, 21, 30); m.closePath();
    const th = new Path2D();
    th.moveTo(-19, 4); th.bezierCurveTo(-34, -2, -42, -16, -36, -26); th.bezierCurveTo(-31, -33, -24, -26, -21, -16); th.closePath();
    const all = new Path2D(); all.addPath(th); all.addPath(m);
    g.fillStyle = "#7a1c26"; g.fill(all);
    g.save(); g.clip(all);
    // stocking stitch: rows of small Vs
    for (let r = -56; r < 34; r += 4.2) {
      for (let c = -40; c < 26; c += 4.6) {
        const o = ((r / 4.2) | 0) % 2 ? 0 : 0;
        g.fillStyle = "rgba(190,70,80,0.28)";
        g.beginPath(); g.moveTo(c + o, r); g.lineTo(c + 2.3, r + 3.6); g.lineTo(c + 1.6, r + 3.9); g.lineTo(c - 0.6, r + 0.6); g.closePath(); g.fill();
        g.fillStyle = "rgba(40,6,10,0.35)";
        g.beginPath(); g.moveTo(c + 4.6, r); g.lineTo(c + 2.3, r + 3.6); g.lineTo(c + 3, r + 3.9); g.lineTo(c + 5.2, r + 0.6); g.closePath(); g.fill();
      }
    }
    K.texFill(g, "fabric", all, { scale: 12, tex: { seed: 9 }, alpha: 0.25, mode: "overlay" });
    const sh = g.createRadialGradient(-6, -26, 4, 0, -4, 52);
    sh.addColorStop(0, "rgba(255,200,190,0.16)"); sh.addColorStop(0.55, "rgba(0,0,0,0.12)"); sh.addColorStop(1, "rgba(0,0,0,0.6)");
    g.fillStyle = sh; g.fillRect(-60, -70, 120, 130);
    g.restore();
    // AO where the thumb meets the hand
    K.aoEdge(g, -21, -16, -19, 4, { width: 6, alpha: 0.4, side: 0 });
    // ribbed cuff
    const cuff = new Path2D(); cuff.moveTo(-22, 28); cuff.lineTo(23, 28); cuff.lineTo(24, 50); cuff.quadraticCurveTo(0, 54, -23, 50); cuff.closePath();
    g.fillStyle = "#cfc4ac"; g.fill(cuff);
    g.save(); g.clip(cuff);
    for (let x = -24; x < 26; x += 3.4) {
      const rg = g.createLinearGradient(x, 0, x + 3.4, 0);
      rg.addColorStop(0, "rgba(0,0,0,0.3)"); rg.addColorStop(0.5, "rgba(255,250,235,0.18)"); rg.addColorStop(1, "rgba(0,0,0,0.3)");
      g.fillStyle = rg; g.fillRect(x, 26, 3.4, 30);
    }
    const cg = g.createLinearGradient(-24, 0, 24, 0); cg.addColorStop(0, "rgba(0,0,0,0.1)"); cg.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = cg; g.fillRect(-26, 26, 52, 30);
    g.restore();
    K.aoEdge(g, -22, 29, 23, 29, { width: 6, alpha: 0.45, side: 1 });
    // stray wool fibres on the silhouette
    const R = K.rng("mittfuzz");
    g.strokeStyle = "rgba(170,60,70,0.4)"; g.lineWidth = 0.6;
    g.beginPath();
    for (let i = 0; i < 70; i++) { const a = R() * K.TAU, rr = 24 + R() * 4; const x = Math.cos(a) * rr * 0.85, y = -10 + Math.sin(a) * rr * 1.5; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5); }
    g.stroke();
  });
}
function ballSprite() {
  // a ball of mustard wool yarn: wound strands in a few crossing directions, one loose end trailing
  return K.sprite("f11ball:v2", 90, 90, (g) => {
    g.translate(45, 45);
    const r = 30;
    const b = new Path2D(); b.arc(0, 0, r, 0, K.TAU);
    g.fillStyle = "#9a7428"; g.fill(b);
    g.save(); g.clip(b);
    const R = K.rng("yarn");
    for (let band = 0; band < 5; band++) {
      const ang = R() * Math.PI;
      g.save(); g.rotate(ang);
      for (let k = -r; k < r; k += 2.6) {
        const w = Math.sqrt(Math.max(0, r * r - k * k));
        g.strokeStyle = `rgba(${215 + R() * 30 | 0},${170 + R() * 30 | 0},${80 + R() * 20 | 0},0.55)`; g.lineWidth = 1.7;
        g.beginPath(); g.moveTo(-w, k); g.quadraticCurveTo(0, k + (k / r) * 6, w, k); g.stroke();
        g.strokeStyle = "rgba(60,36,6,0.45)"; g.lineWidth = 0.7;
        g.beginPath(); g.moveTo(-w, k + 1.3); g.quadraticCurveTo(0, k + 1.3 + (k / r) * 6, w, k + 1.3); g.stroke();
      }
      g.restore();
    }
    const sh = g.createRadialGradient(-9, -11, 3, 0, 0, r + 2);
    sh.addColorStop(0, "rgba(255,240,200,0.2)"); sh.addColorStop(0.55, "rgba(0,0,0,0.08)"); sh.addColorStop(1, "rgba(0,0,0,0.7)");
    g.fillStyle = sh; g.fill(b);
    g.restore();
    // the loose end
    g.strokeStyle = "#b58a34"; g.lineWidth = 1.8; g.lineCap = "round";
    g.beginPath(); g.moveTo(r * 0.7, r * 0.6); g.bezierCurveTo(r * 1.1, r * 0.9, r * 0.9, r * 1.3, r * 1.4, r * 1.35); g.stroke();
    g.strokeStyle = "rgba(255,230,170,0.3)"; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(r * 0.7, r * 0.58); g.bezierCurveTo(r * 1.1, r * 0.88, r * 0.9, r * 1.28, r * 1.4, r * 1.33); g.stroke();
  });
}
// z-ordered: blur = defocus px (fence is foreground, lamp is far and hazy, the book drifts past the
// lens); haze = how far toward the void colour the far thing sinks
const THINGS = [
  { k: "lamp", w: 120, h: 300, x0: 1120, x1: -150, t0: 33.8, t1: 41.5, y: 150, bob: 10, r0: 1.25, rv: 0.03, blur: 1.6, sc: 0.5, haze: 0.45 },
  { k: "chair", w: 200, h: 260, x0: -180, x1: 1080, t0: 31.0, t1: 41.0, y: 300, bob: 20, r0: 0.35, rv: -0.04, blur: 0 },
  { k: "mitt", w: 110, h: 130, x0: -90, x1: 1040, t0: 29.6, t1: 40.6, y: 150, bob: 16, r0: 0.25, rv: 0.12, blur: 0, sc: 0.85 },
  { k: "ball", w: 90, h: 90, x0: 180, x1: 900, t0: 30.4, t1: 41, y: 270, bob: 16, r0: 0, rv: 0.22, blur: 0, sc: 0.8 },
  { k: "fence", w: 340, h: 170, x0: 1260, x1: -420, t0: 29.4, t1: 40.6, y: 236, bob: 16, r0: -0.12, rv: 0.025, blur: 2.8, sc: 1.5 },
  { k: "book", w: 120, h: 80, x0: -260, x1: 1060, t0: 32.0, t1: 40.4, y: 420, bob: 18, r0: 0.3, rv: 0.12, blur: 7, sc: 2.6 },
];
const SPR = { fence: fenceSprite, chair: chairSprite, lamp: lampSprite, book: bookSprite, mitt: mittenSprite, ball: ballSprite };
function thingXf(it, i, t) {
  const x = K.lerp(it.x0, it.x1, K.seg(t, it.t0, it.t1)), y = it.y + Math.sin(t * 0.45 + i) * it.bob;
  const sc = it.sc || 1;
  return { x, y, w: it.w * sc, h: it.h * sc, rot: it.r0 + (t - it.t0) * it.rv };
}
function stampSprite(c, it, X) {
  c.save();
  c.translate(X.x, X.y);
  c.rotate(X.rot);
  c.drawImage(SPR[it.k](), -X.w / 2, -X.h / 2, X.w, X.h);
  c.restore();
}
function stampThing(c, it, i, t, tx, ty) {
  const X = thingXf(it, i, t);
  if (X.x < -X.w || X.x > 960 + X.w) return;
  stampSprite(c, it, X);
  // the side away from the torch falls into a dark core (form shadow), the lit side warms
  const dx = tx - X.x, dy = ty - X.y, dl = Math.hypot(dx, dy) || 1, r = Math.max(X.w, X.h) * 0.6;
  c.save();
  c.globalCompositeOperation = "source-atop";
  const sg = c.createLinearGradient(X.x - dx / dl * r, X.y - dy / dl * r, X.x + dx / dl * r * 0.5, X.y + dy / dl * r * 0.5);
  sg.addColorStop(0, "rgba(3,2,6,0.95)"); sg.addColorStop(0.4, "rgba(3,2,6,0.78)"); sg.addColorStop(0.7, "rgba(3,2,6,0.25)"); sg.addColorStop(0.88, "rgba(255,220,160,0)"); sg.addColorStop(1, "rgba(255,226,170,0.16)");
  c.fillStyle = sg;
  c.beginPath(); c.arc(X.x, X.y, r * 1.1, 0, K.TAU); c.fill();
  if (it.haze) { c.fillStyle = K.rgba("#0b0a0c", it.haze); c.fillRect(X.x - r * 1.2, X.y - r * 1.2, r * 2.4, r * 2.4); }
  c.restore();
}
function shotDrift(g, t, W, H) {
  g.fillStyle = VOID; g.fillRect(0, 0, W, H);
  const p = K.ease.inOut(K.seg(t, 30, 40.4));
  const tx = 1000 + K.noise(t * 0.5, 41) * 6, ty = 560 + K.noise(t * 0.4, 42) * 6;
  const ang = -2.62 + Math.sin(t * 0.35) * 0.06 + p * 0.06, sp = 0.36, len = 1250;
  const ex = tx + Math.cos(ang) * len, ey = ty + Math.sin(ang) * len;
  // the light the beam throws: a cone falloff in screen space (reflector profile across, inverse
  // square along), plus almost nothing outside it: objects there are near black
  const beamMask = (m) => {
    m.fillStyle = "rgba(255,255,255,0.035)"; m.fillRect(0, 0, W, H);
    m.globalCompositeOperation = "lighter";
    wedge(m, tx, ty, ang, len * 1.9, sp * 0.62, 1);
    wedge(m, tx, ty, ang, len * 1.5, sp * 0.45, 0.9);
    wedge(m, tx, ty, ang, len * 1.2, sp * 0.3, 0.6);
    m.globalCompositeOperation = "source-over";
  };
  const sw = K.env(t, 35.6, 39, 0.8, 2);                   // swell 36: the beam brightens a breath
  // the cone in the air (warm, hazy), with the things' shadows cut through it as dark streaks
  const Lb = K.layer(240, 135, "f11cone");
  Lb.g.scale(0.25, 0.25);
  Lb.g.globalCompositeOperation = "lighter";
  wedge(Lb.g, tx, ty, ang, len * 1.4, sp, 1);
  wedge(Lb.g, tx, ty, ang, len, sp * 0.45, 0.8);
  Lb.g.globalCompositeOperation = "source-in";
  Lb.g.fillStyle = TORCH; Lb.g.fillRect(0, 0, W, H);
  Lb.g.globalCompositeOperation = "destination-out";
  THINGS.forEach((it, i) => {
    if (it.k === "book") return;
    const X = thingXf(it, i, t);
    // the shadow volume: the silhouette scaled away from the torch, fading with distance
    for (const [k, a] of [[1.06, 0.3], [1.16, 0.24], [1.3, 0.18], [1.5, 0.12], [1.78, 0.08]]) {
      Lb.g.save();
      Lb.g.globalAlpha = a * (it.haze ? 0.5 : 1);
      Lb.g.translate(tx, ty); Lb.g.scale(k, k); Lb.g.translate(-tx, -ty);
      stampSprite(Lb.g, it, X);
      Lb.g.restore();
    }
  });
  Lb.g.globalCompositeOperation = "source-over";
  haze(Lb.g, t, 0.5);
  g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.26 + 0.08 * sw; g.imageSmoothingEnabled = true;
  g.drawImage(Lb.canvas, 0, 0, Lb.canvas.width, Lb.canvas.height, 0, 0, W, H);
  g.restore();
  // the far lamp post: behind focus and hazy
  const soft = (it, i) => {
    const L = K.blurLayer(W, H, "f11soft" + it.k, it.blur, (c) => stampThing(c, it, i, t, tx, ty));
    applyMask(L, W, H, beamMask, it.k !== "lamp");
    K.dof(g, L.canvas, it.blur, it.k === "book" ? 0.9 : it.k === "lamp" ? 0.75 : 1);
  };
  THINGS.forEach((it, i) => { if (it.k === "lamp") soft(it, i); });
  // in-focus things, lit only where the beam touches them, with a thin rim on the torch side
  const sharp = (c) => THINGS.forEach((it, i) => { if (!it.blur) stampThing(c, it, i, t, tx, ty); });
  lit(g, W, H, "f11things", sharp, beamMask, 1, "source-over", true);
  {
    const R = K.layer(W / 2, H / 2, "f11rim");
    const r = R.g;
    r.scale(0.5, 0.5);
    sharp(r);
    r.setTransform(1, 0, 0, 1, 0, 0);
    r.globalCompositeOperation = "source-in";
    r.fillStyle = "#ffdcae"; r.fillRect(0, 0, R.canvas.width, R.canvas.height);
    // keep only the edge facing the torch: cut away the silhouette shifted away from the light
    const dx = Math.cos(ang) * 1.6 * K.pixelScale(), dy = Math.sin(ang) * 1.6 * K.pixelScale();
    r.globalCompositeOperation = "destination-out";
    r.drawImage(R.canvas, dx, dy);
    // fade the rim off with the broad beam falloff
    r.globalCompositeOperation = "destination-in";
    const M = K.layer(W / 4, H / 4, "f11rimmask"); M.g.scale(0.25, 0.25);
    M.g.globalCompositeOperation = "lighter";
    wedge(M.g, tx, ty, ang, len * 2.2, sp * 1.1, 1); wedge(M.g, tx, ty, ang, len * 1.6, sp * 0.7, 0.8);
    r.drawImage(M.canvas, 0, 0, R.canvas.width, R.canvas.height);
    g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.55; g.imageSmoothingEnabled = true;
    g.drawImage(R.canvas, 0, 0, W, H);
    g.restore();
  }
  beamMotes(g, t, tx, ty, ex, ey, sp * 0.9, { count: 140, size: 1.3, seed: 12 });
  // foreground: the fence close to the lens (2-3 px soft), then the book right past it
  THINGS.forEach((it, i) => { if (it.k === "fence" || it.k === "book") soft(it, i); });
  coldMotes(g, W, H, t, 30, 13, 0.22);
  K.glow(g, tx, ty, 140, TORCH, 0.45);
  K.glow(g, tx, ty, 36, HOT, 0.5);
}

// ---- SHOT 5 [40-50] eyes in the dark; a black cat steps into the beam and sniffs your boot ---------
// your legs from the knee down: indigo denim tucked into red rubber boots, seen in profile, toes to
// the left. The torch is above you pointing down-left at the floor, so the legs get almost no direct
// light: the warm bounce off the pool lights the toe side and the soles, the far side falls to black.
// Painted once (cached); drawn very slightly out of focus as the foreground.
const BOOT_H = 210;
// denim: a 3/1 twill (fine diagonal wale), uneven warp slubs, a few pale weft flecks
function denimTex() {
  return K.texBake("f11denim:v2", 96, 96, (u, v, out) => {
    const tw = 0.5 + 0.5 * Math.sin((u + v) * K.TAU * 24);
    const slub = vfbm(u * 2, v * 24, 91, 3, 2, 24);
    const fleck = vnoise(u * 96, v * 96, 92, 96, 96) > 0.7 ? 1 : 0;
    const k = 0.8 + tw * 0.2 + slub * 0.06;
    out[0] = K.clamp(26 * k + fleck * 26, 0, 255); out[1] = K.clamp(37 * k + fleck * 30, 0, 255); out[2] = K.clamp(66 * k + fleck * 34, 0, 255); out[3] = 255;
  });
}
// dried mud and scuffs (alpha map, tileable)
function mudTex() {
  return K.texBake("f11mud:v2", 128, 128, (u, v, out) => {
    const f = vfbm(u * 4, v * 4, 81, 5, 4, 4);
    const sp = vnoise(u * 40, v * 40, 82, 40, 40);
    const a = K.clamp((f + 0.08) * 2.4) * (0.55 + 0.45 * sp);
    out[0] = 46; out[1] = 32; out[2] = 22; out[3] = 255 * K.clamp(a);
  });
}
function bootsSprite() {
  return K.sprite("f11boots:v5", 420, 720, (g0) => {
    g0.translate(200, 700);
    const h = BOOT_H, ps = K.pixelScale();
    const R = K.rng("boots");
    for (const [ox, oy, back] of [[h * 0.5, -10, true], [-h * 0.1, 0, false]]) {
      const bx = ox, by = oy;
      // the far leg is painted on its own and laid in ~40% darker (it stands outside the pool)
      let g = g0, off = null;
      if (back) { off = K.makeCanvas(Math.ceil(420 * ps), Math.ceil(720 * ps)); g = off.getContext("2d"); g.setTransform(ps, 0, 0, ps, 0, 0); g.translate(200, 700); }
      const denim = g.createPattern(denimTex(), "repeat");
      const mud = g.createPattern(mudTex(), "repeat");
      // ---- jeans, tucked into the boot and bunched (blousing) over its rim
      const jeans = new Path2D();
      jeans.moveTo(bx - h * 0.2, by - h * 3.2); jeans.lineTo(bx + h * 0.16, by - h * 3.2);
      jeans.bezierCurveTo(bx + h * 0.2, by - h * 2.2, bx + h * 0.25, by - h * 1.5, bx + h * 0.26, by - h * 1.06);
      jeans.lineTo(bx + h * 0.27, by - h * 0.94); jeans.lineTo(bx - h * 0.27, by - h * 0.94);
      jeans.bezierCurveTo(bx - h * 0.28, by - h * 1.6, bx - h * 0.24, by - h * 2.3, bx - h * 0.2, by - h * 3.2);
      jeans.closePath();
      if (denim.setTransform) denim.setTransform(new DOMMatrix([0.55, 0, 0, 0.55, bx, 0]));
      g.fillStyle = denim; g.fill(jeans);
      g.save(); g.clip(jeans);
      // round leg: the bounce-lit toe side, falling off to the shadow side away from the light
      const jg = g.createLinearGradient(bx - h * 0.28, 0, bx + h * 0.27, 0);
      jg.addColorStop(0, "rgba(140,160,210,0.1)"); jg.addColorStop(0.18, "rgba(0,0,0,0.25)"); jg.addColorStop(0.55, "rgba(0,0,0,0.6)"); jg.addColorStop(1, "rgba(0,0,0,0.9)");
      g.fillStyle = jg; g.fillRect(bx - h * 0.3, by - h * 3.3, h * 0.6, h * 2.4);
      // outseam: double row of faded tan stitching
      g.strokeStyle = "rgba(160,115,60,0.22)"; g.lineWidth = 0.9; g.setLineDash([2.2, 1.6]);
      for (const sx of [0.03, 0.055]) { g.beginPath(); g.moveTo(bx + h * sx, by - h * 3.2); g.bezierCurveTo(bx + h * (sx + 0.02), by - h * 2.2, bx + h * (sx + 0.03), by - h * 1.6, bx + h * (sx + 0.035), by - h * 1.0); g.stroke(); }
      g.setLineDash([]);
      // stacked folds where the denim bunches on the boot rim: shadowed undersides, bounce-lit lips
      g.lineCap = "round";
      const FOLD = [[0.99, 5, 0.27], [1.05, -7, 0.17], [1.12, 6, 0.25], [1.2, -3, 0.02], [1.31, 4, 0.16]];
      for (const [fy, sk, end] of FOLD) {
        const y = by - h * fy;
        g.filter = "blur(1.6px)";
        g.strokeStyle = "rgba(0,0,0,0.55)"; g.lineWidth = 4.5 + Math.abs(sk) * 0.3;
        g.beginPath(); g.moveTo(bx - h * 0.28, y + sk * 0.6); g.bezierCurveTo(bx - h * 0.1, y - sk, bx + h * 0.05, y + sk * 0.5, bx + h * end, y - 2); g.stroke();
        g.filter = "blur(1px)";
        g.strokeStyle = "rgba(150,170,220,0.09)"; g.lineWidth = 2.4;
        g.beginPath(); g.moveTo(bx - h * 0.28, y + sk * 0.6 + 5); g.bezierCurveTo(bx - h * 0.1, y - sk + 5, bx + h * 0.02, y + sk * 0.5 + 5, bx + h * (end - 0.05), y + 3); g.stroke();
      }
      g.filter = "none";
      // the torch points down at the floor, not at you: light falls off up the leg
      const vg = g.createLinearGradient(0, by - h * 3.2, 0, by - h);
      vg.addColorStop(0, "rgba(0,0,0,0.95)"); vg.addColorStop(0.55, "rgba(0,0,0,0.6)"); vg.addColorStop(1, "rgba(0,0,0,0.12)");
      g.fillStyle = vg; g.fillRect(bx - h * 0.4, by - h * 3.3, h * 0.8, h * 2.4);
      g.restore();
      // ---- the boot: shaft, heel, instep, toe
      const sh = new Path2D();
      sh.moveTo(bx - h * 0.225, by - h);
      sh.lineTo(bx + h * 0.225, by - h);
      sh.bezierCurveTo(bx + h * 0.24, by - h * 0.6, bx + h * 0.23, by - h * 0.3, bx + h * 0.22, by - h * 0.12);
      sh.lineTo(bx + h * 0.23, by - h * 0.05);
      sh.lineTo(bx - h * 0.3, by - h * 0.05);
      sh.bezierCurveTo(bx - h * 0.46, by - h * 0.05, bx - h * 0.56, by - h * 0.06, bx - h * 0.55, by - h * 0.13);
      sh.bezierCurveTo(bx - h * 0.53, by - h * 0.25, bx - h * 0.36, by - h * 0.27, bx - h * 0.22, by - h * 0.37);
      sh.closePath();
      g.fillStyle = "#4a100b"; g.fill(sh);
      g.save(); g.clip(sh);
      // fine rubber grain
      K.texFill(g, "relief", sh, { scale: 50, tex: { seed: 13 }, alpha: 0.06, mode: "overlay" });
      // the shaft is a cylinder: a broad, dull sheen (rubber is not glossy), edges rolling into shadow
      const cyl = g.createLinearGradient(bx - h * 0.23, 0, bx + h * 0.23, 0);
      cyl.addColorStop(0, "rgba(0,0,0,0.4)"); cyl.addColorStop(0.1, "rgba(255,150,120,0.06)");
      cyl.addColorStop(0.28, "rgba(255,212,192,0.09)"); cyl.addColorStop(0.42, "rgba(255,212,192,0.02)");
      cyl.addColorStop(0.6, "rgba(0,0,0,0.45)"); cyl.addColorStop(0.88, "rgba(0,0,0,0.8)"); cyl.addColorStop(1, "rgba(30,8,6,0.65)");
      g.fillStyle = cyl; g.fillRect(bx - h * 0.25, by - h, h * 0.5, h * 0.72);
      // the foot: a rounded toe box, highlight broad on its upper face
      const tg = g.createRadialGradient(bx - h * 0.37, by - h * 0.22, 0, bx - h * 0.37, by - h * 0.2, h * 0.24);
      tg.addColorStop(0, "rgba(255,206,186,0.17)"); tg.addColorStop(0.6, "rgba(255,190,170,0.04)"); tg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = tg; g.fillRect(bx - h * 0.62, by - h * 0.5, h * 0.5, h * 0.5);
      const fs = g.createLinearGradient(bx - h * 0.56, 0, bx + h * 0.23, 0);
      fs.addColorStop(0, "rgba(0,0,0,0.05)"); fs.addColorStop(0.55, "rgba(0,0,0,0)"); fs.addColorStop(1, "rgba(0,0,0,0.5)");
      g.fillStyle = fs; g.fillRect(bx - h * 0.6, by - h * 0.3, h * 0.85, h * 0.3);
      // warm bounce from the lit floor onto the lower boot
      const bb = g.createLinearGradient(0, by - h * 0.04, 0, by - h * 0.2);
      bb.addColorStop(0, "rgba(255,176,120,0.16)"); bb.addColorStop(1, "rgba(255,176,120,0)");
      g.fillStyle = bb; g.fillRect(bx - h * 0.6, by - h * 0.2, h * 0.85, h * 0.2);
      // the top of the shaft is further from the bounce: darker
      const tb = g.createLinearGradient(0, by - h, 0, by - h * 0.45); tb.addColorStop(0, "rgba(0,0,0,0.7)"); tb.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = tb; g.fillRect(bx - h * 0.25, by - h, h * 0.5, h * 0.45);
      // toe crease: where the boot flexes over the instep (dark valleys, soft lit ridges)
      g.lineCap = "round";
      for (let k = 0; k < 2; k++) {
        const x0 = bx - h * (0.31 - k * 0.04), y0 = by - h * (0.3 - k * 0.012), x1 = bx - h * (0.2 - k * 0.03), y1 = by - h * (0.11 + k * 0.01);
        g.filter = "blur(1.2px)";
        g.strokeStyle = "rgba(10,0,0,0.32)"; g.lineWidth = 3.4;
        g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + h * 0.04, (y0 + y1) / 2 - 2, x1, y1); g.stroke();
        g.strokeStyle = "rgba(255,190,170,0.07)"; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x0 - 3, y0 + 1); g.quadraticCurveTo(x0 + h * 0.04 - 3, (y0 + y1) / 2 - 1, x1 - 3, y1 + 1); g.stroke();
      }
      g.filter = "none";
      // dried mud and dust low on the boot, thinning upward; light scuffs
      if (mud.setTransform) mud.setTransform(new DOMMatrix([0.9, 0, 0, 0.9, bx * 0.7, by]));
      g.fillStyle = mud;
      g.globalAlpha = 0.75; g.fillRect(bx - h * 0.6, by - h * 0.16, h * 0.9, h * 0.16);
      g.globalAlpha = 0.35; g.fillRect(bx - h * 0.6, by - h * 0.3, h * 0.9, h * 0.14);
      g.globalAlpha = 0.12; g.fillRect(bx - h * 0.3, by - h * 0.6, h * 0.6, h * 0.3);
      g.globalAlpha = 1;
      g.strokeStyle = "rgba(200,160,140,0.12)"; g.lineWidth = 0.8;
      g.beginPath();
      for (let k = 0; k < 14; k++) { const x = bx - h * 0.5 + R() * h * 0.7, y = by - h * (0.08 + R() * 0.5), l = 3 + R() * 9, a = (R() - 0.5) * 0.6; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); }
      g.stroke();
      // rolled rim at the top of the shaft
      const rim = g.createLinearGradient(0, by - h, 0, by - h * 0.94);
      rim.addColorStop(0, "rgba(255,190,170,0.16)"); rim.addColorStop(0.45, "rgba(0,0,0,0.0)"); rim.addColorStop(0.7, "rgba(0,0,0,0.45)"); rim.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = rim; g.fillRect(bx - h * 0.25, by - h, h * 0.5, h * 0.06);
      g.restore();
      // ---- sole: a real thickness, a lit bevel along its top edge, toe spring, tread at the bottom
      const sole = new Path2D();
      sole.moveTo(bx + h * 0.235, by - h * 0.06);
      sole.lineTo(bx - h * 0.3, by - h * 0.06);
      sole.bezierCurveTo(bx - h * 0.47, by - h * 0.06, bx - h * 0.575, by - h * 0.07, bx - h * 0.57, by - h * 0.12);
      sole.bezierCurveTo(bx - h * 0.58, by - h * 0.04, bx - h * 0.52, by, bx - h * 0.42, by);
      sole.lineTo(bx + h * 0.24, by);
      sole.closePath();
      g.fillStyle = "#1c1311"; g.fill(sole);
      g.save(); g.clip(sole);
      const sg = g.createLinearGradient(0, by - h * 0.06, 0, by);
      sg.addColorStop(0, "rgba(255,200,170,0.1)"); sg.addColorStop(0.5, "rgba(0,0,0,0)"); sg.addColorStop(1, "rgba(255,170,120,0.08)");
      g.fillStyle = sg; g.fillRect(bx - h * 0.6, by - h * 0.07, h * 0.9, h * 0.08);
      g.fillStyle = mud; g.globalAlpha = 0.6; g.fillRect(bx - h * 0.6, by - h * 0.07, h * 0.9, h * 0.08); g.globalAlpha = 1;
      g.fillStyle = "rgba(0,0,0,0.6)"; for (let k = 0; k < 11; k++) g.fillRect(bx - h * 0.44 + k * h * 0.062, by - 3.2, 3.2, 3.2);
      g.restore();
      g.filter = "blur(0.7px)";
      g.strokeStyle = "rgba(255,205,180,0.24)"; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(bx + h * 0.23, by - h * 0.058); g.lineTo(bx - h * 0.3, by - h * 0.058); g.bezierCurveTo(bx - h * 0.47, by - h * 0.058, bx - h * 0.57, by - h * 0.068, bx - h * 0.566, by - h * 0.118); g.stroke();
      g.filter = "none";
      // warm rim from the bright floor on the left: along the toe and the front of the shaft
      // (a thin warm line along the toe cap and the front of the shaft, clipped inside the boot)
      g.save(); g.clip(sh);
      g.filter = "blur(1.2px)";
      const rl = g.createLinearGradient(bx - h * 0.56, 0, bx - h * 0.1, 0);
      rl.addColorStop(0, "rgba(255,196,140,0.38)"); rl.addColorStop(1, "rgba(255,196,140,0)");
      g.strokeStyle = rl; g.lineWidth = 3;
      g.beginPath(); g.moveTo(bx - h * 0.3, by - h * 0.055); g.bezierCurveTo(bx - h * 0.46, by - h * 0.05, bx - h * 0.56, by - h * 0.06, bx - h * 0.55, by - h * 0.13);
      g.bezierCurveTo(bx - h * 0.53, by - h * 0.25, bx - h * 0.36, by - h * 0.27, bx - h * 0.22, by - h * 0.37); g.lineTo(bx - h * 0.225, by - h); g.stroke();
      g.filter = "none";
      g.restore();
      if (back) {
        g0.save(); g0.setTransform(1, 0, 0, 1, 0, 0); g0.filter = "brightness(0.58)"; g0.drawImage(off, 0, 0); g0.filter = "none"; g0.restore();
      }
    }
  });
}
function boots(g, x, y) {
  const { soft, refl } = bootsArt();
  // contact: a tight occlusion strip where each sole meets the stone, a softer shadow round it
  K.shadowBlob(g, x - BOOT_H * 0.16, y + 1, BOOT_H * 0.45, BOOT_H * 0.025, { alpha: 0.9, soft: 0.6 });
  K.shadowBlob(g, x + BOOT_H * 0.34, y - 9, BOOT_H * 0.42, BOOT_H * 0.022, { alpha: 0.75, soft: 0.6 });
  K.aoEdge(g, x - BOOT_H * 0.69, y + 0.5, x + BOOT_H * 0.14, y + 0.5, { width: 7, alpha: 0.7, side: -1 });
  g.save(); g.globalAlpha = 0.14; g.drawImage(refl, x - 200, y + 2, 420, 140); g.restore();
  g.drawImage(soft, x - 200, y - 700, 420, 720);
}
// the boots a touch out of focus (foreground), and their soft mirror image in the polished floor
function bootsArt() {
  const spr = bootsSprite();
  const soft = K.sprite("f11bootsSoft:v6", 420, 720, (s) => { s.filter = "blur(0.9px) brightness(0.74) saturate(0.85)"; s.drawImage(spr, 0, 0, 420, 720); s.filter = "none"; });
  const refl = K.sprite("f11bootsRefl:v5", 420, 140, (s) => { s.save(); s.filter = "blur(3px) brightness(0.55)"; s.translate(0, 140); s.scale(1, -1); s.drawImage(spr, 0, 0, 420, 720, 0, -560, 420, 720); s.filter = "none"; s.restore();
    s.globalCompositeOperation = "destination-in"; const fg = s.createLinearGradient(0, 0, 0, 140); fg.addColorStop(0, "rgba(0,0,0,1)"); fg.addColorStop(1, "rgba(0,0,0,0)"); s.fillStyle = fg; s.fillRect(0, 0, 420, 140); });
  return { soft, refl };
}
// the black cat, fully drawn by the kit (fur, form shading, rim, cast shadow) once per gait phase /
// sniff step and cached. Lit like a real black cat under a torch: almost no diffuse, a strong warm
// rim along the back and ears from the beam behind it, a cool blue-black anisotropic sheen band down
// the flank, glinting whiskers.
const CAT_S = 92, CAT_PH = 12, SNIFF_N = 4;
const BLACK = Object.assign({}, K.COATS.black, { light: "#5a5158", whisker: "#fff6ea", sheen: 2.0 });
// the kit's tail for this cat's stand / walk poses, replicated so a fuller tail can be laid over it
// (same centre line, same sway): a thick, tapering, furry tail instead of a thin one
const TAILP = { rest: [[-10, 8], [-6, 14], [-2, 15], [4, 10], [6, -4]], carry: [[-13, 3], [-13, 4], [-12, 2], [-10, -2], [-6, -6]], up: [[-6, -14], [-1, -18], [2, -17], [8, -9], [9, -1]] };
function catTail(o) {
  const t = o.t || 0, p = o.phase || 0, walk = o.pose === "walk";
  const bob = walk ? -1.1 * Math.cos(p * K.TAU * 2) : 0;
  const sway = o.tail == null ? 0.5 : o.tail, up = K.clamp(o.tailUp || 0);
  let x = -44, y = -57 + bob * 0.6, ang = 0;
  const pts = [x, y];
  for (let i = 0; i < 5; i++) {
    const r = up < 0.5 ? TAILP.rest[i] : TAILP.carry[i], u = up < 0.5 ? TAILP.carry[i] : TAILP.up[i];
    const k = up < 0.5 ? up * 2 : (up - 0.5) * 2;
    let dx = K.lerp(r[0], u[0], k), dy = K.lerp(r[1], u[1], k);
    ang += Math.sin(t * 1.4 - i * 0.7) * 0.12 * sway + Math.sin(t * 0.53 - i * 0.9 + 1.3) * 0.05 * sway + (walk ? Math.sin(p * K.TAU * 2 - i * 0.9) * 0.12 * 0.5 : 0);
    const c = Math.cos(ang), s = Math.sin(ang);
    [dx, dy] = [dx * c - dy * s, dx * s + dy * c];
    x += dx; y += dy;
    pts.push(x, y);
  }
  return pts;
}
function furTail(c, ax, ay, S, o) {
  const pts = catTail(o);
  c.save();
  c.translate(ax, ay);
  c.scale(S, S);
  const path = new Path2D();
  const res = K.tube(path, pts, [11, 11.5, 10.5, 9, 6.5], 5, false, true);
  c.fillStyle = "#0b0a0d"; c.fill(path);
  // guard hairs standing off the outline, warm where the rim light from behind-above catches them
  const R = K.rng("ftail" + (o.phase || 0) + (o.pose || ""));
  const n = res.L.length;
  c.lineCap = "round";
  for (const side of [res.L, res.R]) {
    for (let i = Math.floor(n * 0.12); i < n; i++) {
      const q = side[i];
      const nx = (q[0] - res.S[i][0]) / (q[4] || 1), ny = (q[1] - res.S[i][1]) / (q[4] || 1);
      for (let h = 0; h < 2; h++) {
        const l = 1.0 + R() * 2.4, bx = q[0] - nx * (0.8 + R()), by = q[1] - ny * (0.8 + R());
        const ex = bx + nx * l + q[2] * l * 0.6, ey = by + ny * l + q[3] * l * 0.6;
        const lit = K.clamp(-ny * 0.8 - nx * 0.4);
        c.strokeStyle = lit > 0.3 && R() < 0.7 ? `rgba(255,200,140,${(0.08 + lit * 0.28).toFixed(3)})` : "rgba(22,20,27,0.8)";
        c.lineWidth = 0.55 + R() * 0.3;
        c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo((bx + ex) / 2 + q[2] * 0.6, (by + ey) / 2 + q[3] * 0.6, ex, ey); c.stroke();
      }
    }
  }
  // cool sheen down its length, warm rim along the top
  const b = [Math.min(...pts.filter((_, i) => !(i % 2))) - 8, Math.min(...pts.filter((_, i) => i % 2)) - 8, Math.max(...pts.filter((_, i) => !(i % 2))) + 8, Math.max(...pts.filter((_, i) => i % 2)) + 8];
  c.save(); c.clip(path);
  const rimG = c.createLinearGradient(b[0], b[1], b[0] + 12, b[1] + 22);
  rimG.addColorStop(0, "rgba(255,207,150,0.5)"); rimG.addColorStop(1, "rgba(255,207,150,0.06)");
  c.globalCompositeOperation = "lighter"; c.strokeStyle = rimG; c.lineWidth = 1.6; c.stroke(path); c.globalCompositeOperation = "source-over";
  c.filter = `blur(${K.qblur((S * 1.2).toFixed(1))}px)`;
  c.strokeStyle = "rgba(150,168,215,0.16)"; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(pts[2] - 1, pts[3] - 2.5); for (let i = 4; i < pts.length; i += 2) c.lineTo(pts[i] - 1, pts[i + 1] - 2.5); c.stroke();
  c.filter = "none";
  c.restore();
  c.restore();
}
function catSprite(kind, i) {
  const w = CAT_S * 3.6, h = CAT_S * 2.4, ax = w / 2, ay = h - CAT_S * 0.35;
  return K.sprite("f11bc5:" + kind + i, w, h, (c) => {
    const base = { facing: 1, t: 46 + i * 0.37, autoBlink: false, blink: 0, coat: BLACK, collar: false,
      key: { x: ax + 330, y: ay - 520, color: TORCH, strength: 1.05 }, rim: { x: ax - 260, y: ay - 330, color: "#ffcf96", strength: 1.7 },
      backlit: 0.65, fill: "#06080e", ambient: "#101420", ambientK: 0.08, pupil: 1, castShadow: 0.75, shadow: true, ground: "#000000" };
    let oc;
    if (kind === "w") K.drawCat(c, ax, ay, CAT_S, oc = Object.assign(base, { pose: "walk", phase: i / CAT_PH, headTurn: 0.12, eyesGlow: 0.5, tail: 0.55, tailUp: 0.62 }));
    else {
      // sniff steps: the head dips toward the toe, the nose twitches (tiny turn / tilt alternation)
      const dip = [0.0, 0.35, 0.55, 0.62][i], tw = [0, 0.04, -0.03, 0.05][i];
      K.drawCat(c, ax, ay, CAT_S, oc = Object.assign(base, { pose: "stand", headTilt: -0.15 - dip * 0.6 + tw, headTurn: 0.04 + tw, eyesGlow: 0.35, tailUp: 0.7, ears: 0.35, mouth: i === 3 ? 0.06 : 0 }));
    }
    // anisotropic sheen: glossy black fur reflects the torch as a soft band along the flank and
    // shoulder, cool from the sky-less void (blue-black), not as a round blob
    const S = CAT_S / 60;
    // a black cat is BLACK: pull the kit's grey-blue body down; the rim and sheen carry the form
    c.save(); c.globalCompositeOperation = "source-atop"; c.fillStyle = "rgba(2,2,4,0.3)"; c.fillRect(0, 0, w, ay - 3); c.restore();
    furTail(c, ax, ay, S, oc);
    c.save();
    c.globalCompositeOperation = "source-atop";
    // the underside faces the dark floor beyond the pool: belly and legs sink toward black, so the
    // rim reads along the back and ears only
    const ug = c.createLinearGradient(0, ay - 48 * S, 0, ay);
    ug.addColorStop(0, "rgba(0,0,0,0)"); ug.addColorStop(0.5, "rgba(0,0,0,0.35)"); ug.addColorStop(1, "rgba(0,0,0,0.6)");
    c.fillStyle = ug; c.fillRect(0, ay - 48 * S, w, 48 * S - 3);
    c.filter = `blur(${K.qblur((S * 2.2).toFixed(1))}px)`;
    c.fillStyle = "rgba(150,168,215,0.24)";
    c.beginPath(); c.ellipse(ax - 2 * S, ay - 55 * S, 33 * S, 3.4 * S, -0.02, 0, K.TAU); c.fill();
    c.fillStyle = "rgba(170,185,225,0.14)";
    c.beginPath(); c.ellipse(ax + 30 * S, ay - 60 * S, 9 * S, 3 * S, -0.5, 0, K.TAU); c.fill();
    c.beginPath(); c.ellipse(ax - 30 * S, ay - 53 * S, 8 * S, 2.6 * S, 0.3, 0, K.TAU); c.fill();
    c.filter = "none";
    c.restore();
  });
}
function stampCat(g, kind, i, x, y) {
  const w = CAT_S * 3.6, h = CAT_S * 2.4, ay = h - CAT_S * 0.35;
  g.drawImage(catSprite(kind, i), x - w / 2, y - ay, w, h);
}
function shotEyes(g, t, W, H) {
  g.fillStyle = VOID; g.fillRect(0, 0, W, H);
  const p = K.ease.inOut(K.seg(t, 40, 50.4));
  K.withCamera(g, W, H, { x: 480 + p * 20, y: 270, zoom: 1.02 + p * 0.05, shakeT: t, shakeAmt: 0.6 }, () => {
    const cam = CAM5;
    const px = 430, py = 448, rx = 240, ry = 66;
    const tx = 820, ty = -40;
    grid(g, cam, { alpha: 0.1, z0: 1.4, z1: 30, fade: 5 });
    const rect = [px - rx * 2, py - ry * 2.4, Math.min(1000, px + rx * 2.2), 560];
    litFloor(g, cam, rect, [
      { x: px, y: py, rx: rx * 1.15, ry: ry * 1.3, I: 1 },
      { x: px + 120, y: py + 30, rx: rx * 2.0, ry: ry * 2.2, I: 0.2 },
    ], { spec: { x: px + 70, y: py + 36, r: rx * 0.32, long: 1.4, I: 0.22 }, gain: 1.0, cache: FL5 });
    cone(g, t, tx, ty, px, py, rx, ry, 0.5);
    // eyeshine all round, focus pulled to the near ones (the far ones are soft discs)
    eyeField(g, t, { id: "s5", skip: (e) => Math.hypot((e.x - px) / (rx * 1.2), (e.y - py) / (ry * 3)) < 1, focusDepth: 0.1, blurK: 0.9 });
    // the black cat: low, close, eyes first; then it steps into the light and stops with its nose at
    // your boot toe (~48.4), sniffing
    const bootX = 735, bootY = 470;
    const toeX = bootX - BOOT_H * 0.1 - BOOT_H * 0.575;
    const CS = CAT_S;
    const endX = toeX - CS * 1.02, endY = bootY - 2;
    const walk = K.seg(t, 45.2, 48.4);
    const wk = K.ease.out(walk);
    const cx = K.lerp(120, endX, wk), cy = K.lerp(424, endY, walk);
    if (t < 45.2) {
      const o0 = K.smooth(K.seg(t, 43.6, 44.4)) * (t > 44.8 ? 1 - K.smooth(K.seg(t, 44.8, 45.0)) * 0.6 : 1);
      eyePair(g, 150, 388, 4.6, "#d8ee6a", o0, 0.3, 0.9, 1.0, 0.1);
    } else {
      const sniff = K.smooth(K.seg(t, 48.2, 48.6));
      const L = K.layer(W, H, "f11cat");
      let bob = 0;
      if (walk < 1) {
        // gait speed follows the ease-out: the steps slow as it arrives (12 cached gait phases);
        // the head and shoulders carry a little weight in each step
        const ph = (t - 45.2) * 1.15 - (t - 45.2) * (t - 45.2) * 0.1;
        const f = ((ph % 1) + 1) % 1;
        bob = Math.sin(f * K.TAU * 2) * 1.1 * (1 - walk * 0.5);
        stampCat(L.g, "w", Math.floor(f * CAT_PH) % CAT_PH, cx, cy + bob);
      } else {
        // sniffing: dip to the toe and twitch (4 cached steps, sniff rhythm ~4 Hz in bursts)
        const burst = Math.sin((t - 48.4) * 2.2) > -0.3 ? 1 : 0;
        const ph = (t - 48.4) * 8.5;
        const seq = [1, 2, 3, 2, 3, 2];
        const step = sniff < 0.5 ? (sniff < 0.2 ? 0 : 1) : burst ? seq[Math.floor(ph) % seq.length] : 2;
        stampCat(L.g, "s", step, cx, cy);
      }
      // lit by the beam only: falls to black where the pool does not reach
      L.g.globalCompositeOperation = "destination-in";
      const lg = L.g.createRadialGradient(px + 40, py - 40, 60, px + 40, py - 40, 460);
      lg.addColorStop(0, "rgba(255,255,255,1)"); lg.addColorStop(0.55, "rgba(255,255,255,0.85)"); lg.addColorStop(1, "rgba(255,255,255,0.1)");
      L.g.fillStyle = lg; L.g.fillRect(0, 0, W, H);
      L.g.globalCompositeOperation = "source-over";
      // contact shadow under the paws, then the faint mirror image in the polished stone
      K.shadowBlob(g, cx + 4, cy + 1, CS * 0.62, CS * 0.05, { alpha: 0.85, soft: 0.7 });
      g.save(); g.globalAlpha = 0.12; g.translate(0, 2 * cy + 2); g.scale(1, -1);
      g.beginPath(); g.rect(0, cy - 60, W, 62); g.clip();
      g.drawImage(L.canvas, 0, 0, W, H); g.restore();
      g.drawImage(L.canvas, 0, 0, W, H);
      const inBeam = K.clamp(1.3 - Math.hypot((cx - px) / rx, (cy - py) / (ry * 2)));
      if (inBeam < 0.25) eyePair(g, cx + CS * 0.62, cy - CS * 1.05 + bob, 4.2, "#d8ee6a", 1 - inBeam * 3, 0.3, 0.9, 1.0, 0.1);
    }
    // dust in the beam: the motes behind your legs first, then the legs, then only the few nearest
    // the lens in front of them, defocused into soft discs
    coldMotes(g, W, H, t, 14, 18, 0.14);
    beamMotes(g, t, tx, ty, px, py, 0.26, { count: 80, size: 1.2, seed: 17, only: "far" });
    boots(g, bootX, bootY);
    beamMotes(g, t, tx, ty, px, py, 0.26, { count: 80, size: 1.2, seed: 17, only: "near" });
  });
}

// ---- SHOT 6 [50-58] the bell rings in the beam; every pair of eyes turns the same way --------------
// Your gloved fist round a real torch: a ~26 px knurled aluminium barrel, a flared head, a chrome
// bezel and a white-hot lens. The fist wraps the barrel (knuckle planes over the top, fingers down
// the near side, thumb along the top toward the switch); only the beam's spill lights it, so it is a
// low-key silhouette with a warm rim on the lens side. Painted once in screen orientation (the barrel
// points up-left at TORCH_ANG); local space: barrel along +x (lens at +x), local -y = the top.
const TORCH_ANG = -2.25, FIST_OX = 150, FIST_OY = 170, LENS_X = 149, ANCHOR = [-48, 28];
function knurlTex() {
  // diamond knurling: little pyramids whose four faces catch the light differently, cut by grooves
  return K.texBake("f11knurl", 24, 24, (u, v, out) => {
    const p = ((u + v) * 3) % 1, q = ((u - v + 4) * 3) % 1;
    const d = [p, 1 - p, q, 1 - q];
    let m = 0;
    for (let i = 1; i < 4; i++) if (d[i] < d[m]) m = i;
    const L = d[m] < 0.07 ? 0.12 : [0.78, 0.3, 0.62, 0.4][m];
    out[0] = out[1] = out[2] = 255 * L; out[3] = 255;
  });
}
function l2s(lx, ly, a = TORCH_ANG) {
  const c = Math.cos(a), s = Math.sin(a);
  return [lx * c + ly * s, lx * s - ly * c];
}
function fistSprite() {
  return K.sprite("f11fist:v5", 470, 470, (g) => {
    g.translate(FIST_OX, FIST_OY);
    g.rotate(TORCH_ANG);
    g.scale(1, -1);
    const LEA = "#2a1c15", COAT = "#8a6c18";
    // ---- sleeve: a waxed raincoat sleeve, deep in shadow, falling off to black toward the elbow
    const slv = new Path2D();
    K.tube(slv, [-40, 4, -180, 18, -340, 34], [64, 72, 80], 4, true, true);
    K.texFill(g, "fabric", slv, { scale: 26, tex: { seed: 9 }, ox: 31, tint: COAT, tintAlpha: 0.9 });
    g.save(); g.clip(slv);
    const sg = g.createLinearGradient(0, -36, 0, 44);
    sg.addColorStop(0, "rgba(255,220,150,0.06)"); sg.addColorStop(0.35, "rgba(0,0,0,0.35)"); sg.addColorStop(1, "rgba(0,0,0,0.85)");
    g.fillStyle = sg; g.fillRect(-360, -60, 340, 120);
    g.filter = "blur(2.5px)";
    for (let i = 0; i < 6; i++) {
      const x = -70 - i * 44;
      g.strokeStyle = "rgba(10,6,0,0.55)"; g.lineWidth = 8;
      g.beginPath(); g.moveTo(x, -34); g.quadraticCurveTo(x - 12 + (i % 2) * 6, 6, x + 4, 46); g.stroke();
      g.strokeStyle = "rgba(255,220,140,0.08)"; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + 6, -34); g.quadraticCurveTo(x - 6 + (i % 2) * 6, 6, x + 10, 46); g.stroke();
    }
    // waxed cotton: a long soft sheen along the top of the forearm from the beam spill
    g.filter = "blur(3px)";
    g.strokeStyle = "rgba(255,226,170,0.13)"; g.lineWidth = 7;
    g.beginPath(); g.moveTo(-44, -24); g.quadraticCurveTo(-180, -18, -330, -4); g.stroke();
    g.filter = "none";
    const fg = g.createLinearGradient(-60, 0, -260, 0);
    fg.addColorStop(0, "rgba(0,0,0,0.3)"); fg.addColorStop(0.6, "rgba(0,0,0,0.9)"); fg.addColorStop(1, "rgba(0,0,0,1)");
    g.fillStyle = fg; g.fillRect(-440, -70, 400, 140);
    g.restore();
    // ---- barrel + head: anodised black aluminium, a cylindrical gradient with a narrow specular
    // stripe from the haze-lit air above, a faint bounce lip below
    const cylGrad = (r) => {
      const gr = g.createLinearGradient(0, -r, 0, r);
      gr.addColorStop(0, "rgba(0,0,0,0.65)"); gr.addColorStop(0.12, "rgba(255,240,220,0.06)");
      gr.addColorStop(0.2, "rgba(255,246,232,0.62)"); gr.addColorStop(0.25, "rgba(255,240,220,0.14)");
      gr.addColorStop(0.5, "rgba(0,0,0,0.08)"); gr.addColorStop(0.84, "rgba(0,0,0,0.5)");
      gr.addColorStop(0.93, "rgba(255,196,140,0.12)"); gr.addColorStop(1, "rgba(0,0,0,0.75)");
      return gr;
    };
    const barrel = new Path2D(); barrel.rect(-44, -13, 150, 26);
    g.fillStyle = "#2a2c31"; g.fill(barrel);
    g.save(); g.clip(barrel);
    const kp = g.createPattern(knurlTex(), "repeat");
    if (kp.setTransform) kp.setTransform(new DOMMatrix([0.5, 0, 0, 0.5, 0, 0]));
    g.globalCompositeOperation = "overlay"; g.globalAlpha = 0.8; g.fillStyle = kp; g.fillRect(34, -13, 64, 26);
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
    g.fillStyle = cylGrad(13); g.fillRect(-44, -13, 150, 26);
    for (const gx of [33, 99]) {           // machined ring grooves
      g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(gx, -13, 2.2, 26);
      g.fillStyle = "rgba(255,235,210,0.18)"; g.fillRect(gx + 2.2, -13, 0.9, 26);
    }
    // AO where the fist and the barrel meet
    const ao = g.createLinearGradient(26, 0, 44, 0);
    ao.addColorStop(0, "rgba(0,0,0,0.8)"); ao.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = ao; g.fillRect(26, -13, 18, 26);
    g.restore();
    const head = new Path2D();
    head.moveTo(104, -13); head.bezierCurveTo(112, -13, 116, -17.5, 124, -17.5); head.lineTo(146, -17.5);
    head.lineTo(146, 17.5); head.lineTo(124, 17.5); head.bezierCurveTo(116, 17.5, 112, 13, 104, 13); head.closePath();
    g.fillStyle = "#2a2c31"; g.fill(head);
    g.save(); g.clip(head);
    g.fillStyle = cylGrad(17.5); g.fillRect(100, -18, 48, 36);
    // fins / flats milled into the head
    for (let k = 0; k < 4; k++) { g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(126 + k * 4.6, -17.5, 1.6, 35); }
    g.restore();
    // chrome bezel ring (the face is foreshortened: the torch points away from us)
    const bz = g.createLinearGradient(0, -18, 0, 18);
    bz.addColorStop(0, "#202226"); bz.addColorStop(0.2, "#e8e4dc"); bz.addColorStop(0.32, "#6a6c70"); bz.addColorStop(0.7, "#2a2c30"); bz.addColorStop(0.9, "#a89880"); bz.addColorStop(1, "#18191c");
    g.fillStyle = bz;
    g.beginPath(); g.ellipse(147, 0, 5.5, 18.5, 0, 0, K.TAU); g.fill();
    // the lens: a white-hot LED behind glass, the reflector's facets as a bright ring round it
    const lz = g.createRadialGradient(149, 0, 0, 149, 0, 16);
    lz.addColorStop(0, "#ffffff"); lz.addColorStop(0.35, "#fffaf0"); lz.addColorStop(0.7, "#fff0d0"); lz.addColorStop(1, "#ffe0b0");
    g.fillStyle = lz;
    g.beginPath(); g.ellipse(148.5, 0, 4.2, 15.5, 0, 0, K.TAU); g.fill();
    // ---- the gloved fist (dark leather)
    const handMass = new Path2D();
    handMass.moveTo(30, -26);
    handMass.bezierCurveTo(22, -36, 0, -39, -22, -38);
    handMass.bezierCurveTo(-42, -37, -56, -32, -60, -24);
    handMass.lineTo(-62, 18);
    handMass.bezierCurveTo(-56, 28, -40, 30, -28, 25);
    handMass.lineTo(26, 20);
    handMass.closePath();
    g.fillStyle = LEA; g.fill(handMass);
    g.save(); g.clip(handMass);
    // back of the hand: a broad plane rising from the knuckles, lit a little from the top
    const dg = g.createLinearGradient(0, -40, 0, 24);
    dg.addColorStop(0, "rgba(255,226,196,0.16)"); dg.addColorStop(0.35, "rgba(0,0,0,0.05)"); dg.addColorStop(1, "rgba(0,0,0,0.6)");
    g.fillStyle = dg; g.fillRect(-70, -42, 110, 70);
    g.restore();
    // knit glove cuff at the wrist
    const cuff = new Path2D(); cuff.moveTo(-50, -33); cuff.lineTo(-64, -31); cuff.lineTo(-66, 24); cuff.lineTo(-52, 28); cuff.closePath();
    g.fillStyle = "#2a201c"; g.fill(cuff);
    g.save(); g.clip(cuff);
    for (let y = -34; y < 30; y += 3.2) { g.fillStyle = "rgba(255,220,190,0.07)"; g.fillRect(-68, y, 20, 1.4); }
    g.restore();
    // fingers: four leather-clad cylinders wrapping down the near side of the barrel. Each has its
    // own roundness, a lit top plane over the knuckle, the crease of the middle joint, the turn under
    const FING = [[-34, 13.5], [-19, 15], [-3, 16], [14, 16.5]];
    const fingers = new Path2D();
    FING.forEach(([fx, fw], i) => {
      const p = new Path2D();
      const lean = 4;
      p.moveTo(fx - fw / 2, -16);
      p.bezierCurveTo(fx - fw / 2, -24, fx + fw / 2, -24, fx + fw / 2, -16);
      p.lineTo(fx + fw / 2 + lean, 12);
      p.bezierCurveTo(fx + fw / 2 + lean, 20, fx - fw / 2 + lean, 20, fx - fw / 2 + lean, 12);
      p.closePath();
      fingers.addPath(p);
      g.fillStyle = LEA; g.fill(p);
      g.save(); g.clip(p);
      const rg = g.createLinearGradient(fx - fw / 2, 0, fx + fw / 2 + lean, 0);
      rg.addColorStop(0, "rgba(0,0,0,0.3)"); rg.addColorStop(0.4, "rgba(255,225,200,0.08)"); rg.addColorStop(0.65, "rgba(255,225,200,0.03)"); rg.addColorStop(1, "rgba(0,0,0,0.38)");
      g.fillStyle = rg; g.fillRect(fx - fw, -26, fw * 2 + lean, 50);
      const vg = g.createLinearGradient(0, -24, 0, 20);
      vg.addColorStop(0, "rgba(255,226,200,0.18)"); vg.addColorStop(0.2, "rgba(255,226,200,0.05)");
      vg.addColorStop(0.3, "rgba(0,0,0,0.22)"); vg.addColorStop(0.38, "rgba(255,220,190,0.04)");
      vg.addColorStop(0.7, "rgba(0,0,0,0.2)"); vg.addColorStop(1, "rgba(0,0,0,0.8)");
      g.fillStyle = vg; g.fillRect(fx - fw, -26, fw * 2 + lean, 50);
      // leather wrinkles over the bent joint
      g.strokeStyle = "rgba(0,0,0,0.45)"; g.lineWidth = 0.9;
      g.beginPath();
      for (let k = 0; k < 3; k++) { const y = -6 + k * 2.6; g.moveTo(fx - fw * 0.35 + 1, y); g.quadraticCurveTo(fx + 1, y - 1.6, fx + fw * 0.35 + 1, y); }
      g.stroke();
      g.strokeStyle = "rgba(255,220,190,0.12)"; g.lineWidth = 0.7;
      g.beginPath();
      for (let k = 0; k < 3; k++) { const y = -7 + k * 2.6; g.moveTo(fx - fw * 0.3 + 1, y); g.quadraticCurveTo(fx + 1, y - 1.6, fx + fw * 0.3 + 1, y); }
      g.stroke();
      g.restore();
      // occlusion in the gap to the next finger
      if (i < 3) K.aoEdge(g, fx + fw / 2, -18, fx + fw / 2 + lean, 14, { width: 2.4, alpha: 0.45, side: 0 });
      // the knuckle (MCP head) as a rounded plane above the finger
      const kg = g.createRadialGradient(fx - 1, -27, 0, fx - 1, -27, fw * 0.6);
      kg.addColorStop(0, "rgba(255,226,200,0.2)"); kg.addColorStop(1, "rgba(255,226,200,0)");
      g.fillStyle = kg; g.fillRect(fx - fw, -38, fw * 2, 22);
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.beginPath(); g.ellipse(fx + fw / 2, -26, 1.6, 5, 0, 0, K.TAU); g.fill();
    });
    // thumb: along the top of the barrel toward the switch, its tip catching the bezel spill
    const th = new Path2D();
    K.tube(th, [18, -27, 38, -21, 60, -16], [17, 14, 11.5], 5, true, true);
    g.fillStyle = LEA; g.fill(th);
    g.save(); g.clip(th);
    const tg = g.createLinearGradient(0, -34, 0, -8);
    tg.addColorStop(0, "rgba(255,226,200,0.24)"); tg.addColorStop(0.45, "rgba(255,226,200,0.04)"); tg.addColorStop(1, "rgba(0,0,0,0.6)");
    g.fillStyle = tg; g.fillRect(10, -36, 60, 30);
    g.strokeStyle = "rgba(255,226,200,0.18)"; g.lineWidth = 0.7; g.setLineDash([1.6, 1.4]);
    g.beginPath(); g.moveTo(24, -30); g.quadraticCurveTo(44, -26, 62, -20); g.stroke();
    g.setLineDash([]);
    g.restore();
    K.aoEdge(g, 22, -14, 62, -11, { width: 4, alpha: 0.55, side: 0 });
    // leather grain and the low key: the whole hand sinks toward black away from the lens
    const all = new Path2D(); all.addPath(handMass); all.addPath(fingers); all.addPath(th);
    K.texFill(g, "relief", all, { scale: 30, tex: { seed: 13 }, alpha: 0.1, mode: "overlay" });
    g.save();
    g.clip(all);
    const lk = g.createLinearGradient(70, -20, -70, 30);
    lk.addColorStop(0, "rgba(4,2,2,0.0)"); lk.addColorStop(0.5, "rgba(4,2,2,0.35)"); lk.addColorStop(1, "rgba(4,2,2,0.7)");
    g.fillStyle = lk; g.fillRect(-80, -50, 160, 90);
    g.restore();
    // rim from the beam's spill (the lens side and the top edges), deep core shadow underneath
    // rim from the beam spill: an inner edge line, warm on the lens / top side only
    g.save(); g.clip(all);
    g.filter = "blur(0.8px)";
    const rimG = g.createLinearGradient(66, -34, -10, 6);
    rimG.addColorStop(0, "rgba(255,215,168,0.6)"); rimG.addColorStop(0.55, "rgba(255,215,168,0.16)"); rimG.addColorStop(1, "rgba(255,215,168,0)");
    g.globalCompositeOperation = "lighter"; g.strokeStyle = rimG; g.lineWidth = 2.6; g.stroke(all);
    g.globalCompositeOperation = "source-over"; g.filter = "none";
    g.restore();
    const sp = g.createRadialGradient(62, -16, 0, 62, -16, 34);
    sp.addColorStop(0, "rgba(255,214,160,0.3)"); sp.addColorStop(1, "rgba(255,214,160,0)");
    g.save(); g.clip(all); g.globalCompositeOperation = "lighter"; g.fillStyle = sp; g.fillRect(20, -50, 60, 60); g.restore();
    // the bell's thread wound twice round the glove cuff, knotted underneath
    g.strokeStyle = "#7e2018"; g.lineWidth = 1.5;
    for (const dx of [0, 3.2]) { g.beginPath(); g.ellipse(ANCHOR[0] + dx, -3, 3.4, 31, 0, -Math.PI / 2, Math.PI / 2); g.stroke(); }
    g.strokeStyle = "rgba(255,170,140,0.28)"; g.lineWidth = 0.6;
    g.beginPath(); g.ellipse(ANCHOR[0] + 1.6, -3, 3.4, 31, 0, -1.2, 0.4); g.stroke();
    g.fillStyle = "#6a1a14"; g.beginPath(); g.arc(ANCHOR[0] + 1.6, ANCHOR[1], 2.4, 0, K.TAU); g.fill();
  });
}
// stamp the fist at (x, y) (the grip centre) with a small extra rotation; returns the lens point and
// the thread's anchor under the wrist, in screen space
function torchFist(g, x, y, jit = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(jit);
  g.drawImage(fistSprite(), -FIST_OX, -FIST_OY, 470, 470);
  g.restore();
  const [lx, ly] = l2s(LENS_X, 0, TORCH_ANG + jit), [ax, ay] = l2s(ANCHOR[0] + 1.6, ANCHOR[1] + 1, TORCH_ANG + jit);
  return { lx: x + lx, ly: y + ly, ax: x + ax, ay: y + ay, ang: TORCH_ANG + jit };
}
// the bell on its thread: a damped pendulum. Idle sway before the ring; at the ring the hand
// flicks, the bell swings out hard and settles over a few seconds. The thread goes slack and bows
// against the swing (it lags the bell).
function bellSwing(t, ring) {
  let th = 0.05 * Math.sin(t * 1.9) + 0.025 * Math.sin(t * 3.3 + 1);
  let w = 0.05 * 1.9 * Math.cos(t * 1.9);
  const tt = t - ring;
  if (tt > 0) {
    const A = 0.62 * Math.exp(-tt * 1.05), om = 12.5;
    th += A * Math.sin(om * tt);
    w += A * (om * Math.cos(om * tt) - 1.05 * Math.sin(om * tt));
  }
  return { th, w };
}
function shotBell(g, t, W, H) {
  g.fillStyle = VOID; g.fillRect(0, 0, W, H);
  const p = K.ease.inOut(K.seg(t, 50, 58));
  const ring = 50.0;
  const shake = K.env(t, ring - 0.08, ring + 0.9, 0.06, 0.8);
  K.withCamera(g, W, H, { x: 480, y: 270, zoom: 1.03 + p * 0.05, shakeT: t, shakeAmt: 0.7 }, () => {
    const jit = K.noise(t * 0.5, 51) * 0.015 + Math.sin(t * 17) * shake * 0.02;
    const wx = 655 + Math.sin(t * 9) * shake * 2.5, wy = 392 + Math.cos(t * 11) * shake * 1.5;
    const [lx0, ly0] = l2s(LENS_X, 0, TORCH_ANG + jit);
    const lens = { x: wx + lx0, y: wy + ly0 };
    const ang = TORCH_ANG + jit + 0.12;                     // the beam leaves the lens up-left, into the field
    const far = { x: lens.x + Math.cos(ang) * 760, y: lens.y + Math.sin(ang) * 760 };
    const spread = 0.38;
    const inBeam = (x, y) => {
      const vx = x - lens.x, vy = y - lens.y, vl = Math.hypot(vx, vy) || 1;
      const c = (vx * Math.cos(ang) + vy * Math.sin(ang)) / vl;
      return K.clamp((c - Math.cos(spread)) / (1 - Math.cos(spread)) * 1.6);
    };
    const [bax, bay] = l2s(ANCHOR[0] + 1.6, ANCHOR[1] + 1, TORCH_ANG);
    const bellAt = { x: wx + bax, y: wy + bay + 32 };
    // eyes everywhere (cached layer): on the ring each pair blinks, then turns to the bell in a wave
    eyeField(g, t, { id: "s6", ring, bell: bellAt, allOpen: true, scale: 1.2, dy: -36, shine: inBeam, focusDepth: 0.02, blurK: 0.75 });
    // far amber hint low on the left, where the prints lead
    const lead = K.smooth(K.seg(t, 52.4, 56));
    K.glow(g, 30, 250, 180, "#e0a050", 0.04 + 0.12 * lead); K.glow(g, 30, 250, 26, "#ffd27a", 0.05 + 0.2 * lead);
    // the beam in the haze (quarter-res, broken by drifting haze)
    const Lc = K.layer(240, 135, "f11cone");
    const c = Lc.g;
    c.scale(0.25, 0.25);
    c.globalCompositeOperation = "lighter";
    for (const [k, al] of [[1, 0.05], [0.7, 0.06], [0.4, 0.08], [0.16, 0.09]]) {
      const gr = c.createRadialGradient(lens.x, lens.y, 0, lens.x, lens.y, 900);
      gr.addColorStop(0, K.rgba(k < 0.2 ? HOT : TORCH, al * 2.4)); gr.addColorStop(0.3, K.rgba(TORCH, al)); gr.addColorStop(1, K.rgba(TORCH, 0));
      c.fillStyle = gr;
      c.beginPath(); c.moveTo(lens.x, lens.y); c.arc(lens.x, lens.y, 900, ang - spread * k, ang + spread * k); c.closePath(); c.fill();
    }
    haze(c, t, 0.5);
    g.save(); g.globalCompositeOperation = "lighter"; g.imageSmoothingEnabled = true;
    g.drawImage(Lc.canvas, 0, 0, Lc.canvas.width, Lc.canvas.height, 0, 0, W, H);
    g.restore();
    beamMotes(g, t, lens.x, lens.y, far.x, far.y, spread * 0.9, { count: 150, size: 1.3, seed: 23 });
    // the hand and the torch (in focus)
    const fist = torchFist(g, wx, wy, jit);
    // the lens blooms (the GPU lens turns these near-white pixels into a hot light)
    K.glow(g, fist.lx, fist.ly, 64, TORCH, 0.5);
    K.glow(g, fist.lx, fist.ly, 16, HOT, 1);
    // the bell on its slack thread
    const { th, w } = bellSwing(t, ring);
    const Lt = 30;
    const bx = fist.ax + Math.sin(th) * Lt, by = fist.ay + Math.cos(th) * Lt;
    const mx = (fist.ax + bx) / 2 - Math.cos(th) * w * 1.6 + Math.sin(th) * 2, my = (fist.ay + by) / 2 + Math.sin(th) * w * 1.6 - 1;
    g.lineCap = "round";
    g.strokeStyle = "#7e2018"; g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(fist.ax, fist.ay); g.quadraticCurveTo(mx, my, bx, by - 8); g.stroke();
    g.strokeStyle = "rgba(255,190,150,0.3)"; g.lineWidth = 0.5;
    g.beginPath(); g.moveTo(fist.ax - 0.4, fist.ay); g.quadraticCurveTo(mx - 0.4, my, bx - 0.4, by - 8); g.stroke();
    g.save();
    g.translate(bx, by); g.rotate(-th * 0.8); g.translate(-bx, -by);
    K.shadowBlob(g, bx + 2, by + 3, 8, 4, { alpha: 0.3 });
    K.drawBell(g, bx, by, 17, { t, glint: 0.5 });
    g.restore();
    const flash = K.env(t, ring - 0.05, ring + 0.9, 0.08, 0.8);
    if (flash > 0.01) K.bellGlint(g, bx - 3, by - 3, 8 + flash * 12, t, { strength: 0.2 + flash * 0.6 });
  });
  coldMotes(g, W, H, t, 26, 21, 0.2);
}

// ---- edit -------------------------------------------------------------------------------------------
const SHOTS = [[0, 12, shotSweep], [12, 20, shotFar], [20, 30, shotPrints], [30, 40, shotDrift], [40, 50, shotEyes], [50, 58.5, shotBell]];
const XF = { 12: 0.8, 30: 0.8, 40: 0.6 };
function render(g, t, W, H) {
  warmAt(t);
  let i = SHOTS.findIndex((s) => t < s[1]);
  if (i < 0) i = SHOTS.length - 1;
  const [a, , fn] = SHOTS[i];
  const xin = XF[a];
  if (xin && i > 0 && t < a + xin) {
    SHOTS[i - 1][2](g, t, W, H);
    const L = K.layer(W, H, "f11xf");
    fn(L.g, t, W, H);
    g.save(); g.globalAlpha = K.smooth((t - a) / xin); g.drawImage(L.canvas, 0, 0, W, H); g.restore();
  } else fn(g, t, W, H);
}

export const film = {
  id: 11,
  title: "Nothing",
  chapter: "Chapter 11",
  unlockAt: 55,
  duration: D,
  poster: 30,
  tagline: "Where the light goes to sleep.",
  subs: [
    [5.0, 9.0, "The nil Void. Nothing. At all."],
    [13.0, 17.5, "Your flashlight was the only light there was."],
    [21.5, 26.0, "But even here, his pawprints."],
    [31.0, 35.5, "Pieces of the world floated by. Lost things."],
    [41.0, 45.0, "Eyes. Hundreds of eyes."],
    [45.5, 49.0, "Lost cats. Waiting in the dark."],
    [51.0, 56.0, "When the bell rang, they all looked the same way."],
  ],
  voice: [
    [5.0, "The nil Void. Nothing. At all.", { rate: 0.88, pitch: 0.98 }],
    [13.0, "Your flashlight was the only light there was.", { rate: 0.92, pitch: 1.0 }],
    [21.5, "But even here, his pawprints.", { rate: 0.92, pitch: 1.0 }],
    [31.0, "Pieces of the world floated by. Lost things.", { rate: 0.92, pitch: 1.0 }],
    [41.0, "Eyes. Hundreds of eyes.", { rate: 0.9, pitch: 1.0 }],
    [45.5, "Lost cats. Waiting in the dark.", { rate: 0.9, pitch: 1.0 }],
    [51.0, "When the bell rang, they all looked the same way.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: { mood: "mystery", key: "C", bpm: 54, cues: [[0, "drop"], [20, "hit"], [36, "swell"], [50, "bell"]] },
  // the void recipe: deep true blacks, a warm torch, handheld weave, hot bezel blooming with halation
  grade: { exposure: 0.95, temp: 0.04, lift: [0, 0, 0.004], gamma: [1, 1, 1.02], contrast: 1.06, sat: 0.95,
    bloom: 0.42, threshold: 0.9, halation: 0.5, streak: 0.04, grain: 0.07, grainSize: 1.4, vignette: 0.55, weave: 0.6, ca: 0.6 },
  gradeAt(t) {
    // locked off in the black before the click; the eyes shot gets a touch more exposure for the cat
    if (t < 1.6) return { weave: 0 };
    if (t >= 40 && t < 50) return { exposure: 1.0 };
    return {};
  },
  draw(g, t, W, H) {
    g.save();
    if (W !== 960 || H !== 540) g.scale(W / 960, H / 540);
    const w = 960, h = 540;
    render(g, t, w, h);
    K.letterbox(g, w, h, 1);
    K.fadeBlack(g, w, h, K.smooth(K.seg(t, 56.5, 58)));
    g.restore();
  },
};
