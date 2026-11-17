// films/f10.js - Chapter 10 "So Close" (FILMS.md f10). Two-tone night on the crater rim of Mount
// Hairball: lava glow from below, cool moonlight on the rocks' top edges. Across the fire you see
// Biscuit, he answers your call, and then he walks away over the rim. Pure function of t.
import * as K from "../filmkit.js";

const D = 72;
const LAVA = "#ff6a2a", NIGHT = "#0e0b1a", MOON = "#9fb2ff", SHADOW_EDGE = "#bcd6ff";
const MOON_DIR = [0.55, -0.83]; // the moon is up and to the right in every shot

// ---- helpers ---------------------------------------------------------------------------------------
function poly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}
// a jagged ridge profile: [[x, y], ...] from x0 to x1
function ridgePts(x0, x1, y, amp, seed, freq = 0.012, step = 8, rough = 1) {
  const out = [];
  for (let x = x0; x <= x1 + step; x += step) {
    // broad shape + crags + boulders (absolute pixel roughness so even flat rims read as rock)
    const n = K.fbm(x * freq, seed) * amp + K.noise(x * freq * 5.3, seed + 7) * amp * 0.12
      + (K.noise(x * 0.045, seed + 3) * 3.2 + K.noise(x * 0.11, seed + 5) * 1.4 - Math.max(0, K.noise(x * 0.021, seed + 9)) * 7) * rough;
    out.push([x, y + n]);
  }
  return out;
}
// a big, believable moon: limb darkening, soft low-contrast maria, small craters (cached sprite)
function bigMoon(g, x, y, r, glowAmt = 1) {
  K.glow(g, x, y, r * 4.2, MOON, 0.28 * glowAmt);
  K.glow(g, x, y, r * 1.9, "#e6ecff", 0.4 * glowAmt);
  const spr = K.sprite("f10moon", 256, 256, (s) => {
    const c = 128, R0 = 126;
    const gr = s.createRadialGradient(c - 18, c - 22, 8, c, c, R0);
    gr.addColorStop(0, "#fbfaf4"); gr.addColorStop(0.75, "#e8e6dc"); gr.addColorStop(1, "#b8b8b6");
    s.fillStyle = gr;
    s.beginPath(); s.arc(c, c, R0, 0, K.TAU); s.fill();
    s.save(); s.clip();
    const R = K.rng("f10maria");
    for (let i = 0; i < 46; i++) {
      const mx = c + (R() - 0.45) * 190, my = c + (R() - 0.55) * 170, mr = 10 + R() * 34;
      const mg = s.createRadialGradient(mx, my, 0, mx, my, mr);
      mg.addColorStop(0, K.rgba("#787c84", 0.1 + R() * 0.12)); mg.addColorStop(1, "rgba(120,124,132,0)");
      s.fillStyle = mg; s.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    }
    for (let i = 0; i < 40; i++) {
      const cx = c + (R() - 0.5) * 230, cy = c + (R() - 0.5) * 230, cr = 1 + Math.pow(R(), 3) * 7;
      s.strokeStyle = "rgba(90,92,100,0.1)"; s.lineWidth = 1;
      s.beginPath(); s.arc(cx + 0.6, cy + 0.6, cr, 0, K.TAU); s.stroke();
      s.strokeStyle = "rgba(255,255,250,0.12)";
      s.beginPath(); s.arc(cx - 0.4, cy - 0.4, cr, Math.PI * 0.9, Math.PI * 1.7); s.stroke();
    }
    // limb darkening + a cool terminator tint on the left edge
    const lg = s.createRadialGradient(c, c, R0 * 0.55, c, c, R0);
    lg.addColorStop(0, "rgba(40,44,70,0)"); lg.addColorStop(1, "rgba(40,44,70,0.35)");
    s.fillStyle = lg; s.fillRect(0, 0, 256, 256);
    s.restore();
  });
  g.drawImage(spr, x - r, y - r, r * 2, r * 2);
}
// fill a ridge down to `bottom`, lit from below by lava and edged by moonlight on faces toward the moon
// fill a ridge down to `bottom`, lit from below by lava. Two-colour lighting: EVERY top edge gets a
// thin cool moon line (stronger on faces toward the moon), and the rock warms toward its underside.
function ridge(g, pts, bottom, o = {}) {
  const base = o.color || "#141018";
  g.beginPath();
  g.moveTo(pts[0][0], bottom);
  for (const p of pts) g.lineTo(p[0], p[1]);
  g.lineTo(pts[pts.length - 1][0], bottom);
  g.closePath();
  let top = 1e9;
  for (const p of pts) top = Math.min(top, p[1]);
  const gr = g.createLinearGradient(0, top, 0, bottom);
  gr.addColorStop(0, base);
  gr.addColorStop(1, o.under ? K.mix(base, o.under, o.underAmt == null ? 0.5 : o.underAmt) : base);
  g.fillStyle = gr;
  g.fill();
  if (o.moon !== false) {
    // soft skylight just under the crest, then the crisp moon edge
    g.save();
    g.clip();
    const sg = g.createLinearGradient(0, top, 0, top + 26);
    sg.addColorStop(0, K.rgba(MOON, 0.08 * (o.moonA == null ? 0.7 : o.moonA)));
    sg.addColorStop(1, K.rgba(MOON, 0));
    g.fillStyle = sg;
    g.fillRect(pts[0][0], top, pts[pts.length - 1][0] - pts[0][0], 26);
    g.restore();
    g.lineWidth = o.edge || 1.6;
    g.lineCap = "round";
    const mA = o.moonA == null ? 0.7 : o.moonA;
    // bucket segments by alpha so the edge is a handful of strokes, not one per segment
    const buckets = [[], [], [], []];
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1];
      const l = Math.hypot(dx, dy) || 1;
      const lit = K.clamp((dy * MOON_DIR[0] - dx * MOON_DIR[1]) / l * -1);
      const v = 0.22 + 0.78 * Math.pow(lit, 1.5);
      buckets[Math.min(3, Math.floor(v * 4))].push(i);
    }
    buckets.forEach((b, k) => {
      if (!b.length) return;
      g.strokeStyle = K.rgba(MOON, mA * (k + 0.6) / 4);
      g.beginPath();
      for (const i of b) { g.moveTo(pts[i][0], pts[i][1] + 0.6); g.lineTo(pts[i + 1][0], pts[i + 1][1] + 0.6); }
      g.stroke();
    });
  }
}
// silhouette(g, W, H, key, paint, o): paint into a small offscreen layer covering only o.box
// ([x0, y0, x1, y1] in the caller's coordinates), darken it (source-atop gradient), add a lava
// underlight, and add rims made from the silhouette minus itself shifted away from each light.
// o.soft (px) blurs the rims so they read as wrapped light, never as an outline.
function silhouette(g, W, H, key, paint, o = {}) {
  const b = o.box || [0, 0, W, H];
  const x0 = Math.floor(b[0]), y0 = Math.floor(b[1]);
  const w = Math.max(32, Math.ceil((b[2] - x0) / 32) * 32), h = Math.max(32, Math.ceil((b[3] - y0) / 32) * 32);
  const L = K.layer(w, h, key + w + "x" + h);
  const c = L.g;
  c.translate(-x0, -y0);
  c.save();
  paint(c);
  c.restore();
  c.globalAlpha = 1; // (drawCat can leave alpha/filter state behind; the darkening must be full strength)
  c.filter = "none";
  c.globalCompositeOperation = "source-atop";
  const dg = c.createLinearGradient(0, b[1], 0, b[3]);
  dg.addColorStop(0, K.rgba("#06040a", o.dark0 == null ? 0.7 : o.dark0));
  dg.addColorStop(1, K.rgba("#06040a", o.dark1 == null ? 0.55 : o.dark1));
  c.fillStyle = dg;
  c.fillRect(x0, y0, w, h);
  if (o.under) {
    const ug = c.createLinearGradient(0, b[3], 0, b[1]);
    ug.addColorStop(0, K.rgba(o.under, o.underA == null ? 0.45 : o.underA));
    ug.addColorStop(o.underSpread == null ? 0.45 : o.underSpread, K.rgba(o.under, 0.06));
    ug.addColorStop(1, K.rgba(o.under, 0));
    c.fillStyle = ug;
    c.fillRect(x0, y0, w, h);
  }
  c.globalCompositeOperation = "source-over";
  g.drawImage(L.canvas, x0, y0, w, h);
  const rims = o.rims || [];
  if (!rims.length) return;
  const R = K.layer(w, h, key + "rim" + w + "x" + h);
  const ps = K.pixelScale();
  for (let i = 0; i < rims.length; i++) {
    const rim = rims[i];
    if (i > 0) { R.g.setTransform(1, 0, 0, 1, 0, 0); R.g.clearRect(0, 0, R.canvas.width, R.canvas.height); }
    R.g.setTransform(1, 0, 0, 1, 0, 0);
    R.g.globalCompositeOperation = "source-over";
    R.g.drawImage(L.canvas, 0, 0); // the silhouette (any opaque pixel works)
    R.g.globalCompositeOperation = "destination-out";
    R.g.drawImage(L.canvas, -rim.dx * ps, -rim.dy * ps);
    R.g.globalCompositeOperation = "source-in";
    R.g.fillStyle = rim.color;
    R.g.fillRect(0, 0, R.canvas.width, R.canvas.height);
    R.g.globalCompositeOperation = "source-over";
    g.save();
    g.globalCompositeOperation = "lighter";
    const a = rim.alpha == null ? 0.7 : rim.alpha;
    if (o.soft) {
      g.translate(x0, y0);
      K.dof(g, R.canvas, o.soft, a);
      g.globalAlpha *= a * 0.35;
      g.drawImage(R.canvas, 0, 0, w, h);
    } else {
      g.globalAlpha *= a;
      g.drawImage(R.canvas, x0, y0, w, h);
    }
    g.restore();
  }
}
// A cat silhouette (darkened, lava underlight, thin moon rim) painted ONCE into a sprite and stamped.
// Anchor = the ground point under the cat. Keys must encode every pose parameter that matters.
function catSil(key, size, opts, o = {}) {
  const w = Math.ceil(size * 4.2), h = Math.ceil(size * 2.5) + 10;
  const ax = w / 2, ay = h - 10;
  const spr = K.sprite("f10cs:" + key + ":" + Math.round(size), w, h, (s) => {
    const paint = (c) => {
      const op = Object.assign({ t: 0, shadow: false, bell: false }, opts);
      if (size < 90) return K.drawCat(c, ax, ay, size, op);
      const k = size / 88;
      c.save(); c.translate(ax, ay); c.scale(k, k); K.drawCat(c, 0, 0, 88, op); c.restore();
    };
    const rw = o.rimW || 1.4;
    silhouette(s, w, h, "f10cstmp", paint, {
      box: [0, 0, w, h], dark0: o.dark0 == null ? 0.99 : o.dark0, dark1: o.dark1 == null ? 0.985 : o.dark1,
      under: LAVA, underA: o.underA == null ? 0.42 : o.underA, underSpread: 0.07,
      rims: [{ dx: MOON_DIR[0] * rw, dy: MOON_DIR[1] * rw, color: MOON, alpha: o.rimA == null ? 0.75 : o.rimA }, { dx: 0, dy: rw * 0.9, color: LAVA, alpha: 0.45 }],
      soft: o.soft,
    });
  });
  return { spr, w, h, ax, ay };
}
function stampSil(g, cs, x, y, alpha = 1) {
  if (alpha <= 0.01) return;
  if (alpha < 1) { g.save(); g.globalAlpha *= alpha; }
  g.drawImage(cs.spr, x - cs.ax, y - cs.ay, cs.w, cs.h);
  if (alpha < 1) g.restore();
}
function puff(color) { return K.glowSprite(color); }
// smoke columns rising from (x, y), drifting right; lit orange from below (the underside of each
// puff gets the lava, the top stays cool and dark)
function smoke(g, t, x, y, o = {}) {
  const n = o.n || 14, h = o.h || 380, w = o.w || 60, seed = o.seed || 1, sc = o.scale || 1;
  const dark = puff(o.color || "#2a2128"), warm = puff(LAVA), cool = puff(MOON);
  g.save();
  for (let i = 0; i < n; i++) {
    const age = ((t * (o.speed || 0.05) + i / n + K.hash(seed, 3)) % 1 + 1) % 1;
    const px = x + age * age * (o.drift == null ? 160 : o.drift) * sc + K.noise(t * 0.3 + i * 1.7, seed) * 18 * sc * (0.3 + age);
    const py = y - age * h * sc;
    const r = (w * 0.4 + age * w * 1.8) * sc * (0.8 + K.hash(i, seed) * 0.4);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = (o.alpha || 0.55) * Math.sin(Math.min(1, age * 4) * Math.PI / 2) * (1 - age * 0.7);
    g.drawImage(dark, px - r, py - r, r * 2, r * 2);
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = (o.warm == null ? 0.35 : o.warm) * (1 - age) * (1 - age * 0.6);
    g.drawImage(warm, px - r * 0.8, py - r * 0.05, r * 1.6, r * 1.0);   // underside
    if (o.cool !== false) {
      g.globalAlpha = 0.06 * Math.sin(age * Math.PI);
      g.drawImage(cool, px - r * 0.5 + r * 0.25, py - r * 0.95, r, r * 0.7); // moonlit top
    }
  }
  g.restore();
}
function embers(g, W, H, t, o = {}) {
  const n = o.count || 50, seed = o.seed || 4;
  const [ax, ay, aw, ah] = o.area || [0, 0, W, H];
  for (let i = 0; i < n; i++) {
    const sp = 18 + K.hash(i, seed) * 30;
    const life = ah + 40;
    const yy = ay + ah - (((t * sp + K.hash(i + 0.3, seed) * life) % life) + life) % life;
    const xx = ax + ((K.hash(i + 0.7, seed) * aw + K.noise(t * 0.4 + i, seed) * 50 + t * (o.wind == null ? 14 : o.wind)) % aw + aw) % aw;
    const fl = 0.5 + 0.5 * Math.sin(t * (5 + K.hash(i, 9) * 6) + i);
    const s = (o.size || 1.6) * (0.6 + K.hash(i + 0.1, seed));
    K.glow(g, xx, yy, s * 5, "#ff7a2a", 0.35 * fl);
    g.fillStyle = K.rgba("#ffd27a", 0.6 + 0.4 * fl);
    g.fillRect(xx - s / 2, yy - s / 2, s, s);
  }
}
// big out-of-focus embers drifting past the lens: soft discs (no blur pass needed)
function bokehEmbers(g, W, H, t, o = {}) {
  const n = o.count || 7, seed = o.seed || 21;
  for (let i = 0; i < n; i++) {
    const sp = 14 + K.hash(i, seed) * 18;
    const life = H + 200;
    const yy = H + 100 - (((t * sp + K.hash(i + 0.3, seed) * life) % life) + life) % life;
    const xx = ((K.hash(i + 0.7, seed) * W + K.noise(t * 0.2 + i, seed) * 80 + t * 10) % W + W) % W;
    const r = (o.size || 16) * (0.6 + K.hash(i + 0.1, seed) * 0.8);
    const fl = 0.75 + 0.25 * Math.sin(t * 3 + i);
    K.glow(g, xx, yy, r * 1.6, "#ff7a2a", 0.22 * fl);
    K.glow(g, xx, yy, r * 0.8, "#ffc27a", 0.28 * fl);
  }
}
// the lava lake. The crust (plates with glowing crack edges) is static art in a sprite that drifts;
// only the bright bursts and the glow are live.
function lavaLake(g, t, cx, cy, rx, ry) {
  const crust = K.sprite("f10crust:" + rx + "x" + ry, rx * 2, ry * 2, (s) => {
    s.beginPath(); s.ellipse(rx, ry, rx, ry, 0, 0, K.TAU); s.clip();
    const lg = s.createRadialGradient(rx, ry, 2, rx, ry, rx);
    lg.addColorStop(0, "#fff0a0"); lg.addColorStop(0.3, "#ffb03a"); lg.addColorStop(0.7, "#e2461a"); lg.addColorStop(1, "#7a1a08");
    s.fillStyle = lg;
    s.fillRect(0, 0, rx * 2, ry * 2);
    const R = K.rng("crust");
    const plates = [];
    for (let i = 0; i < 120; i++) {
      const u = R(), v = R();
      const px = rx + (u - 0.5) * rx * 2.1, py = ry + (v - 0.5) * ry * 2.1;
      const d = Math.hypot((px - rx) / rx, (py - ry) / ry);
      const pr = (0.035 + R() * 0.07) * rx * (0.5 + d * 0.9);
      const p = new Path2D();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * K.TAU + R() * 0.6;
        const rr = pr * (0.7 + R() * 0.4);
        const qx = px + Math.cos(a) * rr, qy = py + Math.sin(a) * rr * (ry / rx) * 1.4;
        if (k === 0) p.moveTo(qx, qy); else p.lineTo(qx, qy);
      }
      p.closePath();
      plates.push([p, d]);
    }
    // crust: darker near the cooler edge of the lake, cracks glowing along every plate edge
    for (const [p, d] of plates) {
      s.fillStyle = K.rgba(K.mix("#3a120a", "#1c0806", K.clamp(d)), 0.86);
      s.fill(p);
    }
    s.globalCompositeOperation = "lighter";
    s.lineJoin = "round";
    s.strokeStyle = "rgba(255,150,60,0.55)"; s.lineWidth = 1.4;
    for (const [p] of plates) s.stroke(p);
    s.strokeStyle = "rgba(255,230,150,0.35)"; s.lineWidth = 0.6;
    for (const [p] of plates) s.stroke(p);
    s.globalCompositeOperation = "source-over";
    // the far half of the lake is foreshortened: a soft dark band at the back edge
    const fb = s.createLinearGradient(0, 0, 0, ry);
    fb.addColorStop(0, "rgba(30,8,4,0.55)"); fb.addColorStop(1, "rgba(30,8,4,0)");
    s.fillStyle = fb; s.fillRect(0, 0, rx * 2, ry);
  });
  const drift = Math.sin(t * 0.07) * rx * 0.03;
  g.save();
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, K.TAU); g.clip();
  g.drawImage(crust, cx - rx + drift, cy - ry, rx * 2, ry * 2);
  if (drift > 0) g.drawImage(crust, cx - rx * 3 + drift, cy - ry, rx * 2, ry * 2);
  // bursting bright spots
  for (let i = 0; i < 6; i++) {
    const ph = (t * 0.35 + K.hash(i, 5)) % 1;
    const bx = cx + (K.hash(i, 6) - 0.5) * rx * 1.4, by = cy + (K.hash(i, 7) - 0.5) * ry * 1.2;
    K.glow(g, bx, by, rx * 0.12 * (0.4 + ph), "#fff2b0", 0.6 * Math.sin(ph * Math.PI));
  }
  g.restore();
  K.glow(g, cx, cy, rx * 1.3, LAVA, 0.55);
  K.glow(g, cx, cy - ry, rx * 0.8, "#ffb03a", 0.25);
}
function sky(g, W, H, horizon, glowAmt = 1) {
  K.sky(g, W, H, { top: "#07060e", mid: NIGHT, bottom: "#3a1a22", horizon: horizon / H });
  const gg = g.createLinearGradient(0, horizon - 220, 0, horizon);
  gg.addColorStop(0, "rgba(255,106,42,0)"); gg.addColorStop(1, K.rgba(LAVA, 0.25 * glowAmt));
  g.fillStyle = gg; g.fillRect(0, horizon - 220, W, 220);
}
// big static backdrops (sky + stars + moon [+ ridge]) are painted once: the camera moves over them
function backdrop(key, W, H, paint) {
  return K.sprite("f10bd:" + key, W + 160, H + 160, (s) => { s.translate(80, 80); paint(s); });
}
function stampBackdrop(g, spr, W, H) { g.drawImage(spr, -80, -80, W + 160, H + 160); }

