// films/f07.js - Chapter 7: "Thunder" (FILMS.md f07). The manor attic in a thunderstorm: you, hiding
// in a corner; the bell on your wrist; a warm memory of a stormy night when Biscuit curled up against
// you under the quilt; a candle that lights itself; Mount Hairball glowing in a lightning flash; the roof.
// draw(g, t, W, H) is a pure function of t. Static art (quilt pattern, valley) is cached by key.
import * as K from "../filmkit.js";

const D = 68;
const { clamp, lerp, seg, smooth, mix, rgba, shade, hash, noise, glow, TAU } = K;
const eio = K.ease.inOut;

const ATTIC = "#1a2230";
const BOLT = "#e6eeff";
const CANDLE = "#ffb24a";
const NIGHT = "#ffd9a0";

// lightning: three strikes (4, 19, 54), each a little stutter of flashes
const STRIKES = [4.0, 4.16, 4.48, 19.0, 19.13, 19.42, 54.0, 54.16, 54.5];
const flashAt = (t) => K.flash(t, STRIKES, 0.22);
// the bolt jumps around the sky between stutters, so the window light slides across the floor
function boltShift(t) {
  let k = 0;
  for (let i = 0; i < STRIKES.length; i++) if (t >= STRIKES[i]) k = i;
  return (hash(k, 7) - 0.5) * 1.2;
}

// ---- shared painters ------------------------------------------------------------------------------
const flick = (t, s) => 1 + 0.1 * Math.sin(t * 13 + s) + 0.05 * Math.sin(t * 29 + s * 1.7);
function flame(g, x, y, h, t, seed, a = 1, light = 1) {
  if (h <= 0.3 || a <= 0) return;
  const f = flick(t, seed);
  const hh = h * f;
  const sway = noise(t * 2.3, seed) * h * 0.12;
  if (light > 0) {
    glow(g, x, y - hh * 0.5, hh * 14, CANDLE, 0.14 * a * light * f);
    glow(g, x, y - hh * 0.5, hh * 4, "#ffc56a", 0.3 * a * light * f);
  }
  g.save();
  g.globalAlpha *= a;
  const w = hh * 0.3;
  const gr = g.createRadialGradient(x, y - hh * 0.25, hh * 0.02, x, y - hh * 0.35, hh * 0.75);
  gr.addColorStop(0, "#fffbe8");
  gr.addColorStop(0.3, "#ffe7a0");
  gr.addColorStop(0.65, "#ffa53a");
  gr.addColorStop(1, "rgba(255,90,20,0)");
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(x, y + hh * 0.05);
  g.bezierCurveTo(x - w * 1.1, y - hh * 0.05, x - w * 0.6, y - hh * 0.6, x + sway, y - hh);
  g.bezierCurveTo(x + w * 0.6, y - hh * 0.6, x + w * 1.1, y - hh * 0.05, x, y + hh * 0.05);
  g.fill();
  g.fillStyle = "rgba(90,140,255,0.45)";
  g.beginPath();
  g.ellipse(x, y - hh * 0.04, w * 0.45, hh * 0.08, 0, 0, TAU);
  g.fill();
  g.restore();
  glow(g, x, y - hh * 0.3, hh * 0.9, "#fff2c8", 0.7 * a);
}
// a short candle stub in a tin holder; lit 0..1 (grows the flame)
function stub(g, x, y, s, t, lit, spark = 0) {
  g.fillStyle = "rgba(0,0,0,0.5)";
  g.beginPath();
  g.ellipse(x + s * 0.1, y + s * 0.02, s * 0.7, s * 0.14, 0, 0, TAU);
  g.fill();
  const tin = g.createLinearGradient(x - s * 0.5, 0, x + s * 0.5, 0);
  tin.addColorStop(0, "#3a3a40");
  tin.addColorStop(0.4, "#9a9aa4");
  tin.addColorStop(1, "#2a2a30");
  g.fillStyle = tin;
  g.beginPath();
  g.ellipse(x, y, s * 0.55, s * 0.13, 0, 0, TAU);
  g.fill();
  g.fillRect(x - s * 0.55, y - s * 0.08, s * 1.1, s * 0.08);
  const wax = g.createLinearGradient(x - s * 0.22, 0, x + s * 0.22, 0);
  wax.addColorStop(0, "#a8987a");
  wax.addColorStop(0.4, "#efe2c2");
  wax.addColorStop(1, "#7a6a50");
  g.fillStyle = wax;
  g.fillRect(x - s * 0.22, y - s * 0.55, s * 0.44, s * 0.5);
  g.fillStyle = "#f6ead0";
  g.beginPath();
  g.ellipse(x, y - s * 0.55, s * 0.22, s * 0.06, 0, 0, TAU);
  g.fill();
  g.fillStyle = "rgba(240,228,200,0.9)";
  g.beginPath();
  g.ellipse(x - s * 0.12, y - s * 0.4, s * 0.05, s * 0.16, 0, 0, TAU);
  g.fill();
  g.strokeStyle = "#1a120a";
  g.lineWidth = Math.max(0.8, s * 0.04);
  g.beginPath();
  g.moveTo(x, y - s * 0.55);
  g.lineTo(x + s * 0.02, y - s * 0.68);
  g.stroke();
  if (spark > 0) {
    for (let i = 0; i < 6; i++) {
      const a = hash(i, 5) * TAU, d = s * 0.1 + spark * s * 0.25 * hash(i, 6);
      glow(g, x + Math.cos(a) * d, y - s * 0.7 + Math.sin(a) * d, s * 0.06, "#ffe2a0", spark * 0.9);
    }
  }
  if (lit > 0) flame(g, x, y - s * 0.64, s * 0.62 * lit, t, 3, Math.min(1, lit * 1.6), lit);
}

function proj(cam) {
  return (X, Y, Z) => {
    const z = Math.max(0.05, Z - cam.z);
    return [cam.cx + (X - cam.x) * cam.f / z, cam.cy + (Y - cam.y) * cam.f / z, cam.f / z];
  };
}
function quad(g, P, pts) {
  g.beginPath();
  pts.forEach((p, i) => { const s = P(p[0], p[1], p[2]); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); });
  g.closePath();
}
function dissolve(g, W, H, a, key, fn) {
  if (a <= 0.003) return;
  if (a >= 0.997) { fn(g); return; }
  const L = K.layer(W, H, key);
  fn(L.g);
  g.save();
  g.globalAlpha = a;
  g.drawImage(L.canvas, 0, 0, W, H);
  g.restore();
}

// a bat hanging upside down from a beam at (x, y); s = body length px
function bat(g, x, y, s, t, seed, fl) {
  const sw = Math.sin(t * 0.9 + seed) * 0.06 + (hash(seed, 2) > 0.7 ? Math.max(0, Math.sin(t * 0.4 + seed)) * 0.1 : 0);
  g.save();
  g.translate(x, y);
  g.rotate(sw);
  g.strokeStyle = "#0a0a0e";
  g.lineWidth = Math.max(0.6, s * 0.05);
  g.beginPath();
  g.moveTo(-s * 0.08, 0); g.lineTo(-s * 0.05, s * 0.15);
  g.moveTo(s * 0.08, 0); g.lineTo(s * 0.05, s * 0.15);
  g.stroke();
  const bg = g.createLinearGradient(-s * 0.3, 0, s * 0.3, 0);
  bg.addColorStop(0, mix("#15131a", "#6a7088", fl * 0.6));
  bg.addColorStop(0.5, "#0c0b10");
  bg.addColorStop(1, "#08070a");
  g.fillStyle = bg;
  g.beginPath();
  g.moveTo(0, s * 0.12);
  g.bezierCurveTo(-s * 0.34, s * 0.2, -s * 0.3, s * 0.85, 0, s * 1.0);
  g.bezierCurveTo(s * 0.3, s * 0.85, s * 0.34, s * 0.2, 0, s * 0.12);
  g.fill();
  // wing ribs (folded membrane)
  g.strokeStyle = rgba("#3a3a48", 0.6 + fl * 0.3);
  g.lineWidth = Math.max(0.4, s * 0.02);
  g.beginPath();
  g.moveTo(-s * 0.2, s * 0.25); g.lineTo(-s * 0.12, s * 0.85);
  g.moveTo(s * 0.2, s * 0.25); g.lineTo(s * 0.12, s * 0.85);
  g.stroke();
  // head + ears (at the bottom)
  g.fillStyle = "#121016";
  g.beginPath();
  g.arc(0, s * 1.02, s * 0.14, 0, TAU);
  g.fill();
  g.beginPath();
  g.moveTo(-s * 0.1, s * 1.08); g.lineTo(-s * 0.16, s * 1.3); g.lineTo(-s * 0.02, s * 1.12);
  g.moveTo(s * 0.1, s * 1.08); g.lineTo(s * 0.16, s * 1.3); g.lineTo(s * 0.02, s * 1.12);
  g.fill();
  g.restore();
}

