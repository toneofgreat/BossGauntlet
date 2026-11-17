// src/games/cats/scripts/filmenv.js - skies, weather, landscape, buildings, props and the story's
// magic motifs (pawprints, the paw portal, the bell). Re-exported by filmkit.js.
// Every painter is a pure function of its arguments; static art is cached with sprite().

import {
  TAU, clamp, lerp, smooth, hash, noise, fbm, rng, mix, rgba, shade, sprite, layer, glow, glowSprite,
  spline, ellipsePath, roundRect, pixelScale,
} from "./filmcore.js";

// ---- sky & light -----------------------------------------------------------------------------------
// sky(g, W, H, {top, mid, bottom, horizon}) - vertical gradient; `horizon` (0..1 of H) is where
// `bottom` is reached (below it the colour holds, for the ground to cover).
export function sky(g, W, H, o = {}) {
  const top = o.top || "#0b1424", mid = o.mid || mix(top, o.bottom || "#2a3a52", 0.5), bottom = o.bottom || "#2a3a52";
  const hz = clamp(o.horizon == null ? 0.62 : o.horizon, 0.05, 1);
  const gr = g.createLinearGradient(0, 0, 0, H * hz);
  gr.addColorStop(0, top);
  gr.addColorStop(0.55, mid);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H * hz + 1);
  g.fillStyle = bottom;
  g.fillRect(0, H * hz, W, H * (1 - hz));
}

// sunGlow(g, x, y, r, color, strength) - layered additive glow: wide haze, bloom, hot core.
export function sunGlow(g, x, y, r, color = "#ffd9a0", strength = 1) {
  glow(g, x, y, r * 9, color, 0.22 * strength);
  glow(g, x, y, r * 3.5, color, 0.5 * strength);
  glow(g, x, y, r * 1.4, "#ffffff", 0.85 * strength);
  g.save();
  g.globalAlpha *= clamp(strength);
  g.fillStyle = mix(color, "#ffffff", 0.75);
  g.beginPath();
  g.arc(x, y, r * 0.6, 0, TAU);
  g.fill();
  g.restore();
}

// moon(g, x, y, r, {glow, color}) - disc with maria and limb darkening, plus a soft halo.
export function moon(g, x, y, r, o = {}) {
  const gl = o.glow == null ? 1 : o.glow;
  glow(g, x, y, r * 7, o.halo || "#9fb6d8", 0.25 * gl);
  glow(g, x, y, r * 2.6, "#dfe8f6", 0.35 * gl);
  const disc = sprite("moon", 128, 128, (s) => {
    const gr = s.createRadialGradient(54, 54, 4, 64, 64, 62);
    gr.addColorStop(0, "#fbf8ee");
    gr.addColorStop(0.7, "#e6e1d2");
    gr.addColorStop(1, "#b9b4a6");
    s.fillStyle = gr;
    s.beginPath();
    s.arc(64, 64, 62, 0, TAU);
    s.fill();
    s.save();
    s.clip();
    const R = rng("maria");
    for (let i = 0; i < 9; i++) {
      s.fillStyle = `rgba(120,118,112,${0.12 + R() * 0.16})`;
      s.beginPath();
      s.ellipse(30 + R() * 70, 30 + R() * 70, 6 + R() * 16, 5 + R() * 12, R() * 3, 0, TAU);
      s.fill();
    }
    s.restore();
  });
  g.drawImage(disc, x - r, y - r, r * 2, r * 2);
}

// stars(g, W, H, seed, density, twinkleT, {yMax}) - seeded field; a few bright ones get a glow.
export function stars(g, W, H, seed = 1, density = 1, twinkleT = 0, o = {}) {
  const R = rng("stars" + seed);
  const n = Math.round(160 * density * (W * H) / (960 * 540));
  const yMax = o.yMax == null ? H * 0.75 : o.yMax;
  g.save();
  g.fillStyle = o.color || "#ffffff";
  for (let i = 0; i < n; i++) {
    const x = R() * W, y = Math.pow(R(), 1.3) * yMax;
    const m = R();
    const sz = m > 0.97 ? 1.8 : m > 0.85 ? 1.2 : 0.7;
    const tw = 0.55 + 0.45 * Math.sin(twinkleT * (1.5 + R() * 3) + i * 1.7);
    g.globalAlpha = (0.35 + m * 0.65) * tw * (1 - y / (yMax * 1.15));
    g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    if (m > 0.985) glow(g, x, y, 6, "#cfe0ff", 0.5 * tw);
  }
  g.restore();
}

function cloudSprite(seed, i, color, shadeC, w, h) {
  return sprite(`cloud:${seed}:${i}:${color}:${shadeC}`, w, h, (s) => {
    const R = rng(`cloud${seed}:${i}`);
    const n = 14;
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < n; k++) {
        const u = k / (n - 1);
        const cx = w * (0.14 + u * 0.72) + (R() - 0.5) * w * 0.08;
        const bump = Math.sin(u * Math.PI);
        const r = h * (0.18 + bump * 0.22) * (0.75 + R() * 0.5);
        const cy = h * 0.72 - bump * h * 0.18 - R() * h * 0.12;
        const gr = s.createRadialGradient(cx, cy - r * 0.35, r * 0.1, cx, cy, r);
        if (pass === 0) {
          gr.addColorStop(0, rgba(shadeC, 0.9));
          gr.addColorStop(1, rgba(shadeC, 0));
        } else {
          gr.addColorStop(0, rgba(color, 0.85));
          gr.addColorStop(0.6, rgba(mix(color, shadeC, 0.5), 0.4));
          gr.addColorStop(1, rgba(shadeC, 0));
        }
        s.fillStyle = gr;
        s.beginPath();
        s.arc(cx, pass === 0 ? cy + r * 0.15 : cy - r * 0.1, r * (pass === 0 ? 1 : 0.8), 0, TAU);
        s.fill();
      }
    }
  });
}
// clouds(g, W, H, t, {seed, color, shade, count, y, spread, speed, soft, scale, alpha})
export function clouds(g, W, H, t = 0, o = {}) {
  const seed = o.seed || 1, count = o.count || 6;
  const color = o.color || "#c8d0dc", shadeC = o.shade || mix(color, "#2a3442", 0.55);
  const R = rng("clouds" + seed);
  const y0 = o.y == null ? H * 0.2 : o.y, spread = o.spread == null ? H * 0.15 : o.spread;
  const speed = o.speed == null ? 8 : o.speed, sc = o.scale || 1;
  g.save();
  g.globalAlpha *= o.alpha == null ? 1 : o.alpha;
  for (let i = 0; i < count; i++) {
    const depth = 0.5 + R();
    const w = 340 * sc * depth, h = 130 * sc * depth;
    const spr = cloudSprite(seed, i % 4, color, shadeC, 340, 130);
    const span = W + w;
    const x = ((R() * span + t * speed * depth) % span + span) % span - w;
    const y = y0 + (R() - 0.5) * 2 * spread - h * 0.5;
    g.drawImage(spr, x, y, w, h);
  }
  g.restore();
}

