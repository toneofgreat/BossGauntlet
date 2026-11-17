// films/f13.js - Chapter 13 "The Lantern Cats" (FILMS.md f13). The navy Void begins to fill with
// small warm lights: every cat you found sits glowing like a paper lantern, and together they form a
// long road of light toward a cool cyan paw-portal at its vanishing point. The Shadow stands guard
// just off the road. draw(g, t, W, H) is a pure function of t; lantern cats are cached sprites.
import * as K from "../filmkit.js";
import { povHand, hairOver } from "./lib1214.js";

const D = 64;
const VW = 960, VH = 540;
const XF = 0.9;
const BAR = Math.round(VH * 0.085);

const NAVY = "#0b0f24";
const GOLD = "#ffcf6a";
const CYAN = "#9be7ff";
const EDGE = "#bcd6ff";

// ---- the void: navy sky, faint nebula, and a black mirror floor -----------------------------------------
function skySprite() {
  return K.sprite("f13:sky", 1300, 760, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#05071a");
    bg.addColorStop(0.5, "#0b0f24");
    bg.addColorStop(0.62, "#121834");
    bg.addColorStop(0.7, "#0d1128");
    bg.addColorStop(1, "#04050e");
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const R = K.rng("f13neb");
    for (let i = 0; i < 34; i++) {
      const x = R() * w, y = h * (0.1 + R() * 0.5), r = 90 + R() * 240;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const c = i % 3 ? "#1d2a5e" : "#2a2a66";
      gr.addColorStop(0, K.rgba(c, 0.18 + R() * 0.1));
      gr.addColorStop(1, K.rgba(c, 0));
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 700; i++) {
      const x = R() * w, y = Math.pow(R(), 1.4) * h * 0.62, b = R();
      g.fillStyle = K.rgba(b > 0.7 ? "#e4ecff" : "#9fb0ff", 0.15 + b * 0.5);
      const s = b > 0.98 ? 1.5 : 0.8;
      g.fillRect(x, y, s, s);
    }
  });
}
function voidBg(g, ox, oy, hor) {
  ox = K.clamp(ox, 0, 165);
  g.drawImage(skySprite(), -170 - ox, hor - 0.62 * 760 - oy * 0.3, 1300, 760);
  // mirror floor: fades in over ~24 px below the horizon (no hard bright line), very dark below
  const top = hor - 10;
  const fl = g.createLinearGradient(0, top, 0, VH);
  const u = (v) => K.clamp(v / (VH - top));
  fl.addColorStop(0, "rgba(16,22,50,0)");
  fl.addColorStop(u(24), "rgba(16,22,50,0.9)");
  fl.addColorStop(u(70), "rgba(9,12,30,0.98)");
  fl.addColorStop(1, "rgba(3,4,12,1)");
  g.fillStyle = fl;
  g.fillRect(0, top, VW, VH - top + 2);
  K.glow(g, VW / 2, hor, 520, "#2a3a80", 0.18);
}
function horizonMist(g, hor, t, a = 1) {
  K.fog(g, VW, VH, { y: hor - 30, h: 90, color: "#222a54", alpha: 0.32 * a, t, seed: 3 });
}
// many small out-of-focus lights far behind the road
function farBokeh(g, hor, t, seed, n, a = 1) {
  for (let i = 0; i < n; i++) {
    const h1 = K.hash(i, seed), h2 = K.hash(i, seed + 1), h3 = K.hash(i, seed + 2);
    const x = h1 * (VW + 80) - 40;
    const y = hor - 34 + Math.pow(h2, 1.6) * 48;
    const r = 3 + h3 * 8;
    const tw = 0.75 + 0.25 * Math.sin(t * (0.6 + h3) + i);
    bokeh(g, x, y, r, (0.1 + h3 * 0.22) * tw * a, h2 > 0.85 ? "#cfe4ff" : GOLD);
  }
}

