// films/f05.js - Chapter 5 "The Shadow at the Gate" (FILMS.md f05). Haunted Litterbox Manor under a
// full moon: fog, iron gates, and for the first time the Shadow walking just ahead of Biscuit.
// v4 "photographed" pass (REALISM.md): one motivated key per shot (the moon behind the manor, then
// the flashlight, then the lightning, then the warm crack of the door). The moon is a slightly cool
// white; the violet of the palette lives only in the sky and the distant fog, the blacks fall to
// neutral. Every surface comes from a baked per-pixel material (coursed stone, ashlar, slate, gravel,
// heather, grass blades, rust, moss, normal-mapped carved stone, cloud density), contact occlusion,
// haze with distance, long-lens depth of field, and the GPU lens for bloom, halation, grain and grade.
// draw(g, t, W, H) is a pure function of t. Static art is cached; the caches are built ahead of need
// by a time-budgeted warm-up queue (per-pixel bakes and the big sprites advance a band of rows or one
// paint stage per call), so no single frame carries a large build during playback.
import * as K from "../filmkit.js";

const D = 64;
const LW = 960, LH = 540;
// moon: a slightly cool white key; violet only in the sky and the far fog; neutral-cool darks
const CANDLE = "#ffb35a", MOONL = "#c9d0e6", RIM = "#dfe6f6";
const NIGHT = "#22242e", FILLN = "#0e0f14", AMB = "#262a36";
const FOG_FAR = "#4c4468", FOG_MID = "#3e4152", FOG_NEAR = "#2c2e38";
const { clamp, lerp, seg, smooth, mix, rgba, hash, glow } = K;
const eio = (x) => K.ease.inOut(clamp(x));
const TAU = Math.PI * 2;
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const SHADOW = { base: "#0d0f18", light: "#151826", dark: "#07080c", stripe: "#0d0f18", tip: "#07080c", belly: "#10121a", white: "#10121a", pattern: "solid", bib: false, socks: false, muzzle: false, iris: "#0d0f18", irisInner: "#0d0f18", nose: "#0d0f18", noseEdge: "#07080c", innerEar: "#11131c", liner: "#05060a", bentEar: false, whisker: "rgba(0,0,0,0)" };
const STONE = { base: "#77757a", light: "#9a989e", dark: "#45444a", stripe: "#5a585e", tip: "#4a484e", belly: "#807e84", white: "#88868c", pattern: "solid", bib: false, socks: false, muzzle: true, iris: "#55545a", irisInner: "#626066", nose: "#4a484e", noseEdge: "#363539", innerEar: "#55545a", liner: "#2a292e", bentEar: false, stripeAlpha: 0, whisker: "rgba(0,0,0,0)", sheen: 0.2 };

// Biscuit seen by moonlight alone: the same coat with the colour mostly gone (scotopic vision)
const NIGHT_BISCUIT = Object.freeze(Object.fromEntries(Object.entries(K.COATS.biscuit).map(([k, v]) =>
  [k, typeof v === "string" && v[0] === "#" && !/iris/i.test(k) ? mix(v, "#1c1d24", 0.8) : v])));

// paint fn() into a reusable frame layer under the same transform, then pull it down toward a
// shadow colour (source-atop): a figure standing against the light reads as a dark shape whose
// only bright parts are the rim the kit gives it. No per-frame allocation.
function inShade(g, amt, color, fn) {
  const L = K.layer(LW, LH, "f05shade");
  L.g.setTransform(g.getTransform());
  fn(L.g);
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  L.g.globalCompositeOperation = "source-atop";
  L.g.fillStyle = rgba(color, amt);
  L.g.fillRect(0, 0, L.canvas.width, L.canvas.height);
  L.g.globalCompositeOperation = "source-over";
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(L.canvas, 0, 0); g.restore();
}

// ---- small canvas helpers ------------------------------------------------------------------------
function scratch(w, h) {
  const ps = K.pixelScale();
  const c = K.makeCanvas(Math.ceil(w * ps), Math.ceil(h * ps));
  const cg = c.getContext("2d");
  cg.setTransform(ps, 0, 0, ps, 0, 0);
  return { c, g: cg };
}
const SPR = (key, w, h, paint) => K.sprite(key, w, h, paint);
function poly(p, pts, close = true) {
  for (let i = 0; i < pts.length; i += 2) (i ? p.lineTo(pts[i], pts[i + 1]) : p.moveTo(pts[i], pts[i + 1]));
  if (close) p.closePath();
  return p;
}

// ---- the warm-up machinery ------------------------------------------------------------------------
// BIG: a large static sprite painted in stages (one stage per warm call), so a 960 px plate with many
// textured passes never lands in one frame. A frame that needs it before it is done finishes it
// synchronously (the pixels are the same either way, so draw stays a pure function of t).
const BIG = new Map();
function big(key, w, h, stages) {
  const ps = K.pixelScale(), k = key + "@" + ps;
  let e = BIG.get(k);
  if (!e) {
    const c = K.makeCanvas(Math.ceil(w * ps), Math.ceil(h * ps)), cg = c.getContext("2d");
    cg.setTransform(ps, 0, 0, ps, 0, 0);
    e = { c, g: cg, i: 0, st: {}, stages: stages(), w, h, k };
    e.c.lw = w; e.c.lh = h;
    BIG.set(k, e);
  }
  return e;
}
function bigStep(e) {
  if (e.i >= e.stages.length) return true;
  const g = e.g;
  g.save();
  try { e.stages[e.i](g, e.st, e.w, e.h); } catch (err) { console.warn("[f05] stage", e.i, err); }
  g.restore();
  g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.filter = "none";
  if (++e.i >= e.stages.length) e.st = null;
  return e.i >= e.stages.length;
}
function bigGet(e) { while (!bigStep(e)); return e.c; }
// a staged sprite as one accessor: S() -> finished canvas, S.step() -> one stage (a warm job)
function staged(key, w, h, stages) {
  const S = () => bigGet(big(key, w, h, stages));
  S.step = () => bigStep(big(key, w, h, stages));
  return S;
}
// a blur done in horizontal bands (the filter only runs over each band's source rows plus a margin)
function blurBands(src, blurPx, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((g, st, w, h) => {
    const ps = K.pixelScale(), y0 = (h / n) * i, y1 = (h / n) * (i + 1), m = blurPx * 3;
    const S = src(st);
    g.beginPath(); g.rect(0, y0, w, y1 - y0); g.clip();
    if (K.hasFilter() && blurPx > 0.2) g.filter = `blur(${K.qblur((blurPx * ps).toFixed(2))}px)`;
    const a = Math.max(0, y0 - m), b = Math.min(h, y1 + m);
    g.drawImage(S, 0, a * ps, S.width, (b - a) * ps, 0, a, w, b - a);
  });
  return out;
}
// a soft (out of focus) plate: painted in stages into a scratch, then blurred into the sprite in bands
function softPlate(key, w, h, blurPx, paintStages, bands = 4) {
  return staged(key, w, h, () => [
    (g, st) => { st.T = scratch(w, h); },
    ...paintStages.map((f) => (g, st) => { st.T.g.save(); f(st.T.g, w, h); st.T.g.restore(); }),
    ...blurBands((st) => st.T.c, blurPx, bands),
  ]);
}

// the queue: jobs return true once their result is cached; each call does at most one slice of work
let DEADLINE = 0;
function runJobs(list, ms) {
  const end = now() + ms;
  for (const j of list) {
    while (!j()) if (now() >= end) return false;
    if (now() >= end) return false;
  }
  return true;
}
const once = (fn) => { let done = false; return () => (done || (fn(), done = true)); };