/// ---- the kid, huddled in a corner: knees drawn up, both arms wrapped round the shins, head bowed
// onto the knees, hood up. Three-quarter from behind, facing left. (x, y) = floor point under the
// hips, s = seated height px (~300 for the close shots). Units below: 100 = seated height.
// Light: cold moonlight from the window on the left (o.moon 0..1, o.flash 0..1 lightning); a candle
// (o.warm 0..1 at o.warmAt {x, y} screen px) adds an orange key + a rim on the right edge of the hood.
const MOONC = "#6f86b0";
function huddle(g, x, y, s, t, o = {}) {
  const u = s / 100;
  const tr = o.tremble || 0;
  const jx = noise(t * 23, 3) * tr * 1.2, jy = noise(t * 19, 4) * tr * 0.8;
  const br = Math.sin(t * 2.4) * 0.5; // breathing lifts the back a little
  const warm = clamp(o.warm || 0);
  const moon = o.moon == null ? 1 : o.moon;
  const flash = clamp(o.flash || 0);
  const coat0 = o.coat || "#e8b923";
  // the coat as the eye sees it in blue moonlight: desaturated, dark; lightning lifts it
  const coat = mix(shade(mix(coat0, MOONC, 0.36), -0.3), shade(mix(coat0, MOONC, 0.3), -0.05), flash * 0.7);
  const jeans = mix("#1c2436", "#3a4866", flash * 0.6);
  const boot = mix("#6a2228", "#9a4a50", flash * 0.5);
  const skin = mix("#c99070", MOONC, 0.4);
  g.save();
  // floor contact shadow (soft, wide, darkest under the hips and boots)
  g.save();
  g.translate(x - s * 0.18, y + 1);
  g.scale(1, 0.13);
  glow(g, 0, 0, s * 0.5, "#000000", 0.8, "source-over");
  g.restore();
  g.translate(x + jx, y + jy);
  g.scale(u, u);
  const all = new Path2D();
  const shape = (pts, fill, add = true) => { const p = new Path2D(); K.spline(p, pts, true); g.fillStyle = fill; g.fill(p); if (add) all.addPath(p); return p; };
  const soft = (pts, w, color) => { g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.moveTo(pts[0], pts[1]); g.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]); g.stroke(); };
  g.lineCap = "round";
  g.lineJoin = "round";
  // ---- far side (a little up and right, darker): boot, shin, the far forearm's sleeve ----
  shape([-37, -22, -28, -23, -26, -46, -30, -66, -38, -66, -40, -44], shade(jeans, -0.25));
  // ---- torso: a rounded, hunched back from the seat up to the neck ----
  const back = shape([
    -12, -2, 6, 0, 17, -4, 22, -18 + br, 22, -34 + br, 17, -50 + br, 8, -62 + br, -4, -69,
    -14, -70, -20, -62, -18, -44, -16, -24,
  ], coat);
  {
    const cg = g.createLinearGradient(-16, -70, 22, 0);
    cg.addColorStop(0, rgba(shade(coat, 0.25), 0.9));
    cg.addColorStop(0.5, rgba(coat, 0));
    cg.addColorStop(1, rgba(shade(coat, -0.6), 0.9));
    g.fillStyle = cg;
    g.fill(back);
    g.save();
    g.clip(back);
    // spine valley + the fabric pulled tight over the curved back, then bunched at the seat
    soft([4, -64, 12, -48, 13, -30, 8, -6], 5, "rgba(0,0,0,0.14)");
    soft([18, -40, 12, -30, 13, -18, 18, -6], 3, "rgba(0,0,0,0.12)");
    soft([0, -62, 6, -48, 7, -32, 3, -8], 2, rgba("#c8d6f4", 0.07 + flash * 0.1));
    soft([-14, -6, -6, -8, 4, -4, 14, -6], 2.5, "rgba(0,0,0,0.18)");
    g.strokeStyle = "rgba(0,0,0,0.22)"; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(-16, -62); g.quadraticCurveTo(0, -58, 14, -52); g.stroke(); // yoke seam
    g.restore();
  }
  // the far boot peeks out past the near one (further away: a little higher, to the right)
  {
    const fb = shape([-21, -4, -41, -4, -43, -9, -35, -12, -29, -13, -28, -27, -18, -28, -17, -9], shade(boot, -0.3));
    const fg = g.createLinearGradient(-42, -28, -18, -4);
    fg.addColorStop(0, rgba("#ffffff", 0.08 + flash * 0.12));
    fg.addColorStop(1, "rgba(0,0,0,0.4)");
    g.fillStyle = fg;
    g.fill(fb);
    g.fillStyle = "rgba(8,3,3,0.85)"; g.fillRect(-44, -5, 27, 2.2);
  }
  // ---- near thigh (coat hem over it) + shin + knee ----
  shape([-6, -10, -14, -4, -24, -20, -36, -50, -42, -66, -36, -73, -26, -68, -14, -46, -2, -24], mix(jeans, "#2a3450", 0.35));
  shape([-46, -6, -36, -6, -32, -30, -32, -56, -38, -70, -46, -66, -46, -40], jeans);
  {
    const kg = g.createRadialGradient(-40, -70, 1, -40, -68, 9);
    kg.addColorStop(0, rgba("#a8bce8", 0.3 + flash * 0.3));
    kg.addColorStop(1, "rgba(150,170,220,0)");
    g.fillStyle = kg;
    g.fillRect(-52, -80, 24, 24);
    soft([-40, -8, -38, -28, -38, -48, -42, -64], 0.6, "rgba(0,0,0,0.3)"); // inseam
  }
  // the coat's skirt falls over the thigh
  shape([-14, -2, -8, -26, -12, -40, -20, -44, -22, -30, -24, -12], shade(coat, -0.15));
  // ---- near boot: glossy rubber, a sole, a cuff band, a highlight streak ----
  const nb = shape([-62, 0, -63, -5, -54, -9, -48, -11, -47, -28, -33, -29, -32, -6, -33, 1], boot);
  {
    const bg = g.createLinearGradient(-60, -28, -34, 0);
    bg.addColorStop(0, rgba("#ffffff", 0.12 + flash * 0.15));
    bg.addColorStop(0.5, "rgba(0,0,0,0)");
    bg.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = bg;
    g.fill(nb);
    g.fillStyle = "rgba(10,4,4,0.85)"; g.fillRect(-64, -1.6, 32, 2.6);
    g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(-47, -29, 14, 2.4);
    soft([-44, -26, -45, -18, -46, -13, -50, -10], 1, rgba("#ffe0e0", 0.22 + flash * 0.3));
  }
  // ---- near arm: sleeve from the shoulder, elbow out by the knee, forearm wrapped across the shins ----
  const arm = shape([-6, -66, -14, -56, -18, -46, -26, -42, -40, -42, -50, -46, -52, -52, -44, -53, -30, -50, -24, -54, -20, -64, -12, -70], coat);
  {
    const ag = g.createLinearGradient(-52, -44, -6, -66);
    ag.addColorStop(0, rgba(shade(coat, -0.2), 0.8));
    ag.addColorStop(0.55, rgba(shade(coat, 0.12), 0.5));
    ag.addColorStop(1, rgba(shade(coat, -0.3), 0.8));
    g.fillStyle = ag;
    g.fill(arm);
    g.save();
    g.clip(arm);
    soft([-18, -50, -20, -46, -24, -44, -28, -45], 1.6, "rgba(0,0,0,0.25)"); // elbow creases
    soft([-34, -44, -36, -47, -38, -50, -38, -52], 1.2, "rgba(0,0,0,0.2)");
    g.restore();
  }
  // the hands: fingers laced round the shins, just past the front of the knees
  const hand = shape([-50, -52, -56, -51, -59, -48, -57, -44, -51, -44, -48, -47], skin);
  soft([-57, -49, -55, -49, -53, -49, -51, -49], 0.5, "rgba(40,20,20,0.4)");
  soft([-57, -46.5, -55, -46.5, -53, -46.5, -51, -46.5], 0.5, "rgba(40,20,20,0.4)");
  // cuff of the sleeve over the wrist
  shape([-47, -54, -51, -53, -51, -44, -47, -43, -45, -48], shade(coat, -0.25));
  // ---- the hood: head bowed forward, resting on the knees ----
  const hood = shape([-34, -71, -36, -82, -31, -93, -20, -99, -8, -101, 0, -96, 5, -86, 9, -74, 8, -64, -2, -64, -14, -64, -26, -65], coat);
  {
    const hg = g.createRadialGradient(-22, -94, 1, -14, -84, 20);
    hg.addColorStop(0, rgba(shade(coat, 0.3), 0.85));
    hg.addColorStop(0.55, rgba(coat, 0));
    hg.addColorStop(1, rgba(shade(coat, -0.5), 0.85));
    g.fillStyle = hg;
    g.fill(hood);
    g.save();
    g.clip(hood);
    // the centre seam over the crown and down the back + soft folds bunching at the neck,
    // all on the BACK of the hood (nothing on the face side, so it never reads as a face)
    soft([-20, -100, -10, -98, -2, -92, 0, -76], 0.8, "rgba(0,0,0,0.3)");
    soft([-22, -99, -13, -96, -6, -90, -4, -78], 1.6, rgba("#d8e2ff", 0.1 + flash * 0.15));
    soft([-6, -70, -2, -72, 2, -76, 3, -82], 3, "rgba(0,0,0,0.16)");
    soft([-16, -68, -10, -70, -6, -73, -3, -76], 2.2, "rgba(0,0,0,0.14)");
    // the opening is turned away, down toward the knees: only a sliver of its dark lining
    g.strokeStyle = "rgba(8,6,4,0.7)"; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-31, -92); g.quadraticCurveTo(-37, -82, -33, -70); g.stroke();
    // the hood brim: a thicker rolled edge round the (unseen) opening, lit on top
    soft([-30, -94, -35, -88, -36, -80, -33, -71], 2.2, rgba(shade(coat, 0.3), 0.5));
    g.restore();
    g.strokeStyle = "rgba(220,224,232,0.3)"; g.lineWidth = 0.5;
    g.beginPath(); g.moveTo(-31, -68); g.lineTo(-32, -60); g.stroke(); // drawstring
  }
  // ---- light ----
  const box = [-66, -104, 26, 3];
  K.crescent(g, all, 2.4, 1.8, mix(MOONC, "#dfe8ff", flash), (0.6 + flash * 0.6) * moon, box, "lighter", 2);
  K.crescent(g, all, -5, -2, "#05070c", 0.35 - warm * 0.15, box, "source-over", 2);
  if (warm > 0.001) {
    // the candle: an orange key from its side + a hot rim along the right edge of the hood and back
    const wx = ((o.warmAt ? o.warmAt.x : x + s) - x) / u, wy = ((o.warmAt ? o.warmAt.y : y) - y) / u;
    g.save();
    g.clip(all);
    g.globalCompositeOperation = "lighter";
    const wg = g.createRadialGradient(wx, wy, 4, wx, wy, 120);
    wg.addColorStop(0, rgba(CANDLE, 0.36 * warm));
    wg.addColorStop(0.45, rgba(CANDLE, 0.14 * warm));
    wg.addColorStop(1, rgba(CANDLE, 0));
    g.fillStyle = wg;
    g.fillRect(-70, -106, 100, 110);
    g.restore();
    const dx = wx + 10, dy = wy + 50, l = Math.hypot(dx, dy) || 1;
    K.crescent(g, all, -dx / l * 3, -dy / l * 3, CANDLE, 0.75 * warm, box, "lighter", 2);
  }
  if (o.wet) {
    g.save();
    g.clip(back);
    g.strokeStyle = rgba("#dfe8ff", 0.14 * o.wet); g.lineWidth = 0.6;
    for (let i = 0; i < 7; i++) { const xx = -12 + hash(i, 81) * 32, yy = -60 + hash(i, 82) * 50; g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + 0.6, yy + 4 + hash(i, 83) * 5); g.stroke(); }
    g.restore();
  }
  g.restore();
}

