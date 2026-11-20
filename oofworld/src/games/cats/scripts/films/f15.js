// films/f15.js - Chapter 15 "Too Loud" (FILMS.md f15). The Meme Dimension: a vaporwave sunset that
// does not do quiet. Smash-in, a three-gag montage, the letterbox breaks, then the DROP freezes time and
// one amber pawprint leads through a frozen mall to a shop that was closed forever.
// draw(g, t, W, H) is a pure function of t: every shot works from p = seg(t, a, b); only static art is cached.
//
// v2 "photographed" pass (REALISM.md): the vaporwave world is built like a real set lit by one low pink
// sun - a Mie-hazed sky, textured hazy ranges with sunlit rims, backlit palm silhouettes, a polished
// black-glass floor that mirrors the sky (cached, blurred reflection) under emissive neon grid tubes,
// chrome that reflects the world behind the camera with a Fresnel sun rim, soft contact shadows and floor
// reflections for everything. Glitter is specular glints (the lens blooms + streaks them), fast things get
// motion blur, the kid uses the kit's IK arms (hands over the ears), and every shot sets the GPU lens grade.
import * as K from "../filmkit.js";

const D = 60;
const TAU = Math.PI * 2;
const BPM = 128;
const PAL = ["#ff4fd8", "#7af7ff", "#fff27a", "#b47aff", "#ffffff", "#ff9a5a"];

// ---- small utilities --------------------------------------------------------------------------------
function desat(g, x, y, w, h, a) {
  if (a <= 0.002) return;
  g.save();
  g.globalCompositeOperation = "saturation";
  g.globalAlpha = K.clamp(a);
  g.fillStyle = "#808080";
  g.fillRect(x, y, w, h);
  g.restore();
}
const beatPulse = (t) => Math.exp(-(((t * BPM) / 60) % 1) * 5);
// draw a canvas several times along a horizontal smear (equal-weight running average = a box shutter)
function smear(g, cv, x, y, w, h, dx, n) {
  if (Math.abs(dx) < 1.5 || n < 2) { g.drawImage(cv, x, y, w, h); return; }
  const a0 = g.globalAlpha;
  for (let k = 0; k < n; k++) {
    g.globalAlpha = a0 / (k + 1);
    g.drawImage(cv, x + dx * (k / (n - 1) - 0.5), y, w, h);
  }
  g.globalAlpha = a0;
}

// ---- the vaporwave world: one low pink sun, everything lit by it ---------------------------------------
const HZ = 300;                       // horizon line (world px)
const SUN = { x: 480, y: 238, r: 118 };
const BX = 140, BY = 220;             // the cached backdrop covers x -140..1100, y -220..HZ
const BW = 1240, BH = HZ + BY;
const SKY_C = { top: "#1279c0", mid: "#86d4f6", bottom: "#ff92d2" };

function skySprite() {
  return K.sprite("f15:sky", BW, BH + 4, (s) => {
    K.sky(s, BW, BH + 4, { ...SKY_C, horizon: BH / (BH + 4), sun: { x: SUN.x + BX, y: SUN.y + BY, color: "#ffb08a" }, haze: 0.85 });
    // a faint high cirrus veil so the gradient is never a clean vector ramp
    K.texRect(s, "cloud", 0, 0, BW, BH * 0.75, { scale: 520, scaleY: 160, alpha: 0.18, mode: "screen", tex: { seed: 15, cover: 0.42 } });
  });
}
// Sunset cumulus lit from BELOW by the low sun: warm glowing bellies, cool lavender tops in their own
// shadow, frayed translucent edges that fade to nothing before the sprite border. Baked once per variant.
function cloudSprite(i) {
  const w = 300, h = 130;
  let dens = null;
  const build = () => {
    dens = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const dx = (u - 0.5) / 0.44, dy = (v - 0.58) / 0.4;
        let e = 1 - (dx * dx + dy * dy);
        if (v > 0.74) e -= (v - 0.74) * 7; // flattish base
        if (e <= -0.3) continue;
        const n = K.texFbm(u * 4.2 + i * 3.7, v * 1.9, 40 + i, 4);
        const bill = 1 - Math.abs(K.texNoise(u * 10 + i, v * 4.5, 60 + i));
        const d = e * 1.15 + n * 1.05 + (bill - 0.5) * 0.7 - 0.3;
        dens[y * w + x] = K.clamp(d);
      }
    }
  };
  return K.texBake("f15cloud:" + i, w, h, (u, v, out, x, y) => {
    if (!dens) build();
    const d = dens[y * w + x];
    if (d <= 0.004) { out[3] = 0; return; }
    let acc = 0; // march toward the sun (below, slightly toward the frame centre)
    for (let k = 1; k <= 6; k++) { const py = y + k * 5; if (py >= h) break; acc += dens[py * w + x]; }
    const T = Math.exp(-acc * 0.7);
    let up = 0; // skylight from above
    for (let k = 1; k <= 3; k++) { const py = y - k * 6; if (py < 0) break; up += dens[py * w + x]; }
    const sky = Math.exp(-up * 0.8);
    const lo = [150, 112, 178], mid = [240, 162, 206], hot = [255, 214, 196], top = [196, 186, 236];
    const a = K.clamp(T), b = K.clamp(sky * (1 - a));
    const hk = K.clamp((d - 0.12) / 0.35) * a * a * a * 0.8; // only dense cloud glows; thin fringes stay translucent
    for (let c = 0; c < 3; c++) out[c] = lo[c] + (mid[c] - lo[c]) * a + (hot[c] - mid[c]) * hk + (top[c] - lo[c]) * b * 0.45;
    const al = K.clamp((d - 0.02) / 0.6);
    out[3] = 255 * al * al * (3 - 2 * al);
  });
}
function sunsetClouds(g, tt) {
  for (let i = 0; i < 6; i++) {
    const depth = 0.6 + K.hash(i, 151) * 0.6;
    const w = 330 * depth, h = w * 0.43;
    const span = 960 + w + 200;
    const x = ((K.hash(i, 152) * span + tt * 12 * depth) % span) - w - 100;
    const y = 30 + K.hash(i, 153) * 70 + (1.2 - depth) * 40;
    g.drawImage(cloudSprite(i % 4), x, y, w, h);
  }
}
// the banded vaporwave sun, painted at full value so the lens turns its top into a light
function vaporSun(g, x, y, r, slide) {
  g.save();
  const c = new Path2D();
  c.arc(x, y, r, 0, TAU);
  g.clip(c);
  const bands = new Path2D();
  bands.rect(x - r - 4, y - r - 4, r * 2 + 8, r * 2 + 8);
  const sl = slide % 1;
  for (let i = 0; i < 8; i++) {
    const u = (i + sl) / 8;
    const by = y + r * 0.02 + u * r;
    const bh = 1.2 + u * u * r * 0.11;
    bands.rect(x - r - 4, by, r * 2 + 8, bh);
  }
  g.clip(bands, "evenodd");
  const sg = g.createLinearGradient(0, y - r, 0, y + r);
  sg.addColorStop(0, "#fffdf2");
  sg.addColorStop(0.3, "#ffe08a");
  sg.addColorStop(0.6, "#ff9a6a");
  sg.addColorStop(1, "#ff3aa6");
  g.fillStyle = sg;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  // limb darkening: a real sun disc is dimmer and redder at its edge
  const lg = g.createRadialGradient(x, y, r * 0.55, x, y, r);
  lg.addColorStop(0, "rgba(255,80,120,0)");
  lg.addColorStop(1, "rgba(200,40,110,0.28)");
  g.fillStyle = lg;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
}
// ---- cache-build helpers (pixel work happens only here, never per frame) ---------------------------------
// edgeBand: the part of a silhouette NOT covered by itself shifted by (dx,dy) logical px, filled with
// `color` and softened. Shift down -> a band along the top edges: a rim light from behind/above.
function edgeBand(src, dx, dy, color, blur) {
  const k = src.width / (src.lw || src.width);
  const c = K.makeCanvas(src.width, src.height), x = c.getContext("2d");
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = "destination-out";
  x.drawImage(src, dx * k, dy * k);
  if (blur && K.hasFilter()) {
    const c2 = K.makeCanvas(src.width, src.height), x2 = c2.getContext("2d");
    x2.filter = `blur(${K.qblur(blur * k)}px)`;
    x2.drawImage(c, 0, 0);
    x2.filter = "none";
    // keep the glow inside the silhouette (a rim is light ON the surface)
    x2.globalCompositeOperation = "destination-in";
    x2.drawImage(src, 0, 0);
    c2.lw = src.lw; c2.lh = src.lh;
    return c2;
  }
  c.lw = src.lw; c.lh = src.lh;
  return c;
}
// a scratch canvas at sprite resolution (PX from a probe sprite), logical size w x h
function scratchCanvas(w, h) {
  const k = K.sprite("f15:pxprobe", 4, 4, () => {}).width / 4;
  const c = K.makeCanvas(w * k, h * k);
  c.lw = w; c.lh = h;
  const x = c.getContext("2d");
  x.setTransform(k, 0, 0, k, 0, 0);
  c._g = x;
  return c;
}
// fbm roughness / grime masks (small, stretched at use): alpha = fbm
function fbmMask(key, w, h, sx, sy, seed, lo, hi) {
  return K.texBake("f15mask:" + key, w, h, (u, v, out) => {
    const n = K.texFbm(u * sx, v * sy, seed, 4);
    const a = K.clamp((n - lo) / (hi - lo));
    out[0] = out[1] = out[2] = 255;
    out[3] = 255 * a;
  });
}

function palm(g, x, y, h, lean, col, seed, lit) {
  const tx = x + lean * h * 0.55, ty = y - h;
  const p = new Path2D();
  K.tube(p, [x, y, x + lean * h * 0.25, y - h * 0.5, tx, ty], [h * 0.06, h * 0.042, h * 0.028], 4);
  g.fillStyle = col;
  g.fill(p);
  // the trunk's sun-side edge: a thin warm rim (the sun is low, behind)
  if (lit) {
    g.save();
    g.clip(p);
    g.strokeStyle = K.rgba(lit, 0.45);
    g.lineWidth = Math.max(0.8, h * 0.012);
    g.beginPath(); g.moveTo(x + h * 0.03 * (lean > 0 ? -1 : 1), y); g.lineTo(tx + h * 0.014 * (lean > 0 ? -1 : 1), ty); g.stroke();
    g.restore();
  }
  // fronds: drooping spines with leaflets (wind-tattered: some leaflets missing). Backlit: the thin
  // leaflet tips let the sun through (translucent warm), the thick bases stay dark.
  const spine = new Path2D(), leaf = new Path2D(), leafMid = new Path2D(), leafTip = new Path2D();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i - 4.5) * 0.4 + (K.hash(i, seed) - 0.5) * 0.25;
    const len = h * (0.4 + K.hash(i, h + seed) * 0.22);
    const dx = Math.cos(a), dy = Math.sin(a);
    const ex = tx + dx * len, ey = ty + dy * len * 0.45 + len * (0.35 + Math.abs(dx) * 0.35);
    const cx = tx + dx * len * 0.55, cy = ty + dy * len * 0.7 - len * 0.12;
    spine.moveTo(tx, ty);
    spine.quadraticCurveTo(cx, cy, ex, ey);
    const N = 16;
    for (let k = 1; k < N; k++) {
      if (K.hash(k * 7 + i, seed) < 0.14) continue;
      const u = k / N, iu = 1 - u;
      const px = iu * iu * tx + 2 * iu * u * cx + u * u * ex;
      const py = iu * iu * ty + 2 * iu * u * cy + u * u * ey;
      const tgx = 2 * iu * (cx - tx) + 2 * u * (ex - cx), tgy = 2 * iu * (cy - ty) + 2 * u * (ey - cy);
      const tl = Math.hypot(tgx, tgy) || 1;
      const nx = -tgy / tl, ny = tgx / tl;
      const ll = (h * 0.11 * Math.sin(Math.PI * (0.15 + u * 0.85)) + h * 0.015) * (0.75 + K.hash(k, i + seed) * 0.5);
      for (const sd of [-1, 1]) {
        const lx = px + (nx * sd * 0.8 + (tgx / tl) * 0.45) * ll, ly = py + (ny * sd * 0.8 + (tgy / tl) * 0.45) * ll + ll * 0.6;
        const mx = (px + lx) / 2, my = (py + ly) / 2;
        leaf.moveTo(px, py); leaf.lineTo(mx, my);
        (u > 0.62 ? leafTip : leafMid).moveTo(mx, my);
        (u > 0.62 ? leafTip : leafMid).lineTo(lx, ly);
      }
    }
  }
  g.strokeStyle = col;
  g.lineCap = "round";
  g.lineWidth = Math.max(1.2, h * 0.016);
  g.stroke(spine);
  g.lineWidth = Math.max(0.8, h * 0.009);
  g.stroke(leaf);
  g.strokeStyle = lit ? K.mix(col, lit, 0.22) : col;
  g.lineWidth = Math.max(0.7, h * 0.008);
  g.stroke(leafMid);
  g.strokeStyle = lit ? K.rgba(K.mix(col, lit, 0.55), 0.85) : col;
  g.lineWidth = Math.max(0.6, h * 0.0065);
  g.stroke(leafTip);
}
// ranges + palms + horizon mist: static, so cached (transparent above the ridges)
function fgSprite() {
  return K.sprite("f15:fg", BW, BH + 6, (s) => {
    const base = BH + 2;
    // three ranges, each farther one lighter, pinker and flatter in contrast (aerial perspective). The
    // low sun sits BEHIND them: every ridge carries a warm rim where light grazes over it, the faces
    // toward us are in their own shadow, and rock texture shows only on the near range.
    const ranges = [
      { y: base - 6, amp: 74, color: "#7a4a9c", haze: "#e8a4d4", hazeAmt: 0.4, seed: 11, freq: 0.9, tex: "granite", ts: 360, ta: 0.25, rim: "#ffd0e4", ra: 0.35 },
      { y: base, amp: 92, color: "#48206a", haze: "#e89ad0", hazeAmt: 0.22, seed: 3, freq: 1.3, tex: "granite", ts: 260, ta: 0.4, rim: "#ffc0dc", ra: 0.5 },
      { y: base + 2, amp: 46, color: "#1a0622", haze: "#c46ab0", hazeAmt: 0.08, seed: 8, freq: 2.1, tex: "lavarock", ts: 200, ta: 0.6, rim: "#ffa8c8", ra: 0.6 },
    ];
    for (const r of ranges) {
      const c = scratchCanvas(BW, BH + 6);
      K.hills(c._g, BW, base + 4, { y: r.y, amp: r.amp, color: r.color, haze: r.haze, hazeAmt: r.hazeAmt, seed: r.seed, freq: r.freq, tex: r.tex, texScale: r.ts, texAlpha: r.ta, cache: false });
      // fbm gullies: darker clefts running down the faces (multiplied, only on the range itself)
      c._g.globalCompositeOperation = "source-atop";
      K.texRect(c._g, "relief", 0, r.y - r.amp * 1.4, BW, r.amp * 1.6, { scale: r.ts * 0.8, scaleY: r.ts * 0.5, alpha: 0.22 * (1 - r.hazeAmt * 0.6), mode: "source-atop", tex: { seed: r.seed + 5 } });
      // the face toward us is lit only by the pink sky: darker low down, with haze in-scatter lifting it far away
      const fg = c._g.createLinearGradient(0, r.y - r.amp * 1.3, 0, r.y + 4);
      fg.addColorStop(0, "rgba(255,190,230,0)");
      fg.addColorStop(1, K.rgba(r.haze, 0.14 * r.hazeAmt + 0.03));
      c._g.fillStyle = fg;
      c._g.fillRect(0, r.y - r.amp * 1.4, BW, r.amp * 1.5);
      c._g.globalCompositeOperation = "source-over";
      s.drawImage(c, 0, 0, BW, BH + 6);
      // sunlit rim: a thin hot line + a soft glow just inside every ridge
      s.save();
      s.globalCompositeOperation = "lighter";
      s.globalAlpha = r.ra * 0.55;
      s.drawImage(edgeBand(c, 0, 5, r.rim, 2.5), 0, 0, BW, BH + 6);
      s.globalAlpha = r.ra;
      s.drawImage(edgeBand(c, 0, 1.2, r.rim, 0), 0, 0, BW, BH + 6);
      s.restore();
    }
    // backlit palms: the far ones lose contrast into the pink haze
    const P = [[160, 6, 150, -0.35, 0.18], [215, 4, 108, 0.25, 0.42], [790, 6, 170, 0.3, 0.12], [862, 4, 104, -0.2, 0.45], [40, 2, 70, 0.1, 0.62], [930, 2, 64, -0.15, 0.64]];
    P.forEach(([x, dy, h, lean, hz], i) => palm(s, x + BX, base + dy - 6, h, lean, K.mix("#1e0628", "#e08ccc", hz), i + 3, K.mix("#ff8ab8", "#ffd0e4", hz)));
    // ground mist hugging the horizon (in-scattered sunlight)
    const mg = s.createLinearGradient(0, base - 46, 0, base + 4);
    mg.addColorStop(0, "rgba(255,170,220,0)");
    mg.addColorStop(0.7, "rgba(255,176,222,0.26)");
    mg.addColorStop(1, "rgba(255,196,232,0.48)");
    s.fillStyle = mg;
    s.fillRect(0, base - 46, BW, 52);
  });
}
// the polished floor mirrors the world: a flipped, softened copy of sky + sun + ranges, strongest at
// grazing angles (the horizon) and fading toward the camera (Fresnel). Built once.
function reflSprite() {
  return K.sprite("f15:refl", BW, 270, (s) => {
    // the mirrored world (sky, the sun disc, ranges, palms)
    const m = scratchCanvas(BW, 270), mg = m._g;
    mg.save();
    mg.translate(0, BH);
    mg.scale(1, -1);
    mg.drawImage(skySprite(), 0, 0, BW, BH + 4);
    vaporSun(mg, SUN.x + BX, SUN.y + BY, SUN.r, 0);
    mg.drawImage(fgSprite(), 0, 0, BW, BH + 6);
    mg.restore();
    // a rough glossy surface smears every reflection VERTICALLY (anisotropic: the microfacets spread the
    // image along the view direction), more where the polish is worn. Rough copy = vertical streak blur.
    const rough = scratchCanvas(BW, 270), rg = rough._g;
    if (K.hasFilter()) rg.filter = "blur(3px)";
    for (let k = 0; k < 9; k++) { rg.globalAlpha = 1 / (k + 1); rg.drawImage(m, 0, k * 4.5, BW, 270); }
    rg.globalAlpha = 1;
    rg.filter = "none";
    s.drawImage(rough, 0, 0, BW, 270);
    // the polished patches keep a sharper image: the sharp copy masked by a cached fbm "smoothness" map
    const sharp = scratchCanvas(BW, 270), sg2 = sharp._g;
    if (K.hasFilter()) sg2.filter = "blur(1.2px)";
    sg2.drawImage(m, 0, 0, BW, 270);
    sg2.filter = "none";
    sg2.globalCompositeOperation = "destination-in";
    sg2.drawImage(fbmMask("smooth", 310, 70, 7, 3.2, 21, 0.38, 0.72), 0, 0, BW, 270);
    s.globalAlpha = 0.85;
    s.drawImage(sharp, 0, 0, BW, 270);
    s.globalAlpha = 1;
    // black glass absorbs: the reflection is a dimmer, slightly violet copy of the world
    s.globalCompositeOperation = "multiply";
    s.fillStyle = "#9a7aac";
    s.fillRect(0, 0, BW, 270);
    // Fresnel: strong at grazing angles (the horizon), fading toward the camera
    s.globalCompositeOperation = "destination-in";
    const fg = s.createLinearGradient(0, 0, 0, 270);
    fg.addColorStop(0, "rgba(0,0,0,0.95)");
    fg.addColorStop(0.2, "rgba(0,0,0,0.55)");
    fg.addColorStop(0.6, "rgba(0,0,0,0.22)");
    fg.addColorStop(1, "rgba(0,0,0,0.1)");
    s.fillStyle = fg;
    s.fillRect(0, 0, BW, 270);
  });
}
// black glass floor (cached texture + reflection), with the emissive grid on top
function floorSprite(H) {
  return K.sprite("f15:floor", BW, H - HZ + 260, (s) => {
    const h = H - HZ + 260;
    const fg = s.createLinearGradient(0, 0, 0, h);
    fg.addColorStop(0, "#4a2058");
    fg.addColorStop(0.08, "#200c28");
    fg.addColorStop(0.5, "#0e0614");
    fg.addColorStop(1, "#08030c");
    s.fillStyle = fg;
    s.fillRect(0, 0, BW, h);
    // fine polish marks / micro-roughness, squashed by perspective; worn (rough) patches scatter a little
    // more sky (a faint lilac sheen) - both from the same cached fbm map so it all agrees
    K.texRect(s, "granite", 0, 0, BW, h, { scale: 300, scaleY: 60, alpha: 0.16, mode: "soft-light", tex: { seed: 6 } });
    s.save();
    s.globalCompositeOperation = "screen";
    s.globalAlpha = 0.07;
    const inv = scratchCanvas(BW, 270);
    inv._g.fillStyle = "#c8a0e8";
    inv._g.fillRect(0, 0, BW, 270);
    inv._g.globalCompositeOperation = "destination-out";
    inv._g.drawImage(fbmMask("smooth", 310, 70, 7, 3.2, 21, 0.38, 0.72), 0, 0, BW, 270);
    s.drawImage(inv, 0, 0, BW, 270);
    s.restore();
    s.drawImage(reflSprite(), 0, 0, BW, 270);
  });
}
function grid(g, W, H, t, o = {}) {
  const cx = SUN.x;
  const speed = o.speed == null ? 1 : o.speed;
  const phase = ((t * speed) % 1 + 1) % 1;
  const pulse = o.pulse || 0;
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineCap = "butt";
  // horizontal tubes (they rush toward camera): a coloured sheath and a hot core, thinner with distance
  const halo = new Path2D(), core = new Path2D();
  const rows = [];
  for (let k = 0; k < 34; k++) {
    const z = 0.45 + (k - phase) * 0.55;
    if (z <= 0.2) continue;
    const y = HZ + (H - HZ) * 0.55 / z;
    if (y > H + 220 || y < HZ + 1) continue;
    rows.push([y, K.clamp((y - HZ) / (H - HZ))]);
  }
  for (const [y, near] of rows) {
    // far tubes sink into the pink haze: dimmer cores, wider and pinker sheaths (in-scattered light);
    // near tubes are hot and throw a broad bloom halo onto the glass round them
    const hz = Math.pow(1 - near, 1.6);
    const a = (0.3 + 0.7 * Math.pow(near, 0.55)) * (0.8 + pulse * 0.25);
    const sheath = K.mix("#ff1ec8", "#ffa0dc", hz * 0.85);
    if (near > 0.18) {
      g.strokeStyle = K.rgba("#ff2ed0", 0.07 * near * (1 + pulse * 0.4));
      g.lineWidth = 6 + near * 26;
      g.beginPath(); g.moveTo(-BX, y); g.lineTo(BW, y); g.stroke();
    }
    g.strokeStyle = K.rgba(sheath, 0.3 * a + hz * 0.08);
    g.lineWidth = 1 + near * 6 + hz * 2.2;
    g.beginPath(); g.moveTo(-BX, y); g.lineTo(BW, y); g.stroke();
    g.strokeStyle = K.rgba(K.mix("#ffb4f2", "#ffd2ea", hz), 0.95 * a * (1 - hz * 0.55));
    g.lineWidth = 0.4 + near * 1.5;
    g.beginPath(); g.moveTo(-BX, y); g.lineTo(BW, y); g.stroke();
  }
  // converging tubes
  for (let i = -24; i <= 24; i++) {
    const bx = cx + i * 95;
    halo.moveTo(cx + i * 2, HZ); halo.lineTo(cx + (bx - cx) * 2.2, H + 340);
  }
  core.addPath(halo);
  const bg = g.createLinearGradient(0, HZ, 0, H + 100);
  bg.addColorStop(0, K.rgba("#ff1ec8", 0));
  bg.addColorStop(0.45, K.rgba("#ff2ed0", 0.035));
  bg.addColorStop(1, K.rgba("#ff2ed0", 0.1 + pulse * 0.04));
  g.strokeStyle = bg;
  g.lineWidth = 18;
  g.stroke(halo);
  const vg = g.createLinearGradient(0, HZ, 0, H + 100);
  vg.addColorStop(0, K.rgba("#ff1ec8", 0));
  vg.addColorStop(0.3, K.rgba("#ff3ad8", 0.25 + pulse * 0.1));
  vg.addColorStop(1, K.rgba("#ff5ae0", 0.5));
  g.strokeStyle = vg;
  g.lineWidth = 4;
  g.stroke(halo);
  const vc = g.createLinearGradient(0, HZ, 0, H + 100);
  vc.addColorStop(0, K.rgba("#ffb4f2", 0));
  vc.addColorStop(0.3, K.rgba("#ffb4f2", 0.7));
  vc.addColorStop(1, K.rgba("#ffd4f8", 1));
  g.strokeStyle = vc;
  g.lineWidth = 1.2;
  g.stroke(core);
  g.restore();
}
// The whole vaporwave plain (shots 1, 3, 4). tt drives motion (frozen in shot 4).
function plain(g, W, H, tt, o = {}) {
  g.fillStyle = "#0a0410";
  g.fillRect(-BX - 200, HZ, BW + 400, H + 400);
  g.drawImage(skySprite(), -BX, -BY, BW, BH + 4);
  vaporSun(g, SUN.x, SUN.y, SUN.r, tt * 0.22);
  sunsetClouds(g, tt);
  g.drawImage(fgSprite(), -BX, -BY, BW, BH + 6);
  g.drawImage(floorSprite(H), -BX, HZ, BW, H - HZ + 260);
  // the sun's glitter path on the glass, broken by the moving grid
  K.reflectStreak(g, SUN.x, HZ + 3, 250, "#ffb48a", 0.85, { t: tt, width: 64 });
  grid(g, W, H, tt, { speed: o.speed == null ? 1.6 : o.speed, pulse: o.pulse || 0 });
  // aerial haze lying on the far floor: the grid and the glass melt into pink toward the horizon
  g.drawImage(hazeSprite(), -BX, HZ - 14, BW, 120);
}
function hazeSprite() {
  return K.sprite("f15:haze", 64, 120, (s) => {
    const hg = s.createLinearGradient(0, 0, 0, 120);
    hg.addColorStop(0, "rgba(255,176,222,0)");
    hg.addColorStop(0.1, "rgba(255,170,220,0.2)");
    hg.addColorStop(0.24, "rgba(240,140,210,0.16)");
    hg.addColorStop(0.55, "rgba(200,100,190,0.08)");
    hg.addColorStop(1, "rgba(200,100,190,0)");
    s.fillStyle = hg;
    s.fillRect(0, 0, 64, 120);
  });
}

