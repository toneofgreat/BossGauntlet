// films/f17.js - Chapter 17 "Brave" (FILMS.md f17). The gates of The End Of Cats: an overcast white plain,
// slow snow, an enormous carved stone gate rising into cloud. A tiny gatekeeper in a party hat; a warm memory of
// a dark hallway and a kitten who always walked ahead and waited; the bell rings; you push the gate yourself.
//
// Photoreal pass: every static surface is BAKED into a cached raster by a small per-pixel shader in this file:
//  - relief(): carved stone as a height field (bevels, niches, seated-cat reliefs, snow caps, chisel tool marks,
//    fbm erosion) lit by an overcast sky dome (sky visibility, occlusion under ledges, cavity AO, snow bounce)
//  - snowPlane(): a perspective snowfield (fbm drifts, wind ripples, sastrugi, blue sky-lit shadow sides, haze)
//    plus a footprint overlay (real depressions: sky-lit blue floors, lit rims)
//  - hallBake(): the flashback hallway ray-cast through a doorway, lit by a nightlight (inverse square, door
//    aperture penumbra), the child's long shadow, a moonlit window and the varnished floor's reflection
//  - armBake(): the close-up hand and quilted sleeve, ray-marched signed distance fields (sky dome, snow bounce,
//    AO, subsurface red at thin edges, fabric sheen, near-lens defocus)
//  - bellSprite(): a brass jingle bell as an environment-mapped metal sphere seen from above
//  - stepCloud() / skyCloud(): density fields lit by the low rose sun (thin rims glow, dense cores grey-violet)
// PERFORMANCE: every bake is a generator that yields every few dozen pixels. warm(t) advances the job scheduled
// for that time window by <= 3.5 ms per frame, starting seconds before the shot; a draw that needs a bake that
// is not finished completes it synchronously (the same pixels either way, so draw stays a pure function of t).
// The GPU lens (film.grade / gradeAt) does tone mapping, bloom, halation, grain.
import * as K from "../filmkit.js";

const D = 70;
const TAU = Math.PI * 2;
const FOG = "#e9ebf8";

// ---- small utilities --------------------------------------------------------------------------------------
const knee = (x) => (x < 0.86 ? (x < 0 ? 0 : x) : 0.86 + 0.08 * (1 - Math.exp(-(x - 0.86) / 0.08)));
const cl01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (e0, e1, x) => { const t = cl01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
function xfade(g, W, H, a, key, fn) {
  if (a <= 0.002) return;
  if (a >= 0.998) { fn(g); return; }
  const L = K.layer(W, H, key);
  fn(L.g);
  g.save();
  g.setTransform(K.pixelScale(), 0, 0, K.pixelScale(), 0, 0);
  g.globalAlpha *= a;
  g.drawImage(L.canvas, 0, 0, W, H);
  g.restore();
}
// fast value noise for the bakes (integer hash lattice, smooth interpolation, rotated octaves)
function hsh(ix, iy, s) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vn(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hsh(ix, iy, s), b = hsh(ix + 1, iy, s), c = hsh(ix, iy + 1, s), d = hsh(ix + 1, iy + 1, s);
  return (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy) * 2 - 1;
}
function fbm(x, y, oct, s) {
  let v = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) {
    v += vn(x, y, s + i * 131) * a; n += a;
    const nx = x * 1.6 - y * 1.2, ny = x * 1.2 + y * 1.6;
    x = nx; y = ny; a *= 0.5;
  }
  return v / n;
}

// ---- progressive bakes ------------------------------------------------------------------------------------
const JOBS = new Map();
const BUDGET = 3.5;
const clock = () => performance.now();
function job(key, make) {
  let j = JOBS.get(key);
  if (!j) { j = { make, it: null, out: null }; JOBS.set(key, j); }
  return j;
}
function stepJob(j, budget) {
  if (j.out) return true;
  const t0 = clock();
  try {
    if (!j.it) j.it = j.make();
    for (;;) {
      const r = j.it.next();
      if (r.done) { j.out = r.value || K.makeCanvas(2, 2); j.it = null; return true; }
      if (clock() - t0 > budget) return false;
    }
  } catch (err) {
    console.warn("[f17] bake failed", err);
    j.out = K.makeCanvas(2, 2); j.it = null;
    return true;
  }
}
// bake(key, gen) -> the finished canvas (finishes it now if warm() has not)
function bake(key, make) { const j = job(key, make); if (!j.out) stepJob(j, Infinity); return j.out; }
// a bake spec is [key, generator factory]: run(spec) finishes it; sub(spec) advances it from inside another bake
const run = (spec) => bake(spec[0], spec[1]);
function* sub(spec) {
  const j = job(spec[0], spec[1]);
  while (!j.out) { stepJob(j, 0.8); if (!j.out) yield; }
  return j.out;
}
// copy a canvas in horizontal bands (one band per step), with a per-band paint pass
function* bands(src, paint, n = 10) {
  const c = K.makeCanvas(src.width, src.height);
  const g = c.getContext("2d");
  const hS = Math.ceil(src.height / n);
  for (let k = 0; k < n; k++) {
    const y = k * hS, h = Math.min(hS, src.height - y);
    if (h <= 0) break;
    g.save();
    g.beginPath(); g.rect(0, y, src.width, h); g.clip();
    paint(g, y, h);
    g.restore();
    yield;
  }
  Object.assign(c, { lw: src.lw, lh: src.lh, SW: src.SW, SH: src.SH, ox: src.ox, oy: src.oy });
  return c;
}
// a per-pixel shader into a w x h canvas, yielding every 48 pixels
function* pix(w, h, fn) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  const c = K.makeCanvas(w, h);
  const g = c.getContext("2d");
  const img = g.createImageData(w, h);
  const Dd = img.data, out = [0, 0, 0, 255];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[3] = 255;
      fn(x, y, out);
      const i = (y * w + x) * 4;
      Dd[i] = out[0]; Dd[i + 1] = out[1]; Dd[i + 2] = out[2]; Dd[i + 3] = out[3];
      if (x % 48 === 47) yield;
    }
    yield;
  }
  g.putImageData(img, 0, 0);
  return c;
}
// separable box blur in place (2-3 passes approximate a gaussian), yielding every few rows
function* boxBlurG(a, w, h, r, passes = 2) {
  const tmp = new Float32Array(w), acc = new Float32Array(w), src = new Float32Array(a.length);
  const inv = 1 / (r * 2 + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let s = 0;
      for (let k = -r; k <= r; k++) s += a[o + (k < 0 ? 0 : k > w - 1 ? w - 1 : k)];
      for (let x = 0; x < w; x++) {
        tmp[x] = s * inv;
        const xa = x + r + 1, xb = x - r;
        s += a[o + (xa > w - 1 ? w - 1 : xa)] - a[o + (xb < 0 ? 0 : xb)];
      }
      a.set(tmp, o);
      if ((y & 15) === 15) yield;
    }
    src.set(a);
    yield;
    acc.fill(0);
    for (let k = -r; k <= r; k++) { const o = (k < 0 ? 0 : k > h - 1 ? h - 1 : k) * w; for (let x = 0; x < w; x++) acc[x] += src[o + x]; }
    for (let y = 0; y < h; y++) {
      const o = y * w, ya = (y + r + 1 > h - 1 ? h - 1 : y + r + 1) * w, yb = (y - r < 0 ? 0 : y - r) * w;
      for (let x = 0; x < w; x++) { a[o + x] = acc[x] * inv; acc[x] += src[ya + x] - src[yb + x]; }
      if ((y & 15) === 15) yield;
    }
  }
}
// a copy of a baked sprite washed toward a haze colour (atmospheric perspective), cached per amount
function hazedSpec(srcSpec, key, amt, color = FOG) {
  const q = Math.round(cl01(amt) * 20) / 20;
  if (q <= 0) return srcSpec;
  return [key + ":hz" + q + color, function* () {
    const src = yield* sub(srcSpec);
    return yield* bands(src, (g, y, h) => {
      g.drawImage(src, 0, y, src.width, h, 0, y, src.width, h);
      g.globalCompositeOperation = "source-atop";
      g.globalAlpha = q;
      g.fillStyle = color;
      g.fillRect(0, y, src.width, h);
    });
  }];
}
const hazed = (srcSpec, key, amt, color) => run(hazedSpec(srcSpec, key, amt, color));
// a darkened, cool, back-lit copy (stone seen against a bright dawn sky)
function backlitSpec(srcSpec, key) {
  return [key + ":backlit", function* () {
    const src = yield* sub(srcSpec);
    return yield* bands(src, (g, y, h) => {
      g.drawImage(src, 0, y, src.width, h, 0, y, src.width, h);
      g.globalCompositeOperation = "multiply";
      g.fillStyle = "#6a6588";
      g.fillRect(0, y, src.width, h);
      g.globalCompositeOperation = "destination-in";
      g.drawImage(src, 0, y, src.width, h, 0, y, src.width, h);
    });
  }];
}
const backlit = (srcSpec, key) => run(backlitSpec(srcSpec, key));

// ---- cats painted once per gait step into cached sprites (drawCat costs ~3 ms) --------------------------------
// The sprite is drawn at a reference size and scaled to any on-screen size.
const catSprite = (key, size, o, q, steps) => run(catSpec(key, size, o, q, steps));
function catSpec(key, size, o, q, steps) {
  return ["cat:" + key + ":" + q + ":" + size, function* () {
    const SC = 2, SW = size * 3.6, SH = size * 2.6, ox = SW / 2, oy = SH * 0.86;
    const c = K.makeCanvas(Math.ceil(SW * SC), Math.ceil(SH * SC));
    const s = c.getContext("2d");
    s.scale(SC, SC);
    const rel = (L) => (L ? Object.assign({}, L, { x: ox + L.dx, y: oy + L.dy }) : undefined);
    const oo = Object.assign({}, o, { phase: q / steps, t: (q / steps) * 2.3, alpha: undefined, autoBlink: false });
    oo.light = rel(o.light); oo.key = rel(o.key); oo.rim = rel(o.rim);
    K.drawCat(s, ox, oy, size, oo);
    if (o.ruff) ruff(s, ox, oy, size, o.facing || 1, o.pose, o.headTilt || 0);
    c.SW = SW; c.SH = SH; c.ox = ox; c.oy = oy;
    yield;
    return c;
  }];
}
const gaitQ = (phase, steps) => Math.floor(((((phase || 0) % 1) + 1) % 1) * steps);
// draw a cat sprite with its paws at (x, y), scaled to shoulder height `size` (ref = baked size)
function blitCat(g, spr, x, y, size, ref, sx = 1, alpha = 1, blend) {
  const k = size / ref;
  g.save();
  if (alpha !== 1) g.globalAlpha *= alpha;
  if (blend) g.globalCompositeOperation = blend;
  g.drawImage(spr, x - spr.ox * k * sx, y - spr.oy * k, spr.SW * k * sx, spr.SH * k);
  g.restore();
}

// ---- Sir Whiskers: one model sheet everywhere. A translucent old orange tabby ghost: a warm-gold body that
// keeps his stripes, and a cool Fresnel rim where the surface turns away from us. No bloom halo.
const OLD = { base: "#d9995a", light: "#efc48e", dark: "#a8683a", stripe: "#8a4a1c", tip: "#7a3a10", belly: "#efdcc0", white: "#efe6d8", bib: true, socks: "all", muzzle: true, stripeAlpha: 0.6, iris: "#c8b04a", irisInner: "#f0d27a", bentEar: false };
function ruff(g, x, y, S, f, pose, tilt) {
  const sit = pose === "sit";
  const hx = x + f * S * (sit ? 0.26 : 0.84), hy = y - S * (sit ? 1.5 : 1.32) - (tilt || 0) * S * 0.08;
  const cx = hx - f * S * 0.08, cy = hy + S * 0.24;
  const R = K.rng("ruff");
  g.save();
  g.lineCap = "round";
  for (let pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass ? "rgba(232,220,200,0.55)" : "rgba(160,140,120,0.45)";
    g.lineWidth = Math.max(0.6, S * (pass ? 0.011 : 0.018));
    g.beginPath();
    for (let i = 0; i < 90; i++) {
      const u = R(), v = R();
      const a = Math.PI * (0.1 + u * 0.8);
      const r0 = S * 0.16 * v;
      const sx = cx + Math.cos(a) * r0 * 1.7 - f * S * 0.05, sy = cy + Math.sin(a) * r0;
      const len = S * (0.2 + R() * 0.24) * (1 - Math.abs(u - 0.5) * 0.8);
      g.moveTo(sx, sy);
      g.quadraticCurveTo(sx + (u - 0.5) * S * 0.12, sy + len * 0.6, sx + (u - 0.5) * S * 0.08 - f * S * 0.03, sy + len);
    }
    g.stroke();
  }
  g.restore();
}
function ghostSpec(srcSpec, key) {
  return [key + ":ghost", function* () {
    const spr = yield* sub(srcSpec);
    const w = spr.width, h = spr.height;
    const S = spr.getContext("2d").getImageData(0, 0, w, h).data;
    yield;
    const A = new Float32Array(w * h);
    for (let i = 0; i < A.length; i++) A[i] = S[i * 4 + 3] / 255;
    const B = Float32Array.from(A);
    yield* boxBlurG(B, w, h, Math.max(2, Math.round(w / 70)), 2);
    const c = K.makeCanvas(w, h);
    const g = c.getContext("2d");
    const img = g.createImageData(w, h), O = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, a = A[i];
        if (a < 0.01) continue;
        const lum = (S[i * 4] * 0.3 + S[i * 4 + 1] * 0.59 + S[i * 4 + 2] * 0.11) / 255;
        const edge = cl01((a - B[i]) * 3.4);
        // body: the coat's own detail, re-tinted toward a consistent pale warm gold
        const k = 0.2 + 0.95 * lum;
        let r = 1.0 * k, gg = 0.8 * k, b = 0.6 * k;
        // Fresnel rim: cool, a little brighter, never clipped
        r += (0.84 - r) * edge * 0.8; gg += (0.88 - gg) * edge * 0.8; b += (0.96 - b) * edge * 0.8;
        O[i * 4] = r * 255; O[i * 4 + 1] = gg * 255; O[i * 4 + 2] = b * 255;
        O[i * 4 + 3] = 255 * a * (0.56 + 0.36 * edge);
      }
      if ((y & 7) === 7) yield;
    }
    g.putImageData(img, 0, 0);
    c.SW = spr.SW; c.SH = spr.SH; c.ox = spr.ox; c.oy = spr.oy;
    return c;
  }];
}
const WHISK_REF = 60;
const whiskSprite = (o, q, steps, key) => run(whiskSpec(o, q, steps, key));
function whiskSpec(o, q, steps, key) {
  const opts = Object.assign({
    coat: OLD, collar: false, bell: false, shadow: false, blink: 0.35, ruff: true, pupil: 0.3,
    key: { dx: -160, dy: -420, color: "#eef0ff", strength: 0.9 }, fill: "#7d86b4", ambient: "#c4c8e8", ambientK: 0.22,
    rim: { dx: 140, dy: -260, color: "#dfe8ff", strength: 0.9 },
  }, o);
  return ghostSpec(catSpec("whisk:" + key, WHISK_REF, opts, q, steps), "whisk:" + key + ":" + q);
}
function sirWhiskers(g, x, y, size, o, key, alpha = 1) {
  const steps = o.steps || 8;
  const spr = whiskSprite(o, gaitQ(o.phase, steps), steps, key);
  blitCat(g, spr, x, y, size, WHISK_REF, o.sx || 1, alpha);
}

// ---- falling snow: three depth layers. Flakes are white against dark stone and read as soft grey discs
// against the bright overcast (the real look); near flakes are out-of-focus discs (bokeh) stretched by the shutter.
function flakeSprite(kind) {
  return K.sprite("f17flake" + kind, 32, 32, (g) => {
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 15);
    if (kind === 0) { gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,0.8)"); gr.addColorStop(1, "rgba(255,255,255,0)"); }
    else { gr.addColorStop(0, "rgba(236,238,248,0.5)"); gr.addColorStop(0.72, "rgba(228,231,246,0.46)"); gr.addColorStop(0.88, "rgba(216,220,240,0.62)"); gr.addColorStop(1, "rgba(214,218,238,0)"); }
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
  });
}
function snow(g, W, H, t, o = {}) {
  const n = o.count || 120, seed = o.seed || 1, sp = o.speed || 30, size = o.size || 1.6, drift = o.drift == null ? 14 : o.drift;
  const wind = o.wind == null ? 6 : o.wind;
  const a0 = o.alpha == null ? 0.9 : o.alpha;
  const spr = flakeSprite(o.soft ? 1 : 0);
  const blur = o.blur == null ? 1.6 : o.blur;
  const lit = o.lit;
  g.save();
  for (let i = 0; i < n; i++) {
    const r1 = K.hash(i, seed), r2 = K.hash(i + 0.5, seed), r3 = K.hash(i + 0.25, seed);
    const v = sp * (0.6 + r3 * 0.8);
    const span = H + 60;
    const y = ((r2 * span + t * v) % span) - 30;
    let x = r1 * (W + 80) - 40 + Math.sin(t * (0.4 + r3 * 0.6) + i) * drift + t * wind;
    x = ((x + 40) % (W + 80) + (W + 80)) % (W + 80) - 40;
    const s = size * (0.6 + r3 * 0.8);
    let a = a0 * (0.5 + r3 * 0.5);
    if (lit) a = Math.min(1, a * (1 + lit.k * Math.exp(-Math.pow((x - lit.x) / lit.w, 2))));
    g.globalAlpha = a;
    g.drawImage(spr, x - s * 1.6, y - s * 1.6 * blur, s * 3.2, s * 3.2 * blur);
  }
  g.restore();
}
// the three layers at once: far specks, mid flakes, near defocused discs
function snow3(g, W, H, t, o = {}) {
  const k = o.k == null ? 1 : o.k;
  snow(g, W, H, t, { count: Math.round(200 * k), seed: 3 + (o.seed || 0), speed: 10, size: 0.55, alpha: 0.7, drift: 6, wind: 2, blur: 1.2, lit: o.lit });
  snow(g, W, H, t, { count: Math.round(70 * k), seed: 9 + (o.seed || 0), speed: 22, size: 1.4, alpha: 0.9, drift: 14, wind: 4, blur: 1.8, lit: o.lit });
  if (o.near !== false) snow(g, W, H, t, { count: Math.round(8 * k), seed: 21 + (o.seed || 0), speed: 52, size: 10, alpha: 0.55, soft: true, drift: 30, wind: 7, blur: 1.25 });
}

