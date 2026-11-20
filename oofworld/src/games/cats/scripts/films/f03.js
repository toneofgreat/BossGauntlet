// films/f03.js - Chapter 3 "Missing" (FILMS.md f03). Catford Town in light rain at blue hour.
// draw(g, t, W, H) is a pure function of t: every shot derives its state from t; static art is
// cached through SPR()/K.layer() keyed by string.
import * as K from "../filmkit.js";

const D = 66;
const LW = 960, LH = 540;
const SKY_TOP = "#0b1830", SKY_MID = "#1e3556", SKY_LOW = "#4d5f84", HORIZON = "#7d7c9a";
const FOG = "#5a6a8c";
const WARM = "#ffc27a", LAMP = "#ffb25a", NEON = "#ff6fa8";

// ---- tiny helpers ----------------------------------------------------------------------------------
const { clamp, lerp, seg, smooth, mix, rgba, shade, hash, noise, glow } = K;
const eio = (x) => K.ease.inOut(clamp(x));
const TAU = Math.PI * 2;
function SPR(k, w, h, f) { return K.sprite(k, w, h, f); }

function quad(g, a, b, c, d, fill) {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]);
  g.closePath();
  g.fill();
}

// Paint fn into a small offscreen box, then pull it toward an ambient colour (source-atop), so
// bright kit figures sit inside a dark night scene. Rim light can be re-added afterwards.
function tinted(g, key, bx, by, bw, bh, fn, color, amt) {
  const L = K.layer(Math.ceil(bw), Math.ceil(bh), "f03t:" + key);
  L.g.translate(-bx, -by);
  try { fn(L.g); } catch (err) { console.warn("[f03] tinted", key, err); }
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

// A broken, rippling reflection of a light on wet stone: stacked soft dashes, additive.
function reflStreak(g, x, y0, len, w, color, a, t, seed) {
  if (a <= 0.01) return;
  // a soft continuous column (the light smeared by the micro-facets of the wet stone) broken into
  // many thin horizontal glints by the ripples, wider and sparser toward the camera
  // Wet stone is a rough mirror: the micro-facets stretch a light's reflection into a long VERTICAL
  // anisotropic streak toward the camera (narrow, brightest near the foot of the light, softening and
  // widening as it comes closer). The rain ripples only shimmer it: a few overlapping, vertically
  // elongated lobes that sway a little sideways, never horizontal dashes.
  const spr = K.glowSprite(color);
  g.save();
  g.globalCompositeOperation = "lighter";
  // the broad sheen (rough micro-facets) and the tight specular core
  g.globalAlpha = Math.min(1, a * 0.3);
  g.drawImage(spr, x - w * 1.5, y0 - len * 0.12, w * 3, len * 1.05);
  g.globalAlpha = Math.min(1, a * 0.55);
  g.drawImage(spr, x - w * 0.42, y0 - len * 0.06, w * 0.84, len * 0.8);
  const n = Math.max(4, Math.min(10, Math.round(len / 22)));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const yy = y0 + Math.pow(u, 1.15) * len;
    const sway = noise(t * 0.9 + i * 0.7, seed + 3) * w * 0.3 * (0.4 + u);
    const ww = w * (0.45 + 0.35 * Math.abs(noise(i * 0.9 + t * 1.3, seed))) * (1 + u * 0.7);
    const hh = (len / n) * (1.1 + 0.4 * u);
    const al = a * Math.pow(1 - u * 0.92, 1.3) * (0.55 + 0.45 * Math.abs(Math.sin(i * 2.3 + t * 2.2 + seed)));
    if (al < 0.02) continue;
    g.globalAlpha = Math.min(1, al * 0.6);
    g.drawImage(spr, x - ww + sway, yy - hh, ww * 2, hh * 2);
  }
  g.restore();
}

// out-of-focus city lights (bokeh discs with a brighter rim, like a real lens)
function bokehSprite(color) {
  return SPR("f03bokeh:" + color, 64, 64, (s) => {
    const gr = s.createRadialGradient(32, 32, 0, 32, 32, 31);
    gr.addColorStop(0, rgba(color, 0.35));
    gr.addColorStop(0.78, rgba(color, 0.5));
    gr.addColorStop(0.92, rgba(mix(color, "#ffffff", 0.3), 0.75));
    gr.addColorStop(1, rgba(color, 0));
    s.fillStyle = gr;
    s.beginPath();
    s.arc(32, 32, 31, 0, Math.PI * 2);
    s.fill();
  });
}
function bokeh(g, x, y, r, color, a) {
  g.save();
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = a;
  g.drawImage(bokehSprite(color), x - r, y - r, r * 2, r * 2);
  g.restore();
}

// handwriting in "crayon": a few jittered passes of the same text
function crayon(g, text, x, y, size, color, seed, align = "center") {
  g.save();
  g.font = `700 ${size}px "Segoe Print", "Comic Sans MS", "Bradley Hand", cursive`;
  g.textAlign = align;
  g.textBaseline = "middle";
  for (let i = 0; i < 4; i++) {
    g.globalAlpha = i === 0 ? 0.85 : 0.35;
    g.fillStyle = i === 3 ? shade(color, -0.2) : color;
    g.fillText(text, x + (hash(i, seed) - 0.5) * size * 0.06, y + (hash(i + 0.5, seed) - 0.5) * size * 0.06);
  }
  g.restore();
}

// a hand-drawn crayon capital B: stem, then a smaller upper bowl and a bigger lower bowl
function crayonB(s, x, y, fs, color) {
  const top = y - fs * 0.38, mid = y + fs * 0.0, bot = y + fs * 0.38, w1 = fs * 0.36, w2 = fs * 0.44;
  s.save();
  s.lineCap = "round"; s.lineJoin = "round";
  for (let i = 0; i < 3; i++) {
    const j = (k) => (hash(i * 5 + k, 41) - 0.5) * fs * 0.05;
    s.strokeStyle = rgba(i === 2 ? shade(color, -0.2) : color, i ? 0.4 : 0.85);
    s.lineWidth = fs * 0.12;
    s.beginPath();
    s.moveTo(x + j(0), bot + j(1)); s.lineTo(x + j(2), top + j(3));
    s.bezierCurveTo(x + w1 + j(4), top - fs * 0.02, x + w1 + j(5), mid - fs * 0.02, x + j(6), mid);
    s.bezierCurveTo(x + w2 + j(7), mid - fs * 0.02, x + w2 + j(8), bot + fs * 0.03, x + j(9), bot);
    s.stroke();
  }
  s.restore();
}

// ---- photographic helpers -------------------------------------------------------------------------
// Albedo x light: paint the surfaces' own colour (textured), paint a light map (ambient sky + every
// motivated light falling on them), multiply. Emissive things (lamps, lit glass) go on afterwards.
// read = true: a CPU-backed canvas (willReadFrequently), for builders that getImageData it - a
// GPU canvas would have to flush and read back every queued draw first (tens of seconds on a
// software-rasterised GPU)
function scratchCanvas(w, h, read = false) {
  const px = K.pixelScale();
  const c = K.makeCanvas(Math.ceil(w * px), Math.ceil(h * px));
  const x = read ? c.getContext("2d", { willReadFrequently: true }) : c.getContext("2d");
  x.setTransform(px, 0, 0, px, 0, 0);
  return [c, x];
}
// light the albedo already painted on canvas A (ctx a) with a light map painted by lightFn
function applyLight(a, A, w, h, lightFn) {
  const [T, tx] = scratchCanvas(w, h);
  try { lightFn(tx); } catch (err) { console.warn("[f03] light", err); }
  tx.setTransform(1, 0, 0, 1, 0, 0);
  tx.globalCompositeOperation = "destination-in";
  tx.drawImage(A, 0, 0);
  a.save();
  a.setTransform(1, 0, 0, 1, 0, 0);
  a.globalCompositeOperation = "multiply";
  a.drawImage(T, 0, 0);
  a.restore();
}
// an elliptical inverse-square light pool (rx != ry), for light falling on walls seen at an angle
function pool(g, x, y, rx, ry, color, I) {
  if (rx < 0.5 || ry < 0.5 || I <= 0) return;
  g.save();
  g.translate(x, y);
  g.scale(rx / ry, 1);
  K.lightPool(g, 0, 0, ry, color, { intensity: I });
  g.restore();
}

// A textured vertical wall plane X = const, receding in z, painted in thin perspective-correct
// strips (each strip is one affine slice of the texture). pr = {vx, vy, f, eye}.
function wallStrips(s, pr, X, z0, z1, Y0, Y1, tex, texO, tileW, tileH, fogC, fogFn, opt = {}) {
  const pj = (Y, z) => [pr.vx + (X / z) * pr.f, pr.vy + ((pr.eye - Y) / z) * pr.f];
  const tc = K.texture(tex, texO), ts = tc.width;
  const pat = K.texPattern(s, tex, texO);
  const step = opt.step || 2.5;
  let za = Math.max(0.3, z0);
  s.save();
  while (za < z1 - 1e-4) {
    const zb = Math.min(z1, za + Math.max(0.015, (step * za * za) / (Math.abs(X) * pr.f)));
    const xa = pj(0, za)[0], xb = pj(0, zb)[0];
    const dxdz = (xb - xa) / (zb - za), zm = (za + zb) / 2, sc = pr.f / zm;
    if (pat.setTransform) pat.setTransform(new DOMMatrix([(tileW / ts) * dxdz, 0, 0, (tileH / ts) * sc, xa - za * dxdz + (opt.ox || 0) * dxdz, pr.vy + pr.eye * sc - Y1 * sc * 0 + (opt.oy || 0)]));
    const zb2 = zb + (zb - za) * 0.35; // overlap: no hairline seams between strips
    const p0 = pj(Y0, za), p1 = pj(Y1, za), p2 = pj(Y1, zb2), p3 = pj(Y0, zb2);
    s.beginPath(); s.moveTo(p0[0], p0[1]); s.lineTo(p1[0], p1[1]); s.lineTo(p2[0], p2[1]); s.lineTo(p3[0], p3[1]); s.closePath();
    s.fillStyle = pat;
    s.fill();
    if (opt.tint) { s.globalAlpha = opt.tintA == null ? 0.5 : opt.tintA; s.fillStyle = opt.tint; s.globalCompositeOperation = opt.tintMode || "multiply"; s.fill(); s.globalCompositeOperation = "source-over"; s.globalAlpha = 1; }
    const k = fogFn ? fogFn(zm) : 0;
    if (k > 0.004) { s.fillStyle = rgba(fogC, k); s.fill(); }
    za = zb;
  }
  s.restore();
}

// ---- the street (shots 1 and 7, and seen out of focus in 2, 4 and 6) -------------------------------
const VPX = 480, VPY = 262, F = 520, EYE = 1.6;
const PR = { vx: VPX, vy: VPY, f: F, eye: EYE };
const P = (X, Y, Z) => [VPX + (X / Z) * F, VPY + ((EYE - Y) / Z) * F];
const hz = (z) => clamp(1 - Math.exp(-z / 48), 0, 0.93); // atmospheric perspective amount
const FOG_ALB = "#9aa6c4"; // what far surfaces fade to in albedo (the light map turns it into fog glow)

const LAMPS = [];
for (let z = 5; z < 100; z += 8.5) { LAMPS.push([-4.7, z]); LAMPS.push([4.7, z + 4]); }
const SHOPS = []; // lit shop windows (for reflections): [X, z, color]
let CAFE = null;
const MATS = [
  ["brick", { seed: 3, color: "#7a3e2e", wet: 0.6, size: 128 }, 0.9, 0.6],
  ["brick", { seed: 5, color: "#5a3a30", wet: 0.6, size: 128, mortar: "#7a7268" }, 0.9, 0.6],
  ["plaster", { seed: 2, color: "#b8ab92", grime: "#4a4038", stain: 0.6, size: 128 }, 2.2, 2.2],
  ["plaster", { seed: 4, color: "#8a96a0", grime: "#3a3a3a", stain: 0.5, size: 128 }, 2.2, 2.2],
  ["brick", { seed: 7, color: "#8a5040", wet: 0.6, size: 128 }, 0.9, 0.6],
];

function buildings(side) {
  const R = K.rng("f03b" + side);
  const out = [];
  let z = 2.2;
  while (z < 108) {
    const w = 5 + R() * 6;
    out.push({ z0: z, z1: z + w, h: 7.5 + R() * 7.5, mat: Math.floor(R() * MATS.length), R: R(), shop: ["#6a2224", "#1e4232", "#22305a", "#5a3e18", "#3e2250"][Math.floor(R() * 5)] });
    z += w + 0.05;
  }
  return out;
}
const BLD = { "-1": buildings(-1), "1": buildings(1) };
(function prep() {
  for (const s of [-1, 1]) for (const b of BLD[s]) {
    const lit = hash(b.z0, 7 + s) > 0.25;
    b.lit = lit;
    if (lit && b.z0 < 70) SHOPS.push([s * 6.5, (b.z0 + b.z1) / 2, hash(b.z0, 9) > 0.5 ? WARM : "#ffd9a0"]);
  }
  const c = BLD["1"].find((b) => b.z0 > 11);
  c.cafe = true;
  c.lit = true;
  CAFE = c;
})();

// ALBEDO pass of one building: textured brick/render, stone dressings, window reveals, shopfront frame.
function facadeAlbedo(s, side, b) {
  const X = side * 6.5;
  const k = hz((b.z0 + b.z1) / 2);
  const [tex, to, tw, th] = MATS[b.mat];
  const fogF = (z) => hz(z) * 0.9;
  // the gable/front face toward the camera (visible above lower, nearer buildings)
  const fx = side * 26;
  const fp = new Path2D();
  const a0 = P(X, 0, b.z0), a1 = P(X, b.h, b.z0), a2 = P(fx, b.h, b.z0), a3 = P(fx, 0, b.z0);
  fp.moveTo(a0[0], a0[1]); fp.lineTo(a1[0], a1[1]); fp.lineTo(a2[0], a2[1]); fp.lineTo(a3[0], a3[1]); fp.closePath();
  K.texFill(s, tex, fp, { tex: to, scale: (tw / b.z0) * F, scaleY: (th / b.z0) * F, tint: "#5a5a68", tintAlpha: 0.5 });
  s.fillStyle = rgba(FOG_ALB, hz(b.z0) * 0.9);
  s.fill(fp);
  // the facade itself
  wallStrips(s, PR, X, b.z0, b.z1, 0, b.h, tex, to, tw, th, FOG_ALB, fogF, { ox: b.R * 3 });
  const stone = mix("#a49c8c", FOG_ALB, k * 0.9), stoneDk = mix("#4a4640", FOG_ALB, k * 0.9);
  // cornice: projecting moulding with its shadow under it, brackets
  quad(s, P(X, b.h - 0.5, b.z0), P(X, b.h, b.z0), P(X, b.h, b.z1), P(X, b.h - 0.5, b.z1), stone);
  quad(s, P(X, b.h - 0.85, b.z0), P(X, b.h - 0.5, b.z0), P(X, b.h - 0.5, b.z1), P(X, b.h - 0.85, b.z1), rgba("#0a0a0c", 0.55 * (1 - k)));
  if (b.z0 < 40) for (let z = b.z0 + 0.2; z < b.z1 - 0.1; z += 0.55) quad(s, P(X, b.h - 0.95, z), P(X, b.h - 0.5, z), P(X, b.h - 0.5, z + 0.16), P(X, b.h - 0.95, z + 0.16), stone);
  // string course over the shop, with its drip shadow
  quad(s, P(X, 3.55, b.z0), P(X, 3.8, b.z0), P(X, 3.8, b.z1), P(X, 3.55, b.z1), stone);
  quad(s, P(X, 3.3, b.z0), P(X, 3.55, b.z0), P(X, 3.55, b.z1), P(X, 3.3, b.z1), rgba("#0a0a0c", 0.4 * (1 - k)));
  // rain streaks: the wall is darker and stained under every sill and the cornice
  // upper windows: stone surround, recessed glass, the far reveal catching light
  const R = K.rng("f03w" + side + ":" + b.z0.toFixed(2));
  b.wins = [];
  for (let y = 4.2; y + 1.8 < b.h - 0.9; y += 3.1) {
    for (let z = b.z0 + 0.9; z + 1.0 < b.z1 - 0.4; z += 1.9) {
      const on = R() < 0.32, curtain = R();
      b.wins.push([y, z, on, curtain, R()]);
      // surround + sill + lintel
      quad(s, P(X, y - 0.18, z - 0.12), P(X, y + 1.9, z - 0.12), P(X, y + 1.9, z + 1.12), P(X, y - 0.18, z + 1.12), stone);
      quad(s, P(X, y + 1.9, z - 0.12), P(X, y + 2.1, z - 0.12), P(X, y + 2.1, z + 1.12), P(X, y + 1.9, z + 1.12), mix(stone, stoneDk, 0.3));
      // streak of rain-darkening below the sill
      const st0 = P(X, y - 0.18, z + 0.05), st1 = P(X, y - 1.6, z + 0.95);
      const sg = s.createLinearGradient(0, st0[1], 0, st1[1]);
      sg.addColorStop(0, rgba("#0c0a0a", 0.35 * (1 - k))); sg.addColorStop(1, rgba("#0c0a0a", 0));
      quad(s, P(X, y - 0.18, z + 0.05), P(X, y - 1.6, z + 0.05), P(X, y - 1.6, z + 0.95), P(X, y - 0.18, z + 0.95), sg);
      // the opening (glass albedo is dark: what we see in it is emissive or reflected, added later)
      quad(s, P(X, y, z), P(X, y + 1.7, z), P(X, y + 1.7, z + 1.0), P(X, y, z + 1.0), "#121318");
      // the far reveal: the side of the opening that faces us
      const ri = X + side * 0.18;
      quad(s, P(X, y, z + 1.0), P(X, y + 1.7, z + 1.0), P(ri, y + 1.7, z + 1.0), P(ri, y, z + 1.0), mix("#7a7266", FOG_ALB, k));
      quad(s, P(X, y + 1.7, z), P(ri, y + 1.7, z), P(ri, y + 1.7, z + 1.0), P(X, y + 1.7, z + 1.0), rgba("#000", 0.5 * (1 - k)));
    }
  }
  // ground floor: stallriser, shop glass (emissive later), fascia board, pilasters
  const sz0 = b.z0 + 0.5, sz1 = b.z1 - 0.5;
  // painted timber shopfront (stallriser, pilasters, fascia)
  wallStrips(s, PR, X, b.z0, b.z1, 0, 3.3, "wood", { seed: 4, size: 128 }, 1.2, 1.2, FOG_ALB, (z) => hz(z) * 0.9, { tint: shade(b.shop, -0.1), tintA: 0.85 });
  quad(s, P(X, 2.85, b.z0 + 0.25), P(X, 3.3, b.z0 + 0.25), P(X, 3.3, b.z1 - 0.25), P(X, 2.85, b.z1 - 0.25), mix(b.shop, FOG_ALB, k * 0.9));
  quad(s, P(X, 0.45, sz0), P(X, 2.8, sz0), P(X, 2.8, sz1), P(X, 0.45, sz1), "#101216");
  const ri = X + side * 0.25;
  quad(s, P(X, 0.45, sz1), P(X, 2.8, sz1), P(ri, 2.8, sz1), P(ri, 0.45, sz1), mix(shade(b.shop, -0.2), FOG_ALB, k));
  // downpipe at the party wall
  quad(s, P(X + side * -0.08, 0, b.z1 - 0.12), P(X + side * -0.08, b.h - 0.6, b.z1 - 0.12), P(X + side * -0.08, b.h - 0.6, b.z1), P(X + side * -0.08, 0, b.z1), mix("#1a1c22", FOG_ALB, k * 0.9));
}

// A lit shop seen THROUGH its window: a real box of a room 3.4 m deep in the street's perspective
// (floor, ceiling, the far end wall, the back wall), shelving with goods and the shadow under every
// shelf, a gondola run down the middle, warm downlights pooling on the walls and floor, then the
// glass on top (a cool reflection of the street, the opposite lamps as soft glints).
function shopInterior(s, side, b, gx, sz0, sz1, k, fogE) {
  const Xb = gx + side * 3.4, z0 = Math.max(1.2, sz0 - 2.5), z1 = sz1 + 0.6;
  const Y0 = 0.25, Y1 = 3.0;
  const lightC = b.cafe ? "#ffb08a" : mix("#ffb060", "#ffd8a8", b.R);
  const wallA = b.cafe ? "#a86a58" : mix("#b89a78", ["#9a8a70", "#8a6a58", "#a8a090", "#7a8a88"][Math.floor(b.R * 4)], 0.5);
  // surface colour under the shop's warm light: deep warm shade where it is unlit, never paper-white
  const lit = (c, I) => fogE(mix(mix(shade(c, -0.7), "#2a1408", 0.3), shade(mix(c, lightC, 0.3), -0.12), clamp(I)));
  const Ri = K.rng("f03in" + b.z0.toFixed(2));
  const q4 = (a1, a2, a3, a4, f) => quad(s, a1, a2, a3, a4, f);
  s.save();
  const c0 = P(gx, 0.45, sz0), c1 = P(gx, 2.8, sz0), c2 = P(gx, 2.8, sz1), c3 = P(gx, 0.45, sz1);
  s.beginPath(); s.moveTo(c0[0], c0[1]); s.lineTo(c1[0], c1[1]); s.lineTo(c2[0], c2[1]); s.lineTo(c3[0], c3[1]); s.closePath(); s.clip();
  // ceiling (lit only near the spots), floor (warm, polished: the spots reflect in it), far end wall
  const cg = s.createLinearGradient(0, P(gx, Y1, sz0)[1], 0, P(Xb, Y1, sz0)[1]);
  cg.addColorStop(0, lit("#6a5040", 0.25)); cg.addColorStop(1, lit("#8a6a50", 0.55));
  q4(P(gx, Y1, z0), P(Xb, Y1, z0), P(Xb, Y1, z1), P(gx, Y1, z1), cg);
  const fg = s.createLinearGradient(0, P(gx, Y0, sz0)[1], 0, P(Xb, Y0, sz0)[1]);
  fg.addColorStop(0, lit("#5a4434", 0.35)); fg.addColorStop(1, lit("#6a5040", 0.75));
  q4(P(gx, Y0, z0), P(Xb, Y0, z0), P(Xb, Y0, z1), P(gx, Y0, z1), fg);
  // the far end wall: at this grazing angle it is most of what we see through the glass, so it is
  // a real wall: lit from the ceiling and falling into shadow at the floor and corners, plastered,
  // with a run of stocked shelving whose boards throw soft shadows under them
  {
    const e0 = P(gx, Y0, z1), e1 = P(gx, Y1, z1), e2 = P(Xb, Y1, z1), e3 = P(Xb, Y0, z1);
    const ev = s.createLinearGradient(0, e1[1], 0, e0[1]);
    ev.addColorStop(0, lit(wallA, 0.14)); ev.addColorStop(0.12, lit(wallA, 0.5)); ev.addColorStop(0.45, lit(wallA, 0.26)); ev.addColorStop(1, lit(wallA, 0.05));
    q4(e0, e1, e2, e3, ev);
    const wp = new Path2D(); wp.moveTo(e0[0], e0[1]); wp.lineTo(e1[0], e1[1]); wp.lineTo(e2[0], e2[1]); wp.lineTo(e3[0], e3[1]); wp.closePath();
    K.texFill(s, "plaster", wp, { tex: { seed: 9, size: 128, color: "#c8b8a0", grime: "#5a4a3a", stain: 0.5 }, scale: Math.max(6, (1.4 / z1) * F), mode: "multiply", alpha: 0.6 * (1 - k) });
    const eh = s.createLinearGradient(e0[0], 0, e3[0], 0);
    eh.addColorStop(0, rgba("#0c0604", 0.45 * (1 - k))); eh.addColorStop(0.25, rgba("#0c0604", 0)); eh.addColorStop(0.75, rgba("#0c0604", 0)); eh.addColorStop(1, rgba("#0c0604", 0.55 * (1 - k)));
    q4(e0, e1, e2, e3, eh);
    // shelving across the end wall
    const xa = gx + side * 0.35, xb = Xb - side * 0.25, Re = K.rng("f03end" + b.z0.toFixed(2));
    for (const y of [0.7, 1.25, 1.8, 2.35]) {
      q4(P(xa, y - 0.3, z1 - 0.01), P(xa, y, z1 - 0.01), P(xb, y, z1 - 0.01), P(xb, y - 0.3, z1 - 0.01), rgba("#120804", 0.32 * (1 - k)));
      for (let x = 0.0; x < Math.abs(xb - xa) - 0.12;) {
        const wx = 0.07 + Re() * 0.16, hh = 0.1 + Re() * 0.26;
        if (Re() < 0.82) {
          const col = ["#b04a34", "#e0d0a0", "#3a7a5a", "#34508a", "#e09a48", "#f0e8da", "#7a3a6a", "#c8b070"][Math.floor(Re() * 8)];
          const xx = xa + side * x;
          const gq = s.createLinearGradient(0, P(xx, y + hh, z1)[1], 0, P(xx, y, z1)[1]);
          gq.addColorStop(0, lit(col, 0.5 + 0.35 * (y / 2.35))); gq.addColorStop(1, lit(shade(col, -0.3), 0.3 + 0.3 * (y / 2.35)));
          q4(P(xx, y, z1 - 0.02), P(xx, y + hh, z1 - 0.02), P(xx + side * wx, y + hh, z1 - 0.02), P(xx + side * wx, y, z1 - 0.02), gq);
        }
        x += wx + 0.012 + Re() * 0.04;
      }
      q4(P(xa, y - 0.04, z1 - 0.03), P(xa, y, z1 - 0.03), P(xb, y, z1 - 0.03), P(xb, y - 0.04, z1 - 0.03), lit("#c8a070", 0.85));
    }
    // a downlight's scallop on the end wall
    const sp = P(lerp(gx, Xb, 0.5), 2.3, z1), sr = (0.9 / z1) * F;
    s.save(); s.translate(sp[0], sp[1]); s.scale(0.7, 1.4); glow(s, 0, 0, sr, lightC, 0.35 * (1 - k), "lighter"); s.restore();
  }
  // back wall: brightest just under the downlights, falling off to the floor
  const bt = P(Xb, Y1, (sz0 + sz1) / 2), bb = P(Xb, Y0, (sz0 + sz1) / 2);
  const bg = s.createLinearGradient(0, bt[1], 0, bb[1]);
  bg.addColorStop(0, lit(wallA, 0.12)); bg.addColorStop(0.18, lit(wallA, 0.42)); bg.addColorStop(0.55, lit(wallA, 0.2)); bg.addColorStop(1, lit(wallA, 0.06));
  q4(P(Xb, Y0, z0), P(Xb, Y1, z0), P(Xb, Y1, z1), P(Xb, Y0, z1), bg);
  // the wall is painted plaster, not a flat card: its texture, multiplied in (fades with the haze)
  {
    const wp = new Path2D(), w0 = P(Xb, Y0, z0), w1 = P(Xb, Y1, z0), w2 = P(Xb, Y1, z1), w3 = P(Xb, Y0, z1);
    wp.moveTo(w0[0], w0[1]); wp.lineTo(w1[0], w1[1]); wp.lineTo(w2[0], w2[1]); wp.lineTo(w3[0], w3[1]); wp.closePath();
    K.texFill(s, "plaster", wp, { tex: { seed: 9, size: 128, color: "#c8b8a0", grime: "#5a4a3a", stain: 0.5 }, scale: Math.max(6, (1.4 / sz0) * F), mode: "multiply", alpha: 0.55 * (1 - k) });
  }
  // downlight scallops washing down the back wall: each lamp paints a bright arch fading downward
  for (let z = sz0 + 0.3; z < z1 - 0.2; z += 1.2) {
    const wp = P(Xb, 2.15, z), rr = (0.75 / z) * F;
    s.save(); s.translate(wp[0], wp[1]); s.scale(0.55, 1.35);
    glow(s, 0, 0, rr, lightC, 0.55 * (1 - k), "lighter");
    s.restore();
  }
  // the room darkens toward the glass and the party walls (ambient occlusion in the box's corners)
  {
    const e0 = P(gx, 1.6, sz0), e1 = P(gx, 1.6, sz1);
    const og = s.createLinearGradient(e0[0], 0, e1[0], 0);
    og.addColorStop(0, rgba("#0c0604", 0.5 * (1 - k))); og.addColorStop(0.18, rgba("#0c0604", 0)); og.addColorStop(0.82, rgba("#0c0604", 0)); og.addColorStop(1, rgba("#0c0604", 0.45 * (1 - k)));
    q4(P(gx, Y0, z0), P(gx, Y1, z0), P(gx, Y1, z1), P(gx, Y0, z1), og);
  }
  // the corners go dark (occlusion where wall meets ceiling and the end wall)
  q4(P(Xb, Y1 - 0.35, z0), P(Xb, Y1, z0), P(Xb, Y1, z1), P(Xb, Y1 - 0.35, z1), rgba("#140a06", 0.35 * (1 - k)));
  q4(P(Xb, Y0, z1 - 0.5), P(Xb, Y1, z1 - 0.5), P(Xb, Y1, z1), P(Xb, Y0, z1), rgba("#140a06", 0.3 * (1 - k)));
  // shelving on the back wall: boards, goods standing on them, a soft shadow under each board
  const xf = Xb - side * 0.38;
  for (const y of [0.75, 1.3, 1.85, 2.4]) {
    q4(P(Xb, y - 0.32, z0), P(Xb, y, z0), P(Xb, y, z1), P(Xb, y - 0.32, z1), rgba("#120804", 0.28 * (1 - k)));
    for (let z = z0 + 0.2; z < z1 - 0.3;) {
      const wz = 0.08 + Ri() * 0.16, hh = 0.12 + Ri() * 0.24;
      if (Ri() < 0.85) {
        const col = ["#b04a34", "#e0d0a0", "#3a7a5a", "#34508a", "#e09a48", "#f0e8da", "#7a3a6a"][Math.floor(Ri() * 7)];
        const xi = xf + side * Ri() * 0.12;
        q4(P(xi, y, z), P(xi, y + hh, z), P(xi, y + hh, z + wz), P(xi, y, z + wz), lit(col, 0.55 + 0.4 * (y / 2.4)));
        // the side of the box facing the window: darker
        q4(P(xi, y, z + wz), P(xi, y + hh, z + wz), P(xi + side * 0.12, y + hh, z + wz), P(xi + side * 0.12, y, z + wz), lit(shade(col, -0.35), 0.4));
      }
      z += wz + 0.015 + Ri() * 0.05;
    }
    // the board: its top (below the eye) or its underside (above), and its lit front lip
    q4(P(Xb, y, z0), P(xf, y, z0), P(xf, y, z1), P(Xb, y, z1), lit("#6a4a30", y < EYE ? 0.7 : 0.25));
    q4(P(xf, y - 0.045, z0), P(xf, y, z0), P(xf, y, z1), P(xf, y - 0.045, z1), lit("#c8a070", 0.9));
  }
  // a gondola run down the middle of the shop: a dark mass against the lit back wall
  const gxm = gx + side * 1.7;
  for (let z = z0 + 1.0; z < z1 - 0.6; z += 3.2) {
    const ze = Math.min(z1 - 0.6, z + 2.2), hh = 1.35;
    q4(P(gxm, Y0, z), P(gxm, hh, z), P(gxm, hh, ze), P(gxm, Y0, ze), lit("#3a2a20", 0.35));
    q4(P(gxm, Y0, ze), P(gxm, hh, ze), P(gxm + side * 0.6, hh, ze), P(gxm + side * 0.6, Y0, ze), lit("#4a3424", 0.55));
    for (let y = 0.5; y < hh; y += 0.42) q4(P(gxm, y, z), P(gxm, y + 0.03, z), P(gxm, y + 0.03, ze), P(gxm, y, ze), lit("#c8a070", 0.7));
  }
  // the odd shopper: a soft dark figure in the aisle
  if (Ri() < 0.45) {
    const zp = lerp(sz0, sz1, 0.3 + Ri() * 0.4), xp = gx + side * (0.9 + Ri() * 0.6);
    const f0 = P(xp, Y0, zp), f1 = P(xp, Y0 + 1.6, zp), wpx = Math.max(1, (0.22 / zp) * F);
    s.fillStyle = rgba("#1a100a", 0.75 * (1 - k));
    s.beginPath(); s.ellipse(f0[0], (f0[1] + f1[1]) / 2 + wpx * 0.3, wpx, (f0[1] - f1[1]) / 2, 0, 0, TAU); s.fill();
    s.beginPath(); s.arc(f1[0], f1[1] - wpx * 0.2, wpx * 0.6, 0, TAU); s.fill();
  }
  // downlights: hot discs in the ceiling with the warm pool they throw down the back wall and floor
  for (let z = sz0 + 0.3; z < z1 - 0.2; z += 1.2) {
    const q = P(gx + side * 1.4, Y1 - 0.02, z), r = (0.08 / z) * F;
    const fp = P(gx + side * 1.4, Y0, z);
    s.save(); s.translate(fp[0], fp[1]); s.scale(1, 0.35); glow(s, 0, 0, (1.0 / z) * F, lightC, 0.22 * (1 - k), "lighter"); s.restore();
    s.fillStyle = rgba("#fffaf0", 1 - k);
    s.beginPath(); s.ellipse(q[0], q[1], Math.max(0.6, r), Math.max(0.4, r * 0.4), 0, 0, TAU); s.fill();
  }
  // the glass: a cool sheen of the street and sky (stronger at the top, Fresnel), the opposite lamps
  const gl = s.createLinearGradient(0, c1[1], 0, c0[1]);
  gl.addColorStop(0, rgba("#8a9cc8", 0.2 * (1 - k))); gl.addColorStop(0.5, rgba("#8a9cc8", 0.05 * (1 - k))); gl.addColorStop(1, rgba("#8a9cc8", 0.1 * (1 - k)));
  q4(c0, c1, c2, c3, gl);
  q4(P(gx, 2.8, sz0), P(gx, 2.8, lerp(sz0, sz1, 0.22)), P(gx, 0.45, lerp(sz0, sz1, 0.45)), P(gx, 0.45, lerp(sz0, sz1, 0.25)), rgba("#c8d4f0", 0.06 * (1 - k)));
  for (let z = sz0 + 1.2; z < sz1; z += 4.25) {
    const q = P(gx, 2.35, z), rr = (0.35 / z) * F;
    glow(s, q[0], q[1], rr, "#ffc880", 0.35 * (1 - k), "lighter");
    // the old plate glass is not optically flat: the lamp smears into a tall soft column
    s.save(); s.translate(q[0], q[1] + rr * 1.6); s.scale(0.35, 3.2); glow(s, 0, 0, rr, "#ffb870", 0.14 * (1 - k), "lighter"); s.restore();
  }
  // the dark street mirrored in the lower glass: a cool, slightly darker band where the far kerb and
  // the wet road reflect (glass reflects more at this grazing angle)
  {
    const rb = s.createLinearGradient(0, P(gx, 1.2, sz0)[1], 0, c0[1]);
    rb.addColorStop(0, rgba("#1a2238", 0)); rb.addColorStop(1, rgba("#1a2238", 0.32 * (1 - k)));
    q4(c0, P(gx, 1.2, sz0), P(gx, 1.2, sz1), c3, rb);
  }
  s.restore();
  // mullion shadows thrown out across the pavement by the shop light
  for (let i = 0; i <= 3; i++) {
    const z = lerp(sz0, sz1, i / 3);
    q4(P(gx, 0.15, z - 0.05), P(gx, 0.15, z + 0.05), P(side * 4.3, 0.15, z + 0.35), P(side * 4.3, 0.15, z + 0.12), rgba("#05060a", 0.28 * (1 - k)));
  }
}

