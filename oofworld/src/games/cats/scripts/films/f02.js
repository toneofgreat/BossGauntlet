// films/f02.js - Chapter 2: "The Hole in the Fence" (FILMS.md f02). 64 s, golden hour, sad.
// In the meadow's golden hour you find orange fur caught on a nail under an old picket fence, which
// brings back a summer memory of kitten Biscuit squeezing under your fence at home - and always
// looking back, just once. You keep the fur, and follow him toward the lights of a town.
//
// v4 "photographic" re-shoot (REALISM.md):
//  - real perspective: the fences are projected 3D boards (pinhole camera, metres), angled into depth,
//    pickets defocused by their circle of confusion (pre-blurred sprite buckets, never per frame);
//  - painted wood: one baked texture per board seed (fbm grain, paint flaking to silvered wood, moss and
//    dirt at the foot), per-board cylindrical shading, lit bevel, rail contact occlusion;
//  - the kitten in the flashback is a cut-out rig of baked fur masses (per-pixel lit: backlit rim,
//    sky fill, green lawn bounce, translucent ear and fringe) with kitten proportions;
//  - every shot has one motivated key; the lens (film.gradeAt) does bloom, halation, grain and colour.
// draw(g, t, W, H) is a pure function of t; every cache key is a fixed constant or a small bucket.
import * as K from "../filmkit.js";
import { petals, W0 as W, H0 as H } from "./lib012.js";

const PX = () => K.pixelScale();

// ---- small helpers ---------------------------------------------------------------------------------------------
// a sprite painted once, then blurred once (static depth of field, never per frame)
function blurSprite(key, w, h, px, paint) {
  const raw = K.sprite(key + ":raw", w, h, paint);
  if (px <= 0.3) return raw;
  return K.sprite(key + ":b" + px, w, h, (s) => {
    const ps = PX();
    if (K.hasFilter()) {
      // pad by drawing the edge-clamped image so the blur does not fade the borders to transparent
      s.filter = `blur(${K.qblur((px * ps).toFixed(2))}px)`;
      s.drawImage(raw, 0, 0, w, h);
      s.filter = "none";
    } else {
      const k = Math.max(1, px / 1.5);
      const tmp = K.makeCanvas(Math.ceil((w * ps) / k), Math.ceil((h * ps) / k));
      const tg = tmp.getContext("2d");
      tg.imageSmoothingEnabled = true;
      tg.drawImage(raw, 0, 0, tmp.width, tmp.height);
      s.imageSmoothingEnabled = true;
      s.drawImage(tmp, 0, 0, w, h);
    }
  });
}
// a cheap motion blur: draw an image n times along (dx, dy) with equal weights (1, 1/2, 1/3, ...)
function smear(g, img, x, y, w, h, dx, n, dy = 0) {
  if (n <= 1 || Math.abs(dx) + Math.abs(dy) < 1) { g.drawImage(img, x, y, w, h); return; }
  const a0 = g.globalAlpha;
  for (let i = 0; i < n; i++) {
    g.globalAlpha = a0 / (i + 1);
    const k = i / (n - 1) - 0.5;
    g.drawImage(img, x + dx * k, y + dy * k, w, h);
  }
  g.globalAlpha = a0;
}
const hillY = (x, o) => {
  const seed = o.seed || 1, freq = o.freq || 1;
  const base = 0.5 + 0.5 * K.fbm((x / 320) * freq + seed * 10, seed);
  const det = K.texRidged((x / 140) * freq + seed * 3.1, seed * 1.7, seed, 4) - 0.35;
  return o.y - o.amp * (base + det * 0.22);
};
const sstep = (a, b, x) => { const k = K.clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };

// pinhole camera in metres: x right, y up, z forward. cam {x, y, z, f, cx, cy}
function P3(c, x, y, z) {
  const zz = Math.max(0.03, z - c.z);
  return [c.cx + (c.f * (x - c.x)) / zz, c.cy - (c.f * (y - c.y)) / zz, zz];
}

// ---- materials -------------------------------------------------------------------------------------------------
// painted picket board: vertical grain (warped fbm rings + fibres) telegraphing through old warm-white
// enamel. The paint flakes off in grain-aligned patches (worse at the foot and the edges) to bare,
// weathered grey-brown wood with open dark latewood lines; every flake has a 1-2 px dark crack where the
// film has lifted and a lighter chipped lip on the paint side. Grey water streaks from the top; dirt
// and moss at the foot. `sheen` bakes a glossy band near the lit edge on the surviving paint (macro).
function picketTex(seed, sheen = 0, paintK = 0) {
  const TW = 128, TH = 768;
  return K.texBake("f02-pickettex7:" + seed + ":" + sheen + ":" + paintK, TW, TH, (u, v, out) => {
    const s = seed * 17 + 3;
    const warp = K.texNoise(u * 2.5, v * 0.7, s + 11) * 0.07;
    const uu = u + warp;
    const ring = K.texFbm(uu * 11, v * 0.45, s + 1, 3);
    const fib = K.texNoise(uu * 70, v * 3.2, s + 3) * 0.6 + K.texNoise(uu * 150, v * 6, s + 2) * 0.4;
    const grain = ring * 0.75 + fib * 0.25;
    // bare wood: silvery grey-brown, darker open latewood lines running the length of the board
    const late = Math.pow(Math.abs(Math.sin((uu * 9 + ring * 0.9) * Math.PI)), 10);
    let r = 150 + grain * 32 - late * 34, gg = 136 + grain * 28 - late * 32, b = 116 + grain * 22 - late * 28;
    const edge = Math.min(u, 1 - u);
    const flake = K.texFbm(u * 4, v * 8, s + 4, 4) * 0.62 + K.texFbm(u * 16, v * 26, s + 5, 3) * 0.38 + late * 0.06;
    const wear = flake + Math.max(0, (v - 0.62) / 0.38) * 0.36 + Math.max(0, 0.06 - edge) * 3.5 + Math.max(0, 0.04 - v) * 3;
    const cov = 0.19 + paintK - wear;
    let paint = 0;
    if (cov > 0) {
      paint = 1;
      const blot = K.texFbm(u * 3, v * 0.9, s + 6, 3);
      const brush = K.texNoise(u * 46, v * 1.4, s + 13) * 0.6 + K.texNoise(u * 120, v * 3, s + 14) * 0.4;
      const grime = Math.max(0, K.texFbm(u * 4, v * 2.2, s + 15, 3)) * 0.12;
      r = 228 + blot * 12 + grain * 13 + brush * 6; gg = 222 + blot * 11 + grain * 13 + brush * 6; b = 207 + blot * 10 + grain * 11 + brush * 5;
      // fine crazing of old enamel, dirt settled in the cracks
      const cz = K.texRidged(u * 16, v * 5.5, s + 16, 3);
      if (cz > 0.86) { const k = (cz - 0.86) / 0.14; r -= 34 * k; gg -= 36 * k; b -= 38 * k; }
      r *= 1 - grime; gg *= 1 - grime; b *= 1 - grime * 1.1;
      // the chipped lip of a flake: the paint film's broken edge catches the light
      if (cov < 0.03) { const k = 1 - cov / 0.03; r += 18 * k; gg += 17 * k; b += 14 * k; }
    } else if (cov > -0.014) {
      // the crack: a thin dark line where the film has lifted off the wood
      const k = 1 - Math.abs(cov + 0.007) / 0.007;
      const d = 0.5 + 0.25 * (1 - Math.max(0, k));
      r *= d; gg *= d; b *= d;
    } else if (cov > -0.04) {
      // a soft shadow under the lifted paint, falling onto the bare wood
      const k = 1 + (cov + 0.014) / 0.026;
      r *= 1 - 0.18 * k; gg *= 1 - 0.18 * k; b *= 1 - 0.16 * k;
    }
    const streak = Math.max(0, K.texNoise(u * 14, 0.5, s + 8)) * Math.max(0, 1 - v * 2.2) * 0.14;
    r *= 1 - streak; gg *= 1 - streak; b *= 1 - streak * 0.8;
    const foot = K.clamp((v - 0.7) / 0.3);
    const moss = Math.pow(foot, 1.5) * (0.55 + 0.45 * K.texFbm(u * 7, v * 16, s + 9, 3));
    const dirt = foot * foot * 0.55;
    r = K.lerp(r, 72, moss * 0.55); gg = K.lerp(gg, 88, moss * 0.55); b = K.lerp(b, 36, moss * 0.55);
    r = K.lerp(r, 80, dirt * 0.5); gg = K.lerp(gg, 66, dirt * 0.5); b = K.lerp(b, 50, dirt * 0.5);
    if (sheen && paint) {
      // glossy enamel: a specular band near the lit edge, broken by the brush ridges, rolling off to matte
      const sp = Math.exp(-Math.pow((u - 0.78) / 0.07, 2)) * (0.55 + 0.45 * K.texNoise(u * 4, v * 1.5, s + 12)) * (0.8 + 0.2 * K.texNoise(u * 46, v * 1.4, s + 13));
      const mt = Math.exp(-Math.pow((u - 0.72) / 0.2, 2)) * 0.4;
      r += (40 * sp + 10 * mt) * sheen; gg += (36 * sp + 9 * mt) * sheen; b += (30 * sp + 6 * mt) * sheen;
    }
    out[0] = r; out[1] = gg; out[2] = b; out[3] = 255;
  });
}
function picketShape(p, w, h, broken) {
  const tip = w * 0.5;
  p.moveTo(0, h - broken);
  p.lineTo(0, tip);
  p.lineTo(w * 0.5, 0);
  p.lineTo(w, tip);
  if (!broken) { p.lineTo(w, h); p.closePath(); return; }
  // rotted, splintered end: an irregular tear, a couple of long slivers, mostly ragged short fibre
  const R = K.rng("splinter" + w + ":" + broken);
  p.lineTo(w, h - broken - 2 - R() * 6);
  let x = w;
  while (x > 0) {
    const step = w * (0.04 + R() * 0.1);
    x = Math.max(0, x - step);
    const sliver = R() > 0.82 ? 6 + R() * 10 : R() * 4;
    p.lineTo(x + step * 0.5, h - broken + sliver);
    p.lineTo(x, h - broken - R() * 6);
  }
  p.closePath();
}
// a picket board sprite (w x h, pointed top). lx: the sun side (-1 left .. 1 right, 0 = no direct sun):
// cylindrical shading (a darker band over the 15% on the shadow side, a lit bevel on the sun side),
// optional nail (rust bleed), broken foot (rotten wood, grey torn fibres), tone (multiply), rim (backlit edge).
function picketSprite(w, h, seed, o = {}) {
  const lx = o.lx == null ? 0.6 : o.lx;
  const res = o.res || 2;
  const key = `f02-pk5:${w}x${h}:${seed}:${lx}:${o.broken || 0}:${o.nail ? o.nail.join(",") : ""}:${o.tone || ""}:${o.rim || ""}:${o.sheen || 0}:${o.rails ? o.rails.join(";") : ""}:${o.railAO == null ? "" : o.railAO}:${o.paint || 0}`;
  return K.sprite(key, w * res, h * res, (s) => {
    s.scale(res, res);
    const p = new Path2D();
    picketShape(p, w, h, o.broken || 0);
    s.save();
    s.clip(p);
    const tex = picketTex(seed % 4, o.sheen || 0, o.paint || 0);
    const R = K.rng("pk" + seed);
    const sx = R() * 10, sy = R() * 60;
    s.drawImage(tex, sx, sy, tex.width - 20, tex.height - 80, 0, 0, w, h);
    // cylindrical shading across the board: the weathered face is slightly crowned, so the sun side
    // reads ~15% brighter, the far side rolls into shade
    const sd = lx >= 0 ? 1 : -1, a = Math.abs(lx);
    const dk = 0.3 + 0.16 * a;
    const cg = s.createLinearGradient(sd > 0 ? 0 : w, 0, sd > 0 ? w : 0, 0);
    cg.addColorStop(0, `rgba(22,16,26,${dk})`);
    cg.addColorStop(0.15, `rgba(22,16,26,${dk * 0.3})`);
    cg.addColorStop(0.45, `rgba(22,16,26,${0.06 * a})`);
    cg.addColorStop(0.62, "rgba(22,16,26,0)");
    cg.addColorStop(1, `rgba(22,16,26,${0.12 - a * 0.1})`);
    s.fillStyle = cg;
    s.fillRect(0, 0, w, h);
    if (a > 0.05) {
      s.globalCompositeOperation = "soft-light";
      const lg = s.createLinearGradient(sd > 0 ? 0 : w, 0, sd > 0 ? w : 0, 0);
      lg.addColorStop(0, "rgba(255,236,206,0)");
      lg.addColorStop(0.55, `rgba(255,236,206,${0.3 * a})`);
      lg.addColorStop(0.85, `rgba(255,236,206,${0.5 * a})`);
      lg.addColorStop(1, `rgba(255,236,206,${0.2 * a})`);
      s.fillStyle = lg;
      s.fillRect(0, 0, w, h);
      s.globalCompositeOperation = "source-over";
    }
    // occlusion where the rails cross the board (o.rails: [y0, y1] sprite px, the rail's band)
    for (const [r0, r1] of o.rails || []) {
      const k = o.railAO == null ? 0.3 : o.railAO;
      const rg = s.createLinearGradient(0, r0 - 4, 0, r1 + (r1 - r0) * 1.2);
      rg.addColorStop(0, "rgba(20,14,16,0)");
      rg.addColorStop(0.2, `rgba(20,14,16,${k * 0.5})`);
      rg.addColorStop(0.55, `rgba(20,14,16,${k})`);
      rg.addColorStop(1, "rgba(20,14,16,0)");
      s.fillStyle = rg;
      s.fillRect(0, r0 - 4, w, r1 - r0 + (r1 - r0) * 1.2 + 4);
    }
    if (a > 0.05) {
      // the lit bevel on the sun-side arris
      s.globalCompositeOperation = "screen";
      const bg = s.createLinearGradient(sd > 0 ? w : 0, 0, sd > 0 ? w - w * 0.1 : w * 0.1, 0);
      bg.addColorStop(0, `rgba(255,226,180,${0.42 * a})`);
      bg.addColorStop(0.35, `rgba(255,226,180,${0.2 * a})`);
      bg.addColorStop(1, "rgba(255,226,180,0)");
      s.fillStyle = bg;
      s.fillRect(0, 0, w, h);
      s.globalCompositeOperation = "source-over";
    }
    // the pointed top's two facets
    s.fillStyle = sd > 0 ? "rgba(20,14,22,0.2)" : "rgba(255,236,205,0.1)";
    s.beginPath(); s.moveTo(0, w * 0.5); s.lineTo(w * 0.5, 0); s.lineTo(w * 0.5, w * 0.5 + 6); s.closePath(); s.fill();
    if (o.tone) { s.globalCompositeOperation = "multiply"; s.fillStyle = o.tone; s.fillRect(0, 0, w, h); s.globalCompositeOperation = "source-over"; }
    if (!o.broken) {
      // contact occlusion: the grass and the ground close in on the bottom 15% of the board
      const ft = s.createLinearGradient(0, h * 0.85, 0, h);
      ft.addColorStop(0, "rgba(30,26,14,0)");
      ft.addColorStop(0.6, "rgba(30,26,14,0.3)");
      ft.addColorStop(1, "rgba(24,20,10,0.66)");
      s.fillStyle = ft;
      s.fillRect(0, h * 0.85, w, h * 0.15);
    }
    if (o.nail) {
      const [nx, ny, nr] = o.nail;
      const rg = s.createLinearGradient(0, ny, 0, ny + nr * 16);
      rg.addColorStop(0, "rgba(110,48,16,0.5)");
      rg.addColorStop(1, "rgba(110,48,16,0)");
      s.fillStyle = rg;
      s.beginPath(); s.moveTo(nx - nr * 0.9, ny); s.quadraticCurveTo(nx - nr * 0.4, ny + nr * 9, nx - nr * 0.1, ny + nr * 16); s.lineTo(nx + nr * 0.5, ny + nr * 13); s.quadraticCurveTo(nx + nr * 0.6, ny + nr * 6, nx + nr * 0.9, ny); s.fill();
      const dg = s.createRadialGradient(nx, ny, nr * 0.8, nx, ny, nr * 2.2);
      dg.addColorStop(0, "rgba(40,30,20,0.35)");
      dg.addColorStop(1, "rgba(40,30,20,0)");
      s.fillStyle = dg;
      s.fillRect(nx - nr * 3, ny - nr * 3, nr * 6, nr * 6);
    }
    if (o.broken) {
      // exposed, rotten wood at the break: dark and damp, pale grey torn fibres (no colour that reads as fur)
      const bg = s.createLinearGradient(0, h - o.broken - 22, 0, h - o.broken + 14);
      bg.addColorStop(0, "rgba(56,46,36,0)");
      bg.addColorStop(0.55, "rgba(56,46,36,0.7)");
      bg.addColorStop(1, "rgba(30,24,18,0.95)");
      s.fillStyle = bg;
      s.fillRect(0, h - o.broken - 22, w, 40);
      const R2 = K.rng("fib" + seed);
      s.strokeStyle = "rgba(146,142,132,0.45)";
      s.lineWidth = 0.6;
      for (let i = 0; i < 20; i++) { const x = R2() * w; s.beginPath(); s.moveTo(x, h - o.broken - 8 - R2() * 8); s.lineTo(x + (R2() - 0.5) * 2, h - o.broken + R2() * 6); s.stroke(); }
    }
    s.restore();
    if (o.rim) {
      // backlit: the sun grazes the arris on its side and the top facet
      s.save();
      s.globalCompositeOperation = "lighter";
      s.strokeStyle = K.rgba(o.rim, 0.55);
      s.lineWidth = 1.6;
      const ex = sd > 0 ? w - 0.8 : 0.8;
      s.beginPath(); s.moveTo(ex, h - (o.broken || 0) - 4); s.lineTo(ex, w * 0.5); s.lineTo(w * 0.5, 0.8); s.stroke();
      s.restore();
    }
    if (o.nail) nailHead(s, o.nail[0], o.nail[1], o.nail[2], lx);
  });
}
function nailHead(g, x, y, r, lx = 0.6) {
  K.shadowBlob(g, x - lx * r * 0.5, y + r * 0.5, r * 1.1, r * 0.9, { alpha: 0.5, soft: 0.6 });
  const gr = g.createRadialGradient(x + lx * r * 0.4, y - r * 0.4, 0, x, y, r);
  gr.addColorStop(0, "#c8b8a4");
  gr.addColorStop(0.35, "#7a6656");
  gr.addColorStop(0.8, "#4a3428");
  gr.addColorStop(1, "#2a1c14");
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r, 0, K.TAU); g.fill();
  const R = K.rng("rust" + r);
  for (let i = 0; i < 9; i++) {
    g.fillStyle = `rgba(${130 + R() * 40},${50 + R() * 20},${18},${0.35 + R() * 0.3})`;
    const a = R() * K.TAU, d = R() * r * 0.8;
    g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.15 + R() * 0.25), 0, K.TAU); g.fill();
  }
  g.fillStyle = "rgba(255,240,220,0.55)";
  g.beginPath(); g.ellipse(x + lx * r * 0.45, y - r * 0.45, r * 0.28, r * 0.16, -0.6, 0, K.TAU); g.fill();
}

// the orange tuft on the nail: a small wad of shed fur. A tangle of short cream underfur round the snag
// carries ~220 guard hairs in clumps of 5-10 that share a direction (the locks they were in on the
// cat), each a slightly wavy curve of its own length: ginger-orange at the root, paler through the
// shaft, cream at the tip. Gravity droops them, the wind lifts the loose ends, and the strands on
// the sun side are lit through (additive glow on their outer half).
function furTuft(g, x, y, t, scale, o = {}) {
  const wind = o.wind == null ? 1 : o.wind;
  const lx = o.lx == null ? 1 : o.lx;
  const gust = Math.sin(t * 1.7) * 0.5 + Math.sin(t * 0.63 + 1) * 0.35 + Math.sin(t * 4.1) * 0.15;
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  g.lineCap = "round";
  g.lineJoin = "round";
  // the dense core where it snagged: a soft warm mass, darker in its own shade
  const mg = g.createRadialGradient(5, 6, 0, 5, 6, 9);
  mg.addColorStop(0, "rgba(140,70,28,0.6)");
  mg.addColorStop(0.6, "rgba(186,104,48,0.3)");
  mg.addColorStop(1, "rgba(200,120,60,0)");
  g.fillStyle = mg;
  g.beginPath(); g.ellipse(5, 6, 9, 7, 0.5, 0, K.TAU); g.fill();
  const under = new Path2D(), under2 = new Path2D();
  for (let i = 0; i < 160; i++) {
    const a0 = K.hash(i, 21) * K.TAU, r0 = Math.sqrt(K.hash(i, 22)) * 4.6;
    const sx = 5 + Math.cos(a0) * r0 * 1.1, sy = 6 + Math.sin(a0) * r0 * 0.85;
    const dir = a0 + (K.hash(i, 23) - 0.5) * 2.2;
    const len = 1.6 + K.hash(i, 24) * 3.6;
    const ex = sx + Math.cos(dir) * len, ey = sy + Math.sin(dir) * len;
    const kx = (K.hash(i, 26) - 0.5) * 2.2, ky = (K.hash(i, 27) - 0.5) * 2.2;
    const p = K.hash(i, 25) > 0.5 ? under : under2;
    p.moveTo(sx, sy);
    p.bezierCurveTo(sx + (ex - sx) * 0.33 + kx, sy + (ey - sy) * 0.33 + ky, sx + (ex - sx) * 0.66 - kx, sy + (ey - sy) * 0.66 - ky, ex, ey);
  }
  g.lineWidth = 0.22;
  g.strokeStyle = "rgba(236,206,160,0.5)"; g.stroke(under);
  g.strokeStyle = "rgba(196,120,60,0.55)"; g.stroke(under2);
  // guard hairs in clumps
  const P = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()]; // root, shaft, tip, dark band, glow
  const N = 220;
  let i = 0, c = 0;
  while (i < N) {
    const n = 5 + Math.floor(K.hash(c, 30) * 6);
    const ca = -0.9 + K.hash(c, 31) * 3.6;                 // the clump's direction (mostly out and down)
    const cr = 1.2 + K.hash(c, 32) * 3.4;
    const cx = 5 + Math.cos(ca) * cr * 0.8, cy = 6 + Math.sin(ca) * cr * 0.6;
    const clen = 6 + Math.pow(K.hash(c, 33), 1.3) * 11;
    const cbow = (K.hash(c, 42) - 0.5) * 1.6;
    const lock = (gust + Math.sin(t * 3.3 + c * 1.9) * 0.25) * wind;
    for (let k = 0; k < n && i < N; k++, i++) {
      const sx = cx + (K.hash(i, 34) - 0.5) * 1.6, sy = cy + (K.hash(i, 35) - 0.5) * 1.6;
      const len = clen * (0.6 + K.hash(i, 36) * 0.55);
      const a = ca + (K.hash(i, 37) - 0.5) * 0.28 - lock * 0.3 * (len / 18);
      const ux = Math.cos(a), uy = Math.sin(a);
      const droop = len * 0.24 * (1 - lock * 0.4);
      const wph = K.hash(i, 39) * 6, bow = cbow + (K.hash(i, 38) - 0.5) * 0.5;
      // walk the hair in 6 steps: it bows (curls) along its length, with a fine wave, and sags
      const pts = [[sx, sy]];
      let qx = sx, qy = sy, an = a - bow * 0.5;
      for (let j = 1; j <= 6; j++) {
        an += bow / 6 + Math.sin(j * 1.9 + wph) * 0.13;
        qx += (Math.cos(an) * len) / 6;
        qy += (Math.sin(an) * len) / 6 + (droop * (2 * j - 1)) / 36;
        pts.push([qx, qy]);
      }
      const seg = (p, a0, a1) => { p.moveTo(pts[a0][0], pts[a0][1]); for (let j = a0 + 1; j <= a1; j++) p.lineTo(pts[j][0], pts[j][1]); };
      seg(P[0], 0, 2);
      seg(P[1], 2, 4);
      seg(P[2], 4, 6);
      if (K.hash(i, 40) > 0.6) { P[3].moveTo(pts[3][0], pts[3][1]); P[3].lineTo(pts[4][0], pts[4][1]); }  // agouti band
      // the strands toward the sun (right) are lit through
      if (ux * lx > -0.2 && K.hash(i, 41) > 0.45) seg(P[4], 3, 6);
    }
    c++;
  }
  const S = [["rgba(176,84,30,0.85)", 0.32], ["rgba(214,132,62,0.75)", 0.27], ["rgba(240,212,166,0.6)", 0.2], ["rgba(120,56,22,0.6)", 0.28], ["rgba(255,190,110,0.55)", 0.22]];
  for (let k = 0; k < 4; k++) { g.strokeStyle = S[k][0]; g.lineWidth = S[k][1]; g.stroke(P[k]); }
  g.globalCompositeOperation = "lighter";
  g.globalAlpha *= 0.3 + 0.7 * Math.max(0, lx);
  g.strokeStyle = S[4][0]; g.lineWidth = S[4][1];
  g.stroke(P[4]);
  g.restore();
  if (o.glow !== false) K.glow(g, x + 7 * scale, y + 8 * scale, 14 * scale, "#ffb35a", 0.12 * (o.glow == null ? 1 : o.glow));
  // a few stray hairs that have already let go, drifting off on the wind
  if (o.strays !== false) looseHairs(g, x + 10 * scale, y + 8 * scale, t % 5.5, 0, scale * 0.9, { count: o.strays || 5 });
}
// loose single hairs the wind pulls out of the tuft: thin backlit curves drifting away, turning
function looseHairs(g, x, y, t, t0, scale, o = {}) {
  const age = t - t0;
  if (age <= 0) return;
  g.save();
  g.lineCap = "round";
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < (o.count || 9); i++) {
    const born = K.hash(i, 71) * 2.4;
    const a = age - born;
    if (a <= 0) continue;
    const vx = 38 + K.hash(i, 72) * 60, vy = -10 - K.hash(i, 73) * 26;
    const px = x + vx * a + Math.sin(a * 2.3 + i) * 10, py = y + vy * a + Math.sin(a * 1.7 + i * 2) * 8 + a * a * 2;
    const rot = a * (1.2 + K.hash(i, 74) * 2) + i;
    const len = (5 + K.hash(i, 75) * 6) * scale;
    const fade = K.clamp(1 - a / 4.5) * K.clamp(a * 3);
    if (fade <= 0) continue;
    const c = Math.cos(rot), s = Math.sin(rot);
    g.strokeStyle = `rgba(255,214,150,${0.4 * fade})`;
    g.lineWidth = 0.3 * scale;
    g.beginPath();
    g.moveTo(px - c * len * 0.5, py - s * len * 0.5);
    g.quadraticCurveTo(px + s * len * 0.15, py - c * len * 0.15, px + c * len * 0.5, py + s * len * 0.5);
    g.stroke();
  }
  g.restore();
}

