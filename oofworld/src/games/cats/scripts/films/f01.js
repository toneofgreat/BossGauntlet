// films/f01.js - Chapter 1: "The Plaza of Lost Cats" (FILMS.md f01). 60 s, hopeful dawn.
// You wake in the Cat Plaza at sunrise among lost cats, tie Biscuit's bell to your wrist, notice the
// orange stone statue gazing toward the Cozy Meadow portal, and follow his still-warm pawprints
// through the dew - past a very round cat who is, sadly, not him.
// draw(g, t, W, H) is a pure function of t; static art is cached by the kit.
import * as K from "../filmkit.js";
import {
  runFilm, pool, vgrad, ridge, ridgeY, plaza, windmill, barn, rainbowArch, statueHeadSprite,
  dew, butterflies, portalArch, texturedRidge, cachedCat, q, blades, W0 as W, H0 as H,
} from "./lib012.js";

// ---- shot 1: crane down through the clouds onto the plaza ------------------------------------------------
// A sunlit cumulus, painted once: overlapping puffs, lit warm on top, cool lilac underneath, with
// crisp (not airbrushed) edges so the clouds read in focus once the lens settles.
function cumulus(seed, w, h) {
  return K.sprite("f01-cumulus:" + seed, w, h, (s) => {
    const R = K.rng("cu" + seed);
    const puffs = [];
    const n = 26;
    for (let i = 0; i < n; i++) {
      const u = R();
      const x = w * (0.12 + u * 0.76), base = h * 0.78;
      const hump = Math.sin(u * Math.PI);
      const r = h * (0.1 + 0.2 * hump * (0.6 + R() * 0.5));
      puffs.push([x, base - r * (0.4 + R() * 0.9) * (0.6 + hump), r]);
    }
    puffs.sort((a, b) => a[1] - b[1]);
    // flat-ish shaded base
    const bg = s.createLinearGradient(0, h * 0.45, 0, h * 0.85);
    bg.addColorStop(0, "#e9b8c4");
    bg.addColorStop(1, "#b48aa6");
    s.fillStyle = bg;
    s.beginPath(); s.ellipse(w / 2, h * 0.76, w * 0.4, h * 0.09, 0, 0, K.TAU); s.fill();
    for (const pass of [0, 1, 2]) {
      for (const [x, y, r] of puffs) {
        const rr = r * (pass === 0 ? 1.0 : pass === 1 ? 0.86 : 0.55);
        const ox = pass === 2 ? -r * 0.28 : pass === 1 ? -r * 0.12 : 0, oy = pass === 2 ? -r * 0.32 : pass === 1 ? -r * 0.12 : 0;
        const gr = s.createRadialGradient(x + ox - rr * 0.2, y + oy - rr * 0.3, rr * 0.1, x + ox, y + oy, rr);
        const c = pass === 0 ? "#c99ab4" : pass === 1 ? "#ffd9d0" : "#fff6ee";
        gr.addColorStop(0, c);
        gr.addColorStop(0.86, K.rgba(c, pass === 0 ? 1 : 0.9));
        gr.addColorStop(1, K.rgba(c, 0));
        s.fillStyle = gr;
        s.beginPath(); s.arc(x + ox, y + oy, rr, 0, K.TAU); s.fill();
      }
    }
  });
}
const CLOUD_LAYERS = [
  // [parallax, base screen y at d=0, scale, seeds]
  [0.55, 120, 0.8, [1, 2, 3]],
  [1.0, 300, 1.15, [4, 5]],
  [1.7, 560, 1.9, [6, 7]],
];
function shotCrane(g, t, p) {
  const e = K.ease.inOut(K.seg(t, 0, 8.6));
  const d = e * 1300; // how far the crane has come down, in pixels of the plaza layer
  const focusU = K.smooth(K.seg(t, 0.4, 3));
  // final framing: a high angle looking DOWN at the fountain (not f00's eye-level view of the plaza)
  const cam = { x: 455, y: 362, zoom: 1.2, shakeT: t, shakeAmt: 0.5 };
  // sky: deep morning blue above the cloud deck into the plaza's pink dawn
  vgrad(g, 0, 0, W, H, [[0, K.mix("#2c5aa8", "#5fa8f0", e)], [0.6, K.mix("#6a9ee0", "#a9d4fb", e)], [1, K.mix("#f2c4cc", "#ffe4ec", e)]]);
  K.sunGlow(g, 170, K.lerp(80, 150, e), 30, "#ffe0b0", 0.7);
  // the plaza rising from below
  g.save();
  g.translate(0, 1300 - d);
  K.withCamera(g, W, H, cam, () => plaza(g, t, { rays: true }));
  g.restore();
  // cloud layers, passing upward at their own parallax; out of focus until the lens settles at t=3
  K.focus(g, W, H, K.lerp(6, 0, focusU), (c) => {
    for (const [par, by, sc, seeds] of CLOUD_LAYERS) {
      seeds.forEach((sd, i) => {
        const cw = 520 * sc, ch = 260 * sc;
        const x = ((i * 0.53 + sd * 0.17) % 1) * (W + cw * 0.4) - cw * 0.45 + Math.sin(t * 0.1 + sd) * 12 + t * 3 * (i % 2 ? 1 : -1);
        const y = by - d * par * 0.62 - 220 * (sc - 0.8) + i * 70 * sc;
        if (y > H + 40 || y + ch < -40) return;
        c.drawImage(cumulus(sd, 520, 260), x, y, cw, ch);
      });
    }
  }, "f01-crane-clouds");
  K.godRays(g, 170, K.lerp(80, 150, e), W, H, { color: "#ffe0b8", count: 9, strength: 0.16, t, angle: 0.7, spread: 1.1, length: 1300, seed: 4 });
  K.grade(g, W, H, { tint: "#ffd6e6", alpha: 0.16, mode: "soft-light" });
  const ta = K.env(t, 1.8, 6.2, 1.0, 1.2);
  if (ta > 0) {
    const ty = H * 0.42;
    const band = g.createLinearGradient(0, ty - 90, 0, ty + 70);
    band.addColorStop(0, "rgba(40,20,40,0)");
    band.addColorStop(0.5, `rgba(40,20,40,${0.3 * ta})`);
    band.addColorStop(1, "rgba(40,20,40,0)");
    g.fillStyle = band;
    g.fillRect(0, ty - 90, W, 160);
    K.title(g, W, H, "The Plaza of Lost Cats", "Chapter 1", ta, { y: ty, size: 54, glow: "#1a0c14", color: "#fff6e6" });
  }
}

