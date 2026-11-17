// films/f05.js - Chapter 5 "The Shadow at the Gate" (FILMS.md f05). Haunted Litterbox Manor under a
// full moon: violet fog, iron gates, and for the first time the Shadow walking just ahead of Biscuit.
// draw(g, t, W, H) is a pure function of t; static art is cached through K.sprite()/K.layer().
import * as K from "../filmkit.js";

const D = 64;
const LW = 960, LH = 540;
const V_TOP = "#1b1030", V_LOW = "#5a3a7a", FOGC = "#2a1a3c", CANDLE = "#ffb35a", RIM = "#bcd6ff";
const SIL = "#0b0614"; // silhouettes are darker than the sky by a wide margin
const { clamp, lerp, seg, smooth, mix, rgba, hash, glow } = K;
const eio = (x) => K.ease.inOut(clamp(x));
const TAU = Math.PI * 2;
const SHADOW = { base: "#0d0f18", light: "#151826", dark: "#07080c", stripe: "#0d0f18", tip: "#07080c", belly: "#10121a", white: "#10121a", pattern: "solid", bib: false, socks: false, muzzle: false, iris: "#0d0f18", irisInner: "#0d0f18", nose: "#0d0f18", noseEdge: "#07080c", innerEar: "#11131c", liner: "#05060a", bentEar: false };
const STONE = { base: "#6e6a72", light: "#8e8a92", dark: "#45424a", stripe: "#5a5660", tip: "#4a4650", belly: "#77737a", white: "#807c84", pattern: "solid", bib: false, socks: false, muzzle: true, iris: "#5e5a62", irisInner: "#6a666e", nose: "#4a4650", noseEdge: "#36333a", innerEar: "#55525a", liner: "#2a282e", bentEar: false, stripeAlpha: 0 };

// ---- small canvas helpers ------------------------------------------------------------------------
function scratch(w, h) {
  const ps = K.pixelScale();
  const c = K.makeCanvas(w * ps, h * ps);
  const cg = c.getContext("2d");
  cg.setTransform(ps, 0, 0, ps, 0, 0);
  return { c, g: cg };
}
// a sprite painted once and blurred once (static, soft backgrounds)
function softSprite(key, w, h, blurPx, paint) {
  return K.sprite(key, w, h, (s) => {
    const T = scratch(w, h);
    try { paint(T.g, w, h); } catch (err) { console.warn("[f05] soft", key, err); }
    if (K.hasFilter() && blurPx > 0) s.filter = `blur(${(blurPx * K.pixelScale()).toFixed(2)}px)`;
    s.drawImage(T.c, 0, 0, w, h);
    s.filter = "none";
  });
}
// the whole frame flares with lightning: re-add the frame to itself (about 2x) plus a violet wash
function frameFlash(g, amt) {
  if (!(amt > 0.01)) return;
  const c = g.canvas;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = clamp(amt) * 0.9;
  g.drawImage(c, 0, 0);
  g.globalAlpha = 1;
  g.fillStyle = `rgba(110,100,190,${0.2 * clamp(amt)})`;
  g.fillRect(0, 0, c.width, c.height);
  g.restore();
}
// a thin branched bolt with a bloom halo (drawn behind the hills by the callers)
function bolt(g, x0, y0, x1, y1, seed, a) {
  if (!(a > 0.01)) return;
  glow(g, (x0 + x1) / 2, (y0 + y1) / 2, Math.abs(y1 - y0) * 0.8, "#b8a8ff", 0.45 * a);
  K.lightningBolt(g, x0, y0, x1, y1, seed, { color: "#e4dcff", alpha: a, width: 1.1 });
}
// ground fog band with a moving density (every exterior shot)
function groundFog(c, t, y, seed, a = 0.55) {
  const pulse = 0.8 + 0.2 * Math.sin(t * 0.7 + seed);
  K.fog(c, LW, LH, { y, h: 110, color: FOGC, alpha: a * pulse, t: t * 3.2, seed });
}

