// films/f10.js - Chapter 10 "So Close" (FILMS.md f10). Two-tone night on the crater rim of Mount
// Hairball: lava glow from below, cool moonlight on the rocks' top edges. Across the fire you see
// Biscuit, he answers your call, and then he walks away over the rim. Pure function of t.
//
// Realism pass: every rock surface is textured basalt lit by the lake (albedo x light, baked once
// into cached sprites); the lava lake is a baked crust/crack raster with blackbody colours; smoke
// and steam are drifting volumetric plumes (scrolling cloud noise in a plume mask, lit from
// below); the moon is a baked photographic disc with atmospheric extinction; people come from
// the kit's lit drawPerson, cats from the photographic drawCat. Lens look via film.grade.
import * as K from "../filmkit.js";

const D = 72;
const LAVA = "#ff6a2a", NIGHT = "#0e0b1a", MOON = "#9fb2ff";
const MOON_DIR = [0.55, -0.83]; // the moon is up and to the right in every shot
const sm = (a, b, x) => { const u = K.clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };

// ---- progressive bakes: a per-pixel raster filled a few rows per frame while an earlier shot plays,
// finished synchronously if a shot needs it first. Only the cache changes: the picture stays f(t).
const PBK = new Map();
function pbState(key, w, h, fn) {
  let s = PBK.get(key);
  if (!s) {
    const c = K.makeCanvas(w, h), cx = c.getContext("2d");
    s = { c, cx, img: cx.createImageData(w, h), y: 0, w, h, fn, done: false };
    PBK.set(key, s);
  }
  return s;
}
function pbStep(s, budget) {
  if (s.done) return;
  const t0 = performance.now(), out = [0, 0, 0, 0], D = s.img.data, w = s.w;
  s.x = s.x || 0;
  while (s.y < s.h) {
    const y = s.y;
    // in runs of 24 pixels so the time budget holds even when one row is expensive
    const x1 = Math.min(w, s.x + 24);
    for (let x = s.x; x < x1; x++) {
      out[3] = 255;
      s.fn(x / w, y / s.h, out, x, y);
      const i = (y * w + x) * 4;
      D[i] = out[0]; D[i + 1] = out[1]; D[i + 2] = out[2]; D[i + 3] = out[3];
    }
    s.x = x1;
    if (s.x >= w) { s.x = 0; s.y++; }
    if (performance.now() - t0 > budget) break;
  }
  if (s.y >= s.h) { s.cx.putImageData(s.img, 0, 0); s.done = true; s.img = null; }
}
function pbake(key, w, h, fn) { const s = pbState(key, w, h, fn); pbStep(s, Infinity); return s.c; }

// ---- alpha-derived rims (sprite builders only) -----------------------------------------------------
// furNoise: fine, broken, streaky noise (alpha) that breaks a rim into fur instead of a stroke
function furNoise() {
  return K.texBake("f10furnoise2", 96, 96, (u, v, out) => {
    const a = K.texFbm(u * 24, v * 9, 61, 3, 24, 9), b = K.texFbm(u * 7, v * 7, 62, 3, 7, 7);
    out[0] = out[1] = out[2] = 255;
    out[3] = 255 * K.clamp(0.55 + a * 1.1 + b * 0.45);
  });
}
// furRim(s, src, w, h, o): the backlit fur halo of a silhouette held in canvas `src` (device px,
// logical w x h, drawn at 0,0 of s). rim = alpha x (1 - blurred alpha shifted toward the light):
// width follows thickness (ears, tail and the back ridge glow, the underside goes dark), broken by
// fur noise; plus stray guard hairs on the lit edge. o: {dir, width, color, alpha, hairs, seed, soft}
function furRim(s, src, w, h, o) {
  const ps = K.pixelScale(), cw = src.width, ch = src.height;
  const wd = o.width || 2.5, dir = o.dir || MOON_DIR;
  const A = K.layer(w, h, "f10rimA");
  const a = A.g;
  a.setTransform(1, 0, 0, 1, 0, 0);
  a.drawImage(src, 0, 0);
  // graded and strictly one-sided: copies shifted toward the light at 1/3, 2/3 and the full width
  // eat the silhouette from the inside (a blur here would leak a rim onto every edge). Anything
  // thinner than the rim width (ears, the tail tip, guard fuzz) stays lit right through.
  a.globalCompositeOperation = "destination-out";
  for (const [k, al] of [[1, 1], [0.66, 0.5], [0.33, 0.35]]) {
    a.globalAlpha = al;
    a.drawImage(src, -dir[0] * wd * k * ps, -dir[1] * wd * k * ps);
  }
  a.globalAlpha = 1;
  a.globalCompositeOperation = "destination-in";
  const pat = a.createPattern(furNoise(), "repeat");
  if (pat && pat.setTransform && typeof DOMMatrix !== "undefined") pat.setTransform(new DOMMatrix([ps * 0.7, 0, 0, ps * 0.7, (o.seed || 0) * 17 % 96, 0]));
  a.fillStyle = pat || "#fff"; a.fillRect(0, 0, cw, ch);
  a.globalCompositeOperation = "source-in";
  a.fillStyle = o.color; a.fillRect(0, 0, cw, ch);
  a.globalCompositeOperation = "source-over";
  s.save();
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalCompositeOperation = "lighter";
  const al = o.alpha == null ? 0.8 : o.alpha;
  if (K.hasFilter() && o.soft !== 0) { s.filter = `blur(${K.qblur(((o.soft || 1.6) * ps).toFixed(2))}px)`; s.globalAlpha = al * 0.7; s.drawImage(A.canvas, 0, 0); s.filter = "none"; }
  s.globalAlpha = al; s.drawImage(A.canvas, 0, 0);
  s.restore();
  if (!o.hairs) return;
  // guard hairs: a fringe of stray hairs standing proud of the lit edge, densest along the top
  // (ears, back ridge, tail). The band just OUTSIDE the edge (silhouette pushed toward the light,
  // minus itself) masks a texture of short strands combed along the light direction. GPU-only:
  // no pixel readback.
  const hl = (o.hairLen || 3.2) * ps;
  const Hh = K.layer(w, h, "f10rimH");
  const c = Hh.g;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(src, dir[0] * hl, dir[1] * hl);
  c.drawImage(src, dir[0] * hl * 0.5 - dir[1] * ps, dir[1] * hl * 0.5 + dir[0] * ps);
  c.globalCompositeOperation = "destination-out";
  c.drawImage(src, 0, 0);
  c.globalCompositeOperation = "destination-in";
  const vg = c.createLinearGradient(0, 0, 0, ch);
  vg.addColorStop(0, "rgba(0,0,0,1)"); vg.addColorStop(0.55, "rgba(0,0,0,0.75)"); vg.addColorStop(1, "rgba(0,0,0,0.15)");
  c.fillStyle = vg; c.fillRect(0, 0, cw, ch);
  const hp = c.createPattern(hairTex(), "repeat");
  if (hp && hp.setTransform && typeof DOMMatrix !== "undefined") hp.setTransform(new DOMMatrix([ps * 0.5, 0, 0, ps * 0.5, (o.seed || 0) * 13 % 64, (o.seed || 0) * 7 % 64]));
  c.fillStyle = hp || "#fff"; c.fillRect(0, 0, cw, ch);
  c.globalCompositeOperation = "source-in";
  c.fillStyle = o.hairDark || "#07050a"; c.fillRect(0, 0, cw, ch);
  s.save();
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalAlpha = 0.85 * Math.min(1, o.hairs * 3);
  s.drawImage(Hh.canvas, 0, 0);
  c.fillStyle = o.color; c.fillRect(0, 0, cw, ch);
  s.globalCompositeOperation = "lighter";
  s.globalAlpha = 0.45 * al * Math.min(1, o.hairs * 3);
  s.drawImage(Hh.canvas, 0, 0);
  s.restore();
}
// hairTex: short strands combed along the moon direction (tileable, drawn once with paths)
function hairTex() {
  return K.sprite("f10hairtex", 128, 128, (s) => {
    const R = K.rng("hairtex");
    const a0 = Math.atan2(MOON_DIR[1], MOON_DIR[0]);
    s.lineCap = "round";
    for (let i = 0; i < 150; i++) {
      const x = R() * 128, y = R() * 128, a = a0 + (R() - 0.5) * 0.9, len = 3 + R() * 7;
      s.strokeStyle = `rgba(255,255,255,${(0.5 + R() * 0.5).toFixed(2)})`;
      s.lineWidth = 0.45 + R() * 0.5;
      for (const ox of [-128, 0, 128]) for (const oy of [-128, 0, 128]) {
        if (x + ox < -12 || x + ox > 140 || y + oy < -12 || y + oy > 140) continue;
        s.beginPath(); s.moveTo(x + ox, y + oy);
        s.quadraticCurveTo(x + ox + Math.cos(a) * len * 0.5 + (R() - 0.5), y + oy + Math.sin(a) * len * 0.5, x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
        s.stroke();
      }
    }
  });
}
// alphaRim(s, src, w, h, o): a soft light wrapping the silhouette edge facing o.dir (no fur noise)
function alphaRim(s, src, w, h, o) {
  const ps = K.pixelScale(), cw = src.width, ch = src.height, wd = o.width || 3, dir = o.dir;
  const A = K.layer(w, h, "f10rimB");
  const a = A.g;
  a.setTransform(1, 0, 0, 1, 0, 0);
  a.drawImage(src, 0, 0);
  a.globalCompositeOperation = "destination-out";
  if (K.hasFilter()) a.filter = `blur(${K.qblur((wd * 0.5 * ps).toFixed(2))}px)`;
  a.drawImage(src, -dir[0] * wd * ps, -dir[1] * wd * ps);
  a.filter = "none";
  a.globalCompositeOperation = "source-in";
  a.fillStyle = o.color; a.fillRect(0, 0, cw, ch);
  if (o.fade) { a.globalCompositeOperation = "destination-in"; a.setTransform(ps, 0, 0, ps, 0, 0); a.fillStyle = o.fade(a); a.fillRect(0, 0, w, h); }
  s.save();
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalCompositeOperation = "lighter";
  s.globalAlpha = o.alpha == null ? 0.8 : o.alpha;
  if (K.hasFilter()) { s.filter = `blur(${K.qblur(((o.soft || 1.5) * ps).toFixed(2))}px)`; s.drawImage(A.canvas, 0, 0); s.filter = "none"; }
  s.drawImage(A.canvas, 0, 0);
  s.restore();
}

// ---- cache warming: each builder owns a short time slot in an earlier shot ----------------------
// warmTick(t) runs the builders whose slot [at, at + 0.25) holds t (each only once), and gives the
// progressive bakes a few ms. A seek past a slot just builds lazily, as before.
const WARM_DONE = new Set();
let WARM = null;
let LAST_T = -1;
function warmTick(t, W, H) {
  // only during continuous forward playback (not on seeks, scrubs or a repeated still frame)
  const dt = t - LAST_T;
  LAST_T = t;
  if (!(dt > 0 && dt < 0.25)) return;
  if (!WARM) WARM = warmPlan(W, H);
  const ps = K.pixelScale();
  for (const [a, b, key, w, h, fn] of PROG) {
    if (t < a || t >= b) continue;
    const s = pbState(key, w, h, fn);
    if (!s.done) { pbStep(s, 4); break; }
  }
  for (let i = 0; i < WARM.length; i++) {
    const [at, fn] = WARM[i];
    if (t < at || t >= at + 0.25) continue;
    const id = i + "@" + ps;
    if (WARM_DONE.has(id)) continue;
    WARM_DONE.add(id);
    try { fn(); } catch (err) { console.warn("[f10] warm", err); }
  }
}

// ---- helpers ---------------------------------------------------------------------------------------
// a jagged ridge profile: [[x, y], ...] from x0 to x1
function ridgePts(x0, x1, y, amp, seed, freq = 0.012, step = 8, rough = 1) {
  const out = [];
  for (let x = x0; x <= x1 + step; x += step) {
    const n = K.fbm(x * freq, seed) * amp + K.noise(x * freq * 5.3, seed + 7) * amp * 0.12
      + (K.noise(x * 0.045, seed + 3) * 3.2 + K.noise(x * 0.11, seed + 5) * 1.4 - Math.max(0, K.noise(x * 0.021, seed + 9)) * 7) * rough;
    out.push([x, y + n]);
  }
  return out;
}
function ridgePath(pts, bottom) {
  const p = new Path2D();
  p.moveTo(pts[0][0], bottom);
  for (const q of pts) p.lineTo(q[0], q[1]);
  p.lineTo(pts[pts.length - 1][0], bottom);
  p.closePath();
  return p;
}
// litFill(s, path, box, o): a real material under real light, for sprite builders only. The
// surface albedo (a kit texture) is multiplied by the ambient colour, then each light adds
// albedo x light colour x its own falloff mask. o.lights: [{color, k (repeats, may be > 1), mask(c) -> fillStyle}]
function litFill(s, path, box, o = {}) {
  const x0 = Math.floor(box[0]), y0 = Math.floor(box[1]);
  const bw = Math.ceil(box[2] - x0), bh = Math.ceil(box[3] - y0);
  const A = K.layer(bw, bh, "f10litA");
  A.g.translate(-x0, -y0);
  const sc = o.scale || 200;
  const sd = o.seed || 1;
  K.texRect(A.g, o.tex || "lavarock", x0, y0, bw, bh, { scale: sc, scaleY: o.scaleY || sc, ox: (o.ox || 0) + sd * 41.7, oy: sd * 23.3, tex: { seed: 1 + (sd % 2), color: o.color } });
  s.save();
  s.clip(path);
  s.drawImage(A.canvas, x0, y0, bw, bh);
  s.globalCompositeOperation = "multiply";
  s.fillStyle = o.amb || "#3a3c50";
  s.fillRect(x0, y0, bw, bh);
  s.restore();
  for (const L of o.lights || []) {
    const B = K.layer(bw, bh, "f10litB");
    const c = B.g;
    c.drawImage(A.canvas, 0, 0, bw, bh);
    c.globalCompositeOperation = "multiply";
    c.fillStyle = L.color;
    c.fillRect(0, 0, bw, bh);
    c.globalCompositeOperation = "destination-in";
    if (L.paint) {
      // an arbitrary painted mask (e.g. a band that follows the crest), in its own layer
      const M = K.layer(bw, bh, "f10litM");
      M.g.translate(-x0, -y0);
      L.paint(M.g);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(M.canvas, 0, 0);
    } else {
      c.translate(-x0, -y0);
      c.fillStyle = L.mask(c);
      c.fillRect(-4000, -4000, 9000, 9000);
    }
    s.save();
    s.clip(path);
    s.globalCompositeOperation = "lighter";
    let k = L.k == null ? 1 : L.k;
    while (k > 0.01) { s.globalAlpha = Math.min(1, k); s.drawImage(B.canvas, x0, y0, bw, bh); k -= 1; }
    s.restore();
  }
}
const vGrad = (y0, y1, stops) => (c) => {
  const gr = c.createLinearGradient(0, y0, 0, y1);
  for (const [u, a] of stops) gr.addColorStop(u, `rgba(0,0,0,${a})`);
  return gr;
};
const rGrad = (x, y, r, sy, stops) => (c) => {
  c.translate(x, y); c.scale(1, sy); c.translate(-x, -y);
  const gr = c.createRadialGradient(x, y, 0, x, y, r);
  for (const [u, a] of stops) gr.addColorStop(u, `rgba(0,0,0,${a})`);
  return gr;
};
// thin moonlight on the crest: brighter on faces turned toward the moon (a few bucketed strokes)
function moonCrest(g, pts, a = 0.6, w = 1.4) {
  g.save();
  g.lineWidth = w;
  g.lineCap = "round";
  const buckets = [[], [], [], []];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1];
    const l = Math.hypot(dx, dy) || 1;
    const lit = K.clamp(-(dy * MOON_DIR[0] - dx * MOON_DIR[1]) / l);
    buckets[Math.min(3, Math.floor((0.15 + 0.85 * Math.pow(lit, 1.5)) * 4))].push(i);
  }
  g.globalCompositeOperation = "lighter";
  buckets.forEach((b, k) => {
    if (!b.length) return;
    g.strokeStyle = K.rgba(MOON, a * 0.4 * (k + 0.2) / 3.4);
    g.beginPath();
    for (const i of b) { g.moveTo(pts[i][0], pts[i][1] + 0.8); g.lineTo(pts[i + 1][0], pts[i + 1][1] + 0.8); }
    g.stroke();
  });
  g.restore();
}
// ridge(s, pts, bottom, o): textured basalt, moon-cool ambient, lava light rising from below,
// a moonlit crest. Sprite builders only.
function ridge(s, pts, bottom, o = {}) {
  let top = 1e9;
  for (const q of pts) top = Math.min(top, q[1]);
  const p = ridgePath(pts, bottom);
  const box = [pts[0][0], top - 2, pts[pts.length - 1][0], bottom];
  s.fillStyle = "#08060a";
  s.fill(p);
  const under = o.under == null ? 0.6 : o.under;
  const crestH = o.crestH || 22;
  litFill(s, p, box, {
    scale: o.scale || 160, scaleY: (o.scale || 160) * (o.squash || 0.55), seed: o.seed || 3, amb: o.amb || "#353a58",
    lights: [
      { color: "#ff7a3a", k: under * 2.2, mask: vGrad(top, bottom, [[0, 0.0], [0.45, 0.25], [1, 1]]) },
      // moonlight lands on the faces turned up to the sky: a band that FOLLOWS the crest (valleys
      // included), soft below, not a horizontal stripe at the highest peak
      { color: MOON, k: (o.moonA == null ? 0.7 : o.moonA) * 1.5, paint: (c) => {
        c.fillStyle = "#000"; c.fill(p);
        c.globalCompositeOperation = "destination-out";
        if (K.hasFilter()) c.filter = `blur(${K.qblur((crestH * 0.35).toFixed(1))}px)`;
        c.translate(MOON_DIR[0] * crestH * 0.5, crestH * 0.8);
        c.fill(p);
        c.filter = "none";
      } },
    ],
  });
  // pumice / scoria: vesicles (tiny pits with a lit lower lip) on near rock
  if (o.vesicles) {
    s.save(); s.clip(p);
    const R = K.rng("vesi" + (o.seed || 3));
    const n = Math.round((box[2] - box[0]) * (box[3] - box[1]) / 900 * o.vesicles);
    const pits = new Path2D(), lips = new Path2D();
    const crestAt = (x) => { let best = pts[0]; for (const q of pts) if (Math.abs(q[0] - x) < Math.abs(best[0] - x)) best = q; return best[1]; };
    for (let i = 0; i < n; i++) {
      const x = box[0] + R() * (box[2] - box[0]), y = box[1] + R() * Math.min(260, box[3] - box[1]);
      if (y < crestAt(x) + 7) continue;
      const r = 0.35 + R() * R() * 1.5;
      pits.moveTo(x + r, y); pits.ellipse(x, y, r, r * 0.7, 0, 0, K.TAU);
      lips.moveTo(x + r, y + r * 0.5); lips.ellipse(x, y + r * 0.45, r, r * 0.4, 0, 0, Math.PI);
    }
    s.fillStyle = "rgba(2,2,4,0.32)"; s.fill(pits);
    s.globalCompositeOperation = "lighter";
    s.fillStyle = "rgba(60,58,80,0.07)"; s.fill(lips);
    s.restore();
  }
  // depth haze toward the crest line (air between us and far rock)
  if (o.haze) {
    s.save(); s.clip(p);
    const hg = s.createLinearGradient(0, top, 0, bottom);
    // aerial perspective: the air in front of a far crest is moonlit (cool, lighter) up high and
    // lava-lit (warm) near its foot
    hg.addColorStop(0, K.rgba(o.hazeColor || "#3a4262", o.haze)); hg.addColorStop(0.55, K.rgba(o.hazeColor || "#3a4262", o.haze * 0.55)); hg.addColorStop(1, K.rgba(o.hazeLow || "#4a2220", o.haze * 0.45));
    s.fillStyle = hg; s.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
    s.restore();
  }
  moonCrest(s, pts, o.moonEdge == null ? 0.55 : o.moonEdge, o.edge || 1.4);
}

