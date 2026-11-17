// films/f04.js - Chapter 4 "The Box in the Rain" (FILMS.md f04). Present: the moonlit Catford clock
// tower. Flashback: the grey rainy day you found a tiny orange kitten in a box marked FREE.
// draw(g, t, W, H) is a pure function of t; static art is cached through K.sprite()/K.layer().
import * as K from "../filmkit.js";

const D = 74;
const LW = 960, LH = 540;
const NIGHT = "#14203a", FACE = "#fff0c8", MOONC = "#bcd0ff";
const GREY = "#8b97a6", BOX = "#9a7448", UMB = "#c0392b", HEATER = "#ff8a3a";
const { clamp, lerp, seg, smooth, mix, rgba, shade, hash, noise, glow } = K;
const eio = (x) => K.ease.inOut(clamp(x));
const TAU = Math.PI * 2;
const KITTEN = Object.assign({}, K.BISCUIT, { iris: "#8a9cae", irisInner: "#b4c4d2", stripeAlpha: 0.55 });

function quad(g, a, b, c, d, fill) {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]);
  g.closePath();
  g.fill();
}
// paint fn into an offscreen box and pull it toward an ambient colour (keeps kit figures in the scene's light)
function tinted(g, key, bx, by, bw, bh, fn, color, amt) {
  const L = K.layer(Math.ceil(bw), Math.ceil(bh), "f04t:" + key);
  L.g.translate(-bx, -by);
  try { fn(L.g); } catch (err) { console.warn("[f04] tinted", key, err); }
  L.g.setTransform(K.pixelScale(), 0, 0, K.pixelScale(), 0, 0);
  if (amt > 0) {
    L.g.globalCompositeOperation = "source-atop";
    L.g.globalAlpha = clamp(amt);
    L.g.fillStyle = color;
    L.g.fillRect(0, 0, bw, bh);
    L.g.globalAlpha = 1;
    L.g.globalCompositeOperation = "source-over";
  }
  g.drawImage(L.canvas, bx, by, Math.ceil(bw), Math.ceil(bh));
}
function stoneTexture(s, x0, y0, w, h, seed, base, rowH = 22) {
  const R = K.rng("f04st" + seed);
  for (let y = y0, row = 0; y < y0 + h; y += rowH, row++) {
    for (let x = x0 - (row % 2) * rowH; x < x0 + w; x += rowH * (1.6 + R() * 0.8)) {
      const bw = rowH * (1.5 + R() * 0.8);
      s.fillStyle = mix(base, R() > 0.5 ? "#000" : "#fff", 0.04 + R() * 0.08);
      s.fillRect(x + 1, y + 1, bw - 2, rowH - 2);
    }
  }
  s.strokeStyle = "rgba(0,0,0,0.3)";
  s.lineWidth = 1;
  s.beginPath();
  for (let y = y0; y < y0 + h; y += rowH) { s.moveTo(x0, y); s.lineTo(x0 + w, y); }
  s.stroke();
}

// ---- shot 1: low angle up the clock tower ------------------------------------------------------------
// the tower converges upward (a real low-angle lens): x scales toward the centre with height
const TW = { cx: 480, base: 600, top: -60 };
function tx(x, y) { const k = lerp(1, 0.5, (TW.base - y) / (TW.base - TW.top)); return TW.cx + (x - TW.cx) * k; }
function paintTower(s, w, h) {
  // sky is drawn live; this is the tower body only, on transparent
  const half = 230;
  const body = () => { s.beginPath(); s.moveTo(tx(TW.cx - half, TW.base), TW.base); s.lineTo(tx(TW.cx - half, TW.top), TW.top); s.lineTo(tx(TW.cx + half, TW.top), TW.top); s.lineTo(tx(TW.cx + half, TW.base), TW.base); s.closePath(); };
  body();
  const bg = s.createLinearGradient(tx(TW.cx - half, 300), 0, tx(TW.cx + half, 300), 0);
  bg.addColorStop(0, "#0e1119");
  bg.addColorStop(0.6, "#262c3c");
  bg.addColorStop(1, "#3e4860");
  s.fillStyle = bg;
  s.fill();
  s.save();
  body();
  s.clip();
  // stone courses that converge with the tower
  const R = K.rng("f04tw");
  for (let y = TW.top; y < TW.base; y += 16) {
    for (let x = TW.cx - half - ((y / 16) % 2) * 20; x < TW.cx + half; x += 40) {
      const a = tx(x, y), b = tx(x + 38, y);
      s.fillStyle = `rgba(${R() > 0.5 ? "255,255,255" : "0,0,0"},${0.03 + R() * 0.05})`;
      s.fillRect(a, y + 1, b - a, 14);
    }
    s.fillStyle = "rgba(0,0,0,0.25)";
    s.fillRect(0, y, w, 1);
  }
  // corner pilasters + cornices
  for (const sx of [-1, 1]) {
    s.fillStyle = sx > 0 ? "rgba(140,160,210,0.14)" : "rgba(0,0,0,0.3)";
    s.beginPath();
    s.moveTo(tx(TW.cx + sx * half, TW.base), TW.base); s.lineTo(tx(TW.cx + sx * half, TW.top), TW.top);
    s.lineTo(tx(TW.cx + sx * (half - 34), TW.top), TW.top); s.lineTo(tx(TW.cx + sx * (half - 34), TW.base), TW.base);
    s.fill();
  }
  for (const y of [70, 360]) {
    s.fillStyle = "#1a1e2a";
    s.fillRect(tx(TW.cx - half - 10, y) , y, tx(TW.cx + half + 10, y) - tx(TW.cx - half - 10, y), 14);
    s.fillStyle = "rgba(170,190,240,0.25)";
    s.fillRect(tx(TW.cx - half - 10, y), y, tx(TW.cx + half + 10, y) - tx(TW.cx - half - 10, y), 2);
  }
  // belfry arches (the bell is drawn live so it can swing)
  for (const ax of [-120, 0, 120]) {
    const x0 = tx(TW.cx + ax - 46, 40), x1 = tx(TW.cx + ax + 46, 40);
    s.fillStyle = "#070a12";
    s.beginPath();
    s.moveTo(x0, 66); s.lineTo(x0, 0); s.arc((x0 + x1) / 2, 0, (x1 - x0) / 2, Math.PI, 0); s.lineTo(x1, 66);
    s.fill();
  }
  // the steep slate spire above the belfry
  s.restore();
  const sg = s.createLinearGradient(tx(TW.cx - half, TW.top), 0, tx(TW.cx + half, TW.top), 0);
  sg.addColorStop(0, "#2a3248");
  sg.addColorStop(1, "#0c0f18");
  s.fillStyle = sg;
  s.beginPath(); s.moveTo(tx(TW.cx - half - 16, TW.top), TW.top); s.lineTo(TW.cx, TW.top - 240); s.lineTo(tx(TW.cx + half + 16, TW.top), TW.top); s.fill();
  s.strokeStyle = "rgba(188,208,255,0.35)";
  s.lineWidth = 2;
  s.beginPath(); s.moveTo(tx(TW.cx - half - 16, TW.top), TW.top); s.lineTo(TW.cx, TW.top - 240); s.stroke();
  s.save();
  body();
  s.clip();
  // a tall lancet window below the clock
  s.fillStyle = "#0a0e18";
  s.beginPath();
  s.moveTo(tx(TW.cx - 22, 520), 520); s.lineTo(tx(TW.cx - 22, 440), 440); s.quadraticCurveTo(TW.cx, 405, tx(TW.cx + 22, 440), 440); s.lineTo(tx(TW.cx + 22, 520), 520);
  s.fill();
  s.restore();
  // clock face recess + face (lit live with bloom)
  const cx = TW.cx, cy = 215, r = 104;
  s.fillStyle = "#0e1118";
  s.beginPath(); s.arc(cx, cy, r + 14, 0, TAU); s.fill();
  const fg = s.createRadialGradient(cx - 10, cy - 10, 4, cx, cy, r);
  fg.addColorStop(0, "#fffaea");
  fg.addColorStop(0.75, "#ffeec4");
  fg.addColorStop(1, "#e8c890");
  s.fillStyle = fg;
  s.beginPath(); s.arc(cx, cy, r, 0, TAU); s.fill();
  s.strokeStyle = "rgba(70,50,30,0.85)";
  s.lineWidth = 3;
  s.beginPath(); s.arc(cx, cy, r - 6, 0, TAU); s.stroke();
  s.lineWidth = 1;
  s.beginPath(); s.arc(cx, cy, r - 24, 0, TAU); s.stroke();
  const NUM = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
  s.fillStyle = "rgba(60,42,26,0.9)";
  s.font = "600 15px Georgia, serif";
  s.textAlign = "center";
  s.textBaseline = "middle";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU - Math.PI / 2;
    s.save();
    s.translate(cx + Math.cos(a) * (r - 15), cy + Math.sin(a) * (r - 15));
    s.rotate(a + Math.PI / 2);
    s.fillText(NUM[i], 0, 0);
    s.restore();
  }
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU;
    s.fillRect(cx + Math.cos(a) * (r - 6) - 0.6, cy + Math.sin(a) * (r - 6) - 0.6, 1.2, 1.2);
  }
}
function paintNightSky(s) {
  const gr = s.createLinearGradient(0, 0, 0, LH);
  gr.addColorStop(0, "#060a16");
  gr.addColorStop(0.6, NIGHT);
  gr.addColorStop(1, "#2a3656");
  s.fillStyle = gr;
  s.fillRect(0, 0, LW, LH);
  K.stars(s, LW, LH, 4, 0.7, 0, { yMax: LH * 0.8 });
}
function bigBell(g, x, y, s, swing, rim) {
  // a heavy bronze tower bell, seen from below, rim-lit
  g.save();
  g.translate(x, y);
  // the headstock: a heavy timber block in depth (front face, lit top, end grain), bolted to the bell
  g.fillStyle = "#0e0906";
  g.beginPath(); g.moveTo(-s * 0.62, -s * 0.3); g.lineTo(-s * 0.52, -s * 0.38); g.lineTo(s * 0.7, -s * 0.38); g.lineTo(s * 0.6, -s * 0.3); g.fill();
  g.fillStyle = rgba(MOONC, 0.16 * rim); g.fillRect(-s * 0.52, -s * 0.38, s * 1.22, s * 0.012);
  const hb = g.createLinearGradient(0, -s * 0.3, 0, -s * 0.1);
  hb.addColorStop(0, "#2a1c12"); hb.addColorStop(1, "#140c08");
  g.fillStyle = hb; g.fillRect(-s * 0.62, -s * 0.3, s * 1.22, s * 0.2);
  g.fillStyle = "#1e140c"; g.beginPath(); g.moveTo(s * 0.6, -s * 0.3); g.lineTo(s * 0.7, -s * 0.38); g.lineTo(s * 0.7, -s * 0.18); g.lineTo(s * 0.6, -s * 0.1); g.fill();
  g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = s * 0.006;
  for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(-s * 0.62, -s * (0.27 - k * 0.045)); g.lineTo(s * 0.6, -s * (0.26 - k * 0.045)); g.stroke(); }
  g.fillStyle = "#3a3a3e"; for (const bx of [-0.2, 0.2]) { g.beginPath(); g.arc(bx * s, -s * 0.2, s * 0.022, 0, TAU); g.fill(); }
  g.rotate(swing);
  // bronze, shaded as a turned solid: dark flanks, a bright vertical highlight, the window's rim light
  const gr = g.createLinearGradient(-s * 0.8, 0, s * 0.8, 0);
  gr.addColorStop(0, "#0a0603");
  gr.addColorStop(0.18, "#2a1c0c");
  gr.addColorStop(0.36, "#5a4020");
  gr.addColorStop(0.44, "#c89a58");
  gr.addColorStop(0.5, "#6a4c24");
  gr.addColorStop(0.74, "#22160a");
  gr.addColorStop(0.92, "#3a2c1a");
  gr.addColorStop(1, "#8a8aa0");
  g.fillStyle = gr;
  const bp = new Path2D();
  bp.moveTo(-s * 0.32, 0);
  bp.bezierCurveTo(-s * 0.4, s * 0.2, -s * 0.5, s * 0.6, -s * 0.78, s * 0.95);
  bp.quadraticCurveTo(0, s * 1.1, s * 0.78, s * 0.95);
  bp.bezierCurveTo(s * 0.5, s * 0.6, s * 0.4, s * 0.2, s * 0.32, 0);
  bp.quadraticCurveTo(0, -s * 0.12, -s * 0.32, 0);
  g.fill(bp);
  g.save(); g.clip(bp);
  // turned bands round the waist and shoulder follow the curvature
  g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = s * 0.012;
  for (const [yy, ww] of [[s * 0.12, 0.38], [s * 0.18, 0.4], [s * 0.78, 0.66], [s * 0.84, 0.7]]) { g.beginPath(); g.ellipse(0, yy, s * ww, s * 0.05, 0, 0, Math.PI); g.stroke(); }
  g.strokeStyle = "rgba(255,220,160,0.18)"; g.lineWidth = s * 0.006;
  for (const [yy, ww] of [[s * 0.125, 0.38], [s * 0.785, 0.66]]) { g.beginPath(); g.ellipse(0, yy, s * ww, s * 0.05, 0, 0.2, Math.PI - 0.2); g.stroke(); }
  // verdigris in the hollows
  const vg = g.createLinearGradient(0, s * 0.3, 0, s);
  vg.addColorStop(0, "rgba(60,110,90,0)"); vg.addColorStop(1, "rgba(60,110,90,0.18)");
  g.fillStyle = vg; g.fillRect(-s, 0, s * 2, s * 1.1);
  g.restore();
  // lip band + moonlit rim
  g.strokeStyle = rgba("#d9a441", 0.35 * rim);
  g.lineWidth = s * 0.03;
  g.beginPath(); g.moveTo(-s * 0.74, s * 0.88); g.quadraticCurveTo(0, s * 1.02, s * 0.74, s * 0.88); g.stroke();
  g.strokeStyle = rgba(MOONC, 0.6 * rim);
  g.lineWidth = s * 0.025;
  g.beginPath(); g.moveTo(s * 0.32, 0); g.bezierCurveTo(s * 0.4, s * 0.2, s * 0.5, s * 0.6, s * 0.78, s * 0.95); g.stroke();
  // a cool sheen band down the bronze, toward the moonlit side
  g.strokeStyle = rgba(MOONC, 0.12 * rim);
  g.lineWidth = s * 0.08;
  g.beginPath(); g.moveTo(s * 0.18, s * 0.06); g.bezierCurveTo(s * 0.24, s * 0.3, s * 0.3, s * 0.6, s * 0.44, s * 0.92); g.stroke();
  // the open mouth (dark core) and the clapper hanging out of it: rod and iron ball
  g.fillStyle = "#050302";
  g.beginPath(); g.ellipse(0, s * 0.985, s * 0.66, s * 0.05, 0, 0, TAU); g.fill();
  const cx2 = Math.sin(swing * 3) * s * 0.12;
  g.strokeStyle = "#16100a"; g.lineWidth = s * 0.03;
  g.beginPath(); g.moveTo(0, s * 0.9); g.lineTo(cx2, s * 1.08); g.stroke();
  const cg = g.createRadialGradient(cx2 - s * 0.02, s * 1.1, s * 0.005, cx2, s * 1.12, s * 0.07);
  cg.addColorStop(0, "#5a5a62"); cg.addColorStop(1, "#0c0c10");
  g.fillStyle = cg;
  g.beginPath(); g.arc(cx2, s * 1.12, s * 0.065, 0, TAU); g.fill();
  g.restore();
}
function birds(g, t, t0, n, x0, y0) {
  g.save();
  g.strokeStyle = "#05070c";
  g.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const age = t - t0 - hash(i, 3) * 0.6;
    if (age < 0) continue;
    const x = x0 + age * (60 + hash(i, 4) * 50) * (hash(i, 5) > 0.5 ? 1 : -1) + i * 6;
    const y = y0 - age * (30 + hash(i, 6) * 40) + Math.sin(age * 2 + i) * 6;
    const s = 5 + hash(i, 7) * 4;
    const f = Math.sin(age * 14 + i * 2);
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(x - s, y - f * s * 0.6);
    g.quadraticCurveTo(x - s * 0.4, y - s * 0.2, x, y);
    g.quadraticCurveTo(x + s * 0.4, y - s * 0.2, x + s, y - f * s * 0.6);
    g.stroke();
  }
  g.restore();
}
function shotTower(g, t, lt) {
  const p = eio(seg(lt, 0, 10));
  const ring = K.env(lt, 3, 6, 0.05, 2.5);
  // the camera sits at the tower's foot and tilts up from the clock to the belfry; the ring at 3 s
  // makes the whole frame tremble
  const tilt = eio(seg(lt, 0, 7));
  const tremble = K.env(lt, 3, 4.6, 0.05, 1.2);
  K.withCamera(g, LW, LH, { x: 480, y: lerp(320, 96, tilt), zoom: lerp(0.94, 0.9, p), shakeT: t * (1 + ring * 8), shakeAmt: 1 + ring * 3 + tremble * 6 }, (c) => {
    c.drawImage(K.sprite("f04sky", LW, LH, paintNightSky), -90, -300, LW + 180, LH + 380);
    K.moon(c, 800, -40, 34, { glow: 0.9 });
    glow(c, 800, -40, 260, MOONC, 0.2);
    c.save();
    c.translate(-60, -250);
    // two cloud decks: a slow high one and a fast low one racing past the spire (parallax)
    K.clouds(c, LW + 120, LH, lt * 3 + 40, { seed: 7, color: "#4a5a80", shade: "#141c30", count: 8, y: 80, spread: 140, speed: 22, alpha: 0.7 });
    K.clouds(c, LW + 120, LH, lt * 11 + 10, { seed: 17, color: "#5a6a92", shade: "#18203a", count: 6, y: 230, spread: 120, speed: 70, alpha: 0.45 });
    c.restore();
    // the bell in the belfry, swinging after it rings
    const sw = Math.sin((lt - 3) * 3.2) * 0.12 * K.env(lt, 3, 9, 0.2, 3);
    c.drawImage(K.sprite("f04tower", LW, LH + 300, (s, w, h) => { s.translate(0, 260); paintTower(s, w, h); }), 0, -260, LW, LH + 300);
    // moonlight grazing the tower's left edge
    glow(c, 680, 40, 260, MOONC, 0.12);
    // the bell hanging in the middle arch, glimpsed against the dark belfry
    const ax0 = tx(TW.cx - 46, 40), ax1 = tx(TW.cx + 46, 40);
    c.save();
    c.beginPath(); c.moveTo(ax0, 66); c.lineTo(ax0, 0); c.arc((ax0 + ax1) / 2, 0, (ax1 - ax0) / 2, Math.PI, 0); c.lineTo(ax1, 66); c.closePath(); c.clip();
    glow(c, 480, 10, 60, MOONC, 0.18);
    bigBell(c, 480, -26, 40, sw, 1.4);
    c.restore();
    // the clock face glows like a second moon
    glow(c, 480, 215, 300, "#ffe6b0", 0.28);
    glow(c, 480, 215, 140, FACE, 0.3);
    // hands (twenty to midnight)
    c.save();
    c.translate(480, 215);
    c.strokeStyle = "#1a120a";
    c.lineCap = "round";
    c.lineWidth = 6;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(-2.2) * 52, Math.sin(-2.2) * 52); c.stroke();
    c.lineWidth = 3.5;
    const mn = -Math.PI / 2 - 0.84 + lt * 0.002;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(mn) * 78, Math.sin(mn) * 78); c.stroke();
    c.fillStyle = "#1a120a";
    c.beginPath(); c.arc(0, 0, 6, 0, TAU); c.fill();
    c.restore();
    // the ring: a pulse of light in the belfry and birds startled off the cornice
    if (ring > 0) glow(c, 480, 10, 200, "#ffd9a0", 0.25 * ring);
    birds(c, lt, 3.3, 9, 470, 30);
    birds(c, lt, 0, 4, 200, 120);
    birds(c, lt, 1.2, 3, 700, -60);
  });
}

