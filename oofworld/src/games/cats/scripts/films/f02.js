// films/f02.js - Chapter 2: "The Hole in the Fence" (FILMS.md f02). 64 s, golden hour, sad.
// In the meadow's golden hour you find orange fur caught on a nail under an old picket fence, which
// brings back a summer memory of kitten Biscuit squeezing under your fence at home - and always
// looking back, just once. You keep the fur, and follow him toward the lights of a town.
// draw(g, t, W, H) is a pure function of t; static art is cached by the kit.
import * as K from "../filmkit.js";
import {
  runFilm, pool, vgrad, ridge, ridgeY, windmill, blossomTree, petals, leafyTree, blades, texturedRidge,
  portalArch, silhouette, W0 as W, H0 as H,
} from "./lib012.js";

const AMBER = "#ffb35a", BLUE_SHADOW = "#4a5a8a", BLOSSOM = "#f7c3d3", FUR = "#d9822b";

// ---- shared golden-hour pieces ---------------------------------------------------------------------------
function goldenSky(g, sunX, sunY, t) {
  vgrad(g, -120, -80, W + 240, 420, [[0, "#5a6aa8"], [0.35, "#c98a9a"], [0.7, "#ffb070"], [1, "#ffd8a0"]]);
  K.sunGlow(g, sunX, sunY, 30, "#ffe0a0", 1.1);
  K.clouds(g, W, H, t, { seed: 71, color: "#ffc890", shade: "#b0708a", count: 6, y: 120, spread: 50, speed: 4, alpha: 0.8, scale: 1.1 });
}
// a picket: weathered white paint lit warm from the right, cool blue in shadow (cached per size)
function picketSprite(w, h, seed, tint) {
  return K.sprite("f02-picket:" + seed + (tint || ""), w, h, (s) => {
    const R = K.rng("pk" + seed);
    const p = new Path2D();
    p.moveTo(0, h);
    p.lineTo(0, w * 0.55);
    p.lineTo(w / 2, 0);
    p.lineTo(w, w * 0.55);
    p.lineTo(w, h);
    p.closePath();
    const gr = s.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, "#9aa0b8");
    gr.addColorStop(0.35, "#e8dccb");
    gr.addColorStop(0.85, "#fbe6c6");
    gr.addColorStop(1, "#c8a888");
    s.fillStyle = gr;
    s.fill(p);
    s.save();
    s.clip(p);
    // wood grain showing through worn paint
    s.strokeStyle = "rgba(120,96,70,0.28)";
    s.lineWidth = 0.8;
    for (let i = 0; i < 9; i++) {
      const x = R() * w;
      s.beginPath(); s.moveTo(x, h); s.bezierCurveTo(x + (R() - 0.5) * 6, h * 0.6, x + (R() - 0.5) * 8, h * 0.3, x + (R() - 0.5) * 4, 0); s.stroke();
    }
    for (let i = 0; i < 22; i++) {
      s.fillStyle = `rgba(${140 + R() * 30},${112 + R() * 20},${80 + R() * 20},${0.18 + R() * 0.2})`;
      s.beginPath(); s.ellipse(R() * w, R() * h, 0.6 + R() * w * 0.04, 1 + R() * h * 0.012, 0, 0, K.TAU); s.fill();
    }
    s.fillStyle = "rgba(255,240,215,0.35)";
    s.fillRect(w * 0.62, 0, w * 0.12, h);
    if (tint) { s.fillStyle = tint; s.fillRect(0, 0, w, h); }
    const ag = s.createLinearGradient(0, 0, 0, h);
    ag.addColorStop(0, "rgba(0,0,0,0)");
    ag.addColorStop(1, "rgba(60,70,40,0.35)");
    s.fillStyle = ag;
    s.fillRect(0, 0, w, h);
    s.restore();
  });
}
// the bokeh meadow seen far behind the fence (painted once, pre-blurred)
function bokehMeadow() {
  return K.sprite("f02-bokeh", W + 400, H, (s, w, h) => {
    if (K.hasFilter()) s.filter = "blur(7px)";
    vgrad(s, 0, 0, w, h, [[0, "#c98a9a"], [0.45, "#ffb070"], [0.62, "#e8a860"], [1, "#6a7a3a"]]);
    s.fillStyle = "#8a8a4a";
    s.beginPath(); s.moveTo(0, h * 0.62);
    for (let x = 0; x <= w; x += 20) s.lineTo(x, h * 0.6 - Math.sin(x * 0.006) * 30 - Math.sin(x * 0.017) * 12);
    s.lineTo(w, h); s.lineTo(0, h); s.fill();
    const R = K.rng("bokeh");
    for (let i = 0; i < 26; i++) {
      s.fillStyle = K.rgba(i % 3 ? "#f7c3d3" : "#fff0c0", 0.35);
      s.beginPath(); s.arc(R() * w, h * (0.3 + R() * 0.35), 30 + R() * 50, 0, K.TAU); s.fill();
    }
    s.filter = "none";
    s.globalCompositeOperation = "lighter";
    for (let i = 0; i < 40; i++) {
      const r = 6 + R() * 18;
      const x = R() * w, y = h * (0.2 + R() * 0.6);
      const gr = s.createRadialGradient(x, y, r * 0.6, x, y, r);
      gr.addColorStop(0, "rgba(255,220,160,0.18)");
      gr.addColorStop(0.9, "rgba(255,220,160,0.28)");
      gr.addColorStop(1, "rgba(255,220,160,0)");
      s.fillStyle = gr;
      s.beginPath(); s.arc(x, y, r, 0, K.TAU); s.fill();
    }
  });
}
// the orange tuft on the nail: fine glowing hairs that lift in the wind
function furTuft(g, x, y, t, scale, o = {}) {
  const wind = o.wind == null ? 1 : o.wind;
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  g.lineCap = "round";
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 44; i++) {
      const r = K.hash(i, 3), len = 12 + r * 20;
      const sway = (Math.sin(t * 2.4 + i * 0.7) * 0.22 + Math.sin(t * 5.1 + i) * 0.07) * wind;
      // clumps: hairs share a direction with their neighbours (five locks), with a little spread
      const a = 0.15 + ((i % 5) / 4 - 0.5) * 1.4 + (K.hash(i + 0.3, 3) - 0.5) * 0.35 + sway;
      const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
      const c = K.hash(i + 0.6, 3);
      g.strokeStyle = pass ? K.rgba("#ffcf90", 0.45) : c > 0.75 ? "rgba(122,58,16,0.9)" : c > 0.2 ? K.rgba(FUR, 0.92) : "rgba(246,239,228,0.85)";
      g.lineWidth = pass ? 0.3 : 0.6 + r * 0.5;
      g.beginPath();
      g.moveTo((K.hash(i, 7) - 0.5) * 3, (K.hash(i, 8) - 0.5) * 3);
      g.quadraticCurveTo(ex * 0.55, ey * 0.35 + len * 0.1, ex, ey + len * 0.3 + sway * 6);
      g.stroke();
    }
  }
  g.restore();
  if (o.glow !== false) K.glow(g, x + 8 * scale, y + 6 * scale, 18 * scale, AMBER, 0.3);
}
function nail(g, x, y, s) {
  const gr = g.createRadialGradient(x - s * 0.3, y - s * 0.3, 0, x, y, s);
  gr.addColorStop(0, "#d8d0c8");
  gr.addColorStop(0.5, "#7a6a60");
  gr.addColorStop(1, "#3a2e28");
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, s, 0, K.TAU); g.fill();
  g.fillStyle = "rgba(120,50,20,0.5)";
  g.beginPath(); g.arc(x + s * 0.3, y + s * 0.6, s * 0.6, 0, K.TAU); g.fill();
}