// EMISSIVE pass: lit rooms, shop interiors, sky reflected in dark glass, awnings (lit from beneath).
function facadeEmit(s, side, b) {
  const X = side * 6.5;
  const k = hz((b.z0 + b.z1) / 2);
  const fogE = (c, kk = k) => mix(c, "#56607a", kk * 0.85);
  for (const [y, z, on, curtain, r] of b.wins) {
    const ri = X + side * 0.18;
    const p = [P(ri, y, z), P(ri, y + 1.7, z), P(ri, y + 1.7, z + 1.0), P(ri, y, z + 1.0)];
    if (on) {
      const wc = r > 0.5 ? "#ffb45e" : r > 0.2 ? "#ffcf96" : "#d8e4ff"; // tungsten, warm LED, a TV
      const wg = s.createLinearGradient(0, p[1][1], 0, p[0][1]);
      wg.addColorStop(0, fogE(shade(wc, -0.25)));
      wg.addColorStop(0.35, fogE(mix(wc, "#fff2dc", 0.25)));
      wg.addColorStop(1, fogE(shade(wc, -0.45)));
      quad(s, p[0], p[1], p[2], p[3], wg);
      // curtains drawn part-way, ceiling/lampshade shape, a dark interior shape
      const cw = 0.18 + curtain * 0.3;
      quad(s, P(ri, y, z), P(ri, y + 1.7, z), P(ri, y + 1.7, z + cw), P(ri, y, z + cw), rgba(fogE(shade(wc, -0.6)), 0.85));
      quad(s, P(ri, y, z + 1 - cw * 0.7), P(ri, y + 1.7, z + 1 - cw * 0.7), P(ri, y + 1.7, z + 1), P(ri, y, z + 1), rgba(fogE(shade(wc, -0.6)), 0.85));
      if (curtain > 0.6) quad(s, P(ri, y, z + 0.4), P(ri, y + 0.7, z + 0.4), P(ri, y + 0.7, z + 0.75), P(ri, y, z + 0.75), rgba("#1a0c06", 0.5 * (1 - k)));
    } else {
      // dark glass: a faint, graded reflection of the sky and the opposite lit facades
      const wg = s.createLinearGradient(0, p[1][1], 0, p[0][1]);
      wg.addColorStop(0, fogE("#2a3550"));
      wg.addColorStop(0.6, fogE("#121826"));
      wg.addColorStop(1, fogE(r > 0.7 ? "#3a2a22" : "#0c1018"));
      quad(s, p[0], p[1], p[2], p[3], wg);
    }
    // glazing bars (sash window)
    const bar = fogE("#1c1a18");
    quad(s, P(ri, y + 0.82, z), P(ri, y + 0.88, z), P(ri, y + 0.88, z + 1), P(ri, y + 0.82, z + 1), bar);
    quad(s, P(ri, y, z + 0.47), P(ri, y + 1.7, z + 0.47), P(ri, y + 1.7, z + 0.53), P(ri, y, z + 0.53), bar);
  }
  // the shop window
  const sz0 = b.z0 + 0.5, sz1 = b.z1 - 0.5, gx = X + side * 0.25;
  const g0 = P(gx, 0.45, sz0), g1 = P(gx, 2.8, sz0), g2 = P(gx, 2.8, sz1), g3 = P(gx, 0.45, sz1);
  if (b.lit && k < 0.55) {
    shopInterior(s, side, b, gx, sz0, sz1, k, fogE);
  } else if (b.lit) {
    const base = b.cafe ? "#e88a50" : mix("#e8903e", "#f0b878", b.R);
    // an interior lit from the ceiling: hot near the top, falling off to the floor
    const sg = s.createLinearGradient(0, g1[1], 0, g0[1]);
    sg.addColorStop(0, fogE(mix(base, "#ffe8c8", 0.45)));
    sg.addColorStop(0.16, fogE(shade(base, -0.15)));
    sg.addColorStop(0.6, fogE(shade(base, -0.5)));
    sg.addColorStop(1, fogE(shade(base, -0.72)));
    quad(s, g0, g1, g2, g3, sg);
    // the back of the shop: shelving units and the odd shopper, as darker shapes against the light
    const Ri = K.rng("f03in" + b.z0.toFixed(2));
    for (let i = 0; i < 3; i++) {
      const y = 0.75 + i * 0.6;
      quad(s, P(gx, y, sz0), P(gx, y + 0.06, sz0), P(gx, y + 0.06, sz1), P(gx, y, sz1), rgba("#2a160c", 0.55 * (1 - k)));
    }
    if (k < 0.6) {
      for (let i = 0; i < 3; i++) {
        const y = 0.81 + i * 0.6;
        for (let z = sz0 + 0.15; z < sz1 - 0.2; z += 0.18 + Ri() * 0.2) {
          const col = ["#a0402e", "#d8c890", "#2e6a4a", "#2a3e70", "#d89040", "#e8e0d0"][Math.floor(Ri() * 6)];
          const hh = 0.12 + Ri() * 0.18;
          quad(s, P(gx, y, z), P(gx, y + hh, z), P(gx, y + hh, z + 0.1), P(gx, y, z + 0.1), rgba(mix(col, base, 0.3), 0.85 * (1 - k)));
        }
      }
      for (let z = sz0 + 0.6; z < sz1 - 0.3; z += 1.3 + Ri() * 1.5) {
        if (Ri() < 0.5) continue;
        const hh = 1.5 + Ri() * 0.2;
        quad(s, P(gx, 0.45, z), P(gx, 0.45 + hh, z), P(gx, 0.45 + hh, z + 0.34), P(gx, 0.45, z + 0.34), rgba("#1a0e08", 0.55 * (1 - k)));
      }
      // ceiling spots: hot points the lens will bloom
      for (let z = sz0 + 0.5; z < sz1 - 0.3; z += 1.1) {
        const q = P(gx, 2.7, z);
        s.fillStyle = rgba("#fffaf0", 1 - k);
        s.beginPath(); s.ellipse(q[0], q[1], Math.max(0.6, (0.07 / z) * F), Math.max(0.5, (0.035 / z) * F), 0, 0, TAU); s.fill();
      }
    }
    // the glass reflects the dark street: a cool diagonal sheen
    quad(s, P(gx, 2.8, sz0), P(gx, 2.8, lerp(sz0, sz1, 0.25)), P(gx, 0.45, lerp(sz0, sz1, 0.5)), P(gx, 0.45, lerp(sz0, sz1, 0.25)), rgba("#9fb4e0", 0.08 * (1 - k)));
  } else {
    const sg = s.createLinearGradient(0, g1[1], 0, g0[1]);
    sg.addColorStop(0, fogE("#1a2234"));
    sg.addColorStop(1, fogE("#06080c"));
    quad(s, g0, g1, g2, g3, sg);
    // mirror images of the lamps opposite, smeared by the old glass
    s.save();
    s.beginPath(); s.moveTo(g0[0], g0[1]); s.lineTo(g1[0], g1[1]); s.lineTo(g2[0], g2[1]); s.lineTo(g3[0], g3[1]); s.closePath(); s.clip();
    for (let z = sz0 + 0.8; z < sz1; z += 2.6) { const q = P(gx, 2.2, z); glow(s, q[0], q[1], (0.5 / z) * F, "#ffb060", 0.5 * (1 - k)); glow(s, q[0], q[1], (0.12 / z) * F, "#fff0d8", 0.6 * (1 - k)); }
    const sh = s.createLinearGradient(g1[0], g1[1], g3[0], g3[1]);
    sh.addColorStop(0, rgba("#8a9ac0", 0)); sh.addColorStop(0.5, rgba("#8a9ac0", 0.12 * (1 - k))); sh.addColorStop(0.6, rgba("#8a9ac0", 0));
    s.fillStyle = sh; s.fillRect(0, 0, LW, LH);
    s.restore();
  }
  // mullions + transom
  const mul = fogE("#14120f");
  for (let i = 0; i <= 3; i++) {
    const z = lerp(sz0, sz1, i / 3);
    quad(s, P(gx, 0.45, z - 0.05), P(gx, 2.8, z - 0.05), P(gx, 2.8, z + 0.05), P(gx, 0.45, z + 0.05), mul);
  }
  quad(s, P(gx, 2.3, sz0), P(gx, 2.36, sz0), P(gx, 2.36, sz1), P(gx, 2.3, sz1), mul);
  // awning sloping out over the pavement: fabric, lit from beneath by the window it shades
  const ax = side * 5.2;
  const ac = b.cafe ? "#7a1e40" : b.shop;
  const ap = new Path2D();
  const q0 = P(X, 3.4, b.z0 + 0.2), q1 = P(X, 3.4, b.z1 - 0.2), q2 = P(ax, 2.85, b.z1 - 0.2), q3 = P(ax, 2.85, b.z0 + 0.2);
  ap.moveTo(q0[0], q0[1]); ap.lineTo(q1[0], q1[1]); ap.lineTo(q2[0], q2[1]); ap.lineTo(q3[0], q3[1]); ap.closePath();
  const ag = s.createLinearGradient(0, q0[1], 0, q3[1]);
  ag.addColorStop(0, fogE(shade(ac, -0.45)));
  ag.addColorStop(1, fogE(shade(ac, b.lit ? -0.05 : -0.3)));
  s.fillStyle = ag;
  s.fill(ap);
  if (k < 0.75) { K.texFill(s, "fabric", ap, { tex: { seed: 3, size: 64 }, scale: Math.max(4, (0.5 / b.z0) * F), mode: "multiply", alpha: 0.55 * (1 - k) }); }
  if (b.cafe) for (let z = b.z0 + 0.2; z < b.z1 - 0.3; z += 0.6) quad(s, P(X, 3.4, z), P(X, 3.4, z + 0.3), P(ax, 2.85, z + 0.3), P(ax, 2.85, z), rgba("#c8b4bc", 0.35));
  // the scalloped valance, lit from below by the shop
  quad(s, P(ax, 2.85, b.z0 + 0.2), P(ax, 2.62, b.z0 + 0.2), P(ax, 2.62, b.z1 - 0.2), P(ax, 2.85, b.z1 - 0.2), fogE(b.lit ? mix(ac, "#ffc890", 0.25) : shade(ac, -0.2)));
}

function paintSky(s) {
  const sk = s.createLinearGradient(0, 0, 0, VPY + 20);
  sk.addColorStop(0, "#0a1426");
  sk.addColorStop(0.45, "#1a2c4c");
  sk.addColorStop(0.8, "#3a4c70");
  sk.addColorStop(1, "#6a7090");
  s.fillStyle = sk;
  s.fillRect(0, 0, LW, VPY + 30);
  // low rain cloud: a stratus deck, its underside lit orange-grey by the town below
  const cl = SPR("f03cloudDeck", LW, 260, (c) => {
    K.texRect(c, "cloud", 0, 0, LW, 260, { scale: 520, scaleY: 170, tex: { seed: 9, cover: 0.62, size: 256 } });
    c.globalCompositeOperation = "source-atop";
    const cg = c.createLinearGradient(0, 0, 0, 260);
    cg.addColorStop(0, "#22304c");
    cg.addColorStop(0.6, "#4a5470");
    cg.addColorStop(1, "#8a7e86");
    c.fillStyle = cg;
    c.fillRect(0, 0, LW, 260);
  });
  s.globalAlpha = 0.75;
  s.drawImage(cl, 0, 0, LW, 260);
  s.globalAlpha = 1;
  // the town's sodium glow on the underside of the cloud near the horizon
  const tg = s.createRadialGradient(VPX, VPY, 10, VPX, VPY, 380);
  tg.addColorStop(0, "rgba(200,170,150,0.35)");
  tg.addColorStop(1, "rgba(200,170,150,0)");
  s.fillStyle = tg;
  s.fillRect(0, 0, LW, VPY + 30);
}

function towerAlbedo(s) {
  const tz = 118, tw = 3.6;
  const tp = new Path2D();
  const a = P(-tw, 0, tz), b = P(tw, 40, tz);
  tp.rect(a[0], b[1], b[0] - a[0], a[1] - b[1]);
  K.texFill(s, "granite", tp, { tex: { seed: 3, size: 128 }, scale: 30 });
  s.fillStyle = rgba(FOG_ALB, 0.7);
  s.fill(tp);
  quad(s, P(-tw - 0.5, 40, tz), P(-tw - 0.5, 41.2, tz), P(tw + 0.5, 41.2, tz), P(tw + 0.5, 40, tz), mix("#6a6a70", FOG_ALB, 0.6));
  s.fillStyle = mix("#3a3c44", FOG_ALB, 0.6);
  s.beginPath();
  const r0 = P(-tw - 0.3, 41.2, tz), r1 = P(0, 52, tz), r2 = P(tw + 0.3, 41.2, tz);
  s.moveTo(r0[0], r0[1]); s.lineTo(r1[0], r1[1]); s.lineTo(r2[0], r2[1]); s.fill();
  // stone courses and quoins: the shaft is not a slab, it is built (seen through 118 m of rain haze)
  for (let y = 1; y < 40; y += 1.25) {
    const a0 = P(-tw, y, tz), a1 = P(tw, y, tz);
    s.fillStyle = rgba("#2a2c34", 0.22);
    s.fillRect(a0[0], a0[1], a1[0] - a0[0], 0.6);
    const qw = (Math.round(y / 1.25) % 2) ? 0.9 : 0.5; // quoins: alternating long and short blocks
    for (const sx of [-1, 1]) {
      const q0 = P(sx * tw, y + 1.25, tz), q1 = P(sx * (tw - qw), y, tz);
      s.fillStyle = rgba("#c8c8d0", 0.1);
      s.fillRect(Math.min(q0[0], q1[0]), q0[1], Math.abs(q1[0] - q0[0]), q1[1] - q0[1] - 0.5);
    }
  }
  // belfry: three arched openings with louvre slats, the dark void behind them
  for (const ox of [-1.8, 0, 1.8]) {
    const p = P(ox - 0.6, 35.5, tz), q = P(ox + 0.6, 38.6, tz);
    s.fillStyle = mix("#06070a", FOG_ALB, 0.4);
    s.fillRect(p[0], q[1], q[0] - p[0], p[1] - q[1]);
    s.beginPath(); s.arc((p[0] + q[0]) / 2, q[1], (q[0] - p[0]) / 2, Math.PI, 0); s.fill();
    for (let y = 35.8; y < 38.6; y += 0.42) {
      const a = P(ox - 0.6, y, tz), bq = P(ox + 0.6, y, tz);
      s.fillStyle = mix("#5a5a62", FOG_ALB, 0.5);
      s.fillRect(a[0], a[1] - 0.9, bq[0] - a[0], 0.9);
    }
  }
  // the clock stage: a projecting band and the stone surround of the dial
  quad(s, P(-tw - 0.3, 27.2, tz), P(-tw - 0.3, 27.8, tz), P(tw + 0.3, 27.8, tz), P(tw + 0.3, 27.2, tz), mix("#7a7a80", FOG_ALB, 0.55));
  quad(s, P(-tw - 0.3, 33.6, tz), P(-tw - 0.3, 34.2, tz), P(tw + 0.3, 34.2, tz), P(tw + 0.3, 33.6, tz), mix("#7a7a80", FOG_ALB, 0.55));
  { const cf = P(0, 30.5, tz), cr = (2.85 / tz) * F; s.fillStyle = mix("#3a3a42", FOG_ALB, 0.5); s.beginPath(); s.arc(cf[0], cf[1], cr, 0, TAU); s.fill(); }
  // the square beyond the end of the street
  const R2 = K.rng("f03end");
  for (let x = -26; x < 26;) {
    const w = 4 + R2() * 6, h = 9 + R2() * 7;
    if (Math.abs(x + w / 2) < tw + 1 && h > 12) { x += w; continue; }
    quad(s, P(x, 0, 124), P(x, h, 124), P(x + w, h, 124), P(x + w, 0, 124), mix(["#6a5a58", "#5a6270", "#706058"][Math.floor(R2() * 3)], FOG_ALB, 0.75));
    x += w;
  }
}
// A backlit opal-glass clock dial: warm but not white (it is a lit pane seen through the rain, not a
// lamp), a dark bezel ring, the hour chapter as Roman-numeral strokes, two tapered iron hands at ten
// to nine (the hour the story happens), the glass a little brighter in the middle.
function clockDial(s, x, y, r, lum = 1) {
  const fg = s.createRadialGradient(x - r * 0.15, y - r * 0.15, 0, x, y, r);
  fg.addColorStop(0, mix("#3a3020", "#f2dca6", lum)); fg.addColorStop(0.75, mix("#2a2218", "#d8b878", lum)); fg.addColorStop(1, mix("#1a140c", "#8a6a3a", lum));
  s.fillStyle = fg;
  s.beginPath(); s.arc(x, y, r, 0, TAU); s.fill();
  s.strokeStyle = "rgba(24,18,12,0.85)"; s.lineWidth = Math.max(0.6, r * 0.09);
  s.beginPath(); s.arc(x, y, r * 0.96, 0, TAU); s.stroke();
  // chapter ring and numerals: at this size the Roman numerals read as clustered strokes (I, II, III, IIII...)
  s.lineWidth = Math.max(0.35, r * 0.045);
  s.beginPath(); s.arc(x, y, r * 0.66, 0, TAU); s.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU - Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    const n = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11][i], strokes = n % 5 === 0 ? 2 : Math.min(4, n % 5 || 1);
    for (let k = 0; k < strokes; k++) {
      const off = (k - (strokes - 1) / 2) * r * 0.07;
      const bx = x + ca * r * 0.8 - sa * off, by = y + sa * r * 0.8 + ca * off;
      s.beginPath(); s.moveTo(bx - ca * r * 0.1, by - sa * r * 0.1); s.lineTo(bx + ca * r * 0.1, by + sa * r * 0.1); s.stroke();
    }
  }
  const hand = (a, len, w) => {
    const ca = Math.cos(a), sa = Math.sin(a);
    s.fillStyle = "rgba(16,12,8,0.95)";
    s.beginPath();
    s.moveTo(x - sa * w - ca * len * 0.15, y + ca * w - sa * len * 0.15);
    s.lineTo(x + ca * len, y + sa * len);
    s.lineTo(x + sa * w - ca * len * 0.15, y - ca * w - sa * len * 0.15);
    s.closePath(); s.fill();
  };
  hand((8.83 / 12) * TAU - Math.PI / 2, r * 0.5, Math.max(0.4, r * 0.07));
  hand((50 / 60) * TAU - Math.PI / 2, r * 0.78, Math.max(0.3, r * 0.05));
}
function towerEmit(s) {
  const tz = 118;
  const cf = P(0, 30.5, tz), cr = (2.4 / tz) * F;
  clockDial(s, cf[0], cf[1], cr, 0.85);
  // far square windows
  const R2 = K.rng("f03endw");
  for (let i = 0; i < 40; i++) {
    const x = -24 + R2() * 48, y = 2.5 + R2() * 9;
    if (Math.abs(x) < 4.5 || R2() < 0.55) continue;
    const a = P(x, y, 124), b = P(x + 0.8, y + 1.3, 124);
    s.fillStyle = mix(WARM, "#56607a", 0.55);
    s.fillRect(a[0], b[1], b[0] - a[0], a[1] - b[1]);
  }
}

function groundAlbedo(s) {
  // the carriageway: wet granite setts in true perspective
  s.save();
  s.beginPath();
  const r0 = P(-4, 0, 1.0), r1 = P(-4, 0, 130), r2 = P(4, 0, 130), r3 = P(4, 0, 1.0);
  s.moveTo(r0[0], r0[1]); s.lineTo(r1[0], r1[1]); s.lineTo(r2[0], r2[1]); s.lineTo(r3[0], r3[1]); s.closePath();
  s.clip();
  K.groundPlane(s, LW, LH, { tex: "cobble", texOpts: { seed: 4, wet: 1, moss: 0.15, cells: 8, size: 256, color: "#7a7470" }, horizon: VPY, cx: VPX, focal: F, scale: (1.0 * (LH - VPY)) / EYE, wet: 0.9, puddles: 0.42, sky: "#9aa8c8", fog: FOG_ALB, fogAmt: 0.9, variation: 0.6, cache: false });
  s.restore();
  // pavements: wet asphalt flags, slightly raised
  for (const sd of [-1, 1]) {
    s.save();
    s.beginPath();
    const p0 = P(sd * 4, 0.15, 1.0), p1 = P(sd * 4, 0.15, 130), p2 = P(sd * 7, 0.15, 130), p3 = P(sd * 7, 0.15, 1.0);
    s.moveTo(p0[0], p0[1]); s.lineTo(p1[0], p1[1]); s.lineTo(p2[0], p2[1]); s.lineTo(p3[0], p3[1]); s.closePath();
    s.clip();
    K.groundPlane(s, LW, LH, { tex: "asphalt", texOpts: { seed: 6, size: 128, color: "#6a6a6c" }, horizon: VPY, cx: VPX, focal: F, scale: (1.6 * (LH - VPY)) / (EYE - 0.15), wet: 0.85, puddles: 0.25, sky: "#9aa8c8", fog: FOG_ALB, fogAmt: 0.9, cache: false });
    // flag joints
    s.strokeStyle = "rgba(10,12,16,0.35)";
    s.lineWidth = 0.6;
    s.beginPath();
    for (let z = 1.5; z < 50; z += 0.9) { const a = P(sd * 4, 0.15, z), b = P(sd * 7, 0.15, z); s.moveTo(a[0], a[1]); s.lineTo(b[0], b[1]); }
    s.stroke();
    s.restore();
    // granite kerb: its face and its rounded top edge
    wallStrips(s, PR, sd * 4, 1.0, 130, 0, 0.15, "granite", { seed: 8, size: 128 }, 1.0, 0.3, FOG_ALB, (z) => hz(z) * 0.9);
    // the gutter: a dark wet channel with occlusion at the foot of the kerb
    for (let z = 1.0; z < 60; z *= 1.25) {
      const a = P(sd * 4, 0, z), b = P(sd * 4, 0, z * 1.25);
      K.aoEdge(s, a[0], a[1], b[0], b[1], { width: Math.max(1.5, (0.3 / z) * F), alpha: 0.5 * (1 - hz(z)), side: 0 });
    }
  }
}

function lampPostsPaint(s) {
  for (const [X, z] of LAMPS) {
    const k = hz(z);
    const b = P(X, 0.15, z), top = P(X, 4.6, z);
    const w = Math.max(0.7, (0.12 / z) * F);
    const c = mix("#16191e", "#56607a", k * 0.85);
    const pg = s.createLinearGradient(b[0] - w / 2, 0, b[0] + w / 2, 0);
    pg.addColorStop(0, c); pg.addColorStop(0.6, mix(c, "#6a6a70", 0.35 * (1 - k))); pg.addColorStop(1, c);
    s.fillStyle = pg;
    s.fillRect(b[0] - w / 2, top[1], w, b[1] - top[1]);
    s.fillStyle = c;
    s.fillRect(b[0] - w, b[1] - w * 2.5, w * 2, w * 2.5);
    const arm = P(X - Math.sign(X) * 0.6, 4.7, z);
    s.strokeStyle = c;
    s.lineWidth = w * 0.7;
    s.beginPath(); s.moveTo(top[0], top[1]); s.quadraticCurveTo(top[0], arm[1] - w, arm[0], arm[1]); s.stroke();
    const hw = (0.35 / z) * F;
    s.beginPath();
    s.moveTo(arm[0] - hw, arm[1] + hw * 0.5); s.lineTo(arm[0] + hw, arm[1] + hw * 0.5); s.lineTo(arm[0] + hw * 0.5, arm[1] - hw * 0.3); s.lineTo(arm[0] - hw * 0.5, arm[1] - hw * 0.3);
    s.fill();
    // the glass bowl underneath: the light source itself (bloomed by the lens)
    s.fillStyle = mix("#fff4dc", "#56607a", k * 0.5);
    s.beginPath(); s.ellipse(arm[0], arm[1] + hw * 0.55, hw * 0.75, Math.max(0.6, hw * 0.3), 0, 0, TAU); s.fill();
  }
}

// the light map: blue-hour sky light (brighter on the ground, which sees all of the sky) and every lamp,
// shop window and lit room falling on the surfaces around it; distant fog glows.
function streetLightMap(x) {
  const am = x.createLinearGradient(0, 0, 0, LH);
  am.addColorStop(0, "#56648a");
  am.addColorStop(0.45, "#36405e");
  am.addColorStop(0.5, "#46526e");
  am.addColorStop(1, "#34405a");
  x.fillStyle = am;
  x.fillRect(0, 0, LW, LH);
  x.globalCompositeOperation = "lighter";
  // the far end of the street disappears into luminous fog
  const fg = x.createRadialGradient(VPX, VPY - 10, 4, VPX, VPY - 10, 300);
  fg.addColorStop(0, "rgba(170,175,195,0.75)");
  fg.addColorStop(0.35, "rgba(110,120,150,0.35)");
  fg.addColorStop(1, "rgba(60,70,100,0)");
  x.fillStyle = fg;
  x.fillRect(0, 0, LW, LH);
  for (const [X, z] of LAMPS) {
    const k = hz(z), I = 1 - k * 0.7;
    const hx = X - Math.sign(X) * 0.6;
    // on the ground: an inverse-square pool foreshortened by the low camera
    const gp = P(hx, 0, z), r = (4.2 / z) * F;
    x.save(); x.translate(gp[0], gp[1]); x.scale(1, clamp(EYE / z, 0.04, 0.6) * 1.6);
    K.lightPool(x, 0, 0, r * 1.2, "#ffa850", { intensity: 1.5 * I });
    K.lightPool(x, 0, 0, r * 0.4, "#ffe0b0", { intensity: 1.2 * I });
    x.restore();
    // on the facade behind it, and on the lamp's own side of the street
    const side = Math.sign(X);
    const wp = P(side * 6.5, 3.6, z);
    const rx = Math.abs(P(side * 6.5, 0, Math.max(1.2, z - 3))[0] - P(side * 6.5, 0, z + 3)[0]) / 2;
    pool(x, wp[0], wp[1], rx, (4.6 / z) * F, "#ff9e48", 1.5 * I);
    const hp = P(side * 6.5, 4.6, z);
    pool(x, hp[0], hp[1], rx * 0.45, (1.6 / z) * F, "#ffd8a0", 1.0 * I);
  }
  for (const sd of [-1, 1]) for (const b of BLD[sd]) {
    if (!b.lit) continue;
    const zm = (b.z0 + b.z1) / 2, k = hz(zm), I = 1 - k * 0.8;
    const c = b.cafe ? "#ff9ab8" : "#ffb870";
    // spill on the pavement in front and up the underside of the awning
    const fp = P(sd * 5.4, 0.15, zm), rr = Math.abs(P(sd * 6.5, 0, b.z0)[0] - P(sd * 6.5, 0, b.z1)[0]) / 2 + 4;
    x.save(); x.translate(fp[0], fp[1]); x.scale(1, clamp(EYE / zm, 0.05, 0.5));
    K.lightPool(x, 0, 0, Math.max(rr, (2.6 / zm) * F), c, { intensity: 0.9 * I });
    x.restore();
    const ap = P(sd * 5.6, 3.0, zm);
    pool(x, ap[0], ap[1], rr, (0.9 / zm) * F, c, 0.8 * I);
  }
  x.globalCompositeOperation = "source-over";
}

function paintStreet(s) {
  paintSky(s);
  // albedo of everything solid, far to near
  const [A, a] = scratchCanvas(LW, LH);
  towerAlbedo(a);
  groundAlbedo(a);
  const all = [];
  for (const sd of [-1, 1]) for (const b of BLD[sd]) all.push([sd, b]);
  all.sort((p, q) => q[1].z0 - p[1].z0);
  for (const [sd, b] of all) facadeAlbedo(a, sd, b);
  applyLight(a, A, LW, LH, streetLightMap);
  s.drawImage(A, 0, 0, LW, LH);
  // emissive: far to near again so nearer awnings overlap
  towerEmit(s);
  for (const [sd, b] of all) facadeEmit(s, sd, b);
  // café blade sign board (the neon itself is live)
  const cz = CAFE.z0 + 1.2;
  const s0 = P(6.5 - 1.9, 6.7, cz), s1 = P(6.5 - 0.1, 5.4, cz);
  s.fillStyle = "#120a12";
  s.fillRect(s0[0], s0[1], s1[0] - s0[0], s1[1] - s0[1]);
  lampPostsPaint(s);
}

