// films/f16.js - Chapter 16 "He Was Never Lost" (FILMS.md f16). THE TWIST FILM, taken slow.
// A dusty, forgotten mall shop turned shrine: pink sunset light through slatted shutters, candles, and a
// wall of old posters with a scratched sketch of every lost cat, each with one amber pawprint beside it.
// The Shadow steps into the light and is Sir Whiskers the First. Biscuit was leading all along.
//
// Realism pipeline (REALISM.md): the shop is ONE cached albedo plate (textured plaster, perspective
// floorboards, drop ceiling, aged paper posters) in world space. Every frame it is lit by a small
// light map (ambient + inverse-square candle falloff + slat stripes + pawprint light + door spill),
// composited with `multiply`, then the emissive things (flames, pawprints, window, shafts in the
// dusty air) are added on top. Characters carry their own key/rim light. The lens (film.grade /
// gradeAt) does tone mapping, bloom, halation and grain. draw(g, t, W, H) is a pure function of t:
// only static art is cached, by keys that never contain t.
import * as K from "../filmkit.js";

const D = 80;
const TAU = Math.PI * 2;

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
// A temporary canvas at the device scale of g (sprite builders only: never per frame).
function temp(g, w, h, fn) {
  const T = g.getTransform();
  const sc = Math.max(0.25, Math.hypot(T.a, T.b));
  const c = K.makeCanvas(Math.max(1, Math.ceil(w * sc)), Math.max(1, Math.ceil(h * sc)));
  const cg = c.getContext("2d");
  cg.scale(sc, sc);
  fn(cg);
  g.drawImage(c, 0, 0, w, h);
}
// Soft-focus paint: fn draws (in g's units) into a canvas k units coarser, which is scaled back up with
// smoothing - a cheap ~k-unit blur that never uses ctx.filter (filtered draws stall software GPUs).
function soft(g, x, y, w, h, k, fn) {
  const T = g.getTransform();
  const sc = Math.max(0.02, Math.hypot(T.a, T.b) / Math.max(1, k));
  const c = K.makeCanvas(Math.max(1, Math.ceil(w * sc)), Math.max(1, Math.ceil(h * sc)));
  const q = c.getContext("2d");
  q.scale(sc, sc); q.translate(-x, -y);
  fn(q);
  g.save(); g.imageSmoothingEnabled = true; g.drawImage(c, x, y, w, h); g.restore();
}
// f16 keeps its own cache of static art (the kit sprite cache is capped and shared; this film holds ~150
// large plates, posters and gait steps, which would make it thrash). Keys never contain t.
const CACHE = new Map();
function spr(key, w, h, paint) {
  const px = K.pixelScale();
  const k = key + "@" + px + ":" + Math.round(w) + "x" + Math.round(h);
  let c = CACHE.get(k);
  if (c) return c;
  if (CACHE.size > 1200) CACHE.clear(); // the key set is finite (~400); this is only a safety net
  c = K.makeCanvas(Math.max(1, Math.ceil(w * px)), Math.max(1, Math.ceil(h * px)));
  const g = c.getContext("2d");
  g.setTransform(px, 0, 0, px, 0, 0);
  try { paint(g, w, h); } catch (e) { /* a failed builder leaves a blank plate */ }
  CACHE.set(k, c);
  return c;
}
// a tiny context to run scene code against while pre-warming caches (nothing visible is drawn)
let DUMMY = null;
const dummy = () => DUMMY || (DUMMY = K.makeCanvas(4, 4).getContext("2d"));
const relL = (L, dx, dy) => (L && typeof L === "object" ? Object.assign({}, L, { x: L.x + dx, y: L.y + dy }) : L);

// A cat painted once per gait step into a cached sprite (small walking cats in the flash cuts reuse 8
// cached steps). key must identify coat/facing/light; o.phase picks the step.
function cachedCat(g, x, y, size, o, key, steps = 8, SC = 2) {
  const q = Math.floor(((((o.phase || 0) % 1) + 1) % 1) * steps);
  const SW = size * 3.6, SH = size * 2.5, ox = SW / 2, oy = SH * 0.86;
  const img = spr("f16cat:" + key + ":" + q + ":" + size + ":" + SC, SW * SC, SH * SC, (s) => {
    s.scale(SC, SC);
    const oo = Object.assign({}, o, { phase: q / steps, t: (q / steps) * 2.3, autoBlink: false });
    oo.light = relL(o.light, ox - x, oy - y);
    oo.key = relL(o.key, ox - x, oy - y);
    oo.rim = relL(o.rim, ox - x, oy - y);
    K.drawCat(s, ox, oy, size, oo);
  });
  if (!g) return;
  g.save();
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  g.drawImage(img, x - ox, y - oy, SW, SH);
  g.restore();
}

// Flashback edge: a blurred copy of the frame shows only toward the borders (soft, dreamy memory edge).
function memoryEdge(g, W, H) {
  if (!K.hasFilter() || !g.canvas) return;
  const L = K.layer(W / 2, H / 2, "f16:mem");
  const lg = L.g;
  lg.save();
  lg.setTransform(1, 0, 0, 1, 0, 0);
  lg.filter = "blur(3px)";
  lg.drawImage(g.canvas, 0, 0, L.canvas.width, L.canvas.height);
  lg.filter = "none";
  lg.restore();
  lg.globalCompositeOperation = "destination-in";
  const m = lg.createRadialGradient(W / 4, H / 4, H * 0.18, W / 4, H / 4, W * 0.31);
  m.addColorStop(0, "rgba(0,0,0,0)"); m.addColorStop(1, "rgba(0,0,0,1)");
  lg.fillStyle = m; lg.fillRect(0, 0, W / 2, H / 2);
  g.drawImage(L.canvas, 0, 0, W, H);
}

// ---- the set: one shop, laid out in a 960 x 540 world --------------------------------------------------------
const WALL = { x0: 100, x1: 860, y0: 40, y1: 390 };
// one-point perspective: the eye sits ~60% up the wall, so floor, ceiling and side walls all converge here
const VP = [480, 250];
const WX0 = -150, WY0 = -80, WW = 1280, WH = 730; // world extent of the cached plate (past every camera move)
const SET_RES = 1.6;
// a pinhole room: back wall at Z = 1, screen = VP + (X, Y) / Z. The side walls are X = -380 / +380,
// the floor Y = 140, the ceiling Y = -210 (all in back-wall pixels). P3 projects a room point.
const RX = 380, RF = 140;
const P3 = (X, Y, Z) => [VP[0] + X / Z, VP[1] + Y / Z];
// perspective seams of the side walls (all lines run to the vanishing point)
const floorL = (x) => VP[1] + (WALL.y1 - VP[1]) * (VP[0] - x) / (VP[0] - WALL.x0);
const floorR = (x) => VP[1] + (WALL.y1 - VP[1]) * (x - VP[0]) / (WALL.x1 - VP[0]);
const ceilL = (x) => VP[1] - (VP[1] - WALL.y0) * (VP[0] - x) / (VP[0] - WALL.x0);
const ceilR = (x) => VP[1] - (VP[1] - WALL.y0) * (x - VP[0]) / (WALL.x1 - VP[0]);
const onL = (x, f) => K.lerp(ceilL(x), floorL(x), f);
const onR = (x, f) => K.lerp(ceilR(x), floorR(x), f);
// the slatted window in the left wall and the door in the right wall (true perspective quads)
const WIN = { x0: -20, x1: 62, f0: 0.2, f1: 0.62 };
const winQuad = () => [[WIN.x0, onL(WIN.x0, WIN.f0)], [WIN.x1, onL(WIN.x1, WIN.f0)], [WIN.x1, onL(WIN.x1, WIN.f1)], [WIN.x0, onL(WIN.x0, WIN.f1)]];
// the door in the right wall: an opening between depths Z0 (far, hinge side) and Z1 (near) in a wall
// `thick` units deep (the jamb), with a leaf that swings into the room
const DR = { Z0: 0.935, Z1: 0.81, top: -152, thick: 16 };
const DOOR = { x0: P3(RX, 0, DR.Z0)[0], x1: P3(RX, 0, DR.Z1)[0] };
const doorQuad = () => [P3(RX, DR.top, DR.Z0), P3(RX, DR.top, DR.Z1), P3(RX, RF, DR.Z1), P3(RX, RF, DR.Z0)];
const quadPath = (q) => { const p = new Path2D(); p.moveTo(q[0][0], q[0][1]); for (let i = 1; i < q.length; i++) p.lineTo(q[i][0], q[i][1]); p.closePath(); return p; };

