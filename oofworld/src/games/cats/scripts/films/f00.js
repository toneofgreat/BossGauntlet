// films/f00.js - Prologue: "The Night He Left" (FILMS.md f00). 72 s, storm.
// A stormy night: Biscuit watches the window, follows glowing amber pawprints out through the cat
// flap and leaps into a paw portal between two old standing stones. You find his bell in the mud,
// the stones glow again, and the light pulls you through to the Cat Plaza at dawn.
// draw(g, t, W, H) is a pure function of t; static art is cached by the kit.
import * as K from "../filmkit.js";
import {
  runFilm, wetStreak, pool, vgrad, ridge, litRain, puddleRings, plaza, treeSil, rimStone, nightHouse, dimCoat, relit, ringPortal, tinted,
  W0 as W, H0 as H,
} from "./lib012.js";

const STORM_TOP = "#0b1424", STORM_LOW = "#1c2c44", SODIUM = "#ffb25a", BOLT = "#dfe9ff", LAMP = "#ffcf8a";
const RAIN = "rgba(159,180,212,0.35)";

// ---- shot 1: the house in the storm, slow dolly in ---------------------------------------------------
function stormSky(g, t, fl, hz) {
  vgrad(g, -40, -40, W + 80, hz + 60, [[0, "#070d19"], [0.55, STORM_TOP], [1, STORM_LOW]]);
  if (fl > 0) {
    g.save();
    g.globalCompositeOperation = "screen";
    vgrad(g, -40, -40, W + 80, hz + 60, [[0, K.rgba("#9fb4e8", 0.55 * fl)], [1, K.rgba(BOLT, 0.8 * fl)]]);
    g.restore();
  }
  K.clouds(g, W, H, t, { seed: 41, color: "#1d283c", shade: "#0a0f1a", count: 9, y: 70, spread: 60, speed: 9, alpha: 0.95, scale: 1.2 });
  if (fl > 0) K.clouds(g, W, H, t, { seed: 41, color: "#b9c8ee", shade: "#4a5a80", count: 9, y: 70, spread: 60, speed: 9, alpha: 0.85 * fl, scale: 1.2 });
}


function shotHouse(g, t, p) {
  const fl = K.flash(t, [2.0, 2.4], 0.15);
  const e = K.ease.inOut(p);
  const zoom = 1 + 0.12 * e;
  const HZ = 345;
  K.withCamera(g, W, H, { x: K.lerp(480, 452, e), y: K.lerp(270, 280, e), zoom, shakeT: t, shakeAmt: 0.8 }, () => {
    stormSky(g, t, fl, HZ);
    if (t > 1.98 && t < 2.3) K.lightningBolt(g, 790, -20, 840, 300, 7, { alpha: 1 - K.seg(t, 2.1, 2.3), width: 2.2 });
    if (t > 2.38 && t < 2.6) K.lightningBolt(g, 820, -20, 760, 280, 9, { alpha: 0.8 * (1 - K.seg(t, 2.45, 2.6)), width: 1.6 });
    // far hills in rain haze, then near hill
    ridge(g, { y: HZ + 2, amp: 50, color: K.mix("#16213a", "#4a5a7a", fl * 0.5), seed: 3, bottom: H + 40 });
    K.fog(g, W, H, { y: HZ - 5, h: 70, color: "#2a3a52", alpha: 0.5, t, seed: 2, wisps: false });
    ridge(g, { y: 398, amp: 28, color: "#0b111c", seed: 8, bottom: H + 40 });
    // distant town lights along the horizon, smeared by the rain
    for (let i = 0; i < 26; i++) {
      const lx = K.hash(i, 77) * W, ly = HZ + 4 + K.hash(i, 78) * 22;
      K.glow(g, lx, ly, 5 + K.hash(i, 79) * 6, i % 3 ? "#ffcf8a" : "#ffe6c0", 0.35 + 0.25 * Math.sin(t * 2 + i));
    }
    K.fog(g, W, H, { y: HZ + 12, h: 40, color: "#2a3a52", alpha: 0.4, t, seed: 6, wisps: false });
    treeSil(g, 760, 414, 1.55, t, { seed: 12, color: "#04070c", sway: 2.4 });
    treeSil(g, 915, 420, 1.0, t, { seed: 4, color: "#05080d", bare: true, sway: 2 });
    treeSil(g, 120, 400, 0.7, t, { seed: 9, color: "#070b12", sway: 2 });
    // the house, now with its side wall receding (Biscuit is a tiny silhouette in the lit window)
    nightHouse(g, 430, 418, 1.05, t, { catInWindow: true, flash: fl });
    // garden: lawn, hedge, a dark, rain-soaked fence (it must not pull the eye)
    vgrad(g, -40, 410, W + 80, 40, [[0, "#0b130f"], [1, "#070c0a"]]);
    K.fence(g, 214, 700, 424, 28, { night: true, color: K.mix("#1a1f27", "#5a6478", fl * 0.6) });
    K.grass(g, -40, W + 40, 442, { seed: 3, color: "#14201a", height: 10, t, wind: 1.6, density: 0.6 });
    // pavement + road, wet
    vgrad(g, -40, 440, W + 80, 26, [[0, "#1b2230"], [1, "#121822"]]);
    vgrad(g, -40, 466, W + 80, 110, [[0, "#0a0e16"], [1, "#05070b"]]);
    g.fillStyle = "rgba(160,175,200,0.12)";
    g.fillRect(-40, 465, W + 80, 1.5);
    if (fl > 0) { g.fillStyle = K.rgba("#c8d6ff", 0.22 * fl); g.fillRect(-40, 440, W + 80, 140); }
    // street lamp + its pool and long wet reflections on the road
    K.streetlamp(g, 120, 454, 232, { on: true, t, color: SODIUM, flicker: 0.08 });
    pool(g, 158, 458, 170, 22, SODIUM, 0.6);
    pool(g, 158, 502, 120, 30, SODIUM, 0.3);
    wetStreak(g, 157, 468, 38, 130, SODIUM, 1.0, t, 2);
    wetStreak(g, 128, 470, 14, 90, "#fff0c8", 0.55, t, 3);
    // the lit bedroom window, reflected in the wet road
    wetStreak(g, 430, 470, 14, 90, LAMP, 0.6, t, 5);
    for (let i = 0; i < 26; i++) {
      const lx = K.hash(i, 77) * W;
      if (lx > 600) wetStreak(g, lx, 472 + K.hash(i, 78) * 6, 4, 26, "#ffcf8a", 0.18, t, i);
    }
    // rain: dim everywhere, bright inside the lamp cone
    K.rain(g, W, H, t, { density: 1.1, angle: 0.25, color: RAIN, speed: 950, len: 26, seed: 11 });
    litRain(g, t, (c) => { c.moveTo(152, 224); c.lineTo(162, 224); c.lineTo(290, 458); c.lineTo(20, 458); c.closePath(); },
      { density: 1.1, angle: 0.25, color: "rgba(255,206,150,0.8)", speed: 950, len: 26, seed: 11 });
    K.splashes(g, W, H, t, { y0: 442, y1: 560, density: 0.9, color: "rgba(200,212,235,0.5)" });
    K.fog(g, W, H, { y: 452, h: 90, color: "#2a3a52", alpha: 0.28, t, seed: 5 });
  });
  K.grade(g, W, H, { tint: "#26355a", alpha: 0.25, mode: "soft-light", shadows: "#5a6a90", shadowAlpha: 0.15 });
  const ta = K.env(t, 3, 8.5, 1.5, 1.6);
  if (ta > 0) K.title(g, W, H, "The Night He Left", "Prologue", ta, { y: H * 0.42 - 52, size: 58, glow: "#9fb4e8" });
}

