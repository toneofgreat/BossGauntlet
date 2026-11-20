// src/games/cats/scripts/filmenv.js - skies, weather, landscape, buildings, props, light and the
// story's magic motifs (pawprints, the paw portal, the bell). Re-exported by filmkit.js.
// Every painter is a pure function of its arguments; static art is cached with sprite() or as a
// procedural texture (filmtex.js, re-exported from here). Photoreal pass ("v2"):
//  - light is physically motivated: inverse-square pools, Mie haze round the sun, Rayleigh sky,
//    horizon brightening, cool ambient vs warm key, soft contact shadows / AO;
//  - surfaces carry real material detail from cached textures (bark, siding, shingles, asphalt...);
//  - weather has depth layers (far / mid / near rain, motion-blurred streaks, splash crowns);
//  - all expensive per-pixel work happens when a cache is built, never per frame.
// New helpers: groundPlane texRect texFill lightPool shadowBlob aoEdge volumetricBeam bokehLights
// heatShimmer cloudLayer3d reflectStreak (see filmkit.js header for one-line signatures).

import {
  TAU, clamp, lerp, smooth, hash, noise, fbm, rng, mix, rgba, shade, sprite, layer, glow, glowSprite,
  spline, ellipsePath, roundRect, pixelScale, parseColor,
} from "./filmcore.js";
import { texture, texPattern, texRect, texFill, texFbm, texNoise, texRidged, texBake, groundPlane } from "./filmtex.js";
export * from "./filmtex.js";

// ---- small shared sprites ---------------------------------------------------------------------------
// Inverse-square light falloff I = 1 / (1 + (d/r0)^2), windowed to 0 at the edge: a real lamp pool,
// not a linear blob. White; tinted at draw time through a coloured copy cached per colour.
function poolSprite(color, hard = 0) {
  return sprite("pool:" + color + ":" + hard, 128, 128, (s) => {
    const gr = s.createRadialGradient(64, 64, 0, 64, 64, 64);
    const k = 7 + hard * 10;
    for (let i = 0; i <= 12; i++) {
      const d = i / 12;
      const I = (1 / (1 + (d * k) * (d * k))) * (1 - d * d) * (1 - d * d);
      gr.addColorStop(d, rgba(color, clamp(I)));
    }
    s.fillStyle = gr;
    s.fillRect(0, 0, 128, 128);
  });
}
// soft shadow blob: dense umbra core + wide penumbra
function shadowSprite(color) {
  return sprite("shadow:" + color, 128, 64, (s) => {
    const gr = s.createRadialGradient(64, 32, 0, 64, 32, 64);
    gr.addColorStop(0, rgba(color, 1));
    gr.addColorStop(0.35, rgba(color, 0.85));
    gr.addColorStop(0.65, rgba(color, 0.35));
    gr.addColorStop(1, rgba(color, 0));
    s.save();
    s.scale(1, 0.5);
    s.translate(0, 32);
    s.fillStyle = gr;
    s.fillRect(0, -32, 128, 128);
    s.restore();
  });
}
// bokeh disc: flat body, brighter rim (spherical aberration), soft edge
function bokehSprite(color, blades = 0) {
  return sprite("bokeh:" + color + ":" + blades, 64, 64, (s) => {
    const p = new Path2D();
    if (blades >= 5) {
      for (let i = 0; i < blades; i++) {
        const a = (i / blades) * TAU + 0.3;
        const x = 32 + Math.cos(a) * 29, y = 32 + Math.sin(a) * 29;
        if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
      }
      p.closePath();
    } else p.arc(32, 32, 29, 0, TAU);
    const gr = s.createRadialGradient(32, 32, 0, 32, 32, 30);
    gr.addColorStop(0, rgba(color, 0.42));
    gr.addColorStop(0.7, rgba(color, 0.5));
    gr.addColorStop(0.9, rgba(color, 0.85));
    gr.addColorStop(1, rgba(color, 0.25));
    s.fillStyle = gr;
    s.fill(p);
  });
}
const canvasSize = (g) => [g.canvas.width / pixelScale(), g.canvas.height / pixelScale()];

// ---- sky & light -----------------------------------------------------------------------------------
// sky(g, W, H, {top, mid, bottom, horizon, sun:{x,y,color}, night, haze, glow})
// A physically motivated sky: deep Rayleigh blue (or night indigo) overhead easing non-linearly to a
// brighter, desaturated band at the horizon (more air to look through), with Mie forward-scatter
// haze around the sun. `horizon` (0..1 of H) is where `bottom` is reached; below it the colour holds.
// `glow` = colour of town light pollution at a night horizon.
export function sky(g, W, H, o = {}) {
  const top = o.top || "#0b1424", bottom = o.bottom || "#2a3a52", mid = o.mid || mix(top, bottom, 0.5);
  const hz = clamp(o.horizon == null ? 0.62 : o.horizon, 0.05, 1);
  const hy = H * hz;
  const hazeAmt = o.haze == null ? 0.5 : o.haze;
  const night = !!o.night;
  const gr = g.createLinearGradient(0, 0, 0, hy);
  gr.addColorStop(0, shade(top, -0.06));
  gr.addColorStop(0.18, top);
  gr.addColorStop(0.42, mix(top, mid, 0.7));
  gr.addColorStop(0.62, mid);
  gr.addColorStop(0.84, mix(mid, bottom, 0.65));
  gr.addColorStop(0.95, bottom);
  // horizon brightening: the thick air near the horizon scatters more light (less at night)
  gr.addColorStop(1, mix(bottom, night ? "#5a6a8a" : "#ffffff", hazeAmt * (night ? 0.12 : 0.22)));
  g.fillStyle = gr;
  g.fillRect(0, 0, W, hy + 1);
  g.fillStyle = bottom;
  g.fillRect(0, hy, W, H - hy);
  // a thin bright skin right at the horizon line
  const hb = g.createLinearGradient(0, hy - H * 0.12, 0, hy);
  hb.addColorStop(0, rgba(bottom, 0));
  hb.addColorStop(1, rgba(mix(bottom, night ? "#8a9ab8" : "#fff8ec", 0.5), (night ? 0.12 : 0.28) * hazeAmt));
  g.fillStyle = hb;
  g.fillRect(0, hy - H * 0.12, W, H * 0.12 + 1);
  if (night && o.glow !== false) {
    const lc = typeof o.glow === "string" ? o.glow : "#c08a5a";
    const lg = g.createLinearGradient(0, hy - H * 0.22, 0, hy);
    lg.addColorStop(0, rgba(lc, 0));
    lg.addColorStop(1, rgba(lc, typeof o.glow === "string" ? 0.22 : 0.07));
    g.fillStyle = lg;
    g.fillRect(0, hy - H * 0.22, W, H * 0.22 + 1);
  }
  if (o.sun) {
    // Mie haze: a broad warm forward-scatter lobe, stronger the lower the sun sits
    const s = o.sun, sc = s.color || "#ffd9a0";
    const low = clamp(1 - (hy - s.y) / (hy + 1));
    g.save();
    g.globalCompositeOperation = "screen";
    const r1 = Math.max(W, H) * (0.55 + low * 0.35);
    const mg = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, r1);
    mg.addColorStop(0, rgba(sc, 0.55 * hazeAmt + 0.2));
    mg.addColorStop(0.08, rgba(sc, 0.32 * hazeAmt + 0.08));
    mg.addColorStop(0.3, rgba(sc, 0.12 * hazeAmt));
    mg.addColorStop(1, rgba(sc, 0));
    g.fillStyle = mg;
    g.fillRect(0, 0, W, hy + 1);
    // horizon band warmed toward the sun's azimuth
    const bg = g.createRadialGradient(s.x, hy, 0, s.x, hy, W * 0.8);
    bg.addColorStop(0, rgba(sc, 0.35 * low * hazeAmt));
    bg.addColorStop(1, rgba(sc, 0));
    g.save();
    g.translate(0, hy);
    g.scale(1, 0.3);
    g.fillStyle = bg;
    g.fillRect(0, -hy / 0.3, W, hy / 0.3 + 2);
    g.restore();
    g.restore();
  }
}

// sunGlow(g, x, y, r, color, strength) - a sun as a lens sees it: a clipped white disc with a
// warm limb, a tight halo, a wide exponential Mie bloom and a faint very-wide veil.
export function sunGlow(g, x, y, r, color = "#ffd9a0", strength = 1) {
  const k = clamp(strength, 0, 2);
  glow(g, x, y, r * 26, color, 0.1 * k);
  glow(g, x, y, r * 11, color, 0.2 * k);
  glow(g, x, y, r * 4.5, mix(color, "#ffffff", 0.3), 0.42 * k);
  glow(g, x, y, r * 1.9, "#ffffff", 0.75 * k);
  g.save();
  g.globalAlpha *= clamp(k);
  const dg = g.createRadialGradient(x, y, 0, x, y, r * 0.7);
  dg.addColorStop(0, "#ffffff");
  dg.addColorStop(0.75, mix(color, "#ffffff", 0.85));
  dg.addColorStop(1, rgba(mix(color, "#ffffff", 0.6), 0));
  g.fillStyle = dg;
  g.beginPath();
  g.arc(x, y, r * 0.7, 0, TAU);
  g.fill();
  g.restore();
}

// moon(g, x, y, r, {glow, halo, phase}) - a photographic moon: maria, ray craters and small craters
// from cached noise, limb darkening, a cool tight halo. phase 0..1 (1 = full, default) shades the
// terminator from the right.
export function moon(g, x, y, r, o = {}) {
  const gl = o.glow == null ? 1 : o.glow;
  const halo = o.halo || "#9fb6d8";
  glow(g, x, y, r * 9, halo, 0.12 * gl);
  glow(g, x, y, r * 3.6, halo, 0.22 * gl);
  glow(g, x, y, r * 1.7, "#e8eef8", 0.35 * gl);
  const ph = Math.round(clamp(o.phase == null ? 1 : o.phase) * 20) / 20;
  const disc = texBake("moon:" + ph, 192, 192, (u, v, out) => {
    const dx = u * 2 - 1, dy = v * 2 - 1, d2 = dx * dx + dy * dy;
    if (d2 > 1) { out[3] = 0; return; }
    const nz = Math.sqrt(1 - d2);
    const mare = clamp(texFbm(u * 2.2 + 3.1, v * 2.2, 41, 5) * 1.6 + 0.15);
    const vo = texNoise(u * 22, v * 22, 43) * 0.5 + texNoise(u * 60, v * 60, 44) * 0.25;
    const rays = Math.max(0, 1 - Math.hypot(u - 0.42, v - 0.78) * 7) * 0.3;
    let a = 0.82 - mare * 0.32 + vo * 0.07 + rays;
    const limb = 0.5 + 0.5 * Math.pow(nz, 0.55);
    let lit = 1;
    if (ph < 1) {
      const sx = Math.cos((1 - ph) * Math.PI), sz = Math.sin((1 - ph) * Math.PI);
      const ndl = -dx * sx + nz * sz;
      lit = clamp(ndl * 6 + 0.5);
    }
    a = a * limb * (0.04 + 0.96 * lit);
    out[0] = 250 * a; out[1] = 246 * a; out[2] = 232 * a;
    out[3] = 255 * clamp((1 - Math.sqrt(d2)) * 96);
  });
  g.drawImage(disc, x - r, y - r, r * 2, r * 2);
}

