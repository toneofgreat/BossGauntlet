// films/f12.js - Chapter 12 "Echoes" (FILMS.md f12). Pieces of your home float in the indigo Void,
// each lit by its own lamp. A golden afterimage of Biscuit curls into the warm hollow on your quilt,
// then sits at the sunny window until your hand reaches for him. The islands line up into a path.
// draw(g, t, W, H) is a pure function of t; static art (islands, nebula) is cached in sprites.
import * as K from "../filmkit.js";
import { povHand, hairOver } from "./lib1214.js";

const D = 66;
const VW = 960, VH = 540;
const XF = 0.9; // cross-dissolve length (s)

// ---- palette ----------------------------------------------------------------------------------------
const VOID = "#0a0a1e";
const LAMP = { bed: "#ffcf8a", window: "#bfe4ff", kitchen: "#ffe8b0", door: "#ffc27a" };
const GOLD = "#ffcf7a";

// ---- the void -----------------------------------------------------------------------------------------
function nebulaSprite() {
  return K.sprite("f12:nebula", 1400, 800, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#07071a");
    bg.addColorStop(0.45, "#0d0d26");
    bg.addColorStop(0.8, "#12102c");
    bg.addColorStop(1, "#090818");
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const R = K.rng("f12neb");
    // interstellar dust: two domain-warped nebula fields at different scales (soft, low contrast so it
    // reads as deep space haze, not a painted backdrop), with a dark dust lane cutting across
    g.globalAlpha = 0.5;
    g.drawImage(K.texture("nebula", { size: 256, seed: 12, colors: ["#141a48", "#3a2460", "#6a4a78"] }), -100, -60, w + 200, h + 120);
    g.globalAlpha = 0.32;
    g.globalCompositeOperation = "lighter";
    g.drawImage(K.texture("nebula", { size: 192, seed: 4, colors: ["#101c40", "#28447a", "#8a6a8a"] }), 0, h * 0.15, w, h * 0.7);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    const lane = g.createLinearGradient(0, h * 0.3, 0, h * 0.7);
    lane.addColorStop(0, "rgba(4,4,12,0)");
    lane.addColorStop(0.5, "rgba(4,4,12,0.35)");
    lane.addColorStop(1, "rgba(4,4,12,0)");
    g.fillStyle = lane;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const x = R() * w, y = R() * h, b = R();
      const s = b > 0.985 ? 1.6 : b > 0.9 ? 1.1 : 0.7;
      g.fillStyle = K.rgba(b > 0.6 ? "#dfe4ff" : "#b8b0ff", 0.18 + b * 0.55);
      g.fillRect(x, y, s, s);
    }
  });
}
function voidBg(g, px, py) {
  const s = nebulaSprite();
  // the nebula is 1400 wide drawn from x = -220 - px: keep px in 0..220 so it always covers 0..960
  px = K.clamp(px, 0, 220);
  py = K.clamp(py, -130, 130);
  g.drawImage(s, -220 - px, -130 - py, 1400, 800);
  // depth: a star field at mid distance and a near layer of faint dust wisps, each with more parallax
  const sx = (px * 1.35) % 1200, sy = py * 1.2;
  const sf = starField();
  for (const ox of [-sx, 1200 - sx]) if (ox < VW && ox + 1200 > 0) g.drawImage(sf, ox, -60 - sy * 0.3, 1200, 680);
  const nw = nearWisps(), wx = (px * 2.2) % 1400;
  g.save();
  g.globalCompositeOperation = "lighter";
  for (const ox of [-wx, 1400 - wx]) if (ox < VW && ox + 1400 > 0) g.drawImage(nw, ox, -80 - py * 0.6, 1400, 720);
  g.restore();
}
// stars with a real magnitude distribution: most barely visible, a few bright ones with colour (blue-white
// to amber) and a soft halo; baked once
function starField() {
  return K.sprite("f12:stars", 1200, 680, (g, w, h) => {
    const R = K.rng("f12stars");
    for (let i = 0; i < 1400; i++) {
      const x = R() * w, y = R() * h, m = Math.pow(R(), 5);
      const temp = R();
      const col = temp < 0.2 ? "#ffd6a8" : temp < 0.55 ? "#fff6ea" : temp < 0.85 ? "#dfe6ff" : "#b8c8ff";
      const a = 0.08 + m * 0.9, r = 0.35 + m * 1.1;
      g.fillStyle = K.rgba(col, a);
      g.beginPath();
      g.arc(x, y, r, 0, K.TAU);
      g.fill();
      if (m > 0.35) K.glow(g, x, y, 3 + m * 7, col, 0.18 * m);
    }
  });
}
// near interstellar dust: soft fbm wisps, cool, very faint, so the Void has depth in front of the stars
function nearWisps() {
  return K.sprite("f12:wisps", 1400, 720, (g, w, h) => {
    g.globalAlpha = 0.16;
    g.drawImage(K.texture("nebula", { size: 192, seed: 21, colors: ["#000000", "#2a2c5a", "#5a4a7a"] }), 0, 0, w, h);
    g.globalAlpha = 0.1;
    g.drawImage(K.texture("nebula", { size: 128, seed: 33, colors: ["#000000", "#203a6a", "#7a6a9a"] }), 0, h * 0.3, w, h * 0.6);
  });
}
// dust motes drifting slowly downward (crumbs from the islands) and slow upward glitter
function motes(g, t, seed, n, alpha = 1) {
  for (let i = 0; i < n; i++) {
    const h1 = K.hash(i, seed), h2 = K.hash(i, seed + 1), h3 = K.hash(i, seed + 2);
    const sp = 6 + h3 * 14;
    const x = ((h1 * 1100 + Math.sin(t * 0.3 + i) * 12) % 1100) - 70;
    const y = ((h2 * 640 + t * sp) % 640) - 50;
    const tw = 0.5 + 0.5 * Math.sin(t * (1 + h3 * 2) + i);
    const r = 1 + h3 * 2.2;
    K.glow(g, x, y, r * 3, i % 3 ? "#c9c2ff" : "#ffd9a0", 0.25 * tw * alpha);
  }
}

// ---- floating islands (pieces of home) ------------------------------------------------------------
// Island local units: top-surface centre at (0,0), top ellipse rx 105 / ry 30, objects up to y -200,
// underside crag to y +180. Sprites are painted at `sc` px per unit.
const ISL = {
  bed: { lamp: [-86, -66], color: LAMP.bed, floor: "wood" },
  window: { lamp: [0, -98], color: LAMP.window, floor: "wood" },
  kitchen: { lamp: [8, -150], color: LAMP.kitchen, floor: "tile" },
  door: { lamp: [-53, -120], color: LAMP.door, floor: "wood" },
};
const IW = 300, IH = 420, IOX = 150, IOY = 215;

function topPath(seed) {
  const R = K.rng("top" + seed);
  const pts = [];
  const N = 22;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * K.TAU;
    const j = 0.9 + R() * 0.1;
    pts.push(Math.cos(a) * 105 * j, Math.sin(a) * 30 * j);
  }
  return pts;
}

// the broken earth under an island, baked per pixel once: wavy strata of topsoil, clay and shale, embedded
// stones (voronoi cells lifted and lit), fine cracks, all lit from above-left with cavity occlusion.
// u across, v down (0 = the floor slab, 1 = the tip of the crag).
function rockH(u, v, sd) {
  const warp = K.texFbm(u * 3, v * 3, sd, 3) * 0.06;
  const strata = Math.sin((v + warp) * 46) * 0.12 + Math.sin((v + warp * 2) * 13) * 0.08;
  const vr = K.texVoronoi(u * 9, v * 7, sd + 3);
  const stone = Math.max(0, 0.42 - vr.f1) * 1.4 * (vr.id & 3 ? 1 : 0) * K.clamp(v * 3);
  const crack = -K.texRidged(u * 5, v * 9, sd + 7, 4) * 0.12;
  return strata + stone + crack + K.texFbm(u * 14, v * 14, sd + 9, 3) * 0.06;
}
function rockTex(sd) {
  return K.texBake("f12rock" + sd, 160, 200, (u, v, out) => {
    const h = rockH(u, v, sd), e = 1 / 160;
    const hx = (rockH(u + e, v, sd) - h) * 60, hy = (rockH(u, v + e, sd) - h) * 60;
    let nx = -hx, ny = -hy, nz = 1;
    const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    const lit = Math.max(0, nx * -0.4 + ny * -0.7 + nz * 0.6) * 0.85 + 0.25;
    // colour by depth: dark loam with roots near the top, ochre clay, then cold grey shale
    const vr = K.texVoronoi(u * 9, v * 7, sd + 3);
    const isStone = vr.f1 < 0.42 && vr.id & 3 && v > 0.08;
    const band = Math.sin((v + K.texFbm(u * 3, v * 3, sd, 3) * 0.06) * 46);
    let c = v < 0.16 ? [70, 48, 34] : v < 0.5 ? [118, 86, 58] : [78, 72, 80];
    if (band > 0.5) c = [c[0] * 0.78, c[1] * 0.76, c[2] * 0.8];
    if (isStone) { const k = (vr.id >>> 4 & 255) / 255; c = [120 + k * 50, 112 + k * 44, 108 + k * 40]; }
    const ao = K.clamp(0.55 + h * 1.4);
    const n = 0.9 + K.texNoise(u * 40, v * 40, sd) * 0.12;
    out[0] = c[0] * lit * ao * n; out[1] = c[1] * lit * ao * n; out[2] = c[2] * lit * ao * n; out[3] = 255;
  });
}
function underside(g, kind, seed) {
  const meta = ISL[kind];
  const R = K.rng("under" + seed);
  // crag outline: left rim -> jagged descent -> tip -> right rim
  const pts = [-104, 0];
  const N = 14;
  const tipX = (R() - 0.5) * 40;
  for (let i = 1; i < N; i++) {
    const u = i / N;
    const x = K.lerp(-100, 100, u);
    const dist = 1 - Math.abs(x - tipX) / 120;
    const y = 18 + Math.max(0, dist) ** 1.5 * 150 + (R() - 0.5) * 26 + Math.sin(u * 9) * 6;
    pts.push(x, Math.max(14, y));
  }
  pts.push(104, 0, 70, 22, 0, 30, -70, 22);
  const p = new Path2D();
  K.spline(p, pts, true, 0.6);
  const gr = g.createLinearGradient(0, 0, 0, 170);
  gr.addColorStop(0, "#d8c0b0");
  gr.addColorStop(0.12, "#8a7a8a");
  gr.addColorStop(0.6, "#3a3650");
  gr.addColorStop(1, "#1c1a2c");
  // packed soil and broken stone: two textures at different scales, then form shading on top
  // baked earth / rock texture stretched over the crag (v follows the depth)
  const rt = rockTex(kind.length % 3);
  const rp = g.createPattern(rt, "repeat");
  if (rp.setTransform && typeof DOMMatrix !== "undefined") rp.setTransform(new DOMMatrix([220 / 160, 0, 0, 175 / 200, -110, 0]));
  g.fillStyle = rp;
  g.fill(p);
  g.globalCompositeOperation = "multiply";
  g.fillStyle = gr;
  g.fill(p);
  g.globalCompositeOperation = "source-over";
  g.save();
  g.clip(p);
  // rock strata: layered bands of earth and stone following the crag, each lit on its upper lip
  const bands = ["#6a4c3c", "#4a3430", "#5a4440", "#352a34", "#46342e", "#2a2230", "#33283a"];
  for (let i = 0; i < 7; i++) {
    const y0 = 8 + i * 21 + R() * 6, th = 9 + R() * 11;
    const top = [], bot = [];
    for (let x = -124; x <= 124; x += 12) {
      top.push(x, y0 + Math.sin(x * 0.05 + i) * 3.5 + (R() - 0.5) * 2.5);
      bot.push(x, y0 + th + Math.sin(x * 0.04 + i * 2) * 3 + (R() - 0.5) * 2.5);
    }
    g.fillStyle = K.rgba(bands[i], 0.22);
    g.beginPath();
    for (let j = 0; j < top.length; j += 2) j ? g.lineTo(top[j], top[j + 1]) : g.moveTo(top[j], top[j + 1]);
    for (let j = bot.length - 2; j >= 0; j -= 2) g.lineTo(bot[j], bot[j + 1]);
    g.closePath();
    g.fill();
    g.strokeStyle = K.rgba("#a08070", 0.2 - i * 0.02);
    g.lineWidth = 0.8;
    g.beginPath();
    for (let j = 0; j < top.length; j += 2) j ? g.lineTo(top[j], top[j + 1]) : g.moveTo(top[j], top[j + 1]);
    g.stroke();
    g.strokeStyle = "rgba(0,0,0,0.3)";
    g.beginPath();
    for (let j = 0; j < bot.length; j += 2) j ? g.lineTo(bot[j], bot[j + 1] + 0.8) : g.moveTo(bot[j], bot[j + 1] + 0.8);
    g.stroke();
  }
  // dirt crumbs
  for (let i = 0; i < 70; i++) {
    const x = -100 + R() * 200, y = 6 + R() * 150, r = 0.5 + R() * 1.4;
    g.fillStyle = R() > 0.5 ? "rgba(140,110,95,0.45)" : "rgba(10,8,14,0.5)";
    g.fillRect(x, y, r, r);
  }
  // warm bounce from the island's own lamp on the upper underside (lamp side)
  const bx0 = meta.lamp[0] * 0.8;
  const bnc = g.createRadialGradient(bx0, 4, 4, bx0, 12, 120);
  bnc.addColorStop(0, K.rgba(meta.color, 0.5));
  bnc.addColorStop(0.45, K.rgba(meta.color, 0.14));
  bnc.addColorStop(1, K.rgba(meta.color, 0));
  g.fillStyle = bnc;
  g.fillRect(-120, 0, 240, 130);
  // lamp-side rim light on the crag edge, cool void bounce on the other
  const lx = meta.lamp[0] < 0 ? -1 : 1;
  const rg = g.createLinearGradient(-110 * lx, 0, 110 * lx, 0);
  rg.addColorStop(0, K.rgba(meta.color, 0.42));
  rg.addColorStop(0.35, K.rgba(meta.color, 0));
  rg.addColorStop(0.75, K.rgba("#6d6bd0", 0));
  rg.addColorStop(1, K.rgba("#6d6bd0", 0.28));
  g.strokeStyle = rg;
  g.lineWidth = 7;
  g.stroke(p);
  // underside occlusion
  const og = g.createLinearGradient(0, 0, 0, 40);
  og.addColorStop(0, "rgba(0,0,0,0.55)");
  og.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = og;
  g.fillRect(-120, 4, 240, 40);
  g.restore();
  // hanging roots with rootlets (and one torn cable), with dirt clinging at their tips
  for (let i = 0; i < 9; i++) {
    const x = -80 + R() * 160, y0 = 24 + R() * 50, len = 26 + R() * 60;
    const ex = x + (R() - 0.5) * 16, ey = y0 + len;
    g.strokeStyle = i === 2 ? "rgba(40,40,46,0.9)" : K.rgba(K.mix("#6a5040", "#2a1e1c", R()), 0.85);
    g.lineWidth = i === 2 ? 1.6 : 0.7 + R() * 1.1;
    g.beginPath();
    g.moveTo(x, y0);
    g.bezierCurveTo(x + 6, y0 + len * 0.3, x - 8, y0 + len * 0.6, ex, ey);
    g.stroke();
    if (i !== 2) {
      g.lineWidth = 0.45;
      for (let k = 0; k < 3; k++) {
        const u = 0.3 + k * 0.2, sx = K.lerp(x, ex, u) + (k % 2 ? 2 : -2), sy = K.lerp(y0, ey, u);
        g.beginPath();
        g.moveTo(sx, sy);
        g.quadraticCurveTo(sx + (k % 2 ? 5 : -5), sy + 4, sx + (k % 2 ? 7 : -7), sy + 10 + R() * 6);
        g.stroke();
      }
      g.fillStyle = "rgba(70,52,44,0.8)";
      g.beginPath();
      g.ellipse(ex, ey, 1.6, 2.2, 0, 0, K.TAU);
      g.fill();
    }
  }
  // the floor slab edge (end grain / tile edge)
  const slab = new Path2D();
  slab.moveTo(-104, 0);
  slab.ellipse(0, 0, 104, 29, 0, Math.PI, 0, true);
  slab.lineTo(104, 10);
  slab.ellipse(0, 10, 104, 29, 0, 0, Math.PI, false);
  slab.closePath();
  const sg = g.createLinearGradient(-104, 0, 104, 0);
  const base = meta.floor === "tile" ? "#e8e0d0" : "#d8c0a8"; // multiplied over the material
  sg.addColorStop(0, K.shade(base, lx < 0 ? 0.1 : -0.35));
  sg.addColorStop(0.5, K.shade(base, -0.15));
  sg.addColorStop(1, K.shade(base, lx > 0 ? 0.1 : -0.35));
  // the cut edge of the floor: board ends / tile bed in real material, shaded across by the lamp side
  K.texFill(g, meta.floor === "tile" ? "plaster" : "wood", slab, { scale: 30, scaleY: 12, tex: meta.floor === "tile" ? { seed: 5, stain: 0.6 } : { seed: 6, color: "#8a5a36", planks: 4, varnish: true } });
  g.save();
  g.globalCompositeOperation = "multiply";
  g.fillStyle = sg;
  g.fill(slab);
  g.restore();
  g.strokeStyle = "rgba(0,0,0,0.16)";
  g.lineWidth = 0.6;
  for (let i = -100; i < 100; i += meta.floor === "tile" ? 16 : 11) {
    const yy = 29 * Math.sqrt(Math.max(0, 1 - (i / 104) ** 2));
    g.beginPath();
    g.moveTo(i, yy + 1);
    g.lineTo(i, yy + 9);
    g.stroke();
  }
}

function topSurface(g, kind, seed) {
  const meta = ISL[kind];
  const pts = topPath(seed);
  const p = new Path2D();
  K.spline(p, pts, true, 0.7);
  g.save();
  g.clip(p);
  if (meta.floor === "tile") {
    // grout bed first (dark, recessed), then each glazed tile inset from it: its own tone, a bevel lit
    // on the far edge, worn matt patches where feet go, and the pendant's sheen across the glaze
    g.fillStyle = "#2c2a2a";
    g.fillRect(-120, -36, 240, 72);
    const G = 0.55;
    for (let r = -6; r < 6; r++) for (let c = -8; c < 8; c++) {
      const tone = (K.hash(r * 31 + c, 4) - 0.5) * 0.12;
      const base = (r + c) & 1 ? "#cfc6b4" : "#56606c";
      const y0 = r * 6, x0 = c * 16 + r * 2.5;
      const tile = new Path2D();
      tile.moveTo(x0 + G, y0 + G * 0.4);
      tile.lineTo(x0 + 16 - G, y0 + G * 0.4);
      tile.lineTo(x0 + 16 + 2.5 - G, y0 + 6 - G * 0.4);
      tile.lineTo(x0 + 2.5 + G, y0 + 6 - G * 0.4);
      tile.closePath();
      g.fillStyle = K.shade(base, tone);
      g.fill(tile);
      g.fillStyle = "rgba(255,248,230,0.22)";
      g.fillRect(x0 + G, y0 + G * 0.4, 16 - G * 2, 0.45);
      g.fillStyle = "rgba(0,0,0,0.28)";
      g.fillRect(x0 + 2.5 + G, y0 + 6 - G * 0.4 - 0.5, 16 - G * 2, 0.5);
    }
    // grout occlusion and dirt, fine stone grain in the glaze, scuffed wear on the walking line
    K.texFill(g, "granite", p, { scale: 26, scaleY: 9, alpha: 0.3, mode: "overlay", tex: { seed: 11, lichen: 0 } });
    K.texFill(g, "noise", p, { scale: 40, scaleY: 14, alpha: 0.22, mode: "multiply", tex: { seed: 13, amp: 60 } });
    const wear = g.createRadialGradient(-20, 4, 2, -20, 4, 50);
    wear.addColorStop(0, "rgba(150,140,120,0.22)");
    wear.addColorStop(1, "rgba(150,140,120,0)");
    g.fillStyle = wear;
    g.fillRect(-90, -30, 140, 60);
    // the pendant's reflection: a soft specular streak on the glaze, nearer the camera than the lamp
    g.save();
    g.globalCompositeOperation = "lighter";
    const sp = g.createRadialGradient(8, 8, 0, 8, 8, 34);
    sp.addColorStop(0, "rgba(255,240,200,0.45)");
    sp.addColorStop(0.3, "rgba(255,240,200,0.14)");
    sp.addColorStop(1, "rgba(255,240,200,0)");
    g.fillStyle = sp;
    g.translate(8, 8); g.scale(1, 0.3); g.translate(-8, -8);
    g.fillRect(-30, -30, 80, 80);
    g.restore();
  } else if (meta.floor === "wood") {
    // oak floorboards in perspective (texture squashed on the vertical to lie flat)
    K.texFill(g, "wood", p, { scale: 34, scaleY: 9, tex: { seed: 6, color: "#8a5a36", planks: 4, varnish: true } });
  } else {
    const R = K.rng("boards" + seed);
    for (let r = -6; r < 6; r++) {
      const y0 = r * 5.5;
      let x = -120 + R() * 40;
      while (x < 120) {
        const len = 40 + R() * 50;
        g.fillStyle = K.mix("#6b4429", "#94643e", R());
        g.fillRect(x, y0, len, 5.5);
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.fillRect(x, y0 + 5, len, 0.6);
        g.fillRect(x + len - 0.6, y0, 0.6, 5.5);
        x += len;
      }
    }
  }
  // lamp pool + far-edge darkening
  const [lx, ly] = meta.lamp;
  const pg = g.createRadialGradient(lx, 6, 0, lx, 6, 120);
  pg.addColorStop(0, K.rgba(meta.color, 0.4));
  pg.addColorStop(1, K.rgba(meta.color, 0));
  g.globalCompositeOperation = "soft-light";
  g.fillStyle = pg;
  g.fillRect(-110, -32, 220, 64);
  g.globalCompositeOperation = "source-over";
  const eg = g.createRadialGradient(lx * 0.5, 0, 30, 0, 0, 115);
  eg.addColorStop(0, "rgba(10,10,30,0)");
  eg.addColorStop(1, "rgba(10,10,30,0.6)");
  g.fillStyle = eg;
  g.fillRect(-110, -32, 220, 64);
  g.restore();
  // broken lip highlight
  g.strokeStyle = K.rgba(meta.color, 0.22);
  g.lineWidth = 1.2;
  g.stroke(p);
}