// ---- SHOT 1: the attic, wide ----------------------------------------------------------------------------
const A = { floor: 1.4, knee: 0.5, ridge: -2.3, half: 2.6, end: 9 };
const roofX = (Y) => A.half * (Y - A.ridge) / (A.knee - A.ridge);
function windowOutside(g, cx, cy, r, t, fl) {
  const sk = g.createLinearGradient(0, cy - r, 0, cy + r);
  sk.addColorStop(0, mix("#202838", "#c8d4f0", fl));
  sk.addColorStop(1, mix("#2c3648", "#9aa8c8", fl));
  g.fillStyle = sk;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.save();
  g.globalAlpha = 0.85;
  K.rain(g, cx * 2, cy + r, t, { density: 0.8, angle: 0.25, color: "rgba(210,222,245,0.75)", seed: 21 });
  g.restore();
}
function roundWindow(g, cx, cy, r, t, fl, o = {}) {
  // frame
  g.fillStyle = mix("#1a1410", "#5a5a68", fl * 0.6);
  g.beginPath();
  g.arc(cx, cy, r * 1.16, 0, TAU);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.clip();
  if (o.outside) o.outside(g, cx, cy, r, fl); else windowOutside(g, cx, cy, r, t, fl);
  K.glassDrops(g, cx - r, cy - r, r * 2, r * 2, t, { seed: 31, density: 1.6, light: fl > 0.1 ? "#ffffff" : "#9fb0d0" });
  // rain running down the glass: wavering rivulets, each with a bright bead at its head
  {
    const n = 7;
    g.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const sp = 0.18 + hash(i, 41) * 0.25;
      const ph = ((t * sp + hash(i, 42)) % 1 + 1) % 1;
      const xs = cx - r * 0.85 + hash(i, 43) * r * 1.7;
      const yh = cy - r + ph * r * 2.2;
      const len = r * (0.35 + hash(i, 44) * 0.5);
      g.strokeStyle = rgba(fl > 0.1 ? "#ffffff" : "#b8c8e8", 0.18 + fl * 0.4);
      g.lineWidth = Math.max(0.8, r * 0.012);
      g.beginPath();
      for (let k = 0; k <= 6; k++) {
        const yy = yh - (k / 6) * len, xx = xs + Math.sin(yy * 0.08 + i) * r * 0.012;
        if (k) g.lineTo(xx, yy); else g.moveTo(xx, yy);
      }
      g.stroke();
      glow(g, xs, yh, Math.max(1.5, r * 0.03), "#dfe8ff", 0.35 + fl * 0.5);
    }
  }
  const rg = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  rg.addColorStop(0, "rgba(255,255,255,0.08)");
  rg.addColorStop(0.5, "rgba(255,255,255,0)");
  rg.addColorStop(1, "rgba(255,255,255,0.05)");
  g.fillStyle = rg;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.restore();
  g.strokeStyle = mix("#140e0a", "#4a4a58", fl * 0.6);
  g.lineWidth = Math.max(2, r * 0.07);
  g.beginPath();
  g.moveTo(cx - r, cy); g.lineTo(cx + r, cy);
  g.moveTo(cx, cy - r); g.lineTo(cx, cy + r);
  g.stroke();
  g.lineWidth = Math.max(2, r * 0.1);
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.stroke();
  g.strokeStyle = rgba("#9fb0d0", 0.25 + fl * 0.5);
  g.lineWidth = 1;
  g.beginPath();
  g.arc(cx, cy, r * 1.12, Math.PI * 1.1, Math.PI * 1.6);
  g.stroke();
}
/// sheet-draped furniture: ghostly shapes under dust sheets (x, y = floor centre, w, h px)
const DRAPES = {
  chair: [-0.5, 0, -0.5, -0.42, -0.44, -0.56, -0.3, -0.5, -0.08, -0.5, 0.02, -0.92, 0.28, -1.0, 0.4, -0.62, 0.48, -0.56, 0.53, 0],
  tall: [-0.42, 0, -0.36, -0.7, -0.3, -0.95, 0, -1.0, 0.3, -0.95, 0.36, -0.7, 0.42, 0],
  mound: [-0.5, 0, -0.47, -0.72, -0.32, -0.86, 0.18, -0.84, 0.44, -0.72, 0.5, 0],
};
function draped(g, x, y, w, h, seed, fl, warm = 0, kind = "chair") {
  const R = K.rng("drape" + seed);
  const shape = DRAPES[kind] || DRAPES.chair;
  const pts = [];
  for (let i = 0; i < shape.length; i += 2) pts.push(x + shape[i] * w, y + shape[i + 1] * h);
  // the sheet flares out a little where it meets the floor
  pts[0] -= w * 0.06;
  pts[pts.length - 2] += w * 0.06;
  const p = new Path2D();
  K.spline(p, pts, false);
  p.closePath();
  const lit = mix("#46506a", "#e2e8f8", fl * 0.85);
  const gr = g.createLinearGradient(x - w * 0.5, y - h, x + w * 0.4, y);
  gr.addColorStop(0, mix(lit, "#e0a060", warm * 0.45));
  gr.addColorStop(0.55, mix("#2a3244", "#8a96b0", fl * 0.6));
  gr.addColorStop(1, "#10141c");
  g.fillStyle = gr;
  g.fill(p);
  g.save();
  g.clip(p);
  // hanging folds as SOFT light/shadow bands: one horizontal gradient with seeded stops, so each
  // fold is a smooth roll of cloth (dark core, lit shoulder) instead of a painted stripe
  const fg = g.createLinearGradient(x - w * 0.56, 0, x + w * 0.56, 0);
  const hi = rgba(mix("#9aa6c4", "#ffffff", fl), 0.1 + fl * 0.22);
  const lo = "rgba(4,6,12,0.42)";
  const n = 6;
  fg.addColorStop(0, "rgba(0,0,0,0)");
  for (let i = 0; i < n; i++) {
    const c = (i + 0.5 + (R() - 0.5) * 0.5) / n;
    fg.addColorStop(clamp(c - 0.06, 0.001, 0.999), "rgba(0,0,0,0)");
    fg.addColorStop(clamp(c - 0.025, 0.001, 0.999), hi);
    fg.addColorStop(clamp(c + 0.02, 0.001, 0.999), lo);
    fg.addColorStop(clamp(c + 0.065, 0.001, 0.999), "rgba(0,0,0,0)");
  }
  fg.addColorStop(1, "rgba(0,0,0,0)");
  // the folds hang below where the sheet drapes over the furniture's top (fainter above)
  g.fillStyle = fg;
  g.globalAlpha = 0.9;
  g.fillRect(x - w * 0.6, y - h * 0.62, w * 1.2, h * 0.64);
  g.globalAlpha = 0.45;
  g.fillRect(x - w * 0.6, y - h * 1.02, w * 1.2, h * 0.42);
  g.globalAlpha = 1;
  // the top of the sheet catches the cold window light; its underside falls into shadow
  const tg = g.createRadialGradient(x - w * 0.1, y - h * 0.95, 2, x - w * 0.1, y - h * 0.8, w * 0.6);
  tg.addColorStop(0, rgba(mix("#8a98ba", "#ffffff", fl), 0.22 + fl * 0.25));
  tg.addColorStop(1, "rgba(120,140,180,0)");
  g.fillStyle = tg;
  g.fillRect(x - w, y - h * 1.1, w * 2, h);
  // the hem: a soft wavy edge where the cloth pools on the floor
  g.strokeStyle = "rgba(0,0,0,0.25)";
  g.lineWidth = Math.max(1, w * 0.02);
  g.beginPath();
  for (let i = 0; i <= 12; i++) { const xx = x - w * 0.56 + (i / 12) * w * 1.12, yy = y - h * 0.03 + Math.sin(i * 1.9 + seed) * h * 0.012; if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy); }
  g.stroke();
  // contact shadow along the floor
  const sg = g.createLinearGradient(0, y - h * 0.12, 0, y);
  sg.addColorStop(0, "rgba(0,0,0,0)");
  sg.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = sg;
  g.fillRect(x - w, y - h * 0.12, w * 2, h * 0.12);
  g.restore();
  g.save();
  g.translate(x, y);
  g.scale(1, 0.12);
  glow(g, 0, 0, w * 0.75, "#000000", 0.5, "source-over");
  g.restore();
}
// an old steamer trunk: plank body, a domed lid with curvature shading, brass corners + straps + lock
function trunk(g, x, y, w, h, fl, warm = 0) {
  const c = mix(mix("#3a2418", "#8a7a70", fl * 0.5), "#8a5a30", warm * 0.4);
  const brass = mix(mix("#6a5020", "#c0b090", fl * 0.4), "#d8a050", warm * 0.4);
  const x0 = x - w / 2, x1 = x + w / 2, top = y - h, lidH = h * 0.36;
  // contact shadow
  g.save();
  g.translate(x, y);
  g.scale(1, 0.1);
  glow(g, 0, 0, w * 0.7, "#000000", 0.6, "source-over");
  g.restore();
  // body: planks with a gradient that rolls off at both ends (a box, lit from the upper left)
  const bg = g.createLinearGradient(x0, 0, x1, 0);
  bg.addColorStop(0, shade(c, -0.05));
  bg.addColorStop(0.35, shade(c, 0.08));
  bg.addColorStop(1, shade(c, -0.42));
  g.fillStyle = bg;
  g.fillRect(x0, top, w, h);
  const vg = g.createLinearGradient(0, top, 0, y);
  vg.addColorStop(0, "rgba(0,0,0,0.25)");
  vg.addColorStop(0.2, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = vg;
  g.fillRect(x0, top, w, h);
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = Math.max(0.6, h * 0.02);
  g.beginPath();
  for (let k = 1; k < 4; k++) { g.moveTo(x0, top + (h * k) / 4); g.lineTo(x1, top + (h * k) / 4); }
  g.stroke();
  // domed lid: a barrel-top whose highlight runs along the curve
  const lid = new Path2D();
  lid.moveTo(x0 - w * 0.015, top);
  lid.bezierCurveTo(x0 - w * 0.01, top - lidH * 0.9, x1 + w * 0.01, top - lidH * 0.9, x1 + w * 0.015, top);
  lid.closePath();
  const lg = g.createLinearGradient(0, top - lidH * 0.7, 0, top);
  lg.addColorStop(0, shade(c, -0.15));
  lg.addColorStop(0.3, mix(shade(c, 0.25), "#c8d4f0", fl * 0.3));
  lg.addColorStop(0.6, shade(c, 0.02));
  lg.addColorStop(1, shade(c, -0.35));
  g.fillStyle = lg;
  g.fill(lid);
  const ls = g.createLinearGradient(x0, 0, x1, 0);
  ls.addColorStop(0, "rgba(0,0,0,0)");
  ls.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = ls;
  g.fill(lid);
  // lid lip shadow
  g.fillStyle = "rgba(0,0,0,0.5)";
  g.fillRect(x0, top, w, Math.max(1, h * 0.04));
  // brass: straps over the lid + down the front, corner caps, a lock plate
  const strap = (sx) => {
    const sw = w * 0.07;
    const sg = g.createLinearGradient(sx - sw / 2, 0, sx + sw / 2, 0);
    sg.addColorStop(0, shade(brass, -0.3));
    sg.addColorStop(0.45, shade(brass, 0.25));
    sg.addColorStop(1, shade(brass, -0.35));
    g.fillStyle = sg;
    g.save();
    g.clip(lid);
    g.fillRect(sx - sw / 2, top - lidH, sw, lidH);
    g.restore();
    g.fillRect(sx - sw / 2, top, sw, h);
    g.fillStyle = "rgba(0,0,0,0.35)";
    for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(sx, top + h * (0.12 + k * 0.25), Math.max(0.6, w * 0.008), 0, TAU); g.fill(); }
  };
  strap(x - w * 0.3);
  strap(x + w * 0.3);
  const corner = (cx, cy, sx, sy) => {
    const s = Math.min(w, h) * 0.16;
    g.fillStyle = shade(brass, sx < 0 ? 0.15 : -0.25);
    g.beginPath();
    g.moveTo(cx, cy); g.lineTo(cx - sx * s, cy); g.lineTo(cx, cy - sy * s);
    g.closePath();
    g.fill();
  };
  corner(x0, y, -1, 1); corner(x1, y, 1, 1); corner(x0, top, -1, -1); corner(x1, top, 1, -1);
  const lpw = w * 0.11, lph = h * 0.2;
  const lpg = g.createLinearGradient(x - lpw / 2, top, x + lpw / 2, top + lph);
  lpg.addColorStop(0, shade(brass, 0.35));
  lpg.addColorStop(1, shade(brass, -0.3));
  g.fillStyle = lpg;
  g.fillRect(x - lpw / 2, top - lph * 0.15, lpw, lph);
  g.fillStyle = "rgba(0,0,0,0.7)";
  g.fillRect(x - lpw * 0.08, top + lph * 0.3, lpw * 0.16, lph * 0.35);
  // dust on the lid top
  g.fillStyle = rgba("#9aa4b8", 0.1 + fl * 0.1);
  g.fill(lid);
}
function attic(g, t, W, H, cam, fl, o = {}) {
  const P = proj(cam);
  const zn = cam.z + 0.25, zf = A.end;
  const dark = (c, k = 0.55) => mix(c, "#cfd8f0", fl * k * 0.6);
  // gable end wall
  quad(g, P, [[-A.half, A.floor, zf], [-A.half, A.knee, zf], [0, A.ridge, zf], [A.half, A.knee, zf], [A.half, A.floor, zf]]);
  g.fillStyle = dark("#1e2632", 0.5);
  g.fill();
  // vertical boards on the gable
  g.strokeStyle = "rgba(0,0,0,0.3)";
  g.lineWidth = 1;
  g.beginPath();
  for (let X = -2.4; X <= 2.4; X += 0.3) { const a = P(X, A.floor, zf), b = P(X, Math.min(A.knee, A.ridge + (A.knee - A.ridge) * Math.abs(X) / A.half), zf); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
  g.stroke();
  const wc = P(0, -0.75, zf), wr = 0.95 * wc[2];
  // roof planes
  for (const side of [-1, 1]) {
    quad(g, P, [[side * A.half, A.knee, zn], [0, A.ridge, zn], [0, A.ridge, zf], [side * A.half, A.knee, zf]]);
    const a = P(side * A.half, A.knee, zn), b = P(0, A.ridge, zf);
    const rg = g.createLinearGradient(a[0], a[1], b[0], b[1]);
    rg.addColorStop(0, dark("#0c1018", 0.3));
    rg.addColorStop(1, dark("#1c2430", 0.5));
    g.fillStyle = rg;
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.beginPath();
    for (let k = 0.1; k < 1; k += 0.11) {
      const X = side * A.half * (1 - k), Y = lerp(A.knee, A.ridge, k);
      const p0 = P(X, Y, zn), p1 = P(X, Y, zf);
      g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]);
    }
    g.stroke();
    // knee wall
    quad(g, P, [[side * A.half, A.floor, zn], [side * A.half, A.knee, zn], [side * A.half, A.knee, zf], [side * A.half, A.floor, zf]]);
    g.fillStyle = dark("#141a24", 0.4);
    g.fill();
  }
  // floor boards
  quad(g, P, [[-A.half, A.floor, zn], [A.half, A.floor, zn], [A.half, A.floor, zf], [-A.half, A.floor, zf]]);
  const f0 = P(0, A.floor, zn), f1 = P(0, A.floor, zf);
  const fg = g.createLinearGradient(0, f1[1], 0, f0[1]);
  fg.addColorStop(0, dark("#262830", 0.5));
  fg.addColorStop(1, dark("#0e1014", 0.3));
  g.fillStyle = fg;
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.4)";
  g.beginPath();
  for (let X = -2.6; X <= 2.61; X += 0.26) { const a = P(X, A.floor, zn), b = P(X, A.floor, zf); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
  g.stroke();
  // window light on the floor: the round window's shape, sliding as the bolt jumps
  const sh = boltShift(t);
  const patch = (alpha, color, bars) => {
    const c = P(sh, A.floor, 5.6 - Math.abs(sh) * 0.4);
    const rx = 0.9 * c[2], ry = 0.5 * c[2];
    g.save();
    g.translate(c[0], c[1]);
    g.globalCompositeOperation = "lighter";
    g.scale(1, 0.55 * ry / rx);
    const pg = g.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx);
    pg.addColorStop(0, rgba(color, alpha));
    pg.addColorStop(0.75, rgba(color, alpha * 0.8));
    pg.addColorStop(1, rgba(color, 0));
    g.fillStyle = pg;
    g.beginPath();
    g.arc(0, 0, rx, 0, TAU);
    g.fill();
    g.setTransform(g.getTransform().scale(1, rx / (0.55 * ry)));
    // the mullion shadow only exists while the window is actually throwing light
    if (bars > 0.01) {
      g.globalCompositeOperation = "source-over";
      g.fillStyle = rgba("#080a10", 0.7 * clamp(bars));
      g.fillRect(-rx, -ry * 0.04, rx * 2, ry * 0.08);
      g.fillRect(-rx * 0.03, -ry * 0.55, rx * 0.06, ry * 1.1);
    }
    g.restore();
  };
  patch(0.07, "#8a9ab8", 0);
  if (fl > 0.02) patch(0.75 * fl, BOLT, fl);
  // props, far to near
  const prop = (X, z, fn) => { if (z < cam.z + 0.5) return; const b = P(X, A.floor, z); fn(b[0], b[1], b[2]); };
  const warm = o.warm || 0;
  prop(-1.5, 8.4, (x, y, s) => draped(g, x, y, s * 0.7, s * 1.7, 1, fl, warm, "tall"));
  prop(1.55, 8.0, (x, y, s) => trunk(g, x, y, s * 0.9, s * 0.55, fl, warm));
  prop(-1.9, 6.6, (x, y, s) => { trunk(g, x, y, s * 1.0, s * 0.6, fl, warm); trunk(g, x + s * 0.1, y - s * 0.6, s * 0.7, s * 0.4, fl, warm); });
  // cold air: the far end of the attic sinks into a blue-grey haze (atmospheric falloff with depth)
  {
    const v = P(0, -0.2, zf);
    const fgr = g.createRadialGradient(v[0], v[1], 4, v[0], v[1], W * 0.42);
    const fc = mix("#3a4660", "#c8d4f0", fl * 0.6);
    fgr.addColorStop(0, rgba(fc, 0.42 * (1 - warm * 0.5)));
    fgr.addColorStop(0.45, rgba(fc, 0.2 * (1 - warm * 0.5)));
    fgr.addColorStop(1, rgba(fc, 0));
    g.fillStyle = fgr;
    g.fillRect(0, 0, W, H);
  }
  prop(1.6, 5.6, (x, y, s) => draped(g, x, y, s * 1.25, s * 1.05, 2, fl, warm, "chair"));
  prop(-1.7, 3.9, (x, y, s) => draped(g, x, y, s * 1.2, s * 0.8, 3, fl, warm, "mound"));
  if (o.nearTrunk !== false) prop(1.9, 2.9, (x, y, s) => { if (s < 220) trunk(g, x, y, s * 1.1, s * 0.6, fl, warm); });
  // round window on the gable
  roundWindow(g, wc[0], wc[1], wr, t, fl);
  glow(g, wc[0], wc[1], wr * 3, "#9fb0d0", 0.12 + fl * 0.6);
  // rafters + collar ties, with bats
  for (let z = Math.ceil(zn / 1.4) * 1.4; z < zf; z += 1.4) {
    if (z < zn + 0.2) continue;
    const a = P(-A.half, A.knee, z), b = P(0, A.ridge, z), c = P(A.half, A.knee, z);
    g.strokeStyle = dark("#0a0c10", 0.35);
    g.lineWidth = Math.max(1.5, b[2] * 0.12);
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]);
    const t0 = P(-roofX(-1.2), -1.2, z), t1 = P(roofX(-1.2), -1.2, z);
    g.moveTo(t0[0], t0[1]); g.lineTo(t1[0], t1[1]);
    g.stroke();
    // lightning edge light on the rafters' window-facing side
    if (fl > 0.05) {
      g.strokeStyle = rgba(BOLT, 0.35 * fl);
      g.lineWidth = Math.max(0.8, b[2] * 0.025);
      g.beginPath();
      g.moveTo(t0[0], t0[1] + b[2] * 0.05); g.lineTo(t1[0], t1[1] + b[2] * 0.05);
      g.stroke();
    }
    if (o.bats !== false) {
      const k = Math.round(z * 10);
      for (let i = 0; i < 2; i++) {
        if (hash(k + i, 3) < 0.45) continue;
        const X = (hash(k + i, 4) - 0.5) * 1.8;
        const q = P(X, -1.2, z);
        bat(g, q[0], q[1] + q[2] * 0.03, q[2] * 0.2, t, k + i, fl);
      }
    }
  }
  // light from the window through dusty air
  K.godRays(g, wc[0], wc[1], W, H, { color: fl > 0.05 ? BOLT : "#7a8aa8", count: 7, strength: 0.05 + fl * 0.5, t, angle: Math.PI / 2 + sh * 0.2, spread: 0.9, length: H * 0.9, seed: 7 });
  return { P, wc, wr };
}
function shot1(g, t, W, H) {
  const p = eio(seg(t, 0, 10));
  const fl = flashAt(t);
  const cam = { x: noise(t * 0.2, 3) * 0.05, y: 0.15, z: lerp(-0.6, 0.6, p), f: 400, cx: W / 2, cy: H * 0.46 };
  K.withCamera(g, W, H, { shakeT: t, shakeAmt: 1 + fl * 3 }, () => {
    const st = attic(g, t, W, H, cam, fl);
    K.dust(g, W, H, t, { seed: 71, count: 30, color: "#b8c8e8", size: 1.2, alpha: 0.25 + fl * 0.5 });
    // motes drifting in the window shaft (brighter, denser, only inside the beam)
    const sx = st.wc[0], sy = st.wc[1];
    K.dust(g, W, H, t, { seed: 79, count: 55, color: "#d0dcf8", size: 1.5, alpha: 0.5 + fl * 0.5, area: [sx - st.wr * 1.6, sy, st.wr * 3.2, H * 0.62 - sy + 120] });
  });
}