const POSTERS = (() => {
  const out = [];
  const R = K.rng("f16posters");
  const cols = 9, rows = 4;
  const cw = (WALL.x1 - WALL.x0 - 50) / cols, ch = 70;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      // hand-pinned over months: sizes, gaps and angles all drift, and sheets overlap their neighbours
      const sz = 0.8 + R() * 0.42;
      const portrait = R() > 0.72;
      const w = cw * (portrait ? 0.74 : 0.9) * sz, h = ch * (portrait ? 1.05 : 0.86) * sz * (0.9 + R() * 0.2);
      const x = WALL.x0 + 22 + c * cw + (cw - w) / 2 + (R() - 0.5) * 34 + (r % 2) * cw * 0.22;
      const y = 58 + r * (ch + 3) + (R() - 0.5) * 26 + Math.sin(c * 1.7 + r) * 5;
      const rr = R();
      out.push({ i, x, y, w, h, rot: (R() - 0.5) * 0.3 + (rr > 0.9 ? (R() - 0.5) * 0.3 : 0), paper: R(), lit: R() > 0.45 ? 0.95 : 0.22, ph: R() * TAU, z: R(), tear: R(), tape: R(), curl: R(), stain: R() });
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

// ---- posters: aged paper, faded print, a graphite sketch (sprite builders only) ----------------------------
// Graphite / charcoal: several thin dark passes whose width and density vary along the line (pressure),
// broken where the point skipped over the paper tooth, a soft smear where a palm dragged across it, and
// the ghost of an erased line. Multiplied onto the paper so the fibres show through.
function graphite(q, path, lw, seed, w, h) {
  const R = K.rng("gr" + seed);
  q.lineCap = "round";
  q.lineJoin = "round";
  // smudge: a blurred, offset copy (graphite dragged by the side of a hand)
  soft(q, 0, 0, w, h, Math.max(1.2, lw * 2.2), (s) => {
    s.lineCap = "round"; s.lineJoin = "round";
    s.strokeStyle = "rgba(70,66,62,0.22)"; s.lineWidth = lw * 2.6;
    s.translate(lw * (1.2 + R()), lw * (0.6 + R())); s.stroke(path);
  });
  // the drawn line: a heavy first pass, then lighter, slightly wandering re-strokes
  const passes = [[0.4, 0.8, 0], [0.3, 0.55, 1], [0.22, 0.4, 2], [0.36, 0.3, 3]];
  for (const [a, wk, k] of passes) {
    q.save();
    // pressure: the later passes are broken into long and short strokes
    if (k) q.setLineDash([w * (0.05 + R() * 0.12), w * (0.01 + R() * 0.03), w * (0.02 + R() * 0.05), w * 0.015]);
    q.lineDashOffset = R() * w;
    q.translate((R() - 0.5) * lw * 0.9, (R() - 0.5) * lw * 0.9);
    q.translate(w * 0.4, h * 0.4); q.rotate((R() - 0.5) * 0.012); q.scale(1 + (R() - 0.5) * 0.012, 1 + (R() - 0.5) * 0.012); q.translate(-w * 0.4, -h * 0.4);
    q.strokeStyle = `rgba(34,32,30,${a})`;
    q.lineWidth = lw * wk;
    q.stroke(path);
    q.restore();
  }
}
// paper tones: yellowed, grey card, newsprint, kraft, cream, faded rose
const PAPERS = ["#d8bf8a", "#b9b6ac", "#cbc4ac", "#b99670", "#ddd0ae", "#c6a596"];
// the outline of a sheet: slightly wavy cut edges, one torn edge (fibrous, irregular) on some sheets
function tornSheet(P, w, h) {
  const sheet = new Path2D();
  const R = K.rng("sheet" + P.i);
  const tornSide = P.tear > 0.6 ? Math.floor(R() * 4) : -1;
  const pts = [];
  const edge = (x0, y0, x1, y1, side, nx, ny) => {
    const n = 18;
    const amp = side === tornSide ? Math.min(w, h) * 0.035 : Math.min(w, h) * 0.006;
    for (let k = 0; k < n; k++) {
      const u = k / n;
      const d = side === tornSide
        ? (K.fbm(u * 6 + P.i, side + 3) * 0.7 + K.fbm(u * 23 + P.i, side + 9) * 0.3) * amp - amp * 0.6
        : K.fbm(u * 3 + P.i * 0.7, side) * amp;
      pts.push([K.lerp(x0, x1, u) + nx * d, K.lerp(y0, y1, u) + ny * d]);
    }
  };
  edge(0, 0, w, 0, 0, 0, 1);
  edge(w, 0, w, h, 1, -1, 0);
  edge(w, h, 0, h, 2, 0, -1);
  edge(0, h, 0, 0, 3, 1, 0);
  // a bitten-off corner on some sheets
  if (P.tear > 0.82) {
    const cut = w * (0.1 + (P.tear - 0.82) * 0.8);
    for (const p of pts) if (p[0] > w - cut && p[1] > h - cut && p[0] + p[1] > w + h - cut * 1.1) { const k = (p[0] + p[1] - (w + h - cut * 1.1)) / 2; p[0] -= k; p[1] -= k; }
  }
  pts.forEach(([x, y], k) => (k ? sheet.lineTo(x, y) : sheet.moveTo(x, y)));
  sheet.closePath();
  return sheet;
}
function finePattern(q, name, o, sc) {
  const pat = K.texPattern(q, name, o);
  if (pat.setTransform && typeof DOMMatrix !== "undefined") pat.setTransform(new DOMMatrix([sc, 0, 0, sc, 0, 0]));
  return pat;
}
// which corner of a sheet curls off the wall (bottom corners only: the sheets are fixed at the top)
const curlCorner = (P) => (P.curl > 0.55 && P.tear <= 0.82 ? (P.curl > 0.78 ? 1 : -1) : 0);
function posterArt(g, P, w, h) {
  const base = PAPERS[Math.floor(P.paper * PAPERS.length)];
  const R = K.rng("sheetd" + P.i);
  const sheet = tornSheet(P, w, h);
  // paper: one shared fibre texture (offset per sheet) multiplied by the sheet's own tone
  K.texFill(g, "plaster", sheet, { tex: { color: "#efe4cc", grime: "#7a5a3c", stain: 0.6, seed: 16 }, scale: 120, ox: -((P.i * 37) % 120), oy: -((P.i * 53) % 120), tint: base, tintAlpha: 0.85 });
  g.save();
  g.clip(sheet);
  // the faded remains of a printed header and small print, patchy where sun and damp have eaten it
  const ink = K.shade(base, -0.55);
  g.save();
  g.globalCompositeOperation = "multiply";
  g.globalAlpha = 0.4;
  temp(g, w, h, (q) => {
    q.fillStyle = ink;
    q.fillRect(w * 0.08, h * 0.05, w * (0.5 + R() * 0.34), h * 0.08);
    for (let k = 0; k < 4; k++) q.fillRect(w * 0.1, h * (0.72 + k * 0.055), w * (0.3 + R() * 0.5), h * 0.016);
    q.globalCompositeOperation = "destination-out";
    q.globalAlpha = 0.9;
    q.fillStyle = finePattern(q, "cloud", { seed: 3 + (P.i % 5), cover: 0.45 }, 0.5);
    q.fillRect(0, 0, w, h);
  });
  g.restore();
  // a water stain: a pale bloom with a darker tide line where the water stopped
  if (P.stain > 0.45) {
    const sx = P.stain > 0.75 ? w * (0.2 + R() * 0.6) : (R() > 0.5 ? w : 0), sy = P.stain > 0.75 ? -h * 0.1 : h * (0.3 + R() * 0.5);
    const rr = Math.min(w, h) * (0.3 + R() * 0.3);
    const st = new Path2D();
    for (let k = 0; k <= 28; k++) {
      const a = (k / 28) * TAU, r = rr * (0.8 + 0.35 * K.fbm(a * 1.3 + P.i, 41));
      const x = sx + Math.cos(a) * r, y = sy + Math.sin(a) * r * 1.15;
      k ? st.lineTo(x, y) : st.moveTo(x, y);
    }
    st.closePath();
    g.save();
    g.globalCompositeOperation = "multiply";
    g.fillStyle = "rgba(196,160,110,0.22)"; g.fill(st);
    soft(g, 0, 0, w, h, Math.max(1, w / 50), (q) => { q.strokeStyle = "rgba(130,90,50,0.3)"; q.lineWidth = Math.max(0.8, w / 40); q.stroke(st); });
    g.restore();
  }
  // the graphite sketch + location mark
  const lw = Math.max(0.4, w / 85);
  const sk = new Path2D();
  sketchCat(sk, P.i === LAST ? 10 : (P.i * 7) % 10, w * 0.4, h * 0.4, w * 0.36);
  const ic = new Path2D();
  icon(ic, (P.i - 9 + 120) % 12, w * 0.4, h * 0.8, w * 0.13);
  g.save();
  g.globalCompositeOperation = "multiply";
  temp(g, w, h, (q) => {
    q.fillStyle = "#ffffff"; q.fillRect(0, 0, w, h);
    // the ghost of a line that was rubbed out and redrawn
    q.save(); q.translate(w * 0.03, -h * 0.02); q.strokeStyle = "rgba(60,58,56,0.12)"; q.lineWidth = lw * 1.4; q.stroke(sk); q.restore();
    graphite(q, sk, lw, P.i, w, h);
    graphite(q, ic, lw * 0.85, P.i + 50, w, h);
    // the point skipping over the paper tooth: lighten (not erase) a fine noise into the lines
    q.globalCompositeOperation = "lighter";
    q.globalAlpha = 0.28;
    q.fillStyle = finePattern(q, "cloud", { seed: 31, cover: 0 }, 0.1);
    q.fillRect(0, 0, w, h);
    // eraser smudges: soft pale patches that also lift some graphite
    q.globalCompositeOperation = "source-over";
    q.globalAlpha = 1;
    for (let k = 0; k < 2; k++) {
      const ex = w * (0.2 + R() * 0.6), ey = h * (0.25 + R() * 0.5), er = w * (0.06 + R() * 0.06);
      const eg = q.createRadialGradient(ex, ey, 0, ex, ey, er);
      eg.addColorStop(0, "rgba(255,255,255,0.4)"); eg.addColorStop(1, "rgba(255,255,255,0)");
      q.fillStyle = eg; q.save(); q.translate(ex, ey); q.rotate(R() * 3); q.scale(1.8, 0.7); q.translate(-ex, -ey); q.fillRect(ex - er, ey - er, er * 2, er * 2); q.restore();
    }
  });
  g.restore();
  // paper relief: it has dried wavy, so the light rakes across gentle bulges
  const wg = g.createLinearGradient(0, 0, w * 0.4, h);
  wg.addColorStop(0, "rgba(255,236,206,0.08)"); wg.addColorStop(0.3, "rgba(0,0,0,0)"); wg.addColorStop(0.5, "rgba(20,10,4,0.08)");
  wg.addColorStop(0.75, "rgba(255,236,206,0.05)"); wg.addColorStop(1, "rgba(20,10,4,0.07)");
  g.fillStyle = wg; g.fillRect(0, 0, w, h);
  // edges browned by age, dirt and fingers
  const eg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  eg.addColorStop(0, "rgba(70,40,14,0)"); eg.addColorStop(1, "rgba(70,40,14,0.42)");
  g.fillStyle = eg; g.fillRect(0, 0, w, h);
  // a lifted corner: the paper bends off the wall, the bend catches the candle light from below
  const cc = curlCorner(P);
  if (cc) {
    const s2 = w * (0.18 + (P.curl - 0.55) * 0.3);
    const cx = cc > 0 ? w : 0;
    const gx0 = cx - cc * s2, gy0 = h - s2;
    const cg = g.createLinearGradient(K.lerp(gx0, cx, 0.5) - cc * s2 * 0.25, h - s2 * 0.75, cx, h);
    cg.addColorStop(0, "rgba(30,16,6,0)"); cg.addColorStop(0.3, "rgba(30,16,6,0.22)"); cg.addColorStop(0.45, "rgba(255,226,180,0.05)"); cg.addColorStop(1, "rgba(255,230,190,0.32)");
    g.fillStyle = cg;
    g.beginPath(); g.moveTo(gx0, h); g.lineTo(cx, gy0); g.lineTo(cx, h); g.closePath(); g.fill();
  }
  g.restore();
}
function posterSprite(P, res = 2) {
  return spr("f16:pp" + P.i + ":" + res, P.w * res, P.h * res, (s) => { s.scale(res, res); posterArt(s, P, P.w, P.h); });
}
// the light direction on the wall: shadows fall away from the candle cluster below
const shadowDir = (x, y) => { const dx = x - 480, dy = y - 440, l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
// push-pins and old tape, in world space on top of a sheet (with their own soft shadows)
function fixings(s, P) {
  const R = K.rng("fix" + P.i);
  const [sdx, sdy] = shadowDir(P.x, P.y);
  const pin = (lx, ly) => {
    const r = Math.max(1.4, P.w * 0.026);
    const col = ["#c8302a", "#e8e0d0", "#d8a83a", "#2a5aa8"][Math.floor(R() * 4)];
    s.save(); s.translate(lx, ly);
    s.fillStyle = "rgba(8,4,2,0.45)"; s.beginPath(); s.ellipse(sdx * r * 1.6, sdy * r * 1.6, r * 1.3, r * 1.1, 0, 0, TAU); s.fill();
    s.strokeStyle = "rgba(8,4,2,0.4)"; s.lineWidth = r * 0.35; s.beginPath(); s.moveTo(0, 0); s.lineTo(sdx * r * 2.8, sdy * r * 2.8); s.stroke();
    const pg = s.createRadialGradient(-r * 0.3, r * 0.35, r * 0.1, 0, 0, r);
    pg.addColorStop(0, K.mix(col, "#fff4e0", 0.6)); pg.addColorStop(0.45, col); pg.addColorStop(1, K.shade(col, -0.6));
    s.fillStyle = pg; s.beginPath(); s.arc(0, 0, r, 0, TAU); s.fill();
    s.restore();
  };
  const tape = (lx, ly, a, len) => {
    const tw = Math.max(3, P.w * 0.11);
    s.save(); s.translate(lx, ly); s.rotate(a);
    const path = () => { s.beginPath(); s.moveTo(-tw / 2, -len / 2); for (let k = 0; k <= 5; k++) s.lineTo(-tw / 2 + (k / 5) * tw, -len / 2 + (k % 2 ? 0.8 : -0.6)); s.lineTo(tw / 2, len / 2); for (let k = 5; k >= 0; k--) s.lineTo(-tw / 2 + (k / 5) * tw, len / 2 + (k % 2 ? 0.7 : -0.6)); s.closePath(); };
    s.save(); s.translate(sdx * 0.8, sdy * 0.8); s.fillStyle = "rgba(10,5,2,0.18)"; path(); s.fill(); s.restore();
    path();
    const tg = s.createLinearGradient(-tw / 2, 0, tw / 2, 0);
    tg.addColorStop(0, "rgba(206,170,96,0.55)"); tg.addColorStop(0.5, "rgba(232,204,140,0.42)"); tg.addColorStop(1, "rgba(190,150,80,0.58)");
    s.fillStyle = tg; s.fill();
    s.fillStyle = "rgba(255,244,214,0.16)"; s.fillRect(-tw / 2, -len / 2, tw * 0.3, len);
    s.restore();
  };
  s.save(); s.translate(P.x, P.y); s.rotate(P.rot);
  if (P.tape > 0.62) { tape(P.w * 0.1, 0, -0.5 + R() * 0.3, P.h * 0.2); tape(P.w * 0.9, 0, 0.5 - R() * 0.3, P.h * 0.2); }
  else if (P.tape > 0.4) tape(P.w * (0.4 + R() * 0.2), 0, (R() - 0.5) * 0.3, P.h * 0.22);
  else if (P.tape > 0.18) { pin(P.w * 0.08, P.h * 0.06); pin(P.w * 0.92, P.h * 0.07); }
  else pin(P.w * 0.5, P.h * 0.05);
  s.restore();
}
// ---- the set plate (albedo, built once) --------------------------------------------------------------------
function setPlate() {
  return spr("f16:set2", WW * SET_RES, WH * SET_RES, (s) => { s.scale(SET_RES, SET_RES); s.translate(-WX0, -WY0); paintSet(s); });
}
// floorboards: the kit's perspective ground with the wood texture turned so the boards run to the
// vanishing point; FB.P boards per tile, FB.scale = one tile's width at the bottom of the frame
const FB = { P: 12, scale: 520 };
const boardX = (m, y) => VP[0] + (m / FB.P - 0.5) * FB.scale * (y - VP[1]) / (540 - VP[1]);
function paintFloor(s) {
  const X1 = WX0 + WW, Y1 = WY0 + WH;
  s.fillStyle = "#24160c"; s.fillRect(WX0, WALL.y1, WW, Y1 - WALL.y1);
  // each board: one long plank texture (grain along its length, a butt joint now and then) laid along
  // the board's centre line toward the vanishing point, clipped to the board's perspective quad
  const BT = { w: 2048, h: 64 };
  s.save();
  s.beginPath(); s.rect(WX0, WALL.y1, WW, Y1 - WALL.y1); s.clip();
  for (let m = -8; m < 24; m++) {
    const h = K.hash(m, 404), h2 = K.hash(m, 405), h3 = K.hash(m, 406);
    const q = [[boardX(m, WALL.y1), WALL.y1], [boardX(m + 1, WALL.y1), WALL.y1], [boardX(m + 1, Y1), Y1], [boardX(m, Y1), Y1]];
    const qp = quadPath(q);
    const tone = ["#6e4a32", "#7a5236", "#5e3e28"][Math.floor(h3 * 3)];
    const pat = K.texPattern(s, "wood", { color: tone, dark: K.shade(tone, -0.5), planks: 1, joints: 1, seed: 40 + (m & 1), w: BT.w, h: BT.h });
    const c0 = [(q[2][0] + q[3][0]) / 2, Y1], c1 = [(q[0][0] + q[1][0]) / 2, WALL.y1];
    const dx = c1[0] - c0[0], dy = c1[1] - c0[1];
    const wB = q[2][0] - q[3][0];
    const k = 0.45 + h * 0.4; // how many plank-lengths of texture are visible down this board
    const sx = (dx * k) / BT.w, sy = (dy * k) / BT.w;
    const nx = wB / BT.h;
    const off = h2 * BT.w;
    if (pat.setTransform && typeof DOMMatrix !== "undefined") pat.setTransform(new DOMMatrix([sx, sy, nx, 0, c0[0] - wB / 2 - sx * off, c0[1] - sy * off]));
    s.fillStyle = pat; s.fill(qp);
    // per-board tone: some oiled darker, some sun-bleached
    if (h < 0.5) { s.fillStyle = `rgba(30,14,4,${(0.05 + h2 * 0.2).toFixed(3)})`; s.fill(qp); }
    else if (h > 0.8) { s.globalCompositeOperation = "screen"; s.fillStyle = `rgba(120,96,70,${(0.04 + h2 * 0.07).toFixed(3)})`; s.fill(qp); s.globalCompositeOperation = "source-over"; }
    // the dark gap between boards, and a hairline of light on the near board's edge
    s.strokeStyle = "rgba(8,4,2,0.7)"; s.lineWidth = 0.7;
    s.beginPath(); s.moveTo(q[0][0], q[0][1]); s.lineTo(q[3][0], q[3][1]); s.stroke();
    s.strokeStyle = "rgba(255,210,160,0.07)"; s.lineWidth = 0.6;
    s.beginPath(); s.moveTo(q[0][0] + 0.8, q[0][1]); s.lineTo(q[3][0] + 1.6, q[3][1]); s.stroke();
  }
  s.restore();
  s.save();
  s.beginPath(); s.rect(WX0, WALL.y1, WW, Y1 - WALL.y1); s.clip();
  // the boards nearest the wall are older, greyer and further from the light
  const fg = s.createLinearGradient(0, WALL.y1, 0, WALL.y1 + 70);
  fg.addColorStop(0, "rgba(40,28,20,0.35)"); fg.addColorStop(1, "rgba(40,28,20,0)");
  s.fillStyle = fg; s.fillRect(WX0, WALL.y1, WW, 70);
  // a film of dust, thick along the walls, scuffed clear down the middle where people walked
  s.globalCompositeOperation = "screen";
  s.globalAlpha = 0.09;
  s.fillStyle = finePattern(s, "cloud", { seed: 12, cover: 0.55 }, 2.2);
  s.fillRect(WX0, WALL.y1, WW, Y1 - WALL.y1);
  s.globalAlpha = 1;
  const dg = s.createLinearGradient(0, WALL.y1, 0, WALL.y1 + 46);
  dg.addColorStop(0, "rgba(150,132,112,0.28)"); dg.addColorStop(1, "rgba(150,132,112,0)");
  s.fillStyle = dg; s.fillRect(WX0, WALL.y1, WW, 46);
  s.globalCompositeOperation = "source-over";
  s.restore();
  // paper scraps that have fallen off the wall (lying flat: squashed by the perspective)
  const R = K.rng("f16scraps");
  for (let i = 0; i < 11; i++) {
    const x = 140 + R() * 680, y = 398 + R() * 170, sw = (5 + R() * 9) * (y - VP[1]) / 160;
    s.save(); s.translate(x, y); s.scale(1, 0.32); s.rotate(R() * TAU);
    s.fillStyle = "rgba(10,5,2,0.4)"; s.fillRect(-sw / 2 + 0.6, -sw / 2 + 1.6, sw, sw * 0.8);
    s.fillStyle = PAPERS[i % PAPERS.length]; s.fillRect(-sw / 2, -sw / 2, sw, sw * 0.8);
    s.restore();
  }
}
function paintSet(s) {
  const R = K.rng("f16set");
  const X1 = WX0 + WW, Y1 = WY0 + WH;
  s.fillStyle = "#1a100a";
  s.fillRect(WX0, WY0, WW, WH);
  paintFloor(s);
  // back wall: dusty plaster with water stains running down from the ceiling
  K.texRect(s, "plaster", WALL.x0, WALL.y0, WALL.x1 - WALL.x0, WALL.y1 - WALL.y0, { tex: { color: "#9a7e68", grime: "#3e2a1c", stain: 0.75, cracks: true, seed: 3 }, scale: 280 });
  soft(s, WALL.x0, WALL.y0, WALL.x1 - WALL.x0, WALL.y1 - WALL.y0, 5, (q) => {
    for (let i = 0; i < 10; i++) {
      const x = 120 + R() * 720, w = 10 + R() * 34, h = 60 + R() * 230;
      const tg = q.createLinearGradient(0, WALL.y0, 0, WALL.y0 + h);
      tg.addColorStop(0, "rgba(58,38,22,0.32)"); tg.addColorStop(0.8, "rgba(58,38,22,0.1)"); tg.addColorStop(1, "rgba(58,38,22,0)");
      q.fillStyle = tg; q.fillRect(x, WALL.y0, w, h);
    }
  });
  // side walls: same plaster (they turn away from the candles, the light map darkens them)
  const lw = new Path2D(); lw.moveTo(WX0, ceilL(WX0)); lw.lineTo(WALL.x0, WALL.y0); lw.lineTo(WALL.x0, WALL.y1); lw.lineTo(WX0, floorL(WX0)); lw.closePath();
  const rw = new Path2D(); rw.moveTo(X1, ceilR(X1)); rw.lineTo(WALL.x1, WALL.y0); rw.lineTo(WALL.x1, WALL.y1); rw.lineTo(X1, floorR(X1)); rw.closePath();
  K.texFill(s, "plaster", lw, { tex: { color: "#a88e78", grime: "#3a2818", stain: 0.8, seed: 5 }, scale: 260, tint: "#9a8a80", tintAlpha: 0.35 });
  K.texFill(s, "plaster", rw, { tex: { color: "#a88e78", grime: "#3a2818", stain: 0.8, seed: 6 }, scale: 260, tint: "#8a7a72", tintAlpha: 0.4 });
  // the side walls darken toward the camera (further from the candles), softly
  for (const [p, x0, x1] of [[lw, WALL.x0, WX0], [rw, WALL.x1, X1]]) {
    const gg = s.createLinearGradient(x0, 0, x1, 0);
    gg.addColorStop(0, "rgba(20,10,6,0)"); gg.addColorStop(1, "rgba(20,10,6,0.45)");
    s.fillStyle = gg; s.fill(p);
  }
  // skirting boards: back wall, then each side wall in perspective; dust on the top edge, scuffs
  K.texRect(s, "wood", WALL.x0, WALL.y1 - 15, WALL.x1 - WALL.x0, 15, { tex: { color: "#5a3a26", dark: "#22130b", planks: 1, seed: 8 }, scale: 140 });
  s.fillStyle = "rgba(196,180,156,0.34)"; s.fillRect(WALL.x0, WALL.y1 - 15.6, WALL.x1 - WALL.x0, 1.3);
  s.fillStyle = "rgba(255,220,180,0.12)"; s.fillRect(WALL.x0, WALL.y1 - 14.3, WALL.x1 - WALL.x0, 0.8);
  for (let i = 0; i < 14; i++) { const x = WALL.x0 + R() * (WALL.x1 - WALL.x0); s.fillStyle = `rgba(20,10,4,${(0.15 + R() * 0.25).toFixed(2)})`; s.fillRect(x, WALL.y1 - 12 + R() * 8, 4 + R() * 16, 1 + R() * 2); }
  for (const [side, xa, xb] of [[-1, WX0, WALL.x0], [1, WALL.x1, X1]]) {
    const on = side < 0 ? onL : onR, fl = side < 0 ? floorL : floorR;
    const sk = new Path2D(); sk.moveTo(xa, on(xa, 0.955)); sk.lineTo(xb, on(xb, 0.955)); sk.lineTo(xb, fl(xb)); sk.lineTo(xa, fl(xa)); sk.closePath();
    K.texFill(s, "wood", sk, { tex: { color: "#4a3020", dark: "#1a0e08", planks: 1, seed: 9 }, scale: 140, tint: "#8a7060", tintAlpha: 0.5 });
    s.strokeStyle = "rgba(196,180,156,0.26)"; s.lineWidth = 1; s.beginPath(); s.moveTo(xa, on(xa, 0.955)); s.lineTo(xb, on(xb, 0.955)); s.stroke();
  }
  // drop ceiling of the old mall unit: a grid of tiles in true perspective (Y = -210), a few missing
  const ceil = new Path2D();
  ceil.moveTo(WX0, WY0); ceil.lineTo(X1, WY0); ceil.lineTo(X1, ceilR(X1)); ceil.lineTo(WALL.x1, WALL.y0); ceil.lineTo(WALL.x0, WALL.y0); ceil.lineTo(WX0, ceilL(WX0)); ceil.closePath();
  K.texFill(s, "plaster", ceil, { tex: { color: "#a09484", grime: "#3a3028", stain: 0.9, seed: 9 }, scale: 200, tint: "#7a6e64", tintAlpha: 0.45 });
  s.save();
  s.clip(ceil);
  const CY = -210, Zs = [1, 1 / 1.09, 1 / 1.18, 1 / 1.27, 1 / 1.36, 1 / 1.45, 1 / 1.54, 1 / 1.63, 1 / 1.72];
  const Xs = []; for (let k = -6; k <= 6; k++) Xs.push(k * 95 - 0);
  for (let r = 0; r < Zs.length - 1; r++) {
    for (let c = 0; c < Xs.length - 1; c++) {
      const q = [P3(Xs[c], CY, Zs[r]), P3(Xs[c + 1], CY, Zs[r]), P3(Xs[c + 1], CY, Zs[r + 1]), P3(Xs[c], CY, Zs[r + 1])];
      const hh = K.hash(r * 16 + c, 77);
      if (hh < 0.1) { s.fillStyle = "#070403"; s.fill(quadPath(q)); }
      else if (hh < 0.3) { s.fillStyle = `rgba(60,40,20,${(0.1 + hh * 0.5).toFixed(2)})`; s.fill(quadPath(q)); } // water-stained tiles
      else if (hh > 0.9) { s.fillStyle = "rgba(0,0,0,0.5)"; const a = q[0], b = q[1]; s.beginPath(); s.moveTo(a[0], a[1]); s.lineTo(b[0], b[1]); s.lineTo(b[0], b[1] + 2.5); s.lineTo(a[0], a[1] + 2.5); s.fill(); } // a sagging tile
    }
  }
  s.strokeStyle = "rgba(44,32,22,0.85)";
  for (const Z of Zs) { const a = P3(-RX * 1.6, CY, Z), b = P3(RX * 1.6, CY, Z); s.lineWidth = 1.6 / Z; s.beginPath(); s.moveTo(a[0], a[1]); s.lineTo(b[0], b[1]); s.stroke(); }
  for (const X of Xs) { const a = P3(X, CY, 1), b = P3(X, CY, 0.5); s.lineWidth = 2; s.beginPath(); s.moveTo(a[0], a[1]); s.lineTo(b[0], b[1]); s.stroke(); }
  // the grid's lower lip catches a little candle light
  s.strokeStyle = "rgba(255,200,140,0.12)";
  for (const Z of Zs) { const a = P3(-RX * 1.6, CY + 1.2, Z), b = P3(RX * 1.6, CY + 1.2, Z); s.lineWidth = 0.8 / Z; s.beginPath(); s.moveTo(a[0], a[1]); s.lineTo(b[0], b[1]); s.stroke(); }
  s.restore();
  // ambient occlusion in every corner and seam (the floor seam darkest, a band of grime above it)
  K.aoEdge(s, WALL.x0, WALL.y1, WALL.x1, WALL.y1, { width: 34, alpha: 0.6, side: 1 });
  K.aoEdge(s, WALL.x0, WALL.y1, WALL.x1, WALL.y1, { width: 22, alpha: 0.62, side: -1 });
  K.aoEdge(s, WALL.x0, WALL.y0, WALL.x1, WALL.y0, { width: 40, alpha: 0.6, side: -1 });
  K.aoEdge(s, WALL.x0, WALL.y0, WALL.x0, WALL.y1, { width: 30, alpha: 0.5, side: 0 });
  K.aoEdge(s, WALL.x1, WALL.y0, WALL.x1, WALL.y1, { width: 30, alpha: 0.5, side: 0 });
  K.aoEdge(s, WX0, floorL(WX0), WALL.x0, WALL.y1, { width: 22, alpha: 0.55, side: 0 });
  K.aoEdge(s, WALL.x1, WALL.y1, X1, floorR(X1), { width: 22, alpha: 0.55, side: 0 });
  K.aoEdge(s, WX0, ceilL(WX0), WALL.x0, WALL.y0, { width: 26, alpha: 0.5, side: 0 });
  K.aoEdge(s, WALL.x1, WALL.y0, X1, ceilR(X1), { width: 26, alpha: 0.5, side: 0 });
  // the window recess in the left wall (its sky and slats are emissive, painted per frame)
  s.fillStyle = "#0a0605"; s.fill(quadPath(winQuad()));
  // the door in the right wall, closed (shot 8 paints the opening and the swinging leaf over this)
  doorClosed(s);
  // posters, each lifting off the plaster with a soft shadow thrown away from the candles
  soft(s, WALL.x0 - 20, WALL.y0, WALL.x1 - WALL.x0 + 40, WALL.y1 - WALL.y0 + 20, 2.2, (q) => {
    for (const P of POSTERS) {
      const [dx, dy] = shadowDir(P.x + P.w / 2, P.y + P.h / 2);
      q.save(); q.translate(P.x + dx * 2.2, P.y + dy * 2.2 + 0.6); q.rotate(P.rot);
      q.fillStyle = "rgba(14,6,2,0.6)"; q.fillRect(0, 0, P.w, P.h);
      // the lifted corner stands further off the wall: a bigger, softer shadow under it
      const cc = curlCorner(P);
      if (cc) { const s2 = P.w * 0.22, cx = cc > 0 ? P.w : 0; q.fillStyle = "rgba(14,6,2,0.4)"; q.beginPath(); q.moveTo(cx - cc * s2, P.h); q.lineTo(cx + cc * 2, P.h + 3); q.lineTo(cx + cc * 2.5, P.h - s2); q.closePath(); q.fill(); }
      q.restore();
    }
  });
  for (const P of POSTERS) {
    s.save(); s.translate(P.x, P.y); s.rotate(P.rot);
    s.drawImage(posterSprite(P, 2), 0, 0, P.w, P.h);
    s.restore();
    fixings(s, P);
  }
}
// the door: its frame (architrave), and the leaf flush in the opening
function doorClosed(s) {
  const dq = doorQuad();
  const fr = [P3(RX, DR.top - 12, DR.Z0 + 0.012), P3(RX, DR.top - 12, DR.Z1 - 0.012), P3(RX, RF, DR.Z1 - 0.012), P3(RX, RF, DR.Z0 + 0.012)];
  K.texFill(s, "wood", quadPath(fr), { tex: { color: "#3a2618", dark: "#120a06", planks: 2, seed: 13 }, scale: 120, rot: Math.PI / 2, tint: "#8a7060", tintAlpha: 0.4 });
  K.texFill(s, "wood", quadPath(dq), { tex: { color: "#4a3020", dark: "#1a0e08", planks: 3, seed: 14 }, scale: 90, rot: Math.PI / 2, tint: "#6a5040", tintAlpha: 0.5 });
  // recessed panels and the handle
  const pn = (z0, z1, y0, y1) => quadPath([P3(RX, y0, z0), P3(RX, y0, z1), P3(RX, y1, z1), P3(RX, y1, z0)]);
  s.strokeStyle = "rgba(10,5,2,0.6)"; s.lineWidth = 1.2;
  s.stroke(pn(DR.Z0 - 0.02, DR.Z1 + 0.02, DR.top + 20, -10));
  s.stroke(pn(DR.Z0 - 0.02, DR.Z1 + 0.02, 10, RF - 20));
  const hp = P3(RX, 0, DR.Z1 + 0.018);
  s.fillStyle = "#b08850"; s.beginPath(); s.arc(hp[0], hp[1], 2.2, 0, TAU); s.fill();
  s.fillStyle = "rgba(255,240,200,0.6)"; s.beginPath(); s.arc(hp[0] - 0.6, hp[1] - 0.6, 0.8, 0, TAU); s.fill();
  K.aoEdge(s, fr[3][0], fr[3][1], fr[2][0], fr[2][1], { width: 8, alpha: 0.5, side: 0 });
}
// light through the open door, from a low warm source outside: where it lands on the floor (a wedge
// from the threshold out across the boards), and the beam volume in the dusty air (both cached)
const DZW = 1319; // world units per Z unit (the camera's focal length in back-wall pixels)
const DLIT = [-1, 0.8, -0.35]; // direction the light travels (world units)
function doorFloorHit(Y, Z) { const sc = (RF - Y) / DLIT[1]; return P3(RX + DLIT[0] * sc, RF, Z + (DLIT[2] * sc) / DZW); }
const doorWedge = () => [P3(RX, RF, DR.Z0), P3(RX, RF, DR.Z1), doorFloorHit(DR.top, DR.Z1), doorFloorHit(DR.top, DR.Z0)];
function doorBeamSprite() {
  const B = { x: 360, y: 0, w: 640, h: 520 };
  return { B, img: spr("f16:doorbeam", B.w / 2, B.h / 2, (s) => {
    s.scale(0.5, 0.5); s.translate(-B.x, -B.y);
    soft(s, B.x, B.y, B.w, B.h, 6, (q) => {
      const hull = [P3(RX, DR.top, DR.Z0), P3(RX, DR.top, DR.Z1), P3(RX, RF, DR.Z1), doorFloorHit(DR.top, DR.Z1), doorFloorHit(DR.top, DR.Z0)];
      const a = P3(RX, -10, (DR.Z0 + DR.Z1) / 2), b = doorFloorHit(-60, (DR.Z0 + DR.Z1) / 2);
      const gr = q.createLinearGradient(a[0], a[1], b[0], b[1]);
      gr.addColorStop(0, "rgba(255,226,160,0.55)"); gr.addColorStop(0.5, "rgba(255,214,140,0.2)"); gr.addColorStop(1, "rgba(255,200,120,0.03)");
      q.fillStyle = gr; q.fill(quadPath(hull));
    });
    s.globalCompositeOperation = "destination-out"; s.globalAlpha = 0.45;
    s.fillStyle = finePattern(s, "cloud", { seed: 77, cover: 0.5 }, 1.6); s.fillRect(B.x, B.y, B.w, B.h);
  }) };
}
// the open door (shot 8): bright corridor beyond, the jamb's thickness, and the leaf swung into the room
function doorOpen(g, t, open) {
  if (open <= 0.003) return;
  const q = doorQuad();
  // beyond: a warm-lit corridor, exposed bright but not clipped (a soft core, warmer toward the edges)
  const c = P3(RX + 200, 20, (DR.Z0 + DR.Z1) / 2);
  const dg = g.createRadialGradient(c[0] - 6, c[1] - 30, 6, c[0], c[1], 210);
  dg.addColorStop(0, "#fff4d6"); dg.addColorStop(0.35, "#ffe2a8"); dg.addColorStop(1, "#d8a868");
  g.save();
  g.globalAlpha *= K.smooth(K.clamp(open * 3));
  g.fillStyle = dg; g.fill(quadPath(q));
  g.save(); g.clip(quadPath(q));
  // the corridor floor and its far wall: a little structure in the light
  const fl = [P3(RX, RF, DR.Z0), P3(RX, RF, DR.Z1), P3(RX + 260, RF, DR.Z1), P3(RX + 260, RF, DR.Z0)];
  g.fillStyle = "rgba(170,120,70,0.45)"; g.fill(quadPath(fl));
  const fw = P3(RX + 260, DR.top, DR.Z0), fw2 = P3(RX + 260, RF, DR.Z0);
  g.fillStyle = "rgba(150,100,60,0.18)"; g.fillRect(fw[0] - 30, fw[1], 60, fw2[1] - fw[1]);
  g.restore();
  // the far jamb (the wall's thickness, facing us) and the header's underside
  const T = DR.thick;
  const jamb = [P3(RX, DR.top, DR.Z0), P3(RX + T, DR.top, DR.Z0), P3(RX + T, RF, DR.Z0), P3(RX, RF, DR.Z0)];
  const jg = g.createLinearGradient(jamb[0][0], 0, jamb[1][0], 0);
  jg.addColorStop(0, "#8a6040"); jg.addColorStop(1, "#d8a870");
  g.fillStyle = jg; g.fill(quadPath(jamb));
  const head = [P3(RX, DR.top, DR.Z0), P3(RX + T, DR.top, DR.Z0), P3(RX + T, DR.top, DR.Z1), P3(RX, DR.top, DR.Z1)];
  g.fillStyle = "#5a3c26"; g.fill(quadPath(head));
  g.restore();
  // the leaf opens outward, hinged on the far jamb: through the opening we see its edge and its
  // corridor-lit face swinging away
  const th = open * 1.2;
  const wz = DR.Z0 - DR.Z1;
  const fx = RX + DR.thick + wz * DZW * Math.sin(th) * 0.55, fz = DR.Z0 - wz * Math.cos(th);
  const leaf = [P3(RX + DR.thick, DR.top + 2, DR.Z0), P3(fx, DR.top + 2, fz), P3(fx, RF - 1, fz), P3(RX + DR.thick, RF - 1, DR.Z0)];
  g.save(); g.clip(quadPath(q));
  K.texFill(g, "wood", quadPath(leaf), { tex: { color: "#4a3020", dark: "#1a0e08", planks: 3, seed: 14 }, scale: 90, rot: Math.PI / 2, tint: "#c08858", tintAlpha: 0.5 });
  const lg = g.createLinearGradient(leaf[0][0], 0, leaf[1][0], 0);
  lg.addColorStop(0, "rgba(255,200,130,0.35)"); lg.addColorStop(1, "rgba(40,20,8,0.35)");
  g.fillStyle = lg; g.fill(quadPath(leaf));
  const ed = [P3(fx, DR.top + 2, fz), P3(fx - 3, DR.top + 2, fz - 0.003), P3(fx - 3, RF - 1, fz - 0.003), P3(fx, RF - 1, fz)];
  g.fillStyle = "rgba(60,30,12,0.9)"; g.fill(quadPath(ed));
  g.restore();
  // the beam in the air
  const bs = doorBeamSprite();
  g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.6 * open;
  g.drawImage(bs.img, bs.B.x, bs.B.y, bs.B.w, bs.B.h);
  g.restore();
}

// ---- candles -------------------------------------------------------------------------------------------
// Each candle is a hashed variant (kind, wax colour, height, how far it has burned down and how it has
// melted) baked once into one of three depth-band sprites; per frame only the flames, a flickering
// light pool on the boards around each one and the wax glow near the flame are drawn.
const WAX = ["#eadfc4", "#f0e2b6", "#dcb87e", "#cfa38c", "#e8e2d6", "#e4cfa4"];
const CANDLES = (() => {
  const R = K.rng("f16candles");
  const out = [];
  for (let i = 0; i < 18; i++) {
    const r = R();
    const kind = r < 0.5 ? "pillar" : r < 0.78 ? "taper" : "tea";
    const x = 250 + R() * 460, y = 396 + R() * 40;
    const d = (y - VP[1]) / 160; // nearer = bigger
    const w = (kind === "pillar" ? 9 + R() * 6 : kind === "taper" ? 3.6 + R() * 1 : 8.5 + R() * 1.5) * d;
    const h = (kind === "pillar" ? 9 + R() * 26 : kind === "taper" ? 24 + R() * 18 : 3.2) * d;
    const base = kind === "taper" ? 5 * d : 0;
    const wax = WAX[Math.floor(R() * WAX.length)];
    out.push({ x, y, w, h, base, d, kind, i, wax, fx: x + 0.4 * d, fy: y - base - h - 1.1 * d });
  }
  // every candle's contact shadow points away from the light of its neighbours
  for (const c of out) {
    let sx = 0, sy = 0;
    for (const o of out) {
      if (o === c) continue;
      const dx = c.x - o.x, dy = (c.y - o.y) * 2.5, l = Math.hypot(dx, dy);
      if (l < 1 || l > 220) continue;
      sx += dx / (l * l) * 40; sy += dy / (l * l) * 40;
    }
    const l = Math.hypot(sx, sy) || 1;
    c.sdx = sx / l; c.sdy = sy / l; c.sk = Math.min(1, l * 2);
  }
  return out.sort((a, b) => a.y - b.y);
})();
const bandOf = (c) => (c.y < 404 ? 0 : c.y < 422 ? 1 : 2);
const CB = { x: 200, y: 300, w: 560, h: 170, res: 3 };
function candleBody(s, c) {
  const { x, y, w, h, d } = c;
  const R = K.rng("wax" + c.i);
  const warm = K.mix(c.wax, "#d88a48", 0.3);
  const wax = K.shade(warm, -0.3), waxD = K.shade(warm, -0.66), waxL = K.shade(warm, -0.1);
  // contact shadow thrown by the other flames, along the floor (squashed by the perspective)
  s.save();
  s.translate(x, y + 0.4); s.scale(1, 0.3); s.rotate(Math.atan2(c.sdy, c.sdx));
  const len = (h + c.base) * (1.2 + c.sk * 1.4);
  const sg = s.createLinearGradient(0, 0, len, 0);
  sg.addColorStop(0, "rgba(6,3,1,0.55)"); sg.addColorStop(0.5, "rgba(6,3,1,0.22)"); sg.addColorStop(1, "rgba(6,3,1,0)");
  s.fillStyle = sg;
  s.beginPath(); s.moveTo(0, -w * 0.5); s.lineTo(len, -w * 1.1); s.lineTo(len, w * 1.1); s.lineTo(0, w * 0.5); s.closePath(); s.fill();
  s.restore();
  K.shadowBlob(s, x, y + 0.5, w * 0.75, w * 0.18, { alpha: 0.9, soft: 0.6 });
  // a pool of old wax run onto the boards: flat, glossy, uneven
  const pr = w * (0.9 + R() * 1.1);
  s.save();
  s.translate(x + (R() - 0.5) * w * 0.4, y + 0.4); s.scale(1, 0.26);
  const pool = new Path2D();
  for (let k = 0; k <= 20; k++) { const a = (k / 20) * TAU, rr = pr * (0.75 + 0.4 * K.fbm(a * 1.5 + c.i, 7)); k ? pool.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : pool.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  pool.closePath();
  const pg = s.createRadialGradient(0, -pr * 0.3, 0, 0, 0, pr);
  pg.addColorStop(0, K.rgba(wax, 0.8)); pg.addColorStop(0.6, K.rgba(waxD, 0.7)); pg.addColorStop(1, K.rgba(waxD, 0.45));
  s.fillStyle = pg; s.fill(pool);
  s.fillStyle = "rgba(255,220,170,0.16)"; s.beginPath(); s.ellipse(-pr * 0.2, -pr * 0.35, pr * 0.35, pr * 0.15, 0, 0, TAU); s.fill();
  s.restore();
  if (c.kind === "taper") {
    // brass holder: dish + stem, a warm specular from the flame above
    const dg = s.createLinearGradient(x - w * 1.8, 0, x + w * 1.8, 0);
    dg.addColorStop(0, "#2a1a08"); dg.addColorStop(0.42, "#a87830"); dg.addColorStop(0.52, "#ffe0a0"); dg.addColorStop(0.62, "#a87830"); dg.addColorStop(1, "#3a2408");
    s.fillStyle = dg;
    s.beginPath(); s.ellipse(x, y - 0.8 * d, w * 1.8, w * 0.48, 0, 0, TAU); s.fill();
    s.fillStyle = "rgba(20,10,2,0.5)"; s.beginPath(); s.ellipse(x, y - 0.6 * d, w * 1.8, w * 0.48, 0, 0, Math.PI); s.fill();
    s.fillStyle = dg;
    s.fillRect(x - w * 0.62, y - c.base, w * 1.24, c.base - 0.6 * d);
    s.beginPath(); s.ellipse(x, y - c.base, w * 0.85, w * 0.26, 0, 0, TAU); s.fill();
    // a frozen drip down onto the dish
    s.fillStyle = K.rgba(wax, 0.9); s.beginPath(); s.ellipse(x + w * 0.9, y - 0.9 * d, w * 0.5, w * 0.16, 0, 0, TAU); s.fill();
  }
  if (c.kind === "tea") {
    // aluminium cup with the wax inside, molten, clear and bright
    const mg = s.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    mg.addColorStop(0, "#3a3430"); mg.addColorStop(0.4, "#c8c0b4"); mg.addColorStop(0.6, "#efe6d8"); mg.addColorStop(1, "#4a423a");
    s.fillStyle = mg; s.fillRect(x - w / 2, y - h, w, h);
    s.beginPath(); s.ellipse(x, y, w / 2, w * 0.14, 0, 0, Math.PI); s.fill();
    const wg = s.createRadialGradient(x, y - h, 0, x, y - h, w / 2);
    wg.addColorStop(0, "#fff4d8"); wg.addColorStop(1, "#d8a868");
    s.fillStyle = wg; s.beginPath(); s.ellipse(x, y - h, w * 0.46, w * 0.13, 0, 0, TAU); s.fill();
    s.strokeStyle = "#1a0e06"; s.lineWidth = Math.max(0.35, d * 0.4); s.beginPath(); s.moveTo(x, y - h); s.lineTo(x + 0.4 * d, y - h - 1.1 * d); s.stroke();
    return;
  }
  // wax body: a cylinder melted unevenly at the top (one side burned lower, a tunnelled lip)
  const yb = y - c.base, top = yb - h;
  const j = (k) => (K.hash(c.i, k) - 0.5) * w * 0.5;
  const lean = (K.hash(c.i, 9) - 0.5) * w * 0.35;
  const body = new Path2D();
  body.moveTo(x - w / 2, yb); body.lineTo(x - w / 2, top + w * 0.16 + j(1));
  body.quadraticCurveTo(x - w * 0.36, top - w * 0.04 + j(5) * 0.3 + lean, x - w * 0.18, top + w * 0.02 + lean * 0.5);
  body.quadraticCurveTo(x, top + w * 0.14, x + w * 0.2, top + j(3) * 0.4 - lean * 0.5);
  body.quadraticCurveTo(x + w * 0.4, top - w * 0.02 + j(6) * 0.3 - lean, x + w / 2, top + w * 0.14 + j(4));
  body.lineTo(x + w / 2, yb);
  body.ellipse(x, yb, w / 2, w * 0.13, 0, 0, Math.PI);
  body.closePath();
  const cg = s.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  cg.addColorStop(0, K.shade(warm, -0.85)); cg.addColorStop(0.2, K.shade(warm, -0.6)); cg.addColorStop(0.42, K.shade(warm, -0.38)); cg.addColorStop(0.62, K.shade(warm, -0.48)); cg.addColorStop(1, K.shade(warm, -0.88));
  s.fillStyle = cg; s.fill(body);
  s.save();
  s.clip(body);
  // the top glows: flame light scattered inside the translucent wax (subsurface), deepest near the flame
  const sg2 = s.createLinearGradient(0, top, 0, top + Math.min(h * 0.8, w * 1.3));
  sg2.addColorStop(0, "rgba(255,226,160,1)"); sg2.addColorStop(0.25, "rgba(255,176,90,0.75)"); sg2.addColorStop(0.6, "rgba(230,120,50,0.3)"); sg2.addColorStop(1, "rgba(200,100,40,0)");
  s.fillStyle = sg2; s.fillRect(x - w, top - 4, w * 2, h + 4);
  // light falls off down the candle; contact occlusion at the base
  const bg = s.createLinearGradient(0, yb - Math.min(h, w * 1.6), 0, yb + w * 0.13);
  bg.addColorStop(0, "rgba(20,10,4,0)"); bg.addColorStop(1, "rgba(20,10,4,0.6)");
  s.fillStyle = bg; s.fillRect(x - w, yb - h, w * 2, h + w);
  // fine vertical texture of hand-poured wax
  s.globalAlpha = 0.18;
  s.fillStyle = finePattern(s, "cloud", { seed: 60 + (c.i % 4), cover: 0.3 }, 0.08);
  s.fillRect(x - w, top - 2, w * 2, h + 4);
  s.globalAlpha = 1;
  // runs of wax down the side: each a raised ridge with a lit flank, a shadow flank and a bead at the end
  const nd = 2 + Math.floor(K.hash(c.i, 30) * 4);
  for (let k = 0; k < nd; k++) {
    const dx = (K.hash(c.i, 10 + k) - 0.5) * w * 0.85, dl = Math.min(h * 0.95, w * (0.4 + K.hash(c.i, 20 + k) * 2.4));
    const dw = w * (0.06 + K.hash(c.i, 40 + k) * 0.06) + 0.25;
    const x0 = x + dx, y0 = top + w * 0.1;
    s.fillStyle = "rgba(10,5,2,0.25)";
    s.beginPath(); s.moveTo(x0 + dw * 0.4, y0); s.lineTo(x0 + dw * 1.1, y0 + dl); s.arc(x0 + dw * 0.4, y0 + dl, dw * 1.05, 0, Math.PI); s.fill();
    const dg = s.createLinearGradient(x0 - dw, 0, x0 + dw, 0);
    dg.addColorStop(0, K.rgba(waxL, 0.7)); dg.addColorStop(0.6, K.rgba(wax, 0.8)); dg.addColorStop(1, K.rgba(waxD, 0.5));
    s.fillStyle = dg;
    s.beginPath(); s.moveTo(x0 - dw, y0); s.quadraticCurveTo(x0 - dw * 0.7, y0 + dl * 0.5, x0 - dw * 0.8, y0 + dl); s.arc(x0, y0 + dl, dw * 1.05, Math.PI, 0, true); s.quadraticCurveTo(x0 + dw * 0.7, y0 + dl * 0.5, x0 + dw, y0); s.fill();
    s.fillStyle = "rgba(255,246,220,0.5)"; s.beginPath(); s.arc(x0 - dw * 0.3, y0 + dl - dw * 0.2, dw * 0.35, 0, TAU); s.fill();
  }
  s.restore();
  // molten pool inside the tunnelled lip: clear, bright wax
  const mp = s.createRadialGradient(x, top + w * 0.09, 0, x, top + w * 0.09, w * 0.42);
  mp.addColorStop(0, "#fff6d6"); mp.addColorStop(0.6, "#ffd48a"); mp.addColorStop(1, K.rgba("#e0a060", 0.7));
  s.fillStyle = mp; s.beginPath(); s.ellipse(x, top + w * 0.1, w * 0.36, w * 0.1, 0, 0, TAU); s.fill();
  s.strokeStyle = "#140a04"; s.lineWidth = Math.max(0.35, w * 0.06); s.lineCap = "round";
  s.beginPath(); s.moveTo(x, top + w * 0.08); s.quadraticCurveTo(x + 0.2 * d, top - 0.5 * d, x + 0.4 * d, top - 0.9 * d); s.stroke();
  s.fillStyle = "rgba(255,120,40,0.9)"; s.beginPath(); s.arc(x + 0.4 * d, top - 0.9 * d, Math.max(0.25, w * 0.04), 0, TAU); s.fill(); // the glowing wick tip
}
function candleSprite(band) {
  return spr("f16:cand2" + band, CB.w * CB.res, CB.h * CB.res, (s) => {
    s.scale(CB.res, CB.res); s.translate(-CB.x, -CB.y);
    for (const c of CANDLES) if (bandOf(c) === band) candleBody(s, c);
  });
}
// a candle flame: a teardrop with a blue, oxygen-fed base, a bright yellow body and a near-white core
// (the lens blooms the core), swaying and stretching with the air
function flame(g, x, y, s, t, i, bright) {
  const fl = 0.88 + 0.12 * K.noise(t * 7 + i * 3.1, i) + 0.05 * Math.sin(t * 19 + i * 2);
  const sway = K.noise(t * 1.7 + i * 0.7, i + 9) * 0.5 + K.noise(t * 8 + i, i + 4) * 0.12;
  const fh = 8.2 * s * fl, fw = 1.75 * s;
  K.glow(g, x, y - fh * 0.4, 16 * s * fl, "#ff8a2a", 0.13 * bright);
  g.save();
  g.translate(x, y);
  const tipx = sway * fw * 1.6;
  const p = new Path2D();
  p.moveTo(tipx, -fh);
  p.bezierCurveTo(fw * 0.5 + tipx * 0.6, -fh * 0.62, fw * 1.05, -fh * 0.2, fw * 0.6, -fh * 0.02);
  p.bezierCurveTo(fw * 0.3, fw * 0.32, -fw * 0.3, fw * 0.32, -fw * 0.6, -fh * 0.02);
  p.bezierCurveTo(-fw * 1.05, -fh * 0.2, -fw * 0.5 + tipx * 0.6, -fh * 0.62, tipx, -fh);
  const fg = g.createRadialGradient(tipx * 0.15, -fh * 0.3, 0, tipx * 0.3, -fh * 0.42, fh * 0.75);
  fg.addColorStop(0, "#ffffff"); fg.addColorStop(0.2, "#fff8e0"); fg.addColorStop(0.45, "#ffd070"); fg.addColorStop(0.75, "rgba(255,130,30,0.75)"); fg.addColorStop(1, "rgba(255,90,20,0)");
  g.fillStyle = fg; g.fill(p);
  // the dark zone around the wick and the blue base
  const bg = g.createRadialGradient(0, -fw * 0.1, 0, 0, -fw * 0.1, fw * 0.75);
  bg.addColorStop(0, "rgba(60,90,255,0.75)"); bg.addColorStop(0.6, "rgba(80,110,255,0.35)"); bg.addColorStop(1, "rgba(80,110,255,0)");
  g.fillStyle = bg; g.beginPath(); g.ellipse(0, -fw * 0.1, fw * 0.75, fw * 0.55, 0, 0, TAU); g.fill();
  // the white-hot inner core, elongated
  g.fillStyle = "#ffffff"; g.beginPath(); g.ellipse(tipx * 0.2, -fh * 0.3, fw * 0.28, fh * 0.2, tipx * 0.02, 0, TAU); g.fill();
  g.restore();
  K.glow(g, x, y - fh * 0.38, 4.5 * s * fl, "#fff2c8", 0.4 * bright);
}
function candles(g, t, band, bright = 1) {
  // the light each flame throws on the boards right around it, flickering with it
  g.save();
  g.globalCompositeOperation = "lighter";
  for (const c of CANDLES) {
    if (bandOf(c) !== band) continue;
    const fl = 0.86 + 0.14 * K.noise(t * 7 + c.i * 3.1, c.i);
    const r = (c.kind === "tea" ? 34 : 48) * c.d;
    K.lightPool(g, c.fx, c.y + 1, r, "#ffa850", { intensity: 0.2 * fl * bright, flat: 0.3 });
  }
  g.restore();
  g.drawImage(candleSprite(band), CB.x, CB.y, CB.w, CB.h);
  for (const c of CANDLES) if (bandOf(c) === band) {
    const fl = 0.86 + 0.14 * K.noise(t * 7 + c.i * 3.1, c.i);
    // wax glows brighter right under the flame as it flickers
    if (c.kind !== "tea") K.glow(g, c.fx - 0.4 * c.d, c.fy + c.w * 0.5, c.w * 0.75, "#ffb060", 0.25 * fl * bright);
    flame(g, c.fx, c.fy, c.d * (c.kind === "taper" ? 0.85 : 1.05), t, c.i, bright);
  }
}

// ---- light: a small world-space light map multiplied over the albedo plate -----------------------------------
const LMS = 0.25;
function mapSprite(key, fn) {
  return spr("f16:map:" + key, WW * LMS, WH * LMS, (s) => { s.scale(LMS, LMS); s.translate(-WX0, -WY0); s.globalCompositeOperation = "lighter"; fn(s); });
}
// soft-cored ~inverse-square falloff
function radial(s, x, y, r, color, a, sy = 1) {
  s.save(); s.translate(x, y); s.scale(1, sy);
  const gr = s.createRadialGradient(0, 0, 0, 0, 0, r);
  gr.addColorStop(0, K.rgba(color, a)); gr.addColorStop(0.1, K.rgba(color, a * 0.7)); gr.addColorStop(0.2, K.rgba(color, a * 0.45));
  gr.addColorStop(0.4, K.rgba(color, a * 0.18)); gr.addColorStop(0.7, K.rgba(color, a * 0.05)); gr.addColorStop(1, K.rgba(color, 0));
  s.fillStyle = gr; s.fillRect(-r, -r, r * 2, r * 2); s.restore();
}
const candleMap = () => mapSprite("candles", (s) => {
  for (const c of CANDLES) {
    const a = c.kind === "tea" ? 0.12 : 0.17;
    radial(s, c.fx, c.fy, 430, "#ffa050", a);
    radial(s, c.fx, c.y + 6, 300, "#ffb060", a * 1.1, 0.3);
  }
  // the side walls and ceiling catch the candle light at a grazing angle: a soft, dimmer wash that keeps
  // them readable (no black frame around the set) and falls off toward the camera
  radial(s, WALL.x0 - 10, 360, 420, "#ff9a48", 0.42, 1.3);
  radial(s, WALL.x1 + 10, 360, 420, "#ff9a48", 0.42, 1.3);
  radial(s, 480, WALL.y0 - 20, 560, "#ff9a50", 0.3, 0.45);
  radial(s, 480, 470, 760, "#ff9a50", 0.3, 0.32);
});
// pink sunset through the slats: stripes on the lower back wall and across the boards
const SHAFT_A = 0.376;
const slatMap = () => mapSprite("slats", (s) => soft(s, WX0, WY0, WW, WH, 8, (q) => {
  for (let k = 0; k < 7; k++) {
    const y0 = 230 + k * 22, x0 = 470, x1 = 860;
    q.fillStyle = K.rgba("#ff9ad8", 0.5 - k * 0.03);
    q.beginPath(); q.moveTo(x0, y0); q.lineTo(x1, y0 + (x1 - x0) * SHAFT_A * 0.55); q.lineTo(x1, y0 + (x1 - x0) * SHAFT_A * 0.55 + 9); q.lineTo(x0, y0 + 8); q.closePath(); q.fill();
  }
  for (let k = 0; k < 6; k++) {
    const fx = 300 + k * 44, fy = 428 + k * 9;
    q.fillStyle = K.rgba("#ff9ad8", 0.55);
    q.beginPath(); q.moveTo(fx, fy); q.lineTo(fx + 130, fy + 46); q.lineTo(fx + 146, fy + 46); q.lineTo(fx + 16, fy); q.closePath(); q.fill();
  }
}));
const goldMap = () => mapSprite("gold", (s) => {
  radial(s, 480, 220, 720, "#ffc070", 0.85);
  radial(s, 480, 410, 560, "#ffb860", 0.7, 0.35);
});
const doorMap = () => mapSprite("door", (s) => {
  const c = P3(RX - 60, -10, (DR.Z0 + DR.Z1) / 2);
  radial(s, c[0], c[1], 380, "#ffe7a8", 0.8);
  soft(s, WX0, WY0, WW, WH, 8, (q) => {
    // the light through the opening lands on the floor as a long wedge that widens toward the camera
    q.fillStyle = "rgba(255,231,168,0.85)";
    q.fill(quadPath(doorWedge()));
  });
});
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
function lightMap(t, o) {
  const MW = WW * LMS, MH = WH * LMS;
  const L = K.layer(MW, MH, "f16:lm");
  const s = L.g;
  s.fillStyle = o.ambient || "#241a1c";
  s.fillRect(0, 0, MW, MH);
  s.globalCompositeOperation = "lighter";
  const add = (spr, a) => {
    if (a <= 0.003) return;
    s.globalAlpha = Math.min(1, a); s.drawImage(spr, 0, 0, MW, MH);
    if (a > 1) { s.globalAlpha = Math.min(1, a - 1); s.drawImage(spr, 0, 0, MW, MH); }
  };
  add(candleMap(), (o.candle == null ? 1 : o.candle) * (0.93 + 0.07 * K.noise(t * 4.3, 3) + 0.025 * Math.sin(t * 13)));
  add(slatMap(), (o.slats == null ? 1 : o.slats) * (0.9 + 0.1 * Math.sin(t * 0.5)));
  add(goldMap(), o.gold || 0);
  add(doorMap(), o.door || 0);
  s.globalAlpha = 1;
  // every glowing pawprint lights the paper and plaster around it
  if (o.wallLit) {
    s.save(); s.scale(LMS, LMS); s.translate(-WX0, -WY0);
    for (const P of POSTERS) {
      const lv = printLevel(P, t, o);
      if (lv < 0.08) continue;
      const [px, py] = printPos(P);
      K.glow(s, px, py, P.w * 1.4, "#ffa040", Math.min(1, 0.6 * lv * o.wallLit));
    }
    s.restore();
  }
  s.globalCompositeOperation = "source-over";
  return L;
}

// ---- emissive parts of the shop ------------------------------------------------------------------------
const WR = { x: WX0, y: 40, w: WALL.x0 - WX0 + 10, h: 400 };
function windowSprite() {
  return spr("f16:win", WR.w * 2, WR.h * 2, (s) => {
    s.scale(2, 2); s.translate(-WR.x, -WR.y);
    const q = winQuad();
    s.save();
    s.clip(quadPath(q));
    // the low sunset beyond: near-white at the sun's height (the lens blooms it), pink above, amber below
    const sg = s.createLinearGradient(0, q[0][1], 0, q[3][1]);
    sg.addColorStop(0, "#ff9ccc"); sg.addColorStop(0.5, "#ffd8ea"); sg.addColorStop(0.72, "#fffaf4"); sg.addColorStop(1, "#ffa880");
    s.fillStyle = sg; s.fillRect(WR.x, WR.y, WR.w, WR.h);
    // slats of an old wooden shutter, each lower lip catching the light
    const n = 11;
    for (let k = 0; k < n; k++) {
      const fa = K.lerp(WIN.f0, WIN.f1, k / n), fb = fa + ((WIN.f1 - WIN.f0) / n) * 0.64;
      const sl = [[WIN.x0 - 2, onL(WIN.x0 - 2, fa)], [WIN.x1 + 2, onL(WIN.x1 + 2, fa)], [WIN.x1 + 2, onL(WIN.x1 + 2, fb)], [WIN.x0 - 2, onL(WIN.x0 - 2, fb)]];
      K.texFill(s, "wood", quadPath(sl), { tex: { color: "#2a1a12", dark: "#0e0806", planks: 1, seed: 20 + k }, scale: 60, rot: 0.32 });
      const fl = fb - 0.004;
      const lip = [[WIN.x0, onL(WIN.x0, fl)], [WIN.x1, onL(WIN.x1, fl)], [WIN.x1, onL(WIN.x1, fb)], [WIN.x0, onL(WIN.x0, fb)]];
      s.fillStyle = "rgba(255,150,190,0.75)"; s.fill(quadPath(lip));
    }
    s.restore();
  });
}
// light shafts in the dusty air: cached, two variants (clean / broken by drifting dust) cross-fade over time
function shaftSprite(v) {
  return spr("f16:shaft" + v, WW / 2, WH / 2, (s) => {
    s.scale(0.5, 0.5); s.translate(-WX0, -WY0);
    soft(s, WX0, WY0, WW, WH, 3, (s) => {
    const n = 11, dx = Math.cos(Math.atan(SHAFT_A)), dy = Math.sin(Math.atan(SHAFT_A));
    for (let k = 0; k < n - 1; k++) {
      const fm = K.lerp(WIN.f0, WIN.f1, (k + 0.82) / n);
      const x0 = (WIN.x0 + WIN.x1) / 2, y0 = onL(x0, fm);
      const L = 640 - k * 12 + K.hash(k, 4) * 80, w0 = 5 + K.hash(k, 5) * 3, w1 = w0 * 3.2;
      const gr = s.createLinearGradient(x0, y0, x0 + dx * L, y0 + dy * L);
      gr.addColorStop(0, "rgba(255,170,215,0.5)"); gr.addColorStop(0.2, "rgba(255,160,210,0.3)"); gr.addColorStop(0.6, "rgba(255,150,205,0.1)"); gr.addColorStop(1, "rgba(255,150,205,0)");
      s.fillStyle = gr;
      s.beginPath();
      s.moveTo(x0 - dy * w0 * 0.5, y0 + dx * w0 * 0.5); s.lineTo(x0 + dx * L - dy * w1 * 0.5, y0 + dy * L + dx * w1 * 0.5);
      s.lineTo(x0 + dx * L + dy * w1 * 0.5, y0 + dy * L - dx * w1 * 0.5); s.lineTo(x0 + dy * w0 * 0.5, y0 - dx * w0 * 0.5); s.closePath();
      s.fill();
    }
    });
    s.globalCompositeOperation = "destination-out";
    s.globalAlpha = v ? 0.7 : 0.35;
    s.fillStyle = finePattern(s, "cloud", { seed: 21 + v, cover: 0.5 }, 2.6);
    s.fillRect(WX0, WY0, WW, WH);
  });
}
function shafts(g, W, H, t, a) {
  if (a <= 0.01) return;
  const w = 0.5 + 0.5 * Math.sin(t * 0.35);
  g.save();
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = a * (0.55 + 0.2 * (1 - w)); g.drawImage(shaftSprite(0), WX0, WY0, WW, WH);
  g.globalAlpha = a * 0.6 * w; g.drawImage(shaftSprite(1), WX0, WY0, WW, WH);
  g.globalAlpha = 1;
  // dust motes that sparkle only while they drift through a beam
  const dx = Math.cos(Math.atan(SHAFT_A)), dy = Math.sin(Math.atan(SHAFT_A));
  for (let i = 0; i < 80; i++) {
    const k = i % 10;
    const x0 = (WIN.x0 + WIN.x1) / 2, y0 = onL(x0, K.lerp(WIN.f0, WIN.f1, (k + 0.82) / 11));
    const u = (K.hash(i, 81) + t * 0.012 * (0.5 + K.hash(i, 82))) % 1;
    const along = 30 + u * 520;
    const off = (K.hash(i, 83) - 0.5) * (5 + along * 0.02) * 2 + Math.sin(t * 0.7 + i) * 2;
    const px = x0 + dx * along - dy * off, py = y0 + dy * along + dx * off;
    const tw = 0.5 + 0.5 * Math.sin(t * (1.5 + K.hash(i, 84) * 2) + i * 2.1);
    g.fillStyle = K.rgba("#ffe6f2", (0.2 + 0.6 * tw * tw) * (1 - u * 0.8) * a);
    g.beginPath(); g.arc(px, py, 0.5 + K.hash(i, 85) * 0.8, 0, TAU); g.fill();
  }
  g.restore();
}
// Shot 7's close-up wall: the posters around the last drawing at 3x, baked ONCE into one region sprite
// (the camera only reaches zoom 4.2), plus the same region with every pawprint fully lit. The wave of
// light is that lit layer seen through a growing soft ring mask - nothing is rebuilt per frame.
const R7 = (() => { const P = POSTERS.find((q) => q.i === 24); return { x: Math.round(P.x + P.w / 2 - 230), y: Math.round(P.y + P.h / 2 - 140), w: 460, h: 280, res: 3 }; })();
const inR7 = (P) => !(P.x > R7.x + R7.w + 10 || P.y > R7.y + R7.h + 10 || P.x + P.w < R7.x - 10 || P.y + P.h < R7.y - 10);
function wallHiSprite() {
  return spr("f16:wallhi", R7.w * R7.res, R7.h * R7.res, (s) => {
    s.scale(R7.res, R7.res); s.translate(-R7.x, -R7.y);
    for (const P of POSTERS) {
      if (!inR7(P)) continue;
      s.save(); s.translate(P.x, P.y); s.rotate(P.rot);
      s.drawImage(posterSprite(P, R7.res), 0, 0, P.w, P.h);
      s.restore();
      fixings(s, P);
    }
  });
}
function litPrintsSprite(glow) {
  return spr("f16:litprints:" + glow, R7.w * 2, R7.h * 2, (s) => {
    s.scale(2, 2); s.translate(-R7.x, -R7.y);
    const pts = [];
    for (const P of POSTERS) {
      if (!inR7(P)) continue;
      const [px, py] = printPos(P);
      pts.push({ x: px, y: py, s: P.w * 0.085, a: P.rot - 0.2, flat: 1, alpha: 1 });
      K.glow(s, px, py, P.w * 0.9, "#ff9a40", 0.18);
    }
    K.pawprints(s, pts, glow);
  });
}
function waveOverlay(g, o) {
  const L = K.layer(R7.w * 2, R7.h * 2, "f16:wave");
  const lg = L.g;
  lg.scale(2, 2);
  lg.drawImage(litPrintsSprite(o.printGlow == null ? 0.7 : o.printGlow), 0, 0, R7.w, R7.h);
  lg.globalCompositeOperation = "destination-in";
  const cx = o.wave0[0] - R7.x, cy = o.wave0[1] - R7.y, r = Math.max(2, o.waveR);
  const gr = lg.createRadialGradient(cx, cy, 0, cx, cy, r);
  gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(K.clamp((r - 50) / r), "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  lg.fillStyle = gr; lg.fillRect(0, 0, R7.w, R7.h);
  g.drawImage(L.canvas, R7.x, R7.y, R7.w, R7.h);
}
function prints(g, t, o) {
  const pts = [];
  const overlay = o.waveR != null && o.waveR < 1500 && o.hiWall;
  for (const P of POSTERS) {
    const lv = printLevel(P, t, overlay ? Object.assign({}, o, { waveR: null }) : o);
    const [px, py] = printPos(P);
    pts.push({ x: px, y: py, s: P.w * 0.085, a: P.rot - 0.2, flat: 1, alpha: K.clamp(lv) });
  }
  K.pawprints(g, pts, o.printGlow == null ? 0.7 : o.printGlow);
  if (overlay) waveOverlay(g, o);
}
function doorLight(g, t, open) {
  doorOpen(g, t, open);
}
function viewBox(g) {
  try {
    const inv = g.getTransform().inverse(), cw = g.canvas.width, ch = g.canvas.height;
    const a = new DOMPoint(0, 0).matrixTransform(inv), b = new DOMPoint(cw, ch).matrixTransform(inv);
    return [Math.min(a.x, b.x) - 60, Math.min(a.y, b.y) - 60, Math.max(a.x, b.x) + 20, Math.max(a.y, b.y) + 20];
  } catch (e) { return null; }
}
const visible = (P, vb) => !vb || !(P.x > vb[2] || P.y > vb[3] || P.x + P.w < vb[0] || P.y + P.h < vb[1]);
function iconFlash(g, a, vb) {
  g.save();
  g.globalCompositeOperation = "lighter";
  for (const P of POSTERS) {
    if (!visible(P, vb)) continue;
    g.save(); g.translate(P.x, P.y); g.rotate(P.rot);
    const ic = new Path2D();
    icon(ic, (P.i - 9 + 120) % 12, P.w * 0.4, P.h * 0.8, P.w * 0.13);
    g.strokeStyle = K.rgba("#ffcf80", 0.5 * a * (0.5 + P.lit * 0.5));
    g.lineWidth = P.w / 60; g.lineCap = "round"; g.lineJoin = "round";
    g.stroke(ic);
    K.glow(g, P.w * 0.4, P.h * 0.8, P.w * 0.32, "#ffb050", 0.35 * a);
    g.restore();
  }
  g.restore();
}

// shop(g, W, H, t, cam, o): the one set, lit. o = { ambient, candle, slats, gold, door, wallLit, boost, waveR, wave0,
//   res (hi-res posters for close-ups), iconFlash, bright, mid(g) drawn between candle bands, midBand, after(g) }
function shop(g, W, H, t, cam, o) {
  K.withCamera(g, W, H, cam, () => {
    g.drawImage(setPlate(), WX0, WY0, WW, WH);
    const vb = viewBox(g);
    if (o.hiWall) g.drawImage(wallHiSprite(), R7.x, R7.y, R7.w, R7.h);
    else if (o.res) for (const P of POSTERS) {
      if (!visible(P, vb)) continue;
      g.save(); g.translate(P.x, P.y); g.rotate(P.rot);
      g.drawImage(posterSprite(P, o.res), 0, 0, P.w, P.h);
      g.restore();
      fixings(g, P);
    }
    // light the plate: multiply by the light map, then a little of it again as scatter in the dusty air
    const lm = lightMap(t, o);
    g.save();
    g.globalCompositeOperation = "multiply";
    g.drawImage(lm.canvas, WX0, WY0, WW, WH);
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = o.scatter == null ? 0.08 : o.scatter;
    g.drawImage(lm.canvas, WX0, WY0, WW, WH);
    g.restore();
    if (o.wall) o.wall(g);
    g.drawImage(windowSprite(), WR.x, WR.y, WR.w, WR.h);
    if (o.iconFlash > 0.01) iconFlash(g, o.iconFlash, vb);
    prints(g, t, o);
    doorLight(g, t, o.door || 0);
    const br = o.bright == null ? 1 : o.bright;
    const mb = o.midBand == null ? 0 : o.midBand;
    for (let b = 0; b < 3; b++) {
      candles(g, t, b, br);
      if (b === mb && o.mid) o.mid(g);
    }
    shafts(g, W, H, t, o.slats == null ? 1 : o.slats);
    if (o.after) o.after(g);
  });
}

// ---- Sir Whiskers (the Shadow) ----------------------------------------------------------------------------
// The Shadow is a real, very dark cat: near-black fur (#14100f, never pure black) with its texture intact,
// two separate ears glowing thin orange where the candle light passes through them, eyes that catch the
// flames, and a warm under-light on the chest, chin and legs from the candles on the floor.
const SHADOW2 = { base: "#1c1614", light: "#3c2e28", dark: "#0e0a09", stripe: "#151010", tip: "#120e0d", belly: "#221a17", white: "#2a211d", pattern: "solid", bib: false, socks: false, muzzle: false, iris: "#8a96a8", irisInner: "#d4e2ff", nose: "#1e1618", noseEdge: "#0c0808", innerEar: "#6a3a26", bentEar: false, sheen: 1.3 };
const OLD = { base: "#cc8c52", light: "#eec08a", dark: "#975a2e", stripe: "#743812", tip: "#6a3010", belly: "#f0e2ca", white: "#ece2d2", bib: true, socks: "all", muzzle: true, stripeAlpha: 0.6, iris: "#c8a84a", irisInner: "#f0d27a", bentEar: false };
// lights for the Shadow, relative to his feet: the candles are on the floor in front of and below him
function shadowLook(size, near) {
  return {
    key: { x: -size * 0.9, y: size * 0.55, color: "#ffa050", strength: 0.45 + 0.55 * near },
    rim: { x: size * 0.3, y: size * 1.4, color: "#ff9a50", strength: 0.7 + 0.6 * near },
    fill: "#080605", ambient: "#14100f", ambientK: 0.3, backlit: 0.95, eyesGlow: 0.18, pupil: 1,
  };
}
const rel = (L, x, y) => (L ? Object.assign({}, L, { x: L.x + x, y: L.y + y }) : L);
// warm light from the floor up, painted only onto the cat already in s (source-atop)
function underLight(s, x, y, size, k, color = "#ff9a50") {
  s.save();
  s.globalCompositeOperation = "source-atop";
  const gr = s.createLinearGradient(0, y, 0, y - size * 1.5);
  gr.addColorStop(0, K.rgba(color, 0.42 * k)); gr.addColorStop(0.35, K.rgba(color, 0.14 * k)); gr.addColorStop(1, K.rgba(color, 0));
  s.fillStyle = gr; s.fillRect(x - size * 2.5, y - size * 2.2, size * 5, size * 2.4);
  s.restore();
}
// one cat painted once into a cached sprite. o holds drawCat options with lights RELATIVE to the feet.
function catSprite(key, size, o, SC = 2, post) {
  const SW = size * 3.8, SH = size * 2.8, ox = SW / 2, oy = SH * 0.86;
  const img = spr("f16:cs:" + key + ":" + size + ":" + SC, SW * SC, SH * SC, (s) => {
    s.scale(SC, SC);
    const oo = Object.assign({}, o, { key: rel(o.key, ox, oy), rim: rel(o.rim, ox, oy), light: rel(o.light, ox, oy) });
    K.drawCat(s, ox, oy, size, oo);
    if (post) post(s, ox, oy);
  });
  return { img, SW, SH, ox, oy };
}
function drawSpr(g, sp, x, y, alpha = 1, breath = 0) {
  if (alpha <= 0.002) return;
  g.save();
  g.globalAlpha *= alpha;
  g.translate(x, y); g.scale(1, 1 + breath); g.translate(-x, -y);
  g.drawImage(sp.img, x - sp.ox, y - sp.oy, sp.SW, sp.SH);
  g.restore();
}
// a cached sprite drawn at another size (cats walking toward or away from us share one set of gait steps)
function drawSprAt(g, sp, x, y, k, alpha = 1) {
  if (alpha <= 0.002) return;
  g.save();
  g.globalAlpha *= alpha;
  g.translate(x, y); g.scale(k, k);
  g.drawImage(sp.img, -sp.ox, -sp.oy, sp.SW, sp.SH);
  g.restore();
}
// walking cats as 16 cached gait steps (a big layered cat painted live every frame is too costly)
const GAIT = 16;
const gaitQ = (phase) => Math.floor((((phase % 1) + 1) % 1) * GAIT);
function shadowWalkSprite(q) {
  const ph = q / GAIT;
  return catSprite("shw:" + q, 64, Object.assign({ pose: "walk", phase: ph, t: ph * 2.3, facing: -1, headTurn: 0.3, headTilt: -0.04 * Math.sin(ph * TAU * 2), coat: SHADOW2, collar: false, bell: false, shadow: false, tail: 0.6, blink: 0.15, autoBlink: false }, shadowLook(64, 0.6)), 2.2,
    (s, ox, oy) => underLight(s, ox, oy, 64, 0.64));
}
function sirWalkSprite(q) {
  const ph = q / GAIT;
  const Lt = sirLight(0, 0, 66, 1, "door");
  return catSprite("sirwalk:" + q, 66, Object.assign({ pose: "walk", phase: ph, t: ph * 2.3, facing: 1, headTurn: 0.1, tail: 0.6, collar: false, bell: false, blink: 0.4, coat: OLD, shadow: false, pupil: 0.7, autoBlink: false }, Lt), 2,
    (s, ox, oy) => ruff(s, ox, oy, 66, 1, "walk", 0, 0.1));
}
// The Shadow standing still (cached), at a given nearness to the candles (quantised)
function shadowStill(size, near, turn) {
  const nq = Math.round(near * 4) / 4;
  return catSprite("shst:" + nq + ":" + turn, size, Object.assign({ pose: "stand", facing: -1, headTurn: turn, t: 0, coat: SHADOW2, collar: false, bell: false, shadow: false, tail: 0.6, blink: 0.15, autoBlink: false }, shadowLook(size, nq)), 2.2,
    (s, ox, oy) => underLight(s, ox, oy, size, 0.4 + 0.4 * nq));
}
// Sir Whiskers revealed, standing (cached per head step): warm key from the candles below-front, a cool
// gold rim from behind, his long ruff, and the slow bow
function sirStill(size, turn, tilt) {
  return catSprite("sir:" + turn + ":" + tilt, size, { pose: "stand", facing: -1, headTurn: turn, headTilt: tilt, t: 0, coat: OLD, collar: false, bell: false, shadow: false, tail: 0.6, blink: 0.45, autoBlink: false, pupil: 0.7,
    key: { x: -size * 1.1, y: size * 0.5, color: "#ffb060", strength: 1.2 }, rim: { x: size * 1.3, y: -size * 2.2, color: "#ffe7a8", strength: 1.6 }, fill: "#2a1408", ambient: "#3a2e44", ambientK: 0.14, backlit: 0.6 }, 2.2,
  (s, ox, oy) => { ruff(s, ox, oy, size, -1, "stand", tilt, turn); underLight(s, ox, oy, size, 0.7, "#ffb060"); });
}
// blurred silhouettes (cached per gait step) for the shadow he throws on the wall and the drive flashback
function shadowSprites(size, pose, q, f, steps) {
  const SW = size * 3.6, SH = size * 2.6, ox = SW / 2, oy = SH * 0.9;
  const key = "f16:shd2:" + pose + ":" + q + ":" + f + ":" + size;
  const sil = spr(key, SW, SH, (s) => {
    K.drawCat(s, ox, oy, size, { pose, phase: q / steps, t: (q / steps) * 2.3, facing: f, coat: SHADOW2, collar: false, bell: false, shadow: false, tail: 0.6, headTurn: 0.35, blink: 0.3, autoBlink: false, flat: true });
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = "source-in";
    s.fillStyle = "#0a0706";
    s.fillRect(0, 0, s.canvas.width, s.canvas.height);
  });
  const smoke = spr(key + ":smk", SW * 0.5, SH * 0.5, (s) => soft(s, 0, 0, SW * 0.5, SH * 0.5, 3, (q2) => q2.drawImage(sil, 0, 0, SW * 0.5, SH * 0.5)));
  return { sil, smoke, SW, SH, ox, oy };
}
// the drive flashback's Shadow: a dark furred cat walking (cached gait steps), moonlit from the right
function shadowCat(g, x, y, size, o) {
  const steps = 8;
  const q = Math.floor(((((o.phase || 0) % 1) + 1) % 1) * steps);
  const f = o.facing || 1;
  const sp = catSprite("shdrive:" + q + ":" + f, size, { pose: "walk", phase: q / steps, t: (q / steps) * 2.3, facing: f, headTurn: 0.2, coat: SHADOW2, collar: false, bell: false, shadow: false, tail: 0.6, blink: 0.2, autoBlink: false, eyesGlow: 0.35, pupil: 1,
    key: { x: 300, y: -340, color: "#aab8ff", strength: 0.7 }, rim: { x: 200, y: -260, color: "#bcd6ff", strength: 1.6 }, fill: "#06070c", ambient: "#1a1e30", ambientK: 0.3, backlit: 0.5 }, 1.6);
  drawSpr(g, sp, x, y, o.alpha == null ? 1 : o.alpha);
}
// the big soft shadow the candles below throw up the wall behind him: it grows and climbs as he nears them
function wallShadow(g, x, size, k, alpha, pose, q) {
  const sp = shadowSprites(64, pose, q, -1, 8);
  const sc = (size / 64) * k;
  const bx = x + (x - 480) * (k - 1) * 0.45, by = WALL.y1 + 4;
  g.save();
  g.globalAlpha *= alpha;
  g.globalCompositeOperation = "multiply";
  g.drawImage(sp.smoke, bx - sp.ox * sc, by - sp.oy * sc, sp.SW * sc, sp.SH * sc);
  g.restore();
}
// paw contact: a soft occlusion pool under the body and a dark touch under each paw (stand pose, facing -1)
function pawContact(g, x, y, size, a = 1) {
  K.shadowBlob(g, x - size * 0.05, y + 0.6, size * 0.75, size * 0.07, { alpha: 0.5 * a });
  for (const dx of [-0.62, -0.42, 0.42, 0.6]) K.shadowBlob(g, x + dx * size, y + 0.4, size * 0.1, size * 0.028, { alpha: 0.75 * a, soft: 0.5 });
}
function sirLight(x, y, size, f, look) {
  if (look === "door") return { key: { x: x - 260, y: y + 40, color: "#ffb060", strength: 0.75 }, rim: { x: x + f * size * 3, y: y - size * 1.2, color: "#fff0c8", strength: 2.0 }, fill: "#2a1408", ambient: "#4a3020", ambientK: 0.18, backlit: 0.9 };
  return { key: { x: x + 60, y: y + 26, color: "#ffb060", strength: 1.25 }, rim: { x: x - f * size * 0.9, y: y - size * 2.6, color: "#bcd6ff", strength: 1.6 }, fill: "#2a1408", ambient: "#3a2e44", ambientK: 0.14, backlit: 0.55 };
}
// Sir Whiskers walking (shot 8): live while he moves, cached once he sits by the door
function whiskers(g, W, H, x, y, size, t, o) {
  const f = o.facing || -1;
  const al = o.alpha == null ? 1 : o.alpha;
  const look = o.look || "candle";
  const base = { pose: o.pose || "stand", phase: o.phase || 0, facing: f, headTurn: o.headTurn == null ? 0.2 : o.headTurn, headTilt: o.headTilt || 0, tail: 0.6, collar: false, bell: false, blink: o.blink == null ? 0.4 : o.blink, coat: OLD, shadow: false, pupil: 0.7, autoBlink: false };
  K.glow(g, x + f * size * 0.3, y - size * 1.0, size * 2.2, "#ffe7a8", 0.14 * al);
  const Lt = sirLight(x, y, size, f, look);
  if (o.still) {
    const sp = catSprite("sirdoor:" + base.pose + ":" + base.headTurn.toFixed(2), size, Object.assign({}, base, { t: o.still }, Lt, { key: rel(Lt.key, -x, -y), rim: rel(Lt.rim, -x, -y) }), 2.2,
      (s, ox, oy) => ruff(s, ox, oy, size, f, base.pose, base.headTilt, base.headTurn));
    drawSpr(g, sp, x, y, 0.84 * al, 0.006 * Math.sin(t * 1.7));
    return;
  }
  drawSprAt(g, sirWalkSprite(gaitQ(base.phase)), x, y, size / 66, 0.84 * al);
}
// the long white ruff of a very old cat: a deep mass of fine strands from the chin down over the chest,
// bright at the tips, with loose strands breaking the edge
function ruff(g, x, y, S, f, pose, tilt, turn = 0.2) {
  const sit = pose === "sit";
  const hx = x + f * S * (sit ? 0.26 : 0.84 - 0.18 * turn), hy = y - S * (sit ? 1.5 : 1.32) - (tilt || 0) * S * 0.08;
  const cx = hx - f * S * 0.1, cy = hy + S * 0.36;
  const R = K.rng("ruff3");
  g.save();
  const mg = g.createRadialGradient(cx, cy, 0, cx, cy, S * 0.42);
  mg.addColorStop(0, "rgba(236,226,208,0.85)"); mg.addColorStop(0.55, "rgba(214,198,174,0.55)"); mg.addColorStop(1, "rgba(190,172,146,0)");
  g.fillStyle = mg; g.beginPath(); g.ellipse(cx, cy, S * 0.3, S * 0.46, f * 0.15, 0, TAU); g.fill();
  g.lineCap = "round";
  const passes = [["rgba(110,90,70,0.32)", 0.012, 140], ["rgba(230,218,198,0.45)", 0.008, 260], ["rgba(255,248,236,0.55)", 0.005, 140]];
  for (const [col, lw, n] of passes) {
    g.strokeStyle = col; g.lineWidth = Math.max(0.3, S * lw); g.beginPath();
    for (let i = 0; i < n; i++) {
      const u = R(), v = R();
      const a = Math.PI * (0.08 + u * 0.84);
      const r0 = S * 0.22 * Math.sqrt(v);
      const sx = cx + Math.cos(a) * r0 * 1.2 - f * S * 0.04, sy = cy - S * 0.24 + Math.sin(a) * r0 * 0.9;
      const len = S * (0.16 + R() * 0.36) * (1 - Math.abs(u - 0.5) * 0.9);
      const bend = (u - 0.5) * S * 0.18;
      g.moveTo(sx, sy); g.quadraticCurveTo(sx + bend * 0.5, sy + len * 0.55, sx + bend - f * S * 0.03, sy + len);
    }
    g.stroke();
  }
  // loose strands lifting off the edge
  g.strokeStyle = "rgba(255,246,228,0.5)"; g.lineWidth = Math.max(0.25, S * 0.003); g.beginPath();
  for (let i = 0; i < 40; i++) {
    const a = Math.PI * (0.05 + R() * 0.9), r = S * (0.26 + R() * 0.14);
    const sx = cx + Math.cos(a) * r * 1.1, sy = cy - S * 0.1 + Math.sin(a) * r;
    g.moveTo(sx, sy); g.quadraticCurveTo(sx + (R() - 0.5) * S * 0.06, sy + S * 0.05, sx + (R() - 0.5) * S * 0.1, sy + S * (0.06 + R() * 0.08));
  }
  g.stroke();
  g.restore();
}

// ---- flashback set pieces (shot 5) ------------------------------------------------------------------------
// They are memories: a shallow focus (the backgrounds are pre-blurred copies), mist, light leaks on the
// film, and only the cats on their patch of ground are sharp.
const MOON = { x: 760, y: 110, color: "#c8d0ff", strength: 1.3 };
function driveBg() {
  return spr("f16:drive2", 960, 540, (s) => {
    K.sky(s, 960, 540, { night: true, top: "#080a18", mid: "#1a1a34", bottom: "#4a4062", horizon: 0.64 });
    K.stars(s, 960, 540, 7, 0.5, 0, { yMax: 250 });
    // the moon in a hazy sky: a wide halo and a tight corona, mist banks drifting across it
    K.glow(s, MOON.x, MOON.y, 260, "#8a96c8", 0.22);
    K.glow(s, MOON.x, MOON.y, 120, "#b4bee8", 0.25);
    K.moon(s, MOON.x, MOON.y, 24, { glow: 1.1, halo: "#a8b4e0" });
    for (let k = 0; k < 3; k++) K.fog(s, 960, 540, { y: 80 + k * 46, h: 40, color: "#6a6a98", alpha: 0.12, t: k * 7 });
    K.hills(s, 960, 540, { y: 324, amp: 24, color: "#2a2742", seed: 5, haze: "#4a4062", hazeAmt: 0.6 });
    K.hills(s, 960, 540, { y: 352, amp: 14, color: "#15131f", seed: 9, haze: "#4a4062", hazeAmt: 0.3, sun: { x: MOON.x, y: MOON.y }, rim: "#6a70a0" });
    K.groundPlane(s, 960, 540, { tex: "asphalt", horizon: 362, y0: 370, wet: 0.8, sky: "#3a3658", puddles: 0.4, fog: "#3a3456", fogAmt: 0.75, scale: 300, cache: false });
    K.reflectStreak(s, MOON.x, 384, 150, "#c8d0ff", 0.45);
    // iron gates between granite pillars, moonlit from the right
    for (const px of [92, 432]) {
      K.shadowBlob(s, px + 17, 384, 34, 5, { alpha: 0.6 });
      K.texRect(s, "granite", px, 168, 34, 216, { tex: { seed: 4, color: "#7a7888" }, scale: 70, tint: "#3a3850", tintAlpha: 0.7 });
      const sh = s.createLinearGradient(px, 0, px + 34, 0);
      sh.addColorStop(0, "rgba(0,0,6,0.65)"); sh.addColorStop(0.7, "rgba(0,0,6,0.2)"); sh.addColorStop(1, "rgba(190,200,255,0.22)");
      s.fillStyle = sh; s.fillRect(px, 168, 34, 216);
      K.texRect(s, "granite", px - 5, 156, 44, 13, { tex: { seed: 5, color: "#6a6878" }, scale: 60, tint: "#2a2840", tintAlpha: 0.7 });
      s.fillStyle = "rgba(190,200,255,0.4)"; s.fillRect(px - 5, 156, 44, 1.4);
      s.fillStyle = "rgba(0,0,0,0.5)"; s.fillRect(px, 169, 34, 3);
    }
    for (let k = 0; k < 13; k++) {
      const x = 134 + k * 23;
      const top = 202 - Math.sin((k / 12) * Math.PI) * 40;
      s.fillStyle = "#0c0b14"; s.fillRect(x - 1.7, top, 3.4, 384 - top);
      s.fillStyle = "rgba(160,170,225,0.45)"; s.fillRect(x + 1, top, 0.8, 384 - top);
      s.fillStyle = "#0c0b14"; s.beginPath(); s.moveTo(x - 4, top + 5); s.lineTo(x, top - 8); s.lineTo(x + 4, top + 5); s.closePath(); s.fill();
    }
    for (const ry of [252, 360]) { s.fillStyle = "#0c0b14"; s.fillRect(126, ry, 306, 4); s.fillStyle = "rgba(160,170,225,0.35)"; s.fillRect(126, ry, 306, 1); }
    // ground mist in layers, thicker low down
    K.fog(s, 960, 540, { y: 340, h: 70, color: "#5a5280", alpha: 0.3, t: 0 });
    K.fog(s, 960, 540, { y: 362, h: 120, color: "#5a5280", alpha: 0.42, t: 0 });
  });
}
// the background out of focus (resampled soft), and the band of wet ground the cats walk on kept sharp
const driveBlur = () => spr("f16:drive2b", 960, 540, (s) => soft(s, 0, 0, 960, 540, 4.5, (q) => q.drawImage(driveBg(), 0, 0, 960, 540)));
const driveSharp = () => spr("f16:drive2s", 960, 540, (s) => {
  s.drawImage(driveBg(), 0, 0, 960, 540);
  s.globalCompositeOperation = "destination-in";
  const m = s.createLinearGradient(0, 380, 0, 470);
  m.addColorStop(0, "rgba(0,0,0,0)"); m.addColorStop(0.55, "rgba(0,0,0,1)"); m.addColorStop(1, "rgba(0,0,0,1)");
  s.fillStyle = m; s.fillRect(0, 0, 960, 540);
});
// warm light leaking onto the film at the frame edge (a memory), drifting slowly
function lightLeaks(g, W, H, t, seed, a = 1) {
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let k = 0; k < 2; k++) {
    const side = (K.hash(seed, k) > 0.5) === (k === 0);
    const x = side ? -40 + 30 * Math.sin(t * 0.7 + k) : W + 40 - 30 * Math.sin(t * 0.6 + k), y = H * (0.25 + 0.5 * K.hash(seed, k + 4)) + 40 * Math.sin(t * 0.4 + k * 2);
    const r = 260 + 80 * K.hash(seed, k + 8);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, K.rgba(k ? "#ff8a3a" : "#ff5a2a", 0.32 * a)); gr.addColorStop(0.4, K.rgba("#ff7a30", 0.12 * a)); gr.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.restore();
}
function driveScene(g, W, H, t) {
  g.drawImage(driveBlur(), 0, 0, W, H);
  g.drawImage(driveSharp(), 0, 0, W, H);
  const p = K.seg(t, 48.5, 51);
  const bx = K.lerp(560, 650, p);
  const trail = K.pawTrail(bx - 300, 432, bx - 30, 432, 10, 6 + p * 6, { start: 0, every: 0.5, life: 7, s0: 6, s1: 6 });
  K.pawprints(g, trail, 1);
  for (const q of trail) if ((q.alpha || 0) > 0.2) K.reflectStreak(g, q.x, q.y + 2, 26, "#ffb347", 0.25 * q.alpha, { t });
  // the Shadow walks BEHIND him: a dark furred cat, moonlit at the edges, its reflection in the wet road
  const sx = bx - 230;
  K.shadowBlob(g, sx, 441, 50, 5, { alpha: 0.55 });
  K.shadowBlob(g, sx - 26, 441, 9, 2, { alpha: 0.7, soft: 0.5 }); K.shadowBlob(g, sx + 28, 441, 9, 2, { alpha: 0.7, soft: 0.5 });
  shadowCat(g, sx, 440, 74, { phase: t * 0.9, facing: 1 });
  K.shadowBlob(g, bx + 4, 441, 32, 4, { alpha: 0.6 });
  K.shadowBlob(g, bx - 18, 441, 7, 1.6, { alpha: 0.7, soft: 0.5 }); K.shadowBlob(g, bx + 22, 441, 7, 1.6, { alpha: 0.7, soft: 0.5 });
  cachedCat(g, bx, 440, 58, { pose: "walk", phase: t * 1.1 + 0.3, facing: 1, bell: false, tailUp: 0.7, key: { x: bx + 220, y: 140, color: "#aab8ff", strength: 0.9 }, rim: { x: bx + 160, y: 110, color: "#d8e0ff", strength: 1.5 }, fill: "#121a2c", ambient: "#3a4a78", ambientK: 0.32, pupil: 1 }, "dbiscuit2");
  K.fog(g, W, H, { y: 448, h: 70, color: "#6a6090", alpha: 0.2, t: t + 3 });
  lightLeaks(g, W, H, t, 3, 0.8);
}
function cctvBg() {
  return spr("f16:cctv", 960, 540, (s) => {
    s.fillStyle = "#1e1e1c"; s.fillRect(0, 0, 960, 540);
    const lw = quadPath([[0, 0], [190, 0], [-10, 540], [0, 540]]);
    s.fillStyle = "#2a2c2c"; s.fill(lw);
    // floor: polished stone tiles in perspective (camera high in a corner, looking down the mall)
    const floor = quadPath([[180, 0], [780, 0], [980, 540], [-20, 540]]);
    K.texFill(s, "granite", floor, { tex: { seed: 6, color: "#8a8780" }, scale: 220, tint: "#77746c", tintAlpha: 0.5 });
    s.save();
    s.clip(floor);
    s.strokeStyle = "rgba(20,20,18,0.28)"; s.lineWidth = 1;
    s.beginPath();
    for (let k = 0; k <= 6; k++) { const u = k / 6; s.moveTo(K.lerp(180, 780, u), 0); s.lineTo(K.lerp(-20, 980, u), 540); }
    for (let k = 1; k <= 5; k++) { const y = 540 * Math.pow(k / 5, 1.25); s.moveTo(-20, y); s.lineTo(980, y); }
    s.stroke();
    for (const [ly, r] of [[30, 90], [170, 120], [360, 160]]) K.lightPool(s, 470 + ly * 0.05, ly, r, "#ffffff", { intensity: 0.28, flat: 0.45 });
    const eg = s.createLinearGradient(0, 0, 960, 0);
    eg.addColorStop(0, "rgba(0,0,0,0.5)"); eg.addColorStop(0.3, "rgba(0,0,0,0)"); eg.addColorStop(0.7, "rgba(0,0,0,0)"); eg.addColorStop(1, "rgba(0,0,0,0.5)");
    s.fillStyle = eg; s.fillRect(0, 0, 960, 540);
    s.restore();
    K.shadowBlob(s, 150, 400, 54, 30, { alpha: 0.6 });
    s.fillStyle = "#3a3a36"; s.beginPath(); s.ellipse(140, 384, 44, 26, 0, 0, Math.PI * 2); s.fill();
    K.texFill(s, "foliage", (() => { const p = new Path2D(); p.ellipse(140, 380, 38, 22, 0, 0, Math.PI * 2); return p; })(), { tex: { seed: 3 }, scale: 60 });
    const rwp = quadPath([[780, 0], [960, 0], [960, 540], [980, 540]]);
    s.fillStyle = "#1a1c1c"; s.fill(rwp);
  });
}
function cctvScene(g, W, H, t) {
  // recorded through a cheap low-resolution camera: render at half size, then scale up soft
  const L = K.layer(480, 270, "f16:cctvlo2");
  const s = L.g;
  s.scale(0.5, 0.5);
  s.drawImage(cctvBg(), 0, 0, 960, 540);
  const p = K.seg(t, 51, 53.5);
  const lead = K.lerp(250, 640, p);
  const path = (x) => [x, 200 + (x - 250) * 0.42];
  const kits = [K.COATS.grey, K.COATS.calico, K.COATS.black];
  const top = { x: 480, y: -200, color: "#ffffff", strength: 1 };
  for (let k = 2; k >= 0; k--) {
    const [x, y] = path(lead - 78 - k * 60);
    K.shadowBlob(s, x + 2, y + 1, 18, 4.5, { alpha: 0.6 });
    cachedCat(s, x, y, 30, { pose: "walk", phase: t * 1.6 + k * 0.3, facing: 1, coat: kits[k], collar: false, key: top, lod: 1 }, "cctv2" + k);
  }
  const [bx, by] = path(lead);
  K.shadowBlob(s, bx + 3, by + 1, 30, 6, { alpha: 0.6 });
  cachedCat(s, bx, by, 50, { pose: "walk", phase: t * 1.1, facing: 1, bell: false, tailUp: 0.8, key: top }, "cctvb3");
  g.save();
  g.imageSmoothingEnabled = true;
  g.drawImage(L.canvas, 0, 0, W, H);
  g.restore();
}
function cctvPost(g, W, H, t) {
  g.save();
  g.globalCompositeOperation = "saturation";
  g.fillStyle = "#808080"; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "multiply";
  g.fillStyle = "#c4ecc8"; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "rgba(0,0,0,0.12)";
  for (let y = (t * 40) % 3; y < H; y += 3) g.fillRect(0, y, W, 1);
  const by = ((t * 0.35) % 1) * H;
  g.fillStyle = "rgba(200,255,210,0.05)";
  g.fillRect(0, by, W, 22);
  g.fillStyle = "rgba(220,255,226,0.85)";
  g.font = "600 18px Consolas, 'Courier New', monospace";
  g.textBaseline = "top";
  g.fillText("CAM 03", 60, 64);
  const s = Math.floor(t * 10) % 600;
  g.fillText(`02:14:${String(Math.floor(s / 10) % 60).padStart(2, "0")}`, 760, 64);
  if (Math.floor(t * 2) % 2 === 0) { g.fillStyle = "rgba(255,90,90,0.9)"; g.beginPath(); g.arc(70, 104, 6, 0, TAU); g.fill(); g.fillStyle = "rgba(220,255,226,0.85)"; g.fillText("REC", 84, 95); }
  g.restore();
}
// the crater: the lava glow is down beyond the ridge on the RIGHT, where the cats are heading; it lights
// the sky, the textured slopes (a hot rim on every crest) and the cats' fur from the right
const CR = { x: 270, y: 110, w: 820, h: 420, res: 2 };
const ridgeY = (x) => (x < 620 ? 400 - ((x + 20) / 640) * 55 : 345 - ((x - 620) / 360) * 22);
const LAVA = { x: 1010, y: 470 };
const ridgeAt = (x, yb, amp, seed) => yb + K.fbm(x * 0.006, seed) * amp - Math.max(0, (x - 760) / 260) * 30;
function craterFar() {
  return spr("f16:crfar", CR.w, CR.h, (s) => {
    s.translate(-CR.x, -CR.y);
    const X0 = CR.x, Y0 = CR.y, X1 = CR.x + CR.w, Y1 = CR.y + CR.h;
    const sg = s.createLinearGradient(X0, 0, X1, 0);
    sg.addColorStop(0, "#0a1228"); sg.addColorStop(0.55, "#1c1226"); sg.addColorStop(1, "#4a1a0c");
    s.fillStyle = sg; s.fillRect(X0, Y0, CR.w, CR.h);
    const vg = s.createLinearGradient(0, Y0, 0, 380);
    vg.addColorStop(0, "rgba(4,6,14,0.75)"); vg.addColorStop(1, "rgba(4,6,14,0)");
    s.fillStyle = vg; s.fillRect(X0, Y0, CR.w, CR.h);
    s.save(); s.translate(X0, Y0); K.stars(s, CR.w, 260, 10, 0.7, 0, { yMax: 220 }); s.restore();
    K.moon(s, 380, 175, 13, { glow: 0.7 });
    // ash and smoke over the glow
    s.save(); s.globalCompositeOperation = "lighter"; s.globalAlpha = 0.14;
    s.fillStyle = finePattern(s, "cloud", { seed: 8, cover: 0.45 }, 2.4);
    s.fillRect(X0, Y0 + 60, CR.w, 300);
    s.restore();
    K.glow(s, LAVA.x, LAVA.y + 40, 620, "#ff5a1a", 0.55);
    K.glow(s, LAVA.x - 30, LAVA.y, 300, "#ffa040", 0.4);
    // far ridges: lava-rock texture, hazier with distance, their right-facing slopes lit by the glow
    const ridge = (yb, amp, seed, col, haze) => {
      const p = new Path2D(); p.moveTo(X0, Y1);
      for (let x = X0; x <= X1; x += 5) p.lineTo(x, ridgeAt(x, yb, amp, seed));
      p.lineTo(X1, Y1); p.closePath();
      s.fillStyle = col; s.fill(p);
      K.texFill(s, "lavarock", p, { tex: { seed: seed + 10 }, scale: 160, alpha: 0.5, mode: "soft-light" });
      s.save(); s.clip(p);
      const lg = s.createLinearGradient(X0, 0, X1, 0);
      lg.addColorStop(0, "rgba(255,110,40,0)"); lg.addColorStop(0.6, "rgba(255,110,40,0.08)"); lg.addColorStop(1, "rgba(255,120,40,0.35)");
      s.globalCompositeOperation = "lighter"; s.fillStyle = lg; s.fillRect(X0, Y0, CR.w, CR.h);
      s.globalCompositeOperation = "source-over";
      s.fillStyle = K.rgba(haze, 0.35); s.fillRect(X0, Y0, CR.w, CR.h);
      s.restore();
      s.strokeStyle = "rgba(255,130,60,0.35)"; s.lineWidth = 1.2; s.beginPath();
      for (let x = X0; x <= X1; x += 5) { const y = ridgeAt(x, yb, amp, seed); x === X0 ? s.moveTo(x, y) : s.lineTo(x, y); }
      s.stroke();
    };
    ridge(312, 60, 3, "#2c1c2c", "#3a2238");
    ridge(336, 40, 7, "#1c1420", "#2a1824");
  });
}
const craterFarBlur = () => spr("f16:crfarb", CR.w, CR.h, (s) => soft(s, 0, 0, CR.w, CR.h, 3.5, (q) => q.drawImage(craterFar(), 0, 0, CR.w, CR.h)));
function craterNear() {
  return spr("f16:crnear", CR.w * CR.res, CR.h * CR.res, (s) => {
    s.scale(CR.res, CR.res); s.translate(-CR.x, -CR.y);
    const X0 = CR.x, Y1 = CR.y + CR.h, X1 = CR.x + CR.w;
    // the crater rim the cats walk along: rough lava rock (fbm relief at two scales), falling into dark
    const rim = new Path2D();
    rim.moveTo(X0, Y1);
    const crest = [];
    for (let x = X0; x <= X1; x += 4) { const y = ridgeY(x) + K.fbm(x * 0.05, 3) * 4 + K.fbm(x * 0.012, 4) * 6; crest.push([x, y]); rim.lineTo(x, y); }
    rim.lineTo(X1, Y1); rim.closePath();
    K.texFill(s, "lavarock", rim, { tex: { seed: 2 }, scale: 150, tint: "#7a5a52", tintAlpha: 0.6 });
    K.texFill(s, "lavarock", rim, { tex: { seed: 5 }, scale: 46, alpha: 0.9, mode: "overlay" });
    K.texFill(s, "lavarock", rim, { tex: { seed: 6 }, scale: 110, alpha: 0.5, mode: "multiply" });
    // loose boulders and scree down the slope, each with a hot edge toward the lava and a shadow behind
    const RB = K.rng("scree");
    s.save(); s.clip(rim);
    for (let i = 0; i < 46; i++) {
      const bx = X0 + RB() * CR.w, by = ridgeY(bx) + 8 + Math.pow(RB(), 1.6) * 150, bw = 3 + RB() * 12 * (0.6 + (by - 330) / 200);
      s.fillStyle = "rgba(6,3,2,0.55)"; s.beginPath(); s.ellipse(bx - bw * 0.5, by + bw * 0.25, bw * 0.9, bw * 0.28, 0, 0, TAU); s.fill();
      const rk = new Path2D(); for (let k = 0; k <= 9; k++) { const a = Math.PI + (k / 9) * Math.PI, r = bw * (0.7 + 0.3 * K.hash(i * 10 + k, 5)); k ? rk.lineTo(bx + Math.cos(a) * r, by + Math.sin(a) * r * 0.75) : rk.moveTo(bx + Math.cos(a) * r, by + Math.sin(a) * r * 0.75); } rk.closePath();
      K.texFill(s, "lavarock", rk, { tex: { seed: 2 }, scale: 40, tint: "#8a6a5e", tintAlpha: 0.6 });
      const hg = s.createLinearGradient(bx - bw, 0, bx + bw, 0);
      hg.addColorStop(0, "rgba(0,0,0,0.45)"); hg.addColorStop(0.6, "rgba(0,0,0,0)"); hg.addColorStop(1, "rgba(255,130,60,0.75)");
      s.fillStyle = hg; s.fill(rk);
    }
    s.restore();
    s.save();
    s.clip(rim);
    const dg = s.createLinearGradient(0, 320, 0, 500);
    dg.addColorStop(0, "rgba(0,0,0,0)"); dg.addColorStop(1, "rgba(0,0,0,0.5)");
    s.fillStyle = dg; s.fillRect(X0, CR.y, CR.w, CR.h);
    // the lava glow from the right rakes across the rock
    s.globalCompositeOperation = "lighter";
    K.glow(s, LAVA.x, LAVA.y - 40, 700, "#ff5a1a", 0.65);
    K.glow(s, LAVA.x - 60, LAVA.y - 80, 320, "#ff9040", 0.4);
    K.texFill(s, "lavarock", rim, { tex: { seed: 5 }, scale: 46, alpha: 0.12 });
    // cool moonlight grazing the rocks from the left
    const mg = s.createLinearGradient(X0, 0, 560, 0);
    mg.addColorStop(0, "rgba(90,110,170,0.14)"); mg.addColorStop(1, "rgba(90,110,170,0)");
    s.fillStyle = mg; s.fillRect(X0, CR.y, CR.w, CR.h);
    s.restore();
    // the crest catches the lava light: a hot rim, strongest nearest the glow
    s.save();
    s.globalCompositeOperation = "lighter";
    soft(s, X0, CR.y, CR.w, CR.h, 1.5, (q) => {
      const rg = q.createLinearGradient(X0, 0, X1, 0);
      rg.addColorStop(0, "rgba(255,120,50,0.05)"); rg.addColorStop(0.6, "rgba(255,120,50,0.28)"); rg.addColorStop(1, "rgba(255,140,60,0.7)");
      q.strokeStyle = rg; q.lineWidth = 1.6; q.lineJoin = "round";
      q.beginPath(); crest.forEach(([x, y], i) => (i ? q.lineTo(x, y + 1) : q.moveTo(x, y + 1))); q.stroke();
    });
    s.restore();
    // the safe nook: a low crevice cut into the rock just under the crest, warm and dry deep inside
    const cy0 = ridgeY(862) + 7;
    const hol = new Path2D();
    hol.moveTo(828, cy0 + 22);
    hol.bezierCurveTo(826, cy0 + 8, 842, cy0 + 1, 860, cy0 + 2);
    hol.bezierCurveTo(880, cy0 + 1, 896, cy0 + 9, 897, cy0 + 23);
    hol.bezierCurveTo(880, cy0 + 26, 846, cy0 + 26, 828, cy0 + 22);
    soft(s, 800, cy0 - 20, 120, 70, 1.5, (q) => { q.fillStyle = "rgba(8,4,2,0.85)"; q.fill(hol); q.strokeStyle = "rgba(255,130,60,0.45)"; q.lineWidth = 1.2; q.beginPath(); q.moveTo(826, cy0 + 9); q.bezierCurveTo(842, cy0 - 1, 880, cy0 - 1, 898, cy0 + 10); q.stroke(); });
    s.save(); s.clip(hol);
    const ng = s.createRadialGradient(866, cy0 + 18, 1, 864, cy0 + 16, 34);
    ng.addColorStop(0, "rgba(255,160,90,0.35)"); ng.addColorStop(0.25, "rgba(140,70,30,0.3)"); ng.addColorStop(0.65, "rgba(60,26,12,0.6)"); ng.addColorStop(1, "rgba(10,5,3,0)");
    s.fillStyle = ng; s.fillRect(820, cy0 - 4, 84, 34);
    s.restore();
    s.save(); s.globalCompositeOperation = "lighter";
    K.lightPool(s, 864, cy0 + 26, 40, "#ffb070", { intensity: 0.12, flat: 0.3 });
    s.restore();
  });
}
function craterScene(g, W, H, t) {
  g.drawImage(craterFarBlur(), CR.x, CR.y, CR.w, CR.h);
  g.drawImage(craterNear(), CR.x, CR.y, CR.w, CR.h);
  const p = K.seg(t, 53.5, 56);
  const lead = K.lerp(470, 760, p);
  const kits = [K.COATS.cream, K.COATS.siamese, K.COATS.grey];
  // every cat: key from the lava glow on the right, cool moon rim from the left, its contact shadow
  // thrown left by the glow, and a warm pool of the glow on the rock under it
  const catOn = (x, size, o, key) => {
    const y = ridgeY(x) + 2;
    K.lightPool(g, x + size * 0.2, y + 1, size * 1.1, "#ff7a30", { intensity: 0.18, flat: 0.25 });
    K.shadowBlob(g, x - size * 0.35, y + 0.6, size * 0.75, size * 0.09, { alpha: 0.7 });
    cachedCat(g, x, y, size, Object.assign({ pose: "walk", facing: 1, collar: false,
      key: { x: x + 340, y: y + 120, color: "#ff8a3a", strength: 1.15 }, rim: { x: x - 260, y: y - 220, color: "#8aa0d8", strength: 0.9 }, fill: "#1a0c10", ambient: "#1a1028", ambientK: 0.3, backlit: 0.5 }, o), key);
  };
  for (let k = 2; k >= 0; k--) catOn(lead - 62 - k * 50, 22, { phase: t * 1.7 + k * 0.4, coat: kits[k] }, "crater4" + k);
  catOn(lead, 40, { phase: t * 1.1, bell: false, headTurn: -0.2 }, "craterb3");
  // embers rising from beyond the ridge on the right
  g.save(); g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 30; i++) {
    const u = (K.hash(i, 61) + t * (0.05 + K.hash(i, 62) * 0.05)) % 1;
    const ex = 700 + K.hash(i, 63) * 380 + Math.sin(t * 1.3 + i) * 8 - u * 60, ey = 470 - u * 280;
    g.fillStyle = K.rgba("#ff9a40", 0.8 * (1 - u) * (0.5 + 0.5 * Math.sin(t * 7 + i * 3)));
    g.fillRect(ex, ey, 1.2, 1.2);
  }
  g.restore();
}

// ---- shot 6: through the window ---------------------------------------------------------------------------
const WN = { x: 470, y: 110, w: 400, h: 300 };
const SUN6 = { x: WN.x + WN.w * 0.3, y: WN.y + WN.h * 0.6 };
const ROOF = WN.y + WN.h * 0.8, TANK = WN.x + WN.w * 0.68;
// the low sunset sky with long, lit stratus streaks (no circles): cloud texture stretched flat
function citySky() {
  return spr("f16:csky", WN.w * 1.5, WN.h * 1.5, (s) => {
    s.scale(1.5, 1.5); s.translate(-WN.x, -WN.y);
    const { x: x0, y: y0, w, h } = WN;
    const sg = s.createLinearGradient(0, y0, 0, y0 + h);
    sg.addColorStop(0, "#3e2a62"); sg.addColorStop(0.28, "#94508e"); sg.addColorStop(0.48, "#e886ae"); sg.addColorStop(0.6, "#ffc6aa"); sg.addColorStop(0.7, "#ffe6cc"); sg.addColorStop(1, "#ffcfae");
    s.fillStyle = sg; s.fillRect(x0, y0, w, h);
    for (let k = 0; k < 4; k++) {
      s.save();
      const yy = y0 + h * (0.12 + k * 0.1);
      s.beginPath(); s.rect(x0, yy - 14, w, 30); s.clip();
      const pat = K.texPattern(s, "cloud", { seed: 70 + k, cover: 0.5 });
      if (pat.setTransform && typeof DOMMatrix !== "undefined") pat.setTransform(new DOMMatrix([2.4, 0, 0, 0.18, x0 + k * 90, yy - 12]));
      s.globalAlpha = 0.55 - k * 0.08;
      s.globalCompositeOperation = "multiply"; s.fillStyle = pat; s.fillRect(x0, yy - 14, w, 30);
      s.globalCompositeOperation = "screen"; s.globalAlpha = 0.25; s.translate(0, 2); s.fillStyle = pat; s.fillRect(x0, yy - 14, w, 30);
      s.restore();
    }
    K.sunGlow(s, SUN6.x, SUN6.y, 22, "#fff0dc", 1);
    s.fillStyle = "#fffaf2"; s.beginPath(); s.arc(SUN6.x, SUN6.y, 5.5, 0, TAU); s.fill();
  });
}
// the skyline in four depths: each farther layer lower in contrast and closer to the haze colour; roof
// clutter (AC boxes, antennas, tanks) and irregular window lights (whole floors dark, a few warm, a few blue)
function cityFar() {
  return spr("f16:cfar", WN.w * 2, WN.h * 2, (s) => {
    s.scale(2, 2); s.translate(-WN.x, -WN.y);
    const { x: x0, y: y0, w, h } = WN;
    const R = K.rng("city2");
    const haze = "#f2b4c8";
    const layer = (n, yb, hMin, hMax, depth) => {
      const col = K.mix("#2a1230", haze, 0.82 - depth * 0.22);
      const lit = K.mix("#ffd0a0", haze, 0.6 - depth * 0.15);
      for (let i = 0; i < n; i++) {
        const bw = (14 + R() * 40) * (0.7 + depth * 0.15), bh = hMin + Math.pow(R(), 1.5) * (hMax - hMin), bx = x0 - 24 + R() * (w + 30);
        const top = yb - bh;
        s.fillStyle = col; s.fillRect(bx, top, bw, bh + 90);
        // the sun-side face catches warm light; the rest is in its own shade
        s.fillStyle = K.rgba(lit, 0.18 + depth * 0.06); s.fillRect(bx, top, Math.max(1, bw * 0.12), bh + 90);
        // roof clutter
        const nc = Math.floor(R() * 3);
        for (let c = 0; c < nc; c++) {
          const cx = bx + R() * bw * 0.8, cw = 2 + R() * 5 * (0.6 + depth * 0.2), ch = 1.5 + R() * 3;
          s.fillStyle = col; s.fillRect(cx, top - ch, cw, ch + 0.5);
          s.fillStyle = K.rgba(lit, 0.3); s.fillRect(cx, top - ch, cw, 0.5);
        }
        if (R() > 0.55) { const ax = bx + bw * (0.2 + R() * 0.6), ah = 8 + R() * 18; s.fillStyle = col; s.fillRect(ax, top - ah, 0.7, ah); s.fillRect(ax - 2.5, top - ah * 0.7, 5, 0.5); }
        if (R() > 0.82) { const tx = bx + bw * 0.5; s.fillStyle = col; s.fillRect(tx - 4, top - 12, 8, 8); s.beginPath(); s.moveTo(tx - 5, top - 12); s.lineTo(tx, top - 16); s.lineTo(tx + 5, top - 12); s.fill(); s.fillRect(tx - 3.5, top - 4, 0.7, 4); s.fillRect(tx + 2.8, top - 4, 0.7, 4); }
        // windows: by floor; whole floors dark, warm and cool lights scattered, sunset glints on the glass
        const fl = 2.6 + depth * 0.5, bay = 3.4 + depth * 0.4;
        for (let yy = top + 3; yy < yb - 2; yy += fl) {
          const floorOn = R() < 0.45;
          for (let xx = bx + 1.5; xx < bx + bw - 2; xx += bay) {
            const r = R();
            if (floorOn && r < 0.35) s.fillStyle = r < 0.08 ? "rgba(170,200,255,0.55)" : `rgba(255,${190 + Math.floor(R() * 40)},130,${(0.45 + 0.4 * R()).toFixed(2)})`;
            else if (r > 0.9 && depth < 2) s.fillStyle = "rgba(255,220,230,0.4)";
            else { s.fillStyle = "rgba(0,0,0,0.12)"; }
            s.fillRect(xx, yy, 1.4 + depth * 0.2, 1.3 + depth * 0.2);
          }
        }
      }
      // haze in front of this layer (atmospheric perspective)
      const hz = s.createLinearGradient(0, yb - hMax, 0, yb);
      hz.addColorStop(0, K.rgba(haze, 0)); hz.addColorStop(1, K.rgba(haze, 0.32 - depth * 0.07));
      s.fillStyle = hz; s.fillRect(x0, yb - hMax, w, hMax + 10);
    };
    layer(26, y0 + h * 0.7, 20, 110, 0);
    layer(18, y0 + h * 0.74, 18, 96, 1);
    layer(12, y0 + h * 0.78, 14, 70, 2);
    layer(8, y0 + h * 0.81, 10, 44, 3);
  });
}
// the near rooftop where the cats are: tar with seams and gravel, a brick parapet, a vent and an AC box,
// a puddle mirroring the sky, the wooden water tank on steel legs and its long low-sun shadow
const RF6 = { x: WN.x, y: ROOF - 110, w: WN.w, h: WN.y + WN.h - (ROOF - 110), res: 3.4 };
function cityRoof() {
  return spr("f16:croof", RF6.w * RF6.res, RF6.h * RF6.res, (s) => {
    s.scale(RF6.res, RF6.res); s.translate(-RF6.x, -RF6.y);
    const x0 = WN.x, w = WN.w, h6 = WN.y + WN.h - ROOF;
    K.texRect(s, "asphalt", x0, ROOF, w, h6, { tex: { seed: 3 }, scale: 60, tint: "#5a3448", tintAlpha: 0.8 });
    // perspective seams of the roofing felt, and gravel
    s.strokeStyle = "rgba(20,6,16,0.45)"; s.lineWidth = 0.5; s.beginPath();
    for (let k = -8; k <= 8; k++) { s.moveTo(SUN6.x + k * 30, ROOF); s.lineTo(SUN6.x + k * 160, ROOF + h6); }
    for (const f of [0.15, 0.4, 0.75]) { s.moveTo(x0, ROOF + h6 * f); s.lineTo(x0 + w, ROOF + h6 * f); }
    s.stroke();
    const R = K.rng("gravel");
    for (let i = 0; i < 500; i++) { const gx = x0 + R() * w, gy = ROOF + Math.pow(R(), 0.7) * h6; s.fillStyle = R() > 0.5 ? "rgba(255,190,200,0.25)" : "rgba(10,2,8,0.35)"; s.fillRect(gx, gy, 0.5 + (gy - ROOF) * 0.01, 0.4 + (gy - ROOF) * 0.008); }
    // the low sun grazes the roof: bright near the horizon line, darker toward us
    const rg = s.createLinearGradient(0, ROOF, 0, ROOF + h6);
    rg.addColorStop(0, "rgba(255,180,200,0.4)"); rg.addColorStop(0.3, "rgba(255,170,190,0.1)"); rg.addColorStop(1, "rgba(30,6,24,0.45)");
    s.fillStyle = rg; s.fillRect(x0, ROOF, w, h6);
    // a puddle: an irregular, flat shape mirroring the sky (the bright band of the horizon)
    soft(s, x0, ROOF + 6, w * 0.6, 34, 0.8, (q) => {
      const pd = new Path2D();
      for (let k = 0; k <= 30; k++) {
        const a = (k / 30) * TAU, rx = w * 0.13 * (0.8 + 0.4 * K.fbm(a * 1.4, 33)), ry = 4.5 * (0.7 + 0.5 * K.fbm(a * 1.4 + 3, 34));
        const px = x0 + w * 0.3 + Math.cos(a) * rx, py = ROOF + 22 + Math.sin(a) * ry;
        k ? pd.lineTo(px, py) : pd.moveTo(px, py);
      }
      pd.closePath();
      const pg2 = q.createLinearGradient(0, ROOF + 17, 0, ROOF + 28);
      pg2.addColorStop(0, "rgba(255,226,206,0.5)"); pg2.addColorStop(0.5, "rgba(220,130,170,0.35)"); pg2.addColorStop(1, "rgba(90,40,80,0.35)");
      q.fillStyle = pg2; q.fill(pd);
      q.fillStyle = "rgba(255,250,240,0.7)"; q.fillRect(x0 + w * 0.3 - 18, ROOF + 21, 36, 0.8); // the sun's reflection
    });
    // brick parapet on the left with a lit coping
    K.texRect(s, "brick", x0, ROOF - 9, w * 0.42, 9, { tex: { seed: 2 }, scale: 30, tint: "#8a4a5a", tintAlpha: 0.7 });
    s.fillStyle = "rgba(255,190,200,0.7)"; s.fillRect(x0, ROOF - 9.5, w * 0.42, 1);
    s.fillStyle = "rgba(20,4,14,0.5)"; s.fillRect(x0, ROOF - 0.5, w * 0.42, 2);
    // vent pipe and AC box, each with a lit edge, a dark side and a long shadow away from the sun
    const box = (bx, by, bw, bh) => {
      soft(s, bx - 4, by - 2, bw + 80, bh + 10, 1, (q) => { q.fillStyle = "rgba(20,4,16,0.5)"; q.beginPath(); q.moveTo(bx + bw * 0.3, by + bh); q.lineTo(bx + bw, by + bh); q.lineTo(bx + bw + 60, by + bh + 6); q.lineTo(bx + bw + 20, by + bh + 7); q.fill(); });
      K.texRect(s, "metal", bx, by, bw, bh, { tex: { seed: 4 }, scale: 24, tint: "#4a2a40", tintAlpha: 0.8 });
      s.fillStyle = "rgba(255,170,190,0.55)"; s.fillRect(bx, by, 1, bh); s.fillRect(bx, by, bw, 0.8);
      s.fillStyle = "rgba(10,0,10,0.35)"; s.fillRect(bx + bw * 0.6, by, bw * 0.4, bh);
      s.strokeStyle = "rgba(10,0,10,0.4)"; s.lineWidth = 0.4; s.beginPath(); for (let k = 1; k < 5; k++) { s.moveTo(bx + 2, by + k * bh / 5); s.lineTo(bx + bw * 0.55, by + k * bh / 5); } s.stroke();
    };
    box(x0 + w * 0.5, ROOF - 14, 26, 15);
    s.fillStyle = "#24101e"; s.fillRect(x0 + w * 0.12, ROOF - 16, 4, 16); s.fillRect(x0 + w * 0.12 - 2, ROOF - 18, 8, 3);
    s.fillStyle = "rgba(255,170,190,0.5)"; s.fillRect(x0 + w * 0.12, ROOF - 16, 0.8, 16);
    // the water tank: long shadow across the roof, legs, staves, a shingled cone
    soft(s, TANK - 40, ROOF - 5, 220, 25, 1.2, (q) => {
      q.fillStyle = "rgba(30,8,30,0.5)";
      q.beginPath(); q.moveTo(TANK - 30, ROOF + 1); q.lineTo(TANK + 30, ROOF + 1); q.lineTo(TANK + 160, ROOF + 12); q.lineTo(TANK + 80, ROOF + 14); q.closePath(); q.fill();
    });
    s.fillStyle = "#2a1424";
    for (const lx of [-28, 28]) s.fillRect(TANK + lx - 1.5, ROOF - 28, 3, 28);
    s.strokeStyle = "#2a1424"; s.lineWidth = 1.2; s.beginPath(); s.moveTo(TANK - 28, ROOF - 2); s.lineTo(TANK + 28, ROOF - 22); s.moveTo(TANK + 28, ROOF - 2); s.lineTo(TANK - 28, ROOF - 22); s.stroke();
    K.texRect(s, "wood", TANK - 34, ROOF - 72, 68, 46, { tex: { color: "#6a4a4a", dark: "#2a1820", planks: 1, seed: 7 }, scale: 46, rot: Math.PI / 2, tint: "#8a5a7a", tintAlpha: 0.6 });
    const tg = s.createLinearGradient(TANK - 34, 0, TANK + 34, 0);
    tg.addColorStop(0, "rgba(255,170,170,0.5)"); tg.addColorStop(0.35, "rgba(0,0,0,0)"); tg.addColorStop(1, "rgba(20,0,20,0.6)");
    s.fillStyle = tg; s.fillRect(TANK - 34, ROOF - 72, 68, 46);
    s.fillStyle = "#24121e"; for (const by of [ROOF - 64, ROOF - 40]) s.fillRect(TANK - 34, by, 68, 1.6);
    const roof = new Path2D(); roof.moveTo(TANK - 38, ROOF - 71); roof.lineTo(TANK, ROOF - 94); roof.lineTo(TANK + 38, ROOF - 71); roof.closePath();
    K.texFill(s, "shingle", roof, { tex: { seed: 3 }, scale: 24, tint: "#5a3050", tintAlpha: 0.75 });
    s.save(); s.clip(roof); const rr = s.createLinearGradient(TANK - 38, 0, TANK + 38, 0); rr.addColorStop(0, "rgba(255,170,180,0.45)"); rr.addColorStop(1, "rgba(10,0,10,0.55)"); s.fillStyle = rr; s.fillRect(TANK - 40, ROOF - 96, 80, 30); s.restore();
    // the nook under the tank: sheltered, dark, safe
    const nk = s.createRadialGradient(TANK + 4, ROOF - 6, 2, TANK + 4, ROOF - 6, 26);
    nk.addColorStop(0, "#140812"); nk.addColorStop(1, "rgba(20,8,18,0)");
    s.fillStyle = nk; s.fillRect(TANK - 26, ROOF - 32, 60, 34);
  });
}
// the glass: dust, dried rain streaks, a smudge, faint reflections of the candles in the room behind us
function glassSprite() {
  return spr("f16:glass2", WN.w * 1.5, WN.h * 1.5, (s) => {
    s.scale(1.5, 1.5); s.translate(-WN.x, -WN.y);
    s.globalAlpha = 0.12; s.fillStyle = finePattern(s, "cloud", { seed: 40, cover: 0.4 }, 1.2); s.fillRect(WN.x, WN.y, WN.w, WN.h);
    s.globalAlpha = 1;
    const R = K.rng("streak");
    soft(s, WN.x, WN.y, WN.w, WN.h, 1.2, (q) => {
      for (let i = 0; i < 46; i++) {
        const x = WN.x + R() * WN.w, y = WN.y + R() * WN.h * 0.6, l = 20 + R() * 120;
        q.strokeStyle = `rgba(255,230,240,${(0.04 + R() * 0.06).toFixed(3)})`; q.lineWidth = 0.6 + R();
        q.beginPath(); q.moveTo(x, y); q.bezierCurveTo(x + (R() - 0.5) * 4, y + l * 0.3, x + (R() - 0.5) * 6, y + l * 0.7, x + (R() - 0.5) * 5, y + l); q.stroke();
        q.fillStyle = "rgba(255,230,240,0.08)"; q.beginPath(); q.arc(x, y + l, 1.2, 0, TAU); q.fill();
      }
      const sm = q.createRadialGradient(WN.x + WN.w * 0.62, WN.y + WN.h * 0.42, 0, WN.x + WN.w * 0.62, WN.y + WN.h * 0.42, 36);
      sm.addColorStop(0, "rgba(255,230,240,0.08)"); sm.addColorStop(1, "rgba(255,230,240,0)");
      q.fillStyle = sm; q.fillRect(WN.x, WN.y, WN.w, WN.h);
    });
    // reflections of the candles in the room (behind the camera) on the left pane
    for (let i = 0; i < 9; i++) {
      const x = WN.x + 30 + K.hash(i, 3) * 150, y = WN.y + WN.h * 0.62 + K.hash(i, 4) * 50;
      K.glow(s, x, y, 4 + K.hash(i, 5) * 3, "#ffb060", 0.35);
    }
    const rg = s.createLinearGradient(WN.x, WN.y, WN.x + WN.w, WN.y + WN.h);
    rg.addColorStop(0, "rgba(255,255,255,0)"); rg.addColorStop(0.45, "rgba(255,230,240,0.07)"); rg.addColorStop(0.55, "rgba(255,255,255,0)");
    s.fillStyle = rg; s.fillRect(WN.x, WN.y, WN.w, WN.h);
  });
}
const IR = { x: -120, y: -80, w: 1200, h: 720, res: 1.4 };
const FLOOR6 = 512;
function winRoomSprite() {
  return spr("f16:winroom2", IR.w * IR.res, IR.h * IR.res, (s) => {
    s.scale(IR.res, IR.res); s.translate(-IR.x, -IR.y);
    const { x: wx, y: wy, w: ww, h: wh } = WN;
    K.texRect(s, "plaster", IR.x, IR.y, IR.w, FLOOR6 - IR.y, { tex: { color: "#ac9078", grime: "#4a3424", stain: 0.6, cracks: true, seed: 11 }, scale: 320 });
    // the floor: the same old boards, running toward us
    const fp = new Path2D(); fp.rect(IR.x, FLOOR6, IR.w, IR.y + IR.h - FLOOR6);
    K.texFill(s, "wood", fp, { tex: { color: "#6e4a32", dark: "#3a2414", planks: 6, joints: 1, seed: 4, size: 256 }, scale: 300, rot: Math.PI / 2 - 0.05, tint: "#8a6a5a", tintAlpha: 0.4 });
    K.texRect(s, "wood", IR.x, FLOOR6 - 12, IR.w, 12, { tex: { color: "#5a3a26", dark: "#22130b", planks: 1, seed: 8 }, scale: 140 });
    K.aoEdge(s, IR.x, FLOOR6, IR.x + IR.w, FLOOR6, { width: 26, alpha: 0.55, side: 0 });
    // lit only by the window: multiply the albedo by its falloff (pink sunset, very dim far away)
    const lm = K.makeCanvas(IR.w / 4, IR.h / 4);
    const q = lm.getContext("2d");
    q.scale(0.25, 0.25); q.translate(-IR.x, -IR.y);
    q.fillStyle = "#1a1016"; q.fillRect(IR.x, IR.y, IR.w, IR.h);
    q.globalCompositeOperation = "lighter";
    radial(q, wx + ww / 2, wy + wh + 30, 760, "#ff9ac0", 0.8, 0.8);
    radial(q, wx + ww / 2, wy + wh / 2, 520, "#ffb0c8", 0.5);
    s.save(); s.globalCompositeOperation = "multiply"; s.drawImage(lm, IR.x, IR.y, IR.w, IR.h); s.restore();
    // the sunset coming through the window lands on the floor: the window's shape, mullion and blind
    // slats stretched long across the boards toward us (and onto the skirting)
    soft(s, IR.x, FLOOR6 - 20, IR.w, IR.y + IR.h - FLOOR6 + 20, 2.5, (q2) => {
      q2.globalCompositeOperation = "lighter";
      const sk = 0.9;
      const proj = (x, y) => [x - 140 + (x - SUN6.x) * 0.15, FLOOR6 + 4 + (y - wy) * sk * 0.5];
      const pane = (xa, xb) => {
        const a = proj(xa, wy + 86), b = proj(xb, wy + 86), c = proj(xb, wy + wh - 9), d = proj(xa, wy + wh - 9);
        const gr = q2.createLinearGradient(0, a[1], 0, c[1]);
        gr.addColorStop(0, "rgba(255,140,190,0.0)"); gr.addColorStop(0.25, "rgba(255,150,200,0.42)"); gr.addColorStop(1, "rgba(255,170,200,0.3)");
        q2.fillStyle = gr; q2.beginPath(); q2.moveTo(a[0], a[1]); q2.lineTo(b[0], b[1]); q2.lineTo(c[0], c[1]); q2.lineTo(d[0], d[1]); q2.closePath(); q2.fill();
      };
      pane(wx + 9, wx + ww / 2 - 4.5); pane(wx + ww / 2 + 4.5, wx + ww - 9);
    });
    // cut the opening
    s.save(); s.globalCompositeOperation = "destination-out"; s.fillRect(wx, wy, ww, wh); s.restore();
    // deep window reveal: the inner sides catch the sunset
    const rv = 14;
    const rev = (pts, col) => { s.fillStyle = col; s.fill(quadPath(pts)); };
    rev([[wx - rv, wy + wh + rv], [wx + ww + rv, wy + wh + rv], [wx + ww, wy + wh], [wx, wy + wh]], "#c88a8a");
    rev([[wx - rv, wy - rv], [wx, wy], [wx, wy + wh], [wx - rv, wy + wh + rv]], "#7a4a52");
    rev([[wx + ww + rv, wy - rv], [wx + ww, wy], [wx + ww, wy + wh], [wx + ww + rv, wy + wh + rv]], "#3a2228");
    rev([[wx - rv, wy - rv], [wx + ww + rv, wy - rv], [wx + ww, wy], [wx, wy]], "#24141a");
    // frame and the centre mullion: painted wood, worn
    const fw = 9;
    const frame = new Path2D();
    frame.rect(wx, wy, ww, wh); frame.rect(wx + fw, wy + fw, ww / 2 - fw * 1.5, wh - fw * 2); frame.rect(wx + ww / 2 + fw * 0.5, wy + fw, ww / 2 - fw * 1.5, wh - fw * 2);
    s.save(); s.clip(frame, "evenodd");
    K.texRect(s, "plaster", wx, wy, ww, wh, { tex: { color: "#5a4a44", grime: "#1a1210", stain: 0.9, seed: 17 }, scale: 90 });
    s.restore();
    s.fillStyle = "rgba(255,170,200,0.35)";
    s.fillRect(wx + fw, wy + wh - fw, ww - fw * 2, 1.4);
    s.fillRect(wx + ww / 2 - fw * 0.5, wy + fw, 1.2, wh - fw * 2);
    // half-open wooden blinds across the top
    for (let k = 0; k < 6; k++) {
      const y = wy + fw + k * 13;
      K.texRect(s, "wood", wx + fw, y, ww - fw * 2, 6, { tex: { color: "#5a3a2a", dark: "#1e120c", planks: 1, seed: 24 }, scale: 60 });
      s.fillStyle = "rgba(255,170,205,0.55)"; s.fillRect(wx + fw, y + 5, ww - fw * 2, 1.2);
      s.fillStyle = "rgba(10,4,4,0.35)"; s.fillRect(wx + fw, y + 6.2, ww - fw * 2, 2.5);
    }
    // the sill: a deep board with its lit top and a shadow beneath
    K.texRect(s, "plaster", wx - 32, wy + wh + rv, ww + 64, 14, { tex: { color: "#6a564c", grime: "#2a1a14", stain: 0.8, seed: 19 }, scale: 90 });
    s.fillStyle = "rgba(255,170,200,0.45)"; s.fillRect(wx - 32, wy + wh + rv, ww + 64, 2);
    const ug = s.createLinearGradient(0, wy + wh + rv + 14, 0, wy + wh + rv + 40);
    ug.addColorStop(0, "rgba(10,4,4,0.6)"); ug.addColorStop(1, "rgba(10,4,4,0)");
    s.fillStyle = ug; s.fillRect(wx - 40, wy + wh + rv + 14, ww + 80, 26);
  });
}
// the rooftop story, choreographed so it reads: the kitten stops and hesitates, Biscuit catches up and
// nudges it with his head, it trots into the nook under the tank and curls up; Biscuit sits, looks back
function roofState(t) {
  const kA = K.ease.inOut(K.seg(t, 56.4, 58.6)), kB = K.ease.inOut(K.seg(t, 60.0, 61.4));
  const kx = K.lerp(TANK - 92, TANK - 44, kA) + kB * 42;
  const kState = t < 58.6 ? "walk" : t < 60.0 ? "wait" : t < 61.4 ? "walk" : "loaf";
  const bA = K.ease.inOut(K.seg(t, 56.2, 59.6)), bB = K.ease.inOut(K.seg(t, 60.1, 60.9));
  const bx = K.lerp(TANK - 168, TANK - 66, bA) + bB * 12;
  const nudge = K.env(t, 59.6, 60.4, 0.25, 0.3);
  const sat = t > 61.2;
  return { kx, kState, kp: kA + kB, bx, bWalk: (bA > 0.01 && bA < 0.99) || (bB > 0.01 && bB < 0.99), nudge, sat };
}
function rooftopCats(g, t) {
  const S = roofState(t);
  const sunL = { x: SUN6.x, y: SUN6.y, color: "#ffc0a0", strength: 1.4 };
  // the kitten
  const kq = S.kState === "wait" ? Math.round(K.smooth(K.seg(t, 58.7, 59.3)) * 4) : 0;
  K.shadowBlob(g, S.kx + 3, ROOF + 1.2, 6, 1, { alpha: 0.55 });
  cachedCat(g, S.kx, ROOF + 1, 12, { pose: S.kState === "walk" ? "walk" : S.kState === "wait" ? "stand" : "loaf", phase: S.kState === "walk" ? t * 1.8 : 0, facing: 1, coat: K.COATS.grey, collar: false, headTurn: S.kState === "wait" ? -0.15 * kq : 0, key: sunL, rim: sunL, backlit: 0.8 },
    "kit3" + S.kState + kq, 8, 4);
  // Biscuit, with the sunset as a hot rim around him
  const hq = S.sat ? Math.round(K.smooth(K.seg(t, 61.4, 62.6)) * 8) : 0;
  const bl = S.sat ? Math.round(K.env(t, 63.3, 64.3, 0.4, 0.4) * 2) : 0;
  const nq = Math.round(S.nudge * 4);
  K.pawprints(g, K.pawTrail(TANK - 230, ROOF + 2, S.bx - 8, ROOF + 2, 8, t - 54, { start: 0, every: 0.5, life: 8, s0: 3.2, s1: 3.2 }), 0.9);
  K.shadowBlob(g, S.bx + 4, ROOF + 1.5, 11, 1.8, { alpha: 0.6 });
  const pose = S.sat ? "sit" : S.bWalk ? "walk" : "stand";
  cachedCat(g, S.bx + nq * 1.2, ROOF + 1, 24, { pose, phase: S.bWalk ? t * 1.2 : 0, facing: S.sat ? -1 : 1, headTurn: S.sat ? (0.95 * hq) / 8 : 0.1, headTilt: -0.12 * nq, bell: false, rim: { x: SUN6.x - 20, y: SUN6.y - 10, color: "#ffd0b0", strength: 2.0 }, key: { x: SUN6.x, y: SUN6.y - 60, color: "#ffc8b0", strength: 1.0 }, fill: "#3a1a30", backlit: 0.95, tailUp: S.sat ? 0.6 : 0.3, blink: bl / 2 },
    "roofb2:" + pose + ":" + hq + ":" + bl + ":" + nq, 8, 4);
}
// Sir Whiskers sitting in the foreground: his head turn is quantised into cached steps and the focus pull
// into cached blur steps (a 170 px cat is far too costly to repaint every frame). The window is his key
// light: a strong pink sunset on his face, ruff and whiskers; his far side falls into deep plum.
function sirFgSprite(hq) {
  return spr("f16:sirfg3:" + hq, 560 * 1.1, 420 * 1.1, (s) => {
    s.scale(1.1, 1.1);
    K.drawCat(s, 280, 400, 170, { pose: "sit", facing: 1, headTurn: K.lerp(0.7, -0.3, hq), t: 0, autoBlink: false, collar: false, bell: false, coat: OLD, shadow: false, blink: 0.45, pupil: 0.35,
      key: { x: 280 + 380, y: 400 - 240, color: "#ff9ad8", strength: 1.7 }, rim: { x: 280 + 520, y: 400 - 280, color: "#ffc8e0", strength: 1.9 }, fill: "#24102c", ambient: "#2a1430", ambientK: 0.26, backlit: 0.9 });
    ruff(s, 280, 400, 170, 1, "sit", 0, K.lerp(0.7, -0.3, hq));
    // the window side of him glows pink; the far side sinks to plum
    s.save();
    s.globalCompositeOperation = "source-atop";
    const gr = s.createLinearGradient(140, 0, 420, 0);
    gr.addColorStop(0, "rgba(30,10,40,0.45)"); gr.addColorStop(0.5, "rgba(30,10,40,0)"); gr.addColorStop(1, "rgba(255,150,210,0.22)");
    s.fillStyle = gr; s.fillRect(0, 0, 560, 420);
    s.restore();
  });
}
function sirFg(hq, bq) {
  if (bq < 0.3) return sirFgSprite(hq);
  const k = Math.sqrt(0.5 + bq * 0.55) * 1.15;
  const p1 = spr("f16:sirfgb1:" + hq + ":" + bq, 280, 210, (s) => soft(s, 0, 0, 280, 210, k, (q) => q.drawImage(sirFgSprite(hq), 0, 0, 280, 210)));
  return spr("f16:sirfgb3:" + hq + ":" + bq, 280, 210, (s) => soft(s, 0, 0, 280, 210, k, (q) => q.drawImage(p1, 0, 0, 280, 210)));
}
function s6Cam(t) {
  const a = K.ease.inOut(K.seg(t, 56, 60)), b = K.ease.inOut(K.seg(t, 60, 62.2)), c = K.ease.inOut(K.seg(t, 62.5, 66));
  return {
    x: K.lerp(K.lerp(480, 640, a), 722, b) - c * 6,
    y: K.lerp(K.lerp(270, 300, a), 334, b) - c * 3,
    zoom: K.lerp(K.lerp(1.0, 1.45, a), 3.1, b) * (1 + 0.04 * c),
  };
}
function s6Sir(t) {
  const blur = K.lerp(0, 5, K.smooth(K.seg(t, 57.5, 60.5)));
  const turn = K.ease.inOut(K.seg(t, 56, 58.5));
  return [Math.round(turn * 12) / 12, Math.round(blur * 2) / 2];
}
function shot6(g, W, H, t) {
  const cam = s6Cam(t);
  K.withCamera(g, W, H, Object.assign({ shakeT: t, shakeAmt: 0.8 }, cam), () => {
    g.drawImage(citySky(), WN.x, WN.y, WN.w, WN.h);
    g.drawImage(cityFar(), WN.x, WN.y, WN.w, WN.h);
    g.drawImage(cityRoof(), RF6.x, RF6.y, RF6.w, RF6.h);
    g.save(); g.beginPath(); g.rect(WN.x, WN.y, WN.w, WN.h); g.clip();
    rooftopCats(g, t);
    g.drawImage(glassSprite(), WN.x, WN.y, WN.w, WN.h);
    // his reflection in the glass, faint
    const [hq, bq] = s6Sir(t);
    g.save(); g.globalCompositeOperation = "screen"; g.globalAlpha = 0.13;
    g.translate(WN.x + 150, 0); g.scale(-1, 1);
    g.drawImage(sirFgSprite(hq), -60 - 230, 250 - 180, 300, 225);
    g.restore();
    g.restore();
    g.drawImage(winRoomSprite(), IR.x, IR.y, IR.w, IR.h);
    K.godRays(g, WN.x + WN.w * 0.45, WN.y + WN.h * 0.35, W, H, { color: "#ffb0d0", count: 9, strength: 0.1, t, angle: Math.PI / 2 + 0.28, spread: 0.45, length: 420, seed: 12 });
    // Sir Whiskers in the foreground, turning to the window; focus pulls past him to the rooftop
    const img = sirFg(hq, bq);
    K.glow(g, 300, 330, 220, "#ff9ad8", 0.08);
    g.save();
    g.globalAlpha = 0.86;
    g.drawImage(img, 260 - 280, 520 - 400, 560, 420);
    g.restore();
  });
}
function shot6Warm() {
  const out = [citySky, cityFar, cityRoof, glassSprite, winRoomSprite];
  const seen = new Set();
  for (let tt = 56; tt < 66; tt += 0.05) {
    const [hq, bq] = s6Sir(tt), k = hq + ":" + bq;
    if (!seen.has(k)) { seen.add(k); out.push(() => sirFg(hq, bq)); }
  }
  for (let tt = 56; tt < 66; tt += 0.06) out.push(() => rooftopCats(dummy(), tt));
  return out;
}

// ---- foreground occluders: the rolled-up shutter of the shop front, far out of focus (shot 1) ---------------
function shutterSprite() {
  return spr("f16:shutter", 480, 270, (s) => {
    soft(s, 0, 0, 480, 270, 6, (s) => {
    s.scale(0.5, 0.5);
    // left guide rail + edge of the shutter curtain
    s.fillStyle = "#0b0706"; s.fillRect(-40, -40, 150, 640);
    for (let k = 0; k < 30; k++) { s.fillStyle = k % 2 ? "#120c09" : "#080504"; s.fillRect(-40, k * 20, 150, 10); }
    s.fillStyle = "rgba(255,150,80,0.22)"; s.fillRect(104, 0, 6, 540);
    // the rolled-up drum overhead
    s.fillStyle = "#0a0605"; s.fillRect(-40, -40, 1040, 120);
    s.fillStyle = "rgba(255,150,80,0.16)"; s.fillRect(110, 74, 900, 6);
    // right jamb
    s.fillStyle = "#0b0706"; s.fillRect(880, -40, 120, 640);
    s.fillStyle = "rgba(255,150,80,0.12)"; s.fillRect(876, 60, 5, 480);
    });
  });
}

// ---- shot 4: the Shadow steps into the light, and is Sir Whiskers --------------------------------------------
const S4 = { x0: 708, x1: 578, y0: 408, y1: 420, s0: 59, s1: 66 };
function s4State(t) {
  const wp = K.ease.inOut(K.seg(t, 34, 40));
  const x = K.lerp(S4.x0, S4.x1, wp), y = K.lerp(S4.y0, S4.y1, wp), size = K.lerp(S4.s0, S4.s1, wp);
  // the gait phase follows the distance walked (feet plant instead of sliding): ~3.5 steps in all
  const phase = (S4.x0 - x) / (size * 1.6);
  const walking = t < 40;
  const near = K.smooth(K.seg(t, 34, 40.5));
  const reveal = K.smooth(K.seg(t, 40.6, 44.2));
  const turn = t < 44 ? 0.35 : Math.round(K.lerp(0.35, 0.55, K.smooth(K.seg(t, 44, 45.4))) * 20) / 20;
  const bow = K.smooth(K.seg(t, 46, 46.9)) - 0.7 * K.smooth(K.seg(t, 47.4, 48.3));
  const tilt = -Math.round(0.5 * bow * 12) / 12;
  return { x, y, size, phase, walking, near, reveal, turn, tilt };
}
function shot4(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 34, 48.5));
  const S = s4State(t);
  const emerge = K.smooth(K.seg(t, 34, 35.3));
  const q = Math.floor(((S.phase % 1) + 1) % 1 * 8);
  const breath = 0.006 * Math.sin(t * 1.6);
  // low, close camera: we are down among the candles; it eases in on him as he arrives
  shop(g, W, H, t, { x: K.lerp(650, 596, p), y: K.lerp(350, 364, p), zoom: K.lerp(2.0, 2.55, p), shakeT: t, shakeAmt: 0.8 }, {
    ambient: K.mix("#1c1418", "#2a2024", S.reveal), slats: 0.55 + S.reveal * 0.3, candle: 1.05 + S.reveal * 0.3, bright: 1 + S.reveal * 0.3, wallLit: 0.6, midBand: 1,
    // the candles below throw his shadow up the poster wall: it grows and climbs as he nears them
    wall: (gg) => wallShadow(gg, S.x, S.size, 1.5 + 1.1 * S.near, 0.46 * emerge * (1 - 0.45 * S.reveal), S.walking ? "walk" : "stand", S.walking ? q : 0),
    mid: (gg) => {
      pawContact(gg, S.x, S.y, S.size, emerge);
      if (S.walking) {
        drawSprAt(gg, shadowWalkSprite(gaitQ(S.phase)), S.x, S.y, S.size / 64, emerge);
        // the candle light on him grows as he nears them
        K.glow(gg, S.x - S.size * 0.3, S.y - S.size * 0.2, S.size * 1.1, "#ff9a50", 0.12 * S.near * emerge);
        return;
      }
      const sv = sirStill(S4.s1, S.turn, S.tilt);
      if (S.reveal < 1) {
        // the candle light climbs him from the paws up: below the front he is Sir Whiskers, above it still the Shadow
        const sh = shadowStill(S4.s1, 1, 0.35);
        const edge = S.y + S.size * 0.1 - S.reveal * S.size * 2.1, sf = S.size * 0.32;
        const mask = (s, mode) => {
          s.globalCompositeOperation = mode;
          const gr = s.createLinearGradient(0, edge + sf, 0, edge - sf);
          gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)");
          s.fillStyle = gr; s.fillRect(S.x - S.size * 3, S.y - S.size * 3, S.size * 6, S.size * 3.6);
        };
        const L1 = inLayer(gg, W, H, "f16:wipeA", (s) => { drawSpr(s, sh, S.x, S.y, 1, breath); mask(s, "destination-out"); });
        put(gg, W, H, L1, 1);
        const L2 = inLayer(gg, W, H, "f16:wipeB", (s) => {
          drawSpr(s, sv, S.x, S.y, 1, breath);
          mask(s, "destination-in");
          // the band of candle light at the front of the reveal
          s.globalCompositeOperation = "source-atop";
          const bg = s.createLinearGradient(0, edge + sf * 1.5, 0, edge - sf);
          bg.addColorStop(0, "rgba(255,170,90,0)"); bg.addColorStop(0.6, "rgba(255,190,110,0.55)"); bg.addColorStop(1, "rgba(255,200,120,0)");
          s.fillStyle = bg; s.fillRect(S.x - S.size * 3, S.y - S.size * 3, S.size * 6, S.size * 3.6);
        });
        put(gg, W, H, L2, 0.84);
        K.glow(gg, S.x - S.size * 0.1, edge, S.size * 1.2, "#ffb060", 0.18 * Math.sin(Math.PI * S.reveal));
        return;
      }
      // revealed: translucent (the posters show faintly through him), warm presence, cold edges
      K.glow(gg, S.x - S.size * 0.3, S.y - S.size * 1.0, S.size * 2.2, "#ffe7a8", 0.16);
      drawSpr(gg, sv, S.x, S.y, 0.82, breath);
      K.glow(gg, S.x - S.size * 0.5, S.y - S.size * 1.3, S.size * 1.1, "#bcd6ff", 0.08);
    },
  });
}
// every cached sprite shot 4 needs, in the order it needs them (for prewarm)
function shot4Warm() {
  const out = [];
  for (let q = 0; q < GAIT; q++) out.push(() => shadowWalkSprite(q));
  for (let q = 0; q < 8; q++) out.push(() => shadowSprites(64, "walk", q, -1, 8));
  out.push(() => shadowSprites(64, "stand", 0, -1, 8));
  out.push(() => shadowStill(S4.s1, 1, 0.35));
  const seen = new Set();
  for (let tt = 40; tt < 48.5; tt += 0.05) {
    const S = s4State(tt), k = S.turn + ":" + S.tilt;
    if (!seen.has(k)) { seen.add(k); out.push(() => sirStill(S4.s1, S.turn, S.tilt)); }
  }
  return out;
}