/// ---- chrome: a real mirror ball. One cached equirectangular panorama of THIS world (the pink sun ahead,
// clouds, ranges and palms all round, the black glass + grid below) is ray-mapped per pixel onto a sphere:
// the centre mirrors what is behind the camera, the rim squashes the whole world ahead (fisheye), and a
// Schlick Fresnel term brightens the edge. Three variants by screen position (each ball sees its own view).
const PW = 512, PH = 256;
function envPano() {
  return K.sprite("f15:env", PW, PH, (s) => {
    const hz = PH / 2;
    const sg = s.createLinearGradient(0, 0, 0, hz);
    sg.addColorStop(0, "#0a4f90"); sg.addColorStop(0.45, "#3aa0dc"); sg.addColorStop(0.78, "#9ad6f4"); sg.addColorStop(0.93, "#f4a8dc"); sg.addColorStop(1, "#ff9ad0");
    s.fillStyle = sg; s.fillRect(0, 0, PW, hz);
    // ahead (az 0 = the frame centre): the real sky sprite, sun disc, clouds and ranges; behind: the same
    // sky away from the sun (its left quarter), mirrored, with the ranges going on all the way round
    const fw = PW * 0.34, fx = PW / 2 - fw / 2, fh = fw * (BH / BW);
    s.drawImage(skySprite(), 0, 0, BW, BH * 0.55, fx, hz - fh, fw, fh * 0.55);
    s.drawImage(skySprite(), 0, BH * 0.55, BW, BH * 0.45 + 4, fx, hz - fh * 0.45, fw, fh * 0.45);
    for (const [x0, w0] of [[0, fx], [fx + fw, PW - fx - fw]]) s.drawImage(skySprite(), 0, BH * 0.3, BW * 0.25, BH * 0.7, x0, hz - fh * 0.7, w0, fh * 0.7);
    for (let i = 0; i < 9; i++) {
      const cx = (i / 9) * PW + K.hash(i, 77) * 30, cw = 60 + K.hash(i, 78) * 40;
      s.globalAlpha = 0.85;
      s.drawImage(cloudSprite(i % 4), cx - cw / 2, hz - 34 - K.hash(i, 79) * 30, cw, cw * 0.43);
    }
    s.globalAlpha = 1;
    vaporSun(s, PW / 2, hz - fh * ((HZ + BY - SUN.y - BY) / BH) - 1, SUN.r * (fw / BW), 0);
    K.glow(s, PW / 2, hz - 8, 26, "#ffb0c8", 0.5);
    s.drawImage(fgSprite(), 0, 0, BW, BH + 6, fx, hz - fh, fw, fh + 1);
    for (const [x0, w0] of [[0, fx], [fx + fw, PW - fx - fw]]) {
      s.save(); s.translate(x0 + w0, 0); s.scale(-1, 1);
      s.drawImage(fgSprite(), 0, BH * 0.5, BW, BH * 0.5 + 6, 0, hz - fh * 0.5, w0, fh * 0.5 + 1);
      s.restore();
    }
    // below: black glass with the grid in perspective (rows bunch up toward the horizon), the pink sun
    // path ahead, and a dark contact band right under the horizon where the far floor swallows the light
    const fl = s.createLinearGradient(0, hz, 0, PH);
    fl.addColorStop(0, "#3a1a48"); fl.addColorStop(0.03, "#12061a"); fl.addColorStop(1, "#06020a");
    s.fillStyle = fl; s.fillRect(0, hz, PW, PH - hz);
    s.fillStyle = "rgba(4,0,8,0.85)"; s.fillRect(0, hz + 1, PW, 3);
    s.strokeStyle = "rgba(255,70,210,0.8)";
    for (let k = 1; k < 14; k++) {
      const el = Math.atan(1 / (k * 0.55));
      const y = hz + (el / Math.PI) * PH;
      s.lineWidth = 0.5 + el * 1.6;
      s.beginPath(); s.moveTo(0, y); s.lineTo(PW, y); s.stroke();
    }
    s.lineWidth = 0.8;
    for (let i = 0; i < 48; i++) {
      const x = (i / 48) * PW;
      const lg = s.createLinearGradient(0, hz, 0, PH);
      lg.addColorStop(0, "rgba(255,70,210,0)"); lg.addColorStop(0.2, "rgba(255,70,210,0.55)"); lg.addColorStop(1, "rgba(255,90,220,0.8)");
      s.strokeStyle = lg;
      s.beginPath(); s.moveTo(x, hz + 2); s.lineTo(x, PH); s.stroke();
    }
    K.glow(s, PW / 2, hz + 10, 30, "#ff9ab8", 0.45);
  });
}
function chromeSprite(v = 0) {
  return K.sprite("f15:chrome" + v, 200, 200, (s) => {
    // the panorama twice side by side, so triangles that straddle the seam behind the camera stay continuous
    const pano = envPano();
    const dbl = scratchCanvas(PW * 2, PH);
    dbl._g.drawImage(pano, 0, 0, PW, PH);
    dbl._g.drawImage(pano, PW, 0, PW, PH);
    const C0 = 100, R = 96;
    // the view ray through this ball (balls off-centre look slightly sideways)
    const vx = v * 0.32, vl = Math.hypot(vx, 1), Ix = vx / vl, Iz = 1 / vl;
    // reflect the view ray off the sphere at disc point (nx, ny) -> panorama (u, v)
    const map = (nx, ny) => {
      const r2 = Math.min(0.9995, nx * nx + ny * ny);
      const nz = Math.sqrt(1 - r2);
      const Nx = nx, Ny = -ny, Nz = -nz;
      const dn = Ix * Nx + Iz * Nz;
      const Rx = Ix - 2 * dn * Nx, Ry = -2 * dn * Ny, Rz = Iz - 2 * dn * Nz;
      const az = Math.atan2(Rx, Rz), el = Math.asin(K.clamp(Ry, -1, 1));
      return [((az / Math.PI) * 0.5 + 0.5) * PW, (0.5 - el / Math.PI) * PH];
    };
    // a polar mesh, denser toward the rim where the whole world ahead is squashed into a thin ring
    const RINGS = 16, SECT = 40;
    const pts = [];
    for (let i = 0; i <= RINGS; i++) {
      const rho = Math.sin((i / RINGS) * Math.PI / 2) * 1.004;
      const row = [];
      for (let j = 0; j <= SECT; j++) {
        const a = (j / SECT) * TAU;
        const nx = Math.cos(a) * rho, ny = Math.sin(a) * rho;
        const uv = map(nx * 0.9996, ny * 0.9996);
        row.push({ x: C0 + nx * R, y: C0 + ny * R, u: uv[0], v: uv[1] });
      }
      pts.push(row);
    }
    s.save();
    s.beginPath(); s.arc(C0, C0, R, 0, TAU); s.clip();
    s.fillStyle = "#1a0c22"; s.fillRect(0, 0, 200, 200);
    const tri = (a, b, c) => {
      let ua = a.u, ub = b.u, uc = c.u;
      // unwrap across the seam
      const m = Math.max(ua, ub, uc);
      if (m - ua > PW / 2) ua += PW; if (m - ub > PW / 2) ub += PW; if (m - uc > PW / 2) uc += PW;
      const det = (ub - ua) * (c.v - a.v) - (uc - ua) * (b.v - a.v);
      if (Math.abs(det) < 1e-6) return;
      // affine map source (u,v) -> dest (x,y)
      const A = ((b.x - a.x) * (c.v - a.v) - (c.x - a.x) * (b.v - a.v)) / det;
      const B = ((b.y - a.y) * (c.v - a.v) - (c.y - a.y) * (b.v - a.v)) / det;
      const Cc = ((c.x - a.x) * (ub - ua) - (b.x - a.x) * (uc - ua)) / det;
      const D = ((c.y - a.y) * (ub - ua) - (b.y - a.y) * (uc - ua)) / det;
      const E = a.x - A * ua - Cc * a.v, F = a.y - B * ua - D * a.v;
      // grow the clip a hair so neighbouring triangles leave no hairline seams
      const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, gr = 1.06;
      s.save();
      s.beginPath();
      s.moveTo(cx + (a.x - cx) * gr, cy + (a.y - cy) * gr);
      s.lineTo(cx + (b.x - cx) * gr, cy + (b.y - cy) * gr);
      s.lineTo(cx + (c.x - cx) * gr, cy + (c.y - cy) * gr);
      s.closePath();
      s.clip();
      s.transform(A, B, Cc, D, E, F);
      s.drawImage(dbl, 0, 0, dbl.width, dbl.height, 0, 0, PW * 2, PH);
      s.restore();
    };
    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j < SECT; j++) {
        const p00 = pts[i][j], p01 = pts[i][j + 1], p10 = pts[i + 1][j], p11 = pts[i + 1][j + 1];
        if (i > 0) tri(p00, p01, p11);
        tri(p00, p11, p10);
      }
    }
    // Schlick Fresnel (F0 0.62 for polished chrome): the centre mirrors at ~62%, the rim at ~100%
    const F0 = 0.62;
    const fr = s.createRadialGradient(C0, C0, 0, C0, C0, R);
    for (let k = 0; k <= 8; k++) {
      const rho = k / 8, cos = Math.sqrt(Math.max(0, 1 - rho * rho));
      const F = F0 + (1 - F0) * Math.pow(1 - cos, 5);
      fr.addColorStop(rho, `rgba(6,2,10,${(1 - F).toFixed(3)})`);
    }
    s.fillStyle = fr;
    s.fillRect(0, 0, 200, 200);
    // the lower hemisphere sits in the floor's dark: contact occlusion creeping up from the bottom
    const lo = s.createRadialGradient(C0, 196, 0, C0, 196, 70);
    lo.addColorStop(0, "rgba(4,0,8,0.5)"); lo.addColorStop(1, "rgba(4,0,8,0)");
    s.fillStyle = lo; s.fillRect(0, 100, 200, 100);
    s.restore();
  });
}
function chromeSphere(g, x, y, r, floorY) {
  const v = x < 330 ? -1 : x > 630 ? 1 : 0;
  if (floorY != null) {
    const d = Math.max(0, floorY - y);
    const k = K.clamp(1 - d / 520);
    // the sun is far behind and low: the soft shadow is pushed toward the camera and spreads with height
    K.shadowBlob(g, x, floorY + r * (0.1 + (1 - k) * 0.35), r * (0.6 + (1 - k) * 0.6), r * 0.11 * (1 + (1 - k) * 1.6), { alpha: 0.6 * k * k, soft: 1.8, color: "#040006" });
    g.save();
    g.globalAlpha *= 0.22 * k;
    g.translate(0, 2 * floorY - y);
    g.scale(1, -1);
    g.drawImage(chromeSprite(v), x - r * 1.042, -r * 1.042, r * 2.083, r * 2.083);
    g.restore();
  }
  g.drawImage(chromeSprite(v), x - r * 1.042, y - r * 1.042, r * 2.083, r * 2.083);
  // the sun's specular: where the ball's normal halves the angle to the sun, right at the top rim. A
  // white-hot core (the lens blooms and streaks it) inside a warm halo.
  if (r > 6) {
    K.glow(g, x + v * r * 0.08, y - r * 0.9, r * 0.5, "#ffb090", 0.35);
    K.glow(g, x + v * r * 0.08, y - r * 0.92, r * 0.16, "#fff6ec", 1);
  }
}
function chromePyramid(g, x, y, s, rot) {
  const apex = [x, y - s];
  const b = [0, 1, 2].map((i) => {
    const a = rot + i * TAU / 3;
    return [x + Math.cos(a) * s * 0.75, y + s * 0.35 + Math.sin(a) * s * 0.22];
  });
  const faces = [[b[0], b[1]], [b[1], b[2]], [b[2], b[0]]]
    .map(([p, q]) => ({ p, q, z: (p[1] + q[1]) / 2 }))
    .sort((m, n) => m.z - n.z);
  for (const f of faces) {
    const mx = (f.p[0] + f.q[0]) / 2 - x;
    // face normal swings across the sky: facing the sun (centre/back) it fires pink-gold, sideways it mirrors blue sky
    const facing = K.clamp(1 - Math.abs(mx) / (s * 0.8));
    const gr = g.createLinearGradient(apex[0], apex[1], (f.p[0] + f.q[0]) / 2, f.z);
    gr.addColorStop(0, K.mix("#c8f0ff", "#fff0f6", facing));
    gr.addColorStop(0.45, K.mix("#5ab0e0", "#ffb0d8", facing));
    gr.addColorStop(0.52, K.mix("#e8c8f0", "#ffe6f2", facing));
    gr.addColorStop(0.56, "#2a0c36");
    gr.addColorStop(1, K.mix("#120618", "#5a1a6a", facing * 0.6));
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(apex[0], apex[1]); g.lineTo(f.p[0], f.p[1]); g.lineTo(f.q[0], f.q[1]); g.closePath(); g.fill();
  }
  K.glow(g, apex[0], apex[1] + s * 0.06, s * 0.16, "#fff6ee", 0.85);
}
// specular glints: tiny near-white points (the lens blooms them and the streak makes the star)
function glint(g, x, y, s, a, col) {
  if (a <= 0.01) return;
  K.glow(g, x, y, s * 2.2, col, a * 0.55);
  K.glow(g, x, y, s * 0.7, "#ffffff", a);
}
// the opening explosion: foil confetti with motion blur along its velocity + glints
function burst(g, cx, cy, t, n, seed, life) {
  if (t < 0 || t > life) return;
  const u = t / life, k = K.ease.out(u);
  const dk = 3 * (1 - u) * (1 - u) / life; // d(ease.out)/dt for a cubic ease-out
  g.save();
  g.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const a = K.hash(i, seed) * TAU;
    const sp = 200 + K.hash(i + 0.3, seed) * 700;
    const ca = Math.cos(a), sa = Math.sin(a) * 0.75;
    const x = cx + ca * sp * k;
    const y = cy + sa * sp * k + t * t * 60;
    const vx = ca * sp * dk, vy = sa * sp * dk + 120 * t;
    const bl = 1 / 40; // shutter
    const al = (1 - u) * (0.6 + K.hash(i + 0.7, seed) * 0.4);
    if (i % 4 === 0) { glint(g, x, y, 2.5 + (i % 3), al, PAL[i % PAL.length]); continue; }
    const flip = Math.abs(Math.cos(t * (5 + i % 7) + i));
    const col = K.mix(K.shade(PAL[i % PAL.length], -0.45), PAL[i % PAL.length], flip);
    g.globalAlpha = al;
    g.strokeStyle = flip > 0.93 ? "#fff6fc" : col;
    g.lineWidth = 2 + flip * 2.2;
    g.beginPath(); g.moveTo(x - vx * bl, y - vy * bl); g.lineTo(x + 2, y + 1); g.stroke();
  }
  g.restore();
}

