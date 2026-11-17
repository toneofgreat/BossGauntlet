// films/f06.js - Chapter 6: "The Toy Mouse" (FILMS.md f06). Haunted Litterbox Manor, inside:
// a candlelit plum hallway, portraits that watch you, a ghost that is bad at haunting, a moonlit
// grand staircase, the toy mouse, a warm kitchen memory, and the Shadow that leaves no prints.
// draw(g, t, W, H) is a pure function of t. Static art (portraits, felt texture) is cached by key.
import * as K from "../filmkit.js";

const D = 66;
const { clamp, lerp, seg, smooth, mix, rgba, shade, hash, noise, glow, TAU } = K;
const eio = K.ease.inOut;

const PLUM = "#2c1832";
const CANDLE = "#ffb24a";
const MOON = "#9aa8ff";

// ---- small shared painters ---------------------------------------------------------------------
// candle flicker (FILMS.md): 1 + 0.1 sin(13t + seed) + 0.05 sin(29t)
const flick = (t, s) => 1 + 0.1 * Math.sin(t * 13 + s) + 0.05 * Math.sin(t * 29 + s * 1.7);

// flame(g, x, y, h, t, seed, a): a candle flame standing on (x, y), h tall, with its light.
function flame(g, x, y, h, t, seed, a = 1, light = 1) {
  if (h <= 0.3 || a <= 0) return;
  const f = flick(t, seed);
  const hh = h * f;
  const sway = noise(t * 2.3, seed) * h * 0.12;
  if (light > 0) {
    glow(g, x, y - hh * 0.5, hh * 9, CANDLE, 0.16 * a * light * f);
    glow(g, x, y - hh * 0.5, hh * 3.2, "#ffc56a", 0.32 * a * light * f);
  }
  g.save();
  g.globalAlpha *= a;
  const w = hh * 0.3;
  const gr = g.createRadialGradient(x, y - hh * 0.25, hh * 0.02, x, y - hh * 0.35, hh * 0.75);
  gr.addColorStop(0, "#fffbe8");
  gr.addColorStop(0.3, "#ffe7a0");
  gr.addColorStop(0.65, "#ffa53a");
  gr.addColorStop(1, "rgba(255,90,20,0)");
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(x, y + hh * 0.05);
  g.bezierCurveTo(x - w * 1.1, y - hh * 0.05, x - w * 0.6, y - hh * 0.6, x + sway, y - hh);
  g.bezierCurveTo(x + w * 0.6, y - hh * 0.6, x + w * 1.1, y - hh * 0.05, x, y + hh * 0.05);
  g.fill();
  g.fillStyle = "rgba(90,140,255,0.45)";
  g.beginPath();
  g.ellipse(x, y - hh * 0.04, w * 0.45, hh * 0.08, 0, 0, TAU);
  g.fill();
  g.restore();
  glow(g, x, y - hh * 0.3, hh * 0.9, "#fff2c8", 0.7 * a);
}

// candle(g, x, y, h, t, seed, lit): wax stick standing on (x, y), lit flame on top.
function candle(g, x, y, h, t, seed, lit = 1, light = 1) {
  const w = h * 0.2;
  const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  gr.addColorStop(0, "#b39a78");
  gr.addColorStop(0.35, "#f1e3c2");
  gr.addColorStop(0.7, "#e2cfa6");
  gr.addColorStop(1, "#8a7254");
  g.fillStyle = gr;
  g.fillRect(x - w / 2, y - h, w, h);
  // melted lip + two drips
  g.fillStyle = "#fbf0d4";
  g.beginPath();
  g.ellipse(x, y - h, w / 2, w * 0.16, 0, 0, TAU);
  g.fill();
  g.fillStyle = "rgba(250,236,205,0.85)";
  const d1 = h * (0.2 + hash(seed, 3) * 0.3), d2 = h * (0.1 + hash(seed, 4) * 0.25);
  g.beginPath();
  g.ellipse(x - w * 0.3, y - h + d1 / 2, w * 0.11, d1 / 2, 0, 0, TAU);
  g.ellipse(x + w * 0.28, y - h + d2 / 2, w * 0.09, d2 / 2, 0, 0, TAU);
  g.fill();
  g.strokeStyle = "#2a1a10";
  g.lineWidth = Math.max(0.6, w * 0.08);
  g.beginPath();
  g.moveTo(x, y - h);
  g.lineTo(x + w * 0.05, y - h - w * 0.35);
  g.stroke();
  if (lit > 0) flame(g, x, y - h - w * 0.25, h * 0.42 * lit, t, seed, Math.min(1, lit * 1.5), light);
}

// a brass wall sconce with one candle (x, y = candle foot, s = scale px per unit)
function sconce(g, x, y, s, t, seed, dir = 1) {
  g.fillStyle = "#5a4218";
  g.beginPath();
  g.ellipse(x - dir * s * 0.08, y + s * 0.05, s * 0.05, s * 0.14, 0, 0, TAU);
  g.fill();
  g.strokeStyle = "#a07a34";
  g.lineWidth = Math.max(0.8, s * 0.02);
  g.beginPath();
  g.moveTo(x - dir * s * 0.08, y + s * 0.08);
  g.quadraticCurveTo(x - dir * s * 0.02, y + s * 0.1, x, y + s * 0.01);
  g.stroke();
  const cup = g.createLinearGradient(x - s * 0.06, 0, x + s * 0.06, 0);
  cup.addColorStop(0, "#6a4a16");
  cup.addColorStop(0.4, "#e8c066");
  cup.addColorStop(1, "#5a3c10");
  g.fillStyle = cup;
  g.beginPath();
  g.ellipse(x, y, s * 0.07, s * 0.02, 0, 0, TAU);
  g.fill();
  candle(g, x, y, s * 0.24, t, seed);
}

function dissolve(g, W, H, a, key, fn) {
  if (a <= 0.003) return;
  if (a >= 0.997) { fn(g); return; }
  const L = K.layer(W, H, key);
  fn(L.g);
  g.save();
  g.globalAlpha = a;
  g.drawImage(L.canvas, 0, 0, W, H);
  g.restore();
}

// ---- portraits (cached oil paintings) ------------------------------------------------------------
const PORTRAITS = {
  duchess: { coat: K.COATS.cream, bg: "#1f2a1c", bg2: "#56603a", turn: 0.55, facing: 1 },
  admiral: { coat: K.COATS.grey, bg: "#3a1414", bg2: "#7a3a22", turn: 0.7, facing: -1 },
  lord: { coat: K.COATS.tuxedo, bg: "#20160e", bg2: "#5a4024", turn: 0.6, facing: 1 },
  lady: { coat: K.COATS.siamese, bg: "#141c2c", bg2: "#3a4a66", turn: 0.5, facing: -1 },
};
// costume painted over the cat; (hx, hy) head centre, hs head size, (nx, ny) neck point
function costume(g, kind, hx, hy, hs, nx, ny) {
  if (kind === "duchess") {
    // velvet gown, lace ruff + pearls
    const dg = g.createLinearGradient(nx - hs * 1.5, 0, nx + hs * 1.5, 0);
    dg.addColorStop(0, "#1a2a14");
    dg.addColorStop(0.45, "#3e5a2a");
    dg.addColorStop(1, "#101a0c");
    g.fillStyle = dg;
    g.beginPath();
    g.moveTo(nx - hs * 1.7, ny + hs * 2.4);
    g.quadraticCurveTo(nx - hs * 1.3, ny + hs * 0.45, nx, ny + hs * 0.5);
    g.quadraticCurveTo(nx + hs * 1.3, ny + hs * 0.45, nx + hs * 1.7, ny + hs * 2.4);
    g.fill();
    g.strokeStyle = "rgba(200,220,150,0.25)";
    g.lineWidth = 1;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(nx - hs + k * hs * 0.5, ny + hs * 0.8); g.quadraticCurveTo(nx - hs * 0.9 + k * hs * 0.48, ny + hs * 1.5, nx - hs * 1.1 + k * hs * 0.55, ny + hs * 2.3); g.stroke(); }
    for (let i = 0; i < 2; i++) {
      g.fillStyle = i ? "#f6f1e6" : "#c9c0ae";
      g.beginPath();
      for (let k = 0; k <= 24; k++) {
        const a = Math.PI * (k / 24) - Math.PI;
        const r = hs * (0.72 - i * 0.06) * (k % 2 ? 0.88 : 1);
        g.lineTo(nx + Math.cos(a) * r * 1.15, ny + 6 + Math.sin(a) * r * 0.34 + hs * 0.28);
      }
      for (let k = 24; k >= 0; k--) {
        const a = Math.PI * (k / 24) - Math.PI;
        g.lineTo(nx + Math.cos(a) * hs * 0.9, ny + hs * 0.42 - Math.sin(a) * hs * 0.12);
      }
      g.fill();
    }
    g.strokeStyle = "rgba(120,110,95,0.6)";
    g.lineWidth = 0.6;
    for (let k = 0; k < 12; k++) {
      const a = Math.PI * (k / 12) - Math.PI;
      g.beginPath();
      g.moveTo(nx + Math.cos(a) * hs * 0.3, ny + hs * 0.34);
      g.lineTo(nx + Math.cos(a) * hs * 0.8, ny + hs * 0.2 + Math.sin(a) * hs * 0.2);
      g.stroke();
    }
    for (let k = 0; k < 15; k++) {
      const u = k / 14;
      const px = nx + (u - 0.5) * hs * 1.1, py = ny + hs * 0.55 + Math.sin(u * Math.PI) * hs * 0.28;
      const pg = g.createRadialGradient(px - 1, py - 1, 0.3, px, py, hs * 0.05);
      pg.addColorStop(0, "#ffffff");
      pg.addColorStop(1, "#bdb3a2");
      g.fillStyle = pg;
      g.beginPath();
      g.arc(px, py, hs * 0.045, 0, TAU);
      g.fill();
    }
  } else if (kind === "admiral") {
    // navy coat with gold epaulettes, a bicorne hat
    const cg = g.createLinearGradient(nx - hs, 0, nx + hs, 0);
    cg.addColorStop(0, "#0e1426");
    cg.addColorStop(0.5, "#24305a");
    cg.addColorStop(1, "#0a0f1e");
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(nx - hs * 1.6, ny + hs * 2.2);
    g.quadraticCurveTo(nx - hs * 1.4, ny + hs * 0.35, nx - hs * 0.35, ny + hs * 0.28);
    g.lineTo(nx, ny + hs * 0.9);
    g.lineTo(nx + hs * 0.35, ny + hs * 0.28);
    g.quadraticCurveTo(nx + hs * 1.4, ny + hs * 0.35, nx + hs * 1.6, ny + hs * 2.2);
    g.fill();
    g.fillStyle = "#c9a040";
    for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(nx + (k % 2 ? 1 : -1) * hs * 0.25, ny + hs * (1.05 + Math.floor(k / 2) * 0.35), hs * 0.045, 0, TAU); g.fill(); }
    for (const sd of [-1, 1]) {
      const ex = nx + sd * hs * 1.05, ey = ny + hs * 0.5;
      const eg = g.createRadialGradient(ex - sd * 3, ey - 3, 1, ex, ey, hs * 0.38);
      eg.addColorStop(0, "#fff0a8");
      eg.addColorStop(0.5, "#c9962e");
      eg.addColorStop(1, "#5a3a0a");
      g.fillStyle = eg;
      g.beginPath();
      g.ellipse(ex, ey, hs * 0.38, hs * 0.14, sd * 0.25, 0, TAU);
      g.fill();
      g.strokeStyle = "#e0b850";
      g.lineWidth = 0.8;
      for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(ex + (k - 3) * hs * 0.1, ey + hs * 0.1); g.lineTo(ex + (k - 3) * hs * 0.11, ey + hs * 0.3); g.stroke(); }
    }
    const hg = g.createLinearGradient(0, hy - hs * 1.1, 0, hy - hs * 0.45);
    hg.addColorStop(0, "#1a1a22");
    hg.addColorStop(1, "#05050a");
    g.fillStyle = hg;
    g.beginPath();
    g.moveTo(hx - hs * 1.05, hy - hs * 0.45);
    g.quadraticCurveTo(hx, hy - hs * 1.45, hx + hs * 1.05, hy - hs * 0.45);
    g.quadraticCurveTo(hx, hy - hs * 0.68, hx - hs * 1.05, hy - hs * 0.45);
    g.fill();
    g.strokeStyle = "#b8902e";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(hx - hs * 1.0, hy - hs * 0.48);
    g.quadraticCurveTo(hx, hy - hs * 0.66, hx + hs * 1.0, hy - hs * 0.48);
    g.stroke();
    g.fillStyle = "#c9a040";
    g.beginPath();
    g.arc(hx + hs * 0.1, hy - hs * 0.78, hs * 0.08, 0, TAU);
    g.fill();
  } else if (kind === "lord") {
    // top hat + monocle chain
    const hg = g.createLinearGradient(hx - hs * 0.5, 0, hx + hs * 0.5, 0);
    hg.addColorStop(0, "#08080a");
    hg.addColorStop(0.45, "#33302e");
    hg.addColorStop(1, "#060607");
    g.fillStyle = hg;
    g.fillRect(hx - hs * 0.42, hy - hs * 1.65, hs * 0.84, hs * 1.0);
    g.beginPath();
    g.ellipse(hx, hy - hs * 0.66, hs * 0.75, hs * 0.13, 0, 0, TAU);
    g.fill();
    g.fillStyle = "#5a1a1a";
    g.fillRect(hx - hs * 0.42, hy - hs * 0.9, hs * 0.84, hs * 0.14);
    g.strokeStyle = "#d8b24a";
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(hx + hs * 0.2, hy - hs * 0.08, hs * 0.16, 0, TAU);
    g.stroke();
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(hx + hs * 0.34, hy);
    g.quadraticCurveTo(hx + hs * 0.6, hy + hs * 0.7, hx + hs * 0.2, hy + hs * 1.1);
    g.stroke();
    // cravat
    g.fillStyle = "#e8e2d4";
    g.beginPath();
    g.moveTo(nx - hs * 0.3, ny + hs * 0.3);
    g.quadraticCurveTo(nx, ny + hs * 0.6, nx + hs * 0.3, ny + hs * 0.3);
    g.lineTo(nx + hs * 0.12, ny + hs * 0.95);
    g.lineTo(nx - hs * 0.12, ny + hs * 0.95);
    g.fill();
  } else if (kind === "lady") {
    // tiara + shawl
    g.fillStyle = "#3a5a8a";
    g.beginPath();
    g.moveTo(nx - hs * 1.6, ny + hs * 2.2);
    g.quadraticCurveTo(nx - hs * 1.2, ny + hs * 0.3, nx, ny + hs * 0.55);
    g.quadraticCurveTo(nx + hs * 1.2, ny + hs * 0.3, nx + hs * 1.6, ny + hs * 2.2);
    g.fill();
    g.strokeStyle = "rgba(200,220,255,0.35)";
    g.lineWidth = 1;
    for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(nx - hs * 1.3 + k * hs * 0.5, ny + hs * 0.9); g.quadraticCurveTo(nx - hs + k * hs * 0.45, ny + hs * 1.5, nx - hs * 1.4 + k * hs * 0.55, ny + hs * 2.2); g.stroke(); }
    g.fillStyle = "#e8e4f0";
    g.beginPath();
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      g.lineTo(hx + (u - 0.5) * hs * 0.9, hy - hs * 0.62 - (k % 2 ? hs * 0.1 : hs * 0.22) * Math.sin(u * Math.PI));
    }
    g.lineTo(hx + hs * 0.45, hy - hs * 0.55);
    g.lineTo(hx - hs * 0.45, hy - hs * 0.55);
    g.fill();
    g.fillStyle = "#7ad0ff";
    g.beginPath();
    g.arc(hx, hy - hs * 0.78, hs * 0.06, 0, TAU);
    g.fill();
  }
}
// the cat inside a painting: where to put it so the bust fills a w x h canvas
function portraitCat(g, kind, w, h, t, gaze, alpha, turnAdd = 0) {
  const P = PORTRAITS[kind];
  const S = h * 0.7;
  const x = w * 0.5 - P.facing * S * 0.12, y = h * 0.62 + S * 1.12;
  K.drawCat(g, x, y, S, {
    pose: "sit", facing: P.facing, headTurn: P.turn + turnAdd, t, coat: P.coat, collar: false, bell: false, shadow: false,
    gaze, pupil: 0.14, light: { x: P.facing > 0 ? -w : w * 2, y: -h * 0.5, color: "#ffe2b0", strength: 0.7 }, alpha,
  });
  const hx = x + P.facing * S * 0.2, hy = y - S * 1.5;
  costume(g, kind, hx, hy, S * 0.3, x + P.facing * S * 0.17, y - S * 1.2);
}
function oilFinish(s, w, h, seed) {
  const R = K.rng("oil" + seed);
  // brush texture
  for (let i = 0; i < 220; i++) {
    const x = R() * w, y = R() * h, l = 4 + R() * 10, a = R() * TAU;
    s.strokeStyle = R() > 0.5 ? "rgba(255,240,210,0.05)" : "rgba(0,0,0,0.07)";
    s.lineWidth = 1 + R() * 2;
    s.beginPath();
    s.moveTo(x, y);
    s.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    s.stroke();
  }
  // yellowed varnish
  s.globalCompositeOperation = "multiply";
  s.fillStyle = "rgba(214,176,112,0.55)";
  s.fillRect(0, 0, w, h);
  s.globalCompositeOperation = "source-over";
  // craquelure
  s.strokeStyle = "rgba(20,10,0,0.18)";
  s.lineWidth = 0.5;
  for (let i = 0; i < 26; i++) {
    let x = R() * w, y = R() * h;
    s.beginPath();
    s.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 22; y += (R() - 0.5) * 22; s.lineTo(x, y); }
    s.stroke();
  }
  const vg = s.createRadialGradient(w * 0.45, h * 0.4, h * 0.15, w / 2, h / 2, h * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(10,4,0,0.6)");
  s.fillStyle = vg;
  s.fillRect(0, 0, w, h);
}
function portraitBg(s, kind, w, h) {
  const P = PORTRAITS[kind];
  const bg = s.createRadialGradient(w * 0.35, h * 0.3, 4, w * 0.5, h * 0.5, h * 0.9);
  bg.addColorStop(0, P.bg2);
  bg.addColorStop(1, P.bg);
  s.fillStyle = bg;
  s.fillRect(0, 0, w, h);
  // a painted curtain fold + column, for depth
  s.fillStyle = rgba(shade(P.bg, -0.4), 0.6);
  s.beginPath();
  s.moveTo(w, 0);
  s.quadraticCurveTo(w * 0.78, h * 0.3, w * 0.86, h);
  s.lineTo(w, h);
  s.fill();
}
// painted at 2x the requested size (the dolly brings the near portraits very close to the lens), so
// the strips sampled for the perspective walls stay crisp; drawImage callers pass explicit sizes
function portraitSprite(kind, w, h) {
  return K.sprite("f06portrait2:" + kind, w * 2, h * 2, (s) => {
    s.scale(2, 2);
    portraitBg(s, kind, w, h);
    portraitCat(s, kind, w, h, 0, 0, 1);
    oilFinish(s, w, h, kind);
  });
}
// gilt frame around a rect (in screen space, flat)
function giltFrame(g, x, y, w, h, b, glint = 0) {
  const outer = [x - b, y - b, w + b * 2, h + b * 2];
  const gr = g.createLinearGradient(outer[0], outer[1], outer[0] + outer[2], outer[1] + outer[3]);
  gr.addColorStop(0, "#f2cf72");
  gr.addColorStop(0.3, "#9a6e22");
  gr.addColorStop(0.55, "#d9ac4a");
  gr.addColorStop(1, "#4a300a");
  g.fillStyle = gr;
  g.beginPath();
  g.rect(outer[0], outer[1], outer[2], outer[3]);
  g.rect(x + w, y, -w, h);
  g.fill("evenodd");
  g.strokeStyle = "rgba(40,20,0,0.7)";
  g.lineWidth = 1.5;
  g.strokeRect(x - 1, y - 1, w + 2, h + 2);
  g.strokeStyle = "rgba(255,230,160,0.35)";
  g.lineWidth = 1;
  g.strokeRect(x - b * 0.55, y - b * 0.55, w + b * 1.1, h + b * 1.1);
  // ornament beads
  g.fillStyle = "rgba(255,226,140,0.45)";
  for (let i = 0; i < 18; i++) {
    const u = i / 17;
    g.fillRect(x - b * 0.8 + u * (w + b * 1.6), y - b * 0.85, 2, 2);
    g.fillRect(x - b * 0.8 + u * (w + b * 1.6), y + h + b * 0.6, 2, 2);
  }
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.fillRect(x - b, y + h + b, w + b * 2, b * 0.5);
  if (glint > 0) glow(g, x - b * 0.5 + w * 0.15, y - b * 0.5, b * 3, "#fff0c0", glint);
}

