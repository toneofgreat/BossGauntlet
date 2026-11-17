// films/f16.js - Chapter 16 "He Was Never Lost" (FILMS.md f16). THE TWIST FILM, taken slow.
// A dusty, forgotten mall shop turned shrine: pink sunset light through slatted shutters, candles, and a
// wall of old posters with a scratched sketch of every lost cat, each with one amber pawprint beside it.
// The Shadow steps into the light and is Sir Whiskers the First. Biscuit was leading all along.
// draw(g, t, W, H) is a pure function of t (posters and plaster are cached as static sprites only).
import * as K from "../filmkit.js";

const D = 80;
const TAU = Math.PI * 2;
const AMBER = "#ffb347";

// ---- utilities ------------------------------------------------------------------------------------------
// Paint into an offscreen layer with the SAME transform as g (camera included), then composite.
function inLayer(g, W, H, key, fn) {
  const L = K.layer(W, H, key);
  L.g.setTransform(g.getTransform());
  fn(L.g);
  return L;
}
function put(g, W, H, L, alpha = 1, blur = 0, mode) {
  if (alpha <= 0.002) return;
  g.save();
  const px = K.pixelScale();
  g.setTransform(px, 0, 0, px, 0, 0);
  if (mode) g.globalCompositeOperation = mode;
  if (blur > 0.3) K.dof(g, L.canvas, blur, alpha);
  else { g.globalAlpha *= alpha; g.drawImage(L.canvas, 0, 0, W, H); }
  g.restore();
}
function xfade(g, W, H, a, key, fn) {
  if (a <= 0.002) return;
  if (a >= 0.998) { fn(g); return; }
  const L = K.layer(W, H, key);
  fn(L.g);
  g.save();
  g.globalAlpha *= a;
  g.drawImage(L.canvas, 0, 0, W, H);
  g.restore();
}

// A cat painted once per gait step into a cached sprite (drawCat costs ~3 ms; small walking cats in
// the flash cuts reuse 8 cached steps). key must identify coat/facing/light; o.phase picks the step.
function cachedCat(g, x, y, size, o, key, steps = 8) {
  const q = Math.floor(((((o.phase || 0) % 1) + 1) % 1) * steps);
  const SC = 2, SW = size * 3.6, SH = size * 2.5, ox = SW / 2, oy = SH * 0.86;
  const spr = K.sprite("f16cat:" + key + ":" + q + ":" + size, SW * SC, SH * SC, (s) => {
    s.scale(SC, SC);
    const oo = Object.assign({}, o, { phase: q / steps, t: (q / steps) * 2.3 });
    if (o.light) oo.light = { x: ox + (o.light.x - x), y: oy + (o.light.y - y), color: o.light.color, strength: o.light.strength };
    K.drawCat(s, ox, oy, size, oo);
  });
  if (!g) return;
  g.save();
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  g.drawImage(spr, x - ox, y - oy, SW, SH);
  g.restore();
}

// Flashback edge: a blurred copy of the frame shows only toward the borders (soft, dreamy memory edge).
function memoryEdge(g, W, H) {
  if (!K.hasFilter() || !g.canvas) return;
  const L = K.layer(W, H, "f16:mem");
  const lg = L.g;
  lg.save();
  lg.setTransform(1, 0, 0, 1, 0, 0);
  lg.filter = "blur(5px)";
  lg.drawImage(g.canvas, 0, 0, L.canvas.width, L.canvas.height);
  lg.filter = "none";
  lg.restore();
  lg.globalCompositeOperation = "destination-in";
  const m = lg.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, W * 0.62);
  m.addColorStop(0, "rgba(0,0,0,0)"); m.addColorStop(1, "rgba(0,0,0,1)");
  lg.fillStyle = m; lg.fillRect(0, 0, W, H);
  g.drawImage(L.canvas, 0, 0, W, H);
}
// Pre-warm costly cached art one item per time bucket, during the shot BEFORE it is needed.
function prewarm(t) {
  try {
    if (t >= 26 && t < 34) {
      const k = Math.floor((t - 26) * 3);
      if (k < 8) shadowSprites(120, "walk", k, -1, 8);
      else if (k === 8) shadowSprites(120, "stand", 0, -1, 8);
      else if (k < 17) shadowSprites(78, "walk", k - 9, 1, 8);
    } else if (t >= 41 && t < 48.5) {
      const k = Math.floor((t - 41) * 4);
      const c = [
        () => cachedCat(null, 0, 0, 58, { pose: "walk", phase: 0, facing: 1, bell: false, tailUp: 0.7 }, "dbiscuit"),
        () => cachedCat(null, 0, 0, 40, { pose: "walk", phase: 0, facing: 1, bell: false, tailUp: 0.8 }, "cctvb"),
        () => cachedCat(null, 0, 0, 38, { pose: "walk", phase: 0, facing: 1, bell: false, headTurn: -0.2 }, "craterb"),
      ];
      if (k < c.length) c[k]();
    }
  } catch (e) { /* warm-up is optional */ }
}

// ---- the set: one shop, laid out in a 960 x 540 world --------------------------------------------------------
const WALL = { x0: 100, x1: 860, y0: 40, y1: 390 };
const VP = [480, 170];
const POSTERS = (() => {
  const out = [];
  const R = K.rng("f16posters");
  const cols = 9, rows = 4;
  const cw = (WALL.x1 - WALL.x0 - 50) / cols, ch = 70;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const sz = 0.82 + R() * 0.3;
      const w = cw * 0.84 * sz, h = ch * 0.86 * sz * (0.92 + R() * 0.16);
      const x = WALL.x0 + 25 + c * cw + (cw - w) / 2 + (R() - 0.5) * 18 + (r % 2) * cw * 0.18;
      const y = 60 + r * (ch + 4) + (R() - 0.5) * 16;
      out.push({ i, x, y, w, h, rot: (R() - 0.5) * 0.21, paper: R(), lit: R() > 0.45 ? 0.95 : 0.22, ph: R() * TAU, z: R(), tear: R(), tape: R() });
    }
  }
  // random stacking order so some overlap others; the last drawing is kept on top
  return out.sort((a, b) => (a.i === 24) - (b.i === 24) || a.z - b.z);
})();
const LAST = 24;
const POSTER = (i) => POSTERS.find((P) => P.i === i); // the last pawprint: the drawing of you and him
const printPos = (p) => {
  const lx = p.w * 0.82, ly = p.h * 0.42;
  const c = Math.cos(p.rot), s = Math.sin(p.rot);
  return [p.x + lx * c - ly * s, p.y + lx * s + ly * c];
};