// ---- lantern cats -----------------------------------------------------------------------------------------
const SHADOW_COAT = {
  base: "#0d0f18", light: "#1b2030", dark: "#06070c", stripe: "#0a0c14", tip: "#05060a", belly: "#0d0f18", white: "#0d0f18",
  pattern: "solid", bib: false, socks: false, muzzle: false, iris: "#7fa6c8", irisInner: "#a8c8e0",
  nose: "#1a1c26", noseEdge: "#0a0b10", innerEar: "#1c1e2a", bentEar: false,
};
const LCOATS = ["grey", "cream", "black", "siamese", "tuxedo", "calico"];
const CS = 84; // sprite shoulder size (medium fur detail: cheaper to paint, softer at road scale)
const SPW = 252, SPH = 194, SGX = 126, SGY = 180; // sprite box + ground point
function lanternSprite(coat, facing, pose) {
  return K.sprite(`f13:lc:${coat}:${facing}:${pose}`, SPW, SPH, (g) => {
    K.drawCat(g, SGX, SGY, CS, {
      pose, facing, headTurn: pose === "loaf" ? 0.35 : 0.25, coat: K.COATS[coat], collar: false, bell: false, shadow: false, t: 0, blink: 0.3,
      light: { x: SGX - facing * 67, y: SGY - 218, color: "#fff0c8", strength: 1.2 },
    });
    lanternize(g, SGX + facing * CS * 0.22, SGY - CS * 0.82, CS);
    shadowSide(g, SGX, SGY - CS * 0.8, CS, -facing);
  });
}
// tint an already-painted cat so it glows from inside like a paper lantern (source-atop keeps alpha);
// the core sits at the chest and is soft, so the coat colour and stripes still read
function lanternize(g, cx, cy, size, k = 1) {
  g.save();
  g.globalCompositeOperation = "source-atop";
  g.globalAlpha = k;
  const gr = g.createRadialGradient(cx, cy, size * 0.05, cx, cy, size * 1.25);
  gr.addColorStop(0, "rgba(255,240,200,0.3)");
  gr.addColorStop(0.4, "rgba(255,204,128,0.2)");
  gr.addColorStop(0.8, "rgba(240,150,70,0.12)");
  gr.addColorStop(1, "rgba(160,80,30,0.08)");
  g.fillStyle = gr;
  g.fillRect(cx - size * 2, cy - size * 2, size * 4, size * 4);
  g.restore();
}
// darken the side of a cat away from its light (dir = +1: the right side is in shadow)
function shadowSide(g, cx, cy, size, dir, a = 0.5) {
  g.save();
  g.globalCompositeOperation = "source-atop";
  const gr = g.createLinearGradient(cx - dir * size * 1.3, 0, cx + dir * size * 1.3, 0);
  gr.addColorStop(0, "rgba(8,6,20,0)");
  gr.addColorStop(0.55, "rgba(8,6,20,0)");
  gr.addColorStop(1, `rgba(8,6,20,${a})`);
  g.fillStyle = gr;
  g.fillRect(cx - size * 2, cy - size * 2, size * 4, size * 4);
  g.restore();
}
function lanternCat(g, x, y, size, o = {}) {
  // size = shoulder px; draws the halo, the cat sprite and its mirror reflection
  const coat = o.coat || "grey", facing = o.facing || 1, pose = o.pose || "sit";
  const a = o.alpha == null ? 1 : o.alpha;
  const br = o.bright == null ? 1 : o.bright;
  if (a <= 0.01 || size < 0.5) return;
  const s = size / CS;
  const pulse = 0.85 + 0.15 * Math.sin((o.t || 0) * 1.7 + (o.seed || 0) * 2.3);
  if (size < 7) {
    K.glow(g, x, y - size, size * 5, GOLD, 0.3 * a * pulse * br);
    K.glow(g, x, y - size, size * 1.3, "#fff4d6", 0.65 * a * br);
    K.glow(g, x, y + size * 0.6, size * 3, GOLD, 0.14 * a * br);
    return;
  }
  const spr = lanternSprite(coat, facing, pose);
  K.glow(g, x, y - size * 0.8, size * 3.2, GOLD, 0.28 * a * pulse * br * K.clamp(size / 45, 0.3, 1));
  g.save();
  g.globalAlpha *= a;
  g.save();
  g.translate(x, y);
  g.scale(1, -0.9);
  g.globalAlpha *= 0.2;
  g.drawImage(spr, -SGX * s, -SGY * s, SPW * s, SPH * s);
  g.restore();
  g.drawImage(spr, x - SGX * s, y - SGY * s, SPW * s, SPH * s);
  g.restore();
  K.glow(g, x + facing * size * 0.2, y - size * 0.8, size * 0.9, "#fff1cc", 0.24 * a * pulse * br);
  const gs = K.glowSprite(GOLD);
  g.save();
  g.globalCompositeOperation = "lighter";
  g.globalAlpha *= 0.16 * a * br;
  g.drawImage(gs, x - size * 0.6, y, size * 1.2, size * 2.6);
  g.restore();
}
function bokehSprite(color) {
  // a soft, even disc with no bright edge ring
  return K.sprite("f13:bokeh2:" + color, 64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 31);
    gr.addColorStop(0, K.rgba(color, 0.5));
    gr.addColorStop(0.7, K.rgba(color, 0.42));
    gr.addColorStop(0.9, K.rgba(color, 0.18));
    gr.addColorStop(1, K.rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}
function bokeh(g, x, y, r, a, color = GOLD) {
  if (a <= 0.01) return;
  g.save();
  g.globalCompositeOperation = "lighter";
  g.globalAlpha *= a;
  g.drawImage(bokehSprite(color), x - r, y - r, r * 2, r * 2);
  g.restore();
}

// ---- the Shadow: tall, thin, long-legged, standing just off the road with its back to us, smoky edges,
// a cool backlit rim from the portal ------------------------------------------------------------------------
// a tall, long-legged cat standing with its back to us (rump, hind legs, a glimpse of the forelegs,
// the head and both ears above the shoulders, a long tail curving out to one side). size = shoulder px.
function shadowPath(x, y, s, t) {
  const parts = [];
  let p = null;
  const np = () => { p = new Path2D(); parts.push(p); return p; };
  const leg = (lx, top, w0, w1, bend) => {
    K.tube(np(), [x + lx * s, y - top * s, x + (lx + bend) * s, y - 0.32 * s, x + (lx + bend * 0.4) * s, y - 0.02 * s], [w0 * s, w1 * s * 1.1, w1 * s], 4, true, true);
  };
  leg(-0.16, 0.66, 0.2, 0.075, -0.03); // hind legs (hocks)
  leg(0.16, 0.66, 0.2, 0.075, 0.03);
  leg(-0.07, 0.6, 0.1, 0.06, 0.0); // forelegs, further away, between them
  leg(0.08, 0.6, 0.1, 0.06, 0.0);
  // rump and haunches
  K.ellipsePath(np(), x - 0.13 * s, y - 0.74 * s, 0.17 * s, 0.24 * s, 0.12);
  K.ellipsePath(np(), x + 0.13 * s, y - 0.74 * s, 0.17 * s, 0.24 * s, -0.12);
  K.ellipsePath(np(), x, y - 0.86 * s, 0.22 * s, 0.2 * s, 0);
  // shoulders + neck rising behind the rump
  K.ellipsePath(np(), x, y - 1.04 * s, 0.17 * s, 0.13 * s, 0);
  K.tube(np(), [x, y - 1.0 * s, x + 0.01 * s, y - 1.18 * s], [0.2 * s, 0.17 * s], 3, true, true);
  // head from behind with two ears (the left tilted a touch)
  K.ellipsePath(np(), x + 0.01 * s, y - 1.3 * s, 0.15 * s, 0.13 * s, 0);
  const ear = (ex, dir, h) => {
    np();
    p.moveTo(x + (ex - 0.07 * dir) * s, y - 1.34 * s);
    p.quadraticCurveTo(x + (ex + 0.0 * dir) * s, y - (1.42 + h * 0.6) * s, x + (ex + 0.03 * dir) * s, y - (1.44 + h) * s);
    p.quadraticCurveTo(x + (ex + 0.07 * dir) * s, y - 1.4 * s, x + (ex + 0.08 * dir) * s, y - 1.3 * s);
    p.closePath();
  };
  ear(-0.07, -1, 0.1);
  ear(0.09, 1, 0.12);
  // the long tail: down from the rump, then out and up to the right, tip curling (slow sway)
  const sw = Math.sin(t * 0.6) * 0.04;
  K.tube(np(), [x + 0.02 * s, y - 0.84 * s, x + 0.1 * s, y - 0.5 * s, x + 0.3 * s, y - 0.3 * s, x + (0.48 + sw) * s, y - 0.42 * s, x + (0.52 + sw) * s, y - 0.62 * s], [0.08 * s, 0.07 * s, 0.065 * s, 0.055 * s, 0.04 * s], 4, true, true);
  return parts;
}
function shadowCat(g, x, y, size, t, light) {
  const s = size;
  const path = shadowPath(x, y, s, t);
  // mist lit by the portal behind it, so the dark shape reads against it
  K.glow(g, x + s * 0.1, y - s * 0.8, s * 2.4, "#4a5c9a", 0.3);
  K.glow(g, x, y - s * 0.2, s * 1.4, "#5a6cb0", 0.16);
  const L = K.layer(VW, VH, "f13shadow");
  L.g.fillStyle = "#080a12";
  for (const q of path) L.g.fill(q);
  // a cool rim on the side facing the portal: the silhouette shifted toward the light, minus itself
  const dir = Math.sign(light.x - x) || 1;
  const E = K.layer(VW, VH, "f13shadowE");
  E.g.save();
  E.g.translate(dir * Math.max(1.4, s * 0.035), -Math.max(0.8, s * 0.02));
  E.g.fillStyle = EDGE;
  for (const q of path) E.g.fill(q);
  E.g.restore();
  E.g.save();
  E.g.setTransform(1, 0, 0, 1, 0, 0);
  E.g.globalCompositeOperation = "destination-out";
  E.g.drawImage(L.canvas, 0, 0);
  E.g.restore();
  E.g.globalCompositeOperation = "source-over";
  // smoke: soft blurred copies drifting upward, then the body at ~70% so its edges stay smoky
  g.save();
  g.translate(0, -3 - Math.sin(t * 0.7) * 2);
  K.dof(g, L.canvas, 8, 0.45);
  g.restore();
  K.dof(g, L.canvas, 3, 0.7);
  g.save();
  g.globalAlpha = 0.9;
  g.drawImage(L.canvas, 0, 0, VW, VH);
  g.restore();
  g.save();
  g.globalCompositeOperation = "lighter";
  K.dof(g, E.canvas, 0.6, 0.6);
  K.dof(g, E.canvas, 4, 0.4);
  g.restore();
  // its faint reflection on the mirror floor
  g.save();
  g.translate(0, y * 2);
  g.scale(1, -1);
  K.dof(g, L.canvas, 4, 0.2);
  g.restore();
}

// ---- road geometry (world: ground y = 0, z forward) -------------------------------------------------------
const NCATS = 100;
const CATS = (() => {
  const R = K.rng("f13road");
  const out = [];
  for (let i = 0; i < NCATS; i++) {
    const side = i % 2 ? 1 : -1;
    out.push({
      z: 300 + i * 190 + R() * 60,
      side,
      off: 120 + R() * 50,
      coat: LCOATS[(R() * LCOATS.length) | 0],
      pose: R() > 0.78 ? "loaf" : "sit",
      seed: R() * 10,
      size: 26 + R() * 8,
      bright: 0.5 + R() * 0.6,
    });
  }
  return out;
})();
function project(cam, wx, wy, wz) {
  const dz = wz - cam.z;
  if (dz < 20) return null;
  const k = cam.F / dz;
  return [VW / 2 + (wx - cam.x) * k, cam.hor + (wy - cam.y) * k, k, dz];
}
// draw the road of lantern cats; centre(z) gives the road centre line x; o.focus drives the bokeh
function road(g, t, cam, centre, o = {}) {
  const items = [];
  const maxSize = o.maxSize || 120;
  for (let i = 0; i < CATS.length; i++) {
    const c = CATS[i];
    if (o.count != null && i >= o.count) continue;
    const wx = centre(c.z) + c.side * c.off;
    const p = project(cam, wx, 0, c.z);
    if (!p || p[3] < 30) continue;
    if (p[0] < -200 || p[0] > VW + 200) continue;
    if (c.size * p[2] > maxSize) continue;
    if (o.maxY != null && p[1] > o.maxY) continue;
    items.push([p, c, i]);
  }
  items.sort((a, b) => b[0][3] - a[0][3]);
  for (const [p, c, i] of items) {
    const appear = o.appear ? o.appear(i) : 1;
    if (appear <= 0) continue;
    const size = c.size * p[2];
    const dzN = Math.abs(1 / p[3] - 1 / (o.focus || 1200)) * 1200;
    const blur = Math.min(1, dzN * (o.dofK == null ? 0.6 : o.dofK));
    const br = c.bright;
    if (size < 3.5) {
      // so far away it is a point of light
      K.glow(g, p[0], p[1] - size, 2 + size * 2.2, GOLD, 0.5 * appear * br);
      K.glow(g, p[0], p[1] - size, 1 + size * 0.6, "#fff4d6", 0.7 * appear * br);
    } else if (blur > 0.55 && size < 40) {
      const r = K.clamp(size * 0.8 + 2, 2, 12);
      if (o.noBokeh) K.glow(g, p[0], p[1] - size * 0.8, r * 1.6, GOLD, 0.4 * appear * br);
      else bokeh(g, p[0], p[1] - size * 0.8, r, 0.4 * appear * br);
    } else if (blur > 0.55) {
      // a near, out-of-focus cat: a big faint disc, no edge
      const r = Math.min(70, size * 1.3);
      if (!o.noBokeh) bokeh(g, p[0], p[1] - size * 0.9, r, 0.13 * appear * br, "#ffe2a0");
    } else {
      const pose = c.pose === "loaf" && size > 22 ? "sit" : c.pose;
      lanternCat(g, p[0], p[1], size, { coat: c.coat, pose, facing: c.side > 0 ? -1 : 1, t, seed: c.seed, alpha: appear, bright: br });
    }
  }
}

// ---- shots ----------------------------------------------------------------------------------------------
// paint the road sprites a few at a time well before they are needed (a cache fill, not state)
const WARM = [];
for (const c of LCOATS) for (const f of [1, -1]) WARM.push([c, f, "sit"]);
for (const c of LCOATS) for (const f of [1, -1]) WARM.push([c, f, "loaf"]);
function prewarm(t) {
  const i = Math.floor((t - 5) * 4);
  if (i >= 0 && i < WARM.length) lanternSprite(WARM[i][0], WARM[i][1], WARM[i][2]);
  if (i === WARM.length) { bokehSprite(GOLD); bokehSprite("#cfe4ff"); bokehSprite("#ffe2a0"); }
  if (t >= 28 && t < 28.2) insertBg();
}

function shot1(g, t) { // [0-10] wide, dark, slow push; a single tiny warm light far away, there from frame one
  prewarm(t);
  const p = K.ease.inOut(K.seg(t, 0, 10.5));
  const hor = 318 - p * 6;
  voidBg(g, p * 20, 0, hor);
  horizonMist(g, hor, t, 0.8);
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1 + p * 0.06, shakeT: t, shakeAmt: 0.9 }, () => {
    const a = 0.75 + 0.25 * K.smooth(K.seg(t, 0.5, 3.5));
    const x = 566, y = hor + 2;
    K.glow(g, x, y - 3, 60, GOLD, 0.35 * a);
    K.glow(g, x, y - 3, 12, "#ffe2a0", 0.9 * a);
    K.glow(g, x, y - 3, 4, "#fff6e0", 0.9 * a);
    K.glow(g, x, y + 5, 26, GOLD, 0.16 * a);
    const gs = K.glowSprite(GOLD);
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.25 * a;
    g.drawImage(gs, x - 5, y, 10, 90);
    g.restore();
  });
  K.dust(g, VW, VH, t, { seed: 13, color: "#8fa8ff", count: 30, size: 1.1, alpha: 0.35 });
}