/// ---- the moon: a baked full-moon ALBEDO map (what a long lens records at night). The maria are
// soft, ragged multi-octave fbm fields at their real places (8-20% darker than the highlands,
// never inked shapes); young ray craters (Tycho low centre with long faint rays, Copernicus,
// Kepler, a hot Aristarchus point); fine crater speckle; limb darkening 1 - 0.25(1-mu)^2; a warm
// extinction tint toward the bottom (it hangs low over the lava haze). The core is clipped at
// ~0.95 so the LENS makes the glow: nothing here is a painted halo.
// [x, y, radius, weight] in disc units (y down): Procellarum, Imbrium, Serenitatis, Tranquillitatis,
// Crisium, Fecunditatis, Nectaris, Nubium, Humorum, Frigoris, Vaporum
const MARIA = [[-0.56, -0.02, 0.36, 0.95], [-0.62, 0.3, 0.2, 0.6], [-0.3, -0.42, 0.27, 1], [0.17, -0.38, 0.16, 1],
  [0.3, -0.06, 0.2, 0.95], [0.66, -0.25, 0.1, 1.05], [0.56, 0.15, 0.13, 0.75], [0.33, 0.3, 0.1, 0.6],
  [-0.16, 0.36, 0.16, 0.7], [-0.47, 0.44, 0.09, 0.75], [-0.05, -0.73, 0.1, 0.55], [0.18, -0.72, 0.09, 0.45], [0.0, -0.12, 0.08, 0.55]];
// young ray craters: [cx, cy, n rays, reach, strength, nucleus size]
const RAYC = [[-0.13, 0.7, 22, 1.5, 0.55, 0.022], [-0.27, -0.16, 12, 0.42, 0.32, 0.016], [-0.47, -0.13, 9, 0.26, 0.26, 0.012], [-0.68, -0.33, 6, 0.16, 0.2, 0.012]];
const RAYA = RAYC.map(([, , n], j) => Array.from({ length: n }, (_, i) => [((i + K.hash(i, 70 + j) * 0.8) / n) * K.TAU - Math.PI, 0.012 + K.hash(i, 80 + j) * 0.022, 0.35 + K.hash(i, 90 + j) * 0.65]));
function moonFn(u, v, out) {
  const dx = u * 2 - 1, dy = v * 2 - 1, d2 = dx * dx + dy * dy;
  if (d2 > 1.01) { out[3] = 0; return; }
  const d = Math.sqrt(d2), mu = Math.sqrt(Math.max(0, 1 - d2));
  // domain warp: bays, capes and lobes instead of round blobs
  const wx = K.texFbm(u * 3.1, v * 3.1, 48, 4) * 0.16, wy = K.texFbm(u * 3.1 + 9, v * 3.1, 49, 4) * 0.16;
  const qx = dx + wx, qy = dy + wy;
  let m = 0;
  for (const [mx, my, mr, mk] of MARIA) { const q = ((qx - mx) ** 2 + (qy - my) ** 2) / (mr * mr); if (q < 12) m += Math.exp(-q * 0.9) * mk; }
  // multi-octave fbm thresholded softly: ragged, frayed shores that fade over a wide band
  const n1 = K.texFbm(u * 7, v * 7, 41, 5), n2 = K.texFbm(u * 22, v * 22, 42, 3);
  const mare = sm(0.25, 0.85, m + n1 * 0.32 + n2 * 0.1);
  // inside a mare: darker cores, lighter ejecta-dusted patches
  const core = sm(0.6, 1.3, m + n1 * 0.2);
  // (the lens shoulder compresses the top end ~2:1, so these read as the 10-15% a camera records)
  const dark = mare * (0.2 + 0.1 * core + K.texFbm(u * 11 + 3, v * 11, 45, 3) * 0.05);
  // highlands: bright, mottled at several scales
  const hl = K.texFbm(u * 16, v * 16, 46, 4) * 0.035 + K.texFbm(u * 48, v * 48, 47, 2) * 0.02;
  // crater speckle at high sun: tiny bright rims and a few bright dots (no relief at full moon)
  let sp = 0;
  const c1 = K.texVoronoi(u * 40, v * 40, 53);
  if ((c1.id & 7) === 0) sp += sm(0.22, 0.1, c1.f1) * 0.05;
  const c2 = K.texVoronoi(u * 95, v * 95, 54);
  if ((c2.id & 3) === 0) sp += sm(0.2, 0.06, c2.f1) * 0.045;
  // rays: thin, faint, fading with distance from the crater; the nuclei are the brightest points
  let rays = 0;
  RAYC.forEach(([cx, cy, , reach, k, nuc], j) => {
    const rx = dx - cx, ry = dy - cy, rr = Math.hypot(rx, ry);
    if (rr > reach * 1.3) return;
    const ang = Math.atan2(ry, rx);
    let best = 0;
    for (const [a0, w, s] of RAYA[j]) { let da = Math.abs(ang - a0); if (da > Math.PI) da = K.TAU - da; best = Math.max(best, Math.exp(-((da / w) ** 2)) * s); }
    const fade = Math.exp(-rr / (reach * 0.42)) * sm(nuc * 1.5, nuc * 4, rr);
    rays += best * fade * (0.5 + 0.5 * K.texNoise(dx * 40, dy * 40, 9 + j)) * k * 0.22;
    // a bright ejecta collar and a slightly darker floor
    rays += (sm(nuc * 2.6, nuc * 0.9, rr) * 0.16 - sm(nuc * 0.8, 0, rr) * 0.05) * (k * 1.6);
  });
  let a = 0.9 + hl * 1.6 + sp * 1.5 - dark + rays * 1.4 * (1 - mare * 0.2);
  a *= 1 - 0.25 * (1 - mu) * (1 - mu);
  // the crater haze lies between: warmer and a touch dimmer toward the bottom of the disc
  const ext = sm(-0.4, 1.0, dy);
  const R = a * 1.0, G = a * (0.965 - ext * 0.06), B = a * (0.915 - ext * 0.15);
  const cap = 0.95;
  out[0] = 255 * Math.min(cap, R); out[1] = 255 * Math.min(cap, G); out[2] = 255 * Math.min(cap, B);
  // a ~1.2 px soft limb
  out[3] = 255 * K.clamp((1 - d) * (MOONRES / 2) / 1.2);
}
const MOONKEY = "f10moon12";
const MOONRES = 400;
function moonTex() { return pbake(MOONKEY, MOONRES, MOONRES, moonFn); }
// the disc only: the lens blooms and halates it (no painted aureole or halo)
function bigMoon(g, x, y, r) {
  g.drawImage(moonTex(), x - r, y - r, r * 2, r * 2);
}

// ---- cat silhouettes against the moon ------------------------------------------------------------
// silhouette(g, W, H, key, paint, o): paint into a small offscreen layer covering only o.box,
// darken it (source-atop gradient), add a lava underlight, and add rims made from the silhouette
// minus itself shifted away from each light. o.soft (px) blurs the rims into wrapped light.
function silhouette(g, W, H, key, paint, o = {}) {
  const b = o.box || [0, 0, W, H];
  const x0 = Math.floor(b[0]), y0 = Math.floor(b[1]);
  const w = Math.max(32, Math.ceil((b[2] - x0) / 32) * 32), h = Math.max(32, Math.ceil((b[3] - y0) / 32) * 32);
  const L = K.layer(w, h, key + (o.read ? "r" : "") + w + "x" + h, o.read ? { read: true } : undefined);
  const c = L.g;
  c.translate(-x0, -y0);
  c.save();
  if (o.read) K.cpuMode(() => paint(c)); else paint(c); // a painter that reads pixels back stays off the GPU
  c.restore();
  c.globalAlpha = 1;
  c.filter = "none";
  c.globalCompositeOperation = "source-atop";
  const dg = c.createLinearGradient(0, b[1], 0, b[3]);
  dg.addColorStop(0, K.rgba("#06040a", o.dark0 == null ? 0.7 : o.dark0));
  dg.addColorStop(1, K.rgba("#06040a", o.dark1 == null ? 0.55 : o.dark1));
  c.fillStyle = dg;
  c.fillRect(x0, y0, w, h);
  if (o.under) {
    const ug = c.createLinearGradient(0, b[3], 0, b[1]);
    ug.addColorStop(0, K.rgba(o.under, o.underA == null ? 0.45 : o.underA));
    ug.addColorStop(o.underSpread == null ? 0.45 : o.underSpread, K.rgba(o.under, 0.06));
    ug.addColorStop(1, K.rgba(o.under, 0));
    c.fillStyle = ug;
    c.fillRect(x0, y0, w, h);
  }
  c.globalCompositeOperation = "source-over";
  g.drawImage(L.canvas, x0, y0, w, h);
  const rims = o.rims || [];
  if (!rims.length) return L;
  const R = K.layer(w, h, key + "rim" + w + "x" + h);
  const ps = K.pixelScale();
  for (let i = 0; i < rims.length; i++) {
    const rim = rims[i];
    R.g.setTransform(1, 0, 0, 1, 0, 0);
    if (i > 0) R.g.clearRect(0, 0, R.canvas.width, R.canvas.height);
    R.g.globalCompositeOperation = "source-over";
    R.g.drawImage(L.canvas, 0, 0);
    R.g.globalCompositeOperation = "destination-out";
    R.g.drawImage(L.canvas, -rim.dx * ps, -rim.dy * ps);
    R.g.globalCompositeOperation = "source-in";
    R.g.fillStyle = rim.color;
    R.g.fillRect(0, 0, R.canvas.width, R.canvas.height);
    R.g.globalCompositeOperation = "source-over";
    g.save();
    g.globalCompositeOperation = "lighter";
    const a = rim.alpha == null ? 0.7 : rim.alpha;
    if (o.soft) {
      g.translate(x0, y0);
      K.dof(g, R.canvas, o.soft, a);
      g.globalAlpha *= a * 0.35;
      g.drawImage(R.canvas, 0, 0, w, h);
    } else {
      g.globalAlpha *= a;
      g.drawImage(R.canvas, x0, y0, w, h);
    }
    g.restore();
  }
}
/// foldEar(c, size, facing, ax, ay): sprite builders only. Biscuit's bent left ear has to read in a
// silhouette 60-120 px tall, where the kit's subtle fold vanishes. Find the two ear tips on the
// top contour of the painted silhouette (pixel readback, once per sprite), cut the top of the ear
// nearer the nose and hinge a flap from the cut that hooks forward and down: a clear notch.
function foldEar(c, size, facing, ax, ay) {
  const ps = K.pixelScale(), cv = c.canvas, W = cv.width, H = cv.height;
  const D = c.getImageData(0, 0, W, H).data;
  const top = new Int32Array(W).fill(H);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (D[(y * W + x) * 4 + 3] > 140) { top[x] = y; break; }
  const S = size * ps;
  const okX = (x) => facing * (x - ax * ps) > -0.25 * S && top[x] < ay * ps - 0.6 * S;
  let t1 = -1;
  for (let x = 0; x < W; x++) if (okX(x) && (t1 < 0 || top[x] < top[t1])) t1 = x;
  if (t1 < 0) return;
  // the other ear: the next peak with a real valley between
  let t2 = -1;
  for (let x = 0; x < W; x++) {
    const dd = Math.abs(x - t1);
    if (!okX(x) || dd < 0.07 * S || dd > 0.42 * S) continue;
    let valley = 0;
    for (let k = Math.min(x, t1); k <= Math.max(x, t1); k++) valley = Math.max(valley, top[k]);
    if (valley - top[x] < 0.035 * S) continue;
    if (t2 < 0 || top[x] < top[t2]) t2 = x;
  }
  // fold the ear on the nose side
  let tip = t1, other = t2;
  if (t2 >= 0 && facing * (t2 - t1) > 0) { tip = t2; other = t1; }
  const tipY = top[tip];
  let eh = 0.15 * S;
  if (other >= 0) {
    let valley = 0;
    for (let k = Math.min(tip, other); k <= Math.max(tip, other); k++) valley = Math.max(valley, top[k]);
    eh = K.clamp(valley - tipY, 0.08 * S, 0.22 * S);
  }
  const cutY = tipY + eh * 0.5;
  const half = other >= 0 ? Math.abs(other - tip) * 0.5 : eh * 0.7;
  // the ear's edges at the cut line
  let eL = tip, eR = tip;
  const row = Math.round(cutY);
  while (eL > tip - half && D[(row * W + eL - 1) * 4 + 3] > 140) eL--;
  while (eR < tip + half && D[(row * W + eR + 1) * 4 + 3] > 140) eR++;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = "destination-out";
  c.fillRect(tip - half, tipY - 4 * ps, half * 2, cutY - tipY + 4 * ps);
  c.globalCompositeOperation = "source-over";
  const i0 = (Math.min(H - 1, row + Math.round(2 * ps)) * W + tip) * 4;
  c.fillStyle = `rgb(${D[i0]},${D[i0 + 1]},${D[i0 + 2]})`;
  const fl = eh * 0.62, w0 = Math.max(eR - eL, 2 * ps);
  c.beginPath();
  c.moveTo(eL - facing * 0.3 * ps, cutY + ps);
  c.lineTo(eR + facing * 0.3 * ps, cutY + ps);
  c.quadraticCurveTo(eL + w0 * 0.5 + facing * fl * 0.6, cutY - fl * 0.25, eL + w0 * 0.5 + facing * fl, cutY + fl * 0.42);
  c.quadraticCurveTo(eL + w0 * 0.5 + facing * fl * 0.2, cutY + fl * 0.05, eL - facing * 0.3 * ps, cutY + ps);
  c.fill();
  c.restore();
}
// sharpRim(s, src, w, h, o): the light on the silhouette edges that face o.dir, strictly one-sided
// (src minus src shifted away from the light, no blur on the eroding copy, so no ring appears on
// the far edges), then softened as it is added. Sprite builders only.
function sharpRim(s, src, w, h, o) {
  const ps = K.pixelScale(), cw = src.width, ch = src.height, wd = o.width || 1, dir = o.dir;
  const A = K.layer(w, h, "f10rimS");
  const a = A.g;
  a.setTransform(1, 0, 0, 1, 0, 0);
  a.drawImage(src, 0, 0);
  a.globalCompositeOperation = "destination-out";
  a.drawImage(src, -dir[0] * wd * ps, -dir[1] * wd * ps);
  a.drawImage(src, -dir[0] * wd * ps * 0.5, -dir[1] * wd * ps * 0.5);
  a.globalCompositeOperation = "source-in";
  a.fillStyle = o.color; a.fillRect(0, 0, cw, ch);
  s.save();
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalCompositeOperation = "lighter";
  const al = o.alpha == null ? 0.6 : o.alpha;
  if (K.hasFilter() && o.soft) { s.filter = `blur(${K.qblur((o.soft * ps).toFixed(2))}px)`; s.globalAlpha = al * 0.6; s.drawImage(A.canvas, 0, 0); s.filter = "none"; }
  s.globalAlpha = al; s.drawImage(A.canvas, 0, 0);
  s.restore();
}
// A cat silhouette against the moon, painted ONCE into a sprite and stamped. Anchor = the ground
// point under the cat. Keys must encode every pose parameter that matters. Light on a black cat
// against a bright moon: near-black body, a broken backlit fur halo plus a 1 px light wrap on
// every edge that faces the moon, the lava's under-glow on the chin, chest and belly, and (for
// Biscuit) the bent ear exaggerated so it reads. o.split: also cut a head and a body sprite (soft
// seam) so a walk can bob the body and counter-bob the head.
function catSil(key, size, opts, o = {}) {
  const w = Math.ceil(size * 4.2), h = Math.ceil(size * 2.5) + 10;
  const ax = w / 2, ay = h - 10;
  const facing = opts.facing || 1;
  const sk = "f10cs2:" + key + ":" + Math.round(size);
  const spr = K.sprite(sk, w, h, (s) => {
    const paint = (c) => {
      const op = Object.assign({ t: 0, shadow: false, bell: false, autoBlink: false, breath: 0 }, opts);
      if (size < 90) K.drawCat(c, ax, ay, size, op);
      else { const k = size / 88; c.save(); c.translate(ax, ay); c.scale(k, k); K.drawCat(c, 0, 0, 88, op); c.restore(); }
      if (o.bent) foldEar(c, size, facing, ax, ay);
    };
    const rw = o.rimW || 1.4;
    const L = silhouette(s, w, h, "f10cstmp", paint, {
      box: [0, 0, w, h], dark0: o.dark0 == null ? 0.97 : o.dark0, dark1: o.dark1 == null ? 0.96 : o.dark1,
      under: LAVA, underA: o.underA == null ? 0.5 : o.underA, underSpread: 0.12, read: !!o.bent, // foldEar reads the pixels back
    });
    let sd = 0;
    for (let i = 0; i < key.length; i++) sd = (sd * 31 + key.charCodeAt(i)) % 997;
    furRim(s, L.canvas, L.W, L.H, { dir: MOON_DIR, width: rw * 1.9, color: o.rimColor || "#c8d4ff", alpha: o.rimA == null ? 0.85 : o.rimA, hairs: o.hairs == null ? 0.35 : o.hairs, seed: sd, soft: 1.4 });
    // the 1 px light wrap: the moon bends round every edge that faces it
    sharpRim(s, L.canvas, L.W, L.H, { dir: MOON_DIR, width: 1.0, color: "#d8e2ff", alpha: 0.5, soft: 0.5 });
    // the lake below lights the undersides: chin, chest, belly, paws
    sharpRim(s, L.canvas, L.W, L.H, { dir: [0.1, 1], width: rw * 1.2, color: "#ff7a36", alpha: 0.3, soft: 1.0 });
  });
  const cs = { spr, w, h, ax, ay };
  if (o.split) {
    // head region: a soft disc round the head (front-top of a walking cat)
    const hx = ax + facing * size * 0.98, hy = ay - size * 1.12, hr = size * 0.42;
    const mask = (c, inside) => {
      const gr = c.createRadialGradient(hx, hy, hr * 0.62, hx, hy, hr);
      gr.addColorStop(0, `rgba(0,0,0,${inside ? 1 : 0})`); gr.addColorStop(1, `rgba(0,0,0,${inside ? 0 : 1})`);
      c.globalCompositeOperation = "destination-in";
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
    };
    cs.head = K.sprite(sk + ":H", w, h, (s) => { s.drawImage(spr, 0, 0, w, h); mask(s, true); });
    // the body keeps the neck (no seam can open); only the head's solid core is cut out of it
    cs.body = K.sprite(sk + ":B", w, h, (s) => {
      s.drawImage(spr, 0, 0, w, h);
      s.globalCompositeOperation = "destination-out";
      s.beginPath(); s.arc(hx, hy, hr * 0.6, 0, K.TAU); s.fill();
    });
  }
  return cs;
}
function stampSil(g, cs, x, y, alpha = 1) {
  if (alpha <= 0.01) return;
  if (alpha < 1) { g.save(); g.globalAlpha *= alpha; }
  g.drawImage(cs.spr, x - cs.ax, y - cs.ay, cs.w, cs.h);
  if (alpha < 1) g.restore();
}