// ---- relief(): carved stone baked from a height field --------------------------------------------------------
// paint(c) (a generator) draws into c.h (height, grey 0..255 on black), c.a (alpha coverage) and c.m (material:
// r = snow, g = metal, b = block tone around 128). Then erosion + chisel marks, then one shading pass per pixel.
let STK = null;
function streaks() {
  if (STK) return STK;
  STK = new Float32Array(4096);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) STK[y * 64 + x] = Math.max(0, vn(x * 0.22, y * 0.031, 14)) * (0.6 + 0.4 * vn(x * 0.06, y * 0.06, 4));
  return STK;
}
// per-block chisel direction (blue channel = block tone)
const TOOLC = new Float32Array(256), TOOLS = new Float32Array(256);
for (let i = 0; i < 256; i++) { const a = 0.5 + ((i * 37) % 97) / 97 * 2.2; TOOLC[i] = Math.cos(a); TOOLS[i] = Math.sin(a); }
function* reliefGen(w, h, sc, paint, o = {}) {
  const Wp = Math.ceil(w * sc), Hp = Math.ceil(h * sc);
  const mk = () => { const cv = K.makeCanvas(Wp, Hp); const x = cv.getContext("2d", { willReadFrequently: true }); x.scale(sc, sc); x.lineCap = "round"; x.lineJoin = "round"; return [cv, x]; };
  const [, hg] = mk(), [, dg] = mk(), [, ag] = mk(), [, mg] = mk();
  hg.fillStyle = "#000"; hg.fillRect(0, 0, w, h);
  dg.fillStyle = "#000"; dg.fillRect(0, 0, w, h);
  mg.fillStyle = "#000080"; mg.fillRect(0, 0, w, h);
  const ctx = {
    h: hg, a: ag, m: mg, sc,
    H(path, v, blur = 0, mode) {
      const x = blur >= 5 ? dg : hg;
      x.save();
      if (mode) x.globalCompositeOperation = mode;
      x.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
      x.fill(path);
      x.restore();
    },
    A(path) { ag.fillStyle = "#fff"; ag.fill(path); },
    M(path, color) { mg.fillStyle = color; mg.fill(path); },
  };
  yield* paint(ctx);
  const N = Wp * Hp;
  const HD = hg.getImageData(0, 0, Wp, Hp).data; yield;
  const DD = dg.getImageData(0, 0, Wp, Hp).data; yield;
  const AD = ag.getImageData(0, 0, Wp, Hp).data; yield;
  const MD = mg.getImageData(0, 0, Wp, Hp).data; yield;
  const hs = new Float32Array(N), ds = new Float32Array(N);
  for (let i = 0; i < N; i++) { hs[i] = HD[i * 4]; ds[i] = DD[i * 4]; if ((i & 16383) === 16383) yield; }
  yield* boxBlurG(hs, Wp, Hp, Math.max(1, Math.round((o.bevel || 2.2) * sc)), 2);
  yield* boxBlurG(ds, Wp, Hp, Math.max(1, Math.round(6 * sc)), 3);
  const Hs = new Float32Array(N);
  // weathering: broad fbm erosion, pitting, and parallel chisel tool marks (each block dressed at its own angle)
  const er = o.erode == null ? 1 : o.erode;
  for (let y = 0; y < Hp; y++) {
    const yl = y / sc;
    for (let x = 0; x < Wp; x++) {
      const i = y * Wp + x;
      let v = hs[i] + ds[i];
      if (AD[i * 4 + 3] > 1 && er > 0) {
        const xl = x / sc, bt = MD[i * 4 + 2], snowM = MD[i * 4] / 255;
        const along = xl * TOOLC[bt] + yl * TOOLS[bt], across = yl * TOOLC[bt] - xl * TOOLS[bt];
        const tool = Math.sin(across * 2.1 + vn(along * 0.15, across * 0.4, 7) * 2.2) * (0.35 + 0.65 * Math.max(0, vn(xl * 0.045, yl * 0.045, 9) + 0.3));
        const pit = vn(xl * 0.38, yl * 0.38, 11) * 0.6 + vn(xl * 1.1, yl * 1.1, 13) * 0.4;
        const ero = vn(xl * 0.05, yl * 0.05, 15) * 0.7 + vn(xl * 0.13, yl * 0.13, 16) * 0.3;
        v += er * (1 - snowM) * (tool * 0.32 + pit * 1.1 + ero * 6);
      }
      Hs[i] = v;
    }
    if ((y & 7) === 7) yield;
  }
  const Hbf = Float32Array.from(Hs);
  yield* boxBlurG(Hbf, Wp, Hp, Math.max(2, Math.round(10 * sc)), 2);

  const ST = streaks();
  const stone = o.stone || [0.8, 0.805, 0.85];
  const snowA = [0.965, 0.972, 1.0];
  const depth = (o.depth == null ? 0.16 : o.depth) * sc;
  let Lx = -0.18, Ly = -0.62, Lz = 0.76;
  const ll = Math.sqrt(Lx * Lx + Ly * Ly + Lz * Lz); Lx /= ll; Ly /= ll; Lz /= ll;
  const sky = o.sky || [0.66, 0.69, 0.82], keyC = o.key || [0.44, 0.43, 0.41], bnc = o.bounce || [0.3, 0.31, 0.36];
  const expo = o.expo || 1.22;
  const up = Math.max(2, Math.round(9 * sc));
  const tk = o.texK || 3;
  const out = K.makeCanvas(Wp, Hp);
  const og = out.getContext("2d");
  const img = og.createImageData(Wp, Hp);
  const OD = img.data;
  for (let y = 0; y < Hp; y++) {
    const yl = y / sc;
    for (let x = 0; x < Wp; x++) {
      const i = y * Wp + x, a = AD[i * 4 + 3];
      if (a < 2) continue;
      const h0 = Hs[i];
      const hx = (x < Wp - 1 ? Hs[i + 1] : h0) - (x > 0 ? Hs[i - 1] : h0);
      const hy = (y < Hp - 1 ? Hs[i + Wp] : h0) - (y > 0 ? Hs[i - Wp] : h0);
      let nx = -hx * depth * 0.5, ny = -hy * depth * 0.5, nz = 1;
      const nl = Math.sqrt(nx * nx + ny * ny + 1); nx /= nl; ny /= nl; nz /= nl;
      const hb = Hbf[i], hbu = Hbf[y >= up ? i - up * Wp : i];
      let ao = 1 - Math.max(0, hb - h0) * 0.011; ao = ao < 0.32 ? 0.32 : ao > 1 ? 1 : ao;
      let so = 1 - Math.max(0, hbu - h0) * 0.008; so = so < 0.45 ? 0.45 : so > 1 ? 1 : so;
      const skyV = cl01(0.55 - 0.45 * ny + 0.05 * nz);
      const bo = cl01(0.18 + 0.42 * ny);
      const dif = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
      const snow = MD[i * 4] / 255, metal = MD[i * 4 + 1] / 255, tone = (MD[i * 4 + 2] - 128) / 128;
      const xl = x / sc;
      const xg = (xl * tk) | 0, yg = (yl * tk) | 0;
      const streak = ST[((((yl * 0.25) | 0) & 63) << 6) + (((xl * 0.5) | 0) & 63)];
      // granite: speckle (feldspar/mica grains), mottling, block tone, rain stains
      const sp = hsh(xg, yg, 5), sp2 = hsh(xg >> 1, yg >> 1, 6);
      const sm = 1 + (sp - 0.5) * 0.08 + (sp2 > 0.95 ? -0.1 : sp2 < 0.03 ? 0.06 : 0) + vn(xl * 0.07, yl * 0.07, 3) * 0.07 + tone * 0.07 - streak * 0.16;
      let r = stone[0] * sm, gg = stone[1] * sm, b = stone[2] * sm;
      r += streak * 0.012; b -= streak * 0.02;
      if (snow > 0) { r += (snowA[0] - r) * snow; gg += (snowA[1] - gg) * snow; b += (snowA[2] - b) * snow; }
      const aoS = ao * (1 - snow * 0.35) + snow * 0.35, sq = Math.sqrt(aoS);
      let lr = sky[0] * skyV * aoS * so + keyC[0] * dif * sq + bnc[0] * bo * aoS;
      let lg = sky[1] * skyV * aoS * so + keyC[1] * dif * sq + bnc[1] * bo * aoS;
      let lb = sky[2] * skyV * aoS * so + keyC[2] * dif * sq + bnc[2] * bo * aoS;
      if (snow > 0) { lr += (0.72 - lr) * snow * 0.35; lg += (0.76 - lg) * snow * 0.35; lb += (0.92 - lb) * snow * 0.35; }
      let R = r * lr * expo, Gc = gg * lg * expo, B = b * lb * expo;
      if (metal > 0) {
        const hl = Math.sqrt((nx + Lx) * (nx + Lx) + (ny + Ly) * (ny + Ly) + (nz + Lz) * (nz + Lz)) || 1;
        const spec = Math.pow(Math.max(0, (nx * Lx + ny * Ly + nz * (Lz + 1)) / hl), 30) * 0.7;
        const env = 0.16 + 0.22 * skyV;
        R += (0.2 * env * 1.6 * ao + spec - R) * metal; Gc += (0.19 * env * 1.6 * ao + spec - Gc) * metal; B += (0.2 * env * 1.75 * ao + spec - B) * metal;
      }
      OD[i * 4] = knee(R) * 255; OD[i * 4 + 1] = knee(Gc) * 255; OD[i * 4 + 2] = knee(B) * 255; OD[i * 4 + 3] = a;
      if (x % 64 === 63) yield;
    }
    yield;
  }
  og.putImageData(img, 0, 0);
  out.lw = w; out.lh = h;
  return out;
}
const rectP = (x, y, w, h) => { const p = new Path2D(); p.rect(x, y, w, h); return p; };
const ellP = (x, y, rx, ry, rot = 0) => { const p = new Path2D(); p.ellipse(x, y, rx, ry, rot, 0, TAU); return p; };
const rrP = (x, y, w, h, r) => { const p = new Path2D(); K.roundRect(p, x, y, w, h, r); return p; };
// a carved seated cat, seen from the front (Bastet-like, but unmistakably a cat): round head, small triangular
// ears (<= 0.25 x head height), a shoulder line, two front legs, wide haunches and the tail curled round the paws.
// (x, y) = bottom centre, s = height. lv = relief height of the body.
function carveCat(c, x, y, s, lv = 128, snowy = true) {
  const E = (cx, cy, rx, ry, rot) => ellP(x + cx * s, y + cy * s, rx * s, ry * s, rot || 0);
  c.H(E(0, -0.2, 0.29, 0.2), lv - 22, 2); // haunches
  c.H(E(0, -0.45, 0.2, 0.24), lv - 10, 2); // chest and shoulders
  c.H(E(0, -0.6, 0.12, 0.09), lv - 4, 2); // neck
  c.H(E(0, -0.775, 0.15, 0.14), lv + 8, 2); // head
  const ears = new Path2D();
  for (const sd of [-1, 1]) {
    ears.moveTo(x + sd * 0.146 * s, y - 0.81 * s);
    ears.lineTo(x + sd * 0.118 * s, y - 0.99 * s);
    ears.lineTo(x + sd * 0.055 * s, y - 0.915 * s);
    ears.closePath();
  }
  c.H(ears, lv + 4, 1.2);
  const inner = new Path2D();
  for (const sd of [-1, 1]) { inner.moveTo(x + sd * 0.128 * s, y - 0.85 * s); inner.lineTo(x + sd * 0.115 * s, y - 0.96 * s); inner.lineTo(x + sd * 0.08 * s, y - 0.91 * s); inner.closePath(); }
  c.H(inner, lv - 8, 0.8);
  // front legs, standing proud of the chest, and the paws
  for (const sd of [-1, 1]) {
    c.H(rrP(x + sd * 0.078 * s - 0.042 * s, y - 0.5 * s, 0.084 * s, 0.47 * s, 0.04 * s), lv + 14, 1.5);
    c.H(E(sd * 0.08, -0.035, 0.062, 0.036), lv + 20, 1.2);
  }
  c.H(E(0, -0.27, 0.012, 0.21), lv - 2, 1); // the gap between the legs
  // the tail: from the right haunch, down and round in front of the paws
  const tail = new Path2D();
  K.tube(tail, [x + 0.27 * s, y - 0.11 * s, x + 0.26 * s, y - 0.025 * s, x + 0.12 * s, y + 0.004 * s, x - 0.06 * s, y + 0.004 * s, x - 0.17 * s, y - 0.03 * s], [0.05 * s, 0.05 * s, 0.046 * s, 0.04 * s, 0.03 * s]);
  c.H(tail, lv + 26, 1.2);
  // the face: muzzle, nose, almond eyes cut in, a brow line
  c.H(E(0, -0.74, 0.05, 0.036), lv + 11, 1.5);
  for (const sd of [-1, 1]) c.H(E(sd * 0.062, -0.795, 0.03, 0.015, sd * 0.25), lv - 6, 0.7);
  const nose = new Path2D();
  nose.moveTo(x - 0.02 * s, y - 0.76 * s); nose.lineTo(x + 0.02 * s, y - 0.76 * s); nose.lineTo(x, y - 0.738 * s); nose.closePath();
  c.H(nose, lv + 22, 0.6);
  if (snowy) {
    const hd = E(0, -0.915, 0.085, 0.02);
    c.H(hd, 40, 1.2, "lighter"); c.M(hd, "#e00080");
    for (const sd of [-1, 1]) { const hn = E(sd * 0.2, -0.385, 0.07, 0.016); c.H(hn, 30, 1.2, "lighter"); c.M(hn, "#d00080"); }
    const pw = E(0, -0.065, 0.13, 0.012); c.H(pw, 26, 1, "lighter"); c.M(pw, "#c00080");
  }
}
// an irregular snow cap sitting on a horizontal edge at y from x..x+w, up to hgt tall
function capPath(x, y, w, hgt, seed, over = 2) {
  const R = K.rng("cap" + seed);
  const p = new Path2D();
  p.moveTo(x - over, y + 1.5);
  const n = Math.max(4, Math.round(w / 10));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const e = Math.sin(u * Math.PI);
    p.lineTo(x - over + (w + over * 2) * u, y - hgt * (0.25 + 0.75 * Math.pow(e, 0.35)) * (0.75 + R() * 0.35));
  }
  p.lineTo(x + w + over, y + 1.5);
  for (let i = n; i >= 0; i--) p.lineTo(x - over + (w + over * 2) * (i / n), y + hgt * 0.18 * R() + 0.6);
  p.closePath();
  return p;
}
function snowCap(c, x, y, w, hgt, seed, base = 150) {
  const p = capPath(x, y, w, hgt, seed);
  c.A(p);
  c.H(p, base + 40, 1.2);
  c.H(p, 30, hgt * 0.5, "lighter");
  c.M(p, "#ff0080");
}

// ---- the gate (frame + two door leaves) -----------------------------------------------------------------------
const GW = 640, GH = 900, GM = 16; // gate units; GM = sprite margin each side
const P = 120; // pillar width
const LEDGES = (() => {
  const out = [];
  for (const x0 of [0, 520]) {
    out.push([x0 - 12, 150, 144]);
    for (let k = 0; k < 6; k++) out.push([x0 + 10, 270 + k * 102 + 24, 100]);
    out.push([x0 - 10, GH - 70, P + 20]);
  }
  return out;
})();
function* paintFrame(c) {
  const { h } = c;
  for (const g of [c.h, c.a, c.m]) g.translate(GM, 0);
  const R = K.rng("gateblocks");
  for (const x0 of [0, GW - P]) {
    const shaft = rectP(x0, 110, P, GH - 110);
    c.A(shaft);
    c.H(shaft, 100, 2.5);
    for (let y = 184, row = 0; y < GH - 70; y += 66, row++) {
      const split = row % 2 ? [0, 0.5, 1] : [0, 1];
      for (let s = 0; s < split.length - 1; s++) {
        const bx = x0 + split[s] * P, bw = (split[s + 1] - split[s]) * P;
        const tone = 128 + Math.round((R() - 0.5) * 70);
        c.M(rectP(bx, y, bw, 66), `rgb(0,0,${tone})`);
        h.save(); h.globalCompositeOperation = "multiply"; h.strokeStyle = "rgb(150,150,150)"; h.lineWidth = 2.2; h.strokeRect(bx + 1, y, bw - 2, 66); h.restore();
      }
    }
    yield;
    const pl = rectP(x0 - 10, GH - 70, P + 20, 70);
    c.A(pl); c.H(pl, 150, 2.5);
    c.H(rectP(x0 - 10, GH - 70, P + 20, 10), 175, 2, "source-over");
    const cap = rectP(x0 - 12, 150, P + 24, 34);
    c.A(cap); c.H(cap, 158, 2);
    c.H(rectP(x0 - 12, 168, P + 24, 4), 120, 1);
    // cat-ear finials (low, broad: ears, not horns)
    const fin = new Path2D();
    fin.moveTo(x0 + 6, 152); fin.lineTo(x0 + 30, 100); fin.lineTo(x0 + 58, 152); fin.closePath();
    fin.moveTo(x0 + 62, 152); fin.lineTo(x0 + 90, 100); fin.lineTo(x0 + 114, 152); fin.closePath();
    c.A(fin); c.H(fin, 128, 3);
    const fin2 = new Path2D();
    fin2.moveTo(x0 + 20, 148); fin2.lineTo(x0 + 31, 116); fin2.lineTo(x0 + 44, 148); fin2.closePath();
    fin2.moveTo(x0 + 76, 148); fin2.lineTo(x0 + 89, 116); fin2.lineTo(x0 + 100, 148); fin2.closePath();
    c.H(fin2, 96, 2.5);
    yield;
    // stacked cats in arched niches
    for (let k = 0; k < 6; k++) {
      const cy = 270 + k * 102;
      const ni = new Path2D();
      ni.moveTo(x0 + 16, cy + 24); ni.lineTo(x0 + 16, cy - 40); ni.arc(x0 + P / 2, cy - 40, P / 2 - 16, Math.PI, 0); ni.lineTo(x0 + P - 16, cy + 24); ni.closePath();
      c.H(ni, 58, 2.5);
      carveCat(c, x0 + P / 2, cy + 22, 72, 122);
      const sill = rectP(x0 + 10, cy + 24, P - 20, 9);
      c.H(sill, 168, 1.4);
      snowCap(c, x0 + 10, cy + 24, P - 20, 7, "s" + x0 + k);
      yield;
    }
    snowCap(c, x0 - 12, 150, P + 24, 9, "cap" + x0);
    snowCap(c, x0 - 10, GH - 70, P + 20, 8, "pl" + x0);
  }
  // the lintel, the attic band and the arch between the pillars
  const lin = rectP(-GM + 4, 0, GW + GM * 2 - 8, 120);
  c.A(lin); c.H(lin, 105, 2);
  c.H(rectP(-GM + 4, 0, GW + GM * 2 - 8, 16), 170, 2);
  c.H(rectP(-GM + 4, 104, GW + GM * 2 - 8, 16), 152, 1.6);
  c.H(rectP(20, 30, GW - 40, 66), 78, 2.5);
  for (let k = 0; k < 7; k++) carveCat(c, 60 + k * 87, 94, 58, 120, false);
  yield;
  snowCap(c, -GM + 4, 104, GW + GM * 2 - 8, 6, "lin");
  const att = rectP(P, 120, GW - 2 * P, 72);
  c.A(att); c.H(att, 96, 2);
  c.H(rectP(P + 30, 132, GW - 2 * P - 60, 46), 76, 2.5);
  const arch = new Path2D();
  arch.moveTo(P, 302); arch.lineTo(P, 190); arch.lineTo(GW - P, 190); arch.lineTo(GW - P, 302);
  arch.quadraticCurveTo(GW / 2, 226, P, 302); arch.closePath();
  c.A(arch); c.H(arch, 112, 2.5);
  h.save(); h.globalCompositeOperation = "multiply"; h.strokeStyle = "rgb(165,165,165)"; h.lineWidth = 2;
  for (let k = 1; k < 8; k++) {
    const u = k / 8, ax = K.lerp(P, GW - P, u), ay = 302 - Math.sin(u * Math.PI) * 38;
    h.beginPath(); h.moveTo(ax, ay); h.lineTo(GW / 2 + (ax - GW / 2) * 1.25, 196); h.stroke();
  }
  h.restore();
  // the carved cat face at the keystone: a round face, small ears, cheeks, muzzle
  const face = new Path2D();
  face.ellipse(GW / 2, 242, 46, 34, 0, 0, TAU);
  face.moveTo(GW / 2 - 44, 230); face.lineTo(GW / 2 - 40, 200); face.lineTo(GW / 2 - 16, 212); face.closePath();
  face.moveTo(GW / 2 + 44, 230); face.lineTo(GW / 2 + 40, 200); face.lineTo(GW / 2 + 16, 212); face.closePath();
  c.H(face, 150, 2.5);
  c.H(ellP(GW / 2, 252, 20, 13), 172, 2);
  for (const sd of [-1, 1]) c.H(ellP(GW / 2 + sd * 17, 236, 8, 4, sd * 0.25), 118, 1);
  c.H(ellP(GW / 2, 246, 5, 3.5), 182, 1);
  snowCap(c, P, 190, GW - 2 * P, 7, "arch", 110);
}
// two resolutions: "far" (shots seen through snow and haze or out of focus) and "near" (the push)
const GATE_F = ["gate:f", () => reliefGen(GW + GM * 2, GH, 0.6, paintFrame, { depth: 0.2 })];
const GATE_N = ["gate:n", () => reliefGen(GW + GM * 2, GH, 1.0, paintFrame, { depth: 0.2 })];
const DW = 200, DH = 600;
function* paintDoor(c) {
  const slab = rectP(0, 0, DW, DH);
  c.A(slab); c.H(slab, 120, 3);
  const up = rectP(24, 24, DW - 48, DH * 0.28), lo = rectP(24, DH * 0.34, DW - 48, DH * 0.6);
  c.H(up, 86, 3); c.H(lo, 86, 3);
  c.H(rectP(30, 30, DW - 60, DH * 0.28 - 12), 76, 4);
  c.H(rectP(30, DH * 0.34 + 6, DW - 60, DH * 0.6 - 12), 76, 4);
  yield;
  // the great carved cat on the lower panel, and a paw in the upper
  carveCat(c, DW * 0.5, DH * 0.94 - 4, 236, 132);
  yield;
  const paw = new Path2D();
  for (let k = 0; k < 4; k++) { const a = -0.95 + k * 0.63; paw.moveTo(DW * 0.5 + Math.cos(a - Math.PI / 2) * 30 + 9, DH * 0.17 + Math.sin(a - Math.PI / 2) * 30); paw.ellipse(DW * 0.5 + Math.cos(a - Math.PI / 2) * 30, DH * 0.17 + Math.sin(a - Math.PI / 2) * 30 + 6, 9, 11, a, 0, TAU); }
  paw.moveTo(DW * 0.5 + 22, DH * 0.2); paw.ellipse(DW * 0.5, DH * 0.2, 22, 17, 0, 0, TAU);
  c.H(paw, 120, 2.2);
  snowCap(c, 24, 24 + DH * 0.28, DW - 48, 9, "dp1", 86);
  snowCap(c, 24, DH * 0.94, DW - 48, 12, "dp2", 86);
  // wrought-iron ring pull on its boss, near the meeting edge
  const bx = DW - 30, by = DH * 0.5;
  const boss = ellP(bx, by, 13, 13);
  c.H(boss, 165, 1.5); c.M(boss, "#00ff80");
  c.h.save(); c.h.strokeStyle = "rgb(205,205,205)"; c.h.lineWidth = 5; c.h.beginPath(); c.h.arc(bx, by + 22, 18, 0, TAU); c.h.stroke(); c.h.restore();
  c.m.save(); c.m.strokeStyle = "#00ff80"; c.m.lineWidth = 6; c.m.beginPath(); c.m.arc(bx, by + 22, 18, 0, TAU); c.m.stroke(); c.m.restore();
  c.a.save(); c.a.strokeStyle = "#fff"; c.a.lineWidth = 6; c.a.beginPath(); c.a.arc(bx, by + 22, 18, 0, TAU); c.a.stroke(); c.a.restore();
}
const DOOR_F = ["door:f", () => reliefGen(DW, DH, 0.9, paintDoor, { depth: 0.24, texK: 2.5 })];
const DOOR_N = ["door:n", () => reliefGen(DW, DH, 1.5, paintDoor, { depth: 0.24, texK: 2.5 })];
const mirrorSpec = (srcSpec, key) => [key, function* () {
  const s = yield* sub(srcSpec);
  return yield* bands(s, (g, y, h) => { g.setTransform(-1, 0, 0, 1, s.width, 0); g.drawImage(s, 0, y, s.width, h, 0, y, s.width, h); });
}];
const DOORM_F = mirrorSpec(DOOR_F, "doorM:f"), DOORM_N = mirrorSpec(DOOR_N, "doorM:n");
// draw a door leaf hinged at hx, swung `ang` radians away from camera, in vertical strips (perspective)
function drawLeaf(g, spr, hx, top, w, h, side, ang, shade) {
  const N = 20;
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const foc = 4.2;
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N;
    const p0 = foc / (foc + u0 * sn), p1 = foc / (foc + u1 * sn);
    const x0 = hx + side * u0 * cs * w * p0, x1 = hx + side * u1 * cs * w * p1;
    const sy = (side > 0 ? u0 : 1 - u1);
    const pm = (p0 + p1) / 2;
    const hh = h * pm, yt = top + (h - hh) * 0.62;
    const sx0 = Math.min(x0, x1), sw = Math.abs(x1 - x0) + 0.6;
    g.drawImage(spr, sy * spr.width, 0, spr.width / N, spr.height, sx0, yt, sw, hh);
  }
  if (shade > 0.01) {
    g.save();
    g.globalAlpha *= shade;
    g.fillStyle = "#2a2c44";
    g.beginPath();
    const xe = hx + side * cs * w * (foc / (foc + sn));
    const he = h * foc / (foc + sn);
    g.moveTo(hx, top); g.lineTo(xe, top + (h - he) * 0.62); g.lineTo(xe, top + (h - he) * 0.62 + he); g.lineTo(hx, top + h); g.closePath();
    g.fill();
    g.restore();
  }
}
// draw the gate: (cx, baseY) bottom centre, scale s, open 0..1, haze 0..1
function gate(g, cx, baseY, s, o = {}) {
  const open = cl01(o.open || 0);
  const haze = o.haze || 0, near = !!o.near, nk = near ? "n" : "f";
  const fr = hazed(near ? GATE_N : GATE_F, "frame" + nk, haze), dl = hazed(near ? DOOR_N : DOOR_F, "doorL" + nk, haze), dr = hazed(near ? DOORM_N : DOORM_F, "doorR" + nk, haze);
  const dx0 = cx - 200 * s, dy0 = baseY - DH * s;
  if (open > 0) {
    // what is beyond: brilliant, warm-white, hottest at the centre (near-clipped so the lens turns it into a light)
    const lg = g.createLinearGradient(dx0, 0, dx0 + 400 * s, 0);
    lg.addColorStop(0, "#f6e8d8"); lg.addColorStop(0.4, "#fff8ee"); lg.addColorStop(0.5, "#ffffff"); lg.addColorStop(0.6, "#fff8ee"); lg.addColorStop(1, "#f6e8d8");
    g.fillStyle = lg;
    g.fillRect(dx0, dy0, 400 * s, DH * s);
  } else {
    g.fillStyle = "#585a72";
    g.fillRect(cx - 4 * s, dy0, 8 * s, DH * s);
  }
  const ang = open * 1.45;
  drawLeaf(g, dl, dx0, dy0, 200 * s, DH * s, 1, ang, open * 0.7);
  drawLeaf(g, dr, cx + 200 * s, dy0, 200 * s, DH * s, -1, ang, open * 0.7);
  if (open <= 0) { g.fillStyle = K.rgba(K.mix("#3a3c52", FOG, haze), 0.8); g.fillRect(cx - 0.8 * s, dy0, 1.6 * s, DH * s); }
  g.drawImage(fr, cx - (GW / 2 + GM) * s, baseY - GH * s, (GW + GM * 2) * s, GH * s);
}

