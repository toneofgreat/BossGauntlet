// src/games/cats/scripts/filmcattex.js - cached textures for drawCat v2 (imported only by filmcat.js).
//
// Every texture here is painted ONCE (deterministic, seeded) into an offscreen canvas and reused on
// every frame: per-frame work in drawCat is only pattern fills / drawImage of these canvases.
//
//   furTile(level)       neutral-grey (128) tileable fur: clumped guard hairs, dark crevices between
//                        clumps, low-frequency mottling. Drawn with the 'overlay' blend so it only adds
//                        strand contrast to whatever colour is under it. level 0 = 128 px, 1 = 64 px mip.
//   radialFur()          the same strands radiating from a centre (the face: fur flows back from the nose).
//   irisSprite(a, b)     a photographic iris disc: radial fibres, crypts, collarette, limbal ring.

import { TAU, rng, makeCanvas, mix, rgba, isCpuMode, ctx2d } from "./filmcore.js";

const CACHE = new Map();
function cached(key, w, h, paint) {
  if (isCpuMode()) key += "#cpu"; // probes draw from CPU-backed copies (see filmcore cpuMode)
  let c = CACHE.get(key);
  if (c) return c;
  if (CACHE.size > 96) CACHE.clear();
  c = makeCanvas(w, h);
  const g = ctx2d(c);
  try { paint(g, w, h); } catch (err) { console.warn("[filmcat] texture failed", key, err); }
  CACHE.set(key, c);
  return c;
}

// one tapered strand: a fat root half and a thin tip half (canvas strokes cannot taper)
function strand(g, x, y, a, len, bend, w) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const ex = x + ca * len, ey = y + sa * len;
  const mx = x + ca * len * 0.5 - sa * bend, my = y + sa * len * 0.5 + ca * bend;
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo((x + mx) / 2 - sa * bend * 0.3, (y + my) / 2 + ca * bend * 0.3, mx, my);
  g.stroke();
  g.lineWidth = w * 0.55;
  g.beginPath();
  g.moveTo(mx, my);
  g.quadraticCurveTo((mx + ex) / 2 - sa * bend * 0.2, (my + ey) / 2 + ca * bend * 0.2, ex, ey);
  g.stroke();
}

