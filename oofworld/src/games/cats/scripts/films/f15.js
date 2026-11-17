// films/f15.js - Chapter 15 "Too Loud" (FILMS.md f15). The Meme Dimension: a vaporwave sunset that
// does not do quiet. Smash-in, a three-gag montage, the letterbox breaks, then the DROP freezes time and
// one amber pawprint leads through a frozen mall to a shop that was closed forever.
// draw(g, t, W, H) is a pure function of t: every shot works from p = seg(t, a, b); only static art is cached.
import * as K from "../filmkit.js";

const D = 60;
const TAU = Math.PI * 2;
const BPM = 128;
const PAL = ["#ff4fd8", "#7af7ff", "#fff27a", "#b47aff", "#ffffff", "#ff9a5a"];

// ---- small utilities --------------------------------------------------------------------------------
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

// ---- the vaporwave world ------------------------------------------------------------------------------
function vaporSky(g, W, H, hz) {
  const gr = g.createLinearGradient(0, -H * 0.4, 0, hz);
  gr.addColorStop(0, "#1aa6e0");
  gr.addColorStop(0.3, "#5fe6ff");
  gr.addColorStop(0.55, "#b9d4ff");
  gr.addColorStop(0.78, "#ff9ad8");
  gr.addColorStop(1, "#ff6fd8");
  g.fillStyle = gr;
  g.fillRect(-W, -H, W * 3, hz + H + 1);
}
function vaporSun(g, x, y, r, t) {
  K.glow(g, x, y, r * 4.2, "#ff5fc8", 0.45);
  K.glow(g, x, y, r * 2.2, "#ffd27a", 0.45);
  g.save();
  const c = new Path2D();
  c.arc(x, y, r, 0, TAU);
  g.clip(c);
  const bands = new Path2D();
  bands.rect(x - r - 4, y - r - 4, r * 2 + 8, r * 2 + 8);
  const sl = (t * 0.22) % 1;
  for (let i = 0; i < 8; i++) {
    const u = (i + sl) / 8;
    const by = y + r * 0.02 + u * r;
    const bh = 1.2 + u * u * r * 0.11;
    bands.rect(x - r - 4, by, r * 2 + 8, bh);
  }
  g.clip(bands, "evenodd");
  const sg = g.createLinearGradient(0, y - r, 0, y + r);
  sg.addColorStop(0, "#fffbd0");
  sg.addColorStop(0.3, "#ffd56a");
  sg.addColorStop(0.62, "#ff8a6a");
  sg.addColorStop(1, "#ff2fa8");
  g.fillStyle = sg;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
}
function mountains(g, W, hz, seed, col, rim, height, x0) {
  const R = K.rng("mtn" + seed);
  g.beginPath();
  g.moveTo(-W, hz + 2);
  let x = -W + (x0 || 0);
  const pts = [];
  while (x < W * 2) {
    const peak = R() < 0.3;
    const y = hz - (peak ? height * (0.6 + R() * 0.4) : height * (0.15 + R() * 0.35));
    pts.push([x, y]);
    x += 30 + R() * 60;
  }
  for (const [px, py] of pts) g.lineTo(px, py);
  g.lineTo(W * 2, hz + 2);
  g.closePath();
  const mg = g.createLinearGradient(0, hz - height, 0, hz);
  mg.addColorStop(0, K.shade(col, 0.15));
  mg.addColorStop(1, col);
  g.fillStyle = mg;
  g.fill();
  // neon wire ridgelines
  g.save();
  g.globalCompositeOperation = "lighter";
  g.strokeStyle = K.rgba(rim, 0.5);
  g.lineWidth = 1;
  g.beginPath();
  pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
  g.stroke();
  g.strokeStyle = K.rgba(rim, 0.14);
  g.beginPath();
  for (const [px, py] of pts) { g.moveTo(px, py); g.lineTo(px + (K.hash(px, seed) - 0.5) * 30, hz); }
  g.stroke();
  g.restore();
}
function palm(g, x, y, h, lean, t, col) {
  const tx = x + lean * h * 0.55, ty = y - h;
  const p = new Path2D();
  K.tube(p, [x, y, x + lean * h * 0.25, y - h * 0.5, tx, ty], [h * 0.065, h * 0.045, h * 0.03], 4);
  g.fillStyle = col;
  g.fill(p);
  g.strokeStyle = K.rgba("#ff9ad8", 0.16);
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 1; i < 12; i++) {
    const u = i / 12;
    const sx = K.lerp(x, tx, u) + lean * h * 0.08 * Math.sin(u * Math.PI);
    const sy = K.lerp(y, ty, u);
    g.moveTo(sx - h * 0.022, sy); g.lineTo(sx + h * 0.022, sy - 2);
  }
  g.stroke();
  // fronds: a drooping spine with leaflets on both sides
  const spine = new Path2D(), leaf = new Path2D();
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.42 + Math.sin(t * 1.2 + i * 1.7) * 0.035;
    const len = h * (0.44 + K.hash(i, h) * 0.18);
    const dx = Math.cos(a), dy = Math.sin(a);
    const ex = tx + dx * len, ey = ty + dy * len * 0.45 + len * (0.35 + Math.abs(dx) * 0.35);
    const cx = tx + dx * len * 0.55, cy = ty + dy * len * 0.7 - len * 0.12;
    spine.moveTo(tx, ty);
    spine.quadraticCurveTo(cx, cy, ex, ey);
    const N = 14;
    for (let k = 1; k < N; k++) {
      const u = k / N, iu = 1 - u;
      const px = iu * iu * tx + 2 * iu * u * cx + u * u * ex;
      const py = iu * iu * ty + 2 * iu * u * cy + u * u * ey;
      const tgx = 2 * iu * (cx - tx) + 2 * u * (ex - cx), tgy = 2 * iu * (cy - ty) + 2 * u * (ey - cy);
      const tl = Math.hypot(tgx, tgy) || 1;
      const nx = -tgy / tl, ny = tgx / tl;
      const ll = h * 0.11 * Math.sin(Math.PI * (0.15 + u * 0.85)) + h * 0.015;
      for (const sd of [-1, 1]) {
        leaf.moveTo(px, py);
        leaf.lineTo(px + (nx * sd * 0.8 + (tgx / tl) * 0.45) * ll, py + (ny * sd * 0.8 + (tgy / tl) * 0.45) * ll + ll * 0.55);
      }
    }
  }
  g.strokeStyle = col;
  g.lineCap = "round";
  g.lineWidth = Math.max(1.2, h * 0.016);
  g.stroke(spine);
  g.lineWidth = Math.max(1, h * 0.011);
  g.stroke(leaf);
}
function grid(g, W, H, hz, t, o = {}) {
  const cx = o.cx == null ? W / 2 : o.cx;
  const fg = g.createLinearGradient(0, hz, 0, H + 200);
  fg.addColorStop(0, "#5a1a7a");
  fg.addColorStop(0.15, "#2c0b4a");
  fg.addColorStop(1, "#10041e");
  g.fillStyle = fg;
  g.fillRect(-W, hz, W * 3, H * 2);
  // sun reflection on the glossy floor
  if (o.sunX != null) {
    g.save();
    g.globalCompositeOperation = "lighter";
    // a vertical glossy streak: brightest and narrowest at the horizon, widening and fading toward
    // the camera; the grid lines drawn on top break it into a column of glints
    const sx = o.sunX;
    g.save();
    g.translate(sx, hz); g.scale(1, 3.4);
    const eg = g.createRadialGradient(0, 0, 0, 0, 0, 110);
    eg.addColorStop(0, K.rgba("#ffd0a0", 0.55));
    eg.addColorStop(0.35, K.rgba("#ff9ad0", 0.26));
    eg.addColorStop(1, K.rgba("#ff4fd8", 0));
    g.fillStyle = eg;
    g.beginPath(); g.arc(0, 0, 110, 0, Math.PI); g.fill();
    g.restore();
    // a hotter core with a soft horizontal falloff
    const cg = g.createLinearGradient(sx - 60, 0, sx + 60, 0);
    cg.addColorStop(0, K.rgba("#fff0c8", 0));
    cg.addColorStop(0.5, K.rgba("#fff0c8", 0.28));
    cg.addColorStop(1, K.rgba("#fff0c8", 0));
    g.fillStyle = cg;
    g.fillRect(sx - 60, hz, 120, (H - hz) * 0.55);
    // a few soft shimmer ripples (gradient-faded, not hard slabs)
    for (let i = 0; i < 6; i++) {
      const u = ((i + t * 0.35) % 6) / 6;
      const yy = hz + Math.pow(u, 1.5) * (H - hz);
      const w = 70 + u * 160;
      const sg = g.createLinearGradient(sx - w / 2, 0, sx + w / 2, 0);
      sg.addColorStop(0, K.rgba("#ffc0e8", 0));
      sg.addColorStop(0.5, K.rgba("#ffc0e8", 0.16 * (1 - u)));
      sg.addColorStop(1, K.rgba("#ffc0e8", 0));
      g.fillStyle = sg;
      g.fillRect(sx - w / 2 + Math.sin(t * 2 + i) * 5, yy, w, 1.5 + u * 3);
    }
    g.restore();
  }
  const speed = o.speed == null ? 1 : o.speed;
  const phase = ((t * speed) % 1 + 1) % 1;
  const pulse = o.pulse || 0;
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  // horizontal lines
  for (let k = 0; k < 34; k++) {
    const z = 0.45 + (k - phase) * 0.55;
    if (z <= 0.2) continue;
    const y = hz + (H - hz) * 0.55 / z;
    if (y > H + 220 || y < hz) continue;
    const near = K.clamp((y - hz) / (H - hz));
    const a = Math.pow(near, 0.7) * (0.85 + pulse * 0.3);
    g.strokeStyle = K.rgba("#ff00c8", 0.22 * a);
    g.lineWidth = 2 + near * 5;
    g.beginPath(); g.moveTo(-W, y); g.lineTo(W * 2, y); g.stroke();
    g.strokeStyle = K.rgba("#ff7ae6", 0.9 * a);
    g.lineWidth = 0.6 + near * 1.6;
    g.beginPath(); g.moveTo(-W, y); g.lineTo(W * 2, y); g.stroke();
  }
  // converging lines
  const vg = g.createLinearGradient(0, hz, 0, H + 100);
  vg.addColorStop(0, K.rgba("#ff00c8", 0));
  vg.addColorStop(0.5, K.rgba("#ff4fe0", 0.7 + pulse * 0.2));
  vg.addColorStop(1, K.rgba("#ff9af0", 1));
  g.strokeStyle = vg;
  const p1 = new Path2D(), p2 = new Path2D();
  for (let i = -24; i <= 24; i++) {
    const bx = cx + i * 95;
    p1.moveTo(cx + i * 2, hz); p1.lineTo(cx + (bx - cx) * 2.2, H + 340);
  }
  p2.addPath(p1);
  g.lineWidth = 4;
  g.globalAlpha = 0.25;
  g.stroke(p1);
  g.globalAlpha = 1;
  g.lineWidth = 1.3;
  g.stroke(p2);
  g.restore();
  // horizon haze
  const hg = g.createLinearGradient(0, hz - 40, 0, hz + 60);
  hg.addColorStop(0, K.rgba("#ffb8ee", 0));
  hg.addColorStop(0.42, K.rgba("#ffc8f0", 0.5));
  hg.addColorStop(1, K.rgba("#ff7ad8", 0));
  g.fillStyle = hg;
  g.fillRect(-W, hz - 40, W * 3, 100);
}
function chromeSphere(g, x, y, r, floorY) {
  if (floorY != null) {
    const d = floorY - y;
    const sr = r * (1.1 - K.clamp(d / 600) * 0.5);
    const sg = g.createRadialGradient(x, floorY, 0, x, floorY, sr);
    sg.addColorStop(0, "rgba(10,0,20,0.5)");
    sg.addColorStop(1, "rgba(10,0,20,0)");
    g.save(); g.translate(x, floorY); g.scale(1, 0.18); g.translate(-x, -floorY);
    g.fillStyle = sg; g.beginPath(); g.arc(x, floorY, sr, 0, TAU); g.fill(); g.restore();
  }
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.clip();
  const sg = g.createLinearGradient(0, y - r, 0, y + r);
  sg.addColorStop(0, "#dffcff");
  sg.addColorStop(0.25, "#7af7ff");
  sg.addColorStop(0.47, "#ff9ad8");
  sg.addColorStop(0.5, "#fff3fb");
  sg.addColorStop(0.53, "#3a0c58");
  sg.addColorStop(0.8, "#1c0630");
  sg.addColorStop(1, "#ff4fd8");
  g.fillStyle = sg;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  // warped grid reflection in the lower half
  g.strokeStyle = "rgba(255,80,220,0.55)";
  g.lineWidth = Math.max(0.6, r * 0.02);
  g.beginPath();
  for (let i = 1; i < 5; i++) {
    const yy = y + r * (0.05 + Math.pow(i / 5, 1.6) * 0.95);
    g.moveTo(x - r, yy); g.quadraticCurveTo(x, yy + r * 0.12 * (i / 5), x + r, yy);
  }
  for (let i = -3; i <= 3; i++) { g.moveTo(x + i * r * 0.08, y + r * 0.03); g.quadraticCurveTo(x + i * r * 0.25, y + r * 0.5, x + i * r * 0.55, y + r); }
  g.stroke();
  // sun reflection
  K.glow(g, x + r * 0.2, y - r * 0.05, r * 0.35, "#ffd27a", 0.7);
  // fresnel darkening at the rim
  const fr = g.createRadialGradient(x - r * 0.15, y - r * 0.15, r * 0.4, x, y, r);
  fr.addColorStop(0, "rgba(30,0,50,0)");
  fr.addColorStop(0.85, "rgba(30,0,50,0.25)");
  fr.addColorStop(1, "rgba(20,0,40,0.65)");
  g.fillStyle = fr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
  K.glow(g, x - r * 0.38, y - r * 0.42, r * 0.38, "#ffffff", 0.9);
  K.glow(g, x - r * 0.38, y - r * 0.42, r * 0.1, "#ffffff", 1);
}
function chromePyramid(g, x, y, s, rot) {
  const c = Math.cos(rot), sn = Math.sin(rot);
  const apex = [x, y - s];
  const b = [0, 1, 2].map((i) => {
    const a = rot + i * TAU / 3;
    return [x + Math.cos(a) * s * 0.75, y + s * 0.35 + Math.sin(a) * s * 0.22];
  });
  const faces = [[b[0], b[1]], [b[1], b[2]], [b[2], b[0]]]
    .map(([p, q]) => ({ p, q, z: (p[1] + q[1]) / 2 }))
    .sort((m, n) => m.z - n.z);
  for (const f of faces) {
    const lx = (f.p[0] + f.q[0]) / 2 - x;
    const gr = g.createLinearGradient(apex[0], apex[1], (f.p[0] + f.q[0]) / 2, f.z);
    const lit = K.clamp(0.5 + lx / (s * 1.4) + c * 0.1 + sn * 0.05);
    gr.addColorStop(0, K.mix("#ffffff", "#7af7ff", 1 - lit));
    gr.addColorStop(0.5, K.mix("#ff9ad8", "#7af7ff", lit));
    gr.addColorStop(0.55, "#fff0fb");
    gr.addColorStop(0.6, K.mix("#2a0a40", "#5a1a7a", lit));
    gr.addColorStop(1, "#ff4fd8");
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(apex[0], apex[1]); g.lineTo(f.p[0], f.p[1]); g.lineTo(f.q[0], f.q[1]); g.closePath(); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.35)";
    g.lineWidth = 0.8;
    g.stroke();
  }
  K.glow(g, apex[0], apex[1] + s * 0.05, s * 0.25, "#ffffff", 0.7);
}
function sparkle(g, x, y, s, a, rot, color) {
  if (a <= 0.01 || s <= 0.1) return;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.globalAlpha *= a;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(-s, 0); g.quadraticCurveTo(0, 0, 0, -s); g.quadraticCurveTo(0, 0, s, 0); g.quadraticCurveTo(0, 0, 0, s); g.quadraticCurveTo(0, 0, -s, 0);
  g.fill();
  g.restore();
}
function burst(g, cx, cy, t, n, seed, life) {
  if (t < 0 || t > life) return;
  const k = K.ease.out(t / life);
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const a = K.hash(i, seed) * TAU;
    const sp = 200 + K.hash(i + 0.3, seed) * 700;
    const x = cx + Math.cos(a) * sp * k;
    const y = cy + Math.sin(a) * sp * k * 0.75 + t * t * 60;
    const col = PAL[i % PAL.length];
    const al = (1 - t / life) * (0.6 + K.hash(i + 0.7, seed) * 0.4);
    if (i % 3) {
      g.save(); g.translate(x, y); g.rotate(t * (3 + i % 5) + i); g.globalAlpha = al; g.fillStyle = col;
      g.fillRect(-4, -1.6, 8, 3.2); g.restore();
    } else sparkle(g, x, y, 4 + (i % 4) * 2, al, t * 2 + i, col);
  }
  g.restore();
}