// ---- stone wayposts along the path to the gate (a sitting-cat bollard) --------------------------------------------
function* paintPost(c) {
  const p = new Path2D();
  p.moveTo(8, 140); p.lineTo(10, 46); p.quadraticCurveTo(30, 24, 50, 46); p.lineTo(52, 140); p.closePath();
  c.A(p); c.H(p, 110, 4);
  const ears = new Path2D();
  ears.moveTo(13, 42); ears.lineTo(17, 26); ears.lineTo(27, 33); ears.closePath();
  ears.moveTo(47, 42); ears.lineTo(43, 26); ears.lineTo(33, 33); ears.closePath();
  c.A(ears); c.H(ears, 118, 2);
  c.H(rectP(8, 120, 44, 20), 140, 2);
  const cap = capPath(12, 38, 36, 8, "post");
  c.A(cap); c.H(cap, 190, 2); c.M(cap, "#ff0080");
  const drift = new Path2D(); drift.ellipse(30, 140, 34, 12, 0, Math.PI, TAU);
  c.A(drift); c.H(drift, 150, 4); c.M(drift, "#ff0080");
  yield;
}
const POST = ["post", () => reliefGen(60, 140, 1.5, paintPost, { depth: 0.22 })];

// ---- perspective snowfield (baked per camera, half resolution) ---------------------------------------------------
// camH = eye height (m), hz = horizon y, f = focal (px); covers screen x -40..1000, y hz..590.
// o.prints = {x, zEnd, step, side}: the overlay variant that holds only the footprint trail (alpha elsewhere 0).
const L_SNOW = (() => { const v = [-0.42, 0.74, -0.52]; const l = Math.hypot(v[0], v[1], v[2]); return v.map((a) => a / l); })();
function snowShade(wx, z, hgt, e, cav, fade, F, hazeDist, gx, gy, out) {
  const h0 = hgt(wx, z), hxv = hgt(wx + e, z), hzv = hgt(wx, z + e);
  let nx = -2 * (hxv - h0) / e, ny = 1, nz = -2 * (hzv - h0) / e;
  const nl = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= nl; ny /= nl; nz /= nl;
  // overcast: sky dome + a soft brighter patch up-left behind the camera
  const sky = (0.5 + 0.5 * ny) * (1 - cav * 0.45);
  const dif = Math.max(0, L_SNOW[0] * nx + L_SNOW[1] * ny + L_SNOW[2] * nz) * (1 - cav * 0.3);
  const lum = cl01(0.52 * sky + 0.48 * dif / 0.74);
  const k = Math.pow(lum, 3.2);
  let r = 0.55 + (0.93 - 0.55) * k, g = 0.6 + (0.94 - 0.6) * k, b = 0.82 + (0.985 - 0.82) * k;
  // the floor of a hole sees only the sky straight above: bluer
  r -= cav * 0.07; g -= cav * 0.045;
  const gr = (hsh(gx, gy, 3) - 0.5) * 0.02 * fade;
  r += gr; g += gr; b += gr;
  const hz2 = 1 - Math.exp(-z / hazeDist);
  r += (F[0] - r) * hz2; g += (F[1] - g) * hz2; b += (F[2] - b) * hz2;
  out[0] = r * 255; out[1] = g * 255; out[2] = b * 255;
}
function* snowGen(hz, camH, o) {
  const f = o.f || 960, W = 520, H = Math.ceil((590 - hz) / 2);
  const F = K.parseColor(o.fog || FOG).map((v) => v / 255);
  const hazeDist = o.hazeDist || 85, offX = o.offX || 0;
  const pr = o.prints;
  const drift = (wx, z, fade) => {
    const rid = 1 - Math.abs(vn(wx * 0.55 + z * 0.18, z * 2.6 - wx * 0.4, 25));
    return fbm(wx * 0.07, z * 0.09, 4, 17) * 0.75 + vn(wx * 0.33 + z * 0.05, z * 1.25, 21) * 0.05 * fade + vn(wx * 1.7, z * 2.2, 23) * 0.012 * fade + rid * rid * rid * rid * 0.03 * fade;
  };
  // one boot print: a bowl with a pushed-up rim and a tread pattern in its floor
  const print = (wx, z) => {
    if (!pr) return 0;
    let best = 0;
    const k0 = Math.round((pr.zEnd - z) / pr.step);
    for (let k = k0 - 1; k <= k0 + 1; k++) {
      if (k < 0) continue;
      const zc = pr.zEnd - k * pr.step, side = k % 2 ? 1 : -1;
      const xc = pr.x + side * pr.side + Math.sin(zc * 0.7) * 0.06;
      const dx = (wx - xc) / 0.046, dz = (z - zc) / 0.115;
      const r = Math.sqrt(dx * dx + dz * dz);
      if (r > 1.7) continue;
      let h = -0.045 * (1 - sstep(0.72, 1.0, r)) + 0.012 * Math.exp(-((r - 1.14) / 0.2) * ((r - 1.14) / 0.2));
      if (r < 0.9) h += 0.0035 * Math.sin((z - zc) * 140) * (1 - r);
      if (Math.abs(h) > Math.abs(best)) best = h;
    }
    return best;
  };
  return yield* pix(W, H, (xh, yh, out) => {
    const x = xh * 2 + 0.5, y = yh * 2 + 0.5;
    const z = (camH * f) / (y + 0.5);
    const wx = ((x - 40 - 480) * z) / f + offX;
    const fade = 1 / (1 + z * 0.035);
    if (pr) {
      const p0 = print(wx, z);
      if (Math.abs(p0) < 0.0008) { out[3] = 0; return; }
      const e = Math.max(0.0035, (1.4 * z) / f);
      const hg = (a, b) => drift(a, b, fade) + print(a, b);
      snowShade(wx, z, hg, e, cl01(-p0 / 0.04), fade, F, hazeDist, xh, yh, out);
      out[3] = 255 * sstep(0.0008, 0.006, Math.abs(p0));
      return;
    }
    const e = 0.03 + z * 0.004;
    snowShade(wx, z, (a, b) => drift(a, b, fade), e, 0, fade, F, hazeDist, xh, yh, out);
  });
}
const snowSpec = (key, hz, camH, o = {}) => ["snow:" + key, () => snowGen(hz, camH, o)];
const snowPlane = (key, hz, camH, o = {}) => run(snowSpec(key, hz, camH, o));
// draw a baked snowfield at (-40, hz) full size, plus twinkling crystal glints near the camera
function drawSnow(g, key, hz, camH, o = {}, t = 0) {
  const c = snowPlane(key, hz, camH, o);
  g.drawImage(c, -40, hz, 1040, c.height * 2);
  const n = o.glints == null ? 46 : o.glints;
  const spr = flakeSprite(0);
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const y = hz + 12 + Math.pow(K.hash(i, 51), 0.6) * (560 - hz - 12);
    const x = K.hash(i, 52) * 1000 - 20;
    const tw = Math.pow(Math.max(0, Math.sin(t * (1.3 + K.hash(i, 53)) + i * 2.1 + x * 0.004)), 14);
    if (tw < 0.05) continue;
    const r = 0.5 + (y - hz) / 150;
    g.globalAlpha = tw * 0.9;
    g.drawImage(spr, x - r * 2, y - r * 2, r * 4, r * 4);
    if (r > 1.6) { g.globalAlpha = tw * 0.35; g.drawImage(spr, x - r * 5, y - r * 0.5, r * 10, r); } // a tiny star streak
  }
  g.restore();
}
// overcast sky above the plain: graded dome falling smoothly to the haze colour at the horizon
function snowSky(g, W, H, hz, t) {
  const sg = g.createLinearGradient(0, hz - 520, 0, hz);
  sg.addColorStop(0, "#b4b8d8");
  sg.addColorStop(0.45, "#d0d3ea");
  sg.addColorStop(0.82, "#e3e5f4");
  sg.addColorStop(1, "#eef0ff");
  g.fillStyle = sg;
  g.fillRect(-W, hz - 2000, W * 3, 2002);
  const pat = K.texPattern(g, "cloud", { seed: 41, cover: 0.55, size: 256 });
  if (pat.setTransform && typeof DOMMatrix !== "undefined") pat.setTransform(new DOMMatrix([3.2, 0, 0, 1.1, -t * 4, hz - 380]));
  g.save();
  g.globalAlpha = 0.14;
  g.fillStyle = pat;
  g.fillRect(-W, hz - 600, W * 3, 480);
  g.restore();
}
// wisps of low cloud (fbm density, lit from above, a little darker underneath)
const WISP = ["wisp", () => pix(384, 120, (x, y, out) => {
    const u = x / 384, v = y / 120;
    const env = Math.sin(Math.PI * u) * Math.exp(-Math.pow((v - 0.55) / 0.26, 2));
    const d = cl01((fbm(u * 5, v * 2.2, 5, 61) * 0.5 + 0.5) * 1.6 * env - 0.28) * 1.6;
    if (d <= 0.004) { out[3] = 0; return; }
    const lit = 0.985 + 0.02 * (1 - v) - 0.02 * d;
    out[0] = 234 * lit; out[1] = 236 * lit; out[2] = 248 * lit;
    out[3] = 255 * cl01(d);
  })];
const wispSprite = () => run(WISP);
// snow drifted against the gate's foot: an fbm bank, lit on top, blue on its shaded front, hazed for 70 m
const DRIFT = ["drift", () => pix(420, 40, (x, y, out) => {
    const u = x / 420;
    const top = 40 - (13 + (fbm(u * 7, 0.3, 4, 71) * 0.5 + 0.5) * 18 + Math.exp(-Math.pow((u - 0.5) / 0.16, 2)) * -6 + (Math.exp(-Math.pow((u - 0.13) / 0.08, 2)) + Math.exp(-Math.pow((u - 0.87) / 0.08, 2))) * 7);
    const a = cl01((y - top) / 2.2);
    if (a <= 0) { out[3] = 0; return; }
    const s = fbm(u * 7 + 0.004, 0.3, 4, 71) - fbm(u * 7 - 0.004, 0.3, 4, 71);
    const crest = Math.exp(-(y - top) / 4);
    const k = cl01(0.62 + s * 9 * crest + crest * 0.25 - (y - top) / 90);
    const hz = 0.38;
    const r = 176 + k * 66, g = 182 + k * 62, b = 214 + k * 36;
    out[0] = r + (233 - r) * hz; out[1] = g + (235 - g) * hz; out[2] = b + (248 - b) * hz;
    out[3] = 255 * a * (1 - cl01((u < 0.04 ? 0.04 - u : u > 0.96 ? u - 0.96 : 0) * 25));
  })];
const driftSprite = () => run(DRIFT);

// ================================================================================================================
// SHOT 1 [0-12] ultra-wide: the white plain, the gate rising into cloud, you and Sir Whiskers walking (from behind)
// ================================================================================================================
const S1 = { hz: 352, camH: 1.4, f: 960 };
const KX1 = -0.35, KZ1 = 23.5;
const S1PR = { x: KX1, zEnd: KZ1, step: 0.33, side: 0.09 };
const proj1 = (x, z) => [480 + (x * S1.f) / z, S1.hz + (S1.camH * S1.f) / z, S1.f / z];
function shotPlain(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 0, 12.6));
  K.withCamera(g, W, H, { x: 480, y: K.lerp(268, 262, p), zoom: K.lerp(1.03, 1.08, p), shakeT: t, shakeAmt: 0.5 }, () => {
    const hz = S1.hz;
    snowSky(g, W, H, hz, t);
    drawSnow(g, "s1", hz, S1.camH, {}, t);
    // the gate 70 m away and 60 m tall, washed by the snowy air; it hides half the sky from the snow at its foot
    const gz = 70;
    const [, gy] = proj1(0, gz);
    const sh = g.createLinearGradient(0, gy - 2, 0, gy + 16);
    sh.addColorStop(0, "rgba(150,158,200,0.4)"); sh.addColorStop(1, "rgba(150,158,200,0)");
    g.fillStyle = sh; g.fillRect(480 - 300, gy - 2, 600, 18);
    gate(g, 480, gy, 0.8, { haze: 0.42 });
    // cavity occlusion where the stone meets the snow, then the drifts banked against it
    const ao = g.createLinearGradient(0, gy - 22, 0, gy);
    ao.addColorStop(0, "rgba(120,126,170,0)"); ao.addColorStop(1, "rgba(120,126,170,0.35)");
    g.fillStyle = ao; g.fillRect(480 - 272, gy - 22, 544, 22);
    g.drawImage(driftSprite(), 480 - 310, gy - 30, 620, 42);
    // haze thickens with height and the cloud bank swallows the top of the gate
    const hg = g.createLinearGradient(0, gy - 30, 0, 20);
    hg.addColorStop(0, "rgba(226,228,244,0)"); hg.addColorStop(0.45, "rgba(226,228,244,0.32)"); hg.addColorStop(0.8, "rgba(222,225,242,0.78)"); hg.addColorStop(1, "rgba(220,223,241,1)");
    g.fillStyle = hg; g.fillRect(-W, -200, W * 3, gy - 30 + 200);
    const ws = wispSprite();
    for (let i = 0; i < 5; i++) {
      const wy = 30 + i * 34 + Math.sin(i * 2.3) * 8, ww = 520 + K.hash(i, 81) * 360;
      const wx = ((K.hash(i, 82) * 1400 + t * (6 + i * 2.5)) % 1500) - 520;
      g.globalAlpha = 0.85 - i * 0.12;
      g.drawImage(ws, wx, wy - ww * 0.06, ww, ww * 0.16);
    }
    g.globalAlpha = 1;
    // far snow between us and the gate: the reason it is so pale
    snow(g, W, H, t, { count: 230, seed: 3, speed: 9, size: 0.55, alpha: 0.7, drift: 6, wind: 2, blur: 1.2 });
    K.fog(g, W, H, { y: gy - 4, h: 40, color: "#eef0ff", alpha: 0.75, t, seed: 5 });
    // wayposts along the path: the scale ruler of the shot (contact occlusion where they stand in the snow)
        for (let i = 7; i >= 1; i--) {
      const z = 9 + i * 8;
      for (const sd of [-1, 1]) {
        const [x, y, s] = proj1(sd * 4.2 + K.hash(i, sd + 4) * 0.4, z);
        const ph = 1.4 * s, pw = ph * (60 / 140);
        const hzA = 1 - Math.exp(-z / 75);
        K.shadowBlob(g, x + ph * 0.04, y, pw * 0.85, ph * 0.05, { alpha: 0.32 * (1 - hzA), color: "#4a5488" });
        K.shadowBlob(g, x, y - ph * 0.01, pw * 0.5, ph * 0.025, { alpha: 0.5 * (1 - hzA), color: "#3a4478" });
        g.drawImage(hazed(POST, "post", hzA), x - pw / 2, y - ph * 0.97, pw, ph);
      }
    }
    // the two of you walking away toward it; your boot prints run back toward the camera
    const wp = K.seg(t, 0, 12.6);
    const kz = K.lerp(15, KZ1, wp);
    const [kx, ky, ks] = proj1(KX1, kz);
    {
      const pc = snowPlane("s1p", hz, S1.camH, { prints: S1PR });
      g.save();
      g.beginPath(); g.rect(-100, ky + 1, 1200, 400); g.clip();
      g.drawImage(pc, -40, hz, 1040, pc.height * 2);
      g.restore();
    }
    const kh = 1.12 * ks;
    K.shadowBlob(g, kx, ky, kh * 0.15, kh * 0.028, { alpha: 0.38, color: "#3a4478" });
    K.drawPerson(g, kx, ky, kh, { view: "back", walk: true, phase: t * 0.75, t, hood: true, bell: true, shadow: false,
      light: { x: kx - 260, y: ky - 900, color: "#eef0ff", strength: 0.75, z: 0.25 }, ambient: "#9ea4c6" });
    // Sir Whiskers: a ghost leaves no prints
    const [sx, sy, ss] = proj1(KX1 + 0.62, kz + 0.1);
    sirWhiskers(g, sx, sy, 0.42 * ss, { pose: "walk", phase: t * 0.6, facing: 1, headTurn: -0.6, sx: 0.55 }, "walk");
    snow(g, W, H, t, { count: 90, seed: 9, speed: 24, size: 1.5, alpha: 0.95, drift: 14, wind: 4, blur: 2 });
  });
  snow(g, W, H, t, { count: 9, seed: 21, speed: 58, size: 9, alpha: 0.6, soft: true, drift: 30, wind: 8, blur: 1.3 });
}

