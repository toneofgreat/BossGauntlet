// films/f06.js - Chapter 6: "The Toy Mouse" (FILMS.md f06). Haunted Litterbox Manor, inside:
// a candlelit plum hallway, portraits that watch you, a ghost that is bad at haunting, a moonlit
// grand staircase, the toy mouse, a warm kitchen memory, and the Shadow that leaves no prints.
// draw(g, t, W, H) is a pure function of t. Static art (portraits, felt texture) is cached by key.
import * as K from "../filmkit.js";

const D = 66;
const { clamp, lerp, seg, smooth, mix, rgba, shade, hash, noise, glow, TAU } = K;
const eio = K.ease.inOut;

const PLUM = "#2c1832";
const CANDLE = "#ffb24a";
// the colour candle light paints INTO the light map: a ~1900 K flame. On the desaturated plum damask
// it lands warm brown-amber (a saturated orange multiplied onto purple reads hot pink, which is wrong)
const LIGHT = "#ff9a40";
const MOON = "#9aa8ff";

// ---- private, never-evicted caches ----------------------------------------------------------------
// The kit's sprite cache clears ALL sprites once it holds 400 (every cat, glow colour and pool adds
// some), and its texture cache is an LRU by bytes. Either would rebuild a 1640 px albedo bake or the
// per-pixel hand bake in the middle of a shot. This film's static art (a bounded set of keys, ~40)
// lives here instead and is built exactly once.
const OWN = new Map();
function own(key, w, h, paint) {
  const px = K.pixelScale(), k = key + '@' + px + ':' + Math.round(w) + 'x' + Math.round(h);
  let c = OWN.get(k);
  if (c) return c;
  c = K.makeCanvas(w * px, h * px);
  const s = c.getContext('2d');
  s.setTransform(px, 0, 0, px, 0, 0);
  try { paint(s, w, h); } catch (err) { console.warn('[f06] bake failed', key, err); }
  c.lw = w; c.lh = h;
  OWN.set(k, c);
  return c;
}
// a vertical gradient baked once into a 2 x 64 strip, drawn stretched (no per-frame gradients)
function vgrad(key, stops) {
  return own("f06vg:" + key, 2, 64, (s) => {
    const gr = s.createLinearGradient(0, 0, 0, 64);
    for (const [u, c] of stops) gr.addColorStop(u, c);
    s.fillStyle = gr;
    s.fillRect(0, 0, 2, 64);
  });
}
function ownBake(key, w, h, fn) {
  const k = 'tb:' + key + ':' + w + 'x' + h;
  let c = OWN.get(k);
  if (!c) { c = K.texBake(key, w, h, fn); OWN.set(k, c); }
  return c;
}

// ---- small shared painters ---------------------------------------------------------------------
// candle flicker (FILMS.md): 1 + 0.1 sin(13t + seed) + 0.05 sin(29t)
const flick = (t, s) => 1 + 0.1 * Math.sin(t * 13 + s) + 0.05 * Math.sin(t * 29 + s * 1.7);

// flame(g, x, y, h, t, seed, a): a candle flame standing on (x, y), h tall, with its light.
// While FL is a list, flames are DEFERRED: recorded with their transform, turned into light-map pools
// (every flame lights its surroundings with inverse-square falloff) and drawn after the light map.
let FL = null;
function deferFlames() { FL = []; }
function flameLights(lg, R = 15, I = 1) {
  for (const f of FL || []) {
    const [x, y, h, t, seed, a, light] = f.a;
    if (!(light > 0)) continue;
    lg.save();
    lg.setTransform(f.lm);
    const k = flick(t, seed);
    pool(lg, x, y - h * 0.5, h * R * (0.94 + 0.06 * k), LIGHT, I * a * light * f.ga * k);
    pool(lg, x, y - h * 0.5, h * R * 0.35, "#ffc68a", 0.5 * I * a * light * f.ga * k);
    lg.restore();
  }
}
function flushFlames(g) {
  const L = FL || [];
  FL = null;
  for (const f of L) { g.save(); g.setTransform(f.m); g.globalAlpha = f.ga; flame(g, ...f.a); g.restore(); }
}
// albedoCache: paint a STATIC part of a set once into a sprite (logical rect x0,y0,w,h at `res`x),
// recording the flames it would have drawn (in world coords); replay draws the sprite and re-defers
// those flames with the current t, so they still flicker, light the scene and draw last.
const ALB = new Map();
function albedoCache(key, x0, y0, w, h, res, paint) {
  const k = key + "@" + w + "x" + h + "x" + res;
  let e = ALB.get(k);
  if (!e) {
    const fl = [];
    const spr = own("f06alb:" + k, w * res, h * res, (s) => {
      s.scale(res, res);
      s.translate(-x0, -y0);
      const sv = FL;
      FL = fl;
      try { paint(s); } finally { FL = sv; }
    });
    // never evicted (the keys are a fixed handful): the sprite and its recorded flames live together
    e = { spr, fl, x0, y0, w, h };
    ALB.set(k, e);
  }
  return e;
}
function albedoDraw(g, e, t) {
  g.drawImage(e.spr, e.x0, e.y0, e.w, e.h);
  if (FL) for (const f of e.fl) { const a = f.a.slice(); a[3] = t; FL.push({ m: g.getTransform(), a, ga: g.globalAlpha }); }
}
// The flame body is a cached sprite (a teardrop with a white-hot core, an amber mantle and a blue
// root) drawn through a shear so its tip sways: no gradient is built per flame per frame (dozens of
// createRadialGradient + addColorStop calls a frame were a measurable cost on a weak laptop).
const FLAME_H = 64;
function flameSprite() {
  return own("f06flame", 40, 72, (s) => {
    const x = 20, y = 66, hh = FLAME_H, w = hh * 0.3;
    const gr = s.createRadialGradient(x, y - hh * 0.25, hh * 0.02, x, y - hh * 0.35, hh * 0.75);
    gr.addColorStop(0, "#fffbe8");
    gr.addColorStop(0.3, "#ffe7a0");
    gr.addColorStop(0.65, "#ffa53a");
    gr.addColorStop(1, "rgba(255,90,20,0)");
    s.fillStyle = gr;
    s.beginPath();
    s.moveTo(x, y + hh * 0.05);
    s.bezierCurveTo(x - w * 1.1, y - hh * 0.05, x - w * 0.6, y - hh * 0.6, x, y - hh);
    s.bezierCurveTo(x + w * 0.6, y - hh * 0.6, x + w * 1.1, y - hh * 0.05, x, y + hh * 0.05);
    s.fill();
    s.fillStyle = "rgba(90,140,255,0.45)";
    s.beginPath();
    s.ellipse(x, y - hh * 0.04, w * 0.45, hh * 0.08, 0, 0, TAU);
    s.fill();
  });
}
function flame(g, x, y, h, t, seed, a = 1, light = 1) {
  if (h <= 0.3 || a <= 0) return;
  if (FL) { FL.push({ m: g.getTransform(), a: [x, y, h, t, seed, a, light], ga: g.globalAlpha }); return; }
  const f = flick(t, seed);
  const hh = h * f;
  const sway = noise(t * 2.3, seed) * h * 0.12;
  if (light > 0) {
    glow(g, x, y - hh * 0.5, hh * 4.5, CANDLE, 0.09 * a * light * f);
    glow(g, x, y - hh * 0.5, hh * 2.6, "#ffc56a", 0.2 * a * light * f);
  }
  const k = hh / FLAME_H;
  g.save();
  g.globalAlpha *= a;
  // shear about the flame's root so the tip leans by `sway`, then scale the sprite to size
  g.transform(k, 0, -sway / hh * k, k, x, y);
  g.drawImage(flameSprite(), -20, -66, 40, 72);
  g.restore();
  glow(g, x, y - hh * 0.3, hh * 0.9, "#fff2c8", 0.7 * a);
}

// candle(g, x, y, h, t, seed, lit): wax stick standing on (x, y), lit flame on top. The stick (round
// shading, melted lip, two drips) is one of four cached sprites picked by the seed.
function candleSprite(v) {
  return own("f06candle" + v, 24, 128, (s) => {
    const w = 24, h = 120, x = 12, y = 128;
    const gr = s.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, "#b39a78");
    gr.addColorStop(0.35, "#f1e3c2");
    gr.addColorStop(0.7, "#e2cfa6");
    gr.addColorStop(1, "#8a7254");
    s.fillStyle = gr;
    s.fillRect(0, y - h, w, h);
    s.fillStyle = "#fbf0d4";
    s.beginPath();
    s.ellipse(x, y - h, w / 2, w * 0.16, 0, 0, TAU);
    s.fill();
    s.fillStyle = "rgba(250,236,205,0.85)";
    const d1 = h * (0.2 + (v / 4) * 0.3), d2 = h * (0.1 + (((v * 3) % 4) / 4) * 0.25);
    s.beginPath();
    s.ellipse(x - w * 0.3, y - h + d1 / 2, w * 0.11, d1 / 2, 0, 0, TAU);
    s.ellipse(x + w * 0.28, y - h + d2 / 2, w * 0.09, d2 / 2, 0, 0, TAU);
    s.fill();
  });
}
function candle(g, x, y, h, t, seed, lit = 1, light = 1) {
  const w = h * 0.2;
  g.drawImage(candleSprite(Math.floor(hash(seed, 3) * 4)), x - w / 2, y - h - w / 3, w, h + w / 3);
  g.strokeStyle = "#2a1a10";
  g.lineWidth = Math.max(0.6, w * 0.08);
  g.beginPath();
  g.moveTo(x, y - h);
  g.lineTo(x + w * 0.05, y - h - w * 0.35);
  g.stroke();
  if (lit > 0) flame(g, x, y - h - w * 0.25, h * 0.42 * lit, t, seed, Math.min(1, lit * 1.5), light);
}

// a brass wall sconce with one candle (x, y = candle foot, s = scale px per unit)
function sconceCup() {
  return own("f06cup", 48, 16, (s) => {
    const cup = s.createLinearGradient(0, 0, 48, 0);
    cup.addColorStop(0, "#6a4a16");
    cup.addColorStop(0.4, "#e8c066");
    cup.addColorStop(1, "#5a3c10");
    s.fillStyle = cup;
    s.beginPath();
    s.ellipse(24, 8, 24, 8, 0, 0, TAU);
    s.fill();
  });
}
function sconce(g, x, y, s, t, seed, dir = 1) {
  g.fillStyle = "#5a4218";
  g.beginPath();
  g.ellipse(x - dir * s * 0.08, y + s * 0.05, s * 0.05, s * 0.14, 0, 0, TAU);
  g.fill();
  g.strokeStyle = "#a07a34";
  g.lineWidth = Math.max(0.8, s * 0.02);
  g.beginPath();
  g.moveTo(x - dir * s * 0.08, y + s * 0.08);
  g.quadraticCurveTo(x - dir * s * 0.02, y + s * 0.1, x, y + s * 0.01);
  g.stroke();
  g.drawImage(sconceCup(), x - s * 0.07, y - s * 0.02, s * 0.14, s * 0.04);
  candle(g, x, y, s * 0.24, t, seed);
}

function dissolve(g, W, H, a, key, fn) {
  if (a <= 0.003) return;
  if (a >= 0.997) { fn(g); return; }
  const L = K.layer(W, H, key);
  fn(L.g);
  g.save();
  g.globalAlpha = a;
  g.drawImage(L.canvas, 0, 0, W, H);
  g.restore();
}

// ---- realism helpers ------------------------------------------------------------------------------
// Surfaces are painted as ALBEDO (textured, no lighting baked in except relief), then one light map
// per frame (ambient + every motivated light as additive pools) is MULTIPLIED over the frame, so the
// falloff from each candle / moon patch lands on every material the same way. Emissive things
// (flames, glass, beams, dust) go on after the light map.
const DOMM = typeof DOMMatrix !== "undefined";
function patXf(p, a, b, c, d, e, f) { if (p && DOMM && p.setTransform) p.setTransform(new DOMMatrix([a, b, c, d, e, f])); }
// lit(g, W, H, ambient, paint): paint(lg) adds light into a map that starts at `ambient`; the map is
// then multiplied over everything drawn so far. Works under any camera transform (the map copies it).
function lit(g, W, H, ambient, paint, res = 0.5) {
  // light is smooth: the map is built at half resolution (4x fewer pixels for every pool) and
  // stretched over the frame with smoothing, which also softens the window penumbrae a touch
  const L = K.layer(W * res, H * res, "f06lm" + res);
  const lg = L.g, cv = g.canvas;
  lg.setTransform(1, 0, 0, 1, 0, 0);
  lg.fillStyle = ambient;
  lg.fillRect(0, 0, L.canvas.width, L.canvas.height);
  const m = g.getTransform(), sx = L.canvas.width / cv.width, sy = L.canvas.height / cv.height;
  lg.setTransform(m.a * sx, m.b * sy, m.c * sx, m.d * sy, m.e * sx, m.f * sy);
  lg.globalCompositeOperation = "lighter";
  if (FL) for (const f of FL) { const q = f.m; f.lm = new DOMMatrix([q.a * sx, q.b * sy, q.c * sx, q.d * sy, q.e * sx, q.f * sy]); }
  paint(lg);
  lg.globalCompositeOperation = "source-over";
  lg.globalAlpha = 1;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "multiply";
  g.imageSmoothingEnabled = true;
  g.drawImage(L.canvas, 0, 0, cv.width, cv.height);
  g.restore();
}
// a pool of light in the map: inverse-square-ish radial falloff (flat < 1 squashes it onto a floor)
function pool(lg, x, y, r, color, I = 1, flat = 1) { K.lightPool(lg, x, y, r, color, { intensity: I, flat }); }
// textured perspective planes for the 3D sets (cam = {x, y, z, f, cx, cy} as in proj()). The texture
// is mapped in world units: k = tiles per world unit. Thin strips of constant depth keep it exact.
const CPAT = new WeakMap();
function canvasPattern(g, c) {
  let m = CPAT.get(c);
  if (!m) { m = new WeakMap(); CPAT.set(c, m); }
  let p = m.get(g);
  if (!p) { p = g.createPattern(c, "repeat"); m.set(g, p); }
  return p;
}
function texInfo(g, o) {
  if (o.canvas) return { pat: canvasPattern(g, o.canvas), kts: (o.k || 1) * o.canvas.width, avg: o.base || o.canvas.avg || "#000" };
  const c = K.texture(o.tex, o.texO || { seed: 1 });
  return { pat: K.texPattern(g, o.tex, o.texO || { seed: 1 }), kts: (o.k || 1) * c.width, avg: c.avg };
}
// horizontal plane Y between x0..x1, z0 (near)..z1 (far). o.rot90: texture u runs along Z (floorboards).
function hPlane(g, cam, o) {
  const P = proj(cam);
  const z0 = Math.max(o.z0, cam.z + 0.06), z1 = o.z1, dy = o.Y - cam.y;
  if (z1 <= z0 || Math.abs(dy) < 1e-4) return;
  const { pat, kts, avg } = texInfo(g, o);
  // only the rows that can be on screen (the camera transform may zoom, so keep a margin)
  const yLo = o.yLo == null ? -300 : o.yLo, yHi = o.yHi == null ? 900 : o.yHi;
  const yN = clamp(cam.cy + (dy * cam.f) / (z0 - cam.z), yLo, yHi), yF = clamp(cam.cy + (dy * cam.f) / (z1 - cam.z), yLo, yHi);
  if (Math.abs(yN - yF) < 0.3) return;
  const a0 = P(o.x0, o.Y, z0), a1 = P(o.x1, o.Y, z0), b0 = P(o.x0, o.Y, z1), b1 = P(o.x1, o.Y, z1);
  const xl = Math.max(-200, Math.min(a0[0], b0[0])), xr = Math.min(1200, Math.max(a1[0], b1[0]));
  g.save();
  quad(g, P, [[o.x0, o.Y, z0], [o.x1, o.Y, z0], [o.x1, o.Y, z1], [o.x0, o.Y, z1]]);
  g.clip();
  g.globalAlpha *= o.alpha == null ? 1 : o.alpha;
  g.fillStyle = o.base || avg;
  g.fillRect(xl, Math.min(yN, yF) - 1, xr - xl, Math.abs(yN - yF) + 2);
  g.fillStyle = pat;
  const A = g.globalAlpha, step = o.step || 3;
  // strips get wider away from the horizon (the affine error per strip shrinks as 1/z changes slowly)
  const oz = o.oz || 0, ox = o.ox || 0, dir = Math.sign(yN - yF);
  for (let y0 = yF, it = 0; dir * (yN - y0) > 0.05 && it < 360; it++) {
    const st = Math.max(step, Math.abs(y0 - cam.cy) * 0.07);
    const ya = y0, yb = dir > 0 ? Math.min(yN, y0 + st) : Math.max(yN, y0 - st), ym = (ya + yb) / 2;
    y0 = yb;
    const za = cam.z + (dy * cam.f) / (ya - cam.cy), zb = cam.z + (dy * cam.f) / (yb - cam.cy), zm = cam.z + (dy * cam.f) / (ym - cam.cy);
    if (!(za > cam.z) || !(zb > cam.z)) continue;
    const s = cam.f / (zm - cam.z), a = s / kts;
    const va = (za + oz) * kts, vb = (zb + oz) * kts, d = (yb - ya) / (vb - va || 1e-6);
    const mg = Math.min(a, Math.abs(d));
    if (mg < 0.12) continue;
    const e = cam.cx + (ox - cam.x) * s, ff = ya - va * d;
    if (o.rot90) patXf(pat, 0, d, a, 0, e, ff); else patXf(pat, a, 0, 0, d, e, ff);
    g.globalAlpha = A * clamp((mg - 0.12) * 3);
    g.fillRect(xl, Math.min(ya, yb) - 0.4, xr - xl, Math.abs(yb - ya) + 0.8);
  }
  g.restore();
}
// vertical side plane X between Y y0 (top)..y1 and z0 (near)..z1 (far); texture u along Z, v along Y
function sPlane(g, cam, o) {
  const P = proj(cam);
  const z0 = Math.max(o.z0, cam.z + 0.06), z1 = o.z1, dx = o.X - cam.x;
  if (z1 <= z0 || Math.abs(dx) < 1e-4) return;
  const { pat, kts, avg } = texInfo(g, o);
  const xN = clamp(cam.cx + (dx * cam.f) / (z0 - cam.z), -500, 1460), xF = clamp(cam.cx + (dx * cam.f) / (z1 - cam.z), -500, 1460);
  if (Math.abs(xN - xF) < 0.3) return;
  const t0 = P(o.X, o.y0, z0), t1 = P(o.X, o.y0, z1), u0 = P(o.X, o.y1, z0), u1 = P(o.X, o.y1, z1);
  const yt = Math.max(-400, Math.min(t0[1], t1[1])), yb2 = Math.min(1000, Math.max(u0[1], u1[1]));
  g.save();
  quad(g, P, [[o.X, o.y0, z0], [o.X, o.y0, z1], [o.X, o.y1, z1], [o.X, o.y1, z0]]);
  g.clip();
  g.globalAlpha *= o.alpha == null ? 1 : o.alpha;
  g.fillStyle = o.base || avg;
  g.fillRect(Math.min(xN, xF) - 1, yt, Math.abs(xN - xF) + 2, yb2 - yt);
  g.fillStyle = pat;
  const A = g.globalAlpha, step = o.step || 3;
  const oy = o.oy || 0, dir = Math.sign(xN - xF);
  for (let xa0 = xF, it = 0; dir * (xN - xa0) > 0.05 && it < 360; it++) {
    const st = Math.max(step, Math.abs(xa0 - cam.cx) * 0.07);
    const xb = dir > 0 ? Math.min(xN, xa0 + st) : Math.max(xN, xa0 - st), xa = xa0, xm = (xa + xb) / 2;
    xa0 = xb;
    const za = cam.z + (dx * cam.f) / (xa - cam.cx), zb = cam.z + (dx * cam.f) / (xb - cam.cx), zm = cam.z + (dx * cam.f) / (xm - cam.cx);
    if (!(za > cam.z) || !(zb > cam.z)) continue;
    const s = cam.f / (zm - cam.z), d = s / kts;
    if (d < 0.06) continue;
    const ua = za * kts, ub = zb * kts, a = (xb - xa) / (ub - ua || 1e-6);
    patXf(pat, a, 0, 0, d, xa - ua * a, cam.cy + (oy - cam.y) * s);
    g.globalAlpha = A * clamp((d - 0.06) * 6);
    g.fillRect(Math.min(xa, xb) - 0.4, yt, Math.abs(xb - xa) + 0.8, yb2 - yt);
  }
  g.restore();
}
// frontal plane at depth Z (exact: a scaled pattern)
function fPlane(g, cam, o) {
  const P = proj(cam);
  if (o.Z <= cam.z + 0.05) return;
  const { pat, kts } = texInfo(g, o);
  const s = cam.f / (o.Z - cam.z);
  patXf(pat, s / kts, 0, 0, s / kts, cam.cx + ((o.ox || 0) - cam.x) * s, cam.cy + ((o.oy || 0) - cam.y) * s);
  g.save();
  g.globalAlpha *= o.alpha == null ? 1 : o.alpha;
  quad(g, P, [[o.x0, o.y0, o.Z], [o.x1, o.y0, o.Z], [o.x1, o.y1, o.Z], [o.x0, o.y1, o.Z]]);
  g.fillStyle = pat;
  g.fill();
  g.restore();
}
// the house materials (shared by every shot so each texture is built once)
const MAT = {
  oak: ["wood", { seed: 61, color: "#5a3420", dark: "#1e0e08", planks: 3, varnish: true }],
  runner: ["fabric", { seed: 64, color: "#701c28", weave: 1.1 }],
  border: ["fabric", { seed: 65, color: "#a07a3a", weave: 1.4 }],
  // plum damask, desaturated ~30% toward #3a2a2a so candlelight goes brown-amber on it, not magenta
  paper: ["wallpaper", { seed: 66, color: "#4e343e", ink: "#2c1c22", age: 0.35 }],
  plaster: ["plaster", { seed: 67, color: "#5a4658", grime: "#2a1a28" }],
  boards: ["wood", { seed: 70, size: 256, color: "#5a3220", dark: "#1a0a04", planks: 8, joints: 1, varnish: true }],
  dado: ["plaster", { seed: 68, color: "#3c2422", grime: "#160a08", stain: 0.5 }],
  stripe: ["wallpaper", { seed: 69, color: "#4e3440", ink: "#2e1c24", motif: "stripe", age: 0.4 }],
};
const mat = (m, o) => Object.assign({ tex: MAT[m][0], texO: MAT[m][1] }, o);
// flock: the damask motif on the paper is a raised velvet pile. This mask (same tiling as the kit's
// wallpaper texture: two motifs per tile) is added onto the albedo BEFORE the light map, so the
// pile only shows where a flame actually lights it, with brighter fibre tips round each motif edge.
function flockTex() {
  return ownBake("f06flock", 128, 128, (u, v, out, x, y) => {
    const lx = ((u * 2) % 1) - 0.5, ly = ((v * 2) % 1) - 0.5, ax = Math.abs(lx);
    const r = Math.hypot(ax * 1.4, ly);
    const petal = Math.abs(Math.sin(Math.atan2(ly, ax) * 3)) * 0.12 + 0.18;
    let m = clamp((petal - r) / 0.02 + 0.5);
    m = Math.max(m, Math.abs(r - 0.32) < 0.014 && ly < 0 ? 1 : 0, ax < 0.014 && ly > 0.1 ? 1 : 0);
    const lx2 = (((u * 2) + 0.5) % 1) - 0.5, ly2 = (((v * 2) + 0.5) % 1) - 0.5;
    m = Math.max(m, clamp((0.05 - Math.hypot(lx2, ly2)) / 0.012 + 0.5));
    const rim = Math.exp(-(((r - petal) / 0.025) ** 2));
    const fib = 0.6 + 0.4 * (K.texNoise(u * 64, v * 64, 3, 64, 64) * 0.5 + 0.5) + (hash(x * 3.1 + y * 7.7, 5) - 0.5) * 0.3;
    const val = clamp((m * 0.5 + rim * 0.55) * fib) * 255;
    out[0] = val; out[1] = val * 0.86; out[2] = val * 0.74; out[3] = 255;
  });
}
// a light pool projected on a wall / floor in the 3D sets: a world-space disc seen in perspective
function wallPool(lg, P, X, Y, Z, rW, color, I) { const s = P(X, Y, Z); pool(lg, s[0], s[1], rW * s[2], color, I, 1); }
function floorPool(lg, P, X, Y, Z, rW, color, I) {
  const s = P(X, Y, Z), n = P(X, Y, Z - rW), f = P(X, Y, Z + rW);
  const r = rW * s[2];
  pool(lg, s[0], (n[1] + f[1]) / 2, r, color, I, clamp(Math.abs(n[1] - f[1]) / (2 * r), 0.05, 1));
}