// stars(g, W, H, seed, density, twinkleT, {yMax, color, milky}) - a seeded star field with a
// power-law magnitude spread and real stellar colours (blue-white to orange). The faint field is
// cached; only the bright stars twinkle (scintillation). milky:true adds the Milky Way band.
const STAR_COLS = ["#9bb0ff", "#cad7ff", "#f8f7ff", "#fff4ea", "#ffe8c0", "#ffd2a1", "#ffcc6f"];
export function stars(g, W, H, seed = 1, density = 1, twinkleT = 0, o = {}) {
  const yMax = o.yMax == null ? H * 0.75 : o.yMax;
  const n = Math.round(160 * density * (W * H) / (960 * 540));
  const key = `starfield:${seed}:${n}:${Math.round(W)}x${Math.round(H)}:${Math.round(yMax)}:${o.color || ""}:${o.milky ? 1 : 0}`;
  const field = sprite(key, W, H, (s) => {
    if (o.milky) {
      s.save();
      s.translate(W * 0.5, yMax * 0.45);
      s.rotate(-0.55);
      s.globalCompositeOperation = "lighter";
      const neb = texture("nebula", { seed: seed + 3, colors: ["#1a2440", "#4a4a6a", "#b8a890"] });
      s.globalAlpha = 0.28;
      s.drawImage(neb, -W * 0.9, -yMax * 0.3, W * 1.8, yMax * 0.6);
      s.globalAlpha = 0.22;
      s.drawImage(neb, -W * 0.7, -yMax * 0.12, W * 1.4, yMax * 0.24);
      s.restore();
      // extra faint dust of stars along the band
      const Rm = rng("milky" + seed);
      s.fillStyle = "#e8ecff";
      for (let i = 0; i < n * 3; i++) {
        const t = Rm() * 2 - 1, off = (Rm() + Rm() + Rm() - 1.5) * yMax * 0.12;
        const px = W * 0.5 + Math.cos(-0.55) * t * W * 0.9 - Math.sin(-0.55) * off;
        const py = yMax * 0.45 + Math.sin(-0.55) * t * W * 0.9 + Math.cos(-0.55) * off;
        s.globalAlpha = 0.15 + Rm() * 0.35;
        s.fillRect(px, py, 0.6, 0.6);
      }
    }
    const R = rng("stars" + seed);
    for (let i = 0; i < n; i++) {
      const x = R() * W, y = Math.pow(R(), 1.3) * yMax;
      const m = Math.pow(R(), 3.2);
      const c = o.color || STAR_COLS[Math.floor(R() * STAR_COLS.length)];
      R(); R();
      if (m > 0.55) continue; // bright ones are drawn live (twinkle)
      const ext = 1 - y / (yMax * 1.15); // extinction near the horizon
      s.globalAlpha = clamp((0.18 + m * 1.4) * ext);
      s.fillStyle = c;
      const sz = 0.55 + m * 1.6;
      s.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
  });
  g.drawImage(field, 0, 0, W, H);
  const R = rng("stars" + seed);
  g.save();
  for (let i = 0; i < n; i++) {
    const x = R() * W, y = Math.pow(R(), 1.3) * yMax;
    const m = Math.pow(R(), 3.2);
    const c = o.color || STAR_COLS[Math.floor(R() * STAR_COLS.length)];
    const sp = 1.5 + R() * 3, ph = R() * TAU;
    if (m <= 0.55) continue;
    const ext = 1 - y / (yMax * 1.15);
    const tw = 0.6 + 0.4 * Math.sin(twinkleT * sp + ph) * Math.sin(twinkleT * sp * 0.37 + i);
    const a = clamp((0.5 + m * 0.5) * tw * ext);
    g.globalAlpha = a;
    g.fillStyle = c;
    const sz = 1 + m * 1.4;
    g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    glow(g, x, y, 3 + m * 7, c, 0.45 * a);
    if (m > 0.85) {
      g.globalAlpha = a * 0.4;
      g.fillRect(x - m * 6, y - 0.3, m * 12, 0.6);
      g.fillRect(x - 0.3, y - m * 6, 0.6, m * 12);
    }
  }
  g.restore();
}

// ---- volumetric clouds -------------------------------------------------------------------------------
// A cumulus density field (domed top, flat base, fbm erosion) lit by marching toward the sun, so
// tops facing the light are bright, bellies are shaded and thin edges glow. Cached per (seed,
// variant, colours, quantised sun angle, kind).
function volCloud(seed, i, lit, shadeC, ang, kind = "cumulus") {
  const strat = kind === "stratus";
  const w = 240, h = strat ? 80 : 124;
  const L = parseColor(lit), S = parseColor(shadeC);
  const sx = Math.cos(ang), sy = Math.sin(ang);
  let dens = null;
  const buildDens = () => {
    const R = rng(`vc${seed}:${i}:${kind}`);
    const base = strat ? 0.72 : 0.84;
    const puffs = [];
    const np = strat ? 14 : 9 + Math.floor(R() * 5);
    for (let k = 0; k < np; k++) {
      const cx = 0.14 + R() * 0.72;
      const mid = 1 - Math.abs(cx - 0.5) * 1.7;
      const r = (strat ? 0.1 : 0.12) + R() * (strat ? 0.08 : 0.12) + mid * (strat ? 0.04 : 0.16);
      const cy = base - r * (strat ? 0.25 : 0.55) - R() * (strat ? 0.04 : 0.12) * mid;
      puffs.push([cx, cy, r]);
    }
    // cauliflower hierarchy: smaller billows riding on the upper surface of each big puff, so the
    // outline breaks into many turrets of different sizes instead of a few cotton balls
    if (!strat) {
      const big = puffs.length;
      for (let k = 0; k < big; k++) {
        const [px, py, pr] = puffs[k];
        const nc = 2 + Math.floor(R() * 3);
        for (let j = 0; j < nc; j++) {
          const an = -Math.PI / 2 + (R() - 0.5) * 2.4;
          const rr = pr * (0.3 + R() * 0.28);
          puffs.push([px + Math.cos(an) * pr * 0.62 * (h / w) * 2.2, py + Math.sin(an) * pr * 0.55, rr]);
        }
      }
    }
    const asp = w / h;
    const off = R() * 40;
    dens = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        let th = 0;
        for (let k = 0; k < puffs.length; k++) {
          const P = puffs[k];
          const dx = (u - P[0]) * asp, dy = (v - P[1]) * (strat ? 2.2 : 1.15);
          const q = 1 - (dx * dx + dy * dy) / (P[2] * P[2] * asp * asp * 0.16);
          if (q > th) th = q;
        }
        if (th <= 0) continue;
        const bill = 1 - Math.abs(texNoise(u * 11 + off, v * 5.5, seed * 7 + i));
        const bill2 = 1 - Math.abs(texNoise(u * 26 + off, v * 13, seed * 7 + i + 1));
        const n = texFbm(u * 4 + off, v * 2, seed * 13 + i, 3);
        const core = clamp(th / 0.5); // rises inside the puff: a billowing contour that still frays at the edge
        let d = core * core * (3 - 2 * core) * 1.15 - 0.3 + (bill - 0.5) * 0.55 + (bill2 - 0.5) * 0.3 + n * 0.22 + th * 0.3;
        d *= clamp((base + 0.02 - v) / 0.06);
        dens[y * w + x] = clamp(d);
      }
    }
  };
  return texBake(`vcloud4:${seed}:${i}:${lit}:${shadeC}:${ang.toFixed(2)}:${kind}`, w, h, (u, v, out, x, y) => {
    if (!dens) buildDens();
    const d = dens[y * w + x];
    if (d <= 0.003) { out[3] = 0; return; }
    // light: march toward the sun (self-shadowing) ...
    let acc = 0;
    for (let k = 1; k <= 7; k++) {
      const px = Math.round(x + sx * k * 5), py = Math.round(y + sy * k * 5);
      if (px < 0 || py < 0 || px >= w || py >= h) break;
      acc += dens[py * w + px];
    }
    const T = Math.exp(-acc * 0.55);
    // ... and skylight from straight above (ambient occlusion by the cloud mass overhead)
    let up = 0;
    for (let k = 1; k <= 4; k++) { const py = y - k * 6; if (py < 0) break; up += dens[py * w + x]; }
    const sky = Math.exp(-up * 0.6);
    const bump = (1 - Math.abs(texNoise(u * 30, v * 15, 5))) - 0.5; // cauliflower relief
    let l = clamp(T * 0.72 + sky * 0.28 + bump * 0.18 * T);
    l *= 1 - clamp((v - 0.6) / 0.3) * 0.3; // darker flat belly
    l = clamp(l + clamp(1 - d * 2.5) * T * T * 0.12); // thin, sunlit edges glow a little
    out[0] = S[0] + (L[0] - S[0]) * l; out[1] = S[1] + (L[1] - S[1]) * l; out[2] = S[2] + (L[2] - S[2]) * l;
    // soft, translucent fringe: thin cloud lets the sky through (no cut-out outline)
    const a = clamp((d - 0.03) / 0.5);
    out[3] = 255 * a * a * (3 - 2 * a);
  });
}
const quantAng = (a) => Math.round(a / (TAU / 8)) * (TAU / 8);
// clouds(g, W, H, t, {seed, color, shade, count, y, spread, speed, scale, alpha, sun:{x,y}, kind})
// Drifting volumetric clouds (lit tops, shaded bellies). Without `sun` the light comes from above.
export function clouds(g, W, H, t = 0, o = {}) {
  const seed = o.seed || 1, count = o.count || 6;
  const color = o.color || "#c8d0dc", shadeC = o.shade || mix(color, "#2a3442", 0.55);
  const R = rng("clouds" + seed);
  const y0 = o.y == null ? H * 0.2 : o.y, spread = o.spread == null ? H * 0.15 : o.spread;
  const speed = o.speed == null ? 8 : o.speed, sc = o.scale || 1;
  const kind = o.kind || "cumulus";
  g.save();
  g.globalAlpha *= o.alpha == null ? 1 : o.alpha;
  for (let i = 0; i < count; i++) {
    const depth = 0.5 + R();
    const w = 360 * sc * depth, h = (kind === "stratus" ? 110 : 165) * sc * depth;
    const span = W + w;
    const x = ((R() * span + t * speed * depth) % span + span) % span - w;
    const y = y0 + (R() - 0.5) * 2 * spread - h * 0.5;
    const ang = o.sun ? quantAng(Math.atan2(o.sun.y - (y + h * 0.5), o.sun.x - (x + w * 0.5))) : quantAng(-Math.PI / 2 - 0.35);
    const spr = volCloud(seed, i % 4, color, shadeC, ang, kind);
    g.drawImage(spr, x, y, w, h);
  }
  g.restore();
}
// cloudLayer3d(g, W, H, t, {seed, y, horizon, sun:{x,y}, count, color, shade, haze, speed, scale, alpha, kind})
// A cloud deck in perspective: small, flattened, hazy clouds near the horizon growing into big
// close ones higher up (y = the nearest row). Drift speed scales with nearness (parallax).
export function cloudLayer3d(g, W, H, t = 0, o = {}) {
  const seed = o.seed || 1, count = o.count || 9;
  const color = o.color || "#f4f1ea", shadeC = o.shade || mix(color, "#4a5468", 0.6);
  const hzY = o.horizon == null ? H * 0.58 : o.horizon;
  const yNear = o.y == null ? H * 0.12 : o.y;
  const hazeC = o.haze || mix(color, "#a8b8cc", 0.5);
  const speed = o.speed == null ? 6 : o.speed, sc = o.scale || 1;
  const kind = o.kind || "cumulus";
  const R = rng("deck" + seed);
  const items = [];
  for (let i = 0; i < count; i++) items.push([Math.pow((i + R() * 0.8) / count, 1.3), R(), R()]);
  items.sort((a, b) => a[0] - b[0]);
  g.save();
  const baseA = g.globalAlpha * (o.alpha == null ? 1 : o.alpha);
  items.forEach(([z, r1, r2], i) => {
    const near = 0.18 + z * 0.82;
    const w = 420 * sc * near, h = (kind === "stratus" ? 100 : 170) * sc * near * (0.55 + near * 0.45);
    const cy = lerp(hzY - h * 0.35, yNear + h * 0.2, z);
    const span = W + w;
    const x = ((r1 * span + t * speed * near) % span + span) % span - w;
    const ang = o.sun ? quantAng(Math.atan2(o.sun.y - cy, o.sun.x - (x + w / 2))) : quantAng(-Math.PI / 2 - 0.35);
    const lc = mix(color, hazeC, (1 - z) * 0.6), scC = mix(shadeC, hazeC, (1 - z) * 0.7);
    const spr = volCloud(seed + 50, (i + Math.floor(r2 * 4)) % 5, lc, scC, ang, kind);
    g.globalAlpha = baseA * (0.55 + z * 0.45);
    g.drawImage(spr, x, cy - h * 0.6, w, h);
  });
  g.restore();
}

// godRays(g, x, y, W, H, {color, count, strength, t, angle, spread, length, seed})
// Crepuscular shafts from (x, y): many shafts of varying width broken up by drifting occlusion
// noise, falling off with distance; rendered at quarter resolution so they come out soft.
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
  const n = count * 3;
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const a = ang + (u - 0.5) * spread + (R() - 0.5) * 0.05 + Math.sin(t * 0.25 + i * 2.1) * 0.012;
    const occl = 0.5 + 0.5 * texNoise(i * 0.37 + t * 0.12, 3.3, o.seed || 3);
    const wdt = (0.01 + R() * 0.035) * (0.7 + 0.3 * Math.sin(t * 0.4 + i));
    const alpha = strength * (0.3 + 0.7 * occl * occl) * (0.55 + R() * 0.6) * (1 - Math.abs(u - 0.5) * 0.6);
    if (alpha < 0.004) continue;
    const ex = sx + Math.cos(a) * len, ey = sy + Math.sin(a) * len;
    const gr = s.createLinearGradient(sx, sy, ex, ey);
    gr.addColorStop(0, rgba(color, alpha));
    gr.addColorStop(0.2, rgba(color, alpha * 0.6));
    gr.addColorStop(0.55, rgba(color, alpha * 0.2));
    gr.addColorStop(1, rgba(color, 0));
    s.fillStyle = gr;
    s.beginPath();
    s.moveTo(sx, sy);
    s.lineTo(sx + Math.cos(a - wdt) * len, sy + Math.sin(a - wdt) * len);
    s.lineTo(sx + Math.cos(a + wdt) * len, sy + Math.sin(a + wdt) * len);
    s.closePath();
    s.fill();
  }
  // in-scattering glow at the source
  const sg = s.createRadialGradient(sx, sy, 0, sx, sy, len * 0.35);
  sg.addColorStop(0, rgba(color, strength * 0.35));
  sg.addColorStop(1, rgba(color, 0));
  s.fillStyle = sg;
  s.fillRect(0, 0, Lr.W, Lr.H);
  g.save();
  g.globalCompositeOperation = "lighter";
  g.imageSmoothingEnabled = true;
  g.drawImage(Lr.canvas, 0, 0, Lr.canvas.width, Lr.canvas.height, 0, 0, Lr.W * k, Lr.H * k);
  g.restore();
}

// volumetricBeam(g, x, y, angle, length, spread, {color, intensity, t, width0, noise, seed})
// A light cone through participating media (flashlight, streetlamp, window shaft): nested soft
// cones, inverse-distance falloff, drifting dust/mist breaking it up. Quarter-res, additive.
export function volumetricBeam(g, x, y, angle, length, spread = 0.5, o = {}) {
  const [W, H] = canvasSize(g);
  const k = 4;
  const Lr = layer(Math.ceil(W / k), Math.ceil(H / k), "vbeam");
  const s = Lr.g;
  const color = o.color || "#fff2d0", I = o.intensity == null ? 0.5 : o.intensity;
  if (I <= 0) return;
  const t = o.t || 0;
  const L = length / k, w0 = (o.width0 == null ? 6 : o.width0) / k;
  s.save();
  s.translate(x / k, y / k);
  s.rotate(angle);
  const cones = [[1, 0.28], [0.72, 0.36], [0.45, 0.5], [0.22, 0.6]];
  for (const [sp, a] of cones) {
    const half = Math.tan(spread * sp / 2) * L;
    const gr = s.createLinearGradient(0, 0, L, 0);
    gr.addColorStop(0, rgba(color, a * I));
    gr.addColorStop(0.12, rgba(color, a * I * 0.75));
    gr.addColorStop(0.4, rgba(color, a * I * 0.35));
    gr.addColorStop(0.75, rgba(color, a * I * 0.12));
    gr.addColorStop(1, rgba(color, 0));
    s.fillStyle = gr;
    s.beginPath();
    s.moveTo(0, -w0 / 2);
    s.lineTo(L, -half);
    s.quadraticCurveTo(L * 1.08, 0, L, half);
    s.lineTo(0, w0 / 2);
    s.closePath();
    s.fill();
  }
  s.restore();
  if (o.noise !== false) {
    const pat = texPattern(s, "cloud", { seed: o.seed || 5, cover: 0.45 });
    const sc = 0.5;
    if (pat.setTransform && typeof DOMMatrix !== "undefined") pat.setTransform(new DOMMatrix([sc, 0, 0, sc * 0.6, -t * 3, t * 1.2]));
    s.globalCompositeOperation = "destination-out";
    s.globalAlpha = o.noise == null ? 0.45 : o.noise;
    s.fillStyle = pat;
    s.fillRect(0, 0, Lr.W, Lr.H);
    s.globalAlpha = 1;
    s.globalCompositeOperation = "source-over";
  }
  g.save();
  g.globalCompositeOperation = "lighter";
  g.imageSmoothingEnabled = true;
  g.drawImage(Lr.canvas, 0, 0, Lr.canvas.width, Lr.canvas.height, 0, 0, Lr.W * k, Lr.H * k);
  g.restore();
}