// ---- smoke, steam, embers ------------------------------------------------------------------------
// plume(g, t, x, y, w, h, o): a rising volumetric column. Two octaves of tiling cloud noise scroll
// upward at different speeds (so the billows evolve, not just slide), cut by a cached plume-shaped
// mask that widens and leans with height, then coloured by height: lit from the lava at its root,
// cooling to smoke-grey where it meets the stars. Anchor (x, y) = the root.
function plumeMask(v) {
  return K.sprite("f10pmask5" + v, 128, 256, (s) => {
    for (let i = 0; i < 40; i++) {
      const u = i / 39;
      const y = 246 - u * 190;
      const x = 64 + Math.sin(u * 3.1 + v) * 6 * u + u * u * 12 * (v === 1 ? -1 : 1);
      const r = 12 + u * 42;
      const gr = s.createRadialGradient(x, y, 0, x, y, r);
      const a = (1 - u * 0.7) * Math.min(1, u * 3 + 0.3) * 0.22;
      gr.addColorStop(0, K.rgba("#ffffff", a)); gr.addColorStop(0.55, K.rgba("#ffffff", a * 0.8)); gr.addColorStop(1, "rgba(255,255,255,0)");
      s.fillStyle = gr; s.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}
function plume(g, t, x, y, w, h, o = {}) {
  const pw = Math.ceil(w / 8) * 8, ph = Math.ceil(h / 8) * 8;
  // smoke is soft: render it at half resolution (a quarter of the pixels) and let the upscale filter it
  const L = K.layer(pw / 2, ph / 2, "f10plume" + pw + "x" + ph);
  const c = L.g;
  c.scale(0.5, 0.5);
  const seed = o.seed || 1, sp = o.speed || 16;
  const sc = (o.scale || 240) / 128;
  const pat = K.texPattern(c, "cloud", { seed: 30 + (seed % 3), cover: o.cover || 0.22 });
  if (pat.setTransform) pat.setTransform(new DOMMatrix([sc, 0, 0, sc, (seed * 37) % 128, -((t * sp) % (128 * sc))]));
  c.fillStyle = pat; c.fillRect(0, 0, pw, ph);
  const pat2 = K.texPattern(c, "cloud", { seed: 40 + (seed % 2), cover: 0.25 });
  const s2 = sc * 0.5;
  if (pat2.setTransform) pat2.setTransform(new DOMMatrix([s2, 0, 0, s2, (seed * 13) % 64 + t * 4, -((t * sp * 1.6) % (128 * s2))]));
  c.globalAlpha = 0.6;
  c.fillStyle = pat2; c.fillRect(0, 0, pw, ph);
  c.globalAlpha = 1;
  c.globalCompositeOperation = "destination-in";
  c.drawImage(plumeMask(seed % 3), 0, 0, pw, ph);
  c.globalCompositeOperation = "source-atop";
  const gr = c.createLinearGradient(0, ph, 0, 0);
  gr.addColorStop(0, o.under || "#ff8a3a"); gr.addColorStop(0.3, o.mid || "#7a3220"); gr.addColorStop(0.7, o.top || "#2a2228"); gr.addColorStop(1, o.top || "#2a2228");
  c.fillStyle = gr; c.fillRect(0, 0, pw, ph);
  c.globalCompositeOperation = "source-over";
  g.save();
  g.globalAlpha *= o.alpha == null ? 0.8 : o.alpha;
  g.drawImage(L.canvas, x - pw * 0.4, y - ph, pw, ph);
  if (o.boost) {
    // the smoke's underside right above the melt is lit hard: add the plume again, faded out upward
    const B = K.layer(pw / 2, ph / 2, "f10plumeB" + pw + "x" + ph);
    B.g.setTransform(1, 0, 0, 1, 0, 0);
    B.g.drawImage(L.canvas, 0, 0);
    B.g.globalCompositeOperation = "destination-in";
    const bgr = B.g.createLinearGradient(0, B.canvas.height, 0, 0);
    bgr.addColorStop(0, "rgba(0,0,0,1)"); bgr.addColorStop(0.3, "rgba(0,0,0,0.45)"); bgr.addColorStop(0.55, "rgba(0,0,0,0)");
    B.g.fillStyle = bgr; B.g.fillRect(0, 0, B.canvas.width, B.canvas.height);
    g.globalCompositeOperation = "lighter";
    g.globalAlpha *= o.boost;
    g.drawImage(B.canvas, x - pw * 0.4, y - ph, pw, ph);
  }
  g.restore();
}
function embers(g, W, H, t, o = {}) {
  const n = Math.round((o.count || 50) * 0.6), seed = o.seed || 4;
  const [ax, ay, aw, ah] = o.area || [0, 0, W, H];
  const spr = K.glowSprite("#ff8a3a");
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const sp = 18 + K.hash(i, seed) * 30;
    const life = ah + 40;
    const yy = ay + ah - (((t * sp + K.hash(i + 0.3, seed) * life) % life) + life) % life;
    const xx = ax + ((K.hash(i + 0.7, seed) * aw + K.noise(t * 0.4 + i, seed) * 50 + t * (o.wind == null ? 14 : o.wind)) % aw + aw) % aw;
    const fl = 0.5 + 0.5 * Math.sin(t * (5 + K.hash(i, 9) * 6) + i);
    const z = K.hash(i + 0.9, seed); // depth: far ones are small and dim
    const s = (o.size || 1.6) * (0.35 + z * 0.8) * (0.6 + K.hash(i + 0.1, seed) * 0.6);
    // a short motion streak (the shutter is open 1/48 s) with a hot core
    const vx = Math.cos(t * 0.4 + i) * 0.4, len = s * 0.6;
    g.globalAlpha = 0.3 * fl * (0.4 + z * 0.6);
    g.drawImage(spr, xx - s * 2.5, yy - s * 2.5, s * 5, s * 5 + len);
    g.globalAlpha = (0.35 + 0.45 * fl) * (0.4 + z * 0.6);
    g.fillStyle = "#ffd890";
    g.fillRect(xx - s * 0.4 + vx, yy - s * 0.4, s * 0.8, s * 0.8 + len);
  }
  g.restore();
}
// big out-of-focus embers drifting past the lens: real bokeh discs from the kit
function bokehEmbers(g, W, H, t, o = {}) {
  const n = o.count || 7, seed = o.seed || 21;
  const lights = [];
  for (let i = 0; i < n; i++) {
    const sp = 14 + K.hash(i, seed) * 18;
    const life = H + 200;
    const yy = H + 100 - (((t * sp + K.hash(i + 0.3, seed) * life) % life) + life) % life;
    const xx = ((K.hash(i + 0.7, seed) * W + K.noise(t * 0.2 + i, seed) * 80 + t * 10) % W + W) % W;
    lights.push({ x: xx, y: yy, r: (o.size || 16) * (0.6 + K.hash(i + 0.1, seed) * 0.8), color: i % 2 ? "#ff8a3a" : "#ffb060", alpha: 0.75 + 0.25 * Math.sin(t * 3 + i) });
  }
  K.bokehLights(g, W, H, t, { count: 0, lights, alpha: o.alpha == null ? 0.4 : o.alpha });
}

// ---- the lava lake: a baked raster (crust plates, incandescent seams, molten pools, hot shore)
// lakeShape(u, v) -> d: 0 at the centre, 1 at the shore, the shore line irregular (not an ellipse)
function lakeShape(u, v) {
  const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
  const a = Math.atan2(dy, dx);
  const wob = K.texFbm(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + 5, 21, 3) * 0.16 + K.texFbm(u * 9, v * 3, 22, 2) * 0.05;
  return Math.sqrt(dx * dx + dy * dy) * (1 - wob);
}
function lavaTex() {
  // crust plates whose seams open wider where the plates are big and the melt is hot (the centre),
  // hairline near the shore; molten pools; the outer band cooled to dark, ropy crust that fades
  // into the crater floor instead of ending on a hard rim.
  return K.texBake("f10lavalake7", 512, 128, (u, v, out) => {
    const d = lakeShape(u, v);
    if (d > 1) { out[3] = 0; return; }
    const depth = 0.3 + v * 0.7; // the far side is foreshortened
    const X = (u - 0.5) * 10 / depth, Z = 3 / depth;
    const wx = K.texFbm(X * 0.35, Z * 0.35, 7, 3) * 0.9;
    const vo = K.texVoronoi(X * 0.8 + wx, Z * 0.8 + wx, 11);
    const e1 = vo.f2 - vo.f1, id1 = vo.id;
    const vo2 = K.texVoronoi(X * 2.6 + wx, Z * 2.6 - wx, 12);
    const e2 = vo2.f2 - vo2.f1;
    const n = K.texFbm(X * 0.9, Z * 0.9, 5, 4) * 0.5 + 0.5;
    const big = ((id1 * 2654435761) >>> 0) % 1000 / 1000; // this plate's size class
    const hot = sm(1.0, 0.15, d);
    const cool = sm(0.6, 0.97, d);
    const cw = (0.012 + 0.05 * (0.35 + big * 0.65) * hot) * (0.75 + n * 0.5);
    const crack = Math.max(sm(cw, cw * 0.15, e1), sm(cw * 0.55, 0.0, e2) * 0.45 * sm(0.3, 0.6, n) * hot);
    const pool = (sm(0.6, 0.8, n) + (((id1 >>> 3) & 15) === 0 ? 0.55 : 0)) * hot * (1 - cool);
    const heat = Math.max(crack * (0.6 + n * 0.35) * (1 - cool * 0.85), K.clamp(pool) * (0.55 + n * 0.45));
    const c0 = [16, 8, 7], c1 = [120, 20, 6], c2 = [236, 86, 14], c3 = [255, 206, 120];
    let c;
    if (heat < 0.3) c = c0.map((q, i) => q + (c1[i] - q) * heat / 0.3);
    else if (heat < 0.7) c = c1.map((q, i) => q + (c2[i] - q) * (heat - 0.3) / 0.4);
    else c = c2.map((q, i) => q + (c3[i] - q) * (heat - 0.7) / 0.3);
    if (heat < 0.35) {
      // crust: rough, ropy near the shore, the glow of the melt showing through near open seams
      const r = K.texNoise(X * 7, Z * 7, 3) * 0.5 + 0.5;
      const rope = 0.5 + 0.5 * Math.sin(X * 6 + K.texFbm(X, Z * 3, 8, 2) * 5);
      const k = (0.5 + r * 0.6) * (1 - cool * 0.35) * (1 + cool * rope * 0.25);
      const seep = K.clamp(0.22 - e1) * hot;
      c = [c[0] * k + seep * 170, c[1] * k + seep * 34, c[2] * k + cool * 4];
    }
    out[0] = Math.min(255, c[0]); out[1] = Math.min(255, c[1]); out[2] = Math.min(255, c[2]);
    out[3] = 255 * sm(1.0, 0.82, d);
  });
}
// two states of the incandescent hot spots (emissive only): crossfaded so the lake pulses slowly
function lavaHot(k) {
  return K.texBake("f10lavahot2:" + k, 320, 80, (u, v, out) => {
    const d = lakeShape(u, v);
    if (d > 0.8) { out[3] = 0; return; }
    const depth = 0.3 + v * 0.7;
    const X = (u - 0.5) * 10 / depth, Z = 3 / depth;
    const n = K.texFbm(X * 0.55 + k * 7.3, Z * 0.55, 31 + k, 4) * 0.5 + 0.5;
    const a = sm(0.58, 0.85, n) * sm(0.8, 0.3, d);
    out[0] = 255; out[1] = 150 + a * 80; out[2] = 60 + a * 50; out[3] = 255 * a;
  });
}
function lavaLake(g, t, cx, cy, rx, ry) {
  const tex = lavaTex();
  // the crust creeps (one slow drift) and the whole lake breathes (convection surges)
  const drift = Math.sin(t * 0.05) * rx * 0.012;
  const surge = 0.85 + 0.15 * Math.sin(t * 0.9) * Math.sin(t * 0.37 + 1);
  g.drawImage(tex, cx - rx + drift, cy - ry, rx * 2, ry * 2);
  g.save();
  g.globalCompositeOperation = "lighter";
  // the emissive hot spots, two baked states crossfaded over ~12 s
  const ph = 0.5 + 0.5 * Math.sin(t * 0.52);
  g.globalAlpha = 0.55 * ph * surge; g.drawImage(lavaHot(0), cx - rx + drift, cy - ry, rx * 2, ry * 2);
  g.globalAlpha = 0.55 * (1 - ph) * surge; g.drawImage(lavaHot(1), cx - rx + drift, cy - ry, rx * 2, ry * 2);
  g.globalAlpha = 1;
  // fountaining spots where the crust tears (short-lived, white-hot)
  for (let i = 0; i < 5; i++) {
    const ph2 = (t * 0.3 + K.hash(i, 5)) % 1;
    const bx = cx + (K.hash(i, 6) - 0.5) * rx * 1.1, by = cy + (K.hash(i, 7) - 0.45) * ry * 0.9;
    const a = Math.sin(ph2 * Math.PI) ** 2;
    K.glow(g, bx, by, rx * 0.06 * (0.6 + ph2), "#ffe6a0", 0.7 * a);
    K.glow(g, bx, by - ry * 0.2, rx * 0.14, "#ff7a2a", 0.28 * a);
  }
  g.globalAlpha = 0.3 * surge;
  g.drawImage(tex, cx - rx + drift, cy - ry, rx * 2, ry * 2);
  g.restore();
  // the light the lake throws into the air above it
  K.glow(g, cx, cy - ry * 0.5, rx * 1.1, LAVA, 0.26 * surge);
  K.glow(g, cx, cy, rx * 0.6, "#ffb050", 0.14 * surge);
}

// ---- skies and backdrops (painted once; the camera moves over them) ----------------------------
function nightSky(g, W, H, horizon, glowAmt = 1) {
  K.sky(g, W, H, { top: "#040409", mid: NIGHT, bottom: "#2a1418", horizon: K.clamp(horizon / H, 0.05, 1), night: true, glow: "#a0482a" });
  // the crater lights the haze above it: warm, low, uneven
  const gg = g.createLinearGradient(0, horizon - 240, 0, horizon);
  gg.addColorStop(0, "rgba(255,106,42,0)"); gg.addColorStop(1, K.rgba("#c8501e", 0.2 * glowAmt));
  g.fillStyle = gg; g.fillRect(0, horizon - 240, W, 240);
}
function backdrop(key, W, H, paint) {
  return K.sprite("f10bd:" + key, W + 160, H + 160, (s) => { s.translate(80, 80); paint(s); });
}
function stampBackdrop(g, spr, W, H) { g.drawImage(spr, -80, -80, W + 160, H + 160); }

// ---- the wide crater (shots 1, 6) -----------------------------------------------------------------
function craterBack(W, H, o) {
  return K.sprite("f10crater3:" + o.moonX + ":" + o.moonY + ":" + o.moonR, W, H + 140, (g) => {
    g.translate(0, 100);
    nightSky(g, W, H + 300, 300, 1);
    K.stars(g, W, H, 10, 1.3, 0, { yMax: 270 });
    K.moon(g, o.moonX, o.moonY, o.moonR, { glow: 0.8, halo: "#8a9ad0" });
    const far = ridgePts(-20, W + 20, 262, 26, 3, 0.006);
    // far rim: small texture scale (distance), heavy air in front of it
    ridge(g, far, 360, { scale: 70, squash: 0.5, seed: 5, under: 0.6, moonA: 0.9, crestH: 12, haze: 0.34, moonEdge: 0.8, edge: 1 });
    // the inner walls, all the way down to the lake: basalt cut by gullies (the texture stretched
    // down the slope), lit from the lake below and falling off up the slope and to the sides
    const wallP = new Path2D();
    wallP.moveTo(-20, 300);
    for (const q of far) wallP.lineTo(q[0], q[1] + 3);
    wallP.lineTo(W + 20, 300);
    wallP.lineTo(W + 20, 410);
    wallP.lineTo(-20, 410);
    wallP.closePath();
    g.fillStyle = "#0a0608"; g.fill(wallP);
    litFill(g, wallP, [-20, 250, W + 20, 412], {
      scale: 260, scaleY: 34, seed: 9, amb: "#1e2032",
      lights: [
        { color: "#ff7030", k: 3.6, mask: rGrad(480, 350, 520, 0.5, [[0, 1], [0.35, 0.7], [0.75, 0.22], [1, 0.05]]) },
        { color: "#ffb070", k: 1.4, mask: rGrad(480, 346, 330, 0.3, [[0, 1], [1, 0]]) },
      ],
    });
    // occlusion where the far crest overhangs the wall, and a dark seam at the foot
    g.save(); g.clip(wallP);
    const og = g.createLinearGradient(0, 255, 0, 300);
    og.addColorStop(0, "rgba(4,3,6,0.7)"); og.addColorStop(1, "rgba(4,3,6,0)");
    g.fillStyle = og; g.fillRect(-20, 250, W + 40, 50);
    g.restore();
    // talus: lumps of fallen rock along the shore, each lit from the lake side only
    const R = K.rng("talus2");
    for (let i = 0; i < 46; i++) {
      const x = R() * W, y = 356 + R() * 34;
      const d = Math.abs(x - 480) / 300;
      if (d < 0.85 && y < 376) continue;
      const rw = 5 + R() * 12, rh = 2.5 + R() * 4;
      K.shadowBlob(g, x, y + rh * 0.6, rw, rh * 0.4, { alpha: 0.5 });
      const p = new Path2D(); K.ellipsePath(p, x, y, rw, rh);
      g.fillStyle = "#120a0a"; g.fill(p);
      g.save(); g.clip(p);
      g.fillStyle = K.rgba("#ff7a3a", 0.35 * (1 - Math.min(1, d) * 0.6));
      g.beginPath(); g.ellipse(x + (480 - x) * 0.02, y - rh * 0.4, rw * 0.9, rh * 0.5, 0, 0, K.TAU); g.fill();
      g.restore();
    }
  });
}
function craterFront(W, H) {
  return K.sprite("f10craterfront3", W, H + 140, (g) => {
    g.translate(0, 100);
    const near = ridgePts(-20, W + 20, 360, 12, 8, 0.01);
    // near scoria: dark, saturated, pitted; moonlight only on the very top edge
    ridge(g, near, H + 40, { scale: 120, squash: 0.5, seed: 13, under: 0.05, moonA: 0.55, amb: "#1a1a26", moonEdge: 0.95, edge: 1.4, crestH: 10, vesicles: 1.6 });
    // the lip faces the lake: the heat glow lands on it, strongest straight across from the lake
    g.save();
    g.clip(ridgePath(near, H + 40));
    g.globalCompositeOperation = "lighter";
    g.translate(480, 362); g.scale(1, 0.12);
    const lip = g.createRadialGradient(0, 0, 0, 0, 0, 430);
    lip.addColorStop(0, K.rgba("#ff7a3a", 0.42)); lip.addColorStop(0.5, K.rgba("#ff6a2a", 0.16)); lip.addColorStop(1, K.rgba("#ff6a2a", 0));
    g.fillStyle = lip; g.fillRect(-500, -400, 1000, 800);
    g.restore();
  });
}
// dy shifts the whole vista (crane)
function vista(g, t, W, H, o = {}) {
  const dy = o.dy || 0;
  const mo = { moonX: o.moonX || 790, moonY: o.moonY || 92, moonR: o.moonR || 20 };
  g.drawImage(craterBack(W, H, mo), 0, dy - 100, W, H + 140);
  lavaLake(g, t, 480, 344 + dy, 250, 26);
  // fume plumes off the lake, lit orange from beneath, drifting into the stars
  const lit = { under: "#ffa060", mid: "#a8442a", top: "#2a2630", boost: 0.8 };
  plume(g, t, 420, 352 + dy, 360, 430, { seed: 1, alpha: 0.9, speed: 14, ...lit });
  plume(g, t, 570, 352 + dy, 300, 360, { seed: 2, alpha: 0.75, speed: 12, scale: 200, ...lit });
  plume(g, t, 310, 356 + dy, 240, 280, { seed: 4, alpha: 0.6, speed: 10, scale: 180, ...lit });
  // hot air over the lake bends the far wall
  if (!o.noShimmer) K.heatShimmer(g, 230, 286 + dy, 500, 56, t, { amp: 1.1, band: 3 });
  g.drawImage(craterFront(W, H), 0, dy - 100, W, H + 140);
}

// ---- SHOT 1 [0-10] crane up out of the hatch --------------------------------------------------------
function hatchSprite() {
  // an open steel hatch ring with real thickness: brushed, scuffed steel on the top face, the inner
  // wall lit from the shaft below, bolts. Lit by the crater (warm, from beyond) and the moon (cool).
  return K.sprite("f10hatch3", 720, 260, (g) => {
    const hx = 360, hy = 120, RX = 300, RY = 80, rx = 268, ry = 64;
    // where the rock meets the rim: a tight contact shadow and a wider occlusion ring
    g.save();
    if (K.hasFilter()) g.filter = "blur(6px)";
    g.strokeStyle = "rgba(0,0,0,0.75)"; g.lineWidth = 16;
    g.beginPath(); g.ellipse(hx, hy + 18, RX + 4, RY + 3, 0, 0, K.TAU); g.stroke();
    if (K.hasFilter()) g.filter = "blur(2px)";
    g.strokeStyle = "rgba(0,0,0,0.9)"; g.lineWidth = 5;
    g.beginPath(); g.ellipse(hx, hy + 18, RX + 1, RY + 1, 0, 0.05, Math.PI - 0.05); g.stroke();
    g.restore();
    const outer = new Path2D();
    outer.ellipse(hx, hy + 18, RX, RY, 0, 0, Math.PI); outer.lineTo(hx - RX, hy); outer.ellipse(hx, hy, RX, RY, 0, Math.PI, 0, true); outer.closePath();
    g.fillStyle = "#0e1014"; g.fill(outer);
    K.texFill(g, "metal", outer, { scale: 200, scaleY: 60, alpha: 0.35, mode: "overlay", tex: { seed: 4 } });
    const ow = g.createLinearGradient(0, hy, 0, hy + RY + 18);
    ow.addColorStop(0, "rgba(0,0,0,0)"); ow.addColorStop(1, "rgba(0,0,0,0.7)");
    g.fillStyle = ow; g.fill(outer);
    const top = new Path2D();
    top.ellipse(hx, hy, RX, RY, 0, 0, K.TAU);
    top.ellipse(hx, hy, rx, ry, 0, 0, K.TAU);
    g.save(); g.clip(top, "evenodd");
    g.fillStyle = "#2a2d34"; g.fillRect(0, 0, 720, 260);
    K.texRect(g, "metal", 0, 0, 720, 260, { scale: 260, scaleY: 90, alpha: 0.9, tex: { seed: 4 } });
    g.globalCompositeOperation = "multiply";
    g.fillStyle = "#4a4e66"; g.fillRect(0, 0, 720, 260);
    g.globalCompositeOperation = "source-over";
    // years on a volcano: rust blooms and streaks, soot on the far side
    g.drawImage(rustTex(), 0, 0, 720, 260);
    // brushed rings
    g.strokeStyle = "rgba(255,255,255,0.03)"; g.lineWidth = 1;
    for (let k = 0; k < 14; k++) { g.beginPath(); g.ellipse(hx, hy, rx + k * 2.3, ry + k * 1.15, 0, 0, K.TAU); g.stroke(); }
    // the crater's glow lands on the far side; the moon gives a broad sheen on the right
    const os = g.createRadialGradient(hx, hy - RY, 10, hx, hy - RY, RX * 0.9);
    os.addColorStop(0, "rgba(255,110,50,0.4)"); os.addColorStop(1, "rgba(255,110,50,0)");
    g.globalCompositeOperation = "lighter"; g.fillStyle = os; g.fillRect(0, 0, 720, 260);
    const ms = g.createRadialGradient(hx + RX * 0.6, hy - RY * 0.5, 4, hx + RX * 0.6, hy - RY * 0.5, RX * 0.5);
    ms.addColorStop(0, "rgba(140,155,210,0.22)"); ms.addColorStop(1, "rgba(140,155,210,0)");
    g.fillStyle = ms; g.fillRect(0, 0, 720, 260);
    g.globalCompositeOperation = "source-over";
    g.restore();
    // the specular moon edge along the far-right lip
    g.save(); g.globalCompositeOperation = "lighter";
    g.strokeStyle = "rgba(140,155,220,0.5)"; g.lineWidth = 2; g.lineCap = "round";
    g.beginPath(); g.ellipse(hx, hy, RX - 3, RY - 1.5, 0, Math.PI * 1.6, Math.PI * 1.95); g.stroke();
    g.restore();
    // the shaft
    const shaft = new Path2D(); shaft.ellipse(hx, hy, rx, ry, 0, 0, K.TAU);
    g.save(); g.clip(shaft);
    g.fillStyle = "#050407"; g.fillRect(0, 0, 720, 260);
    const iw = new Path2D();
    iw.ellipse(hx, hy, rx, ry, 0, Math.PI, 0);
    iw.ellipse(hx, hy + 34, rx, ry, 0, 0, Math.PI, true);
    g.fillStyle = "#1a1a1e"; g.fill(iw);
    K.texFill(g, "metal", iw, { scale: 120, alpha: 0.5, mode: "overlay", tex: { seed: 6 } });
    const ig = g.createLinearGradient(0, hy - ry, 0, hy + 34);
    ig.addColorStop(0, "rgba(0,0,0,0.5)"); ig.addColorStop(1, "rgba(255,110,50,0.35)");
    g.globalCompositeOperation = "lighter"; g.fillStyle = ig; g.fill(iw);
    g.globalCompositeOperation = "source-over";
    g.strokeStyle = "rgba(0,0,0,0.4)"; g.lineWidth = 1.2;
    for (let k = 1; k < 4; k++) { g.beginPath(); g.ellipse(hx, hy + k * 9, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); }
    const sl = g.createRadialGradient(hx, hy + 50, 10, hx, hy + 40, rx);
    sl.addColorStop(0, "rgba(255,110,50,0.5)"); sl.addColorStop(1, "rgba(255,110,50,0)");
    g.globalCompositeOperation = "lighter"; g.fillStyle = sl; g.fillRect(0, 0, 720, 260);
    g.restore();
    // outer wall: rust streaks running down from the rim
    g.save(); g.clip(outer);
    g.globalAlpha = 0.8;
    g.drawImage(rustTex(), 0, 40, 720, 260);
    g.restore();
    // bolts: hand-set (uneven spacing, sizes, two missing), domed. The far lip's heads catch the
    // shaft's warm light from inside; the near ones only a faint cool moon glint
    for (let i = 0; i < 28; i++) {
      if (K.hash(i, 31) < 0.07) continue;
      const a = ((i + (K.hash(i, 32) - 0.5) * 0.35) / 28) * K.TAU;
      const rr = 3 + (K.hash(i, 33) - 0.5) * 1.1;
      const bx = hx + Math.cos(a) * ((RX + rx) / 2 + (K.hash(i, 34) - 0.5) * 2), by = hy + Math.sin(a) * (RY + ry) / 2;
      K.shadowBlob(g, bx + 0.6, by + 1.3, rr * 1.3, rr * 0.7, { alpha: 0.75 });
      const far = Math.sin(a) < 0;
      const bg = g.createRadialGradient(bx, by + (far ? rr * 0.5 : -rr * 0.4), 0.2, bx, by, rr);
      const hk = K.hash(i, 35);
      bg.addColorStop(0, far ? K.mix("#ffb070", "#7a4a30", hk * 0.6) : K.mix("#7a8298", "#3a3e48", hk));
      bg.addColorStop(0.55, far ? "#4a2a1c" : "#2a2c32"); bg.addColorStop(1, "#0e0f12");
      g.fillStyle = bg; g.beginPath(); g.ellipse(bx, by, rr, rr * 0.8, 0, 0, K.TAU); g.fill();
      if (K.hash(i, 36) < 0.5) { g.fillStyle = "rgba(110,48,20,0.35)"; g.beginPath(); g.ellipse(bx, by + rr * 1.4, rr * 0.5, rr * 1.2, 0, 0, K.TAU); g.fill(); }
    }
    // the near rim sits IN the rock: rubble lumps over its foot, lit cool on top and warm by the shaft
    const R = K.rng("hatchrubble");
    for (let i = 0; i < 16; i++) {
      const a = 0.12 + R() * (Math.PI - 0.24);
      const x = hx + Math.cos(a) * (RX + 4 + R() * 18), y = hy + 18 + Math.sin(a) * (RY + 4) + R() * 8;
      const w = 10 + R() * 26, h = 5 + R() * 9;
      K.shadowBlob(g, x, y + h * 0.3, w * 0.7, h * 0.5, { alpha: 0.7 });
      const pts = [];
      for (let k = 0; k < 7; k++) { const b = Math.PI + (k / 6) * Math.PI; pts.push(x + Math.cos(b) * w * 0.5 * (0.8 + R() * 0.3), y + Math.sin(b) * h * (0.75 + R() * 0.35)); }
      pts.push(x + w * 0.45, y + h * 0.3, x - w * 0.45, y + h * 0.3);
      const p = new Path2D(); K.spline(p, pts, true, 0.8);
      g.fillStyle = "#0c0a0c"; g.fill(p);
      litFill(g, p, [x - w * 0.6, y - h * 1.2, x + w * 0.6, y + h * 0.5], {
        scale: 50, scaleY: 30, seed: 40 + i, amb: "#20222e",
        lights: [{ color: MOON, k: 0.9, mask: vGrad(y - h * 1.1, y - h * 0.3, [[0, 1], [1, 0]]) }],
      });
    }
  });
}
// rust / soot overlay (transparent = bare steel)
function rustTex() {
  return K.texBake("f10rust3", 256, 96, (u, v, out) => {
    const n = K.texFbm(u * 9, v * 4, 71, 4) * 0.5 + 0.5;
    const streak = K.texFbm(u * 40, v * 2.5, 72, 3) * 0.5 + 0.5;
    const rust = K.clamp(sm(0.42, 0.75, n) * 0.85 + sm(0.55, 0.8, streak) * 0.55 * sm(0.2, 0.9, v));
    const soot = sm(0.55, 0.0, v) * (0.35 + 0.4 * K.texFbm(u * 5 + 3, v * 3, 73, 3));
    const pit = K.texNoise(u * 120, v * 45, 74) > 0.55 ? 0.25 : 0;
    const tone = 0.7 + 0.3 * K.texNoise(u * 60, v * 22, 75);
    const ra = rust * 0.6, sa = soot * 0.55 + pit;
    const A = K.clamp(ra + sa * (1 - ra));
    const k = A > 0 ? ra / A : 0;
    out[0] = (96 * tone) * k + 12 * (1 - k); out[1] = (44 * tone) * k + 9 * (1 - k); out[2] = (22 * tone) * k + 9 * (1 - k);
    out[3] = 255 * A;
  });
}
function shotCrane(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 0, 10.2));
  vista(g, t, W, H, { dy: K.lerp(70, 0, p) });
  embers(g, W, H, t, { count: 36, area: [0, 120, W, 420] });
  // the near rocks and the hatch lip slide down out of frame as the camera rises
  const fy = K.lerp(-40, 440, p);
  g.save();
  g.translate(0, fy);
  g.drawImage(K.sprite("f10craneRocks4", W + 40, 900, (s) => {
    s.translate(20, 0);
    const rocks = ridgePts(-20, W + 20, 300, 60, 12, 0.008);
    // moonlit (cool) top faces, the shaft's glow (warm) on the lower slopes, pitted near rock
    ridge(s, rocks, 900, { scale: 200, squash: 0.5, seed: 17, under: 0.35, moonA: 1.0, amb: "#24263a", moonEdge: 1, edge: 1.4, crestH: 14 });
  }), -20, 0, W + 40, 900);
  K.shadowBlob(g, 480, 470 + 40, 330, 30, { alpha: 0.6 });
  g.drawImage(hatchSprite(), 480 - 360, 470 - 120, 720, 260);
  g.restore();
  // warm shaft light spilling up at the start
  K.glow(g, 480, fy + 470, 300, "#ff5a2a", 0.35 * (1 - p));
}