// ---- shot 2: the spiral stairs, from below through the gaps --------------------------------------
function paintStairwell(s) {
  // curved stone wall: concave, so the centre catches the moonlight and the sides fall away
  s.fillStyle = "#151a26";
  s.fillRect(0, 0, LW, LH + 300);
  // the curved wall of the stair shaft: courses bend up toward the sides (they come nearer the lens)
  const R = K.rng("f04curve");
  for (let y0 = -40, row = 0; y0 < LH + 360; y0 += 26, row++) {
    const yo = (th) => y0 - 46 * (1 - Math.cos(th));
    for (let th = -1.45 + (row % 2) * 0.06; th < 1.45; th += 0.12) {
      const a = th, b = th + 0.115;
      const xa = 480 + 560 * Math.sin(a), xb = 480 + 560 * Math.sin(b);
      const sh = Math.cos((a + b) / 2);
      s.fillStyle = mix("#2a3040", R() > 0.5 ? "#3a4256" : "#1a1e2a", 0.3 + R() * 0.4);
      s.globalAlpha = 0.5 + 0.5 * sh;
      s.beginPath(); s.moveTo(xa, yo(a) + 1); s.lineTo(xb, yo(b) + 1); s.lineTo(xb, yo(b) + 25); s.lineTo(xa, yo(a) + 25); s.fill();
    }
    s.globalAlpha = 1;
    s.strokeStyle = "rgba(0,0,0,0.35)"; s.lineWidth = 1;
    s.beginPath();
    for (let k = 0; k <= 40; k++) { const th = -1.45 + (k / 40) * 2.9, x = 480 + 560 * Math.sin(th); k ? s.lineTo(x, yo(th)) : s.moveTo(x, yo(th)); }
    s.stroke();
  }
  const cv = s.createLinearGradient(0, 0, LW, 0);
  cv.addColorStop(0, "rgba(4,6,12,0.85)");
  cv.addColorStop(0.45, "rgba(4,6,12,0.1)");
  cv.addColorStop(0.75, "rgba(4,6,12,0.25)");
  cv.addColorStop(1, "rgba(4,6,12,0.9)");
  s.fillStyle = cv;
  s.fillRect(0, 0, LW, LH + 300);
  // the slit window (moon outside)
  const wx = 600, wy = 120;
  s.fillStyle = "#0a0e18";
  s.fillRect(wx - 22, wy - 10, 44, 150);
  const wg = s.createLinearGradient(0, wy, 0, wy + 130);
  wg.addColorStop(0, "#9fb4e8");
  wg.addColorStop(1, "#4a5a88");
  s.fillStyle = wg;
  s.beginPath();
  s.moveTo(wx - 9, wy + 130); s.lineTo(wx - 9, wy + 8); s.quadraticCurveTo(wx, wy - 6, wx + 9, wy + 8); s.lineTo(wx + 9, wy + 130);
  s.fill();
  // deep reveal (splayed stone jambs)
  s.fillStyle = "#1e2432";
  s.beginPath(); s.moveTo(wx - 22, wy - 10); s.lineTo(wx - 9, wy + 8); s.lineTo(wx - 9, wy + 130); s.lineTo(wx - 22, wy + 140); s.fill();
  s.fillStyle = "#3a4458";
  s.beginPath(); s.moveTo(wx + 22, wy - 10); s.lineTo(wx + 9, wy + 8); s.lineTo(wx + 9, wy + 130); s.lineTo(wx + 22, wy + 140); s.fill();
}
// the stair: worn stone blocks rising from lower left to upper right along the wall
// the stair winds round the shaft: steps follow the curve, foreshortened toward the sides
const STEP_H = 26;
const stepTh = (i) => -1.18 + i * 0.13;
function stepPos(i) { return [480 + 520 * Math.sin(stepTh(i)), 600 - i * STEP_H - 40 * (1 - Math.cos(stepTh(i)))]; }
const stepW = (i) => Math.max(8, stepPos(i + 1)[0] - stepPos(i)[0]);
function paintSteps(s) {
  for (let i = 0; i < 18; i++) {
    const [x, y] = stepPos(i);
    const STEP_W = stepW(i);
    // riser (front face) and the tread's lit nose
    const rg = s.createLinearGradient(0, y, 0, y + STEP_H);
    rg.addColorStop(0, "#3a4256");
    rg.addColorStop(1, "#1a1e2a");
    s.fillStyle = rg;
    s.fillRect(x, y, STEP_W + 2, STEP_H);
    s.fillStyle = "#5a6684";
    s.fillRect(x, y - 3, STEP_W + 2, 4);
    // worn hollow in the middle of the tread
    s.fillStyle = "rgba(0,0,0,0.2)";
    s.beginPath(); s.ellipse(x + STEP_W * 0.5, y - 1, STEP_W * 0.3, 1.6, 0, 0, TAU); s.fill();
    // the stair's underside (seen from below) and the mass it sits on
    s.fillStyle = "#0c0f16";
    s.beginPath();
    s.moveTo(x, y + STEP_H);
    s.lineTo(x + STEP_W + 2, y + STEP_H);
    s.lineTo(x + STEP_W + 2 - 60, y + STEP_H + 90);
    s.lineTo(x - 60, y + STEP_H + 90);
    s.fill();
  }
}
function shotStairs(g, t, lt) {
  const p = eio(seg(lt, 0, 8));
  const climb = eio(seg(lt, 0, 5.2)); // stops at the window, breathless
  const fi = lerp(3.2, 9.6, climb);
  const i0 = Math.floor(fi), fr = fi - i0;
  const sa = stepPos(i0), sb = stepPos(i0 + 1);
  const kx = lerp(sa[0], sb[0], fr) + stepW(i0) * 0.5, ky = lerp(sa[1], sb[1], smooth(fr)) - 300 - 3;
  K.withCamera(g, LW, LH, { x: kx + 60 + p * 30, y: ky - 40, zoom: 1.1, shakeT: t, shakeAmt: 1.2 }, (c) => {
    c.drawImage(K.sprite("f04well", LW, LH + 300, paintStairwell), 0, -300, LW, LH + 300);
    // moon shafts through the slit window, falling down-left across the stair
    c.save();
    c.translate(0, -300);
    K.godRays(c, 600, 130, LW, LH, { color: MOONC, count: 6, strength: 0.32, t: lt, angle: 2.25, spread: 0.2, length: 900, seed: 4 });
    c.restore();
    glow(c, 600, -110, 80, MOONC, 0.4);
    c.drawImage(K.sprite("f04steps", LW, LH + 300, paintSteps), 0, -300, LW, LH + 300);
    // moonlight pooling on the treads it reaches
    for (let i = 7; i < 12; i++) { const [x, y] = stepPos(i); glow(c, x + 30, y - 300 - 2, 40, MOONC, 0.18); }
    // you climbing (side view), lit by the window
    const x = kx, y = ky;
    const moving = climb > 0 && climb < 1;
    const breath = moving ? 0 : Math.sin(lt * 5.5) * 1.6;
    tinted(c, "kid", x - 80, y - 210, 160, 220, (kg) => {
      K.drawPerson(kg, x, y + breath * 0.2, 190, { view: "side", facing: 1, walk: moving, phase: lt * 0.9, hood: false, bell: true, wet: 0.3, t: lt, light: { x: 600, y: -150, color: MOONC, strength: 1.4 } });
      // the near arm, swinging with the climb (a dark crease separates it from the coat)
      const u = 1.9, swing = moving ? Math.sin(lt * 0.9 * TAU) * 0.55 : 0.25 + Math.sin(lt * 2.7) * 0.04;
      const sx0 = x + 1 * u, sy0 = y + breath * 0.2 - 78 * u;
      const ex = sx0 + Math.sin(swing) * 15 * u, ey = sy0 + Math.cos(swing) * 15 * u;
      const fa = swing + (moving ? 0.5 + Math.max(0, swing) * 0.6 : 0.35);
      const hx = ex + Math.sin(fa) * 13 * u, hy = ey + Math.cos(fa) * 13 * u;
      const arm = new Path2D();
      K.tube(arm, [sx0, sy0, ex, ey, hx, hy], [5.4 * u, 4.6 * u, 3.8 * u], 5);
      kg.strokeStyle = "rgba(30,18,0,0.95)"; kg.lineWidth = 3.4; kg.stroke(arm);
      const ag = kg.createLinearGradient(sx0 - 6 * u, 0, sx0 + 6 * u, 0);
      ag.addColorStop(0, "#d8aa20"); ag.addColorStop(1, "#ffe070");
      kg.fillStyle = ag; kg.fill(arm);
      kg.fillStyle = "#d9a07a"; kg.beginPath(); kg.ellipse(hx + Math.sin(fa) * 2.4 * u, hy + Math.cos(fa) * 2.4 * u, 2.6 * u, 3.2 * u, -fa, 0, TAU); kg.fill();
      kg.strokeStyle = "rgba(188,208,255,0.6)"; kg.lineWidth = 1.4;
      kg.beginPath(); kg.moveTo(sx0 + 3 * u, sy0); kg.lineTo(ex + 2.5 * u, ey); kg.stroke();
    }, "#141c34", 0.36);
    K.dust(c, LW, LH, lt, { seed: 9, count: 40, color: "#dfe8ff", size: 1.4, area: [380, -180, 340, 440], alpha: 0.6 });
  });
  // foreground: the dark undersides of the steps above you, out of focus, framing the view
  K.focus(g, LW, LH, 8, (f) => {
    f.fillStyle = "#05070c";
    f.beginPath(); f.moveTo(-20, -20); f.lineTo(430, -20); f.lineTo(300, 70); f.lineTo(-20, 160); f.fill();
    f.beginPath(); f.moveTo(LW + 20, LH - 30); f.lineTo(700, LH + 20); f.lineTo(LW + 20, LH + 20); f.fill();
    f.fillStyle = "rgba(120,140,200,0.2)";
    f.beginPath(); f.moveTo(430, -20); f.lineTo(300, 70); f.lineTo(296, 64); f.lineTo(420, -20); f.fill();
  }, "f04fgst");
}