// ---- SHOT 2: you, hunched in a corner -------------------------------------------------------------------
function cornerSet(g, t, W, H, fl, o = {}) {
  // a corner under the slope: sloped ceiling boards top-left, knee wall, floor; window light from the left
  const wall = g.createLinearGradient(0, 0, W, 0);
  wall.addColorStop(0, mix("#1a2230", "#9aa8c8", fl * 0.7));
  wall.addColorStop(1, mix("#0c1018", "#4a5468", fl * 0.5));
  g.fillStyle = wall;
  g.fillRect(0, 0, W, H);
  // sloped ceiling plane
  g.fillStyle = mix("#0a0e16", "#5a6478", fl * 0.5);
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, 120); g.lineTo(0, 250);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.4)";
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < 9; i++) { const y0 = i * 28; g.moveTo(0, 250 - (250 - y0) * 0.0 + y0 * 0 - i * 28); g.lineTo(W, 120 - i * 15); }
  g.stroke();
  // rafters coming toward us with bats
  for (let i = 0; i < 4; i++) {
    const x = 120 + i * 250;
    g.fillStyle = mix("#06080c", "#3a4252", fl * 0.4);
    g.beginPath();
    g.moveTo(x - 14, 0); g.lineTo(x + 14, 0); g.lineTo(x + 30 + i * 6, 250 - x * 0.135 + 8); g.lineTo(x + 2 + i * 6, 250 - x * 0.135 + 12);
    g.closePath();
    g.fill();
    if (o.bats !== false) {
      for (let k = 0; k < 2; k++) {
        if (hash(i * 3 + k, 9) < 0.35) continue;
        const u = 0.25 + hash(i * 3 + k, 10) * 0.55;
        const bx = lerp(x, x + 16 + i * 6, u), by = lerp(0, 250 - x * 0.135 + 10, u);
        bat(g, bx + 8, by + 4, 22 + hash(i + k, 2) * 8, t, i * 3 + k, fl);
      }
    }
  }
  // knee wall + floor
  g.fillStyle = mix("#121822", "#6a7488", fl * 0.5);
  g.beginPath();
  g.moveTo(0, 250); g.lineTo(W, 120); g.lineTo(W, 300); g.lineTo(0, 370);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.beginPath();
  for (let x = 0; x < W; x += 46) { g.moveTo(x, 250 - x * 0.135); g.lineTo(x, 370 - x * 0.073); }
  g.stroke();
  const fg = g.createLinearGradient(0, 300, 0, H);
  fg.addColorStop(0, mix("#1c1e24", "#7a8098", fl * 0.5));
  fg.addColorStop(1, "#08090c");
  g.fillStyle = fg;
  g.beginPath();
  g.moveTo(0, 370); g.lineTo(W, 300); g.lineTo(W, H); g.lineTo(0, H);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.45)";
  g.beginPath();
  for (let i = -6; i < 16; i++) { g.moveTo(i * 90, 370 - i * 6); g.lineTo(i * 90 - 260, H); }
  g.stroke();
  // window light from the left
  glow(g, -80, 200, 520, fl > 0.05 ? BOLT : "#6a7aa0", 0.18 + fl * 0.6);
}
// a collar beam across the top of the frame with bats hanging from it, silhouetted against the
// faint moonlight bouncing off the ceiling boards
function batBeam(g, t, fl, y = 82) {
  glow(g, 560, y + 10, 330, mix("#34405a", "#c8d4f0", fl), 0.35 + fl * 0.4);
  const bm = g.createLinearGradient(0, y - 9, 0, y + 9);
  bm.addColorStop(0, mix("#0e1016", "#5a6478", fl * 0.5));
  bm.addColorStop(0.7, "#07080c");
  bm.addColorStop(1, rgba("#6f86b0", 0.6 + fl * 0.4));
  g.fillStyle = bm;
  g.fillRect(180, y - 9, 800, 18);
  g.fillStyle = "rgba(0,0,0,0.4)";
  g.fillRect(180, y + 9, 800, 3);
  for (const [bx, bs, sd] of [[330, 27, 1], [430, 23, 2], [612, 29, 3], [748, 25, 4]]) {
    g.save();
    g.globalAlpha = 0.8;
    glow(g, bx, y + 9 + bs * 0.6, bs * 1.4, "#5a6c98", 0.55 + fl * 0.5);
    g.restore();
    bat(g, bx, y + 9, bs, t, sd * 7, fl);
  }
}
function shot2(g, t, W, H) {
  const p = eio(seg(t, 10, 19));
  const fl = flashAt(t) * 0.6;
  K.withCamera(g, W, H, { x: 480 + p * 20, y: 270, zoom: 1.02 + p * 0.05, shakeT: t, shakeAmt: 1.2 }, () => {
    cornerSet(g, t, W, H, fl);
    batBeam(g, t, fl);
    // a trunk behind, a sheet draped over a chair
    draped(g, 150, 400, 230, 190, 4, fl, 0, "chair");
    // the flashlight, dropped on the floor beside you: its batteries are dying (flicker + fade)
    const dim = (1 - p * 0.75) * (noise(t * 9, 4) > 0.55 ? 0.35 : 1) * (t > 17.6 && t < 17.9 ? 0.15 : 1);
    const fx = 790, fy = 420, fa = 0.18;
    K.flashlightBeam(g, fx + 22, fy + 2, fa, 340, { spread: 0.5, alpha: 0.2 * dim, hot: dim > 0.5 });
    // the pool where the beam lands on the boards
    g.save();
    g.translate(fx + 210, fy + 40);
    g.scale(1, 0.32);
    glow(g, 0, 0, 120, "#fff0c8", 0.25 * dim);
    g.restore();
    g.save();
    g.translate(fx, fy);
    g.rotate(fa);
    g.fillStyle = "rgba(0,0,0,0.5)";
    g.beginPath(); g.ellipse(-2, 8, 30, 4, 0, 0, TAU); g.fill();
    const tg = g.createLinearGradient(0, -7, 0, 7);
    tg.addColorStop(0, "#c8ccd4");
    tg.addColorStop(0.5, "#5a5e68");
    tg.addColorStop(1, "#1a1c22");
    g.fillStyle = tg;
    g.fillRect(-30, -6, 44, 12);
    g.fillRect(12, -9, 12, 18);
    g.fillStyle = "rgba(0,0,0,0.35)";
    for (let k = 0; k < 5; k++) g.fillRect(-26 + k * 6, -6, 2, 12);
    g.restore();
    glow(g, fx + 24, fy + 4, 16, "#fff3d0", 0.85 * dim);
    huddle(g, 610, 466, 300, t, { tremble: 1, flash: fl * 1.4, wet: 0.6 });
    K.dust(g, W, H, t, { seed: 72, count: 24, color: "#b8c8e8", size: 1.1, alpha: 0.3 });
  });
}

// ---- SHOT 3: extreme close-up, the bell in your fist -----------------------------------------------------
// your fist, coming in from the right and clutching the bell: (x, y) = wrist, s = wrist->front of
// the fist px. Seen from the thumb side: the fingers curl round the bell, the thumb presses over it,
// knuckles + nails are shaded; the red string runs from the bell's loop back round the wrist.
// o: fl (lightning 0..1), t, glint
function fistWithBell(g, x, y, s, t, o = {}) {
  const u = s / 100;
  const fl = o.fl || 0;
  const SK = mix("#d6a284", "#e8eefc", fl * 0.35), SKD = mix("#8a5a48", "#6a7290", 0.25), SKL = mix("#f4cdb0", "#ffffff", fl * 0.5);
  g.save();
  g.translate(x, y);
  g.scale(u, u);
  g.lineCap = "round";
  g.lineJoin = "round";
  // a cylinder-ish stroke: lit along its top-left edge, dark underneath
  const seg2 = (ax, ay, bx, by, w, col = SK) => {
    const nx = -(by - ay), ny = bx - ax, l = Math.hypot(nx, ny) || 1;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const gr = g.createLinearGradient(mx - (nx / l) * w * 0.5, my - (ny / l) * w * 0.5, mx + (nx / l) * w * 0.5, my + (ny / l) * w * 0.5);
    gr.addColorStop(0, shade(col, -0.35));
    gr.addColorStop(0.45, col);
    gr.addColorStop(0.8, mix(col, SKL, 0.5));
    gr.addColorStop(1, shade(col, -0.15));
    g.strokeStyle = gr;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
  };
  const knuckle = (kx, ky, r, a = 0.5) => {
    const kg = g.createRadialGradient(kx - r * 0.3, ky - r * 0.4, 0, kx, ky, r);
    kg.addColorStop(0, rgba(SKL, a));
    kg.addColorStop(1, rgba(SKL, 0));
    g.fillStyle = kg;
    g.fillRect(kx - r, ky - r, r * 2, r * 2);
  };
  const crease = (cx, cy, r, a0, a1) => { g.strokeStyle = rgba(SKD, 0.7); g.lineWidth = 0.7; g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke(); };
  // --- the curled fingers behind the bell: middle, ring, little (stacked, each a little lower/back) ---
  for (let i = 3; i >= 1; i--) {
    const kx = -60 + i * 7, ky = -14 + i * 8;
    seg2(kx, ky, kx - 14, ky + 14, 15 - i, shade(SK, -0.08 * i));
    seg2(kx - 14, ky + 14, kx - 2, ky + 24, 13 - i, shade(SK, -0.1 * i));
    knuckle(kx - 14, ky + 14, 6, 0.35);
    crease(kx - 14, ky + 14, 5, 0.2, 1.4);
  }
  // --- the red string: from the bell's loop, back along the palm side, round the wrist ---
  g.strokeStyle = "#a8322e";
  g.lineWidth = 2.6;
  g.beginPath();
  g.moveTo(-72, 10);
  g.bezierCurveTo(-60, 40, -18, 36, 2, 26);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(6, 0, 6, 26, 0.08, -Math.PI / 2, Math.PI / 2);
  g.stroke();
  g.strokeStyle = "rgba(255,170,160,0.35)";
  g.lineWidth = 1;
  g.beginPath();
  g.ellipse(7, 0, 6, 26, 0.08, -Math.PI / 2.4, Math.PI / 3);
  g.stroke();
  // --- back of the hand: wrist -> knuckles (tendons, a vein, knuckle bumps) ---
  const back = new Path2D();
  K.spline(back, [6, -28, -20, -32, -44, -34, -60, -28, -66, -16, -60, -2, -40, 8, -14, 18, 6, 22, 10, 0], true);
  const bg = g.createLinearGradient(-30, -36, -20, 22);
  bg.addColorStop(0, SKL);
  bg.addColorStop(0.35, SK);
  bg.addColorStop(1, shade(SK, -0.4));
  g.fillStyle = bg;
  g.fill(back);
  g.save();
  g.clip(back);
  g.strokeStyle = rgba(SKL, 0.3);
  g.lineWidth = 1.6;
  for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(0, -24 + k * 3); g.quadraticCurveTo(-26, -30 + k * 4, -50 + k * 4, -28 + k * 5); g.stroke(); }
  g.strokeStyle = rgba("#6a7aa8", 0.2);
  g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(4, -10); g.bezierCurveTo(-12, -16, -22, -8, -34, -14); g.stroke();
  g.restore();
  knuckle(-58, -26, 9, 0.6);
  knuckle(-50, -20, 7, 0.4);
  // --- the bell, clutched in the curl ---
  const bx = -74, by = 7, br = 18;
  K.drawBell(g, bx, by, br * 2, { t, glint: o.glint == null ? 0.4 : o.glint });
  // fingers cast a soft shadow onto the brass
  g.save();
  g.beginPath(); g.arc(bx, by, br, 0, TAU); g.clip();
  const sh = g.createLinearGradient(bx + br, by, bx - br * 0.2, by);
  sh.addColorStop(0, "rgba(20,10,4,0.6)");
  sh.addColorStop(1, "rgba(20,10,4,0)");
  g.fillStyle = sh;
  g.fillRect(bx - br, by - br, br * 2, br * 2);
  g.restore();
  // --- index finger: down from its knuckle, curled under the front of the bell ---
  seg2(-62, -24, -82, -6, 15);
  seg2(-82, -6, -80, 16, 13.5);
  seg2(-80, 16, -66, 22, 12);
  knuckle(-62, -24, 8, 0.55);
  knuckle(-82, -6, 7, 0.5);
  crease(-82, -6, 5.5, -0.4, 1.1);
  crease(-80, 16, 5, 0.6, 2.2);
  // --- the thumb: from the base of the hand, over the top of the bell, pressing it in ---
  seg2(-22, 8, -46, 2, 19);
  seg2(-46, 2, -64, -8, 15);
  // thumbnail: a pale rounded plate with a lit edge and the cuticle line
  g.save();
  g.translate(-64, -10);
  g.rotate(-0.45);
  const ng = g.createLinearGradient(-6, -4, 6, 4);
  ng.addColorStop(0, mix("#f6e0d6", "#ffffff", fl * 0.5));
  ng.addColorStop(1, "#c89c90");
  g.fillStyle = ng;
  g.beginPath();
  g.ellipse(0, 0, 6.5, 3.6, 0, 0, TAU);
  g.fill();
  g.strokeStyle = rgba(SKD, 0.6);
  g.lineWidth = 0.6;
  g.beginPath(); g.arc(4.5, 0, 3.4, Math.PI * 0.6, Math.PI * 1.4); g.stroke();
  g.strokeStyle = rgba("#ffffff", 0.55);
  g.beginPath(); g.moveTo(-5.5, -1.5); g.quadraticCurveTo(-2, -3.6, 2, -3.2); g.stroke();
  g.restore();
  knuckle(-46, 2, 8, 0.45);
  crease(-46, 2, 6, 3.6, 4.6);
  // --- sleeve (cuff over the wrist) ---
  const sl = new Path2D();
  sl.moveTo(4, -36);
  sl.bezierCurveTo(2, -10, 2, 14, 6, 38);
  sl.lineTo(160, 46);
  sl.lineTo(160, -46);
  sl.closePath();
  const sg = g.createLinearGradient(0, -40, 0, 40);
  sg.addColorStop(0, mix("#d8a820", "#e8eefc", fl * 0.4));
  sg.addColorStop(0.5, "#a07a14");
  sg.addColorStop(1, "#3a2a08");
  g.fillStyle = sg;
  g.fill(sl);
  g.strokeStyle = "rgba(0,0,0,0.3)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(12, -32); g.bezierCurveTo(10, -8, 10, 12, 14, 34);
  g.moveTo(40, -40); g.quadraticCurveTo(52, -8, 44, 40);
  g.stroke();
  g.restore();
}