// the hero's tail, wrapped round the front of his paws (the kit's sit pose leaves it behind him)
function wrappedTail(g, cx, cy, size, facing, t) {
  const f = facing;
  const sw = Math.sin(t * 0.8) * 0.03 * size;
  const pts = [cx - f * size * 0.5, cy - size * 0.12, cx - f * size * 0.15, cy + size * 0.02, cx + f * size * 0.25, cy + size * 0.03, cx + f * (size * 0.52 + sw), cy - size * 0.06];
  const p = new Path2D();
  K.tube(p, pts, [size * 0.15, size * 0.13, size * 0.11, size * 0.07], 6, false, true);
  const gr = g.createLinearGradient(0, cy - size * 0.2, 0, cy + size * 0.1);
  gr.addColorStop(0, "#b4b8bd");
  gr.addColorStop(0.6, "#7e838a");
  gr.addColorStop(1, "#4a4e56");
  g.fillStyle = gr;
  g.fill(p);
  g.save();
  g.clip(p);
  g.strokeStyle = "rgba(40,42,50,0.7)";
  g.lineWidth = size * 0.045;
  for (let i = 0; i < 6; i++) {
    const u = 0.12 + i * 0.15;
    const x = K.lerp(cx - f * size * 0.45, cx + f * size * 0.5, u), y = cy - size * 0.02 + Math.sin(u * Math.PI) * size * 0.06;
    g.beginPath();
    g.moveTo(x - f * size * 0.03, y - size * 0.12);
    g.lineTo(x + f * size * 0.02, y + size * 0.12);
    g.stroke();
  }
  // fur strokes along the tail
  g.strokeStyle = "rgba(220,224,230,0.25)";
  g.lineWidth = 0.6;
  for (let i = 0; i < 26; i++) {
    const u = K.hash(i, 3), x = K.lerp(cx - f * size * 0.45, cx + f * size * 0.5, u), y = cy - size * 0.06 + Math.sin(u * Math.PI) * size * 0.06;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + f * size * 0.05, y - size * 0.02);
    g.stroke();
  }
  g.restore();
}
function shot2(g, t) { // [10-20] closer: the light is a cat, glowing from within; the bell; more lights
  prewarm(t);
  const p = K.ease.inOut(K.seg(t, 10, 20.5));
  const hor = 252;
  voidBg(g, 60 + p * 30, 0, hor);
  horizonMist(g, hor, t, 0.7);
  K.withCamera(g, VW, VH, { x: 480 + p * 14, y: 270, zoom: 1.0 + p * 0.05, shakeT: t, shakeAmt: 1 }, () => {
    // the bell's ring as a ripple of light across the mirror floor (17)
    const rp = K.seg(t, 17, 19.5);
    if (rp > 0 && rp < 1) {
      K.focus(g, VW, VH, 5, (f) => {
        f.globalCompositeOperation = "lighter";
        for (let k = 0; k < 2; k++) {
          const q = K.clamp(rp - k * 0.12);
          if (q <= 0) continue;
          f.strokeStyle = K.rgba("#ffe6a8", 0.3 * (1 - q) * (k ? 0.5 : 1));
          f.lineWidth = 3 + q * 8;
          f.beginPath();
          f.ellipse(480, 600, 80 + q * 900, 24 + q * 300, 0, Math.PI * 1.02, K.TAU - 0.02);
          f.stroke();
        }
      }, "f13ripple");
    }
    // then another light, and another: two small lanterns fade in either side (17.5 - 19.5)
    const a2 = K.ease.out(K.seg(t, 17.5, 18.6)), a3 = K.ease.out(K.seg(t, 18.4, 19.5));
    if (a2 > 0) {
      K.glow(g, 238, hor + 34 - 30, 44 * a2, "#fff4d6", 0.5 * (1 - a2));
      lanternCat(g, 238, hor + 34, 30, { coat: "cream", facing: 1, t, seed: 2, alpha: a2 });
    }
    if (a3 > 0) {
      K.glow(g, 762, hor + 22 - 24, 44 * a3, "#fff4d6", 0.5 * (1 - a3));
      lanternCat(g, 762, hor + 22, 22, { coat: "tuxedo", facing: -1, t, seed: 3, alpha: a3 });
    }
    // the hero lantern cat: grey tabby, drawn live so he breathes, blinks and his tail moves
    const cx = 500, cy = 444, size = 118;
    K.glow(g, cx, cy - size, size * 4.2, GOLD, 0.26);
    const L = K.layer(VW, VH, "f13hero");
    const opts = {
      pose: "sit", facing: -1, headTurn: 0.35 + Math.sin(t * 0.35) * 0.08, t, coat: K.COATS.grey, collar: false, bell: false,
      shadow: false, tail: 0.2, blink: K.flash(t, [13.2, 16.8], 0.12) ? 1 : 0, headTilt: t > 17 ? 0.12 * K.smooth(K.seg(t, 17, 17.8)) : 0,
      ears: t > 17 ? 0.8 : 0.2, light: { x: cx + 120, y: cy - 300, color: "#fff0c8", strength: 1.2 },
    };
    K.drawCat(L.g, cx, cy, size, opts);
    wrappedTail(L.g, cx, cy, size, -1, t);
    lanternize(L.g, cx - size * 0.22, cy - size * 0.85, size);
    shadowSide(L.g, cx, cy - size * 0.8, size, -1, 0.55);
    g.save();
    g.translate(0, cy * 2);
    g.scale(1, -1);
    g.globalAlpha = 0.2;
    g.drawImage(L.canvas, 0, 0, VW, VH);
    g.restore();
    g.drawImage(L.canvas, 0, 0, VW, VH);
    g.save();
    g.globalCompositeOperation = "lighter";
    K.dof(g, L.canvas, 10, 0.22);
    g.restore();
    K.glow(g, cx - size * 0.2, cy - size * 0.8, size * 1.4, "#fff4d6", 0.08);
  });
  K.dust(g, VW, VH, t, { seed: 14, color: "#ffe6b0", count: 26, size: 1.2, area: [250, 120, 500, 360], alpha: 0.5 });
}