// lightPool(g, x, y, r, color, {intensity, flat, mode, hard}) - inverse-square light on a surface
// (flat < 1 squashes it onto a floor in perspective). Additive by default.
export function lightPool(g, x, y, r, color = "#ffd8a0", o = {}) {
  const I = o.intensity == null ? 1 : o.intensity;
  if (I <= 0.002 || r <= 0) return;
  const spr = poolSprite(color, o.hard || 0);
  const flat = o.flat == null ? 1 : o.flat;
  g.save();
  g.globalCompositeOperation = o.mode || "lighter";
  g.globalAlpha *= clamp(I);
  g.drawImage(spr, x - r, y - r * flat, r * 2, r * 2 * flat);
  if (I > 1) { g.globalAlpha = clamp(I - 1); g.drawImage(spr, x - r * 0.6, y - r * 0.6 * flat, r * 1.2, r * 1.2 * flat); }
  g.restore();
}
// shadowBlob(g, x, y, w, h, {alpha, color, soft}) - soft contact shadow centred at (x, y),
// w x h = umbra half-extents; a wider penumbra fades out around it.
export function shadowBlob(g, x, y, w, h, o = {}) {
  const a = o.alpha == null ? 0.5 : o.alpha;
  if (a <= 0) return;
  const spr = shadowSprite(o.color || "#05060a");
  const soft = o.soft == null ? 1 : o.soft;
  g.save();
  g.globalAlpha *= a * 0.55;
  g.drawImage(spr, x - w * (1 + soft), y - h * (1 + soft), w * 2 * (1 + soft), h * 2 * (1 + soft));
  g.globalAlpha = (g.globalAlpha / 0.55) * 0.75;
  g.drawImage(spr, x - w * 0.8, y - h * 0.7, w * 1.6, h * 1.4);
  g.restore();
}
// aoEdge(g, x0, y0, x1, y1, {width, alpha, side, color}) - ambient occlusion along a contact line
// (wall meets floor, object meets ground): dark at the line, fading over `width` px. side = +1
// darkens to the left of the direction (x0,y0)->(x1,y1) (i.e. upward for a left-to-right line),
// -1 the other side, 0 both.
export function aoEdge(g, x0, y0, x1, y1, o = {}) {
  const w = o.width == null ? 14 : o.width, a = o.alpha == null ? 0.5 : o.alpha;
  const side = o.side == null ? 1 : o.side;
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
  const nx = dy / l, ny = -dx / l;
  const c = o.color || "#000000";
  const one = (sgn) => {
    const gr = g.createLinearGradient(x0, y0, x0 + nx * w * sgn, y0 + ny * w * sgn);
    gr.addColorStop(0, rgba(c, a));
    gr.addColorStop(0.3, rgba(c, a * 0.45));
    gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.lineTo(x1 + nx * w * sgn, y1 + ny * w * sgn);
    g.lineTo(x0 + nx * w * sgn, y0 + ny * w * sgn);
    g.closePath();
    g.fill();
  };
  g.save();
  if (side >= 0) one(1);
  if (side <= 0) one(-1);
  g.restore();
}
// reflectStreak(g, x, y, len, color, alpha, {t, width}) - a light's reflection on wet ground: a
// vertical streak stretched toward the viewer, broken into ripple bands.
export function reflectStreak(g, x, y, len = 80, color = "#ffc070", alpha = 0.7, o = {}) {
  if (alpha <= 0) return;
  const t = o.t || 0, w = o.width || len * 0.16;
  const spr = glowSprite(color);
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 9; i++) {
    const u = i / 8;
    const yy = y + u * len;
    const wob = Math.sin(t * 3.1 + i * 1.9) * w * 0.25;
    const ww = w * (1 - u * 0.4) * (0.7 + 0.3 * Math.sin(t * 5 + i * 2.7));
    g.globalAlpha = alpha * (1 - u) * 0.5;
    g.drawImage(spr, x - ww + wob, yy - len * 0.09, ww * 2, len * 0.18);
  }
  g.globalAlpha = alpha * 0.6;
  g.drawImage(spr, x - w * 0.35, y - 2, w * 0.7, len * 0.9);
  g.restore();
}
// bokehLights(g, W, H, t, {seed, count, colors, area:[x,y,w,h], size, alpha, blades, lights:[{x,y,r,color}]})
// Out-of-focus point lights as a lens renders them: flat discs (or n-gons) with brighter rims.
export function bokehLights(g, W, H, t = 0, o = {}) {
  const seed = o.seed || 2, n = o.count == null ? 12 : o.count;
  const colors = o.colors || ["#ffcf8a", "#ffe6c0", "#ffb070"];
  const [ax, ay, aw, ah] = o.area || [0, 0, W, H];
  const sz = o.size || 22, A = o.alpha == null ? 0.5 : o.alpha;
  g.save();
  g.globalCompositeOperation = "lighter";
  const list = o.lights || [];
  for (const L of list) {
    g.globalAlpha = A * (L.alpha == null ? 1 : L.alpha);
    const r = L.r || sz;
    g.drawImage(bokehSprite(L.color || colors[0], o.blades || 0), L.x - r, L.y - r, r * 2, r * 2);
  }
  for (let i = 0; i < n; i++) {
    const r = sz * (0.5 + hash(i, seed) * 0.9);
    const px = ax + hash(i + 0.1, seed) * aw + Math.sin(t * 0.2 + i) * 6;
    const py = ay + hash(i + 0.2, seed) * ah + Math.cos(t * 0.17 + i * 2) * 4;
    g.globalAlpha = A * (0.35 + 0.65 * hash(i + 0.3, seed)) * (0.85 + 0.15 * Math.sin(t * 0.8 + i * 3));
    g.drawImage(bokehSprite(colors[i % colors.length], o.blades || 0), px - r, py - r, r * 2, r * 2);
  }
  g.restore();
}
// heatShimmer(g, x, y, w, h, t, {amp, freq, speed, band}) - refractive wobble over hot ground /
// lava / exhaust: re-draws that region of what is already on the canvas in thin sheared strips.
export function heatShimmer(g, x, y, w, h, t = 0, o = {}) {
  const amp = o.amp == null ? 2 : o.amp;
  if (amp <= 0 || !g.getTransform) return;
  const T = g.getTransform();
  const dx0 = T.a * x + T.e, dy0 = T.d * y + T.f, dw = T.a * w, dh = T.d * h;
  const cw = g.canvas.width, ch = g.canvas.height;
  const sx = Math.max(0, Math.floor(dx0)), sy = Math.max(0, Math.floor(dy0));
  const ex = Math.min(cw, Math.ceil(dx0 + dw)), ey = Math.min(ch, Math.ceil(dy0 + dh));
  if (ex - sx < 4 || ey - sy < 4) return;
  const px = pixelScale();
  const Lr = layer((ex - sx) / px, (ey - sy) / px, "shimmer");
  Lr.g.setTransform(1, 0, 0, 1, 0, 0);
  Lr.g.drawImage(g.canvas, sx, sy, ex - sx, ey - sy, 0, 0, ex - sx, ey - sy);
  const freq = o.freq || 0.09, speed = o.speed || 5;
  const band = Math.max(2, Math.round((o.band || 3) * px));
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  for (let yy = 0; yy < ey - sy; yy += band) {
    const u = yy / (ey - sy);
    const fall = Math.sin(u * Math.PI); // fade the wobble at the band edges
    const off = (Math.sin((sy + yy) * freq / px - t * speed) + 0.5 * Math.sin((sy + yy) * freq * 2.3 / px + t * speed * 1.7)) * amp * px * fall;
    g.drawImage(Lr.canvas, 0, yy, ex - sx, band, sx + off, sy + yy, ex - sx, band);
  }
  g.restore();
}

// fog(g, W, H, {y, h, color, alpha, t, wisps, fill, seed}) - a band of haze centred on y; the wisps
// are drifting volumetric fog (two parallax layers of cached cloud noise), not blobs.
export function fog(g, W, H, o = {}) {
  const y = o.y == null ? H * 0.7 : o.y, h = o.h == null ? H * 0.3 : o.h;
  const color = o.color || "#9aa8b8", a = o.alpha == null ? 0.5 : o.alpha;
  const gr = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  gr.addColorStop(0, rgba(color, 0));
  gr.addColorStop(0.5, rgba(color, a * 0.75));
  gr.addColorStop(1, rgba(color, o.fill ? a * 0.75 : 0));
  g.fillStyle = gr;
  g.fillRect(0, y - h / 2, W, o.fill ? H - (y - h / 2) : h);
  if (o.fill) { g.fillStyle = rgba(color, a * 0.75); g.fillRect(0, y + h / 2, W, H); }
  if (o.wisps !== false && h > 4) {
    const t = o.t || 0;
    const seed = o.seed || 1;
    const bh = Math.ceil(h * 1.1);
    const Lr = layer(W, bh, "fogwisps");
    const s = Lr.g;
    const pat = texPattern(s, "cloud", { seed: seed + 20, cover: 0.55 });
    const tw = 256;
    const paint = (scx, scy, ox, alpha) => {
      if (pat.setTransform && typeof DOMMatrix !== "undefined") pat.setTransform(new DOMMatrix([scx / tw, 0, 0, scy / tw, ox, 0]));
      s.globalAlpha = alpha;
      s.fillStyle = pat;
      s.fillRect(0, 0, W, bh);
    };
    paint(W * 1.1, bh * 1.6, -t * 9, 0.75);
    paint(W * 0.6, bh * 0.9, t * 14 + 80, 0.55);
    s.globalAlpha = 1;
    s.globalCompositeOperation = "destination-in";
    const mg = s.createLinearGradient(0, 0, 0, bh);
    mg.addColorStop(0, "rgba(0,0,0,0)");
    mg.addColorStop(0.45, "rgba(0,0,0,1)");
    mg.addColorStop(o.fill ? 1 : 0.6, "rgba(0,0,0,0.9)");
    if (!o.fill) mg.addColorStop(1, "rgba(0,0,0,0)");
    s.fillStyle = mg;
    s.fillRect(0, 0, W, bh);
    s.globalCompositeOperation = "source-in";
    s.fillStyle = color;
    s.fillRect(0, 0, W, bh);
    s.globalCompositeOperation = "source-over";
    g.save();
    g.globalAlpha *= a * 0.7;
    g.drawImage(Lr.canvas, 0, 0, Lr.canvas.width, Lr.canvas.height, 0, y - bh / 2, W, bh);
    g.restore();
  }
}

// rain(g, W, H, t, {density, angle, color, speed, len, seed, width, light:{x,y,r,color}})
// Three depth layers (far fine mist streaks, mid, near thick out-of-focus streaks with bright
// cores). Each streak is the motion blur of a drop over one shutter interval. Drops passing
// through `light` catch it (the classic back-lit rain under a streetlamp).
export function rain(g, W, H, t = 0, o = {}) {
  const density = o.density == null ? 1 : o.density;
  const ang = o.angle == null ? 0.15 : o.angle;
  const color = o.color || "rgba(190,205,230,0.45)";
  const speed = o.speed || 900, len = o.len || 26;
  const n = Math.round(300 * density * (W / 960));
  const tanA = Math.tan(ang);
  const sx = Math.sin(ang), cy = Math.cos(ang);
  const seed = o.seed || 7;
  const Lt = o.light;
  const paths = [new Path2D(), new Path2D(), new Path2D()];
  const lit = [new Path2D(), new Path2D()];
  for (let i = 0; i < n; i++) {
    const r1 = hash(i, seed), r2 = hash(i + 0.5, seed), r3 = hash(i + 0.25, seed);
    const layerI = r3 < 0.55 ? 0 : r3 < 0.9 ? 1 : 2;
    const sp = speed * [0.65, 0.95, 1.35][layerI] * (0.9 + r1 * 0.2);
    const L = len * [0.45, 0.85, 2.1][layerI] * (0.8 + r2 * 0.4);
    const span = H + L + Math.abs(tanA) * H;
    const y = ((r2 * span + t * sp) % span) - L;
    const x = ((r1 * (W + 200) - 100 + y * tanA) % (W + 200) + (W + 200)) % (W + 200) - 100;
    paths[layerI].moveTo(x, y);
    paths[layerI].lineTo(x - sx * L, y - cy * L);
    if (Lt && layerI > 0) {
      const d = Math.hypot(x - Lt.x, y - Lt.y) / (Lt.r || 150);
      if (d < 1) { const p = lit[d < 0.5 ? 0 : 1]; p.moveTo(x, y); p.lineTo(x - sx * L, y - cy * L); }
    }
  }
  const wd = o.width || 1;
  g.save();
  g.lineCap = "round";
  g.strokeStyle = color;
  const A = g.globalAlpha;
  g.globalAlpha = A * 0.45; g.lineWidth = wd * 0.6; g.stroke(paths[0]);
  g.globalAlpha = A * 0.75; g.lineWidth = wd * 1.0; g.stroke(paths[1]);
  g.globalAlpha = A * 0.28; g.lineWidth = wd * 3.2; g.stroke(paths[2]);
  g.globalAlpha = A * 0.55; g.lineWidth = wd * 1.1; g.stroke(paths[2]);
  if (Lt) {
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = Lt.color || "#ffd9a0";
    g.globalAlpha = A * 0.8; g.lineWidth = wd * 1.3; g.stroke(lit[0]);
    g.globalAlpha = A * 0.4; g.lineWidth = wd * 1.1; g.stroke(lit[1]);
  }
  g.restore();
}

