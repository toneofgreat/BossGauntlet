// films/f18.js - Chapter 18 "The Procession" (FILMS.md f18). Pre-dawn cloud stairs climbing a huge violet
// sky; you climb, and behind you every cat you ever found climbs too. At the top: the paw ring, dark and cold.
// Key light: a hidden sun below the rose horizon (low, ahead), so every cat and cloud top is rim-lit pink.
// draw(g, t, W, H) is a pure function of t; only static art is cached (sprites / layers).
import * as K from "../filmkit.js";
import { inLayer, put, soft, spriteCat, warmCats, warmBack, CROWD, catBack, dawnSky, cloudRow, cloudStep, stoneRing, lines } from "./lib1820.js";

const D = 66;
const TAU = Math.PI * 2;

// ---- palette (FILMS.md f18: deep blue-violet above, rose at the horizon, cloud tops lit pink) --------------
const SKY = { top: "#171a4a", mid: "#3e3a7c", bottom: "#ffb8a8", band: "#ff9f98" };
const FAR = { key: "f18far2", lit: "#efc4c6", mid: "#c6a2c0", shade: "#9c88ba" };
const MID = { key: "f18mid", lit: "#ffc6b6", mid: "#9a7ab2", shade: "#463f80" };
const NEAR = { key: "f18near", lit: "#f6b2a8", mid: "#6e5a9a", shade: "#26245a" };
const STEP = { key: "f18step", lit: "#ffd6c8", mid: "#a684bc", shade: "#3c3878" };
const RIM = "#ffc2a6";

// ---- stairs: a catmull-rom path through [x, y, width] control points, cut into equal steps ----------------
function buildStair(ctrl, spacing) {
  const dense = [];
  const P = (i) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < 24; k++) {
      const u = k / 24, u2 = u * u, u3 = u2 * u;
      const v = [0, 1, 2].map((j) => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u3));
      dense.push(v);
    }
  }
  dense.push(ctrl[ctrl.length - 1].slice());
  // arc length in "perspective" units (distance divided by width so far steps stay as deep as near ones)
  const acc = [0];
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1], b = dense[i];
    acc.push(acc[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]) / ((a[2] + b[2]) / 2));
  }
  const total = acc[acc.length - 1];
  const n = Math.max(2, Math.round(total / spacing) + 1);
  const steps = [];
  let j = 0;
  for (let s = 0; s < n; s++) {
    const target = (s / (n - 1)) * total;
    while (j < acc.length - 2 && acc[j + 1] < target) j++;
    const f = (target - acc[j]) / Math.max(1e-6, acc[j + 1] - acc[j]);
    const a = dense[j], b = dense[j + 1];
    steps.push({ x: K.lerp(a[0], b[0], f), y: K.lerp(a[1], b[1], f), w: K.lerp(a[2], b[2], f), dx: b[0] - a[0] });
  }
  return steps;
}
// position on the stair at fractional step f (a small hop between steps), lane = -1..1 across the step
function stairAt(S, f, lane = 0) {
  const n = S.length;
  f = K.clamp(f, 0, n - 1.001);
  const i = Math.floor(f), u = f - i;
  const a = S[i], b = S[i + 1];
  const e = K.smooth(K.clamp((u - 0.68) / 0.32));
  const w = K.lerp(a.w, b.w, e);
  const x = K.lerp(a.x, b.x, e) + lane * w * 0.24;
  const gy = K.lerp(a.y, b.y, e);
  const hop = Math.sin(Math.PI * e);
  const y = gy - hop * w * 0.028;
  const dir = (b.x - a.x) >= 0 ? 1 : -1;
  return { x, y, gy, hop, w, dir, i };
}

const S1 = buildStair([[110, 640, 560], [330, 500, 330], [430, 380, 170], [560, 280, 96], [520, 205, 56], [610, 150, 32], [690, 112, 18], [730, 92, 10]], 0.3);
const S2 = buildStair([[-260, 720, 600], [60, 640, 500], [320, 500, 400], [520, 360, 300], [610, 268, 200], [660, 205, 124], [720, 154, 72], [780, 118, 38], [820, 98, 18]], 0.3);
const S3 = buildStair([[920, 640, 320], [600, 560, 210], [280, 500, 140], [170, 440, 100], [380, 395, 74], [660, 352, 56], [760, 310, 42], [560, 272, 31], [330, 242, 23], [250, 212, 17], [410, 184, 13], [590, 160, 10], [660, 136, 7.5], [580, 116, 6], [520, 102, 4.6]], 0.3);

