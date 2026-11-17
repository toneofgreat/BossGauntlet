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
    const cols = ["#2a2266", "#1b2a5e", "#3a1f55", "#24386a", "#4a2a50"];
    for (let i = 0; i < 46; i++) {
      const x = R() * w, y = h * (0.15 + R() * 0.75), r = 80 + R() * 260;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const c = cols[i % cols.length];
      gr.addColorStop(0, K.rgba(c, 0.16 + R() * 0.12));
      gr.addColorStop(1, K.rgba(c, 0));
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // a faint luminous river of dust across the void
    for (let i = 0; i < 70; i++) {
      const u = i / 70;
      const x = u * w, y = h * (0.36 + Math.sin(u * 5.2) * 0.07 + u * 0.12);
      const r = 40 + R() * 90;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, K.rgba("#6f6fb8", 0.05));
      gr.addColorStop(1, K.rgba("#6f6fb8", 0));
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
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
  K.stars(g, VW, VH, 12, 0.35, 0, { yMax: VH });
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
  door: { lamp: [-52, -112], color: LAMP.door, floor: "wood" },
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
  gr.addColorStop(0, "#4a3a36");
  gr.addColorStop(0.12, "#2c2230");
  gr.addColorStop(0.6, "#15121f");
  gr.addColorStop(1, "#0b0a16");
  g.fillStyle = gr;
  g.fill(p);
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
    g.fillStyle = K.rgba(bands[i], 0.6);
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
  // angular rock facets: lit top faces, dark undersides
  for (let i = 0; i < 24; i++) {
    const x = -95 + R() * 190, y = 16 + R() * 110, s = 4 + R() * 10;
    const c = K.mix("#6a5650", "#2a2230", K.clamp(y / 130 + R() * 0.3));
    g.fillStyle = K.rgba(c, 0.9);
    g.beginPath();
    g.moveTo(x - s * 0.5, y);
    g.lineTo(x + s * 0.1, y - s * 0.35);
    g.lineTo(x + s * 0.6, y - s * 0.05);
    g.lineTo(x + s * 0.4, y + s * 0.5);
    g.lineTo(x - s * 0.3, y + s * 0.55);
    g.closePath();
    g.fill();
    g.fillStyle = K.rgba(K.shade(c, 0.35), 0.7);
    g.beginPath();
    g.moveTo(x - s * 0.5, y);
    g.lineTo(x + s * 0.1, y - s * 0.35);
    g.lineTo(x + s * 0.6, y - s * 0.05);
    g.lineTo(x + s * 0.05, y + s * 0.08);
    g.closePath();
    g.fill();
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
  const base = meta.floor === "tile" ? "#d9d2c4" : "#7a5236";
  sg.addColorStop(0, K.shade(base, lx < 0 ? 0.1 : -0.35));
  sg.addColorStop(0.5, K.shade(base, -0.15));
  sg.addColorStop(1, K.shade(base, lx > 0 ? 0.1 : -0.35));
  g.fillStyle = sg;
  g.fill(slab);
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
    for (let r = -6; r < 6; r++) for (let c = -8; c < 8; c++) {
      g.fillStyle = (r + c) & 1 ? "#cfc6b4" : "#5a6470";
      const y0 = r * 6, x0 = c * 16 + r * 2.5;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x0 + 16, y0);
      g.lineTo(x0 + 16 + 2.5, y0 + 6);
      g.lineTo(x0 + 2.5, y0 + 6);
      g.closePath();
      g.fill();
    }
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
  g.fillStyle = "#e9e2d4";
  g.beginPath();
  g.moveTo(-58, -48);
  g.lineTo(84, -48);
  g.lineTo(84, -28);
  g.lineTo(-58, -28);
  g.closePath();
  g.fill();
  g.fillStyle = "#cfc5b2";
  g.fillRect(-58, -28, 142, 30);
  // pillow
  const pg = g.createRadialGradient(-46, -50, 2, -42, -44, 22);
  pg.addColorStop(0, "#fffaf0");
  pg.addColorStop(0.7, "#e8dfcf");
  pg.addColorStop(1, "#b9ae9c");
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
    g.fillStyle = K.shade(q[(i + j * 2) % q.length], light);
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
  const wg = g.createLinearGradient(0, -180, 0, -20);
  wg.addColorStop(0, "#3e4560");
  wg.addColorStop(1, "#5a6280");
  g.fillStyle = wg;
  g.fill(wall);
  g.save();
  g.clip(wall);
  // faded wallpaper stripes + flowers
  for (let x = -82; x < 82; x += 9) {
    g.fillStyle = "rgba(220,230,255,0.07)";
    g.fillRect(x, -190, 3, 180);
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = "rgba(240,220,230,0.1)";
    g.beginPath();
    g.arc(-80 + (i % 6) * 32 + ((i / 6) | 0) % 2 * 16, -170 + ((i / 6) | 0) * 32, 2.2, 0, K.TAU);
    g.fill();
  }
  // plaster texture: speckle, hairline cracks, and plaster fallen away near the break (brick behind)
  for (let i = 0; i < 260; i++) {
    g.fillStyle = R() > 0.5 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
    g.fillRect(-84 + R() * 168, -185 + R() * 165, 0.8 + R(), 0.8 + R());
  }
  g.strokeStyle = "rgba(20,16,30,0.35)";
  g.lineWidth = 0.5;
  for (let c = 0; c < 4; c++) {
    let x = -70 + R() * 140, y = -170 + R() * 10;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (R() - 0.5) * 10; y += 5 + R() * 7; g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < top.length; i += 6) {
    const x = top[i], y = top[i + 1];
    g.fillStyle = "rgba(40,30,40,0.45)";
    g.beginPath();
    g.ellipse(x + 3, y + 9, 11, 7, 0.2, 0, K.TAU);
    g.fill();
    g.fillStyle = "#8a5444";
    for (let b = 0; b < 3; b++) g.fillRect(x - 6 + (b % 2) * 5, y + 4 + b * 4.2, 10, 3.4);
  }
  // skirting board
  g.fillStyle = "#e6e1d6";
  g.fillRect(-82, -30, 164, 10);
  // daylight wash on the wall
  const dl = g.createRadialGradient(0, -100, 10, 0, -100, 120);
  dl.addColorStop(0, "rgba(220,240,255,0.35)");
  dl.addColorStop(1, "rgba(220,240,255,0)");
  g.fillStyle = dl;
  g.fillRect(-90, -200, 180, 190);
  g.restore();
  // underside shadow of the wall onto the island deck
  const us = g.createLinearGradient(0, -22, 0, -2);
  us.addColorStop(0, "rgba(6,4,14,0.55)");
  us.addColorStop(1, "rgba(6,4,14,0)");
  g.fillStyle = us;
  g.beginPath();
  g.ellipse(2, -16, 92, 9, 0, 0, K.TAU);
  g.fill();
  // the window: sunny outside
  const wx = -40, wy = -150, ww = 80, wh = 90;
  const sk = g.createLinearGradient(0, wy, 0, wy + wh);
  sk.addColorStop(0, "#8ec4f0");
  sk.addColorStop(0.6, "#cfe8fb");
  sk.addColorStop(1, "#eef7ff");
  g.fillStyle = sk;
  g.fillRect(wx, wy, ww, wh);
  g.save();
  g.beginPath();
  g.rect(wx, wy, ww, wh);
  g.clip();
  const sun = g.createRadialGradient(wx + 60, wy + 18, 0, wx + 60, wy + 18, 40);
  sun.addColorStop(0, "rgba(255,252,235,1)");
  sun.addColorStop(0.2, "rgba(255,245,215,0.8)");
  sun.addColorStop(1, "rgba(255,245,215,0)");
  g.fillStyle = sun;
  g.fillRect(wx, wy, ww, wh);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.beginPath();
    g.ellipse(wx + 10 + i * 12, wy + 30 + Math.sin(i) * 4, 10, 4, 0, 0, K.TAU);
    g.fill();
  }
  // distant garden: fence and a tree in sunlight
  g.fillStyle = "#9dbf8a";
  g.fillRect(wx, wy + wh - 22, ww, 22);
  g.fillStyle = "#6f9a66";
  g.beginPath();
  g.ellipse(wx + 16, wy + wh - 34, 18, 16, 0, 0, K.TAU);
  g.fill();
  g.fillStyle = "#f4f1e8";
  for (let x = wx; x < wx + ww; x += 6) g.fillRect(x, wy + wh - 20, 3, 12);
  g.fillRect(wx, wy + wh - 16, ww, 2);
  g.restore();
  // frame + mullions
  g.strokeStyle = "#f2efe6";
  g.lineWidth = 5;
  g.strokeRect(wx, wy, ww, wh);
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(wx + ww / 2, wy);
  g.lineTo(wx + ww / 2, wy + wh);
  g.moveTo(wx, wy + wh * 0.5);
  g.lineTo(wx + ww, wy + wh * 0.5);
  g.stroke();
  g.strokeStyle = "rgba(0,0,0,0.25)";
  g.lineWidth = 0.8;
  g.strokeRect(wx + 2.5, wy + 2.5, ww - 5, wh - 5);
  // sill (deep, the cat sits here)
  g.fillStyle = "#f4f0e6";
  g.beginPath();
  g.moveTo(wx - 12, wy + wh + 2);
  g.lineTo(wx + ww + 12, wy + wh + 2);
  g.lineTo(wx + ww + 16, wy + wh + 10);
  g.lineTo(wx - 16, wy + wh + 10);
  g.closePath();
  g.fill();
  g.fillStyle = "#c9c2b2";
  g.fillRect(wx - 16, wy + wh + 10, ww + 32, 4);
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.fillRect(wx - 14, wy + wh + 14, ww + 28, 3);
  // curtains
  for (const side of [-1, 1]) {
    const cx = side < 0 ? wx - 6 : wx + ww + 6;
    const cg = g.createLinearGradient(cx - 14, 0, cx + 14, 0);
    cg.addColorStop(0, "#8a5a6e");
    cg.addColorStop(0.5, "#b07a8c");
    cg.addColorStop(1, "#6d4456");
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(cx - 12, wy - 12);
    g.lineTo(cx + 12, wy - 12);
    g.bezierCurveTo(cx + 10 - side * 6, wy + 40, cx + 14, wy + 80, cx + 10, wy + wh + 32);
    g.lineTo(cx - 10, wy + wh + 32);
    g.bezierCurveTo(cx - 14, wy + 80, cx - 10 - side * 6, wy + 40, cx - 12, wy - 12);
    g.fill();
    g.strokeStyle = "rgba(40,20,30,0.35)";
    g.lineWidth = 0.8;
    for (let k = -1; k <= 1; k++) {
      g.beginPath();
      g.moveTo(cx + k * 5, wy - 10);
      g.quadraticCurveTo(cx + k * 6 - side * 3, wy + 50, cx + k * 4, wy + wh + 30);
      g.stroke();
    }
  }
  g.fillStyle = "#3a2a22";
  g.fillRect(wx - 26, wy - 16, ww + 52, 4);
  // sun patch on the floor
  g.fillStyle = "rgba(235,246,255,0.26)";
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
    g.fillStyle = K.shade("#6b4a30", k);
    g.fillRect(x, -70, 4, 70);
    g.fillRect(x + f * 26, -32, 3.5, 32);
    g.fillRect(x - f * 2, -36, f * 32, 5);
    for (let s = 0; s < 3; s++) g.fillRect(x, -66 + s * 10, f * 3 + 1, 2.5);
    g.fillRect(x + 2, -70, 3, 40);
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
  g.fillStyle = "#6e4c30";
  g.fillRect(-52, -50, 114, 5);
  for (const lx of [-48, -36, 46, 56]) g.fillRect(lx, -46, 4, lx > -40 && lx < 50 ? 34 : 46);
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
  // light cone from the pendant
  const lc = g.createLinearGradient(0, -144, 0, -50);
  lc.addColorStop(0, "rgba(255,236,190,0.28)");
  lc.addColorStop(1, "rgba(255,236,190,0)");
  g.fillStyle = lc;
  g.beginPath();
  g.moveTo(-10, -144);
  g.lineTo(26, -144);
  g.lineTo(70, -50);
  g.lineTo(-54, -50);
  g.closePath();
  g.fill();
}