// ---- portraits (cached oil paintings)------------------------------------------------------------
const PORTRAITS = {
  duchess: { coat: K.COATS.cream, bg: "#1f2a1c", bg2: "#56603a", turn: 0.55, facing: 1 },
  admiral: { coat: K.COATS.grey, bg: "#3a1414", bg2: "#7a3a22", turn: 0.7, facing: -1 },
  lord: { coat: K.COATS.tuxedo, bg: "#20160e", bg2: "#5a4024", turn: 0.6, facing: 1 },
  lady: { coat: K.COATS.siamese, bg: "#141c2c", bg2: "#3a4a66", turn: 0.5, facing: -1 },
};
// costume painted over the cat; (hx, hy) head centre, hs head size, (nx, ny) neck point
function costume(g, kind, hx, hy, hs, nx, ny) {
  if (kind === "duchess") {
    // velvet gown, lace ruff + pearls
    const dg = g.createLinearGradient(nx - hs * 1.5, 0, nx + hs * 1.5, 0);
    dg.addColorStop(0, "#1a2a14");
    dg.addColorStop(0.45, "#3e5a2a");
    dg.addColorStop(1, "#101a0c");
    g.fillStyle = dg;
    g.beginPath();
    g.moveTo(nx - hs * 1.7, ny + hs * 2.4);
    g.quadraticCurveTo(nx - hs * 1.3, ny + hs * 0.45, nx, ny + hs * 0.5);
    g.quadraticCurveTo(nx + hs * 1.3, ny + hs * 0.45, nx + hs * 1.7, ny + hs * 2.4);
    g.fill();
    g.strokeStyle = "rgba(200,220,150,0.25)";
    g.lineWidth = 1;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(nx - hs + k * hs * 0.5, ny + hs * 0.8); g.quadraticCurveTo(nx - hs * 0.9 + k * hs * 0.48, ny + hs * 1.5, nx - hs * 1.1 + k * hs * 0.55, ny + hs * 2.3); g.stroke(); }
    for (let i = 0; i < 2; i++) {
      g.fillStyle = i ? "#f6f1e6" : "#c9c0ae";
      g.beginPath();
      for (let k = 0; k <= 24; k++) {
        const a = Math.PI * (k / 24) - Math.PI;
        const r = hs * (0.72 - i * 0.06) * (k % 2 ? 0.88 : 1);
        g.lineTo(nx + Math.cos(a) * r * 1.15, ny + 6 + Math.sin(a) * r * 0.34 + hs * 0.28);
      }
      for (let k = 24; k >= 0; k--) {
        const a = Math.PI * (k / 24) - Math.PI;
        g.lineTo(nx + Math.cos(a) * hs * 0.9, ny + hs * 0.42 - Math.sin(a) * hs * 0.12);
      }
      g.fill();
    }
    g.strokeStyle = "rgba(120,110,95,0.6)";
    g.lineWidth = 0.6;
    for (let k = 0; k < 12; k++) {
      const a = Math.PI * (k / 12) - Math.PI;
      g.beginPath();
      g.moveTo(nx + Math.cos(a) * hs * 0.3, ny + hs * 0.34);
      g.lineTo(nx + Math.cos(a) * hs * 0.8, ny + hs * 0.2 + Math.sin(a) * hs * 0.2);
      g.stroke();
    }
    for (let k = 0; k < 15; k++) {
      const u = k / 14;
      const px = nx + (u - 0.5) * hs * 1.1, py = ny + hs * 0.55 + Math.sin(u * Math.PI) * hs * 0.28;
      const pg = g.createRadialGradient(px - 1, py - 1, 0.3, px, py, hs * 0.05);
      pg.addColorStop(0, "#ffffff");
      pg.addColorStop(1, "#bdb3a2");
      g.fillStyle = pg;
      g.beginPath();
      g.arc(px, py, hs * 0.045, 0, TAU);
      g.fill();
    }
  } else if (kind === "admiral") {
    // navy coat with gold epaulettes, a bicorne hat
    const cg = g.createLinearGradient(nx - hs, 0, nx + hs, 0);
    cg.addColorStop(0, "#0e1426");
    cg.addColorStop(0.5, "#24305a");
    cg.addColorStop(1, "#0a0f1e");
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(nx - hs * 1.6, ny + hs * 2.2);
    g.quadraticCurveTo(nx - hs * 1.4, ny + hs * 0.35, nx - hs * 0.35, ny + hs * 0.28);
    g.lineTo(nx, ny + hs * 0.9);
    g.lineTo(nx + hs * 0.35, ny + hs * 0.28);
    g.quadraticCurveTo(nx + hs * 1.4, ny + hs * 0.35, nx + hs * 1.6, ny + hs * 2.2);
    g.fill();
    g.fillStyle = "#c9a040";
    for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(nx + (k % 2 ? 1 : -1) * hs * 0.25, ny + hs * (1.05 + Math.floor(k / 2) * 0.35), hs * 0.045, 0, TAU); g.fill(); }
    for (const sd of [-1, 1]) {
      const ex = nx + sd * hs * 1.05, ey = ny + hs * 0.5;
      const eg = g.createRadialGradient(ex - sd * 3, ey - 3, 1, ex, ey, hs * 0.38);
      eg.addColorStop(0, "#fff0a8");
      eg.addColorStop(0.5, "#c9962e");
      eg.addColorStop(1, "#5a3a0a");
      g.fillStyle = eg;
      g.beginPath();
      g.ellipse(ex, ey, hs * 0.38, hs * 0.14, sd * 0.25, 0, TAU);
      g.fill();
      g.strokeStyle = "#e0b850";
      g.lineWidth = 0.8;
      for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(ex + (k - 3) * hs * 0.1, ey + hs * 0.1); g.lineTo(ex + (k - 3) * hs * 0.11, ey + hs * 0.3); g.stroke(); }
    }
    const hg = g.createLinearGradient(0, hy - hs * 1.1, 0, hy - hs * 0.45);
    hg.addColorStop(0, "#1a1a22");
    hg.addColorStop(1, "#05050a");
    g.fillStyle = hg;
    g.beginPath();
    g.moveTo(hx - hs * 1.05, hy - hs * 0.45);
    g.quadraticCurveTo(hx, hy - hs * 1.45, hx + hs * 1.05, hy - hs * 0.45);
    g.quadraticCurveTo(hx, hy - hs * 0.68, hx - hs * 1.05, hy - hs * 0.45);
    g.fill();
    g.strokeStyle = "#b8902e";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(hx - hs * 1.0, hy - hs * 0.48);
    g.quadraticCurveTo(hx, hy - hs * 0.66, hx + hs * 1.0, hy - hs * 0.48);
    g.stroke();
    g.fillStyle = "#c9a040";
    g.beginPath();
    g.arc(hx + hs * 0.1, hy - hs * 0.78, hs * 0.08, 0, TAU);
    g.fill();
  } else if (kind === "lord") {
    // top hat + monocle chain
    const hg = g.createLinearGradient(hx - hs * 0.5, 0, hx + hs * 0.5, 0);
    hg.addColorStop(0, "#08080a");
    hg.addColorStop(0.45, "#33302e");
    hg.addColorStop(1, "#060607");
    g.fillStyle = hg;
    g.fillRect(hx - hs * 0.42, hy - hs * 1.65, hs * 0.84, hs * 1.0);
    g.beginPath();
    g.ellipse(hx, hy - hs * 0.66, hs * 0.75, hs * 0.13, 0, 0, TAU);
    g.fill();
    g.fillStyle = "#5a1a1a";
    g.fillRect(hx - hs * 0.42, hy - hs * 0.9, hs * 0.84, hs * 0.14);
    g.strokeStyle = "#d8b24a";
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(hx + hs * 0.2, hy - hs * 0.08, hs * 0.16, 0, TAU);
    g.stroke();
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(hx + hs * 0.34, hy);
    g.quadraticCurveTo(hx + hs * 0.6, hy + hs * 0.7, hx + hs * 0.2, hy + hs * 1.1);
    g.stroke();
    // cravat
    g.fillStyle = "#e8e2d4";
    g.beginPath();
    g.moveTo(nx - hs * 0.3, ny + hs * 0.3);
    g.quadraticCurveTo(nx, ny + hs * 0.6, nx + hs * 0.3, ny + hs * 0.3);
    g.lineTo(nx + hs * 0.12, ny + hs * 0.95);
    g.lineTo(nx - hs * 0.12, ny + hs * 0.95);
    g.fill();
  } else if (kind === "lady") {
    // tiara + shawl
    g.fillStyle = "#3a5a8a";
    g.beginPath();
    g.moveTo(nx - hs * 1.6, ny + hs * 2.2);
    g.quadraticCurveTo(nx - hs * 1.2, ny + hs * 0.3, nx, ny + hs * 0.55);
    g.quadraticCurveTo(nx + hs * 1.2, ny + hs * 0.3, nx + hs * 1.6, ny + hs * 2.2);
    g.fill();
    g.strokeStyle = "rgba(200,220,255,0.35)";
    g.lineWidth = 1;
    for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(nx - hs * 1.3 + k * hs * 0.5, ny + hs * 0.9); g.quadraticCurveTo(nx - hs + k * hs * 0.45, ny + hs * 1.5, nx - hs * 1.4 + k * hs * 0.55, ny + hs * 2.2); g.stroke(); }
    g.fillStyle = "#e8e4f0";
    g.beginPath();
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      g.lineTo(hx + (u - 0.5) * hs * 0.9, hy - hs * 0.62 - (k % 2 ? hs * 0.1 : hs * 0.22) * Math.sin(u * Math.PI));
    }
    g.lineTo(hx + hs * 0.45, hy - hs * 0.55);
    g.lineTo(hx - hs * 0.45, hy - hs * 0.55);
    g.fill();
    g.fillStyle = "#7ad0ff";
    g.beginPath();
    g.arc(hx, hy - hs * 0.78, hs * 0.06, 0, TAU);
    g.fill();
  }
}
// the cat inside a painting: where to put it so the bust fills a w x h canvas
function portraitCat(g, kind, w, h, t, gaze, alpha, turnAdd = 0, pupil = 0.14) {
  const P = PORTRAITS[kind];
  const S = h * 0.7;
  const x = w * 0.5 - P.facing * S * 0.12, y = h * 0.62 + S * 1.12;
  K.drawCat(g, x, y, S, {
    pose: "sit", facing: P.facing, headTurn: P.turn + turnAdd, t, coat: P.coat, collar: false, bell: false, shadow: false,
    gaze, pupil, light: { x: P.facing > 0 ? -w : w * 2, y: -h * 0.5, color: "#ffe2b0", strength: 0.7 }, alpha,
  });
  const hx = x + P.facing * S * 0.2, hy = y - S * 1.5;
  costume(g, kind, hx, hy, S * 0.3, x + P.facing * S * 0.17, y - S * 1.2);
}
function oilFinish(s, w, h, seed) {
  const R = K.rng("oil" + seed);
  // brush texture
  for (let i = 0; i < 220; i++) {
    const x = R() * w, y = R() * h, l = 4 + R() * 10, a = R() * TAU;
    s.strokeStyle = R() > 0.5 ? "rgba(255,240,210,0.05)" : "rgba(0,0,0,0.07)";
    s.lineWidth = 1 + R() * 2;
    s.beginPath();
    s.moveTo(x, y);
    s.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    s.stroke();
  }
  // yellowed varnish
  s.globalCompositeOperation = "multiply";
  s.fillStyle = "rgba(214,176,112,0.55)";
  s.fillRect(0, 0, w, h);
  s.globalCompositeOperation = "source-over";
  // craquelure
  s.strokeStyle = "rgba(20,10,0,0.18)";
  s.lineWidth = 0.5;
  for (let i = 0; i < 26; i++) {
    let x = R() * w, y = R() * h;
    s.beginPath();
    s.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 22; y += (R() - 0.5) * 22; s.lineTo(x, y); }
    s.stroke();
  }
  const vg = s.createRadialGradient(w * 0.45, h * 0.4, h * 0.15, w / 2, h / 2, h * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(10,4,0,0.6)");
  s.fillStyle = vg;
  s.fillRect(0, 0, w, h);
}
function portraitBg(s, kind, w, h) {
  const P = PORTRAITS[kind];
  const bg = s.createRadialGradient(w * 0.35, h * 0.3, 4, w * 0.5, h * 0.5, h * 0.9);
  bg.addColorStop(0, P.bg2);
  bg.addColorStop(1, P.bg);
  s.fillStyle = bg;
  s.fillRect(0, 0, w, h);
  // a painted curtain fold + column, for depth
  s.fillStyle = rgba(shade(P.bg, -0.4), 0.6);
  s.beginPath();
  s.moveTo(w, 0);
  s.quadraticCurveTo(w * 0.78, h * 0.3, w * 0.86, h);
  s.lineTo(w, h);
  s.fill();
}
// painted at 2x the requested size (the dolly brings the near portraits very close to the lens), so
// the strips sampled for the perspective walls stay crisp; drawImage callers pass explicit sizes
function portraitSprite(kind, w, h) {
  return own("f06portrait2:" + kind, w * 2, h * 2, (s) => {
    s.scale(2, 2);
    portraitBg(s, kind, w, h);
    portraitCat(s, kind, w, h, 0, 0, 1);
    oilFinish(s, w, h, kind);
  });
}
// gilt frame around a rect (flat to camera). The moulding is baked once: four mitred sides, each with a
// real cross-section (outer bead, cove, raised torus with a bead-and-reel, flat, a dark sight edge),
// shaded for a light from the upper left (top brightest, bottom darkest), water-gilt texture with the
// red bole showing through where it is worn. The per-frame part (glint) is giltSpecular().
const GILT_PROFILE = [[0, 0.35], [0.1, 0.95], [0.2, 0.45], [0.32, 0.18], [0.46, 0.55], [0.56, 1.0], [0.66, 0.6], [0.78, 0.4], [0.9, 0.5], [0.96, 0.12], [1, 0.05]];
function giltSprite(w, h, b) {
  const W2 = w + b * 2, H2 = h + b * 2;
  return own("f06gilt" + w + "x" + h + "x" + b, W2, H2, (s) => {
    const sides = [
      // [polygon (outer edge first, then inner), gradient from outer to inner, light factor]
      [[[0, 0], [W2, 0], [W2 - b, b], [b, b]], [0, 0, 0, b], 1.0],
      [[[0, 0], [b, b], [b, H2 - b], [0, H2]], [0, 0, b, 0], 0.8],
      [[[W2, 0], [W2, H2], [W2 - b, H2 - b], [W2 - b, b]], [W2, 0, W2 - b, 0], 0.5],
      [[[0, H2], [b, H2 - b], [W2 - b, H2 - b], [W2, H2]], [0, H2, 0, H2 - b], 0.36],
    ];
    for (const [poly, gv, k] of sides) {
      const gr = s.createLinearGradient(gv[0], gv[1], gv[2], gv[3]);
      for (const [u, v] of GILT_PROFILE) {
        const l = v * k;
        gr.addColorStop(u, `rgb(${Math.round(40 + 215 * Math.min(1, l * 1.05))},${Math.round(24 + 180 * l)},${Math.round(6 + 90 * l * l)})`);
      }
      s.fillStyle = gr;
      s.beginPath();
      poly.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
      s.closePath();
      s.fill();
      // the mitre joint: a hairline
      s.strokeStyle = "rgba(30,14,0,0.35)";
      s.lineWidth = 0.6;
      s.beginPath(); s.moveTo(poly[0][0], poly[0][1]); s.lineTo(poly[poly.length - 1][0], poly[poly.length - 1][1]); s.stroke();
    }
    // bead-and-reel on the torus (a row of small lit beads with their shadows)
    const tor = b * 0.44;
    const beads = (x0, y0, x1, y1, k) => {
      const n = Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0) / 5));
      for (let i = 0; i <= n; i++) {
        const x = lerp(x0, x1, i / n), y = lerp(y0, y1, i / n);
        s.fillStyle = rgba("#1e0e02", 0.35);
        s.beginPath(); s.arc(x + 0.6, y + 0.7, b * 0.07, 0, TAU); s.fill();
        s.fillStyle = rgba(mix("#6a4a14", "#ffe8a0", k), 0.9);
        s.beginPath(); s.arc(x, y, b * 0.065, 0, TAU); s.fill();
      }
    };
    beads(tor, tor, W2 - tor, tor, 1);
    beads(tor, tor, tor, H2 - tor, 0.8);
    beads(W2 - tor, tor, W2 - tor, H2 - tor, 0.45);
    beads(tor, H2 - tor, W2 - tor, H2 - tor, 0.3);
    // water gilding: fine metallic texture, then the red bole showing through where it is worn
    s.save();
    s.beginPath();
    s.rect(0, 0, W2, H2);
    s.rect(W2 - b, b, -(w), h);
    s.clip("evenodd");
    K.texRect(s, "metal", 0, 0, W2, H2, { scale: 70, mode: "soft-light", alpha: 0.55, tex: { seed: 81 } });
    K.texRect(s, "noise", 0, 0, W2, H2, { scale: 90, mode: "multiply", alpha: 0.25, tex: { seed: 82 } });
    const R = K.rng("gilt" + w);
    for (let i = 0; i < 14; i++) {
      const u = R(), side = Math.floor(R() * 4);
      const x = side < 2 ? u * W2 : side === 2 ? b * 0.5 : W2 - b * 0.5, y = side < 2 ? (side ? H2 - b * 0.4 : b * 0.4) : u * H2;
      s.fillStyle = rgba("#7a2a12", 0.25 + R() * 0.25);
      s.beginPath(); s.ellipse(x, y, 1.5 + R() * 4, 1 + R() * 2, R() * 3, 0, TAU); s.fill();
    }
    // dust settled on the top side's upper surfaces
    s.fillStyle = "rgba(120,110,90,0.12)";
    s.fillRect(b * 0.1, b * 0.05, W2 - b * 0.2, b * 0.25);
    s.restore();
    // the sight edge: a dark gap where the canvas sits back
    s.strokeStyle = "rgba(10,4,0,0.85)";
    s.lineWidth = 1.6;
    s.strokeRect(b - 0.8, b - 0.8, w + 1.6, h + 1.6);
  });
}
function giltFrame(g, x, y, w, h, b, glint = 0) {
  g.drawImage(giltSprite(w, h, b), x - b, y - b, w + b * 2, h + b * 2);
  if (glint > 0) glow(g, x - b * 0.5 + w * 0.15, y - b * 0.5, b * 3, "#fff0c0", glint);
}
// per-frame (after the light map): the gilding's specular from the nearest flame, tracking its flicker
// (a hot streak on the torus of the side that faces the flame, catching the top rail too), and the
// flame's own reflection in the varnished painting: a small soft image of the candle, mirrored.
function giltSpecular(g, x, y, w, h, b, fx, fy, k) {
  const sd = Math.sign(fx - (x + w / 2)) || 1;
  const tx = sd > 0 ? x + w + b * 0.44 : x - b * 0.44;
  const cy = clamp(fy, y + 10, y + h - 10);
  g.save();
  g.globalCompositeOperation = "lighter";
  g.translate(tx, cy);
  g.scale(1, 5.5);
  glow(g, 0, 0, b * 1.2, "#ffd890", 0.32 * k);
  g.restore();
  g.save();
  g.globalCompositeOperation = "lighter";
  g.translate(x + w / 2 + sd * w * 0.36, y - b * 0.56);
  g.scale(4, 0.5);
  glow(g, 0, 0, b * 1.4, "#ffd890", 0.24 * k);
  g.restore();
  // varnish: the flame mirrored in the picture plane (soft sheen + a tiny bright image)
  const rx = x + w / 2 + sd * w * 0.3, ry = cy - 8;
  g.save();
  g.globalCompositeOperation = "screen";
  g.translate(rx, ry);
  g.scale(0.55, 1.2);
  glow(g, 0, 0, w * 0.28, "#c89860", 0.12 * k, "screen");
  g.restore();
  glow(g, rx, ry, 3.2, "#fff2d0", 0.55 * k);
}
// ---- 3D helper for the hallway and the staircase ---------------------------------------------------
function proj(cam) {
  return (X, Y, Z) => {
    const z = Math.max(0.05, Z - cam.z);
    return [cam.cx + (X - cam.x) * cam.f / z, cam.cy + (Y - cam.y) * cam.f / z, cam.f / z];
  };
}
function quad(g, P, pts) {
  g.beginPath();
  pts.forEach((p, i) => { const s = P(p[0], p[1], p[2]); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); });
  g.closePath();
}

// ---- SHOT 1: the long candlelit hallway --------------------------------------------------------------
const HALL = { x0: -2, x1: 2, floor: 1.5, ceil: -2.3, end: 17 };
const LEFT_PORTRAITS = [[2.4, "duchess"], [5.6, "lord"], [8.8, "lady"], [12.0, "admiral"], [14.8, "duchess"]];
const RIGHT_ITEMS = [[2.4, "lady"], [5.2, "window"], [8.6, "admiral"], [11.0, "window"], [14.4, "lord"]];
const SCONCES = [4.1, 7.3, 10.4, 13.4, 16.0];
const STANDS = [[-1, 4.7], [1, 3.9], [-1, 10.9], [1, 7.6], [-1, 14.0], [1, 13.0]];