function shot3(g, t, xf) { // [20-32] wide crane up: dozens of glowing cats form a road of light
  prewarm(t);
  const p = K.ease.inOut(K.seg(t, 20, 32.5));
  const hor = K.lerp(250, 214, p);
  voidBg(g, 100 + p * 40, p * 40, hor);
  if (!xf) farBokeh(g, hor, t, 31, 40, K.seg(t, 21, 26));
  horizonMist(g, hor, t, 0.9);
  const cam = { x: K.lerp(-40, 30, p), y: K.lerp(-60, -330, p), z: K.lerp(-120, 60, p), F: 640, hor };
  const centre = (z) => 260 * Math.sin(z / 2600) - 80;
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1, shakeT: t, shakeAmt: 1.1 }, () => {
    road(g, t, cam, centre, {
      focus: 1500, dofK: 0.9, maxY: 440, noBokeh: xf,
      appear: (i) => K.smooth(K.seg(t, 20 + i * 0.09, 20.6 + i * 0.09)),
    });
  });
  const purr = K.env(t, 29.5, 32.5, 0.8, 1.5);
  if (purr > 0) K.fadeColor(g, VW, VH, purr * 0.05 * (0.6 + 0.4 * Math.sin(t * 9)), "#ffcf6a");
  K.dust(g, VW, VH, t, { seed: 15, color: "#ffe6b0", count: 30, size: 1.2, alpha: 0.4 });
}