// ---- shot 2: over your shoulder - the cats on the fountain rim -----------------------------------------
const RIM = (a) => [480 + 238 * Math.cos(a), 424 + 47 * Math.sin(a)];
const SUNL = { x: 60, y: 250, color: "#ffd9a8", strength: 1.8 };
function rimShadow(g, x, y, w) {
  // the low sun at the left throws each cat's shadow long across the rim to the right
  g.save();
  g.translate(x, y);
  g.transform(1, 0, -0.9, 0.22, 0, 0);
  const gr = g.createRadialGradient(w * 0.2, -w * 0.4, 0, w * 0.2, -w * 0.4, w * 1.2);
  gr.addColorStop(0, "rgba(70,50,90,0.4)");
  gr.addColorStop(1, "rgba(70,50,90,0)");
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(w * 0.2, -w * 0.4, w * 0.6, w * 1.2, 0, 0, K.TAU); g.fill();
  g.restore();
}
function rimCats(g, t) {
  const [gx, gy] = RIM(2.62);
  // grey tabby, washing: head down and turned, a slow rhythmic lick
  const lick = q(0.45 + 0.12 * Math.sin(t * 5.5), 0.04);
  rimShadow(g, gx, gy, 40);
  cachedCat(g, gx, gy, 40, { pose: "sit", facing: 1, coat: K.COATS.grey, headTurn: 0.55, headTilt: lick, blink: 0.7, light: SUNL, collar: false, bell: false, tail: 0.45, ground: "#3a2a40" }, "grey" + lick);
  const [cx, cy] = RIM(1.95);
  const cb = K.env(t, 13, 13.4, 0.1, 0.1) > 0.5 ? 1 : 0.5;
  rimShadow(g, cx, cy, 44);
  cachedCat(g, cx, cy, 38, { pose: "loaf", facing: -1, coat: K.COATS.calico, headTurn: 0.4, blink: cb, light: SUNL, collar: false, bell: false, ground: "#3a2a40" }, "calico" + cb);
  const [bx, by] = RIM(0.5);
  // black cat: a big, slow yawn that peaks around 13 s (head up, jaw wide, eyes squeezed shut)
  const yawn = q(K.env(t, 11.6, 14.0, 0.8, 0.8), 0.1);
  rimShadow(g, bx, by, 42);
  cachedCat(g, bx, by, 42, { pose: "sit", facing: -1, coat: K.COATS.black, headTurn: 0.7, headTilt: 0.45 * yawn, mouth: yawn, blink: 0.15 + 0.85 * yawn, ears: -0.35 * yawn, light: SUNL, collar: false, bell: false, ground: "#3a2a40" }, "black" + yawn);
  const [sx, sy] = RIM(0.95);
  rimShadow(g, sx, sy, 38);
  cachedCat(g, sx, sy, 36, { pose: "sit", facing: 1, coat: K.COATS.siamese, headTurn: 0.75, light: SUNL, collar: false, bell: false, tail: 0.6, ground: "#3a2a40" }, "siamese");
}
function shotShoulder(g, t, p) {
  const cam = { x: K.lerp(470, 490, p), y: K.lerp(310, 318, p), zoom: 1.26 + 0.04 * p, shakeT: t, shakeAmt: 0.8 };
  K.withCamera(g, W, H, cam, () => {
    plaza(g, t, { mist: false });
    rimCats(g, t);
    K.fog(g, W, H, { y: 400, h: 90, color: "#fff4f6", alpha: 0.24, t, seed: 11 });
    K.godRays(g, 140, 230, W, H, { color: "#ffe6c0", count: 7, strength: 0.18, t, angle: 0.25, spread: 0.6, length: 900, seed: 7 });
    K.dust(g, W, H, t, { seed: 5, color: "#fff2d6", count: 30, area: [200, 250, 600, 220], alpha: 0.5 });
  });
  // you, close in the foreground (soft), the sun rimming your hair
  K.focus(g, W, H, 2.5, (c) => K.drawPerson(c, 205, 690, 520, { view: "back", hood: false, wet: 0.35, t, light: { x: 0, y: 180, color: "#ffe2b8", strength: 1.4 } }), "f01-kid-fg");
  K.grade(g, W, H, { tint: "#ffd6e6", alpha: 0.14, mode: "soft-light" });
}

