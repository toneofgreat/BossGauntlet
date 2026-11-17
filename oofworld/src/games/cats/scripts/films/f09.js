// films/f09.js - Chapter 9 "Security Footage" (FILMS.md f09). Teal monitor lab + green CCTV.
// The lab watched everything: on the tapes Biscuit walks IN FRONT, small cats follow him, and he
// hides a kitten in the hay and walks away. Pure function of t; all art in a 960 x 540 space.
import * as K from "../filmkit.js";

const D = 70;
const TEAL = "#5affc8", STEEL = "#4a5560", AMBER = "#ffb000", DARK = "#0c1216";
const MONO = '"Consolas", "Lucida Console", "Courier New", monospace';
const KEY_LIGHT = { color: "#bfffe8" };

// ---- small local helpers ------------------------------------------------------------------------
const pad2 = (n) => String(Math.floor(n)).padStart(2, "0");
function clock(sec) {
  sec = Math.max(0, sec);
  return pad2(sec / 3600) + ":" + pad2((sec / 60) % 60) + ":" + pad2(sec % 60);
}
function poly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}
// a cached static-noise tile (n x n logical px) used for TV snow
function snowTile(i) {
  return K.sprite("f09snow" + i, 96, 54, (s) => {
    const c = s.canvas;
    const img = s.createImageData(c.width, c.height);
    const R = K.rng("f09snow" + i);
    for (let p = 0; p < c.width * c.height; p++) {
      const v = 30 + Math.pow(R(), 1.6) * 200;
      img.data[p * 4] = v * 0.9; img.data[p * 4 + 1] = v; img.data[p * 4 + 2] = v * 0.95; img.data[p * 4 + 3] = 255;
    }
    s.putImageData(img, 0, 0);
  });
}
function scanPattern(g, dark = 0.55, period = 3) {
  // quantised so a continuously changing period does not mint a new cached sprite every frame
  period = Math.max(2, Math.round(period * 2) / 2);
  const spr = K.sprite("f09scan" + period + ":" + dark, 4, period, (s) => {
    s.fillStyle = `rgba(0,0,0,${dark})`;
    s.fillRect(0, 0, 4, period * 0.45);
  });
  return g.createPattern(spr, "repeat");
}
function scanlines(g, x, y, w, h, alpha, period = 3) {
  const pat = scanPattern(g, 0.6, period);
  if (!pat) return;
  g.save();
  g.globalAlpha *= alpha;
  g.fillStyle = pat;
  g.fillRect(x, y, w, h);
  g.restore();
}
function snow(g, x, y, w, h, t, alpha = 1, seed = 0) {
  const f = Math.floor(t * 24) + seed * 7;
  const tile = snowTile(((f % 3) + 3) % 3);
  g.save();
  g.globalAlpha *= alpha;
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  const ox = K.hash(f, 3) * 96, oy = K.hash(f, 4) * 54;
  const tw = Math.max(96, w * 0.9), th = tw * 54 / 96;
  for (let yy = y - oy * th / 54; yy < y + h; yy += th) {
    for (let xx = x - ox * tw / 96; xx < x + w; xx += tw) g.drawImage(tile, xx, yy, tw, th);
  }
  g.restore();
}
function hudText(g, text, x, y, size, align = "left", color = "#e9f5ec", alpha = 1) {
  g.save();
  g.globalAlpha *= alpha;
  g.font = `600 ${size}px ${MONO}`;
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  g.fillStyle = "rgba(0,0,0,0.6)";
  g.fillText(text, x + 1.5, y + 1.5);
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = size * 0.5;
  g.fillText(text, x, y);
  g.restore();
}

// ---- a single monitor (used by the wall, the lab and the close-ups) -----------------------------
// kind: 0 snow, 1 meadow, 2 town, 3 manor, 4 volcano, 5 void, 6 corridor, 7 data
function screen(g, x, y, w, h, kind, t, i, o = {}) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = "#061012";
  g.fillRect(x, y, w, h);
  const jit = o.rewind ? K.noise(t * 30 + i, 9) * w * 0.03 : 0;
  g.translate(jit, 0);
  if (kind === 0) {
    snow(g, x - jit, y, w, h, t, 0.75, i);
  } else if (kind === 1) {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, "#0d2a35"); gr.addColorStop(1, "#2c5a52");
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = "#e9f5e0"; g.beginPath(); g.arc(x + w * 0.78, y + h * 0.25, h * 0.08, 0, K.TAU); g.fill();
    g.fillStyle = "#14352a";
    g.beginPath(); g.ellipse(x + w * 0.3, y + h * 1.05, w * 0.6, h * 0.45, 0, 0, K.TAU); g.fill();
    g.fillStyle = "#0d261d";
    g.beginPath(); g.ellipse(x + w * 0.85, y + h * 1.1, w * 0.5, h * 0.4, 0, 0, K.TAU); g.fill();
    g.fillStyle = "#3a2018"; g.fillRect(x + w * 0.55, y + h * 0.5, w * 0.16, h * 0.22);
  } else if (kind === 2) {
    g.fillStyle = "#0e1630"; g.fillRect(x, y, w, h);
    const R = K.rng("town" + i);
    for (let b = 0; b < 6; b++) {
      const bx = x + b * w / 6, bh = h * (0.35 + R() * 0.45);
      g.fillStyle = b % 2 ? "#18223e" : "#141c34";
      g.fillRect(bx, y + h - bh, w / 6 + 1, bh);
      for (let k = 0; k < 4; k++) {
        if (R() < 0.5) continue;
        g.fillStyle = R() < 0.3 ? "#ff7ac8" : "#ffd27a";
        g.fillRect(bx + w * 0.03 + R() * w * 0.08, y + h - bh + h * 0.08 + k * h * 0.1, w * 0.025, h * 0.04);
      }
    }
  } else if (kind === 3) {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, "#1c1030"); gr.addColorStop(1, "#3a2450");
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = "#0c0814";
    poly(g, [[x + w * 0.2, y + h], [x + w * 0.2, y + h * 0.45], [x + w * 0.35, y + h * 0.25], [x + w * 0.5, y + h * 0.42], [x + w * 0.62, y + h * 0.18], [x + w * 0.74, y + h * 0.42], [x + w * 0.8, y + h]]);
    g.fill();
    g.fillStyle = "#ffcf7a"; g.fillRect(x + w * 0.58, y + h * 0.5, w * 0.06, h * 0.08);
  } else if (kind === 4) {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, "#1a0a08"); gr.addColorStop(1, "#5a1e0c");
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = "#120806";
    poly(g, [[x, y + h], [x + w * 0.4, y + h * 0.3], [x + w * 0.52, y + h * 0.3], [x + w, y + h]]);
    g.fill();
    K.glow(g, x + w * 0.46, y + h * 0.3, h * 0.35, "#ff6a2a", 0.8);
  } else if (kind === 5) {
    g.fillStyle = "#040408"; g.fillRect(x, y, w, h);
    g.strokeStyle = "rgba(60,60,110,0.6)"; g.lineWidth = 0.6;
    g.beginPath();
    for (let k = -4; k <= 4; k++) { g.moveTo(x + w / 2 + k * w * 0.04, y + h * 0.45); g.lineTo(x + w / 2 + k * w * 0.3, y + h); }
    for (let k = 0; k < 4; k++) { const yy = y + h * (0.5 + Math.pow(k / 4, 1.8) * 0.5); g.moveTo(x, yy); g.lineTo(x + w, yy); }
    g.stroke();
  } else if (kind === 6) {
    g.fillStyle = "#24302c"; g.fillRect(x, y, w, h);
    g.fillStyle = "#3a4a44"; poly(g, [[x, y + h], [x + w * 0.4, y + h * 0.5], [x + w * 0.6, y + h * 0.5], [x + w, y + h]]); g.fill();
    g.fillStyle = "#11191a"; g.fillRect(x + w * 0.4, y + h * 0.2, w * 0.2, h * 0.3);
    g.fillStyle = "#c8ffe0"; g.fillRect(x + w * 0.3, y + h * 0.06, w * 0.4, h * 0.03);
  } else {
    g.fillStyle = "#04140f"; g.fillRect(x, y, w, h);
    const R = K.rng("data" + i);
    const scroll = (t * 14) % (h * 0.14);
    g.fillStyle = TEAL;
    for (let k = 0; k < 9; k++) {
      const yy = y + h * 0.1 + k * h * 0.14 - scroll;
      g.globalAlpha = 0.55;
      g.fillRect(x + w * 0.08, yy, w * (0.2 + R() * 0.6), h * 0.045);
    }
    g.globalAlpha = 1;
  }
  g.restore();
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  // flicker + rolling band + scanlines + glass falloff
  if (o.rewind) {
    const by = y + (((-t * 1.8 + i * 0.37) % 1 + 1) % 1) * h;
    g.fillStyle = "rgba(230,255,240,0.35)";
    g.fillRect(x, by, w, h * 0.08);
    g.fillStyle = "rgba(240,255,245,0.9)";
    const s = h * 0.13, ax = x + w * 0.1, ay = y + h * 0.12;
    poly(g, [[ax + s, ay], [ax + s, ay + s], [ax + s * 0.4, ay + s / 2]]); g.fill();
    poly(g, [[ax + s * 1.6, ay], [ax + s * 1.6, ay + s], [ax + s, ay + s / 2]]); g.fill();
  } else {
    const by = y + (((t * 0.12 + i * 0.29) % 1 + 1) % 1) * h * 1.3 - h * 0.15;
    g.fillStyle = "rgba(200,255,230,0.06)";
    g.fillRect(x, by, w, h * 0.12);
  }
  scanlines(g, x, y, w, h, 0.5, Math.max(2, h / 22));
  const vg = g.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.2, x + w / 2, y + h / 2, Math.hypot(w, h) * 0.6);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
  g.fillStyle = vg; g.fillRect(x, y, w, h);
  g.globalCompositeOperation = "lighter";
  g.fillStyle = "rgba(90,255,200,0.05)";
  g.fillRect(x, y, w, h);
  g.restore();
  if (o.label && h > 30) hudText(g, "CAM " + pad2(i + 1), x + 4, y + h - 5, Math.max(7, h * 0.11), "left", "#c8ffe0", 0.8);
}
const WALL_KINDS = [0, 1, 7, 2, 0, 6, 4, 3, 0, 5, 1, 0, 7, 2, 6, 0, 4, 0, 3, 7, 1, 0, 5, 6, 2, 0, 7, 4];
function monitorWall(g, x, y, w, h, t, o = {}) {
  const cols = 7, rows = 4;
  g.fillStyle = "#0a0f12";
  g.fillRect(x - w * 0.02, y - h * 0.03, w * 1.04, h * 1.06);
  const gx = w * 0.012, gy = h * 0.02;
  const cw = (w - gx * (cols - 1)) / cols, ch = (h - gy * (rows - 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const sx = x + c * (cw + gx), sy = y + r * (ch + gy);
      const off = o.flick && K.hash(Math.floor(t * 6) + i * 13, 5) < 0.04;
      screen(g, sx, sy, cw, ch, off ? 0 : WALL_KINDS[i], t, i, { rewind: o.rewind, label: o.label });
    }
  }
}