// ---- the wide crater (shots 1, 6) -----------------------------------------------------------------
// The crater: sky, far rim, and the inner walls running DOWN to the lake (no gap), lit from the
// lake below. Static, so painted once; the lake, smoke and near lip are drawn over it.
function craterBack(W, H, o) {
  return K.sprite("f10crater:" + o.moonX + ":" + o.moonY + ":" + o.moonR, W, H + 140, (g) => {
    g.translate(0, 100);
    sky(g, W, H + 300, 300, 1);
    K.stars(g, W, H, 10, 1.1, 0, { yMax: 270 });
    K.moon(g, o.moonX, o.moonY, o.moonR, { glow: 0.9, halo: MOON });
    const far = ridgePts(-20, W + 20, 262, 26, 3, 0.006);
    ridge(g, far, 360, { color: "#251c2e", under: LAVA, underAmt: 0.35, moonA: 0.45, edge: 1.2 });
    // inner walls: from the far crest all the way down below the near lip, across the full width
    const wallP = new Path2D();
    wallP.moveTo(-20, 300);
    for (const p of far) wallP.lineTo(p[0], p[1] + 3);
    wallP.lineTo(W + 20, 300);
    wallP.lineTo(W + 20, 410);
    wallP.lineTo(-20, 410);
    wallP.closePath();
    const wall = g.createLinearGradient(0, 255, 0, 400);
    wall.addColorStop(0, "#1a1420"); wall.addColorStop(0.45, "#2e1618"); wall.addColorStop(0.8, "#7a2c14"); wall.addColorStop(1, "#c4521e");
    g.fillStyle = wall;
    g.fill(wallP);
    g.save();
    g.clip(wallP);
    // the lake lights the walls: brightest just above it, falling off up the slope and to the sides
    const lw = g.createRadialGradient(480, 352, 30, 480, 352, 420);
    lw.addColorStop(0, "rgba(255,140,60,0.55)"); lw.addColorStop(0.5, "rgba(255,90,40,0.16)"); lw.addColorStop(1, "rgba(255,90,40,0)");
    g.globalCompositeOperation = "lighter";
    g.fillStyle = lw; g.fillRect(-20, 250, W + 40, 170);
    g.globalCompositeOperation = "source-over";
    // rock ribs running down the inner wall to the lake, each lit on its lower edge
    g.lineCap = "round";
    for (let i = 0; i < 60; i++) {
      const x0 = -10 + K.hash(i, 40) * 980;
      const bend = (x0 - 480) * 0.14;
      g.strokeStyle = K.rgba("#0c080c", 0.14 + K.hash(i, 43) * 0.22); g.lineWidth = 1 + K.hash(i, 42) * 5;
      g.beginPath(); g.moveTo(x0, 250); g.quadraticCurveTo(x0 + bend * 0.3, 310, x0 - bend * 0.5, 404); g.stroke();
      g.strokeStyle = "rgba(255,130,60,0.16)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x0 + 2, 300); g.quadraticCurveTo(x0 + 2 + bend * 0.3, 340, x0 + 2 - bend * 0.5, 404); g.stroke();
    }
    // talus at the foot of the walls where they meet the lake shore
    const R = K.rng("talus");
    for (let i = 0; i < 70; i++) {
      const x = R() * W, y = 352 + R() * 40;
      const d = Math.abs(x - 480) / 300;
      if (d < 0.8 && y < 372) continue;
      g.fillStyle = K.rgba("#1a0c0a", 0.5 + R() * 0.3);
      g.beginPath(); g.ellipse(x, y, 4 + R() * 10, 2 + R() * 4, 0, 0, K.TAU); g.fill();
      g.fillStyle = "rgba(255,120,50,0.25)";
      g.beginPath(); g.ellipse(x, y + 1.5, 3 + R() * 6, 1, 0, 0, K.TAU); g.fill();
    }
    g.restore();
  });
}
function craterFront(W, H) {
  return K.sprite("f10craterfront", W, H + 140, (g) => {
    g.translate(0, 100);
    const near = ridgePts(-20, W + 20, 372, 16, 8, 0.01);
    ridge(g, near, H + 40, { color: "#120d14", under: LAVA, underAmt: 0.15, moonA: 0.55 });
    const lip = g.createLinearGradient(0, 360, 0, 400);
    lip.addColorStop(0, K.rgba(LAVA, 0.28)); lip.addColorStop(1, K.rgba(LAVA, 0));
    g.fillStyle = lip; g.fillRect(0, 360, W, 40);
  });
}
// dy shifts the whole vista (crane)
function vista(g, t, W, H, o = {}) {
  const dy = o.dy || 0;
  const mo = { moonX: o.moonX || 790, moonY: o.moonY || 92, moonR: o.moonR || 26 };
  g.drawImage(craterBack(W, H, mo), 0, dy - 100, W, H + 140);
  lavaLake(g, t, 480, 344 + dy, 250, 26);
  // smoke plumes off the lake: dark columns whose undersides glow orange
  smoke(g, t, 400, 336 + dy, { seed: 1, n: 16, h: 340, w: 46, drift: 220, warm: 0.55, alpha: 0.6 });
  smoke(g, t, 560, 340 + dy, { seed: 2, n: 14, h: 300, w: 40, drift: 180, alpha: 0.5, warm: 0.5 });
  smoke(g, t, 300, 346 + dy, { seed: 3, n: 10, h: 260, w: 34, drift: 140, alpha: 0.4, warm: 0.45, speed: 0.04 });
  g.drawImage(craterFront(W, H), 0, dy - 100, W, H + 140);
}