// ---- shot 2: the window, rack focus from the raindrops to Biscuit -------------------------------------
function windowOutside(g, x, y, w, h, t) {
  vgrad(g, x, y, w, h, [[0, "#0a1222"], [0.6, "#16223a"], [1, "#1a2a40"]]);
  K.clouds(g, W, H, t, { seed: 7, color: "#1b2638", shade: "#0b101c", count: 5, y: y + 40, spread: 30, speed: 7, alpha: 0.9 });
  ridge(g, { y: y + h * 0.7, amp: 30, color: "#0c1220", seed: 5, x0: x - 10, x1: x + w + 10, bottom: y + h + 10 });
  treeSil(g, x + w * 0.62, y + h * 0.8, 0.62, t, { seed: 12, color: "#05080d", sway: 2.4 });
  K.glow(g, x + w * 0.2, y + h * 0.66, 40, SODIUM, 0.55);
  K.glow(g, x + w * 0.2, y + h * 0.66, 6, "#fff2d0", 0.8);
  K.rain(g, W, H, t, { density: 0.45, angle: 0.25, color: "rgba(140,160,195,0.3)", speed: 800, len: 16, seed: 21 });
}
// sliding drops with trails, on top of the kit's static beads (pure function of t)
function slidingDrops(g, x, y, w, h, t, seed) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  for (let i = 0; i < 16; i++) {
    const sp = 18 + K.hash(i, seed) * 40, span = h + 80;
    const dx = x + K.hash(i + 0.4, seed) * w;
    const dy = y - 40 + ((K.hash(i + 0.2, seed) * span + t * sp) % span);
    const r = 2 + K.hash(i + 0.6, seed) * 2.5;
    const wob = Math.sin(dy * 0.05 + i) * 2;
    const tr = g.createLinearGradient(0, dy - 90, 0, dy);
    tr.addColorStop(0, "rgba(190,205,230,0)");
    tr.addColorStop(1, "rgba(190,205,230,0.22)");
    g.strokeStyle = tr;
    g.lineWidth = r * 0.9;
    g.beginPath();
    g.moveTo(dx + wob, dy);
    g.quadraticCurveTo(dx - wob, dy - 45, dx + wob * 0.5, dy - 90);
    g.stroke();
    g.fillStyle = "rgba(8,12,20,0.45)";
    g.beginPath(); g.ellipse(dx + wob, dy, r, r * 1.25, 0, 0, K.TAU); g.fill();
    g.fillStyle = "rgba(255,214,160,0.75)";
    g.beginPath(); g.arc(dx + wob + r * 0.35, dy - r * 0.4, r * 0.38, 0, K.TAU); g.fill();
    g.fillStyle = "rgba(160,190,240,0.35)";
    g.beginPath(); g.arc(dx + wob - r * 0.3, dy + r * 0.5, r * 0.45, 0, K.TAU); g.fill();
  }
  g.restore();
}
const WIN = { x: 60, y: 30, w: 470, h: 352 };
function windowRoom(g, t) {
  // wall, lit warm from the lamp at the right
  vgrad(g, -40, -40, W + 80, H + 80, [[0, "#1d1620"], [1, "#2a1e1e"]]);
  K.glow(g, 905, 300, 620, LAMP, 0.38);
  K.glow(g, 905, 300, 240, LAMP, 0.35);
  // window outside + glass
  g.save();
  g.beginPath();
  g.rect(WIN.x, WIN.y, WIN.w, WIN.h);
  g.clip();
  windowOutside(g, WIN.x, WIN.y, WIN.w, WIN.h, t);
  K.glassDrops(g, WIN.x, WIN.y, WIN.w, WIN.h, t, { seed: 13, density: 1.0, light: "#ffd9a0" });
  slidingDrops(g, WIN.x, WIN.y, WIN.w, WIN.h, t, 5);
  // the lamp reflected in the glass
  K.glow(g, WIN.x + WIN.w * 0.86, WIN.y + WIN.h * 0.55, 70, LAMP, 0.16);
  g.restore();
  // frame + mullions
  g.strokeStyle = "#3a2c28";
  g.lineWidth = 16;
  g.strokeRect(WIN.x, WIN.y, WIN.w, WIN.h);
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(WIN.x + WIN.w / 2, WIN.y); g.lineTo(WIN.x + WIN.w / 2, WIN.y + WIN.h);
  g.moveTo(WIN.x, WIN.y + WIN.h * 0.48); g.lineTo(WIN.x + WIN.w, WIN.y + WIN.h * 0.48);
  g.stroke();
  // frame catches the lamp on its right-facing edges
  g.strokeStyle = "rgba(255,190,120,0.35)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(WIN.x + WIN.w / 2 + 3.5, WIN.y + 4); g.lineTo(WIN.x + WIN.w / 2 + 3.5, WIN.y + WIN.h - 4);
  g.moveTo(WIN.x + WIN.w + 8, WIN.y - 8); g.lineTo(WIN.x + WIN.w + 8, WIN.y + WIN.h + 8);
  g.stroke();
  // sill
  vgrad(g, WIN.x - 30, WIN.y + WIN.h + 2, WIN.w + 160, 22, [[0, "#6a4a36"], [0.3, "#4a3226"], [1, "#2a1c16"]]);
  g.fillStyle = "rgba(255,200,140,0.25)";
  g.fillRect(WIN.x - 30, WIN.y + WIN.h + 2, WIN.w + 160, 2);
  vgrad(g, -40, WIN.y + WIN.h + 24, W + 80, H, [[0, "#1a1214"], [1, "#0e0a0c"]]);
  // curtain at the right edge of the window, lit by the lamp
  const cx = WIN.x + WIN.w + 14;
  const cg = g.createLinearGradient(cx, 0, cx + 110, 0);
  for (let k = 0; k <= 8; k++) cg.addColorStop(k / 8, k % 2 ? "#5a2a2c" : "#7a3a36");
  g.fillStyle = cg;
  g.beginPath();
  g.moveTo(cx, -10);
  g.lineTo(cx + 110, -10);
  g.quadraticCurveTo(cx + 120 + Math.sin(t * 0.6) * 3, 250, cx + 100, 420);
  g.lineTo(cx + 6, 410);
  g.quadraticCurveTo(cx + 20, 200, cx, -10);
  g.fill();
  g.fillStyle = "rgba(255,190,120,0.18)";
  g.fillRect(cx + 70, -10, 40, 420);
  // the lamp itself (shade at the right edge)
  g.fillStyle = "#e9b46a";
  g.beginPath();
  g.moveTo(860, 250); g.lineTo(950, 250); g.lineTo(975, 330); g.lineTo(840, 330); g.closePath();
  g.fill();
  K.glow(g, 905, 300, 90, "#fff0c8", 0.8);
  K.glow(g, 905, 335, 50, "#ffffff", 0.6);
  g.fillStyle = "#2a1c16";
  g.fillRect(820, 400, 180, 160);
  vgrad(g, 820, 400, 180, 6, [[0, "#6a4a36"], [1, "#3a2820"]]);
}
// a few big rain beads on the glass, out of focus once the focus racks to him (soft discs whose
// lower half catches the lamp and upper half the cold sky)
function bokehDrops(g, t, a) {
  if (a <= 0.01) return;
  g.save();
  g.beginPath();
  g.rect(WIN.x, WIN.y, WIN.w, WIN.h);
  g.clip();
  for (let i = 0; i < 9; i++) {
    const r = 9 + K.hash(i, 41) * 12;
    const x = WIN.x + 20 + K.hash(i, 42) * (WIN.w - 40);
    const y = WIN.y + ((K.hash(i, 43) * WIN.h + t * (2 + K.hash(i, 44) * 5)) % WIN.h);
    K.glow(g, x, y, r * 1.6, "#9fb4d8", 0.22 * a);
    K.glow(g, x + r * 0.2, y + r * 0.35, r, "#ffcf8a", 0.3 * a);
  }
  g.restore();
}
// Biscuit seen from behind on the sill: his back to us, head turned to the glass. The only light
// is the lamp on the right, so his left side falls into shadow and the right edge gets a warm rim.
function windowCat(c, t, cam) {
  const meow = K.env(t, 11.85, 12.9, 0.15, 0.4);
  const flick = Math.exp(-Math.pow((t - 12.3) * 3, 2));
  K.withCamera(c, W, H, cam, () => {
    relit(c, "f00-win-relit", (s) => {
      K.drawCat(s, 392, WIN.y + WIN.h + 6, 126, {
        pose: "sit", facing: -1, headTurn: -0.82 + meow * 0.32 + 0.05 * Math.sin(t * 0.7), headTilt: 0.06 + 0.05 * Math.sin(t * 0.5),
        t, tail: 0.5 + 0.18 * Math.sin(t * 1.1) + flick * 0.5, mouth: meow * 0.8, ears: 0.1 * Math.sin(t * 0.9),
        blink: 0, collar: true, bell: true, gaze: 0,
        light: { x: 905, y: 300, color: LAMP, strength: 1.2 }, ground: "#000000",
      });
    }, { dir: [300, 0, 500, 0], darkA: 0.88, mid: 0.68, shadow: "#05030a", rim: "#ffc070", rimA: 0.42, rimFrom: 0.78 });
  });
}
function shotWindow(g, t, p) {
  const rack = K.smooth(K.seg(t, 13, 15));
  const cam = { x: K.lerp(470, 455, p), y: K.lerp(262, 270, p), zoom: 1.04 + 0.05 * K.ease.inOut(p), shakeT: t, shakeAmt: 0.7 };
  const bgBlur = K.lerp(0, 5, rack), catBlur = K.lerp(5.5, 0, rack);
  K.focus(g, W, H, bgBlur, (c) => K.withCamera(c, W, H, cam, () => windowRoom(c, t)), "f00-win-bg");
  K.withCamera(g, W, H, cam, () => bokehDrops(g, t, rack));
  K.focus(g, W, H, catBlur, (c) => windowCat(c, t, cam), "f00-win-cat");
  K.grade(g, W, H, { tint: "#3a2a4a", alpha: 0.2, mode: "soft-light", shadows: "#4a5a88", shadowAlpha: 0.2 });
}

