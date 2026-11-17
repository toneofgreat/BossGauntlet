// src/games/cats/scripts/filmpost.js - camera, lens and grading: withCamera, depth of field, bloom,
// lens flare, vignette, grain, colour grading, letterbox, fades and the title/subtitle typography.
// Re-exported by filmkit.js. All passes are pure functions of their arguments.

import { TAU, clamp, lerp, hash, noise, rng, mix, rgba, makeCanvas, layer, sprite, glow, hasFilter, pixelScale } from "./filmcore.js";

// withCamera(g, W, H, {x, y, zoom, rot, shakeT, shakeAmt}, fn) - runs fn(g) with a camera that
// looks at world point (x, y) (default the frame centre), zoomed and rotated about the frame
// centre, plus a smooth handheld drift when shakeAmt > 0 (px, driven by shakeT seconds).
export function withCamera(g, W, H, cam = {}, fn) {
  const x = cam.x == null ? W / 2 : cam.x, y = cam.y == null ? H / 2 : cam.y;
  const z = cam.zoom || 1, r = cam.rot || 0;
  const st = cam.shakeT || 0, sa = cam.shakeAmt || 0;
  const sx = sa ? (noise(st * 1.3, 11) * 0.7 + noise(st * 4.1, 12) * 0.3) * sa : 0;
  const sy = sa ? (noise(st * 1.1, 13) * 0.7 + noise(st * 3.7, 14) * 0.3) * sa : 0;
  const sr = sa ? noise(st * 0.9, 15) * sa * 0.0015 : 0;
  g.save();
  g.translate(W / 2 + sx, H / 2 + sy);
  g.rotate(r + sr);
  g.scale(z, z);
  g.translate(-x, -y);
  try { fn(g); } finally { g.restore(); }
}

// Small blur engine: downscale (cheap, works everywhere) + a light ctx.filter blur when the
// browser supports it. Returns a canvas to draw stretched over the logical W x H.
const BLUR = new Map();
const SCRATCH = new Map();
function scratch(w, h) {
  const key = w + "x" + h;
  let c = SCRATCH.get(key);
  if (!c) { if (SCRATCH.size > 12) SCRATCH.clear(); c = makeCanvas(w, h); SCRATCH.set(key, c); }
  return c;
}
function blurred(src, px) {
  const ps = pixelScale();
  const k = Math.max(1, (px * ps) / 2.2);
  const w = Math.max(1, Math.ceil(src.width / k)), h = Math.max(1, Math.ceil(src.height / k));
  const key = w + "x" + h;
  let c = BLUR.get(key);
  if (!c) { if (BLUR.size > 12) BLUR.clear(); c = makeCanvas(w, h); BLUR.set(key, c); }
  const s = c.getContext("2d");
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalCompositeOperation = "source-over";
  s.globalAlpha = 1;
  s.clearRect(0, 0, w, h);
  s.imageSmoothingEnabled = true;
  if (hasFilter()) {
    // downscale first WITHOUT a filter, then blur the small copy: a filter applied while
    // shrinking runs over every source pixel and costs several ms on software canvases
    const tmp = scratch(w, h);
    const ts = tmp.getContext("2d");
    ts.setTransform(1, 0, 0, 1, 0, 0);
    ts.globalCompositeOperation = "copy";
    ts.globalAlpha = 1;
    ts.imageSmoothingEnabled = true;
    ts.drawImage(src, 0, 0, w, h);
    ts.globalCompositeOperation = "source-over";
    s.filter = `blur(${Math.min(6, (px * ps) / k).toFixed(2)}px)`;
    s.drawImage(tmp, 0, 0);
    s.filter = "none";
  } else s.drawImage(src, 0, 0, w, h);
  return c;
}

