// films/f07.js - Chapter 7: "Thunder" (FILMS.md f07). The manor attic in a thunderstorm: you, hiding
// in a corner; the bell on your wrist; a warm memory of a stormy night when Biscuit curled up against
// you under the quilt; a candle that lights itself; Mount Hairball glowing in a lightning flash; the roof.
// draw(g, t, W, H) is a pure function of t. Static art (quilt pattern, valley) is cached by key.
import * as KK from "../filmkit.js";

// ---- budgeted cache warming ---------------------------------------------------------------------------
// Every kit call made from this film goes through a thin wrapper (K below). While a warm slice is running
// (WARM.on), each top-level kit call is a checkpoint: once the slice has built at least one new cache
// (a sprite, a texture or one of our own bakes) and the frame's time budget is spent, the slice stops
// there (STOP is thrown and caught by warm()). A later slice re-walks the same warm frame on a tiny canvas
// (so the cached parts cost almost nothing) and builds the next missing cache. Callbacks running inside a
// kit call (sprite painters, focus layers) are never interrupted, so no cache is ever left half painted.
const now = () => (typeof performance !== "undefined" ? performance.now() : 0);
const WARM = { on: false, t0: 0, budget: 14, sig: 0, depth: 0, stop: false };
const STOP = { f07stop: true };
let OWN_BUILDS = 0;
function buildSig() {
  const s = KK.cacheStats(), x = KK.texCacheStats();
  return s.spriteMiss * 1e7 + x.count * 1e4 + OWN_BUILDS + x.bytes * 1e-9;
}
function checkpoint() {
  if (!WARM.on || WARM.depth) return;
  if (WARM.stop) throw STOP;
  if (now() - WARM.t0 > WARM.budget && buildSig() !== WARM.sig) { WARM.stop = true; throw STOP; }
}
// cheap pure helpers stay unwrapped (some run per pixel inside bakes)
const RAW = new Set(["clamp", "lerp", "seg", "smooth", "mix", "rgba", "shade", "hash", "noise", "fbm", "parseColor", "env", "flash", "pixelScale",
  "texNoise", "texFbm", "texRidged", "texVoronoi", "rng", "area", "cacheStats", "texCacheStats", "makeCanvas", "haze", "lensActive"]);
const K = {};
for (const name of Object.keys(KK)) {
  const f = KK[name];
  if (typeof f !== "function" || RAW.has(name) || /^[A-Z]/.test(name)) { K[name] = f; continue; }
  K[name] = function (...a) {
    checkpoint();
    WARM.depth++;
    try { return f.apply(this, a); } finally { WARM.depth--; }
  };
}

const D = 68;
const { clamp, lerp, seg, smooth, mix, rgba, shade, hash, noise, glow, TAU } = K;
const eio = K.ease.inOut;
// every kit texture this film uses (one option object each, so each is baked once; see loadStep)
const WOOD = { seed: 13, color: "#7a6a5a", dark: "#2a2420", planks: 4, joints: 1 };
const FABRIC = { seed: 3, color: "#808080", weave: 1.1 };
const MACRO = { seed: 8 };
const WALLPAPER = { seed: 5, color: "#8a8ea0", ink: "#5a5a74", age: 0.55 };
const LAVAROCK = { seed: 77 };
const ASPHALT = { seed: 72 };
const TEXLIST = [["wood", WOOD], ["fabric", FABRIC], ["macro", MACRO], ["wallpaper", WALLPAPER], ["lavarock", LAVAROCK], ["asphalt", ASPHALT], ["cloud", { seed: 83, cover: 0.5 }], ["cloud", { seed: 84, cover: 0.32 }]];

const ATTIC = "#1a2230";
const BOLT = "#e6eeff";
const CANDLE = "#ffb24a";
const NIGHT = "#ffd9a0";

// lightning: three strikes (4, 19, 54), each a little stutter of flashes
const STRIKES = [4.0, 4.16, 4.48, 19.0, 19.13, 19.42, 54.1, 54.24, 54.55];
const flashAt = (t) => K.flash(t, STRIKES, 0.22);
// the bolt jumps around the sky between stutters, so the window light slides across the floor
function boltShift(t) {
  let k = 0;
  for (let i = 0; i < STRIKES.length; i++) if (t >= STRIKES[i]) k = i;
  return (hash(k, 7) - 0.5) * 1.2;
}

// ---- shared painters ------------------------------------------------------------------------------
const flick = (t, s) => 1 + 0.1 * Math.sin(t * 13 + s) + 0.05 * Math.sin(t * 29 + s * 1.7);
function flame(g, x, y, h, t, seed, a = 1, light = 1) {
  if (h <= 0.3 || a <= 0) return;
  const f = flick(t, seed);
  const hh = h * f;
  const sway = noise(t * 2.3, seed) * h * 0.12;
  if (light > 0) {
    glow(g, x, y - hh * 0.5, hh * 14, CANDLE, 0.14 * a * light * f);
    glow(g, x, y - hh * 0.5, hh * 4, "#ffc56a", 0.3 * a * light * f);
  }
  g.save();
  g.globalAlpha *= a;
  const w = hh * 0.3;
  const gr = g.createRadialGradient(x, y - hh * 0.25, hh * 0.02, x, y - hh * 0.35, hh * 0.75);
  gr.addColorStop(0, "#fffbe8");
  gr.addColorStop(0.3, "#ffe7a0");
  gr.addColorStop(0.65, "#ffa53a");
  gr.addColorStop(1, "rgba(255,90,20,0)");
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(x, y + hh * 0.05);
  g.bezierCurveTo(x - w * 1.1, y - hh * 0.05, x - w * 0.6, y - hh * 0.6, x + sway, y - hh);
  g.bezierCurveTo(x + w * 0.6, y - hh * 0.6, x + w * 1.1, y - hh * 0.05, x, y + hh * 0.05);
  g.fill();
  g.fillStyle = "rgba(90,140,255,0.45)";
  g.beginPath();
  g.ellipse(x, y - hh * 0.04, w * 0.45, hh * 0.08, 0, 0, TAU);
  g.fill();
  g.restore();
  glow(g, x, y - hh * 0.3, hh * 0.9, "#fff2c8", 0.7 * a);
}
// a short candle stub in a tin holder; lit 0..1 (grows the flame)
function stub(g, x, y, s, t, lit, spark = 0) {
  g.fillStyle = "rgba(0,0,0,0.5)";
  g.beginPath();
  g.ellipse(x + s * 0.1, y + s * 0.02, s * 0.7, s * 0.14, 0, 0, TAU);
  g.fill();
  const tin = g.createLinearGradient(x - s * 0.5, 0, x + s * 0.5, 0);
  tin.addColorStop(0, "#3a3a40");
  tin.addColorStop(0.4, "#9a9aa4");
  tin.addColorStop(1, "#2a2a30");
  g.fillStyle = tin;
  g.beginPath();
  g.ellipse(x, y, s * 0.55, s * 0.13, 0, 0, TAU);
  g.fill();
  g.fillRect(x - s * 0.55, y - s * 0.08, s * 1.1, s * 0.08);
  const wax = g.createLinearGradient(x - s * 0.22, 0, x + s * 0.22, 0);
  wax.addColorStop(0, "#a8987a");
  wax.addColorStop(0.4, "#efe2c2");
  wax.addColorStop(1, "#7a6a50");
  g.fillStyle = wax;
  g.fillRect(x - s * 0.22, y - s * 0.55, s * 0.44, s * 0.5);
  g.fillStyle = "#f6ead0";
  g.beginPath();
  g.ellipse(x, y - s * 0.55, s * 0.22, s * 0.06, 0, 0, TAU);
  g.fill();
  g.fillStyle = "rgba(240,228,200,0.9)";
  g.beginPath();
  g.ellipse(x - s * 0.12, y - s * 0.4, s * 0.05, s * 0.16, 0, 0, TAU);
  g.fill();
  g.strokeStyle = "#1a120a";
  g.lineWidth = Math.max(0.8, s * 0.04);
  g.beginPath();
  g.moveTo(x, y - s * 0.55);
  g.lineTo(x + s * 0.02, y - s * 0.68);
  g.stroke();
  if (spark > 0) {
    for (let i = 0; i < 6; i++) {
      const a = hash(i, 5) * TAU, d = s * 0.1 + spark * s * 0.25 * hash(i, 6);
      glow(g, x + Math.cos(a) * d, y - s * 0.7 + Math.sin(a) * d, s * 0.06, "#ffe2a0", spark * 0.9);
    }
  }
  if (lit > 0) flame(g, x, y - s * 0.64, s * 0.62 * lit, t, 3, Math.min(1, lit * 1.6), lit);
}

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

// a bat hanging upside down from a beam at (x, y); s = body length px
function bat(g, x, y, s, t, seed, fl) {
  const sw = Math.sin(t * 0.9 + seed) * 0.06 + (hash(seed, 2) > 0.7 ? Math.max(0, Math.sin(t * 0.4 + seed)) * 0.1 : 0);
  g.save();
  g.translate(x, y);
  g.rotate(sw);
  g.strokeStyle = "#0a0a0e";
  g.lineWidth = Math.max(0.6, s * 0.05);
  g.beginPath();
  g.moveTo(-s * 0.08, 0); g.lineTo(-s * 0.05, s * 0.15);
  g.moveTo(s * 0.08, 0); g.lineTo(s * 0.05, s * 0.15);
  g.stroke();
  const bg = g.createLinearGradient(-s * 0.3, 0, s * 0.3, 0);
  bg.addColorStop(0, mix("#15131a", "#6a7088", fl * 0.6));
  bg.addColorStop(0.5, "#0c0b10");
  bg.addColorStop(1, "#08070a");
  g.fillStyle = bg;
  g.beginPath();
  g.moveTo(0, s * 0.12);
  g.bezierCurveTo(-s * 0.34, s * 0.2, -s * 0.3, s * 0.85, 0, s * 1.0);
  g.bezierCurveTo(s * 0.3, s * 0.85, s * 0.34, s * 0.2, 0, s * 0.12);
  g.fill();
  // wing ribs (folded membrane)
  g.strokeStyle = rgba("#3a3a48", 0.6 + fl * 0.3);
  g.lineWidth = Math.max(0.4, s * 0.02);
  g.beginPath();
  g.moveTo(-s * 0.2, s * 0.25); g.lineTo(-s * 0.12, s * 0.85);
  g.moveTo(s * 0.2, s * 0.25); g.lineTo(s * 0.12, s * 0.85);
  g.stroke();
  // head + ears (at the bottom)
  g.fillStyle = "#121016";
  g.beginPath();
  g.arc(0, s * 1.02, s * 0.14, 0, TAU);
  g.fill();
  g.beginPath();
  g.moveTo(-s * 0.1, s * 1.08); g.lineTo(-s * 0.16, s * 1.3); g.lineTo(-s * 0.02, s * 1.12);
  g.moveTo(s * 0.1, s * 1.08); g.lineTo(s * 0.16, s * 1.3); g.lineTo(s * 0.02, s * 1.12);
  g.fill();
  g.restore();
}

/// ---- the kid, huddled in a corner: knees drawn up, both arms wrapped round the shins, head bowed
// onto the knees, hood up. Three-quarter from behind, facing left. (x, y) = floor point under the
// hips, s = seated height px (~300 for the close shots). Units below: 100 = seated height.
// The figure is painted ONCE as an albedo sprite (real materials: a damp yellow PVC parka with fabric
// noise, folds, creases, occlusion where the arm crosses the body, a pinched hood seam and rain-dark
// patches; denim; rubber boots with soles and darker toes). Each frame only relights it in a small
// layer: albedo x light map (cold window key from the left, lightning, the candle), then a wet
// specular sheen and a thin rim, so the materials keep their colour under any light.
const MOONC = "#6f86b0";
const HU = 3; // sprite px per unit (s = 300)
const HB = [-72, -110, 34, 8]; // unit bounds x0 y0 x1 y1
const HW = HB[2] - HB[0], HH = HB[3] - HB[1];
// part outlines (unit coords; closed splines)
const HP = {
  farShin: [-37, -22, -28, -23, -26, -46, -30, -66, -38, -66, -40, -44],
  back: [-12, -2, 6, 0, 17, -4, 22, -18, 22, -34, 17, -50, 8, -62, -4, -69, -14, -70, -20, -62, -18, -44, -16, -24],
  farBoot: [-21, -4, -41, -4, -43, -9, -35, -12, -29, -13, -28, -27, -18, -28, -17, -9],
  thigh: [-6, -10, -14, -4, -24, -20, -36, -50, -42, -66, -36, -73, -26, -68, -14, -46, -2, -24],
  shin: [-46, -6, -36, -6, -32, -30, -32, -56, -38, -70, -46, -66, -46, -40],
  skirt: [-14, -2, -8, -26, -12, -40, -20, -44, -22, -30, -24, -12],
  boot: [-62, 0, -63, -5, -54, -9, -48, -11, -47, -28, -33, -29, -32, -6, -33, 1],
  arm: [-6, -66, -14, -56, -18, -46, -26, -42, -40, -42, -50, -46, -52, -52, -44, -53, -30, -50, -24, -54, -20, -64, -12, -70],
  hand: [-50, -52, -56, -51, -59, -48, -57, -44, -51, -44, -48, -47],
  cuff: [-47, -54, -51, -53, -51, -44, -47, -43, -45, -48],
  hood: [-34, -71, -36, -82, -31, -93, -20, -99, -8, -101, 0, -96, 5, -86, 9, -74, 8, -64, -2, -64, -14, -64, -26, -65],
};
const HPATH = {};
function hpath(k) {
  if (!HPATH[k]) { const p = new Path2D(); K.spline(p, HP[k], true); HPATH[k] = p; }
  return HPATH[k];
}
let HSIL = null;
function hudSil() {
  if (!HSIL) {
    // one consistent winding for every part, so overlaps never cancel into holes under nonzero fill
    HSIL = new Path2D();
    for (const k in HP) {
      let pts = HP[k];
      if (K.area(pts) < 0) { const r = []; for (let i = pts.length - 2; i >= 0; i -= 2) r.push(pts[i], pts[i + 1]); pts = r; }
      const p = new Path2D(); K.spline(p, pts, true); HSIL.addPath(p);
    }
  }
  return HSIL;
}
// tiling material rasters (per-pixel work, baked once)
function nylonTex() {
  // PVC-coated nylon: a fine ripstop grid, low-frequency mottling and crumple creases
  return K.texBake("f07nylon", 128, 128, (u, v, out, x, y) => {
    const m = K.texFbm(u * 4, v * 4, 11, 4, 4, 4);
    const cr = K.texRidged(u * 6, v * 6, 12, 3, 6, 6);
    const grid = (x % 8 === 0 || y % 8 === 0) ? -10 : 0;
    const f = K.texNoise(u * 64, v * 64, 13, 64, 64) * 8;
    const l = clamp(128 + m * 26 + (cr - 0.5) * 40 + grid + f, 0, 255);
    out[0] = out[1] = out[2] = l; out[3] = 255;
  });
}
function creaseTex() {
  // long soft creases (ridged noise stretched along one axis): the way a stiff PVC coat crumples
  return K.texBake("f07crease", 128, 128, (u, v, out) => {
    const r = K.texRidged(u * 3, v * 7, 15, 4, 3, 7);
    const m = K.texFbm(u * 2, v * 2, 16, 3, 2, 2);
    const l = clamp(128 + (r - 0.55) * 120 + m * 20, 0, 255);
    out[0] = out[1] = out[2] = l; out[3] = 255;
  });
}
function denimTex() {
  // a diagonal twill with slubs (neutral grey; the albedo colour comes from the fill under it)
  return K.texBake("f07denim", 96, 96, (u, v, out, x, y) => {
    const tw = ((x + y) % 4 < 2) ? 14 : -14;
    const slub = K.texNoise(u * 3, v * 24, 21, 3, 24) * 22;
    const m = K.texFbm(u * 3, v * 3, 22, 3, 3, 3) * 18;
    const l = clamp(128 + tw * 0.6 + slub + m, 0, 255);
    out[0] = out[1] = out[2] = l; out[3] = 255;
  });
}
function dampTex() {
  // rain-soaked patches: soft blotches (alpha) where the coat is wetter and darker
  return K.texBake("f07damp", 128, 128, (u, v, out) => {
    const n = K.texFbm(u * 3, v * 3, 31, 4, 3, 3) + 0.25 * K.texNoise(u * 12, v * 12, 32, 12, 12);
    const a = smooth(clamp((n + 0.12) * 1.5)) * 0.55;
    out[0] = 26; out[1] = 22; out[2] = 12; out[3] = a * 255;
  });
}
const H_COAT = "#d4a42c", H_JEANS = "#33456c", H_BOOT = "#9a2622", H_SKIN = "#c99070";
function hudAlbedo() {
  return K.sprite("f07hud-alb", HW * HU, HH * HU, (s) => {
    s.translate(-HB[0] * HU, -HB[1] * HU);
    s.scale(HU, HU);
    s.lineCap = "round";
    s.lineJoin = "round";
    const pat = (tex, sc) => { const p = s.createPattern(tex, "repeat"); if (p.setTransform) p.setTransform(new DOMMatrix([sc / HU, 0, 0, sc / HU, 0, 0])); return p; };
    const nyl = pat(nylonTex(), 0.55), den = pat(denimTex(), 0.45), dmp = pat(dampTex(), 1.8), crs = pat(creaseTex(), 2.2);
    const stroke = (pts, w, c) => { s.strokeStyle = c; s.lineWidth = w; s.beginPath(); s.moveTo(pts[0], pts[1]); s.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]); s.stroke(); };
    // a soft fold: a wide dark trough with a narrower lit crest beside it (several passes = soft edges)
    const fold = (pts, w, dk = 0.22, lt = 0.1, off = 1.2) => {
      for (let k = 3; k >= 1; k--) stroke(pts, w * k * 0.6, rgba("#000000", dk / (k + 0.6)));
      const q = pts.map((v, i) => (i % 2 ? v - off * 0.6 : v - off));
      for (let k = 2; k >= 1; k--) stroke(q, w * k * 0.35, rgba("#ffffff", lt / (k + 0.4)));
    };
    const material = (p, base, tex, texA, dampA) => {
      s.fillStyle = base; s.fill(p);
      s.save(); s.clip(p);
      s.globalCompositeOperation = "overlay"; s.globalAlpha = texA; s.fillStyle = tex; s.fill(p);
      s.globalCompositeOperation = "source-over"; s.globalAlpha = 1;
      if (dampA) { s.globalAlpha = dampA; s.fillStyle = dmp; s.fill(p); s.globalAlpha = 1; }
      if (tex === nyl) { s.globalCompositeOperation = "soft-light"; s.globalAlpha = 0.75; s.fillStyle = crs; s.fill(p); s.globalCompositeOperation = "source-over"; s.globalAlpha = 1; }
      return () => s.restore();
    };
    // roll-off: every part darkens toward its own edges (a cheap baked form/AO term)
    const rolloff = (p, cx, cy, r, a = 0.45) => {
      const gr = s.createRadialGradient(cx, cy, r * 0.25, cx, cy, r);
      gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, rgba("#000000", a));
      s.fillStyle = gr; s.fill(p);
    };
    const coatD = shade(H_COAT, -0.35);
    // ---- far shin + far boot ----
    let done = material(hpath("farShin"), shade(H_JEANS, -0.35), den, 0.5);
    rolloff(hpath("farShin"), -33, -44, 26, 0.5); done();
    done = material(hpath("farBoot"), shade(H_BOOT, -0.3), "#808080", 0);
    { const tg = s.createLinearGradient(-42, 0, -18, 0); tg.addColorStop(0, "rgba(0,0,0,0.5)"); tg.addColorStop(0.5, "rgba(0,0,0,0)"); s.fillStyle = tg; s.fill(hpath("farBoot")); }
    s.fillStyle = "#140808"; s.fillRect(-45, -6, 29, 3);
    done();
    // ---- torso: hunched back ----
    done = material(hpath("back"), H_COAT, nyl, 0.6, 0.55);
    rolloff(hpath("back"), 4, -34, 44, 0.5);
    fold([4, -64, 12, -48, 13, -30, 8, -6], 3.2, 0.26, 0.1);   // spine valley
    fold([18, -40, 12, -30, 13, -18, 18, -6], 2.2, 0.2, 0.08);
    fold([-14, -6, -6, -8, 4, -4, 14, -6], 2.4, 0.3, 0.06);    // bunching at the seat
    fold([-4, -20, 2, -16, 8, -14, 16, -16], 1.6, 0.22, 0.08);
    fold([8, -58, 14, -50, 18, -42, 20, -34], 1.4, 0.16, 0.1);
    s.strokeStyle = "rgba(0,0,0,0.35)"; s.lineWidth = 0.5;
    s.beginPath(); s.moveTo(-16, -62); s.quadraticCurveTo(0, -58, 14, -52); s.stroke(); // yoke seam
    s.strokeStyle = "rgba(255,255,255,0.12)"; s.beginPath(); s.moveTo(-16, -61.3); s.quadraticCurveTo(0, -57.3, 14, -51.3); s.stroke();
    // occlusion band where the near arm crosses the body (soft, wide, on the torso just under the sleeve)
    for (let k = 4; k >= 1; k--) stroke([-6, -64, -12, -54, -16, -46, -24, -40], k * 2.6, rgba("#000000", 0.16));
    done();
    // ---- near thigh + shin: denim ----
    done = material(hpath("thigh"), shade(H_JEANS, -0.12), den, 0.55);
    rolloff(hpath("thigh"), -24, -40, 34, 0.45);
    fold([-30, -60, -26, -52, -20, -40, -14, -30], 1.4, 0.22, 0.08);
    done();
    done = material(hpath("shin"), H_JEANS, den, 0.55);
    { const sg = s.createLinearGradient(-47, 0, -31, 0); sg.addColorStop(0, "rgba(0,0,0,0.05)"); sg.addColorStop(0.4, "rgba(255,255,255,0.06)"); sg.addColorStop(1, "rgba(0,0,0,0.5)"); s.fillStyle = sg; s.fill(hpath("shin")); }
    s.strokeStyle = "rgba(0,0,0,0.35)"; s.lineWidth = 0.5;
    s.beginPath(); s.moveTo(-40, -8); s.bezierCurveTo(-38, -28, -38, -48, -42, -64); s.stroke(); // inseam
    s.strokeStyle = "rgba(200,190,150,0.25)"; s.setLineDash([0.8, 0.9]); s.beginPath(); s.moveTo(-39.2, -8); s.bezierCurveTo(-37.2, -28, -37.2, -48, -41.2, -64); s.stroke(); s.setLineDash([]);
    fold([-46, -60, -42, -58, -38, -60, -34, -62], 1.2, 0.25, 0.1); // knee creases
    fold([-45, -18, -42, -16, -38, -17, -34, -19], 1.4, 0.3, 0.06);  // stacked hem over the boot
    // the arm wrapped round the shins shadows them
    for (let k = 3; k >= 1; k--) stroke([-50, -42, -44, -40, -38, -40, -32, -42], k * 3, rgba("#000000", 0.18));
    done();
    // coat skirt over the thigh
    done = material(hpath("skirt"), shade(H_COAT, -0.04), nyl, 0.6, 0.45);
    rolloff(hpath("skirt"), -14, -22, 26, 0.3);
    fold([-12, -36, -14, -26, -16, -16, -18, -4], 1.6, 0.3, 0.1);
    fold([-23, -6, -19, -4, -15, -3, -11, -3], 1.0, 0.32, 0.1); // the hem turned up: a crease above the hem
    done();
    // ---- near boot: glossy rubber shaft, darker scuffed toe, a thick sole with a lighter edge ----
    done = material(hpath("boot"), H_BOOT, nyl, 0.15);
    { const bg = s.createLinearGradient(-63, 0, -32, 0); bg.addColorStop(0, "rgba(0,0,0,0.55)"); bg.addColorStop(0.35, "rgba(0,0,0,0.15)"); bg.addColorStop(0.6, "rgba(255,255,255,0.05)"); bg.addColorStop(1, "rgba(0,0,0,0.5)"); s.fillStyle = bg; s.fill(hpath("boot")); }
    { const tg = s.createRadialGradient(-60, -3, 0, -60, -3, 9); tg.addColorStop(0, "rgba(10,2,2,0.55)"); tg.addColorStop(1, "rgba(10,2,2,0)"); s.fillStyle = tg; s.fillRect(-70, -14, 20, 16); }
    s.fillStyle = "rgba(0,0,0,0.35)"; s.fillRect(-48, -29.5, 16, 3); // cuff band
    s.fillStyle = "rgba(255,200,190,0.12)"; s.fillRect(-48, -29.5, 16, 0.6);
    fold([-47, -22, -44, -21, -40, -21, -35, -22], 1.0, 0.25, 0.08); // ankle flex creases
    fold([-47, -17, -44, -16, -40, -16, -35, -17], 0.9, 0.2, 0.06);
    done();
    s.fillStyle = "#120707"; // sole
    s.beginPath(); s.moveTo(-64.5, -2.6); s.lineTo(-31.5, -2.6); s.lineTo(-31.5, 1.6); s.quadraticCurveTo(-48, 2.4, -63.5, 1.6); s.closePath(); s.fill();
    s.fillStyle = "rgba(160,150,150,0.28)"; s.fillRect(-64, -2.6, 32, 0.5);
    s.fillStyle = "rgba(0,0,0,0.6)"; for (let i = 0; i < 8; i++) s.fillRect(-62 + i * 4, 0.6, 2, 1);
    // ---- near arm: sleeve with compression folds at the elbow ----
    done = material(hpath("arm"), H_COAT, nyl, 0.6, 0.5);
    { const ag = s.createLinearGradient(0, -70, 0, -42); ag.addColorStop(0, "rgba(255,255,255,0.06)"); ag.addColorStop(0.5, "rgba(0,0,0,0)"); ag.addColorStop(1, "rgba(0,0,0,0.42)"); s.fillStyle = ag; s.fill(hpath("arm")); }
    fold([-18, -50, -20, -46, -24, -44, -28, -45], 1.6, 0.32, 0.12);
    fold([-15, -56, -17, -52, -20, -50, -24, -50], 1.3, 0.28, 0.1);
    fold([-34, -44, -36, -47, -38, -50, -38, -52], 1.2, 0.25, 0.1);
    fold([-26, -47, -30, -46, -34, -46, -38, -47], 1.0, 0.2, 0.1);
    fold([-10, -66, -14, -62, -16, -58, -16, -54], 1.3, 0.2, 0.08);
    // the elbow: a stack of sharp compression creases radiating from the inside of the bend
    for (let i = 0; i < 4; i++) fold([-20 - i * 1.6, -52 + i * 0.6, -22 - i * 1.6, -49 + i * 0.8, -24 - i * 1.4, -47 + i, -25 - i * 1.2, -45.5 + i], 0.55, 0.38, 0.14, 0.5);
    done();
    // hand + cuff
    done = material(hpath("hand"), H_SKIN, "#808080", 0);
    rolloff(hpath("hand"), -54, -49, 7, 0.45);
    s.strokeStyle = "rgba(60,30,25,0.45)"; s.lineWidth = 0.45;
    for (const yy of [-49, -46.5]) { s.beginPath(); s.moveTo(-57, yy); s.lineTo(-51, yy); s.stroke(); }
    done();
    done = material(hpath("cuff"), shade(H_COAT, -0.25), nyl, 0.5, 0.6);
    rolloff(hpath("cuff"), -48, -49, 6, 0.5); done();
    // ---- the hood: bowed onto the knees; the seam pinched where it is gathered at the neck ----
    done = material(hpath("hood"), H_COAT, nyl, 0.6, 0.7);
    rolloff(hpath("hood"), -14, -86, 26, 0.45);
    // crown seam: a raised welt with a stitch line, pinched into small radiating puckers at the back
    s.strokeStyle = "rgba(0,0,0,0.42)"; s.lineWidth = 0.7;
    s.beginPath(); s.moveTo(-20, -100); s.bezierCurveTo(-10, -98, -2, -92, 0, -76); s.stroke();
    s.strokeStyle = "rgba(255,255,255,0.16)"; s.lineWidth = 0.5;
    s.beginPath(); s.moveTo(-20.6, -99.2); s.bezierCurveTo(-10.6, -97.2, -2.8, -91.4, -0.8, -76); s.stroke();
    for (let i = 0; i < 6; i++) {
      const k = 0.35 + i * 0.11, sx = lerp(-10, 0, k), sy = lerp(-97, -76, k);
      fold([sx, sy, sx + 2, sy + 1, sx + 4, sy + 1.5, sx + 6 - i * 0.3, sy + 1 + i * 0.4], 0.7, 0.3, 0.1, 0.6);
    }
    fold([-6, -70, -2, -72, 2, -76, 3, -82], 2.4, 0.26, 0.08);   // gathers at the neck
    fold([-16, -68, -10, -70, -6, -73, -3, -76], 1.8, 0.24, 0.08);
    fold([-26, -66, -20, -67, -14, -66, -8, -66], 1.4, 0.26, 0.06);
    // the opening turned down toward the knees: a sliver of dark lining + the rolled brim
    // the opening: a deep shadowed lining inside a thick rolled brim (an inner occlusion, then the
    // brim's rounded welt catching light along its crest, then a thin dark edge where it turns under)
    for (const [w, a] of [[5.2, 0.35], [3.6, 0.6], [2.2, 0.9]]) {
      s.strokeStyle = rgba("#050302", a); s.lineWidth = w;
      s.beginPath(); s.moveTo(-30, -93); s.quadraticCurveTo(-37.5, -82, -33, -69); s.stroke();
    }
    s.strokeStyle = shade(H_COAT, -0.12); s.lineWidth = 2.6;
    s.beginPath(); s.moveTo(-27.6, -95.5); s.quadraticCurveTo(-34.2, -83, -30.4, -69.5); s.stroke();
    s.strokeStyle = rgba("#fff4d0", 0.22); s.lineWidth = 0.9;
    s.beginPath(); s.moveTo(-27.2, -95.8); s.quadraticCurveTo(-33.6, -83.4, -29.8, -70); s.stroke();
    s.strokeStyle = rgba("#000000", 0.4); s.lineWidth = 0.6;
    s.beginPath(); s.moveTo(-26.2, -96.2); s.quadraticCurveTo(-32.4, -83.6, -28.8, -70.4); s.stroke();
    done();
    s.strokeStyle = "rgba(210,214,222,0.5)"; s.lineWidth = 0.45;
    s.beginPath(); s.moveTo(-31, -68); s.quadraticCurveTo(-32, -64, -31, -60); s.stroke(); // drawstring
    s.fillStyle = "rgba(30,30,34,0.9)"; s.fillRect(-31.8, -60.5, 1.6, 2.2);
    // the figure sinks into shadow toward the floor (bounce is weak off dark boards)
    s.globalCompositeOperation = "source-atop";
    const fg = s.createLinearGradient(0, -70, 0, 6);
    fg.addColorStop(0, "rgba(0,0,0,0)"); fg.addColorStop(1, "rgba(0,0,0,0.3)");
    s.fillStyle = fg; s.fillRect(HB[0], -70, HW, 80);
    s.globalCompositeOperation = "source-over";
  });
}
function huddle(g, x, y, s, t, o = {}) {
  const u = s / 100;
  const tr = o.tremble || 0;
  const jx = noise(t * 23, 3) * tr * 1.2, jy = noise(t * 19, 4) * tr * 0.8;
  const br = Math.sin(t * 2.4) * 0.004; // breathing: the back rises a little
  const warm = clamp(o.warm || 0);
  const moon = o.moon == null ? 1 : o.moon;
  const flash = clamp(o.flash || 0);
  // contact shadows on the planks: a tight umbra under the seat and the boot soles, soft penumbra round them
  K.shadowBlob(g, x - s * 0.06, y + 1, s * 0.22, s * 0.028, { alpha: 0.9, soft: 1.3 });
  K.shadowBlob(g, x - s * 0.47, y + 1, s * 0.16, s * 0.016, { alpha: 0.95, soft: 0.7 });
  K.shadowBlob(g, x - s * 0.3, y - s * 0.03, s * 0.1, s * 0.012, { alpha: 0.6, soft: 0.8 });
  const BW = HW * HU, BH = HH * HU;
  const alb = hudAlbedo();
  const L = K.layer(BW, BH, "f07hudL"), lg = L.g;
  const M = K.layer(BW, BH, "f07hudM"), mg = M.g;
  // ---- light map (box px; unit (ux, uy) -> ((ux - HB0) * HU, (uy - HB1) * HU)) ----
  const bx = (ux) => (ux - HB[0]) * HU, by = (uy) => (uy - HB[1]) * HU;
  const amb = mix("#151b2a", "#1a1714", warm * 0.4);
  mg.fillStyle = amb;
  mg.fillRect(0, 0, BW, BH);
  mg.globalCompositeOperation = "lighter";
  // the storm window, off-frame left: a cold key falling off across the figure (and a little from above);
  // it stays on as the cool fill of the side turned away from the candle
  const km = mg.createLinearGradient(0, BH * 0.15, BW, BH * 0.7);
  const mk = moon * (1 - warm * 0.15);
  km.addColorStop(0, rgba("#8fa3cc", 0.95 * mk));
  km.addColorStop(0.5, rgba("#56688e", 0.6 * mk));
  km.addColorStop(1, rgba("#202a40", 0.3 * mk));
  mg.fillStyle = km;
  mg.fillRect(0, 0, BW, BH);
  if (flash > 0.01) {
    const kf = mg.createLinearGradient(0, 0, BW, BH * 0.5);
    kf.addColorStop(0, rgba("#e6eeff", 0.9 * flash));
    kf.addColorStop(1, rgba("#9aaad0", 0.35 * flash));
    mg.fillStyle = kf;
    mg.fillRect(0, 0, BW, BH);
  }
  let wx = 0, wy = 0;
  if (warm > 0.001) {
    // the candle on the floor: inverse-square, so the boots and the near flank glow and the hood falls off
    wx = ((o.warmAt ? o.warmAt.x : x + s) - x) / u; wy = ((o.warmAt ? o.warmAt.y : y) - y) / u;
    const cx = bx(wx), cy = by(wy);
    // inverse-square from a flame at floor level: bright on the boots and the near flank, a short
    // falloff up the back, nearly nothing on the hood. Multiplied by a facing term (the flank turned
    // toward the flame takes it, the far side of the figure does not), so a terminator runs down the
    // coat instead of the whole coat glowing as if lit from inside.
    const WL = K.layer(BW, BH, "f07hudW"), wl = WL.g;
    const wg = wl.createRadialGradient(cx, cy, 4, cx, cy, 95 * HU);
    wg.addColorStop(0, rgba("#ffd29a", 1.0));
    wg.addColorStop(0.12, rgba("#ffb064", 0.9));
    wg.addColorStop(0.3, rgba("#e8843a", 0.5));
    wg.addColorStop(0.55, rgba("#a0501c", 0.18));
    wg.addColorStop(1, rgba("#4a2008", 0));
    wl.fillStyle = wg;
    wl.fillRect(0, 0, BW, BH);
    wl.globalCompositeOperation = "destination-in";
    const face = wl.createLinearGradient(bx(wx - 8), 0, bx(-30), 0);
    face.addColorStop(0, "rgba(0,0,0,1)");
    face.addColorStop(0.35, "rgba(0,0,0,0.75)");
    face.addColorStop(0.7, "rgba(0,0,0,0.2)");
    face.addColorStop(1, "rgba(0,0,0,0.05)");
    wl.fillStyle = face;
    wl.fillRect(0, 0, BW, BH);
    wl.globalCompositeOperation = "source-over";
    mg.globalAlpha = warm;
    mg.drawImage(WL.canvas, 0, 0, BW, BH);
    mg.globalAlpha = 1;
  }
  mg.globalCompositeOperation = "source-over";
  lg.drawImage(alb, 0, 0, BW, BH);
  lg.globalCompositeOperation = "multiply";
  lg.drawImage(M.canvas, 0, 0, BW, BH);
  // ---- wet PVC: soft specular streaks along the curve of the back, hood and sleeve (catching the
  // window, or the flame on the right flank once it is lit) ----
  lg.globalCompositeOperation = "lighter";
  lg.save();
  lg.translate(-HB[0] * HU, -HB[1] * HU);
  lg.scale(HU, HU);
  lg.lineCap = "round";
  const spec = mix(MOONC, "#ffffff", 0.35 + flash * 0.65);
  const sk = (0.22 + flash * 0.6) * moon * (1 - warm * 0.6);
  const streak = (pts, w, a, c) => {
    if (a <= 0.003) return;
    for (const [mul, al] of [[4, 0.25], [1.6, 0.55], [0.6, 1]]) {
      lg.strokeStyle = rgba(c, a * al); lg.lineWidth = w * mul;
      lg.beginPath(); lg.moveTo(pts[0], pts[1]); lg.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]); lg.stroke();
    }
  };
  streak([-2, -64, 8, -58, 14, -46, 16, -30], 3.2, sk * 0.16, spec); // the sheen band (wide, faint)
  streak([-16, -97, -10, -95, -6, -91, -4, -86], 0.8, sk * 0.5, spec);
  streak([-10, -60, -2, -56, 4, -48, 6, -36], 0.9, sk * 0.6, spec);
  streak([-34, -50, -28, -51, -20, -52, -12, -60], 0.7, sk * 0.5, spec);
  streak([-58, -26, -58, -18, -58, -10, -57, -5], 0.6, sk * 1.1, spec); // boot shaft
  if (warm > 0.001) {
    const wc = "#ffc078";
    streak([18, -40, 20, -30, 19, -18, 15, -6], 0.9, 0.5 * warm, wc);
    streak([12, -36, 16, -28, 17, -18, 15, -8], 2.6, 0.14 * warm, "#ffb070"); // the flame's sheen band
    streak([-35, -26, -34, -18, -33, -10, -33, -4], 0.6, 0.65 * warm, wc); // boot, flame side
    streak([4, -90, 6, -84, 7, -78, 7, -72], 0.6, 0.2 * warm, wc);
  }
  lg.restore();
  lg.globalCompositeOperation = "source-over";
  // ---- thin rims: cold on the window side; a ~2 px warm rim on the candle side only ----
  lg.save();
  lg.setTransform(K.pixelScale() * HU, 0, 0, K.pixelScale() * HU, -HB[0] * HU * K.pixelScale(), -HB[1] * HU * K.pixelScale());
  const sil = hudSil(), box = [HB[0], HB[1], HB[2], HB[3]];
  K.crescent(lg, sil, 0.9, 0.5, mix(MOONC, "#dfe8ff", flash), (0.18 + flash * 0.55) * moon * (1 - warm * 0.5), box, "lighter", 1);
  if (warm > 0.001) {
    const dx = wx + 10, dy = wy + 50, l = Math.hypot(dx, dy) || 1;
    K.crescent(lg, sil, -(dx / l) * 0.6, -(dy / l) * 0.6, "#ffb860", 0.42 * warm, box, "lighter", 1);
  }
  lg.restore();
  lg.globalCompositeOperation = "destination-in";
  lg.drawImage(alb, 0, 0, BW, BH);
  lg.globalCompositeOperation = "source-over";
  // ---- composite (breathing lifts the back from the floor pivot) ----
  g.save();
  g.translate(x + jx, y + jy);
  g.scale(u / HU, (u / HU) * (1 + br));
  g.drawImage(L.canvas, HB[0] * HU, HB[1] * HU, BW, BH);
  g.restore();
  if (o.wet) {
    // a few beads of rain still running down the back
    g.save();
    g.translate(x + jx, y + jy);
    g.scale(u, u);
    for (let i = 0; i < 7; i++) {
      const xx = -12 + hash(i, 81) * 32, yy = -60 + hash(i, 82) * 50 + ((t * (0.6 + hash(i, 84))) % 1) * 6;
      glow(g, xx, yy, 0.9, mix("#cfe0ff", "#ffd090", warm), 0.35 * o.wet);
    }
    g.restore();
  }
}

