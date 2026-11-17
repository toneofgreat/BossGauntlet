// films/lib1820.js - shared painters for the last act (f18 "The Procession", f19 "The Bell", f20 "Home").
// Cloud stairs, dawn cloud seas, the crowd of found cats (side sprites + back-view sitters), the stone
// paw ring, and the small compositing helpers. Every painter is a pure function of its arguments;
// static art is cached through K.sprite / K.layer only. No timers, no storage.
import * as K from "../filmkit.js";

export const TAU = Math.PI * 2;

// ---- compositing ------------------------------------------------------------------------------------------
// Paint into an offscreen layer with the SAME transform as g (camera included), then composite with put().
export function inLayer(g, W, H, key, fn) {
  const L = K.layer(W, H, key);
  L.g.setTransform(g.getTransform());
  fn(L.g);
  return L;
}
export function put(g, W, H, L, alpha = 1, blur = 0, mode) {
  if (alpha <= 0.002) return;
  g.save();
  const px = K.pixelScale();
  g.setTransform(px, 0, 0, px, 0, 0);
  if (mode) g.globalCompositeOperation = mode;
  if (blur > 0.3) K.dof(g, L.canvas, blur, alpha);
  else { g.globalAlpha *= alpha; g.drawImage(L.canvas, 0, 0, W, H); }
  g.restore();
}
// Draw a whole shot with alpha (for cross-dissolves). The layer inherits g's transform.
export function xfade(g, W, H, a, key, fn) {
  if (a <= 0.002) return;
  if (a >= 0.998) { fn(g); return; }
  const L = K.layer(W, H, key);
  L.g.setTransform(g.getTransform());
  fn(L.g);
  put(g, W, H, L, a);
}
// Blur a group of painting (depth of field) - fn paints in g's current space.
export function soft(g, W, H, key, blur, fn, alpha = 1) {
  if (blur <= 0.3 && alpha >= 0.998) { fn(g); return; }
  const L = inLayer(g, W, H, key, fn);
  put(g, W, H, L, alpha, blur);
}

// ---- cats as cached sprites -------------------------------------------------------------------------------
// Cat sprites live in their own bounded cache (a crowd needs a few hundred, and the kit's shared sprite
// cache clears itself wholesale when it grows past 400). Sprites are baked facing right with a light
// from above-behind and mirrored for cats facing left, which halves the count.
const BUCKETS = [18, 36, 72];
const CATS = new Map();
function catCanvas(key, w, h, paint) {
  const px = K.pixelScale();
  const k = key + "@" + px;
  let c = CATS.get(k);
  // least-recently-used: a hit moves the sprite to the back of the eviction queue
  if (c) { CATS.delete(k); CATS.set(k, c); return c; }
  if (CATS.size > 420) { let n = 0; for (const kk of CATS.keys()) { CATS.delete(kk); if (++n >= 40) break; } }
  c = K.makeCanvas(w * px, h * px);
  const s = c.getContext("2d");
  s.setTransform(px, 0, 0, px, 0, 0);
  try { paint(s); } catch (err) { console.warn("[f18-20] cat sprite", key, err); }
  CATS.set(k, c);
  return c;
}
export function catSpriteReady(key) { return CATS.has(key + "@" + K.pixelScale()); }
function catBase(size) { return size <= 12 ? 18 : size <= 50 ? 36 : size <= 100 ? 72 : Math.ceil(size / 16) * 16; }
function catKey(o, key, steps, base) {
  const q = o.phase == null ? 0 : Math.floor(((((o.phase || 0) % 1) + 1) % 1) * steps);
  return { q, k: "c:" + key + ":" + q + "/" + steps + ":" + base };
}
function paintCatSprite(o, q, steps, base) {
  const SC = base < 40 ? 1.25 : 1; // sprites are only ever drawn at or below their bucket size: keep them small (canvas memory)
  const SW = base * 3.3, SH = base * 2.4, ox = SW * 0.48, oy = SH * 0.86;
  return {
    SW, SH, ox, oy, SC,
    paint: (s) => {
      s.scale(SC, SC);
      const oo = Object.assign({}, o, { facing: 1, phase: q / steps, t: o.t == null ? (q / steps) * 2.3 : o.t });
      delete oo.alpha;
      delete oo.hat;
      if (o.light) oo.light = { x: ox + (o.light.dx || 0) * 2000, y: oy - base * 0.8 + (o.light.dy || 0) * 2000, color: o.light.color, strength: o.light.strength };
      K.drawCat(s, ox, oy, base, oo);
      if (o.hat) {
        const H = o.pose === "sit" ? [16, -89] : [51, -73];
        const u = base / 60;
        coneHat(s, ox + (H[0] - 2) * u, oy + (H[1] - 13.5) * u, base * 0.42, 0.32, { rim: o.light && o.light.color });
      }
    },
  };
}
// spriteCat(g, x, y, size, o, key, steps) - o as drawCat, but o.light = {dx, dy, color, strength} (a direction).
export function spriteCat(g, x, y, size, o, key, steps = 8) {
  if (!(size > 0.5)) return;
  const base = catBase(size);
  if (base === 18) steps = Math.min(steps, 6);
  const { q, k } = catKey(o, key, steps, base);
  const P = paintCatSprite(o, q, steps, base);
  const spr = catCanvas(k, P.SW * P.SC, P.SH * P.SC, P.paint);
  const sc = size / base;
  const f = o.facing === -1 ? -1 : 1;
  g.save();
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  g.translate(x, y);
  g.scale(f * sc, sc);
  g.drawImage(spr, -P.ox, -P.oy, P.SW, P.SH);
  g.restore();
}
// Bake at most `budget` missing sprites from a wish list (for warming a crowd during the shot before).
// Only fills a cache; never changes what is drawn.
export function warmCats(list, budget = 1) {
  for (const w of list) {
    if (budget <= 0) return;
    const base = catBase(w.size);
    const steps = base === 18 ? Math.min(w.steps || 8, 6) : (w.steps || 8);
    const { q, k } = catKey(w.o, w.key, steps, base);
    if (CATS.has(k + "@" + K.pixelScale())) continue;
    const P = paintCatSprite(w.o, q, steps, base);
    catCanvas(k, P.SW * P.SC, P.SH * P.SC, P.paint);
    budget--;
  }
}
export { BUCKETS };

// Coats for the crowd (FILMS.md: grey, black, calico, cream, Siamese, tuxedo, plus a few more).
export const CROWD = [
  K.COATS.grey, K.COATS.black, K.COATS.cream, K.COATS.calico, K.COATS.tuxedo, K.COATS.siamese,
  { base: "#7a5e44", light: "#a88a6a", dark: "#4a3624", stripe: "#2e2216", tip: "#241a10", belly: "#c8b498", bib: false, socks: false, muzzle: true, iris: "#b8b04a", irisInner: "#d8c45a", bentEar: false },
  { base: "#e9e5df", light: "#fbfaf7", dark: "#c4beb4", stripe: "#d0c8bc", tip: "#c4bcb0", belly: "#f6f3ef", pattern: "solid", bib: false, socks: false, muzzle: false, iris: "#7fb0d8", irisInner: "#bcd8ee", nose: "#e0a0a0", innerEar: "#e8b0b0", bentEar: false },
  { base: "#6c727c", light: "#8e949c", dark: "#454a52", stripe: "#3e434a", tip: "#3a3e46", belly: "#7e848c", pattern: "solid", bib: false, socks: false, muzzle: false, iris: "#d8a832", irisInner: "#f0c64a", bentEar: false },
  { base: "#e2a868", light: "#f4cc94", dark: "#b07a40", stripe: "#a86a30", tip: "#9a5e28", belly: "#f6e2c4", bib: true, socks: "all", muzzle: true, stripeAlpha: 0.45, bentEar: false },
];