// ================================================================================================================
// SHOT 2 [12-20] the gatekeeper in a party hat (camera at cat height, the gate soft behind)
// ================================================================================================================
function partyHat(g, x, y, s, tilt) {
  const spr = K.sprite("f17hat", 80, 110, (h) => {
    const cx = 40, by = 96, hh = 78, w = 40;
    const cone = new Path2D();
    cone.moveTo(cx - w / 2, by); cone.lineTo(cx, by - hh); cone.lineTo(cx + w / 2, by); cone.quadraticCurveTo(cx, by + w * 0.2, cx - w / 2, by); cone.closePath();
    h.save(); h.clip(cone);
    h.fillStyle = "#c44a88"; h.fillRect(0, 0, 80, 110);
    h.strokeStyle = "#3aa8b0"; h.lineWidth = 6;
    for (let k = 0; k < 6; k++) { h.beginPath(); h.moveTo(cx - 40, by - 6 - k * 15); h.lineTo(cx + 40, by - 22 - k * 15); h.stroke(); }
    h.fillStyle = "#e0c060";
    for (let k = 0; k < 14; k++) { h.beginPath(); h.arc(cx - 16 + K.hash(k, 3) * 32, by - 8 - K.hash(k, 4) * 62, 1.4, 0, TAU); h.fill(); }
    K.texRect(h, "fabric", 0, 0, 80, 110, { scale: 60, alpha: 0.2, mode: "multiply" });
    const sg = h.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    sg.addColorStop(0, "rgba(255,255,255,0.16)"); sg.addColorStop(0.3, "rgba(255,255,255,0.05)"); sg.addColorStop(0.65, "rgba(30,10,40,0.24)"); sg.addColorStop(1, "rgba(30,10,40,0.52)");
    h.fillStyle = sg; h.fillRect(0, 0, 80, 110);
    // a crease and a slightly crushed paper tip
    h.strokeStyle = "rgba(40,10,40,0.25)"; h.lineWidth = 1; h.beginPath(); h.moveTo(cx + 3, by - hh + 8); h.lineTo(cx + 9, by + 2); h.stroke();
    h.restore();
    h.strokeStyle = "rgba(255,240,250,0.45)"; h.lineWidth = 1.2;
    h.beginPath(); h.moveTo(cx - w / 2, by); h.quadraticCurveTo(cx, by + w * 0.2, cx + w / 2, by); h.stroke();
    const R = K.rng("pom");
    h.lineCap = "round";
    for (let i = 0; i < 70; i++) {
      const a = R() * TAU, l = 4 + R() * 6;
      h.strokeStyle = R() < 0.5 ? "#e8c860" : R() < 0.5 ? "#b88a2a" : "#f6e8b0";
      h.lineWidth = 0.9;
      h.beginPath(); h.moveTo(cx, by - hh); h.lineTo(cx + Math.cos(a) * l, by - hh + Math.sin(a) * l * 0.9); h.stroke();
    }
  });
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  g.drawImage(spr, -s * 0.5, -s * 1.2, s, s * 1.375);
  g.restore();
}
// the elastic: from the brim down behind the cheek and under the chin (drawn before the hat, after the cat)
function hatElastic(g, x, y, s, tilt, chinX, chinY) {
  g.save();
  g.lineCap = "round";
  const ca = Math.cos(tilt), sa = Math.sin(tilt);
  const ex = (u) => [x + u * s * ca, y + u * s * sa];
  const [ax, ay] = ex(-0.22), [bx, by] = ex(0.22);
  g.strokeStyle = "rgba(40,40,60,0.35)"; g.lineWidth = Math.max(0.7, s * 0.03);
  g.beginPath(); g.moveTo(ax, ay + 0.6); g.quadraticCurveTo(chinX - s * 0.1, chinY + s * 0.12, chinX, chinY + 0.8); g.quadraticCurveTo(chinX + s * 0.12, chinY + s * 0.1, bx, by + 0.6); g.stroke();
  g.strokeStyle = "rgba(236,232,240,0.85)"; g.lineWidth = Math.max(0.5, s * 0.016);
  g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(chinX - s * 0.1, chinY + s * 0.1, chinX, chinY); g.quadraticCurveTo(chinX + s * 0.12, chinY + s * 0.08, bx, by); g.stroke();
  g.restore();
}
// fur clumps and darker guard hairs (alpha overlay painted source-atop onto the cat)
const FUR = ["fur", () => pix(160, 200, (x, y, out) => {
    const u = x / 160, v = y / 200;
    const clump = fbm(u * 10 + v * 1.5, v * 4.5, 3, 91);
    const hair = vn(u * 78 + vn(u * 6, v * 6, 94) * 3, v * 7, 93);
    const val = clump * 0.6 + hair * 0.45;
    if (val < -0.12) { out[0] = 28; out[1] = 29; out[2] = 36; out[3] = 255 * cl01((-val - 0.12) * 1.5) * 0.6; }
    else if (val > 0.22) { out[0] = 214; out[1] = 216; out[2] = 226; out[3] = 255 * cl01((val - 0.22) * 1.2) * 0.3; }
    else out[3] = 0;
  })];
const furTex = () => run(FUR);
const S2 = { hz: 300, camH: 0.32 };
function keeperState(t) {
  const sees = K.smooth(K.seg(t, 15.4, 16.2));
  const yawn = K.env(t, 17.0, 18.05, 0.28, 0.3);
  const k = K.seg(t, 18.3, 19.5);
  // a weighted sidestep: a small push back onto the haunches, then the body goes, the head last
  const w = k < 0.14 ? -0.05 * Math.sin((k / 0.14) * Math.PI) : K.ease.inOut((k - 0.14) / 0.86);
  return { sees, yawn, k, dx: -150 * w, up: t >= 18.3 };
}
function shotKeeper(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 12, 20));
  const pin = K.ease.inOut(K.seg(t, 14.6, 15.9)) * (1 - K.ease.inOut(K.seg(t, 18.4, 19.7)));
  const cx = 360, cy = 452, S = 66;
  const bg = K.layer(W, H, "f17:kbg");
  K.withCamera(bg.g, W, H, { x: K.lerp(480, 440, pin), y: K.lerp(K.lerp(290, 284, p), 330, pin), zoom: K.lerp(1.03, 1.06, p) * K.lerp(1, 1.18, pin), shakeT: t, shakeAmt: 0.4 }, () => {
    const b = bg.g;
    snowSky(b, W, H, S2.hz, t);
    gate(b, 500, S2.hz + 10, 1.5, { haze: 0.12 });
    drawSnow(b, "s2", S2.hz + 10, S2.camH, { hazeDist: 60, glints: 0 }, t);
    K.fog(b, W, H, { y: S2.hz + 8, h: 60, color: FOG, alpha: 0.85, t, seed: 5 });
    snow(b, W, H, t, { count: 160, seed: 13, speed: 9, size: 0.6, alpha: 0.6, drift: 6, wind: 2, blur: 1.2 });
  });
  K.dof(g, bg.canvas, 4.5);
  K.withCamera(g, W, H, { x: K.lerp(480, cx + 40, pin), y: K.lerp(K.lerp(290, 284, p), 400, pin), zoom: K.lerp(1.03, 1.06, p) * K.lerp(1, 1.7, pin), shakeT: t, shakeAmt: 0.6 }, () => {
    {
      const c = snowPlane("s2", S2.hz + 10, S2.camH, { hazeDist: 60, glints: 0 });
      const y0 = S2.hz + 10, ya = 400, yb = 430;
      g.save(); g.globalAlpha = 0.5; g.drawImage(c, 0, (ya - y0) / 2, c.width, (yb - ya) / 2, -40, ya, 1040, yb - ya); g.restore();
      g.drawImage(c, 0, (yb - y0) / 2, c.width, c.height - (yb - y0) / 2, -40, yb, 1040, c.height * 2 - (yb - y0));
    }
    snow(g, W, H, t, { count: 70, seed: 4, speed: 14, size: 1, alpha: 0.75, drift: 10 });
    const st = keeperState(t);
    const x = cx + st.dx;
    const key = { x: x - 260, y: cy - 520, color: "#f2f2ff", strength: 0.95 };
    const light = { key, rim: { x: x + 300, y: cy - 300, color: "#dfe6ff", strength: 0.55 }, fill: "#7a82b0", ambient: "#bfc3e2", ambientK: 0.2, castShadow: 0.35, ground: "#8890c0", pupil: 0.15 };
    const coat = Object.assign({}, K.COATS.grey, { stripeAlpha: 0.75 });
    const kl = K.layer(W, H, "f17:keeper");
    const k = kl.g;
    k.setTransform(g.getTransform());
    let hx, hy, tilt, chin;
    if (!st.up) {
      const tiltH = 0.35 * (1 - st.sees) - st.yawn * 0.35;
      K.shadowBlob(g, x + 6, cy + 2, S * 0.5, S * 0.07, { alpha: 0.38, color: "#3a4478" });
      K.drawCat(k, x, cy, S, Object.assign({
        pose: "sit", facing: 1, coat, t, headTurn: K.lerp(0.2, 1, st.sees), headTilt: tiltH,
        mouth: st.yawn, ears: -st.yawn, blink: Math.max(st.yawn > 0.15 ? 1 : 0, K.env(t, 13.8, 14.1, 0.08, 0.1)), autoBlink: st.yawn < 0.05, collar: false, shadow: false,
      }, light));
      hx = x + S * K.lerp(0.2, 0.27, st.sees); hy = cy - S * (1.84 + 0.06 * tiltH);
      tilt = 0.18 - st.sees * 0.1 + st.yawn * 0.2;
      chin = [x + S * K.lerp(0.32, 0.27, st.sees), cy - S * 1.3];
    } else {
      // up on four feet, stepping out of your way; the hat lags the head a little
      const moving = st.k > 0.12 && st.k < 0.96;
      const ph = -st.dx / (S * 1.15);
      K.shadowBlob(g, x, cy + 2, S * 0.62, S * 0.07, { alpha: 0.34, color: "#3a4478" });
      K.drawCat(k, x, cy, S, Object.assign({
        pose: moving ? "walk" : "stand", phase: ph, facing: -1, coat, t, headTurn: moving ? 0.25 : K.lerp(0.25, 0.75, K.smooth(K.seg(t, 19.4, 19.9))), collar: false, shadow: false,
      }, light));
      hx = x - S * 0.84; hy = cy - S * 1.42;
      tilt = -0.28 + Math.sin(st.k * Math.PI) * 0.12;
      chin = [x - S * 0.96, cy - S * 0.92];
    }
    // fur clumps and guard hairs, a paler chest, the hat's soft shadow on the crown
    k.save();
    k.globalCompositeOperation = "source-atop";
    k.drawImage(furTex(), x - S * 1.3, cy - S * 2.3, S * 2.6, S * 2.4);
    const chx = st.up ? x - S * 0.62 : x + S * 0.26, chy = st.up ? cy - S * 0.85 : cy - S * 0.95;
    const cg = k.createRadialGradient(chx, chy, 0, chx, chy, S * 0.38);
    cg.addColorStop(0, "rgba(232,234,242,0.38)"); cg.addColorStop(1, "rgba(232,234,242,0)");
    k.fillStyle = cg; k.fillRect(chx - S * 0.4, chy - S * 0.4, S * 0.8, S * 0.8);
    const sg = k.createRadialGradient(hx + S * 0.03, hy + S * 0.04, 0, hx + S * 0.03, hy + S * 0.04, S * 0.24);
    sg.addColorStop(0, "rgba(28,30,48,0.5)"); sg.addColorStop(1, "rgba(28,30,48,0)");
    k.fillStyle = sg; k.beginPath(); k.ellipse(hx + S * 0.03, hy + S * 0.05, S * 0.26, S * 0.12, tilt, 0, TAU); k.fill();
    k.restore();
    g.save(); g.setTransform(K.pixelScale(), 0, 0, K.pixelScale(), 0, 0); g.drawImage(kl.canvas, 0, 0, W, H); g.restore();
    hatElastic(g, hx, hy, S * 0.62, tilt, chin[0], chin[1]);
    partyHat(g, hx, hy, S * 0.62, tilt);
    snowLip(g, x + (st.up ? -S * 0.3 : S * 0.25), cy + 1, S * (st.up ? 0.9 : 0.5));
    // your boots step into frame: "it then sees you"
    const kin = K.ease.out(K.seg(t, 15.6, 16.6));
    if (kin > 0) {
      const kx = K.lerp(800, 660, kin);
      K.shadowBlob(g, kx, 506, 46, 7, { alpha: 0.35 * kin, color: "#3a4478" });
      K.drawPerson(g, kx, 506, 300, { view: "back", walk: kin < 1, phase: t * 0.8, t, hood: true, bell: true, shadow: false,
        light: { x: kx - 300, y: 0, color: "#eef0ff", strength: 0.8, z: 0.3 }, ambient: "#9ea4c6" });
      snowLip(g, kx, 507, 70);
    }
    snow(g, W, H, t, { count: 26, seed: 11, speed: 30, size: 2, alpha: 0.95, drift: 16, blur: 2 });
  });
  snow(g, W, H, t, { count: 8, seed: 22, speed: 64, size: 10, alpha: 0.6, soft: true, drift: 30, blur: 1.3 });
}
// a low rim of disturbed snow in front of feet / paws (they sink in)
function snowLip(g, x, y, w) {
  const spr = K.sprite("f17lip", 120, 24, (s) => {
    const R = K.rng("lip");
    for (let i = 0; i < 26; i++) {
      const u = R(), r = 6 + R() * 7;
      const px = 10 + u * 100, py = 16 + (R() - 0.5) * 3;
      const gr = s.createRadialGradient(px - r * 0.3, py - r * 0.4, 0, px, py, r);
      gr.addColorStop(0, "rgba(246,247,255,0.95)"); gr.addColorStop(0.6, "rgba(228,231,248,0.85)"); gr.addColorStop(1, "rgba(200,206,236,0)");
      s.fillStyle = gr; s.beginPath(); s.ellipse(px, py, r, r * 0.45, 0, 0, TAU); s.fill();
    }
  });
  g.drawImage(spr, x - w / 2, y - w * 0.12, w, w * 0.2);
}

// ================================================================================================================
// SHOT 3 [20-34] flashback: inside the bedroom looking out through the door into the dark hallway
// ================================================================================================================
const HL = { f: 640, cx: -0.02, cy: 0.66, cz: -3.3, L: [-0.85, 0.47, -1.0], Lr: 0.1, dw: 0.45, dh: 2.0, wt: 0.12, hw: 0.62, hh: 2.4, hd: 7.6, kid: [-0.2, 0.05] };
const hp = (X, Y, Z) => [480 + (HL.f * (X - HL.cx)) / (Z - HL.cz), 270 - (HL.f * (Y - HL.cy)) / (Z - HL.cz), HL.f / (Z - HL.cz)];
const inside = (v, a, b, s) => sstep(a - s, a + s, v) * (1 - sstep(b - s, b + s, v));
const NLC = [1.0, 0.62, 0.3];
function nightlight(X, Y, Z, nx, ny, nz) {
  const [lx, ly, lz] = HL.L;
  const vx = lx - X, vy = ly - Y, vz = lz - Z;
  const d2 = vx * vx + vy * vy + vz * vz, d = Math.sqrt(d2);
  let ndl = (vx * nx + vy * ny + vz * nz) / d;
  if (nx === 0 && ny === 0 && nz === 0) ndl = 1;
  if (ndl <= 0) return 0;
  let vis = 1;
  if (Z > 0.0) {
    const za = HL.wt * 0.5;
    const s = (za - Z) / (lz - Z);
    const ax = X + vx * s, ay = Y + vy * s;
    const pen = (HL.Lr * (Z - za)) / (Z - lz) + 0.004;
    vis = inside(ax, -HL.dw, HL.dw, pen) * inside(ay, -1, HL.dh, pen);
  }
  if (vis <= 0) return 0;
  return (vis * ndl * 3.4) / (d2 + 0.04);
}
// fraction of the nightlight blocked by the child standing in the doorway, one hand on the left jamb
function kidOcc(X, Y, Z, kx, kz) {
  const [lx, ly, lz] = HL.L;
  if (!(Z > kz && lz < kz)) return 0;
  const s = (kz - Z) / (lz - Z);
  const ax = X + (lx - X) * s, ay = Y + (ly - Y) * s;
  const pen = (HL.Lr * (Z - kz)) / (Z - lz) + 0.01;
  const dx = ax - kx;
  const legs = Math.max(inside(dx, -0.11, -0.02, pen), inside(dx, 0.02, 0.11, pen)) * inside(ay, -1, 0.5, pen);
  const torso = inside(dx, -0.15 + Math.max(0, ay - 0.75) * 0.6, 0.15 - Math.max(0, ay - 0.75) * 0.6, pen) * inside(ay, 0.46, 0.86, pen);
  const armR = inside(dx, 0.1, 0.16, pen) * inside(ay, 0.45, 0.8, pen);
  const armL = inside(dx, HL.dw * -1 - kx - 0.02, -0.1, pen) * inside(ay, 0.72 + (dx + 0.1) * 0.15, 0.8 + (dx + 0.1) * 0.15, pen);
  const hd = Math.hypot(dx, (ay - 0.96) * 1.1);
  const head = 1 - sstep(0.1 - pen, 0.1 + pen, hd);
  return Math.max(legs, torso, armR, armL, head);
}
function* hallGen(which) {
  const RS = which === "shadow" ? 0.34 : 0.5;
  return yield* pix(960 * RS, 540 * RS, (qx, qy, out) => {
    const px = (qx + 0.5) / RS - 0.5, py = (qy + 0.5) / RS - 0.5;
    const dx = (px + 0.5 - 480) / HL.f, dy = -(py + 0.5 - 270) / HL.f;
    const C0 = HL.cx, C1 = HL.cy, C2 = HL.cz;
    let s = Infinity, n0 = 0, n1 = 0, n2 = 0, mat = 0;
    const s0 = -HL.cz;
    const sF = dy < 0 ? HL.cy / -dy : Infinity;
    const P0x = C0 + dx * s0, P0y = C1 + dy * s0;
    const inDoor = P0x > -HL.dw && P0x < HL.dw && P0y > 0 && P0y < HL.dh;
    if (sF < s0) { s = sF; n1 = 1; mat = 1; }
    else if (!inDoor) { s = s0; n2 = -1; mat = 2; }
    else {
      const s1 = s0 + HL.wt, P1x = C0 + dx * s1, P1y = C1 + dy * s1;
      if (!(P1x > -HL.dw && P1x < HL.dw && P1y < HL.dh)) {
        const sx = dx !== 0 ? ((dx > 0 ? HL.dw : -HL.dw) - C0) / dx : Infinity;
        const sy = dy > 0 ? (HL.dh - C1) / dy : Infinity;
        if (sx < sy) { s = sx; n0 = dx > 0 ? -1 : 1; } else { s = sy; n1 = -1; }
        mat = 3;
      } else {
        const cand = [];
        if (dy < 0) cand.push([HL.cy / -dy, 0, 1, 0, 4]);
        if (dy > 0) cand.push([(HL.hh - HL.cy) / dy, 0, -1, 0, 5]);
        if (dx > 0) cand.push([(HL.hw - HL.cx) / dx, -1, 0, 0, 6]);
        if (dx < 0) cand.push([(-HL.hw - HL.cx) / dx, 1, 0, 0, 7]);
        cand.push([HL.hd - HL.cz, 0, 0, -1, 8]);
        for (const c of cand) if (c[0] > s1 - 1e-4 && c[0] < s) { s = c[0]; n0 = c[1]; n1 = c[2]; n2 = c[3]; mat = c[4]; }
      }
    }
    const X = C0 + dx * s, Y = C1 + dy * s, Z = C2 + s;
    let occ = 0;
    if (which === "shadow") { occ = kidOcc(X, Y, Z, HL.kid[0], HL.kid[1]); if (occ <= 0.003) { out[3] = 0; return; } }
    let a0 = 0.5, a1 = 0.5, a2 = 0.5, e0 = 0, e1 = 0, e2 = 0, gloss = 0;
    const fine = vn(X * 60, Y * 60 + Z * 60, 3) * 0.5 + 0.5;
    if (mat === 1) { const c = 0.85 + fine * 0.2 + vn(X * 9, Z * 9, 4) * 0.05; a0 = 0.36 * c; a1 = 0.24 * c; a2 = 0.21 * c; }
    else if (mat === 2 || mat === 3) {
      const trimX = Math.abs(X) < HL.dw + 0.075 && Y < HL.dh + 0.075, skirt = Y < 0.1;
      if (mat === 3 || trimX || skirt) {
        const groove = mat === 2 && (Math.abs(Math.abs(X) - HL.dw - 0.06) < 0.006 || Math.abs(Y - HL.dh - 0.06) < 0.006 || Math.abs(Y - 0.095) < 0.004) ? 0.6 : 1;
        a0 = 0.62 * groove; a1 = 0.6 * groove; a2 = 0.56 * groove;
      } else {
        const stripe = 0.94 + 0.06 * Math.sin(X * TAU / 0.11);
        const fx = X * 9 - Math.floor(X * 9) - 0.5, fy = Y * 9 - Math.floor(Y * 9) - 0.5;
        const star = fx * fx + fy * fy < 0.008 ? 1.25 : 1;
        a0 = 0.25 * stripe * star; a1 = 0.33 * stripe * star; a2 = 0.48 * stripe * star;
      }
    } else if (mat === 4) {
      const pw = 0.095, pi = Math.floor((X + HL.hw) / pw), lx = (X + HL.hw) / pw - pi;
      const off = hsh(pi, 2, 9) * 2.3;
      const joint = Math.floor((Z + off) / 2.3), lz = (Z + off) / 2.3 - joint;
      const tone = 0.8 + hsh(pi * 7 + joint, 5, 9) * 0.35;
      const grain = 0.85 + 0.15 * Math.sin((lx * 3 + vn(X * 3, Z * 0.8, 6) * 2.5) * 9);
      let c = tone * grain;
      if (lx < 0.04 || lx > 0.96 || lz < 0.004) c *= 0.25;
      a0 = 0.32 * c; a1 = 0.19 * c; a2 = 0.1 * c;
      gloss = 1;
    } else if (mat === 5) { a0 = 0.55; a1 = 0.55; a2 = 0.53; }
    else if (mat === 6 || mat === 7) {
      if (Y < 0.13) { if (Y > 0.125) { a0 = 0.08; a1 = 0.05; a2 = 0.03; } else { a0 = 0.24; a1 = 0.15; a2 = 0.08; } }
      else {
        const dam = 0.9 + 0.1 * Math.sin(Z * 22) * Math.sin(Y * 22);
        a0 = 0.2 * dam; a1 = 0.22 * dam; a2 = 0.16 * dam;
        if (mat === 7 && Z > 2.2 && Z < 2.85 && Y > 1.05 && Y < 1.6) {
          const edge = Z < 2.25 || Z > 2.8 || Y < 1.1 || Y > 1.55;
          if (edge) { a0 = 0.12; a1 = 0.07; a2 = 0.03; } else { a0 = 0.18 + 0.1 * fine; a1 = 0.16; a2 = 0.12; gloss = 0.5; }
        }
        if (mat === 6 && Z > 3.7 && Z < 4.6 && Y < 2.0) {
          const panel = (Z > 3.8 && Z < 4.5) && ((Y > 0.15 && Y < 0.9) || (Y > 1.05 && Y < 1.85));
          if (panel) { a0 = 0.42; a1 = 0.4; a2 = 0.36; } else { a0 = 0.5; a1 = 0.48; a2 = 0.44; }
          if (Z < 3.72 || Z > 4.58 || Y > 1.98) { a0 = 0.2; a1 = 0.18; a2 = 0.15; }
        }
      }
    } else if (mat === 8) {
      a0 = 0.42; a1 = 0.42; a2 = 0.4;
      if (Math.abs(X) < 0.3 && Y > 0.95 && Y < 1.75) {
        const bar = Math.abs(X) < 0.012 || Math.abs(Y - 1.35) < 0.012 || Math.abs(X) > 0.285 || Y < 0.965 || Y > 1.735;
        if (bar) { a0 = 0.06; a1 = 0.06; a2 = 0.07; }
        else { const m = 0.8 + 0.2 * vn(X * 6, Y * 6, 8); e0 = 0.05 * m; e1 = 0.075 * m; e2 = 0.14 * m; a0 = a1 = a2 = 0; }
      }
      if (Y < 0.13) { a0 = 0.24; a1 = 0.15; a2 = 0.08; }
    }
    const Inl = which === "shadow" ? 0 : nightlight(X, Y, Z, n0, n1, n2);
    const wx = 0 - X, wy = 1.35 - Y, wz = HL.hd - 0.05 - Z;
    const wd2 = wx * wx + wy * wy + wz * wz, wd = Math.sqrt(wd2);
    const wndl = Math.max(0, (wx * n0 + wy * n1 + wz * n2) / wd) * (mat === 8 ? 0 : 1);
    const Im = (wndl * 0.07) / (wd2 * 0.25 + 0.4);
    const bounce = 0.006 + 0.03 * Math.exp(-Math.max(0, Z) * 1.2) * (Z < 0 ? 2 : 1);
    let c0 = a0 * (Inl * NLC[0] + Im * 0.55 + bounce * 0.9) + e0;
    let c1 = a1 * (Inl * NLC[1] + Im * 0.7 + bounce * 0.6) + e1;
    let c2 = a2 * (Inl * NLC[2] + Im * 1.0 + bounce * 0.4) + e2;
    if (gloss && mat === 4) {
      // the varnished floor mirrors the moonlit window (a soft vertical streak)
      const rs = HL.hd - Z;
      const rx = X + dx * rs, ry = -dy * rs;
      const wv = inside(rx, -0.28, 0.28, 0.08 + rs * 0.03) * inside(ry, 0.95, 1.75, 0.1 + rs * 0.04);
      const fres = 0.04 + 0.5 * Math.pow(1 - Math.min(1, -dy * 3), 5);
      c0 += wv * 0.05 * fres * 2.2; c1 += wv * 0.075 * fres * 2.2; c2 += wv * 0.14 * fres * 2.2;
    }
    out[0] = 255 * Math.pow(Math.max(0, 1 - Math.exp(-c0 * 0.95)), 0.5);
    out[1] = 255 * Math.pow(Math.max(0, 1 - Math.exp(-c1 * 0.95)), 0.5);
    out[2] = 255 * Math.pow(Math.max(0, 1 - Math.exp(-c2 * 0.95)), 0.5);
    out[3] = which === "shadow" ? 255 * occ : 255;
  });
}
const hallSpec = (which) => ["hall:" + which, () => hallGen(which)];
const hallBake = (which) => run(hallSpec(which));