// ---- the manor (painted once) ------------------------------------------------------------------------
function archWin(s, x, y, w, h, fill) {
  s.fillStyle = fill;
  s.beginPath(); s.moveTo(x - w, y + h); s.lineTo(x - w, y + w); s.quadraticCurveTo(x, y - w * 0.9, x + w, y + w); s.lineTo(x + w, y + h); s.fill();
}
function paintManor(s, w, h) {
  // origin: bottom centre at (w/2, h). Asymmetric gothic house: a second depth plane of set-back
  // wings (lighter through the haze), a crooked tower, one dormer side, a broken shutter.
  const cx = w / 2, by = h;
  const far = "#2a1f3e", body = SIL;
  // -- back plane: set-back wings and a ruined chimney stack, hazed
  s.fillStyle = far;
  s.fillRect(cx - 300, by - 128, 120, 128);
  s.beginPath(); s.moveTo(cx - 308, by - 126); s.lineTo(cx - 262, by - 172); s.lineTo(cx - 200, by - 160); s.lineTo(cx - 176, by - 126); s.fill();
  s.fillRect(cx + 200, by - 150, 96, 150);
  s.beginPath(); s.moveTo(cx + 192, by - 148); s.lineTo(cx + 250, by - 214); s.lineTo(cx + 300, by - 148); s.fill();
  s.fillRect(cx + 262, by - 236, 12, 40);
  s.fillRect(cx - 40, by - 300, 18, 70);
  for (const [x, y] of [[cx - 270, by - 100], [cx - 230, by - 100], [cx + 230, by - 120], [cx + 266, by - 120]]) archWin(s, x, y, 5, 18, "#3a2c52");
  // -- front plane
  s.fillStyle = body;
  s.fillRect(cx - 170, by - 150, 340, 150);
  // main roof: the peak is off-centre and the right slope sags
  s.beginPath(); s.moveTo(cx - 190, by - 148); s.lineTo(cx - 34, by - 272); s.lineTo(cx - 8, by - 266); s.quadraticCurveTo(cx + 90, by - 200, cx + 190, by - 148); s.fill();
  // two dormers on the left slope only
  for (const dx of [-120, -70]) {
    s.fillRect(cx + dx - 12, by - 196 - (dx + 120) * 0.5, 24, 30);
    s.beginPath(); s.moveTo(cx + dx - 16, by - 194 - (dx + 120) * 0.5); s.lineTo(cx + dx, by - 214 - (dx + 120) * 0.5); s.lineTo(cx + dx + 16, by - 194 - (dx + 120) * 0.5); s.fill();
  }
  // left wing (short, gable)
  s.fillRect(cx - 250, by - 104, 90, 104);
  s.beginPath(); s.moveTo(cx - 262, by - 102); s.lineTo(cx - 205, by - 172); s.lineTo(cx - 150, by - 102); s.fill();
  // right wing (taller, flat-topped with a broken parapet)
  s.fillRect(cx + 160, by - 126, 104, 126);
  for (let i = 0; i < 6; i++) if (i !== 3) s.fillRect(cx + 162 + i * 17, by - 136, 10, 12);
  // crooked tall tower (left), leaning
  s.save();
  s.translate(cx - 110, by - 150);
  s.rotate(-0.07);
  s.fillRect(-24, -158, 48, 158);
  s.beginPath(); s.moveTo(-32, -156); s.lineTo(6, -262); s.lineTo(32, -156); s.fill();
  s.fillRect(4, -286, 2, 26);
  s.restore();
  // round tower (right): a witch-hat spire bent over
  s.save();
  s.translate(cx + 112, by - 140);
  s.rotate(0.05);
  s.fillRect(-28, -110, 56, 110);
  s.beginPath(); s.moveTo(-38, -108); s.quadraticCurveTo(-8, -160, 30, -222); s.quadraticCurveTo(8, -160, 38, -108); s.fill();
  s.restore();
  // chimneys (different heights, one cracked off)
  s.fillRect(cx - 62, by - 236, 16, 52);
  s.fillRect(cx + 58, by - 206, 14, 34);
  s.beginPath(); s.moveTo(cx + 58, by - 206); s.lineTo(cx + 64, by - 214); s.lineTo(cx + 72, by - 206); s.fill();
  s.fillRect(cx - 222, by - 186, 12, 40);
  // windows: varied sizes; some candle-lit, some dark, one boarded, one broken
  const wins = [
    [cx - 120, by - 122, 7, 26, "lit"], [cx - 70, by - 122, 7, 26, "dark"], [cx - 20, by - 126, 9, 30, "board"], [cx + 30, by - 122, 7, 26, "dark"], [cx + 80, by - 122, 7, 26, "lit"],
    [cx - 120, by - 62, 8, 30, "dark"], [cx + 80, by - 62, 8, 30, "broken"], [cx - 225, by - 82, 6, 22, "dark"], [cx - 185, by - 82, 6, 22, "lit"],
    [cx + 190, by - 96, 7, 26, "dark"], [cx + 236, by - 96, 7, 26, "lit"], [cx - 106, by - 262, 5, 18, "lit"], [cx + 116, by - 220, 6, 20, "dark"],
  ];
  for (const [x, y, ww, hh, kind] of wins) {
    archWin(s, x, y, ww, hh, kind === "lit" ? CANDLE : "#231735");
    if (kind === "lit") { s.fillStyle = "rgba(60,20,10,0.6)"; s.fillRect(x - 0.8, y + 2, 1.6, hh); s.fillRect(x - ww, y + hh * 0.5, ww * 2, 1.6); }
    if (kind === "board") { s.strokeStyle = "#3a2a1c"; s.lineWidth = 3; s.beginPath(); s.moveTo(x - ww, y + 4); s.lineTo(x + ww, y + hh - 2); s.moveTo(x + ww, y + 6); s.lineTo(x - ww, y + hh - 4); s.stroke(); }
    if (kind === "broken") { s.fillStyle = "#07040c"; s.beginPath(); s.moveTo(x - 4, y + 8); s.lineTo(x + 3, y + 12); s.lineTo(x - 1, y + 18); s.lineTo(x + 5, y + 24); s.lineTo(x - 5, y + 22); s.fill(); }
  }
  // the broken shutter: one hangs from a single hinge
  s.save(); s.translate(cx + 37, by - 120); s.rotate(0.5); s.fillStyle = "#1c1228"; s.fillRect(0, 0, 8, 26); s.strokeStyle = "rgba(188,214,255,0.3)"; s.lineWidth = 1; s.strokeRect(0, 0, 8, 26); s.restore();
  s.fillStyle = "#1c1228"; s.fillRect(cx - 129, by - 120, 6, 26);
  // round window in the left gable
  s.fillStyle = "#231735"; s.beginPath(); s.arc(cx - 205, by - 130, 7, 0, TAU); s.fill();
  // the front door (dark; its crack of light is live)
  s.fillStyle = "#07040c";
  s.beginPath(); s.moveTo(cx - 18, by); s.lineTo(cx - 18, by - 44); s.quadraticCurveTo(cx, by - 62, cx + 18, by - 44); s.lineTo(cx + 18, by); s.fill();
  s.fillStyle = "#1a1228";
  s.fillRect(cx - 34, by - 8, 68, 8);
  // cold moon rim along every edge that faces the moon (upper right)
  s.strokeStyle = "rgba(188,214,255,0.7)";
  s.lineWidth = 1.6;
  s.beginPath();
  s.moveTo(cx - 8, by - 266); s.quadraticCurveTo(cx + 90, by - 200, cx + 190, by - 148);
  s.moveTo(cx - 205, by - 172); s.lineTo(cx - 150, by - 102);
  s.moveTo(cx + 264, by - 126); s.lineTo(cx + 264, by - 40);
  s.moveTo(cx + 170, by - 150); s.lineTo(cx + 170, by - 128);
  s.moveTo(cx + 150, by - 248); s.quadraticCurveTo(cx + 140, by - 210, cx + 152, by - 180);
  s.stroke();
  s.strokeStyle = "rgba(188,214,255,0.35)";
  s.beginPath(); s.moveTo(cx - 98, by - 410); s.lineTo(cx - 66, by - 300); s.moveTo(cx + 250, by - 214); s.lineTo(cx + 300, by - 148); s.stroke();
}
function paintSkyV(s) {
  const gr = s.createLinearGradient(0, 0, 0, LH);
  gr.addColorStop(0, "#0a0614");
  gr.addColorStop(0.45, V_TOP);
  gr.addColorStop(0.72, "#3c2656");
  gr.addColorStop(1, V_LOW);
  s.fillStyle = gr;
  s.fillRect(0, 0, LW, LH);
  K.stars(s, LW, LH, 51, 0.8, 0, { yMax: LH * 0.6 });
}
function bareTree(g, x, y, h, seed, col) {
  const R = K.rng("f05tree" + seed);
  g.strokeStyle = col;
  g.lineCap = "round";
  const br = (x0, y0, a, len, w, d) => {
    const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + (R() - 0.5) * len * 0.3, (y0 + y1) / 2, x1, y1); g.stroke();
    if (d > 0) {
      const n = 2 + (R() > 0.6 ? 1 : 0);
      for (let i = 0; i < n; i++) br(x1, y1, a + (R() - 0.5) * 1.3, len * (0.6 + R() * 0.2), w * 0.62, d - 1);
    }
  };
  br(x, y, -Math.PI / 2 + (R() - 0.5) * 0.2, h * 0.38, h * 0.05, 5);
}
// the drive: one cubic shared by the painted gravel and the walking figures
const DRIVE = [420, 560, 436, 452, 528, 398, 486, 326];
function driveAt(u) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = DRIVE, v = 1 - u;
  return [v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3, v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3];
}
const figSize = (u) => lerp(34, 12, Math.pow(u, 0.9)); // Biscuit's shoulder height along the drive
// arc-length table: s (px) and gait cycles q (sum ds / stride) - lets the legs match the ground speed
const DLUT = (() => {
  const out = [];
  let s = 0, q = 0, [px, py] = driveAt(0);
  for (let i = 0; i <= 96; i++) {
    const u = i / 96, [x, y] = driveAt(u);
    const ds = Math.hypot(x - px, y - py);
    s += ds; q += ds / (figSize(u) * 1.5);
    out.push({ u, x, y, s, q });
    px = x; py = y;
  }
  return out;
})();
function driveS(s) {
  const L = DLUT;
  s = clamp(s, 0, L[L.length - 1].s);
  let i = 1;
  while (i < L.length - 1 && L[i].s < s) i++;
  const a = L[i - 1], b = L[i], k = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), u: lerp(a.u, b.u, k), q: lerp(a.q, b.q, k), ang: Math.atan2(b.y - a.y, b.x - a.x) };
}
function paintHill(s) {
  const hg = s.createLinearGradient(0, 300, 0, LH);
  hg.addColorStop(0, "#160e24");
  hg.addColorStop(1, "#08050f");
  s.fillStyle = hg;
  s.beginPath();
  s.moveTo(-10, 420);
  s.bezierCurveTo(200, 390, 330, 330, 470, 318);
  s.bezierCurveTo(620, 310, 760, 350, 970, 400);
  s.lineTo(970, LH + 20); s.lineTo(-10, LH + 20);
  s.fill();
  s.strokeStyle = "rgba(188,214,255,0.35)";
  s.lineWidth = 1.4;
  s.beginPath(); s.moveTo(-10, 420); s.bezierCurveTo(200, 390, 330, 330, 470, 318); s.bezierCurveTo(620, 310, 760, 350, 970, 400); s.stroke();
  bareTree(s, 130, 420, 190, 1, "#07040d");
  bareTree(s, 820, 400, 220, 2, "#07040d");
  bareTree(s, 300, 365, 110, 3, "#140c22");
  bareTree(s, 690, 352, 120, 4, "#140c22");
  // the gravel drive: a tapered ribbon along DRIVE, moonlit toward the house
  const L = [], R = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40, [x, y] = driveAt(u), [x2, y2] = driveAt(Math.min(1, u + 0.01));
    let nx = -(y2 - y), ny = x2 - x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const w = lerp(70, 8, Math.pow(u, 0.8));
    L.push([x + nx * w, y + ny * w]); R.push([x - nx * w, y - ny * w]);
  }
  const dg = s.createLinearGradient(0, LH, 0, 320);
  dg.addColorStop(0, "rgba(46,34,62,0.9)");
  dg.addColorStop(1, "rgba(96,80,130,0.8)");
  s.fillStyle = dg;
  s.beginPath();
  L.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  for (let i = R.length - 1; i >= 0; i--) s.lineTo(R[i][0], R[i][1]);
  s.fill();
  const Rn = K.rng("gravel");
  for (let i = 0; i < 260; i++) {
    const u = Math.pow(Rn(), 0.7), [x, y] = driveAt(u), w = lerp(64, 6, Math.pow(u, 0.8));
    s.fillStyle = Rn() > 0.5 ? "rgba(150,140,190,0.25)" : "rgba(8,5,14,0.35)";
    s.fillRect(x + (Rn() - 0.5) * 2 * w, y + (Rn() - 0.5) * 4, lerp(2, 0.6, u), lerp(1.4, 0.5, u));
  }
}