function streetLights(g, t, amt = 1) {
  const cf = P(0, 30.5, 118);
  // the wet road mirrors the bright fog at the end of the street and the clock face down its middle
  reflStreak(g, VPX, VPY + 6, 200, 60, "#56648a", 0.2 * amt, t, 1);
  reflStreak(g, cf[0], VPY + 10, 120, 5, "#ffe8b8", 0.3 * amt, t, 2);
  glow(g, cf[0], cf[1], 30, "#ffe8b8", 0.35 * amt);
  for (const [X, z] of LAMPS) {
    const k = hz(z);
    const h = P(X - Math.sign(X) * 0.6, 4.55, z);
    const r = (1.6 / z) * F;
    const fl = 1 - 0.25 * (Math.sin(t * 13 + z) * Math.sin(t * 5.1 + z * 2) > 0.85 ? 1 : 0) * (z > 40 && z < 50 ? 1 : 0);
    // the halo is light scattered by the rain mist round the lamp (the lens adds its own bloom)
    glow(g, h[0], h[1], r * 1.6, LAMP, 0.28 * (1 - k * 0.5) * amt * fl);
    glow(g, h[0], h[1], r * 0.3, "#fff2d8", 0.8 * amt * fl);
    const pool0 = P(X - Math.sign(X) * 0.6, 0.15, z);
    if (z < 70) reflStreak(g, h[0], pool0[1] + 2, Math.min(300, (9 / z) * F + 10), r * 0.55 + 2, LAMP, 0.95 * (1 - k * 0.8) * amt * fl, t, z);
  }
  for (const [X, z, c] of SHOPS) {
    const k = hz(z);
    const p = P(X * 0.98, 1.6, z);
    const f = P(X * 0.8, 0, z);
    reflStreak(g, lerp(p[0], f[0], 0.4), f[1], Math.min(160, (4 / z) * F), (1.0 / z) * F, c, 0.38 * (1 - k) * amt, t, z + 9);
  }
  // wet glints: specular pinpoints on the setts that twinkle as the drops hit them
  for (let i = 0; i < 26; i++) {
    const z = 3 + Math.pow(hash(i, 201), 1.6) * 30, X = (hash(i, 202) - 0.5) * 7.6;
    const tw = Math.pow(Math.max(0, Math.sin(t * (2 + hash(i, 203) * 3) + i * 1.7)), 16);
    if (tw < 0.05) continue;
    const q = P(X, 0, z), r = (0.3 + 2.2 / z) * tw;
    g.fillStyle = rgba(hash(i, 204) > 0.4 ? "#ffe8c8" : "#dfe8ff", 0.8 * tw * amt);
    g.fillRect(q[0] - r * 1.5, q[1] - 0.35, r * 3, 0.7);
  }
  // the café's pink neon
  const cz = CAFE.z0 + 1.2;
  const s0 = P(6.5 - 1.9, 6.7, cz), s1 = P(6.5 - 0.1, 5.4, cz);
  const buzz = 0.82 + 0.18 * (Math.sin(t * 31) > 0.2 ? 1 : 0.4) * (Math.sin(t * 1.3) > -0.7 ? 1 : 0.3);
  const cx = (s0[0] + s1[0]) / 2, cy = (s0[1] + s1[1]) / 2, sw = s1[0] - s0[0];
  // the sign is painted once (at twice its size, for the close shots): glowing text redrawn every
  // frame under a moving, tilting camera cost the graphics card ~100 ms a frame
  const nw = Math.ceil(sw * 1.7) + 28, nh = Math.ceil(sw * 0.75) + 28;
  const sign = SPR("f03neonSign", nw * 2, nh * 2, (n) => {
    n.scale(2, 2);
    n.font = `600 ${Math.max(6, sw * 0.17)}px "Segoe Script", "Brush Script MT", cursive`;
    n.textAlign = "center";
    n.textBaseline = "middle";
    n.shadowColor = NEON;
    n.shadowBlur = 12 * K.pixelScale();
    n.fillStyle = mix(NEON, "#ffffff", 0.7);
    n.fillText("The", nw / 2, nh / 2 - sw * 0.16);
    n.fillText("Purrcolator", nw / 2, nh / 2 + sw * 0.1);
  });
  g.save();
  g.globalAlpha *= buzz * amt;
  g.drawImage(sign, cx - nw / 2, cy - nh / 2, nw, nh);
  g.restore();
  glow(g, cx, cy, sw * 1.1, NEON, 0.3 * buzz * amt);
  reflStreak(g, cx, P(4.5, 0, cz)[1], 120, sw * 0.3, NEON, 0.3 * buzz * amt, t, 77);
}

// distant pedestrians under umbrellas (silhouettes against the lit shops), for life
function pedestrians(g, t) {
  const peds = [[-5.4, 30, 0.9, 1], [5.6, 46, -0.7, 2], [-5.2, 62, 0.6, 3], [5.3, 22, 0.5, 4]];
  for (const [X, z0, v, sd] of peds) {
    const z = z0 + v * t * 0.6 * (sd % 2 ? 1 : -1);
    if (z < 6) continue;
    const k = hz(z);
    const b = P(X, 0.15, z);
    const h = (1.7 / z) * F;
    const c = mix("#0c0f16", "#56607a", k * 0.8);
    const ph = t * 1.8 + sd;
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(b[0], b[1] - h * 0.58, h * 0.12, h * 0.3, 0, 0, TAU);
    g.fill();
    const st = Math.sin(ph * TAU) * h * 0.06;
    g.fillRect(b[0] - h * 0.06 + st, b[1] - h * 0.32, h * 0.05, h * 0.32);
    g.fillRect(b[0] + h * 0.01 - st, b[1] - h * 0.32, h * 0.05, h * 0.32);
    g.beginPath();
    g.ellipse(b[0], b[1] - h * 0.98, h * 0.36, h * 0.15, 0, Math.PI, TAU);
    g.fill();
    g.strokeStyle = c;
    g.lineWidth = Math.max(0.6, h * 0.02);
    g.beginPath(); g.moveTo(b[0], b[1] - h * 0.98); g.lineTo(b[0], b[1] - h * 0.6); g.stroke();
    K.shadowBlob(g, b[0], b[1], h * 0.18, h * 0.03, { alpha: 0.35 * (1 - k) });
  }
}

function litRain(g, t, pts, density) {
  // rain is only really visible where it is backlit: brighter streaks inside the lamp halos
  g.save();
  g.beginPath();
  for (const [x, y, r] of pts) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
  g.clip();
  K.rain(g, LW, LH, t, { density, angle: 0.08, color: "rgba(255,214,160,0.5)", speed: 820, len: 22, seed: 21 });
  g.restore();
}

function shotStreet(g, t, lt, o = {}) {
  const st = SPR("f03street2", LW, LH, paintStreet);
  g.drawImage(st, 0, 0, LW, LH);
  pedestrians(g, t);
  K.fog(g, LW, LH, { y: VPY - 10, h: 130, color: "#7a86a8", alpha: 0.3, t, seed: 3 });
  streetLights(g, t);
  if (o.extra) o.extra(g);
  const halos = [];
  for (const [X, z] of LAMPS) if (z < 40) { const h = P(X - Math.sign(X) * 0.6, 4.5, z); halos.push([h[0], h[1] + (1.4 / z) * F, (2.4 / z) * F]); }
  litRain(g, t, halos, 1.4);
  K.rain(g, LW, LH, t, { density: 0.3, angle: 0.08, color: "rgba(170,190,225,0.22)", speed: 800, seed: 5 });
  K.splashes(g, LW, LH, t, { y0: VPY + 40, y1: LH, density: 0.5, color: "rgba(190,205,235,0.35)" });
}

// ---- shot 2: taping the poster to the lamppost (over the shoulder) ---------------------------------
function paintPoster(s, w, h) {
  // white paper, slightly cockled, crayon drawing of Biscuit
  const pg = s.createLinearGradient(0, 0, w, h);
  pg.addColorStop(0, "#f7f3ea");
  pg.addColorStop(1, "#e4ddd0");
  s.fillStyle = pg;
  s.fillRect(0, 0, w, h);
  crayon(s, "MISSING", w / 2, h * 0.1, w * 0.15, "#c0392b", 1);
  // crayon cat: orange body, stripes, bent ear, red collar
  const cx = w * 0.5, cy = h * 0.42;
  s.save();
  s.lineCap = "round";
  s.lineJoin = "round";
  const scrib = (pts, col, lw) => {
    for (let k = 0; k < 3; k++) {
      s.strokeStyle = rgba(col, k ? 0.45 : 0.85);
      s.lineWidth = lw;
      s.beginPath();
      pts.forEach(([x, y], i) => { const jx = (hash(i * 3 + k, 5) - 0.5) * 2.2, jy = (hash(i * 7 + k, 6) - 0.5) * 2.2; i ? s.lineTo(x + jx, y + jy) : s.moveTo(x + jx, y + jy); });
      s.stroke();
    }
  };
  // body fill with hatching
  s.save();
  s.beginPath();
  s.ellipse(cx + w * 0.05, cy + h * 0.06, w * 0.24, h * 0.1, 0, 0, Math.PI * 2);
  s.arc(cx - w * 0.18, cy - h * 0.04, w * 0.12, 0, Math.PI * 2);
  s.clip();
  s.strokeStyle = "rgba(230,130,40,0.75)";
  s.lineWidth = 2.2;
  s.beginPath();
  for (let i = -40; i < 60; i += 3.2) { s.moveTo(cx - w * 0.4 + i, cy + h * 0.25); s.lineTo(cx - w * 0.4 + i + 22, cy - h * 0.2); }
  s.stroke();
  s.restore();
  scrib([[cx - w * 0.28, cy - h * 0.06], [cx - w * 0.27, cy - h * 0.15], [cx - w * 0.22, cy - h * 0.1], [cx - w * 0.14, cy - h * 0.12], [cx - w * 0.12, cy - h * 0.19], [cx - w * 0.08, cy - h * 0.09]], "#c06018", 1.8);
  // stripes
  for (let i = 0; i < 5; i++) scrib([[cx - w * 0.06 + i * w * 0.07, cy - h * 0.02], [cx - w * 0.03 + i * w * 0.07, cy + h * 0.1]], "#9a4f17", 1.8);
  // collar
  scrib([[cx - w * 0.22, cy + h * 0.06], [cx - w * 0.15, cy + h * 0.08], [cx - w * 0.1, cy + h * 0.05]], "#c0392b", 2.6);
  // eyes + tail
  s.fillStyle = "#2e7a2e";
  s.fillRect(cx - w * 0.22, cy - h * 0.06, 3, 3);
  s.fillRect(cx - w * 0.15, cy - h * 0.06, 3, 3);
  scrib([[cx + w * 0.28, cy + h * 0.04], [cx + w * 0.36, cy - h * 0.05], [cx + w * 0.34, cy - h * 0.14]], "#d97a20", 2.4);
  s.restore();
  crayon(s, "BISCUIT", w / 2, h * 0.64, w * 0.13, "#d35400", 2);
  // the line is set left-aligned in three pieces so the B can be drawn by hand: a font fallback
  // renders crayon-script B as a blob; a kid draws a stem and two bowls
  {
    const fs = w * 0.06, y = h * 0.76;
    s.font = `700 ${fs}px "Segoe Print", "Comic Sans MS", "Bradley Hand", cursive`;
    const a = "ORANGE TABBY. ", b = "ENT EAR.";
    const wa = s.measureText(a).width, wb = s.measureText(b).width, wB = fs * 0.62;
    const x0 = w / 2 - (wa + wB + wb) / 2;
    crayon(s, a, x0, y, fs, "#2a3a6a", 3, "left");
    crayonB(s, x0 + wa + fs * 0.06, y, fs, "#2a3a6a");
    crayon(s, b, x0 + wa + wB, y, fs, "#2a3a6a", 3, "left");
  }
  crayon(s, "RED COLLAR.", w / 2, h * 0.84, w * 0.06, "#2a3a6a", 4);
  crayon(s, "PLEASE HELP", w / 2, h * 0.93, w * 0.065, "#c0392b", 5);
}

// the street behind the post, far out of focus: the real street, magnified and defocused once
const PB = { cx: 690, cy: 232, z: 2.1 }; // which part of the street we look across at, and how tight
const pbX = (x) => (x - PB.cx) * PB.z + LW / 2, pbY = (y) => (y - PB.cy) * PB.z + LH / 2;
function paintPosterBg(s) {
  s.save();
  s.translate(LW / 2, LH / 2);
  s.scale(PB.z, PB.z);
  s.translate(-PB.cx, -PB.cy);
  s.drawImage(SPR("f03street2", LW, LH, paintStreet), 0, 0, LW, LH);
  s.restore();
  // the defocused scene is a touch darker than the post we are focused on
  s.fillStyle = "rgba(6,10,20,0.25)";
  s.fillRect(0, 0, LW, LH);
}
// lamps and lit shop spots behind the post, as the lens draws them out of focus: hexagonal discs
function posterBokeh(g, lt, drift) {
  const L = [];
  for (const [X, z] of LAMPS) {
    if (X < 0 || z > 60) continue;
    const h = P(X - 0.6, 4.55, z);
    const x = pbX(h[0]) - drift, y = pbY(h[1]);
    if (x < -60 || x > LW + 60 || y < -60 || y > LH + 60) continue;
    L.push({ x, y, r: 28 - z * 0.2, color: "#ff8a28", alpha: 0.85 });
  }
  for (let z = CAFE.z0 + 0.8; z < CAFE.z1 - 0.5; z += 1.1) {
    const q = P(6.25, 2.7, z);
    L.push({ x: pbX(q[0]) - drift, y: pbY(q[1]), r: 15, color: "#ffc888", alpha: 0.45 });
  }
  // a car's headlights pass far behind
  const cx = lerp(-260, 1260, seg(lt, 2, 7.5)), ca = K.env(lt, 2, 7.5, 0.6, 0.6);
  if (ca > 0) {
    L.push({ x: cx, y: 360, r: 30, color: "#f4f2ff", alpha: 0.7 * ca });
    L.push({ x: cx + 74, y: 362, r: 30, color: "#f4f2ff", alpha: 0.7 * ca });
  }
  K.bokehLights(g, LW, LH, lt, { count: 0, lights: L, alpha: 0.26, blades: 0 });
}

// A real POV hand, seen from the back (palm toward the poster): tapered fingers built from three
// phalanges each (wide at the knuckle, narrowing to a rounded pad), knuckle creases at every joint,
// the knuckle bumps and tendons on the back of the hand, real nails (pale keratin with a lighter free
// edge and a darker cuticle, never painted), skin shaded as soft cylinders lit from the lamp, a warm
// subsurface rim where light passes through the thin edges, and a broad wet sheen with a few beads.
// (wx, wy) = wrist, L = wrist -> middle fingertip, ang = screen direction the fingers point.
// o: left (mirror), curl [4] 0..1 per finger, thumb {a, curl}, part 'all'|'thumb'|'hand', light {x,y}
const SKIN = { base: "#946450", lit: "#c89276", dark: "#2c1a1c", sss: "#b04430", nail: "#a88a84" };
function realHand(g, wx, wy, L, ang, o = {}) {
  const r = ang + Math.PI / 2, mir = o.left ? -1 : 1;
  // the light direction in hand space: which side of each finger is lit
  const lx = (o.light ? o.light.x : wx + 400) - wx, ly = (o.light ? o.light.y : wy - 400) - wy;
  const lr = Math.hypot(lx, ly) || 1;
  const llx = ((lx * Math.cos(-r) - ly * Math.sin(-r)) / lr) * mir;
  const litSide = llx >= 0 ? 1 : -1;
  const curl = o.curl || [0.1, 0.05, 0.15, 0.2];
  const part = o.part || "all";
  g.save();
  g.translate(wx, wy);
  g.rotate(r);
  g.scale(mir * L / 100, L / 100);
  // ---- geometry (units: L = 100)
  const fingers = [
    { k: [-15, -46], len: 40, w: 9.2, a: -0.1 },
    { k: [-5, -47.5], len: 45, w: 9.6, a: -0.02 },
    { k: [5, -46.5], len: 42, w: 9.0, a: 0.05 },
    { k: [14.5, -43], len: 33, w: 7.8, a: 0.14 },
  ];
  const segs = [];
  fingers.forEach((f, i) => {
    const c = clamp(curl[i] || 0);
    let x = f.k[0], y = f.k[1], a = f.a - Math.PI / 2;
    const pts = [[x, y]], ws = [f.w];
    [0.46, 0.3, 0.24].forEach((q, j) => {
      const fl = Math.cos(c * (0.7 + j * 0.25)); // a curling finger bends away from us: foreshortened
      a += c * 0.12 * (j + 1) * (i - 1.5) * 0.15;
      x += Math.cos(a) * f.len * q * fl; y += Math.sin(a) * f.len * q * fl;
      pts.push([x, y]); ws.push(f.w * (0.94 - j * 0.1));
    });
    segs.push({ pts, ws, c, f });
  });
  const th = o.thumb || { a: -2.25, curl: 0.2 };
  const tpts = [[-15, -12]], tws = [12];
  { let x = -15, y = -12, a = th.a; for (const [q, w] of [[24, 10.5], [19, 9]]) { x += Math.cos(a) * q; y += Math.sin(a) * q; tpts.push([x, y]); tws.push(w); a += th.curl * 0.5; } }
  // ---- paths
  const back = new Path2D();
  back.moveTo(-16, 2); back.bezierCurveTo(-19, -18, -21, -34, -20, -45);
  back.quadraticCurveTo(-6, -52, 8, -50.5); back.quadraticCurveTo(17, -48, 19.5, -41);
  back.bezierCurveTo(21, -26, 19, -10, 16, 2); back.closePath();
  const fingerPath = (s) => { const p = new Path2D(); K.tube(p, s.pts.flat(), s.ws); return p; };
  const thumbPath = (() => { const p = new Path2D(); K.tube(p, tpts.flat(), tws); return p; })();
  const all = new Path2D();
  if (part !== "thumb") { all.addPath(back); segs.forEach((s) => all.addPath(fingerPath(s))); }
  if (part !== "hand") all.addPath(thumbPath);
  // ---- skin: base, then each part as a lit soft cylinder
  const shadeTube = (path, ax, ay, bx, by, w) => {
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const gr = g.createLinearGradient(mx - nx * w * 0.6 * litSide, my - ny * w * 0.6 * litSide, mx + nx * w * 0.6 * litSide, my + ny * w * 0.6 * litSide);
    gr.addColorStop(0, SKIN.dark); gr.addColorStop(0.3, shade(SKIN.base, -0.12)); gr.addColorStop(0.62, SKIN.base); gr.addColorStop(0.82, SKIN.lit); gr.addColorStop(1, shade(SKIN.base, -0.08));
    g.fillStyle = gr; g.fill(path);
  };
  if (part !== "thumb") {
    shadeTube(back, 0, 0, 0, -48, 40);
    segs.forEach((s) => shadeTube(fingerPath(s), s.pts[0][0], s.pts[0][1], s.pts[3][0], s.pts[3][1], s.f.w));
  }
  if (part !== "hand") shadeTube(thumbPath, tpts[0][0], tpts[0][1], tpts[2][0], tpts[2][1], 11);
  g.save();
  g.clip(all);
  if (part !== "thumb") {
    // the back of the hand: knuckle bumps catching the light, the valleys between them, tendons
    fingers.forEach((f) => {
      const kg = g.createRadialGradient(f.k[0] + litSide * 1.5, f.k[1] + 1, 0, f.k[0], f.k[1] + 1, 6);
      kg.addColorStop(0, "rgba(255,214,186,0.45)"); kg.addColorStop(1, "rgba(255,214,186,0)");
      g.fillStyle = kg; g.fillRect(f.k[0] - 7, f.k[1] - 6, 14, 14);
      g.strokeStyle = "rgba(255,220,196,0.12)"; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(f.k[0], f.k[1] + 4); g.quadraticCurveTo(f.k[0] * 0.6, -22, f.k[0] * 0.25, -4); g.stroke();
    });
    for (let i = 0; i < 3; i++) {
      const a = fingers[i].k, b = fingers[i + 1].k;
      g.fillStyle = "rgba(90,40,26,0.18)"; g.beginPath(); g.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 1, 1.6, 4.5, 0, 0, TAU); g.fill();
    }
    // joints: two or three short creases across each finger, deeper on the bent ones
    segs.forEach((s) => {
      for (let j = 1; j <= 2; j++) {
        const [x0, y0] = s.pts[j], [x1, y1] = s.pts[j + 1], [xp, yp] = s.pts[j - 1];
        const dx = x1 - xp, dy = y1 - yp, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, w = s.ws[j] * 0.42;
        g.strokeStyle = `rgba(80,36,22,${0.28 + s.c * 0.25})`; g.lineWidth = 0.55;
        for (let k = -1; k <= (j === 1 ? 1 : 0); k++) {
          const ox = (dx / l) * k * 0.9, oy = (dy / l) * k * 0.9;
          g.beginPath(); g.moveTo(x0 - nx * w + ox, y0 - ny * w + oy); g.quadraticCurveTo(x0 + ox + (dx / l) * 0.8, y0 + oy + (dy / l) * 0.8, x0 + nx * w + ox, y0 + ny * w + oy); g.stroke();
        }
        g.fillStyle = "rgba(255,220,200,0.12)"; g.beginPath(); g.ellipse(x0, y0, w * 0.6, 1.2, Math.atan2(dy, dx) + Math.PI / 2, 0, TAU); g.fill();
      }
      // nail on the distal phalanx: pale, with a lighter free edge, a darker cuticle and a gloss
      const [xa, ya] = s.pts[2], [xb, yb] = s.pts[3];
      const na = Math.atan2(yb - ya, xb - xa), nl = Math.hypot(xb - xa, yb - ya), nw = s.ws[3] * 0.62;
      g.save(); g.translate(lerp(xa, xb, 0.62), lerp(ya, yb, 0.62)); g.rotate(na + Math.PI / 2);
      const nh = nl * 0.62 * (1 - s.c * 0.6);
      g.fillStyle = rgba(SKIN.nail, 0.9); g.beginPath(); K.roundRect(g, -nw / 2, -nh / 2, nw, nh, nw * 0.45); g.fill();
      g.fillStyle = "rgba(255,244,236,0.55)"; g.fillRect(-nw / 2 + 0.4, -nh / 2, nw - 0.8, nh * 0.18);
      g.strokeStyle = "rgba(120,60,44,0.4)"; g.lineWidth = 0.5;
      g.beginPath(); g.ellipse(0, nh / 2, nw * 0.45, 0.9, 0, Math.PI, TAU); g.stroke();
      g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(litSide * nw * 0.18 - 0.4, -nh * 0.3, 0.8, nh * 0.5);
      g.restore();
    });
  }
  if (part !== "hand") {
    // thumb: its joint crease and nail (seen from the side)
    const [x0, y0] = tpts[1], [x1, y1] = tpts[2];
    g.strokeStyle = "rgba(80,36,22,0.35)"; g.lineWidth = 0.6;
    g.beginPath(); g.ellipse(x0, y0, 4, 1.2, Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2, 0, Math.PI); g.stroke();
    g.save(); g.translate(lerp(x0, x1, 0.7), lerp(y0, y1, 0.7)); g.rotate(Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2);
    g.fillStyle = rgba(SKIN.nail, 0.85); g.beginPath(); K.roundRect(g, -3, -4, 5.4, 8, 2.4); g.fill();
    g.fillStyle = "rgba(255,244,236,0.5)"; g.fillRect(-2.6, -4, 4.6, 1.3);
    g.restore();
  }
  // cool sky fill from the side away from the lamp
  const amb = g.createLinearGradient(litSide * 25, 0, -litSide * 25, 0);
  amb.addColorStop(0, "rgba(40,60,110,0)"); amb.addColorStop(1, "rgba(40,60,110,0.28)");
  g.fillStyle = amb; g.fillRect(-30, -100, 60, 110);
  // subsurface: light bleeding red-warm through every thin edge (an inner rim along the silhouette)
  // (only the thin fingertips and the outer palm edge: stroking every overlapping part would draw
  // seams inside the hand)
  const rim = new Path2D();
  if (part !== "thumb") {
    segs.forEach((s) => { const q = new Path2D(); K.tube(q, s.pts.slice(2).flat(), s.ws.slice(2)); rim.addPath(q); });
    rim.moveTo(19.5, -41); rim.bezierCurveTo(21, -26, 19, -10, 16, 2);
  }
  g.strokeStyle = rgba(SKIN.sss, 0.3); g.lineWidth = 2.6; g.stroke(rim);
  g.strokeStyle = rgba("#ff9a70", 0.14 * (litSide > 0 ? 1 : 0.6)); g.lineWidth = 1; g.stroke(rim);
  // wet: a broad soft sheen down the lit side of each finger and across the back; a few beads
  g.lineCap = "round";
  if (part !== "thumb") segs.forEach((s) => {
    g.strokeStyle = "rgba(255,242,228,0.12)"; g.lineWidth = 1.6;
    g.beginPath();
    s.pts.forEach(([x, y], j) => { const xx = x + litSide * s.ws[j] * 0.22; j ? g.lineTo(xx, y) : g.moveTo(xx, y); });
    g.stroke();
  });
  const sh = g.createLinearGradient(-20, -40, 20, -5);
  sh.addColorStop(0, "rgba(255,240,226,0)"); sh.addColorStop(0.5, "rgba(255,240,226,0.12)"); sh.addColorStop(1, "rgba(255,240,226,0)");
  g.fillStyle = sh; g.fillRect(-22, -52, 44, 56);
  for (let i = 0; i < 6; i++) {
    const bx = (hash(i, 31) - 0.5) * 30, by = -8 - hash(i, 32) * 40, br = 0.8 + hash(i, 33) * 1.3;
    g.fillStyle = "rgba(60,30,20,0.25)"; g.beginPath(); g.arc(bx + 0.3, by + 0.4, br, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,246,236,0.6)"; g.beginPath(); g.arc(bx - br * 0.3, by - br * 0.3, br * 0.45, 0, TAU); g.fill();
  }
  g.restore();
  g.restore();
}
// a POV hand as drawHand framed it (x, y = mid-palm, size, ang = finger direction): the cast shadow
// on the poster, the raincoat sleeve and its wet cuff, then the hand itself, and the bell bracelet
function povHand(g, x, y, size, ang, o) {
  const u = size / 100, dx = Math.cos(ang), dy = Math.sin(ang);
  const wx = x - dx * 30 * u, wy = y - dy * 30 * u;
  // the sleeve, back toward the lens
  g.save();
  g.translate(wx, wy); g.rotate(ang + Math.PI / 2); g.scale((o.left ? -1 : 1) * u, u);
  const sg = g.createLinearGradient(-30, 0, 30, 0);
  sg.addColorStop(0, "#1e1604"); sg.addColorStop(0.55, "#6a5410"); sg.addColorStop(0.8, "#8a6c18"); sg.addColorStop(1, "#1e1604");
  g.fillStyle = sg;
  g.beginPath(); g.moveTo(-27, 10); g.lineTo(-40, 200); g.lineTo(44, 200); g.lineTo(29, 10); g.closePath(); g.fill();
  g.restore();
  realHand(g, wx, wy, size * 0.92, ang, o);
  // weighted cuff: a heavy wet hem lying over the wrist, its fold catching the lamp
  wetCuff(g, x, y + 0, size, ang, o.left);
  if (o.bell) {
    const bx = wx + dx * 4 * u, by = wy + dy * 4 * u;
    g.strokeStyle = "#8a2a20"; g.lineWidth = 2.2 * u;
    g.beginPath(); g.ellipse(bx, by, 17 * u, 5 * u, ang + Math.PI / 2, 0, Math.PI); g.stroke();
    const ox = bx + Math.cos(ang + Math.PI / 2) * 6 * u, oy = by + Math.sin(ang + Math.PI / 2) * 6 * u + Math.sin(o.t * 3) * 0.6;
    const bg = g.createRadialGradient(ox - 1.5 * u, oy - 1.5 * u, 0, ox, oy, 4.5 * u);
    bg.addColorStop(0, "#fff0b8"); bg.addColorStop(0.4, "#d4a43a"); bg.addColorStop(1, "#5a3a08");
    g.fillStyle = bg; g.beginPath(); g.arc(ox, oy, 4.5 * u, 0, TAU); g.fill();
  }
}// the raincoat cuff over the wrist (in drawHand's local frame): a turned-back hem with a wet top edge
function wetCuff(g, x, y, size, ang, left) {
  const u = size / 100;
  g.save();
  g.translate(x, y);
  g.rotate(ang + Math.PI / 2);
  g.scale((left ? -1 : 1) * u, u);
  const cg = g.createLinearGradient(-28, 0, 30, 0);
  cg.addColorStop(0, "#3a2a06"); cg.addColorStop(0.55, "#9a7a1c"); cg.addColorStop(0.8, "#c89a2a"); cg.addColorStop(1, "#3a2a06");
  g.fillStyle = cg;
  g.beginPath(); g.moveTo(-27, 30); g.quadraticCurveTo(0, 22, 29, 30); g.lineTo(30, 46); g.quadraticCurveTo(0, 38, -28, 46); g.closePath(); g.fill();
  // occlusion where the hem meets the wrist, a wet specular along the fold
  const og = g.createLinearGradient(0, 40, 0, 47);
  og.addColorStop(0, "rgba(0,0,0,0)"); og.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = og;
  g.beginPath(); g.moveTo(-28, 46); g.quadraticCurveTo(0, 38, 30, 46); g.lineTo(30, 40); g.quadraticCurveTo(0, 33, -28, 40); g.fill();
  const hg = g.createLinearGradient(-20, 0, 22, 0);
  hg.addColorStop(0, "rgba(255,236,190,0)"); hg.addColorStop(0.6, "rgba(255,236,190,0.55)"); hg.addColorStop(1, "rgba(255,236,190,0)");
  g.fillStyle = hg;
  g.beginPath(); g.moveTo(-20, 27.5); g.quadraticCurveTo(0, 22, 22, 27.5); g.quadraticCurveTo(0, 24, -20, 29); g.fill();
  g.restore();
}

// the iron lamp column: painted, chipped metal, a cylinder lit from the lamp above right
function paintColumn(s, w, h) {
  K.texRect(s, "metal", 0, 0, w, h, { tex: { seed: 6, size: 128, rust: 0.35 }, scale: 120, tint: "#3e6a50", tintAlpha: 0.7 });
  const cg = s.createLinearGradient(0, 0, w, 0);
  cg.addColorStop(0, "rgba(0,0,0,0.8)");
  cg.addColorStop(0.3, "rgba(0,0,0,0.42)");
  cg.addColorStop(0.62, "rgba(0,0,0,0.12)");
  cg.addColorStop(0.75, "rgba(0,0,0,0.0)");
  cg.addColorStop(0.9, "rgba(0,0,0,0.4)");
  cg.addColorStop(1, "rgba(0,0,0,0.8)");
  s.fillStyle = cg;
  s.fillRect(0, 0, w, h);
  // fluting: each flute is a tiny cylinder with its own shadow and lit edge
  for (let i = 1; i < 8; i++) {
    const x = (i / 8) * w, a = Math.sin((i / 8) * Math.PI);
    s.fillStyle = rgba("#000000", 0.35 * a);
    s.fillRect(x - 1.6, 0, 2.4, h);
    s.fillStyle = rgba("#c8d8c8", 0.12 * a * (i / 8));
    s.fillRect(x + 0.8, 0, 1, h);
  }
  // the warm key from the lamp head above: brighter toward the top
  const kg = s.createLinearGradient(0, 0, 0, h);
  kg.addColorStop(0, "rgba(255,170,90,0.32)");
  kg.addColorStop(1, "rgba(255,170,90,0.04)");
  s.globalCompositeOperation = "lighter";
  s.fillStyle = kg;
  s.fillRect(w * 0.6, 0, w * 0.2, h);
  // wet specular: a sharp sheen line down the lit side
  s.fillStyle = "rgba(255,226,180,0.35)";
  s.fillRect(w * 0.7, 0, 1.6, h);
  s.globalCompositeOperation = "source-over";
}