// godRays(g, x, y, W, H, {color, count, strength, t, angle, spread, length, seed})
// Volumetric shafts from (x, y); rendered at quarter resolution so they come out soft.
export function godRays(g, x, y, W, H, o = {}) {
  const k = 4;
  const Lr = layer(Math.ceil(W / k), Math.ceil(H / k), "godrays");
  const s = Lr.g;
  const color = o.color || "#ffe6b0", count = o.count || 9, strength = o.strength == null ? 0.35 : o.strength;
  const ang = o.angle == null ? Math.PI / 2 : o.angle, spread = o.spread == null ? 1.1 : o.spread;
  const len = (o.length || Math.max(W, H) * 1.3) / k;
  const t = o.t || 0;
  const R = rng("rays" + (o.seed || 3));
  const sx = x / k, sy = y / k;
  for (let i = 0; i < count; i++) {
    const a = ang + ((count === 1 ? 0.5 : i / (count - 1)) - 0.5) * spread + (R() - 0.5) * 0.08 + Math.sin(t * 0.3 + i * 2.1) * 0.015;
    const wdt = (0.025 + R() * 0.05) * (0.7 + 0.3 * Math.sin(t * 0.5 + i));
    const alpha = strength * (0.4 + R() * 0.6) * (0.75 + 0.25 * Math.sin(t * 0.7 + i * 1.3));
    const ex = sx + Math.cos(a) * len, ey = sy + Math.sin(a) * len;
    const gr = s.createLinearGradient(sx, sy, ex, ey);
    gr.addColorStop(0, rgba(color, alpha));
    gr.addColorStop(0.5, rgba(color, alpha * 0.35));
    gr.addColorStop(1, rgba(color, 0));
    s.fillStyle = gr;
    s.beginPath();
    s.moveTo(sx, sy);
    s.lineTo(sx + Math.cos(a - wdt) * len, sy + Math.sin(a - wdt) * len);
    s.lineTo(sx + Math.cos(a + wdt) * len, sy + Math.sin(a + wdt) * len);
    s.closePath();
    s.fill();
  }
  g.save();
  g.globalCompositeOperation = "lighter";
  g.imageSmoothingEnabled = true;
  g.drawImage(Lr.canvas, 0, 0, Lr.canvas.width, Lr.canvas.height, 0, 0, Lr.W * k, Lr.H * k);
  g.restore();
}

// fog(g, W, H, {y, h, color, alpha, t, wisps}) - a band of haze centred on y, with slow wisps.
export function fog(g, W, H, o = {}) {
  const y = o.y == null ? H * 0.7 : o.y, h = o.h == null ? H * 0.3 : o.h;
  const color = o.color || "#9aa8b8", a = o.alpha == null ? 0.5 : o.alpha;
  const gr = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  gr.addColorStop(0, rgba(color, 0));
  gr.addColorStop(0.5, rgba(color, a));
  gr.addColorStop(1, rgba(color, o.fill ? a : 0));
  g.fillStyle = gr;
  g.fillRect(0, y - h / 2, W, o.fill ? H - (y - h / 2) : h);
  if (o.wisps !== false) {
    const t = o.t || 0;
    const R = rng("fog" + (o.seed || 1));
    const spr = glowSprite(color);
    g.save();
    for (let i = 0; i < 7; i++) {
      const w = W * (0.35 + R() * 0.4), hh = h * (0.4 + R() * 0.4);
      const span = W + w;
      const x = ((R() * span + t * (6 + R() * 10)) % span + span) % span - w * 0.5;
      g.globalAlpha = a * (0.25 + R() * 0.25);
      g.drawImage(spr, x - w / 2, y - hh / 2 + (R() - 0.5) * h * 0.4, w, hh);
    }
    g.restore();
  }
}

// rain(g, W, H, t, {density, angle, color, speed, len, seed, width, near})
// Deterministic streaks; two depth layers (far thin/dim, near long/bright).
export function rain(g, W, H, t = 0, o = {}) {
  const density = o.density == null ? 1 : o.density;
  const ang = o.angle == null ? 0.15 : o.angle;
  const color = o.color || "rgba(190,205,230,0.45)";
  const speed = o.speed || 900, len = o.len || 26;
  const n = Math.round(260 * density * (W / 960));
  const tanA = Math.tan(ang);
  const sx = Math.sin(ang), cy = Math.cos(ang);
  const seed = o.seed || 7;
  const far = new Path2D(), near = new Path2D();
  for (let i = 0; i < n; i++) {
    const r1 = hash(i, seed), r2 = hash(i + 0.5, seed), r3 = hash(i + 0.25, seed);
    const isNear = r3 > 0.72;
    const sp = speed * (isNear ? 1.25 : 0.75 + r3 * 0.4);
    const L = len * (isNear ? 1.5 : 0.6 + r3 * 0.6);
    const span = H + L + Math.abs(tanA) * H;
    const y = ((r2 * span + t * sp) % span) - L;
    const x = ((r1 * (W + 200) - 100 + y * tanA) % (W + 200) + (W + 200)) % (W + 200) - 100;
    const p = isNear ? near : far;
    p.moveTo(x, y);
    p.lineTo(x - sx * L, y - cy * L);
  }
  g.save();
  g.lineCap = "round";
  g.strokeStyle = color;
  g.lineWidth = (o.width || 1) * 0.8;
  g.globalAlpha *= 0.7;
  g.stroke(far);
  g.globalAlpha /= 0.7;
  g.lineWidth = (o.width || 1) * 1.3;
  g.stroke(near);
  g.restore();
}

// splashes(g, W, H, t, {y0, y1, density, color, seed, x0, x1}) - rain hitting the ground:
// expanding flattened rings and a tiny crown, each on its own short cycle.
export function splashes(g, W, H, t = 0, o = {}) {
  const y0 = o.y0 == null ? H * 0.75 : o.y0, y1 = o.y1 == null ? H : o.y1;
  const x0 = o.x0 == null ? 0 : o.x0, x1 = o.x1 == null ? W : o.x1;
  const n = Math.round(60 * (o.density == null ? 1 : o.density));
  const seed = o.seed || 9;
  const color = o.color || "rgba(210,220,240,0.6)";
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 0.8;
  for (let i = 0; i < n; i++) {
    const period = 0.45 + hash(i, seed) * 0.5;
    const tt = t + hash(i + 0.3, seed) * period;
    const cyc = Math.floor(tt / period);
    const p = (tt / period) - cyc;
    const x = lerp(x0, x1, hash(i * 13.1 + cyc * 7.7, seed));
    const yy = lerp(y0, y1, Math.pow(hash(i * 3.3 + cyc * 1.9, seed), 0.7));
    const depth = (yy - y0) / Math.max(1, y1 - y0);
    const r = (1.5 + p * 7) * (0.5 + depth);
    g.globalAlpha = (1 - p) * (0.4 + depth * 0.6);
    g.beginPath();
    g.ellipse(x, yy, r, r * 0.28, 0, 0, TAU);
    g.stroke();
    if (p < 0.35) {
      const h = (1 - p / 0.35) * 5 * (0.5 + depth);
      g.fillRect(x - 2.5 * (0.5 + depth), yy - h * 1.2, 0.9, 0.9);
      g.fillRect(x + 2.2 * (0.5 + depth), yy - h, 0.9, 0.9);
    }
  }
  g.restore();
}

// glassDrops(g, x, y, w, h, t, {seed, density, light}) - raindrops on a window pane: static beads
// with refraction highlights plus a few drops sliding down leaving trails.
export function glassDrops(g, x, y, w, h, t = 0, o = {}) {
  const seed = o.seed || 11;
  const n = Math.round(90 * (o.density == null ? 1 : o.density) * (w * h) / (400 * 300));
  const light = o.light || "#ffffff";
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  for (let i = 0; i < n; i++) {
    const r = 1 + Math.pow(hash(i, seed), 2) * 4;
    const dx = x + hash(i + 0.1, seed) * w;
    const slide = hash(i + 0.7, seed) > 0.85;
    let dy = y + hash(i + 0.2, seed) * h;
    if (slide) {
      const sp = 20 + hash(i + 0.9, seed) * 50;
      dy = y + ((hash(i + 0.2, seed) * h + t * sp) % (h + 20)) - 10;
      g.strokeStyle = "rgba(200,215,235,0.12)";
      g.lineWidth = r * 0.8;
      g.beginPath();
      g.moveTo(dx, dy - r);
      g.lineTo(dx + Math.sin(i) * 2, Math.max(y, dy - 60));
      g.stroke();
    }
    g.fillStyle = "rgba(20,28,40,0.35)";
    g.beginPath();
    g.ellipse(dx, dy + r * 0.15, r, r * 1.1, 0, 0, TAU);
    g.fill();
    g.fillStyle = rgba(light, 0.55);
    g.beginPath();
    g.arc(dx - r * 0.3, dy - r * 0.35, r * 0.35, 0, TAU);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.beginPath();
    g.arc(dx + r * 0.25, dy + r * 0.45, r * 0.45, 0, TAU);
    g.fill();
  }
  g.restore();
}