// ---- shot 1: golden hour, slow pan right ---------------------------------------------------------------------
function shotGolden(g, t, p) {
  const e = K.ease.inOut(p);
  const SUNP = [700, 268];
  const cam = { x: K.lerp(400, 560, e), y: 270, zoom: 1.0, shakeT: t, shakeAmt: 0.6 };
  K.withCamera(g, W, H, cam, () => {
    goldenSky(g, SUNP[0], SUNP[1], t);
    const far = { y: 300, amp: 34, seed: 31, freq: 0.6, x0: -160, x1: W + 160 };
    ridge(g, Object.assign({ color: "#b8826a", top: "#d0987a", base: "#a07060", bottom: H + 60 }, far));
    // windmill silhouetted against the sun
    windmill(g, 700, ridgeY(700, far) + 8, 1.0, t, { body: "#3a2830", blade: "#2a1e26", speed: 0.35 });
    K.fog(g, W, H, { y: 300, h: 60, color: "#ffc890", alpha: 0.4, t, seed: 4, wisps: false });
    const mid = { y: 352, amp: 40, seed: 33, freq: 0.8, x0: -160, x1: W + 160 };
    texturedRidge(g, Object.assign({ bottom: H + 60, rim: "#ffd890", rimA: 0.45, shadeTop: "rgba(74,90,138,0.0)" }, mid), "f02mid", { base: "#7a8a3a", light: "#d8b860", dark: "#4a5a2a" });
    // cherry trees with long blue shadows reaching toward us
    const trees = [[120, 0.75, 3], [300, 0.55, 5], [850, 0.8, 7], [1020, 0.6, 9]];
    for (const [x, sc, sd] of trees) {
      const y = ridgeY(x, mid) + 12;
      g.save();
      g.fillStyle = K.rgba(BLUE_SHADOW, 0.35);
      g.beginPath(); g.moveTo(x - 10, y); g.lineTo(x + 10, y); g.lineTo(x - 260 * sc - 40, y + 90 * sc); g.lineTo(x - 260 * sc - 120, y + 90 * sc); g.closePath(); g.fill();
      g.restore();
      blossomTree(g, x, y, sc, t, { seed: sd, bloom: BLOSSOM, trunk: "#3a2a2a" });
      K.glow(g, x + 30 * sc, y - 170 * sc, 90 * sc, "#ffd8a0", 0.25);
    }
    petals(g, t, { seed: 3, count: 40, area: [-100, 80, W + 200, 380], wind: 1.2 });
  });
  // backlit long grass in the foreground (translucent, glowing at the edges)
  K.focus(g, W, H, 2.5, (c) => {
    const sl = e * 90;
    blades(c, -80 - sl, W + 200 - sl, H + 10, { seed: 21, color: "#5a5a22", light: "#ffe6a0", height: 150, t, wind: 1, density: 0.55 });
  }, "f02-gold-fg");
  K.godRays(g, SUNP[0] - (cam.x - 480), SUNP[1], W, H, { color: "#ffd8a0", count: 10, strength: 0.18, t, angle: Math.PI / 2, spread: 2.6, length: 900, seed: 5 });
  K.lensFlare(g, SUNP[0] - (cam.x - 480), SUNP[1], W, H, 0.6, { color: "#ffd8a0" });
  K.grade(g, W, H, { tint: "#ffb35a", alpha: 0.18, mode: "soft-light" });
  const ta = K.env(t, 1, 5.6, 1, 1.1);
  if (ta > 0) K.title(g, W, H, "The Hole in the Fence", "Chapter 2", ta, { y: H * 0.25, size: 52, glow: "#7a4a3a" });
}