// ---- shared scenery -------------------------------------------------------------------------------------------
function heaven(g, W, H, t, hz, o = {}) {
  dawnSky(g, W, H, { top: SKY.top, mid: SKY.mid, bottom: SKY.bottom, horizon: hz / H, band: SKY.band, bandA: 0.55 });
  const sa = o.stars == null ? 1 : o.stars;
  if (sa > 0.01) {
    g.save();
    g.globalAlpha *= sa;
    K.stars(g, W, H, 18, 1.3, t, { yMax: hz * 0.75 });
    g.restore();
  }
  // the sun is below the horizon, ahead and right: a rose bloom on the horizon
  const sx = o.sunX == null ? W * 0.72 : o.sunX;
  K.glow(g, sx, hz + 10, W * 0.62, "#ff8f86", 0.32);
  K.glow(g, sx, hz + 6, W * 0.26, "#ffd0a8", 0.4);
  // a thin high cloud streak catching the first light
  g.save();
  g.globalAlpha *= 0.55;
  K.clouds(g, W, H, t, { seed: 181, color: "#ffc8c0", shade: "#5a4c8c", count: 4, y: hz * 0.42, spread: hz * 0.12, speed: 2.5, scale: 1.2, alpha: 0.5 });
  g.restore();
}
function cloudSea(g, W, H, t, hz, o = {}) {
  const sp = o.speed == null ? 1 : o.speed;
  const ox = o.ox || 0;
  // the sea's floor: a continuous haze so no sky shows between the rows
  const fl = g.createLinearGradient(0, hz, 0, H + 60);
  fl.addColorStop(0, "#d79ab4");
  fl.addColorStop(0.25, "#8a70a8");
  fl.addColorStop(1, "#2c2a62");
  g.fillStyle = fl;
  g.fillRect(-W, hz + 8, W * 3, H * 2);
  cloudRow(g, -40 + ox, W + 40 + ox, hz + 10, 34, FAR, 1, t, 2 * sp, 0.85);
  K.fog(g, W, H, { y: hz + 4, h: 40, color: "#e8a6b4", alpha: 0.45, wisps: false });
  cloudRow(g, -60 + ox, W + 60 + ox, hz + 34, 52, FAR, 2, t, 3 * sp, 0.95);
  cloudRow(g, -80 + ox, W + 80 + ox, hz + 78, 78, MID, 3, t, 4.5 * sp);
  K.fog(g, W, H, { y: hz + 60, h: 70, color: "#c88cb0", alpha: 0.25, wisps: true, t, seed: 4 });
  // deeper rows fill whatever is below (when the horizon is high in frame)
  for (let k = 0, y = hz + 150; y < H + 60 && k < 5; k++, y += 70 + k * 40) {
    if (y > hz + 160 && o.near === false && y > H - 40) break;
    cloudRow(g, -120 + ox, W + 120 + ox, y, 70 + k * 40, k < 2 ? MID : NEAR, 40 + k, t, (5 + k * 2) * sp, 0.95);
  }
  if (o.near !== false) {
    cloudRow(g, -120 + ox, W + 120 + ox, hz + 170, 130, NEAR, 4, t, 7 * sp);
    cloudRow(g, -160 + ox, W + 160 + ox, H + 90, 190, NEAR, 5, t, 10 * sp);
  }
  horizonHaze(g, W, H, hz);
}
// aerial perspective: a rose haze that is thickest at the horizon and thins toward the lens
function horizonHaze(g, W, H, hz) {
  g.save();
  const gr = g.createLinearGradient(0, hz - 50, 0, hz + 190);
  gr.addColorStop(0, "rgba(255,184,168,0)");
  gr.addColorStop(0.2, "rgba(255,184,168,0.35)");
  gr.addColorStop(0.45, "rgba(255,184,168,0.16)");
  gr.addColorStop(1, "rgba(255,184,168,0)");
  g.fillStyle = gr;
  g.fillRect(-W, hz - 50, W * 3, 240);
  g.restore();
}
// tall cloud tower the stairs climb into
function tower(g, x, y, s, t) {
  const R = K.rng("f18tower");
  for (let i = 0; i < 7; i++) {
    const yy = y + i * 46 * s, w = (170 + i * 40) * s;
    cloudRow(g, x - w / 2, x + w / 2, yy + 40 * s, 60 * s * (1 + i * 0.12), i < 3 ? FAR : MID, 20 + i, t, 0, 0.9);
    void R;
  }
}

