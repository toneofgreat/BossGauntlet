// films/f08.js - Chapter 8: "The Mountain of Fire" (FILMS.md f08). Mount Hairball: a volcano with a
// lab built into its side, rivers of lava, falling ash and rising embers; the climb (heat shimmer, a
// rope bridge, a silhouette against the glow), a lava cat sunbathing on lava, and the lab's steel door.
// draw(g, t, W, H) is a pure function of t. The volcano body is painted once into a cached sprite.
import * as K from "../filmkit.js";

const D = 62;
const { clamp, lerp, seg, smooth, mix, rgba, shade, hash, noise, fbm, glow, TAU } = K;
const eio = K.ease.inOut;

const LAVA = "#ff5a1e";
const CORE = "#ffe07a";
const ROCK = "#1e1410";
const GREEN = "#7aff9a";

// ---- particles -------------------------------------------------------------------------------------
// falling ash: grey flakes drifting down and sideways (wind px/s)
function ash(g, W, H, t, o = {}) {
  const n = o.count || 70, seed = o.seed || 3, wind = o.wind == null ? 12 : o.wind;
  const a0 = o.alpha == null ? 0.55 : o.alpha;
  g.save();
  for (let i = 0; i < n; i++) {
    const sp = 14 + hash(i, seed) * 26;
    const near = hash(i + 0.4, seed) > 0.85;
    const y = ((hash(i + 0.2, seed) * (H + 40) + t * sp * (near ? 2 : 1)) % (H + 40)) - 20;
    const x = (((hash(i + 0.7, seed) * (W + 80) + t * wind * (near ? 2.2 : 1) + Math.sin(t * 0.8 + i) * 14) % (W + 80)) + W + 80) % (W + 80) - 40;
    const s = (near ? 3.2 : 1.1) + hash(i + 0.9, seed) * 1.4;
    g.globalAlpha = a0 * (near ? 0.5 : 0.8);
    g.fillStyle = near ? "#8a7a70" : "#b8aca0";
    g.save();
    g.translate(x, y);
    g.rotate(t * (1 + hash(i, 5) * 2) + i);
    g.fillRect(-s, -s * 0.45, s * 2, s * 0.9);
    g.restore();
  }
  g.restore();
}
// rising embers: orange sparks that flicker and drift upward
function embers(g, W, H, t, o = {}) {
  const n = o.count || 40, seed = o.seed || 7;
  const [ax, ay, aw, ah] = o.area || [0, 0, W, H];
  const big = o.big || 1;
  for (let i = 0; i < n; i++) {
    const sp = 30 + hash(i, seed) * 60;
    const life = ah + 60;
    const y = ay + ah - ((hash(i + 0.3, seed) * life + t * sp) % life) + 30;
    const x = ax + hash(i + 0.6, seed) * aw + Math.sin(t * 1.3 + i * 2.1) * 12 + noise(t * 0.5 + i, seed) * 18 + (o.wind || 0) * ((t * sp) % life) / sp;
    const fl = 0.55 + 0.45 * Math.sin(t * (6 + hash(i, 4) * 6) + i);
    const s = (0.8 + hash(i + 0.8, seed) * 1.6) * big;
    glow(g, x, y, s * 6, "#ff7a2a", 0.35 * fl);
    glow(g, x, y, s * 1.6, "#fff0b0", 0.85 * fl);
  }
}