// ---- shot 2: tracking along the fence at knee height, stopping at the gap --------------------------------
const PK = { w: 62, h: 470, step: 92, top: 40 };
function fenceTravel(t) { return 1560 * K.ease.out(K.seg(t, 9, 12.2)); }
const GAP_K = 21;
function shotFence(g, t, p) {
  const S = fenceTravel(t);
  const ground = 478;
  const push = K.ease.inOut(K.seg(t, 15.2, 18));
  const gx0 = GAP_K * PK.step - 1560 + 80 + PK.w;
  g.save();
  g.translate(gx0, 336);
  g.scale(1 + push * 0.9, 1 + push * 0.9);
  g.translate(-gx0, -336);
  g.translate(-push * 140, 0);
  // far background (pre-blurred), slower parallax
  g.drawImage(bokehMeadow(), -S * 0.12 - 40, 0, W + 400, H);
  K.glow(g, 820 - S * 0.05, 200, 260, "#ffd8a0", 0.35);
  // rails behind the pickets
  vgrad(g, -10, 150, W + 20, 26, [[0, "#d8c8b0"], [1, "#9a8a7a"]]);
  vgrad(g, -10, 380, W + 20, 26, [[0, "#d0c0a8"], [1, "#8a7a6a"]]);
  // pickets sliding past
  const k0 = Math.floor((S - 200) / PK.step), k1 = k0 + 14;
  for (let k = k0; k <= k1; k++) {
    const x = k * PK.step - S + 80;
    const seed = ((k % 5) + 5) % 5;
    const spr = picketSprite(PK.w, PK.h, seed);
    if (k === GAP_K) {
      // the broken picket: its bottom has rotted away, leaving a hole under the fence
      g.drawImage(spr, 0, 0, PK.w, PK.h - 140, x, PK.top + (k % 2) * 6, PK.w, PK.h - 140);
      continue;
    }
    g.drawImage(spr, x, PK.top + (k % 2) * 6, PK.w, PK.h);
    // contact shadow on the next picket's side
    g.fillStyle = "rgba(60,50,80,0.25)";
    g.fillRect(x - 6, PK.top + 30, 6, PK.h);
  }
  // dark scooped earth under the gap
  const gx = GAP_K * PK.step - S + 80 + PK.w / 2;
  g.fillStyle = "rgba(40,24,14,0.9)";
  g.beginPath(); g.ellipse(gx, ground + 8, 70, 46, 0, Math.PI, K.TAU); g.fill();
  g.fillStyle = "rgba(255,190,110,0.15)";
  g.beginPath(); g.ellipse(gx + 10, ground - 10, 40, 20, 0, Math.PI, K.TAU); g.fill();
  // grass shadow stripes across the pickets (sun low on the right)
  g.save();
  g.globalCompositeOperation = "multiply";
  for (let i = 0; i < 14; i++) {
    const x = ((i * 97 - S * 1.0) % (W + 200) + W + 200) % (W + 200) - 100;
    const sw = Math.sin(t * 1.2 + i) * 10;
    g.fillStyle = "rgba(90,100,150,0.16)";
    g.beginPath(); g.moveTo(x, ground + 10); g.lineTo(x + 12, ground + 10); g.lineTo(x - 80 + sw, ground - 160 - (i % 3) * 30); g.lineTo(x - 88 + sw, ground - 150 - (i % 3) * 30); g.closePath(); g.fill();
  }
  g.restore();
  // the nail and the tuft of orange fur, lit by the sun
  const nx = gx + PK.w / 2 - 6, ny = 330 + 6;
  nail(g, nx, ny, 4.5);
  furTuft(g, nx, ny, t, 2.8, { wind: 1 });
  K.glow(g, nx + 14, ny + 4, 60, AMBER, 0.25 * K.smooth(K.seg(t, 14, 16.5)));
  // grass in front
  K.grass(g, -40, W + 40, ground + 20, { seed: 5, color: "#7a7a30", light: "#ffe090", height: 60, t, wind: 1, density: 0.8 });
  g.restore();
  K.focus(g, W, H, 4, (c) => blades(c, -60 - (S % 300), W + 300 - (S % 300), H + 10, { seed: 8, color: "#4a4a1a", light: "#ffd890", height: 120, t, wind: 1, density: 0.35 }), "f02-fence-fg");
  K.grade(g, W, H, { tint: "#ffb35a", alpha: 0.16, mode: "soft-light", shadows: "#8a90c0", shadowAlpha: 0.12 });
}