// the defocused road behind the insert: static, so painted once (blurred) and reused
function insertBg() {
  return K.sprite("f13:insertbg", VW, VH, (g) => {
    const T = g.getTransform();
    const c = K.makeCanvas(g.canvas.width, g.canvas.height);
    const s = c.getContext("2d");
    s.setTransform(T);
    const cam = { x: 0, y: -90, z: 0, F: 700, hor: 230 };
    road(s, 0, cam, (z) => 140 * Math.sin(z / 1800), { focus: 300, dofK: 0, maxSize: 90, noBokeh: true });
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (K.hasFilter()) g.filter = `blur(${(9 * T.a).toFixed(1)}px)`;
    g.drawImage(c, 0, 0);
    g.filter = "none";
    g.restore();
  });
}
function shot4(g, t, xf) { // [32-42] insert: a small calico pushes her head up into your palm
  const p = K.ease.inOut(K.seg(t, 32, 42.5));
  const hor = 230;
  voidBg(g, 200, 20, hor);
  g.drawImage(insertBg(), 0, 0, VW, VH);
  // she rises into your palm at 37.8-39.6, rubs, then settles a little
  const nudge = K.ease.inOut(K.seg(t, 37.8, 39.6)) - K.ease.inOut(K.seg(t, 40.6, 42)) * 0.35;
  const rub = Math.sin(t * 1.8) * K.seg(t, 39.2, 39.8) * (1 - K.seg(t, 40.4, 41.2));
  const cx = 470 + p * 8, cy = 600 - nudge * 20, size = 168;
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1.02 + p * 0.03, shakeT: t, shakeAmt: 1 }, () => {
    K.glow(g, cx, cy - size * 1.3, size * 3.2, GOLD, 0.26);
    const L = K.layer(VW, VH, "f13kitten");
    // painted at half size and scaled up: the kit's medium-detail fur reads softer at this scale
    L.g.save();
    L.g.translate(cx, cy);
    L.g.scale(2, 2);
    K.drawCat(L.g, 0, 0, size / 2, {
      pose: "sit", facing: 1, headTurn: K.clamp(0.48 - nudge * 0.08 + rub * 0.05, 0.38, 0.6), headTilt: 0.12 + nudge * 0.42, t, coat: K.COATS.calico,
      collar: false, bell: false, shadow: false, tail: 0.8, tailUp: 0.7, blink: nudge > 0.6 ? 1 : 0, ears: 0.1 + nudge * 0.2,
      light: { x: 100, y: -250, color: "#fff0c8", strength: 1.3 },
    });
    L.g.restore();
    lanternize(L.g, cx + size * 0.2, cy - size * 0.9, size * 1.1, 0.7);
    shadowSide(L.g, cx, cy - size, size, -1, 0.4);
    g.drawImage(L.canvas, 0, 0, VW, VH);
    g.save();
    g.globalCompositeOperation = "lighter";
    K.dof(g, L.canvas, 12, 0.22);
    g.restore();
    // your left hand comes down from the top right; fingers curl a little as her head meets the palm
    const inP = K.ease.out(K.seg(t, 32.4, 35.6));
    const hx = K.lerp(900, 664, inP) + rub * 6, hy = K.lerp(-60, 232, inP) - nudge * 3;
    povHand(g, hx, hy, 220, {
      left: true, angle: 2.93 + rub * 0.03, curl: 0.14 + nudge * 0.3, spread: 0.06, bell: true, t, swing: 0.2,
      light: { x: cx, y: cy - size * 1.4, color: "#ffd890", strength: 1.4 },
    });
    // warm bounce on the palm where they touch
    K.glow(g, hx - 110, hy + 40, 110, GOLD, 0.22 * K.clamp(nudge));
  });
  K.dust(g, VW, VH, t, { seed: 16, color: "#ffe6b0", count: 26, size: 1.3, alpha: 0.5 });
}