// ---- materials: tiling rasters baked once per film (per-pixel fbm / voronoi / height fields) ---------
// each is baked at n x n in bands of rows (the warm queue advances one time-boxed band per call), then
// bilinear-upscaled 2x into the tile. A frame that needs it early finishes the bake synchronously.
const BK = new Map();
const MATS = {};
function bakeStep(name, untilMs) {
  let b = BK.get(name);
  const M = MATS[name];
  if (!b) { const n = M.n || 256; const c = K.makeCanvas(n, n); const cg = c.getContext("2d"); b = { n, c, cg, img: cg.createImageData(n, n), y: 0, tile: null }; BK.set(name, b); }
  if (b.tile) return true;
  const n = b.n, P = b.img.data, out = [0, 0, 0, 255], fn = M.fn;
  do {
    const y = b.y;
    for (let x = 0; x < n; x++) {
      out[3] = 255;
      fn(x / n, y / n, out, x, y);
      const i = (y * n + x) * 4;
      let h = Math.imul((y * n + x) ^ 0x5bd1e995, 0x27d4eb2d); h ^= h >>> 15;
      const gN = M.grain === 0 ? 0 : ((h & 255) - 128) * (M.grain || 0.05);
      P[i] = out[0] + gN; P[i + 1] = out[1] + gN; P[i + 2] = out[2] + gN; P[i + 3] = out[3];
    }
    b.y++;
  } while (b.y < n && now() < untilMs);
  if (b.y < n) return false;
  b.cg.putImageData(b.img, 0, 0);
  b.img = null;
  const T = K.makeCanvas(n * 2, n * 2), tg = T.getContext("2d");
  tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = "high";
  tg.drawImage(b.c, 0, 0, n * 2, n * 2);
  b.tile = T;
  return true;
}
const mat = (name) => { bakeStep(name, Infinity); return BK.get(name).tile; };
const matJob = (name) => () => bakeStep(name, DEADLINE);
const brickTex = () => mat("brick"), gravelTex = () => mat("gravel"), stoneTex = () => mat("stone");
const fbm = K.texFbm, tnoise = K.texNoise;
// coursed rubble-stone (manor walls, posts): per-block value, occlusion in the joints
MATS.brick = { n: 128, fn: (u, v, out) => {
  const Y = v * 8, row = Math.floor(Y), fy = Y - row;
  const X = u * 4 + (row & 1) * 0.5, cf = Math.floor(X), fx = X - cf, col = ((cf % 4) + 4) % 4;
  const n = fbm(u * 16, v * 16, 7, 4, 16, 16);
  const grit = tnoise(u * 64, v * 64, 9, 64, 64);
  const m = 3.4 + n * 2.6;
  const dx = Math.min(fx, 1 - fx) * 128, dy = Math.min(fy, 1 - fy) * 64;
  const d = Math.min(dx, dy) - m;
  if (d < 0) { const k = 40 + grit * 12 + n * 14 + Math.max(0, d + 1.5) * 10; out[0] = k; out[1] = k; out[2] = k * 1.03; return; }
  const id = col * 8 + row, h = K.hash(id, 17), h2 = K.hash(id, 23);
  let val = 0.66 + h * 0.46 + n * 0.2 + grit * 0.06;
  const pit = tnoise(u * 48, v * 48, 11, 48, 48);
  if (pit > 0.5) val *= 1 - (pit - 0.5) * 0.9;
  val *= 1 - 0.55 * Math.exp(-d / 4.5);
  if (fy < 0.5 && dy - m < 3.5 && dy < dx) val *= 1.12;
  if (fy > 0.5 && dy - m < 4 && dy < dx) val *= 0.82;
  out[0] = 128 * val * (1 + (h2 - 0.5) * 0.12); out[1] = 124 * val; out[2] = 122 * val * (1 - (h2 - 0.5) * 0.1);
} };
// wet gravel: pebble domes lit from above, dark wet gaps, a tight specular point on some crowns
MATS.gravel = { n: 256, fn: (u, v, out) => {
  const P = 40, V = K.texVoronoi(u * P, v * P, 5, P, P);
  const id = V.id >>> 0, edge = V.f2 - V.f1;
  const h = (id % 997) / 997, h2 = ((id >>> 11) % 991) / 991;
  const n = fbm(u * 24, v * 24, 3, 3, 24, 24);
  const fine = tnoise(u * 100, v * 100, 13, 100, 100);
  let val, r, g, b;
  if (edge < 0.06) { val = 0.12 + n * 0.05 + edge; r = g = b = 255 * val; }
  else {
    const ox = u * P - V.cx, oy = v * P - V.cy;
    val = 0.36 + h * 0.36 + n * 0.12 + fine * 0.05 - ox * 0.18 - oy * 0.34;
    val *= 0.7 + 0.3 * clamp((edge - 0.06) * 7);
    r = 255 * val * (1 + (h2 - 0.5) * 0.16); g = 255 * val * (0.98 + (h - 0.5) * 0.05); b = 255 * val * (0.98 - (h2 - 0.5) * 0.08);
    const sd = Math.hypot(ox + 0.1, oy + 0.16);
    if (h2 > 0.35 && sd < 0.09) { const k = 1 - sd / 0.09; r += 260 * k; g += 260 * k; b += 265 * k; }
  }
  out[0] = r; out[1] = g; out[2] = b;
} };
// weathered granite: cracks, lichen, moss in the cracks
MATS.stone = { n: 128, fn: (u, v, out) => {
  const n = fbm(u * 6, v * 6, 41, 5, 6, 6);
  const gr = tnoise(u * 96, v * 96, 43, 96, 96);
  const cr = K.texRidged(u * 4, v * 4, 45, 4, 4, 4);
  const li = fbm(u * 10, v * 10, 47, 4, 10, 10);
  const ly = tnoise(u * 22, v * 22, 49, 22, 22);
  let val = 0.6 + n * 0.24 + (gr > 0.45 ? 0.1 : gr < -0.5 ? -0.12 : 0);
  if (cr > 0.86) val *= 1 - (cr - 0.86) * 4.5;
  let r = 124 * val, g = 122 * val, b = 122 * val;
  const L = clamp((li - 0.2) * 7);
  if (L > 0) {
    const lr = ly > 0.3 ? 168 : 146, lg = ly > 0.3 ? 160 : 156, lb = ly > 0.3 ? 100 : 122;
    const e = L < 0.35 ? 0.7 : 1;
    r = lerp(r, lr * e * (0.8 + val * 0.3), L * 0.85); g = lerp(g, lg * e * (0.8 + val * 0.3), L * 0.85); b = lerp(b, lb * e * (0.8 + val * 0.3), L * 0.85);
  }
  if (cr > 0.78 && li > -0.15) { const k = clamp((cr - 0.78) * 6) * 0.8; r = lerp(r, 34, k); g = lerp(g, 50, k); b = lerp(b, 24, k); }
  out[0] = r; out[1] = g; out[2] = b;
} };
// heather and rough grass: clumps, dark gaps, brown-olive mix
MATS.heather = { n: 128, fn: (u, v, out) => {
  const n = fbm(u * 8, v * 8, 61, 4, 8, 8);
  const c = fbm(u * 28, v * 28, 63, 3, 28, 28);
  const hue = fbm(u * 5, v * 5, 65, 2, 5, 5);
  const clump = clamp((c + 0.15) * 2.2);
  const fine = tnoise(u * 64, v * 64, 67, 64, 64);
  const val = 0.3 + clump * 0.5 + n * 0.25 + fine * 0.1;
  const h = clamp(hue * 1.6 + 0.5);
  out[0] = val * lerp(104, 92, h); out[1] = val * lerp(92, 104, h); out[2] = val * lerp(86, 66, h);
} };
// grass blades seen from a low angle: thin vertical strokes (high frequency across, low along), clumped,
// pale tips where the blades catch the sky, dark between
MATS.blades = { n: 128, fn: (u, v, out) => {
  const s = tnoise(u * 64, v * 4, 71, 64, 4), s2 = tnoise(u * 128, v * 6, 72, 128, 6);
  const cl = fbm(u * 6, v * 6, 73, 3, 6, 6);
  const tip = clamp((fbm(u * 32, v * 3, 74, 2, 32, 3) + 0.2) * 1.6);
  const blade = clamp((s * 0.6 + s2 * 0.5) * 1.4 + 0.45);
  const val = (0.18 + blade * 0.5 * (0.6 + cl * 0.6)) * (0.8 + tip * 0.45);
  out[0] = val * 92; out[1] = val * 104; out[2] = val * 84;
} };
// cloud / fog density (white, alpha = density): domain-warped fbm, tileable
MATS.cloud = { n: 128, grain: 0, fn: (u, v, out) => {
  const w = fbm(u * 3, v * 3, 81, 3, 3, 3);
  const n = fbm(u * 4 + w * 0.6, v * 4 + w * 0.4, 83, 5, 4, 4);
  const d = clamp((n * 0.5 + 0.5 - 0.34) * 2.3);
  out[0] = out[1] = out[2] = 255; out[3] = 255 * d * d * (3 - 2 * d);
} };
// slate roofing: courses of slates, the course above overlapping (a dark lip), per-slate tone, lichen
MATS.slate = { n: 128, fn: (u, v, out) => {
  const Y = v * 10, row = Math.floor(Y), fy = Y - row;
  const X = u * 6 + (row & 1) * 0.5 + K.hash(row, 5) * 0.3, cf = Math.floor(X), fx = X - cf;
  const id = cf * 31 + row * 7, h = K.hash(id, 3), h2 = K.hash(id, 9);
  const n = fbm(u * 12, v * 30, 91, 3, 12, 30), li = fbm(u * 9, v * 9, 93, 3, 9, 9);
  let val = 0.55 + h * 0.3 + n * 0.12;
  if (fy < 0.16) val *= 0.35 + fy * 3.4;
  if (fy > 0.9) val *= 1.15;
  const jx = Math.min(fx, 1 - fx);
  if (jx < 0.03) val *= 0.35 + jx * 18;
  let r = 82 * val, g = 84 * val, b = 92 * val * (1 + (h2 - 0.5) * 0.1);
  if (li > 0.35) { const k = clamp((li - 0.35) * 4) * 0.6; r = lerp(r, 110 * val + 20, k); g = lerp(g, 112 * val + 20, k); b = lerp(b, 84 * val, k); }
  out[0] = r; out[1] = g; out[2] = b;
} };
// weathered oak: horizontal planks, open grain, darker seams
MATS.wood = { n: 128, fn: (u, v, out) => {
  const P = v * 4, pl = Math.floor(P), fp = P - pl;
  const gr = fbm(u * 3, v * 48, 101 + pl, 3, 3, 48), fine = tnoise(u * 90, v * 90, 103, 90, 90);
  let val = 0.62 + K.hash(pl, 7) * 0.2 + gr * 0.22 + fine * 0.05;
  if (fp < 0.04 || fp > 0.96) val *= 0.3;
  out[0] = 92 * val; out[1] = 66 * val; out[2] = 46 * val;
} };
// irregular ashlar for the close facade: courses of varying height, stones of varying length, worn and
// chipped arrises, per-stone tone, pitting, recessed mortar of varying width
const ASH_ROWS = (() => { const r = [0]; let y = 0; for (let i = 0; i < 9; i++) { y += 0.7 + K.hash(i, 51) * 0.6; r.push(y); } return r.map((x) => x / y); })();
MATS.ashlar = { n: 256, fn: (u, v, out) => {
  let row = 0; while (row < ASH_ROWS.length - 2 && v >= ASH_ROWS[row + 1]) row++;
  const y0 = ASH_ROWS[row], y1 = ASH_ROWS[row + 1], fy = (v - y0) / (y1 - y0), rh = (y1 - y0) * 256;
  // stone joints in this course: cumulative random lengths, tiling at u = 1
  let x0 = K.hash(row, 61) * 0.2, k = 0, sx0 = x0 - 1, sx1 = x0;
  let uu = u; if (uu < x0) uu += 1;
  while (k < 12) { const L = 0.11 + K.hash(row * 17 + k, 63) * 0.16; if (uu < sx1 + L) { sx0 = sx1; sx1 = sx1 + L; break; } sx1 += L; k++; }
  const fx = (uu - sx0) / (sx1 - sx0), sw = (sx1 - sx0) * 256;
  const id = row * 19 + k;
  const n = fbm(u * 10, v * 10, 111, 4, 10, 10), grit = tnoise(u * 90, v * 90, 113, 90, 90);
  const wear = fbm(u * 40, v * 40, 115, 2, 40, 40);
  const m = 1.6 + wear * 1.4 + Math.abs(n) * 1.2;
  const dx = Math.min(fx * sw, (1 - fx) * sw), dy = Math.min(fy * rh, (1 - fy) * rh);
  const d = Math.min(dx, dy) - m;
  if (d < 0) { const kk = 34 + grit * 10 + n * 10; out[0] = kk * 1.04; out[1] = kk; out[2] = kk * 0.96; return; }
  const h = K.hash(id, 67), h2 = K.hash(id, 69);
  let val = 0.62 + h * 0.34 + n * 0.22 + grit * 0.07;
  const pit = tnoise(u * 70, v * 70, 117, 70, 70);
  if (pit > 0.48) val *= 1 - (pit - 0.48) * 0.8;
  val *= 1 - 0.5 * Math.exp(-d / 2.2);
  if (fy < 0.5 && dy < dx && d < 3) val *= 1.1;
  if (fy > 0.5 && dy < dx && d < 3) val *= 0.84;
  out[0] = 128 * val * (1 + (h2 - 0.5) * 0.16); out[1] = 120 * val * (1 + (h - 0.5) * 0.05); out[2] = 110 * val * (1 - (h2 - 0.5) * 0.12);
} };
// iron with rust: blotchy oxide over black, pitting
MATS.rust = { n: 128, fn: (u, v, out) => {
  const n = fbm(u * 8, v * 8, 121, 4, 8, 8), p = tnoise(u * 60, v * 60, 123, 60, 60), f = fbm(u * 24, v * 24, 125, 2, 24, 24);
  const r = clamp((n + 0.05) * 2.4);
  let val = 0.6 + f * 0.2;
  if (p > 0.45) val *= 0.4;
  out[0] = lerp(26, 104, r) * val; out[1] = lerp(25, 54, r) * val; out[2] = lerp(28, 32, r) * val;
} };
// moss cushion: clumps (voronoi domes) lit from the upper right, bright yellow-green tips, black gaps
MATS.moss = { n: 128, fn: (u, v, out) => {
  const P = 18, V = K.texVoronoi(u * P, v * P, 131, P, P);
  const ox = u * P - V.cx, oy = v * P - V.cy, e = V.f2 - V.f1;
  const n = fbm(u * 40, v * 40, 133, 2, 40, 40);
  const dome = clamp(1 - V.f1 * 1.5);
  let val = 0.15 + dome * 0.5 + (ox * 0.35 - oy * 0.45) * dome + n * 0.12;
  if (e < 0.08) val *= 0.4;
  val = clamp(val, 0, 1.2);
  const tip = clamp((val - 0.7) * 3);
  out[0] = 46 * val + 60 * tip; out[1] = 72 * val + 70 * tip; out[2] = 26 * val + 14 * tip;
} };
// carved stone relief as an overlay map: a height field (fbm + pits + chisel ridges) lit from the upper
// right by its finite-difference normal; 128 = flat, darker = facing away, lighter = facing the key
const stoneH = (u, v) => fbm(u * 5, v * 5, 141, 4, 5, 5) * 0.6 + fbm(u * 22, v * 22, 143, 2, 22, 22) * 0.18 - Math.max(0, tnoise(u * 40, v * 40, 145, 40, 40) - 0.35) * 1.4;
MATS.stoneN = { n: 128, grain: 0.03, fn: (u, v, out) => {
  const e = 1 / 128, h0 = stoneH(u, v), hx = stoneH(u + e, v), hy = stoneH(u, v + e);
  const nx = (h0 - hx) * 9, ny = (h0 - hy) * 9, nz = 1, l = Math.hypot(nx, ny, nz);
  const dl = (nx * 0.62 + ny * -0.55 + nz * 0.56) / l;
  const val = 128 + (dl - 0.56) * 260 + h0 * 26;
  out[0] = out[1] = out[2] = val;
} };
// fill a path with a baked material (o.scale = on-screen tile size)
function matFill(g, tex, path, o = {}) {
  const TS = tex.width;
  const pat = g.createPattern(tex, "repeat");
  const sc = (o.scale || TS) / TS, sy = (o.scaleY || o.scale || TS) / TS, r = o.rot || 0, cs = Math.cos(r), sn = Math.sin(r);
  if (pat.setTransform && typeof DOMMatrix !== "undefined") pat.setTransform(new DOMMatrix([cs * sc, sn * sc, -sn * sy, cs * sy, (o._x || 0) + (o.ox || 0), (o._y || 0) + (o.oy || 0)]));
  g.save();
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  if (o.mode) g.globalCompositeOperation = o.mode;
  g.fillStyle = pat; g.fill(path);
  if (o.tint) { g.globalCompositeOperation = "multiply"; g.globalAlpha = (o.alpha == null ? 1 : o.alpha) * (o.tintAlpha == null ? 0.6 : o.tintAlpha); g.fillStyle = o.tint; g.fill(path); }
  g.restore();
}
const matRect = (g, tex, x, y, w, h, o = {}) => { const p = new Path2D(); p.rect(x, y, w, h); matFill(g, tex, p, { ...o, _x: x + (o._x || 0), _y: y + (o._y || 0) }); };
// a texture on a path, then a multiply tint toward night (moonlight carries little colour)
function nightMat(s, name, path, o, tint = NIGHT, ta = 0.7) { matFill(s, mat(name), path, { ...o, tint, tintAlpha: ta }); }
// coursed stone: the brick coursing with the granite overlaid for mineral grain and lichen
function masonry(s, path, o) {
  const sc = o.scale || 60, off = (o.seed || 3) * 97;
  matFill(s, brickTex(), path, { scale: sc * 1.15, _x: o._x, _y: o._y, ox: off });
  matFill(s, stoneTex(), path, { scale: sc * 2.2, _x: o._x, _y: o._y, ox: off * 1.7, mode: "overlay", alpha: 0.55 + 0.4 * (o.lichen == null ? 0.35 : o.lichen) });
  s.save();
  s.globalCompositeOperation = "multiply";
  s.fillStyle = rgba(o.tint || NIGHT, o.tintAlpha == null ? 0.72 : o.tintAlpha);
  s.fill(path);
  s.restore();
}
// a lightning bolt: midpoint-displaced main channel with forked branches (seeded, static per strike).
// Painted as a wide faint glow plus a 255-white core: the lens turns the core into the bloom/halation.
function boltPath(x0, y0, x1, y1, seed) {
  const R = K.rng("f05bolt" + seed), segs = [];
  const sub = (ax, ay, bx, by, dev, depth, w) => {
    if (depth === 0) { segs.push([ax, ay, bx, by, w]); return; }
    const mx = (ax + bx) / 2 + (R() - 0.5) * dev, my = (ay + by) / 2 + (R() - 0.5) * dev * 0.3;
    sub(ax, ay, mx, my, dev * 0.55, depth - 1, w);
    sub(mx, my, bx, by, dev * 0.55, depth - 1, w);
    if (w > 0.5 && depth >= 2 && R() < 0.42) {
      const a = Math.atan2(by - ay, bx - ax) + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.6), l = Math.hypot(bx - ax, by - ay) * (0.7 + R() * 0.8);
      sub(mx, my, mx + Math.cos(a) * l, my + Math.sin(a) * l, dev * 0.5, depth - 1, w * 0.5);
    }
  };
  sub(x0, y0, x1, y1, Math.hypot(x1 - x0, y1 - y0) * 0.35, 6, 1);
  return segs;
}
const BOLTS = new Map();
function bolt(g, x0, y0, x1, y1, seed, a) {
  if (!(a > 0.01)) return;
  const key = [x0, y0, x1, y1, seed].join(",");
  let segs = BOLTS.get(key);
  if (!segs) { segs = boltPath(x0, y0, x1, y1, seed); BOLTS.set(key, segs); }
  glow(g, (x0 + x1) / 2, y0 + 60, 520, "#8e94c8", 0.5 * a);
  glow(g, (x0 + x1) / 2, (y0 + y1) / 2, Math.abs(y1 - y0) * 0.7, "#c8ccf0", 0.4 * a);
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round"; g.lineJoin = "round";
  for (const [wMul, col, al] of [[9, "rgba(150,160,255,", 0.08], [3.5, "rgba(200,210,255,", 0.3], [1.3, "rgba(255,255,255,", 1]]) {
    for (const [ax, ay, bx, by, w] of segs) {
      g.strokeStyle = col + (al * a * (w < 1 ? 0.65 : 1)).toFixed(3) + ")";
      g.lineWidth = Math.max(0.6, wMul * w);
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
  }
  g.restore();
}
// the lightning lights the frame for a few frames: a cool skylight wash (screen)
function flashWash(g, amt) {
  if (!(amt > 0.01)) return;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "screen";
  g.fillStyle = `rgba(150,156,190,${0.22 * clamp(amt)})`;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  g.restore();
}
// moonlit fog band (kit fog), drifting
function mist(c, t, y, h, seed, a, color = FOG_MID, fill = false, speed = 2) {
  K.fog(c, LW, LH, { y, h, color, alpha: a * (0.85 + 0.15 * Math.sin(t * 0.6 + seed)), t: t * speed, seed, fill });
}
// a baked material laid on a ground plane in true perspective, strip by strip (cache builders only)
const MIPS = new WeakMap();
function vMips(tex) {
  let m = MIPS.get(tex);
  if (m) return m;
  m = [tex];
  for (let k = 1; k <= 5; k++) {
    const p = m[k - 1], c = K.makeCanvas(p.width, Math.max(2, p.height >> 1)), cg = c.getContext("2d");
    cg.imageSmoothingEnabled = true; cg.imageSmoothingQuality = "high";
    cg.drawImage(p, 0, 0, c.width, c.height);
    m.push(c);
  }
  MIPS.set(tex, m);
  return m;
}
function planeStrips(g, tex, o) {
  const TS = tex.width;
  const hz = o.hz, y1 = o.y1 == null ? LH : o.y1, y0 = Math.max(o.y0 == null ? hz : o.y0, hz + 0.5);
  const x0 = o.x0 == null ? -20 : o.x0, x1 = o.x1 == null ? LW + 20 : o.x1, cx = o.cx == null ? LW / 2 : o.cx;
  const T = o.tile || 200, Kv = (y1 - hz) / (T * (o.squash || 0.4)) * T / TS;
  const mips = vMips(tex), pats = mips.map((m) => g.createPattern(m, "repeat"));
  const ps = K.pixelScale();
  g.save();
  if (o.clip) g.clip(o.clip);
  let y = y0;
  while (y < y1) {
    const yb = Math.min(y1, y + Math.max(0.75, (y - hz) * 0.045)), ym = (y + yb) / 2;
    const sx = (T * (ym - hz) / (y1 - hz)) / TS;
    const Va = Kv / (y - hz) * TS, Vb = Kv / (yb - hz) * TS;
    const lv = Math.max(0, Math.min(5, Math.floor(Math.log2(Math.max(1, (Va - Vb) / ((yb - y) * ps)))))), f = 1 << lv;
    const sy = (yb - y) / (Va - Vb) * f;
    g.save();
    g.fillStyle = pats[lv];
    g.transform(sx, 0, 0, sy, cx + (o.ox || 0) * sx * TS, y + (Va / f) * sy);
    g.fillRect((x0 - cx) / sx - (o.ox || 0) * TS, -Va / f, (x1 - x0) / sx, (yb - y + 0.7) / sy);
    g.restore();
    y = yb;
  }
  if (o.tint) { g.globalCompositeOperation = "multiply"; g.fillStyle = rgba(o.tint, o.tintAlpha == null ? 0.7 : o.tintAlpha); g.fillRect(x0, y0, x1 - x0, y1 - y0); g.globalCompositeOperation = "source-over"; }
  if (o.fog) {
    const fg = g.createLinearGradient(0, hz, 0, y1), fa = o.fogAmt == null ? 0.9 : o.fogAmt;
    for (const [s, k] of [[0, 1], [0.04, 0.85], [0.12, 0.55], [0.3, 0.25], [0.6, 0.08], [1, 0]]) fg.addColorStop(s, rgba(o.fog, fa * k));
    g.fillStyle = fg; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  g.restore();
}
// a rough natural ground in depth: horizontal bands, each tiled at the scale its distance calls for,
// squashed by the viewing angle, offset at random (no radial perspective streaks)
function bandFill(g, tex, o) {
  const TS = tex.width;
  const hz = o.hz, y1 = o.y1 == null ? LH : o.y1, R = K.rng("band" + (o.seed || 1));
  g.save();
  if (o.clip) g.clip(o.clip);
  if (o.alpha != null) g.globalAlpha = o.alpha;
  if (o.mode) g.globalCompositeOperation = o.mode;
  const pat = g.createPattern(tex, "repeat");
  let y = o.y0 == null ? hz : o.y0;
  while (y < y1) {
    const d = clamp((y - hz) / (y1 - hz)), h = Math.max(3, 4 + d * 26), tile = lerp(o.far || 40, o.near || 320, d), sc = tile / TS;
    g.save();
    g.beginPath(); g.rect(-20, y, LW + 40, h + 1); g.clip();
    g.translate(R() * TS * sc, y - R() * TS * sc * 0.5);
    g.scale(sc, sc * (o.squash || 0.45) * (0.6 + d * 0.8));
    g.fillStyle = pat; g.fillRect(-TS, -TS, (LW + 40) / sc + TS * 2, TS * 4);
    g.restore();
    y += h;
  }
  if (o.tint) { g.globalCompositeOperation = "multiply"; g.globalAlpha = 1; g.fillStyle = rgba(o.tint, o.tintAlpha == null ? 0.7 : o.tintAlpha); g.fillRect(-20, hz, LW + 40, y1 - hz); }
  g.restore();
}
// a soft occlusion pool where a mass meets the ground (multiply-ish dark radial)
function groundAO(g, x, y, w, h, a = 0.6) {
  g.save();
  g.translate(x, y); g.scale(1, h / w);
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, w);
  rg.addColorStop(0, `rgba(0,0,0,${a})`); rg.addColorStop(0.45, `rgba(0,0,0,${a * 0.45})`); rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg; g.fillRect(-w, -w, w * 2, w * 2);
  g.restore();
}
// a full-width drifting fog sheet: the cloud density tiled twice the frame wide, coloured once, built in
// row bands; drawn scrolling (parallax per sheet). mask "low" fades toward the ground, "high" toward the top.
const SHEETS = new Map();
function fogSheetS(seed, h, color, mask, sx = 420, sy = 150, cover = 1) {
  const key = `f05fs${seed}_${h}_${color}_${mask}_${sx}_${sy}_${cover}`;
  let S = SHEETS.get(key);
  if (S) return S;
  const n = Math.max(1, Math.ceil(h / 48));
  const bands = [];
  for (let i = 0; i < n; i++) bands.push((s, st, w) => {
    const y0 = (h / n) * i, y1 = Math.min(h, (h / n) * (i + 1));
    s.save(); s.beginPath(); s.rect(0, y0, w, y1 - y0); s.clip();
    matRect(s, mat("cloud"), 0, 0, w, h, { scale: sx, scaleY: sy, ox: seed * 137, oy: seed * 53 });
    if (cover !== 1) { s.globalCompositeOperation = "destination-in"; s.globalAlpha = cover; s.fillStyle = "#000"; s.fillRect(0, y0, w, y1 - y0); s.globalAlpha = 1; }
    s.globalCompositeOperation = "destination-in";
    const m = s.createLinearGradient(0, 0, 0, h);
    if (mask === "low") { m.addColorStop(0, "rgba(0,0,0,0)"); m.addColorStop(0.35, "rgba(0,0,0,0.9)"); m.addColorStop(0.7, "rgba(0,0,0,0.55)"); m.addColorStop(1, "rgba(0,0,0,0.25)"); }
    else if (mask === "band") { m.addColorStop(0, "rgba(0,0,0,0)"); m.addColorStop(0.3, "rgba(0,0,0,1)"); m.addColorStop(0.75, "rgba(0,0,0,0.85)"); m.addColorStop(1, "rgba(0,0,0,0)"); }
    else { m.addColorStop(0, "rgba(0,0,0,0)"); m.addColorStop(0.4, "rgba(0,0,0,1)"); m.addColorStop(1, "rgba(0,0,0,0.85)"); }
    s.fillStyle = m; s.fillRect(0, y0, w, y1 - y0);
    s.globalCompositeOperation = "source-in";
    s.fillStyle = color; s.fillRect(0, y0, w, y1 - y0);
    s.restore();
  });
  S = staged(key, LW * 2, h, () => bands);
  SHEETS.set(key, S);
  return S;
}
const fogSheet = (seed, h, color, mask) => fogSheetS(seed, h, color, mask)();
function drawSheet(c, spr, t, y, h, speed, alpha) {
  const x = -((((t * speed) % LW) + LW) % LW);
  c.save(); c.globalAlpha = alpha;
  c.drawImage(spr, x, y, LW * 2, h);
  if (x + LW * 2 < LW) c.drawImage(spr, x + LW * 2, y, LW * 2, h);
  c.restore();
}

// ---- sky ----------------------------------------------------------------------------------------------
// the violet lives here: a deep night sky, warmer-violet glow low over the horizon (distant air)
function paintSky(s) {
  K.sky(s, LW, LH, { top: "#040409", mid: "#100d1e", bottom: "#2c2642", horizon: 0.68, night: true, haze: 0.8, glow: "#3a2e48" });
  K.stars(s, LW, LH, 51, 0.55, 0, { yMax: LH * 0.45 });
}
const skySprite = () => SPR("f05sky4", LW, LH, paintSky);
// the moon disc: limb darkening, maria (low-frequency fbm), small craters; slightly cool white
MATS.moon = { n: 96, grain: 0, fn: (u, v, out) => {
  const x = u * 2 - 1, y = v * 2 - 1, r2 = x * x + y * y;
  if (r2 > 1) { out[3] = 0; return; }
  const mu = Math.sqrt(1 - r2);
  const limb = 0.62 + 0.38 * Math.pow(mu, 0.55);
  const mar = fbm(u * 2.2 + 3.1, v * 2.2 + 1.7, 151, 4);
  const maria = mar > 0.06 ? 0.72 + 0.1 * clamp(1 - (mar - 0.06) * 6) : 1;
  const cr = tnoise(u * 18, v * 18, 153), cr2 = tnoise(u * 40, v * 40, 155);
  const val = limb * maria * (1 + (cr > 0.55 ? -0.08 : 0) + cr2 * 0.04) * (0.97 + 0.03 * fbm(u * 8, v * 8, 157, 2));
  out[0] = 244 * val; out[1] = 246 * val; out[2] = 252 * val;
  out[3] = 255 * clamp((1 - Math.sqrt(r2)) * 48);
} };
function moonDisc(c, x, y, r) {
  const T = mat("moon");
  glow(c, x, y, r * 1.25, "#f4f6ff", 0.35);
  c.drawImage(T, x - r, y - r, r * 2, r * 2);
}
// thin moonlit stratus deck: cloud density stretched, recoloured once, cached twice the frame wide
const cloudBandS = (seed, h, color) => fogSheetS(seed, h, color, "band", 340, 120);
function cloudDeck(c, t, y, h, seed, speed, alpha, color = "#221e30") {
  const x = -(((t * speed) % LW) + LW) % LW;
  c.save();
  c.globalAlpha = alpha;
  const S = cloudBandS(seed, h, color)();
  c.drawImage(S, x, y, LW * 2, h);
  c.restore();
}
// a wisp of cloud drawn across the moon: thin, its edges silvered by the light behind it
const wispBandS = staged("f05mwisp", 420, 60, () => [(s) => {
  matRect(s, mat("cloud"), 0, 0, 420, 60, { scale: 260, scaleY: 70, ox: 77, oy: 31 });
  s.globalCompositeOperation = "destination-in";
  const m = s.createRadialGradient(210, 30, 0, 210, 30, 210);
  m.addColorStop(0, "rgba(0,0,0,1)"); m.addColorStop(0.6, "rgba(0,0,0,0.7)"); m.addColorStop(1, "rgba(0,0,0,0)");
  s.save(); s.translate(0, 30); s.scale(1, 60 / 420); s.translate(0, -30); s.fillStyle = m; s.fillRect(0, -800, 420, 1600); s.restore();
  s.globalCompositeOperation = "source-in";
  s.fillStyle = "#3e3e52"; s.fillRect(0, 0, 420, 60);
}]);
function moonAndClouds(c, t, mx, my, mr, o = {}) {
  glow(c, mx, my, mr * 9, "#4a4878", 0.2);
  glow(c, mx, my, mr * 3.2, "#9a9cc8", 0.16);
  moonDisc(c, mx, my, mr);
  const sp = (o.speed || 9) * 0.6, s0 = o.seed || 31, ct = t + (o.cloudT || 0);
  cloudDeck(c, ct, (o.y || my) - 70, 120, s0, sp, 0.85);
  cloudDeck(c, ct, (o.y || my) - 170, 150, s0 + 1, sp * 0.6, 0.6);
  // a wisp crossing the disc (lit from behind: dark body, its thin parts glow)

  // the moon scatters in the thin cloud in front of it
  glow(c, mx, my, mr * 2.4, "#b0b4d8", 0.2, "screen");
  if (o.wispX != null) { c.save(); c.globalAlpha = 0.95; c.drawImage(wispBandS(), o.wispX - 210, my - 34 + mr * 0.1, 420, 60); c.restore(); }
  if (o.flash > 0.01) { // lightning lights the cloud undersides
    c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = clamp(o.flash);
    const x = -(((ct * sp) % LW) + LW) % LW;
    c.drawImage(cloudBandS(s0, 120, "#6a6c90")(), x, (o.y || my) - 70, LW * 2, 120);
    const x2 = -(((ct * sp * 0.6) % LW) + LW) % LW;
    c.drawImage(cloudBandS(s0 + 1, 150, "#5a5c80")(), x2, (o.y || my) - 170, LW * 2, 150);
    c.restore();
  }
}

// ---- the manor (painted once, textured, in stages) ----------------------------------------------------
const MW = 600, MH = 320;
function rotPts(cx, cy, a, pts) {
  const c = Math.cos(a), s = Math.sin(a), out = [];
  for (let i = 0; i < pts.length; i += 2) out.push(cx + pts[i] * c - pts[i + 1] * s, cy + pts[i] * s + pts[i + 1] * c);
  return out;
}
function archPath(p, x, y, w, h) {
  p.moveTo(x - w, y + h); p.lineTo(x - w, y + w); p.quadraticCurveTo(x, y - w * 0.9, x + w, y + w); p.lineTo(x + w, y + h); p.closePath();
  return p;
}
// a lancet (pointed Gothic arch) opening
function lancetPath(p, x, y, w, h) {
  p.moveTo(x - w, y + h); p.lineTo(x - w, y + w * 0.9);
  p.quadraticCurveTo(x - w, y - w * 0.2, x, y - w * 1.1);
  p.quadraticCurveTo(x + w, y - w * 0.2, x + w, y + w * 0.9);
  p.lineTo(x + w, y + h); p.closePath();
  return p;
}
const MANOR_WINS = (cx, by) => [
  [cx - 120, by - 122, 7, 26, "lit"], [cx - 70, by - 122, 7, 26, "dark"], [cx - 20, by - 126, 9, 30, "board"], [cx + 30, by - 122, 7, 26, "dark"], [cx + 80, by - 122, 7, 26, "lit"],
  [cx - 120, by - 62, 8, 30, "dark"], [cx + 80, by - 62, 8, 30, "broken"], [cx - 225, by - 82, 6, 22, "dark"], [cx - 185, by - 82, 6, 22, "lit"],
  [cx + 190, by - 96, 7, 26, "dark"], [cx + 236, by - 96, 7, 26, "lit"], [cx - 106, by - 262, 5, 18, "lit"], [cx + 116, by - 220, 6, 20, "dark"],
  [cx - 270, by - 100, 5, 18, "far"], [cx - 230, by - 100, 5, 18, "far"], [cx + 230, by - 120, 5, 18, "far"], [cx + 266, by - 120, 5, 18, "far"],
];
function litWindow(s, x, y, w, h) {
  // warm interior: hot core near the (unseen) candle, falling off to deep amber at the frame
  const p = lancetPath(new Path2D(), x, y, w, h);
  const gr = s.createRadialGradient(x, y + h * 0.65, 0, x, y + h * 0.5, h * 0.9);
  gr.addColorStop(0, "#fff3c8"); gr.addColorStop(0.35, "#ffc068"); gr.addColorStop(0.8, "#d0661c"); gr.addColorStop(1, "#5a200a");
  s.fillStyle = gr; s.fill(p);
  s.save(); s.clip(p);
  s.fillStyle = "rgba(40,14,6,0.85)";
  s.fillRect(x - 0.7, y - w, 1.4, h + w); s.fillRect(x - w, y + h * 0.48, w * 2, 1.4);
  s.restore();
}
// a recessed window: dressed-stone surround, a deep reveal shadowed at the top and on the left, the
// glass holding a faint sky reflection, and a projecting sill whose top catches the moon
function darkWindow(s, x, y, w, h, kind) {
  const far = kind === "far";
  const sur = lancetPath(new Path2D(), x, y - 1.2, w + 1.8, h + 1.2);
  s.fillStyle = far ? "rgba(70,70,82,0.5)" : "rgba(82,82,92,0.55)"; s.fill(sur);
  const p = lancetPath(new Path2D(), x, y, w, h);
  const gr = s.createLinearGradient(x + w, y, x - w, y + h);
  gr.addColorStop(0, "#26283a"); gr.addColorStop(0.45, "#0e0e16"); gr.addColorStop(1, "#060609");
  s.fillStyle = gr; s.fill(p);
  s.save(); s.clip(p);
  if (kind === "board") matRect(s, mat("wood"), x - w - 2, y - w, w * 2 + 4, h + w + 4, { scale: 26, rot: 0.6, tint: "#1c1c24", tintAlpha: 0.8 });
  if (kind === "broken") { s.fillStyle = "#020203"; poly(s, [x - 4, y + 8, x + 3, y + 12, x - 1, y + 18, x + 5, y + 24, x - 5, y + 22]); s.fill(); s.beginPath(); }
  if (!far && kind !== "board") { // glazing bars and the faint sky in the upper panes
    s.fillStyle = "rgba(120,126,160,0.1)"; s.fillRect(x - w, y - w, w * 2, h * 0.45);
    s.fillStyle = "rgba(0,0,0,0.75)"; s.fillRect(x - 0.6, y - w, 1.2, h + w); s.fillRect(x - w, y + h * 0.48, w * 2, 1.1);
  }
  // the deep reveal: the top and the left jamb shadow the opening
  const rv = s.createLinearGradient(x - w, 0, x - w + 3.5, 0);
  rv.addColorStop(0, "rgba(0,0,0,0.75)"); rv.addColorStop(1, "rgba(0,0,0,0)");
  s.fillStyle = rv; s.fillRect(x - w, y - w * 1.2, 3.5, h + w * 1.3);
  const rt = s.createLinearGradient(0, y - w * 1.2, 0, y + w * 0.8);
  rt.addColorStop(0, "rgba(0,0,0,0.7)"); rt.addColorStop(1, "rgba(0,0,0,0)");
  s.fillStyle = rt; s.fillRect(x - w, y - w * 1.2, w * 2, w * 2);
  s.restore();
  // the sill: a lit top edge (faces the sky), its shadow under it
  const sw = w * 1.45;
  s.fillStyle = far ? "rgba(150,154,180,0.3)" : "rgba(176,182,206,0.48)"; s.fillRect(x - sw, y + h + 0.2, sw * 2, 1.1);
  s.fillStyle = "rgba(60,60,70,0.7)"; s.fillRect(x - sw, y + h + 1.3, sw * 2, 1.2);
  s.fillStyle = "rgba(0,0,0,0.45)"; s.fillRect(x - sw + 0.5, y + h + 2.5, sw * 2 - 1, 1.6);
}
// the house geometry (shared by every stage)
let MGEO = null;
function manorGeo() {
  if (MGEO) return MGEO;
  const cx = MW / 2, by = MH;
  const far = new Path2D(), walls = new Path2D(), roofs = new Path2D(), roofLit = new Path2D();
  far.rect(cx - 300, by - 128, 120, 128);
  poly(far, [cx - 308, by - 126, cx - 262, by - 172, cx - 200, by - 160, cx - 176, by - 126]);
  far.rect(cx + 200, by - 150, 96, 150);
  poly(far, [cx + 192, by - 148, cx + 250, by - 214, cx + 300, by - 148]);
  far.rect(cx + 262, by - 236, 12, 40);
  far.rect(cx - 40, by - 300, 18, 70);
  walls.rect(cx - 170, by - 150, 340, 150);
  roofs.moveTo(cx - 190, by - 148); roofs.lineTo(cx - 34, by - 272); roofs.lineTo(cx - 8, by - 266); roofs.quadraticCurveTo(cx + 90, by - 200, cx + 190, by - 148); roofs.closePath();
  roofLit.moveTo(cx - 8, by - 266); roofLit.quadraticCurveTo(cx + 90, by - 200, cx + 190, by - 148); roofLit.lineTo(cx - 20, by - 148); roofLit.closePath();
  for (const dx of [-120, -70]) {
    const oy = (dx + 120) * 0.5;
    walls.rect(cx + dx - 12, by - 196 - oy, 24, 30);
    poly(roofs, [cx + dx - 16, by - 194 - oy, cx + dx, by - 214 - oy, cx + dx + 16, by - 194 - oy]);
  }
  walls.rect(cx - 250, by - 104, 90, 104);
  poly(roofs, [cx - 262, by - 102, cx - 205, by - 172, cx - 150, by - 102]);
  walls.rect(cx + 160, by - 126, 104, 126);
  for (let i = 0; i < 6; i++) if (i !== 3) walls.rect(cx + 162 + i * 17, by - 136, 10, 12);
  poly(walls, rotPts(cx - 110, by - 150, -0.07, [-24, 0, -24, -158, 24, -158, 24, 0]));
  poly(roofs, rotPts(cx - 110, by - 150, -0.07, [-32, -156, 6, -262, 32, -156]));
  poly(roofs, rotPts(cx - 110, by - 150, -0.07, [4, -260, 4, -286, 6, -286, 6, -260]));
  poly(walls, rotPts(cx + 112, by - 140, 0.05, [-28, 0, -28, -110, 28, -110, 28, 0]));
  {
    const P = (x, y) => rotPts(cx + 112, by - 140, 0.05, [x, y]);
    const a = P(-38, -108), b = P(-8, -160), c2 = P(30, -222), d = P(8, -160), e = P(38, -108);
    roofs.moveTo(a[0], a[1]); roofs.quadraticCurveTo(b[0], b[1], c2[0], c2[1]); roofs.quadraticCurveTo(d[0], d[1], e[0], e[1]); roofs.closePath();
    roofLit.moveTo(c2[0], c2[1]); roofLit.quadraticCurveTo(d[0], d[1], e[0], e[1]); roofLit.lineTo(e[0] - 14, e[1]); roofLit.closePath();
  }
  walls.rect(cx - 62, by - 236, 16, 52);
  walls.rect(cx + 58, by - 206, 14, 34);
  poly(walls, [cx + 58, by - 206, cx + 64, by - 214, cx + 72, by - 206]);
  walls.rect(cx - 222, by - 186, 12, 40);
  const VX = cx + 1100, VY = by - 70;
  const sideFace = (p, x, yT, yB, d) => { const k = (y) => (VY - y) / (VX - x); return poly(p, [x, yT, x + d, yT + d * k(yT), x + d, yB + d * k(yB), x, yB]); };
  const sides = new Path2D(), farSides = new Path2D(), sideRoofs = new Path2D();
  sideFace(sides, cx - 160, by - 104, by, 20);
  sideFace(sides, cx + 264, by - 126, by, 24);
  sideFace(farSides, cx + 296, by - 150, by, 18);
  {
    const k = (x, y) => (VY - y) / (VX - x);
    poly(sideRoofs, [cx - 205, by - 172, cx - 185, by - 172 + 20 * k(cx - 205, by - 172), cx - 130, by - 102 + 20 * k(cx - 150, by - 102), cx - 150, by - 102]);
    poly(sideRoofs, [cx + 250, by - 214, cx + 268, by - 214 + 18 * k(cx + 250, by - 214), cx + 318, by - 148 + 18 * k(cx + 300, by - 148), cx + 300, by - 148]);
  }
  const all = new Path2D(); all.addPath(walls); all.addPath(roofs);
  MGEO = { cx, by, far, walls, roofs, roofLit, sides, farSides, sideRoofs, all, VX, VY };
  return MGEO;
}
const manorStages = () => [
  (s) => { // back plane: same stone, hazed by the air between
    const { far, farSides } = manorGeo();
    s.fillStyle = "#2a2a34"; s.fill(far);
    masonry(s, far, { scale: 40, seed: 4, tint: "#262636", tintAlpha: 0.8 });
    s.fillStyle = "#1c1c26"; s.fill(farSides);
    masonry(s, farSides, { scale: 40, seed: 5, tint: "#1a1a28", tintAlpha: 0.85 });
    s.fillStyle = "rgba(0,0,0,0.4)"; s.fill(farSides);
    s.fillStyle = rgba("#3e3c58", 0.3); s.fill(far); s.fill(farSides);
  },
  (s) => { const { walls } = manorGeo(); s.fillStyle = "#363640"; s.fill(walls); masonry(s, walls, { scale: 46, seed: 3, tintAlpha: 0.8 }); },
  (s) => {
    const { cx, by, sides } = manorGeo();
    s.fillStyle = "#282830"; s.fill(sides);
    masonry(s, sides, { scale: 46, seed: 6, tintAlpha: 0.82 });
    s.save(); s.clip(sides);
    s.fillStyle = "rgba(0,0,0,0.4)"; s.fill(sides);
    K.aoEdge(s, cx - 160, by - 104, cx - 160, by, { width: 7, alpha: 0.5, side: 1 });
    K.aoEdge(s, cx + 264, by - 126, cx + 264, by, { width: 7, alpha: 0.5, side: 1 });
    s.restore();
  },
  (s) => {
    const { roofs, sideRoofs, roofLit } = manorGeo();
    s.fillStyle = "#202028"; s.fill(roofs); s.fill(sideRoofs);
    nightMat(s, "slate", roofs, { scale: 40 }, "#1c1c28", 0.66);
    nightMat(s, "slate", sideRoofs, { scale: 34, rot: 0.5 }, "#1c1c28", 0.66);
    s.save(); s.clip(sideRoofs); s.globalCompositeOperation = "lighter";
    s.fillStyle = "rgba(100,106,140,0.2)"; s.fill(sideRoofs);
    s.restore();
    s.save(); s.globalCompositeOperation = "lighter";
    s.fillStyle = "rgba(96,100,134,0.18)"; s.fill(roofLit);
    s.restore();
  },
  (s) => { // moonlight from behind / upper right: the faces toward camera sit in shadow, brighter to the right
    const { cx, by, all } = manorGeo();
    s.save();
    s.clip(all);
    const mg = s.createLinearGradient(cx - 260, 0, cx + 280, 0);
    mg.addColorStop(0, "rgba(0,0,0,0.62)"); mg.addColorStop(0.6, "rgba(0,0,0,0.38)"); mg.addColorStop(1, "rgba(30,32,50,0.2)");
    s.fillStyle = mg; s.fillRect(0, 0, MW, MH);
    const ao = s.createLinearGradient(0, by - 50, 0, by);
    ao.addColorStop(0, "rgba(0,0,0,0)"); ao.addColorStop(1, "rgba(0,0,0,0.45)");
    s.fillStyle = ao; s.fillRect(0, by - 50, MW, 50);
    s.restore();
  },
  (s) => { // windows: recessed, with sills; some candle-lit, some dark, one boarded, one broken
    const { cx, by, walls } = manorGeo();
    for (const [x, y, ww, hh, kind] of MANOR_WINS(cx, by)) {
      if (kind === "lit") { darkWindow(s, x, y, ww, hh, "dark"); litWindow(s, x, y, ww, hh); } else darkWindow(s, x, y, ww, hh, kind);
    }
    s.save();
    s.clip(walls);
    for (const [x, y, , hh, kind] of MANOR_WINS(cx, by)) if (kind === "lit") glow(s, x, y + hh * 0.5, hh * 1.1, "#c86a28", 0.28);
    s.restore();
    s.save(); s.translate(cx + 37, by - 120); s.rotate(0.5);
    matRect(s, mat("wood"), 0, 0, 8, 26, { scale: 22, rot: Math.PI / 2, tint: "#1a1820", tintAlpha: 0.8 });
    s.restore();
    matRect(s, mat("wood"), cx - 129, by - 120, 6, 26, { scale: 22, rot: Math.PI / 2, tint: "#1a1820", tintAlpha: 0.8 });
    // the round attic window: a recessed oculus
    s.fillStyle = "rgba(82,82,92,0.5)"; s.beginPath(); s.arc(cx - 205, by - 130, 8.6, 0, TAU); s.fill();
    s.fillStyle = "#0c0c12"; s.beginPath(); s.arc(cx - 205, by - 130, 7, 0, TAU); s.fill();
    s.fillStyle = "rgba(0,0,0,0.6)"; s.beginPath(); s.arc(cx - 206.5, by - 131.5, 6, 0, TAU); s.fill();
    // the front door (dark; its crack of light is live) with a stone step
    s.fillStyle = "#060507";
    s.beginPath(); s.moveTo(cx - 18, by); s.lineTo(cx - 18, by - 44); s.quadraticCurveTo(cx, by - 62, cx + 18, by - 44); s.lineTo(cx + 18, by); s.fill();
    matRect(s, stoneTex(), cx - 34, by - 8, 68, 8, { scale: 40, tint: NIGHT, tintAlpha: 0.75 });
  },
  (s) => { // the cold back light on the edges that face the moon: soft (a faint wide pass and a thin one)
    const { cx, by, VX, VY } = manorGeo();
    s.globalCompositeOperation = "lighter";
    s.lineCap = "round";
    const path = () => {
      s.beginPath();
      s.moveTo(cx - 8, by - 266); s.quadraticCurveTo(cx + 90, by - 200, cx + 190, by - 148);
      s.moveTo(cx - 205, by - 172); s.lineTo(cx - 150, by - 102);
      s.moveTo(cx + 264, by - 126); s.lineTo(cx + 264, by - 40);
      s.moveTo(cx + 250, by - 214); s.lineTo(cx + 300, by - 148);
      s.moveTo(cx - 205, by - 172); s.lineTo(cx - 185, by - 172 + 20 * (VY - by + 172) / (VX - cx + 205));
      s.moveTo(cx + 250, by - 214); s.lineTo(cx + 268, by - 214 + 18 * (VY - by + 214) / (VX - cx - 250));
      s.moveTo(cx - 34, by - 272); s.lineTo(cx - 8, by - 266);
    };
    path(); s.strokeStyle = "rgba(170,178,210,0.08)"; s.lineWidth = 3; s.stroke();
    path(); s.strokeStyle = "rgba(190,198,226,0.2)"; s.lineWidth = 0.9; s.stroke();
    s.fillStyle = "rgba(190,196,226,0.38)";
    for (let i = 0; i < 6; i++) if (i !== 3) s.fillRect(cx + 162 + i * 17, by - 136, 10, 1.1);
    s.fillStyle = "rgba(170,176,214,0.26)";
    s.fillRect(cx + 160, by - 126, 104, 1);
    s.fillRect(cx - 250, by - 104, 90, 0.9);
  },
  (s) => {
    const { cx, by } = manorGeo();
    for (const [x, y, ww, hh, kind] of MANOR_WINS(cx, by)) {
      if (kind !== "lit") continue;
      s.fillStyle = "rgba(255,170,90,0.5)"; s.fillRect(x - ww * 1.45, y + hh + 0.3, ww * 2.9, 1.1);
      const sg = s.createLinearGradient(0, y + hh + 2, 0, y + hh + 22);
      sg.addColorStop(0, "rgba(200,110,50,0.2)"); sg.addColorStop(1, "rgba(200,110,50,0)");
      s.fillStyle = sg; s.fillRect(x - ww * 1.6, y + hh + 2, ww * 3.2, 20);
    }
    // ~300 m of air: the blacks lift toward the distant (violet) haze, more toward the base
    s.globalCompositeOperation = "source-atop";
    const hz = s.createLinearGradient(0, 0, 0, MH);
    hz.addColorStop(0, "rgba(56,52,80,0.12)"); hz.addColorStop(0.7, "rgba(60,56,86,0.2)"); hz.addColorStop(1, "rgba(72,66,100,0.5)");
    s.fillStyle = hz; s.fillRect(0, 0, MW, MH);
    s.globalCompositeOperation = "source-over";
    for (const [x, y, ww, hh, kind] of MANOR_WINS(cx, by)) if (kind === "lit") litWindow(s, x, y, ww, hh);
  },
];
const manorSprite = staged("f05manor4", MW, MH, manorStages);

// ---- the hill, its trees and the gravel drive ---------------------------------------------------------
// the drive: one cubic shared by the painted gravel and the walking figures
const DRIVE = [420, 560, 436, 452, 528, 398, 486, 326];
function driveAt(u) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = DRIVE, v = 1 - u;
  return [v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3, v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3];
}
const figSize = (u) => lerp(46, 25, Math.pow(u, 0.9)); // Biscuit's shoulder height along the drive (long lens: little shrink)
const DLUT = (() => {
  const out = [];
  let s = 0, q = 0, [px, py] = driveAt(0);
  for (let i = 0; i <= 96; i++) {
    const u = i / 96, [x, y] = driveAt(u);
    const ds = Math.hypot(x - px, y - py);
    s += ds; q += ds / (figSize(u) * 0.9);
    out.push({ u, x, y, s, q });
    px = x; py = y;
  }
  return out;
})();
function driveS(s) {
  const L = DLUT;
  s = clamp(s, 0, L[L.length - 1].s);
  let i = 1;
  while (i < L.length - 1 && L[i].s < s) i++;
  const a = L[i - 1], b = L[i], k = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), u: lerp(a.u, b.u, k), q: lerp(a.q, b.q, k), ang: Math.atan2(b.y - a.y, b.x - a.x) };
}
const driveW = (u) => lerp(70, 8, Math.pow(u, 0.8));
// a band along the drive between two signed offsets (fractions of the half-width)
function driveBand(o0, o1, w0 = 1) {
  const L = [], R = [];
  for (let i = 0; i <= 48; i++) {
    const u = i / 48, [x, y] = driveAt(u), [x2, y2] = driveAt(Math.min(1, u + 0.01));
    let nx = -(y2 - y), ny = x2 - x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const w = driveW(u) * w0;
    L.push(x + nx * w * o0, y + ny * w * o0); R.push(x + nx * w * o1, y + ny * w * o1);
  }
  const p = new Path2D();
  for (let i = 0; i < L.length; i += 2) (i ? p.lineTo(L[i], L[i + 1]) : p.moveTo(L[i], L[i + 1]));
  for (let i = R.length - 2; i >= 0; i -= 2) p.lineTo(R[i], R[i + 1]);
  p.closePath();
  return p;
}
// a bare tree, recursive tapering limbs; the edges facing the moon (upper right) catch a thin cold rim
function bareTree(s, x, y, h, seed, col, rimA = 0.25, rimCol = "#aab2cc") {
  const R = K.rng("f05tree" + seed), segs = [];
  const limb = (px, py, a, len, w, d) => {
    let aa = a;
    const n = 4;
    for (let i = 0; i < n; i++) {
      aa += (R() - 0.5) * 0.42 + (a < -Math.PI / 2 ? -0.02 : 0.02);
      const nx = px + Math.cos(aa) * len / n, ny = py + Math.sin(aa) * len / n, ww = Math.max(0.6, w * (1 - (i / n) * 0.42));
      segs.push([px, py, nx, ny, ww]);
      px = nx; py = ny;
      if (d > 0 && i > 0 && R() < 0.5) limb(px, py, aa + (R() < 0.5 ? -1 : 1) * (0.45 + R() * 0.6), len * 0.55, ww * 0.55, d - 1);
    }
    if (d > 0) { limb(px, py, aa - 0.3 - R() * 0.35, len * 0.66, w * 0.56, d - 1); limb(px, py, aa + 0.28 + R() * 0.4, len * 0.6, w * 0.5, d - 1); }
  };
  limb(x, y, -Math.PI / 2 + (R() - 0.5) * 0.2, h * 0.42, h * 0.05, 4);
  s.save();
  s.lineCap = "round";
  s.strokeStyle = col;
  for (const [ax, ay, bx, by, w] of segs) { s.lineWidth = w; s.beginPath(); s.moveTo(ax, ay); s.lineTo(bx, by); s.stroke(); }
  // a root flare
  s.fillStyle = col; s.beginPath(); s.ellipse(x, y, h * 0.06, h * 0.012, 0, 0, TAU); s.fill();
  if (rimA > 0) {
    s.globalCompositeOperation = "lighter";
    s.strokeStyle = rgba(rimCol, rimA);
    for (const [ax, ay, bx, by, w] of segs) {
      if (w < 0.9) continue;
      const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
      const f = nx * 0.6 - ny * 0.8; // how much this side of the limb faces the moon
      const sd = f > 0 ? 1 : -1, k = Math.abs(f);
      if (k < 0.2) continue;
      s.lineWidth = Math.max(0.5, w * 0.22);
      s.globalAlpha = k;
      s.beginPath(); s.moveTo(ax + nx * sd * w * 0.38, ay + ny * sd * w * 0.38); s.lineTo(bx + nx * sd * w * 0.38, by + ny * sd * w * 0.38); s.stroke();
    }
  }
  s.restore();
}
const HILL = (p) => { p.moveTo(-10, 420); p.bezierCurveTo(200, 390, 330, 330, 470, 318); p.bezierCurveTo(620, 310, 760, 350, 970, 400); p.lineTo(970, LH + 20); p.lineTo(-10, LH + 20); p.closePath(); return p; };
const CREST = (() => {
  const out = new Float32Array(LW + 21);
  const bz = (p0, p1, p2, p3, u) => { const v = 1 - u; return v * v * v * p0 + 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u * p3; };
  const pts = [];
  for (let i = 0; i <= 200; i++) { const u = i / 200; pts.push([bz(-10, 200, 330, 470, u), bz(420, 390, 330, 318, u)]); }
  for (let i = 1; i <= 200; i++) { const u = i / 200; pts.push([bz(470, 620, 760, 970, u), bz(318, 310, 350, 400, u)]); }
  let k = 0;
  for (let x = -10; x <= LW + 10; x++) { while (k < pts.length - 2 && pts[k + 1][0] < x) k++; const [ax, ay] = pts[k], [bx, by] = pts[k + 1]; out[x + 10] = lerp(ay, by, clamp((x - ax) / (bx - ax || 1))); }
  return out;
})();
const crestY = (x) => CREST[clamp(Math.round(x), -10, LW + 10) + 10];
const hillStages = () => [
  (s) => { // far trees behind the crest, hazed into the distant fog
    bareTree(s, 300, 372, 150, 3, "#2c2a3c", 0.1, "#8a88aa");
    bareTree(s, 690, 358, 160, 4, "#2c2a3c", 0.1, "#8a88aa");
    bareTree(s, 600, 334, 70, 9, "#34324a", 0.06, "#8a88aa");
  },
  (s) => { // the turf: grass blades whose texture shrinks toward the crest, heather patches through it
    const hp = HILL(new Path2D());
    s.fillStyle = "#121318"; s.fill(hp);
    bandFill(s, mat("blades"), { hz: 300, y0: 304, y1: LH + 20, far: 26, near: 300, squash: 0.85, clip: hp, tint: "#20222a", tintAlpha: 0.8, seed: 3 });
  },
  (s) => {
    const hp = HILL(new Path2D());
    bandFill(s, mat("heather"), { hz: 296, y0: 300, y1: LH + 20, far: 40, near: 340, squash: 0.5, clip: hp, tint: "#20222a", tintAlpha: 0.8, seed: 7, alpha: 0.4, mode: "multiply" });
  },
  (s) => { // the moon is behind the crest: backlit grass glows softly along the skyline, falling off
    // downhill (a wide blurred band, broken up by cloud noise), the near slope in shadow
    const hp = HILL(new Path2D());
    const T = scratch(LW, LH);
    T.g.lineCap = "round";
    for (const [dy, w, a] of [[6, 14, 0.5], [18, 34, 0.22], [44, 70, 0.1]]) {
      T.g.strokeStyle = `rgba(128,134,158,${a})`; T.g.lineWidth = w;
      T.g.beginPath();
      for (let x = -10; x <= LW + 10; x += 12) { const y = crestY(x) + dy * (0.7 + 0.3 * (x / LW)); (x === -10 ? T.g.moveTo(x, y) : T.g.lineTo(x, y)); }
      T.g.stroke();
    }
    T.g.globalCompositeOperation = "destination-in";
    matRect(T.g, mat("cloud"), 0, 0, LW, LH, { scale: 300, scaleY: 120, ox: 40 });
    s.save(); s.clip(hp); s.globalCompositeOperation = "lighter";
    if (K.hasFilter()) s.filter = `blur(${K.qblur((6 * K.pixelScale()).toFixed(1))}px)`;
    s.drawImage(T.c, 0, 0, LW, LH);
    s.restore();
    // the right flank faces the moon a little more
    s.save(); s.clip(hp); s.globalCompositeOperation = "lighter";
    const sideK = s.createLinearGradient(380, 0, LW, 0);
    sideK.addColorStop(0, "rgba(70,74,96,0)"); sideK.addColorStop(0.5, "rgba(70,74,96,0.07)"); sideK.addColorStop(1, "rgba(70,74,96,0.04)");
    s.fillStyle = sideK; s.fillRect(380, 300, LW - 380, 160);
    s.restore();
  },
  (s) => { // the gravel drive: two wheel tracks of the wet gravel, narrowing in perspective, a grassy crown
    const hp = HILL(new Path2D());
    s.save(); s.clip(hp);
    const crown = driveBand(-0.85, 0.85);
    s.fillStyle = "rgba(0,0,0,0.3)"; s.fill(crown);
    for (const [a, b] of [[-0.78, -0.22], [0.22, 0.78]]) {
      const tr = driveBand(a, b);
      s.fillStyle = "#3a3c46"; s.fill(tr);
      bandFill(s, gravelTex(), { hz: 300, y0: 318, y1: LH + 20, far: 10, near: 150, squash: 0.4, clip: tr, tint: "#24262f", tintAlpha: 0.84, seed: 11 + a * 10 });
      // the wet tracks hold a little sky: brighter far away (grazing), dark near
      s.save(); s.clip(tr);
      const dg = s.createLinearGradient(0, 322, 0, LH);
      dg.addColorStop(0, "rgba(150,150,190,0.3)"); dg.addColorStop(0.35, "rgba(70,72,100,0.08)"); dg.addColorStop(1, "rgba(0,0,0,0.45)");
      s.fillStyle = dg; s.fillRect(0, 300, LW, LH);
      s.restore();
    }
    // grass leaning over the track edges (soft, broken edges)
    const R = K.rng("f05verge");
    s.lineCap = "round";
    for (let i = 0; i < 360; i++) {
      const u = Math.pow(R(), 1.3), [x, y] = driveAt(u), w = driveW(u), side = [-0.8, -0.2, 0.2, 0.8][i & 3];
      const bx = x + side * w + (R() - 0.5) * w * 0.12, by = y + (R() - 0.5) * 3, hh = (2 + R() * 5) * (1 - u * 0.8);
      s.strokeStyle = rgba(mix("#0c0d10", "#2a2c34", R()), 0.8); s.lineWidth = 0.7 + (1 - u);
      s.beginPath(); s.moveTo(bx, by); s.lineTo(bx + (R() - 0.5) * hh, by - hh); s.stroke();
    }
    s.restore();
  },
  (s) => { // near trees (in front of the crest), nearly black, with the moon's rim
    bareTree(s, 130, 424, 230, 1, "#060609", 0.28);
    bareTree(s, 820, 404, 250, 2, "#060609", 0.28);
  },
  (s) => { // rough meadow grass on the slope (three depths), then the slope shadow
    const grassTint = (y0, h, seed, dens, x0 = -10, x1 = 970) => K.grass(s, x0, x1, y0, { seed, color: "#1a1e18", height: h, density: dens, dry: 0.3, sun: { x: 640, y: 150 }, light: "#3a4038", dark: "#07080a" });
    grassTint(440, 10, 3, 0.6, -10, 380); grassTint(440, 10, 4, 0.6, 600, 970);
    grassTint(490, 18, 5, 0.8, -10, 360); grassTint(490, 18, 6, 0.8, 640, 970);
    grassTint(548, 34, 7, 1.0, -10, 330); grassTint(548, 34, 8, 1.0, 690, 970);
    s.globalCompositeOperation = "source-atop";
    const gs = s.createLinearGradient(0, 330, 0, LH);
    gs.addColorStop(0, "rgba(10,10,14,0)"); gs.addColorStop(0.35, "rgba(10,10,14,0.25)"); gs.addColorStop(1, "rgba(4,4,6,0.6)");
    s.fillStyle = gs; s.fillRect(0, 330, LW, LH - 330);
  },
];
const hillSprite = staged("f05hill5", LW, LH, hillStages);
// lightning-lit versions (additive): a cool rim on every LEFT-facing edge (the bolt is left) plus a cool
// wash falling off to the right; three stages (mask, wash, blurred composite)
function edgeLightStages(src, w, h, d, color, wash, rimA = 0.32) {
  return () => [
    (s, st) => {
      const ps = K.pixelScale(), S = src();
      st.T = scratch(w, h); const g = st.T.g;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(S, 0, 0);
      g.globalCompositeOperation = "destination-out";
      g.drawImage(S, d * ps, d * 0.4 * ps);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = color; g.fillRect(0, 0, st.T.c.width, st.T.c.height);
    },
    (s) => {
      const S = src();
      s.save(); s.setTransform(1, 0, 0, 1, 0, 0);
      s.drawImage(S, 0, 0);
      s.globalCompositeOperation = "source-in";
      const wg = s.createLinearGradient(0, 0, s.canvas.width, 0);
      wg.addColorStop(0, rgba(color, wash)); wg.addColorStop(0.55, rgba(color, wash * 0.35)); wg.addColorStop(1, rgba(color, 0));
      s.fillStyle = wg; s.fillRect(0, 0, s.canvas.width, s.canvas.height);
      s.restore();
    },
    ...[0, 1].map((i) => (s, st) => {
      s.save(); s.setTransform(1, 0, 0, 1, 0, 0);
      const H = s.canvas.height, y0 = (H / 2) * i;
      s.beginPath(); s.rect(0, y0, s.canvas.width, H / 2); s.clip();
      s.globalCompositeOperation = "lighter";
      if (K.hasFilter()) s.filter = `blur(${K.qblur((1.2 * K.pixelScale()).toFixed(1))}px)`;
      s.globalAlpha = rimA;
      s.drawImage(st.T.c, 0, 0);
      s.restore();
    }),
  ];
}
const manorFlash = staged("f05manorFl2", MW, MH, edgeLightStages(manorSprite, MW, MH, 3, "#c8ccff", 0.3));
const hillFlash = staged("f05hillFl2", LW, LH, edgeLightStages(hillSprite, LW, LH, 2, "#b8bce8", 0.14, 0.14));
// pure silhouettes (for the instant the bolt backlights everything)
const silStages = (src, w, h, color) => () => [(s) => { s.drawImage(src(), 0, 0, w, h); s.globalCompositeOperation = "source-in"; s.fillStyle = color; s.fillRect(0, 0, w, h); }];
const manorSil = staged("f05manorSil", MW, MH, silStages(manorSprite, MW, MH, "#050508"));
const hillSil = staged("f05hillSil", LW, LH, silStages(hillSprite, LW, LH, "#040406"));