// dof(g, layerCanvas, blurPx, alpha) - draws an offscreen layer (from layer()) blurred by ~blurPx:
// paint foreground/background into a layer, then dof() it into the frame.
export function dof(g, src, blurPx = 4, alpha = 1) {
  if (!src) return;
  const W = src.width / pixelScale(), H = src.height / pixelScale();
  g.save();
  g.globalAlpha *= alpha;
  g.imageSmoothingEnabled = true;
  if (blurPx <= 0.3) g.drawImage(src, 0, 0, W, H);
  else g.drawImage(blurred(src, blurPx), 0, 0, W, H);
  g.restore();
}
// blurLayer(W, H, key, blurPx, fn) - convenience: paint fn(g) into a layer and return it ready
// for dof(). Example: K.dof(g, K.blurLayer(W, H, "fg", 6, (f) => K.grass(f, ...)).canvas, 6)
export function blurLayer(W, H, key, blurPx, fn) {
  const L = layer(W, H, key);
  try { fn(L.g); } catch (err) { console.warn("[filmkit] blurLayer", key, err); }
  return L;
}
// rackFocus(g, W, H, blurPx, fn) - paint fn into a layer and draw it blurred (one call).
export function focus(g, W, H, blurPx, fn, key = "focus") {
  if (blurPx <= 0.3) { fn(g); return; }
  const L = blurLayer(W, H, key, blurPx, fn);
  dof(g, L.canvas, blurPx);
}

// bloom(g, amount, {threshold}) - glow from the bright parts of what is already drawn.
export function bloom(g, amount = 0.5, o = {}) {
  if (amount <= 0) return;
  const cv = g.canvas;
  const w = Math.max(1, Math.ceil(cv.width / 8)), h = Math.max(1, Math.ceil(cv.height / 8));
  const c = sprite("bloombuf" + w + "x" + h, w / pixelScale(), h / pixelScale(), () => {});
  const s = c.getContext("2d");
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalAlpha = 1;
  s.globalCompositeOperation = "source-over";
  s.clearRect(0, 0, c.width, c.height);
  if (hasFilter()) {
    // shrink first (no filter), then threshold + blur the 1/8-size copy (see blurred())
    const tmp = scratch(c.width, c.height);
    const ts = tmp.getContext("2d");
    ts.setTransform(1, 0, 0, 1, 0, 0);
    ts.globalCompositeOperation = "copy";
    ts.globalAlpha = 1;
    ts.imageSmoothingEnabled = true;
    ts.drawImage(cv, 0, 0, c.width, c.height);
    ts.globalCompositeOperation = "source-over";
    s.filter = `brightness(${o.threshold == null ? 0.85 : o.threshold}) contrast(2.2) blur(2px)`;
    s.drawImage(tmp, 0, 0);
    s.filter = "none";
  } else s.drawImage(cv, 0, 0, c.width, c.height);
  s.globalCompositeOperation = "multiply";
  s.drawImage(c, 0, 0); // squares the values: a cheap soft threshold
  s.globalCompositeOperation = "source-over";
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "screen";
  g.globalAlpha = clamp(amount);
  g.imageSmoothingEnabled = true;
  g.drawImage(c, 0, 0, cv.width, cv.height);
  g.restore();
}

// vignette(g, W, H, strength, color) - darkened, slightly soft corners.
export function vignette(g, W, H, strength = 0.55, color = "#000000") {
  const gr = g.createRadialGradient(W / 2, H * 0.52, Math.min(W, H) * 0.32, W / 2, H * 0.52, Math.hypot(W, H) * 0.58);
  gr.addColorStop(0, rgba(color, 0));
  gr.addColorStop(0.6, rgba(color, strength * 0.35));
  gr.addColorStop(1, rgba(color, strength));
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
}

// grain(g, W, H, t, amount) - animated film grain from 4 cached noise tiles (cheap).
const GRAIN = [];
function grainTile(i) {
  if (!GRAIN[i]) {
    const n = 128;
    const c = makeCanvas(n, n);
    const s = c.getContext("2d");
    const img = s.createImageData(n, n);
    const R = rng("grain" + i);
    for (let p = 0; p < n * n; p++) {
      const v = 128 + (R() + R() + R() - 1.5) * 150;
      img.data[p * 4] = img.data[p * 4 + 1] = img.data[p * 4 + 2] = clamp(v, 0, 255);
      img.data[p * 4 + 3] = 255;
    }
    s.putImageData(img, 0, 0);
    GRAIN[i] = c;
  }
  return GRAIN[i];
}
export function grain(g, W, H, t = 0, amount = 0.06) {
  if (amount <= 0) return;
  const f = Math.floor(t * 24);
  const tile = grainTile(((f % 4) + 4) % 4);
  const pat = g.createPattern(tile, "repeat");
  if (!pat) return;
  const ox = Math.floor(hash(f, 1) * 128), oy = Math.floor(hash(f, 2) * 128);
  g.save();
  g.globalCompositeOperation = "overlay";
  g.globalAlpha = clamp(amount * 2.2);
  g.translate(-ox, -oy);
  g.fillStyle = pat;
  g.fillRect(ox, oy, W, H);
  g.restore();
}