// a floor-standing three-candle candelabra against a wall: a turned brass column (a real tube 3-6 px
// wide with a hot specular stripe on the side toward the hall's flames), three turned knops, curved
// arms with drip pans, a domed foot. Lit later by the light map like everything else.
function brassTube(g, x, y0, y1, w, hs) {
  const spr = own("f06tube" + hs, 32, 4, (s) => {
    const sg = s.createLinearGradient(0, 0, 32, 0);
    sg.addColorStop(0, "#160c04");
    sg.addColorStop(0.2, "#5a3e16");
    sg.addColorStop(hs - 0.1, "#b08a40");
    sg.addColorStop(hs, "#fff2c8");
    sg.addColorStop(hs + 0.09, "#b08a40");
    sg.addColorStop(0.86, "#3a2610");
    sg.addColorStop(1, "#120a04");
    s.fillStyle = sg;
    s.fillRect(0, 0, 32, 4);
  });
  g.drawImage(spr, x - w / 2, y0, w, y1 - y0);
}
function brassKnop(g, x, y, rx, ry, hs) {
  const spr = own("f06knop" + hs, 64, 32, (s) => {
    const kg = s.createLinearGradient(0, 0, 64, 0);
    kg.addColorStop(0, "#1a0e04");
    kg.addColorStop(clamp(hs - 0.12, 0.05, 0.9), "#9a7434");
    kg.addColorStop(hs, "#fff0c0");
    kg.addColorStop(clamp(hs + 0.14, 0.1, 0.95), "#8a6428");
    kg.addColorStop(1, "#160c04");
    s.fillStyle = kg;
    s.beginPath();
    s.ellipse(32, 16, 32, 16, 0, 0, TAU);
    s.fill();
    // the lower half of a turned knop faces the floor: darker
    s.fillStyle = "rgba(10,5,0,0.45)";
    s.beginPath();
    s.ellipse(32, 16 + 4, 31, 12, 0, 0, Math.PI);
    s.fill();
  });
  g.drawImage(spr, x - rx, y - ry, rx * 2, ry * 2);
}
function candelabra(g, P, side, z, camZ, t) {
  if (z < camZ + 0.45) return;
  const X = side * 1.72;
  const foot = P(X, HALL.floor, z), top = P(X, 0.15, z);
  const s = top[2], x = top[0];
  K.shadowBlob(g, foot[0], foot[1], s * 0.16, s * 0.04, { alpha: 0.75 });
  const w = clamp(s * 0.045, 3, 6.5);
  const hs = side < 0 ? 0.66 : 0.34;
  brassTube(g, x, top[1], foot[1] - s * 0.05, w, hs);
  // domed foot on three little feet (a cached sprite per side: the hot spot faces the hall)
  const fs = own("f06foot" + side, 64, 32, (c) => {
    const fg = c.createRadialGradient(32 - side * 8, 32 - 13, 0, 32, 32 - 8, 34);
    fg.addColorStop(0, "#f0d088");
    fg.addColorStop(0.35, "#9a7434");
    fg.addColorStop(1, "#1e1206");
    c.fillStyle = fg;
    c.beginPath(); c.ellipse(32, 32 - 3, 32, 8.5, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(32, 32 - 10.7, 16, 12, 0, Math.PI, TAU); c.fill();
  });
  g.drawImage(fs, foot[0] - s * 0.12, foot[1] - s * 0.12, s * 0.24, s * 0.12);
  // turned knops up the column
  for (const [u, k] of [[0.12, 1.0], [0.48, 1.25], [0.86, 0.9]]) {
    const yy = lerp(foot[1] - s * 0.06, top[1], u);
    brassKnop(g, x, yy, w * 1.05 * k, Math.max(1.2, w * 0.42 * k), hs);
  }
  // arms: a brass tube bent up to two drip pans (stroked twice: the body, then its hot top edge)
  const arm = () => { g.beginPath(); g.moveTo(x - s * 0.22, top[1] - s * 0.05); g.quadraticCurveTo(x, top[1] + s * 0.13, x + s * 0.22, top[1] - s * 0.05); };
  g.lineCap = "round";
  arm(); g.strokeStyle = "#5a3e16"; g.lineWidth = Math.max(1.5, w * 0.6); g.stroke();
  g.save(); g.translate(0, -Math.max(0.5, w * 0.15)); arm(); g.strokeStyle = "rgba(255,226,150,0.55)"; g.lineWidth = Math.max(0.6, w * 0.18); g.stroke(); g.restore();
  for (const dx of [-0.22, 0, 0.22]) {
    const cx = x + dx * s, cy = top[1] - s * (dx ? 0.05 : 0.12);
    brassKnop(g, cx, cy + s * 0.005, s * 0.05, Math.max(1, s * 0.012), hs);
    candle(g, cx, cy, s * 0.2, t, z * 7 + dx * 10 + side, 1, 0.7);
  }
}

function wallPortrait(g, P, side, z0, kind, camZ, t) {
  const len = 1.0, y0 = -1.45, y1 = -0.15, X = side * 1.99;
  if (z0 + len < camZ + 0.3) return;
  const spr = portraitSprite(kind, 166, 214);
  // strips: as many as the perspective needs (one per ~14 px of projected width), never more than 16
  const pw = Math.abs(P(X, y0, Math.max(z0, camZ + 0.25))[0] - P(X, y0, z0 + len)[0]);
  const n = clamp(Math.ceil(pw / 14), 2, 16);
  // the frame's shadow on the wall (lit from the sconce beside it: thrown away from it, soft)
  const b = 0.09;
  g.save();
  g.globalAlpha *= 0.55;
  quad(g, P, [[X, y0 - b + 0.06, z0 - b + 0.08], [X, y0 - b + 0.06, z0 + len + b + 0.08], [X, y1 + b + 0.1, z0 + len + b + 0.08], [X, y1 + b + 0.1, z0 - b + 0.08]]);
  g.fillStyle = "#050204";
  g.fill();
  g.restore();
  // gilt frame (a slightly bigger quad), a darker inner bevel
  quad(g, P, [[X, y0 - b, z0 - b], [X, y0 - b, z0 + len + b], [X, y1 + b, z0 + len + b], [X, y1 + b, z0 - b]]);
  const a = P(X, y0, z0), c = P(X, y0, z0 + len);
  const fg = g.createLinearGradient(a[0], 0, c[0], 0);
  fg.addColorStop(0, "#b8893a");
  fg.addColorStop(0.5, "#7a5420");
  fg.addColorStop(1, "#4a3010");
  g.fillStyle = fg;
  g.fill();
  // each strip is mapped with an affine skew onto its slice of the wall, so the top and bottom
  // edges follow the perspective lines (no stair-stepping) and the image never tears between strips
  const sw = spr.width / n, sh = spr.height;
  for (let i = 0; i < n; i++) {
    const za = z0 + (len * i) / n, zb = z0 + (len * (i + 1)) / n;
    if (za < camZ + 0.25) continue;
    const u = side < 0 ? i / n : 1 - (i + 1) / n;
    const zl = side < 0 ? za : zb, zr = side < 0 ? zb : za;
    const o = P(X, y0, zl), r = P(X, y0, zr), d = P(X, y1, zl);
    g.save();
    g.transform((r[0] - o[0]) / sw, (r[1] - o[1]) / sw, (d[0] - o[0]) / sh, (d[1] - o[1]) / sh, o[0], o[1]);
    g.drawImage(spr, u * spr.width, 0, sw, sh, 0, 0, sw * 1.2, sh);
    g.restore();
  }
}
// The right-hand windows: a deep reveal in a thick wall (head soffit, far jamb and sill all visible
// in perspective), old glass recessed at X = WIN.glass showing a moonlit night (a desaturated
// gradient, the moon's glow, bare branches, a far roofline, mottled crown glass), glazing bars and a
// bevelled mullion + transom standing in front of it.
const WIN = { len: 1.4, y0: -1.95, y1: 0.35, ym: -0.8, glass: 2.24 };
function nightSprite() {
  return own("f06night", 140, 230, (s) => {
    const gr = s.createLinearGradient(0, 0, 0, 230);
    gr.addColorStop(0, "#a4aedc");
    gr.addColorStop(0.45, "#8e9cd8");
    gr.addColorStop(1, "#4a5584");
    s.fillStyle = gr;
    s.fillRect(0, 0, 140, 230);
    const mg = s.createRadialGradient(118, 18, 2, 118, 18, 110);
    mg.addColorStop(0, "rgba(255,255,255,0.6)");
    mg.addColorStop(0.25, "rgba(220,228,255,0.22)");
    mg.addColorStop(1, "rgba(220,228,255,0)");
    s.fillStyle = mg;
    s.fillRect(0, 0, 140, 230);
    // far roofline + treeline, low contrast (they are 30 m away, through haze)
    s.fillStyle = "rgba(40,46,80,0.75)";
    s.beginPath();
    s.moveTo(0, 230);
    for (let x = 0; x <= 140; x += 4) s.lineTo(x, 196 - K.fbm(x * 0.04, 3) * 18 - (x > 60 && x < 100 ? 16 : 0));
    s.lineTo(140, 230);
    s.fill();
    // bare branches reaching in from the left
    const R = K.rng("branch");
    const br = (x, y, a, l, w, d) => {
      if (d > 5 || w < 0.3) return;
      const x1 = x + Math.cos(a) * l, y1 = y + Math.sin(a) * l;
      s.strokeStyle = "rgba(40,46,80,0.55)";
      s.lineWidth = w;
      s.beginPath(); s.moveTo(x, y); s.quadraticCurveTo((x + x1) / 2 + (R() - 0.5) * l * 0.3, (y + y1) / 2 + (R() - 0.5) * l * 0.3, x1, y1); s.stroke();
      br(x1, y1, a + (R() - 0.5) * 0.9 - 0.25, l * 0.7, w * 0.62, d + 1);
      br(x1, y1, a + (R() - 0.5) * 0.9 + 0.35, l * 0.6, w * 0.55, d + 1);
    };
    br(-4, 150, -0.55, 46, 4.5, 0);
    br(-4, 60, -0.1, 34, 3, 1);
    // old crown glass: a mottled, slightly wavy surface (cached noise) + frost creeping in at the bottom
    K.texRect(s, "noise", 0, 0, 140, 230, { scale: 46, mode: "overlay", alpha: 0.5, tex: { seed: 19 } });
    K.texRect(s, "glassdrops", 0, 0, 140, 230, { scale: 90, mode: "screen", alpha: 0.12, tex: { seed: 21 } });
    const fr = s.createLinearGradient(0, 230, 0, 150);
    fr.addColorStop(0, "rgba(220,230,255,0.35)");
    fr.addColorStop(1, "rgba(220,230,255,0)");
    s.fillStyle = fr;
    s.fillRect(0, 150, 140, 80);
  });
}
// map a sprite onto a rect of the plane X (y0..y1, z0..z1) in strips (exact on the strip edges)
function planeImage(g, P, spr, X, y0, y1, z0, z1, camZ, n = 10, flip = false) {
  const sw = spr.width / n, sh = spr.height;
  for (let i = 0; i < n; i++) {
    const za = z0 + ((z1 - z0) * i) / n, zb = z0 + ((z1 - z0) * (i + 1)) / n;
    if (za < camZ + 0.25) continue;
    const u = flip ? 1 - (i + 1) / n : i / n;
    const zl = flip ? zb : za, zr = flip ? za : zb;
    const o = P(X, y0, zl), r = P(X, y0, zr), d = P(X, y1, zl);
    g.save();
    g.transform((r[0] - o[0]) / sw, (r[1] - o[1]) / sw, (d[0] - o[0]) / sh, (d[1] - o[1]) / sh, o[0], o[1]);
    g.drawImage(spr, u * spr.width, 0, sw, sh, 0, 0, sw * 1.08, sh);
    g.restore();
  }
}
function wallWindow(g, P, z0, camZ, t) {
  const { len, y0, y1, ym, glass: XG } = WIN, X = 1.99;
  if (z0 + len < camZ + 0.3) return;
  const z1 = z0 + len;
  // glass first (it is furthest), then the reveal faces that hide its edges
  quad(g, P, [[XG, y0, z0], [XG, y0, z1], [XG, y1, z1], [XG, y1, z0]]);
  g.fillStyle = "#6a76b0";
  g.fill();
  planeImage(g, P, nightSprite(), XG, y0, y1, z0, z1, camZ, 8, true);
  // glazing bars (lead cames) in the glass plane
  g.strokeStyle = "rgba(16,12,22,0.75)";
  g.lineWidth = Math.max(0.5, P(XG, 0, z0 + len / 2)[2] * 0.008);
  g.beginPath();
  for (let k = 1; k < 6; k++) { if (k === 3) continue; const z = z0 + (len * k) / 6; const a = P(XG, y0, z), b = P(XG, y1, z); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
  for (let k = 1; k < 7; k++) { const y = lerp(y0, y1, k / 7); const a = P(XG, y, z0), b = P(XG, y, z1); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
  g.stroke();
  // mullion + transom: square timber bars just inside the glass, each with a lit bevel and a dark side
  const bar = (pts, face, lit) => {
    quad(g, P, pts);
    g.fillStyle = face;
    g.fill();
    if (lit) {
      const a = P(...pts[0]), b = P(...pts[1]);
      g.strokeStyle = lit;
      g.lineWidth = Math.max(0.6, a[2] * 0.01);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
  };
  const zm = z0 + len / 2, bw = 0.035, XB = XG - 0.06;
  bar([[XB, y0, zm - bw], [XB, y1, zm - bw], [XG, y1, zm - bw], [XG, y0, zm - bw]], "#3a2a2a", null);
  bar([[XB, y0, zm - bw], [XB, y1, zm - bw], [XB, y1, zm + bw], [XB, y0, zm + bw]], "#1e1418", "rgba(255,190,130,0.5)");
  bar([[XB, ym - bw, z0], [XB, ym - bw, z1], [XB, ym + bw, z1], [XB, ym + bw, z0]], "#1e1418", "rgba(255,190,130,0.45)");
  bar([[XB, ym + bw, z0], [XB, ym + bw, z1], [XG, ym + bw, z1], [XG, ym + bw, z0]], "#2c2024", null);
  // the reveal: head soffit (in shadow), far jamb (lit cool by the moon), sill (moonlight on top)
  quad(g, P, [[X, y0, z0], [XG, y0, z0], [XG, y0, z1], [X, y0, z1]]);
  g.fillStyle = "#2a2028";
  g.fill();
  // far jamb: plaster, brightest next to the glass (bounce off it), falling off toward the room,
  // with the occlusion of the head soffit along its top
  quad(g, P, [[X, y0, z1], [XG, y0, z1], [XG, y1, z1], [X, y1, z1]]);
  {
    const ja = P(XG, (y0 + y1) / 2, z1), jb = P(X, (y0 + y1) / 2, z1);
    const jg = g.createLinearGradient(ja[0], 0, jb[0], 0);
    jg.addColorStop(0, "#4a4250");
    jg.addColorStop(1, "#241c22");
    g.fillStyle = jg;
    g.fill();
    g.save();
    g.clip();
    if (0) K.texRect(g, "plaster", Math.min(ja[0], jb[0]) - 2, P(X, y0, z1)[1], Math.abs(ja[0] - jb[0]) + 4, P(X, y1, z1)[1] - P(X, y0, z1)[1], { scale: 60, mode: "soft-light", alpha: 0.6, tex: MAT.plaster[1] });
    const ht = P(X, y0, z1)[1], hg = g.createLinearGradient(0, ht, 0, ht + ja[2] * 0.25);
    hg.addColorStop(0, "rgba(0,0,0,0.6)");
    hg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = hg;
    g.fillRect(Math.min(ja[0], jb[0]) - 2, ht, Math.abs(ja[0] - jb[0]) + 4, ja[2] * 0.25);
    g.restore();
  }
  quad(g, P, [[X - 0.04, y1, z0 - 0.05], [XG, y1, z0], [XG, y1, z1], [X - 0.04, y1, z1 + 0.05]]);
  g.fillStyle = "#5a4a48";
  g.fill();
  // moulded architrave round the opening, flat on the wall
  quad(g, P, [[X, y0 - 0.04, z0 - 0.04], [X, y0 - 0.04, z1 + 0.04], [X, y1 + 0.04, z1 + 0.04], [X, y1 + 0.04, z0 - 0.04]]);
  g.strokeStyle = "rgba(20,10,10,0.8)";
  g.lineWidth = Math.max(1, P(X, 0, z0)[2] * 0.03);
  g.stroke();
}
// the moon is high on the right: light through the right-hand windows lands LEFT of the runner,
// skewed toward the far end of the hall. Each pane lands as its own quad (mullion + transom shadows).
const moonLand = (Y, Z) => { const k = HALL.floor - Y; return [1.69 - 1.05 * k, HALL.floor, Z + 0.4 * k]; };
// six nested quads per pane = a real penumbra (the window is big, the moon is not a point)
const PEN = [[0.3, 0.04], [0.2, 0.06], [0.13, 0.08], [0.08, 0.1], [0.04, 0.12], [0.01, 0.14]];
function moonPanes(c, P, z0, fillFor) {
  const { len, y0, y1, ym } = WIN;
  for (const [ya, yb] of [[y0 + 0.03, ym - 0.04], [ym + 0.04, y1 - 0.03]]) {
    for (const [za, zb] of [[z0 + 0.03, z0 + len / 2 - 0.04], [z0 + len / 2 + 0.04, z0 + len - 0.03]]) {
      for (const [e, a] of PEN) {
        c.fillStyle = fillFor(a);
        quad(c, P, [moonLand(yb, za - e), moonLand(yb, zb + e), moonLand(ya - e, zb + e), moonLand(ya - e, za - e)]);
        c.fill();
      }
    }
  }
}
function moonPatch(lg, P, z0, camZ, strength = 1) {
  if (z0 + WIN.len < camZ + 0.4) return;
  moonPanes(lg, P, z0, (a) => rgba("#dde3ff", a * strength));
}
// the volumetric shaft from each window to its patch: thin fbm density (cached noise drifting with t),
// dust motes only inside the beam (emissive, after the light map)
function moonBeam(g, P, z0, camZ, t, strength = 1) {
  const { len, y0, y1 } = WIN;
  if (z0 + len < camZ + 0.4) return;
  // the shaft as seen from the camera = the convex hull of the window aperture and its floor patch;
  // drawn as nested hulls shrunk toward the core so its edges are soft and the core densest
  const z1 = z0 + len, ins = 0.12;
  const pts = [[WIN.glass, y0 + ins, z0 + ins], [WIN.glass, y0 + ins, z1 - ins], [WIN.glass, y1 - ins, z1 - ins], [WIN.glass, y1 - ins, z0 + ins],
    moonLand(y0 + ins, z0 + ins), moonLand(y0 + ins, z1 - ins), moonLand(y1 - ins, z1 - ins), moonLand(y1 - ins, z0 + ins)].map((q) => P(...q));
  const hull = convexHull(pts);
  let cx = 0, cy = 0;
  for (const q of hull) { cx += q[0]; cy += q[1]; }
  cx /= hull.length; cy /= hull.length;
  const s0 = P(1.99, y0, z0 + len * 0.5), s1 = P(...moonLand(lerp(y0, y1, 0.5), z0 + len * 0.5));
  const vg = g.createLinearGradient(s0[0], s0[1], s1[0], s1[1]);
  vg.addColorStop(0, rgba("#b4c0f0", 0.03 * strength));
  vg.addColorStop(1, rgba("#b4c0f0", 0.008 * strength));
  const pat = K.texPattern(g, "cloud", { seed: 31 });
  const sc = Math.max(0.2, s1[2] / 200);
  patXf(pat, sc * 1.6, sc * 0.6, 0, sc * 1.6, t * 6 + z0 * 40, -t * 3);
  g.save();
  g.globalCompositeOperation = "lighter";
  for (const k of [1.12, 0.92, 0.72, 0.5]) {
    g.beginPath();
    hull.forEach((q, i) => { const x = cx + (q[0] - cx) * k, y = cy + (q[1] - cy) * k; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.closePath();
    g.globalAlpha = 1;
    g.fillStyle = vg;
    g.fill();
    // fbm density: the air is not uniformly dusty
    g.globalAlpha = 0.022 * strength;
    g.fillStyle = pat;
    g.fill();
  }
  g.restore();
  const R = K.rng("beam" + z0);
  for (let i = 0; i < 30; i++) {
    const u = R(), v = R(), w = R(), ph = R();
    const Y = lerp(y0, y1, v) + ((t * 0.03 + ph) % 1) * 0.12;
    const L = moonLand(Y, z0 + w * len);
    const X = lerp(1.99, L[0], u) + noise(t * 0.2 + i, 3) * 0.05;
    const Yy = lerp(Y, HALL.floor, u), Z = lerp(z0 + w * len, L[2], u);
    if (Z < camZ + 0.3) continue;
    const s = P(X, Yy, Z);
    glow(g, s[0], s[1], Math.max(1.2, s[2] * 0.01), "#e4e8ff", 0.4 * strength * (0.35 + 0.65 * Math.abs(Math.sin(t * 0.7 + i))));
  }
}
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// ambient occlusion along a seam in a 3D plane: bands of falling alpha (exact in perspective)
function aoBands(g, P, pts, steps, color = "#000", a0 = 0.5) {
  for (let i = 0; i < steps.length; i++) {
    g.fillStyle = rgba(color, a0 * (1 - i / steps.length) * 0.5);
    quad(g, P, pts(steps[i]));
    g.fill();
  }
}

function hallway(g, t, W, H, camZ, camX, camY) {
  const cam = { x: camX, y: camY, z: camZ, f: 420, cx: W / 2, cy: H * 0.46 };
  const P = proj(cam);
  const zn = camZ + 0.22, zf = HALL.end;
  const { x0, x1, floor, ceil } = HALL;
  g.fillStyle = "#0a060a";
  g.fillRect(-20, -20, W + 40, H + 40);
  // coffered ceiling: plaster panels between heavy oak beams (cross beams + two long beams)
  hPlane(g, cam, mat("dado", { Y: ceil, x0, x1, z0: zn, z1: zf, k: 0.7, step: 7 }));
  const BD = 0.16;
  for (const sx of [-1, 1]) {
    const xa = sx * 0.95, xb = sx * 1.1;
    quad(g, P, [[xa, ceil, zn], [xa, ceil, zf], [xa, ceil + BD, zf], [xa, ceil + BD, zn]]);
    g.fillStyle = "#3a2216"; g.fill();
    quad(g, P, [[xa, ceil + BD, zn], [xb, ceil + BD, zn], [xb, ceil + BD, zf], [xa, ceil + BD, zf]]);
    g.fillStyle = "#5a3622"; g.fill();
  }
  for (let z = Math.ceil(zn / 1.6) * 1.6; z < zf; z += 1.6) {
    quad(g, P, [[x0, ceil, z], [x1, ceil, z], [x1, ceil + BD, z], [x0, ceil + BD, z]]);
    g.fillStyle = "#4a2c1c";
    g.fill();
    quad(g, P, [[x0, ceil + BD, z], [x1, ceil + BD, z], [x1, ceil + BD, z + 0.2], [x0, ceil + BD, z + 0.2]]);
    g.fillStyle = "#5a3622";
    g.fill();
  }
  // end wall (plaster) with the tall arched window
  fPlane(g, cam, mat("plaster", { Z: zf, x0, x1, y0: ceil, y1: floor, k: 1.2 }));
  const ew0 = P(-0.55, -1.9, zf), ew1 = P(0.55, 0.6, zf);
  const endArch = (c) => {
    c.beginPath();
    c.moveTo(ew0[0], ew1[1]);
    c.lineTo(ew0[0], ew0[1] + (ew1[0] - ew0[0]) * 0.5);
    c.arc((ew0[0] + ew1[0]) / 2, ew0[1] + (ew1[0] - ew0[0]) * 0.5, (ew1[0] - ew0[0]) / 2, Math.PI, 0);
    c.lineTo(ew1[0], ew1[1]);
    c.closePath();
  };
  endArch(g);
  const eg = g.createLinearGradient(0, ew0[1], 0, ew1[1]);
  eg.addColorStop(0, "#a4aedc");
  eg.addColorStop(1, "#4a5584");
  g.fillStyle = eg;
  g.fill();
  g.strokeStyle = "#140a16";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo((ew0[0] + ew1[0]) / 2, ew0[1]);
  g.lineTo((ew0[0] + ew1[0]) / 2, ew1[1]);
  g.moveTo(ew0[0], lerp(ew0[1], ew1[1], 0.5));
  g.lineTo(ew1[0], lerp(ew0[1], ew1[1], 0.5));
  g.stroke();
  // walls: flocked damask paper above the chair rail, painted panelling below
  const flock = flockTex();
  for (const side of [-1, 1]) {
    const X = side * 2;
    sPlane(g, cam, mat("paper", { X, y0: ceil, y1: 0.55, z0: zn, z1: zf, k: 1.7, step: 6 }));
    // the velvet pile of the motif: added to the albedo, so it only shows where a flame lights it
    g.save();
    g.globalCompositeOperation = "lighter";
    sPlane(g, cam, { canvas: flock, base: "#000000", X, y0: ceil, y1: 0.55, z0: zn, z1: Math.min(zf, camZ + 9), k: 1.7, step: 8, alpha: 0.2 });
    g.restore();
    sPlane(g, cam, mat("dado", { X, y0: 0.55, y1: floor, z0: zn, z1: zf, k: 1.1, step: 7 }));
    // occlusion where the wall meets the ceiling and where the paper meets the chair rail
    aoBands(g, P, (e) => [[X, ceil, zn], [X, ceil, zf], [X, ceil + e, zf], [X, ceil + e, zn]], [0.05, 0.12, 0.22, 0.34], "#000", 0.8);
    aoBands(g, P, (e) => [[X, ceil, zn], [X, ceil, zf], [X - side * e, ceil, zf], [X - side * e, ceil, zn]], [0.05, 0.12, 0.22], "#000", 0.7);
    aoBands(g, P, (e) => [[X, 0.55, zn], [X, 0.55, zf], [X, 0.55 - e, zf], [X, 0.55 - e, zn]], [0.03, 0.08, 0.15], "#000", 0.6);
    // chair rail: a lit top edge over a shadowed underside
    let p = P(X, 0.55, zn), q = P(X, 0.55, zf);
    g.strokeStyle = "rgba(14,6,6,0.85)";
    g.lineWidth = Math.max(1.5, p[2] * 0.035);
    g.beginPath(); g.moveTo(p[0], p[1] + g.lineWidth * 0.4); g.lineTo(q[0], q[1]); g.stroke();
    g.strokeStyle = "rgba(190,140,100,0.5)";
    g.lineWidth = Math.max(0.8, p[2] * 0.012);
    g.beginPath(); g.moveTo(p[0], p[1] - 1); g.lineTo(q[0], q[1]); g.stroke();
    // raised panels: a lit upper bevel, a dark lower bevel and far stile
    for (let z = Math.ceil(zn); z < zf - 0.6; z += 1.1) {
      const a = P(X, 0.7, z + 0.1), b = P(X, 0.7, z + 0.95), c = P(X, 1.35, z + 0.95), d = P(X, 1.35, z + 0.1);
      g.lineWidth = Math.max(0.6, a[2] * 0.014);
      g.strokeStyle = "rgba(190,140,110,0.3)";
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      g.strokeStyle = "rgba(0,0,0,0.5)";
      g.beginPath(); g.moveTo(d[0], d[1]); g.lineTo(c[0], c[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    // crown moulding
    p = P(X, ceil + 0.08, zn); q = P(X, ceil + 0.08, zf);
    g.strokeStyle = "rgba(60,36,30,0.9)";
    g.lineWidth = Math.max(2, p[2] * 0.05);
    g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
  }
  // floor: polished oak boards running away, the runner (pile, woven gold border)
  hPlane(g, cam, mat("boards", { Y: floor, x0, x1, z0: zn, z1: zf, k: 0.8, rot90: true, step: 5 }));
  hPlane(g, cam, mat("runner", { Y: floor, x0: -0.85, x1: 0.85, z0: zn, z1: zf - 0.3, k: 4, step: 6 }));
  // pile relief (cached fbm) over the near half, in soft-light so the carpet reads tufted
  g.save();
  g.globalCompositeOperation = "soft-light";
  hPlane(g, cam, { tex: "relief", texO: { seed: 66 }, base: "#808080", Y: floor, x0: -0.85, x1: 0.85, z0: zn, z1: camZ + 7, k: 3, step: 8, alpha: 0.75 });
  g.restore();
  // the worn path down the middle: the pile flattened and a little lighter where feet go
  for (const w of [0.5, 0.36, 0.22]) {
    quad(g, P, [[-w, floor, zn], [w, floor, zn], [w, floor, zf - 0.3], [-w, floor, zf - 0.3]]);
    g.fillStyle = "rgba(224,176,160,0.05)";
    g.fill();
  }
  for (const [a, b] of [[-0.85, -0.78], [0.78, 0.85]]) hPlane(g, cam, mat("border", { Y: floor, x0: a, x1: b, z0: zn, z1: zf - 0.3, k: 8, step: 6 }));
  // the runner's edges curl up a little in waves: a lit lip and a thin shadow on the boards beside it
  const lw = P(0, floor, zn + 1)[2];
  for (const sd of [-1, 1]) {
    const lip = [], sh = [];
    for (let z = zn; z < zf - 0.3; z += 0.22) {
      const c = 0.012 + 0.014 * Math.max(0, Math.sin(z * 2.3 + sd)) ** 2;
      lip.push(P(sd * 0.85, floor - c, z));
      sh.push(P(sd * (0.85 + c * 1.6), floor, z));
    }
    g.lineJoin = "round";
    g.beginPath(); sh.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
    g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = Math.max(1, lw * 0.012); g.stroke();
    g.beginPath(); lip.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
    g.strokeStyle = "rgba(230,170,120,0.35)"; g.lineWidth = Math.max(0.6, lw * 0.006); g.stroke();
  }
  // occlusion where walls meet the floor
  for (const side of [-1, 1]) {
    const X = side * 2;
    aoBands(g, P, (e) => [[X, floor, zn], [X, floor, zf], [X - side * e, floor, zf], [X - side * e, floor, zn]], [0.04, 0.1, 0.18, 0.28], "#000", 0.85);
    aoBands(g, P, (e) => [[X, floor, zn], [X, floor, zf], [X, floor - e, zf], [X, floor - e, zn]], [0.03, 0.08, 0.14], "#000", 0.6);
  }
  // wall items far to near (flames are deferred: they light the scene and are drawn last)
  deferFlames();
  const items = [];
  for (const [z, k] of LEFT_PORTRAITS) items.push([z, () => wallPortrait(g, P, -1, z, k, camZ, t)]);
  for (const [z, k] of RIGHT_ITEMS) items.push([z, () => (k === "window" ? wallWindow(g, P, z, camZ, t) : wallPortrait(g, P, 1, z, k, camZ, t))]);
  for (const z of SCONCES) {
    for (const side of [-1, 1]) {
      items.push([z, () => {
        if (z < camZ + 0.35) return;
        const p = P(side * 1.94, -0.55, z);
        sconce(g, p[0], p[1], p[2], t, z * 3 + side, -side);
      }]);
    }
  }
  for (const [side, z] of STANDS) items.push([z - 0.01, () => candelabra(g, P, side, z, camZ, t)]);
  items.sort((a, b) => b[0] - a[0]);
  for (const [, fn] of items) fn();
  // ---- light map: a dim cool ambient, the moon patches, every flame, the glass ----
  lit(g, W, H, "#2c2a32", (lg) => {
    lg.fillStyle = "#ffffff";
    endArch(lg);
    lg.fill();
    const ec = P(0, -0.6, zf);
    pool(lg, ec[0], ec[1], ec[2] * 2.2, "#7a86c0", 0.6);
    for (const [z, k] of RIGHT_ITEMS) {
      if (k !== "window" || z + WIN.len < camZ + 0.3) continue;
      const z1 = z + WIN.len;
      lg.fillStyle = "#c4c8d8";
      quad(lg, P, [[WIN.glass, WIN.y0, z], [WIN.glass, WIN.y0, z1], [WIN.glass, WIN.y1, z1], [WIN.glass, WIN.y1, z]]);
      lg.fill();
      // the far jamb faces back up the hall, away from the moon: only the glass's cool bounce lights
      // it; the sill catches the moon itself
      lg.fillStyle = "rgba(120,132,176,0.55)";
      quad(lg, P, [[1.99, WIN.y0, z1], [WIN.glass, WIN.y0, z1], [WIN.glass, WIN.y1, z1], [1.99, WIN.y1, z1]]);
      lg.fill();
      lg.fillStyle = "rgba(170,186,240,0.7)";
      quad(lg, P, [[1.95, WIN.y1, z], [WIN.glass, WIN.y1, z], [WIN.glass, WIN.y1, z1], [1.95, WIN.y1, z1]]);
      lg.fill();
      moonPatch(lg, P, z, camZ, 0.75);
    }
    flameLights(lg, 17, 0.85);
    for (const z of SCONCES) {
      if (z < camZ + 0.4) continue;
      for (const side of [-1, 1]) {
        const k = flick(t, z * 3 + side);
        floorPool(lg, P, side * 1.4, floor, z, 1.1, LIGHT, 0.55 * k);
        // candle bounce caught up in the coffers above each sconce
        floorPool(lg, P, side * 1.3, ceil + 0.05, z, 1.5, "#d07a3a", 0.8 * k);
        wallPool(lg, P, side * 1.98, ceil + 0.5, z, 0.9, "#c87038", 0.45 * k);
      }
    }
    for (const [side, z] of STANDS) if (z > camZ + 0.5) floorPool(lg, P, side * 1.5, floor, z, 1.2, LIGHT, 0.75 * flick(t, z * 5 + side));
  });
  // emissive: each flame's reflection stretched down the varnished boards (the mirrored image of the
  // flame, smeared toward the lens by the board grain), the moon's cool sheen on the floor patches
  const streak = (X, Yf, z, seed, a) => {
    if (z < camZ + 0.5) return;
    const base = P(X, floor, z), mir = P(X, 2 * floor - Yf, z);
    const len = (mir[1] - base[1]) * 1.25;
    if (len < 2) return;
    K.reflectStreak(g, base[0], base[1] + len * 0.05, len, "#ffa860", a * flick(t, seed), { t, width: Math.max(1.5, base[2] * 0.035) });
  };
  for (const z of SCONCES) for (const side of [-1, 1]) streak(side * 1.9, -0.8, z, z * 3 + side, 0.3);
  for (const [side, z] of STANDS) streak(side * 1.72, -0.05, z, z * 5 + side, 0.34);
  // moonlight is too dim for colour vision: the red pile under it reads grey-blue, so desaturate
  // the patch (penumbra-weighted), then add its cool sheen
  g.save();
  for (const [z, k] of RIGHT_ITEMS) {
    if (k !== "window" || z + WIN.len < camZ + 0.4) continue;
    g.globalCompositeOperation = "saturation";
    moonPanes(g, P, z, (a) => rgba("#8a8c90", Math.min(1, a * 2.4)));
    g.globalCompositeOperation = "lighter";
    moonPanes(g, P, z, (a) => rgba("#b4c4f4", a * 0.5));
  }
  g.restore();
  flushFlames(g);
  for (const [z, k] of RIGHT_ITEMS) if (k === "window") moonBeam(g, P, z, camZ, t);
  // atmospheric depth: the far end of the hall sinks into a cool haze
  const vp = P(0, -0.4, zf);
  const hz = g.createRadialGradient(vp[0], vp[1], 10, vp[0], vp[1], W * 0.32);
  hz.addColorStop(0, "rgba(110,104,150,0.2)");
  hz.addColorStop(0.45, "rgba(70,60,96,0.07)");
  hz.addColorStop(1, "rgba(40,30,60,0)");
  g.fillStyle = hz;
  g.fillRect(0, 0, W, H);
}
function shot1(g, t, W, H) {
  const p = eio(seg(t, 0, 10.4));
  const camZ = lerp(0, 2.2, p);
  hallway(g, t, W, H, camZ, noise(t * 0.3, 2) * 0.03, noise(t * 0.27, 5) * 0.02 + Math.sin(t * 3.2) * 0.006);
  K.dust(g, W, H, t, { seed: 61, count: 26, color: "#ffd9a0", size: 1.3, alpha: 0.35 });
}

// ---- SHOT 2: pan across the portraits -------------------------------------------------------------
const GALLERY = [[200, "duchess"], [660, "admiral"], [1120, "lord"], [1560, "lady"]];
// a soft drop shadow for a hung frame (penumbra baked once)
function frameShadow(w, h) {
  return own("f06fshadow" + w + "x" + h, w + 60, h + 60, (s) => {
    s.filter = "blur(9px)";
    s.fillStyle = "rgba(4,1,4,0.85)";
    s.fillRect(30, 30, w, h);
  });
}
// The gallery wall, flat to camera: damask paper, a moulded oak chair rail, painted raised panels,
// oak boards. ALBEDO ONLY: the caller defers the flames, runs the light map and flushes them.
const GSCONCE = [430, 890, 1340];
function galAlb(W, H, portraits) {
  return albedoCache("gal" + (portraits === false ? "0" : "1"), -220, -60, 1640, H + 160, 1, (s) => galleryWall(s, 0, W, H, -220, 1420, { portraits, raw: true }));
}
function galleryWall(g, t, W, H, x0, x1, opts = {}) {
  if (!opts.raw) {
    const e = galAlb(W, H, opts.portraits);
    albedoDraw(g, e, t);
    if (opts.live) livePortrait(g, opts);
    return;
  }
  const top = -60, rail = 352, base = 470;
  K.texRect(g, MAT.paper[0], x0, top, x1 - x0, rail - top, { scale: 120, ox: -x0, oy: -top, tex: MAT.paper[1] });
  // the velvet flock of the motif (same tiling as the paper): lit only where a flame reaches it
  {
    const fp = g.createPattern(flockTex(), "repeat");
    patXf(fp, 120 / 128, 0, 0, 120 / 128, 0, 0);
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.16;
    g.fillStyle = fp;
    g.fillRect(x0, top, x1 - x0, rail - top);
    g.restore();
  }
  // chair rail: oak, a lit top roll, a shadowed underside, its shadow on the panels
  K.texRect(g, MAT.oak[0], x0, rail, x1 - x0, 11, { scale: 90, ox: -x0, oy: -rail, tex: MAT.oak[1] });
  g.fillStyle = "rgba(255,214,170,0.22)";
  g.fillRect(x0, rail + 1, x1 - x0, 2);
  g.fillStyle = "rgba(0,0,0,0.5)";
  g.fillRect(x0, rail + 9, x1 - x0, 2);
  K.aoEdge(g, x0, rail + 11, x1, rail + 11, { width: 14, alpha: 0.6, side: -1 });
  K.aoEdge(g, x0, rail, x1, rail, { width: 10, alpha: 0.35, side: 1 });
  // painted raised panels below
  K.texRect(g, MAT.dado[0], x0, rail + 11, x1 - x0, base - rail - 11, { scale: 110, ox: -x0, oy: -rail, tex: MAT.dado[1] });
  // raised and fielded panels: a sunk quirk round each, four bevels (lit from the candles above:
  // top bevel brightest, bottom darkest), a slightly proud field with its own soft shading
  for (let x = Math.floor(x0 / 150) * 150; x < x1; x += 150) {
    const px = x + 14, py = rail + 24, pw = 122, ph = base - rail - 46, bv = 11;
    g.strokeStyle = "rgba(0,0,0,0.55)";
    g.lineWidth = 1.5;
    g.strokeRect(px - 1, py - 1, pw + 2, ph + 2);
    const bevel = (pts, c) => { g.fillStyle = c; g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath(); g.fill(); };
    bevel([[px, py], [px + pw, py], [px + pw - bv, py + bv], [px + bv, py + bv]], "rgba(255,214,180,0.2)");
    bevel([[px, py], [px + bv, py + bv], [px + bv, py + ph - bv], [px, py + ph]], "rgba(255,214,180,0.08)");
    bevel([[px + pw, py], [px + pw, py + ph], [px + pw - bv, py + ph - bv], [px + pw - bv, py + bv]], "rgba(0,0,0,0.28)");
    bevel([[px, py + ph], [px + bv, py + ph - bv], [px + pw - bv, py + ph - bv], [px + pw, py + ph]], "rgba(0,0,0,0.42)");
    const fg = g.createLinearGradient(0, py + bv, 0, py + ph - bv);
    fg.addColorStop(0, "rgba(255,220,190,0.07)");
    fg.addColorStop(1, "rgba(0,0,0,0.12)");
    g.fillStyle = fg;
    g.fillRect(px + bv, py + bv, pw - bv * 2, ph - bv * 2);
    g.fillStyle = "rgba(255,226,196,0.22)";
    g.fillRect(px + bv, py + bv, pw - bv * 2, 1);
  }
  // skirting + oak floor, occlusion where they meet
  g.fillStyle = "#1a0c0a";
  g.fillRect(x0, base - 12, x1 - x0, 12);
  K.texRect(g, MAT.boards[0], x0, base, x1 - x0, H + 100 - base, { scale: 260, scaleY: 90, ox: -x0, oy: -base, tex: MAT.boards[1] });
  K.aoEdge(g, x0, base, x1, base, { width: 18, alpha: 0.7, side: -1 });
  if (opts.portraits !== false) {
    for (const [px, kind] of GALLERY) {
      if (px + 160 < x0 || px - 160 > x1) continue;
      const w = 166, h = 214, x = px - w / 2, y = 92;
      // the frame stands off the wall: its shadow falls away from the nearest sconce
      let near = GSCONCE[0];
      for (const sx of GSCONCE) if (Math.abs(sx - px) < Math.abs(near - px)) near = sx;
      const dx = Math.sign(px - near) * clamp(Math.abs(px - near) * 0.05, 8, 18);
      g.drawImage(frameShadow(w + 32, h + 32), x - 16 - 30 + dx, y - 16 - 30 + 16, w + 92, h + 92);
      g.drawImage(portraitSprite(kind, w, h), x, y, w, h);
      giltFrame(g, x, y, w, h, 16, 0);
      // engraved brass plaque
      const pg = g.createLinearGradient(0, y + h + 22, 0, y + h + 31);
      pg.addColorStop(0, "#c8a050");
      pg.addColorStop(1, "#5a4014");
      g.fillStyle = pg;
      g.fillRect(px - 26, y + h + 22, 52, 9);
    }
  }
  for (const sx of GSCONCE) {
    if (sx < x0 - 200 || sx > x1 + 200) continue;
    sconce(g, sx, 200, 150, t, sx, 1);
  }
}
// every hung frame's gilding glint + varnish reflection from its nearest sconce (after the light map)
function galleryGlints(g, t, x0, x1) {
  for (const [px] of GALLERY) {
    if (px + 200 < x0 || px - 200 > x1) continue;
    let near = GSCONCE[0];
    for (const sx of GSCONCE) if (Math.abs(sx - px) < Math.abs(near - px)) near = sx;
    const d = Math.abs(near - px), k = flick(t, near) * clamp(1.6 - d / 320, 0.3, 1);
    giltSpecular(g, px - 83, 92, 166, 214, 16, near, 186, k);
  }
}
// the admiral, painted live over the cached wall (his eyes follow you)
function livePortrait(g, opts) {
  const px = GALLERY[1][0], w = 166, h = 214, x = px - w / 2, y = 92;
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.translate(x, y);
  portraitBg(g, "admiral", w, h);
  portraitCat(g, "admiral", w, h, 0, opts.gaze || 0, 1, opts.turn || 0, opts.pupil == null ? 0.14 : opts.pupil);
  g.drawImage(own("f06varnish", w, h, (s) => oilFinish(s, w, h, "admiral")), 0, 0, w, h);
  g.restore();
}
// the gallery's light: dim cool ambient, each sconce's flame (automatic) plus the scallop of light
// a sconce throws up and down the wall, warm on the panels below
function galleryLights(lg, t, x0, x1) {
  for (const sx of GSCONCE) {
    if (sx < x0 - 300 || sx > x1 + 300) continue;
    const k = flick(t, sx);
    pool(lg, sx, 190, 460, LIGHT, 0.74 * k, 1);
    pool(lg, sx - 230, 200, 210, "#c87838", 0.22 * k, 1.1);
    pool(lg, sx + 230, 200, 210, "#c87838", 0.22 * k, 1.1);
    pool(lg, sx, 120, 260, "#d88a48", 0.16 * k, 1.4);
    pool(lg, sx, 430, 360, LIGHT, 0.38 * k, 0.45);
  }
}
const GL_EYES = [[622, 164], [653, 164]];
function shot2(g, t, W, H) {
  const p = eio(seg(t, 10, 20));
  const cx = lerp(330, 860, p);
  // the hit at 12: between 11.8 and 12.6 the admiral's painted eyes slide round to YOU (pupils
  // + a slight turn of the head), a catch-light flares in them, and the camera leans in 3% on him
  const look = eio(seg(t, 11.8, 12.6));
  const gaze = lerp(-0.7, lerp(1, -0.2, eio(seg(t, 13.4, 20))), look);
  const turn = 0.45 * look * (1 - eio(seg(t, 14, 20)));
  // the slit pupils open wide and round as they land on you (reads at a glance, even in the dark)
  const pupil = lerp(0.14, 0.62, look * (1 - eio(seg(t, 15, 19))));
  const push = 0.03 * look * (1 - eio(seg(t, 14.5, 17)));
  const AX = 660, AY = 200;
  K.withCamera(g, W, H, { x: lerp(cx, AX, push * 8), y: lerp(H / 2, AY, push * 8), zoom: (1.04 + p * 0.03) * (1 + push), shakeT: t, shakeAmt: 1 }, () => {
    deferFlames();
    galleryWall(g, t, W, H, cx - W, cx + W, { live: true, gaze, turn, pupil });
    lit(g, W, H, "#2c2830", (lg) => {
      flameLights(lg, 15, 0.5); galleryLights(lg, t, cx - W, cx + W);
      // as the eyes arrive the varnish over them catches the sconce: the face lifts out of the dark
      if (look > 0) pool(lg, (GL_EYES[0][0] + GL_EYES[1][0]) / 2, 170, 70, "#ffd8a0", 0.5 * look * (1 - eio(seg(t, 15, 19))), 1);
    });
    flushFlames(g);
    galleryGlints(g, t, cx - W, cx + W);
    // the catch-light: a wet glint sliding into the painted eyes as they arrive
    const gl = K.env(t, 12.1, 13.1, 0.15, 0.6);
    if (gl > 0) {
      K.bellGlint(g, GL_EYES[0][0], GL_EYES[0][1], 14 * gl, t, { strength: gl * 0.9 });
      K.bellGlint(g, GL_EYES[1][0], GL_EYES[1][1], 12 * gl, t, { strength: gl * 0.75 });
    }
    K.dust(g, W * 2, H, t, { seed: 62, count: 30, color: "#ffd9a0", size: 1.2, alpha: 0.3, area: [cx - W, 0, W * 2, H] });
  });
}

// ---- SHOT 3: the ghost who is not very good at haunting ---------------------------------------------
const GHOST = { base: "#b4d2f4", light: "#f2f8ff", dark: "#5a78a8", stripe: "#9fc0ea", tip: "#bcd6ff", belly: "#eef6ff", white: "#ffffff",
  nose: "#c8d8f8", noseEdge: "#90a8d8", innerEar: "#dfe8ff", iris: "#e8f6ff", irisInner: "#ffffff", liner: "#5a7ab0",
  pattern: "solid", bib: false, socks: false, muzzle: true, stripeAlpha: 0.2, bentEar: false };
// A brass and crystal chandelier with real depth: a soft shadow of chain and body thrown on the wall
// by the sconce to the right, the BACK half of the ring (darker, thinner, its candles and drops dimmer)
// behind a turned brass body (vase + knops, shaded round), S-arms, then the FRONT half of the ring
// with a hot specular stripe, front candles and cut-crystal drops that each catch the flames.
function brassH(g, x0, x1, hs = 0.38, dark = 0) {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  gr.addColorStop(0, mix("#2a1a06", "#000000", dark));
  gr.addColorStop(clamp(hs - 0.18), mix("#8a6424", "#1a1004", dark));
  gr.addColorStop(hs, mix("#ffe9a8", "#5a4418", dark));
  gr.addColorStop(clamp(hs + 0.16), mix("#a87c30", "#24180a", dark));
  gr.addColorStop(1, mix("#1e1204", "#000000", dark));
  return gr;
}
function chandelier(g, x, y, s, rot, t) {
  const cy = s * 1.15, RX = s * 0.7, RY = s * 0.17;
  // the wall shadow: the sconce is to the right and a little below, so it falls left and up
  g.save();
  g.translate(x - s * 0.22, y + s * 0.05);
  g.rotate(rot * 1.15);
  g.lineCap = "round";
  for (const [w, a] of [[s * 0.12, 0.08], [s * 0.07, 0.12], [s * 0.035, 0.16]]) {
    g.strokeStyle = rgba("#050204", a);
    g.lineWidth = w;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-s * 0.05, cy * 0.98); g.stroke();
  }
  g.fillStyle = "rgba(5,2,4,0.14)";
  g.beginPath(); g.ellipse(-s * 0.06, cy * 1.02, RX * 0.95, RY * 1.6, 0, 0, TAU); g.fill();
  g.fillStyle = "rgba(5,2,4,0.1)";
  g.beginPath(); g.ellipse(-s * 0.06, cy * 1.02, RX * 1.12, RY * 2.2, 0, 0, TAU); g.fill();
  g.restore();
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  // chain: alternating links, the edge-on ones thin
  const nL = 14;
  for (let i = 0; i < nL; i++) {
    const ly = ((i + 0.5) * (s * 0.84)) / nL, lw = s * (i % 2 ? 0.012 : 0.028), lh = s * 0.034;
    g.fillStyle = brassH(g, -lw, lw, 0.35);
    g.beginPath(); g.ellipse(0, ly, lw, lh, 0, 0, TAU); g.fill();
    if (!(i % 2)) { g.fillStyle = "#120a02"; g.beginPath(); g.ellipse(0, ly, lw * 0.45, lh * 0.55, 0, 0, TAU); g.fill(); }
  }
  g.fillStyle = brassH(g, -s * 0.1, s * 0.1, 0.4);
  g.beginPath(); g.ellipse(0, s * 0.84, s * 0.06, s * 0.03, 0, 0, TAU); g.fill();
  const ringArc = (front, w, style) => {
    g.strokeStyle = style;
    g.lineWidth = w;
    g.beginPath();
    g.ellipse(0, cy, RX, RY, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
    g.stroke();
  };
  const arms = (front) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3, sn = Math.sin(a);
      if ((sn >= 0) !== front) continue;
      const px = Math.cos(a) * RX, py = cy + sn * RY;
      g.strokeStyle = front ? "#8a6424" : "#3a2a0c";
      g.lineWidth = s * 0.022;
      g.beginPath(); g.moveTo(0, cy + s * 0.04); g.bezierCurveTo(px * 0.3, cy + s * 0.22, px * 0.8, py + s * 0.12, px, py); g.stroke();
      g.strokeStyle = front ? "rgba(255,230,160,0.45)" : "rgba(160,120,60,0.15)";
      g.lineWidth = s * 0.007;
      g.beginPath(); g.moveTo(0, cy + s * 0.035); g.bezierCurveTo(px * 0.3, cy + s * 0.21, px * 0.8, py + s * 0.11, px, py - s * 0.006); g.stroke();
    }
  };
  const drops = (front) => {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + 0.17, sn = Math.sin(a);
      if ((sn >= 0) !== front) continue;
      // crystals hang plumb: they lag the ring's swing a little
      const sw = Math.sin(t * 3 + i) * s * 0.004 - rot * s * 0.06;
      const px = Math.cos(a) * RX * 0.97, py = cy + sn * RY + s * 0.025;
      const L = s * (0.07 + 0.03 * hash(i, 3)), wd = s * 0.022;
      g.strokeStyle = front ? "rgba(200,180,140,0.5)" : "rgba(120,100,80,0.3)";
      g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(px, py - s * 0.02); g.lineTo(px + sw, py); g.stroke();
      const qx = px + sw;
      const dg = g.createLinearGradient(qx - wd, 0, qx + wd, 0);
      const k = front ? 1 : 0.55;
      dg.addColorStop(0, rgba("#30343c", 0.85 * k));
      dg.addColorStop(0.35, rgba("#e8eef8", 0.85 * k));
      dg.addColorStop(0.55, rgba("#7a8090", 0.8 * k));
      dg.addColorStop(1, rgba("#20242c", 0.85 * k));
      g.fillStyle = dg;
      g.beginPath();
      g.moveTo(qx, py);
      g.quadraticCurveTo(qx + wd * 1.1, py + L * 0.62, qx, py + L);
      g.quadraticCurveTo(qx - wd * 1.1, py + L * 0.62, qx, py);
      g.fill();
      // specular: each drop throws a star of the nearest flames, twinkling with the flicker
      const tw = clamp((flick(t * 1.7, i * 3.1) - 0.93) * 6) * (front ? 1 : 0.5);
      if (tw > 0.02) glow(g, qx - wd * 0.25, py + L * 0.45, s * 0.05, "#fff4e0", 0.9 * tw);
    }
  };
  ringArc(false, s * 0.028, "#3a2a0c");
  ringArc(false, s * 0.008, "rgba(200,160,90,0.25)");
  drops(false);
  arms(false);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    const px = Math.cos(a) * RX, py = cy + Math.sin(a) * RY;
    if (Math.sin(a) < 0) { brassKnop(g, px, py + s * 0.005, s * 0.05, s * 0.014, 0.4); candle(g, px, py, s * 0.2, t, i * 7.1, 1, 0.6); }
  }
  // the turned brass body: a vase on a knop, round-shaded, the flames reflected on its shoulder
  g.fillStyle = brassH(g, -s * 0.15, s * 0.15, 0.36);
  g.beginPath();
  g.moveTo(-s * 0.03, cy - s * 0.3);
  g.bezierCurveTo(-s * 0.05, cy - s * 0.18, -s * 0.16, cy - s * 0.12, -s * 0.15, cy + s * 0.02);
  g.bezierCurveTo(-s * 0.14, cy + s * 0.14, -s * 0.06, cy + s * 0.2, 0, cy + s * 0.26);
  g.bezierCurveTo(s * 0.06, cy + s * 0.2, s * 0.14, cy + s * 0.14, s * 0.15, cy + s * 0.02);
  g.bezierCurveTo(s * 0.16, cy - s * 0.12, s * 0.05, cy - s * 0.18, s * 0.03, cy - s * 0.3);
  g.closePath();
  g.fill();
  const og = g.createLinearGradient(0, cy - s * 0.3, 0, cy + s * 0.26);
  og.addColorStop(0, "rgba(255,230,170,0.25)");
  og.addColorStop(0.45, "rgba(0,0,0,0)");
  og.addColorStop(1, "rgba(10,5,0,0.55)");
  g.fillStyle = og;
  g.fill();
  brassKnop(g, 0, cy - s * 0.3, s * 0.045, s * 0.02, 0.36);
  brassKnop(g, 0, cy + s * 0.04, s * 0.17, s * 0.035, 0.36);
  brassKnop(g, 0, cy + s * 0.27, s * 0.035, s * 0.03, 0.36);
  glow(g, -s * 0.05, cy - s * 0.06, s * 0.05, "#fff0c8", 0.55 * flick(t, 2));
  arms(true);
  ringArc(true, s * 0.04, brassH(g, -RX, RX, 0.42));
  ringArc(true, s * 0.01, "rgba(255,236,180,0.55)");
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    const px = Math.cos(a) * RX, py = cy + Math.sin(a) * RY;
    if (Math.sin(a) >= 0) { brassKnop(g, px, py + s * 0.005, s * 0.055, s * 0.016, 0.4); candle(g, px, py, s * 0.2, t, i * 7.1, 1, 0.6); }
  }
  drops(true);
  // finial drop under the body
  const fy = cy + s * 0.3;
  const fd = g.createLinearGradient(-s * 0.03, 0, s * 0.03, 0);
  fd.addColorStop(0, "rgba(40,44,52,0.9)"); fd.addColorStop(0.4, "rgba(236,242,252,0.9)"); fd.addColorStop(1, "rgba(30,34,42,0.9)");
  g.fillStyle = fd;
  g.beginPath(); g.moveTo(0, fy); g.quadraticCurveTo(s * 0.05, fy + s * 0.08, 0, fy + s * 0.15); g.quadraticCurveTo(-s * 0.05, fy + s * 0.08, 0, fy); g.fill();
  g.restore();
}
// The gag: the ghost drifts out, REARS UP to be scary (body pivoting ~35 deg back round the hips,
// front paws lifting) and rises until its ears clonk the chandelier at exactly 24.0; the head
// squashes, the chandelier swings, crystals tinkle. Then it slinks off embarrassed: ears flat, tail
// down, glancing back at you, and fades into the wall before it reaches the sconce.
const BONK = 24.0;
function ghostState(t) {
  const emerge = smooth(seg(t, 20, 21.8));
  const rearUp = eio(seg(t, 22.5, BONK));
  const settle = eio(seg(t, 24.35, 25.1));
  const rear = rearUp * (1 - settle);
  const leave = eio(seg(t, 25.1, 29.4));
  const x = lerp(lerp(250, 452, eio(seg(t, 20, 22.6))), 610, leave);
  const s = lerp(70, 92, emerge);
  // GHOST_RISE is tuned so the ear tips touch the chandelier's lowest crystals at the bonk
  let y = 330 + Math.sin(t * 1.7) * 6 * (1 - rearUp) - rear * GHOST_RISE + leave * 18;
  const squash = t >= BONK ? Math.exp(-(t - BONK) * 9) : 0;
  const alpha = emerge * (1 - smooth(seg(t, 27.6, 29.3)));
  return { x, y, s, alpha, rear, squash, leave, emb: t > BONK + 0.3 ? 1 : 0 };
}
const GHOST_RISE = 12;
// The ghost is built like a volumetric effect, not a sticker: the cat is painted once into a mask
// layer, then composited ADDITIVELY in four parts so the wallpaper and the portrait frame show
// through it: a soft scattering halo, a dim body with drifting fbm density inside (a cached cloud
// texture scrolled with t, cut to the silhouette), a brighter fresnel rim (the silhouette minus its
// own blurred, eroded copy: thin where the body is seen edge-on), and wispy tendrils trailing from
// the tail and paws. Only a faint normal-blend pass keeps the face readable.
function ghostXf(G) {
  // the same pivot / squash as the mask, for points in the cat's own frame (u = pose units)
  const u = G.s / 60, hipX = G.x - G.s * 0.55, hipY = G.y - G.s * 0.55, a = -0.61 * G.rear;
  const ca = Math.cos(a), sa = Math.sin(a);
  return (px, py) => { const x = G.x + px * u - hipX, y = G.y + py * u - hipY; return [hipX + x * ca - y * sa, hipY + x * sa + y * ca]; };
}
function ghost(g, t, W, H) {
  const G = ghostState(t);
  if (G.alpha <= 0.01) return;
  const L = K.layer(W, H, "f06ghost");
  const c = L.g;
  // pivot round the hips; squash about the top of the head on impact
  const hipX = G.x - G.s * 0.55, hipY = G.y - G.s * 0.55;
  c.save();
  c.translate(hipX, hipY);
  c.rotate(-0.61 * G.rear);
  c.translate(-hipX, -hipY);
  if (G.squash > 0.01) {
    const hx = G.x + G.s * 0.75, hy = G.y - G.s * 1.35;
    c.translate(hx, hy);
    c.scale(1 + 0.12 * G.squash, 1 - 0.2 * G.squash);
    c.translate(-hx, -hy);
  }
  // always the walk rig (bent elbows and hocks, a paw lifted mid-stride); rearing it paws the air
  K.drawCat(c, G.x, G.y, G.s, {
    pose: "walk", phase: t * 0.35 + G.rear * 0.18, facing: 1, t, coat: GHOST,
    headTilt: G.emb ? -0.45 : G.rear * 0.5,
    // embarrassed: the head turns back toward the camera as it slinks away
    headTurn: G.emb ? lerp(0.35, 0.95, eio(seg(t, 25.0, 26.4))) : 0.35, mouth: G.emb ? 0 : G.rear,
    ears: G.emb ? -1 : G.rear > 0.2 ? 0.8 : 0.4, tail: G.emb ? 0.2 : 1, tailUp: G.emb ? 0 : 0.6 + G.rear * 0.4,
    blink: G.emb ? 0.45 : G.squash > 0.2 ? 0.9 : 0,
    collar: false, bell: false, shadow: false, light: { x: 560, y: 120, color: "#ffffff", strength: 0.6 },
  });
  c.restore();
  // wispy: legs dissolve into mist (in screen space below the body)
  c.save();
  c.globalCompositeOperation = "destination-out";
  const fy = G.y - G.s * 0.5 * (1 - G.rear * 0.5);
  const fg = c.createLinearGradient(0, fy, 0, G.y + 4);
  fg.addColorStop(0, "rgba(0,0,0,0)");
  fg.addColorStop(1, "rgba(0,0,0,0.9)");
  c.fillStyle = fg;
  c.fillRect(G.x - G.s * 2.5, fy, G.s * 5, G.y + 4 - fy + 2);
  // as it leaves, it melts into the wall from the front (right) first
  if (G.leave > 0) {
    const fade = smooth(seg(t, 26.8, 29.3));
    const mg = c.createLinearGradient(G.x - G.s * 1.4, 0, G.x + G.s * 1.6, 0);
    mg.addColorStop(0, rgba("#000000", fade * 0.6));
    mg.addColorStop(1, rgba("#000000", Math.min(1, fade * 1.4)));
    c.fillStyle = mg;
    c.fillRect(G.x - G.s * 2.5, G.y - G.s * 2.6, G.s * 5, G.s * 2.8);
  }
  c.restore();
  // fresnel rim: the mask minus its blurred copy, tinted pale ice
  const Rm = K.layer(W, H, "f06ghostR");
  Rm.g.drawImage(L.canvas, 0, 0, W, H);
  Rm.g.globalCompositeOperation = "destination-out";
  K.dof(Rm.g, L.canvas, 6, 1);
  Rm.g.globalCompositeOperation = "source-atop";
  Rm.g.fillStyle = "#e6f3ff";
  Rm.g.fillRect(-W, -H, W * 3, H * 3);
  // the inside: drifting density (a cloud texture scrolled with t), cut to the body
  const V = K.layer(W, H, "f06ghostV");
  const pat = K.texPattern(V.g, "cloud", { seed: 33 });
  patXf(pat, 0.55, 0, 0, 0.55, -t * 14, t * 6);
  V.g.fillStyle = pat;
  V.g.fillRect(-W, -H, W * 3, H * 3);
  V.g.globalCompositeOperation = "destination-in";
  V.g.drawImage(L.canvas, 0, 0, W, H);
  // contrast the density (clear pockets between wisps), then tint it ice blue
  V.g.globalCompositeOperation = "source-atop";
  V.g.fillStyle = "rgba(20,30,60,0.35)";
  V.g.fillRect(-W, -H, W * 3, H * 3);
  V.g.globalCompositeOperation = "multiply";
  V.g.fillStyle = "#9cc0ff";
  V.g.fillRect(-W, -H, W * 3, H * 3);
  V.g.globalCompositeOperation = "destination-in";
  V.g.drawImage(L.canvas, 0, 0, W, H);
  const A = G.alpha * (0.92 + 0.08 * Math.sin(t * 7));
  g.save();
  g.globalCompositeOperation = "lighter";
  K.dof(g, L.canvas, 18, 0.1 * A);
  g.globalAlpha = 0.05 * A;
  g.drawImage(L.canvas, 0, 0, W, H);
  g.globalAlpha = 0.34 * A;
  g.drawImage(V.canvas, 0, 0, W, H);
  g.globalAlpha = 0.42 * A;
  g.drawImage(Rm.canvas, 0, 0, W, H);
  K.dof(g, Rm.canvas, 3, 0.22 * A);
  g.restore();
  // a whisper of the real thing for the face (eyes, nose) - mostly see-through
  g.save();
  g.globalAlpha = 0.08 * A;
  g.drawImage(L.canvas, 0, 0, W, H);
  g.restore();
  // tendrils: thin wisps trailing behind the tail tip and the paws, curling as they drift
  const X = ghostXf(G), u = G.s / 60;
  const roots = [[-58, -74 - 12 * G.rear, 1.0, 0], [-34, -6, 0.75, 1], [36, -6, 0.6, 2], [-30, -4, 0.55, 3], [40, -5, 0.5, 4]];
  g.save();
  g.globalCompositeOperation = "lighter";
  for (const [rx, ry, k, sd] of roots) {
    const leaveK = 1 + G.leave * 0.6;
    for (let i = 1; i <= 11; i++) {
      const f = i / 11;
      const wob = Math.sin(t * 2.2 - i * 0.55 + sd * 1.7) * (2 + i * 1.6) + noise(t * 0.8 + i * 0.3, sd) * 4 * f;
      const [px, py] = X(rx - i * 7.5 * k * leaveK, ry + wob + (sd ? -i * 1.1 : i * 0.6));
      glow(g, px, py, u * (7 - 4.5 * f) * k + 2, "#cfe6ff", 0.13 * A * (1 - f) * k);
    }
  }
  g.restore();
}
// the chandelier's swing after the bonk: +-0.34 rad, decaying, pivoting at the ceiling chain
const chandRot = (t) => (t >= BONK ? 0.34 * Math.exp(-(t - BONK) * 0.5) * Math.sin((t - BONK) * 2.8) : 0);
function shot3(g, t, W, H) {
  const p = eio(seg(t, 20, 30));
  const rot = chandRot(t);
  const CX = 520, CY = -46, CS = 120;
  K.withCamera(g, W, H, { x: 480 + p * 30, y: 280, zoom: 1.0 + p * 0.04, shakeT: t, shakeAmt: 1 + (t > BONK && t < BONK + 0.5 ? 4 : 0) }, () => {
    deferFlames();
    g.save();
    g.translate(-30, 0);
    galleryWall(g, t, W, H, -200, 1400, { portraits: false });
    g.restore();
    // a dim portrait to the left (the one the ghost came out of)
    g.drawImage(frameShadow(182, 228), 160 - 16 - 30 - 8, 92 - 16 - 30 + 14, 242, 288);
    g.drawImage(portraitSprite("lady", 150, 196), 160, 92, 150, 196);
    giltFrame(g, 160, 92, 150, 196, 14, 0);
    chandelier(g, CX, CY, CS, rot, t);
    const G = ghostState(t);
    lit(g, W, H, "#2c2830", (lg) => {
      flameLights(lg, 14, 0.5);
      lg.save();
      lg.translate(-30, 0);
      galleryLights(lg, t, -200, 1400);
      lg.restore();
      // the chandelier's six flames light the ceiling and the top of the wall round it
      lg.save();
      lg.translate(CX, CY);
      lg.rotate(rot);
      pool(lg, 0, CS * 0.95, CS * 1.9, LIGHT, 0.42 * flick(t, 3.3), 0.55);
      pool(lg, 0, CS * 1.2, CS * 1.1, "#ffc890", 0.25 * flick(t, 5.1), 0.8);
      lg.restore();
      // the ghost glows: a faint cold pool on the paper round it and down on the wainscot
      if (G.alpha > 0.01) {
        pool(lg, G.x + G.s * 0.2, G.y - G.s * 0.8 - G.rear * 30, G.s * 3.0, "#cfe6ff", 0.5 * G.alpha);
        pool(lg, G.x, 410, G.s * 2.6, "#cfe6ff", 0.32 * G.alpha, 0.45);
      }
    });
    flushFlames(g);
    giltSpecular(g, 160, 92, 150, 196, 14, 400, 186, 0.8 * flick(t, 430));
    // emerge ripple on the wall
    const em = seg(t, 19.8, 21.6);
    if (em > 0 && em < 1) {
      g.save();
      g.globalCompositeOperation = "lighter";
      g.strokeStyle = rgba("#cfe6ff", 0.5 * (1 - em));
      g.lineWidth = 2;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(250, 280, 20 + em * 120 + i * 18, (20 + em * 120 + i * 18) * 1.3, 0, 0, TAU); g.stroke(); }
      g.restore();
    }
    ghost(g, t, W, H);
    // the clonk: crystal tinkle sparks scattered round the ring, a beat apart
    const R = K.rng("tinkle");
    for (let i = 0; i < 9; i++) {
      const a = R() * TAU, t0 = BONK + R() * 0.7;
      const k = seg(t, t0, t0 + 0.35);
      if (k <= 0 || k >= 1) { R(); continue; }
      const lx = Math.cos(a) * CS * 0.62, ly = CS * 1.15 + Math.sin(a) * CS * 0.14 + CS * 0.2 + R() * 6;
      const sx = CX + lx * Math.cos(rot) - ly * Math.sin(rot), sy = CY + lx * Math.sin(rot) + ly * Math.cos(rot);
      K.bellGlint(g, sx, sy, 14 * (1 - k), t, { strength: 1 - k, color: "#ffffff" });
    }
    const bk = seg(t, BONK - 0.02, BONK + 0.5);
    if (bk > 0 && bk < 1) K.bellGlint(g, CX - 56, CY + CS * 1.4, 40 * (1 - bk), t, { strength: 1 - bk });
  });
}

// ---- SHOT 4 + 7: the grand staircase ------------------------------------------------------------------
const STEPS = 14, RISE = 0.24, RUN = 0.42, Z0 = 2.2;
const stepY = (i) => 1.5 - i * RISE;
const stepZ = (i) => Z0 + i * RUN;
// The staircase is built like a real set: textured albedo first (plaster back wall, damask stairwell
// walls, oak treads and risers under a pile runner with a woven border, oak stringers, turned
// balusters), then ONE light map (cool moonlight through the window landing tread by tread, or the
// warm doorway, plus every candle's own falloff), then the emissive things (glass, flames, rays).
function staircase(g, t, W, H, cam, o = {}) {
  const P = proj(cam);
  const topY = stepY(STEPS), topZ = stepZ(STEPS), back = topZ + (o.backDepth || 2.2);
  const door = o.top === "door";
  const lit0 = !door;
  g.fillStyle = "#0c070c";
  g.fillRect(-W, -H, W * 3, H * 3);
  // back wall (plaster) and the stairwell walls (damask paper over an oak dado that follows the rake)
  fPlane(g, cam, mat("plaster", { Z: back, x0: -3, x1: 3, y0: -7, y1: topY, k: 0.9 }));
  for (const side of [-1, 1]) {
    sPlane(g, cam, mat("stripe", { X: side * 3, y0: -7, y1: 2, z0: cam.z + 0.3, z1: back, k: 1.2, step: 6 }));
    // dado: a band of dark oak running up with the stairs
    g.save();
    const d0 = cam.z + 0.3;
    const yAt = (z) => 1.5 - clamp((z - Z0) / RUN, 0, STEPS) * RISE;
    quad(g, P, [[side * 3, yAt(d0) - 0.95, d0], [side * 3, yAt(topZ) - 0.95, topZ], [side * 3, topY - 0.95, back], [side * 3, 2, back], [side * 3, 2, d0]]);
    g.clip();
    sPlane(g, cam, mat("dado", { X: side * 3, y0: -7, y1: 2, z0: d0, z1: back, k: 0.8, step: 6 }));
    g.restore();
    // dado rail along the rake
    const a = P(side * 3, yAt(d0) - 0.95, d0), b = P(side * 3, yAt(topZ) - 0.95, topZ), c = P(side * 3, topY - 0.95, back);
    g.strokeStyle = "rgba(20,10,8,0.8)";
    g.lineWidth = Math.max(1, a[2] * 0.03);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.stroke();
  }
  // the tall arched window (shot 4) or the lit doorway (shot 7)
  const win = door ? { x0: -0.72, x1: 0.72, y0: topY - 3.0, y1: topY, z: back } : { x0: -0.8, x1: 0.8, y0: topY - 3.9, y1: topY - 0.7, z: back };
  const w0 = P(win.x0, win.y0, win.z), w1 = P(win.x1, win.y1, win.z);
  const ww = w1[0] - w0[0];
  const arch = (c, pad = 0) => {
    c.beginPath();
    c.moveTo(w0[0] - pad, w1[1] + pad);
    c.lineTo(w0[0] - pad, w0[1] + ww / 2);
    c.arc((w0[0] + w1[0]) / 2, w0[1] + ww / 2, ww / 2 + pad, Math.PI, 0);
    c.lineTo(w1[0] + pad, w1[1] + pad);
    c.closePath();
  };
  // deep reveal + moulded architrave
  arch(g, ww * 0.09);
  g.fillStyle = "#1a0e10";
  g.fill();
  arch(g, ww * 0.045);
  g.fillStyle = "#0a0508";
  g.fill();
  const winC = [(w0[0] + w1[0]) / 2, (w0[1] + w1[1]) / 2];
  const glass = () => {
    arch(g);
    if (door) {
      const dg = g.createLinearGradient(0, w0[1], 0, w1[1]);
      dg.addColorStop(0, "#c88848");
      dg.addColorStop(0.6, "#a86030");
      dg.addColorStop(1, "#7a4420");
      g.fillStyle = dg;
      g.fill();
      // the lit room beyond: a warm far wall, a lamp's hot spot, the jamb's shadow
      g.save();
      arch(g);
      g.clip();
      glow(g, winC[0] + ww * 0.25, w0[1] + (w1[1] - w0[1]) * 0.4, ww * 0.3, "#fff0d0", 0.9);
      glow(g, winC[0] + ww * 0.25, w0[1] + (w1[1] - w0[1]) * 0.4, ww * 0.9, "#ffb060", 0.35);
      const jg = g.createLinearGradient(w0[0], 0, w0[0] + ww * 0.25, 0);
      jg.addColorStop(0, "rgba(90,40,10,0.55)");
      jg.addColorStop(1, "rgba(90,40,10,0)");
      g.fillStyle = jg;
      g.fillRect(w0[0], w0[1], ww * 0.25, w1[1] - w0[1]);
      g.restore();
    } else {
      // night sky through old glass: the moon high right, a cold gradient, leaded panes
      const dg = g.createLinearGradient(0, w0[1], 0, w1[1]);
      dg.addColorStop(0, "#c6d0ff");
      dg.addColorStop(0.5, "#7a88d0");
      dg.addColorStop(1, "#3a4488");
      g.fillStyle = dg;
      g.fill();
      g.save();
      arch(g);
      g.clip();
      glow(g, w0[0] + ww * 0.68, w0[1] + ww * 0.62, ww * 0.42, "#ffffff", 0.9);
      K.texRect(g, "glassdrops", w0[0], w0[1], ww, w1[1] - w0[1], { scale: ww * 0.6, alpha: 0.12, mode: "screen" });
      g.strokeStyle = "#0e0812";
      g.lineWidth = Math.max(1.5, ww * 0.028);
      g.beginPath();
      for (let k = 1; k < 3; k++) { g.moveTo(w0[0] + (ww * k) / 3, w0[1]); g.lineTo(w0[0] + (ww * k) / 3, w1[1]); }
      for (let k = 1; k < 5; k++) { const yy = lerp(w0[1] + ww / 2, w1[1], k / 5); g.moveTo(w0[0], yy); g.lineTo(w1[0], yy); }
      g.stroke();
      g.lineWidth = Math.max(0.6, ww * 0.008);
      g.strokeStyle = "rgba(14,8,18,0.6)";
      g.beginPath();
      for (let k = 1; k < 9; k++) { g.moveTo(w0[0] + (ww * k) / 9, w0[1]); g.lineTo(w0[0] + (ww * k) / 9, w1[1]); }
      g.stroke();
      g.restore();
    }
  };
  glass();
  if (o.inDoor) o.inDoor(g, P, win, w0, w1);
  deferFlames();
  // candle sconces on the stairwell walls
  for (const side of [-1, 1]) {
    for (const i of [3, 9]) {
      const z = stepZ(i);
      if (z < cam.z + 0.6) continue;
      const q = P(side * 2.95, stepY(i) - 1.75, z);
      sconce(g, q[0], q[1], q[2], t, i * 3 + side, -side);
    }
  }
  // landing
  hPlane(g, cam, mat("oak", { Y: topY, x0: -3, x1: 3, z0: topZ, z1: back, k: 2.4, rot90: true }));
  hPlane(g, cam, mat("runner", { Y: topY, x0: -0.95, x1: 0.95, z0: topZ, z1: back - 0.4, k: 5 }));
  // steps far to near: tread then riser
  const moonOn = (i) => clamp(1 - Math.abs(i - 4.5) / 8);
  for (let i = STEPS - 1; i >= 0; i--) {
    const yT = stepY(i + 1), z0 = stepZ(i), z1 = stepZ(i + 1), yB = stepY(i);
    if (z0 < cam.z + 0.3) continue;
    const near = z0 - cam.z < 3;
    hPlane(g, cam, mat("oak", { Y: yT, x0: -1.75, x1: 1.75, z0, z1, k: 2.4, step: near ? 4 : 6 }));
    hPlane(g, cam, mat("runner", { Y: yT, x0: -0.95, x1: 0.95, z0, z1, k: 5, step: near ? 4 : 6 }));
    if (near) for (const [a, b] of [[-0.95, -0.9], [0.9, 0.95]]) hPlane(g, cam, mat("border", { Y: yT, x0: a, x1: b, z0, z1, k: 9, step: 4 }));
    // contact occlusion in the corner where this tread runs into the next riser
    aoBands(g, P, (e) => [[-1.75, yT, z1 - e], [1.75, yT, z1 - e], [1.75, yT, z1], [-1.75, yT, z1]], [0.03, 0.07, 0.13], "#000", 0.9);
    const n0 = P(-1.75, yT, z0), n1 = P(1.75, yT, z0);
    const nw = Math.max(1, n0[2] * 0.018);
    // riser
    fPlane(g, cam, mat("oak", { Z: z0, x0: -1.75, x1: 1.75, y0: yT, y1: yB, k: 0.7 }));
    fPlane(g, cam, mat("runner", { Z: z0 - 0.002, x0: -0.95, x1: 0.95, y0: yT, y1: yB, k: 5 }));
    // the riser in the nosing's shade (darkest right under it), and its foot occluded by the tread
    const u0 = P(-1.75, yT, z0), u1 = P(1.75, yB, z0);
    g.drawImage(vgrad("riser", [[0, "rgba(6,2,4,0.85)"], [0.22, "rgba(6,2,4,0.45)"], [0.5, "rgba(6,2,4,0.15)"], [0.86, "rgba(6,2,4,0.3)"], [1, "rgba(6,2,4,0.6)"]]), u0[0], u0[1], u1[0] - u0[0], u1[1] - u0[1]);
    // brass stair rod holding the runner in the corner (a cached round-shaded strip)
    const r0 = P(-0.95, yB - 0.02, z0 - 0.01), r1 = P(0.95, yB - 0.02, z0 - 0.01);
    const rw = Math.max(0.8, r0[2] * 0.012);
    g.drawImage(vgrad("rod", [[0, "#3a2808"], [0.3, "#f0d080"], [0.45, "#b08a3a"], [1, "#2a1a06"]]), r0[0], r0[1] - rw, r1[0] - r0[0], rw * 2);
    g.fillStyle = "#1a1004";
    for (const xx of [-0.97, 0.97]) { const c = P(xx, yB - 0.02, z0 - 0.01); g.fillRect(c[0] - rw, c[1] - rw * 1.4, rw * 2, rw * 2.8); }
    // the rounded oak nosing, proud of the riser: lit top, a rolling gradient over the bullnose
    g.drawImage(vgrad("nose", [[0, "rgba(255,226,190,0.3)"], [0.3, "rgba(160,100,60,0.12)"], [0.62, "rgba(20,8,4,0.45)"], [1, "rgba(10,4,2,0)"]]), n0[0], n0[1] - nw * 0.7, n1[0] - n0[0], nw * 2.2);
    if (o.onStep) o.onStep(g, P, i, yT, z0, z1);
  }
  // banisters: turned balusters (two per tread), a moulded handrail, newel posts
  for (const side of [-1, 1]) {
    const X = side * 1.75;
    const railNear = o.railNear || 1.1;
    for (let i = STEPS; i >= 0; i--) {
      for (const f of [0.28, 0.72]) {
        const z = stepZ(i) + RUN * f;
        if (z < cam.z + railNear || i >= STEPS) continue;
        const a = P(X, stepY(i + 1), z), b = P(X, stepY(i + 1) - 1.0, z);
        const bw = Math.max(1, a[2] * 0.03);
        const bg = g.createLinearGradient(a[0] - bw, 0, a[0] + bw, 0);
        bg.addColorStop(0, "#120806");
        bg.addColorStop(side < 0 ? 0.7 : 0.3, "#4a2a1a");
        bg.addColorStop(1, "#0e0604");
        g.fillStyle = bg;
        g.fillRect(a[0] - bw / 2, b[1], bw, a[1] - b[1]);
        // turned collars
        g.fillRect(a[0] - bw * 0.85, b[1] + (a[1] - b[1]) * 0.18, bw * 1.7, Math.max(1, bw * 0.5));
        g.fillRect(a[0] - bw * 0.85, b[1] + (a[1] - b[1]) * 0.78, bw * 1.7, Math.max(1, bw * 0.5));
      }
    }
    const rz0 = Math.max(stepZ(0), cam.z + railNear), ri0 = (rz0 - Z0) / RUN;
    const r0 = P(X, 1.5 - ri0 * RISE - 1.05, rz0), r1 = P(X, stepY(STEPS) - 1.05, stepZ(STEPS));
    const rt = Math.max(2, r0[2] * 0.075), rt1 = Math.max(1.5, r1[2] * 0.075);
    g.fillStyle = "#2a140c";
    g.beginPath(); g.moveTo(r0[0], r0[1] - rt / 2); g.lineTo(r1[0], r1[1] - rt1 / 2); g.lineTo(r1[0], r1[1] + rt1 / 2); g.lineTo(r0[0], r0[1] + rt / 2); g.closePath(); g.fill();
    // varnish sheen along the top of the rail (picks up the window / door)
    g.strokeStyle = lit0 ? "rgba(170,180,255,0.4)" : "rgba(255,196,130,0.4)";
    g.lineWidth = Math.max(0.8, rt * 0.18);
    g.beginPath(); g.moveTo(r0[0], r0[1] - rt * 0.32); g.lineTo(r1[0], r1[1] - rt1 * 0.32); g.stroke();
    if (o.railPosts) {
      for (const [zz, yy] of [[rz0, 1.5 - ri0 * RISE], [stepZ(STEPS), stepY(STEPS)]]) {
        const top = P(X, yy - 1.18, zz), bot = P(X, yy, zz);
        const w = Math.max(3, top[2] * 0.11);
        const ng = g.createLinearGradient(top[0] - w / 2, 0, top[0] + w / 2, 0);
        ng.addColorStop(0, "#140806");
        ng.addColorStop(0.35, "#5a3020");
        ng.addColorStop(1, "#100604");
        g.fillStyle = ng;
        g.fillRect(top[0] - w / 2, top[1], w, bot[1] - top[1]);
        g.fillStyle = "#3a1e12";
        g.fillRect(top[0] - w * 0.7, top[1] - w * 0.35, w * 1.4, w * 0.45);
      }
    }
  }
  // newel posts with candelabra candles near the bottom
  const newel = [];
  if (o.newels !== false) {
    for (const side of [-1, 1]) {
      const b = P(side * 1.75, stepY(0) - 1.2, stepZ(0) + 0.1);
      if (b[2] > 400) continue;
      const w = b[2] * 0.14;
      const ng = g.createLinearGradient(b[0] - w / 2, 0, b[0] + w / 2, 0);
      ng.addColorStop(0, "#0e0604");
      ng.addColorStop(side < 0 ? 0.65 : 0.35, "#5a3020");
      ng.addColorStop(1, "#0a0402");
      g.fillStyle = ng;
      g.fillRect(b[0] - w / 2, b[1], w, H * 2);
      g.fillStyle = "#3a1e12";
      g.fillRect(b[0] - w * 0.7, b[1] - w * 0.1, w * 1.4, w * 0.3);
      candle(g, b[0], b[1], b[2] * 0.3, t, side * 5, 1, 1);
      newel.push(b);
    }
  }
  // the window-shaped moon patch on each tread: two pane columns, each three nested quads (a soft
  // penumbra: the window is big and the moon is not a point), plus a sliver down each riser face
  const moonTreads = (c, fill) => {
    for (let i = STEPS - 1; i >= 0; i--) {
      const k = moonOn(i);
      if (k <= 0.01 || stepZ(i) < cam.z + 0.3) continue;
      const yT = stepY(i + 1), z0 = stepZ(i), z1 = stepZ(i + 1);
      for (const [e, a] of [[0.1, 0.25], [0.04, 0.3], [-0.03, 0.4]]) {
        c.fillStyle = fill(a * k);
        quad(c, P, [[-0.8 - e, yT, z0 + 0.03 - e * 0.3], [-0.05 + e * 0.6, yT, z0 + 0.03 - e * 0.3], [-0.05 + e * 0.6, yT, z1], [-0.8 - e, yT, z1]]);
        c.fill();
        quad(c, P, [[0.05 - e * 0.6, yT, z0 + 0.03 - e * 0.3], [0.8 + e, yT, z0 + 0.03 - e * 0.3], [0.8 + e, yT, z1], [0.05 - e * 0.6, yT, z1]]);
        c.fill();
      }
      c.fillStyle = fill(0.25 * k);
      quad(c, P, [[-0.78, yT, z0], [0.78, yT, z0], [0.78, yT + RISE * 0.4, z0], [-0.78, yT + RISE * 0.4, z0]]);
      c.fill();
    }
  };
  // the shaft from the window down the stairs, seen as a solid: the hull of the window aperture and
  // the lit patches, drawn as nested hulls (soft edges, densest core), with drifting fbm density
  // (a cached cloud texture) and dust motes that exist ONLY inside it
  const stairBeam = (c, P2, tt, kk, dustN = 40) => {
    const pts = [[win.x0 + 0.1, win.y0 + 0.6, win.z], [win.x1 - 0.1, win.y0 + 0.6, win.z], [win.x0 + 0.1, win.y1, win.z], [win.x1 - 0.1, win.y1, win.z]];
    for (let i = 0; i < STEPS; i++) if (moonOn(i) > 0.25 && stepZ(i) > cam.z + 0.4) pts.push([-0.8, stepY(i + 1), stepZ(i) + 0.05], [0.8, stepY(i + 1), stepZ(i) + 0.05]);
    const hull = convexHull(pts.map((q) => P2(...q)));
    let cx = 0, cy = 0;
    for (const q of hull) { cx += q[0]; cy += q[1]; }
    cx /= hull.length; cy /= hull.length;
    const path = (k) => { c.beginPath(); hull.forEach((q, i) => { const x = cx + (q[0] - cx) * k, y = cy + (q[1] - cy) * k; if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath(); };
    const top = P2(0, win.y0 + 1, win.z), bot = P2(0, stepY(2), stepZ(1));
    const vg = c.createLinearGradient(top[0], top[1], bot[0], bot[1]);
    vg.addColorStop(0, rgba("#b8c4f8", 0.02 * kk));
    vg.addColorStop(1, rgba("#b8c4f8", 0.004 * kk));
    const pat = K.texPattern(c, "cloud", { seed: 31 });
    patXf(pat, 1.1, 0.25, 0, 1.6, tt * 5, -tt * 4);
    c.save();
    c.globalCompositeOperation = "lighter";
    for (const k of [1.06, 0.86, 0.66, 0.45]) {
      path(k);
      c.globalAlpha = 1;
      c.fillStyle = vg;
      c.fill();
      c.globalAlpha = 0.03 * kk;
      c.fillStyle = pat;
      c.fill();
    }
    path(1);
    c.clip();
    const R = K.rng("stairdust");
    const minX = Math.min(...hull.map((q) => q[0])), maxX = Math.max(...hull.map((q) => q[0]));
    const minY = Math.min(...hull.map((q) => q[1])), maxY = Math.max(...hull.map((q) => q[1]));
    for (let i = 0; i < dustN; i++) {
      const u = R(), v = R(), ph = R(), sz = 0.6 + R() * 1.6;
      const x = lerp(minX, maxX, (u + noise(tt * 0.07 + i, 4) * 0.04 + 1) % 1);
      const y = lerp(minY, maxY, (v + tt * 0.012 * (0.5 + ph)) % 1);
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(tt * (0.6 + ph) + i));
      glow(c, x, y, sz * 1.6, "#e8ecff", 0.45 * tw * kk);
    }
    c.restore();
  };
  // ---- the light map ----
  lit(g, W, H, door ? "#3e2c30" : "#34303e", (lg) => {
    // light through the opening itself + its spill on the walls round it
    lg.fillStyle = "#ffffff";
    arch(lg);
    lg.fill();
    if (door) {
      pool(lg, winC[0], w1[1] - ww * 0.4, ww * 4.6, "#e89048", 1.0, 0.8);
      for (const sd of [-1, 1]) pool(lg, winC[0] + sd * ww * 1.6, w1[1] - ww * 0.7, ww * 1.8, "#d88040", 0.5, 1);
      pool(lg, winC[0], w1[1], ww * 2.2, "#ffc88a", 0.6, 0.45);
      // the doorway's light falls down the top treads, fading step by step
      for (let i = STEPS - 1; i >= STEPS - 6; i--) {
        const k = 1 - (STEPS - 1 - i) / 6;
        const q = P(0, stepY(i + 1), (stepZ(i) + stepZ(i + 1)) / 2);
        pool(lg, q[0], q[1], q[2] * 1.3, "#ffb870", 0.55 * k * k, 0.3);
      }
      // a doorway-shaped spill on the top three treads (widening as it comes down) + their risers,
      // and the light raking the balusters and handrail beside them
      for (let j = 0; j < 3; j++) {
        const i = STEPS - 1 - j, yT = stepY(i + 1), z0 = stepZ(i), z1 = stepZ(i + 1), k = [0.75, 0.5, 0.3][j];
        const wa = 0.72 + j * 0.16, wb = 0.72 + (j + 1) * 0.16;
        for (const [e, a] of [[0.12, 0.35], [0.05, 0.35], [-0.02, 0.4]]) {
          lg.fillStyle = rgba("#ffc890", a * k);
          quad(lg, P, [[-wb - e, yT, z0], [wb + e, yT, z0], [wa + e, yT, z1], [-wa - e, yT, z1]]);
          lg.fill();
        }
        lg.fillStyle = rgba("#ffb070", 0.35 * k);
        quad(lg, P, [[-wb, yT, z0], [wb, yT, z0], [wb, yT + RISE * 0.5, z0], [-wb, yT + RISE * 0.5, z0]]);
        lg.fill();
        for (const sd of [-1, 1]) {
          const bq = P(sd * 1.75, yT - 0.55, (z0 + z1) / 2);
          pool(lg, bq[0], bq[1], bq[2] * 0.75, "#ffb878", 0.6 * k, 1.6);
        }
      }
    } else {
      pool(lg, winC[0], winC[1], ww * 1.9, "#8a96e0", 0.6);
      // moonlight lands on the treads in the window's shape: two pane-columns split by the mullion
      moonTreads(lg, (a) => rgba("#a4b0f0", a * 0.62));
      // the moon also fills the whole stairwell softly (bounce off the pale treads and walls)
      const mc = P(0, stepY(6), stepZ(6));
      pool(lg, mc[0], mc[1], mc[2] * 6, "#5a64a8", 0.45, 0.7);
    }
    // every nosing catches a thin line of the main light (moon from above, or the door behind)
    for (let i = STEPS - 1; i >= 0; i--) {
      const z0 = stepZ(i);
      if (z0 < cam.z + 0.3) continue;
      const yT = stepY(i + 1);
      const k = door ? Math.pow(clamp(1 - (STEPS - 1 - i) / 9), 1.6) : moonOn(i) * 0.8 + 0.15;
      const a = P(-1.75, yT, z0), b = P(1.75, yT, z0);
      lg.strokeStyle = rgba(door ? "#ffc890" : "#b8c4ff", 0.75 * k);
      lg.lineWidth = Math.max(0.8, a[2] * 0.012);
      lg.beginPath(); lg.moveTo(a[0], a[1] - lg.lineWidth * 0.3); lg.lineTo(b[0], b[1] - lg.lineWidth * 0.3); lg.stroke();
    }
    flameLights(lg, 18, 1.4);
    if (o.lights) o.lights(lg, P);
    for (const b of newel) pool(lg, b[0], b[1] + b[2] * 0.6, b[2] * 1.6, CANDLE, 0.5, 0.45);
  });
  // moonlight is too dim for colour vision: the red runner under it reads grey-blue, not magenta.
  // Desaturate the moon patches (penumbra-weighted), then add their cool sheen.
  if (lit0) {
    g.save();
    g.globalCompositeOperation = "saturation";
    moonTreads(g, (a) => rgba("#8a8c90", Math.min(1, a * 2.2)));
    g.globalCompositeOperation = "lighter";
    moonTreads(g, (a) => rgba("#8a98c8", a * 0.16));
    g.restore();
  }
  // speculars (after the light map): the varnished bullnose of every step flashes where the main
  // light crosses it, and the brass rods glint
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  for (let i = STEPS - 1; i >= 0; i--) {
    const z0 = stepZ(i);
    if (z0 < cam.z + 0.3) continue;
    const yT = stepY(i + 1), yB = stepY(i);
    const k = door ? Math.pow(clamp(1 - (STEPS - 1 - i) / 5), 1.5) * 0.8 : moonOn(i);
    if (k <= 0.02) continue;
    const xa = door ? -0.7 : -0.8, xb = door ? 0.7 : 0.8;
    const a = P(xa, yT, z0), b = P(xb, yT, z0), nw = Math.max(0.8, a[2] * 0.008);
    g.strokeStyle = rgba(door ? "#ffd0a0" : "#d4ddff", 0.3 * k);
    g.lineWidth = nw;
    g.beginPath(); g.moveTo(a[0], a[1] - nw * 0.6); g.lineTo(b[0], b[1] - nw * 0.6); g.stroke();
    g.strokeStyle = rgba(door ? "#ffd0a0" : "#d4ddff", 0.12 * k);
    g.lineWidth = nw * 3;
    g.beginPath(); g.moveTo(a[0], a[1] - nw * 0.6); g.lineTo(b[0], b[1] - nw * 0.6); g.stroke();
    for (const xx of [-0.62, -0.18, 0.31, 0.7]) {
      const q = P(xx + 0.04 * Math.sin(i * 2.3), yB - 0.02, z0 - 0.01);
      glow(g, q[0], q[1] - q[2] * 0.004, Math.max(2, q[2] * 0.03), door ? "#ffe0b0" : "#e8eeff", 0.5 * k);
    }
  }
  g.restore();
  // emissive: the glass again on top (light map white there already), flames, rays
  flushFlames(g);
  if (o.after) o.after(g, P);
  if (lit0 && o.rays !== false) stairBeam(g, P, t, o.rayK == null ? 1 : o.rayK, o.dust);
  return { P, winC, ww };
}

// the mouse on step 2, in the light
const MOUSE_STEP = 2;
function shot4(g, t, W, H) {
  const p = eio(seg(t, 30, 40));
  const cam = { x: noise(t * 0.3, 7) * 0.02, y: -1.0, z: -1.4, f: 420, cx: W / 2, cy: H * 0.36 };
  const P = proj(cam);
  const m = P(0.18, stepY(MOUSE_STEP + 1), (stepZ(MOUSE_STEP) + stepZ(MOUSE_STEP + 1)) / 2);
  // a slow push that ends framed on the little grey thing in the light
  K.withCamera(g, W, H, { x: lerp(W / 2, m[0], p), y: lerp(H / 2, m[1] - 24, p), zoom: lerp(1.0, 2.3, p), shakeT: t, shakeAmt: 0.8 }, () => {
    staircase(g, t, W, H, cam, {
      rayK: 1.2, raySpread: 0.32,
      onStep: (c, P2, i) => {
        if (i !== MOUSE_STEP) return;
        const yT = stepY(i + 1);
        const q = P2(0.36, yT, lerp(stepZ(i), stepZ(i + 1), 0.55));
        // the toy, big enough to read, sitting in the brightest part of the moon patch; the moon
        // is high behind it, so its shadow falls toward the lens
        c.save();
        c.translate(q[0], q[1]);
        c.scale(1, 0.35);
        K.shadowBlob(c, q[2] * 0.03, q[2] * 0.09, q[2] * 0.26, q[2] * 0.16, { alpha: 0.55, soft: 1.2 });
        c.restore();
        bigMouse(c, q[0], q[1], q[2] * 0.54, { t, facing: -1, rot: 0.03 });
      },
    });
  });
}

// ---- SHOT 5: the toy mouse close-up, your hand picks it up ----------------------------------------------
// felt: a non-woven matted surface (baked once, neutral grey around 128 for soft-light use)
function feltTex() {
  return ownBake("f06felt", 112, 112, (u, v, out, x, y) => {
    const n = K.texNoise(u * 6, v * 6, 3, 6, 6) * 0.16 + K.texNoise(u * 28, v * 28, 5, 28, 28) * 0.12;
    const f = K.texNoise(u * 90, v * 30, 7, 90, 30) * 0.06 + K.texNoise(u * 30, v * 90, 8, 30, 90) * 0.06;
    const sp = hash(x * 1.37 + y * 7.1, 9) - 0.5;
    const pill = K.texNoise(u * 22, v * 22, 11, 22, 22) > 0.55 ? 0.12 : 0;
    const val = clamp(0.5 + n + f + sp * 0.1 + pill, 0, 1) * 255;
    out[0] = out[1] = out[2] = val;
    out[3] = 255;
  });
}
function feltFibres(w, h) {
  return own("f06fibres", w, h, (s) => {
    const R = K.rng("felt");
    for (let i = 0; i < 1800; i++) {
      const x = R() * w, y = R() * h, l = 1.5 + R() * 4, a = R() * TAU, bend = (R() - 0.5) * 2;
      s.strokeStyle = R() > 0.5 ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.13)";
      s.lineWidth = 0.4 + R() * 0.3;
      s.beginPath();
      s.moveTo(x, y);
      s.quadraticCurveTo(x + Math.cos(a + bend) * l * 0.5, y + Math.sin(a + bend) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      s.stroke();
    }
  });
}
// The toy mouse body as a photographed felt object, seen a little from above (nose left), baked once.
// Sprite units: 240 x 150, belly contact at (120, 124), nose tip ~ (20, 104), rump ~ (214, 98).
// Light: a cool moon key from above/behind (top of frame) and a warm candle from the right.
const MZ = { w: 240, h: 150, cx: 120, cy: 127, len: 196 };
// the body is a lit teardrop solid baked per pixel (true normals: a cool moon key from the top of
// frame, a warm candle from the right, felt bump + grazing fuzz sheen, floor occlusion), with a
// fibrous, never-clean silhouette. Profile: radius r(s) along the length axis s in [-1 nose, 1 rump].
const MB = { x0: 18, x1: 216, cy: 88, R: 42 };
const mbR = (s) => MB.R * Math.sqrt(Math.max(0, 1 - s * s)) * Math.pow(Math.max(0, (1 + s) / 2), 0.42) * 1.22;
function mouseBodyBake() {
  const half = (MB.x1 - MB.x0) / 2, mid = (MB.x0 + MB.x1) / 2;
  const L1 = [-0.12, -0.82, 0.56], L2 = [0.86, -0.18, 0.48];
  const n1 = Math.hypot(L1[0], L1[1], L1[2]), n2 = Math.hypot(L2[0], L2[1], L2[2]);
  return ownBake("f06mouseB5", MZ.w * 1.5, MZ.h * 1.5, (u, v, out) => {
    const X = u * MZ.w, Y = v * MZ.h;
    const s = (X - mid) / half;
    if (s <= -1.04 || s >= 1.04) { out[3] = 0; return; }
    const fz = K.texNoise(u * 40, v * 25, 4) * 0.5 + K.texNoise(u * 120, v * 75, 6) * 0.35;
    const r = Math.max(0.5, mbR(clamp(s, -0.999, 0.999)));
    const yc = MB.cy + s * 4;
    const dy = (Y - yc) / r;
    const d = Math.hypot(dy, Math.max(0, Math.abs(s) - 0.96) * 6);
    const edge = 1 + fz * 0.06;
    if (d > edge + 0.05) { out[3] = 0; return; }
    const dr = (mbR(clamp(s + 0.01, -0.999, 0.999)) - mbR(clamp(s - 0.01, -0.999, 0.999))) / (0.02 * half);
    const cdy = clamp(dy, -1, 1);
    let nx = -dr * Math.sqrt(Math.max(0, 1 - cdy * cdy)) - (Math.abs(s) > 0.9 ? Math.sign(s) * (Math.abs(s) - 0.9) * 3 : 0);
    let ny = cdy, nz = Math.sqrt(Math.max(0.02, 1 - cdy * cdy));
    // felt bump
    nx += K.texNoise(u * 70, v * 44, 8) * 0.12;
    ny += K.texNoise(u * 70 + 9, v * 44, 9) * 0.12;
    const nl = Math.hypot(nx, ny, nz);
    nx /= nl; ny /= nl; nz /= nl;
    const wrap = (dd) => Math.max(0, (dd + 0.3) / 1.3);
    const k1 = Math.max(0, (nx * L1[0] + ny * L1[1] + nz * L1[2]) / n1), k2 = wrap((nx * L2[0] + ny * L2[1] + nz * L2[2]) / n2);
    const alb = 0.22 * (0.86 + fz * 0.26);
    const ao = 1 - 0.75 * Math.pow(clamp((dy - 0.35) / 0.65), 1.5);
    const sheen = Math.pow(1 - nz, 2.5) * 0.22;
    const lr = alb * (0.05 + 0.85 * k1 + 0.5 * k2) * ao + sheen * (0.6 * k1 + 0.45 * k2);
    const lg2 = alb * (0.045 + 0.93 * k1 + 0.3 * k2) * ao + sheen * (0.68 * k1 + 0.3 * k2);
    const lb = alb * (0.06 + 1.12 * k1 + 0.16 * k2) * ao + sheen * (0.85 * k1 + 0.18 * k2);
    const gam = (c) => 255 * Math.pow(clamp(c), 1 / 2.2);
    out[0] = gam(lr); out[1] = gam(lg2); out[2] = gam(lb);
    // fibre fringe: alpha frays out over the last few percent of the radius
    out[3] = 255 * clamp((edge + 0.05 - d) / 0.09) * (d > 0.97 ? clamp(0.55 + fz * 0.6) : 1);
  });
}
function mouseBody() {
  return own("f06mouseBody5", MZ.w * 1.5, MZ.h * 1.5, (s) => {
    s.scale(1.5, 1.5);
    s.drawImage(mouseBodyBake(), 0, 0, MZ.w, MZ.h);
    s.drawImage(feltFibres(MZ.w, MZ.h), 0, 0);
    // fibres only where there is felt
    s.globalCompositeOperation = "destination-in";
    s.drawImage(mouseBodyBake(), 0, 0, MZ.w, MZ.h);
    s.globalCompositeOperation = "source-over";
    const R = K.rng("stuff");
    // chewed patch on the rump: a torn hole, grey stuffing tufting out of it
    s.save();
    const ch = new Path2D();
    ch.ellipse(184, 72, 8, 5, -0.5, 0, TAU);
    s.clip(ch);
    s.fillStyle = "#26222a";
    s.fillRect(150, 50, 50, 30);
    for (let i = 0; i < 22; i++) {
      const x = 177 + R() * 14, y = 68 + R() * 8, r = 1.1 + R() * 1.8;
      const sg = s.createRadialGradient(x - r * 0.3, y - r * 0.4, 0.2, x, y, r);
      sg.addColorStop(0, "#b8b2aa");
      sg.addColorStop(0.7, "#6e6a66");
      sg.addColorStop(1, "rgba(50,46,48,0)");
      s.fillStyle = sg;
      s.beginPath(); s.arc(x, y, r, 0, TAU); s.fill();
    }
    s.restore();
    s.strokeStyle = "rgba(150,146,150,0.55)";
    s.lineWidth = 0.4;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU, x = 184 + Math.cos(a) * 8, y = 72 + Math.sin(a) * 5;
      s.beginPath(); s.moveTo(x, y); s.lineTo(x + Math.cos(a) * (1.5 + R() * 2.5), y + Math.sin(a) * (1 + R() * 2)); s.stroke();
    }
    s.fillStyle = "rgba(24,20,24,0.55)";
    for (let k = 0; k < 8; k++) { s.beginPath(); s.ellipse(148 + hash(k, 11) * 50, 56 + hash(k, 12) * 34, 0.9, 0.6, 0, 0, TAU); s.fill(); }
    // the raised seam along the top of the back: shadowed lower lip, lit upper lip, then stitches
    const seam = new Path2D();
    seam.moveTo(40, 82);
    seam.bezierCurveTo(78, 56, 150, 48, 206, 74);
    s.lineCap = "round";
    s.strokeStyle = "rgba(14,12,18,0.32)";
    s.lineWidth = 2.2;
    s.save(); s.translate(0, 1.2); s.stroke(seam); s.restore();
    s.strokeStyle = "rgba(220,224,240,0.18)";
    s.lineWidth = 1;
    s.stroke(seam);
    s.strokeStyle = "rgba(34,30,30,0.7)";
    s.lineWidth = 0.9;
    s.setLineDash([2.2, 3.4]);
    s.save(); s.translate(0, 0.5); s.stroke(seam); s.restore();
    s.setLineDash([]);
    // ears: small, thick, dusty-pink felt flaps standing up off the head, seen at an angle
    const ear = (ex, ey, rx, ry, rot, far) => {
      s.save();
      s.translate(ex, ey);
      s.rotate(rot);
      const ep = new Path2D();
      ep.moveTo(-rx, ry * 0.55);
      ep.bezierCurveTo(-rx * 1.1, -ry * 0.6, -rx * 0.3, -ry * 1.05, rx * 0.2, -ry);
      ep.bezierCurveTo(rx * 0.95, -ry * 0.9, rx * 1.1, -ry * 0.1, rx * 0.8, ry * 0.55);
      ep.closePath();
      s.save(); s.translate(2.5, 3.5); s.filter = "blur(2.2px)"; s.fillStyle = "rgba(10,8,14,0.5)"; s.fill(ep); s.restore();
      const eg = s.createLinearGradient(rx, -ry, -rx, ry);
      eg.addColorStop(0, far ? "#8a6a6e" : "#b48e90");
      eg.addColorStop(0.55, far ? "#5e4248" : "#82585e");
      eg.addColorStop(1, far ? "#2e2026" : "#40282e");
      s.fillStyle = eg;
      s.fill(ep);
      // the cupped inside: darker, felt pile
      const ig = s.createRadialGradient(-rx * 0.1, ry * 0.1, 0.5, 0, ry * 0.05, rx * 0.8);
      ig.addColorStop(0, "rgba(60,30,38,0.75)");
      ig.addColorStop(1, "rgba(60,30,38,0)");
      s.fillStyle = ig;
      s.fill(ep);
      s.globalCompositeOperation = "soft-light";
      s.fillStyle = s.createPattern(feltTex(), "repeat");
      s.fill(ep);
      s.globalCompositeOperation = "source-over";
      // thickness of the felt along the lit rim
      K.crescent(s, ep, -1.2, 1.8, "#e2c8cc", far ? 0.2 : 0.42, [-rx - 3, -ry - 3, rx + 3, ry + 3]);
      s.restore();
    };
    ear(92, 50, 11, 13, 0.3, true);
    ear(68, 56, 13, 15, -0.2, false);
    // the eye: a satin-stitched oval of black thread, each stitch with its own sheen
    for (let k = 0; k < 5; k++) {
      const ox = 46 + k * 1.5, oy = 80 + Math.abs(k - 2) * 0.8;
      const hgt = 5.6 - Math.abs(k - 2) * 1.4;
      s.strokeStyle = "#121014";
      s.lineWidth = 1.6;
      s.beginPath(); s.moveTo(ox, oy); s.lineTo(ox + 0.7, oy + hgt); s.stroke();
      s.strokeStyle = "rgba(200,210,240,0.38)";
      s.lineWidth = 0.4;
      s.beginPath(); s.moveTo(ox - 0.2, oy + 0.8); s.lineTo(ox + 0.2, oy + hgt * 0.45); s.stroke();
    }
    // nose: an embroidered knot of faded pink thread
    const ng = s.createRadialGradient(20, 92, 0.3, 22, 95, 4.5);
    ng.addColorStop(0, "#d8a8ac");
    ng.addColorStop(0.55, "#8e5660");
    ng.addColorStop(1, "#3a1e26");
    s.fillStyle = ng;
    s.beginPath(); s.ellipse(21.5, 94.5, 4.2, 3.5, 0, 0, TAU); s.fill();
    // whiskers: clear nylon, very fine, catching the moon
    s.lineWidth = 0.4;
    for (let k = 0; k < 3; k++) {
      s.strokeStyle = "rgba(220,226,245,0.42)";
      s.beginPath(); s.moveTo(23, 93 + k * 1.6); s.quadraticCurveTo(6, 86 + k * 5, -12, 88 + k * 9); s.stroke();
      s.strokeStyle = "rgba(220,226,245,0.26)";
      s.beginPath(); s.moveTo(24, 95 + k * 1.6); s.quadraticCurveTo(14, 102 + k * 4, 2, 110 + k * 6); s.stroke();
    }
  });
}

// the twisted cotton string tail: a tube with a spiral ply, frayed at the end
function mouseTail(g, pts, w) {
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  const path = () => { g.beginPath(); g.moveTo(pts[0], pts[1]); g.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]); };
  path(); g.strokeStyle = "rgba(10,6,10,0.35)"; g.lineWidth = w * 1.6; g.stroke();
  path(); g.strokeStyle = "#b4a68e"; g.lineWidth = w; g.stroke();
  path(); g.strokeStyle = "rgba(255,246,226,0.55)"; g.lineWidth = w * 0.35; g.save(); g.translate(0, -w * 0.25); g.stroke(); g.restore();
  path(); g.setLineDash([w * 0.5, w * 0.9]); g.strokeStyle = "rgba(70,56,40,0.55)"; g.lineWidth = w * 0.9; g.stroke(); g.setLineDash([]);
  // frayed end: a little brush of loose fibres
  const ex = pts[6], ey = pts[7], dx = pts[6] - pts[4], dy = pts[7] - pts[5], dl = Math.hypot(dx, dy) || 1;
  const a0 = Math.atan2(dy / dl, dx / dl);
  g.lineWidth = Math.max(0.35, w * 0.18);
  for (let k = 0; k < 9; k++) {
    const a = a0 + (hash(k, 31) - 0.5) * 1.1, l = w * (2.5 + hash(k, 32) * 4);
    g.strokeStyle = k % 2 ? "rgba(230,220,200,0.7)" : "rgba(170,156,130,0.7)";
    g.beginPath(); g.moveTo(ex, ey); g.quadraticCurveTo(ex + Math.cos(a) * l * 0.6, ey + Math.sin(a) * l * 0.6 + w, ex + Math.cos(a) * l, ey + Math.sin(a) * l); g.stroke();
  }
  g.restore();
}
// the toy mouse: (x, y) = belly contact point, L = body length px, facing -1 = nose left.
// o: t, rot, dangle (0 on the floor .. 1 hanging from your fingers), shadow (0..1 contact shadow)
function bigMouse(g, x, y, L, o = {}) {
  const t = o.t || 0, dangle = o.dangle || 0;
  const k = L / MZ.len;
  g.save();
  g.translate(x, y);
  g.rotate(o.rot || 0);
  g.scale((o.facing || -1) === -1 ? k : -k, k);
  if (o.shadow !== 0 && dangle < 0.98) {
    // contact occlusion (tight) + the soft shadow the moon throws toward us
    K.shadowBlob(g, 0, 0, 90, 8, { alpha: 0.95 * (1 - dangle), soft: 0.8 });
    K.shadowBlob(g, 6, 16, 100, 18, { alpha: 0.6 * (1 - dangle), soft: 1.3 });
  }
  // tail behind the body: from the rump, lying in a lazy S on the floor, or hanging when lifted
  const sw = Math.sin(t * 1.3) * 4 * (0.3 + dangle);
  const tl = [88, -26, 128 + sw, -8 + dangle * 40, 150 - sw, 26 + dangle * 80, 186 + sw * 0.5 - dangle * 40, 14 + dangle * 150];
  mouseTail(g, tl, 3.2);
  g.drawImage(mouseBody(), -MZ.cx, -MZ.cy, MZ.w, MZ.h);
  g.restore();
}
// A long-lens macro looking DOWN onto the third step: the tread (runner carpet with its gold border,
// the dark polished oak of the stair beyond it), the next riser filling the top of frame, its brass
// stair rod throwing candle glints that the lens turns into bokeh. Moonlight from the window up the
// stairs falls across the tread in a soft window-shaped patch; a warm newel candle sits off-frame
// right. The static set is baked once (sharp + blurred); a focus band is cut from the sharp copy.
const C5 = { x: -0.75, y: -0.34, z: 0, f: 1500, cx: 480, cy: -180 };
const T5 = { y: 0, zN: 0.76, zR: 1.46 }; // tread plane, near edge (below frame), riser face
function stepSet5(W, H) {
  return own("f06step5", W, H, (s) => {
    const cam = C5, P = proj(cam);
    s.fillStyle = "#120a0c";
    s.fillRect(0, 0, W, H);
    // riser: runner carpet over oak, a brass rod clamped at its foot
    fPlane(s, cam, mat("oak", { Z: T5.zR, x0: -2, x1: 0.95, y0: -0.6, y1: T5.y, k: 3.2 }));
    fPlane(s, cam, mat("runner", { Z: T5.zR - 0.001, x0: -0.95, x1: 0.95, y0: -0.6, y1: T5.y, k: 7 }));
    // tread: oak at the side, the runner (pile carpet) with a woven gold border
    hPlane(s, cam, mat("oak", { Y: T5.y, x0: -2, x1: 2, z0: T5.zN - 0.2, z1: T5.zR, k: 2.4, step: 2 }));
    hPlane(s, cam, mat("runner", { Y: T5.y, x0: -0.95, x1: 0.95, z0: T5.zN - 0.2, z1: T5.zR, k: 9, step: 2 }));
    for (const [a, b] of [[-0.95, -0.915], [0.915, 0.95]]) {
      hPlane(s, cam, mat("border", { Y: T5.y, x0: a, x1: b, z0: T5.zN - 0.2, z1: T5.zR, k: 14, step: 2 }));
    }
    // carpet pile relief: a fine noise in soft-light so it reads as tufted, not printed
    s.save();
    quad(s, P, [[-0.95, T5.y, T5.zN - 0.2], [0.95, T5.y, T5.zN - 0.2], [0.95, T5.y, T5.zR], [-0.95, T5.y, T5.zR]]);
    s.clip();
    K.texRect(s, "relief", 0, 0, W, H, { scale: 90, mode: "soft-light", alpha: 0.7, tex: { seed: 66 } });
    s.restore();
    // brass rod in its clips at the foot of the riser
    const r0 = P(-0.96, T5.y - 0.012, T5.zR - 0.012), r1 = P(0.96, T5.y - 0.012, T5.zR - 0.012);
    const rw = 0.011 * r0[2];
    const rg = s.createLinearGradient(0, r0[1] - rw, 0, r0[1] + rw);
    rg.addColorStop(0, "#4a3410");
    rg.addColorStop(0.3, "#e8c878");
    rg.addColorStop(0.5, "#9a7428");
    rg.addColorStop(1, "#2a1a06");
    s.fillStyle = rg;
    s.fillRect(r0[0], r0[1] - rw, r1[0] - r0[0], rw * 2);
    // where riser meets tread: occlusion, and the rod's shadow on the carpet
    const ao = P(0, T5.y, T5.zR);
    K.aoEdge(s, -50, ao[1], W + 50, ao[1], { width: 40, alpha: 0.55, side: -1 });
    // ---- light (baked: the moon patch and the candle are static; flicker is added per frame) ----
    const L = K.makeCanvas(W, H), lg = L.getContext("2d");
    lg.fillStyle = "#2a2232";
    lg.fillRect(0, 0, W, H);
    lg.globalCompositeOperation = "lighter";
    // the window patch: a soft parallelogram of moonlight (mullion shadow across it)
    const win = (x0, x1, z0, z1) => {
      const a = P(x0, T5.y, z0), b = P(x1, T5.y, z0), c = P(x1 + 0.05, T5.y, z1), d = P(x0 + 0.05, T5.y, z1);
      lg.beginPath(); lg.moveTo(a[0], a[1]); lg.lineTo(b[0], b[1]); lg.lineTo(c[0], c[1]); lg.lineTo(d[0], d[1]); lg.closePath(); lg.fill();
    };
    lg.save();
    lg.filter = "blur(14px)";
    lg.fillStyle = "rgba(150,164,235,0.75)";
    win(-0.92, -0.76, 0.8, 1.44);
    win(-0.73, -0.5, 0.8, 1.44);
    lg.restore();
    // warm candle from off-frame right: falls off across the tread and up the riser
    K.lightPool(lg, W * 1.12, H * 0.62, W * 0.95, "#ff9a48", { intensity: 0.7 });
    K.lightPool(lg, W * 1.05, H * 0.15, W * 0.5, "#ff9a48", { intensity: 0.35 });
    s.globalCompositeOperation = "multiply";
    s.drawImage(L, 0, 0, W, H);
    s.globalCompositeOperation = "source-over";
  });
}
function stepSet5Blur(W, H, px) {
  return own("f06step5b" + px, W, H, (s) => { s.filter = `blur(${K.qblur(px)}px)`; s.drawImage(stepSet5(W, H), -6, -6, W + 12, H + 12); });
}
// the in-focus slice: the sharp set, faded out above and below the plane of the mouse
function stepSet5Sharp(W, H) {
  return own("f06step5s", W, H, (s) => {
    s.drawImage(stepSet5(W, H), 0, 0, W, H);
    s.globalCompositeOperation = "destination-in";
    const m = s.createLinearGradient(0, 0, 0, H);
    m.addColorStop(0, "rgba(0,0,0,0)");
    m.addColorStop(0.38, "rgba(0,0,0,0.1)");
    m.addColorStop(0.52, "rgba(0,0,0,1)");
    m.addColorStop(0.74, "rgba(0,0,0,1)");
    m.addColorStop(1, "rgba(0,0,0,0.25)");
    s.fillStyle = m;
    s.fillRect(0, 0, W, H);
  });
}
// ---- the POV hand (shot 5) ------------------------------------------------------------------------------
// A kid's LEFT hand, palm up, cupping the toy mouse, seen from slightly above with the fingers pointing
// away from the lens (up-left in frame) and the wrist coming in from the lower right. The thumb is on
// the near side and closes over the mouse. Everything is baked ONCE per pixel from a height field built
// out of anatomical volumes (palm with a cupped hollow, thenar and hypothenar pads, knuckle pads, three
// tapering phalanges per finger, flexion creases, palm lines), then lit in the shot's real light:
//   - a warm 1900 K candle off-frame right and low: wrapped diffuse with a red shift at the terminator,
//   - subsurface transmission (red-orange) ONLY on the thin edges that face the candle,
//   - a cool moon fill from above (the stair window), a soft skin specular broken up by pores,
//   - cavity occlusion from the height field (between fingers, in the palm hollow).
// The palm/fingers and the thumb are two sprites so the mouse can sit ON the fingers and UNDER the thumb.
const HAND = { w: 300, h: 540, res: 1.3, rot: -0.64, sit: [166, 236], pivot: [104, 338] };
const H_CANDLE = [0.92, 0.1, 0.42], H_MOON = [-0.2, -0.8, 0.56];
const v3n = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const toLocal = (v, rot) => { const c = Math.cos(-rot), s = Math.sin(-rot); return v3n([v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]); };
// a finger as three tapering phalanges (~0.85 per joint), curling up toward the lens
function finger(kx, ky, ang, len, r0, curl, out) {
  const L = [0.5 * len, 0.29 * len, 0.23 * len], Z = [6, 28, 50, 64];
  let x = kx, y = ky, a = ang, r = r0;
  for (let i = 0; i < 3; i++) {
    const x1 = x + Math.sin(a) * L[i], y1 = y - Math.cos(a) * L[i];
    out.push({ k: "cap", ax: x, ay: y, bx: x1, by: y1, ra: r, rb: r * 0.93, za: Z[i], zb: Z[i + 1], f: 1, crease: i ? 0.55 : 0.4, tip: i === 2 });
    x = x1; y = y1; a += curl; r *= 0.85;
  }
}
function handPrims() {
  const P = [];
  // palm: a low dome, cupped (hollow) in the middle; the fleshy pads round it
  P.push({ k: "ell", x: 168, y: 300, rx: 80, ry: 104, rot: 0, h: 24, z: 0 });
  P.push({ k: "ell", x: 112, y: 334, rx: 44, ry: 62, rot: 0.38, h: 36, z: 0 });   // thenar (thumb ball)
  P.push({ k: "ell", x: 228, y: 318, rx: 31, ry: 72, rot: -0.08, h: 27, z: 0 });  // hypothenar
  for (const [x, y] of [[124, 216], [158, 206], [192, 211], [222, 226]]) P.push({ k: "ell", x, y, rx: 19, ry: 15, rot: 0, h: 20, z: 6 });
  P.push({ k: "dent", x: 166, y: 282, rx: 50, ry: 58, d: 13 });
  // wrist and forearm toward the lens
  P.push({ k: "cap", ax: 172, ay: 392, bx: 186, by: 560, ra: 60, rb: 58, za: 0, zb: -8, f: 0, hk: 0.32 });
  // fingers: index (thumb side, left) .. pinky; cupped, so foreshortened and close together
  finger(125, 214, -0.08, 100, 15.5, 0.06, P);
  finger(158, 205, 0.0, 110, 16, 0.02, P);
  finger(191, 210, 0.07, 103, 15, -0.03, P);
  finger(221, 225, 0.15, 84, 12.6, -0.07, P);
  // palm lines (creases): heart, head and life lines
  P.push({ k: "line", pts: [[250, 256], [222, 246], [190, 244], [160, 250], [138, 236]], w: 1.6, a: 0.5 });
  P.push({ k: "line", pts: [[104, 268], [140, 272], [178, 284], [214, 296]], w: 1.5, a: 0.45 });
  P.push({ k: "line", pts: [[112, 262], [130, 300], [140, 340], [150, 384]], w: 1.7, a: 0.5 });
  return P;
}
function thumbPrims() {
  // the thumb's metacarpal root fades into the thenar (feathered alpha near the pivot)
  return [
    { k: "cap", ax: 104, ay: 338, bx: 96, by: 294, ra: 23, rb: 20, za: 14, zb: 32, f: 0.6, crease: 0 },
    { k: "cap", ax: 96, ay: 294, bx: 114, by: 256, ra: 18.5, rb: 16.5, za: 32, zb: 50, f: 1, crease: 0.5 },
    { k: "cap", ax: 114, ay: 256, bx: 146, by: 232, ra: 15.6, rb: 13.4, za: 50, zb: 58, f: 1, crease: 0.5, tip: true, nail: true },
  ];
}
// The bake is a resumable JOB: warm() advances it a few ms per frame during the shot before, so the
// ~0.7 MPixel per-pixel skin solve never stalls a frame; skinBake() finishes it at once if needed.
const JOBS = new Map();
const hyp = (a, b) => Math.sqrt(a * a + b * b);
function skinJob(key, prims, o = {}) {
  let J = JOBS.get(key);
  if (J) return J;
  const { w, h, res } = HAND;
  const PW = Math.round(w * res), PH = Math.round(h * res), N = PW * PH;
  const Hf = new Float32Array(N), A = new Float32Array(N), F = new Float32Array(N), C = new Float32Array(N), NL = new Float32Array(N), TP = new Float32Array(N);
  const caps = prims.filter((p) => p.k === "cap"), ells = prims.filter((p) => p.k === "ell");
  const dents = prims.filter((p) => p.k === "dent"), lines = prims.filter((p) => p.k === "line");
  for (const p of lines) {
    const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]), m = p.w * 3;
    p.x0 = Math.min(...xs) - m; p.x1 = Math.max(...xs) + m; p.y0 = Math.min(...ys) - m; p.y1 = Math.max(...ys) + m;
  }
  const KS = 0.35;
  let phase = 0, row = 0, Bl = null, img = null, D = null, Lc, Lm, Hc, Hm, lcxy;
  const gam = (c) => 255 * Math.pow(clamp(c), 1 / 2.2);
  const row1 = (py) => {
      const Y = (py + 0.5) / res;
      // only the primitives this row can touch
      const rE = ells.filter((p) => Math.abs(Y - p.y) <= Math.max(p.rx, p.ry) + 2);
      const rC = caps.filter((p) => Y >= Math.min(p.ay, p.by) - p.ra - 2 && Y <= Math.max(p.ay, p.by) + p.ra + 2);
      const rL = lines.filter((p) => Y >= p.y0 && Y <= p.y1);
      const rD = dents.filter((p) => Math.abs(Y - p.y) < p.ry);
      if (!rE.length && !rC.length) return;
      for (let px = 0; px < PW; px++) {
        const X = (px + 0.5) / res, i = py * PW + px;
        let es = 0, cov = 0, fw = 0, cr = 0, nl = 0, tp = 0;
        for (const p of rE) {
          const dx = X - p.x, dy = Y - p.y;
          if (Math.abs(dx) > p.rx + 2 || Math.abs(dy) > Math.max(p.rx, p.ry) + 2) continue;
          const c = Math.cos(p.rot), sn = Math.sin(p.rot);
          const u = (dx * c + dy * sn) / p.rx, v = (-dx * sn + dy * c) / p.ry;
          const q = hyp(u, v);
          const cv = clamp((1 - q) * Math.min(p.rx, p.ry) * res + 0.5);
          if (cv <= 0) continue;
          const hh = p.z + p.h * Math.sqrt(Math.max(0, 1 - q * q));
          es += Math.exp(KS * hh) * cv;
          cov = Math.max(cov, cv);
        }
        for (const p of rC) {
          const mnx = Math.min(p.ax, p.bx) - p.ra - 2, mxx = Math.max(p.ax, p.bx) + p.ra + 2;
          const mny = Math.min(p.ay, p.by) - p.ra - 2, mxy = Math.max(p.ay, p.by) + p.ra + 2;
          if (X < mnx || X > mxx || Y < mny || Y > mxy) continue;
          const dx = p.bx - p.ax, dy = p.by - p.ay, L = hyp(dx, dy);
          const ut = ((X - p.ax) * dx + (Y - p.ay) * dy) / (L * L), u = clamp(ut);
          const qx = p.ax + dx * u, qy = p.ay + dy * u;
          const d = hyp(X - qx, Y - qy), r = lerp(p.ra, p.rb, u);
          const cv = clamp((r - d) * res + 0.5);
          if (cv <= 0) continue;
          const hh = lerp(p.za, p.zb, u) + Math.sqrt(Math.max(0, r * r - d * d)) * (p.hk || 1);
          es += Math.exp(KS * hh) * cv;
          cov = Math.max(cov, cv);
          fw = Math.max(fw, cv * (p.f || 0));
          if (p.crease) cr = Math.max(cr, p.crease * Math.exp(-(((ut * L) / 2.6) ** 2)) * cv * clamp(1.15 - d / r));
          if (p.tip) tp = Math.max(tp, cv * clamp((ut - 0.45) * 2));
          if (p.nail) {
            // the thumbnail: a rounded plate on the top of the distal phalanx, toward the tip
            const side = ((X - qx) * -dy + (Y - qy) * dx) / L;
            const nu = (ut - 0.42) / 0.62, nv = side / (r * 0.62);
            const nq = nu * nu * 0 + nv * nv + Math.max(0, Math.abs(nu - 0.5) * 2 - 0.6) ** 2 * 6;
            if (ut > 0.36 && ut < 1.12) nl = Math.max(nl, clamp((1 - nq) * 4) * clamp((ut - 0.38) * 14) * cv);
          }
        }
        if (cov <= 0) continue;
        let hh = Math.log(Math.max(1e-6, es / Math.max(cov, 1e-3))) / KS;
        for (const p of rD) {
          const u = (X - p.x) / p.rx, v = (Y - p.y) / p.ry, q = u * u + v * v;
          if (q < 1) hh -= p.d * (1 - q) * (1 - q);
        }
        for (const p of rL) {
          if (X < p.x0 || X > p.x1) continue;
          let dm = 1e9;
          for (let k = 0; k + 1 < p.pts.length; k++) {
            const [ax, ay] = p.pts[k], [bx, by] = p.pts[k + 1];
            const dx = bx - ax, dy = by - ay, uu = clamp(((X - ax) * dx + (Y - ay) * dy) / (dx * dx + dy * dy));
            dm = Math.min(dm, hyp(X - ax - dx * uu, Y - ay - dy * uu));
          }
          cr = Math.max(cr, p.a * Math.exp(-((dm / p.w) ** 2)));
        }
        hh -= cr * 1.6 - nl * 1.2;
        Hf[i] = hh; A[i] = cov; F[i] = fw; C[i] = cr; NL[i] = nl; TP[i] = tp;
      }
  };
  const blurPass = () => {
    // cavity occlusion: how far each point sits below the local average height (separable box blur)
    const R = Math.round(9 * res), tmp = new Float32Array(N);
    Bl = new Float32Array(N);
    for (let y = 0; y < PH; y++) {
      let acc = 0, cnt = 0;
      for (let x = -R; x < PW; x++) {
        const xa = x + R, xr = x - R - 1;
        if (xa < PW) { acc += A[y * PW + xa] > 0.5 ? Hf[y * PW + xa] : 0; cnt++; }
        if (xr >= 0) { acc -= A[y * PW + xr] > 0.5 ? Hf[y * PW + xr] : 0; cnt--; }
        if (x >= 0) tmp[y * PW + x] = acc / cnt;
      }
    }
    for (let x = 0; x < PW; x++) {
      let acc = 0, cnt = 0;
      for (let y = -R; y < PH; y++) {
        const ya = y + R, yr = y - R - 1;
        if (ya < PH) { acc += tmp[ya * PW + x]; cnt++; }
        if (yr >= 0) { acc -= tmp[yr * PW + x]; cnt--; }
        if (y >= 0) Bl[y * PW + x] = acc / cnt;
      }
    }
    Lc = toLocal(H_CANDLE, o.rot); Lm = toLocal(H_MOON, o.rot);
    Hc = v3n([Lc[0], Lc[1], Lc[2] + 1]); Hm = v3n([Lm[0], Lm[1], Lm[2] + 1]);
    lcxy = hyp(Lc[0], Lc[1]) || 1;
    img = new ImageData(PW, PH); D = img.data;
  };
  const row3 = (y) => {
      for (let x = 1; x < PW - 1; x++) {
        const i = y * PW + x;
        const a = A[i];
        if (a <= 0) continue;
        const hx0 = A[i - 1] > 0 ? Hf[i - 1] : Hf[i] - 6, hx1 = A[i + 1] > 0 ? Hf[i + 1] : Hf[i] - 6;
        const hy0 = A[i - PW] > 0 ? Hf[i - PW] : Hf[i] - 6, hy1 = A[i + PW] > 0 ? Hf[i + PW] : Hf[i] - 6;
        let gx = ((hx1 - hx0) * res) / 2, gy = ((hy1 - hy0) * res) / 2;
        const gl = hyp(gx, gy);
        if (gl > 6) { gx *= 6 / gl; gy *= 6 / gl; }
        const X = x / res, Y = y / res;
        // pores + fine skin texture: tiny height noise into the normal, and albedo mottling
        const pn = K.texNoise(X * 0.9, Y * 0.9, 41) * 0.5 + K.texNoise(X * 2.3, Y * 2.3, 42) * 0.5;
        gx += K.texNoise(X * 1.7, Y * 1.7, 43) * 0.06;
        gy += K.texNoise(X * 1.7 + 9, Y * 1.7, 44) * 0.06;
        const nn = 1 / Math.sqrt(gx * gx + gy * gy + 1), n = [-gx * nn, -gy * nn, nn];
        const ao = clamp(1 - Math.max(0, Bl[i] - Hf[i]) * 0.03, 0.4, 1);
        // albedo: #c98f76 skin, pinker fingertips and creases, a paler palm, a pink-white thumbnail
        const mott = 1 + K.texNoise(X * 0.12, Y * 0.12, 45) * 0.06 + pn * 0.03;
        let ar = 0.592 * mott, ag = 0.28 * mott, ab = 0.184 * mott;
        const tip = TP[i];
        ar += tip * 0.04; ag -= tip * 0.03; ab -= tip * 0.01;
        const cr = C[i];
        ar *= 1 - cr * 0.22; ag *= 1 - cr * 0.34; ab *= 1 - cr * 0.3;
        const nl = NL[i];
        ar = lerp(ar, 0.74, nl * 0.8); ag = lerp(ag, 0.5, nl * 0.8); ab = lerp(ab, 0.44, nl * 0.8);
        // candle: wrapped diffuse (skin scatters light past the terminator) with a red shift there
        const dc = n[0] * Lc[0] + n[1] * Lc[1] + n[2] * Lc[2];
        const wrap = Math.max(0, (dc + 0.45) / 1.45);
        const term = clamp(1 - Math.abs(dc - 0.02) * 3.2);
        const IC = 1.25 * (o.candle == null ? 1 : o.candle);
        let r = ar * wrap * 1.0 * IC + ar * term * 0.16 * IC;
        let g = ag * wrap * 0.55 * IC + ag * term * 0.03 * IC;
        let b = ab * wrap * 0.24 * IC;
        // moon: a cool fill from above
        const dm = Math.max(0, n[0] * Lm[0] + n[1] * Lm[1] + n[2] * Lm[2]);
        r += ar * dm * 0.2; g += ag * dm * 0.27; b += ab * dm * 0.5;
        r *= ao; g *= ao; b *= ao;
        r += 0.012 * ao; g += 0.01 * ao; b += 0.016 * ao;
        // transmission: light through the thin edges that face the candle glows red-orange
        const nxy = hyp(n[0], n[1]) || 1;
        const facing = clamp((n[0] * Lc[0] + n[1] * Lc[1]) / (nxy * lcxy));
        const edge = Math.pow(clamp(1 - n[2]), 1.4);
        const thin = 0.35 + 0.65 * F[i];
        const tr = edge * facing * thin * 0.75 * IC;
        r += tr * 0.95; g += tr * 0.26; b += tr * 0.07;
        // specular: a broad soft sheen (skin oil) broken up by pores; the nail is glossier
        const sh = 0.5 + 0.5 * pn;
        const sc = Math.pow(Math.max(0, n[0] * Hc[0] + n[1] * Hc[1] + n[2] * Hc[2]), 22 + nl * 60) * (0.1 + nl * 0.5) * sh * IC;
        const sm = Math.pow(Math.max(0, n[0] * Hm[0] + n[1] * Hm[1] + n[2] * Hm[2]), 26 + nl * 60) * (0.05 + nl * 0.3) * sh;
        r += sc * 1.0 + sm * 0.55; g += sc * 0.7 + sm * 0.65; b += sc * 0.45 + sm * 0.95;
        let al = a;
        if (o.feather) { const [fx, fy, f0, f1] = o.feather; al *= clamp((hyp(X - fx, Y - fy) - f0) / (f1 - f0)); }
        const j = i * 4;
        D[j] = gam(r); D[j + 1] = gam(g); D[j + 2] = gam(b); D[j + 3] = 255 * al;
      }
  };
  J = { done: false, canvas: null };
  J.step = (budgetMs) => {
    const t0 = performance.now();
    while (!J.done) {
      if (phase === 0) { row1(row++); if (row >= PH) { phase = 1; } }
      else if (phase === 1) { blurPass(); phase = 2; row = 1; }
      else if (phase === 2) { row3(row++); if (row >= PH - 1) phase = 3; }
      else {
        J.canvas = own(key, w, h, (s) => {
          const c = K.makeCanvas(PW, PH);
          c.getContext("2d").putImageData(img, 0, 0);
          s.drawImage(c, 0, 0, w, h);
          if (o.after) o.after(s);
        });
        J.done = true;
        img = D = null;
      }
      if ((row & 7) === 0 && performance.now() - t0 > budgetMs) break;
    }
    return J;
  };
  JOBS.set(key, J);
  return J;
}
function skinBake(key, prims, o = {}) { return skinJob(key, prims, o).step(Infinity).canvas; }
const HAND_OPTS = {
    rot: HAND.rot,
    after: (s) => {
      // the yellow hoodie's ribbed knit cuff round the wrist, and the red string with his bell
      s.save();
      const cy = 470;
      const cuff = new Path2D();
      cuff.moveTo(104, cy + 6);
      cuff.quadraticCurveTo(180, cy - 18, 262, cy - 2);
      cuff.lineTo(272, 545);
      cuff.lineTo(96, 545);
      cuff.closePath();
      const cg = s.createLinearGradient(100, 0, 272, 0);
      cg.addColorStop(0, "#3a2a08");
      cg.addColorStop(0.45, "#8a6a14");
      cg.addColorStop(0.85, "#d8a828");
      cg.addColorStop(1, "#6a4a0c");
      s.fillStyle = cg;
      s.fill(cuff);
      s.save();
      s.clip(cuff);
      s.strokeStyle = "rgba(20,10,0,0.35)";
      s.lineWidth = 2;
      for (let x = 96; x < 280; x += 7) { s.beginPath(); s.moveTo(x, cy - 30); s.lineTo(x + 6, 545); s.stroke(); }
      s.strokeStyle = "rgba(255,230,140,0.18)";
      s.lineWidth = 1.2;
      for (let x = 99; x < 280; x += 7) { s.beginPath(); s.moveTo(x, cy - 30); s.lineTo(x + 6, 545); s.stroke(); }
      K.texRect(s, "fabric", 90, cy - 30, 190, 90, { scale: 40, mode: "soft-light", alpha: 0.6, tex: { seed: 77 } });
      // occlusion on the knit just under its rolled edge
      const og = s.createLinearGradient(0, cy - 12, 0, cy + 16);
      og.addColorStop(0, "rgba(0,0,0,0)");
      og.addColorStop(0.5, "rgba(0,0,0,0.35)");
      og.addColorStop(1, "rgba(0,0,0,0)");
      s.fillStyle = og;
      s.fillRect(90, cy - 12, 190, 28);
      s.restore();
      // the cuff shades the wrist just above it
      s.globalCompositeOperation = "source-atop";
      const wg = s.createLinearGradient(0, cy - 40, 0, cy);
      wg.addColorStop(0, "rgba(20,6,2,0)");
      wg.addColorStop(1, "rgba(20,6,2,0.5)");
      s.fillStyle = wg;
      s.fillRect(90, cy - 40, 190, 40);
      s.globalCompositeOperation = "source-over";
      // red cotton string with the little brass bell, on the near side of the wrist
      s.lineCap = "round";
      s.strokeStyle = "#5a1410";
      s.lineWidth = 3.4;
      s.beginPath(); s.moveTo(112, 430); s.quadraticCurveTo(176, 418, 240, 426); s.stroke();
      s.strokeStyle = "#b8403a";
      s.lineWidth = 1.6;
      s.setLineDash([2, 1.6]);
      s.beginPath(); s.moveTo(112, 429); s.quadraticCurveTo(176, 417, 240, 425); s.stroke();
      s.setLineDash([]);
      const bx = 128, by = 440;
      K.shadowBlob(s, bx + 3, by + 5, 7, 4, { alpha: 0.6 });
      const bg = s.createRadialGradient(bx + 3, by - 3, 0.5, bx, by, 9);
      bg.addColorStop(0, "#fff2c0");
      bg.addColorStop(0.3, "#d6a040");
      bg.addColorStop(0.8, "#6a4612");
      bg.addColorStop(1, "#2a1a04");
      s.fillStyle = bg;
      s.beginPath(); s.arc(bx, by, 8.5, 0, TAU); s.fill();
      s.strokeStyle = "rgba(40,22,4,0.9)";
      s.lineWidth = 1.1;
      s.beginPath(); s.moveTo(bx - 7, by + 1); s.quadraticCurveTo(bx, by + 2.6, bx + 7, by + 1); s.moveTo(bx, by + 2); s.lineTo(bx, by + 7.5); s.stroke();
      s.restore();
    },
};
const THUMB_OPTS = { rot: HAND.rot, feather: [HAND.pivot[0], HAND.pivot[1], 18, 46] };
const handJob = () => skinJob("f06hand5", handPrims(), HAND_OPTS);
const thumbJob = () => skinJob("f06thumb5", thumbPrims(), THUMB_OPTS);
function handSprite() { return handJob().step(Infinity).canvas; }
function thumbSprite() { return thumbJob().step(Infinity).canvas; }
// lens bokeh: a disc as a real aperture renders it out of focus - a flat field with faint onion
// rings (aspheric polish), a brighter rim, lateral colour (red outside, blue inside the rim), and
// cut to a cat's eye by the lens barrel toward the frame edges (eye = 0 .. 0.45). Baked per pixel.
function bokehDisc(color, eye) {
  const [cr, cg, cb] = K.parseColor(color);
  return ownBake("f06bok:" + color + ":" + eye, 64, 64, (u, v, out) => {
    const x = u * 2 - 1 + 1 / 64, y = v * 2 - 1 + 1 / 64, r = Math.hypot(x, y) / 0.94;
    const m = clamp((1 - Math.hypot(x - eye * 0.9, y) / 0.94) * 30);
    const ch = (rc) => {
      const inside = clamp((rc - r) * 26);
      const rim = Math.exp(-(((r - rc * 0.93) / 0.07) ** 2));
      const onion = 0.018 * Math.sin(r * 26);
      return inside * (0.42 + onion + 0.5 * rim);
    };
    const vr = ch(1.0) * m, vg = ch(0.975) * m, vb = ch(0.95) * m;
    const a = Math.max(vr, vg, vb, 1e-4);
    out[0] = (cr * vr) / a; out[1] = (cg * vg) / a; out[2] = (cb * vb) / a; out[3] = 255 * a;
  });
}
// the brass rods and the newel candle's glints, thrown far out of focus: 12 discs on three depth bands
// that follow the stair perspective, all inside the warm candle-lit right of frame
const BOKEH5 = (() => {
  const out = [];
  const bands = [[4, -66, -0.07, 9, 0.75], [5, 2, 0.03, 18, 1], [3, 150, 0.13, 34, 0.45]];
  let n = 0;
  for (const [cnt, dy, slope, r, al] of bands) {
    for (let i = 0; i < cnt; i++, n++) {
      const x = 540 + ((i + 0.3 + hash(n, 71) * 0.6) / cnt) * 400;
      out.push({ x, dy: dy + (x - 480) * slope + (hash(n, 72) - 0.5) * 10, r: r * (0.5 + hash(n, 73) * 1.1), a: al * (0.45 + hash(n, 74) * 0.55),
        color: ["#ffcf8a", "#ffb860", "#ffc070"][n % 3], seed: n * 2.1 });
    }
  }
  return out;
})();
function drawBokeh5(g, rodY, t, k) {
  g.save();
  g.globalCompositeOperation = "lighter";
  for (const b of BOKEH5) {
    const y = rodY + b.dy, dx = b.x - 480, dy = y - 270;
    const edge = Math.hypot(dx / 480, dy / 270);
    const eye = Math.round(clamp((edge - 0.35) * 0.9, 0, 0.45) / 0.15) * 0.15;
    const r = b.r;
    g.globalAlpha = k * b.a * clamp(0.75 + 2.2 * (flick(t, b.seed) - 1));
    g.save();
    g.translate(b.x, y);
    g.rotate(Math.atan2(-dy, -dx));
    g.drawImage(bokehDisc(b.color, eye), -r, -r, r * 2, r * 2);
    g.restore();
  }
  g.restore();
}
function shot5(g, t, W, H, held) {
  const reach = eio(seg(t, 42.4, 45.3));
  const grab = smooth(seg(t, 45.0, 45.8));
  const lift = held ? 1 : eio(seg(t, 46.0, 49.6));
  // a slow, breathing push-in on the long lens; it drifts up with the lift
  const push = eio(seg(t, 40, 50));
  K.withCamera(g, W, H, { x: W / 2 + 10 * lift, y: H / 2 + 18 * lift, zoom: 1.02 + 0.05 * push, shakeT: t, shakeAmt: 1.3 }, () => {
    // focus pulls from the tread to the hand as it lifts toward the lens
    g.drawImage(stepSet5Blur(W, H, 9), 0, 0, W, H);
    g.save();
    g.globalAlpha = 1 - lift * 0.8;
    g.drawImage(stepSet5Sharp(W, H), 0, 0, W, H);
    g.restore();
    // candle flicker on the set (warm, from the right)
    const fk = flick(t, 4.2) - 1;
    pool(g, W * 1.1, H * 0.6, W * 0.8, "#ff8a3a", 0.08 + fk * 0.6);
    const rodY = proj(C5)(0, T5.y - 0.012, T5.zR - 0.012)[1];
    drawBokeh5(g, rodY, t, 0.55);
    // the mouse lies on the tread; the fingers slide under it, it rides up onto them, the thumb
    // closes over it, and the whole cupped hand lifts toward the lens
    const M0 = proj(C5)(-0.7, T5.y, 1.0);
    const on = smooth(seg(reach, 0.82, 1));
    const mx = lerp(M0[0], 600, lift), my = lerp(M0[1], 300, lift) - 5 * on;
    const L = 160 * (1 + 0.35 * lift);
    const S = 0.94 * (1 + 0.35 * lift);
    const rot = HAND.rot + 0.07 * lift - 0.06 * (1 - reach);
    const wd = [-Math.sin(rot), Math.cos(rot)];
    const ax = mx + wd[0] * 470 * (1 - reach), ay = my + 6 + wd[1] * 470 * (1 - reach);
    const toHand = (c) => { c.translate(ax, ay); c.rotate(rot); c.scale(S, S); c.translate(-HAND.sit[0], -HAND.sit[1]); };
    if (reach > 0.001) {
      // the hand's shadow on the tread (the moon is above): soft, under it and toward the lens
      if (lift < 0.95) K.shadowBlob(g, ax + 30, ay + 60, 150 * S, 70 * S, { alpha: 0.45 * reach * (1 - lift), soft: 1.4 });
      const HL = K.layer(W, H, "f06hand");
      HL.g.setTransform(g.getTransform());
      HL.g.save();
      toHand(HL.g);
      HL.g.drawImage(handSprite(), 0, 0, HAND.w, HAND.h);
      HL.g.restore();
      // where the mouse rests in the palm: contact shadow + occlusion, only on the skin
      if (on > 0.01) {
        HL.g.globalCompositeOperation = "source-atop";
        K.shadowBlob(HL.g, mx + L * 0.04, my + L * 0.03, L * 0.44, L * 0.13, { alpha: 0.75 * on, soft: 1.2, color: "#1a0604" });
        K.shadowBlob(HL.g, mx, my - L * 0.01, L * 0.36, L * 0.07, { alpha: 0.6 * on, soft: 0.6, color: "#100302" });
        HL.g.globalCompositeOperation = "source-over";
      }
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(HL.canvas, 0, 0);
      g.restore();
    }
    bigMouse(g, mx, my, L, { t, facing: -1, rot: -0.12 * lift + 0.04, dangle: lift, shadow: on > 0.5 ? 0 : 1 });
    if (reach > 0.001) {
      // the thumb, on the near side, closes over the mouse (its soft shadow falls on the felt first)
      const ta = lerp(-0.6, 0, grab);
      g.save();
      toHand(g);
      g.translate(HAND.pivot[0], HAND.pivot[1]);
      g.rotate(ta);
      g.translate(-HAND.pivot[0], -HAND.pivot[1]);
      K.shadowBlob(g, 134, 248, 20, 15, { alpha: 0.5 * grab, soft: 1, color: "#140604" });
      g.drawImage(thumbSprite(), 0, 0, HAND.w, HAND.h);
      g.restore();
    }
    // the memory arrives: a warm swell of candlelight at the purr (46)
    const purr = K.env(t, 45.8, 48.5, 0.6, 1.6);
    if (purr > 0) pool(g, mx + 40, my - 30, 420, "#ffb070", 0.12 * purr);
    // motes drifting through the moonlight, close to the lens
    K.dust(g, W, H, t, { seed: 65, count: 22, color: "#d8dcff", size: 2.4, alpha: 0.3, area: [0, 0, W * 0.6, H * 0.7] });
  });
}