// ---- shot 1: the manor on its hill ------------------------------------------------------------------
const MANOR_X = 480 - MW * 0.45, MANOR_Y = 322 - MH * 0.9;
const WIN_SCREEN = MANOR_WINS(MW / 2, MH).filter((w) => w[4] === "lit").map(([x, y, , hh]) => [MANOR_X + x * 0.9, MANOR_Y + (y + hh * 0.5) * 0.9]);
// a near bare branch hanging into the top-left of frame, far out of focus: drawn sharp, blurred in bands
const fgBranch = softPlate("f05fgbranch3", 560, 420, 3, [(s) => {
  const R = K.rng("f05branch");
  s.lineCap = "round"; s.strokeStyle = "#030305";
  const limb = (x, y, a, len, w, d) => {
    let px = x, py = y, aa = a;
    const n = 4;
    for (let i = 0; i < n; i++) {
      aa += (R() - 0.5) * 0.5 + 0.03;
      const nx = px + Math.cos(aa) * len / n, ny = py + Math.sin(aa) * len / n;
      s.lineWidth = Math.max(1.6, w * (1 - i / n * 0.45));
      s.beginPath(); s.moveTo(px, py); s.lineTo(nx, ny); s.stroke();
      px = nx; py = ny;
      if (d > 0 && R() < 0.55) limb(px, py, aa + (R() < 0.5 ? -1 : 1) * (0.4 + R() * 0.6), len * 0.55, w * 0.5, d - 1);
    }
    if (d > 0) { limb(px, py, aa - 0.35 - R() * 0.3, len * 0.62, w * 0.55, d - 1); limb(px, py, aa + 0.3 + R() * 0.4, len * 0.58, w * 0.5, d - 1); }
  };
  limb(-20, 70, 0.02, 320, 34, 4);
  limb(-20, 210, -0.3, 200, 18, 3);
}], 2);
function branchXf(c, t, p) {
  c.translate(-30 - p * 26 + Math.sin(t * 0.7) * 2, -6 - p * 10);
  c.rotate(0.04 * Math.sin(t * 0.5));
}
// the bolt lives in the sky: drawn into a layer, then everything nearer (manor, hill, trees, the
// out-of-focus branch) is cut out of it, so it can only show between them
function skyBolt(c, base, t, p, a) {
  if (!(a > 0.01)) return;
  const L = K.layer(LW, LH, "f05bolt");
  L.g.setTransform(c.getTransform());
  bolt(L.g, 150, 20, 215, 300, 5, a);
  L.g.globalCompositeOperation = "destination-out";
  L.g.drawImage(manorSprite(), MANOR_X, MANOR_Y, MW * 0.9, MH * 0.9);
  L.g.drawImage(hillSprite(), 0, 0, LW, LH);
  L.g.setTransform(base);
  branchXf(L.g, t, p);
  for (let k = 0; k < 3; k++) L.g.drawImage(fgBranch(), 0, 0, 400, 300);
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  L.g.globalCompositeOperation = "source-over";
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(L.canvas, 0, 0);
  c.restore();
}
function manorScene(c, t, o = {}) {
  c.drawImage(skySprite(), 0, 0, LW, LH);
  const mx = o.moonX == null ? 600 : o.moonX, my = o.moonY == null ? 150 : o.moonY;
  const fl = o.bolt || 0;
  if (o.moon !== false) moonAndClouds(c, t, mx, my, o.moonR || 34, { seed: 31, y: 150, speed: 10, cloudT: 20, flash: fl, wispX: mx + lerp(-150, 60, (o.t || 0) / 10) });
  if (fl > 0.01) { // the sky itself lights up round the bolt (the clouds scatter it)
    glow(c, 190, 150, 520, "#a6aade", 0.55 * fl);
    glow(c, 190, 120, 260, "#d8dcff", 0.35 * fl);
  }
  if (fl > 0.01) skyBolt(c, o.base, o.t, o.p, fl);
  mist(c, t, 328, 60, 2, 0.45, FOG_FAR, false, 0.6);
  c.drawImage(manorSprite(), MANOR_X, MANOR_Y, MW * 0.9, MH * 0.9);
  if (fl > 0.01) { c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = clamp(fl); c.drawImage(manorFlash(), MANOR_X, MANOR_Y, MW * 0.9, MH * 0.9); c.restore(); }
  if (o.candles !== false) candles(c, t, 1);
  if (o.door) doorCrack(c, t, o.door);
  // the house's base melts into the fog bank lying on the crest (contrast falls with distance)
  const fb = c.createLinearGradient(0, 270, 0, 326);
  fb.addColorStop(0, "rgba(70,64,98,0)"); fb.addColorStop(0.5, "rgba(70,64,98,0.28)"); fb.addColorStop(1, "rgba(76,70,104,0.66)");
  c.fillStyle = fb; c.fillRect(0, 270, LW, 56);
  drawSheet(c, fogSheet(71, 70, "#5a5478", "high"), t, 268, 70, 5, 0.36);
  WIN_SCREEN.forEach(([x, y], i) => glow(c, x, y + 2, 26, "#c8742e", 0.16 * (0.85 + 0.15 * K.noise(t * 2 + i, 5)), "screen"));
  c.drawImage(hillSprite(), 0, 0, LW, LH);
  if (fl > 0.01) { c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = clamp(fl); c.drawImage(hillFlash(), 0, 0, LW, LH); c.restore(); }
  // at the peak of a stroke the bright sky turns the house and the trees into hard silhouettes
  const sil = clamp((fl - 0.62) / 0.3);
  if (sil > 0.01) {
    c.save(); c.globalAlpha = sil * 0.9;
    c.drawImage(manorSil(), MANOR_X, MANOR_Y, MW * 0.9, MH * 0.9);
    c.fillStyle = "#050508"; c.fillRect(MANOR_X + MW * 0.05, MANOR_Y + MH * 0.9 - 2, MW * 0.8, 60);
    c.drawImage(hillSil(), 0, 0, LW, LH);
    c.restore();
  }
}
function candles(c, t, k) {
  WIN_SCREEN.forEach(([x, y], i) => {
    const fl = 0.8 + 0.2 * K.noise(t * 2.3 + i * 7.1, 11);
    glow(c, x, y, 9 * k, CANDLE, 0.3 * fl);
    glow(c, x, y, 22 * k, "#d07a34", 0.12 * fl);
  });
}
// the manor's door open a crack: a thin warm sliver (soft: the house is far and out of focus) and the
// light it lets fall on the step
function doorCrack(c, t, d, soft = 0) {
  const dx = 481, dy = 318;
  const fl = 0.9 + 0.1 * K.noise(t * 3, 4);
  const w = 0.9 + 0.8 * d + soft * 0.8, a = (0.75 - soft * 0.3) * d;
  const gr = c.createLinearGradient(0, dy - 42, 0, dy);
  gr.addColorStop(0, rgba("#ffcf8a", 0.4 * a)); gr.addColorStop(0.6, rgba("#ffe2b0", a)); gr.addColorStop(1, rgba("#fff0cc", a));
  c.fillStyle = gr; c.fillRect(dx - w / 2, dy - 42, w, 40);
  glow(c, dx, dy - 20, 12 + soft * 10, CANDLE, 0.35 * d * fl);
  glow(c, dx, dy - 22, 26 + 20 * d, "#d08040", 0.25 * d * fl);
  K.lightPool(c, dx + 2, dy + 2, 26 + 20 * d, "#ffb060", { intensity: 0.35 * d * fl, flat: 0.25 });
}
function shotManor(g, t, lt) {
  const p = eio(seg(lt, 0, 10));
  const fl = K.flash(lt, [6.0, 6.12, 6.42], 0.1);
  const base = g.getTransform();
  K.withCamera(g, LW, LH, { x: 480, y: lerp(292, 274, p), zoom: lerp(1.03, 1.12, p), shakeT: t, shakeAmt: 0.25 + fl * 2 }, (c) => {
    manorScene(c, t, { door: 0, bolt: fl, t, p, base });
    mist(c, t, 430, 150, 4, 0.26, FOG_MID, false, 1.0);
    mist(c, t, 505, 120, 7, 0.55, FOG_NEAR, true, 2.2);
  });
  // foreground: moves against the push (parallax), sways a touch in the wind
  g.save();
  branchXf(g, t, p);
  g.drawImage(fgBranch(), 0, 0, 400, 300);
  g.restore();
  flashWash(g, fl * 0.35);
}