// ---- shot 3: his POV down into the garden: pawprints appear ---------------------------------------------
// Everything static in this view (far ridge, the neighbours' trees, the wet lawn, mowing stripes, the
// back fence with its gap) is baked into ONE sprite; only the stones, prints, rain and light move.
const ST3 = [{ x: 528, y: 262, w: 92, h: 190, seed: 3 }, { x: 690, y: 256, w: 80, h: 166, seed: 5 }];
function gardenStatic() {
  return K.sprite("f00-garden-static", W + 80, H + 80, (s) => {
    s.translate(40, 40);
    ridge(s, { y: 70, amp: 36, color: "#0a0f18", seed: 9, bottom: 200 });
    for (let i = 0; i < 6; i++) treeSil(s, 40 + i * 180 + K.hash(i, 3) * 60, 104, 0.42 + K.hash(i, 4) * 0.2, 0, { seed: 30 + i, color: "#070b12", sway: 0 });
    // the wet lawn, lifted ~15% out of the blacks so the grass reads
    vgrad(s, -40, 95, W + 80, H - 40, [[0, "#121c17"], [0.5, "#16241a"], [1, "#1b2c1f"]]);
    const R = K.rng("lawn2");
    const lh = H - 40;
    for (let i = 0; i < 4200; i++) {
      const v = Math.pow(R(), 0.7), x = -40 + R() * (W + 80), y = 95 + v * lh;
      const l = 2 + v * 16, a = -Math.PI / 2 + (R() - 0.5) * 0.9;
      s.strokeStyle = R() > 0.55 ? "rgba(70,102,62,0.55)" : "rgba(10,18,12,0.55)";
      s.lineWidth = 0.6 + v * 1.4;
      s.beginPath(); s.moveTo(x, y); s.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); s.stroke();
    }
    for (let i = 0; i < 300; i++) { s.fillStyle = "rgba(190,210,240,0.35)"; const v = R(); s.fillRect(-40 + R() * (W + 80), 95 + v * lh, 0.6 + v, 0.6 + v); }
    // mowing stripes for perspective
    s.save();
    s.globalAlpha = 0.045;
    for (let i = -6; i <= 6; i++) {
      s.fillStyle = i % 2 ? "#4a6a4a" : "#000000";
      s.beginPath();
      s.moveTo(600 + i * 40, 165); s.lineTo(600 + (i + 1) * 40, 165); s.lineTo(480 + (i + 1) * 170, H + 20); s.lineTo(480 + i * 170, H + 20);
      s.fill();
    }
    s.restore();
    // the back fence (far), with the gap the prints come through
    K.fence(s, -40, W + 40, 162, 46, { night: true, color: "#1c222c", gap: [575, 622], tuft: false });
    vgrad(s, -40, 110, W + 80, 56, [[0, "rgba(10,14,22,0)"], [1, "rgba(10,14,22,0.3)"]]);
    // stones' dark footprint in the wet grass
    for (const q of ST3) { s.fillStyle = "rgba(0,0,0,0.45)"; s.beginPath(); s.ellipse(q.x + 10, q.y + 2, q.w * 0.8, q.w * 0.12, 0, 0, K.TAU); s.fill(); }
  });
}
function shotGarden(g, t, p) {
  const fl = K.flash(t, [21.0, 21.35], 0.18);
  const cam = { x: K.lerp(480, 500, p), y: K.lerp(270, 255, p), zoom: 1.02 + 0.06 * K.ease.inOut(p), shakeT: t, shakeAmt: 1 };
  K.withCamera(g, W, H, cam, () => {
    // sky strip: storm blue, flashing pale #dfe9ff with the lightning
    vgrad(g, -40, -40, W + 80, 120, [[0, K.mix("#0d1626", BOLT, fl * 0.85)], [1, K.mix("#1a273c", BOLT, fl * 0.75)]]);
    g.drawImage(gardenStatic(), -40, -40, W + 80, H + 80);
    if (fl > 0) {
      // the whole garden lit hard for a frame: lawn and fence jump out of the dark
      g.save();
      g.globalCompositeOperation = "screen";
      g.fillStyle = K.rgba("#8fa4cc", 0.45 * fl);
      g.fillRect(-40, 60, W + 80, H);
      g.restore();
    }
    // the two old standing stones INSIDE the garden: almost invisible, until the lightning
    for (const q of ST3) {
      rimStone(g, q.x, q.y, q.w, q.h, { seed: q.seed, color: K.mix("#141a20", "#4e5868", fl * 0.9), rim: BOLT, rimA: 0.14 + 0.8 * fl, dx: 3, dy: -3, wet: 1 });
    }
    if (fl > 0) K.glow(g, 610, 150, 220, BOLT, 0.3 * fl);
    // window light thrown onto the lawn, with the cat's silhouette sitting in it
    const WL = K.blurLayer(W, H, "f00-winpatch", 0, (c) => {
      const wl = c.createLinearGradient(0, 400, 0, 560);
      wl.addColorStop(0, "rgba(255,176,104,0.12)");
      wl.addColorStop(1, "rgba(255,176,104,0.3)");
      c.fillStyle = wl;
      c.beginPath();
      c.moveTo(250, 405); c.lineTo(660, 405); c.lineTo(760, 570); c.lineTo(150, 570); c.closePath();
      c.fill();
      c.globalCompositeOperation = "destination-out";
      c.save();
      c.translate(560, 560);
      c.transform(1, 0, -0.25, 1.15, 0, 0);
      K.drawCat(c, 0, 0, 80, { pose: "sit", facing: -1, t: 0, shadow: false, tail: 0.5, lod: 0 });
      c.restore();
      c.fillStyle = "#000";
      c.fillRect(150, 486, 620, 10);
      c.fillRect(446, 400, 10, 170);
    });
    g.save();
    g.globalCompositeOperation = "lighter";
    K.dof(g, WL.canvas, 3.5);
    g.restore();
    // the pawprints: from between the stones toward the house, one every 0.5 s from t = 20
    const pts = K.pawTrail(608, 262, 470, 525, 11, t, { start: 20, every: 0.5, life: 12, s0: 5, s1: 15 });
    K.pawprints(g, pts, 1.15);
    for (const q of pts) pool(g, q.x, q.y, q.s * 3.2, q.s * 1.1, "#ff7a1a", 0.25 * q.alpha);
    // rain from above
    K.rain(g, W, H, t, { density: 0.6, angle: 0.08, color: "rgba(150,170,205,0.32)", speed: 700, len: 14, seed: 5 });
    K.splashes(g, W, H, t, { y0: 170, y1: 560, density: 0.7, color: "rgba(180,195,225,0.35)", seed: 4 });
    K.fog(g, W, H, { y: 175, h: 90, color: "#2a3a52", alpha: 0.32, t, seed: 3 });
  });
  // the glass we look through (soft beads) and the window frame around his view
  K.focus(g, W, H, 2.2, (c) => {
    K.glassDrops(c, 0, 0, W, H, t, { seed: 17, density: 0.6, light: "#ffd9a0" });
    slidingDrops(c, 0, 0, W, H, t, 9);
    // rivulets running down the glass near the frame
    for (let i = 0; i < 7; i++) {
      const x = i < 4 ? 46 + i * 9 + K.hash(i, 5) * 6 : W - 50 - (i - 4) * 10 - K.hash(i, 5) * 6;
      const y0 = 30 + K.hash(i, 6) * 80, y1 = 460;
      c.strokeStyle = "rgba(200,215,240,0.16)";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x, y0);
      for (let y = y0; y < y1; y += 24) c.lineTo(x + Math.sin(y * 0.05 + i) * 2.5, y);
      c.stroke();
      c.strokeStyle = "rgba(255,220,170,0.22)";
      c.lineWidth = 0.8;
      c.stroke();
    }
  }, "f00-glass");
  // the window frame itself, sharp (close but in the dark room behind him)
  const fr = (x, y, w, h, lit) => {
    const gr = g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, lit ? "#2a1d18" : "#120c0b");
    gr.addColorStop(1, lit ? "#140e0c" : "#1e1512");
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  };
  fr(-10, -10, 42, H + 20, false);
  fr(W - 36, -10, 46, H + 20, true);
  vgrad(g, -10, -10, W + 20, 40, [[0, "#0e0a0a"], [1, "#1c1412"]]);
  g.fillStyle = "rgba(255,200,140,0.18)";
  g.fillRect(31, 28, 1.5, H);
  g.fillRect(W - 37, 28, 1.5, H);
  g.fillRect(31, 28, W - 68, 1.5);
  K.glow(g, W - 120, 60, 160, LAMP, 0.12);
  if (fl > 0) { g.save(); g.globalCompositeOperation = "screen"; g.fillStyle = K.rgba("#9fb0d8", 0.25 * fl); g.fillRect(0, 0, W, H); g.restore(); }
  K.grade(g, W, H, { tint: "#26355a", alpha: 0.22, mode: "soft-light", lift: "#0a0e10" });
}

