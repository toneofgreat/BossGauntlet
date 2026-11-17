// films/f20.js - Finale "Home" (FILMS.md f20). Sunrise at The End Of Cats: a white hill, mist in the valleys,
// and Biscuit sitting at the top, facing the sun. You run to him; he headbutts your hand; you tie his bell back
// on. A hundred cats watch; Sir Whiskers rests in the gold light. Through the paw ring, home: the garden after
// the rain, and the bedroom at dawn, Biscuit asleep on the quilt beside you. THE END.
// draw(g, t, W, H) is a pure function of t; only static art is cached (sprites / layers).
import * as K from "../filmkit.js";
import { inLayer, put, soft, catBack, warmBack, stoneRing, plain, lines, bell, hand } from "./lib1820.js";

const D = 80;
const TAU = Math.PI * 2;

// ---- palette (FILMS.md f20: gold sun, rose clouds, sky #bcd6ff -> #fff1e0, dew on white grass; dawn bedroom) -----
const SUN = "#ffd27a";
const ROSE = "#ffb8a8";
const SUNLIGHT = { color: "#ffd9a0", strength: 1.6 };
const OLD = { base: "#d9995a", light: "#f2c890", dark: "#a8683a", stripe: "#8a4a1c", tip: "#7a3a10", belly: "#f6e6cc", white: "#fbf6ee", bib: true, socks: "all", muzzle: true, stripeAlpha: 0.55, iris: "#c8b04a", irisInner: "#f0d27a", bentEar: false };
const HILLPAL = { key: "f20plain", g0: "#fff0e0", g1: "#f2dccc", g2: "#c8b0b8", g3: "#8a7890", lit: "#fff6ea", mid: "#d8c2c4", shade: "#a08ca0", edge: "#fff0d8" };

// ---- the sunrise world ------------------------------------------------------------------------------------------
// sunrise sky, sun at (sx, sy) breaking the horizon hz, rose clouds, valleys of mist
function dawnSky(g, W, H, t, hz, sx, sy, o = {}) {
  const gr = g.createLinearGradient(0, -H * 0.3, 0, hz);
  gr.addColorStop(0, "#7ea0d8");
  gr.addColorStop(0.42, "#c8c4e2");
  gr.addColorStop(0.75, "#ffc8b0");
  gr.addColorStop(1, "#ffe2b8");
  g.fillStyle = gr;
  g.fillRect(-W, -H, W * 3, hz + H + 4);
  K.glow(g, sx, sy, W * 0.9, "#ffb870", 0.28);
  K.glow(g, sx, sy, W * 0.35, "#ffd890", 0.4);
  // rose clouds, lit from below
  g.save();
  g.globalAlpha *= 0.85;
  K.clouds(g, W, H, t, { seed: 201, color: "#ffc6b4", shade: "#d89aa8", count: 6, y: hz * 0.42, spread: hz * 0.18, speed: 3, scale: 1.25 });
  K.clouds(g, W, H, t, { seed: 202, color: "#ffe0c8", shade: "#e8aab0", count: 4, y: hz * 0.72, spread: hz * 0.06, speed: 5, scale: 0.8 });
  g.restore();
  // the sun breaking the horizon
  g.save();
  g.beginPath(); g.rect(-W, -H, W * 3, hz + H); g.clip();
  K.sunGlow(g, sx, sy, o.sunR || 22, SUN, 1);
  g.restore();
}
// receding white hills with mist between them (atmospheric perspective toward the sun)
function valleys(g, W, H, t, hz) {
  K.hills(g, W, H, { y: hz + 6, amp: 22, color: "#b8a0b8", seed: 21, haze: "#ffe6d4", hazeAmt: 0.55, freq: 1.4 });
  K.fog(g, W, H, { y: hz + 14, h: 30, color: "#fff0e0", alpha: 0.5, t, wisps: true, seed: 22 });
  K.hills(g, W, H, { y: hz + 34, amp: 30, color: "#9a84a4", seed: 23, haze: "#f8dcd0", hazeAmt: 0.4, freq: 1.1 });
  K.fog(g, W, H, { y: hz + 46, h: 36, color: "#ffeee0", alpha: 0.42, t: t * 1.3, wisps: true, seed: 24 });
}
// the near hill: a white, dewy crest at (hx, hy); grass back-lit by the sun
function hill(g, W, H, t, hx, hy, o = {}) {
  const sp = o.spread || 1;
  const p = new Path2D();
  p.moveTo(-W, H * 2);
  p.lineTo(-W, hy + 170 * sp);
  p.bezierCurveTo(hx - 380 * sp, hy + 70 * sp, hx - 170 * sp, hy, hx, hy - 2);
  p.bezierCurveTo(hx + 190 * sp, hy, hx + 400 * sp, hy + 80 * sp, W * 2, hy + 150 * sp);
  p.lineTo(W * 2, H * 2);
  p.closePath();
  const hg = g.createLinearGradient(0, hy - 6, 0, hy + 300 * sp);
  hg.addColorStop(0, "#f0dcd0");
  hg.addColorStop(0.05, "#b8a0b2");
  hg.addColorStop(0.3, "#7c6a90");
  hg.addColorStop(1, "#3c3256");
  g.fillStyle = hg;
  g.fill(p);
  // long warm light raking across the slope
  g.save();
  g.clip(p);
  g.globalCompositeOperation = "lighter";
  const lg = g.createRadialGradient(o.sunX || hx + 200, hy - 40, 10, o.sunX || hx + 200, hy - 40, 600 * sp);
  lg.addColorStop(0, "rgba(255,200,140,0.28)");
  lg.addColorStop(1, "rgba(255,210,150,0)");
  g.fillStyle = lg;
  g.fillRect(-W, hy - 50, W * 3, H * 2);
  g.restore();
  // soft back-lit grass that follows the curve of the hill (tufts of varied height), and dew glints
  g.save();
  g.clip(p);
  g.translate(0, -6);
  K.grass(g, hx - 160 * sp, hx + 170 * sp, hy + 5, { seed: 203, color: "#c8b2bc", light: "#f2dccc", dark: "#a08ca4", height: 8 * Math.min(sp, 1.3), t, wind: 0.5, density: 0.9 });
  g.restore();
  for (let i = 0; i < 12; i++) {
    const u = (i + 0.5) / 12, x = hx + (u - 0.5) * 860 * sp;
    const d = (x - hx) / (400 * sp);
    const y = hy - 2 + (d < 0 ? Math.pow(-d, 1.9) * 75 * sp : Math.pow(d, 1.9) * 80 * sp) + 3;
    K.grass(g, x - 38 * sp, x + 38 * sp, y + 4, { seed: 210 + i, color: "#b09aac", light: "#ead0c0", dark: "#7a6888", height: (9 + K.hash(i, 7) * 9) * Math.min(sp, 1.4), t, wind: 0.5, density: 0.6 });
  }
  for (let i = 0; i < Math.round(40 * sp); i++) {
    const x = hx - 400 * sp + K.hash(i, 204) * 800 * sp, y = hy + 6 + K.hash(i, 205) * 120 * sp + Math.abs(x - hx) * 0.18;
    const tw = Math.max(0, Math.sin(t * 1.7 + i * 2.3));
    K.glow(g, x, y, 2 + K.hash(i, 206) * 3, "#fffbe8", 0.3 + 0.45 * tw);
    if (tw > 0.92) K.bellGlint(g, x, y, 4 + K.hash(i, 207) * 3, t, { strength: (tw - 0.92) * 9 });
  }
  return p;
}
function backlitCat(g, W, H, x, y, size, o, shade, key) {
  const L = inLayer(g, W, H, key, (q) => K.drawCat(q, x, y, size, o));
  L.g.save();
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  L.g.globalCompositeOperation = "source-atop";
  L.g.fillStyle = K.rgba("#4a2c3c", shade);
  L.g.fillRect(0, 0, L.canvas.width, L.canvas.height);
  L.g.restore();
  put(g, W, H, L, 1);
  // the rim again, on top of the shade
  K.glow(g, x + size * 0.1, y - size * 1.2, size * 1.4, "#ffd890", 0.18 * shade);
}
const BISC = (o) => Object.assign({ facing: 1, collar: true, bell: false, tail: 0.4, ground: "#6a5468" }, o);