// the portal motif: a ring of light holding a rotating paw (four toe-beans and a pad)
function pawPortal(g, x, y, r, t, k = 1) {
  K.glow(g, x, y, r * 6, CYAN, 0.09 * k);
  K.glow(g, x, y, r * 2.4, CYAN, 0.24 * k);
  g.save();
  g.translate(x, y);
  g.scale(1, 0.9);
  g.globalCompositeOperation = "lighter";
  const ig = g.createRadialGradient(0, 0, 0, 0, 0, r);
  ig.addColorStop(0, K.rgba("#1a5a7a", 0.5 * k));
  ig.addColorStop(0.8, K.rgba("#3ab0d8", 0.35 * k));
  ig.addColorStop(1, K.rgba(CYAN, 0));
  g.fillStyle = ig;
  g.beginPath();
  g.arc(0, 0, r, 0, K.TAU);
  g.fill();
  g.strokeStyle = K.rgba("#e6fbff", 0.85 * k);
  g.lineWidth = Math.max(1.2, r * 0.09);
  g.beginPath();
  g.arc(0, 0, r, 0, K.TAU);
  g.stroke();
  g.strokeStyle = K.rgba(CYAN, 0.4 * k);
  g.lineWidth = Math.max(2, r * 0.22);
  g.stroke();
  g.rotate(t * 0.3);
  g.fillStyle = K.rgba("#eefcff", 0.95 * k);
  g.beginPath();
  // pad: a rounded three-lobed shape
  const s = r * 0.62;
  g.moveTo(-s * 0.55, s * 0.42);
  g.bezierCurveTo(-s * 0.7, s * 0.05, -s * 0.28, -s * 0.12, 0, -s * 0.1);
  g.bezierCurveTo(s * 0.28, -s * 0.12, s * 0.7, s * 0.05, s * 0.55, s * 0.42);
  g.bezierCurveTo(s * 0.4, s * 0.7, s * 0.15, s * 0.55, 0, s * 0.62);
  g.bezierCurveTo(-s * 0.15, s * 0.55, -s * 0.4, s * 0.7, -s * 0.55, s * 0.42);
  g.fill();
  for (const [bx, by, a] of [[-0.66, -0.36, -0.5], [-0.24, -0.66, -0.15], [0.24, -0.66, 0.15], [0.66, -0.36, 0.5]]) {
    g.beginPath();
    g.ellipse(bx * s, by * s, s * 0.17, s * 0.23, a, 0, K.TAU);
    g.fill();
  }
  g.restore();
}
const ROAD_END = 300 + NCATS * 190 + 400;
function shot5(g, t, xf) { // [42-52] down the road through a long lens; the paw-portal at the vanishing point
  const p = K.ease.inOut(K.seg(t, 42, 52.5));
  const hor = 236;
  voidBg(g, 140, 0, hor);
  if (!xf) farBokeh(g, hor, t, 41, 46, 1);
  const cam = { x: 0, y: -90, z: -1900 + p * 200, F: 2000, hor };
  const pp = project(cam, 0, -60, ROAD_END);
  const swell = K.seg(t, 42, 46);
  K.godRays(g, pp[0], pp[1], VW, VH, { color: CYAN, count: 10, strength: 0.05 + swell * 0.05, t, angle: Math.PI / 2, spread: 2.6, length: 600, seed: 21 });
  horizonMist(g, hor, t, 1);
  pawPortal(g, pp[0], pp[1], 25, t, 0.65 + swell * 0.35);
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1.03 + p * 0.04, shakeT: t, shakeAmt: 1 }, () => {
    road(g, t, cam, () => 0, { focus: 4000, dofK: 0.9, noBokeh: xf });
    // the Shadow: just off the road on the left, standing, back to us, unmoving
    const sp = project(cam, -250, 0, 160);
    if (sp) shadowCat(g, sp[0], sp[1], 30 * 1.75 * sp[2], t, { x: pp[0], y: pp[1] });
  });
  K.dust(g, VW, VH, t, { seed: 17, color: "#cfe8ff", count: 24, size: 1.1, alpha: 0.35 });
}