// dust(g, W, H, t, {seed, color, count, size, area:[x,y,w,h], alpha}) - floating motes in light.
export function dust(g, W, H, t = 0, o = {}) {
  const seed = o.seed || 5, n = o.count || 40, color = o.color || "#fff0d0";
  const [ax, ay, aw, ah] = o.area || [0, 0, W, H];
  const spr = glowSprite(color);
  g.save();
  for (let i = 0; i < n; i++) {
    const px = ax + ((hash(i, seed) * aw + noise(t * 0.15 + i, seed) * 40 + t * 4) % aw + aw) % aw;
    const py = ay + ((hash(i + 0.5, seed) * ah + noise(t * 0.12 + i * 3, seed + 1) * 30 - t * 2) % ah + ah) % ah;
    const s = (o.size || 1.6) * (0.5 + hash(i + 0.2, seed));
    g.globalAlpha = (o.alpha == null ? 0.6 : o.alpha) * (0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + i)));
    g.globalCompositeOperation = "lighter";
    g.drawImage(spr, px - s * 2, py - s * 2, s * 4, s * 4);
  }
  g.restore();
}

// fireflies(g, W, H, t, {seed, count, color, area, size}) - slow wandering blinking glows.
export function fireflies(g, W, H, t = 0, o = {}) {
  const seed = o.seed || 6, n = o.count || 18, color = o.color || "#ffe98a";
  const [ax, ay, aw, ah] = o.area || [0, H * 0.4, W, H * 0.5];
  for (let i = 0; i < n; i++) {
    const px = ax + aw * (0.5 + 0.5 * noise(t * 0.18 + i * 7.1, seed));
    const py = ay + ah * (0.5 + 0.5 * noise(t * 0.15 + i * 3.7, seed + 3));
    const blink = Math.max(0, Math.sin(t * (0.9 + hash(i, seed)) + i * 2.3));
    const s = (o.size || 3) * (0.7 + hash(i + 0.4, seed) * 0.6);
    glow(g, px, py, s * 6, color, 0.45 * blink);
    glow(g, px, py, s * 1.4, "#ffffff", 0.8 * blink);
  }
}

// leaves(g, W, H, t, {seed, count, color, wind, toward:[x,y], pull}) - wind-blown leaves.
export function leaves(g, W, H, t = 0, o = {}) {
  const seed = o.seed || 4, n = o.count || 14, wind = o.wind == null ? 1 : o.wind;
  g.save();
  for (let i = 0; i < n; i++) {
    const sp = (120 + hash(i, seed) * 220) * wind;
    const span = W + 80;
    let x = ((hash(i + 0.1, seed) * span + t * sp) % span) - 40;
    let y = hash(i + 0.2, seed) * H + Math.sin(t * 2 + i) * 20 + noise(t * 0.5 + i, seed) * 40;
    if (o.toward) {
      const pull = clamp(o.pull || 0);
      x = lerp(x, o.toward[0], pull * hash(i + 0.6, seed));
      y = lerp(y, o.toward[1], pull * hash(i + 0.6, seed));
    }
    const a = t * (3 + hash(i + 0.3, seed) * 5) + i;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.scale(1, Math.abs(Math.cos(a * 1.3)) * 0.8 + 0.2);
    g.fillStyle = o.color ? o.color : mix("#6b4a22", "#2f3a1a", hash(i + 0.8, seed));
    g.beginPath();
    g.ellipse(0, 0, 5, 2.4, 0, 0, TAU);
    g.fill();
    g.restore();
  }
  g.restore();
}

// lightningBolt(g, x0, y0, x1, y1, seed, {color, alpha, width}) - a forked branching bolt with glow.
export function lightningBolt(g, x0, y0, x1, y1, seed = 1, o = {}) {
  const R = rng("bolt" + seed);
  const color = o.color || "#dfe9ff";
  const a = o.alpha == null ? 1 : o.alpha;
  if (a <= 0) return;
  const path = new Path2D();
  const branch = (ax, ay, bx, by, depth) => {
    const segs = 9;
    let px = ax, py = ay;
    path.moveTo(ax, ay);
    for (let i = 1; i <= segs; i++) {
      const u = i / segs;
      const nx = lerp(ax, bx, u) + (R() - 0.5) * Math.abs(by - ay) * 0.12;
      const ny = lerp(ay, by, u);
      path.lineTo(nx, ny);
      if (depth < 2 && R() > 0.78) {
        branch(nx, ny, nx + (R() - 0.5) * 160, ny + 60 + R() * 90, depth + 1);
        path.moveTo(nx, ny);
      }
      px = nx; py = ny;
    }
  };
  branch(x0, y0, x1, y1, 0);
  g.save();
  g.globalAlpha *= a;
  g.globalCompositeOperation = "lighter";
  g.lineJoin = "round";
  g.strokeStyle = rgba(color, 0.25);
  g.lineWidth = (o.width || 2) * 5;
  g.stroke(path);
  g.strokeStyle = rgba(color, 0.9);
  g.lineWidth = o.width || 2;
  g.stroke(path);
  g.strokeStyle = "#ffffff";
  g.lineWidth = (o.width || 2) * 0.4;
  g.stroke(path);
  g.restore();
}

// ---- landscape ---------------------------------------------------------------------------------------
// grass(g, x0, x1, y, {seed, color, height, t, wind, density, light, dark}) - tapered blades that
// sway with a travelling gust. y is the ground line; blades grow up from it.
export function grass(g, x0, x1, y, o = {}) {
  const seed = o.seed || 1, color = o.color || "#3a5a2a", h = o.height || 28;
  const t = o.t || 0, wind = o.wind == null ? 1 : o.wind;
  const n = Math.round(Math.abs(x1 - x0) / 2.6 * (o.density == null ? 1 : o.density));
  const groups = [new Path2D(), new Path2D(), new Path2D()];
  for (let i = 0; i < n; i++) {
    const r = hash(i, seed);
    const bx = lerp(x0, x1, (i + hash(i + 0.5, seed)) / n);
    const bh = h * (0.45 + r * 0.75);
    const gust = Math.sin(t * 1.6 - bx * 0.012) * 0.5 + Math.sin(t * 2.7 + bx * 0.05 + i) * 0.18;
    const lean = ((hash(i + 0.2, seed) - 0.5) * 0.7 + gust * 0.55 * wind) * bh;
    const w = 1.1 + hash(i + 0.7, seed) * 1.4;
    const p = groups[i % 3];
    const by = y + hash(i + 0.9, seed) * 3;
    p.moveTo(bx - w, by);
    p.quadraticCurveTo(bx - w * 0.3 + lean * 0.35, by - bh * 0.6, bx + lean, by - bh);
    p.quadraticCurveTo(bx + w * 0.3 + lean * 0.35, by - bh * 0.6, bx + w, by);
    p.closePath();
  }
  const dark = o.dark || shade(color, -0.35), light = o.light || shade(color, 0.2);
  const gr = (c0, c1) => { const q = g.createLinearGradient(0, y - h * 1.2, 0, y); q.addColorStop(0, c0); q.addColorStop(1, c1); return q; };
  g.fillStyle = gr(dark, shade(dark, -0.3));
  g.fill(groups[0]);
  g.fillStyle = gr(color, dark);
  g.fill(groups[1]);
  g.fillStyle = gr(light, color);
  g.fill(groups[2]);
}