function shot3(g, t, W, H) {
  const fl = flashAt(t);
  // a slow drift, a hard tremor after the thunder
  const kick = t >= 19 ? Math.exp(-(t - 19) * 1.6) : 0;
  const amp = 1.4 + kick * 9;
  const jx = noise(t * 21, 5) * amp, jy = noise(t * 17, 6) * amp;
  const p = eio(seg(t, 19, 28));
  K.focus(g, W, H, 10, (c) => {
    c.fillStyle = mix("#0a0e16", "#4a5670", fl * 0.7);
    c.fillRect(0, 0, W, H);
    // the round window far behind as a soft disc, rafters as dark bars
    c.fillStyle = mix("#34425a", "#e6eeff", fl);
    c.beginPath();
    c.arc(230, 170, 80, 0, TAU);
    c.fill();
    c.fillStyle = "#06080c";
    c.fillRect(150, 163, 160, 12);
    c.fillRect(224, 90, 12, 160);
    for (let i = 0; i < 4; i++) {
      c.save();
      c.translate(60 + i * 270, 0);
      c.rotate(0.35);
      c.fillRect(0, -40, 30, 480);
      c.restore();
    }
    glow(c, 230, 170, 300, fl > 0.05 ? BOLT : "#6a7a98", 0.22 + fl * 0.6);
  }, "f07bellbg");
  // your fist, coming in from the right, clutching the bell; it trembles (a 14 Hz shiver that
  // jumps when the thunder hits at 19 s)
  const shiver = Math.sin(t * 14 * TAU) * 1.5 * (1 + kick * 2.5) + Math.sin(t * 9.3 * TAU) * 0.5;
  const wx = 700 + jx * 0.4 + shiver - p * 10, wy = 290 + jy * 0.4;
  // cool it down: the only light here is the storm window (applied under the fist's own shading)
  g.save();
  g.globalCompositeOperation = "multiply";
  const cool = g.createLinearGradient(300, 0, 960, 0);
  cool.addColorStop(0, "#d8def8");
  cool.addColorStop(1, "#4a5070");
  g.fillStyle = cool;
  g.fillRect(0, 0, W, H);
  g.restore();
  fistWithBell(g, wx, wy, 230, t, { fl, glint: 0.35 + fl * 1.6 });
  g.save();
  g.globalCompositeOperation = "multiply";
  g.globalAlpha = 0.55;
  g.fillStyle = cool;
  g.fillRect(0, 0, W, H);
  g.restore();
  // the window light catches the left of the brass
  const bx = wx - 74 * 2.3, by = wy + 7 * 2.3;
  glow(g, bx - 14, by - 8, 34, "#bcd0ff", 0.18 + fl * 0.5);
  K.bellGlint(g, bx - 12, by - 14, 22 + 40 * fl, t, { strength: 0.35 + fl, color: "#ffffff" });
  if (fl > 0.05) K.fadeColor(g, W, H, fl * 0.1, BOLT);
}