// scratched sketch styles
function scratch(g, path, lw, seed = 1) {
  const R = K.rng("scr" + seed);
  g.lineCap = "round";
  // the groove: a dark line offset ~1 px down-right
  g.strokeStyle = "rgba(30,16,8,0.5)";
  g.lineWidth = lw * 0.9;
  g.save(); g.translate(lw * 0.8, lw * 0.9); g.stroke(path); g.restore();
  // 3 thin, slightly jittered passes of the scratched-in pale paper
  for (let k = 0; k < 3; k++) {
    g.save();
    g.translate((R() - 0.5) * lw * 1.3, (R() - 0.5) * lw * 1.3);
    g.rotate((R() - 0.5) * 0.012);
    g.strokeStyle = `rgba(248,236,212,${(0.35 + R() * 0.45).toFixed(2)})`;
    g.lineWidth = lw * (0.45 + R() * 0.35);
    g.stroke(path);
    g.restore();
  }
}
function sketchCat(p, v, cx, cy, s) {
  // a few loose, confident lines per sketch (charcoal-on-paper style, not cartoon outlines)
  const ear = (x, y, d) => { p.moveTo(x - 0.12 * s * d, y); p.lineTo(x, y - 0.22 * s); p.lineTo(x + 0.1 * s * d, y + 0.02 * s); };
  const headAt = (x, y, r) => { p.moveTo(x + r, y); p.ellipse(x, y, r, r * 0.86, 0, 0, TAU); ear(x - r * 0.55, y - r * 0.55, 1); ear(x + r * 0.55, y - r * 0.6, -1); };
  switch (v) {
    case 0: // sitting cat
      headAt(cx, cy - 0.45 * s, 0.24 * s);
      p.moveTo(cx - 0.18 * s, cy - 0.25 * s); p.bezierCurveTo(cx - 0.5 * s, cy + 0.1 * s, cx - 0.45 * s, cy + 0.55 * s, cx - 0.1 * s, cy + 0.55 * s);
      p.lineTo(cx + 0.25 * s, cy + 0.55 * s); p.bezierCurveTo(cx + 0.4 * s, cy + 0.3 * s, cx + 0.3 * s, cy, cx + 0.16 * s, cy - 0.25 * s);
      p.moveTo(cx + 0.25 * s, cy + 0.55 * s); p.bezierCurveTo(cx + 0.6 * s, cy + 0.55 * s, cx + 0.65 * s, cy + 0.2 * s, cx + 0.5 * s, cy + 0.1 * s);
      break;
    case 1: // loaf
      headAt(cx - 0.35 * s, cy - 0.05 * s, 0.22 * s);
      p.moveTo(cx - 0.2 * s, cy - 0.18 * s); p.bezierCurveTo(cx + 0.2 * s, cy - 0.32 * s, cx + 0.6 * s, cy - 0.2 * s, cx + 0.6 * s, cy + 0.15 * s);
      p.lineTo(cx + 0.55 * s, cy + 0.32 * s); p.lineTo(cx - 0.45 * s, cy + 0.32 * s);
      break;
    case 2: // curled up asleep
      p.moveTo(cx + 0.5 * s, cy + 0.1 * s); p.ellipse(cx, cy + 0.1 * s, 0.5 * s, 0.34 * s, 0, 0, TAU);
      p.moveTo(cx - 0.42 * s, cy + 0.26 * s); p.bezierCurveTo(cx - 0.1 * s, cy + 0.55 * s, cx + 0.4 * s, cy + 0.45 * s, cx + 0.45 * s, cy + 0.2 * s);
      ear(cx - 0.3 * s, cy - 0.15 * s, 1); ear(cx - 0.1 * s, cy - 0.2 * s, -1);
      p.moveTo(cx - 0.25 * s, cy + 0.05 * s); p.lineTo(cx - 0.15 * s, cy + 0.07 * s);
      break;
    case 3: // calico (patches hatched)
      headAt(cx, cy - 0.42 * s, 0.24 * s);
      p.moveTo(cx - 0.2 * s, cy - 0.22 * s); p.bezierCurveTo(cx - 0.5 * s, cy + 0.1 * s, cx - 0.4 * s, cy + 0.55 * s, cx, cy + 0.55 * s);
      p.bezierCurveTo(cx + 0.4 * s, cy + 0.55 * s, cx + 0.45 * s, cy + 0.1 * s, cx + 0.2 * s, cy - 0.22 * s);
      for (let k = 0; k < 5; k++) { p.moveTo(cx - 0.3 * s + k * 0.05 * s, cy + 0.05 * s); p.lineTo(cx - 0.2 * s + k * 0.05 * s, cy + 0.25 * s); }
      for (let k = 0; k < 4; k++) { p.moveTo(cx + 0.05 * s + k * 0.05 * s, cy + 0.2 * s); p.lineTo(cx + 0.15 * s + k * 0.05 * s, cy + 0.42 * s); }
      break;
    case 4: // cow-patterned, standing
      headAt(cx + 0.45 * s, cy - 0.3 * s, 0.2 * s);
      p.moveTo(cx + 0.3 * s, cy - 0.2 * s); p.bezierCurveTo(cx, cy - 0.3 * s, cx - 0.4 * s, cy - 0.25 * s, cx - 0.5 * s, cy - 0.1 * s);
      p.bezierCurveTo(cx - 0.55 * s, cy + 0.15 * s, cx + 0.2 * s, cy + 0.15 * s, cx + 0.35 * s, cy);
      for (const lx of [-0.45, -0.3, 0.15, 0.3]) { p.moveTo(cx + lx * s, cy + 0.08 * s); p.lineTo(cx + lx * s, cy + 0.5 * s); }
      p.moveTo(cx - 0.5 * s, cy - 0.1 * s); p.quadraticCurveTo(cx - 0.75 * s, cy - 0.3 * s, cx - 0.65 * s, cy - 0.55 * s);
      p.moveTo(cx - 0.1 * s, cy - 0.12 * s); p.ellipse(cx - 0.15 * s, cy - 0.08 * s, 0.07 * s, 0.05 * s, 0, 0, TAU);
      p.moveTo(cx + 0.18 * s, cy - 0.05 * s); p.ellipse(cx + 0.12 * s, cy - 0.04 * s, 0.06 * s, 0.05 * s, 0, 0, TAU);
      break;
    case 5: // a toaster with ears
      p.moveTo(cx - 0.5 * s, cy + 0.45 * s); p.lineTo(cx - 0.5 * s, cy - 0.15 * s); p.quadraticCurveTo(cx - 0.5 * s, cy - 0.3 * s, cx - 0.3 * s, cy - 0.3 * s);
      p.lineTo(cx + 0.3 * s, cy - 0.3 * s); p.quadraticCurveTo(cx + 0.5 * s, cy - 0.3 * s, cx + 0.5 * s, cy - 0.15 * s); p.lineTo(cx + 0.5 * s, cy + 0.45 * s); p.closePath();
      p.moveTo(cx - 0.3 * s, cy - 0.3 * s); p.lineTo(cx - 0.3 * s, cy - 0.1 * s); p.moveTo(cx + 0.05 * s, cy - 0.3 * s); p.lineTo(cx + 0.05 * s, cy - 0.1 * s);
      ear(cx - 0.32 * s, cy - 0.3 * s, 1); ear(cx + 0.32 * s, cy - 0.3 * s, -1);
      p.moveTo(cx - 0.15 * s, cy + 0.12 * s); p.lineTo(cx - 0.1 * s, cy + 0.15 * s); p.moveTo(cx + 0.15 * s, cy + 0.12 * s); p.lineTo(cx + 0.1 * s, cy + 0.15 * s);
      break;
    case 6: // a bus with ears
      p.moveTo(cx - 0.7 * s, cy + 0.3 * s); p.lineTo(cx - 0.7 * s, cy - 0.25 * s); p.lineTo(cx + 0.65 * s, cy - 0.25 * s); p.lineTo(cx + 0.7 * s, cy + 0.3 * s); p.closePath();
      for (let k = 0; k < 4; k++) { p.moveTo(cx - 0.6 * s + k * 0.3 * s, cy - 0.15 * s); p.lineTo(cx - 0.4 * s + k * 0.3 * s, cy - 0.15 * s); p.lineTo(cx - 0.4 * s + k * 0.3 * s, cy); p.lineTo(cx - 0.6 * s + k * 0.3 * s, cy); p.closePath(); }
      p.moveTo(cx - 0.32 * s, cy + 0.33 * s); p.arc(cx - 0.4 * s, cy + 0.33 * s, 0.09 * s, 0, TAU);
      p.moveTo(cx + 0.48 * s, cy + 0.33 * s); p.arc(cx + 0.4 * s, cy + 0.33 * s, 0.09 * s, 0, TAU);
      ear(cx - 0.5 * s, cy - 0.25 * s, 1); ear(cx + 0.45 * s, cy - 0.25 * s, -1);
      break;
    case 7: // a cat in a box
      p.moveTo(cx - 0.45 * s, cy); p.lineTo(cx + 0.45 * s, cy); p.lineTo(cx + 0.4 * s, cy + 0.5 * s); p.lineTo(cx - 0.4 * s, cy + 0.5 * s); p.closePath();
      p.moveTo(cx - 0.45 * s, cy); p.lineTo(cx - 0.6 * s, cy - 0.15 * s); p.moveTo(cx + 0.45 * s, cy); p.lineTo(cx + 0.62 * s, cy - 0.12 * s);
      headAt(cx, cy - 0.15 * s, 0.22 * s);
      break;
    case 8: // a cat in a party hat
      headAt(cx, cy, 0.3 * s);
      p.moveTo(cx - 0.1 * s, cy - 0.28 * s); p.lineTo(cx + 0.05 * s, cy - 0.75 * s); p.lineTo(cx + 0.18 * s, cy - 0.26 * s);
      p.moveTo(cx + 0.09 * s, cy - 0.78 * s); p.arc(cx + 0.05 * s, cy - 0.78 * s, 0.04 * s, 0, TAU);
      p.moveTo(cx - 0.15 * s, cy + 0.32 * s); p.bezierCurveTo(cx - 0.4 * s, cy + 0.6 * s, cx + 0.4 * s, cy + 0.6 * s, cx + 0.15 * s, cy + 0.32 * s);
      break;
    case 9: // a very long cat
      headAt(cx - 0.6 * s, cy - 0.05 * s, 0.17 * s);
      p.moveTo(cx - 0.48 * s, cy - 0.15 * s); p.lineTo(cx + 0.75 * s, cy - 0.15 * s); p.moveTo(cx - 0.48 * s, cy + 0.1 * s); p.lineTo(cx + 0.75 * s, cy + 0.1 * s);
      for (let k = 0; k < 6; k++) { p.moveTo(cx - 0.3 * s + k * 0.18 * s, cy - 0.15 * s); p.lineTo(cx - 0.33 * s + k * 0.18 * s, cy - 0.02 * s); }
      break;
    default: // you, small, with him beside you (the last drawing)
      p.moveTo(cx - 0.2 * s, cy - 0.45 * s); p.arc(cx - 0.25 * s, cy - 0.45 * s, 0.13 * s, 0, TAU);
      p.moveTo(cx - 0.42 * s, cy - 0.32 * s); p.quadraticCurveTo(cx - 0.25 * s, cy - 0.38 * s, cx - 0.08 * s, cy - 0.32 * s);
      p.lineTo(cx - 0.05 * s, cy + 0.15 * s); p.lineTo(cx - 0.45 * s, cy + 0.15 * s); p.closePath();
      p.moveTo(cx - 0.35 * s, cy + 0.15 * s); p.lineTo(cx - 0.36 * s, cy + 0.6 * s); p.moveTo(cx - 0.15 * s, cy + 0.15 * s); p.lineTo(cx - 0.14 * s, cy + 0.6 * s);
      headAt(cx + 0.35 * s, cy + 0.05 * s, 0.15 * s);
      p.moveTo(cx + 0.25 * s, cy + 0.17 * s); p.bezierCurveTo(cx + 0.1 * s, cy + 0.4 * s, cx + 0.2 * s, cy + 0.6 * s, cx + 0.38 * s, cy + 0.6 * s);
      p.bezierCurveTo(cx + 0.55 * s, cy + 0.6 * s, cx + 0.55 * s, cy + 0.3 * s, cx + 0.45 * s, cy + 0.16 * s);
      p.moveTo(cx + 0.27 * s, cy - 0.07 * s); p.lineTo(cx + 0.22 * s, cy - 0.16 * s); // the bent ear tip
  }
}
function icon(p, v, cx, cy, s) {
  switch (v % 12) {
    case 0: // hay bale
      p.moveTo(cx - s, cy + s * 0.5); p.lineTo(cx - s, cy - s * 0.4); p.quadraticCurveTo(cx, cy - s * 0.7, cx + s, cy - s * 0.4); p.lineTo(cx + s, cy + s * 0.5); p.closePath();
      p.moveTo(cx - s * 0.4, cy - s * 0.5); p.lineTo(cx - s * 0.4, cy + s * 0.5); p.moveTo(cx + s * 0.4, cy - s * 0.5); p.lineTo(cx + s * 0.4, cy + s * 0.5);
      for (let k = 0; k < 4; k++) { p.moveTo(cx - s * 0.9 + k * 0.5 * s, cy - s * 0.1); p.lineTo(cx - s * 0.7 + k * 0.5 * s, cy + s * 0.05); }
      break;
    case 1: // café cup with steam
      p.moveTo(cx - s * 0.6, cy - s * 0.2); p.lineTo(cx - s * 0.5, cy + s * 0.5); p.lineTo(cx + s * 0.45, cy + s * 0.5); p.lineTo(cx + s * 0.55, cy - s * 0.2); p.closePath();
      p.moveTo(cx + s * 0.55, cy - s * 0.05); p.arc(cx + s * 0.62, cy + s * 0.12, s * 0.2, -1.4, 1.6);
      p.moveTo(cx - s * 0.2, cy - s * 0.35); p.bezierCurveTo(cx - s * 0.4, cy - s * 0.6, cx, cy - s * 0.7, cx - s * 0.2, cy - s);
      p.moveTo(cx + s * 0.15, cy - s * 0.35); p.bezierCurveTo(cx - s * 0.05, cy - s * 0.6, cx + s * 0.35, cy - s * 0.7, cx + s * 0.15, cy - s);
      break;
    case 2: // clock
      p.moveTo(cx + s * 0.7, cy); p.arc(cx, cy, s * 0.7, 0, TAU);
      p.moveTo(cx, cy); p.lineTo(cx, cy - s * 0.5); p.moveTo(cx, cy); p.lineTo(cx + s * 0.35, cy + s * 0.15);
      for (let k = 0; k < 12; k += 3) { const a = k / 12 * TAU; p.moveTo(cx + Math.cos(a) * s * 0.55, cy + Math.sin(a) * s * 0.55); p.lineTo(cx + Math.cos(a) * s * 0.66, cy + Math.sin(a) * s * 0.66); }
      break;
    case 3: // manor stair
      p.moveTo(cx - s, cy + s * 0.6);
      for (let k = 0; k < 5; k++) { p.lineTo(cx - s + k * 0.4 * s, cy + s * 0.6 - k * 0.3 * s); p.lineTo(cx - s + (k + 1) * 0.4 * s, cy + s * 0.6 - k * 0.3 * s); }
      p.moveTo(cx - s * 0.9, cy + s * 0.2); p.lineTo(cx + s * 0.9, cy - s * 0.75);
      break;
    case 4: // lava rock
      p.moveTo(cx - s, cy + s * 0.4); p.lineTo(cx - s * 0.7, cy - s * 0.3); p.lineTo(cx - s * 0.1, cy - s * 0.55); p.lineTo(cx + s * 0.6, cy - s * 0.35); p.lineTo(cx + s, cy + s * 0.4); p.closePath();
      p.moveTo(cx - s * 0.4, cy - s * 0.2); p.lineTo(cx - s * 0.1, cy + s * 0.1); p.lineTo(cx + s * 0.2, cy - s * 0.1); p.moveTo(cx - s * 0.1, cy + s * 0.1); p.lineTo(cx - s * 0.05, cy + s * 0.4);
      break;
    case 5: // tree
      p.moveTo(cx, cy + s * 0.6); p.lineTo(cx, cy - s * 0.1); p.moveTo(cx + s * 0.6, cy - s * 0.35); p.ellipse(cx, cy - s * 0.35, s * 0.6, s * 0.45, 0, 0, TAU);
      break;
    case 6: // fountain
      p.moveTo(cx - s, cy + s * 0.5); p.lineTo(cx + s, cy + s * 0.5); p.moveTo(cx - s * 0.8, cy + s * 0.5); p.lineTo(cx - s * 0.7, cy + s * 0.1); p.lineTo(cx + s * 0.7, cy + s * 0.1); p.lineTo(cx + s * 0.8, cy + s * 0.5);
      p.moveTo(cx, cy + s * 0.1); p.lineTo(cx, cy - s * 0.5); p.moveTo(cx, cy - s * 0.5); p.quadraticCurveTo(cx - s * 0.5, cy - s * 0.6, cx - s * 0.6, cy); p.moveTo(cx, cy - s * 0.5); p.quadraticCurveTo(cx + s * 0.5, cy - s * 0.6, cx + s * 0.6, cy);
      break;
    case 7: // mushroom
      p.moveTo(cx - s * 0.8, cy); p.quadraticCurveTo(cx, cy - s * 1.1, cx + s * 0.8, cy); p.closePath(); p.moveTo(cx - s * 0.2, cy); p.lineTo(cx - s * 0.25, cy + s * 0.6); p.lineTo(cx + s * 0.25, cy + s * 0.6); p.lineTo(cx + s * 0.2, cy);
      break;
    case 8: // crescent moon
      p.moveTo(cx + s * 0.2, cy - s * 0.7); p.arc(cx, cy, s * 0.72, -1.3, 1.3, true); p.arc(cx + s * 0.35, cy, s * 0.6, 1.4, -1.4);
      break;
    case 9: // lantern
      p.moveTo(cx - s * 0.4, cy - s * 0.4); p.lineTo(cx + s * 0.4, cy - s * 0.4); p.lineTo(cx + s * 0.3, cy + s * 0.5); p.lineTo(cx - s * 0.3, cy + s * 0.5); p.closePath(); p.moveTo(cx - s * 0.2, cy - s * 0.4); p.quadraticCurveTo(cx, cy - s * 0.8, cx + s * 0.2, cy - s * 0.4);
      break;
    case 10: // bridge
      p.moveTo(cx - s, cy + s * 0.4); p.quadraticCurveTo(cx, cy - s * 0.6, cx + s, cy + s * 0.4); p.moveTo(cx - s, cy); p.quadraticCurveTo(cx, cy - s, cx + s, cy);
      for (let k = -2; k <= 2; k++) { p.moveTo(cx + k * 0.35 * s, cy - s * 0.4 + Math.abs(k) * 0.12 * s); p.lineTo(cx + k * 0.35 * s, cy + s * 0.1 + Math.abs(k) * 0.12 * s); }
      break;
    default: // a door
      p.moveTo(cx - s * 0.45, cy + s * 0.6); p.lineTo(cx - s * 0.45, cy - s * 0.3); p.arc(cx, cy - s * 0.3, s * 0.45, Math.PI, 0); p.lineTo(cx + s * 0.45, cy + s * 0.6); p.moveTo(cx + s * 0.3, cy + s * 0.1); p.arc(cx + s * 0.25, cy + s * 0.1, s * 0.05, 0, TAU);
  }
}
const PAPERS = ["#7c5c46", "#5e6a64", "#86685a", "#6a5866", "#7a6a4a", "#5a5248"];
function posterArt(g, P, w, h, flashIcon = 0) {
  const base = PAPERS[Math.floor(P.paper * PAPERS.length)];
  // torn paper sheet
  const sheet = new Path2D();
  const R = K.rng("sheet" + P.i);
  sheet.moveTo(0, 0); sheet.lineTo(w * (0.6 + R() * 0.3), R() * 2); sheet.lineTo(w, 0);
  sheet.lineTo(w - R() * 2, h * 0.5); sheet.lineTo(w, h);
  if (R() > 0.5) { sheet.lineTo(w * 0.2, h); sheet.lineTo(0, h * 0.8); } else sheet.lineTo(0, h);
  sheet.closePath();
  const pg = g.createLinearGradient(0, 0, w, h);
  pg.addColorStop(0, K.shade(base, 0.12));
  pg.addColorStop(0.6, base);
  pg.addColorStop(1, K.shade(base, -0.25));
  g.fillStyle = pg;
  g.fill(sheet);
  g.save();
  g.clip(sheet);
  // ghost of the old print (a faded advert)
  g.fillStyle = K.rgba(K.shade(base, -0.3), 0.35);
  g.fillRect(w * 0.08, h * 0.08, w * 0.84, h * 0.12);
  for (let k = 0; k < 3; k++) g.fillRect(w * 0.1, h * (0.72 + k * 0.07), w * (0.4 + R() * 0.4), h * 0.025);
  // stains
  for (let k = 0; k < 3; k++) {
    const sx = R() * w, sy = R() * h, sr = (0.15 + R() * 0.25) * w;
    const sg = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sg.addColorStop(0, "rgba(40,24,12,0.25)"); sg.addColorStop(0.8, "rgba(40,24,12,0.08)"); sg.addColorStop(1, "rgba(40,24,12,0)");
    g.fillStyle = sg; g.fillRect(0, 0, w, h);
  }
  // scratched sketch, location mark, and the scratched outline where the pawprint sits
  const lw = Math.max(0.55, w / 70);
  const sk = new Path2D();
  sketchCat(sk, P.i === LAST ? 10 : (P.i * 7) % 10, w * 0.4, h * 0.4, w * 0.36);
  scratch(g, sk, lw, P.i);
  const ic = new Path2D();
  icon(ic, (P.i - 9 + 120) % 12, w * 0.4, h * 0.8, w * 0.13);
  scratch(g, ic, lw * 0.85, P.i + 50);
  if (flashIcon > 0) {
    g.save(); g.globalCompositeOperation = "lighter";
    g.strokeStyle = K.rgba("#ffd890", 0.8 * flashIcon); g.lineWidth = lw * 1.4; g.stroke(ic);
    g.restore();
  }
  // edge darkening + pin
  const eg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  eg.addColorStop(0, "rgba(20,10,4,0)"); eg.addColorStop(1, "rgba(20,10,4,0.45)");
  g.fillStyle = eg; g.fillRect(0, 0, w, h);
  g.restore();
  // a torn-off corner (shows the wall behind) and strips of old yellowed tape
  if (P.tear > 0.55) {
    const cx = P.tear > 0.78 ? w : 0, s2 = w * (0.12 + (P.tear - 0.55) * 0.3);
    const d = cx ? -1 : 1;
    g.save();
    g.globalCompositeOperation = "destination-out";
    g.beginPath(); g.moveTo(cx, h); g.lineTo(cx + d * s2, h); g.lineTo(cx + d * s2 * 0.7, h - s2 * 0.3); g.lineTo(cx + d * s2 * 0.45, h - s2 * 0.5); g.lineTo(cx + d * s2 * 0.1, h - s2 * 0.75); g.lineTo(cx, h - s2); g.closePath(); g.fill();
    g.restore();
  }
  const tape = (x, y, a) => {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = "rgba(226,206,150,0.55)"; g.fillRect(-w * 0.1, -h * 0.035, w * 0.2, h * 0.07);
    g.fillStyle = "rgba(255,240,200,0.25)"; g.fillRect(-w * 0.1, -h * 0.035, w * 0.2, h * 0.02);
    g.restore();
  };
  if (P.tape > 0.35) { tape(w * 0.06, h * 0.04, -0.7); tape(w * 0.94, h * 0.04, 0.7); }
  else { g.fillStyle = "#b8a070"; g.beginPath(); g.arc(w * 0.5, h * 0.05, Math.max(1, w * 0.025), 0, TAU); g.fill(); }
}
function posterSprite(P) {
  return K.sprite("f16:poster" + P.i, P.w * 2.2, P.h * 2.2, (s) => { s.scale(2.2, 2.2); posterArt(s, P, P.w, P.h); });
}
function plasterSprite() {
  return K.sprite("f16:plaster", 480, 270, (s) => {
    const R = K.rng("plaster");
    s.fillStyle = "#4e3426";
    s.fillRect(0, 0, 480, 270);
    for (let i = 0; i < 90; i++) {
      const x = R() * 480, y = R() * 270, r = 10 + R() * 60;
      const gg = s.createRadialGradient(x, y, 0, x, y, r);
      const c = R() > 0.5 ? "120,84,60" : "40,24,16";
      gg.addColorStop(0, `rgba(${c},${0.12 + R() * 0.12})`); gg.addColorStop(1, `rgba(${c},0)`);
      s.fillStyle = gg; s.fillRect(x - r, y - r, r * 2, r * 2);
    }
    s.strokeStyle = "rgba(30,18,10,0.35)"; s.lineWidth = 0.7;
    for (let i = 0; i < 12; i++) { let x = R() * 480, y = R() * 270; s.beginPath(); s.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 30; y += R() * 18; s.lineTo(x, y); } s.stroke(); }
  });
}