// young Biscuit down the hall: baked per gait step at a reference size. The kit's cat keeps a photographic
// minimum exposure; out here the light is far weaker, so the bake darkens the body, then adds a cool rim from
// the moonlit window ahead (ears, back) and a faint warm bounce from the light wedge on the floor (flank, belly).
const KIT_REF = 44;
const KIT_LIGHT = { key: { dx: -150, dy: 30, color: "#ffb060", strength: 0.9 }, rim: { dx: 90, dy: -260, color: "#9fb4e0", strength: 1.2 }, fill: "#0c0805", ambient: "#120c08", ambientK: 0.2, backlit: 0.5, shadow: false };
function kitOpts(kind) {
  const base = Object.assign({ coat: K.COATS.biscuit, bell: true, collar: true, facing: 1, pupil: 1, blink: 0 }, KIT_LIGHT);
  if (kind === "sit") return Object.assign(base, { pose: "sit", headTurn: 1, tailUp: 0.3 });
  if (kind === "stand") return Object.assign(base, { pose: "stand", headTurn: 0.7, tailUp: 0.6 });
  return Object.assign(base, { pose: "walk", headTurn: -0.2, tailUp: 0.65 });
}
const kitSprite = (kind, q) => run(kitSpec(kind, q));
function kitSpec(kind, q) {
  return ["kit:" + kind + ":" + q, function* () {
    const src = yield* sub(catSpec("kitraw:" + kind, KIT_REF, kitOpts(kind), q, 8));
    const w = src.width, h = src.height;
    const S = src.getContext("2d").getImageData(0, 0, w, h).data;
    yield;
    const c = K.makeCanvas(w, h);
    const g = c.getContext("2d");
    const img = g.createImageData(w, h), O = img.data;
    const al = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : S[(y * w + x) * 4 + 3] / 255);
    const r1 = 3, r2 = 4;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, a = S[i + 3] / 255;
        if (a < 0.02) continue;
        const rim = a * (1 - al(x + r1, y - r1 * 2)) * (0.6 + 0.4 * (1 - al(x, y - r1 * 2)));
        const warm = a * (1 - al(x - 1, y + r2)) ;
        let R = S[i] / 255 * 0.3, G = S[i + 1] / 255 * 0.27, B = S[i + 2] / 255 * 0.26;
        R += 0.24 * rim; G += 0.32 * rim; B += 0.52 * rim;
        R += 0.24 * warm; G += 0.13 * warm; B += 0.05 * warm;
        O[i] = knee(R) * 255; O[i + 1] = knee(G) * 255; O[i + 2] = knee(B) * 255; O[i + 3] = S[i + 3];
      }
      if ((y & 7) === 7) yield;
    }
    g.putImageData(img, 0, 0);
    c.SW = src.SW; c.SH = src.SH; c.ox = src.ox; c.oy = src.oy;
    if (kind === "sit") {
      // find where the eyes really are: render a probe with pure-green irises and take the two centroids
      const pc = yield* sub(catSpec("kitprobe", KIT_REF, Object.assign(kitOpts("sit"), { coat: Object.assign({}, K.COATS.biscuit, { iris: "#00ff00", irisInner: "#00ff00" }) }), 0, 8));
      const PD = pc.getContext("2d").getImageData(0, 0, pc.width, pc.height).data;
      const pts = [];
      for (let y = 0; y < pc.height; y++) for (let x = 0; x < pc.width; x++) { const i = (y * pc.width + x) * 4; if (PD[i + 3] > 200 && PD[i + 1] > PD[i] + 50 && PD[i + 1] > PD[i + 2] + 50) pts.push(x, y); }
      if (pts.length >= 4) {
        let mx = 0;
        for (let k = 0; k < pts.length; k += 2) mx += pts[k];
        mx /= pts.length / 2;
        const A = [0, 0, 0], B = [0, 0, 0];
        for (let k = 0; k < pts.length; k += 2) { const T = pts[k] < mx ? A : B; T[0] += pts[k]; T[1] += pts[k + 1]; T[2]++; }
        c.eyes = [A, B].filter((e) => e[2] > 0).map((e) => [e[0] / e[2] / 2, e[1] / e[2] / 2]);
      }
    }
    return c;
  }];
}
function* warmKits() {
  for (let q = 0; q < 8; q++) { kitSprite("walk", q); yield; }
  kitSprite("stand", 0); yield;
  kitSprite("sit", 0);
  return true;
}
// where the kitten is and what he is doing: walk ahead, sit and look back, walk on, wait
const HWALK = [[20.4, 23.0, 0.5, 1.75, 0.2, 0.3], [26.0, 27.5, 1.75, 2.95, 0.3, 0.27], [29.5, 31.0, 2.95, 4.1, 0.27, 0.2]];
function hallPose(t) {
  if (t < HWALK[0][0]) return { X: 0.2, Z: 0.5, kind: "stand", phase: 0, since: 0 };
  for (let i = 0; i < HWALK.length; i++) {
    const [a, b, z0, z1, x0, x1] = HWALK[i];
    if (t < a) { const p = HWALK[i - 1]; return { X: p[5], Z: p[3], kind: t - p[1] < 0.35 ? "stand" : "sit", since: t - p[1] }; }
    if (t < b) {
      const k = K.ease.inOut(K.seg(t, a, b));
      return { X: K.lerp(x0, x1, k), Z: K.lerp(z0, z1, k), kind: "walk", phase: (K.lerp(z0, z1, k) - z0) / 0.3, since: 0 };
    }
  }
  const p = HWALK[HWALK.length - 1];
  return { X: p[5], Z: p[3], kind: t - p[1] < 0.35 ? "stand" : "sit", since: t - p[1] };
}
function kidPos(t) {
  const fp = K.ease.inOut(K.seg(t, 30.8, 34.2));
  return { X: K.lerp(HL.kid[0], -0.02, fp), Z: K.lerp(HL.kid[1], 1.5, fp), fp };
}
function hallway(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 19.6, 34));
  const cam = { x: K.lerp(470, 492, p), y: K.lerp(280, 262, p), zoom: K.lerp(1.06, 1.3, p), shakeT: t, shakeAmt: 0.7 };
  const kp = kidPos(t);
  K.withCamera(g, W, H, cam, () => {
    g.drawImage(hallBake("lit"), 0, 0, 960, 540);
    // the child's shadow thrown forward down the hall (rescaled about her feet as she walks into it)
    const [fx0, fy0, s0] = hp(HL.kid[0], 0, HL.kid[1]);
    const [fx1, fy1, s1] = hp(kp.X, 0, kp.Z);
    const k = s1 / s0;
    g.save();
    g.translate(fx1, fy1); g.scale(k, k); g.translate(-fx0, -fy0);
    g.globalAlpha = 1 - kp.fp * 0.3;
    g.drawImage(hallBake("shadow"), 0, 0, 960, 540);
    g.restore();
    // the kitten
    const c = hallPose(t);
    const [cx, cy, cs] = hp(c.X, 0, c.Z);
    const S = 0.22 * cs;
    const wedge = cl01(nightlight(c.X, 0.15, c.Z, 0, 0, 0) * 3.2);
    const spr = kitSprite(c.kind, c.kind === "walk" ? gaitQ(c.phase, 8) : 0);
    const sx = c.kind === "walk" ? 0.72 : 0.86;
    // his contact shadow and his reflection in the varnish
    K.shadowBlob(g, cx + S * 0.1, cy, S * 0.9, S * 0.1, { alpha: 0.6, color: "#000000" });
    g.save();
    g.translate(cx, cy); g.scale(1, -0.62); g.translate(-cx, -cy);
    blitCat(g, spr, cx, cy, S, KIT_REF, sx, 0.13);
    g.restore();
    blitCat(g, spr, cx, cy, S, KIT_REF, sx);
    if (wedge > 0.02) blitCat(g, spr, cx, cy, S, KIT_REF, sx, wedge * 0.7, "lighter");
    // tapetum eye-shine: the nightlight bounced straight back up the hall, with its little reflection below
    if (c.kind === "sit" && spr.eyes) {
      const kk = S / KIT_REF;
      const ga = K.smooth(cl01((c.since - 0.4) / 0.4)) * (1 - K.env(t, 24.6, 24.9, 0.08, 0.1)) * (1 - K.env(t, 32.2, 32.5, 0.08, 0.1));
      for (const [ex0, ey0] of spr.eyes) {
        const ex = cx + (ex0 - spr.ox) * kk * sx, ey = cy + (ey0 - spr.oy) * kk;
        const r = Math.max(1.6, S * 0.06);
        K.glow(g, ex, ey, r * 5, "#a8e070", 0.32 * ga);
        K.glow(g, ex, ey, r * 1.3, "#f0ffd0", 0.95 * ga);
        const ry = cy + (cy - ey) * 0.62;
        K.glow(g, ex, ry, r * 3, "#a8e070", 0.12 * ga);
      }
    }
    K.dust(g, W, H, t, { seed: 3, color: "#ffcf8a", count: 26, size: 1.1, area: [300, 120, 260, 360], alpha: 0.4 });
    // the child in the doorway, from behind, small; one hand on the jamb. Sharp: the focus is on her.
    const [kx, ky, ks] = hp(kp.X, 0, kp.Z);
    const kh = 1.08 * ks;
    const [lsx, lsy] = hp(HL.L[0], HL.L[1], HL.L[2] + 0.001);
    const d = Math.hypot(kp.X - HL.L[0], 0.7 - HL.L[1], kp.Z - HL.L[2]);
    const str = K.clamp(2.2 / (d * d), 0.15, 0.85);
    const reachK = 1 - K.smooth(K.seg(t, 30.6, 31.2));
    const jam = ((-HL.dw + 0.03 - kp.X) / 1.08) * 100;
    K.shadowBlob(g, kx + kh * 0.05, ky, kh * 0.16, kh * 0.03, { alpha: 0.7, color: "#000000" });
    K.drawPerson(g, kx, ky, kh, {
      view: "back", t, hood: false, shadow: false, skin: "#9a8076", coat: "#5d6c9e", pants: "#4a5888", boots: "#c8c4c0",
      walk: kp.fp > 0 && kp.fp < 1, phase: t * 0.8, crouch: kp.fp > 0 ? 0.03 : 0.06 + 0.02 * Math.sin(t * 1.3),
      armL: reachK > 0 ? { hand: [K.lerp(-10, jam, reachK), K.lerp(-46, -72, reachK)] } : undefined,
      light: { x: lsx, y: lsy, color: "#ffb868", strength: str, z: 0.5 }, ambient: "#0d0806",
    });
  });
  // the bedside table and the nightlight, close to the lens and out of focus
  const kl = K.layer(W, H, "f17:table");
  K.withCamera(kl.g, W, H, cam, () => nightTable(kl.g, t));
  K.dof(g, kl.canvas, 3.2);
}
// the bedside table and the moon-shaped nightlight on it (the one light of the scene, in frame, soft)
function nightTable(g, t) {
  const Pp = (X, Y, Z) => hp(X, Y, Z);
  const x0 = -1.02, x1 = -0.68, z0 = -1.16, z1 = -0.84, top = 0.38;
  const q = (pts) => { g.beginPath(); pts.forEach(([X, Y, Z], i) => { const [a, b] = Pp(X, Y, Z); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.closePath(); };
  const [ux, uy, us] = Pp((x0 + x1) / 2, 0, (z0 + z1) / 2);
  K.shadowBlob(g, ux, uy, 0.24 * us, 0.05 * us, { alpha: 0.85, color: "#000000" });
  g.fillStyle = "#160c06";
  for (const [lx, lz] of [[x0 + 0.03, z0 + 0.03], [x1 - 0.03, z0 + 0.03]]) { q([[lx - 0.018, 0, lz], [lx + 0.018, 0, lz], [lx + 0.018, top - 0.06, lz], [lx - 0.018, top - 0.06, lz]]); g.fill(); }
  q([[x0, top - 0.07, z0], [x1, top - 0.07, z0], [x1, top, z0], [x0, top, z0]]);
  const [ax] = Pp(x0, top, z0), [bx] = Pp(x1, top, z0);
  const fg = g.createLinearGradient(ax, 0, bx, 0);
  fg.addColorStop(0, "#2a160a"); fg.addColorStop(1, "#1a0e06");
  g.fillStyle = fg; g.fill();
  q([[x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1]]);
  const [cx, cy] = Pp(-0.85, top, -1.0);
  const tg = g.createRadialGradient(cx, cy, 0, cx, cy, 60);
  tg.addColorStop(0, "#c07838"); tg.addColorStop(1, "#4a2a12");
  g.fillStyle = tg; g.fill();
  const [lx, ly, ls] = Pp(HL.L[0], HL.L[1], HL.L[2]);
  const r = 0.075 * ls;
  const fl = 0.96 + 0.04 * Math.sin(t * 2.3) * Math.sin(t * 0.7);
  const gg = g.createRadialGradient(lx - r * 0.15, ly - r * 0.2, 0, lx, ly, r);
  gg.addColorStop(0, "#ffffff"); gg.addColorStop(0.45, "#fff3d6"); gg.addColorStop(0.85, "#ffc070"); gg.addColorStop(1, "#d8803a");
  g.fillStyle = gg; g.beginPath(); g.arc(lx, ly, r, 0, TAU); g.fill();
  g.fillStyle = "#3a2210"; g.beginPath(); g.ellipse(lx, ly + r * 0.95, r * 0.6, r * 0.16, 0, 0, TAU); g.fill();
  K.glow(g, lx, ly, r * 3.2, "#ffb060", 0.5 * fl);
}

// ================================================================================================================
// SHOT 4 [34-44] close: your open hand, the bell resting in the palm, snowflakes landing on the brass and melting
// ================================================================================================================
// The arm is a small signed-distance-field scene ray-marched once into a sprite (camera at the origin, +Y down,
// +Z into the screen, metres). The elbow is toward the lens (the forearm is hugely foreshortened), the cuff of the
// quilted sleeve is seen at three-quarters, the left hand lies palm-up with its fingers loosely curled.
const AF = 760;
const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  nrm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
};
const AR = (() => {
  const { add, mul, dot, nrm, cross } = v3;
  const Pc = [-0.006, 0.024, 0.3];
  const Dh = nrm([0.66, -0.12, 0.74]);
  let Nu = nrm([-0.12, -0.86, -0.48]); Nu = nrm(add(Nu, mul(Dh, -dot(Nu, Dh))));
  let Sd = nrm(cross(Dh, Nu)); if (Sd[0] < 0) Sd = mul(Sd, -1);
  const Wr = add(Pc, mul(Dh, -0.04));
  const Dax = nrm([0.3, -0.42, 0.85]);
  const cuff = add(Wr, mul(Dax, -0.03));
  const segs = [];
  const cone = (a, b, ra, rb, grp) => segs.push([a, b, ra, rb, grp]);
  cone(add(Wr, mul(Dax, -0.07)), Wr, 0.0205, 0.0182, 0); // forearm out of the cuff
  cone(Wr, add(Pc, mul(Dh, -0.012)), 0.0182, 0.019, 0); // wrist into the heel of the hand
  // four fingers from the knuckles, spreading a little, each curled loosely up toward the palm
  const offs = [-0.021, -0.0068, 0.0068, 0.0195], lens = [0.047, 0.053, 0.049, 0.039], rads = [0.0072, 0.0075, 0.0071, 0.0063], spr = [-0.12, -0.035, 0.045, 0.13];
  const curl = [[0.32, 0.85, 1.35], [0.28, 0.78, 1.28], [0.36, 0.92, 1.42], [0.45, 1.05, 1.55]];
  for (let f = 0; f < 4; f++) {
    const d0 = nrm(add(mul(Dh, Math.cos(spr[f])), mul(Sd, Math.sin(spr[f]))));
    let p = add(add(Pc, mul(Dh, 0.03 - Math.abs(offs[f]) * 0.25)), add(mul(Sd, offs[f]), mul(Nu, 0.002)));
    const fr = [0.46, 0.3, 0.24];
    for (let k = 0; k < 3; k++) {
      const a = curl[f][k];
      const dir = nrm(add(mul(d0, Math.cos(a)), mul(Nu, Math.sin(a))));
      const q = add(p, mul(dir, lens[f] * fr[k]));
      cone(p, q, rads[f] * (1 - k * 0.07), rads[f] * (0.93 - k * 0.08), 2);
      p = q;
    }
  }
  // the thumb, out to the side and up
  const tb = add(add(Pc, mul(Sd, -0.024)), add(mul(Dh, -0.012), mul(Nu, 0.003)));
  const td = nrm(add(add(mul(Sd, -0.6), mul(Dh, 0.62)), mul(Nu, 0.5)));
  const t1 = add(tb, mul(td, 0.026));
  const td2 = nrm(add(add(td, mul(Nu, 0.45)), mul(Dh, 0.25)));
  cone(tb, t1, 0.0098, 0.0086, 2);
  cone(t1, add(t1, mul(td2, 0.022)), 0.0086, 0.0075, 2);
  const F = new Float64Array(segs.length * 10);
  segs.forEach(([a, b, ra, rb, grp], i) => {
    const o = i * 10, ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    F[o] = a[0]; F[o + 1] = a[1]; F[o + 2] = a[2]; F[o + 3] = ba[0]; F[o + 4] = ba[1]; F[o + 5] = ba[2];
    F[o + 6] = 1 / dot(ba, ba); F[o + 7] = ra; F[o + 8] = rb; F[o + 9] = grp;
  });
  const hb = add(Pc, mul(Dh, 0.02));
  const proj = (p) => [480 + (AF * p[0]) / p[2], 270 + (AF * p[1]) / p[2], AF / p[2]];
  return { Pc, Dh, Nu, Sd, Wr, Dax, cuff, F, n: segs.length, hb, thenar: add(add(Pc, mul(Sd, -0.017)), add(mul(Dh, -0.012), mul(Nu, 0.003))), cup: add(Pc, mul(Nu, 0.031)), cordC: add(Wr, mul(Dax, -0.012)), proj };
})();
let AMAT = 0;
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
function armMap(px, py, pz) {
  // the sleeve: a quilted tube, capped at the cuff, hollow at its mouth (dark lining)
  const A = AR, ax = A.Dax[0], ay = A.Dax[1], az = A.Dax[2];
  const qx = px - A.cuff[0], qy = py - A.cuff[1], qz = pz - A.cuff[2];
  const along = qx * ax + qy * ay + qz * az, u = -along;
  const rx = qx - ax * along, ry = qy - ay * along, rz = qz - az * along;
  const radial = Math.sqrt(rx * rx + ry * ry + rz * rz);
  const band = sstep(0.011, 0.02, u);
  const fq = u > 0 ? (u % 0.036) / 0.036 : 0;
  const R = 0.04 + 0.034 * cl01(u / 0.3) + band * 0.0034 * Math.sin(Math.PI * fq) - (1 - band) * 0.0028;
  let dS = Math.max(radial - R, -u);
  if (band > 0) { const sd = Math.min(fq, 1 - fq) * 0.036; dS += band * 0.0012 * Math.exp(-(sd * sd) / 2.3e-6); }
  const dHole = Math.max(radial - (R - 0.006), u - 0.028);
  let mat = 2, best = dS;
  if (-dHole > dS) { best = -dHole; mat = 3; }
  // the red cord round the wrist
  {
    const cx = px - A.cordC[0], cy = py - A.cordC[1], cz = pz - A.cordC[2];
    const al = cx * ax + cy * ay + cz * az;
    const ox = cx - ax * al, oy = cy - ay * al, oz = cz - az * al;
    const rr = Math.sqrt(ox * ox + oy * oy + oz * oz) - 0.0206;
    const dc = Math.sqrt(rr * rr + al * al) - 0.0024;
    if (dc < best) { best = dc; mat = 4; }
  }
  // skin: forearm, wrist, palm, thenar, fingers, thumb
  const Fa = A.F;
  let dA = 1e9;
  for (let i = 0; i < 2; i++) {
    const o = i * 10;
    const pax = px - Fa[o], pay = py - Fa[o + 1], paz = pz - Fa[o + 2];
    let h = (pax * Fa[o + 3] + pay * Fa[o + 4] + paz * Fa[o + 5]) * Fa[o + 6];
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    const dx = pax - Fa[o + 3] * h, dy = pay - Fa[o + 4] * h, dz = paz - Fa[o + 5] * h;
    dA = smin(dA, Math.sqrt(dx * dx + dy * dy + dz * dz) - (Fa[o + 7] + (Fa[o + 8] - Fa[o + 7]) * h), 0.008);
  }
  const hx = px - A.hb[0], hy = py - A.hb[1], hz = pz - A.hb[2];
  const hbd = Math.sqrt(hx * hx + hy * hy + hz * hz) - 0.085;
  if (hbd > 0.02) { dA = Math.min(dA, hbd); }
  else {
    // palm: a flattened ellipsoid, cupped
    const lx0 = px - A.Pc[0], ly0 = py - A.Pc[1], lz0 = pz - A.Pc[2];
    const a = (lx0 * A.Dh[0] + ly0 * A.Dh[1] + lz0 * A.Dh[2]), b = (lx0 * A.Sd[0] + ly0 * A.Sd[1] + lz0 * A.Sd[2]), c = (lx0 * A.Nu[0] + ly0 * A.Nu[1] + lz0 * A.Nu[2]);
    const e0x = a / 0.039, e0y = b / 0.033, e0z = c / 0.0125;
    const k0 = Math.sqrt(e0x * e0x + e0y * e0y + e0z * e0z), k1 = Math.sqrt((e0x / 0.039) ** 2 + (e0y / 0.033) ** 2 + (e0z / 0.0125) ** 2);
    let dp = (k0 * (k0 - 1)) / k1;
    const tx = px - A.thenar[0], ty = py - A.thenar[1], tz = pz - A.thenar[2];
    dp = smin(dp, Math.sqrt(tx * tx + ty * ty + tz * tz) - 0.0145, 0.01);
    const ux = px - A.cup[0], uy = py - A.cup[1], uz = pz - A.cup[2];
    dp = Math.max(dp, -(Math.sqrt(ux * ux + uy * uy + uz * uz) - 0.025) - 0.0) * 1;
    // palm creases (only matter on the cup's surface)
    if (c > 0) {
      const l1 = a - (0.012 + 0.32 * b * b * 10 + 0.12 * b), l2 = Math.sqrt((a + 0.024) ** 2 + (b + 0.03) ** 2) - 0.034;
      dp += 0.0007 * Math.exp(-(l1 * l1) / 1.6e-6) + 0.0006 * Math.exp(-(l2 * l2) / 1.4e-6);
    }
    dA = smin(dA, dp, 0.01);
    let dF = 1e9;
    for (let i = 2; i < A.n; i++) {
      const o = i * 10;
      const pax = px - Fa[o], pay = py - Fa[o + 1], paz = pz - Fa[o + 2];
      let h = (pax * Fa[o + 3] + pay * Fa[o + 4] + paz * Fa[o + 5]) * Fa[o + 6];
      h = h < 0 ? 0 : h > 1 ? 1 : h;
      const dx = pax - Fa[o + 3] * h, dy = pay - Fa[o + 4] * h, dz = paz - Fa[o + 5] * h;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - (Fa[o + 7] + (Fa[o + 8] - Fa[o + 7]) * h);
      dF = i % 3 === 0 ? smin(dF, d, 0.003) : Math.min(dF, d);
    }
    dA = smin(dA, dF, 0.0065);
  }
  if (dA < best) { best = dA; mat = 1; }
  AMAT = mat;
  return best;
}
function* armGen() {
  const sc = 0.8, X0 = 0, Y0 = 110, Wd = Math.round(780 * sc), Hd = Math.round(430 * sc);
  const N = Wd * Hd;
  const col = new Float32Array(N * 4), dep = new Float32Array(N);
  const pa = 1 / (AF * sc);
  const Lk = v3.nrm([-0.35, -0.8, -0.45]);
  for (let y = 0; y < Hd; y++) {
    for (let x = 0; x < Wd; x++) {
      const sx = X0 + (x + 0.5) / sc, sy = Y0 + (y + 0.5) / sc;
      let dx = (sx - 480) / AF, dy = (sy - 270) / AF, dz = 1;
      const dl = Math.sqrt(dx * dx + dy * dy + 1); dx /= dl; dy /= dl; dz /= dl;
      let t = 0.06, minR = 1e9, tAt = 0, hit = false;
      for (let s = 0; s < 110; s++) {
        const d = armMap(dx * t, dy * t, dz * t);
        if (d < t * pa * 0.4) { hit = true; tAt = t; break; }
        const r = d / t;
        if (r < minR) { minR = r; tAt = t; }
        t += d * 0.9;
        if (t > 0.6) break;
      }
      const i = y * Wd + x;
      const cov = hit ? 1 : cl01(1 - minR / pa);
      if ((x & 31) === 31) yield;
      if (cov <= 0) continue;
      const px = dx * tAt, py = dy * tAt, pz = dz * tAt;
      armMap(px, py, pz);
      const mat = AMAT;
      // normal (tetrahedron), ambient occlusion, thickness for subsurface light
      const e = 0.00035;
      const k1 = armMap(px + e, py - e, pz - e), k2 = armMap(px - e, py - e, pz + e), k3 = armMap(px - e, py + e, pz - e), k4 = armMap(px + e, py + e, pz + e);
      let nx = k1 - k2 - k3 + k4, ny = -k1 - k2 + k3 + k4, nz = -k1 + k2 - k3 + k4;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      let occ = 0, sca = 1;
      for (let k = 1; k <= 5; k++) { const h = 0.0022 * k; occ += (h - armMap(px + nx * h, py + ny * h, pz + nz * h)) * sca; sca *= 0.8; }
      const ao = cl01(1 - occ * 26);
      const ndv = Math.max(0, -(nx * dx + ny * dy + nz * dz));
      const skyV = 0.5 - 0.5 * ny, bo = cl01(0.5 + 0.5 * ny);
      const ndl = nx * Lk[0] + ny * Lk[1] + nz * Lk[2];
      let r, g, b;
      if (mat === 1) {
        const wrap = (w) => Math.max(0, (ndl + w) / (1 + w));
        const al = [0.8, 0.46, 0.3];
        const thick = armMap(px - nx * 0.005, py - ny * 0.005, pz - nz * 0.005);
        const tr = cl01(1 + thick / 0.0045);
        r = al[0] * (0.62 * skyV * ao + 0.72 * wrap(0.45) * (0.5 + 0.5 * ao) + 0.3 * bo * ao);
        g = al[1] * (0.66 * skyV * ao + 0.72 * wrap(0.25) * (0.5 + 0.5 * ao) + 0.32 * bo * ao);
        b = al[2] * (0.8 * skyV * ao + 0.74 * wrap(0.12) * (0.5 + 0.5 * ao) + 0.4 * bo * ao);
        // light passing through thin fingers and edges comes out red
        const fr = Math.pow(1 - ndv, 2.2);
        r += 0.42 * tr * (0.6 + 0.4 * skyV) + 0.3 * fr * ao; g += 0.07 * tr * (0.6 + 0.4 * skyV) + 0.06 * fr * ao; b += 0.04 * tr + 0.035 * fr * ao;
        // a soft skin sheen from the sky
        const sh = (0.03 + 0.25 * Math.pow(1 - ndv, 5)) * skyV * ao;
        r += sh * 0.8; g += sh * 0.82; b += sh * 0.9;
      } else if (mat === 2) {
        // rain-jacket nylon: matte yellow with a soft sheen at grazing angles, faint weave
        const wv = 1 + (hsh(Math.floor(px * 4000), Math.floor((py + pz) * 4000), 3) - 0.5) * 0.06;
        const dif = Math.max(0, (ndl + 0.2) / 1.2);
        r = 0.8 * wv * (0.55 * skyV * ao + 0.65 * dif * ao + 0.25 * bo * ao);
        g = 0.5 * wv * (0.57 * skyV * ao + 0.65 * dif * ao + 0.26 * bo * ao);
        b = 0.035 * wv * (0.7 * skyV * ao + 0.65 * dif * ao + 0.3 * bo * ao);
        const sh = Math.pow(1 - ndv, 3) * 0.22 * ao + Math.pow(Math.max(0, ndl), 10) * 0.05;
        r += sh * 0.85; g += sh * 0.86; b += sh * 0.95;
      } else if (mat === 3) {
        r = 0.04 * ao; g = 0.045 * ao; b = 0.07 * ao;
      } else {
        const tw = 0.75 + 0.25 * Math.sin((px * 7 + py * 5 + pz * 9) * 900);
        r = 0.5 * tw * (0.6 * skyV + 0.5 * Math.max(0, ndl)) * ao; g = 0.06 * tw * ao * (0.6 * skyV + 0.5); b = 0.05 * tw * ao * (0.6 * skyV + 0.5);
        r += Math.pow(1 - ndv, 3) * 0.1;
      }
      const ex = 0.95;
      col[i * 4] = Math.pow(knee(r * ex), 1 / 2.2) * cov; col[i * 4 + 1] = Math.pow(knee(g * ex), 1 / 2.2) * cov; col[i * 4 + 2] = Math.pow(knee(b * ex), 1 / 2.2) * cov; col[i * 4 + 3] = cov;
      dep[i] = pz;
    }
    yield;
  }
  // near-lens defocus: the sleeve close to the camera melts into a soft blur (premultiplied box blur, blended by CoC)
  const bl = Float32Array.from(col);
  const chans = [new Float32Array(N), new Float32Array(N), new Float32Array(N), new Float32Array(N)];
  for (let c = 0; c < 4; c++) { const ch = chans[c]; for (let i = 0; i < N; i++) ch[i] = bl[i * 4 + c]; yield* boxBlurG(ch, Wd, Hd, 7, 2); }
  const coc = new Float32Array(N);
  for (let i = 0; i < N; i++) coc[i] = col[i * 4 + 3] > 0 ? cl01((0.21 - dep[i]) / 0.08) : 0;
  yield* boxBlurG(coc, Wd, Hd, 6, 2);
  const c = K.makeCanvas(Wd, Hd);
  const g = c.getContext("2d");
  const img = g.createImageData(Wd, Hd), O = img.data;
  for (let i = 0; i < N; i++) {
    const k = cl01(Math.max(coc[i] * 1.6, col[i * 4 + 3] > 0 ? cl01((0.21 - dep[i]) / 0.08) : 0));
    const a = col[i * 4 + 3] * (1 - k) + chans[3][i] * k;
    if (a > 0.002) {
      O[i * 4] = 255 * (col[i * 4] * (1 - k) + chans[0][i] * k) / a;
      O[i * 4 + 1] = 255 * (col[i * 4 + 1] * (1 - k) + chans[1][i] * k) / a;
      O[i * 4 + 2] = 255 * (col[i * 4 + 2] * (1 - k) + chans[2][i] * k) / a;
      O[i * 4 + 3] = 255 * a;
    }
    if ((i & 8191) === 8191) yield;
  }
  g.putImageData(img, 0, 0);
  c.rx = X0; c.ry = Y0; c.rw = Wd / sc; c.rh = Hd / sc;
  return c;
}
const ARM = ["arm", armGen];
const armBake = () => run(ARM);

// a brass jingle bell seen from a little above: the slot is foreshortened low on the ball, one soft sky highlight
function* bellGen() {
  const th = 0.55, ct = Math.cos(th), st = Math.sin(th);
  const Lk = v3.nrm([-0.45, -0.75, 0.48]);
  return yield* pix(200, 200, (x, y, out) => {
    const R = 80, cx = 100, cy = 104;
    const px = (x + 0.5 - cx) / R, py = (y + 0.5 - cy) / R;
    const d = Math.sqrt(px * px + py * py);
    if (d > 1.02) { out[3] = 0; return; }
    const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d * d)));
    let nx = px, ny = py;
    // latitude on the ball (1 = top pole, which leans toward us)
    const lat = -py * ct + nz * st;
    const seam = Math.exp(-Math.pow(lat / 0.035, 2));
    ny -= seam * 0.22 * Math.sign(-lat) * -1;
    const rz = 2 * nz * nz - 1, rx = 2 * nz * nx, ry = 2 * nz * ny;
    const upv = -ry * ct + rz * st;
    let e;
    if (upv > 0.08) { const b = 0.88 + 0.12 * upv; e = [0.9 * b, 0.92 * b, 0.98 * b]; }
    else if (upv > -0.06) { const k = (upv + 0.06) / 0.14; e = [0.56 + 0.2 * k, 0.57 + 0.2 * k, 0.64 + 0.2 * k]; }
    else { const k = cl01(-upv * 2); e = [K.lerp(0.7, 0.86, k), K.lerp(0.62, 0.66, k), K.lerp(0.62, 0.56, k)]; } // snow, then the palm below
    const pk = Math.max(0, rx * Lk[0] + ry * Lk[1] + rz * Lk[2]);
    const hot = Math.pow(pk, 34) * 1.6 + Math.pow(pk, 6) * 0.22;
    e = [e[0] + hot, e[1] + hot, e[2] + hot * 0.95];
    if (rz > 0.88) { const k = sstep(0.88, 0.99, rz) * 0.3; e = [K.lerp(e[0], 0.7, k), K.lerp(e[1], 0.6, k), K.lerp(e[2], 0.3, k)]; } // you, in yellow, reflected
    const F = 0.84 + 0.16 * Math.pow(1 - nz, 5);
    const tarn = cl01(fbm(px * 3, py * 3, 3, 12) * 0.9 + 0.15);
    let c = [e[0] * 1.0 * F, e[1] * 0.8 * F, e[2] * 0.46 * F];
    c = c.map((v, i) => v * (1 - tarn * 0.35) + [0.2, 0.13, 0.06][i] * tarn * 0.35);
    // the slot: a thin dark band on a latitude below the equator, only on the side facing us; small holes at its ends
    const sl = lat + 0.5;
    const slot = Math.abs(sl) < 0.04 && Math.abs(px) < 0.5 && nz > 0.1;
    const hole = Math.abs(sl) < 0.075 && Math.abs(Math.abs(px) - 0.5) < 0.06 && nz > 0.1;
    if (slot || hole) c = [0.03, 0.025, 0.02];
    else if (Math.abs(sl + 0.06) < 0.02 && Math.abs(px) < 0.5) c = c.map((v) => v * 0.6);
    else if (Math.abs(sl - 0.055) < 0.018 && Math.abs(px) < 0.5) c = c.map((v) => v * 1.25 + 0.04);
    const a = cl01((1.0 - d) * R + 0.5);
    out[0] = knee(c[0]) * 255; out[1] = knee(c[1]) * 255; out[2] = knee(c[2]) * 255; out[3] = 255 * a;
  });
}
const BELL = ["bell", bellGen];
const bellSprite = () => run(BELL);
// a snow crystal (stellar dendrite), cached; drawn rotated and scaled
function crystalSprite(i) {
  return K.sprite("f17xtal" + i, 64, 64, (g) => {
    const R = K.rng("xtal" + i);
    g.translate(32, 32);
    g.lineCap = "round";
    const br = [0.3 + R() * 0.2, 0.55 + R() * 0.2, 0.75 + R() * 0.1];
    for (const pass of [0, 1]) {
      g.strokeStyle = pass ? "rgba(255,255,255,0.95)" : "rgba(150,160,200,0.45)";
      g.lineWidth = pass ? 1.6 : 2.8;
      for (let k = 0; k < 6; k++) {
        g.save(); g.rotate((k / 6) * TAU);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -28);
        for (const b of br) { const L = (1 - b) * 13 + 3; g.moveTo(0, -28 * b); g.lineTo(-L * 0.7, -28 * b - L * 0.7); g.moveTo(0, -28 * b); g.lineTo(L * 0.7, -28 * b - L * 0.7); }
        g.stroke();
        g.restore();
      }
    }
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; g.lineTo(Math.cos(a) * 5, Math.sin(a) * 5); }
    g.closePath(); g.fill();
  });
}
function dropSprite() {
  return K.sprite("f17drop", 32, 32, (g) => {
    const rg = g.createRadialGradient(16, 16, 0, 16, 16, 12);
    rg.addColorStop(0, "rgba(255,240,200,0.15)"); rg.addColorStop(0.7, "rgba(60,40,10,0.25)"); rg.addColorStop(0.92, "rgba(30,20,5,0.55)"); rg.addColorStop(1, "rgba(30,20,5,0)");
    g.fillStyle = rg; g.beginPath(); g.arc(16, 16, 12, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,1)"; g.beginPath(); g.ellipse(12, 11.5, 3, 2.2, -0.6, 0, TAU); g.fill();
    const cg = g.createRadialGradient(20, 21, 0, 20, 21, 5);
    cg.addColorStop(0, "rgba(255,240,190,0.8)"); cg.addColorStop(1, "rgba(255,240,190,0)");
    g.fillStyle = cg; g.beginPath(); g.arc(20, 21, 5, 0, TAU); g.fill();
  });
}
// a twisted red cord: dark core, two helical highlight strands
function cord(g, pts, w) {
  const path = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]); };
  g.save();
  g.lineCap = "round";
  path(); g.strokeStyle = "#5a1410"; g.lineWidth = w; g.stroke();
  path(); g.strokeStyle = "#a8322e"; g.lineWidth = w * 0.7; g.stroke();
  g.setLineDash([w * 0.8, w * 0.9]);
  path(); g.strokeStyle = "rgba(240,150,140,0.5)"; g.lineWidth = w * 0.3; g.stroke();
  g.restore();
}
const BELL_LANDS = [[35.6, -0.42, -0.38, 0], [37.2, 0.34, -0.12, 1], [38.9, -0.06, 0.2, 2], [40.6, 0.46, -0.46, 0]];
function bellClose(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 34, 44));
  const rack = K.smooth(K.seg(t, 39.6, 41.4));
  const L = K.layer(W, H, "f17:bellbg");
  K.withCamera(L.g, W, H, { x: 480, y: 280, zoom: 1.04, shakeT: t, shakeAmt: 0.3 }, () => {
    const b = L.g;
    snowSky(b, W, H, 400, t);
    drawSnow(b, "s4", 404, 0.9, { hazeDist: 70, glints: 0 }, t);
    gate(b, 640, 405, 0.62, { haze: 0.22 });
    K.fog(b, W, H, { y: 404, h: 70, color: FOG, alpha: 0.9, t, seed: 8 });
    snow(b, W, H, t, { count: 80, seed: 4, speed: 12, size: 1.6, alpha: 0.9 });
  });
  K.dof(g, L.canvas, K.lerp(9, 1.4, rack));
  snow(g, W, H, t, { count: 10, seed: 61, speed: 16, size: 13, alpha: 0.5, soft: true, drift: 20, blur: 1.1 });
  const fgL = K.layer(W, H, "f17:bellfg");
  const fg = fgL.g;
  const cam = { x: 480, y: 290, zoom: K.lerp(1.0, 1.07, p), shakeT: t * 0.8, shakeAmt: 1.1 };
  K.withCamera(fg, W, H, cam, () => {
    // the wrist flicks at 34: the hand jolts, the bell jumps in the palm and rings
    const bump = t >= 34 ? Math.exp(-(t - 34) * 6) * Math.sin((t - 34) * 30) * 2.5 : 0;
    const ring = t >= 34 ? Math.exp(-(t - 34) * 1.4) * Math.sin((t - 34) * 11) : 0;
    const arm = armBake();
    const [bx0, by0, bs] = AR.proj(v3.add(AR.Pc, v3.add(v3.mul(AR.Nu, 0.018), v3.mul(AR.Dh, 0.004))));
    const BR = 0.0175 * bs;
    const jump = Math.max(0, ring) * BR * 0.35;
    const bx = bx0 + ring * BR * 0.12, by = by0 + bump - jump;
    // the hand, with the bell's soft shadow on the palm
    const hl = K.layer(W, H, "f17:hand");
    const h = hl.g;
    h.setTransform(fg.getTransform());
    h.drawImage(arm, arm.rx, arm.ry + bump, arm.rw, arm.rh);
    h.save();
    h.globalCompositeOperation = "source-atop";
    const sr = BR * (1.25 + jump / BR * 0.3);
    const sg = h.createRadialGradient(bx + BR * 0.15, by0 + bump + BR * 0.45, 0, bx + BR * 0.15, by0 + bump + BR * 0.45, sr);
    sg.addColorStop(0, `rgba(70,30,22,${0.6 - jump / BR * 0.6})`); sg.addColorStop(0.55, "rgba(70,30,22,0.25)"); sg.addColorStop(1, "rgba(70,30,22,0)");
    h.fillStyle = sg; h.beginPath(); h.ellipse(bx + BR * 0.15, by0 + bump + BR * 0.45, sr * 1.25, sr * 0.6, -0.15, 0, TAU); h.fill();
    h.restore();
    fg.save(); fg.setTransform(K.pixelScale(), 0, 0, K.pixelScale(), 0, 0); fg.drawImage(hl.canvas, 0, 0, W, H); fg.restore();
    // the cord from the wrist to the bell's loop
    const [wx, wy] = AR.proj(v3.add(AR.cordC, v3.mul(AR.Nu, 0.02)));
    cord(fg, [[wx, wy + bump], [(wx + bx) / 2 - 4, (wy + by) / 2 - BR * 0.6], [bx - BR * 0.05, by - BR * 1.05]], 2.4);
    // the bell
    fg.save();
    fg.translate(bx, by);
    fg.rotate(ring * 0.25);
    fg.strokeStyle = "#6a4a1a"; fg.lineWidth = BR * 0.12; fg.beginPath(); fg.ellipse(0, -BR * 1.02, BR * 0.16, BR * 0.13, 0, 0, TAU); fg.stroke();
    fg.drawImage(bellSprite(), -BR * 1.25, -BR * 1.3, BR * 2.5, BR * 2.5);
    // snowflakes land on the brass and fade in 0.6 s, leaving a tiny bead that dries
    for (let j = 0; j < BELL_LANDS.length; j++) {
      const [tl, lx0, ly0, kind] = BELL_LANDS[j];
      const lx = lx0 * BR, ly = ly0 * BR;
      const fall = t - (tl - 1.3);
      if (fall < 0) continue;
      if (t < tl) {
        const k = fall / 1.3;
        const fx = lx + Math.sin(fall * 2.6 + tl) * BR * 0.3 * (1 - k), fy = ly - (1 - k) * BR * 4;
        fg.save(); fg.translate(fx, fy); fg.rotate(tl + fall * 1.2); fg.globalAlpha = 0.9;
        fg.drawImage(crystalSprite(kind), -BR * 0.2, -BR * 0.2, BR * 0.4, BR * 0.4); fg.restore();
        continue;
      }
      const age = t - tl;
      if (age > 2) continue;
      const melt = K.smooth(age / 0.6);
      if (melt < 1) {
        fg.save(); fg.translate(lx, ly); fg.rotate(tl); fg.globalAlpha = 1 - melt;
        const r = BR * 0.2 * (1 - melt * 0.5);
        fg.drawImage(crystalSprite(kind), -r, -r, r * 2, r * 2); fg.restore();
      }
      const bead = K.env(age, 0.3, 2, 0.3, 0.8);
      if (bead > 0) { const r = BR * 0.07; fg.save(); fg.globalAlpha = bead; fg.drawImage(dropSprite(), lx - r * 1.35, ly - r * 1.35, r * 2.7, r * 2.7); fg.restore(); }
    }
    fg.restore();
    // a few crystals resting on the quilted sleeve
    for (let i = 0; i < 7; i++) {
      const fx = 120 + K.hash(i, 71) * 230, fy = 400 + K.hash(i, 72) * 110;
      const age = t - (34 + K.hash(i, 73) * 6);
      if (age < 0) continue;
      fg.save(); fg.globalAlpha = K.clamp(1 - age / 5) * 0.8;
      fg.drawImage(crystalSprite(i % 3), fx - 5, fy - 5, 10, 10);
      fg.restore();
    }
  });
  K.dof(g, fgL.canvas, rack * 5);
  snow(g, W, H, t, { count: 6, seed: 31, speed: 40, size: 16, alpha: 0.45, soft: true, drift: 30 });
}