// ---- 3D helper for the hallway and the staircase ---------------------------------------------------
function proj(cam) {
  return (X, Y, Z) => {
    const z = Math.max(0.05, Z - cam.z);
    return [cam.cx + (X - cam.x) * cam.f / z, cam.cy + (Y - cam.y) * cam.f / z, cam.f / z];
  };
}
function quad(g, P, pts) {
  g.beginPath();
  pts.forEach((p, i) => { const s = P(p[0], p[1], p[2]); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); });
  g.closePath();
}

// ---- SHOT 1: the long candlelit hallway --------------------------------------------------------------
const HALL = { x0: -2, x1: 2, floor: 1.5, ceil: -2.3, end: 17 };
const LEFT_PORTRAITS = [[2.4, "duchess"], [5.6, "lord"], [8.8, "lady"], [12.0, "admiral"], [14.8, "duchess"]];
const RIGHT_ITEMS = [[2.4, "lady"], [5.2, "window"], [8.6, "admiral"], [11.0, "window"], [14.4, "lord"]];
const SCONCES = [4.1, 7.3, 10.4, 13.4, 16.0];
const STANDS = [[-1, 4.7], [1, 3.9], [-1, 10.9], [1, 7.6], [-1, 14.0], [1, 13.0]];

// a floor-standing three-candle candelabra against a wall
function candelabra(g, P, side, z, camZ, t) {
  if (z < camZ + 0.45) return;
  const X = side * 1.72;
  const foot = P(X, HALL.floor, z), top = P(X, 0.15, z);
  const s = top[2];
  const k = flick(t, z * 5 + side);
  glow(g, top[0], top[1] - s * 0.3, s * 2.2, CANDLE, 0.22 * k);
  // its pool of light on the floor + reflection
  g.save();
  g.translate(foot[0], foot[1]);
  g.scale(1, 0.25);
  glow(g, 0, 0, s * 2.4, CANDLE, 0.26 * k);
  glow(g, 0, 0, s * 1.1, "#ffd08a", 0.32 * k);
  g.restore();
  g.strokeStyle = "#3a2810";
  g.lineWidth = Math.max(1, s * 0.035);
  g.beginPath();
  g.moveTo(foot[0], foot[1]);
  g.lineTo(top[0], top[1]);
  g.moveTo(top[0] - s * 0.22, top[1] - s * 0.05);
  g.quadraticCurveTo(top[0], top[1] + s * 0.12, top[0] + s * 0.22, top[1] - s * 0.05);
  g.stroke();
  g.fillStyle = "#3a2810";
  g.beginPath();
  g.ellipse(foot[0], foot[1], s * 0.12, s * 0.03, 0, 0, TAU);
  g.fill();
  for (const dx of [-0.22, 0, 0.22]) candle(g, top[0] + dx * s, top[1] - s * (dx ? 0.05 : 0.12), s * 0.2, t, z * 7 + dx * 10 + side, 1, 0.7);
}

function wallPortrait(g, P, side, z0, kind, camZ, t) {
  const len = 1.0, y0 = -1.45, y1 = -0.15, X = side * 1.99;
  if (z0 + len < camZ + 0.3) return;
  const spr = portraitSprite(kind, 166, 214);
  const n = 16;
  // frame behind (a slightly bigger quad)
  const b = 0.09;
  quad(g, P, [[X, y0 - b, z0 - b], [X, y0 - b, z0 + len + b], [X, y1 + b, z0 + len + b], [X, y1 + b, z0 - b]]);
  const a = P(X, y0, z0), c = P(X, y0, z0 + len);
  const fg = g.createLinearGradient(a[0], 0, c[0], 0);
  fg.addColorStop(0, "#c99a3e");
  fg.addColorStop(1, "#5a3c12");
  g.fillStyle = fg;
  g.fill();
  // each strip is mapped with an affine skew onto its slice of the wall, so the top and bottom
  // edges follow the perspective lines (no stair-stepping) and the image never tears between strips
  const sw = spr.width / n, sh = spr.height;
  for (let i = 0; i < n; i++) {
    const za = z0 + (len * i) / n, zb = z0 + (len * (i + 1)) / n;
    if (za < camZ + 0.25) continue;
    const u = side < 0 ? i / n : 1 - (i + 1) / n;
    // the source strip's left edge sits at za on the left wall, at zb on the (mirrored) right wall
    const zl = side < 0 ? za : zb, zr = side < 0 ? zb : za;
    const o = P(X, y0, zl), r = P(X, y0, zr), d = P(X, y1, zl);
    g.save();
    g.transform((r[0] - o[0]) / sw, (r[1] - o[1]) / sw, (d[0] - o[0]) / sh, (d[1] - o[1]) / sh, o[0], o[1]);
    g.drawImage(spr, u * spr.width, 0, sw, sh, 0, 0, sw * 1.2, sh);
    g.restore();
  }
  // candle sheen on the varnish
  const m = P(X, (y0 + y1) / 2, z0 + len * 0.5);
  glow(g, m[0], m[1] - m[2] * 0.2, m[2] * 0.35, "#ffd9a0", 0.12 * flick(t, z0));
}
function wallWindow(g, P, z0, camZ, t) {
  const len = 1.4, y0 = -1.95, y1 = 0.35, X = 1.99;
  if (z0 + len < camZ + 0.3) return;
  // deep blue night glass
  quad(g, P, [[X, y0, z0], [X, y0, z0 + len], [X, y1, z0 + len], [X, y1, z0]]);
  const a = P(X, y0, z0), c = P(X, y0, z0 + len);
  const wg = g.createLinearGradient(a[0], 0, c[0], 0);
  wg.addColorStop(0, "#5a6ab8");
  wg.addColorStop(1, "#2a3268");
  g.fillStyle = wg;
  g.fill();
  // mullions
  g.strokeStyle = "#1a0e1c";
  g.lineWidth = Math.max(1, P(X, 0, z0 + len / 2)[2] * 0.05);
  g.beginPath();
  const m0 = P(X, y0, z0 + len / 2), m1 = P(X, y1, z0 + len / 2);
  g.moveTo(m0[0], m0[1]); g.lineTo(m1[0], m1[1]);
  const h0 = P(X, -0.8, z0), h1 = P(X, -0.8, z0 + len);
  g.moveTo(h0[0], h0[1]); g.lineTo(h1[0], h1[1]);
  g.stroke();
  // frame
  quad(g, P, [[X, y0, z0], [X, y0, z0 + len], [X, y1, z0 + len], [X, y1, z0]]);
  g.strokeStyle = "#140a14";
  g.lineWidth = Math.max(1.5, P(X, 0, z0)[2] * 0.08);
  g.stroke();
}
// moonlight from a right-hand window onto the floor, plus the volumetric beam
function moonBeam(g, P, z0, camZ, t, strength = 1) {
  const len = 1.4, y0 = -1.95, y1 = 0.35;
  // the moon is high on the right: light through the right-hand windows lands LEFT of the runner,
  // skewed toward the far end of the hall
  const land = (Y, Z) => { const k = (HALL.floor - Y); return [1.69 - 1.05 * k, HALL.floor, Z + 0.4 * k]; };
  const a0 = land(y1, z0), a1 = land(y1, z0 + len), b0 = land(y0, z0), b1 = land(y0, z0 + len);
  if (z0 + len < camZ + 0.4) return;
  g.save();
  g.globalCompositeOperation = "lighter";
  // beam volume
  quad(g, P, [[1.99, y0, z0 + len * 0.5], b1, a0]);
  const s0 = P(1.99, y0, z0 + len * 0.5), s1 = P(...b1);
  const vg = g.createLinearGradient(s0[0], s0[1], s1[0], s1[1]);
  vg.addColorStop(0, rgba(MOON, 0.09 * strength));
  vg.addColorStop(1, rgba(MOON, 0.0));
  g.fillStyle = vg;
  g.fill();
  // floor patch
  quad(g, P, [a0, a1, b1, b0]);
  g.fillStyle = rgba("#b8c4ff", 0.2 * strength);
  g.fill();
  g.restore();
  // mullion shadows on the patch
  g.save();
  quad(g, P, [a0, a1, b1, b0]);
  g.clip();
  g.strokeStyle = "rgba(10,6,20,0.55)";
  const mid0 = land(y1, z0 + len / 2), mid1 = land(y0, z0 + len / 2);
  const tr0 = land(-0.8, z0), tr1 = land(-0.8, z0 + len);
  g.lineWidth = Math.max(1, P(...mid0)[2] * 0.06);
  g.beginPath();
  let p = P(...mid0); g.moveTo(p[0], p[1]); p = P(...mid1); g.lineTo(p[0], p[1]);
  p = P(...tr0); g.moveTo(p[0], p[1]); p = P(...tr1); g.lineTo(p[0], p[1]);
  g.stroke();
  g.restore();
  // dust in the beam
  const R = K.rng("beam" + z0);
  for (let i = 0; i < 26; i++) {
    const u = R(), v = R(), w = R();
    const X = lerp(1.9, lerp(1.1, -0.5, v), u) + noise(t * 0.2 + i, 3) * 0.08;
    const Y = lerp(lerp(y1, y0, v), HALL.floor, u) - ((t * 0.04 + R()) % 1) * 0.3;
    const Z = z0 + w * len - u * 0.5;
    if (Z < camZ + 0.3) continue;
    const s = P(X, Y, Z);
    glow(g, s[0], s[1], Math.max(1.2, s[2] * 0.012), "#dfe4ff", 0.5 * strength * (0.4 + 0.6 * Math.abs(Math.sin(t * 0.7 + i))));
  }
}