// ---- shot 3: insert - the bell on your wrist --------------------------------------------------------------
function shotWrist(g, t, p) {
  K.focus(g, W, H, 8, (c) => K.withCamera(c, W, H, { x: 520, y: 330, zoom: 1.7 }, () => plaza(c, t, { rays: false })), "f01-wristbg");
  K.glow(g, 160, 120, 380, "#ffe6c0", 0.35);
  const lift = K.ease.out(K.seg(t, 17, 18));
  const drift = Math.sin(t * 0.9) * 4;
  // the back of your LEFT hand, wrist turned a little toward us; the bell hangs from the band
  const wx = 470 + drift, wy = K.lerp(520, 286, lift) + Math.cos(t * 1.1) * 3;
  const ang = -1.72 + 0.05 * Math.sin(t * 0.7);
  const u = 210 / 100;
  const ca = Math.cos(ang + Math.PI / 2), sa = Math.sin(ang + Math.PI / 2);
  // local (hand space, units of size/100, +y toward the elbow) -> screen; left hand = mirrored x
  const loc = (lx, ly) => [wx + (-lx * ca - ly * sa) * u, wy + (-lx * sa + ly * ca) * u];
  const band = (a0, a1, front) => {
    // the string round the wrist: an ellipse (a cylinder seen from slightly above); the back half
    // is drawn before the hand, the front half after it
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const a = K.lerp(a0, a1, i / 12);
      pts.push(loc(Math.cos(a) * 22.5, 6 + Math.sin(a) * 4.2));
    }
    for (const [lw, c] of front ? [[5.2, "#6a161a"], [3.0, "#c8343a"], [1.0, "rgba(255,190,180,0.6)"]] : [[4.4, "#5a1216"], [2.2, "#8e2228"]]) {
      g.strokeStyle = c;
      g.lineWidth = lw;
      g.lineCap = "round";
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
  };
  band(Math.PI, K.TAU, false);
  K.drawHand(g, wx, wy, 210, { pose: "open", angle: ang, left: true, t, light: { x: 120, y: 120, color: "#ffe6c0", strength: 1.3 } });
  band(0, Math.PI, true);
  // the knot and the short tail of string holding the bell
  const [kx, ky] = loc(4, 10.2);
  g.fillStyle = "#8e2228";
  g.beginPath(); g.arc(kx, ky, 4, 0, K.TAU); g.fill();
  const swing = t < 18 ? 0.05 * Math.sin(t * 2) : 0.55 * Math.sin((t - 18) * 7) * Math.exp(-(t - 18) * 0.9);
  const len = 30;
  const bx = kx + Math.sin(swing) * len, by = ky + Math.cos(swing) * len + 20;
  g.strokeStyle = "#a8322e";
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(kx, ky + 3); g.lineTo(bx, by - 20); g.stroke();
  const ring = t >= 18 ? Math.exp(-(t - 18) * 1.6) : 0;
  K.drawBell(g, bx, by, 40, { t, glint: 0.5 + ring * 1.2 });
  K.bellGlint(g, bx - 7, by - 8, 20 + ring * 22, t, { strength: 0.5 + ring * 1.4 });
  if (ring > 0.02) {
    g.save();
    g.strokeStyle = K.rgba("#fff2c0", 0.35 * ring);
    g.lineWidth = 1.2;
    for (let k = 0; k < 3; k++) {
      const r = 26 + ((t - 18) * 60 + k * 22) % 70;
      g.globalAlpha = K.clamp(1 - r / 96);
      g.beginPath(); g.arc(bx, by, r, -0.9, 0.9); g.stroke();
      g.beginPath(); g.arc(bx, by, r, Math.PI - 0.9, Math.PI + 0.9); g.stroke();
    }
    g.restore();
  }
  K.dust(g, W, H, t, { seed: 9, color: "#fff2d6", count: 26, alpha: 0.6, size: 2.2 });
  K.grade(g, W, H, { tint: "#ffd6c8", alpha: 0.16, mode: "soft-light" });
}