// a deck of thin altocumulus / cirrus streaks lit from below by a low sun (baked at half resolution)
function cirrusSprite(key, w, h, o = {}) {
  const hw = Math.round(w / 2), hh = Math.round(h / 2);
  const L = K.parseColor(o.lit || "#ffb070"), S = K.parseColor(o.shade || "#4a3050"), Hc = K.parseColor(o.hot || "#ffe0b0");
  const seed = o.seed || 1, cover = o.cover == null ? 0.5 : o.cover, sunX = o.sunX == null ? 0.8 : o.sunX;
  const tex = K.texBake("f02-cirrus:" + key, hw, hh, (u, v, out) => {
    const warp = K.texFbm(u * 2, v * 3, seed + 9, 3) * 0.35;
    const c = K.texFbm(u * 2.6 + warp, v * 9 + warp * 3, seed, 5) * 0.8 + K.texFbm(u * 9, v * 30, seed + 4, 3) * 0.25;
    const band = 0.5 + 0.5 * Math.sin(v * 9 + K.texFbm(u * 1.5, v, seed + 2, 2) * 4);
    let d = K.clamp((c + band * 0.25 + cover * 0.5 - 0.55) / 0.3);
    d *= K.clamp(v / 0.12) * K.clamp((1 - v) / 0.25);
    if (d <= 0.002) { out[3] = 0; return; }
    const dAbove = K.clamp((K.texFbm(u * 2.6 + warp, (v - 0.02) * 9 + warp * 3, seed, 5) * 0.8 + band * 0.25 + cover * 0.5 - 0.55) / 0.3);
    const under = K.clamp((dAbove - d) * 3 + 0.3);
    const toSun = Math.exp(-Math.pow((u - sunX) * 1.8, 2));
    const l = K.clamp(0.15 + v * 0.45 + toSun * 0.35 + (1 - d) * 0.25 + under * 0.25);
    const hot = K.clamp((l - 0.75) / 0.25) * toSun;
    for (let k = 0; k < 3; k++) out[k] = S[k] + (L[k] - S[k]) * l + (Hc[k] - L[k]) * hot * 0.6;
    out[3] = 255 * Math.pow(d, 0.8) * (o.alpha == null ? 0.9 : o.alpha);
  });
  return K.sprite("f02-cirrusS:" + key, w, h, (s) => { s.imageSmoothingEnabled = true; s.drawImage(tex, 0, 0, w, h); });
}

// ---- golden-hour landscape (cached plates) ---------------------------------------------------------------------
const HZ = 318;
const PW = W + 380;
const SUN1 = { x: 880, y: 284 };
// a cherry tree built from florets: a gnarled trunk with bark, branches, and a canopy of lit blossom clusters
function cherryTree(seed, sunSide = 1) {
  const TW = 380, TH = 380;
  return K.sprite("f02-cherry:" + seed + ":" + sunSide, TW, TH, (s) => {
    const R = K.rng("cherry" + seed);
    const tips = [];
    const bark = K.texPattern(s, "bark", { seed: seed + 2 });
    const limbs = new Path2D();
    const branch = (bx, by, ang, len, wid, d) => {
      const bend = (R() - 0.5) * len * 0.45;
      const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
      const mx = (bx + ex) / 2 + Math.cos(ang + Math.PI / 2) * bend, my = (by + ey) / 2 + Math.sin(ang + Math.PI / 2) * bend;
      const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
      const w1 = wid * 0.62;
      limbs.moveTo(bx + nx * wid / 2, by + ny * wid / 2);
      limbs.quadraticCurveTo(mx + nx * (wid + w1) / 4, my + ny * (wid + w1) / 4, ex + nx * w1 / 2, ey + ny * w1 / 2);
      limbs.lineTo(ex - nx * w1 / 2, ey - ny * w1 / 2);
      limbs.quadraticCurveTo(mx - nx * (wid + w1) / 4, my - ny * (wid + w1) / 4, bx - nx * wid / 2, by - ny * wid / 2);
      limbs.closePath();
      if (d >= 5 || len < 9) { tips.push([ex, ey, d]); return; }
      if (d >= 3) tips.push([mx, my, d]);
      const k = d === 0 ? 3 : 2 + (R() > 0.6 ? 1 : 0);
      for (let i = 0; i < k; i++) {
        const spread = d === 0 ? 0.85 : 0.6;
        branch(ex, ey, ang + (i - (k - 1) / 2) * spread + (R() - 0.5) * 0.5, len * (0.66 + R() * 0.14), w1, d + 1);
      }
    };
    branch(TW / 2, TH - 4, -Math.PI / 2 + (R() - 0.5) * 0.25, 92, 30, 0);
    // root flare
    limbs.moveTo(TW / 2 - 26, TH); limbs.quadraticCurveTo(TW / 2 - 14, TH - 8, TW / 2 - 13, TH - 30);
    limbs.lineTo(TW / 2 + 13, TH - 30); limbs.quadraticCurveTo(TW / 2 + 14, TH - 8, TW / 2 + 28, TH); limbs.closePath();
    s.fillStyle = "#2a2024";
    s.fill(limbs);
    s.save();
    s.clip(limbs);
    s.globalAlpha = 0.55;
    s.fillStyle = bark;
    s.fillRect(0, 0, TW, TH);
    s.globalAlpha = 1;
    const lg = s.createLinearGradient(TW / 2 - 40, 0, TW / 2 + 40, 0);
    lg.addColorStop(0, sunSide > 0 ? "rgba(0,0,0,0.35)" : "rgba(255,190,130,0.25)");
    lg.addColorStop(1, sunSide > 0 ? "rgba(255,190,130,0.25)" : "rgba(0,0,0,0.35)");
    s.fillStyle = lg;
    s.fillRect(0, 0, TW, TH);
    s.restore();
    const dens = (x, y) => {
      let d = 0;
      for (const [tx, ty, td] of tips) {
        const dx = x - tx, dy = (y - ty) * 1.25;
        const rr = 26 + td * 2;
        d += Math.exp(-(dx * dx + dy * dy) / (rr * rr));
      }
      return d;
    };
    let cx = 0, cy = 0;
    for (const [tx, ty] of tips) { cx += tx; cy += ty; }
    cx /= tips.length; cy /= tips.length;
    // blossom masses: every branch tip carries a rough sphere of florets. Each floret is shaded by its
    // mass's normal (sun side bright, underside ~30% darker, cool sky in the shadows), the deep interior
    // of the canopy is occluded, small gaps let the sky through, and the canopy edge toward the
    // low sun is rimmed (thin petals glow when backlit).
    const N = 22000;
    const col = (k) => {
      const c0 = [92, 62, 92], c1 = [176, 112, 140], c2 = [232, 160, 178], c3 = [255, 226, 214];
      const seg3 = k < 0.35 ? [c0, c1, k / 0.35] : k < 0.72 ? [c1, c2, (k - 0.35) / 0.37] : [c2, c3, (k - 0.72) / 0.28];
      const [a, b, u] = seg3;
      return `rgb(${(a[0] + (b[0] - a[0]) * u) | 0},${(a[1] + (b[1] - a[1]) * u) | 0},${(a[2] + (b[2] - a[2]) * u) | 0})`;
    };
    const B = 14;
    const buckets = Array.from({ length: B }, () => new Path2D());
    const rimP = new Path2D();
    const Lx = sunSide * 0.82, Ly = -0.42;
    for (let i = 0; i < N; i++) {
      const x = R() * TW, y = R() * TH * 0.85;
      let d = 0, bw = 0, bx = 0, by = 0, brr = 1;
      for (const [tx, ty, td] of tips) {
        const dx = x - tx, dy = (y - ty) * 1.25, rr = 26 + td * 2;
        const w = Math.exp(-(dx * dx + dy * dy) / (rr * rr));
        d += w;
        if (w > bw) { bw = w; bx = tx; by = ty; brr = rr; }
      }
      const n = K.texFbm(x / 26, y / 26, seed + 3, 3);
      if (d * (0.75 + n * 0.9) < 0.55) continue;
      // sky holes between the clusters (not in the dense core)
      if (K.texFbm(x / 9, y / 9, seed + 9, 2) > 0.44 - K.clamp((d - 2) / 3) * 0.4) continue;
      const nx = (x - bx) / brr, ny = (y - by) / (brr * 0.85);
      const lam = K.clamp(nx * Lx + ny * Ly + 0.25);
      const under = K.clamp(ny) * 0.3;
      const occl = K.clamp((d - 1.4) / 3.5) * 0.28;
      const thin = K.clamp(1.25 - d * 0.5);
      const side = K.clamp(((x - cx) / 95) * sunSide);
      let k = 0.28 + lam * 0.42 - under - occl + n * 0.14 + side * 0.12 - K.clamp((y - cy) / 160) * 0.12;
      if (thin > 0.35 && side > 0.25) { k += 0.25; if (R() > 0.55) { const r = 0.5 + R() * 0.9; rimP.moveTo(x + r, y); rimP.arc(x, y, r, 0, K.TAU); } }
      k = K.clamp(k);
      const bi = Math.min(B - 1, Math.floor(k * B));
      const r = 0.8 + R() * 1.7;
      buckets[bi].moveTo(x + r, y);
      buckets[bi].arc(x, y, r, 0, K.TAU);
    }
    for (let b = 0; b < B; b++) { s.fillStyle = col((b + 0.5) / B); s.fill(buckets[b]); }
    s.globalCompositeOperation = "lighter";
    s.fillStyle = "rgba(255,190,140,0.55)";
    s.fill(rimP);
    s.globalCompositeOperation = "source-over";
    s.globalAlpha = 0.55;
    s.fillStyle = "#3a2a2c";
    for (const [tx, ty, td] of tips) if (td >= 4 && R() > 0.6) { s.fillRect(tx - 0.6, ty - 6, 1.2, 8); }
    s.globalAlpha = 1;
  });
}
const CHERRY_H = 380;
// the same tree with its own atmospheric haze baked in (haze only touches the tree's own pixels)
function hazedTree(sd, side, hz) {
  const q = Math.round(hz * 20) / 20;
  return K.sprite(`f02-cherryH:${sd}:${side}:${q}`, 380, CHERRY_H, (s) => {
    s.drawImage(cherryTree(sd, side), 0, 0, 380, CHERRY_H);
    if (q > 0.02) {
      s.globalCompositeOperation = "source-atop";
      s.globalAlpha = q;
      s.fillStyle = "#e8b08a";
      s.fillRect(0, 0, 380, CHERRY_H);
    }
  });
}

function skyPlate1() {
  return K.sprite("f02-sky1", PW, HZ + 10, (s) => {
    K.sky(s, PW, HZ + 10, { top: "#3e5288", mid: "#c08e98", bottom: "#ffc788", horizon: 1, sun: { x: SUN1.x, y: SUN1.y, color: "#ffcf8a" }, haze: 0.85 });
  });
}
function farPlate1() {
  return K.sprite("f02-far1", PW, 140, (s) => {
    s.translate(0, -(HZ - 120));
    K.hills(s, PW, HZ + 20, { y: HZ - 30, amp: 52, color: "#6a5a70", seed: 31, haze: "#f4b88c", hazeAmt: 0.78, cache: false });
    // aerial perspective: the far ridge dissolves into the sky toward its crest
    s.save();
    s.globalCompositeOperation = "source-atop";
    const ap = s.createLinearGradient(0, HZ - 86, 0, HZ - 30);
    ap.addColorStop(0, "rgba(246,190,150,0.62)");
    ap.addColorStop(1, "rgba(246,190,150,0)");
    s.fillStyle = ap;
    s.fillRect(0, HZ - 100, PW, 80);
    s.restore();
    K.hills(s, PW, HZ + 20, { y: HZ - 4, amp: 30, color: "#55603a", seed: 34, haze: "#eab084", hazeAmt: 0.55, tex: "turf", cache: false });
    // the near ridge: haze thickening upward, and the low sun raking its crest (brightest toward the sun)
    const ridge = (o) => { const p = []; for (let x = 0; x <= PW; x += 4) p.push([x, hillY(x, o)]); return p; };
    for (const [o, a, wdt] of [[{ y: HZ - 30, amp: 52, seed: 31 }, 0.12, 2.2], [{ y: HZ - 4, amp: 30, seed: 34 }, 0.18, 1.8]]) {
      const pts = ridge(o);
      const rg = s.createLinearGradient(0, 0, PW, 0);
      rg.addColorStop(0, "rgba(255,214,160,0)");
      rg.addColorStop(K.clamp((SUN1.x - 300) / PW), `rgba(255,214,160,${a * 0.15})`);
      rg.addColorStop(K.clamp(SUN1.x / PW), `rgba(255,236,190,${a})`);
      rg.addColorStop(K.clamp((SUN1.x + 260) / PW), `rgba(255,214,160,${a * 0.15})`);
      rg.addColorStop(1, "rgba(255,214,160,0)");
      s.save();
      s.globalCompositeOperation = "lighter";
      s.strokeStyle = rg;
      if (K.hasFilter()) s.filter = "blur(1.2px)";
      s.lineWidth = wdt;
      s.beginPath();
      pts.forEach(([x, y], i) => (i ? s.lineTo(x, y + 0.8) : s.moveTo(x, y + 0.8)));
      s.stroke();
      s.lineWidth = wdt * 5;
      s.globalAlpha = 0.6;
      s.beginPath();
      pts.forEach(([x, y], i) => (i ? s.lineTo(x, y + wdt * 2.5) : s.moveTo(x, y + wdt * 2.5)));
      s.stroke();
      s.restore();
    }
  });
}
function groundPlate1() {
  return K.sprite("f02-ground1", PW, H - HZ + 10, (s) => {
    s.translate(0, -HZ + 6);
    K.groundPlane(s, PW, H, { tex: "turf", texOpts: { seed: 4, dry: 0.55, color: "#5e6a2c" }, horizon: HZ - 6, scale: 300, fog: "#d8a46e", fogAmt: 0.92, tint: "#ffc070", tintAlpha: 0.22, cache: false, variation: 0.7 });
    // forward scattering toward the sun: an elliptical radial sheen, no rectangle edges anywhere
    s.save();
    s.globalCompositeOperation = "screen";
    s.translate(SUN1.x, HZ);
    s.scale(1, 0.22);
    const sg = s.createRadialGradient(0, 0, 0, 0, 0, 520);
    sg.addColorStop(0, "rgba(255,206,130,0.5)");
    sg.addColorStop(0.4, "rgba(255,190,110,0.16)");
    sg.addColorStop(1, "rgba(255,190,110,0)");
    s.fillStyle = sg;
    s.beginPath(); s.arc(0, 0, 520, 0, K.TAU); s.fill();
    s.restore();
    const dg = s.createLinearGradient(0, HZ + 40, 0, H);
    dg.addColorStop(0, "rgba(40,30,40,0)");
    dg.addColorStop(1, "rgba(40,30,50,0.45)");
    s.fillStyle = dg;
    s.fillRect(0, HZ, PW, H - HZ);
  });
}
const TREES1 = [[150, 372, 7], [330, 346, 5], [985, 356, 9], [1180, 392, 3], [620, 334, 11]];
function treePlate1() {
  return K.sprite("f02-trees1b", PW, H, (s) => {
    for (const [x, gy, sd] of TREES1.slice().sort((a, b) => a[1] - b[1])) {
      const scale = ((gy - HZ) * 3.6) / CHERRY_H;
      const hz = K.clamp(1 - (gy - HZ) / 110) * 0.55;
      s.save();
      const len = (gy - HZ) * 2.2;
      const ang = Math.atan2(len, (x - SUN1.x) * 0.35);
      s.translate(x, gy);
      s.rotate(ang - Math.PI / 2);
      const sh = s.createLinearGradient(0, 0, 0, len);
      sh.addColorStop(0, "rgba(54,50,86,0.45)");
      sh.addColorStop(1, "rgba(54,50,86,0)");
      s.fillStyle = sh;
      s.filter = K.hasFilter() ? `blur(${K.qblur((2 + scale * 4).toFixed(1))}px)` : "none";
      s.beginPath();
      s.moveTo(-4 * scale, 0);
      s.bezierCurveTo(-60 * scale, len * 0.4, -90 * scale, len * 0.8, -30 * scale, len);
      s.lineTo(40 * scale, len);
      s.bezierCurveTo(90 * scale, len * 0.8, 60 * scale, len * 0.4, 4 * scale, 0);
      s.fill();
      s.filter = "none";
      s.restore();
      K.shadowBlob(s, x, gy, 26 * scale, 5 * scale, { alpha: 0.5 });
      s.drawImage(hazedTree(sd, SUN1.x > x ? 1 : -1, hz), x - 190 * scale, gy - CHERRY_H * scale + 4 * scale, 380 * scale, CHERRY_H * scale);
    }
  });
}
// a windmill, far off against the sun: tapered tower, cap, four lattice sails, hazed by distance
function windmill(g, x, y, s, t, o = {}) {
  const hz = o.haze || "#f0b48a", ha = o.hazeAmt == null ? 0.4 : o.hazeAmt;
  const dark = K.mix("#2e2228", hz, ha), mid = K.mix("#4a3438", hz, ha);
  const skyC = K.mix("#8a7a9a", hz, ha * 0.6);
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  // the tower: lit from above by the sky (cool, brighter toward the cap), dark at the foot, and the
  // sun just behind it on the right wraps a thin hot rim round that edge
  const tower = new Path2D();
  tower.moveTo(-16, 0); tower.lineTo(-8.5, -96); tower.lineTo(8.5, -96); tower.lineTo(16, 0); tower.closePath();
  const vg = g.createLinearGradient(0, -96, 0, 0);
  vg.addColorStop(0, K.mix(mid, skyC, 0.45));
  vg.addColorStop(0.55, mid);
  vg.addColorStop(1, K.mix(dark, "#000000", 0.15));
  g.fillStyle = vg;
  g.fill(tower);
  const tg = g.createLinearGradient(-16, 0, 16, 0);
  tg.addColorStop(0, "rgba(0,0,0,0)");
  tg.addColorStop(0.6, K.rgba(dark, 0.5));
  tg.addColorStop(0.9, K.rgba(dark, 0.2));
  tg.addColorStop(1, "rgba(255,210,150,0.6)");
  g.fillStyle = tg;
  g.fill(tower);
  // weatherboard courses
  g.strokeStyle = K.rgba(dark, 0.35);
  g.lineWidth = 0.6;
  g.beginPath();
  for (let k = 1; k < 12; k++) { const yy = -k * 8, hw = 16 - (7.5 * k * 8) / 96; g.moveTo(-hw, yy); g.lineTo(hw, yy); }
  g.stroke();
  g.fillStyle = dark;
  g.beginPath(); g.moveTo(-12, -94); g.quadraticCurveTo(0, -116, 12, -94); g.closePath(); g.fill();
  g.fillStyle = K.rgba(skyC, 0.5);
  g.beginPath(); g.moveTo(-10, -97); g.quadraticCurveTo(0, -114, 4, -110); g.quadraticCurveTo(-2, -104, -10, -97); g.fill();
  g.fillStyle = K.mix(dark, "#000000", 0.3);
  g.fillRect(-3.5, -22, 7, 22);
  g.fillRect(-2.5, -62, 5, 7);
  g.save();
  g.globalCompositeOperation = "lighter";
  g.strokeStyle = "rgba(255,200,130,0.55)";
  g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(16, 0); g.lineTo(8.5, -96); g.lineTo(12, -94); g.quadraticCurveTo(6, -108, 0, -110); g.stroke();
  g.restore();
  const a0 = t * (o.speed == null ? 0.32 : o.speed) + 0.4;
  g.translate(2, -100);
  // sails: lattice stocks; two carry canvas, which glows warm where the sun shines through it
  for (let i = 0; i < 4; i++) {
    g.save();
    g.rotate(a0 + (i * Math.PI) / 2);
    const ang = a0 + (i * Math.PI) / 2;
    const toSun = 0.5 + 0.5 * Math.cos(ang - 0.15); // sails reaching toward the sun (right) are lit through
    if (i % 2 === 0) {
      g.fillStyle = K.rgba(dark, 0.6);
      g.fillRect(14, 1.5, 54, 8.5);
      g.globalCompositeOperation = "lighter";
      const cg = g.createLinearGradient(14, 0, 68, 0);
      cg.addColorStop(0, `rgba(255,170,100,${0.12 + 0.2 * toSun})`);
      cg.addColorStop(1, `rgba(255,200,130,${0.2 + 0.35 * toSun})`);
      g.fillStyle = cg;
      g.fillRect(14, 1.5, 54, 8.5);
      g.globalCompositeOperation = "source-over";
    }
    g.strokeStyle = dark;
    g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(70, 0); g.stroke();
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(14, 1.5); g.lineTo(70, 1.5); g.moveTo(14, 10); g.lineTo(68, 10);
    for (let k = 0; k <= 7; k++) { const xx = 14 + k * 7.6; g.moveTo(xx, 1.5); g.lineTo(xx, 10); }
    g.stroke();
    // the lit edge of the stock (backlight wraps round the thin timber)
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = `rgba(255,196,130,${0.15 + 0.4 * toSun})`;
    g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(4, -1.1); g.lineTo(70, -1.1); g.moveTo(14, 10.6); g.lineTo(68, 10.6); g.stroke();
    g.restore();
  }
  g.fillStyle = dark;
  g.beginPath(); g.arc(0, 0, 3.6, 0, K.TAU); g.fill();
  g.restore();
}
// meadow grass: thin blades (dark bodies, translucent lit edges) and backlit seed heads. Blade heights
// follow a low-frequency envelope (no straight top line), and the strip's top and root are feathered
// with vertical alpha gradients so stacked strips never show a seam. Baked sharp, optionally pre-blurred.
function meadowStrip(key, w, h, o = {}) {
  return blurSprite("f02-strip4:" + key, w, h, o.blur || 0, (s) => {
    const R = K.rng("strip" + key);
    const n = Math.round((w / 960) * (o.count || 1500));
    const body = o.body || "#33361a", lit = o.lit || "rgba(214,206,110,0.85)";
    const envA = o.env == null ? 0.35 : o.env;
    const envAt = (x) => 1 - envA + envA * (0.6 * K.clamp(0.5 + 0.5 * K.fbm(x / 140 + 3, 7 + (o.seed || 0))) + 0.4 * (0.5 + 0.5 * Math.sin(x * 0.013 + 1)));
    const bodyP = new Path2D(), dkP = new Path2D(), litP = new Path2D(), headP = new Path2D(), headLit = new Path2D(), stemP = new Path2D();
    for (let i = 0; i < n; i++) {
      const x = R() * w;
      const bh = h * envAt(x) * ((o.pow ? 0.12 : 0.25) + Math.pow(R(), o.pow || 0.7) * (o.pow ? 0.88 : 0.75)), bw = 0.8 + R() * 2.4;
      const lean = (R() - 0.5) * bh * 0.5;
      const tx = x + lean, ty = h - bh;
      const P = R() > 0.4 ? bodyP : dkP;
      P.moveTo(x - bw, h);
      P.quadraticCurveTo(x - bw * 0.3 + lean * 0.4, h - bh * 0.6, tx, ty);
      P.quadraticCurveTo(x + bw * 0.3 + lean * 0.4, h - bh * 0.6, x + bw, h);
      P.closePath();
      if (R() > 0.35) {
        litP.moveTo(x + bw * 0.6, h - bh * 0.15);
        litP.quadraticCurveTo(x + bw * 0.3 + lean * 0.4, h - bh * 0.6, tx, ty);
        litP.quadraticCurveTo(x + lean * 0.4 + bw * 0.05, h - bh * 0.6, x + bw * 0.1, h - bh * 0.15);
        litP.closePath();
      }
    }
    const heads = Math.round((w / 960) * (o.heads == null ? 70 : o.heads));
    for (let i = 0; i < heads; i++) {
      const x = R() * w, bh = h * envAt(x) * (0.5 + R() * 0.45);
      const lean = (R() - 0.3) * 30;
      const tx = x + lean, ty = h - bh;
      stemP.moveTo(x, h); stemP.quadraticCurveTo(x + lean * 0.2, h - bh * 0.5, tx, ty);
      const m = 6 + Math.floor(R() * 8);
      for (let k = 0; k < m; k++) {
        const u = k / m;
        const sx = tx + (R() - 0.3) * 10 * u + lean * 0.1 * u, sy = ty + u * 26 + (R() - 0.5) * 4;
        const rx = 1.2 + R() * 1.2, ry = 3 + R() * 2.5;
        headP.moveTo(sx + rx, sy); headP.ellipse(sx, sy, rx, ry, 0.3 + (R() - 0.5), 0, K.TAU);
        headLit.moveTo(sx + rx * 1.3, sy); headLit.ellipse(sx + 0.6, sy - 0.4, rx * 0.8, ry * 0.9, 0.3, 0, K.TAU);
      }
    }
    s.fillStyle = K.shade(body, -0.25); s.fill(dkP);
    s.fillStyle = body; s.fill(bodyP);
    s.strokeStyle = K.shade(body, -0.1); s.lineWidth = 0.8; s.stroke(stemP);
    s.fillStyle = o.head || "#5a4a22"; s.fill(headP);
    s.globalCompositeOperation = "lighter";
    s.fillStyle = lit; s.fill(litP);
    s.fillStyle = o.headLit || "rgba(255,214,140,0.8)"; s.fill(headLit);
    // feather: the top 35 px fade in, the roots fade out (o.root px) so bands blend into the ground
    s.globalCompositeOperation = "destination-in";
    const ft = o.fadeTop == null ? Math.min(36, h * 0.4) : o.fadeTop, fr = o.root || 0;
    const fg = s.createLinearGradient(0, 0, 0, h);
    fg.addColorStop(0, "rgba(0,0,0,0)");
    fg.addColorStop(K.clamp(ft / h), "rgba(0,0,0,1)");
    if (fr > 0) { fg.addColorStop(K.clamp(1 - fr / h), "rgba(0,0,0,1)"); fg.addColorStop(1, "rgba(0,0,0,0)"); } else fg.addColorStop(1, "rgba(0,0,0,1)");
    s.fillStyle = fg;
    s.fillRect(0, 0, w, h);
    s.globalCompositeOperation = "source-over";
  });
}
// draw a strip swaying in the wind: vertical slices skewed about their roots by a travelling gust
function swayStrip(g, spr, x, y, w, h, t, amt, slices = 12) {
  const sw = w / slices, ps = PX();
  for (let i = 0; i < slices; i++) {
    const cx = x + (i + 0.5) * sw;
    const k = (Math.sin(t * 1.3 - cx * 0.006) * 0.6 + Math.sin(t * 2.9 + i * 1.7) * 0.2) * amt;
    g.save();
    g.transform(1, 0, k, 1, -k * (y + h), 0);
    g.drawImage(spr, (i * sw - 0.5) * ps, 0, (sw + 1) * ps, spr.height, x + i * sw - 0.5, y, sw + 1, h);
    g.restore();
  }
}
// a soft round disc (fireflies, far lamps): flat core, soft edge, like an out-of-focus point light
function softDisc() {
  return K.sprite("f02-disc", 32, 32, (s) => {
    const gr = s.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, "rgba(255,230,160,1)");
    gr.addColorStop(0.55, "rgba(255,216,136,0.85)");
    gr.addColorStop(0.82, "rgba(255,200,110,0.3)");
    gr.addColorStop(1, "rgba(255,200,110,0)");
    s.fillStyle = gr;
    s.fillRect(0, 0, 32, 32);
  });
}
// an out-of-focus specular highlight as a real lens draws it: a flat disc with a slightly brighter
// rim and a 1-2 px soft edge (not a gaussian blob)
function bokehDisc() {
  return K.sprite("f02-bokehdisc", 48, 48, (s) => {
    const gr = s.createRadialGradient(24, 24, 0, 24, 24, 24);
    gr.addColorStop(0, "rgba(255,255,255,0.8)");
    gr.addColorStop(0.72, "rgba(255,255,255,0.84)");
    gr.addColorStop(0.86, "rgba(255,255,255,0.92)");
    gr.addColorStop(0.94, "rgba(255,255,255,0.4)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    s.fillStyle = gr;
    s.fillRect(0, 0, 48, 48);
  });
}
function tintedDisc(c) {
  const key = c.join(",");
  return K.sprite("f02-bokehdisc:" + key, 48, 48, (s) => {
    s.drawImage(bokehDisc(), 0, 0, 48, 48);
    s.globalCompositeOperation = "source-in";
    s.fillStyle = `rgb(${key})`;
    s.fillRect(0, 0, 48, 48);
  });
}
// backlit glints on defocused foreground grass: discs that ride the strip's parallax and sway and
// flare up as a blade tips into the sun
function grassBokeh(g, t, x0, y0, w, h, o) {
  const disc = tintedDisc(o.color || [255, 214, 150]);
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < o.count; i++) {
    const u = K.hash(i, o.seed), v = K.hash(i, o.seed + 1);
    const x = x0 + u * w + Math.sin(t * 1.3 - (x0 + u * w) * 0.006) * h * 0.14 * (1 - v);
    if (x < -30 || x > W + 30) continue;
    const y = y0 + h * (0.1 + v * 0.45);
    const r = 6 + K.hash(i, o.seed + 2) * 8;
    const glint = Math.pow(0.5 + 0.5 * Math.sin(t * (0.9 + K.hash(i, o.seed + 3)) + i * 2.1), 3);
    const a = (o.alpha == null ? 0.32 : o.alpha) * (0.25 + 0.75 * glint);
    if (a < 0.02) continue;
    g.globalAlpha = a;
    g.drawImage(disc, x - r, y - r, r * 2, r * 2);
  }
  g.restore();
}
// lens ghosts: reflections between the elements put faint copies of a bright source on the line
// through the frame centre (one warm, one cool and bigger); no hexagons, no rainbow rings
function flareGhosts(g, sx, sy, k) {
  if (k <= 0.01) return;
  const cx = W / 2, cy = H / 2;
  for (const [f, r, c, a] of [[-0.45, 18, [255, 214, 160], 0.05], [-1.15, 40, [190, 210, 255], 0.03], [0.35, 10, [255, 196, 140], 0.05]]) {
    const x = cx + (sx - cx) * f, y = cy + (sy - cy) * f;
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = a * k;
    g.drawImage(tintedDisc(c), x - r, y - r, r * 2, r * 2);
    g.restore();
  }
}
// fireflies at different depths: far ones are tiny warm points, near ones big faint defocused discs;
// each glows up and fades on its own slow cycle
function fireflies2(g, t, o) {
  const [ax, ay, aw, ah] = o.area;
  const disc = softDisc();
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < o.count; i++) {
    const d = K.hash(i, o.seed + 1);
    const px = ax + aw * (0.5 + 0.5 * K.noise(t * 0.11 + i * 7.1, o.seed));
    const py = ay + ah * (0.25 + 0.4 * (0.5 + 0.5 * K.noise(t * 0.09 + i * 3.7, o.seed + 3)) + d * 0.35) + Math.sin(t * 0.7 + i) * 6;
    const per = 2.8 + K.hash(i, o.seed + 2) * 2.8;
    const ph = ((t + K.hash(i, o.seed + 4) * per) % per) / per;
    const blink = ph < 0.2 ? K.smooth(ph / 0.2) : Math.exp(-(ph - 0.2) * 4.2);
    const r = 1.1 + d * d * 5.5;
    const a = (o.alpha == null ? 1 : o.alpha) * blink * (0.95 - d * 0.7);
    if (a < 0.01) continue;
    g.globalAlpha = a;
    g.drawImage(disc, px - r, py - r, r * 2, r * 2);
    if (d < 0.45) { g.globalAlpha = a * 0.18; g.drawImage(disc, px - r * 4, py - r * 4, r * 8, r * 8); }
  }
  g.restore();
}

