// films/f19.js - Chapter 19 "The Bell" (FILMS.md f19). The last darkness before dawn on the cloud plateau.
// The paw ring is cold stone; you untie Biscuit's bell from your wrist and ring it. The sound is a ring of
// light; the stones answer one by one in amber, the cats' eyes catch fire, and through the ring: sunrise,
// and a small orange cat on a hill. His meow. You step into the light.
// draw(g, t, W, H) is a pure function of t; only static art is cached (sprites / layers).
import * as K from "../filmkit.js";
import { inLayer, put, soft, spriteCat, warmCats, warmBack, CROWD, catBack, dawnSky, cloudRow, stoneRing, ringTrail, soundRing, plain, kidShaded, windMotes, lines, bell, hand } from "./lib1820.js";

const D = 64;
const TAU = Math.PI * 2;

// ---- palette (FILMS.md f19: blue-black, silver ring, then amber -> white ignition, a first sliver of sun) -----
const SKY = { top: "#070b22", mid: "#121a3a", bottom: "#3a3360", band: "#6a4668" };
const FAR = { key: "f19far", lit: "#8a7aa8", mid: "#4a4678", shade: "#262650" };
const PLAIN = { key: "f19plain", g0: "#8a6e98", g1: "#4a4678", g2: "#262650", g3: "#0f1230", lit: "#9a90c4", mid: "#4a4a80", shade: "#14163a", edge: "#a07a9a" };
const AMBER = "#ffb347";
const GOLD = "#ffd27a";

// ---- shared scenery ----------------------------------------------------------------------------------------
function night(g, W, H, t, hz, o = {}) {
  dawnSky(g, W, H, { top: SKY.top, mid: SKY.mid, bottom: SKY.bottom, horizon: hz / H, band: SKY.band, bandA: 0.45 });
  K.stars(g, W, H, 19, 1.6, t, { yMax: hz * 0.9 });
  K.glow(g, W * (o.dawnX == null ? 0.5 : o.dawnX), hz + 20, W * 0.5, "#7a4a78", 0.25);
  if (o.clouds !== false) {
    g.save();
    g.globalAlpha *= 0.4;
    K.clouds(g, W, H, t, { seed: 191, color: "#3a3a6a", shade: "#141634", count: 4, y: hz * 0.5, spread: hz * 0.15, speed: 3, scale: 1.1 });
    g.restore();
  }
}
function ground(g, W, H, t, hz) {
  cloudRow(g, -200, W + 200, hz + 6, 20, FAR, 51, t, 1.5, 0.8);
  plain(g, hz, PLAIN);
}
// amber light from the ring falling on the plain (additive, falls off with distance)
function ringLight(g, x, y, r, k, flat = 0.35) {
  if (k <= 0.005) return;
  g.save();
  g.globalCompositeOperation = "lighter";
  g.translate(x, y);
  g.scale(1, flat);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
  gr.addColorStop(0, K.rgba("#ffb860", 0.5 * k));
  gr.addColorStop(0.4, K.rgba("#ff8a3a", 0.22 * k));
  gr.addColorStop(1, K.rgba("#ff7a1a", 0));
  g.fillStyle = gr;
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.restore();
}
const litAt = (t) => (i) => K.ease.out(K.seg(t, 28.4 + i * 0.95, 29.1 + i * 0.95));
const ignite = (t) => K.smooth(K.seg(t, 32.6, 36.5));