function paintFur(g, W, H, seed) {
  g.fillStyle = "rgb(128,128,128)";
  g.fillRect(0, 0, W, H);
  const R = rng(seed);
  const wrap = (fn) => { for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) { g.save(); g.translate(dx, dy); fn(); g.restore(); } };
  // 1) low-frequency mottling (multi-scale detail: the coat is never one flat value)
  for (let i = 0; i < 34; i++) {
    const x = R() * W, y = R() * H, r = 8 + R() * 26, v = R() < 0.5 ? 255 : 0, a = 0.05 + R() * 0.06;
    wrap(() => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${v},${v},${v},${a})`);
      gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    });
  }
  g.lineCap = "round";
  // 2) dark crevices between clumps (the undercoat showing through)
  for (let i = 0; i < 150; i++) {
    const x = R() * W, y = R() * H, a = (R() - 0.5) * 0.3, len = 9 + R() * 12, v = 10 + R() * 40;
    g.strokeStyle = `rgba(${v | 0},${(v * 0.9) | 0},${(v * 0.8) | 0},${0.22 + R() * 0.26})`;
    wrap(() => strand(g, x, y, a, len, (R() - 0.5) * 2, 1.1 + R() * 0.9));
  }
  // 3) clumps of guard hairs: strands that share a root area and direction, tips catching light
  for (let c = 0; c < 150; c++) {
    const cx = R() * W, cy = R() * H, a0 = (R() - 0.5) * 0.32, n = 3 + ((R() * 6) | 0), lit = R();
    const bend = (R() - 0.5) * 3;
    for (let i = 0; i < n; i++) {
      const x = cx + (R() - 0.5) * 5, y = cy + (R() - 0.5) * 3;
      const v = lit < 0.62 ? 150 + R() * 60 : 60 + R() * 40;
      g.strokeStyle = `rgba(${v | 0},${v | 0},${v | 0},${0.2 + R() * 0.3})`;
      const a = a0 + (R() - 0.5) * 0.16, len = 7 + R() * 9;
      wrap(() => strand(g, x, y, a, len, bend + (R() - 0.5), 0.7 + R() * 0.7));
    }
  }
  // 4) a sprinkle of single bright tips (specular sheen on the guard hairs)
  for (let i = 0; i < 90; i++) {
    const x = R() * W, y = R() * H, a = (R() - 0.5) * 0.3;
    g.strokeStyle = `rgba(235,232,225,${0.15 + R() * 0.25})`;
    wrap(() => strand(g, x, y, a, 4 + R() * 5, 0, 0.6));
  }
}

export function furTile(level = 0) {
  const base = cached("fur0", 128, 128, (g, W, H) => paintFur(g, W, H, "biscuit-fur"));
  if (!level) return base;
  return cached("fur1", 64, 64, (g) => {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(base, 0, 0, 64, 64);
  });
}

// strands radiating from the centre: fur flowing back from the nose over the face
export function radialFur() {
  return cached("furR", 256, 256, (g, W, H) => {
    g.fillStyle = "rgb(128,128,128)";
    g.fillRect(0, 0, W, H);
    const R = rng("biscuit-face");
    g.lineCap = "round";
    const cx = W / 2, cy = H / 2;
    for (let i = 0; i < 2600; i++) {
      const r = 6 + Math.pow(R(), 0.8) * 124;
      const th = R() * TAU;
      const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r;
      const a = th + 0.18 + (R() - 0.5) * 0.25;
      const len = (3 + R() * 5) * (0.5 + r / 128);
      const dark = R() < 0.38;
      const v = dark ? 30 + R() * 50 : 180 + R() * 75;
      g.strokeStyle = `rgba(${v | 0},${v | 0},${v | 0},${0.2 + R() * 0.35})`;
      strand(g, x, y, a, len, (R() - 0.5) * 1.2, 0.6 + R() * 0.7);
    }
    // keep the very centre (nose leather) neutral
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 14);
    gr.addColorStop(0, "rgb(128,128,128)");
    gr.addColorStop(1, "rgba(128,128,128,0)");
    g.fillStyle = gr;
    g.fillRect(cx - 14, cy - 14, 28, 28);
  });
}

// A photographic iris, 128 px, centred, radius 63. The pupil is painted per frame on top.
export function irisSprite(iris, inner, liner = "#1a1008") {
  return cached("iris:" + iris + ":" + inner, 128, 128, (g) => {
    const c = 64, r = 63;
    const R = rng("iris" + iris + inner);
    g.save();
    g.beginPath();
    g.arc(c, c, r, 0, TAU);
    g.clip();
    const gr = g.createRadialGradient(c, c, 0, c, c, r);
    gr.addColorStop(0, mix(inner, "#3a2a10", 0.35));
    gr.addColorStop(0.2, inner);
    gr.addColorStop(0.42, mix(inner, iris, 0.55));
    gr.addColorStop(0.72, iris);
    gr.addColorStop(0.88, mix(iris, "#101808", 0.45));
    gr.addColorStop(1, mix(iris, liner, 0.85));
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    // radial fibres (stroma), light and dark, slightly wavy
    g.lineCap = "round";
    for (let i = 0; i < 420; i++) {
      const a = R() * TAU, r0 = r * (0.18 + R() * 0.2), r1 = r * (0.55 + R() * 0.42);
      const w = (R() - 0.5) * 0.08;
      const light = R() < 0.55;
      g.strokeStyle = light ? rgba(mix(inner, "#fffbe6", 0.45), 0.12 + R() * 0.2) : rgba(mix(iris, "#0a0c04", 0.6), 0.1 + R() * 0.2);
      g.lineWidth = 0.5 + R() * 1.1;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      g.quadraticCurveTo(c + Math.cos(a + w) * (r0 + r1) / 2, c + Math.sin(a + w) * (r0 + r1) / 2, c + Math.cos(a + w * 2) * r1, c + Math.sin(a + w * 2) * r1);
      g.stroke();
    }
    // crypts: small dark lacunae in the mid iris
    for (let i = 0; i < 26; i++) {
      const a = R() * TAU, rr = r * (0.4 + R() * 0.35);
      g.fillStyle = rgba(mix(iris, "#0a0802", 0.7), 0.25 + R() * 0.25);
      g.beginPath();
      g.ellipse(c + Math.cos(a) * rr, c + Math.sin(a) * rr, 1.2 + R() * 2.6, 0.8 + R() * 1.2, a, 0, TAU);
      g.fill();
    }
    // collarette: a bright wavy ring around the pupil zone
    g.strokeStyle = rgba(mix(inner, "#fff4c0", 0.35), 0.5);
    g.lineWidth = 2.2;
    g.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * TAU, rr = r * (0.36 + Math.sin(a * 9) * 0.025 + Math.sin(a * 23) * 0.012);
      if (i) g.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr); else g.moveTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
    }
    g.stroke();
    // limbal ring: the dark edge of the iris, soft inside
    const lr = g.createRadialGradient(c, c, r * 0.8, c, c, r);
    lr.addColorStop(0, rgba(liner, 0));
    lr.addColorStop(0.7, rgba(liner, 0.35));
    lr.addColorStop(1, rgba(liner, 0.85));
    g.fillStyle = lr;
    g.fillRect(0, 0, 128, 128);
    g.restore();
  });
}

// a soft round "dab" (white core -> transparent), for cheap soft-edged blobs via drawImage
export function softDot() {
  return cached("dot", 64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.5, "rgba(255,255,255,0.6)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}