// ---- shot 1: golden hour, slow pan right -----------------------------------------------------------------------
function shotGolden(g, t, p) {
  const e = K.ease.inOut(p);
  const camX = K.lerp(0, 210, e);
  const sx = SUN1.x - camX * 0.06 - 190, sy = SUN1.y;
  g.drawImage(skyPlate1(), -190 - camX * 0.06, 0, PW, HZ + 10);
  g.drawImage(cirrusSprite("g1", PW, HZ - 40, { seed: 21, lit: "#ffd2a8", shade: "#9a7088", hot: "#fff2d8", sunX: SUN1.x / PW, cover: 0.38, alpha: 0.75 }), -190 - camX * 0.08 + t * 1.2, 0, PW, HZ - 40);
  K.sunGlow(g, sx, sy, 15, "#ffd49a", 1.15);
  g.drawImage(farPlate1(), -190 - camX * 0.14, HZ - 120, PW, 140);
  const WMX = 836;
  windmill(g, -190 - camX * 0.14 + WMX, hillY(WMX, { y: HZ - 4, amp: 30, seed: 34 }) + 5, 0.6, t, { haze: "#f4b88c", hazeAmt: 0.42 });
  g.drawImage(groundPlate1(), -190 - camX * 0.4, HZ - 6, PW, H - HZ + 10);
  g.drawImage(treePlate1(), -190 - camX * 0.45, 0, PW, H);
  // depth bands of grass, far to near: each band is bigger, more parallax and softer than the one
  // behind it (scale + defocus falloff); far bands are hazed toward the sky, seed heads get rarer
  g.save();
  g.globalAlpha = 0.85;
  g.drawImage(meadowStrip("far1b", 2800, 80, { pow: 1.8, count: 6400, heads: 40, blur: 0.8, env: 0.7, root: 40, fadeTop: 24, body: "#5a5032", head: "#8a7656", lit: "rgba(255,226,160,0.3)", headLit: "rgba(255,226,170,0.12)" }), -220 - camX * 0.55, 332, 1400, 40);
  g.restore();
  g.drawImage(meadowStrip("midfar1", 2800, 120, { pow: 1.5, count: 5600, heads: 36, blur: 0.5, env: 0.6, root: 40, fadeTop: 40, body: "#47452a", head: "#7a6a46", lit: "rgba(255,226,150,0.36)", headLit: "rgba(255,224,160,0.16)" }), -220 - camX * 0.62, 344, 1400, 60);
  swayStrip(g, meadowStrip("mid2", 1400, 140, { pow: 1.3, count: 3000, heads: 18, env: 0.6, root: 30, fadeTop: 64, body: "#45421f", head: "#6e5e36", lit: "rgba(255,226,140,0.5)", headLit: "rgba(255,220,150,0.3)" }), -220 - camX * 0.7, H - 206, 1400, 140, t, 0.06, 10);
  K.godRays(g, sx, sy, W, H, { color: "#ffd8a0", count: 9, strength: 0.12, t, angle: Math.PI * 0.62, spread: 2.2, length: 900, seed: 5 });
  petals(g, t, { seed: 3, count: 34, area: [-100, 60, W + 200, 360], wind: 1.1, size: 2.2, color: "#f8cddb", alpha: 0.8 });
  K.dust(g, W, H, t, { seed: 4, count: 26, color: "#ffe2b0", area: [sx - 300, sy - 160, 600, 300], alpha: 0.5, size: 1.2 });
  swayStrip(g, meadowStrip("near1", 1500, 200, { blur: 1.8, pow: 1.1, count: 1300, heads: 12, env: 0.6, fadeTop: 50, body: "#30301a", head: "#5a4a28", lit: "rgba(255,214,120,0.5)", headLit: "rgba(255,214,140,0.4)" }), -260 - camX * 0.95, H - 190, 1500, 200, t, 0.08, 12);
  const fgX = -320 - camX * 1.35;
  swayStrip(g, meadowStrip("fg2", 1700, 340, { blur: 9, count: 520, heads: 18, env: 0.7, fadeTop: 60, body: "#1c1c0c", head: "#3a3016", lit: "rgba(255,206,110,0.42)", headLit: "rgba(255,210,140,0.4)" }), fgX, H - 290, 1700, 340, t, 0.14, 12);
  grassBokeh(g, t, fgX, H - 290, 1700, 340, { seed: 7, count: 22, color: [255, 214, 150] });
  // lens: a faint ghost pair on the axis through the frame centre while the sun is in shot
  flareGhosts(g, sx, sy, 0.7);
  const ta = K.env(t, 1, 5.6, 1, 1.1);
  if (ta > 0) K.title(g, W, H, "The Hole in the Fence", "Chapter 2", ta, { y: H * 0.25, size: 52, glow: "#7a4a3a" });
}