function shot6(g, t, xf) { // [52-64] from behind, you walk between the lights toward the portal; it flares
  const p = K.seg(t, 52, 64);
  const hor = 220;
  voidBg(g, 140, 0, hor);
  if (!xf) farBokeh(g, hor, t, 51, 40, 1);
  const walkZ = K.lerp(0, 1100, K.ease.sine(p) * 0.4 + p * 0.6);
  const cam = { x: 0, y: -150, z: walkZ - 300, F: 620, hor };
  const flare = K.ease.out(K.seg(t, 56, 57.2)) * (1 - K.seg(t, 57.2, 60) * 0.4) + K.seg(t, 59.5, 63.5) * 1.4;
  const pp = project(cam, 0, -90, walkZ + 4200);
  K.godRays(g, pp[0], pp[1], VW, VH, { color: CYAN, count: 14, strength: 0.12 + flare * 0.2, t, angle: Math.PI / 2, spread: 2.8, length: 700, seed: 22 });
  horizonMist(g, hor, t, 1);
  pawPortal(g, pp[0], pp[1], 22 + flare * 22, t, 0.8 + flare * 0.6);
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1, shakeT: t, shakeAmt: 1.2 + K.flash(t, [56], 0.3) * 6 }, () => {
    road(g, t, cam, () => 0, { focus: 900, dofK: 1.1, noBokeh: xf });
    const kx = 480, ky = 470, kh = 214;
    const po = {
      view: "back", walk: true, phase: t * 0.95, t, bell: true, hood: false, shadow: false,
      light: { x: pp[0], y: pp[1], color: "#d8f4ff", strength: 1.7 },
    };
    const KL = K.layer(VW, VH, "f13kid");
    K.drawPerson(KL.g, kx, ky, kh, po);
    hairOver(KL.g, kx, ky, kh, po);
    // backlit: sink the front a little, warm fills from the lantern cats on both sides
    KL.g.save();
    KL.g.setTransform(1, 0, 0, 1, 0, 0);
    KL.g.globalCompositeOperation = "source-atop";
    const kg = KL.g.createLinearGradient(0, 0, KL.canvas.width, 0);
    kg.addColorStop(K.clamp((kx - 60) / VW), "rgba(255,186,100,0.3)");
    kg.addColorStop(K.clamp((kx - 22) / VW), "rgba(12,14,40,0.3)");
    kg.addColorStop(K.clamp((kx + 22) / VW), "rgba(12,14,40,0.3)");
    kg.addColorStop(K.clamp((kx + 60) / VW), "rgba(255,186,100,0.3)");
    KL.g.fillStyle = kg;
    KL.g.fillRect(0, 0, KL.canvas.width, KL.canvas.height);
    KL.g.restore();
    // contact shadow and the boots' reflection in the mirror floor
    const cs = g.createRadialGradient(kx, ky, 0, kx, ky, kh * 0.2);
    cs.addColorStop(0, "rgba(0,0,0,0.55)");
    cs.addColorStop(1, "rgba(0,0,0,0)");
    g.save();
    g.translate(kx, ky);
    g.scale(1, 0.16);
    g.translate(-kx, -ky);
    g.fillStyle = cs;
    g.fillRect(kx - kh * 0.2, ky - kh * 0.2, kh * 0.4, kh * 0.4);
    g.restore();
    g.save();
    g.translate(0, ky * 2);
    g.scale(1, -1);
    g.globalAlpha = 0.22;
    g.drawImage(KL.canvas, 0, 0, VW, VH);
    g.restore();
    g.drawImage(KL.canvas, 0, 0, VW, VH);
  });
  if (flare > 0) K.lensFlare(g, pp[0], pp[1], VW, VH, Math.min(1, flare), { color: "#bff0ff" });
  K.dust(g, VW, VH, t, { seed: 18, color: "#ffe6b0", count: 30, size: 1.3, alpha: 0.45 });
}