// ---- iron gates -------------------------------------------------------------------------------------
// one wrought-iron leaf (hinge on the left, base at y = LEAF_B): hand-forged round bars of slightly
// varying width with spear tips, two rails, paired C-scrolls with collars; rust and pitting over the
// black (baked rust raster). The moonlit edges are added per shot (they depend on where the moon is).
const LEAF_W = 320, LEAF_H = 480, LEAF_B = 470, LEAF_BH = 430, LEAF_N = 9;
const IRON = "#0a0a0d";
const leafX = (i) => 6 + (i / LEAF_N) * (LEAF_W - 12);
const leafTop = (i) => LEAF_B - LEAF_BH * (0.86 + 0.14 * Math.sin((i / LEAF_N) * Math.PI));
const barW = (i, mirror) => 4.5 + K.hash(i + (mirror ? 20 : 0), 37) * 1.1;
function leafShapes(s, mirror, color, edgeOnly) {
  const w = LEAF_W - 12, h = LEAF_BH, x0 = 6, n = LEAF_N;
  s.lineCap = "butt";
  s.strokeStyle = color; s.fillStyle = color;
  for (let i = 0; i <= n; i++) {
    const x = leafX(i), top = leafTop(i), bw = barW(i, mirror), lean = (K.hash(i, 41) - 0.5) * 2.2;
    s.lineWidth = edgeOnly ? 1 : bw;
    const ex = edgeOnly ? bw * 0.42 : 0;
    s.beginPath(); s.moveTo(x + ex, LEAF_B); s.lineTo(x + lean + ex, top); s.stroke();
    if (!edgeOnly) { s.beginPath(); s.moveTo(x + lean - 6, top + 4); s.quadraticCurveTo(x + lean - 3, top - 6, x + lean, top - 17); s.quadraticCurveTo(x + lean + 3, top - 6, x + lean + 6, top + 4); s.closePath(); s.fill(); }
    else { s.beginPath(); s.moveTo(x + lean + 5.6, top + 3.6); s.quadraticCurveTo(x + lean + 2.6, top - 6, x + lean + 0.3, top - 16); s.stroke(); }
  }
  const rails = [LEAF_B - h * 0.12, LEAF_B - h * 0.64, LEAF_B - h * 0.44];
  for (const [k, yy] of rails.entries()) {
    s.lineWidth = edgeOnly ? 0.9 : (k < 2 ? 7 : 4);
    s.beginPath(); s.moveTo(x0, yy - (edgeOnly ? (k < 2 ? 3.2 : 1.8) : 0)); s.lineTo(x0 + w, yy - (edgeOnly ? (k < 2 ? 3.2 : 1.8) : 0)); s.stroke();
  }
  const yT = rails[1], yM = rails[2], cyy = (yT + yM) / 2, rr = (yM - yT) * 0.46;
  for (let i = 0; i < n; i++) {
    const bx = x0 + ((i + 0.5) / n) * w, bw = w / n, rx = bw * 0.24, ry = rr * 0.95;
    for (const sd of [-1, 1]) {
      const ccx = bx + sd * rx * 1.02;
      s.lineWidth = edgeOnly ? 0.8 : 2.6;
      s.beginPath();
      if (edgeOnly) s.ellipse(ccx, cyy, rx + 0.9, ry + 0.9, 0, sd < 0 ? -1.2 : Math.PI + 0.2, sd < 0 ? -0.2 : Math.PI + 1.2);
      else s.ellipse(ccx, cyy, rx, ry, 0, sd < 0 ? -1.35 : Math.PI - 1.35, sd < 0 ? 1.35 : Math.PI + 1.35);
      s.stroke();
      if (!edgeOnly) for (const vy of [-1, 1]) {
        const a = sd < 0 ? 1.35 * vy : Math.PI - 1.35 * vy;
        const ex = ccx + Math.cos(a) * rx, ey = cyy + Math.sin(a) * ry;
        s.beginPath(); s.arc(ex - sd * rx * 0.32, ey - vy * rx * 0.1, rx * 0.34, 0, TAU); s.stroke();
      }
    }
    if (!edgeOnly) s.fillRect(bx - 3, cyy - 5, 6, 10); else s.fillRect(bx + 2, cyy - 5, 0.9, 10);
  }
}
function paintLeaf(s, mirror) {
  if (mirror) { s.translate(LEAF_W, 0); s.scale(-1, 1); }
  leafShapes(s, mirror, IRON, false);
  // rust blooms, flaking paint and pitting over the iron (source-atop: only on the metal)
  s.globalCompositeOperation = "source-atop";
  matRect(s, mat("rust"), 0, 0, LEAF_W, LEAF_H, { scale: 90, scaleY: 260, ox: mirror ? 50 : 0, alpha: 0.9 });
  const fade = s.createLinearGradient(0, 0, 0, LEAF_H);
  fade.addColorStop(0, "rgba(8,8,10,0.35)"); fade.addColorStop(1, "rgba(8,8,10,0.1)");
  s.fillStyle = fade; s.fillRect(0, 0, LEAF_W, LEAF_H);
  s.globalCompositeOperation = "source-over";
}
const leafSprite = (mirror) => SPR(mirror ? "f05leafR4" : "f05leafL4", LEAF_W, LEAF_H, (s) => paintLeaf(s, mirror));
// the moon-side edges of every bar, rail and scroll as a white mask (lit per shot by alpha)
const leafEdge = (mirror) => SPR(mirror ? "f05leafER" : "f05leafEL", LEAF_W, LEAF_H, (s) => { if (mirror) { s.translate(LEAF_W, 0); s.scale(-1, 1); } leafShapes(s, mirror, "#ffffff", true); });
// draw a leaf swung by theta about its hinge (hx, by) in true perspective: the leaf is cut into vertical
// slices; slice u lies at depth z = u * L * sin(theta), so its screen scale is f / (f + z) about the
// camera centre (bars close up and the top and bottom edges taper toward the vanishing point).
// edge (optional): fn(u) -> alpha of the moonlit edge mask on that slice (a specular streak)
function drawLeaf(g, hx, by, sc, dir, theta, eyeY, edge, camX = 480, f = 950) {
  const spr = leafSprite(dir < 0), em = edge ? leafEdge(dir < 0) : null;
  const N = theta > 0.02 ? 28 : 1;
  const k = Math.cos(theta), sn = Math.sin(theta), Lw = LEAF_W * sc;
  const pw = spr.width, ph = spr.height;
  const P = (u) => { const z = u * Lw * sn, s = f / (f + z); return [camX + (hx + dir * u * Lw * k - camX) * s, s]; };
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N, um = (u0 + u1) / 2;
    const [xa] = P(u0), [xb] = P(u1), [, sv] = P(um);
    const top = eyeY + (by - LEAF_B * sc - eyeY) * sv, bot = eyeY + (by + (LEAF_H - LEAF_B) * sc - eyeY) * sv;
    const sx = dir > 0 ? u0 * pw : (1 - u1) * pw;
    const dx = Math.min(xa, xb), dw = Math.abs(xb - xa) + (N > 1 ? 0.6 : 0);
    g.drawImage(spr, sx, 0, pw / N, ph, dx, top, dw, bot - top);
    if (em) {
      const a = edge(um);
      if (a > 0.01) { g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = Math.min(1, a); g.drawImage(em, sx, 0, pw / N, ph, dx, top, dw, bot - top); g.restore(); }
    }
  }
}
// ivy: a woody stem with clusters of three-lobed leaves, black-green, a few catching the moon
function ivy(g, x0, y0, x1, y1, seed, n, sc = 1) {
  const R = K.rng("f05ivy" + seed);
  g.strokeStyle = "#121008"; g.lineWidth = 2 * sc; g.lineCap = "round";
  g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 + 40, (y0 + y1) / 2, x1 - 40, (y0 + y1) / 2, x1, y1); g.stroke();
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const x = lerp(x0, x1, u) + (R() - 0.5) * 34 * sc, y = lerp(y0, y1, u) + (R() - 0.5) * 22 * sc;
    const r = (5 + R() * 4) * sc, a = R() * TAU;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = mix("#070c08", "#18241a", R());
    g.beginPath();
    g.moveTo(0, r * 0.9);
    g.bezierCurveTo(-r * 1.2, r * 0.4, -r * 1.1, -r * 0.6, -r * 0.4, -r * 0.5);
    g.quadraticCurveTo(0, -r * 1.3, r * 0.4, -r * 0.5);
    g.bezierCurveTo(r * 1.1, -r * 0.6, r * 1.2, r * 0.4, 0, r * 0.9);
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 0.6 * sc;
    g.beginPath(); g.moveTo(0, r * 0.8); g.lineTo(0, -r * 0.6); g.stroke();
    if (R() > 0.55) { g.fillStyle = rgba(RIM, 0.12 + R() * 0.12); g.beginPath(); g.ellipse(r * 0.3, -r * 0.3, r * 0.45, r * 0.18, -0.6, 0, TAU); g.fill(); }
    g.restore();
  }
}
// a square stone gatepost (base at y): coursed stone, a capstone slab; back-lit, so the face toward
// us is in shadow, the right arris and the top of the cap catch the moon, moss at the foot
function paintPost(c, x, y, w, h) {
  const body = new Path2D(); body.rect(x - w / 2, y - h, w, h);
  c.fillStyle = "#28282e"; c.fill(body);
  masonry(c, body, { scale: w * 0.9, _x: x - w / 2, _y: y - h, seed: 12, tint: "#1c1c26", tintAlpha: 0.8, lichen: 0.6 });
  c.save(); c.clip(body);
  const sg = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  sg.addColorStop(0, "rgba(0,0,0,0.5)"); sg.addColorStop(0.75, "rgba(0,0,0,0.05)"); sg.addColorStop(0.94, "rgba(160,166,200,0.12)"); sg.addColorStop(1, "rgba(200,206,236,0.36)");
  c.fillStyle = sg; c.fillRect(x - w / 2, y - h, w, h);
  const mg = c.createLinearGradient(0, y - h * 0.35, 0, y);
  mg.addColorStop(0, "rgba(26,36,20,0)"); mg.addColorStop(1, "rgba(26,36,20,0.6)");
  c.fillStyle = mg; c.fillRect(x - w / 2, y - h * 0.35, w, h * 0.35);
  c.restore();
  K.aoEdge(c, x - w / 2, y - h + 1, x + w / 2, y - h + 1, { width: 18, alpha: 0.7, side: -1 });
  const cap = new Path2D(); cap.rect(x - w / 2 - 8, y - h - 16, w + 16, 16);
  c.fillStyle = "#323238"; c.fill(cap);
  nightMat(c, "stone", cap, { scale: 70, _x: x - w / 2 - 8, _y: y - h - 16 }, "#22222c", 0.7);
  c.fillStyle = "rgba(0,0,0,0.35)"; c.fillRect(x - w / 2 - 8, y - h - 6, w + 16, 6);
  c.save(); c.globalCompositeOperation = "lighter";
  c.fillStyle = rgba(RIM, 0.28); c.fillRect(x - w / 2 - 8, y - h - 16, w + 16, 1.4);
  c.fillStyle = rgba(RIM, 0.2); c.fillRect(x + w / 2 + 6.6, y - h - 16, 1.4, 16);
  c.restore();
}
const postSprite = (w, h) => SPR(`f05post4_${w}x${h}`, w + 24, h + 24, (s) => paintPost(s, (w + 24) / 2, h + 20, w, h));
function gatepost(g, x, y, w, h) { g.drawImage(postSprite(w, h), x - (w + 24) / 2, y - h - 20, w + 24, h + 24); }
// low-angle keystone: horizontal strips narrowed toward the top so verticals converge upward
function keystone(dst, src, w, h, topScale) {
  const N = Math.ceil(h / 2), sh = h / N, pw = src.width, ph = src.height;
  for (let i = 0; i < N; i++) {
    const u = 1 - (i + 0.5) / N;
    const s = lerp(1, topScale, u);
    dst.drawImage(src, 0, (i / N) * ph, pw, ph / N, w / 2 - (w * s) / 2, i * sh, w * s, sh + 0.6);
  }
}
const GATE_H = 600, GMX = 560, GMY = 150 + 60; // the moon in the gate plate's own (pre-keystone) space
// where a pre-keystone point lands on screen (the plate is drawn at y = LH - GATE_H)
const gateToScreen = (x, y) => { const s = lerp(1, 0.66, 1 - y / GATE_H); return [LW / 2 + (x - LW / 2) * s, y + LH - GATE_H]; };
const gatesSprite = staged("f05gates4", LW, GATE_H, () => [
  (s, st) => { st.T = scratch(LW, GATE_H); gatepost(st.T.g, 140, 600, 104, 370); gatepost(st.T.g, 820, 600, 104, 370); },
  (s, st) => { drawLeaf(st.T.g, 192, 580, 0.9, 1, 0, 0); drawLeaf(st.T.g, 768, 580, 0.9, -1, 0, 0); },
  (s, st) => {
    // each round bar catches the moon on the edge that faces it: a 1 px line whose strength falls with
    // the bar's distance from the moon disc (brightest where the bar crosses or grazes the disc)
    const c = st.T.g;
    const [mxs, mys] = gateToScreen(GMX, GMY);
    for (const [hx, dir] of [[192, 1], [768, -1]]) {
      for (let i = 0; i <= LEAF_N; i++) {
        const lx = leafX(i), px = dir > 0 ? lx : LEAF_W - lx;
        const sx = dir > 0 ? hx + px * 0.9 : hx - LEAF_W * 0.9 + px * 0.9;
        const topY = 580 - LEAF_B * 0.9 + leafTop(i) * 0.9;
        const bw = barW(i, dir < 0) * 0.9;
        const [sxT] = gateToScreen(sx, topY);
        const side = sxT < mxs ? 1 : -1, ex = sx + side * bw * 0.45;
        const hg = c.createLinearGradient(0, topY, 0, 580);
        for (let k = 0; k <= 8; k++) {
          const yy = lerp(topY, 580, k / 8), [xs, ys] = gateToScreen(ex, yy);
          const d = Math.hypot(xs - mxs, ys - mys);
          const a = (0.1 + 0.9 * Math.exp(-Math.max(0, d - 30) / 120)) * lerp(1, 0.35, k / 8);
          hg.addColorStop(k / 8, `rgba(226,232,248,${a.toFixed(3)})`);
        }
        c.fillStyle = hg; c.fillRect(ex - 0.5, topY - 12, 1, 580 - topY + 12);
      }
    }
    // the rails catch it along their top edges (the same falloff)
    for (const yy of [580 - LEAF_B * 0.9 + (LEAF_B - LEAF_BH * 0.64) * 0.9 - 3, 580 - LEAF_B * 0.9 + (LEAF_B - LEAF_BH * 0.44) * 0.9 - 2]) {
      const rg = c.createLinearGradient(192, 0, 768, 0);
      for (let k = 0; k <= 8; k++) { const xx = lerp(192, 768, k / 8), [xs, ys] = gateToScreen(xx, yy); const d = Math.hypot(xs - mxs, ys - mys); rg.addColorStop(k / 8, `rgba(226,232,248,${(0.06 + 0.5 * Math.exp(-d / 140)).toFixed(3)})`); }
      c.fillStyle = rg; c.fillRect(192, yy - 0.5, 576, 1);
    }
  },
  (s, st) => {
    const c = st.T.g;
    groundAO(c, 140, 600, 96, 16, 0.75);
    groundAO(c, 820, 600, 96, 16, 0.75);
    c.fillStyle = "rgba(0,0,0,0.35)"; c.fillRect(192, 574, 576, 8);
    c.strokeStyle = "#0c0b0e"; c.lineWidth = 4;
    for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(470 + i * 4, 330 + i * 10, 5, 8, 0.5, 0, TAU); c.stroke(); }
    c.strokeStyle = rgba(RIM, 0.25); c.lineWidth = 0.8;
    for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(470 + i * 4, 330 + i * 10, 4, 7, 0.5, -1.2, 0.2); c.stroke(); }
    const lock = new Path2D(); K.roundRect(lock, 468, 392, 26, 22, 3);
    matFill(c, mat("rust"), lock, { scale: 40, tint: "#4a4a54", tintAlpha: 0.5 });
    c.fillStyle = rgba(RIM, 0.3); c.fillRect(468, 392, 26, 1.2);
    ivy(c, 100, 590, 300, 300, 1, 34);
    ivy(c, 870, 570, 690, 330, 2, 28);
  },
  (s, st) => {
    const c = st.T.g;
    c.drawImage(gargoyle(false), 140 - 60, 230 - 14 - 100, 120, 100);
    const ball = new Path2D(); ball.arc(820, 200, 18, 0, TAU);
    c.fillStyle = "#28282e"; c.fill(ball);
    nightMat(c, "stone", ball, { scale: 50 }, "#1c1c26", 0.8);
    c.save(); c.clip(ball);
    const bg = c.createRadialGradient(812, 210, 2, 820, 200, 22);
    bg.addColorStop(0, "rgba(0,0,0,0.1)"); bg.addColorStop(0.8, "rgba(0,0,0,0.55)"); bg.addColorStop(1, "rgba(0,0,0,0.2)");
    c.fillStyle = bg; c.fill(ball);
    c.globalCompositeOperation = "lighter";
    c.strokeStyle = rgba(RIM, 0.45); c.lineWidth = 1.4;
    c.beginPath(); c.arc(820, 200, 17.5, -1.9, -0.2); c.stroke();
    c.restore();
    K.shadowBlob(c, 820, 216, 14, 3, { alpha: 0.6 });
  },
  ...[0, 1, 2].map((i) => (s, st) => {
    s.save(); s.beginPath(); s.rect(0, (GATE_H / 3) * i, LW, GATE_H / 3); s.clip();
    keystone(s, st.T.c, LW, GATE_H, 0.66);
    s.restore();
  }),
]);
// a crow: body, wedge tail, heavy bill; long fingered wings, the upstroke smeared (shutter blur).
// The moon behind rims its back.
function crowWing(g, s, a, far) {
  g.save();
  g.rotate(-a);
  g.scale(1, far ? 0.75 : 1);
  g.beginPath();
  g.moveTo(-s * 0.35, 0);
  g.bezierCurveTo(-s * 0.4, -s * 0.9, -s * 0.1, -s * 1.7, s * 0.15, -s * 2.3);
  for (let k = 0; k < 5; k++) { const u = k / 4; g.lineTo(s * (0.2 + u * 0.55), -s * (2.4 - u * 0.5)); g.lineTo(s * (0.32 + u * 0.5), -s * (2.0 - u * 0.62)); }
  g.bezierCurveTo(s * 0.9, -s * 0.9, s * 0.7, -s * 0.3, s * 0.4, 0);
  g.closePath();
  g.fill();
  g.restore();
}
function crow(g, x, y, s, flap, flying, face = 1) {
  g.save();
  g.translate(x, y);
  g.scale(face, 1);
  g.rotate(flying ? -0.25 : 0);
  g.fillStyle = "#040406";
  const body = new Path2D();
  body.ellipse(0, 0, s, s * 0.38, -0.12, 0, TAU);
  body.moveTo(s * 1.22, -s * 0.32); body.arc(s * 0.95, -s * 0.3, s * 0.3, 0, TAU);
  poly(body, [s * 1.18, -s * 0.42, s * 1.7, -s * 0.26, s * 1.16, -s * 0.16]);
  poly(body, [-s * 0.8, -s * 0.08, -s * 1.75, s * 0.3, -s * 1.85, -s * 0.05, -s * 1.7, -s * 0.22]);
  g.fill(body);
  if (!flying) {
    g.beginPath(); g.ellipse(-s * 0.1, -s * 0.12, s * 0.85, s * 0.3, -0.1, 0, TAU); g.fill();
    g.strokeStyle = "#040406"; g.lineWidth = s * 0.08;
    for (const lx of [-0.1, 0.15]) { g.beginPath(); g.moveTo(s * lx, s * 0.3); g.lineTo(s * lx + s * 0.05, s * 0.75); g.stroke(); }
  } else {
    const base = Math.sin(flap) * 1.15, up = Math.cos(flap) > 0;
    crowWing(g, s, base * 0.8 + 0.2, true);
    if (up) { for (let k = 1; k <= 3; k++) { g.globalAlpha = 0.22; crowWing(g, s, base - k * 0.16, false); } g.globalAlpha = 1; }
    crowWing(g, s, base, false);
  }
  g.globalCompositeOperation = "lighter";
  g.strokeStyle = rgba(RIM, 0.45); g.lineWidth = Math.max(0.7, s * 0.07);
  g.beginPath(); g.ellipse(0, 0, s, s * 0.38, -0.12, -2.4, -0.7); g.stroke();
  g.beginPath(); g.arc(s * 0.95, -s * 0.3, s * 0.3, -2.6, -0.6); g.stroke();
  g.restore();
}
// the far plate behind the gate: the manor small over a low ridge, out of focus (focus is on the gate)
const gatesBGSprite = softPlate("f05gbg4", LW, LH, 1.6, [(s) => {
  s.drawImage(manorSprite(), 480 - 150, 372 - 160, 300, 160);
  const ridge = new Path2D();
  ridge.moveTo(0, 372); for (let x = 0; x <= LW; x += 20) ridge.lineTo(x, 366 - 10 * K.fbm(x / 160, 3) - (x > 300 && x < 660 ? 0 : 6)); ridge.lineTo(LW, 372); ridge.closePath();
  s.fillStyle = "#1a1a24"; s.fill(ridge);
  const tg = s.createLinearGradient(0, 350, 0, 380);
  tg.addColorStop(0, "rgba(80,74,110,0)"); tg.addColorStop(1, "rgba(80,74,110,0.6)");
  s.fillStyle = tg; s.fillRect(0, 340, LW, 40);
  WIN_SCREEN.forEach(([x, y]) => glow(s, 480 + (x - 480) * 0.556, 212 + (y - MANOR_Y) * 0.556, 8, CANDLE, 0.5));
}], 3);
// the gravel forecourt in depth (bands, no perspective streaks), cached in stages
const GG_H = LH + 60 - 372;
const gatesGround = staged("f05gground2", LW, GG_H, () => [
  (s) => { s.translate(0, -372); s.fillStyle = "#26262c"; s.fillRect(0, 372, LW, GG_H); bandFill(s, gravelTex(), { hz: 368, y0: 372, y1: LH + 60, far: 8, near: 230, squash: 0.36, tint: "#262630", tintAlpha: 0.8, seed: 21 }); },
  (s) => {
    s.translate(0, -372);
    const fg = s.createLinearGradient(0, 372, 0, LH + 60);
    fg.addColorStop(0, "rgba(64,62,86,0.95)"); fg.addColorStop(0.08, "rgba(60,60,80,0.7)"); fg.addColorStop(0.3, "rgba(56,58,72,0.25)"); fg.addColorStop(1, "rgba(0,0,0,0)");
    s.fillStyle = fg; s.fillRect(0, 372, LW, GG_H);
    s.globalCompositeOperation = "lighter";
    K.lightPool(s, 560, 386, 300, "#8a8cb0", { intensity: 0.24, flat: 0.1 });
    s.globalCompositeOperation = "source-over";
    const dg = s.createLinearGradient(0, 400, 0, LH + 60);
    dg.addColorStop(0, "rgba(0,0,0,0)"); dg.addColorStop(1, "rgba(0,0,0,0.5)");
    s.fillStyle = dg; s.fillRect(0, 400, LW, LH);
  },
]);
function shotGates(g, t, lt) {
  const p = eio(seg(lt, 0, 10));
  K.withCamera(g, LW, LH, { x: 480, y: lerp(282, 272, p), zoom: lerp(1.0, 1.05, p), shakeT: t, shakeAmt: 0.3 }, (c) => {
    c.drawImage(skySprite(), 0, -60, LW, LH + 60);
    moonAndClouds(c, t, GMX, 150, 40, { seed: 33, y: 110, speed: 16, cloudT: 8, wispX: GMX + lerp(-170, 190, lt / 10) });
    c.drawImage(gatesBGSprite(), 0, 0, LW, LH);
    c.drawImage(gatesGround(), 0, 372, LW, GG_H);
    // fog BEHIND the bars: two sheets drifting at different speeds (far = slow, violet-grey)
    drawSheet(c, fogSheet(81, 140, "#4a4664", "high"), t, 300, 140, 6, 0.55);
    drawSheet(c, fogSheet(82, 120, "#42445a", "high"), t + 30, 330, 120, 11, 0.45);
    c.drawImage(gatesSprite(), 0, LH - GATE_H, LW, GATE_H);
    // the crow: perched on the right post's ball finial, then it lifts off across the moon
    const fly = seg(lt, 3.2, 8.4), fe = fly * fly * (3 - 2 * fly);
    const [bx, by] = gateToScreen(820, 182);
    if (fly <= 0) {
      const hop = Math.max(0, Math.sin(lt * 2.2)) > 0.97 ? 1 : 0;
      crow(c, bx, by - 2 - hop, 8.5, 0, false, -1);
    } else if (fly < 1) {
      const cx = lerp(bx, 120, fe) - Math.sin(fe * Math.PI) * 20, cy = by - 2 - fe * 150 + Math.sin(fe * Math.PI) * 50 - (1 - Math.pow(1 - fly, 3)) * 10;
      crow(c, cx, cy, 8.5 + fe * 3.5, lt * 15, true, -1);
    }
    // fog IN FRONT of the lower bars: a nearer, faster sheet, lit by the moon (lighter than the iron)
    drawSheet(c, fogSheet(83, 200, "#464858", "low"), t, 360, 200, 22, 0.62);
    mist(c, t, 540, 110, 13, 0.45, FOG_NEAR, true, 2.5);
  });
}