// ---- shot 1: the manor on its hill -------------------------------------------------------------------
const MANOR_X = 480 - 300 * 0.9, MANOR_Y = 322 - 300 * 0.9;
function manorScene(c, t, lt, o = {}) {
  c.drawImage(K.sprite("f05sky", LW, LH, paintSkyV), 0, 0, LW, LH);
  const mx = o.moonX == null ? 600 : o.moonX, my = o.moonY == null ? 150 : o.moonY;
  K.moon(c, mx, my, o.moonR || 64, { glow: 1.25, halo: "#b8a8ff" });
  K.clouds(c, LW, LH, t * 1.4 + 20, { seed: 31, color: "#5a4a7a", shade: "#1a1030", count: 7, y: 150, spread: 90, speed: 14, alpha: 0.75 });
  glow(c, mx, my, 320, "#9c8cff", 0.2);
  if (o.bolt > 0) bolt(c, 160, 50, 200, 330, 5, o.bolt);
  K.fog(c, LW, LH, { y: 330, h: 90, color: "#4a3466", alpha: 0.55, t: t * 0.6, seed: 2 });
  c.drawImage(K.sprite("f05manor2", 600, 300, paintManor), MANOR_X, MANOR_Y, 600 * 0.9, 300 * 0.9);
  candles(c, t);
  if (o.door) doorCrack(c, t, o.door);
  c.drawImage(K.sprite("f05hill2", LW, LH, paintHill), 0, 0, LW, LH);
}
function candles(c, t) {
  const fl = 0.85 + 0.15 * Math.sin(t * 6.3) * Math.sin(t * 2.1);
  for (const [x, y] of [[372, 212], [552, 212], [313, 248], [692, 236], [385, 86]]) glow(c, x, y + 12, 22, CANDLE, 0.45 * fl);
}
function doorCrack(c, t, d) {
  const dx = 480, dy = 318;
  c.fillStyle = rgba("#ffd08a", 0.95 * d);
  c.fillRect(dx - 1 - 3 * d, dy - 46, 2 + 6 * d, 42);
  glow(c, dx, dy - 24, 50 + 30 * d, CANDLE, 0.6 * d);
  c.save(); c.translate(dx, dy + 6); c.scale(1, 0.25); glow(c, 0, 0, 90, CANDLE, 0.4 * d); c.restore();
}
function shotManor(g, t, lt) {
  const p = eio(seg(lt, 0, 10));
  const fl = K.flash(lt, [6.0, 6.12, 6.42], 0.1);
  K.withCamera(g, LW, LH, { x: 480, y: lerp(290, 270, p), zoom: lerp(1.03, 1.12, p), shakeT: t, shakeAmt: 0.9 + fl * 3 }, (c) => {
    manorScene(c, t, lt, { door: 0, bolt: fl });
    K.fog(c, LW, LH, { y: 420, h: 140, color: "#3a2650", alpha: 0.55, t: t * 1.0, seed: 4 });
    groundFog(c, t, 470, 6, 0.6);
    K.fog(c, LW, LH, { y: 500, h: 120, color: FOGC, alpha: 0.7, t: t * 2.2, seed: 7, fill: true });
  });
  frameFlash(g, fl);
}