// ================================================================================================================
// SHOT 5 [44-54] you push the giant gate; the camera stays low behind you; snow falls; a crack of light opens
// ================================================================================================================
function chunkSprite() {
  return K.sprite("f17chunk", 24, 24, (g) => {
    const gr = g.createRadialGradient(10, 9, 0, 12, 12, 11);
    gr.addColorStop(0, "#f6f7ff"); gr.addColorStop(0.55, "#e8ebf8"); gr.addColorStop(0.85, "#c5cbe8"); gr.addColorStop(1, "rgba(197,203,232,0)");
    g.fillStyle = gr; g.beginPath(); g.ellipse(12, 12, 11, 9, 0.3, 0, TAU); g.fill();
  });
}
// how far the doors stand open: a heavy crawl after the hit, then the last metre swings as the light pours in
const openAt = (t) => K.ease.inOut(K.seg(t, 46.3, 53.0)) * 0.14 + K.ease.in(K.seg(t, 52.6, 54.0)) * 0.3;
function shotPush(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 44, 54));
  const hit = t >= 46 ? Math.exp(-(t - 46) * 3) : 0;
  const open = openAt(t);
  const hot = K.smooth(K.seg(t, 52.4, 54));
  const GS = 1.5, base = 500;
  K.withCamera(g, W, H, { x: 480, y: K.lerp(252, 244, p), zoom: K.lerp(1.03, 1.1, p) + hot * 0.04, shakeT: t * 3, shakeAmt: 0.6 + hit * 6 }, () => {
    snowSky(g, W, H, 400, t);
    gate(g, 480, base, GS, { open, haze: 0, near: true });
    // the stone around the opening falls into shadow as our eyes adjust to the light
    if (hot > 0) { g.save(); g.globalAlpha = hot * 0.55; g.fillStyle = "#44445e"; g.fillRect(-100, -100, 1200, base + 100); g.restore(); }
    const hzg = g.createLinearGradient(0, -60, 0, 180);
    hzg.addColorStop(0, "rgba(226,229,244,0.85)"); hzg.addColorStop(1, "rgba(226,229,244,0)");
    g.fillStyle = hzg; g.fillRect(-100, -80, 1200, 260);
    g.save(); g.beginPath(); g.rect(-100, base - 3, 1200, 200); g.clip();
    drawSnow(g, "s5", 440, 0.55, { hazeDist: 40, offX: 3 }, t);
    if (hot > 0) { g.globalAlpha = hot * 0.5; g.fillStyle = "#44445e"; g.fillRect(-100, base - 3, 1200, 200); g.globalAlpha = 1; }
    g.restore();
    const lip = g.createLinearGradient(0, base - 12, 0, base + 12);
    lip.addColorStop(0, "rgba(232,235,250,0)"); lip.addColorStop(0.5, "rgba(236,238,252,0.9)"); lip.addColorStop(1, "rgba(236,238,252,0)");
    g.fillStyle = lip; g.fillRect(-100, base - 12, 1200, 24);
    K.aoEdge(g, -100, base, 1100, base, { width: 10, alpha: 0.18, side: 1, color: "#3a4070" });
    // the light through the gap: a white-hot seam (the hottest thing in the frame), a beam over the snow, shafts
    if (open > 0) {
      const cw = 400 * GS * open;
      g.save(); g.globalCompositeOperation = "lighter";
      const fl = g.createLinearGradient(0, base, 0, 600);
      fl.addColorStop(0, K.rgba("#fff1dc", 0.85)); fl.addColorStop(1, K.rgba("#fff1dc", 0.15));
      g.fillStyle = fl;
      g.beginPath(); g.moveTo(480 - cw * 0.45, base); g.lineTo(480 + cw * 0.45, base); g.lineTo(480 + cw * 2.6 + 30, 600); g.lineTo(480 - cw * 2.6 - 30, 600); g.closePath(); g.fill();
      g.restore();
      K.volumetricBeam(g, 480, 300, Math.PI / 2, 420, 0.5 + open * 2, { color: "#fff0d8", intensity: 0.12 + open * 1.4, t, noise: 0.5 });
      K.godRays(g, 480, 280, W, H, { color: "#fff3d8", count: 12, strength: 0.05 + open * 0.8, t, angle: Math.PI / 2, spread: 2.4, length: 700, seed: 7 });
      if (hot > 0) {
        // the core of the gap burns: pure white, slightly wider than the opening (it blooms in the lens)
        const gw = 400 * GS * open * 0.9;
        const cg = g.createLinearGradient(480 - gw, 0, 480 + gw, 0);
        cg.addColorStop(0, "rgba(255,250,240,0)"); cg.addColorStop(0.3, `rgba(255,252,246,${hot})`); cg.addColorStop(0.7, `rgba(255,252,246,${hot})`); cg.addColorStop(1, "rgba(255,250,240,0)");
        g.fillStyle = cg; g.fillRect(480 - gw, base - DH * GS, gw * 2, DH * GS);
      }
    }
    if (t >= 46) {
      const chunk = chunkSprite();
      const toS = (lx, ly) => [480 + (lx - GW / 2) * GS, base - (GH - ly) * GS];
      for (let li = 0; li < LEDGES.length; li++) {
        const [lx, ly, lw] = LEDGES[li];
        const [sx0, sy0] = toS(lx, ly);
        if (sy0 < -40 || sy0 > 560 || sx0 < -300 || sx0 > 1260) continue;
        const delay = K.hash(li, 41) * 0.35;
        const age = t - 46 - delay;
        if (age < 0) continue;
        const puff = K.env(age, 0, 2.2, 0.08, 1.6);
        if (puff > 0) powder(g, sx0 + lw * GS * 0.5, sy0 + age * 60, lw * GS * 0.6 + age * 70, puff * 0.55, li);
        for (let c = 0; c < 6; c++) {
          const a2 = age - c * 0.05;
          if (a2 < 0 || a2 > 2.4) continue;
          const vy = 900 * a2;
          const x = sx0 + (0.1 + K.hash(li * 7 + c, 42) * 0.8) * lw * GS + (K.hash(li * 7 + c, 43) - 0.5) * 40 * a2;
          const y = sy0 + 0.5 * 900 * a2 * a2;
          if (y > base + 10) continue;
          const r = (2.5 + K.hash(li * 7 + c, 44) * 6) * (GS / 1.5);
          const streak = Math.min(4, 1 + vy / 300);
          g.save(); g.globalAlpha = 0.95 * (1 - a2 / 2.4);
          g.drawImage(chunk, x - r, y - r * streak, r * 2, r * 2 * streak);
          g.restore();
        }
      }
    }
    // you, hands flat on the door, leaning in, from behind; at the end a dark silhouette against the light
    const kh = 200;
    const push = K.smooth(K.seg(t, 44.5, 46));
    const strain = Math.sin(t * 7) * 0.6 * push * (1 - hot);
    const kx = 480, ky = 512;
    K.shadowBlob(g, kx, ky + 2, 40, 7, { alpha: 0.3, color: "#3a4478" });
    if (open > 0) {
      g.save(); g.globalAlpha = cl01(open * 6) * 0.5;
      g.translate(kx, ky); g.scale(1, -0.55); g.translate(-kx, -ky);
      K.shadowBlob(g, kx, ky - 60, 26, 70, { alpha: 0.8, color: "#2a2e50" });
      g.restore();
    }
    const kl = hot > 0 ? K.layer(W, H, "f17:kid5") : null;
    const kg = kl ? kl.g : g;
    if (kl) kg.setTransform(g.getTransform());
    K.drawPerson(kg, kx, ky, kh, {
      view: "back", t, hood: true, bell: true, shadow: false, crouch: 0.08 + 0.1 * push * (1 - hot * 0.6),
      armL: { hand: [K.lerp(-11, -17, push), K.lerp(-62, -88 + strain, push)] }, armR: { hand: [K.lerp(11, 17, push), K.lerp(-62, -88 - strain, push)] },
      light: open > 0.02 ? { x: 480, y: 250, color: "#fff2dc", strength: (0.6 + open * 4) * (1 - hot * 0.75), z: -0.8 } : { x: 300, y: -300, color: "#eef0ff", strength: 0.8, z: 0.2 },
      ambient: K.mix("#8c92b6", "#262838", hot),
    });
    if (kl) {
      // against the glare the child is a dark shape with a thin bright edge
      kg.setTransform(1, 0, 0, 1, 0, 0);
      kg.globalCompositeOperation = "source-atop";
      kg.fillStyle = "rgba(20,20,32," + (hot * 0.82).toFixed(3) + ")";
      kg.fillRect(0, 0, kl.canvas.width, kl.canvas.height);
      g.save(); g.setTransform(K.pixelScale(), 0, 0, K.pixelScale(), 0, 0); g.drawImage(kl.canvas, 0, 0, W, H); g.restore();
    }
    snow(g, W, H, t, { count: 80, seed: 6, speed: 20, size: 1.4, alpha: 0.85, drift: 12, lit: open > 0 ? { x: 480, w: 60 + open * 400, k: open * 8 } : null });
  });
  snow(g, W, H, t, { count: 8, seed: 23, speed: 66, size: 10, alpha: 0.55, soft: true, drift: 30 });
}
function powder(g, x, y, r, a, seed) {
  const spr = K.sprite("f17powder" + (seed % 4), 96, 96, (s) => {
    const tx = K.texture("cloud", { seed: 60 + (seed % 4), cover: 0.6, size: 128 });
    s.drawImage(tx, 0, 0, 96, 96);
    s.globalCompositeOperation = "destination-in";
    const m = s.createRadialGradient(48, 48, 0, 48, 48, 48);
    m.addColorStop(0, "rgba(0,0,0,1)"); m.addColorStop(0.6, "rgba(0,0,0,0.6)"); m.addColorStop(1, "rgba(0,0,0,0)");
    s.fillStyle = m; s.fillRect(0, 0, 96, 96);
  });
  g.save(); g.globalAlpha *= a;
  g.drawImage(spr, x - r, y - r * 0.6, r * 2, r * 1.2);
  g.restore();
}