// ---- SHOT 2 [10-20] someone is having a better night -------------------------------------------
// A big cream cat sits chest-deep in a hot spring at the crater's edge, eyes shut, a folded hand
// towel on its crown, forepaws folded on the rock lip. Key: the crater glow from the right (warm);
// rim: the moon, high right (cool); the water is a dark mirror.
const SP = { cx: 500, cy: 452, rx: 330, ry: 64, HX: 480, HY: 372, s: 165, lip: 474 };
SP.wl = SP.HY + 0.45 * SP.s; // the waterline on the chest
const SPW = 440, SPH = 330, SPHX = 220, SPHY = 120; // the cat sprite: head centre at (SPHX, SPHY)
const SPWL = SPHY + 0.45 * SP.s;
function hotSpringBg(W, H) {
  // the background is far out of focus: painted once and pre-blurred. The crater (and its glow)
  // is off to the right; the moon high behind.
  return K.sprite("f10springbg3", W, H, (s) => {
    const L = K.layer(W, H, "f10springbgL");
    const c = L.g;
    nightSky(c, W, H, 330, 0.9);
    K.stars(c, W, H, 11, 1, 0, { yMax: 280 });
    const far = ridgePts(-20, W + 20, 300, 30, 5, 0.007);
    ridge(c, far, H, { scale: 120, seed: 6, under: 0.7, moonA: 0.8, crestH: 12, haze: 0.25 });
    K.glow(c, 720, 330, 400, LAVA, 0.3);
    if (K.hasFilter()) s.filter = "blur(5px)";
    s.drawImage(L.canvas, 0, 0, W, H);
    s.filter = "none";
  });
}
// a patch of real fur: the flank of the kit's own cream cat (guard hairs, clumps, faint stripes),
// used as the albedo of the shoulders and forelegs that the kit has no frontal pose for
function furSource() {
  return K.sprite("f10furSrc2", 280, 120, (s) => {
    const L = K.layer(720, 440, "f10furSrcL");
    K.drawCat(L.g, 380, 420, 300, {
      pose: "loaf", facing: -1, headTurn: 0, t: 0, coat: K.COATS.cream, collar: false, bell: false, shadow: false, blink: 1,
      autoBlink: false, breath: 0, light: { x: 380, y: -900, color: "#ffffff", strength: 0.4 }, ambientK: 0, castShadow: 0,
    });
    const ps = K.pixelScale();
    s.drawImage(L.canvas, 330 * ps, 245 * ps, 250 * ps, 80 * ps, 0, 0, 280, 120);
  });
}
// fill `path` with fur flowing along angle `ang` (radians, 0 = along +x)
function furFill(g, path, box, ang, sc = 0.55) {
  const pat = g.createPattern(furSource(), "repeat");
  g.save();
  g.clip(path);
  g.fillStyle = "#c9b38a"; g.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
  if (pat && pat.setTransform && typeof DOMMatrix !== "undefined") {
    const m = new DOMMatrix().translateSelf(box[0], box[1]).rotateSelf(ang * 180 / Math.PI).scaleSelf(sc, sc);
    pat.setTransform(m);
  }
  g.fillStyle = pat || "#c9b38a";
  g.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
  g.restore();
}
// top-contour ear finder on a painted layer (device px): returns [[x, y], [x, y]] tips, logical units
function earTips(canvas, x0, x1, y0, y1) {
  const ps = K.pixelScale(), W = canvas.width;
  const X0 = Math.max(0, Math.floor(x0 * ps)), X1 = Math.min(W - 1, Math.ceil(x1 * ps)), Y0 = Math.floor(y0 * ps), Y1 = Math.ceil(y1 * ps);
  const D = canvas.getContext("2d").getImageData(X0, Y0, X1 - X0 + 1, Y1 - Y0 + 1).data;
  const w = X1 - X0 + 1, h = Y1 - Y0 + 1;
  const top = new Int32Array(w).fill(h);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (D[(y * w + x) * 4 + 3] > 150) { top[x] = y; break; }
  let a = 0;
  for (let x = 0; x < w; x++) if (top[x] < top[a]) a = x;
  let b = -1;
  for (let x = 0; x < w; x++) {
    if (Math.abs(x - a) < 0.15 * w) continue;
    let valley = 0;
    for (let k = Math.min(x, a); k <= Math.max(x, a); k++) valley = Math.max(valley, top[k]);
    if (valley - top[x] < 4 * ps) continue;
    if (b < 0 || top[x] < top[b]) b = x;
  }
  if (b < 0) b = Math.min(w - 1, a + Math.round(0.35 * w));
  const [l, r] = a < b ? [a, b] : [b, a];
  let valley = 0, vx = l;
  for (let k = l; k <= r; k++) if (top[k] > valley) { valley = top[k]; vx = k; }
  const L = (x, y) => [(X0 + x) / ps, (Y0 + y) / ps];
  return { tips: [L(l, top[l]), L(r, top[r])], crown: L(vx, valley) };
}
// a folded hand towel, laid flat on the crown: a top face, a thick front edge showing the folded
// layers, terry loops, a drooping corner. Light: moon on the top face, the crater warm from the right.
function towelFolded(g, x, y, w, s) {
  const th = w * 0.2, d = w * 0.16;
  const R = K.rng("towel3");
  const sag = w * 0.03;
  const front = new Path2D();
  front.moveTo(x - w / 2, y - th);
  front.lineTo(x + w / 2, y - th);
  front.quadraticCurveTo(x + w / 2 + 2, y - th / 2, x + w / 2 - 1, y);
  front.quadraticCurveTo(x, y + sag, x - w / 2 + 1, y);
  front.quadraticCurveTo(x - w / 2 - 2, y - th / 2, x - w / 2, y - th);
  front.closePath();
  const top = new Path2D();
  top.moveTo(x - w / 2, y - th);
  top.quadraticCurveTo(x - w / 2 + 2, y - th - d * 0.6, x - w / 2 + w * 0.08, y - th - d);
  top.lineTo(x + w / 2 - w * 0.08, y - th - d);
  top.quadraticCurveTo(x + w / 2 - 2, y - th - d * 0.6, x + w / 2, y - th);
  top.closePath();
  // the drooping corner: the fold's loose end hangs down the left side of the head
  const flap = new Path2D();
  flap.moveTo(x - w / 2 + 2, y - th * 0.7);
  flap.bezierCurveTo(x - w / 2 - w * 0.12, y - th * 0.2, x - w / 2 - w * 0.16, y + th * 0.8, x - w / 2 - w * 0.1, y + th * 1.7);
  flap.lineTo(x - w / 2 + w * 0.02, y + th * 1.25);
  flap.bezierCurveTo(x - w / 2 + w * 0.04, y + th * 0.6, x - w / 2 + w * 0.08, y + th * 0.1, x - w / 2 + w * 0.14, y - th * 0.1);
  flap.closePath();
  // contact shadow on the fur under it
  g.save();
  if (K.hasFilter()) g.filter = `blur(${K.qblur((w * 0.05).toFixed(1))}px)`;
  g.fillStyle = "rgba(10,6,8,0.55)";
  g.beginPath(); g.ellipse(x, y + 2, w * 0.56, th * 0.55, 0, 0, K.TAU); g.fill();
  g.restore();
  const base = "#7f9693";
  const paint = (p, col, light) => {
    g.fillStyle = col; g.fill(p);
    g.save(); g.clip(p);
    K.texRect(g, "fabric", x - w, y - w, w * 2, w * 2, { scale: w * 0.3, alpha: 0.7, mode: "overlay", tex: { seed: 9 } });
    light();
    // terry loops: tiny lit and shadowed specks
    const lt = new Path2D(), dk = new Path2D();
    for (let i = 0; i < 520; i++) {
      const px = x + (R() - 0.5) * w * 1.5, py = y - th - d + (R() - 0.2) * (th + d) * 2.2;
      (R() < 0.5 ? lt : dk).rect(px, py, 0.6, 0.6);
    }
    g.fillStyle = "rgba(230,245,240,0.22)"; g.fill(lt);
    g.fillStyle = "rgba(6,10,12,0.3)"; g.fill(dk);
    g.restore();
  };
  paint(flap, K.mix(base, "#2a3434", 0.55), () => {
    const gr = g.createLinearGradient(x - w * 0.6, 0, x - w * 0.4, 0);
    gr.addColorStop(0, "rgba(4,6,10,0.55)"); gr.addColorStop(1, "rgba(4,6,10,0.1)");
    g.fillStyle = gr; g.fillRect(x - w, y - w, w * 2, w * 2);
  });
  paint(front, K.mix(base, "#303c3c", 0.45), () => {
    // the folded layers: soft dark creases with a lit lip above each
    g.lineCap = "round";
    for (const k of [0.36, 0.68]) {
      g.strokeStyle = "rgba(6,10,12,0.5)"; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(x - w / 2, y - th * (1 - k)); g.quadraticCurveTo(x, y - th * (1 - k) + sag * k, x + w / 2, y - th * (1 - k)); g.stroke();
      g.strokeStyle = "rgba(200,225,220,0.16)"; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(x - w / 2, y - th * (1 - k) - 1.2); g.quadraticCurveTo(x, y - th * (1 - k) + sag * k - 1.2, x + w / 2, y - th * (1 - k) - 1.2); g.stroke();
    }
    const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    gr.addColorStop(0, "rgba(4,6,12,0.5)"); gr.addColorStop(0.6, "rgba(4,6,12,0.12)"); gr.addColorStop(1, "rgba(4,6,12,0)");
    g.fillStyle = gr; g.fillRect(x - w, y - w, w * 2, w * 2);
    g.globalCompositeOperation = "lighter";
    const kg = g.createRadialGradient(x + w * 0.6, y, 0, x + w * 0.6, y, w * 0.7);
    kg.addColorStop(0, "rgba(255,110,50,0.4)"); kg.addColorStop(1, "rgba(255,110,50,0)");
    g.fillStyle = kg; g.fillRect(x - w, y - w, w * 2, w * 2);
  });
  paint(top, K.mix(base, "#a4b2cc", 0.18), () => {
    const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    gr.addColorStop(0, "rgba(4,6,12,0.35)"); gr.addColorStop(1, "rgba(4,6,12,0)");
    g.fillStyle = gr; g.fillRect(x - w, y - w, w * 2, w * 2);
  });
  // a fuzz of loops standing off the top edge, lit by the moon
  g.save();
  g.globalCompositeOperation = "lighter";
  g.fillStyle = "rgba(170,190,215,0.35)";
  for (let i = 0; i < 70; i++) { const u = R(); g.fillRect(x - w / 2 + w * 0.08 + u * w * 0.84 + (R() - 0.5), y - th - d - R() * 1.6, 0.7, 0.7); }
  g.restore();
}
// the cat above (and just below) the waterline, painted once per ear state. Head and face from
// the kit (3/4 to camera, eyes shut, chin up); the frontal shoulders and chest are built here from
// real fur: two scapula bumps, the neck under the chin, AO under the head, wet fur at the water.
function springCat(earQ) {
  return K.sprite("f10spcat3:" + earQ, SPW, SPH, (sp) => {
    const s = SP.s, ps = K.pixelScale();
    const HL = K.layer(SPW, SPH, "f10spHeadR", { read: true }); // earTips reads it back
    K.cpuMode(() => K.drawCat(HL.g, SPHX + 0.25 * s, SPHY + 1.52 * s, s, {
      pose: "sit", facing: -1, headTurn: 0.92, headTilt: 0.15, blink: 1, t: 0, coat: K.COATS.cream, collar: false, bell: false,
      shadow: false, wet: 0.3, ears: earQ * 0.7, breath: 0, autoBlink: false, tail: 0, castShadow: 0,
      key: { x: SPHX + 520, y: SPHY + 60, color: "#ff8a4a", strength: 0.95 }, rim: { x: SPHX + 260, y: SPHY - 520, color: "#a8b8ff", strength: 1.15 },
      fill: "#0e0a14", ambient: "#243052", ambientK: 0.3,
    }));
    const E = earTips(HL.canvas, SPHX - 0.5 * s, SPHX + 0.4 * s, SPHY - 0.5 * s, SPHY);
    // keep only the head (and whiskers): a soft wide ellipse, the profile body below cut away
    const hg = HL.g;
    hg.save();
    hg.globalCompositeOperation = "destination-in";
    hg.translate(SPHX - 0.02 * s, SPHY - 0.08 * s); hg.scale(1, 0.5);
    const mk = hg.createRadialGradient(0, 0, 0, 0, 0, 0.64 * s);
    mk.addColorStop(0, "rgba(0,0,0,1)"); mk.addColorStop(0.7, "rgba(0,0,0,1)"); mk.addColorStop(1, "rgba(0,0,0,0)");
    hg.fillStyle = mk; hg.fillRect(-s, -2 * s, 2 * s, 4 * s);
    hg.restore();
    // ---- the shoulders and chest
    const u = s;
    const P = [-0.6, 1.05, -0.6, 0.62, -0.55, 0.38, -0.47, 0.25, -0.36, 0.2, -0.25, 0.22, -0.14, 0.12, 0, 0.08, 0.14, 0.12, 0.25, 0.21,
      0.36, 0.19, 0.47, 0.24, 0.55, 0.37, 0.6, 0.6, 0.6, 1.05].map((v, i) => (i % 2 ? SPHY + v * u : SPHX + v * u));
    const tor = new Path2D();
    K.spline(tor, P, true, 0.8);
    const box = [SPHX - 0.7 * u, SPHY, SPHX + 0.7 * u, SPHY + 1.1 * u];
    furFill(sp, tor, box, Math.PI / 2, 0.8);
    sp.save();
    sp.clip(tor);
    // the pale chest bib under the chin
    const bib = sp.createRadialGradient(SPHX - 0.02 * u, SPHY + 0.3 * u, 0, SPHX - 0.02 * u, SPHY + 0.3 * u, 0.3 * u);
    bib.addColorStop(0, "rgba(246,236,218,0.55)"); bib.addColorStop(1, "rgba(246,236,218,0)");
    sp.fillStyle = bib; sp.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
    // fur flow: short hair strokes running down and out from the neck, light over dark, so the
    // chest has the same fibrous surface as the kit's head
    const R = K.rng("spfur");
    sp.lineCap = "round";
    for (let i = 0; i < 900; i++) {
      const x = box[0] + R() * (box[2] - box[0]), y = SPHY + 0.08 * u + R() * 0.5 * u;
      const ang = Math.PI / 2 - (x - SPHX) / u * 0.9 + (R() - 0.5) * 0.4;
      const len = 3 + R() * 6;
      sp.strokeStyle = R() < 0.55 ? `rgba(255,244,222,${(0.08 + R() * 0.12).toFixed(2)})` : `rgba(60,44,30,${(0.08 + R() * 0.14).toFixed(2)})`;
      sp.lineWidth = 0.5 + R() * 0.6;
      sp.beginPath(); sp.moveTo(x, y); sp.quadraticCurveTo(x + Math.cos(ang) * len * 0.5 + (R() - 0.5), y + Math.sin(ang) * len * 0.5, x + Math.cos(ang) * len, y + Math.sin(ang) * len); sp.stroke();
    }
    // night: the fur's own light is far too bright and flat; multiply it down to the scene
    sp.globalCompositeOperation = "multiply";
    sp.fillStyle = "#c2bccb"; sp.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
    sp.globalCompositeOperation = "source-over";
    // form: a rounded chest, darker toward both flanks and darkest on the unlit left; the top of
    // the shoulders turns up to the sky
    const fg = sp.createLinearGradient(box[0], 0, box[2], 0);
    fg.addColorStop(0, "rgba(6,6,14,0.82)"); fg.addColorStop(0.3, "rgba(6,6,14,0.35)"); fg.addColorStop(0.55, "rgba(6,6,14,0.05)"); fg.addColorStop(0.85, "rgba(20,8,6,0.1)"); fg.addColorStop(1, "rgba(20,8,6,0.45)");
    sp.fillStyle = fg; sp.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
    // the scapulae: soft lit domes with a shadow below each
    for (const [bx, k] of [[-0.38, 0.55], [0.38, 1]]) {
      const cx = SPHX + bx * u, cy = SPHY + 0.27 * u;
      const sg = sp.createRadialGradient(cx, cy + 0.13 * u, 0, cx, cy + 0.13 * u, 0.2 * u);
      sg.addColorStop(0, "rgba(4,4,10,0.3)"); sg.addColorStop(1, "rgba(4,4,10,0)");
      sp.fillStyle = sg; sp.fillRect(cx - 0.3 * u, cy - 0.2 * u, 0.6 * u, 0.6 * u);
      sp.globalCompositeOperation = "lighter";
      const hg2 = sp.createRadialGradient(cx + 0.03 * u, cy - 0.05 * u, 0, cx + 0.03 * u, cy - 0.05 * u, 0.13 * u);
      hg2.addColorStop(0, `rgba(150,160,210,${0.2 * k})`); hg2.addColorStop(1, "rgba(150,160,210,0)");
      sp.fillStyle = hg2; sp.fillRect(cx - 0.3 * u, cy - 0.3 * u, 0.6 * u, 0.6 * u);
      sp.globalCompositeOperation = "source-over";
    }
    // the crater's warm key wrapping round the right shoulder
    sp.globalCompositeOperation = "lighter";
    const kg = sp.createRadialGradient(SPHX + 0.65 * u, SPHY + 0.3 * u, 0, SPHX + 0.65 * u, SPHY + 0.3 * u, 0.55 * u);
    kg.addColorStop(0, "rgba(255,110,50,0.42)"); kg.addColorStop(0.5, "rgba(255,100,45,0.14)"); kg.addColorStop(1, "rgba(255,100,45,0)");
    sp.fillStyle = kg; sp.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
    sp.globalCompositeOperation = "source-over";
    // AO: the head shadows the neck and the top of the chest
    if (K.hasFilter()) sp.filter = `blur(${K.qblur((0.05 * u).toFixed(1))}px)`;
    sp.fillStyle = "rgba(4,3,6,0.55)";
    sp.beginPath(); sp.ellipse(SPHX - 0.02 * u, SPHY + 0.2 * u, 0.3 * u, 0.1 * u, 0, 0, K.TAU); sp.fill();
    sp.filter = "none";
    // wet: soaked fur goes dark and clumps toward the waterline
    const wg = sp.createLinearGradient(0, SPWL - 0.09 * u, 0, SPWL + 0.02 * u);
    wg.addColorStop(0, "rgba(8,6,6,0)"); wg.addColorStop(1, "rgba(8,6,6,0.4)");
    sp.fillStyle = wg; sp.fillRect(box[0], SPWL - 0.09 * u, box[2] - box[0], 0.6 * u);
    sp.restore();
    wetFringe(sp, SPHX - 0.56 * u, SPHX + 0.56 * u, SPWL + 1, u);
    // rims: the moon along the top of the shoulders, the crater on the right flank
    K.crescent(sp, tor, -1.2, 2.4, MOON, 0.22, box, "lighter", 4);
    K.crescent(sp, tor, -3.5, 0.5, "#ff8a4a", 0.3, box, "lighter", 5);
    // guard hairs breaking the top silhouette (soft, irregular)
    sp.save();
    sp.lineCap = "round";
    const pts = K.sampleSpline(P.slice(2, 28), false, 8);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x, y] = pts[i];
      if (y > SPWL - 4) continue;
      const nx = pts[i + 1][1] - y, ny = -(pts[i + 1][0] - x);
      const nl = Math.hypot(nx, ny) || 1;
      for (let k = 0; k < 2; k++) {
        if (R() < 0.35) continue;
        const len = 1.5 + R() * 3.5, jx = (R() - 0.5) * 3;
        const lit = x > SPHX + 0.2 * u ? "#ffb488" : x > SPHX - 0.2 * u ? "#b8c4ee" : "#6a6070";
        sp.strokeStyle = K.rgba(lit, 0.25 + R() * 0.3);
        sp.lineWidth = 0.45;
        sp.beginPath(); sp.moveTo(x + jx - (nx / nl), y - (ny / nl)); sp.quadraticCurveTo(x + jx + (nx / nl) * len * 0.5 + (R() - 0.5) * 2, y + (ny / nl) * len * 0.5, x + jx + (nx / nl) * len + (R() - 0.5) * 2, y + (ny / nl) * len); sp.stroke();
      }
    }
    sp.restore();
    // ---- the head over it
    sp.drawImage(HL.canvas, 0, 0, SPW, SPH);
    // ---- the towel on the crown, then the ear tips back over its edges (they poke through)
    const [l, r] = E.tips;
    const tw = Math.max(40, (r[0] - l[0]) * 1.08);
    towelFolded(sp, (l[0] + r[0]) / 2 + 2, E.crown[1] + 0.035 * s, tw, s);
    for (const [ex, ey] of [l, r]) {
      sp.save();
      const cp = new Path2D();
      cp.moveTo(ex - 0.1 * s, E.crown[1] + 0.02 * s); cp.lineTo(ex + 0.1 * s, E.crown[1] + 0.02 * s); cp.lineTo(ex + 0.02 * s, ey - 4); cp.lineTo(ex - 0.02 * s, ey - 4); cp.closePath();
      sp.clip(cp);
      // reload the unmasked head: the ears sit above the mask's ellipse anyway
      sp.drawImage(HL.canvas, 0, 0, SPW, SPH);
      sp.restore();
    }
  });
}
// the reflection of the cat in the dark water: flipped about the waterline, darkened, softened
function springCatRefl(earQ) {
  return K.sprite("f10spcatR3:" + earQ, SPW, 120, (s) => {
    s.save();
    s.translate(0, 0); s.scale(1, -1); s.translate(0, -SPWL * 2 + SPWL);
    s.drawImage(springCat(earQ), 0, 0, SPW, SPH);
    s.restore();
    s.globalCompositeOperation = "source-atop";
    s.fillStyle = "rgba(4,6,10,0.55)"; s.fillRect(0, 0, SPW, 120);
    s.globalCompositeOperation = "destination-in";
    const gr = s.createLinearGradient(0, 0, 0, 120);
    gr.addColorStop(0, "rgba(0,0,0,0.85)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    s.fillStyle = gr; s.fillRect(0, 0, SPW, 120);
  });
}
// forearms out of the water and folded on the rock lip: fur, wet, toe clefts, contact shadow.
// World coordinates, sprite origin at (PAWX, PAWY).
const PAWX = 340, PAWY = 410;
// the forepaws folded on the rock lip: two soft mitts resting on the stone, one crossed over the
// other, wrists dipping back into the water behind the lip. Wet fur, toe clefts facing us, a
// contact shadow. World coordinates, sprite origin at (PAWX, PAWY).
function springPaws() {
  return K.sprite("f10sppaws5", 300, 110, (g) => {
    g.translate(-PAWX, -PAWY);
    const { HX, s, lip } = SP;
    const R = K.rng("paws");
    const paw = (px, py, rx, ry, rot, wristDX, k) => {
      const p = new Path2D();
      // the wrist: a short hump running back into the water behind the lip
      K.tube(p, [px + wristDX * 0.3, py - ry * 0.1, px + wristDX, py - ry * 1.15], [rx * 1.5, rx * 1.35], 4, true, true);
      // the mitt: a rounded pad with four toe lobes along its front edge
      const m = new Path2D();
      m.ellipse(px, py - ry * 0.12, rx * 0.96, ry * 0.88, rot, 0, K.TAU);
      for (const q of [-0.66, -0.22, 0.22, 0.66]) {
        const tx = px + q * rx * Math.cos(rot), ty = py + ry * 0.38 + q * rx * Math.sin(rot) - Math.abs(q) * ry * 0.12;
        m.moveTo(tx + rx * 0.27, ty); m.ellipse(tx, ty, rx * 0.27, ry * 0.5, rot, 0, K.TAU);
      }
      p.addPath(m);
      K.shadowBlob(g, px + 3, py + ry * 0.75, rx * 1.15, ry * 0.45, { alpha: 0.75 });
      const box = [px - rx * 2, py - ry * 3.5, px + rx * 2, py + ry * 1.6];
      furFill(g, p, box, Math.PI / 2 + rot, 0.6);
      g.save(); g.clip(p);
      g.globalCompositeOperation = "multiply";
      g.fillStyle = "#a8a2b4"; g.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
      g.globalCompositeOperation = "source-over";
      // wet fur: darkest at the wrist that came out of the water, clumped into points
      const wg = g.createLinearGradient(0, py - ry * 2, 0, py + ry);
      wg.addColorStop(0, "rgba(6,5,6,0.5)"); wg.addColorStop(0.45, "rgba(6,5,6,0.15)"); wg.addColorStop(1, "rgba(6,5,6,0.08)");
      g.fillStyle = wg; g.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
      // form: round, lit from the upper right (moon) and the right (crater)
      const fg = g.createRadialGradient(px + rx * 0.35, py - ry * 0.5, rx * 0.1, px, py, rx * 1.2);
      fg.addColorStop(0, "rgba(0,0,0,0)"); fg.addColorStop(0.7, "rgba(4,4,10,0.18)"); fg.addColorStop(1, "rgba(4,4,10,0.6)");
      g.fillStyle = fg; g.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
      // toe clefts: three soft creases on the front of the mitt
      g.lineCap = "round";
      for (const q of [-0.44, 0, 0.44]) {
        const tx = px + q * rx * Math.cos(rot), ty = py + ry * 0.85 + q * rx * Math.sin(rot);
        g.strokeStyle = "rgba(8,5,6,0.5)"; g.lineWidth = 1.3;
        g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + 0.5, ty - ry * 0.3, tx + 0.8, ty - ry * 0.55); g.stroke();
      }
      // wet hair points along the wrist
      for (let i = 0; i < 16; i++) {
        const x = px + (R() - 0.5) * rx * 1.6 + wristDX * 0.6, y = py - ry * (0.6 + R() * 1.2);
        g.strokeStyle = R() < 0.5 ? "rgba(6,4,4,0.35)" : "rgba(255,190,150,0.16)"; g.lineWidth = 0.7;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 1.5, y + 2 + R() * 3); g.stroke();
      }
      g.restore();
      K.crescent(g, m, -1, 1.8, MOON, 0.28 * k, box, "lighter", 3);
      K.crescent(g, p, -2.6, 0.3, "#ff8a4a", 0.32, box, "lighter", 4);
      // a wet glint on the toe tops
      g.save(); g.globalCompositeOperation = "lighter";
      g.drawImage(K.glowSprite("#ffd0b0"), px + rx * 0.2 - 5, py - ry * 0.55 - 1.5, 10, 3);
      g.restore();
    };
    // the far paw first, then the near one folded half over it
    paw(HX - 0.07 * s, lip + 4, 0.14 * s, 0.075 * s, 0.12, -0.04 * s, 0.7);
    paw(HX + 0.08 * s, lip + 8, 0.145 * s, 0.08 * s, -0.1, 0.05 * s, 1);
  });
}
// a basalt block: an irregular polygon (faceted, not a dome), fbm albedo, matte; lit by the
// crater from the right and the moon from above; wet only in a band just above the water
function basalt(g, x, y, w, h, seed, o = {}) {
  const R = K.rng("basalt" + seed);
  const n = 6 + Math.floor(R() * 4);
  const pts = [];
  // the base on the waterline, a faceted top: a flat-ish crown, steep sides
  pts.push(x - w * 0.5, y);
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const a = Math.PI + u * Math.PI;
    const r = 0.8 + R() * 0.35;
    const flat = 1 - Math.pow(Math.abs(Math.cos(a)), 3) * 0.25;
    pts.push(x + Math.cos(a) * w * 0.5 * r, y + Math.sin(a) * h * r * flat);
  }
  pts.push(x + w * 0.5, y);
  const p = new Path2D();
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.lineTo(x + w * 0.5, y + (o.below || 4)); p.lineTo(x - w * 0.5, y + (o.below || 4));
  p.closePath();
  g.fillStyle = "#0b0a0c"; g.fill(p);
  litFill(g, p, [x - w * 0.6, y - h * 1.3, x + w * 0.6, y + (o.below || 4) + 2], {
    tex: "lavarock", scale: o.scale || 60, scaleY: (o.scale || 60) * 0.8, seed: 50 + seed, amb: "#202232",
    lights: [
      { color: "#ff7a3a", k: o.warm == null ? 1.3 : o.warm, mask: (c) => { const gr = c.createLinearGradient(x + w * 0.6, y, x - w * 0.5, y - h * 0.4); gr.addColorStop(0, "rgba(0,0,0,0.9)"); gr.addColorStop(1, "rgba(0,0,0,0.04)"); return gr; } },
      { color: MOON, k: 0.75, mask: vGrad(y - h * 1.2, y - h * 0.55, [[0, 1], [1, 0]]) },
    ],
  });
  // facets: each edge face shaded by its slope toward the moon (top) or away (sides)
  g.save(); g.clip(p);
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
    const nx = by - ay, ny = -(bx - ax), nl = Math.hypot(nx, ny) || 1;
    const lit = K.clamp(-(ny / nl) * 0.8 + (nx / nl) * 0.3);
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const fg = g.createLinearGradient(mx, my, mx - (nx / nl) * h * 0.5, my - (ny / nl) * h * 0.5);
    fg.addColorStop(0, `rgba(${lit > 0.5 ? "120,130,170" : "0,0,0"},${lit > 0.5 ? 0.12 * lit : 0.35 * (1 - lit)})`);
    fg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = fg;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(x + (R() - 0.5) * w * 0.2, y - h * 0.35); g.closePath(); g.fill();
  }
  // wet only at the waterline: darker band, and a thin specular lip where the film of water sits
  if (o.wet !== false) {
    const wg = g.createLinearGradient(0, y - h * 0.22, 0, y);
    wg.addColorStop(0, "rgba(2,2,4,0)"); wg.addColorStop(1, "rgba(2,2,4,0.55)");
    g.fillStyle = wg; g.fillRect(x - w, y - h * 0.22, w * 2, h * 0.22 + 6);
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = "rgba(255,140,80,0.22)"; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(x - w * 0.42, y - 1.5); g.lineTo(x + w * 0.45, y - 1.5); g.stroke();
  }
  g.restore();
  moonCrest(g, pts.reduce((a, v, i) => (i % 2 ? (a[a.length - 1].push(v), a) : (a.push([v]), a)), []).slice(1, -1), 0.4, 1);
  return p;
}
function poolRocks(W, H, front) {
  return K.sprite("f10poolrocks4" + (front ? "F" : "B"), W, H, (g) => {
    const { cx, cy, rx, ry } = SP;
    if (!front) {
      // the far rim: blocks of every size along the back of the pool, base on the waterline
      for (let i = 0; i < 15; i++) {
        const a = Math.PI + ((i + K.hash(i, 5) * 0.6) / 14.6) * Math.PI;
        const x = cx + Math.cos(a) * (rx + 14), y = cy + Math.sin(a) * (ry + 4) + 6;
        const w = 50 + K.hash(i, 6) * 90, h = 18 + K.hash(i, 7) * 34 * (0.6 + Math.abs(Math.cos(a)) * 0.8);
        K.shadowBlob(g, x, y, w * 0.5, 5, { alpha: 0.5 });
        basalt(g, x, y, w, h, i, { scale: 50 });
      }
    } else {
      // the near lip: one broad slab under the cat's paws, rougher blocks to the sides
      const slab = new Path2D();
      const top = ridgePts(250, 720, SP.lip, 5, 77, 0.02, 10, 0.4);
      slab.moveTo(250, H + 10);
      for (const [x, y] of top) slab.lineTo(x, y);
      slab.lineTo(720, H + 10); slab.closePath();
      g.fillStyle = "#0a090b"; g.fill(slab);
      litFill(g, slab, [250, SP.lip - 10, 730, H + 10], {
        tex: "lavarock", scale: 90, scaleY: 50, seed: 61, amb: "#1a1c28",
        lights: [
          { color: MOON, k: 0.9, mask: vGrad(SP.lip - 6, SP.lip + 16, [[0, 1], [1, 0]]) },
          { color: "#ff7a3a", k: 0.7, mask: (c) => { const gr = c.createLinearGradient(740, 0, 300, 0); gr.addColorStop(0, "rgba(0,0,0,0.8)"); gr.addColorStop(1, "rgba(0,0,0,0.05)"); return gr; } },
        ],
      });
      // its front face falls away into the dark
      g.save(); g.clip(slab);
      const dg = g.createLinearGradient(0, SP.lip + 6, 0, H);
      dg.addColorStop(0, "rgba(2,2,4,0)"); dg.addColorStop(1, "rgba(2,2,4,0.75)");
      g.fillStyle = dg; g.fillRect(240, SP.lip, 500, H - SP.lip + 10);
      // wet lip toward the water
      g.globalCompositeOperation = "lighter";
      g.strokeStyle = "rgba(170,185,255,0.18)"; g.lineWidth = 1;
      g.beginPath(); top.forEach(([x, y], i) => (i ? g.lineTo(x, y + 0.8) : g.moveTo(x, y + 0.8))); g.stroke();
      g.restore();
      moonCrest(g, top, 0.5, 1.2);
      for (let i = 0; i < 6; i++) {
        const side = i < 3 ? -1 : 1, k = i % 3;
        const x = side < 0 ? 40 + k * 95 + K.hash(i, 2) * 30 : 760 + k * 90 + K.hash(i, 2) * 30;
        const y = H - 8 - K.hash(i, 3) * 12 + (k === 2 ? 4 : 0);
        basalt(g, x, y + 30, 120 + K.hash(i, 4) * 70, 70 + K.hash(i, 5) * 40, 20 + i, { scale: 110, warm: side > 0 ? 1.4 : 0.5, wet: false, below: 40 });
      }
    }
  });
}
function poolWater(W, H) {
  // a dark mirror: the sky glow and the far rocks reflected (flipped, darkened, rippled), Fresnel
  // brighter toward the far edge, nearly black up close. Static part, painted once.
  return K.sprite("f10poolwater4", W, H, (g) => {
    const { cx, cy, rx, ry } = SP;
    const p = new Path2D(); K.ellipsePath(p, cx, cy, rx, ry);
    g.fillStyle = "#05070b"; g.fill(p);
    g.save(); g.clip(p);
    // the reflected world: the background flipped about the far shore, in rippled strips
    const bg = hotSpringBg(W, H), ps = K.pixelScale();
    const y0 = cy - ry;
    for (let y = y0; y < cy + ry; y += 2) {
      const d = (y - y0) / (2 * ry);
      const off = Math.sin(y * 0.9) * (1 + d * 3) + Math.sin(y * 2.3 + 1) * 0.6;
      const sy = y0 - (y - y0) * 2.2; // the reflection is foreshortened (grazing angle)
      g.globalAlpha = 0.55 * (1 - d * 0.75);
      g.drawImage(bg, 0, Math.max(0, sy) * ps, W * ps, 4 * ps, off, y, W, 2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "multiply";
    g.fillStyle = "#5a5866"; g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    g.globalCompositeOperation = "source-over";
    // the rocks' dark reflections along the far rim
    const dg = g.createLinearGradient(0, cy - ry, 0, cy - ry + 30);
    dg.addColorStop(0, "rgba(3,3,6,0.8)"); dg.addColorStop(1, "rgba(3,3,6,0)");
    g.fillStyle = dg; g.fillRect(cx - rx, cy - ry, rx * 2, 30);
    // Fresnel: near water looks into the depths (black), far water mirrors the sky
    const fr = g.createLinearGradient(0, cy - ry, 0, cy + ry);
    fr.addColorStop(0, "rgba(2,3,6,0)"); fr.addColorStop(1, "rgba(2,3,6,0.6)");
    g.fillStyle = fr; g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    g.restore();
    // AO where water meets rock
    g.save(); g.clip(p);
    g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 8; g.filter = K.hasFilter() ? "blur(3px)" : "none";
    g.stroke(p);
    g.restore();
  });
}
// wet fur at the waterline: clumped, darker points with a wet sheen (sprite builders)
function wetFringe(c, x0, x1, wl, s) {
  c.save();
  const gaps = new Path2D(), tips = new Path2D();
  for (let i = 0; i < 26; i++) {
    const x = x0 + (i + K.hash(i, 51) * 0.7) / 26 * (x1 - x0);
    const len = s * (0.04 + K.hash(i, 52) * 0.06), wd = s * (0.006 + K.hash(i, 53) * 0.006);
    const top = wl - len * 1.4 - K.hash(i, 54) * s * 0.03;
    gaps.moveTo(x - wd, wl + 1); gaps.quadraticCurveTo(x - wd * 0.3, wl - len * 0.5, x + (K.hash(i, 55) - 0.5) * 2, top);
    gaps.quadraticCurveTo(x + wd * 0.3, wl - len * 0.5, x + wd, wl + 1); gaps.closePath();
    if (K.hash(i, 56) < 0.5) { tips.moveTo(x + s * 0.02 + 1, wl - len * 0.5); tips.arc(x + s * 0.02, wl - len * 0.5, 0.9, 0, K.TAU); }
  }
  c.globalCompositeOperation = "source-atop";
  if (K.hasFilter()) c.filter = "blur(0.7px)";
  c.fillStyle = "rgba(4,3,4,0.35)"; c.fill(gaps);
  c.filter = "none";
  c.globalCompositeOperation = "lighter";
  c.fillStyle = "rgba(255,170,120,0.3)"; c.fill(tips);
  c.restore();
}
// steam: 4 wisps that rise, curl, lean with the draught and thin out with height (alpha falls as
// they climb), no straight edges anywhere. Baked progressively at 6 loop phases (the noise
// scrolls exactly one period per loop); each frame crossfades two neighbouring phases, each
// slid by the rise it is missing, so the steam keeps climbing smoothly.
const STEAM = { x: 130, y: 210, w: 760, h: 270, rw: 256, rh: 96, n: 6, loop: 6.0 };
const WISPS = [[0.14, 0.2, 0.8, 1.0], [0.38, 0.26, 1.0, 1.7], [0.6, 0.22, 0.9, 2.9], [0.84, 0.17, 0.75, 4.2]];
function steamFn(k) {
  const ph = k / STEAM.n;
  return (u, v, out) => {
    const h = 1 - v; // 0 at the water, 1 at the top
    let a = 0;
    for (const [x0, w0, amt, sd] of WISPS) {
      // the centre line curls and leans; the wisp widens as it climbs
      const xc = x0 + 0.05 * h + Math.sin(h * 5.2 + sd + ph * K.TAU) * 0.035 * (0.3 + h) + K.texFbm(h * 2 + sd, sd, 91, 2) * 0.05;
      const ww = 0.03 + w0 * 0.32 * (0.3 + h);
      const dx = (u - xc) / ww;
      if (dx * dx > 9) continue;
      const prof = Math.exp(-dx * dx * 0.8);
      const nz = K.texFbm(u * 9 + sd * 3, (v + ph) * 4, 93, 4, 0, 4) * 0.5 + 0.5;
      const nz2 = K.texFbm(u * 23 + sd, (v + ph) * 8, 94, 3, 0, 8) * 0.5 + 0.5;
      const dens = K.clamp((nz * 1.4 - 0.25) + (nz2 - 0.5) * 0.4);
      a += prof * dens * amt * sm(0, 0.12, h) * Math.pow(1 - h, 1.15);
    }
    a = K.clamp(a * 1.5);
    // lit by the crater from the right (warm) and the moon (cool) from above; denser = darker core
    const warm = sm(0.3, 1, u) * (1 - u * 0.2);
    out[0] = 150 + 90 * warm; out[1] = 150 + 30 * warm; out[2] = 172 - 20 * warm;
    out[3] = 255 * a;
  };
}
const steamKey = (k) => "f10steam3:" + k;
function steamTex(k) { return pbake(steamKey(k), STEAM.rw, STEAM.rh, steamFn(k)); }
function steam(g, t) {
  const f = (((t - 10) / STEAM.loop) % 1 + 1) % 1 * STEAM.n;
  const i = Math.floor(f), fr = f - i;
  const step = STEAM.h / STEAM.n * 0.75;
  g.save();
  g.globalAlpha = 1 - fr;
  g.drawImage(steamTex(i), STEAM.x, STEAM.y - fr * step, STEAM.w, STEAM.h);
  g.globalAlpha = fr;
  g.drawImage(steamTex((i + 1) % STEAM.n), STEAM.x, STEAM.y + (1 - fr) * step, STEAM.w, STEAM.h);
  g.restore();
}
function shotSpring(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 10, 20.4));
  const { cx, cy, rx, ry, HX, HY, s, wl } = SP;
  const earQ = K.env(t, 15.2, 15.6, 0.08, 0.2) > 0.5 ? 1 : 0;
  K.withCamera(g, W, H, { x: 480 + p * 24, y: 270, zoom: 1.04 + p * 0.05, shakeT: t, shakeAmt: 1 }, () => {
    g.drawImage(hotSpringBg(W, H), 0, 0, W, H);
    g.drawImage(poolRocks(W, H, false), 0, 0, W, H);
    g.drawImage(poolWater(W, H), 0, 0, W, H);
    g.save();
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, K.TAU); g.clip();
    // the moon's glitter path on the far water and the crater's glow broken by the ripples
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 24; i++) {
      const gx = 680 + (K.hash(i, 3) - 0.5) * (30 + K.hash(i, 4) * 70), gy = cy - ry + 4 + K.hash(i, 4) * ry * 0.7;
      const tw = Math.max(0, Math.sin(t * 2.6 + i * 1.7)) ** 2;
      const gw = 4 + K.hash(i, 5) * 9;
      g.globalAlpha = 0.5 * tw;
      g.drawImage(K.glowSprite("#c8d2ff"), gx - gw / 2, gy - 1.1, gw, 2.2);
    }
    for (let i = 0; i < 12; i++) {
      const gx = 600 + K.hash(i, 13) * 200, gy = cy - ry * 0.7 + K.hash(i, 14) * ry * 0.8;
      const wv = Math.sin(t * 2.2 + i * 1.9);
      const gw = 16 + K.hash(i, 15) * 28;
      g.globalAlpha = 0.14 + 0.08 * wv;
      g.drawImage(K.glowSprite("#ff9a50"), gx + wv * 3 - gw / 2, gy - 1.2, gw, 2.4);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    // breathing: the chest rises and falls against the fixed waterline (a slow 4 s breath)
    const br = Math.sin((t - 10) * 1.55) * 1.3;
    const sx = HX - SPHX, sy = HY - SPHY + br;
    // the cat's reflection: flipped, dark, broken into ripple strips (only on open water)
    const RF = springCatRefl(earQ), ps = K.pixelScale();
    for (let i = 0; i < 10; i++) {
      const yy = i * 4;
      const off = Math.sin(t * 2.1 + i * 1.3) * (0.6 + i * 0.25) + Math.sin(t * 3.7 + i * 2.1) * 0.4;
      g.globalAlpha = 0.9;
      g.drawImage(RF, 0, yy * ps, SPW * ps, 4 * ps, sx + off, wl + yy + 1, SPW, 4);
    }
    g.globalAlpha = 1;
    // the submerged chest, refracted (shifted, squashed) and swallowed by the water with depth
    const CS = springCat(earQ);
    g.save();
    g.beginPath(); g.rect(sx, wl, SPW, 80); g.clip();
    g.globalAlpha = 0.16;
    g.translate(sx + 5, wl); g.scale(1, 0.8); g.translate(0, -(SPWL + br));
    g.drawImage(CS, 0, 0, SPW, SPH);
    g.restore();
    g.restore();
    // above the water
    g.save();
    g.beginPath(); g.rect(sx, sy - 10, SPW, wl - sy + 10); g.clip();
    g.drawImage(CS, sx, sy, SPW, SPH);
    g.restore();
    // the meniscus round the chest and drip rings: specular, lit warm (right) and cool (far side)
    g.save();
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    g.strokeStyle = "rgba(255,170,120,0.3)"; g.lineWidth = 1;
    g.beginPath(); g.ellipse(HX, wl + 1, 0.7 * s, 5, 0, 0.05, 1.3); g.stroke();
    g.strokeStyle = "rgba(170,185,255,0.18)";
    g.beginPath(); g.ellipse(HX, wl + 1, 0.7 * s, 5, 0, Math.PI + 0.4, Math.PI * 1.9); g.stroke();
    // drips from the towel's corner and the chin, each a ring that spreads and fades
    for (const [dxp, per, off] of [[-0.42, 2.3, 0.2], [-0.04, 3.1, 1.4], [0.5, 4.3, 2.6]]) {
      const ph = (((t - 10 + off) / per) % 1 + 1) % 1;
      const fade = Math.pow(1 - ph, 1.6) * K.smooth(ph * 10);
      if (fade < 0.01) continue;
      const Rx = 3 + ph * 46, Ry = Rx * 0.16, x = HX + dxp * s, y = wl + 8 + Math.abs(dxp) * 6;
      g.strokeStyle = `rgba(255,160,110,${(0.4 * fade).toFixed(3)})`; g.lineWidth = 1.1;
      g.beginPath(); g.ellipse(x, y, Rx, Ry, 0, -0.3, 1.2); g.stroke();
      g.strokeStyle = `rgba(175,190,255,${(0.28 * fade).toFixed(3)})`;
      g.beginPath(); g.ellipse(x, y, Rx, Ry, 0, Math.PI + 0.3, Math.PI * 1.85); g.stroke();
      if (Rx > 14) { g.strokeStyle = `rgba(255,160,110,${(0.18 * fade).toFixed(3)})`; g.beginPath(); g.ellipse(x, y, Rx * 0.6, Ry * 0.6, 0, -0.2, 1.1); g.stroke(); }
    }
    g.restore();
    g.drawImage(poolRocks(W, H, true), 0, 0, W, H);
    g.drawImage(springPaws(), PAWX, PAWY, 300, 110);
    steam(g, t);
    K.fog(g, W, H, { y: cy - 8, h: 40, color: "#a89ca4", alpha: 0.1, t: t * 1.2, seed: 7 });
    g.drawImage(furSource(), 0, 60, 280, 120); g.drawImage(springCat(0), 520, 60, SPW, SPH); g.fillStyle="#000"; g.fillRect(0,190,256,96); g.drawImage(steamTex(0), 0, 190); /*DEBUG*/
  });
}