// ---- projected picket fence (shared by shots 2 and 3) ----------------------------------------------------------
// F: {ox, oz, ang, pw, step, ph, rails:[[y0,y1]...], railOff, hole:{k, lift}, nail:{k, u, y, r}}
// The fence line is P(s) = (ox + dx s, oz + dz s); n = (dz, -dx) points to the camera's side.
function fenceDef(o) {
  const dx = Math.cos(o.ang), dz = Math.sin(o.ang);
  return Object.assign({ railOff: 0.028, thick: 0.02 }, o, { dx, dz, nx: dz, nz: -dx });
}
const fpt = (F, s, off = 0) => [F.ox + F.dx * s + F.nx * off, F.oz + F.dz * s + F.nz * off];
// blur bucket from the circle of confusion of a point at camera depth z (focus zf, strength k)
const COC = [0, 1.5, 3, 5, 8];
function cocBucket(z, zf, k) {
  const c = Math.abs(1 / z - 1 / zf) * k;
  let b = 0;
  for (let i = 0; i < COC.length; i++) if (c >= COC[i] * 0.75) b = i;
  return COC[b];
}
// draw the fence (rails, then pickets far to near) into g. o: {lx, tone, rim, kmin, kmax, zf, cocK, railCol, sideCol, wood}
function drawFence(g, cam, F, o) {
  const PWs = 48, PHs = 520;
  const proj = (s, y, off = 0) => { const [x, z] = fpt(F, s, off); return P3(cam, x, y, z); };
  // rails (behind the pickets): one continuous quad per picket bay, shaded top-to-bottom, with
  // contact occlusion where each picket crosses it
  F.rails.forEach(([ry0, ry1], ri) => {
    const path = new Path2D();
    const segs = [];
    for (let k = o.kmin; k <= o.kmax; k++) {
      if (o.railSkip && o.railSkip(ri, k)) continue;
      const s0 = k * F.step, s1 = s0 + F.step;
      const a0 = proj(s0, ry1, -F.railOff), b0 = proj(s1, ry1, -F.railOff), b1 = proj(s1, ry0, -F.railOff), a1 = proj(s0, ry0, -F.railOff);
      if (Math.max(a0[0], b0[0]) < -40 || Math.min(a0[0], b0[0]) > W + 40) continue;
      path.moveTo(a0[0], a0[1]); path.lineTo(b0[0], b0[1]); path.lineTo(b1[0], b1[1]); path.lineTo(a1[0], a1[1]); path.closePath();
      segs.push([k, a0, b0, b1, a1]);
    }
    g.fillStyle = o.railCol || "#9a9282";
    g.fill(path);
    K.texFill(g, "wood", path, { scale: 110, alpha: 0.5, mode: "multiply", tex: { seed: 6, color: "#c8bca8", planks: 1 } });
    for (const [k, a0, b0, b1, a1] of segs) {
      // vertical form: lit top arris, darker underside
      const vg = g.createLinearGradient(0, (a0[1] + b0[1]) / 2, 0, (a1[1] + b1[1]) / 2);
      vg.addColorStop(0, o.railTop || "rgba(255,226,180,0.3)");
      vg.addColorStop(0.18, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(24,18,28,0.5)");
      g.fillStyle = vg;
      g.beginPath(); g.moveTo(a0[0], a0[1]); g.lineTo(b0[0], b0[1]); g.lineTo(b1[0], b1[1]); g.lineTo(a1[0], a1[1]); g.closePath(); g.fill();
      // contact AO next to the picket at the start of the bay (and a little at the far end)
      const pe = proj(k * F.step + F.pw, (ry0 + ry1) / 2, -F.railOff);
      const ag = g.createLinearGradient(pe[0], 0, b0[0], 0);
      ag.addColorStop(0, "rgba(16,12,18,0.55)");
      ag.addColorStop(0.3, "rgba(16,12,18,0)");
      ag.addColorStop(0.85, "rgba(16,12,18,0)");
      ag.addColorStop(1, "rgba(16,12,18,0.4)");
      g.fillStyle = ag;
      g.fill();
    }
    if (o.railEnds) o.railEnds(g, proj, ri, ry0, ry1);
  });
  if (o.behindPickets) o.behindPickets(g, proj);
  // pickets, far to near
  const order = [];
  for (let k = o.kmin; k <= o.kmax; k++) order.push(k);
  if (F.dz > 0) order.reverse();
  for (const k of order) {
    const s0 = k * F.step, s1 = s0 + F.pw;
    const hole = F.hole && k === F.hole.k;
    // a broken board's ragged end sits at the hole's lift (its splinters hang a little below)
    const lift = hole ? F.hole.lift - (34 * F.ph) / PHs : 0;
    const bl = proj(s0, lift), br = proj(s1, lift), tl = proj(s0, F.ph);
    if (br[0] < -80 || bl[0] > W + 80) continue;
    const seed = ((k % 7) + 7) % 7;
    const hpx = F.ph - lift;
    const sh = Math.round(PHs * (hpx / F.ph));
    const bb = o.zf ? cocBucket((bl[2] + br[2]) / 2, o.zf, o.cocK || 0) : 0;
    const nail = F.nail && k === F.nail.k ? [Math.round(F.nail.u * PWs), Math.round(PHs * (1 - F.nail.y / F.ph)), F.nail.r] : null;
    const rails = o.railAO ? F.rails.filter(([r0, r1]) => r0 > lift && r1 < F.ph).map(([r0, r1]) => [Math.round(sh * (1 - (r1 - lift) / hpx)), Math.round(sh * (1 - (r0 - lift) / hpx))]) : null;
    const pk = { lx: o.lx, tone: o.tone, rim: o.rim, broken: hole ? 34 : 0, res: 1, nail, rails, railAO: o.railAO, paint: o.paint };
    const spr = bb ? blurSprite(`f02-pkb2:${seed}:${sh}:${hole ? 1 : 0}:${nail ? 1 : 0}:${o.lx}:${o.tone || ""}:${o.rim || ""}:${o.railAO || 0}:${o.paint || 0}`, PWs, sh, bb, (s) => s.drawImage(picketSprite(PWs, sh, seed, pk), 0, 0, PWs, sh))
      : picketSprite(PWs, sh, seed, pk);
    // the board's thickness: the side face toward the camera
    const camSide = (cam.x - bl[0] * 0 - fpt(F, s0)[0]) * F.dx + (cam.z - fpt(F, s0)[1]) * F.dz; // <0: we see the s0 face
    const sf = camSide < 0 ? s0 : s1;
    const q0 = proj(sf, lift), q1 = proj(sf, lift, -F.thick), q2 = proj(sf, F.ph - F.pw * 0.5, -F.thick), q3 = proj(sf, F.ph - F.pw * 0.5);
    g.fillStyle = o.sideCol || "rgba(98,90,84,0.95)";
    g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.lineTo(q2[0], q2[1]); g.lineTo(q3[0], q3[1]); g.closePath(); g.fill();
    g.save();
    g.transform((br[0] - bl[0]) / PWs, (br[1] - bl[1]) / PWs, (bl[0] - tl[0]) / sh, (bl[1] - tl[1]) / sh, bl[0], bl[1]);
    g.drawImage(spr, 0, -sh, PWs, sh);
    g.restore();
    if (!hole && o.foot !== false) {
      const ww = Math.abs(br[0] - bl[0]);
      K.shadowBlob(g, (bl[0] + br[0]) / 2, bl[1] + 1, ww * 0.95, Math.max(1, ww * 0.1), { alpha: 0.42, soft: 0.6 });
    }
  }
}

// ---- shot 2: tracking along the fence at grass height, stopping at the gap -------------------------------------
const F2 = fenceDef({ ox: 0, oz: 0, ang: 0.49, pw: 0.088, step: 0.124, ph: 0.95, rails: [[0.15, 0.22], [0.67, 0.74]], hole: { k: 40, lift: 0.24 }, nail: { k: 39, u: 0.84, y: 0.44, r: 4.6 } });
const DIST2 = 1.6;
const S_END2 = 40 * F2.step + F2.pw / 2 - 1.02;
function cam2(t) {
  const k = K.ease.out(K.seg(t, 9, 12.4));
  const sc = S_END2 - 2.6 * (1 - k);
  const [x, z] = fpt(F2, sc, DIST2);
  return { x: x + Math.sin(t * 0.9) * 0.004, y: 0.3 + Math.sin(t * 1.3) * 0.003, z, f: 720, cx: 480, cy: 300, sc };
}
// the meadow beyond the fence, far out of focus
function beyondPlate(key, blur, o = {}) {
  return blurSprite("f02-beyond:" + key, W + 420, H, blur, (s, w, h) => {
    const hz = o.hz || 300;
    K.sky(s, w, hz + 10, { top: o.top || "#6a6a98", mid: o.mid || "#e0a29a", bottom: o.bottom || "#ffd09a", horizon: 1, sun: { x: o.sunX || w * 0.7, y: hz - 30, color: "#ffd8a0" }, haze: 0.9 });
    K.sunGlow(s, o.sunX || w * 0.7, hz - 30, 18, "#ffe0a8", 1);
    K.hills(s, w, h, { y: hz, amp: 30, color: "#6a6070", seed: 41, haze: "#f2b890", hazeAmt: 0.7, cache: false });
    K.groundPlane(s, w, h, { tex: "turf", texOpts: { seed: 9, dry: 0.5, color: "#66702e" }, horizon: hz + 2, scale: 340, fog: "#e0ac70", fogAmt: 0.9, tint: "#ffc070", tintAlpha: 0.3, cache: false });
    for (const [x, sd, sc] of [[120, 5, 0.42], [380, 9, 0.3], [760, 3, 0.36], [1180, 7, 0.46]]) {
      s.drawImage(cherryTree(sd, 1), x - 190 * sc, hz + 14 - CHERRY_H * sc, 380 * sc, CHERRY_H * sc);
    }
    const st = meadowStrip("beyond", w, 200, { count: 900, heads: 60, body: "#5a5a26", lit: "rgba(255,226,150,0.8)" });
    s.drawImage(st, 0, h - 250, w, 200);
    s.fillStyle = "#4a4a20";
    s.fillRect(0, h - 52, w, 52);
  });
}
// long soft grass shadows (the sun is low on the right), baked once
function grassShadowStrip() {
  return blurSprite("f02-grass-shadow", 1200, 300, 3, (s, w, h) => {
    const R = K.rng("gshadow");
    s.fillStyle = "#000";
    for (let i = 0; i < 220; i++) {
      const x = R() * (w + 300), bh = 80 + R() * 220, bw = 1.5 + R() * 3.5;
      s.beginPath();
      s.moveTo(x - bw, h);
      s.quadraticCurveTo(x - 30 - bh * 0.3, h - bh * 0.6, x - bh * 0.7, h - bh);
      s.quadraticCurveTo(x - 30 - bh * 0.3 + bw, h - bh * 0.6, x + bw, h);
      s.fill();
    }
  });
}
// a hollow dug under a fence board, in screen space: centre (cx, cy) on the fence foot line, half width
// hw px, the foot line's slope. Far wall in shade, the near slope and the spoil catch the sun that
// comes through the opening (o.sun 0..1), crumbs and pebbles, and grass pressed flat around the lip.
function digHole(g, cx, cy, hw, slope, o = {}) {
  const sun = o.sun == null ? 1 : o.sun, sd = o.seed || 1;
  g.save();
  g.translate(cx, cy);
  g.rotate(slope);
  // flattened grass, pressed outward from the hollow (drawn first: the dirt lies over the roots)
  g.lineCap = "round";
  const flat = [new Path2D(), new Path2D()];
  for (let i = 0; i < 70; i++) {
    const a = Math.PI * (0.05 + 0.9 * K.hash(i, sd + 40));
    const rr = 0.9 + K.hash(i, sd + 41) * 0.5;
    const x0 = Math.cos(a) * hw * 1.1 * rr, y0 = Math.sin(a) * hw * 0.45 * rr;
    const len = hw * (0.35 + K.hash(i, sd + 42) * 0.5);
    const da = a + (K.hash(i, sd + 43) - 0.5) * 0.7;
    const x1 = x0 + Math.cos(da) * len, y1 = y0 + Math.sin(da) * len * 0.3;
    const p = flat[K.hash(i, sd + 44) > 0.6 ? 1 : 0];
    p.moveTo(x0, y0); p.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + hw * 0.03, x1, y1);
  }
  g.lineWidth = Math.max(1, hw * 0.028);
  g.strokeStyle = "rgba(86,92,40,0.9)"; g.stroke(flat[0]);
  g.strokeStyle = `rgba(196,182,108,${0.55 + 0.3 * sun})`; g.stroke(flat[1]);
  // looking through toward the low sun, the opening under the board is the brightest thing here: the
  // far meadow's light, the tunnel floor in silhouette against it with a hot rim of backlit crumbs
  if (o.open) {
    const op = new Path2D();
    op.ellipse(0, -hw * 0.04, hw * 0.8, o.open, 0, Math.PI, K.TAU);
    op.closePath();
    if (o.openFill) { g.save(); g.clip(op); g.rotate(-slope); g.translate(-cx, -cy); o.openFill(g); g.restore(); }
    else {
      const og = g.createLinearGradient(0, -o.open, 0, 0);
      og.addColorStop(0, o.lightTop || "rgb(250,222,170)");
      og.addColorStop(1, o.lightBot || "rgb(226,176,104)");
      g.fillStyle = og;
      g.fill(op);
    }
    const fl = new Path2D();
    fl.moveTo(-hw * 0.85, hw * 0.1);
    for (let i = 0; i <= 14; i++) fl.lineTo(-hw * 0.85 + (i * hw * 1.7) / 14, -hw * (0.1 + 0.05 * K.hash(i, sd + 60)) - Math.sin((i / 14) * Math.PI) * hw * 0.06);
    fl.lineTo(hw * 0.85, hw * 0.1);
    fl.closePath();
    g.fillStyle = "rgb(34,22,13)";
    g.fill(fl);
    g.save();
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = "rgba(255,180,100,0.55)";
    g.lineWidth = Math.max(0.8, hw * 0.03);
    g.beginPath();
    for (let i = 1; i < 14; i++) { const x = -hw * 0.85 + (i * hw * 1.7) / 14, y = -hw * (0.1 + 0.05 * K.hash(i, sd + 60)) - Math.sin((i / 14) * Math.PI) * hw * 0.06; if (i === 1) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    g.restore();
  }
  // the scooped hollow: an open bowl, its far wall under the board in shade
  const bowl = new Path2D();
  bowl.ellipse(0, hw * 0.06, hw * 1.08, hw * 0.4, 0, 0, K.TAU);
  const bg = g.createLinearGradient(0, -hw * 0.36, 0, hw * 0.46);
  bg.addColorStop(0, o.open ? "rgba(18,12,8,0)" : "rgb(18,12,8)");
  bg.addColorStop(0.42, "rgb(38,26,16)");
  bg.addColorStop(0.75, "rgba(70,50,30,0.9)");
  bg.addColorStop(1, "rgba(70,50,30,0)");
  g.fillStyle = bg;
  g.fill(bowl);
  K.texFill(g, "soil", bowl, { scale: Math.max(20, hw * 0.9), alpha: 0.45, mode: "multiply", tex: { seed: sd + 3 } });
  // the low sun through the opening: a warm tongue of light across the bowl floor toward us
  if (sun > 0) {
    g.save();
    g.clip(bowl);
    g.globalCompositeOperation = "screen";
    const lg = g.createRadialGradient(hw * 0.1, hw * 0.28, 0, hw * 0.1, hw * 0.28, hw * 0.9);
    lg.addColorStop(0, `rgba(255,186,104,${0.42 * sun})`);
    lg.addColorStop(1, "rgba(255,186,104,0)");
    g.fillStyle = lg;
    g.fillRect(-hw * 1.2, -hw * 0.5, hw * 2.4, hw);
    g.restore();
  }
  // the spoil, thrown out on our side: a low textured mound lit on its crest
  const sp = new Path2D();
  sp.ellipse(hw * 0.35, hw * 0.5, hw * 1.0, hw * 0.2, 0.05, 0, K.TAU);
  const sg = g.createLinearGradient(0, hw * 0.3, 0, hw * 0.7);
  sg.addColorStop(0, `rgb(${120 + 30 * sun},${88 + 20 * sun},${54 + 8 * sun})`);
  sg.addColorStop(1, "rgb(58,42,26)");
  g.fillStyle = sg;
  g.fill(sp);
  K.texFill(g, "soil", sp, { scale: Math.max(18, hw * 0.7), alpha: 0.55, mode: "multiply", tex: { seed: sd + 5 } });
  // crumbs and pebbles (lit top, dark underside), a contact shadow under each
  for (let i = 0; i < 46; i++) {
    const x = (K.hash(i, sd + 50) - 0.4) * hw * 2.6, y = hw * (0.36 + K.hash(i, sd + 51) * 0.5);
    const r = Math.max(0.6, hw * (0.012 + Math.pow(K.hash(i, sd + 52), 3) * 0.05));
    g.fillStyle = "rgba(20,14,8,0.45)";
    g.beginPath(); g.ellipse(x + r * 0.3, y + r * 0.5, r * 1.1, r * 0.5, 0, 0, K.TAU); g.fill();
    const c = K.hash(i, sd + 53) > 0.7 ? [150, 140, 126] : [104, 74, 46];
    const pg = g.createLinearGradient(0, y - r, 0, y + r);
    pg.addColorStop(0, `rgb(${c[0] + 40 * sun},${c[1] + 32 * sun},${c[2] + 20 * sun})`);
    pg.addColorStop(1, `rgb(${c[0] * 0.45 | 0},${c[1] * 0.45 | 0},${c[2] * 0.45 | 0})`);
    g.fillStyle = pg;
    g.beginPath(); g.ellipse(x, y, r, r * 0.75, K.hash(i, sd + 54) * 3, 0, K.TAU); g.fill();
  }
  g.restore();
}
function shotFence(g, t, p) {
  const cam = cam2(t);
  const ca = cam2(t - 0.02), cb = cam2(t + 0.02);
  const vel = Math.hypot(cb.x - ca.x, cb.z - ca.z) / 0.04; // m/s
  const blurLen = Math.min(46, (vel * cam.f / 1.5) / 48);    // px over a 180-degree shutter at the focus depth
  const taps = blurLen > 2 ? Math.min(5, Math.ceil(blurLen / 6) + 1) : 1;
  const push = K.ease.inOut(K.seg(t, 14.6, 18));
  // the nail, projected
  const [nwx, nwz] = fpt(F2, F2.nail.k * F2.step + F2.nail.u * F2.pw, 0.004);
  const NP = P3(cam, nwx, F2.nail.y, nwz);
  // the gap under the broken picket, at the fence foot
  const G0 = (s, off, y = 0) => { const [x, zz] = fpt(F2, s, off); return P3(cam, x, y, zz); };
  const sH = F2.hole.k * F2.step;
  const qa = G0(sH - 0.024, 0), qb = G0(sH + F2.pw + 0.024, 0);
  const HB = [(qa[0] + qb[0]) / 2, (qa[1] + qb[1]) / 2];
  // the track settles, then a slow push frames the tuft and the gap below it together
  const MX = (NP[0] + HB[0]) / 2, MY = (NP[1] + HB[1]) / 2;
  const z = 1 + push * 0.42;
  g.save();
  g.translate(K.lerp(MX, 470, push), K.lerp(MY, 300, push));
  g.scale(z, z);
  g.translate(-MX, -MY);
  // beyond: the meadow, far out of focus, slow parallax
  smear(g, beyondPlate("fence2", 9), -cam.sc * 70 + 40, -40, W + 420, H, blurLen * 0.15, taps > 1 ? 2 : 1);
  K.bokehLights(g, W, H, t, { seed: 12, count: 7, area: [0, 220, W, 120], size: 12, alpha: 0.14, colors: ["#ffe2a8", "#ffd090"] });
  // the fence in its own layer (so grass shadows and sun only land on wood), smeared while we track
  const kmin = Math.floor((cam.sc - 0.9) / F2.step), kmax = Math.ceil((cam.sc + 3.9) / F2.step);
  const L = K.layer(W, H, "f02-fence2");
  const f = L.g;
  drawFence(f, cam, F2, {
    kmin, kmax, lx: 0.6, zf: 1.9, cocK: 11, railCol: "#a69c8a", sideCol: "rgba(86,78,72,0.95)",
    railAO: 0.14,
  });
  f.save();
  f.globalCompositeOperation = "source-atop";
  f.globalAlpha = 0.38;
  const gs = grassShadowStrip();
  const off = (((-cam.sc * 420) % 1200) + 1200) % 1200;
  const footY = P3(cam, nwx, 0, nwz)[1];
  f.drawImage(gs, off - 1200, footY - 300, 1200, 310);
  f.drawImage(gs, off, footY - 300, 1200, 310);
  f.globalAlpha = 1;
  const sg = f.createLinearGradient(0, 0, W, 0);
  sg.addColorStop(0, "rgba(255,170,90,0.04)");
  sg.addColorStop(1, "rgba(255,170,90,0.15)");
  f.fillStyle = sg;
  f.fillRect(0, 0, W, H);
  f.restore();
  smear(g, L.canvas, 0, 0, W, H, blurLen, taps);
  // the ground along the fence foot (perspective-correct: a polygon under the foot line)
  const foot = [];
  for (let s = cam.sc - 1.2; s <= cam.sc + 4.2; s += 0.5) { const [x, zz] = fpt(F2, s, 0.01); foot.push(P3(cam, x, 0, zz)); }
  const gp = new Path2D();
  gp.moveTo(foot[0][0], foot[0][1]);
  for (const q of foot) gp.lineTo(q[0], q[1]);
  gp.lineTo(W + 60, H + 60); gp.lineTo(-60, H + 60); gp.closePath();
  g.fillStyle = "#3e3a22";
  g.fill(gp);
  K.texFill(g, "turf", gp, { scale: 150, ox: -cam.sc * 340, tex: { seed: 3, color: "#5a5a2c", dry: 0.5 }, alpha: 0.9 });
  g.fillStyle = "rgba(40,34,20,0.25)";
  g.fill(gp);
  // the dug-out gap: a scooped hollow under the broken board, spoil thrown out on our side, the grass
  // flattened where he squeezed through, and the low sun spilling through the opening onto the dirt
  {
    const hwp = (qb[0] - qa[0]) / 2;
    const openPx = Math.abs(G0(sH + F2.pw / 2, 0, 0.13)[1] - HB[1]);
    const bp = beyondPlate("fence2", 9), bx = -cam.sc * 70 + 40;
    digHole(g, HB[0], HB[1], hwp, Math.atan2(qb[1] - qa[1], qb[0] - qa[0]), { seed: 2, sun: 1, open: openPx, openFill: (q) => q.drawImage(bp, bx, -40, W + 420, H) });
  }
  const trail = new Path2D();
  trail.rect(-200, -200, W + 400, H + 400);
  const hwp = (qb[0] - qa[0]) / 2;
  trail.ellipse(HB[0] + hwp * 0.2, HB[1] + hwp * 0.55, hwp * 1.5, hwp * 0.75, 0, 0, K.TAU);
  // the grass along the fence foot, sheared onto the projected foot line; then the tuft
  const strip = meadowStrip("fence-base", 1400, 80, { count: 2200, heads: 12, env: 0.8, root: 22, fadeTop: 26, body: "#3e4420", head: "#5a5030", lit: "rgba(255,220,130,0.5)", headLit: "rgba(255,214,140,0.3)" });
  // rows of grass on the ground between us and the fence (the far row at the foot, nearer rows taller)
  for (const [off, hgt, row] of [[0.01, 0.1, 0], [0.5, 0.2, 1]]) {
    g.save();
    g.clip(trail, "evenodd");
    let prev = null;
    for (let s = cam.sc - 1.6, i = 0; s <= cam.sc + 4.2; s += 0.5, i++) {
      const [x, zz] = fpt(F2, s, off);
      const q = P3(cam, x, 0, zz);
      if (prev && q[2] > 0.25 && prev[2] > 0.25 && !(q[0] < -40 || prev[0] > W + 40)) {
        const a = prev, b = q;
        const hh = (cam.f * hgt) / ((a[2] + b[2]) / 2);
        g.save();
        g.translate(a[0], a[1] + 3);
        g.transform(1, (b[1] - a[1]) / (b[0] - a[0]), 0, 1, 0, 0);
        const u0 = ((i * 230 + row * 410 + 1400 * 4) % 1100);
        g.drawImage(strip, u0 * PX(), 0, 260 * PX(), strip.height, -1, -hh, b[0] - a[0] + 2, hh);
        g.restore();
      }
      prev = q;
    }
    g.restore();
    if (row === 0) furTuft(g, NP[0], NP[1], t, 2.4 * (1.9 / NP[2]), { wind: 1, lx: 0.6, glow: 0.6 + 0.6 * K.smooth(K.seg(t, 14, 16.5)) });
  }
  g.restore();
  // stalks right at the lens (they cross the frame faster than anything else)
  const fg = meadowStrip("fence-fg2", 1800, 300, { blur: 5, count: 420, heads: 30, env: 0.7, fadeTop: 50, body: "#1c1e0e", head: "#3a3018", lit: "rgba(255,200,110,0.5)", headLit: "rgba(255,210,140,0.35)" });
  const fo = -((((cam.sc * 900) % 700) + 700) % 700) - 100;
  smear(g, fg, fo, H - 250 + push * 30, 1800, 300, blurLen * 2.2, taps);
}

// ---- the kitten rig: baked fur masses ----------------------------------------------------------------------------
// Rear-view and curled parts in centimetres, baked at KR px/cm. Every part is lit per pixel by a sun
// behind the kitten (upper-left on screen): front faces sit in the warm sky fill with green bounce from
// the lawn underneath, the silhouette edges toward the sun glow (rim + translucent fur fringe).
const KR = 12;
const TAB = { base: [206, 122, 50], dark: [146, 70, 26], cream: [240, 204, 150] };
const SUNV = [-0.62, -0.78]; // toward the sun, on screen
function furPart(key, E, o = {}) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [cx, cy, rx, ry] of E) { x0 = Math.min(x0, cx - rx); x1 = Math.max(x1, cx + rx); y0 = Math.min(y0, cy - ry); y1 = Math.max(y1, cy + ry); }
  const m = o.margin == null ? 1.3 : o.margin;
  x0 -= m; y0 -= m; x1 += m; y1 += m;
  const wcm = x1 - x0, hcm = y1 - y0;
  const w = Math.ceil(wcm * KR), h = Math.ceil(hcm * KR);
  const Lz = -0.5, ln = Math.hypot(SUNV[0], SUNV[1], Lz);
  const L = [SUNV[0] / ln, SUNV[1] / ln, Lz / ln];
  const stripe = o.stripe || (() => 0), cream = o.cream || (() => 0);
  const seed = o.seed || 1;
  // shading at a point (cm): returns [r,g,b,alpha,edgeK,sunK]
  const shadeAt = (X, Y) => {
    let qm = 1e9, best = null;
    for (const e of E) { const dx = (X - e[0]) / e[2], dy = (Y - e[1]) / e[3], q = dx * dx + dy * dy; if (q < qm) { qm = q; best = [dx, dy, e]; } }
    const r = Math.sqrt(qm);
    const e = best[2];
    const alpha = K.clamp((1 - r) * Math.min(e[2], e[3]) * KR + 0.5);
    const nx = best[0] / Math.max(1, r) , ny = best[1] / Math.max(1, r), nz = Math.sqrt(Math.max(0, 1 - Math.min(1, qm)));
    const lam = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    const st = K.clamp(stripe(X, Y)), cr = K.clamp(cream(X, Y));
    // hair-scale striation along the fur flow (clumped locks: dark partings, lighter tips)
    const fa = (o.flow || (() => Math.PI / 2))(X, Y);
    const along = X * Math.cos(fa) + Y * Math.sin(fa), across = -X * Math.sin(fa) + Y * Math.cos(fa);
    const lock = K.texNoise(across * 7.5, along * 1.1, seed + 21) * 0.65 + K.texNoise(across * 19, along * 2.4, seed + 22) * 0.35;
    const mot = K.texFbm(X * 0.5, Y * 0.5, seed, 3) * 0.12 + lock * 0.13;
    let ar = TAB.base[0] + (TAB.dark[0] - TAB.base[0]) * st * 0.9, ag = TAB.base[1] + (TAB.dark[1] - TAB.base[1]) * st * 0.9, ab = TAB.base[2] + (TAB.dark[2] - TAB.base[2]) * st * 0.9;
    ar += (TAB.cream[0] - ar) * cr; ag += (TAB.cream[1] - ag) * cr; ab += (TAB.cream[2] - ab) * cr;
    ar *= 1 + mot; ag *= 1 + mot; ab *= 1 + mot;
    const sky = 0.42 + 0.16 * Math.max(0, -ny) - 0.1 * Math.max(0, ny);
    const bounce = Math.max(0, ny) * 0.24;
    // occlusion: the underside of every mass closes toward the ground and the next mass (~35% darker)
    const ao = (o.ao ? o.ao(X, Y) : 1) * (1 - 0.36 * Math.pow(Math.max(0, ny), 1.4) * (1 - 0.3 * nz));
    const sun = Math.pow(lam, 0.8) * 1.55;
    // backlit fur: light scatters through the thin silhouette edge toward the sun (red-orange subsurface)
    const edge = sstep(0.7, 1, r) * Math.max(0, nx * SUNV[0] + ny * SUNV[1]);
    const lr = (sky * 1.0 + bounce * 0.5 + sun * 1.0) * ao, lg = (sky * 0.9 + bounce * 0.85 + sun * 0.78) * ao, lb = (sky * 0.8 + bounce * 0.3 + sun * 0.5) * ao;
    return [ar * lr + 150 * edge, ag * lg + 78 * edge, ab * lb + 26 * edge, alpha, r, edge];
  };
  const base = K.texBake("f02-kitb:" + key, w, h, (u, v, out) => {
    const c = shadeAt(x0 + u * wcm, y0 + v * hcm);
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; out[3] = 255 * c[3];
  });
  const spr = K.sprite("f02-kit:" + key, w, h, (s) => {
    if (o.under) { s.save(); s.scale(KR, KR); s.translate(-x0, -y0); o.under(s); s.restore(); }
    s.drawImage(base, 0, 0, w, h);
    s.save();
    s.scale(KR, KR);
    s.translate(-x0, -y0);
    s.lineCap = "round";
    const R = K.rng("kitfur" + key);
    const inside = (X, Y) => { for (const e of E) { const dx = (X - e[0]) / e[2], dy = (Y - e[1]) / e[3]; if (dx * dx + dy * dy < 1) return true; } return false; };
    const paths = new Map();
    const add = (c, k, a) => {
      const key2 = `rgba(${Math.round(c[0] * k / 10) * 10},${Math.round(c[1] * k / 10) * 10},${Math.round(c[2] * k / 10) * 10},${a})`;
      let p = paths.get(key2);
      if (!p) { p = new Path2D(); paths.set(key2, p); }
      return p;
    };
    const flow = o.flow || ((X, Y) => Math.PI / 2);
    const area = wcm * hcm;
    const N = Math.round(area * (o.density || 26));
    for (let i = 0; i < N; i++) {
      const X = x0 + R() * wcm, Y = y0 + R() * hcm;
      if (!inside(X, Y)) continue;
      const c = shadeAt(X, Y);
      const a = flow(X, Y) + (R() - 0.5) * 0.5;
      const len = (0.28 + R() * 0.45) * (o.furLen || 1);
      const k = 0.78 + R() * 0.42;
      const p = add(c, k, 0.6);
      const ex = X + Math.cos(a) * len, ey = Y + Math.sin(a) * len;
      p.moveTo(X, Y); p.quadraticCurveTo(X + Math.cos(a) * len * 0.5 + (R() - 0.5) * 0.12, Y + Math.sin(a) * len * 0.5, ex, ey);
    }
    s.lineWidth = 0.075;
    for (const [col, p] of paths) { s.strokeStyle = col; s.stroke(p); }
    // fringe: hairs leaving the silhouette; the ones toward the sun glow (translucent)
    const fr = new Path2D(), lit = new Path2D();
    for (const e of E) {
      const n = Math.round((e[2] + e[3]) * (o.fringe || 26));
      for (let i = 0; i < n; i++) {
        const th = R() * K.TAU;
        const bx = e[0] + Math.cos(th) * e[2] * 0.96, by = e[1] + Math.sin(th) * e[3] * 0.96;
        // skip edges buried inside another mass
        const ox = e[0] + Math.cos(th) * e[2] * 1.06, oy = e[1] + Math.sin(th) * e[3] * 1.06;
        let buried = false;
        for (const f2 of E) if (f2 !== e) { const dx = (ox - f2[0]) / f2[2], dy = (oy - f2[1]) / f2[3]; if (dx * dx + dy * dy < 1) { buried = true; break; } }
        if (buried) continue;
        const nx = Math.cos(th) / e[2], ny = Math.sin(th) / e[3], nl = Math.hypot(nx, ny);
        const fa = Math.atan2(ny / nl, nx / nl) * 0.75 + flow(bx, by) * 0.25 + (R() - 0.5) * 0.5;
        const len = (0.35 + R() * 0.7) * (o.fringeLen || 1);
        const sunK = (nx / nl) * SUNV[0] + (ny / nl) * SUNV[1];
        const p = sunK > 0.15 ? lit : fr;
        p.moveTo(bx, by);
        p.quadraticCurveTo(bx + Math.cos(fa) * len * 0.6 + (R() - 0.5) * 0.15, by + Math.sin(fa) * len * 0.6, bx + Math.cos(fa) * len, by + Math.sin(fa) * len + len * 0.12);
      }
    }
    s.lineWidth = 0.07;
    s.strokeStyle = "rgba(120,62,24,0.55)";
    s.stroke(fr);
    s.globalCompositeOperation = "lighter";
    s.strokeStyle = "rgba(255,190,110,0.55)";
    s.stroke(lit);
    s.globalCompositeOperation = "source-over";
    if (o.over) o.over(s);
    s.restore();
  });
  return { spr, x0, y0, w: wcm, h: hcm };
}
// draw a part at screen (X, Y) = its origin, sc px/cm, rotation, squash (sx, sy)
function drawPart(g, P, X, Y, sc, o = {}) {
  g.save();
  g.translate(X, Y);
  if (o.rot) g.rotate(o.rot);
  g.scale((o.sx || 1) * (o.flip ? -1 : 1), o.sy || 1);
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  g.drawImage(P.spr, P.x0 * sc, P.y0 * sc, P.w * sc, P.h * sc);
  g.restore();
}
const RIG = {};
const DEF = {};
// the rig parts are built lazily, one at a time (so a warm-up can spread them over frames)
function rigDefs() {
  if (DEF.rump) return DEF;
  // the rump from behind: two round thighs and the hips; rings on the thighs, a dark line down the
  // spine, pale "britches" fluff between the thighs
  DEF.rump = () => furPart("rump", [[0, 0, 4.4, 4.8], [-2.9, 1.8, 2.7, 3.3], [2.9, 1.8, 2.7, 3.3]], {
    seed: 3,
    stripe: (X, Y) => {
      const sp = Math.abs(X) < 0.7 + K.texNoise(Y * 0.8, 1, 5) * 0.25 && Y < 1 ? 1 : 0;
      let ring = 0;
      for (const c of [-2.9, 2.9]) { const d = Math.hypot((X - c) / 1.0, (Y - 1.8) / 1.25); ring = Math.max(ring, sstep(0.45, 0.9, Math.sin(d * 4.4 + K.texNoise(X * 1.5, Y * 1.5, 7) * 1.1)) * sstep(0.3, 1.0, d)); }
      const back = sstep(0.45, 0.95, Math.sin(Y * 3.4 + Math.abs(X) * 0.8 + K.texNoise(X * 0.9, Y * 0.5, 9) * 1.6)) * (Y < 0.5 ? 0.85 : 0);
      return Math.max(sp, ring * 0.85, back * 0.7);
    },
    cream: (X, Y) => sstep(1.4, 3.8, Y) * (1 - sstep(1.0, 2.6, Math.abs(X))) * 0.9,
    flow: (X, Y) => Math.atan2(1.2, X * 0.25) + (Y > 2 ? 0 : 0),
    ao: (X, Y) => 1 - 0.35 * sstep(2.2, 4.6, Y) * (1 - sstep(0.6, 2.2, Math.abs(X))),
  });
  // the back of the head with the neck ruff (ears are separate so they can twitch)
  DEF.head = () => furPart("headback", [[0, 0, 3.5, 3.1], [0, 2.6, 4.0, 2.1]], {
    seed: 5,
    stripe: (X, Y) => {
      const v = sstep(0.5, 0.9, Math.sin(X * 4.2 + K.texNoise(Y * 0.8, 2, 3) * 0.9)) * (Y < 1.2 ? 1 : 0) * (1 - sstep(1.4, 2.6, Math.abs(X)));
      const neck = sstep(0.55, 0.95, Math.sin(Y * 3.6 + Math.abs(X) * 0.5 + 1)) * (Y > 1.2 ? 0.75 : 0);
      return Math.max(v, neck);
    },
    flow: (X, Y) => Math.atan2(1, X * 0.35),
    furLen: 0.9,
  });
  const ear = (side) => furPart("ear" + side, [[0, -1.6, 0.01, 0.01]], {
    margin: 3.3, seed: 8 + side, density: 0, fringe: 0,
    under: (s) => {
      // the pinna from behind: big kitten ears, translucent where thin
      const p = new Path2D();
      const bent = side < 0;
      p.moveTo(-1.6, 0.8);
      p.quadraticCurveTo(-1.5 + side * 0.2, -2.4, 0.15 * side, -4.4);
      if (bent) { p.lineTo(0.75 * side * -1 + 0.2, -3.7); p.lineTo(0.5, -3.6); }
      p.quadraticCurveTo(1.3, -2.2, 1.6, 0.8);
      p.closePath();
      const bg = s.createLinearGradient(0, -4.4, 0, 0.8);
      bg.addColorStop(0, "rgb(132,64,28)");
      bg.addColorStop(1, "rgb(92,46,20)");
      s.fillStyle = bg;
      s.fill(p);
      s.save();
      s.clip(p);
      // the back of the pinna is furred: fine lines along its length
      s.strokeStyle = "rgba(60,26,10,0.35)";
      s.lineWidth = 0.05;
      s.beginPath();
      const Rf = K.rng("earf" + side);
      for (let i = 0; i < 60; i++) { const x = -1.5 + Rf() * 3, y = 0.8 - Rf() * 4.6; s.moveTo(x, y); s.lineTo(x + (Rf() - 0.5) * 0.2, y - 0.4 - Rf() * 0.4); }
      s.stroke();
      // transmission: the thin tip glows where the sun shines through it
      const gl = s.createLinearGradient(0, -4.4, 0, 0.8);
      gl.addColorStop(0, "rgba(255,120,60,0.9)");
      gl.addColorStop(0.4, "rgba(230,90,40,0.4)");
      gl.addColorStop(1, "rgba(150,60,24,0)");
      s.globalCompositeOperation = "lighter";
      s.fillStyle = gl;
      s.fill(p);
      // subsurface rim on the edge facing the sun (upper-left), fading round to nothing on the far edge
      const rg = s.createLinearGradient(-1.8, -4.4, 1.6, 0.8);
      rg.addColorStop(0, "rgba(255,120,56,1)");
      rg.addColorStop(0.5, "rgba(255,96,40,0.5)");
      rg.addColorStop(1, "rgba(255,96,40,0)");
      s.strokeStyle = rg;
      s.lineWidth = 0.7;
      if (K.hasFilter()) s.filter = "blur(1.5px)";
      s.stroke(p);
      s.filter = "none";
      s.lineWidth = 0.2;
      s.stroke(p);
      s.restore();
      // ear furnishings: pale hairs at the inner edge, backlit
      s.globalCompositeOperation = "lighter";
      s.strokeStyle = "rgba(255,214,160,0.5)";
      s.lineWidth = 0.06;
      const R = K.rng("earh" + side);
      s.beginPath();
      for (let i = 0; i < 40; i++) { const u = R(); const x = -1.5 + u * 3.0, y = -0.2 - Math.sin(u * Math.PI) * 3.6 * R(); s.moveTo(x, y); s.lineTo(x + (R() - 0.5) * 0.5, y - 0.6 - R() * 0.6); }
      s.stroke();
      s.globalCompositeOperation = "source-over";
      if (bent) { s.fillStyle = "rgba(70,34,14,0.8)"; s.beginPath(); s.moveTo(-0.3, -3.65); s.lineTo(0.5, -3.6); s.lineTo(0.05, -3.2); s.closePath(); s.fill(); }
    },
  });
  DEF.earL = () => ear(-1);
  DEF.earR = () => ear(1);
  DEF.puffA = () => furPart("puffA", [[0, 0, 1.3, 1.3]], { seed: 11, stripe: () => 0.1, fringe: 30, density: 34 });
  DEF.puffB = () => furPart("puffB", [[0, 0, 1.3, 1.3]], { seed: 12, stripe: () => 0.95, fringe: 30, density: 34 });
  DEF.leg = () => furPart("leg", [[0, 0, 1.05, 2.3], [0, 2.3, 1.2, 0.95]], { seed: 13, stripe: (X, Y) => (Y < 1.6 ? sstep(0.5, 0.95, Math.sin(Y * 4.6 + X * 0.6)) * 0.7 : 0), flow: () => Math.PI / 2, margin: 0.9 });
  // a hind foot seen from behind and above: a furred oval, toes tucked, no pads showing
  DEF.foot = () => furPart("foot", [[0, 0, 1.15, 0.8], [0, -0.7, 0.8, 0.7]], { seed: 17, stripe: () => 0.08, cream: () => 0.35, flow: () => Math.PI / 2, margin: 0.8, fringe: 30 });
  // the curled, tumbling kitten (side view: body, tucked head with ears, paws)
  DEF.ball = () => furPart("ball", [[0, 0, 4.4, 3.9], [3.4, -2.2, 2.7, 2.5], [-2.6, 2.6, 1.3, 1.1], [1.4, 3.3, 1.1, 1.0]], {
    seed: 15,
    stripe: (X, Y) => sstep(0.5, 0.9, Math.sin(Math.atan2(Y, X) * 7 + Math.hypot(X, Y) * 0.4 + K.texNoise(X * 0.6, Y * 0.6, 4) * 1.2)) * (X < 2 ? 0.85 : 0.4),
    cream: (X, Y) => sstep(1.2, 3.6, Y) * 0.6,
    flow: (X, Y) => Math.atan2(Y, X) + 1.2,
    over: (s) => {
      // ears and a closed eye on the tucked head
      for (const [ex, ey, a] of [[3.0, -4.3, -0.5], [4.9, -3.6, 0.3]]) {
        s.save(); s.translate(ex, ey); s.rotate(a);
        s.fillStyle = "rgb(150,74,30)";
        s.beginPath(); s.moveTo(-1, 0.6); s.lineTo(0, -1.9); s.lineTo(1, 0.6); s.closePath(); s.fill();
        s.globalCompositeOperation = "lighter"; s.fillStyle = "rgba(255,140,80,0.45)"; s.fill(); s.globalCompositeOperation = "source-over";
        s.restore();
      }
      s.strokeStyle = "rgba(40,20,10,0.8)"; s.lineWidth = 0.14;
      s.beginPath(); s.arc(4.1, -2.0, 0.45, 0.2, 2.6); s.stroke();
      s.fillStyle = "#d88a80"; s.beginPath(); s.ellipse(5.9, -1.5, 0.3, 0.22, 0, 0, K.TAU); s.fill();
    },
  });
  // sitting, from behind (pear-shaped body)
  DEF.sit = () => furPart("sit", [[0, 0, 4.0, 5.0], [0, 3.8, 5.0, 3.0]], {
    seed: 16,
    stripe: (X, Y) => Math.max(Math.abs(X) < 0.55 + K.texNoise(Y, 3, 4) * 0.2 && Y < 2 ? 1 : 0, sstep(0.45, 0.9, Math.sin(Y * 3.3 + Math.abs(X) * 0.9 + K.texNoise(X * 0.8, Y * 0.5, 2) * 1.4)) * 0.8),
    flow: (X, Y) => Math.atan2(1.4, X * 0.3),
    ao: (X, Y) => 1 - 0.3 * sstep(4.5, 6.6, Y),
  });
  return DEF;
}
const RIG_PARTS = ["rump", "head", "earL", "earR", "puffA", "puffB", "leg", "foot", "ball", "sit"];
function rigPart(k) {
  if (!RIG[k]) RIG[k] = rigDefs()[k]();
  return RIG[k];
}
function rig() {
  if (RIG.ok) return RIG;
  for (const k of RIG_PARTS) rigPart(k);
  RIG.ok = true;
  return RIG;
}
// the tail: a chain of fur puffs (tabby rings, dark tip) along a lashing curve from (X, Y)
function drawTail(g, X, Y, sc, a0, curl, len = 8.5, t = 0) {
  const R = rig();
  const n = 13;
  let x = X, y = Y, a = a0;
  const seg = (len / n) * sc;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    a += curl * 0.16 + Math.sin(t * 6 - i * 0.5) * 0.04;
    x += Math.cos(a) * seg; y += Math.sin(a) * seg;
    const r = 1 - u * 0.4;
    const dark = Math.floor(i / 2) % 2 === 1 || i >= n - 2;
    drawPart(g, dark ? R.puffB : R.puffA, x, y, sc * r, { rot: a + 1.57 });
  }
}