// ---- shot 4: the cat flap, from outside, a LOW camera (horizon at y 196) ---------------------------------
const VP = [940, 196];
// a line through VP: y at screen x for a line that passes through (x0, y0)
const toVP = (x, x0, y0) => y0 + (VP[1] - y0) * ((x - x0) / (VP[0] - x0));
const gY = (x) => toVP(x, -40, 470); // the wall's foot on the patio
const tY = (x) => toVP(x, -40, -300); // the wall's top edge (out of frame)
const wallAt = (x, k) => K.lerp(gY(x), tY(x), k); // k = 0 ground .. 1 top
const FLAP = { x0: 122, x1: 176, k0: 0.012, k1: 0.13 };
function flapAngle(t) {
  if (t < 28.0) return 0;
  if (t < 29.7) return 1.0 * K.smooth(K.seg(t, 28.0, 28.35)); // his head pushes it open, his body holds it
  const u = t - 29.7;
  return 1.0 * Math.cos(u * 6) * Math.exp(-u); // he is through: it swings shut and clicks
}
const BISCUIT_NIGHT = dimCoat(0.48, "#0d1424");
function catFlapPos(t) {
  const fx = (FLAP.x0 + FLAP.x1) / 2;
  if (t < 29.8) {
    // squeezing through: from inside the flap to just outside it
    const u = K.ease.inOut(K.seg(t, 28.0, 29.8));
    return { x: K.lerp(fx - 40, fx + 70, u), y: K.lerp(gY(fx) - 2, gY(fx) + 14, u), size: 64, pose: "walk", phase: t * 1.1, head: 0.1, ears: -0.2 * (1 - u) };
  }
  if (t < 31.9) {
    const u = K.ease.inOut(K.seg(t, 29.8, 31.9));
    return { x: K.lerp(fx + 70, 380, u), y: K.lerp(gY(fx) + 14, 436, u), size: K.lerp(64, 60, u), pose: "walk", phase: t * 1.15, head: 0.05 };
  }
  if (t < 33.6) {
    // stops; looks back over his shoulder at the house, eyes catching the porch light
    const look = K.smooth(K.seg(t, 32.0, 32.45)) - K.smooth(K.seg(t, 33.2, 33.6));
    return { x: 380, y: 436, size: 60, pose: "stand", phase: 0, head: K.lerp(0.05, 0.92, look), gaze: -0.3 * look, glow: look, tailUp: 0.4 };
  }
  const u = K.ease.in(K.seg(t, 33.6, 35.2));
  return { x: K.lerp(380, 820, u), y: K.lerp(436, 300, u), size: K.lerp(60, 26, u), pose: u > 0.12 ? "run" : "walk", phase: t * 2.2, head: 0.05 };
}
function patioSprite() {
  return K.sprite("f00-patio", W + 80, H, (s) => {
    s.translate(40, 0);
    // wet flagstones running away to the vanishing point: rows get thinner with distance
    vgrad(s, -40, VP[1] - 4, W + 80, H, [[0, "#0d1118"], [1, "#171c25"]]);
    const R = K.rng("patio");
    const rows = [];
    for (let k = 0; k < 14; k++) rows.push(VP[1] + 4 + Math.pow((k + 1) / 14, 2.2) * (H - VP[1]));
    s.strokeStyle = "rgba(0,0,0,0.55)";
    s.lineWidth = 1.2;
    for (let k = 0; k < rows.length; k++) {
      const y = rows[k];
      s.beginPath(); s.moveTo(-40, y); s.lineTo(W + 40, y); s.stroke();
      // joints between slabs: radial lines toward VP, staggered row to row
      const y0 = k ? rows[k - 1] : VP[1] + 4;
      for (let i = -14; i < 22; i++) {
        const bx = VP[0] + (i + (k % 2) * 0.5) * 140;
        const x1 = VP[0] + (bx - VP[0]) * ((y - VP[1]) / (H - VP[1])) * 1.0;
        const x0 = VP[0] + (bx - VP[0]) * ((y0 - VP[1]) / (H - VP[1]));
        s.beginPath(); s.moveTo(x0, y0); s.lineTo(x1, y); s.stroke();
        // slab tone variation + puddled hollows
        const hue = R();
        s.fillStyle = hue > 0.7 ? "rgba(120,130,150,0.06)" : hue < 0.25 ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0)";
        s.beginPath(); s.moveTo(x0, y0); s.lineTo(x0 + 140 * ((y0 - VP[1]) / (H - VP[1])), y0); s.lineTo(x1 + 140 * ((y - VP[1]) / (H - VP[1])), y); s.lineTo(x1, y); s.closePath(); s.fill();
      }
    }
    // a soft sheen of standing water
    for (let i = 0; i < 18; i++) {
      const y = VP[1] + 20 + Math.pow(R(), 0.8) * (H - VP[1]);
      s.fillStyle = "rgba(150,170,205,0.05)";
      s.beginPath(); s.ellipse(R() * W, y, 40 + R() * 120, 3 + (y - VP[1]) * 0.03, 0, 0, K.TAU); s.fill();
    }
  });
}
function shotFlap(g, t, p) {
  const cam = { x: K.lerp(470, 490, p), y: 270, zoom: 1.03 + 0.03 * p, shakeT: t, shakeAmt: 0.9 };
  const wet = 0.6 * K.seg(t, 28.5, 35);
  const porch = [262, wallAt(262, 0.43)];
  K.withCamera(g, W, H, cam, () => {
    // the garden beyond, from cat height: sky, a tree, the back fence on the horizon
    vgrad(g, -40, -40, W + 80, VP[1] + 50, [[0, "#070c18"], [1, "#16223a"]]);
    K.clouds(g, W, H, t, { seed: 41, color: "#1b2538", shade: "#0a0f1a", count: 6, y: 40, spread: 40, speed: 9, alpha: 0.9 });
    ridge(g, { y: VP[1] - 2, amp: 22, color: "#0a101a", seed: 6, bottom: VP[1] + 30 });
    treeSil(g, 780, VP[1] + 10, 0.95, t, { seed: 12, color: "#04070c", sway: 2.4 });
    K.fence(g, 430, W + 40, VP[1] + 14, 30, { night: true, color: "#1e242e" });
    g.drawImage(patioSprite(), -40, 0, W + 80, H);
    // the house wall in strong perspective: siding, the door with its glass, the cat flap
    const wall = new Path2D();
    wall.moveTo(-40, tY(-40)); wall.lineTo(520, tY(520)); wall.lineTo(520, gY(520)); wall.lineTo(-40, gY(-40)); wall.closePath();
    const wg = g.createLinearGradient(-40, 0, 520, 0);
    wg.addColorStop(0, "#222837");
    wg.addColorStop(1, "#141924");
    g.fillStyle = wg;
    g.fill(wall);
    g.save();
    g.clip(wall);
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.lineWidth = 1;
    for (let k = 0; k < 40; k++) { const kk = k / 40; g.beginPath(); g.moveTo(-40, wallAt(-40, kk)); g.lineTo(520, wallAt(520, kk)); g.stroke(); }
    K.glow(g, porch[0], porch[1] + 40, 280, "#ffd79a", 0.42);
    g.restore();
    g.fillStyle = "#2e3646";
    g.beginPath(); g.moveTo(518, tY(518)); g.lineTo(530, tY(530)); g.lineTo(530, gY(530)); g.lineTo(518, gY(518)); g.fill();
    // door
    const dx0 = 92, dx1 = 212;
    const door = new Path2D();
    door.moveTo(dx0, wallAt(dx0, 0.6)); door.lineTo(dx1, wallAt(dx1, 0.6)); door.lineTo(dx1, gY(dx1)); door.lineTo(dx0, gY(dx0)); door.closePath();
    const dg = g.createLinearGradient(dx0, 0, dx1, 0);
    dg.addColorStop(0, "#3a2220");
    dg.addColorStop(1, "#5a3428");
    g.fillStyle = dg;
    g.fill(door);
    g.strokeStyle = "#4a3a34";
    g.lineWidth = 5;
    g.stroke(door);
    // glass panel in the door, warm kitchen light behind it
    const gp = (x, k) => [x, wallAt(x, k)];
    const q = [gp(dx0 + 14, 0.52), gp(dx1 - 12, 0.52), gp(dx1 - 12, 0.3), gp(dx0 + 14, 0.3)];
    g.fillStyle = "#c98a4a";
    g.beginPath(); g.moveTo(...q[0]); g.lineTo(...q[1]); g.lineTo(...q[2]); g.lineTo(...q[3]); g.closePath(); g.fill();
    K.glow(g, (dx0 + dx1) / 2, wallAt((dx0 + dx1) / 2, 0.41), 70, LAMP, 0.35);
    K.glassDrops(g, dx0 + 14, Math.min(q[0][1], q[1][1]), dx1 - dx0 - 26, Math.max(q[2][1], q[3][1]) - Math.min(q[0][1], q[1][1]), t, { seed: 23, density: 2, light: "#ffe0b0" });
    // cat flap: frame, the opening (warm light when open), the hinged panel drawn after the cat
    const fx0 = FLAP.x0, fx1 = FLAP.x1;
    const fb0 = wallAt(fx0, FLAP.k0), fb1 = wallAt(fx1, FLAP.k0), ft0 = wallAt(fx0, FLAP.k1), ft1 = wallAt(fx1, FLAP.k1);
    const th = flapAngle(t);
    const open = Math.abs(th);
    g.fillStyle = "#1a1210";
    g.beginPath(); g.moveTo(fx0 - 6, ft0 - 6); g.lineTo(fx1 + 6, ft1 - 6); g.lineTo(fx1 + 6, fb1 + 4); g.lineTo(fx0 - 6, fb0 + 4); g.closePath(); g.fill();
    g.fillStyle = "#3a302c";
    g.beginPath(); g.moveTo(fx0 - 6, ft0 - 6); g.lineTo(fx1 + 6, ft1 - 6); g.lineTo(fx1 + 6, ft1 - 2); g.lineTo(fx0 - 6, ft0 - 2); g.closePath(); g.fill();
    const opening = new Path2D();
    opening.moveTo(fx0, ft0); opening.lineTo(fx1, ft1); opening.lineTo(fx1, fb1); opening.lineTo(fx0, fb0); opening.closePath();
    g.fillStyle = K.rgba("#ffb870", 0.85 * K.clamp(open * 1.5));
    if (open > 0.02) g.fill(opening);
    if (open > 0.02) pool(g, fx1 + 50, fb1 + 12, 90, 12, "#ffb870", 0.4 * K.clamp(open * 1.5));
    // porch light + its pool on the wet patio
    g.fillStyle = "#1a1c22";
    g.fillRect(porch[0] - 7, porch[1] - 16, 14, 26);
    K.glow(g, porch[0], porch[1], 120, "#ffd79a", 0.5);
    K.glow(g, porch[0], porch[1], 14, "#ffffff", 0.95);
    pool(g, 340, 452, 240, 30, "#ffd79a", 0.38);
    wetStreak(g, porch[0] + 70, gY(porch[0]) + 8, 26, 80, "#ffd79a", 0.5, t, 4);
    // Biscuit: lit by the porch lamp, darkened into the night, getting wet; contact shadow and
    // his reflection in the wet flagstones
    if (t > 27.95) {
      const c = catFlapPos(t);
      const opts = {
        pose: c.pose, phase: c.phase, facing: 1, headTurn: c.head, t, wet, collar: true, bell: true, coat: BISCUIT_NIGHT,
        eyesGlow: (c.glow || 0) * 0.95, dark: true, gaze: c.gaze || 0, tail: 0.5 + 0.2 * Math.sin(t * 2), tailUp: c.tailUp,
        ears: c.ears || 0, light: { x: porch[0], y: porch[1], color: "#ffd79a", strength: 1.5 }, ground: "#000000",
      };
      const clipThrough = (fn) => {
        g.save();
        if (t < 29.85) {
          // still half inside: only the part through the opening, or already past the wall plane, shows
          const cl = new Path2D(opening);
          cl.rect(fx1 - 1, -200, W + 400, H + 400);
          g.clip(cl);
        }
        fn();
        g.restore();
      };
      if (t > 29.0) {
        g.save();
        g.translate(0, c.y * 2 + 3);
        g.scale(1, -1);
        g.globalAlpha = 0.2 * K.seg(t, 29.0, 29.6);
        K.drawCat(g, c.x, c.y, c.size, Object.assign({}, opts, { shadow: false, lod: 0 }));
        g.restore();
        // ripples break the reflection up
        g.fillStyle = "rgba(13,17,24,0.5)";
        for (let i = 0; i < 6; i++) g.fillRect(c.x - c.size * 1.2, c.y + 6 + i * 6 + Math.sin(t * 3 + i) * 1.5, c.size * 2.6, 1.6);
      }
      clipThrough(() => K.drawCat(g, c.x, c.y, c.size, opts));
    }
    // the swinging flap panel (hinged at its top edge; + swings out toward us, - back inside)
    const hgt0 = fb0 - ft0, hgt1 = fb1 - ft1;
    const out = Math.sin(th), down = Math.cos(th);
    const bx0 = fx0 + out * hgt0 * 0.95, by0 = ft0 + down * hgt0 + Math.abs(out) * hgt0 * 0.12;
    const bx1 = fx1 + out * hgt1 * 0.95, by1 = ft1 + down * hgt1 + Math.abs(out) * hgt1 * 0.12;
    const pg = g.createLinearGradient(0, ft0, 0, Math.max(by0, by1));
    pg.addColorStop(0, th < 0 ? "rgba(70,62,58,0.7)" : "rgba(128,118,108,0.88)");
    pg.addColorStop(1, th < 0 ? "rgba(40,34,30,0.7)" : "rgba(78,70,64,0.88)");
    g.fillStyle = pg;
    g.beginPath(); g.moveTo(fx0, ft0); g.lineTo(fx1, ft1); g.lineTo(bx1, by1); g.lineTo(bx0, by0); g.closePath(); g.fill();
    g.strokeStyle = "rgba(255,215,154,0.5)";
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(bx0, by0); g.lineTo(bx1, by1); g.stroke();
    // rain: everywhere dim, bright around the porch light
    K.rain(g, W, H, t, { density: 1.0, angle: 0.22, color: RAIN, speed: 950, len: 24, seed: 31 });
    litRain(g, t, (qq) => qq.arc(porch[0] + 60, porch[1] + 120, 230, 0, K.TAU), { density: 1.0, angle: 0.22, color: "rgba(255,215,160,0.8)", speed: 950, len: 24, seed: 31 });
    K.splashes(g, W, H, t, { y0: VP[1] + 30, y1: 560, x0: 200, x1: W, density: 1.0, color: "rgba(220,215,200,0.45)", seed: 8 });
  });
  K.grade(g, W, H, { tint: "#2a3550", alpha: 0.22, mode: "soft-light", shadows: "#4a5a88", shadowAlpha: 0.15 });
}