// ---- SHOT 4: flashback, the bedroom on a stormy night -------------------------------------------------------
function quiltPattern(w, h) {
  return K.sprite("f07quilt", w, h, (s) => {
    const q = ["#4a6fa5", "#e0b25a", "#c2575b", "#e8dcc4"];
    const c = 26;
    for (let i = 0; i * c < w; i++) for (let j = 0; j * c < h; j++) {
      const col = q[(i * 3 + j * 2 + (i * j) % 3) % q.length];
      s.fillStyle = col;
      s.fillRect(i * c, j * c, c, c);
      // little prints inside some squares
      s.fillStyle = rgba(shade(col, -0.25), 0.5);
      if ((i + j) % 3 === 0) for (let k = 0; k < 4; k++) { s.beginPath(); s.arc(i * c + 8 + (k % 2) * 16, j * c + 8 + Math.floor(k / 2) * 16, 2.5, 0, TAU); s.fill(); }
      if ((i + j) % 3 === 1) { s.fillRect(i * c + 4, j * c + 15, c - 8, 3); }
    }
    s.strokeStyle = "rgba(255,250,235,0.55)";
    s.setLineDash([3, 3]);
    s.lineWidth = 1;
    for (let i = 0; i * c < w; i++) { s.beginPath(); s.moveTo(i * c + 1, 0); s.lineTo(i * c + 1, h); s.stroke(); }
    for (let j = 0; j * c < h; j++) { s.beginPath(); s.moveTo(0, j * c + 1); s.lineTo(w, j * c + 1); s.stroke(); }
    s.setLineDash([]);
    // woven fabric texture + a little fading per patch
    const Rq = K.rng("quiltfx");
    for (let i = 0; i < 2600; i++) {
      const x = Rq() * w, y = Rq() * h;
      s.fillStyle = Rq() > 0.5 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.09)";
      s.fillRect(x, y, 1 + Rq() * 2, 1);
    }
    for (let i = 0; i * c < w; i++) for (let j = 0; j * c < h; j++) {
      s.fillStyle = "rgba(0,0,0," + (Rq() * 0.14).toFixed(3) + ")";
      s.fillRect(i * c, j * c, c, c);
    }
  });
}
const BED = { x0: 150, x1: 870, far: 300, near: 372, side: 456 };
function bedroom(g, t, W, H, fl, tremble) {
  // wall: night blue, warm near the nightlight
  g.fillStyle = "#2a2028";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,220,190,0.05)";
  for (let y = 18; y < 470; y += 44) for (let x = (y / 44) % 2 ? 22 : 0; x < W; x += 44) {
    g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 2.2 : 5.5; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    g.fill();
  }
  // window over the headboard: rain, a swaying branch, muted lightning
  const wx = 70, wy = 58, ww = 270, wh = 170;
  g.save();
  g.beginPath();
  g.rect(wx, wy, ww, wh);
  g.clip();
  const sk = g.createLinearGradient(0, wy, 0, wy + wh);
  sk.addColorStop(0, mix("#121a2a", "#a8b8e0", fl));
  sk.addColorStop(1, mix("#1c2840", "#7a88b0", fl));
  g.fillStyle = sk;
  g.fillRect(wx, wy, ww, wh);
  if (fl > 0.1) K.lightningBolt(g, wx + ww * 0.65, wy - 10, wx + ww * 0.45, wy + wh, 7, { alpha: fl, width: 1.5 });
  g.fillStyle = "#0a0e16";
  g.beginPath();
  g.moveTo(wx, wy + wh); g.lineTo(wx, wy + wh * 0.72); g.lineTo(wx + 60, wy + wh * 0.64); g.lineTo(wx + 120, wy + wh * 0.7);
  g.lineTo(wx + 180, wy + wh * 0.58); g.lineTo(wx + ww, wy + wh * 0.68); g.lineTo(wx + ww, wy + wh);
  g.fill();
  const bsw = Math.sin(t * 1.3) * 0.05 + noise(t * 0.8, 3) * 0.06;
  g.save();
  g.translate(wx + ww + 10, wy + 20);
  g.rotate(bsw);
  g.strokeStyle = "#06080c";
  g.lineCap = "round";
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(0, 0); g.quadraticCurveTo(-90, 10, -170, 40);
  g.moveTo(-80, 8); g.quadraticCurveTo(-110, -14, -140, -20);
  g.moveTo(-120, 24); g.quadraticCurveTo(-140, 50, -150, 74);
  g.stroke();
  g.restore();
  K.rain(g, wx + ww, wy + wh, t, { density: 0.35, angle: 0.2, color: "rgba(200,215,240,0.4)", seed: 41 });
  K.glassDrops(g, wx, wy, ww, wh, t, { seed: 42, density: 1.3, light: "#ffe6c0" });
  g.restore();
  g.strokeStyle = "#cfc4b0";
  g.lineWidth = 7;
  g.strokeRect(wx, wy, ww, wh);
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh);
  g.moveTo(wx, wy + wh / 2); g.lineTo(wx + ww, wy + wh / 2);
  g.stroke();
  // curtains
  for (const [cx, dir] of [[wx - 6, -1], [wx + ww + 6, 1]]) {
    const cg = g.createLinearGradient(cx - 40, 0, cx + 40, 0);
    cg.addColorStop(0, "#3a4670");
    cg.addColorStop(0.5, "#6a7aa8");
    cg.addColorStop(1, "#2e3a62");
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(cx - 34 * dir, wy - 20);
    g.lineTo(cx + 26 * dir, wy - 20);
    g.quadraticCurveTo(cx + 10 * dir, wy + wh * 0.6, cx + 30 * dir, wy + wh + 50);
    g.lineTo(cx - 30 * dir, wy + wh + 50);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(10,14,30,0.35)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx - 8 * dir, wy - 16); g.quadraticCurveTo(cx - 2 * dir, wy + wh * 0.6, cx + 10 * dir, wy + wh + 46);
    g.stroke();
  }
  // nightlight: a little shell on the wall, lower right; the key light for the whole scene
  const nx = 915, ny = 362;
  glow(g, nx, ny, 640, NIGHT, 0.3);
  glow(g, nx, ny, 170, NIGHT, 0.42);
  g.fillStyle = "#fff0d0";
  g.beginPath();
  g.arc(nx, ny, 15, Math.PI, 0);
  g.closePath();
  g.fill();
  glow(g, nx, ny - 4, 26, "#ffffff", 0.9);
  // floor
  const fg = g.createLinearGradient(0, 470, 0, H);
  fg.addColorStop(0, "#2e2018");
  fg.addColorStop(1, "#120c08");
  g.fillStyle = fg;
  g.fillRect(0, 466, W, H - 466);
  g.save();
  g.translate(760, 520);
  g.scale(1, 0.2);
  glow(g, 0, 0, 330, NIGHT, 0.32);
  g.restore();
  // headboard
  const wood = (x, y, w, h) => {
    const gr = g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, "#2a1a10");
    gr.addColorStop(0.5, "#6a4428");
    gr.addColorStop(1, "#22140c");
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  };
  wood(122, 214, 38, 290);
  g.fillStyle = "#5a3a22";
  g.beginPath();
  g.arc(141, 214, 21, Math.PI, 0);
  g.fill();
  // the nightlight's warm pool spilling over the foot of the bed and the floor (~260 px across)
  glow(g, 860, 420, 130, NIGHT, 0.32);
  // a toy chest at the foot of the bed, under the nightlight: Biscuit's launch pad
  toyChest(g, 902, 470, 96, 50);
  const pat = quiltPattern(820, 260);
  const px = K.pixelScale();
  // top surface of the quilt (foreshortened), drawn in 6 px strips with a gentle sine warp so the
  // patchwork rolls with the mattress instead of lying like a flat grid
  const top = new Path2D();
  top.moveTo(168, BED.far + 8);
  top.quadraticCurveTo(500, BED.far - 4, 866, BED.far);
  top.lineTo(872, BED.near);
  top.quadraticCurveTo(520, BED.near + 6, 164, BED.near - 2);
  top.closePath();
  g.save();
  g.clip(top);
  // the warped strips are static: painted once into a cached sprite (240 slices per frame was the
  // single biggest cost of this scene)
  const topStrips = K.sprite("f07-quilt-top", 740, 110, (s2) => {
    for (let xx = 160; xx < 880; xx += 3) {
      const off = Math.sin(xx * 0.021 + 0.7) * 4 + Math.sin(xx * 0.047) * 2;
      s2.drawImage(pat, (xx - 160) * px, 0, 3 * px, 120 * px, xx - 150, BED.far - 6 + off - (BED.far - 20), 3.5, BED.near - BED.far + 12);
    }
  });
  g.drawImage(topStrips, 150, BED.far - 20, 740, 110);
  const tg = g.createLinearGradient(0, BED.far, 0, BED.near);
  tg.addColorStop(0, "rgba(20,10,24,0.42)");
  tg.addColorStop(1, "rgba(255,226,180,0.06)");
  g.fillStyle = tg;
  g.fillRect(150, BED.far - 10, 740, 90);
  // shallow folds across the top: soft shadow troughs with a lit ridge beside each
  g.lineCap = "round";
  for (const [x0, x1, y0] of [[620, 760, 318], [700, 860, 344], [180, 260, 330]]) {
    g.strokeStyle = "rgba(20,8,16,0.22)"; g.lineWidth = 7;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, y0 + 10, x1, y0 + 4); g.stroke();
    g.strokeStyle = rgba(NIGHT, 0.12); g.lineWidth = 3;
    g.beginPath(); g.moveTo(x0, y0 - 5); g.quadraticCurveTo((x0 + x1) / 2, y0 + 5, x1, y0 - 1); g.stroke();
  }
  g.restore();
  // pillow, and just a tuft of your hair showing at the edge of the quilt (you are hiding under it)
  const pg = g.createRadialGradient(232, 292, 6, 240, 304, 84);
  pg.addColorStop(0, "#efe4d6");
  pg.addColorStop(1, "#6e6470");
  g.fillStyle = pg;
  g.beginPath();
  g.ellipse(240, 306, 74, 28, -0.04, 0, TAU);
  g.fill();
  g.fillStyle = "rgba(40,24,30,0.35)";
  g.beginPath();
  g.ellipse(268, 318, 40, 9, -0.1, 0, TAU);
  g.fill();
  {
    const hg = g.createRadialGradient(268, 312, 2, 272, 318, 22);
    hg.addColorStop(0, "#7a5034");
    hg.addColorStop(1, "#2e1c10");
    g.fillStyle = hg;
    g.beginPath();
    g.moveTo(250, 328);
    g.bezierCurveTo(252, 312, 266, 304, 284, 306);
    g.lineTo(292, 330);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(150,100,60,0.55)";
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < 6; i++) { const sx = 256 + i * 5; g.moveTo(sx, 326); g.quadraticCurveTo(sx - 4, 314 - (i % 3) * 2, sx - 9 + i, 310 + (i % 2) * 3); }
    g.stroke();
  }
  // the curled-up lump under the quilt (trembles until Biscuit settles). The patchwork is laid
  // over it in warped strips that follow the hump, so rows rise and squeeze over its shoulders.
  const jx = noise(t * 26, 2) * tremble * 1.4, jy = noise(t * 22, 3) * tremble * 1.1;
  const LX0 = 262, LX1 = 618, LB = 358;
  const humpY = (x) => {
    const k = clamp((x - LX0) / (LX1 - LX0));
    return LB - 122 * Math.pow(Math.sin(Math.PI * k), 0.75) * (1 - 0.18 * k) + jy;
  };
  const lump = new Path2D();
  lump.moveTo(LX0 + jx, LB);
  for (let x = LX0; x <= LX1; x += 8) lump.lineTo(x + jx, humpY(x));
  lump.lineTo(LX1 + jx, LB);
  lump.quadraticCurveTo(440, LB + 12, LX0 + jx, LB);
  lump.closePath();
  g.save();
  g.translate(0, 8);
  g.scale(1, 0.14);
  glow(g, 450, LB / 0.14, 200, "#000000", 0.55, "source-over");
  g.restore();
  g.save();
  g.clip(lump);
  // strips over the hump, cached at rest and shifted by the tremble (the clip follows the live shape)
  const lumpStrips = K.sprite("f07-quilt-lump", LX1 - LX0 + 16, 150, (s2) => {
    for (let x = LX0 - 4; x < LX1 + 4; x += 2) {
      const k = clamp((x - LX0) / (LX1 - LX0));
      const yT = LB - 122 * Math.pow(Math.sin(Math.PI * k), 0.75) * (1 - 0.18 * k) - 4;
      s2.drawImage(pat, (x - 150) * px, 40 * px, 2 * px, 180 * px, x - (LX0 - 8), yT - (LB - 140), 2.6, LB + 6 - yT);
    }
  });
  g.drawImage(lumpStrips, LX0 - 8 + jx, LB - 140 + jy, LX1 - LX0 + 16, 150);
  // form shading: dark on the side away from the nightlight, warm light rolling over the top
  const lg = g.createLinearGradient(LX0, 0, LX1, 0);
  lg.addColorStop(0, "rgba(16,8,22,0.55)");
  lg.addColorStop(0.5, "rgba(0,0,0,0.08)");
  lg.addColorStop(1, "rgba(255,214,160,0.18)");
  g.fillStyle = lg;
  g.fillRect(LX0 - 10, 220, LX1 - LX0 + 20, 150);
  const bt = g.createLinearGradient(0, 290, 0, LB + 4);
  bt.addColorStop(0, "rgba(0,0,0,0)");
  bt.addColorStop(1, "rgba(10,4,14,0.55)");
  g.fillStyle = bt;
  g.fillRect(LX0 - 10, 290, LX1 - LX0 + 20, 80);
  // the ridge catches the warm light
  g.strokeStyle = rgba(NIGHT, 0.2);
  g.lineWidth = 10;
  g.beginPath();
  for (let x = LX0 + 40; x <= LX1 - 20; x += 8) { const yy = humpY(x) + 7; if (x === LX0 + 40) g.moveTo(x + jx, yy); else g.lineTo(x + jx, yy); }
  g.stroke();
  // fold shadows: the quilt creases where it bends round your knees and back
  g.lineCap = "round";
  for (const [x0, x1, bend] of [[350, 372, 22], [452, 430, -16], [540, 566, 18], [400, 388, 10]]) {
    const y0 = humpY(x0) + 6;
    g.strokeStyle = "rgba(14,6,18,0.26)"; g.lineWidth = 9;
    g.beginPath(); g.moveTo(x0 + jx, y0); g.quadraticCurveTo(x0 + bend + jx, (y0 + LB) / 2, x1 + jx, LB - 4); g.stroke();
    g.strokeStyle = rgba(NIGHT, 0.1); g.lineWidth = 3;
    g.beginPath(); g.moveTo(x0 + 7 + jx, y0 + 2); g.quadraticCurveTo(x0 + bend + 7 + jx, (y0 + LB) / 2, x1 + 7 + jx, LB - 4); g.stroke();
  }
  g.restore();
  // the side of the quilt hanging toward us, with soft vertical drapes
  const side = new Path2D();
  side.moveTo(164, BED.near - 2);
  side.quadraticCurveTo(520, BED.near + 6, 872, BED.near);
  side.lineTo(876, BED.side);
  for (let x = 876; x >= 160; x -= 24) side.lineTo(x, BED.side + 4 + Math.sin(x * 0.06) * 4);
  side.closePath();
  g.save();
  g.clip(side);
  const sideStrips = K.sprite("f07-quilt-side", 740, 140, (s2) => {
    for (let xx = 160; xx < 880; xx += 4) {
      const off = Math.sin(xx * 0.055) * 5;
      s2.drawImage(pat, (xx - 160) * px, 100 * px, 4 * px, 120 * px, xx - 150, off + 6, 4.5, 120);
    }
  });
  g.drawImage(sideStrips, 150, BED.near - 10, 740, 140);
  const sg = g.createLinearGradient(0, BED.near, 0, BED.side);
  sg.addColorStop(0, "rgba(14,8,18,0.3)");
  sg.addColorStop(1, "rgba(8,4,10,0.65)");
  g.fillStyle = sg;
  g.fillRect(150, BED.near - 6, 740, 100);
  const sr = g.createLinearGradient(160, 0, 880, 0);
  sr.addColorStop(0, "rgba(0,0,0,0.3)");
  sr.addColorStop(1, "rgba(255,210,150,0.18)");
  g.fillStyle = sr;
  g.fillRect(150, BED.near - 6, 740, 100);
  // drapes: each a soft trough with a lit crest
  const dr = g.createLinearGradient(160, 0, 880, 0);
  for (let k = 0; k <= 12; k++) {
    const c = k / 12;
    dr.addColorStop(clamp(c), k % 2 ? "rgba(10,4,14,0.32)" : "rgba(255,220,180,0.06)");
  }
  g.fillStyle = dr;
  g.fillRect(150, BED.near - 6, 740, 100);
  g.restore();
  // piping along the edge, lit by the nightlight
  g.strokeStyle = "rgba(255,220,170,0.35)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(164, BED.near - 2); g.quadraticCurveTo(520, BED.near + 6, 872, BED.near);
  g.stroke();
  wood(866, 296, 32, 200);
  g.fillStyle = "#5a3a22";
  g.fillRect(862, 290, 40, 10);
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.fillRect(BED.x0, BED.side, BED.x1 - BED.x0, 20);
  // the toy chest stands in front of the bedpost
  toyChest(g, 902, 470, 96, 50, true);
}
// a painted wooden toy chest; front = true draws only its front face (so it sits before the bedpost)
function toyChest(g, x, y, w, h, front = false) {
  const x0 = x - w / 2, top = y - h;
  if (!front) {
    g.save();
    g.translate(x, y + 2);
    g.scale(1, 0.12);
    glow(g, 0, 0, w * 0.7, "#000000", 0.6, "source-over");
    g.restore();
    return;
  }
  const fg = g.createLinearGradient(x0, 0, x0 + w, 0);
  fg.addColorStop(0, "#3a2a40");
  fg.addColorStop(0.6, "#5a4060");
  fg.addColorStop(1, "#8a6a70");
  g.fillStyle = fg;
  g.fillRect(x0, top, w, h);
  const lid = g.createLinearGradient(0, top - 8, 0, top + 2);
  lid.addColorStop(0, "#c0a08a");
  lid.addColorStop(1, "#6a4a58");
  g.fillStyle = lid;
  g.fillRect(x0 - 3, top - 7, w + 6, 9);
  g.fillStyle = rgba(NIGHT, 0.3);
  g.fillRect(x0 - 3, top - 7, w + 6, 2);
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.fillRect(x0, top + 2, w, 3);
  // a painted star on the front
  g.fillStyle = "rgba(255,214,140,0.5)";
  g.beginPath();
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 5 : 12; g.lineTo(x - 6 + Math.cos(a) * r, top + h * 0.55 + Math.sin(a) * r); }
  g.fill();
  const vg = g.createLinearGradient(0, top, 0, y);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = vg;
  g.fillRect(x0, top, w, h);
}
// Biscuit's path in the flashback: along the toy chest -> crouch -> jump onto the bed -> walk to you
const ONBED = 342;
const CHEST_Y = 413;
function biscuitIn(t) {
  if (t < 30.0) return { x: 1040, y: CHEST_Y, pose: "walk", phase: 0, a: 0 };
  if (t < 31.0) { const k = seg(t, 30.0, 31.0); return { x: lerp(1040, 912, k), y: CHEST_Y, pose: "walk", phase: (t - 30) * 1.6, a: 1 }; }
  if (t < 31.7) { const k = seg(t, 31.0, 31.7); return { x: 912, y: CHEST_Y, pose: "pounce", phase: lerp(0, 0.4, eio(k)), a: 1 }; }
  if (t < 32.5) {
    const k = seg(t, 31.7, 32.5);
    const x = lerp(912, 790, eio(k)), y = lerp(CHEST_Y, ONBED, k) - Math.sin(k * Math.PI) * 70;
    return { x, y, pose: "pounce", phase: lerp(0.45, 0.95, k), a: 1 };
  }
  if (t < 33.1) return { x: 790, y: ONBED, pose: "stand", phase: 0, a: 1 };
  if (t < 36.2) { const k = seg(t, 33.1, 36.2); return { x: lerp(790, 652, k), y: ONBED, pose: "walk", phase: (t - 33.1) * 1.15, a: 1 }; }
  return { x: 652, y: ONBED + 1, pose: "loaf", phase: 0, a: 1 };
}
const CAT_S = 74;
function headOf(c) { return [c.x - CAT_S * 0.66, c.y - CAT_S * 0.86]; }
function shot4(g, t, W, H) {
  const fl = flashAt(t + 0.0) * 0.35 + K.flash(t, [33.8, 33.95], 0.2) * 0.3;
  const tremble = 1 - smooth(seg(t, 37.4, 39.4));
  const c = biscuitIn(t);
  const loafC = { x: 652, y: ONBED + 1 };
  const head = headOf(loafC);
  // dolly in early (he is ~170 px tall by the time he reaches you), then a slow push to the close-up
  const z1 = eio(seg(t, 34.6, 37.6)), z2 = eio(seg(t, 37.6, 44.2));
  const zoom = 1 + 0.95 * z1 + 0.75 * z2;
  const zc = clamp(z1 * 0.8 + z2 * 0.2);
  K.withCamera(g, W, H, { x: lerp(W / 2, head[0] + 20, zc), y: lerp(H / 2, head[1] + 14, zc), zoom, shakeT: t, shakeAmt: 0.8 }, () => {
    bedroom(g, t, W, H, fl, tremble);
    g.save();
    g.globalCompositeOperation = "multiply";
    const nf = g.createRadialGradient(915, 362, 60, 915, 362, 900);
    nf.addColorStop(0, "#ffffff");
    nf.addColorStop(0.45, "#c8b0a4");
    nf.addColorStop(1, "#3e3040");
    g.fillStyle = nf;
    g.fillRect(-W, -H, W * 3, H * 3);
    g.restore();
    const light = { x: 915, y: 360, color: NIGHT, strength: 1.2 };
    const blink = smooth(seg(t, 41.3, 42.1)) * (1 - smooth(seg(t, 42.7, 43.6)));
    const opts = (pose, phase) => ({
      pose, phase, facing: -1, t, headTurn: pose === "loaf" ? 0.55 : 0.15, tailUp: pose === "walk" ? 0.9 : pose === "pounce" ? 0.5 : 0, tail: 0.4,
      blink: pose === "loaf" ? Math.max(blink, 0.12) : 0, bell: true, collar: true, light, ground: "#120a10", ears: 0.6,
    });
    if (c.a > 0) {
      // settle from standing into a loaf with a short blend
      const sb = seg(t, 36.2, 36.9);
      if (sb > 0 && sb < 1) {
        // a short cross-blend; the outgoing pose drops its fur strokes (it is fading anyway)
        K.drawCat(g, 652, ONBED, CAT_S, Object.assign(opts("stand", 0), { alpha: 1 - sb, lod: 0 }));
        K.drawCat(g, loafC.x, loafC.y, CAT_S, Object.assign(opts("loaf", 0), { alpha: sb, lod: sb > 0.7 ? 2 : 1 }));
      } else K.drawCat(g, c.x, c.y, CAT_S, opts(c.pose, c.phase));
    }
    // purr: a faint warm breath of light round him
    const purr = K.env(t, 39.6, 44, 0.8, 1);
    if (purr > 0) glow(g, head[0] + 30, head[1] + 20, 120, NIGHT, 0.12 * purr * (0.85 + 0.15 * Math.sin(t * 25)));
  });
}