// ---- shot 3: flashback - your garden at home, summer, years ago --------------------------------------------------
// Low medium shot at kitten height; the fence crosses the frame angled ~28 degrees into depth, the hole
// centred. The low sun is beyond the fence, back-left: the boards and the kitten are backlit, light
// streams through the gaps onto our lawn in long warm stripes.
const F3 = fenceDef({ ox: 0.0, oz: 0.8, ang: 0.49, pw: 0.085, step: 0.125, ph: 0.92, rails: [[0.07, 0.13], [0.66, 0.73]], hole: { k: 0, lift: 0.26 } });
const CAM3 = { x: 0.04 + F3.pw / 2 * F3.dx, y: 0.15, z: 0, f: 860, cx: 480, cy: 228 };
const HOLE3 = fpt(F3, F3.pw / 2);
const LD3 = [0.5, -0.866]; // the sunlight's direction across the ground (toward camera-right)
function warmSkyBeyond() {
  return blurSprite("f02-summer4", W + 160, 420, 4, (s, w, h) => {
    const sk = s.createLinearGradient(0, 0, 0, 300);
    sk.addColorStop(0, "#f6c88a");
    sk.addColorStop(0.6, "#ffdca6");
    sk.addColorStop(1, "#fff0c8");
    s.fillStyle = sk;
    s.fillRect(0, 0, w, h);
    K.sunGlow(s, 150, 70, 26, "#ffe2a8", 1.4);
    // the far side: trees and a hedge against the low sun, hazed warm
    for (const [x, y, sc, sd] of [[60, 236, 0.9, 21], [330, 230, 0.7, 22], [700, 238, 1.0, 24], [1000, 232, 0.8, 23]]) K.tree(s, x, y, sc, { seed: sd, sun: { x: 150, y: 70 } });
    s.globalCompositeOperation = "source-atop";
    s.fillStyle = "rgba(255,214,150,0.38)";
    s.fillRect(0, 0, w, 240);
    s.globalCompositeOperation = "source-over";
    const hedge = new Path2D();
    hedge.moveTo(0, 300);
    for (let x = 0; x <= w; x += 16) hedge.lineTo(x, 214 - K.fbm(x / 80, 3) * 16 - Math.sin(x * 0.012) * 6);
    hedge.lineTo(w, 300); hedge.closePath();
    s.fillStyle = "#6a6a2c";
    s.fill(hedge);
    K.texFill(s, "foliage", hedge, { scale: 70, alpha: 0.7, mode: "multiply", tex: { seed: 5, color: "#8a9a48" } });
    s.fillStyle = "rgba(255,206,140,0.3)"; s.fill(hedge);
    // the sunlit lawn beyond the fence (bright, warm, long shadows of its own grass)
    const lg = s.createLinearGradient(0, 226, 0, h);
    lg.addColorStop(0, "#d8c070");
    lg.addColorStop(0.3, "#b0b048");
    lg.addColorStop(1, "#8a9a34");
    s.fillStyle = lg;
    s.fillRect(0, 232, w, h - 232);
    K.texRect(s, "turf", 0, 232, w, h - 232, { scale: 90, scaleY: 30, alpha: 0.45, mode: "multiply", tex: { seed: 22, color: "#9aa848" } });
    s.drawImage(meadowStrip("beyond3", w, 120, { count: 1400, heads: 30, env: 0.5, body: "#7a8030", head: "#c0a860", lit: "rgba(255,236,170,0.75)", headLit: "rgba(255,236,180,0.6)" }), 0, 236, w, 120);
  });
}
// our side: the lawn in the fence's shadow, with stripes of low sun through every gap (and a wide
// patch through the hole where the picket has rotted away); baked once (the camera is locked off)
function lawnPlate3() {
  return K.sprite("f02-lawn3", W, H, (s) => {
    // our side only: below the projected foot line of the fence
    const clip = new Path2D();
    for (let s0 = -2.5, i = 0; s0 <= 4; s0 += 0.25, i++) { const q = fpt(F3, s0, 0); const pp = P3(CAM3, q[0], 0, q[1]); if (i === 0) clip.moveTo(pp[0], pp[1]); else clip.lineTo(pp[0], pp[1]); }
    clip.lineTo(W + 400, H + 50); clip.lineTo(-400, H + 50); clip.closePath();
    s.clip(clip);
    K.groundPlane(s, W, H, { tex: "turf", texOpts: { seed: 12, dry: 0.25, color: "#6a8a34" }, horizon: CAM3.cy, scale: 140, focal: 700, fog: "#c8c070", fogAmt: 0.6, cache: false, variation: 0.6 });
    // the lawn's own blades, rows receding toward the fence (short summer lawn, a little uneven)
    for (const [off, hgt, row] of [[0.06, 0.035, 0], [0.16, 0.04, 1], [0.27, 0.045, 2], [0.4, 0.05, 3]]) {
      let prev = null;
      for (let s0 = -2.4, i = 0; s0 <= 3.6; s0 += 0.3, i++) {
        const q0 = fpt(F3, s0, off), q = P3(CAM3, q0[0], 0, q0[1]);
        if (prev && q[2] > 0.2 && prev[2] > 0.2 && !(q[0] < -40 || prev[0] > W + 40)) {
          const a = prev, b = q, hh = (CAM3.f * hgt) / ((a[2] + b[2]) / 2);
          s.save();
          s.translate(a[0], a[1] + 2);
          s.transform(1, (b[1] - a[1]) / (b[0] - a[0]), 0, 1, 0, 0);
          s.drawImage(meadowStrip("lawn3", 900, 70, { count: 2600, heads: 0, env: 0.4, fadeTop: 14, body: "#4a6a26", lit: "rgba(220,230,140,0.35)" }), (((i * 131 + row * 277) % 600)) * PX(), 0, 300 * PX(), 70 * PX(), -1, -hh, b[0] - a[0] + 2, hh);
          s.restore();
        }
        prev = q;
      }
    }
    // in the fence's shade: warm sky fill only
    s.fillStyle = "rgba(60,54,40,0.5)";
    s.fillRect(0, CAM3.cy, W, H - CAM3.cy);
    const shafts = new Path2D();
    const quad = (pts) => { shafts.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) shafts.lineTo(q[0], q[1]); shafts.closePath(); };
    const tanEl = Math.tan(0.2);
    const on = (x, z, d) => P3(CAM3, x + LD3[0] * d, 0, z + LD3[1] * d);
    const maxD = (x, z) => Math.max(0.05, Math.min(3, (z - 0.3) / -LD3[1]));
    for (let k = -8; k <= 10; k++) {
      // the gap after picket k (or the whole hole width at k = 0)
      const sa = k === 0 ? -0.0 : k * F3.step + F3.pw, sb = k === 0 ? F3.step : (k + 1) * F3.step;
      const [ax, az] = fpt(F3, sa), [bx, bz] = fpt(F3, sb);
      const top = k === 0 ? F3.hole.lift : F3.ph;
      // light passes under the bottom rail and between the rails
      const bands = k === 0 ? [[0, 0.07], [0.13, F3.hole.lift]] : [[0, 0.07], [0.13, 0.66], [0.73, top]];
      for (const [h0, h1] of bands) {
        const d0 = h0 / tanEl, d1 = Math.min(h1 / tanEl, maxD(ax, az));
        if (d1 <= d0) continue;
        quad([on(ax, az, d0), on(bx, bz, d0), on(bx, bz, d1), on(ax, az, d1)]);
      }
    }
    s.save();
    if (K.hasFilter()) s.filter = "blur(3px)";
    s.globalCompositeOperation = "screen";
    s.fillStyle = "rgba(255,196,110,0.5)";
    s.fill(shafts);
    s.globalCompositeOperation = "soft-light";
    s.fillStyle = "rgba(255,220,140,0.6)";
    s.fill(shafts);
    s.restore();
    // the hollow scooped under the bottom rail at the hole, with spilled crumbs
    const [hx, hz] = HOLE3;
    const a = P3(CAM3, hx - 0.07, 0, hz - 0.03), b = P3(CAM3, hx + 0.07, 0, hz - 0.03), c = P3(CAM3, hx, 0, hz - 0.1);
    const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
    const hg = s.createRadialGradient(cx, cy - 4, 2, cx, cy, Math.abs(b[0] - a[0]) * 0.65);
    hg.addColorStop(0, "rgba(28,18,10,0.95)");
    hg.addColorStop(0.6, "rgba(54,36,22,0.8)");
    hg.addColorStop(1, "rgba(70,48,30,0)");
    s.fillStyle = hg;
    s.beginPath(); s.ellipse(cx, cy + 2, Math.abs(b[0] - a[0]) * 0.65, Math.abs(c[1] - cy) * 0.9 + 6, 0, 0, K.TAU); s.fill();
    const R = K.rng("crumbs3");
    for (let i = 0; i < 60; i++) {
      s.fillStyle = `rgba(${78 + R() * 30},${56 + R() * 20},${34 + R() * 14},${0.5 + R() * 0.4})`;
      s.beginPath(); s.arc(cx + (R() - 0.5) * 150, cy + 6 + R() * 26, 0.6 + R() * 1.8, 0, K.TAU); s.fill();
    }
  });
}
function fencePlate3() {
  return K.sprite("f02-fence3b", W, H, (s) => {
    drawFence(s, CAM3, F3, {
      kmin: -9, kmax: 12, lx: 0, tone: "#c8b8a0", rim: "#ffc070", zf: 0.95, cocK: 4, paint: 0.12,
      railCol: "#8a7e6c", railTop: "rgba(255,200,120,0.55)", sideCol: "rgba(70,58,46,0.95)", foot: true,
    });
    // grass at the fence foot on our side, sheared onto the projected line
    for (let s0 = -1.0, i = 0; s0 < 1.6; s0 += 0.25, i++) {
      const pa = fpt(F3, s0, 0.02), pb = fpt(F3, s0 + 0.26, 0.02);
      const a = P3(CAM3, pa[0], 0, pa[1]), b = P3(CAM3, pb[0], 0, pb[1]);
      if (b[0] < -40 || a[0] > W + 40) continue;
      if (Math.abs(s0 + 0.12 - F3.pw / 2) < 0.2) continue; // trampled at the hole
      const hh = (CAM3.f * 0.055) / a[2];
      s.save();
      s.translate(a[0], a[1] + 2);
      s.transform(1, (b[1] - a[1]) / (b[0] - a[0]), 0, 1, 0, 0);
      s.drawImage(meadowStrip("foot3", 600, 90, { count: 900, heads: 6, env: 0.5, fadeTop: 20, body: "#3a5a22", head: "#8a8a50", lit: "rgba(255,210,130,0.55)", headLit: "rgba(255,220,150,0.4)" }), ((i * 97) % 300) * PX(), 0, 300 * PX(), 90 * PX(), -1, -hh, b[0] - a[0] + 2, hh);
      s.restore();
    }
  });
}
// the kitten's state at time t (u: metres past the fence plane, negative = on our side)
function kit3(t) {
  const st = { mode: "rear" };
  if (t < 19) {
    st.rump = { u: -0.135, h: 6.2, sx: 1, sy: 1, rot: 0 };
    st.head = { u: -0.06, h: 12.5 + Math.sin(t * 4) * 0.3, far: false, rot: Math.sin(t * 1.3) * 0.08 };
    st.legs = [0, 0];
  } else if (t < 21) {
    const k = K.ease.inOut(K.seg(t, 19, 21));
    st.rump = { u: K.lerp(-0.135, -0.07, k), h: K.lerp(6.2, 7.0, k), sx: 1, sy: 1, rot: Math.sin(t * 7) * 0.03 * k };
    const hu = K.lerp(-0.06, 0.035, k);
    st.head = { u: hu, h: hu < 0 ? K.lerp(12.5, 5, K.smooth(K.seg(t, 19, 20.1))) : K.lerp(5, 10, K.smooth(K.seg(t, 20.1, 21))), far: hu > -0.01, rot: 0 };
    st.legs = [Math.max(0, Math.sin(t * 7)) * 0.3 * k, Math.max(0, Math.sin(t * 7 + 3)) * 0.3 * k];
  } else if (t < 24) {
    const w = Math.sin(t * 10.5);
    st.rump = { u: -0.062, h: 7.1, sx: 1.06, sy: 0.9, rot: w * 0.07, wx: w * 0.55 };
    st.head = { u: 0.04, h: 10 + Math.sin(t * 3) * 0.4, far: true, rot: Math.sin(t * 2.2) * 0.06 };
    st.legs = [Math.max(0, Math.sin(t * 12.5)), Math.max(0, Math.sin(t * 12.5 + Math.PI))];
  } else if (t < 24.45) {
    const sq = K.seg(t, 24, 24.15), go = K.ease.in(K.seg(t, 24.15, 24.45));
    st.mode = go > 0 ? "pop" : "rear";
    st.rump = { u: K.lerp(-0.062, 0.12, go), h: 7.1 - sq * 0.6 + go * 0.5, sx: go > 0 ? K.lerp(1.15, 0.78, go) : K.lerp(1.06, 1.15, sq), sy: go > 0 ? K.lerp(0.82, 1.12, go) : K.lerp(0.9, 0.82, sq), rot: 0 };
    st.head = { u: 0.06 + go * 0.12, h: 10, far: true, rot: 0 };
    st.legs = [0.6 * (1 - go), 0.6 * (1 - go)];
  } else if (t < 27) {
    const k = K.ease.out(K.seg(t, 24.45, 27));
    st.mode = "ball";
    st.ball = { u: K.lerp(0.13, 0.32, k), lat: K.lerp(0, -0.05, k), h: 4.4 + Math.abs(Math.sin(k * Math.PI * 2.5)) * 3 * (1 - k), rot: -k * K.TAU * 2.2, spin: (1 - k) };
  } else {
    st.mode = "sit";
    const sh = K.env(t, 27.3, 28.1, 0.1, 0.2);
    st.sit = { u: 0.33, lat: -0.05, shake: sh * Math.sin(t * 40) * 0.18, look: K.smooth(K.seg(t, 28.6, 29.6)) * 0.25 };
  }
  return st;
}
// the kid's sleeve as fabric: clip to drawHand's sleeve outline, cap the plastic highlight, add a
// woven texture, soft fold shadows and a diffuse sheen (drawHand's local frame, see filmpeople.js)
function sleeveFabric(g, x, y, size, o) {
  const u = size / 100, mirror = o.left ? -1 : 1;
  g.save();
  g.translate(x, y);
  g.rotate(o.angle + Math.PI / 2);
  g.scale(mirror * u, u);
  const p = new Path2D();
  p.moveTo(-30, 260); p.bezierCurveTo(-31, 160, -27, 70, -27, 34); p.quadraticCurveTo(-27, 14, -23, 12);
  p.quadraticCurveTo(0, 5, 23, 12); p.quadraticCurveTo(27, 14, 27, 34); p.bezierCurveTo(28, 80, 31, 170, 32, 260); p.closePath();
  g.clip(p);
  g.globalCompositeOperation = "darken";
  g.fillStyle = K.shade(o.sleeve, 0.08);
  g.fillRect(-40, 0, 80, 270);
  g.globalCompositeOperation = "multiply";
  K.texFill(g, "fabric", p, { scale: 26, alpha: 0.55, tex: { seed: 7 } });
  g.globalCompositeOperation = "source-over";
  // folds: soft compression rings round the forearm
  for (const [fy, a] of [[44, 0.3], [70, 0.24], [104, 0.28], [150, 0.2], [205, 0.22]]) {
    const fg = g.createLinearGradient(0, fy - 7, 0, fy + 9);
    fg.addColorStop(0, "rgba(0,0,0,0)");
    fg.addColorStop(0.45, `rgba(20,14,10,${a})`);
    fg.addColorStop(0.6, `rgba(255,236,200,${a * 0.35})`);
    fg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = fg;
    g.beginPath(); g.moveTo(-34, fy - 6); g.quadraticCurveTo(0, fy + 4, 34, fy - 8); g.lineTo(34, fy + 10); g.quadraticCurveTo(0, fy + 16, -34, fy + 10); g.closePath(); g.fill();
  }
  // diffuse sheen across the cylinder toward the light side
  const sx = o.lightSide || 1;
  const sg = g.createLinearGradient(-30 * sx * mirror, 0, 30 * sx * mirror, 0);
  sg.addColorStop(0, "rgba(10,8,6,0.32)");
  sg.addColorStop(0.55, "rgba(0,0,0,0)");
  sg.addColorStop(0.85, "rgba(255,226,180,0.12)");
  sg.addColorStop(1, "rgba(255,226,180,0.2)");
  g.fillStyle = sg;
  g.fillRect(-40, 0, 80, 270);
  g.restore();
}
// The kit hand adds an additive rim stroke in the light's colour on every edge facing the light; on a
// backlit hand that reads as a hard glowing outline. Passing the light at the same hue but ~1/6 the
// value keeps the form shading (the kit normalises the colour) and leaves that stroke invisible;
// skinPass() then adds the real thing.
const SUN_DIM = "#2a241b"; // #ffd8a0 / 6
// skin subsurface for hands drawn into layer HL: a soft red-orange translucent edge only on the side
// facing the light (sun = unit screen direction toward it), 1-3 px with falloff, and the side turned
// away from the light (palm, undersides of the fingers) a step darker. box = [x0, y0, x1, y1] logical.
function skinPass(HL, box, sun, o = {}) {
  const S = K.layer(W, H, "f02-sss");
  const s = S.g;
  const ps = PX();
  const x0 = Math.max(0, box[0]), y0 = Math.max(0, box[1]), x1 = Math.min(W, box[2]), y1 = Math.min(H, box[3]);
  const bw = x1 - x0, bh = y1 - y0;
  if (bw <= 2 || bh <= 2) return;
  const blit = (dx, dy) => s.drawImage(HL.canvas, x0 * ps, y0 * ps, bw * ps, bh * ps, x0 + dx, y0 + dy, bw, bh);
  s.save();
  blit(0, 0);
  s.globalCompositeOperation = "source-in";
  s.fillStyle = o.color || "rgb(255,98,52)";
  s.fillRect(x0, y0, bw, bh);
  // keep only the pixels whose neighbour toward the light is outside the hand: three offsets give a
  // 1-3 px edge that fades inward
  s.globalCompositeOperation = "destination-out";
  const d = o.width || 2.6;
  s.globalAlpha = 0.45; blit(-sun[0] * d * 0.4, -sun[1] * d * 0.4);
  s.globalAlpha = 0.6; blit(-sun[0] * d * 0.7, -sun[1] * d * 0.7);
  s.globalAlpha = 1; blit(-sun[0] * d, -sun[1] * d);
  s.restore();
  const h = HL.g;
  h.save();
  h.globalCompositeOperation = "source-atop";
  h.globalAlpha = o.alpha == null ? 0.55 : o.alpha;
  h.drawImage(S.canvas, x0 * ps, y0 * ps, bw * ps, bh * ps, x0, y0, bw, bh);
  h.globalAlpha = 1;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.max(bw, bh) / 2;
  const gr = h.createLinearGradient(cx + sun[0] * r, cy + sun[1] * r, cx - sun[0] * r, cy - sun[1] * r);
  gr.addColorStop(0, "rgba(46,18,14,0)");
  gr.addColorStop(0.5, "rgba(46,18,14,0)");
  gr.addColorStop(1, `rgba(46,18,14,${o.shade == null ? 0.3 : o.shade})`);
  h.fillStyle = gr;
  h.fillRect(x0, y0, bw, bh);
  h.restore();
}
function shotKitten(g, t, p) {
  const R = rig();
  const e = K.ease.inOut(p);
  const st = kit3(t);
  const [hx, hz] = HOLE3;
  const HS = P3(CAM3, hx, 0, hz);
  // slow lens push, centred on the hole
  g.save();
  const z = 1 + 0.07 * e;
  g.translate(HS[0], HS[1] - 40);
  g.scale(z, z);
  g.translate(-HS[0], -HS[1] + 40);
  g.drawImage(warmSkyBeyond(), -80, -60, W + 160, 420);
  // world -> screen for kitten parts: (u past the fence, lat along it, h cm high)
  const at = (u, lat, hcm) => {
    // past the fence he moves straight away from the lens through the hole (not sideways behind a board)
    const la = lat + (u > 0 ? (u * F3.nx) / F3.dx : 0);
    const x = hx - F3.nx * u + F3.dx * la, zz = hz - F3.nz * u + F3.dz * la;
    const q = P3(CAM3, x, hcm / 100, zz);
    return [q[0], q[1], CAM3.f / (q[2] * 100)];
  };
  const KS = 0.85; // kitten scale
  const head = (far) => {
    if (!st.head || st.head.far !== far) return;
    const [X, Y, sc] = at(st.head.u, 0, st.head.h);
    const s = sc * KS;
    const tw = Math.sin(t * 5.3) * 0.08 + (K.hash(Math.floor(t * 1.7), 3) > 0.7 ? Math.sin(t * 40) * 0.12 : 0);
    drawPart(g, R.earL, X - 2.3 * s, Y - 1.9 * s, s, { rot: -0.32 + tw + st.head.rot });
    drawPart(g, R.earR, X + 2.3 * s, Y - 1.9 * s, s, { rot: 0.32 - tw * 0.7 + st.head.rot });
    drawPart(g, R.head, X, Y, s, { rot: st.head.rot });
  };
  // far side: the head once it is through, the tumble, the sit
  const stuck = st.mode === "rear" && t > 20.5 && t < 24.15;
  if (!stuck) head(true);
  if (st.mode === "ball") {
    const b = st.ball;
    const [X, Y, sc] = at(b.u, b.lat, b.h);
    const s = sc * KS;
    K.shadowBlob(g, X + 10, at(b.u, b.lat, 0)[1], 50 * s / 9, 8 * s / 9, { alpha: 0.35 });
    const n = b.spin > 0.2 ? 3 : 1;
    for (let i = 0; i < n; i++) drawPart(g, R.ball, X, Y, s, { rot: b.rot + i * 0.14 * b.spin, alpha: n > 1 ? 1 / (i + 1) : 1 });
  } else if (st.mode === "sit") {
    const c = st.sit;
    const [X, Y, sc] = at(c.u, c.lat, 5.5);
    const s = sc * KS;
    drawTail(g, X + 3 * s, Y + 7.6 * s, s, 0.1, 0.25 + Math.sin(t * 1.5) * 0.1, 7.5, t);
    drawPart(g, R.sit, X, Y, s);
    const [hX, hY] = [X + c.shake * 10 * s * 0.1, Y - 7.6 * s];
    const tw = Math.sin(t * 4.2) * 0.06;
    drawPart(g, R.earL, hX - 2.3 * s + c.look * 8, hY - 1.9 * s, s, { rot: -0.32 + c.shake + tw });
    drawPart(g, R.earR, hX + 2.3 * s + c.look * 8, hY - 1.9 * s, s, { rot: 0.32 + c.shake - tw });
    drawPart(g, R.head, hX + c.look * 6, hY, s, { rot: c.shake * 0.5 });
  }
  g.drawImage(lawnPlate3(), 0, 0, W, H);
  g.drawImage(fencePlate3(), 0, 0, W, H);
  // near side: the rump, legs, tail, the head before it goes under
  if (st.mode === "rear" || st.mode === "pop") {
    const r = st.rump;
    const [X0, Y0, sc] = at(r.u, 0, r.h);
    const s = sc * KS;
    const X = X0 + (r.wx || 0) * s;
    // the kitten's own shadow, thrown toward camera-right across the lit patch
    const g0 = at(r.u, 0, 0);
    g.save();
    g.translate(g0[0] + 6 * s, g0[1] + 1);
    g.rotate(-0.12);
    const sh = g.createRadialGradient(0, 0, 0, 0, 0, 12 * s);
    sh.addColorStop(0, "rgba(40,30,20,0.5)");
    sh.addColorStop(1, "rgba(40,30,20,0)");
    g.fillStyle = sh;
    g.scale(1.8, 0.28);
    g.beginPath(); g.arc(0, 0, 12 * s, 0, K.TAU); g.fill();
    g.restore();
    const clipPop = st.mode === "pop";
    if (clipPop) {
      // going under the rail: only the part still in the opening below it is visible
      const a = at(-0.02, -0.08, 7), b = at(-0.02, 0.08, 0);
      g.save();
      g.beginPath(); g.rect(Math.min(a[0], b[0]), a[1], Math.abs(b[0] - a[0]), 200); g.clip();
    }
    if (!clipPop && !stuck) head(false);
    const kick = st.legs;
    // the back: the body runs away from us into the hollow, its far end lost in the shade under the rail
    if (stuck) {
      const [bX, bY] = at(r.u + 0.035, 0, r.h + 0.6);
      drawPart(g, R.rump, bX, bY, s * 0.82, { sy: 0.8 });
      const sh2 = g.createRadialGradient(bX, bY - 2 * s, 0, bX, bY - 2 * s, 6 * s);
      sh2.addColorStop(0, "rgba(14,9,5,0.75)");
      sh2.addColorStop(1, "rgba(14,9,5,0)");
      g.fillStyle = sh2;
      g.fillRect(bX - 7 * s, bY - 8 * s, 14 * s, 12 * s);
    }
    // hind legs: planted feet push alternately; a pushing leg extends back toward the lens and the
    // foot slides out (fur toward us, pads to the ground)
    for (const [i, side] of [[0, -1], [1, 1]]) {
      const k = kick[i];
      const lx2 = X + side * (2.7 + k * 0.6) * s, ly2 = Y0 + (3.2 + k * 1.3) * s;
      drawPart(g, R.leg, lx2, ly2, s * (1 + k * 0.12), { sy: 1 + k * 0.25, rot: side * (0.06 + k * 0.25) });
      drawPart(g, R.foot, lx2 + side * k * 0.9 * s, ly2 + (3.1 + k * 1.2) * s, s * (1 + k * 0.15), { rot: side * k * 0.3 });
    }
    drawPart(g, R.rump, X, Y0, s, { rot: r.rot, sx: r.sx, sy: r.sy });
    // the tail, lashing (straight up while stuck: a kitten's flag)
    const lash = st.mode === "pop" ? -1.9 : -1.57 + Math.sin(t * (t > 21 ? 7.5 : 2.4)) * (t > 21 ? 0.55 : 0.25);
    drawTail(g, X + Math.sin(r.rot) * 4 * s, Y0 - 4.2 * s * r.sy, s, lash, t > 21 ? 0.35 * Math.sin(t * 4) : 0.5, 8.5, t);
    if (clipPop) g.restore();
  }
  // the grass right at the lens: soft, swaying, warm-backlit tips
  swayStrip(g, meadowStrip("lawn-fg4", 1300, 140, { blur: 5, count: 700, heads: 0, env: 0.6, fadeTop: 40, body: "#2e4a1a", lit: "rgba(255,214,120,0.55)" }), -170 - e * 20, H - 120, 1300, 140, t, 0.05, 10);
  g.restore();
  // a younger you: two small hands reach in to help (arms in a blue cotton sleeve to the frame edge):
  // they come in as he gets stuck, cup round his rump for the push (24 s), hover as he tumbles
  // through, and hang there a moment before they draw back
  const reach = K.env(t, 22.6, 26.6, 1.2, 0.9);
  if (reach > 0.01) {
    const push = K.ease.inOut(K.seg(t, 23.7, 24.15)) * (1 - K.ease.inOut(K.seg(t, 24.2, 24.9)));
    const L = { x: 120, y: -40, color: SUN_DIM, strength: 1.3, z: -0.1 };
    const HL = K.layer(W, H, "f02-kid-hands3");
    const hands = [
      { x: K.lerp(200, 318 + push * 30, reach), y: K.lerp(690, 486 - push * 18, reach), angle: -0.95 + push * 0.12, left: true },
      { x: K.lerp(800, 650 - push * 30, reach), y: K.lerp(700, 494 - push * 18, reach), angle: -2.2 - push * 0.12, left: false },
    ];
    for (const h of hands) {
      K.drawHand(HL.g, h.x, h.y, 124, { pose: push > 0.3 ? "cup" : "open", angle: h.angle, left: h.left, t, light: L, ambient: "#8a7a5a", sleeve: "#4a6a9a" });
      sleeveFabric(HL.g, h.x, h.y, 124, { angle: h.angle, left: h.left, sleeve: "#4a6a9a", lightSide: -1 });
    }
    skinPass(HL, [150, 300, 830, H], [-0.62, -0.78], { width: 2.6, alpha: 0.5, shade: 0.28 });
    K.dof(g, HL.canvas, 2.2);
  }
  K.dust(g, W, H, t, { seed: 21, color: "#ffe2b0", count: 26, alpha: 0.5, size: 1.1, area: [0, 40, 520, 300] });
}