// ---- SHOT 1: the attic, wide ----------------------------------------------------------------------------
const A = { floor: 1.4, knee: 0.5, ridge: -2.3, half: 2.6, end: 9 };
const roofX = (Y) => A.half * (Y - A.ridge) / (A.knee - A.ridge);
function windowOutside(g, cx, cy, r, t, fl) {
  const sk = g.createLinearGradient(0, cy - r, 0, cy + r);
  sk.addColorStop(0, mix("#202838", "#c8d4f0", fl));
  sk.addColorStop(1, mix("#2c3648", "#9aa8c8", fl));
  g.fillStyle = sk;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.save();
  g.globalAlpha = 0.85;
  K.rain(g, cx * 2, cy + r, t, { density: 0.8, angle: 0.25, color: "rgba(210,222,245,0.75)", seed: 21 });
  g.restore();
}
function roundWindow(g, cx, cy, r, t, fl, o = {}) {
  // frame
  g.fillStyle = mix("#1a1410", "#5a5a68", fl * 0.2);
  g.beginPath();
  g.arc(cx, cy, r * 1.16, 0, TAU);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.clip();
  if (o.outside) o.outside(g, cx, cy, r, fl); else windowOutside(g, cx, cy, r, t, fl);
  K.glassDrops(g, cx - r, cy - r, r * 2, r * 2, t, { seed: 31, density: 1.6, light: fl > 0.1 ? "#ffffff" : "#9fb0d0" });
  // rain running down the glass: wavering rivulets, each with a bright bead at its head
  {
    const n = 7;
    g.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const sp = 0.18 + hash(i, 41) * 0.25;
      const ph = ((t * sp + hash(i, 42)) % 1 + 1) % 1;
      const xs = cx - r * 0.85 + hash(i, 43) * r * 1.7;
      const yh = cy - r + ph * r * 2.2;
      const len = r * (0.35 + hash(i, 44) * 0.5);
      g.strokeStyle = rgba(fl > 0.1 ? "#ffffff" : "#b8c8e8", 0.18 + fl * 0.4);
      g.lineWidth = Math.max(0.8, r * 0.012);
      g.beginPath();
      for (let k = 0; k <= 6; k++) {
        const yy = yh - (k / 6) * len, xx = xs + Math.sin(yy * 0.08 + i) * r * 0.012;
        if (k) g.lineTo(xx, yy); else g.moveTo(xx, yy);
      }
      g.stroke();
      glow(g, xs, yh, Math.max(1.5, r * 0.03), "#dfe8ff", 0.35 + fl * 0.5);
    }
  }
  const rg = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  rg.addColorStop(0, "rgba(255,255,255,0.08)");
  rg.addColorStop(0.5, "rgba(255,255,255,0)");
  rg.addColorStop(1, "rgba(255,255,255,0.05)");
  g.fillStyle = rg;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.restore();
  g.strokeStyle = mix("#140e0a", "#4a4a58", fl * 0.6);
  g.lineWidth = Math.max(2, r * 0.07);
  g.beginPath();
  g.moveTo(cx - r, cy); g.lineTo(cx + r, cy);
  g.moveTo(cx, cy - r); g.lineTo(cx, cy + r);
  g.stroke();
  g.lineWidth = Math.max(2, r * 0.1);
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.stroke();
  g.strokeStyle = rgba("#9fb0d0", 0.25 + fl * 0.5);
  g.lineWidth = 1;
  g.beginPath();
  g.arc(cx, cy, r * 1.12, Math.PI * 1.1, Math.PI * 1.6);
  g.stroke();
}
/// sheet-draped furniture: ghostly shapes under dust sheets (x, y = floor centre, w, h px)
const DRAPES = {
  chair: [-0.5, 0, -0.5, -0.42, -0.44, -0.56, -0.3, -0.5, -0.08, -0.5, 0.02, -0.92, 0.28, -1.0, 0.4, -0.62, 0.48, -0.56, 0.53, 0],
  tall: [-0.42, 0, -0.36, -0.7, -0.3, -0.95, 0, -1.0, 0.3, -0.95, 0.36, -0.7, 0.42, 0],
  mound: [-0.5, 0, -0.47, -0.72, -0.32, -0.86, 0.18, -0.84, 0.44, -0.72, 0.5, 0],
};
function draped(g, x, y, w, h, seed, fl, warm = 0, kind = "chair") {
  const R = K.rng("drape" + seed);
  const shape = DRAPES[kind] || DRAPES.chair;
  const pts = [];
  for (let i = 0; i < shape.length; i += 2) pts.push(x + shape[i] * w, y + shape[i + 1] * h);
  // the sheet flares out a little where it meets the floor
  pts[0] -= w * 0.06;
  pts[pts.length - 2] += w * 0.06;
  const p = new Path2D();
  K.spline(p, pts, false);
  p.closePath();
  // an old, greyish cotton dust sheet: neutral cloth in cold light (not a saturated blue)
  const lit = mix("#4a5062", "#e2e6f0", fl * 0.85);
  const gr = g.createLinearGradient(x - w * 0.5, y - h, x + w * 0.4, y);
  gr.addColorStop(0, mix(lit, "#e0a060", warm * 0.45));
  gr.addColorStop(0.55, mix("#2a2e3a", "#8a90a4", fl * 0.6));
  gr.addColorStop(1, "#0e1016");
  g.fillStyle = gr;
  g.fill(p);
  K.texFill(g, "fabric", p, { scale: Math.max(24, w * 0.18), mode: "overlay", alpha: 0.55, tex: FABRIC });
  K.texFill(g, "macro", p, { scale: w * 1.5, mode: "soft-light", alpha: 0.5, tex: MACRO });
  g.save();
  g.clip(p);
  // hanging folds as SOFT light/shadow bands: one horizontal gradient with seeded stops, so each
  // fold is a smooth roll of cloth (dark core, lit shoulder) instead of a painted stripe
  const fg = g.createLinearGradient(x - w * 0.56, 0, x + w * 0.56, 0);
  const hi = rgba(mix("#9aa6c4", "#ffffff", fl), 0.1 + fl * 0.22);
  const lo = "rgba(4,6,12,0.42)";
  const n = 6;
  fg.addColorStop(0, "rgba(0,0,0,0)");
  for (let i = 0; i < n; i++) {
    const c = (i + 0.5 + (R() - 0.5) * 0.5) / n;
    fg.addColorStop(clamp(c - 0.06, 0.001, 0.999), "rgba(0,0,0,0)");
    fg.addColorStop(clamp(c - 0.025, 0.001, 0.999), hi);
    fg.addColorStop(clamp(c + 0.02, 0.001, 0.999), lo);
    fg.addColorStop(clamp(c + 0.065, 0.001, 0.999), "rgba(0,0,0,0)");
  }
  fg.addColorStop(1, "rgba(0,0,0,0)");
  // the folds hang below where the sheet drapes over the furniture's top (fainter above)
  g.fillStyle = fg;
  g.globalAlpha = 0.9;
  g.fillRect(x - w * 0.6, y - h * 0.62, w * 1.2, h * 0.64);
  g.globalAlpha = 0.45;
  g.fillRect(x - w * 0.6, y - h * 1.02, w * 1.2, h * 0.42);
  g.globalAlpha = 1;
  // the top of the sheet catches the cold window light; its underside falls into shadow
  const tg = g.createRadialGradient(x - w * 0.1, y - h * 0.95, 2, x - w * 0.1, y - h * 0.8, w * 0.6);
  tg.addColorStop(0, rgba(mix("#8a98ba", "#ffffff", fl), 0.22 + fl * 0.25));
  tg.addColorStop(1, "rgba(120,140,180,0)");
  g.fillStyle = tg;
  g.fillRect(x - w, y - h * 1.1, w * 2, h);
  // the cloth hangs from a few support points (the chair's back and seat corners, a wardrobe's top
  // corners): it sags between them in a shadowed catenary and falls from each in tube folds
  const PEAKS = { chair: [[0.15, -0.98], [-0.44, -0.56], [0.48, -0.56]], tall: [[-0.3, -0.95], [0.3, -0.95]], mound: [[-0.32, -0.86], [0.18, -0.84]] }[kind] || [];
  g.lineCap = "round";
  const soft = (x0, y0, cx, cy, x1, y1, wd, col, a) => {
    for (const [m, k] of [[2.6, 0.35], [1.5, 0.6], [0.7, 1]]) {
      g.strokeStyle = rgba(col, a * k * 0.5); g.lineWidth = wd * m;
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke();
    }
  };
  const litC = mix("#8a98ba", "#ffffff", fl);
  for (let i = 0; i < PEAKS.length; i++) {
    const [px0, py0] = PEAKS[i];
    const pxs = x + px0 * w, pys = y + py0 * h;
    // tube folds fanning down from the support to the hem
    for (let k = -1; k <= 1; k++) {
      const ex = pxs + k * w * (0.12 + R() * 0.06), ey = y - h * 0.02;
      const wd = Math.max(1.5, w * (0.03 + R() * 0.02));
      soft(pxs, pys + h * 0.04, (pxs + ex) / 2 + k * w * 0.02, (pys + ey) / 2, ex, ey, wd, "#04060c", 0.5);
      soft(pxs - wd * 0.8, pys + h * 0.06, (pxs + ex) / 2 + k * w * 0.02 - wd * 0.8, (pys + ey) / 2, ex - wd * 0.8, ey, wd * 0.5, litC, 0.12 + fl * 0.25);
    }
    // the sag to the next support
    if (i + 1 < PEAKS.length) {
      const [qx0, qy0] = PEAKS[i + 1];
      const qx = x + qx0 * w, qy = y + qy0 * h;
      const sag = h * 0.12;
      soft(pxs, pys + h * 0.05, (pxs + qx) / 2, Math.max(pys, qy) + sag, qx, qy + h * 0.05, Math.max(2, w * 0.05), "#04060c", 0.55);
      soft(pxs, pys + h * 0.015, (pxs + qx) / 2, Math.max(pys, qy) + sag - h * 0.04, qx, qy + h * 0.015, Math.max(1, w * 0.02), litC, 0.1 + fl * 0.2);
    }
  }
  // the hem: a soft wavy edge where the cloth pools on the floor
  g.strokeStyle = "rgba(0,0,0,0.25)";
  g.lineWidth = Math.max(1, w * 0.02);
  g.beginPath();
  for (let i = 0; i <= 12; i++) { const xx = x - w * 0.56 + (i / 12) * w * 1.12, yy = y - h * 0.03 + Math.sin(i * 1.9 + seed) * h * 0.012; if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy); }
  g.stroke();
  // contact shadow along the floor
  const sg = g.createLinearGradient(0, y - h * 0.12, 0, y);
  sg.addColorStop(0, "rgba(0,0,0,0)");
  sg.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = sg;
  g.fillRect(x - w, y - h * 0.12, w * 2, h * 0.12);
  g.restore();
  g.save();
  g.translate(x, y);
  g.scale(1, 0.12);
  glow(g, 0, 0, w * 0.75, "#000000", 0.5, "source-over");
  g.restore();
  K.aoEdge(g, x - w * 0.56, y - 1, x + w * 0.56, y - 1, { width: Math.max(3, h * 0.08), alpha: 0.5, side: 1 });
}
// an old steamer trunk: plank body, a domed lid with curvature shading, brass corners + straps + lock
function trunk(g, x, y, w, h, fl, warm = 0) {
  const c = mix(mix("#33241a", "#6a625e", fl * 0.25), "#8a5a30", warm * 0.4);
  const brass = mix(mix("#4a4028", "#8a8670", fl * 0.25), "#b08848", warm * 0.4);
  const x0 = x - w / 2, x1 = x + w / 2, top = y - h, lidH = h * 0.36;
  // the window is behind it: its shadow is thrown toward us across the boards, then the contact umbra
  K.shadowBlob(g, x, y + h * 0.12, w * 0.5, h * 0.16, { alpha: 0.45, soft: 0.8 });
  K.shadowBlob(g, x, y - 1, w * 0.5, Math.max(2, h * 0.05), { alpha: 0.85 });
  // body: planks with a gradient that rolls off at both ends (a box, lit from the upper left)
  const bg = g.createLinearGradient(x0, 0, x1, 0);
  bg.addColorStop(0, shade(c, -0.05));
  bg.addColorStop(0.35, shade(c, 0.08));
  bg.addColorStop(1, shade(c, -0.42));
  g.fillStyle = bg;
  g.fillRect(x0, top, w, h);
  K.texRect(g, "wood", x0, top, w, h, { scale: w * 0.9, scaleY: h * 1.05, mode: "soft-light", alpha: 0.9, tex: WOOD });
  K.texRect(g, "macro", x0, top, w, h, { scale: w * 1.4, mode: "soft-light", alpha: 0.5, tex: MACRO });
  const vg = g.createLinearGradient(0, top, 0, y);
  vg.addColorStop(0, "rgba(0,0,0,0.25)");
  vg.addColorStop(0.2, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = vg;
  g.fillRect(x0, top, w, h);
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = Math.max(0.6, h * 0.02);
  g.beginPath();
  for (let k = 1; k < 4; k++) { g.moveTo(x0, top + (h * k) / 4); g.lineTo(x1, top + (h * k) / 4); }
  g.stroke();
  // domed lid: a barrel-top whose highlight runs along the curve
  const lid = new Path2D();
  lid.moveTo(x0 - w * 0.015, top);
  lid.bezierCurveTo(x0 - w * 0.01, top - lidH * 0.9, x1 + w * 0.01, top - lidH * 0.9, x1 + w * 0.015, top);
  lid.closePath();
  const lg = g.createLinearGradient(0, top - lidH * 0.7, 0, top);
  lg.addColorStop(0, shade(c, -0.15));
  lg.addColorStop(0.3, mix(shade(c, 0.25), "#c8d4f0", fl * 0.3));
  lg.addColorStop(0.6, shade(c, 0.02));
  lg.addColorStop(1, shade(c, -0.35));
  g.fillStyle = lg;
  g.fill(lid);
  const ls = g.createLinearGradient(x0, 0, x1, 0);
  ls.addColorStop(0, "rgba(0,0,0,0)");
  ls.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = ls;
  g.fill(lid);
  // lid lip shadow
  g.fillStyle = "rgba(0,0,0,0.5)";
  g.fillRect(x0, top, w, Math.max(1, h * 0.04));
  // brass: straps over the lid + down the front, corner caps, a lock plate
  const strap = (sx) => {
    const sw = w * 0.07;
    const sg = g.createLinearGradient(sx - sw / 2, 0, sx + sw / 2, 0);
    sg.addColorStop(0, shade(brass, -0.3));
    sg.addColorStop(0.45, shade(brass, 0.25));
    sg.addColorStop(1, shade(brass, -0.35));
    g.fillStyle = sg;
    g.save();
    g.clip(lid);
    g.fillRect(sx - sw / 2, top - lidH, sw, lidH);
    g.restore();
    g.fillRect(sx - sw / 2, top, sw, h);
    g.fillStyle = "rgba(0,0,0,0.35)";
    for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(sx, top + h * (0.12 + k * 0.25), Math.max(0.6, w * 0.008), 0, TAU); g.fill(); }
  };
  strap(x - w * 0.3);
  strap(x + w * 0.3);
  const corner = (cx, cy, sx, sy) => {
    const s = Math.min(w, h) * 0.11;
    g.fillStyle = shade(brass, sx < 0 ? -0.05 : -0.35);
    g.beginPath();
    g.moveTo(cx, cy); g.lineTo(cx - sx * s, cy); g.lineTo(cx, cy - sy * s);
    g.closePath();
    g.fill();
  };
  corner(x0, y, -1, 1); corner(x1, y, 1, 1); corner(x0, top, -1, -1); corner(x1, top, 1, -1);
  const lpw = w * 0.11, lph = h * 0.2;
  const lpg = g.createLinearGradient(x - lpw / 2, top, x + lpw / 2, top + lph);
  lpg.addColorStop(0, shade(brass, 0.35));
  lpg.addColorStop(1, shade(brass, -0.3));
  g.fillStyle = lpg;
  g.fillRect(x - lpw / 2, top - lph * 0.15, lpw, lph);
  g.fillStyle = "rgba(0,0,0,0.7)";
  g.fillRect(x - lpw * 0.08, top + lph * 0.3, lpw * 0.16, lph * 0.35);
  // dust on the lid top; the window behind catches its far edge (a cold rim along the dome)
  g.fillStyle = rgba("#9aa4b8", 0.1 + fl * 0.06);
  g.fill(lid);
  g.strokeStyle = rgba(mix("#6a7aa0", "#e6eeff", fl), 0.18 + fl * 0.5);
  g.lineWidth = Math.max(0.6, h * 0.018);
  g.beginPath();
  g.moveTo(x0 + w * 0.04, top - lidH * 0.42);
  g.bezierCurveTo(x0 + w * 0.2, top - lidH * 0.7, x1 - w * 0.2, top - lidH * 0.7, x1 - w * 0.04, top - lidH * 0.42);
  g.stroke();
  // occlusion under the lid lip and along the base
  K.aoEdge(g, x0, y - 1, x1, y - 1, { width: h * 0.25, alpha: 0.45, side: 1 });
  // it sits in the dark, far from the window: everything but the flash is a low key
  const all = new Path2D(lid);
  all.rect(x0 - w * 0.02, top, w * 1.04, h);
  g.fillStyle = rgba("#05070d", 0.38 * (1 - fl) * (1 - warm * 0.6));
  g.fill(all);
}
// ---- the attic floor: real sawn boards, baked once per pixel (top-down: x across the attic, y along it),
// then projected row by row into the shot's perspective and cached per camera ----
const FLOOR_N = 28; // boards across the attic
function plankTex() {
  return K.texBake("f07planks", 512, 1024, (u, v, out, x, y) => {
    const fi = u * FLOOR_N, i = Math.floor(fi), fu = fi - i;
    const L = 0.24, off = hash(i, 3) * L, jv = (v + off) / L, j = Math.floor(jv), fj = jv - j;
    const tone = hash(i * 31 + j * 7, 4), age = hash(i * 13 + j, 5);
    const gq = K.texFbm(fu * 1.2 + i * 3.7, v * 28 + j * 5.1, 41, 4);
    const ring = Math.abs(Math.sin((fu * 3.2 + gq * 2.6 + tone * 9) * Math.PI));
    const fine = K.texNoise(u * 900, v * 60, 42) * 0.5 + 0.5;
    let r = lerp(78, 112, tone), gg = lerp(60, 86, tone), b = lerp(46, 64, tone);
    const lines = 1 - 0.32 * Math.pow(1 - ring, 6) - 0.06 * fine;
    const worn = 1 + 0.12 * smooth(1 - Math.abs(fu - 0.5) * 2) * age; // foot-worn centre of each board
    let k = lines * worn * (0.82 + 0.18 * (K.texFbm(u * 3, v * 6, 43, 3) * 0.5 + 0.5));
    // gaps between boards, butt joints, nail heads
    if (fu < 0.045 || fu > 0.965) k *= 0.25;
    if (fj < 0.006 || fj > 0.994) k *= 0.3;
    const nx = Math.abs(fu - 0.5), nyv = Math.min(fj, 1 - fj) * L * 1024;
    if (nx > 0.28 && nx < 0.36 && nyv > 3 && nyv < 6) k *= 0.45;
    // a film of dust, thicker toward the walls
    const dust = smooth(clamp(Math.abs(u - 0.5) * 2.4 - 0.6)) * 0.35 + 0.08 * (K.texFbm(u * 7, v * 7, 44, 3) * 0.5 + 0.5);
    r = r * k + (120 - r * k) * dust; gg = gg * k + (118 - gg * k) * dust; b = b * k + (116 - b * k) * dust;
    out[0] = clamp(r, 0, 255); out[1] = clamp(gg, 0, 255); out[2] = clamp(b, 0, 255); out[3] = 255;
  });
}
function plankMips() {
  const base = plankTex();
  if (base._mips) return base._mips;
  const mips = [base];
  let c = base;
  for (let k = 0; k < 3; k++) {
    const n = K.makeCanvas(c.width / 2, c.height / 2), x = n.getContext("2d");
    x.imageSmoothingQuality = "high";
    x.drawImage(c, 0, 0, n.width, n.height);
    mips.push(n);
    c = n;
  }
  base._mips = mips;
  return mips;
}
function floorSprite(cam, W, H) {
  const key = "f07floor:" + cam.x + ":" + cam.y + ":" + cam.z + ":" + cam.f + ":" + cam.cy;
  return K.sprite(key, W, H, (s) => {
    const mips = plankMips();
    const P = proj(cam);
    const eye = A.floor - cam.y;
    const yTop = P(0, A.floor, A.end)[1];
    for (let y = Math.floor(yTop); y < H; y++) {
      const Z0 = cam.z + eye * cam.f / Math.max(0.5, y - cam.cy), Z1 = cam.z + eye * cam.f / Math.max(0.5, y + 1 - cam.cy);
      if (Z0 > A.end + 0.01) continue;
      const a = P(-A.half, A.floor, Z0), b = P(A.half, A.floor, Z0);
      const sw = b[0] - a[0];
      const lv = clamp(Math.floor(Math.log2(512 / Math.max(1, sw))), 0, 3);
      const m = mips[lv], sc = m.width / 512;
      const v0 = (Z1 / 10) * 1024 * sc, v1 = (Z0 / 10) * 1024 * sc;
      s.drawImage(m, 0, Math.max(0, Math.min(v0, v1)), m.width, Math.max(1, Math.abs(v1 - v0)), a[0], y, sw, 1.6);
    }
    // the far boards dissolve into the cold air; the near ones fall away from the only light (the window)
    const fq = new Path2D();
    [[-A.half, A.end], [A.half, A.end], [A.half, cam.z + 0.3], [-A.half, cam.z + 0.3]].forEach(([X, Z], i) => { const q = P(X, A.floor, Z); if (i) fq.lineTo(q[0], q[1]); else fq.moveTo(q[0], q[1]); });
    fq.closePath();
    s.clip(fq);
    const hz = s.createLinearGradient(0, yTop, 0, yTop + (H - yTop) * 0.55);
    hz.addColorStop(0, rgba("#2a3448", 0.82));
    hz.addColorStop(1, rgba("#2a3448", 0));
    s.globalCompositeOperation = "source-atop";
    s.fillStyle = hz;
    s.fillRect(0, yTop, W, H - yTop);
    s.globalCompositeOperation = "multiply";
    const tn = s.createLinearGradient(0, yTop, 0, H);
    tn.addColorStop(0, "#9aa6c0");
    tn.addColorStop(0.35, "#6a7488");
    tn.addColorStop(1, "#262a36");
    s.fillStyle = tn;
    s.fillRect(0, yTop, W, H - yTop);
    s.globalCompositeOperation = "source-over";
  });
}
// the round window's light, projected through the glass (circle + mullion cross) onto a surface.
// d = the light direction (from the lightning, outside beyond the gable); planeY / planeZ pick the surface.
const WIN = { y: -0.75, r: 0.9, mw: 0.075 };
function windowQuads(d, onto) {
  const quads = [];
  for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const pts = [];
    const a0 = sx > 0 ? (sy > 0 ? 0 : -Math.PI / 2) : (sy > 0 ? Math.PI / 2 : Math.PI);
    const ia = Math.asin(WIN.mw / WIN.r);
    for (let k = 0; k <= 10; k++) {
      const a = a0 + ia + (k / 10) * (Math.PI / 2 - 2 * ia);
      pts.push(onto(Math.cos(a) * WIN.r, WIN.y + Math.sin(a) * WIN.r, d));
    }
    pts.push(onto(sx * WIN.mw, WIN.y + sy * WIN.mw, d));
    quads.push(pts);
  }
  return quads;
}
const ontoFloor = (X, Y, d) => { const s = (A.floor - Y) / d[1]; return [X + d[0] * s, A.floor, A.end + d[2] * s]; };
const ontoZ = (Zp) => (X, Y, d) => { const s = (Zp - A.end) / d[2]; return [X + d[0] * s, Y + d[1] * s, Zp]; };
function windowLight(g, P, quads, color, alpha, soft = 0) {
  if (alpha <= 0.003) return;
  g.save();
  g.globalCompositeOperation = "lighter";
  const path = new Path2D();
  let cx = 0, cy = 0, n = 0;
  for (const q of quads) {
    q.forEach((p, i) => { const s = P(p[0], p[1], p[2]); if (i) path.lineTo(s[0], s[1]); else path.moveTo(s[0], s[1]); cx += s[0]; cy += s[1]; n++; });
    path.closePath();
  }
  if (soft > 0) {
    // the penumbra: a lightning bolt is a long source, so the edges are a little soft
    cx /= n; cy /= n;
    for (const k of [1.05, 1.025]) {
      g.save();
      g.translate(cx, cy); g.scale(k, k); g.translate(-cx, -cy);
      g.fillStyle = rgba(color, alpha * soft * 0.35);
      g.fill(path);
      g.restore();
    }
  }
  g.fillStyle = rgba(color, alpha);
  g.fill(path);
  g.restore();
}
// rafters + collar ties as real timbers: the face toward us in shadow, the underside lit by the window
// at the far end, and every truss further away sinking into the cold blue haze
function truss(g, P, z, fl, zn, warm) {
  const hz = 1 - Math.exp(-(z - zn) * 0.2);
  const hazeC = mix("#2c3850", "#9aa6c4", fl * 0.25);
  const nearC = mix(mix("#14110e", "#5a5048", fl * 0.25), hazeC, hz * 0.85);
  const underC = mix(mix(mix("#3a3a40", "#8a96b4", fl * 0.6), "#7a5838", warm * 0.4), hazeC, hz * 0.8);
  const d = 0.2, tz = 0.12;
  const poly = (pts) => { g.beginPath(); pts.forEach((p, i) => { const s = P(p[0], p[1], p[2]); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); }); g.closePath(); };
  for (const side of [-1, 1]) {
    const nx = -side * 0.733, ny = 0.68;
    const k0 = [side * A.half, A.knee], r0 = [0, A.ridge];
    const k1 = [k0[0] + nx * d, k0[1] + ny * d], r1 = [r0[0] + nx * d * 0.4, r0[1] + ny * d * 1.4];
    // underside (lit)
    poly([[k1[0], k1[1], z], [r1[0], r1[1], z], [r1[0], r1[1], z + tz], [k1[0], k1[1], z + tz]]);
    const u0 = P(k1[0], k1[1], z), u1 = P(r1[0], r1[1], z);
    const ug = g.createLinearGradient(u0[0], u0[1], u1[0], u1[1]);
    ug.addColorStop(0, shade(underC, -0.3));
    ug.addColorStop(1, underC);
    g.fillStyle = ug;
    g.fill();
    // the near face (shadow side), with its grain
    poly([[k0[0], k0[1], z], [r0[0], r0[1], z], [r1[0], r1[1], z], [k1[0], k1[1], z]]);
    g.fillStyle = nearC;
    g.fill();
  }
  // collar tie
  const yT = -1.2, x1 = roofX(yT) - 0.05;
  poly([[-x1, yT + 0.16, z], [x1, yT + 0.16, z], [x1, yT + 0.16, z + tz], [-x1, yT + 0.16, z + tz]]);
  g.fillStyle = underC;
  g.fill();
  poly([[-x1, yT, z], [x1, yT, z], [x1, yT + 0.16, z], [-x1, yT + 0.16, z]]);
  g.fillStyle = nearC;
  g.fill();
  // a thin bright arris where the underside meets the far face (the window catches the edge)
  const e0 = P(-x1, yT + 0.16, z + tz), e1 = P(x1, yT + 0.16, z + tz);
  g.strokeStyle = rgba(mix("#7a8cb4", "#e6eeff", fl), (0.08 + 0.4 * fl) * (1 - hz * 0.7));
  g.lineWidth = Math.max(0.6, e0[2] * 0.012);
  g.beginPath(); g.moveTo(e0[0], e0[1]); g.lineTo(e1[0], e1[1]); g.stroke();
}
function attic(g, t, W, H, cam, fl, o = {}) {
  const P = proj(cam);
  const zn = cam.z + 0.25, zf = A.end;
  const warm = o.warm || 0;
  // the lightning only lifts the room a little (about 15%); the light that matters comes through the
  // window as a hard, window-shaped patch
  const dark = (c, k = 0.55) => mix(c, "#cfd8f0", fl * k * 0.25);
  // gable end wall: weathered vertical boards (frontal, so the texture is in true perspective)
  quad(g, P, [[-A.half, A.floor, zf], [-A.half, A.knee, zf], [0, A.ridge, zf], [A.half, A.knee, zf], [A.half, A.floor, zf]]);
  g.fillStyle = dark("#1e2632", 0.5);
  g.fill();
  {
    const gp = new Path2D();
    [[-A.half, A.floor], [-A.half, A.knee], [0, A.ridge], [A.half, A.knee], [A.half, A.floor]].forEach(([X, Y], i) => { const s = P(X, Y, zf); if (i) gp.lineTo(s[0], s[1]); else gp.moveTo(s[0], s[1]); });
    gp.closePath();
    const o0 = P(-A.half, A.floor, zf);
    K.texFill(g, "wood", gp, { scale: 4.2 * o0[2], scaleY: 1.2 * o0[2], rot: Math.PI / 2, _x: o0[0], _y: o0[1], alpha: 0.85, tex: WOOD, tint: dark("#34405a", 0.7), tintAlpha: 0.85 });
  }
  const wc = P(0, WIN.y, zf), wr = 0.95 * wc[2];
  // roof planes: sarking boards running away from us, each a slightly different age and tone
  for (const side of [-1, 1]) {
    quad(g, P, [[side * A.half, A.knee, zn], [0, A.ridge, zn], [0, A.ridge, zf], [side * A.half, A.knee, zf]]);
    const a = P(side * A.half, A.knee, zn), b = P(0, A.ridge, zf);
    const rg = g.createLinearGradient(a[0], a[1], b[0], b[1]);
    rg.addColorStop(0, dark("#0c1018", 0.3));
    rg.addColorStop(1, dark("#1c2430", 0.5));
    g.fillStyle = rg;
    g.fill();
    const NB = 11;
    for (let i = 0; i < NB; i++) {
      const k0 = i / NB, k1 = (i + 1) / NB;
      const X0 = side * A.half * (1 - k0), Y0 = lerp(A.knee, A.ridge, k0), X1 = side * A.half * (1 - k1), Y1 = lerp(A.knee, A.ridge, k1);
      quad(g, P, [[X0, Y0, zn], [X1, Y1, zn], [X1, Y1, zf], [X0, Y0, zf]]);
      const v = hash(i + (side > 0 ? 40 : 0), 17);
      g.fillStyle = v > 0.5 ? rgba("#9aa8c8", (v - 0.5) * 0.08 * (1 + fl * 0.4)) : rgba("#000000", (0.5 - v) * 0.5);
      g.fill();
    }
    g.strokeStyle = "rgba(0,0,0,0.45)";
    g.beginPath();
    for (let i = 1; i < NB; i++) {
      const k = i / NB, X = side * A.half * (1 - k), Y = lerp(A.knee, A.ridge, k);
      const p0 = P(X, Y, zn), p1 = P(X, Y, zf);
      g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]);
    }
    g.stroke();
    // knee wall
    quad(g, P, [[side * A.half, A.floor, zn], [side * A.half, A.knee, zn], [side * A.half, A.knee, zf], [side * A.half, A.floor, zf]]);
    g.fillStyle = dark("#141a24", 0.4);
    g.fill();
    const k0 = P(side * A.half, A.floor, zn + 0.6), k1 = P(side * A.half, A.floor, zf);
    K.aoEdge(g, k0[0], k0[1], k1[0], k1[1], { width: 26 * k1[2] / 40, alpha: 0.6, side: 0 });
  }
  // the floor: baked boards in true perspective (cached per camera); the flash adds only a small lift
  g.drawImage(floorSprite(cam, W, H), 0, 0, W, H);
  {
    const f1 = P(0, A.floor, zf);
    if (fl > 0.02) { g.fillStyle = rgba("#9aa8c8", fl * 0.1); g.globalCompositeOperation = "screen"; g.fillRect(-W, f1[1], W * 3, H * 2); g.globalCompositeOperation = "source-over"; }
    const e0 = P(-A.half, A.floor, zf), e1 = P(A.half, A.floor, zf);
    K.aoEdge(g, e0[0], e0[1], e1[0], e1[1], { width: 10, alpha: 0.6, side: -1 });
  }
  // window light on the floor: the round window and its cross, thrown long and sharp across the
  // boards toward us, sliding as the bolt jumps about the sky; between flashes only a faint sky glow
  const sh = boltShift(t);
  const dL = [sh * 0.65, 0.55, -1];
  const floorQ = windowQuads(dL, ontoFloor);
  windowLight(g, P, floorQ, "#8a9ab8", 0.05, 1);
  windowLight(g, P, floorQ, BOLT, 0.8 * fl, 1);
  // props, far to near (each with its contact shadow; the trunks catch the window patch on their fronts)
  const lit = (z, x0, y0, w, h) => {
    if (fl <= 0.02) return;
    g.save();
    g.beginPath(); g.rect(x0, y0, w, h); g.clip();
    windowLight(g, P, windowQuads(dL, ontoZ(z)), BOLT, 0.6 * fl, 0);
    g.restore();
  };
  const prop = (X, z, fn) => { if (z < cam.z + 0.5) return; const b = P(X, A.floor, z); fn(b[0], b[1], b[2], z); };
  prop(-1.5, 8.4, (x, y, s) => draped(g, x, y, s * 0.7, s * 1.7, 1, fl, warm, "tall"));
  prop(1.55, 8.0, (x, y, s, z) => { trunk(g, x, y, s * 0.9, s * 0.55, fl, warm); lit(z - 0.05, x - s * 0.45, y - s * 0.55, s * 0.9, s * 0.55); });
  prop(-1.9, 6.6, (x, y, s, z) => {
    trunk(g, x, y, s * 1.0, s * 0.6, fl, warm);
    lit(z - 0.05, x - s * 0.5, y - s * 0.6, s * 1.0, s * 0.6);
    trunk(g, x + s * 0.1, y - s * 0.6, s * 0.7, s * 0.4, fl, warm);
  });
  // cold air: the far end of the attic sinks into a blue-grey haze (atmospheric falloff with depth)
  {
    const v = P(0, -0.2, zf);
    const fgr = g.createRadialGradient(v[0], v[1], 4, v[0], v[1], W * 0.42);
    const fc = mix("#3a4660", "#c8d4f0", fl * 0.2);
    fgr.addColorStop(0, rgba(fc, 0.42 * (1 - warm * 0.5)));
    fgr.addColorStop(0.45, rgba(fc, 0.2 * (1 - warm * 0.5)));
    fgr.addColorStop(1, rgba(fc, 0));
    g.fillStyle = fgr;
    g.fillRect(0, 0, W, H);
  }
  prop(1.6, 5.6, (x, y, s) => draped(g, x, y, s * 1.25, s * 1.05, 2, fl, warm, "chair"));
  prop(-1.7, 3.9, (x, y, s) => draped(g, x, y, s * 1.2, s * 0.8, 3, fl, warm, "mound"));
  if (o.nearTrunk !== false) prop(1.9, 2.9, (x, y, s) => { if (s < 220) trunk(g, x, y, s * 1.1, s * 0.6, fl, warm); });
  // round window on the gable: in a flash the glass itself blows out (only the window, not the walls)
  roundWindow(g, wc[0], wc[1], wr, t, fl);
  glow(g, wc[0], wc[1], wr * 1.6, "#9fb0d0", 0.1 + fl * 0.3);
  // the storm light through the dusty air: a shaft from the window down to the patch on the boards
  {
    const pc = P(sh * 0.65 * 3.2, A.floor, A.end - 3.2);
    const ang = Math.atan2(pc[1] - wc[1], pc[0] - wc[0]);
    K.volumetricBeam(g, wc[0], wc[1], ang, Math.hypot(pc[0] - wc[0], pc[1] - wc[1]) * 1.15, 0.5, { color: fl > 0.05 ? BOLT : "#8a9cc0", intensity: 0.12 + fl * 0.4, t, width0: wr * 1.6, seed: 9 });
  }
  // rafters + collar ties (real timbers), with bats
  for (let z = Math.ceil(zn / 1.4) * 1.4; z < zf; z += 1.4) {
    if (z < zn + 0.2) continue;
    truss(g, P, z, fl, zn, warm);
    if (o.bats !== false) {
      const k = Math.round(z * 10);
      for (let i = 0; i < 2; i++) {
        if (hash(k + i, 3) < 0.45) continue;
        const X = (hash(k + i, 4) - 0.5) * 1.8;
        const q = P(X, -1.04, z);
        bat(g, q[0], q[1] + q[2] * 0.01, q[2] * 0.2, t, k + i, fl);
      }
    }
  }
  K.godRays(g, wc[0], wc[1], W, H, { color: fl > 0.05 ? BOLT : "#7a8aa8", count: 7, strength: 0.04 + fl * 0.18, t, angle: Math.PI / 2 + sh * 0.2, spread: 0.9, length: H * 0.9, seed: 7 });
  return { P, wc, wr };
}
function shot1(g, t, W, H) {
  const p = eio(seg(t, 0, 10));
  const fl = flashAt(t);
  // a slow eased push-in (a long-lens creep, so the floor plane can stay one cached, perspective-true layer)
  const cam = { x: 0, y: 0.15, z: -0.2, f: 400, cx: W / 2, cy: H * 0.46 };
  K.withCamera(g, W, H, { x: W / 2, y: H * 0.46, zoom: lerp(1.0, 1.16, p), shakeT: t, shakeAmt: 1 + fl * 3 }, () => {
    const st = attic(g, t, W, H, cam, fl);
    K.dust(g, W, H, t, { seed: 71, count: 30, color: "#b8c8e8", size: 1.2, alpha: 0.25 + fl * 0.5 });
    // motes drifting in the window shaft (brighter, denser, only inside the beam)
    const sx = st.wc[0], sy = st.wc[1];
    K.dust(g, W, H, t, { seed: 79, count: 55, color: "#d0dcf8", size: 1.5, alpha: 0.5 + fl * 0.5, area: [sx - st.wr * 1.6, sy, st.wr * 3.2, H * 0.62 - sy + 120] });
  });
}