// ---- the volcano (sprite) ------------------------------------------------------------------------------
const VW = 1500, VH = 640;
const CRATER = [762, 96];
const RIVERS = [
  [748, 112, 712, 190, 676, 262, 640, 340, 610, 430, 560, 530, 520, 640],
  [790, 118, 826, 210, 858, 300, 900, 390, 952, 480, 990, 560, 1030, 640],
  [735, 140, 690, 230, 600, 300, 520, 380, 430, 470, 380, 560, 340, 640],
];
// Catmull-Rom samples of a flat x,y list (per = samples per span)
function crSample(pts, per = 10) {
  const n = pts.length / 2, out = [];
  const P = (i) => { i = Math.max(0, Math.min(n - 1, i)); return i * 2; };
  for (let i = 0; i < n - 1; i++) {
    const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2);
    for (let k = 0; k < per; k++) {
      const u = k / per, u2 = u * u, u3 = u2 * u;
      const f = (j) => 0.5 * (2 * pts[b + j] + (-pts[a + j] + pts[c + j]) * u + (2 * pts[a + j] - 5 * pts[b + j] + 4 * pts[c + j] - pts[d + j]) * u2 + (-pts[a + j] + 3 * pts[b + j] - 3 * pts[c + j] + pts[d + j]) * u3);
      out.push([f(0), f(1)]);
    }
  }
  out.push([pts[P(n - 1)], pts[P(n - 1) + 1]]);
  return out;
}
function ridgeY(x) {
  // the volcano's silhouette height at sprite x
  const peak = 96;
  const d = Math.abs(x - CRATER[0]);
  const base = peak + Math.pow(d / 760, 1.25) * 560;
  const rough = (fbm(x / 90, 4) * 18 + fbm(x / 22, 9) * 5) * clamp(d / 120);
  const rim = d < 60 ? 12 - Math.cos((d / 60) * Math.PI) * 10 : 0;
  return Math.min(VH, base + rough + rim);
}
function volcanoSprite() {
  return K.sprite("f08volcano2", VW, VH, (s) => {
    const R = K.rng("volc");
    const body = new Path2D();
    body.moveTo(0, VH);
    for (let x = 0; x <= VW; x += 6) body.lineTo(x, ridgeY(x));
    body.lineTo(VW, VH);
    body.closePath();
    const bg = s.createLinearGradient(0, 80, 0, VH);
    bg.addColorStop(0, "#3a2219");
    bg.addColorStop(0.5, "#24150f");
    bg.addColorStop(1, "#160c08");
    s.fillStyle = bg;
    s.fill(body);
    s.save();
    s.clip(body);
    // form: the sky glow wraps the left flank, the right flank turns away into shadow
    const fl = s.createLinearGradient(CRATER[0] - 700, 0, CRATER[0] + 700, 0);
    fl.addColorStop(0, "rgba(255,150,90,0.2)");
    fl.addColorStop(0.45, "rgba(255,150,90,0.06)");
    fl.addColorStop(0.55, "rgba(0,0,0,0.05)");
    fl.addColorStop(1, "rgba(0,0,0,0.32)");
    s.fillStyle = fl;
    s.fillRect(0, 0, VW, VH);
    // crater glow bleeding down the whole upper cone (no dark wedge between the flows)
    const cg = s.createRadialGradient(CRATER[0], CRATER[1] + 40, 10, CRATER[0], CRATER[1] + 160, 460);
    cg.addColorStop(0, "rgba(255,130,60,0.42)");
    cg.addColorStop(1, "rgba(255,110,40,0)");
    s.fillStyle = cg;
    s.fillRect(0, 0, VW, VH);
    // scoria texture: thousands of short strokes following the fall line
    for (let i = 0; i < 2600; i++) {
      const x = R() * VW, y = ridgeY(x) + R() * (VH - ridgeY(x));
      const side = x < CRATER[0] ? -1 : 1, l = 3 + R() * 9;
      s.strokeStyle = R() < 0.55 ? "rgba(0,0,0,0.28)" : "rgba(200,130,90,0.1)";
      s.lineWidth = 0.6 + R() * 1.4;
      s.beginPath();
      s.moveTo(x, y);
      s.lineTo(x + side * l * 0.55, y + l);
      s.stroke();
    }
    // gullies and ridges radiating down from the crater, each with a lit edge
    for (let i = 0; i < 46; i++) {
      const side = R() < 0.5 ? -1 : 1;
      const x0 = CRATER[0] + side * (20 + R() * 120), y0 = ridgeY(x0) + 4;
      const len = 120 + R() * 460;
      const x1 = x0 + side * len * (0.6 + R() * 0.5), y1 = y0 + len * (0.7 + R() * 0.4);
      const pth = new Path2D();
      pth.moveTo(x0, y0);
      pth.bezierCurveTo(x0 + side * len * 0.2, y0 + len * 0.3, x1 - side * len * 0.1, y1 - len * 0.4, x1, y1);
      const w = 1.5 + R() * 4;
      s.strokeStyle = "rgba(0,0,0,0.4)";
      s.lineWidth = w;
      s.stroke(pth);
      s.save();
      s.translate(-side * w * 0.7, -1);
      s.strokeStyle = "rgba(255,160,110,0.1)";
      s.lineWidth = w * 0.5;
      s.stroke(pth);
      s.restore();
    }
    // warm underlight from the lava on the slopes
    for (const rv of RIVERS) {
      for (let k = 2; k < rv.length; k += 2) {
        const gr = s.createRadialGradient(rv[k], rv[k + 1], 2, rv[k], rv[k + 1], 110);
        gr.addColorStop(0, "rgba(255,110,40,0.32)");
        gr.addColorStop(1, "rgba(255,110,40,0)");
        s.fillStyle = gr;
        s.fillRect(rv[k] - 110, rv[k + 1] - 110, 220, 220);
      }
    }
    const cr = s.createRadialGradient(CRATER[0], CRATER[1] + 10, 4, CRATER[0], CRATER[1] + 10, 150);
    cr.addColorStop(0, "rgba(255,170,80,0.7)");
    cr.addColorStop(1, "rgba(255,90,30,0)");
    s.fillStyle = cr;
    s.fillRect(CRATER[0] - 160, CRATER[1] - 40, 320, 220);
    // scattered boulders with lit tops
    for (let i = 0; i < 110; i++) {
      const x = R() * VW, y = ridgeY(x) + 20 + R() * (VH - ridgeY(x)), rx = 2 + R() * 7, ry = 1 + R() * 3;
      s.fillStyle = "rgba(0,0,0,0.4)";
      s.beginPath(); s.ellipse(x, y, rx, ry, 0, 0, TAU); s.fill();
      s.fillStyle = "rgba(220,140,100,0.16)";
      s.beginPath(); s.ellipse(x - 0.5, y - ry * 0.5, rx * 0.7, ry * 0.4, 0, 0, TAU); s.fill();
    }
    s.restore();
    // the notched crater lip, lit from inside
    s.fillStyle = "#120806";
    s.beginPath();
    s.ellipse(CRATER[0], CRATER[1] + 6, 46, 9, 0, 0, TAU);
    s.fill();
    // the lab, built into the right flank: stepped concrete, domes, pipes, a catwalk
    labBody(s);
  });
}
const LAB = { x: 1000, y: 312 };
function labBody(s) {
  const { x, y } = LAB;
  // concrete footings sunk into the slope beneath every block
  s.fillStyle = "#1a1414";
  s.beginPath();
  s.moveTo(x - 60, y + 140); s.lineTo(x - 30, y + 196); s.lineTo(x + 320, y + 196); s.lineTo(x + 310, y + 130); s.lineTo(x + 230, y + 110);
  s.closePath();
  s.fill();
  const block = (bx, by, bw, bh) => {
    const gr = s.createLinearGradient(bx, by, bx, by + bh);
    gr.addColorStop(0, "#5a5456");
    gr.addColorStop(1, "#24201f");
    s.fillStyle = gr;
    s.fillRect(bx, by, bw, bh);
    // the left face catches the sky, the right face is in shade
    s.fillStyle = "rgba(255,170,120,0.14)";
    s.fillRect(bx, by, 4, bh);
    s.fillStyle = "rgba(0,0,0,0.25)";
    s.fillRect(bx + bw - 6, by, 6, bh);
    s.fillStyle = "rgba(255,140,80,0.16)";
    s.fillRect(bx, by + bh - 4, bw, 4);
    s.strokeStyle = "rgba(0,0,0,0.45)";
    s.lineWidth = 1;
    s.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    // roof parapet
    s.fillStyle = "#6a6264";
    s.fillRect(bx - 2, by - 3, bw + 4, 3);
  };
  block(x - 50, y + 90, 90, 50);
  block(x, y + 40, 220, 70);
  block(x + 40, y, 150, 44);
  block(x + 180, y + 70, 120, 60);
  // a ventilation stack
  s.fillStyle = "#3a3436";
  s.fillRect(x + 172, y - 50, 12, 52);
  s.fillStyle = "#1a1616";
  s.fillRect(x + 170, y - 54, 16, 6);
  // window strips (glass, lit later)
  s.fillStyle = "#1a3a24";
  for (let i = 0; i < 7; i++) s.fillRect(x + 12 + i * 29, y + 58, 18, 10);
  for (let i = 0; i < 4; i++) s.fillRect(x + 192 + i * 26, y + 86, 16, 9);
  // pipes snaking down the slope, with flanges
  s.lineCap = "round";
  for (const [pw, c] of [[8, "#1e1a1a"], [5, "#5a504a"], [1.6, "#a89a90"]]) {
    s.strokeStyle = c;
    s.lineWidth = pw;
    s.beginPath();
    s.moveTo(x + 20, y + 110); s.bezierCurveTo(x - 20, y + 150, x - 80, y + 160, x - 140, y + 230);
    s.moveTo(x + 210, y + 130); s.bezierCurveTo(x + 230, y + 170, x + 260, y + 200, x + 320, y + 250);
    s.moveTo(x + 90, y); s.lineTo(x + 90, y - 40); s.lineTo(x + 60, y - 70);
    s.stroke();
  }
  s.fillStyle = "#2a2424";
  for (const [fx, fy] of [[x - 24, y + 146], [x - 92, y + 170], [x + 236, y + 172], [x + 280, y + 214]]) s.fillRect(fx - 4, fy - 4, 8, 8);
  // catwalk with railing (posts, two rails, kick plate)
  s.strokeStyle = "#141212";
  s.lineWidth = 2;
  s.beginPath();
  s.moveTo(x - 60, y + 90); s.lineTo(x + 40, y + 40);
  s.moveTo(x - 60, y + 80); s.lineTo(x + 40, y + 30);
  s.moveTo(x - 60, y + 74); s.lineTo(x + 40, y + 24);
  for (let k = 0; k <= 8; k++) { const u = k / 8; s.moveTo(lerp(x - 60, x + 40, u), lerp(y + 90, y + 40, u)); s.lineTo(lerp(x - 60, x + 40, u), lerp(y + 74, y + 24, u)); }
  s.moveTo(x + 40, y - 3); s.lineTo(x + 190, y - 3);
  for (let k = 0; k <= 10; k++) { s.moveTo(x + 40 + k * 15, y - 3); s.lineTo(x + 40 + k * 15, y - 12); }
  s.moveTo(x + 40, y - 12); s.lineTo(x + 190, y - 12);
  s.stroke();
  // glass domes (dark here, glowing green in the live pass): frames + a hot highlight
  for (const [dx, dy, r] of [[x + 70, y, 30], [x + 150, y, 22], [x + 250, y + 70, 26]]) {
    const dg = s.createRadialGradient(dx - r * 0.3, dy - r * 0.6, 1, dx, dy, r);
    dg.addColorStop(0, "#3a6a48");
    dg.addColorStop(1, "#102418");
    s.fillStyle = dg;
    s.beginPath();
    s.arc(dx, dy, r, Math.PI, 0);
    s.fill();
    s.strokeStyle = "rgba(20,30,24,0.9)";
    s.lineWidth = 1.4;
    s.beginPath();
    s.arc(dx, dy, r, Math.PI, 0);
    s.moveTo(dx, dy - r); s.lineTo(dx, dy);
    s.moveTo(dx - r * 0.7, dy - r * 0.7); s.lineTo(dx, dy);
    s.moveTo(dx + r * 0.7, dy - r * 0.7); s.lineTo(dx, dy);
    s.stroke();
    s.beginPath(); s.arc(dx, dy, r * 0.6, Math.PI, 0); s.stroke();
    s.strokeStyle = "rgba(255,220,180,0.55)";
    s.lineWidth = 1.6;
    s.beginPath(); s.arc(dx, dy, r * 0.86, Math.PI * 1.15, Math.PI * 1.4); s.stroke();
    s.fillStyle = "#3a3436";
    s.fillRect(dx - r - 2, dy, r * 2 + 4, 3);
  }
}
const DOMES = [[LAB.x + 70, LAB.y, 30], [LAB.x + 150, LAB.y, 22], [LAB.x + 250, LAB.y + 70, 26]];
// live lava: a crusted channel with braided threads of molten rock and crust plates riding it
function lavaRiver(g, pts, t, w, k = 1) {
  const S = crSample(pts, 10);
  const n = S.length;
  const p = new Path2D();
  K.spline(p, pts, false);
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  g.globalCompositeOperation = "lighter";
  g.strokeStyle = rgba("#ff4a10", 0.2 * k);
  g.lineWidth = w * 5;
  g.stroke(p);
  g.strokeStyle = rgba("#ff6a20", 0.22 * k);
  g.lineWidth = w * 2.4;
  g.stroke(p);
  g.globalCompositeOperation = "source-over";
  g.strokeStyle = "#1e0804";
  g.lineWidth = w * 1.7;
  g.stroke(p);
  g.strokeStyle = "#521608";
  g.lineWidth = w * 1.25;
  g.stroke(p);
  for (let b = 0; b < 3; b++) {
    const path = new Path2D();
    for (let i = 0; i < n; i++) {
      const a = S[Math.max(0, i - 1)], c = S[Math.min(n - 1, i + 1)];
      let tx = c[0] - a[0], ty = c[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      const off = (Math.sin(i * 0.55 + b * 2.1 - t * 0.35) * 0.36 + (b - 1) * 0.12) * w;
      const x = S[i][0] - ty * off, y = S[i][1] + tx * off;
      if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
    }
    g.strokeStyle = b === 1 ? "#ff7a2a" : LAVA;
    g.lineWidth = w * (0.44 - b * 0.07);
    g.stroke(path);
    g.strokeStyle = CORE;
    g.lineWidth = w * 0.13;
    g.stroke(path);
  }
  for (let j = 0; j < 12; j++) {
    const u = (hash(j, 31) + t * 0.025) % 1, i = Math.floor(u * (n - 1));
    const a = S[i], c = S[Math.min(n - 1, i + 1)];
    g.save();
    g.translate(a[0], a[1]);
    g.rotate(Math.atan2(c[1] - a[1], c[0] - a[0]));
    g.fillStyle = "#2a0c04";
    g.beginPath();
    g.ellipse(0, (hash(j, 32) - 0.5) * w * 0.5, w * (0.4 + hash(j, 33) * 0.6), w * 0.24, 0, 0, TAU);
    g.fill();
    g.restore();
  }
  g.restore();
}
// smoke column from the crater: billows lit orange underneath (x, y = crater)
function smokeColumn(g, x, y, t, s, o = {}) {
  const n = o.count || 22;
  for (let i = 0; i < n; i++) {
    const age = ((t * 0.04 + hash(i, 3)) % 1);
    const px = x + (noise(age * 3 + i, 4) * 40 + age * age * 200 * (o.lean || 1)) * s;
    const py = y - age * 520 * s;
    const r = (30 + age * 170) * s * (0.8 + hash(i, 5) * 0.4);
    const a = Math.min(1, age * 6) * (1 - age) * 0.85;
    glow(g, px, py, r, mix("#1e120c", "#3a2c26", age), Math.min(1, a * 1.3), "source-over");
    glow(g, px - r * 0.25, py - r * 0.25, r * 0.6, "#6a5a52", a * 0.35, "source-over");
    // the underside of each billow lit by the lava in the crater
    glow(g, px, py + r * 0.4, r * 0.75, "#ff6a24", a * 0.5 * (1 - age) * (1 - age));
  }
}
function volcano(g, t, ox, oy, sc, o = {}) {
  g.save();
  g.translate(ox, oy);
  g.scale(sc, sc);
  smokeColumn(g, CRATER[0], CRATER[1], t, o.smoke || 1, { lean: 1 });
  g.drawImage(volcanoSprite(), 0, 0, VW, VH);
  const pulse = 0.85 + 0.15 * Math.sin(t * 2.3);
  glow(g, CRATER[0], CRATER[1] + 6, 140, LAVA, 0.6 * pulse);
  glow(g, CRATER[0], CRATER[1] + 4, 50, CORE, 0.8);
  RIVERS.forEach((rv, i) => lavaRiver(g, rv, t + i * 3, i === 2 ? 5 : 7, 1));
  // lab lights
  for (const [dx, dy, r] of DOMES) {
    glow(g, dx, dy - r * 0.4, r * 2.6, GREEN, 0.35 + 0.1 * Math.sin(t * 1.7 + dx));
    g.fillStyle = rgba(GREEN, 0.3);
    g.beginPath();
    g.arc(dx, dy, r, Math.PI, 0);
    g.fill();
  }
  g.fillStyle = rgba(GREEN, 0.8);
  for (let i = 0; i < 7; i++) g.fillRect(LAB.x + 12 + i * 29, LAB.y + 58, 18, 10);
  for (let i = 0; i < 4; i++) g.fillRect(LAB.x + 192 + i * 26, LAB.y + 86, 16, 9);
  glow(g, LAB.x + 110, LAB.y + 62, 160, GREEN, 0.2);
  for (const [bx, by, ph] of [[LAB.x + 60, LAB.y - 72, 0], [LAB.x + 300, LAB.y + 66, 1.3]]) {
    const on = Math.sin(t * 3 + ph) > 0.3 ? 1 : 0.15;
    glow(g, bx, by, 14, "#ff3020", 0.9 * on);
  }
  // steam from the stack
  for (let i = 0; i < 5; i++) {
    const age = (t * 0.3 + i / 5) % 1;
    glow(g, LAB.x + 178 + age * 40, LAB.y - 56 - age * 70, 10 + age * 26, "#b8b0a8", 0.3 * (1 - age), "source-over");
  }
  g.restore();
}

// paint a figure into a layer, then light it: a rim on the side facing the light (o.rim {dx, dy}
// device-px offset AWAY from the light, color, alpha) and a glow from below (o.under {color, alpha,
// y0, y1} logical y, brightest at y1). Both are clipped to the figure's own pixels.
function litFigure(g, W, H, key, paint, o = {}) {
  const T = g.getTransform();
  const L = K.layer(W, H, key);
  L.g.setTransform(T);
  paint(L.g);
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  const E = K.layer(W, H, key + "E");
  const e = E.g;
  e.setTransform(1, 0, 0, 1, 0, 0);
  if (o.under) {
    e.drawImage(L.canvas, 0, 0);
    e.globalCompositeOperation = "source-in";
    const y0 = T.d * o.under.y0 + T.f, y1 = T.d * o.under.y1 + T.f;
    const gr = e.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, rgba(o.under.color, 0));
    gr.addColorStop(1, rgba(o.under.color, o.under.alpha));
    e.fillStyle = gr;
    e.fillRect(0, 0, E.canvas.width, E.canvas.height);
    e.globalCompositeOperation = "source-over";
  }
  if (o.rim) {
    const Rl = K.layer(W, H, key + "R");
    const r = Rl.g;
    r.setTransform(1, 0, 0, 1, 0, 0);
    r.drawImage(L.canvas, 0, 0);
    r.globalCompositeOperation = "source-atop";
    r.fillStyle = o.rim.color;
    r.fillRect(0, 0, Rl.canvas.width, Rl.canvas.height);
    r.globalCompositeOperation = "destination-out";
    r.drawImage(L.canvas, o.rim.dx, o.rim.dy);
    r.globalCompositeOperation = "source-over";
    e.globalAlpha = o.rim.alpha;
    e.drawImage(Rl.canvas, 0, 0);
    e.globalAlpha = 1;
  }
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(L.canvas, 0, 0);
  g.globalCompositeOperation = "lighter";
  g.drawImage(E.canvas, 0, 0);
  g.restore();
}