// ---- shot 5: the chase down the garden, the portal opens -----------------------------------------------
// One garden layout shared with shot 7: the house's back corner at the left edge, a hedge down each
// side, old oaks at varied distances, the back fence across the far end and the two standing stones.
const F5 = 600, HZ5 = 214, CH5 = 1.2;
const proj = (X, Z) => [480 + (X * F5) / Z, HZ5 + (CH5 * F5) / Z, F5 / Z];
const OAKS = [[-6.5, 15, 7.5, 3], [5.6, 13, 6.5, 6], [-4.4, 9.5, 5.2, 8], [7.5, 8, 7.8, 11], [-9, 7, 8, 13]];
function portalOpen(t) { return t < 39 ? 0 : t < 43.6 ? K.ease.back(K.seg(t, 39, 40.2)) : 1 - K.ease.in(K.seg(t, 43.6, 44)); }
function hedge(g, X, z0, z1, hgt, seed, t) {
  // dark clipped hedge: overlapping leafy lumps, far to near
  for (let z = z1; z >= z0; z -= 0.55) {
    const [x, y, s] = proj(X, z);
    const h = hgt * s;
    g.fillStyle = K.mix("#070c09", "#0d1610", K.clamp(1 - z / 16));
    for (let k = 0; k < 3; k++) {
      const r = h * (0.32 + 0.12 * K.hash(z * 3 + k, seed));
      g.beginPath();
      g.arc(x + (k - 1) * r * 0.7 + Math.sin(t * 1.3 + z) * 0.6, y - h + r * 0.9, r, 0, K.TAU);
      g.fill();
    }
    g.fillRect(x - h * 0.55, y - h + h * 0.3, h * 1.1, h * 0.7);
  }
}
// static (camera-fixed) parts of the garden, baked once: fence, trees, hedges, the house corner
function gardenSet(g, zFence, view) {
  const spr = K.sprite("f00-garden5:" + view, W + 240, H + 200, (s) => {
    s.translate(120, 100);
    gardenPaint(s, 0, 0, zFence, view);
  });
  g.drawImage(spr, -120, -100, W + 240, H + 200);
}
function gardenPaint(g, t, fl, zFence, view) {
  // back fence + the neighbours' dark trees beyond it
  const [fxL, fy, fs] = proj(-9, zFence), [fxR] = proj(9, zFence);
  treeSil(g, 300, fy - 2, 0.55, t, { seed: 33, color: "#05080d", sway: 2 });
  treeSil(g, 700, fy - 4, 0.65, t, { seed: 34, color: "#05080d", sway: 2 });
  vgrad(g, -60, fy - 2, W + 120, H, [[0, "#0b130f"], [1, "#101a13"]]);
  K.fence(g, fxL, fxR, fy, 1.2 * fs, { night: true, color: K.mix("#1a1f28", "#4a5468", fl) });
  // oaks, far to near, and the side hedges
  // (lit-leaf oaks washed down to night silhouettes that keep a little canopy modelling)
  tinted(g, "f00-oaks", (c) => {
    for (const [X, Z, hm, seed] of OAKS) {
      if (Z > zFence + 2) continue;
      const [x, y, s] = proj(X, Z);
      if (x < -400 || x > W + 400) continue;
      K.tree(c, x, y, (hm * s) / 300, { seed, leaf: "#2a4a30", trunk: "#1a1a16", t, kind: "oak", sway: 1.4 });
    }
  }, K.mix("#05090a", "#3a3020", fl), 0.86);
  hedge(g, -3.3, 2.2, zFence - 0.3, 1.1, 5, t);
  hedge(g, 3.6, 2.6, zFence - 0.3, 1.0, 7, t);
  if (view === "chase") {
    // the house's back corner, close at the left edge: wet siding, a lit kitchen window
    const [x1, y1, s1] = proj(-2.6, 4.2);
    const wall = new Path2D();
    wall.moveTo(-80, -80); wall.lineTo(x1, HZ5 + (CH5 - 3.2) * s1); wall.lineTo(x1, y1); wall.lineTo(-80, H + 80); wall.closePath();
    const wg = g.createLinearGradient(-80, 0, x1, 0);
    wg.addColorStop(0, "#0c1018");
    wg.addColorStop(1, "#151b26");
    g.fillStyle = wg;
    g.fill(wall);
    g.save();
    g.clip(wall);
    g.strokeStyle = "rgba(0,0,0,0.4)";
    g.lineWidth = 1;
    for (let k = 0; k < 22; k++) { const yy = HZ5 + (CH5 - k * 0.15) * s1; g.beginPath(); g.moveTo(x1, yy); g.lineTo(-80, HZ5 + (yy - HZ5) * 3.2); g.stroke(); }
    const [wx, wy] = proj(-2.6, 3.4), [, wy2] = [0, HZ5 + (CH5 - 2.0) * (F5 / 3.4)];
    g.fillStyle = "#e0a060";
    g.fillRect(wx - 34, wy2, 30, wy - wy2 - 60);
    K.glow(g, wx - 20, wy2 + 40, 90, LAMP, 0.4);
    g.restore();
    g.fillStyle = "#1c2230";
    g.fillRect(x1 - 3, HZ5 + (CH5 - 3.2) * s1, 4, y1 - HZ5 - (CH5 - 3.2) * s1);
    // window light spilling across the near lawn
    pool(g, 150, 470, 220, 40, LAMP, 0.25);
  }
}
function shotChase(g, t, p) {
  const hit = Math.exp(-Math.max(0, t - 39) * 5) * (t >= 39 ? 1 : 0) + Math.exp(-Math.max(0, t - 44) * 5) * (t >= 44 ? 1 : 0);
  const bob = Math.abs(Math.sin(t * 9.4)) * 9;
  const zStone = K.lerp(7.2, 5.8, K.ease.inOut(p));
  const po = portalOpen(t);
  const [sx, sy, ss] = proj(0.55, zStone);
  const pr = 0.62 * ss * po;
  const pyc = sy - 0.95 * ss;
  const cam = { x: 480 + Math.sin(t * 0.7) * 6, y: 270 - bob * 0.25, zoom: 1.04, shakeT: t * 1.6, shakeAmt: 2 + hit * 6 };
  K.withCamera(g, W, H, cam, () => {
    vgrad(g, -60, -60, W + 120, HZ5 + 80, [[0, "#060b16"], [1, "#132036"]]);
    K.clouds(g, W, H, t, { seed: 43, color: "#1a2436", shade: "#0a0f1a", count: 6, y: 40, spread: 30, speed: 12, alpha: 0.9 });
    ridge(g, { y: HZ5 + 6, amp: 26, color: "#0a0f18", seed: 2, bottom: HZ5 + 40 });
    gardenSet(g, 15.5, "chase");
    // portal light on the lawn
    if (po > 0) { pool(g, sx, sy + 4, pr * 3.4, pr * 0.55, "#ffcf7a", 0.55 * po); }
    // the path of stepping stones, sliding toward us as we run
    for (let k = 0; k < 9; k++) {
      const z = 1.6 + ((k * 1.25 - t * 2.6) % 11.25 + 11.25) % 11.25;
      if (z > zStone - 0.3) continue;
      const [x, y, s] = proj(0.18 + Math.sin(k * 1.7) * 0.05, z);
      g.fillStyle = "#0a0d10";
      g.beginPath(); g.ellipse(x, y + 0.012 * s, 0.33 * s, 0.075 * s, 0, 0, K.TAU); g.fill();
      g.fillStyle = K.mix("#262b31", "#5a4a30", po * K.clamp(1.4 - (zStone - z) / 4));
      g.beginPath(); g.ellipse(x, y, 0.31 * s, 0.065 * s, 0, 0, K.TAU); g.fill();
      g.fillStyle = "rgba(220,230,250,0.16)";
      g.beginPath(); g.ellipse(x, y - 0.035 * s, 0.24 * s, 0.018 * s, 0, Math.PI, K.TAU); g.fill();
    }
    // the two old stones (opaque; only their rim catches the portal) and the ring between them
    const [ax, ay, as] = proj(-0.4, zStone), [bx, by, bs] = proj(1.5, zStone);
    if (po > 0) K.godRays(g, sx, pyc, W, H, { color: "#ffd99a", count: 14, strength: 0.22 * po, t, angle: Math.PI / 2, spread: K.TAU, length: 760, seed: 5 });
    rimStone(g, ax, ay, 0.62 * as, 1.6 * as, { seed: 3, color: "#14181e", rim: "#ffcf7a", rimA: 0.75 * po, dx: 0.05 * as, dy: 0 });
    rimStone(g, bx, by, 0.58 * bs, 1.45 * bs, { seed: 5, color: "#14181e", rim: "#ffcf7a", rimA: 0.75 * po, dx: -0.05 * bs, dy: 0 });
    if (po > 0) {
      ringPortal(g, sx, pyc, pr, t, { intensity: 1.15 * Math.min(1, po + 0.2), tilt: 0.12 });
      // pawprints spiralling into it on the ground
      const spts = [];
      for (let i = 0; i < 9; i++) {
        const a = i * 0.8 - t * 0.6, r = pr * (1.9 - i * 0.17);
        spts.push({ x: sx + Math.cos(a) * r, y: sy + 2 + Math.sin(a) * r * 0.16, a: a + Math.PI / 2, s: 0.06 * ss, alpha: po * K.clamp(1.1 - i / 10) });
      }
      K.pawprints(g, spts, 1);
    }
    // grass rows rushing past at the sides
    for (let k = 7; k >= 0; k--) {
      const z = 1.4 + ((k * 1.1 - t * 2.6) % 8.8 + 8.8) % 8.8;
      if (z > zStone) continue;
      const [, y, s] = proj(0, z);
      const hgt = 0.22 * s;
      const fade = K.clamp(1 - z / 9);
      K.grass(g, -60, 480 - 0.7 * s, y, { seed: 10 + k, color: K.mix("#0f1c13", "#1e3222", fade), height: hgt, t: t * 1.4, wind: 1.8, density: 0.32 });
      K.grass(g, 480 + 1.2 * s, W + 60, y, { seed: 20 + k, color: K.mix("#0f1c13", "#1e3222", fade), height: hgt, t: t * 1.4, wind: 1.8, density: 0.32 });
    }
    // Biscuit, racing ahead of you (~90 px), then the pounce: an arc up into the ring, his outline
    // black against its light
    if (t < 43.25) {
      const u = K.seg(t, 35, 42.5);
      const z = K.lerp(4.2, zStone - 0.45, K.ease.inOut(u));
      const [cx, cy, cs] = proj(K.lerp(0.25, -0.05, u), z);
      const leap = K.seg(t, 42.5, 43.2);
      const e = K.ease.inOut(leap);
      const size = 0.46 * cs * (1 - e * 0.45);
      const lx = K.lerp(cx, sx, e), ly = K.lerp(cy, pyc + size * 0.55, e) - Math.sin(leap * Math.PI) * cs * 0.18;
      const lightC = po > 0 ? { x: sx, y: pyc, color: "#ffcf7a", strength: 2 } : { x: 380, y: 300, color: "#fff3d0", strength: 1.2 };
      g.save();
      if (leap > 0) { g.translate(lx, ly - size * 0.6); g.rotate(-0.35 * Math.sin(leap * Math.PI)); g.translate(-lx, -(ly - size * 0.6)); }
      K.drawCat(g, lx, ly, size, {
        pose: leap > 0 ? "pounce" : "run", phase: leap > 0 ? 0.55 + leap * 0.45 : t * 2.6, facing: 1, headTurn: leap > 0 ? 0 : -0.9, t, wet: 0.7, bell: true,
        coat: dimCoat(0.4 + 0.25 * po, "#0a0c14"), light: lightC, alpha: 1 - K.seg(leap, 0.8, 1), shadow: leap < 0.3,
      });
      g.restore();
    }
    // rain: dim everywhere, bright in the torch cone, gold near the portal
    K.rain(g, W, H, t, { density: 1.1, angle: 0.18, color: RAIN, speed: 1000, len: 26, seed: 51 });
    const kx = 300 + Math.sin(t * 0.9) * 22, ky = 548 + bob;
    litRain(g, t, (q) => { q.moveTo(kx + 30, ky - 150); q.lineTo(sx - 40, sy - 160); q.lineTo(sx + 140, sy + 20); q.closePath(); }, { density: 1.1, angle: 0.18, color: "rgba(255,240,210,0.85)", speed: 1000, len: 26, seed: 51 });
    if (po > 0) litRain(g, t, (q) => q.arc(sx, pyc, pr * 2.8, 0, K.TAU), { density: 1.2, angle: 0.18, color: K.rgba("#ffd27a", 0.9 * po), speed: 1000, len: 26, seed: 51 });
    K.splashes(g, W, H, t, { y0: HZ5 + 30, y1: H, density: 1.1, color: "rgba(200,212,235,0.4)", seed: 12 });
    // you, from behind, running hard: smaller and off-centre so the portal reads
    K.drawPerson(g, kx, ky, 250, {
      view: "back", run: true, phase: t * 1.5, hood: true, flashlight: true, flashAngle: -0.5, flashLen: 300, wet: 0.55, t,
      light: po > 0 ? { x: sx, y: pyc, color: "#ffcf7a", strength: 1.3 * po } : { x: 900, y: 0, color: "#9fb4d4", strength: 0.4 },
    });
  });
  const f44 = K.env(t, 43.95, 45.2, 0.05, 1.1);
  if (f44 > 0) K.fadeColor(g, W, H, f44 * 0.9, "#ffe8b0");
  K.grade(g, W, H, { tint: "#26355a", alpha: 0.22, mode: "soft-light" });
}