// ---- iron gates -------------------------------------------------------------------------------------
// one wrought-iron leaf painted in a sprite (hinge on the left, base at y = LEAF_B): bars with spear
// tips, two rails and paired C-scrolls with collars between them. Mirrored for right-hand leaves.
const LEAF_W = 320, LEAF_H = 480, LEAF_B = 470, LEAF_BH = 430;
function paintLeaf(s, mirror) {
  if (mirror) { s.translate(LEAF_W, 0); s.scale(-1, 1); }
  const w = LEAF_W - 12, h = LEAF_BH, x0 = 6, n = 9;
  const iron = "#07060c";
  s.lineCap = "butt";
  for (let i = 0; i <= n; i++) {
    const x = x0 + (i / n) * w;
    const top = LEAF_B - h * (0.86 + 0.14 * Math.sin((i / n) * Math.PI));
    s.strokeStyle = iron; s.lineWidth = 5;
    s.beginPath(); s.moveTo(x, LEAF_B); s.lineTo(x, top); s.stroke();
    s.fillStyle = iron;
    s.beginPath(); s.moveTo(x - 6, top + 4); s.lineTo(x, top - 16); s.lineTo(x + 6, top + 4); s.fill();
    s.strokeStyle = rgba(RIM, mirror ? 0.3 : 0.6); s.lineWidth = 1.3;
    s.beginPath(); s.moveTo(x + 2.2, LEAF_B - 4); s.lineTo(x + 2.2, top); s.lineTo(x + 0.5, top - 12); s.stroke();
  }
  const rails = [LEAF_B - h * 0.12, LEAF_B - h * 0.64, LEAF_B - h * 0.44];
  s.strokeStyle = iron; s.lineWidth = 7;
  for (const yy of rails.slice(0, 2)) { s.beginPath(); s.moveTo(x0, yy); s.lineTo(x0 + w, yy); s.stroke(); }
  s.lineWidth = 4;
  s.beginPath(); s.moveTo(x0, rails[2]); s.lineTo(x0 + w, rails[2]); s.stroke();
  s.strokeStyle = rgba(RIM, 0.4); s.lineWidth = 1.2;
  for (const yy of rails) { s.beginPath(); s.moveTo(x0, yy - 3); s.lineTo(x0 + w, yy - 3); s.stroke(); }
  // paired C-scrolls in each bay between the top rail and the mid rail, joined by a collar
  const yT = rails[1], yM = rails[2], cyy = (yT + yM) / 2, rr = (yM - yT) * 0.46;
  for (let i = 0; i < n; i++) {
    const bx = x0 + ((i + 0.5) / n) * w, bw = w / n;
    const rx = bw * 0.24, ry = rr * 0.95;
    s.strokeStyle = iron; s.lineWidth = 2.6;
    // two tall C-scrolls back to back, ")(" , their tips curled inward, a collar binding them
    for (const sd of [-1, 1]) {
      const ccx = bx + sd * rx * 1.02;
      s.beginPath();
      s.ellipse(ccx, cyy, rx, ry, 0, sd < 0 ? -1.35 : Math.PI - 1.35, sd < 0 ? 1.35 : Math.PI + 1.35);
      s.stroke();
      for (const vy of [-1, 1]) {
        const a = sd < 0 ? 1.35 * vy : Math.PI - 1.35 * vy;
        const ex = ccx + Math.cos(a) * rx, ey = cyy + Math.sin(a) * ry;
        s.beginPath(); s.arc(ex - sd * rx * 0.32, ey - vy * rx * 0.1, rx * 0.34, 0, TAU); s.stroke();
      }
      s.strokeStyle = rgba(RIM, 0.4); s.lineWidth = 0.9;
      s.beginPath(); s.ellipse(ccx, cyy, rx - 1.2, ry - 1.2, 0, sd < 0 ? -1.1 : Math.PI + 0.2, sd < 0 ? -0.2 : Math.PI + 1.1); s.stroke();
      s.strokeStyle = iron; s.lineWidth = 2.6;
    }
    s.fillStyle = iron;
    s.fillRect(bx - 3, cyy - 5, 6, 10);
    s.fillStyle = rgba(RIM, 0.5);
    s.fillRect(bx + 1.4, cyy - 5, 1, 10);
  }
}
const leafSprite = (mirror) => K.sprite(mirror ? "f05leafR" : "f05leafL", LEAF_W, LEAF_H, (s) => paintLeaf(s, mirror));
// draw a leaf swung by theta about its hinge (hx, by), true perspective strips: scaleX = cos(theta),
// the free edge recedes toward eye level so bars and spear tips stay consistent.
function drawLeaf(g, hx, by, sc, dir, theta, eyeY) {
  const spr = leafSprite(dir < 0);
  const N = theta > 0.02 ? 22 : 1;
  const k = Math.cos(theta), sn = Math.sin(theta);
  const pw = spr.width, ph = spr.height;
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N, um = (u0 + u1) / 2;
    const sv = 1 - 0.3 * sn * um;
    const xa = hx + dir * u0 * LEAF_W * sc * k, xb = hx + dir * u1 * LEAF_W * sc * k;
    const top = eyeY + (by - LEAF_B * sc - eyeY) * sv, bot = eyeY + (by + (LEAF_H - LEAF_B) * sc - eyeY) * sv;
    const sx = dir > 0 ? u0 * pw : (1 - u1) * pw;
    g.drawImage(spr, sx, 0, pw / N, ph, Math.min(xa, xb), top, Math.abs(xb - xa) + (N > 1 ? 0.7 : 0), bot - top);
  }
}
function ivy(g, x0, y0, x1, y1, seed, n) {
  const R = K.rng("f05ivy" + seed);
  g.strokeStyle = "#0c140c";
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 + 40, (y0 + y1) / 2, x1 - 40, (y0 + y1) / 2, x1, y1); g.stroke();
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const x = lerp(x0, x1, u) + (R() - 0.5) * 30, y = lerp(y0, y1, u) + (R() - 0.5) * 20;
    g.fillStyle = mix("#0e1a10", "#1e3020", R());
    g.beginPath(); g.ellipse(x, y, 6 + R() * 4, 4 + R() * 2, R() * 3, 0, TAU); g.fill();
    if (R() > 0.6) { g.fillStyle = rgba(RIM, 0.25); g.beginPath(); g.ellipse(x + 2, y - 2, 3, 1.4, 0.4, 0, TAU); g.fill(); }
  }
}
function gatepost(g, x, y, w, h) {
  const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  gr.addColorStop(0, "#140f1c");
  gr.addColorStop(0.7, "#251d32");
  gr.addColorStop(1, "#0a0710");
  g.fillStyle = gr;
  g.fillRect(x - w / 2, y - h, w, h);
  g.fillStyle = "#241b32";
  g.fillRect(x - w / 2 - 8, y - h - 14, w + 16, 16);
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 1;
  for (let yy = y - h + 24, r = 0; yy < y; yy += 26, r++) {
    g.beginPath(); g.moveTo(x - w / 2, yy); g.lineTo(x + w / 2, yy);
    const jx = x - w / 2 + (r % 2 ? w * 0.35 : w * 0.7);
    g.moveTo(jx, yy); g.lineTo(jx, yy + 26); g.stroke();
  }
  g.strokeStyle = rgba(RIM, 0.55);
  g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(x + w / 2, y - h); g.lineTo(x + w / 2, y); g.moveTo(x - w / 2 - 8, y - h - 14); g.lineTo(x + w / 2 + 8, y - h - 14); g.stroke();
}
// low-angle keystone: horizontal strips narrowed toward the top so verticals converge upward
function keystone(dst, src, w, h, topScale) {
  const N = Math.ceil(h), sh = h / N, pw = src.width, ph = src.height;
  for (let i = 0; i < N; i++) {
    const u = 1 - (i + 0.5) / N;
    const s = lerp(1, topScale, u);
    dst.drawImage(src, 0, (i / N) * ph, pw, ph / N, w / 2 - (w * s) / 2, i * sh, w * s, sh + 0.6);
  }
}
const GATE_H = 600;
function paintGates(s) {
  const T = scratch(LW, GATE_H);
  const c = T.g;
  gatepost(c, 140, 600, 104, 370);
  gatepost(c, 820, 600, 104, 370);
  drawLeaf(c, 192, 580, 0.9, 1, 0, 0);
  drawLeaf(c, 768, 580, 0.9, -1, 0, 0);
  c.strokeStyle = "#0a080e"; c.lineWidth = 4;
  for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(470 + i * 4, 330 + i * 10, 5, 8, 0.5, 0, TAU); c.stroke(); }
  c.fillStyle = "#1a1620"; c.fillRect(468, 392, 26, 22);
  c.strokeStyle = rgba(RIM, 0.45); c.lineWidth = 1; c.strokeRect(468, 392, 26, 22);
  ivy(c, 100, 590, 300, 300, 1, 26);
  ivy(c, 870, 570, 690, 330, 2, 22);
  // the stone gargoyle sits on the left post (fully in frame: it plants shot 6)
  c.drawImage(gargoyle(false), 140 - 60, 230 - 14 - 100, 120, 100);
  // a stone ball finial on the right post
  const bg = c.createRadialGradient(830, 196, 2, 820, 204, 20);
  bg.addColorStop(0, "#3c3448"); bg.addColorStop(1, "#0e0a16");
  c.fillStyle = bg; c.beginPath(); c.arc(820, 200, 18, 0, TAU); c.fill();
  keystone(s, T.c, LW, GATE_H, 0.66);
}
function crow(g, x, y, s, flap) {
  g.save();
  g.translate(x, y);
  g.fillStyle = "#050409";
  g.beginPath(); g.ellipse(0, 0, s, s * 0.42, -0.2, 0, TAU); g.fill();
  g.beginPath(); g.arc(s * 0.9, -s * 0.35, s * 0.32, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(s * 1.15, -s * 0.38); g.lineTo(s * 1.6, -s * 0.3); g.lineTo(s * 1.15, -s * 0.2); g.fill();
  g.beginPath(); g.moveTo(-s * 0.8, 0); g.lineTo(-s * 1.6, s * 0.3); g.lineTo(-s * 1.5, -s * 0.1); g.fill();
  const f = Math.sin(flap);
  g.beginPath(); g.moveTo(-s * 0.2, -s * 0.2); g.quadraticCurveTo(-s * 0.4, -s * (0.4 + 1.6 * f), s * 0.6, -s * (0.2 + 1.8 * f)); g.lineTo(s * 0.4, -s * 0.1); g.fill();
  g.strokeStyle = rgba(RIM, 0.4); g.lineWidth = 0.8;
  g.beginPath(); g.ellipse(0, 0, s, s * 0.42, -0.2, -2.4, -0.8); g.stroke();
  g.restore();
}
function shotGates(g, t, lt) {
  const p = eio(seg(lt, 0, 10));
  K.withCamera(g, LW, LH, { x: 480, y: lerp(282, 272, p), zoom: lerp(1.0, 1.05, p), shakeT: t, shakeAmt: 0.8 }, (c) => {
    c.drawImage(K.sprite("f05sky", LW, LH, paintSkyV), 0, -60, LW, LH + 60);
    K.moon(c, 560, 150, 52, { glow: 1.2, halo: "#b8a8ff" });
    K.clouds(c, LW, LH, t * 2.2 + 8, { seed: 33, color: "#5a4a7a", shade: "#1a1030", count: 6, y: 120, spread: 80, speed: 26, alpha: 0.7 });
    // the manor, small and far behind, just over a low horizon (camera at the foot of the gate)
    c.drawImage(K.sprite("f05manor2", 600, 300, paintManor), 480 - 150, 372 - 150, 300, 150);
    candlesSmall(c, t);
    c.fillStyle = "#0a0612";
    c.fillRect(-40, 370, LW + 80, 220);
    c.fillStyle = rgba(RIM, 0.25); c.fillRect(-40, 370, LW + 80, 1.2);
    K.fog(c, LW, LH, { y: 372, h: 70, color: "#4a3466", alpha: 0.7, t: t * 1.4, seed: 8 });
    // the gate assembly (keystoned once: posts and bars converge upward)
    c.drawImage(K.sprite("f05gates", LW, GATE_H, paintGates), 0, LH - GATE_H, LW, GATE_H);
    // a crow lifts off the right post at ~13 s
    const fly = seg(lt, 3.0, 9);
    const cx = lerp(758, 1040, fly * fly), cy = lerp(118, -110, fly) - Math.sin(fly * Math.PI) * 30;
    crow(c, cx, cy, 10 + fly * 4, fly > 0 ? lt * 15 : 0.15);
    // a moving fog band at bar-bottom height, drifting between the bars and in front
    K.fog(c, LW, LH, { y: 500, h: 110, color: "#4a3466", alpha: 0.55, t: t * 4, seed: 12 });
    groundFog(c, t, 520, 13, 0.6);
  });
}
function candlesSmall(c, t) {
  const fl = 0.85 + 0.15 * Math.sin(t * 6.3) * Math.sin(t * 2.1);
  for (const [x, y] of [[420, 311], [520, 311], [388, 331], [598, 324], [427, 241]]) glow(c, x, y + 7, 11, CANDLE, 0.5 * fl);
}

// ---- the gargoyle: a stone cat (no fur, no whiskers), carved wings, a handlebar moss moustache ---------
function paintGargoyle(s, lit) {
  const gx = 260, gy = 420, gs = 150;
  const T = scratch(520, 440);
  const c = T.g;
  // carved bat wings with ridge shading
  for (const sd of [-1, 1]) {
    const wp = new Path2D();
    wp.moveTo(gx + sd * 26, gy - 170);
    wp.quadraticCurveTo(gx + sd * 150, gy - 290, gx + sd * 200, gy - 175);
    wp.quadraticCurveTo(gx + sd * 176, gy - 160, gx + sd * 170, gy - 130);
    wp.quadraticCurveTo(gx + sd * 150, gy - 128, gx + sd * 140, gy - 98);
    wp.quadraticCurveTo(gx + sd * 118, gy - 100, gx + sd * 104, gy - 66);
    wp.quadraticCurveTo(gx + sd * 60, gy - 100, gx + sd * 26, gy - 170);
    const wg = c.createLinearGradient(gx, gy - 280, gx + sd * 200, gy - 80);
    wg.addColorStop(0, "#5a5660"); wg.addColorStop(1, "#34313a");
    c.fillStyle = wg; c.fill(wp);
    // ridges (finger bones): a dark groove and a lit edge beside it
    for (const [ex, ey] of [[200, -175], [170, -130], [140, -98], [104, -66]]) {
      c.lineCap = "round";
      c.strokeStyle = "rgba(20,18,26,0.7)"; c.lineWidth = 5;
      c.beginPath(); c.moveTo(gx + sd * 36, gy - 176); c.quadraticCurveTo(gx + sd * (ex * 0.6), gy + (ey - 60) * 0.9, gx + sd * ex, gy + ey); c.stroke();
      c.strokeStyle = "rgba(170,170,190,0.45)"; c.lineWidth = 1.8;
      c.beginPath(); c.moveTo(gx + sd * 36, gy - 180); c.quadraticCurveTo(gx + sd * (ex * 0.6), gy + (ey - 64) * 0.9, gx + sd * ex, gy + ey - 4); c.stroke();
    }
  }
  // the cat body: drawn at a small size (lod 0: no fur strokes, no whiskers) then scaled up
  c.save();
  c.translate(gx, gy);
  c.scale(gs / 30, gs / 30);
  K.drawCat(c, 0, 0, 30, { pose: "sit", facing: 1, coat: STONE, headTurn: 0.85, headTilt: -0.05, t: 0, collar: false, bell: false, shadow: false, blink: 0.35, ears: 0.4, light: { x: 900, y: -300, color: RIM, strength: 1.4 } });
  c.restore();
  // stone texture only where there is stone: grit, pits, lichen, cracks, rain streaks
  c.save();
  c.globalCompositeOperation = "source-atop";
  const R = K.rng("garg-stone");
  for (let i = 0; i < 1600; i++) {
    const x = R() * 520, y = R() * 440, v = R();
    c.fillStyle = v > 0.5 ? `rgba(200,198,210,${0.08 + R() * 0.1})` : `rgba(10,8,14,${0.12 + R() * 0.18})`;
    c.fillRect(x, y, 1 + R() * 2, 1 + R() * 2);
  }
  for (let i = 0; i < 26; i++) {
    c.fillStyle = rgba(mix("#6a7a3a", "#b0b060", R()), 0.25 + R() * 0.2);
    c.beginPath(); c.ellipse(gx - 150 + R() * 300, gy - 260 + R() * 260, 4 + R() * 9, 3 + R() * 6, R() * 3, 0, TAU); c.fill();
  }
  const sg = c.createLinearGradient(0, gy - 300, 0, gy);
  sg.addColorStop(0, "rgba(0,0,0,0)"); sg.addColorStop(1, "rgba(10,8,16,0.4)");
  c.fillStyle = sg; c.fillRect(0, 0, 520, 440);
  c.strokeStyle = "rgba(24,22,30,0.6)"; c.lineWidth = 1.3;
  for (let i = 0; i < 12; i++) { const x = gx - 70 + R() * 140, y = gy - 230 + R() * 210; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (R() - 0.5) * 16, y + 10 + R() * 18); c.lineTo(x + (R() - 0.5) * 20, y + 26 + R() * 20); c.stroke(); }
  c.strokeStyle = "rgba(20,18,26,0.18)"; c.lineWidth = 2;
  for (let i = 0; i < 18; i++) { const x = gx - 90 + R() * 180; c.beginPath(); c.moveTo(x, gy - 240 + R() * 80); c.lineTo(x + (R() - 0.5) * 3, gy - 20); c.stroke(); }
  c.restore();
  // the moss moustache: a fat, curled handlebar clump under the nose
  const nx = gx + gs * 0.33, ny = gy - gs * 1.49;
  for (const sd of [-1, 1]) {
    const pts = [];
    for (let k = 0; k <= 22; k++) {
      const u = k / 22;
      if (u < 0.7) { const v = u / 0.7; pts.push([nx + sd * (4 + v * 46), ny + 6 + Math.sin(v * Math.PI) * 7 - v * v * 4, lerp(10, 6, v)]); }
      else { const v = (u - 0.7) / 0.3, a = Math.PI * 0.5 + v * Math.PI * 1.5; pts.push([nx + sd * (50 + Math.cos(a) * -10 * (1 - v * 0.4)) , ny + 2 - 10 - Math.sin(a) * 10 * (1 - v * 0.4) + 10, lerp(6, 3, v)]); }
    }
    for (const [x, y, r] of pts) { c.fillStyle = "#1e3014"; c.beginPath(); c.arc(x + 1, y + 2, r, 0, TAU); c.fill(); }
    pts.forEach(([x, y, r], k) => { c.fillStyle = mix("#3a5a22", "#6f9a3a", hash(k + sd * 7, 3)); c.beginPath(); c.arc(x, y, r * 0.92, 0, TAU); c.fill(); });
    pts.forEach(([x, y, r], k) => { if (k % 2) return; c.fillStyle = "rgba(190,230,120,0.45)"; c.beginPath(); c.arc(x - r * 0.25, y - r * 0.4, r * 0.35, 0, TAU); c.fill(); });
  }
  s.drawImage(T.c, 0, 0, 520, 440);
  if (!lit) {
    // moonlit stone: dark overall, a cool sheen toward the moon (upper right)
    s.save();
    s.globalCompositeOperation = "source-atop";
    s.fillStyle = "rgba(12,8,22,0.72)"; s.fillRect(0, 0, 520, 440);
    const mg = s.createLinearGradient(520, 0, 200, 300);
    mg.addColorStop(0, "rgba(160,180,240,0.22)"); mg.addColorStop(1, "rgba(160,180,240,0)");
    s.fillStyle = mg; s.fillRect(0, 0, 520, 440);
    s.restore();
  }
}
const gargoyle = (lit) => K.sprite(lit ? "f05gargL" : "f05gargD", 520, 440, (s) => paintGargoyle(s, lit));