// The whole vaporwave plain (shots 1, 3, 4). tt drives motion (frozen in shot 4).
function plain(g, W, H, tt, o = {}) {
  const hz = 300;
  vaporSky(g, W, H, hz);
  K.clouds(g, W, H, tt, { seed: 15, color: "#ffe1f6", shade: "#c78ad8", count: 6, y: 120, spread: 60, speed: 14, scale: 1.1, alpha: 0.55 });
  vaporSun(g, 480, hz - 60, 118, tt);
  mountains(g, W, hz, 1, K.mix("#7a3aa8", "#ff9ad8", 0.45), "#ffd0f6", 70, 0);
  mountains(g, W, hz, 2, "#3a1060", "#ff4fd8", 44, 40);
  // palms on the horizon, hazed
  palm(g, 160, hz + 6, 150, -0.35, tt, "#2a0838");
  palm(g, 215, hz + 4, 110, 0.25, tt + 1, "#3a1050");
  palm(g, 790, hz + 6, 170, 0.3, tt + 2, "#2a0838");
  palm(g, 860, hz + 4, 105, -0.2, tt + 3, "#3a1050");
  grid(g, W, H, hz, tt, { sunX: 480, speed: o.speed == null ? 1.6 : o.speed, pulse: o.pulse || 0 });
}

// ---- the kid with hands over the ears (drawPerson has no "arms up", so we add them) ----------------------
function kidEars(g, x, y, h, t, o = {}) {
  // contact shadow on the grid: a dark core under the boots + a wider soft falloff
  const sh = g.createRadialGradient(x, y, 0, x, y, h * 0.24);
  sh.addColorStop(0, "rgba(10,0,20,0.75)");
  sh.addColorStop(0.35, "rgba(10,0,20,0.45)");
  sh.addColorStop(1, "rgba(10,0,20,0)");
  g.save(); g.translate(x, y); g.scale(1, 0.16); g.translate(-x, -y);
  g.fillStyle = sh; g.beginPath(); g.arc(x, y, h * 0.22, 0, TAU); g.fill(); g.restore();
  g.save();
  g.beginPath();
  g.rect(x - h * 0.117, y - h * 1.2, h * 0.234, h * 1.25);
  g.clip();
  K.drawPerson(g, x, y, h, { view: "back", t, hood: false, shadow: false, light: o.light });
  g.restore();
  const wob = o.shake ? Math.sin(t * 23) * h * 0.003 : 0;
  for (const s of [-1, 1]) {
    // elbows flared out wide and LOW (below the hands), palms clamped flat over the ears at
    // head-centre height: "too loud", not "oh no"
    const shp = [x + s * h * 0.095, y - h * 0.79];
    const el = [x + s * h * 0.235, y - h * 0.815 + wob];
    const hd = [x + s * h * 0.082, y - h * 0.9 + wob];
    const p = new Path2D();
    K.tube(p, [shp[0], shp[1], el[0], el[1], hd[0] + s * h * 0.03, hd[1] + h * 0.022], [h * 0.085, h * 0.072, h * 0.052], 5, true, false);
    const ag = g.createLinearGradient(x + s * h * 0.06, 0, x + s * h * 0.26, 0);
    ag.addColorStop(0, "#9a7410");
    ag.addColorStop(0.45, "#e8b923");
    ag.addColorStop(1, "#b88a12");
    g.fillStyle = ag;
    g.fill(p);
    g.strokeStyle = "rgba(90,60,0,0.45)";
    g.lineWidth = h * 0.004;
    g.beginPath();
    g.moveTo(el[0] - s * h * 0.02, el[1] + h * 0.015);
    g.quadraticCurveTo(el[0], el[1] - h * 0.005, el[0] - s * h * 0.01, el[1] - h * 0.025);
    g.stroke();
    // rim light from the sun behind
    if (o.light) {
      g.save();
      g.globalCompositeOperation = "lighter";
      g.strokeStyle = K.rgba(o.light.color || "#ffb0e8", 0.5);
      g.lineWidth = h * 0.008;
      g.beginPath();
      g.moveTo(shp[0], shp[1] - h * 0.04);
      g.quadraticCurveTo(el[0] - s * h * 0.01, el[1] - h * 0.05, hd[0] + s * h * 0.02, hd[1] - h * 0.035);
      g.stroke();
      g.restore();
    }
    // sleeve cuff, then the back of the hand pressed flat over the ear (fingers pointing up)
    g.fillStyle = "#c99a18";
    g.beginPath();
    g.ellipse(hd[0] + s * h * 0.028, hd[1] + h * 0.026, h * 0.03, h * 0.02, s * 0.9, 0, TAU);
    g.fill();
    const hg = g.createRadialGradient(hd[0] + s * h * 0.008, hd[1], 0, hd[0], hd[1], h * 0.045);
    hg.addColorStop(0, "#e9b994");
    hg.addColorStop(1, "#b87c5a");
    g.fillStyle = hg;
    g.beginPath();
    g.ellipse(hd[0], hd[1] - h * 0.004, h * 0.026, h * 0.04, s * 0.18, 0, TAU);
    g.fill();
    g.strokeStyle = "rgba(140,80,50,0.45)";
    g.lineWidth = h * 0.0035;
    g.beginPath();
    for (let f = -1; f <= 1; f++) { g.moveTo(hd[0] + f * h * 0.009, hd[1] - h * 0.035); g.lineTo(hd[0] + f * h * 0.008, hd[1] - h * 0.012); }
    g.stroke();
  }
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
    chromeSphere(g, 600, 400 + bob(2), 58, 500);
    chromePyramid(g, 860, 230 + bob(3), 48, t * 0.6);
    chromePyramid(g, 120, 380 + bob(4), 38, -t * 0.5);
    burst(g, 480, 250, t, 140, 3, 3.2);
  });
  K.glow(g, 480, 240, 400, "#ffffff", 0.5 * Math.exp(-t * 4));
}

