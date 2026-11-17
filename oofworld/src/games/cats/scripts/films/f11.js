// films/f11.js - Chapter 11 "Nothing" (FILMS.md f11). The nil Void: near-black, a faint perspective
// grid, and your flashlight as the only warm thing. Faint amber pawprints, lost objects drifting
// through the beam, hundreds of patient eyes, and the bell that makes them all look the same way.
// Pure function of t; everything is drawn in a 960 x 540 space.
import * as K from "../filmkit.js";

const D = 58;
const VOID = "#05050a", GRID = "#1a1a2a", TORCH = "#fff3d0", HOT = "#ffffff", COLD = "#c8c8ff";

// ---- helpers ---------------------------------------------------------------------------------------
// a floor plane seen from a camera at height h above it, horizon at screen y = hy, focal f, pan x0
function floorCam(hy, h, f, cx = 480, panX = 0, panZ = 0) {
  return {
    P(X, Z) { const z = Math.max(0.05, Z - panZ); return [cx + (X - panX) * f / z, hy + h * f / z]; },
    Zat(sy) { return h * f / Math.max(0.001, sy - hy) + panZ; },
  };
}
// the grid on the floor: lines of constant X and constant Z, fading with distance
function grid(g, cam, o = {}) {
  const x0 = o.x0 == null ? -30 : o.x0, x1 = o.x1 == null ? 30 : o.x1;
  const z0 = o.z0 == null ? 0.6 : o.z0, z1 = o.z1 == null ? 40 : o.z1;
  const col = o.color || GRID, a = o.alpha == null ? 1 : o.alpha, st = o.step || 1;
  g.lineWidth = o.width || 1;
  // depth bands so far lines fade out (atmosphere of nothing)
  const bands = o.bands || [[z0, 4, 1], [4, 9, 0.6], [9, 18, 0.3], [18, z1, 0.12]];
  for (const [za, zb, k] of bands) {
    if (zb <= z0 || za >= z1) continue;
    g.strokeStyle = K.rgba(col, a * k);
    g.beginPath();
    for (let X = Math.ceil(x0 / st) * st; X <= x1; X += st) {
      const p0 = cam.P(X, Math.max(za, z0)), p1 = cam.P(X, Math.min(zb, z1));
      g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]);
    }
    for (let Z = Math.ceil(Math.max(za, z0) / st) * st; Z <= Math.min(zb, z1); Z += st) {
      const p0 = cam.P(x0, Z), p1 = cam.P(x1, Z);
      g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]);
    }
    g.stroke();
  }
}
// draw something through a light mask: paint(c) into a layer, then keep only what mask(m) lights
function lit(g, W, H, key, paint, mask, alpha = 1, mode = "source-over") {
  const L = K.layer(W, H, key);
  paint(L.g);
  // the mask is built in its own (half-res) layer so several soft fills ADD up, then applied once
  const M = K.layer(W / 2, H / 2, "f11mask");
  M.g.scale(0.5, 0.5);
  mask(M.g);
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  L.g.globalAlpha = 1;
  L.g.globalCompositeOperation = "destination-in";
  L.g.imageSmoothingEnabled = true;
  L.g.drawImage(M.canvas, 0, 0, L.canvas.width, L.canvas.height);
  L.g.globalCompositeOperation = "source-over";
  g.save();
  g.globalCompositeOperation = mode;
  g.globalAlpha *= alpha;
  g.drawImage(L.canvas, 0, 0, W, H);
  g.restore();
}
// the pool of torch light on the floor: ellipse at (x, y), radii rx, ry; hot centre, soft spill ring.
// As a mask it is white; as light it is the torch's warm colour with a white-hot centre.
function poolFill(c, x, y, rx, ry, k = 1, col = "#ffffff") {
  c.save();
  c.translate(x, y);
  c.scale(1, ry / rx);
  const gr = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, K.rgba(col === "#ffffff" ? col : HOT, k));
  gr.addColorStop(0.35, K.rgba(col, 0.85 * k));
  gr.addColorStop(0.62, K.rgba(col, 0.45 * k));
  gr.addColorStop(0.8, K.rgba(col, 0.18 * k));
  gr.addColorStop(1, K.rgba(col, 0));
  c.fillStyle = gr;
  c.beginPath(); c.arc(0, 0, rx, 0, K.TAU); c.fill();
  c.restore();
}
// the beam's outline: a wedge from the torch tip (tx, ty) wrapping the pool ellipse
function conePath(tx, ty, px, py, rx, ry, k = 1) {
  const ang = Math.atan2(py - ty, px - tx);
  const nx = -Math.sin(ang), ny = Math.cos(ang);
  const w = Math.hypot(rx * nx, ry * ny) * k;
  const p = new Path2D();
  p.moveTo(tx, ty);
  p.lineTo(px + nx * w, py + ny * w);
  p.ellipse(px, py, rx * k, ry * k, 0, Math.atan2(ny, nx), Math.atan2(-ny, -nx), true);
  p.closePath();
  return p;
}
// a mask of the beam (soft-edged by stacking): the cone in the air at `air`, the pool at full
function beamMask(m, tx, ty, px, py, rx, ry, air = 0.5) {
  m.save();
  m.fillStyle = "#fff";
  for (const [k, al] of [[1.05, 0.3], [0.85, 0.35], [0.6, 0.45]]) {
    m.globalAlpha = al * air;
    m.fill(conePath(tx, ty, px, py, rx, ry, k));
  }
  m.restore();
  poolFill(m, px, py, rx * 1.15, ry * 1.15);
}
// a volumetric cone from the torch tip (tx, ty) to an ellipse on the floor
function cone(g, tx, ty, px, py, rx, ry, a = 1) {
  const Lc = K.layer(240, 135, "f11cone");
  coneHard(Lc.g, tx / 4, ty / 4, px / 4, py / 4, rx / 4, ry / 4, a, true);
  g.save();
  g.globalCompositeOperation = "lighter";
  g.imageSmoothingEnabled = true;
  g.drawImage(Lc.canvas, 0, 0, Lc.canvas.width, Lc.canvas.height, 0, 0, 960, 540);
  g.restore();
  // the white-hot core just out of the lens
  K.glow(g, tx, ty, 46, HOT, 0.35 * a);
}
function coneHard(g, tx, ty, px, py, rx, ry, a = 1) {
  g.save();
  g.globalCompositeOperation = "lighter";
  for (const [k, al] of [[1.0, 0.05], [0.75, 0.06], [0.45, 0.08], [0.2, 0.06]]) {
    const gr = g.createLinearGradient(tx, ty, px, py);
    gr.addColorStop(0, K.rgba(k < 0.3 ? HOT : TORCH, al * 2.2 * a));
    gr.addColorStop(0.5, K.rgba(TORCH, al * a));
    gr.addColorStop(1, K.rgba(TORCH, al * 0.7 * a));
    g.fillStyle = gr;
    g.fill(conePath(tx, ty, px, py, rx, ry, k));
  }
  g.restore();
}
// motes visible only inside the cone (tip t, axis toward p, half-angle sp)
function beamMotes(g, t, tx, ty, px, py, sp, o = {}) {
  const n = o.count || 110, seed = o.seed || 3;
  const ax = px - tx, ay = py - ty, al = Math.hypot(ax, ay) || 1;
  const spr = K.glowSprite(o.color || "#fff2d8");
  const [bx, by, bw, bh] = o.area || [0, 0, 960, 540];
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const x = bx + ((K.hash(i, seed) * bw + K.noise(t * 0.12 + i, seed) * 60 + t * 3) % bw + bw) % bw;
    const y = by + ((K.hash(i + 0.5, seed) * bh + K.noise(t * 0.1 + i * 3, seed + 1) * 40 - t * 2) % bh + bh) % bh;
    const vx = x - tx, vy = y - ty, vl = Math.hypot(vx, vy) || 1;
    const cos = (vx * ax + vy * ay) / (vl * al);
    const inside = K.clamp((cos - Math.cos(sp)) / (1 - Math.cos(sp)) * 2.2);
    if (inside <= 0.01 || vl > al * 1.15) continue;
    const s = (o.size || 1.6) * (0.5 + K.hash(i + 0.2, seed));
    g.globalAlpha = inside * (0.35 + 0.65 * Math.abs(Math.sin(t * 0.7 + i))) * (1 - vl / (al * 1.2)) * (o.alpha || 0.9);
    g.drawImage(spr, x - s * 2, y - s * 2, s * 4, s * 4);
  }
  g.restore();
}
function coldMotes(g, W, H, t, n = 40, seed = 7, a = 0.35) {
  K.dust(g, W, H, t, { seed, color: COLD, count: n, size: 1.2, alpha: a });
}
// ---- eyes in the dark ------------------------------------------------------------------------------
const EYES = (() => {
  const R = K.rng("f11eyes");
  const out = [];
  for (let i = 0; i < 64; i++) {
    const depth = Math.pow(R(), 1.4);              // 0 near .. 1 far
    const x = R() * 980 - 10;
    const y = K.lerp(390, 250, depth) + (R() - 0.5) * 60 * (1 - depth);
    const s = K.lerp(5.5, 1.2, depth);
    const col = R() < 0.5 ? "#a8ff6a" : R() < 0.6 ? "#ffd84a" : "#d8f05a";
    out.push({ x, y, s, col, open: 40.6 + R() * 5.2, ph: R() * 10, per: 4 + R() * 4, turnDelay: R() * 0.8 });
  }
  return out;
})();
function eyePair(g, x, y, s, col, open, look, turn, shine = 0) {
  // two almond eyes with slit pupils and a soft tapetum glow. look -1..1 moves the pupils inside the
  // eye; the eye shapes themselves never stretch. shine = caught in the torch (eyeshine flares)
  if (open <= 0.02) return;
  const gap = s * 2.6 * (1 - Math.abs(turn) * 0.12);
  for (const sd of [-1, 1]) {
    const ex = x + sd * gap / 2, ey = y;
    const ew = s;
    K.glow(g, ex, ey, s * (4.5 + shine * 3), shine > 0 ? K.mix(col, "#ffffff", 0.3 * shine) : col, (0.28 + shine * 0.4) * open);
    g.save();
    g.translate(ex, ey);
    g.scale(1, Math.max(0.05, open) * 0.62);
    const gr = g.createRadialGradient(-ew * 0.2, -ew * 0.3, 0, 0, 0, ew);
    gr.addColorStop(0, K.mix(col, "#ffffff", 0.45 + shine * 0.3));
    gr.addColorStop(0.6, col);
    gr.addColorStop(1, K.mix(col, "#000000", 0.6));
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(0, 0, ew, ew, 0, 0, K.TAU); g.fill();
    g.fillStyle = "rgba(4,4,6,0.92)";
    g.beginPath(); g.ellipse(look * ew * 0.5, 0, ew * 0.18, ew * 0.92, 0, 0, K.TAU); g.fill();
    g.restore();
    if (s > 2.5 && open > 0.5) { g.fillStyle = "rgba(255,255,255,0.85)"; g.fillRect(ex - ew * 0.35, ey - ew * 0.25, Math.max(1, s * 0.25), Math.max(1, s * 0.25)); }
  }
}
function eyeField(g, t, o = {}) {
  const ring = o.ring == null ? 1e9 : o.ring;
  for (const e of EYES) {
    if (o.skip && o.skip(e)) continue;
    const open0 = K.smooth(K.seg(t, e.open, e.open + 0.9));
    // slow blinks ("I am not a threat"), each on its own clock
    const bt = ((t + e.ph) % e.per) / e.per;
    const blink = bt > 0.9 ? 1 - Math.sin((bt - 0.9) / 0.1 * Math.PI) : 1;
    const open = (o.allOpen ? 1 : open0) * blink;
    // after the bell: pupils swing left first, then each head turns a little (a small staggered shift)
    const look = K.smooth(K.seg(t, ring + 0.1 + e.turnDelay * 0.5, ring + 0.6 + e.turnDelay * 0.5));
    const turnT = K.smooth(K.seg(t, ring + 0.5 + e.turnDelay, ring + 1.4 + e.turnDelay));
    const sc = o.scale || 1;
    const x = e.x + (o.dx || 0) - turnT * e.s * sc * 1.6, y = e.y + (o.dy || 0);
    const shine = o.shine ? o.shine(x, y) : 0;
    eyePair(g, x, y, e.s * sc, e.col, open, -look * 0.95, -turnT, shine);
  }
}