// ---- SHOT 3 [20-30] long lens across the fire: him ------------------------------------------------
const RIMS = new Map();
function rimProfile(key, W, rimY, amp, freq) {
  let r = RIMS.get(key);
  if (!r) {
    const pts = ridgePts(-20, W + 20, rimY, amp, 21, freq, 6);
    r = { pts, at: (x) => { const i = K.clamp(Math.round((x + 20) / 6), 0, pts.length - 1); return pts[i][1]; } };
    RIMS.set(key, r);
  }
  return r;
}
function farRimSprite(W, H, o) {
  const prof = rimProfile("far" + o.rimY + ":" + (o.amp || 18), W, o.rimY, o.amp || 18, o.freq || 0.004);
  const spr = backdrop("far3:" + o.moonX + ":" + o.moonY + ":" + o.moonR + ":" + o.rimY, W, H, (s) => {
    nightSky(s, W, H, 420, 1.2);
    K.stars(s, W, H, 12, 0.6, 0, { yMax: 300 });
    bigMoon(s, o.moonX, o.moonY, o.moonR);
    // long lens: the far rim is compressed, a thin layer of hot air and smoke over it
    ridge(s, prof.pts, H + 80, { scale: 110, squash: 0.4, seed: 23, under: 0.75, moonA: 0.9, amb: "#24263a", moonEdge: 0.5, edge: 1.2, crestH: 10 });
  });
  return { prof, spr };
}
function farRimScene(g, t, W, H, o) {
  const { prof, spr } = farRimSprite(W, H, o);
  stampBackdrop(g, spr, W, H);
  return prof.at;
}
const SMALL = [[-62, "grey", 0.5], [-34, "black", 0.62], [44, "cream", 0.58], [76, "calico", 0.46]];
const llCat = (i) => { const [dx, coat, sc] = SMALL[i]; return catSil("ll" + i, 64 * sc, { pose: SMALLPOSE(i), facing: dx < 0 ? 1 : -1, coat: K.COATS[coat], collar: false, headTurn: 0.2 }, { rimW: 1.2 }); };
const llBis = () => catSil("llB", 66, { pose: "sit", facing: 1, headTurn: 0.08, tail: 0.2 }, { rimW: 1.5, bent: true });
// hot air over the lava: re-draw the band BELOW the rim from the (separate) source layer in thin
// strips with a sub-pixel sway, at half alpha so strip edges blend. Never touches the sky or moon.
function heatShimmer(g, W, H, src, t, y0, amt) {
  const ps = K.pixelScale();
  const strips = 14, sh = (H - y0) / strips;
  g.save();
  g.globalAlpha = 0.5;
  for (let i = 0; i < strips; i++) {
    const y = y0 + i * sh;
    const off = (Math.sin(t * 7 + i * 1.3) * 0.7 + Math.sin(t * 13 + i * 2.7) * 0.3) * amt * (0.3 + 0.7 * i / strips);
    g.drawImage(src, 0, y * ps, W * ps, sh * ps, off, y, W, sh);
  }
  g.restore();
}
// smoke drifting across the long lens: a fog band with drifting wisps, lit from below
function smokeBand(g, W, H, t, y, h, a) {
  K.fog(g, W, H, { y, h, color: "#5a2418", alpha: a, t: t * 1.4, seed: 3 });
}
function shotLongLens(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 20, 30.4));
  const rack = K.smooth(K.seg(t, 21.6, 22.6)); // hit 22: snap into focus
  const L = K.layer(W, H, "f10long");
  const c = L.g;
  K.withCamera(c, W, H, { x: 480 + p * 14, y: 270 - p * 6, zoom: 1.0 + p * 0.05, shakeT: t, shakeAmt: 0.9 }, () => {
    const rimAt = farRimScene(c, t, W, H, { moonX: 560, moonY: 250, moonR: 150, rimY: 360 });
    const bx = 540, by = rimAt(540) + 3;
    SMALL.forEach(([dx], i) => stampSil(c, llCat(i), bx + dx, rimAt(bx + dx) + 3));
    stampSil(c, llBis(), bx, by);
    smokeBand(c, W, H, t, 420, 150, 0.5);
  });
  K.dof(g, L.canvas, K.lerp(5, 0, rack));
  // a mile of hot air between us and them: the ridge and the silhouettes on it swim a pixel
  if (rack > 0.95) ridgeShimmer(g, L.canvas, t, 300, 420, 1.2, W);
  K.glow(g, 480, 600, 520, LAVA, 0.2);
  embers(g, W, H, t, { count: 30, size: 2, area: [0, 160, W, 400] });
}