// ---- SHOT 1 [0-10] crane up out of the hatch --------------------------------------------------------
function hatchSprite() {
  // an open steel hatch ring with real thickness: top face, inner wall, outer wall, bolts. Static.
  return K.sprite("f10hatch", 720, 260, (g) => {
    const hx = 360, hy = 120, RX = 300, RY = 80, rx = 268, ry = 64;
    // outer wall (the ring's thickness on the near side)
    g.fillStyle = "#0e1014";
    g.beginPath(); g.ellipse(hx, hy + 18, RX, RY, 0, 0, Math.PI); g.lineTo(hx - RX, hy); g.ellipse(hx, hy, RX, RY, 0, Math.PI, 0, true); g.closePath(); g.fill();
    const ow = g.createLinearGradient(0, hy, 0, hy + RY + 18);
    ow.addColorStop(0, "rgba(90,100,112,0.0)"); ow.addColorStop(0.7, "rgba(30,34,40,0.6)"); ow.addColorStop(1, "rgba(0,0,0,0.6)");
    g.fillStyle = ow; g.fill();
    // top face of the ring (brushed steel), moonlit on the far-right, lava-warm on the far side
    const top = new Path2D();
    top.ellipse(hx, hy, RX, RY, 0, 0, K.TAU);
    top.ellipse(hx, hy, rx, ry, 0, 0, K.TAU);
    const tg = g.createLinearGradient(0, hy - RY, 0, hy + RY);
    tg.addColorStop(0, "#4a4f58"); tg.addColorStop(0.45, "#2a2e36"); tg.addColorStop(1, "#3a3f48");
    g.fillStyle = tg; g.fill(top, "evenodd");
    g.save(); g.clip(top, "evenodd");
    // brushed grain
    g.strokeStyle = "rgba(255,255,255,0.04)"; g.lineWidth = 1;
    for (let k = 0; k < 14; k++) { g.beginPath(); g.ellipse(hx, hy, rx + k * 2.3, ry + k * 1.15, 0, 0, K.TAU); g.stroke(); }
    // orange spill on the far side (the crater glow beyond)
    const os = g.createRadialGradient(hx, hy - RY, 10, hx, hy - RY, RX * 0.9);
    os.addColorStop(0, "rgba(255,110,50,0.45)"); os.addColorStop(1, "rgba(255,110,50,0)");
    g.globalCompositeOperation = "lighter"; g.fillStyle = os; g.fillRect(0, 0, 720, 260);
    g.globalCompositeOperation = "source-over";
    g.restore();
    // specular moon highlight along the far-right top edge
    g.strokeStyle = K.rgba(MOON, 0.75); g.lineWidth = 2.2; g.lineCap = "round";
    g.beginPath(); g.ellipse(hx, hy, RX - 3, RY - 1.5, 0, Math.PI * 1.55, Math.PI * 1.98); g.stroke();
    g.strokeStyle = "rgba(230,236,255,0.9)"; g.lineWidth = 1.2;
    g.beginPath(); g.ellipse(hx, hy, RX - 3, RY - 1.5, 0, Math.PI * 1.7, Math.PI * 1.86); g.stroke();
    // the shaft: inner wall visible on the far side (lit warm from the shaft below), darkness below
    const shaft = new Path2D(); shaft.ellipse(hx, hy, rx, ry, 0, 0, K.TAU);
    g.save(); g.clip(shaft);
    g.fillStyle = "#050407"; g.fillRect(0, 0, 720, 260);
    const iw = new Path2D();
    iw.ellipse(hx, hy, rx, ry, 0, Math.PI, 0);
    iw.ellipse(hx, hy + 34, rx, ry, 0, 0, Math.PI, true);
    const ig = g.createLinearGradient(0, hy - ry, 0, hy + 34);
    ig.addColorStop(0, "#2a2a30"); ig.addColorStop(0.5, "#3a2a24"); ig.addColorStop(1, "#7a3a1c");
    g.fillStyle = ig; g.fill(iw);
    g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1;
    for (let k = 1; k < 4; k++) { g.beginPath(); g.ellipse(hx, hy + k * 9, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); }
    const sl = g.createRadialGradient(hx, hy + 50, 10, hx, hy + 40, rx);
    sl.addColorStop(0, "rgba(255,110,50,0.55)"); sl.addColorStop(1, "rgba(255,110,50,0)");
    g.globalCompositeOperation = "lighter"; g.fillStyle = sl; g.fillRect(0, 0, 720, 260);
    g.restore();
    // bolts round the top face, each with a moon glint
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * K.TAU;
      const bx = hx + Math.cos(a) * (RX + rx) / 2, by = hy + Math.sin(a) * (RY + ry) / 2;
      g.fillStyle = "#14161b"; g.beginPath(); g.arc(bx, by + 0.8, 3.6, 0, K.TAU); g.fill();
      g.fillStyle = Math.sin(a) < 0 ? "#8a95a0" : "#4a525c"; g.beginPath(); g.arc(bx, by, 3, 0, K.TAU); g.fill();
      g.fillStyle = "rgba(220,230,255,0.6)"; g.beginPath(); g.arc(bx + 0.9, by - 0.9, 0.9, 0, K.TAU); g.fill();
    }
  });
}
function shotCrane(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 0, 10.2));
  vista(g, t, W, H, { dy: K.lerp(70, 0, p) });
  embers(g, W, H, t, { count: 40, area: [0, 120, W, 420] });
  // the near rocks and the hatch lip slide down out of frame as the camera rises
  const fy = K.lerp(-40, 440, p);
  g.save();
  g.translate(0, fy);
  g.drawImage(K.sprite("f10craneRocks", W + 40, 900, (s) => {
    s.translate(20, 0);
    const rocks = ridgePts(-20, W + 20, 300, 60, 12, 0.008);
    ridge(s, rocks, 900, { color: "#0c090e", under: LAVA, underAmt: 0.08, moonA: 0.85, edge: 2.2 });
  }), -20, 0, W + 40, 900);
  g.drawImage(hatchSprite(), 480 - 360, 470 - 120, 720, 260);
  g.restore();
  // warm shaft light spilling up at the start
  K.glow(g, 480, fy + 470, 300, "#ff5a2a", 0.4 * (1 - p));
}