// the room: o = { dark, t, waveR, wave0:[x,y], gold, posterVector, wallLit }
function printLevel(P, t, o) {
  let lv = P.i === LAST ? 0.06 : P.lit * (0.85 + 0.15 * Math.sin(t * 1.3 + P.ph));
  if (o.boost) lv = Math.max(lv, P.i === LAST ? 0.06 : K.lerp(lv, 0.75, o.boost * (0.4 + 0.6 * K.hash(P.i, 3))));
  if (o.waveR != null) {
    const [px, py] = printPos(P);
    const d = Math.hypot(px - o.wave0[0], py - o.wave0[1]);
    const k = K.smooth((o.waveR - d) / 50);
    lv = Math.max(lv, k * 1.1);
  }
  return lv;
}
function candle(g, x, y, h, w, t, i, bright) {
  const fl = 0.85 + 0.15 * K.noise(t * 6 + i * 3.1, i) + 0.06 * Math.sin(t * 17 + i);
  K.glow(g, x, y - h - w * 0.8, w * 14 * fl * bright, "#ff9a3a", 0.18);
  const cg = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  cg.addColorStop(0, "#8a6a4a"); cg.addColorStop(0.35, "#f0dfc0"); cg.addColorStop(0.7, "#d8c4a0"); cg.addColorStop(1, "#6a5038");
  g.fillStyle = cg;
  const j = (k) => (K.hash(i, k) - 0.5) * w * 0.35;
  g.beginPath();
  g.moveTo(x - w / 2, y); g.lineTo(x - w / 2, y - h + w * 0.2 + j(1));
  g.lineTo(x - w * 0.2, y - h + j(2) * 0.6); g.quadraticCurveTo(x, y - h - w * 0.15, x + w * 0.22, y - h + j(3) * 0.5);
  g.lineTo(x + w / 2, y - h + w * 0.3 + j(4)); g.lineTo(x + w / 2, y); g.closePath();
  g.fill();
  // wax drips + translucent wax glow at the top
  g.fillStyle = "rgba(255,230,180,0.6)";
  for (let k = 0; k < 3; k++) {
    const dx = (K.hash(i, 10 + k) - 0.5) * w * 0.8, dl = w * (0.4 + K.hash(i, 20 + k) * 1.3);
    g.beginPath(); g.ellipse(x + dx, y - h + w * 0.2 + dl * 0.5, w * 0.1, dl * 0.5, 0, 0, TAU); g.fill();
    g.beginPath(); g.arc(x + dx, y - h + w * 0.2 + dl, w * 0.13, 0, TAU); g.fill();
  }
  const tg = g.createLinearGradient(0, y - h, 0, y - h + w * 1.5);
  tg.addColorStop(0, "rgba(255,200,120,0.75)"); tg.addColorStop(1, "rgba(255,200,120,0)");
  g.fillStyle = tg; g.fillRect(x - w / 2, y - h, w, w * 1.5);
  g.strokeStyle = "#2a1a10"; g.lineWidth = Math.max(0.6, w * 0.08);
  g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + w * 0.03, y - h - w * 0.3); g.stroke();
  // flame
  const fx = x + K.noise(t * 3 + i, i + 9) * w * 0.12, fy = y - h - w * 0.3;
  const fh = w * 1.15 * fl, fw = w * 0.34;
  const fg = g.createRadialGradient(fx, fy - fh * 0.25, 0, fx, fy - fh * 0.3, fh * 0.7);
  fg.addColorStop(0, "#fffbe8"); fg.addColorStop(0.35, "#ffd27a"); fg.addColorStop(0.8, "rgba(255,140,40,0.6)"); fg.addColorStop(1, "rgba(255,120,30,0)");
  g.fillStyle = fg;
  g.beginPath(); g.moveTo(fx, fy - fh); g.bezierCurveTo(fx + fw, fy - fh * 0.4, fx + fw * 0.8, fy, fx, fy + fw * 0.2); g.bezierCurveTo(fx - fw * 0.8, fy, fx - fw, fy - fh * 0.4, fx, fy - fh); g.fill();
  K.glow(g, fx, fy - fh * 0.35, w * 3 * fl, "#ffcf6a", 0.55 * bright);
}
const CANDLES = (() => {
  const R = K.rng("f16candles");
  const out = [];
  for (let i = 0; i < 17; i++) {
    const x = 250 + R() * 460, y = 394 + R() * 40;
    out.push({ x, y, h: 10 + R() * 26, w: 5 + R() * 3, i });
  }
  return out.sort((a, b) => a.y - b.y);
})();
// one floor pool per cluster of candles: [x, y, radius]
const CANDLE_POOLS = (() => {
  const out = [];
  for (const c of CANDLES) {
    const hit = out.find((q) => Math.abs(q[0] - c.x) < 70);
    if (hit) { hit[0] = (hit[0] + c.x) / 2; hit[2] += 14; } else out.push([c.x, c.y + 4, 90]);
  }
  return out;
})();