// ---- SHOT 2: you, hunched in a corner -------------------------------------------------------------------
function cornerSet(g, t, W, H, fl, o = {}) {
  // a corner under the slope: sloped ceiling boards top-left, knee wall, floor; the storm window is
  // off-frame left, so every surface is lit from the left and falls off to the right. Every plane is
  // real sawn timber (kit wood), tinted by the cold light and darkened with distance from the window.
  const warm = o.warm || 0;
  const tintC = mix(mix("#3a4866", "#c8d4f0", fl * 0.7), "#7a5a40", warm * 0.5);
  const poly = (pts) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); return p; };
  const ceil = poly([[-60, -60], [W + 60, -60], [W + 60, 116], [-60, 258]]);
  const knee = poly([[-60, 258], [W + 60, 116], [W + 60, 302], [-60, 374]]);
  const floor = poly([[-60, 374], [W + 60, 302], [W + 60, H + 60], [-60, H + 60]]);
  g.fillStyle = "#0a0d14";
  g.fillRect(-60, -60, W + 120, H + 120);
  K.texFill(g, "wood", ceil, { scale: 620, scaleY: 120, rot: -0.135, alpha: 0.9, tex: WOOD, tint: tintC, tintAlpha: 0.88 });
  K.texFill(g, "wood", knee, { scale: 420, scaleY: 184, rot: Math.PI / 2, alpha: 0.9, tex: WOOD, tint: tintC, tintAlpha: 0.88 });
  K.texFill(g, "wood", floor, { scale: 900, scaleY: 360, rot: 2.56, alpha: 0.95, tex: WOOD, tint: tintC, tintAlpha: 0.85 });
  // falloff from the window (off-frame left) + occlusion in the seams
  const fall = g.createLinearGradient(-80, 0, W, 0);
  fall.addColorStop(0, "rgba(3,4,8,0)");
  fall.addColorStop(0.45, "rgba(3,4,8,0.35)");
  fall.addColorStop(1, "rgba(3,4,8,0.72)");
  g.fillStyle = fall;
  g.fillRect(-60, -60, W + 120, H + 120);
  const ceilDark = g.createLinearGradient(0, 0, 0, 258);
  ceilDark.addColorStop(0, "rgba(2,3,6,0.55)");
  ceilDark.addColorStop(1, "rgba(2,3,6,0.1)");
  g.fillStyle = ceilDark;
  g.fill(ceil);
  K.aoEdge(g, -60, 258, W + 60, 116, { width: 34, alpha: 0.55, side: 0 });
  K.aoEdge(g, -60, 374, W + 60, 302, { width: 40, alpha: 0.6, side: 0 });
  // rafters coming toward us with bats: heavy timbers, their window-facing edge picking up the light
  for (let i = 0; i < 4; i++) {
    const x = 120 + i * 250;
    const p = poly([[x - 14, -60], [x + 14, -60], [x + 30 + i * 6, 250 - x * 0.135 + 8], [x + 2 + i * 6, 250 - x * 0.135 + 12]]);
    g.fillStyle = mix("#06080c", "#3a4252", fl * 0.4);
    g.fill(p);
    K.texFill(g, "wood", p, { scale: 300, scaleY: 60, rot: 1.45, alpha: 0.35, mode: "soft-light", tex: WOOD });
    g.strokeStyle = rgba(fl > 0.05 ? BOLT : "#6a7aa0", 0.12 + fl * 0.4 - i * 0.025);
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x - 14, -60); g.lineTo(x + 2 + i * 6, 250 - x * 0.135 + 12); g.stroke();
    K.shadowBlob(g, x + 20 + i * 6, 250 - x * 0.135 + 14, 26, 8, { alpha: 0.5 });
    if (o.bats !== false) {
      for (let k = 0; k < 2; k++) {
        if (hash(i * 3 + k, 9) < 0.35) continue;
        const u = 0.25 + hash(i * 3 + k, 10) * 0.55;
        const bx = lerp(x, x + 16 + i * 6, u), by = lerp(0, 250 - x * 0.135 + 10, u);
        bat(g, bx + 8, by + 4, 22 + hash(i + k, 2) * 8, t, i * 3 + k, fl);
      }
    }
  }
  // the cold window light washing in from the left
  K.lightPool(g, -60, 300, 620, fl > 0.05 ? BOLT : "#5a6a90", { intensity: 0.22 + fl * 0.7 });
}
// a collar beam across the top of the frame with bats hanging from it, silhouetted against the
// faint moonlight bouncing off the ceiling boards
function batBeam(g, t, fl, y = 82) {
  glow(g, 560, y + 10, 330, mix("#34405a", "#c8d4f0", fl), 0.35 + fl * 0.4);
  const bm = g.createLinearGradient(0, y - 9, 0, y + 9);
  bm.addColorStop(0, mix("#0e1016", "#5a6478", fl * 0.5));
  bm.addColorStop(0.7, "#07080c");
  bm.addColorStop(1, rgba("#4a5a7a", 0.25 + fl * 0.4));
  g.fillStyle = bm;
  g.fillRect(180, y - 9, 800, 18);
  g.fillStyle = "rgba(0,0,0,0.4)";
  g.fillRect(180, y + 9, 800, 3);
  for (const [bx, bs, sd] of [[330, 27, 1], [430, 23, 2], [612, 29, 3], [748, 25, 4]]) {
    g.save();
    g.globalAlpha = 0.8;
    glow(g, bx, y + 9 + bs * 0.6, bs * 1.4, "#5a6c98", 0.55 + fl * 0.5);
    g.restore();
    bat(g, bx, y + 9, bs, t, sd * 7, fl);
  }
}
// the dying flashlight on the floor (shot 2): body, beam, a grain-lit ellipse on the boards, a hot
// spot on the knee wall. The light sprites are textured with the same timber as the set (cached),
// so the light picks the grain out of the wood; dim (0..1, flickering) drives everything.
const TORCH = { x: 740, y: 430, a: -0.72, len: 166 };
function torchPoolSprite() {
  return K.sprite("f07torchpool", 200, 120, (s) => {
    K.texRect(s, "wood", 0, 0, 200, 120, { scale: 900, scaleY: 360, rot: 0.22, tex: WOOD });
    s.globalCompositeOperation = "screen";
    s.fillStyle = "rgba(190,205,235,0.35)";
    s.fillRect(0, 0, 200, 120);
    s.globalCompositeOperation = "destination-in";
    s.save();
    s.translate(122, 60);
    s.scale(1, 0.36);
    const eg = s.createRadialGradient(0, 0, 4, 0, 0, 96);
    eg.addColorStop(0, "rgba(0,0,0,1)");
    eg.addColorStop(0.55, "rgba(0,0,0,0.75)");
    eg.addColorStop(1, "rgba(0,0,0,0)");
    s.fillStyle = eg;
    s.fillRect(-140, -180, 280, 360);
    s.restore();
    const lgr = s.createLinearGradient(0, 0, 200, 0);
    lgr.addColorStop(0, "rgba(0,0,0,0.25)");
    lgr.addColorStop(0.35, "rgba(0,0,0,0.8)");
    lgr.addColorStop(0.75, "rgba(0,0,0,1)");
    lgr.addColorStop(1, "rgba(0,0,0,0.85)");
    s.fillStyle = lgr;
    s.fillRect(0, 0, 200, 120);
  });
}
function torchWallSprite() {
  return K.sprite("f07torchwall", 120, 96, (s) => {
    K.texRect(s, "wood", 0, 0, 120, 96, { scale: 420, scaleY: 184, rot: Math.PI / 2, tex: WOOD });
    s.globalCompositeOperation = "screen";
    s.fillStyle = "rgba(200,212,240,0.4)";
    s.fillRect(0, 0, 120, 96);
    s.globalCompositeOperation = "destination-in";
    s.save();
    s.translate(60, 48);
    s.scale(1, 0.78);
    const eg = s.createRadialGradient(0, 0, 2, 0, 0, 58);
    eg.addColorStop(0, "rgba(0,0,0,1)");
    eg.addColorStop(0.4, "rgba(0,0,0,0.7)");
    eg.addColorStop(0.8, "rgba(0,0,0,0.22)");
    eg.addColorStop(1, "rgba(0,0,0,0)");
    s.fillStyle = eg;
    s.fillRect(-60, -62, 120, 124);
    s.restore();
  });
}
function torchScene(g, t, dim) {
  const { x: fx, y: fy, a, len } = TORCH;
  const ca = Math.cos(a), sa = Math.sin(a);
  const lx = fx + ca * 16, ly = fy + sa * 16;
  const hx = lx + ca * len, hy = ly + sa * len;
  const d = clamp(dim);
  if (d > 0.01) {
    // the beam's footprint on the boards: a cone fanning out from the lens, raking along the floor and
    // ending in a bright elliptical hot spot where it meets the knee wall. It is painted as light
    // (alpha), then the floor's own timber is laid INTO it (source-in, the same texture mapping as the
    // floor), and the result is added: so the light picks out the grain, the joints and the knots of
    // exactly the boards it falls on, and lights nothing outside the cone.
    const BX = 560, BY = 170, BW2 = 420, BH2 = 320;
    const L = K.layer(BW2, BH2, "f07torchL"), lg = L.g;
    lg.translate(-BX, -BY);
    const floor = new Path2D();
    floor.moveTo(-60, 374); floor.lineTo(1020, 302); floor.lineTo(1020, 600); floor.lineTo(-60, 600); floor.closePath();
    lg.save();
    lg.clip(floor);
    // the torch lies on the floor, so near the lens only the bottom of the beam grazes the boards; the
    // footprint brightens and widens toward the wall (a soft-edged cone: three nested fans)
    const cg = lg.createRadialGradient(lx, ly, 2, lx, ly, len * 1.2);
    cg.addColorStop(0, "rgba(255,255,255,0.18)");
    cg.addColorStop(0.5, "rgba(255,255,255,0.3)");
    cg.addColorStop(0.85, "rgba(255,255,255,0.42)");
    cg.addColorStop(1, "rgba(255,255,255,0)");
    lg.fillStyle = cg;
    for (const [sp, al] of [[0.34, 0.35], [0.26, 0.5], [0.18, 0.6]]) {
      const cone = new Path2D();
      cone.moveTo(lx - sa * 2, ly + ca * 2);
      cone.lineTo(lx + Math.cos(a - sp) * len * 1.25, ly + Math.sin(a - sp) * len * 1.25);
      cone.lineTo(lx + Math.cos(a + sp) * len * 1.25, ly + Math.sin(a + sp) * len * 1.25);
      cone.closePath();
      lg.globalAlpha = al;
      lg.fill(cone);
    }
    lg.globalAlpha = 1;
    // the hot spot: an ellipse stretched along the beam where it lands (softer outer pool round it)
    lg.save();
    lg.translate(hx - ca * 26, hy - sa * 26 + 4);
    lg.rotate(a * 0.35);
    lg.scale(1, 0.42);
    const hg = lg.createRadialGradient(0, 0, 2, 0, 0, 62);
    hg.addColorStop(0, "rgba(255,255,255,0.9)");
    hg.addColorStop(0.45, "rgba(255,255,255,0.45)");
    hg.addColorStop(1, "rgba(255,255,255,0)");
    lg.fillStyle = hg;
    lg.fillRect(-70, -150, 140, 300);
    lg.restore();
    lg.restore();
    K.texFill(lg, "wood", floor, { scale: 900, scaleY: 360, rot: 2.56, mode: "source-in", tex: WOOD });
    // the light is a cool white LED; the boards are warm: tint toward the beam colour a little
    lg.globalCompositeOperation = "source-atop";
    lg.fillStyle = "rgba(200,215,255,0.3)";
    lg.fillRect(BX, BY, BW2, BH2);
    lg.globalCompositeOperation = "source-over";
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = d;
    g.drawImage(L.canvas, BX, BY, BW2, BH2);
    g.globalAlpha = 0.6 * d;
    g.drawImage(L.canvas, BX, BY, BW2, BH2);
    // the spot on the knee wall (timber-textured sprite), and the faint bounce it throws round
    g.globalAlpha = 0.9 * d;
    g.drawImage(torchWallSprite(), hx - 58, hy - 70, 120, 96);
    g.globalAlpha = 0.5 * d;
    g.drawImage(torchWallSprite(), hx - 40, hy - 56, 84, 68);
    g.restore();
    K.lightPool(g, hx - 40, hy + 20, 260, "#b8c8f0", { intensity: 0.08 * d, flat: 0.6 });
    // the cone through the dusty air: a faint volumetric wedge, motes sparkling only inside it
    K.flashlightBeam(g, lx, ly, a, len, { spread: 0.42, alpha: 0.2 * d, hot: d > 0.5, t, dust: true, color: "#e8eeff" });
    K.dust(g, 960, 540, t, { seed: 76, count: 22, color: "#e8eeff", size: 1.0, alpha: 0.55 * d, area: [lx, hy - 30, hx - lx + 20, ly - hy + 40] });
  }
  // the torch: a knurled aluminium tube lying on the boards, its own shadow under it
  K.shadowBlob(g, fx - 2, fy + 5, 26, 3.5, { alpha: 0.8, soft: 0.8 });
  g.save();
  g.translate(fx, fy);
  g.rotate(a);
  const tg = g.createLinearGradient(0, -6, 0, 6);
  tg.addColorStop(0, "#565a62");
  tg.addColorStop(0.3, "#8a8e98");
  tg.addColorStop(0.55, "#3a3d44");
  tg.addColorStop(1, "#121318");
  g.fillStyle = tg;
  g.beginPath(); K.roundRect(g, -30, -5.5, 40, 11, 2.5); g.fill();
  g.beginPath(); K.roundRect(g, 8, -7.5, 9, 15, 2); g.fill();
  g.fillStyle = "rgba(0,0,0,0.45)";
  for (let k = 0; k < 9; k++) g.fillRect(-26 + k * 3.2, -5.5, 1.2, 11);
  g.fillStyle = "rgba(200,210,230,0.25)";
  g.fillRect(-30, -3.8, 40, 0.8);
  // the lens face: a white-hot disc while the batteries hold (the GPU lens blooms it), a dull orange
  // filament when they sag; a thin bright bezel round it
  g.fillStyle = mix("#3a2a1a", "#ffffff", d);
  g.beginPath(); g.ellipse(17.2, 0, 2.2, 7, 0, 0, TAU); g.fill();
  g.strokeStyle = rgba("#c8d0e0", 0.5);
  g.lineWidth = 0.8;
  g.beginPath(); g.ellipse(17.2, 0, 2.6, 7.4, 0, 0, TAU); g.stroke();
  g.restore();
  glow(g, lx + 1, ly - 1, 7, "#ffffff", 0.95 * d);
  glow(g, lx, ly, 26, "#dfe8ff", 0.4 * d);
}
function shot2(g, t, W, H) {
  const p = eio(seg(t, 10, 19));
  const fl = flashAt(t) * 0.6;
  K.withCamera(g, W, H, { x: 480 + p * 20, y: 270, zoom: 1.02 + p * 0.05, shakeT: t, shakeAmt: 1.2 }, () => {
    cornerSet(g, t, W, H, fl);
    batBeam(g, t, fl);
    // a trunk behind, a sheet draped over a chair
    draped(g, 150, 400, 230, 190, 4, fl, 0, "chair");
    // the flashlight, dropped on the floor beside you: its batteries are dying (flicker + fade). It
    // lies pointing at the knee wall: a long cool-white ellipse slides up the boards (picking out their
    // grain) and a hot spot lands on the wall; the same flicker drives the bulb, the beam and both pools.
    const dim = (1 - p * 0.75) * (noise(t * 9, 4) > 0.55 ? 0.35 : 1) * (t > 17.6 && t < 17.9 ? 0.15 : 1) * (0.94 + 0.06 * noise(t * 31, 6));
    torchScene(g, t, dim);
    huddle(g, 610, 466, 300, t, { tremble: 1, flash: fl * 1.4, wet: 0.6 });
    K.dust(g, W, H, t, { seed: 72, count: 24, color: "#b8c8e8", size: 1.1, alpha: 0.3 });
  });
}