// ---- SHOT 2 [10-20] someone is having a better night -------------------------------------------
function hotSpringBg(g, t, W, H) {
  sky(g, W, H, 330, 0.9);
  K.stars(g, W, H, 11, 1, t, { yMax: 280 });
  const far = ridgePts(-20, W + 20, 300, 30, 5, 0.007);
  ridge(g, far, H, { color: "#2a1c28", under: LAVA, underAmt: 0.6, moonA: 0.4 });
  K.glow(g, 300, 330, 380, LAVA, 0.35);
  smoke(g, t, 260, 340, { seed: 5, n: 12, h: 300, w: 50, drift: 160 });
}
function towel(g, x, y, s) {
  // a small towel FOLDED into a rectangle and laid over the head: a flat top panel in perspective,
  // a fold edge showing the layers, and one end hanging down the side of the head. Terry texture.
  g.save();
  g.translate(x, y);
  g.rotate(-0.1);
  const w = s, d = s * 0.34, th = s * 0.07;
  // the hanging end (behind the head's far side): drawn first
  const hang = new Path2D();
  hang.moveTo(w * 0.36, -d * 0.1);
  hang.bezierCurveTo(w * 0.5, d * 0.3, w * 0.52, d * 0.9, w * 0.46, d * 1.5);
  hang.quadraticCurveTo(w * 0.36, d * 1.62, w * 0.24, d * 1.48);
  hang.bezierCurveTo(w * 0.26, d * 0.9, w * 0.24, d * 0.4, w * 0.18, d * 0.1);
  hang.closePath();
  const hg = g.createLinearGradient(w * 0.2, 0, w * 0.5, 0);
  hg.addColorStop(0, "#b88c98"); hg.addColorStop(0.5, "#e2bcc8"); hg.addColorStop(1, "#8c6470");
  g.fillStyle = hg; g.fill(hang);
  // top panel: a slightly bowed rectangle following the skull
  const top = new Path2D();
  top.moveTo(-w / 2, 0);
  top.bezierCurveTo(-w * 0.3, -d * 0.62, w * 0.2, -d * 0.78, w / 2, -d * 0.18);
  top.lineTo(w / 2, th);
  top.bezierCurveTo(w * 0.2, -d * 0.6 + th * 1.4, -w * 0.3, -d * 0.44 + th * 1.6, -w / 2, th * 1.2);
  top.closePath();
  const tg = g.createLinearGradient(0, -d * 0.8, 0, th * 1.4);
  tg.addColorStop(0, "#fbecf1"); tg.addColorStop(0.7, "#ecc9d4"); tg.addColorStop(1, "#b88c98");
  g.fillStyle = tg; g.fill(top);
  // the folded front edge: stacked layers (3 thin bands)
  const edge = new Path2D();
  edge.moveTo(-w / 2, th * 1.2);
  edge.bezierCurveTo(-w * 0.3, -d * 0.44 + th * 1.6, w * 0.2, -d * 0.6 + th * 1.4, w / 2, th);
  edge.lineTo(w / 2, th * 2.6);
  edge.bezierCurveTo(w * 0.2, -d * 0.6 + th * 3.2, -w * 0.3, -d * 0.44 + th * 3.4, -w / 2, th * 2.8);
  edge.closePath();
  g.fillStyle = "#c9a0ac"; g.fill(edge);
  g.save(); g.clip(edge);
  g.strokeStyle = "rgba(120,80,92,0.55)"; g.lineWidth = 1;
  for (let k = 1; k < 3; k++) {
    g.beginPath(); g.moveTo(-w / 2, th * (1.2 + k * 0.55));
    g.bezierCurveTo(-w * 0.3, -d * 0.44 + th * (1.6 + k * 0.6), w * 0.2, -d * 0.6 + th * (1.4 + k * 0.6), w / 2, th * (1 + k * 0.55)); g.stroke();
  }
  g.restore();
  // stripes + terry loops, clipped to each cloth surface
  const R = K.rng("towel");
  for (const p of [top, hang, edge]) {
    g.save(); g.clip(p);
    g.fillStyle = "rgba(214,90,120,0.7)";
    g.fillRect(-w * 0.18, -d, w * 0.08, d * 3);
    g.fillRect(-w * 0.05, -d, w * 0.025, d * 3);
    g.fillStyle = "rgba(110,70,82,0.22)";
    for (let i = 0; i < 160; i++) g.fillRect((R() - 0.5) * w * 1.05, (R() - 0.7) * d * 2.6, 1.1, 1.1);
    g.fillStyle = "rgba(255,255,255,0.18)";
    for (let i = 0; i < 90; i++) g.fillRect((R() - 0.5) * w * 1.05, (R() - 0.7) * d * 2.6, 0.9, 0.9);
    // lava warmth on the undersides, moonlight on the top
    const ug = g.createLinearGradient(0, d * 1.6, 0, -d * 0.6);
    ug.addColorStop(0, "rgba(255,106,42,0.4)"); ug.addColorStop(1, "rgba(255,106,42,0)");
    g.fillStyle = ug; g.fillRect(-w, -d, w * 2, d * 3);
    g.restore();
  }
  K.crescent(g, top, -2.5, 2.5, MOON, 0.5, [-w / 2, -d, w / 2, d], "lighter", 2);
  // soft contact shadow of the fold where it meets the hanging end
  g.strokeStyle = "rgba(90,50,62,0.4)"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(w * 0.36, -d * 0.1); g.quadraticCurveTo(w * 0.42, d * 0.05, w * 0.47, -d * 0.12); g.stroke();
  g.restore();
}
// a rounded volcanic boulder: dark, moonlit on top, warm from the lava below, wet sheen optional
function boulder(g, x, y, w, h, seed, wet = 0) {
  const R = K.rng("boulder" + seed);
  const pts = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    pts.push(x + Math.cos(a) * w * 0.5 * (0.85 + R() * 0.2), y + Math.sin(a) * h * (0.8 + R() * 0.25));
  }
  pts.push(x + w * 0.45, y + h * 0.15, x - w * 0.45, y + h * 0.15);
  const p = new Path2D();
  K.spline(p, pts, true, 0.8);
  const gr = g.createLinearGradient(0, y - h, 0, y + h * 0.15);
  gr.addColorStop(0, "#3a3240"); gr.addColorStop(0.5, "#1e1820"); gr.addColorStop(1, "#2a1412");
  g.fillStyle = gr; g.fill(p);
  const box = [x - w, y - h * 1.2, x + w, y + h * 0.3];
  K.crescent(g, p, -MOON_DIR[0] * 3, -MOON_DIR[1] * 3, MOON, 0.45 + wet * 0.3, box, "lighter");
  K.crescent(g, p, 0, -3, LAVA, 0.25, box, "lighter");
  if (wet) {
    g.save(); g.clip(p);
    g.fillStyle = K.rgba("#dfe6ff", 0.12 * wet);
    g.beginPath(); g.ellipse(x + w * 0.12, y - h * 0.65, w * 0.18, h * 0.08, -0.2, 0, K.TAU); g.fill();
    g.restore();
  }
}
function duck(g, x, y, s, t) {
  const bob = Math.sin(t * 1.7) * s * 0.06;
  g.save();
  g.translate(x, y + bob);
  g.rotate(Math.sin(t * 1.3) * 0.08);
  const body = new Path2D();
  K.ellipsePath(body, 0, 0, s * 0.6, s * 0.32);
  K.ellipsePath(body, -s * 0.35, -s * 0.42, s * 0.24, s * 0.22);
  const gr = g.createLinearGradient(0, -s * 0.6, 0, s * 0.3);
  gr.addColorStop(0, "#ffe36a"); gr.addColorStop(1, "#c88a14");
  g.fillStyle = gr; g.fill(body);
  g.fillStyle = "#ff8a1a";
  g.beginPath(); g.ellipse(-s * 0.6, -s * 0.38, s * 0.14, s * 0.06, -0.1, 0, K.TAU); g.fill();
  g.fillStyle = "#1a1208"; g.beginPath(); g.arc(-s * 0.42, -s * 0.48, s * 0.035, 0, K.TAU); g.fill();
  K.crescent(g, body, -2, 2, MOON, 0.5, [-s, -s, s, s], "lighter");
  g.restore();
  g.fillStyle = "rgba(255,180,120,0.25)";
  g.beginPath(); g.ellipse(x, y + s * 0.28, s * 0.75, s * 0.1, 0, 0, K.TAU); g.fill();
}
function springCat(W, H) {
  // the bathing cat + its towel, painted once (it sits perfectly still, eyes closed)
  return K.sprite("f10springcat", 440, 320, (g) => {
    g.translate(-250, -240);
    const ccx = 470, ccy = 520, s = 150;
    const light = { x: 900, y: -100, color: MOON, strength: 1.1 };
    K.drawCat(g, ccx, ccy, s, { pose: "sit", facing: -1, headTurn: 0.55, headTilt: 0.13, blink: 1, t: 12, coat: K.COATS.cream, collar: false, light, shadow: false, tail: 0 });
    towel(g, ccx - 0.31 * s, ccy - 1.63 * s, s * 0.66);
  });
}
function shotSpring(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 10, 20.4));
  K.withCamera(g, W, H, { x: 480 + p * 24, y: 270, zoom: 1.04 + p * 0.05, shakeT: t, shakeAmt: 1 }, () => {
    K.focus(g, W, H, 5, (f) => hotSpringBg(f, t, W, H), "f10springbg");
    // the pool: rocky rim, warm water
    const cx = 500, cy = 452, rx = 330, ry = 64;
    for (let i = 0; i < 12; i++) {
      const a = Math.PI + (i / 11) * Math.PI;
      const sx = cx + Math.cos(a) * (rx + 18), sy = cy + Math.sin(a) * (ry + 8) + 10;
      boulder(g, sx, sy, 80 + K.hash(i, 6) * 60, 26 + K.hash(i, 7) * 24, 60 + i, 1);
    }
    g.fillStyle = "#120d12";
    g.beginPath(); g.ellipse(cx, cy + 3, rx + 6, ry + 5, 0, 0, K.TAU); g.fill();
    const wg = g.createRadialGradient(cx - 80, cy - 20, 10, cx, cy, rx);
    wg.addColorStop(0, "#c86a3a"); wg.addColorStop(0.5, "#5a3a40"); wg.addColorStop(1, "#1e1a26");
    g.fillStyle = wg;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, K.TAU); g.fill();
    g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, K.TAU); g.clip();
    // reflections: the lava glow (left, a broken orange band) and the moon (right, a glitter path)
    for (let i = 0; i < 26; i++) {
      const gx = 190 + K.hash(i, 13) * 230, gy = cy - ry * 0.8 + K.hash(i, 14) * ry * 0.9;
      const wv = Math.sin(t * 2.2 + i * 1.9);
      g.fillStyle = K.rgba(i % 3 ? "#ff8a3a" : "#ffd08a", 0.22 + 0.2 * wv);
      g.fillRect(gx + wv * 3, gy, 14 + K.hash(i, 15) * 26, 1.6);
    }
    for (let i = 0; i < 34; i++) {
      const gx = 640 + (K.hash(i, 3) - 0.5) * (60 + K.hash(i, 4) * 120), gy = cy - ry + K.hash(i, 4) * ry * 2;
      const tw = Math.max(0, Math.sin(t * 3 + i * 1.7));
      g.fillStyle = K.rgba("#dfe6ff", 0.55 * tw);
      g.fillRect(gx, gy, 5 + K.hash(i, 5) * 10, 1.2);
    }
    g.restore();
    // the cat, chest-deep: above the waterline as is; below it, refracted (shifted + squashed)
    const ccx = 470, ccy = 520, s = 150;
    const wl = ccy - 0.62 * s;
    const cat = springCat(W, H);
    g.save(); g.beginPath(); g.rect(0, 0, W, wl); g.clip();
    g.drawImage(cat, 250, 240, 440, 320);
    g.restore();
    g.save(); g.beginPath(); g.rect(0, wl, W, H); g.clip();
    g.translate(7 + Math.sin(t * 1.6) * 1.5, wl); g.scale(1, 0.86); g.translate(0, -wl);
    g.globalAlpha = 0.85;
    g.drawImage(cat, 250, 240, 440, 320);
    g.restore();
    // water in front of the body (semi-opaque)
    g.save();
    g.beginPath(); g.rect(0, wl, W, H - wl + 80); g.clip();
    const fw = g.createLinearGradient(0, wl, 0, wl + 120);
    fw.addColorStop(0, "rgba(110,60,60,0.62)"); fw.addColorStop(1, "rgba(30,24,36,0.95)");
    g.fillStyle = fw;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, K.TAU); g.fill();
    g.restore();
    // the waterline: a bright meniscus where the fur meets the water, and ripples
    g.strokeStyle = "rgba(255,220,190,0.6)"; g.lineWidth = 1.6;
    g.beginPath(); g.ellipse(ccx - 30, wl + 1, 74, 7, 0, 0, Math.PI); g.stroke();
    g.strokeStyle = "rgba(255,210,170,0.45)"; g.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const ph = ((t * 0.5 + i / 3) % 1);
      g.globalAlpha = (1 - ph) * 0.8;
      g.beginPath(); g.ellipse(ccx - 30, wl + 2, 70 + ph * 120, 8 + ph * 16, 0, 0, K.TAU); g.stroke();
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 8; i++) {
      const ph = ((t * 0.8 + K.hash(i, 8)) % 1);
      const bx = cx + (K.hash(i, 9) - 0.5) * rx * 1.5, by = cy + (K.hash(i, 10) - 0.5) * ry * 1.2;
      if (by < wl) continue;
      g.strokeStyle = K.rgba("#ffe0c0", 0.6 * (1 - ph));
      g.beginPath(); g.arc(bx, by, 1.5 + ph * 5, 0, K.TAU); g.stroke();
    }
    duck(g, 690, 446, 34, t);
    for (let i = 0; i < 9; i++) {
      const sx = 150 + i * 88 + K.hash(i, 2) * 20, sw = 90 + K.hash(i, 3) * 40, sh = 40 + K.hash(i, 4) * 26;
      boulder(g, sx, H + 6, sw * 1.2, sh + 24, 30 + i, 0.6);
    }
    // steam: dense, low, curling off the whole surface
    smoke(g, t, 420, 410, { seed: 9, n: 16, h: 300, w: 64, drift: 60, color: "#d8d0d8", alpha: 0.3, warm: 0.18, speed: 0.08, cool: false });
    smoke(g, t, 640, 430, { seed: 10, n: 14, h: 260, w: 54, drift: 40, color: "#d8d0d8", alpha: 0.26, warm: 0.14, speed: 0.07, cool: false });
    smoke(g, t, 260, 440, { seed: 15, n: 12, h: 220, w: 50, drift: 70, color: "#d8d0d8", alpha: 0.24, warm: 0.2, speed: 0.09, cool: false });
    smoke(g, t, 520, 470, { seed: 16, n: 10, h: 160, w: 70, drift: 30, color: "#e2dae2", alpha: 0.2, warm: 0.1, speed: 0.1, cool: false });
  });
}