// ---- SHOT 1 [0-12] black; click; the beam sweeps the endless floor; title printed on the fog --------
function torchOn(t) {
  // click at 1.6, a stutter, then steady (with a faint living flicker)
  if (t < 1.6) return 0;
  if (t < 1.68) return 0.85;
  if (t < 1.8) return 0.08;
  return 0.96 + 0.04 * Math.sin(t * 31) * Math.sin(t * 7.7);
}
function shotSweep(g, t, W, H) {
  g.fillStyle = VOID; g.fillRect(0, 0, W, H);
  const on = torchOn(t);
  if (on <= 0) return;
  const cam = floorCam(110, 1.5, 420, 480);
  // the pool's path on the floor: sweep in from the left, rest at centre, drift right and back
  const a1 = K.ease.inOut(K.seg(t, 1.6, 4.0)), a2 = K.ease.inOut(K.seg(t, 8.2, 10.2)), a3 = K.ease.inOut(K.seg(t, 10.2, 12.2));
  const X = K.lerp(-3.2, 0, a1) + a2 * 2.6 - a3 * 1.6 + Math.sin(t * 0.7) * 0.15;
  const Z = 3.7 + Math.sin(t * 0.45) * 0.3;
  const [px, py] = cam.P(X, Z);
  const rx = 1.25 * 420 / Z, ry = rx * (1.5 / Z) * 0.85;
  const tx = 980, ty = 600;
  // faint grid everywhere (barely there), then the lit grid only inside the pool / under the cone
  grid(g, cam, { alpha: 0.3 * on });
  lit(g, W, H, "f11grid", (c) => grid(c, cam, { color: "#e8d4a8", alpha: 1, width: 1.2 }), (m) => beamMask(m, tx, ty, px, py, rx, ry, 0.25), 0.75 * on, "lighter");
  g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.2 * on;
  poolFill(g, px, py, rx, ry, 1, TORCH); g.restore();
  cone(g, tx, ty, px, py, rx, ry, on);
  // the title, printed on the haze INSIDE the beam (4-8): low alpha, only where the cone is
  const ta = K.env(t, 4, 8, 1.0, 1.2);
  if (ta > 0) {
    lit(g, W, H, "f11title", (c) => K.title(c, W, H, "Nothing", "Chapter 11", 1, { y: 250, color: "#fff2dc", glow: "#ffe2b0" }),
      (m) => {
        m.save(); m.fillStyle = "#fff";
        for (const [k, al] of [[1.1, 0.25], [0.9, 0.35], [0.7, 0.4]]) { m.globalAlpha = al; m.fill(conePath(tx, ty, px, py, rx, ry, k)); }
        m.restore();
      },
      ta * on * 0.62, "lighter");
  }
  // dust drifting through the beam (and across the title)
  beamMotes(g, t, tx, ty, px, py, 0.3, { count: 170, size: 1.6 });
  K.glow(g, tx - 20, ty - 20, 90, TORCH, 0.55 * on);
}

// ---- SHOT 2 [12-20] wide from far away: a tiny warm dot in an ocean of black ---------------------
function shotFar(g, t, W, H) {
  g.fillStyle = VOID; g.fillRect(0, 0, W, H);
  const p = K.ease.inOut(K.seg(t, 12, 20.4));
  // a very slow pull-back (the camera rises and widens)
  const h = K.lerp(22, 36, p);
  const cam = floorCam(-70, h, 300, 480, 0, 0);
  const kX = 0, kZ = 22.5;
  const [kx, ky] = cam.P(kX, kZ);
  const ks = 300 / kZ * 1.35;
  // the beam reaches far ahead of you along the floor
  const fX = -0.6 + Math.sin(t * 0.3) * 0.4, fZ = 27;
  const [px, py] = cam.P(fX, fZ);
  const rx = 2.4 * 300 / fZ, ry = rx * 0.75;
  const near = K.smooth(K.seg(t, 12.3, 15.5)); // the grid round you fades up as your eyes adjust
  grid(g, cam, { alpha: 0.2, z0: 12, z1: 70, x0: -40, x1: 40, step: 3 });
  lit(g, W, H, "f11grid", (c) => grid(c, cam, { color: "#e8d4a8", alpha: 1, z0: 12, z1: 70, x0: -40, x1: 40, step: 1.5 }), (m) => {
    poolFill(m, px, py, rx * 1.2, ry * 1.2);
    poolFill(m, kx, ky, 150, 150 * 0.62, 0.55 * near);
  }, 0.6, "lighter");
  // a warm pool of light round you (spill from the torch) and the bright one ahead
  g.save(); g.globalCompositeOperation = "lighter";
  g.globalAlpha = 0.16; poolFill(g, px, py, rx, ry, 1, TORCH);
  g.globalAlpha = 0.12 + 0.06 * near; poolFill(g, kx, ky + ks * 0.05, ks * 2.4, ks * 1.1, 1, TORCH);
  g.restore();
  // the floor beam (seen from high up it is a long wedge on the ground)
  cone(g, kx + ks * 0.12, ky - ks * 0.55, px, py, rx, ry, 0.9);
  K.drawPerson(g, kx, ky, ks, { view: "back", hood: true, t, shadow: true, light: { x: px, y: py, color: TORCH, strength: 0.8 }, alpha: 0.95 });
  K.glow(g, kx + ks * 0.12, ky - ks * 0.55, ks * 0.6, TORCH, 0.8);
  beamMotes(g, t, kx + ks * 0.12, ky - ks * 0.55, px, py, 0.5, { count: 60, size: 1.1, seed: 5 });
  coldMotes(g, W, H, t, 26, 8, 0.25);
}