function paintTree(s, w, h, o, kind) {
  const R = rng("tree" + o.seed + kind);
  const trunk = o.trunk || "#4a3426", leaf = o.leaf || "#3d5a2c";
  const bx = w / 2, by = h - 4;
  const tips = [];
  const branch = (x, y, ang, len, wid, depth) => {
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    const cx = (x + ex) / 2 + (R() - 0.5) * len * 0.25, cy = (y + ey) / 2 + (R() - 0.5) * len * 0.15;
    s.strokeStyle = trunk;
    s.lineWidth = wid;
    s.lineCap = "round";
    s.beginPath();
    s.moveTo(x, y);
    s.quadraticCurveTo(cx, cy, ex, ey);
    s.stroke();
    if (depth >= (kind === "bare" ? 6 : 4) || len < 6) { tips.push([ex, ey]); return; }
    const k = 2 + (R() > 0.6 ? 1 : 0);
    for (let i = 0; i < k; i++) {
      const na = ang + (R() - 0.5) * (kind === "bare" ? 1.3 : 1.1) + (i - (k - 1) / 2) * 0.45;
      branch(ex, ey, na, len * (0.62 + R() * 0.18), wid * 0.62, depth + 1);
    }
  };
  if (kind === "pine") {
    s.fillStyle = trunk;
    s.fillRect(bx - w * 0.025, by - h * 0.25, w * 0.05, h * 0.25);
    for (let i = 0; i < 9; i++) {
      const u = i / 8;
      const ty = by - h * (0.15 + u * 0.8), tw = w * (0.48 - u * 0.4);
      const gr = s.createLinearGradient(bx - tw, 0, bx + tw, 0);
      gr.addColorStop(0, shade(leaf, -0.4));
      gr.addColorStop(0.6, leaf);
      gr.addColorStop(1, shade(leaf, -0.2));
      s.fillStyle = gr;
      s.beginPath();
      s.moveTo(bx, ty - h * 0.14);
      for (let k = 0; k <= 8; k++) s.lineTo(bx - tw + (k / 8) * tw * 2, ty + (k % 2 ? 4 : 0) + R() * 3);
      s.closePath();
      s.fill();
    }
    return;
  }
  branch(bx, by, -Math.PI / 2 + (R() - 0.5) * 0.15, h * (kind === "bare" ? 0.27 : 0.28), w * 0.07, 0);
  if (kind === "bare") return;
  // foliage clumps: dark underside first, then lit tops, then leaf speckle
  // keep every clump fully inside the sprite (a clipped clump reads as a flat cut edge)
  const clumps = tips.map(([x, y]) => {
    const r = w * (0.09 + R() * 0.07);
    const cx = x + (R() - 0.5) * 10, cy = y - 4 + (R() - 0.5) * 8;
    const m = r * 1.35;
    return [Math.min(w - m, Math.max(m, bx + (cx - bx) * 0.82)), Math.max(m, cy), r];
  });
  for (const pass of [0, 1, 2]) {
    for (const [x, y, r] of clumps) {
      const rr = r * (pass === 0 ? 1.25 : pass === 1 ? 1 : 0.7);
      const oy = pass === 0 ? r * 0.25 : pass === 1 ? 0 : -r * 0.35;
      const gr = s.createRadialGradient(x - rr * 0.3, y + oy - rr * 0.4, rr * 0.1, x, y + oy, rr);
      const c = pass === 0 ? shade(leaf, -0.45) : pass === 1 ? leaf : shade(leaf, 0.22);
      gr.addColorStop(0, c);
      gr.addColorStop(0.8, rgba(c, 0.85));
      gr.addColorStop(1, rgba(c, 0));
      s.fillStyle = gr;
      s.beginPath();
      s.arc(x, y + oy, rr, 0, TAU);
      s.fill();
    }
  }
  s.fillStyle = rgba(shade(leaf, 0.35), 0.5);
  for (let i = 0; i < 260; i++) {
    const [x, y, r] = clumps[Math.floor(R() * clumps.length)];
    const a = R() * TAU, d = R() * r;
    s.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d - r * 0.3, 1.6, 1.2);
  }
}
// tree(g, x, y, scale, {seed, leaf, trunk, t, kind:'oak'|'pine'|'bare', sway}) - x, y = base of trunk.
// A tree is ~300*scale tall. Painted once into a sprite; sways about its base with t.
export function tree(g, x, y, scale = 1, o = {}) {
  const kind = o.kind || "oak";
  const w = 260, h = 320;
  const key = `tree:${o.seed || 1}:${kind}:${o.leaf || ""}:${o.trunk || ""}`;
  const spr = sprite(key, w, h, (s) => paintTree(s, w, h, { seed: o.seed || 1, leaf: o.leaf, trunk: o.trunk }, kind));
  const t = o.t || 0;
  const sway = (o.sway == null ? 1 : o.sway) * (Math.sin(t * 0.8 + (o.seed || 1)) * 0.012 + Math.sin(t * 2.1 + (o.seed || 1) * 3) * 0.004);
  g.save();
  g.translate(x, y);
  g.rotate(sway);
  g.drawImage(spr, -w * scale / 2, -h * scale + 4 * scale, w * scale, h * scale);
  g.restore();
}

// hills(g, W, H, {y, amp, color, seed, haze, hazeAmt, freq, top}) - a noise ridge filled to the
// bottom; `haze` + `hazeAmt` give atmospheric perspective (far hills fade toward the sky colour).
export function hills(g, W, H, o = {}) {
  const y = o.y == null ? H * 0.6 : o.y, amp = o.amp == null ? 40 : o.amp;
  const seed = o.seed || 1, freq = o.freq || 1;
  let color = o.color || "#2a3a2a";
  if (o.haze) color = mix(color, o.haze, o.hazeAmt == null ? 0.5 : o.hazeAmt);
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, y - amp * (0.5 + 0.5 * fbm((x / 320) * freq + seed * 10, seed)));
  g.lineTo(W, H);
  g.closePath();
  const gr = g.createLinearGradient(0, y - amp, 0, H);
  gr.addColorStop(0, o.top || shade(color, 0.08));
  gr.addColorStop(0.4, color);
  gr.addColorStop(1, shade(color, -0.3));
  g.fillStyle = gr;
  g.fill();
}