// ---- shot 2: three micro gags ---------------------------------------------------------------------------
function checkerFloor(g, W, H, hz, offX, c1, c2) {
  const fg = g.createLinearGradient(0, hz, 0, H);
  fg.addColorStop(0, c1);
  fg.addColorStop(1, K.shade(c1, -0.15));
  g.fillStyle = fg;
  g.fillRect(0, hz, W, H - hz);
  const pA = new Path2D();
  const cx = W / 2;
  const rows = 12;
  for (let r = 0; r < rows; r++) {
    const z0 = 0.5 + r * 0.5, z1 = z0 + 0.5;
    const y0 = hz + (H - hz) * 0.5 / z0 * 1.0, y1 = hz + (H - hz) * 0.5 / z1;
    for (let c = -16; c < 16; c++) {
      if ((c + r + 400) % 2) continue;
      const xw0 = c * 60 - offX % 120, xw1 = xw0 + 60;
      pA.moveTo(cx + xw0 / z0, y0); pA.lineTo(cx + xw1 / z0, y0); pA.lineTo(cx + xw1 / z1, y1); pA.lineTo(cx + xw0 / z1, y1); pA.closePath();
    }
  }
  g.fillStyle = c2;
  g.fill(pA);
  const hg = g.createLinearGradient(0, hz, 0, hz + 80);
  hg.addColorStop(0, K.rgba(c1, 0.9));
  hg.addColorStop(1, K.rgba(c1, 0));
  g.fillStyle = hg;
  g.fillRect(0, hz, W, 80);
}
function bokeh(g, W, H, t, seed, n, cols) {
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const x = ((K.hash(i, seed) * (W + 200) + t * (10 + K.hash(i + 0.2, seed) * 20)) % (W + 200)) - 100;
    const y = K.hash(i + 0.5, seed) * H * 0.7;
    const r = 10 + K.hash(i + 0.9, seed) * 34;
    const c = cols[i % cols.length];
    g.fillStyle = K.rgba(c, 0.08 + 0.06 * Math.sin(t * 2 + i));
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.strokeStyle = K.rgba(c, 0.1);
    g.lineWidth = 1.2;
    g.stroke();
  }
  g.restore();
}
// A neon sign on a wall bracket: kind 0 = cat head outline, 1 = "HA HA" sound wave. Glass tube
// core + coloured halo + a soft pool of light on the wall below it.
function neonSign(g, x, y, t, col, kind) {
  const flick = 0.85 + 0.15 * Math.sin(t * 31 + kind * 2) * Math.sin(t * 7.3);
  // bracket rods to the wall and the wall glow
  g.fillStyle = "rgba(90,30,80,0.55)";
  g.fillRect(x - 52, y - 46, 3, 50); g.fillRect(x + 50, y - 46, 3, 50);
  const wg = g.createRadialGradient(x, y + 30, 0, x, y + 30, 170);
  wg.addColorStop(0, K.rgba(col, 0.3 * flick)); wg.addColorStop(1, K.rgba(col, 0));
  g.save(); g.globalCompositeOperation = "lighter";
  g.fillStyle = wg; g.fillRect(x - 170, y - 140, 340, 340);
  const p = new Path2D();
  if (kind === 0) {
    p.moveTo(x - 40, y + 30);
    p.quadraticCurveTo(x - 50, y - 6, x - 38, y - 22);
    p.lineTo(x - 42, y - 52); p.lineTo(x - 16, y - 32);
    p.quadraticCurveTo(x, y - 37, x + 16, y - 32);
    p.lineTo(x + 42, y - 52); p.lineTo(x + 38, y - 22);
    p.quadraticCurveTo(x + 50, y - 6, x + 40, y + 30);
    p.quadraticCurveTo(x, y + 44, x - 40, y + 30);
    // eyes + smile + whiskers
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
  g.lineCap = "round"; g.lineJoin = "round";
  g.strokeStyle = K.rgba(col, 0.28 * flick); g.lineWidth = 14; g.stroke(p);
  g.strokeStyle = K.rgba(col, 0.6 * flick); g.lineWidth = 6; g.stroke(p);
  g.strokeStyle = K.rgba("#f4ffff", 0.95 * flick); g.lineWidth = 2.2; g.stroke(p);
  if (kind === 1) {
    g.font = "700 22px Fredoka, sans-serif"; g.textAlign = "center";
    g.fillStyle = K.rgba("#fff4fb", 0.9 * flick);
    g.shadowColor = col; g.shadowBlur = 14;
    g.fillText("HA HA", x, y + 34);
    g.shadowBlur = 0;
  }
  g.restore();
}
function gagRoll(g, W, H, t) { // local t 0..2.67
  K.withCamera(g, W, H, { zoom: 1 + t * 0.025, shakeT: t, shakeAmt: 1.2 }, () => {
    const wg = g.createLinearGradient(0, 0, 0, 330);
    wg.addColorStop(0, "#ff7ad6");
    wg.addColorStop(1, "#ffc2ec");
    g.fillStyle = wg;
    g.fillRect(-50, -50, W + 100, 400);
    bokeh(g, W, 330, t + 3, 2, 16, ["#ffffff", "#7af7ff", "#fff27a"]);
    // two neon signs on wall brackets: a cat head and a "HA HA" wave, each with a soft glow on the wall
    neonSign(g, 225, 120, t, "#7af7ff", 0);
    neonSign(g, 735, 110, t + 0.4, "#ff4fd8", 1);
    checkerFloor(g, W + 100, H + 50, 330, 0, "#ffd9f2", "#7af7ff");
    const roll = Math.sin(t * 5.5) * 0.16;
    const cx = 470 + Math.sin(t * 5.5) * 24, floor = 372;
    // floor shadow
    const sg = g.createRadialGradient(cx, floor, 0, cx, floor, 160);
    sg.addColorStop(0, "rgba(90,20,80,0.5)"); sg.addColorStop(1, "rgba(90,20,80,0)");
    g.save(); g.translate(cx, floor); g.scale(1, 0.15); g.fillStyle = sg; g.beginPath(); g.arc(0, 0, 160, 0, TAU); g.fill(); g.restore();
    g.save();
    g.translate(cx, floor - 200);
    g.rotate(Math.PI + roll);
    // on his back, legs kicking at the air (stand-pose paws, not mushrooms)
    K.drawCat(g, 0, -60, 140, {
      pose: "stand", coat: K.COATS.grey, headTurn: 1, headTilt: -0.3, mouth: 0.45 + 0.4 * Math.abs(Math.sin(t * 9)),
      blink: 0.75, t, tail: 1, shadow: false, collar: false, light: { x: 0, y: 400, color: "#7af7ff", strength: 1.2 },
    });
    g.restore();
  });
}
function gagRecord(g, W, H, t) {
  K.withCamera(g, W, H, { zoom: 1.04 - t * 0.012, shakeT: t, shakeAmt: 1 }, () => {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#1a0630");
    bg.addColorStop(1, "#3a0c58");
    g.fillStyle = bg;
    g.fillRect(-50, -50, W + 100, H + 100);
    K.godRays(g, 480, -40, W, H, { color: "#ff4fd8", count: 7, strength: 0.4, t, spread: 1.2, seed: 4 });
    K.godRays(g, 200, -40, W, H, { color: "#7af7ff", count: 5, strength: 0.3, t: t + 2, spread: 0.8, angle: 1.2, seed: 9 });
    bokeh(g, W, H, t, 7, 14, ["#ff4fd8", "#7af7ff", "#b47aff"]);
    // deck
    const dx = 480, dy = 400;
    g.fillStyle = "#16101c";
    g.beginPath(); g.moveTo(90, 330); g.lineTo(870, 330); g.lineTo(960, 560); g.lineTo(0, 560); g.closePath(); g.fill();
    const lg = g.createLinearGradient(0, 330, 0, 560);
    lg.addColorStop(0, "rgba(255,255,255,0.18)"); lg.addColorStop(0.08, "rgba(255,255,255,0.02)"); lg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = lg; g.fill();
    // platter + record
    g.fillStyle = "#9aa0aa";
    g.beginPath(); g.ellipse(dx, dy + 8, 300, 96, 0, 0, TAU); g.fill();
    g.fillStyle = "#0c0a0e";
    g.beginPath(); g.ellipse(dx, dy, 290, 90, 0, 0, TAU); g.fill();
    g.strokeStyle = "rgba(120,110,140,0.18)";
    g.lineWidth = 0.8;
    for (let i = 0; i < 26; i++) { g.beginPath(); g.ellipse(dx, dy, 90 + i * 7.6, 28 + i * 2.38, 0, 0, TAU); g.stroke(); }
    // rotating sheen wedges
    const a = t * 4;
    g.save();
    g.beginPath(); g.ellipse(dx, dy, 290, 90, 0, 0, TAU); g.clip();
    g.translate(dx, dy); g.scale(1, 0.31);
    g.globalCompositeOperation = "lighter";
    for (const off of [0, Math.PI]) {
      const gr = g.createRadialGradient(0, 0, 80, 0, 0, 290);
      gr.addColorStop(0, "rgba(255,120,230,0)");
      gr.addColorStop(0.6, "rgba(255,160,240,0.22)");
      gr.addColorStop(1, "rgba(122,247,255,0.1)");
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 290, -a * 0.25 + off, -a * 0.25 + off + 0.35); g.closePath(); g.fill();
    }
    g.restore();
    // label
    g.save(); g.translate(dx, dy); g.scale(1, 0.31);
    g.fillStyle = "#ff4fd8"; g.beginPath(); g.arc(0, 0, 82, 0, TAU); g.fill();
    g.strokeStyle = "#fff27a"; g.lineWidth = 4;
    g.beginPath(); g.arc(0, 0, 60, a, a + 1.2); g.stroke();
    g.beginPath(); g.arc(0, 0, 60, a + Math.PI, a + Math.PI + 1.2); g.stroke();
    g.restore();
    // rotating highlight wedge across the grooves (reads as spin even in a still)
    g.save();
    g.beginPath(); g.ellipse(dx, dy, 290, 90, 0, 0, TAU); g.ellipse(dx, dy, 86, 27, 0, 0, TAU); g.clip("evenodd");
    g.translate(dx, dy); g.scale(1, 0.31);
    g.globalCompositeOperation = "lighter";
    const wa = -a * 0.6;
    const wgr = g.createRadialGradient(0, 0, 90, 0, 0, 290);
    wgr.addColorStop(0, "rgba(255,255,255,0.05)"); wgr.addColorStop(0.7, "rgba(255,240,255,0.32)"); wgr.addColorStop(1, "rgba(200,250,255,0.12)");
    g.fillStyle = wgr;
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 290, wa, wa + 0.16); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 290, wa + Math.PI, wa + Math.PI + 0.16); g.closePath(); g.fill();
    g.restore();
    // tonearm: plinth + pivot, counterweight, S-arm, headshell with cartridge resting in the groove
    const tub = (pts, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = "round"; g.lineJoin = "round"; g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke(); };
    g.fillStyle = "rgba(0,0,0,0.45)"; g.beginPath(); g.ellipse(836, 318, 40, 13, 0, 0, TAU); g.fill();
    const pb = g.createLinearGradient(800, 0, 870, 0);
    pb.addColorStop(0, "#5a5f6a"); pb.addColorStop(0.4, "#e8ecf2"); pb.addColorStop(1, "#4a4e58");
    g.fillStyle = pb; g.beginPath(); g.ellipse(830, 312, 30, 10, 0, 0, TAU); g.fill();
    g.fillRect(814, 296, 32, 16);
    g.fillStyle = "#cfd5de"; g.beginPath(); g.ellipse(830, 296, 16, 5.5, 0, 0, TAU); g.fill();
    // counterweight behind the pivot
    tub([[830, 292], [842, 262]], 4, "#9aa0aa");
    const cw = g.createLinearGradient(830, 0, 860, 0);
    cw.addColorStop(0, "#3a3e46"); cw.addColorStop(0.45, "#d8dde6"); cw.addColorStop(1, "#2a2e36");
    g.fillStyle = cw; g.beginPath(); g.ellipse(845, 252, 14, 17, 0.35, 0, TAU); g.fill();
    // the arm (shadow on the deck, then the polished tube with a specular line)
    tub([[834, 304], [812, 360], [776, 402], [722, 424]], 7, "rgba(0,0,0,0.35)");
    tub([[830, 296], [808, 352], [772, 394], [718, 416]], 6, "#aab0bb");
    tub([[828, 296], [806, 351], [770, 392], [717, 414]], 1.6, "rgba(255,255,255,0.85)");
    // headshell + cartridge + finger lift
    g.save(); g.translate(712, 418); g.rotate(0.38);
    g.fillStyle = "#c9cfd8"; g.fillRect(-26, -7, 30, 12);
    g.fillStyle = "#1a1620"; g.fillRect(-22, 3, 18, 9);
    g.fillStyle = "#ff4fd8"; g.fillRect(-21, 10, 16, 2);
    g.strokeStyle = "#c9cfd8"; g.lineWidth = 2; g.beginPath(); g.moveTo(-26, -2); g.lineTo(-36, -10); g.stroke();
    g.restore();
    // the spinning cat
    const cs = Math.cos(a), sn = Math.sin(a);
    // contact shadow on the label, plus a little occlusion where he sits
    const csg = g.createRadialGradient(dx, dy + 6, 0, dx, dy + 6, 80);
    csg.addColorStop(0, "rgba(40,0,40,0.6)"); csg.addColorStop(0.55, "rgba(40,0,40,0.25)"); csg.addColorStop(1, "rgba(40,0,40,0)");
    g.save(); g.translate(dx, dy + 6); g.scale(1, 0.3); g.translate(-dx, -dy - 6);
    g.fillStyle = csg; g.beginPath(); g.arc(dx, dy + 6, 80, 0, TAU); g.fill(); g.restore();
    g.save();
    g.translate(dx, dy + 4);
    g.scale(0.55 + 0.45 * Math.abs(cs), 1);
    K.drawCat(g, 0, 0, 120, {
      pose: "sit", facing: cs >= 0 ? 1 : -1, headTurn: K.clamp(sn, -0.6, 1), t, tail: 1, collar: false, blink: 0.2,
      light: { x: 480 + cs * 300, y: -40, color: "#ff8ae6", strength: 1.3 }, coat: K.COATS.siamese,
    });
    g.restore();
  });
}
// The endless body, shaded as a fur cylinder: lit top highlight, dark belly, mackerel stripes that wrap
// over the back (they curve toward the tail as they go round), and a leg pair every ~400 px.
function longBody(g, x0, x1, top, bot, offX) {
  const h = bot - top;
  const vx0 = Math.max(x0, offX - 60), vx1 = Math.min(x1, offX + 1100);
  const body = new Path2D();
  // the left end rises out of the real cat shoulders (lower and rounder), then runs level
  body.moveTo(x0, top + h * 0.3);
  body.bezierCurveTo(x0 + 30, top + 10, x0 + 60, top + 6, x0 + 110, top + 6);
  body.lineTo(x1, top + 6);
  body.lineTo(x1, bot - 6);
  body.lineTo(x0, bot - 6);
  body.closePath();
  // soft furry silhouette: short irregular strokes along the back and belly (behind the fill)
  g.lineCap = "round";
  g.strokeStyle = "rgba(226,206,168,0.7)";
  g.lineWidth = 1.1;
  g.beginPath();
  for (let x = vx0; x < vx1; x += 1.7 + K.hash(Math.floor(x), 12) * 2.4) {
    const k = K.hash(Math.floor(x * 3), 3), k2 = K.hash(Math.floor(x * 3), 13);
    g.moveTo(x, top + 9);
    g.lineTo(x + 3 + k * 3, top + 5 - k2 * 3.2);
  }
  g.stroke();
  g.strokeStyle = "rgba(143,118,86,0.7)";
  g.beginPath();
  for (let x = vx0; x < vx1; x += 1.9 + K.hash(Math.floor(x), 14) * 2.6) {
    const k = K.hash(Math.floor(x * 3), 4);
    g.moveTo(x, bot - 9);
    g.lineTo(x + 3 + k * 3, bot - 5 + k * 2.5);
  }
  g.stroke();
  // cylinder shading: light from above-left
  const vg = g.createLinearGradient(0, top, 0, bot);
  vg.addColorStop(0, "#e9d5ae");
  vg.addColorStop(0.16, "#fbf0d8");
  vg.addColorStop(0.38, "#eedbb6");
  vg.addColorStop(0.7, "#cdb28a");
  vg.addColorStop(0.9, "#9c8462");
  vg.addColorStop(1, "#7d6a50");
  g.fillStyle = vg;
  g.fill(body);
  g.save();
  g.clip(body);
  // stripes: each one wraps over the back - dark on the top, curving back and thinning toward the belly
  const st = new Path2D();
  for (let x = Math.floor((offX - 120) / 46) * 46; x < offX + 1120; x += 46) {
    if (x < x0 + 30) continue;
    const r = K.hash(x, 8), r2 = K.hash(x, 9);
    const sx = x + (r - 0.5) * 14, len = h * (0.72 + r2 * 0.18), bw = 11 + r * 6;
    const back = 20 + r2 * 12; // how far the stripe sweeps toward the tail as it wraps round
    // C-shaped: steep over the spine, bowing forward on the flank, sweeping back and thinning to the belly
    st.moveTo(sx - bw * 0.4, top);
    st.bezierCurveTo(sx - bw * 0.5 - 6, top + len * 0.35, sx + back * 0.2, top + len * 0.8, sx + back, top + len);
    st.quadraticCurveTo(sx + back + 3, top + len + 1, sx + back + 1, top + len - 4);
    st.bezierCurveTo(sx + back * 0.35 + bw * 0.4, top + len * 0.7, sx + bw * 0.3 - 4, top + len * 0.3, sx + bw * 0.6, top);
    st.closePath();
  }
  const sg = g.createLinearGradient(0, top, 0, bot);
  sg.addColorStop(0, "rgba(150,108,62,0.62)");
  sg.addColorStop(0.35, "rgba(160,116,68,0.42)");
  sg.addColorStop(0.75, "rgba(150,108,62,0.12)");
  sg.addColorStop(1, "rgba(150,108,62,0)");
  g.fillStyle = sg;
  g.fill(st);
  // top sheen (the cylinder's highlight) and a darker dorsal line
  const hl = g.createLinearGradient(0, top, 0, top + h * 0.34);
  hl.addColorStop(0, "rgba(255,250,236,0)");
  hl.addColorStop(0.45, "rgba(255,250,236,0.4)");
  hl.addColorStop(1, "rgba(255,250,236,0)");
  g.fillStyle = hl;
  g.fillRect(vx0, top, vx1 - vx0, h * 0.34);
  g.fillStyle = "rgba(140,100,58,0.28)";
  g.fillRect(vx0, top + 5, vx1 - vx0, 4);
  // core shadow + bounce from the pink floor on the belly
  const cs = g.createLinearGradient(0, top, 0, bot);
  cs.addColorStop(0, "rgba(70,40,30,0)");
  cs.addColorStop(0.62, "rgba(70,40,30,0.06)");
  cs.addColorStop(0.86, "rgba(70,40,30,0.3)");
  cs.addColorStop(1, "rgba(255,170,220,0.28)");
  g.fillStyle = cs;
  g.fillRect(vx0, top, vx1 - vx0, h);
  // fur strokes, flowing back along the body
  g.strokeStyle = "rgba(255,248,232,0.4)";
  g.lineWidth = 0.9;
  g.beginPath();
  for (let i = 0; i < 260; i++) {
    const x = offX - 60 + K.hash(i, 21) * 1150;
    const y = top + 4 + K.hash(i + 0.5, 21) * h * 0.55;
    g.moveTo(x, y); g.lineTo(x + 6, y + 1.5 + (y - top) * 0.03);
  }
  g.stroke();
  g.strokeStyle = "rgba(110,80,46,0.3)";
  g.beginPath();
  for (let i = 0; i < 180; i++) {
    const x = offX - 60 + K.hash(i, 22) * 1150;
    const y = top + h * 0.4 + K.hash(i + 0.5, 22) * h * 0.55;
    g.moveTo(x, y); g.lineTo(x + 5, y + 2.5);
  }
  g.stroke();
  // rim light along the back from the pink sky
  const rg = g.createLinearGradient(0, top + 4, 0, top + 16);
  rg.addColorStop(0, "rgba(255,200,240,0.75)");
  rg.addColorStop(1, "rgba(255,200,240,0)");
  g.fillStyle = rg;
  g.fillRect(vx0, top + 4, vx1 - vx0, 12);
  g.restore();
}
// A leg pair (far + near) under the long body. kind 0 = front legs (straight), 1 = hind (thigh + hock).
function longLegs(g, x, top, floor, kind, col, paw) {
  for (const far of [1, 0]) {
    const lx = x + (far ? 16 : 0);
    const p = new Path2D();
    if (kind) K.tube(p, [lx + 8, top - 10, lx - 6, top + 26, lx + 6, floor - 22, lx + 2, floor - 6], [36, 22, 11, 10], 5);
    else K.tube(p, [lx, top - 8, lx + 2, top + 28, lx + 1, floor - 6], [24, 13, 11], 5);
    const lg = g.createLinearGradient(lx - 14, 0, lx + 16, 0);
    lg.addColorStop(0, far ? "#a68e6c" : K.shade(col, -0.05));
    lg.addColorStop(0.45, far ? "#bca582" : col);
    lg.addColorStop(1, far ? "#8a7458" : "#b39a74");
    g.fillStyle = lg;
    g.fill(p);
    // paw with toe creases
    const pg = g.createRadialGradient(lx - 2, floor - 7, 1, lx + 2, floor - 4, 12);
    pg.addColorStop(0, far ? "#d8caa8" : paw); pg.addColorStop(1, far ? "#a8987a" : "#d0bf9c");
    g.fillStyle = pg;
    g.beginPath(); g.ellipse(lx - 2, floor - 5, 11, 6, 0, 0, TAU); g.fill();
    g.strokeStyle = "rgba(120,96,70,0.5)"; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(lx - 9, floor - 3); g.lineTo(lx - 9, floor - 8); g.moveTo(lx - 4, floor - 1.5); g.lineTo(lx - 4, floor - 8); g.stroke();
  }
  // contact shadow
  const sg = g.createRadialGradient(x + 6, floor, 0, x + 6, floor, 36);
  sg.addColorStop(0, "rgba(80,30,90,0.5)"); sg.addColorStop(1, "rgba(80,30,90,0)");
  g.save(); g.translate(x + 6, floor); g.scale(1, 0.2); g.translate(-x - 6, -floor);
  g.fillStyle = sg; g.beginPath(); g.arc(x + 6, floor, 36, 0, TAU); g.fill(); g.restore();
}
function gagLong(g, W, H, t) {
  // hold on the head for 0.8 s, then ease into a ~1200 px/s pan along the body
  const u = Math.max(0, t - 0.8);
  const pan = -40 + 1200 * (u < 0.3 ? (u * u) / 0.6 : u - 0.15);
  // background (parallax)
  const bg = g.createLinearGradient(0, 0, 0, 360);
  bg.addColorStop(0, "#7af7ff"); bg.addColorStop(1, "#d9c8ff");
  g.fillStyle = bg; g.fillRect(0, 0, W, 360);
  g.save();
  g.translate(-pan * 0.6, 0);
  for (let i = Math.floor(pan * 0.6 / 220) - 1; i < Math.floor(pan * 0.6 / 220) + 7; i++) {
    const x = i * 220;
    const ag = g.createLinearGradient(0, 70, 0, 250);
    ag.addColorStop(0, i % 2 ? "#ff9ad8" : "#b47aff");
    ag.addColorStop(1, "#ffd9f2");
    g.fillStyle = ag;
    g.globalAlpha = 0.6;
    g.beginPath(); g.moveTo(x + 30, 250); g.lineTo(x + 30, 130); g.arc(x + 90, 130, 60, Math.PI, 0); g.lineTo(x + 150, 250); g.closePath(); g.fill();
    g.globalAlpha = 1;
    g.save(); g.globalCompositeOperation = "lighter";
    g.strokeStyle = K.rgba(i % 2 ? "#ff4fd8" : "#7af7ff", 0.35); g.lineWidth = 9; g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 2.5; g.stroke(); g.restore();
    palm(g, x + 90, 250, 90, 0.15, pan * 0.01 + i, "rgba(120,60,160,0.35)");
  }
  g.restore();
  const S = 130, x0 = 300, floor = 440;
  const top = floor - S * 1.13, bot = floor - S * 0.45;
  g.save();
  g.translate(-pan, 0);
  checkerFloorFlat(g, pan, 360, H);
  // ambient occlusion band under the endless belly
  const ao = g.createLinearGradient(0, floor - 4, 0, floor + 16);
  ao.addColorStop(0, "rgba(80,40,90,0.24)"); ao.addColorStop(1, "rgba(80,40,90,0)");
  g.fillStyle = ao; g.fillRect(Math.max(x0, pan - 60), floor - 4, 1200, 20);
  // the head end: a real standing cat, clipped just behind the shoulders (the body layer takes over)
  g.save();
  g.beginPath(); g.rect(pan - 100, 0, x0 + 62 - (pan - 100), H); g.clip();
  K.drawCat(g, x0, floor, S, { pose: "stand", facing: -1, coat: K.COATS.cream, t: t + 4, collar: false, headTurn: 0.6, blink: K.env(t, 0.5, 0.75, 0.06, 0.08), light: { x: 200, y: 0, color: "#ffc0ee", strength: 1 } });
  g.restore();
  // leg pairs every ~400 px: front, hind, front, hind... (how many legs does this cat have?)
  for (let k = Math.max(1, Math.floor((pan - 200) / 400)); k * 400 < pan + 1100; k++) {
    const lx = x0 + k * 400 + (K.hash(k, 3) - 0.5) * 40;
    longLegs(g, lx, bot, floor, k % 2, "#e6d2ac", "#fbf3e2");
  }
  g.restore();
  // the endless body, feathered into the real cat so there is no seam
  const L = K.layer(W, H, "f15:long");
  L.g.save();
  L.g.translate(-pan, 0);
  longBody(L.g, x0 + 4, x0 + 6000, top, bot, pan);
  L.g.globalCompositeOperation = "destination-out";
  const fg = L.g.createLinearGradient(x0 + 14, 0, x0 + 62, 0);
  fg.addColorStop(0, "rgba(0,0,0,1)");
  fg.addColorStop(1, "rgba(0,0,0,0)");
  L.g.fillStyle = fg;
  L.g.fillRect(x0 - 20, 0, 82, H);
  L.g.restore();
  g.drawImage(L.canvas, 0, 0, W, H);
}
function checkerFloorFlat(g, pan, y0, H) {
  g.fillStyle = "#ffd9f2";
  g.fillRect(pan - 50, y0, 1100, H - y0);
  g.fillStyle = "#c9b0ff";
  const s = 60;
  for (let r = 0; r < 4; r++) {
    const yy = y0 + r * 46;
    for (let c = Math.floor((pan - 50) / s); c < (pan + 1060) / s; c++) {
      if ((c + r) % 2) continue;
      g.fillRect(c * s + r * 10, yy, s, 46);
    }
  }
  const hg = g.createLinearGradient(0, y0, 0, y0 + 60);
  hg.addColorStop(0, "rgba(255,217,242,0.85)"); hg.addColorStop(1, "rgba(255,217,242,0)");
  g.fillStyle = hg; g.fillRect(pan - 50, y0, 1100, 60);
}