// ---- SHOT 1: ultra-wide establishing, slow pan --------------------------------------------------------
function ashSky(g, W, H, t) {
  K.sky(g, W, H, { top: "#2a0e0a", mid: "#7a321a", bottom: "#ff9a5a", horizon: 0.78 });
  K.clouds(g, W, H, t, { seed: 91, color: "#5a2a1e", shade: "#2a0e0a", count: 8, y: H * 0.16, spread: H * 0.1, speed: 5, scale: 1.4, alpha: 0.7 });
}
function shot1(g, t, W, H) {
  const p = eio(seg(t, 0, 10));
  const sc = lerp(0.4, 0.44, p), pan = lerp(-24, 24, p);
  ashSky(g, W, H, t);
  // distant ranges, hazed toward the glowing sky
  g.save();
  g.translate(-pan * 0.2, 0);
  K.hills(g, W + 200, H, { y: H * 0.74, amp: 40, color: "#6a321e", seed: 3, haze: "#ff9a5a", hazeAmt: 0.55, freq: 1.4 });
  g.restore();
  const baseY = 470;
  volcano(g, t, 540 + pan - CRATER[0] * sc, baseY - VH * sc, sc, { smoke: 2.2 });
  // haze pooled at the volcano's foot
  K.fog(g, W, H, { y: baseY - 40, h: 90, color: "#c8603a", alpha: 0.3, t, seed: 4 });
  // nearer ridges, darker, overlapping the base
  g.save();
  g.translate(-pan * 0.5, 0);
  K.hills(g, W + 200, H, { y: H * 0.86, amp: 34, color: "#24120c", seed: 8, haze: "#c8603a", hazeAmt: 0.25, freq: 2.2 });
  g.restore();
  K.fog(g, W, H, { y: H * 0.88, h: H * 0.16, color: "#ff8a4a", alpha: 0.16, t, seed: 5 });
  // foreground rocks, out of focus, moving fastest
  K.focus(g, W, H, 6, (c) => {
    c.save();
    c.translate(-pan * 1.4, 0);
    c.fillStyle = "#0c0705";
    c.beginPath();
    c.moveTo(-100, H);
    for (let x = -100; x <= W + 400; x += 14) c.lineTo(x, H - 30 - fbm(x / 120, 12) * 30 - Math.max(0, Math.sin(x / 260)) * 20);
    c.lineTo(W + 400, H);
    c.fill();
    c.restore();
    glow(c, W * 0.3, H, 220, LAVA, 0.25);
  }, "f08fg1");
  ash(g, W, H, t, { count: 80, wind: 10, alpha: 0.5 });
  embers(g, W, H, t, { count: 22, area: [0, H * 0.3, W, H * 0.7] });
}