// ---- back-view sitting cat (for crowds that face the portal) ---------------------------------------------
// Painted once per coat/variant into a 100 x 130 sprite (sitting height 100) and scaled.
function backPath(v) {
  const p = new Path2D();
  // haunches + torso + head as one silhouette
  p.moveTo(50, 126);
  p.bezierCurveTo(18, 127, 14, 104, 20, 90);
  p.bezierCurveTo(25, 76, 30, 66, 33, 52);
  p.bezierCurveTo(34, 46, 37, 42, 40, 40);
  // head left side + ear
  p.bezierCurveTo(33, 36, 32, 27, 35, 21);
  p.lineTo(34, 6 + v * 2);
  p.quadraticCurveTo(36, 5 + v * 2, 37.5, 6.5 + v * 2);
  p.lineTo(45, 15);
  p.quadraticCurveTo(50, 13.6, 55, 15);
  p.lineTo(62.5, 6.5 - v);
  p.quadraticCurveTo(64, 5 - v, 66, 6 - v);
  p.lineTo(65, 21);
  p.bezierCurveTo(68, 27, 67, 36, 60, 40);
  p.bezierCurveTo(63, 42, 66, 46, 67, 52);
  p.bezierCurveTo(70, 66, 75, 76, 80, 90);
  p.bezierCurveTo(86, 104, 82, 127, 50, 126);
  p.closePath();
  return p;
}
function tailPath(up, side) {
  const p = new Path2D();
  const pts = up
    ? [50 + side * 6, 118, 50 + side * 24, 100, 50 + side * 30, 70, 50 + side * 27, 44, 50 + side * 20, 36]
    : [50 + side * 18, 122, 50 + side * 34, 124, 50 + side * 40, 116, 50 + side * 35, 108];
  K.tube(p, pts, up ? [7, 6, 5.2, 4.4, 3.6] : [7.5, 6.5, 5.5, 4.2], 5, true, true);
  return p;
}
export function catBackSprite(ci, o = {}) {
  const C = CROWD[((ci % CROWD.length) + CROWD.length) % CROWD.length];
  const v = o.v || 0, up = !!o.tailUp, side = o.side || 1;
  const rimC = o.rim || "#ffc6a8";
  // o.rimDir = [dx, dy] unit vector toward the light (quantised to 8 directions; null = all-round rim)
  const rq = o.rimDir ? Math.round(Math.atan2(o.rimDir[1], o.rimDir[0]) / (Math.PI / 4)) : null;
  const key = `l1820back:${ci % CROWD.length}:${v}:${up ? 1 : 0}:${side}:${rimC}:${o.amb || ""}:${rq}`;
  return K.sprite(key, 110, 134, (s) => {
    s.translate(5, 4);
    const body = backPath(v);
    const tail = tailPath(up, side);
    const all = new Path2D();
    all.addPath(body);
    all.addPath(tail);
    // base coat: darker low (in its own shadow), lighter on the shoulders
    const gr = s.createLinearGradient(0, 4, 0, 126);
    gr.addColorStop(0, K.mix(C.base, C.light, 0.25));
    gr.addColorStop(0.45, C.base);
    gr.addColorStop(1, K.mix(C.dark, "#000", 0.25));
    s.fillStyle = gr;
    s.fill(all);
    s.save();
    s.clip(all);
    // pattern
    if (C.pattern === "calico") {
      s.fillStyle = C.stripe; s.beginPath(); s.ellipse(36, 92, 16, 22, 0.3, 0, TAU); s.fill();
      s.fillStyle = C.patch2 || "#2a2420"; s.beginPath(); s.ellipse(64, 66, 12, 18, -0.4, 0, TAU); s.fill();
      s.beginPath(); s.ellipse(56, 22, 10, 9, 0, 0, TAU); s.fill();
    } else if (C.pattern === "points") {
      s.fillStyle = K.rgba(C.stripe, 0.85);
      s.beginPath(); s.ellipse(50, 24, 16, 16, 0, 0, TAU); s.fill();
      s.fill(tail);
    } else if (C.pattern !== "solid") {
      // mackerel stripes wrap around the back; a dark spine line
      s.strokeStyle = K.rgba(C.stripe, (C.stripeAlpha || 0.7) * 0.9);
      s.lineCap = "round";
      for (let i = 0; i < 9; i++) {
        const y = 44 + i * 8.5;
        const w = 14 + i * 2.6;
        s.lineWidth = 2.6 + (i % 2);
        s.beginPath();
        s.moveTo(50 - w * 1.5, y + 9);
        s.quadraticCurveTo(50 - w * 0.6, y - 1, 50, y + 2);
        s.quadraticCurveTo(50 + w * 0.6, y - 1, 50 + w * 1.5, y + 9);
        s.stroke();
      }
      s.lineWidth = 4;
      s.beginPath(); s.moveTo(50, 38); s.lineTo(50, 112); s.stroke();
      for (let i = 0; i < 4; i++) { s.lineWidth = 2; s.beginPath(); s.moveTo(42 + i * 5, 17); s.lineTo(43 + i * 4, 30); s.stroke(); }
    }
    // tuxedo/white points: nothing extra from behind; occlusion low in the fur
    const ao = s.createLinearGradient(0, 96, 0, 126);
    ao.addColorStop(0, "rgba(0,0,0,0)");
    ao.addColorStop(1, "rgba(0,0,0,0.38)");
    s.fillStyle = ao;
    s.fillRect(0, 90, 100, 40);
    // the cat's own round form: darker flanks
    const fl = s.createLinearGradient(14, 0, 86, 0);
    fl.addColorStop(0, "rgba(0,0,0,0.32)");
    fl.addColorStop(0.3, "rgba(0,0,0,0)");
    fl.addColorStop(0.7, "rgba(0,0,0,0)");
    fl.addColorStop(1, "rgba(0,0,0,0.32)");
    s.fillStyle = fl;
    s.fillRect(0, 0, 100, 130);
    if (o.amb) { s.globalCompositeOperation = "multiply"; s.fillStyle = o.amb; s.fillRect(0, 0, 100, 130); s.globalCompositeOperation = "source-over"; }
    s.restore();
    // fur edge: short strokes all round the silhouette
    const R = K.rng("backfur" + ci + v);
    s.strokeStyle = K.rgba(K.mix(C.base, C.light, 0.4), 0.7);
    s.lineWidth = 0.7;
    s.beginPath();
    const outline = [[20, 90], [26, 74], [32, 56], [36, 44], [34, 28], [66, 28], [64, 44], [68, 56], [74, 74], [80, 90], [82, 108], [18, 108]];
    for (let i = 0; i < 70; i++) {
      const a = outline[Math.floor(R() * outline.length)];
      const nx = a[0] < 50 ? -1 : 1;
      const x = a[0] + (R() - 0.5) * 6, y = a[1] + (R() - 0.5) * 10;
      s.moveTo(x, y);
      s.lineTo(x + nx * (1.5 + R() * 2.5), y - 1 - R() * 2);
    }
    s.stroke();
    // inner ear (the back of the ear is fur; a thin pale edge of the inner ear shows at the rim)
    if (rq == null) {
      // rim light: the light is ahead of the cat, so the whole silhouette edge glows
      K.crescent(s, all, 0, 3.2, rimC, 0.95, [10, 0, 92, 130], "lighter", 2);
      K.crescent(s, all, 2.4, 1.2, rimC, 0.55, [10, 0, 92, 130], "lighter", 1);
      K.crescent(s, all, -2.4, 1.2, rimC, 0.55, [10, 0, 92, 130], "lighter", 1);
    } else {
      // rim light only on the edges that face the light: a hot line plus a soft falloff, masked
      // by a gradient running from the light side across the body (never a sticker outline)
      const a = rq * (Math.PI / 4), lx = Math.cos(a), ly = Math.sin(a);
      const rimL = K.makeCanvas(110, 134);
      const r = rimL.getContext("2d");
      r.setTransform(1, 0, 0, 1, 5, 4);
      // soft wrap light across the lit flank
      r.save();
      r.clip(all);
      const wg = r.createLinearGradient(50 + lx * 50, 63 + ly * 63, 50, 63);
      wg.addColorStop(0, K.rgba(rimC, 0.45));
      wg.addColorStop(1, K.rgba(rimC, 0));
      r.fillStyle = wg;
      r.fillRect(-5, -4, 110, 134);
      r.restore();
      K.crescent(r, all, -lx * 5, -ly * 5, rimC, 1, [10, 0, 92, 130], "lighter", 3);
      K.crescent(r, all, -lx * 1.6, -ly * 1.6, K.mix(rimC, "#ffffff", 0.5), 1, [10, 0, 92, 130], "lighter", 1);
      r.setTransform(1, 0, 0, 1, 0, 0);
      r.globalCompositeOperation = "destination-in";
      const mg = r.createLinearGradient(55 + lx * 55, 67 + ly * 67, 55 - lx * 30, 67 - ly * 40);
      mg.addColorStop(0, "rgba(0,0,0,1)");
      mg.addColorStop(0.5, "rgba(0,0,0,0.75)");
      mg.addColorStop(1, "rgba(0,0,0,0)");
      r.fillStyle = mg;
      r.fillRect(0, 0, 110, 134);
      s.save();
      s.setTransform(1, 0, 0, 1, 0, 0);
      s.globalCompositeOperation = "lighter";
      s.drawImage(rimL, 0, 0);
      s.restore();
    }
  });
}
// catBack(g, x, y, h, ci, {v, tailUp, side, rim, alpha, rise, amb}) - x, y = ground point, h = sitting height.
function backOpts(x, y, h, o) {
  if (o.light && !o.rimDir) {
    const dx = o.light.x - x, dy = o.light.y - (y - h * 0.6), l = Math.hypot(dx, dy) || 1;
    return Object.assign({}, o, { rimDir: [dx / l, dy / l] });
  }
  return o;
}
// Bake at most `budget` of the back-view sprites a crowd will need (items = [[x, y, h, ci, o], ...]),
// for warming during the shot before a cut. Only fills the cache; never changes what is drawn.
const BACK_WARM = new Set();
export function warmBack(items, budget = 2) {
  for (const [x, y, h, ci, o] of items) {
    if (budget <= 0) return;
    const oo = backOpts(x, y, h, o || {});
    const rq = oo.rimDir ? Math.round(Math.atan2(oo.rimDir[1], oo.rimDir[0]) / (Math.PI / 4)) : null;
    const k = [((ci % CROWD.length) + CROWD.length) % CROWD.length, oo.v || 0, oo.tailUp ? 1 : 0, oo.side || 1, oo.rim || "", oo.amb || "", rq].join(":");
    if (BACK_WARM.has(k)) continue;
    BACK_WARM.add(k);
    catBackSprite(ci, oo);
    budget--;
  }
}
export function catBack(g, x, y, h, ci, o = {}) {
  if (h < 0.8) return;
  o = backOpts(x, y, h, o);
  const spr = catBackSprite(ci, o);
  const k = h / 100;
  const rise = K.clamp(o.rise || 0);
  g.save();
  if (o.alpha != null) g.globalAlpha *= K.clamp(o.alpha);
  // contact shadow
  if (o.shadow !== false && h > 6) {
    g.fillStyle = K.rgba(o.shadowColor || "#1a1630", 0.35);
    g.beginPath();
    g.ellipse(x, y, h * 0.42, h * 0.07, 0, 0, TAU);
    g.fill();
  }
  // standing up: stretch the body upward and narrow it a touch
  g.translate(x, y);
  g.scale(k * (1 - rise * 0.12), k * (1 + rise * 0.28));
  g.drawImage(spr, -55, -130, 110, 134);
  g.restore();
}