/// ---- the kid with hands clamped over the ears, plus her mirror image in the glass ----------------------
// The figure is static apart from a tremble, so it is built ONCE (at 1.6x for the push-in) on top of the
// kit body: rebuilt arms with cloth that bunches at the elbow and pulls from the armpit, sleeves pulled
// over the hands and pressed flat over the ears, the hood collapsed and bunched at the nape, textured hair,
// then the light: the pink sun straight behind her (rim on the head and shoulders), cyan sky fill from
// the left, everything facing the camera in her own soft shadow.
const KID_H = 220, KLW = KID_H * 0.9, KLH = KID_H * 1.12, KRES = 1.6;
const COAT = "#b8841a", COAT_D = "#674406", COAT_DD = "#3a2603";
function kidSprite() {
  return K.sprite("f15:kidS", KLW * KRES, KLH * KRES, (s0) => {
    const c = scratchCanvas(KLW * KRES, KLH * KRES), s = c._g;
    s.scale(KRES, KRES);
    const h = KID_H, u = h / 100, ox = KLW / 2, oy = KLH - 4;
    const X = (a) => ox + a * u, Y = (b) => oy + b * u;
    K.drawPerson(s, ox, oy, h, {
      view: "back", t: 1, hood: false, shadow: false, breathe: false, sway: 0, detail: 2,
      armL: { hand: [-10.5, -88.5] }, armR: { hand: [10.5, -88.5] },
      light: { x: SUN.x - 410 + ox, y: SUN.y - 452 + oy, color: "#ffb8d8", strength: 1.2, z: -0.7 }, ambient: "#3a2a58",
    });
    // ---- the coat's back panel: tension folds fanning from the small of the back up into each armpit
    const back = new Path2D();
    back.moveTo(X(-9.5), Y(-78)); back.lineTo(X(9.5), Y(-78)); back.lineTo(X(10.5), Y(-42)); back.lineTo(X(-10.5), Y(-42)); back.closePath();
    s.save();
    s.clip(back);
    if (K.hasFilter()) s.filter = `blur(${K.qblur(0.5 * u * KRES)}px)`;
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const y0 = -50 - k * 6, x0 = sd * (1 + k * 1.5);
        s.strokeStyle = "rgba(60,32,0,0.38)"; s.lineWidth = u * (0.9 + k * 0.2);
        s.beginPath(); s.moveTo(X(x0), Y(y0)); s.quadraticCurveTo(X(sd * (5 + k)), Y(y0 - 10), X(sd * 9.6), Y(-74 + k * 2)); s.stroke();
        s.strokeStyle = "rgba(255,214,130,0.16)"; s.lineWidth = u * 0.7;
        s.beginPath(); s.moveTo(X(x0 + sd * 0.8), Y(y0 + 0.9)); s.quadraticCurveTo(X(sd * (5.8 + k)), Y(y0 - 9), X(sd * 9.8), Y(-72.5 + k * 2)); s.stroke();
      }
    }
    s.filter = "none";
    // the back faces away from the sun: in her own shadow, darker toward the hem
    const bs = s.createLinearGradient(0, Y(-78), 0, Y(-42));
    bs.addColorStop(0, "rgba(70,30,60,0.05)"); bs.addColorStop(1, "rgba(50,20,50,0.3)");
    s.fillStyle = bs; s.fill(back);
    s.restore();
    // ---- arms: shoulder -> elbow (out and up) -> sleeve end pressed over the ear
    const arm = (sd) => {
      const sh = [X(sd * 9.2), Y(-77)], el = [X(sd * 23.5), Y(-82.5)], cf = [X(sd * 6.6), Y(-93.2)];
      const up = new Path2D(), fo = new Path2D();
      K.tube(up, [sh[0], sh[1], (sh[0] + el[0]) / 2, (sh[1] + el[1]) / 2 - u * 0.6, el[0], el[1]], [u * 7.6, u * 7.0, u * 6.4], 4);
      K.tube(fo, [el[0], el[1], (el[0] + cf[0]) / 2 + sd * u * 1.2, (el[1] + cf[1]) / 2 - u * 1.2, cf[0], cf[1]], [u * 6.6, u * 6.2, u * 7.6], 4);
      const both = new Path2D(); both.addPath(up); both.addPath(fo);
      // base cloth: lit from above/behind (top edge warm), shadowed underneath
      const ag = s.createLinearGradient(0, Y(-88), 0, Y(-76));
      ag.addColorStop(0, K.mix(COAT, "#ffc6dc", 0.1)); ag.addColorStop(0.45, COAT); ag.addColorStop(1, COAT_D);
      s.fillStyle = ag; s.fill(both);
      s.save();
      s.clip(both);
      K.texRect(s, "fabric", X(-30), Y(-100), 60 * u, 30 * u, { scale: 26 * u, alpha: 0.35, mode: "soft-light", tex: { seed: 4 } });
      // fbm modulation so the folds are not rubber-clean
      K.texRect(s, "relief", X(-30), Y(-100), 60 * u, 30 * u, { scale: 22 * u, alpha: 0.3, mode: "soft-light", tex: { seed: 9 } });
      if (K.hasFilter()) s.filter = `blur(${K.qblur(0.45 * u * KRES)}px)`;
      // compression folds bunched in the crook of the elbow (2-3 bands following the pull of the arm)
      for (let k = 0; k < 3; k++) {
        const f = 0.55 + k * 0.13;
        const px = K.lerp(sh[0], el[0], f), py = K.lerp(sh[1], el[1], f);
        s.strokeStyle = "rgba(70,36,0,0.5)"; s.lineWidth = u * (1.1 - k * 0.15);
        s.beginPath(); s.moveTo(px - sd * u * 0.8, py + u * 3.4); s.quadraticCurveTo(px + sd * u * 1.6, py, px - sd * u * 0.2, py - u * 3.2); s.stroke();
        s.strokeStyle = "rgba(255,226,150,0.28)"; s.lineWidth = u * 0.7;
        s.beginPath(); s.moveTo(px - sd * u * 1.8, py + u * 3.2); s.quadraticCurveTo(px + sd * u * 0.6, py - u * 0.2, px - sd * u * 1.2, py - u * 3.1); s.stroke();
      }
      // a long pull fold from the armpit along the underside of the upper arm
      s.strokeStyle = "rgba(60,30,0,0.45)"; s.lineWidth = u * 1.2;
      s.beginPath(); s.moveTo(X(sd * 9), Y(-74)); s.quadraticCurveTo(X(sd * 15), Y(-77.5), X(sd * 21.5), Y(-80)); s.stroke();
      // forearm: two twisting folds where the sleeve rides up
      for (let k = 0; k < 2; k++) {
        const f = 0.3 + k * 0.28;
        const px = K.lerp(el[0], cf[0], f), py = K.lerp(el[1], cf[1], f);
        s.strokeStyle = "rgba(70,36,0,0.42)"; s.lineWidth = u * 0.9;
        s.beginPath(); s.moveTo(px - u * 2.6, py - sd * u * 1.4); s.quadraticCurveTo(px, py + u * 1.2, px + u * 2.4, py + sd * u * 1.6); s.stroke();
      }
      s.filter = "none";
      // the underside of the arm, turned away from all light
      const us = s.createLinearGradient(0, Y(-86), 0, Y(-75));
      us.addColorStop(0, "rgba(40,16,40,0)"); us.addColorStop(1, "rgba(40,16,40,0.4)");
      s.fillStyle = us; s.fill(both);
      s.restore();
      return [cf, el];
    };
    // ---- hair: the back of a head, strands flowing down from the crown whorl
    const hc = [X(0), Y(-96.2)], hr = u * 7.7;
    const head = new Path2D(); head.ellipse(hc[0], hc[1], hr, hr * 1.06, 0, 0, TAU);
    const hg = s.createRadialGradient(hc[0], hc[1] - hr * 0.5, hr * 0.1, hc[0], hc[1], hr * 1.1);
    hg.addColorStop(0, "#6a4428"); hg.addColorStop(0.6, "#4a2c16"); hg.addColorStop(1, "#24140a");
    s.fillStyle = hg; s.fill(head);
    s.save();
    s.clip(head);
    const RR = K.rng("f15-hair");
    s.lineCap = "round";
    for (let i = 0; i < 260; i++) {
      const a = -Math.PI / 2 + (RR() - 0.5) * Math.PI * 1.9;
      const r0 = RR() * hr * 0.35;
      const x0 = hc[0] + Math.cos(a) * r0, y0 = hc[1] - hr * 0.55 + Math.sin(a) * r0 * 0.6;
      const len = hr * (0.6 + RR() * 0.9);
      const dx = Math.cos(a) * 0.5, dy = 1;
      const v = RR();
      s.strokeStyle = v < 0.4 ? `rgba(26,12,4,${0.35 + RR() * 0.3})` : `rgba(${150 + RR() * 60 | 0},${96 + RR() * 40 | 0},${60 + RR() * 30 | 0},${0.14 + RR() * 0.2})`;
      s.lineWidth = u * (0.18 + RR() * 0.22);
      s.beginPath(); s.moveTo(x0, y0); s.quadraticCurveTo(x0 + dx * len * 0.6 + (RR() - 0.5) * u, y0 + dy * len * 0.5, x0 + dx * len, y0 + dy * len); s.stroke();
    }
    // the crown catches the sun from behind: a warm sheen band across the top of the head
    const sh2 = s.createRadialGradient(hc[0], hc[1] - hr * 1.15, 0, hc[0], hc[1] - hr * 1.15, hr * 1.05);
    sh2.addColorStop(0, "rgba(255,170,190,0.5)"); sh2.addColorStop(0.5, "rgba(255,150,180,0.14)"); sh2.addColorStop(1, "rgba(255,150,180,0)");
    s.fillStyle = sh2; s.fillRect(hc[0] - hr, hc[1] - hr * 1.2, hr * 2, hr * 2);
    const nape = s.createLinearGradient(0, hc[1] + hr * 0.2, 0, hc[1] + hr);
    nape.addColorStop(0, "rgba(10,4,2,0)"); nape.addColorStop(1, "rgba(10,4,2,0.55)");
    s.fillStyle = nape; s.fillRect(hc[0] - hr, hc[1], hr * 2, hr * 1.2);
    s.restore();
    // ---- the hood, down, bunched in soft rolls on the nape (darker: lining + its own shadow)
    const hood = new Path2D();
    hood.moveTo(X(-9.4), Y(-84.2));
    hood.bezierCurveTo(X(-8.6), Y(-91.6), X(8.6), Y(-91.6), X(9.4), Y(-84.2));
    hood.bezierCurveTo(X(7.6), Y(-80.2), X(-7.6), Y(-80.2), X(-9.4), Y(-84.2));
    const hd = s.createLinearGradient(0, Y(-90), 0, Y(-81));
    hd.addColorStop(0, K.mix(COAT_D, "#ffb0c8", 0.25)); hd.addColorStop(0.35, COAT_D); hd.addColorStop(1, COAT_DD);
    s.fillStyle = hd; s.fill(hood);
    s.save();
    s.clip(hood);
    K.texRect(s, "fabric", X(-10), Y(-91), 20 * u, 11 * u, { scale: 20 * u, alpha: 0.3, mode: "soft-light", tex: { seed: 4 } });
    if (K.hasFilter()) s.filter = `blur(${K.qblur(0.4 * u * KRES)}px)`;
    for (let k = 0; k < 4; k++) {
      const x0 = -6 + k * 4;
      s.strokeStyle = "rgba(30,14,0,0.6)"; s.lineWidth = u * 0.8;
      s.beginPath(); s.moveTo(X(x0), Y(-88.8)); s.quadraticCurveTo(X(x0 + 1.4), Y(-85.5), X(x0 + 0.6), Y(-81.8)); s.stroke();
      s.strokeStyle = "rgba(255,200,120,0.2)"; s.lineWidth = u * 0.6;
      s.beginPath(); s.moveTo(X(x0 + 1.1), Y(-88.6)); s.quadraticCurveTo(X(x0 + 2.5), Y(-85.5), X(x0 + 1.7), Y(-82)); s.stroke();
    }
    s.filter = "none";
    s.restore();
    // contact shadow of the hood roll on the coat below it
    const hs = s.createLinearGradient(0, Y(-82), 0, Y(-78));
    hs.addColorStop(0, "rgba(30,10,20,0.45)"); hs.addColorStop(1, "rgba(30,10,20,0)");
    s.save(); s.clip(back); s.fillStyle = hs; s.fillRect(X(-9), Y(-82), 18 * u, 4 * u); s.restore();
    // ---- arms last: the sleeves end over the ears, the hands pulled inside them
    for (const sd of [-1, 1]) {
      const [cf, el] = arm(sd);
      // the sleeve end, pulled over the hand and pressed flat over the ear: gathered creases ringing the
      // flared end of the tube (no hand shows; the cuff swallows it)
      const ang = Math.atan2(cf[1] - el[1], cf[0] - el[0]);
      s.save();
      s.translate(cf[0], cf[1]); s.rotate(ang);
      const end = new Path2D(); end.ellipse(-u * 0.6, 0, u * 2.6, u * 3.9, 0, 0, TAU);
      const eg = s.createLinearGradient(-u * 3, 0, u * 2, 0);
      eg.addColorStop(0, COAT); eg.addColorStop(0.6, K.mix(COAT, COAT_D, 0.35)); eg.addColorStop(1, COAT_D);
      s.fillStyle = eg; s.fill(end);
      if (K.hasFilter()) s.filter = "blur(" + (0.3 * u * KRES) + "px)";
      for (let k = 0; k < 3; k++) {
        s.strokeStyle = "rgba(50,26,0,0.5)"; s.lineWidth = u * 0.55;
        s.beginPath(); s.ellipse(-u * (1.6 + k * 1.3), 0, u * 0.7, u * (3.4 - k * 0.2), 0, -1.3, 1.3); s.stroke();
      }
      s.filter = "none";
      s.restore();
      // AO where the sleeve presses into the hair
      const ao = s.createRadialGradient(cf[0] - sd * u * 2.6, cf[1], 0, cf[0] - sd * u * 2.6, cf[1], u * 3);
      ao.addColorStop(0, "rgba(10,4,2,0.4)"); ao.addColorStop(1, "rgba(10,4,2,0)");
      s.save(); s.clip(head); s.fillStyle = ao; s.fillRect(cf[0] - u * 6, cf[1] - u * 5, u * 12, u * 10); s.restore();
    }
    // ---- light: cyan sky fill on her left side, pink sun rim along every top/outer edge
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = "source-atop";
    const fillL = s.createLinearGradient(c.width * 0.18, 0, c.width * 0.55, 0);
    fillL.addColorStop(0, "rgba(90,200,255,0.26)"); fillL.addColorStop(1, "rgba(90,200,255,0)");
    s.fillStyle = fillL; s.fillRect(0, 0, c.width, c.height);
    s.globalCompositeOperation = "lighter";
    s.globalAlpha = 0.45;
    s.drawImage(edgeBand(c, 0, 1.6 * KRES, "#ff9ad0", 1.2 * KRES), 0, 0);
    s.globalAlpha = 0.3;
    s.drawImage(edgeBand(c, 1.4 * KRES, 0.6 * KRES, "#ff8ac4", 1.0 * KRES), 0, 0);
    s.drawImage(edgeBand(c, -1.4 * KRES, 0.6 * KRES, "#ff8ac4", 1.0 * KRES), 0, 0);
    s.globalAlpha = 0.55;
    s.drawImage(edgeBand(c, 0, 0.7 * KRES, "#ffd2e4", 0), 0, 0);
    s.globalAlpha = 1;
    s.globalCompositeOperation = "source-over";
    s0.drawImage(c, 0, 0, KLW * KRES, KLH * KRES);
  });
}
function kidEars(g, x, y, h, t, o = {}) {
  const spr = kidSprite();
  const sc = h / KID_H, LW = KLW * sc, LH = KLH * sc;
  // a tremble (hands pressed hard) + slow breathing; frozen in the drop
  const tr = o.shake ? Math.sin(t * 23) * 0.35 + Math.sin(t * 31.7) * 0.2 : 0;
  const br = o.frozen ? 0 : Math.sin(t * 2.4) * 0.004;
  const dx = x - LW / 2, dy = y - LH + 4 * sc;
  // her mirror image in the black glass (dim, Fresnel)
  g.save();
  g.globalAlpha *= 0.26;
  g.translate(0, 2 * y);
  g.scale(1, -1);
  g.drawImage(spr, dx, dy, LW, LH);
  g.restore();
  // the sun is behind her: a long soft shadow toward the camera, then real contact - AO under each boot
  K.shadowBlob(g, x, y + h * 0.16, h * 0.08, h * 0.17, { alpha: 0.45, soft: 1.4, color: "#060008" });
  K.shadowBlob(g, x, y + h * 0.012, h * 0.13, h * 0.03, { alpha: 0.55, soft: 1.2, color: "#040006" });
  for (const sd of [-1, 1]) K.shadowBlob(g, x + sd * h * 0.05, y + 0.5, h * 0.042, h * 0.012, { alpha: 0.95, soft: 0.6, color: "#020004" });
  g.save();
  g.translate(x + tr, y);
  g.scale(1, 1 + br);
  g.drawImage(spr, dx - x, dy - y, LW, LH);
  g.restore();
}
// ---- shot 1: smash in ---------------------------------------------------------------------------------
function shot1(g, W, H, t) {
  const z = K.lerp(2.5, 1.0, K.ease.out(K.seg(t, 0, 2.6))) + K.seg(t, 2.6, 8) * 0.05;
  const shake = 14 * Math.exp(-t * 3) + 1;
  K.withCamera(g, W, H, { x: 480, y: K.lerp(250, 270, K.seg(t, 0, 3)), zoom: z, rot: Math.sin(t * 0.7) * 0.012, shakeT: t * 3, shakeAmt: shake }, () => {
    plain(g, W, H, t, { speed: 1.6 + 4 * Math.exp(-t), pulse: beatPulse(t) });
    const bob = (i) => Math.sin(t * 1.3 + i * 2) * 10;
    chromeSphere(g, 250, 190 + bob(0), 46, 330);
    chromeSphere(g, 700, 150 + bob(1), 30, 315);
    chromeSphere(g, 860, 222 + bob(3), 22, 312);
    chromeSphere(g, 112, 372 + bob(4), 30, 460);
    chromeSphere(g, 600, 400 + bob(2), 58, 500);
    burst(g, 480, 250, t, 140, 3, 3.2);
  });
}