// ---- objects ------------------------------------------------------------------------------------------
function quiltQuad(u, v) {
  // u along bed (0 head .. 1 foot), v: 0 back edge, 1 front top edge, 2 hem of the drape
  const x0 = -40, x1 = 84;
  let x = K.lerp(x0, x1, u);
  let y;
  if (v <= 1) {
    // the top is a receding plane: rows shrink toward the back and the back edge is narrower
    const vv = Math.pow(v, 1.5);
    x = 26 + (x - 26) * (0.86 + 0.14 * vv);
    y = K.lerp(-49, -28, vv) - Math.sin(u * Math.PI) * 1.5 + Math.sin(u * 7.5 + vv * 3) * 0.5 * vv;
  } else {
    const d = v - 1;
    y = -28 + d * 34 + Math.sin(u * 22 + d * 2) * d * 2.2;
    x += Math.sin(u * 9) * d * 2;
  }
  return [x, y];
}
function bedObject(g) {
  const lampC = LAMP.bed;
  // the bed's soft shadow on the boards (the lamp is at the head, so it falls toward the foot)
  K.shadowBlob(g, 20, 6, 90, 9, { alpha: 0.6 });
  K.shadowBlob(g, -86, 2, 18, 4, { alpha: 0.5 });
  // nightstand + lamp
  g.fillStyle = "#4a3022";
  g.fillRect(-100, -38, 26, 40);
  g.fillStyle = "#5e3d2a";
  g.fillRect(-102, -42, 30, 5);
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.fillRect(-98, -22, 22, 1);
  // lamp: a glazed ceramic base and a linen drum shade lit from inside
  const lb = g.createLinearGradient(-91.5, 0, -82.5, 0);
  lb.addColorStop(0, "#f6e2bc");
  lb.addColorStop(0.35, "#c8a06a");
  lb.addColorStop(1, "#4a3220");
  g.fillStyle = lb;
  g.beginPath();
  g.moveTo(-88, -60);
  g.bezierCurveTo(-93, -55, -92, -46, -89, -42.5);
  g.lineTo(-84, -42.5);
  g.bezierCurveTo(-81, -46, -80, -55, -85, -60);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(255,250,235,0.6)";
  g.fillRect(-89.6, -55, 0.7, 8);
  const sh = g.createLinearGradient(-95, 0, -77, 0);
  sh.addColorStop(0, "#c4823e");
  sh.addColorStop(0.3, "#ffdca6");
  sh.addColorStop(0.5, "#fff3dc");
  sh.addColorStop(0.75, "#f6c886");
  sh.addColorStop(1, "#9a5e28");
  g.fillStyle = sh;
  g.beginPath();
  g.moveTo(-95, -60);
  g.lineTo(-91, -76);
  g.ellipse(-86, -76, 5, 1.2, 0, Math.PI, 0, false);
  g.lineTo(-77, -60);
  g.ellipse(-86, -60, 9, 2, 0, 0, Math.PI, false);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(150,90,40,0.25)";
  g.lineWidth = 0.35;
  g.beginPath();
  for (let i = 1; i < 6; i++) { const u = i / 6; g.moveTo(K.lerp(-91, -81, u), -75.6); g.lineTo(K.lerp(-95, -77, u), -59.6); }
  g.stroke();
  g.fillStyle = "#fff8e6";
  g.beginPath();
  g.ellipse(-86, -60, 9, 1.8, 0, 0, K.TAU);
  g.fill();
  g.strokeStyle = "rgba(110,60,20,0.6)";
  g.lineWidth = 0.6;
  g.beginPath();
  g.ellipse(-86, -76, 5, 1.2, 0, 0, K.TAU);
  g.stroke();
  // headboard
  // headboard post: lit edge toward the lamp, rounded body, shadow side away from it
  const hb = g.createLinearGradient(-72, 0, -58, 0);
  hb.addColorStop(0, "#e2a868");
  hb.addColorStop(0.08, "#a8703e");
  hb.addColorStop(0.25, "#6a4226");
  hb.addColorStop(0.6, "#3a2314");
  hb.addColorStop(1, "#140a05");
  g.fillStyle = hb;
  g.beginPath();
  g.moveTo(-72, 14);
  g.lineTo(-72, -84);
  g.quadraticCurveTo(-66, -96, -58, -88);
  g.lineTo(-58, 8);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(30,15,5,0.25)";
  g.lineWidth = 0.4;
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.moveTo(-70.5 + i * 1.8, 12);
    g.bezierCurveTo(-71 + i * 1.8, -20, -69 + i * 1.8, -50, -70 + i * 1.9, -86);
    g.stroke();
  }
  const hs = g.createLinearGradient(0, -96, 0, 14);
  hs.addColorStop(0, "rgba(0,0,0,0)");
  hs.addColorStop(1, "rgba(0,0,0,0.4)");
  g.fillStyle = hs;
  g.fillRect(-72, -96, 14, 110);
  g.fillStyle = K.rgba(lampC, 0.7);
  g.fillRect(-72, -84, 1.2, 96);
  g.fillStyle = "rgba(255,246,225,0.55)";
  g.fillRect(-71.4, -80, 0.5, 70);
  // footboard + frame
  g.fillStyle = "#4a2e1c";
  g.fillRect(84, -34, 8, 48);
  g.fillStyle = "#3a2416";
  g.fillRect(-60, 2, 146, 10);
  // mattress top + side (under the quilt, visible at the head)
  g.fillStyle = "#c9c0b0";
  g.beginPath();
  g.moveTo(-58, -48);
  g.lineTo(84, -48);
  g.lineTo(84, -28);
  g.lineTo(-58, -28);
  g.closePath();
  g.fill();
  g.fillStyle = "#9a9080";
  g.fillRect(-58, -28, 142, 30);
  K.texRect(g, "fabric", -58, -48, 142, 50, { scale: 14, alpha: 0.5, mode: "multiply", tex: { color: "#cdbfa8", weave: 1.1, seed: 4 } });
  // pillow
  const pg = g.createRadialGradient(-46, -50, 2, -42, -44, 22);
  pg.addColorStop(0, "#f2e4cc");
  pg.addColorStop(0.7, "#c8bba6");
  pg.addColorStop(1, "#7e7364");
  g.fillStyle = pg;
  g.beginPath();
  g.moveTo(-58, -36);
  g.bezierCurveTo(-60, -56, -30, -60, -24, -50);
  g.bezierCurveTo(-20, -40, -26, -30, -40, -30);
  g.bezierCurveTo(-52, -29, -57, -30, -58, -36);
  g.fill();
  g.strokeStyle = "rgba(120,100,80,0.35)";
  g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(-50, -48);
  g.quadraticCurveTo(-42, -44, -32, -47);
  g.stroke();
  // patchwork quilt (warped quads, lit from the lamp side)
  const q = ["#4a6fa5", "#e0b25a", "#c2575b", "#e8dcc4"].map((c) => K.mix(c, "#8a7f78", 0.28));
  const NU = 9, NV = 4;
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const v0 = j < 2 ? j * 0.5 : 1 + (j - 2) * 0.5, v1 = j < 2 ? (j + 1) * 0.5 : 1 + (j - 1) * 0.5;
    const u0 = i / NU, u1 = (i + 1) / NU;
    const a = quiltQuad(u0, v0), b = quiltQuad(u1, v0), c = quiltQuad(u1, v1), d = quiltQuad(u0, v1);
    const top = j < 2;
    const light = top ? 0.08 - u0 * 0.12 : -0.18 - (j - 2) * 0.12 - u0 * 0.1;
    g.save();
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.lineTo(c[0], c[1]);
    g.lineTo(d[0], d[1]);
    g.closePath();
    g.clip();
    // the patch's own cloth (print, slub, batting puff, sunk stitching), mapped onto the warped quad
    g.transform(b[0] - a[0], b[1] - a[1], d[0] - a[0], d[1] - a[1], a[0], a[1]);
    g.drawImage(printTex(i * 3 + j * 5), -0.05, -0.05, 1.1, 1.1);
    g.restore();
    g.fillStyle = light > 0 ? `rgba(255,226,180,${light.toFixed(3)})` : `rgba(8,4,12,${(-light * 1.6).toFixed(3)})`;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.lineTo(c[0], c[1]);
    g.lineTo(d[0], d[1]);
    g.closePath();
    g.fill();
    // tiny calico print dots
    g.fillStyle = "rgba(255,255,255,0.12)";
    for (let k = 0; k < 4; k++) {
      const uu = K.lerp(u0, u1, K.hash(i * 7 + k, j)), vv = K.lerp(v0, v1, K.hash(i * 3 + k, j + 9));
      const p = quiltQuad(uu, vv);
      g.fillRect(p[0], p[1], 0.9, 0.9);
    }
  }
  // stitching along the seams
  g.strokeStyle = "rgba(255,245,225,0.4)";
  g.lineWidth = 0.45;
  g.setLineDash([1.6, 1.4]);
  for (let i = 1; i < NU; i++) {
    g.beginPath();
    for (let s = 0; s <= 8; s++) { const p = quiltQuad(i / NU, (s / 8) * 2); s ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }
    g.stroke();
  }
  for (const v of [0.5, 1, 1.5]) {
    g.beginPath();
    for (let s = 0; s <= 12; s++) { const p = quiltQuad(s / 12, v); s ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }
    g.stroke();
  }
  g.setLineDash([]);
  // the fold where the quilt goes over the edge
  g.strokeStyle = "rgba(255,240,215,0.35)";
  g.lineWidth = 1.2;
  g.beginPath();
  for (let s = 0; s <= 12; s++) { const p = quiltQuad(s / 12, 1); s ? g.lineTo(p[0], p[1] + 0.6) : g.moveTo(p[0], p[1] + 0.6); }
  g.stroke();
  // fabric light: soft folds + falloff from the lamp at the head of the bed
  g.save();
  const qp = new Path2D();
  for (let s = 0; s <= 12; s++) { const p = quiltQuad(s / 12, 0); s ? qp.lineTo(p[0], p[1]) : qp.moveTo(p[0], p[1]); }
  for (let s = 0; s <= 8; s++) { const p = quiltQuad(1, (s / 8) * 2); qp.lineTo(p[0], p[1]); }
  for (let s = 12; s >= 0; s--) { const p = quiltQuad(s / 12, 2); qp.lineTo(p[0], p[1]); }
  qp.closePath();
  g.clip(qp);
  const fall = g.createLinearGradient(-40, 0, 90, 0);
  fall.addColorStop(0, "rgba(255,214,150,0.16)");
  fall.addColorStop(0.5, "rgba(10,6,20,0.1)");
  fall.addColorStop(1, "rgba(10,6,20,0.45)");
  g.fillStyle = fall;
  g.fillRect(-45, -50, 140, 64);
  K.texRect(g, "fabric", -45, -50, 140, 64, { scale: 10, alpha: 0.45, mode: "multiply", tex: { color: "#cdbfa8", weave: 1.1, seed: 4 } });
  // hanging folds on the drape
  for (let i = 0; i < 9; i++) {
    const x = -38 + i * 14 + Math.sin(i * 3.1) * 4;
    const fg = g.createLinearGradient(x - 6, 0, x + 6, 0);
    fg.addColorStop(0, "rgba(0,0,0,0)");
    fg.addColorStop(0.45, "rgba(255,235,205,0.1)");
    fg.addColorStop(0.6, "rgba(0,0,0,0.2)");
    fg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = fg;
    g.fillRect(x - 6, -28, 12, 40);
  }
  // soft folds across the top: long diagonal troughs with a lit crest on the lamp side
  const FOLDS = [[-30, -47, 6, -30, 3.2], [-4, -48, 30, -29, 2.6], [46, -47, 70, -30, 3], [62, -48, 84, -33, 2.2]];
  for (const [ax, ay, bx, by, w] of FOLDS) {
    const nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny);
    const ux = nx / nl * w, uy = ny / nl * w;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const fg = g.createLinearGradient(mx - ux, my - uy, mx + ux, my + uy);
    fg.addColorStop(0, "rgba(255,226,180,0)");
    fg.addColorStop(0.3, "rgba(255,226,180,0.16)");
    fg.addColorStop(0.55, "rgba(20,8,4,0.3)");
    fg.addColorStop(1, "rgba(20,8,4,0)");
    g.strokeStyle = fg;
    g.lineWidth = w * 2;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(ax, ay);
    g.quadraticCurveTo(mx + 3, my - 1, bx, by);
    g.stroke();
  }
  // the lamp's cast shadow: the headboard post shades the head of the bed beside the pillow
  const ls = g.createLinearGradient(-44, 0, -8, 0);
  ls.addColorStop(0, "rgba(14,6,4,0.38)");
  ls.addColorStop(1, "rgba(14,6,4,0)");
  g.fillStyle = ls;
  g.beginPath();
  g.moveTo(-45, -50);
  g.lineTo(-20, -50);
  g.lineTo(-6, -27);
  g.lineTo(-45, -27);
  g.closePath();
  g.fill();
  const hem = g.createLinearGradient(0, -28, 0, 10);
  hem.addColorStop(0, "rgba(0,0,0,0.05)");
  hem.addColorStop(0.15, "rgba(0,0,0,0.22)");
  hem.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = hem;
  g.fillRect(-45, -28, 140, 40);
  g.restore();
  // pillow's soft shadow on the quilt + under the pillow
  const ps = g.createRadialGradient(-30, -36, 1, -30, -36, 14);
  ps.addColorStop(0, "rgba(20,10,5,0.35)");
  ps.addColorStop(1, "rgba(20,10,5,0)");
  g.fillStyle = ps;
  g.fillRect(-44, -50, 28, 26);
  // the warm cat-shaped hollow: a soft dent pressed into the quilt (no outline). Seen from the front,
  // its near slope faces away (dark), its far inner wall faces us and the lamp (warm), and the quilt
  // bunches into a lit lip along the far rim.
  const hx = 20, hy = -38;
  dent(g, hx, hy, 23, 6.4, 1);
  dent(g, hx + 13, hy - 1.6, 7, 2.6, 0.7); // where his head rested
  for (let k = 0; k < 5; k++) {
    const a = Math.PI * (0.15 + k * 0.17);
    const px = hx + Math.cos(a) * 30, py = hy - Math.sin(a) * 8.5;
    const fg = g.createRadialGradient(px, py, 0, px, py, 7);
    fg.addColorStop(0, "rgba(30,14,6,0.12)");
    fg.addColorStop(1, "rgba(30,14,6,0)");
    g.fillStyle = fg;
    g.fillRect(px - 7, py - 7, 14, 14);
  }
  // orange hairs on the pillow and in the hollow
  const R = K.rng("hairs");
  for (let i = 0; i < 30; i++) {
    const inPillow = i < 12;
    const x = inPillow ? -50 + R() * 22 : hx - 18 + R() * 36;
    const y = inPillow ? -50 + R() * 14 : hy - 4 + R() * 7;
    const a = R() * K.TAU, l = 1.2 + R() * 1.6;
    g.strokeStyle = K.rgba(R() > 0.3 ? "#e09040" : "#f6e6cc", 0.8);
    g.lineWidth = 0.22;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.6 + 0.6, y + Math.sin(a) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
}

// a soft dent in a horizontal fabric plane centred (x, y), radius rx in x and ry in y (foreshortened)
function dent(g, x, y, rx, ry, k) {
  g.save();
  g.translate(x, y);
  g.scale(1, ry / rx);
  const b = g.createRadialGradient(0, rx * 0.22, 0, 0, rx * 0.05, rx * 1.05);
  b.addColorStop(0, `rgba(42,20,10,${0.46 * k})`);
  b.addColorStop(0.5, `rgba(42,20,10,${0.26 * k})`);
  b.addColorStop(0.85, `rgba(42,20,10,${0.08 * k})`);
  b.addColorStop(1, "rgba(42,20,10,0)");
  g.fillStyle = b;
  g.fillRect(-rx * 1.1, -rx * 1.1, rx * 2.2, rx * 2.2);
  const w = g.createRadialGradient(-rx * 0.15, -rx * 0.5, 0, -rx * 0.15, -rx * 0.5, rx * 0.62);
  w.addColorStop(0, `rgba(255,206,140,${0.3 * k})`);
  w.addColorStop(1, "rgba(255,206,140,0)");
  g.fillStyle = w;
  g.fillRect(-rx, -rx * 1.2, rx * 2, rx * 1.4);
  const l = g.createRadialGradient(-rx * 0.3, -rx * 1.0, 0, -rx * 0.3, -rx * 1.0, rx * 0.55);
  l.addColorStop(0, `rgba(255,226,180,${0.34 * k})`);
  l.addColorStop(1, "rgba(255,226,180,0)");
  g.fillStyle = l;
  g.fillRect(-rx * 1.1, -rx * 1.6, rx * 2, rx * 1.2);
  g.restore();
}