// ---- SHOT 4 [30-42] close on you from behind, cupping your hands to shout ---------------------------
// The kit's lit kid, from the back. Two passes: the arms raised with the elbows flared out level
// with the ears (hands cupped at the mouth), then the head and the back redrawn over them
// (clipped), so from behind you see the raised elbows either side of the head, never the hands or
// the face. On the shout the shoulders shrug up and the body leans in.
const KIDLIGHT = { x: 620, y: 1400, color: "#ff7a3a", strength: 1.35, z: -0.7 };
function kidHair(g, cx, cy, rx, ry) {
  // the back of the head as hair, not a helmet: tapered strand clumps fanning from the crown, a
  // soft anisotropic sheen band, flyaways breaking the outline, then a soft warm rim from the lava
  const R = K.rng("kidhair");
  const crown = [cx + rx * 0.1, cy - ry * 0.55];
  g.save();
  g.lineCap = "round";
  const head = new Path2D(); K.ellipsePath(head, cx, cy, rx * 1.02, ry * 1.0);
  g.save(); g.clip(head);
  g.fillStyle = "#2a170c"; g.fill(head);
  const cols = ["#1c0f08", "#2e1a0e", "#3f2414", "#4e2e18", "#5e3820"];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 170; i++) {
      const a = -Math.PI * 1.05 + R() * Math.PI * 2.1;
      const ex = cx + Math.cos(a) * rx * (1.02 + R() * 0.08), ey = cy + Math.sin(a) * ry * (1.0 + R() * 0.06) + ry * 0.12;
      const sx = crown[0] + (R() - 0.5) * rx * 0.25, sy = crown[1] + (R() - 0.5) * ry * 0.2;
      const mx = (sx + ex) / 2 + (R() - 0.5) * rx * 0.25, my = (sy + ey) / 2 - ry * 0.05;
      g.strokeStyle = cols[Math.floor(R() * cols.length)];
      g.globalAlpha = pass ? 0.5 : 0.9;
      g.lineWidth = (pass ? 1 : 2.2) + R() * (pass ? 1.2 : 3);
      g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
    }
  }
  g.globalAlpha = 1;
  // sheen: a broken band across the curve of the skull, cool from the moon above
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 60; i++) {
    const a = -Math.PI * 0.85 + R() * Math.PI * 0.7;
    const r0 = 0.45 + R() * 0.12;
    const x0 = cx + Math.cos(a) * rx * r0, y0 = cy + Math.sin(a) * ry * r0;
    const x1 = cx + Math.cos(a) * rx * (r0 + 0.22), y1 = cy + Math.sin(a) * ry * (r0 + 0.22);
    g.strokeStyle = K.rgba(i % 3 ? "#6a6a88" : "#a07858", 0.16 + R() * 0.12);
    g.lineWidth = 1 + R() * 1.5;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
  g.restore();
  // flyaways past the outline (dark against the bright sky glow, lit warm on the lava side)
  for (let i = 0; i < 70; i++) {
    const a = -Math.PI * 1.0 + R() * Math.PI * 1.25;
    const bx = cx + Math.cos(a) * rx * 0.97, by = cy + Math.sin(a) * ry * 0.97;
    const len = 4 + R() * 9, da = (R() - 0.5) * 0.9;
    const ex = bx + Math.cos(a + da) * len, ey = by + Math.sin(a + da) * len + len * 0.3;
    const warm = Math.cos(a) > 0.2;
    g.strokeStyle = warm ? K.rgba("#ff9a5a", 0.45) : "rgba(30,18,10,0.7)";
    g.lineWidth = 0.6 + R() * 0.7;
    g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo((bx + ex) / 2 + da * 3, (by + ey) / 2, ex, ey); g.stroke();
  }
  K.crescent(g, head, -rx * 0.09, -ry * 0.03, "#ff8a4a", 0.55, [cx - rx * 1.1, cy - ry * 1.1, cx + rx * 1.1, cy + ry * 1.1], "lighter", 5);
  g.restore();
}
function kidBack(g, x, y, h, shout, t) {
  const u = h / 100;
  const k = K.clamp((shout - 0.2) / 0.8); // 0 at rest .. 1 at the top of the shout
  const shrug = k * 2.2 * u, lean = k;
  const o = { view: "back", t, light: KIDLIGHT, ambient: "#10141f", hood: false, bell: false, shadow: false, breathe: false, sway: 0 };
  g.save();
  // the forward lean: from behind, the upper body tips away from us (a touch shorter and narrower)
  g.translate(x, y - 47 * u); g.scale(1 - lean * 0.02, 1 - lean * 0.035); g.translate(-x, -(y - 47 * u));
  g.translate(0, -shrug);
  // hands cupped round the mouth: the forearms point away from us (foreshortened, hidden by the
  // head), so only the flared elbows show, level with the ears
  const ex = 14 + k * 1.5, ey = -80.5 - k * 2;
  K.drawPerson(g, x, y, h, Object.assign({}, o, { armL: { hand: [-4, -87 - k * 1.5], elbow: [-ex, ey] }, armR: { hand: [4, -87 - k * 1.5], elbow: [ex, ey] } }));
  const clip = new Path2D();
  K.ellipsePath(clip, x, y + u * -92, u * 8.6, u * 10.6);
  clip.rect(x - u * 8.6, y + u * -82, u * 17.2, u * 90);
  g.save(); g.clip(clip);
  K.drawPerson(g, x, y, h, o);
  g.restore();
  kidHair(g, x, y - 92.6 * u, u * 7.35, u * 8.4);
  g.restore();
}
function shotShoutBg(t, W, H, tilt, mouthQ) {
  // the background (far rim, moon, his family) only changes with his head tilt and mouth: cached
  const tq = Math.round(tilt * 10) / 10;
  return K.sprite("f10shbg3:" + tq + ":" + mouthQ, W, H, (s) => {
    const rimAt = farRimScene(s, 0, W, H, { moonX: 640, moonY: 210, moonR: 96, rimY: 330, amp: 14 });
    const bx = 660, by = rimAt(660) + 2;
    SMALL.forEach(([dx, coat, sc], i) => {
      stampSil(s, catSil("sh" + i, 60 * sc, { pose: SMALLPOSE(i), facing: dx < 0 ? 1 : -1, coat: K.COATS[coat], collar: false, headTurn: 0.4 }), bx + dx * 1.3, rimAt(bx + dx * 1.3) + 2);
    });
    stampSil(s, catSil("shB:" + tq + ":" + mouthQ, 60, {
      pose: "sit", facing: -1, headTurn: K.lerp(0.4, 0.85, tq), headTilt: tq * 0.35, mouth: mouthQ, ears: tq * 0.6, eyesGlow: 0.35, tailUp: 0.3,
    }, { bent: true }), bx, by);
    smokeBand(s, W, H, 0, 400, 130, 0.45);
  });
}
function shoutKidSprite(W, H, shoutQ, blur) {
  return K.sprite("f10kid4:" + shoutQ + ":" + blur, W, H, (s) => {
    const L = K.layer(W, H, "f10kidL");
    kidBack(L.g, 250, 905, 700, shoutQ, 31);
    if (blur > 0 && K.hasFilter()) s.filter = `blur(${K.qblur(blur)}px)`;
    s.drawImage(L.canvas, 0, 0, W, H);
    s.filter = "none";
  });
}
const KIDBLUR = 4.2;
function shotShout(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 30, 42.4));
  const rack = K.smooth(K.seg(t, 34.2, 35.8)); // focus pulls from you to him after his meow
  const shout = K.env(t, 30.8, 34.6, 0.5, 0.8) * 0.8 + 0.2;
  const tilt = K.smooth(K.seg(t, 36.4, 37.6)) * (1 - K.smooth(K.seg(t, 40.8, 41.8)) * 0.4);
  const mouth = Math.max(K.env(t, 33.9, 34.7, 0.12, 0.25), K.env(t, 39.9, 40.8, 0.12, 0.25));
  const bgSpr = shotShoutBg(t, W, H, tilt, Math.round(mouth * 2) / 2);
  const bg = K.layer(W, H, "f10shoutbg");
  K.withCamera(bg.g, W, H, { x: 480 + p * 10, y: 270, zoom: 1.02 + p * 0.03 }, () => {
    bg.g.drawImage(bgSpr, 0, 0, W, H);
  });
  K.dof(g, bg.canvas, K.lerp(5.5, 0, rack));
  if (rack > 0.95) heatShimmer(g, W, H, bg.canvas, t, 345, 0.9);
  K.glow(g, 520, 620, 520, LAVA, 0.18);
  // you, in the foreground: sharp first, then soft (pre-blurred once, crossfaded during the rack).
  // The shout itself is a breath: the shoulders rise as the lungs fill, then drop.
  const sq = Math.round(shout * 5) / 5;
  const breathe = Math.sin(t * 1.6) * 1.5;
  K.withCamera(g, W, H, { x: 480 - p * 16, y: 270 - breathe, zoom: 1.0 + p * 0.04, shakeT: t, shakeAmt: 1.3 }, () => {
    if (rack < 1) g.drawImage(shoutKidSprite(W, H, sq, 0), 0, 0, W, H);
    if (rack > 0) {
      g.save(); g.globalAlpha = rack;
      g.drawImage(shoutKidSprite(W, H, 0.2, KIDBLUR), 0, 0, W, H);
      g.restore();
    }
  });
  embers(g, W, H, t, { count: 22, size: 2.2, area: [0, 100, W, 440], seed: 8 });
  bokehEmbers(g, W, H, t, { count: 4, size: 22, seed: 41, alpha: 0.3 });
}