// ---- SHOT 3 [20-30] close on the floor in the beam: faint amber pawprints ------------------------
const PRINTS = (() => {
  const out = [];
  for (let i = 0; i < 9; i++) {
    const z = 3.0 + i * 1.0;
    const x = Math.sin(i * 0.5) * 0.5 + (i % 2 ? 0.16 : -0.16);
    out.push({ X: x, Z: z, appear: 20 + i * 1.2 });
  }
  return out;
})();
// one paw print, toes up (local -y), painted once: a lobed main pad, four toe beans, and a dusty edge
// (the print is pressed into a skin of fine dust; amber, faintly self-lit)
function printSprite() {
  return K.sprite("f11print", 100, 100, (g) => {
    g.translate(50, 56);
    const R = K.rng("print");
    const pad = new Path2D();
    pad.moveTo(-20, 8);
    pad.bezierCurveTo(-24, -6, -12, -14, -6, -10);
    pad.quadraticCurveTo(0, -16, 6, -10);
    pad.bezierCurveTo(12, -14, 24, -6, 20, 8);
    pad.bezierCurveTo(18, 20, 8, 22, 0, 18);
    pad.bezierCurveTo(-8, 22, -18, 20, -20, 8);
    pad.closePath();
    const toes = [[-21, -24, 6.5, 8.5, -0.35], [-7.5, -33, 6.8, 9, -0.1], [7.5, -33, 6.8, 9, 0.1], [21, -24, 6.5, 8.5, 0.35]];
    const shape = new Path2D();
    shape.addPath(pad);
    for (const [x, y, rx, ry, a] of toes) K.ellipsePath(shape, x, y, rx, ry, a);
    // dusty edge: grains scattered round the outline, thinning outward
    for (let i = 0; i < 260; i++) {
      const a = R() * K.TAU, d = 18 + Math.pow(R(), 0.6) * 26;
      const x = Math.cos(a) * d * 1.1, y = Math.sin(a) * d - 8;
      g.fillStyle = `rgba(255,190,110,${(0.25 * (1 - (d - 18) / 26)).toFixed(3)})`;
      g.fillRect(x, y, 1 + R(), 1 + R());
    }
    const gr = g.createRadialGradient(0, -6, 2, 0, -6, 40);
    gr.addColorStop(0, "#ffd9a0"); gr.addColorStop(1, "#e08a30");
    g.fillStyle = gr;
    g.fill(shape);
    // pressed centre is darker (the dust was pushed out to the rim)
    g.fillStyle = "rgba(120,60,20,0.35)";
    g.beginPath(); g.ellipse(0, 4, 11, 8, 0, 0, K.TAU); g.fill();
    for (const [x, y, rx, ry, a] of toes) { g.beginPath(); g.ellipse(x, y + 1, rx * 0.55, ry * 0.5, a, 0, K.TAU); g.fill(); }
    // speckled texture inside
    g.save(); g.clip(shape);
    for (let i = 0; i < 120; i++) { g.fillStyle = R() < 0.5 ? "rgba(255,240,200,0.35)" : "rgba(90,40,10,0.3)"; g.fillRect((R() - 0.5) * 60, -44 + R() * 66, 1, 1); }
    g.restore();
  });
}
function shotPrints(g, t, W, H) {
  g.fillStyle = VOID; g.fillRect(0, 0, W, H);
  // the beam steps from print to print; the camera follows it
  const k = K.clamp((t - 20.2) / 1.2, 0, PRINTS.length - 1.001);
  const i0 = Math.floor(k), f = K.ease.inOut(K.clamp((k - i0) * 1.6 - 0.3));
  const a = PRINTS[i0], b = PRINTS[Math.min(PRINTS.length - 1, i0 + 1)];
  const fx = K.lerp(a.X, b.X, f), fz = K.lerp(a.Z, b.Z, f);
  const cam = floorCam(-80, 3.2, 360, 480, fx * 0.8, fz - 3.2);
  const [px, py] = cam.P(fx, fz);
  const rx = 150, ry = 105;
  const tx = 1100, ty = -200;
  grid(g, cam, { alpha: 0.25, z0: fz - 3, z1: fz + 14, x0: -10, x1: 10 });
  lit(g, W, H, "f11grid", (c) => grid(c, cam, { color: "#e8d4a8", alpha: 1, z0: fz - 3, z1: fz + 14, x0: -10, x1: 10, width: 1.4 }), (m) => poolFill(m, px, py, rx * 1.2, ry * 1.2), 0.7, "lighter");
  g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.18; poolFill(g, px, py, rx, ry, 1, TORCH); g.restore();
  // the prints: only really there inside the beam; outside it, just a faint amber glow
  const spr = printSprite();
  for (const pr of PRINTS) {
    if (t < pr.appear) continue;
    const [sx, sy] = cam.P(pr.X, pr.Z);
    const dz = pr.Z - (fz - 3.2);
    if (dz < 0.6) continue;
    const d = Math.hypot((sx - px) / rx, (sy - py) / ry);
    const light = K.clamp(1.15 - d);
    const fade = K.smooth(K.seg(t, pr.appear, pr.appear + 0.8));
    const sz = 255 / dz;                                   // ~80 px at the near print
    K.glow(g, sx, sy, sz * 0.9, "#ff9a3a", 0.12 * fade * (0.4 + light));
    if (light <= 0.01) continue;
    g.save();
    g.globalAlpha = light * fade * 0.95;
    g.translate(sx, sy);
    g.scale(1, 0.36 + 0.25 / dz);                          // flatter further away
    g.rotate(Math.sin(pr.Z) * 0.08 + (pr.X - fx) * 0.05);
    g.drawImage(spr, -sz / 2, -sz * 0.56, sz, sz);
    g.restore();
  }
  // hit 20: the first print breathes in
  const hit = K.env(t, 20, 21.6, 0.1, 1.2);
  if (hit > 0) { const [sx, sy] = cam.P(PRINTS[0].X, PRINTS[0].Z); K.glow(g, sx, sy, 70, "#ffb347", 0.25 * hit); }
  cone(g, tx, ty, px, py, rx, ry, 0.5);
  beamMotes(g, t, tx, ty, px, py, 0.16, { count: 90, size: 1.4, seed: 9 });
}