// ---- shot 4: slow pan across the stone statue's face ----------------------------------------------------
// A dedicated carved head (not the fur painter): he gazes to the LEFT, toward the green Cozy
// Meadow arch on the left of frame.
function shotStatue(g, t, p) {
  const e = K.ease.inOut(p);
  vgrad(g, 0, 0, W, H, [[0, "#7ab8f2"], [0.7, "#ffe2ea"], [1, "#ffeede"]]);
  K.focus(g, W, H, 6, (c) => {
    K.clouds(c, W, H, t, { seed: 22, color: "#fff0f4", shade: "#e0b8cc", count: 5, y: 120, spread: 60, speed: 4, alpha: 0.85 });
    portalArch(c, K.lerp(200, 150, e), 610, 420, "#78d25a", t, { haze: "#f2e2f2", hazeAmt: 0.22, glow: 1 });
  }, "f01-statue-bg");
  K.sunGlow(g, 70, 50, 30, "#ffe8c0", 0.55);
  // the head, panning slowly right-to-left across the carved face (he stays on the right third)
  const sc = 0.82 + 0.05 * e;
  const hx = K.lerp(300, 230, e), hy = K.lerp(-20, 0, e);
  g.drawImage(statueHeadSprite(), hx, hy, 900 * sc, 900 * sc);
  // the green of the meadow portal kisses the shadow-side of his cheek
  K.glow(g, hx + 140 * sc, hy + 520 * sc, 200, "#78d25a", 0.08);
  K.godRays(g, 40, 30, W, H, { color: "#ffe6c0", count: 8, strength: 0.15, t, angle: 0.75, spread: 0.7, length: 1200, seed: 11 });
  K.dust(g, W, H, t, { seed: 13, color: "#fff2d6", count: 50, alpha: 0.75, size: 1.8 });
  K.grade(g, W, H, { tint: "#ffd6c8", alpha: 0.15, mode: "soft-light" });
}

// ---- Cozy Meadow pieces ---------------------------------------------------------------------------------------
const MSKY = "#d4e6f0";
// a round broadleaf tree with atmospheric haze (K.tree's oak, colours pushed toward the sky)
function broadleaf(g, x, y, scale, t, seed, haze) {
  K.tree(g, x, y, scale, { seed, kind: "oak", leaf: K.mix("#3f7a34", MSKY, haze), trunk: K.mix("#4a3626", MSKY, haze), t, sway: 0.8 });
}
// rolling hills in four layers, each bluer and paler with distance; the rainbow welcome arch is a
// big wooden structure standing on the middle hill
const HL = [
  { y: 262, amp: 30, seed: 5, freq: 0.6, color: K.mix("#7aa08a", MSKY, 0.62) },
  { y: 292, amp: 38, seed: 7, freq: 0.75, color: K.mix("#6a9a5a", MSKY, 0.42) },
  { y: 330, amp: 44, seed: 9, freq: 0.9, color: K.mix("#5f9a48", MSKY, 0.22) },
];
function meadowBack(g, t, o = {}) {
  vgrad(g, -80, -80, W + 160, 420, [[0, "#5ea6ec"], [0.5, "#9fd0f8"], [0.85, "#e9eef0"], [1, MSKY]]);
  K.sunGlow(g, 170, 110, 26, "#fff2d6", 0.85);
  K.clouds(g, W, H, t, { seed: 31, color: "#ffffff", shade: "#b8c8e4", count: 6, y: 80, spread: 50, speed: 5, alpha: 0.9 });
  HL.forEach((h, i) => {
    ridge(g, Object.assign({ bottom: H + 60, top: K.shade(h.color, 0.06), base: K.mix(h.color, MSKY, 0.15), mid: 0.5 }, h));
    if (i === 0) {
      for (let k = 0; k < 7; k++) { const x = 60 + k * 140 + K.hash(k, 5) * 50; broadleaf(g, x, ridgeY(x, h) + 4, 0.07 + K.hash(k, 6) * 0.04, t, 20 + k, 0.7); }
      if (o.windmill !== false) windmill(g, o.millX || 720, ridgeY(o.millX || 720, h) + 4, o.millS || 0.42, t, { haze: MSKY, hazeAmt: 0.55, lightLeft: true, speed: 0.5 });
    }
    if (i === 1) {
      for (let k = 0; k < 5; k++) { const x = 30 + k * 210 + K.hash(k, 7) * 60; broadleaf(g, x, ridgeY(x, h) + 6, 0.13 + K.hash(k, 8) * 0.06, t, 30 + k, 0.45); }
      barn(g, 250, ridgeY(250, h) + 8, 0.36, { haze: MSKY, hazeAmt: 0.4, sunLeft: true });
    }
    // soft haze between layers (no hard band: wide, low alpha)
    K.fog(g, W, H, { y: h.y + 6, h: 60, color: MSKY, alpha: 0.32 - i * 0.07, t, seed: 3 + i, wisps: false });
    if (i === 2) {
      if (o.arch !== false) {
        const ax = o.archX || 560;
        rainbowArch(g, ax, ridgeY(ax, h) + 30, o.archR || 92, { haze: MSKY, hazeAmt: 0.2 });
        pool(g, ax, ridgeY(ax, h) + 30, (o.archR || 92) * 1.1, 8, "#ffffff", 0.12);
      }
      broadleaf(g, 120, ridgeY(120, h) + 10, 0.36, t, 41, 0.18);
      broadleaf(g, 880, ridgeY(880, h) + 10, 0.42, t, 42, 0.18);
    }
  });
}
const NEAR = { y: 404, amp: 46, seed: 3, freq: 0.6 };