// ---- SHOT 5 [42-52] reverse, long lens on Biscuit: he stands, looks, and walks away --------------
function leaveBack(W, H) {
  return backdrop("leave3", W, H, (s) => {
    nightSky(s, W, H, 460, 1.2);
    K.stars(s, W, H, 13, 0.6, 0, { yMax: 320 });
    bigMoon(s, 620, 250, 190);
  });
}
function leaveRidge(W, H) {
  const prof = rimProfile("leave", W, 420, 10, 0.003);
  return {
    prof,
    spr: backdrop("leaveRidge3", W, H, (s) => {
      ridge(s, prof.pts, H + 80, { scale: 140, squash: 0.4, seed: 29, under: 0.8, moonA: 0.9, amb: "#24263a", moonEdge: 0.55, edge: 1.2, crestH: 10 });
      smokeBand(s, W + 160, H, 0, 470, 120, 0.4);
    }),
  };
}
function shadowSprite() {
  // the Shadow: a tall, thin, long-legged cat standing on the far ridge, 1.3x Biscuit. It is an
  // OCCLUDER: a near-black body (#0d0f18, a value just above the cats) that blocks the moon, its
  // edge broken into smoke (a soft dark fringe at 70%), and only a 1-2 px cold light wrap where
  // the moon bends round it. Anchor: feet at (150, 292).
  return K.sprite("f10shadowcat5", 300, 300, (s) => {
    const L = K.layer(300, 300, "f10shadowL");
    const c = L.g;
    c.save();
    c.translate(150, 292);
    c.scale(0.74, 1.42);
    K.drawCat(c, 0, 0, 84, { pose: "stand", facing: -1, headTurn: 0.25, t: 3, coat: K.COATS.black, collar: false, shadow: false, tail: 0.3, tailUp: 0.15, lod: 0, flat: true });
    c.restore();
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = "#0d0f18"; c.fillRect(0, 0, 300, 300);
    c.globalCompositeOperation = "source-over";
    // smoke edge: a soft, dark, slightly larger ghost of the body behind it
    if (K.hasFilter()) { s.filter = "blur(3px)"; s.globalAlpha = 0.7; s.drawImage(L.canvas, 0, 0, 300, 300); s.drawImage(L.canvas, 0, -2, 300, 300); s.filter = "none"; s.globalAlpha = 1; }
    s.drawImage(L.canvas, 0, 0, 300, 300);
    sharpRim(s, L.canvas, 300, 300, { dir: MOON_DIR, width: 1.4, color: "#bcd6ff", alpha: 0.5, soft: 0.7 });
  });
}
const SHADOW_X = 690;
// the small cats: all sitting up (ears and heads read against the moon; a loaf reads as a rock)
const SMALLPOSE = (i) => (i === 3 ? "look" : "sit");
const lvCat = (i, walking, q) => {
  const [dx, coat, sc] = SMALL[i];
  const ph = walking ? q / 8 : 0;
  return catSil("lv" + i + (walking ? "w" + q : "s"), 120 * sc, {
    pose: walking ? "walk" : SMALLPOSE(i), phase: ph, facing: walking ? 1 : (dx < 0 ? 1 : -1),
    coat: K.COATS[coat], collar: false, headTurn: walking ? -0.25 : 0.35 - i * 0.12,
    // the tail's travelling wave is locked to the stride, so a cached cycle loops seamlessly
    t: walking ? ph * K.TAU / 1.4 : 0, tail: walking ? 1.3 : 0.4, tailUp: walking ? 0.55 : 0,
  }, { rimW: 2, rimA: 0.6 });
};
const BIS_O = { rimW: 2.4, underA: 0.5, bent: true };
const bisWalk = (q) => catSil("b3w" + q, 120, { pose: "walk", phase: q / 10, facing: 1, headTurn: -0.3, tailUp: 0.8, t: (q / 10) * K.TAU / 1.4, tail: 1.5 }, Object.assign({ split: true }, BIS_O));
const bisLook = (lq) => catSil("b3look" + lq, 120, { pose: "stand", facing: 1, headTurn: K.lerp(-0.3, 0.8, lq), headTilt: 0.05, tailUp: 0.6, eyesGlow: lq * 0.9, pupil: 0.8 }, BIS_O);
const bisIdle = (pose, bq) => catSil("b3" + pose + bq, 120, { pose, facing: 1, headTurn: 0.75, headTilt: 0.12, eyesGlow: 0.5, pupil: 0.8, tailUp: 0.2, blink: bq }, BIS_O);
function biscuitWalkAway(t) {
  // 47.2 turn + walk up the slope; 50.5-51.5 pause at the crest, look back; then over and gone
  const a = K.seg(t, 47.2, 50.5), b = K.seg(t, 51.5, 52.6);
  const u = 0.75 * K.ease.inOut(a) + 0.25 * b;
  const x = 430 + u * 70;
  const scale = K.lerp(1, 0.42, Math.pow(Math.min(u / 0.75, 1), 0.8));
  const climb = Math.min(u / 0.75, 1);
  const sink = K.smooth(b) * 1.0;
  const pause = t >= 50.5 && t < 51.5;
  const look = pause ? K.env(t, 50.5, 51.5, 0.25, 0.3) : 0;
  return { x, scale, climb, sink, pause, look, walking: (a > 0 && a < 1) || (b > 0 && b < 1) };
}
// heat over the lava: a cached table of refraction offsets for thin strips along the ridge line.
// Each frame re-draws those strips from the finished (separate) layer with a sub-pixel sway; the
// offsets fade to zero at the band edges so nothing tears. No canvas read-back of the target.
const SHIM = Array.from({ length: 24 }, (_, i) => [K.hash(i, 301) * K.TAU, 5 + K.hash(i, 302) * 4, K.hash(i, 303) * K.TAU, 11 + K.hash(i, 304) * 5]);
function ridgeShimmer(g, src, t, y0, y1, amt, W) {
  const ps = K.pixelScale();
  const n = Math.min(24, Math.max(4, Math.round((y1 - y0) / 4))), sh = (y1 - y0) / n;
  g.save();
  g.globalAlpha = 0.65;
  for (let i = 0; i < n; i++) {
    const [p1, f1, p2, f2] = SHIM[i];
    const env = Math.sin(((i + 0.5) / n) * Math.PI);
    const off = (Math.sin(t * f1 + p1) * 0.7 + Math.sin(t * f2 + p2) * 0.3) * amt * env;
    if (Math.abs(off) < 0.08) continue;
    const y = y0 + i * sh;
    g.drawImage(src, 0, y * ps, W * ps, sh * ps, off, y, W, sh);
  }
  g.restore();
}
function shotLeave(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 42, 52.4));
  const L = K.layer(W, H, "f10leave");
  const c = L.g;
  const { prof, spr: ridgeSpr } = leaveRidge(W, H);
  const rimAt = prof.at;
  K.withCamera(c, W, H, { x: 480 + p * 30, y: 280, zoom: 1.0 + p * 0.04, shakeT: t, shakeAmt: 0.8 }, () => {
    stampBackdrop(c, leaveBack(W, H), W, H);
    // the Shadow: it is simply THERE on the far ridge behind them for two seconds (0.3 s fades),
    // a figure blocking the moon, then it thins away into smoke
    const on = K.smooth(K.seg(t, 48.3, 48.6)) * (1 - K.smooth(K.seg(t, 50.3, 50.6)));
    const gone = K.seg(t, 50.3, 51.1);
    if (on > 0.004) {
      const sy = rimAt(SHADOW_X) + 2;
      c.save();
      c.globalAlpha = on;
      c.drawImage(shadowSprite(), SHADOW_X - 150, sy - 292, 300, 300);
      c.restore();
    }
    if (gone > 0 && gone < 1) {
      // smoke peeling up off where it stood (dark, against the moon)
      const sp = K.glowSprite("#0a0b12");
      c.save();
      for (let i = 0; i < 7; i++) {
        const k = K.hash(i, 77);
        c.globalAlpha = 0.32 * Math.sin(gone * Math.PI) * (0.6 + 0.4 * k);
        const r = 26 + 30 * gone + k * 14;
        c.drawImage(sp, SHADOW_X + (k - 0.5) * 60 + gone * 18 - r, rimAt(SHADOW_X) - 40 - i * 22 - gone * 50 - r, r * 2, r * 2);
      }
      c.restore();
    }
    SMALL.forEach(([dx], i) => {
      const fgo = K.seg(t, 47.6 + i * 0.3, 50.6 + i * 0.3);
      if (fgo >= 1) return;
      const fx = 430 + dx * 2.8 + fgo * 60;
      const k = K.lerp(1, 0.5, fgo);
      const sink = K.smooth(K.seg(fgo, 0.7, 1)) * 70;
      const walking = fgo > 0 && fgo < 1;
      // each cat has its own cadence and stride phase; the body bobs twice a stride
      const cyc = t * (1.32 + K.hash(i, 61) * 0.34) + K.hash(i, 62);
      const q = walking ? Math.floor((((cyc % 1) + 1) % 1) * 8) % 8 : -1;
      const bob = walking ? -Math.abs(Math.sin(cyc * Math.PI * 2)) * 1.6 : 0;
      c.save(); c.translate(fx, rimAt(fx) + 4 + sink + bob * k); c.scale(k, k);
      stampSil(c, lvCat(i, walking, q), 0, 0, 1);
      c.restore();
    });
    const B = biscuitWalkAway(t);
    const pose = t < 44.6 ? "sit" : B.walking ? "walk" : "stand";
    const bx = B.x, gy0 = rimAt(bx) + 4 + B.sink * 90;
    const fade = 1 - K.smooth(K.seg(B.sink, 0.7, 1));
    if (pose === "walk") {
      // weight: the body drops onto each planted foreleg (twice a stride), the head counter-bobs a
      // little later (it is held level), the spine pitches as the shoulder blades ride up
      const cyc = (t - 47.2) * 1.3;
      const q = Math.floor((((cyc % 1) + 1) % 1) * 10) % 10;
      const cs = bisWalk(q);
      const st = Math.sin(cyc * K.TAU * 2);
      const bob = -Math.abs(Math.sin(cyc * Math.PI * 2)) * 2.4;
      const hb = Math.sin(cyc * K.TAU * 2 - 0.9) * 1.1;
      const pitch = st * 0.012;
      c.save(); c.translate(bx, gy0 + bob * B.scale); c.scale(B.scale, B.scale); c.rotate(pitch);
      if (fade < 1) c.globalAlpha *= fade;
      c.drawImage(cs.body, -cs.ax, -cs.ay, cs.w, cs.h);
      c.drawImage(cs.head, -cs.ax, -cs.ay - bob * 0.85 + hb, cs.w, cs.h);
      c.restore();
    } else {
      const bcs = B.pause ? bisLook(Math.round(B.look * 4) / 4) : bisIdle(pose, Math.round(K.env(t, 45.8, 46.3, 0.12, 0.15) * 2) / 2);
      c.save(); c.translate(bx, gy0); c.scale(B.scale, B.scale);
      stampSil(c, bcs, 0, 0, fade);
      if (B.pause && B.look > 0.3) {
        // two points of lava light in the black: the only time we see his eyes in this shot
        const k = K.clamp((B.look - 0.3) / 0.5);
        for (const ex of [104, 118]) {
          K.glow(c, ex, -146, 12, "#ff9a40", 0.5 * k);
          c.fillStyle = K.rgba("#ffd890", 0.9 * k);
          c.beginPath(); c.ellipse(ex, -146, 2.2, 1.6, 0, 0, K.TAU); c.fill();
        }
      }
      c.restore();
    }
    stampBackdrop(c, ridgeSpr, W, H);
  });
  g.drawImage(L.canvas, 0, 0, W, H);
  // a mile of hot air: the ridge line and everything standing on it swims a pixel
  ridgeShimmer(g, L.canvas, t, 360, 452, 1.1, W);
  const drop = K.env(t, 47.9, 49.4, 0.2, 1.2);
  if (drop > 0) K.fadeBlack(g, W, H, drop * 0.18);
  embers(g, W, H, t, { count: 18, size: 2.2, area: [0, 120, W, 420], seed: 11 });
}