// ---- SHOT 4 [30-40] lost things drift through the beam ---------------------------------------------
// each lost thing is painted once (sprite, local origin at its centre) and stamped turning slowly
function woodGrain(g, x, y, w, h, R, base, dark) {
  g.fillStyle = base; g.fillRect(x, y, w, h);
  g.strokeStyle = dark; g.lineWidth = 0.8;
  for (let i = 0; i < Math.max(2, w / 3); i++) {
    const gx = x + R() * w;
    g.globalAlpha = 0.25 + R() * 0.3;
    g.beginPath(); g.moveTo(gx, y); g.bezierCurveTo(gx + (R() - 0.5) * 4, y + h * 0.3, gx + (R() - 0.5) * 4, y + h * 0.7, gx + (R() - 0.5) * 3, y + h); g.stroke();
  }
  g.globalAlpha = 1;
}
function fenceSprite() {
  return K.sprite("f11fence", 340, 150, (g) => {
    g.translate(170, 75);
    const R = K.rng("fence");
    const paint = "#ece6da", shadow = "#b8b0a2";
    // two rails behind the pickets
    for (const ry of [-26, 26]) {
      woodGrain(g, -165, ry - 7, 330, 14, R, "#d8d0c2", "rgba(120,100,80,0.6)");
      g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(-165, ry + 5, 330, 2);
    }
    // pickets: pointed tops, grain, peeling paint, nail heads on each rail
    for (let i = 0; i < 7; i++) {
      const x = -150 + i * 50, w = 30;
      g.save();
      g.beginPath(); g.moveTo(x, 70); g.lineTo(x, -52); g.lineTo(x + w / 2, -70); g.lineTo(x + w, -52); g.lineTo(x + w, 70); g.closePath();
      g.clip();
      woodGrain(g, x, -72, w, 144, R, paint, "rgba(140,120,96,0.55)");
      const sg = g.createLinearGradient(x, 0, x + w, 0);
      sg.addColorStop(0, "rgba(255,255,255,0.18)"); sg.addColorStop(0.6, "rgba(0,0,0,0)"); sg.addColorStop(1, "rgba(60,50,40,0.3)");
      g.fillStyle = sg; g.fillRect(x, -72, w, 144);
      for (let k = 0; k < 3; k++) { g.fillStyle = "rgba(122,96,70,0.5)"; g.fillRect(x + R() * w, -40 + R() * 100, 2 + R() * 5, 1 + R() * 3); }
      g.restore();
      g.fillStyle = shadow; g.fillRect(x + w - 2, -52, 2, 122);
      for (const ry of [-26, 26]) { g.fillStyle = "#6a6258"; g.beginPath(); g.arc(x + w / 2, ry, 1.8, 0, K.TAU); g.fill(); }
    }
  });
}
function chairSprite() {
  // a wooden kitchen chair in 3/4 perspective: seat as a parallelogram, four legs, spindle back
  return K.sprite("f11chair", 200, 260, (g) => {
    g.translate(100, 140);
    const R = K.rng("chair");
    const wood = "#8a6038", dark = "#4a3018", light = "#b08050";
    const leg = (x0, y0, x1, y1, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = "round"; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
    // back legs + back (behind the seat)
    leg(-50, -12, -54, 100, 7, dark); leg(38, -22, 36, 86, 7, dark);
    leg(-50, -12, -46, -120, 8, wood); leg(38, -22, 42, -128, 8, wood);
    g.fillStyle = wood;
    g.beginPath(); g.moveTo(-50, -124); g.quadraticCurveTo(-4, -136, 44, -134); g.lineTo(44, -118); g.quadraticCurveTo(-4, -120, -48, -108); g.closePath(); g.fill();
    g.fillStyle = "rgba(255,230,190,0.18)"; g.fillRect(-46, -128, 88, 3);
    for (let i = 1; i < 5; i++) { const x = -50 + i * 18; leg(x, -112 - i * 0.6, x + 1, -22 - i * 2, 4, i % 2 ? wood : "#7a5430"); }
    // seat: top face + front edge
    const seat = new Path2D();
    seat.moveTo(-62, 6); seat.lineTo(30, -6); seat.lineTo(58, -30); seat.lineTo(-30, -20); seat.closePath();
    g.save(); g.clip(seat); woodGrain(g, -64, -32, 124, 40, R, light, "rgba(90,60,30,0.6)"); g.restore();
    g.fillStyle = dark; g.beginPath(); g.moveTo(-62, 6); g.lineTo(30, -6); g.lineTo(30, 4); g.lineTo(-62, 16); g.closePath(); g.fill();
    g.fillStyle = "#6a4626"; g.beginPath(); g.moveTo(30, -6); g.lineTo(58, -30); g.lineTo(58, -20); g.lineTo(30, 4); g.closePath(); g.fill();
    // front legs + a stretcher
    leg(-58, 14, -62, 120, 8, wood); leg(28, 2, 30, 112, 8, "#6a4626");
    leg(-58, 70, 28, 62, 4, dark);
    g.fillStyle = "rgba(255,230,190,0.2)"; g.fillRect(-62, 18, 2, 96);
  });
}
function lampSprite() {
  // a street lamp post (off): tapered pole, collar, arm, lantern head with glass panes and a cap
  return K.sprite("f11lamp", 120, 300, (g) => {
    g.translate(40, 290);
    const pg = g.createLinearGradient(-6, 0, 6, 0);
    pg.addColorStop(0, "#1e2228"); pg.addColorStop(0.4, "#5a6068"); pg.addColorStop(1, "#14161a");
    g.fillStyle = pg;
    g.beginPath(); g.moveTo(-9, 0); g.lineTo(-4, -240); g.lineTo(4, -240); g.lineTo(9, 0); g.closePath(); g.fill();
    g.fillStyle = "#2a2e34"; g.fillRect(-12, -16, 24, 16); g.fillRect(-7, -150, 14, 8);
    g.strokeStyle = "#3a3e46"; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, -236); g.quadraticCurveTo(10, -262, 34, -258); g.stroke();
    // lantern: cap, four glass panes (two visible), frame, finial
    const hx = 40, hy = -252;
    g.fillStyle = "#1a1d22";
    g.beginPath(); g.moveTo(hx - 18, hy); g.lineTo(hx + 18, hy); g.lineTo(hx + 8, hy - 12); g.lineTo(hx - 8, hy - 12); g.closePath(); g.fill();
    g.fillRect(hx - 2, hy - 18, 4, 7);
    const gg = g.createLinearGradient(hx - 14, 0, hx + 14, 0);
    gg.addColorStop(0, "rgba(160,170,180,0.35)"); gg.addColorStop(0.5, "rgba(220,230,240,0.55)"); gg.addColorStop(1, "rgba(120,130,140,0.3)");
    g.fillStyle = gg;
    g.beginPath(); g.moveTo(hx - 15, hy); g.lineTo(hx + 15, hy); g.lineTo(hx + 10, hy + 30); g.lineTo(hx - 10, hy + 30); g.closePath(); g.fill();
    g.strokeStyle = "#1a1d22"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx, hy + 30); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.5)"; g.fillRect(hx - 11, hy + 3, 2, 22);
    g.fillStyle = "#1a1d22"; g.fillRect(hx - 11, hy + 30, 22, 4);
  });
}
function bookSprite() {
  // an open hardback, pages fanned, text lines on the pages
  return K.sprite("f11book", 120, 80, (g) => {
    g.translate(60, 44);
    g.fillStyle = "#3a5a8a";
    g.beginPath(); g.moveTo(-52, -18); g.lineTo(0, -8); g.lineTo(52, -18); g.lineTo(54, 20); g.lineTo(0, 30); g.lineTo(-54, 20); g.closePath(); g.fill();
    for (let k = 4; k >= 0; k--) {
      g.fillStyle = k ? `rgb(${226 - k * 10},${218 - k * 10},${196 - k * 10})` : "#f2ead6";
      for (const sd of [-1, 1]) {
        g.beginPath(); g.moveTo(0, -6 + k); g.quadraticCurveTo(sd * 24, -20 + k * 1.5, sd * (48 - k), -16 + k * 1.6);
        g.lineTo(sd * (49 - k), 16 + k * 0.6); g.quadraticCurveTo(sd * 24, 12 + k, 0, 26 + k * 0.4); g.closePath(); g.fill();
      }
    }
    g.strokeStyle = "rgba(60,50,40,0.35)"; g.lineWidth = 1;
    for (const sd of [-1, 1]) for (let l = 0; l < 7; l++) {
      const y = -9 + l * 4.5;
      g.beginPath(); g.moveTo(sd * 8, y + 2); g.quadraticCurveTo(sd * 24, y - 3, sd * (40 - (l % 3) * 4), y - 1); g.stroke();
    }
    g.strokeStyle = "rgba(0,0,0,0.3)"; g.beginPath(); g.moveTo(0, -6); g.lineTo(0, 26); g.stroke();
  });
}
const THINGS = [
  { k: "fence", w: 340, h: 150, x0: 1150, x1: -260, t0: 29.4, t1: 40.6, y: 190, bob: 16, r0: -0.25, rv: 0.03 },
  { k: "chair", w: 200, h: 260, x0: -180, x1: 1080, t0: 31.0, t1: 41.0, y: 300, bob: 20, r0: 0.6, rv: -0.05 },
  { k: "lamp", w: 120, h: 300, x0: 1150, x1: -200, t0: 33.8, t1: 40.4, y: 420, bob: 14, r0: 1.1, rv: 0.04 },
  { k: "book", w: 120, h: 80, x0: -100, x1: 820, t0: 32.6, t1: 40.6, y: 380, bob: 18, r0: 0.3, rv: 0.15 },
];
function floatingThings(c, t, tx, ty) {
  const sprites = { fence: fenceSprite, chair: chairSprite, lamp: lampSprite, book: bookSprite };
  THINGS.forEach((it, i) => {
    const x = K.lerp(it.x0, it.x1, K.seg(t, it.t0, it.t1)), y = it.y + Math.sin(t * 0.45 + i) * it.bob;
    c.save();
    c.translate(x, y);
    c.rotate(it.r0 + t * it.rv);
    c.drawImage(sprites[it.k](), -it.w / 2, -it.h / 2, it.w, it.h);
    c.restore();
    // the side away from the torch falls into a dark core
    const dx = tx - x, dy = ty - y, dl = Math.hypot(dx, dy) || 1, r = Math.max(it.w, it.h) * 0.6;
    c.save();
    c.globalCompositeOperation = "source-atop";
    const sg = c.createLinearGradient(x - dx / dl * r, y - dy / dl * r, x + dx / dl * r * 0.3, y + dy / dl * r * 0.3);
    sg.addColorStop(0, "rgba(4,3,8,0.85)"); sg.addColorStop(0.55, "rgba(4,3,8,0.35)"); sg.addColorStop(1, "rgba(4,3,8,0)");
    c.fillStyle = sg;
    c.beginPath(); c.arc(x, y, r * 1.1, 0, K.TAU); c.fill();
    c.restore();
  });
  // small lost things: a mitten and a ball
  [["#c2575b", 0], ["#e0b25a", 1]].forEach(([col, i]) => {
    const x = K.lerp(-60 + i * 300, 1020 - i * 200, K.seg(t, 30 + i * 1.4, 40 + i)), y = 140 + i * 120 + Math.sin(t * 0.6 + i) * 18;
    c.save(); c.translate(x, y); c.rotate(t * (0.2 + i * 0.1));
    const gr = c.createRadialGradient(-5, -6, 1, 0, 0, 22);
    gr.addColorStop(0, K.mix(col, "#ffffff", 0.3)); gr.addColorStop(1, K.mix(col, "#000000", 0.5));
    c.fillStyle = gr;
    if (i === 1) { c.beginPath(); c.arc(0, 0, 16, 0, K.TAU); c.fill(); c.strokeStyle = "rgba(0,0,0,0.3)"; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 16, 0.4, 2.6); c.stroke(); }
    else { c.beginPath(); c.ellipse(0, 0, 14, 20, 0, 0, K.TAU); c.fill(); c.beginPath(); c.ellipse(-13, 2, 6, 9, -0.5, 0, K.TAU); c.fill(); c.fillStyle = "#e8e0d0"; c.fillRect(-12, 14, 24, 9); }
    c.restore();
  });
}
function shotDrift(g, t, W, H) {
  g.fillStyle = VOID; g.fillRect(0, 0, W, H);
  const p = K.ease.inOut(K.seg(t, 30, 40.4));
  const tx = 1000, ty = 560;
  const ang = -2.62 + Math.sin(t * 0.35) * 0.06 + p * 0.06, sp = 0.3, len = 1250;
  const ex = tx + Math.cos(ang) * len, ey = ty + Math.sin(ang) * len;
  const maskCone = (m) => {
    for (const [k, al] of [[1, 0.35], [0.75, 0.35], [0.5, 0.45]]) {
      const gr = m.createRadialGradient(tx, ty, 0, tx, ty, len);
      gr.addColorStop(0, `rgba(255,255,255,${al})`); gr.addColorStop(0.55, `rgba(255,255,255,${al * 0.75})`); gr.addColorStop(1, "rgba(255,255,255,0)");
      m.fillStyle = gr;
      m.beginPath(); m.moveTo(tx, ty);
      m.arc(tx, ty, len, ang - sp * k, ang + sp * k);
      m.closePath(); m.fill();
    }
  };
  // the cone in the air (warm), then the things: lit ONLY where the beam touches them
  const Lb = K.layer(240, 135, "f11cone");
  Lb.g.scale(0.25, 0.25);
  maskCone(Lb.g);
  Lb.g.globalCompositeOperation = "source-in";
  Lb.g.fillStyle = TORCH; Lb.g.fillRect(0, 0, W, H);
  g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.1; g.imageSmoothingEnabled = true;
  g.drawImage(Lb.canvas, 0, 0, Lb.canvas.width, Lb.canvas.height, 0, 0, W, H);
  g.restore();
  lit(g, W, H, "f11things", (c) => {
    floatingThings(c, t, tx, ty);
    // warm torch tint on everything it touches
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = "rgba(255,226,170,0.2)"; c.fillRect(0, 0, W, H);
  }, (m) => {
    const gr = m.createRadialGradient(tx, ty, 0, tx, ty, len);
    gr.addColorStop(0, "#fff"); gr.addColorStop(0.7, "rgba(255,255,255,0.9)"); gr.addColorStop(1, "rgba(255,255,255,0.2)");
    m.fillStyle = gr;
    for (const [k, al] of [[1, 0.4], [0.82, 0.6], [0.62, 1]]) {
      m.globalAlpha = al;
      m.beginPath(); m.moveTo(tx, ty); m.arc(tx, ty, len, ang - sp * k, ang + sp * k); m.closePath(); m.fill();
    }
    m.globalAlpha = 1;
  }, 1);
  beamMotes(g, t, tx, ty, ex, ey, sp * 0.9, { count: 150, size: 1.6, seed: 12 });
  coldMotes(g, W, H, t, 36, 13, 0.3);
  K.glow(g, tx, ty, 120, TORCH, 0.5);
  K.glow(g, tx, ty, 40, HOT, 0.4);
  // swell 36: the beam brightens a breath, as if the dark leaned in to look
  const sw = K.env(t, 35.6, 39, 0.8, 2);
  if (sw > 0) { g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.05 * sw; g.drawImage(Lb.canvas, 0, 0, Lb.canvas.width, Lb.canvas.height, 0, 0, W, H); g.restore(); }
}