// ---- shot 4: flashback - from his side; he looks back through the gap, then trots away -------------------------
const SUN4 = { x: 930, y: 8 };
function flowerSprite(kind) {
  return K.sprite("f02-flower:" + kind, 64, 64, (s) => {
    const R = K.rng("fl" + kind);
    const cols = { daisy: ["#f6f2ea", "#c8c0c8"], pink: ["#f2a6c4", "#b0607e"], cosmos: ["#f8d4e2", "#c08aa6"], butter: ["#ffd23a", "#c08a10"] }[kind];
    const np = kind === "butter" ? 5 : kind === "daisy" ? 18 : 8;
    s.translate(32, 32);
    s.scale(1, 0.72);
    for (let i = 0; i < np; i++) {
      const a = (i / np) * K.TAU + R() * 0.2;
      const L = kind === "daisy" ? 26 : kind === "butter" ? 17 : 27;
      const wdt = kind === "daisy" ? 3.2 : kind === "butter" ? 9 : 8;
      s.save();
      s.rotate(a);
      const lg = s.createLinearGradient(0, 0, L, 0);
      const lit = 0.5 + 0.5 * Math.cos(a + 0.8);
      lg.addColorStop(0, K.mix(cols[1], "#3a3a20", 0.3));
      lg.addColorStop(0.35, K.mix(cols[1], cols[0], lit));
      lg.addColorStop(1, K.mix(cols[0], "#ffffff", lit * 0.2));
      s.fillStyle = lg;
      s.beginPath();
      s.moveTo(2, 0);
      s.bezierCurveTo(L * 0.3, -wdt, L * 0.85, -wdt * 0.8, L, (R() - 0.5) * 2);
      s.bezierCurveTo(L * 0.85, wdt * 0.8, L * 0.3, wdt, 2, 0);
      s.fill();
      s.restore();
    }
    const cg = s.createRadialGradient(2, -2, 0, 0, 0, 7);
    cg.addColorStop(0, kind === "butter" ? "#ffe680" : "#ffd24a");
    cg.addColorStop(0.6, kind === "butter" ? "#d09a10" : "#d08a10");
    cg.addColorStop(1, "#6a4a10");
    s.fillStyle = cg;
    s.beginPath(); s.arc(0, 0, kind === "butter" ? 5 : 6.5, 0, K.TAU); s.fill();
  });
}
const FLOWER_KINDS = ["daisy", "pink", "cosmos", "butter"];
function flowers(g, t, list, o = {}) {
  const stemC = o.stem || "#3e6a2a";
  g.lineCap = "round";
  for (const f of list) {
    const sw = Math.sin(t * 1.2 + f.x * 0.02) * f.h * 0.04 + Math.sin(t * 2.6 + f.x) * f.h * 0.012;
    const tx = f.x + f.lean + sw, ty = f.y - f.h;
    g.strokeStyle = stemC;
    g.lineWidth = f.s * 0.07;
    g.beginPath(); g.moveTo(f.x, f.y); g.quadraticCurveTo(f.x + f.lean * 0.3, f.y - f.h * 0.5, tx, ty); g.stroke();
    g.save();
    g.translate(tx, ty);
    g.rotate(f.tilt + sw * 0.01);
    g.drawImage(flowerSprite(f.kind), -f.s / 2, -f.s / 2, f.s, f.s);
    g.restore();
  }
}
function flowerList(seed, n, x0, x1, y0, y1, s0, s1, h0, h1) {
  const R = K.rng("flist" + seed), out = [];
  for (let i = 0; i < n; i++) {
    const v = R();
    out.push({ x: K.lerp(x0, x1, R()), y: K.lerp(y0, y1, v), s: K.lerp(s0, s1, v) * (0.8 + R() * 0.4), h: K.lerp(h0, h1, v) * (0.7 + R() * 0.5), lean: (R() - 0.5) * 20, tilt: (R() - 0.5) * 0.6, kind: FLOWER_KINDS[Math.floor(R() * 4)] });
  }
  return out.sort((a, b) => a.y - b.y);
}
const FL4_MID = flowerList(4, 46, 560, 1040, 420, 470, 16, 26, 70, 160);
const FL4_FG = flowerList(5, 9, 640, 1020, 520, 560, 54, 80, 120, 220);
const HOLE4X = 352;
// The fence seen from HIS side, low (the rails are on this side of the boards), with the hole at its
// foot; you are on the far side, close behind the boards: legs and red boots seen through the gaps
// and through the hole, cropped at the waist by the frame. Baked once and pre-blurred (out of focus).
function lookBackBg() {
  return blurSprite("f02-lb-bg5", W, 430, 4.5, (s) => {
    K.sky(s, W, 430, { top: "#ffd8a0", mid: "#ffe8c0", bottom: "#fff0d6", horizon: 0.8, sun: { x: SUN4.x, y: SUN4.y, color: "#fff0c8" }, haze: 0.8 });
    K.groundPlane(s, W, 430, { tex: "turf", texOpts: { seed: 12, dry: 0.2, color: "#7a8a3a" }, horizon: 300, scale: 260, fog: "#e0d090", fogAmt: 0.7, cache: false });
    // you, on the far side, a step behind the boards (feet above the fence foot = farther away)
    const PS = 560; // px per metre at the fence
    const top = 404 - 0.92 * PS;
    K.shadowBlob(s, HOLE4X + 20, 372, 120, 8, { alpha: 0.35 });
    K.drawPerson(s, HOLE4X + 6, 374, 700, { view: "back", t: 0, breathe: false, coat: "#4a6a9a", pants: "#3e4458", boots: "#a8322e", light: { x: SUN4.x, y: SUN4.y, color: "#fff0c8", strength: 1.0, z: -0.5 }, ambient: "#6a5e50", shadow: false });
    // the boards (the hole's board snapped off high), a contact shadow at every foot
    for (let i = 0; i < 9; i++) {
      const x = -30 + i * 124;
      const hole = Math.abs(x + 42 - HOLE4X) < 60;
      const lift = hole ? Math.round(0.21 * PS) : 0;
      const rails = hole ? null : [[Math.round(515 - 0.73 * PS), Math.round(515 - 0.66 * PS)], [Math.round(515 - 0.13 * PS), Math.round(515 - 0.07 * PS)]];
      s.drawImage(picketSprite(84, 515, i % 7, { lx: 0.5, broken: lift, res: 1, tone: "#e8dcc8", rails, railAO: 0.45, paint: 0.12 }), x, top, 84, 515);
      if (!lift) K.shadowBlob(s, x + 46, 404, 46, 4, { alpha: 0.4 });
    }
    // the rails on this side of the boards, lit along their tops by the low sun
    for (const [r0, r1] of [[0.07, 0.13], [0.66, 0.73]]) {
      const y0 = 404 - r1 * PS, hh = (r1 - r0) * PS;
      K.texRect(s, "wood", 0, y0, W, hh, { scale: 220, tex: { seed: 4, color: "#c8bca4", planks: 1 } });
      const rg = s.createLinearGradient(0, y0, 0, y0 + hh);
      rg.addColorStop(0, "rgba(255,236,190,0.35)");
      rg.addColorStop(0.25, "rgba(0,0,0,0)");
      rg.addColorStop(1, "rgba(40,30,30,0.4)");
      s.fillStyle = rg; s.fillRect(0, y0, W, hh);
      // the rail's soft shadow under it
      const sg = s.createLinearGradient(0, y0 + hh, 0, y0 + hh + 16);
      sg.addColorStop(0, "rgba(30,24,20,0.4)");
      sg.addColorStop(1, "rgba(30,24,20,0)");
      s.fillStyle = sg; s.fillRect(0, y0 + hh, W, 16);
    }
    // the dug-out hollow at the foot of the broken board, sun spilling through it toward us
    digHole(s, HOLE4X, 405, 58, 0, { seed: 4, sun: 0.8 });
  });
}
// the kitten at time t: a list of {x, facing, pose, headTurn, gaze, a} (two entries = a quick pivot,
// cross-blended over a quarter second)
function kit4(t) {
  const stopX = 560;
  if (t < 31.4) return [{ x: K.lerp(380, stopX, K.ease.out(K.seg(t, 30, 31.4))), facing: 1, pose: "walk", headTurn: 0.12, gaze: 0, a: 1 }];
  const looking = { x: stopX - 6, facing: -1, pose: "stand", headTurn: K.lerp(0.05, -0.2, K.smooth(K.seg(t, 31.9, 32.6))), gaze: -0.3 };
  const fwd = (k) => ({ x: stopX + 6 + k * 360, facing: 1, pose: k > 0 ? "walk" : "stand", headTurn: 0.1, gaze: 0 });
  // he pauses, turns round toward the gap, looks, turns back and trots off into the flowers
  if (t < 31.6) return [{ ...fwd(0), x: stopX, a: 1 }];
  if (t < 31.85) { const k = K.smooth(K.seg(t, 31.6, 31.85)); return [{ ...fwd(0), x: stopX, a: 1 - k }, { ...looking, a: k }]; }
  if (t < 33.9) return [{ ...looking, a: 1 }];
  if (t < 34.15) { const k = K.smooth(K.seg(t, 33.9, 34.15)); return [{ ...looking, a: 1 - k }, { ...fwd(0), a: k }]; }
  return [{ ...fwd(K.ease.inOut(K.seg(t, 34.15, 37.4))), a: 1 }];
}
function shotLookBack(g, t, p) {
  const go = K.ease.inOut(K.seg(t, 34.15, 37.4));
  const camX = K.lerp(0, 24, K.ease.inOut(p)) + go * 30;
  g.drawImage(lookBackBg(), -camX * 0.3, 0, W + 30, 430);
  const mg = g.createLinearGradient(0, 400, 0, H);
  mg.addColorStop(0, "#5a6a2a");
  mg.addColorStop(0.3, "#3a4a1c");
  mg.addColorStop(1, "#1a240c");
  g.fillStyle = mg;
  g.fillRect(0, 404, W, H - 404);
  K.texRect(g, "turf", 0, 404, W, H - 404, { scale: 160, scaleY: 50, alpha: 0.5, mode: "soft-light", tex: { seed: 14 } });
  K.aoEdge(g, 0, 406, W, 406, { width: 12, alpha: 0.3, side: -1 });
  // the sun through the hole lays a warm tongue on the grass toward us
  const hx4 = HOLE4X - camX * 0.3;
  g.save();
  g.globalCompositeOperation = "screen";
  g.translate(hx4 + 40, 440);
  g.rotate(0.35);
  g.scale(1, 0.32);
  const sp = g.createRadialGradient(0, 0, 0, 0, 0, 130);
  sp.addColorStop(0, "rgba(255,206,130,0.4)");
  sp.addColorStop(1, "rgba(255,206,130,0)");
  g.fillStyle = sp;
  g.beginPath(); g.arc(0, 0, 130, 0, K.TAU); g.fill();
  g.restore();
  const SUNL = { x: SUN4.x, y: SUN4.y, color: "#fff2d0", strength: 1.6 };
  swayStrip(g, meadowStrip("lb-back2", 1200, 84, { pow: 1.7, count: 3000, heads: 14, env: 0.5, root: 20, body: "#3e6626", head: "#7a7a44", lit: "rgba(230,240,160,0.36)", headLit: "rgba(255,236,180,0.14)" }), -120 - camX * 0.7, 394, 1200, 84, t, 0.05, 10);
  flowers(g, t, FL4_MID.filter((f) => f.y < 452).map((f) => ({ ...f, x: f.x - camX * 0.7 })), { stem: "#45742c" });
  // the kitten: out of the hole he trots a few steps, stops, turns to look back through the gap at
  // you (32-34 s), then turns and trots off into the flowers
  for (const k of kit4(t)) {
    const cx = k.x - camX * 0.8;
    K.drawCat(g, cx, 470, 66, {
      pose: k.pose, phase: t * 1.7, facing: k.facing, t,
      headTurn: k.headTurn, gaze: k.gaze, headTilt: k.facing < 0 ? 0.08 : 0,
      blink: K.env(t, 32.9, 33.25, 0.08, 0.12), collar: true, bell: true,
      key: { x: cx + 260, y: 200, color: "#fff6e6", strength: 0.9 }, rim: { ...SUNL, strength: 1.6, color: "#ffd890" }, backlit: 0.85,
      fill: "#7a6a58", ambient: "#b4a080", ambientK: 0.12, castShadow: 0.65 * k.a, ground: "#1a2a10", shadow: true,
      tailUp: 0.8, tail: 0.5 + 0.2 * Math.sin(t * 2), alpha: k.a,
    });
  }
  swayStrip(g, meadowStrip("lb-front", 1200, 36, { pow: 1.5, count: 1800, heads: 8, fadeTop: 12, body: "#355a22", head: "#6a6a3a", lit: "rgba(230,240,150,0.3)", headLit: "rgba(255,236,180,0.16)" }), -120 - camX * 0.85, 446, 1200, 36, t, 0.05, 8);
  flowers(g, t, FL4_MID.filter((f) => f.y >= 452).map((f) => ({ ...f, x: f.x - camX * 0.8 })), { stem: "#3e6a28" });
  swayStrip(g, meadowStrip("lb-near", 1300, 90, { pow: 1.4, blur: 1.5, count: 1900, heads: 20, env: 0.5, body: "#2e5420", head: "#5a5a30", lit: "rgba(220,240,150,0.3)", headLit: "rgba(255,236,180,0.16)" }), -170 - camX * 1.0, 456, 1300, 90, t, 0.06, 10);
  const L = K.layer(W, H, "f02-lb-fg");
  flowers(L.g, t, FL4_FG.map((f) => ({ ...f, x: f.x - camX * 1.4 })), { stem: "#2e5420" });
  K.dof(g, L.canvas, 7);
  K.godRays(g, SUN4.x, SUN4.y, W, H, { color: "#fff0c8", count: 9, strength: 0.14, t, angle: Math.PI * 0.8, spread: 1.4, length: 900, seed: 9 });
  K.sunGlow(g, SUN4.x - camX * 0.1, SUN4.y, 14, "#fff2d0", 0.9);
  // the memory lets go: a warm highlight wash rises before the dissolve back to the present
  const wash = K.smooth(K.seg(t, 36.1, 37.25));
  if (wash > 0) K.fadeColor(g, W, H, wash * 0.92, "#fff1dc");
}

// ---- shot 5: present - your hand takes the fur from the nail -----------------------------------------------------
function bokehMeadow5() {
  return beyondPlate("macro", 14, { hz: 330, sunX: 900, top: "#8a7aa0", mid: "#e8a890", bottom: "#ffcc8a" });
}
// The post at macro scale, the most detailed surface in the film. A height field is lit by the low
// sun from the right: brush-stroke ridges in the enamel running the length of the board, the wood's
// grain raised through the paint where it is thin, crazing, flakes broken back to bare grey-brown wood
// (a dark crack at every edge, a pale chipped lip), a glossy band rolling off to matte, dust and
// pollen settled on the surface. Baked once (256 x 1024 texels).
function macroTex() {
  const TW = 200, TH = 800;
  return K.texBake("f02-macrotex2", TW, TH, (u, v, out) => {
    const s = 71;
    const warp = K.texNoise(u * 2.2, v * 0.6, s + 11) * 0.05;
    const uu = u + warp;
    const ring = K.texFbm(uu * 9, v * 0.4, s + 1, 3);
    const late = Math.pow(Math.abs(Math.sin((uu * 7 + ring * 0.8) * Math.PI)), 12);
    const fib = K.texNoise(uu * 120, v * 4, s + 3) * 0.6 + K.texNoise(uu * 260, v * 8, s + 2) * 0.4;
    const flake = K.texFbm(u * 3, v * 7, s + 4, 4) * 0.8 + K.texFbm(u * 12, v * 24, s + 5, 3) * 0.2 + late * 0.05;
    const edge = Math.min(u, 1 - u);
    const cov = 0.24 - flake - Math.max(0, 0.05 - edge) * 3;
    // paint height: brush ridges + raised grain under thin paint
    const hgt = (U, V) => {
      const br = K.texNoise(U * 34, V * 1.1, s + 13) * 0.6 + K.texNoise(U * 80, V * 2.2, s + 14) * 0.4;
      const lt = Math.pow(Math.abs(Math.sin(((U + warp) * 7 + ring * 0.8) * Math.PI)), 12);
      return br * 0.6 + lt * 0.9;
    };
    let r, gg, b;
    if (cov > 0) {
      const thin = K.clamp(1 - cov * 5);
      const du = 1 / TW, dv = 1 / TH;
      const h0 = hgt(u, v);
      const sx = (hgt(u + du, v) - h0) * 2 * (0.5 + thin * 0.6);
      const sy = (hgt(u, v + dv) - h0) * 2 * 0.4;
      const shade = 1 + sx * 0.45 - sy * 0.25;
      const blot = K.texFbm(u * 3, v * 0.9, s + 6, 3);
      r = (226 + blot * 10 + fib * 5) * shade; gg = (220 + blot * 9 + fib * 5) * shade; b = (204 + blot * 8 + fib * 4) * shade;
      const cz = K.texRidged(u * 12, v * 4.5, s + 16, 3);
      if (cz > 0.84) { const k = (cz - 0.84) / 0.16; r -= 40 * k; gg -= 42 * k; b -= 44 * k; }
      const grime = Math.max(0, K.texFbm(u * 5, v * 2, s + 15, 3)) * 0.1;
      r *= 1 - grime; gg *= 1 - grime; b *= 1 - grime * 1.15;
      if (cov < 0.025) { const k = 1 - cov / 0.025; r += 22 * k; gg += 21 * k; b += 18 * k; }
      // glossy band toward the lit edge (only on intact paint)
      const sp = Math.exp(-Math.pow((u - 0.8) / 0.06, 2)) * (0.6 + 0.4 * K.texNoise(u * 4, v * 1.5, s + 12)) * K.clamp(0.6 + sx * 2);
      r += 40 * sp; gg += 36 * sp; b += 30 * sp;
    } else {
      r = 132 + ring * 30 + fib * 12 - late * 40; gg = 116 + ring * 26 + fib * 10 - late * 36; b = 98 + ring * 20 + fib * 8 - late * 30;
      if (cov > -0.01) { const d = 0.45 + 0.4 * Math.abs(cov + 0.005) / 0.005; r *= d; gg *= d; b *= d; }
      else if (cov > -0.035) { const k = 1 + (cov + 0.01) / 0.025; r *= 1 - 0.2 * k; gg *= 1 - 0.2 * k; b *= 1 - 0.18 * k; }
    }
    // dust and pollen (one texel each, a little clustered)
    const ix = Math.floor(u * TW * 0.5), iy = Math.floor(v * TH * 0.5);
    const hh = K.hash(ix * 1031 + iy, 9);
    const cl = K.texNoise(u * 6, v * 6, s + 30) > 0.1 ? 1 : 0.5;
    if (hh > 1 - 0.004 * cl) { r = 236; gg = 196; b = 74; }
    else if (hh > 1 - 0.011 * cl) { r = r * 0.7 + 40; gg = gg * 0.7 + 36; b = b * 0.7 + 30; }
    out[0] = r; out[1] = gg; out[2] = b; out[3] = 255;
  });
}
// the post, very close: its top and foot fall out of the focal plane (it leans slightly toward the
// lens), so a sharp centre band is composited over a blurred copy through a vertical mask.
function macroPost(N) {
  const pw = 160, ph = 900;
  const nx = N[0] - 300, ny = 412, nr = 7.5;
  return K.sprite("f02-macropost2", pw, ph, (s) => {
    const sharp = K.sprite("f02-macropost2-sharp", pw, ph, (q) => {
      const tex = macroTex();
      q.imageSmoothingEnabled = true;
      q.drawImage(tex, 0, 0, pw, ph);
      // the board's crown: sun side a step brighter, the far edge rolls into shade
      const cg = q.createLinearGradient(0, 0, pw, 0);
      cg.addColorStop(0, "rgba(26,18,26,0.42)");
      cg.addColorStop(0.14, "rgba(26,18,26,0.12)");
      cg.addColorStop(0.5, "rgba(26,18,26,0)");
      cg.addColorStop(1, "rgba(26,18,26,0)");
      q.fillStyle = cg; q.fillRect(0, 0, pw, ph);
      q.globalCompositeOperation = "soft-light";
      const lg = q.createLinearGradient(0, 0, pw, 0);
      lg.addColorStop(0.45, "rgba(255,232,200,0)");
      lg.addColorStop(0.9, "rgba(255,232,200,0.4)");
      lg.addColorStop(1, "rgba(255,232,200,0.15)");
      q.fillStyle = lg; q.fillRect(0, 0, pw, ph);
      q.globalCompositeOperation = "multiply";
      q.fillStyle = "#f2e6d4"; q.fillRect(0, 0, pw, ph);
      q.globalCompositeOperation = "source-over";
      // the rust bleed from the nail: a long orange-brown run down the grain, broken up and narrowing
      const R = K.rng("rustrun");
      for (let k = 0; k < 9; k++) {
        const len = nr * (22 + R() * 30), w0 = nr * (0.7 + R() * 0.9), dx = (R() - 0.5) * nr * 1.4;
        const rg = q.createLinearGradient(0, ny, 0, ny + len);
        rg.addColorStop(0, `rgba(122,52,16,${0.2 + R() * 0.1})`);
        rg.addColorStop(0.3, `rgba(156,80,30,${0.12 + R() * 0.08})`);
        rg.addColorStop(1, "rgba(150,80,30,0)");
        q.fillStyle = rg;
        q.beginPath();
        q.moveTo(nx + dx - w0, ny);
        q.bezierCurveTo(nx + dx - w0 * 0.8, ny + len * 0.3, nx + dx - w0 * 0.2 + (R() - 0.5) * 4, ny + len * 0.7, nx + dx + (R() - 0.5) * 3, ny + len);
        q.bezierCurveTo(nx + dx + w0 * 0.3, ny + len * 0.7, nx + dx + w0 * 0.7, ny + len * 0.3, nx + dx + w0, ny);
        q.fill();
      }
      // pooled rust specks along the run
      for (let k = 0; k < 90; k++) {
        const yy = ny + Math.pow(R(), 1.4) * nr * 46, xx = nx + (R() - 0.5) * nr * 2.4 * (1 - (yy - ny) / (nr * 60));
        q.fillStyle = `rgba(${110 + R() * 50},${44 + R() * 20},14,${0.25 + R() * 0.3})`;
        q.beginPath(); q.ellipse(xx, yy, 0.6 + R() * 1.2, 0.8 + R() * 2.4, 0, 0, K.TAU); q.fill();
      }
      const dg = q.createRadialGradient(nx, ny, nr * 0.8, nx, ny, nr * 2.4);
      dg.addColorStop(0, "rgba(40,30,20,0.4)");
      dg.addColorStop(1, "rgba(40,30,20,0)");
      q.fillStyle = dg;
      q.fillRect(nx - nr * 3, ny - nr * 3, nr * 6, nr * 6);
      nailHead(q, nx, ny, nr, 0.75);
    });
    const soft = blurSprite("f02-macropost2-soft", pw, ph, 5, (q) => q.drawImage(sharp, 0, 0, pw, ph));
    s.drawImage(soft, 0, 0, pw, ph);
    const tmp = K.makeCanvas(pw * PX(), ph * PX());
    const tg = tmp.getContext("2d");
    tg.drawImage(sharp, 0, 0, tmp.width, tmp.height);
    tg.globalCompositeOperation = "destination-in";
    const m = tg.createLinearGradient(0, 0, 0, tmp.height);
    m.addColorStop(0, "rgba(0,0,0,0)");
    m.addColorStop(0.34, "rgba(0,0,0,1)");
    m.addColorStop(0.66, "rgba(0,0,0,1)");
    m.addColorStop(1, "rgba(0,0,0,0)");
    tg.fillStyle = m;
    tg.fillRect(0, 0, tmp.width, tmp.height);
    s.drawImage(tmp, 0, 0, pw, ph);
  });
}
function shotTuft(g, t, p) {
  const e = K.ease.inOut(p);
  const reach = K.ease.inOut(K.seg(t, 38.6, 41.4));
  const pinched = t > 41.6;
  const pull = K.ease.inOut(K.seg(t, 42.6, 46.5));
  const z = 1.0 + 0.06 * e;
  const N = [418, 292];
  g.save();
  g.translate(N[0], N[1]);
  g.scale(z, z);
  g.translate(-N[0] - e * 10, -N[1]);
  g.drawImage(bokehMeadow5(), -260 - p * 40, -10, W + 420, H + 20);
  // the sun's veil: a soft wash from the right
  K.glow(g, 1000, 150, 520, "#ffcf90", 0.16);
  K.bokehLights(g, W, H, t, { seed: 31, count: 6, area: [560, 180, 380, 220], size: 18, alpha: 0.1, colors: ["#ffd8a0", "#ffe8c8"] });
  const px = 300, pw = 160;
  K.shadowBlob(g, px + pw + 8, 330, 10, 600, { alpha: 0.25 });
  g.drawImage(macroPost(N), px, -120, pw, 900);
  const hx = K.lerp(880, N[0] + 128, reach) + pull * 230, hy = K.lerp(720, N[1] + 118, reach) + pull * 120;
  const handOn = t > 38.6;
  let HL = null;
  const ang = -2.35 + pull * 0.2;
  if (handOn) {
    const L = { x: 1000, y: 180, color: SUN_DIM, strength: 1.4, z: -0.1 };
    const ho = { pose: pinched ? "hold" : reach > 0.8 ? "point" : "reach", angle: ang, t, light: L, ambient: "#6a5a70", sleeve: "#9a7a3a" };
    HL = K.layer(W, H, "f02-hand5");
    K.drawHand(HL.g, hx, hy, 230, ho);
    sleeveFabric(HL.g, hx, hy, 230, { angle: ang, sleeve: "#9a7a3a", lightSide: 1 });
    // skin: a soft red-orange subsurface edge only where the hand faces the sun, palm side darker
    skinPass(HL, [hx - 320, hy - 320, hx + 80, hy + 120], [0.82, -0.57], { width: 3, alpha: 0.6, shade: 0.34 });
  }
  // soft shadows on the wood (the light is low on the right, so they fall to the left): the tuft's
  // close and crisp-ish, the hand's farther off the surface and softer. Only the post can take them.
  const SL = K.layer(W, H, "f02-hand5s");
  const ps = PX();
  if (!pinched) furTuft(SL.g, N[0] - 9, N[1] + 4, t, 3.3, { wind: 1.2, lx: 0.75, glow: false, strays: false });
  if (HL) SL.g.drawImage(HL.canvas, (px + 26) * ps, 0, pw * ps, HL.canvas.height, px, 8, pw, H);
  SL.g.globalCompositeOperation = "source-in";
  SL.g.fillStyle = "rgba(40,26,30,1)";
  SL.g.fillRect(0, 0, W, H);
  g.save();
  g.beginPath(); g.rect(px, -120, pw, 900); g.clip();
  K.dof(g, SL.canvas, 4, 0.32 + 0.12 * reach);
  g.restore();
  if (!pinched) furTuft(g, N[0], N[1], t, 3.3, { wind: 1.2, lx: 0.75, strays: 4 });
  if (HL) {
    g.drawImage(HL.canvas, 0, 0, W, H);
    if (pinched) {
      const tx = hx - 136 + pull * 10, ty = hy - 136;
      furTuft(g, tx, ty, t, 3.1, { wind: 1.6, lx: 1, strays: false });
      looseHairs(g, tx + 20, ty + 18, t, 43.4, 3.0, { count: 10 });
    }
  }
  g.restore();
  // ghosts on the sun's axis (sun low at the right edge): one soft, one fainter, nothing hexagonal
  K.glow(g, 300, 330, 34, "#ffd0a0", 0.08);
  K.glow(g, 120, 400, 60, "#c8d8ff", 0.04);
  petals(g, t, { seed: 9, count: 10, wind: 1.4, size: 3.2, alpha: 0.7 });
}

