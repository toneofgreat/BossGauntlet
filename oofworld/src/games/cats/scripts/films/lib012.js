// films/lib012.js - shared painters for films f00-f02 (Prologue, Chapter 1, Chapter 2):
// the shot sequencer with cross-dissolves, wet-ground light streaks, the Cat Plaza (with the statue
// of Sir Whiskers the First), meadow pieces (ridges, windmill, barn, rainbow arch, blossom trees)
// and a few small lighting helpers. Everything is a pure function of its arguments; static art is
// cached through K.sprite(). Films draw in a 960 x 540 logical space.
import * as K from "../filmkit.js";

export const W0 = 960;
export const H0 = 540;

// ---- sequencing -----------------------------------------------------------------------------------
// shots: [{a, b, xf?, draw(g, t, p)}] sorted by a. A shot with xf > 0 cross-dissolves in over
// [a, a + xf] on top of the previous shot (which keeps running its own clock). post(g, t) runs last.
export function runFilm(g, t, W, H, shots, post) {
  let i = 0;
  g.save();
  try {
    if (W !== W0 || H !== H0) g.scale(W / W0, H / H0);
    for (let k = 0; k < shots.length; k++) if (t >= shots[k].a) i = k;
    const s = shots[i];
    const xf = s.xf || 0;
    if (xf > 0 && i > 0 && t < s.a + xf) {
      drawShot(g, shots[i - 1], t);
      const L = K.layer(W0, H0, "lib012-xfade");
      drawShot(L.g, s, t);
      g.save();
      g.globalAlpha = K.smooth((t - s.a) / xf);
      g.drawImage(L.canvas, 0, 0, W0, H0);
      g.restore();
    } else drawShot(g, s, t);
    if (post) post(g, t);
  } finally {
    g.restore();
  }
  try { prewarm(shots, t, i); } catch (err) { console.warn("[lib012] prewarm", err); }
}
function drawShot(g, s, t) {
  g.save();
  try { s.draw(g, t, K.seg(t, s.a, s.b)); } finally { g.restore(); }
}
// Cache warming. The first draw of a shot builds its sprites (20-50 ms), which would stutter on
// every cut. While the film fades in from black (t < 1.4) one not-yet-warmed shot per frame is
// drawn into a throwaway layer (all of its static art gets cached while the screen is black), and
// on a seek, the next shot is warmed ~1.5 s before its cut. Only caches change: the picture stays
// a pure function of t.
const WARMED = new WeakMap();
function prewarm(shots, t, cur) {
  let done = WARMED.get(shots);
  if (!done) { done = new Set(); WARMED.set(shots, done); }
  const px = K.pixelScale();
  const id = (k) => k + "@" + px;
  let target = -1;
  if (t < 1.4) {
    for (let k = 0; k < shots.length; k++) if (k !== cur && !done.has(id(k))) { target = k; break; }
  } else {
    const n = cur + 1;
    if (n < shots.length && shots[n].a - t < 1.5 && !done.has(id(n))) target = n;
  }
  if (target < 0) return;
  done.add(id(target));
  if (!done.has(id(cur))) done.add(id(cur));
  const s = shots[target];
  const L = K.layer(W0, H0, "lib012-warm");
  for (const tt of s.warm || [s.a + 0.02, (s.a + s.b) / 2, s.b - 0.05]) drawShot(L.g, s, tt);
}

// ---- lighting helpers for drawCat -------------------------------------------------------------------
// dimCoat(k, toward) - Biscuit's coat pushed toward a night colour (k = 0..1), as a coat override.
export function dimCoat(k, toward = "#0b1020", base = null) {
  const src = base || K.BISCUIT;
  const out = {};
  for (const key of ["base", "light", "dark", "belly", "white", "stripe", "tip", "nose", "noseEdge", "innerEar"]) {
    if (src[key]) out[key] = K.mix(src[key], toward, k * (key === "white" ? 0.85 : 1));
  }
  return out;
}
// relit(g, key, fn, o) - draw fn(layerG) offscreen, then impose a directional key light on it:
// the side away from the light (o.dark = [x0,y0,x1,y1] gradient from dark to clear) goes into
// shadow, the lit edge gets a warm additive rim. A cheap way to make a drawCat sit in one light.
export function relit(g, key, fn, o = {}) {
  const L = K.layer(W0, H0, key);
  try { fn(L.g); } catch (err) { console.warn("[lib012] relit", err); }
  const s = L.g;
  const [x0, y0, x1, y1] = o.dir || [0, 0, W0, 0];
  s.save();
  s.globalCompositeOperation = "source-atop";
  const gr = s.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, K.rgba(o.shadow || "#06040a", o.darkA == null ? 0.7 : o.darkA));
  gr.addColorStop(o.mid == null ? 0.55 : o.mid, K.rgba(o.shadow || "#06040a", (o.darkA == null ? 0.7 : o.darkA) * 0.35));
  gr.addColorStop(1, K.rgba(o.shadow || "#06040a", 0));
  s.fillStyle = gr;
  s.fillRect(0, 0, W0, H0);
  if (o.rim) {
    s.globalCompositeOperation = "source-atop";
    const rg = s.createLinearGradient(x0, y0, x1, y1);
    rg.addColorStop(0, K.rgba(o.rim, 0));
    rg.addColorStop(o.rimFrom == null ? 0.82 : o.rimFrom, K.rgba(o.rim, 0));
    rg.addColorStop(1, K.rgba(o.rim, o.rimA == null ? 0.35 : o.rimA));
    s.fillStyle = rg;
    s.fillRect(0, 0, W0, H0);
  }
  s.restore();
  g.save();
  g.globalAlpha *= o.alpha == null ? 1 : o.alpha;
  g.drawImage(L.canvas, 0, 0, W0, H0);
  g.restore();
}

// ringPortal(g, x, y, r, t, {open, tilt, intensity, color, core}) - the paw portal as a thin,
// hot, slightly tilted ring of light with a deep luminous interior (no orbs, no arcs), meant to be
// lit by godRays/pawprints around it. Additive.
export function ringPortal(g, x, y, r, t, o = {}) {
  const open = K.clamp(o.open == null ? 1 : o.open);
  const k = K.clamp(o.intensity == null ? 1 : o.intensity, 0, 2);
  if (open <= 0.002 || k <= 0) return;
  const edge = o.color || "#ffcf7a", core = o.core || "#9be7ff";
  const tilt = o.tilt == null ? 0.18 : o.tilt;
  const R = r * open, ry = R * (1 - tilt);
  K.glow(g, x, y, R * 3.6, edge, 0.28 * k);
  K.glow(g, x, y, R * 1.7, core, 0.3 * k);
  g.save();
  g.translate(x, y);
  g.globalCompositeOperation = "lighter";
  // interior: a deep, slightly cool veil, brighter toward the rim (like looking down a lit tunnel)
  g.save();
  g.scale(1, ry / R);
  const ig = g.createRadialGradient(0, 0, 0, 0, 0, R);
  ig.addColorStop(0, K.rgba("#fff6e0", 0.55 * k));
  ig.addColorStop(0.35, K.rgba(core, 0.32 * k));
  ig.addColorStop(0.8, K.rgba(K.mix(core, edge, 0.6), 0.28 * k));
  ig.addColorStop(1, K.rgba(edge, 0.05 * k));
  g.fillStyle = ig;
  g.beginPath();
  g.arc(0, 0, R, 0, K.TAU);
  g.fill();
  // slow swirl of faint light inside
  g.rotate(t * 0.25);
  for (let i = 0; i < 3; i++) {
    g.strokeStyle = K.rgba("#ffffff", 0.08 * k);
    g.lineWidth = R * 0.12;
    g.beginPath();
    g.arc(0, 0, R * (0.35 + i * 0.18), i * 2.1, i * 2.1 + 2.2);
    g.stroke();
  }
  g.restore();
  // the ring: three strokes (wide soft halo, mid, white-hot core), flickering slightly
  const fl = 0.92 + 0.08 * Math.sin(t * 11.3) * Math.sin(t * 4.1);
  for (const [w, a, c] of [[R * 0.16, 0.18, edge], [R * 0.06, 0.5, edge], [Math.max(1, R * 0.018), 0.95, "#fffaf0"]]) {
    g.strokeStyle = K.rgba(c, a * k * fl);
    g.lineWidth = w;
    g.beginPath();
    g.ellipse(0, 0, R, ry, 0, 0, K.TAU);
    g.stroke();
  }
  // two faint bead-lights orbiting the rim (the "toe-beans", kept tiny)
  for (let i = 0; i < 2; i++) {
    const a = t * 0.5 + i * Math.PI;
    K.glow(g, Math.cos(a) * R, Math.sin(a) * ry, R * 0.09, "#fff4d8", 0.7 * k);
  }
  g.restore();
}

// ---- light helpers --------------------------------------------------------------------------------
// A light's reflection on wet ground: a long soft vertical smear broken into ripple dashes.
export function wetStreak(g, x, y, w, len, color, a = 0.5, t = 0, seed = 1) {
  if (a <= 0.003) return;
  const spr = K.glowSprite(color);
  g.save();
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = a * 0.55;
  g.drawImage(spr, x - w, y - len * 0.1, w * 2, len * 1.2);
  g.globalAlpha = a * 0.35;
  g.drawImage(spr, x - w * 0.35, y - len * 0.05, w * 0.7, len);
  g.fillStyle = color;
  const n = 16;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const yy = y + u * len * 0.9;
    const ww = w * (0.25 + 0.7 * K.hash(i, seed)) * (1 - u * 0.6);
    const off = Math.sin(t * 2.6 + i * 1.9 + seed) * w * 0.12;
    g.globalAlpha = a * (1 - u) * (0.25 + 0.5 * K.hash(i + 0.5, seed));
    g.fillRect(x - ww / 2 + off, yy, ww, Math.max(0.8, len / n * 0.35));
  }
  g.restore();
}

// An elliptical pool of light on the ground (additive).
export function pool(g, x, y, rx, ry, color, a = 0.5) {
  if (a <= 0.003) return;
  g.save();
  g.translate(x, y);
  g.scale(1, ry / rx);
  K.glow(g, 0, 0, rx, color, a);
  g.restore();
}

// Linear vertical gradient fill of a rect.
export function vgrad(g, x, y, w, h, stops) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
}