function windowObject(g) {
  const R = K.rng("winwall");
  // wall fragment with a broken top edge: chunky irregular breaks (big bites + fine crumble)
  const wall = new Path2D();
  const left = [], right = [], top = [];
  for (let i = 0; i <= 8; i++) left.push(-82 + K.fbm(i * 0.7, 11) * 7 - (i > 5 ? (i - 5) * 2 : 0), -20 - i * 19);
  for (let i = 0; i <= 22; i++) {
    const u = i / 22;
    const bite = Math.max(0, 1 - Math.abs(u - 0.32) / 0.12) * 18 + Math.max(0, 1 - Math.abs(u - 0.78) / 0.08) * 10;
    top.push(K.lerp(left[16], 80, u), -172 + K.fbm(u * 6, 5) * 14 + (R() - 0.5) * 4 + bite);
  }
  for (let i = 8; i >= 0; i--) right.push(82 + K.fbm(i * 0.6, 23) * 6 - (i > 6 ? (i - 6) * 3 : 0), -20 - i * 19);
  wall.moveTo(left[0], left[1]);
  for (let i = 2; i < left.length; i += 2) wall.lineTo(left[i], left[i + 1]);
  for (let i = 0; i < top.length; i += 2) wall.lineTo(top[i], top[i + 1]);
  for (let i = 0; i < right.length; i += 2) wall.lineTo(right[i], right[i + 1]);
  wall.closePath();
  // the broken wall's thickness: a darker top/side face (~8 units) seen from slightly above-right
  const TH = [5, -7];
  g.save();
  for (let i = 0; i < top.length - 2; i += 2) {
    const ax = top[i], ay = top[i + 1], bx = top[i + 2], by = top[i + 3];
    const slope = (by - ay) / (bx - ax || 1);
    g.fillStyle = K.mix("#8a7f86", "#4a4250", K.clamp(0.5 + slope * 0.8));
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.lineTo(bx + TH[0], by + TH[1]);
    g.lineTo(ax + TH[0], ay + TH[1]);
    g.closePath();
    g.fill();
  }
  for (let i = 0; i < right.length - 2; i += 2) {
    const ax = right[i], ay = right[i + 1], bx = right[i + 2], by = right[i + 3];
    g.fillStyle = "#3a3444";
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.lineTo(bx + TH[0], by + TH[1]);
    g.lineTo(ax + TH[0], ay + TH[1]);
    g.closePath();
    g.fill();
  }
  // crumbled plaster and brick core showing in the break
  for (let i = 0; i < 120; i++) {
    const j = ((R() * (top.length / 2 - 1)) | 0) * 2;
    const u = R(), d = R();
    const x = K.lerp(top[j], top[j + 2], u) + TH[0] * d, y = K.lerp(top[j + 1], top[j + 3], u) + TH[1] * d;
    g.fillStyle = R() > 0.6 ? "rgba(150,82,62,0.8)" : R() > 0.4 ? "rgba(225,215,205,0.6)" : "rgba(40,34,46,0.7)";
    const s = 0.6 + R() * 1.8;
    g.fillRect(x, y, s, s * 0.8);
  }
  g.restore();
  // the wall: the same faded striped wallpaper as the close-up, lit only by the window and falling off
  K.texFill(g, "wallpaper", wall, { scale: 46, tex: { color: "#8c95a8", motif: "damask", ink: "#6a7288", age: 0.6, seed: 3 } });
  g.save();
  g.clip(wall);
  const wl = g.createRadialGradient(0, -100, 30, 0, -100, 150);
  wl.addColorStop(0, "rgba(8,7,18,0.3)");
  wl.addColorStop(0.45, "rgba(8,7,18,0.7)");
  wl.addColorStop(1, "rgba(8,7,18,0.9)");
  g.fillStyle = wl;
  g.fillRect(-90, -200, 180, 190);
  // plaster fallen away just under the break: a dark band of exposed brick
  const bb = new Path2D();
  for (let i = 0; i < top.length; i += 2) i ? bb.lineTo(top[i], top[i + 1]) : bb.moveTo(top[i], top[i + 1]);
  for (let i = top.length - 2; i >= 0; i -= 2) bb.lineTo(top[i], top[i + 1] + 5 + K.hash(i, 7) * 7);
  bb.closePath();
  K.texFill(g, "brick", bb, { scale: 24, tex: { seed: 2 }, tint: "#2a2030", tintAlpha: 0.6 });
  // skirting board in shadow
  g.fillStyle = "#5a5660";
  g.fillRect(-82, -30, 164, 10);
  g.restore();
  // underside shadow of the wall onto the island deck
  const us = g.createLinearGradient(0, -22, 0, -2);
  us.addColorStop(0, "rgba(6,4,14,0.55)");
  us.addColorStop(1, "rgba(6,4,14,0)");
  g.fillStyle = us;
  g.beginPath();
  g.ellipse(2, -16, 92, 9, 0, 0, K.TAU);
  g.fill();
  // the window: the same sunny garden as the close-up (over-exposed, soft)
  const wx = -40, wy = -150, ww = 80, wh = 90;
  g.drawImage(gardenView(), wx, wy, ww, wh);
  // frame + glazing bars, in shade against the light, with a lit sliver on the edges
  g.fillStyle = "#5e5a62";
  const bars = [[wx, wy, ww, 3.5], [wx, wy + wh - 4, ww, 4], [wx, wy, 3.5, wh], [wx + ww - 3.5, wy, 3.5, wh], [wx + ww / 2 - 1.5, wy, 3, wh], [wx, wy + wh * 0.46, ww, 2.4]];
  for (const [x, y, w, h] of bars) g.fillRect(x, y, w, h);
  g.fillStyle = "rgba(255,240,215,0.6)";
  for (const [x, y, w, h] of bars) if (h > w) g.fillRect(x + w - 0.6, y, 0.6, h);
  // sill catching the sun
  g.fillStyle = "#8a8478";
  g.beginPath();
  g.moveTo(wx - 12, wy + wh + 2);
  g.lineTo(wx + ww + 12, wy + wh + 2);
  g.lineTo(wx + ww + 16, wy + wh + 10);
  g.lineTo(wx - 16, wy + wh + 10);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(255,226,170,0.5)";
  g.fillRect(wx + 4, wy + wh + 2.5, ww - 10, 4);
  g.fillStyle = "#3a3640";
  g.fillRect(wx - 16, wy + wh + 10, ww + 32, 4);
  // curtains: linen with uneven pleats, glowing where the sun comes through near the glass
  for (const side of [-1, 1]) {
    const cx = side < 0 ? wx - 6 : wx + ww + 6;
    const cp = new Path2D();
    cp.moveTo(cx - 12, wy - 12);
    cp.lineTo(cx + 12, wy - 12);
    cp.bezierCurveTo(cx + 10 - side * 6, wy + 40, cx + 14, wy + 80, cx + 10, wy + wh + 32);
    cp.lineTo(cx - 10, wy + wh + 32);
    cp.bezierCurveTo(cx - 14, wy + 80, cx - 10 - side * 6, wy + 40, cx - 12, wy - 12);
    K.texFill(g, "fabric", cp, { scale: 24, tex: { color: "#9a7470", weave: 1.2, seed: 6 } });
    g.save();
    g.clip(cp);
    const cg = g.createLinearGradient(cx - 14, 0, cx + 14, 0);
    let ph = side;
    for (let i = 0; i <= 12; i++) {
      ph += 0.9 + K.noise(i * 0.4, 3 + side) * 0.5;
      const near = side < 0 ? i / 12 : 1 - i / 12;
      cg.addColorStop(i / 12, `rgba(10,6,14,${K.clamp(0.68 - Math.cos(ph) * 0.2 - near * 0.3).toFixed(3)})`);
    }
    g.fillStyle = cg;
    g.fillRect(cx - 16, wy - 14, 32, wh + 50);
    g.restore();
  }
  g.fillStyle = "#2a2220";
  g.fillRect(wx - 26, wy - 16, ww + 52, 3);
  // sun patch on the floor
  g.fillStyle = "rgba(255,236,200,0.18)";
  g.beginPath();
  g.moveTo(-36, -20);
  g.lineTo(36, -20);
  g.lineTo(58, 20);
  g.lineTo(-20, 20);
  g.closePath();
  g.fill();
}
function kitchenObject(g) {
  // pendant cord + shade
  g.strokeStyle = "rgba(30,30,40,0.9)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(8, -210);
  g.lineTo(8, -158);
  g.stroke();
  const sh = g.createLinearGradient(-10, 0, 26, 0);
  sh.addColorStop(0, "#2e4a44");
  sh.addColorStop(0.5, "#4f7a6e");
  sh.addColorStop(1, "#22382f");
  g.fillStyle = sh;
  g.beginPath();
  g.moveTo(0, -158);
  g.lineTo(16, -158);
  g.lineTo(26, -144);
  g.lineTo(-10, -144);
  g.closePath();
  g.fill();
  g.fillStyle = "#fff6d8";
  g.beginPath();
  g.ellipse(8, -144, 18, 3, 0, 0, K.TAU);
  g.fill();
  // chairs (far one behind the table)
  function chair(x, f, k) {
    // turned pine chair: wood-grain fill, then a dark pass (the far side of the table gets less light)
    const parts = (fill) => {
      g.fillStyle = fill;
      g.fillRect(x, -70, 4, 70);
      g.fillRect(x + f * 26, -32, 3.5, 32);
      g.fillRect(x - f * 2, -36, f * 32, 5);
      for (let s = 0; s < 3; s++) g.fillRect(x, -66 + s * 10, f * 3 + 1, 2.5);
      g.fillRect(x + 2, -70, 3, 40);
    };
    parts(K.texPattern(g, "wood", { seed: 6, color: "#8a5a36", planks: 4, varnish: true }));
    parts(`rgba(14,10,20,${(0.45 - k).toFixed(2)})`);
    g.fillStyle = "rgba(255,226,170,0.25)";
    g.fillRect(x - f * 2, -36, f * 32, 0.8);
    K.shadowBlob(g, x + f * 14, 0, 20, 3, { alpha: 0.5 });
  }
  chair(-58, 1, -0.25);
  // table
  const tg = g.createLinearGradient(0, -62, 0, -48);
  tg.addColorStop(0, "#c49a6a");
  tg.addColorStop(1, "#9a7048");
  g.fillStyle = tg;
  g.beginPath();
  g.moveTo(-44, -62);
  g.lineTo(54, -62);
  g.lineTo(62, -50);
  g.lineTo(-52, -50);
  g.closePath();
  g.fill();
  // the table: a soft shadow pooled under it on the tiles, oiled pine top with a hot spot under the pendant
  K.shadowBlob(g, 5, -2, 60, 6, { alpha: 0.7 });
  const ttop = new Path2D();
  ttop.moveTo(-44, -62); ttop.lineTo(54, -62); ttop.lineTo(62, -50); ttop.lineTo(-52, -50); ttop.closePath();
  K.texFill(g, "wood", ttop, { scale: 40, scaleY: 14, alpha: 0.65, mode: "multiply", tex: { seed: 6, color: "#8a5a36", planks: 4, varnish: true } });
  g.save();
  g.clip(ttop);
  const hot = g.createRadialGradient(8, -56, 0, 8, -56, 50);
  hot.addColorStop(0, "rgba(255,236,190,0.35)");
  hot.addColorStop(1, "rgba(255,236,190,0)");
  g.globalCompositeOperation = "lighter";
  g.fillStyle = hot;
  g.fillRect(-60, -64, 130, 16);
  g.restore();
  g.fillStyle = "#4a3220";
  g.fillRect(-52, -50, 114, 5);
  g.fillStyle = "rgba(255,226,170,0.3)";
  g.fillRect(-52, -50, 114, 0.8);
  for (const lx of [-48, -36, 46, 56]) {
    g.fillStyle = "#3a2618";
    g.fillRect(lx, -46, 4, lx > -40 && lx < 50 ? 34 : 46);
    g.fillStyle = "rgba(255,220,160,0.18)";
    g.fillRect(lx, -46, 1, lx > -40 && lx < 50 ? 34 : 46);
  }
  // tablecloth runner + mug + plate
  g.fillStyle = "rgba(240,236,226,0.85)";
  g.beginPath();
  g.moveTo(-10, -62);
  g.lineTo(22, -62);
  g.lineTo(26, -50);
  g.lineTo(-14, -50);
  g.closePath();
  g.fill();
  g.fillStyle = "#c74b3e";
  g.fillRect(30, -70, 8, 9);
  g.strokeStyle = "#c74b3e";
  g.lineWidth = 1.4;
  g.beginPath();
  g.arc(39, -66, 2.6, -1.4, 1.4);
  g.stroke();
  g.fillStyle = "#efe9de";
  g.beginPath();
  g.ellipse(4, -57, 9, 2.6, 0, 0, K.TAU);
  g.fill();
  chair(72, -1, 0.05);
  // cat food bowl on the floor (his)
  g.fillStyle = "#3f6ea8";
  g.beginPath();
  g.moveTo(-82, 4);
  g.lineTo(-62, 4);
  g.lineTo(-65, 10);
  g.lineTo(-79, 10);
  g.closePath();
  g.fill();
  g.fillStyle = "#a8743c";
  g.beginPath();
  g.ellipse(-72, 4, 9, 2, 0, 0, K.TAU);
  g.fill();
  // the pendant lights the air a little: nested soft cones (no hard edge), brightest just under the shade
  for (const [sp, a] of [[1, 0.05], [0.75, 0.06], [0.5, 0.07]]) {
    const lc = g.createLinearGradient(0, -144, 0, -50);
    lc.addColorStop(0, `rgba(255,236,190,${a})`);
    lc.addColorStop(0.5, `rgba(255,236,190,${a * 0.45})`);
    lc.addColorStop(1, "rgba(255,236,190,0)");
    g.fillStyle = lc;
    g.beginPath();
    g.moveTo(-10 * sp + 8 * (1 - sp), -144);
    g.lineTo(26 * sp + 8 * (1 - sp), -144);
    g.lineTo(8 + 62 * sp, -50);
    g.lineTo(8 - 62 * sp, -50);
    g.closePath();
    g.fill();
  }
}

function doorObject(g) {
  const R = K.rng("doorwall");
  const wall = new Path2D();
  wall.moveTo(-70, -16);
  for (let i = 0; i <= 8; i++) wall.lineTo(K.lerp(-70, 70, i / 8), -182 + (R() - 0.5) * 22);
  wall.lineTo(70, -16);
  wall.closePath();
  // the back wall of the house: old brick, lit by the porch sconce at upper left and falling off fast
  K.texFill(g, "brick", wall, { scale: 44, tex: { seed: 4 } });
  const SC = [-53, -120]; // sconce
  g.save();
  g.clip(wall);
  const fall = g.createRadialGradient(SC[0], SC[1], 2, SC[0], SC[1], 150);
  fall.addColorStop(0, "rgba(255,200,130,0.0)");
  fall.addColorStop(0.15, "rgba(10,8,18,0.15)");
  fall.addColorStop(0.5, "rgba(10,8,18,0.55)");
  fall.addColorStop(1, "rgba(10,8,18,0.82)");
  g.fillStyle = fall;
  g.fillRect(-80, -200, 160, 190);
  g.globalCompositeOperation = "lighter";
  const warm = g.createRadialGradient(SC[0], SC[1], 0, SC[0], SC[1], 60);
  warm.addColorStop(0, "rgba(255,170,90,0.35)");
  warm.addColorStop(1, "rgba(255,170,90,0)");
  g.fillStyle = warm;
  g.fillRect(-80, -200, 160, 190);
  g.globalCompositeOperation = "source-over";
  g.restore();
  // door: painted timber in a recessed frame; raised panels lit on the edges facing the sconce
  const dx = -22, dy = -132, dw = 50, dh = 116;
  g.fillStyle = "#1a1614";
  g.fillRect(dx - 5, dy - 5, dw + 10, dh + 5);
  K.texRect(g, "wood", dx, dy, dw, dh, { scale: 60, rot: Math.PI / 2, tint: "#3f6f6a", tintAlpha: 0.85, tintMode: "multiply", tex: { seed: 6, color: "#8a5a36", planks: 4, varnish: true } });
  const dg = g.createLinearGradient(dx, 0, dx + dw, 0);
  dg.addColorStop(0, "rgba(255,200,140,0.12)");
  dg.addColorStop(0.4, "rgba(10,8,18,0.1)");
  dg.addColorStop(1, "rgba(10,8,18,0.55)");
  g.fillStyle = dg;
  g.fillRect(dx, dy, dw, dh);
  for (const [px, py, pw, ph] of [[dx + 6, dy + 8, dw - 12, 40], [dx + 6, dy + 54, dw - 12, 30]]) {
    g.fillStyle = "rgba(255,206,150,0.22)";
    g.fillRect(px, py, pw, 1);
    g.fillRect(px, py, 1, ph);
    g.fillStyle = "rgba(0,0,0,0.4)";
    g.fillRect(px, py + ph - 1, pw, 1);
    g.fillRect(px + pw - 1, py, 1, ph);
  }
  // cat flap: smoked plastic in a dark surround, a sliver of the sconce reflected in it
  g.fillStyle = "#121012";
  g.fillRect(dx + 13, dy + dh - 26, 24, 22);
  const cf = g.createLinearGradient(0, dy + dh - 24, 0, dy + dh - 6);
  cf.addColorStop(0, "rgba(120,130,140,0.55)");
  cf.addColorStop(1, "rgba(40,44,52,0.6)");
  g.fillStyle = cf;
  g.fillRect(dx + 15, dy + dh - 24, 20, 18);
  g.fillStyle = "rgba(255,220,170,0.35)";
  g.fillRect(dx + 15, dy + dh - 24, 20, 1.2);
  // brass knob with a hot glint toward the light
  const kn = g.createRadialGradient(dx + dw - 8, dy + 65, 0, dx + dw - 7, dy + 66, 3);
  kn.addColorStop(0, "#ffe2a0");
  kn.addColorStop(0.4, "#b07a2a");
  kn.addColorStop(1, "#3a2408");
  g.fillStyle = kn;
  g.beginPath();
  g.arc(dx + dw - 7, dy + 66, 2.6, 0, K.TAU);
  g.fill();
  // sconce: iron bracket and a frosted glass globe (the lamp glow itself is added live)
  g.fillStyle = "#18161a";
  g.fillRect(SC[0] - 2, SC[1] + 4, 4, 9);
  const gl = g.createRadialGradient(SC[0], SC[1], 0, SC[0], SC[1], 6);
  gl.addColorStop(0, "#fff4dc");
  gl.addColorStop(0.6, "#ffcf8a");
  gl.addColorStop(1, "#b0703a");
  g.fillStyle = gl;
  g.beginPath();
  g.ellipse(SC[0], SC[1], 5, 6.5, 0, 0, K.TAU);
  g.fill();
  // coir mat, with the occlusion line where the door meets the deck
  const mat = new Path2D();
  mat.moveTo(dx - 4, -14); mat.lineTo(dx + dw + 4, -14); mat.lineTo(dx + dw + 10, 2); mat.lineTo(dx - 10, 2); mat.closePath();
  K.texFill(g, "fabric", mat, { scale: 8, tex: { color: "#7a5a32", weave: 1.6, seed: 9 } });
  g.fillStyle = "rgba(10,8,18,0.35)";
  g.fill(mat);
  K.aoEdge(g, -70, -16, 70, -16, { width: 6, alpha: 0.5, side: -1 });
  // (no spare boots by the door: you are wearing them)
}

const OBJ = { bed: bedObject, window: windowObject, kitchen: kitchenObject, door: doorObject };

const FULL = [-150, -215, 150, 205];
function islandSprite(kind, sc, crop = FULL) {
  const [x0, y0, x1, y1] = crop;
  return K.sprite("f12:isl:" + kind + ":" + sc + ":" + crop.join(","), (x1 - x0) * sc, (y1 - y0) * sc, (g) => {
    g.scale(sc, sc);
    g.translate(-x0, -y0);
    underside(g, kind, kind);
    topSurface(g, kind, kind);
    OBJ[kind](g);
    // lighting pass: everything falls off away from the island's own lamp (source-atop keeps alpha)
    const meta = ISL[kind];
    const [lx, ly] = meta.lamp;
    g.globalCompositeOperation = "source-atop";
    // inverse-square-like falloff: a small bright pool around the lamp, then a fast roll into the dark
    const dk = g.createRadialGradient(lx, ly, 0, lx, ly, 260);
    dk.addColorStop(0, "rgba(6,5,18,0)");
    dk.addColorStop(0.12, "rgba(6,5,18,0.08)");
    dk.addColorStop(0.3, "rgba(6,5,18,0.36)");
    dk.addColorStop(0.55, "rgba(6,5,18,0.6)");
    dk.addColorStop(1, "rgba(6,5,18,0.8)");
    g.fillStyle = dk;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const wm = g.createRadialGradient(lx, ly, 0, lx, ly, 120);
    wm.addColorStop(0, K.rgba(meta.color, 0.26));
    wm.addColorStop(1, K.rgba(meta.color, 0));
    g.fillStyle = wm;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    // fine surface relief over everything (keeps painted areas from reading as flat fills)
    K.texRect(g, "noise", x0, y0, x1 - x0, y1 - y0, { scale: 48, alpha: 0.1, mode: "source-atop", tex: { seed: 9, amp: 50 } });
    // cool Void skylight from above on the top edges (the only fill light out here)
    const sky = g.createLinearGradient(0, y0, 0, 40);
    sky.addColorStop(0, "rgba(90,100,170,0.10)");
    sky.addColorStop(1, "rgba(90,100,170,0)");
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = sky;
    g.fillRect(x0, y0, x1 - x0, 40 - y0);
    // the Void's faint cool light from below on the crag, so the rock and roots read
    g.globalCompositeOperation = "lighter";
    const vb = g.createLinearGradient(0, 200, 0, 30);
    vb.addColorStop(0, "rgba(60,70,140,0.0)");
    vb.addColorStop(0.35, "rgba(70,78,150,0.14)");
    vb.addColorStop(1, "rgba(70,78,150,0)");
    g.fillStyle = vb;
    g.globalCompositeOperation = "source-atop";
    g.fillRect(x0, 30, x1 - x0, y1 - 30);
    const wb = g.createLinearGradient(0, 4, 0, 60);
    wb.addColorStop(0, K.rgba(meta.color, 0.16));
    wb.addColorStop(1, K.rgba(meta.color, 0));
    g.fillStyle = wb;
    g.fillRect(x0, 4, x1 - x0, 56);
    g.globalCompositeOperation = "source-over";
  });
}
function islandBlur(kind, px) {
  const src = islandSprite(kind, 1);
  return K.sprite("f12:islb:" + kind + ":" + px, IW, IH, (g) => {
    if (K.hasFilter()) g.filter = `blur(${K.qblur(px)}px)`;
    g.drawImage(src, 0, 0, IW, IH);
    g.filter = "none";
  });
}
// draw an island with top centre at (x, y), k px per unit, slow rotation `rot`, optional blur
function island(g, kind, x, y, k, t, o = {}) {
  const crop = o.crop || FULL;
  const sc = o.crop ? o.sc : k > 1.6 ? 2.6 : 1.2;
  const spr = o.blur ? islandBlur(kind, o.blur) : islandSprite(kind, sc, crop);
  const meta = ISL[kind];
  const gl = o.glow == null ? 1 : o.glow;
  g.save();
  g.translate(x, y);
  g.rotate(o.rot || 0);
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  const lx = meta.lamp[0] * k, ly = meta.lamp[1] * k;
  if (!o.crop) K.glow(g, lx, ly + 40 * k, 190 * k, meta.color, 0.1 * gl); // light spill into the void haze
  g.drawImage(spr, crop[0] * k, crop[1] * k, (crop[2] - crop[0]) * k, (crop[3] - crop[1]) * k);
  // the island's own lamp
  const breathe = 0.9 + 0.1 * Math.sin(t * 1.3 + kind.length);
  K.glow(g, lx, ly, 70 * k, meta.color, 0.4 * breathe * gl);
  K.glow(g, lx, ly, 14 * k, "#ffffff", 0.45 * gl);
  // crumbs falling from the underside
  if (!o.crop && !o.blur) {
    for (let i = 0; i < 6; i++) {
      const h1 = K.hash(i, kind.length * 7);
      const life = 5 + h1 * 3;
      const age = (t + h1 * 20) % life;
      g.fillStyle = K.rgba("#8a7a80", 0.6 * (1 - age / life));
      g.fillRect((-50 + h1 * 100) * k, (40 + age * 22) * k, 1.4 * k, 1.4 * k);
    }
    // small broken stones caught in a slow orbit round the crag, lit cool from the Void below and warm
    // on top from the island's lamp; the far half of the orbit passes behind (dimmer, smaller)
    for (let i = 0; i < 4; i++) {
      const h1 = K.hash(i, kind.length * 3 + 1);
      const a = t * (0.18 + h1 * 0.12) + i * 1.7 + h1 * 6;
      const near = Math.sin(a);
      const ox = Math.cos(a) * (118 + h1 * 30) * k, oy = (70 + h1 * 60 + near * 16) * k;
      const sz = (5 + h1 * 6) * k * (0.85 + near * 0.15);
      g.save();
      g.translate(ox, oy);
      g.rotate(a * 1.3 + i);
      g.globalAlpha *= 0.65 + near * 0.3;
      g.drawImage(chunkSprite(i + 2), -sz / 2, -sz / 2, sz, sz);
      g.restore();
    }
  }
  g.restore();
}
// amber pawprints walking across an island top
function islandPaws(g, x, y, k, t, start, alpha = 1, dir = 0) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const u = i / 5;
    const px = dir ? (i % 2 ? 5 : -5) : K.lerp(-60, 60, u);
    const py = dir ? K.lerp(22, -22, u) : (i % 2 ? 4 : -4) + K.lerp(10, -6, u);
    const age = t - (start + i * 0.28);
    if (age < 0) break;
    pts.push({ x: x + px * k, y: y + py * k, a: dir ? 0 : Math.PI / 2, s: 6 * k, alpha: alpha * Math.min(1, age * 3), flat: dir ? 0.55 : 0.4 });
  }
  K.pawprints(g, pts, 0.9);
}

// gold motes rising off a fading afterimage: spawned inside box [x, y, w, h] from time t0
function riseMotes(g, t, t0, box, n, seed, k = 1) {
  if (t < t0) return;
  for (let i = 0; i < n; i++) {
    const h1 = K.hash(i, seed), h2 = K.hash(i, seed + 1), h3 = K.hash(i, seed + 2);
    const age = t - t0 - h3 * 1.6;
    if (age < 0) continue;
    const life = 1.8 + h1 * 1.6;
    if (age > life) continue;
    const f = 1 - age / life;
    const x = box[0] + h1 * box[2] + Math.sin(age * 2 + i) * 4 * k;
    const y = box[1] + h2 * box[3] - age * (16 + h3 * 22) * k;
    K.glow(g, x, y, (2 + h3 * 3) * k, i % 3 ? GOLD : "#fff1c8", 0.85 * f * Math.min(1, age * 4));
  }
}

// ---- shots --------------------------------------------------------------------------------------------
// layout of shot 1 / start of shot 5: [kind, x, y, k, phase, blur]
const SCATTER = [
  ["door", 118, 238, 0.42, 2.1, 3],
  ["window", 740, 190, 0.6, 0.7, 2],
  ["kitchen", 690, 382, 0.92, 1.6, 0],
  ["bed", 300, 330, 1.12, 0, 0],
];
function bob(t, ph) { return Math.sin(t * 0.45 + ph) * 6; }
function tilt(t, ph) { return Math.sin(t * 0.21 + ph * 2) * 0.035; }