// the other side: sunrise, a white hill, and one small orange cat (for shots 5-7)
function sunrise(g, W, H, t, o = {}) {
  const hz = o.hz == null ? 330 : o.hz;
  const gr = g.createLinearGradient(0, 0, 0, hz);
  gr.addColorStop(0, "#6f8fc8");
  gr.addColorStop(0.4, "#d8a8b8");
  gr.addColorStop(0.78, "#ffb88a");
  gr.addColorStop(1, "#ffd27a");
  g.fillStyle = gr;
  g.fillRect(-W, -H, W * 3, hz + H);
  const sx = o.sunX == null ? 560 : o.sunX;
  K.sunGlow(g, sx, hz + 2, 16, GOLD, 0.9);
  K.glow(g, sx, hz, 420, "#ffcf8a", 0.4);
  // the sliver of sun on the horizon
  g.save();
  g.beginPath(); g.rect(sx - 60, hz - 30, 120, 30); g.clip();
  g.fillStyle = "#fff6e0";
  g.beginPath(); g.arc(sx, hz + 10, 18, 0, TAU); g.fill();
  g.restore();
  g.save();
  g.globalAlpha *= 0.6;
  K.clouds(g, W, H, t, { seed: 193, color: "#ffc2b0", shade: "#c890a8", count: 5, y: hz * 0.55, spread: hz * 0.2, speed: 4, scale: 1 });
  g.restore();
  // far misty hills
  K.hills(g, W, H, { y: hz + 14, amp: 26, color: "#b890a0", seed: 7, haze: "#ffc8a0", hazeAmt: 0.45 });
  K.fog(g, W, H, { y: hz + 18, h: 40, color: "#fff0e0", alpha: 0.6, wisps: false });
  // the near hill: a rounded mass, lit along the crest by the sun behind it, darker down the flank
  const hx = o.hillX == null ? 470 : o.hillX, hy = hz + 70;
  const hp = new Path2D();
  hp.moveTo(-W, H * 2);
  hp.lineTo(-W, hy + 190);
  hp.lineTo(hx - 420, hy + 150);
  hp.bezierCurveTo(hx - 260, hy + 70, hx - 150, hy - 4, hx, hy - 6);
  hp.bezierCurveTo(hx + 150, hy - 4, hx + 260, hy + 70, hx + 420, hy + 150);
  hp.lineTo(W * 2, hy + 190);
  hp.lineTo(W * 2, H * 2);
  hp.closePath();
  const hg = g.createLinearGradient(0, hy - 10, 0, hy + 220);
  hg.addColorStop(0, "#d9c2bc");
  hg.addColorStop(0.12, "#a88c9c");
  hg.addColorStop(0.5, "#6e5a78");
  hg.addColorStop(1, "#3a2e4c");
  g.fillStyle = hg;
  g.fill(hp);
  g.save();
  g.clip(hp);
  // the round form: a broad soft highlight on the crest toward the sun, shade on the far flank
  const lg = g.createRadialGradient(hx + 60, hy - 30, 10, hx + 60, hy - 30, 420);
  lg.addColorStop(0, "rgba(255,226,180,0.45)");
  lg.addColorStop(0.4, "rgba(255,206,170,0.14)");
  lg.addColorStop(1, "rgba(255,206,170,0)");
  g.fillStyle = lg;
  g.fillRect(-W, hy - 20, W * 3, H);
  const sg2 = g.createLinearGradient(hx - 500, 0, hx + 200, 0);
  sg2.addColorStop(0, "rgba(40,28,60,0.35)");
  sg2.addColorStop(1, "rgba(40,28,60,0)");
  g.fillStyle = sg2;
  g.fillRect(-W, hy - 20, W * 2 + hx, H);
  g.restore();
  // soft back-lit grass along the crest: a short dense back row and a taller, sparser front row
  g.save();
  g.translate(0, 0);
  g.save();
  g.clip(hp);
  g.translate(0, -8);
  g.globalAlpha *= 0.85;
  K.grass(g, hx - 150, hx + 150, hy + 4, { seed: 195, color: "#b29eae", light: "#e8cbbc", dark: "#8a7690", height: 9, t, wind: 0.4, density: 0.9 });
  g.restore();
  // the near grass on the flanks follows the hill down (tufts at different heights)
  for (let i = 0; i < 9; i++) {
    const u = (i + 0.5) / 9, x = hx - 380 + u * 760;
    const d = Math.abs(x - hx) / 420;
    const y = hy - 4 + Math.pow(d, 1.8) * 150 + 2;
    K.grass(g, x - 50, x + 50, y + 3, { seed: 196 + i, color: "#9a8498", light: "#e2c4b6", dark: "#5e4c6a", height: 10 + K.hash(i, 9) * 8, t, wind: 0.5, density: 0.55 });
  }
  g.restore();
  // a warm haze of light hanging over the crest (back-lit seed heads)
  g.save();
  g.globalCompositeOperation = "lighter";
  const cg = g.createLinearGradient(0, hy - 14, 0, hy + 8);
  cg.addColorStop(0, "rgba(255,220,170,0)");
  cg.addColorStop(0.6, "rgba(255,220,170,0.22)");
  cg.addColorStop(1, "rgba(255,220,170,0)");
  g.fillStyle = cg;
  g.fillRect(hx - 340, hy - 14, 680, 22);
  g.restore();
  g.save();
  g.globalAlpha *= 0.35;
  g.fillStyle = "#5a4058";
  g.beginPath();
  g.moveTo(hx - 8, hy);
  g.lineTo(hx + 8, hy);
  g.lineTo(hx - 30, hy + 120);
  g.lineTo(hx - 60, hy + 120);
  g.closePath();
  g.fill();
  g.restore();
  for (let i = 0; i < 26; i++) {
    const x = hx - 240 + K.hash(i, 195) * 500, y = hy + 4 + K.hash(i, 196) * 40 + Math.abs(x - hx) * 0.1;
    K.glow(g, x, y, 3 + K.hash(i, 197) * 3, "#fff6e0", 0.4 + 0.4 * Math.sin(t * 2 + i));
  }
  return { hx, hy };
}
const BISC = (o) => Object.assign({ pose: "sit", facing: 1, collar: true, bell: false, tail: 0.3, light: { x: 900, y: 300, color: "#ffd9a0", strength: 1.5 }, ground: "#5a4a6a" }, o);