// ---- SHOT 6: flashback, the kitchen floor ----------------------------------------------------------------
function kitchen(g, t, W, H) {
  // warm morning, seen from cat height: a run of BASE cabinets standing on the floor (countertop lip
  // above, recessed toe-kick below, a contact shadow where they meet the boards), sunlit floor.
  // Everything static is baked once into a single sprite; only the god rays move.
  g.drawImage(kitchenSet(W, H), 0, 0, W, H);
  K.godRays(g, -60, -80, W, H, { color: "#ffd9a0", count: 7, strength: 0.22, t, angle: 0.75, spread: 0.5, seed: 9 });
}
// the kitchen floor is a real perspective plane: the camera sits at cat height (horizon at y = 163,
// one vanishing point straight ahead), the boards run away from the lens, the wall/floor line at 270
const KCAM = { x: 0, y: -1, z: 0, f: 600, cx: 480, cy: 163 };
function kitchenUpper(W) {
  // wall, splashback, worktop and the painted base cabinets (also mirrored into the varnished floor)
  return own("f06kup", W, 272, (c) => {
    const wallG = c.createLinearGradient(0, 0, 0, 112);
    wallG.addColorStop(0, "#c8b89a");
    wallG.addColorStop(1, "#e2d2b0");
    c.fillStyle = wallG;
    c.fillRect(0, 0, W, 112);
    K.texRect(c, "plaster", 0, 0, W, 100, { scale: 140, mode: "soft-light", alpha: 0.6, tex: { seed: 74, color: "#d8ccb8" } });
    // tiled splashback above the counter: grout lines with a lit lower lip on each tile
    c.strokeStyle = "rgba(120,100,80,0.35)";
    c.lineWidth = 1;
    c.beginPath();
    for (let y = 20; y < 112; y += 26) { c.moveTo(0, y); c.lineTo(W, y); }
    for (let y = 20, r = 0; y < 112; y += 26, r++) for (let x = (r % 2) * 26; x < W; x += 52) { c.moveTo(x, y); c.lineTo(x, y + 26); }
    c.stroke();
    c.fillStyle = "rgba(255,248,230,0.18)";
    for (let y = 20; y < 112; y += 26) c.fillRect(0, y + 1, W, 1);
    // worktop: the lip of a thick wooden top, lit along its front edge, its shadow on the doors
    const ct = c.createLinearGradient(0, 100, 0, 128);
    ct.addColorStop(0, "#d8b480");
    ct.addColorStop(0.35, "#a8784a");
    ct.addColorStop(1, "#5a3a1c");
    c.fillStyle = ct;
    c.fillRect(0, 100, W, 26);
    K.texRect(c, "wood", 0, 100, W, 26, { scale: 120, mode: "soft-light", alpha: 0.8, tex: { seed: 73 } });
    c.fillStyle = "rgba(255,236,200,0.5)";
    c.fillRect(0, 103, W, 2);
    // the cabinet carcass, sage-painted wood with brush texture
    const cab = c.createLinearGradient(0, 128, 0, 250);
    cab.addColorStop(0, "#56705e");
    cab.addColorStop(1, "#7a957f");
    c.fillStyle = cab;
    c.fillRect(0, 126, W, 124);
    K.texRect(c, "wood", 0, 126, W, 124, { scale: 150, mode: "soft-light", alpha: 0.5, tex: { seed: 72, color: "#808080", dark: "#606060", planks: 2 } });
    // doors: a sunk gap round each, a frame with raised-panel bevels (light from the window, upper
    // left: top + left bevels lit, bottom + right in shade), a slightly proud field, a brass knob
    for (let i = 0; i < 6; i++) {
      const x = -40 + i * 190, dx0 = x + 6, dy0 = 132, dw = 178, dh = 112;
      c.fillStyle = "rgba(14,22,16,0.75)";
      c.fillRect(dx0 - 3, dy0 - 3, dw + 6, 3); c.fillRect(dx0 - 3, dy0 + dh, dw + 6, 3);
      c.fillRect(dx0 - 3, dy0, 3, dh); c.fillRect(dx0 + dw, dy0, 3, dh);
      // door edge catching the light
      c.fillStyle = "rgba(255,246,220,0.25)";
      c.fillRect(dx0, dy0, dw, 1.5); c.fillRect(dx0, dy0, 1.5, dh);
      const px = dx0 + 16, py = dy0 + 14, pw = dw - 32, ph = dh - 28, bv = 9;
      const bevel = (pts, col) => { c.fillStyle = col; c.beginPath(); pts.forEach(([a, b], k) => (k ? c.lineTo(a, b) : c.moveTo(a, b))); c.closePath(); c.fill(); };
      bevel([[px, py], [px + pw, py], [px + pw - bv, py + bv], [px + bv, py + bv]], "rgba(255,246,220,0.3)");
      bevel([[px, py], [px + bv, py + bv], [px + bv, py + ph - bv], [px, py + ph]], "rgba(255,246,220,0.16)");
      bevel([[px + pw, py], [px + pw, py + ph], [px + pw - bv, py + ph - bv], [px + pw - bv, py + bv]], "rgba(10,20,14,0.3)");
      bevel([[px, py + ph], [px + bv, py + ph - bv], [px + pw - bv, py + ph - bv], [px + pw, py + ph]], "rgba(10,20,14,0.42)");
      c.strokeStyle = "rgba(14,22,16,0.45)";
      c.lineWidth = 1;
      c.strokeRect(px, py, pw, ph);
      const fg = c.createLinearGradient(0, py + bv, 0, py + ph - bv);
      fg.addColorStop(0, "rgba(255,246,220,0.08)");
      fg.addColorStop(1, "rgba(10,20,14,0.12)");
      c.fillStyle = fg;
      c.fillRect(px + bv, py + bv, pw - bv * 2, ph - bv * 2);
      // brass knob with its tiny shadow
      K.shadowBlob(c, x + 154, 174, 4, 3, { alpha: 0.5 });
      const kg = c.createRadialGradient(x + 150, 168, 0.5, x + 152, 170, 6);
      kg.addColorStop(0, "#fff0c0");
      kg.addColorStop(0.5, "#b08a3a");
      kg.addColorStop(1, "#5a3a10");
      c.fillStyle = kg;
      c.beginPath(); c.arc(x + 152, 170, 5, 0, TAU); c.fill();
    }
    // the worktop's shadow falling on the door tops
    const sh = c.createLinearGradient(0, 126, 0, 160);
    sh.addColorStop(0, "rgba(20,14,8,0.5)");
    sh.addColorStop(1, "rgba(20,14,8,0)");
    c.fillStyle = sh;
    c.fillRect(0, 126, W, 34);
    // the toe-kick: recessed under the doors, in deep shadow, darkest right under the carcass
    const kb = c.createLinearGradient(0, 248, 0, 272);
    kb.addColorStop(0, "#060404");
    kb.addColorStop(0.5, "#120c08");
    kb.addColorStop(1, "#1c1410");
    c.fillStyle = kb;
    c.fillRect(0, 248, W, 24);
    c.fillStyle = "rgba(0,0,0,0.5)";
    c.fillRect(0, 248, W, 3);
  });
}
function kitchenSet(W, H) {
  return own("f06kitchen4", W, H, (c) => {
    c.drawImage(kitchenUpper(W), 0, 0, W, 272);
    // floor: oak boards in exact perspective (one vanishing point at camera height)
    c.fillStyle = "#7a5030";
    c.fillRect(0, 270, W, H - 270);
    c.save();
    c.beginPath();
    c.rect(0, 270, W, H - 270);
    c.clip();
    const fl = c.createLinearGradient(0, 270, 0, H);
    fl.addColorStop(0, "#6a4628");
    fl.addColorStop(1, "#9a6a3c");
    c.fillStyle = fl;
    c.fillRect(0, 270, W, H - 270);
    // the boards: seams running to the one vanishing point, each board its own tone, staggered butt joints
    {
      const P = proj(KCAM), PW = 0.31, R = K.rng("kboards");
      for (let j = -22; j < 22; j++) {
        const xa = j * PW, xb = xa + PW, tone = R();
        const q = [P(xa, 0, 0.6), P(xb, 0, 0.6), P(xb, 0, 40), P(xa, 0, 40)];
        c.fillStyle = rgba(tone > 0.5 ? "#fff0d8" : "#2a1406", 0.03 + Math.abs(tone - 0.5) * 0.12);
        c.beginPath(); q.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill();
        // grain: fine streaks along the board (they converge with it), a few darker figure lines
        for (let k = 0; k < 7; k++) {
          const u = R(), dark = R() > 0.6, xg = xa + PW * u, wob = (R() - 0.5) * 0.02;
          const a = P(xg, 0, 0.6), b = P(xg + wob, 0, 40), m = P(xg + wob * 3, 0, 4);
          c.strokeStyle = rgba(dark ? "#3a1c08" : "#ffe8c8", dark ? 0.14 + R() * 0.12 : 0.05 + R() * 0.06);
          c.lineWidth = 0.6 + R() * (dark ? 1.4 : 2.2);
          c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(m[0], m[1], b[0], b[1]); c.stroke();
        }
        c.strokeStyle = "rgba(40,20,6,0.5)";
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(q[0][0], q[0][1]); c.lineTo(q[3][0], q[3][1]); c.stroke();
        // the lit arris of each seam (varnish catching the window)
        c.strokeStyle = "rgba(255,226,180,0.12)";
        c.beginPath(); c.moveTo(q[0][0] + 1.2, q[0][1]); c.lineTo(q[3][0] + 0.2, q[3][1]); c.stroke();
        let z = 0.6 + R() * 1.6;
        while (z < 12) {
          const a = P(xa, 0, z), b = P(xb, 0, z);
          c.strokeStyle = "rgba(40,20,6,0.42)";
          c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
          z += 1.4 + R() * 1.4;
        }
      }
    }
    c.restore();
    // the varnished boards mirror the cabinets (a soft, darker, fading reflection below the line)
    c.save();
    c.globalAlpha = 0.2;
    c.filter = "blur(2.5px)";
    c.translate(0, 540);
    c.scale(1, -1);
    c.drawImage(kitchenUpper(W), 0, 0, W, 272);
    c.restore();
    c.filter = "none";
    const rf = c.createLinearGradient(0, 270, 0, 400);
    rf.addColorStop(0, "rgba(122,80,48,0)");
    rf.addColorStop(1, "rgba(122,80,48,0.35)");
    c.globalCompositeOperation = "soft-light";
    c.fillStyle = rf;
    c.fillRect(0, 270, W, 130);
    c.globalCompositeOperation = "source-over";
    // the window glare in the boards near the wall
    const vg = c.createLinearGradient(0, 270, 0, 380);
    vg.addColorStop(0, "rgba(255,230,190,0.14)");
    vg.addColorStop(1, "rgba(255,230,190,0)");
    c.fillStyle = vg;
    c.fillRect(0, 270, W, 110);
    // contact shadow where the toe-kick meets the floor
    const cs = c.createLinearGradient(0, 270, 0, 292);
    cs.addColorStop(0, "rgba(16,8,2,0.65)");
    cs.addColorStop(1, "rgba(16,8,2,0)");
    c.fillStyle = cs;
    c.fillRect(0, 270, W, 22);
    // the sun: a soft-edged window patch on the floor (in the same perspective), light on the doors
    K.focus(c, W, H, 7, (d) => {
      const P = proj(KCAM);
      d.globalCompositeOperation = "lighter";
      d.fillStyle = "rgba(255,196,120,0.4)";
      const sun = [[-3.2, 0, 5.5], [-0.2, 0, 5.5], [1.0, 0, 1.0], [-1.6, 0, 1.0]].map((q) => P(...q));
      d.beginPath(); sun.forEach((q, i) => (i ? d.lineTo(q[0], q[1]) : d.moveTo(q[0], q[1]))); d.closePath(); d.fill();
      d.fillStyle = "rgba(255,200,130,0.2)";
      d.beginPath();
      d.moveTo(0, 100); d.lineTo(400, 100); d.lineTo(470, 250); d.lineTo(0, 250);
      d.fill();
      // the glazing bar's shadow across the patch
      d.globalCompositeOperation = "source-over";
      d.fillStyle = "rgba(90,50,20,0.35)";
      const bar = [[-1.75, 0, 5.5], [-1.6, 0, 5.5], [-0.25, 0, 1.0], [-0.4, 0, 1.0]].map((q) => P(...q));
      d.beginPath(); bar.forEach((q, i) => (i ? d.lineTo(q[0], q[1]) : d.moveTo(q[0], q[1]))); d.closePath(); d.fill();
    }, "f06sun");
  });
}
function kitchenForeground(g, t, W, H) {
  // a kitchen chair's turned oak leg + its stretcher, right by the lens, thrown far out of focus
  // (painted sharp, then blurred once), and the edge of a red rug at the bottom left
  g.drawImage(own("f06kfg3", W, H, (c) => {
    c.filter = "blur(10px)";
    const leg = new Path2D();
    const cx = 872;
    const prof = [[-60, 26], [40, 22], [70, 30], [86, 20], [200, 17], [228, 27], [250, 18], [420, 15], [560, 13]];
    leg.moveTo(cx - prof[0][1], prof[0][0]);
    for (const [y, r] of prof) leg.lineTo(cx - r, y);
    for (let i = prof.length - 1; i >= 0; i--) leg.lineTo(cx + prof[i][1] * 0.9, prof[i][0]);
    leg.closePath();
    const lg = c.createLinearGradient(cx - 30, 0, cx + 30, 0);
    lg.addColorStop(0, "#2a1608");
    lg.addColorStop(0.3, "#9a6a36");
    lg.addColorStop(0.45, "#e0b070");
    lg.addColorStop(0.7, "#6a4220");
    lg.addColorStop(1, "#1e0e04");
    c.fillStyle = lg;
    c.fill(leg);
    // the stretcher rail, going back into the dark under the chair
    c.fillStyle = "#4a2c14";
    c.beginPath(); c.moveTo(cx + 10, 300); c.lineTo(W + 40, 270); c.lineTo(W + 40, 296); c.lineTo(cx + 10, 322); c.fill();
    c.fillStyle = "rgba(255,210,150,0.35)";
    c.beginPath(); c.moveTo(cx + 10, 300); c.lineTo(W + 40, 270); c.lineTo(W + 40, 275); c.lineTo(cx + 10, 305); c.fill();
    // the rug
    c.fillStyle = "rgba(150,52,40,0.95)";
    c.fillRect(-20, H - 30, 400, 50);
    c.fillStyle = "rgba(230,200,140,0.8)";
    for (let i = 0; i < 20; i++) c.fillRect(i * 19, H - 34, 8, 6);
  }), 0, 0, W, H);
}
// the memory, beat by beat: chase (run) -> crouch + wiggle -> a short hop -> a front paw BATS the
// mouse -> he slides after it on the boards (motion smear, tail up) -> sits with it, push in
const K6 = { run0: 50.4, crouch: 52.3, hop: 52.75, bat: 53.15, slide: 53.45, sit: 54.5 };
function cat6(t) {
  const y0 = 448;
  if (t < K6.crouch) return { x: lerp(-80, 430, eio(seg(t, K6.run0, K6.crouch))), y: y0, pose: "run", phase: t * 2.4 };
  if (t < K6.hop) { const k = seg(t, K6.crouch, K6.hop); return { x: 430 + Math.sin(k * 30) * 1.5, y: y0, pose: "pounce", phase: lerp(0, 0.42, smooth(k * 1.6)) }; }
  if (t < K6.bat) { const k = seg(t, K6.hop, K6.bat); return { x: lerp(430, 515, eio(k)), y: y0 - Math.sin(k * Math.PI) * 26, pose: "run", phase: 0.1 + k * 0.35 }; }
  if (t < K6.slide) return { x: 515, y: y0, pose: "stand", phase: 0, bat: seg(t, K6.bat, K6.slide) };
  if (t < K6.sit) { const k = seg(t, K6.slide, K6.sit); return { x: 515 + 120 * (1 - Math.pow(1 - k, 2.2)), y: y0, pose: "stand", phase: 0, slide: 1 - k }; }
  return { x: 635, y: y0, pose: "sit", phase: 0 };
}
function mouse6(t) {
  if (t < K6.bat + 0.1) return { x: lerp(300, 610, eio(seg(t, 50.4, 53.0))), hop: 1 };
  const k = seg(t, K6.bat + 0.1, K6.sit - 0.1);
  return { x: 610 + 110 * (1 - Math.pow(1 - k, 2.5)), hop: 0, spin: 1 - k };
}
function shot6(g, t, W, H) {
  const C = cat6(t), M = mouse6(t);
  // the emotional beat: a slow push in on him sitting with the mouse (to ~1.4x)
  const z = eio(seg(t, 54.0, 56.0));
  K.withCamera(g, W, H, { x: lerp(W / 2, 690, z), y: lerp(H / 2, 380, z), zoom: lerp(1, 1.4, z) }, () => {
    kitchen(g, t, W, H);
    const my = 440 + (M.hop ? -Math.abs(Math.sin(t * 9)) * 6 : 0);
    bigMouse(g, M.x, my + 4, 44, { t, facing: 1, rot: (M.spin || 0) * 0.5 * Math.sin(t * 20), shadow: M.hop ? 0.5 : 1 });
    const opts = (alpha) => ({
      // sitting, the tail lies on the boards and curls round in front of the front paws
      pose: C.pose, phase: C.phase, facing: 1, t, tailUp: C.pose === "sit" ? 0 : 1, tail: C.pose === "sit" ? 0.25 : 0.5, headTurn: C.pose === "sit" ? 0.35 : 0.1, ears: 1,
      bell: true, collar: true, key: { x: -60, y: -80, color: "#ffe0a8", strength: 1.2 }, rim: { x: -60, y: -80, color: "#ffd08a", strength: 1.1 }, fill: "#6a3a1a", ambient: "#c89060", ambientK: 0.12, backlit: 0.4, castShadow: 0.7, breath: 1, ground: "#3a1a08", alpha,
    });
    // motion smear while he slides: faint trailing copies, the floor scuffed behind him
    if (C.slide > 0.05) {
      // paint him once into a layer (in the camera space), then lay faint offset copies behind;
      // only the device-px patch round him is copied, not the whole frame
      const Ls = K.layer(W, H, "f06smear");
      const M = g.getTransform();
      Ls.g.setTransform(M);
      K.drawCat(Ls.g, C.x, C.y, 78, Object.assign(opts(1), { shadow: false }));
      Ls.g.setTransform(1, 0, 0, 1, 0, 0);
      const bx0 = Math.max(0, Math.floor(M.a * (C.x - 110) + M.e)), by0 = Math.max(0, Math.floor(M.d * (C.y - 130) + M.f));
      const bx1 = Math.min(Ls.canvas.width, Math.ceil(M.a * (C.x + 110) + M.e)), by1 = Math.min(Ls.canvas.height, Math.ceil(M.d * (C.y + 12) + M.f));
      if (bx1 > bx0 && by1 > by0) {
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        for (let i = 2; i >= 1; i--) {
          g.globalAlpha = 0.2 * C.slide / i;
          g.drawImage(Ls.canvas, bx0, by0, bx1 - bx0, by1 - by0, bx0 - i * 18 * C.slide * M.a, by0, bx1 - bx0, by1 - by0);
        }
        g.restore();
      }
      g.save();
      g.globalCompositeOperation = "lighter";
      g.translate(C.x - 50, C.y + 2);
      g.scale(1, 0.08);
      glow(g, 0, 0, 90 * C.slide, "#ffd9a0", 0.25);
      g.restore();
    }
    K.drawCat(g, C.x, C.y, 78, opts(1));
    kitchenForeground(g, t, W, H);
    K.dust(g, W, H, t, { seed: 66, count: 40, color: "#fff0d0", size: 1.5, alpha: 0.5, area: [0, 0, W * 0.6, H] });
  });
}