// small fragments of the house drifting in the Void: clods of earth and broken plaster (cached sprites,
// textured and lit from above by the faint Void glow, with a warm kick on one side from the islands)
function chunkSprite(i) {
  return K.sprite("f12:chunk" + i, 64, 64, (g) => {
    const R = K.rng("chunk" + i);
    const p = new Path2D();
    const n = 7 + ((R() * 4) | 0);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * K.TAU, r = 18 + R() * 12;
      const x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r * (0.6 + R() * 0.3);
      k ? p.lineTo(x, y) : p.moveTo(x, y);
    }
    p.closePath();
    const plaster = i % 3 === 2;
    K.texFill(g, plaster ? "plaster" : "soil", p, { scale: 40, tex: plaster ? { seed: 5, stain: 0.6 } : { seed: 3, color: "#5a4636" } });
    g.save();
    g.clip(p);
    g.globalCompositeOperation = "multiply";
    const sh = g.createLinearGradient(20, 8, 44, 58);
    sh.addColorStop(0, "#b8b4d0");
    sh.addColorStop(0.5, "#4a4660");
    sh.addColorStop(1, "#141420");
    g.fillStyle = sh;
    g.fillRect(0, 0, 64, 64);
    g.globalCompositeOperation = "lighter";
    const wk = g.createLinearGradient(8, 0, 30, 0);
    wk.addColorStop(0, "rgba(120,80,40,0.35)");
    wk.addColorStop(1, "rgba(120,80,40,0)");
    g.fillStyle = wk;
    g.fillRect(0, 0, 64, 64);
    g.restore();
  });
}
function debris(g, t, near) {
  // far = small and fairly sharp, near = big and drawn into a blurred focus layer by the caller
  const R = K.rng(near ? "debN" : "debF");
  const n = near ? 3 : 10;
  for (let i = 0; i < n; i++) {
    const x = ((R() * 1200 + t * (near ? 14 : 4) * (R() > 0.5 ? 1 : -1)) % 1200 + 1200) % 1200 - 120;
    const y = 60 + R() * 420 + Math.sin(t * 0.4 + i) * 8;
    const s = near ? 46 + R() * 40 : 4 + R() * 7;
    const rot = t * (R() - 0.5) * 0.4 + R() * 6;
    const kind = (R() * 6) | 0;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.globalAlpha *= near ? 0.9 : 0.75;
    g.drawImage(chunkSprite(kind), -s / 2, -s / 2, s, s);
    g.restore();
  }
}
function shot1(g, t) { // [0-12] wide slow drift
  prewarm(t);
  const p = K.ease.inOut(K.seg(t, 0, 12.5));
  voidBg(g, p * 60, p * 10);
  debris(g, t, false);
  K.withCamera(g, VW, VH, { x: 480 + p * 30, y: 270, zoom: 1 + p * 0.05, shakeT: t, shakeAmt: 1 }, () => {
    for (const [kind, x, y, k, ph, bl] of SCATTER) {
      island(g, kind, x, y + bob(t, ph), k, t, { rot: tilt(t, ph), blur: bl ? bl * 2 : 0, glow: bl ? 0.7 : 1 });
    }
  });
  K.focus(g, VW, VH, 7, (f) => debris(f, t, true), "f12near");
  motes(g, t, 3, 26);
}

// ---- shots 2 and 3 [12-32]: the bed, ray-cast like a photograph ---------------------------------------
// The bed is a real height field in centimetres (X right, Y up, Z from the headboard toward the foot):
// a patchwork quilt of 24 cm cotton squares (each its own print, twill weave, puffed batting, sunk
// quilting stitches), the cat-shaped hollow Biscuit left (body, tucked head, tail crescent), the
// turned-down sheet, the pillow and the headboard. Each camera set-up is ray-marched ONCE per pixel into
// a cached plate (geometry on a 2 px grid, materials and light per pixel: the bedside lamp's inverse-square
// warm key with soft ray-marched shadows, a cool Void skylight, seam / hollow occlusion, cloth sheen), then
// depth of field is baked from the depth buffer. The plates are built in slices during shot 1.
const QPS = 24, QX0 = -86, QX1 = 86, QZ0 = 44, QZ1 = 300;
const HOLE = { x: 2, z: 86, c: Math.cos(-0.32), s: Math.sin(-0.32), rx: 20, rz: 14 };
const QLAMP = [-100, 9, 32]; // the bedside lamp bulb (cm)
const PIL = { x: -2, z: 23, ax: 36, az: 17, h: 12.5 };
const HB_Z = -6;
const srgbLin = (c) => Math.pow(c / 255, 2.2);
const hexLin = (h) => { const p = K.parseColor(h); return [srgbLin(p[0]), srgbLin(p[1]), srgbLin(p[2])]; };
// patch prints: 0 plain twill, 1 gingham, 2 ditsy floral, 3 ticking stripe, 4 polka dot, 5 tiny check
const QPRINTS = [
  { m: 5, c: "#36507e", c2: "#a8b6cc", c3: "#e0c070" },
  { m: 1, c: "#e4dcc8", c2: "#b0423c", c3: "#ffffff" },
  { m: 2, c: "#c9973a", c2: "#f2e6cc", c3: "#5f7a46" },
  { m: 0, c: "#7a8f68", c2: "#7a8f68", c3: "#7a8f68" },
  { m: 4, c: "#a5463e", c2: "#efe2c8", c3: "#efe2c8" },
  { m: 2, c: "#3e5a86", c2: "#e8d7b4", c3: "#c46a5a" },
  { m: 3, c: "#e6dcc6", c2: "#3e5276", c3: "#3e5276" },
  { m: 1, c: "#e2d8c0", c2: "#3f6a52", c3: "#ffffff" },
  { m: 0, c: "#b7524a", c2: "#b7524a", c3: "#b7524a" },
  { m: 2, c: "#e6dac2", c2: "#c0584e", c3: "#6f8a5a" },
  { m: 4, c: "#4b6890", c2: "#e8dcc2", c3: "#e8dcc2" },
  { m: 5, c: "#c9a042", c2: "#7a5a20", c3: "#7a5a20" },
].map((p) => ({ m: p.m, c: hexLin(p.c), c2: hexLin(p.c2), c3: hexLin(p.c3) }));
const QPLAIN = [{ m: 0, c: hexLin("#e0d4bc"), c2: hexLin("#e0d4bc"), c3: hexLin("#e0d4bc") }, { m: 0, c: hexLin("#c7b08a"), c2: hexLin("#c7b08a"), c3: hexLin("#c7b08a") }, { m: 1, c: hexLin("#e4dcc8"), c2: hexLin("#9a5a48"), c3: hexLin("#ffffff") }];
function qPatch(ix, iz) {
  // the patches under the hollow are plain oatmeal / cream cotton, so the dent reads by light alone
  const cx = QX0 + (ix + 0.5) * QPS, cz = QZ0 + (iz + 0.5) * QPS;
  if (Math.abs(cx - HOLE.x) < 26 && Math.abs(cz - HOLE.z) < 20) return QPLAIN[(ix + iz) & 1];
  const P = QPRINTS[((ix * 5 + iz * 7 + ((K.hash(ix * 31 + iz, 77) * 3) | 0)) % QPRINTS.length + QPRINTS.length) % QPRINTS.length];
  // keep fine stripes away from the hollow (its creases would wave them about)
  if (P.m === 3 && Math.abs(cx - HOLE.x) < 70 && Math.abs(cz - HOLE.z) < 50) return QPRINTS[1];
  return P;
  return QPRINTS[((ix * 5 + iz * 7 + ((K.hash(ix * 31 + iz, 77) * 3) | 0)) % QPRINTS.length + QPRINTS.length) % QPRINTS.length];
}
// cat-shaped hollow: depth 0..1 (sets Q_LIP, the fabric pushed up round its rim)
let Q_LIP = 0;
function qDent(X, Z) {
  Q_LIP = 0;
  const dx = X - HOLE.x, dz = Z - HOLE.z;
  if (dx * dx + dz * dz > 1900) return 0;
  const x = dx * HOLE.c - dz * HOLE.s, z = dx * HOLE.s + dz * HOLE.c;
  const ex = x / HOLE.rx, ez = z / HOLE.rz, e = ex * ex + ez * ez;
  const rho = Math.sqrt(e);
  // a rounded bowl with a fairly crisp rim (fabric pressed flat under a warm body)
  let d = (1 - K.smooth((rho - 0.7) / 0.34)) * (1 - 0.16 * e);
  // the head, tucked at the right end
  const hx = (x - 18) / 8.5, hz = (z + 6.5) / 8, q = Math.sqrt(hx * hx + hz * hz);
  d = Math.max(d, 0.9 * (1 - K.smooth((q - 0.55) / 0.55)));
  // the tail, a crescent curled round the near side from the rump to the nose
  if (rho > 0.8 && rho < 1.7) {
    const th = Math.atan2(ez, ex);
    const w = K.smooth(K.seg(th, 0.9, 1.4)) * K.smooth(K.seg(th, 3.1, 2.6));
    d = Math.max(d, Math.exp(-(((rho - 1.2) / 0.14) ** 2)) * w * 0.42);
  }
  Q_LIP = Math.exp(-(((rho - 1.22) / 0.2) ** 2)) * (1 - d);
  // compression creases radiating from where he lay
  if (d > 0.05 && d < 0.95) Q_LIP += Math.sin(Math.atan2(ez, ex) * 11) * d * (1 - d) * 0.5;
  return d;
}
function qPillowH(X, Z) {
  const dx = (X - PIL.x) / PIL.ax, dz = (Z - PIL.z) / PIL.az;
  const r4 = dx * dx * dx * dx + dz * dz * dz * dz;
  if (r4 >= 1) return -99;
  const hd = (X - PIL.x - 6) ** 2 + (Z - PIL.z - 1) ** 2;
  return -2.6 + PIL.h * Math.pow(1 - r4, 0.42) - 1.4 * Math.exp(-hd / 160);
}
let Q_MAT = 0; // 0 quilt, 1 sheet, 2 pillow
function qh(X, Z) {
  let h;
  if (Z >= QZ0 - 2) {
    h = 1.1 * Math.sin((X * 0.6 + Z) * 0.045) + 0.8 * Math.sin(Z * 0.031 + 1.3) * Math.cos(X * 0.04) + 0.3 * Math.sin(X * 0.13 + Z * 0.04) * Math.sin(Z * 0.09 - 0.6);
    const fx = (X - QX0) / QPS, fz = (Z - QZ0) / QPS;
    const lx = fx - Math.floor(fx), lz = fz - Math.floor(fz);
    const pf = Math.sin(Math.PI * lx) * Math.sin(Math.PI * lz);
    const D = qDent(X, Z);
    h = h * (1 - D * 0.6) + (Math.sqrt(pf) * 2.1 - 1.2) * (1 - 0.8 * D) - 7 * D + 1.8 * Q_LIP;
    // the quilt's turned-down edge rolls over at the head
    const dzr = Z - QZ0 - 4.5;
    h += 2.6 * Math.exp(-dzr * dzr / 18);
    if (Z < QZ0 + 1) h = K.lerp(-2.4, h, K.smooth((Z - QZ0 + 2) / 3));
    Q_MAT = Z < QZ0 - 0.4 ? 1 : 0;
  } else {
    h = -2.4 + 0.25 * Math.sin(X * 0.21 + Z * 0.1);
    Q_MAT = 1;
  }
  if (Z < PIL.z + PIL.az + 1) {
    const ph = qPillowH(X, Z);
    if (ph > h) { h = ph; Q_MAT = 2; }
  }
  const ax = Math.abs(X);
  if (ax > QX1 - 10) h -= (ax - QX1 + 10) ** 2 * 0.1;
  return h;
}
function qCam(key, pos, look, F, o = {}) {
  let f = look.map((v, i) => v - pos[i]);
  const fl = Math.hypot(f[0], f[1], f[2]);
  f = f.map((v) => v / fl);
  let r = [-f[2], 0, f[0]];
  const rl = Math.hypot(r[0], r[2]);
  r = r.map((v) => v / rl);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { key, pos, f, r, u, F, focus: o.focus || [fl], coc: o.coc || 10, hairs: o.hairs !== false };
}
function qProj(cam, X, Y, Z) {
  const dx = X - cam.pos[0], dy = Y - cam.pos[1], dz = Z - cam.pos[2];
  const z = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
  return [480 + cam.F * (dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2]) / z, 270 - cam.F * (dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2]) / z, z];
}
// shot 2: 50 mm, low 3/4 from the foot of the bed; rack from the near quilt (A) to the hollow and pillow (B)
const QCAM_LOW = qCam("low", [54, 56, 214], [-4, 2, 74], 1333, { focus: [82, 160], coc: 10 });
// shot 3: higher, looking down into the hollow (focus on it)
const QCAM_HIGH = qCam("high", [30, 96, 196], [4, 0, 82], 950, { focus: [147], coc: 7 });