// ---- shot 6: over your shoulder, through the gap: a town's lights ----------------------------------------------
const SUN6X = 870;          // the sun sets at screen-right
const GAP6X = 498;          // the gap in the fence (the board snapped off), framing the far town
// the meadow beyond: sky, cirrus, the far hills and the meadow running kilometres out, with aerial
// perspective (the farther, the closer to the sky's colour at the horizon); k = 0 golden, 1 dusk
function duskBeyond(k) {
  return K.sprite("f02-dusk6b:" + k, W + 120, 470, (s, w) => {
    const hz = 300, sx = SUN6X + 60;
    const skyLow = k ? "#ff9a5a" : "#ffc880";
    K.sky(s, w, hz + 6, k ? { top: "#2a2448", mid: "#7a4a6a", bottom: skyLow, horizon: 1, sun: { x: sx, y: hz + 4, color: "#ff8a4a" }, haze: 0.9 }
      : { top: "#5a6aa8", mid: "#d898a0", bottom: skyLow, horizon: 1, sun: { x: sx, y: hz - 38, color: "#ffc880" }, haze: 0.9 });
    s.drawImage(cirrusSprite("d6b-" + k, w, hz - 20, { seed: 61, lit: k ? "#ff9a6a" : "#ffd0a0", shade: k ? "#3a2a4a" : "#9a7a98", hot: k ? "#ffc890" : "#fff0d0", sunX: sx / w, cover: 0.45, alpha: 0.85 }), 0, 0, w, hz - 20);
    K.hills(s, w, 470, { y: hz + 2, amp: 12, color: k ? "#4a3a58" : "#7a6a88", seed: 43, haze: skyLow, hazeAmt: 0.72, cache: false });
    K.hills(s, w, 470, { y: hz + 4, amp: 18, color: k ? "#3a3048" : "#6a5a78", seed: 41, haze: k ? "#9a6070" : "#e8a890", hazeAmt: 0.5, cache: false });
    K.groundPlane(s, w, 470, { tex: "turf", texOpts: { seed: 9, dry: 0.4, color: "#56602a" }, horizon: hz + 6, scale: 320, fog: k ? "#6a4a58" : "#c89a70", fogAmt: 0.85, tint: k ? "#6a5a8a" : "#ffb070", tintAlpha: 0.4, cache: false });
    // aerial perspective over the meadow: the first few hundred metres keep their colour, the rest
    // melts into the low sky
    const ap = s.createLinearGradient(0, hz + 4, 0, hz + 70);
    ap.addColorStop(0, K.rgba(skyLow, 0.75));
    ap.addColorStop(0.35, K.rgba(skyLow, 0.3));
    ap.addColorStop(1, K.rgba(skyLow, 0));
    s.fillStyle = ap;
    s.fillRect(0, hz + 4, w, 66);
    // the long low sun skims the meadow: a warm sheen toward it
    s.save();
    s.globalCompositeOperation = "screen";
    s.translate(sx, hz + 8);
    s.scale(1, 0.12);
    const sg = s.createRadialGradient(0, 0, 0, 0, 0, 520);
    sg.addColorStop(0, k ? "rgba(255,140,80,0.4)" : "rgba(255,200,130,0.45)");
    sg.addColorStop(1, "rgba(255,180,110,0)");
    s.fillStyle = sg;
    s.beginPath(); s.arc(0, 0, 520, 0, K.TAU); s.fill();
    s.restore();
    const mg = s.createLinearGradient(0, hz + 6, 0, 470);
    mg.addColorStop(0, k ? "rgba(40,26,48,0)" : "rgba(60,40,40,0)");
    mg.addColorStop(0.3, k ? "rgba(30,20,40,0.4)" : "rgba(60,40,44,0.26)");
    mg.addColorStop(1, k ? "rgba(14,10,22,0.82)" : "rgba(40,30,36,0.6)");
    s.fillStyle = mg;
    s.fillRect(0, hz + 6, w, 470 - hz - 6);
  });
}
// the fence row of shot 6, one cached sprite per light (0 golden, 1 dusk): rails, pickets (a little
// uneven), and the gap: one board snapped off near the ground, its neighbour leaning. No tuft (it is
// in your pocket).
function fence6(k) {
  return K.sprite("f02-fence6b:" + k, W + 120, 230, (s) => {
    const tone = k ? "#3e3848" : "#86787a";
    const RX = (i) => i * 92 + 70;
    for (const [r0, r1] of [[0.18, 0.24], [0.62, 0.68]]) {
      const ry = 200 - r1 * 220, hh = (r1 - r0) * 220;
      K.texRect(s, "wood", 0, ry, W + 120, hh, { scale: 160, tex: { seed: 4, color: "#a49a88", planks: 1 } });
      const rg = s.createLinearGradient(0, ry, 0, ry + hh);
      rg.addColorStop(0, k ? "rgba(255,150,100,0.18)" : "rgba(255,200,150,0.28)");
      rg.addColorStop(0.3, K.rgba(k ? "#2a2234" : "#50404a", 0.5));
      rg.addColorStop(1, K.rgba(k ? "#120e1c" : "#30242c", 0.75));
      s.fillStyle = rg; s.fillRect(0, ry, W + 120, hh);
      for (let i = -1; i < 12; i++) {
        if (i === 5) continue;
        const ag = s.createLinearGradient(RX(i) - 14, 0, RX(i) + 70, 0);
        ag.addColorStop(0, "rgba(10,8,14,0)"); ag.addColorStop(0.17, "rgba(10,8,14,0.5)"); ag.addColorStop(0.83, "rgba(10,8,14,0.5)"); ag.addColorStop(1, "rgba(10,8,14,0)");
        s.fillStyle = ag; s.fillRect(RX(i) - 14, ry, 84, hh);
      }
    }
    const R = K.rng("f6jit");
    for (let i = -1; i < 12; i++) {
      const x = RX(i);
      const hgt = Math.round(196 * (1 + (R() - 0.5) * 0.05)), lean = (R() - 0.5) * 0.04 + (i === 6 ? 0.06 : 0);
      const spr = picketSprite(56, hgt, (i + 9) % 7, { lx: 0.5, res: 1, tone, rim: k ? "#ff8a5a" : "#ffb070", paint: 0.07 });
      s.save();
      s.translate(x + 28, 200);
      s.rotate(lean);
      if (i === 5) {
        // snapped off: only a splintered stub stands
        const p = new Path2D();
        p.moveTo(-28, 0); p.lineTo(-28, -40);
        const R2 = K.rng("stub6");
        for (let xx = -28; xx < 28; xx += 4 + R2() * 4) p.lineTo(xx, -40 - R2() * 16 + (R2() > 0.8 ? -18 : 0));
        p.lineTo(28, -38); p.lineTo(28, 0); p.closePath();
        s.clip(p);
      }
      s.drawImage(spr, -28, -hgt + 4, 56, hgt);
      s.restore();
      if (i === 5) {
        // the broken top: raw pale wood fibre
        s.fillStyle = k ? "rgba(110,96,100,0.35)" : "rgba(170,150,128,0.4)";
        s.fillRect(x + 4, 200 - 44, 48, 2);
      }
      K.shadowBlob(s, x + 28, 200, 30, 3, { alpha: 0.4 });
    }
  });
}
// you, from behind and very close: the back of your head (hair), the hood fallen round your neck,
// and your shoulder, well out of focus. Filled with the light that is really there (warm sky from
// above, olive bounce from the grass below); the sun at screen-right rims the hair and the hood
// with backlit strands, strongest on the sun side, nothing at the bottom.
const OTS_HEAD = [188, 182, 84, 100];
function otsShape() {
  const [hx, hy, rx, ry] = OTS_HEAD;
  const body = new Path2D();
  body.moveTo(-20, 480);
  body.lineTo(-20, 330);
  body.bezierCurveTo(10, 300, 50, 280, 92, 262);           // left shoulder up to the collar
  body.bezierCurveTo(150, 250, 250, 252, 318, 268);        // the hood roll behind the neck
  body.bezierCurveTo(380, 280, 430, 300, 470, 334);        // right shoulder seam
  body.bezierCurveTo(510, 368, 548, 420, 566, 480);        // shoulder falling away
  body.closePath();
  const hood = new Path2D();
  hood.moveTo(70, 300);
  hood.bezierCurveTo(80, 246, 150, 226, 200, 232);
  hood.bezierCurveTo(260, 226, 330, 240, 348, 290);
  hood.bezierCurveTo(300, 320, 120, 324, 70, 300);
  hood.closePath();
  const head = new Path2D();
  head.ellipse(hx, hy, rx, ry, -0.08, 0, K.TAU);
  return { body, hood, head };
}
function otsSprite(k) {
  return blurSprite("f02-ots2:" + k, 560, 460, 3.5, (s) => {
    const { body, hood, head } = otsShape();
    const fillLit = (path, top, bot, y0, y1) => {
      const gr = s.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, top);
      gr.addColorStop(1, bot);
      s.fillStyle = gr;
      s.fill(path);
    };
    // jacket: warm brown where the sky reaches it, dark olive in the grass bounce underneath
    fillLit(body, k ? "#3a2a2c" : "#5a4232", k ? "#14140e" : "#2a2c1a", 260, 470);
    K.texFill(s, "fabric", body, { scale: 50, alpha: 0.28, mode: "soft-light", tex: { seed: 3 } });
    // the shoulder seam and a fold, catching a little of the sky
    s.strokeStyle = k ? "rgba(120,90,110,0.18)" : "rgba(200,160,120,0.2)"; s.lineWidth = 3;
    s.beginPath(); s.moveTo(318, 300); s.bezierCurveTo(380, 312, 440, 350, 488, 410); s.stroke();
    s.strokeStyle = "rgba(0,0,0,0.25)"; s.lineWidth = 6;
    s.beginPath(); s.moveTo(120, 360); s.bezierCurveTo(170, 330, 230, 324, 290, 336); s.stroke();
    // the hood, fallen and rolled round the neck: a thick fabric tube with folds and its own shadow
    fillLit(hood, k ? "#3e2e34" : "#6a4e3a", k ? "#1a1418" : "#2e2418", 226, 320);
    s.save();
    s.clip(hood);
    for (const [x0, a] of [[110, 0.3], [170, 0.25], [236, 0.28], [300, 0.22]]) {
      const fg = s.createLinearGradient(x0 - 14, 0, x0 + 14, 0);
      fg.addColorStop(0, "rgba(0,0,0,0)"); fg.addColorStop(0.5, `rgba(10,6,4,${a})`); fg.addColorStop(1, "rgba(0,0,0,0)");
      s.fillStyle = fg; s.fillRect(x0 - 14, 220, 28, 110);
    }
    s.restore();
    // the head: hair, darker at the nape, lit from the sky on the crown
    const [hx0, hy0, rx0, ry0] = OTS_HEAD;
    const hs = s.createRadialGradient(hx0, hy0 + ry0 * 0.9, 0, hx0, hy0 + ry0 * 0.9, rx0 * 1.3);
    hs.addColorStop(0, "rgba(0,0,0,0.45)");
    hs.addColorStop(1, "rgba(0,0,0,0)");
    s.save(); s.clip(hood); s.fillStyle = hs; s.fillRect(hx0 - rx0 * 1.4, hy0, rx0 * 2.8, ry0 * 2); s.restore();
    fillLit(head, k ? "#2e2024" : "#4a3222", k ? "#120c0e" : "#1e140c", hy0 - ry0, hy0 + ry0);
    s.save();
    s.clip(head);
    const [hx, hy, rx, ry] = OTS_HEAD;
    const R = K.rng("hair6");
    const crown = [hx + 20, hy - ry * 0.55];
    s.lineCap = "round";
    for (const [col, lw, n] of [[k ? "rgba(10,6,8,0.3)" : "rgba(20,12,6,0.32)", 2.0, 260], [k ? "rgba(90,64,70,0.22)" : "rgba(150,108,70,0.26)", 1.1, 320]]) {
      s.strokeStyle = col; s.lineWidth = lw;
      s.beginPath();
      for (let i = 0; i < n; i++) {
        const x0 = hx + (R() * 2 - 1) * rx, y0 = hy + (R() * 2 - 1) * ry;
        if (((x0 - hx) / rx) ** 2 + ((y0 - hy) / ry) ** 2 > 1) continue;
        const dir = Math.atan2(y0 - crown[1], x0 - crown[0]) + (R() - 0.5) * 0.4;
        const len = 18 + R() * 46, bend = (R() - 0.5) * 12;
        s.moveTo(x0, y0);
        s.quadraticCurveTo(x0 + Math.cos(dir) * len * 0.5 - Math.sin(dir) * bend, y0 + Math.sin(dir) * len * 0.5 + Math.cos(dir) * bend, x0 + Math.cos(dir) * len, y0 + Math.sin(dir) * len);
      }
      s.stroke();
    }
    s.restore();
  });
}
// the backlit edge: many short hair strands combed out of the top 40% of the silhouette (head and
// hood), alpha strongest toward the sun on the right, fading to nothing toward the lower edge; a thin
// translucent glow at their roots. k = 1 for the dusk light.
function otsRim(k = 0) {
  return blurSprite("f02-otsrim3:" + k, 560, 460, 1.0, (s) => {
    const [hx, hy, rx, ry] = OTS_HEAD;
    const R = K.rng("otsrim");
    const sunA = -0.35; // direction to the sun from the head (right, a little up)
    const P = [new Path2D(), new Path2D(), new Path2D()];
    const strand = (x, y, nx, ny, w) => {
      const len = 3 + R() * 10;
      const a = Math.atan2(ny, nx) + (R() - 0.5) * 0.9;
      const p = P[w > 0.66 ? 2 : w > 0.33 ? 1 : 0];
      p.moveTo(x - nx * 1.5, y - ny * 1.5);
      p.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5, x + Math.cos(a + (R() - 0.5) * 0.5) * len, y + Math.sin(a) * len + len * 0.15);
    };
    // the head: the top 40% of the outline
    for (let i = 0; i < 1900; i++) {
      const th = Math.PI + R() * Math.PI;           // upper half of the ellipse
      if (K.hash(Math.floor(th * 34), 7) < 0.35) continue; // hair parts in locks: gaps, not a ring
      const x = hx + Math.cos(th) * rx, y = hy + Math.sin(th) * ry;
      const lower = K.clamp((y - (hy - ry)) / (ry * 1.1));  // 0 at the crown, 1 at 40% down
      const sun = Math.max(0, Math.cos(th - sunA));
      const w = (0.12 + 0.88 * Math.pow(sun, 1.5)) * (1 - lower);
      if (R() > w) continue;
      const nx = Math.cos(th) / rx, ny = Math.sin(th) / ry, nl = Math.hypot(nx, ny);
      strand(x, y, nx / nl, ny / nl, w);
    }
    // the hood's top edge and the right shoulder: short fabric fuzz, weaker
    for (let i = 0; i < 260; i++) {
      const u = R() * 0.6;
      const x = 270 + u * 220, y = 264 + u * u * 120;
      const w = (0.45 - u * 0.6) * (0.5 + 0.5 * R());
      if (R() > w) continue;
      strand(x, y - 2, 0.35, -0.94, w * 0.6);
    }
    const C = k ? ["rgba(255,130,80,0.22)", "rgba(255,150,96,0.45)", "rgba(255,176,120,0.7)"] : ["rgba(255,196,130,0.16)", "rgba(255,206,146,0.32)", "rgba(255,226,176,0.55)"];
    s.lineCap = "round";
    for (let i = 0; i < 3; i++) { s.strokeStyle = C[i]; s.lineWidth = 0.7 + i * 0.2; s.stroke(P[i]); }
    // the light wrapping round the sun-side edge of the head (scattered through the outer hair)
    s.save();
    s.globalCompositeOperation = "lighter";
    const wg = s.createLinearGradient(hx, hy - ry, hx + rx, hy + ry * 0.3);
    wg.addColorStop(0, "rgba(255,200,130,0)");
    wg.addColorStop(0.35, k ? "rgba(255,130,80,0.3)" : "rgba(255,200,130,0.36)");
    wg.addColorStop(1, "rgba(255,180,110,0)");
    s.strokeStyle = wg;
    s.lineWidth = 5;
    if (K.hasFilter()) s.filter = "blur(3px)";
    s.beginPath(); s.ellipse(hx, hy, rx - 1, ry - 1, -0.08, -1.9, 0.5); s.stroke();
    s.filter = "none";
    s.restore();
    // translucent glow at the roots on the sun side
    s.save();
    s.beginPath(); s.ellipse(hx, hy, rx, ry, -0.08, 0, K.TAU);
    s.clip();
    const gg = s.createRadialGradient(hx + rx * 0.95, hy - ry * 0.45, 0, hx + rx * 0.95, hy - ry * 0.45, rx * 0.7);
    gg.addColorStop(0, k ? "rgba(255,120,70,0.35)" : "rgba(255,180,110,0.42)");
    gg.addColorStop(1, "rgba(255,170,100,0)");
    s.fillStyle = gg;
    s.fillRect(hx - rx, hy - ry, rx * 2, ry * 2);
    s.restore();
  });
}
// the far town: a cluster of warm point lights on the horizon in the gap, each with a soft defocused
// disc, an arch's glow standing over them, haze drifting in front (#e6b478)
function townGlow(g, x, y, k, t, o = {}) {
  const n = o.n || 24;
  K.glow(g, x, y - 8, 150, "#e6b478", 0.08 * k);
  K.glow(g, x, y - 5, 40, "#e6b478", 0.14 * k);
  // the arch: a thin bright curve over the town, its light spilling up into the haze
  g.save();
  g.globalCompositeOperation = "lighter";
  const ah = o.arch || 16;
  g.strokeStyle = `rgba(255,214,150,${0.35 * k})`;
  g.lineWidth = 1.6;
  if (K.hasFilter()) g.filter = "blur(1.5px)";
  g.beginPath(); g.ellipse(x + 4, y - 2, ah * 0.55, ah, 0, Math.PI, K.TAU); g.stroke();
  g.filter = "none";
  g.strokeStyle = `rgba(255,236,190,${0.5 * k})`;
  g.lineWidth = 0.7;
  g.beginPath(); g.ellipse(x + 4, y - 2, ah * 0.55, ah, 0, Math.PI, K.TAU); g.stroke();
  const ag = g.createRadialGradient(x + 4, y - ah * 0.5, 0, x + 4, y - ah * 0.5, ah * 2.4);
  ag.addColorStop(0, `rgba(230,180,120,${0.25 * k})`);
  ag.addColorStop(1, "rgba(230,180,120,0)");
  g.fillStyle = ag;
  g.fillRect(x + 4 - ah * 2.4, y - ah * 3, ah * 4.8, ah * 4.8);
  // point lights and their bokeh
  const disc = tintedDisc([255, 196, 128]);
  const pt = softDisc();
  const spread = o.spread || 70;
  for (let i = 0; i < n; i++) {
    const lx = x + (K.hash(i, 3) - 0.5) * spread * (0.5 + K.hash(i, 6) * 0.5), ly = y - Math.pow(K.hash(i, 4), 2) * 6;
    const tw = 0.75 + 0.25 * Math.sin(t * (1.1 + K.hash(i, 7)) + i);
    const r = 1 + K.hash(i, 5) * 1.0;
    g.globalAlpha = Math.min(1, k) * tw;
    g.drawImage(pt, lx - r, ly - r, r * 2, r * 2);
    const br = 3 + K.hash(i, 8) * 4;
    g.globalAlpha = 0.14 * Math.min(1, k) * tw;
    g.drawImage(disc, lx - br, ly - br, br * 2, br * 2);
  }
  g.globalAlpha = 1;
  // haze drifting across in front
  for (let i = 0; i < 4; i++) {
    const yy = y - 2 + i * 4.5, w = 200 - i * 26;
    g.save();
    g.translate(x + Math.sin(t * 0.21 + i * 1.7) * 14, yy);
    g.scale(1, 0.1);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, w);
    gr.addColorStop(0, `rgba(230,180,120,${(0.16 - i * 0.03) * k})`);
    gr.addColorStop(1, "rgba(230,180,120,0)");
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, w, 0, K.TAU); g.fill();
    g.restore();
  }
  g.restore();
}
function shotThrough(g, t, p) {
  const dusk = K.smooth(K.seg(t, 48, 56));
  const e = K.ease.inOut(p);
  const z = 1 + 0.12 * e;
  g.save();
  g.translate(500, 420);
  g.scale(z, z);
  g.translate(-500 - e * 10, -420 + e * 18);
  g.drawImage(duskBeyond(0), -60, 0, W + 120, 470);
  if (dusk > 0.01) { g.globalAlpha = dusk; g.drawImage(duskBeyond(1), -60, 0, W + 120, 470); g.globalAlpha = 1; }
  K.sunGlow(g, SUN6X, 262 + dusk * 40, 13, "#ffb070", 1 - dusk * 0.6);
  if (dusk > 0.45) K.stars(g, W, H, 3, 0.7, t, { yMax: 140 });
  townGlow(g, GAP6X, 301, 0.3 + dusk * 0.7, t, { n: 26, spread: 60, arch: 13 });
  // fireflies begin to rise as the sun goes (from 49 s)
  const ff = K.smooth(K.seg(t, 49, 53));
  if (ff > 0.01) fireflies2(g, t, { seed: 6, count: 12, area: [40, 300 - dusk * 70, 880, 150], alpha: ff * (0.45 + dusk * 0.55) });
  // the fence (two cached lights, cross-faded)
  g.drawImage(fence6(0), -60, 270, W + 120, 230);
  if (dusk > 0.01) { g.globalAlpha = dusk; g.drawImage(fence6(1), -60, 270, W + 120, 230); g.globalAlpha = 1; }
  K.texRect(g, "turf", -60, 470, W + 120, 110, { scale: 220, tex: { seed: 15, color: "#3e4a22" } });
  g.fillStyle = K.rgba(K.mix("#2a2a30", "#141224", dusk), 0.5); g.fillRect(-60, 470, W + 120, 110);
  K.aoEdge(g, -60, 474, W + 120, 474, { width: 16, alpha: 0.5, side: -1 });
  // the hollow under the gap, the town's warm light through it on the grass
  digHole(g, GAP6X, 473, 44, 0, { seed: 6, sun: 0.6 * (1 - dusk) });
  K.lightPool(g, GAP6X + 6, 480, 120, "#e6b478", { intensity: 0.2 + 0.3 * dusk, flat: 0.2 });
  swayStrip(g, meadowStrip("dusk6", 1200, 50, { count: 1500, heads: 20, env: 0.5, fadeTop: 16, body: "#262c16", head: "#2e2a1a", lit: "rgba(255,170,100,0.3)", headLit: "rgba(255,170,110,0.18)" }), -120, 438, 1200, 50, t, 0.05, 8);
  g.restore();
  // you, close in the foreground (head, fallen hood, shoulder), defocused; near the end you get up
  // and move off to the left, clearing the frame before the cut
  const leave = K.ease.in(K.seg(t, 55.4, 56.8));
  const ox = -80 - leave * 640, oy = 96 + Math.sin(t * 1.6) * 2.5 - leave * 40;
  if (leave < 1) {
    g.drawImage(otsSprite(0), ox, oy, 560, 460);
    if (dusk > 0.01) { g.globalAlpha = dusk; g.drawImage(otsSprite(1), ox, oy, 560, 460); g.globalAlpha = 1; }
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.9 - dusk * 0.35;
    g.drawImage(otsRim(dusk > 0.5 ? 1 : 0), ox, oy, 560, 460);
    g.restore();
  }
}