// ---- shot 5: low dolly through the dew; his pawprints -------------------------------------------------------
function shotDew(g, t, p) {
  const e = K.ease.inOut(p);
  const cam = { x: 480, y: K.lerp(292, 280, e), zoom: 1.0 + 0.1 * e, shakeT: t, shakeAmt: 0.8 };
  K.withCamera(g, W, H, cam, () => {
    meadowBack(g, t, { archX: 590, archR: 96 });
    texturedRidge(g, Object.assign({ bottom: H + 60 }, NEAR), "near", { base: "#5aa040", light: "#9ad46a", dark: "#2f6a24" });
    const nearY = ridgeY(480, NEAR);
    K.grass(g, -60, W + 60, nearY + 14, { seed: 3, color: "#74bc52", height: 10, t, wind: 0.6, density: 0.5 });
    // the amber prints: a clear line of nine, smaller and closer together as they climb the slope
    const pts = [];
    for (let i = 0; i < 9; i++) {
      const u = i / 8;
      const depth = 1 + u * 7; // 1 = at our feet, 8 = up the hill
      const x = 470 + (100 / depth) * (i % 2 ? 1 : -1) * 0.5 + 70 * Math.sin(u * 2.2);
      const y = nearY + 4 + (H + 40 - nearY) / depth - 24;
      pts.push({ x, y, a: -0.2 + Math.cos(u * 2.2) * 0.25, s: 22 / depth + 2, flat: 0.32, alpha: (0.8 + 0.2 * Math.sin(t * 2 + i)) * K.smooth(K.seg(t, 35.5 + (8 - i) * 0.18, 36.6 + (8 - i) * 0.18)) });
    }
    K.pawprints(g, pts, 1.3);
    for (const qq of pts) pool(g, qq.x, qq.y, qq.s * 2.8, qq.s * 0.8, "#ffb347", 0.3 * qq.alpha);
    K.grass(g, -60, W + 60, 470, { seed: 4, color: "#5aa83e", height: 22, t, wind: 0.7, density: 0.6, light: "#b4e488" });
    dew(g, t, -40, W + 40, nearY + 10, 560, { seed: 7, count: 200 });
  });
  // the foreground blades close to the lens, sliding ~120 px as we push in; dew twinkling on them
  K.focus(g, W, H, 4, (c) => {
    const sl = e * 120;
    blades(c, -120 - sl, 300 - sl, H + 10, { seed: 11, color: "#2f6a24", light: "#9ad46a", height: 210, t, wind: 0.6, density: 0.9 });
    blades(c, 680 + sl, W + 120 + sl, H + 10, { seed: 12, color: "#2f6a24", light: "#9ad46a", height: 230, t, wind: 0.6, density: 0.9 });
  }, "f01-dew-fg");
  dew(g, t, -40 - e * 120, 300 - e * 120, 360, 530, { seed: 9, count: 30 });
  dew(g, t, 680 + e * 120, 1000 + e * 120, 360, 530, { seed: 10, count: 30 });
  K.godRays(g, 170, 110, W, H, { color: "#fff0d0", count: 8, strength: 0.15, t, angle: 0.9, spread: 0.8, length: 900, seed: 3 });
  K.grade(g, W, H, { tint: "#ffe6c0", alpha: 0.16, mode: "soft-light" });
}