// ---- shot 6: your hand in the mud, the bell -------------------------------------------------------------
function mudGround() {
  return K.sprite("f00-mud", W, H, (s) => {
    vgrad(s, 0, 0, W, H, [[0, "#1a2216"], [1, "#222a1a"]]);
    const R = K.rng("mud");
    for (let i = 0; i < 40; i++) {
      s.fillStyle = `rgba(${40 + R() * 20},${30 + R() * 16},${20 + R() * 10},0.35)`;
      s.beginPath(); s.ellipse(R() * W, R() * H, 30 + R() * 80, 10 + R() * 30, R() * 3, 0, K.TAU); s.fill();
    }
    for (let i = 0; i < 2600; i++) {
      const x = R() * W, y = R() * H, l = 6 + R() * 18, a = -Math.PI / 2 + (R() - 0.5) * 1.6;
      s.strokeStyle = R() > 0.5 ? "rgba(70,96,52,0.55)" : "rgba(28,40,24,0.7)";
      s.lineWidth = 1 + R() * 1.2;
      s.beginPath(); s.moveTo(x, y); s.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 2, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); s.stroke();
    }
    for (let i = 0; i < 400; i++) { s.fillStyle = "rgba(220,230,255,0.5)"; s.fillRect(R() * W, R() * H, 1.2, 1.2); }
  });
}
const PUD = { x: 512, y: 338, rx: 150, ry: 62 };
function puddlePath() {
  const p = new Path2D();
  const pts = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * K.TAU;
    const r = 1 + 0.16 * K.noise(i * 0.9, 4) + 0.08 * Math.sin(a * 3 + 1);
    pts.push(PUD.x + Math.cos(a) * PUD.rx * r, PUD.y + Math.sin(a) * PUD.ry * r);
  }
  K.spline(p, pts, true, 0.9);
  return p;
}
let PUDP = null;
function stoneFoot(g, x, y, rx, ry, seed, lit) {
  const p = new Path2D();
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * K.TAU, r = 1 + 0.12 * K.noise(i * 1.3, seed);
    pts.push(x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r);
  }
  K.spline(p, pts, true, 0.8);
  const gr = g.createRadialGradient(x, y + ry * 0.4, 0, x, y, rx * 1.1);
  gr.addColorStop(0, "#2a3036");
  gr.addColorStop(1, "#11151a");
  g.fillStyle = gr;
  g.fill(p);
  g.save();
  g.clip(p);
  const R = K.rng("foot" + seed);
  for (let i = 0; i < 160; i++) { g.fillStyle = R() > 0.5 ? "rgba(90,100,90,0.25)" : "rgba(0,0,0,0.3)"; g.fillRect(x + (R() - 0.5) * rx * 2, y + (R() - 0.5) * ry * 2, 3, 2); }
  g.strokeStyle = K.rgba("#fff3d0", 0.3 * lit);
  g.lineWidth = 6;
  g.translate(0, 3);
  g.stroke(p);
  g.restore();
}
const BELL = { x: 500, y: 318, size: 60 };
// the brass jingle bell close up, lying tilted in the mud: a polished sphere (sky above, dark mud
// below in its reflection), a raised seam round its equator, the sound slot seen edge-on and
// mostly turned away from us, the loop on top, and a hard torch specular.
function brassBell(g, x, y, size, rot, t, glint) {
  const r = size / 2;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  // the shank loop
  g.strokeStyle = "#6a4612";
  g.lineWidth = r * 0.16;
  g.beginPath(); g.ellipse(0, -r * 1.02, r * 0.2, r * 0.17, 0, Math.PI * 0.95, Math.PI * 2.05); g.stroke();
  const bg = g.createRadialGradient(-r * 0.38, -r * 0.42, r * 0.04, 0, 0, r);
  bg.addColorStop(0, "#fff0c4");
  bg.addColorStop(0.18, "#ecc263");
  bg.addColorStop(0.5, "#b8862e");
  bg.addColorStop(0.82, "#5e3c10");
  bg.addColorStop(1, "#2c1a06");
  g.fillStyle = bg;
  g.beginPath(); g.arc(0, 0, r, 0, K.TAU); g.fill();
  // environment: the dark wet ground mirrored in the lower half, a cold sky line above it
  g.save();
  g.beginPath(); g.arc(0, 0, r, 0, K.TAU); g.clip();
  const eg = g.createLinearGradient(0, -r * 0.1, 0, r);
  eg.addColorStop(0, "rgba(20,14,6,0)");
  eg.addColorStop(0.35, "rgba(20,14,6,0.45)");
  eg.addColorStop(1, "rgba(10,8,4,0.7)");
  g.fillStyle = eg;
  g.fillRect(-r, -r * 0.1, r * 2, r * 1.2);
  g.strokeStyle = "rgba(170,195,235,0.35)";
  g.lineWidth = r * 0.05;
  g.beginPath(); g.ellipse(0, r * 0.05, r * 0.98, r * 0.3, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  // raised equator seam: a bright upper lip and a dark under edge
  g.strokeStyle = "rgba(255,226,150,0.55)";
  g.lineWidth = r * 0.06;
  g.beginPath(); g.ellipse(0, r * 0.12, r * 1.0, r * 0.34, 0, 0.1, Math.PI - 0.1); g.stroke();
  g.strokeStyle = "rgba(40,24,6,0.7)";
  g.lineWidth = r * 0.05;
  g.beginPath(); g.ellipse(0, r * 0.18, r * 1.0, r * 0.34, 0, 0.12, Math.PI - 0.12); g.stroke();
  // the sound slot, edge-on and off to the lower right (no "face": one slit, one hole, foreshortened)
  g.fillStyle = "rgba(14,8,2,0.95)";
  g.beginPath(); g.ellipse(r * 0.42, r * 0.5, r * 0.36, r * 0.06, 0.55, 0, K.TAU); g.fill();
  g.beginPath(); g.ellipse(r * 0.7, r * 0.72, r * 0.09, r * 0.07, 0.5, 0, K.TAU); g.fill();
  g.restore();
  // rim shadow (it sits IN the mud)
  g.strokeStyle = "rgba(20,12,4,0.6)";
  g.lineWidth = r * 0.08;
  g.beginPath(); g.arc(0, 0, r * 0.97, 0.2, Math.PI - 0.2); g.stroke();
  g.restore();
  // hard specular from the torch + a soft secondary
  K.glow(g, x - r * 0.36, y - r * 0.4, r * 0.5, "#fff6dc", 0.7);
  g.fillStyle = "rgba(255,255,250,0.95)";
  g.beginPath(); g.ellipse(x - r * 0.36, y - r * 0.42, r * 0.11, r * 0.07, -0.6, 0, K.TAU); g.fill();
  if (glint > 0) K.bellGlint(g, x - r * 0.36, y - r * 0.42, r * 0.9, t, { strength: glint });
}
function shotMud(g, t, p) {
  // the torch sweeps in and settles its hot spot on the bell
  const sweep = K.ease.inOut(K.seg(t, 46, 47.6));
  const lx = K.lerp(250, BELL.x + 6, sweep) + Math.sin(t * 1.3) * 5 * (1 - sweep * 0.6), ly = K.lerp(440, BELL.y - 4, sweep) + Math.cos(t * 1.1) * 4 * (1 - sweep * 0.6);
  const reachU = K.ease.inOut(K.seg(t, 48.4, 52.0));
  const close = K.smooth(K.seg(t, 52.0, 53.6));
  const lift = K.ease.inOut(K.seg(t, 53.8, 55));
  const got = t > 53.4;
  const cam = { x: 480 + K.lerp(0, 16, p), y: 280, zoom: 1.04 + 0.05 * p, shakeT: t, shakeAmt: 1.2 };
  K.withCamera(g, W, H, cam, () => {
    g.drawImage(mudGround(), -20, -20, W + 40, H + 40);
    if (!PUDP) PUDP = puddlePath();
    g.save();
    g.strokeStyle = "rgba(30,22,14,0.8)";
    g.lineWidth = 16;
    g.stroke(PUDP);
    g.clip(PUDP);
    // the puddle mirrors the sky and the two standing stones above it (upside down)
    vgrad(g, PUD.x - PUD.rx * 1.3, PUD.y - PUD.ry * 1.3, PUD.rx * 2.6, PUD.ry * 2.6, [[0, "#1c2738"], [0.6, "#0d1420"], [1, "#05080d"]]);
    g.save();
    g.translate(0, PUD.y - PUD.ry * 0.9);
    g.scale(1, -0.55);
    rimStone(g, PUD.x - 170, 0, 160, 210, { seed: 3, color: "#0a0d12", rim: "#fff3d0", rimA: 0.18, dx: 6, dy: 0 });
    rimStone(g, PUD.x + 175, 0, 150, 200, { seed: 5, color: "#0a0d12", rim: "#fff3d0", rimA: 0.14, dx: -6, dy: 0 });
    g.restore();
    // the torch reflected: a hot smear on the water
    g.save();
    g.translate(lx + 26, ly + 36);
    g.scale(1, 0.4);
    K.glow(g, 0, 0, 80, "#fff3d0", 0.5);
    K.glow(g, 0, 0, 14, "#ffffff", 0.8);
    g.restore();
    // the bell's own reflection under it
    if (!got || lift < 0.2) {
      g.save();
      g.translate(0, (BELL.y + BELL.size * 0.5) * 2 + 2);
      g.scale(1, -1);
      g.globalAlpha = 0.4;
      brassBell(g, BELL.x, BELL.y, BELL.size, -0.35, t, 0);
      g.restore();
    }
    puddleRings(g, t, PUD.x, PUD.y, PUD.rx * 1.1, PUD.ry * 1.1, 14, 5);
    g.restore();
    g.save();
    g.strokeStyle = "rgba(220,230,255,0.18)";
    g.lineWidth = 1.2;
    g.translate(0, 1.5);
    g.stroke(PUDP);
    g.restore();
    // the snapped bit of red collar and his brass bell, half sunk at the water's edge
    if (!got) {
      g.save();
      g.lineCap = "round";
      g.strokeStyle = "#5d1418";
      g.lineWidth = 9;
      g.beginPath(); g.moveTo(BELL.x - 120, BELL.y + 34); g.quadraticCurveTo(BELL.x - 60, BELL.y - 4, BELL.x - 4, BELL.y - 22); g.stroke();
      g.strokeStyle = "#a82830";
      g.lineWidth = 5;
      g.beginPath(); g.moveTo(BELL.x - 120, BELL.y + 31); g.quadraticCurveTo(BELL.x - 60, BELL.y - 7, BELL.x - 4, BELL.y - 25); g.stroke();
      g.strokeStyle = "rgba(220,170,160,0.6)";
      g.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(BELL.x - 4, BELL.y - 24); g.lineTo(BELL.x + 4 + i * 2, BELL.y - 32 + i * 3); g.stroke(); }
      // contact shadow / mud lip, then the bell: a brass sphere with its slot and a hard specular
      g.fillStyle = "rgba(10,8,6,0.6)";
      g.beginPath(); g.ellipse(BELL.x + 4, BELL.y + BELL.size * 0.48, BELL.size * 0.55, BELL.size * 0.12, 0, 0, K.TAU); g.fill();
      brassBell(g, BELL.x, BELL.y, BELL.size, -0.35, t, 0.2 + 1.2 * K.env(t, 47.2, 49, 0.1, 1.2));
      // mud and water lapping over its lower edge
      g.fillStyle = "rgba(24,30,40,0.55)";
      g.beginPath(); g.ellipse(BELL.x + 2, BELL.y + BELL.size * 0.42, BELL.size * 0.62, BELL.size * 0.14, 0, 0, K.TAU); g.fill();
      g.restore();
    }
    // standing stones' feet at the top of frame
    stoneFoot(g, 140, 40, 210, 120, 3, 1);
    stoneFoot(g, 850, 30, 190, 110, 5, 1);
    // your hand comes in from the bottom left, fingers close around the bell, and lifts it
    if (t > 48.4) {
      const wx = K.lerp(-60, BELL.x - 150, reachU) + lift * 30, wy = K.lerp(720, BELL.y + 168, reachU) + lift * 150;
      const ang = -0.86 + close * 0.12 - lift * 0.25;
      K.drawHand(g, wx, wy, 210, {
        pose: close > 0.6 ? "hold" : reachU > 0.85 ? "cup" : "reach", angle: ang, left: true, t, wet: 0.6,
        light: { x: lx, y: ly, color: "#fff3d0", strength: 1.3 },
      });
      if (got) {
        // the bell, now in your fist: a glint between the fingers
        const hx = wx + Math.cos(ang) * 200, hy = wy + Math.sin(ang) * 200;
        K.glow(g, hx, hy, 34, "#ffd98a", 0.45 * (1 - lift * 0.7));
        K.bellGlint(g, hx - 6, hy + 4, 16, t, { strength: 0.9 * (1 - lift) });
      }
    }
  });
  // darkness outside the torch pool
  g.save();
  const dg = g.createRadialGradient(lx, ly, 40, lx, ly, 400);
  dg.addColorStop(0, "rgba(2,4,8,0)");
  dg.addColorStop(0.55, "rgba(2,4,8,0.5)");
  dg.addColorStop(1, "rgba(2,4,8,0.88)");
  g.fillStyle = dg;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "soft-light";
  K.glow(g, lx, ly, 240, "#fff0c8", 0.65);
  g.restore();
  K.glow(g, lx, ly, 60, "#fff3d0", 0.12);
  K.rain(g, W, H, t, { density: 0.8, angle: 0.1, color: "rgba(170,190,220,0.4)", speed: 800, len: 18, seed: 61 });
  K.splashes(g, W, H, t, { y0: 0, y1: H, density: 1.2, color: "rgba(200,212,235,0.4)", seed: 14 });
  K.grade(g, W, H, { tint: "#26355a", alpha: 0.2, mode: "soft-light" });
}