// splashes(g, W, H, t, {y0, y1, density, color, seed, x0, x1}) - rain hitting the ground: an
// impact flash, a crown of droplets thrown up on ballistic arcs, and an expanding ripple ring.
export function splashes(g, W, H, t = 0, o = {}) {
  const y0 = o.y0 == null ? H * 0.75 : o.y0, y1 = o.y1 == null ? H : o.y1;
  const x0 = o.x0 == null ? 0 : o.x0, x1 = o.x1 == null ? W : o.x1;
  const n = Math.round(70 * (o.density == null ? 1 : o.density));
  const seed = o.seed || 9;
  const color = o.color || "rgba(210,220,240,0.6)";
  const rings = new Path2D(), drops = new Path2D();
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const period = 0.45 + hash(i, seed) * 0.5;
    const tt = t + hash(i + 0.3, seed) * period;
    const cyc = Math.floor(tt / period);
    const p = (tt / period) - cyc;
    const x = lerp(x0, x1, hash(i * 13.1 + cyc * 7.7, seed));
    const yy = lerp(y0, y1, Math.pow(hash(i * 3.3 + cyc * 1.9, seed), 0.7));
    const depth = (yy - y0) / Math.max(1, y1 - y0);
    const k = 0.5 + depth;
    const r = (1.5 + p * 8) * k;
    rings.moveTo(x + r, yy);
    rings.ellipse(x, yy, r, r * 0.26, 0, 0, TAU);
    if (p < 0.4) {
      const q = p / 0.4;
      for (let d = 0; d < 5; d++) {
        const a = -Math.PI / 2 + (d - 2) * 0.5 + (hash(i + d, seed + cyc) - 0.5) * 0.3;
        const v = (9 + hash(i * 2 + d, seed) * 6) * k;
        const dx = Math.cos(a) * v * q * 0.9, dy = Math.sin(a) * v * q + 22 * k * q * q;
        const s = 1.1 * k * (1 - q * 0.5);
        drops.rect(x + dx - s / 2, yy + dy * 0.9 - s / 2, s, s);
      }
    }
    if (p < 0.08) { g.globalAlpha = 0.6; g.fillRect(x - k, yy - k * 0.6, k * 2, k * 1.2); }
  }
  g.globalAlpha = 0.45;
  g.lineWidth = 0.8;
  g.stroke(rings);
  g.globalAlpha = 0.8;
  g.fill(drops);
  g.restore();
}

// glassDrops(g, x, y, w, h, t, {seed, density, light, scale}) - rain on a window pane: a cached
// field of lensing beads (dark rims, bright caps, caustics) plus drops sliding down in streams
// that leave a wet trail of tiny beads.
function beadSprite(light) {
  return sprite("bead:" + light, 32, 32, (s) => {
    const rg = s.createRadialGradient(16, 17, 6, 16, 16, 15);
    rg.addColorStop(0, "rgba(10,14,22,0)");
    rg.addColorStop(0.75, "rgba(10,14,22,0.28)");
    rg.addColorStop(0.95, "rgba(10,14,22,0.55)");
    rg.addColorStop(1, "rgba(10,14,22,0)");
    s.fillStyle = rg;
    s.beginPath(); s.arc(16, 16, 15, 0, TAU); s.fill();
    const cg = s.createRadialGradient(18, 22, 0, 18, 22, 8);
    cg.addColorStop(0, rgba(light, 0.55)); cg.addColorStop(1, rgba(light, 0));
    s.fillStyle = cg;
    s.beginPath(); s.arc(18, 22, 8, 0, TAU); s.fill();
    s.fillStyle = rgba("#ffffff", 0.85);
    s.beginPath(); s.ellipse(11, 10, 3.2, 2.2, -0.6, 0, TAU); s.fill();
  });
}
export function glassDrops(g, x, y, w, h, t = 0, o = {}) {
  const seed = o.seed || 11;
  const dens = o.density == null ? 1 : o.density;
  const light = o.light || "#ffffff";
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  texRect(g, "glassdrops", x, y, w, h, { scale: 240 * (o.scale || 1), tex: { seed, density: Math.round(Math.min(1.4, dens) * 4) / 4 }, alpha: clamp(0.5 + dens * 0.25) });
  const bead = beadSprite(light);
  const n = Math.round(14 * dens * (w * h) / (400 * 300));
  for (let i = 0; i < n; i++) {
    const r = 2.2 + hash(i, seed) * 3.2;
    const dx = x + hash(i + 0.1, seed) * w;
    const sp = 25 + hash(i + 0.9, seed) * 60;
    // stop-start motion: drops cling, then run
    const tt = t * sp + hash(i + 0.4, seed) * 200;
    const run = Math.floor(tt / 60) * 40 + Math.min(40, (tt % 60) * 1.5);
    const dy = y + ((hash(i + 0.2, seed) * h + run) % (h + 40)) - 20;
    const wig = Math.sin(dy * 0.07 + i) * 2;
    // trail: tiny beads left behind
    for (let k = 1; k < 9; k++) {
      const ty = dy - k * 7;
      if (ty < y - 4) break;
      const tr = r * 0.32 * (1 - k / 10);
      g.globalAlpha = 0.7;
      g.drawImage(bead, dx + Math.sin(ty * 0.07 + i) * 2 - tr, ty - tr, tr * 2, tr * 2);
    }
    g.globalAlpha = 1;
    g.drawImage(bead, dx + wig - r, dy - r * 1.15, r * 2, r * 2.3);
  }
  g.restore();
}

// dust(g, W, H, t, {seed, color, count, size, area:[x,y,w,h], alpha}) - motes floating in light:
// most are small sharp points, a few drift close to the lens as soft out-of-focus discs.
export function dust(g, W, H, t = 0, o = {}) {
  const seed = o.seed || 5, n = o.count || 40, color = o.color || "#fff0d0";
  const [ax, ay, aw, ah] = o.area || [0, 0, W, H];
  const spr = glowSprite(color);
  const bok = bokehSprite(color);
  const A = o.alpha == null ? 0.6 : o.alpha;
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const px = ax + ((hash(i, seed) * aw + noise(t * 0.15 + i, seed) * 40 + t * 4) % aw + aw) % aw;
    const py = ay + ((hash(i + 0.5, seed) * ah + noise(t * 0.12 + i * 3, seed + 1) * 30 - t * 2) % ah + ah) % ah;
    const near = hash(i + 0.77, seed) > 0.88;
    const s = (o.size || 1.6) * (0.5 + hash(i + 0.2, seed));
    const flick = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + i)); // motes catch the light as they tumble
    if (near) {
      const r = s * 7;
      g.globalAlpha = A * 0.16 * flick;
      g.drawImage(bok, px - r, py - r, r * 2, r * 2);
    } else {
      g.globalAlpha = A * flick;
      g.drawImage(spr, px - s * 2, py - s * 2, s * 4, s * 4);
    }
  }
  g.restore();
}

// fireflies(g, W, H, t, {seed, count, color, area, size}) - slow wandering lights that pulse with
// a firefly's rhythm (quick rise, slow decay), each lighting a little of the air around it.
export function fireflies(g, W, H, t = 0, o = {}) {
  const seed = o.seed || 6, n = o.count || 18, color = o.color || "#ffe98a";
  const [ax, ay, aw, ah] = o.area || [0, H * 0.4, W, H * 0.5];
  for (let i = 0; i < n; i++) {
    const px = ax + aw * (0.5 + 0.5 * noise(t * 0.18 + i * 7.1, seed));
    const py = ay + ah * (0.5 + 0.5 * noise(t * 0.15 + i * 3.7, seed + 3));
    const per = 2.2 + hash(i, seed) * 2.5;
    const ph = ((t + hash(i + 0.6, seed) * per) % per) / per;
    const blink = ph < 0.12 ? ph / 0.12 : Math.exp(-(ph - 0.12) * 7);
    const s = (o.size || 3) * (0.7 + hash(i + 0.4, seed) * 0.6);
    glow(g, px, py, s * 12, color, 0.12 * blink);
    glow(g, px, py, s * 5, color, 0.4 * blink);
    glow(g, px, py, s * 1.3, "#ffffff", 0.85 * blink);
  }
}

// leaves(g, W, H, t, {seed, count, color, wind, toward:[x,y], pull}) - wind-blown leaves that
// tumble (foreshortened as they turn) with a lit and a shaded face.
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
    const flip = Math.cos(a * 1.3);
    const sz = 0.8 + hash(i + 0.9, seed) * 0.6;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.scale(sz, (Math.abs(flip) * 0.8 + 0.2) * sz);
    const base = o.color ? o.color : mix("#7a5226", "#3f4a1e", hash(i + 0.8, seed));
    g.fillStyle = flip > 0 ? shade(base, 0.12) : shade(base, -0.25);
    g.beginPath();
    g.moveTo(-6, 0);
    g.quadraticCurveTo(0, -3.4, 6, 0);
    g.quadraticCurveTo(0, 3.4, -6, 0);
    g.fill();
    g.strokeStyle = rgba(shade(base, -0.4), 0.6);
    g.lineWidth = 0.5;
    g.beginPath(); g.moveTo(-6.5, 0); g.lineTo(5, 0); g.stroke();
    g.restore();
  }
  g.restore();
}

// lightningBolt(g, x0, y0, x1, y1, seed, {color, alpha, width}) - a forked branching bolt: hot white
// core, saturated channel, and a wide ionised glow.
export function lightningBolt(g, x0, y0, x1, y1, seed = 1, o = {}) {
  const R = rng("bolt" + seed);
  const color = o.color || "#dfe9ff";
  const a = o.alpha == null ? 1 : o.alpha;
  if (a <= 0) return;
  const path = new Path2D(), thin = new Path2D();
  const branch = (ax, ay, bx, by, depth) => {
    const segs = 9 + depth * 2;
    const p = depth ? thin : path;
    p.moveTo(ax, ay);
    for (let i = 1; i <= segs; i++) {
      const u = i / segs;
      const nx = lerp(ax, bx, u) + (R() - 0.5) * Math.abs(by - ay) * 0.12;
      const ny = lerp(ay, by, u);
      p.lineTo(nx, ny);
      if (depth < 2 && R() > 0.78) {
        branch(nx, ny, nx + (R() - 0.5) * 160, ny + 60 + R() * 90, depth + 1);
        p.moveTo(nx, ny);
      }
    }
  };
  branch(x0, y0, x1, y1, 0);
  const wd = o.width || 2;
  g.save();
  g.globalAlpha *= a;
  g.globalCompositeOperation = "lighter";
  g.lineJoin = "round";
  g.lineCap = "round";
  g.strokeStyle = rgba(color, 0.06);
  g.lineWidth = wd * 16;
  g.stroke(path);
  g.strokeStyle = rgba(color, 0.2);
  g.lineWidth = wd * 5;
  g.stroke(path);
  g.lineWidth = wd * 2;
  g.stroke(thin);
  g.strokeStyle = rgba(color, 0.9);
  g.lineWidth = wd;
  g.stroke(path);
  g.lineWidth = wd * 0.5;
  g.stroke(thin);
  g.strokeStyle = "#ffffff";
  g.lineWidth = wd * 0.4;
  g.stroke(path);
  g.restore();
}

// ---- landscape ---------------------------------------------------------------------------------------
// grass(g, x0, x1, y, {seed, color, height, t, wind, density, light, dark, sun:{x,y}, dry})
// Curved tapered blades in five tonal groups (with some dry straw), dark at the roots (AO), swaying
// with a travelling gust. With `sun`, blades are back-lit: thin tips glow translucent yellow-green,
// strongest nearest the sun. y is the ground line; blades grow up from it. (light/dark = colours.)
export function grass(g, x0, x1, y, o = {}) {
  const seed = o.seed || 1, color = o.color || "#3a5a2a", h = o.height || 28;
  const t = o.t || 0, wind = o.wind == null ? 1 : o.wind;
  const n = Math.round(Math.abs(x1 - x0) / 2.4 * (o.density == null ? 1 : o.density));
  const NG = 5;
  const groups = [];
  for (let k = 0; k < NG + 1; k++) groups.push(new Path2D());
  const tips = new Path2D();
  const dryAmt = o.dry == null ? 0.08 : o.dry;
  for (let i = 0; i < n; i++) {
    const r = hash(i, seed);
    const bx = lerp(x0, x1, (i + hash(i + 0.5, seed)) / n);
    const bh = h * (0.4 + r * 0.8);
    const gust = Math.sin(t * 1.6 - bx * 0.012) * 0.5 + Math.sin(t * 2.7 + bx * 0.05 + i) * 0.18;
    const lean = ((hash(i + 0.2, seed) - 0.5) * 0.8 + gust * 0.55 * wind) * bh;
    const w = 0.9 + hash(i + 0.7, seed) * 1.5;
    const tone = hash(i + 0.33, seed) < dryAmt ? NG : Math.floor(hash(i + 0.41, seed) * NG);
    const p = groups[tone];
    const by = y + hash(i + 0.9, seed) * 4;
    const tx = bx + lean, ty = by - bh + Math.abs(lean) * 0.25;
    p.moveTo(bx - w, by);
    p.bezierCurveTo(bx - w * 0.8, by - bh * 0.35, bx - w * 0.2 + lean * 0.4, by - bh * 0.75, tx, ty);
    p.bezierCurveTo(bx + w * 0.2 + lean * 0.4, by - bh * 0.75, bx + w * 0.8, by - bh * 0.35, bx + w, by);
    p.closePath();
    if (o.sun && (i & 1) === 0) {
      const mx = lerp(bx, tx, 0.55), my = lerp(by, ty, 0.55);
      tips.moveTo(mx - w * 0.45, my);
      tips.quadraticCurveTo(lerp(mx, tx, 0.5) - w * 0.1, lerp(my, ty, 0.5), tx, ty);
      tips.quadraticCurveTo(lerp(mx, tx, 0.5) + w * 0.1, lerp(my, ty, 0.5), mx + w * 0.45, my);
      tips.closePath();
    }
  }
  const dark = o.dark || shade(color, -0.35), light = o.light || shade(color, 0.2);
  const tonesTop = [shade(dark, -0.1), dark, color, mix(color, light, 0.6), light];
  const dryC = mix(color, "#b8a868", 0.65);
  const root = shade(dark, -0.45);
  for (let k = 0; k <= NG; k++) {
    const top = k === NG ? dryC : tonesTop[k];
    const gr = g.createLinearGradient(0, y - h * 1.2, 0, y + 3);
    gr.addColorStop(0, top);
    gr.addColorStop(0.6, mix(top, dark, 0.45));
    gr.addColorStop(1, root);
    g.fillStyle = gr;
    g.fill(groups[k]);
  }
  if (o.sun) {
    const sx = o.sun.x;
    const tc = mix(light, "#f4f08a", 0.55);
    const span = Math.max(200, Math.abs(x1 - x0) * 0.5);
    const gr = g.createLinearGradient(sx - span, 0, sx + span, 0);
    gr.addColorStop(0, rgba(tc, 0.12));
    gr.addColorStop(0.5, rgba(tc, 0.75));
    gr.addColorStop(1, rgba(tc, 0.12));
    g.save();
    g.globalCompositeOperation = "screen";
    g.fillStyle = gr;
    g.fill(tips);
    g.restore();
  }
  // contact darkening where the blades meet the soil
  const ag = g.createLinearGradient(0, y - h * 0.25, 0, y + 5);
  ag.addColorStop(0, "rgba(0,0,0,0)");
  ag.addColorStop(1, "rgba(0,0,0,0.28)");
  g.fillStyle = ag;
  g.fillRect(Math.min(x0, x1), y - h * 0.25, Math.abs(x1 - x0), h * 0.25 + 5);
}