// ---- SHOT 2: tracking behind you at the base; heat shimmer, a lava bubble bursts ---------------------
const PASS = [[-2.2, 0.4, 3.2], [2.4, 0.5, 4.6], [-2.8, 0.6, 6.4], [2.0, 0.5, 7.8], [-2.4, 0.45, 9.0], [2.6, 0.55, 11]];
function boulder(g, x, y, s, seed, lit) {
  const R = K.rng("b" + seed);
  const p = new Path2D();
  const pts = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    const r = s * (0.75 + R() * 0.35);
    pts.push(x + Math.cos(a) * r * 1.2, y + Math.sin(a) * r * 0.9);
  }
  K.spline(p, pts, false);
  p.closePath();
  const gr = g.createLinearGradient(x - s, y - s, x + s, y);
  gr.addColorStop(0, "#1a100c");
  gr.addColorStop(1, "#0a0605");
  g.fillStyle = gr;
  g.fill(p);
  if (lit) K.crescent(g, p, -lit * s * 0.08, s * 0.06, "#ff7a2a", 0.6, [x - s * 1.5, y - s * 1.2, x + s * 1.5, y + 2], "lighter");
}
// a trail as a ribbon: widths taper with distance, both edges broken by stones, the near edge lit
function trailRibbon(g, pts, w0, w1, seed) {
  const S = crSample(pts, 8), n = S.length;
  const Lft = [], Rgt = [];
  for (let i = 0; i < n; i++) {
    const a = S[Math.max(0, i - 1)], c = S[Math.min(n - 1, i + 1)];
    let tx = c[0] - a[0], ty = c[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    const w = lerp(w0, w1, i / (n - 1)) * 0.5;
    const j1 = (hash(i, seed) - 0.5) * w * 0.35, j2 = (hash(i, seed + 1) - 0.5) * w * 0.35;
    Lft.push([S[i][0] - ty * (w + j1), S[i][1] + tx * (w + j1)]);
    Rgt.push([S[i][0] + ty * (w + j2), S[i][1] - tx * (w + j2)]);
  }
  const rib = new Path2D();
  Lft.forEach((q, i) => (i ? rib.lineTo(q[0], q[1]) : rib.moveTo(q[0], q[1])));
  for (let i = n - 1; i >= 0; i--) rib.lineTo(Rgt[i][0], Rgt[i][1]);
  rib.closePath();
  g.fillStyle = "#6a4432";
  g.fill(rib);
  g.save();
  g.clip(rib);
  const lg = g.createLinearGradient(0, S[n - 1][1], 0, S[0][1]);
  lg.addColorStop(0, "rgba(255,150,90,0.1)");
  lg.addColorStop(1, "rgba(255,170,110,0.35)");
  g.fillStyle = lg;
  g.fillRect(0, S[n - 1][1] - 20, 2000, S[0][1] - S[n - 1][1] + 40);
  g.restore();
  // stones along both edges
  g.fillStyle = "#140c08";
  for (let i = 0; i < n; i += 1) {
    for (const E of [Lft, Rgt]) {
      if (hash(i, seed + (E === Lft ? 3 : 4)) < 0.5) continue;
      const r = lerp(w0, w1, i / (n - 1)) * 0.14;
      g.beginPath();
      g.ellipse(E[i][0], E[i][1], r * 1.3, r * 0.8, 0, 0, TAU);
      g.fill();
    }
  }
}
function shot2bg(g, t, W, H) {
  ashSky(g, W, H, t);
  // the volcano flank filling the top of frame, lava streams far up the slope
  volcano(g, t, -60, 30, 0.78);
  // the ground plane up to the foot of the mountain
  const gp = g.createLinearGradient(0, 420, 0, H);
  gp.addColorStop(0, "#2a1610");
  gp.addColorStop(1, "#0c0605");
  g.fillStyle = gp;
  g.beginPath();
  g.moveTo(-20, H + 20);
  for (let x = -20; x <= W + 20; x += 16) g.lineTo(x, 430 + fbm(x / 70, 4) * 10);
  g.lineTo(W + 20, H + 20);
  g.fill();
  // the trail from your feet to the mountain, then switchbacks up the slope (a lit ribbon)
  trailRibbon(g, [490, H + 30, 494, 480, 490, 432], 120, 18, 5);
  trailRibbon(g, [489, 434, 430, 400, 560, 360, 450, 318, 540, 280, 480, 246], 17, 6, 9);
}
function shot2(g, t, W, H) {
  const tt = t - 10;
  // background with heat shimmer: horizontal bands displaced by travelling sines, strongest low down
  const L = K.layer(W, H, "f08shimmer");
  shot2bg(L.g, t, W, H);
  const px = K.pixelScale();
  const strip = 12;
  for (let y = 0; y < H; y += strip) {
    const amt = y > H * 0.4 ? 2.8 : y > H * 0.25 ? 1.4 : 0.5;
    const off = Math.sin(t * 5.2 - y * 0.09) * amt + Math.sin(t * 3.1 + y * 0.21) * amt * 0.5;
    g.drawImage(L.canvas, 0, y * px, W * px, strip * px, off - 4, y, W + 8, strip);
  }
  // the lava pool to the right, its surface crawling
  const pool = new Path2D();
  pool.ellipse(800, 520, 260, 60, -0.05, 0, TAU);
  g.save();
  g.clip(pool);
  const lg = g.createRadialGradient(800, 520, 10, 800, 520, 260);
  lg.addColorStop(0, CORE);
  lg.addColorStop(0.4, "#ff8a2a");
  lg.addColorStop(1, "#a8280a");
  g.fillStyle = lg;
  g.fillRect(520, 440, 560, 160);
  g.strokeStyle = "rgba(60,10,0,0.55)";
  g.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const yy = 480 + i * 10, ph = t * (0.8 + i * 0.1) + i;
    g.beginPath();
    for (let x = 540; x <= 1060; x += 20) g.lineTo(x, yy + Math.sin(x * 0.03 + ph) * 4);
    g.stroke();
  }
  g.restore();
  glow(g, 800, 500, 340, LAVA, 0.35);
  // the bubble (bottom right of the pool): swells 15.6 -> 16, bursts into a spray of embers
  const bx = 850, by = 486;
  if (t < 16) {
    const sw = smooth(seg(t, 15.6, 16)) * 0.85 + smooth(seg(t, 14.4, 15.6)) * 0.15;
    if (sw > 0) {
      const bg = g.createRadialGradient(bx - 6 * sw, by - 16 * sw, 1, bx, by - 8 * sw, 30 * sw + 4);
      bg.addColorStop(0, "#fff6c0");
      bg.addColorStop(0.5, "#ff9a3a");
      bg.addColorStop(1, "#c8380e");
      g.fillStyle = bg;
      g.beginPath();
      g.ellipse(bx, by, 6 + sw * 30, 4 + sw * 26, 0, Math.PI, 0);
      g.fill();
      g.strokeStyle = rgba("#3a0a00", 0.5 * sw);
      g.lineWidth = 1.5;
      g.stroke();
      glow(g, bx, by - sw * 12, 30 + sw * 50, CORE, 0.5 * sw);
    }
  } else {
    const k = t - 16;
    if (k < 2.2) {
      for (let i = 0; i < 36; i++) {
        const vx = (hash(i, 8) - 0.5) * 300, vy = -(220 + hash(i, 9) * 260);
        const x = bx + vx * k, y = by + vy * k + 0.5 * 520 * k * k;
        if (y > by + 20) continue;
        const f = 1 - k / 2.2;
        // a short streak along the velocity
        const vyk = vy + 520 * k;
        g.strokeStyle = rgba("#ffb050", 0.7 * f);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - vx * 0.02, y - vyk * 0.02);
        g.stroke();
        glow(g, x, y, 10, "#ff7a2a", 0.6 * f);
        glow(g, x, y, 2.5, "#fff0b0", f);
      }
      glow(g, bx, by, 140 * (1 - k / 2.2), CORE, 0.6 * (1 - k / 2.2));
    }
  }
  // boulders we pass (true perspective, cycling as we walk)
  const camZ = tt * 0.42;
  const items = PASS.map(([X, Y, z0], i) => ({ X, Y, z: ((z0 - camZ) % 9 + 9) % 9 + 0.6, i })).sort((a, b) => b.z - a.z);
  for (const it of items) {
    const s = 100 / it.z;
    boulder(g, 486 + it.X * 1.9 * s, 432 + s, s * 0.9, it.i, it.X > 0 ? 1 : -1);
  }
  // you, walking up the path, hood up; lava underlight and a hot rim on the side facing the pool
  const kx = 470 + noise(t * 0.5, 2) * 4, ky = 520;
  g.save();
  g.translate(kx, ky + 2);
  g.scale(1, 0.18);
  glow(g, 0, 0, 70, "#000000", 0.6, "source-over");
  g.restore();
  litFigure(g, W, H, "f08kid2", (c) => {
    K.drawPerson(c, kx, ky, 210, {
      view: "back", walk: true, phase: tt * 0.9, hood: true, t, bell: true, shadow: false,
      light: { x: 860, y: 600, color: "#ff7a2a", strength: 1.5 },
    });
  }, {
    under: { color: "#ff7a2a", alpha: 0.5, y0: ky - 150, y1: ky },
    rim: { dx: -3 * px, dy: -1 * px, color: "#ffb060", alpha: 0.85 },
  });
  embers(g, W, H, t, { count: 34, area: [500, 200, 460, 340], seed: 12 });
  ash(g, W, H, t, { count: 60, wind: 8, seed: 5 });
  if (t >= 16 && t < 16.15) K.fadeColor(g, W, H, 0.35 * (1 - (t - 16) / 0.15), CORE);
  else if (t > 16 && t < 16.6) K.fadeColor(g, W, H, (1 - seg(t, 16, 16.6)) * 0.05, CORE);
}