// ---- dawn sky ------------------------------------------------------------------------------------------
export function dawnSky(g, W, H, o) {
  K.sky(g, W, H, { top: o.top, mid: o.mid, bottom: o.bottom, horizon: o.horizon });
  if (o.band) {
    const hy = o.horizon * H;
    const gr = g.createLinearGradient(0, hy - H * 0.22, 0, hy + 4);
    gr.addColorStop(0, K.rgba(o.band, 0));
    gr.addColorStop(1, K.rgba(o.band, o.bandA == null ? 0.7 : o.bandA));
    g.fillStyle = gr;
    g.fillRect(-W, hy - H * 0.22, W * 3, H * 0.22 + 4);
  }
}

/// Soft cumulus from puffs, in two passes: a feathered silhouette in the shade colour, then each puff's
// lit cap (offset toward the light) painted source-atop, so crevices between puffs stay in shadow.
// puffs: [x, y, r, flat]
export function paintPuffs(s, puffs, pal, lx = 0.25, ly = -0.85, o = {}) {
  for (const [x, y, r, f = 1] of puffs) {
    s.save();
    s.translate(x, y);
    s.scale(1, f);
    const gr = s.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, K.rgba(pal.shade, 0.95));
    gr.addColorStop(0.5, K.rgba(pal.shade, 0.8));
    gr.addColorStop(1, K.rgba(pal.shade, 0));
    s.fillStyle = gr;
    s.beginPath(); s.arc(0, 0, r, 0, TAU); s.fill();
    s.restore();
  }
  s.save();
  s.globalCompositeOperation = "source-atop";
  const capA = o.cap == null ? 0.8 : o.cap;
  for (const [x, y, r, f = 1] of puffs) {
    s.save();
    s.translate(x + lx * r * 0.28, y + ly * r * 0.28 * f);
    s.scale(1, f);
    const gr = s.createRadialGradient(lx * r * 0.25, ly * r * 0.25, 0, 0, 0, r);
    gr.addColorStop(0, K.rgba(pal.lit, capA));
    gr.addColorStop(0.5, K.rgba(K.mix(pal.lit, pal.mid, 0.5), capA * 0.55));
    gr.addColorStop(1, K.rgba(pal.mid, 0));
    s.fillStyle = gr;
    s.beginPath(); s.arc(0, 0, r, 0, TAU); s.fill();
    s.restore();
  }
  s.restore();
}
// A cloud-bank sprite (wide, 420 x 150): a dome of soft puffs with a flat, shadowed base.
function bankSprite(seed, pal, big = 0) {
  return K.sprite(`l1820bank3:${seed}:${pal.key}:${big}`, 420, 150, (s) => {
    const R = K.rng("bank" + seed + ":" + big);
    const puffs = [];
    // near banks (big) are built from fewer, much larger billows (2-3x) so the cloud sea has scale:
    // small popcorn far away, heavy rolling masses close to the lens
    const n = big ? 13 : 34, rs = big ? 2.4 : 1;
    for (let i = 0; i < n; i++) {
      const u = 0.06 + R() * 0.88;
      const bump = Math.pow(Math.sin(u * Math.PI), 0.9);
      const top = 126 - bump * (50 + R() * 34);
      const y = K.lerp(top, 120, Math.pow(R(), 2)) + (big ? 18 : 0);
      const r = (16 + R() * 22) * (0.55 + bump * 0.7) * rs * (big ? 0.62 + R() * 0.38 : 1);
      const fl = big ? 0.62 : 0.8;
      const rr = big ? Math.min(r, (y - 4) / fl) : r;
      const xx = big ? K.clamp(u * 420, rr + 2, 418 - rr) : u * 420;
      puffs.push([xx, y, rr, fl]);
    }
    puffs.sort((a, b) => b[1] - a[1]);
    paintPuffs(s, puffs, pal, 0.3, -0.9);
    s.save();
    s.globalCompositeOperation = "destination-out";
    const bg = s.createLinearGradient(0, 106, 0, 146);
    bg.addColorStop(0, "rgba(0,0,0,0)");
    bg.addColorStop(1, "rgba(0,0,0,1)");
    s.fillStyle = bg;
    s.fillRect(0, 106, 420, 44);
    s.restore();
  });
}
// cloudRow(g, x0, x1, y, h, pal, seed, t, speed, alpha) - a row of banks (y = their base line).
export function cloudRow(g, x0, x1, y, h, pal, seed, t = 0, speed = 0, alpha = 1) {
  const w = h * 2.8, step = w * 0.55;
  const span = (x1 - x0) + w * 2;
  const n = Math.ceil(span / step) + 1;
  g.save();
  g.globalAlpha *= alpha;
  const off = ((t * speed) % step + step) % step;
  for (let i = 0; i < n; i++) {
    const k = i + Math.floor((t * speed) / step);
    const jitter = (K.hash(k, seed) - 0.5) * h * 0.25;
    const sc = 0.8 + K.hash(k + 0.3, seed) * 0.5;
    const x = x0 - w + i * step + off;
    const spr = bankSprite(((k % 5) + 5) % 5 + seed * 5, pal, h >= 110 ? 1 : 0);
    g.drawImage(spr, x - w * 0.5 * (sc - 1), y - h * sc + jitter, w * sc, h * sc * 1.0);
  }
  g.restore();
}