// ---- shot 6: the round cat on the hill ----------------------------------------------------------------------
// A very round cream cat in a loaf, 1.6 : 1 (body squashed, head drawn at its true shape on top).
// He shows us the back of his head, turns to face us (not Biscuit), and slow-blinks.
const LOAF = { cx: 0.69, cy: -0.78, rx: 0.5, ry: 0.56 };
function roundCat(g, x, y, size, o, key) {
  // cached per (quantised) head turn / blink: the composite costs two full cat paints
  const w = Math.ceil(size * 4.4), h = Math.ceil(size * 3.0), ax = w * 0.5, ay = h * 0.84;
  const spr = K.sprite("f01-round:" + key, w, h, (s) => {
    const oo = Object.assign({}, o, { t: 0 });
    if (oo.light) oo.light = Object.assign({}, oo.light, { x: oo.light.x - x + ax, y: oo.light.y - y + ay });
    roundCatPaint(s, ax, ay, size, oo);
  });
  g.drawImage(spr, x - ax, y - ay, w, h);
}
function roundCatPaint(g, x, y, size, o) {
  const k = 0.6;
  const base = Object.assign({ pose: "loaf", facing: 1, coat: K.COATS.cream, collar: false, bell: false, tail: 0.25 }, o);
  // body
  const hx = x + LOAF.cx * size * k, hy = y + LOAF.cy * size * 1.08;
  // body: everything except the (squashed) head, which is cut away so its ears never peek out
  g.save();
  const cut = new Path2D();
  cut.rect(x - size * 3, y - size * 3, size * 6, size * 4);
  cut.ellipse(hx, hy - size * 0.25, size * 0.5, size * 0.8, 0, 0, K.TAU);
  g.clip(cut, "evenodd");
  g.translate(x, y);
  g.scale(k, 1.08);
  K.drawCat(g, 0, 0, size, Object.assign({}, base, { headTurn: 0.2 }));
  g.restore();
  // head, at its own proportions, sunk into the round shoulders
  g.save();
  g.beginPath();
  g.ellipse(hx, hy - size * 0.25, size * 0.5, size * 0.8, 0, 0, K.TAU);
  g.clip();
  K.drawCat(g, hx - LOAF.cx * size, hy - LOAF.cy * size, size, Object.assign({}, base, { shadow: false }));
  g.restore();
}
function shotLoaf(g, t, p) {
  const cam = { x: 515, y: 330, zoom: 1.55 + 0.1 * K.ease.inOut(p), shakeT: t, shakeAmt: 0.6 };
  // back of the head (47) -> facing the camera (49.5-50.5) -> a slow blink -> settles, eyes shut, sunbathing
  const turn = K.smooth(K.seg(t, 47.8, 49.4)) - K.smooth(K.seg(t, 50.8, 51.6)) * 0.5;
  const look = K.lerp(-0.95, 1, turn);
  const slowBlink = K.env(t, 49.9, 50.9, 0.4, 0.45);
  const sunBathe = K.smooth(K.seg(t, 51.0, 51.6));
  const SUNP = [770, 205];
  const hill = { y: 392, amp: 18, seed: 21, freq: 0.5, bump: (x) => 34 * Math.exp(-Math.pow((x - 520) / 240, 2)), bumpMax: 34 };
  K.withCamera(g, W, H, cam, () => {
    vgrad(g, -60, -60, W + 120, 460, [[0, "#5ea6ec"], [0.55, "#a8d6fa"], [1, "#eef0ea"]]);
    K.clouds(g, W, H, t, { seed: 37, color: "#ffffff", shade: "#c0cee8", count: 5, y: 110, spread: 50, speed: 5, alpha: 0.85 });
    K.sunGlow(g, SUNP[0], SUNP[1], 26, "#fff2d6", 0.7);
    // the valley beyond the hilltop: distant blue hills, a paler range behind them, a line of trees
    ridge(g, { y: 318, amp: 30, seed: 8, freq: 0.6, color: K.mix("#7a9a9a", MSKY, 0.6), bottom: H + 40 });
    for (let k = 0; k < 6; k++) { const x = 180 + k * 120 + K.hash(k, 12) * 40; broadleaf(g, x, ridgeY(x, { y: 338, amp: 22, seed: 10, freq: 0.8 }) + 6, 0.05 + K.hash(k, 13) * 0.02, t, 50 + k, 0.55); }
    ridge(g, { y: 338, amp: 22, seed: 10, freq: 0.8, color: K.mix("#6a9a6a", MSKY, 0.45), bottom: H + 40 });
    K.fog(g, W, H, { y: 350, h: 50, color: MSKY, alpha: 0.35, t, seed: 3, wisps: false });
    texturedRidge(g, Object.assign({ bottom: H + 80, rim: "#fff2c8", rimA: 0.22, rimW: 1.5 }, hill), "hill", { base: "#5c9e42", light: "#a6dc78", dark: "#3c7a2c" });
    const cy = ridgeY(520, hill) + 6;
    const lk = q(look, 0.1), bl = q(Math.max(slowBlink, sunBathe * 0.95), 0.1);
    roundCat(g, 505, cy, 66, {
      headTurn: lk, blink: bl,
      light: { x: SUNP[0], y: SUNP[1], color: "#fff0c8", strength: 1.7 },
    }, lk + ":" + bl);
    K.grass(g, 300, 740, cy + 6, { seed: 7, color: "#7cbc58", light: "#d8f0a0", height: 12, t, wind: 0.8, density: 0.6 });
    K.grass(g, -60, W + 60, ridgeY(520, hill) + 70, { seed: 8, color: "#5aa040", light: "#c8ec90", height: 26, t, wind: 0.9, density: 0.5 });
    butterflies(g, t, { seed: 4, count: 3, area: [300, 280, 460, 110] });
  });
  K.focus(g, W, H, 3, (c) => {
    blades(c, -60, 260, H + 10, { seed: 9, color: "#3a7a2a", light: "#f0f8b0", height: 130, t, wind: 1, density: 0.8 });
    blades(c, 760, W + 60, H + 10, { seed: 10, color: "#3a7a2a", light: "#f0f8b0", height: 120, t, wind: 1, density: 0.8 });
  }, "f01-loaf-fg");
  // a soft veil of sun from the upper right (no anamorphic streak across his head)
  K.glow(g, 960, 120, 420, "#fff0c8", 0.18);
  K.grade(g, W, H, { tint: "#ffe6c0", alpha: 0.16, mode: "soft-light" });
}