function hallway(g, t, W, H, camZ, camX, camY) {
  const cam = { x: camX, y: camY, z: camZ, f: 420, cx: W / 2, cy: H * 0.46 };
  const P = proj(cam);
  const zn = camZ + 0.22, zf = HALL.end;
  const { x0, x1, floor, ceil } = HALL;
  const fogC = "#5a3a5e";
  // ceiling
  quad(g, P, [[x0, ceil, zn], [x1, ceil, zn], [x1, ceil, zf], [x0, ceil, zf]]);
  g.fillStyle = "#170c1a";
  g.fill();
  g.strokeStyle = "rgba(60,36,50,0.8)";
  g.lineWidth = 2;
  g.beginPath();
  for (let z = Math.ceil(zn); z < zf; z += 1.6) { const a = P(x0, ceil, z), b = P(x1, ceil, z); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
  g.stroke();
  // end wall + tall window with the moon
  quad(g, P, [[x0, ceil, zf], [x1, ceil, zf], [x1, floor, zf], [x0, floor, zf]]);
  g.fillStyle = "#3a2440";
  g.fill();
  const ew0 = P(-0.55, -1.9, zf), ew1 = P(0.55, 0.6, zf);
  const eg = g.createLinearGradient(0, ew0[1], 0, ew1[1]);
  eg.addColorStop(0, "#8a9af0");
  eg.addColorStop(1, "#3a4488");
  g.fillStyle = eg;
  g.beginPath();
  g.moveTo(ew0[0], ew1[1]);
  g.lineTo(ew0[0], ew0[1] + (ew1[0] - ew0[0]) * 0.5);
  g.arc((ew0[0] + ew1[0]) / 2, ew0[1] + (ew1[0] - ew0[0]) * 0.5, (ew1[0] - ew0[0]) / 2, Math.PI, 0);
  g.lineTo(ew1[0], ew1[1]);
  g.closePath();
  g.fill();
  g.strokeStyle = "#1a0e1c";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo((ew0[0] + ew1[0]) / 2, ew0[1]);
  g.lineTo((ew0[0] + ew1[0]) / 2, ew1[1]);
  g.moveTo(ew0[0], lerp(ew0[1], ew1[1], 0.5));
  g.lineTo(ew1[0], lerp(ew0[1], ew1[1], 0.5));
  g.stroke();
  glow(g, (ew0[0] + ew1[0]) / 2, (ew0[1] + ew1[1]) / 2, 90, MOON, 0.35);
  // walls
  for (const side of [-1, 1]) {
    const X = side * 2;
    quad(g, P, [[X, ceil, zn], [X, ceil, zf], [X, floor, zf], [X, floor, zn]]);
    const a = P(X, 0, zn), b = P(X, 0, zf);
    const wg = g.createLinearGradient(a[0], 0, b[0], 0);
    wg.addColorStop(0, shade(PLUM, -0.7));
    wg.addColorStop(0.55, shade(PLUM, -0.4));
    wg.addColorStop(1, mix(PLUM, fogC, 0.3));
    g.fillStyle = wg;
    g.fill();
    // damask wallpaper stripes
    g.strokeStyle = "rgba(120,70,110,0.16)";
    g.lineWidth = 1;
    g.beginPath();
    for (let z = Math.ceil(zn * 4) / 4; z < zf; z += 0.25) { const p0 = P(X, ceil, z), p1 = P(X, 0.55, z); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); }
    g.stroke();
    // wainscot
    quad(g, P, [[X, 0.55, zn], [X, 0.55, zf], [X, floor, zf], [X, floor, zn]]);
    g.fillStyle = "rgba(24,10,14,0.82)";
    g.fill();
    g.strokeStyle = "rgba(150,96,70,0.45)";
    g.lineWidth = 2;
    g.beginPath();
    let p = P(X, 0.55, zn); g.moveTo(p[0], p[1]); p = P(X, 0.55, zf); g.lineTo(p[0], p[1]);
    g.stroke();
    g.strokeStyle = "rgba(90,50,40,0.5)";
    g.lineWidth = 1;
    for (let z = Math.ceil(zn); z < zf - 0.6; z += 1.1) {
      quad(g, P, [[X, 0.7, z + 0.1], [X, 0.7, z + 0.95], [X, 1.35, z + 0.95], [X, 1.35, z + 0.1]]);
      g.stroke();
    }
    // crown moulding
    g.strokeStyle = "rgba(110,70,60,0.5)";
    g.lineWidth = 3;
    g.beginPath();
    p = P(X, ceil + 0.08, zn); g.moveTo(p[0], p[1]); p = P(X, ceil + 0.08, zf); g.lineTo(p[0], p[1]);
    g.stroke();
  }
  // floor: dark polished boards + the carpet runner
  quad(g, P, [[x0, floor, zn], [x1, floor, zn], [x1, floor, zf], [x0, floor, zf]]);
  const f0 = P(0, floor, zn), f1 = P(0, floor, zf);
  const fg = g.createLinearGradient(0, f1[1], 0, f0[1]);
  fg.addColorStop(0, "#3a2420");
  fg.addColorStop(1, "#140906");
  g.fillStyle = fg;
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 1;
  g.beginPath();
  for (let X = -2; X <= 2.01; X += 0.22) { const a = P(X, floor, zn), b = P(X, floor, zf); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
  g.stroke();
  quad(g, P, [[-0.85, floor, zn], [0.85, floor, zn], [0.85, floor, zf - 0.3], [-0.85, floor, zf - 0.3]]);
  const cg = g.createLinearGradient(0, f1[1], 0, f0[1]);
  cg.addColorStop(0, "#6a2a34");
  cg.addColorStop(1, "#2a0810");
  g.fillStyle = cg;
  g.fill();
  g.strokeStyle = "rgba(210,160,80,0.4)";
  g.lineWidth = 1.2;
  g.beginPath();
  for (const X of [-0.74, 0.74]) { const a = P(X, floor, zn), b = P(X, floor, zf - 0.3); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
  g.stroke();
  g.strokeStyle = "rgba(160,70,70,0.22)";
  g.beginPath();
  for (let z = Math.ceil(zn * 2) / 2; z < zf - 0.3; z += 0.5) { const a = P(-0.7, floor, z), b = P(0.7, floor, z); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
  g.stroke();
  // wall items far to near
  const items = [];
  for (const [z, k] of LEFT_PORTRAITS) items.push([z, () => wallPortrait(g, P, -1, z, k, camZ, t)]);
  for (const [z, k] of RIGHT_ITEMS) items.push([z, () => (k === "window" ? wallWindow(g, P, z, camZ, t) : wallPortrait(g, P, 1, z, k, camZ, t))]);
  for (const z of SCONCES) {
    for (const side of [-1, 1]) {
      items.push([z, () => {
        if (z < camZ + 0.35) return;
        const p = P(side * 1.94, -0.55, z);
        const k = flick(t, z * 3 + side);
        // warm pool on the wall and its reflection in the polished floor
        glow(g, p[0], p[1] - p[2] * 0.15, p[2] * 1.3, CANDLE, 0.17 * k);
        glow(g, p[0], p[1] - p[2] * 0.2, p[2] * 0.45, "#ffc878", 0.22 * k);
        const fr = P(side * 1.6, floor + 0.05, z);
        g.save();
        g.translate(fr[0], fr[1]);
        g.scale(0.5, 1.4);
        glow(g, 0, 0, p[2] * 0.35, CANDLE, 0.25 * k);
        g.restore();
        sconce(g, p[0], p[1], p[2], t, z * 3 + side, -side);
      }]);
    }
  }
  for (const [side, z] of STANDS) items.push([z - 0.01, () => candelabra(g, P, side, z, camZ, t)]);
  items.sort((a, b) => b[0] - a[0]);
  for (const [, fn] of items) fn();
  for (const [z, k] of RIGHT_ITEMS) if (k === "window") moonBeam(g, P, z, camZ, t);
  // depth haze toward the far end
  const vp = P(0, -0.4, zf);
  const hz = g.createRadialGradient(vp[0], vp[1], 10, vp[0], vp[1], W * 0.3);
  hz.addColorStop(0, "rgba(130,110,170,0.32)");
  hz.addColorStop(0.4, "rgba(90,60,100,0.1)");
  hz.addColorStop(1, "rgba(60,30,60,0)");
  g.fillStyle = hz;
  g.fillRect(0, 0, W, H);
}
function shot1(g, t, W, H) {
  const p = eio(seg(t, 0, 10.4));
  const camZ = lerp(0, 2.2, p);
  hallway(g, t, W, H, camZ, noise(t * 0.3, 2) * 0.03, noise(t * 0.27, 5) * 0.02 + Math.sin(t * 3.2) * 0.006);
  K.dust(g, W, H, t, { seed: 61, count: 26, color: "#ffd9a0", size: 1.3, alpha: 0.4 });
}

// ---- SHOT 2: pan across the portraits -------------------------------------------------------------
const GALLERY = [[200, "duchess"], [660, "admiral"], [1120, "lord"], [1560, "lady"]];
function galleryWall(g, t, W, H, x0, x1, opts = {}) {
  const top = -40, rail = 352, base = 470;
  const wg = g.createLinearGradient(0, top, 0, rail);
  wg.addColorStop(0, "#1a0d1e");
  wg.addColorStop(1, PLUM);
  g.fillStyle = wg;
  g.fillRect(x0, top, x1 - x0, rail - top);
  // damask: rows of soft diamonds
  g.fillStyle = "rgba(110,60,100,0.13)";
  for (let y = 0; y < rail; y += 46) for (let x = Math.floor(x0 / 40) * 40; x < x1; x += 40) {
    const ox = (y / 46) % 2 ? 20 : 0;
    g.beginPath();
    g.ellipse(x + ox, y + 12, 6, 13, 0, 0, TAU);
    g.fill();
  }
  // chair rail + wainscot
  g.fillStyle = "#4a2a26";
  g.fillRect(x0, rail, x1 - x0, 9);
  g.fillStyle = "rgba(255,210,160,0.15)";
  g.fillRect(x0, rail, x1 - x0, 2);
  const ws = g.createLinearGradient(0, rail + 9, 0, base);
  ws.addColorStop(0, "#2a1216");
  ws.addColorStop(1, "#160709");
  g.fillStyle = ws;
  g.fillRect(x0, rail + 9, x1 - x0, base - rail - 9);
  g.strokeStyle = "rgba(140,80,60,0.35)";
  g.lineWidth = 1.5;
  for (let x = Math.floor(x0 / 150) * 150; x < x1; x += 150) g.strokeRect(x + 14, rail + 26, 122, base - rail - 48);
  // floor
  const fg = g.createLinearGradient(0, base, 0, H + 80);
  fg.addColorStop(0, "#2a1612");
  fg.addColorStop(1, "#0c0505");
  g.fillStyle = fg;
  g.fillRect(x0, base, x1 - x0, H + 100 - base);
  if (opts.portraits !== false) {
    for (const [px, kind] of GALLERY) {
      if (px + 160 < x0 || px - 160 > x1) continue;
      const w = 166, h = 214, x = px - w / 2, y = 92;
      g.fillStyle = "rgba(0,0,0,0.4)";
      g.fillRect(x + 10, y + 16, w + 8, h + 8);
      if (kind === "admiral" && opts.live) {
        g.save();
        g.beginPath();
        g.rect(x, y, w, h);
        g.clip();
        g.translate(x, y);
        portraitBg(g, kind, w, h);
        portraitCat(g, kind, w, h, 0, opts.gaze || 0, 1, opts.turn || 0);
        g.drawImage(K.sprite("f06varnish", w, h, (s) => oilFinish(s, w, h, "admiral")), 0, 0, w, h);
        g.restore();
      } else g.drawImage(portraitSprite(kind, w, h), x, y, w, h);
      giltFrame(g, x, y, w, h, 16, 0.25);
      // brass plaque
      g.fillStyle = "#8a6a2a";
      g.fillRect(px - 26, y + h + 22, 52, 9);
    }
  }
  for (const sx of [430, 890, 1340]) {
    if (sx < x0 - 200 || sx > x1 + 200) continue;
    const k = flick(t, sx);
    glow(g, sx, 190, 260, CANDLE, 0.2 * k);
    glow(g, sx, 190, 90, "#ffcf80", 0.22 * k);
    sconce(g, sx, 200, 150, t, sx, 1);
  }
}
const GL_EYES = [[634, 170], [656, 171]];
function shot2(g, t, W, H) {
  const p = eio(seg(t, 10, 20));
  const cx = lerp(330, 860, p);
  // the painted eyes slide to follow you after the hit at 12
  // the hit at 12: between 11.8 and 12.6 the admiral's painted eyes slide round to YOU (pupils
  // + a slight turn of the head), a catch-light flares in them, and the camera leans in 3% on him
  const look = eio(seg(t, 11.8, 12.6));
  const gaze = lerp(-0.7, lerp(1, -0.2, eio(seg(t, 13.4, 20))), look);
  const turn = 0.2 * look * (1 - eio(seg(t, 14, 20)));
  const push = 0.03 * look * (1 - eio(seg(t, 14.5, 17)));
  const AX = 660, AY = 200;
  K.withCamera(g, W, H, { x: lerp(cx, AX, push * 8), y: lerp(H / 2, AY, push * 8), zoom: (1.04 + p * 0.03) * (1 + push), shakeT: t, shakeAmt: 1 }, () => {
    galleryWall(g, t, W, H, cx - W, cx + W, { live: true, gaze, turn });
    // the catch-light: a wet glint sliding into the painted eyes as they arrive
    const gl = K.env(t, 12.1, 13.1, 0.15, 0.6);
    if (gl > 0) {
      K.bellGlint(g, GL_EYES[0][0], GL_EYES[0][1], 16 * gl, t, { strength: gl * 0.9 });
      K.bellGlint(g, GL_EYES[1][0], GL_EYES[1][1], 13 * gl, t, { strength: gl * 0.7 });
    }
    K.dust(g, W * 2, H, t, { seed: 62, count: 30, color: "#ffd9a0", size: 1.2, alpha: 0.35, area: [cx - W, 0, W * 2, H] });
  });
  // a hard "hit": a brief shiver of the frame at 12
  if (t > 12 && t < 12.5) K.fadeColor(g, W, H, (1 - seg(t, 12, 12.5)) * 0.08, "#ffd9a0");
}

// ---- SHOT 3: the ghost who is not very good at haunting ---------------------------------------------
const GHOST = { base: "#b4d2f4", light: "#f2f8ff", dark: "#5a78a8", stripe: "#9fc0ea", tip: "#bcd6ff", belly: "#eef6ff", white: "#ffffff",
  nose: "#c8d8f8", noseEdge: "#90a8d8", innerEar: "#dfe8ff", iris: "#e8f6ff", irisInner: "#ffffff", liner: "#5a7ab0",
  pattern: "solid", bib: false, socks: false, muzzle: true, stripeAlpha: 0.2, bentEar: false };
function chandelier(g, x, y, s, rot, t) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.strokeStyle = "#5a4218";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, s * 0.9);
  g.stroke();
  const cy = s * 1.15;
  // back half of the ring, candles, front half
  const ring = (front) => {
    g.strokeStyle = front ? "#d9ac4a" : "#7a5a20";
    g.lineWidth = s * 0.04;
    g.beginPath();
    g.ellipse(0, cy, s * 0.7, s * 0.16, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
    g.stroke();
  };
  ring(false);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    const px = Math.cos(a) * s * 0.7, py = cy + Math.sin(a) * s * 0.16;
    if (Math.sin(a) < 0) candle(g, px, py, s * 0.2, t, i * 7.1, 1, 0.6);
  }
  const bg = g.createRadialGradient(-s * 0.08, cy - s * 0.1, 1, 0, cy, s * 0.24);
  bg.addColorStop(0, "#ffe8a0");
  bg.addColorStop(1, "#6a4a10");
  g.fillStyle = bg;
  g.beginPath();
  g.ellipse(0, cy, s * 0.14, s * 0.26, 0, 0, TAU);
  g.fill();
  ring(true);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    const px = Math.cos(a) * s * 0.7, py = cy + Math.sin(a) * s * 0.16;
    if (Math.sin(a) >= 0) candle(g, px, py, s * 0.2, t, i * 7.1, 1, 0.6);
  }
  // crystal drops
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    const px = Math.cos(a) * s * 0.62, py = cy + Math.sin(a) * s * 0.14 + s * 0.12;
    const sw = Math.sin(t * 3 + i) * 0.5;
    g.fillStyle = "rgba(220,235,255,0.75)";
    g.beginPath();
    g.moveTo(px + sw, py);
    g.quadraticCurveTo(px + sw + 3, py + 8, px + sw, py + 12);
    g.quadraticCurveTo(px + sw - 3, py + 8, px + sw, py);
    g.fill();
    if (hash(i + Math.floor(t * 6), 3) > 0.8) glow(g, px + sw, py + 7, 7, "#ffffff", 0.7);
  }
  g.restore();
}
// The gag: the ghost drifts out, REARS UP to be scary (body pivoting ~35 deg back round the hips,
// front paws lifting) and rises until its ears clonk the chandelier at exactly 24.0; the head
// squashes, the chandelier swings, crystals tinkle. Then it slinks off embarrassed: ears flat, tail
// down, glancing back at you, and fades into the wall before it reaches the sconce.
const BONK = 24.0;
function ghostState(t) {
  const emerge = smooth(seg(t, 20, 21.8));
  const rearUp = eio(seg(t, 22.5, BONK));
  const settle = eio(seg(t, 24.35, 25.1));
  const rear = rearUp * (1 - settle);
  const leave = eio(seg(t, 25.1, 29.4));
  const x = lerp(lerp(250, 452, eio(seg(t, 20, 22.6))), 610, leave);
  const s = lerp(70, 92, emerge);
  // GHOST_RISE is tuned so the ear tips touch the chandelier's lowest crystals at the bonk
  let y = 330 + Math.sin(t * 1.7) * 6 * (1 - rearUp) - rear * GHOST_RISE + leave * 18;
  const squash = t >= BONK ? Math.exp(-(t - BONK) * 9) : 0;
  const alpha = emerge * (1 - smooth(seg(t, 27.6, 29.3)));
  return { x, y, s, alpha, rear, squash, leave, emb: t > BONK + 0.3 ? 1 : 0 };
}
const GHOST_RISE = 12;
function ghost(g, t, W, H) {
  const G = ghostState(t);
  if (G.alpha <= 0.01) return;
  const L = K.layer(W, H, "f06ghost");
  const c = L.g;
  // pivot round the hips; squash about the top of the head on impact
  const hipX = G.x - G.s * 0.55, hipY = G.y - G.s * 0.55;
  c.save();
  c.translate(hipX, hipY);
  c.rotate(-0.61 * G.rear);
  c.translate(-hipX, -hipY);
  if (G.squash > 0.01) {
    const hx = G.x + G.s * 0.75, hy = G.y - G.s * 1.35;
    c.translate(hx, hy);
    c.scale(1 + 0.12 * G.squash, 1 - 0.2 * G.squash);
    c.translate(-hx, -hy);
  }
  K.drawCat(c, G.x, G.y, G.s, {
    pose: G.emb ? "walk" : G.rear > 0.25 ? "stand" : "walk", phase: t * 0.35, facing: 1, t, coat: GHOST,
    headTilt: G.emb ? -0.45 : G.rear * 0.5,
    // embarrassed: the head turns back toward the camera as it slinks away
    headTurn: G.emb ? lerp(0.35, 0.95, eio(seg(t, 25.0, 26.4))) : 0.35, mouth: G.emb ? 0 : G.rear,
    ears: G.emb ? -1 : G.rear > 0.2 ? 0.8 : 0.4, tail: G.emb ? 0.2 : 1, tailUp: G.emb ? 0 : 0.6 + G.rear * 0.4,
    blink: G.emb ? 0.45 : G.squash > 0.2 ? 0.9 : 0,
    collar: false, bell: false, shadow: false, light: { x: 560, y: 120, color: "#ffffff", strength: 0.6 },
  });
  c.restore();
  // wispy: legs dissolve into mist (in screen space below the body)
  c.save();
  c.globalCompositeOperation = "destination-out";
  const fy = G.y - G.s * 0.55 * (1 - G.rear * 0.5);
  const fg = c.createLinearGradient(0, fy, 0, G.y + 4);
  fg.addColorStop(0, "rgba(0,0,0,0)");
  fg.addColorStop(1, "rgba(0,0,0,0.95)");
  c.fillStyle = fg;
  c.fillRect(G.x - G.s * 2.5, fy, G.s * 5, G.y + 4 - fy + 2);
  // as it leaves, it melts into the wall from the front (right) first
  if (G.leave > 0) {
    const fade = smooth(seg(t, 26.8, 29.3));
    const mg = c.createLinearGradient(G.x - G.s * 1.4, 0, G.x + G.s * 1.6, 0);
    mg.addColorStop(0, rgba("#000000", fade * 0.6));
    mg.addColorStop(1, rgba("#000000", Math.min(1, fade * 1.4)));
    c.fillStyle = mg;
    c.fillRect(G.x - G.s * 2.5, G.y - G.s * 2.6, G.s * 5, G.s * 2.8);
  }
  c.restore();
  // translucent body: a soft additive aura, then the cat itself at half opacity
  g.save();
  g.globalCompositeOperation = "lighter";
  K.dof(g, L.canvas, 12, 0.35 * G.alpha);
  g.restore();
  g.save();
  g.globalAlpha = 0.5 * G.alpha * (0.9 + 0.1 * Math.sin(t * 7));
  g.drawImage(L.canvas, 0, 0, W, H);
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = 0.18 * G.alpha;
  g.drawImage(L.canvas, 0, 0, W, H);
  g.restore();
  glow(g, G.x, G.y - G.s * 0.7 - G.rear * 30, G.s * 2.6, "#bcd6ff", 0.18 * G.alpha);
  // a few mist trails behind
  for (let i = 0; i < 6; i++) {
    const k = i / 6;
    glow(g, G.x - 30 - i * 22, G.y - G.s * 0.3 + Math.sin(t * 2 + i) * 6, G.s * (0.7 - k * 0.4), "#cfe6ff", 0.16 * G.alpha * (1 - k));
  }
}
// the chandelier's swing after the bonk: +-0.2 rad, decaying, pivoting at the ceiling chain
const chandRot = (t) => (t >= BONK ? 0.2 * Math.exp(-(t - BONK) * 0.55) * Math.sin((t - BONK) * 2.8) : 0);
function shot3(g, t, W, H) {
  const p = eio(seg(t, 20, 30));
  const rot = chandRot(t);
  const CX = 520, CY = -46, CS = 120;
  K.withCamera(g, W, H, { x: 480 + p * 30, y: 280, zoom: 1.0 + p * 0.04, shakeT: t, shakeAmt: 1 + (t > BONK && t < BONK + 0.5 ? 4 : 0) }, () => {
    g.save();
    g.translate(-150, 0);
    galleryWall(g, t, W, H, -200, 1400, { portraits: false });
    g.restore();
    // a dim portrait to the left (the one the ghost came out of)
    g.drawImage(portraitSprite("lady", 150, 196), 160, 92, 150, 196);
    giltFrame(g, 160, 92, 150, 196, 14, 0.2);
    // emerge ripple on the wall
    const em = seg(t, 19.8, 21.6);
    if (em > 0 && em < 1) {
      g.save();
      g.globalCompositeOperation = "lighter";
      g.strokeStyle = rgba("#cfe6ff", 0.5 * (1 - em));
      g.lineWidth = 2;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(250, 280, 20 + em * 120 + i * 18, (20 + em * 120 + i * 18) * 1.3, 0, 0, TAU); g.stroke(); }
      g.restore();
    }
    chandelier(g, CX, CY, CS, rot, t);
    // chandelier light on the wall swings with it
    glow(g, CX + Math.sin(rot) * 140, 110, 300, CANDLE, 0.22);
    ghost(g, t, W, H);
    // the clonk: crystal tinkle sparks scattered round the ring, a beat apart
    const R = K.rng("tinkle");
    for (let i = 0; i < 9; i++) {
      const a = R() * TAU, t0 = BONK + R() * 0.7;
      const k = seg(t, t0, t0 + 0.35);
      if (k <= 0 || k >= 1) { R(); continue; }
      const lx = Math.cos(a) * CS * 0.62, ly = CS * 1.15 + Math.sin(a) * CS * 0.14 + CS * 0.2 + R() * 6;
      const sx = CX + lx * Math.cos(rot) - ly * Math.sin(rot), sy = CY + lx * Math.sin(rot) + ly * Math.cos(rot);
      K.bellGlint(g, sx, sy, 14 * (1 - k), t, { strength: 1 - k, color: "#ffffff" });
    }
    const bk = seg(t, BONK - 0.02, BONK + 0.5);
    if (bk > 0 && bk < 1) K.bellGlint(g, CX - 56, CY + CS * 1.4, 40 * (1 - bk), t, { strength: 1 - bk });
  });
  // a two-frame white flash on impact
  if (t >= BONK && t < BONK + 0.07) K.fadeColor(g, W, H, 0.5, "#ffffff");
}