// A ridge line (hill silhouette) with horizontal parallax offset, filled to `bottom`.
export function ridge(g, o) {
  const y = o.y, amp = o.amp || 30, seed = o.seed || 1, off = o.off || 0, freq = o.freq || 1;
  const x0 = o.x0 == null ? -10 : o.x0, x1 = o.x1 == null ? W0 + 10 : o.x1;
  const bottom = o.bottom == null ? H0 : o.bottom;
  const p = new Path2D();
  p.moveTo(x0, bottom);
  for (let x = x0; x <= x1 + 8; x += 8) {
    const n = K.fbm(((x + off) / 300) * freq + seed * 7.3, seed);
    const bump = o.bump ? o.bump(x) : 0;
    p.lineTo(x, y - amp * (0.5 + 0.5 * n) - bump);
  }
  p.lineTo(x1 + 8, bottom);
  p.closePath();
  if (o.fill) g.fillStyle = o.fill;
  else {
    const gr = g.createLinearGradient(0, y - amp, 0, bottom);
    gr.addColorStop(0, o.top || K.shade(o.color, 0.1));
    gr.addColorStop(Math.min(0.9, (o.mid == null ? 0.3 : o.mid)), o.color);
    gr.addColorStop(1, o.base || K.shade(o.color, -0.3));
    g.fillStyle = gr;
  }
  g.fill(p);
  if (o.rim) {
    g.save();
    g.strokeStyle = o.rim;
    g.lineWidth = o.rimW || 1.2;
    g.globalAlpha *= o.rimA == null ? 0.6 : o.rimA;
    g.globalCompositeOperation = "lighter";
    g.beginPath();
    for (let x = x0; x <= x1 + 8; x += 8) {
      const n = K.fbm(((x + off) / 300) * freq + seed * 7.3, seed);
      const bump = o.bump ? o.bump(x) : 0;
      const yy = y - amp * (0.5 + 0.5 * n) - bump;
      if (x === x0) g.moveTo(x, yy); else g.lineTo(x, yy);
    }
    g.stroke();
    g.restore();
  }
  return p;
}
export function ridgeY(x, o) {
  const n = K.fbm(((x + (o.off || 0)) / 300) * (o.freq || 1) + (o.seed || 1) * 7.3, o.seed || 1);
  return o.y - (o.amp || 30) * (0.5 + 0.5 * n) - (o.bump ? o.bump(x) : 0);
}

// ---- meadow pieces --------------------------------------------------------------------------------
// windmill(g, x, y, s, t, {body, blade, light, haze, hazeAmt}) - x, y = base; ~120*s tall.
export function windmill(g, x, y, s, t, o = {}) {
  const hz = o.haze, ha = o.hazeAmt || 0;
  const col = (c) => (hz ? K.mix(c, hz, ha) : c);
  const body = col(o.body || "#d9cdb8"), dark = col(K.shade(o.body || "#d9cdb8", -0.35));
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  const gr = g.createLinearGradient(-14, 0, 14, 0);
  gr.addColorStop(0, o.lightLeft ? body : dark);
  gr.addColorStop(1, o.lightLeft ? dark : body);
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(-15, 0);
  g.lineTo(-8, -92);
  g.lineTo(8, -92);
  g.lineTo(15, 0);
  g.closePath();
  g.fill();
  g.fillStyle = col("#5a3a2c");
  g.beginPath();
  g.moveTo(-11, -90);
  g.quadraticCurveTo(0, -112, 11, -90);
  g.closePath();
  g.fill();
  g.fillStyle = col("#3a2a20");
  g.fillRect(-3.5, -24, 7, 24);
  // blades
  const a0 = t * (o.speed == null ? 0.55 : o.speed);
  g.translate(0, -96);
  for (let i = 0; i < 4; i++) {
    g.save();
    g.rotate(a0 + i * Math.PI / 2);
    g.fillStyle = col(o.blade || "#efe7da");
    g.globalAlpha *= 0.92;
    g.fillRect(3, -2.4, 62, 1.6);
    g.fillRect(14, -1, 50, 9);
    g.strokeStyle = col("#7a6a5a");
    g.lineWidth = 0.6;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(14 + k * 12, -1); g.lineTo(14 + k * 12, 8); g.stroke(); }
    g.restore();
  }
  g.fillStyle = col("#2a2018");
  g.beginPath();
  g.arc(0, 0, 3.4, 0, K.TAU);
  g.fill();
  g.restore();
}

// barn(g, x, y, s, {haze, hazeAmt, sunLeft}) - a red barn, x, y = bottom centre, ~110*s wide.
export function barn(g, x, y, s, o = {}) {
  const hz = o.haze, ha = o.hazeAmt || 0;
  const col = (c) => (hz ? K.mix(c, hz, ha) : c);
  const key = "barn:" + (hz || "") + ":" + ha.toFixed(2) + ":" + (o.sunLeft ? 1 : 0);
  const spr = K.sprite(key, 200, 130, (b) => {
    // side wall (in perspective) + gable end
    const red = col("#a8322e"), redD = col("#6e1d1c"), roof = col("#4a3a36"), trim = col("#efe6d8");
    b.fillStyle = o.sunLeft ? redD : col("#8a2724");
    b.beginPath();
    b.moveTo(92, 124); b.lineTo(92, 64); b.lineTo(190, 70); b.lineTo(190, 124); b.closePath(); b.fill();
    b.fillStyle = roof;
    b.beginPath();
    b.moveTo(88, 66); b.lineTo(52, 22); b.lineTo(160, 26); b.lineTo(194, 72); b.closePath(); b.fill();
    b.fillStyle = "rgba(255,255,255,0.08)";
    b.beginPath(); b.moveTo(88, 66); b.lineTo(52, 22); b.lineTo(160, 26); b.lineTo(170, 40); b.closePath(); b.fill();
    const gr = b.createLinearGradient(12, 0, 92, 0);
    gr.addColorStop(0, o.sunLeft ? K.shade(red, 0.15) : redD);
    gr.addColorStop(1, o.sunLeft ? red : K.shade(red, -0.1));
    b.fillStyle = gr;
    b.beginPath();
    b.moveTo(12, 124); b.lineTo(12, 64); b.lineTo(52, 24); b.lineTo(92, 64); b.lineTo(92, 124); b.closePath(); b.fill();
    b.strokeStyle = rgbaS(redD, 0.5);
    b.lineWidth = 0.8;
    for (let xx = 16; xx < 92; xx += 5) { b.beginPath(); b.moveTo(xx, 124); b.lineTo(xx, Math.max(64 - (xx < 52 ? (xx - 12) : (92 - xx)), 28)); b.stroke(); }
    b.strokeStyle = trim;
    b.lineWidth = 2.2;
    b.strokeRect(34, 82, 36, 42);
    b.beginPath(); b.moveTo(34, 82); b.lineTo(70, 124); b.moveTo(70, 82); b.lineTo(34, 124); b.stroke();
    b.strokeRect(45, 50, 14, 14);
    b.beginPath(); b.moveTo(12, 64); b.lineTo(52, 24); b.lineTo(92, 64); b.stroke();
  });
  g.drawImage(spr, x - 100 * s, y - 124 * s, 200 * s, 130 * s);
}
function rgbaS(c, a) { return K.rgba(c, a); }

// rainbowArch(g, x, y, r, {alpha}) - the meadow's welcome arch (a rainbow-banded wooden arch).
export function rainbowArch(g, x, y, r, o = {}) {
  const cols = ["#e8503a", "#f29a2e", "#f2d43a", "#6cc24a", "#3a8fd8", "#7a5ac8"];
  const a = o.alpha == null ? 1 : o.alpha;
  g.save();
  g.globalAlpha *= a;
  const bw = r * 0.07;
  cols.forEach((c, i) => {
    g.strokeStyle = o.haze ? K.mix(c, o.haze, o.hazeAmt || 0) : c;
    g.lineWidth = bw;
    g.beginPath();
    g.arc(x, y, r - i * bw, Math.PI, K.TAU);
    g.stroke();
  });
  const post = o.haze ? K.mix("#8a6a4a", o.haze, o.hazeAmt || 0) : "#8a6a4a";
  g.fillStyle = post;
  g.fillRect(x - r - bw * 0.5, y - 2, bw * 1.2, r * 0.35);
  g.fillRect(x + r - bw * 5.5, y - 2, bw * 1.2, r * 0.35);
  g.restore();
}

// blossomTree(g, x, y, s, t, {seed, bloom, trunk, haze, hazeAmt, light}) - cherry tree, ~260*s tall.
export function blossomTree(g, x, y, s, t, o = {}) {
  const seed = o.seed || 1;
  const bloom = o.bloom || "#f7c3d3";
  const key = "blossom:" + seed + ":" + bloom + ":" + (o.haze || "") + ":" + (o.hazeAmt || 0) + ":" + (o.lightLeft ? 1 : 0);
  const spr = K.sprite(key, 300, 280, (b) => {
    const R = K.rng("bt" + seed);
    const hz = (c) => (o.haze ? K.mix(c, o.haze, o.hazeAmt || 0) : c);
    const trunk = hz(o.trunk || "#3a2a26");
    const tips = [];
    const branch = (bx, by, ang, len, wid, d) => {
      const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
      b.strokeStyle = trunk;
      b.lineCap = "round";
      b.lineWidth = wid;
      b.beginPath();
      b.moveTo(bx, by);
      b.quadraticCurveTo((bx + ex) / 2 + (R() - 0.5) * len * 0.3, (by + ey) / 2, ex, ey);
      b.stroke();
      if (d >= 4) { tips.push([ex, ey]); return; }
      const k = 2 + (R() > 0.55 ? 1 : 0);
      for (let i = 0; i < k; i++) branch(ex, ey, ang + (i - (k - 1) / 2) * 0.62 + (R() - 0.5) * 0.4, len * 0.7, wid * 0.62, d + 1);
    };
    branch(150, 276, -Math.PI / 2 + (R() - 0.5) * 0.2, 78, 15, 0);
    const lightL = !!o.lightLeft;
    for (const pass of [0, 1, 2]) {
      for (const [tx, ty] of tips) {
        const n = pass === 2 ? 3 : 5;
        for (let i = 0; i < n; i++) {
          const r = (14 + R() * 18) * (pass === 0 ? 1.15 : pass === 1 ? 0.95 : 0.55);
          const cx = Math.min(300 - r, Math.max(r, tx + (R() - 0.5) * 34 + (pass === 2 ? (lightL ? -8 : 8) : 0)));
          const cy = Math.max(r, ty + (R() - 0.5) * 26 - (pass === 2 ? 8 : 0));
          const c = pass === 0 ? K.shade(bloom, -0.32) : pass === 1 ? bloom : K.mix(bloom, "#fff4f6", 0.55);
          const gr = b.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
          gr.addColorStop(0, hz(c));
          gr.addColorStop(0.75, K.rgba(hz(c), 0.8));
          gr.addColorStop(1, K.rgba(hz(c), 0));
          b.fillStyle = gr;
          b.beginPath();
          b.arc(cx, cy, r, 0, K.TAU);
          b.fill();
        }
      }
    }
    b.fillStyle = K.rgba(hz("#fff6f8"), 0.7);
    for (let i = 0; i < 500; i++) {
      const [tx, ty] = tips[Math.floor(R() * tips.length)];
      b.fillRect(tx + (R() - 0.5) * 60, ty + (R() - 0.5) * 44, 1.4, 1.4);
    }
  });
  const sway = Math.sin(t * 0.7 + seed) * 0.01;
  g.save();
  g.translate(x, y);
  g.rotate(sway);
  g.drawImage(spr, -150 * s, -276 * s, 300 * s, 280 * s);
  g.restore();
}