// stone(g, x, y, w, h, {seed, color, wet, light}) - a weathered standing stone (base at x, y).
export function stone(g, x, y, w, h, o = {}) {
  const R = rng("stone" + (o.seed || 1));
  const color = o.color || "#5d6168";
  const pts = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI;
    const rx = w / 2 * (0.85 + R() * 0.2), ry = h * (0.92 + R() * 0.1);
    pts.push(x + Math.cos(a) * rx, y + Math.sin(a) * ry * (i === 0 || i === n - 1 ? 0 : 1) - (i === 0 || i === n - 1 ? 0 : 0));
  }
  pts.push(x + w * 0.5, y + 2, x - w * 0.5, y + 2);
  const p = new Path2D();
  spline(p, pts, true, 0.6);
  const gr = g.createLinearGradient(x - w / 2, y - h, x + w / 2, y);
  gr.addColorStop(0, shade(color, 0.15));
  gr.addColorStop(0.6, color);
  gr.addColorStop(1, shade(color, -0.45));
  g.fillStyle = gr;
  g.fill(p);
  g.save();
  g.clip(p);
  g.strokeStyle = rgba(shade(color, -0.5), 0.5);
  g.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    const sx = x + (R() - 0.5) * w * 0.7, sy = y - R() * h * 0.9;
    g.moveTo(sx, sy);
    g.lineTo(sx + (R() - 0.5) * w * 0.3, sy + R() * h * 0.2);
    g.stroke();
  }
  // moss at the foot
  const mg = g.createLinearGradient(0, y - h * 0.3, 0, y);
  mg.addColorStop(0, "rgba(60,80,40,0)");
  mg.addColorStop(1, "rgba(60,80,40,0.6)");
  g.fillStyle = mg;
  g.fill(p);
  if (o.wet) {
    g.fillStyle = `rgba(200,215,235,${0.12 * o.wet})`;
    g.fillRect(x - w * 0.15, y - h, w * 0.08, h);
  }
  g.restore();
}

// fence(g, x0, x1, y, h, {color, gap:[xa, xb], night, tuft}) - white picket fence (base y).
export function fence(g, x0, x1, y, h, o = {}) {
  const color = o.color || (o.night ? "#7d8796" : "#efe9de");
  const step = h * 0.32;
  const sh = shade(color, -0.35);
  g.fillStyle = sh;
  g.fillRect(x0, y - h * 0.75, x1 - x0, h * 0.07);
  g.fillRect(x0, y - h * 0.3, x1 - x0, h * 0.07);
  for (let x = x0; x <= x1; x += step) {
    if (o.gap && x > o.gap[0] && x < o.gap[1]) continue;
    const w = step * 0.62;
    const gr = g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, color);
    gr.addColorStop(1, sh);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, y - h * 0.88);
    g.lineTo(x + w / 2, y - h);
    g.lineTo(x + w, y - h * 0.88);
    g.lineTo(x + w, y);
    g.closePath();
    g.fill();
  }
  if (o.gap) {
    // the hole under the fence: a dark scooped gap, and the orange fur tuft on a nail
    g.fillStyle = "rgba(10,8,6,0.7)";
    g.beginPath();
    g.ellipse((o.gap[0] + o.gap[1]) / 2, y, (o.gap[1] - o.gap[0]) / 2, h * 0.22, 0, Math.PI, TAU);
    g.fill();
    if (o.tuft !== false) {
      const tx = o.gap[1] - 2, ty = y - h * 0.3;
      g.fillStyle = "#555";
      g.fillRect(tx - 1, ty - 1, 3, 2);
      g.strokeStyle = "#d9822b";
      g.lineWidth = 0.9;
      g.beginPath();
      for (let i = 0; i < 6; i++) { g.moveTo(tx, ty); g.quadraticCurveTo(tx + 3, ty + 2 + i, tx + 4 + i * 0.5, ty + 5 + i); }
      g.stroke();
    }
  }
}

// house(g, x, y, scale, {windowsLit, lit:[0..5], night, wall, roof, trim, door, porchLight, t})
// A two-storey suburban house (~240*scale wide, ~250*scale tall), x, y = bottom centre.
// Window indices: 0..2 upstairs left->right, 3..4 downstairs either side of the door.
export function house(g, x, y, scale = 1, o = {}) {
  const night = o.night !== false;
  const wall = o.wall || (night ? "#4b4f5a" : "#d8cbb4"), roof = o.roof || (night ? "#23252c" : "#4a3a3a");
  const trim = o.trim || (night ? "#8a8e98" : "#efe9de"), door = o.door || "#6b2f2a";
  const lit = o.lit || (o.windowsLit === false ? [] : o.windowsLit === true || o.windowsLit == null ? [1, 3] : o.windowsLit);
  const glowC = o.glowColor || "#ffcf8a";
  const t = o.t || 0;
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  const W = 240, H1 = 170;
  // body
  const wg = g.createLinearGradient(-W / 2, 0, W / 2, 0);
  wg.addColorStop(0, shade(wall, -0.25));
  wg.addColorStop(0.5, wall);
  wg.addColorStop(1, shade(wall, -0.15));
  g.fillStyle = wg;
  g.fillRect(-W / 2, -H1, W, H1);
  // siding lines
  g.strokeStyle = rgba(shade(wall, -0.4), 0.35);
  g.lineWidth = 0.8;
  g.beginPath();
  for (let yy = -H1 + 8; yy < 0; yy += 9) { g.moveTo(-W / 2, yy); g.lineTo(W / 2, yy); }
  g.stroke();
  // chimney + roof
  g.fillStyle = shade(roof, 0.15);
  g.fillRect(55, -H1 - 78, 22, 60);
  g.fillStyle = roof;
  g.beginPath();
  g.moveTo(-W / 2 - 14, -H1 + 2);
  g.lineTo(0, -H1 - 82);
  g.lineTo(W / 2 + 14, -H1 + 2);
  g.closePath();
  g.fill();
  const rg = g.createLinearGradient(0, -H1 - 82, 0, -H1);
  rg.addColorStop(0, "rgba(255,255,255,0.08)");
  rg.addColorStop(1, "rgba(0,0,0,0.25)");
  g.fillStyle = rg;
  g.fill();
  g.strokeStyle = trim;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(-W / 2 - 14, -H1 + 2);
  g.lineTo(0, -H1 - 82);
  g.lineTo(W / 2 + 14, -H1 + 2);
  g.stroke();
  // windows
  const wins = [[-80, -140], [0, -140], [80, -140], [-72, -70], [72, -70]];
  wins.forEach(([wx, wy], i) => {
    const on = lit.includes(i);
    const ww = 38, wh = 46;
    if (on) {
      const flick = 0.92 + 0.08 * Math.sin(t * 7 + i * 3) * Math.sin(t * 3.1 + i);
      const gr = g.createLinearGradient(0, wy, 0, wy + wh);
      gr.addColorStop(0, mix(glowC, "#fff6e0", 0.4));
      gr.addColorStop(1, shade(glowC, -0.15));
      g.fillStyle = gr;
      g.globalAlpha = flick;
      g.fillRect(wx - ww / 2, wy, ww, wh);
      g.globalAlpha = 1;
      // curtain silhouettes
      g.fillStyle = rgba(shade(glowC, -0.5), 0.55);
      g.fillRect(wx - ww / 2, wy, 8, wh);
      g.fillRect(wx + ww / 2 - 8, wy, 8, wh);
    } else {
      const gr = g.createLinearGradient(0, wy, 0, wy + wh);
      gr.addColorStop(0, night ? "#1a2030" : "#8fa6bf");
      gr.addColorStop(1, night ? "#0d1018" : "#5d7187");
      g.fillStyle = gr;
      g.fillRect(wx - ww / 2, wy, ww, wh);
    }
    g.strokeStyle = trim;
    g.lineWidth = 3;
    g.strokeRect(wx - ww / 2, wy, ww, wh);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(wx, wy);
    g.lineTo(wx, wy + wh);
    g.moveTo(wx - ww / 2, wy + wh / 2);
    g.lineTo(wx + ww / 2, wy + wh / 2);
    g.stroke();
    g.fillStyle = trim;
    g.fillRect(wx - ww / 2 - 4, wy + wh, ww + 8, 4);
  });
  // door + porch
  g.fillStyle = door;
  g.fillRect(-18, -62, 36, 62);
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.fillRect(-18, -62, 36, 6);
  g.fillStyle = "#c9a54a";
  g.beginPath();
  g.arc(10, -30, 2, 0, TAU);
  g.fill();
  g.fillStyle = shade(trim, -0.2);
  g.fillRect(-30, -4, 60, 6);
  g.restore();
  // light spill (unscaled, additive) for lit windows and the porch light
  if (night) {
    lit.forEach((i) => {
      const [wx, wy] = wins[i] || [0, 0];
      glow(g, x + wx * scale, y + (wy + 23) * scale, 70 * scale, glowC, 0.35);
    });
    if (o.porchLight !== false) {
      glow(g, x + 24 * scale, y - 70 * scale, 60 * scale, "#ffd79a", 0.5);
      glow(g, x + 24 * scale, y - 70 * scale, 6 * scale, "#ffffff", 0.9);
    }
  }
}