// ---- shot 1 [0-12] ultra-wide: sunrise, and him at the top of the hill -------------------------------------------
function shot1(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 0, 12));
  const hz = 296;
  const sx = 528, sy = K.lerp(hz + 18, hz - 26, K.ease.out(K.seg(t, 0.5, 12)));
  K.withCamera(g, W, H, { x: 480 + p * 12, y: 270 - p * 8, zoom: 1.0 + p * 0.05, shakeT: t, shakeAmt: 0.6 }, (c) => {
    dawnSky(c, W, H, t, hz, sx, sy, { sunR: 20 });
    valleys(c, W, H, t, hz);
    // a third, nearer ridge with mist pooled in the valley before it
    K.hills(c, W, H, { y: hz + 58, amp: 26, color: "#8a7498", seed: 26, haze: "#f4d8d0", hazeAmt: 0.3, freq: 1.3 });
    K.fog(c, W, H, { y: hz + 70, h: 34, color: "#fff0e4", alpha: 0.45, t: t * 1.1, wisps: true, seed: 27 });
    hill(c, W, H, t, 520, 352, { spread: 1.0, sunX: sx });
    // him: small, sitting at the top, seen from behind, facing the sun; the bent ear against the light
    backlitCat(c, W, H, 524, 352, 26, BISC({ pose: "sit", t, headTurn: -0.6, light: { x: sx, y: sy, color: "#ffe2a8", strength: 2 }, tail: 0, tailUp: 0 }), 0.5, "f20bc1");
    K.fog(c, W, H, { y: 480, h: 110, color: "#f2dce0", alpha: 0.16, t, wisps: true, seed: 25 });
  });
  K.godRays(g, sx, sy - 6, W, H, { color: "#ffe2b0", count: 11, strength: 0.22, t, angle: -Math.PI / 2, spread: Math.PI * 0.95, length: 900, seed: 201 });
  K.lensFlare(g, sx, sy, W, H, 0.5);
}

// ---- shot 2 [12-22] behind you, walking then running up the hill; he turns, meows, stands ------------------------
function shot2(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 12, 22));
  const hz = 250;
  const sx = 700, sy = hz - 30;
  const run = t >= 17;
  const climb = K.seg(t, 12, 22);
  K.withCamera(g, W, H, { x: 480, y: 270 - p * 10, zoom: 1.02 + p * 0.08, shakeT: t, shakeAmt: run ? 2.2 : 1.2 }, (c) => {
    dawnSky(c, W, H, t, hz, sx, sy, { sunR: 26 });
    valleys(c, W, H, t, hz);
    // the crest comes closer as you climb
    const hy = K.lerp(330, 312, climb);
    hill(c, W, H, t, 560, hy, { spread: 1.5 + climb * 0.4, sunX: sx });
    const turn = K.ease.inOut(K.seg(t, 14.6, 16.8));
    const stand = t >= 18.4;
    const mouth = K.env(t, 18.0, 18.7, 0.12, 0.3);
    const size = K.lerp(40, 54, climb);
    if (!stand) backlitCat(c, W, H, 600, hy + 1, size, BISC({ pose: "sit", t, headTurn: turn * 1.0, mouth, light: { x: sx, y: sy, color: "#ffe2a8", strength: 1.8 } }), 0.28, "f20bc2");
    else backlitCat(c, W, H, 600, hy + 1, size, BISC({ pose: "stand", facing: -1, t, headTurn: 0.7, tailUp: 1, tail: 0.5, light: { x: sx, y: sy, color: "#ffe2a8", strength: 1.8 } }), 0.28, "f20bc2");
    // you, from behind, soft in the foreground (focus is on him)
    const ph = run ? 0.5 + (t - 17) * 1.7 : t * 0.85;
    const bob = run ? Math.sin(ph * TAU * 2) * 6 : Math.abs(Math.sin(ph * TAU)) * 2;
    // walking 12-17 covers a little ground, the run 17-22 a lot more
    const fw = K.seg(t, 12, 17) * 0.22 + K.ease.in(K.seg(t, 17, 22)) * 0.78;
    soft(c, W, H, "f20s2kid", 2.6, (q) => {
      K.drawPerson(q, 400 + fw * 90, 620 - fw * 70 - bob, K.lerp(330, 260, fw), { view: "back", hood: false, walk: !run, run, phase: ph, bell: false, light: { x: sx, y: sy, color: "#ffd9a0", strength: 1.4 }, shadow: false });
    });
  });
  K.lensFlare(g, sx, sy, W, H, 0.35);
  K.dust(g, W, H, t, { seed: 202, count: 26, color: "#fff0c8", size: 1.5, alpha: 0.45 });
}

// ---- shot 3 [22-34] close, low: the reunion ---------------------------------------------------------------------
function bgBlur(g, W, H, t, key, blur, fn) {
  const L = inLayer(g, W, H, key, fn);
  put(g, W, H, L, 1, blur);
}
function shot3(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 22, 34));
  const hz = 300, sx = 760, sy = 250;
  K.withCamera(g, W, H, { x: 480 + p * 16, y: 280, zoom: 1.0 + p * 0.06, shakeT: t, shakeAmt: 1.0 }, (c) => {
    bgBlur(c, W, H, t, "f20s3bg", 7, (q) => {
      dawnSky(q, W, H, t, hz, sx, sy, { sunR: 30 });
      valleys(q, W, H, t, hz);
      q.fillStyle = "#b8a2b0";
      q.fillRect(-W, 420, W * 3, H);
    });
    // the ground right under you (in focus near the cat)
    const gg = c.createLinearGradient(0, 400, 0, 560);
    gg.addColorStop(0, "rgba(236,222,214,0)");
    gg.addColorStop(0.3, "rgba(196,176,184,1)");
    gg.addColorStop(1, "#7a6680");
    c.fillStyle = gg;
    c.fillRect(-W, 400, W * 3, 300);
    K.grass(c, -100, W + 100, 470, { seed: 207, color: "#b8a2ae", light: "#fff0dc", dark: "#6a5878", height: 18, t, wind: 0.4, density: 1 });
    // him: trots in from the right, then headbutts your palm and rubs his cheek along your fingers
    const arrive = K.ease.out(K.seg(t, 22, 23.6));
    // 23.5-25 the headbutt: head pushes up into the palm (ease-out); 25-30 the cheek-rub along the fingers
    const bump = K.ease.out(K.seg(t, 23.5, 24.4)) - K.ease.inOut(K.seg(t, 24.6, 25.2)) * 0.45;
    const rubK = K.smooth(K.seg(t, 25, 25.8)) * (1 - K.smooth(K.seg(t, 30, 31)));
    const rub = Math.sin((t - 25) * 2.2) * rubK;
    const slide = K.ease.inOut(K.seg(t, 25, 30));
    const cx = K.lerp(1060, 650, arrive) - rub * 6;
    const walking = t < 23.6;
    const purr = K.smooth(K.seg(t, 25.6, 26.4));
    const cat = BISC({
      pose: walking ? "walk" : "stand", facing: -1, phase: (t - 22) * 1.6, t,
      headTurn: walking ? 0.15 : 0.2 + rub * 0.3, headTilt: walking ? 0 : 0.1 + bump * 0.45 + rub * 0.12,
      blink: walking ? 0 : Math.max(0.5 * purr, K.env(t, 24.2, 24.9, 0.15, 0.3) * 0.8), tailUp: 1, tail: 0.6, ears: 0.4,
      light: { x: sx + 300, y: sy - 100, ...SUNLIGHT },
    });
    K.drawCat(c, cx, 478 - bump * 12, 150, cat);
    // you, kneeling, soft at the left edge; your arm reaches from your shoulder down to him
    const ang = -0.25;
    const hx = 432 - rub * 5 + Math.cos(ang) * 20 * slide, hy = 262 - bump * 8 + Math.sin(ang) * 20 * slide + rub * 2;
    const SL = 200, HS = 140;
    soft(c, W, H, "f20s3kid", 6, (q) => {
      K.drawPerson(q, 40, 700, 520, { view: "back", hood: false, crouch: 1, bell: false, light: { x: sx, y: sy, color: "#ffd9a0", strength: 1.2 }, shadow: false });
      // upper arm, from your shoulder to the elbow
      const sh = [95, 386], el = [hx - Math.cos(ang) * SL * HS / 100, hy - Math.sin(ang) * SL * HS / 100];
      const ap = new Path2D();
      K.tube(ap, [sh[0], sh[1], (sh[0] + el[0]) / 2 - 10, (sh[1] + el[1]) / 2 + 14, el[0], el[1]], [62, 58, 52], 4, true, true);
      const ag = q.createLinearGradient(0, el[1] - 30, 0, el[1] + 40);
      ag.addColorStop(0, "#f2cc4a"); ag.addColorStop(1, "#a8820c");
      q.fillStyle = ag; q.fill(ap);
    });
    // the hand (in focus): palm down, fingers relaxed and curling over his head
    hand(c, hx, hy, HS, { angle: ang + rub * 0.05, pose: "cup", sleeve: "#e8b923", sleeveLen: SL, sleeveW: 0.85, light: { x: sx, y: sy - 300, color: "#ffd9a0", strength: 1.2 } });
  });
  K.dust(g, W, H, t, { seed: 203, count: 46, color: "#fff0c8", size: 1.8, alpha: 0.55 });
  K.lensFlare(g, 760, 250, W, H, 0.3);
}