// a jingle bell in polished brass, close up: a sphere lit by the storm window (upper left) with the window
// itself mirrored in it (a curved bright pane with its cross), the dark attic reflected in its lower
// half, the stamped slot with its two round ends, a soldered loop and a red ribbon through it.
// (x, y) = centre, r = radius, fl = lightning 0..1. Drawn in the fist's local units.
function brassBell(g, x, y, r, t, fl) {
  // ribbon behind the loop
  g.lineCap = "round";
  g.strokeStyle = "#7a1c1a"; g.lineWidth = r * 0.2;
  g.beginPath(); g.moveTo(x - r * 0.15, y - r * 1.05); g.bezierCurveTo(x + r * 0.6, y - r * 1.5, x + r * 1.6, y - r * 1.3, x + r * 2.4, y - r * 0.9); g.stroke();
  g.strokeStyle = "#b8302c"; g.lineWidth = r * 0.12;
  g.beginPath(); g.moveTo(x - r * 0.15, y - r * 1.08); g.bezierCurveTo(x + r * 0.6, y - r * 1.55, x + r * 1.6, y - r * 1.36, x + r * 2.4, y - r * 0.96); g.stroke();
  // the loop
  g.strokeStyle = "#5a4214"; g.lineWidth = r * 0.14;
  g.beginPath(); g.ellipse(x, y - r * 1.02, r * 0.2, r * 0.17, 0, Math.PI * 0.95, Math.PI * 2.05); g.stroke();
  // the sphere: brass body (dark edges = fresnel toward a dark room), warm mid
  const body = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
  body.addColorStop(0, "#f2d488");
  body.addColorStop(0.3, "#c8962e");
  body.addColorStop(0.7, "#7a5412");
  body.addColorStop(1, "#2a1a06");
  g.fillStyle = body;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.save();
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
  // the lower half mirrors the dark floor: a soft horizon across the sphere
  const hz = g.createLinearGradient(0, y - r * 0.05, 0, y + r * 0.35);
  hz.addColorStop(0, "rgba(20,12,4,0)");
  hz.addColorStop(1, "rgba(20,12,4,0.55)");
  g.fillStyle = hz;
  g.fillRect(x - r, y - r * 0.05, r * 2, r * 1.1);
  // the storm window mirrored on the shoulder of the sphere: a bulged pane with its cross bars
  g.save();
  g.translate(x - r * 0.42, y - r * 0.42);
  g.rotate(-0.5);
  g.scale(1, 0.7);
  const pane = mix("#c8d4f0", "#ffffff", fl);
  g.fillStyle = rgba(pane, 0.75 + fl * 0.25);
  g.beginPath(); g.ellipse(0, 0, r * 0.3, r * 0.26, 0, 0, TAU); g.fill();
  g.strokeStyle = "rgba(40,30,20,0.6)"; g.lineWidth = r * 0.04;
  g.beginPath(); g.moveTo(-r * 0.3, 0); g.lineTo(r * 0.3, 0); g.moveTo(0, -r * 0.26); g.lineTo(0, r * 0.26); g.stroke();
  g.restore();
  // a second, warmer reflection (the bounce off your sleeve) low on the right
  g.fillStyle = "rgba(255,190,90,0.22)";
  g.beginPath(); g.ellipse(x + r * 0.5, y + r * 0.45, r * 0.28, r * 0.12, -0.6, 0, TAU); g.fill();
  // the slot: a dark stamped groove round the lower half, ending in two round holes, its lower lip lit
  g.strokeStyle = "#140c02"; g.lineWidth = r * 0.12;
  g.beginPath(); g.ellipse(x, y + r * 0.08, r * 0.92, r * 0.3, 0, 0.12, Math.PI - 0.12); g.stroke();
  for (const sx of [-1, 1]) { g.fillStyle = "#0e0802"; g.beginPath(); g.arc(x + sx * r * 0.84, y + r * 0.2, r * 0.11, 0, TAU); g.fill(); }
  g.strokeStyle = "rgba(255,214,140,0.35)"; g.lineWidth = r * 0.035;
  g.beginPath(); g.ellipse(x, y + r * 0.16, r * 0.9, r * 0.3, 0, 0.3, Math.PI - 0.3); g.stroke();
  // the equator seam where the two stamped halves meet
  g.strokeStyle = "rgba(60,40,10,0.45)"; g.lineWidth = r * 0.025;
  g.beginPath(); g.ellipse(x, y - r * 0.02, r, r * 0.22, 0, Math.PI, TAU); g.stroke();
  g.restore();
}

// ---- SHOT 3: extreme close-up, the bell in your fist -----------------------------------------------------
// your fist, coming in from the right and clutching the bell: (x, y) = wrist, s = wrist->front of
// the fist px. Seen from the thumb side: the fingers curl round the bell, the thumb presses over it,
// knuckles + nails are shaded; the red string runs from the bell's loop back round the wrist.
// o: fl (lightning 0..1), t, glint
function fistWithBell(g, x, y, s, t, o = {}) {
  const u = s / 100;
  const fl = o.fl || 0;
  const SK = mix("#c48c6c", "#e8eefc", fl * 0.35), SKD = mix("#7a4434", "#6a7290", 0.2), SKL = mix("#e8bc9c", "#ffffff", fl * 0.5);
  g.save();
  g.translate(x, y);
  g.scale(u, u);
  g.lineCap = "round";
  g.lineJoin = "round";
  // a cylinder-ish stroke: lit along its top-left edge, dark underneath
  const seg2 = (ax, ay, bx, by, w, col = SK) => {
    const nx = -(by - ay), ny = bx - ax, l = Math.hypot(nx, ny) || 1;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const gr = g.createLinearGradient(mx - (nx / l) * w * 0.5, my - (ny / l) * w * 0.5, mx + (nx / l) * w * 0.5, my + (ny / l) * w * 0.5);
    gr.addColorStop(0, shade(col, -0.35));
    gr.addColorStop(0.45, col);
    gr.addColorStop(0.8, mix(col, SKL, 0.5));
    gr.addColorStop(1, shade(col, -0.15));
    g.strokeStyle = gr;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
  };
  const knuckle = (kx, ky, r, a = 0.5) => {
    const kg = g.createRadialGradient(kx - r * 0.3, ky - r * 0.4, 0, kx, ky, r);
    kg.addColorStop(0, rgba(SKL, a));
    kg.addColorStop(1, rgba(SKL, 0));
    g.fillStyle = kg;
    g.fillRect(kx - r, ky - r, r * 2, r * 2);
  };
  const crease = (cx, cy, r, a0, a1) => { g.strokeStyle = rgba(SKD, 0.7); g.lineWidth = 0.7; g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke(); };
  // --- the curled fingers behind the bell: middle, ring, little (stacked, each a little lower/back) ---
  for (let i = 3; i >= 1; i--) {
    const kx = -60 + i * 7, ky = -14 + i * 8;
    seg2(kx, ky, kx - 14, ky + 14, 15 - i, shade(SK, -0.08 * i));
    seg2(kx - 14, ky + 14, kx - 2, ky + 24, 13 - i, shade(SK, -0.1 * i));
    knuckle(kx - 14, ky + 14, 6, 0.35);
    crease(kx - 14, ky + 14, 5, 0.2, 1.4);
    crease(kx - 14, ky + 14, 3.6, 0.35, 1.25);
    crease(kx - 14.5, ky + 14.5, 6.4, 0.3, 1.1);
    // the fingertip curling back toward the palm: a nail bed (pale, glossy, a pink lunula)
    g.save();
    g.translate(kx - 3.5, ky + 22.5);
    g.rotate(0.95);
    g.fillStyle = mix("#e2b8a8", "#ffffff", fl * 0.4);
    g.beginPath(); g.ellipse(0, 0, 3.6 - i * 0.3, 2.3, 0, 0, TAU); g.fill();
    g.strokeStyle = rgba(SKD, 0.55); g.lineWidth = 0.5;
    g.beginPath(); g.arc(-2.4, 0, 2.4, -1.1, 1.1); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.beginPath(); g.ellipse(0.6, -0.8, 1.5, 0.5, 0, 0, TAU); g.fill();
    g.restore();
  }
  // --- the red string: from the bell's loop, back along the palm side, round the wrist ---
  g.strokeStyle = "#a8322e";
  g.lineWidth = 2.6;
  g.beginPath();
  g.moveTo(-72, 10);
  g.bezierCurveTo(-60, 40, -18, 36, 2, 26);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(6, 0, 6, 26, 0.08, -Math.PI / 2, Math.PI / 2);
  g.stroke();
  g.strokeStyle = "rgba(255,170,160,0.35)";
  g.lineWidth = 1;
  g.beginPath();
  g.ellipse(7, 0, 6, 26, 0.08, -Math.PI / 2.4, Math.PI / 3);
  g.stroke();
  // --- back of the hand: wrist -> knuckles (tendons, a vein, knuckle bumps) ---
  const back = new Path2D();
  K.spline(back, [6, -28, -20, -32, -44, -34, -60, -28, -66, -16, -60, -2, -40, 8, -14, 18, 6, 22, 10, 0], true);
  const bg = g.createLinearGradient(-30, -36, -20, 22);
  bg.addColorStop(0, SKL);
  bg.addColorStop(0.35, SK);
  bg.addColorStop(1, shade(SK, -0.4));
  g.fillStyle = bg;
  g.fill(back);
  g.save();
  g.clip(back);
  g.strokeStyle = rgba(SKL, 0.3);
  g.lineWidth = 1.6;
  for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(0, -24 + k * 3); g.quadraticCurveTo(-26, -30 + k * 4, -50 + k * 4, -28 + k * 5); g.stroke(); }
  g.strokeStyle = rgba("#6a7aa8", 0.2);
  g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(4, -10); g.bezierCurveTo(-12, -16, -22, -8, -34, -14); g.stroke();
  g.restore();
  knuckle(-58, -26, 9, 0.6);
  knuckle(-50, -20, 7, 0.4);
  // --- the bell, clutched in the curl ---
  const bx = -74, by = 7, br = 18;
  brassBell(g, bx, by, br, t, fl);
  // fingers cast a soft shadow onto the brass
  g.save();
  g.beginPath(); g.arc(bx, by, br, 0, TAU); g.clip();
  const sh = g.createLinearGradient(bx + br, by, bx - br * 0.2, by);
  sh.addColorStop(0, "rgba(20,10,4,0.6)");
  sh.addColorStop(1, "rgba(20,10,4,0)");
  g.fillStyle = sh;
  g.fillRect(bx - br, by - br, br * 2, br * 2);
  g.restore();
  // --- index finger: down from its knuckle, curled under the front of the bell ---
  seg2(-62, -24, -82, -6, 15);
  seg2(-82, -6, -80, 16, 13.5);
  seg2(-80, 16, -66, 22, 12);
  knuckle(-62, -24, 8, 0.55);
  knuckle(-82, -6, 7, 0.5);
  crease(-82, -6, 5.5, -0.4, 1.1);
  crease(-82, -6, 4, -0.3, 0.9);
  crease(-80, 16, 5, 0.6, 2.2);
  crease(-80, 16, 3.6, 0.8, 2.0);
  crease(-62, -24, 6, 0.4, 1.6);
  // --- the thumb: from the base of the hand, over the top of the bell, pressing it in ---
  seg2(-22, 8, -46, 2, 19);
  seg2(-46, 2, -64, -8, 15);
  // thumbnail: a pale rounded plate with a lit edge and the cuticle line
  g.save();
  g.translate(-64, -10);
  g.rotate(-0.45);
  const ng = g.createLinearGradient(-6, -4, 6, 4);
  ng.addColorStop(0, mix("#f6e0d6", "#ffffff", fl * 0.5));
  ng.addColorStop(1, "#c89c90");
  g.fillStyle = ng;
  g.beginPath();
  g.ellipse(0, 0, 6.5, 3.6, 0, 0, TAU);
  g.fill();
  g.strokeStyle = rgba(SKD, 0.6);
  g.lineWidth = 0.6;
  g.beginPath(); g.arc(4.5, 0, 3.4, Math.PI * 0.6, Math.PI * 1.4); g.stroke();
  g.strokeStyle = rgba("#ffffff", 0.55);
  g.beginPath(); g.moveTo(-5.5, -1.5); g.quadraticCurveTo(-2, -3.6, 2, -3.2); g.stroke();
  g.restore();
  knuckle(-46, 2, 8, 0.45);
  crease(-46, 2, 6, 3.6, 4.6);
  // --- sleeve (cuff over the wrist) ---
  const sl = new Path2D();
  sl.moveTo(4, -36);
  sl.bezierCurveTo(2, -10, 2, 14, 6, 38);
  sl.lineTo(160, 46);
  sl.lineTo(160, -46);
  sl.closePath();
  const sg = g.createLinearGradient(0, -40, 0, 40);
  sg.addColorStop(0, mix("#d8a820", "#e8eefc", fl * 0.4));
  sg.addColorStop(0.5, "#a07a14");
  sg.addColorStop(1, "#3a2a08");
  g.fillStyle = sg;
  g.fill(sl);
  g.strokeStyle = "rgba(0,0,0,0.3)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(12, -32); g.bezierCurveTo(10, -8, 10, 12, 14, 34);
  g.moveTo(40, -40); g.quadraticCurveTo(52, -8, 44, 40);
  g.stroke();
  g.restore();
}