// ---- shot 3/4: too loud, then frozen --------------------------------------------------------------------------
function headSprite() {
  return K.sprite("f15:bighead", 420, 330, (s) => {
    const S = 300;
    const L = K.layer(420, 600, "f15:headtmp");
    K.drawCat(L.g, 210 - S * 0.26, 560, S, { pose: "sit", headTurn: 1, t: 0, coat: K.COATS.calico, pupil: 1, collar: false, light: { x: 420, y: 0, color: "#ffd0f6", strength: 1.2 } });
    // real calico patches: irregular orange and near-black blobs (multiplied so the fur shading
    // shows through), masked to the cat, kept off the eyes and muzzle
    const Pt = K.layer(420, 600, "f15:headpatch");
    const blob = (x, y, r, col, seed) => {
      const R = K.rng("calico" + seed);
      Pt.g.fillStyle = col;
      for (let i = 0; i < 6; i++) {
        const a = R() * TAU, d = r * 0.45 * R();
        Pt.g.beginPath();
        Pt.g.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.45 + R() * 0.35), r * (0.4 + R() * 0.3), R() * 3, 0, TAU);
        Pt.g.fill();
      }
    };
    Pt.g.filter = K.hasFilter() ? "blur(1.5px)" : "none";
    blob(150, 38, 52, "#d98a3a", 1);   // orange over the left ear and brow
    blob(280, 30, 44, "#2a2420", 2);   // black over the right ear
    blob(300, 130, 26, "#d98a3a", 3);  // orange right cheek
    blob(128, 140, 18, "#2a2420", 4);  // small black left jowl
    blob(205, 18, 16, "#2a2420", 5);   // black dab on the crown
    Pt.g.filter = "none";
    Pt.g.globalCompositeOperation = "destination-in";
    Pt.g.drawImage(L.canvas, 0, 0, 420, 600);
    L.g.save();
    L.g.globalCompositeOperation = "multiply";
    L.g.globalAlpha = 0.92;
    L.g.drawImage(Pt.canvas, 0, 0, 420, 600);
    L.g.restore();
    // fade the neck away under the chin so the head floats (glitter covers the cut in loudScene)
    L.g.save();
    L.g.globalCompositeOperation = "destination-out";
    const yC = 170, yE = 214;
    const fg = L.g.createLinearGradient(0, yC, 0, yE);
    fg.addColorStop(0, "rgba(0,0,0,0)");
    fg.addColorStop(1, "rgba(0,0,0,1)");
    L.g.fillStyle = fg;
    L.g.fillRect(0, yC, 420, 600 - yC);
    L.g.restore();
    s.drawImage(L.canvas, 0, 0, L.canvas.width, L.canvas.height * (330 / 600) * (600 / 600), 0, 0, 420, 330);
  });
}
function loudScene(g, W, H, tt, frozen) {
  const pulse = frozen ? 0 : beatPulse(tt);
  plain(g, W, H, tt, { speed: 2.4, pulse });
  // giant floating calico head drifting across the sky
  const hp = K.seg(tt, 16, 31);
  const hx = K.lerp(1180, 200, hp), hy = 165 + Math.sin(tt * 0.9) * 14;
  const spr = headSprite();
  g.save();
  g.translate(hx, hy);
  g.rotate(Math.sin(tt * 0.7) * 0.12 - 0.05);
  const sc = 1.05 + pulse * 0.03;
  g.scale(sc, sc);
  K.glow(g, 0, 0, 240, "#ffffff", 0.25);
  g.drawImage(spr, -210, -135, 420, 330);
  // the neck dissolves into drifting glitter below the chin
  for (let i = 0; i < 26; i++) {
    const fall = ((K.hash(i, 61) + tt * 0.35 * (0.6 + K.hash(i, 62) * 0.8)) % 1);
    const gx = -20 + (K.hash(i, 63) - 0.5) * 150 * (1 - fall * 0.4);
    const gy = 40 + fall * 120;
    sparkle(g, gx, gy, 3 + K.hash(i, 64) * 5, (1 - fall) * (0.6 + 0.4 * Math.sin(tt * 8 + i)), tt * 2 + i, PAL[i % PAL.length]);
  }
  g.restore();
  // floating chrome
  const bob = (i) => Math.sin(tt * 1.3 + i * 2) * 10;
  chromeSphere(g, 120 + tt * 4, 220 + bob(0), 40, 340);
  chromeSphere(g, 820, 330 + bob(1), 52, 470);
  chromePyramid(g, 700, 200 + bob(2), 40, tt * 0.8);
  chromeSphere(g, 300, 430 + bob(3), 26, 520);
  // flying cats zipping across with pastel trails
  for (let i = 0; i < 3; i++) {
    const st = 16.5 + i * 3.4;
    const u = (tt - st) / 2.4;
    if (u < 0 || u > 1) continue;
    const dir = i % 2 ? -1 : 1;
    const x = dir > 0 ? K.lerp(-80, 1040, u) : K.lerp(1040, -80, u);
    const y = 90 + i * 70 + Math.sin(u * 8) * 12;
    g.save();
    g.globalCompositeOperation = "lighter";
    for (let k = 0; k < 6; k++) {
      g.fillStyle = K.rgba(PAL[k], 0.35);
      g.fillRect(x - dir * 260, y - 12 + k * 4, dir * 230, 3.5);
    }
    g.restore();
    K.drawCat(g, x, y + 14, 26, { pose: "run", phase: tt * 3, facing: dir, t: tt, coat: [K.COATS.grey, K.COATS.black, K.COATS.siamese][i], collar: false, shadow: false });
  }
  // expanding glitter ring
  const rp = K.seg(tt, 22, 28.5);
  if (rp > 0 && rp < 1) {
    const R = K.ease.out(rp) * 720;
    const al = 1 - rp;
    g.save();
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * TAU + K.hash(i, 5) * 0.06;
      const rr = R * (0.92 + K.hash(i + 0.3, 5) * 0.16);
      sparkle(g, hx + Math.cos(a) * rr, hy + 40 + Math.sin(a) * rr * 0.7, 4 + K.hash(i, 6) * 6, al * (0.5 + 0.5 * Math.sin(tt * 9 + i)), tt * 2 + i, PAL[i % PAL.length]);
    }
    g.restore();
  }
  // confetti rain
  g.save();
  for (let i = 0; i < 40; i++) {
    const x = (K.hash(i, 31) * 1100 + Math.sin(tt * 1.5 + i) * 30) - 70;
    const y = ((K.hash(i + 0.4, 31) * 640 + tt * (60 + K.hash(i, 32) * 80)) % 640) - 60;
    g.save();
    g.translate(x, y);
    g.rotate(tt * (2 + i % 4) + i);
    g.scale(Math.cos(tt * 4 + i), 1);
    g.fillStyle = PAL[i % PAL.length];
    g.globalAlpha = 0.85;
    g.fillRect(-4, -2, 8, 4);
    g.restore();
  }
  g.restore();
  // the kid in the middle, hands over the ears
  kidEars(g, 410, 452, 220, tt, { shake: !frozen, light: { x: 480, y: 240, color: "#ffb0e8", strength: 1.2 } });
}