// ---- shot 4 [34-42] insert: the bell goes back on; a slow blink ----------------------------------------------------
function shot4(g, W, H, t) {
  if (t > 37.5) warmBack(RING5.map((m) => [m.x, m.y, m.h, m.ci, ring5Opt(m, 560, 236)]), 3);
  const p = K.ease.inOut(K.seg(t, 34, 42));
  const sx = 820, sy = 120;
  K.withCamera(g, W, H, { x: 480, y: 260 - p * 8, zoom: 1.0 + p * 0.05, shakeT: t, shakeAmt: 0.9 }, (c) => {
    bgBlur(c, W, H, t, "f20s4bg", 9, (q) => {
      dawnSky(q, W, H, t, 330, sx, 230, { sunR: 40 });
      valleys(q, W, H, t, 330);
      q.fillStyle = "#a890a4";
      q.fillRect(-W, 430, W * 3, H);
    });
    const blink = K.env(t, 38.0, 39.2, 0.5, 0.6);
    const glint = Math.exp(-Math.max(0, t - 36.4) * 1.4) * (t >= 36.4 ? 1.6 : 0) + 0.45 + 0.25 * Math.sin(t * 2.2);
    closeUp(c, W, H, t, blink, sx, sy);
    // the bell, right where it belongs
    const BX = 560, BY = 376;
    c.save(); c.strokeStyle = "#7a2420"; c.lineWidth = 2; c.beginPath(); c.moveTo(BX, BY - 14); c.lineTo(BX, BY - 8); c.stroke(); c.restore();
    bell(c, BX, BY, 22, { t, glint: Math.max(0, glint), lx: 0.45, ly: -0.6 });
    // your hands at his collar either side of the bell, tying (34-36.5), then drawing away
    const away = K.ease.inOut(K.seg(t, 36.5, 37.9));
    const tie = Math.sin(t * 7) * 2.5 * (1 - away);
    const lp = [514 - away * 150, 358 + away * 190 + tie], rp = [606 + away * 150, 358 + away * 190 - tie];
    const HS = 150, u = HS / 100;
    const la = -Math.PI / 2 + 0.85, ra = -Math.PI / 2 - 0.85;
    const off = (ang, left) => { const a = ang + Math.PI / 2, c0 = Math.cos(a), s0 = Math.sin(a); const X = (left ? -23 : 23) * u, Y = -72 * u; return [X * c0 - Y * s0, X * s0 + Y * c0]; };
    const lo = off(la, true), ro = off(ra, false);
    const lightH = { x: sx, y: sy, color: "#ffd9a0", strength: 1.1 };
    // the collar's two loose ends, pinched in your fingers
    if (away < 0.6) {
      c.save(); c.strokeStyle = "#a8322e"; c.lineWidth = 3; c.lineCap = "round";
      c.beginPath(); c.moveTo(BX - 8, BY - 12); c.quadraticCurveTo(540, 372, lp[0] + 2, lp[1]); c.stroke();
      c.beginPath(); c.moveTo(BX + 8, BY - 12); c.quadraticCurveTo(580, 372, rp[0] - 2, rp[1]); c.stroke();
      c.restore();
    }
    hand(c, lp[0] - lo[0], lp[1] - lo[1], HS, { angle: la, pose: "pinch", left: true, light: lightH });
    hand(c, rp[0] - ro[0], rp[1] - ro[1], HS, { angle: ra, pose: "pinch", light: lightH });
  });
  K.dust(g, W, H, t, { seed: 204, count: 40, color: "#fff0c8", size: 1.8, alpha: 0.5 });
}