// ---- shot 1 [0-10] close on the dark ring ---------------------------------------------------------------------
const SIT1 = (() => {
  const R = K.rng("f19sit1");
  const out = [];
  for (let i = 0; i < 46; i++) {
    const d = R();
    out.push({ x: -40 + R() * 330, y: 356 + d * d * 60, h: 10 + d * d * 30, ci: Math.floor(R() * 10), v: R() > 0.5 ? 1 : 0, side: R() > 0.5 ? 1 : -1 });
  }
  return out.sort((a, b) => a.y - b.y);
})();
function shot1(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 0, 10));
  const hz = 340;
  K.withCamera(g, W, H, { x: 480 + p * 30, y: 270 - p * 6, zoom: 1.0 + p * 0.08, shakeT: t, shakeAmt: 1.0 }, (c) => {
    night(c, W, H, t, hz, { dawnX: 0.62 });
    ground(c, W, H, t, hz);
    // the cats behind you: dim shapes on the plain, faint eye glints
    soft(c, W, H, "f19s1cats", 1.6, (q) => {
      for (const m of SIT1) catBack(q, m.x, m.y, m.h, m.ci, { v: m.v, side: m.side, rim: "#6a6a9a", amb: "#3a3a6a", shadowColor: "#0a0a20", alpha: 0.85 });
    });
    // you, in profile, looking at the ring; hood strings in the wind
    const kx = 250, ky = 452, kh = 220;
    kidShaded(c, W, H, kx, ky, kh, { view: "back", hood: false, bell: true, light: { x: 700, y: 200, color: "#aab8e0", strength: 0.9 } }, 0.5, "#141a40");
    c.save();
    c.strokeStyle = "rgba(240,236,220,0.85)";
    c.lineWidth = 1.4;
    for (let s = 0; s < 2; s++) {
      const x0 = kx + kh * 0.075 + s * 4, y0 = ky - kh * 0.77;
      c.beginPath();
      c.moveTo(x0, y0);
      for (let k = 1; k <= 6; k++) {
        const u = k / 6;
        c.lineTo(x0 + u * 14 + Math.sin(t * 7 + u * 4 + s) * 4 * u, y0 + u * 26 + Math.sin(t * 5.3 + u * 3 + s * 2) * 3 * u);
      }
      c.stroke();
    }
    c.restore();
    // the dark ring, close: big frosted stones; a faint ripple of cold air inside
    stoneRing(c, 650, 262, 215, t, { tilt: 0.05, silver: 0.85 + 0.15 * Math.sin(t * 1.1) });
    // frost glints on the stones
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + ((i % 5) / 5) * TAU + (K.hash(i, 3) - 0.5) * 0.25;
      const x = 650 + Math.cos(a) * 200 + (K.hash(i, 4) - 0.5) * 40, y = 262 + Math.sin(a) * 192 + (K.hash(i, 5) - 0.5) * 40;
      const tw = Math.max(0, Math.sin(t * (1.3 + K.hash(i, 6)) + i * 2.1));
      K.bellGlint(c, x, y, 5 + K.hash(i, 7) * 4, t, { color: "#e6eeff", strength: tw * tw * 0.8 });
    }
  });
  windMotes(g, W, H, t, { count: 70, seed: 191, speed: 180, color: "#d8e2ff", alpha: 0.45 });
}