// ---- SHOT 6 [52-62] you, small, sitting down hard on the rim -------------------------------------
function sittingKidProfile(g, x, y, s, t) {
  // In profile, facing the crater (right): knees drawn up, arms round the shins, hood up, head
  // bowed. Backlit by the lava: the faces toward us are dark, a warm rim on every edge facing it.
  const breathe = Math.sin(t * 1.3) * s * 0.004;
  const P = (u, v) => [x + u * s, y + v * s];
  const hip = P(-0.05, -0.1), knee = P(0.2, -0.36), ankle = P(0.28, -0.05), toe = P(0.38, -0.01);
  const sh = P(0.02, -0.5 + breathe / s), elbow = P(0.2, -0.27), hands = P(0.27, -0.3);
  const head = P(0.15, -0.55 + breathe / s);
  const all = new Path2D();
  const legs = new Path2D();
  K.tube(legs, [hip[0], hip[1], knee[0], knee[1]], [s * 0.13, s * 0.105], 3, true, true);
  K.tube(legs, [knee[0], knee[1], ankle[0], ankle[1]], [s * 0.1, s * 0.08], 3, true, false);
  const boot = new Path2D();
  boot.moveTo(ankle[0] - s * 0.05, ankle[1] - s * 0.07);
  boot.lineTo(ankle[0] + s * 0.045, ankle[1] - s * 0.07);
  boot.lineTo(ankle[0] + s * 0.05, ankle[1] - s * 0.01);
  boot.quadraticCurveTo(toe[0] + s * 0.02, toe[1] - s * 0.03, toe[0] + s * 0.015, toe[1]);
  boot.lineTo(ankle[0] - s * 0.055, toe[1] + s * 0.004);
  boot.closePath();
  const torso = new Path2D();
  torso.moveTo(hip[0] - s * 0.09, hip[1] + s * 0.06);
  torso.bezierCurveTo(hip[0] - s * 0.14, hip[1] - s * 0.18, sh[0] - s * 0.14, sh[1] + s * 0.02, sh[0] - s * 0.02, sh[1] - s * 0.04);
  torso.quadraticCurveTo(sh[0] + s * 0.1, sh[1] - s * 0.02, sh[0] + s * 0.14, sh[1] + s * 0.1);
  torso.lineTo(knee[0] - s * 0.04, knee[1] + s * 0.02);
  torso.lineTo(hip[0] + s * 0.1, hip[1] + s * 0.06);
  torso.closePath();
  const armP = new Path2D();
  K.tube(armP, [sh[0] + s * 0.04, sh[1] + s * 0.03, elbow[0] - s * 0.02, elbow[1] - s * 0.04, hands[0], hands[1]], [s * 0.075, s * 0.07, s * 0.06], 4, true, true);
  const hd = new Path2D();
  K.ellipsePath(hd, head[0], head[1], s * 0.085, s * 0.095, 0.5);
  all.addPath(legs); all.addPath(torso); all.addPath(armP); all.addPath(hd); all.addPath(boot);
  const box = [x - s * 0.4, y - s * 0.8, x + s * 0.6, y + s * 0.05];
  // contact shadow on the rock (the lava is beyond, so it falls toward us, short and soft)
  K.shadowBlob(g, x + s * 0.12, y + s * 0.01, s * 0.32, s * 0.035, { alpha: 0.75 });
  g.fillStyle = "#0c0e18"; g.fill(legs);
  g.fillStyle = "#2a0a0a"; g.fill(boot);
  const tg = g.createLinearGradient(x - s * 0.2, 0, x + s * 0.3, 0);
  tg.addColorStop(0, "#1c160a"); tg.addColorStop(1, "#3a2c0c");
  g.fillStyle = tg; g.fill(torso); g.fill(hd);
  g.fillStyle = "#2a200a"; g.fill(armP);
  g.save(); g.clip(torso);
  g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = s * 0.012; g.lineCap = "round";
  for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(sh[0] - s * 0.08 + k * s * 0.03, sh[1] + s * 0.08 + k * s * 0.05); g.quadraticCurveTo(sh[0] + s * 0.04, sh[1] + s * 0.12 + k * s * 0.05, sh[0] + s * 0.1, sh[1] + s * 0.18 + k * s * 0.04); g.stroke(); }
  g.restore();
  // the lava rim (soft, a falloff not a line) and a faint cool moon edge on top
  K.crescent(g, all, -s * 0.016, s * 0.004, "#ff7a3a", 0.6, box, "lighter", 4);
  K.crescent(g, all, -s * 0.007, s * 0.002, "#ffc080", 0.3, box, "lighter", 2);
  K.crescent(g, all, -MOON_DIR[0] * s * 0.01, -MOON_DIR[1] * s * 0.01, MOON, 0.25, box, "lighter", 3);
}
function ledgeSprite(W) {
  return K.sprite("f10ledge3", W + 40, 200, (s) => {
    s.translate(20, -400);
    const ledge = ridgePts(-20, W + 20, 452, 18, 41, 0.006);
    ridge(s, ledge, 620, { scale: 120, squash: 0.5, seed: 31, under: 0.1, moonA: 0.8, amb: "#181824", moonEdge: 0.9, edge: 1.4, crestH: 10, vesicles: 1.4 });
  });
}
function shotAlone(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 52, 62.4));
  K.withCamera(g, W, H, { x: 482 + p * 28, y: 285 + p * 8, zoom: 1.03 + p * 0.09, shakeT: t, shakeAmt: 0.7 }, () => {
    vista(g, t, W, H, { dy: 40 });
    g.drawImage(ledgeSprite(W), -20, 400, W + 40, 200);
    const kx = 330, ky = 452;
    const sit = K.ease.out(K.seg(t, 52.2, 53.0));
    if (sit < 1) {
      g.save(); g.globalAlpha = 1 - sit;
      K.drawPerson(g, kx, ky, 120, { view: "side", facing: 1, crouch: sit, t, hood: true, light: { x: 480, y: 360, color: LAVA, strength: 1.3, z: -0.6 }, ambient: "#10141f" });
      g.restore();
    }
    if (sit > 0) {
      g.save(); g.globalAlpha = sit;
      sittingKidProfile(g, kx, ky + (1 - sit) * -6, 120, t);
      g.restore();
    }
    const dst = K.env(t, 52.7, 54.4, 0.15, 1.2);
    if (dst > 0) {
      const sp = K.glowSprite("#4a3a3a");
      g.save(); g.globalAlpha = 0.3 * dst;
      for (let i = 0; i < 5; i++) g.drawImage(sp, kx - 40 + i * 18 - (t - 52.7) * (10 - i * 5), ky - 16 - (t - 52.7) * 6, 30, 22);
      g.restore();
    }
  });
  embers(g, W, H, t, { count: 50, size: 1.6, area: [0, 60, W, 470], seed: 12, wind: 22 });
  bokehEmbers(g, W, H, t, { count: 6, size: 20, seed: 31, alpha: 0.35 });
}

// ---- SHOT 7 [62-72] over the shoulder: the doorway of nothing opens in the sky ----------------------
const DOOR = { x: 600, y: 196, half: 86 };
function voidBack(W, H) {
  return K.sprite("f10voidbg4", W + 80, H + 80, (s) => {
    s.translate(40, 40);
    nightSky(s, W, H, 400, 1);
    K.stars(s, W, H, 17, 0.9, 0, { yMax: 360 });
    // a richer field of faint stars around where the doorway will open (so their absence reads)
    const R = K.rng("f10doorfield");
    for (let i = 0; i < 420; i++) {
      const x = DOOR.x + (R() - 0.5) * 520, y = DOOR.y + (R() - 0.5) * 300;
      const dd = Math.max(Math.abs(x - DOOR.x), Math.abs(y - DOOR.y));
      if (dd < DOOR.half + 3) continue;
      const m = R();
      s.fillStyle = K.rgba(m > 0.8 ? "#fff0e4" : "#c8d4ff", 0.25 + m * 0.5);
      const z = m > 0.93 ? 1.4 : 0.9;
      s.fillRect(x - z / 2, y - z / 2, z, z);
    }
  });
}
function voidRidge(W, H) {
  return K.sprite("f10voidridge3", W + 80, H + 80, (s) => {
    s.translate(40, 40);
    const pts = rimProfile("void", W + 80, 360, 16, 0.004).pts.map((q) => [q[0] - 40, q[1]]);
    ridge(s, pts, H + 60, { scale: 120, squash: 0.4, seed: 37, under: 0.7, moonA: 0.9, amb: "#24263a", moonEdge: 0.55, edge: 1.2, crestH: 10, haze: 0.22 });
    smokeBand(s, W, H, 0, 400, 110, 0.35);
  });
}
function voidKid(W, H, stq) {
  return K.sprite("f10voidkid5:" + stq, W, H, (s) => {
    const L = K.layer(W, H, "f10voidkidL");
    K.drawPerson(L.g, 210, 870 - stq * 40, 560, { view: "back", hood: true, t: 63, bell: true, shadow: false, breathe: false, light: { x: 620, y: 900, color: "#ff7a3a", strength: 0.85, z: -0.6 }, ambient: "#0e111c" });
    // the lava ahead wraps a warm rim round the hood and the far shoulder (over-the-shoulder read)
    alphaRim(L.g, L.canvas, W, H, { dir: [0.85, -0.5], width: 6, color: "#ff8a40", alpha: 0.4, soft: 3 });
    if (K.hasFilter()) s.filter = "blur(2px)";
    s.drawImage(L.canvas, 0, 0, W, H);
    s.filter = "none";
  });
}
function shotVoid(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 62, 72));
  const open = K.ease.inOut(K.seg(t, 63.8, 68.6));
  K.withCamera(g, W, H, { x: 480 + p * 20, y: 270 - p * 14, zoom: 1.0 + p * 0.07, shakeT: t, shakeAmt: 1 }, () => {
    g.drawImage(voidBack(W, H), -40, -40, W + 80, H + 80);
    const vx = DOOR.x, vy = DOOR.y, half = DOOR.half * open;
    K.moon(g, 830, 90, 18, { glow: 0.6, halo: "#8a9ad0" });
    if (half > 0.5) {
      // the hole: a square of absolute black with a knife edge. Everything behind it is gone.
      const hole = new Path2D();
      hole.rect(vx - half, vy - half, half * 2, half * 2);
      g.fillStyle = "#000000";
      g.fill(hole);
      // light bends round its edge: the stars just outside are smeared along the rim, pushed outward
      const R = K.rng("f10lens");
      g.save();
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 160; i++) {
        const side = Math.floor(R() * 4), u = R() * 2 - 1, d = Math.pow(R(), 1.6) * 60;
        const m = R();
        const push = (1 - d / 60) * 9 * open;
        const len = (1 - d / 60) * 7 * open + 0.8;
        let x, y, tx, ty;
        if (side === 0) { x = vx + u * half; y = vy - half - 2 - d - push; tx = 1; ty = 0; }
        else if (side === 1) { x = vx + half + 2 + d + push; y = vy + u * half; tx = 0; ty = 1; }
        else if (side === 2) { x = vx + u * half; y = vy + half + 2 + d + push; tx = 1; ty = 0; }
        else { x = vx - half - 2 - d - push; y = vy + u * half; tx = 0; ty = 1; }
        const tw = 0.6 + 0.4 * Math.sin(t * (1.5 + m * 3) + i * 1.7);
        g.globalAlpha = (0.2 + m * 0.55) * tw * open;
        g.fillStyle = m > 0.85 ? "#fff4ea" : "#cad7ff";
        g.fillRect(x - tx * len / 2 - 0.4, y - ty * len / 2 - 0.4, tx * len + 0.8, ty * len + 0.8);
      }
      g.restore();
      // a 1px chromatic fringe on the knife edge (cool outside, warm inside)
      g.save();
      g.lineWidth = 1;
      g.strokeStyle = K.rgba(MOON, 0.22 * open);
      g.strokeRect(vx - half - 0.5, vy - half - 0.5, half * 2 + 1, half * 2 + 1);
      g.strokeStyle = K.rgba("#ff8a5a", 0.06 * open);
      g.strokeRect(vx - half + 0.5, vy - half + 0.5, half * 2 - 1, half * 2 - 1);
      g.restore();
      // cold motes drifting INTO it from all round
      for (let i = 0; i < 24; i++) {
        const ph = ((t * 0.25 + K.hash(i, 4)) % 1);
        const a = K.hash(i, 5) * K.TAU, d = half * 1.45 + 140 * (1 - ph);
        K.glow(g, vx + Math.cos(a) * d, vy + Math.sin(a) * d, 3.5, "#c8c8ff", 0.55 * ph * open);
      }
    }
    g.drawImage(voidRidge(W, H), -40, -40, W + 80, H + 80);
    K.glow(g, 480, 560, 520, LAVA, 0.18);
    const stand = K.ease.out(K.seg(t, 62, 63.4));
    const stq = Math.round(stand * 8) / 8;
    // you, close and out of focus in the foreground (the doorway is the subject)
    g.drawImage(voidKid(W, H, stq), 0, Math.sin(t * 1.4) * 1.2, W, H);
  });
  embers(g, W, H, t, { count: 22, size: 1.8, area: [0, 120, W, 420], seed: 13 });
}

// ---- edit -------------------------------------------------------------------------------------------
const SHOTS = [
  [0, 10, shotCrane], [10, 20, shotSpring], [20, 30, shotLongLens], [30, 42, shotShout],
  [42, 52, shotLeave], [52, 62, shotAlone], [62, 72.5, shotVoid],
];
// every edit is a hard cut (cutting on action / on the sound hits)
function render(g, t, W, H) {
  let i = SHOTS.findIndex((s) => t < s[1]);
  if (i < 0) i = SHOTS.length - 1;
  SHOTS[i][2](g, t, W, H);

}
// throwaway layer for warming a whole shot's caches
function warmShot(fn, t, W, H) { const L = K.layer(W, H, "f10warm"); fn(L.g, t, W, H); }
// progressive bakes: [from, until, key, w, h, fn]
const PROG = [];
for (let k = 0; k < STEAM.n; k++) PROG.push([0.2, 9.95, steamKey(k), STEAM.rw, STEAM.rh, steamFn(k)]);
PROG.push([0.2, 19.9, MOONKEY, MOONRES, MOONRES, moonFn]);
function warmPlan(W, H) {
  const P = [];
  let at = 0.06;
  const add = (fn, dt = 0.3) => { P.push([at, fn]); at += dt; };
  // during the crane (0-10): everything shot 2 needs, then the long-lens silhouettes
  add(() => hotSpringBg(W, H)); add(() => poolRocks(W, H, false)); add(() => poolRocks(W, H, true));
  add(() => poolWater(W, H)); add(() => furSource()); add(() => furNoise());
  add(() => springCat(0), 0.4); add(() => springCat(1), 0.4); add(() => springCatRefl(0)); add(() => springCatRefl(1)); add(() => springPaws(), 0.4);
  add(() => warmShot(shotSpring, 10.4, W, H));
  for (let i = 0; i < 4; i++) add(() => llCat(i));
  add(() => llBis());
  // during the hot spring (10-20): the long-lens backdrop (the moon is baked by then), the shout's
  // backdrop and kid
  at = 13;
  for (let i = 0; i < 4; i++) add(() => catSil("sh" + i, 60 * SMALL[i][2], { pose: SMALLPOSE(i), facing: SMALL[i][0] < 0 ? 1 : -1, coat: K.COATS[SMALL[i][1]], collar: false, headTurn: 0.4 }));
  for (const sq of [0.2, 0.4, 0.6, 0.8, 1]) add(() => shoutKidSprite(W, H, sq, 0));
  add(() => shoutKidSprite(W, H, 0.2, KIDBLUR));
  // the moon has been baking a few ms a frame since 0.2 s: now the backdrops that hold it
  at = 18.6;
  add(() => warmShot(shotLongLens, 25, W, H));
  add(() => farRimSprite(W, H, { moonX: 640, moonY: 210, moonR: 96, rimY: 330, amp: 14 }));
  // during the long lens (20-30): every head-tilt / mouth state of the shout's backdrop
  at = 22.8;
  for (const [tq, mq] of [[0, 0], [0, 0.5], [0, 1], [0.1, 0], [0.2, 0], [0.3, 0], [0.4, 0], [0.5, 0], [0.6, 0], [0.7, 0], [0.8, 0], [0.9, 0], [1, 0], [1, 0.5], [1, 1]]) add(() => shotShoutBg(0, W, H, tq, mq), 0.45);
  // during the shout (30-42): the walk-away backdrops and every silhouette pose it will need
  at = 30.1;
  add(() => leaveBack(W, H)); add(() => leaveRidge(W, H)); add(() => shadowSprite()); add(() => ledgeSprite(W));
  for (const bq of [0, 0.5, 1]) add(() => bisIdle("sit", bq), 0.2);
  for (const bq of [0, 0.5, 1]) add(() => bisIdle("stand", bq), 0.2);
  for (let i = 0; i < 4; i++) add(() => lvCat(i, false, -1), 0.2);
  for (let q = 0; q < 10; q++) add(() => bisWalk(q), 0.2);
  for (let q = 0; q < 8; q++) for (let i = 0; i < 4; i++) add(() => lvCat(i, true, q), 0.17);
  for (const lq of [0, 0.25, 0.5, 0.75, 1]) add(() => bisLook(lq), 0.17);
  // during the crater wide (52-62): the doorway shot
  at = 54;
  add(() => voidBack(W, H)); add(() => voidRidge(W, H));
  for (let k = 0; k <= 8; k++) add(() => voidKid(W, H, k / 8));

  return P;
}

export const film = {
  id: 10,
  title: "So Close",
  chapter: "Chapter 10",
  unlockAt: 50,
  duration: D,
  poster: 40,
  tagline: "Halfway. Close enough to hear him.",
  subs: [
    [3.0, 7.0, "The top of the world. Burning."],
    [11.0, 15.5, "Someone was having a much better night than you."],
    [23.0, 27.5, "And then, across the fire. Him."],
    [31.0, 33.5, "You shouted his name."],
    [35.0, 39.5, "He meowed back. He knew you."],
    [43.0, 47.5, "Then he turned around."],
    [48.0, 51.5, "And he walked away."],
    [53.5, 58.5, "Fifty cats. And he walked away."],
    [63.0, 66.5, "But he looked back. He always looks back."],
    [67.0, 71.0, "Into the nothing. After him."],
  ],
  voice: [
    [3.0, "The top of the world. Burning.", { rate: 0.92, pitch: 1.0 }],
    [11.0, "Someone was having a much better night than you.", { rate: 1.0, pitch: 1.1 }],
    [23.0, "And then, across the fire. Him.", { rate: 0.92, pitch: 1.0 }],
    [31.0, "You shouted his name.", { rate: 0.92, pitch: 1.0 }],
    [35.0, "He meowed back. He knew you.", { rate: 0.92, pitch: 1.0 }],
    [43.0, "Then he turned around.", { rate: 0.85, pitch: 0.95 }],
    [48.0, "And he walked away.", { rate: 0.85, pitch: 0.95 }],
    [53.5, "Fifty cats. And he walked away.", { rate: 0.85, pitch: 0.95 }],
    [63.0, "But he looked back. He always looks back.", { rate: 0.92, pitch: 1.0 }],
    [67.0, "Into the nothing. After him.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: { mood: "epic", key: "B", bpm: 76, cues: [[3, "swell"], [22, "hit"], [34, "meow"], [40, "meow"], [48, "drop"], [64, "swell"]] },
  // two-tone night through the lens: lava and the moon are the only near-clipped lights (they bloom
  // and halate); deep blacks with only a breath of blue, warm highlights, fine grain
  grade: {
    exposure: 0.95, temp: 0.03, tint: 0, lift: [0.0015, 0.0015, 0.006], gamma: [1, 1, 1.03], gain: [1.03, 1, 0.97],
    sat: 0.97, contrast: 1.13, bloom: 0.42, threshold: 0.9, halation: 0.55, streak: 0.03, grain: 0.04, vignette: 0.45, ca: 0.6, weave: 1,
  },
  gradeAt(t) {
    // the long-lens shots against the moon run cooler; the doorway drains the warmth out of the end
    if (t >= 20 && t < 30) return { temp: -0.02 };
    if (t >= 42 && t < 52) return { temp: -0.03 };
    if (t >= 62) return { temp: K.lerp(0.04, -0.08, K.smooth(K.seg(t, 64, 70))), sat: K.lerp(0.94, 0.8, K.smooth(K.seg(t, 64, 70))) };
    return null;
  },
  draw(g, t, W, H) {
    g.save();
    if (W !== 960 || H !== 540) g.scale(W / 960, H / 540);
    const w = 960, h = 540;
    render(g, t, w, h);
    try { warmTick(t, w, h); } catch (err) { console.warn("[f10] warm", err); }
    K.letterbox(g, w, h, 1);
    K.title(g, w, h, "So Close", "Chapter 10", K.env(t, 2, 6, 0.9, 1.0), { glow: "#ffb07a" });
    K.fadeBlack(g, w, h, 1 - K.smooth(K.seg(t, 0, 1.4)));
    K.fadeBlack(g, w, h, K.smooth(K.seg(t, 69.6, 72)));
    g.restore();
  },
};