// ---- SHOT 5: present, the candle lights itself; you stand -------------------------------------------------
function shot5a(g, t, W, H) {
  const p = eio(seg(t, 44, 50));
  const spark = K.env(t, 45.2, 46.2, 0.15, 0.5);
  const lit = smooth(seg(t, 45.8, 47.4));
  const cx = 668, cy = 418; // the candle stub: beside you, clear of the subtitles
  K.withCamera(g, W, H, { x: 500 + p * 20, y: 280, zoom: 1.12 + p * 0.06, shakeT: t, shakeAmt: 1 }, () => {
    cornerSet(g, t, W, H, 0, { bats: true });
    batBeam(g, t, 0);
    draped(g, 150, 400, 230, 190, 4, 0, lit, "chair");
    // the warm light spreads over the room as the flame grows: a pool on the boards + the walls
    glow(g, cx, cy - 30, 720, CANDLE, 0.2 * lit);
    g.save();
    g.translate(cx, cy + 6);
    g.scale(1, 0.3);
    glow(g, 0, 0, 260, CANDLE, 0.5 * lit);
    glow(g, 0, 0, 90, "#ffd9a0", 0.5 * lit);
    g.restore();
    huddle(g, 610, 466, 300, t, { tremble: 0.35 * (1 - lit), wet: 0.6, moon: 1 - lit * 0.45, warm: lit, warmAt: { x: cx, y: cy - 30 } });
    stub(g, cx, cy, 40, t, lit, spark);
    K.dust(g, W, H, t, { seed: 73, count: 30, color: "#ffd9a0", size: 1.2, alpha: 0.35 * lit + 0.1 });
  });
}

function shot5b(g, t, W, H) {
  // wider, from behind: you get up, the candle at your feet, the round window ahead
  const p = eio(seg(t, 50, 54));
  const stand = 1 - eio(seg(t, 50.4, 52.6));
  const cam = { x: 0.25, y: 0.2, z: lerp(1.8, 2.3, p), f: 400, cx: W / 2, cy: H * 0.46 };
  K.withCamera(g, W, H, { shakeT: t, shakeAmt: 1 }, () => {
    const st = attic(g, t, W, H, cam, 0, { bats: true, warm: 1 });
    const P = st.P;
    const kid = P(0.35, A.floor, 4.1);
    const cnd = P(0.95, A.floor, 4.0);
    glow(g, cnd[0], cnd[1] - 20, 520, CANDLE, 0.3);
    glow(g, cnd[0], cnd[1] - 20, 180, CANDLE, 0.25);
    stub(g, cnd[0], cnd[1], cnd[2] * 0.12, t, 1, 0);
    K.drawPerson(g, kid[0], kid[1], kid[2] * 1.3, {
      view: "back", hood: true, crouch: stand, t, wet: 0.5, bell: true,
      light: { x: cnd[0] + 40, y: cnd[1] - 40, color: "#ffc070", strength: 1.2 },
    });
    K.dust(g, W, H, t, { seed: 74, count: 30, color: "#ffd9a0", size: 1.2, alpha: 0.3 });
  });
}

// ---- SHOT 6: the round window, lightning, a mountain on fire --------------------------------------------------
// Mount Hairball seen far off: a ridged, eroded cone (not a triangle) fading into haze at its foot, a
// glowing crater, lava threads with glow, and a rising smoke plume whose underside is lit red.
// (mx, by) = summit x / base y, w = base width, h = height px. fl = lightning 0..1.
function volcano(g, mx, by, w, h, t, fl, o = {}) {
  const hazeC = o.haze || "#2a3346";
  const top = by - h;
  const prof = (k, side) => {
    // k 0..1 from summit to base along one flank; concave flanks with noisy ridges
    const x = mx + side * (w * 0.06 + Math.pow(k, 1.35) * w * 0.44);
    const y = top + k * h + noise(k * 9 + (side > 0 ? 3 : 7), 5) * h * 0.06 * (0.3 + k);
    return [x, y];
  };
  const body = new Path2D();
  const N = 22;
  let p0 = prof(1, -1);
  body.moveTo(p0[0], by + 2);
  for (let i = N; i >= 0; i--) { const p = prof(i / N, -1); body.lineTo(p[0], p[1]); }
  // a notched crater rim
  body.lineTo(mx - w * 0.03, top + h * 0.035);
  body.lineTo(mx + w * 0.02, top + h * 0.02);
  for (let i = 0; i <= N; i++) { const p = prof(i / N, 1); body.lineTo(p[0], p[1]); }
  p0 = prof(1, 1);
  body.lineTo(p0[0], by + 2);
  body.closePath();
  const bg = g.createLinearGradient(0, top, 0, by);
  bg.addColorStop(0, mix("#120e14", "#6a7290", fl * 0.9));
  bg.addColorStop(0.6, mix("#181a24", "#5a6280", fl * 0.8));
  bg.addColorStop(1, mix(hazeC, "#8a96b8", fl * 0.6));
  g.fillStyle = bg;
  g.fill(body);
  g.save();
  g.clip(body);
  // ridges / gullies running down the flanks (lit edge on the left in a flash)
  g.lineCap = "round";
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 1 : -1, k0 = 0.12 + hash(i, 31) * 0.2;
    const a = prof(k0, side * (0.2 + hash(i, 32) * 0.7));
    const b = prof(1, side * (0.25 + hash(i, 33) * 0.8));
    g.strokeStyle = rgba("#000000", 0.25);
    g.lineWidth = Math.max(1, w * 0.012);
    g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo((a[0] + b[0]) / 2 + side * w * 0.02, (a[1] + b[1]) / 2, b[0], b[1]); g.stroke();
    if (fl > 0.05) {
      g.strokeStyle = rgba("#dfe6ff", 0.3 * fl);
      g.lineWidth = Math.max(0.6, w * 0.005);
      g.beginPath(); g.moveTo(a[0] - 1.5, a[1]); g.quadraticCurveTo((a[0] + b[0]) / 2 + side * w * 0.02 - 1.5, (a[1] + b[1]) / 2, b[0] - 1.5, b[1]); g.stroke();
    }
  }
  // lava threads: glowing, braided down from the rim
  const threads = [[-0.02, 0.55, -0.12], [0.03, 0.45, 0.1], [0.0, 0.3, 0.02]];
  for (const [x0, len, drift] of threads) {
    const sx = mx + x0 * w, sy = top + h * 0.04;
    const ex = sx + drift * w, ey = sy + len * h;
    g.strokeStyle = rgba("#ff5a1e", 0.35);
    g.lineWidth = Math.max(1.5, w * 0.014);
    g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + drift * w * 0.2, (sy + ey) / 2, ex, ey); g.stroke();
    g.strokeStyle = rgba("#ffd27a", 0.75);
    g.lineWidth = Math.max(0.6, w * 0.005);
    g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + drift * w * 0.2, (sy + ey) / 2, ex, ey); g.stroke();
  }
  // the crater glow lights the rock just under the rim
  const cg = g.createRadialGradient(mx, top, 1, mx, top, h * 0.45);
  cg.addColorStop(0, "rgba(255,110,40,0.55)");
  cg.addColorStop(1, "rgba(255,90,30,0)");
  g.fillStyle = cg;
  g.fillRect(mx - w * 0.3, top - 4, w * 0.6, h * 0.5);
  // atmospheric haze: the foot of the mountain sinks into the valley air
  const hz = g.createLinearGradient(0, top + h * 0.35, 0, by);
  hz.addColorStop(0, rgba(hazeC, 0));
  hz.addColorStop(1, rgba(mix(hazeC, "#8a96b8", fl * 0.6), 0.75));
  g.fillStyle = hz;
  g.fillRect(mx - w, top, w * 2, h + 4);
  g.restore();
  // crater: lava glow
  glow(g, mx, top + h * 0.02, h * 0.42, "#ff5a1e", 0.55 + 0.15 * Math.sin(t * 3));
  glow(g, mx, top + h * 0.02, h * 0.12, "#ffe07a", 0.85);
  // smoke plume: puffs rising continuously (each on its own looping phase), dark on top, red below
  const n = o.puffs || 11;
  for (let i = 0; i < n; i++) {
    const k = ((t * 0.05 + i / n) % 1 + 1) % 1;
    const a = Math.min(1, k * 6) * (1 - k);
    const px = mx + k * w * 0.32 + Math.sin(i * 1.7 + t * 0.3) * w * 0.02;
    const py = top - k * h * 1.6;
    const pr = h * (0.1 + k * 0.32);
    glow(g, px, py, pr, mix("#241a1e", "#9aa0b8", fl * 0.7), 0.8 * a, "source-over");
    glow(g, px - pr * 0.1, py + pr * 0.45, pr * 0.75, "#ff4a1a", 0.32 * a * (1 - k * 0.8));
  }
}
function valley(g, cx, cy, r, t, fl) {
  const x0 = cx - r, y0 = cy - r, w = r * 2;
  const sk = g.createLinearGradient(0, y0, 0, cy + r);
  sk.addColorStop(0, mix("#10161f", "#c6d2f0", fl));
  sk.addColorStop(0.6, mix("#1c2432", "#8a98bc", fl));
  sk.addColorStop(1, mix("#121820", "#4a5470", fl));
  g.fillStyle = sk;
  g.fillRect(x0, y0, w, w);
  // storm clouds, lit from inside by the flash
  K.clouds(g, x0 + w, cy, t, { seed: 77, color: mix("#232b3a", "#dfe6ff", fl * 0.8), shade: mix("#0c1018", "#6a7698", fl * 0.6), count: 6, y: y0 + r * 0.4, spread: r * 0.3, speed: 6, scale: 0.8, alpha: 0.9 });
  if (fl > 0.1) K.lightningBolt(g, cx - r * 0.35, y0, cx - r * 0.15, cy + r * 0.2, 11, { alpha: fl, width: 2.4 });
  // the far mountain: ridged, hazy, its crater always glowing
  volcano(g, cx + r * 0.46, cy + r * 0.52, r * 1.5, r * 0.44, t, fl, { haze: "#283044" });

  // valley ridges + a few lit village windows
  g.fillStyle = mix("#0c1016", "#3a4258", fl * 0.8);
  g.beginPath();
  g.moveTo(x0, cy + r);
  for (let x = x0; x <= x0 + w; x += 10) g.lineTo(x, cy + r * 0.56 + Math.sin(x * 0.02) * r * 0.05 + noise(x * 0.01, 3) * r * 0.06);
  g.lineTo(x0 + w, cy + r);
  g.fill();
  for (let i = 0; i < 9; i++) glow(g, x0 + w * (0.1 + hash(i, 3) * 0.8), cy + r * (0.66 + hash(i, 4) * 0.2), 4, "#ffcf7a", 0.6);
  K.rain(g, x0 + w, cy + r, t, { density: 0.6, angle: 0.25, color: "rgba(200,215,240,0.45)", seed: 52 });
}
function shot6(g, t, W, H) {
  const fl = flashAt(t);
  const p = eio(seg(t, 54, 62));
  K.withCamera(g, W, H, { x: 480, y: 290 - p * 10, zoom: 1.0 + p * 0.07, shakeT: t, shakeAmt: 1 + fl * 4 }, () => {
    // attic wall of planks around the window, warm from the candle behind us
    g.fillStyle = mix("#1c1a1e", "#8a92a8", fl * 0.5);
    g.fillRect(-50, -50, W + 100, H + 100);
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.lineWidth = 2;
    g.beginPath();
    for (let x = -40; x < W + 60; x += 52) { g.moveTo(x, -50); g.lineTo(x, H + 50); }
    g.stroke();
    glow(g, 200, 640, 700, CANDLE, 0.3);
    const cx = 480, cy = 250, r = 168;
    roundWindow(g, cx, cy, r, t, fl, { outside: (c, x, y, rr, f) => valley(c, x, y, rr, t, f) });
    // the sill + Biscuit's amber pawprints going out
    const sy = cy + r + 26;
    const sg = g.createLinearGradient(0, sy - 12, 0, sy + 22);
    sg.addColorStop(0, mix("#6a4a30", "#a8b0c8", fl * 0.4));
    sg.addColorStop(1, "#1a120c");
    g.fillStyle = sg;
    g.fillRect(cx - 240, sy - 18, 480, 40);
    g.strokeStyle = "rgba(30,18,8,0.4)";
    g.lineWidth = 1;
    g.beginPath();
    for (let k = 0; k < 5; k++) { g.moveTo(cx - 240, sy - 12 + k * 6); g.bezierCurveTo(cx - 80, sy - 14 + k * 6, cx + 60, sy - 9 + k * 6, cx + 240, sy - 12 + k * 6); }
    g.stroke();
    glow(g, cx - 160, sy, 220, CANDLE, 0.22);
    g.fillStyle = "rgba(255,200,140,0.3)";
    g.fillRect(cx - 230, sy - 12, 460, 2);
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const appear = 55.2 + i * 0.45;
      const a = clamp((t - appear) * 2.5) * (1 - smooth(seg(t, appear + 2.8, appear + 4.2)) * 0.55);
      if (a <= 0) continue;
      pts.push({ x: cx - 190 + i * 52, y: sy - 4 - (i % 2) * 7, a: Math.PI / 2, s: 14, alpha: a, flat: 0.45 });
    }
    K.pawprints(g, pts, 1.3);
    glow(g, cx, cy, r * 2.4, fl > 0.05 ? BOLT : "#7a8aa8", 0.08 + fl * 0.4);
  });
  if (fl > 0.05) K.fadeColor(g, W, H, fl * 0.12, BOLT);
}