function room(g, W, H, t, o) {
  const dark = o.dark == null ? 0.4 : o.dark;
  // ceiling and darkness all round
  g.fillStyle = "#120a07";
  g.fillRect(-W, -H, W * 3, H * 3);
  // back wall plaster
  const ps = plasterSprite();
  g.drawImage(ps, WALL.x0, WALL.y0 - 40, WALL.x1 - WALL.x0, WALL.y1 - WALL.y0 + 40);
  // left and right walls
  g.fillStyle = "#2e1e16";
  g.beginPath(); g.moveTo(-40, -40); g.lineTo(WALL.x0, WALL.y0); g.lineTo(WALL.x0, WALL.y1); g.lineTo(-40, 600); g.closePath(); g.fill();
  g.fillStyle = "#26180f";
  g.beginPath(); g.moveTo(1000, -40); g.lineTo(WALL.x1, WALL.y0); g.lineTo(WALL.x1, WALL.y1); g.lineTo(1000, 600); g.closePath(); g.fill();
  // ceiling beam
  g.fillStyle = "#0d0705";
  g.beginPath(); g.moveTo(-40, -40); g.lineTo(1000, -40); g.lineTo(WALL.x1, WALL.y0); g.lineTo(WALL.x0, WALL.y0); g.closePath(); g.fill();
  // floor boards
  const fg = g.createLinearGradient(0, WALL.y1, 0, 560);
  fg.addColorStop(0, "#3a2418"); fg.addColorStop(1, "#1c110b");
  g.fillStyle = fg;
  g.beginPath(); g.moveTo(WALL.x0, WALL.y1); g.lineTo(WALL.x1, WALL.y1); g.lineTo(1000, 600); g.lineTo(-40, 600); g.closePath(); g.fill();
  g.strokeStyle = "rgba(10,5,2,0.55)";
  g.lineWidth = 1;
  g.beginPath();
  for (let k = -14; k <= 14; k++) {
    const bx = 480 + k * 42;
    const ex = VP[0] + (bx - VP[0]) * ((600 - VP[1]) / (WALL.y1 - VP[1]));
    g.moveTo(bx, WALL.y1); g.lineTo(ex, 600);
  }
  g.stroke();
  // the window in the left wall (slats) and the door in the right wall
  windowLeft(g, t, o);
  doorRight(g, t, o);
  // posters (skip the ones the camera cannot see: the close-ups paint them as vectors)
  let vb = null;
  try {
    const inv = g.getTransform().inverse(), cw = g.canvas ? g.canvas.width : 0, chh = g.canvas ? g.canvas.height : 0;
    if (cw) { const a = new DOMPoint(0, 0).matrixTransform(inv), b = new DOMPoint(cw, chh).matrixTransform(inv); vb = [Math.min(a.x, b.x) - 60, Math.min(a.y, b.y) - 60, Math.max(a.x, b.x) + 20, Math.max(a.y, b.y) + 20]; }
  } catch (e) { vb = null; }
  for (const P of POSTERS) {
    if (vb && (P.x > vb[2] || P.y > vb[3] || P.x + P.w < vb[0] || P.y + P.h < vb[1])) continue;
    g.save();
    g.translate(P.x, P.y);
    g.rotate(P.rot);
    g.fillStyle = "rgba(10,5,2,0.4)";
    g.fillRect(2, 3, P.w, P.h);
    if (o.posterVector) posterArt(g, P, P.w, P.h, o.iconFlash || 0);
    else g.drawImage(posterSprite(P), 0, 0, P.w, P.h);
    g.restore();
  }
  // darkness over the wall (the eye adjusting)
  if (dark > 0) {
    g.fillStyle = `rgba(14,8,5,${dark})`;
    g.fillRect(WALL.x0 - 200, WALL.y0 - 100, WALL.x1 - WALL.x0 + 400, WALL.y1 - WALL.y0 + 100);
  }
  // pawprints beside every drawing
  const pts = [];
  for (const P of POSTERS) {
    const lv = printLevel(P, t, o);
    const [px, py] = printPos(P);
    pts.push({ x: px, y: py, s: P.w * 0.09, a: P.rot - 0.2, flat: 1, alpha: K.clamp(lv) });
    if (lv > 0.5 && o.wallLit) K.glow(g, px, py, P.w * 0.9, "#ff9a3a", 0.12 * lv * o.wallLit);
  }
  K.pawprints(g, pts, 0.8);
  // gold wash from the lit wall
  if (o.gold) {
    g.save();
    g.globalCompositeOperation = "soft-light";
    g.fillStyle = K.rgba("#ffb347", 0.55 * o.gold);
    g.fillRect(WALL.x0, WALL.y0 - 40, WALL.x1 - WALL.x0, WALL.y1 - WALL.y0 + 40);
    g.restore();
    g.save();
    g.globalCompositeOperation = "lighter";
    K.glow(g, 480, 220, 560, "#ffb347", 0.35 * o.gold);
    g.save();
    g.translate(480, WALL.y1 + 10);
    g.scale(1, 0.28);
    K.glow(g, 0, 0, 520, "#ffcf6a", 0.45 * o.gold);
    g.restore();
    g.restore();
  }
  // candle light: a warm bottom-lit falloff up the wall, and an additive pool on the floor per cluster
  const cl = o.candle == null ? 1 : o.candle;
  g.save();
  g.globalCompositeOperation = "lighter";
  const wl = g.createLinearGradient(0, WALL.y1, 0, WALL.y1 - 230);
  wl.addColorStop(0, K.rgba("#ff8a2a", 0.3 * cl)); wl.addColorStop(0.45, K.rgba("#ff7a1a", 0.09 * cl)); wl.addColorStop(1, K.rgba("#ff7a1a", 0));
  g.fillStyle = wl;
  g.beginPath(); g.ellipse(480, WALL.y1, 330, 230, 0, Math.PI, TAU); g.fill();
  for (const c of CANDLE_POOLS) {
    g.save(); g.translate(c[0], c[1]); g.scale(1, 0.3);
    const pg = g.createRadialGradient(0, 0, 0, 0, 0, c[2]);
    pg.addColorStop(0, K.rgba("#ffb04a", 0.5 * cl)); pg.addColorStop(0.4, K.rgba("#ff8a2a", 0.18 * cl)); pg.addColorStop(1, K.rgba("#ff7a1a", 0));
    g.fillStyle = pg; g.beginPath(); g.arc(0, 0, c[2], 0, TAU); g.fill();
    g.restore();
  }
  g.restore();
  K.glow(g, 480, 400, 300, "#ff8a2a", 0.14 * cl);
}
function windowLeft(g, t, o) {
  // opening in the left wall (perspective quad) with slats
  const q = [[22, 112], [84, 134], [84, 300], [22, 318]];
  g.save();
  g.beginPath(); g.moveTo(q[0][0], q[0][1]); for (const p of q.slice(1)) g.lineTo(p[0], p[1]); g.closePath();
  g.clip();
  const sg = g.createLinearGradient(0, 112, 0, 318);
  sg.addColorStop(0, "#ffd0e8"); sg.addColorStop(1, "#ff8ac8");
  g.fillStyle = sg; g.fillRect(0, 100, 100, 230);
  g.fillStyle = "#1c120c";
  for (let k = 0; k < 11; k++) {
    const yl = K.lerp(112, 318, k / 11), yr = K.lerp(134, 300, k / 11);
    g.beginPath(); g.moveTo(20, yl); g.lineTo(86, yr); g.lineTo(86, yr + 10.5); g.lineTo(20, yl + 12); g.closePath(); g.fill();
  }
  g.restore();
  K.glow(g, 55, 215, 90, "#ff9ad8", 0.35);
}
function doorRight(g, t, o) {
  const open = o.door || 0;
  const q = [[880, 120], [930, 100], [930, 486], [880, 446]];
  g.fillStyle = "#1a100a";
  g.beginPath(); g.moveTo(q[0][0], q[0][1]); for (const p of q.slice(1)) g.lineTo(p[0], p[1]); g.closePath(); g.fill();
  if (open > 0) {
    g.save();
    g.clip();
    // light beyond the door: hot at the centre, falling off to the frame (a bloom, not a flat fill)
    const dg = g.createRadialGradient(915, 290, 10, 905, 300, 230);
    dg.addColorStop(0, K.rgba("#fffaf0", open)); dg.addColorStop(0.35, K.rgba("#ffe7a8", 0.92 * open)); dg.addColorStop(1, K.rgba("#d89a50", 0.75 * open));
    g.fillStyle = dg; g.fillRect(870, 90, 70, 410);
    g.restore();
    K.glow(g, 905, 300, 300, "#ffe7a8", 0.45 * open);
    K.glow(g, 905, 300, 120, "#fff6dc", 0.35 * open);
    // light spilling onto the floor
    g.save();
    g.globalCompositeOperation = "lighter";
    g.fillStyle = K.rgba("#ffe7a8", 0.22 * open);
    g.beginPath(); g.moveTo(880, 446); g.lineTo(930, 486); g.lineTo(760, 560); g.lineTo(620, 520); g.closePath(); g.fill();
    g.restore();
  } else {
    g.strokeStyle = "rgba(255,200,150,0.08)"; g.lineWidth = 2; g.stroke();
  }
}
function slatLight(g, W, H, t, strength) {
  g.save();
  g.globalCompositeOperation = "lighter";
  const a = 0.36;
  const dx = Math.cos(a), dy = Math.sin(a);
  for (let k = 0; k < 10; k++) {
    const y0 = K.lerp(124, 306, (k + 0.5) / 11);
    const x0 = 62;
    const L = 780;
    const wv = 4.5 + (k % 3) * 0.8;
    const flick = 0.85 + 0.15 * Math.sin(t * 0.5 + k * 1.7);
    // three nested bands (wide+faint to narrow+bright) feather the edges; alpha falls off with distance
    for (const [wk, ak] of [[2.6, 0.22], [1.6, 0.34], [0.8, 0.5]]) {
      const gr = g.createLinearGradient(x0, y0, x0 + dx * L, y0 + dy * L);
      gr.addColorStop(0, K.rgba("#ffb0dc", 0.42 * ak * strength * flick));
      gr.addColorStop(0.3, K.rgba("#ff9ad8", 0.2 * ak * strength * flick));
      gr.addColorStop(0.7, K.rgba("#ff9ad8", 0.05 * ak * strength * flick));
      gr.addColorStop(1, K.rgba("#ff9ad8", 0));
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(x0, y0 - wv * wk * 0.5);
      g.lineTo(x0 + dx * L, y0 + dy * L - wv * 1.8 * wk);
      g.lineTo(x0 + dx * L, y0 + dy * L + wv * 1.8 * wk);
      g.lineTo(x0, y0 + wv * wk * 0.5);
      g.closePath();
      g.fill();
    }
  }
  // dust motes that sparkle only while they drift through a beam
  for (let i = 0; i < 90; i++) {
    const k = i % 10;
    const y0 = K.lerp(124, 306, (k + 0.5) / 11);
    const u = (K.hash(i, 81) + t * 0.012 * (0.5 + K.hash(i, 82))) % 1;
    const along = 30 + u * 560;
    const off = (K.hash(i, 83) - 0.5) * (4.5 + along * 0.012) * 2.4 + Math.sin(t * 0.7 + i) * 2;
    const px = 62 + dx * along - dy * off, py = y0 + dy * along + dx * off;
    const tw = 0.5 + 0.5 * Math.sin(t * (1.5 + K.hash(i, 84) * 2) + i * 2.1);
    g.fillStyle = K.rgba("#ffe0f0", (0.25 + 0.6 * tw * tw) * (1 - u * 0.8) * strength);
    g.beginPath(); g.arc(px, py, 0.7 + K.hash(i, 85) * 1.1, 0, TAU); g.fill();
  }
  // striped light where the shafts fall on the floor
  for (let k = 0; k < 6; k++) {
    const fx = 300 + k * 40, fy = 430 + k * 8;
    g.fillStyle = K.rgba("#ff9ad8", 0.16 * strength);
    g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + 120, fy + 44); g.lineTo(fx + 134, fy + 44); g.lineTo(fx + 14, fy); g.closePath(); g.fill();
  }
  g.restore();
  K.dust(g, W, H, t, { seed: 16, color: "#ffc8e8", count: 18, size: 1.1, area: [60, 120, 720, 380], alpha: 0.25 * strength });
}