// ---- shot 2: three micro gags ---------------------------------------------------------------------------
// A neon sign: glass tube with a near-white core (the lens blooms it) inside a saturated sheath.
function neonPath(x, y, kind, t) {
  const p = new Path2D();
  if (kind === 0) {
    p.moveTo(x - 40, y + 30);
    p.quadraticCurveTo(x - 50, y - 6, x - 38, y - 22);
    p.lineTo(x - 42, y - 52); p.lineTo(x - 16, y - 32);
    p.quadraticCurveTo(x, y - 37, x + 16, y - 32);
    p.lineTo(x + 42, y - 52); p.lineTo(x + 38, y - 22);
    p.quadraticCurveTo(x + 50, y - 6, x + 40, y + 30);
    p.quadraticCurveTo(x, y + 44, x - 40, y + 30);
    p.moveTo(x - 12, y - 6); p.quadraticCurveTo(x - 18, y - 12, x - 24, y - 6);
    p.moveTo(x + 24, y - 6); p.quadraticCurveTo(x + 18, y - 12, x + 12, y - 6);
    p.moveTo(x - 12, y + 12); p.quadraticCurveTo(x, y + 22, x + 12, y + 12);
    p.moveTo(x - 30, y + 8); p.lineTo(x - 62, y + 2); p.moveTo(x + 30, y + 8); p.lineTo(x + 62, y + 2);
  } else {
    for (let i = 0; i <= 40; i++) {
      const u = i / 40, xx = x - 60 + u * 120;
      const yy = y - 10 + Math.sin(u * 18 + t * 6) * 16 * Math.sin(u * Math.PI);
      if (i) p.lineTo(xx, yy); else p.moveTo(xx, yy);
    }
  }
  return p;
}
function neonTube(g, p, col, a) {
  g.save();
  g.lineCap = "round"; g.lineJoin = "round";
  g.globalCompositeOperation = "lighter";
  g.strokeStyle = K.rgba(col, 0.22 * a); g.lineWidth = 9; g.stroke(p);
  g.strokeStyle = K.rgba(col, 0.75 * a); g.lineWidth = 4; g.stroke(p);
  g.globalCompositeOperation = "source-over";
  g.strokeStyle = K.rgba(K.mix(col, "#ffffff", 0.82), a); g.lineWidth = 1.8; g.stroke(p);
  g.restore();
}
const SIGNS = [[225, 120, "#5af0ff", 0], [735, 110, "#ff3ad0", 1]];
// the gag room: pink plaster wall lit only by its two signs, a polished tile floor. Static -> cached,
// the wall slightly out of focus (the lens is focused on the cat ~2 m in front of it).
function rollRoomSprite() {
  return K.sprite("f15:rollroom", 1060, 640, (s) => {
    s.translate(50, 50);
    const wall = K.layer(1060, 640, "f15:rollwall");
    const w = wall.g;
    w.translate(50, 50);
    w.fillStyle = "#b45a98";
    w.fillRect(-50, -50, 1060, 382);
    K.texRect(w, "plaster", -50, -50, 1060, 382, { scale: 300, alpha: 0.9, tint: "#ff8ad0", tintAlpha: 0.6, tex: { seed: 15 } });
    // the wall is dark except where the signs light it (inverse-square pools in the sign colours)
    w.fillStyle = "rgba(40,6,40,0.5)";
    w.fillRect(-50, -50, 1060, 382);
    for (const [x, y, c] of SIGNS) {
      K.lightPool(w, x, y + 20, 330, c, { intensity: 0.55 });
      K.lightPool(w, x, y + 10, 140, K.mix(c, "#ffffff", 0.4), { intensity: 0.45 });
    }
    // skirting board + occlusion where wall meets floor
    w.fillStyle = "#4a1a44";
    w.fillRect(-50, 318, 1060, 14);
    K.aoEdge(w, -50, 318, 1010, 318, { width: 26, alpha: 0.4, side: 1 });
    // bracket rods
    w.fillStyle = "rgba(30,10,30,0.7)";
    for (const [x, y] of SIGNS) { w.fillRect(x - 52, y - 46, 2.5, 50); w.fillRect(x + 50, y - 46, 2.5, 50); }
    for (const [x, y, c, kind] of SIGNS) neonTube(w, neonPath(x, y, kind, 0), c, 1);
    w.font = "700 22px Fredoka, sans-serif"; w.textAlign = "center";
    w.fillStyle = "#fff0fa";
    w.fillText("HA HA", 735, 144);
    if (K.hasFilter()) s.filter = "blur(1.6px)";
    s.drawImage(wall.canvas, -50, -50, 1060, 640);
    s.filter = "none";
    // floor: polished tiles in perspective, mirroring the lit wall
    const hz = 332, Hh = 590;
    s.fillStyle = "#e2bed6";
    s.fillRect(-50, hz, 1060, Hh - hz);
    const pA = new Path2D();
    for (let r = 0; r < 12; r++) {
      const z0 = 0.5 + r * 0.5, z1 = z0 + 0.5;
      const y0 = hz + (Hh - hz) * 0.5 / z0, y1 = hz + (Hh - hz) * 0.5 / z1;
      for (let c = -16; c < 16; c++) {
        if ((c + r + 400) % 2) continue;
        const xw0 = c * 60, xw1 = xw0 + 60;
        pA.moveTo(480 + xw0 / z0, y0); pA.lineTo(480 + xw1 / z0, y0); pA.lineTo(480 + xw1 / z1, y1); pA.lineTo(480 + xw0 / z1, y1); pA.closePath();
      }
    }
    s.fillStyle = "#6ab8c8";
    s.fill(pA);
    K.texRect(s, "granite", -50, hz, 1060, Hh - hz, { scale: 200, scaleY: 70, alpha: 0.22, mode: "soft-light", tex: { seed: 6 } });
    // reflection of the wall (flipped, softened, Fresnel-weighted)
    s.save();
    s.beginPath(); s.rect(-50, hz, 1060, Hh - hz); s.clip();
    s.globalAlpha = 0.45;
    if (K.hasFilter()) s.filter = "blur(3px)";
    s.translate(0, 2 * hz);
    s.scale(1, -1);
    s.drawImage(wall.canvas, -50, -50, 1060, 640);
    s.restore();
    s.filter = "none";
    // each sign spills its own colour onto the tiles below it (inverse-square, squashed by perspective)
    for (const [x, , c] of SIGNS) {
      K.lightPool(s, x, hz + 30, 360, c, { intensity: 0.3, flat: 0.3 });
      K.lightPool(s, x, hz + 14, 150, K.mix(c, "#ffffff", 0.3), { intensity: 0.22, flat: 0.25 });
    }
    // the room's light falls off toward the camera (nothing lights the near floor)
    const nf = s.createLinearGradient(0, hz, 0, Hh);
    nf.addColorStop(0, "rgba(30,6,34,0.15)");
    nf.addColorStop(1, "rgba(30,6,34,0.62)");
    s.fillStyle = nf;
    s.fillRect(-50, hz, 1060, Hh - hz);
    K.aoEdge(s, -50, hz, 1010, hz, { width: 18, alpha: 0.45, side: -1 });
  });
}
// map a world-space light into a rotated cat's local frame
function toLocal(x, y, ox, oy, rot) {
  const c = Math.cos(-rot), s = Math.sin(-rot), dx = x - ox, dy = y - oy;
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}
function gagRoll(g, W, H, t) { // local t 0..2.67
  K.withCamera(g, W, H, { zoom: 1.02 + t * 0.025, shakeT: t + 8, shakeAmt: 1.6 }, () => {
    g.drawImage(rollRoomSprite(), -50, -50, 1060, 640);
    // neon flicker + the hum of a cheap transformer
    for (const [x, y, c, kind] of SIGNS) {
      const flick = 0.82 + 0.18 * Math.sin(t * 31 + kind * 2) * Math.sin(t * 7.3 + kind);
      K.glow(g, x, y - 6, 120, c, 0.12 * flick);
    }
    K.bokehLights(g, W, H, t, { seed: 21, count: 9, colors: ["#ffd8f0", "#7af7ff", "#fff0a0"], area: [0, -10, W, 70], size: 20, alpha: 0.35 });
    // on his back, back and head on the tiles, legs pedalling the air, rocking with the laugh
    const laugh = Math.abs(Math.sin(t * 9));
    const roll = Math.sin(t * 5.5) * 0.12;
    const floor = 384;
    const ox = 440 + Math.sin(t * 5.5) * 18, oy = floor - 242, rot = Math.PI + 0.3 + roll;
    const kL = toLocal(225, 120, ox, oy, rot), rL = toLocal(735, 110, ox, oy, rot);
    const L = K.layer(W, H, "f15:rollcat");
    const c = L.g;
    c.save();
    c.translate(ox, oy);
    c.rotate(rot);
    K.drawCat(c, 0, -60, 150, {
      pose: "walk", phase: t * 2.3, coat: ROLL_COAT, headTurn: 1, headTilt: -0.3, mouth: 1,
      blink: 0.72 + laugh * 0.12, autoBlink: false, t, tail: 1, shadow: false, collar: false, ears: -0.2,
      key: { x: kL.x, y: kL.y, color: "#d8fbff", strength: 1.2 }, rim: { x: rL.x, y: rL.y, color: "#ff5ad0", strength: 1.45 },
      fill: "#2a1034", ambient: "#a05aa0", ambientK: 0.16,
    });
    // the laugh: a wide-open mouth (upside down with the head) - dark throat, pink tongue, the tips of the
    // fangs, lit by the cyan sign on the upper lip
    const mx = 127, my = -222 + laugh * 0.5, mw = 15 + laugh * 2.5, mh = 4 + laugh * 3.5;
    c.fillStyle = "#2a080e";
    c.beginPath(); c.ellipse(mx, my + mh * 0.35, mw, mh, 0, 0, TAU); c.fill();
    const tg = c.createRadialGradient(mx, my + mh * 1.0, 1, mx, my + mh * 0.9, mw * 0.9);
    tg.addColorStop(0, "#f08898"); tg.addColorStop(0.7, "#c04a62"); tg.addColorStop(1, "rgba(120,30,50,0)");
    c.save(); c.beginPath(); c.ellipse(mx, my + mh * 0.35, mw, mh, 0, 0, TAU); c.clip();
    c.fillStyle = tg; c.beginPath(); c.ellipse(mx, my + mh * 1.05, mw * 0.72, mh * 0.62, 0, 0, TAU); c.fill();
    // the roof of the mouth in shadow, a wet glint on the tongue
    c.fillStyle = "rgba(10,0,4,0.5)"; c.fillRect(mx - mw, my - mh * 0.7, mw * 2, mh * 0.7);
    K.glow(c, mx + 3, my + mh * 0.95, 3.5, "#fff0f6", 0.6);
    c.restore();
    c.fillStyle = "#f2ece2";
    for (const sd of [-1, 1]) {
      c.beginPath(); c.moveTo(mx + sd * mw * 0.62, my - mh * 0.45); c.lineTo(mx + sd * mw * 0.42, my - mh * 0.45); c.lineTo(mx + sd * mw * 0.52, my - mh * 0.45 + 4.5); c.closePath(); c.fill();
    }
    // fur of the upper lip overhangs the opening: a soft lip edge
    c.strokeStyle = "rgba(60,50,60,0.6)"; c.lineWidth = 1.6;
    c.beginPath(); c.ellipse(mx, my + mh * 0.35, mw, mh, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    c.restore();
    // the cat's soft reflection in the polished tiles (a quarter-res copy = cheap blur), then contact
    const R = K.layer(W / 4, H / 4, "f15:rollrefl");
    R.g.drawImage(L.canvas, 0, 0, W / 4, H / 4);
    g.save();
    g.beginPath(); g.rect(-60, 332, W + 120, H); g.clip();
    g.globalAlpha = 0.3;
    g.translate(0, 2 * floor);
    g.scale(1, -1);
    g.drawImage(R.canvas, 0, 0, W, H);
    g.restore();
    // contact: the spine and the back of the head press into the floor (dark, tight) under a softer AO
    const sp = (u) => [ox - 175 + u * 330, floor + 2 - u * 6];
    for (let k = 0; k <= 4; k++) {
      const [x, y] = sp(k / 4);
      K.shadowBlob(g, x, y, 62, 7, { alpha: 0.5, soft: 1.1, color: "#14000e" });
    }
    K.shadowBlob(g, ox - 10, floor + 4, 230, 16, { alpha: 0.35, soft: 1.6, color: "#1a0420" });
    // the signs throw their colours across the floor right round him (the light he is in)
    K.lightPool(g, ox - 120, floor + 10, 150, "#7af7ff", { intensity: 0.12, flat: 0.25 });
    K.lightPool(g, ox + 160, floor + 10, 150, "#ff4fd8", { intensity: 0.14, flat: 0.25 });
    g.drawImage(L.canvas, 0, 0, W, H);
  });
}
const ROLL_COAT = { ...K.COATS.grey, belly: "#ebe8ee", white: "#f4f2f6", light: "#d2d2d8", stripeAlpha: 0.7 };
// the turntable set: walnut plinth, brushed-steel platter, chrome tonearm (static -> cached)
function deckSprite() {
  return K.sprite("f15:deck2", 960, 230, (s) => {
    s.translate(0, -330);
    const dx = 480, dy = 400;
    const deck = new Path2D();
    deck.moveTo(90, 330); deck.lineTo(870, 330); deck.lineTo(960, 560); deck.lineTo(0, 560); deck.closePath();
    K.texFill(s, "wood", deck, { scale: 360, scaleY: 90, tex: { seed: 15 }, tint: "#2a140c", tintAlpha: 0.75 });
    // lacquer: the overhead spot reflects as a soft sheen across the top; front edge catches a line
    const lg = s.createLinearGradient(0, 330, 0, 560);
    lg.addColorStop(0, "rgba(255,190,240,0.2)"); lg.addColorStop(0.15, "rgba(255,190,240,0.04)"); lg.addColorStop(1, "rgba(0,0,0,0.55)");
    s.fillStyle = lg; s.fill(deck);
    s.fillStyle = "rgba(255,210,240,0.35)";
    s.fillRect(90, 330, 780, 1.2);
    // the spot's pool on the lacquer, magenta, falling off toward the corners
    K.lightPool(s, dx, dy - 10, 420, "#ff6ad8", { intensity: 0.22, flat: 0.32 });
    // platter: brushed steel rim (the vinyl itself is drawn per frame)
    K.shadowBlob(s, dx, dy + 18, 300, 30, { alpha: 0.7, soft: 0.5 });
    const pg = s.createLinearGradient(dx - 300, 0, dx + 300, 0);
    pg.addColorStop(0, "#4a4e58"); pg.addColorStop(0.3, "#c8ccd6"); pg.addColorStop(0.5, "#7a7e88"); pg.addColorStop(0.72, "#e0e4ec"); pg.addColorStop(1, "#3a3e46");
    s.fillStyle = pg;
    s.beginPath(); s.ellipse(dx, dy + 8, 300, 96, 0, 0, TAU); s.fill();
    // tonearm base: a chrome pillar, the counterweight, and the arm's soft shadow on the plinth
    K.shadowBlob(s, 840, 320, 46, 12, { alpha: 0.7 });
    const pb = s.createLinearGradient(800, 0, 870, 0);
    pb.addColorStop(0, "#2a2e38"); pb.addColorStop(0.35, "#e8ecf4"); pb.addColorStop(0.5, "#9aa0ac"); pb.addColorStop(1, "#1e222a");
    s.fillStyle = pb; s.beginPath(); s.ellipse(830, 312, 30, 10, 0, 0, TAU); s.fill();
    s.fillRect(814, 296, 32, 16);
    s.fillStyle = "#c8ced8"; s.beginPath(); s.ellipse(830, 296, 16, 5.5, 0, 0, TAU); s.fill();
    s.save(); if (K.hasFilter()) s.filter = "blur(3px)";
    s.lineCap = "round"; s.lineJoin = "round";
    s.strokeStyle = "rgba(6,0,4,0.6)"; s.lineWidth = 9;
    s.beginPath(); s.moveTo(840, 310); s.lineTo(818, 368); s.lineTo(782, 412); s.lineTo(724, 436); s.stroke();
    s.restore();
  });
}
// the tonearm itself (drawn over the vinyl): a chrome tube - dark edges, a bright specular line toward
// the spot above, a pink reflection of the room underneath - plus the headshell and cueing lift
function armSprite() {
  return K.sprite("f15:arm", 200, 200, (s) => {
    s.translate(-680, -240);
    const pts = [[830, 296], [808, 352], [772, 394], [718, 416]];
    const tub = (w, col, oy = 0, ox = 0) => { s.strokeStyle = col; s.lineWidth = w; s.lineCap = "round"; s.lineJoin = "round"; s.beginPath(); pts.forEach(([px, py], i) => (i ? s.lineTo(px + ox, py + oy) : s.moveTo(px + ox, py + oy))); s.stroke(); };
    // the pillar's pivot + counterweight behind
    const cw = s.createLinearGradient(830, 0, 862, 0);
    cw.addColorStop(0, "#1a1e26"); cw.addColorStop(0.4, "#d8dde6"); cw.addColorStop(0.6, "#8a909a"); cw.addColorStop(1, "#14181e");
    s.fillStyle = cw; s.beginPath(); s.ellipse(846, 252, 14, 17, 0.35, 0, TAU); s.fill();
    tub(5, "#3a3e48", 0, 0);
    s.save(); s.beginPath(); s.moveTo(830, 292); s.lineTo(842, 262); s.strokeStyle = "#a8aeb8"; s.lineWidth = 4; s.lineCap = "round"; s.stroke(); s.restore();
    tub(9, "#14161c");
    tub(7, "#4a505c");
    tub(3.4, "#8a919e", -1.1, 0.5);
    tub(1.4, "#dfe4ee", -2.0, 0.9);
    tub(0.6, "#ffffff", -2.3, 1.0);
    tub(1.6, "rgba(255,90,210,0.5)", 2.4, -0.8);
    // headshell + cartridge, the stylus down in the groove
    s.save(); s.translate(712, 418); s.rotate(0.38);
    const hs = s.createLinearGradient(0, -7, 0, 5);
    hs.addColorStop(0, "#e8ecf4"); hs.addColorStop(0.5, "#8a909c"); hs.addColorStop(1, "#2a2e36");
    s.fillStyle = hs; s.fillRect(-26, -7, 30, 12);
    s.fillStyle = "#16121a"; s.fillRect(-22, 3, 18, 9);
    s.fillStyle = "#ff3ad0"; s.fillRect(-21, 4, 3, 2);
    s.strokeStyle = "#b9bfc8"; s.lineWidth = 2; s.beginPath(); s.moveTo(-26, -2); s.lineTo(-36, -10); s.stroke();
    s.restore();
  });
}
// the record, in its own (circular) disc space; squashed to the ellipse when drawn
function vinylSprite() {
  return K.sprite("f15:vinyl", 600, 600, (s) => {
    s.translate(300, 300);
    const vg = s.createRadialGradient(0, 0, 80, 0, 0, 292);
    vg.addColorStop(0, "#0e0b12"); vg.addColorStop(0.97, "#0b090e"); vg.addColorStop(1, "#16121a");
    s.fillStyle = vg; s.beginPath(); s.arc(0, 0, 292, 0, TAU); s.fill();
    const R = K.rng("f15-vinyl");
    for (let r = 92; r < 286; r += 1.6) {
      s.strokeStyle = `rgba(150,130,170,${(0.03 + R() * 0.06).toFixed(3)})`;
      s.lineWidth = 0.6;
      s.beginPath(); s.arc(0, 0, r, 0, TAU); s.stroke();
    }
    // the silent gaps between tracks are smoother (glossier, darker)
    for (const r of [132, 178, 226, 262]) { s.strokeStyle = "rgba(4,2,6,0.9)"; s.lineWidth = 3; s.beginPath(); s.arc(0, 0, r, 0, TAU); s.stroke(); }
    s.strokeStyle = "rgba(220,200,240,0.18)"; s.lineWidth = 1.2; s.beginPath(); s.arc(0, 0, 291, 0, TAU); s.stroke();
  });
}
// surface detail that turns with the disc, already smeared along the rotation (arcs = rotational blur)
function vinylStreakSprite() {
  return K.sprite("f15:vstreak", 600, 600, (s) => {
    s.translate(300, 300);
    const R = K.rng("f15-vstreak");
    s.lineCap = "round";
    for (let i = 0; i < 170; i++) {
      const r = 92 + R() * 196, a0 = R() * TAU, span = 0.5 + R() * 1.6;
      const al = 0.04 + R() * 0.1;
      const n = 6;
      for (let k = 0; k < n; k++) {
        // each arc fades in and out along its length: a box-filtered streak, not a hard dash
        s.strokeStyle = `rgba(210,190,240,${(al * Math.sin(Math.PI * (k + 0.5) / n)).toFixed(3)})`;
        s.lineWidth = 0.5 + R() * 1.1;
        s.beginPath(); s.arc(0, 0, r, a0 + (span * k) / n, a0 + (span * (k + 1)) / n); s.stroke();
      }
    }
    // a couple of dust specks (they streak too)
    for (let i = 0; i < 14; i++) {
      const r = 100 + R() * 180, a0 = R() * TAU;
      s.strokeStyle = "rgba(255,240,255,0.22)"; s.lineWidth = 1.2;
      s.beginPath(); s.arc(0, 0, r, a0, a0 + 0.25); s.stroke();
    }
  });
}
// the anisotropic groove highlight: two opposed radial wedges along the line toward the spot light.
// Fixed in screen space while the disc spins under it (that is how a real record looks).
function vinylSheenSprite() {
  return K.texBake("f15sheen", 300, 300, (u, v, out) => {
    const x = u * 2 - 1, y = v * 2 - 1, r = Math.hypot(x, y);
    if (r > 0.99 || r < 0.31) { out[3] = 0; return; }
    const th = Math.atan2(y, x);
    let d = ((th - (-Math.PI / 2 + 0.22)) % Math.PI + Math.PI) % Math.PI;
    d = Math.min(d, Math.PI - d);
    const wedge = Math.exp(-(d * d) / (2 * 0.075 * 0.075)) + 0.25 * Math.exp(-(d * d) / (2 * 0.3 * 0.3));
    const groove = 0.75 + 0.25 * Math.sin(r * 420);
    const rad = Math.sin(Math.PI * (r - 0.31) / 0.68);
    const I = K.clamp(wedge * groove * (0.35 + 0.65 * rad));
    const top = y < 0 ? 1 : 0.7;
    out[0] = 255; out[1] = 200 + 40 * I; out[2] = 246;
    out[3] = 255 * I * 0.55 * top;
  });
}
function labelSprite() {
  return K.sprite("f15:label", 180, 180, (s) => {
    s.translate(90, 90);
    const lb = s.createRadialGradient(-20, -20, 0, 0, 0, 84);
    lb.addColorStop(0, "#ff6ad8"); lb.addColorStop(1, "#a01c7c");
    s.fillStyle = lb; s.beginPath(); s.arc(0, 0, 82, 0, TAU); s.fill();
    K.texRect(s, "fabric", -84, -84, 168, 168, { scale: 90, alpha: 0.18, mode: "soft-light", tex: { seed: 4 } });
    s.strokeStyle = "#f4dc6a"; s.lineWidth = 4;
    s.beginPath(); s.arc(0, 0, 60, 0, 1.2); s.stroke();
    s.beginPath(); s.arc(0, 0, 60, Math.PI, Math.PI + 1.2); s.stroke();
    s.fillStyle = "rgba(255,240,250,0.85)"; s.font = "700 13px Fredoka, sans-serif"; s.textAlign = "center";
    s.fillText("MEOW MIX", 0, -26);
    s.font = "600 9px Fredoka, sans-serif"; s.fillText("33 1/3", 0, 36);
    s.fillStyle = "#d8dce4"; s.beginPath(); s.arc(0, 0, 5, 0, TAU); s.fill();
    s.fillStyle = "#3a3e46"; s.beginPath(); s.arc(1, 1, 3, 0, TAU); s.fill();
  });
}
function recordCat(L, t, phi) {
  const vis = Math.sin(phi); // heading's screen-x component = -sin(phi)
  const facing = -vis >= 0 ? 1 : -1;
  const sc = 0.78 + 0.22 * Math.abs(vis);
  const g = L.g;
  g.save();
  g.translate(110, 196);
  g.scale(sc, 1);
  K.drawCat(g, 0, 0, 112, {
    pose: "sit", facing, headTurn: K.clamp(Math.cos(phi) * 0.9 + 0.35, -0.6, 1), t, tail: 1, collar: false, blink: 0.2, shadow: false,
    key: { x: 0, y: -400, color: "#ff8ae6", strength: 1.25 }, rim: { x: -300 * facing, y: -120, color: "#6af0ff", strength: 1.2 },
    fill: "#2a0c34", ambientK: 0.12, coat: K.COATS.siamese,
  });
  g.restore();
}
function gagRecord(g, W, H, t) {
  K.withCamera(g, W, H, { zoom: 1.05 - t * 0.012, shakeT: t + 20, shakeAmt: 1.4 }, () => {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0c0418");
    bg.addColorStop(1, "#22082e");
    g.fillStyle = bg;
    g.fillRect(-50, -50, W + 100, H + 100);
    // two moving heads in the haze of a club, far behind (out of focus)
    K.godRays(g, 480, -40, W, H, { color: "#ff3ad0", count: 7, strength: 0.42, t, spread: 1.2, seed: 4 });
    K.godRays(g, 200, -40, W, H, { color: "#5ae8ff", count: 5, strength: 0.3, t: t + 2, spread: 0.8, angle: 1.2, seed: 9 });
    K.bokehLights(g, W, H, t, { seed: 7, count: 14, colors: ["#ff4fd8", "#7af7ff", "#b47aff", "#ffd0f0"], area: [0, 0, W, 300], size: 26, alpha: 0.4, blades: 6 });
    g.drawImage(deckSprite(), 0, 330, 960, 230);
    const dx = 480, dy = 400, a = t * 4, SQ = 0.31;
    // the record: static grooves, then the turning surface detail (pre-smeared arcs), then the fixed sheen
    g.save();
    g.translate(dx, dy); g.scale(1, SQ);
    g.drawImage(vinylSprite(), -300, -300, 600, 600);
    g.save(); g.rotate(a); g.globalAlpha = 0.9; g.drawImage(vinylStreakSprite(), -300, -300, 600, 600); g.restore();
    g.save(); g.globalCompositeOperation = "lighter"; g.drawImage(vinylSheenSprite(), -292, -292, 584, 584); g.restore();
    g.save(); g.rotate(a); g.drawImage(labelSprite(), -90, -90, 180, 180); g.restore();
    g.restore();
    // the cat rides the platter round the spindle (rotation t*4), sat 150 px out, turning with it
    const phi = a + 2.2;
    const cx = dx + Math.cos(phi) * 150, cy = dy + Math.sin(phi) * 150 * SQ;
    const L = K.layer(220, 210, "f15:reccat");
    recordCat(L, t, phi);
    const front = Math.sin(phi) > 0.25;
    const drawCatNow = () => {
      // contact shadow on the vinyl, then the cat smeared along its path (1/48 s shutter)
      K.shadowBlob(g, cx, cy + 2, 46, 12, { alpha: 0.75, soft: 0.8, color: "#08000a" });
      const vx = -Math.sin(phi) * 150 * 4, vy = Math.cos(phi) * 150 * SQ * 4;
      const n = 5;
      for (let k = 0; k < n; k++) {
        const f = k / (n - 1) - 0.5;
        g.globalAlpha = 1 / (k + 1);
        g.drawImage(L.canvas, 0, 0, L.canvas.width, L.canvas.height, cx - 110 + (vx / 110) * f, cy - 196 + (vy / 110) * f, 220, 210);
      }
      g.globalAlpha = 1;
    };
    if (!front) drawCatNow();
    g.drawImage(armSprite(), 680, 240, 200, 200);
    if (front) drawCatNow();
  });
}
// ---- the very, very long cat: a real photographed cat whose mid-torso keeps repeating -------------------
// A standing cream cat is rendered once (facing left, lit by the arches behind/left); its leg-free middle
// is sliced into feathered strips that tile forever, and its front/hind leg regions are reused as leg pairs.
const LC = { S: 130, x: 300, y: 300 }; // where the cat sits inside its sprite
// a brown mackerel tabby: bold stripes, so as the truck races along him the stripes strobe past and sell the length
const LONG_COAT = { ...K.COATS.grey, base: "#9c7a56", light: "#d4b48a", dark: "#5a4028", stripe: "#2e1e10", tip: "#2a1a0e", belly: "#e6d6bc", white: "#f0e6d4", pattern: "mackerel", stripeAlpha: 0.85, iris: "#b8a43a", irisInner: "#e0c860", nose: "#b07a6a", noseEdge: "#6a4436", innerEar: "#c89a8a" };
const LONG_OPTS = {
  pose: "stand", facing: -1, coat: LONG_COAT, collar: false, headTurn: 0.6, shadow: false,
  key: { x: 120, y: 40, color: "#ffe2ee", strength: 1.1 }, rim: { x: 620, y: 120, color: "#ffc8a0", strength: 0.9 },
  fill: "#6a5a8a", ambientK: 0.2,
};
function longCatSprite() {
  return K.sprite("f15:longcat", 520, 330, (s) => {
    K.drawCat(s, LC.x, LC.y, LC.S, { ...LONG_OPTS, t: 4, autoBlink: false, blink: 0 });
  });
}
function stripSprite(k) {
  return K.sprite("f15:lstrip" + k, 52, 112, (s) => {
    const src = longCatSprite(), sc = src.width / 520;
    // the clean stretch of flank between the shoulder's belly shadow and the haunch
    const sx = 286 + k * 2;
    s.drawImage(src, sx * sc, 140 * sc, 44 * sc, 112 * sc, 0, 0, 52, 112);
    s.globalCompositeOperation = "destination-in";
    const fg = s.createLinearGradient(0, 0, 52, 0);
    fg.addColorStop(0, "rgba(0,0,0,0)"); fg.addColorStop(0.3, "rgba(0,0,0,1)"); fg.addColorStop(1, "rgba(0,0,0,1)");
    s.fillStyle = fg; s.fillRect(0, 0, 52, 120);
    s.globalCompositeOperation = "destination-out";
    const fb = s.createLinearGradient(0, 80, 0, 96);
    fb.addColorStop(0, "rgba(0,0,0,0)"); fb.addColorStop(1, "rgba(0,0,0,1)");
    s.fillStyle = fb; s.fillRect(0, 80, 52, 40);
    // the round underside: the fur turns away from the light into the belly's own shadow
    s.globalCompositeOperation = "source-atop";
    const us = s.createLinearGradient(0, 44, 0, 72);
    us.addColorStop(0, "rgba(70,50,60,0)"); us.addColorStop(1, "rgba(70,50,60,0.45)");
    s.fillStyle = us; s.fillRect(0, 44, 52, 40);
  });
}
function legSprite(k) { // 0 = front pair, 1 = hind pair (with the haunch)
  return K.sprite("f15:lleg" + k, 80, 110, (s) => {
    const src = longCatSprite(), sc = src.width / 520;
    const sx = k ? 330 : 192;
    s.drawImage(src, sx * sc, 200 * sc, 80 * sc, 110 * sc, 0, 0, 80, 110);
    s.globalCompositeOperation = "destination-in";
    const fg = s.createLinearGradient(0, 0, 0, 40);
    fg.addColorStop(0, "rgba(0,0,0,0)"); fg.addColorStop(1, "rgba(0,0,0,1)");
    s.fillStyle = fg; s.fillRect(0, 0, 80, 110);
  });
}
// one bay of the arcade behind: plaster pier + arch open to the pink-cyan sky and a hazy palm
function bayLongSprite() {
  return K.sprite("f15:bay", 220, 300, (s) => {
    s.fillStyle = "#c79ac8";
    s.fillRect(0, 0, 220, 300);
    const arch = new Path2D();
    arch.moveTo(30, 250); arch.lineTo(30, 130); arch.arc(90, 130, 60, Math.PI, 0); arch.lineTo(150, 250); arch.closePath();
    // the sky through the arch
    s.save(); s.clip(arch);
    const sg = s.createLinearGradient(0, 70, 0, 250);
    sg.addColorStop(0, "#6cc8f0"); sg.addColorStop(0.65, "#d8b8ec"); sg.addColorStop(1, "#ffa8d8");
    s.fillStyle = sg; s.fillRect(0, 60, 220, 200);
    palm(s, 104, 252, 92, 0.12, "rgba(150,90,170,0.55)", 7);
    s.restore();
    // plaster everywhere else (the arcade wall is in shade: the sun is behind it)
    const wallP = new Path2D(); wallP.rect(0, 0, 220, 300); wallP.addPath(arch);
    s.save(); s.clip(wallP, "evenodd");
    K.texRect(s, "plaster", 0, 0, 220, 300, { scale: 220, tint: "#b07ab8", tintAlpha: 0.7, tex: { seed: 15 } });
    const sh = s.createLinearGradient(0, 0, 0, 300);
    sh.addColorStop(0, "rgba(60,20,70,0.35)"); sh.addColorStop(0.7, "rgba(60,20,70,0.1)"); sh.addColorStop(1, "rgba(60,20,70,0.4)");
    s.fillStyle = sh; s.fillRect(0, 0, 220, 300);
    s.restore();
    // the arch's reveal: its inner face on the left catches the sky light, the right is in shadow
    s.save(); s.clip(arch);
    s.lineWidth = 9;
    s.strokeStyle = "rgba(255,220,240,0.45)";
    s.beginPath(); s.moveTo(34, 250); s.lineTo(34, 130); s.arc(90, 130, 56, Math.PI, Math.PI * 1.5); s.stroke();
    s.strokeStyle = "rgba(50,16,60,0.5)";
    s.beginPath(); s.arc(90, 130, 56, Math.PI * 1.5, 0); s.lineTo(146, 250); s.stroke();
    s.restore();
    // bright sunlit edge where the light wraps the arch (near-clipped: blooms a little)
    s.save(); s.globalCompositeOperation = "lighter";
    s.strokeStyle = "rgba(255,230,244,0.35)"; s.lineWidth = 1.2;
    s.beginPath(); s.moveTo(150, 250); s.lineTo(150, 130); s.arc(90, 130, 60, 0, -Math.PI * 0.4, true); s.stroke();
    s.restore();
    // floor-level occlusion
    const ao = s.createLinearGradient(0, 270, 0, 300);
    ao.addColorStop(0, "rgba(40,10,50,0)"); ao.addColorStop(1, "rgba(40,10,50,0.55)");
    s.fillStyle = ao; s.fillRect(0, 270, 220, 30);
  });
}
// perspective floor for the truck shot: polished stone tiles; near rows slide faster (true parallax)
function longFloor(g, W, H, pan) {
  const ey = 250, K0 = 190;
  g.fillStyle = "#c8b2c8";
  g.fillRect(0, 360, W, H - 360);
  const pA = new Path2D();
  for (let r = 0; r < 9; r++) {
    const z0 = 1.727 - r * 0.15, z1 = z0 - 0.15;
    if (z1 <= 0.5) break;
    const y0 = ey + K0 / z0, y1 = ey + K0 / z1;
    const c0 = Math.floor((pan - W * z0 * 0.6) / 70) - 1, c1 = Math.ceil((pan + W * z0 * 1.2) / 70) + 1;
    for (let c = c0; c < c1; c++) {
      if ((c + r + 1000) % 2) continue;
      const X0 = c * 70, X1 = X0 + 70;
      const sx = (X, z) => W / 2 + (X - pan - W / 2) / z;
      pA.moveTo(sx(X0, z0), y0); pA.lineTo(sx(X1, z0), y0); pA.lineTo(sx(X1, z1), y1); pA.lineTo(sx(X0, z1), y1); pA.closePath();
    }
  }
  g.fillStyle = "#8a78a2";
  g.fill(pA);
  K.texRect(g, "granite", 0, 360, W, H - 360, { scale: 240, scaleY: 80, alpha: 0.32, mode: "soft-light", ox: -pan, tex: { seed: 6 } });
  // sky light through each arch lands on the floor as a soft pale pool (moves with the wall)
  for (let i = Math.floor((pan * 0.58) / 220) - 1; i < Math.floor((pan * 0.58) / 220) + 6; i++) {
    const x = i * 220 + 90 - pan * 0.58;
    K.lightPool(g, x + 30, 385, 120, "#ffe0f4", { intensity: 0.35, flat: 0.22 });
  }
  const fg = g.createLinearGradient(0, 360, 0, H);
  fg.addColorStop(0, "rgba(60,30,80,0.25)"); fg.addColorStop(0.15, "rgba(60,30,80,0)"); fg.addColorStop(1, "rgba(30,10,40,0.45)");
  g.fillStyle = fg; g.fillRect(0, 360, W, H - 360);
}
function gagLong(g, W, H, t) {
  // hold on the head for 0.9 s (after the hit flash), then ease into a ~1200 px/s truck along the body
  const u = Math.max(0, t - 0.9);
  const pan = -40 + 1200 * (u < 0.3 ? (u * u) / 0.6 : u - 0.15);
  const vel = 1200 * (u < 0.3 ? u / 0.3 : 1);
  const L = K.layer(W, H, "f15:longscene");
  const s = L.g;
  // arcade wall (parallax 0.58: it is ~1.7x farther than the cat)
  const off = pan * 0.58;
  for (let i = Math.floor(off / 220) - 1; i < Math.floor(off / 220) + 6; i++) s.drawImage(bayLongSprite(), i * 220 - off, 60, 220, 300);
  s.fillStyle = "#8a5a98";
  s.fillRect(0, 0, W, 62);
  longFloor(s, W, H, pan);
  K.aoEdge(s, 0, 360, W, 360, { width: 16, alpha: 0.5, side: -1 });
  const floor = 440, x0 = LC.x, dy = floor - LC.y;
  s.save();
  s.translate(-pan, 0);
  // occlusion + soft shadow under the endless belly (the light is behind/above)
  const sx0 = Math.max(x0 - 120, pan - 60);
  const ao = s.createLinearGradient(0, floor - 8, 0, floor + 40);
  ao.addColorStop(0, "rgba(40,14,50,0.55)"); ao.addColorStop(0.25, "rgba(40,14,50,0.32)"); ao.addColorStop(1, "rgba(40,14,50,0)");
  s.fillStyle = ao; s.fillRect(sx0, floor - 8, pan + 1100 - sx0, 48);
  // his cast shadow: the sky light through the arches comes from behind/above, so it falls toward us
  const cs = s.createLinearGradient(0, floor + 4, 0, floor + 70);
  cs.addColorStop(0, "rgba(30,8,40,0.48)"); cs.addColorStop(1, "rgba(30,8,40,0)");
  s.fillStyle = cs; s.fillRect(sx0 + 20, floor + 4, pan + 1100 - sx0, 66);
  // leg pairs every ~400 px (front, hind, front... how many legs does this cat have?)
  for (let k = Math.max(1, Math.floor((pan - 200) / 400)); k * 400 < pan + 1100; k++) {
    const lx = x0 + k * 400 + (K.hash(k, 3) - 0.5) * 40;
    K.shadowBlob(s, lx + 6, floor - 2, 34, 5, { alpha: 0.55, soft: 0.8, color: "#2a0a30" });
    s.drawImage(legSprite(k % 2), lx - 40, 200 + dy, 80, 110);
  }
  // the head end: the real (live, blinking) cat, its hind half hidden under the tiled body
  K.shadowBlob(s, x0 - 80, floor - 2, 40, 5, { alpha: 0.55, soft: 0.8, color: "#2a0a30" });
  s.save();
  s.beginPath(); s.rect(pan - 100, 0, x0 + 34 - (pan - 100), H); s.clip();
  K.drawCat(s, x0, floor, LC.S, { ...LONG_OPTS, t: t + 4, blink: K.env(t, 0.5, 0.75, 0.06, 0.08), autoBlink: false });
  s.restore();
  // the endless torso: strip i sits exactly where the sprite's own mid-torso was, then repeats
  const i0 = Math.max(0, Math.floor((pan - 70 - (x0 - 12)) / 40)), i1 = Math.ceil((pan + 1000 - (x0 - 12)) / 40);
  for (let i = i0; i <= i1; i++) {
    const k = 0;
    // the spine is never a ruler: a slow undulation (vertebrae, loose skin) along the endless back
    s.drawImage(stripSprite(k), x0 - 12 + i * 40, 140 + dy + Math.sin(i * 0.37) * 1.6 + Math.sin(i * 1.13) * 0.6, 52, 112);
  }
  // sky light through each arch falls across his back as soft bright bands (sliding at the wall parallax)
  s.save();
  s.beginPath(); s.rect(x0 - 90, 130 + dy, pan + 1200 - x0, 110); s.clip();
  s.globalCompositeOperation = "source-atop";
  for (let i = Math.floor(off / 220) - 1; i < Math.floor(off / 220) + 6; i++) {
    const xs = i * 220 + 90 - off + pan;
    K.lightPool(s, xs + 30, 168 + dy, 80, "#ffe6f4", { intensity: 0.2, flat: 0.55 });
  }
  s.restore();
  s.restore();
  // a fast truck smears everything along the move (180-degree shutter at 24 fps)
  // the truck smears everything along the move: a short (1/120 s) shutter, so the stripes still read
  smear(g, L.canvas, 0, 0, W, H, vel / 120, vel > 200 ? 5 : 1);
}

// ---- shot 3/4: too loud, then frozen --------------------------------------------------------------------------
// the giant floating calico head: a real calico (kit coat), lit by the sky from above and rimmed by the
// low sun from below/behind; the neck dissolves (glitter covers the cut). Built once.
function headSprite(gray) {
  if (gray) {
    // the frozen (drained) version: the same head, fully desaturated, alpha preserved
    return K.sprite("f15:bighead:gray", 420, 330, (s) => {
      s.drawImage(headSprite(), 0, 0, 420, 330);
      s.globalCompositeOperation = "saturation";
      s.fillStyle = "#808080";
      s.fillRect(0, 0, 420, 330);
      s.globalCompositeOperation = "destination-in";
      s.drawImage(headSprite(), 0, 0, 420, 330);
    });
  }
  return K.sprite("f15:bighead", 420, 330, (s) => {
    const S = 300;
    const L = K.layer(420, 600, "f15:headtmp");
    K.drawCat(L.g, 210 - S * 0.26, 560, S, {
      pose: "sit", headTurn: 1, t: 0, autoBlink: false, blink: 0, coat: K.COATS.calico, pupil: 1, collar: false, shadow: false,
      key: { x: 120, y: -200, color: "#e6f4ff", strength: 1.0 }, rim: { x: 260, y: 900, color: "#ffb090", strength: 1.5 },
      fill: "#6a5aa0", ambient: "#b0a0e0", ambientK: 0.2, backlit: 0.35,
    });
    L.g.save();
    L.g.globalCompositeOperation = "destination-out";
    const fg = L.g.createLinearGradient(0, 168, 0, 216);
    fg.addColorStop(0, "rgba(0,0,0,0)");
    fg.addColorStop(1, "rgba(0,0,0,1)");
    L.g.fillStyle = fg;
    L.g.fillRect(0, 168, 420, 600 - 168);
    L.g.restore();
    const c = scratchCanvas(420, 330), x = c._g;
    x.drawImage(L.canvas, 0, 0, L.canvas.width, L.canvas.height * (330 / 600), 0, 0, 420, 330);
    // light: the low sun is BELOW and behind the head -> a warm rim along the jaw and cheek fur; the upper
    // half faces the open sky and goes cool and a touch darker (no sun on it)
    x.globalCompositeOperation = "source-atop";
    const cool = x.createLinearGradient(0, 20, 0, 200);
    cool.addColorStop(0, "rgba(70,96,170,0.26)"); cool.addColorStop(0.55, "rgba(90,110,180,0.08)"); cool.addColorStop(1, "rgba(90,110,180,0)");
    x.fillStyle = cool; x.fillRect(0, 0, 420, 330);
    const warm = x.createLinearGradient(0, 120, 0, 230);
    warm.addColorStop(0, "rgba(255,150,110,0)"); warm.addColorStop(1, "rgba(255,150,110,0.22)");
    x.fillStyle = warm; x.fillRect(0, 0, 420, 330);
    // aerial perspective: it is far off in the sky, so 20% of the sky colour is scattered in front of it
    // (lower contrast, lifted blacks, a lilac-blue cast)
    x.fillStyle = "rgba(168,176,228,0.2)";
    x.fillRect(0, 0, 420, 330);
    x.globalCompositeOperation = "lighter";
    x.globalAlpha = 0.8;
    x.drawImage(edgeBand(c, 0, -5, "#ffa878", 3), 0, 0, 420, 330);
    x.globalAlpha = 0.6;
    x.drawImage(edgeBand(c, 0, -1.4, "#ffd0b0", 0.6), 0, 0, 420, 330);
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
    // a soft, slightly defocused edge (it is far behind the focus plane) instead of a cut-out alpha
    if (K.hasFilter()) s.filter = "blur(1.1px)";
    s.drawImage(c, 0, 0, 420, 330);
    s.filter = "none";
  });
}
// the head's eye catchlights (sprite space): stamped per frame as near-white points so the lens blooms them
const HEAD_EYES = [[203, 84], [258, 84]];
// a small running cat, pre-rendered per gait phase (8 frames) so the motion-blurred fly-bys stay cheap
function flySprite(i, f) {
  return K.sprite("f15:fly" + i + ":" + f, 90, 64, (s) => {
    K.drawCat(s, 45, 50, 28, {
      pose: "run", phase: f / 8, facing: 1, t: 1, coat: [K.COATS.grey, K.COATS.black, K.COATS.siamese][i], collar: false, shadow: false,
      key: { x: 45, y: -200, color: "#e6f4ff", strength: 1 }, rim: { x: 45, y: 400, color: "#ffb090", strength: 1.2 },
    });
  });
}
function loudScene(g, W, H, tt, frozen) {
  const pulse = frozen ? 0 : beatPulse(tt);
  plain(g, W, H, tt, { speed: 2.4, pulse });
  // giant floating calico head drifting across the sky
  const hp = K.seg(tt, 16, 31);
  const hx = K.lerp(1180, 200, hp), hy = 165 + Math.sin(tt * 0.9) * 14;
  g.save();
  g.translate(hx, hy);
  g.rotate(Math.sin(tt * 0.7) * 0.12 - 0.05);
  const sc = 1.05 + pulse * 0.03;
  g.scale(sc, sc);
  g.drawImage(headSprite(), -210, -135, 420, 330);
  // frozen: the head drains with everything else (its own grey copy, so it never reads more saturated)
  if (frozen) { g.globalAlpha = 0.55; g.drawImage(headSprite(true), -210, -135, 420, 330); g.globalAlpha = 1; }
  // wet catchlights of the low sun in both eyes (near-white: the lens blooms them)
  for (const [ex, ey] of HEAD_EYES) { K.glow(g, ex - 210 + 3, ey - 135 + 4, 9, "#ffd8c0", 0.5); K.glow(g, ex - 210 + 3, ey - 135 + 4, 2.6, "#ffffff", 0.95); }
  // the neck dissolves into drifting glints below the chin
  for (let i = 0; i < 26; i++) {
    const fall = ((K.hash(i, 61) + tt * 0.35 * (0.6 + K.hash(i, 62) * 0.8)) % 1);
    const gx = -20 + (K.hash(i, 63) - 0.5) * 150 * (1 - fall * 0.4);
    const gy = 40 + fall * 120;
    glint(g, gx, gy, 1.6 + K.hash(i, 64) * 2.2, (1 - fall) * (0.5 + 0.5 * Math.sin(tt * 8 + i)), PAL[i % PAL.length]);
  }
  g.restore();
  // floating chrome
  const bob = (i) => Math.sin(tt * 1.3 + i * 2) * 10;
  chromeSphere(g, 700, 196 + bob(2), 18, 318);
  chromeSphere(g, 120 + tt * 4, 220 + bob(0), 40, 340);
  chromeSphere(g, 300, 430 + bob(3), 26, 520);
  chromeSphere(g, 820, 330 + bob(1), 52, 470);
  // flying cats zipping across, motion-blurred along their path
  for (let i = 0; i < 3; i++) {
    const st = 16.5 + i * 3.4;
    const u = (tt - st) / 2.4;
    if (u < 0 || u > 1) continue;
    const dir = i % 2 ? -1 : 1;
    const x = dir > 0 ? K.lerp(-80, 1040, u) : K.lerp(1040, -80, u);
    const y = 90 + i * 70 + Math.sin(u * 8) * 12;
    const spr = flySprite(i, Math.floor(((tt * 3) % 1) * 8));
    g.save();
    g.translate(x, y + 14);
    g.scale(dir, 1);
    smear(g, spr, -45, -50, 90, 64, -(1120 / 2.4) / 48 * 1.4, 5);
    g.restore();
  }
  // expanding ring of glitter (specular glints - the lens turns them into stars)
  const rp = K.seg(tt, 22, 28.5);
  if (rp > 0 && rp < 1) {
    const R = K.ease.out(rp) * 720;
    const al = 1 - rp;
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * TAU + K.hash(i, 5) * 0.06;
      const rr = R * (0.92 + K.hash(i + 0.3, 5) * 0.16);
      glint(g, hx + Math.cos(a) * rr, hy + 40 + Math.sin(a) * rr * 0.7, 2 + K.hash(i, 6) * 3, al * (0.5 + 0.5 * Math.sin(tt * 9 + i)), PAL[i % PAL.length]);
    }
  }
  // foil confetti: each flake's brightness follows its tumble (a mirror flash when it faces the sun)
  for (let i = 0; i < 40; i++) {
    const x = (K.hash(i, 31) * 1100 + Math.sin(tt * 1.5 + i) * 30) - 70;
    const y = ((K.hash(i + 0.4, 31) * 640 + tt * (60 + K.hash(i, 32) * 80)) % 640) - 60;
    const fl = Math.cos(tt * 4 + i);
    const lit = Math.abs(fl);
    g.save();
    g.translate(x, y);
    g.rotate(tt * (2 + i % 4) + i);
    g.scale(fl, 1);
    g.fillStyle = lit > 0.94 ? "#fff4fa" : K.mix(K.shade(PAL[i % PAL.length], -0.55), PAL[i % PAL.length], lit);
    g.globalAlpha = 0.9;
    g.fillRect(-4, -2, 8, 4);
    g.restore();
  }
  // the kid in the middle, hands over the ears
  kidEars(g, 410, 452, 220, tt, { shake: !frozen, frozen });
}