// Pre-warm costly cached art one item per time bucket, during the shot BEFORE it is needed.
const NEAR = (cx, cy, rx, ry) => POSTERS.filter((P) => Math.abs(P.x + P.w / 2 - cx) < rx && Math.abs(P.y + P.h / 2 - cy) < ry);
// ---- shot 7: your hand (a dedicated painter: the back of a child's left hand, index finger pointing) --------
// Local frame: the wrist at (0, 0), the index finger along -y, units HU; thumb on the +x side. The light
// (the candles, below-left on screen) arrives from local -x; the glowing print the finger touches is
// straight ahead (-y), so the fingertip edges glow with warm subsurface light.
const HU = 1.85, HSC = 1.6;
const HB = { x: -44, y: -112, w: 98, h: 280 };
const IDX_TIP = [12, -101];
function handParts() {
  const P = {};
  // the index finger: three tapering segments with soft joints, a rounded pad at the tip
  const fx = (y) => 12 + (y + 48) * 0.02; // the finger's centre line, a hair of a curve
  const fw = (y) => (y > -72 ? K.lerp(5.6, 5.0, (y + 48) / -24) : y > -88 ? K.lerp(5.0, 4.5, (y + 72) / -16) : K.lerp(4.5, 4.1, (y + 88) / -10));
  const idx = new Path2D();
  const ys = []; for (let y = -42; y >= -97; y -= 1) ys.push(y);
  ys.forEach((y, i) => { const bump = Math.exp(-((y + 72) ** 2) / 8) * 0.35 + Math.exp(-((y + 88) ** 2) / 6) * 0.25; const x = fx(y) - fw(y) - bump; i ? idx.lineTo(x, y) : idx.moveTo(x, y); });
  idx.arc(fx(-97), -97, fw(-97), Math.PI, 0);
  for (let i = ys.length - 1; i >= 0; i--) { const y = ys[i]; const bump = Math.exp(-((y + 72) ** 2) / 8) * 0.35 + Math.exp(-((y + 88) ** 2) / 6) * 0.25; idx.lineTo(fx(y) + fw(y) + bump, y); }
  idx.closePath();
  P.idx = idx; P.fx = fx; P.fw = fw;
  // the curled fingers: middle, ring, little - folded under, so we see their first segments and the
  // rounded middle knuckles
  P.curl = [[-1.5, 6.2, -63], [-13.5, 5.8, -60], [-24, 5.0, -55]].map(([cx, w, yb]) => {
    const p = new Path2D();
    p.moveTo(cx - w, -42); p.lineTo(cx - w * 1.02, yb + w * 0.6);
    p.quadraticCurveTo(cx - w, yb - w * 0.5, cx, yb - w * 0.55);
    p.quadraticCurveTo(cx + w, yb - w * 0.5, cx + w * 1.02, yb + w * 0.6);
    p.lineTo(cx + w, -42); p.closePath();
    return { p, cx, w, yb };
  });
  // the back of the hand, wrist to knuckles
  const back = new Path2D();
  back.moveTo(-16, 4); back.bezierCurveTo(-22, -10, -30, -30, -29, -46);
  back.quadraticCurveTo(-24, -54, -10, -54); back.quadraticCurveTo(6, -56, 18, -50);
  back.bezierCurveTo(22, -40, 24, -28, 24, -16); back.bezierCurveTo(22, -6, 18, 2, 16, 6); back.closePath();
  P.back = back;
  // the thumb, laid along the side of the index finger, its nail seen edge-on
  const th = new Path2D();
  th.moveTo(14, -4); th.bezierCurveTo(30, -14, 32, -30, 30, -44);
  th.quadraticCurveTo(29, -58, 23, -60); th.quadraticCurveTo(18, -58, 19, -46);
  th.bezierCurveTo(19, -34, 14, -24, 6, -16); th.closePath();
  P.thumb = th;
  return P;
}
let HP = null;
const hparts = () => HP || (HP = handParts());
function paintHand(s) {
  const P = hparts();
  const skin = "#b87650", skinD = "#6e3620", skinL = "#e0a072";
  const all = new Path2D(); all.addPath(P.back); all.addPath(P.thumb); all.addPath(P.idx); for (const c of P.curl) all.addPath(c.p);
  // base skin
  s.fillStyle = skin;
  for (const c of P.curl) s.fill(c.p);
  s.fill(P.back); s.fill(P.thumb); s.fill(P.idx);
  // each volume shaded as a rounded form lit from the left (-x), turning darker on the right
  const cyl = (path, x0, x1, k = 1) => {
    s.save(); s.clip(path);
    const g = s.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, K.rgba(skinL, 0.55 * k)); g.addColorStop(0.3, K.rgba(skin, 0)); g.addColorStop(0.7, K.rgba(skinD, 0.35 * k)); g.addColorStop(1, K.rgba("#5a2a1a", 0.65 * k));
    s.fillStyle = g; s.fillRect(-60, -120, 140, 140);
    s.restore();
  };
  for (const c of P.curl) {
    cyl(c.p, c.cx - c.w, c.cx + c.w);
    // the curled fingers turn away from us toward their tips: darker, with the fold crease
    s.save(); s.clip(c.p);
    const g = s.createLinearGradient(0, -46, 0, c.yb - c.w * 0.55);
    g.addColorStop(0, "rgba(90,40,24,0.35)"); g.addColorStop(0.35, "rgba(90,40,24,0)"); g.addColorStop(0.8, "rgba(255,210,170,0.18)"); g.addColorStop(1, "rgba(90,40,24,0.25)");
    s.fillStyle = g; s.fillRect(c.cx - 10, -70, 20, 30);
    s.strokeStyle = "rgba(110,50,30,0.4)"; s.lineWidth = 0.45; s.beginPath();
    s.moveTo(c.cx - c.w * 0.6, c.yb + c.w * 0.25); s.quadraticCurveTo(c.cx, c.yb + c.w * 0.05, c.cx + c.w * 0.6, c.yb + c.w * 0.25); s.stroke();
    s.restore();
    // a gap shadow between neighbouring fingers
    s.strokeStyle = "rgba(60,24,12,0.45)"; s.lineWidth = 0.8; s.beginPath(); s.moveTo(c.cx + c.w, -44); s.lineTo(c.cx + c.w, c.yb + c.w * 0.4); s.stroke();
  }
  cyl(P.back, -30, 24, 0.8);
  // knuckle bumps and the tendons fanning to the wrist, very subtle
  s.save(); s.clip(P.back);
  for (const [kx, ky] of [[12, -49], [-1.5, -51], [-13.5, -50], [-24, -46]]) {
    const g = s.createRadialGradient(kx - 1.5, ky + 1, 0, kx, ky, 6);
    g.addColorStop(0, "rgba(255,226,196,0.35)"); g.addColorStop(1, "rgba(255,226,196,0)");
    s.fillStyle = g; s.fillRect(kx - 7, ky - 7, 14, 14);
    s.strokeStyle = "rgba(255,220,190,0.12)"; s.lineWidth = 1.6; s.beginPath(); s.moveTo(kx, ky + 3); s.quadraticCurveTo(kx * 0.6, -20, kx * 0.25, -2); s.stroke();
    s.strokeStyle = "rgba(120,60,40,0.1)"; s.lineWidth = 1; s.beginPath(); s.moveTo(kx + 2, ky + 4); s.quadraticCurveTo(kx * 0.6 + 2, -20, kx * 0.25 + 2, -2); s.stroke();
  }
  s.restore();
  cyl(P.thumb, 18, 31);
  // the thumb's nail, edge-on, integrated in its contour
  s.save(); s.clip(P.thumb);
  s.fillStyle = "rgba(240,190,170,0.75)"; s.beginPath(); s.ellipse(24.6, -55, 2.6, 4.2, 0.2, 0, TAU); s.fill();
  s.fillStyle = "rgba(255,240,230,0.5)"; s.beginPath(); s.ellipse(24, -56, 0.8, 2.4, 0.2, 0, TAU); s.fill();
  s.restore();
  // the index finger: cylinder shading, joint creases, the pad, and the nail set INTO the finger
  const fx = P.fx, fw = P.fw;
  cyl(P.idx, fx(-70) - 5.5, fx(-70) + 5.5);
  s.save(); s.clip(P.idx);
  s.strokeStyle = "rgba(120,56,36,0.5)"; s.lineCap = "round";
  for (const [jy, n] of [[-72, 3], [-88, 2]]) {
    for (let k = 0; k < n; k++) {
      s.lineWidth = 0.35 + (k === 1 ? 0.15 : 0);
      s.beginPath(); s.moveTo(fx(jy) - fw(jy) * 0.7, jy + k * 0.9 - 0.6); s.quadraticCurveTo(fx(jy), jy + k * 0.9 - 1.6, fx(jy) + fw(jy) * 0.6, jy + k * 0.9 - 0.4); s.stroke();
    }
    const g = s.createRadialGradient(fx(jy) - 1, jy, 0, fx(jy), jy, 4.5);
    g.addColorStop(0, "rgba(255,224,196,0.28)"); g.addColorStop(1, "rgba(255,224,196,0)");
    s.fillStyle = g; s.fillRect(fx(jy) - 6, jy - 6, 12, 12);
  }
  // the nail: follows the finger's contour, slightly pinker and glossy, a pale free edge at the tip
  const nx = fx(-94), nw = fw(-94) * 0.72;
  const nail = new Path2D();
  nail.moveTo(nx - nw, -89.5); nail.quadraticCurveTo(nx, -91.2, nx + nw, -89.5);
  nail.lineTo(nx + nw * 0.98, -97.4); nail.quadraticCurveTo(nx, -101.6, nx - nw * 0.98, -97.4); nail.closePath();
  s.fillStyle = "rgba(236,170,156,0.85)"; s.fill(nail);
  const ng = s.createLinearGradient(nx - nw, 0, nx + nw, 0);
  ng.addColorStop(0, "rgba(255,236,224,0.45)"); ng.addColorStop(0.35, "rgba(255,236,224,0.1)"); ng.addColorStop(1, "rgba(120,50,40,0.3)");
  s.fillStyle = ng; s.fill(nail);
  s.strokeStyle = "rgba(130,60,44,0.45)"; s.lineWidth = 0.35; s.stroke(nail);
  s.fillStyle = "rgba(255,246,236,0.75)"; s.beginPath(); s.moveTo(nx - nw * 0.9, -97.6); s.quadraticCurveTo(nx, -101.2, nx + nw * 0.9, -97.6); s.quadraticCurveTo(nx, -100.2, nx - nw * 0.9, -97.6); s.fill();
  s.fillStyle = "rgba(255,255,255,0.55)"; s.beginPath(); s.ellipse(nx - nw * 0.35, -94, 0.5, 2.2, 0.05, 0, TAU); s.fill();
  s.restore();
  // skin texture: a fine mottling and pores
  s.save(); s.clip(all);
  s.globalCompositeOperation = "soft-light"; s.globalAlpha = 0.1;
  s.fillStyle = finePattern(s, "cloud", { seed: 90, cover: 0.2 }, 0.025); s.fillRect(-60, -120, 140, 140);
  s.restore();
  // warm subsurface at the edges and fingertip, lit through from the glowing print ahead
  s.save();
  s.globalCompositeOperation = "source-atop";
  const tip = s.createRadialGradient(IDX_TIP[0], IDX_TIP[1] + 2, 0, IDX_TIP[0], IDX_TIP[1] + 2, 26);
  tip.addColorStop(0, "rgba(255,120,70,0.55)"); tip.addColorStop(0.5, "rgba(255,110,60,0.2)"); tip.addColorStop(1, "rgba(255,110,60,0)");
  s.fillStyle = tip; s.fillRect(-20, -120, 60, 60);
  s.restore();
}
// the knit sleeve: a ribbed cuff, then stocking stitch; its cuff throws a soft shadow on the wrist
function paintSleeve(s) {
  const sl = new Path2D();
  sl.moveTo(-24, 2); sl.quadraticCurveTo(0, -3, 26, 4); sl.lineTo(34, 160); sl.lineTo(-36, 160); sl.closePath();
  const base = "#a8701a";
  s.fillStyle = base; s.fill(sl);
  s.save(); s.clip(sl);
  // ribs on the cuff (y 2..24), knit V-stitches above it
  for (let x = -34; x < 36; x += 3.2) {
    const g = s.createLinearGradient(x, 0, x + 3.2, 0);
    g.addColorStop(0, "rgba(90,50,0,0.4)"); g.addColorStop(0.5, "rgba(255,230,140,0.25)"); g.addColorStop(1, "rgba(90,50,0,0.4)");
    s.fillStyle = g; s.fillRect(x, 0, 3.2, 26);
  }
  s.strokeStyle = "rgba(90,50,0,0.2)"; s.lineWidth = 0.5;
  for (let y = 28; y < 160; y += 3) {
    s.beginPath();
    for (let x = -36 + ((y / 3) % 2) * 1.6; x < 36; x += 3.2) { s.moveTo(x, y); s.lineTo(x + 1.6, y + 2.4); s.lineTo(x + 3.2, y); }
    s.stroke();
  }
  s.fillStyle = "rgba(90,50,0,0.35)"; s.fillRect(-40, 25, 80, 1.6);
  // fuzz on the edge, form shading (lit from the left, falling into shadow on the right), the fold
  const g = s.createLinearGradient(-36, 0, 36, 0);
  g.addColorStop(0, "rgba(255,236,170,0.35)"); g.addColorStop(0.4, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(40,20,0,0.65)");
  s.fillStyle = g; s.fillRect(-40, 0, 80, 160);
  const g2 = s.createLinearGradient(0, 0, 0, 160);
  g2.addColorStop(0, "rgba(0,0,0,0)"); g2.addColorStop(1, "rgba(20,10,0,0.55)");
  s.fillStyle = g2; s.fillRect(-40, 0, 80, 160);
  s.restore();
}
function handSprite() {
  return spr("f16:hand", HB.w * HU * HSC, HB.h * HU * HSC, (s) => {
    s.scale(HU * HSC, HU * HSC); s.translate(-HB.x, -HB.y);
    paintHand(s);
    // the cuff's shadow on the wrist, then the sleeve over it
    s.save(); s.globalCompositeOperation = "source-atop";
    const cg = s.createLinearGradient(0, 3, 0, -10);
    cg.addColorStop(0, "rgba(50,20,8,0.55)"); cg.addColorStop(1, "rgba(50,20,8,0)");
    s.fillStyle = cg; s.fillRect(-40, -10, 80, 14);
    s.restore();
    // the bell on its string round the wrist (you have carried it since chapter one)
    s.strokeStyle = "#a83a30"; s.lineWidth = 1.2; s.beginPath(); s.moveTo(-22, 1); s.quadraticCurveTo(2, -4, 24, 2); s.stroke();
    paintSleeve(s);
    K.drawBell(s, 4, 4, 7, { glint: 0.6, string: false });
  });
}
// the hand's silhouette, blurred: its shadow on the paper
function handShadowSprite() {
  return spr("f16:handsh", HB.w * HU * 0.5, HB.h * HU * 0.5, (s) => {
    soft(s, 0, 0, HB.w * HU * 0.5, HB.h * HU * 0.5, 3, (q) => {
      q.scale(HU * 0.5, HU * 0.5); q.translate(-HB.x, -HB.y);
      const P = hparts();
      q.fillStyle = "#000";
      q.fill(P.back); q.fill(P.thumb); q.fill(P.idx); for (const c of P.curl) q.fill(c.p);
      q.fillRect(-30, 0, 60, 160);
    });
  });
}
function drawHand7(g, t, tipX, tipY) {
  const reach = K.ease.out(K.seg(t, 66.6, 69.1));
  const pull = K.ease.inOut(K.seg(t, 71.5, 73.8)); // contact held 69.1-71.5
  const ang = -2.25, th = ang + Math.PI / 2;
  const lx = IDX_TIP[0] * HU, ly = IDX_TIP[1] * HU;
  const ox = lx * Math.cos(th) - ly * Math.sin(th), oy = lx * Math.sin(th) + ly * Math.cos(th);
  // the finger presses in a touch, then eases off
  const press = K.env(t, 69.0, 71.6, 0.15, 0.4) * 2;
  const wx = tipX - ox + (1 - reach) * 160 + pull * 90 + press * 0.6;
  const wy = tipY - oy + (1 - reach) * 260 + pull * 180 + press;
  const gap = 1 - reach + pull; // distance of the hand off the paper
  // its shadow on the paper: the candles are below-left, so it falls up and to the right, closing in
  // on the fingertip as the finger meets the paper
  const sh = handShadowSprite();
  g.save();
  g.globalAlpha = 0.42 * K.clamp(reach * 1.4) * (1 - pull * 0.6);
  g.translate(wx + 10 + gap * 70, wy - 8 - gap * 60); g.rotate(th);
  g.drawImage(sh, HB.x * HU, HB.y * HU, HB.w * HU, HB.h * HU);
  g.restore();
  g.save();
  g.translate(wx, wy); g.rotate(th);
  g.drawImage(handSprite(), HB.x * HU, HB.y * HU, HB.w * HU, HB.h * HU);
  // the glow of the print through the fingertip, stronger at contact
  const glowK = t > 69.1 ? 1 - pull * 0.8 : 0.4 * reach;
  g.globalCompositeOperation = "lighter";
  K.glow(g, IDX_TIP[0] * HU, (IDX_TIP[1] + 4) * HU, 16 * HU, "#ff8a40", 0.22 * glowK);
  g.restore();
  // contact: a dent in the paper (a crescent of shadow above the tip) and a ring of light spreading out
  if (t > 69.05 && pull < 0.6) {
    const k = K.clamp((t - 69.05) * 6) * (1 - pull / 0.6);
    g.save();
    g.fillStyle = `rgba(30,12,4,${(0.4 * k).toFixed(3)})`;
    g.beginPath(); g.ellipse(tipX + 3, tipY - 5, 9, 3.2, th, Math.PI, TAU); g.fill();
    const age = t - 69.1;
    if (age > 0 && age < 1.6) {
      const r = 8 + age * 55, a = (1 - age / 1.6) * 0.4;
      g.globalCompositeOperation = "lighter";
      g.strokeStyle = `rgba(255,190,110,${a.toFixed(3)})`; g.lineWidth = 1.6 * (1 - age / 1.6) + 0.4;
      g.beginPath(); g.ellipse(tipX, tipY, r, r * 0.9, 0, 0, TAU); g.stroke();
      K.glow(g, tipX, tipY, r * 0.8, "#ffb060", a * 0.3);
    }
    g.restore();
  }
}
function shot7Warm() {
  const out = POSTERS.filter(inR7).map((P) => () => posterSprite(P, R7.res));
  out.push(wallHiSprite, () => litPrintsSprite(0.35), handSprite, handShadowSprite);
  return out;
}

// Pre-warm: every costly cache is built ahead of the shot that needs it, ONE cache per frame, spread
// evenly across a window of the shot before (never on a cut). Builds are memoised, so this only decides
// WHEN a cache is first built; what is drawn never depends on it.
let WARM = null;
const WARMED = new Set();
function warmPlan() {
  if (WARM) return WARM;
  const mem = [driveBg, driveBlur, driveSharp, cctvBg, craterFar, craterFarBlur, craterNear];
  for (let i = 0; i < 12; i++) mem.push(() => driveScene(dummy(), 960, 540, 48.5 + i * 0.1));
  for (let i = 0; i < 17; i++) mem.push(() => cctvScene(dummy(), 960, 540, 51 + i * 0.07));
  for (let i = 0; i < 17; i++) mem.push(() => craterScene(dummy(), 960, 540, 53.5 + i * 0.07));
  WARM = [
    [2.5, 11.5, POSTERS.map((P) => () => posterSprite(P, 3))],
    [14, 23.5, NEAR(400, 175, 330, 120).map((P) => () => posterSprite(P, 5))],
    [24.5, 33.6, shot4Warm()],
    [44.6, 48.3, mem],
    [49, 55.6, shot6Warm()],
    [57, 65.6, shot7Warm()],
    [66.5, 73.6, shot8Warm()],
  ];
  return WARM;
}
const CUTS = [48.5, 51, 53.5, 56, 66, 74];
function prewarm(t) {
  try {
    if (CUTS.some((c) => Math.abs(t - c) < 0.12)) return;
    const plan = warmPlan();
    for (let w = 0; w < plan.length; w++) {
      const [t0, t1, list] = plan[w];
      if (t < t0 || t >= t1 || !list.length) continue;
      const k = Math.min(list.length - 1, Math.floor(((t - t0) / (t1 - t0)) * list.length));
      for (let i = 0; i <= k; i++) {
        const id = w * 1000 + i;
        if (WARMED.has(id)) continue;
        WARMED.add(id);
        list[i]();
        return;
      }
    }
  } catch (e) { /* warm-up is optional */ }
}

function frame(g, W, H, t) {
  if (t < 12) {
    // 1. slow dolly into the dim, dusty shop, through the half-raised shutter
    const p = K.ease.inOut(K.seg(t, 0, 12));
    shop(g, W, H, t, { x: K.lerp(468, 482, p), y: K.lerp(290, 262, p), zoom: K.lerp(1.0, 1.2, p), shakeT: t, shakeAmt: 1.3 }, {
      ambient: K.mix("#120c0e", "#1a1214", p), candle: 0.8, slats: 1, wallLit: 0.35, scatter: 0.1,
    });
    const q = K.ease.inOut(K.seg(t, 0, 7.5));
    if (q < 1) {
      g.save();
      const sc = 1 + q * 0.5;
      g.translate(W / 2, H / 2); g.scale(sc, sc); g.translate(-W / 2, -H / 2);
      g.globalAlpha = 1 - K.smooth(K.seg(q, 0.6, 1));
      g.drawImage(shutterSprite(), -q * 160, -q * 90, W, H);
      g.restore();
    }
  } else if (t < 24) {
    // 2. the wall: slow pan left to right, focus pulled onto the drawings
    const p = K.ease.inOut(K.seg(t, 12, 24));
    const boost = K.smooth(K.seg(t, 18, 22));
    const rack = 6 * (1 - K.smooth(K.seg(t, 12, 13.4)));
    const camX = K.lerp(250, 720, p);
    const paint = (gg) => shop(gg, W, H, t, { x: camX, y: 190, zoom: 2.05, shakeT: t, shakeAmt: 1.1 }, {
      ambient: K.mix("#1a1214", "#2a1e1e", K.smooth(K.seg(t, 12, 14))), res: 3, slats: 0.75, boost, wallLit: 1, candle: 1.1,
    });
    if (rack > 0.3) { const L = K.layer(W, H, "f16:rack"); paint(L.g); K.dof(g, L.canvas, rack); }
    else paint(g);
    // out-of-focus candles right in front of the lens (parallax: they slide faster than the wall)
    const shift = -(camX - 250) * 2.05 * 1.35;
    const lights = [];
    for (let i = 0; i < 6; i++) {
      const span = W + 340;
      const x = ((((60 + i * 175 + Math.sin(i * 3.1) * 40 + shift) % span) + span) % span) - 170;
      const fl = 0.85 + 0.15 * K.noise(t * 5 + i, i);
      lights.push({ x, y: 500 + (i % 2) * 34, r: 34 + (i % 3) * 8, color: i % 2 ? "#ffb060" : "#ff9a40", alpha: fl });
    }
    K.bokehLights(g, W, H, t, { lights, count: 0, blades: 7, alpha: 0.32 });
  } else if (t < 34) {
    // 3. close: where he hid them; where you found them
    const p = K.ease.inOut(K.seg(t, 24, 33.5));
    const row = [9, 10, 11, 12, 13].map(POSTER);
    const a = row[0], b = row[4];
    const cx = K.lerp(a.x + a.w * 0.5, b.x + b.w * 0.5, p);
    const cy = K.lerp(a.y + a.h * 0.62, b.y + b.h * 0.55, p);
    const hit = t >= 30 ? Math.exp(-(t - 30) * 2.5) : 0;
    const pulse = t >= 30 ? Math.exp(-(t - 30) * 3) : 0;
    const push = 1 + 0.03 * K.ease.out(K.seg(t, 30, 31.2));
    shop(g, W, H, t, { x: cx, y: cy, zoom: K.lerp(4.6, 3.6, p) * push, shakeT: t, shakeAmt: 0.8 + hit * 3 }, {
      ambient: "#3a2a24", res: 5, printGlow: 0.45, slats: 0.25, boost: K.smooth(K.seg(t, 29.8, 30.6)), wallLit: 1, iconFlash: pulse, candle: 1.2,
    });
  } else if (t < 48.5) {
    // 4. the Shadow steps out of the dark behind the candles, into their light
    shot4(g, W, H, t);
  } else if (t < 56) {
    // 5. flash cuts (warm memories, 2.5 s each): re-seeing it with the truth
    if (t < 51) {
      K.withCamera(g, W, H, { x: 480 + (t - 48.5) * 6, y: 270, zoom: 1.04, shakeT: t, shakeAmt: 1.4 }, () => driveScene(g, W, H, t));
    } else if (t < 53.5) { cctvScene(g, W, H, t); cctvPost(g, W, H, t); }
    else {
      const lead = K.lerp(470, 760, K.seg(t, 53.5, 56));
      const by = ridgeY(lead) - 34;
      K.withCamera(g, W, H, { x: K.lerp(600, 760, K.seg(t, 53.5, 56)), y: 320, zoom: 1.75, shakeT: t, shakeAmt: 1.2 }, () => {
        craterScene(g, W, H, t);
        const b = K.env(t, 54.7, 56, 0.08, 1.2);
        if (b > 0) {
          // the bell rings: warm light swells from Biscuit and washes over the kittens following him
          K.bellGlint(g, lead + 26, by, 10, t, { strength: 0.55 * b });
          const r = 30 + Math.max(0, t - 54.7) * 140;
          K.lightPool(g, lead - 40, ridgeY(lead) + 2, r, "#ffc070", { intensity: 0.22 * b, flat: 0.35 });
          K.glow(g, lead + 26, by, 40, "#ffc070", 0.18 * b);
        }
      });
      lightLeaks(g, W, H, t, 9, 0.7);
    }
  } else if (t < 66) {
    // 6. Sir Whiskers turns toward the window; far off, Biscuit at work
    shot6(g, W, H, t);
  } else if (t < 74) {
    // 7. close: your hand touches the last pawprint; the wall lights in a wave
    const P = POSTER(LAST);
    const [px, py] = printPos(P);
    const p = K.ease.inOut(K.seg(t, 66, 74));
    const waveR = t > 69.1 ? (t - 69.1) * 260 : null;
    const zoom = K.lerp(4.2, 3.0, p);
    let hand = null;
    shop(g, W, H, t, { x: K.lerp(P.x + P.w * 0.55, P.x + P.w * 0.5, p), y: K.lerp(P.y + P.h * 0.5, P.y + P.h * 0.6, p), zoom, shakeT: t, shakeAmt: 0.6 }, {
      ambient: "#2e2220", hiWall: true, waveR, wave0: [px, py], wallLit: 0.8, printGlow: 0.35, slats: 0.2, candle: 1.1, gold: K.smooth(K.seg(t, 69, 74)) * 0.45,
      after: (gg) => {
        if (t > 69.1) { const k = Math.exp(-(t - 69.1) * 1.6); K.glow(gg, px, py, 60, "#ff7a20", 0.3 * k + 0.08); }
        hand = gg.getTransform();
      },
    });
    // the hand (screen space, so it stays a believable size)
    const T = new DOMMatrix([hand.a, hand.b, hand.c, hand.d, hand.e, hand.f]);
    const sp = new DOMPoint(px, py).matrixTransform(T);
    const px2 = K.pixelScale();
    const tipX = sp.x / px2, tipY = sp.y / px2;
    drawHand7(g, t, tipX, tipY);
  } else {
    // 8. wide: the shop glowing gold; Sir Whiskers walks to the open door, sits in it and waits for you
    shot8(g, W, H, t);
  }
}

// ---- shot 8: the door ----------------------------------------------------------------------------------
const S8 = { x0: 520, y0: 432, x1: P3(RX + 4, RF, (DR.Z0 + DR.Z1) / 2)[0] - 2, y1: P3(RX + 4, RF, (DR.Z0 + DR.Z1) / 2)[1] + 1 };
// cat size follows depth (size ~ 1/Z, matched to shot 4: 66 at y = 420)
const sizeAtY = (y) => 66 * (y - VP[1]) / 170;
function s8State(t) {
  const wp = K.ease.inOut(K.seg(t, 74.3, 77.6));
  const x = K.lerp(S8.x0, S8.x1, wp), y = K.lerp(S8.y0, S8.y1, wp);
  const walking = wp > 0.01 && wp < 0.99;
  const sit = t > 77.9;
  const turn = sit ? Math.round(K.lerp(0.1, 0.85, K.smooth(K.seg(t, 78.1, 79.1))) * 8) / 8 : 0.1;
  return { x, y, size: Math.round(sizeAtY(y) * 2) / 2, walking, sit, turn, wp };
}
function shot8(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 74, 80));
  const S = s8State(t);
  const door = K.smooth(K.seg(t, 74, 76.2));
  shop(g, W, H, t, { x: K.lerp(560, 640, p), y: K.lerp(270, 282, p), zoom: K.lerp(1.04, 1.1, p), shakeT: t, shakeAmt: 0.8 }, {
    ambient: "#2e2220", waveR: 2000, wave0: [480, 200], gold: 0.55, door, candle: 1.2, bright: 1.2, slats: 0.5, wallLit: 1, scatter: 0.1, midBand: 1,
    mid: (gg) => {
      // his long shadow, thrown by the doorway light back across the boards toward us
      const len = S.size * (1.2 + 2.2 * K.smooth(K.seg(S.wp, 0.5, 1))) * door;
      if (len > 2) {
        gg.save();
        gg.translate(S.x, S.y + 1); gg.rotate(Math.PI * 0.93); gg.scale(1, 0.32);
        const sg = gg.createLinearGradient(0, 0, len, 0);
        sg.addColorStop(0, "rgba(8,4,2,0.6)"); sg.addColorStop(0.6, "rgba(8,4,2,0.25)"); sg.addColorStop(1, "rgba(8,4,2,0)");
        gg.fillStyle = sg; gg.beginPath(); gg.moveTo(0, -S.size * 0.35); gg.lineTo(len, -S.size * 0.8); gg.lineTo(len, S.size * 0.8); gg.lineTo(0, S.size * 0.35); gg.closePath(); gg.fill();
        gg.restore();
      }
      K.shadowBlob(gg, S.x, S.y + 0.6, S.size * 0.55, S.size * 0.07, { alpha: 0.6 });
      whiskers(gg, W, H, S.x, S.y, S.size, t, { look: "door", pose: S.sit ? "sit" : S.walking ? "walk" : "stand", phase: (S.x - S8.x0) / (S.size * 1.6), facing: 1, headTurn: S.turn, blink: 0.4, still: S.walking ? 0 : 78 });
      // the doorway light wraps his outline
      if (S.wp > 0.9) K.glow(gg, S.x + S.size * 0.4, S.y - S.size * 0.9, S.size * 1.3, "#ffe7a8", 0.12 * door);
    },
  });
}
function shot8Warm() {
  const out = [doorBeamSprite];
  for (let q = 0; q < GAIT; q++) out.push(() => sirWalkSprite(q));
  const seen = new Set();
  for (let tt = 74; tt < 80; tt += 0.05) {
    const S = s8State(tt);
    if (S.walking) continue;
    const k = S.sit + ":" + S.turn + ":" + S.size;
    if (!seen.has(k)) { seen.add(k); out.push(() => whiskers(dummy(), 960, 540, S.x, S.y, S.size, tt, { look: "door", pose: S.sit ? "sit" : "stand", facing: 1, headTurn: S.turn, blink: 0.4, still: 78 })); }
  }
  return out;
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
  // candle-lit interior through the GPU lens; flash cuts get a faded, warm memory stock; CCTV is near-mono
  grade: { temp: 0.08, exposure: 0.95, hdr: 1.2, halation: 0.55, bloom: 0.4, contrast: 1.06, sat: 0.94, lift: [0.012, 0.007, 0.009], streak: 0.04, vignette: 0.45, grain: 0.055 },
  gradeAt(t) {
    if (t >= 48.5 && t < 56) {
      if (t >= 51 && t < 53.5) return { sat: 0.3, temp: 0, contrast: 1.0, grain: 0.13, halation: 0.2, bloom: 0.25, weave: 0.15, vignette: 0.55, lift: [0.03, 0.035, 0.03] };
      return { sat: 0.62, temp: 0.3, contrast: 0.92, lift: [0.045, 0.032, 0.018], grain: 0.1, vignette: 0.7, halation: 0.7, bloom: 0.5 };
    }
    if (t >= 56 && t < 66) return { temp: 0, bloom: 0.45, halation: 0.5 };
    if (t >= 74) return { temp: 0.14, exposure: K.lerp(0.95, 0.84, K.smooth(K.seg(t, 75, 77))), bloom: 0.45, halation: 0.6, threshold: 1.05 };
    if (t >= 66) return { temp: 0.12 };
    return {};
  },
  draw(g, t, W, H) {
    g.save();
    if (W !== 960 || H !== 540) g.scale(W / 960, H / 540);
    W = 960; H = 540;
    try {
      prewarm(t);
      frame(g, W, H, t);
      if (t >= 48.5 && t < 56) {
        memoryEdge(g, W, H);
        // a white flash on every cut
        const cut = Math.min(Math.abs(t - 48.5), Math.abs(t - 51), Math.abs(t - 53.5));
        K.fadeColor(g, W, H, 0.6 * Math.exp(-cut * 9), "#fff6e6");
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