// ---- SHOT 3: low angle from beside the lava, up at the rope bridge --------------------------------------
const BR0 = 150, BR1 = 830;
function bridgeAt(x, t) {
  const u = clamp((x - BR0) / (BR1 - BR0));
  const s = Math.sin(u * Math.PI);
  return [x + Math.sin(t * 1.1 + 0.6) * 6 * s, lerp(156, 138, u) + s * 44 + Math.sin(t * 1.4) * s * 4];
}
function crustLava(g, W, H, t, top) {
  // lava close to the lens: a bright melt with dark cooled plates drifting on it, seams glowing
  const lg = g.createLinearGradient(0, top, 0, H);
  lg.addColorStop(0, "#ffb050");
  lg.addColorStop(0.3, "#ff6a1e");
  lg.addColorStop(1, "#a8280a");
  g.fillStyle = lg;
  g.fillRect(-40, top, W + 80, H - top + 40);
  g.save();
  g.beginPath();
  g.rect(-40, top, W + 80, H - top + 40);
  g.clip();
  for (let row = 0; row < 5; row++) {
    const y = top + 6 + row * row * 9 + row * 6, sc = 0.5 + row * 0.35;
    const n = 9 - row;
    for (let i = 0; i < n; i++) {
      const span = W + 300;
      const x = ((hash(i, row + 40) * span + t * (10 + row * 6)) % span) - 150;
      const R = K.rng("pl" + row + ":" + i);
      const pl = new Path2D();
      const pts = [];
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU, r = (34 + R() * 26) * sc;
        pts.push(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 0.32);
      }
      K.spline(pl, pts, true);
      g.fillStyle = "#2a0c04";
      g.fill(pl);
      g.strokeStyle = rgba(CORE, 0.55);
      g.lineWidth = 1.2;
      g.stroke(pl);
      g.fillStyle = "rgba(255,120,60,0.12)";
      g.beginPath();
      g.ellipse(x, y - 2 * sc, 26 * sc, 3 * sc, 0, 0, TAU);
      g.fill();
    }
  }
  g.restore();
  glow(g, W * 0.5, top, 520, LAVA, 0.3);
}
function shot3(g, t, W, H) {
  const p = eio(seg(t, 20, 30));
  K.withCamera(g, W, H, { x: 480 + p * 16, y: 270, zoom: 1.02 + p * 0.04, rot: Math.sin(t * 0.6) * 0.004, shakeT: t, shakeAmt: 1 }, () => {
    ashSky(g, W, H, t);
    // the mountain far off down the chasm, smoking
    volcano(g, t, 500 - CRATER[0] * 0.3, 380 - VH * 0.3, 0.3, { smoke: 1.3 });
    K.fog(g, W, H, { y: H * 0.62, h: H * 0.25, color: "#ff8a4a", alpha: 0.22, t, seed: 6 });
    // the far end of the chasm, its foot lit by the river
    const far = new Path2D();
    far.moveTo(-20, H);
    for (let x = -20; x <= W + 20; x += 12) far.lineTo(x, 352 + fbm(x / 60, 7) * 18);
    far.lineTo(W + 20, H);
    far.closePath();
    const bw = g.createLinearGradient(0, 340, 0, 470);
    bw.addColorStop(0, "#1a0c08");
    bw.addColorStop(0.6, "#3a160c");
    bw.addColorStop(1, "#d0501c");
    g.fillStyle = bw;
    g.fill(far);
    K.crescent(g, far, 0, 3, "#ffa060", 0.45, [-40, 330, W + 40, 390], "lighter");
    // the towering chasm walls either side, lit from the lava below
    for (const side of [-1, 1]) {
      const topX = side < 0 ? BR0 + 20 : BR1 - 20, topY = side < 0 ? 140 : 122;
      const x0 = side < 0 ? -40 : W + 40;
      const wall = new Path2D();
      wall.moveTo(x0, topY - 30);
      wall.lineTo(topX, topY - 4);
      for (let y = topY; y <= H + 20; y += 14) wall.lineTo(topX - side * (fbm(y / 40, side + 5) * 30 + (y - topY) * 0.32), y);
      wall.lineTo(x0, H + 20);
      wall.closePath();
      const wg = g.createLinearGradient(0, topY, 0, H);
      wg.addColorStop(0, "#120a08");
      wg.addColorStop(1, "#4a1a0c");
      g.fillStyle = wg;
      g.fill(wall);
      g.save();
      g.clip(wall);
      g.strokeStyle = "rgba(0,0,0,0.4)";
      g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i < 14; i++) { const y = topY + 20 + hash(i, side + 9) * (H - topY), x = side < 0 ? hash(i, 3) * topX : W - hash(i, 3) * (W - topX); g.moveTo(x, y); g.lineTo(x + side * 30, y + 10); }
      g.stroke();
      g.restore();
      K.crescent(g, wall, side * 6, -3, "#ff7a2a", 0.6, [Math.min(x0, topX) - 200, topY - 40, Math.max(x0, topX) + 200, H + 20], "lighter");
    }
    // the bridge seen from below: plank undersides glowing with lava light, rope stringers
    const ropeLine = (dy, w, c) => {
      g.strokeStyle = c;
      g.lineWidth = w;
      g.beginPath();
      for (let x = BR0; x <= BR1; x += 10) { const [bx, by] = bridgeAt(x, t); if (x === BR0) g.moveTo(bx, by + dy); else g.lineTo(bx, by + dy); }
      g.stroke();
    };
    g.lineCap = "round";
    // the handrail ropes (behind) and their hangers
    ropeLine(-60, 3, "#2a1a10");
    for (let x = BR0 + 20; x <= BR1 - 20; x += 34) {
      const [bx, by] = bridgeAt(x, t);
      g.strokeStyle = "#2a1a10";
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(bx, by - 60 + Math.sin((x - BR0) / (BR1 - BR0) * Math.PI) * 4);
      g.lineTo(bx, by);
      g.stroke();
    }
    for (let x = BR0 + 2; x <= BR1 - 12; x += 13) {
      const [ax, ay] = bridgeAt(x, t), [cx, cy] = bridgeAt(x + 10, t);
      const tilt = Math.sin(x * 0.7) * 1.2;
      // thin front edge, then the underside (deep, lit warm from below)
      g.fillStyle = "#1e0e06";
      g.beginPath();
      g.moveTo(ax, ay - 2 + tilt); g.lineTo(cx, cy - 2 - tilt); g.lineTo(cx, cy + 2 - tilt); g.lineTo(ax, ay + 2 + tilt);
      g.closePath();
      g.fill();
      const ug = g.createLinearGradient(0, ay + 2, 0, ay + 12);
      ug.addColorStop(0, "#4a2414");
      ug.addColorStop(1, "#e07a3a");
      g.fillStyle = ug;
      g.beginPath();
      g.moveTo(ax, ay + 2 + tilt); g.lineTo(cx, cy + 2 - tilt); g.lineTo(cx - 1, cy + 11 - tilt); g.lineTo(ax + 1, ay + 11 + tilt);
      g.closePath();
      g.fill();
    }
    ropeLine(9, 2.6, "#1a0c06");
    ropeLine(12, 1, "rgba(255,150,80,0.6)");
    // the anchor posts on each rim
    for (const x of [BR0, BR1]) {
      const [bx, by] = bridgeAt(x, t);
      g.fillStyle = "#1a0c06";
      g.fillRect(bx - 5, by - 66, 10, 70);
      g.fillStyle = "rgba(255,140,70,0.5)";
      g.fillRect(bx + (x === BR0 ? 3 : -5), by - 66, 2, 70);
    }
    // you, crossing (seen from below, careful steps, hood up)
    const kx0 = lerp(BR0 + 40, BR1 - 60, eio(seg(t, 20.4, 29.6)));
    const [kx, ky] = bridgeAt(kx0, t);
    K.drawPerson(g, kx, ky - 2, 104, {
      view: "side", facing: 1, walk: true, phase: (t - 20) * 0.8, t, bell: true, hood: true, shadow: false,
      light: { x: kx, y: 600, color: "#ff7a2a", strength: 1.8 },
    });
    ropeLine(-58, 2.2, "#3a2414");
    ropeLine(-56.5, 1, "rgba(255,140,70,0.45)");
    // lava close to the lens, crusted
    crustLava(g, W, H, t, 470);
  });
  // embers rising past the lens, big and soft, and a column of them from the river
  K.focus(g, W, H, 4, (c) => embers(c, W, H, t, { count: 16, seed: 21, big: 3.5, area: [0, 0, W, H] }), "f08emb");
  embers(g, W, H, t, { count: 44, seed: 22, area: [80, 140, 800, 360] });
  ash(g, W, H, t, { count: 50, wind: 14, seed: 8 });
}

// ---- SHOT 4: profile silhouette climb up a steep face against the glowing sky ------------------------
function faceX(y) {
  // the cliff's sky edge: ~67 degrees, broken into ledges
  const u = (H4 - y) / (H4 + 80);
  return lerp(330, 640, u) + fbm(y / 46, 3) * 22 + (Math.floor(y / 38) % 2 ? 6 : -4);
}
const H4 = 580;
function shot4(g, t, W, H) {
  const p = eio(seg(t, 30, 42));
  K.withCamera(g, W, H, { x: 480 + p * 16, y: 270 - p * 30, zoom: 1.0 + p * 0.05, shakeT: t, shakeAmt: 1 }, () => {
    K.sky(g, W, H, { top: "#4a1a12", mid: "#c8502a", bottom: "#ffb070", horizon: 0.9 });
    K.sunGlow(g, 180, 380, 40, "#ffc080", 0.6);
    smokeColumn(g, 150, 420, t, 0.7, { count: 12, lean: 2.4 });
    K.hills(g, W, H, { y: H * 0.88, amp: 50, color: "#6a2a18", seed: 5, haze: "#ffb070", hazeAmt: 0.5 });
    const face = new Path2D();
    face.moveTo(W + 60, H + 60);
    for (let y = H + 60; y >= -100; y -= 8) face.lineTo(faceX(y), y);
    face.lineTo(W + 60, -100);
    face.closePath();
    g.fillStyle = "#120a07";
    g.fill(face);
    g.save();
    g.clip(face);
    // strata + cracks, catching a little reflected sky near the edge
    for (let i = 0; i < 40; i++) {
      const y = -80 + hash(i, 61) * (H + 160), x = faceX(y) + 6 + hash(i, 62) * 260;
      g.strokeStyle = hash(i, 63) < 0.5 ? "rgba(0,0,0,0.6)" : "rgba(255,140,80,0.07)";
      g.lineWidth = 1 + hash(i, 64) * 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 40 + hash(i, 65) * 60, y + 14 + hash(i, 66) * 12);
      g.stroke();
    }
    const eg = g.createLinearGradient(330, 0, 620, 0);
    eg.addColorStop(0, "rgba(255,120,60,0.12)");
    eg.addColorStop(1, "rgba(255,120,60,0)");
    g.fillStyle = eg;
    g.fillRect(0, -100, W, H + 200);
    // ash streaming across the dark rock
    ash(g, W, H, t, { count: 70, wind: 160, seed: 12, alpha: 0.9 });
    g.restore();
    // rim light on the edge, and lit lips on the handholds
    K.crescent(g, face, 7, 2, "#ff9a5a", 0.9, [200, -110, W + 60, H + 60], "lighter");
    for (let y = -60; y < H + 40; y += 38) {
      const x = faceX(y);
      g.fillStyle = "rgba(255,170,110,0.75)";
      g.fillRect(x - 6, y - 1, 12, 2);
      g.fillStyle = "#0e0806";
      g.fillRect(x - 6, y + 1, 12, 4);
    }
    // you, pressed to the face: feet on a ledge, a hand up on the next hold
    const yk = lerp(470, 330, p);
    const xk = faceX(yk) - 4;
    const climb = (t - 30) * 0.7;
    // the reaching arm: from the shoulder up to the next lit hold, hot rim along its top
    const pull = 0.5 + 0.5 * Math.sin(climb * TAU);
    const hy = yk - 112 - pull * 14, hx = faceX(hy) - 2;
    const sx = xk + 4, sy = yk - 82;
    g.lineCap = "round";
    g.strokeStyle = "#2a1a0e";
    g.lineWidth = 9;
    g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx - 10, (sy + hy) / 2, hx, hy); g.stroke();
    g.strokeStyle = "rgba(255,170,100,0.7)";
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(sx - 4, sy); g.quadraticCurveTo(sx - 15, (sy + hy) / 2, hx - 4, hy + 2); g.stroke();
    g.fillStyle = "#2a160c";
    g.beginPath(); g.ellipse(hx, hy, 6, 5, 0, 0, TAU); g.fill();
    g.save();
    g.translate(xk, yk);
    g.rotate(0.12);
    K.drawPerson(g, 0, 0, 120, {
      view: "side", facing: 1, walk: true, phase: climb * 0.5, reach: 0.6, crouch: 0.12, t, hood: true,
      coat: "#2a1a0e", pants: "#140c08", boots: "#1a0c08", hair: "#140a06", skin: "#2a160c",
      light: { x: -400, y: -200, color: "#ffb070", strength: 2 }, shadow: false,
    });
    g.restore();
  });
  ash(g, W, H, t, { count: 60, wind: 120, seed: 11, alpha: 0.5 });
  embers(g, W, H, t, { count: 20, seed: 31, wind: 60 });
}