// The hero close-up: drawCat into a layer, then the finishing passes a painter would do by hand: the bent
// left ear (image right) folded forward, fur at the cheek ruff and ears, light through the ears, a sun rim on
// the right of the head, wet eyes with a dark limbal ring and highlights, nose leather, and soft focus low
// on the shoulders. Coordinates are the drawCat(470, 760, 330, headTurn 1) model.
const CU = { hx: 557, hy: 272, eyes: [[522, 252], [592, 252]], nose: [557, 277] };
function closeUp(c, W, H, t, blink, sx, sy) {
  const L = inLayer(c, W, H, "f20cu", (q) => {
    K.drawCat(q, 470, 760, 330, BISC({ pose: "sit", t, headTurn: 1, blink, bell: false, ears: 0.5, light: { x: sx, y: sy, ...SUNLIGHT } }));
    bentEar(q);
    cuFur(q);
  });
  // soft focus on the shoulders: a blurred copy faded in below the collar
  const B = K.layer(W, H, "f20cuB");
  K.dof(B.g, L.canvas, 4, 1);
  const T = c.getTransform();
  B.g.setTransform(T);
  B.g.globalCompositeOperation = "destination-in";
  const mg = B.g.createLinearGradient(0, 380, 0, 470);
  mg.addColorStop(0, "rgba(0,0,0,0)");
  mg.addColorStop(1, "rgba(0,0,0,1)");
  B.g.fillStyle = mg;
  B.g.fillRect(-200, 300, W + 400, H + 200);
  B.g.globalCompositeOperation = "source-over";
  put(c, W, H, L, 1);
  put(c, W, H, B, 1);
  // light passing through the ears, and the sun rim down the right side of the head
  K.glow(c, 512, 192, 22, "#ff9a6a", 0.35);
  K.glow(c, 606, 196, 22, "#ffa070", 0.45);
  c.save();
  c.globalCompositeOperation = "lighter";
  c.strokeStyle = "rgba(255,226,168,0.35)";
  c.lineWidth = 5;
  c.beginPath(); c.ellipse(CU.hx, CU.hy + 4, 88, 80, 0, -1.25, 0.9); c.stroke();
  c.strokeStyle = "rgba(255,240,206,0.55)";
  c.lineWidth = 1.6;
  c.beginPath(); c.ellipse(CU.hx, CU.hy + 4, 90, 82, 0, -1.1, 0.7); c.stroke();
  c.restore();
  // eyes: a dark limbal ring and wet highlights (hidden as the lids close)
  const open = 1 - K.clamp(blink * 1.6);
  if (open > 0.02) {
    c.save();
    c.globalAlpha *= open;
    for (const [ex, ey] of CU.eyes) {
      c.strokeStyle = "rgba(52,34,8,0.55)"; c.lineWidth = 2.2;
      c.beginPath(); c.arc(ex, ey, 12.5, 0, TAU); c.stroke();
      c.fillStyle = "rgba(255,255,255,0.92)";
      c.beginPath(); c.ellipse(ex - 4, ey - 5, 2.8, 2.2, -0.5, 0, TAU); c.fill();
      c.fillStyle = "rgba(255,255,255,0.45)";
      c.beginPath(); c.arc(ex + 4.5, ey + 4.5, 1.2, 0, TAU); c.fill();
      // the iris catches the sun low on the far side
      const ig = c.createRadialGradient(ex + 4, ey + 5, 0, ex + 4, ey + 5, 8);
      ig.addColorStop(0, "rgba(240,230,120,0.35)"); ig.addColorStop(1, "rgba(240,230,120,0)");
      c.fillStyle = ig; c.beginPath(); c.arc(ex, ey, 11, 0, TAU); c.fill();
    }
    c.restore();
  }
  // nose leather: a soft pink gradient with a darker rim and a wet highlight
  const [nx, ny] = CU.nose;
  const np = new Path2D();
  np.moveTo(nx - 9, ny - 5);
  np.quadraticCurveTo(nx, ny - 9, nx + 9, ny - 5);
  np.quadraticCurveTo(nx + 6, ny + 3, nx, ny + 6);
  np.quadraticCurveTo(nx - 6, ny + 3, nx - 9, ny - 5);
  const ng = c.createRadialGradient(nx - 2, ny - 4, 1, nx, ny, 11);
  ng.addColorStop(0, "#f2b2aa"); ng.addColorStop(0.6, "#d98a80"); ng.addColorStop(1, "#a55a50");
  c.fillStyle = ng; c.fill(np);
  c.strokeStyle = "rgba(120,60,50,0.6)"; c.lineWidth = 0.8; c.stroke(np);
  c.fillStyle = "rgba(255,240,236,0.7)";
  c.beginPath(); c.ellipse(nx - 3, ny - 4, 2.4, 1.1, -0.2, 0, TAU); c.fill();
}
// the bent left ear: cut the straight tip above the crease, paint the tip folded forward and down
function bentEar(c) {
  c.save();
  c.globalCompositeOperation = "destination-out";
  c.beginPath(); c.moveTo(586, 110); c.lineTo(650, 110); c.lineTo(640, 172); c.lineTo(590, 170); c.closePath(); c.fill();
  c.restore();
  const A = [591, 171], B = [627, 174], tip = [640, 205];
  const sh = c.createLinearGradient(0, 172, 0, 196);
  sh.addColorStop(0, "rgba(60,22,4,0.5)"); sh.addColorStop(1, "rgba(60,22,4,0)");
  c.save();
  c.globalCompositeOperation = "source-atop";
  c.fillStyle = sh; c.fillRect(580, 172, 60, 26);
  c.restore();
  const flap = new Path2D();
  flap.moveTo(A[0], A[1]);
  flap.bezierCurveTo(594, 149, 628, 144, 633, 168);
  flap.quadraticCurveTo(640, 186, tip[0], tip[1]);
  flap.quadraticCurveTo(628, 190, B[0], B[1]);
  flap.quadraticCurveTo(608, 176, A[0], A[1]);
  const fg = c.createLinearGradient(A[0], 160, tip[0], tip[1]);
  fg.addColorStop(0, "#f0a85a"); fg.addColorStop(0.55, "#c0702c"); fg.addColorStop(1, "#7a3a10");
  c.fillStyle = fg; c.fill(flap);
  c.save(); c.clip(flap);
  c.strokeStyle = "rgba(255,236,190,0.8)"; c.lineWidth = 2.4;
  c.beginPath(); c.moveTo(A[0] + 2, A[1] - 2); c.bezierCurveTo(595, 151, 627, 147, 632, 168); c.stroke();
  c.strokeStyle = "rgba(100,44,10,0.5)"; c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i < 12; i++) { const u = i / 12; const x = K.lerp(A[0] + 6, tip[0] - 6, u), y = K.lerp(166, tip[1] - 6, u); c.moveTo(x, y + 4); c.lineTo(x + 4, y); }
  c.stroke();
  c.restore();
  // the sun through the fold's thin edge
  c.save(); c.globalCompositeOperation = "lighter";
  c.strokeStyle = "rgba(255,226,168,0.7)"; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(633, 168); c.quadraticCurveTo(640, 186, tip[0], tip[1]); c.stroke();
  c.restore();
  c.lineCap = "round";
  c.strokeStyle = "rgba(70,26,6,0.85)"; c.lineWidth = 1.8;
  c.beginPath(); c.moveTo(A[0] + 1, A[1] + 1); c.quadraticCurveTo(608, 178, B[0], B[1]); c.stroke();
}
// fur: short seeded strokes breaking the outline at the cheek ruff, crown and ears
function cuFur(c) {
  const Rn = K.rng("f20cufur");
  const dark = new Path2D(), lite = new Path2D();
  for (let i = 0; i < 220; i++) {
    const a = Math.PI * (-0.95 + Rn() * 1.9) + Math.PI / 2;
    const rx = 86 + Rn() * 8, ry = 76 + Rn() * 8;
    const x = CU.hx + Math.cos(a) * rx, y = CU.hy + 8 + Math.sin(a) * ry;
    if (y < 200 && Math.abs(x - CU.hx) < 40) continue;
    const len = 4 + Rn() * 7, out = 0.3 + Rn() * 0.5;
    const dx = Math.cos(a) * len * out + (Rn() - 0.5) * 3, dy = Math.sin(a) * len * out + len * 0.35;
    const P = Rn() > 0.45 ? lite : dark;
    P.moveTo(x - dx * 0.6, y - dy * 0.6);
    P.lineTo(x + dx, y + dy);
  }
  // inner ear furnishings
  for (const [ex, ey, sgn] of [[512, 196, -1], [604, 196, 1]]) {
    for (let i = 0; i < 14; i++) {
      const x = ex + (Rn() - 0.5) * 18, y = ey + 6 + Rn() * 12;
      lite.moveTo(x, y); lite.lineTo(x + sgn * (2 + Rn() * 4), y - 6 - Rn() * 8);
    }
  }
  c.save();
  c.lineCap = "round";
  c.lineWidth = 1.1;
  c.strokeStyle = "rgba(122,58,16,0.55)"; c.stroke(dark);
  c.strokeStyle = "rgba(255,224,170,0.6)"; c.stroke(lite);
  c.restore();
}