// grade(g, W, H, {tint, alpha, mode, lift, crush}) - colour grade: a tint blended with `mode`
// (soft-light by default), optional lifted blacks (`lift` colour) and crushed highlights.
export function grade(g, W, H, o = {}) {
  g.save();
  if (o.tint) {
    g.globalCompositeOperation = o.mode || "soft-light";
    g.globalAlpha = o.alpha == null ? 0.3 : o.alpha;
    g.fillStyle = o.tint;
    g.fillRect(0, 0, W, H);
  }
  if (o.lift) {
    g.globalCompositeOperation = "lighten";
    g.globalAlpha = 1;
    g.fillStyle = o.lift;
    g.fillRect(0, 0, W, H);
  }
  if (o.shadows) {
    // tint the shadows only (multiply a gradient from the shadow colour to white)
    g.globalCompositeOperation = "multiply";
    g.globalAlpha = o.shadowAlpha == null ? 0.25 : o.shadowAlpha;
    g.fillStyle = o.shadows;
    g.fillRect(0, 0, W, H);
  }
  g.restore();
}

// lensFlare(g, x, y, W, H, strength, {color}) - anamorphic streak + ghosts toward the centre.
export function lensFlare(g, x, y, W, H, strength = 0.6, o = {}) {
  if (strength <= 0) return;
  const color = o.color || "#ffd9a0";
  g.save();
  g.globalCompositeOperation = "lighter";
  const sg = g.createLinearGradient(x - W * 0.6, 0, x + W * 0.6, 0);
  sg.addColorStop(0, rgba("#7fb4ff", 0));
  sg.addColorStop(0.5, rgba(mix(color, "#9cc8ff", 0.4), 0.35 * strength));
  sg.addColorStop(1, rgba("#7fb4ff", 0));
  g.fillStyle = sg;
  g.fillRect(x - W * 0.6, y - 1.5, W * 1.2, 3);
  g.globalAlpha = 0.5;
  g.fillRect(x - W * 0.4, y - 5, W * 0.8, 10);
  g.restore();
  glow(g, x, y, 60, color, 0.4 * strength);
  const cx = W / 2, cy = H / 2;
  const ghosts = [[0.4, 18, "#ffb070"], [0.7, 10, "#9cf0ff"], [1.2, 28, "#b090ff"], [1.5, 14, "#ffd070"], [1.9, 40, "#70ffb0"]];
  for (const [k, r, c] of ghosts) {
    const gx = lerp(x, cx, k), gy = lerp(y, cy, k);
    glow(g, gx, gy, r * 1.6, c, 0.18 * strength);
  }
}

// chromatic(g, W, H, amount) - cheap edge fringing: a red-tinted copy scaled up a hair, blended in.
export function chromatic(g, W, H, amount = 1) {
  if (amount <= 0) return;
  const cv = g.canvas;
  const L = layer(W, H, "chroma");
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  L.g.drawImage(cv, 0, 0);
  L.g.globalCompositeOperation = "multiply";
  L.g.fillStyle = "#ff3030";
  L.g.fillRect(0, 0, L.canvas.width, L.canvas.height);
  L.g.globalCompositeOperation = "source-over";
  const k = 1 + 0.004 * amount;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "lighten";
  g.globalAlpha = 0.5;
  g.drawImage(L.canvas, -(k - 1) * cv.width / 2, -(k - 1) * cv.height / 2, cv.width * k, cv.height * k);
  g.restore();
}

// letterbox(g, W, H, amount, bar) - black bars; default bar = 0.085 H (FILMS.md), amount 0..1.
export function letterbox(g, W, H, amount = 1, bar = 0.085) {
  const h = H * bar * clamp(amount);
  if (h <= 0) return;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, h);
  g.fillRect(0, H - h, W, h);
}

export function fadeBlack(g, W, H, a) {
  if (a <= 0) return;
  g.save();
  g.globalAlpha = clamp(a);
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  g.restore();
}
export function fadeColor(g, W, H, a, color = "#fff6e6") {
  if (a <= 0) return;
  g.save();
  g.globalAlpha = clamp(a);
  g.fillStyle = color;
  g.fillRect(0, 0, W, H);
  g.restore();
}