// ---- shots 5/6: the frozen mall ---------------------------------------------------------------------------
const F = 430, CX = 480, CY = 262;
const HW = 16, HT = 26, END = 70;
const SHOPS = ["MEOWLL", "PURRFUME", "CATNIP CAFE", "LITTER RECORDS", "NAP SHOP", "TUNA TOWN", "WHISKER ARCADE",
  "YARN BARN", "PAWN SHOP", "BOX DEPOT", "HISS N HERS", "LASER DOT", "FISH TANK", "9 LIVES"];
const SIGN_COLS = ["#ff4fd8", "#7af7ff", "#fff27a", "#b47aff", "#ff9a5a", "#7affb0", "#ff4fd8"];
function quadPath(a, b, c, d) {
  const p = new Path2D();
  p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); p.lineTo(c[0], c[1]); p.lineTo(d[0], d[1]); p.closePath();
  return p;
}
// a galvanised roller shutter, flat (128 x 256 = one storefront): every slat a little curved strip - lit top
// lip, body falling into shade, a black gap - with grime and rust creeping up the lower slats and a few
// rain streaks. Mapped onto the walls in perspective strips.
function shutterTex() {
  return K.sprite("f15:shutterTex", 128, 256, (s) => {
    const n = 18, sh = 246 / n;
    for (let k = 0; k < n; k++) {
      const y = k * sh;
      const sg = s.createLinearGradient(0, y, 0, y + sh);
      sg.addColorStop(0, "#b4b0c2"); sg.addColorStop(0.12, "#9894a8"); sg.addColorStop(0.55, "#6e6a7e"); sg.addColorStop(0.86, "#4a4658"); sg.addColorStop(0.9, "#121016"); sg.addColorStop(1, "#1c1a22");
      s.fillStyle = sg;
      s.fillRect(0, y, 128, sh);
    }
    s.fillStyle = "#24222c"; s.fillRect(0, 246, 128, 10);
    s.fillStyle = "#8a8698"; s.fillRect(0, 246, 128, 1.2);
    // brushed metal: fine horizontal streaks
    K.texRect(s, "metal", 0, 0, 128, 246, { scale: 128, scaleY: 40, alpha: 0.35, mode: "soft-light", tex: { seed: 7 } });
    // grime + rust: fbm-masked, heavier toward the bottom
    const rust = scratchCanvas(128, 256), rg = rust._g;
    const rgr = rg.createLinearGradient(0, 80, 0, 256);
    rgr.addColorStop(0, "rgba(110,60,34,0)"); rgr.addColorStop(0.6, "rgba(110,60,34,0.55)"); rgr.addColorStop(1, "rgba(80,44,26,0.85)");
    rg.fillStyle = rgr; rg.fillRect(0, 0, 128, 256);
    rg.globalCompositeOperation = "destination-in";
    rg.drawImage(fbmMask("rust", 64, 128, 5, 9, 33, 0.4, 0.75), 0, 0, 128, 256);
    s.drawImage(rust, 0, 0, 128, 256);
    const grime = s.createLinearGradient(0, 160, 0, 256);
    grime.addColorStop(0, "rgba(20,14,18,0)"); grime.addColorStop(1, "rgba(20,14,18,0.45)");
    s.fillStyle = grime; s.fillRect(0, 160, 128, 96);
    // rain streaks from the top rail
    const R = K.rng("f15-streaks");
    for (let i = 0; i < 9; i++) {
      const x = R() * 128, len = 40 + R() * 160;
      const st = s.createLinearGradient(0, 0, 0, len);
      st.addColorStop(0, "rgba(30,24,30,0.35)"); st.addColorStop(1, "rgba(30,24,30,0)");
      s.fillStyle = st; s.fillRect(x, 0, 1 + R() * 2.5, len);
    }
  });
}
// draw the shutter texture onto the wall X between z0..z1, height 0..top: an n x m grid of affine cells
// (each cell's top and left edges are exact, so the converging slats stay continuous across the wall)
function wallTex(g, P, img, X, z0, z1, top, n, m = 4) {
  const iw = img.width, ih = img.height;
  for (let i = 0; i < n; i++) {
    const za = K.lerp(z0, z1, i / n), zb = K.lerp(z0, z1, (i + 1) / n);
    const a = P(X, top, za), b = P(X, top, zb), ab = P(X, 0, za), bb = P(X, 0, zb);
    for (let j = 0; j < m; j++) {
      const v0 = j / m, v1 = (j + 1) / m;
      const tlx = K.lerp(a[0], ab[0], v0), tly = K.lerp(a[1], ab[1], v0);
      const trx = K.lerp(b[0], bb[0], v0), try_ = K.lerp(b[1], bb[1], v0);
      const blx = K.lerp(a[0], ab[0], v1), bly = K.lerp(a[1], ab[1], v1);
      g.save();
      g.transform(trx - tlx, try_ - tly, blx - tlx, bly - tly, tlx, tly);
      // overlap a hair to hide seams
      g.drawImage(img, (i / n) * iw, v0 * ih, iw / n, ih / m, 0, 0, 1.03, 1.03);
      g.restore();
    }
  }
}
// the dark warm room behind the end shutter, seen through a shallow depth of field: shelves with jars,
// three cats sitting in candlelight (silhouettes with warm rims), the candles themselves as soft bokeh
function shopInteriorSprite() {
  return K.sprite("f15:shop", 340, 320, (s) => {
    const c = scratchCanvas(340, 320), x = c._g;
    const bg = x.createLinearGradient(0, 0, 0, 320);
    bg.addColorStop(0, "#0c0503"); bg.addColorStop(0.55, "#2a1206"); bg.addColorStop(1, "#140802");
    x.fillStyle = bg; x.fillRect(0, 0, 340, 320);
    K.texRect(x, "plaster", 0, 0, 340, 230, { scale: 160, alpha: 0.25, tint: "#5a2a10", tintAlpha: 0.8, tex: { seed: 15 } });
    // candle glow on the back wall (warm, low, flickering per frame on top)
    K.lightPool(x, 170, 205, 230, "#ff8a30", { intensity: 0.9 });
    K.lightPool(x, 170, 200, 90, "#ffc070", { intensity: 0.5 });
    // shelves: dark planks with a warm top edge and rows of jars / boxes as silhouettes
    for (const [y, x0, x1] of [[92, 20, 150], [92, 196, 320], [150, 30, 140], [150, 206, 310]]) {
      x.fillStyle = "#1a0c06"; x.fillRect(x0, y, x1 - x0, 6);
      x.fillStyle = "rgba(255,170,90,0.35)"; x.fillRect(x0, y, x1 - x0, 1);
      const R = K.rng("f15-shelf" + y + x0);
      for (let px = x0 + 4; px < x1 - 8;) {
        const w = 6 + R() * 12, h = 10 + R() * 22;
        x.fillStyle = K.mix("#120804", "#3a1c0c", R());
        if (R() < 0.5) { x.beginPath(); x.ellipse(px + w / 2, y - h / 2, w / 2, h / 2, 0, 0, TAU); x.fill(); }
        else x.fillRect(px, y - h, w, h);
        x.fillStyle = "rgba(255,150,70,0.25)"; x.fillRect(px + w * 0.6, y - h * 0.9, 1.2, h * 0.7);
        px += w + 2 + R() * 6;
      }
    }
    // floorboards
    x.fillStyle = "#1c0c04"; x.fillRect(0, 238, 340, 82);
    K.texRect(x, "wood", 0, 238, 340, 82, { scale: 200, scaleY: 40, alpha: 0.5, tint: "#3a1a08", tintAlpha: 0.7, tex: { seed: 15 } });
    K.lightPool(x, 170, 250, 200, "#ffa040", { intensity: 0.6, flat: 0.3 });
    // cats waiting in the candlelight: dark shapes, rimmed warm by the flames between them
    const cats = [[92, 248, 40, 1, K.COATS.black], [250, 250, 46, -1, K.COATS.grey], [178, 92, 26, 1, K.COATS.calico]];
    for (const [cx, cy, sz, f, coat] of cats) {
      K.drawCat(x, cx, cy, sz, {
        pose: "sit", facing: f, headTurn: 0.4, t: 3, autoBlink: false, blink: 0.1, collar: false, shadow: false, coat, eyesGlow: 0.25,
        key: { x: 170 - cx, y: -30, color: "#ffb060", strength: 0.9 }, rim: { x: 170 - cx, y: 20, color: "#ffc070", strength: 1.6 },
        fill: "#1a0a04", ambient: "#2a1206", ambientK: 0.5, backlit: 0.8,
      });
      K.shadowBlob(x, cx, cy + 1, sz * 0.55, sz * 0.08, { alpha: 0.6, color: "#060201" });
    }
    // the shallow depth of field: everything back here is soft
    if (K.hasFilter()) s.filter = "blur(2.2px)";
    s.drawImage(c, 0, 0, 340, 320);
    s.filter = "none";
    // candle flames, out of focus: soft discs with brighter rims (bokeh), white-hot centres for the lens
    const L = [];
    for (let i = 0; i < 9; i++) L.push({ x: 64 + i * 27 + (i % 2) * 6, y: 222 - (i % 3) * 6, r: 5.5 + (i % 3) * 1.6, color: i % 2 ? "#ffb050" : "#ff9a3a" });
    K.bokehLights(s, 340, 320, 0, { lights: L, count: 0, alpha: 0.6 });
    // the flames' hot cores still burn through the blur (the lens blooms them)
    for (const p of L) K.glow(s, p.x, p.y, p.r * 0.35, "#ffe6b0", 0.55);
  });
}
const PATS = new WeakMap();
function maskPattern(g, img) {
  let m = PATS.get(g);
  if (!m) { m = new Map(); PATS.set(g, m); }
  let p = m.get(img);
  if (!p) { p = g.createPattern(img, "repeat"); m.set(img, p); }
  return p;
}
function mallScene(g, W, H, t, camZ, camY, o) {
  const P = (X, Y, Z) => { const z = Math.max(0.35, Z - camZ); return [CX + X * F / z, CY + (camY - Y) * F / z, F / z]; };
  const near = camZ + 0.4;
  const open = o.open || 0;
  // ---- shell: back wall, ceiling with skylights
  g.fillStyle = "#1a1220";
  g.fillRect(-W, -H, W * 3, H * 3);
  const bwP = quadPath(P(-HW, HT, END), P(HW, HT, END), P(HW, 0, END), P(-HW, 0, END));
  const bs = P(0, 0, END)[2];
  K.texFill(g, "plaster", bwP, { scale: bs * 10, tint: "#6a5a7a", tintAlpha: 0.75, tex: { seed: 15 } });
  const bwT = P(0, HT, END)[1], bwB = P(0, 0, END)[1];
  const bwl = g.createLinearGradient(0, bwT, 0, bwB);
  bwl.addColorStop(0, "rgba(24,16,32,0.55)"); bwl.addColorStop(0.25, "rgba(24,16,32,0.1)"); bwl.addColorStop(1, "rgba(24,16,32,0.5)");
  g.fillStyle = bwl; g.fill(bwP);
  const ceil = quadPath(P(-HW, HT, near), P(HW, HT, near), P(HW, HT, END), P(-HW, HT, END));
  const cg = g.createLinearGradient(0, 0, 0, P(0, HT, END)[1]);
  cg.addColorStop(0, "#0a0a12"); cg.addColorStop(1, "#262836");
  g.fillStyle = cg; g.fill(ceil);
  // ceiling coffers between the skylights catch a little bounce
  for (let z = Math.ceil(near / 10) * 10; z < END; z += 10) {
    const a = P(-HW, HT, z), b = P(HW, HT, z);
    g.strokeStyle = "rgba(90,96,120,0.35)"; g.lineWidth = Math.max(0.6, a[2] * 0.25);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
  // the long fluorescent skylights: cool white (about 6500 K against the amber of the prints)
  for (const X of [-6, 6]) {
    const p = quadPath(P(X - 0.7, HT, near + 0.1), P(X + 0.7, HT, near + 0.1), P(X + 0.7, HT, END), P(X - 0.7, HT, END));
    g.fillStyle = "#eef6ff"; g.fill(p);
    // the diffuser glow spilling onto the ceiling either side
    const q0 = P(X, HT, near + 2), q1 = P(X, HT, END);
    g.save(); g.globalCompositeOperation = "lighter"; g.lineCap = "round";
    g.strokeStyle = "rgba(170,200,255,0.12)"; g.lineWidth = Math.max(2, q0[2] * 4);
    g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.stroke();
    g.restore();
  }
  // ---- floor: polished marble checker that mirrors the hall
  const floorP = quadPath(P(-HW, 0, near), P(HW, 0, near), P(HW, 0, END), P(-HW, 0, END));
  g.fillStyle = "#221a28"; g.fill(floorP);
  const pA = new Path2D();
  const TS = 4;
  for (let zi = Math.max(0, Math.floor(near / TS)); zi < END / TS; zi++) {
    const z0 = Math.max(near, zi * TS), z1 = (zi + 1) * TS;
    for (let xi = -4; xi < 4; xi++) {
      if ((xi + zi + 100) % 2) continue;
      const a = P(xi * TS, 0, z0), b = P(xi * TS + TS, 0, z0), c = P(xi * TS + TS, 0, z1), d = P(xi * TS, 0, z1);
      pA.moveTo(a[0], a[1]); pA.lineTo(b[0], b[1]); pA.lineTo(c[0], c[1]); pA.lineTo(d[0], d[1]); pA.closePath();
    }
  }
  g.fillStyle = "#666070"; g.fill(pA);
  K.texFill(g, "granite", floorP, { scale: 260, scaleY: 90, alpha: 0.4, mode: "soft-light", tex: { seed: 6 } });
  const nearY = P(0, 0, near)[1], farY = P(0, 0, END)[1];
  const fo = g.createLinearGradient(0, farY, 0, Math.min(nearY, H + 200));
  fo.addColorStop(0, "rgba(16,10,22,0)"); fo.addColorStop(0.35, "rgba(16,10,22,0.12)"); fo.addColorStop(1, "rgba(16,10,22,0.55)");
  g.fillStyle = fo; g.fill(floorP);
  // ---- floor reflections: skylights, pillars and storefront strips, mirrored (geometry at -Y), drawn into
  // their own layer and then broken up by a roughness map (the marble is honed, not a mirror: polished
  // tiles give a clear image, worn patches scatter it)
  const RL = K.layer(W, H, "f15:mallrefl");
  const r = RL.g;
  r.setTransform(g.getTransform());
  for (const X of [-6, 6]) {
    const m = quadPath(P(X - 0.9, -HT, near + 0.1), P(X + 0.9, -HT, near + 0.1), P(X + 0.9, -HT, END), P(X - 0.9, -HT, END));
    r.fillStyle = "rgba(220,236,255,0.32)"; r.fill(m);
  }
  for (const side of [-1, 1]) {
    const X = side * HW, Xi = X - side * 1.2;
    for (let s = 6; s >= 0; s--) {
      const zp = s * 10;
      if (zp <= near) continue;
      const base = P(Xi, 0, zp - 0.7), tip = P(Xi, -HT * 0.55, zp - 0.7);
      const rg = r.createLinearGradient(0, base[1], 0, tip[1]);
      rg.addColorStop(0, "rgba(200,186,220,0.42)"); rg.addColorStop(1, "rgba(200,186,220,0)");
      r.fillStyle = rg;
      r.fill(quadPath(P(Xi, -HT * 0.55, zp - 0.7), P(X, -HT * 0.55, zp - 0.7), P(X, 0, zp - 0.7), P(Xi, 0, zp - 0.7)));
      r.fill(quadPath(P(Xi, -HT * 0.55, zp - 0.7), P(Xi, -HT * 0.55, zp + 0.7), P(Xi, 0, zp + 0.7), P(Xi, 0, zp - 0.7)));
    }
  }
  r.setTransform(1, 0, 0, 1, 0, 0);
  r.globalCompositeOperation = "destination-in";
  r.fillStyle = maskPattern(r, fbmMask("marble", 96, 96, 6, 6, 12, 0.25, 0.7));
  r.fillRect(0, 0, RL.canvas.width, RL.canvas.height);
  r.globalCompositeOperation = "source-over";
  g.save();
  g.clip(floorP);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = 0.55;
  g.drawImage(RL.canvas, 0, 0);
  g.restore();
  // ---- side walls + storefronts + pillars, far to near so the nearer pieces overlap correctly
  const shutTex = shutterTex();
  for (const side of [-1, 1]) {
    const X = side * HW;
    const wallP = quadPath(P(X, HT, near), P(X, HT, END), P(X, 0, END), P(X, 0, near));
    g.fillStyle = "#2a2232"; g.fill(wallP);
    K.texFill(g, "plaster", wallP, { scale: 160, alpha: 0.35, mode: "soft-light", tex: { seed: 15 } });
    for (let s = 6; s >= 0; s--) {
      const za = s * 10, zb = za + 10;
      if (zb < near) continue;
      const z0 = Math.max(near, za + 1.2), z1 = zb - 1.2;
      const si = s + (side > 0 ? 7 : 0);
      const sc = SIGN_COLS[(s + (side > 0 ? 3 : 0)) % SIGN_COLS.length];
      const lit = K.hash(si, 72) < 0.45; // most signs are dead tubes; a few still glow
      const eCol = si % 2 ? "#ffcf8a" : "#9be7ff";
      if (z1 > z0) {
        const shut = K.hash(si, 71) < 0.5;
        const front = quadPath(P(X, 12.2, z0), P(X, 12.2, z1), P(X, 0, z1), P(X, 0, z0));
        if (shut) {
          g.fillStyle = "#2a2832"; g.fill(front);
          // the shutter texture in perspective (more strips when it is close and big)
          const big = P(X, 0, z0)[2];
          wallTex(g, P, shutTex, X, z0, z1, 12.2, big > 30 ? 10 : big > 12 ? 6 : 3, big > 30 ? 18 : big > 12 ? 9 : big > 6 ? 6 : 3);
        } else {
          // dark shop glass: the dim interior plus the hall's reflections sliding across it
          const gl = g.createLinearGradient(P(X, 0, z0)[0], 0, P(X, 0, z1)[0], 0);
          gl.addColorStop(0, "#141c2a"); gl.addColorStop(0.5, "#22344a"); gl.addColorStop(1, "#0e1622");
          g.fillStyle = gl; g.fill(front);
          g.save(); g.clip(front);
          g.globalCompositeOperation = "lighter";
          for (let k = 0; k < 3; k++) {
            const q = P(X, 0, K.lerp(z0, z1, 0.15 + k * 0.3)), rr = P(X, 12.2, K.lerp(z0, z1, 0.3 + k * 0.3));
            g.strokeStyle = "rgba(200,220,255,0.07)"; g.lineWidth = Math.max(1, q[2] * 1.2);
            g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(rr[0], rr[1]); g.stroke();
          }
          g.restore();
        }
        // the strip light above washes down the face of the shutter / glass and fades
        const wt = P(X, 12.2, (z0 + z1) / 2), wb = P(X, 6, (z0 + z1) / 2);
        const wg = g.createLinearGradient(0, wt[1], 0, wb[1]);
        wg.addColorStop(0, K.rgba(eCol, 0.3)); wg.addColorStop(1, K.rgba(eCol, 0));
        g.save(); g.globalCompositeOperation = "lighter"; g.fillStyle = wg; g.fill(front); g.restore();
        K.aoEdge(g, P(X, 0, z0)[0], P(X, 0, z0)[1], P(X, 0, z1)[0], P(X, 0, z1)[1], { width: Math.max(3, P(X, 0, z0)[2] * 0.8), alpha: 0.45, side: 0 });
        // emissive strip above the storefront: warm and cool alternating (near-white core, lens blooms it)
        const e0 = P(X, 12.5, z0), e1 = P(X, 12.5, z1);
        g.save(); g.lineCap = "round";
        g.globalCompositeOperation = "lighter";
        g.strokeStyle = K.rgba(eCol, 0.3); g.lineWidth = Math.max(1, e0[2] * 0.7); g.beginPath(); g.moveTo(e0[0], e0[1]); g.lineTo(e1[0], e1[1]); g.stroke();
        g.globalCompositeOperation = "source-over";
        g.strokeStyle = K.mix(eCol, "#ffffff", 0.85); g.lineWidth = Math.max(0.5, e0[2] * 0.16); g.stroke();
        g.restore();
        // the shop sign: dark backing board with neon lettering, mapped onto the wall
        const zA = side < 0 ? z0 + 0.6 : z1 - 0.6, zB = side < 0 ? z1 - 0.6 : z0 + 0.6;
        const sa = P(X, 15.6, zA), sb = P(X, 15.6, zB), sd = P(X, 12.9, zA);
        g.fillStyle = "#15101c"; g.fill(quadPath(sa, sb, P(X, 12.9, zB), sd));
        g.save();
        g.transform(sb[0] - sa[0], sb[1] - sa[1], sd[0] - sa[0], sd[1] - sa[1], sa[0], sa[1]);
        g.scale(1 / 200, 1 / 40);
        g.drawImage(signSprite(si % SHOPS.length, lit ? sc : null), 0, 0, 200, 40);
        g.restore();
        const mid = P(X, 14.2, (z0 + z1) / 2);
        if (lit) {
          K.glow(g, mid[0], mid[1], mid[2] * 6, sc, 0.35);
          K.lightPool(g, P(X * 0.85, 0, (z0 + z1) / 2)[0], P(X * 0.85, 0, (z0 + z1) / 2)[1], mid[2] * 5, sc, { intensity: 0.22, flat: 0.3 });
        }
        // the strip's own pool on the marble in front of the shop (its colour temperature with it)
        const fp = P(X * 0.82, 0, (z0 + z1) / 2);
        K.lightPool(g, fp[0], fp[1], mid[2] * 7, eCol, { intensity: 0.16, flat: 0.28 });
        // floor reflection of the sign / strip: a broken vertical streak on the polished marble
        const rf = P(X * 0.86, 0, (z0 + z1) / 2);
        K.reflectStreak(g, rf[0], rf[1], mid[2] * 8, lit ? sc : eCol, lit ? 0.4 : 0.2, { t: 0, width: mid[2] * 2.2 });
      }
      // pillar: plaster, lit from the skylights above, occluded where it meets the floor AND the ceiling
      const zp = za;
      if (zp > near) {
        const Xi = X - side * 1.2;
        const fA = P(Xi, HT, zp - 0.7), fB = P(Xi, HT, zp + 0.7), fC = P(Xi, 0, zp + 0.7), fD = P(Xi, 0, zp - 0.7);
        const sideP = quadPath(fA, fB, fC, fD);
        const frontP = quadPath(P(Xi, HT, zp - 0.7), P(X, HT, zp - 0.7), P(X, 0, zp - 0.7), P(Xi, 0, zp - 0.7));
        // its soft occlusion shadow spreading on the floor round the foot
        K.shadowBlob(g, (fD[0] + P(X, 0, zp - 0.7)[0]) / 2, fD[1], fD[2] * 1.6, fD[2] * 0.35, { alpha: 0.5, soft: 1.2, color: "#08040c" });
        const pg = g.createLinearGradient(0, fA[1], 0, fD[1]);
        pg.addColorStop(0, "#9890b0"); pg.addColorStop(0.45, "#86789a"); pg.addColorStop(1, "#54486a");
        g.fillStyle = pg; g.fill(sideP);
        const fg2 = g.createLinearGradient(0, fA[1], 0, fD[1]);
        fg2.addColorStop(0, "#c0b8d8"); fg2.addColorStop(0.45, "#a296b8"); fg2.addColorStop(1, "#665a7c");
        g.fillStyle = fg2; g.fill(frontP);
        K.texFill(g, "plaster", sideP, { scale: Math.max(40, fA[2] * 6), alpha: 0.5, mode: "soft-light", tex: { seed: 15 } });
        K.texFill(g, "plaster", frontP, { scale: Math.max(40, fA[2] * 6), alpha: 0.5, mode: "soft-light", tex: { seed: 15 } });
        // the strip lights either side tint the pillar faces with their colour temperature
        g.save(); g.globalCompositeOperation = "soft-light"; g.globalAlpha = 0.35;
        g.fillStyle = s % 2 ? "#ffb070" : "#90c8ff"; g.fill(sideP); g.restore();
        K.aoEdge(g, fD[0], fD[1], fC[0], fC[1], { width: Math.max(4, fA[2] * 1.4), alpha: 0.5, side: 1 });
        K.aoEdge(g, fA[0], fA[1], fB[0], fB[1], { width: Math.max(4, fA[2] * 1.6), alpha: 0.55, side: -1 });
        const fT0 = P(Xi, HT, zp - 0.7), fT1 = P(X, HT, zp - 0.7), fB0 = P(Xi, 0, zp - 0.7), fB1 = P(X, 0, zp - 0.7);
        K.aoEdge(g, fT0[0], fT0[1], fT1[0], fT1[1], { width: Math.max(4, fA[2] * 1.6), alpha: 0.55, side: side > 0 ? -1 : 1 });
        K.aoEdge(g, fB0[0], fB0[1], fB1[0], fB1[1], { width: Math.max(4, fA[2] * 1.4), alpha: 0.5, side: side > 0 ? 1 : -1 });
        // the rounded arris between the two faces catches the skylight as a soft vertical highlight
        const eT = P(Xi, HT, zp - 0.7), eB = P(Xi, 0, zp - 0.7);
        const eg = g.createLinearGradient(0, eT[1], 0, eB[1]);
        eg.addColorStop(0, "rgba(236,240,255,0.55)"); eg.addColorStop(0.6, "rgba(236,240,255,0.2)"); eg.addColorStop(1, "rgba(236,240,255,0)");
        g.strokeStyle = eg; g.lineWidth = Math.max(0.8, eT[2] * 0.12);
        g.beginPath(); g.moveTo(eT[0], eT[1]); g.lineTo(eB[0], eB[1]); g.stroke();
        // grime and scuffs collect at the foot
        const gT = P(Xi, 2.2, zp - 0.7);
        const gg = g.createLinearGradient(0, gT[1], 0, fD[1]);
        gg.addColorStop(0, "rgba(30,22,36,0)"); gg.addColorStop(1, "rgba(30,22,36,0.45)");
        g.fillStyle = gg; g.fill(frontP); g.fill(sideP);
      }
    }
    K.aoEdge(g, P(X, 0, near)[0], P(X, 0, near)[1], P(X, 0, END)[0], P(X, 0, END)[1], { width: 14, alpha: 0.45, side: 0 });
    K.aoEdge(g, P(X, HT, near)[0], P(X, HT, near)[1], P(X, HT, END)[0], P(X, HT, END)[1], { width: 18, alpha: 0.5, side: 0 });
  }
  // ---- the end shop: frame + shutter + (when it rolls up) the warm room behind
  const sf = quadPath(P(-11, 20, END - 0.02), P(11, 20, END - 0.02), P(11, 0, END - 0.02), P(-11, 0, END - 0.02));
  g.fillStyle = "#16101e"; g.fill(sf);
  const doorTop = 16, doorX = 8.5;
  const iTop = P(-doorX, doorTop, END), iBot = P(doorX, 0, END);
  const cw = iBot[0] - iTop[0], chh = iBot[1] - iTop[1];
  if (open > 0) {
    g.save();
    g.beginPath(); g.rect(iTop[0], iTop[1], cw, chh); g.clip();
    g.drawImage(shopInteriorSprite(), iTop[0], iTop[1], cw, chh);
    // the candles breathe: the whole room's light flickers a little
    const fl = 0.85 + 0.15 * K.noise(t * 5, 7);
    K.lightPool(g, iTop[0] + cw / 2, iTop[1] + chh * 0.68, cw * 0.7, "#ff8a30", { intensity: 0.35 * fl });
    K.dust(g, W, H, t, { seed: 8, color: "#ffcf6a", count: 22, size: 0.55, area: [iTop[0], iTop[1], cw, chh], alpha: 0.6 });
    g.restore();
  }
  // the end shutter (rolls up into its drum)
  const shBot = K.lerp(0, doorTop, open);
  if (shBot < doorTop - 0.01) {
    g.fillStyle = "#2a2832";
    const a0 = P(-doorX, doorTop, END), b0 = P(doorX, shBot, END);
    g.fillRect(a0[0], a0[1], b0[0] - a0[0], b0[1] - a0[1]);
    // the slats roll up: the texture slides up with the bottom bar
    const img = shutTex, frac = (doorTop - shBot) / doorTop;
    g.drawImage(img, 0, img.height * (1 - frac), img.width, img.height * frac, a0[0], a0[1], b0[0] - a0[0], b0[1] - a0[1]);
    // warm light leaking under the shutter (a full-value amber line: it is a light)
    if (shBot < 0.6) {
      const lk = 1 - shBot / 0.6;
      g.fillStyle = K.rgba("#ffd08a", 0.95 * lk);
      g.fillRect(a0[0] + a0[2] * 0.3, b0[1], b0[0] - a0[0] - a0[2] * 0.6, Math.max(1, a0[2] * 0.12));
      K.lightPool(g, (a0[0] + b0[0]) / 2, b0[1] + a0[2], (b0[0] - a0[0]) * 0.55, "#ffa040", { intensity: 0.5 * lk, flat: 0.12 });
    }
  }
  // the drum box above the door: a steel cylinder that fattens as the slats wind onto it, with a
  // specular streak from the skylights and the warm room's light catching its underside once open
  {
    const rD = 0.75 + open * 0.95;
    const d0 = P(-doorX - 0.4, doorTop + rD * 2, END - 0.3), d1 = P(doorX + 0.4, doorTop, END - 0.3);
    const dg = g.createLinearGradient(0, d0[1], 0, d1[1]);
    dg.addColorStop(0, "#1a1820"); dg.addColorStop(0.28, "#8a8898"); dg.addColorStop(0.36, "#d8dcea"); dg.addColorStop(0.48, "#6a6878"); dg.addColorStop(0.85, "#24222c");
    dg.addColorStop(1, open > 0 ? K.mix("#24222c", "#ff9a4a", open * 0.8) : "#24222c");
    g.fillStyle = dg; g.fillRect(d0[0], d0[1], d1[0] - d0[0], d1[1] - d0[1]);
    g.save(); g.globalCompositeOperation = "lighter";
    g.fillStyle = "rgba(220,236,255,0.35)"; g.fillRect(d0[0] + 2, K.lerp(d0[1], d1[1], 0.33), d1[0] - d0[0] - 4, Math.max(1, d0[2] * 0.08));
    g.restore();
    K.aoEdge(g, d0[0], d1[1], d1[0], d1[1], { width: Math.max(3, d0[2] * 0.6), alpha: 0.5, side: -1 });
  }
  // the shop's light pouring out: a warm shaft across the hall floor toward the camera (additive, soft
  // edged, falling off with distance from the door) with dust turning in it, plus haze in the air
  if (open > 0) {
    const c = P(0, 0, END);
    const zn = Math.max(near + 1, END - 34);
    const s0 = P(-doorX, 0, END), s1 = P(doorX, 0, END), s2 = P(doorX * 1.55, 0, zn), s3 = P(-doorX * 1.55, 0, zn);
    for (const [k, a] of [[1.0, 0.3], [1.25, 0.14], [1.6, 0.07]]) {
      const sh = new Path2D();
      const mx = (s0[0] + s1[0]) / 2;
      sh.moveTo(mx + (s0[0] - mx) * k, s0[1]); sh.lineTo(mx + (s1[0] - mx) * k, s1[1]);
      sh.lineTo(mx + (s2[0] - mx) * k, s2[1]); sh.lineTo(mx + (s3[0] - mx) * k, s3[1]); sh.closePath();
      const sg = g.createLinearGradient(0, s0[1], 0, s2[1]);
      sg.addColorStop(0, K.rgba("#ffb860", a * open)); sg.addColorStop(0.4, K.rgba("#ff9a48", a * 0.55 * open)); sg.addColorStop(1, "rgba(255,140,60,0)");
      g.save(); g.globalCompositeOperation = "lighter"; g.fillStyle = sg; g.fill(sh); g.restore();
      if (k === 1.0) {
        g.save(); g.clip(sh);
        K.dust(g, W, H, t, { seed: 19, color: "#ffd090", count: 40, size: 0.9, area: [s3[0], s0[1] - (s2[1] - s0[1]) * 0.6, s2[0] - s3[0], (s2[1] - s0[1]) * 1.6], alpha: 0.6 * open });
        g.restore();
      }
    }
    K.lightPool(g, c[0], c[1] + c[2] * 2, c[2] * 32, "#ffa848", { intensity: 0.45 * open, flat: 0.3 });
    K.volumetricBeam(g, c[0], P(0, doorTop * 0.6, END)[1], Math.PI / 2, 420, 1.5, { color: "#ffb860", intensity: 0.32 * open, t, seed: 3 });
  }
  // light pools under the skylights (cool) + atmospheric perspective (haze thickens toward the far end)
  for (const X of [-6, 6]) {
    for (let z = Math.ceil(near / 12) * 12 + 6; z < END; z += 12) {
      const q = P(X * 0.8, 0, z);
      K.lightPool(g, q[0], q[1], q[2] * 7, "#dce8ff", { intensity: 0.2, flat: 0.3 });
    }
  }
  const vp = P(0, camY, END + 200);
  const hg = g.createRadialGradient(vp[0], vp[1], 0, vp[0], vp[1], 360);
  hg.addColorStop(0, "rgba(70,64,92,0.42)"); hg.addColorStop(0.45, "rgba(70,64,92,0.18)"); hg.addColorStop(1, "rgba(70,64,92,0)");
  g.fillStyle = hg;
  g.fillRect(vp[0] - 360, vp[1] - 360, 720, 720);
  // the far floor fades into the same haze (no hard checker at the vanishing point)
  const fh = g.createLinearGradient(0, farY, 0, farY + 70);
  fh.addColorStop(0, "rgba(60,56,80,0.5)"); fh.addColorStop(1, "rgba(60,56,80,0)");
  g.save(); g.clip(floorP); g.fillStyle = fh; g.fillRect(-W, farY, W * 3, 70); g.restore();
  // frozen confetti hanging in the air (foil: brightness follows the flake's angle)
  for (let i = 0; i < 60; i++) {
    const Z = 2 + K.hash(i, 41) * 64;
    if (Z < camZ + 6) continue; // nearer flakes would be out-of-focus blurs: leave them out
    const q = P((K.hash(i + 0.3, 41) - 0.5) * 28, 2 + K.hash(i + 0.6, 41) * 20, Z);
    const s = q[2] * 0.24;
    const lit = Math.abs(Math.cos(i * 1.7));
    g.save(); g.translate(q[0], q[1]); g.rotate(i); g.scale(Math.cos(i * 1.7), 1);
    g.fillStyle = lit > 0.95 ? "#f4f0fa" : K.mix(K.shade(PAL[i % PAL.length], -0.5), PAL[i % PAL.length], lit);
    g.fillRect(-s, -s * 0.5, s * 2, s);
    g.restore();
  }
  // a frozen chrome sphere mid-bounce
  const sq = P(-7, 7, 26);
  if (26 > camZ + 1) chromeSphere(g, sq[0], sq[1], sq[2] * 2.2, P(-7, 0, 26)[1]);
  return P;
}
// a shop sign's lettering (cached per shop): lit neon, or a dead grey tube outline
function signSprite(i, col) {
  return K.sprite("f15:sign" + i + ":" + (col || "off"), 200, 40, (s) => {
    s.font = "700 26px Fredoka, sans-serif";
    s.textAlign = "center"; s.textBaseline = "middle";
    const name = SHOPS[i];
    if (col) {
      s.fillStyle = K.mix(col, "#ffffff", 0.75);
      s.fillText(name, 100, 21);
    } else {
      s.lineWidth = 1.4;
      s.strokeStyle = K.rgba(K.mix("#9a8aa8", "#5a5666", 0.7), 0.85);
      s.strokeText(name, 100, 21);
    }
  });
}

function mallPrints(g, P, t, camZ, o) {
  const pts = [];
  for (let i = 0; i < 24; i++) {
    const Z = 3 + i * 2.9;
    if (Z > 71) break;
    const lit = o.start + i * o.every;
    if (t < lit || Z < camZ + 0.6) continue;
    const q = P((i % 2 ? 0.7 : -0.7) + Math.sin(i * 0.7) * 0.4, 0, Z);
    const age = t - lit;
    const a = Math.min(1, age * 3) * (0.75 + 0.25 * Math.exp(-age * 2));
    pts.push({ x: q[0], y: q[1], s: q[2] * 0.8, a: 0, flat: 0.32, alpha: a });
    // each print warms the marble round it and mirrors in it
    K.lightPool(g, q[0], q[1], q[2] * 3.2, "#ff9a30", { intensity: 0.4 * a, flat: 0.32 });
  }
  K.pawprints(g, pts, 1.1);
}

// ---- film ---------------------------------------------------------------------------------------------
// the frozen mall + the open shop, one continuous low tracking move (shots 5 and 6)
function mallShot(g, W, H, t) {
  const camZ = t < 48 ? K.lerp(-3, 30, K.ease.inOut(K.seg(t, 38, 48))) : K.lerp(30, 40, K.ease.inOut(K.seg(t, 48, 60)));
  const camY = 3.2 + Math.sin(t * 0.6) * 0.15 * (1 - K.smooth(K.seg(t, 46, 50))) + K.smooth(K.seg(t, 48, 60)) * 1.5;
  const open = K.ease.inOut(K.seg(t, 48.4, 52.4));
  K.withCamera(g, W, H, { x: 480 + Math.sin(t * 0.4) * 8, y: 270, zoom: 1, rot: Math.sin(t * 0.3) * 0.006, shakeT: t, shakeAmt: 0.6 }, () => {
    const P = mallScene(g, W, H, 30, camZ, camY, { open });
    // colour stays drained (frozen time) until the shop opens; then it returns, spreading from the doorway
    const c = P(0, 6, 70);
    const rp = K.seg(t, 51.5, 59.5);
    const R0 = P(8.5, 0, 70)[0] - c[0];
    const R = R0 * K.smooth(K.seg(t, 48.4, 51.5)) + K.ease.in(rp) * 1100;
    g.save();
    g.globalCompositeOperation = "saturation";
    if (R > 1) {
      const mg = g.createRadialGradient(c[0], c[1], Math.max(0, R - 260), c[0], c[1], R + 40);
      mg.addColorStop(0, "rgba(128,128,128,0)");
      mg.addColorStop(1, "rgba(128,128,128,0.72)");
      g.fillStyle = mg;
    } else g.fillStyle = "rgba(128,128,128,0.72)";
    g.fillRect(-W, -H, W * 3, H * 3);
    g.restore();
    g.fillStyle = K.rgba("#141828", 0.16 * (1 - rp));
    g.fillRect(-W, -H, W * 3, H * 3);
    // the warm leak under the closed shutter keeps its colour
    if (open < 0.05) {
      const a = P(-8.5, 0.5, 70), b = P(8.5, 0, 70);
      K.lightPool(g, (a[0] + b[0]) / 2, b[1], (b[0] - a[0]) * 0.6, "#ffa040", { intensity: 0.45, flat: 0.2 });
    }
    mallPrints(g, P, t, camZ, { start: 38.4, every: 0.38 });
    // you step in
    const wp = K.seg(t, 51.8, 59);
    if (wp > 0) {
      const Z = K.lerp(47, 72.5, K.ease.inOut(wp));
      const X = K.lerp(-9, 0.6, K.ease.out(K.seg(wp, 0, 0.55)));
      const q = P(X, 0, Z);
      const kh = 11.5 * q[2];
      const door = P(0, 8, 70);
      const al = K.clamp((73 - Z) / 1.2);
      const inside = K.seg(Z, 64, 71);
      // long shadow thrown toward the camera by the warm light deep inside the shop
      const sh0 = P(X - 0.9, 0, Z), sh1 = P(X + 0.9, 0, Z), sh2 = P(X + 1.6, 0, Math.max(camZ + 1, Z - 14)), sh3 = P(X - 1.6, 0, Math.max(camZ + 1, Z - 14));
      const lsg = g.createLinearGradient(0, sh0[1], 0, sh2[1]);
      lsg.addColorStop(0, K.rgba("#0e0610", 0.65 * Math.max(inside, open * 0.75) * al)); lsg.addColorStop(1, "rgba(14,6,16,0)");
      g.fillStyle = lsg;
      g.beginPath(); g.moveTo(sh0[0], sh0[1]); g.lineTo(sh1[0], sh1[1]); g.lineTo(sh2[0], sh2[1]); g.lineTo(sh3[0], sh3[1]); g.closePath(); g.fill();
      const po = {
        view: "back", walk: wp < 0.98, phase: t * 0.95, t, hood: false, bell: true, shadow: false,
        light: { x: door[0], y: door[1] - kh * 0.3, color: "#ffb860", strength: 0.9 + inside * 0.5, z: -0.85 }, ambient: "#181420",
      };
      // fixed-size layers (no per-frame canvas resizes): the person is painted into the top-left LW x LH
      const LW = kh * 0.9, LH = kh * 1.12, KW = 300, KH = 380;
      const L = K.layer(KW, KH, "f15:kidwalk");
      K.drawPerson(L.g, LW / 2, LH - 2, kh, po);
      const px = L.canvas.width / KW;
      const src = [0, 0, Math.min(L.canvas.width, LW * px), Math.min(L.canvas.height, LH * px)];
      // the warm backlight: a silhouette in the door's colour, minus a slightly shrunk copy = a rim band
      // round every edge (hair, shoulders, sleeves); plus a faint glow wrapping past the edge
      const back = K.clamp(open * 1.2) * (0.45 + 0.55 * inside);
      const TL = K.layer(KW, KH, "f15:kidrim");
      if (back > 0.01) {
        const tg = TL.g;
        tg.drawImage(L.canvas, ...src, 0, 0, LW, LH);
        tg.globalCompositeOperation = "source-in";
        tg.fillStyle = "#ffc27a"; tg.fillRect(0, 0, KW, KH);
        tg.globalCompositeOperation = "destination-out";
        tg.drawImage(L.canvas, ...src, LW * 0.025, LH * 0.022, LW * 0.95, LH * 0.978);
        tg.globalCompositeOperation = "source-over";
      }
      if (Z < 70) {
        g.save();
        g.globalAlpha = 0.22 * al;
        g.translate(0, 2 * q[1]);
        g.scale(1, -1);
        g.drawImage(L.canvas, ...src, q[0] - LW / 2, q[1] - LH + 2, LW, LH);
        g.restore();
      }
      K.shadowBlob(g, q[0], q[1] + 1, kh * 0.09, kh * 0.02, { alpha: 0.8 * al, soft: 0.8, color: "#0c040e" });
      g.save();
      g.globalAlpha = al;
      if (back > 0.01) {
        g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = al * back * 0.25;
        g.drawImage(TL.canvas, ...src, q[0] - LW * 0.52, q[1] - LH * 1.01 + 2, LW * 1.04, LH * 1.01);
        g.restore();
      }
      g.drawImage(L.canvas, ...src, q[0] - LW / 2, q[1] - LH + 2, LW, LH);
      if (back > 0.01) {
        g.globalCompositeOperation = "lighter"; g.globalAlpha = al * back * 0.85;
        g.drawImage(TL.canvas, ...src, q[0] - LW / 2, q[1] - LH + 2, LW, LH);
      }
      g.restore();
    }
  });
}
function frozenShot(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 30, 38));
  const push = 1 + 0.03 * p;
  K.withCamera(g, W, H, { x: K.lerp(480, 505, p), y: K.lerp(280, 380, p), zoom: K.lerp(1.07, 1.4, p) * push, rot: Math.sin(30 * 0.8) * 0.01 }, () => {
    loudScene(g, W, H, 30, true);
    desat(g, -W, -H, W * 3, H * 3, 0.72 * K.smooth(K.seg(t, 30, 30.25)));
    g.fillStyle = "rgba(20,24,40,0.18)";
    g.fillRect(-W, -H, W * 3, H * 3);
    // the one thing that moves: pawprints lighting up, each warming an amber pool on the frozen glass
    const pts = [];
    const add = (x, y, s, at) => {
      if (t <= at) return;
      const a = K.smooth((t - at) / 0.8);
      pts.push({ x, y, s, a: -0.35, flat: 0.55, alpha: a });
      K.lightPool(g, x, y, s * 4.5, "#ff9a30", { intensity: 0.5 * a, flat: 0.32 });
      K.reflectStreak(g, x, y + s * 0.3, s * 3, "#ffb050", 0.3 * a, { t: 0, width: s * 0.9 });
    };
    // the first print lands just beyond her, to her right - in the lower-middle third, clear of the subtitle
    add(522, 432, 22, 31.8);
    add(562, 414, 19, 34.4);
    add(594, 400, 16, 36.2);
    K.pawprints(g, pts, 0.55);
    // it is a light: an amber up-light on the toes of her boots and the hem of her coat
    if (t > 31.8) {
      const a = K.smooth((t - 31.8) / 0.8) * (0.9 + 0.1 * Math.sin(t * 2.1));
      K.lightPool(g, 428, 444, 34, "#ffa040", { intensity: 0.32 * a, flat: 0.75 });
      K.glow(g, 520, 428, 30, "#ffb050", 0.22 * a);
    }
  });
}
function xfadeSprite(side, W, H) {
  return K.sprite("f15:xfade" + side, W, H, (s) => (side ? mallShot(s, W, H, 38) : frozenShot(s, W, H, 37.3)));
}
function frame(g, W, H, t) {
  if (t < 8) {
    shot1(g, W, H, t);
  } else if (t < 16) {
    const lt = t - 8;
    if (lt < 2.667) gagRoll(g, W, H, lt);
    else if (lt < 5.333) gagRecord(g, W, H, lt - 2.667);
    else gagLong(g, W, H, lt - 5.333);
  } else if (t < 30) {
    const p = K.seg(t, 16, 30);
    K.withCamera(g, W, H, { x: 480, y: 280, zoom: 1.03 + p * 0.05 + beatPulse(t) * 0.006, rot: Math.sin(t * 0.8) * 0.01, shakeT: t * 2, shakeAmt: 1.6 + beatPulse(t) * 1.5 }, () => {
      loudScene(g, W, H, t, false);
    });
  } else if (t < 38) {
    // dissolve into the mall on the meow. Both sides are still frames (time is stopped on the left,
    // the mall's first frame on the right), each rendered ONCE into a cached layer; the dissolve is just
    // two drawImage calls.
    const x = K.smooth(K.seg(t, 37.3, 38));
    if (x <= 0.002) frozenShot(g, W, H, t);
    else {
      g.drawImage(xfadeSprite(0, W, H), 0, 0, W, H);
      g.save(); g.globalAlpha = x; g.drawImage(xfadeSprite(1, W, H), 0, 0, W, H); g.restore();
    }
  } else {
    mallShot(g, W, H, t);
  }
}