// ---- the gargoyle: a stone cat (no fur, no whiskers), carved wings, a handlebar moss moustache ---------
// Built in stages into a 520 x 440 plate: wings (with real thickness: a lit leading edge, a dark inner
// edge, chipped rims), the head (the cat painter in a stone coat), the carved body, then one pass of
// normal-mapped pitted stone over everything, occlusion, lichen and rain streaks, and the moss.
const GX = 260, GY = 420, GS = 150;
function wingPath(sd) {
  const wp = new Path2D();
  wp.moveTo(GX + sd * 26, GY - 170);
  wp.quadraticCurveTo(GX + sd * 150, GY - 290, GX + sd * 200, GY - 175);
  wp.quadraticCurveTo(GX + sd * 176, GY - 160, GX + sd * 170, GY - 130);
  wp.quadraticCurveTo(GX + sd * 150, GY - 128, GX + sd * 140, GY - 98);
  wp.quadraticCurveTo(GX + sd * 118, GY - 100, GX + sd * 104, GY - 66);
  wp.quadraticCurveTo(GX + sd * 60, GY - 100, GX + sd * 26, GY - 170);
  return wp;
}
const gargKey = (lit) => (lit ? { x: 820, y: -40, color: "#e4e8ff", strength: 1.6 } : { x: 700, y: -320, color: MOONL, strength: 0.8 });
const gargStages = (lit) => () => {
  const key = gargKey(lit), kL = lit ? 1 : 0.55;
  const nx = GX, ny = GY - GS * 1.49;
  return [
    (s, st) => { // wings
      st.T = scratch(520, 440);
      const c = st.T.g;
      for (const sd of [-1, 1]) {
        const wp = wingPath(sd);
        c.fillStyle = "#5a595e"; c.fill(wp);
        matFill(c, stoneTex(), wp, { scale: 150, ox: sd * 40 });
        c.save(); c.clip(wp);
        const toKey = Math.sign(key.x - GX) === sd ? 1 : 0;
        const wg = c.createLinearGradient(GX, GY - 280, GX + sd * 200, GY - 80);
        wg.addColorStop(0, `rgba(0,0,0,${toKey ? 0.15 : 0.45})`); wg.addColorStop(1, `rgba(0,0,0,${toKey ? 0.35 : 0.7})`);
        c.fillStyle = wg; c.fill(wp);
        // the finger bones: a ridge (dark groove under, lit crest over)
        for (const [ex, ey] of [[200, -175], [170, -130], [140, -98], [104, -66]]) {
          c.lineCap = "round";
          c.strokeStyle = "rgba(8,8,10,0.5)"; c.lineWidth = 7;
          c.beginPath(); c.moveTo(GX + sd * 36, GY - 176); c.quadraticCurveTo(GX + sd * (ex * 0.6), GY + (ey - 60) * 0.9, GX + sd * ex, GY + ey); c.stroke();
          c.strokeStyle = `rgba(200,202,220,${toKey ? 0.28 : 0.1})`; c.lineWidth = 2.4;
          c.beginPath(); c.moveTo(GX + sd * 36, GY - 181); c.quadraticCurveTo(GX + sd * (ex * 0.6), GY + (ey - 65) * 0.9, GX + sd * ex, GY + ey - 5); c.stroke();
        }
        // thickness: the scalloped trailing edge is the underside of a slab (dark band inside the rim)
        c.strokeStyle = "rgba(4,4,6,0.75)"; c.lineWidth = 9; c.stroke(wp);
        // occlusion where the wing roots into the body
        const ao = c.createRadialGradient(GX + sd * 30, GY - 150, 0, GX + sd * 30, GY - 150, 70);
        ao.addColorStop(0, "rgba(0,0,0,0.65)"); ao.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = ao; c.fillRect(GX + sd * 30 - 70, GY - 220, 140, 140);
        c.restore();
        // the leading edge (the arm bone) is a rounded thickness facing the sky: a lit band along it
        c.save();
        c.lineCap = "round";
        c.beginPath(); c.moveTo(GX + sd * 28, GY - 172); c.quadraticCurveTo(GX + sd * 150, GY - 289, GX + sd * 199, GY - 177);
        c.strokeStyle = `rgba(206,208,226,${(toKey ? 0.42 : 0.16) * (lit ? 1.3 : 1)})`; c.lineWidth = 3; c.stroke();
        c.strokeStyle = "rgba(10,10,12,0.5)"; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(GX + sd * 30, GY - 167); c.quadraticCurveTo(GX + sd * 150, GY - 282, GX + sd * 196, GY - 172); c.stroke();
        c.restore();
      }
    },
    (s, st) => { // the head: the photographic cat painter facing us (stone coat), kept above the chin only
      const c = st.T.g;
      const H = scratch(520, 440);
      const HS = GS * 1.32;
      K.drawCat(H.g, GX - HS * 0.33, ny + HS * 1.49, HS, {
        pose: "sit", facing: 1, coat: STONE, headTurn: 1, headTilt: -0.04, t: 0, collar: false, bell: false, shadow: false,
        blink: 0.35, autoBlink: false, breath: 0, ears: 0.4, pupil: 0, key, rim: { x: 700, y: -300, color: RIM, strength: lit ? 0.6 : 1.1 },
        fill: "#141418", ambient: "#383a48", ambientK: 0.15, backlit: 0,
      });
      c.save();
      c.beginPath(); c.rect(nx - 110, 0, 220, ny + 44); c.clip();
      c.drawImage(H.c, 0, 0, 520, 440);
      c.restore();
    },
    (s, st) => { // the carved body: chisel facets, each plane valued by the key (upper right)
      const c = st.T.g;
      const top = ny + 36, B = GY, x = nx;
      const P = (pts) => poly(new Path2D(), pts);
      const outline = P([x - 34, top - 6, x - 58, top + 34, x - 68, B - 92, x - 80, B - 36, x - 76, B, x + 76, B, x + 80, B - 36, x + 68, B - 92, x + 58, top + 34, x + 34, top - 6]);
      c.fillStyle = "#6a696e"; c.fill(outline);
      matFill(c, stoneTex(), outline, { scale: 200, _x: x - 80, _y: top });
      const facet = (pts, a, hi) => {
        const p = P(pts);
        if (a > 0) { c.fillStyle = `rgba(6,6,8,${a})`; c.fill(p); }
        if (hi > 0) { c.save(); c.globalCompositeOperation = "lighter"; c.fillStyle = `rgba(196,198,220,${hi * kL * 1.6})`; c.fill(p); c.restore(); }
      };
      facet([x - 76, B, x - 80, B - 36, x - 68, B - 92, x - 46, B - 70, x - 44, B], 0.72, 0);
      facet([x - 68, B - 92, x - 58, top + 34, x - 36, top + 70, x - 46, B - 70], 0.6, 0);
      facet([x + 76, B, x + 80, B - 36, x + 68, B - 92, x + 46, B - 70, x + 44, B], 0.05, 0.3);
      facet([x + 68, B - 92, x + 58, top + 34, x + 36, top + 70, x + 46, B - 70], 0.02, 0.38);
      facet([x - 34, top - 6, x - 58, top + 34, x - 36, top + 70, x - 24, top + 64, x - 20, top + 4], 0.45, 0);
      facet([x + 34, top - 6, x + 58, top + 34, x + 36, top + 70, x + 24, top + 64, x + 20, top + 4], 0.02, 0.36);
      facet([x - 20, top + 4, x + 20, top + 4, x + 24, top + 64, x, top + 84, x - 24, top + 64], 0.12, 0.12);
      // the chest is a rounded mass, not three planes: a soft volume gradient over the facets
      c.save(); c.clip(outline);
      const vol = c.createRadialGradient(x + 22, top + 30, 4, x + 6, top + 60, 110);
      vol.addColorStop(0, `rgba(190,192,214,${0.16 * kL})`); vol.addColorStop(0.5, "rgba(0,0,0,0)"); vol.addColorStop(1, "rgba(0,0,0,0.35)");
      c.fillStyle = vol; c.fill(outline);
      c.restore();
      for (const sd of [-1, 1]) {
        const lx = x + sd * 16;
        facet([lx - 11, top + 70, lx + 11, top + 70, lx + 10, B - 12, lx - 10, B - 12], sd > 0 ? 0.05 : 0.2, sd > 0 ? 0.2 : 0.07);
        facet([lx + sd * 11, top + 70, lx + sd * 15, top + 84, lx + sd * 14, B - 10, lx + sd * 10, B - 12], sd > 0 ? 0.02 : 0.6, sd > 0 ? 0.28 : 0);
        const paw = P([lx - 13, B - 14, lx + 13, B - 14, lx + 15, B - 2, lx - 15, B - 2]);
        c.fillStyle = "rgba(6,6,8,0.18)"; c.fill(paw);
        c.save(); c.globalCompositeOperation = "lighter"; c.fillStyle = `rgba(196,198,220,${0.18 * kL})`; c.fillRect(lx - 12, B - 14, 24, 2.5); c.restore();
        c.strokeStyle = "rgba(8,8,10,0.7)"; c.lineWidth = 1.4;
        for (const tx of [-6, 0, 6]) { c.beginPath(); c.moveTo(lx + tx, B - 9); c.lineTo(lx + tx * 1.1, B - 2); c.stroke(); }
        // occlusion under each paw where it meets the plinth, and between the toes
        const pa = c.createLinearGradient(0, B - 6, 0, B);
        pa.addColorStop(0, "rgba(0,0,0,0)"); pa.addColorStop(1, "rgba(0,0,0,0.6)");
        c.fillStyle = pa; c.fillRect(lx - 15, B - 6, 30, 6);
      }
      c.strokeStyle = "rgba(4,4,6,0.8)"; c.lineWidth = 2.6;
      for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(x + sd * 29, top + 76); c.lineTo(x + sd * 31, B - 12); c.stroke(); }
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(x, top + 84); c.lineTo(x, B - 2); c.stroke();
      c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(x - 46, B - 70); c.lineTo(x - 30, top + 74); c.moveTo(x + 46, B - 70); c.lineTo(x + 30, top + 74); c.stroke();
      const tail = new Path2D();
      tail.moveTo(x + 72, B - 4); tail.bezierCurveTo(x + 50, B + 2, x - 10, B + 2, x - 44, B - 8);
      tail.bezierCurveTo(x - 50, B - 12, x - 46, B - 18, x - 38, B - 15);
      tail.bezierCurveTo(x - 10, B - 7, x + 44, B - 9, x + 70, B - 13); tail.closePath();
      c.fillStyle = "#5e5d62"; c.fill(tail);
      matFill(c, stoneTex(), tail, { scale: 160, _x: x, _y: B });
      c.fillStyle = "rgba(6,6,8,0.3)"; c.fill(tail);
      c.save(); c.globalCompositeOperation = "lighter"; c.strokeStyle = `rgba(196,198,220,${0.25 * kL})`; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(x + 70, B - 12); c.bezierCurveTo(x + 44, B - 8, x - 10, B - 6, x - 38, B - 14); c.stroke(); c.restore();
      // the chin throws a deep occlusion shadow on the chest
      const cs = c.createLinearGradient(0, top - 6, 0, top + 30);
      cs.addColorStop(0, "rgba(2,2,4,0.85)"); cs.addColorStop(0.5, "rgba(2,2,4,0.35)"); cs.addColorStop(1, "rgba(2,2,4,0)");
      c.save(); c.clip(outline); c.fillStyle = cs; c.fillRect(x - 60, top - 6, 120, 36); c.restore();
      const RL = K.rng("garg-lichen" + (lit ? 1 : 0));
      for (let i = 0; i < 26; i++) {
        const along = RL(), gx = i % 3 === 0 ? x + (RL() - 0.5) * 3 : (i % 3 === 1 ? lerp(x - 46, x - 30, along) : lerp(x + 46, x + 30, along));
        const gy = i % 3 === 0 ? lerp(top + 86, B - 6, along) : lerp(B - 70, top + 74, along);
        c.fillStyle = rgba(mix("#6a6e5a", "#94947a", RL()), 0.32 + RL() * 0.3);
        c.beginPath(); c.ellipse(gx + (RL() - 0.5) * 4, gy, 1.5 + RL() * 3, 1 + RL() * 2, RL() * 3, 0, TAU); c.fill();
      }
    },
    (s, st) => { // one stone over everything: grey (no fur hue survives), normal-mapped pitting, weathering
      const c = st.T.g;
      st.mask = scratch(520, 440); st.mask.g.setTransform(1, 0, 0, 1, 0, 0); st.mask.g.drawImage(st.T.c, 0, 0);
      c.save();
      c.globalCompositeOperation = "source-atop";
      matRect(c, stoneTex(), 0, 0, 520, 440, { scale: 150, mode: "overlay", alpha: 0.5 });
      c.fillStyle = "#77767a"; c.globalCompositeOperation = "saturation"; c.fillRect(0, 0, 520, 440);
      c.globalCompositeOperation = "overlay";
      matRect(c, mat("stoneN"), 0, 0, 520, 440, { scale: 120, alpha: lit ? 0.95 : 0.75 });
      matRect(c, mat("stoneN"), 0, 0, 520, 440, { scale: 46, ox: 13, alpha: lit ? 0.5 : 0.35 });
      c.globalCompositeOperation = "source-atop";
      const R = K.rng("garg-stone");
      c.strokeStyle = "rgba(12,12,14,0.6)"; c.lineWidth = 1.2;
      for (let i = 0; i < 12; i++) { const x = GX - 70 + R() * 140, y = GY - 230 + R() * 210; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (R() - 0.5) * 16, y + 10 + R() * 18); c.lineTo(x + (R() - 0.5) * 20, y + 26 + R() * 20); c.stroke(); }
      for (let i = 0; i < 26; i++) {
        const x = GX - 110 + R() * 220, y0 = GY - 250 + R() * 120;
        const sg = c.createLinearGradient(0, y0, 0, GY);
        sg.addColorStop(0, "rgba(14,14,16,0.26)"); sg.addColorStop(1, "rgba(14,14,16,0)");
        c.fillStyle = sg; c.fillRect(x, y0, 1.5 + R() * 3, GY - y0);
      }
      for (let i = 0; i < 9; i++) {
        const lx = GX - 90 + R() * 180, ly = GY - 250 + R() * 150, lr = 2 + R() * 5;
        c.fillStyle = rgba(mix("#6a6e5a", "#8a8c72", R()), 0.16 + R() * 0.1);
        c.beginPath();
        for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU, rr = lr * (0.6 + R() * 0.7); (k ? c.lineTo : c.moveTo).call(c, lx + Math.cos(a) * rr, ly + Math.sin(a) * rr * 0.7); }
        c.closePath(); c.fill();
      }
      const sg = c.createLinearGradient(0, GY - 300, 0, GY);
      sg.addColorStop(0, "rgba(0,0,0,0)"); sg.addColorStop(1, "rgba(8,8,12,0.35)");
      c.fillStyle = sg; c.fillRect(0, 0, 520, 440);
      c.restore();
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = "destination-in"; c.drawImage(st.mask.c, 0, 0); c.restore();
      // chipped arrises: small bites out of the wing rims and the ear tips
      c.save(); c.globalCompositeOperation = "destination-out";
      const RC = K.rng("garg-chips");
      for (const sd of [-1, 1]) for (let i = 0; i < 9; i++) {
        const u = RC(), ex = GX + sd * lerp(60, 196, u), ey = GY - 175 - Math.sin(u * Math.PI) * 70 * (1 - u * 0.3) + (u > 0.85 ? 10 : 0);
        c.beginPath(); c.moveTo(ex, ey - 1); c.lineTo(ex + sd * (2 + RC() * 4), ey + 3 + RC() * 3); c.lineTo(ex - sd * (1 + RC() * 3), ey + 4); c.closePath(); c.fill();
      }
      c.restore();
    },
    (s, st) => { // the moss moustache: clumped cushion moss along a curled handlebar, lit tips
      const c = st.T.g;
      const sides = [];
      const must = new Path2D();
      for (const sd of [-1, 1]) {
        const pts = [];
        for (let k = 0; k <= 26; k++) {
          const u = k / 26;
          if (u < 0.7) { const v = u / 0.7; pts.push([nx + sd * (4 + v * 46), ny + 6 + Math.sin(v * Math.PI) * 7 - v * v * 4, lerp(10, 6, v)]); }
          else { const v = (u - 0.7) / 0.3, a = Math.PI * 0.5 + v * Math.PI * 1.5; pts.push([nx + sd * (50 + Math.cos(a) * -10 * (1 - v * 0.4)), ny + 2 - Math.sin(a) * 10 * (1 - v * 0.4), lerp(6, 3, v)]); }
        }
        sides.push(pts);
        for (const [x, y, r] of pts) { must.moveTo(x + r, y); must.arc(x, y, r, 0, TAU); }
      }
      // its shadow on the stone (soft, down-left, away from the key)
      c.save(); c.translate(-2.5, 5); c.fillStyle = "rgba(4,6,2,0.8)";
      if (K.hasFilter()) c.filter = `blur(${K.qblur((3 * K.pixelScale()).toFixed(1))}px)`;
      c.fill(must); c.restore();
      c.fillStyle = "#162010"; c.fill(must);
      matFill(c, mat("moss"), must, { scale: 34 });
      // clumps: each a little dome, dark at its base, its key-facing top lit; fbm sets their size
      const RM = K.rng("moss2");
      for (const pts of sides) for (const [x, y, r] of pts) for (let q = 0; q < 3; q++) {
        const cx = x + (RM() - 0.5) * r * 1.2, cy = y + (RM() - 0.5) * r * 1.1, cr = r * (0.35 + 0.35 * (K.fbm(cx * 0.2 + cy * 0.13, 7) + 0.5));
        const gr = c.createRadialGradient(cx + cr * 0.35, cy - cr * 0.4, 0, cx, cy, cr);
        gr.addColorStop(0, lit ? "rgba(176,206,110,0.95)" : "rgba(118,142,70,0.85)");
        gr.addColorStop(0.45, "rgba(58,84,30,0.8)");
        gr.addColorStop(1, "rgba(14,20,8,0)");
        c.fillStyle = gr; c.beginPath(); c.arc(cx, cy, cr, 0, TAU); c.fill();
      }
      c.save(); c.clip(must);
      const lo = c.createLinearGradient(0, ny - 8, 0, ny + 18);
      lo.addColorStop(0, "rgba(0,0,0,0)"); lo.addColorStop(1, "rgba(0,0,0,0.5)");
      c.fillStyle = lo; c.fillRect(nx - 70, ny - 30, 140, 60);
      const side = c.createLinearGradient(nx - 60, 0, nx + 60, 0);
      side.addColorStop(0, "rgba(0,0,0,0.35)"); side.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = side; c.fillRect(nx - 70, ny - 30, 140, 60);
      c.restore();
      // the fuzzy edge: short filaments standing off the cushion, the key side tipped with light
      c.lineWidth = 0.8; c.lineCap = "round";
      for (const pts of sides) for (const [x, y, r] of pts) for (let q = 0; q < 3; q++) {
        const a = RM() * TAU, l = r * (0.8 + RM() * 0.4), up = Math.cos(a) * 0.6 - Math.sin(a) * 0.8;
        c.strokeStyle = rgba(mix("#141c0c", up > 0.3 ? "#9ab45a" : "#3a5020", RM()), 0.6);
        const x1 = x + Math.cos(a) * (l + 2 + RM() * 2), y1 = y + Math.sin(a) * (l + 2 + RM() * 2);
        c.beginPath(); c.moveTo(x + Math.cos(a) * l * 0.7, y + Math.sin(a) * l * 0.7); c.lineTo(x1, y1); c.stroke();
        if (up > 0.4 && RM() < 0.5) { c.fillStyle = lit ? "rgba(220,236,170,0.8)" : "rgba(160,180,120,0.55)"; c.fillRect(x1 - 0.5, y1 - 0.5, 1.1, 1.1); }
      }
    },
    (s, st) => { // one key for the whole carving + occlusion low on the body, then into the plate
      const c = st.T.g;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = "source-atop";
      const W2 = st.T.c.width, H2 = st.T.c.height, kx = W2 / 520;
      const sideG = c.createLinearGradient(140 * kx, 0, 400 * kx, 0);
      sideG.addColorStop(0, `rgba(4,4,6,${lit ? 0.42 : 0.5})`); sideG.addColorStop(0.45, `rgba(4,4,6,${lit ? 0.18 : 0.2})`); sideG.addColorStop(1, "rgba(4,4,6,0)");
      c.fillStyle = sideG; c.fillRect(0, 0, W2, H2);
      const topG = c.createLinearGradient(0, 80 * kx, 0, 420 * kx);
      topG.addColorStop(0, "rgba(0,0,0,0)"); topG.addColorStop(0.7, "rgba(4,4,6,0.15)"); topG.addColorStop(1, "rgba(4,4,6,0.55)");
      c.fillStyle = topG; c.fillRect(0, 0, W2, H2);
      if (lit) {
        const hl = c.createLinearGradient(260 * kx, 0, 470 * kx, 0);
        hl.addColorStop(0, "rgba(176,178,215,0.06)"); hl.addColorStop(1, "rgba(186,188,225,0.42)");
        c.fillStyle = hl; c.fillRect(0, 0, W2, H2);
      }
      c.restore();
      s.drawImage(st.T.c, 0, 0, 520, 440);
    },
  ];
};
const GARG = [staged("f05gargD4", 520, 440, gargStages(false)), staged("f05gargL4", 520, 440, gargStages(true))];
const gargoyle = (lit) => GARG[lit ? 1 : 0]();
// the wings as a flat dark silhouette (their hard shadow on the cap during the lightning)
const wingShadow = staged("f05wingsh", 520, 440, () => [(s) => { s.fillStyle = "#000"; s.fill(wingPath(-1)); s.fill(wingPath(1)); }]);

// ---- the figures in the fog ------------------------------------------------------------------------
// the Shadow: a tall thin cat silhouette (the cat model with the legs lengthened ~1.4x). The core is a
// cached body per gait phase; round it, every frame, three offset copies at falling alpha drift upward
// and are eaten by a scrolling fbm (cloud density) mask, so its edges smoke off. The core is slightly
// see-through (the fog shows through the legs) and stays black whatever light is round it.
const SH_PH = 8, SH_W = 200, SH_H = 200, SH_BASE = 190, SH_REF = 60, SH_CAT = 56, SH_LEG = 1.42;
function shadowCore(b) {
  return SPR("f05shcore_" + b, SH_W, SH_H, (s) => {
    const ps = K.pixelScale();
    const A = scratch(SH_W, 160);
    K.drawCat(A.g, SH_W / 2, 150, SH_CAT, { pose: "walk", phase: b / SH_PH, facing: 1, coat: SHADOW, t: 0, headTurn: -0.3, headTilt: -0.12, collar: false, bell: false, shadow: false, ears: 0.9, tail: 0.75, tailUp: 0.6, flat: true });
    A.g.setTransform(1, 0, 0, 1, 0, 0);
    A.g.globalCompositeOperation = "source-in";
    A.g.fillStyle = "#050507"; A.g.fillRect(0, 0, A.c.width, A.c.height);
    const cut = 150 - SH_CAT * 0.44, legH = 150 - cut, top = SH_BASE - legH * SH_LEG;
    const sxw = 0.9, ox = (SH_W - SH_W * sxw) / 2;
    if (K.hasFilter()) s.filter = `blur(${K.qblur((0.7 * ps).toFixed(1))}px)`;
    s.drawImage(A.c, 0, 0, A.c.width, (cut + 1) * ps, ox, top - cut, SH_W * sxw, cut + 1);
    s.drawImage(A.c, 0, cut * ps, A.c.width, legH * ps, ox, top, SH_W * sxw, legH * SH_LEG);
    s.filter = "none";
    // the legs thin toward the ground (the fog shows through them)
    s.globalCompositeOperation = "destination-out";
    const legTop = SH_BASE - SH_CAT * 0.44 * SH_LEG;
    const fg = s.createLinearGradient(0, legTop, 0, SH_BASE + 2);
    fg.addColorStop(0, "rgba(0,0,0,0)"); fg.addColorStop(0.5, "rgba(0,0,0,0.3)"); fg.addColorStop(1, "rgba(0,0,0,0.7)");
    s.fillStyle = fg; s.fillRect(0, legTop, SH_W, SH_BASE - legTop + 10);
  });
}
// the cold moon edge on its top contour (the core minus itself shifted down, blurred)
function shadowRim(b) {
  return SPR("f05shrim_" + b, SH_W, SH_H, (s) => {
    const ps = K.pixelScale(), C = shadowCore(b);
    const T = scratch(SH_W, SH_H);
    T.g.setTransform(1, 0, 0, 1, 0, 0);
    T.g.drawImage(C, 0, 0);
    T.g.globalCompositeOperation = "destination-out";
    T.g.drawImage(C, 0.6 * ps, 2.2 * ps);
    T.g.globalCompositeOperation = "source-in";
    T.g.fillStyle = "#c8d0ee"; T.g.fillRect(0, 0, T.c.width, T.c.height);
    if (K.hasFilter()) s.filter = `blur(${K.qblur((1 * ps).toFixed(1))}px)`;
    s.drawImage(T.c, 0, 0, SH_W, SH_H);
    s.filter = "none";
  });
}
function shadowFigure(g, x, y, size, t, phase, alpha) {
  if (alpha <= 0.01) return;
  const sc = size / SH_REF;
  const b = ((Math.floor(phase * SH_PH) % SH_PH) + SH_PH) % SH_PH;
  const core = shadowCore(b), dx = x - (SH_W / 2) * sc, dy = y - SH_BASE * sc, dw = SH_W * sc, dh = SH_H * sc;
  // smoke: offset copies, drifting up and back, masked by moving fbm density, at quarter resolution
  const q = 4, L = K.layer(LW / q, LH / q, "f05smoke");
  const m = g.getTransform(), r = L.canvas.width / g.canvas.width;
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  L.g.globalCompositeOperation = "source-over"; L.g.globalAlpha = 1;
  L.g.clearRect(0, 0, L.canvas.width, L.canvas.height);
  L.g.setTransform(m.a * r, m.b * r, m.c * r, m.d * r, m.e * r, m.f * r);
  for (let k = 0; k < 3; k++) {
    const ph = t * (0.35 + k * 0.12) + k * 2.1;
    const ox = (Math.sin(ph) * 0.06 - 0.05 * (k + 1)) * size, oy = -(0.05 + 0.07 * k) * size - ((t * 0.3 + k / 3) % 1) * size * 0.08;
    const gr = 1 + 0.08 * (k + 1);
    L.g.globalAlpha = [0.75, 0.5, 0.32][k];
    L.g.drawImage(core, dx + ox - dw * (gr - 1) / 2, dy + oy - dh * (gr - 1) * 0.7, dw * gr, dh * gr);
  }
  L.g.globalAlpha = 1;
  L.g.globalCompositeOperation = "destination-in";
  const pat = L.g.createPattern(mat("cloud"), "repeat");
  const ts = mat("cloud").width, pk = (size * 2.2) / ts;
  if (pat.setTransform && typeof DOMMatrix !== "undefined") pat.setTransform(new DOMMatrix([pk, 0, 0, pk, x - t * size * 0.12, y - t * size * 0.35]));
  L.g.fillStyle = pat;
  L.g.fillRect(dx - dw, dy - dh, dw * 3, dh * 2.5);
  L.g.globalCompositeOperation = "source-over";
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha *= alpha * 0.9;
  g.drawImage(L.canvas, 0, 0, L.canvas.width, L.canvas.height, 0, 0, g.canvas.width, g.canvas.height);
  g.restore();
  // the core: slightly see-through; then the moon's cold edge on top
  g.save();
  g.globalAlpha *= alpha * 0.86;
  g.drawImage(core, dx, dy, dw, dh);
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = alpha * 0.32;
  g.drawImage(shadowRim(b), dx, dy - 0.5, dw, dh);
  g.restore();
}
// a low patch of ground mist round a figure's feet (cloud density in a flat soft ellipse, per colour)
const mistPatch = (color) => SPR("f05mpatch2" + color, 192, 48, (s) => {
  matRect(s, mat("cloud"), 0, 0, 192, 48, { scale: 150, scaleY: 50, ox: 63 });
  s.globalCompositeOperation = "destination-in";
  s.save(); s.translate(96, 26); s.scale(1, 0.25);
  const rg = s.createRadialGradient(0, 0, 0, 0, 0, 96);
  rg.addColorStop(0, "rgba(0,0,0,1)"); rg.addColorStop(0.6, "rgba(0,0,0,0.6)"); rg.addColorStop(1, "rgba(0,0,0,0)");
  s.fillStyle = rg; s.fillRect(-96, -104, 192, 208);
  s.restore();
  s.globalCompositeOperation = "source-in";
  s.fillStyle = color; s.fillRect(0, 0, 192, 48);
});
function groundMist(c, t, x, y, w, seed, a, color) {
  const spr = mistPatch(color), h = w * 0.25;
  c.save();
  for (let k = 0; k < 2; k++) {
    const dx = Math.sin(t * (0.23 + k * 0.11) + seed + k * 2) * w * 0.12;
    c.globalAlpha = a * (k ? 0.6 : 0.8);
    c.drawImage(spr, x - w / 2 + dx, y - h * 0.62, w * (1 + k * 0.2), h);
  }
  c.restore();
}
function drivePrints(c, sB, sz, glowK) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const s = sB - sz * 0.5 - i * sz * 0.62;
    if (s < 0) break;
    const P = driveS(s), psz = figSize(P.u);
    const side = i % 2 ? 1 : -1;
    const nx = -Math.sin(P.ang), ny = Math.cos(P.ang);
    pts.push({ x: P.x + nx * side * psz * 0.14, y: P.y + ny * side * psz * 0.14, a: P.ang + Math.PI / 2, s: Math.max(2.2, psz * 0.16), alpha: clamp(1 - i * 0.15) * (0.35 + 0.65 * glowK), flat: 0.42 });
  }
  K.pawprints(c, pts, 0.8 * glowK);
}
const MOON_D = { x: 500, y: 178 }; // hidden behind the house: only its halo and the rims show
const TORCH = { x: 240, y: 560 }; // the flashlight, behind and below the camera (world units)
// a long soft cast shadow: rooted narrow and dark at the paws (umbra), widening and softening with
// distance (penumbra); cached once and laid along the light's direction
const longShadowSprite = () => SPR("f05lshadow2", 256, 64, (s) => {
  const T = scratch(256, 64);
  const gr = T.g.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, "rgba(0,0,0,0.95)"); gr.addColorStop(0.2, "rgba(0,0,0,0.8)"); gr.addColorStop(0.6, "rgba(0,0,0,0.38)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  T.g.fillStyle = gr;
  T.g.beginPath(); T.g.moveTo(2, 28); T.g.bezierCurveTo(60, 22, 160, 16, 252, 14); T.g.lineTo(252, 50); T.g.bezierCurveTo(160, 48, 60, 42, 2, 36); T.g.closePath(); T.g.fill();
  if (K.hasFilter()) s.filter = `blur(${K.qblur((2 * K.pixelScale()).toFixed(1))}px)`;
  s.drawImage(T.c, 0, 0, 256, 64);
  s.filter = "none";
});
function castLong(c, x, y, ang, len, wid, a) {
  if (a <= 0.01) return;
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.globalAlpha *= a;
  c.drawImage(longShadowSprite(), -2, -wid * 0.5, len, wid);
  c.restore();
}
// the torch's footprint on the wet gravel: a hot centre, a soft falloff with the faint brighter ring
// a reflector torch throws, and the specular sparkle of wet stones inside it (cached)
const hotSprite = () => SPR("f05hot2", 256, 256, (s) => {
  const a = s.createRadialGradient(128, 128, 0, 128, 128, 128);
  a.addColorStop(0, "rgba(255,246,226,0.62)"); a.addColorStop(0.12, "rgba(255,240,214,0.5)"); a.addColorStop(0.3, "rgba(255,232,200,0.3)");
  a.addColorStop(0.5, "rgba(255,226,190,0.16)"); a.addColorStop(0.62, "rgba(255,222,186,0.19)"); a.addColorStop(0.72, "rgba(255,216,180,0.09)");
  a.addColorStop(0.88, "rgba(255,210,170,0.025)"); a.addColorStop(1, "rgba(255,200,160,0)");
  s.fillStyle = a; s.fillRect(0, 0, 256, 256);
});
const glintSprite = (k) => SPR("f05glint2_" + k, 256, 256, (s) => {
  const R = K.rng("f05glints" + k);
  for (let i = 0; i < 220; i++) {
    const a = R() * TAU, r = Math.sqrt(R()) * 118, x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r;
    const fall = Math.pow(1 - r / 120, 1.6), sz = 0.5 + R() * 1.1, br = (0.3 + R() * 0.7) * fall;
    s.fillStyle = `rgba(255,250,236,${br.toFixed(3)})`;
    s.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    if (br > 0.75) { s.fillStyle = `rgba(255,250,236,${(br * 0.35).toFixed(3)})`; s.fillRect(x - sz * 1.6, y - 0.3, sz * 3.2, 0.6); }
  }
});
function torchFootprint(c, x, y, r, I, t) {
  if (I <= 0.01) return;
  c.save();
  c.globalCompositeOperation = "lighter";
  c.globalAlpha = clamp(I);
  c.translate(x, y);
  c.rotate(Math.atan2((y - TORCH.y) * 0.4, x - TORCH.x) * 0.5);
  c.drawImage(hotSprite(), -r * 1.35, -r * 0.42, r * 2.7, r * 0.84);
  // sparkle: three glint fields fading in and out at different rates (stones catching the moving light)
  for (let k = 0; k < 3; k++) {
    c.globalAlpha = clamp(I) * clamp(0.5 + 0.5 * Math.sin(t * (2.3 + k * 1.1) + k * 2.1));
    c.drawImage(glintSprite(k), -r * 0.9, -r * 0.28, r * 1.8, r * 0.56);
  }
  c.restore();
}
// volumetric shafts in the fog: a cached cone (lateral falloff, a few brighter streaks from the
// reflector rings) modulated by drifting fbm density, composited additively at quarter res
const coneSprite = () => SPR("f05cone2", 512, 128, (s) => {
  const T = scratch(512, 128), c = T.g;
  const gl = c.createLinearGradient(0, 0, 512, 0);
  gl.addColorStop(0, "rgba(255,240,214,1)"); gl.addColorStop(0.25, "rgba(255,236,206,0.75)"); gl.addColorStop(0.7, "rgba(255,230,200,0.35)"); gl.addColorStop(1, "rgba(255,230,200,0)");
  c.fillStyle = gl;
  c.beginPath(); c.moveTo(0, 60); c.lineTo(512, 4); c.lineTo(512, 124); c.lineTo(0, 68); c.closePath(); c.fill();
  c.globalCompositeOperation = "destination-in";
  const lat = c.createLinearGradient(0, 0, 0, 128);
  lat.addColorStop(0, "rgba(0,0,0,0)"); lat.addColorStop(0.3, "rgba(0,0,0,0.6)"); lat.addColorStop(0.5, "rgba(0,0,0,1)"); lat.addColorStop(0.7, "rgba(0,0,0,0.6)"); lat.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = lat; c.fillRect(0, 0, 512, 128);
  c.globalCompositeOperation = "lighter";
  const R = K.rng("f05shafts");
  for (let i = 0; i < 7; i++) {
    const e = (R() - 0.5) * 0.85;
    c.strokeStyle = `rgba(255,240,220,${0.1 + R() * 0.12})`; c.lineWidth = 2 + R() * 4;
    c.beginPath(); c.moveTo(0, 64); c.lineTo(512, 64 + e * 120); c.stroke();
  }
  if (K.hasFilter()) s.filter = `blur(${K.qblur((1.5 * K.pixelScale()).toFixed(1))}px)`;
  s.drawImage(T.c, 0, 0, 512, 128);
  s.filter = "none";
});
function torchShafts(c, x, y, ang, len, I, t) {
  if (I <= 0.01) return;
  const k = 4, L = K.layer(LW / k, LH / k, "f05shaft");
  const m = c.getTransform();
  const r = L.canvas.width / c.canvas.width;
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  L.g.globalCompositeOperation = "source-over"; L.g.globalAlpha = 1;
  L.g.clearRect(0, 0, L.canvas.width, L.canvas.height);
  L.g.setTransform(m.a * r, m.b * r, m.c * r, m.d * r, m.e * r, m.f * r);
  L.g.save();
  L.g.translate(x, y); L.g.rotate(ang);
  L.g.drawImage(coneSprite(), 0, -len * 0.16, len, len * 0.32);
  L.g.restore();
  // fog density modulates the light: thicker fog scatters more (two fbm fields drifting differently)
  L.g.globalCompositeOperation = "destination-in";
  const T = mat("cloud"), ts = T.width;
  const pat = L.g.createPattern(T, "repeat");
  if (pat.setTransform && typeof DOMMatrix !== "undefined") pat.setTransform(new DOMMatrix([300 / ts, 0, 0, 110 / ts, -t * 14, -t * 3]));
  L.g.fillStyle = pat; L.g.fillRect(-200, -200, LW + 400, LH + 400);
  L.g.globalCompositeOperation = "lighter";
  L.g.globalAlpha = 0.35;
  L.g.save(); L.g.translate(x, y); L.g.rotate(ang); L.g.drawImage(coneSprite(), 0, -len * 0.16, len, len * 0.32); L.g.restore();
  L.g.globalAlpha = 1;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = "lighter";
  c.globalAlpha = clamp(I);
  c.drawImage(L.canvas, 0, 0, L.canvas.width, L.canvas.height, 0, 0, c.canvas.width, c.canvas.height);
  c.restore();
}
// fog lit by the torch round the Shadow (it stays black against it: a negative-space read)
function litFogPatch(c, t, x, y, w, I) {
  if (I <= 0.01) return;
  c.save();
  c.globalCompositeOperation = "lighter";
  c.globalAlpha = clamp(I);
  c.drawImage(mistPatch("#ffe8c8"), x - w / 2 + Math.sin(t * 0.3) * w * 0.05, y - w * 0.32, w, w * 0.42);
  glow(c, x, y - w * 0.15, w * 0.45, "#ffe2c0", 0.25 * I);
  c.restore();
}
function driveFigures(c, t, lt, o) {
  // Biscuit and, ahead, the Shadow, walking AWAY up the drive toward the manor
  const sB = o.s;
  const B = driveS(sB), sz = figSize(B.u);
  const S = driveS(sB + 40), ssz = figSize(S.u) * 1.9;
  const stop = o.stop || 0, lit = o.lit || 0;
  if (o.figA != null && o.figA <= 0.01) return;
  c.save();
  if (o.figA != null) c.globalAlpha *= o.figA;
  drivePrints(c, sB, sz, lit);
  // his long shadow, thrown up the drive by the torch: rooted at his paws, along the beam
  if (o.beamAng != null) castLong(c, B.x, B.y, o.beamAng, sz * 5.5, sz * 0.75, 0.8 * lit);
  // the fog right behind the Shadow glows: the moon is behind the house, it is against the light
  glow(c, S.x, S.y - ssz * 0.9, ssz * 2.6, "#5e5c80", 0.4, "screen");
  glow(c, S.x, S.y - ssz * 0.3, ssz * 1.6, "#7e7ea0", 0.24, "screen");
  litFogPatch(c, t, S.x, S.y - ssz * 0.3, ssz * 3.4, (o.beamFog || 0) * 0.55);
  K.shadowBlob(c, S.x, S.y, ssz * 0.5, ssz * 0.07, { alpha: 0.6 });
  shadowFigure(c, S.x, S.y, ssz, lt, S.q * 0.7 + 0.3, o.shadowA == null ? 1 : o.shadowA);
  groundMist(c, t, S.x, S.y + 2, ssz * 3.2, 61, 0.42, "#3c3e4c");
  if (o.spot) torchFootprint(c, o.spot.x, o.spot.y + 1, sz * 2.6, o.spot.I, t);
  // contact occlusion under him: a tight dark core at the paws inside a softer pool
  K.shadowBlob(c, B.x, B.y, sz * 0.62, sz * 0.12, { alpha: 0.6 });
  K.shadowBlob(c, B.x, B.y + 0.5, sz * 0.38, sz * 0.05, { alpha: 0.85 });
  c.save();
  c.translate(B.x, B.y);
  const xs = lerp(0.52, 0.86, stop);
  c.scale(xs, 1);
  const torch = { x: (TORCH.x - B.x) / xs, y: TORCH.y - B.y, color: "#fff0d6", strength: 1.6 * lit };
  const moonRel = { x: (MOON_D.x - B.x) / xs, y: MOON_D.y - B.y };
  const catOpts = (night) => ({
    pose: stop > 0.5 ? "stand" : "walk", phase: o.phase == null ? B.q : o.phase, facing: 1, t: lt, bell: false, collar: true,
    headTurn: lerp(-0.6, 0.95, stop), ears: lerp(0.45, -0.1, stop) + Math.sin(lt * 5) * 0.35 * stop, pupil: 1, tailUp: lerp(0.7, 0.4, stop),
    coat: night ? NIGHT_BISCUIT : K.COATS.biscuit,
    key: night ? { ...moonRel, color: "#383a50", strength: 0.08 } : torch,
    rim: { ...moonRel, color: "#dfe4f6", strength: night ? 1.9 : 1.25 },
    fill: FILLN, ambient: night ? "#0d0e14" : AMB, ambientK: night ? 0.55 : 0.22, backlit: night ? 0.85 : 0.4,
    castShadow: 0, ground: "#0a0a0e", shadow: false,
    eyesGlow: o.eyes || 0,
  });
  if (lit < 0.99) K.drawCat(c, 0, 0, sz, catOpts(true));
  if (lit > 0.01) { c.globalAlpha *= lit; K.drawCat(c, 0, 0, sz, catOpts(false)); }
  c.restore();
  // the tapetum flash: a hard specular point on each eye (the torch reflected straight back)
  if (o.eyes > 0.05 && o.eyePos) {
    for (const [ex, ey] of o.eyePos(B, sz)) {
      glow(c, ex, ey, sz * 0.09, "#e8ffc0", 0.8 * o.eyes);
      c.fillStyle = `rgba(255,255,250,${clamp(o.eyes * 1.2).toFixed(3)})`;
      c.beginPath(); c.arc(ex, ey, Math.max(0.5, sz * 0.018), 0, TAU); c.fill();
    }
  }
  groundMist(c, t, B.x, B.y - 1, sz * 4, 62, lerp(0.45, 0.2, lit), "#34363f");
  c.restore();
}
// long lens: the house is a long way behind the figures, so it is soft (painted, then blurred in bands)
const driveBG = softPlate("f05driveBG4", LW, LH, 2.0, [
  (f) => {
    f.drawImage(skySprite(), 0, 0, LW, LH);
    glow(f, MOON_D.x, MOON_D.y, 300, "#56548a", 0.18);
    moonDisc(f, MOON_D.x, MOON_D.y, 36);
    cloudDeck(f, 14, 40, 150, 35, 5, 0.6);
    K.fog(f, LW, LH, { y: 330, h: 80, color: "#4e4868", alpha: 0.6, wisps: false });
  },
  (f) => { f.drawImage(manorSprite(), MANOR_X, MANOR_Y, MW * 0.9, MH * 0.9); },
  (f) => { f.drawImage(hillSprite(), 0, 0, LW, LH); },
], 4);
function driveScene(c, t, lt, o) {
  c.drawImage(o.bg || driveBG(), 0, 0, LW, LH);
  candles(c, t, 1.3);
  if (o.door) doorCrack(c, t, o.door, o.doorSoft || 0);
  mist(c, t, 352, 90, 21, 0.45, "#4a4662", false, 1.2);
  if (o.beam) o.beam(c);
  if (o.figures !== false) driveFigures(c, t, lt, o);
  mist(c, t, 445, 90, 22, 0.4, FOG_MID, false, 2);
  mist(c, t, 480, 160, 23, 0.48, FOG_NEAR, true, 2);
}
// foreground bars, far out of focus (we look between two of them): each a soft dark column with a
// gradient edge (the blur), the moon side carrying a soft cold rim
function barsForeground(f, xs, w, rail) {
  for (const x of xs) {
    const gr = f.createLinearGradient(x - w, 0, x + w, 0);
    gr.addColorStop(0, "rgba(3,3,5,0)"); gr.addColorStop(0.3, "rgba(3,3,5,0.92)"); gr.addColorStop(0.7, "rgba(3,3,5,0.92)"); gr.addColorStop(1, "rgba(3,3,5,0)");
    f.fillStyle = gr; f.fillRect(x - w, -20, w * 2, LH + 40);
    const rg = f.createLinearGradient(x + w * 0.2, 0, x + w * 1.1, 0);
    rg.addColorStop(0, "rgba(160,166,200,0)"); rg.addColorStop(0.55, "rgba(160,166,200,0.12)"); rg.addColorStop(1, "rgba(160,166,200,0)");
    f.fillStyle = rg; f.fillRect(x + w * 0.2, -20, w, LH + 40);
  }
  if (rail) {
    const hg = f.createLinearGradient(0, rail - 22, 0, rail + 22);
    hg.addColorStop(0, "rgba(3,3,5,0)"); hg.addColorStop(0.35, "rgba(3,3,5,0.9)"); hg.addColorStop(0.65, "rgba(3,3,5,0.9)"); hg.addColorStop(1, "rgba(3,3,5,0)");
    f.fillStyle = hg; f.fillRect(-20, rail - 22, LW + 40, 44);
  }
}
const barsS3 = () => SPR("f05barsS3b", LW + 40, LH, (s) => { s.translate(20, 0); barsForeground(s, [150, 330, 640, 820], 24, 128); });
const barsS4 = () => SPR("f05barsS4b", LW + 40, LH, (s) => { s.translate(20, 0); barsForeground(s, [80, 880], 28, 0); });
// handheld long lens: the near bars move more than the far drive (parallax of the same shake)
function handheld(t, amt, seed = 0) { return [(K.noise(t * 1.3, 11 + seed) * 0.7 + K.noise(t * 4.1, 12 + seed) * 0.3) * amt, (K.noise(t * 1.1, 13 + seed) * 0.7 + K.noise(t * 3.7, 14 + seed) * 0.3) * amt]; }
const S_SHOT3 = [118, 196], S_SHOT4 = [196, 214];
function shotThroughBars(g, t, lt) {
  const p = eio(seg(lt, 0, 10));
  const s = lerp(S_SHOT3[0], S_SHOT3[1], seg(lt, 0, 10));
  K.withCamera(g, LW, LH, { x: lerp(476, 484, p), y: lerp(330, 312, p), zoom: lerp(1.35, 1.48, p), shakeT: t, shakeAmt: 1.6 }, (c) => {
    driveScene(c, t, lt, { s, figA: smooth(seg(lt, 0.3, 1.8)) });
  });
  const [hx, hy] = handheld(t, 2.4);
  g.drawImage(barsS3(), -20 + hx, hy, LW + 40, LH);
}
// where his eyes are (screen) when he turns to the torch (calibrated against the cat painter's head)
const eyePos = (B, sz) => { const hx = B.x + sz * 0.5, hy = B.y - sz * 1.12; return [[hx - sz * 0.07, hy], [hx + sz * 0.08, hy + sz * 0.005]]; };
function shotFlashlight(g, t, lt) {
  const sweep = eio(seg(lt, 0, 0.9));
  const off = lerp(-0.2, 0, sweep) - 0.012 * Math.sin(lt * 1.3) * sweep;
  const hit = clamp(1 - Math.max(0, Math.abs(off) - 0.02) / 0.07);
  const stop = eio(seg(lt, 1.0, 3.4));
  const s = lerp(S_SHOT4[0], S_SHOT4[1], eio(seg(lt, 0, 3.0)));
  const B = driveS(s), sz = figSize(B.u);
  const eyes = K.env(lt, 1.5, 7.6, 0.12, 1.7) * (0.8 + 0.2 * Math.sin(lt * 3)) * stop;
  const zoom = lerp(1.95, 2.3, eio(seg(lt, 0, 8)));
  const ax = B.x + sz * 0.2 - TORCH.x, ay = B.y - TORCH.y, cs = Math.cos(off), sn = Math.sin(off);
  const spot = { x: TORCH.x + ax * cs - ay * sn, y: TORCH.y + ax * sn + ay * cs, I: 0.95 };
  const tx = B.x, ty = B.y - 10;
  const ang = Math.atan2(ty - TORCH.y, tx - TORCH.x) + off;
  const bl = Math.hypot(tx - TORCH.x, ty - TORCH.y) + 60;
  // how much of the beam's cone reaches the fog round the Shadow
  const S = driveS(s + 40), sAng = Math.atan2(S.y - 20 - TORCH.y, S.x - TORCH.x);
  const beamFog = clamp(1 - Math.abs(sAng - ang) / 0.22) * hit;
  K.withCamera(g, LW, LH, { x: B.x + 14, y: B.y - lerp(52, 40, eio(seg(lt, 0, 8))), zoom, shakeT: t, shakeAmt: 0.35 + (1 - sweep) * 1.2 }, (c) => {
    driveScene(c, t, lt, {
      s, stop, eyes, lit: hit, spot, beamAng: ang, beamFog, eyePos,
      // the beam's volume sits in the fog before the figures: they are not veiled by it
      beam: (cc) => {
        K.volumetricBeam(cc, TORCH.x, TORCH.y, ang, bl * 1.3, 0.24, { color: "#fff0d8", intensity: 0.4, t: lt, width0: 10 });
        torchShafts(cc, TORCH.x, TORCH.y, ang, bl * 1.3, 0.32, lt);
        K.flashlightBeam(cc, TORCH.x, TORCH.y, ang, bl, { spread: 0.16, alpha: 0.1, t: lt, dust: true, source: false });
      },
    });
  });
  const [hx, hy] = handheld(t, 1.2 + (1 - sweep) * 2, 3);
  g.drawImage(barsS4(), -20 + hx, hy, LW + 40, LH);
}

