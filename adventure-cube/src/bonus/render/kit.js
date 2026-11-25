// render/kit.js - small shared helpers for the bonus renderer (BONUS_RENDER owns). DOM (canvases) at bake time only.
// Re-exports the main renderer's color/noise helpers and adds bake utilities, fast periodic textures and palettes.
import { makeCanvas, hash, rng, vnoise, fbm, rgb, mix, mixRGB, css, shade, clamp, lerp, smooth, rrect, softDot } from "../../render/util.js";

export { makeCanvas, hash, rng, vnoise, fbm, rgb, mix, mixRGB, css, shade, clamp, lerp, smooth, rrect, softDot };
export const TAU = Math.PI * 2;

// bake a sprite: w x h in LOGICAL px, stored at `s` canvas px per logical px; fn(g) draws in logical px.
// returns the canvas with .lw/.lh (logical size) and .ax/.ay (anchor, logical px; default bottom-center)
export function bake(w, h, s, fn, ax = w / 2, ay = h) {
  const c = makeCanvas(Math.ceil(w * s), Math.ceil(h * s)), g = c.getContext("2d");
  g.setTransform(s, 0, 0, s, 0, 0);
  g.lineJoin = "round"; g.lineCap = "round";
  fn(g);
  c.lw = w; c.lh = h; c.ax = ax; c.ay = ay; c.s = s;
  return c;
}
// draw a baked sprite with its anchor at (x, y) in the current transform (logical px)
export function blit(ctx, spr, x, y) { ctx.drawImage(spr, x - spr.ax, y - spr.ay, spr.lw, spr.lh); }

// white silhouette of a canvas (hurt flashes) - bake time
export function silhouette(src, color = "#ffffff") {
  const c = makeCanvas(src.width, src.height), g = c.getContext("2d");
  g.drawImage(src, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  Object.assign(c, { lw: src.lw, lh: src.lh, ax: src.ax, ay: src.ay, s: src.s });
  return c;
}

// ---- fast periodic noise grids (whole octaves at once; ~50x faster than per-pixel hashing) ----
function octave(N, px, py, s) {
  const L = new Float32Array(px * py);
  for (let i = 0; i < px * py; i++) L[i] = hash(i % px, (i / px) | 0, s);
  const out = new Float32Array(N * N);
  const x0 = new Int32Array(N), x1 = new Int32Array(N), fx = new Float32Array(N);
  for (let x = 0; x < N; x++) { const u = (x / N) * px, i = Math.floor(u); let f = u - i; f = f * f * (3 - 2 * f); x0[x] = i % px; x1[x] = (i + 1) % px; fx[x] = f; }
  for (let y = 0; y < N; y++) {
    const v = (y / N) * py, j = Math.floor(v); let fy = v - j; fy = fy * fy * (3 - 2 * fy);
    const r0 = (j % py) * px, r1 = ((j + 1) % py) * px, o = y * N;
    for (let x = 0; x < N; x++) {
      const a = L[r0 + x0[x]], b = L[r0 + x1[x]], c = L[r1 + x0[x]], d = L[r1 + x1[x]];
      const top = a + (b - a) * fx[x];
      out[o + x] = top + (c + (d - c) * fx[x] - top) * fy;
    }
  }
  return out;
}
export function noiseGrid(N, px, py, s, oct = 4, gain = 0.5) {
  const out = new Float32Array(N * N);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const g = octave(N, px << o, py << o, s + o * 31);
    for (let i = 0; i < N * N; i++) out[i] += g[i] * amp;
    tot += amp; amp *= gain;
  }
  for (let i = 0; i < N * N; i++) out[i] /= tot;
  return out;
}
export function whiteGrid(N, s) { const w = new Float32Array(N * N); let a = (s * 2654435761) >>> 0 || 1; for (let i = 0; i < N * N; i++) { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; w[i] = a / 4294967296; } return w; }
// paint an N x N texture with fn(i, x, y, out[3]) -> rgb
export function paintTex(N, fn) {
  const c = makeCanvas(N, N), g = c.getContext("2d");
  const img = g.createImageData(N, N), d = img.data, out = [0, 0, 0];
  for (let y = 0, i = 0; y < N; y++) for (let x = 0; x < N; x++, i++) {
    fn(i, x, y, out);
    const k = i * 4; d[k] = out[0]; d[k + 1] = out[1]; d[k + 2] = out[2]; d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
export const lerp3 = (A, B, t, o) => { o[0] = A[0] + (B[0] - A[0]) * t; o[1] = A[1] + (B[1] - A[1]) * t; o[2] = A[2] + (B[2] - A[2]) * t; return o; };
export const cl01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// radial light / glow sprite (white center -> transparent), cached by key
const glowCache = new Map();
export function glowSprite(size, color = "#ffffff", falloff = 0.5) {
  const k = size + "|" + color + "|" + falloff;
  let c = glowCache.get(k);
  if (!c) {
    c = makeCanvas(size, size); const g = c.getContext("2d"), r = size / 2;
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, css(color, 1)); gr.addColorStop(falloff * 0.5, css(color, 0.75)); gr.addColorStop(falloff, css(color, 0.32)); gr.addColorStop(1, css(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    glowCache.set(k, c);
  }
  return c;
}

// linear gradient helper
export function lg(g, x0, y0, x1, y1, stops) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [t, c] of stops) gr.addColorStop(t, c);
  return gr;
}
export function rg(g, x, y, r0, r1, stops, fx = x, fy = y) {
  const gr = g.createRadialGradient(fx, fy, r0, x, y, r1);
  for (const [t, c] of stops) gr.addColorStop(t, c);
  return gr;
}
// a filled ellipse
export function ell(g, x, y, rx, ry, fill, rot = 0) { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); g.fill(); }
// polygon from flat coords
export function poly(g, pts, fill, stroke, lw) {
  g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); }
}
// a soft drop shadow ellipse sprite (shared)
let shadowSpr = null;
export function shadowSprite() {
  if (!shadowSpr) {
    shadowSpr = makeCanvas(64, 20); const g = shadowSpr.getContext("2d");
    const gr = g.createRadialGradient(32, 10, 0, 32, 10, 32);
    gr.addColorStop(0, "rgba(10,14,6,0.5)"); gr.addColorStop(0.55, "rgba(10,14,6,0.25)"); gr.addColorStop(1, "rgba(10,14,6,0)");
    g.setTransform(1, 0, 0, 10 / 32, 0, 0); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  return shadowSpr;
}

// natural palette for the bonus world (Area 1's sunny forest family)
export const PAL = {
  soil: { base: "#5e4029", dark: "#3a2617", light: "#7f5b3b", grain: "#9a7652", root: "#4a2f1b", pebble: "#8c8578" },
  grass: { dark: "#2a6120", mid: "#468f2e", light: "#79c047", tip: "#bcdc6e", dry: "#9bb04a" },
  rock: { base: "#8a877d", dark: "#55534d", light: "#bdbaa9" },
  bark: { base: "#6b4b32", dark: "#3b2818", light: "#93704c", ring: "#d6ae79", ringDark: "#a77c4b", moss: "#5b8b35" },
  leafOak: ["#1f3d17", "#2f5b22", "#467f2c", "#6aa53a", "#9cc95a"],
  leafBirch: ["#2a4a1a", "#3f6c25", "#5f9433", "#8cbd48", "#c3e07a"],
  leafPine: ["#0f2a1e", "#173a28", "#245034", "#386a43", "#5a8a5a"],
  leafAncient: ["#1a3414", "#27501e", "#3b7028", "#5e9a37", "#93c457"],
};