/// A cloud step: a flat-topped slab of cloud. Sprite 300 x 140: top face centred at (150, 46), ~250 wide.
// The tread is one soft, level surface (it must read as a step); billows only feather its rim and
// hang underneath as the riser, in shadow.
function stepSprite(seed, pal) {
  return K.sprite(`l1820step3:${seed}:${pal.key}`, 300, 140, (s) => {
    const R = K.rng("step" + seed);
    const puffs = [];
    for (let i = 0; i < 22; i++) {
      const u = R();
      const x = 40 + u * 220;
      const edge = 46 + Math.sqrt(Math.max(0, 1 - Math.pow((x - 150) / 122, 2))) * 24;
      puffs.push([x, edge + 2 + R() * 22, 14 + R() * 16, 0.85]);
    }
    for (let i = 0; i < 16; i++) {
      const a = R() * TAU;
      puffs.push([150 + Math.cos(a) * 112, 46 + Math.sin(a) * 22, 14 + R() * 12, 0.5]);
    }
    puffs.sort((a, b) => b[1] - a[1]);
    paintPuffs(s, puffs, pal, 0.15, -1, { cap: 0.6 });
    // the tread
    s.save();
    s.translate(150, 44);
    s.scale(1, 0.2);
    const tg = s.createRadialGradient(-10, -30, 8, 0, 0, 122);
    tg.addColorStop(0, K.rgba(K.mix(pal.lit, "#ffffff", 0.15), 0.95));
    tg.addColorStop(0.55, K.rgba(pal.lit, 0.88));
    tg.addColorStop(0.85, K.rgba(K.mix(pal.lit, pal.mid, 0.5), 0.6));
    tg.addColorStop(1, K.rgba(pal.mid, 0));
    s.fillStyle = tg;
    s.beginPath(); s.arc(0, 0, 122, 0, TAU); s.fill();
    s.restore();
    // a few soft lumps on the tread
    s.save();
    s.globalCompositeOperation = "source-atop";
    for (let i = 0; i < 14; i++) {
      const a = R() * TAU, d = Math.sqrt(R()) * 0.85;
      const x = 150 + Math.cos(a) * d * 110, y = 44 + Math.sin(a) * d * 20, r = 10 + R() * 14;
      const lg = s.createRadialGradient(x, y - r * 0.3, 0, x, y, r);
      lg.addColorStop(0, K.rgba("#ffffff", 0.16));
      lg.addColorStop(0.6, K.rgba(pal.mid, 0.08));
      lg.addColorStop(1, K.rgba(pal.mid, 0));
      s.fillStyle = lg;
      s.save(); s.translate(x, y); s.scale(1, 0.45); s.translate(-x, -y);
      s.beginPath(); s.arc(x, y, r, 0, TAU); s.fill();
      s.restore();
    }
    s.restore();
    s.save();
    s.globalCompositeOperation = "destination-out";
    const bg = s.createLinearGradient(0, 92, 0, 128);
    bg.addColorStop(0, "rgba(0,0,0,0)");
    bg.addColorStop(1, "rgba(0,0,0,1)");
    s.fillStyle = bg;
    s.fillRect(0, 92, 300, 48);
    s.restore();
  });
}
// cloudStep(g, x, y, w, pal, seed, alpha) - x, y = centre of the top face; w = top width.
export function cloudStep(g, x, y, w, pal, seed = 0, alpha = 1) {
  const spr = stepSprite(((seed % 6) + 6) % 6, pal);
  const k = w / 250;
  g.save();
  g.globalAlpha *= alpha;
  g.drawImage(spr, x - 150 * k, y - 46 * k, 300 * k, 140 * k);
  g.restore();
}