// room(g, W, H, {wall, floor, night, horizon, lamp:{x,y,color,strength}, window:{x,y,w,h,outside(g,x,y,w,h)}, rain, t})
// A bedroom-style interior seen from inside: back wall, skirting, wood floor in perspective, an
// optional window (its outside drawn by your callback, clipped) and a warm lamp pool.
export function room(g, W, H, o = {}) {
  const hz = (o.horizon == null ? 0.68 : o.horizon) * H;
  const night = o.night !== false;
  const wall = o.wall || (night ? "#3d3540" : "#cdb9a0"), floor = o.floor || (night ? "#2e2119" : "#7a5638");
  const wg = g.createLinearGradient(0, 0, 0, hz);
  wg.addColorStop(0, shade(wall, -0.3));
  wg.addColorStop(1, wall);
  g.fillStyle = wg;
  g.fillRect(0, 0, W, hz);
  // wallpaper stripes
  g.fillStyle = rgba(shade(wall, 0.15), 0.18);
  for (let x = 0; x < W; x += 34) g.fillRect(x, 0, 10, hz);
  const w = o.window;
  if (w) {
    g.save();
    g.beginPath();
    g.rect(w.x, w.y, w.w, w.h);
    g.clip();
    if (typeof w.outside === "function") { try { w.outside(g, w.x, w.y, w.w, w.h); } catch (err) { console.warn("[filmkit] room window", err); } }
    else { g.fillStyle = night ? "#0b1424" : "#9cc4e8"; g.fillRect(w.x, w.y, w.w, w.h); }
    if (o.rain) glassDrops(g, w.x, w.y, w.w, w.h, o.t || 0, { seed: 31 });
    // faint reflection on the glass
    const rg = g.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h);
    rg.addColorStop(0, "rgba(255,255,255,0.06)");
    rg.addColorStop(0.5, "rgba(255,255,255,0)");
    rg.addColorStop(1, "rgba(255,255,255,0.04)");
    g.fillStyle = rg;
    g.fillRect(w.x, w.y, w.w, w.h);
    g.restore();
    const fr = o.frame || (night ? "#8a8078" : "#efe9de");
    g.strokeStyle = fr;
    g.lineWidth = 8;
    g.strokeRect(w.x, w.y, w.w, w.h);
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(w.x + w.w / 2, w.y);
    g.lineTo(w.x + w.w / 2, w.y + w.h);
    g.stroke();
    g.fillStyle = shade(fr, -0.15);
    g.fillRect(w.x - 14, w.y + w.h, w.w + 28, 12);
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.fillRect(w.x - 14, w.y + w.h + 12, w.w + 28, 6);
  }
  // skirting + floor
  g.fillStyle = shade(wall, -0.45);
  g.fillRect(0, hz - 10, W, 10);
  const fg = g.createLinearGradient(0, hz, 0, H);
  fg.addColorStop(0, shade(floor, -0.2));
  fg.addColorStop(1, floor);
  g.fillStyle = fg;
  g.fillRect(0, hz, W, H - hz);
  g.strokeStyle = rgba(shade(floor, -0.5), 0.5);
  g.lineWidth = 1;
  g.beginPath();
  const vx = W / 2;
  for (let i = -12; i <= 12; i++) { g.moveTo(vx + i * 30, hz); g.lineTo(vx + i * 160, H); }
  for (let k = 1; k < 6; k++) { const yy = hz + (H - hz) * Math.pow(k / 6, 1.6); g.moveTo(0, yy); g.lineTo(W, yy); }
  g.stroke();
  if (o.lamp) {
    const L = o.lamp;
    const c = L.color || "#ffcf8a", s = L.strength == null ? 1 : L.strength;
    glow(g, L.x, L.y, W * 0.55, c, 0.35 * s);
    glow(g, L.x, L.y, W * 0.18, c, 0.45 * s);
    glow(g, L.x, L.y, 10, "#ffffff", 0.9 * s);
  }
  // darker corners
  const vg = g.createRadialGradient(W / 2, H * 0.55, H * 0.2, W / 2, H * 0.55, W * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
}

// bed(g, x, y, w, {quilt:[c1,c2,c3], night, t}) - the patchwork-quilt bed (x, y = bottom-left).
export function bed(g, x, y, w, o = {}) {
  const q = o.quilt || ["#4a6fa5", "#e0b25a", "#c2575b"];
  const h = w * 0.42;
  g.fillStyle = "#3a2a20";
  g.fillRect(x, y - h * 1.4, w * 0.06, h * 1.4);
  g.fillRect(x + w * 0.94, y - h * 0.9, w * 0.06, h * 0.9);
  g.fillStyle = "#e8e2d6";
  g.beginPath();
  g.ellipse(x + w * 0.18, y - h * 0.82, w * 0.12, h * 0.16, -0.1, 0, TAU);
  g.fill();
  const cell = w * 0.1;
  g.save();
  g.beginPath();
  g.moveTo(x + w * 0.05, y - h * 0.7);
  g.quadraticCurveTo(x + w * 0.5, y - h * 0.85, x + w * 0.96, y - h * 0.7);
  g.lineTo(x + w * 0.98, y - h * 0.15);
  g.lineTo(x + w * 0.03, y - h * 0.15);
  g.closePath();
  g.clip();
  for (let i = 0; i < 11; i++) for (let j = 0; j < 6; j++) {
    g.fillStyle = q[(i + j * 2) % q.length];
    g.fillRect(x + i * cell, y - h * 0.9 + j * cell * 0.7, cell, cell * 0.7);
  }
  g.strokeStyle = "rgba(255,255,255,0.25)";
  g.setLineDash([3, 3]);
  g.lineWidth = 0.8;
  g.strokeRect(x, y - h, w, h);
  g.setLineDash([]);
  const sg = g.createLinearGradient(0, y - h, 0, y);
  sg.addColorStop(0, "rgba(255,240,220,0.1)");
  sg.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = sg;
  g.fillRect(x, y - h, w, h);
  g.restore();
  g.fillStyle = "#2a1e16";
  g.fillRect(x, y - h * 0.15, w, h * 0.15);
}