// ---- SHOT 4 + 7: the grand staircase ------------------------------------------------------------------
const STEPS = 14, RISE = 0.24, RUN = 0.42, Z0 = 2.2;
const stepY = (i) => 1.5 - i * RISE;
const stepZ = (i) => Z0 + i * RUN;
function staircase(g, t, W, H, cam, o = {}) {
  const P = proj(cam);
  const topY = stepY(STEPS), topZ = stepZ(STEPS), back = topZ + (o.backDepth || 2.2);
  // back wall + side walls
  g.fillStyle = "#1c0e20";
  g.fillRect(0, 0, W, H);
  quad(g, P, [[-3, -7, back], [3, -7, back], [3, topY, back], [-3, topY, back]]);
  const bw = P(0, topY - 3, back);
  const bg = g.createRadialGradient(bw[0], bw[1], 10, bw[0], bw[1], 360);
  bg.addColorStop(0, "#3c2648");
  bg.addColorStop(1, "#1a0c1e");
  g.fillStyle = bg;
  g.fill();
  for (const side of [-1, 1]) {
    quad(g, P, [[side * 3, -7, cam.z + 0.3], [side * 3, -7, back], [side * 3, 2, back], [side * 3, 2, cam.z + 0.3]]);
    const a = P(side * 3, 0, cam.z + 0.5), b = P(side * 3, 0, back);
    const wg = g.createLinearGradient(a[0], 0, b[0], 0);
    wg.addColorStop(0, "#12070f");
    wg.addColorStop(1, "#2c1832");
    g.fillStyle = wg;
    g.fill();
  }
  // the tall arched window (shot 4) or the lit doorway (shot 7)
  const win = o.top === "door"
    ? { x0: -0.72, x1: 0.72, y0: topY - 3.0, y1: topY, z: back }
    : { x0: -0.8, x1: 0.8, y0: topY - 3.9, y1: topY - 0.7, z: back };
  const w0 = P(win.x0, win.y0, win.z), w1 = P(win.x1, win.y1, win.z);
  const ww = w1[0] - w0[0];
  const arch = (pad = 0) => {
    g.beginPath();
    g.moveTo(w0[0] - pad, w1[1] + pad);
    g.lineTo(w0[0] - pad, w0[1] + ww / 2);
    g.arc((w0[0] + w1[0]) / 2, w0[1] + ww / 2, ww / 2 + pad, Math.PI, 0);
    g.lineTo(w1[0] + pad, w1[1] + pad);
    g.closePath();
  };
  arch(ww * 0.07);
  g.fillStyle = "#0e0610";
  g.fill();
  arch();
  if (o.top === "door") {
    const dg = g.createLinearGradient(0, w0[1], 0, w1[1]);
    dg.addColorStop(0, "#ffcf8a");
    dg.addColorStop(1, "#ff9a4a");
    g.fillStyle = dg;
    g.fill();
  } else {
    const dg = g.createLinearGradient(0, w0[1], 0, w1[1]);
    dg.addColorStop(0, "#b8c4ff");
    dg.addColorStop(1, "#5a66c0");
    g.fillStyle = dg;
    g.fill();
    // a moon in the glass + tracery
    glow(g, w0[0] + ww * 0.68, w0[1] + ww * 0.62, ww * 0.5, "#ffffff", 0.5);
    g.save();
    arch();
    g.clip();
    g.strokeStyle = "#140a18";
    g.lineWidth = Math.max(1.5, ww * 0.03);
    g.beginPath();
    for (let k = 1; k < 3; k++) { g.moveTo(w0[0] + (ww * k) / 3, w0[1]); g.lineTo(w0[0] + (ww * k) / 3, w1[1]); }
    for (let k = 1; k < 5; k++) { const yy = lerp(w0[1] + ww / 2, w1[1], k / 5); g.moveTo(w0[0], yy); g.lineTo(w1[0], yy); }
    g.stroke();
    g.restore();
  }
  const winC = [(w0[0] + w1[0]) / 2, (w0[1] + w1[1]) / 2];
  if (o.top === "door") {
    glow(g, winC[0], w1[1] - (w1[1] - w0[1]) * 0.4, ww * 3, "#ffb25a", 0.35);
  } else glow(g, winC[0], winC[1], ww * 1.6, MOON, 0.3);
  if (o.inDoor) o.inDoor(g, P, win, w0, w1);
  // candle sconces on the stairwell walls
  for (const side of [-1, 1]) {
    for (const i of [3, 9]) {
      const z = stepZ(i);
      if (z < cam.z + 0.6) continue;
      const q = P(side * 2.95, stepY(i) - 1.75, z);
      const k = flick(t, i * 3 + side);
      glow(g, q[0], q[1] - q[2] * 0.15, q[2] * 1.6, CANDLE, 0.28 * k);
      glow(g, q[0], q[1] - q[2] * 0.2, q[2] * 0.5, "#ffc878", 0.25 * k);
      sconce(g, q[0], q[1], q[2], t, i * 3 + side, -side);
    }
  }
  // landing
  quad(g, P, [[-1.7, topY, topZ], [1.7, topY, topZ], [1.7, topY, back], [-1.7, topY, back]]);
  g.fillStyle = "#2a1418";
  g.fill();
  // steps far to near: tread then riser
  const lit = o.top !== "door";
  for (let i = STEPS - 1; i >= 0; i--) {
    const yT = stepY(i + 1), z0 = stepZ(i), z1 = stepZ(i + 1);
    if (z0 < cam.z + 0.3) continue;
    // tread (stone edge + red runner)
    quad(g, P, [[-1.7, yT, z0], [1.7, yT, z0], [1.7, yT, z1], [-1.7, yT, z1]]);
    g.fillStyle = "#3a2a2a";
    g.fill();
    quad(g, P, [[-0.95, yT, z0], [0.95, yT, z0], [0.95, yT, z1], [-0.95, yT, z1]]);
    g.fillStyle = "#5a1a24";
    g.fill();
    if (lit) {
      // moonlight lands on the treads (the window's shape, mullion shadow down the middle)
      const k = clamp(1 - Math.abs(i - 5) / 9);
      g.save();
      g.globalCompositeOperation = "lighter";
      quad(g, P, [[-0.75, yT, z0 + 0.02], [-0.05, yT, z0 + 0.02], [-0.05, yT, z1], [-0.75, yT, z1]]);
      g.fillStyle = rgba("#aab2e0", 0.18 * k);
      g.fill();
      quad(g, P, [[0.05, yT, z0 + 0.02], [0.75, yT, z0 + 0.02], [0.75, yT, z1], [0.05, yT, z1]]);
      g.fill();
      g.restore();
    }
    // nosing highlight
    const n0 = P(-1.7, yT, z0), n1 = P(1.7, yT, z0);
    g.strokeStyle = lit ? "rgba(190,200,255,0.4)" : "rgba(255,190,130,0.3)";
    g.lineWidth = Math.max(1, n0[2] * 0.02);
    g.beginPath();
    g.moveTo(n0[0], n0[1]);
    g.lineTo(n1[0], n1[1]);
    g.stroke();
    // riser (faces us, in shadow; warm candle light from the newel posts on the low steps)
    const yB = stepY(i);
    quad(g, P, [[-1.7, yT, z0], [1.7, yT, z0], [1.7, yB, z0], [-1.7, yB, z0]]);
    const warm = clamp(1 - i / 6) * (o.warm == null ? 1 : o.warm);
    g.fillStyle = mix("#140810", "#5a2a1a", warm * 0.8);
    g.fill();
    quad(g, P, [[-0.95, yT, z0], [0.95, yT, z0], [0.95, yB, z0], [-0.95, yB, z0]]);
    g.fillStyle = mix("#1e0610", "#6a1a20", warm * 0.8);
    g.fill();
    // brass stair rod
    const r0 = P(-0.95, yB - 0.02, z0 - 0.01), r1 = P(0.95, yB - 0.02, z0 - 0.01);
    g.strokeStyle = "#a07a34";
    g.lineWidth = Math.max(0.8, r0[2] * 0.02);
    g.beginPath();
    g.moveTo(r0[0], r0[1]);
    g.lineTo(r1[0], r1[1]);
    g.stroke();
    if (o.onStep) o.onStep(g, P, i, yT, z0, z1);
  }
  // banisters
  for (const side of [-1, 1]) {
    const X = side * 1.75;
    g.strokeStyle = "#1a0a0a";
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const z = stepZ(i) + RUN * 0.5;
      if (z < cam.z + (o.railNear || 1.1)) continue;
      const a = P(X, stepY(i + 1), z), b = P(X, stepY(i + 1) - 1.0, z);
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
    }
    g.lineWidth = Math.max(1.2, P(X, 0, Math.max(stepZ(3), cam.z + (o.railNear || 1.1) + 1))[2] * 0.035);
    g.stroke();
    // handrail
    const rz0 = Math.max(stepZ(0), cam.z + (o.railNear || 1.1)), ri0 = (rz0 - Z0) / RUN;
    const r0 = P(X, 1.5 - ri0 * RISE - 1.05, rz0), r1 = P(X, stepY(STEPS) - 1.05, stepZ(STEPS));
    g.strokeStyle = "#3a1e14";
    g.lineWidth = Math.max(2, r0[2] * 0.08);
    g.beginPath();
    g.moveTo(r0[0], r0[1]);
    g.lineTo(r1[0], r1[1]);
    g.stroke();
    g.strokeStyle = lit ? "rgba(170,180,255,0.35)" : "rgba(255,190,120,0.3)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(r0[0], r0[1] - 2);
    g.lineTo(r1[0], r1[1] - 2);
    g.stroke();
    if (o.railPosts) {
      // turned newels at both ends, the rail dying into them
      for (const [zz, yy] of [[rz0, 1.5 - ri0 * RISE], [stepZ(STEPS), stepY(STEPS)]]) {
        const top = P(X, yy - 1.18, zz), bot = P(X, yy, zz);
        const w = Math.max(3, top[2] * 0.11);
        const ng = g.createLinearGradient(top[0] - w / 2, 0, top[0] + w / 2, 0);
        ng.addColorStop(0, "#1a0a08");
        ng.addColorStop(0.35, "#5a3020");
        ng.addColorStop(1, "#140806");
        g.fillStyle = ng;
        g.fillRect(top[0] - w / 2, top[1], w, bot[1] - top[1]);
        g.fillStyle = "#4a2818";
        g.fillRect(top[0] - w * 0.7, top[1] - w * 0.35, w * 1.4, w * 0.45);
        g.fillStyle = lit ? "rgba(170,180,255,0.35)" : "rgba(255,190,120,0.35)";
        g.fillRect(top[0] - w * 0.7, top[1] - w * 0.35, w * 1.4, 1);
      }
    }
  }
  // newel post candelabras near the bottom
  if (o.newels !== false) {
    for (const side of [-1, 1]) {
      const b = P(side * 1.75, stepY(0) - 1.2, stepZ(0) + 0.1);
      if (b[2] > 400) continue;
      g.fillStyle = "#1e0c0a";
      g.fillRect(b[0] - b[2] * 0.07, b[1], b[2] * 0.14, H);
      candle(g, b[0], b[1], b[2] * 0.3, t, side * 5, 1, 1);
    }
  }
  if (lit && o.rays !== false) {
    K.godRays(g, winC[0], winC[1], W, H, { color: MOON, count: 9, strength: 0.22 * (o.rayK == null ? 1 : o.rayK), t, angle: o.rayAngle == null ? Math.PI / 2 : o.rayAngle, spread: o.raySpread == null ? 0.75 : o.raySpread, length: H * 1.2, seed: 6 });
  }
  return { P, winC, ww };
}
// the mouse on step 2, in the light
const MOUSE_STEP = 2;
function shot4(g, t, W, H) {
  const p = eio(seg(t, 30, 40));
  const cam = { x: noise(t * 0.3, 7) * 0.02, y: -1.0, z: -1.4, f: 420, cx: W / 2, cy: H * 0.36 };
  const P = proj(cam);
  const m = P(0.18, stepY(MOUSE_STEP + 1), (stepZ(MOUSE_STEP) + stepZ(MOUSE_STEP + 1)) / 2);
  // a slow push that ends framed on the little grey thing in the light
  K.withCamera(g, W, H, { x: lerp(W / 2, m[0], p), y: lerp(H / 2, m[1] - 24, p), zoom: lerp(1.0, 2.3, p), shakeT: t, shakeAmt: 0.8 }, () => {
    staircase(g, t, W, H, cam, {
      rayK: 1.2, raySpread: 0.32,
      onStep: (c, P2, i, yT, z0, z1) => {
        if (i !== MOUSE_STEP) return;
        const q = P2(0.18, yT, (z0 + z1) / 2);
        const L = q[2] * 0.48;
        // the moonlight lands in a tight pool right on it
        c.save();
        c.globalCompositeOperation = "lighter";
        c.translate(q[0] + L * 0.1, q[1] - L * 0.05);
        c.scale(1, 0.3);
        glow(c, 0, 0, L * 2.2, MOON, 0.42);
        glow(c, 0, 0, L * 0.9, "#dfe4ff", 0.3);
        c.restore();
        // contact shadow: dark and tight right under the belly, soft further out
        c.save();
        c.translate(q[0], q[1] + 1);
        c.scale(1, 0.16);
        glow(c, 0, 0, L * 0.75, "#000000", 0.85, "source-over");
        glow(c, 0, 0, L * 0.45, "#000000", 0.6, "source-over");
        c.restore();
        bigMouse(c, q[0], q[1], L, { t, facing: -1, small: true });
      },
    });
    K.dust(g, W, H, t, { seed: 64, count: 50, color: "#dfe4ff", size: 1.3, alpha: 0.45, area: [W * 0.25, 0, W * 0.5, H * 0.9] });
  });
}