// ---- Sir Whiskers (the Shadow) ----------------------------------------------------------------------------
const SHADOW = { base: "#0d0f18", light: "#1a1e2c", dark: "#07080d", stripe: "#0d0f18", tip: "#0d0f18", belly: "#10121c", pattern: "solid", bib: false, socks: false, muzzle: false, iris: "#6a7c9c", irisInner: "#bcd6ff", nose: "#151820", noseEdge: "#0a0c12", innerEar: "#1a1e2c", bentEar: false };
const OLD = { base: "#d9995a", light: "#f2c890", dark: "#a8683a", stripe: "#8a4a1c", tip: "#7a3a10", belly: "#f6e6cc", white: "#fbf6ee", bib: true, socks: "all", muzzle: true, stripeAlpha: 0.55, iris: "#c8b04a", irisInner: "#f0d27a", bentEar: false };
// The Shadow as a true BACKLIT silhouette: drawCat is painted once per gait step, flattened to a single
// #0d0f18 body (source-in, so no front light survives), and a matching cold #bcd6ff edge-light sprite is
// cut from it. Per frame we only composite: a blurred smoky halo, the body at 0.85 and the rim.
const SH_SC = 1.6;
function shadowSprites(size, pose, q, f, steps) {
  const SW = size * 3.6, SH = size * 2.6, ox = SW / 2, oy = SH * 0.9;
  const key = "f16:shd:" + pose + ":" + q + ":" + f + ":" + size;
  const thinX = 0.84, thinY = 1.12;
  const S = size / 60;
  const sil = K.sprite(key, SW * SH_SC, SH * SH_SC, (s) => {
    s.scale(SH_SC, SH_SC);
    s.translate(ox, oy); s.scale(thinX, thinY); s.translate(-ox, -oy);
    K.drawCat(s, ox, oy, size, { pose, phase: q / steps, t: (q / steps) * 2.3, facing: f, coat: SHADOW, collar: false, bell: false, shadow: false, tail: 0.6, headTurn: 0.1, blink: 0.3 });
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = "source-in";
    s.fillStyle = "#0d0f18";
    s.fillRect(0, 0, SW * SH_SC, SH * SH_SC);
    s.globalCompositeOperation = "source-over";
    // two pale eye-shines: the only detail you can make out
    s.scale(SH_SC, SH_SC);
    const hx = ox + f * S * 57 * thinX, hy = oy - S * 76 * thinY;
    for (const e of [-1, 1]) {
      const gx = hx + e * S * 3.6 - f * S * 1.5, gy = hy + e * S * 0.4;
      const gg = s.createRadialGradient(gx, gy, 0, gx, gy, S * 2.4);
      gg.addColorStop(0, "rgba(220,236,255,0.95)"); gg.addColorStop(0.4, "rgba(188,214,255,0.4)"); gg.addColorStop(1, "rgba(188,214,255,0)");
      s.fillStyle = gg; s.fillRect(gx - S * 3, gy - S * 3, S * 6, S * 6);
    }
  });
  const rim = K.sprite(key + ":rim", SW * SH_SC, SH * SH_SC, (s) => {
    s.drawImage(sil, 0, 0);
    s.globalCompositeOperation = "source-in";
    s.fillStyle = "#bcd6ff";
    s.fillRect(0, 0, SW * SH_SC, SH * SH_SC);
    // keep only a thin edge: cut the silhouette shifted toward the camera (light comes from behind/above)
    s.globalCompositeOperation = "destination-out";
    s.drawImage(sil, -f * 2.2, 3.4);
    s.drawImage(sil, f * 1.2, 2.2);
  });
  return { sil, rim, SW, SH, ox, oy };
}
function shadowCat(g, x, y, size, o) {
  const steps = 8;
  const pose = o.pose || "stand", f = o.facing || -1;
  const q = pose === "walk" ? Math.floor(((((o.phase || 0) % 1) + 1) % 1) * steps) : 0;
  const sp = shadowSprites(size, pose, q, f, steps);
  const al = o.alpha == null ? 1 : o.alpha;
  const dx = x - sp.ox, dy = y - sp.oy;
  g.save();
  // smoky edge: a blurred copy of the body spreads ~70% opacity smoke past the outline
  if (K.hasFilter()) {
    g.filter = "blur(7px)";
    g.globalAlpha = 0.7 * al;
    g.drawImage(sp.sil, dx, dy, sp.SW, sp.SH);
    g.filter = "blur(1.2px)";
  }
  g.globalAlpha = 0.86 * al;
  g.drawImage(sp.sil, dx, dy, sp.SW, sp.SH);
  g.filter = "none";
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = (K.hasFilter() ? 0.3 : 0.8) * al;
  g.drawImage(sp.rim, dx, dy, sp.SW, sp.SH);
  if (K.hasFilter()) {
    g.filter = "blur(1.6px)";
    g.globalAlpha = 0.9 * al;
    g.drawImage(sp.rim, dx, dy, sp.SW, sp.SH);
    g.filter = "blur(6px)";
    g.globalAlpha = 0.6 * al;
    g.drawImage(sp.rim, dx, dy, sp.SW, sp.SH);
    g.filter = "none";
  }
  g.restore();
}
function whiskers(g, W, H, x, y, size, t, o) {
  const rev = K.clamp(o.reveal || 0);
  const f = o.facing || -1;
  const al = o.alpha == null ? 1 : o.alpha;
  const base = { pose: o.pose || "stand", phase: o.phase || 0, facing: f, t, headTurn: o.headTurn == null ? 0.2 : o.headTurn, headTilt: o.headTilt || 0, tail: 0.6, collar: false, bell: false, blink: o.blink == null ? 0.4 : o.blink };
  const sirOpts = (tt) => Object.assign({}, base, { t: tt, coat: OLD, shadow: false, light: { x: x - f * size, y: y - size * 2.4, color: "#bcd6ff", strength: 1.5 } });
  if (rev < 1) shadowCat(g, x, y, size, { pose: o.still ? "stand" : base.pose, phase: base.phase, facing: f, alpha: (1 - rev) * al });
  if (rev <= 0) return;
  if (o.still) {
    // the transformation holds still, so the revealed form is painted once into a cached sprite
    const SC = 2.4, SW = size * 3.4, SH = size * 2.3, ox = SW / 2, oy = SH * 0.9;
    const S2 = K.sprite("f16:sirS" + size + ":" + f + ":" + base.headTurn.toFixed(2) + ":" + base.headTilt.toFixed(2), SW * SC, SH * SC, (s) => { s.scale(SC, SC); K.drawCat(s, ox, oy, size, Object.assign(sirOpts(o.still), { light: { x: ox - f * size, y: oy - size * 2.4, color: "#bcd6ff", strength: 1.5 } })); ruff(s, ox, oy, size, f, o.still, base.pose, base.headTilt); });
    g.save();
    K.glow(g, x + f * size * 0.3, y - size * 1.0, size * 2.2, "#ffe7a8", 0.3 * rev);
    g.globalAlpha = 0.8 * rev * al;
    g.drawImage(S2, x - ox, y - oy, SW, SH);
    g.restore();
    return;
  }
  const L = inLayer(g, W, H, "f16:sir", (s) => {
    K.drawCat(s, x, y, size, sirOpts(t));
    ruff(s, x, y, size, f, t, base.pose, base.headTilt);
  });
  K.glow(g, x + f * size * 0.3, y - size * 1.0, size * 2.2, "#ffe7a8", 0.3 * rev);
  put(g, W, H, L, 0.8 * rev * al);
  K.glow(g, x + f * size * 0.4, y - size * 0.9, size * 1.3, "#ffe7a8", 0.22 * rev);
}
function ruff(g, x, y, S, f, t, pose, tilt) {
  // the long white ruff and beard of an old, wise cat
  const sit = pose === "sit";
  const hx = x + f * S * (sit ? 0.26 : 0.84), hy = y - S * (sit ? 1.5 : 1.32) - (tilt || 0) * S * 0.08;
  const cx = hx - f * S * 0.08, cy = hy + S * 0.24;
  const R = K.rng("ruff");
  g.save();
  g.lineCap = "round";
  for (let pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass ? "rgba(255,252,244,0.9)" : "rgba(200,190,175,0.7)";
    g.lineWidth = Math.max(0.6, S * (pass ? 0.012 : 0.02));
    g.beginPath();
    for (let i = 0; i < 70; i++) {
      const u = R(), v = R();
      const a = Math.PI * (0.15 + u * 0.7);
      const r0 = S * 0.12 * v;
      const sx = cx + Math.cos(a) * r0 * 1.6 - f * S * 0.05, sy = cy + Math.sin(a) * r0;
      const len = S * (0.14 + R() * 0.2) * (1 - Math.abs(u - 0.5));
      const sway = Math.sin(t * 0.8 + i) * S * 0.006;
      g.moveTo(sx, sy);
      g.quadraticCurveTo(sx + (u - 0.5) * S * 0.12, sy + len * 0.6, sx + (u - 0.5) * S * 0.08 + sway - f * S * 0.03, sy + len);
    }
    g.stroke();
  }
  g.restore();
}