function shotPoster(g, t, lt) {
  const drift = lt * 3;
  g.drawImage(softSprite("f03posterBg", LW, LH, 11, paintPosterBg), -20 - drift, -10, LW + 40, LH + 20);
  posterBokeh(g, lt, drift);
  // far rain, out of focus: soft streaks only where the lamps light them
  K.rain(g, LW, LH, t, { density: 0.35, angle: 0.06, color: "rgba(220,200,170,0.18)", seed: 31, len: 40, width: 1.6 });
  // the lamppost
  const px = 520, pw0 = 92;
  g.drawImage(SPR("f03column", pw0, LH + 40, paintColumn), px - pw0 / 2, -20, pw0, LH + 40);
  // rivulets running down the post, each a bright bead leading a wet trail
  for (let i = 0; i < 7; i++) {
    const x = px - 30 + hash(i, 4) * 60, y = ((hash(i, 5) * 600 + lt * (30 + hash(i, 6) * 50)) % 640) - 60;
    const tg = g.createLinearGradient(0, y - 60, 0, y);
    tg.addColorStop(0, "rgba(200,215,240,0)"); tg.addColorStop(1, "rgba(220,225,240,0.22)");
    g.fillStyle = tg;
    g.fillRect(x - 0.8, y - 60, 1.6, 60);
    glow(g, x + 0.5, y, 3, "#ffe6c8", 0.6);
  }
  // older posters on the post, rain-soaked and torn, half in shadow
  posterAt(g, px + 18, 455, 74, 96, 401, 0.06, "#4a5068");
  posterAt(g, px - 14, 92, 70, 90, 402, -0.04, "#5a5a6a");

  // our poster arrives with the hands
  const arrive = eio(seg(lt, 0.2, 2.6));
  const pw = 172, ph = 230;
  const pxp = px - pw / 2 + 6, pyp = lerp(330, 190, arrive);
  const tilt = lerp(-0.12, -0.02, arrive);
  const poster = SPR("f03poster", pw, ph, paintPoster);
  g.save();
  g.translate(pxp + pw / 2, pyp + ph / 2);
  g.rotate(tilt);
  K.shadowBlob(g, 6, 6, pw * 0.5, ph * 0.5, { alpha: 0.35, soft: 0.15 });
  g.drawImage(poster, -pw / 2, -ph / 2, pw, ph);
  // the paper bends round the post: shading across it, the lit side toward the lamp
  const wrap = g.createLinearGradient(-pw / 2, 0, pw / 2, 0);
  wrap.addColorStop(0, "rgba(10,16,32,0.6)");
  wrap.addColorStop(0.3, "rgba(10,16,32,0.18)");
  wrap.addColorStop(0.65, "rgba(10,16,32,0.0)");
  wrap.addColorStop(0.88, "rgba(10,16,32,0.2)");
  wrap.addColorStop(1, "rgba(10,16,32,0.6)");
  g.fillStyle = wrap;
  g.fillRect(-pw / 2, -ph / 2, pw, ph);
  // the light on it: dim blue sky fill, warm lamp falling from the top right
  g.globalCompositeOperation = "multiply";
  const lg = g.createLinearGradient(pw / 2, -ph / 2, -pw / 2, ph / 2);
  lg.addColorStop(0, "#d8b48c");
  lg.addColorStop(0.5, "#8a8a9c");
  lg.addColorStop(1, "#4a5470");
  g.fillStyle = lg;
  g.fillRect(-pw / 2, -ph / 2, pw, ph);
  g.globalCompositeOperation = "source-over";
  // plastic sleeve: a soft specular band (the lamp reflected) + beads of rain
  const sh = g.createLinearGradient(-pw / 2, -ph / 2, pw / 2, ph / 2);
  sh.addColorStop(0, "rgba(255,255,255,0)");
  sh.addColorStop(0.44, "rgba(255,255,255,0.0)");
  sh.addColorStop(0.5, "rgba(255,230,200,0.14)");
  sh.addColorStop(0.56, "rgba(255,255,255,0.0)");
  g.fillStyle = sh;
  g.fillRect(-pw / 2 - 3, -ph / 2 - 3, pw + 6, ph + 6);
  g.fillStyle = "rgba(200,215,240,0.06)";
  g.fillRect(-pw / 2 - 3, -ph / 2 - 3, pw + 6, 3);
  // the lamp mirrored in the sheet: a sharp-cored specular streak that slides as the poster settles,
  // wrinkled where the plastic is not flat
  {
    const sx = lerp(-40, 30, arrive) - lt * 2;
    g.save();
    g.beginPath(); g.rect(-pw / 2 - 3, -ph / 2 - 3, pw + 6, ph + 6); g.clip();
    g.rotate(-0.55);
    const ss = g.createLinearGradient(sx - 26, 0, sx + 26, 0);
    ss.addColorStop(0, "rgba(255,236,210,0)"); ss.addColorStop(0.4, "rgba(255,236,210,0.12)"); ss.addColorStop(0.5, "rgba(255,246,232,0.42)"); ss.addColorStop(0.56, "rgba(255,236,210,0.1)"); ss.addColorStop(1, "rgba(255,236,210,0)");
    g.fillStyle = ss;
    g.beginPath(); g.moveTo(sx - 26, -260);
    for (let yy = -260; yy <= 260; yy += 20) g.lineTo(sx - 26 + Math.sin(yy * 0.05 + 1.3) * 3, yy);
    g.lineTo(sx + 26, 260);
    for (let yy = 260; yy >= -260; yy -= 20) g.lineTo(sx + 26 + Math.sin(yy * 0.05) * 3, yy);
    g.closePath(); g.fill();
    g.restore();
    // the sleeve's thickness at its edges: a bright refracted line with a dark line inside it, and the
    // print just inside the edge shifted a hair (a lens through the folded plastic)
    g.strokeStyle = "rgba(255,240,220,0.32)"; g.lineWidth = 1.2;
    g.strokeRect(-pw / 2 - 2.5, -ph / 2 - 2.5, pw + 5, ph + 5);
    g.strokeStyle = "rgba(10,14,24,0.35)"; g.lineWidth = 1;
    g.strokeRect(-pw / 2 - 0.8, -ph / 2 - 0.8, pw + 1.6, ph + 1.6);
    g.globalAlpha = 0.35;
    g.drawImage(poster, 0, 0, poster.width, poster.height * 0.05, -pw / 2, -ph / 2 + 1.5, pw, ph * 0.05);
    g.globalAlpha = 1;
  }
  K.glassDrops(g, -pw / 2 - 3, -ph / 2 - 3, pw + 6, ph + 6, lt, { seed: 13, density: 1.4, light: "#ffd8a8" });
  // tape strips appear as the hands press them
  const tapes = [[-pw / 2 + 4, -ph / 2 + 2, -0.5, 4.0], [pw / 2 - 4, -ph / 2 + 2, 0.5, 4.6], [-pw / 2 + 4, ph / 2 - 2, 0.5, 5.6], [pw / 2 - 4, ph / 2 - 2, -0.5, 6.2]];
  for (const [x, y, a, at] of tapes) {
    const k = smooth(seg(lt, at - 0.4, at));
    if (k <= 0) continue;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = `rgba(170,165,150,${0.5 * k})`;
    g.fillRect(-22 * k, -7, 44 * k, 14);
    g.fillStyle = `rgba(255,236,210,${0.18 * k})`;
    g.fillRect(-22 * k, -7, 44 * k, 2.5);
    g.restore();
  }
  g.restore();
  // hands: right hand smoothing tape, left hand (bell on the wrist) holding the poster
  const hk = eio(seg(lt, 0, 2.4));
  const press = Math.max(0, Math.sin(lt * 2.2)) * 0.5;
  const lhx = lerp(300, 446, hk), lhy = lerp(660, 462, hk);
  const tgt = lt < 5 ? [pxp + 22, pyp + 20] : [pxp + 30, pyp + ph - 10];
  const rk = eio(seg(lt, 1.6, 3.6));
  const rhx = lerp(980, tgt[0] + 150, rk) - press * 6, rhy = lerp(700, tgt[1] + 150, rk) + press * 4;
  const hl = { x: 820, y: -60, color: "#ffc890", strength: 1.15, z: 0.25 };
  K.shadowBlob(g, rhx - 70, rhy - 60, 50, 30, { alpha: 0.25 });
  // left hand: fingers spread flat holding the poster's lower-left corner to the post, the thumb
  // tucked under the paper edge; right hand: index pressing the tape, the others curled
  const press2 = Math.max(0, Math.sin(lt * 2.2));
  povHand(g, lhx, lhy - 20, 172, -1.25, { left: true, curl: [0.08, 0.04, 0.1, 0.16], thumb: { a: -2.6, curl: 0.15 }, light: hl, bell: true, t: lt });
  povHand(g, rhx, rhy, 172, -2.35, { curl: [0.05 + press2 * 0.1, 0.62, 0.72, 0.8], thumb: { a: -2.0, curl: 0.4 }, light: hl, t: lt });
  // over-the-shoulder: the wet yellow hood edge right at the lens, far out of focus
  g.drawImage(softSprite("f03hoodS", LW, LH, 12, (f) => {
    const hg = f.createLinearGradient(0, 220, 200, 540);
    hg.addColorStop(0, "#4a3608");
    hg.addColorStop(0.5, "#241a04");
    hg.addColorStop(1, "#0c0802");
    f.fillStyle = hg;
    f.beginPath();
    f.moveTo(-40, 222);
    f.bezierCurveTo(70, 212, 160, 330, 175, LH + 40);
    f.lineTo(-40, LH + 40);
    f.closePath();
    f.fill();
    // its rim: the lamp catching the wet PVC along the curve
    const rg = f.createLinearGradient(0, 220, 170, 520);
    rg.addColorStop(0, "rgba(255,200,120,0.5)");
    rg.addColorStop(1, "rgba(255,200,120,0.05)");
    f.fillStyle = rg;
    f.beginPath();
    f.moveTo(-40, 222); f.bezierCurveTo(70, 212, 160, 330, 175, LH + 40);
    f.lineTo(163, LH + 40); f.bezierCurveTo(146, 340, 64, 232, -40, 236); f.closePath();
    f.fill();
  }), 0, 0, LW, LH);
  // warm the reveal's wall plate before the cut
  if (lt > 6.5) wallSprite();
}

// ---- shot 3: pull back, the town is full of missing posters ------------------------------------------
const GREYS = ["#8a8f96", "#3a3a40", "#c9b48a", "#6a5a4a", "#e8e0d0", "#2a2420", "#a0a4aa"];
function paintOtherPoster(s, w, h, seed) {
  const R = K.rng("f03op" + seed);
  const faded = R();
  const paper = mix(["#efe9da", "#f3e3c8", "#dfe6ea", "#f6efe0", "#f0d8d8"][Math.floor(R() * 5)], "#9aa3b0", faded * 0.35);
  s.fillStyle = paper;
  s.fillRect(0, 0, w, h);
  const ink = mix(["#1a1a22", "#6a1010", "#102a6a"][Math.floor(R() * 3)], paper, faded * 0.5);
  s.fillStyle = ink;
  const hd = ["LOST", "MISSING", "LOST CAT", "HAVE YOU SEEN", "MISSING CAT", "PLEASE"][Math.floor(R() * 6)];
  s.font = `700 ${Math.round(w * (hd.length > 8 ? 0.11 : 0.17))}px ${R() > 0.5 ? "Georgia, serif" : "\"Segoe Print\", \"Comic Sans MS\", cursive"}`;
  s.textAlign = "center";
  s.textBaseline = "top";
  s.fillText(hd, w / 2, h * 0.04);
  // photo area with a grey cat shape (a little photo, half washed out)
  const col = mix(GREYS[Math.floor(R() * GREYS.length)], paper, faded * 0.4);
  s.fillStyle = mix(paper, "#5a6070", 0.25);
  s.fillRect(w * 0.15, h * 0.22, w * 0.7, h * 0.42);
  s.fillStyle = col;
  const cx = w * 0.5, cy = h * 0.5;
  s.beginPath();
  s.ellipse(cx, cy + h * 0.06, w * 0.17, h * 0.1, 0, 0, Math.PI * 2);
  s.arc(cx - w * 0.1, cy - h * 0.06, w * 0.09, 0, Math.PI * 2);
  s.fill();
  s.beginPath();
  s.moveTo(cx - w * 0.18, cy - h * 0.1); s.lineTo(cx - w * 0.16, cy - h * 0.17); s.lineTo(cx - w * 0.12, cy - h * 0.12);
  s.moveTo(cx - w * 0.06, cy - h * 0.12); s.lineTo(cx - w * 0.03, cy - h * 0.17); s.lineTo(cx - w * 0.01, cy - h * 0.09);
  s.fill();
  // handwriting lines
  s.strokeStyle = rgba(ink, 0.7);
  s.lineWidth = 1.1;
  for (let i = 0; i < 4; i++) {
    const y = h * (0.71 + i * 0.07);
    s.beginPath();
    s.moveTo(w * 0.12, y);
    for (let x = w * 0.12; x < w * (0.62 + R() * 0.26); x += 3) s.lineTo(x, y + Math.sin(x * 0.9 + i) * 1.2);
    s.stroke();
  }
  // tear-off phone tabs on some
  if (R() > 0.5) for (let i = 0; i < 6; i++) { s.fillStyle = paper; s.fillRect(w * (0.05 + i * 0.15), h * 0.98, w * 0.12, h * 0.12); }
  // rain damage: streaks and a soggy lower edge
  const wg = s.createLinearGradient(0, h * 0.6, 0, h);
  wg.addColorStop(0, "rgba(60,70,90,0)");
  wg.addColorStop(1, `rgba(60,70,90,${0.2 + faded * 0.3})`);
  s.fillStyle = wg;
  s.fillRect(0, 0, w, h);
  // age: some yellowed, some sun-bleached, some rain-wrinkled with darker wet patches
  const age = R();
  if (age < 0.33) { s.globalCompositeOperation = "multiply"; s.fillStyle = "rgba(232,206,140,0.55)"; s.fillRect(0, 0, w, h); s.globalCompositeOperation = "source-over"; }
  else if (age < 0.6) { s.fillStyle = "rgba(240,240,236,0.35)"; s.fillRect(0, 0, w, h); }
  else {
    for (let i = 0; i < 4; i++) {
      const bx = R() * w, by = h * (0.3 + R() * 0.7), br = w * (0.15 + R() * 0.25);
      const bg = s.createRadialGradient(bx, by, 0, bx, by, br);
      bg.addColorStop(0, "rgba(50,58,74,0.28)"); bg.addColorStop(0.8, "rgba(50,58,74,0.18)"); bg.addColorStop(1, "rgba(50,58,74,0)");
      s.fillStyle = bg; s.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    s.lineWidth = 0.6;
    for (let i = 0; i < 6; i++) {
      const x0 = R() * w, y0 = R() * h;
      s.strokeStyle = "rgba(30,34,44,0.25)"; s.beginPath(); s.moveTo(x0, y0); s.quadraticCurveTo(x0 + (R() - 0.5) * 10, y0 + 8, x0 + (R() - 0.5) * 6, y0 + 16 + R() * 10); s.stroke();
      s.strokeStyle = "rgba(255,255,255,0.18)"; s.beginPath(); s.moveTo(x0 + 0.8, y0); s.quadraticCurveTo(x0 + 0.8 + (R() - 0.5) * 10, y0 + 8, x0 + 0.8, y0 + 18); s.stroke();
    }
  }
}
// A poster stuck to a real surface: a tight 1-2 px drop shadow onto the surface (paper stands off
// the brick a hair) plus a softer one, the print, its tape or staples, and on some a torn corner
// peeling off the wall - the paper's blank back showing, its lit edge, the shadow it throws.
// o.wrap (on a post): shade it as paper bent round a cylinder and band it with tape all the way round.
function posterAt(g, x, y, w, h, seed, rot, light, o = {}) {
  const spr = SPR("f03op" + seed, 60, 80, (s, ww, hh) => paintOtherPoster(s, ww, hh, seed));
  const R = (k) => hash(seed * 1.37 + k, 77);
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = "rgba(0,0,0,0.18)";
  g.fillRect(-w / 2 + 2.5, -h / 2 + 3.5, w, h);
  g.fillStyle = "rgba(0,0,0,0.42)";
  g.fillRect(-w / 2 + 1, -h / 2 + 1.5, w, h);
  g.drawImage(spr, -w / 2, -h / 2, w, h);
  if (o.wrap) {
    const wg = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    wg.addColorStop(0, "rgba(6,8,16,0.55)"); wg.addColorStop(0.3, "rgba(6,8,16,0.1)"); wg.addColorStop(0.62, "rgba(255,220,170,0.06)"); wg.addColorStop(0.85, "rgba(6,8,16,0.2)"); wg.addColorStop(1, "rgba(6,8,16,0.6)");
    g.fillStyle = wg; g.fillRect(-w / 2, -h / 2, w, h);
  }
  if (light) { g.globalCompositeOperation = "multiply"; g.fillStyle = light; g.fillRect(-w / 2, -h / 2, w, h); g.globalCompositeOperation = "source-over"; }
  // fixings: tape bands (round the post), clear tape at the top corners, or staples
  const fix = o.wrap ? 3 : Math.floor(R(1) * 3);
  if (fix === 3) {
    for (const yy of [-h / 2 + 3, h / 2 - 5]) {
      g.fillStyle = "rgba(170,166,150,0.3)"; g.fillRect(-w / 2 - 1.5, yy - 2.5, w + 3, 5);
      g.fillStyle = "rgba(255,240,215,0.18)"; g.fillRect(-w / 2 - 3, yy - 2.5, w + 6, 1);
    }
  } else if (fix < 2) {
    for (const sx of [-1, 1]) {
      g.save(); g.translate(sx * (w / 2 - 2), -h / 2 + 1); g.rotate(sx * 0.7);
      g.fillStyle = "rgba(214,208,186,0.4)"; g.fillRect(-6, -2.5, 12, 5);
      g.fillStyle = "rgba(255,244,220,0.22)"; g.fillRect(-6, -2.5, 12, 1);
      g.restore();
    }
    if (fix === 1) { g.fillStyle = "rgba(214,208,186,0.35)"; g.fillRect(-4, h / 2 - 4, 8, 5); }
  } else {
    g.fillStyle = "rgba(40,40,46,0.85)";
    for (const sx of [-1, 1]) { g.fillRect(sx * (w / 2 - 5) - 2, -h / 2 + 3, 4, 1); g.fillRect(sx * (w / 2 - 5) - 2, h / 2 - 4, 4, 1); }
  }
  // a torn corner lifting off the wall
  if (!o.wrap && R(2) > 0.55) {
    const cx = (R(3) > 0.5 ? 1 : -1) * w / 2, cy = (R(4) > 0.6 ? 1 : -1) * h / 2, s = Math.min(w, h) * (0.16 + R(5) * 0.14);
    const sx = -Math.sign(cx), sy = -Math.sign(cy);
    g.fillStyle = "rgba(40,22,18,0.9)"; // the wall where the corner came away
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + sx * s, cy); g.lineTo(cx, cy + sy * s); g.closePath(); g.fill();
    g.fillStyle = "rgba(0,0,0,0.35)"; // the flap's shadow
    g.beginPath(); g.moveTo(cx + sx * s, cy + 1); g.lineTo(cx + sx * s * 0.25 + 1.5, cy + sy * s * 0.25 + 2); g.lineTo(cx + 1, cy + sy * s); g.closePath(); g.fill();
    g.fillStyle = "#cfc6b4"; // the curled flap: the paper's blank back
    g.beginPath(); g.moveTo(cx + sx * s, cy); g.quadraticCurveTo(cx + sx * s * 0.45, cy + sy * s * 0.1, cx + sx * s * 0.3, cy + sy * s * 0.3); g.quadraticCurveTo(cx + sx * s * 0.1, cy + sy * s * 0.45, cx, cy + sy * s); g.closePath(); g.fill();
    g.strokeStyle = "rgba(255,236,200,0.6)"; g.lineWidth = 0.7; // the lit edge of the fold
    g.beginPath(); g.moveTo(cx + sx * s, cy); g.lineTo(cx, cy + sy * s); g.stroke();
  }
  g.restore();
}
// The wall of posters, painted at 2x (the camera starts 2.3x in on it): albedo first (wet brick, a dark
// shop window, a door, the Lost & Found board, the drainpipe, three dozen posters), then one light map
// (blue-hour sky + the two lamps' inverse-square pools) multiplied over it, so a poster under the lamp
// is warm paper and one in the dark is blue-grey, never a glowing white card.
const WALL_LAMPS = [[330, 30, 1.0], [880, 92, 0.7]];
function paintPosterWall(s) {
  const SC = 2;
  const [A, a] = scratchCanvas(LW * SC, LH * SC);
  a.scale(SC, SC);
  K.texRect(a, "brick", 0, 0, LW, 420, { tex: { seed: 3, color: "#7a3e2e", wet: 0.6, size: 128 }, scale: 88 });
  // rain-darkened runs down the brick from the sills and the gutter
  const R = K.rng("f03brick");
  for (let i = 0; i < 30; i++) {
    const x = R() * LW, w = 4 + R() * 18;
    const gr = a.createLinearGradient(0, 0, 0, 420);
    gr.addColorStop(0, "rgba(10,10,20,0.3)");
    gr.addColorStop(1, "rgba(10,10,20,0)");
    a.fillStyle = gr;
    a.fillRect(x, 0, w, 300 + R() * 120);
  }
  // shop window (dark glass in a painted frame) and a door
  a.fillStyle = "#0c1018"; a.fillRect(40, 170, 220, 190);
  K.texRect(a, "wood", 32, 162, 236, 8, { tex: { seed: 2, size: 128, color: "#3a3a40", planks: 6 }, scale: 200 });
  K.texRect(a, "wood", 32, 360, 236, 10, { tex: { seed: 2, size: 128, color: "#3a3a40", planks: 6 }, scale: 200 });
  a.fillStyle = "#2a2a30"; a.fillRect(32, 170, 8, 190); a.fillRect(260, 170, 8, 190); a.fillRect(146, 170, 6, 190);
  K.texRect(a, "wood", 790, 150, 110, 270, { tex: { seed: 2, size: 128, color: "#2a2a36", planks: 6 }, scale: 220, rot: Math.PI / 2 });
  a.fillStyle = "rgba(0,0,0,0.35)"; a.fillRect(806, 170, 78, 100); a.fillRect(806, 290, 78, 110);
  // Lost & Found: an oak frame round a cork panel, a header plank with routed lettering
  a.fillStyle = "#3a2618"; a.fillRect(560, 54, 210, 256);
  a.fillStyle = "#22160c"; a.fillRect(566, 60, 198, 26);
  K.texRect(a, "fabric", 570, 92, 190, 210, { tex: { seed: 3, size: 64 }, scale: 30, tint: "#9a7448", tintAlpha: 0.85 });
  a.fillStyle = "#d8ccb0";
  a.textAlign = "center"; a.textBaseline = "middle";
  let lfs = 17;
  a.font = `700 ${lfs}px Georgia, serif`;
  while (lfs > 9 && a.measureText("LOST & FOUND").width > 176) { lfs--; a.font = `700 ${lfs}px Georgia, serif`; }
  a.fillText("LOST & FOUND", 665, 74);
  a.textBaseline = "alphabetic";
  const R2 = K.rng("f03board");
  for (let i = 0; i < 16; i++) {
    const x = 590 + (i % 4) * 46 + R2() * 6, y = 115 + Math.floor(i / 4) * 50 + R2() * 6;
    posterAt(a, x, y, 36 + R2() * 8, 46 + R2() * 6, 100 + i, (R2() - 0.5) * 0.3);
  }
  // posters only on real surfaces: brick (never across the glass, the door or the drainpipe), the
  // board; tried positions that would hang over a void are skipped
  const R3 = K.rng("f03wall");
  const voids = [[24, 154, 252, 222], [778, 140, 136, 290], [488, 0, 38, 420], [552, 46, 226, 272]];
  for (let i = 0; i < 150; i++) {
    const x = R3() * LW, y = 30 + R3() * 320, pw = 30 + R3() * 22, ph = 40 + R3() * 26, rot = (R3() - 0.5) * 0.3;
    if (voids.some(([vx, vy, vw, vh]) => x + pw / 2 > vx && x - pw / 2 < vx + vw && y + ph / 2 > vy && y - ph / 2 < vy + vh)) continue;
    if (y + ph / 2 > 404) continue;
    posterAt(a, x, y, pw, ph, 200 + i, rot);
  }
  // cast-iron drainpipe with its brackets
  const dp = a.createLinearGradient(500, 0, 514, 0);
  dp.addColorStop(0, "#0e1014"); dp.addColorStop(0.6, "#3a3e48"); dp.addColorStop(1, "#0e1014");
  a.fillStyle = dp; a.fillRect(500, 0, 14, 420);
  for (let y = 40; y < 420; y += 110) { a.fillStyle = "#16181e"; a.fillRect(497, y, 20, 6); }
  // the pavement: wet asphalt flags meeting the wall, in perspective
  a.save();
  a.beginPath(); a.rect(0, 412, LW, LH - 412); a.clip();
  K.groundPlane(a, LW, LH, { tex: "asphalt", texOpts: { seed: 6, size: 128, color: "#6a6a6c" }, horizon: 300, scale: 420, wet: 0.85, puddles: 0.3, sky: "#9aa8c8", fogAmt: 0, cache: false });
  a.strokeStyle = "rgba(0,0,0,0.3)"; a.lineWidth = 1;
  for (let x = -400; x < LW + 400; x += 110) { a.beginPath(); a.moveTo(480 + (x - 480) * 0.45, 412); a.lineTo(x, LH); a.stroke(); }
  for (const y of [430, 462, 512]) { a.beginPath(); a.moveTo(0, y); a.lineTo(LW, y); a.stroke(); }
  a.restore();
  applyLight(a, A, LW * SC, LH * SC, (x) => {
    x.scale(SC, SC);
    const am = x.createLinearGradient(0, 0, 0, LH);
    am.addColorStop(0, "#2a3250"); am.addColorStop(0.75, "#222a40"); am.addColorStop(0.77, "#4a5674"); am.addColorStop(1, "#3a4460");
    x.fillStyle = am;
    x.fillRect(0, 0, LW, LH);
    x.globalCompositeOperation = "lighter";
    for (const [lx, ly, I] of WALL_LAMPS) {
      // on the wall: the lamp is a little in front of it, so the pool is broad and brightest just below the head
      // inverse-square falloff down and along the wall: posters fade from lamp-lit to dark
      pool(x, lx, ly + 70, 320 * I + 40, 280 * I + 30, "#ff9e48", 1.55 * I);
      pool(x, lx, ly + 40, 120 * I, 100 * I, "#ffd8a8", 1.0 * I);
      // on the pavement at its foot, foreshortened
      pool(x, lx, ly + 420 * I + 20, 220 * I, 34 * I, "#ff9e48", 1.1 * I);
    }
  });
  // occlusion where the wall meets the pavement
  K.aoEdge(a, 0, 412, LW, 412, { width: 14, alpha: 0.55, side: 1 });
  s.drawImage(A, 0, 0, LW, LH);
}
function lampPost(g, x, yb, h, w, posters, seed) {
  const pg = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  pg.addColorStop(0, "#0b120e");
  pg.addColorStop(0.55, "#2c4434");
  pg.addColorStop(0.7, "#6f8a74");
  pg.addColorStop(1, "#0a100c");
  g.fillStyle = pg;
  g.fillRect(x - w / 2, yb - h, w, h);
  g.fillRect(x - w * 0.9, yb - h * 0.06, w * 1.8, h * 0.06);
  // lantern head
  g.fillStyle = "#151a18";
  g.beginPath();
  g.moveTo(x - w * 1.6, yb - h); g.lineTo(x + w * 1.6, yb - h); g.lineTo(x + w * 1.1, yb - h - w * 2.4); g.lineTo(x - w * 1.1, yb - h - w * 2.4);
  g.fill();
  g.fillStyle = "#ffe0a8";
  g.fillRect(x - w * 1.1, yb - h - w * 2.1, w * 2.2, w * 1.8);
  // posters taped round the column: no wider than the post can hold, shaded as paper bent round it,
  // banded with tape; the lower ones further from the lamp head are darker
  for (let i = 0; i < posters; i++) posterAt(g, x + (hash(i, seed) - 0.5) * w * 0.15, yb - h * (0.3 + i * 0.13), w * 1.45, w * 2.2, 300 + seed * 10 + i, (hash(i + 0.4, seed) - 0.5) * 0.06, mix("#b8987a", "#2a3452", 0.2 + i * 0.16), { wrap: true });
}
const wallSprite = () => SPR("f03wall2", LW * 2, LH * 2, (s) => { s.scale(2, 2); paintPosterWall(s); });
function shotReveal(g, t, lt) {
  // a true pull back: from the one new poster on our post, out to the whole wall of them
  const p = eio(seg(lt, 0.2, 8.4));
  const zoom = lerp(2.3, 1.0, p);
  K.withCamera(g, LW, LH, { x: lerp(336, 480, p), y: lerp(236, 270, p), zoom, shakeT: t, shakeAmt: 1 }, (c) => {
    c.drawImage(wallSprite(), 0, 0, LW, LH);
    // the dark shop window reflects the street lamps
    c.save();
    c.beginPath(); c.rect(44, 174, 212, 182); c.clip();
    const wr = c.createLinearGradient(44, 174, 256, 356);
    wr.addColorStop(0, "rgba(120,140,190,0.18)");
    wr.addColorStop(0.5, "rgba(120,140,190,0.02)");
    wr.addColorStop(1, "rgba(120,140,190,0.12)");
    c.fillStyle = wr;
    c.fillRect(44, 174, 212, 182);
    glow(c, 210, 210, 40, LAMP, 0.35);
    glow(c, 90, 230, 24, LAMP, 0.25);
    c.restore();
    // second post (further right), posters on it
    lampPost(c, 880, 432, 330, 12, 4, 2);
    glow(c, 880, 432 - 330 - 14, 46, LAMP, 0.7);
    // our post, close, with the new poster (bright, orange)
    lampPost(c, 330, 470, 420, 20, 3, 1);
    glow(c, 330, 470 - 420 - 24, 70, LAMP, 0.8);
    glow(c, 330, 470 - 420 - 24, 16, "#ffffff", 0.8);
    const pw = 54, ph = 72;
    c.save();
    c.translate(334, 240);
    c.rotate(-0.02);
    c.fillStyle = "rgba(0,0,0,0.45)"; c.fillRect(-pw / 2 + 1, -ph / 2 + 1.5, pw, ph);
    c.drawImage(SPR("f03poster", 172, 230, paintPoster), -pw / 2, -ph / 2, pw, ph);
    c.globalCompositeOperation = "multiply";
    c.fillStyle = "#c0a488";
    c.fillRect(-pw / 2, -ph / 2, pw, ph);
    c.globalCompositeOperation = "source-over";
    for (const [tx, ty, ta] of [[-pw / 2 + 2, -ph / 2 + 1, -0.5], [pw / 2 - 2, -ph / 2 + 1, 0.5], [-pw / 2 + 2, ph / 2 - 1, 0.5], [pw / 2 - 2, ph / 2 - 1, -0.5]]) {
      c.save(); c.translate(tx, ty); c.rotate(ta); c.fillStyle = "rgba(190,184,166,0.45)"; c.fillRect(-6, -2, 12, 4); c.restore();
    }
    c.restore();
    // you: from behind, hood up, looking at the posters
    // contact shadow, and the cast shadow the post lamp (behind, to the right) throws toward camera
    K.shadowBlob(c, 150, 504, 22, 3.5, { alpha: 0.8 });
    K.shadowBlob(c, 150, 505, 44, 7, { alpha: 0.3 });
    c.save(); c.translate(118, 522); c.rotate(-0.5); c.scale(1, 0.3);
    K.shadowBlob(c, 0, 0, 58, 26, { alpha: 0.4 });
    c.restore();
    kidStill(c, 150, 505, 200, zoom, { t: lt, light: { x: 330, y: 30, color: LAMP, strength: 0.9, z: -0.5 }, ambient: "#141c30", wet: 0.8 });
    // wet pavement reflections
    reflStreak(c, 330, 470, 70, 16, LAMP, 0.4, t, 3);
    reflStreak(c, 880, 436, 60, 10, LAMP, 0.3, t, 4);
    c.save();
    c.translate(330, 470);
    c.scale(1, 0.2);
    glow(c, 0, 0, 260, LAMP, 0.35);
    c.restore();
  });
  K.rain(g, LW, LH, t, { density: 0.7, angle: 0.08, color: "rgba(190,205,235,0.35)", seed: 41 });
  K.splashes(g, LW, LH, t, { y0: 440, y1: LH, density: 0.6 });
  // warm the café shot's plates before the cut
  if (lt > 5.5) softSprite("f03cafeSoft2", LW, LH, 5, (s) => paintCafeInterior(s));
  if (lt > 6.5) softSprite("f03cafeRefl", LW, LH, 6, paintCafeReflection);
  if (lt > 7.2) SPR("f03glass", LW, LH, paintCafeGlass);
}