// ---- the figures in the fog ------------------------------------------------------------------------
// the Shadow: a tall thin smoky silhouette (no fur, no whiskers), soft-edged, a cold moon rim on top.
const SH_W = 160, SH_H = 200, SH_BASE = 188, SH_REF = 60;
function shadowSprite(b) {
  return K.sprite("f05shadow" + b, SH_W, SH_H, (s) => {
    const make = (color) => {
      const T = scratch(SH_W, SH_H);
      T.g.translate(SH_W / 2, SH_BASE);
      T.g.scale((SH_REF / 30) * 0.6, (SH_REF / 30) * 1.4);
      K.drawCat(T.g, 0, 0, 30, { pose: "walk", phase: b / 12, facing: 1, coat: SHADOW, t: 0, headTurn: -0.5, collar: false, bell: false, shadow: false, ears: 0.6, tail: 0.5 });
      T.g.setTransform(1, 0, 0, 1, 0, 0);
      T.g.globalCompositeOperation = "source-in";
      T.g.fillStyle = color;
      T.g.fillRect(0, 0, T.c.width, T.c.height);
      return T.c;
    };
    const f = K.hasFilter(), ps = K.pixelScale();
    if (f) s.filter = `blur(${(1.2 * ps).toFixed(1)}px)`;
    s.drawImage(make("#c8dcff"), -1, -2.6, SH_W, SH_H);
    if (f) s.filter = `blur(${(3 * ps).toFixed(1)}px)`;
    s.drawImage(make("#08070f"), 0, 0, SH_W, SH_H);
    s.filter = "none";
  });
}
function shadowFigure(g, x, y, size, t, phase, alpha) {
  if (alpha <= 0.01) return;
  const sc = size / SH_REF;
  g.save();
  g.globalAlpha *= alpha;
  // smoke wisps rising and drifting back off it
  for (let i = 0; i < 9; i++) {
    const age = (t * 0.3 + i / 9) % 1;
    const sx = x - size * 0.5 + hash(i, 3) * size * 0.9 - age * size * 0.7, sy = y - size * (0.7 + hash(i, 4) * 0.9) - age * size * 1.5;
    glow(g, sx, sy, size * (0.45 + age * 0.8), "#3a2c55", 0.42 * Math.sin(age * Math.PI), "source-over");
  }
  glow(g, x, y - size * 1.3, size * 1.6, RIM, 0.12);
  const b = ((Math.floor(phase * 12) % 12) + 12) % 12;
  g.globalAlpha *= 0.85;
  g.drawImage(shadowSprite(b), x - (SH_W / 2) * sc, y - SH_BASE * sc, SH_W * sc, SH_H * sc);
  g.restore();
}
function drivePrints(c, sB, sz) {
  // 5-6 clear prints behind Biscuit, spaced a stride apart, alternating left/right
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const s = sB - sz * 0.45 - i * sz * 0.62;
    if (s < 0) break;
    const P = driveS(s), psz = figSize(P.u);
    const side = i % 2 ? 1 : -1;
    const nx = -Math.sin(P.ang), ny = Math.cos(P.ang);
    pts.push({ x: P.x + nx * side * psz * 0.16, y: P.y + ny * side * psz * 0.16, a: P.ang + Math.PI / 2, s: Math.max(2.2, psz * 0.2), alpha: clamp(1 - i * 0.15), flat: 0.5 });
  }
  K.pawprints(c, pts, 0.8);
}
function driveFigures(c, t, lt, o) {
  // Biscuit and, ahead, the Shadow, walking AWAY up the drive (rear three-quarter), getting smaller
  const sB = o.s;
  const B = driveS(sB), sz = figSize(B.u);
  const S = driveS(sB + 34), ssz = figSize(S.u) * 1.9;
  const stop = o.stop || 0;
  drivePrints(c, sB, sz);
  // backlight: the fog right behind them glows from the moon / the door
  glow(c, (B.x + S.x) / 2, B.y - sz * 1.6, sz * 5, "#8a7ab8", 0.22);
  shadowFigure(c, S.x, S.y, ssz, lt, S.q * 0.7 + 0.3, o.shadowA == null ? 1 : o.shadowA);
  K.fog(c, LW, LH, { y: S.y + 2, h: 26, color: "#4a3466", alpha: 0.6, t: t * 4, seed: 61, wisps: false });
  if (o.pool > 0) { c.save(); c.translate(B.x - 2, B.y + 1); c.scale(1, 0.32); glow(c, 0, 0, sz * 3, "#ffe2a8", 0.55 * o.pool); c.restore(); }
  c.save();
  c.translate(B.x, B.y);
  c.scale(lerp(0.78, 1, stop), 1);
  const lit = o.lit || 0;
  K.drawCat(c, 0, 0, sz, {
    pose: stop > 0.5 ? "stand" : "walk", phase: o.phase == null ? B.q : o.phase, facing: 1, t: lt, bell: true, collar: true,
    headTurn: lerp(-0.55, 0.95, stop), ears: lerp(0.3, -0.2, stop) + Math.sin(lt * 5) * 0.3 * stop, pupil: 0.9,
    light: lit > 0.3 ? { x: 120 - B.x, y: 560 - B.y, color: "#fff0cc", strength: 1.8 * lit } : { x: 260, y: -420, color: RIM, strength: 1.4 },
  });
  c.restore();
  // fog over his lower legs (instead of a per-frame tinted offscreen)
  K.fog(c, LW, LH, { y: B.y - 1, h: sz * 0.9, color: "#3a2650", alpha: lerp(0.55, 0.25, lit), t: t * 3, seed: 62, wisps: false });
  if (o.eyes > 0) {
    // the tapetum flash: two small green-gold points with a tight bloom
    const hx = B.x + sz * 0.62 * lerp(0.78, 1, stop), hy = B.y - sz * 1.08;
    for (const dx of [-sz * 0.07, sz * 0.07]) {
      glow(c, hx + dx, hy, 3.2, "#c8ff7a", 0.8 * o.eyes);
      glow(c, hx + dx, hy, 1.2, "#ffffff", o.eyes);
    }
  }
}
function driveBG() {
  return softSprite("f05driveBG", LW, LH, 1.4, (f) => manorScene(f, 14, 14, { moonX: 640, moonY: 165, moonR: 55 }));
}
function driveScene(c, t, lt, o) {
  c.drawImage(driveBG(), 0, 0, LW, LH);
  // live: clouds sliding over the moon, candles breathing, the door
  K.clouds(c, LW, LH, t * 1.6 + 50, { seed: 37, color: "#4a3a6a", shade: "#1a1030", count: 3, y: 120, spread: 40, speed: 12, alpha: 0.4 });
  candles(c, t);
  if (o.door) doorCrack(c, t, o.door);
  K.fog(c, LW, LH, { y: 352, h: 90, color: "#5a4078", alpha: 0.4, t: t * 1.2, seed: 21 });
  if (o.figures !== false) driveFigures(c, t, lt, o);
  groundFog(c, t, 440, 22, 0.5);
  K.fog(c, LW, LH, { y: 470, h: 160, color: "#3a2650", alpha: 0.55, t: t * 2, seed: 23, fill: true });
}
function barsForeground(f, xs, blurDark) {
  for (const x of xs) {
    f.fillStyle = blurDark;
    f.fillRect(x - 13, -20, 26, LH + 40);
    f.fillStyle = "rgba(188,214,255,0.35)";
    f.fillRect(x + 9, -20, 3, LH + 40);
  }
  f.fillStyle = blurDark;
  f.fillRect(-20, 120, LW + 40, 18);
}
const S_SHOT3 = [118, 196], S_SHOT4 = [196, 214];
function shotThroughBars(g, t, lt) {
  const p = eio(seg(lt, 0, 10));
  const s = lerp(S_SHOT3[0], S_SHOT3[1], seg(lt, 0, 10));
  K.withCamera(g, LW, LH, { x: lerp(476, 482, p), y: lerp(312, 302, p), zoom: lerp(1.2, 1.3, p), shakeT: t, shakeAmt: 1.1 }, (c) => {
    driveScene(c, t, lt, { s });
  });
  g.drawImage(K.sprite("f05barsS", LW, LH, (s2) => { if (K.hasFilter()) s2.filter = "blur(10px)"; barsForeground(s2, [150, 330, 640, 820], "#05030a"); s2.filter = "none"; }), 0, 0, LW, LH);
}
function shotFlashlight(g, t, lt) {
  const hit = eio(seg(lt, 0, 0.9));
  const stop = eio(seg(lt, 1.0, 3.4));
  const s = lerp(S_SHOT4[0], S_SHOT4[1], eio(seg(lt, 0, 3.0)));
  const B = driveS(s);
  const eyes = K.env(lt, 1.6, 7.5, 0.25, 1.5) * (0.75 + 0.25 * Math.sin(lt * 3));
  K.withCamera(g, LW, LH, { x: B.x + 10, y: B.y - 30, zoom: lerp(2.3, 2.7, eio(seg(lt, 0, 8))), shakeT: t, shakeAmt: 1.3 + (1 - hit) * 3 }, (c) => {
    driveScene(c, t, lt, { s, stop, eyes, lit: hit, pool: hit });
    // the flashlight beam up the drive, landing on him
    const tx = B.x, ty = B.y - 10;
    const ang = Math.atan2(ty - 560, tx - 240) - 0.03 * Math.sin(lt * 1.3) * (1 - hit) + lerp(-0.15, 0, hit);
    K.flashlightBeam(c, 240, 560, ang, Math.hypot(tx - 240, ty - 560) + 40, { spread: 0.16, alpha: 0.2 * hit + 0.03 });
  });
  g.drawImage(K.sprite("f05barsS2", LW, LH, (s2) => { if (K.hasFilter()) s2.filter = "blur(12px)"; barsForeground(s2, [80, 880], "#05030a"); s2.filter = "none"; }), 0, 0, LW, LH);
}