// ---- flashback pieces --------------------------------------------------------------------------------------
function memoryLook(g, t) {
  K.grade(g, W, H, { tint: "#ffcf8a", alpha: 0.25, mode: "soft-light" });
  K.glow(g, W / 2, H * 0.3, W * 0.7, "#fff0d0", 0.1);
  K.vignette(g, W, H, 0.55, "#3a2410");
  K.grain(g, W, H, t + 0.37, 0.05);
}
// perspective fence for the flashback garden: runs from near-left to far-right
const FB = { x0: -60, y0: 470, h0: 230, x1: 1020, y1: 320, h1: 110 };
const fbY = (x) => K.lerp(FB.y0, FB.y1, (x - FB.x0) / (FB.x1 - FB.x0));
const fbH = (x) => K.lerp(FB.h0, FB.h1, (x - FB.x0) / (FB.x1 - FB.x0));
const HOLE_X = 470;
function summerGarden(g, t) {
  vgrad(g, -60, -60, W + 120, 400, [[0, "#6aaee8"], [1, "#d8ecf0"]]);
  K.clouds(g, W, H, t, { seed: 81, color: "#ffffff", shade: "#c8d8ea", count: 5, y: 80, spread: 40, speed: 4, alpha: 0.9 });
  leafyTree(g, 820, 330, 1.1, t, { seed: 21, leaf: "#3f7f34", lightLeft: true });
  leafyTree(g, 120, 300, 0.9, t, { seed: 22, leaf: "#4a8a3a", lightLeft: true });
  // the neighbour's lawn beyond the fence, then ours
  vgrad(g, -60, 290, W + 120, 300, [[0, "#7ab85a"], [1, "#5a9a40"]]);
  g.drawImage(fieldTex(), -60, 300, W + 120, 260);
  // dappled sun
  for (let i = 0; i < 8; i++) K.glow(g, K.hash(i, 4) * W, 330 + K.hash(i, 5) * 200, 60 + K.hash(i, 6) * 60, "#fff6d0", 0.12);
}
function fieldTex() {
  return K.sprite("f02-summer-field", W + 120, 260, (s, w, h) => {
    const R = K.rng("summer");
    for (let i = 0; i < 3000; i++) {
      const v = Math.pow(R(), 0.8), x = R() * w, y = v * h;
      const l = 2 + v * 14;
      s.strokeStyle = R() > 0.5 ? "rgba(150,210,110,0.5)" : "rgba(40,90,30,0.5)";
      s.lineWidth = 0.6 + v;
      s.beginPath(); s.moveTo(x, y); s.lineTo(x + (R() - 0.5) * 4, y - l); s.stroke();
    }
    const cols = ["#ffffff", "#ffe34a", "#ff8ab0", "#b49aff", "#ff6a4a"];
    for (let i = 0; i < 300; i++) {
      const v = R();
      s.fillStyle = cols[i % cols.length];
      s.beginPath(); s.arc(R() * w, v * h, 0.8 + v * 2.4, 0, K.TAU); s.fill();
    }
  });
}
function perspectiveFence(g, t, holeOpen) {
  // rails
  for (const k of [0.3, 0.72]) {
    g.strokeStyle = "#cfc6b8";
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(FB.x0, fbY(FB.x0) - fbH(FB.x0) * k); g.lineTo(FB.x1, fbY(FB.x1) - fbH(FB.x1) * k); g.stroke();
  }
  // pickets, near ones larger
  let x = FB.x0;
  while (x < FB.x1) {
    const h = fbH(x), y = fbY(x), w = h * 0.2;
    // the picket over the hole has rotted off above the ground: the hole runs under the bottom rail
    const above = Math.abs(x + w / 2 - HOLE_X) < w * 0.8 ? h * 0.22 + holeOpen : 0;
    const gr = g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, "#fffaf0");
    gr.addColorStop(0.7, "#efe6d8");
    gr.addColorStop(1, "#b8b0a8");
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x, y - above);
    g.lineTo(x, y - h * 0.9);
    g.lineTo(x + w / 2, y - h);
    g.lineTo(x + w, y - h * 0.9);
    g.lineTo(x + w, y - above);
    g.closePath();
    g.fill();
    // planted: damp, darker wood and ambient occlusion where it meets the soil, a cast shadow on the lawn
    const ao = g.createLinearGradient(0, y - above - h * 0.2, 0, y - above);
    ao.addColorStop(0, "rgba(70,60,40,0)");
    ao.addColorStop(1, above ? "rgba(90,60,30,0.55)" : "rgba(50,60,30,0.6)");
    g.fillStyle = ao;
    g.fillRect(x, y - above - h * 0.2, w, h * 0.2);
    if (above) {
      // splintered end
      g.fillStyle = "#8a7258";
      g.beginPath(); g.moveTo(x, y - above); for (let k = 0; k <= 5; k++) g.lineTo(x + (w * k) / 5, y - above + (k % 2 ? 5 : -2)); g.lineTo(x + w, y - above - 4); g.lineTo(x, y - above - 4); g.fill();
    } else {
      g.fillStyle = "rgba(40,60,25,0.35)";
      g.beginPath(); g.ellipse(x + w * 0.2, y + 2, w * 1.1, w * 0.18, 0, 0, K.TAU); g.fill();
    }
    x += w * 1.55;
  }
}