// ---- shot 5 [42-52] crane up and back: a hundred cats, Sir Whiskers fades into the light, the ring opens ----------
const RING5 = (() => {
  const out = [];
  const R = K.rng("f20ring5");
  for (let i = 0; i < 110; i++) {
    const a = Math.PI * (0.06 + R() * 0.88); // the near half of the hill, all facing up toward the top
    const d = 0.25 + Math.pow(R(), 0.7) * 0.95;
    const x = 480 + Math.cos(a) * d * 640, y = 300 + Math.sin(a) * d * 230 + d * 20;
    out.push({ x, y, h: 8 + (y - 300) * 0.26, ci: Math.floor(R() * 10), v: R() > 0.5 ? 1 : 0, side: R() > 0.5 ? 1 : -1, up: R() > 0.3 });
  }
  return out.sort((a, b) => a.y - b.y);
})();
const ring5Opt = (m, sx, sy) => ({ v: m.v, side: m.side, tailUp: m.up, rim: "#ffd9a0", amb: "#9a86a4", shadowColor: "#4a3a5a", light: { x: sx, y: sy } });
// an old standing stone: irregular, leaning, lichen-spotted, wet on the lit side
function oldStone(g, x, y, w, h, seed, lean) {
  const R = K.rng("f20stone" + seed);
  const pts = [
    x - w * 0.5, y + 2,
    x - w * (0.52 + R() * 0.08), y - h * (0.45 + R() * 0.1),
    x - w * (0.38 + R() * 0.08) + lean * h * 0.1, y - h * (0.82 + R() * 0.06),
    x - w * (0.12 + R() * 0.08) + lean * h * 0.15, y - h,
    x + w * (0.3 + R() * 0.08) + lean * h * 0.12, y - h * (0.7 + R() * 0.06),
    x + w * (0.5 + R() * 0.06), y - h * (0.35 + R() * 0.1),
    x + w * 0.48, y + 2,
  ];
  const p = new Path2D();
  K.spline(p, pts, true, 0.12);
  const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  gr.addColorStop(0, "#3e4246");
  gr.addColorStop(0.55, "#62666a");
  gr.addColorStop(1, "#9a9a96");
  g.fillStyle = gr;
  g.fill(p);
  g.save();
  g.clip(p);
  for (let i = 0; i < 40; i++) {
    const lx = x + (R() - 0.5) * w, ly = y - R() * h, r = 1 + R() * 4;
    g.fillStyle = R() > 0.5 ? "rgba(170,180,120,0.35)" : "rgba(30,32,36,0.3)";
    g.beginPath(); g.arc(lx, ly, r, 0, TAU); g.fill();
  }
  g.strokeStyle = "rgba(20,22,26,0.5)";
  g.lineWidth = 1;
  for (let i = 0; i < 4; i++) { const cx = x + (R() - 0.5) * w * 0.6, cy = y - R() * h * 0.8; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (R() - 0.5) * 10, cy + 8 + R() * 14); g.stroke(); }
  const mg = g.createLinearGradient(0, y - h * 0.3, 0, y);
  mg.addColorStop(0, "rgba(60,84,44,0)");
  mg.addColorStop(1, "rgba(60,84,44,0.7)");
  g.fillStyle = mg;
  g.fillRect(x - w, y - h * 0.3, w * 2, h * 0.3 + 4);
  // wet sheen on the sunlit edge
  g.fillStyle = "rgba(255,236,200,0.25)";
  g.fillRect(x + w * 0.28, y - h, w * 0.1, h);
  g.restore();
  g.fillStyle = "rgba(20,30,16,0.4)";
  g.beginPath(); g.ellipse(x - w * 0.3, y + 3, w * 0.8, 5, 0, 0, TAU); g.fill();
}
// a garden tree built from leaf clusters (not a lollipop): branching trunk, many shaded clumps
function clusterTree(g, x, y, sc, seed) {
  const spr = K.sprite("f20ctree:" + seed, 220, 260, (s) => {
    const R = K.rng("f20ct" + seed);
    s.strokeStyle = "#4a3c32"; s.lineCap = "round";
    const tips = [];
    const br = (bx, by, a, len, w, d) => {
      const ex = bx + Math.cos(a) * len, ey = by + Math.sin(a) * len;
      s.lineWidth = w; s.beginPath(); s.moveTo(bx, by); s.quadraticCurveTo((bx + ex) / 2 + (R() - 0.5) * 10, (by + ey) / 2, ex, ey); s.stroke();
      if (d >= 3) { tips.push([ex, ey]); return; }
      for (let k = 0; k < 2 + (R() > 0.5 ? 1 : 0); k++) br(ex, ey, a + (R() - 0.5) * 1.3, len * (0.62 + R() * 0.15), w * 0.62, d + 1);
    };
    br(110, 256, -Math.PI / 2, 70, 11, 0);
    // clumps: dark underside first, then mid, then sunlit tops toward the right (the sun is low right)
    const clumps = [];
    for (const [tx, ty] of tips) for (let k = 0; k < 3; k++) clumps.push([tx + (R() - 0.5) * 34, ty + (R() - 0.5) * 22, 16 + R() * 14]);
    clumps.sort((a, b) => b[1] - a[1]);
    for (const [cx, cy, r] of clumps) {
      const gr = s.createRadialGradient(cx + r * 0.3, cy - r * 0.4, 1, cx, cy, r);
      gr.addColorStop(0, "#8ea06e"); gr.addColorStop(0.55, "#5e744a"); gr.addColorStop(1, "#34442c");
      s.fillStyle = gr;
      s.beginPath();
      for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU, rr = r * (0.75 + R() * 0.3); s.ellipse(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.35, rr * 0.55, rr * 0.45, a, 0, TAU); }
      s.fill();
    }
    // leaf speckle and sky holes
    for (let i = 0; i < 260; i++) {
      const [cx, cy, r] = clumps[Math.floor(R() * clumps.length)];
      const lx = cx + (R() - 0.5) * r * 1.6, ly = cy + (R() - 0.5) * r * 1.2;
      s.fillStyle = R() > 0.55 ? "rgba(190,206,150,0.55)" : "rgba(28,40,24,0.45)";
      s.fillRect(lx, ly, 1.6, 1.2);
    }
  });
  const sway = Math.sin(0.8 + seed) * 0.01;
  g.save(); g.translate(x, y); g.rotate(sway);
  g.drawImage(spr, -110 * sc, -256 * sc, 220 * sc, 260 * sc);
  g.restore();
}
function gardenStill(W, H) {
  return K.sprite("f20garden", W, H, (q) => gardenPaint(q, W, H, 0, { hz: 250 }));
}
// the garden at home, at dawn after the rain: a cached still plus live glitter (o.live adds swaying grass)
function garden(g, W, H, t, o = {}) {
  g.drawImage(gardenStill(W, H), 0, 0, W, H);
  const hz = 250;
  if (o.live) K.grass(g, -60, W + 60, H - 30, { seed: 218, color: "#4a6a3c", light: "#8aa86a", dark: "#22321e", height: 30, t, wind: 0.5 });
  const n = o.live ? 60 : 24;
  for (let i = 0; i < n; i++) {
    const x = K.hash(i, 214) * W, y = hz + 44 + Math.pow(K.hash(i, 215), 1.4) * (H - hz);
    K.glow(g, x, y, 2 + K.hash(i, 216) * 3, "#fffbe8", 0.3 + 0.5 * Math.max(0, Math.sin(t * 2.1 + i * 1.7)));
  }
}
function gardenPaint(g, W, H, t, o = {}) {
  const hz = o.hz == null ? 250 : o.hz;
  const gr = g.createLinearGradient(0, 0, 0, hz);
  gr.addColorStop(0, "#a8c4e6");
  gr.addColorStop(0.7, "#f2dccc");
  gr.addColorStop(1, "#ffe6c0");
  g.fillStyle = gr;
  g.fillRect(-W, -H, W * 3, hz + H + 2);
  K.glow(g, o.sunX || 720, hz - 10, 360, "#ffd9a0", 0.45);
  g.save();
  g.globalAlpha *= 0.55;
  K.clouds(g, W, H, t, { seed: 211, color: "#ffe4d0", shade: "#c8b0c0", count: 4, y: hz * 0.4, spread: hz * 0.15, speed: 2, scale: 0.9 });
  g.restore();
  // houses and trees far off, soft
  K.hills(g, W, H, { y: hz + 4, amp: 18, color: "#7a8a7a", seed: 31, haze: "#f2dccc", hazeAmt: 0.55 });
  clusterTree(g, 120, hz + 16, 0.95, 3);
  clusterTree(g, 862, hz + 14, 0.85, 5);
  // the white fence, with the hole under it
  K.fence(g, -40, W + 40, hz + 40, 46, { color: "#f2ece2", gap: [612, 650] });
  // wet lawn
  const lg = g.createLinearGradient(0, hz + 36, 0, H + 40);
  lg.addColorStop(0, "#7a9468");
  lg.addColorStop(0.4, "#56704a");
  lg.addColorStop(1, "#33452e");
  g.fillStyle = lg;
  g.fillRect(-W, hz + 38, W * 3, H * 2);
  // the stepping-stone path from the stones to the house
  for (let i = 0; i < 7; i++) {
    const u = i / 6, x = K.lerp(470, 130, u), y = K.lerp(hz + 150, H + 10, u * u), r = K.lerp(16, 46, u);
    g.fillStyle = "rgba(20,28,18,0.35)";
    g.beginPath(); g.ellipse(x + 2, y + 3, r, r * 0.32, 0, 0, TAU); g.fill();
    g.fillStyle = "#8a8a86";
    g.beginPath(); g.ellipse(x, y, r, r * 0.3, 0, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,232,200,0.35)";
    g.beginPath(); g.ellipse(x + r * 0.2, y - r * 0.08, r * 0.6, r * 0.12, 0, 0, TAU); g.fill();
  }
  // a puddle in the lawn that holds the sky and the fence (a real reflection), wet dark rim
  const py0 = hz + 118;
  const puddle = (q) => {
    q.beginPath();
    q.moveTo(500, py0 + 9);
    q.bezierCurveTo(520, py0 - 2, 640, py0 - 4, 700, py0 + 4);
    q.bezierCurveTo(726, py0 + 10, 706, py0 + 22, 640, py0 + 23);
    q.bezierCurveTo(560, py0 + 24, 486, py0 + 20, 500, py0 + 9);
  };
  g.save();
  g.fillStyle = "rgba(30,44,28,0.55)";
  g.translate(0, 1.5); puddle(g); g.fill();
  g.restore();
  // the reflection: what is above the waterline, flipped (sky, the fence, the far trees)
  g.save();
  puddle(g); g.clip();
  g.fillStyle = "#b8c8e0"; g.fillRect(480, py0 - 6, 260, 34);
  g.translate(0, py0 * 2 - 32); g.scale(1, -1);
  g.globalAlpha = 0.85;
  const sk = g.createLinearGradient(0, py0 - 120, 0, py0);
  sk.addColorStop(0, "#a8c4e6"); sk.addColorStop(1, "#f6e2c8");
  g.fillStyle = sk; g.fillRect(480, py0 - 140, 260, 140);
  K.fence(g, 470, 740, hz + 40, 46, { color: "#e6e0d6", gap: [612, 650] });
  g.restore();
  g.save();
  puddle(g); g.clip();
  const tg2 = g.createLinearGradient(0, py0 - 4, 0, py0 + 24);
  tg2.addColorStop(0, "rgba(40,60,70,0.05)"); tg2.addColorStop(1, "rgba(40,60,70,0.4)");
  g.fillStyle = tg2; g.fillRect(480, py0 - 6, 260, 34);
  g.strokeStyle = "rgba(255,250,240,0.35)"; g.lineWidth = 0.8;
  for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(612 + i * 22, py0 + 10 + i * 2, 24 + i * 8, 2.6 + i, 0, 0, TAU); g.stroke(); }
  g.restore();
  g.save();
  g.strokeStyle = "rgba(24,36,22,0.55)"; g.lineWidth = 2; puddle(g); g.stroke();
  g.restore();
  // the two old standing stones (irregular, mossy - the ones from that night)
  oldStone(g, 360, hz + 122, 48, 96, 2, -0.15);
  oldStone(g, 520, hz + 114, 40, 78, 4, 0.12);
  // wet grass
  K.grass(g, -60, W + 60, hz + 170, { seed: 213, color: "#5a7a48", light: "#9ab878", dark: "#2a3a24", height: 22, t, wind: 0.4 });
}
function shot5(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 42, 52));
  const hz = 230, sx = 560, sy = 236;
  K.withCamera(g, W, H, { x: 480, y: K.lerp(330, 290, p), zoom: K.lerp(1.5, 1.0, p), shakeT: t, shakeAmt: 0.8 }, (c) => {
    dawnSky(c, W, H, t, hz, sx, sy, { sunR: 30 });
    valleys(c, W, H, t, hz);
    hill(c, W, H, t, 480, 298, { spread: 2.2, sunX: sx });
    // Sir Whiskers at the back, in the sun, fading into gold
    // Sir Whiskers: translucent, glowing, drifting up into the light 48-51.5
    const fade = 1 - K.smooth(K.seg(t, 48, 51.5));
    const drift = K.ease.in(K.seg(t, 48, 51.5)) * 26;
    K.glow(c, 600, 270 - drift, 70, "#ffe2a0", 0.2 + 0.45 * (1 - fade) * fade * 4 * 0.5);
    if (fade > 0.01) {
      const L = inLayer(c, W, H, "f20sir", (q) => {
        K.drawCat(q, 600, 298 - drift, 24, { pose: "sit", facing: -1, coat: OLD, collar: false, bell: false, t, headTurn: 0.4, blink: 0.5, light: { x: sx, y: sy, color: "#ffe2a8", strength: 1.8 }, shadow: false });
      });
      put(c, W, H, L, 0.35 * fade);
      put(c, W, H, L, 0.3 * fade, 0, "lighter");
    }
    // gold motes rising off him
    for (let i = 0; i < 26; i++) {
      const life = ((t * 0.35 + K.hash(i, 51)) % 1);
      const on = K.smooth(K.seg(t, 46.5, 48.5)) * (1 - K.smooth(K.seg(t, 51.5, 52)));
      const mx = 600 + (K.hash(i, 52) - 0.5) * 30 + Math.sin(t * 1.3 + i) * 4, my = 300 - drift - life * 70;
      K.glow(c, mx, my, 1.6 + K.hash(i, 53) * 2.2, "#ffe6a8", on * Math.sin(Math.PI * life) * 0.9);
    }
    // the ring opening beside you, home on the other side
    const open = K.ease.back(K.seg(t, 45.5, 47.5));
    if (open > 0.01) {
      const RX = 400, RY = 262, RR = 40 * open;
      c.save();
      c.beginPath(); c.ellipse(RX, RY, RR * 0.86, RR * 0.82, 0, 0, TAU); c.clip();
      c.translate(RX, RY); c.scale(0.12, 0.12); c.translate(-480, -300);
      c.drawImage(gardenStill(W, H), 0, 0, W, H);
      c.restore();
      stoneRing(c, RX, RY, RR, t, { tilt: 0.06, silver: 0, lit: () => 0.7 });
    }
    // you and him at the top
    K.drawPerson(c, 470, 300, 54, { view: "back", hood: false, crouch: 0.7, bell: false, light: { x: sx, y: sy, color: "#ffd9a0", strength: 1.2 } });
    K.drawCat(c, 492, 300, 11, BISC({ pose: "sit", facing: -1, t, bell: true, light: { x: sx, y: sy, color: "#ffe2a8", strength: 1.4 } }));
    // a hundred cats in the dewy grass, tails up, all looking up the hill
    for (const m of RING5) catBack(c, m.x, m.y, m.h, m.ci, ring5Opt(m, sx, sy));
  });
  K.godRays(g, 560, 236, W, H, { color: "#ffe2b0", count: 12, strength: 0.2, t, angle: Math.PI / 2, spread: 2.4, length: 900, seed: 205 });
  K.lensFlare(g, 560, 236, W, H, 0.25);
}