// ---- shot 2 [10-22] insert: your hands untie the bell; you hold it up against the stars ------------------------
const SKIN_LIGHT = { color: "#b8c6ee", strength: 0.9 };
function stringAndBell(g, x0, y0, x1, y1, len, bx, by, size, t, o = {}) {
  // red string from the pinch to the bell, with the little orange fur tuft knotted on it
  g.save();
  g.strokeStyle = "#a8322e";
  g.lineWidth = Math.max(1.2, size * 0.07);
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo((x0 + bx) / 2 + (o.sag || 0), (y0 + by) / 2, bx, by - size * 0.55);
  g.stroke();
  if (x1 != null) {
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + len, x1, y1);
    g.stroke();
  }
  g.restore();
  if (o.tuft) {
    const tx = K.lerp(x0, bx, 0.3), ty = K.lerp(y0, by, 0.3);
    g.save();
    g.strokeStyle = "#e09040";
    g.lineWidth = 0.9;
    for (let i = 0; i < 9; i++) {
      const a = -0.6 + i * 0.15 + Math.sin(t * 3 + i) * 0.08;
      g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + Math.cos(a) * size * 0.35, ty + Math.sin(a) * size * 0.35); g.stroke();
    }
    g.restore();
  }
  bell(g, bx, by, size, { t, glint: o.glint == null ? 0.5 : o.glint, rot: Math.atan2(x0 - bx, by - y0) * 0.6 });
}
// where hand(..., {pose: "pinch", left: true}) puts the pinch, without drawing it
function handPinch(x, y, size, ang, left = false) {
  const u = size / 100, a = ang + Math.PI / 2, c = Math.cos(a), sn = Math.sin(a);
  const X = (left ? -23 : 23) * u, Y = -72 * u;
  return [x + X * c - Y * sn, y + X * sn + Y * c];
}
function handsShaded(c, W, H, key, shade, fn) {
  const L = inLayer(c, W, H, key, fn);
  L.g.save();
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  L.g.globalCompositeOperation = "source-atop";
  L.g.fillStyle = K.rgba("#1a2050", shade);
  L.g.fillRect(0, 0, L.canvas.width, L.canvas.height);
  L.g.restore();
  put(c, W, H, L, 1);
}
function shot2(g, W, H, t) {
  warmLit(t);
  if (t < 16) {
    // A: the knot at your left wrist; your right hand works it loose
    const p = K.ease.inOut(K.seg(t, 10, 16));
    K.withCamera(g, W, H, { x: 480, y: 270, zoom: 1.0 + p * 0.06, shakeT: t, shakeAmt: 1.2 }, (c) => {
      night(c, W, H, t, 470, { clouds: true, dawnX: 0.4 });
      soft(c, W, H, "f19s2bg", 5, (q) => {
        ground(q, W, H, t, 470);
        stoneRing(q, 760, 260, 200, t, { tilt: 0.05, silver: 0.7 });
      });
      const tug = K.ease.inOut(K.seg(t, 12.4, 15.2));
      const free = K.seg(t, 15.0, 15.8);
      const LW = [400, 420], la = -1.2; // left wrist: your own forearm rising from the bottom edge
      const rx = 650 + tug * 40, ry = 470 + tug * 8, ra = -Math.PI + 0.75; // right hand coming in from the lower right
      const pinch = handPinch(rx, ry, 190, ra, true);
      handsShaded(c, W, H, "f19hands", 0.26, (q) => {
        hand(q, LW[0], LW[1], 200, { angle: la, pose: "open", left: true, light: { x: 760, y: -40, color: SKIN_LIGHT.color, strength: 1 } });
        // the loop round the left wrist (loosening as the knot comes free)
        q.save();
        q.strokeStyle = "#a8322e";
        q.lineWidth = 3.2;
        q.beginPath();
        q.ellipse(LW[0] + 4, LW[1] + 6, 26 + free * 10, 9 + free * 4, la + Math.PI / 2, 0.15, Math.PI * 2 - 0.15);
        q.stroke();
        q.restore();
        const bx = K.lerp(LW[0] + 6, pinch[0] - 6, free), by = K.lerp(LW[1] + 52, pinch[1] + 74, free) + Math.sin(t * 2.4) * 3;
        stringAndBell(q, pinch[0], pinch[1], LW[0] + 26, LW[1] + 2, 4 - tug * 4, bx, by, 32, t, { tuft: true, glint: 0.5 });
        hand(q, rx, ry, 190, { angle: ra, pose: "pinch", left: true, light: { x: 760, y: -40, color: SKIN_LIGHT.color, strength: 1 } });
      });
    });
    return;
  }
  // B: low angle, the bell held up between finger and thumb against the starry sky
  const p = K.ease.inOut(K.seg(t, 16, 22));
  K.withCamera(g, W, H, { x: 480, y: 270 + p * 10, zoom: 1.04 + p * 0.05, shakeT: t, shakeAmt: 1.0 }, (c) => {
    night(c, W, H, t, 560, { clouds: false });
    K.glow(c, 480, 520, 600, "#5a3a6a", 0.35);
    soft(c, W, H, "f19s2bg2", 6, (q) => stoneRing(q, 220, 470, 260, t, { tilt: 0.05, silver: 0.6 }));
    bellUp(c, W, H, t, 0);
  });
}
// the raised hand and the bell (shared by shots 2B and 3)
function bellUp(c, W, H, t, ring) {
  const lift = K.ease.out(K.seg(t, 16, 18.5));
  const wx = 380, wy = 660 - lift * 230;
  const ang = -Math.PI / 2 + 0.35;
  handsShaded(c, W, H, "f19up", 0.22, (q) => hand(q, wx, wy, 240, { angle: ang, pose: "pinch", light: { x: 300, y: -200, color: "#c8d2f6", strength: 1 } }));
  const pp = handPinch(wx, wy, 240, ang);
  const px = pp[0], py = pp[1];
  // the swing: gentle before, sharp after the ring at 22 (damped)
  const k = t >= 22 ? Math.exp(-(t - 22) * 1.2) : 0;
  const swing = Math.sin(t * 2.1) * 0.06 + Math.sin((t - 22) * 9) * 0.5 * k;
  const len = 104;
  const bx = px + Math.sin(swing) * len, by = py + Math.cos(swing) * len;
  stringAndBell(c, px, py, null, null, 0, bx, by, 44, t, { tuft: true, glint: 0.7 + ring * 0.6 });
  return [bx, by];
}