function doorObject(g) {
  const R = K.rng("doorwall");
  const wall = new Path2D();
  wall.moveTo(-70, -16);
  for (let i = 0; i <= 8; i++) wall.lineTo(K.lerp(-70, 70, i / 8), -182 + (R() - 0.5) * 22);
  wall.lineTo(70, -16);
  wall.closePath();
  const wg = g.createLinearGradient(-70, 0, 70, 0);
  wg.addColorStop(0, "#8c7a68");
  wg.addColorStop(1, "#5a4c44");
  g.fillStyle = wg;
  g.fill(wall);
  g.save();
  g.clip(wall);
  for (let y = -190; y < -16; y += 8) for (let x = -76 + ((y / 8) & 1) * 9; x < 76; x += 18) {
    g.fillStyle = K.rgba(K.mix("#9a6650", "#6a4434", K.hash(x * 3 + y, 4)), 0.55);
    g.fillRect(x, y, 16.5, 7);
  }
  g.restore();
  // door
  const dx = -22, dy = -132, dw = 50, dh = 116;
  g.fillStyle = "#2b2420";
  g.fillRect(dx - 5, dy - 5, dw + 10, dh + 5);
  const dg = g.createLinearGradient(dx, 0, dx + dw, 0);
  dg.addColorStop(0, "#3f6f6a");
  dg.addColorStop(1, "#2a4c4a");
  g.fillStyle = dg;
  g.fillRect(dx, dy, dw, dh);
  g.strokeStyle = "rgba(0,0,0,0.3)";
  g.lineWidth = 1;
  g.strokeRect(dx + 6, dy + 8, dw - 12, 40);
  g.strokeRect(dx + 6, dy + 54, dw - 12, 30);
  g.fillStyle = "rgba(255,255,255,0.08)";
  g.fillRect(dx + 6, dy + 8, dw - 12, 1);
  // cat flap
  g.fillStyle = "#1c1a1a";
  g.fillRect(dx + 13, dy + dh - 26, 24, 22);
  g.fillStyle = "rgba(170,190,200,0.5)";
  g.fillRect(dx + 15, dy + dh - 24, 20, 18);
  g.fillStyle = "rgba(255,255,255,0.25)";
  g.fillRect(dx + 15, dy + dh - 24, 20, 2);
  // knob + wall lamp
  g.fillStyle = "#d9a441";
  g.beginPath();
  g.arc(dx + dw - 7, dy + 66, 2.6, 0, K.TAU);
  g.fill();
  g.fillStyle = "#222";
  g.fillRect(-56, -116, 6, 10);
  g.fillStyle = "#ffe0a8";
  g.fillRect(-58, -126, 10, 11);
  // mat
  g.fillStyle = "#6a4a2a";
  g.beginPath();
  g.moveTo(dx - 4, -14);
  g.lineTo(dx + dw + 4, -14);
  g.lineTo(dx + dw + 10, 2);
  g.lineTo(dx - 10, 2);
  g.closePath();
  g.fill();
  // boots by the door (yours)
  g.fillStyle = "#8a2a26";
  g.fillRect(40, -24, 8, 18);
  g.fillRect(50, -22, 8, 16);
  g.fillRect(40, -8, 13, 4);
  g.fillRect(50, -8, 13, 4);
}