// petals(g, t, {seed, count, area:[x,y,w,h], color, wind}) - drifting cherry petals.
export function petals(g, t, o = {}) {
  const seed = o.seed || 3, n = o.count || 30;
  const [ax, ay, aw, ah] = o.area || [0, 0, W0, H0];
  const wind = o.wind == null ? 1 : o.wind;
  g.save();
  for (let i = 0; i < n; i++) {
    const sp = (18 + K.hash(i, seed) * 30) * wind;
    const x = ax + (((K.hash(i + 0.1, seed) * aw + t * sp) % aw) + aw) % aw;
    const y = ay + (((K.hash(i + 0.2, seed) * ah + t * (10 + K.hash(i + 0.3, seed) * 14)) % ah) + ah) % ah + Math.sin(t * 1.3 + i) * 6;
    const a = t * (1.5 + K.hash(i + 0.4, seed) * 2) + i;
    const s = (o.size || 2.6) * (0.6 + K.hash(i + 0.5, seed) * 0.8);
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.scale(1, 0.35 + 0.65 * Math.abs(Math.sin(a * 1.7)));
    g.fillStyle = o.color || (i % 3 ? "#f9cfdc" : "#fde6ee");
    g.globalAlpha = o.alpha == null ? 0.85 : o.alpha;
    g.beginPath();
    g.ellipse(0, 0, s, s * 0.62, 0, 0, K.TAU);
    g.fill();
    g.restore();
  }
  g.restore();
}

// butterflies(g, t, {seed, count, area, colors})
export function butterflies(g, t, o = {}) {
  const seed = o.seed || 8, n = o.count || 4;
  const [ax, ay, aw, ah] = o.area || [0, 200, W0, 200];
  const cols = o.colors || ["#ffd24a", "#ffffff", "#ff9a5a", "#9ad0ff"];
  for (let i = 0; i < n; i++) {
    const x = ax + aw * (0.5 + 0.5 * K.noise(t * 0.22 + i * 5.1, seed));
    const y = ay + ah * (0.5 + 0.5 * K.noise(t * 0.3 + i * 2.7, seed + 2));
    const flap = Math.abs(Math.sin(t * 14 + i * 2));
    const s = (o.size || 4) * (0.8 + K.hash(i, seed) * 0.4);
    g.save();
    g.translate(x, y);
    g.fillStyle = cols[i % cols.length];
    g.globalAlpha = 0.9;
    g.beginPath();
    g.ellipse(-s * 0.55 * flap, 0, s * 0.6 * flap + 0.4, s * 0.5, -0.4, 0, K.TAU);
    g.ellipse(s * 0.55 * flap, 0, s * 0.6 * flap + 0.4, s * 0.5, 0.4, 0, K.TAU);
    g.fill();
    g.fillStyle = "#2a2018";
    g.fillRect(-0.4, -s * 0.4, 0.8, s * 0.8);
    g.restore();
  }
}

// dew(g, t, x0, x1, y0, y1, {seed, count, color}) - tiny twinkling sparkles on wet grass.
export function dew(g, t, x0, x1, y0, y1, o = {}) {
  const seed = o.seed || 4, n = o.count || 120;
  const spr = K.glowSprite(o.color || "#ffffff");
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const u = K.hash(i, seed), v = Math.pow(K.hash(i + 0.5, seed), 0.8);
    const x = K.lerp(x0, x1, u), y = K.lerp(y0, y1, v);
    const tw = Math.max(0, Math.sin(t * (1.5 + K.hash(i + 0.2, seed) * 3) + i * 2.1));
    const s = (0.6 + v * 2.2) * (0.6 + tw * 0.8);
    g.globalAlpha = 0.25 + tw * 0.75;
    g.drawImage(spr, x - s * 2, y - s * 2, s * 4, s * 4);
    if (tw > 0.85 && v > 0.4) {
      g.globalAlpha = (tw - 0.85) * 5;
      g.fillStyle = "#ffffff";
      g.fillRect(x - s * 2.2, y - 0.3, s * 4.4, 0.6);
      g.fillRect(x - 0.3, y - s * 2.2, 0.6, s * 4.4);
    }
  }
  g.restore();
}

// ---- Cat Plaza --------------------------------------------------------------------------------------
export const ZONE_GLOW = ["#78d25a", "#e6b478", "#a07ad8", "#ff7a3a", "#6a5ad0", "#ff6ad5", "#fff2c8"];
// weathered orange/ochre sandstone: low saturation, matte (no fur strokes: drawn with lod 0)
const STATUE_COAT = {
  base: "#b8875a", light: "#d6b086", dark: "#7a5536", stripe: "#5e3c24", tip: "#5a3a22",
  belly: "#cfb48e", white: "#d4c4a8", nose: "#a07a5c", noseEdge: "#6a4c36", innerEar: "#9a7656",
  iris: "#a88560", irisInner: "#b0906a", liner: "#4a3424",
  pattern: "mackerel", bib: true, socks: "front", muzzle: true, stripeAlpha: 0.62, bentEar: false,
};
export { STATUE_COAT };

// stoneify(canvas, seed, o) - turn whatever is painted on a sprite canvas into carved sandstone,
// in place (one-time cost): desaturate, matte grain + sediment bands, chipped outline, hairline
// cracks, moss low down, and a hard key light from o.lightX side (-1 left, 1 right).
export function stoneify(c, seed, o = {}) {
  const w = c.width, h = c.height;
  const g = c.getContext("2d");
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  const mask = K.makeCanvas(w, h);
  const m = mask.getContext("2d");
  m.drawImage(c, 0, 0);
  const R = K.rng("stone-" + seed);
  // 1) desaturate + flatten toward a sandstone tone
  g.globalCompositeOperation = "saturation";
  g.fillStyle = K.rgba("#808080", o.desat == null ? 0.3 : o.desat);
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "color";
  g.fillStyle = K.rgba("#c8905a", 0.22);
  g.fillRect(0, 0, w, h);
  // 2) grain, mottling, sediment bands
  g.globalCompositeOperation = "source-atop";
  const px = Math.max(1, w / 260);
  for (let i = 0; i < 45; i++) {
    g.fillStyle = R() > 0.5 ? "rgba(255,240,215,0.07)" : "rgba(60,40,22,0.09)";
    g.beginPath(); g.ellipse(R() * w, R() * h, (10 + R() * 30) * px, (6 + R() * 16) * px, R() * 3, 0, K.TAU); g.fill();
  }
  const gp = Math.min(px, 1.6);
  for (let i = 0; i < Math.round(w * h / (70 * gp * gp)); i++) {
    g.fillStyle = R() > 0.5 ? "rgba(255,246,228,0.11)" : "rgba(52,34,20,0.13)";
    const z = (0.7 + R() * 1.2) * gp;
    g.fillRect(R() * w, R() * h, z, z);
  }
  g.strokeStyle = "rgba(70,48,28,0.07)";
  g.lineWidth = 1.2 * px;
  for (let y = 6 * px; y < h; y += (7 + R() * 9) * px) {
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= w; x += 20 * px) g.lineTo(x, y + Math.sin(x * 0.02 / px + y) * 1.5 * px);
    g.stroke();
  }
  // 3) hard key light: lit side warm, far side cool and dark (matte, no sheen)
  const lx = o.lightX == null ? -1 : o.lightX;
  const kg = g.createLinearGradient(lx < 0 ? 0 : w, 0, lx < 0 ? w : 0, 0);
  kg.addColorStop(0, "rgba(255,232,196,0.16)");
  kg.addColorStop(0.5, "rgba(0,0,0,0)");
  kg.addColorStop(1, "rgba(40,36,70,0.32)");
  g.fillStyle = kg;
  g.fillRect(0, 0, w, h);
  // 4) cracks
  g.strokeStyle = "rgba(40,26,14,0.55)";
  g.lineWidth = 0.9 * px;
  for (let i = 0; i < (o.cracks || 9); i++) {
    let x = w * (0.2 + R() * 0.6), y = h * (0.1 + R() * 0.75);
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 10 * px; y += (3 + R() * 9) * px; g.lineTo(x, y); }
    g.stroke();
  }
  // 5) moss / lichen low down and in crevices
  for (let i = 0; i < 70; i++) {
    const y = h * (0.55 + Math.pow(R(), 0.6) * 0.45);
    g.fillStyle = R() > 0.5 ? "rgba(98,118,64,0.3)" : "rgba(150,160,110,0.22)";
    g.beginPath(); g.ellipse(R() * w, y, (2 + R() * 6) * gp, (1 + R() * 3) * gp, R() * 3, 0, K.TAU); g.fill();
  }
  // 6) chips along the outline. No pixel read-back (getImageData stalls the GPU canvas): the edge
  // band is mask minus an eroded copy of the mask (eroded by intersecting shifted copies); random
  // bites are kept only inside that band and cut out of the stone.
  const er = K.makeCanvas(w, h), eg2 = er.getContext("2d");
  eg2.drawImage(mask, 0, 0);
  eg2.globalCompositeOperation = "destination-in";
  const dd = 3 * Math.min(px, 2);
  for (const [ox, oy] of [[dd, 0], [-dd, 0], [0, dd], [0, -dd]]) eg2.drawImage(mask, ox, oy);
  const chipC = K.makeCanvas(w, h), cc = chipC.getContext("2d");
  const bite = (ctx, x, y, r) => {
    ctx.beginPath();
    const n = 5 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * K.TAU, rr = r * (0.55 + R() * 0.6);
      if (k) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8); else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8);
    }
    ctx.closePath();
    ctx.fill();
  };
  cc.fillStyle = "#000";
  const nb = (o.chips || 14) * 14;
  for (let i = 0; i < nb; i++) bite(cc, R() * w, R() * h, (1.5 + R() * 4) * Math.min(px, 2));
  cc.globalCompositeOperation = "destination-in";
  cc.drawImage(mask, 0, 0);
  cc.globalCompositeOperation = "destination-out";
  cc.drawImage(er, 0, 0);
  g.globalCompositeOperation = "destination-out";
  g.drawImage(chipC, 0, 0);
  // keep the original silhouette alpha (blend modes above can bleed into transparent pixels)
  g.globalCompositeOperation = "destination-in";
  m.globalCompositeOperation = "destination-out";
  m.drawImage(chipC, 0, 0);
  g.drawImage(mask, 0, 0);
  g.restore();
}