const SHOTS = [
  [0, shot1, false],
  [10, shot2, false],
  [20, shot3, true],
  [32, shot4, true],
  [42, shot5, false],
  [52, shot6, false],
];
function overlay(g, t, fn, a) {
  const L = K.layer(VW, VH, "f13xf");
  L.g.fillStyle = NAVY;
  L.g.fillRect(0, 0, VW, VH);
  fn(L.g, t, true); // no additive bokeh inside the dissolve layer
  g.save();
  g.globalAlpha = a;
  g.drawImage(L.canvas, 0, 0, VW, VH);
  g.restore();
}
function compose(g, t) {
  let i = 0;
  while (i < SHOTS.length - 1 && t >= SHOTS[i + 1][0]) i++;
  const cur = SHOTS[i], next = SHOTS[i + 1];
  if (next && next[2] && t > next[0] - XF / 2) {
    cur[1](g, t, false);
    overlay(g, t, next[1], K.smooth((t - (next[0] - XF / 2)) / XF));
  } else if (cur[2] && i > 0 && t < cur[0] + XF / 2) {
    SHOTS[i - 1][1](g, t, false);
    overlay(g, t, cur[1], K.smooth((t - (cur[0] - XF / 2)) / XF));
  } else cur[1](g, t, false);
}

export const film = {
  id: 13,
  title: "The Lantern Cats",
  chapter: "Chapter 13",
  unlockAt: 65,
  duration: D,
  poster: 38,
  tagline: "Every cat you find is a light.",
  subs: [
    [3.0, 7.0, "In the dark, a light."],
    [11.5, 16.0, "A cat you found. Glowing. Safe."],
    [19.0, 23.5, "Then another. And another."],
    [24.0, 29.0, "Every cat you found was lighting the way."],
    [33.0, 37.5, "They were not lost anymore."],
    [38.0, 41.5, "Because you came."],
    [44.0, 49.0, "The shadow was there. The cats did not mind."],
    [52.5, 57.0, "Maybe it was never what you thought."],
    [58.0, 62.0, "One more step."],
  ],
  voice: [
    [3.0, "In the dark, a light."],
    [11.5, "A cat you found. Glowing. Safe."],
    [19.0, "Then another. And another."],
    [24.0, "Every cat you found was lighting the way."],
    [33.0, "They were not lost anymore."],
    [38.0, "Because you came."],
    [44.0, "The shadow was there. The cats did not mind."],
    [52.5, "Maybe it was never what you thought."],
    [58.0, "One more step."],
  ],
  score: { mood: "hopeful", key: "F", bpm: 72, cues: [[4, "swell"], [17, "bell"], [30, "purr"], [42, "swell"], [56, "hit"]] },
  draw(g, t, W, H) {
    g.save();
    g.scale(W / VW, H / VH);
    g.fillStyle = NAVY;
    g.fillRect(0, 0, VW, VH);
    compose(g, t);
    K.finish(g, VW, VH, t, { bloom: 0.4, tint: "#1a2a6a", tintAlpha: 0.14, vignette: 0.6, grain: 0.05, letterbox: 1 });
    K.grade(g, VW, VH, { tint: "#ffcf6a", alpha: 0.05 + K.seg(t, 20, 40) * 0.05, mode: "soft-light" });
    const ta = K.env(t, 1.6, 6.4, 1.0, 1.0);
    if (ta > 0) K.title(g, VW, VH, "The Lantern Cats", "Chapter 13", ta, { y: VH * 0.36, size: 56, glow: "#ffcf6a" });
    K.fadeBlack(g, VW, VH, 1 - K.smooth(K.seg(t, 0, 1.6)));
    // the portal swallows the picture in pure white; the letterbox bars stay black
    const wf = K.smooth(K.seg(t, 60.5, 63.6));
    if (wf > 0) {
      g.save();
      g.globalAlpha = wf;
      g.fillStyle = "#ffffff";
      g.fillRect(0, BAR, VW, VH - BAR * 2);
      g.restore();
    }
    g.restore();
  },
};