// lens grade per shot (REALISM.md "Neon dimension"), blended across dissolves; cuts may change it hard
const GRADE = { exposure: 0.92, sat: 1.05, contrast: 1.1, bloom: 0.5, threshold: 0.9, streak: 0.12, halation: 0.32, ca: 1.0, vignette: 0.42, grain: 0.05, weave: 1, temp: 0.02 };
const lerpG = (a, b, k) => { const o = {}; for (const key of Object.keys(a)) o[key] = Array.isArray(a[key]) ? a[key].map((v, i) => K.lerp(v, b[key][i], k)) : K.lerp(a[key], b[key], k); return o; };
const G_FROZEN = { temp: -0.12, sat: 0.9, contrast: 1.04, bloom: 0.32, streak: 0.04, halation: 0.25, ca: 0.4, vignette: 0.6, grain: 0.065, weave: 0, exposure: 0.95 };
const G_MALL = { temp: -0.1, sat: 0.92, contrast: 1.06, bloom: 0.4, streak: 0.06, halation: 0.3, ca: 0.4, vignette: 0.58, grain: 0.065, weave: 0.45, exposure: 1.0 };
const G_SHOP = { temp: 0.14, sat: 1.0, contrast: 1.08, bloom: 0.55, streak: 0.08, halation: 0.55, ca: 0.45, vignette: 0.6, grain: 0.06, weave: 0.6, exposure: 1.02 };
function gradeAt(t) {
  if (t < 8) return { ca: 1.0 + 1.4 * Math.exp(-t * 1.5) + beatPulse(t) * 0.5, exposure: 0.92 + 0.25 * Math.exp(-t * 5), weave: 1.2 };
  if (t < 16) {
    const lt = t - 8;
    if (lt < 2.667) return { exposure: 0.86, bloom: 0.45, streak: 0.1, temp: 0.04 };
    if (lt < 5.333) return { exposure: 1.0, bloom: 0.55, streak: 0.18, vignette: 0.55, contrast: 1.12 };
    return { exposure: 0.86, ca: 0.8, temp: 0.04, bloom: 0.35 };
  }
  if (t < 30) return { ca: 1.1 + beatPulse(t) * 0.7 };
  if (t < 37.3) return G_FROZEN;
  if (t < 38) return lerpG(G_FROZEN, G_MALL, K.smooth(K.seg(t, 37.3, 38)));
  return lerpG(G_MALL, G_SHOP, K.smooth(K.seg(t, 49, 56)));
}
const PREWARM = [["cloud", { seed: 15, cover: 0.42 }], ["cloud", { seed: 3, cover: 0.45 }], ["granite", { seed: 6 }], ["plaster", { seed: 15 }], ["wood", { seed: 15 }], ["fabric", { seed: 4 }], ["relief", { seed: 9 }], ["metal", { seed: 7 }]];
// static art for the opening (sky, ranges, floor, chrome): built under the white flash
function prewarmCore(H) {
  K.texPrewarm(PREWARM, 1e6);
  for (let i = 0; i < 4; i++) cloudSprite(i);
  skySprite(); fgSprite(); reflSprite(); floorSprite(H); hazeSprite(); envPano();
  chromeSprite(-1); chromeSprite(0); chromeSprite(1);
}
// later shots, warmed one per 0.2 s during shot 1 (numbers = render that frame off-screen once)
const WARM_T = [
  () => { kidSprite(); }, () => { headSprite(); headSprite(true); }, () => { rollRoomSprite(); deckSprite(); armSprite(); },
  () => { vinylSprite(); vinylStreakSprite(); vinylSheenSprite(); labelSprite(); }, () => { bayLongSprite(); stripSprite(0); legSprite(0); legSprite(1); },
  () => { for (let k = 0; k < 24; k++) flySprite(k % 3, k >> 2 & 7); }, () => { shutterTex(); shopInteriorSprite(); },
  8.4, 9.6, 11.0, 12.4, 13.6, 14.6, 15.6, 16.4, 20, 24.5, 31, 33, 37.6, 40, 44, 48.5, 50.5, 52.5, 55.5, 58,
];
function warmShot(i, W, H) {
  const w = WARM_T[i];
  if (w == null) return;
  K.sprite("f15:warm" + i, 1, 1, () => {
    if (typeof w === "function") { w(); return; }
    const L = K.layer(W, H, "f15:warmL");
    frame(L.g, W, H, w);
  });
}