// ---- shot 4: the café window ------------------------------------------------------------------------
// The café interior, ~3 m behind the glass: albedo x light like the street. Exposed brick, a shelf of
// cups and jars, the chalk menu and a chrome espresso machine, lit by three pendant bulbs (warm,
// inverse-square on the wall) with the corners falling away into shadow.
const CAFE_BULBS = [[250, 92], [480, 70], [712, 96]];
function paintCafeInterior(s) {
  const [A, a] = scratchCanvas(LW, LH);
  // back wall: brick above a dark wood dado
  K.texRect(a, "brick", 0, 0, LW, 300, { tex: { seed: 3, color: "#7a3e2e", wet: 0.6, size: 128 }, scale: 120 });
  a.fillStyle = "rgba(90,60,50,0.25)"; a.fillRect(0, 0, LW, 300);
  K.texRect(a, "wood", 0, 300, LW, 240, { tex: { seed: 2, size: 128, color: "#6a4028", planks: 6 }, scale: 150, rot: Math.PI / 2 });
  // three shelves: wood boards with cups, mugs and jars standing on them
  for (let r = 0; r < 3; r++) {
    const y = 132 + r * 58;
    const R = K.rng("f03cup" + r);
    for (let x = 150; x < 600; x += 18 + R() * 16) {
      const w = 11 + R() * 9, h = 14 + R() * 14, jar = R() < 0.3;
      const base = jar ? mix("#c88a3a", "#7a4a20", R()) : mix("#efe6d8", ["#b85a3a", "#3a5a6a", "#d8c8a8"][Math.floor(R() * 3)], R() * 0.7);
      const cg = a.createLinearGradient(x, 0, x + w, 0);
      cg.addColorStop(0, shade(base, -0.35)); cg.addColorStop(0.35, base); cg.addColorStop(0.55, shade(base, 0.15)); cg.addColorStop(1, shade(base, -0.45));
      a.fillStyle = cg;
      a.beginPath(); K.roundRect(a, x, y - h, w, h, jar ? 3 : 1.5); a.fill();
      if (jar) { a.fillStyle = "#3a2a20"; a.fillRect(x - 0.5, y - h - 3, w + 1, 4); }
    }
    K.texRect(a, "wood", 140, y, 480, 7, { tex: { seed: 2, size: 128, color: "#6a4028", planks: 6 }, scale: 90 });
    a.fillStyle = "rgba(0,0,0,0.5)"; a.fillRect(140, y + 7, 480, 6);
  }
  // chalk menu in a wooden frame (the lettering is soft chalk, partly rubbed out)
  a.fillStyle = "#3a2618"; a.fillRect(636, 40, 172, 128);
  K.texRect(a, "plaster", 644, 48, 156, 112, { tex: { seed: 4, color: "#8a96a0", grime: "#3a3a3a", stain: 0.5, size: 128 }, scale: 140, tint: "#1e2622", tintAlpha: 0.92 });
  a.font = '600 13px "Segoe Print", cursive';
  a.fillStyle = "rgba(230,230,220,0.55)";
  a.fillText("Purr-over  3", 656, 80); a.fillText("Mew-cha    4", 656, 106); a.fillText("Hot milk   2", 656, 132);
  // espresso machine: brushed steel, curved reflections of the room in its flank
  const mx = 640, my = 250, mw = 190, mh = 90;
  K.texRect(a, "metal", mx, my, mw, mh, { tex: { seed: 6, size: 128, rust: 0.35 }, scale: 120, tint: "#b8b8c0", tintAlpha: 0.5 });
  const sg = a.createLinearGradient(mx, 0, mx + mw, 0);
  sg.addColorStop(0, "rgba(0,0,0,0.6)"); sg.addColorStop(0.18, "rgba(255,230,200,0.35)"); sg.addColorStop(0.3, "rgba(0,0,0,0.15)");
  sg.addColorStop(0.7, "rgba(0,0,0,0.25)"); sg.addColorStop(0.85, "rgba(255,230,200,0.25)"); sg.addColorStop(1, "rgba(0,0,0,0.6)");
  a.fillStyle = sg; a.fillRect(mx, my, mw, mh);
  for (const gx of [mx + 50, mx + 140]) { a.fillStyle = "#1a1a1c"; a.fillRect(gx - 10, my + mh, 20, 14); a.fillStyle = "#e8e4dc"; a.fillRect(gx - 8, my + mh + 26, 16, 12); }
  // the back counter top (lit edge) and the dark counter front
  a.fillStyle = "#c89a6a"; a.fillRect(0, 338, LW, 4);
  a.fillStyle = "#2a1810"; a.fillRect(0, 342, LW, LH - 342);
  applyLight(a, A, LW, LH, (x) => {
    x.fillStyle = "#2a2028"; // dim ambient (some of it the blue street through the window)
    x.fillRect(0, 0, LW, LH);
    x.globalCompositeOperation = "lighter";
    for (const [bx, by] of CAFE_BULBS) {
      x.save(); x.translate(bx, by + 60); x.scale(1, 1.25);
      K.lightPool(x, 0, 0, 330, "#ff9a48", { intensity: 1.35 });
      K.lightPool(x, 0, 0, 120, "#ffd8a8", { intensity: 0.8 });
      x.restore();
    }
  });
  s.drawImage(A, 0, 0, LW, LH);
  // occlusion: the wall darkens into the ceiling and down behind the counter
  const og = s.createLinearGradient(0, 0, 0, LH);
  og.addColorStop(0, "rgba(10,4,4,0.75)"); og.addColorStop(0.12, "rgba(10,4,4,0)");
  og.addColorStop(0.6, "rgba(10,4,4,0)"); og.addColorStop(0.65, "rgba(10,4,4,0.5)"); og.addColorStop(1, "rgba(10,4,4,0.8)");
  s.fillStyle = og; s.fillRect(0, 0, LW, LH);
  // pendant cords
  s.strokeStyle = "#140c0a"; s.lineWidth = 1.5;
  for (const [bx, by] of CAFE_BULBS) { s.beginPath(); s.moveTo(bx, 0); s.lineTo(bx, by - 12); s.stroke(); s.fillStyle = "#1a120e"; s.fillRect(bx - 6, by - 14, 12, 7); }
}
// the street behind the camera, reflected in the glass: flipped, defocused, faint
function paintCafeReflection(s) {
  s.save();
  s.translate(LW, 0); s.scale(-1, 1);
  s.translate(LW / 2, LH / 2); s.scale(1.5, 1.5); s.translate(-560, -250);
  s.drawImage(SPR("f03street2", LW, LH, paintStreet), 0, 0, LW, LH);
  s.restore();
}
// pre-blurred sprite: painted once on a scratch canvas, then copied through a blur filter
function softSprite(key, w, h, blurPx, paint) {
  return SPR(key, w, h, (s) => {
    const T = K.makeCanvas(Math.ceil(w * K.pixelScale()), Math.ceil(h * K.pixelScale()));
    const tg = T.getContext("2d");
    tg.setTransform(K.pixelScale(), 0, 0, K.pixelScale(), 0, 0);
    try { paint(tg, w, h); } catch (err) { console.warn("[f03] soft", key, err); }
    if (K.hasFilter() && blurPx > 0) s.filter = `blur(${K.qblur((blurPx * K.pixelScale()).toFixed(2))}px)`;
    s.drawImage(T, 0, 0, w, h);
    s.filter = "none";
  });
}
// the window glass (static): condensation, heavier in a band at the bottom where it beads up, with
// clear runs wiped through it by the drops; the frame; the gold-leaf lettering read from outside
function paintCafeGlass(s) {
  // the pane runs from the head rail (40) down to the stall riser (392)
  const fg = s.createLinearGradient(0, 40, 0, 392);
  fg.addColorStop(0, "rgba(190,180,196,0.14)");
  fg.addColorStop(0.45, "rgba(190,180,196,0.03)");
  fg.addColorStop(0.75, "rgba(190,180,196,0.06)");
  fg.addColorStop(1, "rgba(206,196,206,0.24)");
  s.fillStyle = fg;
  s.fillRect(60, 40, 840, 352);
  const R = K.rng("f03cond");
  for (let i = 0; i < 1100; i++) {
    const x = 60 + R() * 840, y = 392 - Math.pow(R(), 1.8) * 90, r = 0.5 + R() * 1.6;
    s.fillStyle = "rgba(40,20,20,0.18)";
    s.beginPath(); s.arc(x + 0.4, y + 0.6, r, 0, TAU); s.fill();
    s.fillStyle = "rgba(255,236,226,0.32)";
    s.beginPath(); s.arc(x - r * 0.25, y - r * 0.3, r * 0.55, 0, TAU); s.fill();
  }
  // condensation: the warm, humid room fogs the lower third of the cold pane - a milky, uneven haze
  // (heavier at the sill, patchy where the glass is warmer)
  const cf = s.createLinearGradient(0, 250, 0, 392);
  cf.addColorStop(0, "rgba(214,200,206,0)"); cf.addColorStop(0.45, "rgba(214,200,206,0.06)"); cf.addColorStop(1, "rgba(222,208,214,0.17)");
  s.fillStyle = cf; s.fillRect(60, 250, 840, 142);
  // clear runs: drips that ran down through the fog, each wiping a clean wavering track to the sill,
  // led by a bead at its head
  s.globalCompositeOperation = "destination-out";
  s.lineCap = "round";
  const heads = [];
  for (let i = 0; i < 16; i++) {
    const x = 74 + R() * 812, y0 = i < 10 ? 268 + R() * 70 : 60 + R() * 200, w = 1.6 + R() * 2.6;
    s.strokeStyle = i < 10 ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.3)";
    s.lineWidth = w;
    s.beginPath(); s.moveTo(x, y0);
    for (let y = y0; y < 392; y += 6) s.lineTo(x + Math.sin(y * 0.05 + i * 1.7) * 1.4 + Math.sin(y * 0.17 + i) * 0.5, y);
    s.stroke();
    heads.push([x, y0, w]);
  }
  s.globalCompositeOperation = "source-over";
  for (const [x, y, w] of heads) {
    s.fillStyle = "rgba(30,16,14,0.4)"; s.beginPath(); s.arc(x + 0.4, y + 0.6, w * 0.9, 0, TAU); s.fill();
    s.fillStyle = "rgba(255,236,222,0.55)"; s.beginPath(); s.arc(x - w * 0.25, y - w * 0.3, w * 0.4, 0, TAU); s.fill();
  }
  // the beads that sit still on the glass are baked in here; only the sliding ones are drawn live
  K.glassDrops(s, 60, 40, 840, 352, 0, { seed: 23, density: 0.8, light: "#ffe0c8" });
  // window frame, painted wood with a pink neon catch on the inner edges
  // painted timber frame and the stall riser below the sill: wet gloss paint over wood grain, lit only
  // by the blue street and a pink edge of neon
  const frame = new Path2D();
  frame.rect(0, 0, LW, 40); frame.rect(0, 40, 60, LH - 40); frame.rect(900, 40, 60, LH - 40); frame.rect(60, 392, 840, LH - 392); frame.rect(470, 40, 12, 352);
  K.texFill(s, "wood", frame, { tex: { seed: 2, size: 128, color: "#6a4028", planks: 6 }, scale: 200, tint: "#1a2a26", tintAlpha: 0.88 });
  s.fillStyle = "rgba(6,10,16,0.45)"; s.fill(frame);
  // the riser's fielded panels: a bevel catches the street light along its top, shadow below
  for (const [x0, x1] of [[90, 450], [512, 870]]) {
    s.fillStyle = "rgba(0,0,0,0.35)"; s.fillRect(x0, 420, x1 - x0, 64);
    s.fillStyle = "rgba(140,160,200,0.14)"; s.fillRect(x0, 418, x1 - x0, 2); s.fillRect(x0, 420, 2, 64);
    s.fillStyle = "rgba(0,0,0,0.5)"; s.fillRect(x0, 484, x1 - x0, 2);
  }
  // the sill: a rounded wet edge, a bright line where it catches the lamp
  s.fillStyle = "rgba(0,0,0,0.6)"; s.fillRect(60, 392, 840, 6);
  s.fillStyle = "rgba(255,214,190,0.22)"; s.fillRect(60, 398, 840, 1.5);
  s.fillStyle = "rgba(255,150,200,0.2)";
  s.fillRect(57, 40, 3, 352); s.fillRect(897, 40, 3, 352); s.fillRect(479, 40, 2, 352);
}
// the street behind the camera reflected in the pane, with the Fresnel ramp baked in (stronger at the
// top of the glass, ~12%, falling to ~7% at the sill)
function paintCafeReflFresnel(s) {
  s.drawImage(softSprite("f03cafeRefl", LW, LH, 6, paintCafeReflection), 0, 0, LW, LH);
  s.globalCompositeOperation = "destination-in";
  const fr = s.createLinearGradient(0, 40, 0, 392);
  fr.addColorStop(0, "rgba(0,0,0,0.5)"); fr.addColorStop(0.5, "rgba(0,0,0,0.3)"); fr.addColorStop(1, "rgba(0,0,0,0.22)");
  s.fillStyle = fr; s.fillRect(0, 0, LW, LH);
  s.globalCompositeOperation = "source-over";
}
// "The Purrcolator" in gold leaf on the glass, read from the street: a dark keyline shadow, the gold
// itself (a mirror-gold gradient: it reflects the dark street above and the warm room below), a
// bevel - lit upper-left edge, shadowed lower-right - and a burnished streak across the leaf.
function paintCafeLetters(s) {
  const T = "The Purrcolator";
  const cx = 210, by = 52;
  s.textAlign = "center";
  s.font = "italic 600 30px Georgia, serif";
  s.fillStyle = "rgba(20,10,2,0.6)";
  s.fillText(T, cx + 1.4, by + 1.8);
  // the leaf on its own little canvas so the streak and bevel stay inside the letters
  const [L, l] = scratchCanvas(420, 90);
  l.textAlign = "center";
  l.font = "italic 600 30px Georgia, serif";
  const gl = l.createLinearGradient(0, by - 24, 0, by + 6);
  gl.addColorStop(0, "#fbe6a8"); gl.addColorStop(0.42, "#c8963a"); gl.addColorStop(0.5, "#6a4612"); gl.addColorStop(0.58, "#e8c070"); gl.addColorStop(1, "#8a5e1c");
  l.fillStyle = gl;
  l.fillText(T, cx, by);
  l.globalCompositeOperation = "source-atop";
  l.fillStyle = "rgba(255,250,220,0.55)"; l.fillText(T, cx - 0.7, by - 0.9); // bevel: lit edge
  l.fillStyle = gl; l.fillText(T, cx + 0.2, by + 0.2);
  l.fillStyle = "rgba(40,20,4,0.45)"; l.fillText(T, cx + 0.9, by + 1.1); // bevel: shadow edge
  l.fillStyle = gl; l.fillText(T, cx + 0.05, by + 0.05);
  const st = l.createLinearGradient(cx - 120, by - 30, cx + 40, by + 10);
  st.addColorStop(0, "rgba(255,255,240,0)"); st.addColorStop(0.45, "rgba(255,250,225,0)"); st.addColorStop(0.5, "rgba(255,250,225,0.6)"); st.addColorStop(0.56, "rgba(255,250,225,0)"); st.addColorStop(1, "rgba(255,255,240,0)");
  l.fillStyle = st; l.fillRect(0, 0, 420, 90);
  l.globalCompositeOperation = "source-over";
  s.drawImage(L, 0, 0, 420, 90);
  s.font = "italic 400 14px Georgia, serif";
  s.fillStyle = "rgba(20,10,2,0.5)"; s.fillText("coffee \u00b7 milk \u00b7 naps", cx + 0.8, by + 25);
  s.fillStyle = "rgba(214,172,96,0.85)"; s.fillText("coffee \u00b7 milk \u00b7 naps", cx, by + 24);
}// the striped awning edge right at the lens, painted once and pre-blurred (it is far out of focus)
function paintAwningFg(s) {
  const ag = s.createLinearGradient(0, 0, 0, 70);
  ag.addColorStop(0, "#4a0f26");
  ag.addColorStop(1, "#22060f");
  s.fillStyle = ag;
  s.fillRect(-20, 0, LW + 40, 50);
  for (let x = -20; x < LW + 20; x += 72) { s.fillStyle = "rgba(236,214,224,0.4)"; s.fillRect(x, 0, 36, 50); }
  for (let x = -20; x < LW + 20; x += 36) {
    s.fillStyle = (Math.round((x + 20) / 36) % 2) ? "#2a0818" : "#6a5a62";
    s.beginPath(); s.moveTo(x, 48); s.quadraticCurveTo(x + 18, 76, x + 36, 48); s.fill();
  }
  s.fillStyle = "rgba(255,200,220,0.18)";
  s.fillRect(-20, 46, LW + 40, 3);
}
// the barista: a cream cat with real tone in its coat (warm buff, not paper white)
const CREAM = Object.assign({}, K.COATS.cream, { base: "#d6b98c", light: "#ecd8b4", dark: "#a2835a", belly: "#ecdcc2" });
// A pelt break-up overlay (baked once, per pixel): an fbm value field - denser, darker patches and
// paler guard-hair tufts - multiplied with fine vertical fur streaks. Transparent at mid value, dark
// warm brown below it, pale cream above it, so drawn source-atop it modulates the coat both ways.
function furBreakup() {
  return SPR("f03furBreak", 256, 256, (s) => {
    const px = K.pixelScale(), n = Math.ceil(256 * px);
    const T = K.makeCanvas(n, n), tg = T.getContext("2d", { willReadFrequently: true });
    const im = tg.createImageData(n, n), d = im.data;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i / px, y = j / px;
      const big = K.texFbm(x / 46, y / 46, 61, 3) - 0.5;
      const streak = K.texNoise(x / 1.6, y / 9, 62) - 0.5;
      const tuft = K.texNoise(x / 5, y / 14, 63) - 0.5;
      const v = big * 1.1 + streak * 0.55 + tuft * 0.3;
      const o = (j * n + i) * 4;
      if (v < 0) { d[o] = 70; d[o + 1] = 40; d[o + 2] = 18; d[o + 3] = Math.min(110, -v * 120); }
      else { d[o] = 255; d[o + 1] = 238; d[o + 2] = 206; d[o + 3] = Math.min(90, v * 90); }
    }
    tg.putImageData(im, 0, 0);
    s.drawImage(T, 0, 0, 256, 256);
  });
}
function shotCafe(g, t, lt) {
  // warm the alley's plates before the cut (cache only; nothing drawn)
  if (lt > 4.5) settsMips();
  if (lt > 5.5) SPR("f03alleyNear", LW, LH, paintAlleyNear);
  if (lt > 6.0) alleyMistMask();
  if (lt > 6.5) SPR("f03alley", LW, LH, paintAlley);
  if (lt > 7.5) SPR("f03afgBase", LW, LH, paintAlleyFg);
  if (lt > 8.5) softSprite("f03alleySoft", LW, LH, 3, paintAlleySoftSrc);
  const p = eio(seg(lt, 0, 10));
  K.withCamera(g, LW, LH, { x: lerp(470, 500, p), y: 270, zoom: lerp(1.0, 1.05, p), shakeT: t, shakeAmt: 1 }, (c) => {
    // interior: painted once and pre-blurred (it is behind the glass, out of focus)
    c.drawImage(softSprite("f03cafeSoft2", LW, LH, 5, (s) => paintCafeInterior(s)), 0, 0, LW, LH);
    // the pendant bulbs: hot filaments, out of focus (soft cores, the lens blooms them)
    for (const [x, y] of CAFE_BULBS) {
      glow(c, x, y, 90, "#ff9a48", 0.35);
      glow(c, x, y, 22, "#ffe2b0", 0.9);
      c.fillStyle = "#fff8ec";
      c.beginPath(); c.ellipse(x, y, 7, 9, 0, 0, TAU); c.fill();
    }
    // steam off the espresso machine's cup, curling up through the bulb light
    for (let i = 0; i < 5; i++) {
      const u = ((lt * 0.22 + i / 5) % 1);
      const y = 330 - u * 170;
      glow(c, 690 + Math.sin(lt * 0.9 + i * 1.7 + u * 4) * 14 * u, y, 22 + u * 30, "#f0e2d4", 0.1 * Math.sin(u * Math.PI), "screen");
    }
    // the inside window ledge the cat sits on: oiled oak, lit from the pendant above, its front in shadow
    K.texRect(c, "wood", 60, 348, 840, 14, { tex: { seed: 2, size: 128, color: "#6a4028", planks: 6 }, scale: 420, scaleY: 60 });
    K.texRect(c, "wood", 60, 362, 840, 30, { tex: { seed: 2, size: 128, color: "#6a4028", planks: 6 }, scale: 420, scaleY: 120, tint: "#2a140a", tintAlpha: 0.75 });
    c.save();
    c.beginPath(); c.rect(60, 348, 840, 14); c.clip();
    c.save(); c.translate(640, 352); c.scale(1, 0.1);
    K.lightPool(c, 0, 0, 380, "#ffa860", { intensity: 0.75 });
    c.restore();
    c.restore();
    c.fillStyle = "rgba(255,214,170,0.35)"; c.fillRect(60, 347.5, 840, 1.2); // the lit, slightly rounded nose
    K.aoEdge(c, 60, 388, 900, 388, { width: 12, alpha: 0.6, side: 0 });
    // a cup on the ledge: round body, handle, a saucer and its shadow
    K.shadowBlob(c, 562, 349, 16, 2.5, { alpha: 0.55, color: "#140804" });
    const cupg = c.createLinearGradient(548, 0, 570, 0);
    cupg.addColorStop(0, "#fff8ee"); cupg.addColorStop(0.6, "#e6d8c6"); cupg.addColorStop(1, "#9a8070");
    c.fillStyle = cupg;
    c.beginPath(); c.moveTo(549, 331); c.lineTo(569, 331); c.quadraticCurveTo(569, 348, 559, 348); c.quadraticCurveTo(549, 348, 549, 331); c.fill();
    c.strokeStyle = "#cbb8a4"; c.lineWidth = 2;
    c.beginPath(); c.arc(571, 338, 4, -1.2, 1.4); c.stroke();
    c.fillStyle = "#3a1e10"; c.beginPath(); c.ellipse(559, 331.5, 9.5, 1.8, 0, 0, TAU); c.fill();
    // the barista cat on the ledge. Acting: head turned away into the café; a glance toward you that
    // never lands (32-33 s); then at 34.8 s the ears swivel first, and the head follows - a clear ~60
    // degree yaw round to profile, looking down the street.
    const glance = eio(seg(lt, 2.2, 3.4)) * (1 - eio(seg(lt, 4.2, 5.2)));
    const snap = eio(seg(lt, 6.55, 7.35));
    const head = lerp(-0.55 + 0.95 * glance, 0.3, snap) + Math.sin(lt * 1.3) * 0.03 * (1 - snap) + Math.sin(lt * 2.1) * 0.012;
    const earSw = K.env(lt, 6.25, 6.7, 0.12, 0.2); // the ears turn toward the sound before the head
    const ears = lerp(0.25, 1, snap) - 0.75 * earSw;
    const catX = 668, catY = 352, cs = 112;
    K.shadowBlob(c, catX - cs * 0.05, catY + 1, cs * 0.5, cs * 0.045, { alpha: 0.75, color: "#120602" });
    const bx0 = catX - cs * 1.6, by0 = catY - cs * 2.1, bw0 = cs * 3.2, bh0 = cs * 2.3;
    tinted(c, "barista", bx0, by0, bw0, bh0, (cg) => {
      K.drawCat(cg, catX, catY, cs, {
        pose: "sit", facing: -1, coat: CREAM, headTurn: head, headTilt: 0.04 * glance - 0.05 * snap, t: lt,
        blink: K.env(lt, 5.2, 5.5, 0.08, 0.08) + K.env(lt, 8.4, 8.7, 0.08, 0.08), collar: false, bell: false, ears,
        // key: the pendant bulb directly above (top-lit head and shoulders); rim: the cold street
        // through the glass on the window side; the shadow side falls into warm bounce off the oak
        key: { x: CAFE_BULBS[2][0] - 20, y: CAFE_BULBS[2][1], color: "#ffc080", strength: 1.8 },
        rim: { x: catX - 320, y: catY - 90, color: "#8aa4d8", strength: 1.0 },
        fill: "#3a2012", ambient: "#2e2024", ambientK: 0.18, backlit: 0.3, pupil: 0.75,
        ground: "#1a0c06", shadow: false,
      });
      cg.save();
      cg.globalCompositeOperation = "source-atop";
      // fur break-up: an fbm value field (patches of denser / lighter coat) plus fine fur streaks, so
      // the cream reads as a pelt, not a paper cut-out (kept subtle: it modulates, never speckles)
      cg.globalAlpha = 0.45;
      cg.drawImage(furBreakup(), catX - cs * 1.1, catY - cs * 1.9, cs * 2.2, cs * 2.0);
      cg.globalAlpha = 1;
      // form light (fur only): the pendant is almost straight above, so the crown, the top of the head
      // and the shoulders catch it and everything below the chest rolls off into warm shadow
      const kx = catX - cs * 0.1, ky = catY - cs * 1.7;
      const tg = cg.createRadialGradient(kx, ky, cs * 0.05, kx, ky + cs * 0.2, cs * 1.25);
      tg.addColorStop(0, "rgba(255,214,160,0.22)"); tg.addColorStop(0.3, "rgba(255,190,130,0.06)");
      tg.addColorStop(0.55, "rgba(40,18,8,0.42)"); tg.addColorStop(1, "rgba(20,8,3,0.82)");
      cg.fillStyle = tg; cg.fillRect(bx0, by0, bw0, bh0);
      // the skull is a sphere: lit on its brow and muzzle (toward the bulb and the glass), turning
      // through a soft terminator into warm shade behind the cheek and under the jaw
      const hx = catX - cs * 0.46, hy = catY - cs * 1.7;
      const hg = cg.createRadialGradient(hx, hy, 0, hx, hy, cs * 0.62);
      hg.addColorStop(0, "rgba(60,26,10,0)"); hg.addColorStop(0.32, "rgba(60,26,10,0)"); hg.addColorStop(0.62, "rgba(54,22,8,0.42)");
      hg.addColorStop(0.85, "rgba(54,22,8,0.22)"); hg.addColorStop(1, "rgba(54,22,8,0)");
      cg.fillStyle = hg; cg.fillRect(hx - cs * 0.62, hy - cs * 0.62, cs * 1.24, cs * 1.24);
      // the far flank turns away from the room light (warm core shadow down the back); the window
      // side of the chest and face picks up the cold street through the glass
      const fs = cg.createLinearGradient(catX - cs * 0.62, 0, catX + cs * 0.7, 0);
      fs.addColorStop(0, "rgba(130,160,220,0.22)"); fs.addColorStop(0.12, "rgba(120,150,210,0.06)"); fs.addColorStop(0.35, "rgba(0,0,0,0)");
      fs.addColorStop(0.75, "rgba(40,16,6,0.18)"); fs.addColorStop(1, "rgba(30,12,4,0.4)");
      cg.fillStyle = fs; cg.fillRect(bx0, by0, bw0, bh0);
      // the apron, seen in profile: a linen bib wrapping the curve of the chest from under the chin
      // down between the forelegs. Painted source-atop, so its outer edge IS the chest's own outline;
      // only its inner edge (where it turns away round the chest) is drawn, as a soft curve.
      const fx0 = catX - cs * 1.0; // well outside the chest: the fur silhouette trims it
      const bib = new Path2D();
      bib.moveTo(fx0, catY - cs * 1.16);
      bib.lineTo(catX - cs * 0.36, catY - cs * 1.16);
      bib.bezierCurveTo(catX - cs * 0.22, catY - cs * 1.0, catX - cs * 0.17, catY - cs * 0.72, catX - cs * 0.22, catY - cs * 0.42);
      bib.quadraticCurveTo(catX - cs * 0.42, catY - cs * 0.36, fx0, catY - cs * 0.4);
      bib.closePath();
      // a cylinder of cloth: the front of the chest faces the glass (cool rim + bulb light from above),
      // turning into deep shade where it wraps away under the leg
      const ag = cg.createLinearGradient(catX - cs * 0.6, 0, catX - cs * 0.18, 0);
      ag.addColorStop(0, "#5a7e70"); ag.addColorStop(0.18, "#3c6150"); ag.addColorStop(0.55, "#2c4c3c"); ag.addColorStop(0.85, "#18291f"); ag.addColorStop(1, "#0d1711");
      cg.fillStyle = ag; cg.fill(bib);
      const lp = K.texPattern(cg, "fabric", { seed: 5, size: 64 });
      if (lp.setTransform) lp.setTransform(new DOMMatrix([0.3, 0, 0, 0.3, catX, catY]));
      cg.globalAlpha = 0.28; cg.fillStyle = lp; cg.fill(bib); cg.globalAlpha = 1;
      cg.save();
      cg.clip(bib);
      // top light from the pendant on the upper chest; the lower bib in the chin's and leg's shadow
      const bl = cg.createLinearGradient(0, catY - cs * 1.16, 0, catY - cs * 0.38);
      bl.addColorStop(0, "rgba(255,214,160,0.24)"); bl.addColorStop(0.3, "rgba(255,214,160,0.05)"); bl.addColorStop(1, "rgba(6,10,8,0.5)");
      cg.fillStyle = bl; cg.fillRect(fx0, catY - cs * 1.2, cs, cs * 0.9);
      // the cloth doesn't lie flat: soft drape folds where it sags between neck and legs, each a
      // shadowed trough under a lit lip
      cg.lineCap = "round";
      for (const [fy, a] of [[0.9, 0.12], [0.7, 0.17]]) {
        const y = catY - cs * fy;
        cg.strokeStyle = `rgba(4,10,6,${a})`; cg.lineWidth = cs * 0.026;
        cg.beginPath(); cg.moveTo(catX - cs * 0.62, y + cs * 0.03); cg.quadraticCurveTo(catX - cs * 0.42, y + cs * 0.06, catX - cs * 0.22, y - cs * 0.01); cg.stroke();
        cg.strokeStyle = `rgba(200,226,210,${a * 0.42})`; cg.lineWidth = cs * 0.011;
        cg.beginPath(); cg.moveTo(catX - cs * 0.62, y + cs * 0.005); cg.quadraticCurveTo(catX - cs * 0.42, y + cs * 0.035, catX - cs * 0.22, y - cs * 0.035); cg.stroke();
      }
      // occlusion along the inner edge where the bib lifts off the fur
      const ie = cg.createLinearGradient(catX - cs * 0.32, 0, catX - cs * 0.17, 0);
      ie.addColorStop(0, "rgba(0,0,0,0)"); ie.addColorStop(1, "rgba(0,0,0,0.45)");
      cg.fillStyle = ie; cg.fillRect(catX - cs * 0.32, catY - cs * 1.2, cs * 0.2, cs * 0.85);
      cg.restore();
      // the hemmed top edge under the chin: a rolled lip catching the bulb
      cg.strokeStyle = "rgba(230,240,224,0.32)"; cg.lineWidth = cs * 0.012;
      cg.beginPath(); cg.moveTo(catX - cs * 0.7, catY - cs * 1.15); cg.lineTo(catX - cs * 0.36, catY - cs * 1.15); cg.stroke();
      // the shadow the bib casts on the fur just below its hem
      cg.fillStyle = "rgba(30,14,6,0.35)";
      cg.beginPath(); cg.moveTo(fx0, catY - cs * 0.4); cg.quadraticCurveTo(catX - cs * 0.42, catY - cs * 0.36, catX - cs * 0.22, catY - cs * 0.42);
      cg.quadraticCurveTo(catX - cs * 0.42, catY - cs * 0.3, fx0, catY - cs * 0.33); cg.closePath(); cg.fill();
      // the neck strap: from the bib's top corner up round the neck (under the ruff), sinking into the fur
      cg.strokeStyle = "#20382b"; cg.lineWidth = cs * 0.034;
      cg.beginPath(); cg.moveTo(catX - cs * 0.4, catY - cs * 1.14); cg.quadraticCurveTo(catX - cs * 0.2, catY - cs * 1.24, catX + cs * 0.02, catY - cs * 1.3); cg.stroke();
      cg.strokeStyle = "rgba(255,214,160,0.26)"; cg.lineWidth = cs * 0.01;
      cg.beginPath(); cg.moveTo(catX - cs * 0.4, catY - cs * 1.155); cg.quadraticCurveTo(catX - cs * 0.2, catY - cs * 1.255, catX + cs * 0.02, catY - cs * 1.315); cg.stroke();
      // waist ties: from the bib's lower corner back along the flank, under the elbow, to a bow on
      // the haunch - curving with the barrel of the body
      cg.strokeStyle = "#1c3226"; cg.lineWidth = cs * 0.028;
      cg.beginPath(); cg.moveTo(catX - cs * 0.24, catY - cs * 0.45); cg.bezierCurveTo(catX - cs * 0.02, catY - cs * 0.5, catX + cs * 0.2, catY - cs * 0.56, catX + cs * 0.36, catY - cs * 0.62); cg.stroke();
      cg.strokeStyle = "rgba(255,214,160,0.18)"; cg.lineWidth = cs * 0.009;
      cg.beginPath(); cg.moveTo(catX - cs * 0.24, catY - cs * 0.465); cg.bezierCurveTo(catX - cs * 0.02, catY - cs * 0.515, catX + cs * 0.2, catY - cs * 0.575, catX + cs * 0.36, catY - cs * 0.635); cg.stroke();
      cg.fillStyle = "#20382b";
      cg.beginPath(); cg.ellipse(catX + cs * 0.38, catY - cs * 0.64, cs * 0.06, cs * 0.028, -0.6, 0, TAU); cg.fill();
      cg.beginPath(); cg.ellipse(catX + cs * 0.43, catY - cs * 0.57, cs * 0.05, cs * 0.024, 0.7, 0, TAU); cg.fill();
      cg.strokeStyle = "#1a2e22"; cg.lineWidth = cs * 0.016;
      cg.beginPath(); cg.moveTo(catX + cs * 0.4, catY - cs * 0.6); cg.quadraticCurveTo(catX + cs * 0.44, catY - cs * 0.48, catX + cs * 0.41, catY - cs * 0.4); cg.stroke();
      // the head shades the chest from the pendant: a soft shadow under the chin
      const chs = cg.createRadialGradient(catX - cs * 0.42, catY - cs * 1.1, 0, catX - cs * 0.42, catY - cs * 1.1, cs * 0.3);
      chs.addColorStop(0, "rgba(30,14,6,0.4)"); chs.addColorStop(1, "rgba(30,14,6,0)");
      cg.fillStyle = chs; cg.fillRect(bx0, by0, bw0, bh0);
      // occlusion low down: belly, haunch and paws in the ledge's bounce shadow
      const sh = cg.createLinearGradient(0, catY - cs * 0.6, 0, catY);
      sh.addColorStop(0, "rgba(46,20,8,0)"); sh.addColorStop(0.55, "rgba(46,20,8,0.3)"); sh.addColorStop(1, "rgba(20,8,3,0.66)");
      cg.fillStyle = sh; cg.fillRect(bx0, catY - cs * 0.6, bw0, cs * 0.65);
      cg.restore();
    }, "#3a1a10", 0.12);
    K.aoEdge(c, catX - cs * 0.62, catY + 0.5, catX + cs * 0.55, catY + 0.5, { width: 7, alpha: 0.65, side: 0 });
    // the glass, seen from the wet street: (1) the street behind us mirrored in it - faint (glass
    // reflects ~8-12%), soft, and stronger toward the top where we see it at a steeper angle (Fresnel,
    // baked into the plate); (2) the static condensation + frame; (3) live drops
    c.save();
    c.beginPath(); c.rect(60, 40, 840, 352); c.clip();
    c.globalCompositeOperation = "screen";
    c.drawImage(SPR("f03cafeReflF", LW, LH, paintCafeReflFresnel), 0, 0, LW, LH);
    c.restore();
    c.drawImage(SPR("f03glass", LW, LH, paintCafeGlass), 0, 0, LW, LH);
    K.glassDrops(c, 60, 40, 840, 352, lt, { seed: 29, density: 0.22, light: "#ffe0c8" });
    const rg = c.createLinearGradient(60, 0, 900, 0);
    rg.addColorStop(0, "rgba(120,150,210,0.10)");
    rg.addColorStop(0.3, "rgba(120,150,210,0)");
    rg.addColorStop(0.75, "rgba(255,111,168,0.0)");
    rg.addColorStop(0.9, "rgba(255,111,168,0.12)");
    c.fillStyle = rg;
    c.fillRect(60, 40, 840, 352);
    // the gilded lettering lives on the glass, ~3 m in front of the interior: it slides a little
    // against the room as the camera drifts (parallax), and its bevel catches the neon as it goes
    const lx = 270 - (p - 0.5) * 16;
    c.drawImage(SPR("f03letters", 420, 90, paintCafeLetters), lx - 210, 308 - 52, 420, 90);
    const sheen = 0.5 + 0.5 * Math.sin(lt * 0.6 + 1);
    glow(c, lx - 120 + p * 240, 296, 40, "#ffd890", 0.12 * sheen, "lighter");
  });
  // foreground: the awning edge at the lens, far out of focus, and big drops falling off it --
  // defocused into soft discs with bright rims, swelling as they fall toward the camera
  g.drawImage(softSprite("f03awnFg", LW, 90, 7, paintAwningFg), 0, -8, LW, 90);
  // drops falling past the lens: out of focus and motion-blurred into soft vertical smears that
  // only show where they catch the neon and the window light
  const ds = K.glowSprite("#e8d8e4");
  for (let i = 0; i < 9; i++) {
    const per = 0.7 + hash(i, 71) * 0.7;
    const ph = ((lt + hash(i, 72) * per) % per) / per;
    const x = 30 + hash(i * 7 + Math.floor((lt + hash(i, 72) * per) / per), 73) * 900;
    const y = 62 + ph * ph * 560, w = 5 + hash(i, 74) * 5, len = 30 + ph * 70;
    g.globalAlpha = 0.16 * (1 - ph * 0.6);
    g.drawImage(ds, x - w, y - len, w * 2, len * 2);
  }
  g.globalAlpha = 1;
  const bs = bokehSprite("#dfe8ff");
  // drops clinging to the scallops, waiting to fall
  for (let i = 0; i < 26; i++) {
    if (hash(i, 75) < 0.45) continue;
    const x = i * 36 + 18 + (hash(i, 76) - 0.5) * 10, sw = 0.6 + 0.4 * Math.sin(lt * (1.5 + hash(i, 77)) + i), r = 3 + hash(i, 78) * 4;
    g.globalAlpha = 0.28;
    g.drawImage(bs, x - r * 0.7, 60 + sw * 3, r * 1.4, r * 1.8 + sw * 4);
  }
  g.globalAlpha = 1;
}
// ---- shot 5: the long alley, rack focus ---------------------------------------------------------------
const AV = { x: 470, y: 318 }, AF = 900, AEYE = 0.45;
const PA = (X, Y, Z) => [AV.x + (X / Z) * AF, AV.y + ((AEYE - Y) / Z) * AF];
const ALZ = 6.6; // depth of the lamp pool where the cat crosses (just beyond the dumpster)
const APR = { vx: AV.x, vy: AV.y, f: AF, eye: AEYE };
const AFOG = "#3a4664"; // what the far alley fades to (albedo); the light map turns it into cold glow
const afog = (z) => clamp(1 - Math.exp(-z / 26)) * 0.85;
// The alley, albedo x light like the street: rain-dark brick walls with real mortar courses and a wet,
// darker footing, the setts floor (same per-pixel setts as the lens foreground, so the two meet), the
// far street facade; then one light map (cold sky slot + the end street's glow + the lamp over the door,
// inverse-square on the right wall and the floor) multiplied over it. Props live in their own plate
// (paintAlleyNear) so the ground mist can sit behind them.
function paintAlley(s) {
  const [A, a] = scratchCanvas(LW, LH);
  const sk = a.createLinearGradient(0, 0, 0, AV.y);
  sk.addColorStop(0, "#0a1222"); sk.addColorStop(1, "#3a4664");
  a.fillStyle = sk; a.fillRect(0, 0, LW, LH);
  // far end: the alley opens onto a lit street; across it a hazy facade with warm windows
  const e0 = PA(-2.3, 0, 36), e1 = PA(2.3, 11, 36);
  K.texRect(a, "brick", e0[0], e1[1], e1[0] - e0[0], e0[1] - e1[1], { tex: { seed: 9, color: "#6a5048", wet: 0.5, size: 128 }, scale: 26 });
  a.fillStyle = rgba(AFOG, 0.6); a.fillRect(e0[0], e1[1], e1[0] - e0[0], e0[1] - e1[1]);
  const R0 = K.rng("f03aend");
  for (let y = 1.2; y < 10; y += 2.4) for (let x = -2.1; x < 2.1; x += 0.9) {
    const p = PA(x, y, 36.5), q = PA(x + 0.5, y + 1.2, 36.5);
    a.fillStyle = R0() < 0.4 ? "#c8a070" : "#1a2234";
    a.fillRect(p[0], q[1], q[0] - p[0], p[1] - q[1]);
  }
  // the floor: granite setts in the alley's perspective (walls cover the sides)
  persGroundSetts(a, AV.y, 760, AV.x, AV.y + 1, LH, 0.35);
  // the gutter channel down the middle catches water: darker, smoother
  quad(a, PA(-0.12, 0, 1.2), PA(-0.05, 0, 36), PA(0.05, 0, 36), PA(0.12, 0, 1.2), rgba("#05070c", 0.35));
  // walls: brick with mortar, darker and wet toward the footing, fading into the far haze
  for (const sd of [-1, 1]) {
    const X = sd * 2.3;
    wallStrips(a, APR, X, 0.8, 36, 0, 14, "brick", { seed: sd < 0 ? 5 : 3, color: sd < 0 ? "#5e3a30" : "#4e3a36", wet: 0.7, size: 128, mortar: "#6a645c" }, 0.9, 0.45, AFOG, afog, { step: 3 });
    // wet footing: rain splash-back keeps the bottom metre dark and glossy
    for (let z = 0.8; z < 36; z *= 1.15) {
      const z2 = z * 1.15, k = afog(z);
      quad(a, PA(X, 0, z), PA(X, 0.5, z), PA(X, 0.5, z2), PA(X, 0, z2), rgba("#06080c", 0.45 * (1 - k)));
      quad(a, PA(X, 0.5, z), PA(X, 1.3, z), PA(X, 1.3, z2), PA(X, 0.5, z2), rgba("#06080c", 0.2 * (1 - k)));
    }
    const Rw = K.rng("f03aw" + sd);
    for (let z = 2; z < 32; z += 2.6 + Rw() * 2) {
      for (let y = 3.2; y < 13; y += 3.2) {
        const on = Rw() < 0.22, k = afog(z);
        const p = [PA(X, y, z), PA(X, y + 1.4, z), PA(X, y + 1.4, z + 0.9), PA(X, y, z + 0.9)];
        // stone sill + the reveal's shadow
        quad(a, PA(X, y - 0.12, z - 0.08), PA(X, y, z - 0.08), PA(X, y, z + 0.98), PA(X, y - 0.12, z + 0.98), mix("#8a8478", AFOG, k));
        quad(a, p[0], p[1], p[2], p[3], on ? mix("#c89a60", AFOG, k * 0.5) : mix("#0c1018", AFOG, k * 0.7));
      }
    }
    for (const z of [3.5, ALZ - 0.6, 13, 22]) {
      const k = afog(z);
      quad(a, PA(X, 0, z), PA(X, 2.1, z), PA(X, 2.1, z + 1.0), PA(X, 0, z + 1.0), mix("#141418", AFOG, k * 0.6));
      // the door's frame and a step
      quad(a, PA(X, 2.1, z - 0.08), PA(X, 2.22, z - 0.08), PA(X, 2.22, z + 1.08), PA(X, 2.1, z + 1.08), mix("#4a4440", AFOG, k));
    }
    const p0 = PA(X, 0, 6 + sd), p1 = PA(X, 14, 6 + sd);
    a.strokeStyle = "#14161c"; a.lineWidth = (0.12 / (6 + sd)) * AF;
    a.beginPath(); a.moveTo(p0[0], p0[1]); a.lineTo(p1[0], p1[1]); a.stroke();
  }
  // fire escape on the right: platforms + stair rails
  a.strokeStyle = "#0c0e14"; a.lineWidth = 1.6;
  for (let y = 3.4; y < 13; y += 3.2) {
    const p = PA(2.3, y, 7.5), b = PA(1.5, y, 7.5), c = PA(1.5, y, 12.5), d = PA(2.3, y, 12.5);
    a.beginPath(); a.moveTo(p[0], p[1]); a.lineTo(b[0], b[1]); a.lineTo(c[0], c[1]); a.lineTo(d[0], d[1]); a.stroke();
    const r0 = PA(1.5, y + 1, 7.5), r1 = PA(1.5, y + 1, 12.5);
    a.beginPath(); a.moveTo(r0[0], r0[1]); a.lineTo(r1[0], r1[1]); a.stroke();
    const s0 = PA(1.7, y, 7.9), s1 = PA(1.7, y + 3.2, 12.1);
    a.beginPath(); a.moveTo(s0[0], s0[1]); a.lineTo(s1[0], s1[1]); a.stroke();
  }
  // wires across the top
  a.strokeStyle = "rgba(5,6,10,0.9)"; a.lineWidth = 1.2;
  for (const [z, y] of [[5, 9], [9, 10.5], [16, 8]]) {
    const p = PA(-2.3, y, z), b = PA(2.3, y, z);
    a.beginPath(); a.moveTo(p[0], p[1]); a.quadraticCurveTo((p[0] + b[0]) / 2, p[1] + 120 / z, b[0], b[1]); a.stroke();
  }
  applyLight(a, A, LW, LH, (x) => {
    // ambient: the cold sky slot overhead (walls see little of it low down)
    const am = x.createLinearGradient(0, 0, 0, LH);
    am.addColorStop(0, "#4a5678"); am.addColorStop(0.55, "#2a3048"); am.addColorStop(1, "#262c40");
    x.fillStyle = am; x.fillRect(0, 0, LW, LH);
    x.globalCompositeOperation = "lighter";
    // the lit street at the far end floods the last metres cold-white
    const e = PA(0, 2, 34);
    x.save(); x.translate(e[0], e[1]); x.scale(1, 1.4);
    K.lightPool(x, 0, 0, 230, "#8aa0d0", { intensity: 1.2 });
    x.restore();
    // the lamp over the door: inverse-square on the right wall (broad, brightest just under the
    // head), on the left wall across the way (weaker), and a foreshortened pool on the setts
    const Lh = PA(1.95, 2.95, ALZ), wr = PA(2.3, 2.2, ALZ), wl = PA(-2.3, 1.6, ALZ + 0.4), fp = PA(1.1, 0, ALZ);
    pool(x, wr[0], wr[1], 120, 210, "#ff9a48", 1.6);
    pool(x, wr[0], Lh[1] + 20, 50, 70, "#ffd8a8", 1.0);
    pool(x, wl[0], wl[1], 90, 160, "#ff9a48", 0.7);
    x.save(); x.translate(fp[0], fp[1]); x.scale(1, 0.2);
    K.lightPool(x, 0, 0, 330, "#ff9e50", { intensity: 1.6 });
    K.lightPool(x, 0, 0, 130, "#ffd8a8", { intensity: 0.9 });
    x.restore();
    // a few lit windows spill on the opposite wall
    const R1 = K.rng("f03aspill");
    for (let i = 0; i < 6; i++) { const z = 4 + R1() * 24, sd = R1() < 0.5 ? -1 : 1, q = PA(sd * 2.3, 4 + R1() * 6, z); pool(x, q[0], q[1], (2 / z) * AF, (1.6 / z) * AF, "#ffb070", 0.25); }
  });
  s.drawImage(A, 0, 0, LW, LH);
  // the lamp bracket over the door on the right
  const L = PA(2.3, 3.0, ALZ), Lh = PA(1.95, 3.0, ALZ);
  s.strokeStyle = "#0c0c10"; s.lineWidth = 2;
  s.beginPath(); s.moveTo(L[0], L[1]); s.lineTo(Lh[0], Lh[1]); s.stroke();
  s.fillStyle = "#0c0c10"; s.fillRect(Lh[0] - 6, Lh[1] - 2, 12, 6);
}
// The props, on their own transparent plate (drawn in front of the ground mist): a green steel dumpster
// with a lid lip, rust runs from every rivet, peeling stickers; two galvanised dustbins (pressed vertical
// ribs, zinc grime, a wet glossy top), a tied bin bag. Lit by the lamp on the right, cold rim from the end.
function paintAlleyNear(s) {
  // ---- dumpster
  const d0 = PA(-2.25, 0, 5.2), d1 = PA(-1.5, 1.15, 5.2), d2 = PA(-1.5, 1.15, 7.0), d3 = PA(-1.5, 0, 7.0);
  const fw = d1[0] - d0[0], fh = d0[1] - d1[1];
  K.texRect(s, "metal", d0[0], d1[1], fw, fh, { tex: { seed: 6, size: 128, rust: 0.45 }, scale: 90, tint: "#1e4030", tintAlpha: 0.78 });
  const dg = s.createLinearGradient(d0[0], 0, d1[0], 0);
  dg.addColorStop(0, "rgba(0,0,0,0.55)"); dg.addColorStop(0.7, "rgba(0,0,0,0.25)"); dg.addColorStop(1, "rgba(255,170,100,0.06)");
  s.fillStyle = dg; s.fillRect(d0[0], d1[1], fw, fh);
  // the side panel running away from us, lit a little by the lamp beyond
  const sp = new Path2D(); sp.moveTo(d1[0], d0[1]); sp.lineTo(d1[0], d1[1]); sp.lineTo(d2[0], d2[1]); sp.lineTo(d3[0], d3[1]); sp.closePath();
  K.texFill(s, "metal", sp, { tex: { seed: 7, size: 128, rust: 0.45 }, scale: 70, tint: "#1a3628", tintAlpha: 0.8 });
  const sg = s.createLinearGradient(d1[0], 0, d2[0], 0);
  sg.addColorStop(0, "rgba(0,0,0,0.45)"); sg.addColorStop(1, "rgba(255,150,80,0.12)");
  s.fillStyle = sg; s.fill(sp);
  s.fillStyle = "rgba(4,8,12,0.45)"; s.fill(sp);
  // pressed ribs on the front, each with a lit upper edge and a shadow below
  for (let i = 1; i < 5; i++) {
    const x = lerp(d0[0], d1[0], i / 5);
    s.fillStyle = "rgba(0,0,0,0.4)"; s.fillRect(x - 2.5, d1[1] + 10, 3, fh - 16);
    s.fillStyle = "rgba(170,200,190,0.12)"; s.fillRect(x + 0.5, d1[1] + 10, 1.2, fh - 16);
  }
  // rust runs from the rivets along the top rail, darker where wet
  const Rr = K.rng("f03rust");
  for (let i = 0; i < 9; i++) {
    const x = d0[0] + 6 + Rr() * (fw - 12), y0 = d1[1] + 6 + Rr() * 6, len = 20 + Rr() * (fh * 0.7);
    const rg = s.createLinearGradient(0, y0, 0, y0 + len);
    rg.addColorStop(0, "rgba(96,44,18,0.55)"); rg.addColorStop(0.4, "rgba(76,34,14,0.28)"); rg.addColorStop(1, "rgba(60,26,10,0)");
    s.fillStyle = rg; s.fillRect(x - 1 - Rr() * 1.5, y0, 2 + Rr() * 3, len);
    s.fillStyle = "rgba(30,18,10,0.9)"; s.beginPath(); s.arc(x, y0, 1.3, 0, TAU); s.fill();
  }
  // two stickers, half peeled and rain-faded
  for (const [sx, sy, w, h, c, r] of [[0.22, 0.45, 22, 15, "#c8c0a0", -0.06], [0.62, 0.62, 16, 20, "#b8584a", 0.05]]) {
    s.save(); s.translate(d0[0] + fw * sx, d1[1] + fh * sy); s.rotate(r);
    s.fillStyle = rgba(c, 0.55); s.fillRect(-w / 2, -h / 2, w, h);
    s.fillStyle = "rgba(20,20,20,0.35)"; s.fillRect(-w / 2 + 3, -h / 2 + 4, w - 6, 2); s.fillRect(-w / 2 + 3, -h / 2 + 8, w * 0.5, 1.5);
    s.fillStyle = rgba(c, 0.8); s.beginPath(); s.moveTo(w / 2, -h / 2); s.lineTo(w / 2 - 6, -h / 2); s.lineTo(w / 2 - 1, -h / 2 + 7); s.fill(); // the curled corner
    s.restore();
  }
  // the lid: an overhanging lip with a hard lit edge and its own shadow on the box
  s.fillStyle = "#14261c"; s.fillRect(d0[0] - 4, d1[1] - 7, fw + 8, 9);
  const lg = s.createLinearGradient(0, d1[1] - 7, 0, d1[1] + 2);
  lg.addColorStop(0, "rgba(200,220,240,0.32)"); lg.addColorStop(0.25, "rgba(200,220,240,0.06)"); lg.addColorStop(1, "rgba(0,0,0,0.3)");
  s.fillStyle = lg; s.fillRect(d0[0] - 4, d1[1] - 7, fw + 8, 9);
  s.fillStyle = "rgba(0,0,0,0.45)"; s.fillRect(d0[0], d1[1] + 2, fw, 5);
  quad(s, [d1[0] + 4, d1[1] - 7], [d2[0] + 2, d2[1] - 4], [d2[0] + 2, d2[1] + 1], [d1[0] + 4, d1[1] + 2], "#10201a");
  K.aoEdge(s, d0[0] - 2, d0[1], d3[0], d3[1], { width: 10, alpha: 0.7, side: 0 });
  // ---- galvanised dustbins, far one first
  for (let i = 1; i >= 0; i--) {
    const z = 7.7 + i * 1.0, b = PA(-1.1 + i * 0.5, 0, z), r = (0.24 / z) * AF, h = (0.72 / z) * AF, e = r * 0.28;
    K.shadowBlob(s, b[0] - r * 0.4, b[1] + e * 0.3, r * 1.3, e * 1.2, { alpha: 0.7 });
    const body = new Path2D();
    body.moveTo(b[0] - r * 0.92, b[1] - h); body.lineTo(b[0] - r, b[1]); body.ellipse(b[0], b[1], r, e, 0, Math.PI, 0, true); body.lineTo(b[0] + r * 0.92, b[1] - h); body.closePath();
    s.save(); s.clip(body);
    K.texRect(s, "metal", b[0] - r, b[1] - h - e, r * 2, h + e * 2, { tex: { seed: 11 + i, size: 128, rust: 0.2 }, scale: 50, tint: "#5a6068", tintAlpha: 0.55 });
    s.fillStyle = "rgba(8,12,20,0.5)"; s.fillRect(b[0] - r, b[1] - h - e, r * 2, h + e * 2);
    // cylinder shading: the lamp on the right, the cold end of the alley as a rim on the left
    const bg = s.createLinearGradient(b[0] - r, 0, b[0] + r, 0);
    bg.addColorStop(0, "rgba(140,170,220,0.18)"); bg.addColorStop(0.1, "rgba(0,0,0,0.75)"); bg.addColorStop(0.5, "rgba(0,0,0,0.5)");
    bg.addColorStop(0.78, "rgba(255,190,120,0.12)"); bg.addColorStop(0.88, "rgba(255,210,150,0.28)"); bg.addColorStop(1, "rgba(0,0,0,0.6)");
    s.fillStyle = bg; s.fillRect(b[0] - r, b[1] - h - e, r * 2, h + e * 2);
    // pressed vertical ribs (galvanised bins are corrugated), foreshortened round the curve
    for (let k = -7; k <= 7; k++) {
      const u = k / 7.5, x = b[0] + Math.sin(u * Math.PI / 2) * r, w = Math.max(0.5, Math.cos(u * Math.PI / 2) * r * 0.07);
      s.fillStyle = `rgba(0,0,0,${0.3 * Math.cos(u * 1.3)})`; s.fillRect(x - w, b[1] - h * 0.86, w, h * 0.78);
      s.fillStyle = `rgba(230,220,200,${0.1 * clamp(u + 0.3)})`; s.fillRect(x, b[1] - h * 0.86, w * 0.6, h * 0.78);
    }
    // zinc grime + rust collecting toward the foot, and a dent
    const gg = s.createLinearGradient(0, b[1] - h * 0.4, 0, b[1]);
    gg.addColorStop(0, "rgba(60,40,20,0)"); gg.addColorStop(1, "rgba(60,36,18,0.55)");
    s.fillStyle = gg; s.fillRect(b[0] - r, b[1] - h * 0.4, r * 2, h * 0.4 + e);
    s.fillStyle = "rgba(0,0,0,0.3)"; s.beginPath(); s.ellipse(b[0] - r * 0.25, b[1] - h * 0.55, r * 0.22, h * 0.09, 0.3, 0, TAU); s.fill();
    s.restore();
    // the two hoops
    for (const v of [0.12, 0.86]) {
      s.strokeStyle = "rgba(0,0,0,0.55)"; s.lineWidth = 1.6;
      s.beginPath(); s.ellipse(b[0], b[1] - h * v, r * (0.93 + 0.07 * (1 - v)), e, 0, 0, Math.PI); s.stroke();
      s.strokeStyle = "rgba(220,210,190,0.28)"; s.lineWidth = 0.8;
      s.beginPath(); s.ellipse(b[0], b[1] - h * v - 1, r * (0.93 + 0.07 * (1 - v)), e, 0, 0.15, 1.3); s.stroke();
    }
    // the lid: shallow dome, rain standing on it - a broad wet sheen of the lamp on the top
    s.save(); s.translate(b[0], b[1] - h); if (i === 0) s.rotate(-0.22);
    s.fillStyle = "#0c0e12"; s.beginPath(); s.ellipse(0, 0, r * 1.04, e * 1.15, 0, 0, TAU); s.fill();
    const lg2 = s.createLinearGradient(-r, 0, r, 0);
    lg2.addColorStop(0, "#14181e"); lg2.addColorStop(0.62, "#4a4c50"); lg2.addColorStop(0.82, "#b0a080"); lg2.addColorStop(1, "#24262a");
    s.fillStyle = lg2; s.beginPath(); s.ellipse(0, -e * 0.4, r * 0.99, e * 1.4, 0, Math.PI, 0); s.fill();
    s.fillStyle = "rgba(255,220,170,0.25)"; s.beginPath(); s.ellipse(r * 0.35, -e * 0.85, r * 0.35, e * 0.35, 0, 0, TAU); s.fill();
    s.fillStyle = "#2a2c30"; s.fillRect(-r * 0.22, -e * 2.1, r * 0.44, e * 0.5);
    s.restore();
  }
  // ---- a tied bin bag slumped against them: glossy black plastic, creases catching the light
  {
    const z = 7.2, b = PA(-0.6, 0, z), r = (0.26 / z) * AF;
    K.shadowBlob(s, b[0], b[1], r * 1.1, r * 0.12, { alpha: 0.8 });
    const bg = s.createRadialGradient(b[0] + r * 0.5, b[1] - r * 1.1, r * 0.05, b[0], b[1] - r * 0.6, r * 1.3);
    bg.addColorStop(0, "#4a5262"); bg.addColorStop(0.35, "#161a22"); bg.addColorStop(1, "#040506");
    s.fillStyle = bg;
    s.beginPath(); s.moveTo(b[0] - r, b[1]);
    s.bezierCurveTo(b[0] - r * 1.25, b[1] - r * 0.9, b[0] - r * 0.6, b[1] - r * 1.5, b[0] - r * 0.12, b[1] - r * 1.4);
    s.lineTo(b[0] - r * 0.2, b[1] - r * 1.75); s.lineTo(b[0] + r * 0.05, b[1] - r * 1.62); s.lineTo(b[0] + r * 0.22, b[1] - r * 1.8); s.lineTo(b[0] + r * 0.14, b[1] - r * 1.38);
    s.bezierCurveTo(b[0] + r * 0.8, b[1] - r * 1.4, b[0] + r * 1.25, b[1] - r * 0.8, b[0] + r, b[1]);
    s.closePath(); s.fill();
    s.lineCap = "round";
    for (const [a0, a1, k, al] of [[-0.6, 0.2, 0.6, 0.3], [0.1, 0.9, 0.85, 0.22], [-1.2, -0.5, 0.95, 0.18]]) {
      s.strokeStyle = `rgba(200,215,240,${al})`; s.lineWidth = 1.4;
      s.beginPath(); s.arc(b[0], b[1] - r * 0.7, r * k, a0, a1); s.stroke();
    }
  }
}
// Ground mist as seen from a camera standing INSIDE it (eye 0.45 m, mist ~1.1 m deep): each pixel's
// mist is the length of its view ray inside the slab before it hits something - the far end of the
// alley (36 m), a wall, or the floor - so it is thickest along the horizon at the far end, thins
// smoothly with height (the ray climbs out of the slab), and is almost nothing over the near walls
// and floor. A static per-pixel depth mask (built once); the live wisps are multiplied through it.
function alleyMistMask() {
  return SPR("f03mistMask", LW, LH, (s) => {
    const px = K.pixelScale(), w = Math.ceil(LW * px), h = Math.ceil(LH * px);
    const T = K.makeCanvas(w, h), tg = T.getContext("2d", { willReadFrequently: true });
    const im = tg.createImageData(w, h), d = im.data;
    const Hm = 1.1, Lm = 16;
    for (let j = 0; j < h; j++) {
      const y = (j + 0.5) / px, dy = y - AV.y;
      // distance along the ray to leave the slab (rays above the horizon climb out of it)
      const exitZ = dy < 0 ? ((Hm - AEYE) * AF) / -dy : 1e9;
      const floorZ = dy > 0 ? (AEYE * AF) / dy : 1e9;
      for (let i = 0; i < w; i++) {
        const x = (i + 0.5) / px, dx = Math.abs(x - AV.x);
        const wallZ = dx > 0 ? (2.3 * AF) / dx : 1e9;
        const z = Math.min(36, floorZ, wallZ, exitZ);
        const a = 1 - Math.exp(-z / Lm);
        const o = (j * w + i) * 4;
        d[o] = d[o + 1] = d[o + 2] = 0;
        d[o + 3] = Math.round(clamp(a) * 255);
      }
    }
    tg.putImageData(im, 0, 0);
    s.drawImage(T, 0, 0, LW, LH);
  });
}
function alleyMist(f, t) {
  const M = K.layer(LW, LH, "f03mist");
  const m = M.g;
  m.fillStyle = "rgba(86,102,140,0.55)";
  m.fillRect(0, 0, LW, LH);
  // slow drifting wisps: two parallax layers of cloud noise stretched flat along the ground
  const pat = K.texPattern(m, "cloud", { seed: 28, cover: 0.55 });
  if (pat.setTransform) {
    m.fillStyle = pat;
    m.globalCompositeOperation = "source-atop";
    pat.setTransform(new DOMMatrix([1100 / 256, 0, 0, 90 / 256, -t * 10, AV.y - 40]));
    m.globalAlpha = 0.5; m.fillRect(0, 0, LW, LH);
    pat.setTransform(new DOMMatrix([640 / 256, 0, 0, 60 / 256, t * 16 + 80, AV.y - 20]));
    m.globalAlpha = 0.35; m.fillRect(0, 0, LW, LH);
    m.globalAlpha = 1;
  }
  m.globalCompositeOperation = "destination-in";
  m.drawImage(alleyMistMask(), 0, 0, LW, LH);
  m.globalCompositeOperation = "source-over";
  f.drawImage(M.canvas, 0, 0, LW, LH);
}
function alleyBg(f, t, lt) {
  f.drawImage(SPR("f03alley", LW, LH, paintAlley), 0, 0, LW, LH);
  // far end street glow, then the ground mist (depth-masked: behind every near surface)
  const e = PA(0, 2, 36);
  glow(f, e[0], e[1], 160, "#9fb4e0", 0.3);
  alleyMist(f, t);
  // the lamp over the door
  const L = PA(1.95, 2.95, ALZ);
  const pool = PA(0.9, 0, ALZ);
  glow(f, L[0], L[1] + 4, 140, LAMP, 0.5);
  glow(f, L[0], L[1] + 4, 14, "#ffffff", 0.95);
  // light cone through the rain: several soft wedges so the edges feather out
  f.save();
  f.globalCompositeOperation = "lighter";
  for (let k = 0; k < 4; k++) {
    const sp = 40 + k * 36;
    const cg = f.createLinearGradient(0, L[1], 0, pool[1]);
    cg.addColorStop(0, rgba(LAMP, 0.055));
    cg.addColorStop(1, rgba(LAMP, 0.0));
    f.fillStyle = cg;
    f.beginPath();
    f.moveTo(L[0] - 4, L[1] + 4); f.lineTo(L[0] + 4, L[1] + 4); f.lineTo(pool[0] + sp * 0.8 + 40, pool[1]); f.lineTo(pool[0] - sp * 1.4, pool[1]);
    f.fill();
  }
  f.restore();
  reflStreak(f, L[0], pool[1] + 3, 140, 10, LAMP, 0.55, t, 12);
  // the props (in front of the mist; the cat walks in front of them)
  f.drawImage(SPR("f03alleyNear", LW, LH, paintAlleyNear), 0, 0, LW, LH);
  // the cat crossing the pool of lamplight: something orange, lit by the lamp (key), the cold end of
  // the alley as a rim; a long soft cast shadow thrown away from the lamp and his fur's warm bounce
  const cross = seg(lt, 0.6, 8.6);
  const sz = (0.3 / ALZ) * AF;
  if (cross > 0 && cross < 1) {
    const cx = lerp(PA(-1.35, 0, ALZ)[0], PA(2.1, 0, ALZ)[0], eio(cross) * 0.25 + cross * 0.75);
    const inPool = clamp(1 - Math.abs(cx - pool[0]) / 170);
    // cast shadow: from the lamp (2.95 m up) over a 0.3 m cat, along the ground away from it
    const dxw = ((cx - L[0]) * ALZ) / AF, len = clamp((Math.abs(dxw) * 0.3) / 2.65 + 0.12, 0.12, 0.9) * (AF / ALZ);
    const dir = Math.sign(cx - L[0]) || -1;
    f.save();
    f.translate(cx + dir * len * 0.45, pool[1] + 1);
    f.scale(1, 0.16);
    K.shadowBlob(f, 0, 0, len * 0.6 + sz * 0.4, sz * 0.9, { alpha: 0.55 * (0.4 + 0.6 * inPool) });
    f.restore();
    K.shadowBlob(f, cx, pool[1] + 1, sz * 0.55, sz * 0.07, { alpha: 0.75 });
    f.save(); f.translate(cx, pool[1]); f.scale(1, 0.22);
    K.lightPool(f, 0, 0, sz * 1.2, "#ff9a50", { intensity: 0.25 * inPool });
    f.restore();
    const lit = 0.35 + 0.65 * inPool;
    K.drawCat(f, cx, pool[1], sz, {
      pose: "walk", phase: lt * 1.25, facing: 1, t: lt, bell: true, collar: true, wet: 0.55, pupil: 1, shadow: false,
      key: { x: L[0], y: L[1], color: "#ffb060", strength: 1.7 * lit }, rim: { x: e[0], y: e[1], color: "#9fb4e0", strength: 0.8 },
      fill: "#121a2c", ambient: "#2a3658", ambientK: 0.35 + 0.3 * (1 - inPool),
    });
  }
  // backlit rain in the lamp cone
  litRain(f, t, [[L[0] - 20, L[1] + 70, 90]], 1.8);
  // steam from a grate: a dense neck that billows, leans with the draught and thins out; puffs are
  // textured sprites, the side facing the lamp catches it warm
  const gz = 6.0, gp = PA(-0.6, 0, gz);
  const puffC = steamPuff("#c8d2e8"), puffW = steamPuff("#ffd8a8");
  for (let i = 0; i < 22; i++) {
    const age = ((lt * 0.22 + i / 22) % 1);
    const sway = Math.sin(lt * 0.6 + age * 5 + i) * 10 * age + Math.sin(age * 9 - lt * 1.3) * 6;
    const x = gp[0] + sway + age * age * 110, y = gp[1] - 4 - age * 300;
    const r = 18 + age * 120 + hash(i, 3) * 20;
    const a = 0.14 * Math.pow(Math.sin(age * Math.PI), 0.7) * (1 - age * 0.4);
    f.globalAlpha = a;
    f.globalCompositeOperation = "screen";
    f.drawImage(puffC, x - r, y - r, r * 2, r * 2);
    f.globalAlpha = a * 0.5 * clamp((x - gp[0]) / 120 + 0.3);
    f.drawImage(puffW, x - r * 0.6, y - r * 0.9, r * 1.6, r * 1.6);
  }
  f.globalAlpha = 1;
  f.globalCompositeOperation = "source-over";
  f.fillStyle = "#05070a";
  f.beginPath(); f.ellipse(gp[0], gp[1], 52, 7, 0, 0, Math.PI * 2); f.fill();
  f.strokeStyle = "rgba(150,170,210,0.3)";
  f.lineWidth = 1;
  for (let i = -3; i <= 3; i++) { f.beginPath(); f.moveTo(gp[0] + i * 12, gp[1] - 5); f.lineTo(gp[0] + i * 12, gp[1] + 5); f.stroke(); }
  K.rain(f, LW, LH, t, { density: 0.5, angle: 0.05, color: "rgba(180,195,230,0.3)", seed: 51, len: 18 });
}
// the puddle at the lens: an irregular rim (noise on an ellipse), built once
const AFG_PUD = (() => {
  const p = new Path2D();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * TAU;
    const r = 1 + 0.12 * Math.sin(a * 3 + 1.3) + 0.07 * Math.sin(a * 7 + 0.4) + 0.04 * Math.sin(a * 13);
    const x = 470 + Math.cos(a) * 330 * r, y = 452 + Math.sin(a) * 36 * r;
    if (i) p.lineTo(x, y); else p.moveTo(x, y);
  }
  p.closePath();
  return p;
})();
// the setts right at the lens, in the alley's perspective, in shadow (the lamp is far behind them)
// the defocused alley plate is built from the two cached plates (far + near props), not repainted:
// the prewarm in the café shot and the alley shot must build the SAME image under one key
function paintAlleySoftSrc(s) {
  s.drawImage(SPR("f03alley", LW, LH, paintAlley), 0, 0, LW, LH);
  s.drawImage(SPR("f03alleyNear", LW, LH, paintAlleyNear), 0, 0, LW, LH);
}
function paintAlleyFg(s) {
  const [A, a] = scratchCanvas(LW, LH);
  persGroundSetts(a, AV.y, 760, AV.x, 392, LH, 0.35);
  a.globalCompositeOperation = "multiply";
  const lg = a.createLinearGradient(0, 392, 0, LH);
  lg.addColorStop(0, "#5a6482"); lg.addColorStop(1, "#262e44");
  a.fillStyle = lg; a.fillRect(0, 392, LW, LH - 392);
  a.globalCompositeOperation = "source-over";
  // the wet crowns pick up the lamp and the blue end of the alley as thin glints (cached)
  const R = K.rng("f03afg");
  for (let i = 0; i < 140; i++) {
    const x = R() * LW, y = 400 + R() * 140, w = 3 + R() * 9;
    a.fillStyle = rgba(R() > 0.6 ? "#ffcf98" : "#9fb4e0", 0.08 + R() * 0.12);
    a.fillRect(x - w, y, w * 2, 0.9);
  }
  // soak darkening round the puddle
  a.save();
  if (K.hasFilter()) a.filter = `blur(${K.qblur((10 * K.pixelScale()).toFixed(1))}px)`;
  a.globalCompositeOperation = "source-atop";
  a.fillStyle = "rgba(2,4,8,0.55)";
  a.fill(AFG_PUD);
  a.restore();
  // fade in from the bg's own ground at the top of the strip
  a.globalCompositeOperation = "destination-in";
  const m = a.createLinearGradient(0, 392, 0, 424);
  m.addColorStop(0, "rgba(0,0,0,0)"); m.addColorStop(1, "rgba(0,0,0,1)");
  a.fillStyle = m; a.fillRect(0, 0, LW, LH);
  s.drawImage(A, 0, 0, LW, LH);
}
function alleyFg(f, t, lt) {
  f.drawImage(SPR("f03afgBase", LW, LH, paintAlleyFg), 0, 0, LW, LH);
  // the puddle mirrors the alley: the plate flipped about the horizon, darkened by the water's
  // reflectance, the lamp and the cold end of the alley as the bright things in it
  f.save();
  f.clip(AFG_PUD);
  f.fillStyle = "#06080e";
  f.fillRect(100, 400, 760, 110);
  // one mirrored draw (no row strips: they read as scanlines); the swell only drifts it a hair
  const plate = softSprite("f03alleySoft", LW, LH, 3, paintAlleySoftSrc);
  f.save();
  f.globalAlpha = 0.85;
  f.translate(Math.sin(lt * 1.3) * 0.8, 2 * AV.y + Math.sin(lt * 0.9) * 0.6);
  f.scale(1, -1);
  f.drawImage(plate, 0, 0, LW, LH);
  f.restore();
  f.fillStyle = "rgba(10,16,30,0.3)";
  f.fillRect(100, 400, 760, 110);
  const L = PA(1.95, 2.95, ALZ);
  glow(f, L[0], 2 * AV.y - L[1], 50, LAMP, 0.5);
  reflStreak(f, L[0], 2 * AV.y - L[1] - 6, 60, 10, LAMP, 0.9, t, 9);
  const e = PA(0, 2, 36);
  reflStreak(f, e[0], 2 * AV.y - e[1] - 10, 40, 30, "#9fb4e0", 0.35, t, 10);
  const rs = rippleSprite();
  for (let i = 0; i < 9; i++) {
    const per = 0.8 + hash(i, 91) * 0.6;
    const tt = lt + hash(i, 92) * per, cyc = Math.floor(tt / per), ph = tt / per - cyc;
    const x = 180 + hash(i + cyc * 5, 93) * 580, y = 436 + hash(i + cyc * 3, 94) * 34;
    const rad = 4 + Math.sqrt(ph) * 40;
    f.globalAlpha = Math.pow(1 - ph, 1.5);
    f.drawImage(rs, x - rad, y - rad * 0.14, rad * 2, rad * 0.28);
  }
  f.globalAlpha = 1;
  f.restore();
  // the meniscus: the water's far lip catches the cold glow at the end of the alley as a thin bright
  // line (and the lamp, warmer, toward the right) - the sharp detail the rack focus starts on
  f.save();
  f.beginPath(); f.rect(0, 380, LW, 72); f.clip();
  const mg = f.createLinearGradient(140, 0, 800, 0);
  mg.addColorStop(0, "rgba(150,170,215,0.12)"); mg.addColorStop(0.45, "rgba(175,195,235,0.42)"); mg.addColorStop(0.75, "rgba(255,200,140,0.36)"); mg.addColorStop(1, "rgba(150,170,215,0.1)");
  f.strokeStyle = mg; f.lineWidth = 1.3; f.stroke(AFG_PUD);
  f.restore();
}
// a soft, lumpy puff of steam (several overlapping blobs, so a plume is not a stack of perfect discs)
function steamPuff(color) {
  return SPR("f03puff:" + color, 128, 128, (s) => {
    const R = K.rng("f03puff");
    for (let i = 0; i < 9; i++) {
      const x = 64 + (R() - 0.5) * 50, y = 64 + (R() - 0.5) * 50, r = 22 + R() * 30;
      const gr = s.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba(color, 0.32)); gr.addColorStop(0.6, rgba(color, 0.12)); gr.addColorStop(1, rgba(color, 0));
      s.fillStyle = gr;
      s.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}
function shotAlley(g, t, lt) {
  // 0 = the puddle at the lens sharp (the anchor the shot opens on), 1 = the far pool of lamplight sharp
  const rack = eio(seg(lt, 2.0, 4.4));
  const p = seg(lt, 0, 10);
  K.withCamera(g, LW, LH, { x: 480 + p * 10, y: 270, zoom: 1 + p * 0.04, shakeT: t, shakeAmt: 0.8 }, (c) => {
    K.focus(c, LW, LH, lerp(6, 0.2, rack), (f) => alleyBg(f, t, lt), "f03abg");
    K.focus(c, LW, LH, lerp(0.2, 7, rack), (f) => alleyFg(f, t, lt), "f03afg");
  });
  // warm the next shot's caches a piece at a time while this one holds (no stall at the cut)
  if (lt > 4.0) settsMips();
  if (lt > 4.5) SPR("f03pudGround", LW, LH, paintPudGround);
  if (lt > 5.5) SPR("f03pudMask", LW, LH, paintPudMask);
  if (lt > 6.5) SPR("f03pudBase", LW, LH, paintPudBase);
  if (lt > 7.2) SPR("f03pudUnder", LW, LH, paintPudUnder);
  if (lt > 7.8) SPR("f03pudSky", LW, LH, paintPudSky);
  if (lt > 8.2) SPR("f03street2", LW, LH, paintStreet); // the tilt's street plate (cached since shot 1 in a normal play-through)
  if (lt > 8.5) fresnelRamp();
}

// ---- shot 6: a puddle; an orange reflection; tilt up to nobody ------------------------------------
// A low camera tilted down at the wet setts (shift-lens: the horizon sits far above the frame). The
// puddle is a real mirror of the street: the street plate flipped about that horizon and magnified,
// so the lamps, lit windows and the cloud deck hang upside down in it. The cat is only ever seen in
// the water: his feet touch the far rim just above the frame line.
const PH = -60, PS = 1.35; // puddle-cam horizon (y, above the frame) and the mirror's magnification
const PCX = 480; // where the street's vanishing point sits across the frame
const mirX = (x) => PCX + (x - VPX) * PS, mirY = (y) => PH + (VPY - y) * PS;
const PUD = { cx: 470, cy: 250, rx: 430, ry: 205 };
// the puddle-cam ground, albedo x light, with wet speculars baked on the stone domes
function paintPudGround(s) {
  const [A, a] = scratchCanvas(LW, LH, true); // CPU-backed: its pixels are read back below
  persGroundSetts(a, PH - 100, 700, PCX, 0, LH, 0.4);
  a.fillStyle = "rgba(120,128,140,0.25)"; a.globalCompositeOperation = "multiply"; a.fillRect(0, 0, LW, LH); a.globalCompositeOperation = "source-over";
  applyLight(a, A, LW, LH, (x) => {
    // the overcast blue-hour sky from above, a little brighter away from the camera (we shade the near ground)
    const am = x.createLinearGradient(0, 0, 0, LH);
    am.addColorStop(0, "#909cc0"); am.addColorStop(1, "#4c5670");
    x.fillStyle = am;
    x.fillRect(0, 0, LW, LH);
    x.globalCompositeOperation = "lighter";
    // the streetlamp just out of frame top right: an inverse-square pool, stretched by the perspective
    x.save(); x.translate(820, -40); x.scale(1.25, 0.8);
    K.lightPool(x, 0, 0, 760, "#ff9a40", { intensity: 2.2 });
    K.lightPool(x, 0, 0, 300, "#ffd8a8", { intensity: 1.3 });
    x.restore();
    // a far wash of the café's pink from off left
    K.lightPool(x, -120, 60, 420, "#a04a78", { intensity: 0.35 });
  });
  // wet speculars: the lamp mirrored in the crown of each sett, the sky's sheen on the rest
  const px = K.pixelScale(), w = A.width, h = A.height;
  const im = a.getImageData(0, 0, w, h), d = im.data;
  for (let j = 0; j < h; j++) {
    const y = j / px;
    for (let i = 0; i < w; i++) {
      const o = (j * w + i) * 4, x = i / px;
      const L = (d[o] * 0.3 + d[o + 1] * 0.55 + d[o + 2] * 0.15) / 255;
      const lamp = Math.exp(-(((x - 820) / 520) ** 2 + ((y + 20) / 420) ** 2));
      const sp = Math.pow(clamp((L - 0.16) / 0.3), 3);
      d[o] = Math.min(255, d[o] + sp * (210 * lamp + 26));
      d[o + 1] = Math.min(255, d[o + 1] + sp * (150 * lamp + 34));
      d[o + 2] = Math.min(255, d[o + 2] + sp * (80 * lamp + 52));
    }
  }
  a.putImageData(im, 0, 0);
  s.drawImage(A, 0, 0, LW, LH);
}
// Granite setts, generated once as a seamless 640 px albedo tile (built only inside sprite builders).
// Real setts are laid in courses of uneven height; each stone has its own width, a slightly warped
// outline (periodic domain warp, so the tile still wraps), rounded worn corners and a domed, polished
// crown. Per stone: its own granite tint (grey, buff, blue-grey, the odd rust-brown), roughness and
// feldspar speckle. The joints are dark, wet grit. Lighting/speculars are applied by the caller.
let SETTS = null;
function settsTile() {
  if (SETTS) return SETTS; return settsTile0(); }
function settsTile0() {
  const N = 640, R = K.rng("f03setts");
  const rows = [];
  let y = 0;
  while (y < N - 30) { const hh = 46 + R() * 30; rows.push({ y0: y, y1: Math.min(N, y + hh), shift: R() * N, stones: [] }); y += hh; }
  rows[rows.length - 1].y1 = N;
  for (const r of rows) {
    let x = 0;
    while (x < N - 40) { const w = 58 + R() * 64; r.stones.push([x, Math.min(N, x + w), R(), R(), R()]); x += w; }
    r.stones[r.stones.length - 1][1] = N;
  }
  const c = K.makeCanvas(N, N), x2 = c.getContext("2d", { willReadFrequently: true }); // CPU-backed: patterns from it never need a GPU readback
  const im = x2.createImageData(N, N), d = im.data;
  const tints = [[118, 116, 114], [128, 120, 108], [104, 110, 120], [132, 128, 122], [112, 98, 86], [96, 96, 100]];
  const P2 = TAU / N;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      // periodic warp: integer frequencies keep the tile seamless
      const wx = 4.5 * Math.sin(P2 * (3 * j) + 1.3) + 2.5 * Math.sin(P2 * (7 * j + 5 * i) + 0.4) + 1.2 * Math.sin(P2 * (17 * i + 11 * j));
      const wy = 4.0 * Math.sin(P2 * (4 * i) + 2.1) + 2.2 * Math.sin(P2 * (6 * i - 9 * j) + 1.7) + 1.1 * Math.sin(P2 * (19 * j + 13 * i));
      const yy = ((j + wy) % N + N) % N;
      let ri = 0;
      while (ri < rows.length - 1 && yy >= rows[ri].y1) ri++;
      const row = rows[ri];
      const xx = ((i + wx + row.shift) % N + N) % N;
      let si = 0;
      while (si < row.stones.length - 1 && xx >= row.stones[si][1]) si++;
      const st = row.stones[si];
      const dx = Math.min(xx - st[0], st[1] - xx), dy = Math.min(yy - row.y0, row.y1 - yy);
      const Rc = 9 + st[3] * 8; // worn corner radius
      let dd = Math.min(dx, dy);
      if (dx < Rc && dy < Rc) dd = Rc - Math.hypot(Rc - dx, Rc - dy);
      const gap = 2.6 + st[4] * 2.2;
      const o = (j * N + i) * 4;
      const hsh = hash(i * 1.37 + j * 57.1, 3);
      if (dd < gap) {
        // the joint: dark wet grit, a hint of the stone's edge falling into it
        const e = clamp(dd / gap);
        const v = 16 + 10 * e + hsh * 8;
        d[o] = v; d[o + 1] = v + 2; d[o + 2] = v + 5;
      } else {
        const hgt = clamp((dd - gap) / (14 + st[2] * 10));
        const dome = Math.sin(hgt * Math.PI * 0.5);
        const tc = tints[Math.floor(st[2] * tints.length)];
        const rough = 0.5 + st[3] * 0.5;
        // value: the edges roll off into shadow, the crown is worn smooth and paler
        let k = 0.62 + 0.38 * dome + (1 - rough) * 0.08 * dome;
        // granite: mica/feldspar speckle, stronger on rough stones
        const sp = (hsh - 0.5) * 0.22 * rough + (hash(i * 0.31 + j * 0.53, 9) > 0.985 ? 0.25 : 0);
        k *= 1 + sp;
        // a slight tilt per stone (setts settle unevenly): one side a touch lighter
        k *= 1 + (st[4] - 0.5) * 0.12 * ((xx - (st[0] + st[1]) / 2) / 50);
        d[o] = clamp(tc[0] * k, 0, 255); d[o + 1] = clamp(tc[1] * k, 0, 255); d[o + 2] = clamp(tc[2] * k, 0, 255);
      }
      d[o + 3] = 255;
    }
  }
  x2.putImageData(im, 0, 0);
  SETTS = c;
  return c;
}
// box-filtered mip chain of the setts tile (Float32 RGB per level), for the per-pixel ground below
let SETTS_MIPS = null;
function settsMips() {
  if (SETTS_MIPS) return SETTS_MIPS;
  const c = settsTile(), N = c.width;
  const src = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, N, N).data;
  let n = N, cur = new Float32Array(N * N * 3);
  for (let i = 0, o = 0; i < N * N; i++, o += 4) { cur[i * 3] = src[o]; cur[i * 3 + 1] = src[o + 1]; cur[i * 3 + 2] = src[o + 2]; }
  const levels = [{ n, d: cur }];
  while (n > 40) {
    const m = n >> 1, nx = new Float32Array(m * m * 3);
    for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
      for (let k = 0; k < 3; k++) {
        const a = ((2 * y) * n + 2 * x) * 3 + k, b = ((2 * y + 1) * n + 2 * x) * 3 + k;
        nx[(y * m + x) * 3 + k] = (cur[a] + cur[a + 3] + cur[b] + cur[b + 3]) * 0.25;
      }
    }
    n = m; cur = nx;
    levels.push({ n, d: cur });
  }
  SETTS_MIPS = levels;
  return levels;
}
// The setts ground in true perspective, resolved PER PIXEL inside a cache builder (no pattern fills:
// a few hundred transformed pattern fills of a big tile cost seconds-to-minutes on a software
// rasteriser). Same mapping as persGround: horizon hzY, `scale` = on-screen tile width at the bottom
// row, tile centred on cx. Trilinear-ish: the mip level is picked per row from the texel footprint,
// bilinear inside it, so the far courses neither shimmer nor moire.
function persGroundSetts(a, hzY, scale, cx, yA, yB, macro = 0.35) {
  const L = settsMips(), ts = L[0].n;
  const px = K.pixelScale(), cw = Math.ceil(LW * px);
  const j0 = Math.max(0, Math.floor(yA * px)), j1 = Math.min(Math.ceil(LH * px), Math.ceil(yB * px));
  if (j1 <= j0) return;
  // computed on a CPU-backed strip, then drawn into the (GPU) target once
  const T = K.makeCanvas(cw, j1 - j0), tg = T.getContext("2d", { willReadFrequently: true });
  const im = tg.createImageData(cw, j1 - j0), d = im.data;
  const Dd = LH - hzY, C = (ts * 760 * Dd) / scale;
  for (let j = j0; j < j1; j++) {
    const y = (j + 0.5) / px;
    const as = (scale * (y - hzY)) / Dd / ts; // screen px per texel (horizontal)
    const v = C / (y - hzY), dv = C / ((y - hzY) * (y - hzY)) / px; // texels per device px (vertical)
    const fp = Math.max(1 / (as * px), dv);
    const lvl = clamp(Math.floor(Math.log2(Math.max(1, fp))), 0, L.length - 1);
    const M = L[lvl], n = M.n, md = M.d, sc = n / ts;
    const vv = v * sc - 0.5, y0 = Math.floor(vv), fy = vv - y0;
    const r0 = ((y0 % n) + n) % n, r1 = (r0 + 1) % n;
    // large-scale value drift in world space (patches of wetter / dirtier / paler stone) - it does
    // not repeat with the tile, so the courses never read as a stamped swatch
    const MG = 8, mrow = [];
    for (let i = 0; i <= cw + MG; i += MG) {
      const uw = ((i + 0.5) / px - cx) / as;
      mrow.push(1 + macro * 2 * (K.texFbm(uw / 520, v / 520, 16, 3) - 0.5) + macro * (K.texFbm(uw / 140, v / 140, 17, 2) - 0.5));
    }
    let o = (j - j0) * cw * 4;
    for (let i = 0; i < cw; i++, o += 4) {
      const mi = i / MG, m0 = Math.floor(mi), mk = mrow[m0] + (mrow[m0 + 1] - mrow[m0]) * (mi - m0);
      const u = (((i + 0.5) / px - cx) / as + ts * 0.5) * sc - 0.5;
      const x0 = Math.floor(u), fx = u - x0;
      const c0 = ((x0 % n) + n) % n, c1 = (c0 + 1) % n;
      const p00 = (r0 * n + c0) * 3, p01 = (r0 * n + c1) * 3, p10 = (r1 * n + c0) * 3, p11 = (r1 * n + c1) * 3;
      for (let k = 0; k < 3; k++) {
        const top = md[p00 + k] + (md[p01 + k] - md[p00 + k]) * fx;
        const bot = md[p10 + k] + (md[p11 + k] - md[p10 + k]) * fx;
        d[o + k] = (top + (bot - top) * fy) * mk;
      }
      d[o + 3] = 255;
    }
  }
  tg.putImageData(im, 0, 0);
  a.save(); a.setTransform(1, 0, 0, 1, 0, 0); a.drawImage(T, 0, j0); a.restore();
}
// a textured ground plane in perspective, drawn only over rows yA..yB (the horizon may be far off frame):
// each thin strip is one affine slice of the texture, tile width proportional to the distance below the horizon
function persGround(s, name, texO, hzY, scale, cx, yA, yB, mode, alpha = 1) {
  const own = typeof name !== "string"; // a canvas tile of our own (the setts)
  const c = own ? name : K.texture(name, texO), ts = c.width;
  const pat = own ? s.createPattern(c, "repeat") : K.texPattern(s, name, texO);
  const D = LH - hzY, C = (ts * 760 * D) / scale; // focal 760 px: near tiles almost square, far ones flattened
  s.save();
  if (mode) s.globalCompositeOperation = mode;
  s.globalAlpha = alpha;
  s.fillStyle = pat;
  for (let ya = yA; ya < yB; ya += 2) {
    const yb = Math.min(yB, ya + 2);
    const va = C / (ya - hzY), vb = C / (yb - hzY);
    const a = (scale * ((ya + yb) / 2 - hzY)) / D / ts;
    const d = (yb - ya) / (vb - va);
    if (pat.setTransform) pat.setTransform(new DOMMatrix([a, 0, 0, d, cx - ts * 0.5 * a, ya - va * d]));
    // opaque passes overlap a hair (no seams); blended passes must not, or the overlaps double up
    // into horizontal scanlines
    if (mode || alpha < 1) s.fillRect(0, ya, LW, yb - ya);
    else s.fillRect(0, ya - 0.3, LW, yb - ya + 0.6);
  }
  s.restore();
}
// the water's footprint: the puddle fills the mortar joints first and the crowns of the setts break
// its surface at the shallow rim (a blob field minus the stone height, read from the ground's luminance)
function paintPudMask(s) {
  const base = SPR("f03pudGround", LW, LH, paintPudGround);
  const px = K.pixelScale();
  const w = Math.ceil(LW * px), h = Math.ceil(LH * px);
  const T = K.makeCanvas(w, h), tg = T.getContext("2d", { willReadFrequently: true });
  tg.drawImage(base, 0, 0, w, h);
  const im = tg.getImageData(0, 0, w, h), d = im.data;
  // the blob field on a coarse grid (noise is the expensive part), bilinearly sampled per pixel
  const G = 8, gw = Math.ceil(LW / G) + 2, gh = Math.ceil(LH / G) + 2, B = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const x = gx * G, y = gy * G;
    const u = (x - PUD.cx) / PUD.rx, v = (y - PUD.cy) / PUD.ry;
    B[gy * gw + gx] = 1 - (u * u + v * v) + K.texFbm(x / 170, y / 110, 41, 4) * 0.45 + K.texFbm(x / 38, y / 26, 43, 2) * 0.07;
  }
  let sum = 0;
  for (let o = 0; o < d.length; o += 4) sum += d[o] * 0.3 + d[o + 1] * 0.55 + d[o + 2] * 0.15;
  const mean = Math.max(1, sum / (d.length / 4));
  for (let j = 0; j < h; j++) {
    const y = j / px, fy = y / G, y0 = Math.floor(fy), ty = fy - y0;
    for (let i = 0; i < w; i++) {
      const o = (j * w + i) * 4, x = i / px, fx = x / G, x0 = Math.floor(fx), tx = fx - x0;
      const q = y0 * gw + x0;
      const bl = (B[q] * (1 - tx) + B[q + 1] * tx) * (1 - ty) + (B[q + gw] * (1 - tx) + B[q + gw + 1] * tx) * ty;
      const L = (d[o] * 0.3 + d[o + 1] * 0.55 + d[o + 2] * 0.15) / mean;
      const depth = bl - (L - 1) * 0.35;
      const m = clamp((depth - 0.02) / 0.07);
      d[o] = d[o + 1] = d[o + 2] = 0;
      d[o + 3] = Math.round(m * 255);
    }
  }
  tg.putImageData(im, 0, 0);
  s.drawImage(T, 0, 0, LW, LH);
}
// what the puddle-cam sees outside the water: the ground with a soaked, darker band round the puddle
// and the near foreground falling out of focus
function paintPudBase(s) {
  const base = SPR("f03pudGround", LW, LH, paintPudGround);
  const mask = SPR("f03pudMask", LW, LH, paintPudMask);
  s.drawImage(base, 0, 0, LW, LH);
  const [S, sx] = scratchCanvas(LW, LH);
  if (K.hasFilter()) sx.filter = `blur(${K.qblur((14 * K.pixelScale()).toFixed(1))}px)`;
  sx.drawImage(mask, 0, 0, LW, LH);
  sx.filter = "none";
  sx.globalCompositeOperation = "source-in";
  sx.fillStyle = "rgba(4,6,12,0.55)";
  sx.fillRect(0, 0, LW, LH);
  s.drawImage(S, 0, 0, LW, LH);
  defocusBottom(s, 400, 6);
}
function defocusBottom(s, y0, blurPx) {
  if (!K.hasFilter()) return;
  const [B, bx] = scratchCanvas(LW, LH);
  bx.filter = `blur(${K.qblur((blurPx * K.pixelScale()).toFixed(1))}px)`;
  bx.drawImage(s.canvas, 0, 0, LW, LH);
  bx.filter = "none";
  bx.globalCompositeOperation = "destination-in";
  const m = bx.createLinearGradient(0, y0, 0, LH);
  m.addColorStop(0, "rgba(0,0,0,0)"); m.addColorStop(1, "rgba(0,0,0,1)");
  bx.fillStyle = m;
  bx.fillRect(0, 0, LW, LH);
  s.save(); s.setTransform(1, 0, 0, 1, 0, 0); s.drawImage(B, 0, 0); s.restore();
}
// the puddle bed: the same setts under a few cm of water, darker, softened, a little green-brown
function paintPudUnder(s) {
  if (K.hasFilter()) s.filter = `blur(${K.qblur((1.6 * K.pixelScale()).toFixed(1))}px)`;
  s.drawImage(SPR("f03pudGround", LW, LH, paintPudGround), 0, 0, LW, LH);
  s.filter = "none";
  s.globalCompositeOperation = "multiply";
  s.fillStyle = "#3a4038";
  s.fillRect(0, 0, LW, LH);
  s.globalCompositeOperation = "source-over";
}
// the mirror image of the street (static part): zenith sky below the flipped plate, then the plate
function paintPudSky(s) {
  // overhead: the low rain cloud, its belly lit brown-grey by the town
  const sk = s.createLinearGradient(0, mirY(0), 0, LH);
  sk.addColorStop(0, "#0c1628");
  sk.addColorStop(0.5, "#141a2a");
  sk.addColorStop(1, "#1e1e28");
  s.fillStyle = sk;
  s.fillRect(0, 0, LW, LH);
  K.texRect(s, "cloud", 0, mirY(0) - 40, LW, LH - mirY(0) + 40, { scale: 640, scaleY: 300, tex: { seed: 9, cover: 0.62, size: 256 }, alpha: 0.18, tint: "#7a6660", tintAlpha: 0.7 });
  s.save();
  s.translate(PCX, PH);
  s.scale(PS, -PS);
  s.translate(-VPX, -VPY);
  s.drawImage(SPR("f03street2", LW, LH, paintStreet), 0, 0, LW, VPY + 2, 0, 0, LW, VPY + 2);
  s.restore();
  // melt the plate's top edge (the cloud deck) into the reflected zenith
  const sm = s.createLinearGradient(0, mirY(90), 0, mirY(0) + 30);
  sm.addColorStop(0, "rgba(12,22,40,0)"); sm.addColorStop(0.7, "rgba(12,22,40,0.9)"); sm.addColorStop(1, "rgba(12,22,40,0)");
  s.fillStyle = sm;
  s.fillRect(0, mirY(90), LW, mirY(0) + 30 - mirY(90));
  // the lamp right beside the puddle (out of frame, top right) hangs upside down in the water:
  // its iron column runs from the far rim down to the lantern
  const pg = s.createLinearGradient(800, 0, 830, 0);
  pg.addColorStop(0, "#07090e"); pg.addColorStop(0.7, "#2a2622"); pg.addColorStop(1, "#07090e");
  s.fillStyle = pg;
  s.beginPath(); s.moveTo(806, 0); s.lineTo(834, 0); s.lineTo(800, 300); s.lineTo(786, 300); s.closePath(); s.fill();
  s.fillStyle = "#0a0c10";
  s.beginPath(); s.moveTo(796, 296); s.quadraticCurveTo(770, 330, 720, 334); s.lineTo(722, 342); s.quadraticCurveTo(778, 338, 802, 300); s.fill();
  s.beginPath(); s.moveTo(690, 336); s.lineTo(750, 336); s.lineTo(740, 352); s.lineTo(700, 352); s.closePath(); s.fill();
}
const PUD_LAMP = [720, 334]; // the mirrored lantern's glass
// a raindrop ring as the water draws it: a bright crest (it tilts toward the lit sky) with a dark trough inside
function rippleSprite() {
  return SPR("f03ripple", 128, 128, (s) => {
    const g2 = s.createRadialGradient(64, 64, 0, 64, 64, 63);
    g2.addColorStop(0, "rgba(0,0,0,0)");
    g2.addColorStop(0.5, "rgba(0,0,0,0)");
    g2.addColorStop(0.64, "rgba(150,170,210,0.05)");
    g2.addColorStop(0.73, "rgba(0,0,0,0.22)");
    g2.addColorStop(0.83, "rgba(170,186,224,0.15)");
    g2.addColorStop(0.92, "rgba(0,0,0,0.18)");
    g2.addColorStop(1, "rgba(0,0,0,0)");
    s.fillStyle = g2;
    s.fillRect(0, 0, 128, 128);
  });
}
// alpha ramp for the water's reflectance: strong at grazing angles (far, top), weaker near the lens
function fresnelRamp() {
  return SPR("f03fresnel", 8, LH, (s) => {
    const gr = s.createLinearGradient(0, 0, 0, LH);
    for (let i = 0; i <= 8; i++) { const u = i / 8; gr.addColorStop(u, `rgba(0,0,0,${lerp(0.95, 0.5, Math.pow(u, 0.8)).toFixed(3)})`); }
    s.fillStyle = gr;
    s.fillRect(0, 0, 8, LH);
  });
}
function puddleView(g, t, lt) {
  g.drawImage(SPR("f03pudBase", LW, LH, paintPudBase), 0, 0, LW, LH);
  // the water, composed on a layer and cut to the puddle's footprint
  const W = K.layer(LW, LH, "f03pudW");
  const w = W.g;
  w.drawImage(SPR("f03pudUnder", LW, LH, paintPudUnder), 0, 0, LW, LH);
  // the mirror image, live: sky plate + the cat + the lamps
  const R = K.layer(LW, LH, "f03pudR");
  const r = R.g;
  r.drawImage(SPR("f03pudSky", LW, LH, paintPudSky), 0, 0, LW, LH);
  const walk = seg(lt, 2.0, 6.6);
  if (walk > 0 && walk < 1) {
    // feet on the far rim (just above the frame line), body hanging down into the water
    const cx = lerp(1060, -120, walk), fy = 40;
    r.save();
    r.translate(0, fy);
    r.scale(1, -1);
    K.drawCat(r, cx, 0, 104, {
      pose: "walk", phase: lt * 1.3, facing: -1, t: lt, collar: true, bell: true, wet: 0.55, shadow: false, pupil: 1,
      key: { x: cx + 420, y: -380, color: "#ffb060", strength: 1.25 }, rim: { x: cx - 300, y: -260, color: "#9fb4e0", strength: 0.7 },
      fill: "#141c30", ambient: "#2a3658", ambientK: 0.25, castShadow: 0,
    });
    r.restore();
  }
  // water only reflects part of the light: darken the image (the lamps go on top at full strength)
  r.globalCompositeOperation = "multiply";
  r.fillStyle = "#9aa6c0";
  r.fillRect(0, 0, LW, LH);
  r.globalCompositeOperation = "lighter";
  for (const [X, z] of LAMPS) {
    if (z > 45) continue;
    const h = P(X - Math.sign(X) * 0.6, 4.55, z);
    const x = mirX(h[0]), y = mirY(h[1]);
    if (x < -80 || x > LW + 80 || y < -80 || y > LH + 80) continue;
    const rr = (1.6 / z) * F * PS;
    glow(r, x, y, rr * 1.5, LAMP, 0.32);
    glow(r, x, y, rr * 0.28, "#fff2d8", 0.9);
  }
  // the near lantern: a hot core (the lens blooms it) inside the rain-mist halo
  glow(r, PUD_LAMP[0], PUD_LAMP[1] - 4, 150, LAMP, 0.4);
  glow(r, PUD_LAMP[0], PUD_LAMP[1] - 4, 46, "#ffd8a0", 0.7);
  r.fillStyle = "#fff6e6";
  r.beginPath(); r.ellipse(PUD_LAMP[0], PUD_LAMP[1] - 3, 17, 7, 0, 0, TAU); r.fill();
  r.globalCompositeOperation = "source-over";
  // copy the mirror into the water in thin strips, each nudged by the swell; Fresnel: the far water
  // (grazing view) mirrors strongly, the near water lets you see the bed
  // Fresnel: the mirror image is masked by a vertical ramp (grazing far water ~95%, near water ~50%),
  // so the bed shows through toward the camera. One whole-image draw: no strips, no scanlines; the
  // swell is a slow sub-pixel drift of the whole image, and the raindrop rings below displace it locally.
  R.g.globalCompositeOperation = "destination-in";
  R.g.drawImage(fresnelRamp(), 0, 0, LW, LH);
  R.g.globalCompositeOperation = "source-over";
  w.drawImage(R.canvas, Math.sin(lt * 0.9) * 0.8, Math.sin(lt * 0.63) * 0.6, LW, LH);
  // the swell smears the lantern into a broken column of glints running toward the camera
  reflStreak(w, PUD_LAMP[0], PUD_LAMP[1] - 30, 190, 16, LAMP, 0.75, lt, 5);
  // raindrop rings: crest and trough, flattened by the viewing angle, larger toward the camera
  const rs = rippleSprite();
  for (let i = 0; i < 22; i++) {
    const per = 0.9 + hash(i, 101) * 0.8;
    const tt = lt + hash(i, 102) * per, cyc = Math.floor(tt / per), ph = tt / per - cyc;
    const x = PUD.cx + (hash(i * 3 + cyc * 7, 103) - 0.5) * PUD.rx * 1.6;
    const y = PUD.cy + (hash(i * 5 + cyc * 3, 104) - 0.5) * PUD.ry * 1.6;
    const ps = (y - PH) / (LH - PH); // perspective scale
    const rad = (3 + Math.sqrt(ph) * 46) * ps * 1.5;
    const flat = lerp(0.3, 0.62, ps);
    // the ring is a travelling bump in the water surface: inside its crest the mirror image is
    // refracted/displaced a couple of pixels (soft, in rings - not in horizontal strips)
    if (ph < 0.75 && rad > 5) {
      const amp = 2.6 * (1 - ph) * ps + 0.5;
      const ry = rad * flat, sx0 = Math.max(0, x - rad - 4), sy0 = Math.max(0, y - ry - 4);
      const sw0 = Math.min(LW, x + rad + 4) - sx0, sh0 = Math.min(LH, y + ry + 4) - sy0;
      if (sw0 > 2 && sh0 > 2) {
        const pxs = K.pixelScale();
        w.save();
        w.beginPath();
        w.ellipse(x, y, rad * 0.98, ry * 0.98, 0, 0, TAU);
        w.ellipse(x, y, rad * 0.66, ry * 0.66, 0, 0, TAU);
        w.clip("evenodd");
        w.globalAlpha = 0.9 * (1 - ph);
        w.drawImage(R.canvas, sx0 * pxs, clamp(sy0 - amp, 0, LH) * pxs, sw0 * pxs, sh0 * pxs, sx0, sy0, sw0, sh0);
        w.restore();
      }
    }
    w.globalAlpha = Math.pow(1 - ph, 1.6);
    w.drawImage(rs, x - rad, y - rad * flat, rad * 2, rad * 2 * flat);
    if (ph < 0.12) {
      // the impact: a bright fleck and a tiny crown of spray
      w.globalAlpha = 0.7 * (1 - ph / 0.12);
      w.fillStyle = "#d8e2f6";
      w.fillRect(x - 1.2 * ps, y - 3 * ps * (ph / 0.12) - 1, 2.4 * ps, 1.6 * ps);
    }
  }
  w.globalAlpha = 1;
  // cut to the footprint
  w.globalCompositeOperation = "destination-in";
  w.drawImage(SPR("f03pudMask", LW, LH, paintPudMask), 0, 0, LW, LH);
  w.globalCompositeOperation = "source-over";
  g.drawImage(W.canvas, 0, 0, LW, LH);
  // rain on the setts round the water
  K.splashes(g, LW, LH, t, { y0: 60, y1: LH, density: 0.35, color: "rgba(200,212,236,0.3)", seed: 63 });
}
function shotPuddle(g, t, lt) {
  // The camera tilts up from the water to the empty street, then holds on nobody. The two views are
  // one tall continuous plate: the street sits above the puddle-cam frame and the two melt together
  // through a feathered SEAM-px band (the wet ground runs on into the street), never a hard edge.
  const sT = seg(lt, 6.2, 8.3), tilt = eio(sT);
  const SEAM = 120;
  const off = tilt * (LH - SEAM);
  const vel = sT > 0 && sT < 1 ? Math.sin(sT * Math.PI) : 0; // tilt speed (bell-shaped like the ease)
  const pud = (f) => {
    f.save();
    f.translate(0, off);
    // a slow creep in toward the water before the tilt, breathing handheld drift
    const z = 1 + eio(lt / 6.2) * 0.04;
    f.translate(LW / 2, LH * 0.4); f.scale(z, z); f.translate(-LW / 2 + Math.sin(lt * 0.7) * 2, -LH * 0.4 + Math.sin(lt * 0.53) * 1.5);
    puddleView(f, t, lt);
    f.restore();
  };
  const street = (f) => {
    f.drawImage(SPR("f03street2", LW, LH, paintStreet), 0, 0, LW, LH);
    K.fog(f, LW, LH, { y: VPY - 10, h: 140, color: "#7a86a8", alpha: 0.32, t, seed: 5 });
    streetLights(f, t, 0.95);
  };
  if (tilt <= 0) pud(g);
  else if (tilt >= 1) street(g);
  else {
    // compose the frame on one layer (so the motion blur below sees all of it)
    const M = K.layer(LW, LH, "f03tiltM");
    pud(M.g);
    const S = K.layer(LW, LH, "f03tiltS");
    S.g.save(); S.g.translate(0, off - LH + SEAM); street(S.g); S.g.restore();
    // feather: the street's bottom SEAM px fade out over the puddle-cam's top (fully opaque again as
    // the tilt lands, and faded in over the first moments of the move so nothing pops)
    const sy = off - LH + SEAM, a0 = smooth(tilt / 0.2), a1 = smooth((tilt - 0.8) / 0.2);
    // (one full-frame gradient: destination-in clears everything outside the shape it fills)
    const yA = clamp(off / LH), yB = clamp((off + SEAM) / LH);
    const m = S.g.createLinearGradient(0, 0, 0, LH);
    m.addColorStop(0, `rgba(0,0,0,${a0})`);
    m.addColorStop(yA, `rgba(0,0,0,${a0})`);
    for (let i = 1; i <= 4; i++) { const u = i / 4; m.addColorStop(lerp(yA, yB, u), `rgba(0,0,0,${(a0 * lerp(1, a1, smooth(u))).toFixed(3)})`); }
    if (yB < 0.999) { m.addColorStop(Math.min(1, yB + 0.001), "rgba(0,0,0,0)"); m.addColorStop(1, "rgba(0,0,0,0)"); }
    S.g.globalCompositeOperation = "destination-in";
    S.g.fillStyle = m; S.g.fillRect(0, 0, LW, LH);
    S.g.globalCompositeOperation = "source-over";
    M.g.drawImage(S.canvas, 0, 0, LW, LH);
    g.drawImage(M.canvas, 0, 0, LW, LH);
    // vertical motion blur (a 180-degree shutter at this speed): no shifted copies (they comb);
    // instead a vertical mip chain - each halving averages pairs of rows - stretched back over the
    // frame, so the smear is a smooth box filter along the move, mixed in by the tilt speed
    if (vel > 0.05) {
      const len = vel * 48, lv = clamp(Math.round(Math.log2(Math.max(2, len / 2))), 1, 4);
      let src = M.canvas, sh = LH;
      for (let k = 1; k <= lv; k++) {
        sh = Math.max(4, Math.ceil(LH / (1 << k)));
        const D = K.layer(LW, sh, "f03mb" + k); // full width: the smear is along the move (vertical) only
        D.g.imageSmoothingEnabled = true;
        D.g.drawImage(src, 0, 0, LW, sh);
        src = D.canvas;
      }
      g.save();
      g.imageSmoothingEnabled = true;
      g.globalAlpha = clamp(vel * 1.1) * 0.85;
      g.drawImage(src, 0, 0, LW, LH);
      g.restore();
    }
  }
  const halos = [];
  if (tilt > 0.5) for (const [X, z] of LAMPS) if (z < 40) { const h = P(X - Math.sign(X) * 0.6, 4.5, z); halos.push([h[0], h[1] + (1.4 / z) * F + off - LH + SEAM, (2.4 / z) * F]); }
  if (halos.length) litRain(g, t, halos, 1.2);
  // near rain: long soft streaks past the lens, picking up the lamp
  K.rain(g, LW, LH, t, { density: 0.45, angle: 0.06, color: "rgba(200,212,236,0.26)", seed: 61, len: 34 });
}