// ---- SHOT 5 [40-50] eyes in the dark; a black cat steps into the beam and sniffs your boot ---------
// your legs from the knee down: jeans (creased, stacked at the boot tops) tucked into red rubber
// boots seen in profile, toes to the left. Rim-lit from the pool on the left. Painted once.
const BOOT_H = 210;
function bootsSprite() {
  return K.sprite("f11boots", 420, 720, (g) => {
    g.translate(200, 700);
    const h = BOOT_H;
    // back leg first (further from us: a bit higher, darker), then the front leg, stepped forward
    for (const [ox, oy, dk] of [[h * 0.5, -10, 0.35], [-h * 0.1, 0, 0]]) {
      const bx = ox, by = oy;
      // jeans
      const jeans = new Path2D();
      jeans.moveTo(bx - h * 0.2, by - h * 3.2); jeans.lineTo(bx + h * 0.16, by - h * 3.2);
      jeans.bezierCurveTo(bx + h * 0.2, by - h * 2.2, bx + h * 0.24, by - h * 1.5, bx + h * 0.24, by - h * 0.94);
      jeans.lineTo(bx - h * 0.25, by - h * 0.94);
      jeans.bezierCurveTo(bx - h * 0.26, by - h * 1.6, bx - h * 0.24, by - h * 2.3, bx - h * 0.2, by - h * 3.2);
      jeans.closePath();
      const jg = g.createLinearGradient(bx - h * 0.26, 0, bx + h * 0.24, 0);
      jg.addColorStop(0, K.mix("#3a4e7a", "#000", dk)); jg.addColorStop(0.3, K.mix("#26324e", "#000", dk)); jg.addColorStop(1, K.mix("#0c1018", "#000", dk));
      g.fillStyle = jg; g.fill(jeans);
      g.save(); g.clip(jeans);
      // creases: stacked folds just above the boot, a long knee crease, the outer seam
      g.lineCap = "round";
      // (irregular: spacing, slant and depth vary; some folds stop short of the far edge)
      const FOLD = [[1.02, 6, 0.26], [1.08, -8, 0.12], [1.17, 10, 0.26], [1.25, -4, 0.04], [1.4, 7, 0.2]];
      for (const [fy, sk, end] of FOLD) {
        const y = by - h * fy + (dk ? 6 : 0);
        g.strokeStyle = "rgba(0,0,0,0.42)"; g.lineWidth = 2 + Math.abs(sk) * 0.2;
        g.beginPath(); g.moveTo(bx - h * 0.27, y + sk * 0.6); g.bezierCurveTo(bx - h * 0.1, y - sk, bx + h * 0.05, y + sk * 0.5, bx + h * end, y - 2); g.stroke();
        g.strokeStyle = "rgba(140,160,210,0.15)"; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(bx - h * 0.27, y + sk * 0.6 - 4); g.bezierCurveTo(bx - h * 0.1, y - sk - 4, bx + h * 0.02, y + sk * 0.5 - 4, bx + h * (end - 0.04), y - 6); g.stroke();
      }
      g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(bx - h * 0.15, by - h * 2.9); g.quadraticCurveTo(bx - h * 0.02, by - h * 2.2, bx + h * 0.06, by - h * 1.7); g.stroke();
      g.strokeStyle = "rgba(200,160,90,0.25)"; g.lineWidth = 1.2; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(bx + h * 0.15, by - h * 3.2); g.bezierCurveTo(bx + h * 0.19, by - h * 2.2, bx + h * 0.22, by - h * 1.5, bx + h * 0.22, by - h); g.stroke();
      g.setLineDash([]);
      // denim twill
      g.strokeStyle = "rgba(150,170,220,0.06)"; g.lineWidth = 1;
      g.beginPath(); for (let k = -40; k < 40; k++) { g.moveTo(bx - h * 0.3, by - h * 3.2 + k * 18); g.lineTo(bx + h * 0.3, by - h * 3.2 + k * 18 + 40); } g.stroke();
      g.restore();
      // boot: shaft, heel, toe curve
      const sh = new Path2D();
      sh.moveTo(bx - h * 0.22, by - h);
      sh.lineTo(bx + h * 0.22, by - h);
      sh.bezierCurveTo(bx + h * 0.24, by - h * 0.6, bx + h * 0.23, by - h * 0.3, bx + h * 0.22, by - h * 0.12);
      sh.lineTo(bx + h * 0.23, by - h * 0.02);                                 // heel back
      sh.lineTo(bx + h * 0.02, by - h * 0.02);
      sh.lineTo(bx - h * 0.02, by - h * 0.07);                                 // heel breast (instep gap)
      sh.lineTo(bx - h * 0.3, by - h * 0.06);
      sh.bezierCurveTo(bx - h * 0.46, by - h * 0.05, bx - h * 0.56, by - h * 0.06, bx - h * 0.55, by - h * 0.13); // toe curve
      sh.bezierCurveTo(bx - h * 0.53, by - h * 0.24, bx - h * 0.36, by - h * 0.26, bx - h * 0.22, by - h * 0.36);
      sh.closePath();
      const gr = g.createLinearGradient(bx - h * 0.55, 0, bx + h * 0.25, 0);
      gr.addColorStop(0, K.mix("#9a2a1e", "#000", dk)); gr.addColorStop(0.35, K.mix("#6a1a12", "#000", dk)); gr.addColorStop(1, K.mix("#1a060a", "#000", dk));
      g.fillStyle = gr; g.fill(sh);
      g.save(); g.clip(sh);
      // rubber: a soft specular streak down the shaft, a hot spot on the toe cap
      const spec = g.createLinearGradient(bx - h * 0.2, 0, bx - h * 0.06, 0);
      spec.addColorStop(0, "rgba(255,220,200,0)"); spec.addColorStop(0.5, `rgba(255,225,205,${0.32 - dk * 0.5})`); spec.addColorStop(1, "rgba(255,220,200,0)");
      g.fillStyle = spec; g.fillRect(bx - h * 0.2, by - h * 0.98, h * 0.14, h * 0.8);
      K.glow(g, bx - h * 0.42, by - h * 0.17, h * 0.07, "#fff0e0", 0.5 - dk);
      g.fillStyle = "rgba(255,240,230,0.7)"; g.beginPath(); g.ellipse(bx - h * 0.42, by - h * 0.18, h * 0.04, h * 0.012, -0.4, 0, K.TAU); g.fill();
      // the top band and a pull loop
      g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(bx - h * 0.25, by - h, h * 0.5, h * 0.06);
      g.restore();
      // sole: a separate dark rubber strip with tread notches and a lit edge
      g.fillStyle = "#120808";
      g.beginPath(); g.moveTo(bx - h * 0.55, by - h * 0.1); g.quadraticCurveTo(bx - h * 0.58, by - h * 0.01, bx - h * 0.44, by); g.lineTo(bx - h * 0.02, by); g.lineTo(bx - h * 0.02, by - h * 0.07);
      g.lineTo(bx + h * 0.02, by - h * 0.02); g.lineTo(bx + h * 0.02, by); g.lineTo(bx + h * 0.24, by); g.lineTo(bx + h * 0.24, by - h * 0.04); g.lineTo(bx - h * 0.5, by - h * 0.07); g.closePath(); g.fill();
      g.strokeStyle = `rgba(255,210,170,${0.45 - dk * 0.6})`; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(bx - h * 0.5, by - h * 0.07); g.lineTo(bx + h * 0.24, by - h * 0.04); g.stroke();
      g.fillStyle = "#050303"; for (let k = 0; k < 8; k++) g.fillRect(bx - h * 0.4 + k * h * 0.08, by - 3, 3, 3);
      const box = [bx - h * 0.7, by - h * 3.3, bx + h * 0.4, by + 4];
      K.crescent(g, sh, 4, 2, "#ffd9a8", 0.75 - dk, box, "lighter", 2);
      K.crescent(g, jeans, 3, 0, "#ffd9a8", 0.3 - dk * 0.5, box, "lighter", 2);
    }
  });
}
function boots(g, x, y) {
  g.fillStyle = "rgba(0,0,0,0.5)";
  g.beginPath(); g.ellipse(x + BOOT_H * 0.15, y + 4, BOOT_H * 0.8, BOOT_H * 0.07, 0, 0, K.TAU); g.fill();
  g.drawImage(bootsSprite(), x - 200, y - 700, 420, 720);
}
// the black cat, painted once per walk frame / sniff step, then stamped
const CAT_S = 88;
function blackCat(g, key, x, y, opts) {
  const w = CAT_S * 3.6, h = CAT_S * 2.2, ay = h - CAT_S * 0.3;
  const spr = K.sprite("f11bc:" + key, w, h, (c) => K.drawCat(c, w / 2, ay, CAT_S, Object.assign({
    facing: 1, t: 44, coat: K.COATS.black, collar: false, eyesGlow: 0.9, dark: true,
    light: { x: 900, y: 0, color: TORCH, strength: 1.2 }, tail: 0.5, shadow: false,
  }, opts)));
  g.drawImage(spr, x - w / 2, y - ay, w, h);
}
// where his nose is relative to his feet anchor, facing right (measured from the drawn cat)
const NOSE = [103, -45]; // pose "pounce", headTilt -0.4, size 88
function shotEyes(g, t, W, H) {
  g.fillStyle = VOID; g.fillRect(0, 0, W, H);
  const p = K.ease.inOut(K.seg(t, 40, 50.4));
  K.withCamera(g, W, H, { x: 480 + p * 20, y: 270, zoom: 1.02 + p * 0.05, shakeT: t, shakeAmt: 0.8 }, () => {
    const cam = floorCam(250, 1.0, 420, 480, -0.3, 0);
    const px = 430, py = 448, rx = 230, ry = 62;
    grid(g, cam, { alpha: 0.22, z0: 1.4, z1: 30 });
    lit(g, W, H, "f11grid", (c) => grid(c, cam, { color: "#e8d4a8", alpha: 1, z0: 1.4, z1: 30 }), (m) => poolFill(m, px, py, rx * 1.15, ry * 1.4), 0.6, "lighter");
    g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.18; poolFill(g, px, py, rx, ry, 1, TORCH); g.restore();
    cone(g, 820, -40, px, py, rx, ry, 0.5);
    eyeField(g, t, { skip: (e) => Math.hypot((e.x - px) / (rx * 1.2), (e.y - py) / (ry * 3)) < 1 });
    // the black cat: low, close, green-gold eyes first; then it steps into the light and stops with its
    // nose at your boot toe (~48.5), sniffing (small head bobs)
    const bootX = 735, bootY = 470;
    // the upper curve of the front boot toe (front boot is stepped forward by -0.1 h)
    const toeX = bootX - BOOT_H * 0.1 - BOOT_H * 0.5, toeY = bootY - BOOT_H * 0.2;
    const endX = toeX - NOSE[0] - 2, endY = toeY - NOSE[1];
    const walk = K.seg(t, 45.2, 48.4);
    const cx = K.lerp(150, endX, K.ease.out(walk)), cy = K.lerp(420, endY, walk);
    if (t < 45.2) {
      eyePair(g, 150, 388, 5.5, "#cfe05a", K.smooth(K.seg(t, 43.6, 44.4)), 0.2, 0.1);
    } else {
      const sniff = K.smooth(K.seg(t, 48.2, 48.6));
      const L = K.layer(W, H, "f11cat");
      if (walk < 1) {
        const q = Math.floor((((t - 45.2) * 1.25 % 1) + 1) % 1 * 10);
        blackCat(L.g, "w" + q, cx, cy, { pose: "walk", phase: q / 10, headTurn: 0.15 });
      } else {
        // sniffing: the head dips toward the toe and bobs (3 cached steps)
        const bob = sniff * (0.5 + 0.5 * Math.sin((t - 48.4) * 9));
        const bq = Math.round(bob * 2) / 2;
        blackCat(L.g, "s" + bq, cx, cy - bq * 2, { pose: "pounce", headTilt: -0.4 + bq * 0.12, tailUp: 0.5, eyesGlow: 0.6 });
      }
      // lit by the beam only: fades to black where the pool does not reach
      L.g.globalCompositeOperation = "destination-in";
      const lg = L.g.createRadialGradient(px, py - 40, 60, px, py - 40, 420);
      lg.addColorStop(0, "rgba(255,255,255,1)"); lg.addColorStop(0.6, "rgba(255,255,255,0.85)"); lg.addColorStop(1, "rgba(255,255,255,0.12)");
      L.g.fillStyle = lg; L.g.fillRect(0, 0, W, H);
      L.g.globalCompositeOperation = "source-over";
      g.drawImage(L.canvas, 0, 0, W, H);
      const inBeam = K.clamp(1.3 - Math.hypot((cx - px) / rx, (cy - py) / (ry * 2)));
      if (inBeam < 0.2) eyePair(g, cx + 50, cy - 100, 5, "#cfe05a", 1, 0.2, 0.2);
    }
    boots(g, bootX, bootY);
    beamMotes(g, t, 820, -40, px, py, 0.26, { count: 80, size: 1.3, seed: 17 });
  });
  coldMotes(g, W, H, t, 24, 18, 0.22);
}