export const film = {
  id: 15,
  title: "Too Loud",
  chapter: "Chapter 15",
  unlockAt: 75,
  duration: D,
  poster: 26,
  tagline: "The Meme Dimension does not do quiet.",
  subs: [
    [2.0, 5.5, "The Meme Dimension."],
    [8.4, 10.5, "A cat, laughing at nothing."],
    [10.9, 13.1, "A cat that was also a record."],
    [13.5, 15.8, "And a very, very long cat."],
    [18.0, 22.0, "It was too loud. Too much."],
    [23.0, 28.0, "You could not even hear yourself think."],
    [31.5, 35.5, "Then, quiet."],
    [39.0, 43.5, "His pawprints. Even here."],
    [49.0, 53.5, "They led into a shop that was closed forever."],
    [54.0, 58.0, "Not anymore."],
  ],
  voice: [
    [2.0, "The Meme Dimension.", { rate: 1.0, pitch: 1.1 }],
    [8.4, "A cat, laughing at nothing.", { rate: 1.05, pitch: 1.1 }],
    [10.9, "A cat that was also a record.", { rate: 1.05, pitch: 1.1 }],
    [13.5, "And a very, very long cat.", { rate: 1.0, pitch: 1.1 }],
    [18.0, "It was too loud. Too much.", { rate: 0.92, pitch: 1.0 }],
    [23.0, "You could not even hear yourself think.", { rate: 0.92, pitch: 1.0 }],
    [31.5, "Then, quiet.", { rate: 0.85, pitch: 0.95 }],
    [39.0, "His pawprints. Even here.", { rate: 0.92, pitch: 1.0 }],
    [49.0, "They led into a shop that was closed forever.", { rate: 0.92, pitch: 1.0 }],
    [54.0, "Not anymore.", { rate: 0.9, pitch: 1.0 }],
  ],
  score: { mood: "joy", key: "A", bpm: BPM, cues: [[0, "hit"], [8, "hit"], [16, "hit"], [30, "drop"], [38, "meow"], [48, "swell"]] },
  grade: GRADE,
  gradeAt,
  draw(g, t, W, H) {
    g.save();
    if (W !== 960 || H !== 540) g.scale(W / 960, H / 540);
    W = 960; H = 540;
    try {
      // pre-warm the next shots' cached art during the cheap held part of the opening, one piece per second
      // the opening white flash hides the one-off builds (textures + every cached set piece). The player
      // caps its clock step at 0.25 s, so this load costs no picture; afterwards every shot only stamps sprites.
      // the opening white flash hides the one-off builds of every static layer (textures + cached set pieces);
      // the player caps its clock step at 0.25 s, so this load costs no picture. Then, through the cheap rest of
      // shot 1, one later shot per 0.2 s is rendered once off-screen (a sentinel sprite makes each run once per
      // cache lifetime) so the shot boundaries never stall on a first-frame build.
      if (t < 0.4) prewarmCore(H);
      else if (t > 0.9 && t < 0.9 + WARM_T.length * 0.2) warmShot(Math.floor((t - 0.9) / 0.2), W, H);
      else if (t > 12 && t < 16) { const n = Math.min(24, Math.floor((t - 12) * 8)); for (let k = 0; k < n; k++) flySprite(k % 3, k >> 2 & 7); }
      frame(g, W, H, t);
      const lens = K.lensActive(g);
      if (!lens) {
        // no GPU lens (no WebGL): the old 2D post stack
        if (t < 30) K.bloom(g, 0.3, { threshold: 0.64 }); else K.bloom(g, t < 48 ? 0.22 : 0.4);
        K.grade(g, W, H, { tint: t < 30 ? "#ff7ae0" : t < 52 ? "#9aa8c8" : "#ffcf8a", alpha: 0.12, mode: "soft-light" });
        if (t < 30 && t > 0.6) K.chromatic(g, W, H, 0.3 + beatPulse(t) * 0.8);
        K.vignette(g, W, H, t < 30 ? 0.42 : 0.6);
        K.grain(g, W, H, t, t < 30 ? 0.05 : 0.065);
      }
      // letterbox: the top bar slides away at 16 (the only time in the series) and slams back at the drop
      const bar = H * 0.085;
      if (t < 16 || t >= 30.35) K.letterbox(g, W, H, 1);
      else {
        g.fillStyle = "#000";
        g.fillRect(0, H - bar, W, bar);
        let top = 0;
        if (t < 30) top = -bar * K.ease.in(K.seg(t, 16, 17.3)) - Math.sin(K.seg(t, 16, 17.3) * Math.PI) * 6;
        else top = -bar * (1 - K.ease.out(K.seg(t, 30, 30.35)));
        if (top > -bar) {
          g.save();
          g.translate(0, top);
          g.rotate(t >= 16 && t < 18 ? K.seg(t, 16, 17.3) * 0.03 : 0);
          g.fillRect(-20, 0, W + 40, bar);
          g.restore();
        }
      }
      // title: snaps in at 1 with a short RGB split, snaps out at 4
      if (t >= 1 && t < 4) {
        const k = 1 - K.smooth(K.seg(t, 1.05, 1.3));
        const a = t > 3.75 ? (4 - t) / 0.25 : 1;
        const dx = Math.min(6, 1.5 + k * 4.5);
        if (k > 0.002) {
          g.save();
          g.globalCompositeOperation = "lighter";
          g.save(); g.translate(-dx, 0); K.title(g, W, H, "Too Loud", "Chapter 15", a * 0.7 * k, { color: "#ff3b8b", glow: "#ff4fd8", y: H * 0.42 }); g.restore();
          g.save(); g.translate(dx, 0); K.title(g, W, H, "Too Loud", "Chapter 15", a * 0.7 * k, { color: "#3bf0ff", glow: "#7af7ff", y: H * 0.42 }); g.restore();
          g.restore();
        }
        K.title(g, W, H, "Too Loud", "Chapter 15", a, { glow: "#ff9ad8", y: H * 0.42 });
      }
      // hard-cut flashes on the hits (exposure spikes, not paint)
      K.fadeColor(g, W, H, 0.8 * Math.exp(-t * 7), "#ffffff");
      if (t >= 8 && t < 16) { const lt = (t - 8) % 2.667; K.fadeColor(g, W, H, 0.3 * Math.exp(-lt * 9), "#ffffff"); }
      if (t >= 16 && t < 17) K.fadeColor(g, W, H, 0.35 * Math.exp(-(t - 16) * 8), "#ffffff");
      K.fadeBlack(g, W, H, K.smooth(K.seg(t, 58.2, 60)));
    } finally {
      g.restore();
    }
  },
};