// ---- shots 5/6: the frozen mall ---------------------------------------------------------------------------
const F = 430, CX = 480, CY = 262;
const SHOPS = ["MEOWLL", "PURRFUME", "CATNIP CAFE", "LITTER RECORDS", "NAP SHOP", "TUNA TOWN", "WHISKER ARCADE",
  "YARN BARN", "PAWN SHOP", "BOX DEPOT", "HISS N HERS", "LASER DOT", "FISH TANK", "9 LIVES"];
function mallScene(g, W, H, t, camZ, camY, o) {
  const P = (X, Y, Z) => { const z = Math.max(0.35, Z - camZ); return [CX + X * F / z, CY + (camY - Y) * F / z, F / z]; };
  const quad = (a, b, c, d) => { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); };
  const HW = 16, HT = 26, END = 70;
  // back wall
  g.fillStyle = "#2a1838";
  g.fillRect(-W, -H, W * 3, H * 3);
  const bw = [P(-HW, HT, END), P(HW, HT, END), P(HW, 0, END), P(-HW, 0, END)];
  quad(...bw);
  const bwg = g.createLinearGradient(0, bw[0][1], 0, bw[2][1]);
  bwg.addColorStop(0, "#3a2050"); bwg.addColorStop(1, "#5a3a70");
  g.fillStyle = bwg; g.fill();
  // ceiling
  quad(P(-HW, HT, camZ + 0.4), P(HW, HT, camZ + 0.4), P(HW, HT, END), P(-HW, HT, END));
  const cg = g.createLinearGradient(0, 0, 0, P(0, HT, END)[1]);
  cg.addColorStop(0, "#140a20"); cg.addColorStop(1, "#3a2450");
  g.fillStyle = cg; g.fill();
  // skylight strips
  for (const X of [-6, 6]) {
    quad(P(X - 0.6, HT, camZ + 0.5), P(X + 0.6, HT, camZ + 0.5), P(X + 0.6, HT, END), P(X - 0.6, HT, END));
    g.fillStyle = "#ffe8fa"; g.fill();
  }
  // floor (checker, glossy)
  quad(P(-HW, 0, camZ + 0.4), P(HW, 0, camZ + 0.4), P(HW, 0, END), P(-HW, 0, END));
  g.fillStyle = "#e6c8e8"; g.fill();
  const pA = new Path2D();
  const TS = 4;
  for (let zi = Math.max(0, Math.floor((camZ + 0.4) / TS)); zi < END / TS; zi++) {
    const z0 = Math.max(camZ + 0.4, zi * TS), z1 = (zi + 1) * TS;
    for (let xi = -4; xi < 4; xi++) {
      if ((xi + zi + 100) % 2) continue;
      const a = P(xi * TS, 0, z0), b = P(xi * TS + TS, 0, z0), c = P(xi * TS + TS, 0, z1), d = P(xi * TS, 0, z1);
      pA.moveTo(a[0], a[1]); pA.lineTo(b[0], b[1]); pA.lineTo(c[0], c[1]); pA.lineTo(d[0], d[1]); pA.closePath();
    }
  }
  g.fillStyle = "#7a4a8a";
  g.fill(pA);
  // side walls with storefronts
  const signCols = ["#ff4fd8", "#7af7ff", "#fff27a", "#b47aff", "#ff9a5a", "#7affb0", "#ff4fd8"];
  for (const side of [-1, 1]) {
    const X = side * HW;
    quad(P(X, HT, camZ + 0.4), P(X, HT, END), P(X, 0, END), P(X, 0, camZ + 0.4));
    g.fillStyle = "#2c1a3c"; g.fill();
    for (let s = 0; s < 7; s++) {
      const za = s * 10, zb = za + 10;
      if (zb < camZ + 0.4) continue;
      const z0 = Math.max(camZ + 0.4, za + 1.2), z1 = zb - 1.2;
      if (z1 <= z0) continue;
      const si = s + (side > 0 ? 7 : 0);
      const sc = signCols[(s + (side > 0 ? 3 : 0)) % signCols.length];
      const shut = K.hash(si, 71) < 0.5;
      const lit = K.hash(si, 72) < 0.45; // most signs are dead tubes; a few still glow
      // glass (or a pulled-down roller shutter)
      quad(P(X, 12.2, z0), P(X, 12.2, z1), P(X, 0, z1), P(X, 0, z0));
      if (shut) {
        const a0 = P(X, 12.2, z0), a1 = P(X, 0, z0);
        const sg = g.createLinearGradient(0, a0[1], 0, a1[1]);
        sg.addColorStop(0, "#6a6478"); sg.addColorStop(0.5, "#8a8496"); sg.addColorStop(1, "#5a5466");
        g.fillStyle = sg; g.fill();
        g.strokeStyle = "rgba(30,20,40,0.5)";
        g.lineWidth = Math.max(0.5, P(X, 0, z0)[2] * 0.06);
        g.beginPath();
        for (let k = 1; k < 18; k++) {
          const yy = 12.2 * k / 18;
          const q0 = P(X, yy, z0), q1 = P(X, yy, z1);
          g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]);
        }
        g.stroke();
        // bottom bar + padlock
        const b0 = P(X, 0.5, z0), b1 = P(X, 0.5, z1);
        g.strokeStyle = "#3a3446"; g.lineWidth = Math.max(1, b0[2] * 0.4);
        g.beginPath(); g.moveTo(b0[0], b0[1]); g.lineTo(b1[0], b1[1]); g.stroke();
      } else {
        const gl = g.createLinearGradient(P(X, 0, z0)[0], 0, P(X, 0, z1)[0], 0);
        gl.addColorStop(0, "#1a2a40"); gl.addColorStop(0.5, "#2a4a68"); gl.addColorStop(1, "#122030");
        g.fillStyle = gl; g.fill();
        g.save(); g.clip();
        g.strokeStyle = "rgba(255,255,255,0.12)"; g.lineWidth = 6;
        for (let k = 0; k < 3; k++) { const q = P(X, 0, K.lerp(z0, z1, 0.2 + k * 0.3)), r = P(X, 12.2, K.lerp(z0, z1, 0.3 + k * 0.3)); g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(r[0], r[1]); g.stroke(); }
        g.restore();
      }
      // emissive strip above the storefront: warm and cool alternating
      const eCol = si % 2 ? "#ffcf8a" : "#9be7ff";
      const e0 = P(X, 12.5, z0), e1 = P(X, 12.5, z1);
      g.save(); g.globalCompositeOperation = "lighter"; g.lineCap = "round";
      g.strokeStyle = K.rgba(eCol, 0.25); g.lineWidth = Math.max(1, e0[2] * 0.8); g.beginPath(); g.moveTo(e0[0], e0[1]); g.lineTo(e1[0], e1[1]); g.stroke();
      g.strokeStyle = K.rgba("#ffffff", 0.7); g.lineWidth = Math.max(0.5, e0[2] * 0.18); g.stroke();
      g.restore();
      // the shop sign: dark backing board with cat-themed neon lettering, mapped onto the wall
      // (the right wall runs right-to-left on screen, so its text axis starts at the far end)
      const zA = side < 0 ? z0 + 0.6 : z1 - 0.6, zB = side < 0 ? z1 - 0.6 : z0 + 0.6;
      const sa = P(X, 15.6, zA), sb = P(X, 15.6, zB), sd = P(X, 12.9, zA);
      quad(sa, sb, P(X, 12.9, zB), sd);
      g.fillStyle = "#1a1224"; g.fill();
      g.save();
      g.transform(sb[0] - sa[0], sb[1] - sa[1], sd[0] - sa[0], sd[1] - sa[1], sa[0], sa[1]);
      g.scale(1 / 200, 1 / 40);
      g.font = "700 26px Fredoka, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      const name = SHOPS[si % SHOPS.length];
      if (lit) {
        g.shadowColor = sc; g.shadowBlur = 10;
        g.fillStyle = K.mix(sc, "#ffffff", 0.55);
        g.fillText(name, 100, 21);
        g.shadowBlur = 0;
      } else {
        g.lineWidth = 1.6;
        g.strokeStyle = K.rgba(K.mix(sc, "#6a6478", 0.65), 0.9);
        g.strokeText(name, 100, 21);
      }
      g.restore();
      const mid = P(X, 14.2, (z0 + z1) / 2);
      if (lit) K.glow(g, mid[0], mid[1], mid[2] * 6, sc, 0.45);
      // floor reflection of the sign and the strip: a soft vertical streak on the glossy tiles
      const rf = P(X * 0.82, 0, (z0 + z1) / 2);
      const rl = mid[2] * 9;
      g.save(); g.globalCompositeOperation = "lighter";
      const rg2 = g.createLinearGradient(0, rf[1], 0, rf[1] + rl);
      rg2.addColorStop(0, K.rgba(lit ? sc : eCol, lit ? 0.3 : 0.14)); rg2.addColorStop(1, K.rgba(lit ? sc : eCol, 0));
      g.fillStyle = rg2;
      g.fillRect(rf[0] - mid[2] * 2.2, rf[1], mid[2] * 4.4, rl);
      g.restore();
      // pillar
      const zp = za;
      if (zp > camZ + 0.4) {
        quad(P(X - side * 1.2, HT, zp - 0.7), P(X - side * 1.2, HT, zp + 0.7), P(X - side * 1.2, 0, zp + 0.7), P(X - side * 1.2, 0, zp - 0.7));
        g.fillStyle = "#d8c8e8"; g.fill();
        const pf = [P(X - side * 1.2, HT, zp - 0.7), P(X, HT, zp - 0.7), P(X, 0, zp - 0.7), P(X - side * 1.2, 0, zp - 0.7)];
        quad(...pf);
        g.fillStyle = "#a890c0"; g.fill();
      }
    }
  }
  // the end shop: frame + shutter
  const sf = [P(-11, 20, END - 0.02), P(11, 20, END - 0.02), P(11, 0, END - 0.02), P(-11, 0, END - 0.02)];
  quad(...sf);
  g.fillStyle = "#1c1226"; g.fill();
  const open = o.open || 0;
  const doorTop = 16, doorX = 8.5;
  // interior (visible as the shutter rises)
  const iTop = P(-doorX, doorTop, END), iBot = P(doorX, 0, END);
  if (open > 0) {
    g.save();
    g.beginPath(); g.rect(iTop[0], iTop[1], iBot[0] - iTop[0], iBot[1] - iTop[1]); g.clip();
    const ig = g.createRadialGradient((iTop[0] + iBot[0]) / 2, iBot[1] - (iBot[1] - iTop[1]) * 0.35, 4, (iTop[0] + iBot[0]) / 2, iBot[1] - (iBot[1] - iTop[1]) * 0.35, (iBot[0] - iTop[0]) * 0.75);
    ig.addColorStop(0, "#ffcf6a"); ig.addColorStop(0.18, "#c8782a"); ig.addColorStop(0.55, "#3a1c0c"); ig.addColorStop(1, "#0c0604");
    g.fillStyle = ig;
    g.fillRect(iTop[0], iTop[1], iBot[0] - iTop[0], iBot[1] - iTop[1]);
    // the shop's own floorboards, so whoever walks in has something to stand on
    const fz = P(0, 0, 84), fb = iBot[1];
    const flg = g.createLinearGradient(0, fz[1], 0, fb);
    flg.addColorStop(0, "#5a3416"); flg.addColorStop(0.5, "#3a200c"); flg.addColorStop(1, "#24140a");
    g.fillStyle = flg;
    g.fillRect(iTop[0], fz[1], iBot[0] - iTop[0], fb - fz[1]);
    g.strokeStyle = "rgba(20,10,4,0.5)"; g.lineWidth = 1;
    g.beginPath();
    for (let k = -4; k <= 4; k++) { const a0 = P(k * 2, 0, 70), a1 = P(k * 2, 0, 84); g.moveTo(a0[0], a0[1]); g.lineTo(a1[0], a1[1]); }
    g.stroke();
    const fpool = g.createRadialGradient((iTop[0] + iBot[0]) / 2, fz[1] + (fb - fz[1]) * 0.3, 0, (iTop[0] + iBot[0]) / 2, fz[1] + (fb - fz[1]) * 0.3, (iBot[0] - iTop[0]) * 0.45);
    fpool.addColorStop(0, "rgba(255,190,90,0.5)"); fpool.addColorStop(1, "rgba(255,190,90,0)");
    g.save(); g.globalCompositeOperation = "lighter"; g.fillStyle = fpool;
    g.fillRect(iTop[0], fz[1], iBot[0] - iTop[0], fb - fz[1]); g.restore();
    // candles inside
    const cw = iBot[0] - iTop[0], chh = iBot[1] - iTop[1];
    for (let i = 0; i < 7; i++) {
      const fx = iTop[0] + cw * (0.2 + i * 0.1), fy = iTop[1] + chh * (0.66 + (i % 2) * 0.05);
      g.fillStyle = "#e8d8b0";
      g.fillRect(fx - cw * 0.006, fy, cw * 0.012, chh * 0.05);
      const fl = 0.8 + 0.2 * Math.sin(t * 11 + i * 3);
      K.glow(g, fx, fy - chh * 0.012, chh * 0.07 * fl, "#ffcf6a", 0.9);
    }
    K.dust(g, W, H, t, { seed: 8, color: "#ffcf6a", count: 26, size: 1.2, area: [iTop[0], iTop[1], cw, chh], alpha: 0.7 });
    g.restore();
  }
  // shutter
  const shBot = K.lerp(0, doorTop, open);
  if (shBot < doorTop - 0.01) {
    const a = P(-doorX, doorTop, END), b = P(doorX, shBot, END);
    const sg = g.createLinearGradient(0, a[1], 0, b[1]);
    sg.addColorStop(0, "#8a8496"); sg.addColorStop(1, "#b8b0c4");
    g.fillStyle = sg;
    g.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    g.strokeStyle = "rgba(40,30,50,0.55)";
    g.lineWidth = Math.max(0.6, a[2] * 0.12);
    const n = 22;
    g.beginPath();
    for (let i = 1; i < n; i++) {
      const yy = K.lerp(a[1], b[1], i / n);
      g.moveTo(a[0], yy); g.lineTo(b[0], yy);
    }
    g.stroke();
    g.fillStyle = "#4a4458";
    g.fillRect(a[0], b[1] - a[2] * 0.5, b[0] - a[0], a[2] * 0.5);
    // warm light leaking under the shutter
    if (shBot < 0.6) {
      const lk = 1 - shBot / 0.6;
      g.save();
      g.globalCompositeOperation = "lighter";
      const lg = g.createLinearGradient(0, b[1], 0, b[1] + a[2] * 3);
      lg.addColorStop(0, K.rgba("#ffcf6a", 0.9 * lk)); lg.addColorStop(1, K.rgba("#ffcf6a", 0));
      g.fillStyle = lg;
      g.fillRect(a[0], b[1], b[0] - a[0], a[2] * 3);
      g.restore();
    }
  }
  // spill of warm light out across the floor
  if (open > 0) {
    const c = P(0, 0, END);
    g.save();
    g.globalCompositeOperation = "lighter";
    const s = c[2];
    const lg = g.createRadialGradient(c[0], c[1], 0, c[0], c[1], s * 30);
    lg.addColorStop(0, K.rgba("#ffb347", 0.55 * open)); lg.addColorStop(1, K.rgba("#ffb347", 0));
    g.translate(c[0], c[1]); g.scale(1, 0.35); g.translate(-c[0], -c[1]);
    g.fillStyle = lg; g.beginPath(); g.arc(c[0], c[1], s * 30, 0, TAU); g.fill();
    g.restore();
  }
  // frozen confetti hanging in the air
  for (let i = 0; i < 60; i++) {
    const Z = 2 + K.hash(i, 41) * 64;
    if (Z < camZ + 0.8) continue;
    const q = P((K.hash(i + 0.3, 41) - 0.5) * 28, 2 + K.hash(i + 0.6, 41) * 20, Z);
    const s = q[2] * 0.35;
    g.save(); g.translate(q[0], q[1]); g.rotate(i); g.scale(Math.cos(i * 1.7), 1);
    g.fillStyle = PAL[i % PAL.length];
    g.fillRect(-s, -s * 0.5, s * 2, s);
    g.restore();
  }
  // a frozen chrome sphere mid-bounce
  const sq = P(-7, 7, 26);
  if (26 > camZ + 1) chromeSphere(g, sq[0], sq[1], sq[2] * 2.2, P(-7, 0, 26)[1]);
  return P;
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
    pts.push({ x: q[0], y: q[1], s: q[2] * 0.8, a: 0, flat: 0.32, alpha: Math.min(1, age * 3) * (0.75 + 0.25 * Math.exp(-age * 2)) });
  }
  // reflection glow on the glossy floor
  K.pawprints(g, pts, 1.1);
}