// ---- SHOT 5: the lava cat, sunbathing on lava ------------------------------------------------------------
// coal-black fur; its light comes from the cracks (drawn separately, additive)
const LAVACAT = {
  base: "#1e1410", light: "#2e2018", dark: "#0c0806", stripe: "#1e1410", tip: "#ff7a2a", belly: "#1e1410", white: "#1e1410",
  nose: "#ff8a4a", noseEdge: "#a8401a", innerEar: "#ff7a3a", iris: "#ffcf4a", irisInner: "#fff0a0", liner: "#120806",
  pattern: "solid", bib: false, socks: false, muzzle: false, stripeAlpha: 0, bentEar: false,
};
const CAT5 = { x: 580, y: 414, s: 140 };
// branching lava cracks over the cat's area, painted once
function crackSprite() {
  return K.sprite("f08cracks", 420, 240, (s) => {
    const R = K.rng("lavacracks");
    const segs = [];
    const grow = (x, y, a, len, depth) => {
      const pts = [x, y];
      for (let k = 0; k < 5; k++) { a += (R() - 0.5) * 0.9; x += Math.cos(a) * len / 5; y += Math.sin(a) * len / 5; pts.push(x, y); }
      segs.push([pts, depth]);
      if (depth < 3) {
        const nb = 1 + (R() < 0.6 ? 1 : 0);
        for (let b = 0; b < nb; b++) grow(x, y, a + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.6), len * 0.62, depth + 1);
      }
    };
    for (let i = 0; i < 9; i++) grow(40 + R() * 340, 40 + R() * 170, R() * TAU, 70 + R() * 50, 0);
    s.lineCap = "round";
    s.lineJoin = "round";
    for (const [w, c] of [[7, "rgba(255,90,30,0.35)"], [3, "#ff5a1e"], [1.1, "#ffe07a"]]) {
      for (const [pts, d] of segs) {
        const pp = new Path2D();
        K.spline(pp, pts, false);
        s.strokeStyle = c;
        s.lineWidth = w * (1 - d * 0.22);
        s.stroke(pp);
      }
    }
  });
}
function warmRock(g, x, y, w, h, t) {
  const p = new Path2D();
  K.spline(p, [x - w / 2, y, x - w * 0.46, y - h * 0.6, x - w * 0.2, y - h, x + w * 0.25, y - h * 0.95, x + w * 0.48, y - h * 0.5, x + w / 2, y], false);
  p.closePath();
  const gr = g.createLinearGradient(0, y - h, 0, y);
  gr.addColorStop(0, "#3a2016");
  gr.addColorStop(1, "#140a06");
  g.fillStyle = gr;
  g.fill(p);
  g.save();
  g.clip(p);
  g.lineCap = "round";
  const R = K.rng("crack");
  for (let i = 0; i < 9; i++) {
    let cx = x + (R() - 0.5) * w * 0.8, cy = y - R() * h * 0.8;
    const pts = [cx, cy];
    for (let k = 0; k < 4; k++) { cx += (R() - 0.5) * 40; cy += R() * 18; pts.push(cx, cy); }
    const pp = new Path2D();
    K.spline(pp, pts, false);
    const fl = 0.7 + 0.3 * Math.sin(t * 1.5 + i);
    g.strokeStyle = rgba(LAVA, 0.5 * fl);
    g.lineWidth = 5;
    g.stroke(pp);
    g.strokeStyle = rgba(CORE, 0.9 * fl);
    g.lineWidth = 1.6;
    g.stroke(pp);
  }
  g.restore();
  K.crescent(g, p, -4, 5, "#ff9a5a", 0.5, [x - w, y - h - 10, x + w, y + 4], "lighter");
}
// the slope behind: you are up on it, hands on the rock; out of focus (baked once)
const SLOPE5 = (u) => [lerp(-20, 980, u), (1 - u) * (1 - u) * 330 + 2 * u * (1 - u) * 250 + u * u * 40];
function shot5bg(c, W, H) {
  K.sky(c, W, H, { top: "#3a1410", mid: "#9a4020", bottom: "#ff9a5a", horizon: 0.6 });
  // a far ridge, hazed
  c.fillStyle = "#5a2418";
  c.beginPath();
  c.moveTo(-20, 300);
  for (let x = -20; x <= W + 20; x += 20) c.lineTo(x, 280 - Math.sin(x / 140) * 20 - fbm(x / 60, 2) * 14);
  c.lineTo(W + 20, H); c.lineTo(-20, H);
  c.fill();
  // the near cliff face rising to the right, texture + a lit edge
  const face = new Path2D();
  face.moveTo(-20, H);
  for (let u = 0; u <= 1.0001; u += 0.05) { const q = SLOPE5(u); face.lineTo(q[0], q[1] + fbm(u * 12, 6) * 12); }
  face.lineTo(W + 20, 40); face.lineTo(W + 20, H);
  face.closePath();
  const fg = c.createLinearGradient(0, 40, 0, H);
  fg.addColorStop(0, "#2a1810");
  fg.addColorStop(1, "#140a06");
  c.fillStyle = fg;
  c.fill(face);
  c.save();
  c.clip(face);
  for (let i = 0; i < 60; i++) {
    const x = hash(i, 71) * W, y = 60 + hash(i, 72) * 380;
    c.strokeStyle = hash(i, 73) < 0.6 ? "rgba(0,0,0,0.45)" : "rgba(255,140,80,0.1)";
    c.lineWidth = 2 + hash(i, 74) * 4;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 30 + hash(i, 75) * 50, y - 10 - hash(i, 76) * 20); c.stroke();
  }
  c.restore();
  K.crescent(c, face, 3, 6, "#ffa060", 0.7, [-40, 20, W + 40, H], "lighter");
  lavaRiver(c, [80, 540, 160, 440, 260, 380, 330, 300], 0, 7);
  // the lab, up the slope to the right, green windows and a yellow door
  c.fillStyle = "#3a3638";
  c.fillRect(760, 70, 170, 70);
  c.fillStyle = "#2a2628";
  c.fillRect(800, 30, 90, 44);
  c.fillStyle = rgba(GREEN, 0.85);
  for (let i = 0; i < 5; i++) c.fillRect(772 + i * 32, 98, 18, 12);
  c.fillStyle = "#c8a020";
  c.fillRect(828, 92, 34, 48);
  glow(c, 840, 100, 160, GREEN, 0.35);
}
function lavaPool(g, W, H, t) {
  // a slow lava lake across the bottom of frame, crust plates drifting on it
  const top = 400;
  const lg = g.createLinearGradient(0, top, 0, H);
  lg.addColorStop(0, "#ff8a2a");
  lg.addColorStop(0.35, "#e0400e");
  lg.addColorStop(1, "#6a1404");
  g.fillStyle = lg;
  g.fillRect(-20, top, W + 40, H - top + 20);
  g.save();
  g.beginPath();
  g.rect(-20, top, W + 40, H - top + 20);
  g.clip();
  for (let i = 0; i < 22; i++) {
    const d = hash(i, 7);
    const y = top + 6 + d * d * 150;
    const sc = 0.4 + (y - top) / 150;
    const x = ((hash(i, 8) * (W + 300) + t * (8 + d * 10)) % (W + 300)) - 150;
    g.fillStyle = "#2a0e06";
    g.beginPath();
    g.ellipse(x, y, (30 + hash(i, 9) * 50) * sc, (3 + hash(i, 10) * 4) * sc, 0, 0, TAU);
    g.fill();
    g.strokeStyle = rgba(CORE, 0.6);
    g.lineWidth = 1.2;
    g.stroke();
  }
  g.restore();
  glow(g, W * 0.5, top, 500, CORE, 0.25);
  g.fillStyle = rgba(CORE, 0.8);
  g.fillRect(-20, top - 1, W + 40, 2);
}
function shot5(g, t, W, H) {
  const p = eio(seg(t, 42, 52));
  // background, far out of focus: blurred once and cached
  const bg = K.sprite("f08bg5b", W, H, (s) => {
    const L = K.layer(W, H, "f08bg5tmp");
    shot5bg(L.g, W, H);
    K.dof(s, L.canvas, 7);
  });
  const push = 1 + p * 0.05;
  g.save();
  g.translate(480, 300);
  g.scale(push, push);
  g.translate(-480, -300);
  g.drawImage(bg, 0, 0, W, H);
  // you: a small climber ON the slope, hands to the rock, softly out of focus like the slope
  const cu = 0.42 + p * 0.05, q = SLOPE5(cu);
  K.focus(g, W, H, 2.5, (c) => {
    c.save();
    c.translate(q[0], q[1] + 4);
    c.rotate(-0.3);
    K.drawPerson(c, 0, 0, 38, { view: "side", facing: 1, walk: true, phase: t * 0.4, reach: 1, crouch: 0.35, t, shadow: false, hood: true });
    c.restore();
  }, "f08kid5");
  lavaPool(g, W, H, t);
  // a flat warm rock just poking out of the lava, the cat stretched out on it
  warmRock(g, 560, 450, 420, 46, t);
  const lift = smooth(seg(t, 48.6, 49.5)) * (1 - smooth(seg(t, 50.6, 51.4)));
  const look = smooth(seg(t, 48.4, 49.2)) * (1 - smooth(seg(t, 50.6, 51.4)));
  const catOpts = {
    pose: "loaf", facing: -1, t, coat: LAVACAT, collar: false, bell: false,
    headTurn: lerp(0.4, -0.45, look), blink: lerp(0.55, 0.1, look), ears: 0.2 + look * 0.5,
    tail: 0.3, tailPose: [[-9, -5], [-9, -13], [-6, -16], [-2, -14]], tailPoseK: lift,
    tailGlow: { color: LAVA, core: CORE, alpha: lift, trail: [0.15, 0.3, 0.45, 0.6].map((d, i) => [Math.max(0, lift - d), 0.5 - i * 0.1]) },
    eyesGlow: 0.6, light: { x: CAT5.x, y: CAT5.y + 160, color: "#ffb060", strength: 2.2 }, ground: "#3a0a00",
  };
  // the cat into its own layer so the cracks only land on its fur
  const T = g.getTransform();
  const L = K.layer(W, H, "f08lavacat");
  L.g.setTransform(T);
  K.drawCat(L.g, CAT5.x, CAT5.y, CAT5.s, catOpts);
  const pulse = 0.75 + 0.25 * Math.sin(t * 1.3);
  L.g.globalCompositeOperation = "source-atop";
  L.g.globalAlpha = pulse;
  L.g.drawImage(crackSprite(), CAT5.x - 220, CAT5.y - 200, 420, 240);
  L.g.globalAlpha = 1;
  L.g.globalCompositeOperation = "source-over";
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(L.canvas, 0, 0);
  g.restore();
  // its heat, breathing
  glow(g, CAT5.x, CAT5.y - 50, 190, LAVA, 0.16 + 0.08 * Math.sin(t * 1.3));
  embers(g, W, H, t, { count: 26, seed: 41, area: [CAT5.x - 280, 240, 520, 200] });
  g.restore();
  // heat shimmer haze low on the lava
  K.fog(g, W, H, { y: H * 0.78, h: H * 0.14, color: "#ffb060", alpha: 0.12, t, seed: 9 });
  ash(g, W, H, t, { count: 50, wind: 8, seed: 13 });
}