// ---- shot 7: alone between the stones, the light comes back --------------------------------------------
// The same garden as shot 5, seen across: the house far left with your window still lit, the back
// fence and the neighbours' trees behind, an oak on the right, the hedge line. The ring opens
// between the two out-of-focus foreground stones.
function shotStones(g, t, p) {
  const grow = K.smooth(K.seg(t, 56, 62));
  const spiral = K.smooth(K.seg(t, 55, 57.5));
  const PX = 500, PY = 318;
  const pr = K.lerp(10, 120, grow);
  const white = K.ease.in(K.seg(t, 60.5, 64));
  const cam = { x: 480, y: 280, zoom: 1.02 + 0.06 * K.ease.inOut(p), shakeT: t, shakeAmt: 1 + grow * 2.5 };
  const GY = 372;
  K.withCamera(g, W, H, cam, () => {
    vgrad(g, -60, -60, W + 120, 400, [[0, "#060b16"], [1, "#16223a"]]);
    K.clouds(g, W, H, t, { seed: 47, color: "#1a2436", shade: "#0a0f1a", count: 6, y: 60, spread: 40, speed: 9 + grow * 30, alpha: 0.9 });
    ridge(g, { y: 318, amp: 22, color: "#0a1019", seed: 11, bottom: 420 });
    treeSil(g, 640, 334, 0.5, t, { seed: 33, color: "#05080d", sway: 2 });
    treeSil(g, 900, 336, 0.6, t, { seed: 34, color: "#05080d", sway: 2 });
    // home, across the lawn, the bedroom window still lit
    nightHouse(g, 200, 344, 0.42, t, {});
    vgrad(g, -60, 338, W + 120, H, [[0, "#0d1610"], [1, "#132016"]]);
    K.fence(g, 250, W + 40, 346, 16, { night: true, color: K.mix("#1a1f28", "#6a5a40", grow * 0.6) });
    g.fillStyle = "#080d0a";
    for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(250 + i * 28, 350 - (i % 3) * 2, 12 + (i % 4) * 2, Math.PI, K.TAU); g.fill(); }
    tinted(g, "f00-oak7", (c) => K.tree(c, 820, 374, 0.95, { seed: 6, leaf: "#2a4a30", trunk: "#1a1a16", t, kind: "oak", sway: 1.6 }), "#05090a", 0.86);
    if (grow > 0) K.glow(g, 780, 250, 120, "#ffcf7a", 0.08 * grow);
    // the glow on the ground: a spiral of pawprints winding in toward the ring
    const spts = [];
    for (let i = 0; i < 14; i++) {
      const a = i * 0.72 - t * 0.5, r = 22 + i * 10;
      spts.push({ x: PX + Math.cos(a) * r * 1.7, y: GY + Math.sin(a) * r * 0.3, a: a + Math.PI / 2, s: 6 + i * 0.2, alpha: spiral * K.clamp(1.2 - i / 14) * (1 - white) });
    }
    pool(g, PX, GY, 120 + pr * 2, 22 + pr * 0.28, "#ffcf7a", 0.25 + 0.5 * grow);
    K.pawprints(g, spts, 1);
    if (grow > 0) {
      K.godRays(g, PX, PY, W, H, { color: "#ffd99a", count: 16, strength: 0.18 + 0.32 * grow, t, angle: Math.PI / 2, spread: K.TAU, length: 900, seed: 9 });
      ringPortal(g, PX, PY, pr, t, { intensity: 0.8 + grow * 0.6, tilt: 0.1 });
    }
    // wind pulls the rain and leaves toward the light; drops crossing it catch the gold
    K.leaves(g, W, H, t, { seed: 4, count: 18, wind: 0.8, toward: [PX, PY], pull: 0.35 + grow * 0.5 });
    const rA = 0.22 + grow * 0.35;
    litRain(g, t, (q) => q.rect(-60, -60, PX + 60, H + 120), { density: 1, angle: -rA, color: RAIN, speed: 950, len: 24, seed: 71 });
    litRain(g, t, (q) => q.rect(PX, -60, W, H + 120), { density: 1, angle: rA, color: RAIN, speed: 950, len: 24, seed: 72 });
    litRain(g, t, (q) => q.arc(PX, PY, 80 + pr * 2.2, 0, K.TAU), { density: 1.2, angle: -rA, color: K.rgba("#ffd27a", 0.45 + 0.5 * grow), speed: 950, len: 24, seed: 71 });
    // you: alone, in profile, facing the light, the torch hanging useless; a long shadow behind
    const kx = 286, ky = GY + 18;
    g.save();
    g.translate(kx, ky);
    g.scale(1, 0.1);
    g.fillStyle = `rgba(0,0,0,${0.3 + 0.4 * grow})`;
    g.beginPath(); g.ellipse(-110 - grow * 80, 0, 120 + grow * 90, 40, 0, 0, K.TAU); g.fill();
    g.restore();
    K.drawPerson(g, kx, ky, 196, {
      view: "side", facing: 1, hood: true, flashlight: true, flashAngle: 1.1, flashLen: 160, wet: 0.7, t,
      light: { x: PX, y: PY, color: "#ffcf7a", strength: 0.7 + grow * 1.2 },
    });
  });
  // the stones themselves frame the shot, close to the lens and out of focus
  K.focus(g, W, H, 7, (c) => {
    rimStone(c, -10, 620, 300, 700, { seed: 7, color: "#0c1014", rim: "#ffcf7a", rimA: 0.12 + 0.4 * grow, dx: -12, dy: 0 });
    rimStone(c, 990, 620, 290, 660, { seed: 8, color: "#0c1014", rim: "#ffcf7a", rimA: 0.15 + 0.45 * grow, dx: 12, dy: 0 });
  }, "f00-stones-fg");
  K.grade(g, W, H, { tint: "#26355a", alpha: 0.2 * (1 - grow), mode: "soft-light" });
  if (white > 0) K.fadeColor(g, W, H, white, "#fff6e6");
}