// ---- shot 6 [52-62] step through; white flash; the garden at home --------------------------------------------------
function shot6(g, W, H, t) {
  if (t < 55.8) {
    const p = K.ease.in(K.seg(t, 52, 55.8));
    const hz = 300, sx = 760, sy = 230;
    K.withCamera(g, W, H, { x: 480, y: 270, zoom: 1.0 + p * 0.25, shakeT: t, shakeAmt: 1.2 + Math.exp(-(t - 52) * 5) * 3 }, (c) => {
      dawnSky(c, W, H, t, hz, sx, sy, { sunR: 26 });
      valleys(c, W, H, t, hz);
      plain(c, 320, HILLPAL);
      const RX = 480, RY = 250, RR = 210;
      c.save();
      c.beginPath(); c.ellipse(RX, RY, RR * 0.86, RR * 0.81, 0, 0, TAU); c.clip();
      c.translate(RX, RY); c.scale(0.62, 0.62); c.translate(-480, -280);
      garden(c, W, H, t);
      c.restore();
      c.save();
      c.globalCompositeOperation = "lighter";
      c.fillStyle = K.rgba("#fff0d0", 0.15 + p * 0.5);
      c.beginPath(); c.ellipse(RX, RY, RR * 0.86, RR * 0.81, 0, 0, TAU); c.fill();
      c.restore();
      stoneRing(c, RX, RY, RR, t, { tilt: 0.06, silver: 0, lit: () => 0.75 });
      // he walks a step ahead and looks back; you follow
      const w = K.ease.inOut(K.seg(t, 52, 55.6));
      K.drawCat(c, K.lerp(500, 470, w), K.lerp(430, 378, w), K.lerp(44, 30, w), BISC({ pose: "walk", facing: 1, phase: t * 1.1, t, headTurn: 0.95, tailUp: 1, bell: true, light: { x: RX, y: RY, color: "#fff0d0", strength: 1.6 } }));
      K.drawPerson(c, K.lerp(420, 440, w), K.lerp(560, 450, w), K.lerp(280, 190, w), { view: "back", hood: false, walk: true, phase: t * 0.9, bell: false, light: { x: RX, y: RY, color: "#fff0d0", strength: 1.6 } });
    });
    return;
  }
  // the garden at home, at dawn
  const p = K.ease.inOut(K.seg(t, 55.8, 62));
  K.withCamera(g, W, H, { x: 480 - p * 30, y: 270, zoom: 1.04 + p * 0.04, shakeT: t, shakeAmt: 0.8 }, (c) => {
    garden(c, W, H, t, { live: true });
    // he trots along the path toward the house (left), looking back; you behind him
    const w = K.ease.inOut(K.seg(t, 56, 62));
    K.drawCat(c, K.lerp(470, 250, w), K.lerp(402, 470, w), K.lerp(34, 44, w), BISC({ pose: "walk", facing: -1, phase: t * 1.1, t, headTurn: K.env(t, 57.5, 61.5, 0.6, 0.6) * 0.9, tailUp: 1, bell: true, wet: 0.2, light: { x: 720, y: 230, color: "#ffe2b0", strength: 1.4 } }));
    K.drawPerson(c, K.lerp(640, 470, w), K.lerp(455, 470, w), K.lerp(170, 190, w), { view: "back", hood: false, walk: true, phase: t * 0.9, bell: false, light: { x: 720, y: 230, color: "#ffe2b0", strength: 1.2 } });
  });
  K.godRays(g, 720, 240, W, H, { color: "#ffe6b8", count: 10, strength: 0.18, t, angle: Math.PI * 0.8, spread: 1.4, length: 900, seed: 206 });
}