// ---- shot 5: over your shoulder, pushing the gate open -----------------------------------------------
const PG = { camX: 480, camY: 280, eye: 300, f: 950 };
// the drive behind the gate, further out of focus still (we focus on the gate and the hand)
const pushBG = softPlate("f05pushBG4", LW, LH, 3.2, [(f) => f.drawImage(driveBG(), 0, 0, LW, LH)], 3);
// where a point of a swung leaf lands (the same projection drawLeaf uses)
function leafPoint(hx, by, sc, dir, theta, eyeY, u, yLeaf, camX = 480, f = 950) {
  const Lw = LEAF_W * sc, z = u * Lw * Math.sin(theta), s = f / (f + z);
  return [camX + (hx + dir * u * Lw * Math.cos(theta) - camX) * s, eyeY + (by + (yLeaf - LEAF_B) * sc - eyeY) * s, s];
}
// you, over the shoulder, hood down: the back of the head (hair as a soft volume of strands), the
// bunched hood and the shoulders of the (moonlit, so nearly colourless) yellow hoodie. The moon is
// beyond the gate, up and to the left: rim light only on the edges that face it, its width following
// the angle (wide on the top and the moon side, nothing underneath), softened; flyaway hairs lit.
const OTS_W = 470, OTS_H = 540, OTS_HX = 210, OTS_HY = 150;
const MOON_DIR = (() => { const x = -0.92, y = -0.4, l = Math.hypot(x, y); return [x / l, y / l]; })();
const HOODIE = "#2c2a1e", HOODIE_LIT = "#4a4632", HAIR = "#1a130e";
MATS.folds = { n: 128, fn: (u, v, out) => {
  const a = fbm(u * 2, v * 9, 161, 4, 2, 9), b = fbm(u * 5, v * 3, 163, 3, 5, 3);
  const val = 128 + a * 70 + b * 30;
  out[0] = out[1] = out[2] = val;
} };
function headPath() {
  const p = new Path2D(), N = 120;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    const r = 1 + 0.035 * Math.sin(a * 3 + 1) + 0.025 * K.texNoise(i * 0.35, 2.7, 17) + (Math.sin(a) < 0 ? 0.04 * -Math.sin(a) : 0);
    const x = OTS_HX + Math.cos(a) * 86 * r, y = OTS_HY + 6 + Math.sin(a) * 102 * r;
    i ? p.lineTo(x, y) : p.moveTo(x, y);
  }
  p.closePath();
  return p;
}
function bodyPath() {
  const p = new Path2D();
  p.moveTo(-10, OTS_HY + 250);
  p.bezierCurveTo(20, OTS_HY + 196, 70, OTS_HY + 150, 128, OTS_HY + 132);
  p.bezierCurveTo(150, OTS_HY + 118, 170, OTS_HY + 92, OTS_HX, OTS_HY + 92);
  p.bezierCurveTo(260, OTS_HY + 92, 290, OTS_HY + 110, 320, OTS_HY + 124);
  p.bezierCurveTo(380, OTS_HY + 140, 440, OTS_HY + 150, OTS_W + 10, OTS_HY + 170);
  p.lineTo(OTS_W + 10, OTS_H + 10); p.lineTo(-10, OTS_H + 10); p.closePath();
  return p;
}
// an angle-dependent rim: the silhouette minus itself pushed away from the moon by w px, blurred
function rimOf(s, path, w, blur, color, alpha) {
  const ps = K.pixelScale(), R = scratch(OTS_W, OTS_H);
  R.g.fillStyle = "#fff"; R.g.fill(path);
  R.g.globalCompositeOperation = "destination-out";
  R.g.translate(-MOON_DIR[0] * w, -MOON_DIR[1] * w); R.g.fill(path);
  R.g.setTransform(1, 0, 0, 1, 0, 0);
  R.g.globalCompositeOperation = "source-in";
  R.g.fillStyle = color; R.g.fillRect(0, 0, R.c.width, R.c.height);
  s.save();
  s.globalCompositeOperation = "lighter";
  s.globalAlpha = alpha;
  if (K.hasFilter() && blur > 0) s.filter = `blur(${K.qblur((blur * ps).toFixed(1))}px)`;
  s.drawImage(R.c, 0, 0, OTS_W, OTS_H);
  s.restore();
}
const otsSprite = staged("f05ots2", OTS_W, OTS_H, () => [
  (s) => { // shoulders and back: a soft cloth volume, folds from fbm, the bunched hood round the neck
    const body = bodyPath();
    s.fillStyle = HOODIE; s.fill(body);
    s.save(); s.clip(body);
    const vol = s.createRadialGradient(OTS_HX - 60, OTS_HY + 120, 20, OTS_HX, OTS_HY + 260, 330);
    vol.addColorStop(0, rgba(HOODIE_LIT, 0.9)); vol.addColorStop(0.45, rgba(HOODIE, 0)); vol.addColorStop(1, "rgba(0,0,0,0.6)");
    s.fillStyle = vol; s.fillRect(0, 0, OTS_W, OTS_H);
    matRect(s, mat("folds"), 0, 0, OTS_W, OTS_H, { scale: 160, scaleY: 420, rot: -0.5, mode: "overlay", alpha: 0.9 });
    matRect(s, mat("folds"), 0, 0, OTS_W, OTS_H, { scale: 60, scaleY: 160, rot: 0.3, ox: 30, mode: "overlay", alpha: 0.45 });
    // the hood bunched behind the neck: a thick roll of cloth, its upper face lit, a deep crease under
    const roll = new Path2D(); roll.ellipse(OTS_HX + 8, OTS_HY + 118, 128, 40, 0.06, 0, TAU);
    const rg = s.createRadialGradient(OTS_HX - 30, OTS_HY + 96, 6, OTS_HX + 8, OTS_HY + 122, 140);
    rg.addColorStop(0, rgba(HOODIE_LIT, 1)); rg.addColorStop(0.5, HOODIE); rg.addColorStop(1, "#141209");
    s.fillStyle = rg; s.fill(roll);
    s.save(); s.clip(roll); matRect(s, mat("folds"), 0, 0, OTS_W, OTS_H, { scale: 70, scaleY: 40, rot: 1.3, mode: "overlay", alpha: 0.9 }); s.restore();
    const cr = s.createLinearGradient(0, OTS_HY + 140, 0, OTS_HY + 176);
    cr.addColorStop(0, "rgba(0,0,0,0.7)"); cr.addColorStop(1, "rgba(0,0,0,0)");
    s.fillStyle = cr; s.fillRect(0, OTS_HY + 140, OTS_W, 36);
    // the back faces away from the moon: darkest low and right (toward the lens)
    const fg = s.createLinearGradient(0, OTS_HY + 60, OTS_W * 0.45, OTS_H);
    fg.addColorStop(0, "rgba(0,0,0,0)"); fg.addColorStop(1, "rgba(0,0,0,0.6)");
    s.fillStyle = fg; s.fillRect(0, 0, OTS_W, OTS_H);
    s.restore();
  },
  (s) => { // the back of the head: hair as a soft volume, then strands flowing from the crown whorl
    const hp = headPath();
    // the neck's shadow side shows under the hairline
    s.fillStyle = "#1a1210"; s.beginPath(); s.ellipse(OTS_HX + 4, OTS_HY + 100, 46, 30, 0, 0, TAU); s.fill();
    s.fillStyle = HAIR; s.fill(hp);
    s.save(); s.clip(hp);
    const vg = s.createRadialGradient(OTS_HX - 40, OTS_HY - 50, 6, OTS_HX + 10, OTS_HY + 20, 130);
    vg.addColorStop(0, "#4e3a2c"); vg.addColorStop(0.45, "#2a1e15"); vg.addColorStop(1, "#0c0806");
    s.fillStyle = vg; s.fill(hp);
    const R = K.rng("f05hair");
    const wx = OTS_HX + 10, wy = OTS_HY - 86; // the crown whorl
    s.lineCap = "round";
    for (let i = 0; i < 360; i++) {
      const a = R() * TAU, r0 = R() * 10, len = 40 + R() * 120;
      const sx = wx + Math.cos(a) * r0, sy = wy + Math.sin(a) * r0 * 0.7;
      const dirx = Math.cos(a) * 0.85, diry = Math.sin(a) * 0.55 + 0.5;
      const clump = K.texFbm(a * 2.2, 0.3, 19, 3) * 0.5 + 0.5;
      const ex = sx + dirx * len, ey = sy + diry * len;
      const lit = Math.max(0, -(dirx * MOON_DIR[0] + (diry - 0.6) * MOON_DIR[1]));
      s.strokeStyle = `rgba(${Math.round(70 + 60 * clump + 50 * lit)},${Math.round(52 + 44 * clump + 40 * lit)},${Math.round(38 + 30 * clump + 34 * lit)},${(0.13 + 0.2 * clump).toFixed(3)})`;
      s.lineWidth = 0.5 + R() * 0.9;
      s.beginPath(); s.moveTo(sx, sy); s.quadraticCurveTo(sx + dirx * len * 0.5 + (R() - 0.5) * 18, sy + diry * len * 0.45, ex, ey); s.stroke();
    }
    // clumps cast tiny shadows: darker streaks between the strand groups
    for (let i = 0; i < 60; i++) {
      const a = R() * TAU, len = 60 + R() * 90, dirx = Math.cos(a) * 0.7, diry = Math.sin(a) * 0.4 + 0.75;
      s.strokeStyle = "rgba(0,0,0,0.25)"; s.lineWidth = 1.5 + R() * 2;
      s.beginPath(); s.moveTo(wx, wy); s.quadraticCurveTo(wx + dirx * len * 0.5, wy + diry * len * 0.45, wx + dirx * len, wy + diry * len); s.stroke();
    }
    // the head turns from the moon: occlusion low and right, the nape darker
    const og = s.createLinearGradient(OTS_HX - 80, OTS_HY - 90, OTS_HX + 90, OTS_HY + 110);
    og.addColorStop(0, "rgba(0,0,0,0)"); og.addColorStop(0.55, "rgba(0,0,0,0.25)"); og.addColorStop(1, "rgba(0,0,0,0.7)");
    s.fillStyle = og; s.fill(hp);
    s.restore();
    // the left ear just shows past the hair: its rim catches the moon, a little warmth through it
    const ear = new Path2D(); ear.ellipse(OTS_HX - 84, OTS_HY + 26, 9, 18, 0.25, 0, TAU);
    s.save(); s.globalCompositeOperation = "destination-over";
    s.fillStyle = "rgba(150,80,60,0.25)"; s.fill(ear);
    s.fillStyle = "#2a1a14"; s.fill(ear);
    s.restore();
  },
  (s) => { // the rims: a wide soft scatter, then the tight bright edge, both following the angle
    const both = new Path2D(); both.addPath(headPath()); both.addPath(bodyPath());
    rimOf(s, both, 9, 4, "#9aa2c0", 0.22);
    rimOf(s, bodyPath(), 3.2, 1.2, "#d8def2", 0.55);
    rimOf(s, headPath(), 3.6, 1.4, "#e0e4f4", 0.6);
    rimOf(s, new Path2D("M " + (OTS_HX - 92) + " " + (OTS_HY + 26) + " a 9 18 0.25 1 0 0.1 0"), 2, 1, "#f0d0c0", 0.4);
  },
  (s) => { // flyaway hairs standing off the silhouette on the moon side, lit
    const R = K.rng("f05fly");
    s.lineCap = "round";
    s.globalCompositeOperation = "lighter";
    for (let i = 0; i < 90; i++) {
      const a = Math.PI * (0.95 + R() * 0.75), rr = 1.0;
      const x0 = OTS_HX + Math.cos(a) * 86 * rr, y0 = OTS_HY + 6 + Math.sin(a) * 102 * rr;
      const nx = Math.cos(a), ny = Math.sin(a), f = Math.max(0, nx * MOON_DIR[0] + ny * MOON_DIR[1]);
      if (f < 0.15) continue;
      const len = 4 + R() * 14, bend = (R() - 0.5) * 10;
      s.strokeStyle = `rgba(214,218,236,${(0.15 + 0.4 * f * R()).toFixed(3)})`; s.lineWidth = 0.5;
      s.beginPath(); s.moveTo(x0 - nx * 3, y0 - ny * 3); s.quadraticCurveTo(x0 + nx * len * 0.5 + bend, y0 + ny * len * 0.5, x0 + nx * len + bend * 0.5, y0 + ny * len + 4); s.stroke();
    }
  },
]);
// the reaching arm: a sleeve (tube) shaded as a cylinder turned from the moon, its folds from the fbm
// fold raster laid along the arm, bunching at the elbow and the cuff; the rim along its upper contour
// is as wide as that edge faces the moon. Then a ribbed cuff and the bare hand round the bar.
function sleeveArm(g, sx, sy, hx, hy, t) {
  const dx = hx - sx, dy = hy - sy, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const sag = L * 0.12;
  const ex = sx + dx * 0.5, ey = sy + dy * 0.5 + sag;
  const wx = hx + 20, wy = hy + 6;
  const line = [[sx, sy, 34], [lerp(sx, ex, 0.5), lerp(sy, ey, 0.5), 29], [ex - ux * 8, ey - uy * 8, 28], [ex, ey + 1, 30], [ex + ux * 8, ey + uy * 8, 27], [lerp(ex, wx, 0.55), lerp(ey, wy, 0.55), 22], [wx - ux * 14, wy - uy * 14, 21], [wx - ux * 6, wy - uy * 6, 21], [wx - ux, wy - uy, 19]];
  const up = [], dn = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const w = line[i][2] * (1 + 0.04 * K.noise(i * 1.7 + 3, 2));
    up.push(line[i][0] + ty * w, line[i][1] - tx * w);
    dn.push(line[i][0] - ty * w, line[i][1] + tx * w);
  }
  const arm = new Path2D();
  arm.moveTo(up[0], up[1]);
  for (let i = 2; i < up.length; i += 2) arm.lineTo(up[i], up[i + 1]);
  for (let i = dn.length - 2; i >= 0; i -= 2) arm.lineTo(dn[i], dn[i + 1]);
  arm.closePath();
  g.save();
  g.fillStyle = HOODIE; g.fill(arm);
  g.clip(arm);
  // folds along the sleeve (the raster turned to the arm's direction)
  const ang = Math.atan2(dy, dx);
  const T = mat("folds"), ts = T.width, pat = g.createPattern(T, "repeat");
  if (pat.setTransform && typeof DOMMatrix !== "undefined") { const c = Math.cos(ang + Math.PI / 2), sN = Math.sin(ang + Math.PI / 2), k1 = 70 / ts, k2 = 260 / ts; pat.setTransform(new DOMMatrix([c * k1, sN * k1, -sN * k2, c * k2, sx, sy])); }
  g.globalCompositeOperation = "overlay"; g.globalAlpha = 0.6; g.fillStyle = pat; g.fill(arm); g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  // cylinder shading: the lower half of the sleeve turns from the moon (core shadow), the top lit
  g.lineCap = "round"; g.lineJoin = "round";
  const cl = (off, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); for (let i = 0; i < line.length; i++) { const x = (up[i * 2] + dn[i * 2]) / 2 + (dn[i * 2] - up[i * 2]) * off, y = (up[i * 2 + 1] + dn[i * 2 + 1]) / 2 + (dn[i * 2 + 1] - up[i * 2 + 1]) * off; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); };
  cl(0.3, 30, "rgba(0,0,0,0.42)");
  cl(-0.3, 12, rgba(HOODIE_LIT, 0.16));
  // bunching rings at the elbow and the cuff (soft: a dark valley beside a faint ridge)
  for (const [k, w, a] of [[0.36, 9, 0.16], [0.5, 12, 0.2], [0.62, 8, 0.14], [0.86, 7, 0.2], [0.93, 5, 0.18]]) {
    const cx = lerp(sx, wx, k), cy = lerp(sy, wy, k) + Math.sin(k * Math.PI) * sag, nx = -uy, ny = ux;
    g.strokeStyle = `rgba(0,0,0,${a})`; g.lineWidth = w;
    g.beginPath(); g.moveTo(cx + nx * 40 - ux * 6, cy + ny * 40 - uy * 6); g.quadraticCurveTo(cx + ux * 5, cy + uy * 5, cx - nx * 40 - ux * 4, cy - ny * 40 - uy * 4); g.stroke();
    g.strokeStyle = rgba(HOODIE_LIT, 0.12); g.lineWidth = 4;
    g.beginPath(); g.moveTo(cx + nx * 40 + ux * 5, cy + ny * 40 + uy * 5); g.quadraticCurveTo(cx + ux * 12, cy + uy * 12, cx - nx * 40 + ux * 6, cy - ny * 40 + uy * 6); g.stroke();
  }
  g.restore();
  // rim along the upper contour: per segment, as wide and as bright as the edge faces the moon
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  for (let i = 0; i < up.length - 2; i += 2) {
    const ax = up[i], ay = up[i + 1], bx = up[i + 2], by = up[i + 3];
    const tx = bx - ax, ty = by - ay, l = Math.hypot(tx, ty) || 1, nx = ty / l, ny = -tx / l;
    const f = Math.max(0, nx * MOON_DIR[0] + ny * MOON_DIR[1]);
    if (f < 0.05) continue;
    for (const [w, a] of [[5 * f, 0.1], [1.6 * f + 0.4, 0.45]]) {
      g.strokeStyle = `rgba(216,222,242,${(a * f).toFixed(3)})`; g.lineWidth = w;
      g.beginPath(); g.moveTo(ax - nx * w * 0.4, ay - ny * w * 0.4); g.lineTo(bx - nx * w * 0.4, by - ny * w * 0.4); g.stroke();
    }
  }
  g.restore();
  // the ribbed cuff at the wrist
  g.save();
  g.translate(wx + 4, wy); g.rotate(ang);
  const cuff = new Path2D(); K.roundRect(cuff, -8, -19, 14, 38, 6);
  const cg = g.createLinearGradient(0, -19, 0, 19);
  cg.addColorStop(0, rgba(HOODIE_LIT, 0.75)); cg.addColorStop(0.35, HOODIE); cg.addColorStop(1, "#0c0b06");
  g.fillStyle = cg; g.fill(cuff);
  g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 0.8;
  for (let k = -6; k <= 4; k += 2.2) { g.beginPath(); g.moveTo(k, -18); g.lineTo(k, 18); g.stroke(); }
  g.globalCompositeOperation = "lighter";
  g.strokeStyle = "rgba(210,216,236,0.35)"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(-7, -18.5); g.lineTo(5, -18.5); g.stroke();
  g.restore();
  // the bell on its red cord round the wrist
  g.strokeStyle = "#4a1414"; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(wx - 2, wy + 15); g.quadraticCurveTo(wx + 3, wy + 22, wx + 8, wy + 16); g.stroke();
  K.drawBell(g, wx + 4, wy + 25, 7, { t, glint: 0.25 });
}
// the bare hand round a vertical bar at (hx, hy): back of the hand toward us (in shadow, warm skin),
// four fingers curled over the front of the bar with knuckles, a thumb from below; the moon catches the
// top edges; occlusion and a contact shadow where the grip presses the iron
function gripHand(g, hx, hy, barW) {
  const SK = "#3a2820", SK_D = "#1c120e", SK_L = "#6a4c3c";
  g.save();
  // occlusion on the bar just above and below the fist, and the fist's shadow on it
  const ao = g.createLinearGradient(0, hy - 34, 0, hy + 34);
  ao.addColorStop(0, "rgba(0,0,0,0)"); ao.addColorStop(0.3, "rgba(0,0,0,0.7)"); ao.addColorStop(0.7, "rgba(0,0,0,0.7)"); ao.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = ao; g.fillRect(hx - barW, hy - 34, barW * 2, 68);
  glow(g, hx + 4, hy + 6, 30, "#000000", 0.55, "source-over");
  // back of the hand: a rounded volume, lit from the upper left
  const back = new Path2D(); back.ellipse(hx + 15, hy + 3, 15, 19, -0.2, 0, TAU);
  const bg = g.createRadialGradient(hx + 8, hy - 8, 1, hx + 16, hy + 6, 22);
  bg.addColorStop(0, SK_L); bg.addColorStop(0.5, SK); bg.addColorStop(1, SK_D);
  g.fillStyle = bg; g.fill(back);
  // tendons: faint ridges toward the knuckles
  g.strokeStyle = "rgba(255,210,180,0.06)"; g.lineWidth = 1.4;
  for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(hx + 22, hy + 14 - k * 2); g.lineTo(hx + 5, hy - 12 + k * 8.5); g.stroke(); }
  // fingers: four curled segments over the bar, each a rounded capsule with a lit top, dark gaps
  for (let f = 0; f < 4; f++) {
    const fy = hy - 14 + f * 8.4, fl = 16 - Math.abs(f - 1.2) * 2;
    const fp = new Path2D(); K.roundRect(fp, hx - fl * 0.55, fy, fl + 7, 7.8, 3.9);
    const fg = g.createLinearGradient(0, fy, 0, fy + 7.8);
    fg.addColorStop(0, SK_L); fg.addColorStop(0.45, SK); fg.addColorStop(1, SK_D);
    g.fillStyle = fg; g.fill(fp);
    // the knuckle: a small rounded bump where the finger turns over the bar
    const kx = hx + 4, ky = fy + 3.6;
    const kg = g.createRadialGradient(kx - 1, ky - 1.5, 0, kx, ky, 4.5);
    kg.addColorStop(0, "rgba(140,104,84,0.6)"); kg.addColorStop(1, "rgba(140,104,84,0)");
    g.fillStyle = kg; g.beginPath(); g.arc(kx, ky, 4.5, 0, TAU); g.fill();
    // the crease between this finger and the next
    g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(hx - fl * 0.5, fy + 7.3, fl + 6, 1.1);
    // the fingertip disappears round the far side of the bar: occluded
    const tg = g.createLinearGradient(hx - fl * 0.55, 0, hx - fl * 0.55 + 6, 0);
    tg.addColorStop(0, "rgba(0,0,0,0.65)"); tg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = tg; g.fill(fp);
  }
  // the thumb wraps from below
  const th = new Path2D(); th.ellipse(hx + 5, hy + 22, 10, 5.6, 0.45, 0, TAU);
  const tg2 = g.createLinearGradient(0, hy + 16, 0, hy + 28);
  tg2.addColorStop(0, SK_L); tg2.addColorStop(1, SK_D);
  g.fillStyle = tg2; g.fill(th);
  // the moon catches the top edges (index finger, knuckle line, the top of the hand): soft
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  g.strokeStyle = "rgba(226,214,206,0.12)"; g.lineWidth = 3.5;
  g.beginPath(); g.moveTo(hx - 6, hy - 14.2); g.lineTo(hx + 10, hy - 14.6); g.quadraticCurveTo(hx + 18, hy - 15.5, hx + 24, hy - 9); g.stroke();
  g.strokeStyle = "rgba(236,226,220,0.55)"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(hx - 5, hy - 14); g.lineTo(hx + 10, hy - 14.4); g.quadraticCurveTo(hx + 18, hy - 15.2, hx + 23.5, hy - 9.4); g.stroke();
  g.restore();
}
function shotPushGate(g, t, lt) {
  const theta = eio(seg(lt, 1.0, 6.0)) * 0.7;
  const p = eio(seg(lt, 0, 10));
  const z = lerp(1.0, 1.08, p);
  const [hx0, hy0] = handheld(t, 1.5, 7);
  const toScreen = (x, y) => [(x - PG.camX) * z + LW / 2 + hx0, (y - PG.camY) * z + LH / 2 + hy0];
  // the moonlit streak slides along the turning leaf (from its free edge toward the hinge)
  const uSpec = lerp(1.05, 0.25, theta / 0.7);
  const streak = (u) => 0.06 + 0.32 * Math.exp(-Math.pow((u - uSpec) / 0.14, 2));
  K.withCamera(g, LW, LH, { x: PG.camX - hx0 / z, y: PG.camY - hy0 / z, zoom: z }, (c) => {
    driveScene(c, t, lt, { figures: false, door: K.env(lt, 3, 20, 2, 0.1), doorSoft: 1, bg: pushBG() });
    mist(c, t + theta * 20, 470 + theta * 30, 200, 31, 0.38 + 0.25 * theta, "#3a3c4a", true, 2.4);
    gatepost(c, 120, 590, 110, 520);
    gatepost(c, 850, 590, 110, 520);
    groundAO(c, 120, 592, 100, 14, 0.7);
    groundAO(c, 850, 592, 100, 14, 0.7);
    drawLeaf(c, 795, 570, 0.98, -1, 0, PG.eye, () => 0.12);
    drawLeaf(c, 175, 570, 0.98, 1, theta, PG.eye, streak, PG.camX, PG.f);
    mist(c, t, 560, 90, 33, 0.42, "#30323c", false, 3);
  });
  // you, from behind, reaching LEFT to a bar of the moving leaf; the weight goes in before the gate
  // gives (the whole figure leans), breathing under it
  const lean = eio(seg(lt, 0.4, 5.5)) * -46 + Math.sin(lt * 1.7) * 2 * (1 - seg(lt, 0, 6));
  const br = Math.sin(lt * 1.6) * 1.5;
  const u8 = leafX(8) / LEAF_W;
  const [bwx, bwy, bs] = leafPoint(175, 570, 0.98, 1, theta, PG.eye, u8, LEAF_B - LEAF_BH * 0.52, PG.camX, PG.f);
  const [hxT, hyT] = toScreen(bwx, bwy);
  const ox = 770 + lean + hx0 * 1.6, oy = 252 + eio(seg(lt, 0.4, 2)) * 8 + br + hy0 * 1.6;
  const shX = ox - OTS_HX + 84, shY = oy - OTS_HY + 170;
  sleeveArm(g, shX, shY, hxT, hyT, lt);
  gripHand(g, hxT, hyT, 5 * 0.98 * bs * z);
  g.drawImage(otsSprite(), ox - OTS_HX, oy - OTS_HY, OTS_W, OTS_H);
}