function shot3(g, t, W, H) {
  const fl = flashAt(t);
  // a slow drift, a hard tremor after the thunder
  const kick = t >= 19 ? Math.exp(-(t - 19) * 1.6) : 0;
  const amp = 1.4 + kick * 9;
  const jx = noise(t * 21, 5) * amp, jy = noise(t * 17, 6) * amp;
  const p = eio(seg(t, 19, 28));
  K.focus(g, W, H, 10, (c) => {
    // the attic far behind, way out of focus: the boards, the round window (its rain, frame and
    // mullions melt into soft shapes), the rafters as dark bars
    c.fillStyle = mix("#0a0e16", "#4a5670", fl * 0.7);
    c.fillRect(0, 0, W, H);
    K.texRect(c, "wood", 0, 0, W, H, { scale: 600, scaleY: 260, rot: Math.PI / 2, alpha: 0.6, tex: WOOD, tint: mix("#2a3446", "#c8d4f0", fl * 0.7), tintAlpha: 0.9 });
    K.lightPool(c, 210, 330, 420, fl > 0.05 ? BOLT : "#4a5a80", { intensity: 0.25 + fl * 0.6, flat: 0.5 });
    // the round storm window far behind, wide open in the blur: a pale disc of night sky, its cross
    // bars and its thick frame still readable as soft dark bands
    const wx0 = 205, wy0 = 185, wr = 112;
    c.fillStyle = mix("#141820", "#4a5266", fl * 0.5);
    c.beginPath(); c.arc(wx0, wy0, wr * 1.18, 0, TAU); c.fill();
    const sky = c.createLinearGradient(0, wy0 - wr, 0, wy0 + wr);
    sky.addColorStop(0, mix("#3a4a6a", "#dfe8ff", fl));
    sky.addColorStop(1, mix("#26324a", "#aab8dc", fl));
    c.fillStyle = sky;
    c.beginPath(); c.arc(wx0, wy0, wr, 0, TAU); c.fill();
    c.fillStyle = mix("#10141c", "#4a5266", fl * 0.4);
    c.fillRect(wx0 - wr, wy0 - 9, wr * 2, 18);
    c.fillRect(wx0 - 9, wy0 - wr, 18, wr * 2);
    // a rafter crossing in front of it, and the next one along, as dark soft diagonals
    c.fillStyle = "rgba(4,6,10,0.85)";
    for (const [x0, w0] of [[470, 46], [840, 60]]) { c.save(); c.translate(x0, 0); c.rotate(0.32); c.fillRect(0, -60, w0, 700); c.restore(); }
    glow(c, wx0, wy0, 320, fl > 0.05 ? BOLT : "#6a7a98", 0.16 + fl * 0.6);
  }, "f07bellbg");
  // rain on that far window, way out of focus: each drop that catches the sky is a bokeh disc (a flat
  // disc of light with a slightly brighter rim, the shape of the aperture), sliding slowly down
  {
    const wx0 = 205, wy0 = 185, wr = 112;
    for (let i = 0; i < 16; i++) {
      const sp = 0.03 + hash(i, 61) * 0.05;
      const ph = ((t * sp + hash(i, 62)) % 1 + 1) % 1;
      const a = hash(i, 63) * TAU, rr = Math.sqrt(hash(i, 64)) * wr * 0.95;
      const x = wx0 + Math.cos(a) * rr, y = wy0 + Math.sin(a) * rr * 0.9 + ph * 26 - 13;
      const r = 9 + hash(i, 65) * 14;
      const al = (0.07 + 0.08 * hash(i, 66)) * (1 - Math.abs(ph - 0.5) * 1.6) * (1 + fl * 2.5);
      if (al <= 0.004) continue;
      g.fillStyle = rgba(mix("#9fb4e0", "#ffffff", fl), al);
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.strokeStyle = rgba("#dfe8ff", al * 1.3);
      g.lineWidth = 1.2;
      g.beginPath(); g.arc(x, y, r - 0.6, 0, TAU); g.stroke();
    }
  }
  // your fist, coming in from the right, clutching the bell; it trembles (a 14 Hz shiver that
  // jumps when the thunder hits at 19 s)
  const shiver = Math.sin(t * 14 * TAU) * 1.5 * (1 + kick * 2.5) + Math.sin(t * 9.3 * TAU) * 0.5;
  const wx = 700 + jx * 0.4 + shiver - p * 10, wy = 290 + jy * 0.4;
  // cool it down: the only light here is the storm window (applied under the fist's own shading)
  g.save();
  g.globalCompositeOperation = "multiply";
  const cool = g.createLinearGradient(300, 0, 960, 0);
  cool.addColorStop(0, "#d8def8");
  cool.addColorStop(1, "#4a5070");
  g.fillStyle = cool;
  g.fillRect(0, 0, W, H);
  g.restore();
  // the fist is painted in its own layer, then lit there: cold window light from the left, the side
  // toward us falling into deep shadow, skin and PVC broken up by a little surface variation.
  const FL = K.layer(W, H, "f07fist");
  const fg = FL.g;
  fistWithBell(fg, wx, wy, 230, t, { fl, glint: 0.35 + fl * 1.6 });
  // the light map (key gradient x underside occlusion x surface variation), masked to the fist
  const ML = K.layer(W, H, "f07fistlight");
  const mg = ML.g;
  const kl = mg.createLinearGradient(wx - 260, wy - 60, wx + 220, wy + 80);
  kl.addColorStop(0, mix("#dcdcf0", "#ffffff", fl));
  kl.addColorStop(0.45, mix("#8a88a8", "#c8d0e8", fl * 0.8));
  kl.addColorStop(1, mix("#14182a", "#6a7090", fl * 0.6));
  mg.fillStyle = kl;
  mg.fillRect(0, 0, W, H);
  mg.globalCompositeOperation = "multiply";
  const ul = mg.createLinearGradient(0, wy - 80, 0, wy + 90);
  ul.addColorStop(0, "#ffffff");
  ul.addColorStop(1, "#3c405a");
  mg.fillStyle = ul;
  mg.fillRect(0, 0, W, H);
  mg.globalCompositeOperation = "source-over";
  K.texRect(mg, "macro", 0, 0, W, H, { scale: 260, mode: "soft-light", alpha: 0.5, tex: MACRO });
  mg.globalCompositeOperation = "destination-in";
  mg.drawImage(FL.canvas, 0, 0, W, H);
  mg.globalCompositeOperation = "source-over";
  fg.globalCompositeOperation = "multiply";
  fg.drawImage(ML.canvas, 0, 0, W, H);
  fg.globalCompositeOperation = "source-over";
  // skin is translucent: where the window light grazes the fingers from behind-left, the edges glow a
  // warm red (subsurface scattering). The rim is the fist's alpha minus itself shifted toward the light.
  {
    const RL = K.layer(W, H, "f07fistrim"), rg = RL.g;
    rg.drawImage(FL.canvas, 0, 0, W, H);
    rg.globalCompositeOperation = "destination-out";
    rg.drawImage(FL.canvas, 3.5, 2.5, W, H);
    rg.globalCompositeOperation = "source-in";
    rg.fillStyle = mix("#ff5a3a", "#ffd0c0", fl * 0.6);
    rg.fillRect(0, 0, W, H);
    // only the skin, not the sleeve: fade it out to the right of the wrist
    rg.globalCompositeOperation = "destination-in";
    const sm = rg.createLinearGradient(wx - 40, 0, wx + 10, 0);
    sm.addColorStop(0, "rgba(0,0,0,1)");
    sm.addColorStop(1, "rgba(0,0,0,0)");
    rg.fillStyle = sm;
    rg.fillRect(0, 0, W, H);
    fg.globalCompositeOperation = "lighter";
    fg.globalAlpha = 0.32 + fl * 0.3;
    fg.drawImage(RL.canvas, 0, 0, W, H);
    fg.globalAlpha = 1;
    fg.globalCompositeOperation = "source-over";
  }
  // the shiver is faster than the shutter: two exposures smear it a few px
  const prevX = Math.sin((t - 1 / 96) * 14 * TAU) * 1.5 * (1 + kick * 2.5) - shiver;
  g.save();
  g.globalAlpha = 0.45;
  g.drawImage(FL.canvas, prevX, 0, W, H);
  g.globalAlpha = 1;
  g.drawImage(FL.canvas, 0, 0, W, H);
  g.restore();
  // the window light catches the left of the brass
  const bx = wx - 74 * 2.3, by = wy + 7 * 2.3;
  glow(g, bx - 14, by - 8, 34, "#bcd0ff", 0.12 + fl * 0.4);
  // the specular glint: a tiny white-hot point on the mirrored pane (the lens blooms it), not a star
  const gx = bx - 17, gy = by - 18, gl = 0.6 + 0.4 * fl + 0.15 * Math.sin(t * 2.3);
  glow(g, gx, gy, 3.2, "#ffffff", 0.95 * gl);
  glow(g, gx, gy, 9, "#f4f8ff", 0.5 * gl);
  glow(g, gx, gy, 22, "#dfe8ff", 0.16 * gl);

}