// ---- shot 7: higher up the hill: you follow the prints along a winding path ---------------------------------
function shotWalk(g, t, p) {
  const e = K.ease.inOut(p);
  const cam = { x: 480, y: 280, zoom: 1.0 + 0.04 * e, shakeT: t, shakeAmt: 0.9 };
  const HZ7 = 300;
  K.withCamera(g, W, H, cam, () => {
    // seen from higher up: the rainbow arch now far off to the left, the windmill big on the right
    meadowBack(g, t, { archX: 210, archR: 54, millX: 1200 });
    windmill(g, 790, 336, 1.25, t, { haze: MSKY, hazeAmt: 0.12, lightLeft: true, speed: 0.5 });
    const near = { y: 360, amp: 24, seed: 13, freq: 0.5 };
    texturedRidge(g, Object.assign({ bottom: H + 60 }, near), "near7", { base: "#5aa040", light: "#9ad46a", dark: "#2f6a24" });
    // the worn path: wide at our feet, curving off to the right and tapering to a thread at the crest
    const pathPts = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const depth = 1 + u * u * 12;
      const y = HZ7 + 62 + (H + 60 - HZ7 - 62) / depth;
      const x = 430 + 240 * Math.sin(u * 2.1) * (1 - u * 0.35) - 40 * u;
      pathPts.push([x, y, 150 / depth]);
    }
    const path = new Path2D();
    pathPts.forEach(([x, y, w], i) => (i ? path.lineTo(x - w, y) : path.moveTo(x - w, y)));
    for (let i = pathPts.length - 1; i >= 0; i--) { const [x, y, w] = pathPts[i]; path.lineTo(x + w, y); }
    path.closePath();
    const pg = g.createLinearGradient(0, HZ7 + 60, 0, H);
    pg.addColorStop(0, "rgba(196,176,134,0.35)");
    pg.addColorStop(1, "rgba(168,140,98,0.9)");
    g.fillStyle = pg;
    g.fill(path);
    g.save();
    g.clip(path);
    g.strokeStyle = "rgba(120,96,60,0.35)";
    g.lineWidth = 1.5;
    for (const off of [-0.45, 0.45]) {
      g.beginPath();
      pathPts.forEach(([x, y, w], i) => (i ? g.lineTo(x + w * off, y) : g.moveTo(x + w * off, y)));
      g.stroke();
    }
    g.restore();
    K.grass(g, -60, W + 60, 470, { seed: 13, color: "#5aa83e", light: "#b4e488", height: 18, t, wind: 1, density: 0.35 });
    // the prints, getting smaller along the path ahead of you
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const [x, y, w] = pathPts[6 + i * 1.6 | 0];
      pts.push({ x: x + (i % 2 ? 0.25 : -0.25) * w, y, a: 0.3, s: Math.max(2.5, w * 0.16), flat: 0.35, alpha: 0.65 + 0.25 * Math.sin(t * 2 + i) });
    }
    K.pawprints(g, pts, 1.1);
    // you, from behind at mid-distance, walking up the path (shadow toward us: sun ahead-left)
    const u = K.ease.inOut(K.seg(t, 52, 60));
    const idx = K.lerp(2, 9, u);
    const i0 = Math.floor(idx), fr = idx - i0;
    const kx = K.lerp(pathPts[i0][0], pathPts[i0 + 1][0], fr), ky = K.lerp(pathPts[i0][1], pathPts[i0 + 1][1], fr);
    const kh = K.lerp(250, 120, u);
    g.save();
    g.translate(kx, ky);
    g.scale(1, 0.25);
    g.fillStyle = "rgba(30,50,30,0.32)";
    g.beginPath(); g.ellipse(kh * 0.16, kh * 0.5, kh * 0.15, kh * 0.55, -0.3, 0, K.TAU); g.fill();
    g.restore();
    K.drawPerson(g, kx, ky, kh, { view: "back", walk: true, phase: t * 0.95, hood: false, bell: true, t, light: { x: 170, y: 110, color: "#fff0d0", strength: 1.3 } });
    butterflies(g, t, { seed: 6, count: 4, area: [100, 260, 760, 200] });
  });
  K.focus(g, W, H, 4, (c) => {
    blades(c, -60, 220, H + 10, { seed: 14, color: "#2f6a24", light: "#9ad46a", height: 120, t, wind: 1.1, density: 0.8 });
    blades(c, 800, W + 60, H + 10, { seed: 15, color: "#2f6a24", light: "#9ad46a", height: 110, t, wind: 1.1, density: 0.8 });
  }, "f01-walk-fg");
  K.godRays(g, 170, 110, W, H, { color: "#fff0d0", count: 8, strength: 0.13, t, angle: 0.9, spread: 0.8, length: 900, seed: 3 });
  K.grade(g, W, H, { tint: "#ffe6c0", alpha: 0.16, mode: "soft-light" });
}