// ---- flashback set pieces (shot 5) ------------------------------------------------------------------------
function driveScene(g, W, H, t) {
  K.sky(g, W, H, { top: "#1a1236", mid: "#3a2a5e", bottom: "#6a5a8e", horizon: 0.7 });
  K.moon(g, 760, 110, 30, { glow: 0.8 });
  K.hills(g, W, H, { y: 330, amp: 30, color: "#2a2244", seed: 5 });
  // iron gates
  g.strokeStyle = "#141020";
  g.fillStyle = "#141020";
  g.fillRect(90, 160, 34, 230);
  g.fillRect(430, 160, 34, 230);
  g.lineWidth = 4;
  g.beginPath();
  for (let k = 0; k < 13; k++) {
    const x = 132 + k * 23;
    const top = 200 - Math.sin((k / 12) * Math.PI) * 40;
    g.moveTo(x, 390); g.lineTo(x, top);
    g.moveTo(x - 5, top + 6); g.lineTo(x, top - 6); g.lineTo(x + 5, top + 6);
  }
  g.moveTo(124, 250); g.lineTo(430, 250); g.moveTo(124, 360); g.lineTo(430, 360);
  g.stroke();
  K.fog(g, W, H, { y: 380, h: 140, color: "#8a7ab0", alpha: 0.45, t });
  g.fillStyle = "#1e1a2a";
  g.fillRect(0, 400, W, 140);
  const p = K.seg(t, 48.5, 51);
  const bx = K.lerp(560, 650, p);
  const trail = K.pawTrail(bx - 300, 432, bx - 30, 432, 10, 6 + p * 6, { start: 0, every: 0.5, life: 7, s0: 6, s1: 6 });
  K.pawprints(g, trail, 1);
  const moonL = { x: 760, y: 110, color: "#c8d0ff", strength: 1.2 };
  // the Shadow walks BEHIND him
  shadowCat(g, bx - 230, 440, 78, { pose: "walk", phase: t * 0.9, facing: 1 });
  cachedCat(g, bx, 440, 58, { pose: "walk", phase: t * 1.1 + 0.3, facing: 1, bell: false, light: { x: bx + 160, y: 110, color: "#c8d0ff", strength: 1.2 }, tailUp: 0.7 }, "dbiscuit");
  K.fog(g, W, H, { y: 450, h: 80, color: "#8a7ab0", alpha: 0.25, t: t + 3 });
}
function cctvScene(g, W, H, t) {
  // high-angle corridor
  g.fillStyle = "#3a3a3a";
  g.fillRect(0, 0, W, H);
  const fg = g.createLinearGradient(0, 0, 0, H);
  fg.addColorStop(0, "#5a5a58"); fg.addColorStop(1, "#7a7a76");
  g.fillStyle = fg;
  g.beginPath(); g.moveTo(180, 0); g.lineTo(780, 0); g.lineTo(980, H); g.lineTo(-20, H); g.closePath(); g.fill();
  g.strokeStyle = "rgba(30,30,30,0.5)"; g.lineWidth = 1;
  g.beginPath();
  for (let k = 0; k < 12; k++) { const y = k * 48; const x0 = K.lerp(180, -20, y / H), x1 = K.lerp(780, 980, y / H); g.moveTo(x0, y); g.lineTo(x1, y); }
  g.stroke();
  g.fillStyle = "#2a2a2a";
  for (let k = 0; k < 4; k++) g.fillRect(60 + k * 10, 80 + k * 110, 70, 60);
  const p = K.seg(t, 51, 53.5);
  const lead = K.lerp(250, 640, p);
  const path = (x) => [x, 200 + (x - 250) * 0.42];
  const kits = [K.COATS.grey, K.COATS.calico, K.COATS.black];
  for (let k = 2; k >= 0; k--) {
    const [x, y] = path(lead - 70 - k * 52);
    cachedCat(g, x, y, 22, { pose: "walk", phase: t * 1.6 + k * 0.3, facing: 1, coat: kits[k], collar: false }, "cctv" + k);
  }
  const [bx, by] = path(lead);
  cachedCat(g, bx, by, 40, { pose: "walk", phase: t * 1.1, facing: 1, bell: false, tailUp: 0.8 }, "cctvb");
}
function cctvPost(g, W, H, t) {
  g.save();
  g.globalCompositeOperation = "saturation";
  g.fillStyle = "#808080"; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "multiply";
  g.fillStyle = "#8affa6"; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "rgba(0,0,0,0.18)";
  for (let y = (t * 40) % 3; y < H; y += 3) g.fillRect(0, y, W, 1);
  const by = ((t * 0.35) % 1) * H;
  g.fillStyle = "rgba(180,255,190,0.06)";
  g.fillRect(0, by, W, 26);
  g.fillStyle = "rgba(200,255,210,0.9)";
  g.font = "600 18px Consolas, 'Courier New', monospace";
  g.textBaseline = "top";
  g.fillText("CAM 03", 60, 64);
  const s = Math.floor(t * 10) % 600;
  g.fillText(`02:14:${String(Math.floor(s / 10) % 60).padStart(2, "0")}`, 760, 64);
  if (Math.floor(t * 2) % 2 === 0) { g.fillStyle = "rgba(255,90,90,0.9)"; g.beginPath(); g.arc(70, 104, 6, 0, TAU); g.fill(); g.fillStyle = "rgba(200,255,210,0.9)"; g.fillText("REC", 84, 95); }
  g.restore();
}
function craterScene(g, W, H, t) {
  const sg = g.createLinearGradient(0, 0, W, 0);
  sg.addColorStop(0, "#3a120a"); sg.addColorStop(0.45, "#1a1430"); sg.addColorStop(1, "#0c1630");
  g.fillStyle = sg; g.fillRect(0, 0, W, H);
  K.stars(g, W, H, 10, 0.8, t, { yMax: 220 });
  K.moon(g, 820, 90, 22, { glow: 0.7 });
  // lava glow from the crater below-left
  K.glow(g, 120, 520, 520, "#ff5a1a", 0.65);
  K.glow(g, 160, 500, 240, "#ffb347", 0.5);
  // crater rim ridge
  g.fillStyle = "#14101a";
  g.beginPath(); g.moveTo(-20, 560); g.lineTo(-20, 400); g.bezierCurveTo(200, 360, 420, 330, 620, 345); g.bezierCurveTo(760, 355, 860, 330, 980, 320); g.lineTo(980, 560); g.closePath(); g.fill();
  // lava rim light on the ridge
  g.save(); g.globalCompositeOperation = "lighter";
  g.strokeStyle = "rgba(255,120,40,0.45)"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(-20, 400); g.bezierCurveTo(200, 360, 420, 330, 620, 345); g.stroke(); g.restore();
  // the safe nook: a sheltered hollow in the rock, lit warm from inside (somewhere safe)
  const nook = new Path2D();
  nook.ellipse(860, 340, 48, 34, 0, Math.PI, 0); nook.lineTo(908, 346); nook.lineTo(812, 346); nook.closePath();
  const ng = g.createRadialGradient(860, 336, 2, 860, 330, 52);
  ng.addColorStop(0, "#ffd9a0"); ng.addColorStop(0.35, "#c8783a"); ng.addColorStop(0.75, "#4a2414"); ng.addColorStop(1, "#1a0c08");
  g.fillStyle = ng; g.fill(nook);
  g.strokeStyle = "rgba(255,190,120,0.35)"; g.lineWidth = 1.5; g.stroke(nook);
  K.glow(g, 860, 336, 90, "#ffcf8a", 0.4);
  // soft straw bedding inside
  g.strokeStyle = "rgba(230,190,110,0.6)"; g.lineWidth = 1;
  g.beginPath(); for (let k = 0; k < 14; k++) { const x = 826 + k * 5; g.moveTo(x, 346); g.lineTo(x + 6 * Math.sin(k), 340 - (k % 3) * 2); } g.stroke();
  const p = K.seg(t, 53.5, 56);
  const ridgeY = (x) => x < 620 ? 400 - (x + 20) / 640 * 55 : 345 - (x - 620) / 360 * 22;
  const lead = K.lerp(470, 760, p);
  const kits = [K.COATS.cream, K.COATS.siamese, K.COATS.grey];
  for (let k = 2; k >= 0; k--) {
    const x = lead - 60 - k * 48;
    cachedCat(g, x, ridgeY(x) + 2, 20, { pose: "walk", phase: t * 1.7 + k * 0.4, facing: 1, coat: kits[k], collar: false, light: { x: x - 300, y: ridgeY(x) + 160, color: "#ff7a2a", strength: 1.4 } }, "crater" + k);
  }
  cachedCat(g, lead, ridgeY(lead) + 2, 38, { pose: "walk", phase: t * 1.1, facing: 1, bell: false, light: { x: lead - 400, y: ridgeY(lead) + 170, color: "#ff7a2a", strength: 1.4 }, headTurn: -0.2 }, "craterb");
  K.dust(g, W, H, t, { seed: 4, color: "#ff8a3a", count: 40, size: 1.6, area: [0, 200, 500, 340], alpha: 0.8 });
}

// ---- shot 6: through the window ---------------------------------------------------------------------------
function rooftopView(g, x0, y0, w, h, t) {
  g.save();
  g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  const sg = g.createLinearGradient(0, y0, 0, y0 + h);
  sg.addColorStop(0, "#6a4a9a"); sg.addColorStop(0.45, "#ff8ac8"); sg.addColorStop(0.75, "#ffc09a"); sg.addColorStop(1, "#ffd8b0");
  g.fillStyle = sg; g.fillRect(x0, y0, w, h);
  K.sunGlow(g, x0 + w * 0.3, y0 + h * 0.62, 16, "#ffd0a0", 0.8);
  // far city in haze
  const R = K.rng("city");
  g.fillStyle = K.mix("#b06aa8", "#ffc0d0", 0.5);
  for (let i = 0; i < 18; i++) { const bw = 20 + R() * 40, bh = 30 + R() * 90; g.fillRect(x0 + R() * w, y0 + h * 0.72 - bh, bw, bh + 40); }
  g.fillStyle = K.mix("#8a4a8a", "#ff9ac0", 0.35);
  for (let i = 0; i < 12; i++) { const bw = 30 + R() * 50, bh = 20 + R() * 60; g.fillRect(x0 + R() * w, y0 + h * 0.8 - bh, bw, bh + 40); }
  // haze between the layers, lit windows and rooftop antennas
  const hz2 = g.createLinearGradient(0, y0 + h * 0.5, 0, y0 + h * 0.8);
  hz2.addColorStop(0, "rgba(255,200,215,0)"); hz2.addColorStop(1, "rgba(255,200,215,0.35)");
  g.fillStyle = hz2; g.fillRect(x0, y0 + h * 0.5, w, h * 0.3);
  const R2 = K.rng("citywin");
  for (let i = 0; i < 46; i++) {
    const lx = x0 + R2() * w, ly = y0 + h * (0.55 + R2() * 0.24);
    g.fillStyle = R2() > 0.4 ? "rgba(255,226,160,0.85)" : "rgba(255,190,140,0.5)";
    g.fillRect(lx, ly, 2.2, 3);
  }
  g.strokeStyle = "rgba(90,50,90,0.8)"; g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < 7; i++) { const ax = x0 + R2() * w, ay = y0 + h * (0.45 + R2() * 0.2); g.moveTo(ax, ay); g.lineTo(ax, ay - 14 - R2() * 18); g.moveTo(ax - 4, ay - 8); g.lineTo(ax + 4, ay - 8); }
  g.stroke();
  // near rooftop with a parapet edge, a water tank and a nook
  const ry = y0 + h * 0.8;
  g.fillStyle = "#4a2a48";
  g.fillRect(x0, ry, w, h * 0.3);
  g.fillStyle = "#6a3a5a";
  g.fillRect(x0, ry - 3, w, 4);
  g.fillStyle = "#3a1e36";
  g.fillRect(x0, ry - 8, w * 0.42, 6); // parapet
  g.fillStyle = "rgba(255,190,200,0.5)"; g.fillRect(x0, ry - 8, w * 0.42, 1);
  const tx = x0 + w * 0.68;
  g.fillStyle = "#3a2038";
  g.fillRect(tx - 34, ry - 70, 68, 44);
  g.beginPath(); g.moveTo(tx - 38, ry - 70); g.lineTo(tx, ry - 92); g.lineTo(tx + 38, ry - 70); g.closePath(); g.fill();
  g.strokeStyle = "#3a2038"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(tx - 28, ry - 26); g.lineTo(tx - 30, ry); g.moveTo(tx + 28, ry - 26); g.lineTo(tx + 30, ry); g.moveTo(tx - 28, ry - 2); g.lineTo(tx + 28, ry - 20); g.stroke();
  // nook (dark, sheltered)
  g.fillStyle = "#1a0e1a";
  g.beginPath(); g.moveTo(tx - 20, ry); g.lineTo(tx - 20, ry - 18); g.quadraticCurveTo(tx, ry - 26, tx + 20, ry - 18); g.lineTo(tx + 20, ry); g.closePath(); g.fill();
  const sunL = { x: x0 + w * 0.3, y: y0 + h * 0.62, color: "#ffc0a0", strength: 1.3 };
  // the kitten, nudged into the nook
  const kp = K.ease.inOut(K.seg(t, 56.5, 60.5));
  const kx = K.lerp(tx - 70, tx - 2, kp);
  cachedCat(g, kx, ry + 1, 12, { pose: kp < 1 ? "walk" : "loaf", phase: kp < 1 ? t * 1.8 : 0, facing: 1, coat: K.COATS.grey, collar: false, light: { x: kx - 200, y: ry - 60, color: "#ffc0a0", strength: 1.3 }, alpha: K.lerp(1, 0.75, kp) }, "kit" + (kp < 1 ? "w" : "l"));
  // Biscuit: nudges, then sits and looks back toward the shop window
  const bp = K.ease.inOut(K.seg(t, 56.2, 60.2));
  const bx = K.lerp(tx - 120, tx - 44, bp);
  const sat = t > 60.6;
  const trail = K.pawTrail(tx - 200, ry + 2, bx - 6, ry + 2, 7, t - 54, { start: 0, every: 0.5, life: 8, s0: 3.2, s1: 3.2 });
  K.pawprints(g, trail, 0.9);
  K.drawCat(g, bx, ry + 1, 24, { pose: sat ? "sit" : bp > 0.02 && bp < 0.98 ? "walk" : "stand", phase: t * 1.2, facing: sat ? -1 : 1, headTurn: sat ? K.lerp(0, 0.95, K.smooth(K.seg(t, 61, 62.5))) : 0.1, t, bell: false, light: sunL, tailUp: sat ? 0.6 : 0.3, blink: K.env(t, 63.3, 64.3, 0.4, 0.4) });
  // haze over the far view
  g.fillStyle = "rgba(255,190,210,0.08)";
  g.fillRect(x0, y0, w, h);
  g.restore();
}