// ---- SHOT 7: out onto the wet roof, the storm moving off ---------------------------------------------------------
function shot7(g, t, W, H) {
  const p = eio(seg(t, 62, 68));
  const clear = smooth(seg(t, 62, 67));
  K.withCamera(g, W, H, { x: 480 + p * 22, y: 270 - p * 8, zoom: 1.02 + p * 0.04, shakeT: t, shakeAmt: 0.9 }, () => {
    K.sky(g, W, H, { top: mix("#0e1420", "#1a2840", clear), mid: "#24304a", bottom: "#3a4258", horizon: 0.72 });
    // a gap opening in the clouds, the moon behind it
    const mx = 700, my = 112;
    K.clouds(g, W, H, t, { seed: 81, color: "#2a3448", shade: "#0e131e", count: 10, y: H * 0.18, spread: H * 0.14, speed: 14, scale: 1.3, alpha: 0.95 });
    const gap = g.createRadialGradient(mx, my, 10, mx, my, 90 + clear * 150);
    gap.addColorStop(0, rgba("#5a6c94", 0.95));
    gap.addColorStop(0.6, rgba("#3a4868", 0.6 * clear + 0.2));
    gap.addColorStop(1, "rgba(40,50,80,0)");
    g.fillStyle = gap;
    g.fillRect(0, 0, W, H);
    K.moon(g, mx, my, 24, { glow: 0.4 + 0.5 * clear });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.3, d = 70 + clear * 110 + hash(i, 5) * 30;
      glow(g, mx + Math.cos(a) * d * 1.4, my + Math.sin(a) * d * 0.7, 40 + hash(i, 6) * 30, "#c8d8ff", 0.16 * (0.4 + clear));
    }
    K.godRays(g, mx, my, W, H, { color: "#bcd0ff", count: 8, strength: 0.14 * clear, t, angle: Math.PI / 2 + 0.35, spread: 0.7, length: H * 1.1, seed: 12 });
    // far valley + Mount Hairball glowing on the horizon
    K.hills(g, W, H, { y: H * 0.64, amp: 26, color: "#1a2030", seed: 4, haze: "#3a4258", hazeAmt: 0.45 });
    volcano(g, 840, H * 0.64, 240, 88, t, 0, { haze: "#2e374c", puffs: 9 });
    K.hills(g, W, H, { y: H * 0.72, amp: 20, color: "#0e121a", seed: 7 });
    // ---- the roof, seen three-quarter from above: the ridge runs from the near left corner away
    // to the right; the slope you stand on falls toward the camera ----
    const VP = [1150, 250];
    const A = [-120, 520], B = [300, 980], C = [-120, 494];
    const L = (P, u) => [lerp(P[0], VP[0], u), lerp(P[1], VP[1], u)];
    const U = 0.62;
    const r0 = L(A, 0), r1 = L(A, U), e0 = L(B, 0), e1 = L(B, U), f0 = L(C, 0), f1 = L(C, U);
    // far slope (facing away, a thin dark strip beyond the ridge)
    g.fillStyle = "#0b0e14";
    g.beginPath(); g.moveTo(f0[0], f0[1]); g.lineTo(f1[0], f1[1]); g.lineTo(r1[0], r1[1]); g.lineTo(r0[0], r0[1]); g.closePath(); g.fill();
    // a chimney stack on the ridge for scale, wet brick catching the moon on one side
    {
      const c = L(A, 0.5), s = 1 - 0.5 * 0.5;
      const cw = 46 * s, ch = 92 * s;
      const cg = g.createLinearGradient(c[0] - cw / 2, 0, c[0] + cw / 2, 0);
      cg.addColorStop(0, "#2a2024");
      cg.addColorStop(0.7, "#4a3a3c");
      cg.addColorStop(1, "#7a7088");
      g.fillStyle = cg;
      g.fillRect(c[0] - cw / 2, c[1] - ch, cw, ch + 6);
      g.fillStyle = "#1a1418";
      g.fillRect(c[0] - cw / 2 - 4, c[1] - ch - 8, cw + 8, 9);
      g.strokeStyle = "rgba(0,0,0,0.35)";
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 1; k < 9; k++) { g.moveTo(c[0] - cw / 2, c[1] - ch + k * ch / 9); g.lineTo(c[0] + cw / 2, c[1] - ch + k * ch / 9); }
      g.stroke();
      // a faint wisp of warm smoke
      for (let i = 0; i < 4; i++) { const k = ((t * 0.12 + i / 4) % 1 + 1) % 1; glow(g, c[0] + k * 40, c[1] - ch - 12 - k * 60, 10 + k * 22, "#4a4a58", 0.35 * (1 - k), "source-over"); }
    }
    // near slope
    const roof = new Path2D();
    roof.moveTo(r0[0], r0[1]); roof.lineTo(r1[0], r1[1]); roof.lineTo(e1[0], e1[1]); roof.lineTo(e0[0], e0[1]); roof.closePath();
    const rg = g.createLinearGradient(0, 300, 0, H);
    rg.addColorStop(0, "#2a3242");
    rg.addColorStop(1, "#0a0c12");
    g.fillStyle = rg;
    g.fill(roof);
    g.save();
    g.clip(roof);
    // slate courses: lines converging on the vanishing point, wider apart toward the camera
    const NC = 16;
    const vAt = (k) => Math.pow(k / NC, 1.5);
    for (let k = 1; k <= NC; k++) {
      const v = vAt(k), vp = vAt(k - 1);
      const s0 = [lerp(A[0], B[0], v), lerp(A[1], B[1], v)];
      const sp = [lerp(A[0], B[0], vp), lerp(A[1], B[1], vp)];
      // the lit lower lip of each course (wet edges catch the moon)
      g.strokeStyle = rgba("#9fb4e0", 0.1 + 0.08 * clear);
      g.lineWidth = 1 + v * 1.5;
      g.beginPath(); g.moveTo(s0[0], s0[1] - 1.5); g.lineTo(VP[0], VP[1]); g.stroke();
      g.strokeStyle = "rgba(0,0,0,0.55)";
      g.lineWidth = 1 + v * 2;
      g.beginPath(); g.moveTo(s0[0], s0[1]); g.lineTo(VP[0], VP[1]); g.stroke();
      // the joints between slates, staggered course by course, spaced in perspective
      g.strokeStyle = "rgba(0,0,0,0.42)";
      g.lineWidth = 0.8 + v;
      g.beginPath();
      for (let j = 0; j < 40; j++) {
        const u = 1 - Math.pow(0.9, j + (k % 2) * 0.5);
        if (u > U) break;
        const a = [lerp(sp[0], VP[0], u), lerp(sp[1], VP[1], u)], b = [lerp(s0[0], VP[0], u), lerp(s0[1], VP[1], u)];
        g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      }
      g.stroke();
    }
    // the moon's wet specular streak, stretched down the slope toward us
    g.save();
    g.globalCompositeOperation = "lighter";
    g.translate(600, 450);
    g.rotate(0.83);
    g.scale(1, 0.3);
    const sh = g.createRadialGradient(0, 0, 4, 0, 0, 240);
    sh.addColorStop(0, rgba("#d8e4ff", 0.28 * clear + 0.08));
    sh.addColorStop(0.4, rgba("#bcd0ff", 0.12 * clear + 0.03));
    sh.addColorStop(1, "rgba(180,200,255,0)");
    g.fillStyle = sh;
    g.fillRect(-260, -260, 520, 520);
    g.restore();
    puddleSheen(g, t);
    // the gable end of the roof: the slates stop at a moonlit barge board
    g.strokeStyle = "#1a1f2a";
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(r1[0], r1[1]); g.lineTo(e1[0], e1[1]); g.stroke();
    // the far end of the roof dissolves into the rain haze
    const hz = g.createLinearGradient(400, 0, 960, 0);
    hz.addColorStop(0, "rgba(40,50,72,0)");
    hz.addColorStop(1, "rgba(40,50,72,0.55)");
    g.fillStyle = hz;
    g.fillRect(0, 0, W, H);
    g.restore();
    // ridge cap tiles, rim-lit by the moon
    g.lineCap = "round";
    g.strokeStyle = "#151a24";
    g.lineWidth = 10;
    g.beginPath(); g.moveTo(r0[0], r0[1]); g.lineTo(r1[0], r1[1]); g.stroke();
    g.strokeStyle = rgba("#c8d8ff", 0.35 + clear * 0.25);
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(r0[0], r0[1] - 4); g.lineTo(r1[0], r1[1] - 2); g.stroke();
    // you, on the slope just below the ridge on the left third, looking out at the far glow
    const kx = 290, ky = 472, kh = 192;
    K.drawPerson(g, kx, ky, kh, {
      view: "back", hood: true, t, wet: 0.9, bell: true,
      light: { x: mx, y: my, color: "#bcd0ff", strength: 0.9 },
    });
    // the bell rings (62): a glint flares on your left wrist
    const ring = K.env(t, 61.9, 64.6, 0.08, 1.4);
    if (ring > 0) {
      glow(g, kx - kh * 0.17, ky - kh * 0.36, 26, "#ffe7a8", 0.35 * ring);
      K.bellGlint(g, kx - kh * 0.17, ky - kh * 0.36, 30 * ring, t, { strength: ring });
    }
    K.rain(g, W, H, t, { density: 0.5 * (1 - clear * 0.7), angle: 0.22, color: "rgba(200,215,240,0.4)", seed: 61 });
    K.splashes(g, W, H, t, { y0: 440, y1: H, x0: 200, x1: W, density: 0.5 * (1 - clear * 0.6) });
  });
}
function puddleSheen(g, t) {
  // little standing water on the slates catching the moon
  for (let i = 0; i < 7; i++) {
    const x = 440 + hash(i, 61) * 480, y = 430 + hash(i, 62) * 80;
    g.save();
    g.translate(x, y);
    g.rotate(-0.12);
    g.scale(1, 0.2);
    glow(g, 0, 0, 24 + hash(i, 63) * 26, "#bcd0ff", 0.16 + 0.05 * Math.sin(t * 2 + i));
    g.restore();
  }
}

// ---- assembly ---------------------------------------------------------------------------------------------
function frame(g, t, W, H) {
  if (t < 10) {
    shot1(g, t, W, H);
    K.finish(g, W, H, t, { bloom: 0.35, tint: "#3a4a6a", tintAlpha: 0.22, vignette: 0.62, grain: 0.06 });
    const ta = K.env(t, 1.0, 5.5, 1.5, 1.0);
    if (ta > 0) K.title(g, W, H, "Thunder", "Chapter 7", ta, { size: 60, y: 150, glow: "#bcd0ff" });
    K.fadeBlack(g, W, H, 1 - smooth(seg(t, 0, 1.2)));
  } else if (t < 19) {
    shot2(g, t, W, H);
    if (t > 17) quiltPattern(820, 260); // warm the flashback quilt cache before its cut
    K.finish(g, W, H, t, { bloom: 0.3, tint: "#3a4a6a", tintAlpha: 0.22, vignette: 0.65, grain: 0.06 });
  } else if (t < 28) {
    shot3(g, t, W, H);
    K.finish(g, W, H, t, { bloom: 0.4, tint: "#3a4a6a", tintAlpha: 0.2, vignette: 0.6, grain: 0.06 });
  } else if (t < 44.8) {
    const into = smooth(seg(t, 28, 28.8)), back = smooth(seg(t, 44, 44.8));
    if (into < 1) {
      shot3(g, t, W, H);
      K.finish(g, W, H, t, { bloom: 0.4, tint: "#3a4a6a", tintAlpha: 0.2, vignette: 0.6, grain: 0.06, letterbox: false });
    } else if (back > 0) {
      shot5a(g, t, W, H);
      K.finish(g, W, H, t, { bloom: 0.35, tint: "#5a4a3a", tintAlpha: 0.18, vignette: 0.62, grain: 0.06, letterbox: false });
    }
    dissolve(g, W, H, into * (1 - back), "f07mix", (c) => {
      shot4(c, t, W, H);
      // a memory: warm grade, heavier grain, a soft, glowing edge
      K.grade(c, W, H, { tint: "#ffcf8a", alpha: 0.22, mode: "soft-light" });
      K.grade(c, W, H, { tint: "#ffb070", alpha: 0.12, mode: "overlay" });
      K.bloom(c, 0.4);
      K.vignette(c, W, H, 0.7, "#2a1a10");
      K.grain(c, W, H, t, 0.1);
    });
    K.letterbox(g, W, H, 1);
  } else if (t < 50) {
    shot5a(g, t, W, H);
    K.finish(g, W, H, t, { bloom: 0.35, tint: "#5a4a3a", tintAlpha: 0.18, vignette: 0.62, grain: 0.06 });
  } else if (t < 54) {
    shot5b(g, t, W, H);
    K.finish(g, W, H, t, { bloom: 0.35, tint: "#5a4a3a", tintAlpha: 0.18, vignette: 0.62, grain: 0.06 });
  } else if (t < 62) {
    shot6(g, t, W, H);
    K.finish(g, W, H, t, { bloom: 0.45, tint: "#3a4a6a", tintAlpha: 0.2, vignette: 0.62, grain: 0.06 });
  } else {
    shot7(g, t, W, H);
    K.finish(g, W, H, t, { bloom: 0.4, tint: "#3a4a6a", tintAlpha: 0.2, vignette: 0.6, grain: 0.06 });
    K.fadeBlack(g, W, H, smooth(seg(t, 66.2, 68)));
  }
}

export const film = {
  id: 7,
  title: "Thunder",
  chapter: "Chapter 7",
  unlockAt: 35,
  duration: D,
  poster: 42,
  tagline: "When you were scared, he was there.",
  subs: [
    [5.0, 9.0, "The storm found you in the attic."],
    [11.0, 15.5, "You were scared. Really scared."],
    [20.5, 24.5, "You held the bell and tried not to cry."],
    [30.0, 34.0, "When you were little, storms were the worst."],
    [35.0, 39.0, "And every time, he came."],
    [41.0, 44.0, "He never let you be scared alone."],
    [46.0, 50.5, "Maybe he still wasn't letting you."],
    [55.5, 59.5, "Out past the storm, a mountain on fire."],
    [59.8, 62.0, "His pawprints, on the windowsill."],
  ],
  voice: [
    [5.0, "The storm found you in the attic.", { rate: 0.92, pitch: 1.0 }],
    [11.0, "You were scared. Really scared.", { rate: 0.85, pitch: 0.95 }],
    [20.5, "You held the bell and tried not to cry.", { rate: 0.85, pitch: 0.95 }],
    [30.0, "When you were little, storms were the worst.", { rate: 0.92, pitch: 1.0 }],
    [35.0, "And every time, he came.", { rate: 0.92, pitch: 1.0 }],
    [41.0, "He never let you be scared alone.", { rate: 0.92, pitch: 1.0 }],
    [46.0, "Maybe he still wasn't letting you.", { rate: 0.92, pitch: 1.0 }],
    [55.5, "Out past the storm, a mountain on fire.", { rate: 0.92, pitch: 1.0 }],
    [59.8, "His pawprints, on the windowsill.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: { mood: "storm", key: "A", bpm: 62, cues: [[4, "thunder"], [19, "thunder"], [32, "swell"], [40, "purr"], [54, "thunder"], [62, "bell"]] },
  draw(g, t, W, H) {
    t = clamp(t, 0, D);
    const sx = W / 960, sy = H / 540;
    g.save();
    if (sx !== 1 || sy !== 1) g.scale(sx, sy);
    try { frame(g, t, 960, 540); } finally { g.restore(); }
  },
};