// ---- shot 3 [22-28] you ring it: a visible ring of sound -------------------------------------------------------
function shot3(g, W, H, t) {
  warmLit(t);
  if (t < 24.5) {
    K.withCamera(g, W, H, { x: 480, y: 280, zoom: 1.09, shakeT: t, shakeAmt: 1.0 + Math.exp(-(t - 22) * 4) * 3 }, (c) => {
      night(c, W, H, t, 560, { clouds: false });
      K.glow(c, 480, 520, 600, "#5a3a6a", 0.35);
      soft(c, W, H, "f19s2bg2", 6, (q) => stoneRing(q, 220, 470, 260, t, { tilt: 0.05, silver: 0.6 }));
      const [bx, by] = bellUp(c, W, H, t, 1);
      const e = t - 22;
      for (let i = 0; i < 3; i++) {
        const u = e - i * 0.28;
        if (u <= 0) continue;
        soundRing(c, bx, by, 20 + u * 220, Math.exp(-u * 0.7) * (1 - i * 0.2), { width: 10 + u * 16 });
      }
      K.glow(c, bx, by, 120, "#ffe9b8", 0.6 * Math.exp(-e * 2.5));
    });
    return;
  }
  // wide: from behind you, the wave crossing the plain toward the ring
  const hz = 300;
  const e = t - 22;
  K.withCamera(g, W, H, { x: 480, y: 270, zoom: 1.0, shakeT: t, shakeAmt: 0.8 }, (c) => {
    night(c, W, H, t, hz, { dawnX: 0.5 });
    ground(c, W, H, t, hz);
    stoneRing(c, 480, 150, 95, t, { tilt: 0.06, silver: 0.85 + 0.6 * K.env(t, 27.2, 28, 0.3, 0.5) });
    for (let i = 0; i < 3; i++) {
      const u = e - i * 0.28;
      if (u <= 0) continue;
      const r = 40 + u * 210;
      soundRing(c, 470, 330, r, Math.exp(-u * 0.45) * (1 - i * 0.25) * 0.9, { flat: 0.18, width: 20 + u * 6 });
      soundRing(c, 470, 300, r * 0.9, Math.exp(-u * 0.6) * 0.35, { flat: 0.9, width: 30 });
    }
    kidShaded(c, W, H, 470, 360, 92, { view: "back", hood: false, bell: false, armUp: 1, light: { x: 470, y: 150, color: "#c8d2f6", strength: 0.8 } }, 0.5, "#141a40");
    const bx = 470 + 15 * 0.92, by = 360 - 110 * 0.92 + 9 + Math.sin(t * 5) * 0.8;
    c.save(); c.strokeStyle = "#8a2a26"; c.lineWidth = 0.8; c.beginPath(); c.moveTo(bx, by - 8); c.lineTo(bx, by - 2); c.stroke(); c.restore();
    bell(c, bx, by, 4.5, { t, glint: 0 });
    K.glow(c, bx, by, 34, "#ffe9b8", 0.25 + 0.45 * Math.exp(-(t - 24.5) * 0.8));
    K.bellGlint(c, bx - 1, by - 1, 6, t, { strength: 0.6 });
    // cats either side of you, waiting
    for (let i = 0; i < 22; i++) {
      const side = i % 2 ? 1 : -1;
      const d = K.hash(i, 9);
      const x = 470 + side * (90 + K.hash(i, 3) * 420), y = 345 + d * d * 190, h = 14 + d * d * 90;
      catBack(c, x, y, h, i, { v: i % 2, side, rim: "#8a8ab8", amb: "#3a3a6a", shadowColor: "#0a0a20" });
    }
  });
  windMotes(g, W, H, t, { count: 40, seed: 193, speed: 140, color: "#d8e2ff", alpha: 0.3 });
}

// ---- shot 4 [28-38] the portal answers (wide, side-on) ---------------------------------------------------------
const CROWD4 = (() => {
  const out = [];
  const R = K.rng("f19crowd4");
  for (let i = 0; i < 64; i++) {
    const d = R();
    const y = 330 + d * d * 210;
    const s = Math.min(50, 6 + d * d * 46);
    out.push({ x: 580 + R() * 520 - (1 - d) * 60, y, s, ci: Math.floor(R() * 10), ph: R() });
  }
  return out.sort((a, b) => a.y - b.y);
})();
// the profile crowd lies in loaves (paws tucked, tail curled round) facing the ring
const LOAF = (ci, gl) => ({ pose: "loaf", facing: -1, coat: CROWD[ci], collar: false, bell: false, tail: 0.2, t: 0, eyesGlow: gl, pupil: 1, light: { dx: 1, dy: -0.3, color: gl ? "#ffc070" : "#8a90c0", strength: gl ? 1.0 : 0.6 }, ground: "#0a0a20" });
function catSit4(c, m, glowOn) {
  spriteCat(c, m.x, m.y, m.s * 1.15, LOAF(m.ci, glowOn ? 1 : 0), "f19loaf:" + m.ci + ":" + (glowOn ? 1 : 0), 1);
}
const WISH4 = (() => {
  const out = [];
  for (let ci = 0; ci < 10; ci++) for (const s of [10, 40]) for (const gl of [0, 1]) out.push({ size: s, steps: 1, key: "f19loaf:" + ci + ":" + gl, o: LOAF(ci, gl) });
  return out;
})();
// the lit stones and the shot-4 crowd: baked a little per frame during shots 2-3 (no stall at the cut)
let LIT_WARM = 0;
function warmLit(t) {
  warmCats(WISH4, 1);
  if (LIT_WARM < 1 && t > 23) {
    const L = K.layer(8, 8, "f19warm");
    stoneRing(L.g, 4, 4, 2, t, { lit: () => 1 });
    LIT_WARM++;
  }
}
function shot4(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 28, 38));
  const hz = 318;
  const RX = 300, RY = 215, RR = 150;
  const ig = ignite(t);
  const lit = litAt(t);
  const anyLit = K.clamp((t - 28.4) / 4.75);
  K.withCamera(g, W, H, { x: 480 - p * 20, y: 270, zoom: 1.0 + p * 0.05, shakeT: t, shakeAmt: 1.0 + ig * 0.6 }, (c) => {
    night(c, W, H, t, hz, { dawnX: 0.3 });
    ground(c, W, H, t, hz);
    ringLight(c, RX, 360, 700, anyLit * 0.6 + ig * 0.8);
    if (ig > 0.01) {
      K.godRays(c, RX, RY, W, H, { color: "#ffd9a0", count: 14, strength: 0.4 * ig, t, angle: 0, spread: TAU, length: 900, seed: 194 });
      portalCore(c, RX, RY, RR * 0.84, t, ig * K.ease.back(K.seg(t, 32.6, 34.5)));
    }
    stoneRing(c, RX, RY, RR, t, { tilt: 0.06, silver: 0.8 * (1 - anyLit), lit });
    K.pawprints(c, ringTrail(RX, RY, RR, 30.2, t, 0.06, 26, 0.17), 1);
    // you, in silhouette, rim-lit by the ring
    const kx4 = 540, ky4 = 430, kh4 = 170;
    kidShaded(c, W, H, kx4, ky4, kh4, { view: "side", facing: -1, hood: false, bell: false, walk: false, armUp: 1, light: { x: RX, y: RY, color: "#ffc070", strength: 0.4 + 1.4 * Math.max(anyLit, ig) } }, 0.55 - 0.25 * ig, "#141a40");
    {
      const bx = kx4 - 10 * kh4 / 100, by = ky4 - 110 * kh4 / 100 + 16 + Math.sin(t * 2.2) * 1.2;
      c.save(); c.strokeStyle = "#8a2a26"; c.lineWidth = 1.1; c.beginPath(); c.moveTo(bx, by - 14); c.lineTo(bx, by - 4); c.stroke(); c.restore();
      bell(c, bx, by, 8, { t, glint: 0.3 + 0.7 * Math.max(anyLit, ig) });
      K.glow(c, bx, by, 26, "#ffe2a0", 0.15 + 0.35 * Math.max(anyLit, ig));
    }
    // the crowd, side-on, facing the ring; eyes take the light
    const glowOn = t >= 32.2;
    const crowd = inLayer(c, W, H, "f19s4crowd", (q) => {
      for (const m of CROWD4) catSit4(q, m, glowOn);
      // warm light falling across them from the ring
      q.save();
      q.globalCompositeOperation = "source-atop";
      const gr = q.createRadialGradient(RX, RY, 50, RX, RY, 900);
      gr.addColorStop(0, K.rgba("#ffb860", 0.45 * Math.max(anyLit * 0.5, ig)));
      gr.addColorStop(1, K.rgba("#ff8a3a", 0));
      q.fillStyle = gr;
      q.fillRect(-200, -200, W + 400, H + 400);
      q.fillStyle = K.rgba("#0c0e28", 0.45 * (1 - ig));
      q.fillRect(-200, -200, W + 400, H + 400);
      q.restore();
    });
    put(c, W, H, crowd, 1);
    // eye-shine: two tiny glows per cat, turned toward the ring
    const eye = K.smooth(K.seg(t, 31.5, 34));
    if (eye > 0.01) {
      for (const m of CROWD4) {
        const ex = m.x - m.s * 1.15 * 0.73, ey = m.y - m.s * 1.15 * 0.82;
        const blink = K.hash(Math.floor(t * 0.7 + m.ph * 5), m.ci) > 0.93 ? 0.2 : 1;
        K.glow(c, ex, ey, m.s * 0.14 + 1.5, "#d8ff8a", 0.8 * eye * blink);
      }
    }
  });
  K.dust(g, W, H, t, { seed: 194, count: 30, color: "#ffd9a0", size: 1.5, alpha: 0.5 * ig, area: [0, 60, 700, 420] });
}