// ray-march one view ray; returns 0 miss, 1 bed, 2 headboard (writes Q_HIT)
const Q_HIT = { x: 0, y: 0, z: 0, t: 0, mat: 0 };
function qRay(cam, sx, sy) {
  const a = (sx - 480) / cam.F, b = (270 - sy) / cam.F;
  let dx = cam.f[0] + cam.r[0] * a + cam.u[0] * b, dy = cam.f[1] + cam.r[1] * a + cam.u[1] * b, dz = cam.f[2] + cam.r[2] * a + cam.u[2] * b;
  const dl = Math.hypot(dx, dy, dz);
  dx /= dl; dy /= dl; dz /= dl;
  const [cx, cy, cz] = cam.pos;
  const tHB = dz < 0 ? (cz - HB_Z) / -dz : 1e9;
  if (dy >= -0.002) return qHead(cam, cx, cy, cz, dx, dy, dz, tHB);
  let t = Math.max(0, (cy - 11) / -dy);
  const tEnd = Math.min(tHB, (cy + 16) / -dy);
  const hxz = Math.hypot(dx, dz);
  let pt = t, pg = 1e9;
  for (let i = 0; i < 64 && t < tEnd; i++) {
    const X = cx + dx * t, Z = cz + dz * t;
    if (Math.abs(X) > QX1 + 12 || Z > QZ1) { pt = t; t += 6; pg = 1e9; continue; }
    const gap = cy + dy * t - qh(X, Z);
    if (gap < 0) {
      // secant refine between the last point above and this one below
      let t0 = pt, t1 = t, g0 = pg === 1e9 ? 1 : pg, g1 = gap;
      for (let k = 0; k < 4; k++) {
        const tm = t0 + (t1 - t0) * (g0 / (g0 - g1));
        const gm = cy + dy * tm - qh(cx + dx * tm, cz + dz * tm);
        if (gm > 0) { t0 = tm; g0 = gm; } else { t1 = tm; g1 = gm; }
      }
      const tf = t0 + (t1 - t0) * (g0 / (g0 - g1 || 1));
      Q_HIT.x = cx + dx * tf; Q_HIT.z = cz + dz * tf;
      Q_HIT.y = qh(Q_HIT.x, Q_HIT.z); Q_HIT.mat = Q_MAT; Q_HIT.t = tf;
      if (Math.abs(Q_HIT.x) > QX1 + 8) return 0;
      return 1;
    }
    pt = t; pg = gap;
    t += Math.max(1.1, gap * 2.2 / (-dy + hxz * 0.9));
  }
  return qHead(cam, cx, cy, cz, dx, dy, dz, tHB);
}
function qHead(cam, cx, cy, cz, dx, dy, dz, tHB) {
  if (tHB >= 1e8) return 0;
  const X = cx + dx * tHB, Y = cy + dy * tHB;
  if (Math.abs(X) > 96 || Y < -30 || Y > 58 + Math.cos(X * 0.033) * 6) return 0;
  Q_HIT.x = X; Q_HIT.y = Y; Q_HIT.z = HB_Z; Q_HIT.t = tHB; Q_HIT.mat = 3;
  return 2;
}
// soft shadow toward the lamp: march a few steps and keep the smallest clearance / distance ratio
function qShadow(X, Y, Z) {
  let lx = QLAMP[0] - X, ly = QLAMP[1] - Y, lz = QLAMP[2] - Z;
  const ll = Math.hypot(lx, ly, lz);
  lx /= ll; ly /= ll; lz /= ll;
  let s = 0.8, m = 1;
  for (let i = 0; i < 9; i++) {
    const px = X + lx * s, pz = Z + lz * s;
    const c = (Y + ly * s - qh(px, pz)) / s;
    if (c < m) m = c;
    s *= 1.55;
    if (s > ll) break;
  }
  return K.clamp(m * 9 + 0.15);
}
// albedo (linear) of the quilt at (X, Z), fp = cm per pixel (fades sub-pixel detail)
const QA = [0, 0, 0];
let qr = 0, qg = 0, qb = 0, qw = 1;
function qMix(c, k) { qr += (c[0] - qr) * k; qg += (c[1] - qg) * k; qb += (c[2] - qb) * k; }
function qStepE(e) { const v = 0.5 + e / qw; return v < 0 ? 0 : v > 1 ? 1 : v; }
function qAlbedo(X, Z, fp) {
  const fx = (X - QX0) / QPS, fz = (Z - QZ0) / QPS;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const u = (fx - ix) * QPS, v = (fz - iz) * QPS;
  qPrint(qPatch(ix, iz), u + K.hash(ix, iz) * 3, v + K.hash(iz, ix + 5) * 3, fp);
  // cotton: diagonal twill and slubs (faded out once a thread is under a pixel), washed-out mottling
  const tw = K.texNoise((u + v) * 2.6 + ix * 5.3, (u - v) * 0.45, 7) * 0.06 * K.clamp(1.4 - fp * 2);
  const slub = K.texNoise(u * 1.2 + ix * 9.1, v * 0.18 + iz * 3.7, 5) * 0.07;
  const mot = K.texNoise(X * 0.035, Z * 0.035, 9) * 0.07 + K.texNoise(X * 0.16, Z * 0.16, 2) * 0.04;
  const k = 1 + tw + slub + mot;
  QA[0] = qr * k; QA[1] = qg * k; QA[2] = qb * k;
  return ((u < 0.25 || u > QPS - 0.25 || v < 0.25 || v > QPS - 0.25) ? 1 : 0) | (0.5 < u && u < 1.0 || QPS - 1.0 < u && u < QPS - 0.5 ? 2 : 0) | (0.5 < v && v < 1.0 || QPS - 1.0 < v && v < QPS - 0.5 ? 4 : 0) | (((u + v) * 1.4 | 0) & 1 ? 8 : 0);
}
// the printed cloth of one patch at (uu, vv) cm: sets qr, qg, qb (linear)
function qPrint(P, uu, vv, fp) {
  qr = P.c[0]; qg = P.c[1]; qb = P.c[2];
  qw = 0.07 + fp * 0.9;
  const mixc = qMix, step = qStepE;
  switch (P.m) {
    case 1: { // gingham, 1.3 cm checks
      const a = step(Math.sin(uu * 4.83) * 0.5), c = step(Math.sin(vv * 4.83) * 0.5);
      mixc(P.c2, (a + c) * 0.5);
      break;
    }
    case 2: { // ditsy floral on a 2.8 cm jittered grid
      const cu = Math.floor(uu / 2.8), cv = Math.floor(vv / 2.8);
      const ox = (cu + 0.5 + (K.hash(cu * 13 + cv, 3) - 0.5) * 0.5) * 2.8, oy = (cv + 0.5 + (K.hash(cv * 17 + cu, 4) - 0.5) * 0.5) * 2.8;
      const du = uu - ox, dv = vv - oy, rr = Math.hypot(du, dv);
      if (rr < 1.1) {
        const th = Math.atan2(dv, du) + K.hash(cu, cv) * 6;
        const pr = 0.3 + 0.2 * Math.abs(Math.cos(th * 2.5));
        mixc(P.c2, step(pr - rr));
        mixc([0.85, 0.62, 0.12], step(0.13 - rr));
      }
      const lu = du - 0.75, lv = dv + 0.55;
      mixc(P.c3, step(0.24 - Math.hypot(lu * 0.6, lv * 1.3)) * 0.85);
      break;
    }
    case 3: { // ticking: a wide stripe and two pinstripes
      const s = ((uu % 2.4) + 2.4) % 2.4;
      mixc(P.c2, step(0.42 - Math.abs(s - 0.8)) * 0.9);
      break;
    }
    case 4: { // polka dots
      const row = Math.floor(vv / 1.9), off = row & 1 ? 0.95 : 0;
      const du = ((uu + off) % 1.9 + 1.9) % 1.9 - 0.95, dv = ((vv % 1.9) + 1.9) % 1.9 - 0.95;
      mixc(P.c2, step(0.36 - Math.hypot(du, dv)));
      break;
    }
    case 5: { // tiny two-tone check (shirting)
      const a = step(Math.sin(uu * 11) * 0.5), c = step(Math.sin(vv * 11) * 0.5);
      mixc(P.c2, (a * c) * 0.5);
      break;
    }
    default: break;
  }
}
// one quilt patch as a small cached texture (for the island-scale bed): its print, cotton slub, the
// puffed batting lit from the upper left and the quilting ditch sunk with occlusion round the edge
function printTex(pi) {
  const P = QPRINTS[pi % QPRINTS.length];
  return K.texBake("f12print" + pi, 48, 48, (u, v, out) => {
    qPrint(P, u * 24 + pi, v * 24 + pi * 0.7, 0.5);
    const pf = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
    const lit = 0.62 + 0.38 * Math.sqrt(pf) + (0.5 - u) * 0.16 * Math.cos(Math.PI * u) + (0.5 - v) * 0.2 * Math.cos(Math.PI * v);
    const e = Math.min(u, 1 - u, v, 1 - v);
    const st = e > 0.03 && e < 0.055 && ((u + v) * 40 | 0) & 1 ? 0.55 : 0;
    const k = lit * (1 + K.texNoise(u * 30, v * 4, pi) * 0.06);
    out[0] = 255 * Math.pow(Math.min(1, (qr + (0.7 - qr) * st) * k), 0.4545);
    out[1] = 255 * Math.pow(Math.min(1, (qg + (0.64 - qg) * st) * k), 0.4545);
    out[2] = 255 * Math.pow(Math.min(1, (qb + (0.5 - qb) * st) * k), 0.4545);
    out[3] = 255;
  });
}
// build state per camera: geometry on a 2 px grid, then shading per row, then DOF composites
const QSTATE = new Map();
const QG = 3, QGW = VW / QG + 1, QGH = VH / QG + 1;
function qState(cam) {
  let s = QSTATE.get(cam.key);
  if (!s) {
    const N = QGW * QGH;
    s = { cam, stage: 0, row: 0, kind: new Uint8Array(N), X: new Float32Array(N), Y: new Float32Array(N), Z: new Float32Array(N), T: new Float32Array(N), M: new Uint8Array(N), NX: new Float32Array(N), NY: new Float32Array(N), NZ: new Float32Array(N), SH: new Float32Array(N), img: null, depth: null, out: {} };
    QSTATE.set(cam.key, s);
  }
  return s;
}
function qGeomRow(s, gy) {
  const cam = s.cam;
  for (let gx = 0; gx < QGW; gx++) {
    const i = gy * QGW + gx;
    const k = qRay(cam, gx * QG, gy * QG);
    s.kind[i] = k;
    if (!k) continue;
    const X = Q_HIT.x, Y = Q_HIT.y, Z = Q_HIT.z;
    s.X[i] = X; s.Y[i] = Y; s.Z[i] = Z; s.T[i] = Q_HIT.t; s.M[i] = Q_HIT.mat;
    if (k === 2) { s.NX[i] = 0; s.NY[i] = 0; s.NZ[i] = 1; s.SH[i] = 1; continue; }
    const e = 0.3;
    const hx = qh(X + e, Z) - Y, hz = qh(X, Z + e) - Y;
    let nx = -hx / e, ny = 1, nz = -hz / e;
    const nl = Math.hypot(nx, ny, nz);
    s.NX[i] = nx / nl; s.NY[i] = ny / nl; s.NZ[i] = nz / nl;
    s.SH[i] = qShadow(X, Y + 0.15, Z);
  }
}
const LAMP_C = [1.0, 0.62, 0.3];
function qShadeRow(s, y) {
  const cam = s.cam, D = s.img.data, dep = s.depth;
  const gy = y / QG, gy0 = Math.floor(gy), fy = gy - gy0, gy1 = Math.min(QGH - 1, gy0 + 1);
  const I0 = 1.15 * 134 * 134;
  for (let x = 0; x < VW; x++) {
    const gx = x / QG, gx0 = Math.floor(gx), fx = gx - gx0, gx1 = Math.min(QGW - 1, gx0 + 1);
    const i00 = gy0 * QGW + gx0, i10 = gy0 * QGW + gx1, i01 = gy1 * QGW + gx0, i11 = gy1 * QGW + gx1;
    const o = (y * VW + x) * 4;
    const k00 = s.kind[i00];
    let X, Y, Z, T, nx, ny, nz, sh, mat, kind;
    const same = k00 && k00 === s.kind[i10] && k00 === s.kind[i01] && k00 === s.kind[i11] && s.M[i00] === s.M[i11] &&
      Math.abs(s.T[i00] - s.T[i11]) < s.T[i00] * 0.1 && Math.abs(s.T[i10] - s.T[i01]) < s.T[i00] * 0.1;
    if (same) {
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const SX = s.X, SY = s.Y, SZ = s.Z, ST = s.T, NX = s.NX, NY = s.NY, NZ = s.NZ, SS = s.SH;
      X = SX[i00] * w00 + SX[i10] * w10 + SX[i01] * w01 + SX[i11] * w11;
      Y = SY[i00] * w00 + SY[i10] * w10 + SY[i01] * w01 + SY[i11] * w11;
      Z = SZ[i00] * w00 + SZ[i10] * w10 + SZ[i01] * w01 + SZ[i11] * w11;
      T = ST[i00] * w00 + ST[i10] * w10 + ST[i01] * w01 + ST[i11] * w11;
      nx = NX[i00] * w00 + NX[i10] * w10 + NX[i01] * w01 + NX[i11] * w11;
      ny = NY[i00] * w00 + NY[i10] * w10 + NY[i01] * w01 + NY[i11] * w11;
      nz = NZ[i00] * w00 + NZ[i10] * w10 + NZ[i01] * w01 + NZ[i11] * w11;
      sh = SS[i00] * w00 + SS[i10] * w10 + SS[i01] * w01 + SS[i11] * w11;
      mat = s.M[i00]; kind = k00;
    } else {
      kind = qRay(cam, x, y);
      if (!kind) { D[o + 3] = 0; dep[y * VW + x] = 9999; continue; }
      X = Q_HIT.x; Y = Q_HIT.y; Z = Q_HIT.z; T = Q_HIT.t; mat = Q_HIT.mat;
      if (kind === 2) { nx = 0; ny = 0; nz = 1; sh = 1; } else {
        const hx = qh(X + 0.3, Z) - Y, hz = qh(X, Z + 0.3) - Y;
        nx = -hx / 0.3; ny = 1; nz = -hz / 0.3;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        sh = qShadow(X, Y + 0.15, Z);
      }
    }
    dep[y * VW + x] = T;
    const fp = T / cam.F;
    let r, g, b, ao = 1, sheenK = 0.5, wrap = 0.35, bump = 0;
    if (mat === 3) {
      // headboard: dark oiled walnut, vertical grain
      const gr = K.texNoise(X * 0.9, Y * 0.04, 21) * 0.5 + K.texNoise(X * 3.1, Y * 0.12, 22) * 0.25;
      const ring = Math.sin(X * 1.7 + gr * 6) * 0.5 + 0.5;
      const v = 0.07 + ring * 0.03 + gr * 0.02;
      r = v * 1.0; g = v * 0.58; b = v * 0.33;
      ao = K.clamp(0.55 + (Y + 30) / 40);
      sheenK = 1.2; wrap = 0.1;
    } else if (mat === 2) {
      // pillow: cream cotton percale with a satin stripe, piped seam round the edge
      const s1 = Math.sin(X * 6.5) > 0.2 ? 0.035 : 0;
      const n = K.texNoise(X * 0.4, Z * 0.4, 31) * 0.05 + K.texNoise(X * 2, Z * 2, 32) * 0.025;
      r = 0.70 * (1 + s1 + n); g = 0.64 * (1 + s1 + n); b = 0.52 * (1 + s1 + n);
      const dx = (X - PIL.x) / PIL.ax, dz = (Z - PIL.z) / PIL.az, r4 = dx ** 4 + dz ** 4;
      if (r4 > 0.86 && r4 < 0.93) { bump = 0.5; r *= 0.86; g *= 0.85; b *= 0.83; }
      ao = K.clamp(0.4 + (Y + 2.6) / 5);
      sheenK = 0.9;
    } else if (mat === 1) {
      const n = K.texNoise(X * 0.3, Z * 0.3, 41) * 0.05;
      r = 0.62 * (1 + n); g = 0.58 * (1 + n); b = 0.5 * (1 + n);
      // contact occlusion where the pillow and the quilt's rolled edge sit on the sheet
      const ph = qPillowH(X, Z);
      ao = K.clamp(0.45 + Math.min(QZ0 - Z, 9) / 16) * (ph > -50 ? 1 : K.clamp(0.55 + Math.max(0, (((X - PIL.x) / PIL.ax) ** 4 + ((Z - PIL.z) / PIL.az) ** 4) - 1) * 0.9));
    } else {
      const flags = qAlbedo(X, Z, fp);
      r = QA[0]; g = QA[1]; b = QA[2];
      const fx2 = (X - QX0) / QPS, fz2 = (Z - QZ0) / QPS;
      const lx = fx2 - Math.floor(fx2), lz = fz2 - Math.floor(fz2);
      const pf = Math.sin(Math.PI * lx) * Math.sin(Math.PI * lz);
      const Dd = qDent(X, Z);
      // seams sink: occlusion in the ditch; quilting stitches (cream cotton thread) just beside it
      ao = (0.52 + 0.48 * Math.pow(pf, 0.35)) * (1 - 0.55 * Math.pow(Dd, 1.4));
      if (flags & 1) ao *= 0.6;
      if ((flags & 2 || flags & 4) && flags & 8 && fp < 0.6) { const st = 0.75; r += (0.72 - r) * st; g += (0.66 - g) * st; b += (0.52 - b) * st; bump = 0.3; }
      // batting: the puffed middles catch a little more light (fibres lifted)
      sheenK = 0.55 + pf * 0.35;
      // a few short orange hairs left in the hollow (baked into albedo as fine streaks)
      if (Dd > 0.35) {
        const hh = K.texNoise(X * 2.6 + Z * 0.7, Z * 0.35 - X * 0.2, 55);
        if (hh > 0.62) { const k = K.clamp((hh - 0.62) * 9) * 0.8; r += (0.62 - r) * k; g += (0.26 - g) * k; b += (0.08 - b) * k; }
      }
    }
    // light: the bedside lamp (inverse square, wrapped diffuse for cloth), soft ray-marched shadow
    let lx = QLAMP[0] - X, ly = QLAMP[1] - Y, lz = QLAMP[2] - Z;
    const d2 = lx * lx + ly * ly + lz * lz, ll = Math.sqrt(d2);
    lx /= ll; ly /= ll; lz /= ll;
    if (bump) { ny += bump * 0.4; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl; }
    const ndl = nx * lx + ny * ly + nz * lz;
    const E = I0 / (d2 + 900);
    const dif = Math.max(0, (ndl + wrap) / (1 + wrap)) * E * sh;
    let vx = cam.pos[0] - X, vy = cam.pos[1] - Y, vz = cam.pos[2] - Z;
    const vl = Math.hypot(vx, vy, vz); vx /= vl; vy /= vl; vz /= vl;
    const ndv = Math.max(0, nx * vx + ny * vy + nz * vz);
    // cloth sheen: grazing view + light (fibres scatter forward), only where the lamp reaches
    const sheen = Math.pow(1 - ndv, 4) * 0.35 * sheenK * E * sh * Math.max(0, ndl + 0.2);
    // half-vector glint for the headboard varnish / satin pillow
    let hxv = lx + vx, hyv = ly + vy, hzv = lz + vz;
    const hl = Math.hypot(hxv, hyv, hzv); hxv /= hl; hyv /= hl; hzv /= hl;
    const spec = Math.pow(Math.max(0, nx * hxv + ny * hyv + nz * hzv), mat === 3 ? 40 : 12) * (mat === 3 ? 0.5 : 0.06) * E * sh;
    const sky = (0.35 + 0.65 * Math.max(0, ny)) * ao;
    const amb = 0.024 * sky, ambB = 0.05 * sky;
    const bounce = 0.05 * ao * E; // warm light bounced off the quilt itself
    let R = r * (dif * LAMP_C[0] * (0.7 + 0.3 * ao) + amb * 0.75 + bounce * 0.9) + (sheen + spec) * LAMP_C[0];
    let G = g * (dif * LAMP_C[1] * (0.7 + 0.3 * ao) + amb * 0.85 + bounce * 0.55) + (sheen + spec) * LAMP_C[1] * 0.92;
    let B = b * (dif * LAMP_C[2] * (0.7 + 0.3 * ao) + ambB + bounce * 0.3) + (sheen + spec) * LAMP_C[2] * 1.1;
    // shoulder roll-off before display gamma (the lens adds ACES on top)
    R = R / (1 + R * 0.25); G = G / (1 + G * 0.25); B = B / (1 + B * 0.25);
    const dn = (K.hash(x * 7 + y * 13, 3) - 0.5) * 0.012;
    D[o] = Math.min(255, 255 * Math.pow(Math.max(0, R + dn), 0.4545));
    D[o + 1] = Math.min(255, 255 * Math.pow(Math.max(0, G + dn), 0.4545));
    D[o + 2] = Math.min(255, 255 * Math.pow(Math.max(0, B + dn), 0.4545));
    D[o + 3] = 255;
  }
}
// orange hairs on the pillow: 1 px strokes lying on the cotton, each with a hot glint toward the lamp
const PILLOW_HAIRS = [[6, 30, 0.5, 4.6], [14, 31, 2.6, 4.8], [2, 33, -0.3, 4.0], [20, 30, 1.1, 4.2], [11, 27, 2.9, 4.4], [24, 27, 0.15, 3.8], [8, 34, 0.2, 3.6]];
function qHairs(g, cam) {
  for (const [hx, hz, a, len] of PILLOW_HAIRS) {
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const u = k / 6, X = hx + Math.cos(a) * len * u + Math.sin(u * 3 + a) * 0.35, Z = hz + Math.sin(a) * len * u;
      pts.push(qProj(cam, X, qh(X, Z) + 0.06, Z));
    }
    g.strokeStyle = "rgba(226,128,52,0.95)";
    g.lineWidth = 1;
    g.lineCap = "round";
    g.beginPath();
    pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.stroke();
    g.strokeStyle = "rgba(255,206,140,0.55)";
    g.lineWidth = 0.5;
    g.stroke();
    const p = pts[2];
    const gl = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], 3);
    gl.addColorStop(0, "rgba(255,246,220,1)");
    gl.addColorStop(1, "rgba(255,230,180,0)");
    g.fillStyle = gl;
    g.fillRect(p[0] - 3, p[1] - 3, 6, 6);
  }
  // a few more in the hollow: finer, darker
  const R = K.rng("qhair2");
  g.lineWidth = 0.6;
  for (let i = 0; i < 26; i++) {
    const X = HOLE.x + (R() - 0.5) * 34, Z = HOLE.z + (R() - 0.5) * 22;
    if (qDent(X, Z) < 0.4) continue;
    const a = R() * K.TAU, l = 1.6 + R() * 2.4;
    const p0 = qProj(cam, X, qh(X, Z) + 0.05, Z), p1 = qProj(cam, X + Math.cos(a) * l, qh(X, Z) + 0.05, Z + Math.sin(a) * l);
    g.strokeStyle = R() < 0.25 ? "rgba(236,222,196,0.7)" : "rgba(214,120,50,0.8)";
    g.beginPath();
    g.moveTo(p0[0], p0[1]);
    g.quadraticCurveTo((p0[0] + p1[0]) / 2 + 1, (p0[1] + p1[1]) / 2 - 0.6, p1[0], p1[1]);
    g.stroke();
  }
}
// one build step: returns true when the plate set is complete
// units of work done so far (a geometry row, a shading row or a finishing sub-step each count 1)
const Q_UNITS = QGH + VH + 8;
function qDone(s) { return s.stage >= 3 ? Q_UNITS : s.stage === 0 ? s.row : s.stage === 1 ? QGH + s.row : QGH + VH + s.row; }
// build until a share of the whole job is done: tied to film time, so the plate is finished on schedule
// whatever the frame rate, and each frame only does its slice
function qStepTo(s, frac) {
  const goal = Math.ceil(Q_UNITS * K.clamp(frac));
  while (s.stage < 3 && qDone(s) < goal) qStep(s, 0);
}
function qStep(s, budgetMs) {
  const t0 = performance.now();
  while (s.stage < 3) {
    if (s.stage === 0) {
      qGeomRow(s, s.row++);
      if (s.row >= QGH) { s.stage = 1; s.row = 0; s.can = K.makeCanvas(VW, VH); s.img = s.can.getContext("2d").createImageData(VW, VH); s.depth = new Float32Array(VW * VH); }
    } else if (s.stage === 1) {
      qShadeRow(s, s.row++);
      if (s.row >= VH) { s.stage = 2; s.row = 0; }
    } else if (qFinish(s)) s.stage = 3;
    if (budgetMs <= 0 || performance.now() - t0 > budgetMs) break;
  }
  return s.stage >= 3;
}
function qBlur(src, px) {
  const c = K.makeCanvas(VW, VH);
  const g = c.getContext("2d");
  if (K.hasFilter()) g.filter = `blur(${K.qblur(px)}px)`;
  g.drawImage(src, 0, 0);
  g.filter = "none";
  return c;
}
// finishing runs in small sub-steps (each a few ms) so no single frame stalls: 0 put pixels + hairs,
// 1 / 2 the two defocus levels, then per focus distance: 3 the depth masks, 4 the composite
function qFinish(s) {
  const cam = s.cam, k = s.row++;
  if (k === 0) {
    const sg = s.can.getContext("2d");
    sg.putImageData(s.img, 0, 0);
    if (cam.hairs) qHairs(sg, cam);
    s.img = null;
    return false;
  }
  if (k === 1) { s.B1 = qBlur(s.can, 2.5); return false; }
  if (k === 2) { s.B2 = qBlur(s.can, 7); return false; }
  const fi = (k - 3) >> 1;
  if (fi >= cam.focus.length) { s.depth = null; s.B1 = s.B2 = s.m0 = s.m1 = null; return true; }
  const fd = cam.focus[fi];
  if (((k - 3) & 1) === 0) {
    // circle of confusion from depth -> masks for the sharp and the slightly-soft layers
    const m0 = K.makeCanvas(VW, VH), m1 = K.makeCanvas(VW, VH);
    const g0 = m0.getContext("2d"), g1 = m1.getContext("2d");
    const i0 = g0.createImageData(VW, VH), i1 = g1.createImageData(VW, VH);
    const d0 = i0.data, d1 = i1.data, dep = s.depth;
    for (let p = 0; p < VW * VH; p++) {
      const z = dep[p];
      const coc = z > 9000 ? 99 : cam.coc * Math.abs(1 - fd / z) * (z < fd ? 1.6 : 1);
      const a0 = (2.2 - coc) / 1.4, a1 = (6 - coc) / 3;
      d0[p * 4 + 3] = a0 <= 0 ? 0 : a0 >= 1 ? 255 : 255 * a0;
      d1[p * 4 + 3] = a1 <= 0 ? 0 : a1 >= 1 ? 255 : 255 * a1;
    }
    g0.putImageData(i0, 0, 0);
    g1.putImageData(i1, 0, 0);
    s.m0 = m0; s.m1 = m1;
    return false;
  }
  // soft masks so focus falls off gradually; composite soft -> slightly soft -> sharp
  const out = K.makeCanvas(VW, VH), og = out.getContext("2d");
  og.drawImage(s.B2, 0, 0);
  const tmp = K.makeCanvas(VW, VH), tg = tmp.getContext("2d");
  tg.drawImage(s.B1, 0, 0);
  tg.globalCompositeOperation = "destination-in";
  tg.drawImage(qBlur(s.m1, 3), 0, 0);
  og.drawImage(tmp, 0, 0);
  tg.globalCompositeOperation = "copy";
  tg.drawImage(s.can, 0, 0);
  tg.globalCompositeOperation = "destination-in";
  tg.drawImage(qBlur(s.m0, 2), 0, 0);
  og.drawImage(tmp, 0, 0);
  s.out[fi] = out;
  return false;
}
function qPlate(cam, fi = 0) {
  const s = qState(cam);
  if (s.stage < 3) qStep(s, 1e9);
  return s.out[fi];
}
// cache fill ahead of need (a pure function of t: it only fills caches), ~10 ms of work per frame
function prewarm(t) {
  if (t < 1.5 || t > 32) return;
  // shot 1 is cheap to draw, so the low set-up builds there; the high one during shot 2 (which is ~1 ms)
  qStepTo(qState(QCAM_LOW), K.seg(t, 1.5, 10.5));
  if (t >= 12) qStepTo(qState(QCAM_HIGH), K.seg(t, 12.3, 20.5));
}
// sprites the later shots need (window, the pale light, the near island scales), one per 0.25 s window
const LATE_WARM = [
  () => paleSprite(3), () => paleSprite(8), () => starField(), () => nearWisps(),
  ...["bed", "kitchen", "door", "window"].flatMap((k) => [() => islandSprite(k, 2.6), ...[1, 2, 3, 4, 5, 6].map((b) => () => islandBlur(k, b))]),
];
function prewarmLate(t, t0) {
  const i = Math.floor((t - t0) / 0.25);
  if (i >= 0 && i < LATE_WARM.length) LATE_WARM[i]();
}
// the bedside lamp in frame at the top-left edge: a small linen drum shade glowing from inside (bright
// rims, darker middle, the weave showing through), slightly out of focus, and the bulb's round bokeh
function lampShade() {
  return K.sprite("f12:lampshade2", 140, 130, (g) => {
    const L = K.makeCanvas(140 * K.pixelScale(), 130 * K.pixelScale());
    const s = L.getContext("2d");
    s.scale(K.pixelScale(), K.pixelScale());
    const p = new Path2D();
    p.moveTo(34, 26); p.lineTo(98, 26);
    p.quadraticCurveTo(104, 60, 112, 96);
    p.ellipse(70, 96, 42, 7, 0, 0, Math.PI, false);
    p.quadraticCurveTo(36, 60, 34, 26);
    p.closePath();
    const sg = s.createLinearGradient(28, 0, 114, 0);
    sg.addColorStop(0, "#c46a24");
    sg.addColorStop(0.18, "#f0a050");
    sg.addColorStop(0.5, "#d98a3e");
    sg.addColorStop(0.82, "#f2a858");
    sg.addColorStop(1, "#b05a1c");
    s.fillStyle = sg;
    s.fill(p);
    s.save();
    s.clip(p);
    K.texFill(s, "fabric", p, { scale: 22, alpha: 0.55, mode: "multiply", tex: { color: "#d8b890", weave: 1.4, seed: 12 } });
    // brighter rims where the bulb hits the stiffened top and bottom bands
    const vg = s.createLinearGradient(0, 26, 0, 104);
    vg.addColorStop(0, "rgba(255,226,170,0.9)");
    vg.addColorStop(0.1, "rgba(255,200,130,0.2)");
    vg.addColorStop(0.55, "rgba(60,20,4,0.18)");
    vg.addColorStop(0.88, "rgba(255,200,130,0.25)");
    vg.addColorStop(1, "rgba(255,240,200,0.95)");
    s.fillStyle = vg;
    s.fillRect(20, 20, 100, 90);
    // the vertical seam and the wire spider's shadow through the cloth
    s.fillStyle = "rgba(90,40,10,0.35)";
    s.fillRect(78, 26, 2, 78);
    s.strokeStyle = "rgba(80,30,8,0.3)";
    s.lineWidth = 1.5;
    s.beginPath();
    s.moveTo(40, 30); s.lineTo(66, 60); s.lineTo(94, 30);
    s.stroke();
    s.restore();
    // the hot open bottom of the shade
    s.fillStyle = "#fff4dc";
    s.beginPath();
    s.ellipse(70, 96, 40, 5.5, 0, 0, K.TAU);
    s.fill();
    if (K.hasFilter()) g.filter = "blur(2.2px)";
    g.drawImage(L, 0, 0, 140, 130);
    g.filter = "none";
  });
}
function bokehDisc(g, x, y, r, color, a) {
  // a defocused point light: a flat disc with a slightly brighter rim (spherical aberration), not a blob
  g.save();
  g.globalCompositeOperation = "lighter";
  const d = g.createRadialGradient(x, y, 0, x, y, r);
  d.addColorStop(0, K.rgba(color, a * 0.55));
  d.addColorStop(0.78, K.rgba(color, a * 0.62));
  d.addColorStop(0.9, K.rgba(color, a * 0.8));
  d.addColorStop(1, K.rgba(color, 0));
  g.fillStyle = d;
  g.beginPath();
  g.arc(x, y, r, 0, K.TAU);
  g.fill();
  g.restore();
}
function hollowHaze(g, cam, t, a) {
  // warmth still rising off the hollow: a faint, slowly breathing column of lit air
  const c = qProj(cam, HOLE.x, 2, HOLE.z), top = qProj(cam, HOLE.x - 2, 26, HOLE.z);
  const w = 26 * cam.F / c[2];
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 3; i++) {
    const u = (i + 1) / 3, sw = Math.sin(t * 0.6 + i * 2.1) * w * 0.12;
    const x = K.lerp(c[0], top[0], u) + sw, y = K.lerp(c[1], top[1], u);
    const gr = g.createRadialGradient(x, y, 0, x, y, w * (0.9 - u * 0.3));
    gr.addColorStop(0, `rgba(255,190,120,${(0.07 * a * (1 - u * 0.5)).toFixed(3)})`);
    gr.addColorStop(1, "rgba(255,190,120,0)");
    g.fillStyle = gr;
    g.fillRect(x - w, y - w, w * 2, w * 2);
  }
  g.restore();
}
function hollowGlints(g, cam, t, a) {
  for (let i = 0; i < 7; i++) {
    const X = HOLE.x + (K.hash(i, 51) - 0.5) * 30, Z = HOLE.z + (K.hash(i, 52) - 0.5) * 18;
    const q = qProj(cam, X, qh(X, Z) + 0.2, Z);
    const tw = Math.max(0, Math.sin(t * 1.3 + i * 2.3));
    K.glow(g, q[0], q[1], 5, "#ffe2a8", 0.45 * tw * tw * a);
  }
}
function shot2(g, t) { // [12-22] 50 mm, low 3/4 at the foot of the bed; rack focus from the near quilt to the hollow
  prewarm(t);
  const p = K.ease.inOut(K.seg(t, 12, 22.4));
  voidBg(g, 150 + p * 20, 70);
  island(g, "kitchen", 820 - p * 12, 120 + bob(t, 1.6) * 0.6, 0.3, t, { blur: 6, glow: 0.5, rot: tilt(t, 1.6) });
  const rack = K.smooth(K.seg(t, 13.4, 15.6));
  K.withCamera(g, VW, VH, { x: 480 + p * 14, y: 268 + p * 4, zoom: 1.0 + p * 0.06, shakeT: t, shakeAmt: 0.7 }, () => {
    if (rack < 1) g.drawImage(qPlate(QCAM_LOW, 0), 0, 0, VW, VH);
    if (rack > 0) { g.save(); g.globalAlpha = rack; g.drawImage(qPlate(QCAM_LOW, 1), 0, 0, VW, VH); g.restore(); }
    hollowHaze(g, QCAM_LOW, t, 0.5 + 0.5 * rack);
    hollowGlints(g, QCAM_LOW, t, 0.3 + 0.7 * rack);
    const lp = qProj(QCAM_LOW, QLAMP[0], QLAMP[1], QLAMP[2]);
    const fl = 0.97 + 0.03 * Math.sin(t * 1.3);
    K.glow(g, lp[0], lp[1] + 10, 220, "#ffb060", 0.16 * fl);
    g.drawImage(lampShade(), lp[0] - 70, lp[1] - 80, 140, 130);
    bokehDisc(g, lp[0], lp[1] + 18, 22, "#ffe6b8", 0.55 * fl);
  });
  motes(g, t, 7, 14, 0.6);
}
// ghost Biscuit: the full kit cat (real anatomy, fur, light) painted into a layer and laid in like an
// afterimage on glass: a little body (o.body, normal blend) so the fur structure reads, the cat added at
// ~0.35, an inner fresnel rim (the layer minus its own blur) glowing on every edge, a soft 8 px breath
// halo, and echo copies a few frames back in time smeared behind him (paint(ctx, dt, isEcho)).
function ghostCat(g, a, paint, o = {}) {
  if (a <= 0.003) return;
  const L = K.layer(VW, VH, "f12g0");
  paint(L.g, 0, false);
  if (o.tint) {
    L.g.save();
    L.g.setTransform(1, 0, 0, 1, 0, 0);
    L.g.globalCompositeOperation = "source-atop";
    L.g.globalAlpha = o.tint;
    L.g.fillStyle = o.color || "#ffc878";
    L.g.fillRect(0, 0, L.canvas.width, L.canvas.height);
    L.g.restore();
  }
  let E = null;
  if (o.echo) {
    E = K.layer(VW, VH, "f12g1");
    if (o.echoShift) {
      // the trailing echoes are the same painted cat laid back along his path, not two more full cat
      // renders: a second cat render in one frame dropped this shot to 8 fps on integrated graphics
      E.g.globalAlpha = 0.6;
      E.g.drawImage(L.canvas, o.echoShift[0][0], o.echoShift[0][1], VW, VH);
      E.g.globalAlpha = 0.32;
      E.g.drawImage(L.canvas, o.echoShift[1][0], o.echoShift[1][1], VW, VH);
    } else {
      E.g.globalAlpha = 0.6;
      paint(E.g, -0.06, true);
      E.g.globalAlpha = 0.32;
      paint(E.g, -0.12, true);
    }
    E.g.globalAlpha = 1;
  }
  // copy only the cat's box (o.box = [x, y, w, h], screen px) where possible: full-frame copies are slow
  const PXs = L.canvas.width / VW;
  const bx = o.box ? Math.max(0, Math.floor(o.box[0])) : 0, by = o.box ? Math.max(0, Math.floor(o.box[1])) : 0;
  const bw = o.box ? Math.min(VW - bx, Math.ceil(o.box[2])) : VW, bh = o.box ? Math.min(VH - by, Math.ceil(o.box[3])) : VH;
  const blit = (dst, c) => { if (bw > 0 && bh > 0) dst.drawImage(c, bx * PXs, by * PXs, bw * PXs, bh * PXs, bx, by, bw, bh); };
  const Rm = K.layer(VW, VH, "f12g2");
  blit(Rm.g, L.canvas);
  Rm.g.globalCompositeOperation = "destination-out";
  K.dof(Rm.g, L.canvas, o.rimW || 3.5, 1, o.box);
  Rm.g.globalCompositeOperation = "source-in";
  Rm.g.fillStyle = o.rimColor || "#ffe2a8";
  Rm.g.fillRect(0, 0, VW, VH);
  Rm.g.globalCompositeOperation = "source-over";
  g.save();
  if (o.body) { g.globalAlpha = a * o.body; blit(g, L.canvas); }
  g.globalCompositeOperation = "lighter";
  if (E) K.dof(g, E.canvas, 4, a * 0.42, o.box);
  g.globalAlpha = a * (o.add == null ? 0.35 : o.add);
  blit(g, L.canvas);
  g.globalAlpha = a * (o.rim == null ? 0.85 : o.rim);
  blit(g, Rm.canvas);
  g.globalAlpha = 1;
  K.dof(g, L.canvas, o.halo || 8, a * (o.haloA == null ? 0.3 : o.haloA), o.box);
  g.restore();
}
// where the ghost is on the quilt at time t (world cm) during shot 3
function ghostPath(t) {
  const w = K.ease.out(K.seg(t, 22.2, 24.6));
  return { X: K.lerp(78, HOLE.x + 8, w), Z: K.lerp(HOLE.z + 6, HOLE.z + 2, w), walking: t < 24.5, w };
}
function shot3(g, t) { // [22-32] looking down on the hollow, a slow push in; the golden afterimage curls into it
  prewarmWin(t);
  const p = K.ease.inOut(K.seg(t, 22, 32.4));
  voidBg(g, 170, 50);
  const cam = QCAM_HIGH;
  const hc = qProj(cam, HOLE.x, 0, HOLE.z);
  const lampS = qProj(cam, QLAMP[0], QLAMP[1], QLAMP[2]);
  K.withCamera(g, VW, VH, { x: K.lerp(480, hc[0], p * 0.6), y: K.lerp(270, hc[1] - 10, p * 0.6), zoom: 1.0 + p * 0.2, shakeT: t, shakeAmt: 0.8 }, () => {
    g.drawImage(qPlate(cam, 0), 0, 0, VW, VH);
    hollowGlints(g, cam, t, 1);
    const a = K.env(t, 22.2, 31.6, 1.2, 2.4);
    const settle = K.smooth(K.seg(t, 24.4, 25.6)); // standing -> curled
    const kk = cam.F / hc[2];
    const size = 22 * kk; // shoulder height ~22 cm
    // the hollow's long axis on screen (the curled cat lies along it)
    const e0 = qProj(cam, HOLE.x - HOLE.rx * HOLE.c, 0, HOLE.z - HOLE.rx * HOLE.s), e1 = qProj(cam, HOLE.x + HOLE.rx * HOLE.c, 0, HOLE.z + HOLE.rx * HOLE.s);
    const axis = Math.atan2(e1[1] - e0[1], e1[0] - e0[0]);
    const key = { x: lampS[0], y: lampS[1], color: "#ffcf96", strength: 1.3 };
    // contact: where he lies the quilt is pressed darker and the rim of the hollow bunches up, lit
    if (settle > 0) {
      g.save();
      g.globalAlpha = a * settle;
      g.globalCompositeOperation = "multiply";
      g.translate(hc[0], hc[1] + size * 0.05);
      g.rotate(axis);
      const ao = g.createRadialGradient(0, 0, size * 0.3, 0, 0, size * 1.25);
      ao.addColorStop(0, "rgba(60,36,24,1)");
      ao.addColorStop(0.6, "rgba(120,90,70,1)");
      ao.addColorStop(1, "rgba(255,255,255,1)");
      g.fillStyle = ao;
      g.scale(1, 0.62);
      g.fillRect(-size * 1.3, -size * 1.3, size * 2.6, size * 2.6);
      g.restore();
    }
    const paint = (L, dt, echo) => {
      const tt = t + dt;
      const gp = ghostPath(tt);
      const st = 1 - K.smooth(K.seg(tt, 24.4, 25.6));
      if (st > 0.01) {
        const q = qProj(cam, gp.X, 0, gp.Z);
        L.save();
        L.globalAlpha *= st;
        K.drawCat(L, q[0], q[1], size, { pose: gp.walking ? "walk" : "stand", phase: tt * 1.05, facing: -1, t: tt, shadow: false, bell: false, tail: 0.6, tailUp: 0.5,
          headTurn: 0.15, key, rim: { x: q[0] - size * 3, y: q[1] - size * 4, color: "#ffe6bc", strength: 1.4 }, fill: "#2a1a14", ambientK: 0.12, backlit: 0.5, flat: echo || undefined });
        L.restore();
      }
      const sl = K.smooth(K.seg(tt, 24.4, 25.6));
      if (sl > 0.01 && !echo) {
        const br = 1.01 + 0.01 * Math.sin(tt * K.TAU * 0.4); // breathing, ~0.4 Hz
        L.save();
        L.globalAlpha *= sl;
        L.translate(hc[0] + size * 0.08, hc[1] + size * 0.3);
        L.rotate(axis * 0.6);
        L.scale(1, br);
        K.drawCat(L, 0, 0, size * 0.82, { pose: "sleep", facing: 1, t: tt, shadow: false, bell: false, blink: 1, breath: 0,
          key, rim: { x: -size * 2, y: -size * 3.2, color: "#ffe6bc", strength: 1.6 }, fill: "#2a1a14", ambientK: 0.1, backlit: 0.6 });
        L.restore();
      }
    };
    const curled = K.smooth(K.seg(t, 24.6, 26));
    const q0 = ghostPath(t), qa = ghostPath(t - 0.06), qb = ghostPath(t - 0.12);
    const s0 = qProj(cam, q0.X, 0, q0.Z), sa = qProj(cam, qa.X, 0, qa.Z), sb = qProj(cam, qb.X, 0, qb.Z);
    ghostCat(g, a, paint, { echoShift: [[sa[0] - s0[0], sa[1] - s0[1]], [sb[0] - s0[0], sb[1] - s0[1]]], box: [0, hc[1] - size * 2.8, VW, size * 3.8], echo: t < 25.2, body: 0.18 + curled * 0.42, add: 0.36 - curled * 0.24, tint: 0.22 - curled * 0.1, halo: 8, haloA: 0.26 - curled * 0.1, rim: 0.8 - curled * 0.35 });
    // contact: where his body meets the quilt the light can't reach (the underside sinks into the batting)
    if (curled > 0) {
      g.save();
      g.globalAlpha = a * curled * 0.7;
      g.globalCompositeOperation = "multiply";
      g.translate(hc[0] + size * 0.05, hc[1] + size * 0.3);
      g.rotate(axis * 0.6);
      const cg = g.createRadialGradient(0, 0, 0, 0, 0, size * 0.75);
      cg.addColorStop(0, "rgba(40,24,18,1)");
      cg.addColorStop(0.6, "rgba(120,90,70,1)");
      cg.addColorStop(1, "rgba(255,255,255,1)");
      g.fillStyle = cg;
      g.scale(1, 0.16);
      g.fillRect(-size * 0.8, -size * 0.8, size * 1.6, size * 1.6);
      g.restore();
    }
    K.glow(g, hc[0], hc[1] - size * 0.2, size * 2.4, GOLD, 0.06 * a * curled);
    hollowHaze(g, cam, t, 0.6);
    // he fades by alpha while gold motes lift off where he lay
    riseMotes(g, t, 29.0, [hc[0] - size * 1.2, hc[1] - size * 0.9, size * 2.4, size * 0.9], 120, 61, kk / 5);
  });
  // the lamp spills in from the left edge of frame
  K.glow(g, -40, 160, 380, "#ffcf8a", 0.16);
  motes(g, t, 7, 14, 0.7);
}