// ---- SHOT 7: low angle up the stairs, the Shadow in the doorway ---------------------------------------
// The Shadow: a tall, lean, wrong-looking cat standing in the lit doorway, side-on, facing down the
// stairs (left). Built as its own silhouette (not the kit cat squashed): long legs with real elbows
// and hocks, a slightly too-long body, a long neck, a small wedge head with tall pointed ears, and a
// thin tail rising in an S. It sits IN the light: the doorway behind wraps a thin warm rim round
// every edge (the silhouette minus its own blurred copy), plus a little light bleeding past the edge.
function shadowPath(c, t) {
  // units: shoulder height = 1, ground at y = 0, facing left; a slow breath and a tail-tip twitch
  const br = Math.sin(t * 1.6) * 0.012, tw = Math.sin(t * 2.3) * 0.05;
  c.beginPath();
  // body: deep chest, a lean back running a little too long, tucked waist, a high hip
  c.moveTo(-0.6, -0.92 - br);
  c.bezierCurveTo(-0.35, -1.02 - br, 0.2, -0.98, 0.56, -1.02);
  c.bezierCurveTo(0.7, -1.0, 0.72, -0.84, 0.62, -0.74);
  c.bezierCurveTo(0.42, -0.62, 0.2, -0.56, -0.05, -0.6);
  c.bezierCurveTo(-0.32, -0.6, -0.56, -0.62, -0.66, -0.74);
  c.closePath();
  c.fill();
  // neck rising forward, a little too long
  c.beginPath();
  c.moveTo(-0.44, -0.98 - br);
  c.bezierCurveTo(-0.52, -1.12, -0.62, -1.26, -0.7, -1.34);
  c.lineTo(-0.86, -1.24);
  c.bezierCurveTo(-0.82, -1.08, -0.76, -0.9, -0.66, -0.74);
  c.closePath();
  c.fill();
  // a small wedge head, the muzzle pointing down the stairs
  c.beginPath();
  c.ellipse(-0.82, -1.36, 0.165, 0.14, -0.15, 0, TAU);
  c.fill();
  c.beginPath();
  c.ellipse(-0.97, -1.29, 0.08, 0.06, -0.3, 0, TAU);
  c.fill();
  // tall pointed ears, pricked forward
  c.beginPath();
  c.moveTo(-0.95, -1.4); c.lineTo(-0.99, -1.74); c.lineTo(-0.8, -1.48); c.closePath();
  c.moveTo(-0.8, -1.49); c.lineTo(-0.71, -1.76); c.lineTo(-0.66, -1.4); c.closePath();
  c.fill();
  // legs: tapered segments through elbow / hock joints, small neat paws
  c.lineCap = "round";
  c.lineJoin = "round";
  const leg = (pts, w0, w1) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      c.lineWidth = lerp(w0, w1, i / (pts.length - 1));
      c.beginPath(); c.moveTo(pts[i][0], pts[i][1]); c.lineTo(pts[i + 1][0], pts[i + 1][1]); c.stroke();
    }
    const e = pts[pts.length - 1];
    c.beginPath(); c.ellipse(e[0] - 0.035, e[1] - 0.025, 0.06, 0.03, 0, 0, TAU); c.fill();
  };
  leg([[-0.5, -0.78], [-0.55, -0.46], [-0.52, -0.16], [-0.57, -0.02]], 0.14, 0.05);
  leg([[-0.36, -0.74], [-0.39, -0.44], [-0.35, -0.16], [-0.39, -0.02]], 0.12, 0.05);
  leg([[0.46, -0.84], [0.3, -0.5], [0.55, -0.24], [0.47, -0.02]], 0.22, 0.05);
  leg([[0.58, -0.82], [0.44, -0.48], [0.68, -0.22], [0.62, -0.02]], 0.18, 0.05);
  // thin tail: out of the hip, then an S rising high
  c.beginPath();
  c.moveTo(0.64, -0.94);
  c.bezierCurveTo(0.92, -0.9, 0.96, -1.2, 0.82, -1.38);
  c.bezierCurveTo(0.7, -1.54, 0.78, -1.82, 0.96 + tw, -1.94);
  c.lineWidth = 0.05;
  c.stroke();
}
function shadowCat(g, x, y, s, a, t, W, H) {
  if (a <= 0.01) return;
  const L = K.layer(W, H, "f06shadow");
  L.g.save();
  L.g.translate(x, y);
  L.g.scale(s, s);
  L.g.fillStyle = L.g.strokeStyle = "#040305";
  shadowPath(L.g, t);
  L.g.restore();
  // the rim: the silhouette minus its own blurred copy = a thin band on every edge, tinted warm
  const E = K.layer(W, H, "f06shadowE");
  E.g.drawImage(L.canvas, 0, 0, W, H);
  E.g.globalCompositeOperation = "destination-out";
  K.dof(E.g, L.canvas, Math.max(1.5, s * 0.025), 1);
  E.g.globalCompositeOperation = "source-atop";
  E.g.fillStyle = "#ffbe78";
  E.g.fillRect(-W, -H, W * 3, H * 3);
  g.save();
  // the doorway light bleeding round the edges (soft, behind the body)
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = a;
  K.dof(g, E.canvas, Math.max(2, s * 0.05), 0.5);
  g.globalCompositeOperation = "source-over";
  g.drawImage(L.canvas, 0, 0, W, H);
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = 0.8 * a;
  g.drawImage(E.canvas, 0, 0, W, H);
  g.restore();
  // two faint eye-shine slits catching the stair candles (only just there)
  const ex = x - s * 0.93, ey = y - s * 1.38;
  glow(g, ex, ey, s * 0.03, "#ffd070", 0.35 * a * (0.8 + 0.2 * Math.sin(t * 3)));
}
function shot7(g, t, W, H) {
  const p = eio(seg(t, 58, 66));
  const ci = 5;
  const cam = { x: noise(t * 0.25, 9) * 0.03, y: stepY(ci) - 0.14, z: stepZ(ci) - 1.5 + p * 0.5, f: 470, cx: W / 2, cy: H * 0.76 };
  const shadowA = smooth(seg(t, 59.6, 60.2)) * (1 - smooth(seg(t, 62.8, 63.3)));
  let doorC = [W / 2, H * 0.3];
  const prints = [];
  K.withCamera(g, W, H, { shakeT: t, shakeAmt: 0.8 }, () => {
    const st = staircase(g, t, W, H, cam, {
      lights: (lg) => { for (const [x, y, s, a] of prints) { pool(lg, x, y, s * 0.16, "#ffffff", a, 0.5); pool(lg, x, y, s * 0.45, "#ffb050", 0.35 * a, 0.35); } },
      top: "door", warm: 0.4, rays: false, backDepth: 1.3, newels: false, railNear: 2.6, railPosts: true,
      // the Shadow stands at the head of the stairs, just in front of the lit doorway (so the low
      // camera sees all of it against the light); its long shadow falls down the top tread toward us
      after: (c, P) => {
        if (shadowA <= 0.01) return;
        const f = P(0.12, stepY(STEPS), stepZ(STEPS) + 0.3), e = P(0.12, stepY(STEPS), stepZ(STEPS));
        c.save();
        c.globalAlpha = 0.6 * shadowA;
        K.shadowBlob(c, f[0], (f[1] + e[1]) / 2 + 1, f[2] * 0.3, Math.max(2, Math.abs(e[1] - f[1]) * 0.7), { alpha: 1, soft: 0.6, color: "#0a0402" });
        c.restore();
        shadowCat(c, f[0], f[1], f[2] * 0.72, shadowA, t, W, H);
      },
      onStep: (c, P, i, yT, z0, z1) => {
        // Biscuit's amber pawprints going up the middle of the runner; only his
        {
          const sd = i % 2 ? 1 : -1;
          const appear = 58.3 + (STEPS - i) * 0.2;
          const a = clamp((t - appear) * 2) * lerp(0.95, 0.3, i / STEPS);
          if (a > 0) {
            const q = P(0.02 + 0.055 * sd, yT, lerp(z0, z1, 0.5));
            K.pawprints(c, [{ x: q[0], y: q[1], a: 0, s: Math.max(3, q[2] * 0.08), alpha: a, flat: 0.34 }], 1.15);
            prints.push([q[0], q[1], q[2], a]);
          }
        }
      },
    });
    doorC = st.winC;
    // warm door light spilling down the stairs, dust turning in it
    K.godRays(g, doorC[0], doorC[1] + 30, W, H, { color: "#ffcf8a", count: 7, strength: 0.14, t, angle: Math.PI / 2, spread: 0.6, length: H * 0.9, seed: 4 });
    K.dust(g, W, H, t, { seed: 67, count: 40, color: "#ffe2b0", size: 1.3, alpha: 0.45, area: [W * 0.3, 0, W * 0.4, H * 0.8] });
  });
}