// tree painter: tapered bark-textured limbs shaded as cylinders, and foliage built from thousands
// of small leaves lit per cluster against the key light (sun direction), with canopy self-shadow.
function paintTree(s, w, h, o, kind) {
  const R = rng("tree" + o.seed + kind);
  const trunk = o.trunk || "#4a3426", leaf = o.leaf || "#3d5a2c";
  let lx = o.sunDir ? o.sunDir[0] : -0.55, ly = o.sunDir ? o.sunDir[1] : -0.83;
  const ll = Math.hypot(lx, ly) || 1; lx /= ll; ly /= ll;
  const bx = w / 2, by = h - 4;
  const tips = [];
  const segs = [];
  const branch = (x, y, ang, len, wid, depth) => {
    const bend = (R() - 0.5) * 0.35;
    const mx = x + Math.cos(ang + bend) * len * 0.5, my = y + Math.sin(ang + bend) * len * 0.5;
    const ex = mx + Math.cos(ang - bend * 0.5) * len * 0.5, ey = my + Math.sin(ang - bend * 0.5) * len * 0.5;
    segs.push([x, y, mx, my, wid, wid * 0.86, depth]);
    segs.push([mx, my, ex, ey, wid * 0.86, wid * 0.7, depth]);
    const maxD = kind === "bare" ? 7 : 4;
    if (depth >= maxD || len < 5) { tips.push([ex, ey, depth]); return; }
    if (depth === 3 && kind !== "bare") tips.push([mx, my, depth]);
    const k = 2 + (R() > 0.55 ? 1 : 0);
    for (let i = 0; i < k; i++) {
      const na = ang + (R() - 0.5) * (kind === "bare" ? 1.0 : 0.8) + (i - (k - 1) / 2) * (kind === "bare" ? 0.55 : 0.62);
      const up = (-Math.PI / 2 - na) * 0.12; // phototropism: branches bend back up
      branch(ex, ey, na + up, len * (0.64 + R() * 0.16), wid * 0.66, depth + 1);
    }
  };
  if (kind === "pine") {
    paintPine(s, w, h, o, R, lx, ly, trunk, leaf);
    return;
  }
  const trunkH = h * (kind === "bare" ? 0.26 : 0.3);
  branch(bx, by, -Math.PI / 2 + (R() - 0.5) * 0.12, trunkH, w * 0.085, 0);
  // root flare
  segs.unshift([bx, by + 2, bx, by - h * 0.05, w * 0.15, w * 0.09, 0]);
  const barkPat = texPattern(s, "bark", { seed: 3, color: trunk, size: 128 });
  if (barkPat.setTransform && typeof DOMMatrix !== "undefined") barkPat.setTransform(new DOMMatrix([0.35, 0, 0, 0.55, 0, 0]));
  for (const [x0, y0, x1, y1, w0, w1] of segs) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    const p = new Path2D();
    p.moveTo(x0 + nx * w0 / 2, y0 + ny * w0 / 2);
    p.lineTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
    p.lineTo(x1 - nx * w1 / 2, y1 - ny * w1 / 2);
    p.lineTo(x0 - nx * w0 / 2, y0 - ny * w0 / 2);
    p.closePath();
    const jp = new Path2D();
    jp.arc(x1, y1, w1 / 2, 0, TAU);
    s.fillStyle = trunk;
    s.fill(jp);
    s.fillStyle = trunk;
    s.fill(p);
    if (w0 > 2) { s.fillStyle = barkPat; s.globalAlpha = 0.85; s.fill(p); s.globalAlpha = 1; }
    // cylinder shading: lit flank toward the key light, core shadow on the far flank
    const lit = nx * lx + ny * ly; // >0: +n side faces the light
    const gr = s.createLinearGradient(x0 + nx * w0 / 2, y0 + ny * w0 / 2, x0 - nx * w0 / 2, y0 - ny * w0 / 2);
    const A = "rgba(255,236,200,0.22)", B = "rgba(0,0,0,0.6)";
    gr.addColorStop(0, lit > 0 ? A : B);
    gr.addColorStop(0.35, "rgba(0,0,0,0.02)");
    gr.addColorStop(0.7, "rgba(0,0,0,0.25)");
    gr.addColorStop(1, lit > 0 ? B : A);
    s.fillStyle = gr;
    s.fill(p);
  }
  if (kind === "bare") return;
  // foliage: clusters around tips; draw far (dark) to near (lit)
  const clusters = tips.map(([x, y, d]) => {
    const r = w * (0.085 + R() * 0.06) * (d >= 4 ? 1 : 0.85);
    const m = r * 1.1;
    const cx = Math.min(w - m, Math.max(m, bx + (x - bx) * 0.95 + (R() - 0.5) * 8));
    const cy = Math.max(m, y - r * 0.3 + (R() - 0.5) * 6);
    return [cx, cy, r, R()];
  });
  // canopy hull centre for self-shadowing
  let ccx = 0, ccy = 0;
  for (const c of clusters) { ccx += c[0]; ccy += c[1]; }
  ccx /= clusters.length; ccy /= clusters.length;
  let crad = 1;
  for (const c of clusters) crad = Math.max(crad, Math.hypot(c[0] - ccx, c[1] - ccy) + c[2]);
  clusters.sort((a, b) => a[3] - b[3]);
  const lightLeaf = mix(leaf, "#e8f08a", 0.42), darkLeaf = shade(leaf, -0.62);
  const BINS = 7;
  const binCols = [];
  for (let b = 0; b < BINS; b++) { const u = b / (BINS - 1); binCols.push(u < 0.5 ? mix(darkLeaf, leaf, u * 2) : mix(leaf, lightLeaf, (u - 0.5) * 2)); }
  for (const [cx, cy, r, depth] of clusters) {
    // dark interior mass so gaps read as depth, not holes
    const ig = s.createRadialGradient(cx, cy + r * 0.2, r * 0.1, cx, cy, r * 1.05);
    ig.addColorStop(0, rgba(shade(leaf, -0.72), 0.95));
    ig.addColorStop(0.55, rgba(shade(leaf, -0.68), 0.8));
    ig.addColorStop(1, rgba(shade(leaf, -0.65), 0));
    s.fillStyle = ig;
    s.beginPath(); s.arc(cx, cy, r * 0.58, 0, TAU); s.fill();
    const bins = [];
    for (let b = 0; b < BINS; b++) bins.push(new Path2D());
    const NL = Math.round(r * r * 0.14);
    const lobe = R() * TAU;
    for (let k = 0; k < NL; k++) {
      const a = R() * TAU, d = Math.sqrt(R()) * (0.8 + 0.28 * Math.sin(a * 3 + lobe));
      const px = cx + Math.cos(a) * d * r, py = cy + Math.sin(a) * d * r * 0.92;
      const nx = (px - cx) / r, ny = (py - cy) / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      let L = clamp(nx * lx * 0.8 + ny * ly * 0.8 + nz * 0.45) ;
      // canopy self-shadow: leaves deep inside / on the far side of the whole crown get less light
      const gx = (px - ccx) / crad, gy = (py - ccy) / crad;
      const outer = clamp(gx * lx + gy * ly + 0.35);
      L = L * (0.35 + 0.65 * outer) * (0.55 + depth * 0.45) + (R() - 0.5) * 0.18;
      const bi = Math.max(0, Math.min(BINS - 1, Math.round(clamp(L) * (BINS - 1))));
      const lw = 2.3 + R() * 2.8, lh = lw * (0.42 + R() * 0.2), rot = R() * Math.PI;
      bins[bi].moveTo(px + Math.cos(rot) * lw, py + Math.sin(rot) * lw);
      bins[bi].ellipse(px, py, lw, lh, rot, 0, TAU);
    }
    for (let b = 0; b < BINS; b++) { s.fillStyle = binCols[b]; s.fill(bins[b]); }
  }
}
function paintPine(s, w, h, o, R, lx, ly, trunk, leaf) {
  const bx = w / 2, by = h - 4;
  const tg = s.createLinearGradient(bx - w * 0.03, 0, bx + w * 0.03, 0);
  tg.addColorStop(0, shade(trunk, lx < 0 ? 0.15 : -0.45));
  tg.addColorStop(1, shade(trunk, lx < 0 ? -0.45 : 0.15));
  s.fillStyle = tg;
  s.beginPath();
  s.moveTo(bx - w * 0.035, by);
  s.lineTo(bx - w * 0.006, by - h * 0.95);
  s.lineTo(bx + w * 0.006, by - h * 0.95);
  s.lineTo(bx + w * 0.035, by);
  s.closePath();
  s.fill();
  const fol = texPattern(s, "foliage", { seed: 7, color: leaf });
  if (fol.setTransform && typeof DOMMatrix !== "undefined") fol.setTransform(new DOMMatrix([0.45, 0, 0, 0.45, 0, 0]));
  const lightLeaf = mix(leaf, "#e0eca0", 0.3), darkLeaf = shade(leaf, -0.6);
  const tiers = 11;
  for (let i = 0; i < tiers; i++) {
    const u = i / (tiers - 1);
    const ty = by - h * (0.1 + u * 0.8);
    const tw = w * (0.45 - u * 0.39) * (0.88 + R() * 0.24);
    const th = h * (0.17 - u * 0.07);
    const p = new Path2D();
    // real spruce tiers are ragged and lopsided: each side reaches its own length and droops its own way
    const rr = 0.72 + R() * 0.5, rl = 0.72 + R() * 0.5, dr = (R() - 0.3) * th * 0.35, dl = (R() - 0.3) * th * 0.35;
    const apx = bx + (R() - 0.5) * 3, apy = ty - th;
    p.moveTo(apx, apy);
    p.quadraticCurveTo(bx + tw * rr * 0.55, ty - th * 0.45, bx + tw * rr, ty + th * 0.18 + dr);
    const edge = [];
    const n = 9 + Math.round(tw / 8);
    for (let k = 1; k < n; k++) {
      const f = 1 - (k / n) * 2;
      const x = bx + tw * f * (f > 0 ? rr : rl);
      const y = ty + th * 0.18 + (f > 0 ? dr : dl) * f * f - (1 - f * f) * th * 0.12 + (k % 2 ? R() * th * 0.3 : -R() * th * 0.08);
      edge.push([x, y]);
      p.lineTo(x, y);
    }
    p.lineTo(bx - tw * rl, ty + th * 0.18 + dl);
    p.quadraticCurveTo(bx - tw * rl * 0.55, ty - th * 0.45, apx, apy);
    p.closePath();
    s.fillStyle = darkLeaf;
    s.fill(p);
    s.globalAlpha = 0.9;
    s.fillStyle = fol;
    s.fill(p);
    s.globalAlpha = 1;
    // key light from the side, the shadow of the tier above on the top of this one
    const lg = s.createLinearGradient(bx - tw, 0, bx + tw, 0);
    const lit = "rgba(255,248,200,0.16)", dk = "rgba(0,0,0,0.5)";
    lg.addColorStop(0, lx < 0 ? lit : dk);
    lg.addColorStop(0.5, "rgba(0,0,0,0.08)");
    lg.addColorStop(1, lx < 0 ? dk : lit);
    s.fillStyle = lg;
    s.fill(p);
    const vg = s.createLinearGradient(0, ty - th, 0, ty + th * 0.2);
    vg.addColorStop(0, "rgba(0,0,0,0.5)");
    vg.addColorStop(0.5, "rgba(0,0,0,0.1)");
    vg.addColorStop(1, "rgba(0,0,0,0.25)");
    s.fillStyle = vg;
    s.fill(p);
    // drooping needle tufts along the lower edge
    s.lineWidth = 0.8;
    for (const [x, y] of edge) {
      const side = x < bx ? -1 : 1;
      const L = clamp(0.2 + (side * -lx) * 0.25 + R() * 0.25);
      s.strokeStyle = rgba(mix(darkLeaf, lightLeaf, L), 0.7);
      for (let q = 0; q < 3; q++) {
        s.beginPath();
        s.moveTo(x + (R() - 0.5) * 6, y - 3);
        s.lineTo(x + side * (1 + R() * 3), y + 2 + R() * 4);
        s.stroke();
      }
    }
  }
}
// tree(g, x, y, scale, {seed, leaf, trunk, t, kind:'oak'|'pine'|'bare', sway, sun:{x,y}, night})
// x, y = base of trunk. A tree is ~300*scale tall. Painted once into a sprite (keyed by the
// quantised key-light direction from `sun`); sways about its base with t.
export function tree(g, x, y, scale = 1, o = {}) {
  const kind = o.kind || "oak";
  const w = 260, h = 320;
  let sd = null;
  if (o.sun) {
    const a = quantAng(Math.atan2(o.sun.y - (y - h * scale * 0.6), o.sun.x - x));
    sd = [Math.cos(a), Math.sin(a)];
  }
  const res = scale > 1.3 ? 2 : 1;
  const key = `tree2:${o.seed || 1}:${kind}:${o.leaf || ""}:${o.trunk || ""}:${sd ? sd[0].toFixed(2) + "," + sd[1].toFixed(2) : "top"}`;
  const spr = sprite(key, w * res, h * res, (s) => { s.scale(res, res); paintTree(s, w, h, { seed: o.seed || 1, leaf: o.leaf, trunk: o.trunk, sunDir: sd }, kind); });
  const t = o.t || 0;
  const sway = (o.sway == null ? 1 : o.sway) * (Math.sin(t * 0.8 + (o.seed || 1)) * 0.012 + Math.sin(t * 2.1 + (o.seed || 1) * 3) * 0.004);
  if (o.shadow !== false && kind !== "bare") shadowBlob(g, x, y + 2 * scale, 70 * scale, 9 * scale, { alpha: o.night ? 0.25 : 0.4 });
  g.save();
  g.translate(x, y);
  g.rotate(sway);
  g.drawImage(spr, -w * scale / 2, -h * scale + 4 * scale, w * scale, h * scale);
  g.restore();
}