// ---- shot 4 set: the window wall, close (one cached plate + live light) ---------------------------
// Plate space is 1040 x 600 drawn at (-40, -30). The only light is the morning coming through the glass:
// the garden outside is over-exposed and out of focus (we are focused on the sill), the reveal and the sill
// catch the sun, the wall falls off into darkness, and the broken top of the wall opens onto the Void.
const WP = { w: 1040, h: 600, ox: -40, oy: -30 };
const GL = [512, 150, 286, 250]; // glass area (plate px): x, y, w, h -> sill back edge at y 400
const SILL = { y0: 400, y1: 424, face: 438, x0: 470, x1: 840 };
function brokenTop() {
  // the torn upper edge of the wall fragment (plate px): plaster snaps off in irregular chunks of every
  // size, so the line is fractal (several fbm octaves) over two big losses, never a regular zig-zag
  const pts = [];
  let x = -10;
  while (x < 1060) {
    const u = x / 1040;
    const loss = Math.exp(-(((u - 0.12) / 0.09) ** 2)) * 125 + Math.exp(-(((u - 0.93) / 0.08) ** 2)) * 115 + Math.exp(-(((u - 0.47) / 0.03) ** 2)) * 20;
    pts.push(x, 70 + loss + K.fbm(u * 5, 7) * 26 + K.fbm(u * 19, 9) * 9 + K.fbm(u * 61, 3) * 3.5);
    x += 3;
  }
  pts.push(1060, pts[pts.length - 1]);
  return pts;
}
function gardenView() {
  // the garden outside, as a photograph exposed for the dim room would show it: blown out, nothing but
  // soft masses of sunlit leaves and bright bokeh discs where light comes through them (no hard shapes)
  const [, , gw, gh] = GL;
  return K.sprite("f12:garden2", gw, gh, (g) => {
    const sc = g.getTransform().a;
    const c = K.makeCanvas(Math.ceil(gw * sc), Math.ceil(gh * sc));
    const s = c.getContext("2d");
    s.scale(sc, sc);
    const sk = s.createLinearGradient(0, 0, 0, gh);
    sk.addColorStop(0, "#f4f8f6");
    sk.addColorStop(0.45, "#eef0de");
    sk.addColorStop(0.75, "#c8d6a0");
    sk.addColorStop(1, "#9fb878");
    s.fillStyle = sk;
    s.fillRect(0, 0, gw, gh);
    const R = K.rng("f12garden");
    // foliage masses: big soft blobs, darker low, translucent-bright high
    for (let i = 0; i < 26; i++) {
      const x = R() * gw, y = 60 + R() * (gh - 40), r = 30 + R() * 60;
      const dark = y / gh;
      const col = K.mix("#c8dc8a", "#4e6a30", dark * 0.9 + R() * 0.1);
      const gr = s.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, K.rgba(col, 0.75));
      gr.addColorStop(1, K.rgba(col, 0));
      s.fillStyle = gr;
      s.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // the sun up in the top right pane, burning through the leaves
    const sun = s.createRadialGradient(232, 34, 0, 232, 34, 180);
    sun.addColorStop(0, "rgba(255,255,250,1)");
    sun.addColorStop(0.2, "rgba(255,252,236,0.85)");
    sun.addColorStop(0.6, "rgba(255,246,220,0.3)");
    sun.addColorStop(1, "rgba(255,246,220,0)");
    s.fillStyle = sun;
    s.fillRect(0, 0, gw, gh);
    // specular glints through the leaves: they become round discs (bokeh) once defocused
    for (let i = 0; i < 46; i++) {
      const x = R() * gw, y = R() * gh * 0.8, r = 4 + R() * 9;
      s.fillStyle = `rgba(255,252,236,${(0.35 + R() * 0.5).toFixed(2)})`;
      s.beginPath();
      s.arc(x, y, r, 0, K.TAU);
      s.fill();
    }
    if (K.hasFilter()) g.filter = `blur(${K.qblur((9 * sc).toFixed(1))}px)`;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(c, 0, 0);
    g.restore();
    g.filter = "none";
    // the over-exposure: everything pushed up toward white (screen)
    g.globalCompositeOperation = "screen";
    g.fillStyle = "rgba(255,246,226,0.32)";
    g.fillRect(0, 0, gw, gh);
    g.globalCompositeOperation = "source-over";
  });
}
// a heavy linen curtain as real fold geometry: a row of vertical tubes 25-40 px wide, each shaded as a
// cylinder (lit crest toward the window, core shadow), a hem that follows the folds, and the sun glowing
// THROUGH the cloth where it hangs over the glass
function curtain(g, side) {
  const [gx, gy, gw] = GL;
  const x0 = side < 0 ? gx - 112 : gx + gw - 8, x1 = side < 0 ? gx + 10 : gx + gw + 114;
  const top = gy - 54, bot = SILL.face + 150;
  const R = K.rng("f12curt" + side);
  const folds = [];
  let x = x0 - 6;
  while (x < x1 + 6) { const w = 25 + R() * 15; folds.push([x, w, 0.7 + R() * 0.3]); x += w; }
  // silhouette: straight at the rod, the free edge drawn back in a gentle curve, the hem scalloped
  const edge = (y) => { const u = (y - top) / (bot - top); return side < 0 ? x1 - Math.sin(u * 1.6) * 40 * u : x0 + Math.sin(u * 1.6) * 40 * u; };
  const p = new Path2D();
  if (side < 0) {
    p.moveTo(x0 - 8, top);
    p.lineTo(x1, top);
    for (let y = top; y <= bot; y += 10) p.lineTo(edge(y), y);
    let hx = edge(bot);
    for (let i = folds.length - 1; i >= 0; i--) {
      const fx = folds[i][0];
      if (fx >= hx) continue;
      p.quadraticCurveTo((fx + hx) / 2, bot + 7, fx, bot);
      hx = fx;
    }
    p.lineTo(x0 - 8, bot);
  } else {
    p.moveTo(x0, top);
    p.lineTo(x1 + 8, top);
    p.lineTo(x1 + 8, bot);
    let hx = x1 + 8;
    const e = edge(bot);
    for (let i = folds.length - 1; i >= 0; i--) {
      const fx = Math.max(folds[i][0], e);
      if (fx >= hx) continue;
      p.quadraticCurveTo((fx + hx) / 2, bot + 7, fx, bot);
      hx = fx;
      if (fx <= e) break;
    }
    for (let y = bot; y >= top; y -= 10) p.lineTo(edge(y), y);
  }
  p.closePath();
  K.texFill(g, "fabric", p, { scale: 34, tex: { color: "#9a7470", weave: 1.4, seed: 6 } });
  g.save();
  g.clip(p);
  // cylinder shading per fold: light comes from the window side
  const lightFrom = side < 0 ? 1 : -1;
  const L0 = x0 - 10, span = x1 + 20 - x0;
  const sh = g.createLinearGradient(L0, 0, L0 + span, 0);
  let lastPos = -1;
  for (const [fx, fw, d] of folds) {
    for (let k = 0; k <= 6; k++) {
      const u = k / 6, xx = fx + u * fw;
      const nx = Math.sin((u - 0.5) * Math.PI); // the tube's surface normal across the fold
      const lit = Math.max(0, nx * lightFrom * 0.8 + 0.35);
      const a = K.clamp(0.72 - lit * 0.62 * d + (k === 0 || k === 6 ? 0.12 : 0));
      const pos = (xx - L0) / span;
      if (pos > lastPos && pos <= 1) { sh.addColorStop(pos, `rgba(12,7,14,${a.toFixed(3)})`); lastPos = pos; }
    }
  }
  g.fillStyle = sh;
  g.fillRect(L0, top, span, bot - top + 10);
  // highlight sheen down each crest (linen catches the light along the fold ridge)
  g.globalCompositeOperation = "lighter";
  for (const [fx, fw] of folds) {
    const cx = fx + fw * (0.5 + lightFrom * 0.22);
    const near = side < 0 ? K.clamp((cx - x0) / (x1 - x0)) : K.clamp((x1 - cx) / (x1 - x0));
    const hg = g.createLinearGradient(cx - 4, 0, cx + 4, 0);
    hg.addColorStop(0, "rgba(255,210,170,0)");
    hg.addColorStop(0.5, `rgba(255,210,170,${(0.04 + near * 0.12).toFixed(3)})`);
    hg.addColorStop(1, "rgba(255,210,170,0)");
    g.fillStyle = hg;
    g.fillRect(cx - 4, top, 8, bot - top);
  }
  // transmission: where the cloth hangs over the bright glass the sun shines through it, warm
  const ex = side < 0 ? x1 : x0;
  const tg = g.createLinearGradient(ex, 0, ex - side * 90, 0);
  tg.addColorStop(0, "rgba(255,170,110,0.75)");
  tg.addColorStop(0.3, "rgba(240,130,90,0.32)");
  tg.addColorStop(1, "rgba(220,120,100,0)");
  g.fillStyle = tg;
  const ty0 = gy - 10, ty1 = SILL.y0 + 6;
  g.fillRect(Math.min(ex, ex - side * 90), ty0, 90, ty1 - ty0);
  g.globalCompositeOperation = "source-over";
  // falls off toward the floor, away from the window
  const vg = g.createLinearGradient(0, top, 0, bot);
  vg.addColorStop(0, "rgba(6,4,12,0.2)");
  vg.addColorStop(0.5, "rgba(6,4,12,0)");
  vg.addColorStop(0.75, "rgba(6,4,12,0.15)");
  vg.addColorStop(1, "rgba(6,4,12,0.6)");
  g.fillStyle = vg;
  g.fillRect(L0 - 20, top, span + 40, bot - top + 10);
  g.restore();
  // iron rings on the rod, mostly hidden behind the gathered heading
  for (let i = 0; i < 6; i++) {
    const rx = K.lerp(x0 + 8, x1 - 8, i / 5) + K.hash(i, 21 + side) * 4;
    g.strokeStyle = "rgba(40,32,28,0.9)";
    g.lineWidth = 1.3;
    g.beginPath();
    g.ellipse(rx, top - 3, 4, 5, 0, Math.PI * 1.05, Math.PI * 1.95);
    g.stroke();
  }
}