// ---- the kid's raincoat, close up --------------------------------------------------------------------
// Painted over a back-view drawPerson (same ground point / height / gait phase), clipped to the figure
// with source-atop, in drawPerson's body units (1 = h/100, y up negative, shoulders at -79.5):
// heavy wet PVC hangs in a few vertical drape folds, each crease a dark trough with the lamp's rim
// caught as a soft streak on its lit lip; a broad soft sheen (wet fabric: no point glints); the hem
// soaked darker; the back of the bending knee creased; rubber boots with a sole line and a rounded
// heel counter catching the light.
function kidFabric(g, x, y, h, o = {}) {
  const u = h / 100, ph = o.phase || 0, run = !!o.run, moving = run || !!o.walk;
  const cyc = ph * TAU, rim = o.rim || 1;
  const bob = moving ? -Math.abs(Math.sin(cyc)) * (run ? 3 : 1.4) : 0;
  const sway = moving ? Math.sin(cyc) * (run ? 0.7 : 1.1) : 0;
  const hipY = -47 + bob, shY = -79.5 + bob, hem = hipY + 8.5;
  g.save();
  g.translate(x, y);
  g.scale(u, u);
  g.globalCompositeOperation = "source-atop";
  g.lineCap = "round";
  // drape folds: trough + rim-lit lip, swinging a little with the stride
  const folds = [-7.6, -3.2, 1.6, 6.4];
  folds.forEach((fx, i) => {
    const sw = Math.sin(cyc + i * 0.9) * (moving ? 0.9 : 0.2);
    const x0 = fx * 0.6 + sway * 0.4, x1 = fx + sway * 0.8 + sw, ym = lerp(shY + 12, hem, 0.55);
    const lit = clamp(0.35 + 0.65 * (rim * fx > 0 ? Math.abs(fx) / 7.6 : 0.1));
    const tg = g.createLinearGradient(0, shY + 10, 0, hem);
    tg.addColorStop(0, "rgba(40,22,0,0)"); tg.addColorStop(0.35, "rgba(40,22,0,0.32)"); tg.addColorStop(1, "rgba(40,22,0,0.42)");
    g.strokeStyle = tg; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x0, shY + 10); g.quadraticCurveTo(lerp(x0, x1, 0.6) - 0.6, ym, x1, hem + 0.6); g.stroke();
    const sg = g.createLinearGradient(0, shY + 10, 0, hem);
    sg.addColorStop(0, "rgba(255,226,170,0)"); sg.addColorStop(0.3, `rgba(255,226,170,${0.26 * lit})`); sg.addColorStop(1, `rgba(255,214,150,${0.12 * lit})`);
    g.strokeStyle = sg; g.lineWidth = 0.7;
    const so = rim * 1.0;
    g.beginPath(); g.moveTo(x0 + so, shY + 11); g.quadraticCurveTo(lerp(x0, x1, 0.6) - 0.6 + so, ym, x1 + so, hem); g.stroke();
  });
  // broad soft sheen on the lamp side of the back (wet fabric reflects a smeared image, not sparkles)
  const bx = rim * 5.5 + sway;
  const bs = g.createRadialGradient(bx, shY + 16, 0, bx, shY + 16, 14);
  bs.addColorStop(0, "rgba(255,230,180,0.16)"); bs.addColorStop(1, "rgba(255,230,180,0)");
  g.fillStyle = bs;
  g.save(); g.translate(bx, shY + 16); g.scale(0.45, 1.4); g.translate(-bx, -(shY + 16)); g.fillRect(bx - 14, shY + 2, 28, 28); g.restore();
  // the soaked hem: darker and heavier along the bottom 6 units
  const hg = g.createLinearGradient(0, hem - 7, 0, hem + 1);
  hg.addColorStop(0, "rgba(60,30,0,0)"); hg.addColorStop(1, "rgba(50,24,0,0.45)");
  g.fillStyle = hg; g.fillRect(-14 + sway, hem - 7, 28, 8);
  // legs: knee crease when the knee bends (the lifting leg), then the boots
  for (const s of [-1, 1]) {
    const p = ((ph + (s > 0 ? 0.5 : 0)) % 1 + 1) % 1;
    const sw = Math.sin(p * TAU);
    const lift = moving ? Math.max(0, sw) * (run ? 12 : 4.5) : 0;
    const ax = s * 5.0 + sway * 0.25 - s * lift * 0.06, ay = -3.6 - lift;
    const kx = s * 5.1 + sway * 0.55, ky = lerp(hipY, ay, 0.5) + lift * 0.35;
    const bend = clamp(lift / 10);
    if (bend > 0.05) {
      // the back of the knee folds into a dark crease with a compression ridge over it
      g.fillStyle = `rgba(0,0,0,${0.45 * bend})`;
      g.beginPath(); g.ellipse(kx, ky + 1, 3.8, 1.1 + bend, 0, 0, TAU); g.fill();
      g.fillStyle = `rgba(150,170,220,${0.12 * bend})`;
      g.beginPath(); g.ellipse(kx, ky - 1.2, 3.4, 0.7, 0, 0, TAU); g.fill();
      // the shin foreshortens toward the camera: darker below the knee
      const lg = g.createLinearGradient(0, ky, 0, ay - 10);
      lg.addColorStop(0, `rgba(0,0,0,${0.3 * bend})`); lg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = lg; g.fillRect(kx - 5, ky, 10, ay - 10 - ky);
    }
    // the jeans: a soft lamp rim down the outer edge of the shin and thigh, wet denim darker inside
    // wet denim first, laid over the whole leg so the figure's hard rim stripe becomes a soft roll-off:
    // dark indigo, a little lighter down the middle of the shin where it faces the sky
    {
      const x0 = Math.min(kx, ax) - 6, x1 = Math.max(kx, ax) + 6;
      const dg = g.createLinearGradient(x0, 0, x1, 0);
      dg.addColorStop(0, "rgba(10,12,22,0.85)"); dg.addColorStop(0.45, "rgba(30,36,58,0.72)"); dg.addColorStop(0.75, "rgba(22,26,44,0.75)"); dg.addColorStop(1, "rgba(10,12,22,0.85)");
      g.fillStyle = dg; g.fillRect(x0, hem, x1 - x0, ay - 12 - hem);
      // creases at the back of the knee and the ankle where the wet denim bunches
      g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 0.7;
      for (const yy of [lerp(hem, ay - 12, 0.45), lerp(hem, ay - 12, 0.52), ay - 14]) { g.beginPath(); g.moveTo(kx - 3.5, yy); g.quadraticCurveTo(kx, yy + 1.2, kx + 3.5, yy - 0.2); g.stroke(); }
    }
    const jg = g.createLinearGradient(kx - 5 * s, 0, kx + 5 * s, 0);
    jg.addColorStop(0, "rgba(0,0,0,0.25)"); jg.addColorStop(0.6, "rgba(0,0,0,0)"); jg.addColorStop(0.88, `rgba(255,190,130,${rim * s > 0 ? 0.16 : 0.05})`); jg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = jg; g.fillRect(Math.min(kx - 5 * s, kx + 5 * s), hem, 10, ay - 12 - hem);
    // boot: rubber, not a painted block - a soft cylinder that falls into shade toward the sole (this
    // also tames drawPerson's sharp specular stripe into a broad wet sheen), a rounded heel counter
    // catching the rim, and the sole line with its scuffed lip
    const bt = ay - 13;
    const cg = g.createLinearGradient(ax - 5, 0, ax + 5, 0);
    cg.addColorStop(0, "rgba(22,3,3,0.97)"); cg.addColorStop(0.3, "rgba(70,13,11,0.95)"); cg.addColorStop(0.5 + rim * 0.12, "rgba(96,20,15,0.95)"); cg.addColorStop(0.85, "rgba(50,8,7,0.95)"); cg.addColorStop(1, "rgba(20,3,2,0.97)");
    g.fillStyle = cg; g.fillRect(ax - 6, bt, 12, ay + 2 - bt);
    const rg = g.createLinearGradient(0, bt, 0, ay + 1.5);
    rg.addColorStop(0, "rgba(0,0,0,0)"); rg.addColorStop(0.65, "rgba(20,0,0,0.15)"); rg.addColorStop(1, "rgba(10,0,0,0.45)");
    g.fillStyle = rg; g.fillRect(ax - 6, bt, 12, ay + 2 - bt);
    // a broad, soft wet sheen down the lamp side of the rubber (not a painted stripe)
    const wsx = ax + rim * 2.2;
    const wg = g.createLinearGradient(wsx - 1.6, 0, wsx + 1.6, 0);
    wg.addColorStop(0, "rgba(255,200,170,0)"); wg.addColorStop(0.5, "rgba(255,206,176,0.22)"); wg.addColorStop(1, "rgba(255,200,170,0)");
    g.fillStyle = wg; g.fillRect(wsx - 1.6, bt + 1, 3.2, ay - bt - 3);
    // the rolled top of the boot shaft, the leg disappearing into it
    g.fillStyle = "rgba(10,2,2,0.6)"; g.fillRect(ax - 5.6, bt, 11.2, 1.3);
    g.fillStyle = "rgba(255,180,150,0.12)"; g.fillRect(ax - 5, bt + 1.3, 10, 0.5);
    g.fillStyle = "rgba(14,9,7,0.95)";
    g.fillRect(ax - 5, ay + 0.1, 10, 1.4);
    g.fillStyle = "rgba(200,190,180,0.16)";
    g.fillRect(ax - 4.4, ay - 0.15, 8.8, 0.3);
    // a boot is round, not a block: carve the shaft's top and the heel's corners
    g.save();
    g.globalCompositeOperation = "destination-out";
    for (const [cx, cy, r] of [[ax - 6.2, ay + 1.4, 2.2], [ax + 6.2, ay + 1.4, 2.2], [ax - 6.4, bt - 0.4, 1.4], [ax + 6.4, bt - 0.4, 1.4]]) {
      const cr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      cr.addColorStop(0, "rgba(0,0,0,1)"); cr.addColorStop(0.7, "rgba(0,0,0,0.9)"); cr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = cr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    g.restore();
  }
  g.restore();
}