// hills(g, W, H, {y, amp, color, seed, haze, hazeAmt, freq, top, tex, texAlpha, sun, rim})
// A noise ridge (with ridged erosion detail) filled to the bottom, carrying surface relief from a
// cached texture (tex: any texture name; default neutral "relief" in soft-light so the colour is
// kept). haze + hazeAmt give atmospheric perspective; sun/rim adds a rim light along the crest.
export function hills(g, W, H, o = {}) {
  const y = o.y == null ? H * 0.6 : o.y, amp = o.amp == null ? 40 : o.amp;
  if (o.cache !== false) {
    // static: render once into a cached band, then one drawImage per frame
    const top = Math.max(0, Math.floor(y - amp * 1.35 - 4));
    if (top >= H) return;
    const spr = sprite("hills:" + JSON.stringify(o) + ":" + W + "x" + H, W, H - top, (s) => { s.translate(0, -top); hills(s, W, H, { ...o, cache: false }); });
    g.drawImage(spr, 0, top, W, H - top);
    return;
  }
  const seed = o.seed || 1, freq = o.freq || 1;
  let color = o.color || "#2a3a2a";
  const hz = o.hazeAmt == null ? 0.5 : o.hazeAmt;
  if (o.haze) color = mix(color, o.haze, hz);
  const p = new Path2D();
  p.moveTo(0, H);
  const ridge = [];
  for (let x = 0; x <= W + 6; x += 6) {
    const base = 0.5 + 0.5 * fbm((x / 320) * freq + seed * 10, seed);
    const det = texRidged((x / 140) * freq + seed * 3.1, seed * 1.7, seed, 4) - 0.35;
    const yy = y - amp * (base + det * 0.22);
    ridge.push(x, yy);
    p.lineTo(x, yy);
  }
  p.lineTo(W, H);
  p.closePath();
  const gr = g.createLinearGradient(0, y - amp, 0, H);
  gr.addColorStop(0, o.top || shade(color, 0.08));
  gr.addColorStop(0.4, color);
  gr.addColorStop(1, shade(color, -0.3));
  g.fillStyle = gr;
  g.fill(p);
  const tex = o.tex || "relief";
  const ta = o.texAlpha == null ? (o.tex ? 0.55 : 0.6) * (1 - (o.haze ? hz * 0.7 : 0)) : o.texAlpha;
  if (ta > 0) {
    texFill(g, tex, p, { scale: o.texScale || 300, scaleY: (o.texScale || 300) * 0.55, alpha: ta, mode: tex === "relief" ? "soft-light" : "source-over", tex: { seed: seed + 2, color: tex === "relief" ? undefined : o.color } });
    if (tex !== "relief" && o.haze) { g.save(); g.globalAlpha *= hz * 0.85; g.fillStyle = o.haze; g.fill(p); g.restore(); }
  }
  const rimC = o.rim || (o.sun ? mix(o.haze || "#fff0d8", "#ffffff", 0.3) : null);
  if (rimC) {
    g.save();
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = rgba(rimC, 0.35);
    g.lineWidth = 1.6;
    g.beginPath();
    for (let i = 0; i < ridge.length; i += 2) { if (i === 0) g.moveTo(ridge[i], ridge[i + 1] + 0.6); else g.lineTo(ridge[i], ridge[i + 1] + 0.6); }
    g.stroke();
    g.restore();
  }
}

// stone(g, x, y, w, h, {seed, color, wet, light, lichen}) - a weathered standing stone (base at
// x, y): granite with lichen, rounded shading, moss at the foot, contact shadow, wet sheen.
export function stone(g, x, y, w, h, o = {}) {
  const R = rng("stone" + (o.seed || 1));
  const color = o.color || "#5d6168";
  const pts = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI;
    const rx = w / 2 * (0.85 + R() * 0.2), ry = h * (0.92 + R() * 0.1);
    pts.push(x + Math.cos(a) * rx, y + Math.sin(a) * ry * (i === 0 || i === n - 1 ? 0 : 1));
  }
  pts.push(x + w * 0.5, y + 2, x - w * 0.5, y + 2);
  const p = new Path2D();
  spline(p, pts, true, 0.6);
  shadowBlob(g, x, y + 1, w * 0.55, Math.max(3, w * 0.08), { alpha: 0.55 });
  g.fillStyle = color;
  g.fill(p);
  texFill(g, "granite", p, { scale: Math.max(90, w * 1.4), _x: x - w / 2, _y: y - h, tex: { seed: o.seed || 1, color, lichen: o.lichen == null ? 0.6 : o.lichen } });
  g.save();
  g.clip(p);
  // form shading: key from upper left, core shadow right, bounce at the bottom
  const gr = g.createLinearGradient(x - w / 2, y - h, x + w / 2, y);
  gr.addColorStop(0, "rgba(255,245,230,0.16)");
  gr.addColorStop(0.45, "rgba(0,0,0,0)");
  gr.addColorStop(0.8, "rgba(0,0,0,0.38)");
  gr.addColorStop(1, "rgba(0,0,0,0.55)");
  g.fillStyle = gr;
  g.fill(p);
  g.strokeStyle = rgba(shade(color, -0.6), 0.55);
  g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    const sx = x + (R() - 0.5) * w * 0.7, sy = y - R() * h * 0.9;
    g.moveTo(sx, sy);
    g.quadraticCurveTo(sx + (R() - 0.5) * w * 0.2, sy + R() * h * 0.1, sx + (R() - 0.5) * w * 0.3, sy + R() * h * 0.22);
    g.stroke();
  }
  const mg = g.createLinearGradient(0, y - h * 0.3, 0, y);
  mg.addColorStop(0, "rgba(52,70,32,0)");
  mg.addColorStop(1, "rgba(52,70,32,0.7)");
  g.fillStyle = mg;
  g.fill(p);
  if (o.wet) {
    const wk = clamp(o.wet);
    g.globalCompositeOperation = "multiply";
    g.fillStyle = `rgba(150,160,175,${0.5 * wk})`;
    g.fill(p);
    g.globalCompositeOperation = "screen";
    for (let i = 0; i < 4; i++) {
      const sx = x - w * 0.32 + i * w * 0.07 + R() * 4;
      const sg = g.createLinearGradient(0, y - h, 0, y);
      sg.addColorStop(0, `rgba(210,222,240,${0.28 * wk})`);
      sg.addColorStop(1, "rgba(210,222,240,0)");
      g.fillStyle = sg;
      g.fillRect(sx, y - h, 1.5 + R() * 2, h);
    }
  }
  g.restore();
}