// ---- the shots ----------------------------------------------------------------------------------------
function shopWide(g, W, H, t, cam, o) {
  K.withCamera(g, W, H, cam, () => {
    if (o.wallBlur > 0.3) {
      const L = inLayer(g, W, H, "f16:wall", (s) => room(s, W, H, t, o));
      put(g, W, H, L, 1, o.wallBlur);
    } else room(g, W, H, t, o);
    slatLight(g, W, H, t, o.slats == null ? 1 : o.slats);
    for (const c of CANDLES) candle(g, c.x, c.y, c.h, c.w, t, c.i, o.candle == null ? 1 : o.candle);
    if (o.after) o.after(g);
  });
}
function bokehCandles(g, W, H, t, a, shift = 0) {
  // out-of-focus candles right in front of the lens; shift = parallax (they move faster than the wall)
  for (let i = 0; i < 6; i++) {
    const span = W + 340;
    const x = ((((60 + i * 175 + Math.sin(i * 3.1) * 40 + shift) % span) + span) % span) - 170, y = 470 + (i % 2) * 40;
    const fl = 0.85 + 0.15 * K.noise(t * 5 + i, i);
    K.glow(g, x, y, 70 * fl, "#ff9a3a", 0.32 * a);
    g.save();
    g.globalCompositeOperation = "lighter";
    g.fillStyle = K.rgba("#ffcf6a", 0.12 * a * fl);
    g.beginPath(); g.arc(x, y - 30, 26, 0, TAU); g.fill();
    g.strokeStyle = K.rgba("#ffd890", 0.14 * a);
    g.lineWidth = 2;
    g.stroke();
    g.restore();
  }
}

function frame(g, W, H, t) {
  if (t < 12) {
    // 1. slow dolly into the dim, dusty shop
    const p = K.ease.inOut(K.seg(t, 0, 12));
    shopWide(g, W, H, t, { x: K.lerp(470, 480, p), y: K.lerp(280, 255, p), zoom: K.lerp(1.0, 1.16, p), shakeT: t, shakeAmt: 1 }, { dark: K.lerp(0.8, 0.66, p), candle: 0.8, wallLit: 0.4, wallBlur: 7 });
  } else if (t < 24) {
    // 2. the wall: slow pan left to right
    const p = K.ease.inOut(K.seg(t, 12, 24));
    const boost = K.smooth(K.seg(t, 18, 22));
    const rack = 7 * (1 - K.smooth(K.seg(t, 12, 13.3)));
    const camX = K.lerp(250, 720, p);
    shopWide(g, W, H, t, { x: camX, y: 190, zoom: 2.05, shakeT: t, shakeAmt: 1.1 }, { dark: K.lerp(0.5, 0.26, K.smooth(K.seg(t, 12, 13.3))), slats: 0.7, boost, wallLit: 1, wallBlur: rack });
    bokehCandles(g, W, H, t, 1, -(camX - 250) * 2.05 * 1.4);
  } else if (t < 34) {
    // 3. close: where he hid them; where you found them
    const p = K.ease.inOut(K.seg(t, 24, 33.5));
    const row = [9, 10, 11, 12, 13].map(POSTER);
    const a = row[0], b = row[4];
    const cx = K.lerp(a.x + a.w * 0.5, b.x + b.w * 0.5, p);
    const cy = K.lerp(a.y + a.h * 0.62, b.y + b.h * 0.55, p);
    const hit = Math.exp(-Math.max(0, t - 30) * 2.5) * (t >= 30 ? 1 : 0);
    const pulse = t >= 30 ? Math.exp(-(t - 30) * 3) : 0; // decays over ~1 s
    const push = 1 + 0.03 * K.ease.out(K.seg(t, 30, 31.2));
    K.withCamera(g, W, H, { x: cx, y: cy, zoom: K.lerp(4.6, 3.6, p) * push, shakeT: t, shakeAmt: 0.8 + hit * 3 }, () => {
      room(g, W, H, t, { dark: 0.12, posterVector: true, boost: K.smooth(K.seg(t, 29.8, 30.6)), wallLit: 1, iconFlash: pulse });
      slatLight(g, W, H, t, 0.2);
      if (pulse > 0.01) {
        const pts = [];
        for (const P of POSTERS) { const [px, py] = printPos(P); pts.push({ x: px, y: py, s: P.w * 0.09, a: P.rot - 0.2, flat: 1, alpha: pulse }); K.glow(g, px, py, P.w * 0.7, "#ffcf6a", 0.6 * pulse * (0.5 + P.lit * 0.5)); }
        K.pawprints(g, pts, 1.2);
      }
    });
  } else if (t < 48.5) {
    // 4. the Shadow steps out of the dark behind the candles, into the light
    const p = K.seg(t, 34, 48.5);
    const reveal = K.smooth(K.seg(t, 43.4, 45.6));
    const wp = K.ease.inOut(K.seg(t, 35.2, 40.5));
    const sx = K.lerp(650, 540, wp);
    const emerge = K.smooth(K.seg(t, 34.2, 36.4));
    // low camera: the floor line sits low in frame and he towers over the candle flames
    shopWide(g, W, H, t, { x: K.lerp(565, 525, p), y: K.lerp(322, 305, p), zoom: K.lerp(1.42, 1.62, K.ease.inOut(p)), shakeT: t, shakeAmt: 0.9 }, {
      dark: 0.45 - reveal * 0.2, slats: 0.6 + reveal * 0.3, candle: 1 + reveal * 0.4, wallLit: 0.6,
      after: (gg) => {
        // he stands just behind the candle line; candles in front are redrawn over him
        // the candle cluster he steps out from behind: their light is BEHIND him (backlight)
        K.glow(gg, sx + 30, 372, 150, "#ff9a3a", 0.32 * (1 - reveal * 0.5));
        K.glow(gg, sx + 10, 300, 120, "#bcd6ff", 0.12 * (1 - reveal));
        whiskers(gg, W, H, sx, 400, 120, t, {
          pose: wp > 0.01 && wp < 0.99 ? "walk" : "stand", phase: t * 0.8, facing: -1, reveal, alpha: emerge,
          // once he stops, every head move is quantised into cached sprites (a 120 px cat is too costly per frame)
          still: t > 41.5 ? 41.5 : 0,
          headTurn: t < 41.5 ? 0.1 : t < 45.7 ? 0.35 : Math.round((0.35 + 0.2 * K.smooth(K.seg(t, 45.7, 46.5))) * 20) / 20, headTilt: -Math.round(0.55 * K.ease.inOut(K.seg(t, 45.7, 47)) * 12) / 12, blink: t < 45.7 ? 0.3 : 0.5,
        });
        for (const c of CANDLES) if (c.y > 404) candle(gg, c.x, c.y, c.h, c.w, t, c.i, 1 + reveal * 0.4);
        if (reveal > 0) K.godRays(gg, sx - 40, 120, W, H, { color: "#ffe7a8", count: 6, strength: 0.18 * reveal, t, spread: 0.6, length: 340, seed: 6 });
      },
    });
    bokehCandles(g, W, H, t, 1);
  } else if (t < 56) {
    // 5. flash cuts (warm memories, 2.5 s each): re-seeing it with the truth
    if (t < 51) driveScene(g, W, H, t);
    else if (t < 53.5) { cctvScene(g, W, H, t); cctvPost(g, W, H, t); }
    else {
      const lead = K.lerp(470, 760, K.seg(t, 53.5, 56));
      const by = (lead < 620 ? 400 - (lead + 20) / 640 * 55 : 345 - (lead - 620) / 360 * 22) - 34;
      K.withCamera(g, W, H, { x: K.lerp(600, 760, K.seg(t, 53.5, 56)), y: 320, zoom: 1.75 }, () => {
        craterScene(g, W, H, t);
        const b = K.env(t, 54.7, 56, 0.08, 1.2);
        if (b > 0) {
          // the bell rings: a golden ripple from Biscuit that washes over the kittens
          K.bellGlint(g, lead + 26, by, 16, t, { strength: b });
          g.save(); g.globalCompositeOperation = "lighter";
          for (let k = 0; k < 4; k++) {
            const r = 8 + Math.max(0, t - 54.7 - k * 0.22) * 170;
            g.strokeStyle = K.rgba("#ffd27a", 0.5 * b * (1 - k * 0.2));
            g.lineWidth = 3 - k * 0.5;
            g.beginPath(); g.ellipse(lead + 26, by, r, r * 0.75, 0, 0, TAU); g.stroke();
          }
          K.glow(g, lead + 26, by, 60, "#ffd27a", 0.4 * b);
          g.restore();
        }
      });
    }
  } else if (t < 66) {
    // 6. Sir Whiskers turns to the window; far off, Biscuit at work
    const p = K.ease.inOut(K.seg(t, 56, 66));
    K.withCamera(g, W, H, { x: K.lerp(480, 690, p), y: K.lerp(270, 330, p), zoom: K.lerp(1.0, 1.85, p), shakeT: t, shakeAmt: 0.8 }, () => {
      g.fillStyle = "#170d09";
      g.fillRect(-W, -H, W * 3, H * 3);
      const ps = plasterSprite();
      g.globalAlpha = 0.7;
      g.drawImage(ps, -100, -60, 1160, 660);
      g.globalAlpha = 1;
      const wx = 470, wy = 110, ww = 400, wh = 300;
      rooftopView(g, wx, wy, ww, wh, t);
      // window frame + half-open slats at the top
      g.fillStyle = "#1c120c";
      g.fillRect(wx - 16, wy - 16, ww + 32, 16); g.fillRect(wx - 16, wy + wh, ww + 32, 20);
      g.fillRect(wx - 16, wy, 16, wh); g.fillRect(wx + ww, wy, 16, wh);
      g.fillRect(wx + ww / 2 - 4, wy, 8, wh);
      for (let k = 0; k < 6; k++) g.fillRect(wx, wy + k * 13, ww, 6);
      g.fillStyle = "rgba(255,170,210,0.06)";
      g.fillRect(wx, wy, ww, wh);
      // sunset beams fall from the window DOWN onto the sill and floor (never across his face)
      K.godRays(g, wx + ww * 0.45, wy + wh * 0.35, W, H, { color: "#ffb0d0", count: 9, strength: 0.14, t, angle: Math.PI / 2 + 0.28, spread: 0.45, length: 420, seed: 12 });
      // sill pool of light
      g.save(); g.globalCompositeOperation = "lighter";
      const sp2 = g.createRadialGradient(wx + ww * 0.45, wy + wh + 30, 0, wx + ww * 0.45, wy + wh + 30, ww * 0.6);
      sp2.addColorStop(0, "rgba(255,180,200,0.35)"); sp2.addColorStop(1, "rgba(255,180,200,0)");
      g.translate(wx + ww * 0.45, wy + wh + 30); g.scale(1, 0.25); g.translate(-(wx + ww * 0.45), -(wy + wh + 30));
      g.fillStyle = sp2; g.beginPath(); g.arc(wx + ww * 0.45, wy + wh + 30, ww * 0.6, 0, TAU); g.fill();
      g.restore();
      // the sill and the light falling on it
      g.fillStyle = "#3a2418";
      g.fillRect(wx - 30, wy + wh + 20, ww + 60, 14);
      const fl = g.createLinearGradient(0, wy + wh + 20, 0, wy + wh + 34);
      fl.addColorStop(0, "rgba(255,170,210,0.5)"); fl.addColorStop(1, "rgba(255,170,210,0)");
      g.fillStyle = fl; g.fillRect(wx - 30, wy + wh + 20, ww + 60, 14);
      // Sir Whiskers in the foreground, turning to the window (rack focus away from him)
      const blur = K.lerp(0, 5, K.smooth(K.seg(t, 57.5, 60.5)));
      const turn = K.ease.inOut(K.seg(t, 56, 58.5));
      // his turn is quantised into cached steps (a 170 px cat is too costly to repaint every frame)
      const hq = Math.round(turn * 12) / 12;
      const spr = K.sprite("f16:sirfg:" + hq, 560 * 1.6, 420 * 1.6, (s) => {
        s.scale(1.6, 1.6);
        K.drawCat(s, 280, 400, 170, { pose: "sit", facing: 1, headTurn: K.lerp(0.7, -0.3, hq), t: 0, collar: false, bell: false, coat: OLD, shadow: false, blink: 0.45, light: { x: 690, y: 140, color: "#ff9ad8", strength: 1.6 } });
        ruff(s, 280, 400, 170, 1, 0, "sit", 0);
      });
      const L = inLayer(g, W, H, "f16:sirfg", (s) => { s.drawImage(spr, 260 - 280, 520 - 400, 560, 420); });
      // a spirit: translucent (screen), cold #bcd6ff edge glow, warm sunset rim from the window
      K.glow(g, 260, 330, 260, "#bcd6ff", 0.16);
      put(g, W, H, L, 0.5, blur, "screen");
      put(g, W, H, L, 0.18, blur + 6, "lighter");
      K.glow(g, 330, 300, 160, "#ff9ad8", 0.12);
    });
  } else if (t < 74) {
    // 7. close: your hand touches the last pawprint; the wall lights in a wave
    const P = POSTER(LAST);
    const [px, py] = printPos(P);
    const p = K.ease.inOut(K.seg(t, 66, 74));
    const waveR = t > 69.1 ? (t - 69.1) * 260 : null;
    const zoom = K.lerp(4.2, 3.0, p);
    let hand = null;
    K.withCamera(g, W, H, { x: K.lerp(P.x + P.w * 0.55, P.x + P.w * 0.5, p), y: K.lerp(P.y + P.h * 0.5, P.y + P.h * 0.6, p), zoom, shakeT: t, shakeAmt: 0.6 }, () => {
      room(g, W, H, t, { dark: 0.15, posterVector: true, waveR, wave0: [px, py], wallLit: 1, gold: K.smooth(K.seg(t, 69, 74)) * 0.5 });
      slatLight(g, W, H, t, 0.15);
      if (t > 69.1) { const k = Math.exp(-(t - 69.1) * 1.6); K.glow(g, px, py, 22, "#fff2c0", 0.9 * k); K.glow(g, px, py, 60, AMBER, 0.6 * k + 0.2); }
      hand = g.getTransform();
    });
    // the hand (screen space, so it stays a believable size)
    const T = new DOMMatrix([hand.a, hand.b, hand.c, hand.d, hand.e, hand.f]);
    const sp = new DOMPoint(px, py).matrixTransform(T);
    const px2 = K.pixelScale();
    const tipX = sp.x / px2, tipY = sp.y / px2;
    const reach = K.ease.out(K.seg(t, 66.6, 69.1));
    const pull = K.ease.inOut(K.seg(t, 71.5, 73.8)); // contact held 69.1-71.5
    const ang = -2.25;
    const size = 210;
    // drawHand (pose point, left): index fingertip pad sits at local (+15.8, -84) units of size/100,
    // rotated by ang + 90deg about the wrist. Invert that to place the wrist.
    const u = size / 100, th = ang + Math.PI / 2;
    const lx = 15.8 * u, ly = -84 * u;
    const ox2 = lx * Math.cos(th) - ly * Math.sin(th), oy2 = lx * Math.sin(th) + ly * Math.cos(th);
    const wx = tipX - ox2 + (1 - reach) * 160 + pull * 90;
    const wy = tipY - oy2 + (1 - reach) * 260 + pull * 180;
    K.drawHand(g, wx, wy, size, { pose: "point", angle: ang, left: true, bell: true, t, light: { x: tipX, y: tipY, color: "#ffcf6a", strength: 1.2 } });
  } else {
    // 8. wide: the shop glowing gold; Sir Whiskers walks to the door and waits for you
    const p = K.ease.inOut(K.seg(t, 74, 80));
    const wp = K.ease.inOut(K.seg(t, 74.3, 78));
    const sx = K.lerp(520, 836, wp), sy = K.lerp(430, 414, wp);
    shopWide(g, W, H, t, { x: K.lerp(500, 520, p), y: 270, zoom: K.lerp(1.06, 1.0, p), shakeT: t, shakeAmt: 0.8 }, {
      dark: 0, waveR: 2000, wave0: [480, 200], gold: 1, door: K.smooth(K.seg(t, 74, 76)), candle: 1.3, slats: 0.6, wallLit: 1,
      after: (gg) => {
        whiskers(gg, W, H, sx, sy, 70, t, { pose: wp > 0.01 && wp < 0.99 ? "walk" : "stand", phase: t * 0.8, facing: 1, reveal: 1, headTurn: wp >= 0.99 ? Math.round(K.lerp(0.1, -0.95, K.smooth(K.seg(t, 77.6, 78.6))) * 8) / 8 : 0.1, blink: 0.4, still: wp >= 0.99 ? 78 : 0 });
      },
    });
  }
}