/// ---- the stone paw ring ---------------------------------------------------------------------------------
// The portal's five pieces (a pad and four toe-beans) as smooth, weathered carved stone. Each piece is
// baked once at its own resting angle so the light (cool sky above, warm horizon below-right) stays
// fixed in the world. lit(i) -> 0..1 amber.
function piecePath(kind, ang) {
  const p = new Path2D();
  const m = new DOMMatrix().translate(60, 60).rotate((ang * 180) / Math.PI);
  const q = new Path2D();
  if (kind) {
    q.ellipse(0, 0, 27, 37, 0, 0, TAU);
  } else {
    // pad: a dome toward the ring's outside, three soft lobes toward the centre
    q.moveTo(-44, 6);
    q.bezierCurveTo(-46, -30, 46, -30, 44, 6);
    q.bezierCurveTo(44, 26, 34, 34, 25, 30);
    q.bezierCurveTo(18, 40, -18, 40, -25, 30);
    q.bezierCurveTo(-34, 34, -44, 26, -44, 6);
    q.closePath();
  }
  p.addPath(q, m);
  return p;
}
function pieceSprite(kind, ang, frost) {
  const qa = Math.round(ang * 20) / 20;
  return K.sprite(`l1820piece:${kind}:${qa}:${frost}`, 120, 120, (s) => {
    const p = piecePath(kind, qa);
    const R = K.rng("piece" + kind + qa);
    const gr = s.createRadialGradient(48, 40, 4, 60, 62, 58);
    gr.addColorStop(0, "#7d859a");
    gr.addColorStop(0.45, "#4a5064");
    gr.addColorStop(1, "#191c2a");
    s.fillStyle = gr;
    s.fill(p);
    s.save();
    s.clip(p);
    // weathering: soft blotches and a few fine pits
    for (let i = 0; i < 40; i++) {
      const x = 14 + R() * 92, y = 14 + R() * 92, r = 3 + R() * 10;
      const bg = s.createRadialGradient(x, y, 0, x, y, r);
      const c = R() > 0.5 ? "20,22,34" : "150,160,182";
      bg.addColorStop(0, `rgba(${c},0.16)`);
      bg.addColorStop(1, `rgba(${c},0)`);
      s.fillStyle = bg;
      s.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 70; i++) {
      s.fillStyle = R() > 0.4 ? "rgba(12,14,24,0.4)" : "rgba(210,218,236,0.2)";
      s.fillRect(14 + R() * 92, 14 + R() * 92, 0.8 + R() * 1.2, 0.8 + R() * 1.2);
    }
    // a hairline crack
    s.strokeStyle = "rgba(8,10,18,0.6)";
    s.lineWidth = 0.9;
    let x = 44 + R() * 30, y = 40 + R() * 20;
    s.beginPath(); s.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 14; y += 4 + R() * 6; s.lineTo(x, y); }
    s.stroke();
    // core shadow low and toward the back
    s.restore();
    K.crescent(s, p, -5, -7, "#0c0e18", 0.55, [0, 0, 120, 120], "source-over", 3);
    // cool sky light on the top edge, warm horizon bounce low right
    K.crescent(s, p, 1.5, 3, "#c9d4ee", 0.55, [0, 0, 120, 120], "lighter", 2);
    K.crescent(s, p, -2.5, -1.5, "#ff9f98", 0.35, [0, 0, 120, 120], "lighter", 2);
    if (frost) {
      s.save();
      s.clip(p);
      const fg = s.createLinearGradient(0, 18, 0, 64);
      fg.addColorStop(0, "rgba(226,234,252,0.55)");
      fg.addColorStop(1, "rgba(226,234,252,0)");
      s.fillStyle = fg;
      s.fillRect(0, 0, 120, 64);
      for (let i = 0; i < 110; i++) {
        const fx = 14 + R() * 92, fy = 16 + Math.pow(R(), 1.8) * 56;
        s.fillStyle = `rgba(240,246,255,${0.25 + R() * 0.65})`;
        s.fillRect(fx, fy, 0.8 + R() * 1.2, 0.8 + R());
      }
      s.restore();
    }
  });
}
function pieceGlowSprite(kind, ang) {
  const qa = Math.round(ang * 20) / 20;
  return K.sprite(`l1820piecelit:${kind}:${qa}`, 120, 120, (s) => {
    const p = piecePath(kind, qa);
    // added (lighter) over the stone: warm light from inside, strongest at the heart and the edges
    const gr = s.createRadialGradient(58, 56, 2, 60, 60, 46);
    gr.addColorStop(0, "rgba(255,226,160,0.95)");
    gr.addColorStop(0.45, "rgba(255,150,60,0.6)");
    gr.addColorStop(0.85, "rgba(255,110,30,0.45)");
    gr.addColorStop(1, "rgba(255,190,110,0.8)");
    s.fillStyle = gr;
    s.fill(p);
    s.save();
    s.clip(p);
    // light glows out of the weathered surface unevenly
    const R = K.rng("piecelit" + kind + qa);
    for (let i = 0; i < 24; i++) {
      const x = 20 + R() * 80, y = 20 + R() * 80, r = 4 + R() * 9;
      const bg = s.createRadialGradient(x, y, 0, x, y, r);
      bg.addColorStop(0, "rgba(255,255,240,0.5)");
      bg.addColorStop(1, "rgba(255,255,240,0)");
      s.fillStyle = bg;
      s.fillRect(x - r, y - r, r * 2, r * 2);
    }
    s.restore();
  });
}
// stoneRing(g, x, y, r, t, {lit(i)->0..1, frost, tilt, rot, silver, glowScale}) - pieces ordered pad first.
export function stoneRing(g, x, y, r, t, o = {}) {
  const tilt = o.tilt == null ? 0.08 : o.tilt;
  const rot0 = o.rot == null ? -Math.PI / 2 : o.rot;
  if (o.dead) {
    // the dead gate: a cold, empty disc inside the ring
    g.save();
    g.translate(x, y);
    g.scale(1, 1 - tilt);
    const dg = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.86);
    dg.addColorStop(0, K.rgba("#121a3a", 0.4 * o.dead));
    dg.addColorStop(0.75, K.rgba("#121a3a", 0.4 * o.dead));
    dg.addColorStop(0.92, K.rgba("#1a2450", 0.3 * o.dead));
    dg.addColorStop(1, K.rgba("#121a3a", 0));
    g.fillStyle = dg;
    g.beginPath(); g.arc(0, 0, r * 0.86, 0, TAU); g.fill();
    g.restore();
  }
  const wob = Math.sin(t * 0.07) * 0.05;
  const silver = o.silver == null ? 1 : o.silver;
  const lit = o.lit || (() => 0);
  if (silver > 0) {
    g.save();
    g.translate(x, y);
    g.scale(1, 1 - tilt);
    g.strokeStyle = K.rgba("#cfd6e6", 0.16 * silver);
    g.lineWidth = r * 0.03;
    g.beginPath(); g.arc(0, 0, r * 0.93, 0, TAU); g.stroke();
    g.strokeStyle = K.rgba("#eef2fa", 0.42 * silver);
    g.lineWidth = Math.max(0.7, r * 0.005);
    g.beginPath(); g.arc(0, 0, r * 0.93, 0, TAU); g.stroke();
    g.restore();
  }
  // a paw: the big pad at the bottom centre, four smaller toe-beans in an arc above it
  // (o.rot, when given, rotates the whole paw; default pad straight down)
  const PAW = [Math.PI / 2, -Math.PI / 2 - 1.14, -Math.PI / 2 - 0.38, -Math.PI / 2 + 0.38, -Math.PI / 2 + 1.14];
  const spin = rot0 + Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    const base = PAW[i] + spin;
    const a = base + wob;
    const bob = Math.sin(t * 0.6 + i * 1.7) * r * 0.012;
    const kind = i === 0 ? 0 : 1;
    const rr = kind ? r * 0.95 : r * 0.9;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * (1 - tilt) + bob;
    const sz = r * (kind ? 0.27 : 0.42);
    const L = K.clamp(lit(i));
    const ang = base + Math.PI / 2;
    g.save();
    g.translate(px, py);
    g.rotate(wob);
    g.drawImage(pieceSprite(kind, ang, o.frost === false ? 0 : 1), -sz, -sz, sz * 2, sz * 2);
    if (L > 0.01) {
      g.globalAlpha *= L;
      g.globalCompositeOperation = "lighter";
      g.drawImage(pieceGlowSprite(kind, ang), -sz, -sz, sz * 2, sz * 2);
    }
    g.restore();
    if (L > 0.01) {
      const gs = o.glowScale == null ? 1 : o.glowScale;
      K.glow(g, px, py, sz * 3.4 * gs, "#ff9a3a", 0.45 * L);
      K.glow(g, px, py, sz * 1.4 * gs, "#ffe2a0", 0.6 * L);
    }
  }
}

// A soft pawprint spiral of light running round the ring (f19).
export function ringTrail(x, y, r, t0, t, tilt, n = 22, every = 0.18) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const appear = t0 + i * every;
    if (t < appear) break;
    const age = t - appear;
    const a = -Math.PI / 2 + (i / n) * TAU * 1.0;
    const rr = r * (1.08 + 0.05 * (i % 2 ? 1 : -1));
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * (1 - tilt), a: a + Math.PI, s: r * 0.07, alpha: Math.min(1, age * 3) * (0.55 + 0.45 * Math.exp(-age * 0.6)), flat: 0.9 });
  }
  return pts;
}

// ---- small bits -----------------------------------------------------------------------------------------
// A white-gold "ring of sound" wave.
export function soundRing(g, x, y, r, a, o = {}) {
  if (a <= 0.003 || r <= 0) return;
  g.save();
  g.globalCompositeOperation = "lighter";
  g.translate(x, y);
  g.scale(1, o.flat || 1);
  const w = o.width || r * 0.08;
  const gr = g.createRadialGradient(0, 0, Math.max(0, r - w), 0, 0, r + w);
  const c = o.color || "#ffe9b8";
  gr.addColorStop(0, K.rgba(c, 0));
  gr.addColorStop(0.5, K.rgba(c, 0.55 * a));
  gr.addColorStop(1, K.rgba(c, 0));
  g.fillStyle = gr;
  g.beginPath(); g.arc(0, 0, r + w, 0, TAU); g.fill();
  g.restore();
}