// The statue of Sir Whiskers the First on his pedestal, painted once. Returns the sprite and
// its anchor; base of the pedestal at (0, 0) in sprite units (sprite is 260 x 400, anchor 130,396).
export function statueSprite() {
  return K.sprite("lib012-statue", 260, 400, (s) => {
    // pedestal
    const px = 130, base = 396;
    const pg = s.createLinearGradient(px - 70, 0, px + 70, 0);
    pg.addColorStop(0, "#e9dccb");
    pg.addColorStop(0.55, "#cbbca8");
    pg.addColorStop(1, "#8f8272");
    s.fillStyle = pg;
    s.fillRect(px - 62, base - 96, 124, 96);
    s.fillStyle = "#efe4d4";
    s.fillRect(px - 72, base - 108, 144, 14);
    s.fillRect(px - 72, base - 14, 144, 14);
    s.fillStyle = "rgba(60,40,20,0.25)";
    s.fillRect(px - 72, base - 95, 144, 4);
    // plaque
    s.fillStyle = "#b08a4a";
    s.fillRect(px - 38, base - 74, 76, 34);
    s.fillStyle = "#e3c37a";
    s.fillRect(px - 36, base - 72, 72, 30);
    s.fillStyle = "rgba(70,45,10,0.7)";
    for (let i = 0; i < 3; i++) s.fillRect(px - 26 + (i === 2 ? 10 : 0), base - 66 + i * 8, i === 2 ? 32 : 52, 2.2);
    // the statue: a carved sandstone cat (no fur strokes, no whiskers, blank carved eyes), looking
    // left toward the Cozy Meadow portal; painted on its own canvas and turned to stone
    const PXS = K.pixelScale();
    const cv = K.makeCanvas(260 * PXS, 300 * PXS);
    const cg = cv.getContext("2d");
    cg.setTransform(PXS, 0, 0, PXS, 0, 0);
    K.drawCat(cg, px, base - 106, 96, {
      pose: "sit", facing: -1, headTurn: 0.5, gaze: 0, blink: 0.45, t: 0, coat: STATUE_COAT, lod: 0,
      collar: false, bell: false, shadow: false, pupil: 0.5, tail: 0,
      light: { x: px - 260, y: base - 420, color: "#fff0d8", strength: 0.35 },
    });
    // ambient occlusion under the chin and where the haunch meets the chest
    cg.save();
    cg.globalCompositeOperation = "source-atop";
    const ao = (x, y, r, a) => { const gr = cg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(30,18,8,${a})`); gr.addColorStop(1, "rgba(30,18,8,0)"); cg.fillStyle = gr; cg.fillRect(x - r, y - r, r * 2, r * 2); };
    ao(px - 30, base - 106 - 100, 34, 0.55);
    ao(px - 10, base - 106 - 40, 30, 0.3);
    ao(px, base - 108, 60, 0.35);
    cg.restore();
    stoneify(cv, "statue", { lightX: -1, chips: 22, cracks: 6, desat: 0.18 });
    s.drawImage(cv, 0, 0, 260, 300);
    // contact shadow where he sits on the pedestal
    s.fillStyle = "rgba(40,26,14,0.35)";
    s.beginPath(); s.ellipse(px - 4, base - 107, 58, 4, 0, 0, K.TAU); s.fill();
  });
}

// statueHeadSprite() - Sir Whiskers' carved head, close up (a dedicated painting: symmetrical
// three-quarter view looking to the viewer's LEFT, two straight solid ears, carved stripe grooves,
// blank carved eyes, moss and cracks, hard sunlight from the upper left, deep AO under the chin).
// 900 x 900 sprite, head centre at (450, 470).
export function statueHeadSprite() {
  return K.sprite("lib012-statue-head", 900, 900, (s) => {
    const PXS = K.pixelScale();
    const cv = K.makeCanvas(900 * PXS, 900 * PXS);
    const g = cv.getContext("2d");
    g.setTransform(PXS, 0, 0, PXS, 0, 0);
    const cx = 450, cy = 470;
    const stone = "#bf8e60", lit = "#e2bd92", deep = "#6e4a2e", groove = "#5a3a22";
    // neck + chest block running out of frame (shaded)
    const neck = new Path2D();
    neck.moveTo(cx - 250, 900); neck.bezierCurveTo(cx - 240, 700, cx - 200, 640, cx - 120, 620);
    neck.lineTo(cx + 170, 620); neck.bezierCurveTo(cx + 260, 660, cx + 300, 760, cx + 320, 900); neck.closePath();
    let gr = g.createLinearGradient(cx - 260, 0, cx + 320, 0);
    gr.addColorStop(0, K.mix(stone, lit, 0.3)); gr.addColorStop(0.6, stone); gr.addColorStop(1, deep);
    g.fillStyle = gr; g.fill(neck);
    // ears (behind the skull), solid and straight; the far (right) ear foreshortened
    const ear = (bx, by, tx, ty, w, shadeK) => {
      const p = new Path2D();
      p.moveTo(bx - w, by); p.quadraticCurveTo(bx - w * 0.7, (by + ty) / 2, tx, ty);
      p.quadraticCurveTo(bx + w * 0.75, (by + ty) / 2 + 10, bx + w, by + 12); p.closePath();
      const eg = g.createLinearGradient(bx - w, ty, bx + w, by);
      eg.addColorStop(0, K.mix(lit, stone, shadeK)); eg.addColorStop(1, K.mix(stone, deep, 0.4 + shadeK * 0.4));
      g.fillStyle = eg; g.fill(p);
      // carved inner ear hollow
      const q = new Path2D();
      q.moveTo(bx - w * 0.5, by + 2); q.quadraticCurveTo(bx - w * 0.35, (by + ty) / 2 + 8, tx + (bx - tx) * 0.18, ty + 34);
      q.quadraticCurveTo(bx + w * 0.4, (by + ty) / 2 + 20, bx + w * 0.55, by + 10); q.closePath();
      g.fillStyle = K.rgba(deep, 0.75); g.fill(q);
    };
    ear(cx - 170, cy - 150, cx - 215, cy - 375, 95, 0.1);
    ear(cx + 120, cy - 170, cx + 150, cy - 365, 80, 0.55);
    // skull + cheeks: a broad 3/4 head mass, muzzle offset to the left (he looks left)
    const head = new Path2D();
    K.spline(head, [cx - 40, cy - 250, cx + 120, cy - 220, cx + 220, cy - 120, cx + 245, cy + 10, cx + 200, cy + 130, cx + 90, cy + 200,
      cx - 60, cy + 215, cx - 200, cy + 170, cx - 285, cy + 70, cx - 290, cy - 60, cx - 230, cy - 190], true, 1);
    gr = g.createRadialGradient(cx - 150, cy - 140, 30, cx - 40, cy - 10, 330);
    gr.addColorStop(0, lit); gr.addColorStop(0.45, stone); gr.addColorStop(1, deep);
    g.fillStyle = gr; g.fill(head);
    g.save();
    g.clip(head);
    // carved stripe grooves: forehead "M" and cheek swirls, as inset strokes (dark groove + lit lower lip)
    const grooveLine = (pts, wd) => {
      for (const [dx, dy, c, a, ww] of [[0, 0, groove, 0.75, wd], [0, wd * 0.45, lit, 0.35, wd * 0.35]]) {
        g.strokeStyle = K.rgba(c, a); g.lineWidth = ww; g.lineCap = "round";
        g.beginPath(); g.moveTo(pts[0] + dx, pts[1] + dy);
        for (let i = 2; i < pts.length; i += 4) g.quadraticCurveTo(pts[i] + dx, pts[i + 1] + dy, pts[i + 2] + dx, pts[i + 3] + dy);
        g.stroke();
      }
    };
    grooveLine([cx - 150, cy - 110, cx - 135, cy - 175, cx - 115, cy - 215], 11);
    grooveLine([cx - 95, cy - 120, cx - 85, cy - 190, cx - 70, cy - 235], 12);
    grooveLine([cx - 40, cy - 115, cx - 35, cy - 185, cx - 20, cy - 240], 12);
    grooveLine([cx + 15, cy - 120, cx + 25, cy - 180, cx + 45, cy - 225], 10);
    grooveLine([cx + 140, cy - 60, cx + 175, cy - 70, cx + 205, cy - 40], 10);
    grooveLine([cx + 130, cy - 10, cx + 180, cy - 10, cx + 220, cy + 30], 10);
    grooveLine([cx + 110, cy + 60, cx + 160, cy + 70, cx + 190, cy + 110], 9);
    grooveLine([cx - 250, cy + 10, cx - 230, cy - 20, cx - 200, cy - 20], 8);
    // shadow side (right) and sunlit planes
    gr = g.createLinearGradient(cx - 300, 0, cx + 260, 0);
    gr.addColorStop(0, "rgba(255,236,200,0.18)"); gr.addColorStop(0.55, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(30,24,60,0.38)");
    g.fillStyle = gr; g.fillRect(cx - 320, cy - 300, 600, 560);
    g.restore();
    // eyes: carved almond hollows with a raised blank eyeball (no iris, no shine)
    const eye = (ex, ey, rx, ry, rot, sh) => {
      g.save(); g.translate(ex, ey); g.rotate(rot);
      // soft socket shadow (the brow overhangs it: darker on top)
      const so = g.createRadialGradient(0, -ry * 0.35, ry * 0.3, 0, 0, rx * 1.7);
      so.addColorStop(0, K.rgba(deep, 0.75)); so.addColorStop(0.6, K.rgba(deep, 0.35)); so.addColorStop(1, K.rgba(deep, 0));
      g.fillStyle = so;
      g.beginPath(); g.ellipse(0, 0, rx * 1.7, ry * 1.9, 0, 0, K.TAU); g.fill();
      // the blank almond eyeball, sunlit from the upper left
      const al = new Path2D();
      al.moveTo(-rx, ry * 0.15); al.quadraticCurveTo(-rx * 0.1, -ry * 1.15, rx, -ry * 0.1); al.quadraticCurveTo(rx * 0.1, ry * 1.05, -rx, ry * 0.15); al.closePath();
      const eg2 = g.createLinearGradient(-rx, -ry, rx * 0.6, ry);
      eg2.addColorStop(0, K.mix(lit, "#f2dcbc", 0.3 * (1 - sh))); eg2.addColorStop(1, K.mix(stone, deep, 0.25 + sh * 0.35));
      g.fillStyle = eg2; g.fill(al);
      // carved upper lid line + a faint lower lid
      g.strokeStyle = K.rgba(groove, 0.85); g.lineWidth = 4; g.lineCap = "round";
      g.beginPath(); g.moveTo(-rx * 1.05, ry * 0.12); g.quadraticCurveTo(-rx * 0.1, -ry * 1.2, rx * 1.05, -ry * 0.12); g.stroke();
      g.strokeStyle = K.rgba(groove, 0.35); g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(-rx * 0.8, ry * 0.35); g.quadraticCurveTo(rx * 0.1, ry * 1.0, rx * 0.9, ry * 0.05); g.stroke();
      g.restore();
    };
    eye(cx - 190, cy - 40, 46, 26, -0.18, 0.1);
    eye(cx + 20, cy - 50, 40, 24, 0.12, 0.45);
    // muzzle: rounded whisker pads, carved nose, mouth groove, chin
    const muz = new Path2D();
    K.spline(muz, [cx - 230, cy + 40, cx - 150, cy + 10, cx - 70, cy + 40, cx - 50, cy + 110, cx - 110, cy + 160, cx - 200, cy + 160, cx - 260, cy + 110], true, 1);
    gr = g.createRadialGradient(cx - 175, cy + 60, 10, cx - 150, cy + 90, 120);
    gr.addColorStop(0, K.mix(lit, "#efdcc0", 0.3)); gr.addColorStop(1, stone);
    g.fillStyle = gr; g.fill(muz);
    g.fillStyle = K.rgba(deep, 0.9);
    g.beginPath(); g.moveTo(cx - 200, cy + 38); g.quadraticCurveTo(cx - 160, cy + 26, cx - 130, cy + 40); g.quadraticCurveTo(cx - 150, cy + 76, cx - 168, cy + 82); g.quadraticCurveTo(cx - 190, cy + 70, cx - 200, cy + 38); g.fill();
    g.strokeStyle = K.rgba(groove, 0.55); g.lineWidth = 4; g.lineCap = "round";
    g.beginPath(); g.moveTo(cx - 168, cy + 84); g.lineTo(cx - 170, cy + 106); g.quadraticCurveTo(cx - 188, cy + 120, cx - 206, cy + 118);
    g.moveTo(cx - 170, cy + 106); g.quadraticCurveTo(cx - 152, cy + 120, cx - 134, cy + 116); g.stroke();
    // the chin, a separate rounded mass below the mouth, in shadow
    g.fillStyle = K.rgba(deep, 0.35);
    g.beginPath(); g.ellipse(cx - 165, cy + 150, 52, 22, 0, 0, K.TAU); g.fill();
    // AO under the chin (hard sun from the upper left)
    g.save();
    g.clip(neck);
    const ao = g.createRadialGradient(cx - 80, cy + 210, 10, cx - 60, cy + 230, 260);
    ao.addColorStop(0, "rgba(28,16,8,0.82)"); ao.addColorStop(0.5, "rgba(28,16,8,0.45)"); ao.addColorStop(1, "rgba(28,16,8,0)");
    g.fillStyle = ao; g.fillRect(cx - 360, cy + 100, 760, 400);
    g.restore();
    // a crisp sunlit edge along the upper-left contour
    g.save();
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = "rgba(255,226,180,0.28)"; g.lineWidth = 6;
    g.beginPath(); g.moveTo(cx - 285, cy + 40); g.quadraticCurveTo(cx - 300, cy - 140, cx - 40, cy - 250); g.stroke();
    g.restore();
    stoneify(cv, "statue-head", { lightX: -1, chips: 40, cracks: 10, desat: 0.12 });
    s.drawImage(cv, 0, 0, 900, 900);
  });
}

// portalArch(g, x, y, h, color, t, {haze, hazeAmt, glow}) - a stone portal arch (pillars, capitals,
// voussoirs, plinth) holding a glowing veil in the zone's colour. x, y = bottom centre, h = height.
export function portalArch(g, x, y, h, color, t, o = {}) {
  const w = h * 0.7, hz = o.haze, ha = o.hazeAmt || 0;
  const col = (c) => (hz ? K.mix(c, hz, ha) : c);
  const gA = o.glow == null ? 1 : o.glow;
  const iw = w * 0.34, pw = w * 0.15, top = y - h + iw;
  const veil = new Path2D();
  veil.moveTo(x - iw, y);
  veil.lineTo(x - iw, top);
  veil.arc(x, top, iw, Math.PI, K.TAU);
  veil.lineTo(x + iw, y);
  veil.closePath();
  const vg = g.createLinearGradient(0, y - h, 0, y);
  vg.addColorStop(0, K.rgba(K.mix(color, "#ffffff", 0.55), 0.95 * gA));
  vg.addColorStop(0.5, K.rgba(color, 0.85 * gA));
  vg.addColorStop(1, K.rgba(K.shade(color, -0.2), 0.8 * gA));
  g.fillStyle = vg;
  g.fill(veil);
  g.save();
  g.clip(veil);
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 4; i++) {
    const yy = y - ((t * 16 + (i * h) / 4) % h);
    K.glow(g, x + Math.sin(t * 0.8 + i * 2) * iw * 0.5, yy, iw * 0.9, "#ffffff", 0.22 * gA);
  }
  g.strokeStyle = K.rgba("#ffffff", 0.25 * gA);
  g.lineWidth = Math.max(0.6, iw * 0.06);
  for (let i = 0; i < 3; i++) {
    const a0 = t * (0.6 + i * 0.2) + i * 2;
    g.beginPath();
    g.ellipse(x, y - h * 0.42, iw * (0.3 + i * 0.25), iw * (0.5 + i * 0.4), 0, a0, a0 + 2.2);
    g.stroke();
  }
  g.restore();
  K.glow(g, x, y - h * 0.4, h * 0.85, color, 0.3 * gA);
  const stone = col("#e2d6c6"), stoneD = col("#a99a88"), stoneDD = col("#7d6f60");
  for (const side of [-1, 1]) {
    const px = side < 0 ? x - iw - pw : x + iw;
    const pg = g.createLinearGradient(px, 0, px + pw, 0);
    pg.addColorStop(0, side < 0 ? stone : stoneD);
    pg.addColorStop(1, side < 0 ? stoneD : stoneDD);
    g.fillStyle = pg;
    g.fillRect(px, top - 1, pw, y - top + 1);
    g.fillStyle = stone;
    g.fillRect(px - pw * 0.15, top - pw * 0.3, pw * 1.3, pw * 0.3);
    g.fillRect(px - pw * 0.2, y - pw * 0.4, pw * 1.4, pw * 0.4);
    g.fillStyle = K.rgba(stoneDD, 0.5);
    g.fillRect(px - pw * 0.15, top, pw * 1.3, pw * 0.08);
  }
  g.lineWidth = pw;
  g.strokeStyle = stone;
  g.beginPath();
  g.arc(x, top, iw + pw / 2, Math.PI, K.TAU);
  g.stroke();
  g.strokeStyle = K.rgba(stoneDD, 0.55);
  g.lineWidth = Math.max(0.6, pw * 0.06);
  for (let k = 1; k < 9; k++) {
    const a = Math.PI + (k / 9) * Math.PI;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * iw, top + Math.sin(a) * iw);
    g.lineTo(x + Math.cos(a) * (iw + pw), top + Math.sin(a) * (iw + pw));
    g.stroke();
  }
  g.strokeStyle = K.rgba(stoneDD, 0.6);
  g.lineWidth = Math.max(0.8, pw * 0.12);
  g.beginPath();
  g.arc(x, top, iw + pw * 0.06, Math.PI, K.TAU);
  g.stroke();
  g.fillStyle = stone;
  g.fillRect(x - pw * 0.42, top - iw - pw * 1.1, pw * 0.84, pw * 1.2);
  K.glow(g, x, top - iw - pw * 0.5, pw * 1.4, color, 0.7 * gA);
}

// plaza(g, t, o) - the Cat Plaza at sunrise. o: {sunX, sunY, fountain (bool), statue (bool),
// rays, mist, cats:false}. Ground horizon at y 318. Statue centred at x 480.
export const PLAZA_HZ = 318;
export function plaza(g, t, o = {}) {
  const HZ = PLAZA_HZ;
  const sunX = o.sunX == null ? 150 : o.sunX, sunY = o.sunY == null ? 250 : o.sunY;
  // sky
  const sg = g.createLinearGradient(0, -400, 0, HZ);
  sg.addColorStop(0, "#5fa8f0");
  sg.addColorStop(0.45, "#a9d4fb");
  sg.addColorStop(0.8, "#ffe4ec");
  sg.addColorStop(1, "#fff1e2");
  g.fillStyle = sg;
  g.fillRect(-60, -420, W0 + 120, HZ + 420);
  K.sunGlow(g, sunX, sunY, 26, "#ffd9a8", 0.9);
  if (o.afterSky) o.afterSky(g);
  K.clouds(g, W0, H0, t, { seed: 21, color: "#ffe6ee", shade: "#d9a8c8", count: 6, y: 90, spread: 50, speed: 3, alpha: 0.75, scale: 0.9 });
  // far town / hills in haze
  ridge(g, { y: HZ - 18, amp: 46, color: "#d8c4e6", seed: 4, bottom: HZ + 4, top: "#e6d6ef" });
  // distant rooftops
  g.fillStyle = "#cdb8de";
  const R = K.rng("plaza-roofs");
  for (let i = 0; i < 22; i++) {
    const x = R() * W0, w = 18 + R() * 30, h = 10 + R() * 26;
    g.fillRect(x, HZ - h, w, h + 2);
    g.beginPath(); g.moveTo(x - 3, HZ - h); g.lineTo(x + w / 2, HZ - h - 10); g.lineTo(x + w + 3, HZ - h); g.fill();
  }
  // portal arches in an arc
  const arcs = [[70, 342, 150], [200, 326, 118], [335, 314, 96], [480, 310, 88], [625, 314, 96], [760, 326, 118], [890, 342, 150]];
  arcs.forEach(([x, y, h], i) => {
    const far = 1 - (y - 310) / 32;
    portalArch(g, x, y, h, ZONE_GLOW[i], t + i, { haze: "#f0dcef", hazeAmt: 0.12 + far * 0.3, glow: 0.85 + 0.15 * Math.sin(t * 0.9 + i) });
  });
  // ground (round plaza in perspective)
  const fg = g.createLinearGradient(0, HZ, 0, H0);
  fg.addColorStop(0, "#e6d4c8");
  fg.addColorStop(0.3, "#cfb6a4");
  fg.addColorStop(1, "#86695c");
  g.fillStyle = fg;
  g.fillRect(-60, HZ, W0 + 120, H0 - HZ + 40);
  g.save();
  g.beginPath();
  g.rect(-60, HZ + 1, W0 + 120, H0 - HZ + 60);
  g.clip();
  g.strokeStyle = "rgba(120,90,80,0.22)";
  g.lineWidth = 1;
  for (let k = 1; k < 9; k++) {
    const ry = 14 * k * k * 0.55 + 20 * k;
    g.beginPath();
    g.ellipse(480, HZ + 52, 120 + k * 120, ry * 0.36 + 6, 0, 0, K.TAU);
    g.stroke();
  }
  for (let k = -10; k <= 10; k++) {
    g.beginPath();
    g.moveTo(480 + k * 20, HZ + 40);
    g.lineTo(480 + k * 160, H0 + 40);
    g.stroke();
  }
  g.restore();
  // sunlight warm wash on the ground from the left + long cool shadow of the statue to the right
  g.save();
  g.globalCompositeOperation = "soft-light";
  const wg = g.createLinearGradient(0, 0, W0, 0);
  wg.addColorStop(0, "rgba(255,200,140,0.65)");
  wg.addColorStop(1, "rgba(120,110,180,0.45)");
  g.fillStyle = wg;
  g.fillRect(-60, HZ, W0 + 120, H0 - HZ + 40);
  g.restore();
  g.save();
  g.fillStyle = "rgba(90,80,140,0.22)";
  g.beginPath();
  g.moveTo(450, 410);
  g.lineTo(980, 470);
  g.lineTo(980, 520);
  g.lineTo(520, 432);
  g.closePath();
  g.fill();
  g.restore();
  // trees at the sides (soft, in haze)
  blossomTree(g, -10, 372, 0.95, t, { seed: 5, bloom: "#f4b9cc", haze: "#f2e2f2", hazeAmt: 0.2, lightLeft: true });
  blossomTree(g, 975, 380, 1.0, t, { seed: 7, bloom: "#f4b9cc", haze: "#f2e2f2", hazeAmt: 0.2, lightLeft: true });
  // fountain: back rim, water, statue, jets, front rim
  const fx = 480, fy = 420;
  g.fillStyle = "#c9b6a6";
  g.beginPath(); g.ellipse(fx, fy - 6, 236, 46, 0, Math.PI, K.TAU); g.fill();
  const wgr = g.createLinearGradient(0, fy - 40, 0, fy + 30);
  wgr.addColorStop(0, "#9ccfe6");
  wgr.addColorStop(1, "#5f9fc0");
  g.fillStyle = wgr;
  g.beginPath(); g.ellipse(fx, fy - 2, 222, 38, 0, 0, K.TAU); g.fill();
  // water glints
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 40; i++) {
    const a = K.hash(i, 31) * K.TAU, d = 0.3 + K.hash(i, 32) * 0.65;
    const tw = Math.max(0, Math.sin(t * 3 + i * 1.7));
    g.fillStyle = `rgba(255,250,235,${0.5 * tw})`;
    g.fillRect(fx + Math.cos(a) * 222 * d, fy - 2 + Math.sin(a) * 38 * d, 5 * tw + 1, 1);
  }
  g.restore();
  if (o.statue !== false) {
    const spr = statueSprite();
    g.drawImage(spr, fx - 130, fy - 4 - 396, 260, 400);
    // statue reflection in the water
    g.save();
    g.beginPath(); g.ellipse(fx, fy - 2, 222, 38, 0, 0, K.TAU); g.clip();
    g.globalAlpha = 0.28;
    g.translate(fx, fy - 4);
    g.scale(1, -0.35);
    g.drawImage(spr, -130, -396, 260, 400);
    g.restore();
  }
  // jets: four arcs from spouts on the pedestal
  if (o.fountain !== false) {
    g.save();
    g.globalCompositeOperation = "lighter";
    const spouts = [[-60, -1], [60, 1], [-38, -1], [38, 1]];
    g.lineCap = "round";
    spouts.forEach(([sx, dir], j) => {
      const reach = j < 2 ? 150 : 95, hgt = j < 2 ? 70 : 52;
      const P = (u) => [fx + sx + dir * reach * u, fy - 70 - hgt * (4 * u * (1 - u)) + 70 * u * u * (j < 2 ? 0.75 : 0.9)];
      // the stream: a soft wide stroke and a bright core
      for (const [lw, a] of [[5, 0.12], [2, 0.35], [0.8, 0.6]]) {
        g.strokeStyle = `rgba(225,242,255,${a})`;
        g.lineWidth = lw;
        g.beginPath();
        for (let k = 0; k <= 16; k++) { const [x, y] = P(k / 16); if (k) g.lineTo(x, y); else g.moveTo(x, y); }
        g.stroke();
      }
      // droplets travelling along it, breaking up as they fall
      for (let i = 0; i < 26; i++) {
        const u = ((i / 26) + t * 0.6 + j * 0.13) % 1;
        const [x, y] = P(u);
        const sp = u > 0.55 ? (u - 0.55) * 14 * (K.hash(i, j) - 0.5) : 0;
        g.fillStyle = `rgba(245,252,255,${0.7 * (1 - u * 0.4)})`;
        g.fillRect(x + sp, y, 1.8, 1.8);
      }
    });
    g.restore();
    // splash mist
    K.glow(g, fx - 200, fy - 4, 40, "#ffffff", 0.35);
    K.glow(g, fx + 200, fy - 4, 40, "#ffffff", 0.35);
  }
  // front rim
  const rg = g.createLinearGradient(0, fy + 10, 0, fy + 56);
  rg.addColorStop(0, "#efe2d4");
  rg.addColorStop(1, "#a9927f");
  g.fillStyle = rg;
  g.beginPath();
  g.ellipse(fx, fy + 4, 244, 50, 0, 0, Math.PI);
  g.ellipse(fx, fy + 28, 244, 50, 0, Math.PI, 0, true);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(255,248,236,0.9)";
  g.beginPath();
  g.ellipse(fx, fy + 4, 244, 50, 0, 0, Math.PI);
  g.ellipse(fx, fy + 4, 232, 44, 0, Math.PI, 0, true);
  g.closePath();
  g.fill();
  // light rays and mist
  if (o.rays !== false) K.godRays(g, sunX, sunY, W0, H0, { color: "#ffe2b8", count: 9, strength: 0.16, t, angle: 0.18, spread: 0.9, length: 1100 });
  if (o.mist !== false) K.fog(g, W0, H0, { y: HZ + 10, h: 90, color: "#fff0f4", alpha: 0.35, t, seed: 4 });
}

// A kid-sized raindrop-ring on a puddle (pure function of t).
export function puddleRings(g, t, cx, cy, rx, ry, n = 10, seed = 3) {
  g.save();
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, K.TAU);
  g.clip();
  g.strokeStyle = "rgba(220,230,250,0.55)";
  g.lineWidth = 0.8;
  for (let i = 0; i < n; i++) {
    const per = 0.7 + K.hash(i, seed) * 0.6;
    const tt = t + K.hash(i + 0.3, seed) * per;
    const c = Math.floor(tt / per), p = tt / per - c;
    const x = cx + (K.hash(i * 7 + c * 3.1, seed) - 0.5) * rx * 1.8;
    const y = cy + (K.hash(i * 5 + c * 1.7, seed) - 0.5) * ry * 1.6;
    for (let k = 0; k < 2; k++) {
      const pr = p - k * 0.18;
      if (pr <= 0) continue;
      g.globalAlpha = (1 - pr) * 0.8;
      g.beginPath();
      g.ellipse(x, y, 2 + pr * 22, (2 + pr * 22) * (ry / rx) * 0.9, 0, 0, K.TAU);
      g.stroke();
    }
  }
  g.restore();
}

// silhouette(g, key, fn, color, alpha) - paint fn(layerG) into an offscreen layer (same world
// coordinates), flood it with `color` and composite it: a crisp cast-shadow / backlit shape.
export function silhouette(g, key, fn, color, alpha = 1) {
  if (alpha <= 0.003) return;
  const L = K.layer(W0, H0, key);
  try { fn(L.g); } catch (err) { console.warn("[lib012] silhouette", err); }
  const s = L.g;
  s.save();
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalCompositeOperation = "source-in";
  s.fillStyle = color;
  s.fillRect(0, 0, L.canvas.width, L.canvas.height);
  s.restore();
  g.save();
  g.globalAlpha *= alpha;
  g.drawImage(L.canvas, 0, 0, W0, H0);
  g.restore();
}

// tinted(g, key, fn, color, alpha) - paint fn(layerG) offscreen and wash it toward `color` (keeping
// its own internal shading underneath): night-darkened foliage, hazed distant props.
export function tinted(g, key, fn, color, alpha = 0.8) {
  const L = K.layer(W0, H0, key);
  try { fn(L.g); } catch (err) { console.warn("[lib012] tinted", err); }
  const s = L.g;
  s.save();
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalCompositeOperation = "source-atop";
  s.globalAlpha = alpha;
  s.fillStyle = color;
  s.fillRect(0, 0, L.canvas.width, L.canvas.height);
  s.restore();
  g.drawImage(L.canvas, 0, 0, W0, H0);
}

// Rain drawn only inside a clip path (e.g. a lamp cone) - the same drops, brighter.
export function litRain(g, t, clipFn, o) {
  g.save();
  g.beginPath();
  clipFn(g);
  g.clip();
  K.rain(g, W0, H0, t, o);
  g.restore();
}

// ---- trees, stones, the house at night ------------------------------------------------------------
function treeShape(R, w, h, o) {
  const tips = [];
  const segs = [];
  const branch = (x, y, ang, len, wid, d) => {
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    segs.push([x, y, (x + ex) / 2 + (R() - 0.5) * len * 0.3, (y + ey) / 2 + (R() - 0.5) * len * 0.15, ex, ey, wid]);
    if (d >= (o.depth || 5) || len < 5) { tips.push([ex, ey, len]); return; }
    const k = 2 + (R() > 0.55 ? 1 : 0);
    for (let i = 0; i < k; i++) {
      const na = ang + (i - (k - 1) / 2) * (o.splay || 0.55) + (R() - 0.5) * 0.45;
      branch(ex, ey, na, len * (0.66 + R() * 0.14), wid * 0.64, d + 1);
    }
  };
  branch(w / 2, h - 4, -Math.PI / 2 + (R() - 0.5) * 0.12, h * (o.trunkLen || 0.27), w * (o.trunkW || 0.065), 0);
  return { tips, segs };
}
function paintBranches(s, segs, color) {
  s.strokeStyle = color;
  s.lineCap = "round";
  for (const [x, y, cx, cy, ex, ey, wd] of segs) {
    s.lineWidth = wd;
    s.beginPath();
    s.moveTo(x, y);
    s.quadraticCurveTo(cx, cy, ex, ey);
    s.stroke();
  }
}
// treeSil(g, x, y, scale, t, {seed, color, bare, sway}) - a night tree silhouette with a crisp
// leafy edge (hundreds of small leaf clumps), ~320*scale tall; x, y = foot of the trunk.
export function treeSil(g, x, y, scale, t, o = {}) {
  const seed = o.seed || 1, color = o.color || "#05080d";
  const w = 300, h = 320;
  const spr = K.sprite("lib012-tsil:" + seed + color + (o.bare ? "b" : ""), w, h, (s) => {
    const R = K.rng("tsil" + seed);
    const { tips, segs } = treeShape(R, w, h, { depth: o.bare ? 6 : 5 });
    paintBranches(s, segs, color);
    if (o.bare) return;
    s.fillStyle = color;
    for (const [tx, ty] of tips) {
      for (let i = 0; i < 16; i++) {
        const a = R() * K.TAU, d = Math.pow(R(), 0.6) * 26;
        const cx = Math.min(w - 8, Math.max(8, tx + Math.cos(a) * d)), cy = Math.max(8, ty + Math.sin(a) * d * 0.8 - 6);
        s.beginPath();
        s.arc(cx, cy, 2.5 + R() * 6, 0, K.TAU);
        s.fill();
      }
    }
  });
  const sway = (o.sway == null ? 1 : o.sway) * (Math.sin(t * 0.9 + seed) * 0.012 + Math.sin(t * 2.3 + seed * 3) * 0.005);
  g.save();
  g.translate(x, y);
  g.rotate(sway);
  g.drawImage(spr, -w * scale / 2, -h * scale + 4 * scale, w * scale, h * scale);
  g.restore();
}
// leafyTree(g, x, y, scale, t, {seed, leaf, trunk, lightLeft, haze, hazeAmt}) - a lit daytime tree.
export function leafyTree(g, x, y, scale, t, o = {}) {
  const seed = o.seed || 1, leaf = o.leaf || "#4a7a34", trunk = o.trunk || "#3e2c22";
  const hz = (c) => (o.haze ? K.mix(c, o.haze, o.hazeAmt || 0) : c);
  const w = 300, h = 320;
  const L = o.lightLeft ? -1 : 1;
  const key = "lib012-leafy:" + seed + leaf + trunk + (o.haze || "") + (o.hazeAmt || 0) + L;
  const spr = K.sprite(key, w, h, (s) => {
    const R = K.rng("leafy" + seed);
    const { tips, segs } = treeShape(R, w, h, { depth: 5 });
    paintBranches(s, segs, hz(trunk));
    const blobs = [];
    for (const [tx, ty] of tips) for (let i = 0; i < 12; i++) {
      const a = R() * K.TAU, d = Math.pow(R(), 0.6) * 30;
      blobs.push([Math.min(w - 16, Math.max(16, tx + Math.cos(a) * d)), Math.max(16, ty + Math.sin(a) * d * 0.75 - 4), 7 + R() * 9]);
    }
    const passes = [[-0.42, 1.25, 0, 3], [-0.18, 1.0, 0, 0], [0.05, 0.8, 0.25, -2], [0.28, 0.55, 0.55, -4]];
    for (const [sh, rs, side, dy] of passes) {
      s.fillStyle = hz(K.shade(leaf, sh));
      for (const [bx, by, r] of blobs) {
        if (side > 0 && R() > 0.65) continue;
        s.beginPath();
        s.arc(bx + side * L * r * 0.6, by + dy, r * rs, 0, K.TAU);
        s.fill();
      }
    }
    s.fillStyle = K.rgba(hz(K.shade(leaf, 0.45)), 0.55);
    for (let i = 0; i < 400; i++) {
      const [bx, by, r] = blobs[Math.floor(R() * blobs.length)];
      s.fillRect(bx + L * r * 0.5 + (R() - 0.5) * r, by - r * 0.4 + (R() - 0.5) * r, 1.6, 1.3);
    }
  });
  const sway = (o.sway == null ? 1 : o.sway) * (Math.sin(t * 0.8 + seed) * 0.01 + Math.sin(t * 2.1 + seed * 3) * 0.004);
  g.save();
  g.translate(x, y);
  g.rotate(sway);
  g.drawImage(spr, -w * scale / 2, -h * scale + 4 * scale, w * scale, h * scale);
  g.restore();
}

// stonePath / rimStone(g, x, y, w, h, {seed, color, rim, rimA, dx, dy, wet, lichen}) - a weathered
// standing stone with texture, lichen and a rim-light crescent on the side facing the light.
export function stonePath(x, y, w, h, seed) {
  const R = K.rng("rstone" + seed);
  const pts = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI;
    const rx = (w / 2) * (0.82 + R() * 0.22), ry = h * (0.9 + R() * 0.12);
    pts.push(x + Math.cos(a) * rx, y + Math.sin(a) * ry);
  }
  pts.push(x + w * 0.52, y + 3, x - w * 0.52, y + 3);
  const p = new Path2D();
  K.spline(p, pts, true, 0.55);
  return p;
}
export function rimStone(g, x, y, w, h, o = {}) {
  const seed = o.seed || 1, color = o.color || "#2a2f36";
  const p = stonePath(x, y, w, h, seed);
  const gr = g.createLinearGradient(x - w / 2, y - h, x + w / 2, y);
  gr.addColorStop(0, K.shade(color, 0.12));
  gr.addColorStop(0.6, color);
  gr.addColorStop(1, K.shade(color, -0.4));
  g.fillStyle = gr;
  g.fill(p);
  g.save();
  g.clip(p);
  const R = K.rng("rstex" + seed);
  const k = w / 120;
  for (let i = 0; i < 160; i++) {
    g.fillStyle = R() > 0.5 ? K.rgba(K.shade(color, 0.25), 0.35) : K.rgba(K.shade(color, -0.45), 0.4);
    const sz = 1 + R() * 3;
    g.fillRect(x + (R() - 0.5) * w, y - R() * h, sz * k, sz * 0.7 * k);
  }
  g.strokeStyle = K.rgba(K.shade(color, -0.6), 0.55);
  g.lineWidth = Math.max(1, w / 90);
  for (let i = 0; i < 5; i++) {
    const sx = x + (R() - 0.5) * w * 0.7, sy = y - (0.3 + R() * 0.6) * h;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + (R() - 0.5) * w * 0.25, sy + R() * h * 0.25); g.lineTo(sx + (R() - 0.5) * w * 0.3, sy + h * 0.3); g.stroke();
  }
  for (let i = 0; i < 7; i++) {
    g.fillStyle = K.rgba(o.lichen || "#6a7a4a", 0.25);
    g.beginPath(); g.ellipse(x + (R() - 0.5) * w * 0.8, y - R() * h * 0.8, w * 0.05 * (1 + R()), w * 0.035 * (1 + R()), R() * 3, 0, K.TAU); g.fill();
  }
  const mg = g.createLinearGradient(0, y - h * 0.3, 0, y);
  mg.addColorStop(0, "rgba(30,45,25,0)");
  mg.addColorStop(1, "rgba(30,45,25,0.65)");
  g.fillStyle = mg;
  g.fillRect(x - w, y - h * 0.3, w * 2, h * 0.3 + 4);
  if (o.wet) {
    g.fillStyle = `rgba(200,215,235,${0.07 * o.wet})`;
    g.fillRect(x - w * 0.2, y - h, w * 0.1, h);
  }
  if (o.rim && (o.rimA == null || o.rimA > 0.01)) {
    // rim crescent: light over the stone, then the stone's own shading shifted away from the light
    const dx = o.dx == null ? -w * 0.05 : o.dx, dy = o.dy == null ? 0 : o.dy;
    g.globalCompositeOperation = "lighter";
    g.fillStyle = K.rgba(o.rim, o.rimA == null ? 0.6 : o.rimA);
    g.fill(p);
    g.globalCompositeOperation = "source-over";
    g.translate(-dx, -dy);
    g.fillStyle = gr;
    g.fill(p);
  }
  g.restore();
}

// nightHouse(g, x, y, scale, t, {catInWindow, flash}) - a two-storey house at night, painted once
// (~300*scale wide, ~280*scale tall; x, y = bottom centre). The upstairs middle window is lit.
export function nightHouse(g, x, y, scale, t, o = {}) {
  const spr = K.sprite("lib012-nighthouse2", 380, 280, (s) => {
    const wallG = s.createLinearGradient(0, 110, 0, 276);
    wallG.addColorStop(0, "#1d2433");
    wallG.addColorStop(1, "#141a26");
    s.fillStyle = wallG;
    s.fillRect(40, 108, 220, 168);
    s.strokeStyle = "rgba(0,0,0,0.35)";
    s.lineWidth = 0.8;
    for (let yy = 114; yy < 276; yy += 6) { s.beginPath(); s.moveTo(40, yy); s.lineTo(260, yy); s.stroke(); }
    // the side wall, receding to the right in perspective (darker: it faces away from the street lamp)
    const sideG = s.createLinearGradient(260, 0, 352, 0);
    sideG.addColorStop(0, "#121824");
    sideG.addColorStop(1, "#0a0e16");
    s.fillStyle = sideG;
    s.beginPath(); s.moveTo(260, 108); s.lineTo(352, 84); s.lineTo(352, 258); s.lineTo(260, 276); s.closePath(); s.fill();
    s.strokeStyle = "rgba(0,0,0,0.4)";
    s.lineWidth = 0.7;
    for (let k = 0; k < 28; k++) { const y0 = 114 + k * 6; s.beginPath(); s.moveTo(260, y0); s.lineTo(352, y0 - 24 * (1 - (y0 - 108) / 168 * 0.1) + (y0 - 108) / 168 * 6); s.stroke(); }
    // a dark side window (foreshortened) and the corner trim catching a little light
    s.fillStyle = "#0c1220";
    s.beginPath(); s.moveTo(292, 140); s.lineTo(318, 134); s.lineTo(318, 172); s.lineTo(292, 177); s.closePath(); s.fill();
    s.strokeStyle = "#252c3a"; s.lineWidth = 1.6; s.stroke();
    s.fillStyle = "#2a3242";
    s.fillRect(258, 108, 4, 168);
    s.fillStyle = "#151b26";
    s.fillRect(200, 30, 22, 60);
    s.fillStyle = "#0b0f16";
    s.fillRect(197, 26, 28, 7);
    s.fillStyle = "#0c1018";
    s.beginPath(); s.moveTo(26, 112); s.lineTo(150, 28); s.lineTo(274, 112); s.closePath(); s.fill();
    s.fillStyle = "#080b12";
    s.beginPath(); s.moveTo(150, 28); s.lineTo(232, 12); s.lineTo(362, 84); s.lineTo(274, 112); s.closePath(); s.fill();
    s.fillStyle = "#0c1018";
    s.strokeStyle = "rgba(90,105,135,0.3)";
    s.lineWidth = 0.7;
    for (let k = 1; k < 10; k++) {
      const yy = 28 + k * 8.4;
      const half = ((yy - 28) / 84) * 124;
      s.beginPath(); s.moveTo(150 - half, yy); s.lineTo(150 + half, yy); s.stroke();
    }
    s.strokeStyle = "#2a3242";
    s.lineWidth = 2.4;
    s.beginPath(); s.moveTo(26, 112); s.lineTo(150, 28); s.lineTo(274, 112); s.stroke();
    s.fillStyle = "#202838";
    s.fillRect(26, 110, 250, 4);
    const win = (wx, wy) => {
      const gg = s.createLinearGradient(0, wy, 0, wy + 42);
      gg.addColorStop(0, "#1e2a40");
      gg.addColorStop(1, "#0a0e16");
      s.fillStyle = gg;
      s.fillRect(wx - 17, wy, 34, 42);
      s.strokeStyle = "#323b4c";
      s.lineWidth = 2.5;
      s.strokeRect(wx - 17, wy, 34, 42);
      s.lineWidth = 1.3;
      s.beginPath(); s.moveTo(wx, wy); s.lineTo(wx, wy + 42); s.moveTo(wx - 17, wy + 21); s.lineTo(wx + 17, wy + 21); s.stroke();
      s.fillStyle = "#2a3242";
      s.fillRect(wx - 21, wy + 42, 42, 4);
    };
    win(88, 132); win(212, 132); win(88, 206); win(212, 206);
    s.fillStyle = "#2a1618";
    s.fillRect(134, 214, 32, 62);
    s.fillStyle = "#1a2232";
    s.beginPath(); s.moveTo(116, 214); s.lineTo(150, 196); s.lineTo(184, 214); s.closePath(); s.fill();
    s.fillStyle = "#2a3242";
    s.fillRect(118, 213, 4, 63); s.fillRect(178, 213, 4, 63);
    s.fillStyle = "#070b0a";
    for (let i = 0; i < 26; i++) { s.beginPath(); s.arc(44 + i * 8.4, 274 - (i % 3) * 2, 8 + (i % 4) * 1.5, 0, K.TAU); s.fill(); }
  });
  const wy = 132 - 276;
  const flick = 0.94 + 0.06 * Math.sin(t * 6.3) * Math.sin(t * 2.7);
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  g.drawImage(spr, -150, -276, 380, 280);
  const lg = g.createLinearGradient(0, wy, 0, wy + 42);
  lg.addColorStop(0, "#ffe2b0");
  lg.addColorStop(1, "#f0a860");
  g.globalAlpha = flick;
  g.fillStyle = lg;
  g.fillRect(-17, wy, 34, 42);
  g.globalAlpha = 1;
  g.fillStyle = "rgba(150,60,40,0.65)";
  g.fillRect(-17, wy, 7, 42);
  g.fillRect(10, wy, 7, 42);
  if (o.catInWindow) {
    g.fillStyle = "#1a0e08";
    g.beginPath(); g.ellipse(2, wy + 36, 6, 7, 0, 0, K.TAU); g.fill();
    g.beginPath(); g.arc(1, wy + 26, 4.2, 0, K.TAU); g.fill();
    g.beginPath(); g.moveTo(-3, wy + 24); g.lineTo(-2.5, wy + 19); g.lineTo(0, wy + 23); g.fill();
    g.beginPath(); g.moveTo(2, wy + 23); g.lineTo(4.5, wy + 19.5); g.lineTo(5, wy + 24); g.fill();
    g.fillRect(6, wy + 40, 7, 2);
  }
  g.strokeStyle = "#3a3026";
  g.lineWidth = 2.5;
  g.strokeRect(-17, wy, 34, 42);
  g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(0, wy); g.lineTo(0, wy + 42); g.moveTo(-17, wy + 21); g.lineTo(17, wy + 21); g.stroke();
  g.fillStyle = "rgba(255,200,140,0.5)";
  g.fillRect(-21, wy + 42, 42, 2);
  g.strokeStyle = K.rgba("#8aa0c8", 0.25 + 0.6 * (o.flash || 0));
  g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(-124, 112 - 276); g.lineTo(0, 28 - 276); g.lineTo(30, 20 - 276); g.stroke();
  g.restore();
  K.glow(g, x, y + (wy + 21) * scale, 80 * scale, "#ffcf8a", 0.45 * flick);
  K.glow(g, x, y + (wy + 21) * scale, 22 * scale, "#fff2d8", 0.5 * flick);
}

// ---- meadow ground ------------------------------------------------------------------------------------
// fieldTexture(key, w, h, {base, light, dark, flowers, seed}) - a perspective grass texture (strokes grow
// toward the bottom) with scattered wildflowers; painted once. Use as a fill over a ridge (clip).
export function fieldTexture(key, w, h, o = {}) {
  return K.sprite("lib012-field:" + key, w, h, (s) => {
    const R = K.rng("field" + key);
    const base = o.base || "#5aa040", light = o.light || "#9ad46a", dark = o.dark || "#2f6a24";
    vgrad(s, 0, 0, w, h, [[0, K.shade(base, 0.08)], [1, K.shade(base, -0.2)]]);
    // soft mottling (clumps in light and shade)
    for (let i = 0; i < 60; i++) {
      const v = R();
      s.fillStyle = K.rgba(R() > 0.5 ? light : dark, 0.12);
      s.beginPath(); s.ellipse(R() * w, v * h, 30 + v * 90, 6 + v * 20, 0, 0, K.TAU); s.fill();
    }
    for (let i = 0; i < 5200; i++) {
      const v = Math.pow(R(), 0.8), x = R() * w, y = v * h;
      const l = 2 + v * 20, a = -Math.PI / 2 + (R() - 0.5) * 0.8;
      const c = R();
      s.strokeStyle = c > 0.6 ? K.rgba(light, 0.6) : c > 0.25 ? K.rgba(base, 0.7) : K.rgba(dark, 0.6);
      s.lineWidth = 0.5 + v * 1.6;
      s.beginPath(); s.moveTo(x, y); s.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 1.5, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); s.stroke();
    }
    if (o.flowers !== false) {
      const cols = o.flowerCols || ["#ffffff", "#fff2a0", "#ffd24a", "#f7b7d2", "#c8b4ff"];
      for (let i = 0; i < 420; i++) {
        const v = Math.pow(R(), 0.9), x = R() * w, y = v * h;
        const r = 0.6 + v * 2.6;
        s.fillStyle = cols[Math.floor(R() * cols.length)];
        s.globalAlpha = 0.85;
        s.beginPath(); s.arc(x, y, r, 0, K.TAU); s.fill();
        if (r > 1.6) { s.fillStyle = "#f0c040"; s.beginPath(); s.arc(x, y, r * 0.35, 0, K.TAU); s.fill(); }
      }
      s.globalAlpha = 1;
    }
  });
}
// texturedRidge(g, ridgeOpts, texKey, texOpts) - a ridge filled with a field texture, + sunlit crest.
export function texturedRidge(g, o, texKey, texOpts = {}) {
  const p = ridge(g, Object.assign({}, o, { fill: "rgba(0,0,0,0)" }));
  const top = o.y - (o.amp || 30) - (o.bumpMax || 0);
  const bottom = o.bottom == null ? H0 : o.bottom;
  const tex = fieldTexture(texKey, W0 + 160, Math.max(40, bottom - top), texOpts);
  g.save();
  g.clip(p);
  g.drawImage(tex, -80, top, W0 + 160, bottom - top);
  if (o.shadeTop) vgrad(g, -80, top, W0 + 160, (bottom - top) * 0.5, [[0, o.shadeTop], [1, "rgba(0,0,0,0)"]]);
  g.restore();
  if (o.rim) {
    g.save();
    g.strokeStyle = o.rim;
    g.globalAlpha *= o.rimA == null ? 0.5 : o.rimA;
    g.lineWidth = o.rimW || 1.5;
    g.globalCompositeOperation = "lighter";
    g.beginPath();
    for (let x = -10; x <= W0 + 18; x += 8) { const yy = ridgeY(x, o); if (x === -10) g.moveTo(x, yy); else g.lineTo(x, yy); }
    g.stroke();
    g.restore();
  }
  return p;
}

// cachedCat(g, x, y, size, opts, key) - drawCat rendered once into a sprite per (key, opts) and
// stamped: for small background cats whose pose only changes in a few quantised steps.
export function cachedCat(g, x, y, size, opts, key) {
  const w = Math.ceil(size * 4.2), h = Math.ceil(size * 3.2);
  const spr = K.sprite("lib012-cat:" + key + ":" + size, w, h, (s) => {
    const o = Object.assign({}, opts, { t: 0 });
    if (o.light) o.light = Object.assign({}, o.light, { x: o.light.x - x + w / 2, y: o.light.y - y + h * 0.82 });
    K.drawCat(s, w / 2, h * 0.82, size, o);
  });
  g.drawImage(spr, x - w / 2, y - h * 0.82, w, h);
}
export const q = (v, step) => Math.round(v / step) * step;

// blades(g, x0, x1, y, {seed, height, width, color, light, dark, t, wind, density}) - big, wide,
// tapered foreground grass blades (for out-of-focus foreground framing), lit along one edge.
export function blades(g, x0, x1, y, o = {}) {
  const seed = o.seed || 1, h = o.height || 160, t = o.t || 0, wind = o.wind == null ? 1 : o.wind;
  const n = Math.max(1, Math.round((Math.abs(x1 - x0) / 14) * (o.density == null ? 1 : o.density)));
  const color = o.color || "#2f6a24", light = o.light || K.shade(color, 0.35), dark = o.dark || K.shade(color, -0.35);
  for (let i = 0; i < n; i++) {
    const r = K.hash(i, seed);
    const bx = K.lerp(x0, x1, (i + K.hash(i + 0.5, seed)) / n);
    const bh = h * (0.5 + r * 0.7);
    const bw = (o.width || h * 0.045) * (0.6 + K.hash(i + 0.7, seed) * 0.8);
    const gust = Math.sin(t * 1.4 - bx * 0.01) * 0.5 + Math.sin(t * 2.3 + i) * 0.15;
    const lean = ((K.hash(i + 0.2, seed) - 0.5) * 0.9 + gust * 0.35 * wind) * bh;
    const tipX = bx + lean, tipY = y - bh;
    const p = new Path2D();
    p.moveTo(bx - bw, y);
    p.quadraticCurveTo(bx - bw * 0.4 + lean * 0.3, y - bh * 0.6, tipX, tipY);
    p.quadraticCurveTo(bx + bw * 0.4 + lean * 0.3, y - bh * 0.6, bx + bw, y);
    p.closePath();
    const gr = g.createLinearGradient(bx - bw, 0, bx + bw, 0);
    const c = K.hash(i + 0.9, seed) > 0.5 ? color : dark;
    gr.addColorStop(0, light);
    gr.addColorStop(0.35, c);
    gr.addColorStop(1, K.shade(c, -0.25));
    g.fillStyle = gr;
    g.fill(p);
  }
}