// ---- SHOT 5: the toy mouse close-up, your hand picks it up ----------------------------------------------
function feltTexture(w, h) {
  return K.sprite("f06felt2", w, h, (s) => {
    const R = K.rng("felt");
    // matted fibres (short curved hairs in every direction) + pilling
    for (let i = 0; i < 2600; i++) {
      const x = R() * w, y = R() * h, l = 1.5 + R() * 5, a = R() * TAU, bend = (R() - 0.5) * 2;
      s.strokeStyle = R() > 0.5 ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.2)";
      s.lineWidth = 0.5 + R() * 0.4;
      s.beginPath();
      s.moveTo(x, y);
      s.quadraticCurveTo(x + Math.cos(a + bend) * l * 0.5, y + Math.sin(a + bend) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      s.stroke();
    }
    for (let i = 0; i < 90; i++) {
      const x = R() * w, y = R() * h, r = 0.6 + R() * 1.2;
      s.fillStyle = "rgba(230,228,224,0.28)";
      s.beginPath(); s.arc(x, y, r, 0, TAU); s.fill();
    }
  });
}
// big detailed toy mouse: (x, y) = belly contact point, L = body length px, facing -1 = nose left
function bigMouse(g, x, y, L, o = {}) {
  const t = o.t || 0;
  const dangle = o.dangle || 0;
  g.save();
  g.translate(x, y);
  g.rotate(o.rot || 0);
  g.scale((o.facing || -1) * L / 200, L / 200);
  // frayed string tail (behind)
  g.strokeStyle = "#cdbfa6";
  g.lineWidth = 3;
  g.lineCap = "round";
  const sw = Math.sin(t * 1.3) * 6 + dangle * 20;
  const tx = -200 + sw * 0.6, ty = 22 + dangle * 95;
  g.beginPath();
  g.moveTo(-92, -18);
  g.bezierCurveTo(-140, -10, -150 + sw * 0.3, 30 + dangle * 40, tx, ty);
  g.stroke();
  g.lineWidth = 0.8;
  g.strokeStyle = "rgba(225,215,195,0.8)";
  for (let k = 0; k < 7; k++) {
    g.beginPath();
    g.moveTo(tx, ty);
    g.lineTo(tx - 10 - k * 2 + hash(k, 2) * 4, ty - 4 + k * 3);
    g.stroke();
  }
  // body
  const body = new Path2D();
  body.moveTo(-100, 0);
  body.bezierCurveTo(-112, -62, -20, -90, 40, -68);
  body.bezierCurveTo(80, -54, 98, -22, 106, -6);
  body.quadraticCurveTo(110, 3, 96, 5);
  body.lineTo(-88, 5);
  body.closePath();
  const bg = g.createRadialGradient(-6, -64, 6, 0, -30, 132);
  bg.addColorStop(0, "#aaa7a2");
  bg.addColorStop(0.5, "#86837f");
  bg.addColorStop(1, "#3a3836");
  g.fillStyle = bg;
  g.fill(body);
  g.save();
  g.clip(body);
  g.drawImage(feltTexture(220, 100), -110, -95, 220, 100);
  // warm candle fill on the right flank, cool occlusion underneath
  const wf = g.createRadialGradient(80, -20, 4, 80, -20, 90);
  wf.addColorStop(0, "rgba(255,190,120,0.22)");
  wf.addColorStop(1, "rgba(255,190,120,0)");
  g.fillStyle = wf;
  g.fillRect(-120, -100, 240, 110);
  const sh = g.createLinearGradient(0, -90, 0, 6);
  sh.addColorStop(0, "rgba(0,0,0,0)");
  sh.addColorStop(0.55, "rgba(0,0,0,0)");
  sh.addColorStop(1, "rgba(10,4,12,0.62)");
  g.fillStyle = sh;
  g.fillRect(-120, -100, 240, 110);
  // chewed patch: tooth punctures + torn fibres at the rump
  g.fillStyle = "rgba(30,26,24,0.55)";
  for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(-62 + hash(k, 11) * 30, -44 + hash(k, 12) * 24, 1.6, 0, TAU); g.fill(); }
  g.restore();
  // moonlight rim along the top edge (light from behind/above)
  K.crescent(g, body, 4, 8, "#d8deff", 0.55, [-112, -92, 112, 6]);
  // fuzz on the silhouette
  g.strokeStyle = "rgba(200,200,205,0.55)";
  g.lineWidth = 0.7;
  g.beginPath();
  for (let k = 0; k < 70; k++) {
    const u = k / 69;
    const a = Math.PI + u * Math.PI;
    const px = Math.cos(a) * 102, py = -32 + Math.sin(a) * 50 * (u < 0.6 ? 1 : 1 - (u - 0.6) * 1.2);
    const r = 2 + hash(k, 13) * 4;
    g.moveTo(px, py);
    g.lineTo(px + Math.cos(a) * r + (hash(k, 14) - 0.5) * 3, py + Math.sin(a) * r);
  }
  g.stroke();
  // seam stitches along the back
  g.strokeStyle = "rgba(40,38,36,0.7)";
  g.lineWidth = 1.4;
  g.setLineDash([5, 5]);
  g.beginPath();
  g.moveTo(-88, -36);
  g.bezierCurveTo(-60, -78, 20, -86, 72, -48);
  g.stroke();
  g.setLineDash([]);
  // ears: cupped pink felt, the near one chewed (a bite out of its rim)
  const ear = (ex, ey, r, notch) => {
    g.save();
    if (notch) {
      const cp = new Path2D();
      cp.rect(ex - r * 3, ey - r * 3, r * 6, r * 6);
      cp.arc(ex - r * 0.55, ey - r * 0.95, r * 0.34, 0, TAU);
      g.clip(cp, "evenodd");
    }
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.beginPath();
    g.ellipse(ex + 3, ey + 6, r, r * 0.5, -0.3, 0, TAU);
    g.fill();
    const eg = g.createLinearGradient(ex - r, ey - r, ex + r, ey + r);
    eg.addColorStop(0, "#c99a9c");
    eg.addColorStop(1, "#7a5054");
    g.fillStyle = eg;
    g.beginPath();
    g.ellipse(ex, ey, r, r * 1.15, -0.3, 0, TAU);
    g.fill();
    const ig = g.createRadialGradient(ex + r * 0.25, ey + r * 0.35, 1, ex + 2, ey + 2, r * 0.8);
    ig.addColorStop(0, "#a8747a");
    ig.addColorStop(1, "#d8aaae");
    g.fillStyle = ig;
    g.beginPath();
    g.ellipse(ex + 2, ey + 2, r * 0.66, r * 0.82, -0.3, 0, TAU);
    g.fill();
    g.restore();
  };
  ear(54, -72, 16, false);
  ear(28, -78, 20, true);
  // the eye: a little satin-stitched oval of black thread (each stitch catches a sheen), and a
  // loose end of thread hanging from it
  g.lineCap = "round";
  for (let k = 0; k < 5; k++) {
    const ox = 66 + k * 2.4, oy = -45 + Math.abs(k - 2) * 1.3;
    g.strokeStyle = "#151313";
    g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + 1.6, oy + 10 - Math.abs(k - 2) * 2.6); g.stroke();
    g.strokeStyle = "rgba(220,224,240,0.45)";
    g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(ox - 0.4, oy + 1.5); g.lineTo(ox + 0.4, oy + 5); g.stroke();
  }
  g.strokeStyle = "#1a1818";
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(77, -36);
  g.quadraticCurveTo(83, -26, 79 + Math.sin(t * 2) * 2, -14 + dangle * 4);
  g.stroke();
  // nose bead with a glint + whisker threads
  const ng = g.createRadialGradient(102, -9, 0.5, 104, -6, 6);
  ng.addColorStop(0, "#ffd6da");
  ng.addColorStop(1, "#b0606a");
  g.fillStyle = ng;
  g.beginPath();
  g.arc(104, -6, 5.5, 0, TAU);
  g.fill();
  g.strokeStyle = "rgba(30,28,26,0.75)";
  g.lineWidth = 0.8;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    g.moveTo(98, -8 + k * 3);
    g.quadraticCurveTo(118, -14 + k * 6, 136, -12 + k * 10 + dangle * 6);
    g.stroke();
  }
  g.restore();
}
// your hand reaching for the mouse, seen from above and behind: palm down, fingers relaxed and
// gently curled (not splayed), the THUMB leading the approach, knuckles + nails shaded, the warm
// candle bokeh behind it laying a rim of light along its top edge. (x, y) = wrist, s = wrist ->
// fingertip px, ang = the direction the fingers point (screen radians). curl 0 (reaching) .. 1
// (closed round something). o: t, rim {x, y} screen point of the warm light, bell (bool)
function reachHand(g, x, y, s, ang, curl, o = {}) {
  const u = s / 100;
  const SK = "#d9a588", SKD = "#8a5440", SKL = "#f6d2b6";
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.scale(u, u);
  g.lineCap = "round";
  g.lineJoin = "round";
  const all = new Path2D();
  const capsule = (ax, ay, bx, by, w, col) => {
    const nx = -(by - ay), ny = bx - ax, l = Math.hypot(nx, ny) || 1;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const gr = g.createLinearGradient(mx + (nx / l) * w * 0.5, my + (ny / l) * w * 0.5, mx - (nx / l) * w * 0.5, my - (ny / l) * w * 0.5);
    gr.addColorStop(0, shade(col, -0.4));
    gr.addColorStop(0.5, col);
    gr.addColorStop(0.85, mix(col, SKL, 0.45));
    gr.addColorStop(1, shade(col, -0.1));
    g.strokeStyle = gr;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
    const p = new Path2D();
    p.moveTo(ax, ay);
    p.lineTo(bx, by);
    return p;
  };
  const knuck = (kx, ky, r, a) => {
    const kg = g.createRadialGradient(kx, ky - r * 0.3, 0, kx, ky, r);
    kg.addColorStop(0, rgba(SKL, a));
    kg.addColorStop(1, rgba(SKL, 0));
    g.fillStyle = kg;
    g.fillRect(kx - r, ky - r, r * 2, r * 2);
  };
  const crease = (cx, cy, r) => {
    g.strokeStyle = rgba(SKD, 0.55);
    g.lineWidth = 0.6;
    g.beginPath();
    g.arc(cx - r * 0.4, cy, r, -0.9, 0.9);
    g.stroke();
  };
  // ---- sleeve + wrist ----
  const sg = g.createLinearGradient(0, -30, 0, 30);
  sg.addColorStop(0, "#f0c43a");
  sg.addColorStop(0.5, "#c8961c");
  sg.addColorStop(1, "#6a4a08");
  g.fillStyle = sg;
  g.beginPath();
  g.moveTo(4, -30);
  g.bezierCurveTo(-2, -12, -2, 12, 4, 30);
  g.lineTo(-140, 40);
  g.lineTo(-140, -40);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.25)";
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(8, -28); g.bezierCurveTo(2, -10, 2, 10, 8, 28); g.stroke();
  // ---- fingers, far (pinky) to near (index): each knuckle -> 3 phalanges, bending as it curls ----
  const fingers = [[48, 18, 0.78], [54, 6, 0.93], [56, -6, 1], [52, -18, 0.95]];
  const c = clamp(curl);
  for (let f = 0; f < 4; f++) {
    const [kx, ky, k] = fingers[f];
    const lens = [24 * k, 15 * k, 11 * k];
    const w0 = (f === 0 ? 10 : 12) * (0.9 + 0.1 * k);
    let px = kx, py = ky, a = (f - 1.5) * 0.06;
    const col = shade(SK, -0.06 * (3 - f));
    for (let j = 0; j < 3; j++) {
      // from above, a bending finger mostly FORESHORTENS (it curls down, away from us)
      const bend = (0.25 + c * 0.75) * (j === 0 ? 0.5 : 0.9);
      const L = lens[j] * Math.cos(Math.min(1.4, bend * (j + 1) * 0.7));
      a += (f - 1.5) * 0.03 * c;
      const nx = px + Math.cos(a) * L, ny = py + Math.sin(a) * L;
      all.addPath(capsule(px, py, nx, ny, w0 * (1 - j * 0.1), shade(col, -0.12 * j * c)));
      if (j < 2) { knuck(nx, ny, w0 * 0.45, 0.25); crease(nx, ny, w0 * 0.35); }
      px = nx; py = ny;
    }
    // fingernail at the tip (seen while the finger is still fairly straight)
    if (c < 0.75) {
      g.save();
      g.translate(px - 3, py);
      g.rotate(a);
      const ng = g.createLinearGradient(-4, -3, 3, 3);
      ng.addColorStop(0, "#f8e2d8");
      ng.addColorStop(1, "#c8968a");
      g.globalAlpha = 1 - c;
      g.fillStyle = ng;
      g.beginPath();
      g.ellipse(0, 0, 4.2, w0 * 0.3, 0, 0, TAU);
      g.fill();
      g.restore();
    }
  }
  // ---- back of the hand: tendons running to the knuckles, the knuckle ridge ----
  const back = new Path2D();
  K.spline(back, [2, -22, 26, -26, 50, -24, 58, -10, 58, 6, 52, 22, 28, 26, 2, 22, -2, 0], true);
  const bg = g.createLinearGradient(0, -26, 0, 26);
  bg.addColorStop(0, SKL);
  bg.addColorStop(0.4, SK);
  bg.addColorStop(1, shade(SK, -0.35));
  g.fillStyle = bg;
  g.fill(back);
  all.addPath(back);
  g.save();
  g.clip(back);
  g.strokeStyle = rgba(SKL, 0.35);
  g.lineWidth = 2;
  for (const yy of [-16, -4, 8, 18]) { g.beginPath(); g.moveTo(6, yy * 0.6); g.quadraticCurveTo(30, yy * 0.85, 52, yy); g.stroke(); }
  g.strokeStyle = "rgba(110,120,170,0.18)";
  g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(4, 6); g.bezierCurveTo(18, 0, 26, 10, 40, 4); g.stroke();
  g.restore();
  for (const [kx, ky] of fingers) knuck(kx + 2, ky, 7, 0.55);
  // ---- the thumb, leading: out from the side of the hand and forward past the fingers ----
  const tl = 1 - c * 0.45;
  const t0 = [10, -20], t1 = [32, -34], t2 = [32 + 22 * tl, -40 + c * 8], t3 = [32 + 34 * tl, -39 + c * 16];
  all.addPath(capsule(t0[0], t0[1], t1[0], t1[1], 17, SK));
  all.addPath(capsule(t1[0], t1[1], t2[0], t2[1], 14, SK));
  all.addPath(capsule(t2[0], t2[1], t3[0], t3[1], 12.5, shade(SK, 0.04)));
  knuck(t1[0], t1[1], 8, 0.45);
  crease(t2[0], t2[1], 4.5);
  // thumbnail: pale plate, cuticle, a lit rim
  {
    const na = Math.atan2(t3[1] - t2[1], t3[0] - t2[0]);
    g.save();
    g.translate(t3[0] - Math.cos(na) * 3, t3[1] - Math.sin(na) * 3 - 1.5);
    g.rotate(na);
    const ng = g.createLinearGradient(-5, -3, 4, 3);
    ng.addColorStop(0, "#fae6dc");
    ng.addColorStop(1, "#c8968a");
    g.fillStyle = ng;
    g.beginPath(); g.ellipse(0, 0, 5.6, 3.8, 0, 0, TAU); g.fill();
    g.strokeStyle = rgba(SKD, 0.6);
    g.lineWidth = 0.6;
    g.beginPath(); g.arc(-4.2, 0, 3.4, -1.2, 1.2); g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.6)";
    g.beginPath(); g.moveTo(-2, -3.2); g.quadraticCurveTo(2, -3.8, 5, -2); g.stroke();
    g.restore();
  }
  // ---- the bell on its red string round the wrist ----
  if (o.bell) {
    g.strokeStyle = "#a8322e";
    g.lineWidth = 2.4;
    g.beginPath(); g.ellipse(2, 0, 5, 24, 0, -Math.PI / 2, Math.PI / 2); g.stroke();
    K.drawBell(g, 4, 34, 14, { t: o.t || 0, glint: 0.4 });
  }
  // ---- warm rim from the candle bokeh behind, along the top edge of the hand ----
  if (o.rim) {
    // o.rim = {x, y} of the light in screen space; turn it into a direction in hand space
    const la = Math.atan2(o.rim.y - y, o.rim.x - x) - ang;
    K.crescent(g, all, -Math.cos(la) * 3, -Math.sin(la) * 3, "#ffbf6a", 0.85, [-10, -50, 110, 36], "lighter", 2);
  }
  g.restore();
}
function stairBokeh(W, H) {
  return (c) => {
    c.fillStyle = "#0c050c";
    c.fillRect(0, 0, W, H);
    glow(c, W * 0.5, -40, 460, MOON, 0.45);
    for (let i = 0; i < 6; i++) {
      const y = 236 - i * 46, inset = i * 26;
      c.fillStyle = "#24101a";
      c.fillRect(0, y - 24, W, 24);
      c.fillStyle = "#4a1420";
      c.fillRect(W * 0.2 + inset, y - 24, W * 0.6 - inset * 2, 24);
      c.fillStyle = "rgba(170,180,255,0.32)";
      c.fillRect(W * 0.3 + inset, y - 24, W * 0.18 - inset * 0.5, 20);
      c.fillRect(W * 0.52, y - 24, W * 0.18 - inset * 0.5, 20);
      c.fillStyle = "#0a0308";
      c.fillRect(0, y, W, 22);
    }
    c.fillStyle = "#06020a";
    for (let k = 0; k < 4; k++) { c.fillRect(30 + k * 52, 0, 12, 250); c.fillRect(W - 42 - k * 52, 0, 12, 250); }
    c.fillStyle = "rgba(255,190,110,0.55)";
    c.beginPath(); c.arc(110, 120, 22, 0, TAU); c.fill();
    c.beginPath(); c.arc(860, 70, 18, 0, TAU); c.fill();
    glow(c, 110, 120, 120, CANDLE, 0.4);
    glow(c, 860, 70, 100, CANDLE, 0.35);
  };
}
function shot5(g, t, W, H, held) {
  // background: the stairs climbing away, thrown far out of focus
  K.focus(g, W, H, 10, stairBokeh(W, H), "f06bgblur");
  // the tread the mouse sits on (runner carpet with a gold border, brass nosing, riser below)
  const ty = 392;
  const tg = g.createLinearGradient(0, 236, 0, ty);
  tg.addColorStop(0, "rgba(74,20,32,0)");
  tg.addColorStop(0.45, "#4a1420");
  tg.addColorStop(1, "#6a2028");
  g.fillStyle = tg;
  g.fillRect(0, 236, W, ty - 236);
  g.fillStyle = "rgba(0,0,0,0.14)";
  for (let i = 0; i < 360; i++) g.fillRect(hash(i, 8) * W, 290 + hash(i, 9) * 100, 2, 1);
  g.fillStyle = "rgba(200,150,70,0.35)";
  g.fillRect(0, 380, W, 3);
  // moonlight pool on the tread
  g.save();
  g.globalCompositeOperation = "lighter";
  g.translate(480, 362);
  g.scale(1, 0.2);
  glow(g, 0, 0, 400, "#aab4ff", 0.42);
  g.restore();
  const ng = g.createLinearGradient(0, ty - 4, 0, ty + 6);
  ng.addColorStop(0, "#f0d088");
  ng.addColorStop(0.5, "#a07a34");
  ng.addColorStop(1, "#3a2408");
  g.fillStyle = ng;
  g.fillRect(0, ty - 4, W, 10);
  const rg = g.createLinearGradient(0, ty, 0, H);
  rg.addColorStop(0, "#22080e");
  rg.addColorStop(1, "#080205");
  g.fillStyle = rg;
  g.fillRect(0, ty + 6, W, H - ty);
  glow(g, 900, 520, 320, CANDLE, 0.3);
  // hand + mouse
  const reach = eio(seg(t, 42.6, 45.4));
  const grab = smooth(seg(t, 45.2, 45.9));
  const lift = held ? 1 : eio(seg(t, 46.2, 49.6));
  const sc = 1 + 0.18 * lift;
  const gx = lerp(470, 520, lift), gy = lerp(372, 262, lift);
  // contact shadow under the mouse thins as it lifts
  g.save();
  g.translate(470, 374);
  g.scale(1, 0.12);
  glow(g, 0, 0, 130 * (1 + lift * 0.5), "#000000", 0.75 * (1 - lift * 0.85), "source-over");
  g.restore();
  // the hand comes in thumb-first from the lower right, fingers relaxed; as it closes they curl
  // round the far side of the mouse (drawn behind it) while the thumb stays in front
  const handAt = () => {
    const tx = gx + 170 * sc, tyy = gy - 70 * sc;
    return [lerp(1120, tx, reach), lerp(250, tyy, reach), lerp(2.85, 3.02, reach)];
  };
  bigMouse(g, gx, gy, 260 * sc, { t, facing: -1, rot: -0.1 * lift, dangle: lift });
  if (reach > 0) {
    const [wx, wy, ha] = handAt();
    reachHand(g, wx, wy, 230 * sc, ha, 0.12 + grab * 0.55, { t, bell: true, rim: { x: 860, y: 70 } });
  }
  // foreground: the out-of-focus nosing of the step below
  K.focus(g, W, H, 7, (c) => {
    c.fillStyle = "rgba(14,3,8,0.95)";
    c.fillRect(0, H - 36, W, 40);
    c.fillStyle = "rgba(201,160,80,0.55)";
    c.fillRect(0, H - 40, W, 4);
  }, "f06fgblur");
  // the memory: a warm purr bloom at 46
  const purr = K.env(t, 45.8, 48.5, 0.6, 1.6);
  if (purr > 0) glow(g, gx, gy - 40, 280, "#ffcf8a", 0.16 * purr);
}