// ---- shot 7 [62-80] the bedroom at dawn -----------------------------------------------------------------------------
// Soft blue-grey dawn (#5a6380 ambient) with warm window spill; a 3/4 bed whose patchwork quilt is a draped surface
// (a height field over the sleeping you: shoulder, hip, legs, folds) shaded by the window light.
const WIN = { x: 600, y: 60, w: 250, h: 210 };
const QUILT = ["#4a6fa5", "#e0b25a", "#c2575b", "#efe4d0"];
const QF0 = [232, 312], QF1 = [845, 298], QN0 = [172, 406], QN1 = [884, 390];
const G2 = (u, uc, us, v, vc, vs) => Math.exp(-((u - uc) * (u - uc)) / (us * us) - ((v - vc) * (v - vc)) / (vs * vs));
function quiltH(u, v, t) {
  const br = 1 + Math.sin(t * 1.1) * 0.04;
  const vv = Math.min(v, 1);
  let h = 46 * G2(u, 0.2, 0.12, vv, 0.48, 0.26) * br + 62 * G2(u, 0.42, 0.15, vv, 0.5, 0.27) + 36 * G2(u, 0.64, 0.16, vv, 0.5, 0.22) + 22 * G2(u, 0.82, 0.06, vv, 0.47, 0.18);
  // folds: long soft ridges running off the body toward the edges
  h += 3.2 * Math.sin(u * 34 + vv * 5) * K.smooth(K.clamp((vv - 0.62) / 0.3)) + 2.4 * Math.sin(vv * 16 + u * 6) * K.smooth(K.clamp((u - 0.72) / 0.2));
  return h;
}
function quiltPt(u, v, t) {
  const vv = Math.min(v, 1);
  const fx = K.lerp(QF0[0], QF1[0], u), fy = K.lerp(QF0[1], QF1[1], u);
  const nx = K.lerp(QN0[0], QN1[0], u), ny = K.lerp(QN0[1], QN1[1], u);
  let x = K.lerp(fx, nx, vv), y = K.lerp(fy, ny, vv) - quiltH(u, v, t);
  if (v > 1) { const d = (v - 1) / 0.36; x += Math.sin(u * 40) * 3 * d - d * 6; y += d * 64 + Math.sin(u * 40 + 1) * 2 * d; }
  return [x, y];
}
function bedroom(g, W, H, t) {
  const dry = K.seg(t, 62, 74);
  K.room(g, W, H, {
    wall: "#7a84a6", floor: "#5a4c50", night: false, horizon: 0.74, frame: "#efe6da",
    window: { ...WIN, outside: (q, x, y, w, h) => {
      q.save();
      q.translate(x, y); q.scale(w / 960 * 1.4, h / 540 * 1.4); q.translate(-200, -120);
      garden(q, W, H, t);
      // one amber pawprint on the garden path, glowing, then fading (66-72)
      const a = K.env(t, 66, 72, 1.0, 2.2);
      if (a > 0) {
        K.glow(q, 452, 400, 60, "#ff9a3a", 0.35 * a);
        K.pawprints(q, [{ x: 452, y: 400, a: -0.3, s: 30, alpha: a }], 1.6);
      }
      q.restore();
    } },
  });
  // drying raindrops on the glass: a few clear beads with highlights, fewer as it dries
  glassBeads(g, t, 1 - dry * 0.55);
  // warm window spill on the wall (the window shape thrown down and left), then the headboard
  g.save();
  g.globalCompositeOperation = "lighter";
  const sp = new Path2D();
  sp.moveTo(WIN.x - 150, WIN.y + 120); sp.lineTo(WIN.x + WIN.w - 190, WIN.y + 120); sp.lineTo(WIN.x + WIN.w - 280, WIN.y + 300); sp.lineTo(WIN.x - 240, WIN.y + 300); sp.closePath();
  const spg = g.createLinearGradient(WIN.x, WIN.y + 120, WIN.x - 200, WIN.y + 300);
  spg.addColorStop(0, "rgba(255,214,160,0.34)"); spg.addColorStop(1, "rgba(255,214,160,0.08)");
  g.fillStyle = spg; g.fill(sp);
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "rgba(60,64,96,0.35)";
  g.fillRect(WIN.x - 60 - 28, WIN.y + 120, 10, 180);
  g.restore();
  // headboard (seen 3/4) and the bed frame
  const hb = new Path2D();
  hb.moveTo(62, 196); hb.lineTo(118, 214); hb.lineTo(118, 436); hb.lineTo(62, 452); hb.closePath();
  const hbg = g.createLinearGradient(62, 0, 118, 0);
  hbg.addColorStop(0, "#3a2a22"); hbg.addColorStop(1, "#6a4a36");
  g.fillStyle = hbg; g.fill(hb);
  g.strokeStyle = "rgba(255,220,180,0.25)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(118, 214); g.lineTo(118, 436); g.stroke();
  g.fillStyle = "#3a2820";
  g.beginPath(); g.moveTo(130, 452); g.lineTo(892, 432); g.lineTo(892, 452); g.lineTo(130, 476); g.closePath(); g.fill();
  // pillow and your head (messy brown hair, back to us)
  const pg = g.createRadialGradient(180, 300, 10, 196, 318, 120);
  pg.addColorStop(0, "#f6f2ea"); pg.addColorStop(1, "#aeb0c4");
  g.fillStyle = pg;
  g.beginPath(); g.ellipse(198, 322, 92, 36, -0.08, 0, TAU); g.fill();
  const hg = g.createRadialGradient(222, 296, 4, 232, 304, 46);
  hg.addColorStop(0, "#7a5232"); hg.addColorStop(1, "#3e2614");
  g.fillStyle = hg;
  g.beginPath(); g.ellipse(234, 304, 40, 31, 0.3, 0, TAU); g.fill();
  g.strokeStyle = "rgba(140,96,58,0.75)"; g.lineWidth = 1.2;
  for (let i = 0; i < 16; i++) { const a = -2.6 + i * 0.3; g.beginPath(); g.moveTo(234 + Math.cos(a) * 26, 304 + Math.sin(a) * 20); g.quadraticCurveTo(234 + Math.cos(a) * 42, 304 + Math.sin(a) * 32, 234 + Math.cos(a + 0.2) * 46, 304 + Math.sin(a + 0.2) * 35); g.stroke(); }
  // the quilt: patches laid on the draped surface, far rows first
  const NU = 18, NV = 9, VMAX = 1.36;
  const e = 0.02;
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) {
      const u0 = i / NU, u1 = (i + 1) / NU, v0 = (j / NV) * VMAX, v1 = ((j + 1) / NV) * VMAX;
      const pA = quiltPt(u0, v0, t), pB = quiltPt(u1, v0, t), pC = quiltPt(u1, v1, t), pD = quiltPt(u0, v1, t);
      const uc = (u0 + u1) / 2, vc = Math.min(1, (v0 + v1) / 2);
      // light from the window, upper right: slopes facing right and up are lit, the drop is in shade
      const du = (quiltH(uc - e, vc, t) - quiltH(uc + e, vc, t)) / (2 * e);
      const dv = (quiltH(uc, vc - e, t) - quiltH(uc, vc + e, t)) / (2 * e);
      let lum = 0.82 + du * 0.0022 + dv * 0.001;
      if (v0 >= 1) lum = 0.52 - (v0 - 1) * 0.4;
      lum = K.clamp(lum, 0.35, 1.15);
      const base = QUILT[Math.floor(K.hash(i * 13 + j * 7, 211) * 4)];
      const col = lum < 1 ? K.mix(base, "#1c1a34", (1 - lum) * 0.9) : K.mix(base, "#fff2dc", (lum - 1) * 1.6);
      const q = new Path2D();
      q.moveTo(pA[0], pA[1]); q.lineTo(pB[0], pB[1]); q.lineTo(pC[0], pC[1]); q.lineTo(pD[0], pD[1]); q.closePath();
      g.fillStyle = col;
      g.fill(q);
      g.strokeStyle = "rgba(255,246,230,0.16)"; g.lineWidth = 0.7;
      g.stroke(q);
    }
  }
  // the quilt's soft edge (binding) along the near side, and a shadow under the drop
  g.strokeStyle = "rgba(250,240,224,0.5)"; g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i <= 30; i++) { const [x, y] = quiltPt(i / 30, VMAX, t); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
  // the sunbeam lying across the quilt
  g.save();
  g.globalCompositeOperation = "lighter";
  const sb = g.createRadialGradient(590, 360, 10, 590, 360, 240);
  sb.addColorStop(0, "rgba(255,204,140,0.3)"); sb.addColorStop(1, "rgba(255,204,140,0)");
  g.translate(590, 360); g.rotate(-0.3); g.scale(1, 0.42); g.translate(-590, -360);
  g.fillStyle = sb; g.beginPath(); g.arc(590, 360, 240, 0, TAU); g.fill();
  g.restore();
  return 470;
}
// clear raindrops drying on the window glass
function glassBeads(g, t, k) {
  const n = Math.round(19 * k);
  g.save();
  g.beginPath(); g.rect(WIN.x, WIN.y, WIN.w, WIN.h); g.clip();
  for (let i = 0; i < n; i++) {
    const x = WIN.x + 10 + K.hash(i, 241) * (WIN.w - 20), y = WIN.y + 10 + K.hash(i, 242) * (WIN.h - 20);
    const r = 2 + K.hash(i, 243) * 3.5;
    g.fillStyle = "rgba(30,40,60,0.28)";
    g.beginPath(); g.ellipse(x, y + r * 0.2, r, r * 1.15, 0, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,244,220,0.25)";
    g.beginPath(); g.ellipse(x + r * 0.15, y + r * 0.45, r * 0.6, r * 0.45, 0, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.beginPath(); g.arc(x - r * 0.35, y - r * 0.4, r * 0.3, 0, TAU); g.fill();
    if (K.hash(i, 244) > 0.7) {
      g.strokeStyle = "rgba(220,230,245,0.18)"; g.lineWidth = r * 0.7;
      g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + Math.sin(i) * 1.5, y - r - 14 - K.hash(i, 245) * 20); g.stroke();
    }
  }
  g.restore();
}
function shot7(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 62, 80));
  K.withCamera(g, W, H, { x: 470 + p * 30, y: 300 + p * 10, zoom: 1.0 + p * 0.08, shakeT: t, shakeAmt: 0.5 }, (c) => {
    bedroom(c, W, H, t);
    // Biscuit asleep on the quilt beside you; the toy mouse by his paw; the bell catching the sunbeam
    const [cx, cy] = quiltPt(0.7, 0.8, t);
    const twitch = K.env(t, 68.4, 68.8, 0.08, 0.2);
    K.drawCat(c, cx, cy + 4, 84, BISC({ pose: "sleep", facing: -1, t, bell: false, ears: 0.2 - twitch * 1.2, tail: 0.15, light: { x: WIN.x + 150, y: WIN.y + 60, color: "#ffe6b8", strength: 1.3 }, ground: "#2a2440" }));
    const [mx, my] = quiltPt(0.55, 0.9, t);
    c.save();
    c.fillStyle = "rgba(20,18,40,0.35)"; c.beginPath(); c.ellipse(mx - 2, my + 2, 14, 3, 0, 0, TAU); c.fill();
    c.restore();
    K.toyMouse(c, mx, my + 1, 24, { facing: 1 });
    K.glow(c, mx + 2, my - 6, 16, "#ffe2b0", 0.18);
    // the bell, on the side toward us, glinting in the sunbeam
    const bx = cx - 0.5 * 84, by = cy + 4 - 0.15 * 84;
    bell(c, bx, by, 13, { t, glint: 0, lx: 0.5, ly: -0.6 });
    K.bellGlint(c, bx + 2, by - 2, 10, t, { strength: 0.55 + 0.45 * Math.sin(t * 1.6) });
    // dawn: blue-grey ambient, the window bright, a warm patch across him
    c.save();
    c.globalCompositeOperation = "multiply";
    c.fillStyle = "#c6cce6";
    c.fillRect(-100, -100, W + 200, H + 200);
    c.restore();
    c.save();
    c.beginPath(); c.rect(WIN.x, WIN.y, WIN.w, WIN.h); c.clip();
    c.globalCompositeOperation = "lighter";
    c.fillStyle = "rgba(255,230,190,0.3)";
    c.fillRect(WIN.x, WIN.y, WIN.w, WIN.h);
    c.restore();
    K.godRays(c, WIN.x + WIN.w * 0.55, WIN.y + 30, W, H, { color: "#ffd9a0", count: 7, strength: 0.26, t, angle: 2.2, spread: 0.3, length: 650, seed: 208 });
    K.dust(c, W, H, t, { seed: 207, count: 46, color: "#fff0c8", size: 1.4, alpha: 0.55, area: [380, 80, 420, 320] });
  });
}