// ================================================================================================================
// SHOT 6 [54-70] through the gate: a staircase of clouds climbing to a sky turning rose at the horizon
// ================================================================================================================
// a cloud step: the top 30 % of the sprite is the tread (sky-lit, a rose rim where the low sun grazes its far
// edge), the rest the front face (in its own shadow, grey-violet, the thin billows underneath glowing through)
function* stepGen(i) {
  const Wd = 256, Hd = 160;
  return yield* pix(Wd, Hd, (x, y, out) => {
    const u = x / Wd, v = y / Hd;
    const ex = Math.abs(2 * u - 1);
    const n1 = fbm(u * 5, v * 3, 4, 70 + i * 7), n2 = fbm(u * 14, v * 9, 3, 90 + i * 7);
    // cauliflower billows: ridged lumps along the top and bottom boundaries
    const lumpT = 1 - Math.abs(vn(u * 11, 0.5 + i, 60 + i)), lumpB = 1 - Math.abs(vn(u * 9, 2.5 + i, 64 + i));
    const side = 1 - sstep(0.7 + n1 * 0.14, 0.98 + n1 * 0.06, ex);
    const top = 0.1 - lumpT * 0.08 + Math.abs(n2) * 0.03;
    const bot = 0.7 + n1 * 0.12 + lumpB * 0.12 - ex * ex * 0.32;
    const inT = sstep(top - 0.02, top + 0.035, v) * sstep(bot + 0.03, bot - 0.08, v) * side;
    const d = cl01(inT * (0.8 + n2 * 0.35));
    if (d < 0.01) { out[3] = 0; return; }
    // bump shading of the billows from above (sky) and from the far side (the sun behind)
    const h0 = fbm(u * 9, v * 7, 3, 80 + i), hv = fbm(u * 9, (v + 0.012) * 7, 3, 80 + i);
    const bump = cl01(0.5 + (hv - h0) * 9);
    let r, g, b;
    if (v < 0.3) {
      const rim = Math.exp(-Math.max(0, v - top) / 0.03);
      const k = 0.86 + bump * 0.14;
      r = 0.9 * k; g = 0.84 * k; b = 0.94 * k;
      r = K.lerp(r, 1.04, rim * 0.6); g = K.lerp(g, 0.86, rim * 0.6); b = K.lerp(b, 0.8, rim * 0.6);
      const lip = sstep(0.2, 0.3, v);
      r = K.lerp(r, 0.64, lip); g = K.lerp(g, 0.58, lip); b = K.lerp(b, 0.76, lip);
    } else {
      const thin = Math.exp(-Math.max(0, bot - v) / 0.06) * 0.85 + (1 - side) * 0.6;
      const k = 0.78 + bump * 0.3;
      r = 0.6 * k; g = 0.55 * k; b = 0.73 * k;
      r = K.lerp(r, 1.02, thin * 0.75); g = K.lerp(g, 0.8, thin * 0.75); b = K.lerp(b, 0.76, thin * 0.75);
    }
    out[0] = knee(r) * 255; out[1] = knee(g) * 255; out[2] = knee(b) * 255; out[3] = 255 * sstep(0.02, 0.4, d) * (1 - (1 - side) * 0.3);
  });
}
const stepSpec = (i) => ["step" + i, () => stepGen(i)];
const stepCloud = (i) => run(stepSpec(i));
// sky clouds: a density field carved by fbm; light from the low rose sun behind them (thin rims glow, dense
// undersides grey-violet), lavender sky light on their tops (marched through the density above each pixel)
const SKYC = [[384, 150, 0], [512, 96, 1], [320, 130, 2]];
function* skyCloudGen(k) {
  const [Wd, Hd, kind] = SKYC[k];
  const Dn = new Float32Array(Wd * Hd);
  const blobs = kind === 1 ? [] : [[0.24, 0.66, 0.16, 0.24], [0.4, 0.5, 0.2, 0.36], [0.56, 0.42, 0.17, 0.34], [0.72, 0.58, 0.18, 0.28], [0.48, 0.7, 0.32, 0.18], [0.86, 0.7, 0.1, 0.14]];
  for (let y = 0; y < Hd; y++) {
    const v = y / Hd;
    for (let x = 0; x < Wd; x++) {
      const u = x / Wd;
      let s;
      if (kind === 1) s = Math.exp(-Math.pow((v - 0.5 - Math.sin(u * 5 + 1) * 0.08) / 0.18, 2)) * Math.pow(Math.sin(Math.PI * u), 0.6) * 1.1;
      else {
        s = 0;
        for (const [bx, by, rx, ry] of blobs) { const dx = (u - bx) / rx, dy = (v - by) / ry; s += Math.exp(-(dx * dx + dy * dy) * 2.2); }
        s *= sstep(0.92, 0.74, v);
      }
      // billows (ridged) at the large scale, fbm erosion and wisps at the small
      const bil = 1 - Math.abs(vn(u * (kind === 1 ? 9 : 7), v * (kind === 1 ? 5 : 6), 140 + k * 11));
      const n = fbm(u * (kind === 1 ? 12 : 9), v * (kind === 1 ? 5 : 7), 5, 150 + k * 11);
      let dd = s * 1.2 + bil * 0.35 + n * 0.5 - 0.62;
      dd = dd > 0 ? dd : 0;
      Dn[y * Wd + x] = cl01(dd * 2.2);
    }
    if ((y & 3) === 3) yield;
  }
  return yield* pix(Wd, Hd, (x, y, out) => {
    const i = y * Wd + x, d = Dn[i];
    if (d < 0.01) { out[3] = 0; return; }
    let acc = 0;
    for (let s = 1; s <= 7; s++) { const yy = y - s * 3; if (yy < 0) break; acc += Dn[yy * Wd + x]; }
    const Tup = Math.exp(-acc * 0.9);
    let acd = 0;
    for (let s = 1; s <= 5; s++) { const yy = y + s * 3; if (yy >= Hd) break; acd += Dn[yy * Wd + x]; }
    // thin edges glow (the sun behind), the lower edges most (it is low); dense undersides are grey-violet
    const rim = Math.pow(1 - d, 2.6) * (0.35 + 0.65 * Math.exp(-acd * 0.7));
    let r = 0.42 + (0.9 - 0.42) * Tup, g = 0.38 + (0.86 - 0.38) * Tup, b = 0.56 + (0.97 - 0.56) * Tup;
    r += rim * 0.75; g += rim * 0.45; b += rim * 0.28;
    out[0] = knee(r) * 255; out[1] = knee(g) * 255; out[2] = knee(b) * 255; out[3] = 255 * sstep(0.01, 0.35, d);
  });
}
const skySpec = (k) => ["sky" + k, () => skyCloudGen(k)];
const skyCloud = (k) => run(skySpec(k));
const S6 = { hz: 300, f: 640, camY: 2.2 };
const N6 = 26;
const proj6 = (X, Y, Z) => [480 + (X * S6.f) / Z, S6.hz - ((Y - S6.camY) * S6.f) / Z, S6.f / Z];
function step6(i) { return { Z: 2.4 + 0.95 * i, Y: 0.16 * i + 0.004 * i * i, X: Math.sin(i * 0.55 + 0.4) * 0.28 }; }
function drawStep(g, i, alpha) {
  const s = step6(i), w = 1.5, d = 0.8, th = 0.45;
  const zf = s.Z - d / 2, zb = s.Z + d / 2;
  const [cx, yF, kf] = proj6(s.X, s.Y, zf);
  const [, yB] = proj6(s.X, s.Y, zb);
  const wF = w * kf, thick = th * kf;
  const spr = stepCloud(i % 4);
  const tread = Math.max(2, yF - yB), pad = thick * 0.18;
  g.save();
  g.globalAlpha = alpha;
  if (i % 2) { g.translate(cx, 0); g.scale(-1, 1); g.translate(-cx, 0); }
  g.drawImage(spr, 0, 0, 256, 48, cx - wF * 0.53, yB - pad, wF * 1.06, tread + pad + 1);
  g.drawImage(spr, 0, 48, 256, 112, cx - wF * 0.5, yF - 0.5, wF, thick * 1.3);
  g.restore();
}
// the child's path: one stair every 1.2 s; feet planted on each tread, a step up across each gap
function climb(t) {
  const f = Math.min(N6 - 3, 3 + Math.max(0, t - 54.2) / 1.2);
  const i = Math.floor(f), fr = f - i;
  const A = step6(i), B = step6(i + 1);
  const up = sstep(0.38, 0.66, fr);
  const X = K.lerp(A.X, B.X, fr), Z = K.lerp(A.Z, B.Z, fr), Y = K.lerp(A.Y, B.Y, up);
  const lift = Math.sin(Math.PI * sstep(0.3, 0.7, fr)) * 0.06;
  const onTread = Math.max(1 - sstep(0.36, 0.44, fr), sstep(0.58, 0.66, fr));
  return { f, i, fr, X, Y, Z, lift, onTread, under: fr < 0.5 ? i : i + 1 };
}
function shotStairs(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 54, 70));
  const dawn = K.smooth(K.seg(t, 54, 66));
  const cam = { x: 480, y: K.lerp(286, 262, p), zoom: K.lerp(1.02, 1.1, p), shakeT: t, shakeAmt: 0.45 };
  const hz = S6.hz;
  K.withCamera(g, W, H, cam, () => {
    // the sky beyond the gate: deep lavender overhead, rose at the horizon, the sun about to rise
    const sg = g.createLinearGradient(0, -120, 0, hz);
    sg.addColorStop(0, "#6e72aa"); sg.addColorStop(0.5, "#a8a6d6"); sg.addColorStop(0.82, K.mix("#e2cfe0", "#f6d2d0", dawn)); sg.addColorStop(1, K.mix("#f2dcdc", "#ffd6c8", dawn));
    g.fillStyle = sg; g.fillRect(-W, -H, W * 3, hz + H + 2);
    // the warm band along the horizon strengthens as the sun nears it
    const hb = g.createLinearGradient(0, hz - 110, 0, hz + 10);
    hb.addColorStop(0, "rgba(255,214,200,0)"); hb.addColorStop(0.7, `rgba(255,206,188,${0.25 + dawn * 0.45})`); hb.addColorStop(1, `rgba(255,222,204,${0.4 + dawn * 0.5})`);
    g.fillStyle = hb; g.fillRect(-W, hz - 110, W * 3, 122);
    K.sunGlow(g, 480, hz + 4, 14, "#ffc8a8", 0.2 + dawn * 0.5);
    // fbm cumulus and stratus, back-lit
    const drawC = (k, x, y, w, a) => { const c = skyCloud(k); g.globalAlpha = a; g.drawImage(c, x, y, w, (w * c.height) / c.width); };
    drawC(0, -120 + t * 1.6, -20, 560, 0.95);
    drawC(2, 560 + t * 1.2, 20, 460, 0.9);
    drawC(1, 120 + t * 2.4, 140, 760, 0.7);
    drawC(1, -200 + t * 2.0, 205, 620, 0.55);
    drawC(2, 640 + t * 1.6, 196, 300, 0.5);
    g.globalAlpha = 1;
    // the sea of cloud below the horizon: stratus rows in perspective
    const sea = g.createLinearGradient(0, hz, 0, H + 40);
    sea.addColorStop(0, "#f0d6da"); sea.addColorStop(0.3, "#cbc2e0"); sea.addColorStop(1, "#9e9ac6");
    g.fillStyle = sea; g.fillRect(-W, hz, W * 3, H);
    for (let r = 0; r < 6; r++) {
      const y = hz + 4 + r * r * 8 + r * 6, w = 300 + r * r * 90;
      for (let c = -1; c < 3; c++) drawC(1, ((c * w * 0.9 + r * 137 + t * (2 + r)) % (w * 3.6)) - w * 0.6, y - w * 0.06, w, 0.55 - r * 0.05);
    }
    g.globalAlpha = 1;
    K.fog(g, W, H, { y: hz + 6, h: 46, color: "#f4dcdc", alpha: 0.75, t, seed: 9 });
    // light through the gaps between the stairs
    K.godRays(g, 480, hz + 4, W, H, { color: "#ffd0c0", count: 12, strength: 0.07 + dawn * 0.16, t, angle: -Math.PI / 2, spread: 2.2, length: 600, seed: 33 });
    // the staircase, far steps first, washed into the haze with distance; the child among them
    const c = climb(t);
    const fa = 1 - cl01((t - 68.6) / 1.2);
    for (let i = N6 - 1; i >= 0; i--) {
      const s = step6(i);
      const [, sy] = proj6(s.X, s.Y, s.Z - 0.4);
      if (sy > 620) continue;
      const hzA = 1 - Math.exp(-(s.Z - 2.5) / 22);
      drawStep(g, i, 1 - hzA * 0.55);
      if (i === c.under && fa > 0) kidOnStairs(g, t, c, hz, fa);
    }
    snow(g, W, H, t, { count: 30, seed: 7, speed: 9, size: 1, alpha: 0.45, drift: 10 });
  });
  // foreground: the open gate frames the shot, back-lit and out of focus; Sir Whiskers at its foot
  const fg = K.layer(W, H, "f17:stairfg");
  K.withCamera(fg.g, W, H, cam, () => {
    const f = fg.g;
    const s = 1.9;
    f.drawImage(backlit(GATE_F, "framef"), 110 - (GM + 120) * s, 80 - 300 * s, (GW + GM * 2) * s, GH * s);
    f.save(); f.globalCompositeOperation = "lighter";
    for (const ex of [110, 850]) {
      const rg = f.createLinearGradient(ex - 10, 0, ex + 10, 0);
      rg.addColorStop(0, "rgba(255,190,170,0)"); rg.addColorStop(0.5, `rgba(255,190,170,${0.25 + dawn * 0.15})`); rg.addColorStop(1, "rgba(255,190,170,0)");
      f.fillStyle = rg; f.fillRect(ex - 10, -100, 20, 800);
    }
    f.restore();
    drawLeaf(f, backlit(DOOR_F, "doorLf"), 130, 80, 200 * s * 0.9, 600 * s * 0.92, 1, 1.32, 0.35);
    drawLeaf(f, backlit(DOORM_F, "doorRf"), 830, 80, 200 * s * 0.9, 600 * s * 0.92, -1, 1.32, 0.35);
    const tg = f.createLinearGradient(0, 470, 0, 560);
    tg.addColorStop(0, "rgba(220,214,236,0)"); tg.addColorStop(0.4, "rgba(214,208,232,0.95)"); tg.addColorStop(1, "rgba(176,172,206,1)");
    f.fillStyle = tg; f.fillRect(-100, 470, 1200, 140);
  });
  K.dof(g, fg.canvas, 2.6);
  K.withCamera(g, W, H, cam, () => {
    // Sir Whiskers bows (55-57): the head goes down, the front dips, then he straightens and watches you go
    const bow = K.env(t, 55.0, 57.0, 0.7, 0.8);
    const lv = bow * 3, l0 = Math.min(2, Math.floor(lv)), lf = lv - l0;
    const x = 205, y = 486, S = 96;
    K.shadowBlob(g, x + 6, y, 54, 8, { alpha: 0.22, color: "#3a3060" });
    g.save();
    g.translate(x - S * 0.35, y); g.rotate(bow * 0.17); g.translate(-(x - S * 0.35), -y);
    const o = (lvl) => ({ pose: "sit", facing: 1, headTurn: 0.15, headTilt: BOWT[lvl], steps: 1 });
    blitCat(g, whiskSprite(o(l0), 0, 1, "bow" + l0), x, y + bow * 4, S, WHISK_REF, 1, 1 - lf);
    if (lf > 0.01) blitCat(g, whiskSprite(o(l0 + 1), 0, 1, "bow" + (l0 + 1)), x, y + bow * 4, S, WHISK_REF, 1, lf);
    g.restore();
  });
  snow(g, W, H, t, { count: 8, seed: 24, speed: 56, size: 9, alpha: 0.5, soft: true, drift: 30 });
}
const BOWT = [0, -0.35, -0.7, -1];
function kidOnStairs(g, t, c, hz, fa) {
  const [kx, ky, ks] = proj6(c.X, c.Y, c.Z);
  const kh = 1.1 * ks;
  const lift = c.lift * ks;
  if (c.onTread > 0.02) {
    // a soft blue-violet contact shadow and the small dent the boots press into the cloud
    const sw = kh * 0.15, sh = sw * 0.22;
    g.save(); g.globalAlpha = 0.5 * c.onTread * fa;
    const ig = g.createRadialGradient(kx, ky + sh * 0.2, 0, kx, ky + sh * 0.2, sw);
    ig.addColorStop(0, "rgba(120,104,170,0.55)"); ig.addColorStop(0.7, "rgba(120,104,170,0.2)"); ig.addColorStop(1, "rgba(120,104,170,0)");
    g.fillStyle = ig; g.beginPath(); g.ellipse(kx, ky + sh * 0.2, sw * 1.2, sh * 1.6, 0, 0, TAU); g.fill();
    g.restore();
    K.shadowBlob(g, kx, ky, sw, sh, { alpha: 0.35 * c.onTread * fa / 0.55, color: "#4a3a80" });
  }
  K.drawPerson(g, kx, ky - lift, kh, { view: "back", walk: true, phase: c.f * 0.5, t, hood: true, bell: true, shadow: false,
    light: { x: 480, y: hz, color: "#ffc8a8", strength: 1.1, z: -0.65 }, ambient: "#6a6890", alpha: fa });
}