// ---- film ---------------------------------------------------------------------------------------------
function frame(g, W, H, t) {
  if (t < 8) {
    shot1(g, W, H, t);
  } else if (t < 16) {
    const lt = t - 8;
    if (lt < 2.667) gagRoll(g, W, H, lt);
    else if (lt < 5.333) gagRecord(g, W, H, lt - 2.667);
    else gagLong(g, W, H, lt - 5.333);
    K.glow(g, 480, 270, 600, "#ffffff", 0.35 * Math.exp(-((lt % 2.667) * 9)));
  } else if (t < 30) {
    const p = K.seg(t, 16, 30);
    K.withCamera(g, W, H, { x: 480, y: 280, zoom: 1.0 + p * 0.07 + beatPulse(t) * 0.006, rot: Math.sin(t * 0.8) * 0.01, shakeT: t * 2, shakeAmt: 1.6 + beatPulse(t) * 1.5 }, () => {
      loudScene(g, W, H, t, false);
    });
  } else if (t < 38) {
    const p = K.ease.inOut(K.seg(t, 30, 38));
    // drift toward the first print, plus a slow extra 3% push-in on it
    const push = 1 + 0.03 * K.ease.inOut(K.seg(t, 30, 38));
    K.withCamera(g, W, H, { x: K.lerp(480, 505, p), y: K.lerp(280, 380, p), zoom: K.lerp(1.07, 1.4, p) * push, rot: Math.sin(30 * 0.8) * 0.01 }, () => {
      loudScene(g, W, H, 30, true);
      desat(g, -W, -H, W * 3, H * 3, 0.72 * K.smooth(K.seg(t, 30, 30.25)));
      g.fillStyle = "rgba(20,24,40,0.18)";
      g.fillRect(-W, -H, W * 3, H * 3);
      // the one thing that moves: pawprints lighting up, each warming an amber pool on the frozen grid
      const pts = [];
      const add = (x, y, s, at) => {
        if (t <= at) return;
        const a = K.smooth((t - at) / 0.8);
        pts.push({ x, y, s, a: -0.35, flat: 0.55, alpha: a });
        g.save();
        g.globalCompositeOperation = "lighter";
        g.translate(x, y); g.scale(1, 0.32);
        const pg = g.createRadialGradient(0, 0, 0, 0, 0, s * 4.5);
        pg.addColorStop(0, K.rgba("#ffb347", 0.42 * a)); pg.addColorStop(0.5, K.rgba("#ff7a1a", 0.14 * a)); pg.addColorStop(1, K.rgba("#ff7a1a", 0));
        g.fillStyle = pg; g.beginPath(); g.arc(0, 0, s * 4.5, 0, TAU); g.fill();
        g.restore();
      };
      add(500, 470, 24, 31.8);
      add(548, 444, 21, 34.4);
      add(590, 424, 18, 36.2);
      K.pawprints(g, pts, 0.55);
    });
  } else if (t < 48) {
    const p = K.ease.inOut(K.seg(t, 38, 48));
    const camZ = K.lerp(-3, 30, p);
    const camY = 3.2 + Math.sin(t * 0.6) * 0.15;
    let P;
    K.withCamera(g, W, H, { x: 480 + Math.sin(t * 0.4) * 8, y: 270, zoom: 1, rot: Math.sin(t * 0.3) * 0.006 }, () => {
      P = mallScene(g, W, H, 30, camZ, camY, { open: 0 });
      desat(g, -W, -H, W * 3, H * 3, 0.72);
      g.fillStyle = "rgba(20,24,40,0.16)";
      g.fillRect(-W, -H, W * 3, H * 3);
      // the warm leak under the shutter keeps its colour
      const a = P(-8.5, 0.5, 70), b = P(8.5, 0, 70);
      K.glow(g, (a[0] + b[0]) / 2, b[1], (b[0] - a[0]) * 0.6, "#ffb347", 0.35);
      mallPrints(g, P, t, camZ, { start: 38.4, every: 0.38 });
    });
  } else {
    const p = K.ease.inOut(K.seg(t, 48, 60));
    const camZ = K.lerp(30, 40, p);
    const open = K.ease.inOut(K.seg(t, 48.4, 52.4));
    const camY = 3.2 + K.seg(t, 48, 60) * 1.5;
    K.withCamera(g, W, H, { x: 480, y: 270, zoom: 1, shakeT: t, shakeAmt: 0.8 }, () => {
      const P = mallScene(g, W, H, 30, camZ, camY, { open });
      // colour returns, spreading out from the doorway behind you
      const c = P(0, 6, 70);
      const rp = K.seg(t, 51.5, 59.5);
      const R = K.ease.in(rp) * 1100;
      g.save();
      g.globalCompositeOperation = "saturation";
      const mg = g.createRadialGradient(c[0], c[1], Math.max(0, R - 260), c[0], c[1], R + 40);
      mg.addColorStop(0, "rgba(128,128,128,0)");
      mg.addColorStop(1, "rgba(128,128,128,0.72)");
      g.fillStyle = R > 0 ? mg : "rgba(128,128,128,0.72)";
      g.fillRect(-W, -H, W * 3, H * 3);
      g.restore();
      g.fillStyle = K.rgba("#141828", 0.16 * (1 - rp));
      g.fillRect(-W, -H, W * 3, H * 3);
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
        lsg.addColorStop(0, `rgba(20,8,24,${0.55 * inside * al})`); lsg.addColorStop(1, "rgba(20,8,24,0)");
        g.fillStyle = lsg;
        g.beginPath(); g.moveTo(sh0[0], sh0[1]); g.lineTo(sh1[0], sh1[1]); g.lineTo(sh2[0], sh2[1]); g.lineTo(sh3[0], sh3[1]); g.closePath(); g.fill();
        // reflection in the glossy tiles (outside the shop only)
        if (Z < 70) {
          g.save();
          g.translate(q[0], q[1]); g.scale(1, -0.9); g.translate(-q[0], -q[1]);
          K.drawPerson(g, q[0], q[1], kh, { view: "back", walk: wp < 0.98, phase: t * 0.95, t, hood: false, bell: true, shadow: false, alpha: 0.16 * al });
          g.restore();
        }
        // contact shadow under the boots
        const cg2 = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], kh * 0.16);
        cg2.addColorStop(0, `rgba(16,6,20,${0.7 * al})`); cg2.addColorStop(1, "rgba(16,6,20,0)");
        g.save(); g.translate(q[0], q[1]); g.scale(1, 0.2); g.translate(-q[0], -q[1]);
        g.fillStyle = cg2; g.beginPath(); g.arc(q[0], q[1], kh * 0.16, 0, TAU); g.fill(); g.restore();
        // amber halo behind the silhouette so its edges catch the light
        if (inside > 0) K.glow(g, q[0], q[1] - kh * 0.55, kh * 0.6, "#ffb347", 0.45 * inside * al);
        K.drawPerson(g, q[0], q[1], kh, { view: "back", walk: wp < 0.98, phase: t * 0.95, t, hood: false, bell: true, shadow: false, light: { x: door[0], y: door[1] - kh * 0.3, color: "#ffc060", strength: 1.4 + inside * 0.6 }, alpha: al });
      }
    });
  }
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
  draw(g, t, W, H) {
    g.save();
    if (W !== 960 || H !== 540) g.scale(W / 960, H / 540);
    W = 960; H = 540;
    try {
      // pre-warm caches during the cheap opening shot so the montage and shot 3 never hitch:
      // the giant calico head sprite (built once) and the long-cat offscreen layer
      if (t > 4 && t < 8) { headSprite(); K.layer(W, H, "f15:long"); }
      frame(g, W, H, t);
      // grade + post
      const frozen = t >= 30 && t < 52;
      if (t < 16) K.bloom(g, t < 8 ? 0.35 : 0.22, { threshold: 0.62 });
      else if (t < 30) K.bloom(g, 0.3, { threshold: 0.66 });
      else K.bloom(g, t < 48 ? 0.22 : 0.4);
      if (t < 30) K.grade(g, W, H, { tint: "#ff7ae0", alpha: 0.12, mode: "soft-light" });
      else K.grade(g, W, H, { tint: frozen ? "#9aa8c8" : "#ffcf8a", alpha: 0.16, mode: "soft-light" });
      if (t < 30 && t > 0.6) K.chromatic(g, W, H, 0.3 + beatPulse(t) * 0.8);
      K.vignette(g, W, H, t < 30 ? 0.42 : 0.6);
      K.grain(g, W, H, t, t < 30 ? 0.05 : 0.065);
      // letterbox: the top bar slides away at 16 (the only time in the series) and slams back at the drop
      const bar = H * 0.085;
      g.fillStyle = "#000";
      g.fillRect(0, H - bar, W, bar);
      let top = 0;
      if (t >= 16 && t < 30) top = -bar * K.ease.in(K.seg(t, 16, 17.3)) - Math.sin(K.seg(t, 16, 17.3) * Math.PI) * 6;
      else if (t >= 30) top = -bar * (1 - K.ease.out(K.seg(t, 30, 30.35)));
      if (top > -bar) {
        g.save();
        g.translate(0, top);
        g.rotate(t >= 16 && t < 18 ? K.seg(t, 16, 17.3) * 0.03 : 0);
        g.fillRect(-20, 0, W + 40, bar);
        g.restore();
      }
      // title: snaps in at 1, chromatic split, snaps out at 4
      if (t >= 1 && t < 4) {
        // a short glitch: the RGB split lives for 0.25 s (max 6 px) and the clean title settles by 1.3
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
      // hard cut flashes on the hits
      K.fadeColor(g, W, H, 0.8 * Math.exp(-t * 7), "#ffffff");
      K.fadeBlack(g, W, H, K.smooth(K.seg(t, 58.2, 60)));
    } finally {
      g.restore();
    }
  },
};