// ---- shot 5: over your shoulder, pushing the gate open -----------------------------------------------
const PG = { camX: 480, camY: 280, eye: 300 };
function shotPushGate(g, t, lt) {
  const theta = eio(seg(lt, 1.0, 6.0)) * 0.7;
  const p = eio(seg(lt, 0, 10));
  const z = lerp(1.0, 1.08, p);
  const toScreen = (x, y) => [(x - PG.camX) * z + LW / 2, (y - PG.camY) * z + LH / 2];
  K.withCamera(g, LW, LH, { x: PG.camX, y: PG.camY, zoom: z, shakeT: t, shakeAmt: 0.9 }, (c) => {
    driveScene(c, t, lt, { figures: false, door: K.env(lt, 3, 20, 2, 0.1) });
    // fog rolls in through the widening gap toward camera
    const gapX = 175 + 305 * Math.cos(theta) * 0.5 + 150;
    c.save(); c.translate(gapX, 430); c.scale(1.6, 0.5);
    glow(c, 0, 0, 120 + theta * 160, "#5a4078", 0.5 * theta, "source-over");
    c.restore();
    K.fog(c, LW, LH, { y: 470 + theta * 30, h: 200, color: "#4a3466", alpha: 0.45 + 0.2 * theta, t: t * 2.4 + theta * 60, seed: 31, fill: true });
    gatepost(c, 120, 590, 110, 520);
    gatepost(c, 850, 590, 110, 520);
    drawLeaf(c, 795, 570, 0.98, -1, 0, PG.eye);
    drawLeaf(c, 175, 570, 0.98, 1, theta, PG.eye);
    groundFog(c, t, 560, 33, 0.5);
  });
  // you, from behind on the right, reaching LEFT: left arm bent at the elbow, palm on a bar of the
  // moving leaf, the brass bell on that wrist
  const lean = eio(seg(lt, 0.6, 5)) * -34;
  const kx = 660 + lean, ky = 930, kh = 720, u = kh / 100;
  const k = Math.cos(theta), sv = 1 - 0.3 * Math.sin(theta) * 0.9;
  const barWX = 175 + 0.62 * LEAF_W * 0.98 * k, barWY = PG.eye + (570 - LEAF_BH * 0.5 * 0.98 - PG.eye) * sv;
  const [hxT, hyT] = toScreen(barWX, barWY);
  const shx = kx - u * 13, shy = ky - u * 76;
  const l1 = u * 15, l2 = u * 14;
  const d = Math.hypot(hxT - shx, hyT - shy), maxR = (l1 + l2) * 0.98;
  const hx = d > maxR ? shx + ((hxT - shx) / d) * maxR : hxT, hy = d > maxR ? shy + ((hyT - shy) / d) * maxR : hyT;
  const [ex, ey] = K.ik(shx, shy, hx, hy, l1, l2, -1);
  const light = { x: 700, y: 60, color: RIM, strength: 0.6 };
  K.drawPerson(g, kx, ky, kh, { view: "back", hood: false, bell: false, t: lt, light, shadow: false });
  softHair(g, kx, ky - 91.5 * u, u);
  // the sleeve: shoulder -> elbow -> wrist, tapered, shaded with the coat
  const arm = new Path2D();
  K.tube(arm, [shx + u * 2, shy + u * 3, ex, ey, hx + u * 1.5, hy + u * 1.5], [u * 6.6, u * 5.4, u * 4.4], 6);
  const ag = g.createLinearGradient(shx, shy - u * 8, shx, shy + u * 12);
  ag.addColorStop(0, "#e2b52a"); ag.addColorStop(1, "#8a6a10");
  g.fillStyle = ag; g.fill(arm);
  g.save(); g.clip(arm);
  g.strokeStyle = "rgba(90,60,0,0.45)"; g.lineWidth = u * 0.6;
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(ex + u * (i - 1) * 3, ey + u * 2, u * 4, Math.PI * 1.1, Math.PI * 1.7); g.stroke(); }
  g.restore();
  K.crescent(g, arm, -u * 0.35, u * 0.8, RIM, 0.4, [Math.min(shx, ex, hx) - u * 8, Math.min(shy, ey, hy) - u * 8, Math.max(shx, ex, hx) + u * 8, Math.max(shy, ey, hy) + u * 8]);
  K.drawHand(g, hx, hy, u * 13, { pose: "reach", left: true, angle: Math.atan2(hy - ey, hx - ex) - 0.18, bell: true, t: lt, sleeve: "#c89a18", light: { x: 700, y: 60, color: RIM, strength: 0.8 } });
  K.vignette(g, LW, LH, 0.3);
}
function softHair(g, x, y, u) {
  // a soft brown crown over the back of the head (no spikes), with a few strands catching the moon
  g.save();
  const hg = g.createLinearGradient(x, y - u * 9, x, y + u * 7);
  hg.addColorStop(0, "#6e4a2c"); hg.addColorStop(1, "#3a2414");
  g.fillStyle = hg;
  g.beginPath();
  g.moveTo(x - u * 8.4, y + u * 4);
  g.bezierCurveTo(x - u * 9.6, y - u * 7, x - u * 4, y - u * 10.2, x + u * 0.6, y - u * 9.8);
  g.bezierCurveTo(x + u * 6, y - u * 9.8, x + u * 9.6, y - u * 6, x + u * 8.6, y + u * 4);
  g.quadraticCurveTo(x + u * 6, y + u * 7.8, x + u * 2, y + u * 6.8);
  g.quadraticCurveTo(x, y + u * 8.2, x - u * 2.4, y + u * 6.8);
  g.quadraticCurveTo(x - u * 6.4, y + u * 7.6, x - u * 8.4, y + u * 4);
  g.fill();
  g.clip();
  const R = K.rng("f05hair");
  g.lineWidth = u * 0.32;
  for (let i = 0; i < 70; i++) {
    const sx = x + (R() - 0.5) * u * 16, sy = y - u * 9 + R() * u * 4;
    g.strokeStyle = R() > 0.7 ? "rgba(188,214,255,0.22)" : `rgba(${R() > 0.5 ? "130,90,56" : "40,24,12"},0.5)`;
    g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + (sx - x) * 0.15, sy + u * 7, sx + (sx - x) * 0.25 + (R() - 0.5) * u, sy + u * 14);
    g.stroke();
  }
  const rg = g.createLinearGradient(x + u * 9, y - u * 9, x, y);
  rg.addColorStop(0, "rgba(188,214,255,0.28)"); rg.addColorStop(1, "rgba(188,214,255,0)");
  g.fillStyle = rg; g.fillRect(x - u * 10, y - u * 11, u * 20, u * 20);
  g.restore();
}