// ================================================================================================================
function frame(g, W, H, t) {
  if (t < 12) shotPlain(g, W, H, t);
  else if (t < 19.8) shotKeeper(g, W, H, t);
  else if (t < 34) {
    if (t < 20.6) shotKeeper(g, W, H, t);
    xfade(g, W, H, K.smooth(K.seg(t, 19.8, 20.6)), "f17:xf", (L) => hallway(L, W, H, t));
    if (t > 33.2) xfade(g, W, H, K.smooth(K.seg(t, 33.2, 34)), "f17:xf2", (L) => bellClose(L, W, H, t));
  } else if (t < 44) bellClose(g, W, H, t);
  else if (t < 54) shotPush(g, W, H, t);
  else shotStairs(g, W, H, t);
}

// warm the next shots' bakes during the current one: each entry is a time window and a bake spec; warm(t) steps
// the first unfinished job whose window holds t, for at most BUDGET ms (only caches change; draw stays pure)
const SNOW_S1 = snowSpec("s1", S1.hz, S1.camH, {}), SNOW_S1P = snowSpec("s1p", S1.hz, S1.camH, { prints: S1PR });
const SNOW_S2 = snowSpec("s2", S2.hz + 10, S2.camH, { hazeDist: 60, glints: 0 }), SNOW_S4 = snowSpec("s4", 404, 0.9, { hazeDist: 70, glints: 0 });
const SNOW_S5 = snowSpec("s5", 440, 0.55, { hazeDist: 40, offX: 3 });
const WALK_O = { pose: "walk", facing: 1, headTurn: -0.6 };
const groupSpec = (key, specs) => [key, function* () { for (const s of specs) yield* sub(s); return true; }];
const WARM = [
  [0, 1.0, GATE_F], [0, 1.0, DOOR_F], [0, 1.0, DOORM_F],
  [0, 1.0, hazedSpec(GATE_F, "framef", 0.42)], [0, 1.0, hazedSpec(DOOR_F, "doorLf", 0.42)], [0, 1.0, hazedSpec(DOORM_F, "doorRf", 0.42)],
  [0, 1.0, SNOW_S1], [0, 1.0, SNOW_S1P], [0, 1.0, WISP], [0, 1.0, DRIFT], [0, 1.0, POST],
  [0, 1.0, groupSpec("w:posts", [0.2, 0.3, 0.35, 0.4, 0.5, 0.55, 0.6].map((a) => hazedSpec(POST, "post", a)))],
  [0, 1.0, groupSpec("w:whisk", Array.from({ length: 8 }, (_, q) => whiskSpec(WALK_O, q, 8, "walk")))],
  [1.0, 11.5, SNOW_S2], [1.0, 11.5, FUR],
  [1.0, 11.5, hazedSpec(GATE_F, "framef", 0.12)], [1.0, 11.5, hazedSpec(DOOR_F, "doorLf", 0.12)], [1.0, 11.5, hazedSpec(DOORM_F, "doorRf", 0.12)],
  [1.5, 19.6, hallSpec("lit")], [1.5, 19.6, hallSpec("shadow")],
  [5.0, 19.6, groupSpec("w:kits", [...Array.from({ length: 8 }, (_, q) => kitSpec("walk", q)), kitSpec("stand", 0), kitSpec("sit", 0)])],
  [8.0, 33.0, ARM], [12.0, 33.0, BELL], [12.0, 33.0, SNOW_S4],
  [12.0, 33.0, hazedSpec(GATE_F, "framef", 0.22)], [12.0, 33.0, hazedSpec(DOOR_F, "doorLf", 0.22)], [12.0, 33.0, hazedSpec(DOORM_F, "doorRf", 0.22)],
  [20.0, 43.6, GATE_N], [20.0, 43.6, DOOR_N], [20.0, 43.6, DOORM_N], [26.0, 43.6, SNOW_S5],
  [34.0, 53.8, groupSpec("w:steps", [0, 1, 2, 3].map(stepSpec))], [34.0, 53.8, groupSpec("w:sky", [0, 1, 2].map(skySpec))],
  [36.0, 53.8, groupSpec("w:bow", [0, 1, 2, 3].map((l) => whiskSpec({ pose: "sit", facing: 1, headTurn: 0.15, headTilt: BOWT[l], steps: 1 }, 0, 1, "bow" + l)))],
  [40.0, 53.8, backlitSpec(GATE_F, "framef")], [40.0, 53.8, backlitSpec(DOOR_F, "doorLf")], [40.0, 53.8, backlitSpec(DOORM_F, "doorRf")],
];
function warm(t) {
  for (const [a, b, spec] of WARM) {
    if (t < a || t >= b) continue;
    const j = job(spec[0], spec[1]);
    if (j.out) continue;
    stepJob(j, BUDGET);
    return;
  }
}

// ---- lens grade per shot ----------------------------------------------------------------------------------------
const GR0 = { exposure: 0.8, hdr: 1, temp: -0.06, tint: 0.02, contrast: 1.06, sat: 0.9, lift: [0.014, 0.014, 0.024], gamma: [1, 1, 1], gain: [1, 1, 1.01], bloom: 0.22, threshold: 0.95, halation: 0.22, grain: 0.05, vignette: 0.32, ca: 0.4, weave: 0.8, streak: 0 };
const GR = {
  snow: GR0,
  mem: Object.assign({}, GR0, { exposure: 1.0, temp: 0.32, tint: 0.0, contrast: 1.1, sat: 0.95, lift: [0.012, 0.007, 0.003], gain: [1.02, 1, 0.96], bloom: 0.45, threshold: 0.9, halation: 0.55, grain: 0.09, vignette: 0.6, ca: 0.6, weave: 1.0, streak: 0.04 }),
  push: Object.assign({}, GR0, { exposure: 0.8, temp: 0.0, tint: 0.0, sat: 0.92, lift: [0.014, 0.014, 0.022], gain: [1.02, 1, 0.99], bloom: 0.42, threshold: 0.93, halation: 0.45, ca: 0.5, weave: 0.9, streak: 0.06 }),
  // the gap of light is the hottest thing in the frame: lower exposure, hot pixels pushed hard into the lens
  gap: Object.assign({}, GR0, { exposure: 0.78, hdr: 1.4, temp: 0.04, tint: 0.0, contrast: 1.18, sat: 0.9, lift: [0.006, 0.006, 0.012], gain: [1.03, 1, 0.97], bloom: 0.24, threshold: 0.95, halation: 0.75, ca: 0.6, weave: 0.9, streak: 0.3 }),
  // through the gate the eye is still adapted to the glare: over-exposed, settling within 1.6 s
  flash: Object.assign({}, GR0, { exposure: 1.7, hdr: 1.3, temp: 0.12, tint: 0.03, contrast: 0.98, sat: 0.95, lift: [0.016, 0.012, 0.026], gain: [1.03, 1, 0.98], bloom: 0.55, threshold: 0.9, halation: 0.6, vignette: 0.3, ca: 0.45, weave: 0.7, streak: 0.12 }),
  dawn: Object.assign({}, GR0, { exposure: 0.86, temp: 0.12, tint: 0.03, contrast: 1.05, sat: 0.98, lift: [0.016, 0.012, 0.026], gain: [1.03, 1, 0.98], bloom: 0.4, threshold: 0.92, halation: 0.45, vignette: 0.38, ca: 0.45, weave: 0.7, streak: 0.04 }),
};
function mixGrade(a, b, k) {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const o = {};
  for (const key of Object.keys(a)) {
    const x = a[key], y = b[key];
    o[key] = Array.isArray(x) ? x.map((v, i) => K.lerp(v, y[i], k)) : K.lerp(x, y, k);
  }
  return o;
}
function gradeAt(t) {
  if (t < 19.8) return GR.snow;
  if (t < 34) return mixGrade(mixGrade(GR.snow, GR.mem, K.smooth(K.seg(t, 19.8, 20.6))), GR.snow, K.smooth(K.seg(t, 33.2, 34)));
  if (t < 44) return GR.snow;
  if (t < 54) return mixGrade(mixGrade(GR.snow, GR.push, K.smooth(K.seg(t, 46, 48))), GR.gap, K.smooth(K.seg(t, 52.4, 54)));
  return mixGrade(GR.flash, GR.dawn, K.smooth(K.seg(t, 54, 55.6)));
}

export const film = {
  id: 17,
  title: "Brave",
  chapter: "Chapter 17",
  unlockAt: 85,
  duration: D,
  poster: 46,
  tagline: "You were braver than you knew.",
  subs: [
    [3.0, 7.0, "The End Of Cats. White and quiet."],
    [13.0, 18.0, "Someone was sure this was the end."],
    [18.3, 20.0, "It wasn't."],
    [21.5, 25.5, "When you were small, you were scared of the dark."],
    [26.0, 30.0, "He would walk ahead. And wait."],
    [30.5, 33.5, "Every time. Until you followed."],
    [35.5, 40.0, "He'd been doing it all along."],
    [47.0, 51.5, "So this time you didn't wait."],
    [56.0, 60.5, "Sir Whiskers stayed at the gate."],
    [61.0, 67.0, "The rest of the way was yours."],
  ],
  voice: [
    [3.0, "The End Of Cats. White and quiet.", { rate: 0.92, pitch: 1.0 }],
    [13.0, "Someone was sure this was the end.", { rate: 1.0, pitch: 1.1 }],
    [18.3, "It wasn't.", { rate: 1.0, pitch: 1.1 }],
    [21.5, "When you were small, you were scared of the dark.", { rate: 0.9, pitch: 1.0 }],
    [26.0, "He would walk ahead. And wait.", { rate: 0.88, pitch: 1.0 }],
    [30.5, "Every time. Until you followed.", { rate: 0.88, pitch: 1.0 }],
    [35.5, "He'd been doing it all along.", { rate: 0.88, pitch: 1.0 }],
    [47.0, "So this time you didn't wait.", { rate: 0.92, pitch: 1.0 }],
    [56.0, "Sir Whiskers stayed at the gate.", { rate: 0.9, pitch: 1.0 }],
    [61.0, "The rest of the way was yours.", { rate: 0.88, pitch: 1.0 }],
  ],
  score: { mood: "hopeful", key: "C", bpm: 76, cues: [[4, "swell"], [20, "purr"], [34, "bell"], [46, "hit"], [60, "swell"]] },
  grade: GR.snow,
  gradeAt,
  draw(g, t, W, H) {
    g.save();
    if (W !== 960 || H !== 540) g.scale(W / 960, H / 540);
    W = 960; H = 540;
    try {
      warm(t);
      // the film opens on a held white (the first second warms the opening shot's bakes), then the plain fades up
      const open = 1 - K.smooth(K.seg(t, 1.0, 2.6));
      if (open < 0.999) frame(g, W, H, t);
      K.letterbox(g, W, H, 1);
      const ta = K.env(t, 2, 6, 1.0, 1.0);
      if (ta > 0) {
        const ty = H * 0.36;
        g.save();
        g.globalAlpha = ta * 0.45;
        const band = g.createLinearGradient(0, ty - 60, 0, ty + 70);
        band.addColorStop(0, "rgba(60,64,110,0)"); band.addColorStop(0.5, "rgba(60,64,110,0.5)"); band.addColorStop(1, "rgba(60,64,110,0)");
        g.fillStyle = band; g.fillRect(0, ty - 60, W, 130);
        g.restore();
        K.title(g, W, H, "Brave", "", ta, { color: "#f4f4fa", glow: "#3a3e78", y: ty });
        g.save();
        g.globalAlpha = ta;
        g.font = "600 14px Fredoka, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
        g.shadowColor = "rgba(58,62,120,0.8)"; g.shadowBlur = 8; g.fillStyle = "#f4f4fa";
        g.fillText("C H A P T E R   1 7", W / 2, ty + 44);
        g.restore();
      }
      K.fadeColor(g, W, H, open, "#eceef8");
      // the hit at 46: a brief exposure punch
      K.fadeColor(g, W, H, 0.35 * Math.exp(-Math.max(0, t - 46) * 5) * (t >= 46 && t < 47.5 ? 1 : 0), "#fff6ea");
      K.fadeBlack(g, W, H, K.smooth(K.seg(t, 67.4, 70)));
    } finally {
      g.restore();
    }
  },
};