// ---- shot 3: flashback - the kitten under the fence ---------------------------------------------------------
function kittenState(t) {
  // x position of the kitten's shoulders; the fence plane is at HOLE_X
  if (t < 20) return { x: K.lerp(HOLE_X - 30, HOLE_X + 12, K.smooth(K.seg(t, 18.4, 20))), pose: "walk", phase: t * 1.4, rot: 0, stuck: 0, sink: 13 };
  if (t < 23.4) return { x: HOLE_X + 14 + Math.sin(t * 9) * 2, pose: "walk", phase: 0.5 + 0.18 * Math.sin(t * 15), rot: 0, stuck: 1, sink: 13 };
  if (t < 24) { const u = K.ease.out(K.seg(t, 23.4, 24)); return { x: K.lerp(HOLE_X + 14, HOLE_X + 70, u), pose: "pounce", phase: 0.6, rot: 0, stuck: 0, sink: 13 * (1 - u) }; }
  if (t < 25) { const u = K.seg(t, 24, 25); return { x: K.lerp(HOLE_X + 70, HOLE_X + 150, u), pose: "loaf", phase: 0, rot: K.ease.inOut(u) * K.TAU, stuck: 0, roll: Math.sin(u * Math.PI) }; }
  return { x: HOLE_X + 150, pose: "sit", phase: 0, rot: 0, stuck: 0, shake: K.env(t, 25.4, 26.4, 0.2, 0.3) };
}
function shotKitten(g, t, p) {
  const cam = { x: K.lerp(480, 520, p), y: K.lerp(350, 360, p), zoom: 2.0 + 0.12 * K.ease.inOut(p), shakeT: t, shakeAmt: 1 };
  const k = kittenState(t);
  const gy = fbY(HOLE_X) + 6;
  const mew = K.env(t, 21.8, 22.7, 0.1, 0.3);
  const light = { x: 900, y: 40, color: "#fff2c8", strength: 1.3 };
  K.withCamera(g, W, H, cam, () => {
    summerGarden(g, t);
    // the hole: scooped earth under the fence
    g.fillStyle = "#3a2618";
    g.beginPath(); g.ellipse(HOLE_X, gy, 44, 16, -0.12, 0, K.TAU); g.fill();
    g.fillStyle = "#1a0e08";
    g.beginPath(); g.ellipse(HOLE_X - 4, gy - 2, 36, 11, -0.12, 0, K.TAU); g.fill();
    const catOpts = {
      pose: k.pose, phase: k.phase, facing: 1, headTurn: k.stuck ? 0.6 + 0.2 * Math.sin(t * 3) : k.pose === "sit" ? 0.85 : 0.3,
      headTilt: k.shake ? Math.sin(t * 30) * 0.3 * k.shake : 0, mouth: mew, t, collar: true, bell: true, light,
      ears: k.stuck ? -0.3 : 0, tail: 0.5 + 0.4 * Math.sin(t * 6),
    };
    const size = 21; // a kitten: about 55-60% of an adult
    const drawK = () => {
      if (k.rot) {
        g.save();
        g.translate(k.x, gy - size * 0.5 - (k.roll || 0) * 10);
        g.rotate(k.rot);
        K.drawCat(g, 0, size * 0.5, size, Object.assign({}, catOpts, { shadow: false }));
        g.restore();
      } else K.drawCat(g, k.x, gy + (k.sink || 0) * 0.62, size, Object.assign({}, catOpts, { shadow: !k.sink }));
    };
    // paint him once offscreen; the part still on the far side goes behind the fence, the rest in front
    const KL = K.blurLayer(W, H, "f02-kitten", 0, (c) => { const g0 = g; g = c; try { drawK(); } finally { g = g0; } });
    // only the region around him is copied (cheap)
    const PXS = K.pixelScale();
    const rx0 = Math.max(0, Math.floor(HOLE_X - 110)), ry0 = Math.max(0, Math.floor(gy - 120)), rw = 380, rh = 170;
    const part = (x0, x1) => {
      const a = Math.max(rx0, x0), b = Math.min(rx0 + rw, x1);
      if (b <= a) return;
      g.drawImage(KL.canvas, a * PXS, ry0 * PXS, (b - a) * PXS, rh * PXS, a, ry0, b - a, rh);
    };
    part(0, HOLE_X);
    perspectiveFence(g, t, 0);
    // grass growing up round the picket feet so they read as planted in the lawn
    K.grass(g, -60, HOLE_X - 50, fbY(HOLE_X) + 4, { seed: 35, color: "#5aa040", light: "#c8f08a", height: 14, t, wind: 0.5, density: 0.8 });
    K.grass(g, HOLE_X + 50, W + 60, fbY(HOLE_X + 120) + 2, { seed: 36, color: "#5aa040", light: "#c8f08a", height: 11, t, wind: 0.5, density: 0.8 });
    part(HOLE_X, W);
    // the near lip of the hole hides his tummy and paws while he squeezes
    g.fillStyle = "#4a3220";
    g.beginPath(); g.ellipse(HOLE_X + 4, gy + 12, 52, 9, -0.12, 0, Math.PI); g.fill();
    K.grass(g, HOLE_X - 70, HOLE_X + 80, gy + 16, { seed: 33, color: "#5aa040", light: "#c8f08a", height: 12, t, wind: 0.6 });
    K.grass(g, -60, W + 60, 560, { seed: 31, color: "#5aa040", light: "#c8f08a", height: 40, t, wind: 0.6, density: 0.6 });
  });
  // a younger you: small hands reaching in to help
  const reach = K.env(t, 19.6, 24.2, 1.2, 0.6);
  if (reach > 0) {
    K.drawHand(g, K.lerp(600, 640, reach), K.lerp(700, 560, reach), 170, { pose: "reach", angle: -1.6, left: true, t, light });
    K.drawHand(g, K.lerp(900, 800, reach), K.lerp(700, 570, reach), 170, { pose: "reach", angle: -2.1, t, light });
  }
  K.dust(g, W, H, t, { seed: 21, color: "#fff2c8", count: 30, alpha: 0.5 });
  memoryLook(g, t);
}