// ---- shot 6: the gargoyle and its moss moustache ---------------------------------------------------
function shotGargoyle(g, t, lt) {
  const fl = K.flash(lt, [0.2, 0.32, 0.62], 0.1);
  const moon = clamp(seg(lt, 0.9, 2.6));
  const p = eio(seg(lt, 0, 8));
  K.withCamera(g, LW, LH, { x: 480, y: 270, zoom: lerp(1.0, 1.08, p), shakeT: t, shakeAmt: 0.9 + fl * 4 }, (c) => {
    c.drawImage(K.sprite("f05sky", LW, LH, paintSkyV), 0, -40, LW, LH + 40);
    K.moon(c, 760, 110, 50, { glow: 1, halo: "#b8a8ff" });
    K.clouds(c, LW, LH, t * 2, { seed: 41, color: "#5a4a7a", shade: "#1a1030", count: 5, y: 160, spread: 70, speed: 30, alpha: 0.7 });
    bolt(c, 860, 20, 900, 300, 9, fl);
    // the gatepost top (big, close)
    const k = Math.max(fl, moon * 0.25);
    c.fillStyle = mix("#140f1c", "#5a5462", k);
    c.fillRect(290, 400, 380, 200);
    c.fillStyle = mix("#1c1428", "#6a6472", k);
    c.fillRect(270, 384, 420, 26);
    c.fillStyle = rgba(RIM, 0.25 + 0.3 * moon);
    c.fillRect(270, 384, 420, 2);
    for (let i = 0; i < 18; i++) { c.fillStyle = rgba(mix("#3a5a2a", "#6a8a3a", hash(i, 2)), 0.5 * (0.3 + k)); c.beginPath(); c.ellipse(290 + hash(i, 3) * 380, 388 + hash(i, 4) * 18, 6 + hash(i, 5) * 10, 3, 0, 0, TAU); c.fill(); }
    // dark stone until the flash, then cool moonlight (the lit version fades back down)
    const gx = 480 - 260, gy = 392 - 420;
    c.drawImage(gargoyle(false), gx, gy, 520, 440);
    const litA = Math.max(fl, 0.3 * moon);
    if (litA > 0.01) { c.save(); c.globalAlpha = litA; c.drawImage(gargoyle(true), gx, gy, 520, 440); c.restore(); }
    K.fog(c, LW, LH, { y: 520, h: 120, color: "#3a2650", alpha: 0.55, t: t * 2, seed: 44 });
  });
  frameFlash(g, fl);
}