// ---- SHOT 3 [20-30] long lens across the fire: him ------------------------------------------------
// The far rim against a huge moon. Biscuit sits on it with small cats around him.
const RIMS = new Map();
function rimProfile(key, W, rimY, amp, freq) {
  let r = RIMS.get(key);
  if (!r) {
    const pts = ridgePts(-20, W + 20, rimY, amp, 21, freq, 6);
    r = { pts, at: (x) => { const i = K.clamp(Math.round((x + 20) / 6), 0, pts.length - 1); return pts[i][1]; } };
    RIMS.set(key, r);
  }
  return r;
}
function farRimScene(g, t, W, H, o) {
  const prof = rimProfile("far" + o.rimY + ":" + (o.amp || 18), W, o.rimY, o.amp || 18, o.freq || 0.004);
  const spr = backdrop("far:" + o.moonX + ":" + o.moonY + ":" + o.moonR + ":" + o.rimY, W, H, (s) => {
    sky(s, W, H, 420, 1.2);
    K.stars(s, W, H, 12, 0.8, 0, { yMax: 300 });
    bigMoon(s, o.moonX, o.moonY, o.moonR, 1);
    ridge(s, prof.pts, H + 80, { color: "#1a1018", under: LAVA, underAmt: 0.7, moonA: 0.9, edge: 2 });
  });
  stampBackdrop(g, spr, W, H);
  return prof.at;
}
const SMALL = [[-62, "grey", 0.5], [-34, "black", 0.62], [44, "cream", 0.58], [76, "calico", 0.46]];
// hot air over the lava: re-draw the band BELOW the rim from the (separate) source layer in thin
// strips with a sub-pixel sway, at half alpha so strip edges blend. Never touches the sky or moon.
function heatShimmer(g, W, H, src, t, y0, amt) {
  const ps = K.pixelScale();
  const strips = 14, sh = (H - y0) / strips;
  g.save();
  g.globalAlpha = 0.5;
  for (let i = 0; i < strips; i++) {
    const y = y0 + i * sh;
    const off = (Math.sin(t * 7 + i * 1.3) * 0.7 + Math.sin(t * 13 + i * 2.7) * 0.3) * amt * (0.3 + 0.7 * i / strips);
    g.drawImage(src, 0, y * ps, W * ps, sh * ps, off, y, W, sh);
  }
  g.restore();
}
function shotLongLens(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 20, 30.4));
  const rack = K.smooth(K.seg(t, 21.6, 22.6)); // hit 22: snap into focus
  const L = K.layer(W, H, "f10long");
  const c = L.g;
  K.withCamera(c, W, H, { x: 480 + p * 14, y: 270 - p * 6, zoom: 1.0 + p * 0.05, shakeT: t, shakeAmt: 0.9 }, () => {
    const rimAt = farRimScene(c, t, W, H, { moonX: 560, moonY: 250, moonR: 150, rimY: 360 });
    const bx = 540, by = rimAt(540) + 3;
    // near-black cut-outs against the moon, a thin line of lava light underneath; his bent ear
    // (head in near profile) is how you know him
    SMALL.forEach(([dx, coat, sc], i) => {
      stampSil(c, catSil("ll" + i, 64 * sc, { pose: i % 2 ? "loaf" : "sit", facing: dx < 0 ? 1 : -1, coat: K.COATS[coat], collar: false, headTurn: 0.2 }, { rimW: 1.2 }), bx + dx, rimAt(bx + dx) + 3);
    });
    stampSil(c, catSil("llB", 66, { pose: "sit", facing: 1, headTurn: 0.08, tail: 0.2 }, { rimW: 1.5 }), bx, by);
    // smoke from the lava drifting across the rim and the moon
    smoke(c, t, 300, 520, { seed: 14, n: 12, h: 420, w: 70, drift: 380, alpha: 0.32, warm: 0.45, speed: 0.035 });
  });
  K.dof(g, L.canvas, K.lerp(5, 0, rack));
  if (rack > 0.95) heatShimmer(g, W, H, L.canvas, t, 372, 1.2);
  K.glow(g, 480, 560, 520, LAVA, 0.5);
  embers(g, W, H, t, { count: 34, size: 2.2, area: [0, 160, W, 400] });
}