// ---- SHOT 6: the lab's steel door hisses open -------------------------------------------------------------
function hazard(g, x, y, w, h, vertical) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = "#d8a820";
  g.fillRect(x, y, w, h);
  g.fillStyle = "#141210";
  const n = Math.ceil((vertical ? h : w) / 22) + 4;
  for (let i = -2; i < n; i++) {
    g.beginPath();
    if (vertical) { g.moveTo(x, y + i * 22); g.lineTo(x + w, y + i * 22 - w); g.lineTo(x + w, y + i * 22 - w + 11); g.lineTo(x, y + i * 22 + 11); }
    else { g.moveTo(x + i * 22, y + h); g.lineTo(x + i * 22 + h, y); g.lineTo(x + i * 22 + h + 11, y); g.lineTo(x + i * 22 + 11, y + h); }
    g.fill();
  }
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.fillRect(x, y + h - 3, w, 3);
  g.restore();
}
function steam(g, x, y, t, t0, dir, k) {
  if (t < t0) return;
  for (let i = 0; i < 14; i++) {
    const age = ((t - t0) * 0.9 + hash(i, 3)) % 1.4;
    const a = (1 - age / 1.4) * k;
    const px = x + dir * age * (60 + hash(i, 4) * 90), py = y - age * (30 + hash(i, 5) * 50) + (hash(i, 6) - 0.5) * 40;
    glow(g, px, py, 20 + age * 70, "#d8e0dc", 0.35 * a, "source-over");
    glow(g, px, py, 14 + age * 40, GREEN, 0.12 * a);
  }
}
// what is visible through the open door: glass tubes of green light, consoles, a hanging arm
function labInterior(g, dx, dy, dw, dh, t) {
  const inner = g.createLinearGradient(0, dy, 0, dy + dh);
  inner.addColorStop(0, "#c8ffd8");
  inner.addColorStop(1, "#3aa860");
  g.fillStyle = inner;
  g.fillRect(dx, dy, dw, dh);
  // the back wall recedes: a darker band, then tubes standing in a row
  g.fillStyle = "rgba(20,60,36,0.35)";
  g.fillRect(dx, dy + dh * 0.72, dw, dh * 0.28);
  for (let i = 0; i < 3; i++) {
    const tx = dx + dw * (0.2 + i * 0.3), tw = 34, ty = dy + dh * 0.16, th = dh * 0.62;
    g.fillStyle = "#1a3a26";
    g.fillRect(tx - tw / 2 - 4, ty - 10, tw + 8, 10);
    g.fillRect(tx - tw / 2 - 4, ty + th, tw + 8, 14);
    const tg = g.createLinearGradient(tx - tw / 2, 0, tx + tw / 2, 0);
    tg.addColorStop(0, "rgba(60,160,90,0.8)");
    tg.addColorStop(0.3, "rgba(220,255,230,0.9)");
    tg.addColorStop(1, "rgba(40,120,70,0.85)");
    g.fillStyle = tg;
    g.fillRect(tx - tw / 2, ty, tw, th);
    for (let b = 0; b < 6; b++) {
      const by = ty + th - ((t * (30 + b * 7) + hash(b, i) * th) % th);
      g.fillStyle = "rgba(255,255,255,0.6)";
      g.beginPath(); g.arc(tx - 8 + hash(b, i + 3) * 16, by, 1.5 + hash(b, i + 5) * 1.5, 0, TAU); g.fill();
    }
  }
  // consoles and a robot arm, silhouetted
  g.fillStyle = "rgba(8,24,14,0.85)";
  g.fillRect(dx, dy + dh * 0.8, dw * 0.34, dh * 0.2);
  g.fillRect(dx + dw * 0.7, dy + dh * 0.76, dw * 0.3, dh * 0.24);
  g.strokeStyle = "rgba(8,24,14,0.85)";
  g.lineCap = "round";
  g.lineWidth = 6;
  const sw = Math.sin(t * 0.7) * 0.2;
  g.beginPath();
  g.moveTo(dx + dw * 0.62, dy);
  g.lineTo(dx + dw * 0.62, dy + dh * 0.16);
  g.lineTo(dx + dw * (0.5 + sw * 0.2), dy + dh * 0.32);
  g.lineTo(dx + dw * (0.46 + sw * 0.2), dy + dh * 0.4);
  g.stroke();
}
function shot6(g, t, W, H) {
  const p = eio(seg(t, 52, 62));
  const open = eio(seg(t, 55, 58.2));
  const sil = smooth(seg(t, 55.6, 56.6));
  K.withCamera(g, W, H, { x: 480, y: 270 - p * 6, zoom: 1.0 + p * 0.06, shakeT: t, shakeAmt: 1 + (t > 55 && t < 56 ? 2 : 0) }, () => {
    ashSky(g, W, H, t);
    // the mountain's flank the lab is cut into: rock rising to the right, hazed toward the sky
    const flank = new Path2D();
    flank.moveTo(-40, H);
    flank.lineTo(-40, 210);
    for (let x = -40; x <= W + 40; x += 16) flank.lineTo(x, 210 - (x + 40) * 0.2 + fbm(x / 50, 14) * 22);
    flank.lineTo(W + 40, H);
    flank.closePath();
    const fk = g.createLinearGradient(0, 0, 0, H);
    fk.addColorStop(0, "#2a1810");
    fk.addColorStop(1, "#120a06");
    g.fillStyle = fk;
    g.fill(flank);
    K.crescent(g, flank, 0, 5, "#ff9a5a", 0.6, [-60, 0, W + 60, 300], "lighter");
    // the facade, set back into the rock
    g.save();
    g.translate(480, 462);
    g.scale(0.7, 0.7);
    g.translate(-480, -462);
    const fg = g.createLinearGradient(0, 40, 0, 460);
    fg.addColorStop(0, "#4a4446");
    fg.addColorStop(1, "#2a2426");
    g.fillStyle = fg;
    g.fillRect(-40, 40, W + 80, 440);
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.lineWidth = 2;
    for (let x = -40; x < W + 40; x += 120) g.strokeRect(x, 40, 120, 140);
    for (let x = -40; x < W + 40; x += 120) g.strokeRect(x, 180, 120, 150);
    g.fillStyle = "rgba(0,0,0,0.3)";
    for (let x = -40; x < W + 40; x += 120) for (const yy of [48, 172, 188, 322]) { g.beginPath(); g.arc(x + 8, yy, 2, 0, TAU); g.arc(x + 112, yy, 2, 0, TAU); g.fill(); }
    // roof parapet against the sky
    g.fillStyle = "#5a5254";
    g.fillRect(-50, 28, W + 100, 14);
    const lg = g.createLinearGradient(0, 480, 0, 200);
    lg.addColorStop(0, "rgba(255,110,40,0.35)");
    lg.addColorStop(1, "rgba(255,110,40,0)");
    g.fillStyle = lg;
    g.fillRect(-40, 200, W + 80, 280);
    for (const [py, w] of [[70, 14], [92, 8]]) {
      const pg = g.createLinearGradient(0, py - w / 2, 0, py + w / 2);
      pg.addColorStop(0, "#8a7a70");
      pg.addColorStop(0.5, "#4a403c");
      pg.addColorStop(1, "#1a1614");
      g.fillStyle = pg;
      g.fillRect(-40, py - w / 2, W + 80, w);
    }
    g.fillStyle = "#6a1a14";
    g.beginPath(); g.arc(180, 70, 12, 0, TAU); g.fill();
    g.fillStyle = "#2a2a2c";
    g.beginPath(); g.arc(760, 140, 22, 0, TAU); g.fill();
    g.fillStyle = "#e8e0c8";
    g.beginPath(); g.arc(760, 140, 17, 0, TAU); g.fill();
    g.strokeStyle = "#a01a10";
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(760, 140); g.lineTo(760 + Math.cos(-0.6 + Math.sin(t * 2) * 0.2) * 14, 140 + Math.sin(-0.6 + Math.sin(t * 2) * 0.2) * 14); g.stroke();
    for (const wx of [210, 750]) {
      g.fillStyle = "#1a1a1c";
      g.beginPath(); g.arc(wx, 250, 40, 0, TAU); g.fill();
      const gg = g.createRadialGradient(wx - 8, 242, 4, wx, 250, 32);
      gg.addColorStop(0, "#d8ffe0");
      gg.addColorStop(0.5, GREEN);
      gg.addColorStop(1, "#1a6a3a");
      g.fillStyle = gg;
      g.beginPath(); g.arc(wx, 250, 31, 0, TAU); g.fill();
      glow(g, wx, 250, 120, GREEN, 0.3);
    }
    const dx = 360, dy = 150, dw = 240, dh = 300;
    labInterior(g, dx, dy, dw, dh, t);
    glow(g, dx + dw / 2, dy + dh * 0.5, 420 * open + 10, GREEN, 0.5 * open);
    const half = dw / 2, slide = open * (half - 6);
    for (const sd of [-1, 1]) {
      const hx = sd < 0 ? dx - slide : dx + half + slide;
      g.save();
      g.beginPath();
      g.rect(dx, dy, dw, dh);
      g.clip();
      const sg = g.createLinearGradient(hx, 0, hx + half, 0);
      sg.addColorStop(0, sd < 0 ? "#5a5a60" : "#3a3a40");
      sg.addColorStop(0.5, "#7a7a82");
      sg.addColorStop(1, sd < 0 ? "#3a3a40" : "#5a5a60");
      g.fillStyle = sg;
      g.fillRect(hx, dy, half, dh);
      g.strokeStyle = "rgba(0,0,0,0.45)";
      g.lineWidth = 2;
      for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(hx + 10, dy + k * dh / 4); g.lineTo(hx + half - 10, dy + k * dh / 4); g.stroke(); }
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.fillRect(hx + 4, dy, 3, dh);
      g.restore();
    }
    const seam = smooth(seg(t, 53.8, 55));
    if (open < 0.98) glow(g, dx + half, dy + dh / 2, 60 + seam * 40, GREEN, 0.45 * seam);
    hazard(g, dx - 26, dy - 26, dw + 52, 26, false);
    hazard(g, dx - 26, dy, 26, dh, true);
    hazard(g, dx + dw, dy, 26, dh, true);
    // warning beacon above, its cone sweeping DOWN across the platform
    const bx = dx + dw / 2, by = dy - 48;
    g.fillStyle = "#2a1a10";
    g.fillRect(bx - 12, by - 6, 24, 12);
    const sweep = Math.PI / 2 + Math.sin(t * 1.8) * 0.85;
    g.save();
    g.globalCompositeOperation = "lighter";
    const bg = g.createRadialGradient(bx, by, 0, bx, by, 520);
    bg.addColorStop(0, "rgba(255,150,40,0.4)");
    bg.addColorStop(1, "rgba(255,150,40,0)");
    g.fillStyle = bg;
    g.beginPath();
    g.moveTo(bx, by);
    g.arc(bx, by, 520, sweep - 0.22, sweep + 0.22);
    g.closePath();
    g.fill();
    g.restore();
    glow(g, bx, by, 26, "#ffa040", 0.9);
    g.restore();
    // rock buttresses overlapping the facade's ends: built INTO the mountain
    for (const side of [-1, 1]) {
      const bt = new Path2D();
      const x0 = side < 0 ? -40 : W + 40, xe = side < 0 ? 150 : 810;
      bt.moveTo(x0, H);
      bt.lineTo(x0, side < 0 ? 170 : 120);
      for (let y = side < 0 ? 170 : 120; y <= 470; y += 18) bt.lineTo(xe - side * (fbm(y / 40, side + 21) * 26 + (470 - y) * 0.12), y);
      bt.lineTo(xe + side * 30, H);
      bt.closePath();
      g.fillStyle = "#170d08";
      g.fill(bt);
      K.crescent(g, bt, side * 5, 2, "#ff8a4a", 0.45, [Math.min(x0, xe) - 120, 100, Math.max(x0, xe) + 120, H], "lighter");
    }
    // the metal grate platform
    const pg = g.createLinearGradient(0, 452, 0, H);
    pg.addColorStop(0, "#3a3436");
    pg.addColorStop(1, "#121012");
    g.fillStyle = pg;
    g.fillRect(-40, 452, W + 80, H);
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = 1;
    g.beginPath();
    for (let x = -400; x < W + 400; x += 14) { g.moveTo(x, 452); g.lineTo(480 + (x - 480) * 1.6, H + 40); }
    for (let y = 458; y < H + 40; y += 8) { g.moveTo(-40, y); g.lineTo(W + 40, y); }
    g.stroke();
    // door light spilling across the grate
    const ddx = 480 - 84, ddw = 168;
    g.save();
    g.globalCompositeOperation = "lighter";
    g.fillStyle = rgba(GREEN, 0.28 * open);
    g.beginPath();
    g.moveTo(ddx, 452); g.lineTo(ddx + ddw, 452); g.lineTo(ddx + ddw + 200, H + 40); g.lineTo(ddx - 200, H + 40);
    g.fill();
    g.restore();
    // steam jets from the seals
    const k = 1 - seg(t, 58.5, 61);
    steam(g, ddx + 4, 440, t, 55, -1, k);
    steam(g, ddx + ddw - 4, 432, t, 55.1, 1, k);
    steam(g, 480, 260, t, 55.2, 0.3, 0.7 * k);
    // you, before it: backlit into a silhouette with a green rim, a long shadow thrown toward us
    const ky = 474;
    if (open > 0.05) {
      g.save();
      g.globalAlpha = 0.7 * open;
      g.fillStyle = "#050806";
      g.beginPath();
      g.moveTo(468, ky); g.lineTo(492, ky); g.lineTo(540, H + 20); g.lineTo(420, H + 20);
      g.closePath();
      g.fill();
      g.restore();
    }
    const dark = (c) => mix(c, "#060806", sil);
    const px = K.pixelScale();
    litFigure(g, W, H, "f08kid6", (c) => K.drawPerson(c, 480, ky, 150, {
      view: "back", t, bell: true, wet: 0, hood: true,
      coat: dark("#e8b923"), pants: dark("#3a4a6a"), boots: dark("#8a2a20"), hair: dark("#4a3020"), skin: dark("#e8b48a"),
      light: { x: 480, y: 250, color: open > 0.2 ? GREEN : "#ff9a5a", strength: 0.8 + open * 1.2 },
    }), sil > 0.01 ? { rim: { dx: 0, dy: 2.5 * px, color: "#b8ffc8", alpha: 0.9 * sil } } : {});
    if (sil > 0) glow(g, 480, ky - 150, 60, GREEN, 0.25 * sil);
  });
  ash(g, W, H, t, { count: 60, wind: 10, seed: 17 });
  embers(g, W, H, t, { count: 14, seed: 51, area: [0, 300, W, 240] });
}