// fence(g, x0, x1, y, h, {color, gap:[xa, xb], night, tuft}) - white picket fence (base y): painted
// wood grain, rounded shading, weathering at the foot, contact AO.
export function fence(g, x0, x1, y, h, o = {}) {
  const color = o.color || (o.night ? "#7d8796" : "#efe9de");
  const step = h * 0.32;
  const sh = shade(color, -0.35);
  const rails = new Path2D();
  rails.rect(x0, y - h * 0.75, x1 - x0, h * 0.07);
  rails.rect(x0, y - h * 0.3, x1 - x0, h * 0.07);
  g.fillStyle = sh;
  g.fill(rails);
  texFill(g, "wood", rails, { scale: h * 1.6, alpha: 0.35, mode: "multiply", tex: { seed: 4, color: "#c8b8a0", planks: 2 } });
  const pk = new Path2D();
  for (let x = x0; x <= x1; x += step) {
    if (o.gap && x > o.gap[0] && x < o.gap[1]) continue;
    const w = step * 0.62;
    pk.moveTo(x, y);
    pk.lineTo(x, y - h * 0.88);
    pk.lineTo(x + w / 2, y - h);
    pk.lineTo(x + w, y - h * 0.88);
    pk.lineTo(x + w, y);
    pk.closePath();
  }
  g.fillStyle = color;
  g.fill(pk);
  texFill(g, "wood", pk, { scale: h * 1.4, rot: Math.PI / 2, alpha: 0.32, mode: "multiply", tex: { seed: 5, color: "#d8ccb8", planks: 3 } });
  g.save();
  g.clip(pk);
  for (let x = x0; x <= x1; x += step) {
    if (o.gap && x > o.gap[0] && x < o.gap[1]) continue;
    const w = step * 0.62;
    const gr = g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, "rgba(255,255,255,0.12)");
    gr.addColorStop(0.3, "rgba(0,0,0,0)");
    gr.addColorStop(1, "rgba(0,0,0,0.38)");
    g.fillStyle = gr;
    g.fillRect(x, y - h, w, h);
  }
  // rail shadows on the pickets and grime at the foot
  g.fillStyle = "rgba(0,0,0,0.18)";
  g.fillRect(x0, y - h * 0.68, x1 - x0, h * 0.04);
  g.fillRect(x0, y - h * 0.23, x1 - x0, h * 0.04);
  const dg = g.createLinearGradient(0, y - h * 0.3, 0, y);
  dg.addColorStop(0, "rgba(60,50,30,0)");
  dg.addColorStop(1, "rgba(60,50,30,0.45)");
  g.fillStyle = dg;
  g.fillRect(x0, y - h * 0.3, x1 - x0, h * 0.3);
  g.restore();
  aoEdge(g, x0, y, x1, y, { width: h * 0.12, alpha: 0.35, side: -1 });
  if (o.gap) {
    // the hole under the fence: a dark scooped gap, and the orange fur tuft on a nail
    const cx = (o.gap[0] + o.gap[1]) / 2, rx = (o.gap[1] - o.gap[0]) / 2;
    const hg = g.createRadialGradient(cx, y, 0, cx, y, rx);
    hg.addColorStop(0, "rgba(6,5,4,0.85)");
    hg.addColorStop(0.75, "rgba(10,8,6,0.7)");
    hg.addColorStop(1, "rgba(10,8,6,0)");
    g.fillStyle = hg;
    g.beginPath();
    g.ellipse(cx, y, rx * 1.1, h * 0.24, 0, Math.PI, TAU);
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

// house painter (local units: body 240 wide x 170 tall, bottom centre at (0, 0)).
function paintHouse(s, o) {
  const { wall, roof, trim, door, night, lit, glowC } = o;
  const W = 240, H1 = 170;
  // body: painted clapboard siding
  const body = new Path2D();
  body.rect(-W / 2, -H1, W, H1);
  s.fillStyle = wall;
  s.fill(body);
  texFill(s, "siding", body, { scale: 120, _x: -W / 2, _y: -H1, tex: { seed: 2, color: wall, rows: 10 } });
  const wg = s.createLinearGradient(-W / 2, 0, W / 2, 0);
  wg.addColorStop(0, "rgba(0,0,0,0.28)");
  wg.addColorStop(0.45, "rgba(0,0,0,0)");
  wg.addColorStop(1, "rgba(0,0,0,0.18)");
  s.fillStyle = wg;
  s.fill(body);
  // chimney (brick) + roof (shingles)
  const ch = new Path2D();
  ch.rect(55, -H1 - 78, 22, 60);
  s.fillStyle = "#6a3a2e";
  s.fill(ch);
  texFill(s, "brick", ch, { scale: 40, _x: 55, _y: -H1 - 78, tex: { seed: 3, color: night ? "#5a3a32" : "#8a4a36" } });
  s.fillStyle = "rgba(0,0,0,0.35)";
  s.fillRect(68, -H1 - 78, 9, 60);
  s.fillStyle = shade(trim, -0.3);
  s.fillRect(52, -H1 - 82, 28, 5);
  const rf = new Path2D();
  rf.moveTo(-W / 2 - 14, -H1 + 2);
  rf.lineTo(0, -H1 - 82);
  rf.lineTo(W / 2 + 14, -H1 + 2);
  rf.closePath();
  s.fillStyle = roof;
  s.fill(rf);
  texFill(s, "shingle", rf, { scale: 70, tex: { seed: 4, color: roof } });
  const rg = s.createLinearGradient(0, -H1 - 82, 0, -H1);
  rg.addColorStop(0, "rgba(255,255,255,0.1)");
  rg.addColorStop(1, "rgba(0,0,0,0.3)");
  s.fillStyle = rg;
  s.fill(rf);
  // eave shadow on the wall (AO under the roof)
  const eg = s.createLinearGradient(0, -H1, 0, -H1 + 18);
  eg.addColorStop(0, "rgba(0,0,0,0.55)");
  eg.addColorStop(1, "rgba(0,0,0,0)");
  s.fillStyle = eg;
  s.fillRect(-W / 2, -H1, W, 18);
  // fascia board with a lit top edge
  s.strokeStyle = trim;
  s.lineWidth = 4;
  s.lineJoin = "round";
  s.beginPath();
  s.moveTo(-W / 2 - 14, -H1 + 2);
  s.lineTo(0, -H1 - 82);
  s.lineTo(W / 2 + 14, -H1 + 2);
  s.stroke();
  s.strokeStyle = "rgba(0,0,0,0.35)";
  s.lineWidth = 1.2;
  s.beginPath();
  s.moveTo(-W / 2 - 12, -H1 + 5);
  s.lineTo(0, -H1 - 78);
  s.lineTo(W / 2 + 12, -H1 + 5);
  s.stroke();
  // windows
  const wins = [[-80, -140], [0, -140], [80, -140], [-72, -70], [72, -70]];
  wins.forEach(([wx, wy], i) => {
    const on = lit.includes(i);
    const ww = 38, wh = 46;
    // recess: shadow inside the top and left reveal
    s.fillStyle = "rgba(0,0,0,0.5)";
    s.fillRect(wx - ww / 2 - 2, wy - 2, ww + 4, wh + 4);
    if (on) {
      // interior: warm back wall lit by a ceiling lamp, darker floor band, curtains with folds
      const ig = s.createRadialGradient(wx + 4, wy + 4, 2, wx, wy + wh * 0.4, wh);
      ig.addColorStop(0, mix(glowC, "#fffaf0", 0.65));
      ig.addColorStop(0.5, glowC);
      ig.addColorStop(1, shade(glowC, -0.45));
      s.fillStyle = ig;
      s.fillRect(wx - ww / 2, wy, ww, wh);
      s.fillStyle = rgba(shade(glowC, -0.6), 0.6);
      s.fillRect(wx - ww / 2, wy + wh * 0.8, ww, wh * 0.2);
      for (const side of [-1, 1]) {
        const cx = side < 0 ? wx - ww / 2 : wx + ww / 2 - 9;
        const cg = s.createLinearGradient(cx, 0, cx + 9, 0);
        const cc = shade(glowC, -0.35);
        cg.addColorStop(0, cc); cg.addColorStop(0.3, shade(cc, 0.15)); cg.addColorStop(0.55, shade(cc, -0.25)); cg.addColorStop(0.8, shade(cc, 0.1)); cg.addColorStop(1, shade(cc, -0.3));
        s.fillStyle = cg;
        s.fillRect(cx, wy, 9, wh);
      }
    } else {
      // dark glass reflecting the sky: gradient + a diagonal sheen
      const gr = s.createLinearGradient(wx - ww / 2, wy, wx + ww / 2, wy + wh);
      gr.addColorStop(0, night ? "#2a3448" : "#b8cce0");
      gr.addColorStop(0.5, night ? "#121826" : "#6a809a");
      gr.addColorStop(1, night ? "#0a0d14" : "#40506a");
      s.fillStyle = gr;
      s.fillRect(wx - ww / 2, wy, ww, wh);
      s.save();
      s.beginPath(); s.rect(wx - ww / 2, wy, ww, wh); s.clip();
      s.fillStyle = night ? "rgba(140,160,200,0.12)" : "rgba(255,255,255,0.28)";
      s.beginPath();
      s.moveTo(wx - ww / 2 + 6, wy + wh); s.lineTo(wx - ww / 2 + 22, wy); s.lineTo(wx - ww / 2 + 30, wy); s.lineTo(wx - ww / 2 + 14, wy + wh);
      s.fill();
      s.restore();
    }
    // frame + muntins with a lit top/left bevel and a shadowed bottom/right
    s.strokeStyle = trim;
    s.lineWidth = 3;
    s.strokeRect(wx - ww / 2, wy, ww, wh);
    s.lineWidth = 1.6;
    s.beginPath();
    s.moveTo(wx, wy); s.lineTo(wx, wy + wh);
    s.moveTo(wx - ww / 2, wy + wh / 2); s.lineTo(wx + ww / 2, wy + wh / 2);
    s.stroke();
    s.strokeStyle = "rgba(0,0,0,0.35)";
    s.lineWidth = 1;
    s.beginPath();
    s.moveTo(wx + ww / 2 + 1.5, wy); s.lineTo(wx + ww / 2 + 1.5, wy + wh + 1.5); s.lineTo(wx - ww / 2, wy + wh + 1.5);
    s.stroke();
    // sill with drop shadow
    s.fillStyle = trim;
    s.fillRect(wx - ww / 2 - 4, wy + wh, ww + 8, 4);
    s.fillStyle = "rgba(255,255,255,0.25)";
    s.fillRect(wx - ww / 2 - 4, wy + wh, ww + 8, 1);
    s.fillStyle = "rgba(0,0,0,0.3)";
    s.fillRect(wx - ww / 2 - 2, wy + wh + 4, ww + 6, 4);
  });
  // door: raised panels, brass knob, small canopy
  s.fillStyle = "rgba(0,0,0,0.5)";
  s.fillRect(-20, -64, 40, 64);
  s.fillStyle = door;
  s.fillRect(-18, -62, 36, 62);
  for (const [px, py] of [[-14, -57], [2, -57], [-14, -28], [2, -28]]) {
    s.fillStyle = "rgba(0,0,0,0.22)";
    s.fillRect(px, py, 12, 22);
    s.fillStyle = "rgba(255,255,255,0.08)";
    s.fillRect(px + 1.5, py + 1.5, 9, 19);
  }
  s.fillStyle = "rgba(0,0,0,0.3)";
  s.fillRect(-18, -62, 36, 6);
  const kg = s.createRadialGradient(9.4, -30.6, 0.2, 10, -30, 2.4);
  kg.addColorStop(0, "#fff0c0"); kg.addColorStop(0.5, "#c9a54a"); kg.addColorStop(1, "#5a4012");
  s.fillStyle = kg;
  s.beginPath(); s.arc(10, -30, 2.4, 0, TAU); s.fill();
  s.fillStyle = shade(trim, -0.1);
  s.fillRect(-26, -70, 52, 5);
  s.fillStyle = "rgba(0,0,0,0.35)";
  s.fillRect(-24, -65, 48, 5);
  // foundation + step + AO along the ground
  s.fillStyle = night ? "#2a2c30" : "#8a8680";
  s.fillRect(-W / 2, -8, W, 8);
  s.fillStyle = shade(trim, -0.2);
  s.fillRect(-30, -4, 60, 6);
  s.fillStyle = "rgba(255,255,255,0.15)";
  s.fillRect(-30, -4, 60, 1);
  const ag = s.createLinearGradient(0, -22, 0, 0);
  ag.addColorStop(0, "rgba(0,0,0,0)");
  ag.addColorStop(1, "rgba(0,0,0,0.35)");
  s.fillStyle = ag;
  s.fillRect(-W / 2, -22, W, 22);
}
// house(g, x, y, scale, {windowsLit, lit:[0..5], night, wall, roof, trim, door, porchLight, t, glowColor})
// A two-storey suburban house (~240*scale wide, ~250*scale tall), x, y = bottom centre. Siding,
// shingles, brick chimney, recessed windows (sky reflections, or lit interiors with curtains).
// Window indices: 0..2 upstairs left->right, 3..4 downstairs either side of the door.
export function house(g, x, y, scale = 1, o = {}) {
  const night = o.night !== false;
  const wall = o.wall || (night ? "#4b4f5a" : "#d8cbb4"), roof = o.roof || (night ? "#23252c" : "#4a3a3a");
  const trim = o.trim || (night ? "#8a8e98" : "#efe9de"), door = o.door || "#6b2f2a";
  const lit = o.lit || (o.windowsLit === false ? [] : o.windowsLit === true || o.windowsLit == null ? [1, 3] : o.windowsLit);
  const glowC = o.glowColor || "#ffcf8a";
  const t = o.t || 0;
  const res = scale > 1.2 ? 2 : 1;
  const SW = 300, SH = 270, ox = 150, oy = 268;
  const key = `house2:${wall}:${roof}:${trim}:${door}:${night ? 1 : 0}:${lit.join(",")}:${glowC}`;
  const spr = sprite(key, SW * res, SH * res, (s) => { s.scale(res, res); s.translate(ox, oy); paintHouse(s, { wall, roof, trim, door, night, lit, glowC }); });
  shadowBlob(g, x, y + 2 * scale, 135 * scale, 8 * scale, { alpha: night ? 0.35 : 0.45 });
  g.drawImage(spr, x - ox * scale, y - oy * scale, SW * scale, SH * scale);
  const wins = [[-80, -140], [0, -140], [80, -140], [-72, -70], [72, -70]];
  lit.forEach((i) => {
    const [wx, wy] = wins[i] || [0, 0];
    const flick = 0.5 + 0.5 * Math.sin(t * 7 + i * 3) * Math.sin(t * 3.1 + i);
    // the TV-ish flicker / lamp breathing inside
    glow(g, x + wx * scale, y + (wy + 20) * scale, 22 * scale, glowC, 0.12 * flick);
    if (night) {
      glow(g, x + wx * scale, y + (wy + 23) * scale, 60 * scale, glowC, 0.22);
      // light falling out of the window onto the ground / porch roof
      if (wy > -100) lightPool(g, x + wx * scale, y + 4 * scale, 60 * scale, glowC, { flat: 0.18, intensity: 0.35 });
    }
  });
  if (night && o.porchLight !== false) {
    lightPool(g, x + 24 * scale, y - 70 * scale, 70 * scale, "#ffd79a", { intensity: 0.55 });
    lightPool(g, x + 10 * scale, y + 2 * scale, 80 * scale, "#ffd79a", { flat: 0.2, intensity: 0.5 });
    glow(g, x + 24 * scale, y - 70 * scale, 5 * scale, "#ffffff", 0.95);
  }
}

// room(g, W, H, {wall, floor, night, horizon, lamp:{x,y,color,strength}, window:{x,y,w,h,outside(g,x,y,w,h)}, rain, t, frame, wallpaper})
// A bedroom-style interior seen from inside: papered back wall, skirting with AO, varnished
// plank floor in true perspective, an optional window (its outside drawn by your callback,
// clipped) that throws a light patch on the floor, and a lamp with inverse-square falloff.
export function room(g, W, H, o = {}) {
  const hz = (o.horizon == null ? 0.68 : o.horizon) * H;
  const night = o.night !== false;
  const wall = o.wall || (night ? "#3d3540" : "#cdb9a0"), floor = o.floor || (night ? "#2e2119" : "#7a5638");
  g.fillStyle = wall;
  g.fillRect(0, 0, W, hz);
  if (o.wallpaper !== false) texRect(g, "wallpaper", 0, 0, W, hz, { scale: 150, tex: { seed: 6, color: wall, age: 0.35 } });
  // light falls off toward the ceiling
  const wg = g.createLinearGradient(0, 0, 0, hz);
  wg.addColorStop(0, "rgba(0,0,0,0.45)");
  wg.addColorStop(0.5, "rgba(0,0,0,0.12)");
  wg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = wg;
  g.fillRect(0, 0, W, hz);
  const w = o.window;
  if (w) {
    g.save();
    g.beginPath();
    g.rect(w.x, w.y, w.w, w.h);
    g.clip();
    if (typeof w.outside === "function") { try { w.outside(g, w.x, w.y, w.w, w.h); } catch (err) { console.warn("[filmkit] room window", err); } }
    else { g.fillStyle = night ? "#0b1424" : "#9cc4e8"; g.fillRect(w.x, w.y, w.w, w.h); }
    if (o.rain) glassDrops(g, w.x, w.y, w.w, w.h, o.t || 0, { seed: 31 });
    // reflection of the room on the glass (stronger when it is dark outside)
    const rg = g.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h);
    rg.addColorStop(0, `rgba(255,240,220,${night ? 0.08 : 0.05})`);
    rg.addColorStop(0.45, "rgba(255,255,255,0)");
    rg.addColorStop(0.55, `rgba(255,255,255,${night ? 0.05 : 0.08})`);
    rg.addColorStop(0.62, "rgba(255,255,255,0)");
    rg.addColorStop(1, `rgba(255,240,220,${night ? 0.05 : 0.03})`);
    g.fillStyle = rg;
    g.fillRect(w.x, w.y, w.w, w.h);
    g.restore();
    const fr = o.frame || (night ? "#8a8078" : "#efe9de");
    // painted wooden frame: bevelled, with inner shadow on the glass
    aoEdge(g, w.x, w.y + 4, w.x + w.w, w.y + 4, { width: 10, alpha: 0.5, side: -1 });
    g.strokeStyle = fr;
    g.lineWidth = 8;
    g.strokeRect(w.x, w.y, w.w, w.h);
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(w.x + w.w / 2, w.y);
    g.lineTo(w.x + w.w / 2, w.y + w.h);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.18)";
    g.lineWidth = 1;
    g.strokeRect(w.x - 3.5, w.y - 3.5, w.w + 7, w.h + 7);
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.strokeRect(w.x + 3.5, w.y + 3.5, w.w - 7, w.h - 7);
    g.fillStyle = shade(fr, -0.15);
    g.fillRect(w.x - 14, w.y + w.h, w.w + 28, 12);
    g.fillStyle = "rgba(255,255,255,0.22)";
    g.fillRect(w.x - 14, w.y + w.h, w.w + 28, 2);
    const sg = g.createLinearGradient(0, w.y + w.h + 12, 0, w.y + w.h + 30);
    sg.addColorStop(0, "rgba(0,0,0,0.45)");
    sg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sg;
    g.fillRect(w.x - 14, w.y + w.h + 12, w.w + 28, 18);
  }
  // floor: varnished planks in perspective (eye line above the skirting)
  const eye = hz - (H - hz) * 0.9;
  g.fillStyle = floor;
  g.fillRect(0, hz, W, H - hz);
  groundPlane(g, W, H, { tex: "wood", texOpts: { seed: 7, color: floor, planks: 7, joints: 1, varnish: true }, horizon: eye, y0: hz, scale: W * 0.42, focal: W * 0.8, fogAmt: 0, rot90: true, variation: 0.3 });
  const fg = g.createLinearGradient(0, hz, 0, H);
  fg.addColorStop(0, "rgba(0,0,0,0.35)");
  fg.addColorStop(0.4, "rgba(0,0,0,0.08)");
  fg.addColorStop(1, "rgba(0,0,0,0.2)");
  g.fillStyle = fg;
  g.fillRect(0, hz, W, H - hz);
  if (w) {
    // the window's light patch on the floor (moonlight or daylight), and its reflection in the varnish
    const pc = night ? "#8aa4d8" : "#fff1d0";
    const fy = hz + (H - hz) * 0.15, drop = (H - hz) * 0.8;
    g.save();
    g.globalCompositeOperation = "lighter";
    const pg = g.createLinearGradient(0, fy, 0, fy + drop);
    pg.addColorStop(0, rgba(pc, night ? 0.1 : 0.2));
    pg.addColorStop(1, rgba(pc, 0));
    g.fillStyle = pg;
    g.beginPath();
    g.moveTo(w.x + w.w * 0.05, fy);
    g.lineTo(w.x + w.w * 0.95, fy);
    g.lineTo(w.x + w.w * 1.35, fy + drop);
    g.lineTo(w.x + w.w * 0.15, fy + drop);
    g.closePath();
    g.fill();
    g.restore();
  }
  // skirting board: lit top edge, AO on the wall above and the floor below
  aoEdge(g, 0, hz - 10, W, hz - 10, { width: 16, alpha: 0.4, side: 1 });
  g.fillStyle = shade(wall, -0.45);
  g.fillRect(0, hz - 10, W, 10);
  g.fillStyle = "rgba(255,255,255,0.1)";
  g.fillRect(0, hz - 10, W, 1.5);
  aoEdge(g, 0, hz, W, hz, { width: 22, alpha: 0.45, side: -1 });
  if (o.lamp) {
    const L = o.lamp;
    const c = L.color || "#ffcf8a", s = L.strength == null ? 1 : L.strength;
    lightPool(g, L.x, L.y, W * 0.6, c, { intensity: 0.5 * s });
    lightPool(g, L.x, L.y, W * 0.22, c, { intensity: 0.45 * s, hard: 0.5 });
    lightPool(g, L.x, hz + (H - hz) * 0.3, W * 0.45, c, { flat: 0.3, intensity: 0.35 * s });
    glow(g, L.x, L.y, 10, "#ffffff", 0.9 * s);
  }
  // corners fall into shadow
  const vg = g.createRadialGradient(W / 2, H * 0.55, H * 0.2, W / 2, H * 0.55, W * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.5)");
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
}