// ---- SHOT 1 [0-10] slow dolly through the lab ---------------------------------------------------
const FLASKS = [[3.15, 4.2, TEAL], [3.55, 5.4, AMBER], [3.0, 6.9, "#7aff6a"], [3.4, 8.3, TEAL], [3.1, 10.0, AMBER], [3.5, 11.6, TEAL], [3.2, 13.1, "#7aff6a"]];
function flask(g, sx, sy, s, color, t, i) {
  const h = 0.62 * s, w = 0.36 * s;
  K.glow(g, sx, sy - h * 0.35, h * 1.1, color, 0.35);
  const body = new Path2D();
  body.moveTo(sx - w * 0.12, sy - h);
  body.lineTo(sx - w * 0.12, sy - h * 0.62);
  body.quadraticCurveTo(sx - w * 0.55, sy - h * 0.25, sx - w * 0.5, sy - h * 0.04);
  body.quadraticCurveTo(sx, sy + h * 0.02, sx + w * 0.5, sy - h * 0.04);
  body.quadraticCurveTo(sx + w * 0.55, sy - h * 0.25, sx + w * 0.12, sy - h * 0.62);
  body.lineTo(sx + w * 0.12, sy - h);
  body.closePath();
  g.fillStyle = "rgba(160,200,200,0.12)";
  g.fill(body);
  g.save();
  g.clip(body);
  const lv = sy - h * 0.42;
  const lg = g.createLinearGradient(0, lv, 0, sy);
  lg.addColorStop(0, K.rgba(K.shade(color, 0.4), 0.95));
  lg.addColorStop(1, K.rgba(K.shade(color, -0.35), 0.95));
  g.fillStyle = lg;
  g.fillRect(sx - w, lv, w * 2, h);
  g.fillStyle = "rgba(255,255,255,0.75)";
  for (let b = 0; b < 6; b++) {
    const ph = (t * (0.5 + K.hash(b, i) * 0.6) + K.hash(b + 3, i)) % 1;
    const bx = sx + (K.hash(b + 7, i) - 0.5) * w * 0.6 + Math.sin(ph * 9 + b) * w * 0.04;
    const by = K.lerp(sy - h * 0.05, lv, ph);
    g.beginPath(); g.arc(bx, by, Math.max(0.4, s * 0.012 * (0.5 + K.hash(b, 2))), 0, K.TAU); g.fill();
  }
  g.restore();
  g.strokeStyle = "rgba(220,255,245,0.45)";
  g.lineWidth = Math.max(0.5, s * 0.008);
  g.stroke(body);
  g.strokeStyle = "rgba(255,255,255,0.5)";
  g.beginPath(); g.moveTo(sx - w * 0.3, sy - h * 0.3); g.lineTo(sx - w * 0.38, sy - h * 0.1); g.stroke();
  K.glow(g, sx, lv, w * 0.7, "#ffffff", 0.25);
}
function shotLab(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, -0.5, 11));
  const cam = { x: K.lerp(-0.35, 0.05, p), y: K.lerp(-0.05, -0.2, p), z: K.lerp(0, 4.4, p) };
  const F = 430, CX = 480, CY = 280;
  const P = (x, y, z) => { const d = Math.max(0.06, z - cam.z); const s = F / d; return [CX + (x - cam.x) * s, CY + (y - cam.y) * s, s, d]; };
  const zn = cam.z + 0.3, ZF = 17, FY = 1.6, CYL = -2.6;
  g.fillStyle = "#070b0d";
  g.fillRect(0, 0, W, H);
  // ceiling, walls, floor
  const q = (a) => a.map((v) => P(v[0], v[1], v[2]));
  const ceil = q([[-4, CYL, zn], [4, CYL, zn], [4, CYL, ZF], [-4, CYL, ZF]]);
  poly(g, ceil); g.fillStyle = "#0a1013"; g.fill();
  const lw = q([[-4, CYL, zn], [-4, CYL, ZF], [-4, FY, ZF], [-4, FY, zn]]);
  const rw = q([[4, CYL, zn], [4, CYL, ZF], [4, FY, ZF], [4, FY, zn]]);
  for (const wpts of [lw, rw]) {
    poly(g, wpts);
    const gr = g.createLinearGradient(wpts[0][0], 0, wpts[1][0], 0);
    gr.addColorStop(0, "#0b1215"); gr.addColorStop(1, "#16262a");
    g.fillStyle = gr; g.fill();
  }
  const fl = q([[-4, FY, zn], [4, FY, zn], [4, FY, ZF], [-4, FY, ZF]]);
  poly(g, fl);
  const fg = g.createLinearGradient(0, fl[2][1], 0, H);
  fg.addColorStop(0, "#15302c"); fg.addColorStop(0.3, "#0c1716"); fg.addColorStop(1, "#060a0b");
  g.fillStyle = fg; g.fill();
  // wall ribs + amber warning lights
  g.lineWidth = 1;
  for (let z = 2; z < ZF; z += 1.5) {
    if (z < zn) continue;
    for (const sx of [-4, 4]) {
      const a = P(sx, CYL, z), b = P(sx, FY, z);
      g.strokeStyle = K.rgba("#3a4a50", K.clamp(0.9 - (z - cam.z) / 18));
      g.lineWidth = Math.max(0.6, a[2] * 0.03);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      if (Math.round(z / 1.5) % 3 === 0) {
        const l = P(sx * 0.98, -1.4, z + 0.2);
        const pulse = 0.55 + 0.45 * Math.sin(t * 3 + z);
        K.glow(g, l[0], l[1], l[2] * 0.35, AMBER, 0.55 * pulse);
        g.fillStyle = K.mix(AMBER, "#fff3c0", 0.4);
        g.fillRect(l[0] - l[2] * 0.03, l[1] - l[2] * 0.02, l[2] * 0.06, l[2] * 0.04);
      }
    }
  }
  // floor grating
  g.strokeStyle = "rgba(90,140,140,0.16)";
  g.lineWidth = 0.8;
  g.beginPath();
  for (let z = Math.ceil(zn); z <= ZF; z += 1) { const a = P(-4, FY, z), b = P(4, FY, z); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
  for (let x = -3; x <= 3; x += 1) { const a = P(x, FY, zn), b = P(x, FY, ZF); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
  g.stroke();
  // far wall + the monitor wall
  const fw0 = P(-4, CYL, ZF), fw1 = P(4, FY, ZF);
  g.fillStyle = "#0d1619";
  g.fillRect(fw0[0], fw0[1], fw1[0] - fw0[0], fw1[1] - fw0[1]);
  const m0 = P(-3.4, -2.15, ZF), m1 = P(3.4, 0.95, ZF);
  const mw = m1[0] - m0[0], mh = m1[1] - m0[1];
  const ML = K.layer(280, 130, "f09mwall"); // fixed size (the wall is <= 260 x 110 here): no realloc per frame
  ML.g.translate(8 - m0[0], 8 - m0[1]);
  monitorWall(ML.g, m0[0], m0[1], mw, mh, t, { flick: true });
  const mpx = K.pixelScale(), msw = Math.min(280, mw + 16) * mpx, msh = Math.min(130, mh + 16) * mpx;
  g.drawImage(ML.canvas, 0, 0, msw, msh, m0[0] - 8, m0[1] - 8, mw + 16, mh + 16);
  K.glow(g, (m0[0] + m1[0]) / 2, (m0[1] + m1[1]) / 2, mw * 1.1, TEAL, 0.45);
  {
    // the wall's mirror image in the wet, polished floor: flipped about the floor line, smeared and
    // faded with distance (drawn twice, offset, as a cheap vertical blur), plus a soft bloom pool
    const fy = P(0, FY, ZF)[1];
    g.save();
    g.globalCompositeOperation = "lighter";
    g.translate(0, fy * 2);
    g.scale(1, -1);
    for (const [dy, a] of [[0, 0.26], [6, 0.14], [14, 0.08]]) {
      g.globalAlpha = a;
      g.drawImage(ML.canvas, 0, 0, msw, msh, m0[0] - 8, m0[1] - 8 - dy, mw + 16, (mh + 16) * 1.25);
    }
    g.restore();
    g.save(); g.translate((m0[0] + m1[0]) / 2, fy + mh * 0.35); g.scale(1, 0.35);
    K.glow(g, 0, 0, mw * 0.9, TEAL, 0.35);
    g.restore();
  }
  // wet floor reflection of the monitor wall
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let c = 0; c < 7; c++) {
    const xw = -3.4 + (c + 0.5) * (6.8 / 7);
    const a = P(xw, FY, ZF), b = P(xw, FY, zn + 1.2);
    const gr = g.createLinearGradient(0, a[1], 0, b[1]);
    const col = WALL_KINDS[c + 21] === 4 ? "#ff8a4a" : TEAL;
    gr.addColorStop(0, K.rgba(col, 0.1)); gr.addColorStop(0.5, K.rgba(col, 0.04)); gr.addColorStop(1, K.rgba(col, 0));
    g.fillStyle = gr;
    const w0 = a[2] * 0.6, w1 = b[2] * 0.35;
    poly(g, [[a[0] - w0, a[1]], [a[0] + w0, a[1]], [b[0] + w1, b[1]], [b[0] - w1, b[1]]]);
    g.fill();
  }
  g.restore();
  // haze over the far half (atmospheric perspective)
  const hz = g.createRadialGradient((m0[0] + m1[0]) / 2, (m0[1] + m1[1]) / 2, 10, (m0[0] + m1[0]) / 2, (m0[1] + m1[1]) / 2, 520);
  hz.addColorStop(0, "rgba(40,90,85,0.28)"); hz.addColorStop(1, "rgba(10,25,28,0.0)");
  g.fillStyle = hz; g.fillRect(0, 0, W, H);
  // ceiling pipes
  for (const [px, py, r] of [[-3.2, -2.3, 0.14], [-2.75, -2.38, 0.09], [2.9, -2.32, 0.16], [1.2, -2.48, 0.06]]) {
    const a0 = P(px, py - r, zn), a1 = P(px, py + r, zn), b0 = P(px, py - r, ZF), b1 = P(px, py + r, ZF);
    poly(g, [a0, b0, b1, a1]);
    const gr = g.createLinearGradient(a0[0], a0[1], a1[0], a1[1]);
    gr.addColorStop(0, "#3a474e"); gr.addColorStop(0.4, "#1c2428"); gr.addColorStop(1, "#0b1012");
    g.fillStyle = gr; g.fill();
  }
  // ceiling light strips + pools of light on the floor
  for (let z = 2.5; z < ZF; z += 3) {
    if (z < zn + 0.2) continue;
    const a = P(-1, CYL + 0.05, z), b = P(1, CYL + 0.05, z);
    const f = P(0, FY, z);
    g.save();
    g.translate(f[0], f[1]);
    g.scale(1, 0.22);
    K.glow(g, 0, 0, f[2] * 1.7, "#9fffe0", 0.25);
    g.restore();
    g.fillStyle = "#e8fff6";
    g.fillRect(a[0], a[1] - a[2] * 0.02, b[0] - a[0], Math.max(1, a[2] * 0.04));
    K.glow(g, (a[0] + b[0]) / 2, a[1], a[2] * 0.9, "#bfffe8", 0.35);
  }
  // objects, far to near: right bench with flasks, left conveyor with crates, vents, the cable
  const near = [];
  const benchZ0 = Math.max(2.2, zn), benchZ1 = 14;
  if (benchZ1 > zn) {
    const top = q([[2.4, 0.3, benchZ0], [4, 0.3, benchZ0], [4, 0.3, benchZ1], [2.4, 0.3, benchZ1]]);
    poly(g, top); g.fillStyle = "#2a353b"; g.fill();
    const face = q([[2.4, 0.3, benchZ0], [2.4, 0.3, benchZ1], [2.4, FY, benchZ1], [2.4, FY, benchZ0]]);
    poly(g, face);
    const gr = g.createLinearGradient(face[0][0], 0, face[1][0], 0);
    gr.addColorStop(0, "#0e1417"); gr.addColorStop(1, "#1b282c");
    g.fillStyle = gr; g.fill();
    g.strokeStyle = "rgba(160,220,210,0.35)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(top[0][0], top[0][1]); g.lineTo(top[3][0], top[3][1]); g.stroke();
  }
  const convZ0 = Math.max(1.5, zn), convZ1 = 15;
  {
    const top = q([[-4, 0.5, convZ0], [-2.6, 0.5, convZ0], [-2.6, 0.5, convZ1], [-4, 0.5, convZ1]]);
    poly(g, top); g.fillStyle = "#15191c"; g.fill();
    const face = q([[-2.6, 0.5, convZ0], [-2.6, 0.5, convZ1], [-2.6, FY, convZ1], [-2.6, FY, convZ0]]);
    poly(g, face); g.fillStyle = "#0c1113"; g.fill();
    g.strokeStyle = "rgba(255,176,0,0.55)"; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(face[0][0], face[0][1]); g.lineTo(face[1][0], face[1][1]); g.stroke();
    g.strokeStyle = "rgba(120,150,150,0.4)"; g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < 40; i++) {
      const z = convZ0 + ((i * 0.4 - t * 0.9) % 14 + 14) % 14;
      if (z > convZ1 || z < zn) continue;
      const a = P(-3.95, 0.5, z), b = P(-2.65, 0.5, z);
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    }
    g.stroke();
    for (let z = Math.ceil(convZ0 * 2) / 2; z < convZ1; z += 0.5) {
      if (z < zn + 0.1) continue;
      const r = P(-2.6, 0.58, z);
      const rr = Math.max(1, r[2] * 0.07);
      if (r[0] < -20 || r[0] > W + 20) continue;
      g.fillStyle = K.mix("#4a5559", "#0c1216", K.clamp((z - cam.z) / 16) * 0.7);
      g.beginPath(); g.ellipse(r[0], r[1], rr * 0.55, rr, 0, 0, K.TAU); g.fill();
      if (rr > 2) {
        const a = t * 6 + z * 3;
        g.strokeStyle = "rgba(200,230,225,0.45)"; g.lineWidth = Math.max(0.6, rr * 0.18);
        g.beginPath(); g.moveTo(r[0] - Math.cos(a) * rr * 0.5, r[1] - Math.sin(a) * rr * 0.9); g.lineTo(r[0] + Math.cos(a) * rr * 0.5, r[1] + Math.sin(a) * rr * 0.9); g.stroke();
      }
    }
  }
  const objs = [];
  for (let i = 0; i < 6; i++) {
    const z = 2 + ((i * 2.3 - t * 0.9) % 13.8 + 13.8) % 13.8;
    objs.push({ z, kind: "crate", i });
  }
  FLASKS.forEach((f, i) => objs.push({ z: f[1], kind: "flask", i }));
  objs.push({ z: 9, kind: "vent", x: -1.3 }, { z: 5.6, kind: "vent", x: 1.7 }, { z: 12.5, kind: "vent", x: 0.4 }, { z: 7, kind: "cable" });
  objs.sort((a, b) => b.z - a.z);
  const drawObj = (gg, o) => {
    if (o.z < zn + 0.05) return;
    if (o.kind === "crate") {
      const z = o.z, s = 0.55, x0 = -3.6, x1 = -3.6 + s * 1.3, y0 = 0.5 - s, y1 = 0.5;
      const hz = K.clamp((z - cam.z) / 16) * 0.65;          // atmospheric falloff toward the far wall
      const tone = (c) => K.mix(c, "#0c1216", hz);
      const F = [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)];
      const T = [P(x0, y0, z), P(x1, y0, z), P(x1, y0, z + s), P(x0, y0, z + s)];
      const S = [P(x1, y0, z), P(x1, y0, z + s), P(x1, y1, z + s), P(x1, y1, z)];
      // right side face (we see it: the camera is right of the conveyor) - in shadow
      poly(gg, S); gg.fillStyle = tone("#4a3622"); gg.fill();
      // top face - lit by the ceiling strips
      poly(gg, T);
      const tg = gg.createLinearGradient(T[0][0], T[0][1], T[3][0], T[3][1]);
      tg.addColorStop(0, tone("#b08d5e")); tg.addColorStop(1, tone("#8a6c45"));
      gg.fillStyle = tg; gg.fill();
      // front face - mid tone, darker toward the bottom (bounce from the dark belt)
      poly(gg, F);
      const fg2 = gg.createLinearGradient(0, F[0][1], 0, F[3][1]);
      fg2.addColorStop(0, tone("#8c6b42")); fg2.addColorStop(1, tone("#5e4529"));
      gg.fillStyle = fg2; gg.fill();
      // packing tape: along the top seam and down the front, slightly glossy
      const mid = (p, q, u) => [K.lerp(p[0], q[0], u), K.lerp(p[1], q[1], u)];
      gg.fillStyle = K.rgba(tone("#d8c49a"), 0.85);
      poly(gg, [mid(T[0], T[1], 0.42), mid(T[0], T[1], 0.58), mid(T[3], T[2], 0.58), mid(T[3], T[2], 0.42)]); gg.fill();
      poly(gg, [mid(F[0], F[1], 0.42), mid(F[0], F[1], 0.58), mid(F[3], F[2], 0.58), mid(F[3], F[2], 0.42)]); gg.fill();
      gg.fillStyle = "rgba(255,255,255,0.18)";
      poly(gg, [mid(T[0], T[1], 0.45), mid(T[0], T[1], 0.5), mid(T[3], T[2], 0.5), mid(T[3], T[2], 0.45)]); gg.fill();
      // shipping label + edge creases
      const L0 = mid(F[0], F[2], 0.25), L1 = mid(F[0], F[2], 0.4);
      gg.fillStyle = K.rgba(tone("#e8e4da"), 0.9);
      gg.fillRect(L0[0] + (F[1][0] - F[0][0]) * 0.02, L0[1] + (F[3][1] - F[0][1]) * 0.25, (L1[0] - L0[0]) * 0.9, (F[3][1] - F[0][1]) * 0.22);
      gg.strokeStyle = "rgba(30,20,10,0.55)"; gg.lineWidth = Math.max(0.5, F[0][2] * 0.008);
      poly(gg, F); gg.stroke();
      gg.strokeStyle = "rgba(255,230,190,0.25)";
      gg.beginPath(); gg.moveTo(T[3][0], T[3][1]); gg.lineTo(T[2][0], T[2][1]); gg.lineTo(T[1][0], T[1][1]); gg.stroke();
    } else if (o.kind === "flask") {
      const f = FLASKS[o.i];
      const pp = P(f[0], 0.3, f[1]);
      flask(gg, pp[0], pp[1], pp[2], f[2], t, o.i);
    } else if (o.kind === "vent") {
      const v = P(o.x, FY, o.z);
      gg.save(); gg.translate(v[0], v[1]); gg.scale(1, 0.25);
      gg.fillStyle = "rgba(5,9,10,0.55)"; gg.fillRect(-v[2] * 0.3, -v[2] * 0.3, v[2] * 0.6, v[2] * 0.6);
      gg.fillStyle = "rgba(120,170,165,0.25)";
      for (let k = -2; k <= 2; k++) gg.fillRect(-v[2] * 0.3, k * v[2] * 0.11 - v[2] * 0.01, v[2] * 0.6, v[2] * 0.03);
      gg.restore();
      const spr = K.glowSprite("#b9d3d0");
      gg.save();
      for (let i = 0; i < 16; i++) {
        const age = ((t * 0.38 + i / 16 + o.x) % 1 + 1) % 1;
        const wp = P(o.x + K.noise(t * 0.6 + i * 3, 4) * 0.45 * age + age * 0.25, FY - age * 3.6, o.z);
        const r = wp[2] * (0.18 + age * 0.85);
        gg.globalAlpha = Math.sin(Math.pow(age, 0.6) * Math.PI) * 0.55;
        gg.drawImage(spr, wp[0] - r, wp[1] - r, r * 2, r * 2);
      }
      // the plume catches the ceiling light: a brighter core near the grate
      const vb = P(o.x, FY - 0.4, o.z);
      K.glow(gg, vb[0], vb[1], vb[2] * 0.5, "#dff6f2", 0.25);
      gg.restore();
    } else if (o.kind === "cable") {
      const a = P(1.7, CYL, o.z), b = P(1.35, -0.85, o.z - 0.2);
      gg.strokeStyle = "#0b0d0e"; gg.lineWidth = Math.max(1, a[2] * 0.035);
      gg.beginPath(); gg.moveTo(a[0], a[1]); gg.quadraticCurveTo(a[0] + a[2] * 0.25, (a[1] + b[1]) / 2, b[0], b[1]); gg.stroke();
      // sparks: bursts every 1.7 s, ballistic, pure in t
      // always smouldering: a flickering hot point at the frayed end
      K.glow(gg, b[0], b[1], b[2] * 0.35, "#ffd27a", 0.35 + 0.35 * K.hash(Math.floor(t * 14), 6));
      for (let k = 0; k < 2; k++) {
        const tb = (Math.floor(t / 1.1) - k) * 1.1 + K.hash(Math.floor(t / 1.1) - k, 2) * 0.3;
        const age = t - tb;
        if (age < 0 || age > 1) continue;
        const fl = Math.exp(-age * 9);
        K.glow(gg, b[0], b[1], b[2] * 1.6, "#ffd27a", 0.7 * fl);
        const fp = P(1.35, FY, o.z - 0.2);
        gg.save(); gg.translate(fp[0], fp[1]); gg.scale(1, 0.2); K.glow(gg, 0, 0, fp[2] * 1.3, "#ffb000", 0.5 * fl); gg.restore();
        gg.lineCap = "round";
        for (let i = 0; i < 16; i++) {
          const seed = Math.floor(tb * 10) + i * 1.7;
          const vx = (K.hash(seed, 1) - 0.5) * 2.4, vy = -0.4 - K.hash(seed, 2) * 1.6;
          const life = 0.45 + K.hash(seed, 3) * 0.5;
          if (age > life) continue;
          const pos = (aa) => P(1.35 + vx * aa, -0.85 + vy * aa + 4.9 * aa * aa, o.z - 0.2);
          const p1 = pos(age), p0 = pos(Math.max(0, age - 0.035));
          gg.strokeStyle = K.rgba(K.mix("#fff6d0", AMBER, age / life), 1 - age / life);
          gg.lineWidth = Math.max(0.8, p1[2] * 0.012);
          gg.beginPath(); gg.moveTo(p0[0], p0[1]); gg.lineTo(p1[0], p1[1]); gg.stroke();
        }
      }
    }
  };
  for (const o of objs) {
    if (o.z - cam.z < 2.1) near.push(o);
    else drawObj(g, o);
  }
  if (near.length) {
    const L = K.blurLayer(W, H, "f09near", 5, (lg) => { for (const o of near) drawObj(lg, o); });
    K.dof(g, L.canvas, 5);
  }
  K.dust(g, W, H, t, { seed: 91, count: 46, color: "#bfffe8", size: 1.4, alpha: 0.45 });
}