// ---- SHOT 4: flashback, the bedroom on a stormy night -------------------------------------------------------
// The patchwork quilt (FILMS.md model sheet colours), baked once per pixel: puffed, hand-stitched cotton
// patches, each with its own print (calico sprigs, polka dots, ticking stripes, gingham, plain weave),
// warped along a field of soft folds so the grid never lies flat; the fold valleys and the seams fall
// into shadow, the crests catch the nightlight (from the right), and the whole thing is sun-faded.
const QPAL = ["#4a6fa5", "#e0b25a", "#c2575b", "#d9cdb4", "#5f7f9a", "#c98a4a", "#8a5a6a"].map((c) => K.parseColor(c));
const QW = 820, QH = 260;
function quiltTex() {
  const w = QW, h = QH;
  return K.texBake("f07quilt3", w, h, (u, v, out, x, y) => {
    const n1 = K.texFbm(u * 2.5, v * 1.3, 71, 3), n2 = K.texFbm(u * 5, v * 2.2, 72, 2);
    const p1 = x * 0.028 + y * 0.012 + 2.4 * n1, p2 = x * 0.061 - y * 0.035 + 2.0 * n2, p3 = x * 0.013 - y * 0.05 + 1.3 * n2;
    const c1 = Math.cos(p1), c2 = Math.cos(p2), c3 = Math.cos(p3);
    const Hf = 7 * Math.sin(p1) + 3.2 * Math.sin(p2) + 4 * Math.sin(p3);
    let gx = 7 * c1 * 0.028 + 3.2 * c2 * 0.061 + 4 * c3 * 0.013;
    let gy = 7 * c1 * 0.012 - 3.2 * c2 * 0.035 - 4 * c3 * 0.05;
    // the fabric is pulled into the folds: sample the patch grid displaced along the fold normals
    const sx = x - gx * 16 + n2 * 4, sy = y - gy * 16 + n1 * 3;
    const cs = 52, fx = sx / cs, fy = sy / cs, cx = Math.floor(fx), cy = Math.floor(fy), fu = fx - cx, fv = fy - cy;
    const hid = hash(cx * 7 + cy * 131, 5), kind = Math.floor(hash(cx * 3 + cy * 17, 9) * 5);
    const base = QPAL[Math.floor(hid * QPAL.length) % QPAL.length];
    let r = base[0], g2 = base[1], b = base[2];
    // the print on each patch
    let pr = 0;
    if (kind === 1) { const dx = (fu * 7) % 1 - 0.5, dy = (fv * 7 + (Math.floor(fu * 7) % 2) * 0.5) % 1 - 0.5; pr = dx * dx + dy * dy < 0.045 ? 1 : 0; }
    else if (kind === 2) pr = (fu * 9) % 1 < 0.3 ? -1 : 0;
    else if (kind === 3) pr = (((fu * 8) % 1 < 0.5) !== ((fv * 8) % 1 < 0.5)) ? 0.6 : -0.3;
    else if (kind === 4) { const sp = K.texNoise(sx * 0.35, sy * 0.35, 77); pr = sp > 0.42 ? 1 : sp < -0.5 ? -0.6 : 0; }
    if (pr > 0) { r += (236 - r) * 0.55 * pr; g2 += (226 - g2) * 0.55 * pr; b += (206 - b) * 0.55 * pr; }
    else if (pr < 0) { r *= 1 + 0.28 * pr; g2 *= 1 + 0.28 * pr; b *= 1 + 0.28 * pr; }
    // puffed patches: each square bulges between its seams
    const su = Math.sin(Math.PI * fu), sv = Math.sin(Math.PI * fv);
    gx += Math.PI * Math.cos(Math.PI * fu) * sv * 3.2 / cs;
    gy += Math.PI * Math.cos(Math.PI * fv) * su * 3.2 / cs;
    const de = Math.min(fu, 1 - fu, fv, 1 - fv) * cs;
    // weave + wear
    const wv = ((x + y) & 1 ? 1 : -1) * 3 + K.texNoise(u * 140, v * 44, 74) * 8;
    r += wv; g2 += wv; b += wv;
    // seam groove, then a running stitch a few px in from it (lighter thread, dashed)
    let seam = 1;
    if (de < 1.4) seam = 0.5 + de * 0.2;
    else if (de > 2.6 && de < 3.6) {
      const along = (Math.min(fu, 1 - fu) * cs < Math.min(fv, 1 - fv) * cs ? fv : fu) * cs;
      if (along % 5 < 2.6) { r += (238 - r) * 0.45; g2 += (226 - g2) * 0.45; b += (200 - b) * 0.45; }
    }
    // light: the nightlight from the right and a little in front; fold valleys + seams occluded
    const nl = 1 / Math.hypot(gx, gy, 1);
    const diff = Math.max(0, (-gx * 0.74 - gy * -0.2 + 0.64) * nl);
    const ao = (1 - 0.5 * smooth(clamp(-Hf / 10))) * seam;
    const L = (0.28 + 0.9 * diff) * ao;
    // sun-faded, slightly dusty cotton
    const gr = (r + g2 + b) / 3;
    r = (r + (gr - r) * 0.28) * L; g2 = (g2 + (gr - g2) * 0.28) * L; b = (b + (gr - b) * 0.28) * L;
    out[0] = clamp(r, 0, 255); out[1] = clamp(g2, 0, 255); out[2] = clamp(b, 0, 255); out[3] = 255;
  });
}
function quiltPattern() {
  return K.sprite("f07quilt3s", QW, QH, (s) => s.drawImage(quiltTex(), 0, 0, QW, QH));
}
const BED = { x0: 150, x1: 870, far: 300, near: 372, side: 456 };
const NL = { x: 958, y: 401 }; // the nightlight bulb (a shell lamp on the toy chest)
// the hump of the quilt over the curled-up child: rounded shoulders that roll out flat at both ends
const lumpH = (k) => 122 * Math.pow(Math.sin(Math.PI * k), 0.75) * (1 - 0.18 * k) * smooth(clamp(k * 5)) * smooth(clamp((1 - k) * 4));
// ---- the bed in three-quarter view ----
// Top plane: far edge y0 (head end x xl0 .. foot end xr0), near edge y1 (xl1 .. xr1): the head end recedes,
// so the far edge is shorter and the quilt's patch seams converge toward it.
const BT = { y0: 298, y1: 376, xl0: 238, xl1: 150, xr0: 856, xr1: 880 };
const BS = { x: 130, y: 280, w: 770, h: 200 };
const bedNearY = (x) => BT.y1 + 3 * Math.sin(Math.PI * clamp((x - BT.xl1) / (BT.xr1 - BT.xl1)));
const bedHemY = (x) => 452 + 6 * clamp((x - BT.xl1) / (BT.xr1 - BT.xl1)) + Math.sin(x * 0.06) * 3;
const drapeOff = (x) => Math.sin(x * 0.055) * 5 + Math.sin(x * 0.13 + 1.1) * 1.6;
function bedSprite() {
  return K.sprite("f07-bed3", BS.w, BS.h, (s) => {
    OWN_BUILDS++;
    s.translate(-BS.x, -BS.y);
    const q = quiltTex();
    const N = BT.y1 - BT.y0;
    // top plane: one row of the quilt per screen row; rows compress toward the far edge (1/z)
    const vAt = (k) => 132 * (1 - (1 - k) / (1 + 0.9 * k)) ;
    for (let i = 0; i <= N + 2; i++) {
      const k = Math.min(1, i / N), k2 = Math.min(1, (i + 1) / N);
      const y = BT.y0 + i;
      const xl = lerp(BT.xl0, BT.xl1, k), xr = lerp(BT.xr0, BT.xr1, k);
      // the mattress top is not flat: it crowns a little in the middle and sags toward the edges
      const crown = Math.sin(Math.PI * k) * 1.5;
      const v0 = vAt(k), v1 = Math.max(v0 + 0.5, vAt(k2));
      s.drawImage(q, 0, v0, QW, v1 - v0, xl, y - crown, xr - xl, 1.7);
    }
    // top shading: the far half falls into the shadow of the wall; a soft roll-off toward both ends
    const tp = new Path2D();
    tp.moveTo(BT.xl0, BT.y0); tp.lineTo(BT.xr0, BT.y0); tp.lineTo(BT.xr1, BT.y1 + 3); tp.lineTo(BT.xl1, BT.y1 + 3); tp.closePath();
    s.save();
    s.clip(tp);
    const fg = s.createLinearGradient(0, BT.y0, 0, BT.y1);
    fg.addColorStop(0, "rgba(16,8,20,0.55)");
    fg.addColorStop(0.45, "rgba(16,8,20,0.12)");
    fg.addColorStop(1, "rgba(255,226,180,0.06)");
    s.fillStyle = fg;
    s.fillRect(BS.x, BS.y, BS.w, BS.h);
    s.restore();
    // the hanging side: columns of the quilt continuing from the top (rows 128..260), each displaced by
    // the drape, troughs darkened (AO) and crests lit
    for (let x = BT.xl1 - 2; x < BT.xr1 + 2; x += 2) {
      const u = clamp((x - BT.xl1) / (BT.xr1 - BT.xl1)) * (QW - 3);
      const ny = bedNearY(x), hy = bedHemY(x);
      const off = drapeOff(x);
      s.drawImage(q, u, 126, 3, QH - 128, x, ny - 3 + off * 0.25, 2.8, hy - ny + 3 + off * 0.6);
      // the drape's own shading: cos of the displacement phase = facing toward / away from the lamp
      const slope = Math.cos(x * 0.055) * 0.275 + Math.cos(x * 0.13 + 1.1) * 0.21;
      const a = clamp(0.22 + slope * 0.7, 0, 0.6);
      s.fillStyle = slope > 0 ? rgba("#0a040e", a) : rgba("#ffdcb0", clamp(-slope * 0.12, 0, 0.08));
      s.fillRect(x, ny + 2, 2.2, hy - ny + off * 0.6);
    }
    // the side face is turned away from the lamp: darker overall, deepest toward the hem (bed skirt AO)
    const sp = new Path2D();
    sp.moveTo(BT.xl1 - 3, bedNearY(BT.xl1));
    for (let x = BT.xl1; x <= BT.xr1 + 3; x += 6) sp.lineTo(x, bedNearY(x) + 1);
    for (let x = BT.xr1 + 3; x >= BT.xl1 - 3; x -= 3) sp.lineTo(x, bedHemY(x) + drapeOff(x) * 0.85 + 1);
    sp.closePath();
    s.save();
    s.clip(sp);
    const sg = s.createLinearGradient(0, BT.y1, 0, 462);
    sg.addColorStop(0, "rgba(14,8,18,0.18)");
    sg.addColorStop(0.6, "rgba(8,4,10,0.45)");
    sg.addColorStop(1, "rgba(4,2,6,0.75)");
    s.fillStyle = sg;
    s.fillRect(BS.x, BT.y1 - 6, BS.w, 120);
    const sr = s.createLinearGradient(BT.xl1, 0, BT.xr1, 0);
    sr.addColorStop(0, "rgba(0,0,0,0.35)");
    sr.addColorStop(1, "rgba(255,210,150,0.12)");
    s.fillStyle = sr;
    s.fillRect(BS.x, BT.y1 - 6, BS.w, 120);
    s.restore();
    // the rounded edge where the quilt rolls over: a lit crest (toward the lamp, right) and a soft
    // occlusion just under it
    s.lineCap = "round";
    for (const [dy, w, c, a] of [[3.5, 5, "#0a0410", 0.28], [1.5, 2.5, "#0a0410", 0.2], [-0.8, 2.2, "#ffdcae", 0.1], [-0.6, 1, "#ffe6c4", 0.16]]) {
      const sl = s.createLinearGradient(BT.xl1, 0, BT.xr1, 0);
      sl.addColorStop(0, rgba(c, a * (c === "#0a0410" ? 1 : 0.25)));
      sl.addColorStop(1, rgba(c, a));
      s.strokeStyle = sl; s.lineWidth = w;
      s.beginPath();
      for (let x = BT.xl1 + 2; x <= BT.xr1 - 1; x += 6) { const y = bedNearY(x) + dy; if (x === BT.xl1 + 2) s.moveTo(x, y); else s.lineTo(x, y); }
      s.stroke();
    }
    // under the hem: the dark gap under the bed
    for (let x = BT.xl1 - 3; x < BT.xr1 + 3; x += 3) {
      const hy = bedHemY(x) + drapeOff(x) * 0.85;
      const ug = s.createLinearGradient(0, hy - 2, 0, 474);
      ug.addColorStop(0, "rgba(3,2,4,0.9)");
      ug.addColorStop(1, "rgba(3,2,4,0.98)");
      s.fillStyle = ug;
      s.fillRect(x, hy - 0.5, 3.4, 474 - hy);
    }
  });
}
// the bedroom floor: the attic's sawn-board raster, re-projected so the boards run toward the camera
function bedFloorSprite() {
  return K.sprite("f07-bedfloor", 1160, 104, (s) => {
    OWN_BUILDS++;
    s.translate(100, -456);
    const mips = plankMips();
    const HZ = 286, VX = 560;
    for (let y = 456; y < 562; y++) {
      const sc = (y - HZ) / 180;
      const xl = VX - 640 * sc, xr = VX + 640 * sc;
      const z0 = 180 / (y - HZ), z1 = 180 / (y + 1 - HZ);
      const lv = 1, m = mips[lv], k = m.height / 1024;
      const v0 = (0.5 * z1) * 1024 * k, v1 = (0.5 * z0) * 1024 * k;
      s.drawImage(m, 0, v0, m.width, Math.max(0.5, v1 - v0), xl, y, xr - xl, 1.7);
    }
    // a warm varnished timber (the raster is a neutral grey-brown): multiply a warm tone in, then the
    // boards nearer the camera drop away from the lamp
    s.globalCompositeOperation = "multiply";
    s.fillStyle = "#d29a68";
    s.fillRect(-100, 456, 1160, 106);
    const dg = s.createLinearGradient(0, 456, 0, 562);
    dg.addColorStop(0, "#c8b8a8");
    dg.addColorStop(1, "#5a4a44");
    s.fillStyle = dg;
    s.fillRect(-100, 456, 1160, 106);
    s.globalCompositeOperation = "source-over";
    // the varnish: a faint sheen on the far boards (grazing angle), where they catch the room
    const sh = s.createLinearGradient(0, 456, 0, 500);
    sh.addColorStop(0, "rgba(255,220,180,0.1)");
    sh.addColorStop(1, "rgba(255,220,180,0)");
    s.fillStyle = sh;
    s.fillRect(-100, 456, 1160, 50);
  });
}
function bedroom(g, t, W, H, fl, tremble, part = "all") {
  if (part !== "front") {
  // printed paper (dusty blue, a little aged) lit only by the nightlight: the falloff multiply in
  // shot4 does the darkening, so the paper itself stays a mid value with real print and grain
  g.fillStyle = "#2a2028";
  g.fillRect(-300, -300, W + 600, H + 600);
  K.texRect(g, "wallpaper", -300, -300, W + 600, 770, { scale: 150, tex: WALLPAPER, tint: "#6a5a66", tintAlpha: 0.75 });
  // a dado rail and the skirting, so the wall has a scale reference
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.fillRect(-300, 456, W + 600, 12);
  g.fillStyle = "rgba(255,226,190,0.08)";
  g.fillRect(-300, 455, W + 600, 2);
  // window over the headboard: rain, a swaying branch, muted lightning
  const wx = 70, wy = 58, ww = 270, wh = 170;
  g.save();
  g.beginPath();
  g.rect(wx, wy, ww, wh);
  g.clip();
  const sk = g.createLinearGradient(0, wy, 0, wy + wh);
  sk.addColorStop(0, mix("#121a2a", "#a8b8e0", fl));
  sk.addColorStop(1, mix("#1c2840", "#7a88b0", fl));
  g.fillStyle = sk;
  g.fillRect(wx, wy, ww, wh);
  if (fl > 0.1) K.lightningBolt(g, wx + ww * 0.65, wy - 10, wx + ww * 0.45, wy + wh, 7, { alpha: fl, width: 1.5 });
  g.fillStyle = "#0a0e16";
  g.beginPath();
  g.moveTo(wx, wy + wh); g.lineTo(wx, wy + wh * 0.72); g.lineTo(wx + 60, wy + wh * 0.64); g.lineTo(wx + 120, wy + wh * 0.7);
  g.lineTo(wx + 180, wy + wh * 0.58); g.lineTo(wx + ww, wy + wh * 0.68); g.lineTo(wx + ww, wy + wh);
  g.fill();
  const bsw = Math.sin(t * 1.3) * 0.05 + noise(t * 0.8, 3) * 0.06;
  g.save();
  g.translate(wx + ww + 10, wy + 20);
  g.rotate(bsw);
  g.strokeStyle = "#06080c";
  g.lineCap = "round";
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(0, 0); g.quadraticCurveTo(-90, 10, -170, 40);
  g.moveTo(-80, 8); g.quadraticCurveTo(-110, -14, -140, -20);
  g.moveTo(-120, 24); g.quadraticCurveTo(-140, 50, -150, 74);
  g.stroke();
  g.restore();
  K.rain(g, wx + ww, wy + wh, t, { density: 0.35, angle: 0.2, color: "rgba(200,215,240,0.4)", seed: 41 });
  K.glassDrops(g, wx, wy, ww, wh, t, { seed: 42, density: 1.3, light: "#ffe6c0" });
  g.restore();
  g.strokeStyle = "#cfc4b0";
  g.lineWidth = 7;
  g.strokeRect(wx, wy, ww, wh);
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh);
  g.moveTo(wx, wy + wh / 2); g.lineTo(wx + ww, wy + wh / 2);
  g.stroke();
  // curtains
  for (const [cx, dir] of [[wx - 6, -1], [wx + ww + 6, 1]]) {
    const cg = g.createLinearGradient(cx - 40, 0, cx + 40, 0);
    cg.addColorStop(0, "#3a4670");
    cg.addColorStop(0.5, "#6a7aa8");
    cg.addColorStop(1, "#2e3a62");
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(cx - 34 * dir, wy - 20);
    g.lineTo(cx + 26 * dir, wy - 20);
    g.quadraticCurveTo(cx + 10 * dir, wy + wh * 0.6, cx + 30 * dir, wy + wh + 50);
    g.lineTo(cx - 30 * dir, wy + wh + 50);
    g.closePath();
    g.fill();
    {
      const cp = new Path2D();
      cp.moveTo(cx - 34 * dir, wy - 20); cp.lineTo(cx + 26 * dir, wy - 20);
      cp.quadraticCurveTo(cx + 10 * dir, wy + wh * 0.6, cx + 30 * dir, wy + wh + 50); cp.lineTo(cx - 30 * dir, wy + wh + 50); cp.closePath();
      K.texFill(g, "fabric", cp, { scale: 46, mode: "overlay", alpha: 0.7, tex: FABRIC });
      const fold = g.createLinearGradient(cx - 34, 0, cx + 34, 0);
      for (let k = 0; k <= 8; k++) fold.addColorStop(k / 8, k % 2 ? "rgba(6,8,20,0.38)" : "rgba(170,180,220,0.08)");
      g.fillStyle = fold; g.fill(cp);
    }
    g.strokeStyle = "rgba(10,14,30,0.35)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx - 8 * dir, wy - 16); g.quadraticCurveTo(cx - 2 * dir, wy + wh * 0.6, cx + 10 * dir, wy + wh + 46);
    g.stroke();
  }
  // the nightlight (a little shell lamp on the toy chest, the key for the whole scene) washes the wall
  // behind it: a broad warm falloff, no halo of its own (the lens blooms the bulb)
  glow(g, NL.x - 20, NL.y - 30, 560, NIGHT, 0.16);
  glow(g, NL.x, NL.y - 10, 190, NIGHT, 0.2);
  }
  if (part === "back") return;
  // the floor: varnished boards running toward the camera (perspective-true, cached), then the lamp's pool
  g.fillStyle = "#120c08";
  g.fillRect(-300, 456, W + 600, H);
  g.drawImage(bedFloorSprite(), -100, 456, 1160, 104);
  K.aoEdge(g, -300, 465, W + 300, 465, { width: 18, alpha: 0.6, side: -1 });
  K.lightPool(g, NL.x - 40, 500, 300, NIGHT, { intensity: 0.32, flat: 0.22 });
  // the varnish mirrors the lamp: a soft vertical smear on the boards below it
  K.reflectStreak(g, NL.x - 6, 476, 70, "#ffd9a0", 0.12, { width: 22 });
  // the bed head: a panel receding with the mattress, the near post in front of it
  const wood = (x, y, w, h) => {
    const gr = g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, "#22150c");
    gr.addColorStop(0.55, "#5a3820");
    gr.addColorStop(1, "#1a0f08");
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
    K.texRect(g, "wood", x, y, w, h, { scale: 240, scaleY: 60, rot: Math.PI / 2, mode: "soft-light", alpha: 0.8, tex: WOOD });
  };
  {
    const hp = new Path2D();
    hp.moveTo(150, 226); hp.lineTo(246, 256); hp.lineTo(244, 302); hp.lineTo(152, 384); hp.closePath();
    g.fillStyle = "#24160e";
    g.fill(hp);
    K.texFill(g, "wood", hp, { scale: 200, scaleY: 50, rot: 1.3, mode: "soft-light", alpha: 0.8, tex: WOOD });
    const hg = g.createLinearGradient(150, 0, 246, 0);
    hg.addColorStop(0, "rgba(0,0,0,0.45)");
    hg.addColorStop(1, "rgba(255,200,140,0.08)");
    g.fillStyle = hg;
    g.fill(hp);
  }
  wood(122, 214, 34, 290);
  g.fillStyle = "#4a2e1a";
  g.beginPath();
  g.ellipse(139, 214, 19, 7, 0, 0, TAU);
  g.fill();
  // a toy chest at the foot of the bed, the lamp on it: Biscuit's launch pad
  toyChest(g, CHEST.x, 470, CHEST.w, 50);
  const pat = quiltPattern();
  const px = K.pixelScale();
  // the mattress under the quilt, as ONE cached sprite: the top plane in perspective (rows squeezed into
  // the trapezoid so the patch seams converge on the head end) flowing over the rounded edge into the
  // hanging side, whose columns are displaced into drapes (no seam: one canvas, overlapping rows)
  g.drawImage(bedSprite(), BS.x, BS.y, BS.w, BS.h);
  // the pillow (at the far, head end of the mattress): a soft cotton bag of feathers, squashed in the middle where your head was, before you
  // burrowed right under the quilt. Puffy corners, a seam, light rolling over it from the right.
  {
    g.save();
    g.translate(36, 6);
    g.scale(0.94, 0.94);
    const pp = new Path2D();
    pp.moveTo(172, 312);
    pp.bezierCurveTo(166, 294, 176, 280, 196, 282);
    pp.bezierCurveTo(232, 290, 262, 286, 290, 280);
    pp.bezierCurveTo(312, 278, 320, 294, 312, 312);
    pp.bezierCurveTo(318, 326, 308, 336, 288, 334);
    pp.bezierCurveTo(250, 330, 222, 334, 192, 336);
    pp.bezierCurveTo(172, 336, 166, 324, 172, 312);
    pp.closePath();
    K.shadowBlob(g, 244, 334, 66, 5, { alpha: 0.6, color: "#140a10" });
    const pg = g.createLinearGradient(170, 0, 318, 0);
    pg.addColorStop(0, "#8a8090");
    pg.addColorStop(0.6, "#d8ccc0");
    pg.addColorStop(1, "#efe2d2");
    g.fillStyle = pg;
    g.fill(pp);
    K.texFill(g, "fabric", pp, { scale: 26, mode: "overlay", alpha: 0.5, tex: FABRIC });
    g.save();
    g.clip(pp);
    // top lit, underside and the head-dent in soft shadow
    const vg = g.createLinearGradient(0, 280, 0, 336);
    vg.addColorStop(0, "rgba(255,240,220,0.12)");
    vg.addColorStop(0.55, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(30,16,26,0.45)");
    g.fillStyle = vg;
    g.fillRect(160, 270, 170, 70);
    const dent = g.createRadialGradient(246, 304, 2, 246, 306, 46);
    dent.addColorStop(0, "rgba(40,22,34,0.38)");
    dent.addColorStop(1, "rgba(40,22,34,0)");
    g.fillStyle = dent;
    g.fillRect(190, 270, 120, 70);
    g.restore();
    g.restore();
  }
  // the curled-up lump under the quilt (trembles until Biscuit settles): a soft mound whose patchwork
  // is laid over it in warped strips, with folds radiating down from the top where the quilt is pulled
  // over a small back and knees. Everything static is cached; only the tremble moves it.
  const jx = noise(t * 26, 2) * tremble * 2.6, jy = noise(t * 22, 3) * tremble * 1.6;
  K.shadowBlob(g, 452, LB + 2, 190, 6, { alpha: 0.55, color: "#140a10", soft: 0.8 });
  g.drawImage(lumpSprite(pat, px), LX0 - 20 + jx, LB - 150 + jy, LX1 - LX0 + 40, 160);
  // the quilt round its foot is dragged in toward it: a ring of shallow creases
  g.drawImage(lumpCreases(), LX0 - 60, LB - 26, LX1 - LX0 + 120, 40);
  wood(866, 292, 30, 204);
  g.fillStyle = "#4a2e1a";
  g.beginPath();
  g.ellipse(881, 292, 17, 6, 0, 0, TAU);
  g.fill();
  // the toy chest stands in front of the bedpost
  toyChest(g, CHEST.x, 470, CHEST.w, 50, true);
  nightLamp(g);
}
// the shell nightlight standing on the chest lid: a frosted dome over a hot bulb, a wooden foot
function nightLamp(g) {
  const x = NL.x, y = CHEST_Y;
  K.shadowBlob(g, x, y + 1, 16, 2.4, { alpha: 0.7 });
  g.fillStyle = "#3a2618";
  g.beginPath(); g.ellipse(x, y - 1.5, 13, 3.4, 0, 0, TAU); g.fill();
  g.fillRect(x - 13, y - 5, 26, 3.5);
  const dg = g.createRadialGradient(x - 1, y - 14, 1, x, y - 12, 15);
  dg.addColorStop(0, "#ffffff");
  dg.addColorStop(0.35, "#fff2d6");
  dg.addColorStop(0.8, "#ffd08a");
  dg.addColorStop(1, "#d8904a");
  g.fillStyle = dg;
  g.beginPath(); g.moveTo(x - 12, y - 5); g.bezierCurveTo(x - 13, y - 22, x + 13, y - 22, x + 12, y - 5); g.closePath(); g.fill();
  // the frosted shell's ribs
  g.strokeStyle = "rgba(200,120,60,0.35)"; g.lineWidth = 0.7;
  for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x + k * 4.6, y - 5); g.quadraticCurveTo(x + k * 3, y - 16, x + k * 0.6, y - 19.5); g.stroke(); }
  glow(g, x, y - 12, 22, "#ffe6b8", 0.55);
}
// where Biscuit lies: the quilt is pressed down under him (an occluded hollow) and pulled in toward him
// in a fan of shallow creases, each a soft trough with a lamp-lit crest on its right
function dentSprite() {
  return K.sprite("f07-dent", 140, 32, (s) => {
    s.translate(70, 16);
    s.save();
    s.scale(1, 0.18);
    const ao = s.createRadialGradient(4, 0, 4, 4, 0, 66);
    ao.addColorStop(0, "rgba(14,4,10,0.55)");
    ao.addColorStop(0.6, "rgba(14,4,10,0.22)");
    ao.addColorStop(1, "rgba(14,4,10,0)");
    s.fillStyle = ao;
    s.fillRect(-70, -90, 140, 180);
    s.restore();
    s.lineCap = "round";
    const R = K.rng("f07dent");
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 2.6 + (R() - 0.5) * 0.2;
      const side = Math.cos(a) >= 0 ? 1 : -1;
      const x0 = side * (38 + R() * 8), y0 = Math.sin(a) * 4 + 2;
      const x1 = x0 + side * (14 + R() * 18), y1 = y0 + Math.sin(a) * 6 + (R() - 0.3) * 4;
      for (const [w, al] of [[5, 0.1], [2.4, 0.16]]) { s.strokeStyle = rgba("#10040c", al); s.lineWidth = w; s.beginPath(); s.moveTo(x0, y0); s.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + 1, x1, y1); s.stroke(); }
      s.strokeStyle = rgba(NIGHT, 0.08); s.lineWidth = 1.4;
      s.beginPath(); s.moveTo(x0 + 1.5, y0 - 1.2); s.quadraticCurveTo((x0 + x1) / 2 + 1.5, (y0 + y1) / 2, x1 + 1.5, y1 - 1.2); s.stroke();
    }
  });
}
// the lump (bed space: LX0..LX1 along the bed, base LB): sprite covering [LX0-20, LX1+20] x [LB-150, LB+10]
const LX0 = 262, LX1 = 618, LB = 358;
const lumpY = (x) => LB - lumpH(clamp((x - LX0) / (LX1 - LX0)));
function lumpSprite(pat, px) {
  const ox = LX0 - 20, oy = LB - 150, w = LX1 - LX0 + 40, h = 160;
  return K.sprite("f07-lump2", w, h, (s) => {
    s.translate(-ox, -oy);
    const lump = new Path2D();
    lump.moveTo(LX0 - 6, LB + 2);
    for (let x = LX0 - 6; x <= LX1 + 6; x += 4) lump.lineTo(x, lumpY(x) + (x < LX0 || x > LX1 ? 3 : 0));
    lump.lineTo(LX1 + 6, LB + 2);
    lump.quadraticCurveTo(440, LB + 6, LX0 - 6, LB + 2);
    lump.closePath();
    s.save();
    s.clip(lump);
    // patchwork in strips that climb over the hump (rows rise and squeeze over its shoulders)
    for (let x = LX0 - 8; x < LX1 + 8; x += 2) {
      const yT = lumpY(x) - 4;
      s.drawImage(pat, (x - 150) * px, 40 * px, 2 * px, 180 * px, x, yT, 2.6, LB + 6 - yT);
    }
    // form: the mound rolls away from the nightlight (right) into shadow on the left; its top catches
    // the light, the lower flanks are occluded by the bed around them
    const lg = s.createLinearGradient(LX0, 0, LX1, 0);
    lg.addColorStop(0, "rgba(16,8,22,0.6)");
    lg.addColorStop(0.55, "rgba(10,4,14,0.12)");
    lg.addColorStop(1, "rgba(255,214,160,0.1)");
    s.fillStyle = lg;
    s.fillRect(LX0 - 20, LB - 150, LX1 - LX0 + 40, 160);
    const bt = s.createLinearGradient(0, LB - 70, 0, LB + 4);
    bt.addColorStop(0, "rgba(0,0,0,0)");
    bt.addColorStop(1, "rgba(10,4,14,0.55)");
    s.fillStyle = bt;
    s.fillRect(LX0 - 20, LB - 70, LX1 - LX0 + 40, 80);
    const top = s.createRadialGradient(470, LB - 112, 6, 470, LB - 100, 150);
    top.addColorStop(0, "rgba(255,226,180,0.14)");
    top.addColorStop(1, "rgba(255,226,180,0)");
    s.fillStyle = top;
    s.fillRect(LX0 - 20, LB - 150, LX1 - LX0 + 40, 160);
    // folds radiating from the top (where the quilt is pulled over the child's back) down to the bed:
    // each a soft trough (several wide, faint passes) with a lit crest on its nightlight side
    s.lineCap = "round";
    const R = K.rng("f07lumpfolds");
    const apex = [452, LB - 104];
    for (let i = 0; i < 13; i++) {
      const k = (i + 0.5) / 13;
      const bx = lerp(LX0 + 14, LX1 - 14, k) + (R() - 0.5) * 18;
      const sx = lerp(apex[0] - 70, apex[0] + 70, k) + (R() - 0.5) * 20;
      const sy = Math.max(lumpY(sx) + 8, apex[1]) + R() * 14;
      const ex = bx, ey = LB - 2;
      const mx = (sx + ex) / 2 + (k - 0.5) * 30, my = (sy + ey) / 2 - 6;
      const len = Math.hypot(ex - sx, ey - sy);
      if (len < 18) continue;
      const wd = 3 + R() * 5;
      for (const [mul, al] of [[3.2, 0.06], [2, 0.09], [1, 0.12]]) {
        s.strokeStyle = rgba("#0c0410", al * 1.6); s.lineWidth = wd * mul;
        s.beginPath(); s.moveTo(sx, sy); s.quadraticCurveTo(mx, my, ex, ey); s.stroke();
      }
      const o2 = wd * 0.9;
      for (const [mul, al] of [[1.6, 0.05], [0.7, 0.09]]) {
        s.strokeStyle = rgba(NIGHT, al * (0.6 + k)); s.lineWidth = wd * mul;
        s.beginPath(); s.moveTo(sx + o2, sy); s.quadraticCurveTo(mx + o2, my, ex + o2, ey); s.stroke();
      }
    }
    // the ridge line itself is soft (cotton, not a cut-out): a lit lip along the top on the right
    s.strokeStyle = rgba(NIGHT, 0.12);
    s.lineWidth = 8;
    s.beginPath();
    for (let x = LX0 + 60; x <= LX1 - 20; x += 6) { const yy = lumpY(x) + 6; if (x === LX0 + 60) s.moveTo(x, yy); else s.lineTo(x, yy); }
    s.stroke();
    s.restore();
    // a soft fuzz on the silhouette (cotton loft against the dark wall)
    s.globalCompositeOperation = "destination-out";
    s.strokeStyle = "rgba(0,0,0,0.35)";
    s.lineWidth = 1.6;
    s.beginPath();
    for (let x = LX0; x <= LX1; x += 4) { const yy = lumpY(x) - 0.4; if (x === LX0) s.moveTo(x, yy); else s.lineTo(x, yy); }
    s.stroke();
    s.globalCompositeOperation = "source-over";
  });
}
function lumpCreases() {
  return K.sprite("f07-lumpcr", LX1 - LX0 + 120, 40, (s) => {
    s.translate(-(LX0 - 60), -(LB - 26));
    s.lineCap = "round";
    const R = K.rng("f07lumpcr");
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? 1 : -1;
      const x0 = side < 0 ? LX0 + 10 - R() * 20 : LX1 - 10 + R() * 20, y0 = LB - 3 + R() * 6;
      const x1 = x0 + side * (24 + R() * 40), y1 = y0 + 4 + R() * 12;
      for (const [w, a] of [[7, 0.08], [3.5, 0.14]]) { s.strokeStyle = rgba("#0c0410", a); s.lineWidth = w; s.beginPath(); s.moveTo(x0, y0); s.quadraticCurveTo((x0 + x1) / 2, y0 + 2, x1, y1); s.stroke(); }
      s.strokeStyle = rgba(NIGHT, 0.06); s.lineWidth = 2;
      s.beginPath(); s.moveTo(x0 + 3, y0 - 2); s.quadraticCurveTo((x0 + x1) / 2 + 3, y0, x1 + 3, y1 - 2); s.stroke();
    }
  });
}
// a painted wooden toy chest; front = true draws only its front face (so it sits before the bedpost)
const CHEST = { x: 906, w: 132 };
function toyChest(g, x, y, w, h, front = false) {
  const x0 = x - w / 2, top = y - h;
  if (!front) {
    g.save();
    g.translate(x, y + 2);
    g.scale(1, 0.12);
    glow(g, 0, 0, w * 0.7, "#000000", 0.6, "source-over");
    g.restore();
    return;
  }
  const fg = g.createLinearGradient(x0, 0, x0 + w, 0);
  fg.addColorStop(0, "#2e2234");
  fg.addColorStop(0.6, "#4a3650");
  fg.addColorStop(1, "#6a5058");
  g.fillStyle = fg;
  g.fillRect(x0, top, w, h);
  K.texRect(g, "wood", x0, top, w, h, { scale: 260, scaleY: 90, mode: "soft-light", alpha: 0.7, tex: WOOD });
  K.aoEdge(g, x0, top + 2, x0 + w, top + 2, { width: 8, alpha: 0.45, side: -1 });
  const lid = g.createLinearGradient(0, top - 8, 0, top + 2);
  lid.addColorStop(0, "#c0a08a");
  lid.addColorStop(1, "#6a4a58");
  g.fillStyle = lid;
  g.fillRect(x0 - 3, top - 7, w + 6, 9);
  g.fillStyle = rgba(NIGHT, 0.3);
  g.fillRect(x0 - 3, top - 7, w + 6, 2);
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.fillRect(x0, top + 2, w, 3);
  // a painted star on the front
  g.fillStyle = "rgba(255,214,140,0.5)";
  g.beginPath();
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 5 : 12; g.lineTo(x - 6 + Math.cos(a) * r, top + h * 0.55 + Math.sin(a) * r); }
  g.fill();
  const vg = g.createLinearGradient(0, top, 0, y);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = vg;
  g.fillRect(x0, top, w, h);
}
// Biscuit's path in the flashback: along the toy chest -> crouch -> jump onto the bed -> walk up -> settle
// with his side pressed into the mound of quilt over you
const ONBED = 342;
const CHEST_Y = 413;
const LAUNCH = 872, LAND = 776, LOAF = { x: 598, y: ONBED + 1 };
function biscuitIn(t) {
  if (t < 30.0) return { x: 1060, y: CHEST_Y, pose: "walk", phase: 0, a: 0, v: 0 };
  if (t < 31.0) { const k = seg(t, 30.0, 31.0); return { x: lerp(1060, LAUNCH, K.ease.out(k)), y: CHEST_Y, pose: "walk", phase: (t - 30) * 1.6, a: 1, v: 0 }; }
  if (t < 31.7) { const k = seg(t, 31.0, 31.7); return { x: LAUNCH, y: CHEST_Y, pose: "pounce", phase: lerp(0, 0.42, eio(k)), a: 1, v: 0 }; }
  if (t < 32.5) {
    const k = seg(t, 31.7, 32.5);
    // a ballistic arc: fast off the chest, a hang at the top, a soft landing. The body follows the
    // gallop's suspension phases: hind legs driving off (gathered -> extended), a long flat extension at
    // the top (front legs reaching, hind legs trailing), then the front legs swing down to take the
    // landing while the back arches and the hind legs tuck under
    const x = lerp(LAUNCH, LAND, K.ease.out(k)), y = lerp(CHEST_Y, ONBED, k) - Math.sin(k * Math.PI) * 46;
    // the kit's leap pose (front legs reaching forward, hind legs trailing, pitching from nose-up to
    // nose-down over q) carries its own lift and travel; (ox, oy) cancel them so the body rides OUR arc
    const q = lerp(0.1, 0.9, k), S = CAT_S / 60;
    const ox = q * 50 * S, oy = Math.sin(Math.PI * q) * 42 * S;
    const dx = (LAND - LAUNCH) * 2 * (1 - k), dy = (ONBED - CHEST_Y) - Math.cos(k * Math.PI) * Math.PI * 46;
    const rot = clamp(Math.atan2(-dy, -dx) * 0.2, -0.12, 0.16);
    return { x, y, pose: "pounce", phase: 0.5 + q * 0.5, a: 1, v: 1 - k * 0.6, rot, air: 1, k, ox, oy };
  }
  if (t < 33.1) return { x: LAND, y: ONBED, pose: "stand", phase: 0, a: 1, v: 0 };
  if (t < 36.2) { const k = seg(t, 33.1, 36.2); return { x: lerp(LAND, LOAF.x, eio(k)), y: ONBED, pose: "walk", phase: (t - 33.1) * 1.15, a: 1, v: 0 }; }
  // settling: he stops, sinks into a crouch, then folds into a loaf (one opaque cat, no cross-fade)
  if (t < 36.55) return { x: LOAF.x, y: ONBED, pose: "stand", phase: 0, a: 1, v: 0 };
  if (t < 36.85) return { x: LOAF.x, y: ONBED, pose: "pounce", phase: 0.12, a: 1, v: 0 };
  return { x: LOAF.x, y: LOAF.y, pose: "loaf", phase: 0, a: 1, v: 0 };
}
const CAT_S = 74;
function headOf(c) { return [c.x - CAT_S * 0.66, c.y - CAT_S * 0.86]; }
// camera keys for the flashback: wide -> the chest (the pounce fully in frame) -> follow the walk ->
// settle on him -> a slow push in on his face for the blink
const CAMK = [
  [28.0, 480, 270, 1.0],
  [30.0, 500, 285, 1.04],
  [31.2, 668, 318, 1.22],
  [32.6, 664, 318, 1.22],
  [36.2, 590, 292, 1.62],
  [38.0, 575, 290, 1.86],
  [41.0, 566, 291, 1.95],
  [44.2, 556, 286, 3.0],
];
function camAt(t) {
  if (t <= CAMK[0][0]) return CAMK[0];
  for (let i = 1; i < CAMK.length; i++) {
    const a = CAMK[i - 1], b = CAMK[i];
    if (t <= b[0]) { const k = eio(seg(t, a[0], b[0])); return [t, lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)]; }
  }
  return CAMK[CAMK.length - 1];
}
const devPt = (T, x, y) => ({ x: T.a * x + T.c * y + T.e, y: T.b * x + T.d * y + T.f });
function shot4(g, t, W, H) {
  const fl = flashAt(t + 0.0) * 0.35 + K.flash(t, [33.8, 33.95], 0.2) * 0.3;
  // the blanket trembles until his purr (40) settles you: then it stops, visibly
  const tremble = 1 - smooth(seg(t, 39.9, 40.9));
  const c = biscuitIn(t);
  const ck = camAt(t);
  const zoom = ck[3];
  const cam = { x: ck[1], y: ck[2], zoom, shakeT: t, shakeAmt: 0.8 };
  // the nightlight is the only real light: inverse-square falloff from the lamp on the chest, so the
  // far end of the bed and the window wall sink into warm darkness (right -> left across the quilt)
  const falloff = (c2) => {
    c2.save();
    c2.globalCompositeOperation = "multiply";
    const nf = c2.createRadialGradient(NL.x, NL.y, 30, NL.x, NL.y, 900);
    nf.addColorStop(0, "#ffffff");
    nf.addColorStop(0.18, "#ecd8c4");
    nf.addColorStop(0.45, "#9a7a74");
    nf.addColorStop(0.75, "#4a3440");
    nf.addColorStop(1, "#221a28");
    c2.fillStyle = nf;
    c2.fillRect(-W, -H, W * 3, H * 3);
    c2.restore();
  };
  // the wall + window behind the bed fall out of focus as the lens pushes in on him (rack to his eyes)
  const zc = clamp((zoom - 1) / 1.0);
  const blur = 0.6 + zc * 4.5 + clamp(zoom - 2) * 3;
  K.focus(g, W, H, blur, (b) => K.withCamera(b, W, H, cam, () => { bedroom(b, t, W, H, fl, tremble, "back"); falloff(b); }), "f07bedbg");
  K.withCamera(g, W, H, cam, () => {
    g.save();
    bedroom(g, t, W, H, fl, tremble, "front");
    g.restore();
    falloff(g);
    // a slow blink at ~42.5 while the lens pushes in
    const blink = smooth(seg(t, 42.2, 42.5)) * (1 - smooth(seg(t, 42.7, 43.15)));
    const opts = (pose, phase) => ({
      pose, phase, facing: -1, t, headTurn: pose === "loaf" ? 0.55 : pose === "run" ? 0 : 0.15, tailUp: pose === "walk" ? 0.9 : pose === "pounce" ? (c.air ? 0.3 + 0.5 * Math.sin(Math.PI * c.k) : 0.5) : 0, tail: 0.4,
      blink: pose === "loaf" ? Math.max(blink, 0.1) : 0, autoBlink: pose !== "loaf", bell: true, collar: true, ears: 0.6,
      // the lamp is low and behind-right: a modest warm rim on his back, the face side in soft fill,
      // and warm bounce off the chest lid / quilt on his underside
      key: { x: NL.x, y: NL.y - 14, color: NIGHT, strength: 1.15 }, rim: { x: NL.x + 40, y: NL.y - 30, color: "#ffc98a", strength: 0.95 },
      fill: "#4a2a1a", ambient: "#3a2e4a", ambientK: 0.14, backlit: 0.35, castShadow: 0.55, ground: "#1a1016", pupil: 0.85,
      // a sleepy loaf breathes slow and deep; his ears flick at the thunder now and then
      breath: pose === "loaf" ? 1.5 : 1,
      ears: 0.6 + 0.3 * (K.env(t, 38.1, 38.45, 0.06, 0.2) + K.env(t, 40.5, 40.8, 0.05, 0.2) + K.env(t, 43.3, 43.6, 0.05, 0.2)),
    });
    if (c.a > 0) {
      const onBed = c.y >= ONBED - 1;
      if (c.pose === "loaf") {
        // he presses into the quilt: an indentation (a soft dark dip with a lit lip in front of it) and
        // a tight contact shadow where his side meets the mound
        K.shadowBlob(g, c.x + 4, c.y + 1, CAT_S * 0.78, CAT_S * 0.07, { alpha: 0.7, color: "#120808", soft: 0.9 });
        g.save();
        g.translate(c.x + 6, c.y + 4);
        g.scale(1, 0.16);
        glow(g, 0, 0, CAT_S * 0.95, NIGHT, 0.07);
        g.restore();
        K.shadowBlob(g, c.x - CAT_S * 0.62, c.y - CAT_S * 0.18, CAT_S * 0.12, CAT_S * 0.3, { alpha: 0.45, color: "#10060c", soft: 1.2 });
        g.drawImage(dentSprite(), c.x - 70, c.y - 16, 140, 32);
      } else if (onBed) K.shadowBlob(g, c.x + 6, c.y + 2, CAT_S * 0.72, CAT_S * 0.08, { alpha: 0.6, color: "#140a0c" });
      else if (t < 31.75) K.shadowBlob(g, c.x + 4, CHEST_Y + 1, CAT_S * 0.7, CAT_S * 0.07, { alpha: 0.65, color: "#120808" });
      else if (c.air) {
        // in the air: his shadow on whatever is under him, wide and faint while he is high, gathering
        // into a tight dark contact as he comes down onto the quilt
        const surf = c.x > 858 ? CHEST_Y : ONBED + 1;
        const hgt = Math.max(0, surf - c.y);
        const sp = 1 + hgt / 45;
        K.shadowBlob(g, c.x + 6 - hgt * 0.25, surf, CAT_S * 0.62 * sp, CAT_S * 0.06 * sp, { alpha: 0.7 / (1 + hgt / 22), color: "#120808", soft: 0.7 + hgt / 30 });
      }
      const o = opts(c.pose, c.phase);
      const fast = c.v > 0.05;
      const shadowWall = t > 29.9 && t < 33.2;
      if (!fast && !shadowWall) {
        if (c.pose !== "loaf") K.drawCat(g, c.x, c.y, CAT_S, o);
        else {
          // the loaf is painted in its own layer so the fur that sinks into the quilt can be occluded
          // (darker toward the cotton, where no lamp light reaches)
          const T = g.getTransform(), px = K.pixelScale();
          const CL = K.layer(g.canvas.width / px, g.canvas.height / px, "f07cat");
          CL.g.setTransform(T);
          K.drawCat(CL.g, c.x, c.y, CAT_S, o);
          CL.g.globalCompositeOperation = "source-atop";
          const ag = CL.g.createLinearGradient(0, c.y - 16, 0, c.y + 1);
          ag.addColorStop(0, "rgba(20,8,10,0)");
          ag.addColorStop(0.7, "rgba(20,8,10,0.35)");
          ag.addColorStop(1, "rgba(20,8,10,0.7)");
          CL.g.fillStyle = ag;
          CL.g.fillRect(c.x - CAT_S, c.y - 16, CAT_S * 2, 18);
          CL.g.globalCompositeOperation = "source-over";
          g.save();
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.drawImage(CL.canvas, 0, 0);
          g.restore();
        }
        if (c.pose === "loaf") {
          // the quilt bunches up against his belly: the bed's own quilt, re-drawn in a thin crescent over
          // the bottom of his body (same falloff), so he sinks into the cotton; a lit lip where it puffs up
          const x0 = c.x - CAT_S * 0.7, x1 = c.x + CAT_S * 0.64, y = c.y + 0.5;
          const lip = new Path2D();
          lip.moveTo(x0, y);
          lip.bezierCurveTo(x0 + 14, y - 8, x1 - 14, y - 8, x1, y);
          lip.lineTo(x1, y + 7); lip.lineTo(x0, y + 7); lip.closePath();
          g.save();
          g.clip(lip);
          g.drawImage(bedSprite(), BS.x, BS.y, BS.w, BS.h);
          falloff(g);
          const lg = g.createLinearGradient(0, y - 6, 0, y + 4);
          lg.addColorStop(0, rgba(NIGHT, 0.16));
          lg.addColorStop(0.5, "rgba(20,8,14,0.05)");
          lg.addColorStop(1, "rgba(20,8,14,0.3)");
          g.fillStyle = lg;
          g.fillRect(x0, y - 7, x1 - x0, 14);
          g.restore();
        }
      }
      else {
        // the cat is painted ONCE (opaque) into its own layer; the lamp throws that silhouette up the
        // wall behind him, and on the leap a short directional smear trails behind the opaque pass
        const T = g.getTransform();
        const px = K.pixelScale();
        const CL = K.layer(g.canvas.width / px, g.canvas.height / px, "f07cat");
        CL.g.setTransform(T);
        if (c.rot) {
          // pitch the whole body about its centre of mass along the flight path
          const pv = [c.x, c.y - CAT_S * 0.55];
          CL.g.translate(pv[0], pv[1]); CL.g.rotate(c.rot); CL.g.translate(-pv[0], -pv[1]);
        }
        K.drawCat(CL.g, c.x + (c.ox || 0), c.y + (c.oy || 0), CAT_S, c.air ? { ...o, castShadow: 0 } : o);
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        if (shadowWall) {
          const SL = K.layer(g.canvas.width / px, g.canvas.height / px, "f07catsh");
          SL.g.setTransform(1, 0, 0, 1, 0, 0);
          SL.g.drawImage(CL.canvas, 0, 0);
          SL.g.globalCompositeOperation = "source-in";
          SL.g.fillStyle = "#0e0608";
          SL.g.fillRect(0, 0, CL.canvas.width, CL.canvas.height);
          SL.g.globalCompositeOperation = "source-over";
          // only on the wall: above the far edge of the quilt, and right of the bedpost
          const a0 = devPt(T, 560, -400), a1 = devPt(T, 1300, BED.far - 2);
          const b0 = devPt(T, 898, BED.far - 2), b1 = devPt(T, 1300, CHEST_Y - 10);
          const wallClip = new Path2D();
          wallClip.rect(a0.x, a0.y, a1.x - a0.x, a1.y - a0.y);
          wallClip.rect(b0.x, b0.y, b1.x - b0.x, b1.y - b0.y);
          g.save();
          g.clip(wallClip);
          // the lamp is low and to his right, so the shadow climbs up-left, larger and softer than him
          const L0 = devPt(T, NL.x, NL.y);
          for (const [sc, a, dx] of [[1.5, 0.09, -6], [1.43, 0.12, -3], [1.37, 0.16, 0]]) {
            g.globalAlpha = a;
            g.setTransform(sc, 0, 0, sc, L0.x * (1 - sc) + dx, L0.y * (1 - sc) - 26);
            g.drawImage(SL.canvas, 0, 0);
          }
          g.restore();
        }
        if (fast) {
          // motion blur: a 1/30 s shutter, 6 sub-frames of the one painted cat slid along the arc and
          // averaged (additive at 1/N, so the edges along the motion go soft and the body stays solid)
          const MB = K.layer(g.canvas.width / px, g.canvas.height / px, "f07catmb");
          MB.g.setTransform(1, 0, 0, 1, 0, 0);
          MB.g.globalCompositeOperation = "lighter";
          const d0 = devPt(T, c.x, c.y), N = 6, sh = 1 / 30;
          for (let i = 0; i < N; i++) {
            const p = biscuitIn(t - sh * (i / (N - 1) - 0.5)), d = devPt(T, p.x, p.y);
            MB.g.globalAlpha = 1 / N;
            MB.g.drawImage(CL.canvas, d.x - d0.x, d.y - d0.y);
          }
          MB.g.globalCompositeOperation = "source-over";
          MB.g.globalAlpha = 1;
          g.globalAlpha = 1;
          g.drawImage(MB.canvas, 0, 0);
        } else {
          g.globalAlpha = 1;
          g.drawImage(CL.canvas, 0, 0);
        }
        g.restore();
      }
    }
    // purr: the faintest warm lift of light round him as he settles
    const head = headOf(LOAF);
    const purr = K.env(t, 39.6, 44, 0.8, 1);
    if (purr > 0) K.lightPool(g, head[0] + 30, head[1] + 30, 110, NIGHT, { intensity: 0.06 * purr * (0.85 + 0.15 * Math.sin(t * 25)) });
  });
}