// streetlamp(g, x, y, h, {on, t, color, flicker, cone}) - x, y = foot of the pole.
export function streetlamp(g, x, y, h = 200, o = {}) {
  const on = o.on !== false, color = o.color || "#ffb25a";
  const t = o.t || 0;
  const fl = 1 - (o.flicker || 0) * (Math.sin(t * 23) * Math.sin(t * 7.3) > 0.6 ? 0.6 : 0);
  const hx = x + h * 0.16, hy = y - h;
  if (on && o.cone !== false) {
    const gr = g.createLinearGradient(0, hy, 0, y);
    gr.addColorStop(0, rgba(color, 0.32 * fl));
    gr.addColorStop(1, rgba(color, 0.04 * fl));
    g.save();
    g.globalCompositeOperation = "lighter";
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(hx - 6, hy + 4);
    g.lineTo(hx + 6, hy + 4);
    g.lineTo(hx + h * 0.42, y);
    g.lineTo(hx - h * 0.42, y);
    g.closePath();
    g.fill();
    g.restore();
    g.save();
    g.translate(hx, y);
    g.scale(1, 0.18);
    glow(g, 0, 0, h * 0.55, color, 0.5 * fl);
    g.restore();
  }
  const pg = g.createLinearGradient(x - 4, 0, x + 4, 0);
  pg.addColorStop(0, "#1a1c22");
  pg.addColorStop(0.5, "#4a4e58");
  pg.addColorStop(1, "#15171c");
  g.fillStyle = pg;
  g.fillRect(x - 3.5, y - h, 7, h);
  g.fillRect(x - 7, y - 10, 14, 10);
  g.strokeStyle = "#2a2d35";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(x, y - h + 6);
  g.quadraticCurveTo(x, y - h - 8, hx, hy - 4);
  g.stroke();
  g.fillStyle = "#2a2d35";
  g.beginPath();
  g.moveTo(hx - 12, hy);
  g.lineTo(hx + 12, hy);
  g.lineTo(hx + 6, hy - 9);
  g.lineTo(hx - 6, hy - 9);
  g.closePath();
  g.fill();
  if (on) {
    g.fillStyle = mix(color, "#ffffff", 0.6);
    g.fillRect(hx - 8, hy, 16, 3);
    glow(g, hx, hy + 2, h * 0.35, color, 0.55 * fl);
    glow(g, hx, hy + 2, 10, "#ffffff", 0.8 * fl);
  }
}

// puddleReflection(g, drawFn, y, alpha, {x0, x1, ripple, t, tint, clip(g)}) - mirror whatever
// drawFn(g) paints about the line y, clipped below it (or to your clip path), with ripples.
export function puddleReflection(g, drawFn, y, alpha = 0.4, o = {}) {
  const W = g.canvas.width / pixelScale(), H = g.canvas.height / pixelScale();
  const Lr = layer(W, H, "puddle");
  try { drawFn(Lr.g); } catch (err) { console.warn("[filmkit] puddle drawFn", err); }
  g.save();
  if (typeof o.clip === "function") { g.beginPath(); o.clip(g); g.clip(); }
  else { g.beginPath(); g.rect(o.x0 || 0, y, (o.x1 == null ? W : o.x1) - (o.x0 || 0), H - y); g.clip(); }
  g.globalAlpha *= alpha;
  const t = o.t || 0, rip = o.ripple == null ? 1 : o.ripple;
  const strips = 24;
  const sh = (H - y) / strips;
  const px = pixelScale();
  for (let i = 0; i < strips; i++) {
    const dy = y + i * sh;
    const off = Math.sin(t * 2.2 + i * 1.7) * rip * (1 + i * 0.15);
    const srcY = y - (i + 1) * sh;
    if (srcY + sh < 0) break;
    g.save();
    g.translate(off, dy + sh);
    g.scale(1, -1);
    g.drawImage(Lr.canvas, 0, Math.max(0, srcY) * px, W * px, sh * px, 0, 0, W, sh);
    g.restore();
  }
  g.globalAlpha = 1;
  const tg = g.createLinearGradient(0, y, 0, H);
  tg.addColorStop(0, rgba(o.tint || "#0b1424", 0.15));
  tg.addColorStop(1, rgba(o.tint || "#0b1424", 0.6));
  g.fillStyle = tg;
  g.fillRect(0, y, W, H - y);
  g.restore();
}

// ---- motifs ------------------------------------------------------------------------------------------
// pawprints(g, points, glow, {color, halo}) - points: [{x, y, a (angle), s (size px), alpha}].
// The amber glowing pawprints (FILMS.md: core #ffb347, halo #ff7a1a).
export function pawprints(g, points, glowAmt = 1, o = {}) {
  const core = o.color || "#ffb347", halo = o.halo || "#ff7a1a";
  for (const p of points || []) {
    const a = p.alpha == null ? 1 : p.alpha;
    if (a <= 0.01) continue;
    const s = p.s || 10;
    g.save();
    g.translate(p.x, p.y);
    g.scale(1, p.flat == null ? 0.45 : p.flat);
    g.rotate(p.a || 0);
    glow(g, 0, 0, s * 3.2, halo, 0.5 * a * glowAmt);
    g.globalAlpha *= a;
    g.fillStyle = mix(core, "#fff3d0", 0.35);
    g.beginPath();
    g.moveTo(-s * 0.55, s * 0.35);
    g.bezierCurveTo(-s * 0.6, -s * 0.15, s * 0.6, -s * 0.15, s * 0.55, s * 0.35);
    g.quadraticCurveTo(0, s * 0.62, -s * 0.55, s * 0.35);
    g.fill();
    for (let k = 0; k < 4; k++) {
      const ang = -Math.PI / 2 + (k - 1.5) * 0.48;
      g.beginPath();
      g.ellipse(Math.cos(ang) * s * 0.78, Math.sin(ang) * s * 0.7 + s * 0.05, s * 0.18, s * 0.23, ang + Math.PI / 2, 0, TAU);
      g.fill();
    }
    g.restore();
    glow(g, p.x, p.y, s * 1.2, core, 0.6 * a * glowAmt);
  }
}
// A trail helper: n prints from (x0, y0) to (x1, y1), alternating left/right, appearing every
// `every` seconds from `start` and fading after `life` seconds. Returns the points for pawprints().
export function pawTrail(x0, y0, x1, y1, n, t, o = {}) {
  const start = o.start || 0, every = o.every == null ? 0.5 : o.every, life = o.life == null ? 3 : o.life;
  const s0 = o.s0 || 8, s1 = o.s1 == null ? s0 : o.s1;
  const a = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const appear = start + i * every;
    if (t < appear) break;
    const age = t - appear;
    const u = n > 1 ? i / (n - 1) : 0;
    const side = i % 2 ? 1 : -1;
    const s = lerp(s0, s1, u);
    out.push({
      x: lerp(x0, x1, u) + Math.cos(a) * side * s * 0.7,
      y: lerp(y0, y1, u) + Math.sin(a) * side * s * 0.3,
      a, s, // toes point along the trail
      alpha: Math.min(1, age * 4) * (life > 0 ? clamp(1 - (age - life + 1)) : 1),
    });
  }
  return out;
}