// ---- shot 4: flashback - from his side; he looks back, then trots away --------------------------------------
function shotLookBack(g, t, p) {
  const SUNP = [860, 250];
  const cam = { x: 480, y: 280, zoom: 1.02 + 0.04 * p, shakeT: t, shakeAmt: 0.8 };
  const go = K.ease.inOut(K.seg(t, 34, 37.6));
  K.withCamera(g, W, H, cam, () => {
    vgrad(g, -60, -60, W + 120, 420, [[0, "#8ac0ea"], [0.6, "#ffe6c0"], [1, "#fff2d0"]]);
    K.sunGlow(g, SUNP[0], SUNP[1], 30, "#fff2c8", 1);
    // the fence behind him, close, the hole at its foot and your small boots through the gap
    vgrad(g, -60, 330, W + 120, 260, [[0, "#6aa84a"], [1, "#3f7a2e"]]);
    K.focus(g, W, H, 3, (c) => {
      for (let i = 0; i < 9; i++) {
        const x = 40 + i * 104;
        const gr = c.createLinearGradient(x, 0, x + 70, 0);
        gr.addColorStop(0, "#c8c0b8"); gr.addColorStop(0.6, "#fff6ea"); gr.addColorStop(1, "#d8ccb8");
        c.fillStyle = gr;
        const lift = i === 3 ? 70 : 0;
        c.beginPath(); c.moveTo(x, 400 - lift); c.lineTo(x, 40); c.lineTo(x + 35, 0); c.lineTo(x + 70, 40); c.lineTo(x + 70, 400 - lift); c.closePath(); c.fill();
      }
      c.fillStyle = "#cfc6b8";
      c.fillRect(-10, 90, W + 20, 18);
      c.fillRect(-10, 280, W + 20, 18);
      c.fillStyle = "#2a1a10";
      c.beginPath(); c.ellipse(390, 402, 70, 28, 0, Math.PI, K.TAU); c.fill();
      // a kid's red boots and hands, seen through the hole
      for (const bx of [352, 400]) {
        const bg = c.createLinearGradient(bx, 0, bx + 26, 0);
        bg.addColorStop(0, "#c8443e"); bg.addColorStop(1, "#7a2420");
        c.fillStyle = bg;
        c.beginPath(); c.moveTo(bx, 360); c.lineTo(bx + 24, 360); c.lineTo(bx + 24, 388); c.quadraticCurveTo(bx + 40, 390, bx + 38, 400); c.lineTo(bx - 2, 400); c.closePath(); c.fill();
        c.fillStyle = "#2b3448";
        c.fillRect(bx + 2, 330, 20, 32);
      }
    }, "f02-lb-bg");
    // tall flowers he will trot into
    for (let i = 0; i < 26; i++) {
      const x = 560 + i * 18 + K.hash(i, 2) * 12, h = 120 + K.hash(i, 3) * 100;
      const sw = Math.sin(t * 1.3 + i) * 6;
      g.strokeStyle = "#4a8a34";
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, 470); g.quadraticCurveTo(x + sw * 0.5, 470 - h * 0.5, x + sw, 470 - h); g.stroke();
      g.fillStyle = i % 3 ? "#ffd84a" : "#ff8ab0";
      g.beginPath(); g.arc(x + sw, 470 - h, 6 + K.hash(i, 4) * 4, 0, K.TAU); g.fill();
      g.fillStyle = "#8a5a20";
      g.beginPath(); g.arc(x + sw, 470 - h, 2.5, 0, K.TAU); g.fill();
    }
    // the kitten in the foreground: looks back at you through the gap, then trots off
    const cx = K.lerp(470, 820, go);
    K.drawCat(g, cx, 478, 64, {
      pose: go > 0.02 ? "walk" : "stand", phase: t * 1.6, facing: 1, t,
      headTurn: K.lerp(1, 0.2, K.smooth(K.seg(t, 33.2, 34))), gaze: -0.9 * (1 - K.smooth(K.seg(t, 33.2, 34))),
      blink: K.env(t, 31.8, 32.4, 0.15, 0.2), light: { x: SUNP[0], y: SUNP[1], color: "#fff0c0", strength: 1.8 }, collar: true, bell: true,
      tailUp: 0.8, tail: 0.5 + 0.2 * Math.sin(t * 2),
    });
    // flowers in front of him as he goes in
    for (let i = 0; i < 12; i++) {
      const x = 640 + i * 30 + K.hash(i, 8) * 14, h = 60 + K.hash(i, 9) * 50;
      const sw = Math.sin(t * 1.5 + i) * 5;
      g.strokeStyle = "#3f7a2e";
      g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(x, 500); g.quadraticCurveTo(x + sw * 0.5, 500 - h * 0.5, x + sw, 500 - h); g.stroke();
      g.fillStyle = i % 2 ? "#fff2a0" : "#ffffff";
      g.beginPath(); g.arc(x + sw, 500 - h, 7, 0, K.TAU); g.fill();
    }
    K.grass(g, -60, W + 60, 520, { seed: 41, color: "#4f9a38", light: "#d8f0a0", height: 34, t, wind: 0.7, density: 0.7 });
  });
  K.godRays(g, SUNP[0], SUNP[1], W, H, { color: "#fff0c8", count: 10, strength: 0.2, t, angle: Math.PI * 0.85, spread: 1.4, length: 900, seed: 9 });
  K.lensFlare(g, SUNP[0], SUNP[1], W, H, 0.55, { color: "#fff0c8" });
  memoryLook(g, t);
}

// ---- shot 5: present - your hand takes the fur from the nail --------------------------------------------------
function shotTuft(g, t, p) {
  const cam = { x: 480, y: 270, zoom: 1.0 + 0.05 * K.ease.inOut(p), shakeT: t, shakeAmt: 0.8 };
  const reach = K.ease.inOut(K.seg(t, 38.6, 41.4));
  const pinched = t > 41.6;
  const pull = K.ease.inOut(K.seg(t, 42.6, 46.5));
  const N = [430, 300];
  K.withCamera(g, W, H, cam, () => {
    g.drawImage(bokehMeadow(), -200 - p * 40, 0, W + 400, H);
    K.glow(g, 820, 230, 300, "#ffc880", 0.45);
    // one big picket, close up
    const px = 300, pw = 150;
    const spr = picketSprite(pw, 900, 2);
    g.drawImage(spr, px, -120, pw, 900);
    g.fillStyle = "rgba(60,50,80,0.22)";
    g.fillRect(px + pw - 8, -120, 8, 900);
    nail(g, N[0], N[1], 7);
    // the tuft: on the nail, then between your fingers
    if (!pinched) furTuft(g, N[0], N[1], t, 3.6, { wind: 1.2 });
    const hx = K.lerp(860, N[0] + 130, reach) + pull * 220, hy = K.lerp(720, N[1] + 120, reach) + pull * 140;
    if (t > 38.6) {
      K.drawHand(g, hx, hy, 190, { pose: pinched ? "hold" : reach > 0.8 ? "point" : "reach", angle: -2.35 + pull * 0.2, t, light: { x: 900, y: 200, color: "#ffd8a0", strength: 1.4 } });
      if (pinched) furTuft(g, hx - 120 + pull * 10, hy - 120, t, 3.4, { wind: 1.6 });
    }
  });
  K.godRays(g, 900, 200, W, H, { color: "#ffd8a0", count: 8, strength: 0.16, t, angle: Math.PI * 0.8, spread: 1, length: 900, seed: 13 });
  petals(g, t, { seed: 9, count: 16, wind: 1.4, size: 3.4 });
  K.grade(g, W, H, { tint: "#ffb35a", alpha: 0.2, mode: "soft-light", shadows: "#8a90c0", shadowAlpha: 0.12 });
}