// ---- assembly ---------------------------------------------------------------------------------------
// expensive one-off bakes, spread over earlier frames so no cut stalls (each call is a cache hit
// once built; calling them changes nothing on screen, so draw stays a pure function of t)
const WARM = [
  ...Object.keys(MAT).map((m, i) => [0.1 + i * 0.25, () => K.texture(MAT[m][0], MAT[m][1])]),
  [1.5, () => K.texture("relief", { seed: 66 })],
  // the hand + thumb per-pixel skin solve (~1.5 s): ~4 ms a frame through the ghost and staircase shots
  [20.5, () => handJob().step(4)], [20.5, () => { if (handJob().done) thumbJob().step(4); }],
  [21.0, () => feltTex()], [21.6, () => feltFibres(MZ.w, MZ.h)], [22.2, () => mouseBodyBake()], [23.0, () => mouseBody()],
  [8.5, (W, H) => galAlb(W, H, true)], [19.0, (W, H) => galAlb(W, H, false)], [33.0, (W, H) => stepSet5(W, H)], [42.0, (W, H) => kitchenSet(W, H)], [34.0, (W, H) => stepSet5Blur(W, H, 9)], [35.0, (W, H) => stepSet5Sharp(W, H)],
];
function warm(t, W, H) { for (const [at, fn] of WARM) if (t >= at) fn(W, H); }
function frame(g, t, W, H) {
  warm(t, W, H);
  if (t < 10) {
    shot1(g, t, W, H);
    K.letterbox(g, W, H, 1);
    const ta = K.env(t, 1.0, 5.5, 1.5, 1.0);
    if (ta > 0) K.title(g, W, H, "The Toy Mouse", "Chapter 6", ta, { size: 54, y: H * 0.44 });
    K.fadeBlack(g, W, H, 1 - smooth(seg(t, 0, 1.4)));
  } else if (t < 20) {
    shot2(g, t, W, H);
    K.letterbox(g, W, H, 1);
  } else if (t < 30) {
    shot3(g, t, W, H);
    K.letterbox(g, W, H, 1);
  } else if (t < 40) {
    shot4(g, t, W, H);
    K.letterbox(g, W, H, 1);
  } else if (t < 50) {
    shot5(g, t, W, H, false);
    K.letterbox(g, W, H, 1);
  } else if (t < 56.2) {
    // cross-fade into the warm memory, hold it ~4.6 s, cross-fade back to the present
    const into = smooth(seg(t, 50, 50.8)), back = smooth(seg(t, 55.4, 56.2));
    if (into < 1 || back > 0) {
      shot5(g, back > 0 ? 50 : Math.min(t, 49.99), W, H, true);
      }
    dissolve(g, W, H, into * (1 - back), "f06mix", (c) => {
      shot6(c, t, W, H);
    });
    K.letterbox(g, W, H, 1);
  } else if (t < 58) {
    shot5(g, 50 + (t - 56.2) * 0.2, W, H, true);
    K.letterbox(g, W, H, 1);
  } else {
    shot7(g, t, W, H);
    K.letterbox(g, W, H, 1);
    K.fadeBlack(g, W, H, smooth(seg(t, 64.2, 66)));
  }
}