// ---- SHOT 4 [30-42] close on you from behind, cupping your hands to shout ---------------------------
function kidShout(g, x, y, s, t, shout) {
  // The kid from behind, waist up, hands cupped in front of the mouth: from the back you see the
  // shoulders, the upper arms raised forward (elbows out to the sides and a little up) and the head
  // tilted back to shout. The hands are in front of the face, hidden. Yellow raincoat (#e8b923),
  // backlit: lava from below/in front (warm rim), moon up right (cool rim). Soft rims, no outline.
  const lift = shout * s * 0.035;
  const tilt = shout; // head back while shouting
  const COAT = "#e8b923";
  const body = new Path2D();
  body.moveTo(x - s * 0.6, y + 60);
  body.bezierCurveTo(x - s * 0.64, y - s * 0.3, x - s * 0.6, y - s * 0.66 - lift, x - s * 0.36, y - s * 0.78 - lift);
  body.quadraticCurveTo(x, y - s * 0.9 - lift, x + s * 0.36, y - s * 0.78 - lift);
  body.bezierCurveTo(x + s * 0.6, y - s * 0.66 - lift, x + s * 0.64, y - s * 0.3, x + s * 0.6, y + 60);
  body.closePath();
  const arm = (sd) => {
    // upper arm raised forward (foreshortened: short and round), elbow a little out and up; the
    // forearm turns in toward the mouth and vanishes behind the head (drawn later)
    const p = new Path2D();
    const sx = x + sd * s * 0.4, sy = y - s * 0.66 - lift;
    const ex = x + sd * s * (0.53 + shout * 0.02), ey = y - s * (0.74 + shout * 0.04) - lift;
    const hx = x + sd * s * 0.12, hy = y - s * (0.88 + shout * 0.02) - lift;
    K.tube(p, [sx, sy, ex, ey], [s * 0.2, s * 0.17], 3, true, true);
    // forearm foreshortened (it points away from us, toward the mouth): thick, short, mostly behind
    // the shoulder and head
    K.tube(p, [ex, ey, (ex + hx) / 2 + sd * s * 0.03, (ey + hy) / 2 + s * 0.01, hx, hy], [s * 0.16, s * 0.16, s * 0.13], 4, true, true);
    return p;
  };
  // hood DOWN, lying on the upper back between the shoulder blades
  const hood = new Path2D();
  // (wound the same way as the body so the union does not punch a hole)
  hood.moveTo(x - s * 0.22, y - s * 0.76 - lift);
  hood.quadraticCurveTo(x, y - s * 0.68 - lift, x + s * 0.22, y - s * 0.76 - lift);
  hood.bezierCurveTo(x + s * 0.3, y - s * 0.6 - lift, x + s * 0.16, y - s * 0.46, x + s * 0.02, y - s * 0.44);
  hood.bezierCurveTo(x - s * 0.14, y - s * 0.46, x - s * 0.3, y - s * 0.6 - lift, x - s * 0.22, y - s * 0.76 - lift);
  hood.closePath();
  const all = new Path2D();
  all.addPath(body); all.addPath(arm(-1)); all.addPath(arm(1)); all.addPath(hood);
  const box = [x - s * 1.1, y - s * 1.6, x + s * 1.1, y + 80];
  // backlit yellow: dark ochre in the middle of the back, the coat colour surviving at the edges
  const bg = g.createLinearGradient(0, y - s * 1.0, 0, y + 60);
  bg.addColorStop(0, K.mix(COAT, "#2a1a04", 0.48)); bg.addColorStop(0.5, K.mix(COAT, "#1a0e02", 0.6)); bg.addColorStop(1, K.mix(COAT, "#0a0602", 0.78));
  g.fillStyle = bg;
  g.fill(all);
  g.save(); g.clip(all);
  // cross-light: warmer on the side toward the lava (left), cooler toward the moon (right)
  const sideG = g.createLinearGradient(x - s * 0.7, 0, x + s * 0.7, 0);
  sideG.addColorStop(0, K.rgba(COAT, 0.32)); sideG.addColorStop(0.45, K.rgba(COAT, 0.0)); sideG.addColorStop(1, K.rgba("#8a96c8", 0.12));
  g.fillStyle = sideG; g.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
  // folds: soft shadows pulled from the raised arms down across the back, each with a lit lip
  g.lineCap = "round";
  const folds = [[-0.5, -0.6, -0.18, -0.28], [0.5, -0.62, 0.16, -0.3], [-0.44, -0.34, -0.1, -0.06], [0.46, -0.36, 0.12, -0.08], [-0.2, -0.7, 0.02, -0.5], [0.24, -0.7, 0.04, -0.52]];
  for (const [ax, ay, bx2, by2] of folds) {
    g.strokeStyle = "rgba(10,6,0,0.32)"; g.lineWidth = s * 0.03;
    g.beginPath(); g.moveTo(x + ax * s, y + ay * s - lift); g.quadraticCurveTo(x + (ax + bx2) * 0.5 * s, y + (ay + by2) * 0.5 * s + s * 0.06, x + bx2 * s, y + by2 * s); g.stroke();
    g.strokeStyle = K.rgba(COAT, 0.18); g.lineWidth = s * 0.012;
    g.beginPath(); g.moveTo(x + ax * s, y + ay * s - lift - s * 0.02); g.quadraticCurveTo(x + (ax + bx2) * 0.5 * s, y + (ay + by2) * 0.5 * s + s * 0.04, x + bx2 * s, y + by2 * s - s * 0.02); g.stroke();
  }
  // centre seam + the hood's lining shadow
  g.strokeStyle = "rgba(12,9,2,0.35)"; g.lineWidth = s * 0.008;
  g.beginPath(); g.moveTo(x, y - s * 0.6); g.lineTo(x, y + 60); g.stroke();
  const hl = g.createLinearGradient(0, y - s * 0.78, 0, y - s * 0.44);
  hl.addColorStop(0, "rgba(10,8,2,0.55)"); hl.addColorStop(0.35, "rgba(10,8,2,0.12)"); hl.addColorStop(1, "rgba(10,8,2,0.0)");
  g.fillStyle = hl; g.fill(hood);
  g.strokeStyle = "rgba(10,6,0,0.22)"; g.lineWidth = s * 0.012;
  g.beginPath(); g.moveTo(x - s * 0.24, y - s * 0.66); g.bezierCurveTo(x - s * 0.2, y - s * 0.5, x - s * 0.08, y - s * 0.44, x + s * 0.02, y - s * 0.43);
  g.bezierCurveTo(x + s * 0.14, y - s * 0.44, x + s * 0.24, y - s * 0.52, x + s * 0.25, y - s * 0.66); g.stroke();
  g.strokeStyle = K.rgba(COAT, 0.22); g.lineWidth = s * 0.006;
  g.beginPath(); g.moveTo(x - s * 0.2, y - s * 0.6); g.bezierCurveTo(x - s * 0.14, y - s * 0.5, x - s * 0.06, y - s * 0.46, x + s * 0.02, y - s * 0.455); g.stroke();
  // lava bounce from below on the lower back
  const lb = g.createLinearGradient(0, y + 60, 0, y - s * 0.4);
  lb.addColorStop(0, K.rgba(LAVA, 0.35)); lb.addColorStop(1, K.rgba(LAVA, 0));
  g.fillStyle = lb; g.fillRect(box[0], y - s * 0.4, box[2] - box[0], s * 0.4 + 60);
  g.restore();
  // soft rims (several small steps = a falloff, not a line)
  K.crescent(g, all, 0, -s * 0.03, LAVA, 0.5, box, "lighter", 4);
  K.crescent(g, all, -MOON_DIR[0] * s * 0.018, -MOON_DIR[1] * s * 0.018, MOON, 0.32, box, "lighter", 4);
  // neck (tilted back, the nape shows) and the head: messy hair in soft clumps
  const hcx = x + s * 0.01, hcy = y - s * (1.08 + tilt * 0.03) - lift * 1.4, hr = s * 0.23;
  g.fillStyle = "#3a2216";
  g.beginPath(); g.ellipse(hcx, hcy + hr * 0.95, hr * 0.42, hr * 0.32, 0, 0, K.TAU); g.fill();
  const R = K.rng("hair10");
  const head = new Path2D();
  K.ellipsePath(head, hcx, hcy, hr * 0.94, hr * 1.0);
  g.fillStyle = "#1a0f07"; g.fill(head);
  const crx = hcx + hr * 0.12, cry = hcy - hr * 0.62 - tilt * hr * 0.06;
  const locks = [];
  const NL = 17;
  for (let i = 0; i < NL; i++) {
    const th = -Math.PI * 0.12 + (i / (NL - 1)) * Math.PI * 1.24 + (R() - 0.5) * 0.12; // round the lower head
    const reach = hr * (1.02 + R() * 0.16);
    const tx = hcx + Math.cos(th) * reach * 0.98, ty = hcy + Math.sin(th) * reach + hr * 0.08;
    locks.push([th, tx, ty, hr * (0.2 + R() * 0.12), R()]);
  }
  // the back-most locks first (top of the list = the sides), the nape locks last
  locks.sort((a, b) => Math.abs(Math.sin(a[0]) - 1) < Math.abs(Math.sin(b[0]) - 1) ? 1 : -1);
  const lockPaths = new Path2D();
  for (const [th, tx, ty, wd, v] of locks) {
    const nx = -(ty - cry), ny = tx - crx, nl = Math.hypot(nx, ny) || 1;
    const ox = nx / nl * wd, oy = ny / nl * wd;
    const mx = (crx + tx) / 2 + Math.cos(th) * hr * 0.12, my = (cry + ty) / 2 + Math.sin(th) * hr * 0.1;
    const p = new Path2D();
    p.moveTo(crx, cry);
    p.quadraticCurveTo(mx + ox, my + oy, tx + (R() - 0.5) * hr * 0.1, ty);
    p.quadraticCurveTo(mx - ox, my - oy, crx, cry);
    lockPaths.addPath(p);
    const lg = g.createLinearGradient(crx, cry, tx, ty);
    lg.addColorStop(0, "#4a3020"); lg.addColorStop(0.6, v > 0.5 ? "#2e1c10" : "#24150a"); lg.addColorStop(1, "#140a04");
    g.fillStyle = lg; g.fill(p);
    // the parting shadow on one side of each lock, a sheen down the other
    g.strokeStyle = "rgba(6,3,1,0.5)"; g.lineWidth = Math.max(1, s * 0.004);
    g.beginPath(); g.moveTo(crx, cry); g.quadraticCurveTo(mx - ox * 0.9, my - oy * 0.9, tx, ty); g.stroke();
    g.strokeStyle = "rgba(170,120,80,0.22)"; g.lineWidth = Math.max(0.8, s * 0.003);
    g.beginPath(); g.moveTo(crx + ox * 0.2, cry + oy * 0.2); g.quadraticCurveTo(mx + ox * 0.5, my + oy * 0.5, tx * 0.8 + mx * 0.2, ty * 0.8 + my * 0.2); g.stroke();
  }
  head.addPath(lockPaths);
  // a few stray hairs off the silhouette
  g.strokeStyle = "rgba(40,24,12,0.8)"; g.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const th = -Math.PI * 0.2 + R() * Math.PI * 1.4;
    const r0 = hr * 0.95;
    g.beginPath(); g.moveTo(hcx + Math.cos(th) * r0, hcy + Math.sin(th) * r0);
    g.quadraticCurveTo(hcx + Math.cos(th + 0.1) * r0 * 1.12, hcy + Math.sin(th + 0.1) * r0 * 1.12, hcx + Math.cos(th + 0.05) * r0 * (1.15 + R() * 0.1), hcy + Math.sin(th + 0.05) * r0 * (1.15 + R() * 0.1)); g.stroke();
  }
  const hb = [hcx - hr * 1.6, hcy - hr * 1.6, hcx + hr * 1.6, hcy + hr * 1.6];
  K.crescent(g, head, -MOON_DIR[0] * 3, -MOON_DIR[1] * 3, MOON, 0.6, hb, "lighter", 4);
  K.crescent(g, head, 0, -3.5, LAVA, 0.4, hb, "lighter", 4);
  // ears at the sides of the head, warm and translucent from the lava light
  for (const sd of [-1, 1]) {
    g.fillStyle = "#6a3a22";
    g.beginPath(); g.ellipse(hcx + sd * hr * 0.92, hcy + hr * 0.25, hr * 0.11, hr * 0.18, sd * 0.2, 0, K.TAU); g.fill();
    K.glow(g, hcx + sd * hr * 0.95, hcy + hr * 0.3, hr * 0.16, LAVA, 0.45);
  }
  // the bell on its red string, on your left wrist, just below the jaw where the forearm comes in
  const bx = hcx - hr * 0.78, by = hcy + hr * 1.05;
  g.strokeStyle = "#8a2420"; g.lineWidth = s * 0.014;
  g.beginPath(); g.ellipse(bx + hr * 0.12, by - hr * 0.12, hr * 0.12, hr * 0.24, 0.9, -1.2, 2.2); g.stroke();
  K.drawBell(g, bx, by, s * 0.042, { t, glint: 0.7 });
}
function shotShoutBg(t, W, H, tilt, mouthQ) {
  // the background (far rim, moon, his family) only changes with his head tilt and mouth: cached
  const tq = Math.round(tilt * 10) / 10;
  return K.sprite("f10shbg:" + tq + ":" + mouthQ, W, H, (s) => {
    const rimAt = farRimScene(s, 0, W, H, { moonX: 640, moonY: 210, moonR: 96, rimY: 330, amp: 14 });
    const bx = 660, by = rimAt(660) + 2;
    SMALL.forEach(([dx, coat, sc], i) => {
      stampSil(s, catSil("sh" + i, 60 * sc, { pose: i % 2 ? "loaf" : "sit", facing: dx < 0 ? 1 : -1, coat: K.COATS[coat], collar: false, headTurn: 0.4 }), bx + dx * 1.3, rimAt(bx + dx * 1.3) + 2);
    });
    stampSil(s, catSil("shB:" + tq + ":" + mouthQ, 60, {
      pose: "sit", facing: -1, headTurn: K.lerp(0.4, 0.85, tq), headTilt: tq * 0.35, mouth: mouthQ, ears: tq * 0.6, eyesGlow: 0.35, tailUp: 0.3,
    }), bx, by);
  });
}
function shoutKidSprite(W, H, shoutQ, blur) {
  return K.sprite("f10kid:" + shoutQ + ":" + blur, W, H, (s) => {
    if (blur > 0 && K.hasFilter()) s.filter = `blur(${blur}px)`;
    kidShout(s, 260, 600, 330, 40, shoutQ);
    s.filter = "none";
  });
}
function shotShout(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 30, 42.4));
  const rack = K.smooth(K.seg(t, 34.2, 35.8)); // focus pulls from you to him after his meow
  const shout = K.env(t, 30.8, 34.6, 0.5, 0.8) * 0.8 + 0.2;
  const tilt = K.smooth(K.seg(t, 36.4, 37.6)) * (1 - K.smooth(K.seg(t, 40.8, 41.8)) * 0.4);
  const mouth = Math.max(K.env(t, 33.9, 34.7, 0.12, 0.25), K.env(t, 39.9, 40.8, 0.12, 0.25));
  const bgSpr = shotShoutBg(t, W, H, tilt, Math.round(mouth * 2) / 2);
  const bg = K.layer(W, H, "f10shoutbg");
  K.withCamera(bg.g, W, H, { x: 480 + p * 10, y: 270, zoom: 1.02 + p * 0.03 }, () => {
    bg.g.drawImage(bgSpr, 0, 0, W, H);
  });
  K.dof(g, bg.canvas, K.lerp(5.5, 0, rack));
  if (rack > 0.95) heatShimmer(g, W, H, bg.canvas, t, 345, 0.9);
  K.glow(g, 520, 600, 520, LAVA, 0.45);
  // you, in the foreground: sharp first, then soft (pre-blurred once, crossfaded during the rack)
  const sq = Math.round(shout * 10) / 10;
  K.withCamera(g, W, H, { x: 480 - p * 16, y: 270, zoom: 1.0 + p * 0.04, shakeT: t, shakeAmt: 1.3 }, () => {
    if (rack < 1) g.drawImage(shoutKidSprite(W, H, sq, 0), 0, 0, W, H);
    if (rack > 0) {
      g.save(); g.globalAlpha = rack;
      g.drawImage(shoutKidSprite(W, H, 0.2, 6), 0, 0, W, H);
      g.restore();
    }
  });
  embers(g, W, H, t, { count: 26, size: 2.5, area: [0, 100, W, 440], seed: 8 });
}