// ---- shot 6: over your shoulder, through the gap: a town's lights ---------------------------------------------
function shotThrough(g, t, p) {
  const dusk = K.smooth(p);
  const cam = { x: K.lerp(470, 500, p), y: K.lerp(280, 330, p), zoom: 1.0 + 0.1 * K.ease.inOut(p), shakeT: t, shakeAmt: 0.8 };
  K.withCamera(g, W, H, cam, () => {
    vgrad(g, -60, -60, W + 120, 400, [[0, K.mix("#5a6aa8", "#3b2a5a", dusk)], [0.6, K.mix("#e89a8a", "#c06a6a", dusk)], [1, K.mix("#ffc880", "#ff9a5a", dusk)]]);
    K.sunGlow(g, 140, 300, 26, "#ffc880", 0.8 * (1 - dusk * 0.5));
    if (dusk > 0.4) K.stars(g, W, H, 3, 0.6, t, { yMax: H * 0.3 });
    const far = { y: 300, amp: 18, seed: 41, freq: 0.6 };
    ridge(g, Object.assign({ color: "#6a5a7a", top: "#7a6a8a", base: "#5a4a6a", bottom: H + 40 }, far));
    // the far portal glow and a scatter of town lights on the horizon
    portalArch(g, 520, ridgeY(520, far) + 6, 44, "#e6b478", t, { haze: "#8a7a9a", hazeAmt: 0.45, glow: 1 });
    K.glow(g, 520, ridgeY(520, far) - 16, 140, "#e6b478", 0.4);
    for (let i = 0; i < 22; i++) {
      const x = 420 + K.hash(i, 3) * 220, y = ridgeY(x, far) + 2 - K.hash(i, 4) * 8;
      K.glow(g, x, y, 5, "#ffd890", 0.5 + 0.3 * Math.sin(t * 2 + i));
    }
    const mid = { y: 360, amp: 26, seed: 43, freq: 0.7 };
    texturedRidge(g, Object.assign({ bottom: H + 40 }, mid), "f02dusk", { base: "#4a5a3a", light: "#8a7a4a", dark: "#2a3a2a", flowers: false });
    // the fence, close, with the gap low in the middle
    for (let i = -1; i < 12; i++) {
      const x = i * 92 + 10;
      const spr = picketSprite(56, 170, (i + 5) % 5, K.rgba(K.mix("#a06a5a", "#4a3a6a", dusk), 0.42));
      if (i === 5) { g.drawImage(spr, 0, 0, 56, 96, x, 290, 56, 96); continue; }
      g.drawImage(spr, x, 290, 56, 170);
    }
    g.fillStyle = "#6e5e78";
    g.fillRect(-60, 320, W + 120, 10);
    g.fillRect(-60, 410, W + 120, 10);
    // warm sky light catching the picket tips
    g.save();
    g.globalCompositeOperation = "lighter";
    for (let i = -1; i < 12; i++) K.glow(g, i * 92 + 38, 296, 16, "#ff9a5a", 0.18);
    g.restore();
    // through the gap: the warm light from beyond spills under the fence
    // the gap itself: a dirt hollow under the missing picket, lit from beyond
    g.fillStyle = "#2a1a12";
    g.beginPath(); g.ellipse(484, 448, 50, 16, 0, Math.PI, K.TAU); g.fill();
    K.glow(g, 486, 408, 70, "#e6b478", 0.55);
    pool(g, 500, 450, 90, 14, "#e6b478", 0.35);
    vgrad(g, -60, 440, W + 120, 140, [[0, "#3a4a2a"], [1, "#24321c"]]);
    K.grass(g, -60, W + 60, 452, { seed: 51, color: "#4a5a2a", light: "#c8a060", height: 30, t, wind: 0.8, density: 0.7 });
    K.fireflies(g, W, H, t, { seed: 6, count: Math.round(6 + dusk * 16), color: "#ffe98a", area: [0, 300 - dusk * 140, W, 200], size: 2.4 });
  });
  // you, crouched, close in the foreground
  K.drawPerson(g, 190, 600, 360, { view: "back", crouch: 1, hood: false, t, light: { x: 640, y: 320, color: "#e6b478", strength: 1.2 } });
  K.grade(g, W, H, { tint: K.mix("#ffb35a", "#6a5a9a", dusk), alpha: 0.28, mode: "soft-light", shadows: "#6a5a9a", shadowAlpha: 0.15 + 0.2 * dusk });
}