// Letter-spaced text (manual, so it works where ctx.letterSpacing does not).
function spaced(g, text, x, y, spacing) {
  const chars = Array.from(text);
  let total = 0;
  const ws = chars.map((c) => { const w = g.measureText(c).width; total += w; return w; });
  total += spacing * (chars.length - 1);
  let cx = x - total / 2;
  const align = g.textAlign;
  g.textAlign = "left";
  chars.forEach((c, i) => { g.fillText(c, cx, y); cx += ws[i] + spacing; });
  g.textAlign = align;
  return total;
}

const SERIF = '"Cormorant Garamond", "Playfair Display", Georgia, "Times New Roman", serif';
const SANS = '"Fredoka One", "Fredoka", "Segoe UI", Roboto, system-ui, sans-serif';

// title(g, W, H, text, sub, alpha, {y, size, color, glow}) - cinematic title card: a small
// letter-spaced caps chapter line (sub) above a large serif title, thin rules, soft glow.
export function title(g, W, H, text, sub, alpha = 1, o = {}) {
  if (alpha <= 0.003) return;
  const color = o.color || "#f4efe6";
  const y = o.y == null ? H * 0.5 : o.y;
  const size = o.size || Math.round(H * 0.085);
  g.save();
  g.globalAlpha *= clamp(alpha);
  g.textBaseline = "middle";
  g.textAlign = "center";
  g.shadowColor = rgba(o.glow || "#ffd9a0", 0.55);
  g.shadowBlur = size * 0.5;
  g.fillStyle = color;
  if (sub) {
    g.font = `600 ${Math.round(size * 0.3)}px ${SANS}`;
    spaced(g, String(sub).toUpperCase(), W / 2, y - size * 0.95, size * 0.16);
  }
  g.font = `500 ${size}px ${SERIF}`;
  const tw = spaced(g, String(text || ""), W / 2, y, size * 0.06);
  g.shadowBlur = 0;
  if (sub) {
    const rw = Math.min(W * 0.3, tw * 0.5);
    const ry = y - size * 0.62;
    const lg = g.createLinearGradient(W / 2 - rw, 0, W / 2 + rw, 0);
    lg.addColorStop(0, rgba(color, 0));
    lg.addColorStop(0.5, rgba(color, 0.8));
    lg.addColorStop(1, rgba(color, 0));
    g.fillStyle = lg;
    g.fillRect(W / 2 - rw, ry, rw * 2, 1);
  }
  g.restore();
}

// subtitle(g, W, H, text, alpha) - the player's subtitle style: white, soft shadow, bottom centre
// inside the picture, wrapped to 80% width.
export function subtitle(g, W, H, text, alpha = 1, o = {}) {
  if (!text || alpha <= 0.003) return;
  const size = o.size || Math.round(H * 0.044);
  g.save();
  g.globalAlpha *= clamp(alpha);
  g.font = `600 ${size}px "Segoe UI", Roboto, "Helvetica Neue", system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  const max = W * 0.8;
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (g.measureText(test).width > max && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  const lh = size * 1.25;
  let y = (o.y == null ? H - H * 0.085 - size * 0.55 : o.y) - (lines.length - 1) * lh;
  for (const l of lines) {
    g.shadowColor = "rgba(0,0,0,0.9)";
    g.shadowBlur = size * 0.35;
    g.shadowOffsetY = 1;
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillText(l, W / 2 + 1, y + 1.5);
    g.shadowBlur = size * 0.25;
    g.fillStyle = "#ffffff";
    g.fillText(l, W / 2, y);
    y += lh;
  }
  g.restore();
}

// film-standard finishing stack in one call (FILMS.md §4 order): bloom -> grade -> vignette ->
// grain -> letterbox. o = {bloom, tint, tintAlpha, mode, vignette, grain, letterbox}
export function finish(g, W, H, t, o = {}) {
  if (o.bloom) bloom(g, o.bloom);
  if (o.tint) grade(g, W, H, { tint: o.tint, alpha: o.tintAlpha == null ? 0.25 : o.tintAlpha, mode: o.mode });
  vignette(g, W, H, o.vignette == null ? 0.55 : o.vignette);
  grain(g, W, H, t, o.grain == null ? 0.06 : o.grain);
  if (o.letterbox !== false) letterbox(g, W, H, o.letterbox == null ? 1 : o.letterbox);
}