// ---- assembly --------------------------------------------------------------------------------------------
function frame(g, t, W, H) {
  const fin = (o) => K.finish(g, W, H, t, Object.assign({ bloom: 0.45, tint: "#ff8a4a", tintAlpha: 0.16, vignette: 0.6, grain: 0.055 }, o));
  if (t < 10) {
    shot1(g, t, W, H);
    fin({});
    const ta = K.env(t, 2.0, 6.0, 1.5, 1.0);
    if (ta > 0) {
      // upper-left sky, clear of the cone and its smoke, over a soft dark scrim
      g.save();
      g.globalAlpha = ta * 0.55;
      g.translate(250, H * 0.22);
      g.scale(1, 0.42);
      glow(g, 0, 0, 300, "#140604", 1, "source-over");
      g.restore();
      g.save();
      g.translate(-230, 0);
      K.title(g, W, H, "The Mountain of Fire", "Chapter 8", ta, { size: 42, y: H * 0.22, glow: "#ffb070" });
      g.restore();
    }
    K.fadeBlack(g, W, H, 1 - smooth(seg(t, 0, 1.4)));
  } else if (t < 20) {
    shot2(g, t, W, H);
    fin({});
  } else if (t < 30) {
    shot3(g, t, W, H);
    fin({ bloom: 0.5 });
  } else if (t < 42) {
    shot4(g, t, W, H);
    fin({ bloom: 0.4, tintAlpha: 0.12 });
  } else if (t < 52) {
    shot5(g, t, W, H);
    fin({ bloom: 0.55 });
  } else {
    shot6(g, t, W, H);
    fin({ bloom: 0.5, tint: "#9affb0", tintAlpha: 0.06 + 0.08 * smooth(seg(t, 55, 58)) });
    K.fadeBlack(g, W, H, smooth(seg(t, 60.4, 62)));
  }
}

export const film = {
  id: 8,
  title: "The Mountain of Fire",
  chapter: "Chapter 8",
  unlockAt: 40,
  duration: D,
  poster: 47,
  tagline: "Up through the ash.",
  subs: [
    [3.0, 7.0, "Mount Hairball. A mountain made of fire."],
    [11.5, 15.5, "Every step was hotter than the last."],
    [22.0, 26.5, "You did not look down. Okay. You looked down once."],
    [32.0, 36.5, "Your hands hurt. You kept climbing."],
    [37.0, 40.5, "He came this way. So could you."],
    [43.5, 48.0, "A lava cat. Sunbathing. On lava."],
    [48.5, 51.5, "It pointed at the lab with its tail."],
    [54.0, 60.0, "Whatever was inside, it knew his name."],
  ],
  voice: [
    [3.0, "Mount Hairball. A mountain made of fire.", { rate: 0.92, pitch: 1.0 }],
    [11.5, "Every step was hotter than the last.", { rate: 0.92, pitch: 1.0 }],
    [22.0, "You did not look down. Okay. You looked down once.", { rate: 1.0, pitch: 1.08 }],
    [32.0, "Your hands hurt. You kept climbing.", { rate: 0.92, pitch: 1.0 }],
    [37.0, "He came this way. So could you.", { rate: 0.92, pitch: 1.0 }],
    [43.5, "A lava cat. Sunbathing. On lava.", { rate: 1.0, pitch: 1.1 }],
    [48.5, "It pointed at the lab with its tail.", { rate: 0.92, pitch: 1.0 }],
    [54.0, "Whatever was inside, it knew his name.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: { mood: "epic", key: "D", bpm: 92, cues: [[2, "swell"], [16, "hit"], [30, "swell"], [42, "hit"], [55, "swell"]] },
  draw(g, t, W, H) {
    t = clamp(t, 0, D);
    const sx = W / 960, sy = H / 540;
    g.save();
    if (sx !== 1 || sy !== 1) g.scale(sx, sy);
    try { frame(g, t, 960, 540); } finally { g.restore(); }
  },
};