// ---- shot 7: dusk - you walk through the gate toward the far light ---------------------------------------------
const GATE7 = [596, 648], FY7 = 414, TOWN7 = [632, 388];
const LG7 = [TOWN7[0] + 40, 398]; // the light's ground point (plate coordinates), beyond the fence
function duskPlate7() {
  return K.sprite("f02-dusk7c", W + 80, H, (s, w) => {
    K.sky(s, w, 400, { top: "#141632", mid: "#4a2c5c", bottom: "#ff9a5a", horizon: 1, sun: { x: 840, y: 406, color: "#ff8a4a" }, haze: 0.9 });
    s.drawImage(cirrusSprite("d7", w, 360, { seed: 71, lit: "#ff8a6a", shade: "#2a1a3a", hot: "#ffc080", sunX: 0.82, cover: 0.42, alpha: 0.85 }), 0, 0, w, 360);
    K.hills(s, w, H, { y: 382, amp: 22, color: "#241a30", seed: 51, haze: "#7a4a5a", hazeAmt: 0.45, cache: false });
    // the meadow at dusk: blue-black grass in perspective, hazed toward the glowing horizon
    K.groundPlane(s, w, H, { tex: "turf", texOpts: { seed: 3, dry: 0.4, color: "#2e3456" }, horizon: 384, scale: 200, fog: "#6a4462", fogAmt: 0.9, tint: "#1e2244", tintAlpha: 0.55, cache: false, y0: 384 });
    const gg = s.createLinearGradient(0, 384, 0, H);
    gg.addColorStop(0, "rgba(90,50,80,0.2)");
    gg.addColorStop(0.25, "rgba(16,16,34,0.45)");
    gg.addColorStop(1, "rgba(4,4,12,0.66)");
    s.fillStyle = gg;
    s.fillRect(0, 384, w, H - 384);
    // grass rows receding: bigger and more separate toward us, their tips catching the sky
    for (const [y, hh, key, lit, n] of [[FY7 + 10, 16, "d7r0", "rgba(255,150,120,0.22)", 3200], [FY7 + 40, 30, "d7r1", "rgba(220,130,150,0.18)", 2400], [FY7 + 86, 52, "d7r2", "rgba(170,120,170,0.14)", 1800]]) {
      s.drawImage(meadowStrip(key, w, 80, { count: n, heads: 12, env: 0.5, root: 20, fadeTop: 14, body: "#0e1024", head: "#16142a", lit, headLit: lit }), 0, y - hh, w, hh + 6);
    }
    // grazing sky sheen: near the horizon the grass is seen edge-on and mirrors the sky's glow
    s.save();
    s.globalCompositeOperation = "screen";
    const sh = s.createLinearGradient(0, 384, 0, 470);
    sh.addColorStop(0, "rgba(255,140,100,0.32)");
    sh.addColorStop(0.4, "rgba(170,90,140,0.12)");
    sh.addColorStop(1, "rgba(80,60,120,0)");
    s.fillStyle = sh;
    s.fillRect(0, 384, w, 86);
    s.restore();
    // a worn path through the grass from us to the gate
    const pth = new Path2D();
    pth.moveTo(GATE7[0] + 40 + 4, FY7); pth.lineTo(GATE7[1] + 40 - 6, FY7);
    pth.quadraticCurveTo(GATE7[1] + 40 - 30, 470, 470, H + 10); pth.lineTo(250, H + 10);
    pth.quadraticCurveTo(GATE7[0] + 40 - 40, 470, GATE7[0] + 40 + 4, FY7); pth.closePath();
    s.fillStyle = "rgba(70,56,72,0.3)";
    s.fill(pth);
    const st = meadowStrip("dusk7", w, 60, { count: 1400, heads: 50, env: 0.5, body: "#0c0a14", head: "#100c14", lit: "rgba(255,140,90,0.14)", headLit: "rgba(255,130,90,0.12)" });
    s.drawImage(st, 0, FY7 - 40, w, 60);
  });
}
// picket x positions of the shot 7 fence (plate coordinates), with the gate gap left open
function pickets7() {
  const R = K.rng("f7b");
  const g0 = GATE7[0] + 40, g1 = GATE7[1] + 40;
  const out = [];
  for (let x = -40; x < W + 120; x += 21) {
    const j = R(), l = R(), b = R();
    if (x > g0 - 12 && x < g1) continue;
    out.push({ x, h: 42 * (1 + (j - 0.5) * 0.06), lean: (l - 0.5) * 0.052, broken: b > 0.93 ? 0.45 + j * 0.3 : 0, missing: b < 0.03 });
  }
  return out;
}
// the fence along the meadow in silhouette, every board a little different (height, lean), a few
// broken, one gone; an open gate (the leaf swung toward us); sky light on the picket tips
function fence7() {
  return K.sprite("f02-fence7b", W + 80, 120, (s) => {
    const fy = 90; // sprite y of the fence foot (screen FY7)
    const g0 = GATE7[0] + 40, g1 = GATE7[1] + 40;
    const R = K.rng("f7c");
    for (const p of pickets7()) {
      if (p.missing) continue;
      s.save();
      s.translate(p.x + 6, fy);
      s.rotate(p.lean);
      s.fillStyle = K.mix("#0e0a14", "#2a2030", R() * 0.35);
      s.beginPath();
      if (p.broken) {
        const hh = p.h * p.broken;
        s.moveTo(-6, 0); s.lineTo(-6, -hh); s.lineTo(-3, -hh - 3); s.lineTo(0, -hh + 1); s.lineTo(3, -hh - 5); s.lineTo(6, -hh); s.lineTo(6, 0);
      } else {
        s.moveTo(-6, 0); s.lineTo(-6, -p.h); s.lineTo(0, -p.h - 7); s.lineTo(6, -p.h); s.lineTo(6, 0);
      }
      s.fill();
      // the sky's glow on the pointed tips and the lit-side edge
      s.globalCompositeOperation = "lighter";
      s.fillStyle = "rgba(255,130,90,0.14)";
      if (!p.broken) { s.beginPath(); s.moveTo(0, -p.h - 7); s.lineTo(6, -p.h); s.lineTo(4.5, -p.h + 1); s.closePath(); s.fill(); }
      s.fillRect(4.6, -(p.broken ? p.h * p.broken : p.h) + 1, 1.2, (p.broken ? p.h * p.broken : p.h) * 0.6);
      s.restore();
    }
    s.fillStyle = "#0e0a14";
    s.fillRect(-40, fy - 31, g0 + 40, 4); s.fillRect(g1, fy - 31, W + 120, 4);
    s.fillRect(-40, fy - 12, g0 + 40, 3); s.fillRect(g1, fy - 12, W + 120, 3);
    s.fillStyle = "rgba(255,130,90,0.1)";
    s.fillRect(-40, fy - 31, g0 + 40, 1); s.fillRect(g1, fy - 31, W + 120, 1);
    // gate posts, taller
    s.fillStyle = "#0e0a14";
    s.fillRect(g0 - 6, fy - 54, 7, 54); s.fillRect(g1 - 1, fy - 54, 7, 54);
    // the leaf, swung open toward us on its hinge (foreshortened, foot lower = nearer)
    s.save();
    s.translate(g0 - 4, fy);
    s.transform(-0.62, 0.42, 0, 1, 0, 0);
    for (let k = 0; k < 4; k++) { s.beginPath(); s.moveTo(k * 15, 0); s.lineTo(k * 15, -42); s.lineTo(k * 15 + 6, -50); s.lineTo(k * 15 + 12, -42); s.lineTo(k * 15 + 12, 0); s.fill(); }
    s.fillRect(0, -31, 56, 4); s.fillRect(0, -12, 56, 3);
    s.globalCompositeOperation = "lighter";
    s.fillStyle = "rgba(255,170,100,0.3)";
    for (let k = 0; k < 4; k++) s.fillRect(k * 15 + 9, -46, 3, 40);
    s.restore();
  });
}
// the gate light spilling toward us across the grass: one warm wedge per gap between the boards (and
// a wide one through the open gate), radiating from the light's ground point, fading with distance;
// a faint lit haze in the air above them. Baked once (plate coordinates).
function lightFan7() {
  return K.sprite("f02-fan7", W + 80, H, (s) => {
    const [lx, ly] = LG7;
    const g0 = GATE7[0] + 40, g1 = GATE7[1] + 40;
    const gaps = [[g0 - 1, g1 - 1, 1]];
    const ps = pickets7();
    for (let i = 0; i + 1 < ps.length; i++) {
      const a = ps[i].x + 12, b = ps[i + 1].x;
      if (b - a > 30 || Math.abs((a + b) / 2 - lx) > 260) continue;
      gaps.push([a, b, ps[i].missing || ps[i + 1].missing ? 0.8 : 0.45]);
    }
    const ext = (x, y) => lx + (x - lx) * (y - ly) / (FY7 - ly);
    s.save();
    if (K.hasFilter()) s.filter = "blur(2px)";
    for (const [a, b, k] of gaps) {
      const d = Math.abs((a + b) / 2 - lx);
      const fall = 1 / (1 + Math.pow(d / 90, 2));
      const y1 = H + 20;
      const gr = s.createLinearGradient(0, FY7, 0, y1);
      gr.addColorStop(0, `rgba(255,190,120,${0.5 * k * fall})`);
      gr.addColorStop(0.3, `rgba(255,170,100,${0.22 * k * fall})`);
      gr.addColorStop(1, "rgba(255,160,90,0)");
      s.fillStyle = gr;
      s.beginPath();
      s.moveTo(a, FY7); s.lineTo(b, FY7); s.lineTo(ext(b, y1), y1); s.lineTo(ext(a, y1), y1); s.closePath();
      s.fill();
    }
    s.restore();
    // lit air just this side of the gate
    const hg = s.createRadialGradient(lx, FY7 - 6, 0, lx, FY7 - 6, 120);
    hg.addColorStop(0, "rgba(255,180,110,0.22)");
    hg.addColorStop(1, "rgba(255,180,110,0)");
    s.fillStyle = hg;
    s.fillRect(lx - 120, FY7 - 126, 240, 240);
  });
}
function shotDusk(g, t, p) {
  const e = K.ease.inOut(p);
  g.save();
  g.translate(480, 300);
  g.scale(1 + 0.03 * e, 1 + 0.03 * e);
  g.translate(-480 - 40 + e * 20, -300);
  g.drawImage(duskPlate7(), 0, 0, W + 80, H);
  K.stars(g, W + 80, H, 7, 0.9, t, { yMax: 200 });
  K.sunGlow(g, 840, 404, 10, "#ff8a4a", 0.35);
  // the light beyond the gate: a warm core (not white), the arch over it, the town's points
  const flick = 1 + 0.04 * Math.sin(t * 2.3) + 0.03 * Math.sin(t * 5.1);
  townGlow(g, TOWN7[0] + 40, TOWN7[1], 0.8 * flick, t, { n: 20, spread: 56, arch: 12 });
  K.glow(g, TOWN7[0] + 40, TOWN7[1] - 3, 7, "#ffb868", 0.45);
  // you: from the near meadow, along the path, through the gate, toward the town (seen from behind)
  const u = K.ease.inOut(K.seg(t, 57, 63.6));
  const path = [[430, 520, 150], [560, 452, 96], [GATE7[0] + 40 + 26, FY7 + 2, 64], [TOWN7[0] + 40 - 30, FY7 - 10, 46]];
  const seg = Math.min(2, Math.floor(u * 3)), k = u * 3 - seg;
  const a = path[seg], b = path[seg + 1];
  const fx = K.lerp(a[0], b[0], k), fy = K.lerp(a[1], b[1], k), fh = K.lerp(a[2], b[2], k);
  const beyond = fy < FY7 + 1;
  const alpha = K.clamp((63.9 - t) / 0.5);
  const person = () => K.drawPerson(g, fx, fy, fh, { view: "back", walk: true, phase: t * 0.95, hood: true, t, shadow: false, coat: "#1a1420", pants: "#100c14", boots: "#1a0e10", light: { x: TOWN7[0] + 40, y: TOWN7[1], color: "#ffa060", strength: 0.9, z: -1 }, ambient: "#05040a", alpha });
  if (beyond) person();
  g.drawImage(fence7(), 0, FY7 - 90, W + 80, 120);
  // the light fan through the boards onto the grass, with your long shadow cut out of it, toward us
  const FL = K.layer(W + 80, H, "f02-fan7l");
  FL.g.drawImage(lightFan7(), 0, 0, W + 80, H);
  {
    const dx = fx - LG7[0], dy = Math.max(6, fy - LG7[1]);
    const dl = Math.hypot(dx, dy), ux = dx / dl, uy = dy / dl;
    const len = 260, w0 = fh * 0.1, w1 = fh * 0.32;
    const sg = FL.g.createLinearGradient(fx, fy, fx + ux * len, fy + uy * len);
    sg.addColorStop(0, `rgba(0,0,0,${0.95 * alpha})`);
    sg.addColorStop(0.6, `rgba(0,0,0,${0.6 * alpha})`);
    sg.addColorStop(1, "rgba(0,0,0,0)");
    FL.g.globalCompositeOperation = "destination-out";
    FL.g.fillStyle = sg;
    FL.g.beginPath();
    FL.g.moveTo(fx - uy * w0, fy + ux * w0); FL.g.lineTo(fx + uy * w0, fy - ux * w0);
    FL.g.lineTo(fx + ux * len + uy * w1, fy + uy * len - ux * w1); FL.g.lineTo(fx + ux * len - uy * w1, fy + uy * len + ux * w1);
    FL.g.closePath(); FL.g.fill();
    FL.g.globalCompositeOperation = "source-over";
  }
  g.save();
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = flick;
  g.drawImage(FL.canvas, 0, 0, W + 80, H);
  g.restore();
  if (!beyond) person();
  swayStrip(g, meadowStrip("dusk7b", 1200, 130, { count: 700, heads: 30, env: 0.6, fadeTop: 30, body: "#06060c", head: "#0a080e", lit: "rgba(255,140,90,0.08)", headLit: "rgba(255,130,90,0.06)" }), -60, H - 120, 1200, 130, t, 0.05, 8);
  fireflies2(g, t, { seed: 8, count: 16, area: [0, 330, W + 80, 170], alpha: 0.9 });
  g.restore();
}

// shots. `warm`: the times drawn (offscreen) to build a shot's caches before its cut; `pre`: cache
// builders run first, one per frame, so no single frame does all of a shot's baking at once.
const SHOTS = [
  { a: 0, b: 9, draw: shotGolden, warm: [0.5, 4.5, 8.9] },
  { a: 9, b: 18, draw: shotFence, pre: [() => picketTex(0), () => picketTex(1), () => picketTex(2), () => picketTex(3), () => beyondPlate("fence2", 9)], warm: [9.05, 12, 17.5] },
  { a: 18, b: 30, xf: 1.0, draw: shotKitten, pre: [() => warmSkyBeyond(), () => lawnPlate3(), () => fencePlate3(), ...RIG_PARTS.map((k) => () => rigPart(k))], warm: [18.05, 22, 24.3, 25.5, 28, 29.9] },
  { a: 30, b: 37, draw: shotLookBack, pre: [() => lookBackBg()], warm: [30.05, 31.7, 33, 34, 36.5] },
  { a: 37, b: 48, xf: 1.0, draw: shotTuft, pre: [() => bokehMeadow5(), () => macroTex(), () => macroPost([418, 292])], warm: [37.05, 40, 42, 46] },
  { a: 48, b: 57, draw: shotThrough, pre: [() => duskBeyond(0), () => duskBeyond(1), () => fence6(0), () => fence6(1), () => otsSprite(0), () => otsSprite(1), () => otsRim(0), () => otsRim(1)], warm: [48.05, 52, 55.5] },
  { a: 57, b: 64, draw: shotDusk, pre: [() => duskPlate7(), () => fence7(), () => lightFan7()], warm: [57.05, 60] },
];

// The sequencer (lib012.runFilm's cut/dissolve logic) with a spread-out cache warm-up: from 6 s
// before a cut, ONE warm task of the next shot runs per frame (a cache builder or an offscreen draw at
// one time), instead of all of them in the frame 1.5 s before the cut. During the opening fade from
// black every shot is warmed the same way. Only caches change: the picture stays a pure function of t.
const WARM_DONE = new Set();
function drawShotF(g, s, t) {
  g.save();
  try { s.draw(g, t, K.seg(t, s.a, s.b)); } finally { g.restore(); }
}
function warmStep(shots, t, cur) {
  const px = K.pixelScale();
  const cand = [];
  if (t < 1.4) { for (let k = 0; k < shots.length; k++) if (k !== cur) cand.push(k); }
  else if (cur + 1 < shots.length && shots[cur + 1].a - t < 6) cand.push(cur + 1);
  for (const k of cand) {
    const s = shots[k];
    const tasks = (s.pre || []).concat(s.warm || [s.a + 0.02, (s.a + s.b) / 2, s.b - 0.05]);
    for (let i = 0; i < tasks.length; i++) {
      const id = k + ":" + i + "@" + px;
      if (WARM_DONE.has(id)) continue;
      WARM_DONE.add(id);
      try {
        if (typeof tasks[i] === "function") tasks[i]();
        else drawShotF(K.layer(W, H, "f02-warm").g, s, tasks[i]);
      } catch (err) { console.warn("[f02] warm", err); }
      return;
    }
  }
}
function runFilm2(g, t, W2, H2, shots, postFn) {
  let i = 0;
  g.save();
  try {
    if (W2 !== W || H2 !== H) g.scale(W2 / W, H2 / H);
    for (let k = 0; k < shots.length; k++) if (t >= shots[k].a) i = k;
    const s = shots[i];
    const xf = s.xf || 0;
    if (xf > 0 && i > 0 && t < s.a + xf) {
      drawShotF(g, shots[i - 1], t);
      const L = K.layer(W, H, "f02-xfade");
      drawShotF(L.g, s, t);
      g.save();
      g.globalAlpha = K.smooth((t - s.a) / xf);
      g.drawImage(L.canvas, 0, 0, W, H);
      g.restore();
    } else drawShotF(g, s, t);
    if (postFn) postFn(g, t);
  } finally {
    g.restore();
  }
  try { warmStep(shots, t, i); } catch (err) { console.warn("[f02] warm", err); }
}

function post(g, t) {
  K.letterbox(g, W, H, 1);
  K.fadeBlack(g, W, H, Math.max(1 - K.smooth(K.seg(t, 0, 1.0)), K.smooth(K.seg(t, 63.2, 64))));
}

// lens looks per shot (film.gradeAt blends them across the cuts and dissolves). Every look has the
// same keys so the blends are complete. The memory look is a warm ~4200 K print: slightly amber
// blacks (not milky), halation only round the real highlights, finer grain that lives in the mids
// and shadows (the lens weights grain by luminance; a finer size keeps it off the bright pickets).
const LOOK = {
  title: { exposure: 0.92, temp: 0.24, tint: 0.02, lift: [0.01, 0.008, 0.008], gain: [1.04, 1, 0.92], sat: 1.0, contrast: 1.04, halation: 0.5, bloom: 0.38, threshold: 0.95, streak: 0.13, grain: 0.05, grainSize: 1.35, vignette: 0.42, weave: 1 },
  golden: { exposure: 0.92, temp: 0.24, tint: 0.02, lift: [0.01, 0.008, 0.008], gain: [1.04, 1, 0.92], sat: 1.0, contrast: 1.04, halation: 0.5, bloom: 0.38, threshold: 0.95, streak: 0.06, grain: 0.05, grainSize: 1.35, vignette: 0.42, weave: 1 },
  memory: { exposure: 0.95, temp: 0.42, tint: 0.04, lift: [0.03, 0.02, 0.005], gain: [1.05, 1.0, 0.88], sat: 0.97, contrast: 1.03, halation: 0.55, bloom: 0.3, threshold: 1.05, streak: 0.03, grain: 0.07, grainSize: 1.15, vignette: 0.5, weave: 1.2 },
  macro: { exposure: 0.92, temp: 0.26, tint: 0.02, lift: [0.01, 0.008, 0.008], gain: [1.04, 1, 0.92], sat: 1.0, contrast: 1.05, halation: 0.5, bloom: 0.4, threshold: 0.95, streak: 0.02, grain: 0.05, grainSize: 1.35, vignette: 0.48, weave: 1 },
  dusk: { exposure: 0.95, temp: 0.05, tint: 0.04, lift: [0.012, 0.008, 0.026], gain: [1.02, 0.98, 1.0], sat: 0.98, contrast: 1.06, halation: 0.55, bloom: 0.45, threshold: 0.95, streak: 0.1, grain: 0.06, grainSize: 1.35, vignette: 0.5, weave: 1 },
};
function lerpLook(a, b, k) {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const o = {};
  for (const key of Object.keys(a)) {
    if (!(key in b)) continue;
    const va = a[key], vb = b[key];
    o[key] = Array.isArray(va) ? va.map((x, i) => K.lerp(x, vb[i], k)) : K.lerp(va, vb, k);
  }
  return o;
}
function gradeAt(t) {
  if (t < 8) return LOOK.title;
  if (t < 9.5) return lerpLook(LOOK.title, LOOK.golden, K.smooth(K.seg(t, 8, 9.5)));
  if (t < 18) return LOOK.golden;
  if (t < 19) return lerpLook(LOOK.golden, LOOK.memory, K.smooth(t - 18));
  if (t < 37) return LOOK.memory;
  if (t < 38) return lerpLook(LOOK.memory, LOOK.macro, K.smooth(t - 37));
  if (t < 48) return LOOK.macro;
  if (t < 57) return lerpLook(LOOK.macro, LOOK.dusk, K.smooth(K.seg(t, 48, 56)));
  return LOOK.dusk;
}

export const film = {
  id: 2,
  title: "The Hole in the Fence",
  chapter: "Chapter 2",
  unlockAt: 10,
  duration: 64,
  poster: 22,
  tagline: "He always did find the way out.",
  subs: [
    [2.5, 6.0, "The meadow went gold in the evening."],
    [11.0, 15.5, "Then you saw it. Orange fur. On a nail."],
    [19.5, 23.5, "He used to do this at home, too."],
    [24.5, 28.5, "The little hole under the fence."],
    [31.0, 35.5, "He always looked back. Just once."],
    [39.5, 43.5, "You kept the fur. Just in case."],
    [49.0, 53.5, "On the other side, a town's lights."],
    [58.5, 62.5, "He went that way. So would you."],
  ],
  voice: [
    [2.5, "The meadow went gold in the evening.", { rate: 0.92, pitch: 1.0 }],
    [11.0, "Then you saw it. Orange fur. On a nail.", { rate: 0.92, pitch: 1.0 }],
    [19.5, "He used to do this at home, too.", { rate: 0.88, pitch: 1.0 }],
    [24.5, "The little hole under the fence.", { rate: 0.92, pitch: 1.0 }],
    [31.0, "He always looked back. Just once.", { rate: 0.92, pitch: 1.0 }],
    [39.5, "You kept the fur. Just in case.", { rate: 0.92, pitch: 1.0 }],
    [49.0, "On the other side, a town's lights.", { rate: 0.92, pitch: 1.0 }],
    [58.5, "He went that way. So would you.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: { mood: "sad", key: "E", bpm: 72, cues: [[8, "swell"], [22, "meow"], [40, "swell"], [58, "bell"]] },
  grade: LOOK.golden,
  gradeAt,
  draw(g, t, W2, H2) {
    runFilm2(g, t, W2, H2, SHOTS, post);
  },
};