export const film = {
  id: 6,
  title: "The Toy Mouse",
  chapter: "Chapter 6",
  unlockAt: 30,
  duration: D,
  poster: 46,
  tagline: "He left you something.",
  subs: [
    [2.5, 6.5, "Inside, a thousand candles. And no one."],
    [11.0, 15.0, "The paintings were watching you."],
    [21.0, 24.5, "A ghost. Trying very hard."],
    [25.5, 29.0, "It was not very good at haunting."],
    [33.0, 37.5, "Something on the stairs. Something small."],
    [42.0, 46.0, "His toy mouse. The one he loved."],
    [51.0, 55.5, "He carried it everywhere."],
    [56.0, 58.0, "He left it for you."],
    [60.0, 64.5, "The shadow left no pawprints at all."],
  ],
  voice: [
    [2.5, "Inside, a thousand candles. And no one.", { rate: 0.92, pitch: 1.0 }],
    [11.0, "The paintings were watching you.", { rate: 0.92, pitch: 1.0 }],
    [21.0, "A ghost. Trying very hard.", { rate: 1.0, pitch: 1.1 }],
    [25.5, "It was not very good at haunting.", { rate: 1.0, pitch: 1.1 }],
    [33.0, "Something on the stairs. Something small.", { rate: 0.92, pitch: 1.0 }],
    [42.0, "His toy mouse. The one he loved.", { rate: 0.92, pitch: 1.0 }],
    [51.0, "He carried it everywhere.", { rate: 0.88, pitch: 1.0 }],
    [56.0, "He left it for you.", { rate: 0.92, pitch: 1.0 }],
    [60.0, "The shadow left no pawprints at all.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: { mood: "mystery", key: "D", bpm: 70, cues: [[12, "hit"], [26, "swell"], [38, "drop"], [46, "purr"], [60, "swell"]] },
  // the lens grade: a candle-lit interior (warm, soft halation round every flame), the stairwell
  // shots cooler under the moon, the kitchen memory golden with extra grain and a heavy soft edge
  grade: { temp: 0.08, exposure: 1.08, contrast: 1.06, sat: 0.94, bloom: 0.38, halation: 0.42, streak: 0.05, lift: [0.012, 0.008, 0.018], vignette: 0.5, grain: 0.055 },
  gradeAt(t) {
    // the candle-lit hall and gallery: a dark plum room, metered for the walls (the flames clip)
    if (t < 30) return { exposure: 1.42 };
    if (t >= 30 && t < 50) return { temp: -0.06, exposure: 1.12, lift: [0.008, 0.01, 0.024] };
    if (t >= 50 && t < 56.2) {
      const m = smooth(seg(t, 50, 50.8)) * (1 - smooth(seg(t, 55.4, 56.2)));
      return { temp: lerp(-0.06, 0.32, m), exposure: lerp(1.12, 0.98, m), gain: [1 + 0.04 * m, 1, 1 - 0.06 * m], sat: lerp(0.94, 0.9, m), grain: lerp(0.055, 0.04, m), grainSize: lerp(1.35, 1.6, m), vignette: lerp(0.5, 0.7, m), vignetteColor: m > 0.5 ? "#3a2210" : "#000000", halation: lerp(0.55, 0.45, m), lift: [0.008 + 0.02 * m, 0.01 + 0.012 * m, 0.024 - 0.014 * m] };
    }
    if (t >= 56.2 && t < 58) return { temp: -0.06, exposure: 1.12, lift: [0.008, 0.01, 0.024] };
    if (t >= 58) return { temp: 0.12, exposure: 1.22, lift: [0.02, 0.012, 0.008] };
    return null;
  },
  draw(g, t, W, H) {
    t = clamp(t, 0, D);
    const sx = W / 960, sy = H / 540;
    g.save();
    if (sx !== 1 || sy !== 1) g.scale(sx, sy);
    try { frame(g, t, 960, 540); } finally { g.restore(); }
  },
};