// ---- shot 6: the gargoyle and its moss moustache ---------------------------------------------------
const gargBG = softPlate("f05gargBG4", LW, LH, 7, [(f) => {
  f.drawImage(driveBG(), -120, -60, LW * 1.25, LH * 1.25);
  f.globalCompositeOperation = "multiply";
  f.fillStyle = "#62627a"; f.fillRect(0, 0, LW, LH);
  f.globalCompositeOperation = "source-over";
}], 4);
// fine grain over the blurred plate (after the blur, so it stays sharp and breaks the banding)
const gargBGd = staged("f05gargBGd", LW, LH, () => [(s) => { s.drawImage(gargBG(), 0, 0, LW, LH); matRect(s, gravelTex(), 0, 0, LW, LH, { scale: 90, mode: "overlay", alpha: 0.12 }); }]);
function paintCapstone(s) {
  // the top of the gatepost, close: a stone slab with chipped arris, moss in the joints, occlusion
  const slab = new Path2D(); slab.rect(270, 384, 420, 34);
  const face = new Path2D(); face.rect(290, 418, 380, 200);
  s.fillStyle = "#36363e"; s.fill(face);
  masonry(s, face, { scale: 220, _x: 290, _y: 418, seed: 12, tint: "#26262e", tintAlpha: 0.7, lichen: 0.25 });
  s.save(); s.clip(face);
  const fg = s.createLinearGradient(0, 410, 0, 560);
  fg.addColorStop(0, "rgba(0,0,0,0.7)"); fg.addColorStop(0.25, "rgba(0,0,0,0.2)"); fg.addColorStop(1, "rgba(0,0,0,0.45)");
  s.fillStyle = fg; s.fillRect(290, 410, 380, 200);
  s.restore();
  s.fillStyle = "#48484e"; s.fill(slab);
  matFill(s, stoneTex(), slab, { scale: 160, _x: 270, _y: 384 });
  matFill(s, mat("stoneN"), slab, { scale: 90, _x: 270, _y: 384, mode: "overlay", alpha: 0.6 });
  s.save(); s.globalCompositeOperation = "multiply"; s.fillStyle = rgba(NIGHT, 0.5); s.fill(slab); s.restore();
  const ch = s.createLinearGradient(0, 384, 0, 392);
  ch.addColorStop(0, "rgba(160,162,196,0.26)"); ch.addColorStop(1, "rgba(160,162,196,0)");
  s.fillStyle = ch; s.fillRect(270, 384, 420, 8);
  s.fillStyle = "rgba(0,0,0,0.32)"; s.fillRect(270, 394, 420, 24);
  K.aoEdge(s, 290, 418, 670, 418, { width: 26, alpha: 0.8, side: -1 });
  s.save(); s.globalCompositeOperation = "destination-out";
  s.beginPath(); s.moveTo(270, 384); s.lineTo(279, 384); s.lineTo(270, 395); s.fill();
  s.beginPath(); s.moveTo(690, 384); s.lineTo(683, 384); s.lineTo(690, 391); s.fill();
  s.restore();
  const R = K.rng("f05cap");
  for (let i = 0; i < 26; i++) {
    const x = 272 + R() * 416, y = 384 + R() * 6;
    s.fillStyle = rgba(mix("#121a0c", "#30441c", R()), 0.45);
    s.beginPath(); s.ellipse(x, y, 4 + R() * 10, 1.5 + R() * 2.5, 0, 0, TAU); s.fill();
  }
}
const capSprite = () => SPR("f05cap4", LW, LH, paintCapstone);
// the statue as a flat silhouette (its hard shadow on the cap while the lightning lasts)
const gargSil = staged("f05gargSil", 520, 440, () => [(s) => { s.drawImage(gargoyle(false), 0, 0, 520, 440); s.globalCompositeOperation = "source-in"; s.fillStyle = "#000"; s.fillRect(0, 0, 520, 440); }]);
// the thunder: a stroke at the cut, decaying fast, with a weaker re-strike
const gargFlash = (lt) => (lt < 0 ? 0 : Math.exp(-lt * 6) + (lt > 0.36 ? 0.55 * Math.exp(-(lt - 0.36) * 9) : 0));
function shotGargoyle(g, t, lt) {
  const F = clamp(gargFlash(lt));
  const moon = clamp(seg(lt, 0.9, 2.6));
  const p = eio(seg(lt, 0, 8));
  K.withCamera(g, LW, LH, { x: lerp(548, 526, p), y: lerp(262, 250, p), zoom: lerp(1.04, 1.14, p), shakeT: t, shakeAmt: 0.25 + F * 2 }, (c) => {
    c.drawImage(gargBGd(), -60, -40, LW + 120, LH + 80);
    if (F > 0.01) glow(c, 880, 120, 560, "#a8acd8", 0.45 * F);
    bolt(c, 860, 20, 905, 300, 9, F > 0.25 ? F : 0);
    c.drawImage(capSprite(), 0, 0, LW, LH);
    // the flash lights the cap's top and its face (cool, from the upper right)
    if (F > 0.01) {
      c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = 0.5 * F;
      c.drawImage(capSprite(), 0, 0, LW, LH);
      c.restore();
    }
    K.shadowBlob(c, 480, 392, 90, 6, { alpha: 0.8 });
    const gx = 480 - 260, gy = 392 - 420;
    // hard cast shadow of the wings and body on the cap top (the bolt is high and to the right)
    if (F > 0.05) {
      c.save();
      c.beginPath(); c.rect(270, 384, 420, 46); c.clip();
      c.globalAlpha = 0.85 * clamp(F * 1.4);
      c.translate(gx, 392);
      c.transform(1, 0, 0.5, -0.12, 0, 0);
      c.drawImage(gargSil(), 0, -420, 520, 440);
      c.restore();
    }
    c.drawImage(gargoyle(false), gx, gy, 520, 440);
    const litA = Math.max(F, 0.85 * moon);
    if (litA > 0.01) { c.save(); c.globalAlpha = Math.min(1, litA); c.drawImage(gargoyle(true), gx, gy, 520, 440); c.restore(); }
    if (F > 0.2) { c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = (F - 0.2) * 0.9; c.drawImage(gargoyle(true), gx, gy, 520, 440); c.restore(); }
    mist(c, t, 540, 120, 44, 0.42, FOG_NEAR, false, 2);
  });
  flashWash(g, F * 0.6);
}