// ---- SHOT 6 [50-58] the bell rings in the beam; every pair of eyes turns the same way --------------
// your fist round the torch, knuckles to the camera: fingers wrap the barrel from the far side, the
// thumb lies along the top. Local space: barrel along +x (lens at +x), fist centred at 0,0; the
// forearm and sleeve come in from below-right. u = scale.
function torchFist(g, x, y, ang, u, t, o = {}) {
  const skin = "#e8b48c", skinD = "#a8704c", COAT = "#e8b923";
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.scale(u, u);
  // forearm + sleeve: from the wrist (just behind the fist) back and down toward the elbow, which is
  // off-frame bottom right; a ribbed cuff at the wrist
  const AX = -0.92, AY = 0.4, NX = -AY, NY = AX;           // arm direction (local) and its normal
  const wx0 = -4, wy0 = 30;
  const slv = new Path2D();
  K.tube(slv, [wx0 + AX * 10, wy0 + AY * 10, wx0 + AX * 200, wy0 + AY * 200 + 10, wx0 + AX * 420, wy0 + AY * 420 + 30], [52, 64, 78], 4, true, true);
  const sg = g.createLinearGradient(wx0 + NX * 40, wy0 + NY * 40, wx0 - NX * 40, wy0 - NY * 40);
  sg.addColorStop(0, K.mix(COAT, "#000", 0.5)); sg.addColorStop(0.5, COAT); sg.addColorStop(1, K.mix(COAT, "#000", 0.4));
  g.fillStyle = sg; g.fill(slv);
  g.save(); g.clip(slv);
  for (let i = 0; i < 6; i++) {
    const d = 70 + i * 50, cx = wx0 + AX * d, cy = wy0 + AY * d;
    g.strokeStyle = "rgba(60,40,0,0.3)"; g.lineWidth = 5;
    g.beginPath(); g.moveTo(cx + NX * 45, cy + NY * 45 + (i % 2 ? 8 : -6)); g.quadraticCurveTo(cx + AX * 14, cy + AY * 14, cx - NX * 45, cy - NY * 45); g.stroke();
  }
  // ribbed cuff band
  g.strokeStyle = K.mix(COAT, "#000", 0.28); g.lineWidth = 30;
  g.beginPath(); g.moveTo(wx0 + AX * 26 + NX * 40, wy0 + AY * 26 + NY * 40); g.lineTo(wx0 + AX * 26 - NX * 40, wy0 + AY * 26 - NY * 40); g.stroke();
  g.strokeStyle = "rgba(60,40,0,0.35)"; g.lineWidth = 1.2;
  g.beginPath();
  for (let i = -7; i <= 7; i++) { const cx = wx0 + AX * 26 + NX * i * 5.5, cy = wy0 + AY * 26 + NY * i * 5.5; g.moveTo(cx - AX * 14, cy - AY * 14); g.lineTo(cx + AX * 14, cy + AY * 14); }
  g.stroke();
  g.restore();
  // wrist
  g.fillStyle = skinD;
  g.beginPath(); g.ellipse(-4, 26, 24, 16, 0.4, 0, K.TAU); g.fill();
  // barrel (behind the fingers): brushed metal tube, tail cap, head + lens ring
  const bg = g.createLinearGradient(0, -14, 0, 14);
  bg.addColorStop(0, "#3a3e46"); bg.addColorStop(0.3, "#c8ced8"); bg.addColorStop(0.5, "#8a909a"); bg.addColorStop(1, "#22252a");
  g.fillStyle = bg;
  g.fillRect(-62, -12, 210, 24);
  g.fillStyle = "#2a2d33"; g.fillRect(-70, -10, 10, 20);
  g.fillStyle = bg;
  g.beginPath(); g.moveTo(140, -12); g.lineTo(156, -19); g.lineTo(186, -19); g.lineTo(186, 19); g.lineTo(156, 19); g.lineTo(140, 12); g.closePath(); g.fill();
  g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1;
  g.beginPath(); for (let k = 0; k < 6; k++) { g.moveTo(-50 + k * 6, -12); g.lineTo(-50 + k * 6, 12); } g.stroke();
  g.fillStyle = "#fffaf0"; g.beginPath(); g.ellipse(186, 0, 4, 18, 0, 0, K.TAU); g.fill();
  // the fist: back of the hand toward us
  const dorsum = new Path2D();
  dorsum.moveTo(-34, 2);
  dorsum.bezierCurveTo(-38, 22, -24, 40, 0, 40);
  dorsum.bezierCurveTo(22, 40, 34, 26, 34, 6);
  dorsum.lineTo(34, -4); dorsum.lineTo(-34, -4); dorsum.closePath();
  const dg = g.createLinearGradient(0, -4, 0, 40);
  dg.addColorStop(0, skin); dg.addColorStop(1, skinD);
  g.fillStyle = dg; g.fill(dorsum);
  // four fingers wrapped over the barrel from the far side: we see their middle segments as rounded
  // bands, the knuckle row as a ridge of bumps, the tips tucked out of sight under the barrel
  const fingers = new Path2D();
  for (let i = 0; i < 4; i++) {
    const fx = -27 + i * 17.5, fw = 16.5 - i * 0.8;
    const p = new Path2D();
    p.moveTo(fx - fw / 2, 6);
    p.bezierCurveTo(fx - fw / 2 - 1, -10, fx - fw / 2 + 1, -18, fx, -19);
    p.bezierCurveTo(fx + fw / 2 - 1, -18, fx + fw / 2 + 1, -10, fx + fw / 2, 6);
    p.quadraticCurveTo(fx, 10, fx - fw / 2, 6);
    p.closePath();
    const fg = g.createLinearGradient(0, -19, 0, 8);
    fg.addColorStop(0, K.mix(skin, "#ffe8d8", 0.3)); fg.addColorStop(0.5, skin); fg.addColorStop(1, skinD);
    g.fillStyle = fg; g.fill(p);
    fingers.addPath(p);
    // the gap between fingers and a soft crease at the middle joint
    g.strokeStyle = "rgba(90,40,20,0.45)"; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(fx + fw / 2, 6); g.lineTo(fx + fw / 2, -12); g.stroke();
    g.strokeStyle = "rgba(120,60,30,0.35)";
    g.beginPath(); g.moveTo(fx - fw * 0.3, -6); g.quadraticCurveTo(fx, -8, fx + fw * 0.3, -6); g.stroke();
  }
  // knuckle bumps (highlights) on the ridge
  for (let i = 0; i < 4; i++) {
    const fx = -27 + i * 17.5;
    g.fillStyle = "rgba(255,230,210,0.5)";
    g.beginPath(); g.ellipse(fx, 9, 5, 2.6, 0, 0, K.TAU); g.fill();
    g.fillStyle = "rgba(140,70,40,0.3)";
    g.beginPath(); g.ellipse(fx, 13, 6, 1.6, 0, 0, K.TAU); g.fill();
  }
  // tendons fanning to the knuckles
  g.strokeStyle = "rgba(255,230,210,0.16)"; g.lineWidth = 2;
  g.beginPath(); for (let i = 0; i < 4; i++) { g.moveTo(-6 + i * 3, 36); g.lineTo(-27 + i * 17.5, 14); } g.stroke();
  // thumb along the top of the barrel, pointing at the lens, nail showing
  const th = new Path2D();
  th.moveTo(26, 8); th.bezierCurveTo(36, -2, 48, -16, 70, -16);
  th.bezierCurveTo(80, -16, 84, -10, 80, -5); th.bezierCurveTo(68, -4, 50, 0, 36, 14); th.closePath();
  const tg = g.createLinearGradient(0, -18, 0, 14);
  tg.addColorStop(0, K.mix(skin, "#ffe8d8", 0.25)); tg.addColorStop(1, skinD);
  g.fillStyle = tg; g.fill(th);
  g.fillStyle = "#f0d0c0"; g.beginPath(); g.ellipse(74, -12, 6, 3.4, -0.1, 0, K.TAU); g.fill();
  g.fillStyle = "rgba(255,255,255,0.45)"; g.fillRect(70, -14, 5, 1.2);
  // warm spill from the beam on the thumb side, cool ambient on the far edge
  const all = new Path2D(); all.addPath(dorsum); all.addPath(fingers); all.addPath(th);
  K.crescent(g, all, -3, 3, TORCH, 0.6, [-40, -30, 90, 45], "lighter", 2);
  K.crescent(g, all, 3, -3, "#3a1a0a", 0.3, [-40, -30, 90, 45], "source-over", 2);
  // the bell's red string round the wrist, just in front of the cuff
  g.strokeStyle = "#a8322e"; g.lineWidth = 2.4;
  g.beginPath(); g.moveTo(-14 + NX * 26, 30 + NY * 26); g.quadraticCurveTo(-8 + NX * 2 + 6, 48, -14 - NX * 26, 30 - NY * 26); g.stroke();
  g.restore();
  // bell position in screen space (local (-6, 46): hanging off the string toward the camera)
  const ca = Math.cos(ang), sa = Math.sin(ang);
  return { bx: x + (-6 * ca - 46 * sa) * u, by: y + (-6 * sa + 46 * ca) * u, lx: x + 186 * ca * u, ly: y + 186 * sa * u };
}
function shotBell(g, t, W, H) {
  g.fillStyle = VOID; g.fillRect(0, 0, W, H);
  const p = K.ease.inOut(K.seg(t, 50, 58));
  const ring = 50.0;
  const shake = K.env(t, ring, ring + 1.6, 0.05, 1.4);
  K.withCamera(g, W, H, { x: 480, y: 270, zoom: 1.03 + p * 0.06, shakeT: t, shakeAmt: 0.9 }, () => {
    const ang = -2.25;
    const wx = 600 + Math.sin(t * 9) * shake * 3, wy = 360;
    // the beam: wide, soft, volumetric, out of the lens toward the upper left; where it reaches the
    // floor far away it lays a faint patch; any eyes inside it flare
    const lens = { x: wx + Math.cos(ang) * 186 * 1.35, y: wy + Math.sin(ang) * 186 * 1.35 };
    const far = { x: lens.x + Math.cos(ang - 0.08) * 760, y: lens.y + Math.sin(ang - 0.08) * 760 + 120 };
    const spread = 0.42;
    const inBeam = (x, y) => {
      const vx = x - lens.x, vy = y - lens.y, vl = Math.hypot(vx, vy) || 1;
      const ax = far.x - lens.x, ay = far.y - lens.y, al = Math.hypot(ax, ay);
      const c = (vx * ax + vy * ay) / (vl * al);
      return K.clamp((c - Math.cos(spread)) / (1 - Math.cos(spread)) * 1.6);
    };
    // floor patch
    g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.14;
    poolFill(g, far.x + 60, far.y + 70, 260, 70, 1, TORCH); g.restore();
    // eyes everywhere, nearer and bigger; those in the beam catch it
    eyeField(g, t, { ring, allOpen: true, scale: 1.25, dy: -40, shine: inBeam });
    // far amber hint on the left horizon: where they are all looking (and where the prints lead)
    const lead = K.smooth(K.seg(t, 51.4, 55.5));
    K.glow(g, 40, 250, 180, "#ffb347", 0.08 + 0.3 * lead); K.glow(g, 40, 250, 36, "#ffd27a", 0.1 + 0.45 * lead);
    // volumetric cone (quarter-res)
    const Lc = K.layer(240, 135, "f11cone");
    const c = Lc.g;
    c.scale(0.25, 0.25);
    c.globalCompositeOperation = "lighter";
    const ax = Math.atan2(far.y - lens.y, far.x - lens.x);
    for (const [k, al] of [[1, 0.06], [0.7, 0.07], [0.4, 0.09], [0.16, 0.1]]) {
      const gr = c.createRadialGradient(lens.x, lens.y, 0, lens.x, lens.y, 900);
      gr.addColorStop(0, K.rgba(k < 0.2 ? HOT : TORCH, al * 2.4)); gr.addColorStop(0.4, K.rgba(TORCH, al)); gr.addColorStop(1, K.rgba(TORCH, 0));
      c.fillStyle = gr;
      c.beginPath(); c.moveTo(lens.x, lens.y); c.arc(lens.x, lens.y, 900, ax - spread * k, ax + spread * k); c.closePath(); c.fill();
    }
    g.save(); g.globalCompositeOperation = "lighter"; g.imageSmoothingEnabled = true;
    g.drawImage(Lc.canvas, 0, 0, Lc.canvas.width, Lc.canvas.height, 0, 0, W, H);
    g.restore();
    beamMotes(g, t, lens.x, lens.y, far.x, far.y, spread * 0.9, { count: 160, size: 1.6, seed: 23 });
    // the warm spill back onto the hand
    K.glow(g, wx - 40, wy - 30, 190, TORCH, 0.16);
    const fist = torchFist(g, wx, wy, ang, 1.35, t);
    K.glow(g, fist.lx, fist.ly, 60, HOT, 0.6);
    // the bell, ~18 px, in front of the cuff; it flashes as it rings at 50.0
    const bx = fist.bx + Math.sin(t * 14) * shake * 2, by = fist.by + Math.sin(t * 3) * 0.8;
    K.drawBell(g, bx, by, 18, { t, glint: 0.8 });
    const flash = K.env(t, ring - 0.05, ring + 0.9, 0.08, 0.8);
    K.bellGlint(g, bx, by, 16 + flash * 26, t, { strength: 0.35 + flash * 1.3 });
    for (let i = 0; i < 4; i++) {
      const age = t - ring - i * 0.35;
      if (age < 0 || age > 3) continue;
      const r = 20 + age * 220;
      g.strokeStyle = K.rgba("#ffe9b0", 0.2 * (1 - age / 3));
      g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(bx, by, r, r * 0.6, 0, 0, K.TAU); g.stroke();
    }
  });
  coldMotes(g, W, H, t, 30, 21, 0.25);
}