// the kid standing still (back view), painted on a layer at the camera's zoom so it keeps full
// detail, with the raincoat's drape folds / soft wet sheen / hem / boots from kidFabric (no rain-bead
// sparkles: wet fabric gives a broad sheen, not point glints)
function kidStill(c, x, y, h, zoom, o) {
  const Z = Math.max(1, zoom), bw = Math.ceil(h * 0.7), bh = Math.ceil(h * 1.18), bx = x - bw / 2, by = y - h * 1.12;
  // a fixed-size layer (sized for the tightest zoom): resizing a canvas every frame reallocates it
  const L = K.layer(Math.ceil(bw * 2.4), Math.ceil(bh * 2.4), "f03kidStill"), sp = K.pixelScale();
  L.g.scale(Z, Z);
  L.g.translate(-bx, -by);
  const sole = h * 0.022;
  K.drawPerson(L.g, x, y + sole, h, { view: "back", hood: true, wet: o.wet, beads: false, bell: true, t: o.t, breathe: true, shadow: false, detail: 2, light: o.light, ambient: o.ambient });
  kidFabric(L.g, x, y + sole, h, { rim: o.light && o.light.x > x ? 1 : -1, t: o.t });
  c.drawImage(L.canvas, 0, 0, Math.min(L.canvas.width, bw * Z * sp), Math.min(L.canvas.height, bh * Z * sp), bx, by, bw, bh);
}// ---- shot 7: you run toward the clock tower ----------------------------------------------------------
function shotRun(g, t, lt) {
  const p = seg(lt, 0, 8);
  // low and close, tracking just behind you as you run, a slight Dutch tilt that rocks with the stride
  const z = lerp(4.4, 13, eio(p));
  const b = P(0.6, 0, z), h = (1.45 / z) * F;
  const ph = lt * 1.45;
  const zoom = lerp(1.95, 1.4, eio(p));
  // the camera tilts up a touch as you get further away, so the clock tower (the goal) holds in frame
  const cam = { x: lerp(b[0], 480, 0.35), y: b[1] - h * 0.5 - 46 * eio(p), zoom, rot: -0.04 + Math.sin(ph * TAU) * 0.007, shakeT: t * 1.6, shakeAmt: 2.2 };
  K.withCamera(g, LW, LH, cam, (c) => {
    shotStreet(c, t, lt, {
      extra(cg) {
        // the nearest lamp ahead on the right is the key, behind you: a rim on the wet coat; sky fill
        const lz = Math.ceil((z + 2.5 - 9) / 8.5) * 8.5 + 9;
        const lp = P(4.1, 4.55, lz);
        const ZK = zoom; // paint the figure at its on-screen resolution (full detail, no upscale blur)
        const bw = Math.ceil(h * 1.3), bh = Math.ceil(h * 1.2), bx = b[0] - bw / 2, by = b[1] - h * 1.15;
        // fixed-size layers (sized for the first, closest frame): no per-frame canvas reallocation
        const L = K.layer(440, 410, "f03kidrun"), lsw = Math.min(L.canvas.width, bw * ZK * K.pixelScale()), lsh = Math.min(L.canvas.height, bh * ZK * K.pixelScale());
        L.g.scale(ZK, ZK);
        L.g.translate(-bx, -by);
        // the feet are planted exactly on the ground point: drawPerson's own gait bob lifts only the
        // hips and shoulders, never the stance foot
        const sole = h * 0.022; // drawPerson's boot soles sit 2.2 body units above its ground point
        K.drawPerson(L.g, b[0], b[1] + sole, h, { view: "back", run: true, phase: ph, hood: true, wet: 1, bell: true, t: lt, shadow: false, detail: 2, beads: false,
          light: { x: lp[0], y: lp[1], color: LAMP, strength: 1.1, z: -0.55 }, ambient: "#18203a" });
        kidFabric(L.g, b[0], b[1] + sole, h, { phase: ph, run: true, rim: lp[0] > b[0] ? 1 : -1, t: lt });
        L.g.setTransform(K.pixelScale(), 0, 0, K.pixelScale(), 0, 0);
        // contact: a tight dark core under the soles and a wider, fainter occlusion
        K.shadowBlob(cg, b[0], b[1] + 0.5, h * 0.1, h * 0.018, { alpha: 0.8 });
        K.shadowBlob(cg, b[0], b[1] + 1, h * 0.24, h * 0.04, { alpha: 0.3 });
        // her reflection in the wet setts: mirrored AT the sole line, fading with distance from it,
        // swayed a little by the water film
        const px = K.pixelScale();
        const RL = K.layer(232, 132, "f03kidrefl");
        RL.g.save();
        RL.g.translate(Math.sin(t * 5.3) * 0.8, b[1] - by);
        RL.g.scale(1.02, -1);
        RL.g.drawImage(L.canvas, 0, 0, lsw, lsh, 0, 0, bw, bh);
        RL.g.restore();
        RL.g.globalCompositeOperation = "destination-in";
        const fm = RL.g.createLinearGradient(0, 0, 0, bh * 0.6);
        fm.addColorStop(0, "rgba(0,0,0,0.42)"); fm.addColorStop(0.35, "rgba(0,0,0,0.16)"); fm.addColorStop(1, "rgba(0,0,0,0)");
        RL.g.fillStyle = fm; RL.g.fillRect(0, 0, bw, bh);
        RL.g.globalCompositeOperation = "source-over";
        cg.drawImage(RL.canvas, 0, 0, Math.min(RL.canvas.width, bw * px), Math.min(RL.canvas.height, Math.ceil(bh * 0.6) * px), bx, b[1], bw, Math.ceil(bh * 0.6));
        cg.drawImage(L.canvas, 0, 0, lsw, lsh, bx, by, bw, bh);
        // footfall splashes: a crown of droplets thrown back from each landing foot
        for (const off of [0, 0.5]) {
          const k = ((ph + off) % 1) / 0.32;
          if (k > 1) continue;
          const fx = b[0] + (off ? 1 : -1) * h * 0.07, fy = b[1] - h * 0.01;
          cg.fillStyle = rgba("#c8d7f0", 0.6 * (1 - k));
          for (let d = 0; d < 9; d++) {
            const a = -Math.PI / 2 + (d - 4) * 0.32, v = h * (0.1 + hash(d, off * 10 + 3) * 0.12);
            const qx = fx + Math.cos(a) * v * k, qy = fy + Math.sin(a) * v * k + k * k * h * 0.14;
            cg.fillRect(qx - 0.5, qy - 1.2, Math.max(0.8, h * 0.006), Math.max(1.6, h * 0.016));
          }
        }
      },
    });
  });
  // her speed and the lamps: rain streaks lengthen into motion blur
  K.rain(g, LW, LH, t, { density: 0.35, angle: 0.18, color: "rgba(200,212,240,0.18)", speed: 1100, len: 46, seed: 71 });
}

