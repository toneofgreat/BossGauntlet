// films/f03.js - Chapter 3 "Missing" (FILMS.md f03). Catford Town in light rain at blue hour.
// draw(g, t, W, H) is a pure function of t: every shot derives its state from t; static art is
// cached through K.sprite()/K.layer() keyed by string.
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
  const spr = K.glowSprite(color);
  const n = 11;
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const yy = y0 + u * len;
    const ww = w * (0.55 + 0.9 * Math.abs(noise(i * 0.9 + t * 1.7, seed))) * (1 + u * 0.6);
    const hh = Math.max(1.2, len / n * 0.55);
    g.globalAlpha = a * Math.pow(1 - u, 1.3) * (0.55 + 0.45 * Math.sin(i * 2.3 + t * 3 + seed));
    g.drawImage(spr, x - ww + noise(t * 0.8 + i, seed + 3) * w * 0.25, yy - hh, ww * 2, hh * 2);
  }
  g.restore();
}

// out-of-focus city lights (bokeh discs with a brighter rim, like a real lens)
function bokehSprite(color) {
  return K.sprite("f03bokeh:" + color, 64, 64, (s) => {
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

// ---- the street (shots 1 and 7): a real perspective projection painted once ----------------------
const VPX = 480, VPY = 262, F = 520, EYE = 1.6;
const P = (X, Y, Z) => [VPX + (X / Z) * F, VPY + ((EYE - Y) / Z) * F];
const hz = (z) => clamp(1 - Math.exp(-z / 55), 0, 0.92); // atmospheric perspective amount

const LAMPS = [];
for (let z = 5; z < 100; z += 8.5) { LAMPS.push([-4.7, z]); LAMPS.push([4.7, z + 4]); }
const SHOPS = []; // lit shop windows (for reflections): [X, z, color]
let CAFE = null;

function buildings(side) {
  const R = K.rng("f03b" + side);
  const out = [];
  let z = 2.2;
  while (z < 108) {
    const w = 5 + R() * 6;
    out.push({ z0: z, z1: z + w, h: 7.5 + R() * 7.5, col: ["#4a3436", "#3b3a46", "#54433c", "#33404e", "#5b4740", "#463a4a"][Math.floor(R() * 6)], R: R(), shop: ["#7a2a2a", "#26503e", "#2a3a6a", "#6a4a20", "#4a2a5a"][Math.floor(R() * 5)] });
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

function paintFacade(s, side, b) {
  const X = side * 6.5;
  const k = hz((b.z0 + b.z1) / 2);
  const wall = mix(b.col, FOG, k);
  // front face toward the camera (only visible above shorter, nearer buildings)
  const fx = side * 22;
  quad(s, P(X, 0, b.z0), P(X, b.h, b.z0), P(fx, b.h, b.z0), P(fx, 0, b.z0), mix(shade(b.col, -0.3), FOG, k));
  // the facade plane, lit faintly by the sky from above
  const a = P(X, 0, b.z0), bb = P(X, b.h, b.z0), c = P(X, b.h, b.z1), d = P(X, 0, b.z1);
  const gr = s.createLinearGradient(0, bb[1], 0, a[1]);
  gr.addColorStop(0, mix(shade(wall, 0.12), "#6a7aa0", 0.18));
  gr.addColorStop(1, shade(wall, -0.25));
  quad(s, a, bb, c, d, gr);
  // brick courses (near buildings only)
  if (b.z0 < 30) {
    s.strokeStyle = rgba(shade(wall, -0.45), 0.35);
    s.lineWidth = 0.6;
    s.beginPath();
    for (let y = 3.2; y < b.h; y += 0.32) {
      const p0 = P(X, y, b.z0), p1 = P(X, y, b.z1);
      s.moveTo(p0[0], p0[1]); s.lineTo(p1[0], p1[1]);
    }
    s.stroke();
  }
  // cornice
  quad(s, P(X, b.h - 0.5, b.z0), P(X, b.h, b.z0), P(X, b.h, b.z1), P(X, b.h - 0.5, b.z1), mix(shade(wall, 0.25), FOG, k * 0.5));
  // cornice detail: shadow under the projecting moulding, a row of brackets; a string course over the shop
  quad(s, P(X, b.h - 0.8, b.z0), P(X, b.h - 0.5, b.z0), P(X, b.h - 0.5, b.z1), P(X, b.h - 0.8, b.z1), rgba("#05070c", 0.4 * (1 - k)));
  if (b.z0 < 40) for (let z = b.z0 + 0.2; z < b.z1 - 0.1; z += 0.55) quad(s, P(X, b.h - 0.95, z), P(X, b.h - 0.5, z), P(X, b.h - 0.5, z + 0.16), P(X, b.h - 0.95, z + 0.16), mix(shade(wall, 0.18), FOG, k * 0.5));
  quad(s, P(X, 3.55, b.z0), P(X, 3.8, b.z0), P(X, 3.8, b.z1), P(X, 3.55, b.z1), mix(shade(wall, 0.22), FOG, k * 0.6));
  quad(s, P(X, 3.5, b.z0), P(X, 3.55, b.z0), P(X, 3.55, b.z1), P(X, 3.5, b.z1), rgba("#05070c", 0.4 * (1 - k)));
  // upper windows
  const R = K.rng("f03w" + side + ":" + b.z0.toFixed(2));
  for (let y = 4; y + 1.8 < b.h - 0.6; y += 3.1) {
    for (let z = b.z0 + 0.9; z + 1.0 < b.z1 - 0.4; z += 1.9) {
      const on = R() < 0.3;
      const p = [P(X, y, z), P(X, y + 1.7, z), P(X, y + 1.7, z + 1.0), P(X, y, z + 1.0)];
      let fill;
      if (on) {
        const wc = mix(R() > 0.5 ? WARM : "#ffd9a6", FOG, k * 0.7);
        const wg = s.createLinearGradient(0, p[1][1], 0, p[0][1]);
        wg.addColorStop(0, mix(wc, "#fff4dc", 0.3));
        wg.addColorStop(1, shade(wc, -0.25));
        fill = wg;
      } else fill = mix(mix("#1a2640", "#3a4c70", R() * 0.6), FOG, k);
      quad(s, p[0], p[1], p[2], p[3], fill);
      // sill + frame
      const q = [P(X, y - 0.12, z - 0.1), P(X, y, z - 0.1), P(X, y, z + 1.1), P(X, y - 0.12, z + 1.1)];
      quad(s, q[0], q[1], q[2], q[3], mix("#8a8a92", FOG, k));
      if (on) { s.fillStyle = rgba("#3a2010", 0.35); const m = P(X, y, z + 0.18), n = P(X, y + 1.7, z + 0.3); s.fillRect(m[0], n[1], Math.max(0.8, n[0] - m[0]), m[1] - n[1]); }
    }
  }
  // ground-floor shopfront
  const sz0 = b.z0 + 0.5, sz1 = b.z1 - 0.5;
  const g0 = P(X, 0.45, sz0), g1 = P(X, 2.8, sz0), g2 = P(X, 2.8, sz1), g3 = P(X, 0.45, sz1);
  if (b.lit) {
    const base = b.cafe ? "#e0709a" : mix(WARM, "#c8783a", b.R * 0.6);
    const sg = s.createLinearGradient(0, g1[1], 0, g0[1]);
    sg.addColorStop(0, mix(mix(base, "#fff0d8", 0.35), FOG, k * 0.6));
    sg.addColorStop(0.5, mix(shade(base, -0.12), FOG, k * 0.6));
    sg.addColorStop(1, mix(shade(base, -0.45), FOG, k * 0.6));
    quad(s, g0, g1, g2, g3, sg);
    // interior: shelves, displays and the odd shopper as dark shapes against the light
    const Ri = K.rng("f03in" + b.z0.toFixed(2));
    for (let i = 0; i < 3; i++) {
      const y = 0.75 + i * 0.62;
      quad(s, P(X, y, sz0), P(X, y + 0.1, sz0), P(X, y + 0.1, sz1), P(X, y, sz1), rgba("#2a160c", 0.45 * (1 - k)));
    }
    for (let z = sz0 + 0.3; z < sz1 - 0.3; z += 0.35 + Ri() * 0.5) {
      const hh = 0.5 + Ri() * 1.3;
      quad(s, P(X, 0.45, z), P(X, 0.45 + hh, z), P(X, 0.45 + hh, z + 0.18), P(X, 0.45, z + 0.18), rgba("#2a160c", (0.08 + Ri() * 0.14) * (1 - k)));
    }
    // glass sheen: a cool diagonal reflection of the sky
    quad(s, P(X, 2.8, sz0), P(X, 2.8, lerp(sz0, sz1, 0.3)), P(X, 0.45, lerp(sz0, sz1, 0.55)), P(X, 0.45, lerp(sz0, sz1, 0.25)), rgba("#9fb4e0", 0.12 * (1 - k)));
    if (k < 0.6 && !b.cafe) {
      // goods on the shelves, catching the light; pendant lamps hanging inside as small hot points
      for (let i = 0; i < 3; i++) {
        const y = 0.85 + i * 0.62;
        for (let z = sz0 + 0.15; z < sz1 - 0.2; z += 0.22 + Ri() * 0.2) {
          const col = ["#c84a3a", "#e8d8a0", "#3a7a5a", "#2a4a8a", "#f0a040", "#ffffff"][Math.floor(Ri() * 6)];
          const hh = 0.14 + Ri() * 0.16;
          quad(s, P(X, y + 0.1, z), P(X, y + 0.1 + hh, z), P(X, y + 0.1 + hh, z + 0.12), P(X, y + 0.1, z + 0.12), rgba(mix(col, base, 0.35), 0.8 * (1 - k)));
        }
      }
      for (let z = sz0 + 0.8; z < sz1 - 0.5; z += 2.2) {
        const q = P(X * 1.02, 2.45, z), q2 = P(X * 1.02, 2.8, z);
        s.strokeStyle = rgba("#1a0e08", 0.6 * (1 - k)); s.lineWidth = 0.6;
        s.beginPath(); s.moveTo(q2[0], q2[1]); s.lineTo(q[0], q[1]); s.stroke();
        s.fillStyle = rgba("#fff6e0", 0.95 * (1 - k)); s.beginPath(); s.arc(q[0], q[1], Math.max(0.7, (0.08 / z) * F), 0, TAU); s.fill();
      }
    }
  } else quad(s, g0, g1, g2, g3, mix("#121a2a", FOG, k));
  // mullions
  for (let z = sz0; z <= sz1 + 0.01; z += (sz1 - sz0) / 3) {
    quad(s, P(X, 0.45, z - 0.06), P(X, 2.8, z - 0.06), P(X, 2.8, z + 0.06), P(X, 0.45, z + 0.06), mix("#1c1a20", FOG, k));
  }
  // awning sloping out over the pavement
  const ax = side * 5.2;
  const ag = s.createLinearGradient(0, P(X, 3.4, b.z0)[1], 0, P(ax, 2.85, b.z0)[1]);
  const ac = b.cafe ? "#b8325e" : b.shop;
  ag.addColorStop(0, mix(shade(ac, -0.3), FOG, k));
  ag.addColorStop(1, mix(ac, FOG, k));
  quad(s, P(X, 3.4, b.z0 + 0.2), P(X, 3.4, b.z1 - 0.2), P(ax, 2.85, b.z1 - 0.2), P(ax, 2.85, b.z0 + 0.2), ag);
  // awning stripes for the café
  if (b.cafe) {
    for (let z = b.z0 + 0.2; z < b.z1 - 0.3; z += 0.6) {
      quad(s, P(X, 3.4, z), P(X, 3.4, z + 0.3), P(ax, 2.85, z + 0.3), P(ax, 2.85, z), rgba("#f6e6ee", 0.55));
    }
  }
  // awning front lip (its light underside)
  quad(s, P(ax, 2.85, b.z0 + 0.2), P(ax, 2.6, b.z0 + 0.2), P(ax, 2.6, b.z1 - 0.2), P(ax, 2.85, b.z1 - 0.2), mix(shade(ac, 0.15), FOG, k));
}

function paintStreet(s) {
  // sky
  const sk = s.createLinearGradient(0, 0, 0, VPY + 20);
  sk.addColorStop(0, SKY_TOP);
  sk.addColorStop(0.45, SKY_MID);
  sk.addColorStop(0.8, SKY_LOW);
  sk.addColorStop(1, HORIZON);
  s.fillStyle = sk;
  s.fillRect(0, 0, LW, LH);
  // soft rain clouds
  const R = K.rng("f03sky");
  for (let i = 0; i < 18; i++) {
    const x = R() * LW, y = R() * 150, r = 60 + R() * 120;
    const gr = s.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(i % 3 ? "#0a1426" : "#3a4a6a", 0.35));
    gr.addColorStop(1, rgba("#0a1426", 0));
    s.fillStyle = gr;
    s.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // the clock tower at the far end of the street
  const tz = 118, tw = 3.6;
  const tc = mix("#2a3550", FOG, 0.55);
  quad(s, P(-tw, 0, tz), P(-tw, 40, tz), P(tw, 40, tz), P(tw, 0, tz), tc);
  quad(s, P(-tw - 0.5, 40, tz), P(-tw - 0.5, 41.2, tz), P(tw + 0.5, 41.2, tz), P(tw + 0.5, 40, tz), mix(tc, "#000", 0.15));
  s.fillStyle = mix(tc, "#000", 0.1);
  s.beginPath();
  const r0 = P(-tw - 0.3, 41.2, tz), r1 = P(0, 52, tz), r2 = P(tw + 0.3, 41.2, tz);
  s.moveTo(r0[0], r0[1]); s.lineTo(r1[0], r1[1]); s.lineTo(r2[0], r2[1]); s.fill();
  // belfry arches
  for (const ox of [-1.8, 0, 1.8]) {
    const a = P(ox - 0.6, 35.5, tz), b = P(ox + 0.6, 38.6, tz);
    s.fillStyle = mix("#141c30", FOG, 0.45);
    s.fillRect(a[0], b[1], b[0] - a[0], a[1] - b[1]);
  }
  // clock face (glow added per frame)
  const cf = P(0, 30.5, tz);
  const cr = (2.4 / tz) * F;
  const fg = s.createRadialGradient(cf[0], cf[1], 0, cf[0], cf[1], cr);
  fg.addColorStop(0, "#fff6dc");
  fg.addColorStop(0.85, "#ffe6b0");
  fg.addColorStop(1, "#c9a060");
  s.fillStyle = fg;
  s.beginPath(); s.arc(cf[0], cf[1], cr, 0, Math.PI * 2); s.fill();
  s.strokeStyle = "rgba(60,40,20,0.8)";
  s.lineWidth = 0.9;
  s.beginPath();
  s.moveTo(cf[0], cf[1]); s.lineTo(cf[0] + cr * 0.15, cf[1] - cr * 0.7);
  s.moveTo(cf[0], cf[1]); s.lineTo(cf[0] + cr * 0.55, cf[1] + cr * 0.2);
  s.stroke();
  // the square at the end: a row of facades facing the camera
  const R2 = K.rng("f03end");
  for (let x = -26; x < 26;) {
    const w = 4 + R2() * 6, h = 9 + R2() * 7;
    if (Math.abs(x + w / 2) < tw + 1 && h > 12) { x += w; continue; }
    const c = mix(["#3a3448", "#2e3a4a", "#463a40"][Math.floor(R2() * 3)], FOG, 0.7);
    quad(s, P(x, 0, 124), P(x, h, 124), P(x + w, h, 124), P(x + w, 0, 124), c);
    for (let y = 3; y < h - 1; y += 3) for (let wx = x + 0.6; wx < x + w - 0.8; wx += 1.6) {
      if (R2() < 0.35) { const a = P(wx, y, 124), b = P(wx + 0.8, y + 1.4, 124); s.fillStyle = mix(WARM, FOG, 0.5); s.fillRect(a[0], b[1], b[0] - a[0], a[1] - b[1]); }
    }
    x += w;
  }
  // ground: wet asphalt-and-cobble road reflecting the sky, pavements, kerbs
  const road = s.createLinearGradient(0, VPY, 0, LH);
  road.addColorStop(0, mix(HORIZON, "#2a3448", 0.35));
  road.addColorStop(0.12, "#2d3850");
  road.addColorStop(0.5, "#161d2c");
  road.addColorStop(1, "#0c111b");
  quad(s, P(-6.5, 0, 1.2), P(-6.5, 0, 124), P(6.5, 0, 124), P(6.5, 0, 1.2), road);
  // cobbles: rows in perspective, each stone a domed ellipse with a sky sheen on top
  for (let z = 2.2; z < 44; z *= 1.045) {
    const Rz = K.rng("f03c" + z.toFixed(3));
    const rowOff = Rz() * 0.3;
    for (let X = -4 + rowOff; X < 4; X += 0.32) {
      const c = P(X + 0.16, 0, z);
      const rw = (0.14 / z) * F, rh = rw * (EYE / z) * 0.9 + 0.2;
      if (rw < 0.5) continue;
      s.fillStyle = mix("#101622", "#222c40", Rz());
      s.beginPath(); s.ellipse(c[0], c[1], rw, Math.max(0.4, rh), 0, 0, Math.PI * 2); s.fill();
      s.fillStyle = rgba("#7a8ab0", 0.08 + 0.1 * Rz());
      s.beginPath(); s.ellipse(c[0], c[1] - rh * 0.3, rw * 0.7, Math.max(0.3, rh * 0.45), 0, 0, Math.PI * 2); s.fill();
    }
  }
  // standing water in the dips of the road: shallow puddles mirror the sky glow (lamps added per frame)
  const Rp = K.rng("f03pud");
  for (let i = 0; i < 16; i++) {
    const z = 3 + Rp() * 34, X = (Rp() - 0.5) * 6.4, wz = 0.25 + Rp() * 0.7;
    const c = P(X, 0, z), rw = (wz / z) * F, rh = rw * (EYE / z) * 0.5 + 0.5;
    const pg = s.createLinearGradient(0, c[1] - rh, 0, c[1] + rh);
    pg.addColorStop(0, mix(HORIZON, SKY_LOW, 0.4));
    pg.addColorStop(1, mix(SKY_MID, "#101828", 0.4));
    s.globalAlpha = 0.38;
    s.fillStyle = pg;
    s.beginPath(); s.ellipse(c[0], c[1], rw, rh, 0, 0, TAU); s.fill();
    s.globalAlpha = 1;
    s.strokeStyle = "rgba(200,215,240,0.2)"; s.lineWidth = 0.7;
    s.beginPath(); s.ellipse(c[0], c[1], rw, rh, 0, Math.PI, TAU); s.stroke();
  }
  for (const sd of [-1, 1]) {
    const pv = s.createLinearGradient(0, VPY, 0, LH);
    pv.addColorStop(0, mix("#4a5470", FOG, 0.4));
    pv.addColorStop(1, "#1e2432");
    quad(s, P(sd * 4, 0.15, 1.2), P(sd * 4, 0.15, 124), P(sd * 6.5, 0.15, 124), P(sd * 6.5, 0.15, 1.2), pv);
    // paving slab joints
    s.strokeStyle = "rgba(10,14,22,0.45)";
    s.lineWidth = 0.7;
    s.beginPath();
    for (let z = 2; z < 60; z += 1.2) { const a = P(sd * 4, 0.15, z), b = P(sd * 6.5, 0.15, z); s.moveTo(a[0], a[1]); s.lineTo(b[0], b[1]); }
    s.stroke();
    // kerb face + lit top edge
    quad(s, P(sd * 4, 0, 1.2), P(sd * 4, 0.15, 1.2), P(sd * 4, 0.15, 124), P(sd * 4, 0, 124), "#262c3a");
    s.strokeStyle = "rgba(170,185,215,0.35)";
    s.lineWidth = 1;
    s.beginPath(); const k0 = P(sd * 4, 0.15, 1.6), k1 = P(sd * 4, 0.15, 124); s.moveTo(k0[0], k0[1]); s.lineTo(k1[0], k1[1]); s.stroke();
  }
  // buildings, far to near, both sides
  const all = [];
  for (const sd of [-1, 1]) for (const b of BLD[sd]) all.push([sd, b]);
  all.sort((a, b) => b[1].z0 - a[1].z0);
  for (const [sd, b] of all) paintFacade(s, sd, b);
  // café blade sign (faces the camera, so the lettering reads)
  const cz = CAFE.z0 + 1.2;
  const s0 = P(6.5 - 1.9, 6.7, cz), s1 = P(6.5 - 0.1, 5.4, cz);
  s.fillStyle = "#1a0d18";
  s.fillRect(s0[0], s0[1], s1[0] - s0[0], s1[1] - s0[1]);
  // lamp posts (heads glow per frame)
  for (const [X, z] of LAMPS) {
    const k = hz(z);
    const b = P(X, 0, z), top = P(X, 4.6, z);
    const w = Math.max(0.7, (0.12 / z) * F);
    s.fillStyle = mix("#141820", FOG, k * 0.8);
    s.fillRect(b[0] - w / 2, top[1], w, b[1] - top[1]);
    const arm = P(X - Math.sign(X) * 0.6, 4.7, z);
    s.strokeStyle = s.fillStyle;
    s.lineWidth = w * 0.7;
    s.beginPath(); s.moveTo(top[0], top[1]); s.quadraticCurveTo(top[0], arm[1] - w, arm[0], arm[1]); s.stroke();
    const hw = (0.35 / z) * F;
    s.beginPath();
    s.moveTo(arm[0] - hw, arm[1] + hw * 0.5); s.lineTo(arm[0] + hw, arm[1] + hw * 0.5); s.lineTo(arm[0] + hw * 0.5, arm[1] - hw * 0.3); s.lineTo(arm[0] - hw * 0.5, arm[1] - hw * 0.3);
    s.fill();
  }
}

function streetLights(g, t, amt = 1) {
  // clock face + lamps + shops: glow, wet-road reflections
  const cf = P(0, 30.5, 118);
  // the wet road mirrors the bright horizon and the clock face down its middle
  reflStreak(g, VPX, VPY + 6, 230, 70, "#6a7aa4", 0.22 * amt, t, 1);
  reflStreak(g, cf[0], VPY + 10, 120, 6, "#ffe8b8", 0.35 * amt, t, 2);
  glow(g, cf[0], cf[1], 44, "#ffe8b8", 0.5 * amt);
  glow(g, cf[0], cf[1], 120, "#c9b8a0", 0.2 * amt);
  for (const [X, z] of LAMPS) {
    const k = hz(z);
    const h = P(X - Math.sign(X) * 0.6, 4.55, z);
    const r = (1.6 / z) * F;
    const fl = 1 - 0.25 * (Math.sin(t * 13 + z) * Math.sin(t * 5.1 + z * 2) > 0.85 ? 1 : 0) * (z > 40 && z < 50 ? 1 : 0);
    glow(g, h[0], h[1], r * 2.4, LAMP, 0.45 * (1 - k * 0.5) * amt * fl);
    glow(g, h[0], h[1], r * 0.45, "#fff2d8", 0.9 * amt * fl);
    // pool of light on the pavement
    const pool = P(X - Math.sign(X) * 0.6, 0.15, z);
    g.save();
    g.translate(pool[0], pool[1]);
    g.scale(1, 0.22);
    glow(g, 0, 0, (2.6 / z) * F, LAMP, 0.32 * (1 - k * 0.6) * amt * fl);
    g.restore();
    // reflection streak on the wet road / pavement
    if (z < 70) reflStreak(g, h[0], pool[1] + 2, Math.min(260, (8 / z) * F + 10), r * 0.4 + 1.5, LAMP, 0.7 * (1 - k) * amt * fl, t, z);
  }
  for (const [X, z, c] of SHOPS) {
    const k = hz(z);
    const p = P(X * 0.98, 1.6, z);
    glow(g, p[0], p[1], (3.2 / z) * F, c, 0.22 * (1 - k * 0.7) * amt);
    const f = P(X * 0.8, 0, z);
    reflStreak(g, lerp(p[0], f[0], 0.4), f[1], Math.min(160, (4 / z) * F), (1.0 / z) * F, c, 0.2 * (1 - k) * amt, t, z + 9);
  }
  // wet glints: specular pinpoints on the cobbles that twinkle as the drops hit them
  for (let i = 0; i < 48; i++) {
    const z = 3 + Math.pow(hash(i, 201), 1.6) * 30, X = (hash(i, 202) - 0.5) * 7.6;
    const tw = Math.pow(Math.max(0, Math.sin(t * (2 + hash(i, 203) * 3) + i * 1.7)), 12);
    if (tw < 0.05) continue;
    const q = P(X, 0, z), r = (0.6 + 7 / z) * tw;
    const col = hash(i, 204) > 0.4 ? "#ffe2b0" : "#cfe0ff";
    g.fillStyle = rgba(col, 0.85 * tw * amt);
    g.fillRect(q[0] - r * 2.5, q[1] - 0.4, r * 5, 0.8);
    g.fillRect(q[0] - 0.4, q[1] - r * 1.4, 0.8, r * 2.8);
    glow(g, q[0], q[1], r * 3, col, 0.45 * tw * amt);
  }
  // the café's pink neon
  const cz = CAFE.z0 + 1.2;
  const s0 = P(6.5 - 1.9, 6.7, cz), s1 = P(6.5 - 0.1, 5.4, cz);
  const buzz = 0.82 + 0.18 * (Math.sin(t * 31) > 0.2 ? 1 : 0.4) * (Math.sin(t * 1.3) > -0.7 ? 1 : 0.3);
  const cx = (s0[0] + s1[0]) / 2, cy = (s0[1] + s1[1]) / 2, sw = s1[0] - s0[0];
  g.save();
  g.font = `600 ${Math.max(6, sw * 0.17)}px "Segoe Script", "Brush Script MT", cursive`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = NEON;
  g.shadowBlur = 8;
  g.fillStyle = mix(NEON, "#ffffff", 0.55);
  g.globalAlpha = buzz * amt;
  g.fillText("The", cx, cy - sw * 0.16);
  g.fillText("Purrcolator", cx, cy + sw * 0.1);
  g.restore();
  glow(g, cx, cy, sw * 1.6, NEON, 0.45 * buzz * amt);
  const cp = P(6.3, 1.6, (CAFE.z0 + CAFE.z1) / 2);
  glow(g, cp[0], cp[1], 70, NEON, 0.25 * amt);
  reflStreak(g, cx, P(4.5, 0, cz)[1], 120, sw * 0.4, NEON, 0.35 * buzz * amt, t, 77);
}

// distant pedestrians with umbrellas (silhouettes), for life
function pedestrians(g, t) {
  const peds = [[-5.4, 30, 0.9, 1], [5.6, 46, -0.7, 2], [-5.2, 62, 0.6, 3], [5.3, 22, 0.5, 4]];
  for (const [X, z0, v, sd] of peds) {
    const z = z0 + v * t * 0.6 * (sd % 2 ? 1 : -1);
    if (z < 6) continue;
    const k = hz(z);
    const b = P(X, 0.15, z);
    const h = (1.7 / z) * F;
    const c = mix("#0e121c", FOG, k * 0.85);
    const bob = Math.abs(Math.sin(t * 5 + sd)) * h * 0.015;
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(b[0], b[1] - h * 0.55 - bob, h * 0.13, h * 0.32, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(b[0] - h * 0.07, b[1] - h * 0.3, h * 0.05, h * 0.3);
    g.fillRect(b[0] + h * 0.02, b[1] - h * 0.3, h * 0.05, h * 0.3);
    g.beginPath();
    g.ellipse(b[0], b[1] - h * 0.98 - bob, h * 0.36, h * 0.16, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.strokeStyle = c;
    g.lineWidth = Math.max(0.6, h * 0.02);
    g.beginPath(); g.moveTo(b[0], b[1] - h * 0.98 - bob); g.lineTo(b[0], b[1] - h * 0.6); g.stroke();
  }
}

function litRain(g, t, pts, density) {
  // rain is only really visible where it is backlit: brighter streaks inside the lamp halos
  g.save();
  g.beginPath();
  for (const [x, y, r] of pts) { g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); }
  g.clip();
  K.rain(g, LW, LH, t, { density, angle: 0.08, color: "rgba(255,214,160,0.55)", speed: 820, len: 22, seed: 21 });
  g.restore();
}

function shotStreet(g, t, lt, o = {}) {
  const st = K.sprite("f03street", LW, LH, paintStreet);
  g.drawImage(st, 0, 0, LW, LH);
  pedestrians(g, t);
  // drifting mist down the street
  K.fog(g, LW, LH, { y: VPY - 10, h: 120, color: "#8a96b8", alpha: 0.3, t, seed: 3 });
  streetLights(g, t);
  if (o.extra) o.extra(g);
  const halos = [];
  for (const [X, z] of LAMPS) if (z < 40) { const h = P(X - Math.sign(X) * 0.6, 4.5, z); halos.push([h[0], h[1] + (1.4 / z) * F, (2.4 / z) * F]); }
  litRain(g, t, halos, 1.4);
  K.rain(g, LW, LH, t, { density: 0.35, angle: 0.08, color: "rgba(170,190,225,0.32)", speed: 800, seed: 5 });
  K.splashes(g, LW, LH, t, { y0: VPY + 40, y1: LH, density: 0.5, color: "rgba(190,205,235,0.45)" });
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
  crayon(s, "ORANGE TABBY. BENT EAR.", w / 2, h * 0.76, w * 0.06, "#2a3a6a", 3);
  crayon(s, "RED COLLAR.", w / 2, h * 0.84, w * 0.06, "#2a3a6a", 4);
  crayon(s, "PLEASE HELP", w / 2, h * 0.93, w * 0.065, "#c0392b", 5);
}

function paintBokehBg(s) {
  const gr = s.createLinearGradient(0, 0, 0, LH);
  gr.addColorStop(0, "#0d1830");
  gr.addColorStop(0.6, "#1a2a48");
  gr.addColorStop(1, "#101622");
  s.fillStyle = gr;
  s.fillRect(0, 0, LW, LH);
  const R = K.rng("f03bk");
  // a soft blurred street: building masses, a glowing shop band, then bokeh
  if (K.hasFilter()) s.filter = "blur(14px)";
  for (let i = 0; i < 9; i++) {
    const x = i * 120 - 40 + R() * 40, h = 180 + R() * 160;
    s.fillStyle = mix("#0a1222", "#1a2238", R());
    s.fillRect(x, 0, 130, h);
  }
  const band = s.createLinearGradient(0, 260, 0, 420);
  band.addColorStop(0, "rgba(255,170,90,0)");
  band.addColorStop(0.5, "rgba(255,170,90,0.22)");
  band.addColorStop(1, "rgba(255,170,90,0)");
  s.fillStyle = band;
  s.fillRect(0, 260, LW, 160);
  s.filter = "none";
  for (let i = 0; i < 30; i++) {
    const x = R() * LW, y = 150 + R() * 260, r = 8 + Math.pow(R(), 2) * 40;
    const c = R() > 0.85 ? NEON : R() > 0.25 ? WARM : "#9fb4e0";
    s.globalCompositeOperation = "lighter";
    s.globalAlpha = 0.12 + R() * 0.28;
    s.drawImage(bokehSprite(c), x - r, y - r, r * 2, r * 2);
  }
  s.globalAlpha = 1;
  s.globalCompositeOperation = "source-over";
}

// the raincoat cuff over the wrist (in drawHand's local frame): a turned-back hem with a wet top edge
function wetCuff(g, x, y, size, ang, left) {
  const u = size / 100;
  g.save();
  g.translate(x, y);
  g.rotate(ang + Math.PI / 2);
  g.scale((left ? -1 : 1) * u, u);
  const cg = g.createLinearGradient(-28, 0, 30, 0);
  cg.addColorStop(0, "#8a6a10"); cg.addColorStop(0.45, "#f0c63a"); cg.addColorStop(1, "#7a5c0c");
  g.fillStyle = cg;
  g.beginPath(); g.moveTo(-27, 30); g.quadraticCurveTo(0, 22, 29, 30); g.lineTo(30, 46); g.quadraticCurveTo(0, 38, -28, 46); g.closePath(); g.fill();
  g.strokeStyle = "rgba(90,60,0,0.6)"; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(-27, 46); g.quadraticCurveTo(0, 38, 30, 46); g.stroke();
  g.strokeStyle = "rgba(255,244,200,0.75)"; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(-20, 28); g.quadraticCurveTo(0, 22.5, 22, 28); g.stroke();
  g.fillStyle = "rgba(235,245,255,0.8)";
  for (const [dx, dy] of [[-12, 36], [8, 33], [18, 40]]) { g.beginPath(); g.ellipse(dx, dy, 1.6, 2.2, 0, 0, TAU); g.fill(); }
  g.restore();
}
function shotPoster(g, t, lt) {
  const bk = K.sprite("f03bokehbg", LW, LH, paintBokehBg);
  const drift = lt * 3;
  g.drawImage(bk, -20 - drift, -10, LW + 40, LH + 20);
  // living bokeh: a car's headlights pass far behind
  const cx = lerp(-200, 1200, seg(lt, 2, 7.5));
  bokeh(g, cx, 330, 34, "#fff2d8", 0.35 * K.env(lt, 2, 7.5, 0.6, 0.6));
  bokeh(g, cx + 70, 334, 34, "#fff2d8", 0.35 * K.env(lt, 2, 7.5, 0.6, 0.6));
  K.rain(g, LW, LH, t, { density: 0.5, angle: 0.06, color: "rgba(200,215,240,0.25)", seed: 31, len: 40 });
  // the lamppost: a painted iron column, key light from the lamp above-right
  const px = 520;
  const pg = g.createLinearGradient(px - 46, 0, px + 46, 0);
  pg.addColorStop(0, "#0c140f");
  pg.addColorStop(0.3, "#1f3326");
  pg.addColorStop(0.62, "#3b5a44");
  pg.addColorStop(0.72, "#7f9a84");
  pg.addColorStop(0.8, "#2a4232");
  pg.addColorStop(1, "#0a100c");
  g.fillStyle = pg;
  g.fillRect(px - 46, -20, 92, LH + 40);
  // flutes + rivets, rain running down the post
  g.fillStyle = "rgba(0,0,0,0.25)";
  for (let i = -3; i <= 3; i++) g.fillRect(px + i * 12 - 1, -20, 2, LH + 40);
  g.strokeStyle = "rgba(200,220,255,0.18)";
  g.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const x = px - 30 + hash(i, 4) * 60, y = ((hash(i, 5) * 600 + lt * (30 + hash(i, 6) * 50)) % 640) - 60;
    g.beginPath(); g.moveTo(x, y - 40); g.lineTo(x + 1, y); g.stroke();
    g.fillStyle = "rgba(220,235,255,0.5)";
    g.beginPath(); g.arc(x + 1, y, 1.6, 0, Math.PI * 2); g.fill();
  }
  // older posters on the post, rain-soaked and torn, half in shadow
  posterAt(g, px + 18, 455, 74, 96, 401, 0.06);
  posterAt(g, px - 14, 92, 70, 90, 402, -0.04);
  g.fillStyle = "rgba(8,14,30,0.45)";
  g.fillRect(px - 60, 40, 120, 480);
  // the post's key light: a warm vertical highlight from the lamp above right
  const hl = g.createLinearGradient(0, 0, 0, LH);
  hl.addColorStop(0, "rgba(255,190,120,0.35)");
  hl.addColorStop(1, "rgba(255,190,120,0.05)");
  g.fillStyle = hl;
  g.fillRect(px + 14, -20, 7, LH + 40);
  // our poster arrives with the hands
  const arrive = eio(seg(lt, 0.2, 2.6));
  const pw = 172, ph = 230;
  const pxp = px - pw / 2 + 6, pyp = lerp(330, 190, arrive);
  const tilt = lerp(-0.12, -0.02, arrive);
  const poster = K.sprite("f03poster", pw, ph, paintPoster);
  g.save();
  g.translate(pxp + pw / 2, pyp + ph / 2);
  g.rotate(tilt);
  // cylindrical wrap shading: paper bends round the post
  g.drawImage(poster, -pw / 2, -ph / 2, pw, ph);
  const wrap = g.createLinearGradient(-pw / 2, 0, pw / 2, 0);
  wrap.addColorStop(0, "rgba(10,20,40,0.55)");
  wrap.addColorStop(0.25, "rgba(10,20,40,0.12)");
  wrap.addColorStop(0.62, "rgba(255,230,190,0.08)");
  wrap.addColorStop(0.85, "rgba(10,20,40,0.15)");
  wrap.addColorStop(1, "rgba(10,20,40,0.6)");
  g.fillStyle = wrap;
  g.fillRect(-pw / 2, -ph / 2, pw, ph);
  // night: pull the paper down to the blue-hour ambient, warm on the lamp side
  g.globalCompositeOperation = "multiply";
  g.fillStyle = "#8a96b8";
  g.fillRect(-pw / 2, -ph / 2, pw, ph);
  g.globalCompositeOperation = "source-over";
  // plastic sleeve: sheen + beads of rain
  const sh = g.createLinearGradient(-pw / 2, -ph / 2, pw / 2, ph / 2);
  sh.addColorStop(0, "rgba(255,255,255,0)");
  sh.addColorStop(0.42, "rgba(255,255,255,0.0)");
  sh.addColorStop(0.5, "rgba(255,240,220,0.2)");
  sh.addColorStop(0.58, "rgba(255,255,255,0.0)");
  g.fillStyle = sh;
  g.fillRect(-pw / 2 - 3, -ph / 2 - 3, pw + 6, ph + 6);
  g.strokeStyle = "rgba(220,230,255,0.25)";
  g.lineWidth = 1;
  g.strokeRect(-pw / 2 - 3, -ph / 2 - 3, pw + 6, ph + 6);
  K.glassDrops(g, -pw / 2 - 3, -ph / 2 - 3, pw + 6, ph + 6, lt, { seed: 13, density: 1.6, light: "#ffe6c0" });
  // tape strips appear as the hands press them
  const tapes = [[-pw / 2 + 4, -ph / 2 + 2, -0.5, 4.0], [pw / 2 - 4, -ph / 2 + 2, 0.5, 4.6], [-pw / 2 + 4, ph / 2 - 2, 0.5, 5.6], [pw / 2 - 4, ph / 2 - 2, -0.5, 6.2]];
  for (const [x, y, a, at] of tapes) {
    const k = smooth(seg(lt, at - 0.4, at));
    if (k <= 0) continue;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = `rgba(230,225,200,${0.55 * k})`;
    g.fillRect(-22 * k, -7, 44 * k, 14);
    g.fillStyle = `rgba(255,255,255,${0.25 * k})`;
    g.fillRect(-22 * k, -7, 44 * k, 3);
    g.restore();
  }
  g.restore();
  // lamp light from above right
  glow(g, 760, -40, 380, LAMP, 0.25);
  // hands: right hand smoothing tape, left hand (bell on the wrist) holding the poster
  const hk = eio(seg(lt, 0, 2.4));
  const press = Math.max(0, Math.sin(lt * 2.2)) * 0.5;
  const lhx = lerp(260, 372, hk), lhy = lerp(640, 470, hk);
  const tgt = lt < 5 ? [pxp + 22, pyp + 20] : [pxp + 30, pyp + ph - 10];
  const rk = eio(seg(lt, 1.6, 3.6));
  const rhx = lerp(980, tgt[0] + 150, rk) - press * 6, rhy = lerp(700, tgt[1] + 150, rk) + press * 4;
  // bigger and less tinted, so the knuckles, nails and creases read; wet cuffs; the bell on the left wrist
  tinted(g, "hands", 140, 160, 820, 380, (hg) => {
    K.drawHand(hg, lhx, lhy - 20, 172, { pose: "open", left: true, angle: -1.25, bell: true, t: lt, light: { x: 800, y: 0, color: "#ffcf9a", strength: 1.1 } });
    wetCuff(hg, lhx, lhy - 20, 172, -1.25, true);
    K.drawHand(hg, rhx, rhy, 172, { pose: "point", angle: -2.35, t: lt, light: { x: 800, y: 0, color: "#ffcf9a", strength: 1.1 } });
    wetCuff(hg, rhx, rhy, 172, -2.35, false);
  }, "#1a2440", 0.2);
  // over-the-shoulder: the wet yellow hood edge, out of focus, frame left
  K.focus(g, LW, LH, 9, (f) => {
    // the hood seen from just behind: a dark raincoat curve with a wet specular rim
    const hg = f.createLinearGradient(0, 200, 180, 540);
    hg.addColorStop(0, "#5a4410");
    hg.addColorStop(0.5, "#2e2406");
    hg.addColorStop(1, "#120e02");
    f.fillStyle = hg;
    f.beginPath();
    f.moveTo(-40, 230);
    f.bezierCurveTo(70, 220, 150, 330, 165, LH + 40);
    f.lineTo(-40, LH + 40);
    f.closePath();
    f.fill();
    f.strokeStyle = "rgba(255,214,150,0.45)";
    f.lineWidth = 4;
    f.beginPath();
    f.moveTo(0, 232);
    f.bezierCurveTo(80, 230, 140, 330, 156, LH);
    f.stroke();
    for (let i = 0; i < 5; i++) { f.fillStyle = "rgba(230,240,255,0.5)"; f.beginPath(); f.arc(40 + i * 22, 250 + i * 30 + hash(i, 3) * 20, 2.2, 0, Math.PI * 2); f.fill(); }
  }, "f03hood");
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
}
function posterAt(g, x, y, w, h, seed, rot) {
  const spr = K.sprite("f03op" + seed, 60, 80, (s, ww, hh) => paintOtherPoster(s, ww, hh, seed));
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.fillRect(-w / 2 + 2, -h / 2 + 3, w, h);
  g.drawImage(spr, -w / 2, -h / 2, w, h);
  g.restore();
}
function paintPosterWall(s) {
  // a brick wall seen square-on under blue-hour sky light, a pavement, a Lost & Found board
  const bg = s.createLinearGradient(0, 0, 0, 420);
  bg.addColorStop(0, "#2a2630");
  bg.addColorStop(1, "#3d3236");
  s.fillStyle = bg;
  s.fillRect(0, 0, LW, 420);
  const R = K.rng("f03brick");
  for (let y = 0; y < 420; y += 11) {
    const off = (y / 11) % 2 ? 0 : 14;
    for (let x = -28 + off; x < LW; x += 28) {
      s.fillStyle = mix("#4a3438", "#5e4040", R()) ;
      s.globalAlpha = 0.55 + R() * 0.3;
      s.fillRect(x + 1, y + 1, 26, 9);
    }
  }
  s.globalAlpha = 1;
  // rain-darkened streaks down the wall
  for (let i = 0; i < 30; i++) {
    const x = R() * LW, w = 4 + R() * 18;
    const gr = s.createLinearGradient(0, 0, 0, 420);
    gr.addColorStop(0, "rgba(10,10,20,0.25)");
    gr.addColorStop(1, "rgba(10,10,20,0)");
    s.fillStyle = gr;
    s.fillRect(x, 0, w, 300 + R() * 120);
  }
  // a shop window (dark) on the left, a door on the right
  s.fillStyle = "#121826";
  s.fillRect(40, 170, 220, 190);
  s.strokeStyle = "#2a2a30";
  s.lineWidth = 8;
  s.strokeRect(40, 170, 220, 190);
  s.fillStyle = "#1e1c22";
  s.fillRect(790, 150, 110, 270);
  // Lost & Found board
  // the board: a framed cork panel with its own header plank (lettering sized to fit inside it)
  s.fillStyle = "#3a2a1c";
  s.fillRect(560, 54, 210, 256);
  s.fillStyle = "#26180e";
  s.fillRect(566, 60, 198, 26);
  s.fillStyle = "#8a6a44";
  s.fillRect(570, 92, 190, 210);
  s.fillStyle = "#e8dcc0";
  s.textAlign = "center";
  s.textBaseline = "middle";
  let lfs = 17;
  s.font = `700 ${lfs}px Georgia, serif`;
  while (lfs > 9 && s.measureText("LOST & FOUND").width > 176) { lfs--; s.font = `700 ${lfs}px Georgia, serif`; }
  s.fillText("LOST & FOUND", 665, 74);
  s.textBaseline = "alphabetic";
  const R2 = K.rng("f03board");
  for (let i = 0; i < 16; i++) {
    const x = 590 + (i % 4) * 46 + R2() * 6, y = 115 + Math.floor(i / 4) * 50 + R2() * 6;
    posterAt(s, x, y, 36 + R2() * 8, 46 + R2() * 6, 100 + i, (R2() - 0.5) * 0.3);
  }
  // posters plastered over the wall, window and drainpipe
  const R3 = K.rng("f03wall");
  for (let i = 0; i < 34; i++) {
    let x = R3() * LW, y = 30 + R3() * 320;
    if (x > 550 && x < 780 && y < 320) continue;
    posterAt(s, x, y, 30 + R3() * 22, 40 + R3() * 26, 200 + i, (R3() - 0.5) * 0.35);
  }
  // drain pipe
  s.fillStyle = "#24262e";
  s.fillRect(500, 0, 14, 420);
  s.fillStyle = "rgba(160,180,220,0.2)";
  s.fillRect(508, 0, 2, 420);
  // pavement + kerb, wet
  const pv = s.createLinearGradient(0, 410, 0, LH);
  pv.addColorStop(0, "#3a4258");
  pv.addColorStop(1, "#141a26");
  s.fillStyle = pv;
  s.fillRect(0, 410, LW, LH - 410);
  s.strokeStyle = "rgba(0,0,0,0.35)";
  s.lineWidth = 1;
  for (let x = -200; x < LW + 200; x += 90) { s.beginPath(); s.moveTo(x, 410); s.lineTo(x - (x - 480) * 0.6, LH); s.stroke(); }
  for (const y of [436, 470, 520]) { s.beginPath(); s.moveTo(0, y); s.lineTo(LW, y); s.stroke(); }
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
  for (let i = 0; i < posters; i++) posterAt(g, x + (hash(i, seed) - 0.5) * w * 0.5, yb - h * (0.3 + i * 0.13), w * 2.0, w * 2.6, 300 + seed * 10 + i, (hash(i + 0.4, seed) - 0.5) * 0.25);
}
function shotReveal(g, t, lt) {
  // a true pull back: from the one new poster on our post, out to the whole wall of them
  const p = eio(seg(lt, 0.2, 8.4));
  const zoom = lerp(2.3, 1.0, p);
  K.withCamera(g, LW, LH, { x: lerp(336, 480, p), y: lerp(236, 270, p), zoom, shakeT: t, shakeAmt: 1 }, (c) => {
    c.drawImage(K.sprite("f03wall", LW, LH, paintPosterWall), 0, 0, LW, LH);
    // light falloff: the lamp lights a pool of wall, the rest sinks into blue dusk
    const dk = c.createRadialGradient(330, 170, 40, 360, 230, 720);
    dk.addColorStop(0, "rgba(6,10,24,0)");
    dk.addColorStop(0.45, "rgba(6,10,24,0.35)");
    dk.addColorStop(1, "rgba(6,10,24,0.72)");
    c.fillStyle = dk;
    c.fillRect(-100, -100, LW + 200, LH + 200);
    // the lamp's pool on the wall: a warm, soft-edged ellipse that rakes across the bricks
    c.save();
    c.globalCompositeOperation = "lighter";
    c.translate(330, 150);
    c.scale(1.25, 1);
    const wp = c.createRadialGradient(0, 0, 10, 0, 0, 260);
    wp.addColorStop(0, "rgba(255,170,90,0.2)");
    wp.addColorStop(0.55, "rgba(255,150,80,0.08)");
    wp.addColorStop(1, "rgba(255,150,80,0)");
    c.fillStyle = wp;
    c.fillRect(-260, -260, 520, 520);
    c.restore();
    c.save();
    c.translate(880, 120); c.scale(1.1, 1);
    const wp2 = c.createRadialGradient(0, 0, 6, 0, 0, 170);
    wp2.addColorStop(0, "rgba(255,170,90,0.14)"); wp2.addColorStop(1, "rgba(255,150,80,0)");
    c.globalCompositeOperation = "lighter";
    c.fillStyle = wp2; c.fillRect(-170, -170, 340, 340);
    c.restore();
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
    // the wall is lit by our lamppost and a second one further along
    glow(c, 330, 40, 420, LAMP, 0.28);
    glow(c, 880, 60, 260, LAMP, 0.18);
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
    c.drawImage(K.sprite("f03poster", 172, 230, paintPoster), -pw / 2, -ph / 2, pw, ph);
    c.fillStyle = "rgba(40,50,80,0.25)";
    c.fillRect(-pw / 2, -ph / 2, pw, ph);
    c.restore();
    // you: from behind, hood up, looking at the posters
    tinted(c, "kid3", 120, 250, 160, 260, (kg) => {
      K.drawPerson(kg, 205, 505, 200, { view: "back", hood: true, wet: 0.6, bell: true, t: lt, light: { x: 330, y: 40, color: LAMP, strength: 1 } });
    }, "#1c2444", 0.38);
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
  // the hit (24 s): a cold breath of light as the scale lands
  const hit = K.env(t, 24, 25.6, 0.05, 1.4);
  if (hit > 0) { g.fillStyle = `rgba(150,170,220,${0.08 * hit})`; g.fillRect(0, 0, LW, LH); }
}

// ---- shot 4: the café window ------------------------------------------------------------------------
function paintCafeInterior(s) {
  // warm interior seen through the window, already a little soft
  const bg = s.createLinearGradient(0, 0, 0, LH);
  bg.addColorStop(0, "#3a1e1c");
  bg.addColorStop(0.5, "#7a4a32");
  bg.addColorStop(1, "#3a2016");
  s.fillStyle = bg;
  s.fillRect(0, 0, LW, LH);
  // back wall shelves with cups + jars
  for (let r = 0; r < 3; r++) {
    const y = 120 + r * 62;
    s.fillStyle = "#3a2216";
    s.fillRect(160, y, 640, 6);
    const R = K.rng("f03cup" + r);
    for (let x = 175; x < 790; x += 22 + R() * 18) {
      s.fillStyle = mix("#e8dcc8", "#c87a5a", R() * 0.6);
      s.globalAlpha = 0.75;
      s.fillRect(x, y - 16 - R() * 10, 12 + R() * 6, 16 + R() * 10);
    }
    s.globalAlpha = 1;
  }
  // chalk menu board
  s.fillStyle = "#1e2420";
  s.fillRect(640, 60, 160, 110);
  s.fillStyle = "rgba(240,240,230,0.6)";
  s.font = "600 13px \"Segoe Print\", cursive";
  s.fillText("Purr-over  3", 655, 92);
  s.fillText("Mew-cha    4", 655, 116);
  s.fillText("Hot milk   2", 655, 140);
  // espresso machine
  s.fillStyle = "#6a6a70";
  s.fillRect(220, 250, 150, 90);
  s.fillStyle = "#b8b8c0";
  s.fillRect(228, 256, 134, 10);
  // counter top + front
  const ct = s.createLinearGradient(0, 330, 0, LH);
  ct.addColorStop(0, "#c08a5a");
  ct.addColorStop(0.08, "#5a3220");
  ct.addColorStop(1, "#2a160e");
  s.fillStyle = ct;
  s.fillRect(0, 330, LW, LH - 330);
}
// pre-blurred sprite: painted once on a scratch canvas, then copied through a blur filter
function softSprite(key, w, h, blurPx, paint) {
  return K.sprite(key, w, h, (s) => {
    const T = K.makeCanvas(Math.ceil(w * K.pixelScale()), Math.ceil(h * K.pixelScale()));
    const tg = T.getContext("2d");
    tg.setTransform(K.pixelScale(), 0, 0, K.pixelScale(), 0, 0);
    try { paint(tg, w, h); } catch (err) { console.warn("[f03] soft", key, err); }
    if (K.hasFilter() && blurPx > 0) s.filter = `blur(${(blurPx * K.pixelScale()).toFixed(2)}px)`;
    s.drawImage(T, 0, 0, w, h);
    s.filter = "none";
  });
}
// the window glass (static): condensation, heavier in a band at the bottom where it beads up, with
// clear runs wiped through it by the drops; the frame; the gold-leaf lettering read from outside
function paintCafeGlass(s) {
  const fg = s.createLinearGradient(0, 40, 0, 506);
  fg.addColorStop(0, "rgba(200,190,200,0.34)");
  fg.addColorStop(0.45, "rgba(200,190,200,0.14)");
  fg.addColorStop(0.7, "rgba(200,190,200,0.2)");
  fg.addColorStop(0.82, "rgba(214,204,212,0.5)");
  fg.addColorStop(1, "rgba(220,210,216,0.62)");
  s.fillStyle = fg;
  s.fillRect(60, 40, 840, 466);
  const R = K.rng("f03cond");
  for (let i = 0; i < 1100; i++) {
    const x = 60 + R() * 840, y = 506 - Math.pow(R(), 1.8) * 130, r = 0.5 + R() * 1.6;
    s.fillStyle = "rgba(40,20,20,0.18)";
    s.beginPath(); s.arc(x + 0.4, y + 0.6, r, 0, TAU); s.fill();
    s.fillStyle = "rgba(255,236,226,0.32)";
    s.beginPath(); s.arc(x - r * 0.25, y - r * 0.3, r * 0.55, 0, TAU); s.fill();
  }
  // clear runs: wiped out of the fog, wavering as they go
  s.globalCompositeOperation = "destination-out";
  s.strokeStyle = "rgba(0,0,0,0.45)";
  s.lineCap = "round";
  for (let i = 0; i < 10; i++) {
    const x = 80 + R() * 800, y0 = 40 + R() * 260, w = 1.5 + R() * 2.5;
    s.lineWidth = w;
    s.beginPath(); s.moveTo(x, y0);
    for (let y = y0; y < 506; y += 18) s.lineTo(x + Math.sin(y * 0.03 + i) * 1.2, y);
    s.stroke();
  }
  s.globalCompositeOperation = "source-over";
  // the beads that sit still on the glass are baked in here; only the sliding ones are drawn live
  K.glassDrops(s, 60, 40, 840, 466, 0, { seed: 23, density: 0.8, light: "#ffe0c8" });
  // window frame, painted wood with a pink neon catch on the inner edges
  s.fillStyle = "#1a1418";
  s.fillRect(0, 0, LW, 40); s.fillRect(0, 0, 60, LH); s.fillRect(900, 0, 60, LH); s.fillRect(0, 506, LW, 40); s.fillRect(470, 40, 12, 466);
  s.fillStyle = "rgba(255,160,200,0.25)";
  s.fillRect(56, 40, 3, 466); s.fillRect(897, 40, 3, 466); s.fillRect(479, 40, 2, 466);
  s.fillStyle = "rgba(255,255,255,0.05)";
  s.fillRect(60, 503, 840, 3);
  s.save();
  s.translate(690, 470);
  s.scale(-1, 1);
  s.font = "italic 600 24px Georgia, serif";
  s.textAlign = "center";
  s.fillStyle = "rgba(60,30,10,0.5)";
  s.fillText("The Purrcolator", 1, 1.5);
  s.fillStyle = "rgba(232,192,112,0.7)";
  s.fillText("The Purrcolator", 0, 0);
  s.restore();
}
// the striped awning edge right at the lens, painted once and pre-blurred (it is far out of focus)
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
function shotCafe(g, t, lt) {
  const p = eio(seg(lt, 0, 10));
  K.withCamera(g, LW, LH, { x: lerp(470, 500, p), y: 270, zoom: lerp(1.0, 1.05, p), shakeT: t, shakeAmt: 1 }, (c) => {
    // interior: painted once and pre-blurred (it is behind the glass, out of focus)
    c.drawImage(softSprite("f03cafeSoft", LW, LH, 3.5, (s) => paintCafeInterior(s)), 0, 0, LW, LH);
    for (const [x, y] of [[260, 70], [480, 52], [700, 76]]) { glow(c, x, y, 120, "#ffb060", 0.45); bokeh(c, x, y, 18, "#fff0d0", 0.7); }
    for (let i = 0; i < 4; i++) {
      const y = 300 - ((lt * 18 + i * 40) % 160);
      glow(c, 300 + Math.sin(lt + i) * 10, y, 30, "#fff0e0", 0.12 * (1 - (300 - y) / 160), "screen");
    }
    // the inside window ledge the cat sits on (warm wood, lit from above)
    const lg = c.createLinearGradient(0, 348, 0, 384);
    lg.addColorStop(0, "#d8a070");
    lg.addColorStop(0.15, "#7a4a2a");
    lg.addColorStop(1, "#2a160c");
    c.fillStyle = lg;
    c.fillRect(60, 348, 840, 36);
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.fillRect(60, 384, 840, 8);
    c.save();
    c.translate(560, 349);
    c.scale(1, 0.12);
    glow(c, 0, 0, 260, "#ffb060", 0.4);
    c.restore();
    // a cup on the ledge: round body, handle, a saucer and its shadow
    c.fillStyle = "rgba(30,14,6,0.45)";
    c.beginPath(); c.ellipse(560, 350, 18, 3, 0, 0, TAU); c.fill();
    const cupg = c.createLinearGradient(548, 0, 570, 0);
    cupg.addColorStop(0, "#fff8ee"); cupg.addColorStop(0.6, "#e6d8c6"); cupg.addColorStop(1, "#9a8070");
    c.fillStyle = cupg;
    c.beginPath(); c.moveTo(549, 331); c.lineTo(569, 331); c.quadraticCurveTo(569, 348, 559, 348); c.quadraticCurveTo(549, 348, 549, 331); c.fill();
    c.strokeStyle = "#cbb8a4"; c.lineWidth = 2;
    c.beginPath(); c.arc(571, 338, 4, -1.2, 1.4); c.stroke();
    c.fillStyle = "#3a1e10"; c.beginPath(); c.ellipse(559, 331.5, 9.5, 1.8, 0, 0, TAU); c.fill();
    // the barista cat: smaller, on the ledge, with a contact shadow; it turns its head (a slow idle,
    // a glance toward you that never quite lands, then away down the street at 34.8 s)
    const turn = eio(seg(lt, 2.2, 4.0)), away = eio(seg(lt, 6.6, 7.6));
    const head = lerp(lerp(0.85, -0.25, turn), -0.6, away) + Math.sin(lt * 1.3) * 0.05 * (1 - away);
    const catX = 668, catY = 352, cs = 96;
    c.fillStyle = "rgba(24,10,4,0.55)";
    c.beginPath(); c.ellipse(catX - cs * 0.05, catY + 1, cs * 0.62, cs * 0.06, 0, 0, TAU); c.fill();
    tinted(c, "barista", catX - cs * 1.6, catY - cs * 2.1, cs * 3.2, cs * 2.3, (cg) => {
      K.drawCat(cg, catX, catY, cs, {
        pose: "sit", facing: -1, coat: K.COATS.cream, headTurn: head, headTilt: lerp(0, 0.05, turn) - 0.04 * away, t: lt,
        blink: K.env(lt, 5.2, 5.5, 0.08, 0.08) + K.env(lt, 8.4, 8.7, 0.08, 0.08), collar: false, bell: false, ears: lerp(lerp(0.2, 0.6, turn), 0.95, away),
        // the pink neon outside, behind the cat, gives it a rim; the pendant is the fill
        light: { x: 980, y: 140, color: "#ffc0d8", strength: 1.6 }, ground: "#2a1408", shadow: false,
      });
      // apron: a linen bib that wraps the curve of the chest, strap round the neck, curved pocket
      cg.save();
      cg.translate(catX - cs * 0.2, catY - cs * 1.1);
      const ag = cg.createLinearGradient(-cs * 0.17, 0, cs * 0.17, 0);
      ag.addColorStop(0, "#14221a");
      ag.addColorStop(0.4, "#3a5a48");
      ag.addColorStop(0.7, "#2c4838");
      ag.addColorStop(1, "#122018");
      cg.fillStyle = ag;
      cg.beginPath();
      cg.moveTo(-cs * 0.09, cs * 0.01);
      cg.quadraticCurveTo(0, cs * 0.05, cs * 0.09, cs * 0.01);
      cg.bezierCurveTo(cs * 0.17, cs * 0.18, cs * 0.19, cs * 0.36, cs * 0.15, cs * 0.5);
      cg.quadraticCurveTo(0, cs * 0.6, -cs * 0.15, cs * 0.5);
      cg.bezierCurveTo(-cs * 0.19, cs * 0.36, -cs * 0.17, cs * 0.18, -cs * 0.09, cs * 0.01);
      cg.fill();
      // the fabric darkens as it turns away round the body, with one soft fold
      cg.strokeStyle = "rgba(0,0,0,0.25)"; cg.lineWidth = cs * 0.012;
      cg.beginPath(); cg.moveTo(cs * 0.04, cs * 0.12); cg.quadraticCurveTo(cs * 0.07, cs * 0.3, cs * 0.03, cs * 0.52); cg.stroke();
      cg.fillStyle = "#24402f";
      cg.beginPath(); cg.moveTo(-cs * 0.08, cs * 0.25); cg.quadraticCurveTo(0, cs * 0.28, cs * 0.08, cs * 0.25); cg.lineTo(cs * 0.075, cs * 0.35); cg.quadraticCurveTo(0, cs * 0.38, -cs * 0.075, cs * 0.35); cg.closePath(); cg.fill();
      cg.strokeStyle = "rgba(240,220,200,0.75)"; cg.lineWidth = 1;
      cg.beginPath(); cg.moveTo(-cs * 0.08, cs * 0.25); cg.quadraticCurveTo(0, cs * 0.28, cs * 0.08, cs * 0.25); cg.stroke();
      cg.strokeStyle = "rgba(240,226,208,0.95)"; cg.lineWidth = 1.4;
      cg.beginPath(); cg.moveTo(-cs * 0.09, cs * 0.01); cg.bezierCurveTo(-cs * 0.1, -cs * 0.1, cs * 0.0, -cs * 0.16, cs * 0.06, -cs * 0.14); cg.moveTo(cs * 0.09, cs * 0.01); cg.quadraticCurveTo(cs * 0.12, -cs * 0.06, cs * 0.1, -cs * 0.11); cg.stroke();
      cg.restore();
    }, "#3a1a10", 0.1);
    // glass: the static condensation/frame sprite, live drops, street reflections
    c.drawImage(K.sprite("f03glass", LW, LH, paintCafeGlass), 0, 0, LW, LH);
    K.glassDrops(c, 60, 40, 840, 466, lt, { seed: 29, density: 0.22, light: "#ffe0c8" });
    const rg = c.createLinearGradient(60, 0, 900, 0);
    rg.addColorStop(0, "rgba(120,150,210,0.10)");
    rg.addColorStop(0.3, "rgba(120,150,210,0)");
    rg.addColorStop(0.75, "rgba(255,111,168,0.0)");
    rg.addColorStop(0.9, "rgba(255,111,168,0.12)");
    c.fillStyle = rg;
    c.fillRect(60, 40, 840, 466);
  });
  // foreground: the awning edge at the lens, far out of focus, and big drops falling off it --
  // defocused into soft discs with bright rims, swelling as they fall toward the camera
  g.drawImage(softSprite("f03awnFg", LW, 90, 7, paintAwningFg), 0, -8, LW, 90);
  const bs = bokehSprite("#dfe8ff");
  for (let i = 0; i < 12; i++) {
    const per = 0.9 + hash(i, 71) * 0.9;
    const ph = ((lt + hash(i, 72) * per) % per) / per;
    const x = 30 + hash(i * 7 + Math.floor((lt + hash(i, 72) * per) / per), 73) * 900;
    const y = 62 + ph * ph * 520, r = 7 + ph * 16 + hash(i, 74) * 6;
    g.globalAlpha = 0.55 * (1 - ph * 0.5);
    g.drawImage(bs, x - r, y - r * 1.25, r * 2, r * 2.5);
  }
  g.globalAlpha = 1;
  // drops clinging to the scallops, waiting to fall
  for (let i = 0; i < 26; i++) {
    if (hash(i, 75) < 0.45) continue;
    const x = i * 36 + 18 + (hash(i, 76) - 0.5) * 10, sw = 0.6 + 0.4 * Math.sin(lt * (1.5 + hash(i, 77)) + i), r = 3 + hash(i, 78) * 4;
    g.globalAlpha = 0.7;
    g.drawImage(bs, x - r, 62 + sw * 3, r * 2, r * 2.4 + sw * 4);
  }
  g.globalAlpha = 1;
}
// ---- shot 5: the long alley, rack focus ---------------------------------------------------------------
const AV = { x: 470, y: 318 }, AF = 900, AEYE = 0.45;
const PA = (X, Y, Z) => [AV.x + (X / Z) * AF, AV.y + ((AEYE - Y) / Z) * AF];
const ALZ = 10; // depth of the lamp pool where the silhouette crosses
function paintAlley(s) {
  const sk = s.createLinearGradient(0, 0, 0, AV.y);
  sk.addColorStop(0, "#08101e");
  sk.addColorStop(1, "#2a3654");
  s.fillStyle = sk;
  s.fillRect(0, 0, LW, LH);
  // far end: the alley opens onto a lit street; across it a hazy facade with warm windows
  const e0 = PA(-2.3, 0, 36), e1 = PA(2.3, 11, 36);
  const eg = s.createLinearGradient(0, e1[1], 0, e0[1]);
  eg.addColorStop(0, "#1a2236");
  eg.addColorStop(1, "#3a4664");
  s.fillStyle = eg;
  s.fillRect(e0[0], e1[1], e1[0] - e0[0], e0[1] - e1[1]);
  const R0 = K.rng("f03aend");
  for (let y = 1.2; y < 10; y += 2.4) for (let x = -2.1; x < 2.1; x += 0.9) {
    const a = PA(x, y, 36.5), b = PA(x + 0.5, y + 1.2, 36.5);
    s.fillStyle = R0() < 0.4 ? mix(WARM, "#3a4664", 0.5) : "#2a3450";
    s.fillRect(a[0], b[1], b[0] - a[0], a[1] - b[1]);
  }
  // ground: wet cobbles
  const gr = s.createLinearGradient(0, AV.y, 0, LH);
  gr.addColorStop(0, "#4a5470");
  gr.addColorStop(0.15, "#1e2436");
  gr.addColorStop(1, "#080b12");
  quad(s, PA(-2.3, 0, 1.0), PA(-2.3, 0, 36), PA(2.3, 0, 36), PA(2.3, 0, 1.0), gr);
  for (let z = 1.4; z < 30; z *= 1.07) {
    const Rz = K.rng("f03ac" + z.toFixed(2));
    for (let X = -2.3 + Rz() * 0.2; X < 2.3; X += 0.26 + Rz() * 0.08) {
      const c = PA(X + 0.13, 0, z);
      const rw = (0.11 / z) * AF, rh = rw * (AEYE / z) * 0.9 + 0.25;
      s.fillStyle = mix("#0a0e16", "#1e2638", Rz());
      s.beginPath(); s.ellipse(c[0], c[1], rw, rh, 0, 0, Math.PI * 2); s.fill();
      s.fillStyle = rgba("#8a9ac0", 0.06 + Rz() * 0.08);
      s.beginPath(); s.ellipse(c[0], c[1] - rh * 0.35, rw * 0.6, rh * 0.4, 0, 0, Math.PI * 2); s.fill();
    }
  }
  // walls: old brick, rain-dark, with windows, doors, a fire escape
  for (const sd of [-1, 1]) {
    const X = sd * 2.3;
    const wg = s.createLinearGradient(0, 0, 0, LH);
    wg.addColorStop(0, sd < 0 ? "#2c2026" : "#262834");
    wg.addColorStop(0.6, sd < 0 ? "#1a1418" : "#161822");
    wg.addColorStop(1, "#0a0a10");
    quad(s, PA(X, 0, 0.8), PA(X, 14, 0.8), PA(X, 14, 36), PA(X, 0, 36), wg);
    s.strokeStyle = "rgba(0,0,0,0.28)";
    s.lineWidth = 0.6;
    s.beginPath();
    for (let y = 0.25; y < 14; y += 0.25) { const a = PA(X, y, 1.0), b = PA(X, y, 36); s.moveTo(a[0], a[1]); s.lineTo(b[0], b[1]); }
    s.stroke();
    const Rw = K.rng("f03aw" + sd);
    for (let z = 2; z < 32; z += 2.6 + Rw() * 2) {
      for (let y = 3.2; y < 13; y += 3.2) {
        const on = Rw() < 0.22;
        const p = [PA(X, y, z), PA(X, y + 1.4, z), PA(X, y + 1.4, z + 0.9), PA(X, y, z + 0.9)];
        quad(s, p[0], p[1], p[2], p[3], on ? mix(WARM, "#3a2a2a", 0.25 + z / 60) : mix("#0e1220", "#2a3450", Rw() * 0.5));
      }
    }
    for (const z of [3.5, 13, 22]) {
      quad(s, PA(X, 0, z), PA(X, 2.1, z), PA(X, 2.1, z + 1.0), PA(X, 0, z + 1.0), "#08080c");
      quad(s, PA(X, 2.15, z - 0.2), PA(X, 2.3, z - 0.2), PA(X, 2.3, z + 1.2), PA(X, 2.15, z + 1.2), "#2e2a30");
    }
    const p0 = PA(X, 0, 6 + sd), p1 = PA(X, 14, 6 + sd);
    s.strokeStyle = "#14161c";
    s.lineWidth = (0.12 / (6 + sd)) * AF;
    s.beginPath(); s.moveTo(p0[0], p0[1]); s.lineTo(p1[0], p1[1]); s.stroke();
  }
  // fire escape on the right: platforms + stair rails
  s.strokeStyle = "#0c0e14";
  s.lineWidth = 1.6;
  for (let y = 3.4; y < 13; y += 3.2) {
    const a = PA(2.3, y, 7), b = PA(1.5, y, 7), c = PA(1.5, y, 12), d = PA(2.3, y, 12);
    s.beginPath(); s.moveTo(a[0], a[1]); s.lineTo(b[0], b[1]); s.lineTo(c[0], c[1]); s.lineTo(d[0], d[1]); s.stroke();
    const r0 = PA(1.5, y + 1, 7), r1 = PA(1.5, y + 1, 12);
    s.beginPath(); s.moveTo(r0[0], r0[1]); s.lineTo(r1[0], r1[1]); s.stroke();
    const s0 = PA(1.7, y, 7.4), s1 = PA(1.7, y + 3.2, 11.6);
    s.beginPath(); s.moveTo(s0[0], s0[1]); s.lineTo(s1[0], s1[1]); s.stroke();
  }
  // a dumpster (lid, ribs, wet sheen) and bin bags on the left
  const d0 = PA(-2.25, 0, 5.2), d1 = PA(-1.5, 1.15, 5.2), d2 = PA(-1.5, 1.15, 7.0), d3 = PA(-1.5, 0, 7.0);
  const dg = s.createLinearGradient(d0[0], 0, d1[0], 0);
  dg.addColorStop(0, "#0a140f");
  dg.addColorStop(1, "#16281f");
  s.fillStyle = dg;
  s.fillRect(d0[0], d1[1], d1[0] - d0[0], d0[1] - d1[1]);
  quad(s, [d1[0], d0[1]], d1, d2, d3, "#0b1712");
  s.fillStyle = "#1a2c22";
  s.fillRect(d0[0] - 3, d1[1] - 6, d1[0] - d0[0] + 6, 8);
  s.fillStyle = "rgba(160,180,220,0.25)";
  s.fillRect(d0[0] - 3, d1[1] - 6, d1[0] - d0[0] + 6, 1.5);
  s.fillStyle = "rgba(0,0,0,0.35)";
  for (let i = 1; i < 4; i++) s.fillRect(lerp(d0[0], d1[0], i / 4) - 2, d1[1] + 4, 4, d0[1] - d1[1] - 8);
  // two ribbed metal dustbins (one lid knocked askew) and a tied bin bag, lit from the lamp on the right
  for (let i = 1; i >= 0; i--) {
    const z = 7.7 + i * 1.0, b = PA(-1.1 + i * 0.5, 0, z), r = (0.24 / z) * AF, h = (0.72 / z) * AF, e = r * 0.28;
    s.fillStyle = "rgba(0,0,0,0.5)";
    s.beginPath(); s.ellipse(b[0] + r * 0.3, b[1] + e * 0.3, r * 1.3, e * 1.2, 0, 0, TAU); s.fill();
    const bg = s.createLinearGradient(b[0] - r, 0, b[0] + r, 0);
    bg.addColorStop(0, "#07090c"); bg.addColorStop(0.5, "#1c222c"); bg.addColorStop(0.78, "#5a5a5e"); bg.addColorStop(0.9, "#9a8a70"); bg.addColorStop(1, "#1a1c22");
    s.fillStyle = bg;
    s.beginPath(); s.moveTo(b[0] - r * 0.92, b[1] - h); s.lineTo(b[0] - r, b[1]); s.ellipse(b[0], b[1], r, e, 0, Math.PI, 0, true); s.lineTo(b[0] + r * 0.92, b[1] - h); s.closePath(); s.fill();
    s.strokeStyle = "rgba(0,0,0,0.5)"; s.lineWidth = 1.2;
    for (const v of [0.25, 0.55, 0.85]) { s.beginPath(); s.ellipse(b[0], b[1] - h * v, r * (0.95 + 0.05 * v) * 0.97, e, 0, 0, Math.PI); s.stroke(); }
    s.strokeStyle = "rgba(200,190,170,0.25)"; s.lineWidth = 0.8;
    for (const v of [0.27, 0.57, 0.87]) { s.beginPath(); s.ellipse(b[0], b[1] - h * v, r * 0.96, e, 0, 0.2, 1.2); s.stroke(); }
    // the lid: a shallow dome, the far bin's lid sits askew on the back of the rim
    s.save();
    s.translate(b[0], b[1] - h);
    if (i === 0) s.rotate(-0.22);
    s.fillStyle = "#0c0e12";
    s.beginPath(); s.ellipse(0, 0, r * 1.02, e * 1.1, 0, 0, TAU); s.fill();
    const lg2 = s.createLinearGradient(-r, 0, r, 0);
    lg2.addColorStop(0, "#14181e"); lg2.addColorStop(0.75, "#6a6a6a"); lg2.addColorStop(1, "#24262a");
    s.fillStyle = lg2;
    s.beginPath(); s.ellipse(0, -e * 0.4, r * 0.98, e * 1.4, 0, Math.PI, 0); s.fill();
    s.fillStyle = "#2a2c30"; s.fillRect(-r * 0.22, -e * 2.1, r * 0.44, e * 0.5);
    s.restore();
    s.fillStyle = "rgba(170,190,230,0.3)"; s.fillRect(b[0] + r * 0.62, b[1] - h * 0.95, 1.2, h * 0.9);
  }
  {
    const z = 7.2, b = PA(-0.55, 0, z), r = (0.26 / z) * AF;
    const bg = s.createRadialGradient(b[0] + r * 0.5, b[1] - r * 1.1, r * 0.05, b[0], b[1] - r * 0.6, r * 1.3);
    bg.addColorStop(0, "#4a5262"); bg.addColorStop(0.35, "#161a22"); bg.addColorStop(1, "#040506");
    s.fillStyle = bg;
    s.beginPath(); s.moveTo(b[0] - r, b[1]);
    s.bezierCurveTo(b[0] - r * 1.25, b[1] - r * 0.9, b[0] - r * 0.6, b[1] - r * 1.5, b[0] - r * 0.12, b[1] - r * 1.4);
    s.lineTo(b[0] - r * 0.2, b[1] - r * 1.75); s.lineTo(b[0] + r * 0.05, b[1] - r * 1.62); s.lineTo(b[0] + r * 0.22, b[1] - r * 1.8); s.lineTo(b[0] + r * 0.14, b[1] - r * 1.38);
    s.bezierCurveTo(b[0] + r * 0.8, b[1] - r * 1.4, b[0] + r * 1.25, b[1] - r * 0.8, b[0] + r, b[1]);
    s.closePath(); s.fill();
    s.strokeStyle = "rgba(200,215,240,0.35)"; s.lineWidth = 0.9;
    for (const [a0, a1, k] of [[-0.6, 0.2, 0.6], [0.1, 0.9, 0.85], [-1.2, -0.5, 0.95]]) { s.beginPath(); s.arc(b[0], b[1] - r * 0.7, r * k, a0, a1); s.stroke(); }
  }
  // wires across the top
  s.strokeStyle = "rgba(5,6,10,0.9)";
  s.lineWidth = 1.2;
  for (const [z, y] of [[5, 9], [9, 10.5], [16, 8]]) {
    const a = PA(-2.3, y, z), b = PA(2.3, y, z);
    s.beginPath(); s.moveTo(a[0], a[1]); s.quadraticCurveTo((a[0] + b[0]) / 2, a[1] + 120 / z, b[0], b[1]); s.stroke();
  }
  // the lamp bracket over a door on the right
  const L = PA(2.3, 3.0, ALZ), Lh = PA(1.95, 3.0, ALZ);
  s.strokeStyle = "#0c0c10";
  s.lineWidth = 2;
  s.beginPath(); s.moveTo(L[0], L[1]); s.lineTo(Lh[0], Lh[1]); s.stroke();
  s.fillStyle = "#0c0c10";
  s.fillRect(Lh[0] - 6, Lh[1] - 2, 12, 6);
}
function alleyBg(f, t, lt) {
  f.drawImage(K.sprite("f03alley", LW, LH, paintAlley), 0, 0, LW, LH);
  // far end street glow + fog in the middle distance
  const e = PA(0, 2, 36);
  glow(f, e[0], e[1], 160, "#9fb4e0", 0.35);
  K.fog(f, LW, LH, { y: AV.y - 10, h: 120, color: "#5a6a90", alpha: 0.45, t, seed: 8 });
  // the lamp over the door: a pool of warm light where the silhouette crosses
  const L = PA(1.95, 2.95, ALZ);
  const pool = PA(0.6, 0, ALZ);
  glow(f, L[0], L[1] + 4, 140, LAMP, 0.55);
  glow(f, L[0], L[1] + 4, 14, "#ffffff", 0.95);
  // light cone through the rain: several soft wedges so the edges feather out
  f.save();
  f.globalCompositeOperation = "lighter";
  for (let k = 0; k < 4; k++) {
    const sp = 40 + k * 32;
    const cg = f.createLinearGradient(0, L[1], 0, pool[1]);
    cg.addColorStop(0, rgba(LAMP, 0.1));
    cg.addColorStop(1, rgba(LAMP, 0.0));
    f.fillStyle = cg;
    f.beginPath();
    f.moveTo(L[0] - 4, L[1] + 4); f.lineTo(L[0] + 4, L[1] + 4); f.lineTo(pool[0] + sp * 0.8 + 40, pool[1]); f.lineTo(pool[0] - sp + 20, pool[1]);
    f.fill();
  }
  f.restore();
  f.save();
  f.translate(pool[0], pool[1]);
  f.scale(1, 0.16);
  glow(f, 0, 0, 220, LAMP, 0.6);
  f.restore();
  reflStreak(f, L[0], pool[1] + 3, 110, 9, LAMP, 0.6, t, 12);
  // backlit rain in the lamp cone
  litRain(f, t, [[L[0] - 20, L[1] + 70, 90]], 1.8);
  // steam from a grate catching the backlight
  // steam: a plume from the grate, a dense neck that billows, leans with the draught and thins out;
  // puffs are textured sprites, the side facing the lamp catches it warm
  const gz = 6.2, gp = PA(-0.4, 0, gz);
  const puffC = steamPuff("#c8d2e8"), puffW = steamPuff("#ffd8a8");
  for (let i = 0; i < 22; i++) {
    const age = ((lt * 0.22 + i / 22) % 1);
    const sway = Math.sin(lt * 0.6 + age * 5 + i) * 10 * age + Math.sin(age * 9 - lt * 1.3) * 6;
    const x = gp[0] + sway + age * age * 110, y = gp[1] - 4 - age * 300;
    const r = 18 + age * 120 + hash(i, 3) * 20;
    const a = 0.16 * Math.pow(Math.sin(age * Math.PI), 0.7) * (1 - age * 0.4);
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
  // the silhouette crossing the pool of lamplight: something orange
  const cross = seg(lt, 0.6, 8.6);
  if (cross > 0 && cross < 1) {
    const cx = lerp(PA(-2.1, 0, ALZ)[0], PA(2.1, 0, ALZ)[0], cross);
    const sz = (0.27 / ALZ) * AF;
    const inPool = clamp(1 - Math.abs(cx - pool[0]) / 150);
    tinted(f, "acat", cx - sz * 2.4, pool[1] - sz * 2.2, sz * 4.8, sz * 2.6, (cg2) => {
      K.drawCat(cg2, cx, pool[1], sz, { pose: "walk", phase: lt * 1.3, facing: 1, t: lt, bell: false, wet: 0.4, light: { x: L[0], y: L[1], color: LAMP, strength: 1.8 } });
    }, "#0a0c14", lerp(0.88, 0.1, inPool));
  }
  K.rain(f, LW, LH, t, { density: 0.5, angle: 0.05, color: "rgba(180,195,230,0.3)", seed: 51, len: 18 });
}
function alleyFg(f, t, lt) {
  // foreground: wet cobbles right at the lens and a puddle mirroring the lamp
  const pg = f.createLinearGradient(0, 400, 0, LH);
  pg.addColorStop(0, "rgba(8,10,16,0)");
  pg.addColorStop(0.25, "#0a0e16");
  pg.addColorStop(1, "#04060a");
  f.fillStyle = pg;
  f.fillRect(0, 395, LW, 150);
  for (let i = 0; i < 16; i++) {
    const x = hash(i, 81) * LW, w = 40 + hash(i, 82) * 60, y = 430 + hash(i, 83) * 60;
    f.fillStyle = "#121722";
    f.beginPath(); f.ellipse(x, y, w, 13, 0, 0, Math.PI * 2); f.fill();
    f.fillStyle = "rgba(150,170,210,0.16)";
    f.beginPath(); f.ellipse(x - w * 0.1, y - 6, w * 0.55, 4, 0, 0, Math.PI * 2); f.fill();
  }
  f.save();
  f.beginPath();
  f.ellipse(470, 452, 330, 34, 0, 0, Math.PI * 2);
  f.clip();
  const wg = f.createLinearGradient(0, 418, 0, 486);
  wg.addColorStop(0, "#2a3a5c");
  wg.addColorStop(1, "#0e1626");
  f.fillStyle = wg;
  f.fillRect(130, 410, 700, 90);
  reflStreak(f, PA(1.95, 3, ALZ)[0], 424, 60, 12, LAMP, 1.0, t, 9);
  reflStreak(f, 470, 424, 50, 24, "#9fb4e0", 0.5, t, 10);
  for (let i = 0; i < 7; i++) {
    const per = 0.9 + hash(i, 91) * 0.6;
    const ph = ((lt + hash(i, 92) * per) % per) / per;
    f.strokeStyle = `rgba(220,230,255,${0.55 * (1 - ph)})`;
    f.lineWidth = 1.2;
    f.beginPath(); f.ellipse(180 + hash(i, 93) * 580, 436 + hash(i, 94) * 34, 4 + ph * 34, 1 + ph * 4, 0, 0, Math.PI * 2); f.stroke();
  }
  f.restore();
}
// a soft, lumpy puff of steam (several overlapping blobs, so a plume is not a stack of perfect discs)
function steamPuff(color) {
  return K.sprite("f03puff:" + color, 128, 128, (s) => {
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
  const rack = eio(seg(lt, 0.8, 3.4)); // 0 = puddle sharp, 1 = far silhouette sharp
  const p = seg(lt, 0, 10);
  K.withCamera(g, LW, LH, { x: 480 + p * 10, y: 270, zoom: 1 + p * 0.04, shakeT: t, shakeAmt: 0.8 }, (c) => {
    K.focus(c, LW, LH, lerp(6, 0.2, rack), (f) => alleyBg(f, t, lt), "f03abg");
    K.focus(c, LW, LH, lerp(0.2, 7, rack), (f) => alleyFg(f, t, lt), "f03afg");
  });
}

// ---- shot 6: a puddle; an orange reflection; tilt up to nobody ------------------------------------
function paintCobbleTop(s) {
  // cobbles seen from above under a lamp: irregular setts, wet mortar, a warm key from upper right
  s.fillStyle = "#06080e";
  s.fillRect(0, 0, LW, LH);
  const R = K.rng("f03top");
  for (let row = 0, y = -14; y < LH + 30; row++, y += 24 + R() * 6) {
    for (let x = -30 + (row % 2) * 20 + R() * 10; x < LW + 30; x += 34 + R() * 10) {
      const w = 14 + R() * 5, h = 9 + R() * 4, a = (R() - 0.5) * 0.4;
      const lx = (x - 820) / 900, ly = (y - 60) / 700;
      const lit = clamp(1 - Math.hypot(lx, ly));
      const gr = s.createRadialGradient(4, -4, 1, 0, 0, w * 1.1);
      gr.addColorStop(0, mix(mix(mix("#2c3650", "#3c4864", R()), "#4a4440", R() * 0.6), "#a08060", lit * 0.35));
      gr.addColorStop(0.7, mix("#161c2a", "#1e2638", R()));
      gr.addColorStop(1, "#0a0e16");
      s.fillStyle = gr;
      s.save(); s.translate(x, y); s.rotate(a); s.beginPath(); K.roundRect(s, -w, -h, w * 2, h * 2, Math.min(w, h) * 0.55); s.fill(); s.restore();
      // wet specular on the top-right of each stone
      s.fillStyle = rgba(lit > 0.3 ? "#ffd6a0" : "#9fb4e0", 0.1 + lit * 0.25);
      s.beginPath(); s.ellipse(x + w * 0.3, y - h * 0.35, w * 0.35, h * 0.2, a - 0.3, 0, Math.PI * 2); s.fill();
    }
  }
  // water in the mortar lines: thin sky-coloured glints
  s.strokeStyle = "rgba(120,140,190,0.12)";
  s.lineWidth = 1;
  for (let i = 0; i < 120; i++) {
    const x = R() * LW, y = R() * LH;
    s.beginPath(); s.moveTo(x, y); s.lineTo(x + 6 + R() * 10, y + (R() - 0.5) * 3); s.stroke();
  }
}
function shotPuddle(g, t, lt) {
  const tilt = eio(seg(lt, 6.2, 8.3)); // camera tilts up to the empty street, then holds on nobody
  const off = tilt * LH;
  // -- the puddle view (looking down), slides down out of frame as we tilt up
  if (tilt < 1) {
    g.save();
    g.translate(0, off);
    g.drawImage(K.sprite("f03top", LW, LH, paintCobbleTop), 0, 0, LW, LH);
    // the puddle: dark sky in it, the lamp, and (at 2..6 s) an orange cat walking past, upside down.
    // First the cobbles round it are darker where the water has soaked them.
    g.save();
    g.strokeStyle = "rgba(0,2,8,0.35)";
    g.lineWidth = 34;
    g.beginPath();
    g.moveTo(140, 280);
    g.bezierCurveTo(160, 120, 520, 90, 760, 150);
    g.bezierCurveTo(900, 200, 860, 420, 640, 450);
    g.bezierCurveTo(420, 480, 120, 440, 140, 280);
    g.stroke();
    g.restore();
    g.save();
    g.beginPath();
    g.moveTo(140, 280);
    g.bezierCurveTo(160, 120, 520, 90, 760, 150);
    g.bezierCurveTo(900, 200, 860, 420, 640, 450);
    g.bezierCurveTo(420, 480, 120, 440, 140, 280);
    g.clip();
    // the reflected sky: the zenith is dark, the edges pick up the town glow
    const sk = g.createRadialGradient(470, 330, 40, 470, 260, 460);
    sk.addColorStop(0, "#0c1630");
    sk.addColorStop(0.6, "#22345a");
    sk.addColorStop(1, "#5a6890");
    g.fillStyle = sk;
    g.fillRect(100, 80, 800, 420);
    // reflected rooftops and a chimney hanging down from the far rim
    const rf = g.createLinearGradient(0, 80, 0, 205);
    rf.addColorStop(0, "rgba(6,9,16,0.95)");
    rf.addColorStop(1, "rgba(10,16,30,0.75)");
    g.fillStyle = rf;
    g.beginPath();
    g.moveTo(100, 80);
    const roofs = [[100, 150], [190, 150], [190, 175], [260, 175], [300, 140], [340, 175], [430, 175], [430, 160], [560, 160], [560, 190], [590, 190], [590, 160], [700, 160], [760, 200], [900, 200], [900, 80]];
    for (let i = 0; i < roofs.length - 1; i++) {
      const [x0, y0] = roofs[i], [x1, y1] = roofs[i + 1];
      for (let k = 0; k < 6; k++) { const u = k / 6, x = lerp(x0, x1, u), y = lerp(y0, y1, u); g.lineTo(x + Math.sin(y * 0.2 + lt * 4) * 1.5, y + Math.sin(x * 0.06 + lt * 3) * 2.2); }
    }
    g.lineTo(900, 80);
    g.fill();
    glow(g, 720, 200, 150, LAMP, 0.45);
    glow(g, 720, 200, 16, "#ffffff", 0.75);
    // the cat reflection, rippled: draw into a layer, then copy strips with a wobble
    const walk = seg(lt, 2.0, 6.4);
    if (walk > 0 && walk < 1) {
      // the mirror image: inverted from the feet on the far rim, foreshortened (we look down at it),
      // lit from beneath by the lamp, and fading with the Fresnel falloff toward the near edge
      const L = K.layer(LW, LH, "f03refl");
      const cx = lerp(1000, -80, walk);
      L.g.save();
      L.g.translate(0, 150);
      L.g.scale(1, -0.82);
      K.drawCat(L.g, cx, 0, 118, { pose: "walk", phase: lt * 1.1, facing: -1, t: lt, bell: true, collar: true, wet: 0.5, shadow: false, light: { x: 700, y: -300, color: LAMP, strength: 1.4 } });
      L.g.restore();
      L.g.setTransform(K.pixelScale(), 0, 0, K.pixelScale(), 0, 0);
      L.g.globalCompositeOperation = "source-atop";
      L.g.fillStyle = "rgba(16,30,64,0.36)";
      L.g.fillRect(0, 0, LW, LH);
      L.g.globalCompositeOperation = "destination-in";
      const fr = L.g.createLinearGradient(0, 150, 0, 330);
      fr.addColorStop(0, "rgba(0,0,0,1)");
      fr.addColorStop(1, "rgba(0,0,0,0.35)");
      L.g.fillStyle = fr;
      L.g.fillRect(0, 0, LW, LH);
      L.g.globalCompositeOperation = "source-over";
      const px = K.pixelScale();
      g.save();
      g.globalAlpha = 0.7;
      for (let y = 100; y < 440; y += 6) {
        const dx = Math.sin(y * 0.11 + lt * 5) * 2.2 + Math.sin(y * 0.035 - lt * 2) * 1.8;
        g.drawImage(L.canvas, 0, y * px, LW * px, 6 * px, dx, y, LW, 6);
      }
      // a softer, offset second copy reads as the slight blur of disturbed water
      g.globalAlpha = 0.18;
      g.drawImage(L.canvas, 0, 0, LW * px, LH * px, 3, 2, LW, LH);
      g.restore();
      // tint the reflection into the water
      g.fillStyle = "rgba(14,28,60,0.3)";
      g.fillRect(100, 80, 800, 420);
    }
    // ripple rings from raindrops
    for (let i = 0; i < 14; i++) {
      const per = 0.8 + hash(i, 101) * 0.9;
      const ph = ((lt + hash(i, 102) * per) % per) / per;
      const x = 200 + hash(i * 3 + Math.floor((lt + hash(i, 102) * per) / per), 103) * 600;
      const y = 150 + hash(i * 5 + Math.floor((lt + hash(i, 102) * per) / per), 104) * 280;
      g.strokeStyle = `rgba(220,232,255,${0.45 * (1 - ph)})`;
      g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(x, y, 3 + ph * 34, 2 + ph * 24, 0, 0, Math.PI * 2); g.stroke();
      if (ph > 0.25) { g.strokeStyle = `rgba(220,232,255,${0.25 * (1 - ph)})`; g.beginPath(); g.ellipse(x, y, ph * 18, ph * 13, 0, 0, Math.PI * 2); g.stroke(); }
    }
    // a few cobble crowns break the surface near the shallow rim
    for (let i = 0; i < 7; i++) {
      const a = hash(i, 111) * TAU, rr = 0.86 + hash(i, 112) * 0.1;
      const x = 480 + Math.cos(a) * 340 * rr, y = 290 + Math.sin(a) * 165 * rr, w = 12 + hash(i, 113) * 6;
      g.fillStyle = "#2a3346";
      g.beginPath(); g.ellipse(x, y, w, w * 0.62, hash(i, 114) - 0.5, 0, TAU); g.fill();
      g.fillStyle = "rgba(190,205,235,0.45)";
      g.beginPath(); g.ellipse(x + w * 0.25, y - w * 0.25, w * 0.4, w * 0.16, -0.3, 0, TAU); g.fill();
      g.strokeStyle = "rgba(200,215,240,0.25)"; g.lineWidth = 0.8;
      g.beginPath(); g.ellipse(x, y + 1, w * 1.15, w * 0.7, 0, 0.1, Math.PI - 0.1); g.stroke();
    }
    g.restore();
    // puddle edge: a faint wet sheen
    g.strokeStyle = "rgba(160,180,220,0.1)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(140, 280);
    g.bezierCurveTo(160, 120, 520, 90, 760, 150);
    g.bezierCurveTo(900, 200, 860, 420, 640, 450);
    g.bezierCurveTo(420, 480, 120, 440, 140, 280);
    g.stroke();
    g.restore();
  }
  // -- the empty street, coming down into frame as the camera tilts up
  if (tilt > 0) {
    g.save();
    g.translate(0, off - LH);
    const st = K.sprite("f03street", LW, LH, paintStreet);
    g.drawImage(st, 0, 0, LW, LH);
    streetLights(g, t, 0.9);
    K.fog(g, LW, LH, { y: VPY, h: 140, color: "#8a96b8", alpha: 0.35, t, seed: 5 });
    g.restore();
  }
  K.rain(g, LW, LH, t, { density: 0.6, angle: 0.06, color: "rgba(190,205,235,0.35)", seed: 61 });
  // motion blur feel during the tilt: a soft vertical smear
  const mb = Math.sin(tilt * Math.PI);
  if (mb > 0.05) { g.fillStyle = `rgba(20,30,50,${0.35 * mb})`; g.fillRect(0, 0, LW, LH); }
}

// ---- shot 7: you run toward the clock tower ----------------------------------------------------------
function shotRun(g, t, lt) {
  const p = seg(lt, 0, 8);
  // a new angle: low and close, tracking just behind you as you run, a Dutch tilt that rocks with the
  // stride; the street rushes past (speed-streaked rain), every footfall kicks up a splash
  const z = lerp(4.4, 13, eio(p));
  const b = P(0.6, 0, z), h = (1.45 / z) * F;
  const ph = lt * 1.45;
  const cam = { x: lerp(b[0], 480, 0.35), y: b[1] - h * 0.5, zoom: lerp(1.95, 1.4, eio(p)), rot: -0.05 + Math.sin(ph * TAU) * 0.008, shakeT: t * 1.6, shakeAmt: 2.4 };
  K.withCamera(g, LW, LH, cam, (c) => {
    shotStreet(c, t, lt, {
      extra(cg) {
        const bob = Math.abs(Math.sin(ph * TAU)) * h * 0.025;
        tinted(cg, "kidrun", b[0] - h * 0.6, b[1] - h * 1.2, h * 1.2, h * 1.3, (kg) => {
          K.drawPerson(kg, b[0], b[1] - bob, h, { view: "back", run: true, phase: ph, hood: true, wet: 0.8, bell: true, t: lt, shadow: true, light: { x: P(0, 30, 118)[0], y: P(0, 30, 118)[1], color: "#ffe8b8", strength: 1.4 } });
        }, "#141c34", 0.32);
        reflStreak(cg, b[0], b[1] + 2, h * 0.6, h * 0.12, "#e8b923", 0.3, t, 99);
        // footfall splashes: a crown of droplets thrown back from each landing foot
        for (const off of [0, 0.5]) {
          const k = ((ph + off) % 1) / 0.32;
          if (k > 1) continue;
          const fx = b[0] + (off ? 1 : -1) * h * 0.07, fy = b[1] - h * 0.01;
          cg.strokeStyle = `rgba(210,225,255,${0.5 * (1 - k)})`; cg.lineWidth = 1;
          cg.beginPath(); cg.ellipse(fx, fy, h * 0.05 + k * h * 0.1, h * 0.012 + k * h * 0.02, 0, 0, TAU); cg.stroke();
          cg.fillStyle = `rgba(225,235,255,${0.75 * (1 - k)})`;
          for (let d = 0; d < 7; d++) {
            const a = -Math.PI / 2 + (d - 3) * 0.38, v = h * (0.12 + hash(d, off * 10 + 3) * 0.1);
            cg.beginPath(); cg.arc(fx + Math.cos(a) * v * k, fy + Math.sin(a) * v * k + k * k * h * 0.12, Math.max(0.6, h * 0.008), 0, TAU); cg.fill();
          }
        }
      },
    });
  });
  // speed streaks: rain smeared into long lines that race out from the vanishing point
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  for (let i = 0; i < 36; i++) {
    const a = hash(i, 301) * TAU, sp = 0.9 + hash(i, 302) * 0.8;
    const u = (lt * sp + hash(i, 303)) % 1, d0 = 60 + u * u * 700, d1 = d0 + 30 + u * 140;
    const ca = Math.cos(a), sa = Math.sin(a) * 0.62;
    g.strokeStyle = `rgba(200,215,245,${0.16 * Math.sin(u * Math.PI)})`;
    g.lineWidth = 0.6 + u * 1.6;
    g.beginPath(); g.moveTo(480 + ca * d0, 250 + sa * d0); g.lineTo(480 + ca * d1, 250 + sa * d1); g.stroke();
  }
  g.restore();
}

// ---- the edit -------------------------------------------------------------------------------------
const SHOTS = [
  [0, 10, (g, t, lt) => K.withCamera(g, LW, LH, { x: 480, y: 262, zoom: 1 + eio(lt / 10) * 0.08, shakeT: t, shakeAmt: 0.9 }, (c) => shotStreet(c, t, lt))],
  [10, 19, shotPoster],
  [19, 28, shotReveal],
  [28, 38, shotCafe],
  [38, 48, shotAlley],
  [48, 58, shotPuddle],
  [58, 66, shotRun],
];
const GRADES = [
  { tint: "#2a4a8a", a: 0.22 }, { tint: "#2a3a6a", a: 0.2 }, { tint: "#2a3a70", a: 0.24 },
  { tint: "#6a3a5a", a: 0.16 }, { tint: "#1e3a6a", a: 0.24 }, { tint: "#20406a", a: 0.22 }, { tint: "#2a4a8a", a: 0.22 },
];
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
    const gr = GRADES[i];
    K.finish(g, LW, LH, t, { bloom: 0.32, tint: gr.tint, tintAlpha: gr.a, mode: "soft-light", vignette: 0.6, grain: 0.06, letterbox: 1 });
    // a cool shadow lift so blacks are never pure black
    K.grade(g, LW, LH, { lift: "#070a12" });
    K.letterbox(g, LW, LH, 1);
    const ta = K.env(t, 2, 6, 0.9, 1.0);
    if (ta > 0) K.title(g, LW, LH, "Missing", "Chapter 3", ta, { y: LH * 0.42, size: 62, glow: "#9fb4e0" });
    K.fadeBlack(g, LW, LH, 1 - smooth(seg(t, 0, 1.4)));
    K.fadeBlack(g, LW, LH, smooth(seg(t, 63.6, 66)));
    g.restore();
  },
};