// ---- edit -------------------------------------------------------------------------------------------
const SHOTS = [[0, 12, shotSweep], [12, 20, shotFar], [20, 30, shotPrints], [30, 40, shotDrift], [40, 50, shotEyes], [50, 58.5, shotBell]];
const XF = { 12: 0.8, 30: 0.8, 40: 0.6 };
function render(g, t, W, H) {
  let i = SHOTS.findIndex((s) => t < s[1]);
  if (i < 0) i = SHOTS.length - 1;
  const [a, , fn] = SHOTS[i];
  const xin = XF[a];
  if (xin && i > 0 && t < a + xin) {
    SHOTS[i - 1][2](g, t, W, H);
    const L = K.layer(W, H, "f11xf");
    fn(L.g, t, W, H);
    g.save(); g.globalAlpha = K.smooth((t - a) / xin); g.drawImage(L.canvas, 0, 0, W, H); g.restore();
  } else fn(g, t, W, H);
}

export const film = {
  id: 11,
  title: "Nothing",
  chapter: "Chapter 11",
  unlockAt: 55,
  duration: D,
  poster: 30,
  tagline: "Where the light goes to sleep.",
  subs: [
    [5.0, 9.0, "The nil Void. Nothing. At all."],
    [13.0, 17.5, "Your flashlight was the only light there was."],
    [21.5, 26.0, "But even here, his pawprints."],
    [31.0, 35.5, "Pieces of the world floated by. Lost things."],
    [41.0, 45.0, "Eyes. Hundreds of eyes."],
    [45.5, 49.0, "Lost cats. Waiting in the dark."],
    [51.0, 56.0, "When the bell rang, they all looked the same way."],
  ],
  voice: [
    [5.0, "The nil Void. Nothing. At all.", { rate: 0.88, pitch: 0.98 }],
    [13.0, "Your flashlight was the only light there was.", { rate: 0.92, pitch: 1.0 }],
    [21.5, "But even here, his pawprints.", { rate: 0.92, pitch: 1.0 }],
    [31.0, "Pieces of the world floated by. Lost things.", { rate: 0.92, pitch: 1.0 }],
    [41.0, "Eyes. Hundreds of eyes.", { rate: 0.9, pitch: 1.0 }],
    [45.5, "Lost cats. Waiting in the dark.", { rate: 0.9, pitch: 1.0 }],
    [51.0, "When the bell rang, they all looked the same way.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: { mood: "mystery", key: "C", bpm: 54, cues: [[0, "drop"], [20, "hit"], [36, "swell"], [50, "bell"]] },
  draw(g, t, W, H) {
    g.save();
    if (W !== 960 || H !== 540) g.scale(W / 960, H / 540);
    const w = 960, h = 540;
    render(g, t, w, h);
    K.finish(g, w, h, t, { bloom: 0.5, tint: "#3a3a6a", tintAlpha: 0.08, vignette: 0.7, grain: 0.07, letterbox: 1 });
    K.fadeBlack(g, w, h, K.smooth(K.seg(t, 56.5, 58)));
    g.restore();
  },
};