// ---- flashback shots: a grey rainy day years ago --------------------------------------------------
function paintDayStreet(s) {
  // kid's-eye-height view along a pavement: a shop wall, a wheelie bin, puddles; flat grey daylight
  const sk = s.createLinearGradient(0, 0, 0, LH);
  sk.addColorStop(0, "#a8b2be");
  sk.addColorStop(1, "#8b97a6");
  s.fillStyle = sk;
  s.fillRect(0, 0, LW, LH);
  // far street, soft and pale (rain haze)
  for (let i = 0; i < 9; i++) {
    const x = i * 120 - 30, h = 120 + hash(i, 3) * 90, top = 250 - h;
    const col = mix("#6a7482", "#a8b2be", 0.45 + hash(i, 4) * 0.25);
    s.fillStyle = col;
    s.fillRect(x, top, 116, h);
    // roofline: a cornice, sometimes a gable or chimney pots
    s.fillStyle = shade(col, -0.12); s.fillRect(x - 3, top, 122, 5);
    if (hash(i, 6) > 0.5) { s.beginPath(); s.moveTo(x, top); s.lineTo(x + 58, top - 26); s.lineTo(x + 116, top); s.fill(); }
    else { s.fillRect(x + 80, top - 16, 10, 16); s.fillRect(x + 94, top - 12, 8, 12); }
    // sash windows with frames, sills and a few lit ones; a door and a shop awning at street level
    for (let r = 0; top + 20 + r * 40 < 196; r++) for (let k = 0; k < 4; k++) {
      const wx = x + 12 + k * 26, wy = top + 18 + r * 40;
      s.fillStyle = shade(col, 0.12); s.fillRect(wx - 2, wy - 2, 16, 24);
      s.fillStyle = hash(i * 7 + k + r * 3, 9) > 0.85 ? "#c8b48a" : "rgba(54,62,76,0.75)"; s.fillRect(wx, wy, 12, 20);
      s.fillStyle = shade(col, 0.2); s.fillRect(wx, wy + 9, 12, 1.5); s.fillRect(wx - 3, wy + 20, 18, 2.5);
    }
    s.fillStyle = shade(col, -0.25); s.fillRect(x + 12 + (i % 3) * 30, 214, 18, 36);
    s.fillStyle = shade(col, 0.15); s.fillRect(x + 12 + (i % 3) * 30, 214, 18, 2);
    if (i % 2) { s.fillStyle = ["#7a5a5a", "#5a6a7a", "#6a7a5a"][i % 3]; s.beginPath(); s.moveTo(x + 50, 206); s.lineTo(x + 112, 206); s.lineTo(x + 116, 218); s.lineTo(x + 46, 218); s.fill(); s.fillStyle = "rgba(60,70,84,0.5)"; s.fillRect(x + 52, 220, 58, 28); }
  }
  // rain haze over the far street
  s.fillStyle = "rgba(168,178,190,0.35)"; s.fillRect(0, 0, LW, 252);
  // road + pavement
  const rd = s.createLinearGradient(0, 250, 0, 300);
  rd.addColorStop(0, "#6e7884");
  rd.addColorStop(1, "#5a6470");
  s.fillStyle = rd;
  s.fillRect(0, 250, LW, 50);
  const pv = s.createLinearGradient(0, 300, 0, LH);
  pv.addColorStop(0, "#7c8794");
  pv.addColorStop(1, "#4a525e");
  s.fillStyle = pv;
  s.fillRect(0, 300, LW, LH - 300);
  s.strokeStyle = "rgba(40,46,56,0.35)";
  s.lineWidth = 1;
  for (let i = -6; i < 14; i++) { s.beginPath(); s.moveTo(480 + i * 70, 300); s.lineTo(480 + i * 220, LH); s.stroke(); }
  for (const y of [318, 350, 400, 470]) { s.beginPath(); s.moveTo(0, y); s.lineTo(LW, y); s.stroke(); }
  s.fillStyle = "#3e4650";
  s.fillRect(0, 296, LW, 6);
  // the shop wall on the right side: dark brick, a closed shutter
  s.fillStyle = "#5a4a48";
  s.beginPath(); s.moveTo(700, 0); s.lineTo(LW, 0); s.lineTo(LW, 380); s.lineTo(700, 300); s.fill();
  s.fillStyle = "#6a7078";
  s.beginPath(); s.moveTo(760, 120); s.lineTo(LW, 90); s.lineTo(LW, 350); s.lineTo(760, 305); s.fill();
  s.strokeStyle = "rgba(30,34,40,0.4)";
  for (let k = 0; k < 14; k++) { s.beginPath(); s.moveTo(760, 125 + k * 13); s.lineTo(LW, 96 + k * 18.5); s.stroke(); }
  // puddles reflecting the pale sky
  for (const [x, y, w] of [[200, 440, 120], [520, 380, 80], [80, 360, 60]]) {
    s.fillStyle = "rgba(190,200,214,0.5)";
    s.beginPath(); s.ellipse(x, y, w, w * 0.12, 0, 0, TAU); s.fill();
  }
}
function wheelieBin(g, x, y, s) {
  const gr = g.createLinearGradient(x - s * 0.5, 0, x + s * 0.5, 0);
  gr.addColorStop(0, "#1e2e26");
  gr.addColorStop(0.4, "#3a5446");
  gr.addColorStop(1, "#16221c");
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(x - s * 0.42, y); g.lineTo(x - s * 0.5, y - s * 1.3); g.lineTo(x + s * 0.5, y - s * 1.3); g.lineTo(x + s * 0.42, y);
  g.fill();
  g.fillStyle = "#2a3e34";
  g.fillRect(x - s * 0.56, y - s * 1.42, s * 1.12, s * 0.14);
  g.fillStyle = "rgba(220,230,240,0.25)";
  g.fillRect(x - s * 0.56, y - s * 1.42, s * 1.12, 2);
  g.fillStyle = "#101010";
  g.beginPath(); g.arc(x - s * 0.3, y, s * 0.08, 0, TAU); g.fill();
  g.beginPath(); g.arc(x + s * 0.3, y, s * 0.08, 0, TAU); g.fill();
}
/// hand-lettered marker strokes (unit glyphs, 0..0.7 wide, 0..1 tall)
const GLYPH = {
  F: [[[0, 0.02], [0.02, 1]], [[0, 0.02], [0.62, 0]], [[0.02, 0.5], [0.48, 0.47]]],
  R: [[[0.02, 1], [0, 0.02], [0.42, 0], [0.6, 0.16], [0.54, 0.4], [0.06, 0.5]], [[0.22, 0.5], [0.66, 1]]],
  E: [[[0.6, 0.03], [0.02, 0], [0, 1], [0.64, 0.97]], [[0.02, 0.5], [0.48, 0.52]]],
};
function markerWord(g, word, x, y, lh, t, seed) {
  const adv = lh * 0.86, x0 = x - (word.length * adv) / 2 + lh * 0.08;
  const drips = [];
  g.save();
  g.lineCap = "round"; g.lineJoin = "round";
  for (let pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass ? "rgba(18,20,46,0.92)" : "rgba(40,44,90,0.25)";
    g.lineWidth = lh * (pass ? 0.085 : 0.16);
    [...word].forEach((ch, i) => {
      const gx = x0 + i * adv, gy = y - lh / 2, rot = (hash(i, seed) - 0.5) * 0.12;
      for (const stroke of GLYPH[ch] || []) {
        g.beginPath();
        stroke.forEach(([u, v], k) => {
          const jx = (hash(i * 31 + k, seed + 2) - 0.5) * lh * 0.05, jy = (hash(i * 17 + k, seed + 3) - 0.5) * lh * 0.05;
          const px = gx + (u + rot * (v - 0.5)) * lh + jx, py = gy + v * lh + jy;
          if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
          if (pass && v > 0.95) drips.push([px, py, i * 5 + k]);
        });
        g.stroke();
      }
    });
  }
  // the ink runs in the rain: thin drips with a bead at the end, slowly lengthening
  for (const [px, py, k] of drips) {
    const len = lh * (0.2 + hash(k, seed + 5) * 0.5) * (0.55 + 0.45 * clamp(t / 10));
    g.strokeStyle = "rgba(24,26,60,0.7)"; g.lineWidth = lh * 0.035;
    g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + lh * 0.02, py + len * 0.5, px, py + len); g.stroke();
    g.fillStyle = "rgba(24,26,60,0.8)"; g.beginPath(); g.ellipse(px, py + len, lh * 0.03, lh * 0.045, 0, 0, TAU); g.fill();
  }
  g.restore();
}
// the soggy box, three-quarter view: front, side, open flaps sagging; "FREE" in running marker
function soggyBox(g, x, y, w, h, wet, t) {
  const c = mix(BOX, "#4a3420", 0.25 + wet * 0.3);
  const d = w * 0.36;
  // the back flap, standing, inside darkness
  g.fillStyle = "#24180c";
  g.beginPath(); g.moveTo(x - w / 2 + 2, y - h); g.lineTo(x + w / 2, y - h); g.lineTo(x + w / 2 + d, y - h - d * 0.45); g.lineTo(x - w / 2 + d, y - h - d * 0.45); g.fill();
  g.fillStyle = shade(c, -0.2);
  g.beginPath(); g.moveTo(x - w / 2 + d, y - h - d * 0.45); g.quadraticCurveTo(x + d * 0.4, y - h - d * 0.45 - h * 0.28, x + w / 2 + d, y - h - d * 0.45 - h * 0.05); g.lineTo(x + w / 2 + d, y - h - d * 0.45); g.fill();
  // side face (going back to the right)
  quad(g, [x + w / 2, y], [x + w / 2, y - h], [x + w / 2 + d, y - h - d * 0.45], [x + w / 2 + d, y - d * 0.45], shade(c, -0.3));
  // front face, bowed a little by the wet
  const fg = g.createLinearGradient(0, y - h, 0, y);
  fg.addColorStop(0, shade(c, -0.02));
  fg.addColorStop(0.55, c);
  fg.addColorStop(1, shade(c, -0.2));
  const front = new Path2D();
  front.moveTo(x - w / 2, y);
  front.quadraticCurveTo(x - w / 2 - 3, y - h * 0.5, x - w / 2 + 2, y - h);
  front.quadraticCurveTo(x, y - h + 7, x + w / 2, y - h);
  front.lineTo(x + w / 2, y);
  front.quadraticCurveTo(x, y + 3, x - w / 2, y);
  g.fillStyle = fg;
  g.fill(front);
  g.save();
  g.clip(front);
  // corrugation hints
  g.strokeStyle = "rgba(60,40,20,0.22)";
  g.lineWidth = 1;
  for (let i = 1; i < 10; i++) { g.beginPath(); g.moveTo(x - w / 2 + (i * w) / 10, y - h + 4); g.lineTo(x - w / 2 + (i * w) / 10 + 1, y - 2); g.stroke(); }
  // FREE, hand-lettered in marker, the ink running
  markerWord(g, "FREE", x - 2, y - h * 0.56, h * 0.36, t, 41);
  // the soaked bottom 30%: a dark wicking band with a ragged tide line
  g.fillStyle = `rgba(36,20,8,${0.55 * wet})`;
  g.beginPath();
  g.moveTo(x - w / 2 - 4, y + 4);
  for (let i = 0; i <= 12; i++) g.lineTo(x - w / 2 + (i / 12) * w, y - h * 0.3 + Math.sin(i * 1.9) * h * 0.04 + hash(i, 44) * h * 0.04);
  g.lineTo(x + w / 2 + 4, y + 4);
  g.fill();
  g.restore();
  g.fillStyle = `rgba(36,20,8,${0.45 * wet})`;
  quad(g, [x + w / 2, y], [x + w / 2, y - h * 0.32], [x + w / 2 + d, y - h * 0.32 - d * 0.45], [x + w / 2 + d, y - d * 0.45], `rgba(30,16,6,${0.5 * wet})`);
  // sagging open flaps: the front flap hangs down over the face, the right one droops
  g.fillStyle = shade(c, 0.04);
  g.beginPath(); g.moveTo(x - w / 2 + 2, y - h); g.quadraticCurveTo(x - w * 0.1, y - h + 4, x + w * 0.2, y - h + 2); g.quadraticCurveTo(x - w * 0.05, y - h + h * 0.34, x - w / 2 - 4, y - h + h * 0.28); g.closePath(); g.fill();
  g.strokeStyle = "rgba(40,24,10,0.45)"; g.lineWidth = 1.2; g.stroke();
  g.fillStyle = shade(c, -0.18);
  g.beginPath(); g.moveTo(x + w / 2, y - h); g.quadraticCurveTo(x + w * 0.62, y - h * 0.82, x + w / 2 + d * 1.15, y - h * 0.62); g.lineTo(x + w / 2 + d, y - h - d * 0.45); g.closePath(); g.fill();
}
function umbrellaGeom(x, y, r, tilt) {
  // world points of the canopy outline (dome then scalloped rim), for drawing and the rain mask
  const ca = Math.cos(tilt), sa = Math.sin(tilt);
  const P = (lx, ly) => [x + lx * ca - ly * sa, y + lx * sa + ly * ca];
  const dome = [], rim = [];
  for (let i = 0; i <= 16; i++) { const a = Math.PI + (i / 16) * Math.PI; dome.push(P(Math.cos(a) * r, Math.sin(a) * r * 0.62)); }
  for (let i = 8; i >= 0; i--) { const lx = -r + (i / 8) * 2 * r; rim.push(P(lx, 0)); if (i) rim.push(P(lx - r / 8, -r * 0.07)); }
  return { P, dome, rim };
}
function umbrella(g, x, y, r, tilt, t) {
  // an even scalloped dome: eight panels, alternately lit, ribs with highlights, wet sheen, drips
  const { P } = umbrellaGeom(x, y, r, tilt);
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  g.strokeStyle = "#2a2a2a";
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, -r * 0.62); g.lineTo(0, r * 1.6); g.stroke();
  // the dome seen from the side: ribs are meridians from the ferrule to rim tips spread like
  // cos(angle) across the rim; each panel scallops up between two tips
  const N = 8, top = -r * 0.62;
  const tip = (i) => -r * Math.cos((i / N) * Math.PI);
  for (let i = 0; i < N; i++) {
    const x0 = tip(i), x1 = tip(i + 1);
    const lit = 0.5 + 0.5 * Math.cos(((i + 0.5) / N) * Math.PI + 0.7);
    const pg = g.createLinearGradient(0, top, 0, 0);
    pg.addColorStop(0, mix("#8a2018", "#ff7a66", lit * 0.8));
    pg.addColorStop(1, mix("#4a1210", "#d8483a", lit * 0.7));
    g.fillStyle = pg;
    g.beginPath();
    g.moveTo(0, top);
    g.quadraticCurveTo(x0, top, x0, 0);
    g.quadraticCurveTo((x0 + x1) / 2, -r * 0.09, x1, 0);
    g.quadraticCurveTo(x1, top, 0, top);
    g.fill();
  }
  for (let i = 1; i < N; i++) {
    const x = tip(i);
    g.strokeStyle = "rgba(60,8,6,0.55)"; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(0, top); g.quadraticCurveTo(x, top, x, 0); g.stroke();
    g.strokeStyle = "rgba(255,214,204,0.35)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(1, top + 1); g.quadraticCurveTo(x + 1.5, top + 1, x + 1.5, -1); g.stroke();
  }
  g.fillStyle = "#2a1a14";
  g.fillRect(-2, top - 10, 4, 11);
  for (let i = 0; i <= N; i++) { g.beginPath(); g.arc(tip(i), 0, 2, 0, TAU); g.fill(); }
  g.fillStyle = "rgba(255,226,216,0.22)";
  g.beginPath(); g.ellipse(-r * 0.35, -r * 0.42, r * 0.28, r * 0.07, -0.45, 0, TAU); g.fill();
  g.restore();
  // drips falling off the rim tips
  for (let i = 0; i <= N; i++) {
    const [ex, ey] = P(-r * Math.cos((i / N) * Math.PI), 0);
    const per = 0.5 + hash(i, 8) * 0.4, ph = ((t + hash(i, 9) * per) % per) / per;
    g.fillStyle = "rgba(230,236,246,0.8)";
    g.beginPath(); g.ellipse(ex, ey + 3 + ph * ph * 220, 1.5, 3 + ph * 4, 0, 0, TAU); g.fill();
  }
}
function flashGrade(g) {
  K.grade(g, LW, LH, { tint: "#ffcf8a", alpha: 0.22, mode: "soft-light" });
}
function shotStreetFlash(g, t, lt) {
  const p = eio(seg(lt, 0, 12));
  const um = eio(seg(lt, 3.6, 6.6)); // the umbrella arrives and tilts over the box
  const bx = 430, by = 410;
  K.withCamera(g, LW, LH, { x: lerp(480, 450, p), y: lerp(270, 330, p), zoom: lerp(1.0, 1.32, p), shakeT: t, shakeAmt: 1 }, (c) => {
    c.drawImage(K.sprite("f04day2", LW, LH, paintDayStreet), 0, 0, LW, LH);
    // wet reflections of the bin and the box on the pavement (mirrored, rippled, fading)
    c.save();
    c.beginPath(); c.rect(0, 404, LW, LH); c.clip();
    c.globalAlpha = 0.24;
    c.translate(0, 2 * 405 + 2); c.scale(1, -1);
    wheelieBin(c, 270, 405, 120);
    c.restore();
    c.save();
    c.beginPath(); c.rect(0, by + 1, LW, LH); c.clip();
    c.globalAlpha = 0.26;
    c.translate(0, by * 2 + 3); c.scale(1, -1);
    soggyBox(c, bx, by, 130, 80, 1, lt);
    c.restore();
    const rf = c.createLinearGradient(0, 404, 0, 520);
    rf.addColorStop(0, "rgba(110,120,134,0)"); rf.addColorStop(1, "rgba(110,120,134,0.6)");
    c.fillStyle = rf; c.fillRect(150, 404, 450, 120);
    wheelieBin(c, 270, 405, 120);
    // soft daylight contact shadow under the box
    c.save(); c.translate(bx + 20, by); c.scale(1, 0.16); glow(c, 0, 0, 120, "#1a1e26", 0.5, "source-over"); c.restore();
    soggyBox(c, bx, by, 130, 80, 1, lt);
    // the umbrella's shelter: an umbrella-shaped mask; under the canopy no rain falls
    const ux = lerp(1100, bx + 30, um), uy = lerp(150, 250, um), tilt = lerp(-0.1, -0.36, um);
    const UG = umbrellaGeom(ux, uy, 150, tilt);
    c.save();
    c.beginPath();
    c.rect(-200, -200, LW + 400, LH + 400);
    if (um > 0.05) {
      const drift = Math.tan(0.12), gy = LH + 40;
      const L0 = UG.dome[0], R0 = UG.dome[UG.dome.length - 1];
      c.moveTo(L0[0], L0[1]);
      for (const [px, py] of UG.dome) c.lineTo(px, py);
      c.lineTo(R0[0] + (gy - R0[1]) * drift, gy);
      c.lineTo(L0[0] + (gy - L0[1]) * drift, gy);
      c.closePath();
    }
    c.clip("evenodd");
    K.rain(c, LW, LH, t, { density: 1.1, angle: 0.12, color: "rgba(220,228,240,0.5)", speed: 900, seed: 14, len: 30 });
    K.splashes(c, LW, LH, t, { y0: 310, y1: LH, density: 0.9, color: "rgba(230,236,246,0.55)" });
    c.restore();
    if (um > 0) {
      umbrella(c, ux, uy, 150, tilt, lt);
      // your small hand on the umbrella handle, the yellow sleeve running out of frame
      const L2 = 150 * 1.6, hx2 = ux - L2 * Math.sin(tilt), hy2 = uy + L2 * Math.cos(tilt);
      c.strokeStyle = "#e8b923";
      c.lineCap = "round";
      c.lineWidth = 34;
      c.beginPath(); c.moveTo(hx2 + 14, hy2 + 6); c.lineTo(hx2 + 260, hy2 + 120); c.stroke();
      c.strokeStyle = "rgba(120,90,10,0.5)";
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(hx2 + 20, hy2 + 20); c.lineTo(hx2 + 260, hy2 + 136); c.stroke();
      c.fillStyle = "#e0ac85";
      c.beginPath(); c.ellipse(hx2, hy2, 15, 12, 0.4, 0, TAU); c.fill();
      c.fillStyle = "#b87c5a";
      c.beginPath(); c.ellipse(hx2 - 3, hy2 + 4, 10, 6, 0.4, 0, TAU); c.fill();
      // the umbrella's red bounce light on the wet pavement
      c.save(); c.translate(bx, by + 10); c.scale(1, 0.2); glow(c, 0, 0, 180, UMB, 0.25 * um); c.restore();
    }
  });
  K.fog(g, LW, LH, { y: 220, h: 200, color: "#c8d0da", alpha: 0.25, t: lt, seed: 4 });
  flashGrade(g);
}
// ---- the kitten: painted once from above (top-down), looking up at you -------------------------------
// Kitten proportions: a big round head (0.45 of the body length), big ears, short legs, soaked fur in
// spiky clumps. Local space: sprite 260 x 260, head centre (130, 150). Eyes are drawn live.
const KIT = { w: 260, h: 260, hx: 130, hy: 150, hr: 36 };
const KIT_EYE = "#8ea4b8";
function spikyPath(cx, cy, rx, ry, n, amp, seed, rot = 0) {
  const p = new Path2D();
  const R = K.rng("f04spk" + seed);
  for (let i = 0; i <= n * 2; i++) {
    const a = rot + (i / (n * 2)) * TAU;
    const k = i % 2 ? 1 + amp * (0.5 + R() * 0.8) : 1 - amp * 0.2;
    const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
    if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}
function furFill(c, path, cx, cy, r, base, hi, lo) {
  const gr = c.createRadialGradient(cx - r * 0.45, cy - r * 0.5, r * 0.1, cx, cy, r * 1.25);
  gr.addColorStop(0, hi); gr.addColorStop(0.55, base); gr.addColorStop(1, lo);
  c.fillStyle = gr;
  c.fill(path);
}
function furStrokes(c, path, cx, cy, rx, ry, n, seed, cols) {
  c.save(); c.clip(path);
  const R = K.rng("f04fs" + seed);
  c.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, d = Math.sqrt(R());
    const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
    const len = 3 + R() * 5;
    c.strokeStyle = cols[Math.floor(R() * cols.length)];
    c.lineWidth = 0.8 + R() * 1.2;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); c.stroke();
  }
  c.restore();
}
function paintKitten(c) {
  const { hx, hy, hr } = KIT;
  const OR = "#d9822b", ORL = "#f3b062", ORD = "#8e4614", STR = "rgba(120,52,12,0.75)";
  // tail curled round the right side to the front
  c.lineCap = "round";
  const tail = [[166, 96], [190, 130], [184, 178], [156, 204], [124, 210]];
  for (let i = 0; i < tail.length - 1; i++) {
    c.strokeStyle = i % 2 ? ORD : OR; c.lineWidth = lerp(15, 8, i / 3);
    c.beginPath(); c.moveTo(tail[i][0], tail[i][1]); c.lineTo(tail[i + 1][0], tail[i + 1][1]); c.stroke();
  }
  c.strokeStyle = "rgba(255,210,150,0.35)"; c.lineWidth = 2;
  c.beginPath(); c.moveTo(186, 128); c.quadraticCurveTo(188, 160, 172, 188); c.stroke();
  // body, foreshortened (its back runs away from you, up the frame), and the haunches
  const body = spikyPath(130, 96, 44, 54, 34, 0.09, 1);
  for (const sx of [-1, 1]) {
    const hp = spikyPath(130 + sx * 38, 122, 20, 26, 14, 0.12, 2 + sx);
    furFill(c, hp, 130 + sx * 38, 122, 26, OR, ORL, ORD);
  }
  furFill(c, body, 130, 96, 56, OR, ORL, ORD);
  // mackerel stripes running from the spine round the flanks
  c.save(); c.clip(body);
  const RS = K.rng("f04stripes");
  c.strokeStyle = STR;
  c.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    const y = 48 + i * 13 + RS() * 4;
    for (const sx of [-1, 1]) {
      // broken, tapering mackerel bands, not ribs
      c.lineWidth = 2.2 + RS() * 2.4;
      const a0 = 4 + RS() * 6, a1 = 22 + RS() * 18;
      c.beginPath(); c.moveTo(130 + sx * a0, y + RS() * 3); c.quadraticCurveTo(130 + sx * (a0 + a1) * 0.6, y + 2 + RS() * 4, 130 + sx * a1, y + 6 + RS() * 6); c.stroke();
      if (RS() > 0.4) { c.lineWidth = 1.6 + RS() * 1.5; c.beginPath(); c.moveTo(130 + sx * (a1 + 4), y + 9); c.lineTo(130 + sx * (a1 + 12 + RS() * 6), y + 14 + RS() * 4); c.stroke(); }
    }
  }
  c.strokeStyle = "rgba(120,52,12,0.5)"; c.lineWidth = 4;
  c.beginPath(); c.moveTo(130, 46); c.bezierCurveTo(128, 70, 132, 100, 130, 128); c.stroke();
  c.restore();
  furStrokes(c, body, 130, 96, 44, 54, 260, 3, ["rgba(255,214,150,0.35)", "rgba(110,46,10,0.35)", "rgba(80,30,6,0.3)"]);
  // short front legs and white paws, the white bib
  for (const sx of [-1, 1]) {
    c.fillStyle = "#f2ebe0"; c.beginPath(); c.ellipse(130 + sx * 15, 206, 10, 8, 0, 0, TAU); c.fill();
    c.strokeStyle = "rgba(120,110,100,0.6)"; c.lineWidth = 1;
    for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(130 + sx * 15 + k * 3.4, 210); c.lineTo(130 + sx * 15 + k * 3.4, 213.5); c.stroke(); }
  }
  const bib = spikyPath(130, 190, 22, 16, 16, 0.14, 5);
  furFill(c, bib, 130, 190, 22, "#ece4d8", "#ffffff", "#b8ab9c");
  // the big round head
  const head = spikyPath(hx, hy, hr, hr * 0.94, 30, 0.08, 6);
  // ears: big, set wide; the left tip bent
  for (const sx of [-1, 1]) {
    const bx0 = hx + sx * 10, bx1 = hx + sx * 33, by0 = hy - 30, by1 = hy - 16;
    const tipx = hx + sx * 40, tipy = hy - 64;
    c.fillStyle = ORD;
    c.beginPath(); c.moveTo(bx0, by0); c.quadraticCurveTo(tipx - sx * 6, tipy + 10, tipx, tipy); c.quadraticCurveTo(tipx + sx * 2, tipy + 24, bx1, by1); c.fill();
    c.fillStyle = "#e9a59a";
    c.beginPath(); c.moveTo(bx0 + sx * 5, by0 + 2); c.quadraticCurveTo(tipx - sx * 4, tipy + 16, tipx - sx * 1, tipy + 8); c.quadraticCurveTo(tipx - sx * 2, tipy + 24, bx1 - sx * 5, by1 - 2); c.fill();
    c.strokeStyle = "rgba(255,240,230,0.7)"; c.lineWidth = 0.8;
    for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(bx0 + sx * (6 + k * 3), by0 + 4 + k); c.lineTo(tipx - sx * (2 + k), tipy + 14 + k * 2); c.stroke(); }
    if (sx < 0) { c.fillStyle = ORD; c.beginPath(); c.moveTo(tipx + 2, tipy + 6); c.lineTo(tipx - 8, tipy + 12); c.lineTo(tipx + 4, tipy + 14); c.fill(); }
  }
  furFill(c, head, hx, hy, hr, OR, ORL, ORD);
  c.save(); c.clip(head);
  // the forehead M and cheek stripes
  c.strokeStyle = STR; c.lineWidth = 3;
  c.beginPath(); c.moveTo(hx - 14, hy - 18); c.lineTo(hx - 8, hy - 30); c.lineTo(hx, hy - 20); c.lineTo(hx + 8, hy - 30); c.lineTo(hx + 14, hy - 18); c.stroke();
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(hx + sx * 22, hy - 4 + k * 7); c.quadraticCurveTo(hx + sx * 30, hy - 2 + k * 7, hx + sx * 37, hy + k * 8); c.stroke(); }
  // white muzzle and chin
  c.fillStyle = "#f4ece0";
  c.beginPath(); c.ellipse(hx - 9, hy + 14, 12, 10, 0.2, 0, TAU); c.ellipse(hx + 9, hy + 14, 12, 10, -0.2, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(hx, hy + 26, 10, 7, 0, 0, TAU); c.fill();
  c.restore();
  furStrokes(c, head, hx, hy, hr, hr, 220, 7, ["rgba(255,220,160,0.35)", "rgba(110,46,10,0.35)"]);
  // nose + mouth
  c.fillStyle = "#d9776e";
  c.beginPath(); c.moveTo(hx - 5, hy + 6); c.lineTo(hx + 5, hy + 6); c.lineTo(hx, hy + 12); c.fill();
  c.strokeStyle = "rgba(90,40,30,0.8)"; c.lineWidth = 1.1;
  c.beginPath(); c.moveTo(hx, hy + 12); c.lineTo(hx, hy + 16); c.quadraticCurveTo(hx - 4, hy + 20, hx - 8, hy + 17); c.moveTo(hx, hy + 16); c.quadraticCurveTo(hx + 4, hy + 20, hx + 8, hy + 17); c.stroke();
  // wet: dark soaked streaks, clumped spikes on the outline, water beads
  c.save(); c.globalCompositeOperation = "source-atop";
  const R = K.rng("f04wet");
  c.strokeStyle = "rgba(60,24,4,0.28)"; c.lineWidth = 2;
  for (let i = 0; i < 40; i++) { const x = 80 + R() * 100, y = 40 + R() * 180; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (R() - 0.5) * 3, y + 6 + R() * 8); c.stroke(); }
  c.restore();
  for (let i = 0; i < 22; i++) {
    const x = 92 + R() * 76, y = 50 + R() * 150;
    c.fillStyle = "rgba(235,244,255,0.75)"; c.beginPath(); c.arc(x, y, 0.9 + R() * 1.3, 0, TAU); c.fill();
  }
  // whiskers, few and droopy (wet)
  c.strokeStyle = "rgba(255,255,255,0.65)"; c.lineWidth = 0.7;
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(hx + sx * 12, hy + 14 + k * 2); c.quadraticCurveTo(hx + sx * 36, hy + 14 + k * 5, hx + sx * 50, hy + 24 + k * 7); c.stroke(); }
}
const kittenSprite = () => K.sprite("f04kitten", KIT.w, KIT.h, paintKitten);
// draw the kitten (sprite + live eyes) with its head centre at (x, y), scale s
function kitten(g, x, y, s, o = {}) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.translate(-KIT.hx, -KIT.hy);
  g.drawImage(kittenSprite(), 0, 0, KIT.w, KIT.h);
  const blink = clamp(o.blink || 0);
  for (const sx of [-1, 1]) {
    const ex = KIT.hx + sx * 14, ey = KIT.hy - 5;
    g.fillStyle = "#2a1a10"; g.beginPath(); g.ellipse(ex, ey, 9.6, 9, 0, 0, TAU); g.fill();
    const ig = g.createRadialGradient(ex - 2, ey - 2, 1, ex, ey, 9);
    ig.addColorStop(0, "#c4d2de"); ig.addColorStop(0.6, KIT_EYE); ig.addColorStop(1, "#4a5a6a");
    g.fillStyle = ig; g.beginPath(); g.ellipse(ex, ey, 8.6, 8, 0, 0, TAU); g.fill();
    g.fillStyle = "#06080c"; g.beginPath(); g.ellipse(ex, ey + 0.5, 4.2, 5.4, 0, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,0.95)"; g.beginPath(); g.arc(ex - 3, ey - 3.4, 2.2, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,0.5)"; g.beginPath(); g.arc(ex + 3, ey + 3, 1, 0, TAU); g.fill();
    if (blink > 0.02) { g.fillStyle = "#c06a22"; g.beginPath(); g.ellipse(ex, ey - 9 + 9 * blink, 10, 9 * blink + 0.5, 0, 0, TAU); g.fill(); }
  }
  if (o.mouth > 0.05) { g.fillStyle = "#5a1a14"; g.beginPath(); g.ellipse(KIT.hx, KIT.hy + 19, 3.5 * o.mouth, 4 * o.mouth, 0, 0, TAU); g.fill(); }
  g.restore();
}