// portal(g, x, y, r, t, {color, core, intensity, tilt, open}) - the paw portal: a slowly rotating
// ring made of four toe-beans and a pad, light #ffcf7a at the edge into #9be7ff in the centre.
export function portal(g, x, y, r, t = 0, o = {}) {
  const edge = o.color || "#ffcf7a", core = o.core || "#9be7ff";
  const k = clamp(o.intensity == null ? 1 : o.intensity, 0, 2);
  const open = clamp(o.open == null ? 1 : o.open);
  if (open <= 0.001 || k <= 0) return;
  const tilt = o.tilt == null ? 0.35 : o.tilt;
  const R = r * open;
  glow(g, x, y, R * 4.5, edge, 0.35 * k);
  glow(g, x, y, R * 2.2, core, 0.45 * k);
  g.save();
  g.translate(x, y);
  g.scale(1, 1 - tilt);
  // swirling interior
  const ig = g.createRadialGradient(0, 0, 0, 0, 0, R);
  ig.addColorStop(0, rgba("#ffffff", 0.9 * k));
  ig.addColorStop(0.35, rgba(core, 0.75 * k));
  ig.addColorStop(0.85, rgba(mix(core, edge, 0.5), 0.35 * k));
  ig.addColorStop(1, rgba(edge, 0));
  g.fillStyle = ig;
  g.beginPath();
  g.arc(0, 0, R, 0, TAU);
  g.fill();
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  for (let i = 0; i < 5; i++) {
    const a0 = t * (0.8 + i * 0.15) + i * 1.3;
    g.strokeStyle = rgba(i % 2 ? core : edge, 0.35 * k);
    g.lineWidth = R * 0.05;
    g.beginPath();
    g.arc(0, 0, R * (0.3 + i * 0.13), a0, a0 + 1.6 + i * 0.2);
    g.stroke();
  }
  // the ring of toe-beans + pad
  const rot = t * 0.35;
  for (let i = 0; i < 5; i++) {
    const a = rot + (i / 5) * TAU;
    const px = Math.cos(a) * R * 0.92, py = Math.sin(a) * R * 0.92;
    const big = i === 0;
    const rr = R * (big ? 0.2 : 0.13);
    const bg = g.createRadialGradient(px, py, 0, px, py, rr * 2.2);
    bg.addColorStop(0, rgba("#ffffff", 0.95 * k));
    bg.addColorStop(0.35, rgba(edge, 0.85 * k));
    bg.addColorStop(1, rgba(edge, 0));
    g.fillStyle = bg;
    g.beginPath();
    g.arc(px, py, rr * 2.2, 0, TAU);
    g.fill();
  }
  // orbiting sparks
  for (let i = 0; i < 40; i++) {
    const a = -t * (0.6 + hash(i, 3) * 0.8) + hash(i, 4) * TAU;
    const d = R * (0.75 + hash(i, 5) * 0.4);
    const s = 1 + hash(i, 6) * 2;
    g.fillStyle = rgba(hash(i, 7) > 0.5 ? edge : core, 0.8 * k);
    g.fillRect(Math.cos(a) * d - s / 2, Math.sin(a) * d - s / 2, s, s);
  }
  g.restore();
}

// drawBell(g, x, y, size, {t, glint, string, broken}) - the brass bell close up (size = height px).
export function drawBell(g, x, y, size, o = {}) {
  const r = size / 2;
  if (o.string) {
    g.strokeStyle = "#a8322e";
    g.lineWidth = Math.max(1, size * 0.08);
    g.beginPath();
    g.moveTo(x - r * 1.6, y - r * 1.4);
    g.quadraticCurveTo(x, y - r * 0.6, x + (o.broken ? r * 0.9 : r * 1.6), y - r * (o.broken ? 0.9 : 1.4));
    g.stroke();
  }
  const bg = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r * 1.05);
  bg.addColorStop(0, "#fff2c0");
  bg.addColorStop(0.3, "#e3b452");
  bg.addColorStop(0.75, "#a7742a");
  bg.addColorStop(1, "#4d3110");
  g.fillStyle = bg;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  // a real jingle bell's slot: one horizontal cut with a round hole at each end
  g.strokeStyle = "rgba(40,22,4,0.9)";
  g.lineCap = "round";
  g.lineWidth = Math.max(0.6, r * 0.1);
  g.beginPath();
  g.moveTo(x - r * 0.58, y + r * 0.2);
  g.quadraticCurveTo(x, y + r * 0.3, x + r * 0.58, y + r * 0.2);
  g.stroke();
  g.fillStyle = "rgba(40,22,4,0.92)";
  g.beginPath();
  g.arc(x - r * 0.6, y + r * 0.2, Math.max(0.5, r * 0.13), 0, TAU);
  g.fill();
  g.beginPath();
  g.arc(x + r * 0.6, y + r * 0.2, Math.max(0.5, r * 0.13), 0, TAU);
  g.fill();
  g.fillStyle = "#6a4a1a";
  g.fillRect(x - r * 0.18, y - r * 1.2, r * 0.36, r * 0.3);
  bellGlint(g, x - r * 0.35, y - r * 0.4, size * 0.9, o.t || 0, { strength: o.glint == null ? 0.6 : o.glint });
}

// bellGlint(g, x, y, size, t, {color, strength}) - a four-point star sparkle with a soft glow.
export function bellGlint(g, x, y, size, t = 0, o = {}) {
  const k = o.strength == null ? 1 : o.strength;
  if (k <= 0) return;
  const color = o.color || "#fff2c0";
  const pulse = 0.7 + 0.3 * Math.sin(t * 5);
  glow(g, x, y, size * 1.4, color, 0.6 * k * pulse);
  g.save();
  g.translate(x, y);
  g.rotate(t * 0.4);
  g.globalCompositeOperation = "lighter";
  g.fillStyle = rgba("#ffffff", 0.9 * k * pulse);
  const L = size * pulse;
  for (let i = 0; i < 2; i++) {
    g.rotate(Math.PI / 2 * i);
    g.beginPath();
    g.moveTo(-L, 0);
    g.quadraticCurveTo(0, -L * 0.06, L, 0);
    g.quadraticCurveTo(0, L * 0.06, -L, 0);
    g.fill();
  }
  g.restore();
}

// toyMouse(g, x, y, size, {facing}) - grey felt mouse, pink ear, frayed string tail, one stitched eye.
export function toyMouse(g, x, y, size, o = {}) {
  const f = o.facing === -1 ? -1 : 1;
  g.save();
  g.translate(x, y);
  g.scale(f * size / 40, size / 40);
  g.strokeStyle = "#cfc6b8";
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(-18, -4);
  g.bezierCurveTo(-30, -2, -32, 8, -44, 4);
  g.stroke();
  const gr = g.createRadialGradient(-2, -10, 2, 0, -6, 22);
  gr.addColorStop(0, "#a9a6a2");
  gr.addColorStop(1, "#6c6965");
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(-20, 0);
  g.bezierCurveTo(-20, -16, 6, -18, 20, -4);
  g.quadraticCurveTo(22, 0, 16, 0);
  g.closePath();
  g.fill();
  g.fillStyle = "#e7a1a8";
  g.beginPath();
  g.ellipse(6, -13, 5, 6, -0.3, 0, TAU);
  g.fill();
  g.strokeStyle = "#2a2a2a";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(11, -7); g.lineTo(14, -5);
  g.moveTo(14, -7); g.lineTo(11, -5);
  g.stroke();
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.fillRect(-20, 0, 40, 1.5);
  g.restore();
}

// cardboardBox(g, x, y, w, h, {wet, text}) - the soggy box; x, y = bottom centre.
export function cardboardBox(g, x, y, w, h, o = {}) {
  const base = "#9a7448";
  const wet = clamp(o.wet || 0);
  const c = mix(base, "#4a3420", wet * 0.5);
  g.fillStyle = shade(c, -0.15);
  g.fillRect(x - w / 2, y - h, w, h);
  g.fillStyle = c;
  g.beginPath();
  g.moveTo(x - w / 2, y - h);
  g.lineTo(x - w / 2 - w * 0.12, y - h - h * 0.35);
  g.lineTo(x - w * 0.05, y - h - h * 0.2);
  g.lineTo(x, y - h);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(x + w / 2, y - h);
  g.lineTo(x + w / 2 + w * 0.1, y - h - h * 0.3);
  g.lineTo(x + w * 0.05, y - h - h * 0.22);
  g.lineTo(x, y - h);
  g.closePath();
  g.fill();
  if (wet > 0) {
    const wg = g.createLinearGradient(0, y - h, 0, y - h * 0.4);
    wg.addColorStop(0, `rgba(40,25,10,${0.5 * wet})`);
    wg.addColorStop(1, "rgba(40,25,10,0)");
    g.fillStyle = wg;
    g.fillRect(x - w / 2, y - h, w, h * 0.6);
  }
  if (o.text) {
    g.fillStyle = "rgba(20,20,30,0.85)";
    g.font = `700 ${Math.round(h * 0.28)}px "Comic Sans MS", "Segoe Print", cursive`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(o.text, x, y - h * 0.5);
  }
}