// ---- shot 7: the doorstep, low and off-axis; the door is open a crack ---------------------------------
const VPX = 2400, VPY = 330; // the facade recedes to the right (about 15 degrees off-axis)
const wallY = (x, y0) => VPY + (y0 - VPY) * (VPX - x) / (VPX - 220);
function paintDoorstep(s) {
  paintSkyV(s);
  K.moon(s, 120, 110, 30, { glow: 0.9, halo: "#b8a8ff" });
  // the facade plane: from x = 220 to beyond the frame
  const top = (x) => wallY(x, -40), bot = (x) => wallY(x, 470);
  const wg = s.createLinearGradient(220, 0, LW, 0);
  wg.addColorStop(0, "#1e1630"); wg.addColorStop(1, "#110b1c");
  s.fillStyle = wg;
  s.beginPath(); s.moveTo(220, top(220)); s.lineTo(LW + 40, top(LW + 40)); s.lineTo(LW + 40, bot(LW + 40)); s.lineTo(220, bot(220)); s.fill();
  // stone courses converging to the right
  s.strokeStyle = "rgba(0,0,0,0.38)"; s.lineWidth = 1;
  for (let y0 = -40, r = 0; y0 < 470; y0 += 24, r++) {
    s.beginPath(); s.moveTo(220, wallY(220, y0)); s.lineTo(LW + 40, wallY(LW + 40, y0)); s.stroke();
    for (let x = 220 + (r % 2) * 30; x < LW + 40; x += 60 * (1 - (x - 220) / 3000)) { s.beginPath(); s.moveTo(x, wallY(x, y0)); s.lineTo(x, wallY(x, y0 + 24)); s.stroke(); }
  }
  // the corner edge catches the moon
  s.fillStyle = "rgba(188,214,255,0.5)"; s.fillRect(219, top(220), 2.4, bot(220) - top(220));
  const cg = s.createLinearGradient(220, 0, 300, 0);
  cg.addColorStop(0, "rgba(160,180,240,0.18)"); cg.addColorStop(1, "rgba(160,180,240,0)");
  s.fillStyle = cg; s.fillRect(220, 0, 80, LH);
  // the pointed door arch with a moulded stone frame
  const dx0 = 500, dx1 = 612, dTop = 170;
  const arch = (p, inset) => {
    const a = dx0 + inset, b = dx1 - inset * 0.9;
    p.moveTo(a, wallY(a, 470)); p.lineTo(a, wallY(a, dTop + 60 + inset));
    p.quadraticCurveTo(a + 4, wallY(a, dTop + inset), (a + b) / 2, wallY((a + b) / 2, dTop - 20 + inset));
    p.quadraticCurveTo(b - 3, wallY(b, dTop + inset), b, wallY(b, dTop + 60 + inset)); p.lineTo(b, wallY(b, 470)); p.closePath();
  };
  const fr = new Path2D(); arch(fr, -16);
  s.fillStyle = "#2c2240"; s.fill(fr);
  s.strokeStyle = "rgba(188,214,255,0.4)"; s.lineWidth = 1.5; s.stroke(fr);
  const dp = new Path2D(); arch(dp, 0);
  s.fillStyle = "#1a0f0a"; s.fill(dp);
  s.save(); s.clip(dp);
  for (let x = dx0; x < dx1; x += 14) { s.fillStyle = (x / 14) % 2 ? "#24150d" : "#1c100a"; s.fillRect(x, 0, 13, LH); s.fillStyle = "rgba(0,0,0,0.5)"; s.fillRect(x + 12, 0, 1.5, LH); }
  s.fillStyle = "#3a2a1a"; for (const yy of [260, 380]) s.fillRect(dx0, yy, dx1 - dx0, 6);
  s.restore();
  // a dark side window with a candle, ivy, an unlit lantern
  s.fillStyle = "#2a1c10"; s.fillRect(330, wallY(330, 230), 50, 90);
  s.fillStyle = "#4a3016"; s.fillRect(334, wallY(334, 236), 42, 80);
  ivy(s, 230, 470, 330, 120, 7, 30);
  ivy(s, 700, 470, 760, 160, 8, 24);
  s.fillStyle = "#0c0814"; s.fillRect(660, wallY(660, 200), 16, 30); s.fillRect(666, wallY(666, 180), 4, 20);
  // three worn steps widening toward camera
  for (let i = 0; i < 3; i++) {
    const y = 470 + i * 22, x0 = 470 - i * 34, x1 = 650 + i * 30;
    s.fillStyle = mix("#2a2238", "#1a1424", i / 3);
    s.fillRect(x0, y, x1 - x0, 22);
    s.fillStyle = "rgba(188,214,255,0.28)"; s.fillRect(x0, y, x1 - x0, 1.6);
    s.fillStyle = "rgba(0,0,0,0.35)"; s.fillRect(x0, y + 18, x1 - x0, 4);
  }
  // gravel in front
  const gg = s.createLinearGradient(0, 520, 0, LH);
  gg.addColorStop(0, "#1a1426"); gg.addColorStop(1, "#0a0712");
  s.fillStyle = gg; s.fillRect(0, 536, LW, 10);
  s.fillStyle = "#120c1c"; s.beginPath(); s.moveTo(0, LH); s.lineTo(0, 500); s.lineTo(220, 470); s.lineTo(380, 536); s.lineTo(LW, 536); s.lineTo(LW, LH); s.fill();
}
function shotWalkUp(g, t, lt) {
  const p = eio(seg(lt, 0, 8));
  const walk = seg(lt, 0, 7.5);
  const crack = lerp(4, 16, eio(seg(lt, 1, 6)));
  const fl = 0.9 + 0.1 * Math.sin(t * 7.1) * Math.sin(t * 2.3);
  K.withCamera(g, LW, LH, { x: lerp(470, 500, p), y: lerp(300, 290, p), zoom: lerp(1.0, 1.08, p), shakeT: t, shakeAmt: 1 }, (c) => {
    c.drawImage(K.sprite("f05door", LW, LH, paintDoorstep), 0, 0, LW, LH);
    glow(c, 355, wallY(355, 276), 40, CANDLE, 0.45 * fl);
    // the crack of warm light between the leaves, with bloom
    const cx = 560;
    const top = wallY(cx, 175), bot = wallY(cx, 470);
    const cgr = c.createLinearGradient(cx - crack, 0, cx + crack, 0);
    cgr.addColorStop(0, "rgba(255,190,110,0.6)"); cgr.addColorStop(0.5, "#fff0c8"); cgr.addColorStop(1, "rgba(255,190,110,0.6)");
    c.fillStyle = cgr;
    c.beginPath(); c.moveTo(cx - crack * 0.3, top + 8); c.lineTo(cx + crack * 0.7, top + 14); c.lineTo(cx + crack, bot); c.lineTo(cx - crack * 0.4, bot); c.fill();
    glow(c, cx + crack * 0.3, (top + bot) / 2, 140 + crack * 4, CANDLE, 0.45 * fl);
    glow(c, cx + crack * 0.3, (top + bot) / 2, 50, "#fff0c8", 0.5 * fl);
    // a wedge of light spilling down the steps toward you
    c.save();
    c.globalCompositeOperation = "lighter";
    const wg = c.createLinearGradient(0, bot, 0, LH);
    wg.addColorStop(0, `rgba(255,180,90,${0.45 * fl})`); wg.addColorStop(1, "rgba(255,180,90,0)");
    c.fillStyle = wg;
    c.beginPath(); c.moveTo(cx - crack * 0.4, bot); c.lineTo(cx + crack, bot); c.lineTo(cx + 40 + crack * 8, LH + 10); c.lineTo(cx - 120 - crack * 4, LH + 10); c.fill();
    c.restore();
    // you walk up toward the door: from behind, hood up, its edge rimmed warm by the crack
    const kx = lerp(330, 488, walk), ky = lerp(640, 512, Math.pow(walk, 0.8)), kh = lerp(420, 240, Math.pow(walk, 0.8));
    K.drawPerson(c, kx, ky, kh, { view: "back", walk: true, phase: lt * 0.85, hood: true, bell: true, t: lt, light: { x: cx, y: (top + bot) / 2, color: "#ffc070", strength: 1.6 } });
    glow(c, kx + kh * 0.06, ky - kh * 0.9, kh * 0.14, CANDLE, 0.18 * fl);
    groundFog(c, t, 520, 52, 0.55);
    K.fog(c, LW, LH, { y: 560, h: 120, color: "#3a2650", alpha: 0.45, t: t * 2.5, seed: 53 });
  });
}

// ---- the edit -------------------------------------------------------------------------------------
const SHOTS = [
  [0, 10, shotManor],
  [10, 20, shotGates],
  [20, 30, shotThroughBars],
  [30, 38, shotFlashlight],
  [38, 48, shotPushGate],
  [48, 56, shotGargoyle],
  [56, 64, shotWalkUp],
];
const XF = [0, 0.5, 0.5, 0, 0.5, 0, 0.6]; // 30 (hit) and 48 (thunder) are hard cuts
function drawShot(g, i, t) {
  const [a, , fn] = SHOTS[i];
  g.save();
  try { fn(g, t, Math.max(0, t - a)); } finally { g.restore(); }
}

export const film = {
  id: 5,
  title: "The Shadow at the Gate",
  chapter: "Chapter 5",
  unlockAt: 25,
  duration: D,
  poster: 34,
  tagline: "Someone else is walking with him.",
  subs: [
    [3.0, 6.5, "The manor on the hill."],
    [11.5, 15.5, "The gate was locked. The fog was not."],
    [22.0, 25.5, "There. In the fog. Biscuit."],
    [26.0, 29.5, "And someone tall, walking just ahead."],
    [31.5, 34.0, "You shone the light."],
    [35.0, 37.5, "He saw you. He did not come."],
    [40.0, 44.5, "Who was the shadow? Where was it taking him?"],
    [49.5, 54.0, "Just a gargoyle. With a moustache."],
    [57.0, 62.0, "You went in anyway."],
  ],
  voice: [
    [3.0, "The manor on the hill.", { rate: 0.92, pitch: 1.0 }],
    [11.5, "The gate was locked. The fog was not.", { rate: 0.92, pitch: 1.0 }],
    [22.0, "There. In the fog. Biscuit.", { rate: 0.92, pitch: 1.0 }],
    [26.0, "And someone tall, walking just ahead.", { rate: 0.92, pitch: 1.0 }],
    [31.5, "You shone the light.", { rate: 0.92, pitch: 1.0 }],
    [35.0, "He saw you. He did not come.", { rate: 0.85, pitch: 0.95 }],
    [40.0, "Who was the shadow? Where was it taking him?", { rate: 0.92, pitch: 1.0 }],
    [49.5, "Just a gargoyle. With a moustache.", { rate: 1.0, pitch: 1.1 }],
    [57.0, "You went in anyway.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: { mood: "tense", key: "C", bpm: 60, cues: [[6, "thunder"], [20, "drop"], [30, "hit"], [34, "meow"], [48, "thunder"], [58, "swell"]] },
  draw(g, t, W, H) {
    t = clamp(t, 0, D);
    g.save();
    if (W !== LW || H !== LH) g.scale(W / LW, H / LH);
    let i = SHOTS.findIndex(([a, b]) => t >= a && t < b);
    if (i < 0) i = SHOTS.length - 1;
    drawShot(g, i, t);
    const nx = SHOTS[i + 1];
    if (nx && XF[i + 1] > 0 && t > nx[0] - XF[i + 1]) {
      const L = K.layer(LW, LH, "f05xf");
      drawShot(L.g, i + 1, t);
      g.save();
      g.globalAlpha = smooth((t - (nx[0] - XF[i + 1])) / XF[i + 1]);
      g.drawImage(L.canvas, 0, 0, LW, LH);
      g.restore();
    }
    K.finish(g, LW, LH, t, { bloom: 0.36, tint: "#5a3a8a", tintAlpha: 0.2, mode: "soft-light", vignette: 0.62, grain: 0.05, letterbox: false });
    K.grade(g, LW, LH, { lift: "#0a0612" });
    K.letterbox(g, LW, LH, 1);
    const ta = K.env(t, 2, 6, 0.9, 1.0);
    if (ta > 0) K.title(g, LW, LH, "The Shadow at the Gate", "Chapter 5", ta, { y: LH * 0.76, size: 52, glow: "#b8a8ff" });
    K.fadeBlack(g, LW, LH, 1 - smooth(seg(t, 0, 1.4)));
    K.fadeBlack(g, LW, LH, smooth(seg(t, 62, 64)));
    g.restore();
  },
};