// ---- SHOT 5 [42-52] reverse, long lens on Biscuit: he stands, looks, and walks away --------------
// He walks AWAY from us over the near ridge (rising up the slope toward the crest, smaller each
// step, then sinking behind it); at the crest (50.5-51.5) he stops and looks back. The Shadow rises
// behind them, a black shape against the moon, and is gone in under a second.
function leaveBack(W, H) {
  return backdrop("leave", W, H, (s) => {
    sky(s, W, H, 460, 1.2);
    K.stars(s, W, H, 13, 0.7, 0, { yMax: 320 });
    bigMoon(s, 620, 250, 190, 1);
  });
}
function leaveRidge(W, H) {
  const prof = rimProfile("leave", W, 420, 10, 0.003);
  return {
    prof,
    spr: backdrop("leaveRidge", W, H, (s) => {
      ridge(s, prof.pts, H + 80, { color: "#1a1018", under: LAVA, underAmt: 0.75, moonA: 0.9, edge: 2.2 });
      const lip = s.createLinearGradient(0, 420, 0, H);
      lip.addColorStop(0, K.rgba(LAVA, 0.05)); lip.addColorStop(1, K.rgba(LAVA, 0.4));
      s.fillStyle = lip; s.fillRect(-40, 400, W + 80, H);
    }),
  };
}
function shadowSprite() {
  // the Shadow: tall, thin, long-legged, pure black, no face, no rim to speak of
  return K.sprite("f10shadowcat", 420, 520, (s) => {
    s.save();
    s.translate(210, 500);
    s.scale(0.86 * 2.5 * 0.62, 1.55 * 2.5 * 0.62);
    K.drawCat(s, 0, 0, 85, { pose: "stand", facing: 1, headTurn: 0.1, t: 49, coat: K.COATS.black, collar: false, shadow: false, tail: 0.6, lod: 0 });
    s.restore();
    s.globalCompositeOperation = "source-atop";
    s.fillStyle = "#020104"; s.fillRect(0, 0, 420, 520);
    s.globalCompositeOperation = "source-over";
  });
}
function biscuitWalkAway(t) {
  // 47.2 turn + walk up the slope; 50.5-51.5 pause at the crest, look back; then over and gone
  const a = K.seg(t, 47.2, 50.5), b = K.seg(t, 51.5, 52.6);
  const u = 0.75 * K.ease.inOut(a) + 0.25 * b;           // 0 at his sitting spot, 0.75 at the crest
  const x = 430 + u * 70;
  const scale = K.lerp(1, 0.42, Math.pow(Math.min(u / 0.75, 1), 0.8));  // smaller each step: walking away
  const climb = Math.min(u / 0.75, 1);
  const sink = K.smooth(b) * 1.0;                         // past the crest he drops out of sight
  const pause = t >= 50.5 && t < 51.5;
  const look = pause ? K.env(t, 50.5, 51.5, 0.25, 0.3) : 0;
  return { x, scale, climb, sink, pause, look, walking: (a > 0 && a < 1) || (b > 0 && b < 1) };
}
function shotLeave(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 42, 52.4));
  const L = K.layer(W, H, "f10leave");
  const c = L.g;
  K.withCamera(c, W, H, { x: 480 + p * 30, y: 280, zoom: 1.0 + p * 0.04, shakeT: t, shakeAmt: 0.8 }, () => {
    stampBackdrop(c, leaveBack(W, H), W, H);
    // the Shadow rises from behind the rim, centred on the moon, half covering its disc
    const sh = K.env(t, 48.2, 50.2, 0.5, 0.8);
    if (sh > 0) {
      const rise = K.ease.out(K.seg(t, 48.2, 49.4));
      c.save();
      c.globalAlpha = 0.96 * sh;
      c.drawImage(shadowSprite(), 620 - 210, 470 + (1 - rise) * 220 - 500, 420, 520);
      c.restore();
      // smoke at its edges
      const sp = K.glowSprite("#0d0f18");
      c.save();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * K.TAU + t * 0.4;
        c.globalAlpha = 0.22 * sh;
        c.drawImage(sp, 620 + Math.cos(a) * 80 - 60, 300 + (1 - rise) * 220 + Math.sin(a) * 140 - (t - 48) * 14 - 60, 120, 120);
      }
      c.restore();
    }
    const { prof, spr: ridgeSpr } = leaveRidge(W, H);
    const rimAt = prof.at;
    // the small cats go first, up the slope and over
    SMALL.forEach(([dx, coat, sc], i) => {
      const fgo = K.seg(t, 47.6 + i * 0.3, 50.6 + i * 0.3);
      const fx = 430 + dx * 2.8 + fgo * 60;
      const k = K.lerp(1, 0.5, fgo);
      const sink = K.smooth(K.seg(fgo, 0.7, 1)) * 70;
      const sz = 120 * sc * k;
      const walking = fgo > 0 && fgo < 1;
      const q = walking ? Math.floor((((t * 1.5 + i * 0.3) % 1) + 1) % 1 * 8) : -1;
      const cs = catSil("lv" + i + (walking ? "w" + q : "s"), 120 * sc, {
        pose: walking ? "walk" : (i % 2 ? "loaf" : "sit"), phase: q / 8, facing: walking ? 1 : (dx < 0 ? 1 : -1),
        coat: K.COATS[coat], collar: false, headTurn: walking ? -0.25 : 0.35,
      }, { rimW: 2 });
      c.save(); c.translate(fx, rimAt(fx) + 4 + sink); c.scale(k, k);
      stampSil(c, cs, 0, 0, fgo >= 1 ? 0 : 1);
      c.restore();
    });
    // Biscuit
    const B = biscuitWalkAway(t);
    const pose = t < 44.6 ? "sit" : B.walking ? "walk" : "stand";
    const lookIdle = t < 47.2 ? 0.75 : 0;
    let key, opts;
    if (pose === "walk") {
      const q = Math.floor((((t - 47.2) * 1.3 % 1) + 1) % 1 * 10);
      key = "b2w" + q;
      opts = { pose: "walk", phase: q / 10, facing: 1, headTurn: -0.3, tailUp: 0.8 };
    } else if (B.pause) {
      // he stops at the crest and looks back at you over his shoulder: eyes catch the lava light
      const lq = Math.round(B.look * 4) / 4;
      key = "b2look" + lq;
      opts = { pose: "stand", facing: 1, headTurn: K.lerp(-0.3, 0.8, lq), headTilt: 0.05, tailUp: 0.6, eyesGlow: lq * 0.9, pupil: 0.8 };
    } else {
      const bq = Math.round(K.env(t, 45.8, 46.3, 0.12, 0.15) * 2) / 2;
      key = "b2" + pose + bq;
      opts = { pose, facing: 1, headTurn: lookIdle, headTilt: 0.12, eyesGlow: 0.5, pupil: 0.8, tailUp: 0.2, blink: bq };
    }
    const bcs = catSil(key, 120, opts, { rimW: 2.4, underA: 0.45 });
    const bx = B.x, gy = rimAt(bx) + 4 + B.sink * 90;
    c.save(); c.translate(bx, gy); c.scale(B.scale, B.scale);
    stampSil(c, bcs, 0, 0, 1 - K.smooth(K.seg(B.sink, 0.7, 1)));
    // his eyes catching the lava as he looks back
    if (B.pause && B.look > 0.3) {
      // two points of lava light in the black: the only time we see his eyes in this shot
      const k = K.clamp((B.look - 0.3) / 0.5);
      for (const ex of [104, 118]) {
        K.glow(c, ex, -146, 14, "#ff9a40", 0.55 * k);
        c.fillStyle = K.rgba("#ffd890", 0.9 * k);
        c.beginPath(); c.ellipse(ex, -146, 2.6, 1.8, 0, 0, K.TAU); c.fill();
      }
    }
    c.restore();
    // the near face of the rim covers them as they go over
    stampBackdrop(c, ridgeSpr, W, H);
  });
  g.drawImage(L.canvas, 0, 0, W, H);
  heatShimmer(g, W, H, L.canvas, t, 452, 1.0);
  // the drop at 48: a breath of darkness
  const drop = K.env(t, 47.9, 49.4, 0.2, 1.2);
  if (drop > 0) K.fadeBlack(g, W, H, drop * 0.25);
  embers(g, W, H, t, { count: 20, size: 2.4, area: [0, 120, W, 420], seed: 11 });
}

// ---- SHOT 6 [52-62] you, small, sitting down hard on the rim -------------------------------------
function sittingKidProfile(g, x, y, s, t) {
  // In profile, facing the crater (right): sitting on the rock, knees drawn up, arms wrapped round
  // the shins, hood up, head bowed onto the knees. Backlit by the lava: a strong warm rim on every
  // edge facing it, a cool moon edge on top. s = standing height.
  const breathe = Math.sin(t * 1.3) * s * 0.004;
  const P = (u, v) => [x + u * s, y + v * s];
  const hip = P(-0.05, -0.1), knee = P(0.2, -0.36), ankle = P(0.28, -0.05), toe = P(0.38, -0.01);
  const sh = P(0.02, -0.5 + breathe / s), elbow = P(0.2, -0.27), hands = P(0.27, -0.3);
  const head = P(0.15, -0.55 + breathe / s);
  const all = new Path2D();
  // legs (jeans): thigh + shin
  const legs = new Path2D();
  K.tube(legs, [hip[0], hip[1], knee[0], knee[1]], [s * 0.13, s * 0.105], 3, true, true);
  K.tube(legs, [knee[0], knee[1], ankle[0], ankle[1]], [s * 0.1, s * 0.08], 3, true, false);
  // rain boot
  const boot = new Path2D();
  boot.moveTo(ankle[0] - s * 0.05, ankle[1] - s * 0.07);
  boot.lineTo(ankle[0] + s * 0.045, ankle[1] - s * 0.07);
  boot.lineTo(ankle[0] + s * 0.05, ankle[1] - s * 0.01);
  boot.quadraticCurveTo(toe[0] + s * 0.02, toe[1] - s * 0.03, toe[0] + s * 0.015, toe[1]);
  boot.lineTo(ankle[0] - s * 0.055, toe[1] + s * 0.004);
  boot.closePath();
  // torso: a curved back (hunched), hoodie
  const torso = new Path2D();
  torso.moveTo(hip[0] - s * 0.09, hip[1] + s * 0.06);
  torso.bezierCurveTo(hip[0] - s * 0.14, hip[1] - s * 0.18, sh[0] - s * 0.14, sh[1] + s * 0.02, sh[0] - s * 0.02, sh[1] - s * 0.04);
  torso.quadraticCurveTo(sh[0] + s * 0.1, sh[1] - s * 0.02, sh[0] + s * 0.14, sh[1] + s * 0.1);
  torso.lineTo(knee[0] - s * 0.04, knee[1] + s * 0.02);
  torso.lineTo(hip[0] + s * 0.1, hip[1] + s * 0.06);
  torso.closePath();
  // arm wrapped round the shins
  const armP = new Path2D();
  K.tube(armP, [sh[0] + s * 0.04, sh[1] + s * 0.03, elbow[0] - s * 0.02, elbow[1] - s * 0.04, hands[0], hands[1]], [s * 0.075, s * 0.07, s * 0.06], 4, true, true);
  // hooded head, bowed
  const hd = new Path2D();
  K.ellipsePath(hd, head[0], head[1], s * 0.085, s * 0.095, 0.5);
  all.addPath(legs); all.addPath(torso); all.addPath(armP); all.addPath(hd); all.addPath(boot);
  const box = [x - s * 0.4, y - s * 0.8, x + s * 0.6, y + s * 0.05];
  // fills: backlit, so the faces toward us are dark; colours survive near the edges
  g.fillStyle = "#121522"; g.fill(legs);
  g.fillStyle = "#3a0e0c"; g.fill(boot);
  const tg = g.createLinearGradient(x - s * 0.2, 0, x + s * 0.3, 0);
  tg.addColorStop(0, "#2a200a"); tg.addColorStop(1, "#4a3810");
  g.fillStyle = tg; g.fill(torso); g.fill(hd);
  g.fillStyle = "#3a2c0c"; g.fill(armP);
  // hoodie folds where the arm squeezes the body; the hood opening (dark) faces the knees
  g.save(); g.clip(torso);
  g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = s * 0.012; g.lineCap = "round";
  for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(sh[0] - s * 0.08 + k * s * 0.03, sh[1] + s * 0.08 + k * s * 0.05); g.quadraticCurveTo(sh[0] + s * 0.04, sh[1] + s * 0.12 + k * s * 0.05, sh[0] + s * 0.1, sh[1] + s * 0.18 + k * s * 0.04); g.stroke(); }
  g.restore();
  g.fillStyle = "rgba(5,3,2,0.8)";
  g.beginPath(); g.ellipse(head[0] + s * 0.05, head[1] + s * 0.03, s * 0.03, s * 0.06, 0.6, 0, K.TAU); g.fill();
  // the strong warm back-rim from the lava (in front-right of you), then the cool moon line on top
  K.crescent(g, all, -s * 0.022, s * 0.006, LAVA, 0.95, box, "lighter", 4);
  K.crescent(g, all, -s * 0.01, s * 0.002, "#ffd08a", 0.5, box, "lighter", 2);
  K.crescent(g, all, -MOON_DIR[0] * s * 0.012, -MOON_DIR[1] * s * 0.012, MOON, 0.4, box, "lighter", 3);
  // the bell on your wrist catches the lava
  K.drawBell(g, hands[0] + s * 0.01, hands[1] + s * 0.03, s * 0.022, { t, glint: 0.8 });
}
function shotAlone(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 52, 62.4));
  // a slow push-in with a lateral drift: you, small against the burning crater
  K.withCamera(g, W, H, { x: 450 + p * 50, y: 285 + p * 8, zoom: 1.02 + p * 0.1, shakeT: t, shakeAmt: 0.7 }, () => {
    vista(g, t, W, H, { dy: 40, moonX: 760, moonY: 110, moonR: 24 });
    // near rocks where you sit (foreground ledge)
    g.drawImage(K.sprite("f10ledge", W + 40, 200, (s) => {
      s.translate(20, -400);
      const ledge = ridgePts(-20, W + 20, 452, 18, 41, 0.006);
      ridge(s, ledge, 620, { color: "#0a080c", under: LAVA, underAmt: 0.06, moonA: 0.9, edge: 2 });
    }), -20, 400, W + 40, 200);
    const kx = 330, ky = 452;
    const sit = K.ease.out(K.seg(t, 52.2, 53.0));
    if (sit < 1) {
      g.save(); g.globalAlpha = 1 - sit;
      K.drawPerson(g, kx, ky, 120, { view: "side", facing: 1, crouch: sit, t, hood: true, light: { x: 480, y: 360, color: LAVA, strength: 1.4 } });
      g.restore();
    }
    if (sit > 0) {
      g.save(); g.globalAlpha = sit;
      sittingKidProfile(g, kx, ky + (1 - sit) * -6, 120, t);
      g.restore();
    }
    // a puff of dust where you landed
    const dst = K.env(t, 52.7, 54.4, 0.15, 1.2);
    if (dst > 0) {
      const sp = K.glowSprite("#8a7a80");
      g.save(); g.globalAlpha = 0.35 * dst;
      for (let i = 0; i < 5; i++) g.drawImage(sp, kx - 40 + i * 18 - (t - 52.7) * (10 - i * 5), ky - 16 - (t - 52.7) * 6, 30, 22);
      g.restore();
    }
  });
  embers(g, W, H, t, { count: 60, size: 1.8, area: [0, 60, W, 470], seed: 12, wind: 22 });
  // foreground embers, close to the lens and out of focus
  bokehEmbers(g, W, H, t, { count: 7, size: 18, seed: 31 });
}