// Party/cone hat painted over a cat's head (x, y = hat base centre).
export function coneHat(g, x, y, s, tiltA, o = {}) {
  g.save();
  g.translate(x, y);
  g.rotate(tiltA);
  const p = new Path2D();
  p.moveTo(-s * 0.32, 0);
  p.quadraticCurveTo(-s * 0.05, -s * 0.5, 0, -s);
  p.quadraticCurveTo(s * 0.05, -s * 0.5, s * 0.32, 0);
  p.quadraticCurveTo(0, s * 0.1, -s * 0.32, 0);
  const gr = g.createLinearGradient(-s * 0.32, 0, s * 0.32, 0);
  gr.addColorStop(0, o.dark || "#3a4a8a");
  gr.addColorStop(0.55, o.color || "#6f86d6");
  gr.addColorStop(1, o.dark || "#3a4a8a");
  g.fillStyle = gr;
  g.fill(p);
  g.save();
  g.clip(p);
  g.strokeStyle = o.stripe || "rgba(255,230,140,0.85)";
  g.lineWidth = s * 0.08;
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-s * 0.4, -s * 0.18 - i * s * 0.24); g.lineTo(s * 0.4, s * 0.02 - i * s * 0.24); g.stroke(); }
  g.restore();
  if (o.rim) { g.strokeStyle = K.rgba(o.rim, 0.7); g.lineWidth = s * 0.04; g.beginPath(); g.moveTo(s * 0.32, 0); g.quadraticCurveTo(s * 0.05, -s * 0.5, 0, -s); g.stroke(); }
  g.fillStyle = "#ffe6a0";
  g.beginPath(); g.arc(0, -s, s * 0.09, 0, TAU); g.fill();
  g.strokeStyle = "rgba(255,255,255,0.6)";
  g.lineWidth = s * 0.025;
  g.beginPath(); g.moveTo(-s * 0.28, 0); g.quadraticCurveTo(-s * 0.4, s * 0.25, -s * 0.2, s * 0.4); g.stroke();
  g.restore();
}

// Subtitle/voice helper: builds the subs + voice arrays from one list.
export function lines(list, def = { rate: 0.92, pitch: 1.0 }) {
  const subs = [], voice = [];
  for (const [a, b, text, v] of list) {
    subs.push([a, b, text]);
    voice.push([a, text, Object.assign({}, def, v || {})]);
  }
  return { subs, voice };
}

// ---- a level cloud plain in perspective (the plateau at the top of the stairs) ---------------------------
// pal = {key, g0, g1, g2, g3 (gradient far->near), lit, mid, shade, edge}
export function plainSprite(hz, pal, H = 540) {
  const w = 1500, h = H - hz + 140;
  return K.sprite("l1820plain:" + pal.key + ":" + hz, w, h, (s) => {
    const gr = s.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, pal.g0);
    gr.addColorStop(0.08, pal.g1);
    gr.addColorStop(0.45, pal.g2);
    gr.addColorStop(1, pal.g3);
    s.fillStyle = gr;
    s.fillRect(0, 4, w, h);
    const R = K.rng("plain" + hz);
    const puffs = [];
    for (let i = 0; i < 420; i++) {
      const d = Math.pow(R(), 0.8);
      puffs.push([R() * w, 6 + Math.pow(d, 1.8) * (h - 10), 9 + Math.pow(d, 1.8) * 95 * (0.6 + R() * 0.6)]);
    }
    puffs.sort((a, b) => a[1] - b[1]);
    for (const [x, y, r] of puffs) {
      s.save();
      s.translate(x, y);
      s.scale(1, 0.32);
      const g1 = s.createRadialGradient(0, 0, 0, 0, 0, r);
      g1.addColorStop(0, K.rgba(pal.shade, 0.5));
      g1.addColorStop(1, K.rgba(pal.shade, 0));
      s.fillStyle = g1;
      s.beginPath(); s.arc(0, r * 0.25, r, 0, TAU); s.fill();
      const g2 = s.createRadialGradient(r * 0.1, -r * 0.35, 0, 0, -r * 0.1, r * 0.9);
      g2.addColorStop(0, K.rgba(pal.lit, 0.32));
      g2.addColorStop(0.5, K.rgba(pal.mid, 0.25));
      g2.addColorStop(1, K.rgba(pal.mid, 0));
      s.fillStyle = g2;
      s.beginPath(); s.arc(0, -r * 0.1, r * 0.9, 0, TAU); s.fill();
      s.restore();
    }
    const eg = s.createLinearGradient(0, 0, 0, 40);
    eg.addColorStop(0, K.rgba(pal.edge, 0.75));
    eg.addColorStop(1, K.rgba(pal.edge, 0));
    s.fillStyle = eg;
    s.fillRect(0, 0, w, 40);
  });
}
export function plain(g, hz, pal, H = 540) {
  g.drawImage(plainSprite(hz, pal, H), -270, hz - 2, 1500, H - hz + 140);
}

// ---- you, the kid, toned down on the side away from the key light ---------------------------------------
// kidShaded(g, W, H, x, y, h, opts, shade, tint) - drawPerson into a layer, then tint toward `tint`.
export function kidShaded(g, W, H, x, y, h, opts, shade = 0.4, tint = "#2e2668", key = "l1820kid") {
  if (shade <= 0.01 || h < 30) { K.drawPerson(g, x, y, h, opts); return; }
  const L = inLayer(g, W, H, key, (q) => K.drawPerson(q, x, y, h, Object.assign({}, opts, { alpha: 1 })));
  L.g.save();
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  L.g.globalCompositeOperation = "source-atop";
  L.g.fillStyle = K.rgba(tint, shade);
  L.g.fillRect(0, 0, L.canvas.width, L.canvas.height);
  L.g.restore();
  put(g, W, H, L, opts.alpha == null ? 1 : opts.alpha);
}

// wind-blown ice motes (pure in t): streaks moving along +x
export function windMotes(g, W, H, t, o = {}) {
  const n = o.count || 60, seed = o.seed || 3, sp = o.speed || 160, col = o.color || "#dfe8ff";
  const [ax, ay, aw, ah] = o.area || [0, 0, W, H];
  g.save();
  g.strokeStyle = col;
  g.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const v = sp * (0.6 + K.hash(i, seed) * 0.8);
    const x = ax + (((K.hash(i + 0.3, seed) * aw + t * v) % aw) + aw) % aw;
    const y = ay + K.hash(i + 0.6, seed) * ah + Math.sin(t * 2 + i) * 6;
    // soft, slightly diagonal ice streaks of varied length (motion blur), dimmer when far
    const a = (o.alpha == null ? 0.5 : o.alpha) * 0.55 * (0.25 + 0.75 * K.hash(i + 0.9, seed));
    const len = v * (0.02 + K.hash(i + 0.4, seed) * 0.07);
    const dx = -len, dy = -len * 0.22;
    g.globalAlpha = a * 0.35;
    g.lineWidth = 1.8 + K.hash(i + 0.1, seed) * 2.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx, y + dy); g.stroke();
    g.globalAlpha = a;
    g.lineWidth = 0.5 + K.hash(i + 0.1, seed) * 0.7;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx * 0.8, y + dy * 0.8); g.stroke();
  }
  g.restore();
}