// the portal's heart: a soft disc of white-gold light (not the kit's swirl arcs)
function portalCore(g, x, y, r, t, k) {
  if (k <= 0.005) return;
  g.save();
  g.globalCompositeOperation = "lighter";
  g.translate(x, y);
  g.scale(1, 0.94);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
  gr.addColorStop(0, K.rgba("#fff8e8", 0.95 * k));
  gr.addColorStop(0.5, K.rgba("#ffe2a0", 0.6 * k));
  gr.addColorStop(0.9, K.rgba("#ffb347", 0.3 * k));
  gr.addColorStop(1, K.rgba("#ff8a3a", 0));
  g.fillStyle = gr;
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  // slow veils of light turning inside
  g.rotate(t * 0.15);
  for (let i = 0; i < 3; i++) {
    g.rotate((TAU / 3) * i);
    const vg = g.createLinearGradient(-r, 0, r, 0);
    vg.addColorStop(0, K.rgba("#ffd9a0", 0));
    vg.addColorStop(0.5, K.rgba("#ffd9a0", 0.12 * k));
    vg.addColorStop(1, K.rgba("#ffd9a0", 0));
    g.fillStyle = vg;
    g.beginPath(); g.ellipse(0, 0, r * 0.8, r * 0.18, 0, 0, TAU); g.fill();
  }
  g.restore();
  K.glow(g, x, y, r * 2.6, "#ffb860", 0.35 * k);
}
// ---- shots 5-6 [38-56] through the ring: sunrise, and him ------------------------------------------------------
function throughRing(g, W, H, t) {
  if (t > 52) warmBack(CROWD7.flatMap((m) => [false, true].map((up) => [m.x, m.y, m.h, m.ci, { v: m.v, side: m.side, tailUp: up, rim: "#ffd9a0", amb: "#2a2440", light: { x: 480, y: 262 } }])), 2);
  const z = 1 + K.ease.inOut(K.seg(t, 38, 56)) * 0.14;
  const focus = 1 - K.ease.inOut(K.seg(t, 46, 52));
  const RX = 480, RY = 262, RR = 330;
  K.withCamera(g, W, H, { x: 480 + (z - 1) * 60, y: 270 - (z - 1) * 40, zoom: z, shakeT: t, shakeAmt: 0.9 }, (c) => {
    // the near side: dark plain lit gold from the ring
    night(c, W, H, t, 470, { clouds: false });
    ground(c, W, H, t, 470);
    ringLight(c, RX, 480, 900, 1);
    // the far side, inside the ring
    const inner = inLayer(c, W, H, "f19inner", (q) => {
      q.save();
      q.beginPath();
      q.ellipse(RX, RY, RR * 0.86, RR * 0.86 * 0.94, 0, 0, TAU);
      q.clip();
      // parallax: the far world moves less than the ring
      const { hx, hy } = sunrise(q, W, H, t, { hz: 330, sunX: 590, hillX: 500 });
      const turn = K.ease.inOut(K.seg(t, 48.6, 50.4));
      const mouth = K.env(t, 46.0, 46.8, 0.12, 0.3);
      const bs = K.lerp(40, 65, K.ease.inOut(K.seg(t, 46, 52)));
      // 3/4 from behind, head toward the sun: the bent left ear against the sky; tail curled round his paws
      K.drawCat(q, hx + 4, hy - 1, bs, BISC({ headTurn: -0.55 + turn * 0.75, mouth, t, tail: 0, tailUp: 0, ears: 0.6, light: { x: 590, y: 300, color: "#ffe2a8", strength: 2 } }));
      K.glow(q, hx + 10, hy - bs * 0.9, bs * 1.1, "#ffe0a0", 0.25);
      q.restore();
    });
    put(c, W, H, inner, 1, focus * 4);
    // shimmering inner edge of the portal
    c.save();
    c.globalCompositeOperation = "lighter";
    c.translate(RX, RY);
    c.scale(1, 0.94);
    const eg = c.createRadialGradient(0, 0, RR * 0.7, 0, 0, RR * 0.95);
    eg.addColorStop(0, "rgba(255,240,200,0)");
    eg.addColorStop(0.65, K.rgba("#ffe7a8", 0.2 + 0.06 * Math.sin(t * 3)));
    eg.addColorStop(1, "rgba(255,180,80,0)");
    c.fillStyle = eg;
    c.beginPath(); c.arc(0, 0, RR * 0.95, 0, TAU); c.fill();
    c.restore();
    stoneRing(c, RX, RY, RR, t, { tilt: 0.06, silver: 0, lit: () => 0.62, glowScale: 0.6 });
    K.pawprints(c, ringTrail(RX, RY, RR * 1.02, 0, 60, 0.06, 18, 0.1).map((q, i) => Object.assign(q, { alpha: 0.35 + 0.3 * Math.sin(t * 2 + i * 0.6) })), 0.6);
  });
  // your hand with the bell, solid and framed at the bottom right, lowering out of frame 47-51
  const lower = K.ease.inOut(K.seg(t, 47, 51));
  if (lower < 1) {
    const L = inLayer(g, W, H, "f19hand", (q) => {
      const wx = 790, wy = K.lerp(420, 600, lower) + 70;
      const ang = -Math.PI / 2 - 0.2;
      hand(q, wx, wy, 210, { angle: ang, pose: "pinch", light: { x: 480, y: 262, color: "#ffc070", strength: 1.6 } });
      const pp = handPinch(wx, wy, 210, ang);
      const sw = Math.sin(t * 1.7) * 0.05;
      const bx = pp[0] + Math.sin(sw) * 70, by = pp[1] + Math.cos(sw) * 70;
      q.save(); q.strokeStyle = "#a8322e"; q.lineWidth = 2.2; q.beginPath(); q.moveTo(pp[0], pp[1]); q.lineTo(bx, by - 18); q.stroke(); q.restore();
      bell(q, bx, by, 34, { t, glint: 0.9, lx: -0.7, ly: -0.5 });
    });
    put(g, W, H, L, 1, (1 - focus) * 3);
  }
}