// ---- SHOT 6: flashback, the kitchen floor ----------------------------------------------------------------
function kitchen(g, t, W, H) {
  // warm morning, seen from cat height: a run of BASE cabinets standing on the floor (countertop lip
  // above, recessed kickboard below, a contact shadow where they meet the boards), sunlit floor.
  // Everything static is baked once into a single sprite; only the god rays move.
  g.drawImage(K.sprite("f06kitchen2", W, H, (c) => {
    const wallG = c.createLinearGradient(0, 0, 0, 112);
    wallG.addColorStop(0, "#c8b89a");
    wallG.addColorStop(1, "#e2d2b0");
    c.fillStyle = wallG;
    c.fillRect(0, 0, W, 112);
    // tiled splashback above the counter
    c.strokeStyle = "rgba(120,100,80,0.35)";
    c.lineWidth = 1;
    c.beginPath();
    for (let y = 20; y < 112; y += 26) { c.moveTo(0, y); c.lineTo(W, y); }
    for (let y = 20, r = 0; y < 112; y += 26, r++) for (let x = (r % 2) * 26; x < W; x += 52) { c.moveTo(x, y); c.lineTo(x, y + 26); }
    c.stroke();
    // countertop: the lip of a thick wooden top, lit along its front edge, its shadow on the doors
    const ct = c.createLinearGradient(0, 100, 0, 128);
    ct.addColorStop(0, "#d8b480");
    ct.addColorStop(0.35, "#a8784a");
    ct.addColorStop(1, "#5a3a1c");
    c.fillStyle = ct;
    c.fillRect(0, 100, W, 26);
    c.fillStyle = "rgba(255,236,200,0.5)";
    c.fillRect(0, 103, W, 2);
    c.fillStyle = "rgba(30,16,6,0.55)";
    c.fillRect(0, 126, W, 5);
    // base cabinet doors with raised panels and brass knobs
    const cab = c.createLinearGradient(0, 128, 0, 250);
    cab.addColorStop(0, "#58705e");
    cab.addColorStop(1, "#7a957f");
    c.fillStyle = cab;
    c.fillRect(0, 128, W, 122);
    const sh = c.createLinearGradient(0, 128, 0, 160);
    sh.addColorStop(0, "rgba(20,14,8,0.45)");
    sh.addColorStop(1, "rgba(20,14,8,0)");
    c.fillStyle = sh;
    c.fillRect(0, 128, W, 32);
    for (let i = 0; i < 6; i++) {
      const x = -40 + i * 190;
      c.strokeStyle = "rgba(20,30,24,0.6)";
      c.lineWidth = 3;
      c.strokeRect(x + 4, 134, 182, 112);
      c.fillStyle = "rgba(255,240,210,0.16)";
      c.fillRect(x + 22, 148, 146, 3);
      c.fillRect(x + 22, 148, 3, 84);
      c.fillStyle = "rgba(0,0,0,0.2)";
      c.fillRect(x + 22, 230, 146, 4);
      c.fillRect(x + 165, 148, 4, 86);
      const kg = c.createRadialGradient(x + 150, 168, 0.5, x + 152, 170, 6);
      kg.addColorStop(0, "#fff0c0");
      kg.addColorStop(1, "#7a5a20");
      c.fillStyle = kg;
      c.beginPath(); c.arc(x + 152, 170, 5, 0, TAU); c.fill();
    }
    // recessed kickboard in deep shadow
    const kb = c.createLinearGradient(0, 248, 0, 270);
    kb.addColorStop(0, "#0e0a08");
    kb.addColorStop(1, "#1c1410");
    c.fillStyle = kb;
    c.fillRect(0, 248, W, 22);
    // floor: warm boards running toward us, staggered joints
    const fg = c.createLinearGradient(0, 270, 0, H);
    fg.addColorStop(0, "#6a4628");
    fg.addColorStop(1, "#8a5a32");
    c.fillStyle = fg;
    c.fillRect(0, 270, W, H - 270);
    c.strokeStyle = "rgba(40,20,6,0.4)";
    c.lineWidth = 1;
    c.beginPath();
    for (let i = -14; i <= 26; i++) { c.moveTo(480 + i * 34, 270); c.lineTo(480 + i * 120, H); }
    for (let i = -14; i <= 26; i++) {
      const v = 0.15 + hash(i, 21) * 0.7, y = 270 + (H - 270) * v;
      const x0 = 480 + i * lerp(34, 120, v), x1 = 480 + (i + 1) * lerp(34, 120, v);
      c.moveTo(x0, y); c.lineTo(x1, y);
    }
    c.stroke();
    // contact shadow where the cabinets meet the floor
    const cs = c.createLinearGradient(0, 270, 0, 300);
    cs.addColorStop(0, "rgba(16,8,2,0.6)");
    cs.addColorStop(1, "rgba(16,8,2,0)");
    c.fillStyle = cs;
    c.fillRect(0, 270, W, 30);
    // the sun: a soft-edged patch on the floor and light washing the cabinets
    K.focus(c, W, H, 7, (d) => {
      d.globalCompositeOperation = "lighter";
      d.fillStyle = "rgba(255,196,120,0.42)";
      d.beginPath();
      d.moveTo(150, 296); d.lineTo(560, 288); d.lineTo(760, H + 10); d.lineTo(70, H + 10);
      d.fill();
      d.fillStyle = "rgba(255,200,130,0.22)";
      d.beginPath();
      d.moveTo(0, 100); d.lineTo(400, 100); d.lineTo(470, 250); d.lineTo(0, 250);
      d.fill();
      d.globalCompositeOperation = "source-over";
      d.fillStyle = "rgba(90,50,20,0.35)";
      d.beginPath();
      d.moveTo(340, 292); d.lineTo(356, 292); d.lineTo(470, H + 10); d.lineTo(440, H + 10);
      d.fill();
    }, "f06sun");
  }), 0, 0, W, H);
  K.godRays(g, -60, -80, W, H, { color: "#ffd9a0", count: 7, strength: 0.22, t, angle: 0.75, spread: 0.5, seed: 9 });
}
function kitchenForeground(g, t, W, H) {
  // an out-of-focus chair leg and the edge of a rug, close to the lens (baked with the blur)
  K.focus(g, W, H, 9, (c) => {
    const lg = c.createLinearGradient(842, 0, 900, 0);
    lg.addColorStop(0, "#3a2210");
    lg.addColorStop(0.4, "#8a5a2a");
    lg.addColorStop(1, "#2a1608");
    c.fillStyle = lg;
    c.fillRect(846, 0, 50, H);
    c.fillStyle = "rgba(160,60,50,0.9)";
    c.fillRect(0, H - 34, 380, 40);
    c.fillStyle = "rgba(230,200,140,0.8)";
    for (let i = 0; i < 20; i++) c.fillRect(i * 19, H - 38, 8, 6);
  }, "f06kfg");
}
// the memory, beat by beat: chase (run) -> crouch + wiggle -> a short hop -> a front paw BATS the
// mouse -> he slides after it on the boards (motion smear, tail up) -> sits with it, push in
const K6 = { run0: 50.4, crouch: 52.3, hop: 52.75, bat: 53.15, slide: 53.45, sit: 54.5 };
function cat6(t) {
  const y0 = 448;
  if (t < K6.crouch) return { x: lerp(-80, 430, eio(seg(t, K6.run0, K6.crouch))), y: y0, pose: "run", phase: t * 2.4 };
  if (t < K6.hop) { const k = seg(t, K6.crouch, K6.hop); return { x: 430 + Math.sin(k * 30) * 1.5, y: y0, pose: "pounce", phase: lerp(0, 0.42, smooth(k * 1.6)) }; }
  if (t < K6.bat) { const k = seg(t, K6.hop, K6.bat); return { x: lerp(430, 515, eio(k)), y: y0 - Math.sin(k * Math.PI) * 26, pose: "run", phase: 0.1 + k * 0.35 }; }
  if (t < K6.slide) return { x: 515, y: y0, pose: "stand", phase: 0, bat: seg(t, K6.bat, K6.slide) };
  if (t < K6.sit) { const k = seg(t, K6.slide, K6.sit); return { x: 515 + 120 * (1 - Math.pow(1 - k, 2.2)), y: y0, pose: "stand", phase: 0, slide: 1 - k }; }
  return { x: 635, y: y0, pose: "sit", phase: 0 };
}
function mouse6(t) {
  if (t < K6.bat + 0.1) return { x: lerp(300, 610, eio(seg(t, 50.4, 53.0))), hop: 1 };
  const k = seg(t, K6.bat + 0.1, K6.sit - 0.1);
  return { x: 610 + 110 * (1 - Math.pow(1 - k, 2.5)), hop: 0, spin: 1 - k };
}
function shot6(g, t, W, H) {
  const C = cat6(t), M = mouse6(t);
  // the emotional beat: a slow push in on him sitting with the mouse (to ~1.4x)
  const z = eio(seg(t, 54.0, 56.0));
  K.withCamera(g, W, H, { x: lerp(W / 2, 690, z), y: lerp(H / 2, 380, z), zoom: lerp(1, 1.4, z) }, () => {
    kitchen(g, t, W, H);
    const my = 440 + (M.hop ? -Math.abs(Math.sin(t * 9)) * 6 : 0);
    g.save();
    g.translate(M.x, 445);
    g.scale(1, 0.15);
    glow(g, 0, 0, 30, "#3a1a08", 0.5, "source-over");
    g.restore();
    g.save();
    g.translate(M.x, my);
    g.rotate((M.spin || 0) * 0.5 * Math.sin(t * 20));
    K.toyMouse(g, 0, 0, 46, { facing: 1 });
    g.restore();
    const opts = (alpha) => ({
      pose: C.pose, phase: C.phase, facing: 1, t, tailUp: C.pose === "sit" ? 0.3 : 1, headTurn: C.pose === "sit" ? 0.35 : 0.1, ears: 1,
      bell: true, collar: true, light: { x: 0, y: 0, color: "#ffe0a8", strength: 1.1 }, ground: "#3a1a08", alpha,
    });
    // motion smear while he slides: faint trailing copies, the floor scuffed behind him
    if (C.slide > 0.05) {
      // paint him once into a layer (in the camera space), then lay faint offset copies behind;
      // only the device-px patch round him is copied, not the whole frame
      const Ls = K.layer(W, H, "f06smear");
      const M = g.getTransform();
      Ls.g.setTransform(M);
      K.drawCat(Ls.g, C.x, C.y, 78, Object.assign(opts(1), { shadow: false }));
      Ls.g.setTransform(1, 0, 0, 1, 0, 0);
      const bx0 = Math.max(0, Math.floor(M.a * (C.x - 110) + M.e)), by0 = Math.max(0, Math.floor(M.d * (C.y - 130) + M.f));
      const bx1 = Math.min(Ls.canvas.width, Math.ceil(M.a * (C.x + 110) + M.e)), by1 = Math.min(Ls.canvas.height, Math.ceil(M.d * (C.y + 12) + M.f));
      if (bx1 > bx0 && by1 > by0) {
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        for (let i = 2; i >= 1; i--) {
          g.globalAlpha = 0.2 * C.slide / i;
          g.drawImage(Ls.canvas, bx0, by0, bx1 - bx0, by1 - by0, bx0 - i * 18 * C.slide * M.a, by0, bx1 - bx0, by1 - by0);
        }
        g.restore();
      }
      g.save();
      g.globalCompositeOperation = "lighter";
      g.translate(C.x - 50, C.y + 2);
      g.scale(1, 0.08);
      glow(g, 0, 0, 90 * C.slide, "#ffd9a0", 0.25);
      g.restore();
    }
    K.drawCat(g, C.x, C.y, 78, opts(1));
    // the bat: his near front paw swipes forward and down onto the mouse
    if (C.bat != null) {
      const k = Math.sin(C.bat * Math.PI);
      const sx = C.x + 78 * 0.62, sy = C.y - 78 * 0.62;
      const px = sx + 30 + k * 34, py = C.y - 10 - k * 26;
      g.lineCap = "round";
      const lg = g.createLinearGradient(sx, sy, px, py);
      lg.addColorStop(0, "#d8892e");
      lg.addColorStop(0.6, "#e8a050");
      lg.addColorStop(1, "#f6efe4");
      g.strokeStyle = lg;
      g.lineWidth = 11;
      g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + 26, sy + 2 - k * 20, px, py); g.stroke();
      g.fillStyle = "#f6efe4";
      g.beginPath(); g.ellipse(px + 3, py + 2, 8, 6, 0.3, 0, TAU); g.fill();
      g.strokeStyle = "rgba(120,90,70,0.5)";
      g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(px + 6, py - 2); g.lineTo(px + 7, py + 5); g.moveTo(px + 2, py - 3); g.lineTo(px + 3, py + 5); g.stroke();
    }
    kitchenForeground(g, t, W, H);
    K.dust(g, W, H, t, { seed: 66, count: 40, color: "#fff0d0", size: 1.5, alpha: 0.5, area: [0, 0, W * 0.6, H] });
  });
}