// ---- assembly ----------------------------------------------------------------------------------------------------
const SHOTS = [[0, 12, shot1], [12, 22, shot2], [22, 34, shot3], [34, 42, shot4], [42, 52, shot5], [52, 62, shot6], [62, 80.01, shot7]];

const L20 = lines([
  [3.0, 7.0, "The sun came up at the end of the world."],
  [13.0, 16.5, "And there he was."],
  [19.0, 22.5, "He saw you. He knew you."],
  [23.5, 27.5, "He bumped his head into your hand."],
  [28.0, 32.5, "Like he did every morning. Like nothing had changed."],
  [35.0, 39.5, "His bell. Right where it belongs."],
  [43.0, 48.0, "A hundred cats came to see him home."],
  [48.5, 51.5, "And the old cat finally rested."],
  [53.0, 57.5, "He walked ahead. He looked back."],
  [58.0, 61.5, "This time, you were right behind him."],
  [64.0, 68.5, "You found a hundred cats."],
  [69.0, 73.5, "But he found you first.", { rate: 0.85, pitch: 1.0 }],
]);

export const film = {
  id: 20,
  title: "Home",
  chapter: "Finale",
  unlockAt: 100,
  duration: D,
  poster: 40,
  tagline: "You found him. He found you.",
  subs: L20.subs,
  voice: L20.voice,
  score: { mood: "joy", key: "C", bpm: 70, cues: [[2, "swell"], [18, "meow"], [26, "purr"], [34, "bell"], [42, "swell"], [52, "hit"], [62, "purr"], [72, "bell"], [76, "swell"]] },
  draw(g, t, W, H) {
    g.save();
    if (W !== 960 || H !== 540) g.scale(W / 960, H / 540);
    W = 960; H = 540;
    try {
      g.fillStyle = "#fff1e0";
      g.fillRect(0, 0, W, H);
      for (const [a, b, fn] of SHOTS) if (t >= a && t < b) { fn(g, W, H, t); break; }
      if (t >= 80.01) shot7(g, W, H, 80);
      const home = t >= 55.8;
      K.bloom(g, home ? 0.3 : 0.4);
      K.grade(g, W, H, { tint: home && t >= 62 ? "#ffd8a8" : "#ffcf9a", alpha: 0.16, mode: "soft-light" });
      K.vignette(g, W, H, t >= 62 ? 0.6 : 0.48);
      K.grain(g, W, H, t, 0.03);
      const ta = K.env(t, 2, 6, 1.0, 1.2);
      if (ta > 0) K.title(g, W, H, "Home", "Finale", ta, { glow: "#3a2440", y: H * 0.32 });
      const dim = K.smooth(K.seg(t, 74.4, 75.6));
      if (dim > 0) K.fadeBlack(g, W, H, 0.5 * dim);
      const te = K.smooth(K.seg(t, 75.8, 77.2)) * (1 - K.smooth(K.seg(t, 79.2, 80)));
      if (te > 0) K.title(g, W, H, "THE END", "", te, { glow: "#ffd27a", y: H * 0.3 });
      K.fadeBlack(g, W, H, 1 - K.smooth(K.seg(t, 0, 1.4)));
      // the flash on the step through (52 hit; white peaks at 55.8 then reveals the garden)
      K.fadeColor(g, W, H, K.env(t, 54.6, 57.2, 1.2, 1.4), "#fffaf0");
      K.fadeColor(g, W, H, K.env(t, 61.6, 62.6, 0.5, 0.5), "#fffaf0");
      K.fadeBlack(g, W, H, K.smooth(K.seg(t, 78.5, 80)));
      K.letterbox(g, W, H, 1);
    } finally {
      g.restore();
    }
  },
};