// ---- the brass bell, close (f19 / f20 hero prop) ----------------------------------------------------------
// A real jingle bell: a sphere with a darker shoulder ring where the two halves are crimped, ONE thin
// straight slit across the lower third ending in two small round holes, a lit specular band, and a
// loop on top. (x, y) = centre, size = diameter.
export function bell(g, x, y, size, o = {}) {
  const r = size / 2;
  const t = o.t || 0;
  const lx = o.lx == null ? -0.4 : o.lx, ly = o.ly == null ? -0.55 : o.ly;
  g.save();
  g.translate(x, y);
  if (o.rot) g.rotate(o.rot);
  // loop
  g.strokeStyle = "#7a5420";
  g.lineWidth = Math.max(0.8, r * 0.16);
  g.beginPath(); g.arc(0, -r * 1.08, r * 0.2, Math.PI * 0.9, Math.PI * 2.1); g.stroke();
  // body
  const bg = g.createRadialGradient(lx * r * 0.7, ly * r * 0.7, r * 0.05, 0, 0, r * 1.05);
  bg.addColorStop(0, "#fff0b8");
  bg.addColorStop(0.22, "#e8bb5a");
  bg.addColorStop(0.6, "#b07c2c");
  bg.addColorStop(0.9, "#5e3c12");
  bg.addColorStop(1, "#3a240a");
  g.fillStyle = bg;
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.save();
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.clip();
  // the crimped shoulder seam: a darker band round the equator (curved by the sphere)
  g.strokeStyle = "rgba(70,40,10,0.55)";
  g.lineWidth = Math.max(0.6, r * 0.09);
  g.beginPath(); g.ellipse(0, -r * 0.08, r * 1.0, r * 0.26, 0, 0, Math.PI); g.stroke();
  g.strokeStyle = "rgba(255,226,150,0.35)";
  g.lineWidth = Math.max(0.4, r * 0.04);
  g.beginPath(); g.ellipse(0, -r * 0.16, r * 1.0, r * 0.26, 0, 0.2, Math.PI - 0.2); g.stroke();
  // specular band: a soft bright arc along the lit side of the sphere
  g.globalCompositeOperation = "lighter";
  const sb = g.createLinearGradient(lx * r, ly * r, -lx * r * 0.2, -ly * r * 0.2);
  sb.addColorStop(0, "rgba(255,246,210,0)");
  sb.addColorStop(0.35, "rgba(255,246,210,0.55)");
  sb.addColorStop(0.55, "rgba(255,246,210,0)");
  g.fillStyle = sb;
  g.beginPath(); g.ellipse(lx * r * 0.25, ly * r * 0.25, r * 0.95, r * 0.6, Math.atan2(ly, lx) + Math.PI / 2, 0, TAU); g.fill();
  // warm bounce light from below
  const bl = g.createRadialGradient(r * 0.3, r * 0.9, 0, r * 0.3, r * 0.9, r * 0.8);
  bl.addColorStop(0, "rgba(255,170,90,0.35)");
  bl.addColorStop(1, "rgba(255,170,90,0)");
  g.fillStyle = bl;
  g.fillRect(-r, 0, r * 2, r);
  g.globalCompositeOperation = "source-over";
  // the slit: one thin straight dark cut across the lower third, ending in two small round holes
  const sy = r * 0.42, sw = r * 0.62;
  g.fillStyle = "rgba(24,12,2,0.92)";
  g.fillRect(-sw, sy - r * 0.035, sw * 2, r * 0.07);
  g.beginPath(); g.arc(-sw, sy, r * 0.085, 0, TAU); g.arc(sw, sy, r * 0.085, 0, TAU); g.fill();
  // lit lower lip of the slit
  g.strokeStyle = "rgba(255,214,140,0.45)";
  g.lineWidth = Math.max(0.4, r * 0.03);
  g.beginPath(); g.moveTo(-sw * 0.9, sy + r * 0.07); g.lineTo(sw * 0.9, sy + r * 0.07); g.stroke();
  g.restore();
  g.restore();
  const gl = o.glint == null ? 0.6 : o.glint;
  if (gl > 0) K.bellGlint(g, x + lx * r * 0.55, y + ly * r * 0.55, size * 0.7, t, { strength: gl });
}