const OBJ = { bed: bedObject, window: windowObject, kitchen: kitchenObject, door: doorObject };

const FULL = [-150, -215, 150, 205];
let NOISE = null;
function noiseTile() {
  if (!NOISE) {
    NOISE = K.makeCanvas(96, 96);
    const s = NOISE.getContext("2d");
    const img = s.createImageData(96, 96);
    const R = K.rng("f12tex");
    for (let i = 0; i < 96 * 96; i++) {
      const v = 128 + (R() - 0.5) * 120;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    s.putImageData(img, 0, 0);
  }
  return NOISE;
}
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
    const dk = g.createRadialGradient(lx, ly, 0, lx, ly, 250);
    dk.addColorStop(0, "rgba(8,6,22,0)");
    dk.addColorStop(0.3, "rgba(8,6,22,0.1)");
    dk.addColorStop(0.7, "rgba(8,6,22,0.42)");
    dk.addColorStop(1, "rgba(8,6,22,0.66)");
    g.fillStyle = dk;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const wm = g.createRadialGradient(lx, ly, 0, lx, ly, 120);
    wm.addColorStop(0, K.rgba(meta.color, 0.26));
    wm.addColorStop(1, K.rgba(meta.color, 0));
    g.fillStyle = wm;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    // fine material texture
    const pat = g.createPattern(noiseTile(), "repeat");
    if (pat) {
      g.globalAlpha = 0.02;
      g.save();
      g.scale(1 / sc, 1 / sc);
      g.fillStyle = pat;
      g.fillRect(x0 * sc, y0 * sc, (x1 - x0) * sc, (y1 - y0) * sc);
      g.restore();
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = "source-over";
  });
}
function islandBlur(kind, px) {
  const src = islandSprite(kind, 1);
  return K.sprite("f12:islb:" + kind + ":" + px, IW, IH, (g) => {
    if (K.hasFilter()) g.filter = `blur(${px}px)`;
    g.drawImage(src, 0, 0, IW, IH);
    g.filter = "none";
  });
}
// draw an island with top centre at (x, y), k px per unit, slow rotation `rot`, optional blur
function island(g, kind, x, y, k, t, o = {}) {
  const crop = o.crop || FULL;
  const sc = o.crop ? o.sc : k > 1.6 ? 3.4 : 1.2;
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

// ---- ghost Biscuit (golden afterimage) ---------------------------------------------------------------
// The afterimage is painted into a layer, tinted toward warm gold and added (lighter) at ~0.35, with a
// soft halo. o.body adds a translucent warm silhouette under it for bright backgrounds (the window).
function ghost(g, alpha, fn, o = {}) {
  if (alpha <= 0.003) return;
  const L = K.layer(VW, VH, "f12ghost");
  fn(L.g);
  const lg = L.g;
  lg.save();
  lg.setTransform(1, 0, 0, 1, 0, 0);
  lg.globalCompositeOperation = "source-atop";
  lg.globalAlpha = o.tint == null ? 0.62 : o.tint;
  lg.fillStyle = o.color || "#ffcf8a";
  lg.fillRect(0, 0, L.canvas.width, L.canvas.height);
  lg.restore();
  g.save();
  if (o.body) K.dof(g, L.canvas, 0, alpha * o.body);
  g.globalCompositeOperation = "lighter";
  K.dof(g, L.canvas, 0, alpha * (o.add == null ? 0.35 : o.add));
  K.dof(g, L.canvas, o.halo || 5, alpha * (o.haloA == null ? 0.22 : o.haloA));
  g.restore();
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

function debris(g, t, near) {
  // small floating fragments: books, a frame, plaster chunks (far = sharp-ish small, near = blurred big)
  const R = K.rng(near ? "debN" : "debF");
  const n = near ? 3 : 9;
  for (let i = 0; i < n; i++) {
    const x = ((R() * 1200 + t * (near ? 14 : 4) * (R() > 0.5 ? 1 : -1)) % 1200 + 1200) % 1200 - 120;
    const y = 60 + R() * 420 + Math.sin(t * 0.4 + i) * 8;
    const s = near ? 40 + R() * 40 : 5 + R() * 8;
    const rot = t * (R() - 0.5) * 0.4 + R() * 6;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    const kind = (R() * 3) | 0;
    if (kind === 0) {
      g.fillStyle = K.mix("#3a2a4a", "#7a4a3a", R());
      g.fillRect(-s * 0.5, -s * 0.35, s, s * 0.7);
      g.fillStyle = "rgba(230,220,200,0.6)";
      g.fillRect(-s * 0.5, s * 0.25, s, s * 0.1);
    } else if (kind === 1) {
      g.strokeStyle = "#8a6a3a";
      g.lineWidth = s * 0.12;
      g.strokeRect(-s * 0.4, -s * 0.5, s * 0.8, s);
      g.fillStyle = "rgba(200,170,120,0.35)";
      g.fillRect(-s * 0.32, -s * 0.42, s * 0.64, s * 0.84);
    } else {
      g.fillStyle = "#3a3040";
      g.beginPath();
      g.moveTo(-s * 0.5, 0);
      g.lineTo(0, -s * 0.4);
      g.lineTo(s * 0.5, -s * 0.1);
      g.lineTo(s * 0.2, s * 0.4);
      g.closePath();
      g.fill();
    }
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

// ---- shots 2 and 3 [12-32]: the bed as a lit height field ---------------------------------------------
// The quilt is a height field (folds + the cat-shaped dent) lit by the bedside lamp, projected from a
// camera. Shot 2 is low at pillow height with a rack focus; shot 3 looks down on the hollow and pushes in.
// Both camera set-ups are painted once into sprites (with depth-of-field slabs), then moved in 2D.
const CAM_LOW = { F: 620, H: 13, HOR: 150, cx: 470, camX: 2, camZ: 0 };
const CAM_HIGH = { F: 700, H: 44, HOR: 18, cx: 480, camX: 6, camZ: -40 };
const HOL = [10, 70];
const QPAL = ["#4a6fa5", "#e0b25a", "#c2575b", "#e8dcc4", "#5f8a6a"].map((c) => K.mix(c, "#8a7f78", 0.2));
const QLAMP = [-78, 20, 12];
function qdent(X, Z) {
  const dx = (X - HOL[0]) / 17, dz = (Z - HOL[1]) / 14;
  const d = Math.sqrt(dx * dx + dz * dz);
  const ex = (X - HOL[0] - 14) / 6.5, ez = (Z - HOL[1] + 4) / 6;
  return -4.6 * Math.exp(-d * d * 1.5) + 1.1 * Math.exp(-(d - 1.15) * (d - 1.15) * 6) - 1.5 * Math.exp(-(ex * ex + ez * ez) * 1.4);
}
function qh(X, Z) {
  let h = Math.sin((X * 0.7 + Z) * 0.085) * 0.9 + Math.sin(Z * 0.05 + 1.3) * Math.cos(X * 0.06) * 1.3;
  h += qdent(X, Z);
  h -= Math.max(0, Math.abs(X) - 42) * 0.55;
  h -= Math.max(0, Z - 146) * 0.9;
  return h;
}
function qproj(cam, X, Z, h) {
  const k = cam.F / (Z - cam.camZ);
  return [cam.cx + (X - cam.camX) * k, cam.HOR + (cam.H - h) * k];
}
function rgbOf(c) { const p = K.parseColor(c); return [p[0], p[1], p[2]]; }
function paintQuilt(g, cam, z0, z1) {
  const PS = 12, MS = 4, ms = PS / MS;
  const zMin = Math.max(4, cam.camZ + 12);
  const R = K.rng("qlow");
  for (let pz = 156 - PS; pz >= 0; pz -= PS) {
    if (pz + PS <= z0 || pz >= z1) continue;
    for (let px = -60; px < 60; px += PS) {
      const col = rgbOf(QPAL[((px / PS + 5) + (pz / PS) * 2) % QPAL.length | 0]);
      for (let j = MS - 1; j >= 0; j--) for (let i = 0; i < MS; i++) {
        const X0 = px + i * ms, Z0 = Math.max(zMin, pz + j * ms), X1 = X0 + ms, Z1 = pz + (j + 1) * ms;
        if (Z1 <= zMin) continue;
        const Xc = (X0 + X1) / 2, Zc = (Z0 + Z1) / 2, hc = qh(Xc, Zc);
        const hx = qh(Xc + 0.6, Zc) - qh(Xc - 0.6, Zc), hz = qh(Xc, Zc + 0.6) - qh(Xc, Zc - 0.6);
        let nx = -hx / 1.2, ny = 1, nz = -hz / 1.2;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        let lx = QLAMP[0] - Xc, ly = QLAMP[1] - hc, lz = QLAMP[2] - Zc;
        const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
        const dif = Math.max(0, nx * lx + ny * ly + nz * lz);
        const fall = 1 / (1 + (ll * ll) / 12000);
        const ao = 1 + 0.085 * Math.min(0, qdent(Xc, Zc));
        const nse = 0.94 + R() * 0.1;
        const kw = (0.13 + 1.55 * dif * fall) * nse * ao;
        const c = `rgb(${Math.min(255, col[0] * kw * 1.1 + 5) | 0},${Math.min(255, col[1] * kw * 0.97 + 4) | 0},${Math.min(255, col[2] * kw * 0.84 + 10) | 0})`;
        const a = qproj(cam, X0, Z0, qh(X0, Z0)), b = qproj(cam, X1, Z0, qh(X1, Z0)), cc = qproj(cam, X1, Z1, qh(X1, Z1)), d = qproj(cam, X0, Z1, qh(X0, Z1));
        g.fillStyle = c;
        g.strokeStyle = c;
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(cc[0], cc[1]); g.lineTo(d[0], d[1]);
        g.closePath();
        g.fill();
        g.stroke();
      }
      g.fillStyle = "rgba(255,248,230,0.14)";
      for (let k = 0; k < 12; k++) {
        const X = px + R() * PS, Z = Math.max(zMin, pz + R() * PS);
        if (Z < z0 || Z > z1) continue;
        const p = qproj(cam, X, Z, qh(X, Z));
        const s = 0.4 + cam.F / (Z - cam.camZ) * 0.35;
        g.fillRect(p[0], p[1], s, s * 0.5);
      }
    }
  }
  // stitched seams following the surface
  g.strokeStyle = "rgba(255,244,222,0.34)";
  g.setLineDash([3, 3]);
  const za = Math.max(z0, zMin), zb = Math.min(z1, 150);
  for (let X = -48; X <= 48; X += 12) {
    g.lineWidth = 0.7;
    g.beginPath();
    for (let Z = za; Z <= zb; Z += 2) { const p = qproj(cam, X, Z, qh(X, Z) + 0.05); Z === za ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1]); }
    g.stroke();
  }
  for (let Z = 12; Z <= 144; Z += 12) {
    if (Z < za || Z > zb) continue;
    g.lineWidth = Math.min(1.6, 0.25 + 22 / (Z - cam.camZ));
    g.beginPath();
    for (let X = -48; X <= 48; X += 2) { const p = qproj(cam, X, Z, qh(X, Z) + 0.05); X === -48 ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1]); }
    g.stroke();
  }
  g.setLineDash([]);
  // orange (and white bib) hairs in and around the hollow
  if (z0 < HOL[1] + 20 && z1 > HOL[1] - 20) {
    const H = K.rng("qhairs");
    const s = cam.F / (HOL[1] - cam.camZ) / 8.8;
    for (let i = 0; i < 60; i++) {
      const X = HOL[0] + (H() - 0.5) * 40, Z = HOL[1] + (H() - 0.5) * 30;
      const p = qproj(cam, X, Z, qh(X, Z) + 0.1);
      const a = H() * K.TAU, l = (3 + H() * 5) * s;
      g.strokeStyle = K.rgba(H() > 0.3 ? "#e8964a" : "#f8ead2", 0.85);
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(p[0], p[1]);
      g.quadraticCurveTo(p[0] + Math.cos(a) * l * 0.6 + 1, p[1] + Math.sin(a) * l * 0.25, p[0] + Math.cos(a) * l, p[1] + Math.sin(a) * l * 0.4);
      g.stroke();
    }
  }
}
function paintPillow(g) {
  // the pillow's edge right in front of the lens (bottom left): cotton, a piped seam, soft creases
  const body = new Path2D();
  body.moveTo(-20, 560);
  body.lineTo(-20, 398);
  body.bezierCurveTo(60, 366, 210, 376, 296, 440);
  body.bezierCurveTo(336, 472, 344, 520, 334, 560);
  body.closePath();
  const pg = g.createRadialGradient(110, 420, 10, 170, 520, 280);
  pg.addColorStop(0, "#fff4e2");
  pg.addColorStop(0.45, "#e6d6be");
  pg.addColorStop(0.8, "#a8957e");
  pg.addColorStop(1, "#6a5a4a");
  g.fillStyle = pg;
  g.fill(body);
  g.save();
  g.clip(body);
  for (let i = 0; i < 5; i++) {
    const x = 40 + i * 52, y = 430 + i * 14;
    const cg = g.createLinearGradient(x - 18, y - 30, x + 18, y + 30);
    cg.addColorStop(0, "rgba(90,70,50,0)");
    cg.addColorStop(0.5, "rgba(90,70,50,0.22)");
    cg.addColorStop(0.62, "rgba(255,250,240,0.18)");
    cg.addColorStop(1, "rgba(90,70,50,0)");
    g.strokeStyle = cg;
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(x - 10, y - 26);
    g.quadraticCurveTo(x + 8, y, x + 2, y + 40);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = "rgba(255,248,236,0.7)";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(-20, 402);
  g.bezierCurveTo(60, 370, 210, 380, 294, 444);
  g.stroke();
  g.strokeStyle = "rgba(120,96,74,0.45)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(-20, 410);
  g.bezierCurveTo(60, 380, 206, 388, 288, 450);
  g.stroke();
}
// cached focus states: A = near quilt sharp (pillow soft), B = the hollow sharp, C = high angle on the hollow
// depth slabs [blur, painter] per focus state; each slab is its own sprite so they can be built one per
// frame ahead of time (prewarm), and the state is a cheap composite of its slabs
const SLABS = {
  A: [[5, (s) => paintQuilt(s, CAM_LOW, 108, 160)], [2.6, (s) => paintQuilt(s, CAM_LOW, 36, 108)], [0, (s) => paintQuilt(s, CAM_LOW, 0, 36)], [4, paintPillow]],
  B: [[1.6, (s) => paintQuilt(s, CAM_LOW, 108, 160)], [0, (s) => paintQuilt(s, CAM_LOW, 36, 108)], [4, (s) => paintQuilt(s, CAM_LOW, 0, 36)], [12, paintPillow]],
  C: [[2.4, (s) => paintQuilt(s, CAM_HIGH, 104, 160)], [0, (s) => paintQuilt(s, CAM_HIGH, 40, 104)], [2.6, (s) => paintQuilt(s, CAM_HIGH, 0, 40)]],
};
function slabSprite(which, i) {
  const [blur, fn] = SLABS[which][i];
  return K.sprite("f12:qslab:" + which + i, VW, VH, (g) => {
    const T = g.getTransform();
    if (!(blur > 0) || !K.hasFilter()) { fn(g); return; }
    const c = K.makeCanvas(g.canvas.width, g.canvas.height);
    const s = c.getContext("2d");
    s.setTransform(T);
    fn(s);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.filter = `blur(${(blur * T.a).toFixed(1)}px)`;
    g.drawImage(c, 0, 0);
    g.filter = "none";
    g.restore();
  });
}
function quiltState(which) {
  return K.sprite("f12:qlow:" + which, VW, VH, (g) => {
    for (let i = 0; i < SLABS[which].length; i++) g.drawImage(slabSprite(which, i), 0, 0, VW, VH);
  });
}
// cache fill ahead of need, one sprite per 0.2 s window (a pure function of t: it only fills caches)
const WARM12 = [];
for (const w of ["A", "B"]) for (let i = 0; i < 4; i++) WARM12.push([6.4, w, i]);
WARM12.push([6.4, "A", -1], [6.4, "B", -1]);
for (let i = 0; i < 3; i++) WARM12.push([16.4, "C", i]);
WARM12.push([16.4, "C", -1]);
function prewarm(t) {
  let base = -1, n = 0;
  for (const [t0] of WARM12) if (t >= t0) base = t0;
  if (base < 0) return;
  const idx = Math.floor((t - base) / 0.2);
  for (const [t0, w, i] of WARM12) {
    if (t0 !== base) continue;
    if (n++ !== idx) continue;
    if (i < 0) quiltState(w); else slabSprite(w, i);
  }
}
function lampBokeh() {
  return K.sprite("f12:lampbokeh", 300, 260, (g) => {
    if (K.hasFilter()) g.filter = "blur(14px)";
    const sh = g.createLinearGradient(60, 0, 240, 0);
    sh.addColorStop(0, "#9a5e28");
    sh.addColorStop(0.45, "#ffe2b0");
    sh.addColorStop(1, "#7a4a20");
    g.fillStyle = sh;
    g.beginPath();
    g.moveTo(50, 200);
    g.lineTo(100, 50);
    g.lineTo(200, 50);
    g.lineTo(250, 200);
    g.closePath();
    g.fill();
    g.fillStyle = "#fff4dc";
    g.beginPath();
    g.ellipse(150, 200, 100, 18, 0, 0, K.TAU);
    g.fill();
    g.filter = "none";
  });
}
function warmPool(g, x, y, r, a) {
  g.save();
  g.globalCompositeOperation = "soft-light";
  const wm = g.createRadialGradient(x, y, 20, x, y, r);
  wm.addColorStop(0, `rgba(255,196,120,${a})`);
  wm.addColorStop(1, "rgba(255,196,120,0)");
  g.fillStyle = wm;
  g.fillRect(-40, -40, VW + 80, VH + 80);
  g.restore();
}
function hollowGlints(g, cam, t, a) {
  for (let i = 0; i < 8; i++) {
    const X = HOL[0] + (K.hash(i, 51) - 0.5) * 30, Z = HOL[1] + (K.hash(i, 52) - 0.5) * 20;
    const q = qproj(cam, X, Z, qh(X, Z));
    const tw = Math.max(0, Math.sin(t * 1.3 + i * 2.3));
    K.glow(g, q[0], q[1], 8, "#ffe2a8", 0.55 * tw * tw * a);
  }
}
function shot2(g, t) { // [12-22] low, at pillow height; rack focus from the near quilt to the hollow
  prewarm(t);
  const p = K.ease.inOut(K.seg(t, 12, 22.4));
  voidBg(g, 150 + p * 20, 70);
  island(g, "kitchen", 760 - p * 12, 168 + bob(t, 1.6) * 0.6, 0.42, t, { blur: 6, glow: 0.6, rot: tilt(t, 1.6) });
  const rack = K.smooth(K.seg(t, 13.2, 15.2));
  K.withCamera(g, VW, VH, { x: 480 + p * 18, y: 262 + p * 6, zoom: 1.0 + p * 0.07, shakeT: t, shakeAmt: 0.8 }, () => {
    if (rack < 1) g.drawImage(quiltState("A"), 0, 0, VW, VH);
    if (rack > 0) { g.save(); g.globalAlpha = rack; g.drawImage(quiltState("B"), 0, 0, VW, VH); g.restore(); }
    hollowGlints(g, CAM_LOW, t, 0.3 + 0.7 * rack);
    warmPool(g, 120, 260, 700, 0.55);
  });
  g.drawImage(lampBokeh(), -70, -20, 300, 260);
  K.glow(g, 80, 120, 280, "#ffcf8a", 0.24 * (0.95 + 0.05 * Math.sin(t * 1.3)));
  K.glow(g, 80, 160, 80, "#fff3dc", 0.4);
  motes(g, t, 7, 16, 0.7);
}
function shot3(g, t) { // [22-32] looking down on the hollow, a slow push in; the golden afterimage curls into it
  const p = K.ease.inOut(K.seg(t, 22, 32.4));
  voidBg(g, 170, 50);
  const hc = qproj(CAM_HIGH, HOL[0], HOL[1], qh(HOL[0], HOL[1]));
  K.withCamera(g, VW, VH, { x: K.lerp(480, hc[0], p * 0.6), y: K.lerp(270, hc[1] - 10, p * 0.6), zoom: 1.0 + p * 0.26, shakeT: t, shakeAmt: 0.9 }, () => {
    g.drawImage(quiltState("C"), 0, 0, VW, VH);
    hollowGlints(g, CAM_HIGH, t, 1);
    warmPool(g, 60, 220, 760, 0.5);
    const kk = CAM_HIGH.F / (HOL[1] - CAM_HIGH.camZ);
    const a = K.env(t, 22.2, 31.6, 1.4, 2.4);
    const curl = K.ease.inOut(K.seg(t, 22.3, 26.2));
    const breath = 1 + Math.sin(t * 2.4) * 0.015;
    const hx = hc[0] - 1.5 * kk, hy = hc[1] + 1.5 * kk;
    const size = 12.5 * kk;
    ghost(g, a, (L) => {
      const st = 1 - K.seg(curl, 0.45, 0.7);
      if (st > 0.01) {
        K.drawCat(L, hx + (1 - curl) * 30 * kk, hy, size, { pose: curl < 0.35 ? "walk" : "stand", phase: t * 1.1, facing: -1, t, shadow: false, bell: false, alpha: st, tail: 0.5 });
      }
      const sl = K.seg(curl, 0.45, 0.7);
      if (sl > 0.01) {
        L.save();
        L.translate(hx, hy);
        L.scale(breath, 1 / breath);
        K.drawCat(L, 0, 0, size, { pose: "sleep", facing: 1, t, shadow: false, bell: false, alpha: sl, blink: 1 });
        L.restore();
      }
    });
    K.glow(g, hx, hy - size * 0.4, size * 2.2, GOLD, 0.14 * a);
    // he fades by alpha while gold motes lift off where he lay
    riseMotes(g, t, 29.0, [hx - size * 1.2, hy - size * 0.9, size * 2.4, size * 0.9], 70, 61, kk / 5);
  });
  // the lamp spills in from the left edge of frame
  K.glow(g, -40, 200, 360, "#ffcf8a", 0.2);
  motes(g, t, 7, 14, 0.7);
}

const WIN_CROP = [-120, -205, 120, 34];
function windowClose(g, t, p, extra) {
  voidBg(g, 200, 30 + p * 20);
  const k = K.lerp(2.3, 2.48, p);
  const cx = 470, cy = 262 + 100 * k;
  const by = bob(t, 0.7) * 0.4;
  K.withCamera(g, VW, VH, { x: 480, y: 270 - p * 6, zoom: 1, shakeT: t, shakeAmt: 1 }, () => {
    island(g, "window", cx, cy + by, k, t, { glow: 0.5, crop: WIN_CROP, sc: 3.4 });
    K.godRays(g, cx + 20 * k, cy + by - 132 * k, VW, VH, { color: "#eef6ff", count: 14, strength: 0.2, t, angle: Math.PI * 0.62, spread: 0.85, length: 520, seed: 4 });
    if (extra) extra(g, cx, cy + by, k);
  });
  K.dust(g, VW, VH, t, { seed: 5, color: "#fff4d8", count: 46, size: 1.3, area: [330, 60, 320, 400], alpha: 0.7 });
}
function shot4(g, t) { // [32-44] afterimage on the windowsill; your hand reaches, it dissolves into gold dust
  windowClose(g, t, K.ease.inOut(K.seg(t, 32, 44)), (g2, cx, cy, k) => {
    const sillY = cy - 58 * k;
    const catX = cx - 4 * k;
    const dis = K.seg(t, 40.2, 42.6);
    const a = K.env(t, 32.2, 44, 1.4, 0.2) * (1 - dis);
    const size = 21.5 * k; // ~90 px tall sitting
    // seated on the sill facing the glass: body in profile, head turned away toward the garden
    ghost(g2, a, (L) => {
      K.drawCat(L, catX, sillY, size, {
        pose: "sit", facing: 1, headTurn: -0.6 + Math.sin(t * 0.5) * 0.05, t, tail: 1, shadow: false, bell: false,
        light: { x: catX + 40 * k, y: sillY - 60 * k, color: "#fff6e0", strength: 2 },
      });
    }, { color: "#a8682c", tint: 0.5, body: 0.62, add: 0.2, halo: 3, haloA: 0.45 });
    // the sun wraps round his outline (backlit rim)
    K.glow(g2, catX + size * 0.2, sillY - size * 1.3, size * 1.6, "#fff2d0", 0.22 * a);
    if (t > 40) {
      for (let i = 0; i < 180; i++) {
        const h1 = K.hash(i, 31), h2 = K.hash(i, 32), h3 = K.hash(i, 33);
        const ux = (h1 - 0.5) * size * 1.3, uy = -h2 * size * 1.75;
        const delay = (1 - h2) * 1.3 + h3 * 0.4;
        const age = t - 40.2 - delay;
        if (age < 0) continue;
        const life = 2.4 + h3 * 1.6;
        if (age > life) continue;
        const x = catX + ux + Math.sin(age * 1.4 + i) * 8 + age * (h1 - 0.35) * 34;
        const y = sillY + uy - age * (18 + h3 * 30);
        const f = 1 - age / life;
        K.glow(g2, x, y, 2.5 + h3 * 4, i % 4 ? GOLD : "#fff3c8", 0.95 * f);
      }
    }
  });
  // your left hand (the bell on its red string at the wrist) reaches in from the bottom left (POV)
  const hp = K.ease.out(K.seg(t, 36.4, 39.8)) - K.ease.inOut(K.seg(t, 42.4, 44.4)) * 0.6;
  if (hp > 0.001) {
    const wx = K.lerp(20, 236, hp), wy = K.lerp(700, 438, hp);
    const open = K.smooth(K.seg(t, 40.2, 41));
    K.focus(g, VW, VH, 1.2, (f) => povHand(f, wx, wy, 210, {
      left: true, angle: -0.98 + Math.sin(t * 0.8) * 0.02, curl: K.lerp(0.28, 0.06, open), spread: K.lerp(0.06, 0.13, open),
      bell: true, t, swing: -0.3, light: { x: 520, y: 150, color: "#ffe6bc", strength: 1.3 },
    }), "f12hand");
  }
}

// shot 5: the line-up path (well separated so no two islands overlap on screen)
const LINE = [
  ["bed", 206, 420, 1.16],
  ["kitchen", 420, 334, 0.8],
  ["door", 612, 262, 0.54],
  ["window", 800, 198, 0.36],
];
const LINE_BLUR = { bed: 0, kitchen: 0, door: 3, window: 5 };
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
  pale(g, 905 - p * 6, 150, 0.6 + lightA * 0.6);
  K.godRays(g, 905, 150, VW, VH, { color: "#dfe6ff", count: 10, strength: 0.18 * lightA, t, angle: Math.PI * 0.8, spread: 1.4, length: 700, seed: 9 });
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
const PZ = 520, Z0 = 560, JT = 1.15, RUN = 26;
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
    return { x: K.lerp(a[0], b[0], q), y: K.lerp(a[1], b[1], q) - Math.sin(Math.PI * q) * 78, z: K.lerp(a[2], b[2], q), air: true, q, i };
  }
  const s = spotOf(i, t);
  const walkIn = jt != null ? K.seg(t, jt - 1.5, jt - 0.45) : 0;
  const prep = jt != null ? K.seg(t, jt - 0.45, jt) : 0;
  const land = i > 0 ? 1 - K.seg(t, JUMPS[i - 1] + JT, JUMPS[i - 1] + JT + 0.4) : 0;
  return { x: s[0], y: s[1], z: s[2] + RUN * K.ease.inOut(walkIn), air: false, walk: walkIn > 0 && walkIn < 1, phase: walkIn * 1.6, crouch: Math.max(prep * 0.6, land * 0.5), i };
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
  pale(g, lp[0], lp[1], 0.9 + swell * 0.9);
  K.godRays(g, lp[0], lp[1], VW, VH, { color: "#e4e8ff", count: 12, strength: 0.16 + swell * 0.18, t, angle: Math.PI / 2, spread: 2.2, length: 640, seed: 13 });
  const drawKid = () => {
    const [kx, ky, kk] = proj(kid.x, kid.y, kid.z);
    const h = 118 * kk;
    const KL = K.layer(VW, VH, "f12kid");
    const po = {
      view: "back", t, crouch: kid.air ? 0.12 : kid.crouch || 0, walk: !!kid.walk, run: kid.air, phase: kid.air ? 0.3 : kid.phase || 0, bell: true,
      shadow: !kid.air, light: { x: lp[0], y: lp[1], color: "#dfe6ff", strength: 1.5 },
    };
    K.drawPerson(KL.g, kx, ky, h, po);
    hairOver(KL.g, kx, ky, h, po);
    KL.g.save();
    KL.g.setTransform(1, 0, 0, 1, 0, 0);
    KL.g.globalCompositeOperation = "source-atop";
    KL.g.fillStyle = "rgba(14,12,40,0.3)";
    KL.g.fillRect(0, 0, KL.canvas.width, KL.canvas.height);
    KL.g.restore();
    g.drawImage(KL.canvas, 0, 0, VW, VH);
    K.glow(g, kx, ky - h * 0.85, h * 0.4, "#dfe6ff", 0.16);
  };
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1, rot: Math.sin(t * 0.5) * 0.006, shakeT: t, shakeAmt: 1.1 }, () => {
    for (let i = PATH.length - 1; i >= 0; i--) {
      const [kind, wx, wy] = PATH[i];
      const [sx, sy, k] = proj(wx, wy + bob(t, i) * 0.5, Z0 + i * PZ);
      if (k <= 6) {
        const blur = k > 1.6 ? 3 : k < 0.45 ? 4 : k < 0.7 ? 2 : 0;
        island(g, kind, sx, sy, k, t, { rot: tilt(t, i) * 0.4, blur, alpha: k > 1.6 ? K.clamp(1 - (k - 1.6) * 0.8) : 1 });
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
  [44, shot5, false],
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
  draw(g, t, W, H) {
    g.save();
    g.scale(W / VW, H / VH);
    g.fillStyle = VOID;
    g.fillRect(0, 0, VW, VH);
    compose(g, t);
    const memory = t >= 22 && t < 44 ? K.env(t, 21.6, 44.2, 1.2, 1.2) : 0;
    K.finish(g, VW, VH, t, { bloom: 0.32, tint: "#5a4aa8", tintAlpha: 0.16, vignette: 0.62, grain: 0.055 + memory * 0.03, letterbox: 1 });
    if (memory > 0) K.grade(g, VW, VH, { tint: "#ffcf8a", alpha: 0.14 * memory, mode: "soft-light" });
    const ta = K.env(t, 1.6, 6.4, 1.0, 1.0);
    if (ta > 0) K.title(g, VW, VH, "Echoes", "Chapter 12", ta, { y: VH * 0.3, size: 60, glow: "#ffcf8a" });
    K.fadeBlack(g, VW, VH, 1 - K.smooth(K.seg(t, 0, 1.4)));
    K.fadeBlack(g, VW, VH, K.smooth(K.seg(t, 63.4, 66)));
    g.restore();
  },
};