// ---- the edit -------------------------------------------------------------------------------------
const SHOTS = [
  [0, 10, (g, t, lt) => {
    K.withCamera(g, LW, LH, { x: 480, y: 262, zoom: 1 + eio(lt / 10) * 0.08, shakeT: t, shakeAmt: 0.9 }, (c) => shotStreet(c, t, lt));
    // warm the poster shot's plates a piece at a time while the street holds (cache only)
    if (lt > 6.0) softSprite("f03posterBg", LW, LH, 11, paintPosterBg);
    if (lt > 6.8) SPR("f03column", 92, LH + 40, paintColumn);
    if (lt > 7.4) SPR("f03poster", 172, 230, paintPoster);
    if (lt > 8.0) for (const sd of [401, 402]) SPR("f03op" + sd, 60, 80, (s, ww, hh) => paintOtherPoster(s, ww, hh, sd));
  }],
  [10, 19, shotPoster],
  [19, 28, shotReveal],
  [28, 38, shotCafe],
  [38, 48, shotAlley],
  [48, 58, shotPuddle],
  [58, 66, shotRun],
];
// per-shot lens grades (through the GPU lens): blue-hour rain, sodium lamps; the café warmer, the alley colder
const GRADE = { temp: -0.15, exposure: 0.95, lift: [0.004, 0.009, 0.022], contrast: 1.08, sat: 0.9, halation: 0.5, streak: 0.1, bloom: 0.38, grain: 0.055, vignette: 0.45 };
const SHOT_GRADES = [
  { exposure: 1.0 },
  { exposure: 1.0, temp: -0.08 },
  { exposure: 0.98, temp: -0.12 },
  { exposure: 0.95, temp: 0.08, halation: 0.55, sat: 0.95 },
  { exposure: 1.05, temp: -0.2, streak: 0.12 },
  { exposure: 1.1, temp: -0.18 },
  { exposure: 1.0, temp: -0.12 },
];
const GRADE_KEYS = ["exposure", "temp", "halation", "sat", "streak"];
const XF = 0.5; // cross-dissolve length (s)

function drawShot(g, i, t) {
  const [a, , fn] = SHOTS[i];
  g.save();
  try { fn(g, t, Math.max(0, t - a)); } finally { g.restore(); }
}

export const film = {
  id: 3,
  title: "Missing",
  chapter: "Chapter 3",
  unlockAt: 15,
  duration: D,
  poster: 40,
  tagline: "Have you seen this cat?",
  subs: [
    [3.0, 6.5, "Catford Town, just after the rain."],
    [11.0, 15.0, "You made a poster. Your best drawing."],
    [20.5, 24.0, "Then you saw the others."],
    [24.5, 28.0, "Every post. Every wall. Missing cats."],
    [30.0, 34.5, "The café cat would not look at you."],
    [34.8, 37.5, "It looked down the street instead."],
    [42.0, 46.5, "Something orange in the lamplight."],
    [53.0, 57.0, "You heard him. You know you did."],
    [59.0, 64.0, "The clock tower. He went to the clock tower."],
  ],
  voice: [
    [3.0, "Catford Town, just after the rain.", { rate: 0.92, pitch: 1.0 }],
    [11.0, "You made a poster. Your best drawing.", { rate: 0.92, pitch: 1.0 }],
    [20.5, "Then you saw the others.", { rate: 0.92, pitch: 1.0 }],
    [24.5, "Every post. Every wall. Missing cats.", { rate: 0.85, pitch: 0.95 }],
    [30.0, "The café cat would not look at you.", { rate: 0.92, pitch: 1.0 }],
    [34.8, "It looked down the street instead.", { rate: 0.92, pitch: 1.0 }],
    [42.0, "Something orange in the lamplight.", { rate: 0.92, pitch: 1.0 }],
    [53.0, "You heard him. You know you did.", { rate: 0.92, pitch: 1.0 }],
    [59.0, "The clock tower. He went to the clock tower.", { rate: 0.92, pitch: 1.0 }],
  ],
  grade: GRADE,
  // blend each shot's grade into the next across the cross-dissolve so nothing pops
  gradeAt(t) {
    let i = SHOTS.findIndex(([a, b]) => t >= a && t < b);
    if (i < 0) i = SHOTS.length - 1;
    const cur = SHOT_GRADES[i], nx = SHOT_GRADES[i + 1];
    const k = nx ? smooth((t - (SHOTS[i + 1][0] - XF)) / XF) : 0;
    const out = {};
    for (const key of GRADE_KEYS) {
      const a = cur[key] == null ? GRADE[key] : cur[key];
      const b = !nx || nx[key] == null ? GRADE[key] : nx[key];
      out[key] = lerp(a, b, k);
    }
    // the hit (24 s): the exposure breathes up and cools as the scale of it lands
    const hit = K.env(t, 24, 25.6, 0.05, 1.4);
    out.exposure += 0.12 * hit;
    out.temp -= 0.08 * hit;
    return out;
  },
  score: { mood: "mystery", key: "A", bpm: 78, cues: [[5, "drop"], [24, "hit"], [41, "swell"], [52, "meow"]] },
  draw(g, t, W, H) {
    t = clamp(t, 0, D);
    g.save();
    if (W !== LW || H !== LH) g.scale(W / LW, H / LH);
    let i = SHOTS.findIndex(([a, b]) => t >= a && t < b);
    if (i < 0) i = SHOTS.length - 1;
    drawShot(g, i, t);
    // cross-dissolve into the next shot over its first XF seconds (drawn on a layer, then blended)
    const nx = SHOTS[i + 1];
    if (nx && t > nx[0] - XF) {
      const L = K.layer(LW, LH, "f03xf");
      drawShot(L.g, i + 1, t);
      g.save();
      g.globalAlpha = smooth((t - (nx[0] - XF)) / XF);
      g.drawImage(L.canvas, 0, 0, LW, LH);
      g.restore();
    }
    K.letterbox(g, LW, LH, 1);
    const ta = K.env(t, 2, 6, 0.9, 1.0);
    if (ta > 0) K.title(g, LW, LH, "Missing", "Chapter 3", ta, { y: LH * 0.42, size: 62, glow: "#9fb4e0" });
    K.fadeBlack(g, LW, LH, 1 - smooth(seg(t, 0, 1.4)));
    K.fadeBlack(g, LW, LH, smooth(seg(t, 63.6, 66)));
    g.restore();
  },
};