// ---- shot 7 [56-64] you step into the light ---------------------------------------------------------------------
const CROWD7 = (() => {
  const out = [];
  const R = K.rng("f19crowd7");
  for (let i = 0; i < 40; i++) {
    const d = R();
    out.push({ x: (R() - 0.5) * 1200 + 480, y: 380 + d * d * 200, h: 16 + d * d * 140, ci: Math.floor(R() * 10), v: R() > 0.5 ? 1 : 0, side: R() > 0.5 ? 1 : -1, jit: R() });
  }
  const list = out.filter((m) => Math.abs(m.x - 480) > 70 + m.h * 0.3).sort((a, b) => a.y - b.y);
  // a wave from the front (nearest) to the back, 57 -> 61
  list.forEach((m) => { m.up = 57 + (1 - (m.y - 380) / 200) * 3.4 + m.jit * 0.5; });
  return list;
})();
function shot7(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 56, 64));
  const hz = 330;
  const RX = 480, RY = 262, RR = 190;
  K.withCamera(g, W, H, { x: 480, y: 270 - p * 20, zoom: 1.0 + p * 0.12, shakeT: t, shakeAmt: 1.2 }, (c) => {
    night(c, W, H, t, hz, { clouds: false });
    ground(c, W, H, t, hz);
    ringLight(c, RX, 360, 1100, 1.4);
    // inside: sunrise, bright
    c.save();
    c.beginPath(); c.ellipse(RX, RY, RR * 0.86, RR * 0.81, 0, 0, TAU); c.clip();
    sunrise(c, W, H, t, { hz: 300, sunX: 470, hillX: 470 });
    c.fillStyle = K.rgba("#fff6e0", 0.35 + p * 0.4);
    c.fillRect(0, 0, W, H);
    c.restore();
    K.godRays(c, RX, RY + 20, W, H, { color: "#ffe2b0", count: 16, strength: 0.45 + p * 0.3, t, angle: Math.PI / 2, spread: TAU * 0.9, length: 900, seed: 197 });
    stoneRing(c, RX, RY, RR, t, { tilt: 0.06, silver: 0, lit: () => 0.8 });
    // you walk into it
    const w = K.ease.inOut(K.seg(t, 56.5, 63.5));
    kidShaded(c, W, H, RX, K.lerp(500, 372, w), K.lerp(230, 95, w), { view: "back", hood: false, walk: true, phase: t * 0.85, bell: false, light: { x: RX, y: RY, color: "#ffd9a0", strength: 1.6 } }, 0.62, "#1a1430");
    // the cats rise to follow (silhouettes against the light)
    for (const m of CROWD7) {
      const rise = K.ease.inOut(K.seg(t, m.up, m.up + 0.7));
      // once up, they pad after you toward the light
      const go = K.ease.in(K.seg(t, m.up + 0.5, m.up + 4));
      const step = rise > 0.9 ? Math.abs(Math.sin((t - m.up) * 6.5 + m.jit * 6)) * m.h * 0.03 : 0;
      const mx = K.lerp(m.x, RX + (m.x - RX) * 0.75, go), my = K.lerp(m.y, m.y - (m.y - 360) * 0.35, go) - rise * m.h * 0.04 - step;
      const mh = m.h * (1 - go * 0.25);
      catBack(c, mx, my, mh, m.ci, { v: m.v, side: m.side, rise, tailUp: rise > 0.5, rim: "#ffd9a0", amb: "#2a2440", shadowColor: "#0a0a20", light: { x: RX, y: RY } });
    }
  });
  K.dust(g, W, H, t, { seed: 197, count: 40, color: "#fff0c8", size: 1.6, alpha: 0.6 });
}