// ---- a POV hand that reads as a real hand (f19 / f20) -------------------------------------------------------
// hand(g, x, y, size, o) - (x, y) = wrist, size = wrist -> fingertip px, o.angle = direction the fingers
// point (radians, screen; default up). o.pose 'pinch' (thumb + index pinch, others curled; seen from the
// thumb side) | 'cup' (palm-down, fingers relaxed and curling, seen from the side) | 'open' (relaxed,
// back of the hand). o.left mirrors. o.sleeve colour (false = none), o.light {x, y, color, strength}.
// Returns the pinch point (pinch) or the fingertip (other poses) in g's space.
const SKIN = { base: "#e8b89a", lite: "#f6d2b8", dark: "#b9806a", deep: "#8c5644", nail: "#f2d6cc" };
function fingerPath(pts, w) {
  const p = new Path2D();
  K.tube(p, pts, w, 5, true, true);
  return p;
}
export function hand(g, x, y, size, o = {}) {
  const u = size / 100;
  const ang = o.angle == null ? -Math.PI / 2 : o.angle;
  const mir = o.left ? -1 : 1;
  const pose = o.pose || "pinch";
  const sleeve = o.sleeve || "#e8b923";
  const rotA = ang + Math.PI / 2;
  const toW = (px, py) => {
    const c = Math.cos(rotA), s = Math.sin(rotA);
    const X = px * mir * u, Y = py * u;
    return [x + X * c - Y * s, y + X * s + Y * c];
  };
  // light direction in local space
  let L = { x: -0.5, y: -0.7 };
  if (o.light) {
    const c = Math.cos(-rotA), s = Math.sin(-rotA);
    let dx = o.light.x - x, dy = o.light.y - y;
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    L = { x: (dx * c - dy * s) * mir, y: dx * s + dy * c };
  }
  const rimC = (o.light && o.light.color) || "#fff0d8";
  const rimK = o.light ? K.clamp(o.light.strength == null ? 1 : o.light.strength, 0, 2) : 0.4;
  g.save();
  g.translate(x, y);
  g.rotate(rotA);
  g.scale(mir * u, u);
  const skinFill = (box) => {
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, hw = (box[2] - box[0]) / 2, hh = (box[3] - box[1]) / 2;
    const gr = g.createLinearGradient(cx + L.x * hw, cy + L.y * hh, cx - L.x * hw, cy - L.y * hh);
    gr.addColorStop(0, SKIN.lite);
    gr.addColorStop(0.45, SKIN.base);
    gr.addColorStop(1, SKIN.dark);
    return gr;
  };
  const part = (p, box, under) => {
    g.fillStyle = skinFill(box);
    g.fill(p);
    if (under) {
      g.save(); g.clip(p);
      g.fillStyle = under; g.fillRect(box[0] - 4, box[1] - 4, box[2] - box[0] + 8, box[3] - box[1] + 8);
      g.restore();
    }
    const bx = [box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 4];
    K.crescent(g, p, L.x * 3, L.y * 3, SKIN.deep, 0.32, bx, "source-over", 2);
    K.crescent(g, p, -L.x * 1.6, -L.y * 1.6, rimC, 0.28 * rimK, bx, "lighter", 2);
  };
  const nail = (tx, ty, a, w, l) => {
    g.save();
    g.translate(tx, ty); g.rotate(a);
    const ng = g.createLinearGradient(-w, 0, w, 0);
    ng.addColorStop(0, "#d8aa98"); ng.addColorStop(0.5, SKIN.nail); ng.addColorStop(1, "#c89684");
    g.fillStyle = ng;
    g.beginPath(); g.ellipse(0, 0, w, l, 0, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.beginPath(); g.ellipse(-w * 0.3, -l * 0.15, w * 0.25, l * 0.5, 0, 0, TAU); g.fill();
    g.strokeStyle = "rgba(140,80,64,0.5)"; g.lineWidth = 0.5;
    g.beginPath(); g.ellipse(0, 0, w, l, 0, 0, TAU); g.stroke();
    g.restore();
  };
  const crease = (x0, y0, x1, y1, bend, a = 0.45) => {
    g.strokeStyle = K.rgba(SKIN.deep, a); g.lineWidth = 0.7; g.lineCap = "round";
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + bend, x1, y1); g.stroke();
  };
  // sleeve (with a ribbed cuff) from the wrist back out of frame
  if (o.sleeve !== false) {
    const sl = o.sleeveLen || 240, sw = o.sleeveW || 1;
    const sp = new Path2D();
    sp.moveTo(-24 * sw, sl); sp.lineTo(-21 * sw, 10); sp.quadraticCurveTo(0, 3, 21 * sw, 10); sp.lineTo(26 * sw, sl); sp.closePath();
    const sg = g.createLinearGradient(-26 * sw, 0, 28 * sw, 0);
    sg.addColorStop(0, K.shade(sleeve, -0.4)); sg.addColorStop(0.4, sleeve); sg.addColorStop(1, K.shade(sleeve, -0.35));
    g.fillStyle = sg; g.fill(sp);
    g.save(); g.clip(sp);
    // soft drag folds along the sleeve
    g.strokeStyle = K.rgba(K.shade(sleeve, -0.5), 0.22); g.lineWidth = 2.2;
    for (let i = 0; i < 4; i++) { const y0 = 46 + i * 34; g.beginPath(); g.moveTo(-22 * sw, y0); g.quadraticCurveTo(0, y0 + 9, 22 * sw, y0 - 4); g.stroke(); }
    g.restore();
    g.strokeStyle = K.rgba(K.shade(sleeve, -0.5), 0.45); g.lineWidth = 0.8;
    g.beginPath();
    for (let i = 0; i < 9; i++) { const xx = (-19 + i * 4.8) * sw; g.moveTo(xx, 11); g.lineTo(xx * 1.03, 24); }
    g.stroke();
    g.fillStyle = K.rgba(K.shade(sleeve, -0.55), 0.35);
    g.fillRect(-22 * sw, 24, 45 * sw, 3);
  }
  let out;
  if (pose === "pinch") {
    // seen from the thumb side: palm faces +x, the back of the hand -x
    const curled = [
      { pts: [2, -40, 12, -46, 17, -40, 14, -32], w: [9, 8.6, 8, 7] },
      { pts: [4, -48, 15, -55, 21, -48, 18, -39], w: [9.6, 9, 8.4, 7.6] },
      { pts: [5, -54, 15, -61, 21, -55, 19, -47], w: [10, 9.6, 9, 8] },
    ];
    for (const f of curled) {
      part(fingerPath(f.pts, f.w), [0, -70, 30, -28], "rgba(120,60,50,0.18)");
      nail(f.pts[6] + 1.5, f.pts[7] - 1, 0.5, 2.6, 3.4);
    }
    const palm = new Path2D();
    K.spline(palm, [-13, 8, -16, -18, -15, -46, -8, -60, 4, -62, 12, -50, 15, -24, 14, 8], true);
    part(palm, [-16, -62, 16, 8]);
    g.save(); g.clip(palm);
    const pc = g.createLinearGradient(14, 0, 2, 0);
    pc.addColorStop(0, "rgba(140,80,64,0.45)"); pc.addColorStop(1, "rgba(140,80,64,0)");
    g.fillStyle = pc; g.fillRect(-20, -70, 40, 80);
    g.strokeStyle = "rgba(255,236,220,0.28)"; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-10, -6); g.quadraticCurveTo(-13, -30, -9, -54); g.stroke();
    g.restore();
    crease(-12, -2, 12, -2, 2, 0.35);
    // index finger: up from the knuckle, bending forward and down to the pinch
    const idx = [-7, -56, -3, -71, 6, -80, 16, -80, 22, -73];
    part(fingerPath(idx, [12.5, 11.5, 10.4, 9.6, 8.8]), [-14, -88, 28, -50]);
    nail(20, -78, 2.3, 3.2, 4.4);
    crease(-9, -70, 1, -74, -1.5);
    crease(9, -86, 12, -77, 1.5);
    K.glow(g, -10, -60, 6, "#fff2e2", 0.25, "source-over");
    // thumb: from the base of the palm, forward and up to meet the index tip
    const th = [-2, -10, 10, -28, 17, -46, 21, -60, 23, -68];
    part(fingerPath(th, [16, 13.5, 11.5, 10, 9]), [-10, -74, 32, -6]);
    nail(19.5, -63, -0.2, 3.4, 4.6);
    crease(13, -46, 23, -43, 1.5);
    out = toW(23, -72);
  } else if (pose === "cup") {
    // palm-down, seen from the side: fingers relaxed and slightly curled, stacked one behind another
    // (the little and ring fingers sit lower and curl more; the index is nearest and longest)
    const fingers = [
      { dx: 6, dy: 4, len: 0.78, sh: "rgba(110,56,44,0.34)" },
      { dx: 4, dy: 2, len: 0.9, sh: "rgba(110,56,44,0.24)" },
      { dx: 2, dy: 1, len: 0.98, sh: "rgba(110,56,44,0.12)" },
      { dx: 0, dy: 0, len: 0.94, sh: null },
    ];
    for (const f of fingers) {
      const k = f.len;
      const pts = [-3 + f.dx, -50 + f.dy, -4 + f.dx, -50 - 18 * k + f.dy, 1 + f.dx, -50 - 33 * k + f.dy, 9 + f.dx, -50 - 41 * k + f.dy, 15 + f.dx, -50 - 40 * k + 5 + f.dy];
      part(fingerPath(pts, [17, 15.5, 14, 12.6, 11.5]), [-16 + f.dx, -100, 28 + f.dx, -40], f.sh);
      crease(-11 + f.dx, -50 - 18 * k + f.dy, 0 + f.dx, -50 - 20 * k + f.dy, -1.5, 0.4);
      crease(-5 + f.dx, -50 - 33 * k + f.dy, 4 + f.dx, -50 - 31 * k + f.dy, -1, 0.35);
      if (!f.sh) nail(10, -50 - 41 * k - 1, 1.1, 4.4, 5.6);
    }
    const palm = new Path2D();
    K.spline(palm, [-14, 8, -18, -20, -15, -48, -6, -60, 8, -58, 16, -44, 19, -20, 17, 8], true);
    part(palm, [-19, -60, 19, 8]);
    g.save(); g.clip(palm);
    const pc = g.createLinearGradient(15, 0, 3, 0);
    pc.addColorStop(0, "rgba(140,80,64,0.5)"); pc.addColorStop(1, "rgba(140,80,64,0)");
    g.fillStyle = pc; g.fillRect(-20, -70, 40, 80);
    g.strokeStyle = "rgba(255,236,220,0.3)"; g.lineWidth = 1.3;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-9 + i * 1.5, -6); g.quadraticCurveTo(-12 + i * 2, -28, -9 + i * 2.5, -50); g.stroke(); }
    g.restore();
    for (let i = 0; i < 2; i++) K.glow(g, -13 + i * 2, -54 + i * 2, 6, "#fff2e2", 0.22, "source-over");
    // thumb, relaxed under the palm
    part(fingerPath([6, -10, 16, -26, 22, -42, 24, -54], [18, 15, 13, 11.5]), [-2, -62, 34, -2], "rgba(110,56,44,0.15)");
    nail(24.5, -51, 0.1, 4, 5);
    out = toW(15, -88);
  } else {
    // open, relaxed, back of the hand toward camera
    const F = [[-15, -46, -20, -72], [-6, -52, -8, -86], [3, -52, 4, -88], [11, -48, 15, -78]];
    for (const [x0, y0, x1, y1] of F) {
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      part(fingerPath([x0, y0, mx, my, x1, y1], [10, 9, 7.8]), [Math.min(x0, x1) - 8, y1 - 8, Math.max(x0, x1) + 8, y0 + 6]);
      nail(x1 + (x1 - mx) * 0.08, y1 + 3.5, Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2, 3.1, 4.4);
      crease(mx - 4, my, mx + 4, my, 1.2);
    }
    const palm = new Path2D();
    K.spline(palm, [-14, 8, -20, -24, -19, -48, -4, -56, 10, -54, 17, -44, 16, -20, 14, 8], true);
    part(palm, [-20, -56, 18, 8]);
    g.save(); g.clip(palm);
    g.strokeStyle = "rgba(255,236,220,0.28)"; g.lineWidth = 1.3;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-8 + i * 5, -4); g.lineTo(-14 + i * 8, -48); g.stroke(); }
    g.restore();
    part(fingerPath([-14, -8, -26, -24, -32, -38, -32, -48], [14, 11, 9.4, 8.4]), [-38, -54, -8, -2]);
    nail(-32, -45, -0.1, 3, 4.2);
    out = toW(4, -90);
  }
  g.restore();
  return out;
}