// ---- SHOT 7: low angle up the stairs, the Shadow in the doorway ---------------------------------------
function shadowCat(g, x, y, s, a, t, W, H) {
  if (a <= 0.01) return;
  const paint = (c, fill) => {
    c.save();
    c.translate(x, y);
    c.scale(0.8, 1.2);
    K.drawCat(c, 0, 0, s, {
      pose: "stand", facing: -1, headTurn: -0.1, t: 3, coat: K.COATS.black, collar: false, bell: false, shadow: false, tail: 0.3,
    });
    c.restore();
    c.save();
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = fill;
    c.fillRect(0, 0, W, H);
    c.restore();
  };
  // edge light: a blurred pale-blue copy behind, then the near-black body on top
  const L = K.layer(W, H, "f06shadow");
  paint(L.g, "#050609");
  const E = K.layer(W, H, "f06shadowE");
  E.g.save();
  E.g.setTransform(1, 0, 0, 1, 0, 0);
  E.g.drawImage(L.canvas, 0, 0);
  E.g.globalCompositeOperation = "source-atop";
  E.g.fillStyle = "#bcd6ff";
  E.g.fillRect(0, 0, E.canvas.width, E.canvas.height);
  E.g.restore();
  g.save();
  g.globalCompositeOperation = "lighter";
  K.dof(g, E.canvas, 2.2, 0.75 * a);
  g.restore();
  g.save();
  g.globalAlpha = a;
  g.drawImage(L.canvas, 0, 0, W, H);
  g.restore();
  // smoky edges drifting up off the silhouette
  for (let i = 0; i < 10; i++) {
    const k = hash(i, 4);
    const rise = (t * 8 + i * 9) % 36;
    glow(g, x + (k - 0.5) * s * 1.4, y - s * (0.6 + hash(i, 5) * 0.9) - rise, s * 0.2, "#050609", 0.3 * a * (1 - rise / 36), "source-over");
  }
}
function shot7(g, t, W, H) {
  const p = eio(seg(t, 58, 66));
  const ci = 5;
  const cam = { x: noise(t * 0.25, 9) * 0.03, y: stepY(ci) - 0.14, z: stepZ(ci) - 1.5 + p * 0.5, f: 470, cx: W / 2, cy: H * 0.76 };
  const shadowA = smooth(seg(t, 59.6, 60.2)) * (1 - smooth(seg(t, 62.8, 63.3)));
  let doorC = [W / 2, H * 0.3];
  K.withCamera(g, W, H, { shakeT: t, shakeAmt: 0.8 }, () => {
    const st = staircase(g, t, W, H, cam, {
      top: "door", warm: 0.4, rays: false, backDepth: 1.3, newels: false, railNear: 2.6, railPosts: true,
      inDoor: (c, P, win, w0, w1) => {
        const base = P(0.08, win.y1, win.z - 0.05);
        shadowCat(c, base[0], base[1], (w1[1] - w0[1]) * 0.36, shadowA, t, W, H);
      },
      onStep: (c, P, i, yT, z0, z1) => {
        // Biscuit's amber pawprints going up the middle of the runner; only his
        {
          const sd = i % 2 ? 1 : -1;
          const appear = 58.3 + (STEPS - i) * 0.2;
          const a = clamp((t - appear) * 2) * lerp(0.95, 0.3, i / STEPS);
          if (a > 0) {
            const q = P(0.02 + 0.055 * sd, yT, lerp(z0, z1, 0.5));
            K.pawprints(c, [{ x: q[0], y: q[1], a: 0, s: Math.max(3, q[2] * 0.08), alpha: a, flat: 0.34 }], 1.15);
          }
        }
      },
    });
    doorC = st.winC;
    // warm door light spilling down the stairs, dust turning in it
    K.godRays(g, doorC[0], doorC[1] + 30, W, H, { color: "#ffcf8a", count: 7, strength: 0.14, t, angle: Math.PI / 2, spread: 0.6, length: H * 0.9, seed: 4 });
    K.dust(g, W, H, t, { seed: 67, count: 40, color: "#ffe2b0", size: 1.3, alpha: 0.45, area: [W * 0.3, 0, W * 0.4, H * 0.8] });
  });
}