// ---- assembly ----------------------------------------------------------------------------------------------------
const SHOTS = [[0, 10, shot1], [10, 22, shot2], [22, 28, shot3], [28, 38, shot4], [38, 56, throughRing], [56, 64.01, shot7]];

const L19 = lines([
  [3.0, 7.0, "The portal was dark. Cold.", { rate: 0.88, pitch: 0.97 }],
  [11.0, 15.5, "You had carried his bell all this way."],
  [16.0, 20.5, "Maybe it was never just a bell."],
  [24.0, 27.5, "You rang it.", { rate: 0.86, pitch: 1.0 }],
  [30.0, 35.0, "And the light came back. All of it."],
  [39.5, 44.5, "On the other side, sunrise. And a small orange shape."],
  [47.5, 52.5, "That meow. You'd know it anywhere."],
  [57.5, 62.0, "One more cat to find."],
]);

export const film = {
  id: 19,
  title: "The Bell",
  chapter: "Chapter 19",
  unlockAt: 95,
  duration: D,
  poster: 44,
  tagline: "One ring. That's all it takes.",
  subs: L19.subs,
  voice: L19.voice,
  score: { mood: "epic", key: "D", bpm: 72, cues: [[6, "drop"], [22, "bell"], [28, "swell"], [38, "hit"], [46, "meow"], [56, "swell"]] },
  draw(g, t, W, H) {
    g.save();
    if (W !== 960 || H !== 540) g.scale(W / 960, H / 540);
    W = 960; H = 540;
    try {
      g.fillStyle = "#070b22";
      g.fillRect(0, 0, W, H);
      for (const [a, b, fn] of SHOTS) if (t >= a && t < b) { fn(g, W, H, t); break; }
      if (t >= 64.01) shot7(g, W, H, 64);
      const warm = K.smooth(K.seg(t, 30, 38));
      K.bloom(g, t >= 38 && t < 56 ? 0.18 : 0.28 + warm * 0.2);
      K.grade(g, W, H, { tint: K.mix("#5a6ab8", "#ffc88a", warm), alpha: 0.16, mode: "soft-light", shadows: "#2a2a6a", shadowAlpha: 0.12 * (1 - warm * 0.5) });
      if (t >= 38) K.lensFlare(g, 590 + (t < 56 ? 0 : -110), t < 56 ? 300 : 300, W, H, 0.25);
      K.vignette(g, W, H, 0.62 - warm * 0.08);
      if (t >= 38 && t < 56) {
        const ba = 0.35 * K.env(t, 38, 56, 0.6, 0.6);
        const bg = g.createLinearGradient(0, H * 0.8, 0, H);
        bg.addColorStop(0, "rgba(0,0,0,0)");
        bg.addColorStop(1, K.rgba("#000000", ba));
        g.fillStyle = bg;
        g.fillRect(0, H * 0.8, W, H * 0.2);
      }
      K.grain(g, W, H, t, 0.035);
      const ta = K.env(t, 1.5, 5.5, 1.0, 1.2);
      if (ta > 0) K.title(g, W, H, "The Bell", "Chapter 19", ta, { glow: "#cfd6e6", y: H * 0.36 });
      K.fadeBlack(g, W, H, 1 - K.smooth(K.seg(t, 0, 1.4)));
      // the white-gold flash on the hit, then the white-out at the end
      K.fadeColor(g, W, H, t >= 38 ? Math.exp(-(t - 38) * 1.6) : 0, "#fff3d6");
      K.fadeColor(g, W, H, K.smooth(K.seg(t, 60.2, 63.6)), "#fff6e6");
      K.letterbox(g, W, H, 1);
    } finally {
      g.restore();
    }
  },
};