// ---- shot 7: the doorstep, low and off-axis; the door is open a crack ---------------------------------
// the same Gothic manor as shot 1, close: worn ashlar of irregular courses, lancet windows with sills
// (grime streaking down from each), a round corner turret with a slate cone (the shot-1 silhouette),
// the oak door in a moulded stone frame. The moon (behind us, upper left) grazes the wall and falls off
// toward the right; the door's warm light spreads over the nearby stone and the steps.
const FX0 = 220, FX1 = 1000, FY0 = -40, FY1 = 470; // facade elevation box, in "facade units"
const DOOR = { x0: 500, x1: 612, top: 170 };
const VPY = 300, EYE = 300, SX0 = 250, SXK = 0.92;
const FP = (fx, fy) => { const sx = SX0 + (fx - FX0) * SXK; const k = lerp(0.5, 0.76, (sx - SX0) / ((FX1 - FX0) * SXK)); return [sx, VPY + (fy - EYE) * k]; };
const STEP_Y = FP(DOOR.x1 + 30, 470)[1] + 33;
// lancet windows on the facade: [centre x, top y, half-width, height, kind] in facade units
const FWINS = [[360, 230, 26, 110, "lit"], [790, 240, 24, 104, "dark"], [330, 20, 18, 92, "dark"], [700, 16, 18, 96, "dim"], [880, 22, 18, 92, "dark"]];
function drivePoly() {
  const [dl] = FP(DOOR.x0 - 30, 470), [dr] = FP(DOOR.x1 + 30, 470);
  const p = new Path2D();
  p.moveTo(dl - 46, STEP_Y); p.lineTo(dr + 46, STEP_Y);
  p.bezierCurveTo(dr + 120, STEP_Y + 40, 860, 500, 940, LH + 10); p.lineTo(250, LH + 10);
  p.bezierCurveTo(330, 500, dl - 90, STEP_Y + 40, dl - 46, STEP_Y); p.closePath();
  return p;
}
function doorArch(p, inset) {
  const a = DOOR.x0 + inset, b = DOOR.x1 - inset * 0.9, y = (v) => v - FY0;
  p.moveTo(a - FX0, y(470)); p.lineTo(a - FX0, y(DOOR.top + 60 + inset));
  p.quadraticCurveTo(a + 4 - FX0, y(DOOR.top + inset), (a + b) / 2 - FX0, y(DOOR.top - 20 + inset));
  p.quadraticCurveTo(b - 3 - FX0, y(DOOR.top + inset), b - FX0, y(DOOR.top + 60 + inset)); p.lineTo(b - FX0, y(470)); p.closePath();
  return p;
}
// a candle-lit room seen through a lancet: warm falloff, a curtain each side (soft folds), the far wall,
// leaded glass with a cool sky reflection across the upper panes
function litLancet(s, x, y, w, h, dim) {
  const p = lancetPath(new Path2D(), x, y, w, h);
  s.save(); s.clip(p);
  const wg = s.createRadialGradient(x + w * 0.2, y + h * 0.72, 2, x, y + h * 0.55, h * 0.8);
  if (dim) { wg.addColorStop(0, "#c8803a"); wg.addColorStop(0.4, "#7a3a14"); wg.addColorStop(1, "#1c0a04"); }
  else { wg.addColorStop(0, "#fff0c4"); wg.addColorStop(0.25, "#ffb85a"); wg.addColorStop(0.65, "#a8481a"); wg.addColorStop(1, "#2a1006"); }
  s.fillStyle = wg; s.fillRect(x - w, y - w * 1.2, w * 2, h + w * 1.2);
  // the far wall: a picture frame and a shelf edge catch the candle
  s.fillStyle = dim ? "rgba(40,16,6,0.5)" : "rgba(60,22,8,0.45)"; s.fillRect(x - w * 0.3, y + h * 0.25, w * 0.6, h * 0.22);
  s.fillStyle = dim ? "rgba(255,170,90,0.15)" : "rgba(255,190,110,0.35)"; s.fillRect(x - w * 0.3, y + h * 0.25, w * 0.6, 1.2);
  // the curtains: dark drapes with a few vertical folds, their inner edges lit by the room
  for (const sd of [-1, 1]) {
    const cx0 = x + sd * w, cw = w * 0.55;
    const cp = new Path2D();
    cp.moveTo(cx0, y - w * 1.2); cp.lineTo(cx0 - sd * cw, y - w * 1.2);
    cp.bezierCurveTo(cx0 - sd * cw * 0.7, y + h * 0.3, cx0 - sd * cw * 1.2, y + h * 0.6, cx0 - sd * cw * 0.6, y + h);
    cp.lineTo(cx0, y + h); cp.closePath();
    s.fillStyle = dim ? "#120804" : "#2a1208"; s.fill(cp);
    s.save(); s.clip(cp);
    for (let k = 0; k < 4; k++) { const fx = cx0 - sd * cw * (0.15 + k * 0.22); s.fillStyle = "rgba(0,0,0,0.45)"; s.fillRect(fx - 1.5, y - w, 3, h + w); s.fillStyle = "rgba(255,150,70,0.12)"; s.fillRect(fx + sd * 2, y - w, 1.5, h + w); }
    s.restore();
  }
  // leaded quarries (a diamond lattice) and the cool sky reflection across the upper glass
  s.strokeStyle = "rgba(20,10,6,0.55)"; s.lineWidth = 0.9;
  for (let k = -6; k <= 6; k++) { s.beginPath(); s.moveTo(x + k * 10 - h, y - w + h); s.lineTo(x + k * 10 + h * 0.0, y - w); s.moveTo(x + k * 10 + h, y - w + h); s.lineTo(x + k * 10, y - w); s.stroke(); }
  s.fillStyle = "rgba(20,10,6,0.85)"; s.fillRect(x - 1.2, y - w * 1.2, 2.4, h + w * 1.2); s.fillRect(x - w, y + h * 0.5, w * 2, 2.2);
  const rf = s.createLinearGradient(x - w, y - w, x + w, y + h * 0.6);
  rf.addColorStop(0, "rgba(150,160,200,0.3)"); rf.addColorStop(0.35, "rgba(150,160,200,0.08)"); rf.addColorStop(0.5, "rgba(150,160,200,0)");
  s.fillStyle = rf; s.fillRect(x - w, y - w * 1.2, w * 2, h);
  s.restore();
}
// grime: dark streaks running down from a sill, their width broken by noise
function grime(s, x, y, w, len, seed) {
  const R = K.rng("f05grime" + seed);
  for (let i = 0; i < 9; i++) {
    const gx = x - w + R() * w * 2, gw = 2 + R() * 7, gl = len * (0.4 + R() * 0.6);
    const sg = s.createLinearGradient(0, y, 0, y + gl);
    sg.addColorStop(0, `rgba(12,10,8,${(0.5 + R() * 0.3).toFixed(2)})`); sg.addColorStop(0.6, "rgba(14,12,10,0.12)"); sg.addColorStop(1, "rgba(14,12,10,0)");
    s.fillStyle = sg;
    s.beginPath(); s.moveTo(gx, y); s.lineTo(gx + gw, y); s.lineTo(gx + gw * 0.5 + (R() - 0.5) * 3, y + gl); s.lineTo(gx + gw * 0.3, y + gl); s.closePath(); s.fill();
  }
}
const facadeStages = () => {
  const W = FX1 - FX0, H = FY1 - FY0;
  return [
    (s) => { const wp = new Path2D(); wp.rect(0, 0, W, H); s.fillStyle = "#3a3836"; s.fill(wp); matFill(s, mat("ashlar"), wp, { scale: 260, ox: 40 }); },
    (s) => {
      const wp = new Path2D(); wp.rect(0, 0, W, H);
      matFill(s, stoneTex(), wp, { scale: 300, mode: "overlay", alpha: 0.55 });
      // tone and wear vary over the wall (big fbm patches: weathered, sooty, cleaner)
      matFill(s, mat("cloud"), wp, { scale: 520, scaleY: 380, alpha: 0.18, mode: "multiply", ox: 90 });
      s.globalCompositeOperation = "multiply"; s.fillStyle = rgba("#2a2c38", 0.6); s.fillRect(0, 0, W, H);
      s.globalCompositeOperation = "source-over";
    },
    (s) => { // the moon grazes from the upper left: brighter near the corner, falling off to the right
      const mg = s.createLinearGradient(0, 0, W, H * 0.35);
      mg.addColorStop(0, "rgba(140,148,186,0.22)"); mg.addColorStop(0.35, "rgba(60,64,90,0.06)"); mg.addColorStop(0.7, "rgba(0,0,0,0.28)"); mg.addColorStop(1, "rgba(0,0,0,0.55)");
      s.fillStyle = mg; s.fillRect(0, 0, W, H);
      const vg = s.createLinearGradient(0, 0, 0, H);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(0.75, "rgba(0,0,0,0.1)"); vg.addColorStop(1, "rgba(0,0,0,0.4)");
      s.fillStyle = vg; s.fillRect(0, 0, W, H);
    },
    (s) => { // the windows: deep reveals, sills, grime below; one candle-lit, one dim, the rest dark
      for (const [x0, y0, w, h, kind] of FWINS) {
        const x = x0 - FX0, y = y0 - FY0;
        const sur = lancetPath(new Path2D(), x, y - 4, w + 7, h + 4);
        s.fillStyle = "#4a4846"; s.fill(sur);
        matFill(s, stoneTex(), sur, { scale: 120, tint: "#2c2e38", tintAlpha: 0.6 });
        if (kind === "lit" || kind === "dim") litLancet(s, x, y, w, h, kind === "dim");
        else {
          const p = lancetPath(new Path2D(), x, y, w, h);
          const gr = s.createLinearGradient(x - w, y, x + w, y + h);
          gr.addColorStop(0, "#2e3244"); gr.addColorStop(0.4, "#0c0d12"); gr.addColorStop(1, "#050507");
          s.fillStyle = gr; s.fill(p);
          s.save(); s.clip(p);
          s.strokeStyle = "rgba(0,0,0,0.6)"; s.lineWidth = 1;
          for (let k = -6; k <= 6; k++) { s.beginPath(); s.moveTo(x + k * 10 - h, y - w + h); s.lineTo(x + k * 10, y - w); s.moveTo(x + k * 10 + h, y - w + h); s.lineTo(x + k * 10, y - w); s.stroke(); }
          s.restore();
        }
        // the reveal: the frame's thickness shadows the left and the top of the opening
        s.save(); s.clip(lancetPath(new Path2D(), x, y, w, h));
        const rv = s.createLinearGradient(x - w, 0, x - w + 8, 0);
        rv.addColorStop(0, "rgba(0,0,0,0.7)"); rv.addColorStop(1, "rgba(0,0,0,0)");
        s.fillStyle = rv; s.fillRect(x - w, y - w * 1.3, 8, h + w * 1.3);
        s.restore();
        // the sill: a projecting slab, its top lit by the moon, a hard shadow under it, then grime
        const sw = w + 12;
        matRect(s, stoneTex(), x - sw, y + h, sw * 2, 7, { scale: 90, tint: "#44464e", tintAlpha: 0.55 });
        s.fillStyle = "rgba(190,196,222,0.4)"; s.fillRect(x - sw, y + h, sw * 2, 1.4);
        s.fillStyle = "rgba(0,0,0,0.6)"; s.fillRect(x - sw + 2, y + h + 7, sw * 2 - 4, 3);
        grime(s, x, y + h + 10, sw * 0.9, 70 + h * 0.4, x0);
      }
    },
    (s) => { // the door: moulded stone frame and the oak door with iron straps
      const H2 = FY1 - FY0;
      const fr = doorArch(new Path2D(), -16);
      s.fillStyle = "#4a4846"; s.fill(fr);
      matFill(s, stoneTex(), fr, { scale: 120, tint: "#2e3040", tintAlpha: 0.6 });
      const dp = doorArch(new Path2D(), 0);
      s.fillStyle = "#1a100a"; s.fill(dp);
      matFill(s, mat("wood"), dp, { scale: 220, rot: Math.PI / 2, _x: DOOR.x0 - FX0, tint: "#2a2026", tintAlpha: 0.62 });
      s.save(); s.clip(dp);
      const rv = s.createLinearGradient(DOOR.x0 - FX0, 0, DOOR.x0 - FX0 + 18, 0);
      rv.addColorStop(0, "rgba(0,0,0,0.75)"); rv.addColorStop(1, "rgba(0,0,0,0)");
      s.fillStyle = rv; s.fillRect(DOOR.x0 - FX0, 0, 18, H2);
      for (const yy of [260, 380]) {
        s.fillStyle = "#121014"; s.fillRect(DOOR.x0 - FX0, yy - FY0, DOOR.x1 - DOOR.x0, 7);
        s.fillStyle = rgba(RIM, 0.12); s.fillRect(DOOR.x0 - FX0, yy - FY0, DOOR.x1 - DOOR.x0, 1);
        for (let x = DOOR.x0 + 8; x < DOOR.x1; x += 16) { s.fillStyle = "#1e1c22"; s.beginPath(); s.arc(x - FX0, yy - FY0 + 3.5, 1.8, 0, TAU); s.fill(); }
      }
      s.restore();
      s.strokeStyle = "rgba(0,0,0,0.5)"; s.lineWidth = 3; s.stroke(dp);
      // the frame's moulding catches the moon on its left (upper-left light)
      s.save(); s.clip(fr);
      const ml = s.createLinearGradient(DOOR.x0 - 16 - FX0, 0, DOOR.x0 - FX0, 0);
      ml.addColorStop(0, "rgba(170,176,206,0.3)"); ml.addColorStop(1, "rgba(0,0,0,0.2)");
      s.fillStyle = ml; s.fillRect(DOOR.x0 - 16 - FX0, 0, 16, H2);
      s.restore();
      grime(s, DOOR.x0 - FX0 + 56, DOOR.top - 20 - FY0, 60, 40, 9);
    },
    (s) => { // ivy, an unlit iron lantern on a bracket, occlusion along the ground
      const W2 = FX1 - FX0, H2 = FY1 - FY0;
      ivy(s, 230 - FX0, 470 - FY0, 330 - FX0, 120 - FY0, 7, 46, 1.3);
      ivy(s, 700 - FX0, 470 - FY0, 760 - FX0, 160 - FY0, 8, 36, 1.3);
      const lx = 666 - FX0, ly = 190 - FY0;
      s.fillStyle = "#0a0a0d"; s.fillRect(lx - 1, ly - 30, 10, 3); s.fillRect(lx - 8, ly - 4, 16, 30); s.fillRect(lx - 10, ly - 8, 20, 5);
      s.fillStyle = "rgba(130,136,170,0.16)"; s.fillRect(lx - 6, ly + 2, 12, 20);
      K.aoEdge(s, 0, H2, W2, H2, { width: 40, alpha: 0.6, side: 1 });
      const gb = s.createLinearGradient(0, H2 - 60, 0, H2);
      gb.addColorStop(0, "rgba(16,18,12,0)"); gb.addColorStop(1, "rgba(16,18,12,0.5)");
      s.fillStyle = gb; s.fillRect(0, H2 - 60, W2, 60);
    },
  ];
};
const facadeSprite = staged("f05facade5", FX1 - FX0, FY1 - FY0, facadeStages);
// the round corner turret (screen space): ashlar shaded as a cylinder lit from the upper left, a
// corbelled ring, a slate cone with a finial, a dark arrow-slit
const TUR = { x: 250, r: 46, y0: 392, y1: 124, tip: 40 };
function paintTurret(s) {
  const { x, r, y0, y1, tip } = TUR;
  const body = new Path2D(); body.rect(x - r, y1, r * 2, y0 - y1);
  body.ellipse(x, y0, r, r * 0.22, 0, 0, Math.PI);
  s.fillStyle = "#3a3836"; s.fill(body);
  // courses curve with the cylinder: draw the ashlar in thin horizontal bands, each squeezed toward the edges
  s.save(); s.clip(body);
  matRect(s, mat("ashlar"), x - r, y1, r * 2, y0 - y1 + 12, { scale: 220, ox: 17 });
  matRect(s, stoneTex(), x - r, y1, r * 2, y0 - y1 + 12, { scale: 280, mode: "overlay", alpha: 0.5 });
  const cyl = s.createLinearGradient(x - r, 0, x + r, 0);
  cyl.addColorStop(0, "rgba(120,126,160,0.28)"); cyl.addColorStop(0.25, "rgba(90,94,120,0.18)"); cyl.addColorStop(0.55, "rgba(0,0,0,0.25)"); cyl.addColorStop(0.85, "rgba(0,0,0,0.6)"); cyl.addColorStop(1, "rgba(0,0,0,0.75)");
  s.globalCompositeOperation = "multiply"; s.fillStyle = rgba("#2a2c38", 0.62); s.fillRect(x - r, y1, r * 2, y0 - y1 + 12);
  s.globalCompositeOperation = "source-over";
  s.fillStyle = cyl; s.fillRect(x - r, y1, r * 2, y0 - y1 + 12);
  // a dark arrow-slit with a lit sill
  const sl = lancetPath(new Path2D(), x - r * 0.25, 180, 4, 40);
  s.fillStyle = "#060608"; s.fill(sl);
  s.fillStyle = "rgba(180,186,214,0.35)"; s.fillRect(x - r * 0.25 - 7, 220, 14, 1.2);
  grime(s, x - r * 0.25, 224, 8, 50, 31);
  const ao = s.createLinearGradient(0, y0 - 40, 0, y0 + 10);
  ao.addColorStop(0, "rgba(0,0,0,0)"); ao.addColorStop(1, "rgba(0,0,0,0.55)");
  s.fillStyle = ao; s.fillRect(x - r, y0 - 40, r * 2, 52);
  s.restore();
  // the corbel ring under the cone, lit on top
  const ring = new Path2D(); ring.rect(x - r - 5, y1 - 8, r * 2 + 10, 10);
  s.fillStyle = "#3e3c3a"; s.fill(ring);
  matFill(s, stoneTex(), ring, { scale: 80, tint: "#2c2e38", tintAlpha: 0.6 });
  const rg = s.createLinearGradient(x - r, 0, x + r, 0);
  rg.addColorStop(0, "rgba(180,186,214,0.35)"); rg.addColorStop(0.6, "rgba(0,0,0,0.3)"); rg.addColorStop(1, "rgba(0,0,0,0.65)");
  s.fillStyle = rg; s.fill(ring);
  s.fillStyle = "rgba(0,0,0,0.6)"; s.fillRect(x - r, y1 + 2, r * 2, 4);
  for (let i = 0; i < 9; i++) { const bx = x - r + (i + 0.5) * (r * 2 / 9); s.fillStyle = "rgba(0,0,0,0.5)"; s.fillRect(bx - 1, y1 + 2, 2, 7); }
  // the slate cone
  const cone = new Path2D(); cone.moveTo(x - r - 9, y1 - 6); cone.quadraticCurveTo(x - r * 0.4, y1 - 40, x, tip); cone.quadraticCurveTo(x + r * 0.4, y1 - 40, x + r + 9, y1 - 6); cone.closePath();
  s.fillStyle = "#1e1e26"; s.fill(cone);
  nightMat(s, "slate", cone, { scale: 46 }, "#1c1c26", 0.62);
  s.save(); s.clip(cone);
  const cg = s.createLinearGradient(x - r, 0, x + r, 0);
  cg.addColorStop(0, "rgba(140,148,186,0.3)"); cg.addColorStop(0.35, "rgba(60,64,90,0.05)"); cg.addColorStop(0.7, "rgba(0,0,0,0.45)"); cg.addColorStop(1, "rgba(0,0,0,0.7)");
  s.fillStyle = cg; s.fill(cone);
  s.restore();
  s.strokeStyle = "rgba(180,186,214,0.3)"; s.lineWidth = 1.1;
  s.beginPath(); s.moveTo(x - r - 8, y1 - 7); s.quadraticCurveTo(x - r * 0.4, y1 - 40, x - 0.5, tip + 1); s.stroke();
  s.fillStyle = "#0c0c10"; s.fillRect(x - 1, tip - 22, 2, 24); s.beginPath(); s.arc(x, tip - 4, 3, 0, TAU); s.fill();
}
const doorPlate = staged("f05door5", LW, LH, () => [
  (s) => {
    s.drawImage(skySprite(), 0, 0, LW, LH);
    moonDisc(s, 120, 96, 22);
    glow(s, 120, 96, 160, "#4a4a78", 0.25);
    bareTree(s, 70, 330, 140, 6, "#2e2c40", 0.08, "#8a88aa");
    bareTree(s, 190, 322, 100, 7, "#34324a", 0.06, "#8a88aa");
  },
  (s) => {
    const lawn = new Path2D(); lawn.rect(0, VPY, LW, LH - VPY);
    s.fillStyle = "#121318"; s.fill(lawn);
    bandFill(s, mat("blades"), { hz: VPY, y0: VPY, y1: LH, far: 20, near: 300, squash: 0.8, tint: "#1e2028", tintAlpha: 0.82, seed: 5 });
    const fg = s.createLinearGradient(0, VPY, 0, LH); fg.addColorStop(0, "rgba(64,60,90,0.85)"); fg.addColorStop(0.15, "rgba(58,58,76,0.35)"); fg.addColorStop(0.5, "rgba(50,52,62,0)"); s.fillStyle = fg; s.fillRect(0, VPY, LW, LH - VPY);
  },
  (s) => {
    const dr = drivePoly();
    s.fillStyle = "#2a2a32"; s.fill(dr);
    bandFill(s, gravelTex(), { hz: VPY, y0: STEP_Y, y1: LH, far: 30, near: 220, squash: 0.42, clip: dr, tint: "#26262e", tintAlpha: 0.74, seed: 9 });
    s.save(); s.clip(dr);
    const dg = s.createLinearGradient(0, STEP_Y, 0, LH);
    dg.addColorStop(0, "rgba(130,134,170,0.12)"); dg.addColorStop(1, "rgba(0,0,0,0.45)");
    s.fillStyle = dg; s.fillRect(0, STEP_Y, LW, LH - STEP_Y);
    s.restore();
    s.strokeStyle = "rgba(8,8,12,0.6)"; s.lineWidth = 4; s.stroke(dr);
    K.fog(s, LW, LH, { y: VPY + 6, h: 50, color: "#46445e", alpha: 0.6, wisps: false });
  },
  (s) => { // the facade projected column by column (the left corner recedes)
    const E = facadeSprite(), ex = E.width / (FX1 - FX0);
    for (let fx = FX0; fx < FX1; fx += 3) {
      const [x0, top] = FP(fx, FY0), [x1, bot] = FP(fx + 3, FY1);
      s.drawImage(E, (fx - FX0) * ex, 0, 3 * ex, E.height, x0, top, x1 - x0 + 0.6, bot - top);
    }
  },
  (s) => { // the roof: a slate slope rising back from the eaves, ending behind the turret
    const [a, ay] = FP(FX0, FY0), [b, by] = FP(FX1, FY0);
    const rf = poly(new Path2D(), [a, ay - 4, b + 10, by - 6, b + 10, by - 150, a + 8, ay - 72]);
    s.fillStyle = "#16161e"; s.fill(rf);
    nightMat(s, "slate", rf, { scale: 64, rot: -0.12 }, "#1a1a24", 0.66);
    s.save(); s.clip(rf);
    const rg = s.createLinearGradient(0, ay - 72, 0, ay);
    rg.addColorStop(0, "rgba(130,136,176,0.2)"); rg.addColorStop(1, "rgba(0,0,0,0.35)");
    s.fillStyle = rg; s.fill(rf);
    const lr = s.createLinearGradient(a, 0, b, 0);
    lr.addColorStop(0, "rgba(0,0,0,0)"); lr.addColorStop(1, "rgba(0,0,0,0.45)");
    s.fillStyle = lr; s.fill(rf);
    s.restore();
    s.fillStyle = "rgba(176,182,220,0.3)"; poly(s, [a + 8, ay - 72, b + 10, by - 150, b + 10, by - 148.6, a + 8, ay - 70.8]); s.fill(); s.beginPath();
    s.fillStyle = "#18181f"; poly(s, [a, ay - 6, b, by - 9, b, by, a, ay]); s.fill(); s.beginPath();
    s.fillStyle = "rgba(176,182,220,0.26)"; poly(s, [a, ay - 6, b, by - 9, b, by - 8, a, ay - 5]); s.fill(); s.beginPath();
  },
  (s) => { // three worn steps up to the door, widening toward us; nosings lit, risers dark
    const [dl] = FP(DOOR.x0 - 30, 470), [dr2, dby] = FP(DOOR.x1 + 30, 470);
    for (let i = 0; i < 3; i++) {
      const y = dby + i * 11, x0 = dl - i * 16, x1 = dr2 + i * 16;
      const st = new Path2D(); st.rect(x0, y, x1 - x0, 11);
      s.fillStyle = "#383840"; s.fill(st);
      matFill(s, stoneTex(), st, { scale: 120, _x: x0, _y: y, ox: i * 53, tint: "#262832", tintAlpha: 0.7 });
      const rg = s.createLinearGradient(0, y, 0, y + 11);
      rg.addColorStop(0, "rgba(0,0,0,0)"); rg.addColorStop(0.3, "rgba(0,0,0,0.25)"); rg.addColorStop(1, "rgba(0,0,0,0.6)");
      s.fillStyle = rg; s.fill(st);
      s.fillStyle = rgba(RIM, 0.18); s.fillRect(x0, y, x1 - x0, 1);
      K.aoEdge(s, x0, y + 11, x1, y + 11, { width: 5, alpha: 0.55, side: -1 });
    }
    const [wa, wya] = FP(FX0, FY1), [wb, wyb] = FP(FX1, FY1);
    K.aoEdge(s, wa, wya, wb, wyb, { width: 14, alpha: 0.6, side: -1 });
    groundAO(s, (dl + dr2) / 2, STEP_Y + 2, (dr2 - dl) * 0.7, 10, 0.55);
  },
  (s) => paintTurret(s),
]);
const doorSprite = () => doorPlate();
// a soft fan of light (a blurred wedge with its own falloff), cached once and stretched per frame
const fanSprite = () => SPR("f05fan", 256, 256, (s) => {
  const T = scratch(256, 256);
  const gr = T.g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "rgba(255,190,120,1)"); gr.addColorStop(0.25, "rgba(255,170,100,0.55)"); gr.addColorStop(0.6, "rgba(255,160,90,0.18)"); gr.addColorStop(1, "rgba(255,150,80,0)");
  T.g.fillStyle = gr;
  T.g.beginPath(); T.g.moveTo(116, 0); T.g.lineTo(140, 0); T.g.lineTo(250, 256); T.g.lineTo(6, 256); T.g.closePath(); T.g.fill();
  if (K.hasFilter()) s.filter = `blur(${K.qblur((12 * K.pixelScale()).toFixed(1))}px)`;
  s.drawImage(T.c, 0, 0, 256, 256);
  s.filter = "none";
});
// the right-hand door leaf stands ajar (swung inward): the hall's warm light fills the gap, the leaf's
// inner edge face catches it, and the light spreads out as a soft widening fan over the steps and the
// gravel, with a warm bounce on the stone either side of the door
function doorAjar(c, gap, fl, lt) {
  const mid = (DOOR.x0 + DOOR.x1) / 2;
  const [xl, yt] = FP(mid, DOOR.top - 10), [, yb] = FP(mid, 470);
  const [xr] = FP(mid + gap, 470);
  const arch = new Path2D();
  { const [a] = FP(DOOR.x0, 0), [b] = FP(DOOR.x1, 0), [, ya] = FP(DOOR.x0, DOOR.top + 60), [, yc] = FP(mid, DOOR.top - 20);
    arch.moveTo(a, yb); arch.lineTo(a, ya); arch.quadraticCurveTo(a + 2, yc + 6, (a + b) / 2, yc); arch.quadraticCurveTo(b - 2, yc + 6, b, ya); arch.lineTo(b, yb); arch.closePath(); }
  c.save();
  c.clip(arch);
  const ig = c.createLinearGradient(0, yt, 0, yb);
  ig.addColorStop(0, "#7a3a14"); ig.addColorStop(0.5, "#e08a3c"); ig.addColorStop(1, "#ffd9a0");
  c.fillStyle = ig; c.fillRect(xl, yt - 10, xr - xl, yb - yt + 12);
  glow(c, (xl + xr) / 2, yb - 20, 40, "#fff2d8", 0.5 * fl);
  c.fillStyle = "#c27a3c"; c.fillRect(xr - 3.5, yt, 3.5, yb - yt);
  c.fillStyle = "rgba(255,210,150,0.5)"; c.fillRect(xr - 3.5, yt, 1, yb - yt);
  c.fillStyle = "rgba(30,12,4,0.85)"; c.fillRect(xr, yt, 6 + gap * 0.25, yb - yt);
  c.restore();
  K.volumetricBeam(c, (xl + xr) / 2, yb - 30, 1.72, 300, 0.5 + gap * 0.012, { color: "#ffc080", intensity: 0.18 * fl, t: lt });
  K.dust(c, LW, LH, lt, { seed: 51, count: 18, color: "#ffd8a0", size: 1.1, alpha: 0.35 * fl, area: [xl - 30, yt + 20, xr - xl + 90, yb - yt + 40] });
  c.save();
  c.globalCompositeOperation = "lighter";
  // warm bounce on the stone round the door (the jambs and the wall nearest the gap)
  c.globalAlpha = 0.4 * fl;
  glow(c, xr + 6, (yt + yb) / 2 + 20, 70 + gap * 1.5, "#ff9a50", 1);
  glow(c, xl - 30, yb - 30, 50 + gap, "#ff9a50", 0.6);
  // the fan over the steps and the gravel (soft-edged, widening with the gap and with distance)
  const fw = 60 + gap * 5.5, fh = LH - yb + 30;
  c.globalAlpha = 0.34 * fl * clamp(gap / 30 + 0.3);
  c.drawImage(fanSprite(), (xl + xr) / 2 - fw / 2 + gap * 1.2, yb - 4, fw, fh);
  c.restore();
  K.lightPool(c, (xl + xr) / 2 + 8, yb + 26, 70 + gap * 4, "#ffb060", { intensity: 0.36 * fl, flat: 0.3 });
  return { x: (xl + xr) / 2, y: (yt + yb) / 2, yb };
}
function shotWalkUp(g, t, lt) {
  const p = eio(seg(lt, 0, 8));
  const walk = seg(lt, 0, 7.5);
  const gap = lerp(14, 40, eio(seg(lt, 1, 6)));
  const fl = 0.9 + 0.1 * K.noise(t * 3.1, 9);
  K.withCamera(g, LW, LH, { x: lerp(480, 500, p), y: lerp(276, 270, p), zoom: lerp(1.0, 1.06, p), shakeT: t, shakeAmt: 0.3 }, (c) => {
    c.drawImage(doorSprite(), 0, 0, LW, LH);
    // the candles behind the lancets breathe
    for (const [x0, y0, , h, kind] of FWINS) {
      if (kind !== "lit" && kind !== "dim") continue;
      const [wx, wy] = FP(x0, y0 + h * 0.6), k = kind === "lit" ? 1 : 0.4;
      glow(c, wx, wy, 26 * k + 6, CANDLE, 0.3 * fl * k);
      glow(c, wx, wy + 30 * k, 50 * k + 10, "#c86a28", 0.1 * fl * k);
    }
    const D = doorAjar(c, gap, fl, lt);
    const kx = lerp(470, 556, walk), ky = lerp(560, 466, Math.pow(walk, 0.85)), kh = lerp(150, 118, Math.pow(walk, 0.85));
    c.save();
    c.translate(kx, ky);
    c.rotate(Math.atan2(ky - D.yb, kx - D.x) - Math.PI / 2);
    K.shadowBlob(c, 0, kh * 0.3, kh * 0.08, kh * 0.32, { alpha: 0.55 });
    c.restore();
    K.shadowBlob(c, kx, ky, kh * 0.12, kh * 0.025, { alpha: 0.7 });
    inShade(c, 0.6, "#08080c", (L) => K.drawPerson(L, kx, ky, kh, {
      view: "back", walk: true, phase: lt * 0.85, hood: false, bell: true, t: lt, shadow: false,
      coat: "#7a6a30", hair: "#2a1c12",
      light: { x: D.x + 40, y: D.y, color: "#ffb870", strength: 1.3, z: -0.9 }, ambient: "#0a0a0e",
    }));
    glow(c, kx + kh * 0.12, ky - kh * 0.78, kh * 0.2, "#ff9a4a", 0.12 * fl, "lighter");
    mist(c, t, 470, 90, 52, 0.32, FOG_MID, false, 2);
    mist(c, t, 520, 100, 53, 0.35, FOG_NEAR, true, 2.5);
  });
}

// ---- the edit -------------------------------------------------------------------------------------
const SHOTS = [
  [0, 10, shotManor],
  [10, 20, shotGates],
  [20, 30, shotThroughBars],
  [30, 38, shotFlashlight],
  [38, 48, shotPushGate],
  [48, 56, shotGargoyle],
  [56, 64, shotWalkUp],
];
const XF = [0, 0.6, 0.6, 0, 0, 0, 0.7]; // 30 (hit), 38 ("the figures are gone") and 48 (thunder) are hard cuts
// ---- the warm-up queue: what each shot needs, in the order it is first needed ----------------------
const S = (S2) => S2.step;                       // a staged sprite: one stage per call
const SP = (fn) => () => { fn(); return true; }; // a cached sprite: built whole (kept small)
const NEED = [
  [matJob("moon"), matJob("cloud"), SP(skySprite), S(cloudBandS(31, 120, "#221e30")), S(cloudBandS(32, 150, "#221e30")), S(wispBandS),
    matJob("brick"), matJob("stone"), matJob("slate"), matJob("wood"), S(manorSprite), S(fogSheetS(71, 70, "#5a5478", "high")),
    matJob("blades"), matJob("heather"), matJob("gravel"), S(hillSprite), S(fgBranch)],
  [matJob("rust"), SP(() => leafSprite(false)), SP(() => leafSprite(true)), SP(() => postSprite(104, 370)), matJob("stoneN"), matJob("moss"), S(GARG[0]),
    S(cloudBandS(33, 120, "#221e30")), S(cloudBandS(34, 150, "#221e30")), S(gatesSprite), S(gatesBGSprite), S(gatesGround),
    S(fogSheetS(81, 140, "#4a4664", "high")), S(fogSheetS(82, 120, "#42445a", "high")), S(fogSheetS(83, 200, "#464858", "low"))],
  [S(cloudBandS(35, 150, "#221e30")), S(driveBG), ...Array.from({ length: SH_PH }, (_, b) => SP(() => shadowCore(b))), ...Array.from({ length: SH_PH }, (_, b) => SP(() => shadowRim(b))),
    SP(() => mistPatch("#3c3e4c")), SP(() => mistPatch("#34363f")), SP(barsS3)],
  [SP(barsS4), SP(hotSprite), SP(() => glintSprite(0)), SP(() => glintSprite(1)), SP(() => glintSprite(2)), SP(coneSprite), SP(longShadowSprite), SP(() => mistPatch("#ffe8c8"))],
  [S(pushBG), SP(() => postSprite(110, 520)), matJob("folds"), S(otsSprite), SP(() => leafEdge(false)), SP(() => leafEdge(true))],
  [S(gargBG), S(gargBGd), SP(capSprite), S(GARG[1]), S(gargSil)],
  [matJob("ashlar"), S(facadeSprite), S(doorPlate), SP(fanSprite)],
];
// the shot's own later needs (the lightning-lit layers of shot 1, built well before the 6 s thunder)
const LATER = [[S(manorFlash), S(hillFlash), S(manorSil), S(hillSil), S(cloudBandS(31, 120, "#6a6c90")), S(cloudBandS(32, 150, "#5a5c80"))], [], [], [], [], [], []];
const QUEUE = SHOTS.map((_, i) => [...NEED[i], ...LATER[i], ...NEED.slice(i + 1).flat()]);
function warm(i, ms) { DEADLINE = now() + ms; runJobs(QUEUE[i], ms); }
function drawShot(g, i, t) {
  const [a, , fn] = SHOTS[i];
  g.save();
  try { fn(g, t, Math.max(0, t - a)); } finally { g.restore(); }
}
const FADE_IN = [0.9, 2.2];
const gargF = (t) => (t >= 48 && t < 49 ? clamp(gargFlash(t - 48)) : 0);

export const film = {
  id: 5,
  title: "The Shadow at the Gate",
  chapter: "Chapter 5",
  unlockAt: 25,
  duration: D,
  poster: 34,
  tagline: "Someone else is walking with him.",
  subs: [
    [3.0, 6.5, "The manor on the hill."],
    [11.5, 15.5, "The gate was locked. The fog was not."],
    [22.0, 25.5, "There. In the fog. Biscuit."],
    [26.0, 29.5, "And someone tall, walking just ahead."],
    [31.5, 34.0, "You shone the light."],
    [35.0, 37.5, "He saw you. He did not come."],
    [40.0, 44.5, "Who was the shadow? Where was it taking him?"],
    [49.5, 54.0, "Just a gargoyle. With a moustache."],
    [57.0, 62.0, "You went in anyway."],
  ],
  voice: [
    [3.0, "The manor on the hill.", { rate: 0.92, pitch: 1.0 }],
    [11.5, "The gate was locked. The fog was not.", { rate: 0.92, pitch: 1.0 }],
    [22.0, "There. In the fog. Biscuit.", { rate: 0.92, pitch: 1.0 }],
    [26.0, "And someone tall, walking just ahead.", { rate: 0.92, pitch: 1.0 }],
    [31.5, "You shone the light.", { rate: 0.92, pitch: 1.0 }],
    [35.0, "He saw you. He did not come.", { rate: 0.85, pitch: 0.95 }],
    [40.0, "Who was the shadow? Where was it taking him?", { rate: 0.92, pitch: 1.0 }],
    [49.5, "Just a gargoyle. With a moustache.", { rate: 1.0, pitch: 1.1 }],
    [57.0, "You went in anyway.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: { mood: "tense", key: "C", bpm: 60, cues: [[6, "thunder"], [20, "drop"], [30, "hit"], [34, "meow"], [48, "thunder"], [58, "swell"]] },
  // moonlight: a slightly cool white balance, near-neutral blacks (the violet is painted into the sky
  // and the far fog only), halation round the candles and the door crack, luminance-weighted grain
  grade: { exposure: 0.95, temp: -0.07, tint: 0, lift: [0.004, 0.005, 0.009], gamma: [1, 1, 1.01], contrast: 1.1, sat: 0.9, bloom: 0.35, halation: 0.5, streak: 0.05, grain: 0.075, grainSize: 1.45, vignette: 0.5, ca: 0.6 },
  gradeAt(t) {
    // the last shot warms as the door light takes over from the moon
    if (t >= 55.3) { const k = smooth(seg(t, 55.3, 60)); return { temp: lerp(-0.07, 0.02, k), exposure: lerp(0.95, 1.0, k) }; }
    // the gargoyle: the thunder flash (about +2 stops, decaying fast), then the eye has adjusted
    if (t >= 48 && t < 56) {
      const F = gargF(t);
      return { exposure: lerp(0.95, 1.15, smooth(seg(t, 48.6, 50))) * Math.pow(2, 1.1 * F), bloom: 0.35 + 0.25 * F, halation: 0.5 + 0.2 * F, temp: -0.07 - 0.08 * F };
    }
    // the torch shot: a hotter key; halation and a short streak when his eyes throw the light back
    if (t >= 30 && t < 38) { const e = K.env(t - 30, 1.5, 7.6, 0.12, 1.7); return { streak: 0.08 + 0.08 * e, halation: 0.62, bloom: 0.42 }; }
    // the manor thunder: the whole frame lifts for the strokes
    if (t >= 5.9 && t < 6.8) { const fl = K.flash(t, [6.0, 6.12, 6.42], 0.1); return { exposure: 0.95 * Math.pow(2, 1.2 * fl), bloom: 0.35 + 0.2 * fl }; }
    return {};
  },
  draw(g, t, W, H) {
    t = clamp(t, 0, D);
    g.save();
    if (W !== LW || H !== LH) g.scale(W / LW, H / LH);
    let i = SHOTS.findIndex(([a, b]) => t >= a && t < b);
    if (i < 0) i = SHOTS.length - 1;
    const fadeIn = 1 - smooth(seg(t, FADE_IN[0], FADE_IN[1]));
    if (fadeIn > 0.995) {
      // still black: nothing to draw, so the warm-up gets the frame's time
      g.fillStyle = "#000"; g.fillRect(0, 0, LW, LH);
      warm(0, 12);
      g.restore();
      return;
    }
    drawShot(g, i, t);
    warm(i, 3.5);
    const nx = SHOTS[i + 1];
    if (nx && XF[i + 1] > 0 && t > nx[0] - XF[i + 1]) {
      const L = K.layer(LW, LH, "f05xf");
      L.g.setTransform(1, 0, 0, 1, 0, 0);
      L.g.clearRect(0, 0, L.canvas.width, L.canvas.height);
      L.g.setTransform(K.pixelScale(), 0, 0, K.pixelScale(), 0, 0);
      drawShot(L.g, i + 1, t);
      g.save();
      g.globalAlpha = smooth((t - (nx[0] - XF[i + 1])) / XF[i + 1]);
      g.drawImage(L.canvas, 0, 0, LW, LH);
      g.restore();
    }
    K.letterbox(g, LW, LH, 1);
    const ta = K.env(t, 2, 6, 0.9, 1.0);
    if (ta > 0) K.title(g, LW, LH, "The Shadow at the Gate", "Chapter 5", ta, { y: LH * 0.76, size: 52, glow: "#c8ccf0" });
    K.fadeBlack(g, LW, LH, fadeIn);
    K.fadeBlack(g, LW, LH, smooth(seg(t, 62, 64)));
    g.restore();
  },
};