// ---- SHOT 2 [10-17.2] over your shoulder at the monitor wall ------------------------------------
function kidSilhouette(g, W, H, x, y, h, t, light, o = {}) {
  const L = K.layer(W, H, "f09kid");
  K.drawPerson(L.g, x, y, h, Object.assign({ view: "back", t, light, shadow: false, bell: true }, o));
  L.g.globalCompositeOperation = "source-atop";
  const gr = L.g.createLinearGradient(0, y - h, 0, y);
  gr.addColorStop(0, `rgba(4,12,14,${o.dark0 == null ? 0.7 : o.dark0})`);
  gr.addColorStop(1, `rgba(2,6,8,${o.dark1 == null ? 0.9 : o.dark1})`);
  L.g.fillStyle = gr;
  L.g.fillRect(0, 0, W, H);
  // the yellow hoodie keeps a little of its own warmth under the cold key (it must still read yellow
  // after the green grade): a soft warm lift across the shoulders
  const wl = L.g.createRadialGradient(x, y - h * 0.68, h * 0.04, x, y - h * 0.62, h * 0.42);
  wl.addColorStop(0, `rgba(232,185,35,${o.warm == null ? 0.3 : o.warm})`);
  wl.addColorStop(1, "rgba(232,185,35,0)");
  L.g.fillStyle = wl;
  L.g.fillRect(0, 0, W, H);
  L.g.globalCompositeOperation = "source-over";
  g.drawImage(L.canvas, 0, 0, W, H);
  // rim: the silhouette minus itself shifted away from the light, tinted with the light colour,
  // then drawn BLURRED so it is a soft wrap of light, not an outline
  if (light) {
    const R = K.layer(W, H, "f09kidrim");
    K.drawPerson(R.g, x, y, h, Object.assign({ view: "back", t, light, shadow: false, bell: true }, o));
    const dx = x - light.x, dy = (y - h * 0.6) - light.y, dl = Math.hypot(dx, dy) || 1;
    const k = Math.min(6, h * 0.0045);
    R.g.setTransform(1, 0, 0, 1, 0, 0);
    R.g.globalCompositeOperation = "destination-out";
    R.g.drawImage(R.canvas, (dx / dl) * k * K.pixelScale(), (dy / dl) * k * K.pixelScale());
    R.g.globalCompositeOperation = "source-atop";
    R.g.fillStyle = light.color;
    R.g.fillRect(0, 0, R.canvas.width, R.canvas.height);
    g.save();
    g.globalCompositeOperation = "lighter";
    K.dof(g, R.canvas, Math.max(1.6, k * 0.9), 0.7 * (o.rimA || 1));
    g.globalAlpha = 0.25 * (o.rimA || 1);
    g.drawImage(R.canvas, 0, 0, W, H);
    g.restore();
  }
}
function shotWall(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 10, 17.4));
  K.withCamera(g, W, H, { x: 480 + p * 18, y: 270, zoom: 1.02 + p * 0.05, shakeT: t, shakeAmt: 1.1 }, () => {
    g.fillStyle = "#081013"; g.fillRect(-40, -40, W + 80, H + 80);
    monitorWall(g, 40, 40, 880, 380, t, { flick: true, label: true });
    K.glow(g, 480, 230, 620, TEAL, 0.2);
    // desk edge in the foreground
    const dg = g.createLinearGradient(0, 430, 0, 560);
    dg.addColorStop(0, "#26343a"); dg.addColorStop(0.08, "#121a1e"); dg.addColorStop(1, "#05090b");
    g.fillStyle = dg;
    g.fillRect(-40, 430, W + 80, 140);
    g.fillStyle = "rgba(160,255,225,0.35)";
    g.fillRect(-40, 430, W + 80, 1.5);
    for (let i = 0; i < 14; i++) {
      const bx = 520 + i * 26, on = K.hash(i, 8) > 0.4;
      const bl = on ? 0.6 + 0.4 * Math.sin(t * (1 + K.hash(i, 3) * 3) + i) : 0.1;
      g.fillStyle = K.rgba(i % 5 === 0 ? AMBER : TEAL, 0.25 + bl * 0.6);
      g.fillRect(bx, 452, 12, 5);
      K.glow(g, bx + 6, 454, 12, i % 5 === 0 ? AMBER : TEAL, bl * 0.35);
    }
    // the big rewind button (we will see it close at 17.2)
    K.glow(g, 830, 470, 40, AMBER, 0.4);
    g.fillStyle = "#7a5400"; g.beginPath(); g.ellipse(830, 470, 26, 9, 0, 0, K.TAU); g.fill();
    g.fillStyle = "#e09a10"; g.beginPath(); g.ellipse(830, 466, 22, 7, 0, 0, K.TAU); g.fill();
    // you, over the shoulder: back-lit by the screens, rim light in teal
    kidSilhouette(g, W, H, 250, 1010, 820, t, { x: 520, y: 150, color: "#8affd8", strength: 1.6 }, { hood: false });
  });
  K.dust(g, W, H, t, { seed: 92, count: 30, color: "#bfffe8", size: 1.3, alpha: 0.35, area: [300, 40, 640, 400] });
}