// ---- shot 8: white, then the Cat Plaza at dawn --------------------------------------------------------
function shotPlaza(g, t, p) {
  const blur = K.lerp(9, 0, K.smooth(K.seg(t, 68.4, 69.8)));
  // framed lower than before so the title has clear sky above the statue's head
  const cam = { x: 480, y: K.lerp(222, 206, p), zoom: 1.02 - 0.04 * K.ease.out(p), shakeT: t, shakeAmt: 0.6 };
  K.focus(g, W, H, blur, (c) => K.withCamera(c, W, H, cam, () => plaza(c, t)), "f00-plaza");
  K.grade(g, W, H, { tint: "#ffd6e6", alpha: 0.18, mode: "soft-light" });
  const w = 1 - K.smooth(K.seg(t, 64, 68));
  if (w > 0) K.fadeColor(g, W, H, w, "#fff6e6");
  const ta = K.smooth(K.seg(t, 69.5, 70.7));
  if (ta > 0) {
    const ty = 104;
    const band = g.createLinearGradient(0, ty - 60, 0, ty + 60);
    band.addColorStop(0, "rgba(20,10,24,0)");
    band.addColorStop(0.5, `rgba(20,10,24,${0.2 * ta})`);
    band.addColorStop(1, "rgba(20,10,24,0)");
    g.fillStyle = band;
    g.fillRect(0, ty - 60, W, 120);
    K.title(g, W, H, "Find him.", "", ta, { y: ty, size: 74, glow: "#3a1a10", color: "#fff6e6" });
  }
}

const SHOTS = [
  { a: 0, b: 9, draw: shotHouse },
  { a: 9, b: 19, draw: shotWindow },
  { a: 19, b: 27, draw: shotGarden },
  { a: 27, b: 35, draw: shotFlap },
  { a: 35, b: 46, draw: shotChase },
  { a: 46, b: 55, draw: shotMud },
  { a: 55, b: 64, draw: shotStones },
  { a: 64, b: 72, draw: shotPlaza },
];

function post(g, t) {
  const plazaShot = t >= 64;
  K.bloom(g, plazaShot ? 0.25 : 0.35);
  K.vignette(g, W, H, plazaShot ? 0.45 : 0.62);
  K.grain(g, W, H, t, plazaShot ? 0.045 : 0.065);
  K.letterbox(g, W, H, 1);
  K.fadeBlack(g, W, H, 1 - K.smooth(K.seg(t, 0, 1.2)));
}

export const film = {
  id: 0,
  title: "The Night He Left",
  chapter: "Prologue",
  unlockAt: 0,
  duration: 72,
  poster: 14,
  tagline: "One stormy night, Biscuit followed a light. You followed Biscuit.",
  subs: [
    [4.0, 7.5, "It had been raining all night."],
    [10.0, 13.5, "Biscuit would not leave the window."],
    [14.5, 18.5, "Something out there was calling him."],
    [21.5, 25.5, "Pawprints. Glowing in the dark."],
    [29.0, 33.5, "Then the cat flap clicked."],
    [36.0, 39.0, "You grabbed the flashlight and ran."],
    [44.5, 46.5, "And he was gone."],
    [48.5, 53.5, "All that was left was his little bell."],
    [57.0, 61.5, "Then the stones began to glow again."],
    [65.0, 68.5, "And the light pulled you through."],
  ],
  voice: [
    [4.0, "It had been raining all night.", { rate: 0.92, pitch: 1.0 }],
    [10.0, "Biscuit would not leave the window.", { rate: 0.92, pitch: 1.0 }],
    [14.5, "Something out there was calling him.", { rate: 0.92, pitch: 1.0 }],
    [21.5, "Pawprints. Glowing in the dark.", { rate: 0.92, pitch: 1.0 }],
    [29.0, "Then the cat flap clicked.", { rate: 0.92, pitch: 1.0 }],
    [36.0, "You grabbed the flashlight and ran.", { rate: 0.92, pitch: 1.0 }],
    [44.5, "And he was gone.", { rate: 0.85, pitch: 0.95 }],
    [48.5, "All that was left was his little bell.", { rate: 0.85, pitch: 0.95 }],
    [57.0, "Then the stones began to glow again.", { rate: 0.92, pitch: 1.0 }],
    [65.0, "And the light pulled you through.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: {
    mood: "storm", key: "D", bpm: 64,
    cues: [[2, "thunder"], [12, "meow"], [21, "thunder"], [31, "swell"], [39, "hit"], [44, "drop"], [47, "bell"], [56, "swell"], [63, "hit"], [68, "drop"]],
  },
  draw(g, t, W2, H2) {
    runFilm(g, t, W2, H2, SHOTS, post);
  },
};