// ---- SHOT 5: present, the candle lights itself; you stand -------------------------------------------------
function shot5a(g, t, W, H) {
  const p = eio(seg(t, 44, 50));
  const spark = K.env(t, 45.2, 46.2, 0.15, 0.5);
  const lit = smooth(seg(t, 45.8, 47.4));
  const cx = 668, cy = 418; // the candle stub: beside you, clear of the subtitles
  K.withCamera(g, W, H, { x: 500 + p * 20, y: 280, zoom: 1.12 + p * 0.06, shakeT: t, shakeAmt: 1 }, () => {
    cornerSet(g, t, W, H, 0, { bats: true, warm: lit });
    batBeam(g, t, 0);
    draped(g, 150, 400, 230, 190, 4, 0, lit, "chair");
    // the warm light spreads over the room as the flame grows: a pool on the boards + the walls
    const fk = lit * (0.92 + 0.08 * noise(t * 7, 5));
    K.lightPool(g, cx, cy - 40, 560, CANDLE, { intensity: 0.2 * fk });
    K.lightPool(g, cx, cy + 4, 320, CANDLE, { intensity: 0.6 * fk, flat: 0.32 });
    K.lightPool(g, cx, cy + 2, 90, "#ffd9a0", { intensity: 0.45 * fk, flat: 0.32 });
    // the flame throws your huddled shadow big and soft up the boards behind you
    K.shadowBlob(g, 470, 300, 130, 120, { alpha: 0.55 * lit, soft: 1.4 });
    huddle(g, 610, 466, 300, t, { tremble: 0.35 * (1 - lit), wet: 0.6, moon: 1 - lit * 0.45, warm: lit, warmAt: { x: cx, y: cy - 30 } });
    stub(g, cx, cy, 40, t, lit, spark);
    K.dust(g, W, H, t, { seed: 73, count: 30, color: "#ffd9a0", size: 1.2, alpha: 0.35 * lit + 0.1 });
  });
}

function shot5b(g, t, W, H) {
  // wider, from behind: you get up, the candle at your feet, the round window ahead
  const p = eio(seg(t, 50, 54));
  const stand = 1 - eio(seg(t, 50.4, 52.6));
  const cam = { x: 0.25, y: 0.2, z: 2.0, f: 400, cx: W / 2, cy: H * 0.46 };
  K.withCamera(g, W, H, { x: W / 2, y: H * 0.46, zoom: lerp(1.0, 1.07, p), shakeT: t, shakeAmt: 1 }, () => {
    const st = attic(g, t, W, H, cam, 0, { bats: true, warm: 1 });
    const P = st.P;
    const kid = P(0.35, A.floor, 4.1);
    const cnd = P(0.95, A.floor, 4.0);
    const fk = 0.92 + 0.08 * noise(t * 7, 5);
    K.lightPool(g, cnd[0], cnd[1] - 30, 420, CANDLE, { intensity: 0.22 * fk });
    K.lightPool(g, cnd[0], cnd[1] + 2, 300, CANDLE, { intensity: 0.55 * fk, flat: 0.3 });
    stub(g, cnd[0], cnd[1], cnd[2] * 0.12, t, 1, 0);
    K.drawPerson(g, kid[0], kid[1], kid[2] * 1.3, {
      view: "back", hood: true, crouch: stand, t, wet: 0.5, bell: true,
      light: { x: cnd[0] + 30, y: cnd[1] - 10, color: "#ffb860", strength: 1.0, z: -0.35 }, ambient: "#10141f",
    });
    K.dust(g, W, H, t, { seed: 74, count: 30, color: "#ffd9a0", size: 1.2, alpha: 0.3 });
  });
}

// ---- SHOT 6: the round window, lightning, a mountain on fire --------------------------------------------------
// Mount Hairball seen far off across the valley: layered silhouettes (a far ridge behind, the eroded cone,
// a nearer shoulder in front), each lifted toward the haze with distance; a glowing crater; braided lava
// threads; a smoke column built from baked fbm puffs, lit red from below by the crater. A lightning flash
// rims the far ridge and the cone's left flank. (mx, by) = summit x / base y, w = base width, h = height.
function smokePuff(lit) {
  return K.texBake("f07puff" + (lit ? "L" : "D"), 96, 96, (u, v, out) => {
    const dx = u - 0.5, dy = v - 0.5, d = Math.hypot(dx, dy) * 2;
    const n = K.texFbm(u * 4, v * 4, 61, 4, 4, 4);
    const a = smooth(clamp((1 - d) * 1.6 + n * 0.9 - 0.25));
    if (lit) { out[0] = 255; out[1] = 96; out[2] = 34; } else { const l = 46 + n * 20; out[0] = l; out[1] = l * 0.92; out[2] = l * 0.95; }
    out[3] = a * 255;
  });
}
function coneSprite(w, h) {
  const W2 = Math.round(w), H2 = Math.round(h);
  return K.sprite("f07cone", W2, H2 + 4, (s) => {
    const mx = W2 / 2, top = 0, by = H2;
    // concave flanks, an old parasitic shoulder on the right, a slumped scar on the left, eroded noise
    const bump = (k, c, w) => Math.exp(-((k - c) * (k - c)) / (2 * w * w));
    const prof = (k, side) => [
      mx + side * (W2 * 0.05 + Math.pow(k, 1.35) * W2 * 0.45 + (side > 0 ? W2 * 0.06 * bump(k, 0.55, 0.08) : -W2 * 0.025 * bump(k, 0.4, 0.1))),
      top + k * H2 + noise(k * 11 + (side > 0 ? 3 : 7), 5) * H2 * 0.09 * (0.25 + k) - (side > 0 ? H2 * 0.05 * bump(k, 0.55, 0.06) : 0),
    ];
    const body = new Path2D();
    const N = 26;
    body.moveTo(prof(1, -1)[0], by + 4);
    for (let i = N; i >= 0; i--) { const p = prof(i / N, -1); body.lineTo(p[0], p[1]); }
    body.lineTo(mx - W2 * 0.025, top + H2 * 0.04);
    body.lineTo(mx + W2 * 0.015, top + H2 * 0.025);
    for (let i = 0; i <= N; i++) { const p = prof(i / N, 1); body.lineTo(p[0], p[1]); }
    body.lineTo(prof(1, 1)[0], by + 4);
    body.closePath();
    s.fillStyle = "#16141a";
    s.fill(body);
    K.texFill(s, "lavarock", body, { scale: Math.max(40, W2 * 0.3), mode: "soft-light", alpha: 0.9, tex: LAVAROCK });
    s.save();
    s.clip(body);
    // gullies down the flanks: shadowed troughs with a faint lit lip
    s.lineCap = "round";
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1, k0 = 0.08 + hash(i, 31) * 0.2;
      const a = prof(k0, side * (0.1 + hash(i, 32) * 0.8)), b = prof(1, side * (0.2 + hash(i, 33) * 0.85));
      const cx = (a[0] + b[0]) / 2 + side * W2 * 0.02, cy = (a[1] + b[1]) / 2;
      s.strokeStyle = "rgba(0,0,0,0.35)"; s.lineWidth = Math.max(1, W2 * 0.012);
      s.beginPath(); s.moveTo(a[0], a[1]); s.quadraticCurveTo(cx, cy, b[0], b[1]); s.stroke();
      s.strokeStyle = "rgba(160,150,160,0.07)"; s.lineWidth = Math.max(0.6, W2 * 0.005);
      s.beginPath(); s.moveTo(a[0] - 1.2, a[1]); s.quadraticCurveTo(cx - 1.2, cy, b[0] - 1.2, b[1]); s.stroke();
    }
    // form: the left flank faces the storm-lit sky, the right falls into shadow
    const fg = s.createLinearGradient(mx - W2 * 0.5, 0, mx + W2 * 0.5, 0);
    fg.addColorStop(0, "rgba(120,130,160,0.12)");
    fg.addColorStop(0.5, "rgba(0,0,0,0)");
    fg.addColorStop(1, "rgba(0,0,0,0.4)");
    s.fillStyle = fg;
    s.fillRect(0, 0, W2, H2 + 4);
    s.restore();

  });
}
function volcano(g, mx, by, w, h, t, fl, o = {}) {
  const hazeC = o.haze || "#2a3346";
  const top = by - h;
  // the far ridge behind (hazier), rimmed by the flash
  {
    const rp = new Path2D();
    rp.moveTo(mx - w * 1.2, by + 2);
    const pts = [];
    for (let k = 0; k <= 24; k++) { const x = mx - w * 1.2 + (k / 24) * w * 2.4; const y = by - h * (0.28 + 0.22 * (K.fbm(k * 0.35, 19) * 0.5 + 0.5)) * (1 - Math.abs(k / 24 - 0.55) * 0.8); pts.push([x, y]); rp.lineTo(x, y); }
    rp.lineTo(mx + w * 1.2, by + 2);
    rp.closePath();
    g.fillStyle = mix(mix("#1a1e2a", hazeC, 0.55), "#6a7898", fl * 0.55);
    g.fill(rp);
    if (fl > 0.02) {
      g.strokeStyle = rgba(BOLT, 0.75 * fl);
      g.lineWidth = 1.2;
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1] + 0.6) : g.moveTo(p[0], p[1] + 0.6)));
      g.stroke();
    }
  }
  // the cone (cached), lifted toward the haze; in the flash its rock is lit and its left flank rimmed
  const cone = coneSprite(w, h);
  g.drawImage(cone, mx - w / 2, top, w, h + 4);
  if (fl > 0.02) {
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.9 * fl;
    g.drawImage(cone, mx - w / 2, top, w, h + 4);
    g.drawImage(cone, mx - w / 2, top, w, h + 4);
    g.restore();
  }
  const hz = g.createLinearGradient(0, top, 0, by);
  hz.addColorStop(0, rgba(hazeC, 0.18));
  hz.addColorStop(0.6, rgba(hazeC, 0.4));
  hz.addColorStop(1, rgba(mix(hazeC, "#8a96b8", fl * 0.5), 0.85));
  g.fillStyle = hz;
  g.fillRect(mx - w * 0.6, top, w * 1.2, h + 4);
  // lava threads, braided down from the rim (bright core, glowing body), fading as they cool
  g.lineCap = "round";
  for (const [x0, len, drift, sd] of [[-0.015, 0.4, -0.06, 1], [0.02, 0.16, 0.035, 2]]) {
    const sx = mx + x0 * w, sy = top + h * 0.04;
    const ex = sx + drift * w, ey = sy + len * h;
    const cx = sx + drift * w * 0.2 + noise(sd * 3.1, 2) * w * 0.02, cy = (sy + ey) / 2;
    const st = sd === 1 ? 1 : 0.55;
    for (const [lw, c, a] of [[Math.max(1.6, w * 0.016), "#ff4a14", 0.18 * st], [Math.max(0.9, w * 0.007), "#ff6a20", 0.4 * st], [Math.max(0.4, w * 0.003), "#ffd27a", 0.7 * st]]) {
      const gr = g.createLinearGradient(sx, sy, ex, ey);
      gr.addColorStop(0, rgba(c, a));
      gr.addColorStop(1, rgba(c, 0));
      g.strokeStyle = gr; g.lineWidth = lw;
      g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(cx, cy, ex, ey); g.stroke();
    }
  }
  // the crater: a hot core and its glow on the rim rock
  const pul = 0.85 + 0.15 * Math.sin(t * 3) * noise(t * 2, 4);
  glow(g, mx, top + h * 0.03, h * 0.5, "#ff5a1e", 0.4 * pul);
  glow(g, mx, top + h * 0.025, h * 0.1, "#ffe07a", 0.9);
  // the smoke column: baked puffs rising and leaning downwind, dark on top, lit red from the crater below
  const n = o.puffs || 12;
  const dark = smokePuff(false), redp = smokePuff(true);
  for (let i = n - 1; i >= 0; i--) {
    const k = ((t * 0.045 + i / n) % 1 + 1) % 1;
    const a = Math.min(1, k * 5) * (1 - k) * 1.2;
    const px = mx + Math.pow(k, 1.4) * w * 0.42 + Math.sin(i * 1.7 + t * 0.3) * w * 0.02;
    const py = top - k * h * 1.7;
    const pr = h * (0.12 + k * 0.42);
    g.save();
    g.translate(px, py);
    g.rotate(i * 1.3 + t * 0.05);
    g.globalAlpha = clamp(a * 0.85);
    g.drawImage(dark, -pr, -pr, pr * 2, pr * 2);
    if (fl > 0.02) { g.globalCompositeOperation = "lighter"; g.globalAlpha = clamp(a * 0.35 * fl); g.drawImage(dark, -pr, -pr, pr * 2, pr * 2); g.drawImage(dark, -pr, -pr, pr * 2, pr * 2); }
    g.restore();
    // the underside, lit by the crater: strongest low in the column, gone by the top
    const lk = Math.pow(1 - k, 2.2);
    if (lk > 0.02) {
      g.save();
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = clamp(a * 0.55 * lk * pul);
      g.translate(px, py + pr * 0.28);
      g.rotate(i * 1.3 + t * 0.05);
      g.drawImage(redp, -pr * 0.85, -pr * 0.85, pr * 1.7, pr * 1.7);
      g.restore();
    }
  }
}
// the view out of the round window: storm sky, the valley, the mountain; painted into a layer so the
// raindrops on the glass can refract it
function valley(g, cx, cy, r, t, fl) {
  const x0 = cx - r, y0 = cy - r, w = r * 2;
  const sk = g.createLinearGradient(0, y0, 0, cy + r);
  sk.addColorStop(0, mix("#10161f", "#9aa8cc", fl * 0.85));
  sk.addColorStop(0.6, mix("#1c2432", "#6a7898", fl * 0.85));
  sk.addColorStop(1, mix("#121820", "#3a4460", fl * 0.8));
  g.fillStyle = sk;
  g.fillRect(x0, y0, w, w);
  // storm clouds, lit from inside by the flash
  K.clouds(g, x0 + w, cy, t, { seed: 77, color: mix("#232b3a", "#c8d2ee", fl * 0.75), shade: mix("#0c1018", "#5a6688", fl * 0.6), count: 6, y: y0 + r * 0.35, spread: r * 0.3, speed: 6, scale: 0.8, alpha: 0.9 });
  if (fl > 0.1) K.lightningBolt(g, cx - r * 0.45, y0, cx - r * 0.2, cy + r * 0.25, 11, { alpha: fl, width: 2.2 });
  // the mountain across the valley
  volcano(g, cx + r * 0.32, cy + r * 0.56, r * 1.6, r * 0.6, t, fl, { haze: "#283044" });
  // the near valley side: a darker, closer shoulder with a scatter of village windows
  g.fillStyle = mix("#0a0d13", "#2a3246", fl * 0.6);
  g.beginPath();
  g.moveTo(x0, cy + r);
  for (let x = x0; x <= x0 + w; x += 8) g.lineTo(x, cy + r * 0.6 + Math.sin(x * 0.02) * r * 0.05 + noise(x * 0.01, 3) * r * 0.06);
  g.lineTo(x0 + w, cy + r);
  g.fill();
  for (let i = 0; i < 9; i++) glow(g, x0 + w * (0.1 + hash(i, 3) * 0.8), cy + r * (0.7 + hash(i, 4) * 0.18), 3, "#ffcf7a", 0.6);
  // distant rain as a soft veil over the far valley (not streaks)
  K.fog(g, cx + r, cy + r, { y: cy + r * 0.3, h: r * 0.5, color: mix("#3a4660", "#8a98bc", fl), alpha: 0.25, t, seed: 9 });
}
// water on the glass: beads that refract (each one shows the scene behind it, flipped and squeezed, with
// a dark rim and a bright cap) and a few runnels sliding down that bend the view behind them
function wetGlass(g, src, sx0, sy0, cx, cy, r, t, fl) {
  const R = K.rng("f07drops");
  const S = src.width / (r * 2);
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip();
  // runnels: a drop that got heavy enough, sliding down and leaving a wet trail
  for (let i = 0; i < 5; i++) {
    const sp = 0.12 + hash(i, 41) * 0.2;
    const ph = ((t * sp + hash(i, 42)) % 1 + 1) % 1;
    const xs = cx - r * 0.8 + hash(i, 43) * r * 1.6;
    const yh = cy - r + ph * r * 2.3;
    const len = r * (0.4 + hash(i, 44) * 0.5);
    const path = new Path2D();
    const wob = (yy) => Math.sin(yy * 0.07 + i * 3) * r * 0.012 + Math.sin(yy * 0.19 + i) * r * 0.005;
    const wd = Math.max(1.4, r * 0.012);
    path.moveTo(xs + wob(yh - len) - wd * 0.4, yh - len);
    for (let k = 0; k <= 8; k++) { const yy = yh - len + (k / 8) * len; path.lineTo(xs + wob(yy) - wd * (0.4 + 0.6 * k / 8), yy); }
    path.arc(xs + wob(yh), yh, wd * 1.6, Math.PI, 0, true);
    for (let k = 8; k >= 0; k--) { const yy = yh - len + (k / 8) * len; path.lineTo(xs + wob(yy) + wd * (0.4 + 0.6 * k / 8), yy); }
    path.closePath();
    g.save();
    g.clip(path);
    g.drawImage(src, (xs - sx0 - 8) * S, (yh - len - sy0) * S, 16 * S, (len + 8) * S, xs - 3, yh - len, 6, len + 8);
    g.fillStyle = "rgba(0,0,0,0.2)";
    g.fill(path);
    g.restore();
    g.strokeStyle = rgba(mix("#b8c8e8", "#ffffff", fl), 0.05 + fl * 0.08);
    g.lineWidth = 0.5;
    g.stroke(path);
    glow(g, xs + wob(yh) - wd * 0.5, yh - wd * 0.6, wd * 1.2, "#e6eeff", 0.35 + fl * 0.5);
  }
  // beads
  for (let i = 0; i < 46; i++) {
    const dx = cx + (R() * 2 - 1) * r, dy = cy + (R() * 2 - 1) * r;
    const rd = r * (0.012 + Math.pow(R(), 3) * 0.035);
    const dd = Math.hypot(dx - cx, dy - cy);
    if (dd > r - rd) continue;
    g.save();
    g.beginPath(); g.ellipse(dx, dy, rd, rd * 1.08, 0, 0, TAU); g.clip();
    // a little upside-down fisheye of what lies behind the drop
    g.translate(dx, dy);
    g.scale(1, -1);
    const span = rd * 5;
    g.drawImage(src, (dx - span - sx0) * S, (dy - span - sy0) * S, span * 2 * S, span * 2 * S, -rd * 1.1, -rd * 1.1, rd * 2.2, rd * 2.2);
    g.restore();
    const eg = g.createRadialGradient(dx, dy, rd * 0.5, dx, dy, rd * 1.1);
    eg.addColorStop(0, "rgba(0,0,0,0)");
    eg.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = eg;
    g.beginPath(); g.ellipse(dx, dy, rd * 1.1, rd * 1.18, 0, 0, TAU); g.fill();
    glow(g, dx - rd * 0.35, dy - rd * 0.4, Math.max(0.8, rd * 0.35), "#ffffff", 0.45 + fl * 0.5);
    glow(g, dx + rd * 0.1, dy + rd * 0.65, Math.max(0.6, rd * 0.3), "#cfe0ff", 0.18 + fl * 0.3);
  }
  g.restore();
}
// the sill pawprints: each four toe beans and a pad, pressed into the wood as damp dark prints with a
// faint warm glow that goes out one by one
function pawprint(g, x, y, s, alpha, glowK, rot) {
  if (alpha <= 0.003) return;
  g.save();
  g.translate(x, y);
  g.scale(1, 0.55); // the sill top is foreshortened
  g.rotate(rot);
  const beans = [[-0.52, -0.62, 0.2], [-0.18, -0.9, 0.22], [0.2, -0.9, 0.22], [0.54, -0.6, 0.2]];
  const pad = new Path2D();
  pad.moveTo(-0.55 * s, 0.25 * s);
  pad.bezierCurveTo(-0.6 * s, -0.25 * s, -0.2 * s, -0.42 * s, 0, -0.3 * s);
  pad.bezierCurveTo(0.2 * s, -0.42 * s, 0.6 * s, -0.25 * s, 0.55 * s, 0.25 * s);
  pad.bezierCurveTo(0.45 * s, 0.55 * s, -0.45 * s, 0.55 * s, -0.55 * s, 0.25 * s);
  pad.closePath();
  for (const [bx, by, br] of beans) pad.ellipse(bx * s, by * s, br * s, br * s * 1.2, 0, 0, TAU);
  // damp: the wood darkens (a soft halo of wet round each pad), then the print's own faint warm glow
  g.fillStyle = rgba("#0c0602", 0.35 * alpha);
  g.save(); g.translate(0, -0.25 * s); g.scale(1.25, 1.25); g.translate(0, 0.25 * s); g.fill(pad); g.restore();
  g.fillStyle = rgba("#0c0602", 0.6 * alpha);
  g.fill(pad);
  g.globalCompositeOperation = "lighter";
  g.fillStyle = rgba("#ff9440", 0.32 * alpha * glowK);
  g.fill(pad);
  g.restore();
  glow(g, x, y - s * 0.15, s * 2.2, "#ffae58", 0.12 * alpha * glowK);
}
const SILL_PRINTS = 6;
const printOn = (i) => 55.3 + i * 0.32;
const printOff = (i) => 59.9 + i * 0.32;
function shot6(g, t, W, H) {
  const fl = flashAt(t);
  const p = eio(seg(t, 54, 62));
  K.withCamera(g, W, H, { x: 480, y: 270 - p * 6, zoom: 1.0 + p * 0.06, shakeT: t, shakeAmt: 1 + fl * 4 }, () => {
    // attic wall of planks around the window, warm from the candle behind us
    g.fillStyle = mix("#1c1a1e", "#5a6070", fl * 0.25);
    g.fillRect(-50, -50, W + 100, H + 100);
    K.texRect(g, "wood", -50, -50, W + 100, H + 100, { scale: 1500, scaleY: 208, rot: Math.PI / 2, alpha: 0.9, tex: WOOD, tint: mix("#3a3440", "#8a92a8", fl * 0.15), tintAlpha: 0.85 });
    const wf = g.createRadialGradient(150, 620, 60, 150, 620, 900);
    wf.addColorStop(0, "rgba(0,0,0,0)");
    wf.addColorStop(1, rgba("#030408", 0.72 * (1 - fl * 0.1)));
    g.fillStyle = wf;
    g.fillRect(-50, -50, W + 100, H + 100);
    K.lightPool(g, 150, 640, 640, CANDLE, { intensity: 0.32 * (0.93 + 0.07 * noise(t * 7, 5)) });
    const cx = 480, cy = 196, r = 140;
    // the outside, in its own layer (so the drops can refract it)
    const OL = K.layer(r * 2, r * 2, "f07outside");
    OL.g.translate(-(cx - r), -(cy - r));
    valley(OL.g, cx, cy, r, t, fl);
    // frame
    g.fillStyle = mix("#1a1410", "#4a4a58", fl * 0.2);
    g.beginPath(); g.arc(cx, cy, r * 1.16, 0, TAU); g.fill();
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip();
    g.drawImage(OL.canvas, cx - r, cy - r, r * 2, r * 2);
    g.restore();
    wetGlass(g, OL.canvas, cx - r, cy - r, cx, cy, r, t, fl);
    // the glass's own sheen + the frame and mullions
    {
      const rg = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      rg.addColorStop(0, "rgba(255,255,255,0.06)");
      rg.addColorStop(0.5, "rgba(255,255,255,0)");
      rg.addColorStop(1, "rgba(255,200,150,0.04)");
      g.fillStyle = rg;
      g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
      g.strokeStyle = mix("#140e0a", "#3a3a48", fl * 0.5);
      g.lineWidth = Math.max(2, r * 0.07);
      g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
      g.lineWidth = Math.max(2, r * 0.1);
      g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
      // warm candle light catches the lower-left of the frame, the flash the upper-left
      g.strokeStyle = rgba("#ffb060", 0.2);
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(cx, cy, r * 1.1, Math.PI * 0.6, Math.PI * 0.95); g.stroke();
      g.strokeStyle = rgba("#9fb0d0", 0.1 + fl * 0.5);
      g.beginPath(); g.arc(cx, cy, r * 1.12, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
    }
    // the sill: a lit top surface (foreshortened), a darker front edge, its shadow on the boards below
    const sy = cy + r + 30;
    K.shadowBlob(g, cx, sy + 22, 236, 7, { alpha: 0.75 });
    const topY = sy - 26, frontY = sy;
    const sg = g.createLinearGradient(0, topY, 0, frontY);
    sg.addColorStop(0, mix("#4a3220", "#8a90a8", fl * 0.3));
    sg.addColorStop(1, mix("#6a4a30", "#9aa0b8", fl * 0.3));
    g.fillStyle = sg;
    g.fillRect(cx - 240, topY, 480, 26);
    K.texRect(g, "wood", cx - 240, topY, 480, 26, { scale: 900, scaleY: 60, mode: "soft-light", alpha: 0.9, tex: WOOD });
    const fg2 = g.createLinearGradient(0, frontY, 0, frontY + 14);
    fg2.addColorStop(0, "#3a2616");
    fg2.addColorStop(1, "#120a06");
    g.fillStyle = fg2;
    g.fillRect(cx - 240, frontY, 480, 14);
    K.texRect(g, "wood", cx - 240, frontY, 480, 14, { scale: 700, scaleY: 50, mode: "soft-light", alpha: 0.6, tex: WOOD });
    g.fillStyle = rgba("#ffcf9a", 0.22);
    g.fillRect(cx - 240, frontY - 1, 480, 1.2); // the nosing catches the candle
    K.aoEdge(g, cx - 240, topY, cx + 240, topY, { width: 6, alpha: 0.5, side: -1 });
    K.lightPool(g, cx - 170, sy - 8, 200, CANDLE, { intensity: 0.22, flat: 0.25 });
    // Biscuit's pawprints along the sill, toward the window's latch side and out
    for (let i = 0; i < SILL_PRINTS; i++) {
      const on = smooth(seg(t, printOn(i), printOn(i) + 0.35));
      const off = smooth(seg(t, printOff(i), printOff(i) + 0.7));
      const a = on * (1 - off * 0.85);
      const gl = on * (1 - off) * (0.85 + 0.15 * Math.sin(t * 3 + i));
      pawprint(g, cx - 175 + i * 66, topY + 11 + (i % 2) * 6, 13, a, gl, i % 2 ? 0.14 : -0.14);
    }
    glow(g, cx, cy, r * 1.8, fl > 0.05 ? BOLT : "#7a8aa8", 0.05 + fl * 0.25);
  });
}

// ---- SHOT 7: out onto the wet roof, the storm moving off ---------------------------------------------------------
// ---- the wet slate roof of shot 7 (static in world space, so it is baked once) ----
const RX0 = -60, RY0 = -20;
const ROOF = { VP: [1150, 250], A: [-120, 520], B: [300, 980], U: 0.62, NC: 16 };
function puddleMask() {
  return K.texBake("f07puddle", 192, 96, (u, v, out) => {
    const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2, d = Math.hypot(dx, dy);
    const n = K.texFbm(u * 3, v * 3, 91, 4);
    const a = smooth(clamp((0.75 - d + n * 0.55) * 5));
    out[0] = 255; out[1] = 255; out[2] = 255; out[3] = a * 255;
  });
}
function roofSprites(W, H) {
  const { VP, A: RA, B: RB, U, NC } = ROOF;
  const SW = W + 120, SH = H + 80;
  const L = (P, u) => [lerp(P[0], VP[0], u), lerp(P[1], VP[1], u)];
  const r0 = L(RA, 0), r1 = L(RA, U), e0 = L(RB, 0), e1 = L(RB, U);
  const roof = new Path2D();
  roof.moveTo(r0[0], r0[1]); roof.lineTo(r1[0], r1[1]); roof.lineTo(e1[0], e1[1]); roof.lineTo(e0[0], e0[1]); roof.closePath();
  const vAt = (k) => Math.pow(k / NC, 1.5);
  const slates = (fn) => {
    for (let k = 1; k <= NC; k++) {
      const v = vAt(k), vp = vAt(k - 1);
      const s0 = [lerp(RA[0], RB[0], v), lerp(RA[1], RB[1], v)], sp = [lerp(RA[0], RB[0], vp), lerp(RA[1], RB[1], vp)];
      let uPrev = 0;
      for (let j = 0; j < 44; j++) {
        const u = Math.min(U, 1 - Math.pow(0.9, j + 1 + (k % 2) * 0.5));
        if (uPrev >= U) break;
        fn(k, j, [lerp(sp[0], VP[0], uPrev), lerp(sp[1], VP[1], uPrev)], [lerp(s0[0], VP[0], uPrev), lerp(s0[1], VP[1], uPrev)], [lerp(s0[0], VP[0], u), lerp(s0[1], VP[1], u)], [lerp(sp[0], VP[0], u), lerp(sp[1], VP[1], u)], v);
        uPrev = u;
      }
    }
  };
  const base = K.sprite("f07roof", SW, SH, (s) => {
    s.translate(-RX0, -RY0);
    s.save();
    s.clip(roof);
    s.fillStyle = "#151a24";
    s.fillRect(RX0, RY0, SW, SH);
    // each slate: its own tone (old Welsh slate: blue-grey to purple-grey), shadowed where the course
    // above overlaps it, a lit wet lip along its lower edge
    slates((k, j, a, b, c, d, v) => {
      const tone = hash(k * 57 + j, 3), tint = hash(k * 13 + j * 7, 4);
      const col = mix(mix("#262c38", "#3a3e4c", tone), "#3a2e3a", tint * 0.35);
      s.beginPath(); s.moveTo(a[0], a[1]); s.lineTo(b[0], b[1]); s.lineTo(c[0], c[1]); s.lineTo(d[0], d[1]); s.closePath();
      s.fillStyle = col;
      s.fill();
      const gr = s.createLinearGradient((a[0] + d[0]) / 2, (a[1] + d[1]) / 2, (b[0] + c[0]) / 2, (b[1] + c[1]) / 2);
      gr.addColorStop(0, "rgba(0,0,0,0.55)");
      gr.addColorStop(0.35, "rgba(0,0,0,0.05)");
      gr.addColorStop(0.85, "rgba(150,170,210,0.05)");
      gr.addColorStop(1, "rgba(170,190,230,0.22)");
      s.fillStyle = gr;
      s.fill();
      s.strokeStyle = "rgba(0,0,0,0.45)";
      s.lineWidth = 0.5 + v;
      s.beginPath(); s.moveTo(a[0], a[1]); s.lineTo(b[0], b[1]); s.stroke();
    });
    // grit, lichen and weathering at two scales
    K.texFill(s, "macro", roof, { scale: 380, mode: "soft-light", alpha: 0.6, tex: MACRO });
    K.texFill(s, "asphalt", roof, { scale: 120, mode: "overlay", alpha: 0.4, tex: ASPHALT });
    // wet slate is a dull mirror: at a grazing angle (up toward the ridge) it reflects the sky
    const fr = s.createLinearGradient(0, 300, 0, H);
    fr.addColorStop(0, rgba("#5a6c94", 0.35));
    fr.addColorStop(0.5, rgba("#3a4868", 0.08));
    fr.addColorStop(1, "rgba(0,0,0,0)");
    s.globalCompositeOperation = "screen";
    s.fillStyle = fr;
    s.fill(roof);
    s.globalCompositeOperation = "source-over";
    // toward us the slope falls into shadow
    const nd = s.createLinearGradient(0, 420, 0, H + 40);
    nd.addColorStop(0, "rgba(4,6,10,0)");
    nd.addColorStop(1, "rgba(4,6,10,0.55)");
    s.fillStyle = nd;
    s.fillRect(RX0, 420, SW, SH);
    s.restore();
  });
  const spec = K.sprite("f07roofspec", SW, SH, (s) => {
    s.translate(-RX0, -RY0);
    s.save();
    s.clip(roof);
    // puddles in the hollows: sky-coloured mirrors (drawn first, then tinted with the sky they reflect)
    const pm = puddleMask();
    for (let i = 0; i < 8; i++) {
      const x = 430 + hash(i, 61) * 470, y = 432 + hash(i, 62) * 82, pw = 30 + hash(i, 63) * 50;
      s.save();
      s.translate(x, y);
      s.rotate(-0.12);
      s.globalAlpha = 0.35;
      s.drawImage(pm, -pw, -pw * 0.16, pw * 2, pw * 0.32);
      s.globalAlpha = 0.5;
      s.drawImage(pm, -pw * 0.9, -pw * 0.16, pw * 1.8, pw * 0.08); // the bright meniscus on the far edge
      s.restore();
    }
    s.globalCompositeOperation = "source-atop";
    const pc = s.createLinearGradient(0, 420, 0, 540);
    pc.addColorStop(0, "#9ab0dc");
    pc.addColorStop(1, "#4a5a7c");
    s.fillStyle = pc;
    s.fillRect(RX0, 380, SW, 200);
    s.globalCompositeOperation = "source-over";
    // the moon's glitter path: wet lips of the slates near the mirror point, broken and streaky
    const mpx = 620, mpy = 430;
    slates((k, j, a, b, c, d, v) => {
      const mx = (b[0] + c[0]) / 2, my = (b[1] + c[1]) / 2;
      const dd = Math.hypot((mx - mpx) * 0.55, (my - mpy) * 1.6);
      const w = Math.exp(-dd * dd / (2 * 120 * 120)) * (0.4 + 0.6 * hash(k * 11 + j, 9));
      if (w < 0.03) return;
      s.strokeStyle = rgba("#cfdcff", 0.5 * w);
      s.lineWidth = 1 + v * 2.2;
      s.beginPath(); s.moveTo(b[0], b[1] - 0.8); s.lineTo(c[0], c[1] - 0.8); s.stroke();
      s.fillStyle = rgba("#9fb4e0", 0.12 * w);
      s.beginPath(); s.moveTo(a[0], a[1]); s.lineTo(b[0], b[1]); s.lineTo(c[0], c[1]); s.lineTo(d[0], d[1]); s.closePath(); s.fill();
    });
    // long soft specular streaks running down the slope, as wet slate smears a bright source
    s.save();
    s.translate(mpx, mpy);
    s.rotate(0.83);
    s.scale(1, 0.3);
    const sh = s.createRadialGradient(0, 0, 4, 0, 0, 240);
    sh.addColorStop(0, rgba("#d8e4ff", 0.3));
    sh.addColorStop(0.4, rgba("#bcd0ff", 0.12));
    sh.addColorStop(1, "rgba(180,200,255,0)");
    s.fillStyle = sh;
    s.fillRect(-260, -260, 520, 520);
    s.restore();
    s.restore();
  });
  return { base, spec };
}
function shot7(g, t, W, H) {
  const p = eio(seg(t, 62, 68));
  const clear = smooth(seg(t, 62, 67));
  K.withCamera(g, W, H, { x: 480 + p * 22, y: 270 - p * 8, zoom: 1.02 + p * 0.04, shakeT: t, shakeAmt: 0.9 }, () => {
    K.sky(g, W, H, { top: mix("#0e1420", "#1a2840", clear), mid: "#24304a", bottom: "#3a4258", horizon: 0.72 });
    // a gap opening in the clouds, the moon behind it
    const mx = 700, my = 112;
    // the first gap in the overcast: moonlit sky and a few stars behind a moving deck of storm cloud
    const gap = g.createRadialGradient(mx, my, 10, mx, my, 120 + clear * 160);
    gap.addColorStop(0, rgba("#4a5c84", 0.9));
    gap.addColorStop(0.6, rgba("#2e3a58", 0.4 * clear + 0.2));
    gap.addColorStop(1, "rgba(40,50,80,0)");
    g.fillStyle = gap;
    g.fillRect(0, 0, W, H);
    K.stars(g, W, H, 7, 0.5 * clear, t, { yMax: H * 0.5 });
    K.moon(g, mx, my, 22, { glow: 0.5 + 0.5 * clear });
    // the overcast: two drifting sheets of cloud texture (dark bellies), torn open round the moon as
    // the storm moves off; the torn edges are silvered by the moonlight
    {
      const CL = K.layer(W, H, "f07overcast");
      const c = CL.g;
      // sheet: soft grey-blue cloud with gaps; cores: denser, darker bellies drifting faster (lower)
      const sheet = (key, sc, sy, ox, cover, seed, col, alpha) => {
        const L2 = K.layer(W, H, key);
        K.texRect(L2.g, "cloud", -40, -20, W + 80, H * 0.72, { scale: sc, scaleY: sy, ox, tex: { seed, cover } });
        L2.g.globalCompositeOperation = "source-atop";
        L2.g.fillStyle = col;
        L2.g.fillRect(0, 0, W, H);
        c.globalAlpha = alpha;
        c.drawImage(L2.canvas, 0, 0, W, H);
        c.globalAlpha = 1;
      };
      sheet("f07ovA", 820, 320, -t * 9, 0.5, 83, "#2e3850", 1);
      sheet("f07ovB", 460, 180, -t * 16 + 200, 0.32, 84, "#141a26", 0.9);
      c.globalCompositeOperation = "source-atop";
      // silver lining: cloud near the moon is lit from behind
      const sl = c.createRadialGradient(mx, my, 20, mx, my, 280);
      sl.addColorStop(0, rgba("#c8d6f4", 0.85));
      sl.addColorStop(0.35, rgba("#7a8cb4", 0.4));
      sl.addColorStop(1, "rgba(60,70,100,0)");
      c.fillStyle = sl;
      c.fillRect(0, 0, W, H);
      // the gap opens
      c.globalCompositeOperation = "destination-out";
      const hole = c.createRadialGradient(mx, my, 10, mx, my, 70 + clear * 170);
      hole.addColorStop(0, "rgba(0,0,0,0.96)");
      hole.addColorStop(0.55, rgba("#000000", 0.6 + clear * 0.3));
      hole.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = hole;
      c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = "source-over";
      g.drawImage(CL.canvas, 0, 0, W, H);
    }
    K.godRays(g, mx, my, W, H, { color: "#bcd0ff", count: 8, strength: 0.14 * clear, t, angle: Math.PI / 2 + 0.35, spread: 0.7, length: H * 1.1, seed: 12 });
    // far valley + Mount Hairball glowing on the horizon
    K.hills(g, W, H, { y: H * 0.64, amp: 26, color: "#1a2030", seed: 4, haze: "#3a4258", hazeAmt: 0.45 });
    volcano(g, 840, H * 0.64, 240, 88, t, 0, { haze: "#2e374c", puffs: 9 });
    // a village far down in the valley: a scatter of warm windows through the rain haze
    for (let i = 0; i < 26; i++) {
      const x = 40 + hash(i, 91) * 700, y = H * 0.665 + hash(i, 92) * 18;
      glow(g, x, y, 1.6 + hash(i, 93) * 2, hash(i, 94) > 0.3 ? '#ffc874' : '#cfe0ff', 0.5 + 0.3 * hash(i, 95));
    }
    K.fog(g, W, H, { y: H * 0.66, h: 70, color: '#2a3450', alpha: 0.35, t, seed: 4 });
    K.hills(g, W, H, { y: H * 0.72, amp: 20, color: '#0e121a', seed: 7 });
    // ---- the roof, seen three-quarter from above: the ridge runs from the near left corner away
    // to the right; the slope you stand on falls toward the camera ----
    const VP = [1150, 250];
    const A = [-120, 520], B = [300, 980], C = [-120, 494];
    const L = (P, u) => [lerp(P[0], VP[0], u), lerp(P[1], VP[1], u)];
    const U = 0.62;
    const r0 = L(A, 0), r1 = L(A, U), e0 = L(B, 0), e1 = L(B, U), f0 = L(C, 0), f1 = L(C, U);
    // far slope (facing away, a thin dark strip beyond the ridge)
    g.fillStyle = "#0b0e14";
    g.beginPath(); g.moveTo(f0[0], f0[1]); g.lineTo(f1[0], f1[1]); g.lineTo(r1[0], r1[1]); g.lineTo(r0[0], r0[1]); g.closePath(); g.fill();
    // a chimney stack on the ridge for scale, wet brick catching the moon on one side
    {
      const c = L(A, 0.5), s = 1 - 0.5 * 0.5;
      const cw = 46 * s, ch = 92 * s;
      const cg = g.createLinearGradient(c[0] - cw / 2, 0, c[0] + cw / 2, 0);
      cg.addColorStop(0, "#2a2024");
      cg.addColorStop(0.7, "#4a3a3c");
      cg.addColorStop(1, "#7a7088");
      g.fillStyle = cg;
      g.fillRect(c[0] - cw / 2, c[1] - ch, cw, ch + 6);
      g.fillStyle = "#1a1418";
      g.fillRect(c[0] - cw / 2 - 4, c[1] - ch - 8, cw + 8, 9);
      g.strokeStyle = "rgba(0,0,0,0.35)";
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 1; k < 9; k++) { g.moveTo(c[0] - cw / 2, c[1] - ch + k * ch / 9); g.lineTo(c[0] + cw / 2, c[1] - ch + k * ch / 9); }
      g.stroke();
      // a faint wisp of warm smoke
      for (let i = 0; i < 4; i++) { const k = ((t * 0.12 + i / 4) % 1 + 1) % 1; glow(g, c[0] + k * 40, c[1] - ch - 12 - k * 60, 10 + k * 22, "#4a4a58", 0.35 * (1 - k), "source-over"); }
    }
    // near slope: wet slate, cached (every slate its own tone and wear, shadowed under the course above,
    // a wet lip on its lower edge, puddles in the hollows); the moon's specular is a second cached mask
    // that brightens as the sky clears
    const roof = new Path2D();
    roof.moveTo(r0[0], r0[1]); roof.lineTo(r1[0], r1[1]); roof.lineTo(e1[0], e1[1]); roof.lineTo(e0[0], e0[1]); roof.closePath();
    const RS = roofSprites(W, H);
    g.drawImage(RS.base, RX0, RY0, W + 120, H + 80);
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.3 + 0.7 * clear;
    g.drawImage(RS.spec, RX0, RY0, W + 120, H + 80);
    g.restore();
    g.save();
    g.clip(roof);
    K.reflectStreak(g, 640, 392, 170, "#bcd0ff", 0.14 + 0.26 * clear, { t, width: 30 });
    // rain still dimpling the puddles: tiny rings that come and go
    for (let i = 0; i < 10; i++) {
      const ph = ((t * 1.3 + hash(i, 7)) % 1 + 1) % 1;
      const x = 470 + hash(i, 8) * 420, y = 440 + hash(i, 9) * 80;
      g.strokeStyle = rgba("#cfdcff", 0.25 * (1 - ph) * (1 - clear * 0.6));
      g.lineWidth = 0.6;
      g.beginPath(); g.ellipse(x, y, 2 + ph * 9, (2 + ph * 9) * 0.28, -0.12, 0, TAU); g.stroke();
    }
    // the gable end of the roof: the slates stop at a moonlit barge board
    g.strokeStyle = "#1a1f2a";
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(r1[0], r1[1]); g.lineTo(e1[0], e1[1]); g.stroke();
    // the far end of the roof dissolves into the rain haze
    const hz = g.createLinearGradient(400, 0, 960, 0);
    hz.addColorStop(0, "rgba(40,50,72,0)");
    hz.addColorStop(1, "rgba(40,50,72,0.55)");
    g.fillStyle = hz;
    g.fillRect(0, 0, W, H);
    g.restore();
    // ridge cap tiles, rim-lit by the moon
    g.lineCap = "round";
    g.strokeStyle = "#151a24";
    g.lineWidth = 10;
    g.beginPath(); g.moveTo(r0[0], r0[1]); g.lineTo(r1[0], r1[1]); g.stroke();
    g.strokeStyle = rgba("#c8d8ff", 0.35 + clear * 0.25);
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(r0[0], r0[1] - 4); g.lineTo(r1[0], r1[1] - 2); g.stroke();
    // you, on the slope just below the ridge on the left third, looking out at the far glow
    const kx = 290, ky = 472, kh = 192;
    K.drawPerson(g, kx, ky, kh, {
      view: "back", hood: true, t, wet: 1, beads: true, bell: true,
      light: { x: mx, y: my, color: "#bcd0ff", strength: 0.9, z: -0.6 }, ambient: "#141c30",
    });
    // the bell rings (62): a glint flares on your left wrist
    const ring = K.env(t, 61.9, 64.6, 0.08, 1.4);
    if (ring > 0) {
      glow(g, kx - kh * 0.17, ky - kh * 0.36, 26, "#ffe7a8", 0.35 * ring);
      K.bellGlint(g, kx - kh * 0.17, ky - kh * 0.36, 30 * ring, t, { strength: ring });
    }
    K.rain(g, W, H, t, { density: 0.5 * (1 - clear * 0.7), angle: 0.22, color: "rgba(200,215,240,0.4)", seed: 61 });
    K.splashes(g, W, H, t, { y0: 440, y1: H, x0: 200, x1: W, density: 0.5 * (1 - clear * 0.6) });
  });
}