// a cat on the stairs (side view sprite, walking up)
function catSpec(size, ci, ph, o = {}) {
  const coat = CROWD[ci % CROWD.length];
  const tailUp = o.tailUp == null ? 0.6 : o.tailUp;
  const light = o.parade ? { dx: 1, dy: -0.15, color: "#ffb8a8", strength: 1.4 } : { dx: 0.6, dy: -0.55, color: RIM, strength: 1.2 };
  return {
    size, steps: o.steps || 8,
    o: { pose: o.pose || "walk", phase: ph, coat, collar: false, bell: false, tail: 0.6, tailUp,
      light, ground: "#2a2460", hat: o.hat },
    key: "f18:" + (ci % CROWD.length) + ":" + (o.pose || "walk") + (o.hat ? "h" : "") + ":" + tailUp + (o.parade ? "p" : ""),
  };
}
function stairCat(g, x, y, size, dir, ci, t, ph, o = {}) {
  const S = catSpec(size, ci, ph, o);
  S.o.facing = dir;
  S.o.alpha = o.alpha;
  spriteCat(g, x, y, size, S.o, S.key, S.steps);
}
// every sprite a set of cats will need, for warming during the shot before
function wishes(list) {
  const out = [];
  for (const [size, ci, o] of list) {
    const steps = o.steps || 8;
    for (let q = 0; q < steps; q++) out.push(catSpec(size, ci, (q + 0.5) / steps, o));
  }
  return out;
}
const WISH2 = wishes([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((ci) => [[30, ci, {}], [60, ci, {}]]));
const WISH3 = wishes([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((ci) => [[10, ci, {}], [30, ci, {}]]).concat([0, 2, 4, 6, 8].flatMap((ci) => [[10, ci, { pose: "run" }], [30, ci, { pose: "run" }]])));
function kid(g, x, y, h, t, o = {}) {
  if (o.gy != null && !o._s) {
    // contact shadow on the step top (stays on the step while the body hops up)
    const lift = K.clamp((o.gy - y) / Math.max(1, h * 0.12)) * 0.4;
    const sy = K.lerp(o.gy, y, 0.75);
    g.save();
    g.fillStyle = K.rgba("#1c1846", 0.5 * (1 - lift * 0.5));
    g.beginPath(); g.ellipse(x + h * 0.01, sy - h * 0.004, h * 0.17 * (1 - lift * 0.25), h * 0.03, 0, 0, TAU); g.fill();
    g.fillStyle = K.rgba("#100c30", 0.45 * (1 - lift * 0.6));
    g.beginPath(); g.ellipse(x, sy - h * 0.006, h * 0.09, h * 0.016, 0, 0, TAU); g.fill();
    g.restore();
    o = Object.assign({}, o, { _s: 1 });
  }
  if (o.walk !== false && !o._b) {
    // climbing: the body rises on every step (two per gait cycle)
    const ph = o.phase == null ? t * 0.9 : o.phase;
    y -= Math.abs(Math.sin(ph * TAU)) * h * 0.02;
    o = Object.assign({}, o, { _b: 1 });
  }
  if (o.W && h > 40) {
    const L = inLayer(g, o.W, o.H, "f18kid", (q) => kid(q, x, y, h, t, Object.assign({}, o, { W: 0 })));
    L.g.save();
    L.g.setTransform(1, 0, 0, 1, 0, 0);
    L.g.globalCompositeOperation = "source-atop";
    L.g.fillStyle = "rgba(46,38,104," + (o.shade == null ? 0.38 : o.shade) + ")";
    L.g.fillRect(0, 0, L.canvas.width, L.canvas.height);
    L.g.restore();
    put(g, o.W, o.H, L, o.alpha == null ? 1 : o.alpha);
    return;
  }
  K.drawPerson(g, x, y, h, {
    view: o.view || "back", facing: o.facing || 1, walk: o.walk !== false, phase: o.phase == null ? t * 0.9 : o.phase,
    hood: false, bell: true, light: { x: x + (o.lx == null ? 260 : o.lx), y: y - h * 0.4 + (o.ly == null ? 60 : o.ly), color: RIM, strength: 1.1 },
    shadow: o.gy == null, alpha: o.alpha,
  });
}

// draw a stair far -> near with actors interleaved for correct overlap
function drawStair(g, S, actors, from = S.length - 1, to = 0) {
  actors.sort((a, b) => b.f - a.f);
  let k = 0;
  for (let i = from; i >= to; i--) {
    const s = S[i];
    if (s.w > 2.5) {
      cloudStep(g, s.x, s.y, s.w, STEP, i * 7 + 3);
      if (s.w > 14) {
        g.save();
        g.lineCap = "round";
        g.strokeStyle = "rgba(34,26,86,0.28)";
        g.lineWidth = Math.max(0.7, s.w * 0.022);
        g.beginPath(); g.ellipse(s.x, s.y + s.w * 0.02, s.w * 0.45, s.w * 0.085, 0, Math.PI * 0.12, Math.PI * 0.88); g.stroke();
        g.strokeStyle = "rgba(255,214,204,0.4)";
        g.lineWidth = Math.max(0.5, s.w * 0.009);
        g.beginPath(); g.ellipse(s.x, s.y - s.w * 0.004, s.w * 0.44, s.w * 0.08, 0, Math.PI * 0.18, Math.PI * 0.82); g.stroke();
        g.restore();
      }
    }
    while (k < actors.length && Math.floor(actors[k].f) >= i) { actors[k].draw(g); k++; }
  }
  while (k < actors.length) { if (actors[k].f >= to - 1) actors[k].draw(g); k++; }
}

// ---- shot 1 [0-12] wide: the cloud stairs ----------------------------------------------------------------------
function shot1(g, W, H, t) {
  warmCats(WISH2, 1);
  const p = K.ease.inOut(K.seg(t, 0, 12));
  const hz = 318;
  K.withCamera(g, W, H, { x: 480 + p * 20, y: 290 - p * 26, zoom: 1.03 + p * 0.05, shakeT: t, shakeAmt: 0.8 }, (c) => {
    heaven(c, W, H, t, hz, { stars: 1 - 0.55 * p });
    cloudSea(c, W, H, t, hz, { near: false });
    soft(c, W, H, "f18tower", 1.8, (q) => tower(q, 720, 30, 0.75, t));
    // far half of the stair in haze
    const kf = 5.2 + t * 0.42;
    const far = inLayer(c, W, H, "f18s1far", (L) => {
      drawStair(L, S1, [], S1.length - 1, 12);
      L.save();
      L.setTransform(1, 0, 0, 1, 0, 0);
      L.globalCompositeOperation = "source-atop";
      L.fillStyle = "rgba(238,176,190,0.35)";
      L.fillRect(0, 0, L.canvas.width, L.canvas.height);
      L.restore();
    });
    put(c, W, H, far, 1);
    cloudRow(c, -120, W + 120, hz + 170, 130, NEAR, 4, t, 7);
    const k = stairAt(S1, kf, 0.05);
    drawStair(c, S1, [{ f: kf, draw: (q) => kid(q, k.x, k.y, k.w * 0.5, t, { phase: t * 0.85, gy: k.gy }) }], 11, 0);
    cloudRow(c, -160, W + 160, H + 90, 190, NEAR, 5, t, 10);
  });
  K.godRays(g, W * 0.75, 330, W, H, { color: "#ffb8a8", count: 7, strength: 0.12, t, angle: -Math.PI / 2 - 0.5, spread: 1.4, seed: 18 });
}

// the step nearest the frame point where you should stand
function nearestStep(S, x, y) {
  let best = 0, bd = 1e9;
  S.forEach((s, i) => { const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = i; } });
  return best;
}
const S2K = nearestStep(S2, 500, 380) - 1.5;
// ---- shot 2 [12-22] behind you, climbing; pull up and back: you are not alone ----------------------------------
function shot2(g, W, H, t) {
  warmCats(WISH3, t > 19 ? 2 : 1);
  const p = K.ease.inOut(K.seg(t, 12.6, 21.5));
  const kf = S2K + (t - 12) * 0.3;
  const k = stairAt(S2, kf, 0.05);
  const z = K.lerp(1.5, 1.0, p);
  const cx = K.lerp(k.x, 470, p), cy = K.lerp(k.y - k.w * 0.32, 336, p);
  const hz = 300;
  K.withCamera(g, W, H, { x: cx, y: cy, zoom: z, shakeT: t, shakeAmt: 1.0 }, (c) => {
    heaven(c, W, H, t, hz, { stars: 0.42 });
    cloudSea(c, W, H, t, hz, { near: false });
    cloudRow(c, -120, W + 120, hz + 150, 120, NEAR, 6, t, 6);
    const actors = [{ f: kf, draw: (q) => kid(q, k.x, k.y, k.w * 0.5, t, { phase: t * 0.8, W, H, gy: k.gy }) }];
    for (let j = 1; j <= 14; j++) {
      const f = kf - 0.8 - j * 0.55 - K.hash(j, 2) * 0.25;
      if (f < 0) break;
      const lane = (K.hash(j, 5) - 0.5) * 1.6;
      const s = stairAt(S2, f, lane);
      const ci = (j * 3) % CROWD.length;
      const size = s.w * (0.1 + K.hash(j, 9) * 0.035) * (j % 5 === 3 ? 0.7 : 1);
      actors.push({ f, draw: (q) => stairCat(q, s.x, s.y, size, s.dir, ci, t, t * 1.15 + K.hash(j, 1)) });
    }
    drawStair(c, S2, actors);
    // foreground wisps (out of focus)
    soft(c, W, H, "f18s2fg", 7, (q) => cloudRow(q, -200, W + 200, H + 150 + (1 - p) * 150, 230, NEAR, 7, t, 14, 0.9));
  });
  K.dust(g, W, H, t, { seed: 182, count: 26, color: "#ffd2c0", size: 1.4, alpha: 0.35 });
}

// ---- shot 3 [22-34] crane up and back: the long winding line ---------------------------------------------------
function shot3(g, W, H, t) {
  warmCats(WISH4(), t > 30.5 ? 2 : 1);
  const p = K.ease.inOut(K.seg(t, 22, 34));
  const hz = 150;
  const adv = (t - 22) * 0.5;
  K.withCamera(g, W, H, { x: 480 - p * 10, y: K.lerp(380, 290, p), zoom: K.lerp(1.32, 1.0, p), shakeT: t, shakeAmt: 0.9 }, (c) => {
    heaven(c, W, H, t, hz, { stars: 0.3, sunX: 700 });
    cloudSea(c, W, H, t, hz, { near: false });
    cloudRow(c, -80, W + 80, hz + 120, 70, MID, 8, t, 4);
    const cats = (lo, hi) => {
      const out = [];
      for (let j = 0; j < 104; j++) {
        const f = 3 + j * 0.92 + K.hash(j, 3) * 0.4 + adv;
        if (f < lo || f >= hi || f > S3.length - 6) continue;
        const lane = (K.hash(j, 7) - 0.5) * 1.5;
        const s = stairAt(S3, f, lane);
        const ci = (j * 7 + 2) % CROWD.length;
        const kitten = j % 6 === 4;
        const size = Math.min(48, s.w * (0.17 + K.hash(j, 11) * 0.05) * (kitten ? 0.6 : 1));
        out.push({ f, draw: (q) => stairCat(q, s.x, s.y, size, s.dir, ci, t, t * 1.2 + K.hash(j, 4), { pose: kitten ? "run" : "walk" }) });
      }
      return out;
    };
    const lead = Math.min(3 + 103 * 0.92 + K.hash(103, 3) * 0.4 + adv, S3.length - 6);
    const kF = Math.min(lead + 1.4, S3.length - 2);
    const kk = stairAt(S3, kF, 0);
    const far = inLayer(c, W, H, "f18s3far", (L) => {
      const a = cats(48, 999);
      drawStair(L, S3, a, S3.length - 1, 48);
      L.save();
      L.setTransform(1, 0, 0, 1, 0, 0);
      L.globalCompositeOperation = "source-atop";
      L.fillStyle = "rgba(226,170,196,0.42)";
      L.fillRect(0, 0, L.canvas.width, L.canvas.height);
      L.restore();
    });
    put(c, W, H, far, 1);
    // you, at the head of the procession: a tiny yellow figure the eye can find
    K.glow(c, kk.x, kk.y - 5, 16, "#ffd9a0", 0.55);
    K.glow(c, kk.x, kk.y - 4, 6, "#fff2d0", 0.5);
    K.drawPerson(c, kk.x, kk.y, 9.5, { view: "side", facing: kk.dir, walk: true, phase: t * 0.9, hood: false, bell: true, light: { x: kk.x + 300, y: kk.y - 60, color: "#ffd2b0", strength: 1.6 }, shadow: false });
    K.fog(c, W, H, { y: 300, h: 60, color: "#d79ab8", alpha: 0.18, wisps: true, t, seed: 9 });
    drawStair(c, S3, cats(0, 48), 47, 0);
    cloudRow(c, -200, W + 200, H + 120, 200, NEAR, 9, t, 12, 0.9);
  });
}

// ---- shot 4 [34-44] tracking side-on, low: the parade ----------------------------------------------------------
const SW4 = 170, SH4 = 30;
const stairY4 = (x) => {
  const k = Math.floor(x / SW4), u = x / SW4 - k;
  const e = K.smooth(K.clamp((u - 0.78) / 0.22));
  return -(k + e) * SH4;
};
const PARADE = [
  { x0: -330, ci: 3, size: 26, kitten: true, dv: 6 },
  { x0: -230, ci: 0, size: 54 },
  { x0: -60, ci: 2, size: 50, dv: -2 },
  { x0: 120, ci: 1, size: 66, dv: 1, fluff: 1 },
  { x0: 300, ci: 4, size: 50, hat: true, dv: -1 },
  { x0: 390, ci: 9, size: 24, kitten: true, dv: 9 },
  { x0: 440, ci: 7, size: 23, kitten: true, dv: 5 },
  { x0: 560, ci: 5, size: 48, dv: 2 },
  { x0: 740, ci: 6, size: 52 },
];
let W4 = null;
function WISH4() {
  if (!W4) {
    const list = [];
    for (const m of PARADE) {
      if (m.kitten) { list.push([m.size, m.ci, { pose: "walk", steps: 12, tailUp: 0.9, parade: 1 }], [m.size, m.ci, { pose: "run", steps: 12, tailUp: 0.9, parade: 1 }]); }
      else list.push([m.fluff ? m.size * 1.12 : m.size, m.ci, { steps: 12, tailUp: 0.7, hat: m.hat, parade: 1 }]);
    }
    W4 = wishes(list);
  }
  return W4;
}
function shot4(g, W, H, t) {
  warmCats(WISH4(), 2);
  warmShot5(t);
  const tt = t - 34;
  const v = 46;
  const camX = 200 + tt * v;
  const camY = stairY4(camX) - 70;
  const hz = 360;
  // sky + far sea with parallax
  heaven(g, W, H, t, hz, { stars: 0.22, sunX: W * 0.82 });
  K.withCamera(g, W, H, { x: 480 + tt * v * 0.08, y: 270, zoom: 1, shakeT: t, shakeAmt: 0.6 }, (c) => cloudSea(c, W, H, t, hz, { near: false, speed: 0.4 }));
  K.withCamera(g, W, H, { x: camX, y: camY, zoom: 1, shakeT: t, shakeAmt: 1.2 }, (c) => {
    // background (farther) row of steps: soft, hazy - a second line of cats beyond
    const L = inLayer(c, W, H, "f18s4bg", (q) => {
      for (let k = Math.floor((camX - 700) / SW4); k <= Math.floor((camX + 700) / SW4); k++) {
        cloudStep(q, k * SW4 + SW4 * 0.5 + 40, -k * SH4 - 120 + 2, SW4 * 1.1, STEP, k + 40, 0.9);
      }
      q.save(); q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = "source-atop"; q.fillStyle = "rgba(214,160,196,0.45)"; q.fillRect(0, 0, q.canvas.width, q.canvas.height); q.restore();
    });
    put(c, W, H, L, 1, 2.5);
    // the main steps
    for (let k = Math.floor((camX - 640) / SW4); k <= Math.floor((camX + 640) / SW4); k++) {
      cloudStep(c, k * SW4 + SW4 * 0.5, -k * SH4 + 2, SW4 * 1.18, STEP, k);
    }
    for (const m of PARADE) {
      const x = m.x0 + (t - 34) * (v + (m.dv || 0));
      if (Math.abs(x - camX) > 620) continue;
      const gy = stairY4(x);
      let y = gy;
      let pose = "walk", ph = t * (m.kitten ? 1.9 : 1.05) + m.x0 * 0.01;
      if (m.kitten) {
        // kittens hop from step to step: a parabolic bound, the shadow stays on the cloud top
        const u = ((t * 1.4 + m.x0 * 0.013) % 1 + 1) % 1;
        const lift = Math.sin(Math.PI * u);
        y -= lift * m.size * 0.5;
        pose = lift > 0.15 ? "run" : "walk";
        ph = lift > 0.15 ? 0.15 + u * 0.7 : ph;
        c.save();
        c.fillStyle = K.rgba("#2a2460", 0.32 * (1 - lift * 0.5));
        c.beginPath(); c.ellipse(x + m.size * 0.1, gy + 1, m.size * (0.7 - lift * 0.2), m.size * 0.1, 0, 0, TAU); c.fill();
        c.restore();
      }
      const sz = m.fluff ? m.size * 1.12 : m.size;
      if (m.fluff) {
        // the big black long-hair: a broader, fluffier body
        c.save(); c.translate(x, y); c.scale(1.14, 1); c.translate(-x, -y);
        stairCat(c, x, y, sz, 1, m.ci, t, ph, { pose, hat: m.hat, steps: 12, tailUp: 0.7, parade: 1 });
        c.restore();
      } else stairCat(c, x, y, sz, 1, m.ci, t, ph, { pose, hat: m.hat, steps: 12, tailUp: m.kitten ? 0.9 : 0.7, parade: 1 });
    }
    // foreground lip of cloud, blurred, passing faster
    soft(c, W, H, "f18s4fg", 8, (q) => {
      for (let k = Math.floor((camX - 900) / 300); k <= Math.floor((camX + 900) / 300); k++) {
        cloudStep(q, k * 300 + 60, stairY4(k * 300) + 150, 420, NEAR, k + 90, 0.95);
      }
    });
  });
  K.dust(g, W, H, t, { seed: 184, count: 30, color: "#ffd8c4", size: 1.3, alpha: 0.4 });
}

// ---- shot 5 [44-54] the top: a flat cloud plateau and the dark ring -------------------------------------------
// the plateau: a wide, level cloud top in perspective, painted once (puffs grow toward the camera)
const PLAT_CHUNKS = 6;
function platPuffs(hz) {
  const w = 1500, h = 560 - hz + 120;
  const R = K.rng("f18plat" + hz);
  const puffs = [];
  for (let i = 0; i < 420; i++) {
    const d = Math.pow(R(), 0.8);
    const y = 6 + Math.pow(d, 1.8) * (h - 10);
    const r = 9 + Math.pow(d, 1.8) * 95 * (0.6 + R() * 0.6);
    puffs.push([R() * w, y, r, 0.32]);
  }
  return puffs.sort((p1, p2) => p1[1] - p2[1]);
}
// one chunk of the plateau (a contiguous run of the depth-sorted puffs), so it can be baked a piece per frame
function plateauChunk(hz, ci) {
  const w = 1500, h = 560 - hz + 120;
  return K.sprite("f18platc:" + hz + ":" + ci, w, h, (s) => {
    if (ci === 0) {
      const gr = s.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#e2aac0");
      gr.addColorStop(0.08, "#a68ab8");
      gr.addColorStop(0.45, "#5e5294");
      gr.addColorStop(1, "#2a2862");
      s.fillStyle = gr;
      s.fillRect(0, 4, w, h);
    }
    const all = platPuffs(hz);
    const n = Math.ceil(all.length / PLAT_CHUNKS);
    const puffs = all.slice(ci * n, (ci + 1) * n);
    const pal = { lit: "#f2bcc8", mid: "#9a80b8", shade: "#4a4288" };
    for (const [x, y, r, f] of puffs) {
      s.save();
      s.translate(x, y);
      s.scale(1, f);
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
    if (ci === PLAT_CHUNKS - 1) {
      // the far edge glows with the horizon
      const eg = s.createLinearGradient(0, 0, 0, 40);
      eg.addColorStop(0, "rgba(255,196,192,0.75)");
      eg.addColorStop(1, "rgba(255,196,192,0)");
      s.fillStyle = eg;
      s.fillRect(0, 0, w, 40);
    }
  });
}
function plateauSprite(hz) {
  const w = 1500, h = 560 - hz + 120;
  return K.sprite("f18plateau2:" + hz, w, h, (s) => {
    for (let ci = 0; ci < PLAT_CHUNKS; ci++) s.drawImage(plateauChunk(hz, ci), 0, 0, w, h);
  });
}
// warm everything shot 5 and shot 6 need, a little per frame, in the 3 s before the cut at 44
const PLAT_DONE = new Set();
function warmShot5(t) {
  if (t < 40.5) return;
  for (const hz of [330, 300]) {
    for (let ci = 0; ci <= PLAT_CHUNKS; ci++) {
      const k = hz + ":" + ci;
      if (PLAT_DONE.has(k)) continue;
      PLAT_DONE.add(k);
      if (ci < PLAT_CHUNKS) plateauChunk(hz, ci); else plateauSprite(hz);
      return;
    }
  }
}
function plateau(g, W, H, t, hz) {
  cloudRow(g, -200, W + 200, hz + 6, 22, FAR, 31, t, 1.5, 0.8);
  g.drawImage(plateauSprite(hz), -270, hz - 2, 1500, 560 - hz + 120);
}
function shot5(g, W, H, t) {
  warmShot6(t);
  const p = K.ease.inOut(K.seg(t, 44, 54));
  const bump = Math.exp(-Math.max(0, t - 44) * 6) * (t >= 44 ? 1 : 0);
  const hz = 330;
  const RX = 560, RY = 220, RR = 150;
  // a slow push-in toward the ring
  K.withCamera(g, W, H, { x: K.lerp(480, 520, p), y: K.lerp(270, 250, p) + bump * 6, zoom: K.lerp(1.0, 1.15, p), shakeT: t, shakeAmt: 1.0 + bump * 4 }, (c) => {
    heaven(c, W, H, t, hz, { stars: 0.36, sunX: 840 });
    plateau(c, W, H, t, hz);
    // the gate: dead stone, a cold empty disc inside
    stoneRing(c, RX, RY + Math.sin(t * 0.5) * 2, RR, t, { tilt: 0.06, silver: 0.55 + 0.1 * Math.sin(t * 1.3), dead: 1 });
    // you, arriving at the top, from behind: two or three slow steps toward it, then still
    const walk = K.seg(t, 44.3, 48.3);
    const kx = K.lerp(300, 336, K.ease.out(walk)), ky = K.lerp(560, 522, K.ease.out(walk));
    const kh = K.lerp(250, 236, walk);
    kid(c, kx, ky, kh, t, { walk: walk < 1, phase: walk < 1 ? 0.25 + (t - 44.3) * 0.36 : 0.25 + 4 * 0.36, lx: 230, ly: -140, W, H, shade: 0.5, gy: ky });
    // the first cats arriving behind you, soft in the foreground
    const a = K.smooth(K.seg(t, 49, 52.5));
    if (a > 0.01) soft(c, W, H, "f18s5fg", 6, (q) => {
      catBack(q, 90, 600 - a * 40, 120, 1, { rim: RIM, v: 1, amb: "#6c60a8" });
      catBack(q, 820, 620 - a * 50, 150, 0, { rim: RIM, side: -1, amb: "#6c60a8" });
    }, a);
  });
  K.dust(g, W, H, t, { seed: 185, count: 22, color: "#e6ecff", size: 1.2, alpha: 0.3 });
}

// ---- shot 6 [54-66] wide from behind the crowd: a hundred cats sit and wait -------------------------------------
const CROWD6 = (() => {
  const out = [];
  const R = K.rng("f18crowd");
  const rows = 11;
  for (let r = 0; r < rows; r++) {
    const d = r / (rows - 1); // 0 far .. 1 near
    const y = 352 + Math.pow(d, 1.7) * 230;
    const h = 9 + Math.pow(d, 1.7) * 115;
    const n = Math.round(K.lerp(16, 6, d));
    const spread = K.lerp(330, 900, d);
    for (let i = 0; i < n; i++) {
      const x = 480 + ((i + 0.5) / n - 0.5) * spread * 2 + (R() - 0.5) * spread * 0.12;
      if (d < 0.25 && Math.abs(x - 480) < 40) continue; // leave a little space behind you
      out.push({ x, y: y + (R() - 0.5) * h * 0.12, h: h * (0.85 + R() * 0.3), ci: Math.floor(R() * 10), v: R() > 0.5 ? 1 : 0, side: R() > 0.5 ? 1 : -1, jit: R() });
    }
  }
  out.sort((a, b) => a.y - b.y);
  // settle front-to-back... no: the ones nearest you (far rows) first, the near rows last, across 54-60
  out.forEach((m, i) => { m.sit = 54.6 + (i / out.length) * 4.6 + m.jit * 0.6; });
  return out;
})();
const RING6 = { x: 480, y: 172 };
const backOpt6 = (m, rise) => ({ v: m.v, side: m.side, rim: RIM, rise, shadowColor: "#1c1a4a", amb: "#6c60a8", light: RING6 });
function warmShot6(t) {
  if (t < 50.5) return;
  warmBack(CROWD6.map((m) => [m.x, m.y, m.h, m.ci, backOpt6(m, 0)]), 3);
}
function shot6(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 54, 66));
  const hz = 300;
  // crane down and dolly forward over the crowd
  K.withCamera(g, W, H, { x: 480, y: K.lerp(240, 300, p), zoom: K.lerp(1.0, 1.12, p), shakeT: t, shakeAmt: 0.8 }, (c) => {
    heaven(c, W, H, t, hz, { stars: 0.3, sunX: 840 });
    plateau(c, W, H, t, hz);
    stoneRing(c, RING6.x, RING6.y + Math.sin(t * 0.5) * 1.2, 92, t, { tilt: 0.06, silver: 0.6, dead: 1 });
    kid(c, 480, 322, 62, t, { walk: false, phase: 0.25, lx: 0, ly: -260, W, H, shade: 0.5, gy: 322 });
    const far = [], near = [];
    for (const m of CROWD6) (m.h < 45 ? far : near).push(m);
    const paint = (q, list) => {
      for (const m of list) {
        // each cat pads in a little way, then settles: walk -> sit, staggered across 54-60
        const arrive = K.ease.out(K.seg(t, m.sit - 1.6, m.sit - 0.2));
        const rise = 1 - K.ease.inOut(K.seg(t, m.sit - 0.3, m.sit + 0.5));
        const gait = rise > 0.5 && arrive < 1 ? Math.abs(Math.sin((t + m.x * 0.01) * 7)) * m.h * 0.035 : 0;
        const y = m.y + (1 - arrive) * m.h * 0.3 - gait;
        catBack(q, m.x + (1 - arrive) * (m.x - 480) * 0.05, y, m.h, m.ci, backOpt6(m, rise));
      }
    };
    paint(c, far);
    const L = inLayer(c, W, H, "f18s6near", (q) => paint(q, near));
    put(c, W, H, L, 1, 1.6);
  });
}