// bed(g, x, y, w, {quilt:[c1,c2,c3], night, t}) - the patchwork-quilt bed (x, y = bottom-left):
// wooden frame, soft pillow, puffy stitched quilt with folds and contact shadow.
export function bed(g, x, y, w, o = {}) {
  const q = o.quilt || ["#4a6fa5", "#e0b25a", "#c2575b"];
  const h = w * 0.42;
  shadowBlob(g, x + w * 0.5, y, w * 0.55, h * 0.08, { alpha: 0.6 });
  const posts = new Path2D();
  posts.rect(x, y - h * 1.4, w * 0.06, h * 1.4);
  posts.rect(x + w * 0.94, y - h * 0.9, w * 0.06, h * 0.9);
  g.fillStyle = "#3a2a20";
  g.fill(posts);
  texFill(g, "wood", posts, { scale: h, rot: Math.PI / 2, alpha: 0.8, tex: { seed: 9, color: "#5a3a26", planks: 2, varnish: true } });
  g.fillStyle = "rgba(255,230,200,0.12)";
  g.fillRect(x, y - h * 1.4, w * 0.015, h * 1.4);
  // pillow: soft fabric with form shading
  const pg = g.createRadialGradient(x + w * 0.15, y - h * 0.9, 2, x + w * 0.18, y - h * 0.82, w * 0.13);
  pg.addColorStop(0, "#f4efe6");
  pg.addColorStop(0.7, "#d8d0c2");
  pg.addColorStop(1, "#a89e8e");
  g.fillStyle = pg;
  g.beginPath();
  g.ellipse(x + w * 0.18, y - h * 0.82, w * 0.12, h * 0.16, -0.1, 0, TAU);
  g.fill();
  const quilt = new Path2D();
  quilt.moveTo(x + w * 0.05, y - h * 0.7);
  quilt.quadraticCurveTo(x + w * 0.5, y - h * 0.86, x + w * 0.96, y - h * 0.7);
  quilt.lineTo(x + w * 0.98, y - h * 0.15);
  quilt.quadraticCurveTo(x + w * 0.5, y - h * 0.08, x + w * 0.03, y - h * 0.15);
  quilt.closePath();
  texFill(g, "quilt", quilt, { scale: w * 0.42, scaleY: w * 0.3, _x: x, _y: y - h, tex: { seed: 2, colors: q.concat(["#e8dcc6"]) } });
  g.save();
  g.clip(quilt);
  const sg = g.createLinearGradient(0, y - h, 0, y);
  sg.addColorStop(0, "rgba(255,240,220,0.12)");
  sg.addColorStop(0.55, "rgba(0,0,0,0.05)");
  sg.addColorStop(1, "rgba(0,0,0,0.5)");
  g.fillStyle = sg;
  g.fillRect(x, y - h, w, h);
  // soft folds
  g.strokeStyle = "rgba(0,0,0,0.18)";
  g.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo(x + w * (0.3 + i * 0.22), y - h * 0.7);
    g.quadraticCurveTo(x + w * (0.34 + i * 0.22), y - h * 0.4, x + w * (0.28 + i * 0.22), y - h * 0.15);
    g.stroke();
  }
  g.restore();
  g.fillStyle = "#2a1e16";
  g.fillRect(x, y - h * 0.15, w, h * 0.15);
  g.fillStyle = "rgba(255,230,200,0.1)";
  g.fillRect(x, y - h * 0.15, w, 1.5);
}

// streetlamp(g, x, y, h, {on, t, color, flicker, cone, ground}) - x, y = foot of the pole. A cast
// iron post with a lantern head; when on: a volumetric cone through the damp air, an
// inverse-square pool on the ground (at y or `ground`), and a hot lens.
export function streetlamp(g, x, y, h = 200, o = {}) {
  const on = o.on !== false, color = o.color || "#ffb25a";
  const t = o.t || 0;
  const fl = 1 - (o.flicker || 0) * (Math.sin(t * 23) * Math.sin(t * 7.3) > 0.6 ? 0.6 : 0);
  const hx = x + h * 0.16, hy = y - h;
  const gy = o.ground == null ? y : o.ground;
  if (on) {
    lightPool(g, hx, gy, h * 0.75, color, { flat: 0.2, intensity: 0.75 * fl });
    lightPool(g, hx, gy, h * 0.28, mix(color, "#fff2d8", 0.4), { flat: 0.2, intensity: 0.45 * fl, hard: 0.5 });
    if (o.cone !== false) volumetricBeam(g, hx, hy + 3, Math.PI / 2, (gy - hy) * 1.02, 0.9, { color, intensity: 0.42 * fl, t, width0: 14 });
  }
  shadowBlob(g, x, y, 10, 3, { alpha: 0.5 });
  const pg = g.createLinearGradient(x - 4, 0, x + 4, 0);
  pg.addColorStop(0, "#121418");
  pg.addColorStop(0.35, "#3a3e46");
  pg.addColorStop(0.55, "#5a5f6a");
  pg.addColorStop(1, "#0e1014");
  g.fillStyle = pg;
  g.beginPath();
  g.moveTo(x - 4.5, y - 10);
  g.lineTo(x - 2.8, y - h + 4);
  g.lineTo(x + 2.8, y - h + 4);
  g.lineTo(x + 4.5, y - 10);
  g.closePath();
  g.fill();
  g.fillRect(x - 8, y - 12, 16, 12);
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fillRect(x - 8, y - 12, 16, 1.5);
  if (on) {
    // warm light catching the side of the post nearest the lamp
    const lg = g.createLinearGradient(0, y - h, 0, y - h * 0.4);
    lg.addColorStop(0, rgba(color, 0.55 * fl));
    lg.addColorStop(1, rgba(color, 0));
    g.fillStyle = lg;
    g.fillRect(x + 0.5, y - h, 2.5, h * 0.6);
  }
  g.strokeStyle = "#24272e";
  g.lineWidth = 4;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(x, y - h + 6);
  g.quadraticCurveTo(x, y - h - 8, hx, hy - 4);
  g.stroke();
  g.fillStyle = "#24272e";
  g.beginPath();
  g.moveTo(hx - 13, hy);
  g.lineTo(hx + 13, hy);
  g.lineTo(hx + 7, hy - 10);
  g.lineTo(hx - 7, hy - 10);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.14)";
  g.fillRect(hx - 7, hy - 10, 14, 1.4);
  if (on) {
    g.fillStyle = mix(color, "#ffffff", 0.75);
    g.fillRect(hx - 9, hy, 18, 3.4);
    glow(g, hx, hy + 2, h * 0.5, color, 0.32 * fl);
    glow(g, hx, hy + 2, h * 0.16, color, 0.55 * fl);
    glow(g, hx, hy + 2, 12, "#ffffff", 0.9 * fl);
  }
}

// puddleReflection(g, drawFn, y, alpha, {x0, x1, ripple, t, tint, clip(g)}) - mirror whatever
// drawFn(g) paints about the line y, clipped below it (or to your clip path), with ripples and a
// fresnel falloff (the reflection is strongest at grazing angles, near the far edge).
export function puddleReflection(g, drawFn, y, alpha = 0.4, o = {}) {
  const W = g.canvas.width / pixelScale(), H = g.canvas.height / pixelScale();
  const Lr = layer(W, H, "puddle");
  try { drawFn(Lr.g); } catch (err) { console.warn("[filmkit] puddle drawFn", err); }
  g.save();
  if (typeof o.clip === "function") { g.beginPath(); o.clip(g); g.clip(); }
  else { g.beginPath(); g.rect(o.x0 || 0, y, (o.x1 == null ? W : o.x1) - (o.x0 || 0), H - y); g.clip(); }
  const A = g.globalAlpha * alpha;
  const t = o.t || 0, rip = o.ripple == null ? 1 : o.ripple;
  const strips = 30;
  const sh = (H - y) / strips;
  const px = pixelScale();
  for (let i = 0; i < strips; i++) {
    const dy = y + i * sh;
    const off = (Math.sin(t * 2.2 + i * 1.7) + 0.4 * Math.sin(t * 3.7 + i * 4.1)) * rip * (1 + i * 0.12);
    const srcY = y - (i + 1) * sh;
    if (srcY + sh < 0) break;
    g.globalAlpha = A * (1 - (i / strips) * 0.45);
    g.save();
    g.translate(off, dy + sh);
    g.scale(1, -1);
    g.drawImage(Lr.canvas, 0, Math.max(0, srcY) * px, W * px, sh * px, 0, 0, W, sh);
    g.restore();
  }
  g.globalAlpha = 1;
  const tg = g.createLinearGradient(0, y, 0, H);
  tg.addColorStop(0, rgba(o.tint || "#0b1424", 0.12));
  tg.addColorStop(1, rgba(o.tint || "#0b1424", 0.6));
  g.fillStyle = tg;
  g.fillRect(0, y, W, H - y);
  // bright meniscus along the far edge
  const mg = g.createLinearGradient(0, y, 0, y + 3);
  mg.addColorStop(0, `rgba(220,230,245,${0.25 * alpha})`);
  mg.addColorStop(1, "rgba(220,230,245,0)");
  g.fillStyle = mg;
  g.fillRect(0, y, W, 3);
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

// cardboardBox(g, x, y, w, h, {wet, text}) - the soggy box; x, y = bottom centre. Kraft board with
// fibres, shaded faces and flaps, packing tape, water wicking up from the bottom when wet.
export function cardboardBox(g, x, y, w, h, o = {}) {
  const base = "#9a7448";
  const wet = clamp(o.wet || 0);
  const c = mix(base, "#4a3420", wet * 0.5);
  shadowBlob(g, x, y + 1, w * 0.58, Math.max(3, h * 0.07), { alpha: 0.55 });
  const front = new Path2D();
  front.rect(x - w / 2, y - h, w, h);
  g.fillStyle = shade(c, -0.15);
  g.fill(front);
  texFill(g, "cardboard", front, { scale: Math.max(80, w), _x: x - w / 2, _y: y - h, alpha: 0.9, tex: { seed: 2, color: c } });
  const fl = new Path2D();
  fl.moveTo(x - w / 2, y - h);
  fl.lineTo(x - w / 2 - w * 0.12, y - h - h * 0.35);
  fl.lineTo(x - w * 0.05, y - h - h * 0.2);
  fl.lineTo(x, y - h);
  fl.closePath();
  const fr = new Path2D();
  fr.moveTo(x + w / 2, y - h);
  fr.lineTo(x + w / 2 + w * 0.1, y - h - h * 0.3);
  fr.lineTo(x + w * 0.05, y - h - h * 0.22);
  fr.lineTo(x, y - h);
  fr.closePath();
  g.fillStyle = shade(c, 0.08);
  g.fill(fl);
  texFill(g, "cardboard", fl, { scale: Math.max(80, w), alpha: 0.6, tex: { seed: 3, color: c } });
  g.fillStyle = shade(c, -0.05);
  g.fill(fr);
  texFill(g, "cardboard", fr, { scale: Math.max(80, w), alpha: 0.6, tex: { seed: 4, color: c } });
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.fill(fr);
  g.save();
  g.clip(front);
  // form shading: top lit, side falloff, dark inside lip under the flaps
  const sg = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  sg.addColorStop(0, "rgba(255,240,210,0.1)");
  sg.addColorStop(0.6, "rgba(0,0,0,0)");
  sg.addColorStop(1, "rgba(0,0,0,0.3)");
  g.fillStyle = sg;
  g.fillRect(x - w / 2, y - h, w, h);
  const lg = g.createLinearGradient(0, y - h, 0, y - h + h * 0.12);
  lg.addColorStop(0, "rgba(0,0,0,0.45)");
  lg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = lg;
  g.fillRect(x - w / 2, y - h, w, h * 0.12);
  // packing tape strip
  g.fillStyle = "rgba(200,170,110,0.45)";
  g.fillRect(x - w * 0.08, y - h, w * 0.16, h * 0.28);
  g.fillStyle = "rgba(255,245,220,0.25)";
  g.fillRect(x - w * 0.08, y - h, w * 0.02, h * 0.28);
  if (wet > 0) {
    // water wicks up from the ground and soaks down from the top, with a darker tide line
    const wg = g.createLinearGradient(0, y, 0, y - h * 0.55);
    wg.addColorStop(0, `rgba(30,20,8,${0.55 * wet})`);
    wg.addColorStop(0.8, `rgba(30,20,8,${0.3 * wet})`);
    wg.addColorStop(0.86, `rgba(20,12,4,${0.45 * wet})`);
    wg.addColorStop(1, "rgba(30,20,8,0)");
    g.fillStyle = wg;
    g.fillRect(x - w / 2, y - h * 0.55, w, h * 0.55);
    const tg = g.createLinearGradient(0, y - h, 0, y - h * 0.4);
    tg.addColorStop(0, `rgba(40,25,10,${0.5 * wet})`);
    tg.addColorStop(1, "rgba(40,25,10,0)");
    g.fillStyle = tg;
    g.fillRect(x - w / 2, y - h, w, h * 0.6);
    g.fillStyle = `rgba(200,210,230,${0.12 * wet})`;
    g.fillRect(x - w * 0.42, y - h, w * 0.05, h);
  }
  g.restore();
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 1;
  g.strokeRect(x - w / 2 + 0.5, y - h + 0.5, w - 1, h - 1);
  if (o.text) {
    g.fillStyle = "rgba(20,20,30,0.82)";
    g.font = `700 ${Math.round(h * 0.28)}px "Comic Sans MS", "Segoe Print", cursive`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(o.text, x, y - h * 0.5);
  }
}