export const film = {
  id: 16,
  title: "He Was Never Lost",
  chapter: "Chapter 16",
  unlockAt: 80,
  duration: D,
  poster: 50,
  tagline: "The truth, in his pawprints.",
  subs: [
    [4.0, 8.0, "A secret room. Full of dust and light."],
    [13.0, 17.5, "Drawings. One for every cat."],
    [18.0, 22.5, "And beside each one, his pawprint."],
    [25.0, 29.0, "Where he hid them. Where you found them."],
    [31.0, 34.5, "He was not running away."],
    [36.0, 39.5, "The shadow stepped into the light."],
    [45.0, 48.3, "The first cat of the Plaza. Sir Whiskers."],
    [50.5, 55.0, "He wasn't leading Biscuit. Biscuit was leading him."],
    [56.5, 61.5, "Every lost cat, guided somewhere safe."],
    [62.0, 66.0, "Somewhere a brave kid would find them."],
    [67.0, 71.5, "He was never lost."],
    [72.0, 78.5, "He was waiting for you to be brave enough to follow."],
  ],
  voice: [
    [4.0, "A secret room. Full of dust and light.", { rate: 0.92, pitch: 1.0 }],
    [13.0, "Drawings. One for every cat.", { rate: 0.92, pitch: 1.0 }],
    [18.0, "And beside each one, his pawprint.", { rate: 0.92, pitch: 1.0 }],
    [25.0, "Where he hid them. Where you found them.", { rate: 0.92, pitch: 1.0 }],
    [31.0, "He was not running away.", { rate: 0.9, pitch: 1.0 }],
    [36.0, "The shadow stepped into the light.", { rate: 0.9, pitch: 1.0 }],
    [45.0, "The first cat of the Plaza. Sir Whiskers.", { rate: 0.9, pitch: 1.0 }],
    [50.5, "He wasn't leading Biscuit. Biscuit was leading him.", { rate: 0.92, pitch: 1.0 }],
    [56.5, "Every lost cat, guided somewhere safe.", { rate: 0.92, pitch: 1.0 }],
    [62.0, "Somewhere a brave kid would find them.", { rate: 0.92, pitch: 1.0 }],
    [67.0, "He was never lost.", { rate: 0.82, pitch: 1.0 }],
    [72.0, "He was waiting for you to be brave enough to follow.", { rate: 0.88, pitch: 1.0 }],
  ],
  score: { mood: "mystery", key: "E", bpm: 70, cues: [[4, "drop"], [18, "swell"], [30, "hit"], [44, "swell"], [55, "bell"], [62, "purr"], [74, "swell"]] },
  draw(g, t, W, H) {
    g.save();
    if (W !== 960 || H !== 540) g.scale(W / 960, H / 540);
    W = 960; H = 540;
    try {
      prewarm(t);
      frame(g, W, H, t);
      const flashback = t >= 48.5 && t < 56;
      K.bloom(g, t >= 74 ? 0.5 : 0.38);
      if (flashback) {
        g.save();
        g.globalCompositeOperation = "saturation";
        g.fillStyle = "rgba(128,128,128,0.45)"; g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = "multiply";
        g.fillStyle = "rgba(226,178,120,0.35)"; g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = "lighter";
        g.fillStyle = "rgba(44,28,14,0.16)"; g.fillRect(0, 0, W, H); // lifted, warm blacks
        g.restore();
        K.grade(g, W, H, { tint: "#ffcf8a", alpha: 0.3, mode: "soft-light" });
        memoryEdge(g, W, H);
        K.vignette(g, W, H, 0.6);
        K.grain(g, W, H, t, 0.1);
        // white flash on every cut
        const cut = Math.min(Math.abs(t - 48.5), Math.abs(t - 51), Math.abs(t - 53.5));
        K.fadeColor(g, W, H, 0.7 * Math.exp(-cut * 9), "#fff6e6");
      } else {
        K.grade(g, W, H, { tint: t >= 66 ? "#ffcf8a" : "#c8806a", alpha: t >= 66 ? 0.2 : 0.16, mode: "soft-light" });
        K.vignette(g, W, H, 0.62);
        K.grain(g, W, H, t, 0.06);
      }
      K.letterbox(g, W, H, 1);
      // title 2-7
      const ta = K.env(t, 2, 7, 1.2, 1.4);
      if (ta > 0) K.title(g, W, H, "He Was Never Lost", "Chapter 16", ta, { glow: "#ff9ad8", y: H * 0.46 });
      K.fadeBlack(g, W, H, 1 - K.smooth(K.seg(t, 0, 2.2)));
      // dips between story beats
      K.fadeBlack(g, W, H, K.env(t, 48.3, 48.6, 0.2, 0.05) + K.env(t, 55.8, 56.5, 0.2, 0.5));
      K.fadeBlack(g, W, H, K.smooth(K.seg(t, 78.2, 80)));
    } finally {
      g.restore();
    }
  },
};