const SHOTS = [
  { a: 0, b: 9, draw: shotCrane },
  { a: 9, b: 17, draw: shotShoulder },
  { a: 17, b: 24, draw: shotWrist },
  { a: 24, b: 33, draw: shotStatue },
  { a: 33, b: 44, xf: 0.8, draw: shotDew },
  { a: 44, b: 52, draw: shotLoaf },
  { a: 52, b: 60, draw: shotWalk },
];

function post(g, t) {
  K.bloom(g, 0.22);
  K.vignette(g, W, H, 0.48);
  K.grain(g, W, H, t, 0.045);
  K.letterbox(g, W, H, 1);
  K.fadeBlack(g, W, H, Math.max(1 - K.smooth(K.seg(t, 0, 1.0)), K.smooth(K.seg(t, 58.5, 60))));
}

export const film = {
  id: 1,
  title: "The Plaza of Lost Cats",
  chapter: "Chapter 1",
  unlockAt: 5,
  duration: 60,
  poster: 30,
  tagline: "A world full of lost cats. Somewhere in it, yours.",
  subs: [
    [3.0, 6.5, "You woke up somewhere new."],
    [10.0, 13.5, "A plaza full of cats. None of them yours."],
    [14.5, 16.5, "Every one of them was lost."],
    [19.0, 22.5, "You tied his bell to your wrist."],
    [25.5, 30.0, "The old stone cat seemed to point the way."],
    [35.0, 38.5, "And there, in the dew..."],
    [39.0, 42.5, "His pawprints. Still warm."],
    [46.0, 49.5, "Biscuit?"],
    [50.0, 52.0, "No. Just a very round cat."],
    [54.0, 58.0, "Find the lost cats. They will lead you to him."],
  ],
  voice: [
    [3.0, "You woke up somewhere new.", { rate: 0.92, pitch: 1.0 }],
    [10.0, "A plaza full of cats. None of them yours.", { rate: 0.92, pitch: 1.0 }],
    [14.5, "Every one of them was lost.", { rate: 0.92, pitch: 1.0 }],
    [19.0, "You tied his bell to your wrist.", { rate: 0.92, pitch: 1.0 }],
    [25.5, "The old stone cat seemed to point the way.", { rate: 0.92, pitch: 1.0 }],
    [35.0, "And there, in the dew...", { rate: 0.92, pitch: 1.0 }],
    [39.0, "His pawprints. Still warm.", { rate: 0.92, pitch: 1.0 }],
    [46.0, "Biscuit?", { rate: 1.0, pitch: 1.1 }],
    [50.0, "No. Just a very round cat.", { rate: 1.0, pitch: 1.1 }],
    [54.0, "Find the lost cats. They will lead you to him.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: { mood: "hopeful", key: "G", bpm: 84, cues: [[1, "swell"], [18, "bell"], [33, "meow"], [44, "swell"], [56, "bell"]] },
  draw(g, t, W2, H2) {
    runFilm(g, t, W2, H2, SHOTS, post);
  },
};