// ---- SHOT 2b [17.2-20] insert: your hand on the REWIND button -----------------------------------
function shotButton(g, t, W, H) {
  const p = K.seg(t, 17.2, 20);
  const press = K.smooth(K.seg(t, 17.75, 18.0)) * (1 - K.smooth(K.seg(t, 18.35, 18.7)));
  const lit = K.seg(t, 17.9, 18.05);
  K.withCamera(g, W, H, { x: 480, y: 270, zoom: 1.04 + p * 0.04, shakeT: t, shakeAmt: 1 + press * 3 }, () => {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#1c272c"); bg.addColorStop(1, "#0a1013");
    g.fillStyle = bg; g.fillRect(-40, -40, W + 80, H + 80);
    // brushed panel
    g.strokeStyle = "rgba(255,255,255,0.025)"; g.lineWidth = 1;
    g.beginPath();
    for (let y = -40; y < H + 40; y += 3) { g.moveTo(-40, y); g.lineTo(W + 40, y + 6); }
    g.stroke();
    // screws, small switches, label tape
    for (const [sx, sy] of [[60, 60], [900, 60], [60, 480], [900, 480]]) {
      g.fillStyle = "#3a464c"; g.beginPath(); g.arc(sx, sy, 9, 0, K.TAU); g.fill();
      g.strokeStyle = "#11181b"; g.lineWidth = 2; g.beginPath(); g.moveTo(sx - 6, sy); g.lineTo(sx + 6, sy); g.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const sx = 120 + i * 70;
      g.fillStyle = "#0b1012"; g.fillRect(sx - 14, 120, 28, 50);
      g.fillStyle = "#9aa8ae"; g.fillRect(sx - 5, i % 2 ? 128 : 146, 10, 18);
      const on = K.hash(i, 4) > 0.5;
      g.fillStyle = on ? TEAL : "#16302a";
      g.beginPath(); g.arc(sx, 190, 5, 0, K.TAU); g.fill();
      if (on) K.glow(g, sx, 190, 18, TEAL, 0.6);
    }
    g.save(); g.translate(560, 420); g.rotate(-0.03);
    g.fillStyle = "#e9e2c8"; g.fillRect(-90, -16, 180, 32);
    g.font = `700 22px ${MONO}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#1a1a1a";
    g.fillText("REWIND", 0, 1);
    g.restore();
    // the button
    const bx = 560, by = 290, br = 92;
    g.fillStyle = "#0a0d0f"; g.beginPath(); g.ellipse(bx, by + 18, br * 1.18, br * 0.62, 0, 0, K.TAU); g.fill();
    g.fillStyle = "#4a5560"; g.beginPath(); g.ellipse(bx, by + 10, br * 1.12, br * 0.56, 0, 0, K.TAU); g.fill();
    const dz = press * 10;
    g.fillStyle = "#6a4300"; g.beginPath(); g.ellipse(bx, by + 6 + dz, br, br * 0.5, 0, 0, K.TAU); g.fill();
    const cg = g.createRadialGradient(bx - 30, by - 20 + dz, 5, bx, by + dz, br);
    cg.addColorStop(0, K.mix("#ffd36a", "#fff3c0", lit));
    cg.addColorStop(0.6, K.mix("#c27a00", AMBER, lit));
    cg.addColorStop(1, "#7a4a00");
    g.fillStyle = cg; g.beginPath(); g.ellipse(bx, by + dz, br * 0.96, br * 0.47, 0, 0, K.TAU); g.fill();
    g.fillStyle = K.rgba("#3a2200", 0.8);
    const s = 34, ay = by + dz;
    poly(g, [[bx - 4, ay - 16], [bx - 4, ay + 16], [bx - 4 - s, ay]]); g.fill();
    poly(g, [[bx + 30, ay - 16], [bx + 30, ay + 16], [bx + 30 - s, ay]]); g.fill();
    if (lit > 0) {
      K.glow(g, bx, by + dz, 240, AMBER, 0.45 * lit);
      K.glow(g, bx, by + dz, 90, "#fff3c0", 0.3 * lit);
    }
    // your hand: in from the bottom right, wrist (hoodie cuff + the brass bell on its red string)
    // inside the frame; the index finger pad presses at 17.9
    const reach = K.ease.out(K.seg(t, 17.2, 17.85));
    const hx = K.lerp(1000, 734, reach), hy = K.lerp(600, 386, reach) + press * 10;
    if (reach > 0.85) {
      // contact: the pad's soft shadow on the cap, darker as it presses
      const cx = 556, cy = 300 + dz;
      g.save(); g.translate(cx, cy); g.scale(1, 0.45);
      const cs = g.createRadialGradient(0, 0, 0, 0, 0, 30);
      cs.addColorStop(0, `rgba(40,20,0,${0.35 + press * 0.35})`); cs.addColorStop(1, "rgba(40,20,0,0)");
      g.fillStyle = cs; g.beginPath(); g.arc(0, 0, 30, 0, K.TAU); g.fill();
      g.restore();
    }
    K.drawHand(g, hx, hy, 236, { pose: "point", angle: -2.47, bell: true, t, light: { x: bx, y: by, color: lit > 0 ? "#ffcf7a" : "#9fffe0", strength: 1.2 } });
    if (press > 0.05) {
      // the finger pad flattens against the button: a squashed pale contact patch at the tip
      g.save(); g.translate(557, 299 + dz); g.rotate(-0.67);
      g.fillStyle = `rgba(255,214,180,${0.55 * press})`;
      g.beginPath(); g.ellipse(0, 0, 11, 5 + press * 2, 0, 0, K.TAU); g.fill();
      g.restore();
      K.glow(g, 557, 300 + dz, 26, "#ffcf7a", 0.35 * press);
    }
  });
  K.dust(g, W, H, t, { seed: 93, count: 22, color: "#ffe2a0", size: 1.6, alpha: 0.3 });
}

// ---- SHOT 3 [20-34] the CCTV footage, CAM 07 -----------------------------------------------------
// A real high-corner security camera: mounted top-right at 2.4 m, pitched down ~20 deg, looking
// diagonally down a corridor (world metres: x across -1.8..1.8, y up 0..3, z away 0..22).
// Every projected point goes through a barrel (fisheye) bulge so straight lines bow at the edges.
const CC = (() => {
  const pos = [1.0, 2.75, 0], tgt = [-0.25, 0.2, 7.2];
  let f = [tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]];
  const fl = Math.hypot(f[0], f[1], f[2]);
  f = [f[0] / fl, f[1] / fl, f[2] / fl];
  let r = [f[2], 0, -f[0]];
  const rl = Math.hypot(r[0], r[2]);
  r = [r[0] / rl, 0, r[2] / rl];
  const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
  return { pos, f, r, u, F: 520, roll: 0.035 };
})();
const BARREL = 0.16;
function cproj(x, y, z) {
  const d = [x - CC.pos[0], y - CC.pos[1], z - CC.pos[2]];
  const cz = Math.max(0.12, d[0] * CC.f[0] + d[1] * CC.f[1] + d[2] * CC.f[2]);
  let cx = (d[0] * CC.r[0] + d[1] * CC.r[1] + d[2] * CC.r[2]) / cz;
  let cy = -(d[0] * CC.u[0] + d[1] * CC.u[1] + d[2] * CC.u[2]) / cz;
  // slight camera roll (mounted crooked), then the lens bulge
  const cr = Math.cos(CC.roll), sr = Math.sin(CC.roll);
  [cx, cy] = [cx * cr - cy * sr, cx * sr + cy * cr];
  const sx = cx * CC.F, sy = cy * CC.F;
  const nx = sx / 560, ny = sy / 560, r2 = nx * nx + ny * ny;
  const k = (1 - BARREL * r2) / (1 - BARREL * 0.45);
  return [480 + sx * k, 262 + sy * k, (CC.F / cz) * k, cz];
}
// polygon in world space with each edge subdivided (so the fisheye curves it)
function cpoly(g, pts, sub = 8) {
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    for (let k = 0; k < sub; k++) {
      const u = k / sub;
      const p = cproj(K.lerp(a[0], b[0], u), K.lerp(a[1], b[1], u), K.lerp(a[2], b[2], u));
      if (i === 0 && k === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
    }
  }
  g.closePath();
}
function cline(g, a, b, sub = 10) {
  for (let k = 0; k <= sub; k++) {
    const u = k / sub;
    const p = cproj(K.lerp(a[0], b[0], u), K.lerp(a[1], b[1], u), K.lerp(a[2], b[2], u));
    if (k === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
  }
}
// an affine frame locally tangent to a wall/floor plane: origin o, unit axes ax, ay (world)
function planeXf(g, o, ax, ay) {
  const p0 = cproj(o[0], o[1], o[2]);
  const p1 = cproj(o[0] + ax[0], o[1] + ax[1], o[2] + ax[2]);
  const p2 = cproj(o[0] + ay[0], o[1] + ay[1], o[2] + ay[2]);
  g.transform(p1[0] - p0[0], p1[1] - p0[1], p2[0] - p0[0], p2[1] - p0[1], p0[0], p0[1]);
}
const WX0 = -2.0, WX1 = 2.0, CEIL = 3, ZN = 0.9, ZF = 24;
const LIGHTS_Z = [2.5, 6.5, 10.5, 14.5, 18.5, 22.5];
function corridorPaint(g) {
  g.fillStyle = "#0b1012"; g.fillRect(0, 0, 960, 540);
  // far end wall (dim, a closed fire door)
  cpoly(g, [[WX0, 0, ZF], [WX1, 0, ZF], [WX1, CEIL, ZF], [WX0, CEIL, ZF]], 2);
  g.fillStyle = "#1c2629"; g.fill();
  cpoly(g, [[-0.55, 0, ZF - 0.01], [0.55, 0, ZF - 0.01], [0.55, 2.1, ZF - 0.01], [-0.55, 2.1, ZF - 0.01]], 2);
  g.fillStyle = "#2e3b40"; g.fill();
  // ceiling
  cpoly(g, [[WX0, CEIL, ZN], [WX1, CEIL, ZN], [WX1, CEIL, ZF], [WX0, CEIL, ZF]]);
  g.fillStyle = "#151c1f"; g.fill();
  // walls: lit nearer, falling off into the distance (inverse-square-ish on a gradient)
  // (each wall gets its own near-to-far gradient axis)
  for (const [x, c0, c1] of [[WX0, "#66767a", "#263135"], [WX1, "#58676b", "#232d30"]]) {
    const nearW = cproj(x, 1.2, ZN + 0.6), farW = cproj(x, 1.2, ZF);
    cpoly(g, [[x, 0, ZN], [x, CEIL, ZN], [x, CEIL, ZF], [x, 0, ZF]]);
    const wg = g.createLinearGradient(nearW[0], nearW[1], farW[0], farW[1]);
    wg.addColorStop(0, c0); wg.addColorStop(1, c1);
    g.fillStyle = wg; g.fill();
  }
  // wall dado line + skirting
  g.strokeStyle = "rgba(20,28,30,0.7)"; g.lineWidth = 2;
  g.beginPath(); cline(g, [WX0, 1.0, ZN], [WX0, 1.0, ZF], 16); cline(g, [WX1, 1.0, ZN], [WX1, 1.0, ZF], 16); g.stroke();
  g.fillStyle = "#1a2124";
  cpoly(g, [[WX1, 0, ZN], [WX1, 0.12, ZN], [WX1, 0.12, ZF], [WX1, 0, ZF]], 12); g.fill();
  // right wall: a door, a notice board and a wall light (seen almost edge-on from the corner)
  for (const [z0, z1, y0, y1, col] of [[7.5, 8.5, 0, 2.15, "#2c383b"], [3.4, 4.6, 1.2, 1.9, "#3a4648"], [14, 15, 0, 2.15, "#2c383b"]]) {
    cpoly(g, [[WX1 - 0.005, y0, z0], [WX1 - 0.005, y1, z0], [WX1 - 0.005, y1, z1], [WX1 - 0.005, y0, z1]], 4);
    g.fillStyle = col; g.fill();
    g.strokeStyle = "#141b1d"; g.lineWidth = 2; g.stroke();
  }
  for (let k = 0; k < 5; k++) {
    const z = 3.55 + k * 0.22, y = 1.35 + K.hash(k, 3) * 0.35;
    cpoly(g, [[WX1 - 0.01, y, z], [WX1 - 0.01, y + 0.2, z], [WX1 - 0.01, y + 0.2, z + 0.16], [WX1 - 0.01, y, z + 0.16]], 1);
    g.fillStyle = "rgba(225,232,228,0.55)"; g.fill();
  }
  g.fillStyle = "#1a2124";
  cpoly(g, [[WX0, 0, ZN], [WX0, 0.12, ZN], [WX0, 0.12, ZF], [WX0, 0, ZF]], 12); g.fill();
  // doors + the lab window on the left wall
  for (const z0 of [3.2, 12.4, 19.5]) {
    cpoly(g, [[WX0 + 0.005, 0, z0], [WX0 + 0.005, 2.15, z0], [WX0 + 0.005, 2.15, z0 + 1.0], [WX0 + 0.005, 0, z0 + 1.0]], 3);
    g.fillStyle = "#2a3639"; g.fill();
    g.strokeStyle = "#141b1d"; g.lineWidth = 2.5; g.stroke();
    cpoly(g, [[WX0 + 0.01, 1.2, z0 + 0.3], [WX0 + 0.01, 1.75, z0 + 0.3], [WX0 + 0.01, 1.75, z0 + 0.7], [WX0 + 0.01, 1.2, z0 + 0.7]], 2);
    g.fillStyle = "#16201f"; g.fill();
    const hdl = cproj(WX0 + 0.02, 1.0, z0 + 0.85);
    g.fillStyle = "#c9d2d4"; g.fillRect(hdl[0] - hdl[2] * 0.05, hdl[1] - hdl[2] * 0.012, hdl[2] * 0.1, Math.max(1, hdl[2] * 0.025));
  }
  // lab window: glowing teal, with silhouetted equipment
  cpoly(g, [[WX0 + 0.01, 0.9, 6.2], [WX0 + 0.01, 2.0, 6.2], [WX0 + 0.01, 2.0, 9.6], [WX0 + 0.01, 0.9, 9.6]], 6);
  g.fillStyle = "#1d3c36"; g.fill();
  g.save(); g.clip();
  for (let k = 0; k < 6; k++) {
    const z = 6.5 + k * 0.52, h = 0.25 + K.hash(k, 7) * 0.45;
    cpoly(g, [[WX0 + 0.02, 0.9, z], [WX0 + 0.02, 0.9 + h, z], [WX0 + 0.02, 0.9 + h, z + 0.3], [WX0 + 0.02, 0.9, z + 0.3]], 2);
    g.fillStyle = "#10201d"; g.fill();
  }
  const lw0 = cproj(WX0, 1.5, 7.6);
  K.glow(g, lw0[0], lw0[1], lw0[2] * 1.6, "#7affd0", 0.45);
  g.restore();
  g.strokeStyle = "#11181a"; g.lineWidth = 4;
  cpoly(g, [[WX0 + 0.01, 0.9, 6.2], [WX0 + 0.01, 2.0, 6.2], [WX0 + 0.01, 2.0, 9.6], [WX0 + 0.01, 0.9, 9.6]], 6); g.stroke();
  // stencil "SECTOR 7" painted on the wall, in the wall's own perspective
  g.save();
  planeXf(g, [WX0 + 0.01, 2.45, 10.0], [0, 0, 1], [0, -1, 0]);
  g.font = `800 0.42px ${MONO}`; g.textBaseline = "middle"; g.fillStyle = "rgba(220,232,228,0.5)";
  g.fillText("SECTOR 7", 0, 0);
  g.restore();
  // fire extinguisher + alarm box
  {
    const a = cproj(WX0 + 0.12, 0.35, 5.0), b = cproj(WX0 + 0.12, 0.95, 5.0);
    const w = a[2] * 0.16;
    g.fillStyle = "#8a1e1e"; g.fillRect(a[0] - w / 2, b[1], w, a[1] - b[1]);
    g.fillStyle = "rgba(255,210,200,0.35)"; g.fillRect(a[0] - w * 0.25, b[1] + 2, w * 0.15, a[1] - b[1] - 4);
    g.fillStyle = "#222"; g.fillRect(a[0] - w * 0.3, b[1] - w * 0.4, w * 0.6, w * 0.45);
    const c = cproj(WX0 + 0.01, 1.5, 11.6);
    g.fillStyle = "#c22a2a"; g.fillRect(c[0] - c[2] * 0.08, c[1] - c[2] * 0.1, c[2] * 0.12, c[2] * 0.18);
  }
  // pipe run along the left wall-ceiling edge, shaded as a cylinder
  for (const [py, pr, col] of [[2.72, 0.07, "#6c7b80"], [2.55, 0.045, "#55636a"]]) {
    g.lineCap = "round";
    const p0 = cproj(WX0 + 0.12, py, ZN), p1 = cproj(WX0 + 0.12, py, ZF);
    g.strokeStyle = "#1a2124"; g.lineWidth = Math.max(1, p0[2] * pr * 2.2);
    g.beginPath(); cline(g, [WX0 + 0.12, py, 3.5], [WX0 + 0.12, py, ZF], 20); g.stroke();
    g.strokeStyle = col; g.lineWidth = Math.max(0.8, p0[2] * pr * 1.3);
    g.beginPath(); cline(g, [WX0 + 0.12, py + pr * 0.3, 3.5], [WX0 + 0.12, py + pr * 0.3, ZF], 20); g.stroke();
    void p1;
  }
  // floor: polished concrete, darker far away
  cpoly(g, [[WX0, 0, ZN], [WX1, 0, ZN], [WX1, 0, ZF], [WX0, 0, ZF]], 12);
  const f0 = cproj(0, 0, 1), f1 = cproj(0, 0, ZF);
  const fg = g.createLinearGradient(f0[0], f0[1], f1[0], f1[1]);
  fg.addColorStop(0, "#66737a"); fg.addColorStop(0.45, "#3e494d"); fg.addColorStop(1, "#1d2427");
  g.fillStyle = fg; g.fill();
  // tile joints converging to the vanishing point (bowed by the lens)
  g.strokeStyle = "rgba(18,24,26,0.42)"; g.lineWidth = 1.3;
  g.beginPath();
  for (let x = -1.2; x <= 1.21; x += 0.6) cline(g, [x, 0, ZN], [x, 0, ZF], 18);
  for (let z = 0; z <= ZF; z += 0.6) cline(g, [WX0, 0, z], [WX1, 0, z], 8);
  g.stroke();
  // yellow/black hazard edge along the left wall
  for (let z = 0; z < ZF; z += 0.5) {
    cpoly(g, [[WX0 + 0.12, 0.001, z], [WX0 + 0.3, 0.001, z + 0.12], [WX0 + 0.3, 0.001, z + 0.37], [WX0 + 0.12, 0.001, z + 0.25]], 1);
    g.fillStyle = "rgba(190,165,50,0.75)"; g.fill();
  }
  // ceiling light panels + the pools they throw + their reflections in the polished floor
  for (const z of LIGHTS_Z) {
    cpoly(g, [[-0.35, CEIL - 0.01, z], [0.35, CEIL - 0.01, z], [0.35, CEIL - 0.01, z + 1.1], [-0.35, CEIL - 0.01, z + 1.1]], 2);
    g.fillStyle = "#f2fffb"; g.fill();
    const c = cproj(0, CEIL - 0.05, z + 0.55);
    K.glow(g, c[0], c[1], c[2] * 0.9, "#dffff4", 0.35);
    const fp = cproj(-0.1, 0, z + 0.55);
    g.save(); g.translate(fp[0], fp[1]); g.scale(1, 0.42);
    K.glow(g, 0, 0, fp[2] * 1.8, "#e6fff6", 0.22);
    g.restore();
    // mirror image of the panel below the floor plane = its reflection
    const rp = cproj(0, -CEIL + 0.05, z + 0.55);
    const rr = cproj(0, -CEIL + 0.05, z + 1.1);
    g.save(); g.translate(rp[0], rp[1]); g.rotate(Math.atan2(rr[1] - rp[1], rr[0] - rp[0]) - Math.PI / 2); g.scale(0.35, 1.4);
    K.glow(g, 0, 0, rp[2] * 0.5, "#e6fff6", 0.18);
    g.restore();
  }
  // atmospheric falloff into the far end
  const fe = cproj(0, 1.2, ZF);
  const ag = g.createRadialGradient(fe[0], fe[1], 4, fe[0], fe[1], 260);
  ag.addColorStop(0, "rgba(10,16,18,0.55)"); ag.addColorStop(1, "rgba(10,16,18,0)");
  g.fillStyle = ag; g.fillRect(0, 0, 960, 540);
}
const PATHS = [
  // Biscuit leads; then the grey kitten, the black cat and the cream cat. Each walks its own line
  // from the far end toward the camera and stops in a staggered, back-to-front group.
  { coat: null, a: [-0.7, 17.5], b: [0.45, 3.6], start: 20.6, size: 0.3 },
  { coat: "grey", a: [-1.0, 19.0], b: [-0.35, 7.4], start: 24.2, size: 0.19 },
  { coat: "black", a: [0.2, 19.5], b: [1.15, 6.0], start: 22.4, size: 0.27 },
  { coat: "cream", a: [-1.4, 20.0], b: [-0.95, 4.5], start: 23.2, size: 0.25 },
];
for (const c of PATHS) c.maxP = cproj(c.b[0], 0, c.b[1])[2]; // projected scale where each cat stops
const CAT_V = 1.75; // m/s, an unhurried walk
function walkS(t, start, dist) {
  // constant speed, then a 1 m deceleration to a stop. Pure in t.
  const tr = Math.max(0, t - start);
  const T1 = Math.max(0, (dist - 1) / CAT_V);
  if (tr <= T1) return Math.min(dist, tr * CAT_V);
  const tt = Math.min(tr - T1, 2 / CAT_V);
  return Math.min(dist, dist - 1 + CAT_V * tt - CAT_V * CAT_V * tt * tt / 4);
}
function cctvState(t) {
  return PATHS.map((c, i) => {
    const dx = c.b[0] - c.a[0], dz = c.b[1] - c.a[1], dist = Math.hypot(dx, dz);
    const s = walkS(t, c.start, dist);
    const u = s / dist;
    const wx = c.a[0] + dx * u, wz = c.a[1] + dz * u;
    const p = cproj(wx, 0, wz);
    const q = cproj(wx + dx / dist * 0.2, 0, wz + dz / dist * 0.2);
    const moving = t > c.start && s < dist - 0.02;
    return { i, c, wx, wz, x: p[0], y: p[1], size: c.size * p[2] * 1.55, cz: p[3], moving, phase: s / 0.62, facing: q[0] >= p[0] ? 1 : -1, s, dist, dirx: dx / dist, dirz: dz / dist };
  });
}
function cctvScene(g, t) {
  g.drawImage(K.sprite("f09corr", 480, 270, (s) => { s.scale(0.5, 0.5); corridorPaint(s); }), 0, 0, 480, 270);
  g.save();
  g.scale(0.5, 0.5);
  const st = cctvState(t);
  // amber pawprints behind Biscuit only (the plant: the prints are his)
  const b = st[0];
  const prints = [];
  if (b.s > 0.3) {
    for (let k = 1; k < 40; k++) {
      const sk = b.s - k * 0.36;
      if (sk < 0) break;
      const side = k % 2 ? 0.06 : -0.06;
      const wx = b.c.a[0] + b.dirx * sk - b.dirz * side, wz = b.c.a[1] + b.dirz * sk + b.dirx * side;
      const p = cproj(wx, 0, wz), q = cproj(wx + b.dirx * 0.1, 0, wz + b.dirz * 0.1);
      prints.push({ x: p[0], y: p[1], a: Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2, s: Math.max(4, p[2] * 0.07), alpha: K.clamp(1 - (k * 0.36) / 7) * 0.85 });
    }
  }
  const order = st.slice().sort((p, q) => q.cz - p.cz);
  for (const s of order) {
    if (s.s <= 0 && t < s.c.start) continue;
    const i = s.i;
    const coat = s.c.coat ? K.COATS[s.c.coat] : undefined;
    const lookUp = i === 0 ? K.smooth(K.seg(t, 32.2, 33.0)) : 0;
    // followers, once stopped: stay standing, heads toward Biscuit, tails idling
    const stopped = !s.moving && t > s.c.start + 1;
    const look = stopped && i ? K.smooth(K.seg(t, s.c.start + s.dist / CAT_V + 0.6, s.c.start + s.dist / CAT_V + 1.4)) : 0;
    const headTo = [0, 0.45, 0.25, 0.6][i];
    const base = { tailUp: i === 0 ? 1 : 0.35, coat, collar: i === 0, bell: false, lod: 0, ground: "#0a1012" };
    if (s.moving) {
      // the walk cycle is pre-rendered: 10 phase frames per cat, scaled to its distance
      const q = Math.floor((((s.phase % 1) + 1) % 1) * 10);
      catSprite(g, i + ":w" + q + ":" + s.facing, s, Object.assign({ pose: "walk", phase: q / 10, facing: s.facing, t: 1 + i, tail: 0.3, headTurn: i === 0 ? 0.15 : 0 }, base));
    } else if (i) {
      // standing followers: 3 head-turn steps x 8 tail-sway frames (the tape's low frame rate hides the steps)
      const ls = Math.round(look * 2) / 2;
      const tf = Math.floor(((t + i * 1.7) / 4.488) * 8) % 8;
      catSprite(g, i + ":s" + ls + ":" + tf + ":" + s.facing, s, Object.assign({ pose: "stand", facing: s.facing, t: (tf / 8) * 4.488, tail: 0.7, headTurn: ls * headTo, headTilt: ls * (i === 2 ? 0.15 : -0.05) }, base));
    } else {
      // Biscuit, stopped: drawn live (he looks up into the lens and meows)
      K.drawCat(g, s.x, s.y, s.size, Object.assign({
        pose: "stand", facing: s.facing, t, tail: 0.5,
        headTurn: lookUp * 0.85 + 0.15, headTilt: lookUp * 0.4, mouth: K.env(t, 33.5, 34.4, 0.12, 0.2),
      }, base)); // no rim light: invisible at CCTV size, and it doubles the cost
    }
  }
  g.restore();
  return prints;
}
// A cat pre-rendered at its largest on-screen size (where it stops), cached, then drawn scaled.
function catSprite(g, key, s, opts) {
  const R = s.c.size * s.c.maxP * 1.55;
  const w = R * 3.6, h = R * 2.1, ay = h - R * 0.3;
  const spr = K.sprite("f09cs:" + key, w * 0.5, h * 0.5, (c) => { c.scale(0.5, 0.5); K.drawCat(c, w / 2, ay, R, opts); });
  const k = s.size / R;
  g.drawImage(spr, s.x - (w / 2) * k, s.y - ay * k, w * k, h * k);
}
function cctvGrade(g, W, H, t, o = {}) {
  g.save();
  g.globalCompositeOperation = "saturation";
  g.globalAlpha = o.desat == null ? 0.88 : o.desat;
  g.fillStyle = "#808080"; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "color";
  g.globalAlpha = o.tintA == null ? 0.42 : o.tintA;
  g.fillStyle = o.tint || "#79a88f"; g.fillRect(0, 0, W, H);
  g.restore();
}
function cctvOverlay(g, W, H, t, cam, base, o = {}) {
  // tracking band, scanlines, snow, fisheye vignette, burned-in text
  const by = (((t * 0.11) % 1) * 1.4 - 0.2) * H;
  const bg = g.createLinearGradient(0, by - 30, 0, by + 30);
  bg.addColorStop(0, "rgba(255,255,255,0)"); bg.addColorStop(0.5, "rgba(230,255,240,0.09)"); bg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = bg; g.fillRect(0, by - 30, W, 60);
  snow(g, 0, 0, W, H, t, o.snow == null ? 0.07 : o.snow, 3);
  scanlines(g, 0, 0, W, H, 0.55, 3);
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.98);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(0.7, "rgba(0,8,4,0.35)"); vg.addColorStop(1, "rgba(0,4,2,0.92)");
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  const y0 = H * 0.085 + 34;
  hudText(g, cam, 40, y0, 22);
  hudText(g, clock(base + t), 40, y0 + 28, 22);
  if (Math.floor(t * 1.6) % 2 === 0) {
    g.fillStyle = "#ff3a3a"; g.beginPath(); g.arc(W - 118, y0 - 7, 7, 0, K.TAU); g.fill();
    K.glow(g, W - 118, y0 - 7, 18, "#ff3a3a", 0.6);
  }
  hudText(g, o.right || "REC", W - 100, y0, 22);
  hudText(g, o.bottom || "LAB SEC SYS  PLAY", 40, H - H * 0.085 - 22, 16, "left", "#cfe8d8", 0.75);
}
function shotCCTV(g, t, W, H) {
  const L = K.layer(480, 270, "f09cctv");
  const prints = cctvScene(L.g, t);
  cctvGrade(L.g, 480, 270, t); // graded at half res: 4x fewer pixels to composite
  g.save();
  g.imageSmoothingEnabled = true;
  const jit = K.flash(t, [24.0, 29.3], 0.06) * 6;
  g.drawImage(L.canvas, 0, 0, L.canvas.width, L.canvas.height, jit, 0, W, H);
  g.restore();
  // (grade already applied to the half-res layer above)
  // the prints keep their warm colour: the only warm thing on the tape
  g.save(); g.globalAlpha = 0.85; K.pawprints(g, prints, 0.55); g.restore();
  // hit 24: a short glitch as the line appears
  const hit = K.flash(t, [24.0], 0.08);
  if (hit > 0) { snow(g, 0, 0, W, H, t, 0.18 * hit, 5); g.fillStyle = `rgba(220,255,235,${0.15 * hit})`; g.fillRect(0, 0, W, H); }
  cctvOverlay(g, W, H, t, "CAM 07", 2 * 3600 + 14 * 60 + 33 - 20, {});
}

// ---- SHOT 4 [34-44] close on the screen: the paused frame, the bent ear --------------------------
// The famous left ear (screen right, he faces us): drawCat draws the tip as a spike at this head
// turn, so the paused frame cuts the spike off above the crease and paints the fold as its own flap.
function bentEarFix(c) {
  // erase the straight spike above the crease, then paint the folded tip as its own flap
  c.save();
  c.globalCompositeOperation = "destination-out";
  c.beginPath(); c.moveTo(490, 60); c.lineTo(566, 60); c.lineTo(552, 166); c.lineTo(498, 164); c.closePath(); c.fill();
  c.restore();
  const A = [505, 166], B = [541, 169], tip = [568, 208];
  // underside of the flap shadows the ear just below the crease
  const sh = c.createLinearGradient(0, 168, 0, 192);
  sh.addColorStop(0, "rgba(40,16,4,0.55)"); sh.addColorStop(1, "rgba(40,16,4,0)");
  c.save();
  c.beginPath(); c.moveTo(A[0] - 2, A[1]); c.lineTo(B[0] + 4, B[1]); c.lineTo(B[0] + 8, B[1] + 22); c.lineTo(A[0] - 4, A[1] + 22); c.closePath();
  c.globalCompositeOperation = "source-atop"; c.fillStyle = sh; c.fill();
  c.restore();
  const flap = new Path2D();
  flap.moveTo(A[0], A[1]);
  flap.bezierCurveTo(509, 140, 557, 134, 565, 165);   // the rounded top of the fold
  flap.quadraticCurveTo(572, 186, tip[0], tip[1]);    // the drooping tip, ~35 deg below level
  flap.quadraticCurveTo(552, 190, B[0], B[1]);
  flap.quadraticCurveTo(523, 172, A[0], A[1]);
  const fg = c.createLinearGradient(A[0], 168, tip[0], tip[1]);
  fg.addColorStop(0, "#e39a4c"); fg.addColorStop(0.55, "#b8692a"); fg.addColorStop(1, "#6e3410");
  c.fillStyle = fg; c.fill(flap);
  // light from above catches the top edge of the fold
  c.save(); c.clip(flap);
  c.strokeStyle = "rgba(255,236,200,0.75)"; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(A[0] + 2, A[1] - 2); c.bezierCurveTo(510, 142, 556, 137, 564, 165); c.stroke();
  // fur strokes on the back of the flap
  c.strokeStyle = "rgba(90,40,10,0.5)"; c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i < 14; i++) { const u = i / 14; const x = K.lerp(A[0] + 8, tip[0] - 8, u), y = K.lerp(164, tip[1] - 6, u); c.moveTo(x, y + 4); c.lineTo(x + 5, y); }
  c.stroke();
  c.restore();
  // the crease: a dark fold line with a thin highlight above it
  c.lineCap = "round";
  c.strokeStyle = "rgba(60,22,6,0.85)"; c.lineWidth = 1.8;
  c.beginPath(); c.moveTo(A[0] + 1, A[1] + 1); c.quadraticCurveTo(523, 173, B[0], B[1]); c.stroke();
  c.strokeStyle = "rgba(255,220,170,0.35)"; c.lineWidth = 1;
  c.beginPath(); c.moveTo(A[0] + 2, A[1] - 1.5); c.quadraticCurveTo(523, 170, B[0] - 1, B[1] - 2); c.stroke();
}
function pausedSprite() {
  // what CAM 07 holds on pause, digitally zoomed: Biscuit's head looking up into the lens. Static,
  // so it is painted once (cat on its own canvas so the ear can be cut and re-folded cleanly).
  return K.sprite("f09paused", 320, 180, (g) => {
    g.scale(1 / 3, 1 / 3);
    const wg = g.createLinearGradient(0, 0, 0, 540);
    wg.addColorStop(0, "#3a484e"); wg.addColorStop(1, "#56646a");
    g.fillStyle = wg; g.fillRect(0, 0, 960, 540);
    g.fillStyle = "#33434a"; g.fillRect(60, 0, 300, 540);
    g.fillStyle = "#1a2a2c"; g.fillRect(150, 60, 120, 150);
    g.fillStyle = "#2c3539"; g.fillRect(0, 380, 960, 30);
    K.glow(g, 760, 60, 300, "#f0fff8", 0.25);
    const cc = K.makeCanvas(960, 540);
    const c = cc.getContext("2d");
    // night-vision eyes: almond (lids half down), slit pupils, IR eyeshine, no dark liner ring
    K.drawCat(c, 360, 960, 440, { pose: "sit", facing: 1, headTurn: 0.85, headTilt: 0.35, t: 33.2, light: { x: 520, y: -300, color: "#f0fff8", strength: 1 }, collar: true, bell: false, tailUp: 1,
      eyesGlow: 0.8, pupil: 0, blink: 0.3, coat: { liner: "#5a4a26" } });
    bentEarFix(c);
    g.drawImage(cc, 0, 0, 960, 540);
  });
}
const RET = [532, 180];
function shotPaused(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 34, 44));
  const rack = K.smooth(K.seg(t, 35.2, 37.6));
  const sx = 30, sy = 20, sw = 900, sh = 500;
  K.withCamera(g, W, H, { x: 480 + p * 40, y: 270 - p * 30, zoom: 1.0 + p * 0.12, shakeT: t, shakeAmt: 0.8 }, () => {
    g.fillStyle = "#050809"; g.fillRect(-60, -60, W + 120, H + 120);
    // the monitor face fills the frame; the bezel peeks in at the edges
    const spr = pausedSprite();
    const blur = K.lerp(7, 0, rack);
    if (blur > 0.3) {
      const B = K.layer(W, H, "f09pausedB");
      B.g.imageSmoothingEnabled = true;
      B.g.drawImage(spr, sx, sy, sw, sh);
      K.dof(g, B.canvas, blur);
    } else {
      g.imageSmoothingEnabled = true;
      g.drawImage(spr, sx, sy, sw, sh);
    }
    g.save(); g.beginPath(); g.rect(sx, sy, sw, sh); g.clip();
    cctvGrade(g, W, H, t, { desat: 0.85, tintA: 0.4 });
    // the scanlines are crisp first, then soften as the focus racks onto the image
    scanlines(g, sx, sy, sw, sh, K.lerp(0.95, 0.4, rack), K.lerp(7, 4, rack));
    snow(g, sx, sy, sw, sh, t, 0.06, 7);
    // the reticle snaps onto the bent ear (his LEFT ear: screen right, he is facing us)
    const ra = K.smooth(K.seg(t, 37.6, 38.4));
    if (ra > 0) {
      const cx = RET[0], cy = RET[1], r = K.lerp(150, 50, K.ease.out(K.seg(t, 37.6, 38.6)));
      g.strokeStyle = K.rgba("#e9fff0", 0.9 * ra); g.lineWidth = 2.5;
      g.beginPath();
      for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.moveTo(cx + dx * r, cy + dy * r * 0.8 - dy * 16);
        g.lineTo(cx + dx * r, cy + dy * r * 0.8);
        g.lineTo(cx + dx * r - dx * 16, cy + dy * r * 0.8);
      }
      g.stroke();
      if (t > 38.6) hudText(g, "L EAR  MATCH", cx + r + 10, cy - r * 0.8 + 14, 16, "left", "#e9fff0", K.smooth(K.seg(t, 38.6, 39.2)) * (Math.floor(t * 3) % 2 ? 1 : 0.7));
    }
    const vg = g.createRadialGradient(480, 270, 200, 480, 270, 620);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.75)");
    g.fillStyle = vg; g.fillRect(sx, sy, sw, sh);
    // glass: a broad soft reflection and your hood's silhouette, faintly rim-lit
    const rg = g.createLinearGradient(sx, sy, sx + sw, sy + sh);
    rg.addColorStop(0, "rgba(255,255,255,0.06)"); rg.addColorStop(0.35, "rgba(255,255,255,0)"); rg.addColorStop(0.6, "rgba(255,255,255,0.03)"); rg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rg; g.fillRect(sx, sy, sw, sh);
    const hx = 760 - p * 20, hy = 470;
    const hood = new Path2D();
    hood.moveTo(hx - 170, sy + sh);
    hood.bezierCurveTo(hx - 160, hy - 120, hx - 120, hy - 250, hx, hy - 260);
    hood.bezierCurveTo(hx + 120, hy - 250, hx + 160, hy - 120, hx + 175, sy + sh);
    hood.closePath();
    const hg = g.createLinearGradient(0, hy - 260, 0, sy + sh);
    hg.addColorStop(0, "rgba(0,6,4,0.12)"); hg.addColorStop(1, "rgba(0,6,4,0.32)");
    g.fillStyle = hg;
    g.fill(hood);
    // dust on the glass: sharp at first, it melts away as focus racks
    const dustBlur = rack;
    g.globalAlpha = 0.5 * (1 - dustBlur * 0.7);
    for (let i = 0; i < 26; i++) {
      const dx = sx + K.hash(i, 31) * sw, dy = sy + K.hash(i, 32) * sh, r = 1 + K.hash(i, 33) * 2 + dustBlur * 5;
      K.glow(g, dx, dy, r, "#d8fff0", 0.6);
    }
    g.globalAlpha = 1;
    g.restore();
    // bezel
    g.fillStyle = "#0b0f11";
    g.fillRect(-60, -60, W + 120, sy + 60); g.fillRect(-60, sy + sh, W + 120, 120);
    g.fillRect(-60, -60, sx + 60, H + 120); g.fillRect(sx + sw, -60, 120, H + 120);
    g.strokeStyle = "rgba(160,220,200,0.22)"; g.lineWidth = 2; g.strokeRect(sx - 1, sy - 1, sw + 2, sh + 2);
  });
  // burned-in OSD text: drawn AFTER the camera move, at fixed screen positions, so the zoom never
  // pushes it off the edge
  const y0 = H * 0.085 + 40;
  hudText(g, "CAM 07", 64, y0, 22);
  hudText(g, clock(2 * 3600 + 14 * 60 + 46), 64, y0 + 28, 22);
  hudText(g, "PAUSE", W - 150, y0, 22);
  g.fillStyle = "#e9f5ec"; g.fillRect(W - 182, y0 - 18, 7, 20); g.fillRect(W - 170, y0 - 18, 7, 20);
}

// ---- SHOT 5 [44-54] another monitor: CAM 22, the meadow barn, infrared ----------------------------
function barnScene(g, t) {
  // static: painted once into a sprite (the IR tape barely moves); only the cats redraw per frame
  const sk = g.createLinearGradient(0, 0, 0, 330);
  sk.addColorStop(0, "#101820"); sk.addColorStop(1, "#33424a");
  g.fillStyle = sk; g.fillRect(0, 0, 960, 540);
  K.stars(g, 960, 540, 22, 0.9, t, { yMax: 260 });
  K.hills(g, 960, 540, { y: 320, amp: 30, color: "#26322c", seed: 4 });
  K.tree(g, 120, 360, 0.85, { seed: 3, kind: "oak", t, leaf: "#3a4a3e", trunk: "#2a2a22" });
  K.tree(g, 900, 350, 0.7, { seed: 8, kind: "oak", t, leaf: "#344438", trunk: "#2a2a22" });
  // the barn (gambrel roof), door open on hay
  const bx = 520, by = 400;
  const wall = [[bx - 170, by], [bx - 170, by - 150], [bx - 120, by - 230], [bx, by - 280], [bx + 120, by - 230], [bx + 170, by - 150], [bx + 170, by]];
  poly(g, wall);
  const wg = g.createLinearGradient(bx - 170, 0, bx + 170, 0);
  wg.addColorStop(0, "#5a302a"); wg.addColorStop(0.45, "#74423a"); wg.addColorStop(1, "#4a2622");
  g.fillStyle = wg; g.fill();
  // vertical board-and-batten planks: each board a slightly different tone, battens catch the IR
  g.save(); poly(g, wall); g.clip();
  const R = K.rng("planks");
  for (let x = bx - 170; x < bx + 170; x += 16) {
    g.fillStyle = `rgba(${R() < 0.5 ? "0,0,0" : "255,230,210"},${0.03 + R() * 0.06})`;
    g.fillRect(x, by - 290, 16, 290);
    g.fillStyle = "rgba(20,8,6,0.35)"; g.fillRect(x, by - 290, 2, 290);
    g.fillStyle = "rgba(255,225,200,0.08)"; g.fillRect(x + 2, by - 290, 1.5, 290);
    // knots + weathering streaks
    if (R() < 0.6) { g.fillStyle = "rgba(20,8,6,0.3)"; g.beginPath(); g.ellipse(x + 8, by - 30 - R() * 200, 1.8, 3, 0, 0, K.TAU); g.fill(); }
  }
  // the eave casts a deep shadow down the top of the wall; dirt splash darkens the base
  const es = g.createLinearGradient(0, by - 236, 0, by - 120);
  es.addColorStop(0, "rgba(8,4,3,0.75)"); es.addColorStop(1, "rgba(8,4,3,0)");
  g.fillStyle = es; g.fillRect(bx - 180, by - 300, 360, 180);
  const ds = g.createLinearGradient(0, by - 40, 0, by);
  ds.addColorStop(0, "rgba(10,6,4,0)"); ds.addColorStop(1, "rgba(10,6,4,0.5)");
  g.fillStyle = ds; g.fillRect(bx - 180, by - 40, 360, 40);
  g.restore();
  // roof: shingle rows with a lit top edge
  const roofO = [[bx - 180, by - 148], [bx - 125, by - 238], [bx, by - 292], [bx + 125, by - 238], [bx + 180, by - 148]];
  const roofI = [[bx + 168, by - 140], [bx + 115, by - 226], [bx, by - 276], [bx - 115, by - 226], [bx - 168, by - 140]];
  poly(g, roofO.concat(roofI));
  g.fillStyle = "#2c201c"; g.fill();
  g.strokeStyle = "rgba(200,220,210,0.18)"; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(roofO[0][0], roofO[0][1]); for (const p of roofO) g.lineTo(p[0], p[1]); g.stroke();
  // hay loft door
  g.fillStyle = "#1a100c"; g.fillRect(bx - 24, by - 236, 48, 44);
  g.strokeStyle = "rgba(150,130,110,0.35)"; g.lineWidth = 2; g.strokeRect(bx - 24, by - 236, 48, 44);
  // the open doorway: darkness inside, falling off to black at the back
  const dg = g.createLinearGradient(0, by - 150, 0, by);
  dg.addColorStop(0, "#0a0605"); dg.addColorStop(1, "#1c120c");
  g.fillStyle = dg; g.fillRect(bx - 70, by - 150, 140, 150);
  g.strokeStyle = "rgba(140,124,108,0.4)"; g.lineWidth = 3;
  g.strokeRect(bx - 70, by - 150, 140, 150);
  // the two door leaves swung open against the wall: planked, X-braced, muted
  for (const sd of [-1, 1]) {
    const dx0 = bx + sd * 70, dx1 = bx + sd * 128, xl = Math.min(dx0, dx1);
    g.fillStyle = "#552c26"; g.fillRect(xl, by - 150, 58, 150);
    g.fillStyle = "rgba(0,0,0,0.18)";
    for (let k = 0; k < 4; k++) g.fillRect(xl + k * 14.5, by - 150, 1.5, 150);
    g.strokeStyle = "rgba(150,134,118,0.42)"; g.lineWidth = 3;
    g.strokeRect(xl + 1.5, by - 148.5, 55, 147);
    g.beginPath(); g.moveTo(dx0, by - 150); g.lineTo(dx1, by); g.moveTo(dx1, by - 150); g.lineTo(dx0, by); g.stroke();
    // a soft shadow where the leaf stands off the wall
    g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(sd < 0 ? xl - 6 : xl + 58, by - 150, 6, 150);
  }
  // hay piled inside and spilling out of the door
  hay(g, bx + 8, by - 2, 96, 62, 1);
  // ground
  const gg = g.createLinearGradient(0, 380, 0, 540);
  gg.addColorStop(0, "#2c3a30"); gg.addColorStop(1, "#18221c");
  g.fillStyle = gg; g.fillRect(0, by - 6, 960, 200);
  // stray straw scattered on the ground in front of the door
  const S = K.rng("straw");
  g.strokeStyle = "rgba(216,192,112,0.7)"; g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < 70; i++) {
    const sx = bx + (S() - 0.5) * 260, sy = by - 4 + S() * 40 * S(), a = (S() - 0.5) * 2.4, l = 4 + S() * 9;
    g.moveTo(sx, sy); g.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l * 0.4);
  }
  g.stroke();
  K.fence(g, -10, 330, by + 20, 50, { color: "#8a8478" });
  K.grass(g, -10, 970, by + 2, { seed: 5, color: "#3a4a3a", height: 14, t, wind: 0.4, density: 0.6 });
}
function hay(g, x, y, w, h, seed) {
  const R = K.rng("hay" + seed);
  const hg = g.createLinearGradient(0, y - h, 0, y);
  hg.addColorStop(0, "#b8994e"); hg.addColorStop(1, "#6e5a2c");
  g.fillStyle = hg;
  g.beginPath(); g.moveTo(x - w, y);
  // lumpy mound, not an ellipse
  for (let i = 0; i <= 12; i++) {
    const u = i / 12, a = Math.PI + u * Math.PI;
    const r = 1 + (R() - 0.5) * 0.12;
    g.lineTo(x + Math.cos(a) * w * r, y - h * 0.1 + Math.sin(a) * h * 0.9 * r);
  }
  g.lineTo(x + w, y); g.closePath(); g.fill();
  g.lineCap = "round";
  for (const [col, n, lw] of [["rgba(70,52,20,0.6)", Math.round(w * 0.9), 1.2], ["#d8c070", Math.round(w * 1.4), 1]]) {
    g.strokeStyle = col; g.lineWidth = lw;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = Math.PI + R() * Math.PI, rr = Math.sqrt(R());
      const px = x + Math.cos(a) * w * rr, py = y - h * 0.1 + Math.sin(a) * h * 0.9 * rr;
      const ang = a + Math.PI / 2 + (R() - 0.5) * 1.6, l = 5 + R() * 10;
      g.moveTo(px, py); g.lineTo(px + Math.cos(ang) * l, py + Math.sin(ang) * l * 0.7);
    }
    g.stroke();
  }
  // stray strands sticking out of the silhouette
  g.strokeStyle = "rgba(216,192,112,0.8)"; g.lineWidth = 0.9;
  g.beginPath();
  for (let i = 0; i < Math.round(w * 0.35); i++) {
    const a = Math.PI + 0.15 + R() * (Math.PI - 0.3);
    const px = x + Math.cos(a) * w * 0.98, py = y - h * 0.1 + Math.sin(a) * h * 0.88;
    const ang = a + (R() - 0.5) * 0.8, l = 5 + R() * 9;
    g.moveTo(px, py); g.lineTo(px + Math.cos(ang) * l, py + Math.sin(ang) * l);
  }
  g.stroke();
}
function barnState(t) {
  // Biscuit leads the kitten to the barn (45.6-48.6), the kitten tucks into the hay (48.6-50),
  // he looks at it a moment, then turns and walks away left (50.4-54)
  const b = {}, k = {};
  const inT = K.seg(t, 45.4, 48.6);
  b.x = K.lerp(-60, 470, K.ease.out(inT));
  b.y = 452; b.facing = 1;
  b.moving = inT > 0 && inT < 0.98;
  b.pose = b.moving ? "walk" : "stand";
  const out = K.seg(t, 50.6, 54.5);
  if (out > 0) { b.facing = -1; b.x = K.lerp(470, -140, K.ease.in(out) * 0.6 + out * 0.4); b.moving = true; b.pose = "walk"; }
  b.phase = t * 1.4;
  const kin = K.seg(t, 45.9, 49.2);
  k.x = K.lerp(-150, 540, K.ease.out(kin));
  k.y = K.lerp(458, 380, K.smooth(K.seg(t, 48.4, 49.4)));
  k.moving = kin > 0 && kin < 0.97;
  k.pose = k.moving ? "walk" : "loaf";
  k.phase = t * 1.8;
  return { b, k };
}
// drawCat painted once at half resolution into a sprite, then stamped (sizes in this shot are fixed)
function cachedCat(g, key, x, y, size, opts) {
  const w = size * 3.6, h = size * 2.1, ay = h - size * 0.3;
  const spr = K.sprite("f09cc:" + key, w * 0.5, h * 0.5, (c) => { c.scale(0.5, 0.5); K.drawCat(c, w / 2, ay, size, opts); });
  g.drawImage(spr, x - w / 2, y - ay, w, h);
}
function shotIR(g, t, W, H) {
  const on = K.seg(t, 44.2, 45.4);
  const p = K.ease.inOut(K.seg(t, 44, 54));
  K.withCamera(g, W, H, { x: 480 + p * 20, y: 270, zoom: 1.03 + p * 0.03, shakeT: t, shakeAmt: 0.9 }, () => {
    g.fillStyle = "#050809"; g.fillRect(-60, -60, W + 120, H + 120);
    const sx = 50, sy = 30, sw = 860, sh = 484;
    g.save(); g.beginPath(); g.rect(sx, sy, sw, sh); g.clip();
    if (on > 0.55) {
      const L = K.layer(480, 270, "f09ir");
      L.g.drawImage(K.sprite("f09barn", 480, 270, (s) => { s.scale(0.5, 0.5); barnScene(s, 46); }), 0, 0, 480, 270);
      L.g.scale(0.5, 0.5);
      const s = barnState(t);
      const lightIR = { x: 480, y: 600, color: "#ffffff", strength: 0.6 };
      if (s.k.pose === "loaf") {
        cachedCat(L.g, "kl", s.k.x, s.k.y, 30, { pose: "loaf", facing: -1, t: 50, coat: K.COATS.grey, collar: false, eyesGlow: 1, headTurn: 0.6, lod: 0 });
        // it burrows in: a clump of hay over its body, only the eyes peek out - two points of IR eyeshine
        L.g.drawImage(K.sprite("f09hayclump", 60, 24, (s) => hay(s, 30, 23, 28, 20, 2)), s.k.x - 18, s.k.y - 22, 60, 24);
        const blinkK = 1 - K.env(t, 51.5, 52.6, 0.4, 0.3);
        if (blinkK > 0.05) {
          for (const ex of [-1, 1]) {
            const px = s.k.x - 13 + ex * 3.4, py = s.k.y - 22;
            K.glow(L.g, px, py, 10, "#f4fff0", 1.2 * blinkK);
            L.g.fillStyle = K.rgba("#ffffff", blinkK);
            L.g.beginPath(); L.g.ellipse(px, py, 2, 1.5 * blinkK, 0, 0, K.TAU); L.g.fill();
          }
        }
      } else {
        const q = Math.floor((((s.k.phase % 1) + 1) % 1) * 10);
        if (s.k.pose === "walk") cachedCat(L.g, "kw" + q, s.k.x, s.k.y, 30, { pose: "walk", phase: q / 10, facing: 1, t: 47, coat: K.COATS.grey, collar: false, eyesGlow: 1, lod: 0 });
        else cachedCat(L.g, "kst", s.k.x, s.k.y, 30, { pose: s.k.pose, facing: 1, t: 47, coat: K.COATS.grey, collar: false, eyesGlow: 1, lod: 0 });
      }
      // walk-cycle frames and the standing pose are pre-rendered (lit by the IR lamp) and reused
      const qb = s.b.pose === "walk" ? Math.floor((((s.b.phase % 1) + 1) % 1) * 10) : -1;
      cachedCat(L.g, "b" + s.b.pose + qb + ":" + s.b.facing, s.b.x, s.b.y, 48, { pose: s.b.pose, phase: qb / 10, facing: s.b.facing, t: 47, tailUp: 0.8, eyesGlow: 1, dark: true, collar: true, bell: false, light: lightIR, headTurn: s.b.pose === "stand" ? 0.3 : 0, lod: 1 });
      g.imageSmoothingEnabled = true;
      g.drawImage(L.canvas, 0, 0, L.canvas.width, L.canvas.height, sx, sy, sw, sh);
      // infrared look: monochrome, lifted, green-white, eyes blown out
      cctvGrade(g, W, H, t, { desat: 1, tint: "#8dffb8", tintA: 0.85 });
      g.save(); g.globalCompositeOperation = "screen"; g.fillStyle = "rgba(40,90,60,0.3)"; g.fillRect(sx, sy, sw, sh);
      // the IR illuminator: a hot centre falling off to murky corners
      const ir = g.createRadialGradient(470, 330, 40, 470, 330, 520);
      ir.addColorStop(0, "rgba(170,255,200,0.22)"); ir.addColorStop(1, "rgba(170,255,200,0)");
      g.fillStyle = ir; g.fillRect(sx, sy, sw, sh);
      g.restore();
    }
    const flick = on < 1 ? (K.hash(Math.floor(t * 20), 3) > 0.5 ? 1 : 0.4) : 0;
    if (on < 1) snow(g, sx, sy, sw, sh, t, 0.9 * flick + (on < 0.55 ? 0.1 : 0), 9);
    if (on <= 0) { g.fillStyle = "#020303"; g.fillRect(sx, sy, sw, sh); }
    if (on > 0) {
      g.save();
      g.translate(sx, sy);
      cctvOverlay(g, sw, sh, t, "CAM 22  MEADOW", 23 * 3600 + 51 * 60 + 7 - 44, { right: "IR", bottom: "NIGHT VISION  PLAY", snow: 0.08 });
      g.restore();
    }
    // swell 46: the monitor powers up from a bright line
    const pw = K.seg(t, 44, 44.35);
    if (pw < 1) {
      g.fillStyle = "#020303"; g.fillRect(sx, sy, sw, sh * (1 - pw) * 0.5);
      g.fillRect(sx, sy + sh - sh * (1 - pw) * 0.5, sw, sh * (1 - pw) * 0.5);
      if (pw > 0) K.glow(g, 480, sy + sh / 2, 400 * pw, "#d8ffe8", 0.6 * (1 - pw));
    }
    g.restore();
    // bezel: a smaller monitor in the wall, with its neighbours' glow at the edges
    g.fillStyle = "#0b1012";
    g.fillRect(-60, -60, W + 120, sy + 60); g.fillRect(-60, sy + sh, W + 120, 120);
    g.fillRect(-60, -60, sx + 60, H + 120); g.fillRect(sx + sw, -60, 120, H + 120);
    K.glow(g, -10, 270, 120, TEAL, 0.25);
    K.glow(g, W + 10, 200, 120, TEAL, 0.2);
    g.strokeStyle = "rgba(160,220,200,0.2)"; g.lineWidth = 2; g.strokeRect(sx - 1, sy - 1, sw + 2, sh + 2);
    g.fillStyle = on > 0 ? "#3aff9a" : "#3a0a0a";
    g.beginPath(); g.arc(sx + sw - 20, sy + sh + 14, 3, 0, K.TAU); g.fill();
    if (on > 0) K.glow(g, sx + sw - 20, sy + sh + 14, 10, "#3aff9a", 0.6);
  });
}

// ---- SHOT 6 [54-62] the lab cat, the button, the map -------------------------------------------
// The lab cat: a grey tabby in a tiny lab coat. The coat is painted INTO the cat's own silhouette
// (source-atop on an offscreen layer), so it hugs the body exactly; goggles sit up on the head.
function labCat(g, W, H, x, y, s, t, catOpts, darken = 0) {
  const L = K.layer(W, H, "f09labcat");
  const c = L.g;
  K.drawCat(c, x, y, s, Object.assign({ pose: "sit", facing: -1, t, coat: K.COATS.grey, collar: false }, catOpts));
  c.save();
  c.globalCompositeOperation = "source-atop";
  // coat body: from the neck down to just above the paws, front legs become sleeves
  const top = y - s * 1.16, bot = y - s * 0.16;
  const coat = new Path2D();
  coat.moveTo(x - s * 0.75, top + s * 0.1);
  coat.quadraticCurveTo(x - s * 0.2, top - s * 0.06, x + s * 0.75, top + s * 0.18);
  coat.lineTo(x + s * 0.75, bot + s * 0.06);
  coat.lineTo(x - s * 0.75, bot);
  coat.closePath();
  const gr = c.createLinearGradient(x - s * 0.6, top, x + s * 0.5, bot);
  gr.addColorStop(0, "#f6fbf9"); gr.addColorStop(0.5, "#dfe9e6"); gr.addColorStop(1, "#9fb2ae");
  c.fillStyle = gr;
  c.fill(coat);
  c.clip(coat);
  // folds, lapel, buttons, pocket with a pen, cuffs
  c.strokeStyle = "rgba(70,90,88,0.5)"; c.lineWidth = Math.max(0.6, s * 0.012); c.lineCap = "round";
  c.beginPath();
  c.moveTo(x - s * 0.18, top + s * 0.05); c.quadraticCurveTo(x - s * 0.36, top + s * 0.25, x - s * 0.3, top + s * 0.5);
  c.moveTo(x - s * 0.02, top + s * 0.02); c.quadraticCurveTo(x - s * 0.12, top + s * 0.3, x - s * 0.3, top + s * 0.5);
  c.moveTo(x + s * 0.1, top + s * 0.4); c.quadraticCurveTo(x + s * 0.2, top + s * 0.7, x + s * 0.12, bot);
  c.moveTo(x + s * 0.3, top + s * 0.3); c.quadraticCurveTo(x + s * 0.42, top + s * 0.6, x + s * 0.36, bot);
  c.moveTo(x - s * 0.62, bot - s * 0.08); c.lineTo(x - s * 0.3, bot - s * 0.1);
  c.stroke();
  c.fillStyle = "rgba(90,110,108,0.25)";
  c.fillRect(x + s * 0.02, top + s * 0.55, s * 0.22, s * 0.16);
  c.fillStyle = "#2f5fc8"; c.fillRect(x + s * 0.06, top + s * 0.48, s * 0.03, s * 0.12);
  c.fillStyle = "#b8c6c3";
  for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x - s * 0.28 + i * s * 0.02, top + s * 0.58 + i * s * 0.14, s * 0.022, 0, K.TAU); c.fill(); }
  c.restore();
  // goggles pushed up on the forehead
  const hx = x - s * 0.25, hy = y - s * 1.7;
  c.save();
  c.fillStyle = "#2a2e33";
  c.fillRect(hx - s * 0.2, hy - s * 0.022, s * 0.4, s * 0.044);
  for (const d of [-0.075, 0.075]) {
    const gg = c.createRadialGradient(hx + d * s - s * 0.02, hy - s * 0.02, 1, hx + d * s, hy, s * 0.08);
    gg.addColorStop(0, "#d8fff4"); gg.addColorStop(0.5, "#5a9a8e"); gg.addColorStop(1, "#1a2a28");
    c.fillStyle = gg; c.beginPath(); c.arc(hx + d * s, hy, s * 0.056, 0, K.TAU); c.fill();
    c.strokeStyle = "#11161a"; c.lineWidth = s * 0.018; c.stroke();
  }
  c.restore();
  if (darken > 0) {
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = `rgba(3,10,10,${darken})`;
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = "source-over";
  }
  g.drawImage(L.canvas, 0, 0, W, H);
}
function topoMap(g, x, y, w, h, t, reveal) {
  // the grid + contour lines + fixed labels never change: painted once into a sprite
  const st = K.sprite("f09topo", w, h, (s) => topoStatic(s, 0, 0, w, h));
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.drawImage(st, x, y, w, h);
  const cx = x + w * 0.62, cy = y + h * 0.3;
  K.glow(g, cx, cy, w * 0.07, "#ff6a2a", 0.7 + 0.3 * Math.sin(t * 4));
  topoRoute(g, x, y, w, h, t, reveal, cx, cy);
  g.restore();
}
function topoStatic(g, x, y, w, h) {
  g.fillStyle = "#04120e"; g.fillRect(x, y, w, h);
  g.strokeStyle = "rgba(90,255,200,0.12)"; g.lineWidth = 1;
  g.beginPath();
  for (let gx = x; gx < x + w; gx += w / 16) { g.moveTo(gx, y); g.lineTo(gx, y + h); }
  for (let gy = y; gy < y + h; gy += h / 9) { g.moveTo(x, gy); g.lineTo(x + w, gy); }
  g.stroke();
  const cx = x + w * 0.62, cy = y + h * 0.3;
  for (let r = 1; r <= 9; r++) {
    g.strokeStyle = K.rgba(TEAL, 0.25 + (9 - r) * 0.05);
    g.lineWidth = r === 1 ? 2 : 1.2;
    g.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * K.TAU;
      const rr = r * w * 0.045 * (1 + K.noise(a * 1.5 + r * 0.7, 21) * 0.18);
      const px = cx + Math.cos(a) * rr * 1.3, py = cy + Math.sin(a) * rr * 0.9 + r * h * 0.015;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
  }
  // crater
  g.fillStyle = "rgba(255,106,42,0.6)"; g.beginPath(); g.ellipse(cx, cy, w * 0.03, h * 0.025, 0, 0, K.TAU); g.fill();
  hudText(g, "YOU ARE HERE", x + w * 0.16 + 14, y + h * 0.84 + 6, 15);
  hudText(g, "MOUNT HAIRBALL  ROUTE 1", x + 18, y + 30, 17);
  scanlines(g, x, y, w, h, 0.45, 4);
}
function topoRoute(g, x, y, w, h, t, reveal, cx, cy) {
  // the route: base (LAB) to the summit, revealed after the hit
  const route = [x + w * 0.16, y + h * 0.84, x + w * 0.3, y + h * 0.72, x + w * 0.27, y + h * 0.58, x + w * 0.42, y + h * 0.52, x + w * 0.4, y + h * 0.4, x + w * 0.52, y + h * 0.36, cx - 6, cy + 4];
  const S = K.sampleSpline(route, false, 10);
  const n = Math.floor(S.length * reveal);
  g.fillStyle = AMBER;
  for (let i = 0; i < n; i += 2) {
    g.beginPath(); g.arc(S[i][0], S[i][1], 2.6, 0, K.TAU); g.fill();
  }
  if (n > 0) {
    const hd = S[Math.min(S.length - 1, n - 1)];
    K.glow(g, hd[0], hd[1], 26, AMBER, 0.9);
  }
  g.fillStyle = "#e9fff4";
  g.beginPath(); g.arc(x + w * 0.16, y + h * 0.84, 6, 0, K.TAU); g.fill();
  K.glow(g, x + w * 0.16, y + h * 0.84, 22, "#e9fff4", 0.5 + 0.4 * Math.sin(t * 5));
  hudText(g, "SUMMIT CRATER", cx + 30, cy - 10, 16, "left", "#ffd8a0", K.smooth(K.seg(reveal, 0.8, 1)));
}
function shotLabCat(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 54, 56.6));
  K.withCamera(g, W, H, { x: 470 + p * 20, y: 270, zoom: 1.05 + p * 0.03, shakeT: t, shakeAmt: 1 }, () => {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b1518"); bg.addColorStop(1, "#071012");
    g.fillStyle = bg; g.fillRect(-40, -40, W + 80, H + 80);
    // the big screen (dark, idle) on the left, monitors softly behind
    K.focus(g, W, H, 4, (f) => {
      monitorWall(f, 470, 40, 520, 230, t, { flick: false });
      f.fillStyle = "#03090a"; f.fillRect(-20, 40, 420, 300);
      f.strokeStyle = "rgba(90,255,200,0.25)"; f.strokeRect(-20, 40, 420, 300);
      hudText(f, "MAP  STANDBY", 20, 80, 18, "left", "#7affd0", 0.6 + 0.4 * Math.sin(t * 3));
    }, "f09lcbg");
    K.glow(g, 700, 150, 360, TEAL, 0.18);
    // desk
    const dg = g.createLinearGradient(0, 400, 0, 560);
    dg.addColorStop(0, "#2a383e"); dg.addColorStop(0.1, "#141c20"); dg.addColorStop(1, "#070b0d");
    g.fillStyle = dg; g.fillRect(-40, 400, W + 80, 160);
    g.fillStyle = "rgba(160,255,225,0.35)"; g.fillRect(-40, 400, W + 80, 1.5);
    g.fillStyle = "#4a5560"; g.beginPath(); g.ellipse(430, 432, 34, 10, 0, 0, K.TAU); g.fill();
    g.fillStyle = "#2fd68a"; g.beginPath(); g.ellipse(430, 428, 28, 8, 0, 0, K.TAU); g.fill();
    K.glow(g, 430, 428, 50, "#2fd68a", 0.4);
    // the lab cat: grey tabby in a tiny lab coat, goggles up on its head, looks at you
    const lc = { x: 600, y: 420, s: 120 };
    const light = { x: 300, y: 120, color: "#8affd8", strength: 1.3 };
    // cached per head-turn step (0.05) and blink step: the turn is slow, the blink is quick
    const ht = Math.round(K.lerp(0.65, 0.2, K.smooth(K.seg(t, 55.4, 56.2))) * 20) / 20;
    const bq = Math.round(K.env(t, 54.9, 55.25, 0.08, 0.1) * 2) / 2;
    g.drawImage(K.sprite("f09lc:" + ht + ":" + bq, 360, 320, (s) => {
      s.translate(-430, -150);
      labCat(s, W, H, lc.x, lc.y, lc.s, 55, { headTurn: ht, light, blink: bq, lod: 2 });
    }), 430, 150, 360, 320);
  });
}
function shotPaw(g, t, W, H) {
  const press = K.smooth(K.seg(t, 56.9, 57.15)) * (1 - K.smooth(K.seg(t, 57.5, 57.8)));
  const lit = K.seg(t, 57.1, 57.2);
  K.withCamera(g, W, H, { x: 480, y: 270, zoom: 1.06, shakeT: t, shakeAmt: 1 + press * 2 }, () => {
    g.fillStyle = "#11191c"; g.fillRect(-40, -40, W + 80, H + 80);
    const dg = g.createLinearGradient(0, 0, 0, H);
    dg.addColorStop(0, "#1a2428"); dg.addColorStop(1, "#0a1012");
    g.fillStyle = dg; g.fillRect(-40, 200, W + 80, 400);
    const bx = 470, by = 380;
    g.fillStyle = "#0a0d0f"; g.beginPath(); g.ellipse(bx, by + 16, 140, 52, 0, 0, K.TAU); g.fill();
    g.fillStyle = "#4a5560"; g.beginPath(); g.ellipse(bx, by + 8, 132, 46, 0, 0, K.TAU); g.fill();
    const dz = press * 9;
    const cg = g.createRadialGradient(bx - 30, by - 14 + dz, 5, bx, by + dz, 120);
    cg.addColorStop(0, K.mix("#5fe8a8", "#e8fff4", lit)); cg.addColorStop(1, "#0f6a42");
    g.fillStyle = cg; g.beginPath(); g.ellipse(bx, by + dz, 112, 38, 0, 0, K.TAU); g.fill();
    if (lit) K.glow(g, bx, by + dz, 260, "#2fd68a", 0.5 * lit);
    // the lab cat's forepaw comes down from the top right, out of a white lab-coat sleeve
    const dn = K.ease.inOut(K.seg(t, 56.4, 57.0));
    const px = K.lerp(640, 488, dn), py = K.lerp(110, 318, dn) + dz;
    // contact shadow on the button cap: tightens and darkens as the paw lands
    const near = K.smooth(K.seg(dn, 0.6, 1));
    const csr = K.lerp(150, 80, near);
    g.save(); g.translate(px - 20, by + dz - 4); g.scale(1, 0.32);
    const cs = g.createRadialGradient(0, 0, 0, 0, 0, csr);
    cs.addColorStop(0, `rgba(2,20,10,${0.15 + near * 0.45})`); cs.addColorStop(1, "rgba(2,20,10,0)");
    g.fillStyle = cs; g.beginPath(); g.arc(0, 0, csr, 0, K.TAU); g.fill();
    g.restore();
    const ax = px + 250, ay = py - 420;              // shoulder end, off frame
    const dirx = px - ax, diry = py - ay, dl = Math.hypot(dirx, diry);
    const ux = dirx / dl, uy = diry / dl, nx = -uy, ny = ux;
    const cuff = [px + 64, py - 108];                  // where the sleeve ends
    // --- the paw (drawn first; the cuff overlaps its wrist) ---
    const paw = new Path2D();
    K.tube(paw, [cuff[0] + 10, cuff[1] - 30, px + 22, py - 40], [104, 96], 4, true, false);
    K.ellipsePath(paw, px, py - 8, 70, 48, -0.5);
    for (let k = 0; k < 4; k++) {
      const u = (k - 1.5) * 0.42;
      K.ellipsePath(paw, px - 32 + Math.cos(2.3 + u) * 40, py + 6 + Math.sin(2.3 + u) * 34, 24, 18, -0.4 + u);
    }
    const R = K.rng("pawfur");
    // fluffy edge first: short strokes sticking out of the silhouette
    g.lineCap = "round";
    g.strokeStyle = "rgba(170,176,184,0.45)"; g.lineWidth = 1.4;
    g.beginPath();
    const ca = Math.cos(-0.5), sa = Math.sin(-0.5);
    for (let i = 0; i < 90; i++) {
      const a = R() * K.TAU, rx = 72, ry = 50;
      const ex = px + Math.cos(a) * rx * ca - Math.sin(a) * ry * sa;
      const ey = py - 8 + Math.cos(a) * rx * sa + Math.sin(a) * ry * ca;
      g.moveTo(ex, ey); g.lineTo(ex + Math.cos(a) * (3 + R() * 6), ey + Math.sin(a) * (3 + R() * 6));
    }
    for (let i = 0; i < 40; i++) {
      const u = R(), sd = R() < 0.5 ? -1 : 1;
      const ex = K.lerp(cuff[0] + 10, px + 22, u) + nx * 50 * sd, ey = K.lerp(cuff[1] - 30, py - 40, u) + ny * 50 * sd;
      g.moveTo(ex, ey); g.lineTo(ex + nx * sd * (3 + R() * 6) + ux * 4, ey + ny * sd * (3 + R() * 6) + uy * 4);
    }
    g.stroke();
    const lg = g.createLinearGradient(px + nx * 70, py + ny * 70, px - nx * 70, py - ny * 70);
    lg.addColorStop(0, "#4d535b"); lg.addColorStop(0.45, "#8e949c"); lg.addColorStop(0.8, "#a9afb6"); lg.addColorStop(1, "#6a7078");
    g.fillStyle = lg; g.fill(paw);
    g.save(); g.clip(paw);
    // two faint tabby bars across the paw
    g.strokeStyle = "rgba(42,46,54,0.4)"; g.lineWidth = 12;
    for (let i = 0; i < 2; i++) {
      const u = 0.3 + i * 0.35;
      const cx = K.lerp(cuff[0] + 26, px + 26, u), cy = K.lerp(cuff[1] - 46, py - 46, u);
      g.beginPath(); g.moveTo(cx + nx * 50, cy + ny * 50); g.quadraticCurveTo(cx + ux * 14, cy + uy * 14, cx - nx * 50, cy - ny * 50); g.stroke();
    }
    // fur strokes follow the paw's direction
    g.lineWidth = 1.2;
    for (let pass = 0; pass < 2; pass++) {
      g.strokeStyle = pass ? "rgba(225,230,236,0.35)" : "rgba(30,34,40,0.35)";
      g.beginPath();
      for (let i = 0; i < 150; i++) {
        const fx = px - 70 + R() * 180, fy = py - 170 + R() * 200;
        g.moveTo(fx, fy); g.lineTo(fx + ux * 9, fy + uy * 9);
      }
      g.stroke();
    }
    // creases between the toes + green bounce light from the button below
    g.strokeStyle = "rgba(30,34,40,0.55)"; g.lineWidth = 2.5;
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      const u = (k - 1) * 0.42;
      g.moveTo(px - 30 + Math.cos(2.3 + u + 0.21) * 34 * 0.7, py + 6 + Math.sin(2.3 + u + 0.21) * 30 * 0.7);
      g.lineTo(px - 30 + Math.cos(2.3 + u + 0.21) * 34 * 1.25, py + 6 + Math.sin(2.3 + u + 0.21) * 30 * 1.25);
    }
    g.stroke();
    const bl = g.createRadialGradient(bx, by + 20, 10, bx, by + 20, 220);
    bl.addColorStop(0, K.rgba("#7affc0", 0.12 + 0.2 * lit)); bl.addColorStop(1, "rgba(122,255,192,0)");
    g.fillStyle = bl; g.fillRect(px - 200, py - 300, 400, 400);
    // a cool top light from the lab keeps the fur grey on the upper side
    const tl = g.createLinearGradient(px + nx * 60, py + ny * 60, px - nx * 60, py - ny * 60);
    tl.addColorStop(0, "rgba(230,240,245,0.18)"); tl.addColorStop(0.5, "rgba(230,240,245,0)");
    g.fillStyle = tl; g.fillRect(px - 200, py - 300, 400, 400);
    g.restore();
    // --- the lab-coat sleeve: a white cotton tube from off frame, soft folds, a turned-back cuff ---
    const slv = new Path2D();
    K.tube(slv, [ax, ay, K.lerp(ax, cuff[0], 0.5) + nx * 10, K.lerp(ay, cuff[1], 0.5) + ny * 10, cuff[0], cuff[1]], [190, 150, 120], 6, false, true);
    const sg = g.createLinearGradient(cuff[0] + nx * 80, cuff[1] + ny * 80, cuff[0] - nx * 80, cuff[1] - ny * 80);
    sg.addColorStop(0, "#7d8c8a"); sg.addColorStop(0.35, "#dfe9e6"); sg.addColorStop(0.7, "#f6fbf9"); sg.addColorStop(1, "#a9b9b6");
    g.fillStyle = sg; g.fill(slv);
    g.save(); g.clip(slv);
    for (let k = 0; k < 4; k++) {
      const u = 0.25 + k * 0.17;
      const cx = K.lerp(ax, cuff[0], u), cy = K.lerp(ay, cuff[1], u);
      g.strokeStyle = "rgba(60,80,78,0.35)"; g.lineWidth = 5;
      g.beginPath(); g.moveTo(cx + nx * 70, cy + ny * 70); g.quadraticCurveTo(cx + ux * 22 + nx * 10, cy + uy * 22 + ny * 10, cx - nx * 40, cy - ny * 40); g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx + nx * 70 - ux * 5, cy + ny * 70 - uy * 5); g.quadraticCurveTo(cx + ux * 16 + nx * 10, cy + uy * 16 + ny * 10, cx - nx * 40 - ux * 5, cy - ny * 40 - uy * 5); g.stroke();
    }
    g.restore();
    // turned-back cuff band at the wrist
    const cb = new Path2D();
    const c0 = [cuff[0] - ux * 26, cuff[1] - uy * 26];
    cb.moveTo(c0[0] + nx * 64, c0[1] + ny * 64);
    cb.lineTo(cuff[0] + nx * 62, cuff[1] + ny * 62);
    cb.quadraticCurveTo(cuff[0] + ux * 12, cuff[1] + uy * 12, cuff[0] - nx * 62, cuff[1] - ny * 62);
    cb.lineTo(c0[0] - nx * 64, c0[1] - ny * 64);
    cb.quadraticCurveTo(c0[0] + ux * 12, c0[1] + uy * 12, c0[0] + nx * 64, c0[1] + ny * 64);
    const cbg = g.createLinearGradient(cuff[0] + nx * 64, cuff[1] + ny * 64, cuff[0] - nx * 64, cuff[1] - ny * 64);
    cbg.addColorStop(0, "#9aaba8"); cbg.addColorStop(0.5, "#f4faf8"); cbg.addColorStop(1, "#b5c4c1");
    g.fillStyle = cbg; g.fill(cb);
    g.strokeStyle = "rgba(60,80,78,0.5)"; g.lineWidth = 1.5; g.stroke(cb);
    g.save(); g.clip(cb);
    g.fillStyle = K.rgba("#7affc0", 0.12 + 0.3 * lit);
    g.fillRect(cuff[0] - 100, cuff[1] - 10, 200, 120);
    g.restore();
  });
}
function shotMap(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 57.8, 62.2));
  const reveal = K.ease.inOut(K.seg(t, 58.1, 61.2));
  const hit = K.flash(t, [58.0], 0.1);
  K.withCamera(g, W, H, { x: 480, y: 270 - p * 10, zoom: 1.0 + p * 0.06, shakeT: t, shakeAmt: 1 + hit * 4 }, () => {
    g.fillStyle = "#050a0b"; g.fillRect(-40, -40, W + 80, H + 80);
    topoMap(g, 40, 30, 880, 450, t, reveal);
    g.strokeStyle = "rgba(160,255,215,0.3)"; g.lineWidth = 2; g.strokeRect(40, 30, 880, 450);
    K.glow(g, 480, 260, 560, TEAL, 0.22 + hit * 0.3);
    // the lab cat, in front, silhouetted by the map glow
    // static pose: cached once instead of repainting a 150 px fur-detailed cat every frame
    g.drawImage(K.sprite("f09labcatmap", W, H, (s) => labCat(s, W, H, 800, 610, 150, 58, { headTurn: -0.2, light: { x: 500, y: 200, color: "#9fffe0", strength: 1.8 } }, 0.55)), 0, 0, W, H);
    if (hit > 0) { g.fillStyle = `rgba(200,255,230,${0.25 * hit})`; g.fillRect(-40, -40, W + 80, H + 80); }
  });
}

// ---- SHOT 7 [62-70] up the internal staircase, red emergency light -----------------------------
function shotStairs(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 62, 70));
  // a rotating emergency beacon above the hatch: its beam sweeps left-right-left across the shaft,
  // over both walls, the stairs and you
  const sweep = Math.PI / 2 + 1.3 * Math.sin(t * 1.9);
  const sx = Math.cos(sweep);
  const red = (a) => (a === Math.PI ? Math.pow(Math.max(0, -sx), 1.5) : a === 0 ? Math.pow(Math.max(0, sx), 1.5) : 0.35 + 0.65 * (1 - Math.abs(sx)));
  K.withCamera(g, W, H, { x: 480, y: 270 + p * -30, zoom: 1.02 + p * 0.06, rot: -0.01, shakeT: t, shakeAmt: 1.6 }, () => {
    g.fillStyle = "#07080a"; g.fillRect(-60, -60, W + 120, H + 120);
    // shaft walls converge to the hatch at the top
    const vx = 480, vy = 70;
    const wallL = [[-60, -60], [vx - 90, vy - 40], [vx - 90, vy + 60], [-60, H + 60]];
    const wallR = [[W + 60, -60], [vx + 90, vy - 40], [vx + 90, vy + 60], [W + 60, H + 60]];
    for (const [pts, a] of [[wallL, Math.PI], [wallR, 0]]) {
      poly(g, pts);
      g.fillStyle = "#12161a"; g.fill();
      poly(g, pts);
      g.fillStyle = K.rgba("#ff2a1a", 0.42 * red(a)); g.fill();
    }
    // rivets / panel seams
    g.strokeStyle = "rgba(60,70,78,0.5)"; g.lineWidth = 1.2;
    g.beginPath();
    for (let k = 1; k < 9; k++) {
      const u = Math.pow(k / 9, 1.6);
      g.moveTo(K.lerp(vx - 90, -60, u), K.lerp(vy - 40, -60, u)); g.lineTo(K.lerp(vx - 90, -60, u), K.lerp(vy + 60, H + 60, u));
      g.moveTo(K.lerp(vx + 90, W + 60, u), K.lerp(vy - 40, -60, u)); g.lineTo(K.lerp(vx + 90, W + 60, u), K.lerp(vy + 60, H + 60, u));
    }
    g.stroke();
    // the hatch: a round wheel door with lava light leaking round it
    K.glow(g, vx, vy, 140, "#ff7a2a", 0.4);
    g.fillStyle = "#1c2024"; g.beginPath(); g.ellipse(vx, vy, 74, 46, 0, 0, K.TAU); g.fill();
    g.strokeStyle = "#ffb06a"; g.lineWidth = 2.2; g.beginPath(); g.ellipse(vx, vy, 74, 46, 0, 0, K.TAU); g.stroke();
    g.strokeStyle = "#3a4046"; g.lineWidth = 5; g.beginPath(); g.ellipse(vx, vy, 30, 18, 0, 0, K.TAU); g.stroke();
    g.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; g.moveTo(vx + Math.cos(a) * 30, vy + Math.sin(a) * 18); g.lineTo(vx - Math.cos(a) * 30, vy - Math.sin(a) * 18); } g.stroke();
    // steep stairs: treads from the bottom up toward the hatch
    for (let k = 0; k < 22; k++) {
      const u = Math.pow(k / 22, 0.75);
      const y = K.lerp(H + 40, vy + 56, u), hw = K.lerp(330, 70, u), th = K.lerp(30, 4, u);
      g.fillStyle = "#2a3036"; g.fillRect(vx - hw, y - th, hw * 2, th);
      g.fillStyle = K.rgba("#ff5a3a", 0.25 * red(-Math.PI / 2) + 0.06);
      g.fillRect(vx - hw, y - th, hw * 2, Math.max(1, th * 0.25));
      g.fillStyle = "#0b0d10"; g.fillRect(vx - hw, y, hw * 2, th * 0.8);
    }
    // warm light from the hatch crack spills down the top of the flight
    K.glow(g, vx, vy + 70, 300, "#ff8a3a", 0.22);
    // handrails
    g.strokeStyle = "#5a646c"; g.lineWidth = 4;
    g.beginPath(); g.moveTo(80, H + 40); g.lineTo(vx - 80, vy + 30); g.moveTo(W - 80, H + 40); g.lineTo(vx + 80, vy + 30); g.stroke();
    // you, running up and away from us
    const climb = K.ease.inOut(K.seg(t, 62.2, 69.5));
    const ky = K.lerp(H + 120, 150, climb), kh = K.lerp(420, 70, climb);
    // you: running up, arms pumping, a stride bob and a little side-to-side sway
    const ph = t * 1.9;
    const bob = -Math.abs(Math.sin(ph * Math.PI * 2)) * kh * 0.025;
    const sway = Math.sin(ph * Math.PI * 2) * kh * 0.012;
    kidSilhouette(g, W, H, vx + 10 + sway, ky + bob, kh, t, { x: vx, y: vy - 40, color: "#ffb06a", strength: 1.3 }, { run: true, phase: ph, hood: true, dark0: 0.8, dark1: 0.92, rimA: 1.5, warm: 0.22 });
    // the beacon (a red dome above the hatch) and its sweeping beam
    const bx = vx + 112, by = vy - 6;
    K.godRays(g, bx, by, W, H, { color: "#ff3a22", count: 3, strength: 0.55, t, angle: sweep, spread: 0.2, length: 900, seed: 9 });
    // where the beam lands: a broad band of red light sliding across walls, stairs and you
    const bandX = bx + Math.cos(sweep) / Math.max(0.25, Math.sin(sweep)) * 420;
    const bg2 = g.createLinearGradient(bandX - 260, 0, bandX + 260, 0);
    bg2.addColorStop(0, "rgba(255,40,24,0)"); bg2.addColorStop(0.5, "rgba(255,40,24,0.3)"); bg2.addColorStop(1, "rgba(255,40,24,0)");
    g.save(); g.globalCompositeOperation = "lighter"; g.fillStyle = bg2; g.fillRect(-60, by, W + 120, H + 120); g.restore();
    g.fillStyle = "#3a0a08"; g.beginPath(); g.ellipse(bx, by, 16, 10, 0, Math.PI, 0); g.fill();
    K.glow(g, bx, by - 4, 70, "#ff2a1a", 0.8);
    K.glow(g, bx + Math.cos(sweep) * 10, by - 4, 22, "#ffd0c0", 0.7);
    g.fillStyle = K.rgba("#ff2a1a", 0.06);
    g.fillRect(-60, -60, W + 120, H + 120);
  });
  K.dust(g, W, H, t, { seed: 97, count: 50, color: "#ff8a6a", size: 1.5, alpha: 0.4 });
}

// ---- edit -----------------------------------------------------------------------------------------
const SHOTS = [
  [0, 10, shotLab], [10, 17.2, shotWall], [17.2, 20, shotButton], [20, 34, shotCCTV], [34, 44, shotPaused],
  [44, 54, shotIR], [54, 56.4, shotLabCat], [56.4, 57.8, shotPaw], [57.8, 62, shotMap], [62, 70.5, shotStairs],
];
const XF = { 10: 0.8, 44: 0.4, 54: 0.6, 62: 0.6 }; // cross-dissolve lengths at these cuts
function shotAt(t) {
  for (let i = 0; i < SHOTS.length; i++) if (t < SHOTS[i][1]) return i;
  return SHOTS.length - 1;
}
function render(g, t, W, H) {
  const i = shotAt(t);
  const [a, , fn] = SHOTS[i];
  const xin = XF[a];
  if (xin && t < a + xin && i > 0) {
    const k = K.smooth((t - a) / xin);
    SHOTS[i - 1][2](g, t, W, H);
    const L = K.layer(W, H, "f09xf");
    fn(L.g, t, W, H);
    g.save(); g.globalAlpha = k; g.drawImage(L.canvas, 0, 0, W, H); g.restore();
  } else fn(g, t, W, H);
}

export const film = {
  id: 9,
  title: "Security Footage",
  chapter: "Chapter 9",
  unlockAt: 45,
  duration: D,
  poster: 36,
  tagline: "The cameras saw everything.",
  subs: [
    [3.0, 7.0, "The lab watched everything. Every zone."],
    [12.0, 16.0, "You rewound the tapes."],
    [21.5, 25.5, "There he was. Walking. Not running."],
    [26.0, 31.0, "And behind him, small cats. Following."],
    [35.5, 40.0, "The bent ear. It was him. It was really him."],
    [47.0, 52.5, "He left a kitten in the hay. And walked away."],
    [53.0, 54.0, "Why?"],
    [56.0, 60.5, "The lab cat showed you the way. The summit."],
    [63.0, 68.0, "He was right above you."],
  ],
  voice: [
    [3.0, "The lab watched everything. Every zone.", { rate: 0.92, pitch: 1.0 }],
    [12.0, "You rewound the tapes.", { rate: 0.92, pitch: 1.0 }],
    [21.5, "There he was. Walking. Not running.", { rate: 0.92, pitch: 1.0 }],
    [26.0, "And behind him, small cats. Following.", { rate: 0.92, pitch: 1.0 }],
    [35.5, "The bent ear. It was him. It was really him.", { rate: 0.92, pitch: 1.0 }],
    [47.0, "He left a kitten in the hay. And walked away.", { rate: 0.88, pitch: 0.98 }],
    [53.0, "Why?", { rate: 0.85, pitch: 0.95 }],
    [56.0, "The lab cat showed you the way. The summit.", { rate: 0.92, pitch: 1.0 }],
    [63.0, "He was right above you.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: { mood: "mystery", key: "E", bpm: 80, cues: [[8, "drop"], [24, "hit"], [34, "meow"], [46, "swell"], [58, "hit"], [66, "swell"]] },
  draw(g, t, W, H) {
    g.save();
    if (W !== 960 || H !== 540) g.scale(W / 960, H / 540);
    const w = 960, h = 540;
    render(g, t, w, h);
    const cctv = t >= 20 && t < 54;
    K.finish(g, w, h, t, {
      bloom: cctv ? 0.25 : 0.42, tint: cctv ? "#9affc8" : "#2affc0", tintAlpha: cctv ? 0.06 : 0.12,
      vignette: cctv ? 0.45 : 0.62, grain: cctv ? 0.05 : 0.06, letterbox: 1,
    });
    if (t > 61 && t < 70.5) K.grade(g, w, h, { tint: "#ff3a2a", alpha: 0.08, mode: "soft-light" });
    K.title(g, w, h, "Security Footage", "Chapter 9", K.env(t, 2, 6, 0.9, 1.0), { glow: "#7affd0" });
    K.fadeBlack(g, w, h, 1 - K.smooth(K.seg(t, 0, 1.4)));
    K.fadeBlack(g, w, h, K.smooth(K.seg(t, 68.4, 70)));
    g.restore();
  },
};