// ---- assembly ---------------------------------------------------------------------------------------
function frame(g, t, W, H) {
  if (t < 10) {
    shot1(g, t, W, H);
    K.finish(g, W, H, t, { bloom: 0.22, tint: "#6a3a5a", tintAlpha: 0.2, vignette: 0.62, grain: 0.055 });
    const ta = K.env(t, 1.0, 5.5, 1.5, 1.0);
    if (ta > 0) K.title(g, W, H, "The Toy Mouse", "Chapter 6", ta, { size: 54, y: H * 0.44 });
    K.fadeBlack(g, W, H, 1 - smooth(seg(t, 0, 1.4)));
  } else if (t < 20) {
    shot2(g, t, W, H);
    K.finish(g, W, H, t, { bloom: 0.3, tint: "#6a3a5a", tintAlpha: 0.18, vignette: 0.6, grain: 0.055 });
  } else if (t < 30) {
    shot3(g, t, W, H);
    K.finish(g, W, H, t, { bloom: 0.4, tint: "#4a3a6a", tintAlpha: 0.18, vignette: 0.6, grain: 0.055 });
  } else if (t < 40) {
    shot4(g, t, W, H);
    K.finish(g, W, H, t, { bloom: 0.4, tint: "#3a3a7a", tintAlpha: 0.2, vignette: 0.62, grain: 0.055 });
  } else if (t < 50) {
    shot5(g, t, W, H, false);
    K.finish(g, W, H, t, { bloom: 0.35, tint: "#4a3a6a", tintAlpha: 0.16, vignette: 0.6, grain: 0.05 });
  } else if (t < 56.2) {
    // cross-fade into the warm memory, hold it ~4.6 s, cross-fade back to the present
    const into = smooth(seg(t, 50, 50.8)), back = smooth(seg(t, 55.4, 56.2));
    if (into < 1 || back > 0) {
      shot5(g, back > 0 ? 50 : Math.min(t, 49.99), W, H, true);
      K.finish(g, W, H, t, { bloom: 0.3, tint: "#4a3a6a", tintAlpha: 0.16, vignette: 0.6, grain: 0.05, letterbox: false });
    }
    dissolve(g, W, H, into * (1 - back), "f06mix", (c) => {
      shot6(c, t, W, H);
      K.grade(c, W, H, { tint: "#ffcf8a", alpha: 0.22, mode: "soft-light" });
      K.bloom(c, 0.35);
      K.vignette(c, W, H, 0.7, "#3a2210");
      K.grain(c, W, H, t, 0.06);
    });
    K.letterbox(g, W, H, 1);
  } else if (t < 58) {
    shot5(g, 50 + (t - 56.2) * 0.2, W, H, true);
    K.finish(g, W, H, t, { bloom: 0.35, tint: "#4a3a6a", tintAlpha: 0.16, vignette: 0.6, grain: 0.05 });
  } else {
    shot7(g, t, W, H);
    K.finish(g, W, H, t, { bloom: 0.45, tint: "#6a3a5a", tintAlpha: 0.18, vignette: 0.65, grain: 0.055 });
    K.fadeBlack(g, W, H, smooth(seg(t, 64.2, 66)));
  }
}

export const film = {
  id: 6,
  title: "The Toy Mouse",
  chapter: "Chapter 6",
  unlockAt: 30,
  duration: D,
  poster: 46,
  tagline: "He left you something.",
  subs: [
    [2.5, 6.5, "Inside, a thousand candles. And no one."],
    [11.0, 15.0, "The paintings were watching you."],
    [21.0, 24.5, "A ghost. Trying very hard."],
    [25.5, 29.0, "It was not very good at haunting."],
    [33.0, 37.5, "Something on the stairs. Something small."],
    [42.0, 46.0, "His toy mouse. The one he loved."],
    [51.0, 55.5, "He carried it everywhere."],
    [56.0, 58.0, "He left it for you."],
    [60.0, 64.5, "The shadow left no pawprints at all."],
  ],
  voice: [
    [2.5, "Inside, a thousand candles. And no one.", { rate: 0.92, pitch: 1.0 }],
    [11.0, "The paintings were watching you.", { rate: 0.92, pitch: 1.0 }],
    [21.0, "A ghost. Trying very hard.", { rate: 1.0, pitch: 1.1 }],
    [25.5, "It was not very good at haunting.", { rate: 1.0, pitch: 1.1 }],
    [33.0, "Something on the stairs. Something small.", { rate: 0.92, pitch: 1.0 }],
    [42.0, "His toy mouse. The one he loved.", { rate: 0.92, pitch: 1.0 }],
    [51.0, "He carried it everywhere.", { rate: 0.88, pitch: 1.0 }],
    [56.0, "He left it for you.", { rate: 0.92, pitch: 1.0 }],
    [60.0, "The shadow left no pawprints at all.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: { mood: "mystery", key: "D", bpm: 70, cues: [[12, "hit"], [26, "swell"], [38, "drop"], [46, "purr"], [60, "swell"]] },
  draw(g, t, W, H) {
    t = clamp(t, 0, D);
    const sx = W / 960, sy = H / 540;
    g.save();
    if (sx !== 1 || sy !== 1) g.scale(sx, sy);
    try { frame(g, t, 960, 540); } finally { g.restore(); }
  },
};