// ---- SHOT 7 [62-72] over the shoulder: the doorway of nothing opens in the sky ----------------------
function shotVoid(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 62, 72));
  const open = K.ease.inOut(K.seg(t, 63.8, 68.6));
  K.withCamera(g, W, H, { x: 480 + p * 20, y: 270 - p * 14, zoom: 1.0 + p * 0.07, shakeT: t, shakeAmt: 1 }, () => {
    sky(g, W, H, 400, 1);
    // the stars: the ones inside the square go out, the ones near its edge lean (warp) toward it
    const vx = 600, vy = 196, half = 86 * open;
    const R = K.rng("f10stars");
    g.fillStyle = "#ffffff";
    for (let i = 0; i < 220; i++) {
      let sx = R() * W, sy = Math.pow(R(), 1.3) * 340;
      const m = R();
      const dx = sx - vx, dy = sy - vy;
      const dd = Math.max(Math.abs(dx), Math.abs(dy));
      if (half > 2 && dd < half + 70) {
        const pull = K.clamp(1 - (dd - half) / 70) * open;
        sx -= dx * pull * 0.3; sy -= dy * pull * 0.3;
      }
      const tw = 0.6 + 0.4 * Math.sin(t * (1.5 + m * 3) + i * 1.7);
      g.globalAlpha = (0.3 + m * 0.7) * tw;
      const z = m > 0.95 ? 1.8 : m > 0.8 ? 1.2 : 0.7;
      g.fillRect(sx - z / 2, sy - z / 2, z, z);
    }
    g.globalAlpha = 1;
    K.moon(g, 830, 90, 22, { glow: 0.7, halo: MOON });
    if (half > 0.5) {
      // the hole: missing stars. No outline: just nothing, its edge breathing very slightly
      g.fillStyle = "#05050a";
      g.beginPath();
      const n = 10;
      for (let k = 0; k < 4 * n; k++) {
        const side = Math.floor(k / n), u = (k % n) / n;
        const wob = K.noise(t * 0.8 + k * 0.7, 3) * 1.6 * open;
        let px, py;
        if (side === 0) { px = vx - half + u * half * 2; py = vy - half + wob; }
        else if (side === 1) { px = vx + half + wob; py = vy - half + u * half * 2; }
        else if (side === 2) { px = vx + half - u * half * 2; py = vy + half + wob; }
        else { px = vx - half + wob; py = vy + half - u * half * 2; }
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      g.fill();
      // faint grid lines deep inside, like the floor of the next place
      g.save(); g.clip();
      g.strokeStyle = K.rgba("#1a1a2a", 0.35);
      g.lineWidth = 1;
      g.beginPath();
      for (let k = -6; k <= 6; k++) { g.moveTo(vx + k * half * 0.05, vy); g.lineTo(vx + k * half * 0.4, vy + half); }
      for (let k = 1; k < 5; k++) { const yy = vy + Math.pow(k / 5, 1.8) * half; g.moveTo(vx - half, yy); g.lineTo(vx + half, yy); }
      g.stroke();
      g.restore();
      // a tiny cold glint at each corner, flickering out of step
      for (let k = 0; k < 4; k++) {
        const gx = vx + (k % 2 ? half : -half), gy = vy + (k < 2 ? -half : half);
        const f = 0.4 + 0.6 * Math.max(0, Math.sin(t * 2.3 + k * 1.9));
        K.glow(g, gx, gy, 6 + f * 4, "#dfe6ff", 0.55 * f * open);
        g.fillStyle = K.rgba("#ffffff", 0.7 * f * open);
        g.fillRect(gx - 3 * f, gy - 0.4, 6 * f, 0.8);
        g.fillRect(gx - 0.4, gy - 3 * f, 0.8, 6 * f);
      }
      // cold motes drifting INTO it
      for (let i = 0; i < 24; i++) {
        const ph = ((t * 0.25 + K.hash(i, 4)) % 1);
        const a = K.hash(i, 5) * K.TAU, d = half * 1.45 + 140 * (1 - ph);
        K.glow(g, vx + Math.cos(a) * d, vy + Math.sin(a) * d, 4, "#c8c8ff", 0.5 * ph * open);
      }
    }
    // the far rim, then you
    const pts = rimProfile("void", W, 360, 16, 0.004).pts;
    ridge(g, pts, H + 60, { color: "#1a1018", under: LAVA, underAmt: 0.6, moonA: 0.8, edge: 1.8 });
    K.glow(g, 480, 520, 520, LAVA, 0.4);
    const stand = K.ease.out(K.seg(t, 62, 63.4));
    silhouette(g, W, H, "f10kid7", (c) => {
      K.drawPerson(c, 230, 1140 - stand * 50, 820, { view: "back", hood: false, t, bell: true, shadow: false });
      // the yellow coat keeps a little colour under the night
      c.globalCompositeOperation = "source-atop";
      const wl = c.createRadialGradient(240, 640 - stand * 50, 20, 240, 700 - stand * 50, 340);
      wl.addColorStop(0, "rgba(232,185,35,0.28)"); wl.addColorStop(1, "rgba(232,185,35,0)");
      c.fillStyle = wl; c.fillRect(-60, 240, 600, 400);
      c.globalCompositeOperation = "source-over";
    }, {
      box: [-60, 240, 520, 560], dark0: 0.82, dark1: 0.9, under: LAVA, underA: 0.4, soft: 3,
      rims: [{ dx: MOON_DIR[0] * 3, dy: MOON_DIR[1] * 3, color: MOON, alpha: 0.75 }, { dx: -1, dy: 3.5, color: LAVA, alpha: 0.6 }],
    });
  });
  embers(g, W, H, t, { count: 26, size: 2, area: [0, 120, W, 420], seed: 13 });
}

// ---- edit -------------------------------------------------------------------------------------------
const SHOTS = [
  [0, 10, shotCrane], [10, 20, shotSpring], [20, 30, shotLongLens], [30, 42, shotShout],
  [42, 52, shotLeave], [52, 62, shotAlone], [62, 72.5, shotVoid],
];
const XF = { 10: 0.7, 20: 0.5, 52: 0.8, 62: 0.7 };
function render(g, t, W, H) {
  let i = SHOTS.findIndex((s) => t < s[1]);
  if (i < 0) i = SHOTS.length - 1;
  const [a, , fn] = SHOTS[i];
  const xin = XF[a];
  if (xin && i > 0 && t < a + xin) {
    SHOTS[i - 1][2](g, t, W, H);
    const L = K.layer(W, H, "f10xf");
    fn(L.g, t, W, H);
    g.save(); g.globalAlpha = K.smooth((t - a) / xin); g.drawImage(L.canvas, 0, 0, W, H); g.restore();
  } else fn(g, t, W, H);
}

export const film = {
  id: 10,
  title: "So Close",
  chapter: "Chapter 10",
  unlockAt: 50,
  duration: D,
  poster: 40,
  tagline: "Halfway. Close enough to hear him.",
  subs: [
    [3.0, 7.0, "The top of the world. Burning."],
    [11.0, 15.5, "Someone was having a much better night than you."],
    [23.0, 27.5, "And then, across the fire. Him."],
    [31.0, 33.5, "You shouted his name."],
    [35.0, 39.5, "He meowed back. He knew you."],
    [43.0, 47.5, "Then he turned around."],
    [48.0, 51.5, "And he walked away."],
    [53.5, 58.5, "Fifty cats. And he walked away."],
    [63.0, 66.5, "But he looked back. He always looks back."],
    [67.0, 71.0, "Into the nothing. After him."],
  ],
  voice: [
    [3.0, "The top of the world. Burning.", { rate: 0.92, pitch: 1.0 }],
    [11.0, "Someone was having a much better night than you.", { rate: 1.0, pitch: 1.1 }],
    [23.0, "And then, across the fire. Him.", { rate: 0.92, pitch: 1.0 }],
    [31.0, "You shouted his name.", { rate: 0.92, pitch: 1.0 }],
    [35.0, "He meowed back. He knew you.", { rate: 0.92, pitch: 1.0 }],
    [43.0, "Then he turned around.", { rate: 0.85, pitch: 0.95 }],
    [48.0, "And he walked away.", { rate: 0.85, pitch: 0.95 }],
    [53.5, "Fifty cats. And he walked away.", { rate: 0.85, pitch: 0.95 }],
    [63.0, "But he looked back. He always looks back.", { rate: 0.92, pitch: 1.0 }],
    [67.0, "Into the nothing. After him.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: { mood: "epic", key: "B", bpm: 76, cues: [[3, "swell"], [22, "hit"], [34, "meow"], [40, "meow"], [48, "drop"], [64, "swell"]] },
  draw(g, t, W, H) {
    g.save();
    if (W !== 960 || H !== 540) g.scale(W / 960, H / 540);
    const w = 960, h = 540;
    render(g, t, w, h);
    K.finish(g, w, h, t, { bloom: 0.45, tint: "#ff8a4a", tintAlpha: 0.1, vignette: 0.62, grain: 0.06, letterbox: 1 });
    K.grade(g, w, h, { shadows: "#3a3a7a", shadowAlpha: 0.12 });
    K.title(g, w, h, "So Close", "Chapter 10", K.env(t, 2, 6, 0.9, 1.0), { glow: "#ffb07a" });
    K.fadeBlack(g, w, h, 1 - K.smooth(K.seg(t, 0, 1.4)));
    K.fadeBlack(g, w, h, K.smooth(K.seg(t, 69.6, 72)));
    g.restore();
  },
};