function windowPlate() {
  return K.sprite("f12:winplate", WP.w, WP.h, (g) => {
    const [gx, gy, gw, gh] = GL;
    const brk = brokenTop();
    const wall = new Path2D();
    wall.moveTo(-10, WP.h + 10);
    for (let i = 0; i < brk.length; i += 2) wall.lineTo(brk[i], brk[i + 1]);
    wall.lineTo(WP.w + 10, WP.h + 10);
    wall.closePath();
    // broken wall thickness: plaster skin over a brick core along the break, seen from slightly below
    const core = new Path2D();
    core.moveTo(brk[0], brk[1]);
    for (let i = 2; i < brk.length; i += 2) core.lineTo(brk[i], brk[i + 1]);
    for (let i = brk.length - 2; i >= 0; i -= 2) core.lineTo(brk[i] - 6, brk[i + 1] - 13 - K.hash(i, 3) * 4);
    core.closePath();
    K.texFill(g, "brick", core, { scale: 70, tex: { seed: 2 }, tint: "#2a2030", tintAlpha: 0.55 });
    // the wall: faded striped wallpaper over plaster
    K.texFill(g, "wallpaper", wall, { scale: 130, tex: { color: "#8c95a8", motif: "damask", ink: "#6a7288", age: 0.6, seed: 3 } });
    K.texFill(g, "plaster", wall, { scale: 260, alpha: 0.25, mode: "multiply", tex: { seed: 5, stain: 0.6 } });
    g.save();
    g.clip(wall);
    // light: bright around the window, falling off fast (inverse square-ish) into the room's dark
    const cx = gx + gw / 2, cy = gy + gh * 0.6;
    const dk = g.createRadialGradient(cx, cy, gw * 0.45, cx, cy, 720);
    dk.addColorStop(0, "rgba(8,7,18,0.1)");
    dk.addColorStop(0.25, "rgba(8,7,18,0.5)");
    dk.addColorStop(0.6, "rgba(8,7,18,0.8)");
    dk.addColorStop(1, "rgba(8,7,18,0.92)");
    g.fillStyle = dk;
    g.fillRect(0, 0, WP.w, WP.h);
    // plaster lip along the break catches a little cool Void light
    g.strokeStyle = "rgba(150,150,200,0.25)";
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < brk.length; i += 2) i ? g.lineTo(brk[i], brk[i + 1] + 1) : g.moveTo(brk[i], brk[i + 1] + 1);
    g.stroke();
    g.restore();
    // window reveal (the wall's depth): left jamb lit by the sun, head in shade, painted plaster
    const rv = 22;
    const jambL = new Path2D();
    jambL.moveTo(gx - rv, gy - rv); jambL.lineTo(gx, gy); jambL.lineTo(gx, SILL.y0); jambL.lineTo(gx - rv, SILL.y0 + 4); jambL.closePath();
    K.texFill(g, "plaster", jambL, { scale: 120, tex: { color: "#d8d0c0", seed: 8 } });
    const jl = g.createLinearGradient(gx - rv, 0, gx, 0);
    jl.addColorStop(0, "rgba(255,230,190,0.15)");
    jl.addColorStop(1, "rgba(60,50,60,0.35)");
    g.fillStyle = jl;
    g.fill(jambL);
    const jambR = new Path2D();
    jambR.moveTo(gx + gw + rv, gy - rv); jambR.lineTo(gx + gw, gy); jambR.lineTo(gx + gw, SILL.y0); jambR.lineTo(gx + gw + rv, SILL.y0 + 4); jambR.closePath();
    K.texFill(g, "plaster", jambR, { scale: 120, tex: { color: "#d8d0c0", seed: 8 }, tint: "#9a94a0", tintAlpha: 0.5 });
    g.fillStyle = "rgba(10,8,20,0.45)";
    g.fill(jambR);
    const head = new Path2D();
    head.moveTo(gx - rv, gy - rv); head.lineTo(gx + gw + rv, gy - rv); head.lineTo(gx + gw, gy); head.lineTo(gx, gy); head.closePath();
    K.texFill(g, "plaster", head, { scale: 120, tex: { color: "#d8d0c0", seed: 8 }, tint: "#7a7688", tintAlpha: 0.6 });
    g.fillStyle = "rgba(10,8,20,0.4)";
    g.fill(head);
    // the garden through the glass
    g.drawImage(gardenView(), gx, gy, gw, gh);
    // glass: faint sky reflection gradient, a few smudges and dust specks catching the sun
    const gr = g.createLinearGradient(gx, gy, gx + gw, gy + gh);
    gr.addColorStop(0, "rgba(255,255,255,0.06)");
    gr.addColorStop(0.5, "rgba(255,255,255,0)");
    gr.addColorStop(0.8, "rgba(255,255,255,0.05)");
    g.fillStyle = gr;
    g.fillRect(gx, gy, gw, gh);
    const R = K.rng("f12glass");
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(255,250,235,${(0.06 + R() * 0.12).toFixed(3)})`;
      const s = 0.5 + R() * 1.3;
      g.fillRect(gx + R() * gw, gy + R() * gh, s, s);
    }
    // casement frame and glazing bars: painted wood seen against the light, so their faces are in shade
    // with a bright sliver on the edges the sun wraps round
    const bar = (x, y, w, h, lit) => {
      K.texRect(g, "wood", x, y, w, h, { scale: 90, tint: "#d8d2c6", tintAlpha: 0.75, tintMode: "screen", tex: { seed: 4, color: "#b8b0a0" } });
      g.fillStyle = "rgba(40,36,48,0.62)";
      g.fillRect(x, y, w, h);
      g.fillStyle = "rgba(255,244,220,0.7)";
      if (lit === "v") g.fillRect(x + w - 1.6, y, 1.6, h); else g.fillRect(x, y, w, 1.4);
    };
    bar(gx, gy, gw, 10, "h");
    bar(gx, gy + gh - 12, gw, 12, "h");
    bar(gx, gy, 11, gh, "v");
    bar(gx + gw - 11, gy, 11, gh, "v");
    bar(gx + gw / 2 - 5, gy, 10, gh, "v");
    bar(gx, gy + gh * 0.46, gw, 7, "h");
    // sill: deep painted wood. Top face takes the sun (a warm bright patch where the light falls), front face dark
    const top = new Path2D();
    top.moveTo(gx - rv - 4, SILL.y0); top.lineTo(gx + gw + rv + 4, SILL.y0); top.lineTo(SILL.x1, SILL.y1); top.lineTo(SILL.x0, SILL.y1); top.closePath();
    K.texFill(g, "wood", top, { scale: 120, tint: "#e2dccc", tintAlpha: 0.7, tintMode: "screen", tex: { seed: 4, color: "#b8b0a0" } });
    const st = g.createLinearGradient(SILL.x0, 0, SILL.x1, 0);
    st.addColorStop(0, "rgba(20,16,26,0.55)");
    st.addColorStop(0.3, "rgba(20,16,26,0.1)");
    st.addColorStop(0.7, "rgba(20,16,26,0.05)");
    st.addColorStop(1, "rgba(20,16,26,0.6)");
    g.fillStyle = st;
    g.fill(top);
    // the sunlight patch on the sill (the glazing bar's shadow cuts it)
    g.save();
    g.clip(top);
    g.globalCompositeOperation = "lighter";
    const sp = g.createLinearGradient(0, SILL.y0, 0, SILL.y1);
    sp.addColorStop(0, "rgba(255,226,170,0.38)");
    sp.addColorStop(1, "rgba(255,226,170,0.12)");
    g.fillStyle = sp;
    g.beginPath();
    g.moveTo(gx + 30, SILL.y0); g.lineTo(gx + gw - 20, SILL.y0); g.lineTo(gx + gw - 60, SILL.y1); g.lineTo(gx - 10, SILL.y1); g.closePath();
    g.fill();
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(30,20,20,0.35)";
    g.beginPath();
    g.moveTo(gx + gw / 2 - 8, SILL.y0); g.lineTo(gx + gw / 2 + 2, SILL.y0); g.lineTo(gx + gw / 2 - 22, SILL.y1); g.lineTo(gx + gw / 2 - 34, SILL.y1); g.closePath();
    g.fill();
    g.restore();
    K.aoEdge(g, gx - rv, SILL.y0, gx + gw + rv, SILL.y0, { width: 6, alpha: 0.35, side: -1 });
    const face = new Path2D();
    face.rect(SILL.x0, SILL.y1, SILL.x1 - SILL.x0, SILL.face - SILL.y1);
    K.texFill(g, "wood", face, { scale: 120, tint: "#c8c0b0", tintAlpha: 0.6, tintMode: "screen", tex: { seed: 4, color: "#b8b0a0" } });
    g.fillStyle = "rgba(12,10,20,0.6)";
    g.fill(face);
    g.fillStyle = "rgba(255,236,200,0.35)";
    g.fillRect(SILL.x0, SILL.y1, SILL.x1 - SILL.x0, 1.2);
    // shadow the sill throws on the wall below it
    const us = g.createLinearGradient(0, SILL.face, 0, SILL.face + 40);
    us.addColorStop(0, "rgba(4,3,10,0.6)");
    us.addColorStop(1, "rgba(4,3,10,0)");
    g.fillStyle = us;
    g.fillRect(SILL.x0 - 10, SILL.face, SILL.x1 - SILL.x0 + 20, 40);
    // curtains and the rod
    K.texRect(g, "metal", gx - 140, gy - 62, gw + 280, 7, { scale: 60, tex: { color: "#4a3a2c", seed: 2 } });
    g.fillStyle = "rgba(255,220,170,0.3)";
    g.fillRect(gx - 140, gy - 62, gw + 280, 1.2);
    curtain(g, -1);
    curtain(g, 1);
  });
}
// shot 3 builds shot 4 ahead of time: one texture / sprite per 0.3 s window (only fills caches)
const WIN_WARM = [
  () => K.texture("brick", { seed: 2 }),
  () => K.texture("wallpaper", { color: "#8c95a8", motif: "damask", ink: "#6a7288", age: 0.6, seed: 3 }),
  () => K.texture("plaster", { seed: 5, stain: 0.6 }),
  () => K.texture("plaster", { color: "#d8d0c0", seed: 8 }),
  () => K.texture("wood", { seed: 4, color: "#b8b0a0" }),
  () => K.texture("metal", { color: "#4a3a2c", seed: 2 }),
  () => K.texture("fabric", { color: "#9a7470", weave: 1.2, seed: 6 }),
  () => K.texture("cloud", { seed: 3, cover: 0.5 }),
  () => K.texture("foliage", { color: "#5a7a3c", seed: 2 }),
  () => K.texture("turf", { seed: 5 }),
  () => gardenView(),
  () => windowPlate(),
  () => K.texture("cloud", { seed: 9, cover: 0.55 }),
  () => shaftSprite(),
  () => K.texture("fabric", { color: "#c89a1e", weave: 1.6, seed: 14 }),
  () => paleSprite(3),
  () => paleSprite(8),
];
function prewarmWin(t) {
  const i = Math.floor((t - 24.5) / 0.3);
  if (i >= 0 && i < WIN_WARM.length) WIN_WARM[i]();
}
// the shaft of morning sun through the glass into the room (plate px): the glass rectangle swept down and
// to the left, brightest at the window and fading with distance, its density broken up by drifting dust
// (a stretched fbm mask). Baked once; drawn added with a slow breathing.
const SHAFT_D = [-300, 330];
function shaftSprite() {
  return K.sprite("f12:shaft", WP.w, WP.h, shaftPaint);
}
function shaftPaint(g) {
  {
    const [gx, gy, gw, gh] = GL;
    const [dx, dy] = SHAFT_D;
    const p = new Path2D();
    p.moveTo(gx + 14, gy + 10); p.lineTo(gx + gw - 12, gy + 10); p.lineTo(gx + gw - 12, gy + gh - 12);
    p.lineTo(gx + gw - 12 + dx, gy + gh - 12 + dy); p.lineTo(gx + 14 + dx, gy + gh + dy); p.lineTo(gx + 14 + dx, gy + 10 + dy);
    p.closePath();
    const lg = g.createLinearGradient(gx + gw * 0.6, gy + gh * 0.4, gx + gw * 0.6 + dx, gy + gh * 0.4 + dy);
    lg.addColorStop(0, "rgba(255,236,196,0.5)");
    lg.addColorStop(0.45, "rgba(255,226,180,0.24)");
    lg.addColorStop(1, "rgba(255,220,170,0)");
    g.fillStyle = lg;
    g.fill(p);
    // dust density: a cloud texture stretched along the shaft
    g.save();
    g.clip(p);
    g.globalCompositeOperation = "destination-out";
    K.texFill(g, "cloud", p, { scale: 260, scaleY: 90, rot: Math.atan2(dy, dx), alpha: 0.3, tex: { seed: 9, cover: 0.55 } });
    g.restore();
    // glazing bars throw darker lanes down the shaft
    g.save();
    g.clip(p);
    g.globalCompositeOperation = "destination-out";
    for (const [bx, by] of [[gx + gw / 2, gy], [gx, gy + gh * 0.46]]) {
      g.strokeStyle = "rgba(0,0,0,0.45)";
      g.lineWidth = by === gy ? 12 : 9;
      g.beginPath();
      if (by === gy) { g.moveTo(bx, gy); g.lineTo(bx + dx, gy + gh + dy); } else { g.moveTo(gx, by); g.lineTo(gx + gw + dx, by + dy); }
      g.stroke();
    }
    g.restore();
    if (K.hasFilter()) {
      const c = K.makeCanvas(g.canvas.width, g.canvas.height);
      c.getContext("2d").drawImage(g.canvas, 0, 0);
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, g.canvas.width, g.canvas.height);
      g.filter = `blur(${K.qblur((6 * g.canvas.width / WP.w).toFixed(1))}px)`;
      g.drawImage(c, 0, 0);
      g.restore();
    }
  }
}
function windowClose(g, t, p, extra) {
  voidBg(g, 200, 30 + p * 20);
  const [gx, gy, gw, gh] = GL;
  // the plate drifts down a hair (the island bobbing) while the camera eases in toward the sill
  const by = bob(t, 0.7) * 0.25;
  K.withCamera(g, VW, VH, { x: 486 + p * 30, y: 272 + p * 10, zoom: 1 + p * 0.06, shakeT: t, shakeAmt: 0.9 }, () => {
    g.save();
    g.translate(WP.ox, WP.oy + by);
    g.drawImage(windowPlate(), 0, 0, WP.w, WP.h);
    // the volumetric shaft, breathing a little as dust drifts through it
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.85 + 0.15 * Math.sin(t * 0.7);
    g.drawImage(shaftSprite(), 0, 0, WP.w, WP.h);
    g.restore();
    // dust motes: only visible where they cross the light, glinting as they turn
    g.save();
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 90; i++) {
      const h1 = K.hash(i, 71), h2 = K.hash(i, 72), h3 = K.hash(i, 73);
      const u = (h1 + t * (0.004 + h3 * 0.006)) % 1, v = (h2 + Math.sin(t * 0.3 + i) * 0.04 + 1) % 1;
      const x = gx + 20 + v * (gw - 30) + SHAFT_D[0] * u, y = gy + 20 + v * 0.3 * gh + (gh * 0.7) * ((i * 0.37) % 1) + SHAFT_D[1] * u;
      const tw = 0.4 + 0.6 * Math.max(0, Math.sin(t * (1.5 + h3 * 3) + i * 2.1));
      const a = (1 - u) * tw * 0.8;
      g.fillStyle = `rgba(255,246,220,${a.toFixed(3)})`;
      g.fillRect(x, y, 1.2 + h3, 1.2 + h3);
      if (h3 > 0.8) K.glow(g, x, y, 4, "#fff1d0", a * 0.5);
    }
    g.restore();
    if (extra) extra(g, gx, gy, gw, gh);
    g.restore();
  });
}
// the hand: the kid's own hand (lib1214 povHand) painted into a layer, then given what a lens would see
// close up against a bright window: a warm subsurface rim where the light wraps the finger edges, the
// shadowed palm side, skin micro-texture, cotton weave on the cuff, motion blur along the reach and a
// little defocus (it is nearer the lens than the sill).
function photoHand(g, t, hp, open) {
  const at = (tt) => {
    const h = K.ease.out(K.seg(tt, 36.4, 39.8)) - K.ease.inOut(K.seg(tt, 42.4, 44.4)) * 0.6;
    return [K.lerp(40, 300, h), K.lerp(720, 470, h)];
  };
  const [wx, wy] = at(t);
  const ang = -0.92 + Math.sin(t * 0.8) * 0.02 + Math.sin(t * 2.3) * 0.006;
  const light = { x: 640, y: 160 };
  const HL = K.layer(VW, VH, "f12hand");
  const f = HL.g;
  povHand(f, wx, wy, 230, {
    left: true, angle: ang, curl: K.lerp(0.28, 0.06, open), spread: K.lerp(0.06, 0.13, open),
    bell: true, t, swing: -0.3, light: { x: light.x, y: light.y, color: "#ffe6bc", strength: 0.9 },
  });
  // cotton weave on the sleeve and cuff: only on the arm side of the wrist
  f.save();
  f.translate(wx, wy);
  f.rotate(ang);
  f.beginPath();
  f.rect(-600, -300, 590, 600);
  f.restore();
  f.save();
  f.clip();
  K.texRect(f, "fabric", wx - 400, wy - 300, 700, 700, { scale: 16, alpha: 0.42, mode: "source-atop", tex: { color: "#c89a1e", weave: 1.6, seed: 14 } });
  f.restore();
  // skin micro-texture over everything else
  K.texRect(f, "noise", wx - 60, wy - 380, 420, 420, { scale: 26, alpha: 0.1, mode: "source-atop", tex: { seed: 15, amp: 70 } });
  // shading: the hand is between us and the window, so most of it is in shadow; the far (palm) side darker
  const la = Math.atan2(light.y - wy, light.x - wx);
  const sh = K.layer(VW, VH, "f12handsh");
  sh.g.drawImage(HL.canvas, 0, 0, VW, VH);
  sh.g.globalCompositeOperation = "destination-out";
  sh.g.drawImage(HL.canvas, -Math.cos(la) * 7, -Math.sin(la) * 7, VW, VH);
  sh.g.globalCompositeOperation = "source-in";
  sh.g.fillStyle = "#ff9a6a";
  sh.g.fillRect(0, 0, VW, VH);
  f.save();
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.globalCompositeOperation = "source-atop";
  const dg = f.createLinearGradient(wx * HL.canvas.width / VW, wy * HL.canvas.height / VH, (wx + Math.cos(la) * 260) * HL.canvas.width / VW, (wy + Math.sin(la) * 260) * HL.canvas.height / VH);
  dg.addColorStop(0, "rgba(16,8,14,0.66)");
  dg.addColorStop(0.6, "rgba(16,8,14,0.4)");
  dg.addColorStop(1, "rgba(16,8,14,0.2)");
  f.fillStyle = dg;
  f.fillRect(0, 0, HL.canvas.width, HL.canvas.height);
  f.restore();
  // subsurface rim: warm, soft, wrapping the lit edges (and bleeding a hair past them)
  // the hand and sleeve only ever fill the lower left of the frame: blur just that part
  const hb = [0, Math.max(0, wy - 330), Math.min(VW, wx + 330), VH];
  f.save();
  f.globalCompositeOperation = "lighter";
  K.dof(f, sh.canvas, 1.5, 0.75, hb);
  f.restore();
  K.dof(f, sh.canvas, 4, 0.25, hb);
  // motion blur along the reach (1/48 s shutter) and a little defocus
  const [px, py] = at(t - 1 / 48);
  const vx = wx - px, vy = wy - py, sp = Math.hypot(vx, vy);
  g.save();
  if (sp > 0.5) for (const [k, a] of [[-1, 0.22], [-0.5, 0.32]]) { g.save(); g.translate(k * vx, k * vy); K.dof(g, HL.canvas, 3, a, hb); g.restore(); }
  K.dof(g, HL.canvas, 2.6, sp > 0.5 ? 0.7 : 1, hb);
  g.restore();
}
// golden motes leaving the afterimage: emitted from inside his sitting silhouette, drifting up and
// outward, hot cores the lens blooms
function dissolveMotes(g, t, catX, sillY, size) {
  if (t < 40.1 || t > 45) return;
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 340; i++) {
    const h1 = K.hash(i, 31), h2 = K.hash(i, 32), h3 = K.hash(i, 33), h4 = K.hash(i, 34);
    // a point inside the silhouette: body (lower ellipse) or head (upper circle)
    let ux, uy;
    if (h4 < 0.72) { const a = h1 * K.TAU, r = Math.sqrt(h2); ux = Math.cos(a) * r * size * 0.42 - size * 0.05; uy = -size * 0.62 + Math.sin(a) * r * size * 0.6; } else { const a = h1 * K.TAU, r = Math.sqrt(h2); ux = size * 0.12 + Math.cos(a) * r * size * 0.3; uy = -size * 1.42 + Math.sin(a) * r * size * 0.28; }
    // emission sweeps from the head down over 1.5 s
    const delay = (1 + uy / (size * 1.75)) * 1.1 + h3 * 0.4;
    const age = t - 40.2 - delay;
    if (age < 0) continue;
    const life = 1.6 + h3 * 1.4;
    if (age > life) continue;
    const fz = 1 - age / life;
    const x = catX + ux + Math.sin(age * 1.6 + i) * 8 + age * (h1 - 0.45) * 70;
    const y = sillY + uy - age * (50 + h3 * 70) - age * age * 10;
    const a = fz * Math.min(1, age * 6);
    // a saturated amber speck (reads even against the blown-out glass) inside a hot added glow
    g.globalCompositeOperation = "source-over";
    g.fillStyle = `rgba(232,150,40,${(0.7 * a).toFixed(3)})`;
    const r = 1 + h3 * 1.6;
    g.beginPath();
    g.arc(x, y, r * 0.8, 0, K.TAU);
    g.fill();
    g.globalCompositeOperation = "lighter";
    if (i & 1) K.glow(g, x, y, 3 + h3 * 5, i % 4 === 1 ? "#fff3c8" : GOLD, 0.6 * a);
    g.fillStyle = `rgba(255,250,232,${(0.9 * a).toFixed(3)})`;
    g.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
  }
  g.restore();
}
function shot4(g, t) { // [32-44] afterimage on the windowsill; your hand reaches, it dissolves into gold dust
  prewarmLate(t, 32.6);
  windowClose(g, t, K.ease.inOut(K.seg(t, 32, 44)), (g2, gx, gy, gw) => {
    const sillY = SILL.y0 + 8;
    const catX = gx + gw * 0.58;
    const dis = K.smooth(K.seg(t, 40.2, 41.8));
    const a = K.env(t, 32.2, 44, 1.4, 0.2) * (1 - dis);
    const size = 68;
    const sunL = { x: gx + 232 * gw / GL[2], y: gy + 34 };
    // seated on the sill facing the glass, head turned out toward the garden; the window shows through
    // him (~0.35), the low sun rims his ears and whiskers from behind
    ghostCat(g2, a, (L) => {
      K.drawCat(L, catX, sillY, size, {
        pose: "sit", facing: 1, headTurn: -0.6 + Math.sin(t * 0.5) * 0.05, t, tail: 1, shadow: false, bell: false,
        key: { x: sunL.x, y: sunL.y, color: "#fff2dc", strength: 1.1 }, rim: { x: sunL.x + 40, y: sunL.y - 30, color: "#fff0d0", strength: 2 },
        backlit: 1, fill: "#3a2a30", ambientK: 0.15, pupil: 0.15,
      });
    }, { box: [catX - size * 1.4, sillY - size * 2.4, size * 2.8, size * 2.6], body: 0.42, add: 0.1, tint: 0.1, color: "#ffd090", rim: 1.0, rimW: 2.5, rimColor: "#fff2d6", halo: 6, haloA: 0.2 });
    dissolveMotes(g2, t, catX, sillY, size);
  });
  // your left hand (the bell on its red string at the wrist) reaches in from the bottom left (POV)
  const hp = K.ease.out(K.seg(t, 36.4, 39.8)) - K.ease.inOut(K.seg(t, 42.4, 44.4)) * 0.6;
  if (hp > 0.001) photoHand(g, t, hp, K.smooth(K.seg(t, 40.2, 41)));
}


// shot 5: the line-up path (well separated so no two islands overlap on screen)
const LINE = [
  ["bed", 206, 420, 1.16],
  ["kitchen", 420, 334, 0.8],
  ["door", 612, 262, 0.54],
  ["window", 800, 198, 0.36],
];
const LINE_BLUR = { bed: 0, kitchen: 0, door: 3, window: 5 };
// the pale light ahead: a soft volumetric source (exponential falloff) whose rays are the same light
// scattered through uneven dust: ray density follows an angular fbm, two plates turn slowly against each
// other so the rays breathe. Baked once per pixel; drawn added.
function paleSprite(seed) {
  return K.texBake("f12pale" + seed, 384, 384, (u, v, out) => {
    const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy) * 2;
    const th = Math.atan2(dy, dx);
    const ang = (K.texFbm(Math.cos(th) * 1.6 + 5, Math.sin(th) * 1.6 + 5, seed, 3) + 1) * 0.5;
    const rays = Math.pow(ang, 2) * Math.exp(-r * 3.2) * (1 - K.smooth((r - 0.6) / 0.4)) * 0.7;
    const dust = 0.75 + 0.25 * K.texFbm(u * 6, v * 6, seed + 1, 3);
    const I = (Math.exp(-r * 9) * 1.0 + Math.exp(-r * 4.5) * 0.4 + Math.exp(-r * 2) * 0.08 + rays * dust) * (1 - K.smooth((r - 0.85) / 0.15));
    out[0] = Math.min(255, 205 * I * 1.05); out[1] = Math.min(255, 214 * I * 1.05); out[2] = Math.min(255, 255 * I); out[3] = 255;
  });
}
function paleLight(g, x, y, s, t, a = 1) {
  g.save();
  g.globalCompositeOperation = "lighter";
  for (const [seed, dir, k] of [[3, 1, 0.8], [8, -1, 0.6]]) {
    g.save();
    g.translate(x, y);
    g.rotate(t * 0.02 * dir + seed);
    g.globalAlpha = a * k;
    const R = 520 * s;
    g.drawImage(paleSprite(seed), -R, -R, R * 2, R * 2);
    g.restore();
  }
  g.restore();
  K.glow(g, x, y, 14 * s, "#ffffff", 0.9 * a);
}
// the side of an island facing the pale light picks up a thin cool rim (top lip and crag edge)
function paleRim(g, x, y, k, ang, a) {
  if (a <= 0.01) return;
  g.save();
  g.translate(x, y);
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  // where the light falls on the lip: a soft cool sheen (several faint passes, no hard line)
  const ea = Math.atan2(Math.sin(ang) * 104, Math.cos(ang) * 29);
  for (const [w, al] of [[9, 0.05], [5, 0.07], [2.2, 0.12]]) {
    g.strokeStyle = `rgba(200,214,255,${(al * a).toFixed(3)})`;
    g.lineWidth = w * k;
    g.beginPath();
    g.ellipse(0, 0, 103 * k, 28 * k, 0, ea - 0.7, ea + 0.7);
    g.stroke();
  }
  // and on the crag side facing it, a broad soft cool wash
  const cx = Math.cos(ang) * 60 * k, cy = 50 * k;
  const gw = g.createRadialGradient(cx, cy, 0, cx, cy, 70 * k);
  gw.addColorStop(0, `rgba(150,165,240,${(0.1 * a).toFixed(3)})`);
  gw.addColorStop(1, "rgba(150,165,240,0)");
  g.fillStyle = gw;
  g.fillRect(cx - 70 * k, cy - 70 * k, 140 * k, 140 * k);
  g.restore();
}
function pale(g, x, y, s) {
  K.glow(g, x, y, 260 * s, "#cfd8ff", 0.32);
  K.glow(g, x, y, 90 * s, "#eef2ff", 0.6);
  K.glow(g, x, y, 22 * s, "#ffffff", 0.95);
}
function shot5(g, t) { // [44-54] wide: from 44 the islands slide and swing round into a diagonal path
  const p = K.ease.inOut(K.seg(t, 44, 54));
  voidBg(g, 60 + p * 30, 10 - p * 20);
  const lineP = K.ease.inOut(K.seg(t, 44, 50.2));
  const lightA = K.seg(t, 46, 52);
  paleLight(g, 905 - p * 6, 150, 0.45 + lightA * 0.45, t, 0.35 + lightA * 0.65);
  // slight crane up and push as the path forms
  K.withCamera(g, VW, VH, { x: 480 + p * 24, y: 270 - p * 14, zoom: 1.0 + p * 0.04, shakeT: t, shakeAmt: 1 }, () => {
    const order = ["window", "door", "kitchen", "bed"];
    for (const kind of order) {
      const s = SCATTER.find((e) => e[0] === kind);
      const l = LINE.find((e) => e[0] === kind);
      const li = LINE.indexOf(l);
      const q = K.ease.inOut(K.clamp(lineP * 1.4 - (3 - li) * 0.13));
      const x = K.lerp(s[1], l[1], q), y = K.lerp(s[2], l[2], q) + bob(t, s[4]) * (1 - q * 0.6);
      const k = K.lerp(s[3], l[3], q);
      const blur = K.lerp(s[5] * 2, LINE_BLUR[kind], q);
      const swing = Math.sin(q * Math.PI) * 0.22 * (li % 2 ? -1 : 1);
      island(g, kind, x, y, k, t, { rot: tilt(t, s[4]) * (1 - q) + swing, blur: blur > 0.6 ? Math.round(blur) : 0 });
      paleRim(g, x, y, k, Math.atan2(150 - y, 905 - x), lightA * (blur > 2 ? 0.5 : 1));
      islandPaws(g, x, y, k, t, 47.6 + li * 0.7, K.seg(q, 0.6, 1));
    }
  });
  motes(g, t, 11, 24);
}

// shot 6 [54-66]: camera behind and above; you jump island to island toward the pale light.
const PATH = [
  ["bed", -40, 0],
  ["kitchen", 120, -50],
  ["door", -160, -100],
  ["window", 200, -150],
];
const SPOT = { bed: [34, -14], kitchen: [-12, -12], door: [24, -12], window: [-14, -12] };
const PZ = 520, Z0 = 560, JT = 1.3, RUN = 26;
const JUMPS = [56.0, 59.2, 62.4];
function spotOf(i, t) {
  const [kind, wx, wy] = PATH[i];
  const s = SPOT[kind];
  return [wx + s[0], wy + bob(t, i) * 0.5, Z0 + i * PZ + s[1]];
}
function kidState(t) {
  let i = 0;
  for (const j of JUMPS) if (t >= j + JT) i++;
  i = Math.min(i, PATH.length - 1);
  const jt = JUMPS[i];
  if (jt != null && t >= jt && t < jt + JT) {
    const q = (t - jt) / JT;
    const a = spotOf(i, t), b = spotOf(i + 1, t);
    a[2] += RUN;
    // a real leap: fast off the deck, hang at the apex, fall faster (gravity), legs tucked at the top
    const qe = q < 0.5 ? K.ease.out(q * 2) * 0.5 : 0.5 + K.ease.in((q - 0.5) * 2) * 0.5;
    return { x: K.lerp(a[0], b[0], q), y: K.lerp(a[1], b[1], q) - 4 * q * (1 - q) * 105, z: K.lerp(a[2], b[2], qe), air: true, q, i, gy: K.lerp(a[1], b[1], q) };
  }
  const s = spotOf(i, t);
  const walkIn = jt != null ? K.seg(t, jt - 1.5, jt - 0.45) : 0;
  const prep = jt != null ? K.seg(t, jt - 0.5, jt) : 0;
  // anticipation: sink into the knees, then spring; landing: absorb the drop (squash) and rise again
  const land = i > 0 ? 1 - K.ease.out(K.seg(t, JUMPS[i - 1] + JT, JUMPS[i - 1] + JT + 0.55)) : 0;
  const ant = Math.sin(Math.PI * Math.min(1, prep * 1.15)) * 0.8 * (prep < 0.87 ? 1 : 0) + (prep >= 0.87 ? (1 - prep) * 3 : 0);
  return { x: s[0], y: s[1], z: s[2] + RUN * K.ease.inOut(walkIn), air: false, walk: walkIn > 0 && walkIn < 1, phase: walkIn * 1.6, crouch: Math.max(ant, land * 0.75), i };
}
function shot6(g, t) {
  voidBg(g, 80, -20);
  const F = 600, HOR = 170;
  const kid = kidState(t), lag = kidState(t - 0.35);
  const camZ = kid.z * 0.4 + lag.z * 0.6 - 430;
  const camX = (kid.x * 0.5 + lag.x * 0.5) + 45;
  const camY = Math.min(kid.y, 0) * 0.3 + lag.y * 0.7 - 172 - K.seg(t, 54, 66) * 16;
  const proj = (wx, wy, wz) => {
    const dz = Math.max(30, wz - camZ);
    return [480 + (wx - camX) * F / dz, HOR + (wy - camY) * F / dz, F / dz];
  };
  const lp = proj(60, -320, Z0 + PZ * 5.4);
  const swell = K.seg(t, 58, 64);
  paleLight(g, lp[0], lp[1], 0.7 + swell * 0.5, t, 0.8 + swell * 0.2);
  const drawKid = () => {
    const [kx, ky, kk] = proj(kid.x, kid.y, kid.z);
    const h = 118 * kk;
    const KL = K.layer(VW, VH, "f12kid");
    const po = {
      view: "back", t, crouch: kid.air ? 0.1 + Math.sin(Math.PI * kid.q) * 0.35 : kid.crouch || 0, walk: !!kid.walk, run: kid.air, phase: kid.air ? 0.3 : kid.phase || 0, bell: true,
      shadow: !kid.air, light: { x: lp[0], y: lp[1], color: "#dfe6ff", strength: 1.1, z: -0.6 }, ambient: "#1a1c34", hair: "#3a2414",
    };
    K.drawPerson(KL.g, kx, ky, h, po);
    hairOver(KL.g, kx, ky, h, po);
    KL.g.save();
    KL.g.setTransform(1, 0, 0, 1, 0, 0);
    KL.g.globalCompositeOperation = "source-atop";
    KL.g.fillStyle = "rgba(10,10,30,0.22)";
    KL.g.fillRect(0, 0, KL.canvas.width, KL.canvas.height);
    KL.g.restore();
    // rim light from the pale light ahead: the silhouette minus itself shifted away from the light
    const la = Math.atan2(lp[1] - ky, lp[0] - kx), rw = Math.max(1, h * 0.014);
    const RL = K.layer(VW, VH, "f12kidrim");
    RL.g.drawImage(KL.canvas, 0, 0, VW, VH);
    RL.g.globalCompositeOperation = "destination-out";
    RL.g.drawImage(KL.canvas, Math.cos(la) * rw, Math.sin(la) * rw, VW, VH);
    RL.g.globalCompositeOperation = "source-in";
    RL.g.fillStyle = "#e6ecff";
    RL.g.fillRect(0, 0, VW, VH);
    RL.g.globalCompositeOperation = "source-over";
    // contact shadow under the boots (or on the deck below while in the air, smaller and softer)
    if (!kid.air) K.shadowBlob(g, kx, ky + h * 0.01, h * 0.22, h * 0.045, { alpha: 0.7 });
    else if (kid.q < 0.22 || kid.q > 0.78) {
      const [gx2, gy2] = proj(kid.x, kid.gy, kid.z);
      const up = 1 - Math.abs(kid.q - 0.5) * 2;
      K.shadowBlob(g, gx2, gy2, h * (0.22 + up * 0.2), h * 0.05, { alpha: 0.5 * (1 - up * 1.5) });
    }
    // a 1/48 s shutter: mid-jump the body smears a little along its path (motion blur)
    // only the kid's own box is copied (full-frame copies cost a lot on software canvases)
    const PXs = KL.canvas.width / VW;
    const bx = Math.max(0, Math.floor(kx - h * 0.7)), by = Math.max(0, Math.floor(ky - h * 1.25)), bw = Math.min(VW - bx, Math.ceil(h * 1.4)), bh = Math.min(VH - by, Math.ceil(h * 1.4));
    const blit = (c, ox, oy) => { if (bw > 0 && bh > 0) g.drawImage(c, bx * PXs, by * PXs, bw * PXs, bh * PXs, bx + ox, by + oy, bw, bh); };
    if (kid.air) {
      const pk = kidState(t - 1 / 48);
      const [px2, py2] = proj(pk.x, pk.y, pk.z);
      const vx = kx - px2, vy = ky - py2;
      g.save();
      for (const [f, a] of [[-1, 0.22], [-0.5, 0.3], [0.5, 0.22]]) {
        g.globalAlpha = a;
        blit(KL.canvas, f * vx, f * vy);
      }
      g.globalAlpha = 0.6;
      blit(KL.canvas, 0, 0);
      g.restore();
    } else blit(KL.canvas, 0, 0);
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = kid.air ? 0.18 : 0.3;
    blit(RL.canvas, 0, 0);
    g.restore();
    K.glow(g, kx, ky - h * 0.85, h * 0.4, "#dfe6ff", 0.1);
  };
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1, rot: Math.sin(t * 0.5) * 0.006, shakeT: t, shakeAmt: 1.1 }, () => {
    for (let i = PATH.length - 1; i >= 0; i--) {
      const [kind, wx, wy] = PATH[i];
      const [sx, sy, k] = proj(wx, wy + bob(t, i) * 0.5, Z0 + i * PZ);
      if (k <= 6) {
        const blur = k > 1.6 ? 3 : k < 0.45 ? 4 : k < 0.7 ? 2 : 0;
        island(g, kind, sx, sy, k, t, { rot: tilt(t, i) * 0.4, blur, alpha: k > 1.6 ? K.clamp(1 - (k - 1.6) * 0.8) : 1 });
        paleRim(g, sx, sy, k, Math.atan2(lp[1] - sy, lp[0] - sx), (0.7 + swell * 0.3) * (k > 1.6 ? K.clamp(1 - (k - 1.6) * 0.8) : 1));
        // "again": the pawprints relight on the next island just before each jump
        if (i > 0) islandPaws(g, sx + SPOT[kind][0] * k * 0.4, sy, k, t, JUMPS[i - 1] - 0.6, 1, 1);
      }
      if (i === kid.i) drawKid();
    }
  });
  motes(g, t, 17, 30);
}

const SHOTS = [
  [0, shot1, false],
  [12, shot2, false],
  [22, shot3, false],
  [32, shot4, true], // the only dissolve: out of the bed memory into the window memory
  [44, shot5, true], // out of the memory, back into the Void
  [54, shot6, false],
];
function compose(g, t) {
  let i = 0;
  while (i < SHOTS.length - 1 && t >= SHOTS[i + 1][0]) i++;
  const cur = SHOTS[i];
  const next = SHOTS[i + 1];
  if (next && next[2] && t > next[0] - XF / 2) {
    cur[1](g, t);
    overlay(g, t, next[1], K.smooth((t - (next[0] - XF / 2)) / XF));
  } else if (cur[2] && i > 0 && t < cur[0] + XF / 2) {
    SHOTS[i - 1][1](g, t);
    overlay(g, t, cur[1], K.smooth((t - (cur[0] - XF / 2)) / XF));
  } else cur[1](g, t);
}
function overlay(g, t, fn, a) {
  const L = K.layer(VW, VH, "f12xf");
  fn(L.g, t);
  g.save();
  g.globalAlpha = a;
  g.drawImage(L.canvas, 0, 0, VW, VH);
  g.restore();
}

export const film = {
  id: 12,
  title: "Echoes",
  chapter: "Chapter 12",
  unlockAt: 60,
  duration: D,
  poster: 28,
  tagline: "In the Void, your memories float.",
  subs: [
    [3.0, 7.0, "Your home. In pieces. Floating."],
    [13.0, 17.0, "Your bed. Still warm where he slept."],
    [23.0, 27.5, "Every night, right there. Every single night."],
    [33.0, 37.5, "Every morning, the window."],
    [38.0, 42.0, "You reached out. It was only a memory."],
    [45.5, 50.0, "Then the pieces lined up. A path."],
    [51.0, 53.5, "He was showing you the way."],
    [56.0, 59.0, "Again."],
  ],
  voice: [
    [3.0, "Your home. In pieces. Floating."],
    [13.0, "Your bed. Still warm where he slept."],
    [23.0, "Every night, right there. Every single night.", { rate: 0.85, pitch: 0.95 }],
    [33.0, "Every morning, the window."],
    [38.0, "You reached out. It was only a memory.", { rate: 0.85, pitch: 0.95 }],
    [45.5, "Then the pieces lined up. A path."],
    [51.0, "He was showing you the way."],
    [56.0, "Again."],
  ],
  score: { mood: "sad", key: "G", bpm: 68, cues: [[6, "swell"], [22, "meow"], [30, "purr"], [44, "meow"], [58, "swell"]] },
  // the lens does the look: a cool, low-key night in the Void (lifted indigo blacks, lamps that bloom),
  // warming into a grainier "memory" stock for the afterimage shots (22-44)
  grade: {
    exposure: 0.92, temp: -0.06, tint: 0.02, lift: [0.006, 0.005, 0.02], gamma: [1, 1, 1.03], gain: [1, 0.99, 0.97],
    contrast: 1.07, sat: 0.94, bloom: 0.42, threshold: 0.95, halation: 0.45, streak: 0.04,
    grain: 0.06, grainSize: 1.4, ca: 0.55, vignette: 0.55, weave: 0.7, sharpen: 0.15,
  },
  gradeAt(t) {
    const m = t >= 20 && t < 46 ? K.env(t, 21.4, 44.4, 1.6, 1.6) : 0;
    const win = t >= 31 && t < 45 ? K.env(t, 31.6, 44.2, 1.0, 0.8) : 0;
    const sw = K.seg(t, 57, 63);
    return {
      temp: -0.06 + m * 0.2 - sw * 0.04, grain: 0.055 + m * 0.012, halation: 0.45 + m * 0.15,
      exposure: 0.92 - win * 0.08, sat: 0.94 - m * 0.04, bloom: 0.42 + sw * 0.18 + win * 0.06,
      lift: [0.006 + m * 0.008, 0.005 + m * 0.004, 0.02 - m * 0.01],
    };
  },
  draw(g, t, W, H) {
    g.save();
    g.scale(W / VW, H / VH);
    g.fillStyle = VOID;
    g.fillRect(0, 0, VW, VH);
    compose(g, t);
    K.letterbox(g, VW, VH, 1);
    const ta = K.env(t, 1.6, 6.4, 1.0, 1.0);
    if (ta > 0) K.title(g, VW, VH, "Echoes", "Chapter 12", ta, { y: VH * 0.3, size: 60, glow: "#ffcf8a" });
    K.fadeBlack(g, VW, VH, 1 - K.smooth(K.seg(t, 0, 1.4)));
    K.fadeBlack(g, VW, VH, K.smooth(K.seg(t, 63.4, 66)));
    g.restore();
  },
};