// ---- shot 7: dusk - you walk through the gate toward the far light --------------------------------------------
function shotDusk(g, t, p) {
  const cam = { x: 480, y: 270, zoom: 1.0 + 0.03 * p, shakeT: t, shakeAmt: 0.6 };
  K.withCamera(g, W, H, cam, () => {
    vgrad(g, -60, -60, W + 120, 420, [[0, "#1e1a3a"], [0.4, "#3b2a5a"], [0.8, "#c86a6a"], [1, "#ff9a5a"]]);
    K.stars(g, W, H, 7, 0.9, t, { yMax: H * 0.38 });
    K.glow(g, 820, 360, 260, "#ff9a5a", 0.35);
    const far = { y: 372, amp: 18, seed: 51, freq: 0.6 };
    ridge(g, Object.assign({ color: "#2a2038", top: "#3a2a48", base: "#1e1828", bottom: H + 40 }, far));
    K.glow(g, 860, ridgeY(860, far) - 6, 70, "#e6b478", 0.6);
    K.glow(g, 860, ridgeY(860, far) - 6, 12, "#fff0c8", 0.8);
    // the fence in silhouette along the meadow, an open gate
    vgrad(g, -60, 400, W + 120, 200, [[0, "#141020"], [1, "#0c0a14"]]);
    g.fillStyle = "#120e1c";
    for (let x = -40; x < W + 40; x += 22) {
      if (x > 470 && x < 540) continue;
      g.beginPath(); g.moveTo(x, 405); g.lineTo(x, 362); g.lineTo(x + 6, 354); g.lineTo(x + 12, 362); g.lineTo(x + 12, 405); g.fill();
    }
    g.fillRect(-40, 372, 510, 4); g.fillRect(540, 372, W, 4);
    g.save();
    g.translate(470, 405);
    g.transform(1, 0.12, 0, 1, 0, 0);
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(-k * 15, 0); g.lineTo(-k * 15, -43); g.lineTo(-k * 15 - 6, -51); g.lineTo(-k * 15 - 12, -43); g.lineTo(-k * 15 - 12, 0); g.fill(); }
    g.fillRect(-56, -32, 56, 4);
    g.restore();
    // rim of sky light along the fence tops
    g.strokeStyle = "rgba(255,150,100,0.25)";
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(-40, 362); g.lineTo(W + 40, 362); g.stroke();
    // you, a small silhouette walking through the gate toward the light
    const u = K.ease.inOut(K.seg(t, 57, 63.5));
    const kx = K.lerp(400, 640, u), ky = K.lerp(408, 398, u);
    const kid = (c) => K.drawPerson(c, kx, ky, 92, { view: "side", facing: 1, walk: true, phase: t * 0.9, hood: false, t, shadow: false, light: { x: 860, y: 360, color: "#ff9a5a", strength: 1.4 } });
    kid(g);
    silhouette(g, "f02-kidsil", kid, "#160f22", 0.82);
    const ring = Math.exp(-Math.max(0, t - 58) * 1.5) * (t >= 58 ? 1 : 0);
    if (ring > 0.02) K.bellGlint(g, kx - 6, ky - 46, 10 + ring * 10, t, { strength: ring * 1.4 });
    K.fireflies(g, W, H, t, { seed: 8, count: 16, color: "#ffe98a", area: [0, 300, W, 200], size: 2 });
  });
  K.grade(g, W, H, { tint: "#8a6aa8", alpha: 0.16, mode: "soft-light" });
}

const SHOTS = [
  { a: 0, b: 9, draw: shotGolden },
  { a: 9, b: 18, draw: shotFence },
  { a: 18, b: 30, xf: 1.0, draw: shotKitten },
  { a: 30, b: 37, draw: shotLookBack },
  { a: 37, b: 48, xf: 1.0, draw: shotTuft },
  { a: 48, b: 57, draw: shotThrough },
  { a: 57, b: 64, draw: shotDusk },
];

function post(g, t) {
  K.bloom(g, 0.28);
  K.vignette(g, W, H, 0.55);
  K.grain(g, W, H, t, t > 18 && t < 37.5 ? 0.075 : 0.05);
  K.letterbox(g, W, H, 1);
  K.fadeBlack(g, W, H, Math.max(1 - K.smooth(K.seg(t, 0, 1.0)), K.smooth(K.seg(t, 63.2, 64))));
}

export const film = {
  id: 2,
  title: "The Hole in the Fence",
  chapter: "Chapter 2",
  unlockAt: 10,
  duration: 64,
  poster: 22,
  tagline: "He always did find the way out.",
  subs: [
    [2.5, 6.0, "The meadow went gold in the evening."],
    [11.0, 15.5, "Then you saw it. Orange fur. On a nail."],
    [19.5, 23.5, "He used to do this at home, too."],
    [24.5, 28.5, "The little hole under the fence."],
    [31.0, 35.5, "He always looked back. Just once."],
    [39.5, 43.5, "You kept the fur. Just in case."],
    [49.0, 53.5, "On the other side, a town's lights."],
    [58.5, 62.5, "He went that way. So would you."],
  ],
  voice: [
    [2.5, "The meadow went gold in the evening.", { rate: 0.92, pitch: 1.0 }],
    [11.0, "Then you saw it. Orange fur. On a nail.", { rate: 0.92, pitch: 1.0 }],
    [19.5, "He used to do this at home, too.", { rate: 0.88, pitch: 1.0 }],
    [24.5, "The little hole under the fence.", { rate: 0.92, pitch: 1.0 }],
    [31.0, "He always looked back. Just once.", { rate: 0.92, pitch: 1.0 }],
    [39.5, "You kept the fur. Just in case.", { rate: 0.92, pitch: 1.0 }],
    [49.0, "On the other side, a town's lights.", { rate: 0.92, pitch: 1.0 }],
    [58.5, "He went that way. So would you.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: { mood: "sad", key: "E", bpm: 72, cues: [[8, "swell"], [22, "meow"], [40, "swell"], [58, "bell"]] },
  draw(g, t, W2, H2) {
    runFilm(g, t, W2, H2, SHOTS, post);
  },
};