// ---- shot 4: straight down into the box -------------------------------------------------------------
const BX = { cx: 480, cy: 286, w: 900, h: 470, inW: 0.74, inH: 0.7 };
function paintBoxTop(s) {
  const { cx, cy, w, h } = BX;
  s.fillStyle = "#4e5866"; s.fillRect(0, 0, LW, LH);
  const R = K.rng("f04pave");
  for (let i = 0; i < 200; i++) { s.fillStyle = `rgba(${R() > 0.5 ? "20,26,34" : "170,180,196"},${0.06 + R() * 0.1})`; s.fillRect(R() * LW, R() * LH, 2 + R() * 30, 1 + R() * 2); }
  const inW = w * BX.inW, inH = h * BX.inH, off = 12;
  const o = [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
  const n = [[cx - inW / 2, cy - inH / 2 + off], [cx + inW / 2, cy - inH / 2 + off], [cx + inW / 2, cy + inH / 2 + off], [cx - inW / 2, cy + inH / 2 + off]];
  // sagging soaked flaps outside the rim, at the frame's edges
  const fc = mix(BOX, "#3a2814", 0.45);
  quad(s, o[0], o[1], [o[1][0] + 30, o[1][1] - 80], [o[0][0] - 20, o[0][1] - 70], shade(fc, -0.1));
  quad(s, o[3], o[2], [o[2][0] + 20, o[2][1] + 70], [o[3][0] - 30, o[3][1] + 80], shade(fc, 0.05));
  quad(s, o[0], o[3], [o[3][0] - 80, o[3][1] + 20], [o[0][0] - 70, o[0][1] - 10], shade(fc, -0.2));
  quad(s, o[1], o[2], [o[2][0] + 70, o[2][1] + 10], [o[1][0] + 80, o[1][1] - 20], shade(fc, -0.25));
  const c = mix(BOX, "#3a2814", 0.35);
  quad(s, o[0], o[1], n[1], n[0], shade(c, -0.38));
  quad(s, o[1], o[2], n[2], n[1], shade(c, -0.2));
  quad(s, o[3], o[0], n[0], n[3], shade(c, -0.05));
  quad(s, o[2], o[3], n[3], n[2], shade(c, 0.06));
  // wet tide marks low on the inner walls, corrugation lines toward the floor
  s.strokeStyle = "rgba(40,24,10,0.25)"; s.lineWidth = 1.2;
  for (let k = 1; k < 16; k++) { const u = k / 16; s.beginPath(); s.moveTo(lerp(o[3][0], o[2][0], u), o[3][1]); s.lineTo(lerp(n[3][0], n[2][0], u), n[3][1]); s.stroke(); }
  for (let k = 1; k < 16; k++) { const u = k / 16; s.beginPath(); s.moveTo(lerp(o[0][0], o[1][0], u), o[0][1]); s.lineTo(lerp(n[0][0], n[1][0], u), n[0][1]); s.stroke(); }
  // floor: soggy newspaper, darker in the corners
  quad(s, n[0], n[1], n[2], n[3], "#8a8474");
  s.save();
  s.beginPath(); s.moveTo(n[0][0], n[0][1]); s.lineTo(n[1][0], n[1][1]); s.lineTo(n[2][0], n[2][1]); s.lineTo(n[3][0], n[3][1]); s.clip();
  for (let col = 0; col < 3; col++) for (let k = 0; k < 22; k++) {
    s.fillStyle = `rgba(40,40,40,${0.12 + R() * 0.12})`;
    s.fillRect(n[0][0] + 30 + col * (inW / 3), n[0][1] + 18 + k * 13, (inW / 3 - 50) * (0.5 + R() * 0.5), 3);
  }
  s.fillStyle = "rgba(30,30,30,0.5)"; s.font = "700 22px Georgia, serif"; s.fillText("THE CATFORD GAZETTE", n[0][0] + 40, n[0][1] + 40);
  s.strokeStyle = "rgba(60,50,40,0.3)"; s.lineWidth = 2;
  for (let k = 0; k < 7; k++) { s.beginPath(); s.moveTo(n[0][0] + R() * inW, n[0][1]); s.bezierCurveTo(n[0][0] + R() * inW, n[0][1] + inH * 0.4, n[0][0] + R() * inW, n[0][1] + inH * 0.6, n[0][0] + R() * inW, n[3][1]); s.stroke(); }
  const dk = s.createRadialGradient(cx, cy + off, 40, cx, cy + off, inW * 0.62);
  dk.addColorStop(0, "rgba(30,20,10,0)"); dk.addColorStop(1, "rgba(30,20,10,0.6)");
  s.fillStyle = dk; s.fillRect(n[0][0], n[0][1], inW, inH);
  // puddle water pooled in the lower-left corner
  const px = n[3][0] + 70, py = n[3][1] - 46;
  // puddle water pooled in the lower-left corner: dark, glassy, with a sharp wet edge and the sky in it
  const pud = new Path2D();
  pud.moveTo(n[3][0], n[3][1]); pud.lineTo(n[3][0], py - 66);
  pud.bezierCurveTo(px - 20, py - 78, px + 70, py - 50, px + 96, py - 8);
  pud.quadraticCurveTo(px + 112, n[3][1] - 10, px + 120, n[3][1]); pud.closePath();
  s.fillStyle = "rgba(40,34,26,0.55)"; s.save(); s.translate(3, 3); s.fill(pud); s.restore();
  const pg = s.createLinearGradient(n[3][0], py - 70, px + 100, n[3][1]);
  pg.addColorStop(0, "rgba(120,134,150,0.9)"); pg.addColorStop(0.5, "rgba(64,72,84,0.9)"); pg.addColorStop(1, "rgba(44,48,56,0.9)");
  s.fillStyle = pg; s.fill(pud);
  s.strokeStyle = "rgba(220,230,240,0.35)"; s.lineWidth = 1.2; s.stroke(pud);
  s.fillStyle = "rgba(200,214,230,0.35)";
  s.beginPath(); s.ellipse(px - 26, py - 30, 34, 6, -0.35, 0, TAU); s.fill();
  s.restore();
  s.strokeStyle = "rgba(20,12,4,0.5)"; s.lineWidth = 2;
  s.beginPath(); for (let k = 0; k < 4; k++) { s.moveTo(o[k][0], o[k][1]); s.lineTo(n[k][0], n[k][1]); } s.stroke();
  s.strokeStyle = shade(c, 0.22); s.lineWidth = 7; s.strokeRect(o[0][0], o[0][1], w, h);
  s.strokeStyle = "rgba(40,24,10,0.45)"; s.lineWidth = 2; s.strokeRect(o[0][0] + 4, o[0][1] + 4, w - 8, h - 8);
}
function shotBoxTop(g, t, lt) {
  const p = eio(seg(lt, 0, 10));
  const shiver = Math.sin(lt * TAU * 10) * 1.4 + Math.sin(lt * TAU * 7.3) * 0.5;
  K.withCamera(g, LW, LH, { x: 480, y: 280, zoom: lerp(1.0, 1.12, p), rot: lerp(0.02, -0.01, p), shakeT: t, shakeAmt: 0.7 }, (c) => {
    c.drawImage(K.sprite("f04boxtop", LW, LH, paintBoxTop), 0, 0, LW, LH);
    // drips from the umbrella rim land in the corner puddle: rings
    const px = BX.cx - (BX.w * BX.inW) / 2 + 70, py = BX.cy + (BX.h * BX.inH) / 2 + 12 - 46;
    for (let i = 0; i < 3; i++) {
      const per = 1.1 + i * 0.37, ph = ((lt + i * 0.41) % per) / per;
      c.strokeStyle = `rgba(220,232,246,${0.5 * (1 - ph)})`; c.lineWidth = 1.2;
      c.beginPath(); c.ellipse(px + i * 22 - 10, py + i * 6, 4 + ph * 26, 2 + ph * 12, 0, 0, TAU); c.stroke();
    }
    // the kitten: a quarter of the box's width, looking up at you, shivering
    const kx = 492 + shiver, ky = 300;
    c.save(); c.translate(kx, ky - 30); c.scale(1, 0.75); glow(c, 0, 0, 120, "#1a1006", 0.5, "source-over"); c.restore();
    kitten(c, kx, ky, 1.12, { blink: K.env(lt, 5.4, 5.8, 0.08, 0.1), mouth: K.env(lt, 0.0, 1.6, 0.3, 0.6) * 0.9 });
  });
  // the umbrella edge in the foreground, red and out of focus, dripping
  K.focus(g, LW, LH, 9, (f) => {
    f.fillStyle = "#8a2218";
    f.beginPath(); f.moveTo(-20, -20); f.lineTo(LW + 20, -20); f.lineTo(LW + 20, 70); f.quadraticCurveTo(720, 30, 480, 62); f.quadraticCurveTo(240, 30, -20, 74); f.fill();
    for (let i = 0; i < 8; i++) {
      const per = 0.55 + hash(i, 18) * 0.35, ph = ((lt + hash(i, 19) * per) % per) / per;
      const x = 60 + i * 120 + hash(i, 20) * 30;
      f.fillStyle = "rgba(235,240,250,0.85)";
      f.beginPath(); f.ellipse(x, 60 + ph * ph * 500, 4, 8 + ph * 12, 0, 0, TAU); f.fill();
    }
  }, "f04umb");
  flashGrade(g);
}
// ---- shot 5: you lift him; your sleeve folds over his back ------------------------------------------
function shotHands(g, t, lt) {
  const lift = eio(seg(lt, 0, 3.0));
  const wrap = eio(seg(lt, 2.6, 6.2));
  const shiver = Math.sin(lt * TAU * 10) * 1.3 * (1 - seg(lt, 2, 4.2));
  const breathe = Math.sin(lt * 2.6) * 1.2 * wrap;
  g.drawImage(K.sprite("f04dayB", LW, LH, (s) => {
    if (K.hasFilter()) s.filter = "blur(10px)";
    s.drawImage(K.sprite("f04day2", LW, LH, paintDayStreet), -60, -60, LW + 120, LH + 120);
    s.filter = "none";
  }), 0, 0, LW, LH);
  K.focus(g, LW, LH, 10, (f) => {
    f.fillStyle = "#9a2a1e";
    f.beginPath(); f.moveTo(-20, -20); f.lineTo(LW + 20, -20); f.lineTo(LW + 20, 90); f.quadraticCurveTo(480, 20, -20, 110); f.fill();
  }, "f04umb2");
  K.rain(g, LW, LH, t, { density: 0.5, angle: 0.12, color: "rgba(220,228,240,0.35)", seed: 15 });
  glow(g, 480, 300, 380, "#ffb060", 0.18 * wrap);
  const cy = 330 - 30 * lift; // the kitten's head centre rises 30 px as you lift him
  const kx = 480 + shiver;
  // your forearms in yellow sleeves, from the lower corners to the wrists beside him
  for (const sd of [-1, 1]) {
    const arm = new Path2D();
    K.tube(arm, [480 + sd * 520, LH + 160, 480 + sd * 260, cy + 200, kx + sd * 112, cy + 40], [130, 100, 64], 6);
    const ag = g.createLinearGradient(480 + sd * 520, LH, kx + sd * 110, cy + 40);
    ag.addColorStop(0, "#5a4206"); ag.addColorStop(1, "#e2b223");
    g.fillStyle = ag; g.fill(arm);
    g.save(); g.clip(arm);
    g.strokeStyle = "rgba(90,62,0,0.4)"; g.lineWidth = 2;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(kx + sd * (150 + i * 40), cy + 40 + i * 50); g.quadraticCurveTo(kx + sd * (190 + i * 40), cy + 70 + i * 50, kx + sd * (170 + i * 44), cy + 110 + i * 50); g.stroke(); }
    g.restore();
  }
  const lightH = { x: 900, y: 40, color: "#ffe6c0", strength: 0.6 };
  const hands = () => {
    K.drawHand(g, kx - 104, cy + 30, 108, { pose: "reach", left: true, angle: -0.9, t: lt, light: lightH, bell: true });
    K.drawHand(g, kx + 104, cy + 30, 108, { pose: "reach", angle: -2.24, t: lt, light: lightH });
  };
  // palms under him, the kitten sitting in them, then the fingers wrapping round his flanks
  hands();
  g.save(); g.translate(kx, cy - 20); g.scale(1, 0.6); glow(g, 0, 0, 90, "#3a2006", 0.35, "source-over"); g.restore();
  kitten(g, kx, cy, 0.9, { blink: lerp(0, 0.65, seg(lt, 6, 9)), mouth: 0 });
  g.save();
  g.beginPath();
  g.rect(kx - 260, cy - 260, 260 - 30, 232);
  g.rect(kx + 30, cy - 260, 230, 232);
  g.clip();
  hands();
  g.restore();
  // the end of your sleeve folds over his back: only his head and front paws stay out
  if (wrap > 0.01) {
    const hem = lerp(cy - 96, cy - 50, wrap) + breathe;
    const fold = new Path2D();
    fold.moveTo(kx - 100, cy + 26);
    fold.bezierCurveTo(kx - 116, cy - 150, kx + 116, cy - 150, kx + 100, cy + 26);
    fold.quadraticCurveTo(kx + 64, hem - 2, kx + 28, hem + 2);
    fold.quadraticCurveTo(kx, hem + 8, kx - 28, hem + 2);
    fold.quadraticCurveTo(kx - 64, hem - 2, kx - 100, cy + 26);
    g.save();
    g.globalAlpha = clamp(wrap * 2.5);
    const fg = g.createLinearGradient(0, cy - 140, 0, cy + 40);
    fg.addColorStop(0, "#8a6a0c"); fg.addColorStop(0.5, "#e8b923"); fg.addColorStop(1, "#b88a10");
    g.fillStyle = fg; g.fill(fold);
    g.save(); g.clip(fold);
    const rs = g.createRadialGradient(kx, cy - 40, 30, kx, cy - 40, 150);
    rs.addColorStop(0, "rgba(255,236,170,0.25)"); rs.addColorStop(1, "rgba(80,50,0,0.5)");
    g.fillStyle = rs; g.fillRect(kx - 140, cy - 200, 280, 260);
    g.strokeStyle = "rgba(110,80,8,0.5)"; g.lineWidth = 2;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(kx - 100 + i * 50, hem + 6); g.quadraticCurveTo(kx - 110 + i * 55, cy - 100, kx - 130 + i * 65, cy - 170); g.stroke(); }
    g.restore();
    // the hem catches the light; a soft shadow falls on his neck
    g.strokeStyle = "rgba(255,240,190,0.65)"; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(kx - 110, cy + 20); g.quadraticCurveTo(kx - 70, hem - 4, kx - 30, hem + 2); g.quadraticCurveTo(kx, hem + 10, kx + 30, hem + 2); g.stroke();
    g.fillStyle = "rgba(60,30,0,0.28)";
    g.beginPath(); g.ellipse(kx, hem + 14, 44, 7, 0, 0, TAU); g.fill();
    g.restore();
  }
  K.grade(g, LW, LH, { tint: "#ffcf8a", alpha: 0.22 + 0.2 * wrap, mode: "soft-light" });
}
function paintKitchen(s) {
  // a small kitchen at night, seen from low: tiled wall, cabinets, a dark rainy window, lino floor
  const wg = s.createLinearGradient(0, 0, 0, 280);
  wg.addColorStop(0, "#1e140e");
  wg.addColorStop(1, "#4a3020");
  s.fillStyle = wg;
  s.fillRect(0, 0, LW, 280);
  s.strokeStyle = "rgba(0,0,0,0.18)";
  s.lineWidth = 1;
  for (let y = 120; y < 280; y += 22) { s.beginPath(); s.moveTo(300, y); s.lineTo(LW, y); s.stroke(); }
  for (let x = 300; x < LW; x += 22) { s.beginPath(); s.moveTo(x, 120); s.lineTo(x, 280); s.stroke(); }
  for (let i = 0; i < 5; i++) {
    const x = 330 + i * 125;
    const cg = s.createLinearGradient(0, 10, 0, 110);
    cg.addColorStop(0, "#2a1a10");
    cg.addColorStop(1, "#4a2e1a");
    s.fillStyle = cg;
    s.fillRect(x, 10, 118, 100);
    s.fillStyle = "rgba(255,200,140,0.12)";
    s.fillRect(x, 108, 118, 2);
    s.fillStyle = "#8a6a40";
    s.fillRect(x + 54, 80, 10, 3);
  }
  // window over the sink: night and rain
  s.fillStyle = "#0a1020";
  s.fillRect(640, 130, 170, 110);
  K.glassDrops(s, 640, 130, 170, 110, 0, { seed: 5, density: 1.2, light: "#ffcf9a" });
  s.strokeStyle = "#5a3a24";
  s.lineWidth = 7;
  s.strokeRect(640, 130, 170, 110);
  // things on the counter, dark against the tiles: a kettle, jars, a bottle, a toaster, a fruit bowl
  s.fillStyle = "#1a100a";
  s.beginPath(); s.ellipse(360, 252, 26, 20, 0, Math.PI, 0); s.lineTo(386, 270); s.lineTo(334, 270); s.fill();
  s.fillRect(352, 226, 16, 8); s.beginPath(); s.moveTo(384, 252); s.lineTo(404, 236); s.lineTo(400, 250); s.fill();
  for (const [x, w, h] of [[430, 18, 30], [452, 16, 24], [472, 20, 36]]) { s.fillRect(x, 270 - h, w, h); s.fillRect(x - 1, 270 - h - 4, w + 2, 5); }
  s.fillRect(522, 220, 9, 50); s.fillRect(524, 206, 5, 16);
  s.fillRect(560, 238, 54, 32); s.fillRect(570, 234, 34, 4);
  s.beginPath(); s.ellipse(870, 262, 40, 12, 0, 0, Math.PI); s.fill();
  for (const [x, y] of [[850, 254], [868, 250], [888, 255]]) { s.beginPath(); s.arc(x, y, 9, 0, TAU); s.fill(); }
  s.fillStyle = "rgba(255,180,110,0.35)";
  for (const x of [336, 430, 452, 472, 560]) s.fillRect(x, 246, 2, 22);
  // the counter edge
  s.fillStyle = "#6a4028";
  s.fillRect(300, 270, LW - 300, 16);
  s.fillStyle = "#3a2214";
  s.fillRect(300, 286, LW - 300, 20);
  // floor: chequered lino in perspective
  const fg = s.createLinearGradient(0, 300, 0, LH);
  fg.addColorStop(0, "#4a3020");
  fg.addColorStop(1, "#24160c");
  s.fillStyle = fg;
  s.fillRect(0, 300, LW, LH - 300);
  s.fillStyle = "rgba(0,0,0,0.16)";
  // cool moonlight from the window spilling over the counter and down onto the floor (soft: this
  // sprite is blurred once)
  {
    const wsp = s.createLinearGradient(0, 240, 0, LH);
    wsp.addColorStop(0, "rgba(120,160,240,0.22)"); wsp.addColorStop(1, "rgba(120,160,240,0)");
    s.fillStyle = wsp;
    s.beginPath(); s.moveTo(644, 240); s.lineTo(806, 240); s.lineTo(880, LH); s.lineTo(610, LH); s.fill();
  }
  for (let r = 0; r < 8; r++) {
    const y0 = 300 + Math.pow(r / 8, 1.5) * 240, y1 = 300 + Math.pow((r + 1) / 8, 1.5) * 240;
    for (let c = -12; c < 12; c++) {
      if ((r + c) % 2) continue;
      const k0 = (y0 - 280) / 260, k1 = (y1 - 280) / 260;
      s.beginPath();
      s.moveTo(480 + c * 70 * k0 * 2, y0); s.lineTo(480 + (c + 1) * 70 * k0 * 2, y0);
      s.lineTo(480 + (c + 1) * 70 * k1 * 2, y1); s.lineTo(480 + c * 70 * k1 * 2, y1);
      s.fill();
    }
  }
}
function heater(g, x, y, lt) {
  // an old electric bar heater on the floor: chrome frame, glowing coils, a warm floor pool
  const hf = 0.92 + 0.08 * Math.sin(lt * 1.3) * Math.sin(lt * 0.7 + 1);
  g.save(); g.translate(x + 60, y); g.scale(1, 0.22); glow(g, 0, 0, 260, HEATER, 0.6 * hf); g.restore();
  glow(g, x + 60, y - 90, 360, HEATER, 0.4 * hf);
  const fr = g.createLinearGradient(x, 0, x + 120, 0);
  fr.addColorStop(0, "#2a2420");
  fr.addColorStop(0.5, "#8a7a6a");
  fr.addColorStop(1, "#2a2420");
  g.fillStyle = fr;
  g.fillRect(x - 6, y - 190, 132, 180);
  g.fillStyle = "#140a06";
  g.fillRect(x + 4, y - 180, 112, 160);
  for (let i = 0; i < 4; i++) {
    const yy = y - 160 + i * 38;
    const eg = g.createLinearGradient(0, yy - 7, 0, yy + 7);
    eg.addColorStop(0, "rgba(255,120,40,0)");
    eg.addColorStop(0.5, mix("#ffd0a0", "#ff6a20", 0.3 + 0.1 * i));
    eg.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = eg;
    g.fillRect(x + 10, yy - 7, 100, 14);
  }
  glow(g, x + 60, y - 100, 120, "#ffcf9a", 0.5 * hf);
  g.strokeStyle = "rgba(200,190,180,0.35)";
  g.lineWidth = 1;
  for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(x + 8 + i * 9.5, y - 180); g.lineTo(x + 8 + i * 9.5, y - 20); g.stroke(); }
  g.fillStyle = "#1a1410";
  g.fillRect(x - 10, y - 12, 140, 12);
}
function shotKitchen(g, t, lt) {
  const write = seg(lt, 1.0, 7.2);
  const p = seg(lt, 0, 10);
  K.withCamera(g, LW, LH, { x: lerp(470, 490, p), y: 270, zoom: lerp(1.0, 1.06, p), shakeT: t, shakeAmt: 0.8 }, (c) => {
    // background, a little soft
    c.drawImage(K.sprite("f04kitB", LW, LH, (s) => {
      if (K.hasFilter()) s.filter = "blur(3px)";
      s.drawImage(K.sprite("f04kit", LW, LH, paintKitchen), 0, 0);
      s.filter = "none";
    }), 0, 0, LW, LH);
    heater(c, 70, 390, lt);
    // the heater's warm wash across the floor and the box's left side, falling off with distance
    c.save();
    c.globalCompositeOperation = "lighter";
    const hw = c.createRadialGradient(140, 380, 20, 140, 380, 520);
    hw.addColorStop(0, "rgba(255,130,50,0.3)"); hw.addColorStop(0.5, "rgba(255,120,40,0.12)"); hw.addColorStop(1, "rgba(255,120,40,0)");
    c.fillStyle = hw; c.fillRect(0, 160, 760, LH);
    c.restore();
    // the shoebox by the heater: a towel nest, the kitten asleep
    const sx = 470, sy = 360;
    c.save(); c.translate(sx, sy + 66); c.scale(1, 0.15); glow(c, 0, 0, 200, "#000000", 0.55, "source-over"); c.restore();
    // box inside (back wall), visible above the front
    c.fillStyle = "#5a3a20";
    c.beginPath(); c.moveTo(sx - 140, sy); c.lineTo(sx - 110, sy - 34); c.lineTo(sx + 170, sy - 34); c.lineTo(sx + 140, sy); c.fill();
    // towel nest
    const tg = c.createLinearGradient(0, sy - 40, 0, sy);
    tg.addColorStop(0, "#f2e8da");
    tg.addColorStop(1, "#bfae98");
    c.fillStyle = tg;
    c.beginPath(); c.moveTo(sx - 136, sy + 2); c.quadraticCurveTo(sx - 70, sy - 46, sx - 6, sy - 26); c.quadraticCurveTo(sx + 70, sy - 50, sx + 150, sy - 26); c.lineTo(sx + 138, sy + 4); c.fill();
    const breath = Math.sin(lt * 2.2) * 0.8;
    K.drawCat(c, sx + 6, sy - 10 - breath * 0.3, 54, { pose: "sleep", facing: -1, coat: KITTEN, t: lt, collar: false, bell: false, shadow: false, light: { x: 130, y: 280, color: "#ffb070", strength: 1.5 } });
    // the towel fold tucked over him
    c.fillStyle = "#e6d8c4";
    c.beginPath(); c.moveTo(sx - 140, sy + 6); c.quadraticCurveTo(sx - 40, sy - 12 - breath, sx + 50, sy + 2); c.quadraticCurveTo(sx + 100, sy - 6, sx + 140, sy + 6); c.lineTo(sx + 140, sy + 14); c.lineTo(sx - 140, sy + 14); c.fill();
    // the box front
    const bg = c.createLinearGradient(sx - 140, 0, sx + 140, 0);
    bg.addColorStop(0, "#e0a060");
    bg.addColorStop(0.5, "#b07440");
    bg.addColorStop(1, "#6a4022");
    c.fillStyle = bg;
    c.fillRect(sx - 140, sy + 4, 280, 62);
    c.fillStyle = "rgba(255,200,140,0.35)";
    c.fillRect(sx - 140, sy + 4, 280, 2);
    // the heater-lit left end of the box and its cool right side
    const sideWash = c.createLinearGradient(sx - 140, 0, sx + 140, 0);
    sideWash.addColorStop(0, "rgba(255,140,60,0.35)"); sideWash.addColorStop(0.6, "rgba(255,140,60,0)"); sideWash.addColorStop(1, "rgba(60,80,140,0.25)");
    c.fillStyle = sideWash; c.fillRect(sx - 140, sy + 4, 280, 62);
    // the lid lies flat on the floor in front, its depth edges running to the box's vanishing angle
    const LX = 760, LYc = 446, EX = 0.66, DX = -0.2, DY = 0.2;
    // contact shadow under the lid
    c.save(); c.translate(LX - 6, LYc + 10); c.transform(EX, 0, DX, DY, 0, 0);
    c.fillStyle = "rgba(10,4,0,0.45)"; c.fillRect(-206, -112, 420, 236);
    c.restore();
    c.save();
    c.translate(LX, LYc);
    c.transform(EX, 0, DX, DY, 0, 0);
    const lg = c.createLinearGradient(-200, -120, 200, 120);
    lg.addColorStop(0, "#e6b078");
    lg.addColorStop(1, "#a46a3c");
    c.fillStyle = lg;
    c.fillRect(-210, -120, 410, 230);
    c.fillStyle = "rgba(255,140,60,0.18)"; c.fillRect(-210, -120, 160, 230);
    c.strokeStyle = "rgba(90,50,20,0.55)";
    c.lineWidth = 4;
    c.strokeRect(-200, -110, 390, 210);
    // the lid's thin front edge (its thickness, facing us)
    c.fillStyle = "#7a4a26"; c.fillRect(-210, 110, 410, 14);
    c.font = '700 88px "Segoe Print", "Comic Sans MS", cursive';
    c.textAlign = "left";
    c.textBaseline = "middle";
    const word = "BISCUIT";
    const full = c.measureText(word).width;
    const x0 = -full / 2 - 5;
    c.save();
    c.beginPath(); c.rect(x0 - 10, -100, (full + 20) * write, 200); c.clip();
    c.fillStyle = "rgba(20,16,14,0.35)";
    c.fillText(word, x0 + 2, 2);
    c.fillStyle = "#14100e";
    c.fillText(word, x0, 0);
    c.restore();
    c.restore();
    // where the marker tip is now (the lid transform applied by hand)
    const lx = x0 + full * write, ly = Math.sin(lt * 10) * 18 * (write > 0 && write < 1 ? 1 : 0);
    const tipX = LX + lx * EX + DX * ly, tipY = LYc + DY * ly;
    // your hand gripping the marker: the barrel runs from the nib up between thumb and fingers
    const wx = tipX + 104, wy = tipY + 46, ang = Math.atan2(tipY - wy, tipX - wx);
    K.drawHand(c, wx, wy, 104, { pose: "hold", angle: ang, t: lt, light: { x: 130, y: 280, color: "#ffb070", strength: 1.1 } });
    c.save();
    c.translate(tipX, tipY);
    c.rotate(ang + Math.PI - 0.12);
    c.fillStyle = "#151515"; c.beginPath(); c.moveTo(0, 0); c.lineTo(12, -4); c.lineTo(12, 4); c.fill();
    const mg = c.createLinearGradient(0, -6, 0, 6);
    mg.addColorStop(0, "#9a9a9a"); mg.addColorStop(0.4, "#f4f4f4"); mg.addColorStop(1, "#8a8a8a");
    c.fillStyle = mg; c.fillRect(12, -5.5, 64, 11);
    c.fillStyle = "#1a1a1a"; c.fillRect(70, -6, 20, 12);
    c.restore();
    // thumb and index tips close over the barrel
    const gx = tipX + Math.cos(ang + Math.PI - 0.12) * 52, gy = tipY + Math.sin(ang + Math.PI - 0.12) * 52;
    c.fillStyle = "#e0ac85";
    c.beginPath(); c.ellipse(gx - 2, gy + 7, 9, 6, ang, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(gx + 6, gy - 8, 10, 6, ang + 0.3, 0, TAU); c.fill();
    c.fillStyle = "rgba(255,226,214,0.7)"; c.beginPath(); c.ellipse(gx + 2, gy - 10, 3.5, 2, ang + 0.3, 0, TAU); c.fill();
    c.strokeStyle = "rgba(150,90,60,0.6)"; c.lineWidth = 1;
    c.beginPath(); c.ellipse(gx + 6, gy - 8, 10, 6, ang + 0.3, 0, TAU); c.stroke();
  });
  K.grade(g, LW, LH, { tint: "#ffcf8a", alpha: 0.3, mode: "soft-light" });
}

// ---- shot 7: the bell room, present ------------------------------------------------------------------
function paintBellRoom(s) {
  // timber belfry: plank floor in perspective, beams, an arched window on the right open to the night
  const wg = s.createLinearGradient(0, 0, 0, LH);
  wg.addColorStop(0, "#0c1020");
  wg.addColorStop(1, "#1a2032");
  s.fillStyle = wg;
  s.fillRect(0, 0, LW, LH);
  stoneTexture(s, 0, 0, LW, 330, 7, "#1e2434", 24);
  const sh = s.createLinearGradient(0, 0, LW, 0);
  sh.addColorStop(0, "rgba(4,6,12,0.7)");
  sh.addColorStop(0.6, "rgba(4,6,12,0.15)");
  sh.addColorStop(1, "rgba(4,6,12,0.5)");
  s.fillStyle = sh;
  s.fillRect(0, 0, LW, 330);
  // arched window
  const ax = 720, aw = 150, ay = 110, ah = 230;
  s.fillStyle = "#26324e";
  s.beginPath(); s.moveTo(ax - aw / 2, ay + ah); s.lineTo(ax - aw / 2, ay + aw / 2); s.arc(ax, ay + aw / 2, aw / 2, Math.PI, 0); s.lineTo(ax + aw / 2, ay + ah); s.fill();
  s.save();
  s.clip();
  const sk = s.createLinearGradient(0, ay, 0, ay + ah);
  sk.addColorStop(0, "#0a1228");
  sk.addColorStop(1, "#3a4a72");
  s.fillStyle = sk;
  s.fillRect(ax - aw, ay, aw * 2, ah);
  K.stars(s, LW, 260, 9, 1.2, 0);
  const R = K.rng("f04wr");
  s.fillStyle = "#0a0e18";
  for (let x = ax - aw / 2; x < ax + aw / 2; x += 18 + R() * 14) {
    const h = 24 + R() * 40;
    s.beginPath(); s.moveTo(x, ay + ah); s.lineTo(x, ay + ah - h); s.lineTo(x + 12, ay + ah - h - 10); s.lineTo(x + 24, ay + ah - h); s.lineTo(x + 24, ay + ah); s.fill();
  }
  s.restore();
  s.fillStyle = "#3a4458";
  s.fillRect(ax - aw / 2 - 12, ay + ah, aw + 24, 12);
  s.fillStyle = "rgba(188,208,255,0.35)";
  s.fillRect(ax - aw / 2 - 12, ay + ah, aw + 24, 2);
  // floor planks
  const fy = 330;
  const fg = s.createLinearGradient(0, fy, 0, LH);
  fg.addColorStop(0, "#2a2420");
  fg.addColorStop(1, "#14100c");
  s.fillStyle = fg;
  s.fillRect(0, fy, LW, LH - fy);
  s.strokeStyle = "rgba(0,0,0,0.5)";
  s.lineWidth = 1;
  for (let i = -14; i <= 14; i++) { s.beginPath(); s.moveTo(480 + i * 40, fy); s.lineTo(480 + i * 140, LH); s.stroke(); }
  // a layer of dust on the floor: pale, mottled
  const R2 = K.rng("f04dust");
  for (let i = 0; i < 260; i++) {
    s.fillStyle = `rgba(200,200,210,${0.03 + R2() * 0.05})`;
    s.beginPath(); s.ellipse(R2() * LW, fy + Math.pow(R2(), 0.8) * (LH - fy), 10 + R2() * 30, 2 + R2() * 4, 0, 0, TAU); s.fill();
  }
  // beams
  s.fillStyle = "#120c08";
  s.fillRect(0, 36, LW, 26);
  s.fillRect(120, 36, 30, fy - 36);
  s.fillRect(840, 36, 30, fy - 36);
  s.beginPath(); s.moveTo(150, 150); s.lineTo(300, 62); s.lineTo(318, 62); s.lineTo(150, 170); s.fill();
  s.fillStyle = "rgba(188,208,255,0.12)";
  s.fillRect(0, 60, LW, 2);
}
function shotBellRoom(g, t, lt) {
  const p = eio(seg(lt, 0, 8));
  const lift = eio(seg(lt, 0, 1.6));
  const ring = K.env(lt, 1.0, 3.4, 0.05, 2);
  K.withCamera(g, LW, LH, { x: lerp(470, 500, p), y: 270, zoom: lerp(1.0, 1.05, p), shakeT: t, shakeAmt: 1 }, (c) => {
    c.drawImage(K.sprite("f04bell", LW, LH, paintBellRoom), 0, 0, LW, LH);
    // moonlight pouring through the window across the floor
    K.godRays(c, 720, 170, LW, LH, { color: MOONC, count: 6, strength: 0.3, t: lt, angle: 2.45, spread: 0.3, length: 700, seed: 11 });
    c.save();
    c.globalCompositeOperation = "lighter";
    const pl = c.createLinearGradient(720, 340, 380, 500);
    pl.addColorStop(0, "rgba(188,208,255,0.22)");
    pl.addColorStop(1, "rgba(188,208,255,0)");
    c.fillStyle = pl;
    c.beginPath(); c.moveTo(650, 340); c.lineTo(800, 340); c.lineTo(620, LH); c.lineTo(260, LH); c.fill();
    c.restore();
    // pawprints pressed in the dust, fresh, leading to the window, glowing faint amber
    // pawprints pressed in the dust: visible at once (pale scuffed dust, darker prints), then
    // their amber glow eases in; the trail curves up to the arched window's sill and ends there
    const pts = [];
    const P = (u) => { const v = 1 - u; return [v * v * 300 + 2 * v * u * 560 + u * u * 712, v * v * 448 + 2 * v * u * 420 + u * u * 346]; };
    for (let i = 0; i < 12; i++) {
      const u = i / 11, [x0, y0] = P(u), [x1, y1] = P(Math.min(1, u + 0.02));
      const ang = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
      const side = i % 2 ? 1 : -1;
      pts.push({ x: x0 + Math.cos(ang) * side * 6, y: y0 + Math.sin(ang) * side * 2.5, a: ang, s: lerp(13, 6, u), alpha: 0.9, flat: 0.42 });
    }
    c.fillStyle = "rgba(200,200,214,0.06)";
    for (const q of pts) { c.beginPath(); c.ellipse(q.x + (q.s % 3) - 1, q.y + 1, q.s * 1.5, q.s * 0.55, 0.2, 0, TAU); c.fill(); }
    for (const q of pts) {
      c.save(); c.translate(q.x, q.y); c.scale(1, 0.42); c.rotate(q.a);
      c.fillStyle = "rgba(14,10,8,0.75)";
      c.beginPath(); c.ellipse(0, q.s * 0.2, q.s * 0.55, q.s * 0.45, 0, 0, TAU); c.fill();
      for (let k = 0; k < 4; k++) { const a2 = -Math.PI / 2 + (k - 1.5) * 0.48; c.beginPath(); c.ellipse(Math.cos(a2) * q.s * 0.78, Math.sin(a2) * q.s * 0.7 + q.s * 0.05, q.s * 0.17, q.s * 0.22, a2 + Math.PI / 2, 0, TAU); c.fill(); }
      c.restore();
    }
    const amber = smooth(seg(lt, 0.8, 1.8));
    if (amber > 0.01) K.pawprints(c, pts.map((q) => Object.assign({}, q, { alpha: q.alpha * amber })), 0.6 * amber);
    // the great silent bell overhead
    bigBell(c, 470, 92, 175, Math.sin(lt * 0.4) * 0.004, 1);
    K.dust(c, LW, LH, lt, { seed: 21, count: 50, color: "#e0e8ff", size: 1.3, area: [420, 120, 400, 380], alpha: 0.55 });
  });
  // your wrist rises into frame: the little bell on its red string rings under the huge silent one
  const hx = 200, hy = lerp(720, 470, lift);
  tinted(g, "bhand", 20, 160, 420, 380, (hg) => {
    K.drawHand(hg, hx, hy, 190, { pose: "open", left: true, angle: -1.35 + Math.sin(lt * 7) * 0.03 * ring, bell: true, skin: "#e2a882", t: lt, light: { x: 720, y: 150, color: MOONC, strength: 0.7 } });
  }, "#2a2440", 0.14);
  // the little bell on its string rings: a soft glint, no rings drawn
  const bx = hx + 4, by = hy + 32;
  glow(g, bx, by, 26 + ring * 30, "#ffe6b0", 0.2 + ring * 0.35);
  K.bellGlint(g, bx - 2, by - 3, 10 + ring * 8, lt, { strength: 0.35 + ring * 0.9 });
}

// ---- shot 8: over the rooftops toward the manor on the hill ------------------------------------------
function paintRoofSky(s) {
  const sk = s.createLinearGradient(0, 0, 0, LH);
  sk.addColorStop(0, "#070a18");
  sk.addColorStop(0.55, "#1e1a40");
  sk.addColorStop(1, "#4a3462");
  s.fillStyle = sk;
  s.fillRect(0, 0, LW, LH);
  K.stars(s, LW, LH, 12, 1.1, 0, { yMax: 300 });
}
function paintRoofs(s) {
  // the hill and the manor's silhouette (violet, far, hazed)
  const hg = s.createLinearGradient(0, 210, 0, 380);
  hg.addColorStop(0, "#241a3c");
  hg.addColorStop(1, "#140e24");
  s.fillStyle = hg;
  s.beginPath();
  s.moveTo(-80, 366);
  s.bezierCurveTo(200, 340, 420, 250, 560, 222);
  s.lineTo(660, 220);
  s.bezierCurveTo(780, 236, 880, 290, 970, 320);
  s.lineTo(1060, 340); s.lineTo(1060, LH); s.lineTo(-80, LH);
  s.fill();
  s.strokeStyle = "rgba(188,170,255,0.25)";
  s.lineWidth = 1.2;
  s.beginPath(); s.moveTo(-10, 360); s.bezierCurveTo(200, 340, 420, 250, 560, 222); s.lineTo(660, 220); s.stroke();
  // bare trees on the hill
  s.strokeStyle = "#120c20";
  s.lineWidth = 1.2;
  for (let i = 0; i < 8; i++) { const x = 380 + i * 40, y = 270 - i * 6 + (i > 5 ? 10 : 0); s.beginPath(); s.moveTo(x, y); s.lineTo(x, y - 18); s.moveTo(x, y - 10); s.lineTo(x - 6, y - 20); s.moveTo(x, y - 12); s.lineTo(x + 7, y - 22); s.stroke(); }
  s.fillStyle = "#0c0818";
  const mx = 610, my = 222;
  s.fillRect(mx - 62, my - 36, 124, 38);
  s.fillRect(mx - 74, my - 74, 22, 76);
  s.beginPath(); s.moveTo(mx - 78, my - 74); s.lineTo(mx - 63, my - 110); s.lineTo(mx - 48, my - 74); s.fill();
  s.fillRect(mx + 42, my - 60, 18, 62);
  s.beginPath(); s.moveTo(mx + 38, my - 60); s.lineTo(mx + 51, my - 92); s.lineTo(mx + 64, my - 60); s.fill();
  s.beginPath(); s.moveTo(mx - 66, my - 36); s.lineTo(mx, my - 64); s.lineTo(mx + 66, my - 36); s.fill();
  s.fillStyle = "#ffb35a";
  for (const [x, y] of [[mx - 32, my - 22], [mx + 12, my - 24], [mx - 66, my - 54]]) s.fillRect(x, y, 4, 6);
  // town rooftops in layers, nearer = darker and bigger
  // town rooftops in layers, nearer = darker and bigger; pitched slopes and chimneys with pots, the
  // slopes that face the moon (upper left) catch a cold rim. Painted wider than the frame (overscan).
  const layers = [[372, 0.4, "#18183a", 1], [410, 0.7, "#0f1026", 2], [460, 1.0, "#07080f", 3]];
  for (const [base, sc, col, seed] of layers) {
    const R = K.rng("f04roof" + seed);
    let x = -80;
    while (x < s.canvas.width / K.pixelScale() + 40) {
      const w = (60 + R() * 70) * sc, h = (40 + R() * 70) * sc, peak = R() > 0.4;
      const top = base - h, px = x + w / 2, py = top - w * 0.4;
      s.fillStyle = col;
      s.beginPath();
      s.moveTo(x, LH);
      s.lineTo(x, top);
      if (peak) s.lineTo(px, py);
      s.lineTo(x + w, top);
      s.lineTo(x + w, LH);
      s.fill();
      if (peak && seed > 1) {
        // the moonlit slope is a shade lighter, with tile courses
        s.fillStyle = mix(col, "#3a4060", 0.25);
        s.beginPath(); s.moveTo(x, top); s.lineTo(px, py); s.lineTo(px, top); s.fill();
        s.strokeStyle = "rgba(0,0,0,0.35)"; s.lineWidth = 0.8;
        for (let k = 1; k < 5; k++) { const v = k / 5; s.beginPath(); s.moveTo(lerp(x, px, v), lerp(top, py, v)); s.lineTo(lerp(x + w, px, v), lerp(top, py, v)); s.stroke(); }
      }
      if (R() > 0.45) {
        const cx = peak ? x + w * 0.66 : x + w * 0.7, cw = 10 * sc, ch = 30 * sc, cy = peak ? lerp(top, py, 0.55) : top;
        s.fillStyle = col; s.fillRect(cx, cy - ch, cw, ch + 2);
        s.fillRect(cx - 1.5 * sc, cy - ch - 3 * sc, cw + 3 * sc, 3 * sc);
        s.fillRect(cx + 1.5 * sc, cy - ch - 8 * sc, 3 * sc, 5 * sc); s.fillRect(cx + 5.5 * sc, cy - ch - 7 * sc, 3 * sc, 4 * sc);
        s.fillStyle = "rgba(188,208,255,0.35)"; s.fillRect(cx, cy - ch, 1.2, ch);
      }
      if (R() > 0.55) { s.fillStyle = mix("#ffc27a", col, 0.3 + 0.12 * seed); s.fillRect(x + w * 0.3, top + 14 * sc, 8 * sc, 10 * sc); }
      s.strokeStyle = `rgba(188,208,255,${0.2 + 0.12 * seed})`;
      s.lineWidth = 1 + 0.3 * seed;
      s.beginPath(); s.moveTo(x, top); if (peak) s.lineTo(px, py); else s.lineTo(x + w * 0.5, top); s.stroke();
      x += w + R() * 6;
    }
  }
}
function shotRoofs(g, t, lt) {
  const p = eio(seg(lt, 0, 6));
  const fl = K.flash(lt, [2.3, 2.45, 4.4], 0.3);
  K.withCamera(g, LW, LH, { x: lerp(470, 560, p), y: lerp(290, 260, p), zoom: lerp(1.0, 1.14, p), shakeT: t, shakeAmt: 0.8 }, (c) => {
    // overscan: the sky and roofs are painted 10% wider than the frame so the move never shows an edge
    c.drawImage(K.sprite("f04roofsky", LW, LH, paintRoofSky), -60, -40, LW + 120, LH + 80);
    K.moon(c, 150, 90, 26, { glow: 0.8 });
    K.clouds(c, LW + 120, LH, lt + 80, { seed: 19, color: "#3a3060", shade: "#120c22", count: 5, y: 120, spread: 60, speed: 18, alpha: 0.6 });
    // far purple lightning behind the manor (~70.5 s): it lights the cloud undersides
    if (fl > 0) {
      glow(c, 720, 140, 320, "#b080ff", 0.4 * fl);
      c.save();
      c.globalCompositeOperation = "lighter";
      K.clouds(c, LW + 120, LH, lt + 80, { seed: 19, color: "#c8a8ff", shade: "#6a4aa0", count: 5, y: 120, spread: 60, speed: 18, alpha: 0.55 * fl });
      c.restore();
      c.save(); c.beginPath(); c.rect(-60, -40, LW + 120, 260); c.clip();
      K.lightningBolt(c, 760, 10, 735, 236, lt > 3 ? 7 : 3, { color: "#d0b0ff", alpha: fl, width: 1.2 });
      c.restore();
    }
    c.drawImage(K.sprite("f04roofs2", LW + 120, LH, (s) => { s.translate(60, 0); paintRoofs(s); }), -60, 0, LW + 120, LH);
    if (fl > 0) { c.fillStyle = `rgba(150,110,230,${0.12 * fl})`; c.fillRect(-60, -40, LW + 120, LH + 80); }
    glow(c, 610, 205, 60, "#ffb35a", 0.25);
    K.fog(c, LW, LH, { y: 330, h: 120, color: "#3a2a5a", alpha: 0.35, t: lt, seed: 9 });
    // amber pawprints across the near rooftops, leading toward the hill
    const trail = [];
    for (let i = 0; i < 9; i++) {
      const u = i / 8, x = lerp(930, 470, u), y = lerp(452, 372, u) - Math.abs(Math.sin(u * 9)) * 10 * (1 - u);
      const on = smooth(seg(lt, 0.4 + i * 0.35, 0.9 + i * 0.35));
      trail.push({ x: x + (i % 2 ? 4 : -4), y, a: Math.atan2(-80, -460) + Math.PI / 2, s: lerp(9, 4, u), alpha: on, flat: 0.5 });
    }
    K.pawprints(c, trail, 0.9);
  });
}
// ---- the edit -------------------------------------------------------------------------------------
const SHOTS = [
  [0, 10, shotTower],
  [10, 18, shotStairs],
  [18, 30, shotStreetFlash],
  [30, 40, shotBoxTop],
  [40, 50, shotHands],
  [50, 60, shotKitchen],
  [60, 68, shotBellRoom],
  [68, 74, shotRoofs],
];
// per-shot finish: night = cool; flashbacks = warm, grainier, with a soft memory edge
const LOOK = [
  { tint: "#2a3a70", a: 0.2, grain: 0.06, mem: 0 },
  { tint: "#2a3a70", a: 0.22, grain: 0.06, mem: 0 },
  { tint: "#ffcf8a", a: 0.1, grain: 0.06, mem: 1 },
  { tint: "#ffcf8a", a: 0.1, grain: 0.06, mem: 1 },
  { tint: "#ffcf8a", a: 0.1, grain: 0.06, mem: 1 },
  { tint: "#ffb070", a: 0.12, grain: 0.06, mem: 1 },
  { tint: "#2a3a70", a: 0.22, grain: 0.06, mem: 0 },
  { tint: "#3a2a70", a: 0.2, grain: 0.06, mem: 0 },
];
// cross-fade lengths into each shot (flashbacks get the 0.8 s memory dissolve)
const XF = [0, 0.5, 0.8, 0.4, 0.5, 0.6, 0.8, 0.5];

function drawShot(g, i, t) {
  const [a, , fn] = SHOTS[i];
  g.save();
  try { fn(g, t, Math.max(0, t - a)); } finally { g.restore(); }
}
function memoryEdge(g, k) {
  if (k <= 0) return;
  const gr = g.createRadialGradient(LW / 2, LH / 2, LH * 0.3, LW / 2, LH / 2, LW * 0.62);
  gr.addColorStop(0, "rgba(255,236,200,0)");
  gr.addColorStop(0.7, `rgba(255,236,200,${0.06 * k})`);
  gr.addColorStop(1, `rgba(60,40,20,${0.55 * k})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, LW, LH);
}

export const film = {
  id: 4,
  title: "The Box in the Rain",
  chapter: "Chapter 4",
  unlockAt: 20,
  duration: D,
  poster: 30,
  tagline: "The day you found him first.",
  subs: [
    [4.0, 8.0, "The clock tower rang out over town."],
    [12.0, 16.0, "You climbed. And you remembered."],
    [19.5, 23.5, "It was raining that day, too."],
    [24.5, 28.5, "A box. A sign. Free."],
    [31.5, 35.5, "He was the smallest thing you had ever seen."],
    [41.5, 45.5, "He stopped shaking when you held him."],
    [51.0, 55.5, "You named him after his colour."],
    [55.8, 59.0, "Biscuit."],
    [61.0, 65.5, "His pawprints, in the dust of the tower."],
    [69.0, 73.0, "Leading up the hill. To the manor."],
  ],
  voice: [
    [4.0, "The clock tower rang out over town.", { rate: 0.92, pitch: 1.0 }],
    [12.0, "You climbed. And you remembered.", { rate: 0.92, pitch: 1.0 }],
    [19.5, "It was raining that day, too.", { rate: 0.85, pitch: 0.95 }],
    [24.5, "A box. A sign. Free.", { rate: 0.85, pitch: 0.95 }],
    [31.5, "He was the smallest thing you had ever seen.", { rate: 0.92, pitch: 1.0 }],
    [41.5, "He stopped shaking when you held him.", { rate: 0.92, pitch: 1.0 }],
    [51.0, "You named him after his colour.", { rate: 0.92, pitch: 1.0 }],
    [55.8, "Biscuit.", { rate: 0.8, pitch: 1.0 }],
    [61.0, "His pawprints, in the dust of the tower.", { rate: 0.92, pitch: 1.0 }],
    [69.0, "Leading up the hill. To the manor.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: { mood: "sad", key: "F", bpm: 66, cues: [[3, "bell"], [15, "swell"], [30, "meow"], [44, "purr"], [60, "bell"], [70, "swell"]] },
  draw(g, t, W, H) {
    t = clamp(t, 0, D);
    g.save();
    if (W !== LW || H !== LH) g.scale(W / LW, H / LH);
    let i = SHOTS.findIndex(([a, b]) => t >= a && t < b);
    if (i < 0) i = SHOTS.length - 1;
    drawShot(g, i, t);
    let mem = LOOK[i].mem, tint = LOOK[i].tint, ta = LOOK[i].a, gr = LOOK[i].grain;
    const nx = SHOTS[i + 1];
    if (nx) {
      const xf = XF[i + 1];
      if (t > nx[0] - xf) {
        const L = K.layer(LW, LH, "f04xf");
        drawShot(L.g, i + 1, t);
        const k = smooth((t - (nx[0] - xf)) / xf);
        g.save();
        g.globalAlpha = k;
        g.drawImage(L.canvas, 0, 0, LW, LH);
        g.restore();
        const n = LOOK[i + 1];
        mem = lerp(mem, n.mem, k); gr = lerp(gr, n.grain, k); ta = lerp(ta, n.a, k);
        if (k > 0.5) tint = n.tint;
      }
    }
    K.finish(g, LW, LH, t, { bloom: 0.34, tint, tintAlpha: ta, mode: "soft-light", vignette: 0.6, grain: gr, letterbox: false });
    memoryEdge(g, mem);
    K.grade(g, LW, LH, { lift: "#07090f" });
    K.letterbox(g, LW, LH, 1);
    const tA = K.env(t, 0.9, 3.8, 0.8, 0.8);
    if (tA > 0) K.title(g, LW, LH, "The Box in the Rain", "Chapter 4", tA, { y: LH * 0.74, size: 54, glow: "#ffe6b0" });
    K.fadeBlack(g, LW, LH, 1 - smooth(seg(t, 0, 1.4)));
    K.fadeBlack(g, LW, LH, smooth(seg(t, 72.2, 74)));
    g.restore();
  },
};