// ---- assembly ---------------------------------------------------------------------------------------------------
const SHOTS = [[0, 12, shot1], [12, 22, shot2], [22, 34, shot3], [34, 44, shot4], [44, 54, shot5], [54, 66.01, shot6]];

const L18 = lines([
  [3.0, 7.0, "The stairs went up into the sky."],
  [13.0, 17.0, "You thought you were climbing alone."],
  [19.0, 23.0, "But they came. All of them."],
  [24.0, 29.5, "Every cat you ever found, walking with you."],
  [35.0, 40.0, "A whole parade, just for one orange cat."],
  [45.0, 49.5, "At the top, the portal. Dark."],
  [50.0, 53.5, "No light. No way through.", { rate: 0.88, pitch: 0.97 }],
  [56.0, 63.0, "And a hundred cats, waiting to see what you would do."],
]);

export const film = {
  id: 18,
  title: "The Procession",
  chapter: "Chapter 18",
  unlockAt: 90,
  duration: D,
  poster: 34,
  tagline: "You are not walking alone.",
  subs: L18.subs,
  voice: L18.voice,
  score: { mood: "epic", key: "G", bpm: 84, cues: [[3, "swell"], [18, "purr"], [32, "swell"], [44, "hit"], [58, "swell"]] },
  draw(g, t, W, H) {
    g.save();
    if (W !== 960 || H !== 540) g.scale(W / 960, H / 540);
    W = 960; H = 540;
    try {
      g.fillStyle = "#171a4a";
      g.fillRect(0, 0, W, H);
      for (const [a, b, fn] of SHOTS) if (t >= a && t < b) { fn(g, W, H, t); break; }
      if (t >= 66.01) shot6(g, W, H, 66);
      // cross-dissolve from the parade into the plateau? no: a hard cut on the hit at 44. Soft dissolve 53.4-54.
      K.bloom(g, 0.32);
      K.grade(g, W, H, { tint: "#d8a0c0", alpha: 0.14, mode: "soft-light", shadows: "#5a56a8", shadowAlpha: 0.12 });
      K.vignette(g, W, H, 0.58);
      K.grain(g, W, H, t, 0.03);
      K.letterbox(g, W, H, 1);
      const ta = K.env(t, 2, 6, 1.0, 1.2);
      if (ta > 0) K.title(g, W, H, "The Procession", "Chapter 18", ta, { glow: "#ffb8a8", y: H * 0.3 });
      K.fadeBlack(g, W, H, 1 - K.smooth(K.seg(t, 0, 1.6)));
      K.fadeBlack(g, W, H, K.smooth(K.seg(t, 64.4, 66)));
    } finally {
      g.restore();
    }
  },
};