/// ---- assembly ---------------------------------------------------------------------------------------------
// Every frame goes through the GPU lens; the per-shot look lives in film.gradeAt, so the shots paint
// no 2D tint, vignette or grain of their own: only the letterbox bars.
const GR_STORM = { temp: -0.17, exposure: 0.95, contrast: 1.1, sat: 0.88, halation: 0.5, bloom: 0.32, streak: 0.07, grain: 0.06, vignette: 0.5, weave: 1, lift: [0.004, 0.009, 0.024], gain: [0.98, 1, 1.03] };
const GR_MEMORY = { temp: 0.3, exposure: 1.0, contrast: 1.04, sat: 0.94, halation: 0.62, bloom: 0.42, streak: 0.0, grain: 0.085, vignette: 0.64, weave: 0.55, lift: [0.02, 0.012, 0.006], gain: [1.05, 1, 0.9] };
const GR_CANDLE = { temp: 0.04, exposure: 0.96, contrast: 1.08, sat: 0.92, halation: 0.62, bloom: 0.4, streak: 0.05, grain: 0.06, vignette: 0.52, weave: 1, lift: [0.006, 0.008, 0.016], gain: [1.03, 1, 0.95] };
function mixGrade(a, b, k) {
  const o = {};
  for (const key in a) o[key] = Array.isArray(a[key]) ? a[key].map((v, i) => lerp(v, b[key][i], k)) : lerp(a[key], b[key], k);
  return o;
}
const memW = (t) => smooth(seg(t, 28, 28.8)) * (1 - smooth(seg(t, 44, 44.8)));
function gradeAt(t) {
  let G = GR_STORM;
  if (t >= 44 && t < 54) G = mixGrade(GR_STORM, GR_CANDLE, 0.25 + 0.75 * smooth(seg(t, 45.8, 47.6)));
  else if (t >= 54 && t < 62) G = mixGrade(GR_STORM, GR_CANDLE, 0.3);
  else if (t >= 62) G = mixGrade(GR_STORM, { ...GR_STORM, temp: -0.1, exposure: 1.0, lift: [0.006, 0.01, 0.022] }, smooth(seg(t, 62, 67)));
  const m = memW(t);
  if (m > 0) G = mixGrade(G, GR_MEMORY, m);
  // lightning: the exposure is caught out for a beat (highlights clip, then recover)
  const fl = flashAt(t);
  if (fl > 0.02 && (t < 28 || t > 54)) G = { ...G, exposure: G.exposure + fl * 0.04, temp: G.temp - fl * 0.06, bloom: G.bloom * (1 - fl * 0.3) };
  return G;
}
function frame(g, t, W, H) {
  if (t < 10) {
    // under the opening black there is nothing to see: those frames stay cheap (and feed the warm-up)
    if (t > 0.05) shot1(g, t, W, H);
    else { g.fillStyle = "#000"; g.fillRect(0, 0, W, H); }
    K.letterbox(g, W, H, 1);
    const ta = K.env(t, 1.0, 5.5, 1.5, 1.0);
    if (ta > 0) K.title(g, W, H, "Thunder", "Chapter 7", ta, { size: 60, y: 150, glow: "#05070c", color: "#e8e4dc" });
    K.fadeBlack(g, W, H, 1 - smooth(seg(t, 0, 1.2)));
  } else if (t < 19) {
    shot2(g, t, W, H);
    K.letterbox(g, W, H, 1);
  } else if (t < 28) {
    shot3(g, t, W, H);
    K.letterbox(g, W, H, 1);
  } else if (t < 44.8) {
    const into = smooth(seg(t, 28, 28.8)), back = smooth(seg(t, 44, 44.8));
    if (into < 1) shot3(g, t, W, H);
    else if (back > 0) shot5a(g, t, W, H);
    dissolve(g, W, H, into * (1 - back), "f07mix", (c) => shot4(c, t, W, H));
    K.letterbox(g, W, H, 1);
  } else if (t < 50) {
    shot5a(g, t, W, H);
    K.letterbox(g, W, H, 1);
  } else if (t < 54) {
    shot5b(g, t, W, H);
    K.letterbox(g, W, H, 1);
  } else if (t < 62) {
    shot6(g, t, W, H);
    K.letterbox(g, W, H, 1);
  } else {
    shot7(g, t, W, H);
    K.letterbox(g, W, H, 1);
    K.fadeBlack(g, W, H, smooth(seg(t, 66.2, 68)));
  }
}

// Cache warming, in two parts. (1) A loading step: the first draw at the head of the film (t < 1, under
// the opening black) bakes every per-pixel raster this film uses (kit textures + our own bakes): those
// are atomic and cost 0.1-0.9 s each, so they never run during playback. (2) Budgeted slices: after
// each frame, if there is time left in the frame budget, ONE warm frame of the current or next shot is
// re-walked on a 48x27 canvas until it has built one more sprite/layer cache and the budget is spent
// (see checkpoint()). Only caches change; the picture stays a pure function of t.
const SHOTS = [[0, [3, 4.2, 8]], [10, [12, 17.5]], [19, [19.05, 22]], [28, [29, 31, 32, 33.5, 36.5, 37, 42, 44.5]], [44, [46, 48, 49]], [50, [52, 54]], [54, [54.1, 58, 61]], [62, [63, 66.5]]];
const WARMED = new Set();
let LOADED = false;
function loadStep() {
  LOADED = true;
  OWN_BUILDS++;
  KK.texPrewarm(TEXLIST, 1e9);
  nylonTex(); denimTex(); dampTex(); creaseTex(); plankMips(); smokePuff(true); smokePuff(false); puddleMask(); quiltTex();
}
function nextWarm(t) {
  const px = KK.pixelScale();
  let cur = 0;
  for (let k = 0; k < SHOTS.length; k++) if (t >= SHOTS[k][0]) cur = k;
  const order = t < 1 ? SHOTS.map((_, k) => k) : [cur, cur + 1].filter((k) => k < SHOTS.length);
  for (const k of order) {
    for (const tt of SHOTS[k][1]) {
      const id = k + ":" + tt + "@" + px;
      if (!WARMED.has(id)) return { id, tt };
    }
  }
  return null;
}
function warm(t, t0, frameMs) {
  if (!(frameMs < 11)) return;
  const job = nextWarm(t);
  if (!job) return;
  const L = KK.layer(48, 27, "f07warm");
  if (L.g.reset) { L.g.reset(); L.g.setTransform(KK.pixelScale(), 0, 0, KK.pixelScale(), 0, 0); }
  L.g.scale(0.05, 0.05);
  WARM.on = true; WARM.stop = false; WARM.depth = 0; WARM.t0 = t0; WARM.budget = 13; WARM.sig = buildSig();
  try {
    frame(L.g, job.tt, 960, 540);
    WARMED.add(job.id);
  } catch (err) {
    if (err !== STOP) { WARMED.add(job.id); console.warn("[f07] warm", err); }
  } finally {
    WARM.on = false; WARM.stop = false; WARM.depth = 0;
  }
}


export const film = {
  id: 7,
  title: "Thunder",
  chapter: "Chapter 7",
  unlockAt: 35,
  duration: D,
  poster: 42,
  tagline: "When you were scared, he was there.",
  subs: [
    [5.0, 9.0, "The storm found you in the attic."],
    [11.0, 15.5, "You were scared. Really scared."],
    [20.5, 24.5, "You held the bell and tried not to cry."],
    [30.0, 34.0, "When you were little, storms were the worst."],
    [35.0, 39.0, "And every time, he came."],
    [41.0, 44.0, "He never let you be scared alone."],
    [46.0, 50.5, "Maybe he still wasn't letting you."],
    [55.5, 59.5, "Out past the storm, a mountain on fire."],
    [59.8, 62.0, "His pawprints, on the windowsill."],
  ],
  voice: [
    [5.0, "The storm found you in the attic.", { rate: 0.92, pitch: 1.0 }],
    [11.0, "You were scared. Really scared.", { rate: 0.85, pitch: 0.95 }],
    [20.5, "You held the bell and tried not to cry.", { rate: 0.85, pitch: 0.95 }],
    [30.0, "When you were little, storms were the worst.", { rate: 0.92, pitch: 1.0 }],
    [35.0, "And every time, he came.", { rate: 0.92, pitch: 1.0 }],
    [41.0, "He never let you be scared alone.", { rate: 0.92, pitch: 1.0 }],
    [46.0, "Maybe he still wasn't letting you.", { rate: 0.92, pitch: 1.0 }],
    [55.5, "Out past the storm, a mountain on fire.", { rate: 0.92, pitch: 1.0 }],
    [59.8, "His pawprints, on the windowsill.", { rate: 0.92, pitch: 1.0 }],
  ],
  grade: GR_STORM,
  gradeAt,
  score: { mood: "storm", key: "A", bpm: 62, cues: [[4, "thunder"], [19, "thunder"], [32, "swell"], [40, "purr"], [54, "thunder"], [62, "bell"]] },
  draw(g, t, W, H) {
    t = clamp(t, 0, D);
    const sx = W / 960, sy = H / 540;
    g.save();
    if (sx !== 1 || sy !== 1) g.scale(sx, sy);
    if (!LOADED && t < 1) { try { loadStep(); } catch (err) { console.warn("[f07] load", err); } }
    const t0 = now();
    try { frame(g, t, 960, 540); } finally { g.restore(); }
    try { warm(t, t0, now() - t0); } catch (err) { console.warn("[f07] warm", err); }
  },
};
