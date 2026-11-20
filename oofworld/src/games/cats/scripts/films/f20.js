// films/f20.js - Finale "Home" (FILMS.md f20). Sunrise at The End Of Cats: a pale hill, mist in the valleys,
// and Biscuit sitting at the top, facing the sun. You run to him; he headbutts your hand; you tie his bell back
// on. A hundred cats watch; Sir Whiskers rests in the gold light. Through the paw ring, home: the garden after
// the rain, and the bedroom at dawn, Biscuit asleep on the quilt beside you. THE END.
//
// Photographic pass: every shot is lit by ONE motivated source (the low sun behind the hill, or the dawn
// window), so subjects are back-lit with a rim and a cool sky-fill shadow side; surfaces are textured
// (perspective turf, granite, PVC, quilted cotton, plaster), far planes are hazed toward the sun, and the
// close shots use a shallow depth of field with out-of-focus foreground occluders. Static sets are baked once
// into cached sprites (keys never contain t); only characters, light, mist and motes are drawn per frame.
// Bloom, halation, grain, vignette and the grade are left to the GPU lens (film.grade / film.gradeAt).
// draw(g, t, W, H) is a pure function of t.
import * as K from "../filmkit.js";
import { inLayer, put, soft, catBack, stoneRing, lines, bell, CROWD } from "./lib1820.js";

const D = 80;
const TAU = Math.PI * 2;
const M = 64; // margin baked around static sets so the handheld camera never shows an edge

// ---- palette (FILMS.md f20) -------------------------------------------------------------------------------------
const SUN = "#ffd27a";
const SUNLIGHT = { color: "#ffd9a0", strength: 1.6 };
const SKYFILL = "#3a4058"; // shadow side lit by the pre-dawn sky
const OLD = { base: "#d9995a", light: "#f2c890", dark: "#a8683a", stripe: "#8a4a1c", tip: "#7a3a10", belly: "#f6e6cc", white: "#fbf6ee", bib: true, socks: "all", muzzle: true, stripeAlpha: 0.55, iris: "#c8b04a", irisInner: "#f0d27a", bentEar: false };

// skies, from the blue hour to the sun clear of the horizon: a real dawn sky is blue overhead, pale and almost
// colourless half way down, and only warm in a band along the horizon (no pink wash over everything)
const SKY = {
  pre: { top: "#2e4274", mid: "#8c98b8", bottom: "#f2c08c", sunColor: "#ffb070", haze: 0.9 },
  dawn: { top: "#34508a", mid: "#a4b0c8", bottom: "#f8cc94", sunColor: "#ffbe7a", haze: 0.95 },
  day: { top: "#3e5c98", mid: "#b4bccc", bottom: "#fad4a0", sunColor: "#ffcc88", haze: 1 },
};
// the sun as a lens sees it: a hard, slightly flattened disc (reddened and squashed by refraction near the
// horizon), a tight bright aureole and a broad warm forward-scatter glow. No painted rays: the lens blooms it.
function sunDisc(g, x, y, r, hz, o = {}) {
  const red = K.clamp(1 - (hz - y) / (r * 5));
  const k = o.glow == null ? 1 : o.glow;
  K.glow(g, x, y, r * 26, K.mix("#ffb070", "#ff8040", red), 0.12 * k);
  K.glow(g, x, y, r * 8, K.mix("#ffcc90", "#ff9858", red), 0.2 * k);
  K.glow(g, x, y, r * 2.2, "#fff6e0", 0.5 * k);
  g.save();
  g.beginPath();
  g.ellipse(x, y, r, r * (1 - 0.12 * red), 0, 0, TAU);
  const dg = g.createRadialGradient(x, y, 0, x, y, r);
  dg.addColorStop(0, "#ffffff");
  dg.addColorStop(0.75, K.mix("#fffbee", "#ffe2b0", red));
  dg.addColorStop(1, K.mix("#ffeec8", "#ffb070", red));
  g.fillStyle = dg;
  g.fill();
  // the disc burns: drawn twice additively so its core clips past the sky around it
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = 0.8;
  g.fill();
  g.restore();
}

/// ---- cached-set helpers -------------------------------------------------------------------------------------------
// The film's big static sets live in their own small LRU cache (the kit's shared sprite cache clears itself
// wholesale when it fills with small sprites, which would re-bake a whole hill in the middle of a shot).
// own(key, w, h, scale, paint): a canvas of w x h logical units at pixelScale * scale, painted once.
const OWN = new Map();
const OWN_CAP = 34;
let warmBudget = 0;
const WARM_STOP = { warm: 1 };
function own(key, w, h, scale, paint) {
  const px = K.pixelScale() * scale;
  const k = key + "@" + px + ":" + w + "x" + h;
  let c = OWN.get(k);
  if (c) { OWN.delete(k); OWN.set(k, c); return c; }
  while (OWN.size >= OWN_CAP) OWN.delete(OWN.keys().next().value);
  c = K.makeCanvas(Math.ceil(w * px), Math.ceil(h * px));
  const s = c.getContext("2d");
  s.setTransform(px, 0, 0, px, 0, 0);
  try { paint(s); } catch (err) { console.warn("[f20] bake failed", key, err); }
  c.lw = w; c.lh = h;
  OWN.set(k, c);
  // while warming ahead, one bake per frame: stop the probe here (the bake is kept)
  if (warmBudget > 0 && --warmBudget === 0) throw WARM_STOP;
  return c;
}
const ownHas = (key, scale = 1) => { const px = K.pixelScale() * scale; for (const k of OWN.keys()) if (k.startsWith(key + "@" + px + ":")) return true; return false; };
// a static world-space set with a margin, painted once
function wide(key, W, H, paint) {
  return own("f20w:" + key, W + 2 * M, H + 2 * M, 1, (s) => { s.translate(M, M); paint(s); });
}
// the same, but baked through the lens blur (out-of-focus planes)
function wideBlur(key, W, H, blur, paint) {
  return own("f20wb:" + key, W + 2 * M, H + 2 * M, 1, (s) => {
    const L = K.layer(W + 2 * M, H + 2 * M, "f20bake");
    L.g.translate(M, M);
    paint(L.g);
    s.setTransform(K.pixelScale(), 0, 0, K.pixelScale(), 0, 0);
    K.dof(s, L.canvas, blur);
  });
}
// a bank of valley mist: soft-edged, lumpy, brighter and warmer along its top toward the sun, cooler beneath.
// Baked per pixel at half resolution; drawn per frame with a slow drift (no per-frame pixel work).
function mistSprite(key, W, h, sunX, o = {}) {
  const w = W + 2 * M + 120;
  const q = 2;
  return K.texBake("f20mist:" + key, Math.ceil(w / q), Math.ceil(h * 2 / q), (u, v, out) => {
    const x = u * w;
    const n = 0.5 + 0.5 * K.texFbm(u * 7, v * 2.2, 90 + (o.seed || 0), 4);
    const n2 = 0.5 + 0.5 * K.texFbm(u * 19, v * 5, 95 + (o.seed || 0), 3);
    const top = 0.18 + 0.22 * K.texFbm(u * 3, 0.5, 97 + (o.seed || 0), 3); // the ragged top edge
    const prof = K.smooth(K.clamp((v - top) / 0.22)) * (1 - K.smooth(K.clamp((v - 0.62) / 0.36)));
    const a = prof * K.clamp((n * 0.75 + n2 * 0.35) * 1.5 - 0.35);
    const sunK = Math.exp(-Math.pow((x - sunX - M - 60) / (w * 0.28), 2));
    const lit = K.clamp(1 - (v - top) / 0.35) * (0.35 + 0.65 * sunK);
    out[0] = K.lerp(196, 255, lit); out[1] = K.lerp(198, 232, lit); out[2] = K.lerp(212, 196, lit);
    out[3] = 255 * a * (o.alpha == null ? 1 : o.alpha);
  });
}
// mist(g, W, key, y, h, sunX, t, o): a mist bank centred on y, h deep, drifting with t (seconds into the shot)
function mist(g, W, key, y, h, sunX, t, o = {}) {
  const spr = mistSprite(key, W, h, sunX, o);
  g.save();
  g.globalAlpha *= o.alpha == null ? 0.8 : o.alpha;
  g.drawImage(spr, -M - 60 - t * (o.speed || 2.5), y - h, W + 2 * M + 120, h * 2);
  g.restore();
}

const putWide = (g, spr, W, H, a = 1) => {
  if (a <= 0.002) return;
  g.save(); g.globalAlpha *= a; g.drawImage(spr, -M, -M, W + 2 * M, H + 2 * M); g.restore();
};
// kit painters that fill 0..W, widened to cover the margin
function skyWide(g, W, H, hz, sun, o = {}) {
  g.save();
  g.translate(-M, -M);
  K.sky(g, W + 2 * M, H + 2 * M, {
    top: o.top || "#566ca8", mid: o.mid || "#c4a0b8", bottom: o.bottom || "#ffc890",
    horizon: (hz + M) / (H + 2 * M), sun: { x: sun.x + M, y: sun.y + M, color: o.sunColor || "#ffbc74" }, haze: o.haze == null ? 1 : o.haze,
  });
  g.restore();
}
function fogWide(g, W, H, o) {
  g.save(); g.translate(-M, 0);
  K.fog(g, W + 2 * M, H, o);
  g.restore();
}
function hillsWide(g, W, H, o) {
  g.save(); g.translate(-M, 0);
  const sun = o.sun ? { x: o.sun.x + M, y: o.sun.y } : undefined;
  K.hills(g, W + 2 * M, H + M, { ...o, sun });
  g.restore();
}


// ---- a real hand -----------------------------------------------------------------------------------------------
// Local frame: wrist crease at (0, 0), fingers toward +x, the back of the hand toward -y, units = hand length / 100.
// view "side": seen from the thumb side (index nearest, the other three fingers staggered behind it, the thumb in
// front); view "back": the back of the hand (four fingers side by side curling away, knuckles). L = [lx, ly] unit
// vector toward the light in LOCAL units; sss 0..1 = how much light shines through the thin parts (back-lit).
const SKIN2 = { base: "#c48a72", lite: "#efc0a2", red: "#c86a5a", sss: "#ff5a30", bounce: "#e0904a" };
function chain(x, y, a, segs) {
  const pts = [[x, y, a]];
  let ang = a;
  for (const [len, bend] of segs) { ang += bend; x += Math.cos(ang) * len; y += Math.sin(ang) * len; pts.push([x, y, ang]); }
  return pts;
}
// a finger: thicker over the knuckles, slimmer between them, a rounded pad at the tip
function fingerPath2(pts, w0, w1, start = 0) {
  const p = new Path2D();
  const flat = [], ws = [];
  const n = pts.length;
  for (let i = start; i < n; i++) {
    flat.push(pts[i][0], pts[i][1]);
    const w = K.lerp(w0, w1, i / (n - 1));
    ws.push(i === n - 1 ? w * 0.92 : w * 1.04);
    if (i < n - 1) {
      flat.push((pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
      ws.push(K.lerp(w0, w1, (i + 0.5) / (n - 1)) * 0.93);
    }
  }
  K.tube(p, flat, ws, 4, true, true);
  return p;
}
function shadePart(g, P, box, L, w, o, sssK, rimK = 1) {
  // form: the turning-away side darkens (core shadow), the light side wraps bright
  K.crescent(g, P, L[0] * w * 0.6, L[1] * w * 0.6, o.shadow, 0.42, box, "source-over", 5);
  // subsurface: thin skin glows red-orange just inside the lit silhouette, then the hot rim itself
  K.crescent(g, P, -L[0] * w * 0.38, -L[1] * w * 0.38, SKIN2.sss, 0.42 * sssK, box, "lighter", 5);
  K.crescent(g, P, -L[0] * w * 0.09, -L[1] * w * 0.09, o.rim, 0.7 * o.rimK * rimK, box, "lighter", 2);
}
function creases(g, pts, w, side, alpha) {
  g.save();
  g.lineCap = "round";
  for (let j = 1; j < pts.length - 1; j++) {
    const [x, y] = pts[j];
    const a = (pts[j][2] + pts[j + 1][2]) / 2;
    const nx = -Math.sin(a), ny = Math.cos(a); // +normal = palm side
    const tx = Math.cos(a), ty = Math.sin(a);
    const ww = (w * (1 - j * 0.1)) / 2;
    if (side === 0) {
      // seen from the back: wrinkles across the knuckle
      for (let k = -1; k <= 1; k++) {
        const off = k * ww * 0.22, cx = x + tx * off, cy = y + ty * off;
        g.strokeStyle = "rgba(96,40,30," + alpha * (k === 0 ? 0.4 : 0.22) + ")";
        g.lineWidth = Math.max(0.4, ww * 0.07);
        g.beginPath();
        g.moveTo(cx - nx * ww * 0.55, cy - ny * ww * 0.55);
        g.quadraticCurveTo(cx - tx * ww * 0.14, cy - ty * ww * 0.14, cx + nx * ww * 0.55, cy + ny * ww * 0.55);
        g.stroke();
      }
      continue;
    }
    // dorsal: fine wrinkles over the joint
    for (let k = -1; k <= 1; k++) {
      const off = k * ww * 0.2, cx = x + tx * off, cy = y + ty * off;
      g.strokeStyle = "rgba(96,40,30," + alpha * (k === 0 ? 0.42 : 0.24) + ")";
      g.lineWidth = Math.max(0.4, ww * 0.07);
      g.beginPath();
      g.moveTo(cx - nx * ww * 0.92, cy - ny * ww * 0.92);
      g.quadraticCurveTo(cx - nx * ww * 0.55 + tx * ww * 0.1, cy - ny * ww * 0.55 + ty * ww * 0.1, cx - nx * ww * 0.3, cy - ny * ww * 0.3);
      g.stroke();
    }
    // palm side: a flexion fold pinching into the outline
    g.strokeStyle = "rgba(70,24,18," + alpha * 0.55 + ")";
    g.lineWidth = Math.max(0.5, ww * 0.1);
    g.beginPath();
    g.moveTo(x + nx * ww * 1.0, y + ny * ww * 1.0);
    g.quadraticCurveTo(x + nx * ww * 0.75 - tx * ww * 0.08, y + ny * ww * 0.75 - ty * ww * 0.08, x + nx * ww * 0.5, y + ny * ww * 0.5);
    g.stroke();
  }
  g.restore();
}
function nail(g, pts, w) {
  const n = pts.length;
  const [x1, y1, a] = pts[n - 1];
  const [x0, y0] = pts[n - 2];
  const tx = Math.cos(a), ty = Math.sin(a), nx = -Math.sin(a), ny = Math.cos(a);
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ww = w / 2;
  // the nail plate rides on the dorsal side of the last bone: from the side, a thin curved sliver
  const bx = x0 + tx * len * 0.35 - nx * ww * 0.95, by = y0 + ty * len * 0.35 - ny * ww * 0.95;
  const ex = x1 + tx * ww * 0.5 - nx * ww * 0.5, ey = y1 + ty * ww * 0.5 - ny * ww * 0.5;
  const p = new Path2D();
  p.moveTo(bx, by);
  p.quadraticCurveTo((bx + ex) / 2 - nx * ww * 0.22, (by + ey) / 2 - ny * ww * 0.22, ex, ey);
  p.quadraticCurveTo((bx + ex) / 2 + nx * ww * 0.12, (by + ey) / 2 + ny * ww * 0.12, bx + nx * ww * 0.28, by + ny * ww * 0.28);
  p.closePath();
  g.fillStyle = "rgba(236,190,176,0.55)";
  g.fill(p);
  g.strokeStyle = "rgba(110,50,40,0.25)"; g.lineWidth = Math.max(0.4, ww * 0.06); g.stroke(p);
  g.save();
  g.globalCompositeOperation = "lighter";
  g.strokeStyle = "rgba(255,240,226,0.4)";
  g.lineWidth = Math.max(0.4, ww * 0.1);
  g.beginPath();
  g.moveTo(bx + tx * len * 0.12 - nx * 0.3, by + ty * len * 0.12 - ny * 0.3);
  g.quadraticCurveTo((bx + ex) / 2 - nx * ww * 0.18, (by + ey) / 2 - ny * ww * 0.18, ex - tx * len * 0.2, ey - ty * len * 0.2);
  g.stroke();
  g.restore();
}
// pose presets: fingers [baseX, baseY, angle, [[len, bend] x 3], w0, w1] (little .. index), thumb the same
const HAND_POSES = {
  // resting on a cat's crown: the palm flat on top, the fingers draping down over the skull
  drape: {
    fingers: [
      [46, -9.2, -0.1, [[19, 0.16], [12, 0.44], [9.5, 0.36]], 8.8, 6.6],
      [51, -6.4, -0.06, [[23, 0.18], [14.5, 0.46], [11, 0.38]], 9.8, 7.2],
      [53.5, -3.2, -0.03, [[25.5, 0.18], [16, 0.48], [12, 0.4]], 10.6, 7.8],
      [53, 1.2, 0.02, [[23.5, 0.2], [14.5, 0.5], [11, 0.42]], 10.4, 7.6],
    ],
    thumb: [6, 8, 0.66, [[20, 0.02], [15, 0.14], [12, 0.2]], 17, 9.2],
  },
  // fingertips tucked under a collar, thumb on top (seen from the back): the fingers curl away from the lens
  tuck: {
    fingers: [
      [50, 13.5, 0.2, [[15, 0.12], [7, 0.1], [4, 0.1]], 9.6, 8.4],
      [55, 4.6, 0.07, [[17, 0.06], [8, 0.06], [4.5, 0.06]], 10.6, 9.2],
      [56, -4.6, -0.03, [[18, 0], [8.5, 0], [4.5, 0]], 10.8, 9.4],
      [53, -13.6, -0.14, [[17, -0.06], [8, -0.06], [4.5, -0.06]], 10.4, 9],
    ],
    thumb: [12, -15, -0.75, [[17, 0.3], [14, 0.32], [11, 0.28]], 14.5, 9.6],
  },
};
// paint the hand in its local frame into g (the caller sets the transform)
// o: view side|back, pose, L, sss, rimColor, rimK, shadowColor, skin, bounce (colour of light bounced up from below)
function paintHand(g, o = {}) {
  const P = HAND_POSES[o.pose || "drape"];
  const L = o.L || [0.6, -0.8];
  const sssK = o.sss == null ? 0.8 : o.sss;
  const back = o.view === "back";
  const sh = { shadow: o.shadowColor || "#3a2028", rim: o.rimColor || "#ffd2a8", rimK: o.rimK == null ? 1 : o.rimK };
  const box = [-24, -64, 134, 64];
  const fingers = P.fingers.map(([bx, by, a, segs, w0, w1]) => ({ pts: chain(bx, by, a, segs), w0, w1 }));
  const thumb = (() => { const [bx, by, a, segs, w0, w1] = P.thumb; return { pts: chain(bx, by, a, segs), w0, w1 }; })();
  const base = o.skin || SKIN2.base;
  const palm = new Path2D();
  if (back) K.spline(palm, [-6, -14, 20, -18, 44, -19, 56, -12, 58, 0, 56, 12, 46, 19, 22, 17, 0, 13, -6, 0], true);
  else K.spline(palm, [-8, -11, 16, -12.5, 38, -12, 51, -10.5, 58, -5, 58, 3.5, 50, 8.5, 34, 11, 18, 15, 4, 14, -8, 9], true);
  const tex = (path, seed) => K.texFill(g, "noise", path, { scale: 20, alpha: 0.2, mode: "overlay", tex: { seed } });
  // warm-cool variation in real skin: redder over knuckles and fingertips, yellower on the palm
  const flush = (pts, w) => {
    for (let j = 0; j < pts.length; j++) {
      const [x, y] = pts[j];
      const r = w * (j === pts.length - 1 ? 0.75 : 0.6);
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, K.rgba(SKIN2.red, j === pts.length - 1 ? 0.35 : 0.22)); rg.addColorStop(1, K.rgba(SKIN2.red, 0));
      g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  };
  const bounce = (path) => {
    if (!o.bounce) return;
    g.save(); g.clip(path);
    const bg = g.createLinearGradient(0, 18, 0, -4);
    bg.addColorStop(0, K.rgba(o.bounce, 0.45)); bg.addColorStop(1, K.rgba(o.bounce, 0));
    g.globalCompositeOperation = "soft-light";
    g.fillStyle = bg; g.fillRect(-30, -30, 170, 80);
    g.restore();
  };
  const contact = (path, k = 1) => {
    // the occlusion a nearer part throws on what is behind it
    g.save();
    if (K.hasFilter()) g.filter = "blur(2.4px)";
    g.translate(L[0] * -1.2, L[1] * -1.2 + 1.4);
    g.fillStyle = "rgba(50,16,12," + 0.4 * k + ")";
    g.fill(path);
    g.restore();
  };
  const all = new Path2D();
  if (!back) {
    // the three far fingers, staggered behind the palm's edge, each a little darker (less light reaches them)
    for (let i = 0; i < 3; i++) {
      const f = fingers[i];
      const p = fingerPath2(f.pts, f.w0, f.w1);
      if (i) contact(p, 0.7);
      g.fillStyle = K.mix(base, sh.shadow, 0.2 + (2 - i) * 0.1);
      g.fill(p);
      g.save(); g.clip(p); tex(p, 3 + i); flush(f.pts, f.w0); g.restore();
      shadePart(g, p, box, L, f.w0, sh, sssK * 1.3, 0.8);
      creases(g, f.pts, f.w0, 1, 0.8);
      nail(g, f.pts, f.w1);
      all.addPath(p);
    }
    // the near silhouette: palm + index + thumb, shaded as one form (no seams where they join)
    const ind = fingers[3];
    const ip = fingerPath2(ind.pts, ind.w0, ind.w1);
    const tp = fingerPath2(thumb.pts, thumb.w0, thumb.w1);
    const near = new Path2D();
    near.addPath(palm); near.addPath(ip); near.addPath(tp);
    contact(near, 0.9);
    g.fillStyle = base;
    g.fill(near);
    g.save();
    g.clip(near);
    tex(near, 9);
    // the back of the hand catches the most sky; the palm side is in its own shade
    const fg = g.createLinearGradient(0, -14, 0, 16);
    fg.addColorStop(0, "rgba(255,226,206,0.10)"); fg.addColorStop(0.55, "rgba(0,0,0,0)"); fg.addColorStop(1, "rgba(60,20,24,0.25)");
    g.fillStyle = fg; g.fillRect(-30, -30, 170, 80);
    flush(ind.pts, ind.w0); flush(thumb.pts.slice(1), thumb.w1 * 1.2);
    // dorsal tendons and a vein, very soft
    g.lineCap = "round";
    g.strokeStyle = "rgba(255,226,206,0.09)"; g.lineWidth = 2.2;
    for (const y of [-10, -7.4]) { g.beginPath(); g.moveTo(0, y + 1); g.quadraticCurveTo(28, y - 1.4, 52, y + 0.4); g.stroke(); }
    g.strokeStyle = "rgba(90,74,120,0.09)"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(4, -7.5); g.bezierCurveTo(18, -5.6, 30, -10, 46, -7); g.stroke();
    // the crease where the thumb leaves the palm, and the thenar pad's roundness
    g.strokeStyle = "rgba(80,30,24,0.32)"; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(10, 9); g.quadraticCurveTo(20, 13.5, 30, 12); g.stroke();
    const tg = g.createRadialGradient(15, 10, 1, 15, 10, 13);
    tg.addColorStop(0, "rgba(255,210,186,0.14)"); tg.addColorStop(1, "rgba(255,210,186,0)");
    g.fillStyle = tg; g.fillRect(0, -4, 32, 28);
    // the near index finger separates from the middle behind it by a thin dark line of shadow along its top
    g.strokeStyle = "rgba(60,20,16,0.25)"; g.lineWidth = 1;
    g.restore();
    bounce(near);
    shadePart(g, near, box, L, 13, sh, sssK * 0.75);
    creases(g, ind.pts, ind.w0, 1, 1);
    creases(g, thumb.pts.slice(1), thumb.w0 * 0.75, 1, 0.8);
    nail(g, ind.pts, ind.w1);
    nail(g, thumb.pts, thumb.w1);
    // the knuckle of the index stands up out of the back of the hand
    const [kx, ky] = ind.pts[0];
    const kg = g.createRadialGradient(kx - 1, ky - 5, 0, kx - 1, ky - 5, 7);
    kg.addColorStop(0, "rgba(255,220,196,0.16)"); kg.addColorStop(1, "rgba(255,220,196,0)");
    g.fillStyle = kg; g.fillRect(kx - 8, ky - 12, 16, 14);
    all.addPath(near);
  } else {
    // back view: the fingers (curling away from the lens) and thumb with the back of the hand, one form
    const parts = new Path2D();
    parts.addPath(palm);
    const fps = fingers.map((f) => fingerPath2(f.pts, f.w0, f.w1));
    const tp = fingerPath2(thumb.pts, thumb.w0, thumb.w1);
    for (const p of fps) parts.addPath(p);
    parts.addPath(tp);
    contact(parts, 0.9);
    g.fillStyle = base;
    g.fill(parts);
    g.save();
    g.clip(parts);
    tex(parts, 11);
    for (const f of fingers) flush(f.pts.slice(1), f.w0);
    flush(thumb.pts.slice(1), thumb.w1 * 1.2);
    // the gaps between the fingers: dark, a line of shade where each finger presses on the next
    g.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const a = fingers[i].pts, b = fingers[i + 1].pts;
      g.strokeStyle = "rgba(56,18,14,0.5)"; g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo((a[0][0] + b[0][0]) / 2 - 3, (a[0][1] + b[0][1]) / 2);
      for (let j = 1; j < a.length; j++) g.lineTo((a[j][0] + b[j][0]) / 2, (a[j][1] + b[j][1]) / 2);
      g.stroke();
    }
    // tendons fanning to each knuckle
    g.strokeStyle = "rgba(255,226,206,0.1)"; g.lineWidth = 2.4;
    for (const f of fingers) { const [x, y] = f.pts[0]; g.beginPath(); g.moveTo(4, y * 0.35); g.quadraticCurveTo(30, y * 0.75, x - 3, y); g.stroke(); }
    // knuckles: lit bumps with a soft valley between
    for (const f of fingers) {
      const [x, y] = f.pts[0];
      const kg = g.createRadialGradient(x - 2, y, 0, x - 2, y, f.w0 * 0.7);
      kg.addColorStop(0, "rgba(255,214,190,0.22)"); kg.addColorStop(1, "rgba(255,214,190,0)");
      g.fillStyle = kg; g.fillRect(x - 12, y - 12, 24, 24);
    }
    // the fingertips curl away: they darken as they turn from the lens
    for (const f of fingers) {
      const e = f.pts[f.pts.length - 1];
      const dg = g.createRadialGradient(e[0], e[1], 0, e[0], e[1], f.w0 * 1.2);
      dg.addColorStop(0, "rgba(60,20,18,0.4)"); dg.addColorStop(1, "rgba(60,20,18,0)");
      g.fillStyle = dg; g.fillRect(e[0] - 14, e[1] - 14, 28, 28);
    }
    g.restore();
    bounce(parts);
    shadePart(g, parts, box, L, 14, sh, sssK * 0.6);
    for (const f of fingers) creases(g, f.pts, f.w0, 0, 1);
    creases(g, thumb.pts.slice(1), thumb.w0 * 0.75, 0, 0.8);
    nail(g, thumb.pts, thumb.w1);
    all.addPath(parts);
  }
  return all;
}

/// ---- the sunrise world ---------------------------------------------------------------------------------------------
// far ridges receding toward the sun; each is hazier and paler (atmospheric perspective), blue-grey, never pink
function farRidges(s, W, H, hz, sun) {
  hillsWide(s, W, H, { y: hz + 3, amp: 12, color: "#8a92a8", seed: 21, haze: "#f2dcc4", hazeAmt: 0.78, freq: 1.8 });
  hillsWide(s, W, H, { y: hz + 20, amp: 20, color: "#6a7488", seed: 23, haze: "#ecd2bc", hazeAmt: 0.6, freq: 1.3 });
}
function midRidge(s, W, H, hz, sun) {
  hillsWide(s, W, H, { y: hz + 44, amp: 24, color: "#4e5a5e", seed: 26, haze: "#e2c8b4", hazeAmt: 0.42, freq: 1.1, sun, rim: "#ffcf96" });
}
// the near hill's crest: not a dome but a real down - steeper on the right, a lower shoulder and a small knoll
// on the left, a soft saddle on the right, and ground noise at two scales; crest point at (hx, hy)
function crestY(x, hx, hy, sp) {
  const d = (x - hx) / (420 * sp);
  const n = (K.fbm(x / (70 * sp), 31) - K.fbm(hx / (70 * sp), 31)) * 2.4 * sp + (K.fbm(x / (23 * sp), 37) - K.fbm(hx / (23 * sp), 37)) * 0.8 * sp;
  const knolls = -13 * sp * Math.exp(-Math.pow((d + 0.86) / 0.2, 2)) - 7 * sp * Math.exp(-Math.pow((d - 1.18) / 0.3, 2)) + 5 * sp * Math.exp(-Math.pow((d - 0.75) / 0.18, 2));
  return hy + Math.pow(Math.abs(d), 1.65) * (d < 0 ? 62 : 96) * sp + knolls * Math.min(1, Math.abs(d) * 3) + n * Math.min(1, Math.abs(d) * 6);
}
function hillPath(W, H, hx, hy, sp) {
  const p = new Path2D();
  const x0 = -M - 8, x1 = W + M + 8;
  p.moveTo(x0, H + M + 8);
  for (let x = x0; x <= x1; x += 4) p.lineTo(x, crestY(x, hx, hy, sp));
  p.lineTo(x1, H + M + 8);
  p.closePath();
  return p;
}
// back-lit grass blades rooted along rootY(x), a band `depth` px deep, far to near. Each blade is a tapered
// curve: dark and cool at the root, the upper half lit through (translucent yellow-green) where it faces the
// sun, a hot edge on the side toward it. Bake-time only.
function blades(s, x0, x1, rootY, o) {
  const R = K.rng("f20bl" + (o.seed || 1));
  const n = Math.round((x1 - x0) * (o.dens || 1));
  const items = [];
  for (let i = 0; i < n; i++) items.push([R(), x0 + R() * (x1 - x0), R(), R(), R()]);
  items.sort((a, b) => a[0] - b[0]);
  const sunX = o.sun ? o.sun.x : 1e4;
  s.save();
  s.lineCap = "round";
  for (const [d, x, r1, r2, r3] of items) {
    const y = rootY(x) + (d - 0.5) * (o.depth || 0);
    const nearK = o.depth ? d : 0.5;
    const clump = 0.45 + 0.55 * (0.5 + 0.5 * K.noise(x / (o.clump || 40), o.seed || 1));
    const h = (o.h || 20) * (0.35 + 0.65 * r1) * (0.7 + 0.6 * nearK) * clump;
    const lean = (r2 - 0.5) * (o.lean || 0.7) + (o.bias || 0);
    const w = (o.w || 1.6) * (0.6 + 0.8 * nearK) * (0.7 + 0.6 * r3);
    const tx = x + Math.sin(lean) * h, ty = y - Math.cos(lean) * h;
    const cx = x + Math.sin(lean * 0.4) * h * 0.55, cy = y - Math.cos(lean * 0.4) * h * 0.6;
    const toward = Math.exp(-Math.pow((x - sunX) / (o.sunW || 500), 2));
    const base = K.mix(o.dark || "#1e2618", o.color || "#4e5a38", K.clamp(0.25 + nearK * 0.35 + r3 * 0.4));
    s.fillStyle = base;
    s.beginPath();
    s.moveTo(x - w / 2, y);
    s.quadraticCurveTo(cx - w * 0.3, cy, tx, ty);
    s.quadraticCurveTo(cx + w * 0.3, cy, x + w / 2, y);
    s.closePath();
    s.fill();
    // light through the blade (back-lit translucency), strongest in the upper half and toward the sun
    const a = (o.glowA == null ? 0.55 : o.glowA) * (0.3 + 0.7 * toward) * (0.5 + 0.5 * r2);
    if (a > 0.02) {
      s.globalCompositeOperation = "lighter";
      s.strokeStyle = K.rgba(o.glow || "#c8c060", a * 0.55);
      s.lineWidth = w * 0.55;
      s.beginPath(); s.moveTo(cx, cy); s.quadraticCurveTo((cx + tx) / 2, (cy + ty) / 2, tx, ty); s.stroke();
      s.strokeStyle = K.rgba(o.rim || "#ffe0a0", a);
      s.lineWidth = Math.max(0.5, w * 0.22);
      const side = sunX > x ? 1 : -1;
      s.beginPath(); s.moveTo(cx + side * w * 0.25, cy); s.quadraticCurveTo((cx + tx) / 2 + side * w * 0.12, (cy + ty) / 2, tx, ty); s.stroke();
      s.globalCompositeOperation = "source-over";
    }
  }
  s.restore();
}
// short dewy turf over the hill, baked per pixel at half resolution: perspective texture (fine and hazy at the
// crest, coarse and dark near the lens), clumps, dry patches, a cool sheen of sky on the dew in the middle
// distance, and the sun grazing the top of the slope. The slope faces us, so it is in its own shade.
function turfField(key, W, H, hx, hy, sp, sun) {
  const q = 2, w = W + 2 * M, h = H + M - (hy - 30 * sp);
  const cw = Math.ceil(w / q), ch = Math.ceil(h / q);
  const y0 = hy - 30 * sp;
  const crest = new Float32Array(cw);
  for (let i = 0; i < cw; i++) crest[i] = crestY(i * q - M, hx, hy, sp);
  return K.texBake("f20turf:" + key, cw, ch, (u, v, out, px, py) => {
    const x = px * q - M, y = y0 + py * q;
    const c = crest[px];
    const dy = y - c;
    if (dy < -1) { out[3] = 0; return; }
    const z = K.clamp(dy / (H + M - c)); // 0 at the crest .. 1 at the lens
    const zp = 0.04 + z * 1.6; // metres-ish of depth scale
    const fx = (x - hx) / (34 * sp * zp), fy = (1 / (0.03 + z)) * 0.9;
    const blade = K.texNoise(fx * 3.2, fy * 7, 41) * 0.5 + K.texNoise(fx * 7, fy * 15, 42) * 0.3;
    const clump = K.texFbm(fx * 0.35, fy * 0.6, 43, 3);
    const dry = K.clamp(K.texFbm(fx * 0.12 + 3, fy * 0.2, 44, 3) * 1.6 - 0.25);
    // colour by depth: hazy grey-green at the crest, cool deep green near the lens
    const k1 = K.smooth(K.clamp(z * 3)), k2 = K.smooth(K.clamp((z - 0.25) / 0.75));
    let r = K.lerp(150, 70, k1), g = K.lerp(148, 82, k1), b = K.lerp(140, 70, k1);
    r = K.lerp(r, 30, k2); g = K.lerp(g, 42, k2); b = K.lerp(b, 32, k2);
    // straw in the dry patches
    r += dry * 28 * (1 - z * 0.5); g += dry * 18 * (1 - z * 0.5);
    const lum = 1 + 0.3 * blade + 0.22 * clump;
    r *= lum; g *= lum; b *= lum;
    // dew sheen: the sky mirrored in a million drops, strongest where we look across the slope
    const sheen = Math.exp(-Math.pow((z - 0.22) / 0.16, 2)) * (0.6 + 0.4 * blade);
    r += sheen * 22; g += sheen * 28; b += sheen * 44;
    // the low sun just skims the top of the down: warm on the first metres below the crest
    const graze = Math.exp(-dy / (12 * sp)) * Math.exp(-Math.pow((x - sun.x) / (520 * sp), 2));
    r += graze * 120; g += graze * 80; b += graze * 30;
    out[0] = r; out[1] = g; out[2] = b; out[3] = dy < 0 ? 255 * (1 + dy) : 255;
  });
}
// the near hill: per-pixel turf, real blades near the lens, and a continuous fringe of back-lit grass along the
// crest whose blades glow gold where the sun shines through them
function paintHill(s, W, H, hx, hy, sp, sun) {
  const p = hillPath(W, H, hx, hy, sp);
  s.save();
  s.clip(p);
  s.fillStyle = "#2a3428";
  s.fillRect(-M, hy - 40 * sp, W + 2 * M, H + 2 * M);
  const f = turfField("h" + Math.round(sp * 10) + ":" + hx, W, H, hx, hy, sp, sun);
  s.drawImage(f, -M, hy - 30 * sp, W + 2 * M, H + M - (hy - 30 * sp));
  // tufts in the near field: real blades, bigger and sparser toward the lens
  for (let i = 0; i < 9; i++) {
    const u = (i + 1) / 10, zz = Math.pow(u, 1.6);
    blades(s, -M, W + M, (x) => K.lerp(crestY(x, hx, hy, sp) + 6 * sp, H + M, zz), { seed: 140 + i, h: K.lerp(3, 26, zz) * Math.min(sp, 1.6), w: K.lerp(0.7, 2.2, zz), dens: K.lerp(0.45, 0.2, zz), sun, sunW: 600 * sp, color: K.mix("#5e6a52", "#34442c", zz), dark: K.mix("#4a5244", "#141c10", zz), glow: "#a8b060", rim: "#ffe0a0", glowA: 0.22 * (1 - zz * 0.6), clump: 30 });
  }
  s.restore();
  // the crest: a continuous fringe of blades standing against the sky, varying length, lit through
  blades(s, -M, W + M, (x) => crestY(x, hx, hy, sp) + 1.5 * sp, { seed: 133, depth: 2 * sp, h: 5 * Math.min(sp, 1.8), w: 0.7 * Math.min(sp, 1.6), dens: 2.2, lean: 0.9, sun, sunW: 300 * sp, color: "#3e4636", dark: "#22281e", glow: "#ffc060", rim: "#ffe0a0", glowA: 0.6, clump: 18 });
}
// the foreground: tall grass very close to the lens, far out of focus, back-lit
function fgGrass(s, W, H, seed, sun, o = {}) {
  const y = o.y == null ? H + 30 : o.y;
  K.grass(s, -M, W * 0.36, y, { seed, color: "#1e2a1c", light: "#4a5a36", dark: "#0c120a", height: o.h || 120, t: 0, wind: 0, density: 0.32, sun, dry: 0.25 });
  K.grass(s, W * 0.7, W + M, y + 10, { seed: seed + 1, color: "#1e2a1c", light: "#4a5a36", dark: "#0c120a", height: (o.h || 120) * 0.8, t: 0, wind: 0, density: 0.28, sun, dry: 0.25 });
}
// the live layers of the dawn world: sky and cloud deck (baked, out of focus), then the sun disc itself
function dawnAir(g, W, H, t, hz, sun, o = {}) {
  const sb = o.skySun || sun;
  putWide(g, wideBlur("air:" + o.key, W, H, 2.2, (s) => {
    skyWide(s, W, H, hz, sb, o.sky || SKY.dawn);
    K.cloudLayer3d(s, W, H, 0, { seed: 20, y: o.cloudY == null ? 18 : o.cloudY, horizon: hz - 10, count: 12, color: "#ffd8bc", shade: "#56607e", haze: "#f0d4bc", sun: sb, kind: "cumulus", scale: 0.95, alpha: 0.55 });
  }), W, H);
  // the sun itself (the hills drawn after it hide its lower limb: it breaks the horizon)
  sunDisc(g, sun.x, sun.y, o.sunR || 12, hz, { glow: 1 });
}
// dew sparkles: specular glints on the crest grass, each a tiny light the lens blooms
function dew(g, t, hx, hy, sp, n, seed, sun) {
  for (let i = 0; i < n; i++) {
    const u = K.hash(i, seed);
    const x = hx + (u - 0.5) * 900 * sp;
    const y = crestY(x, hx, hy, sp) + 1 + Math.pow(K.hash(i, seed + 1), 2) * 26 * sp;
    const facing = Math.exp(-Math.pow((x - sun.x) / (300 * sp), 2));
    const tw = Math.pow(Math.max(0, Math.sin(t * (1.1 + K.hash(i, seed + 2)) + i * 2.3)), 6);
    const a = (0.25 + 0.75 * facing) * tw;
    if (a < 0.05) continue;
    K.glow(g, x, y, 1.2 + 1.6 * sp * 0.5, "#fff6dc", a);
  }
}

// ---- shot 1 [0-12] ultra-wide: sunrise, and him at the top of the hill -------------------------------------------
const S1 = { hz: 292, hx: 520, hy: 352, sp: 1.0 };
function shot1(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 0, 12));
  const { hz, hx, hy, sp } = S1;
  const sun = { x: 560, y: K.lerp(hz + 14, hz - 22, K.ease.out(K.seg(t, 0.5, 12))) };
  const sunF = { x: 560, y: hz - 10 }; // the baked sets are lit from the sun's mean position
  K.withCamera(g, W, H, { x: 486 + p * 10, y: 268 - p * 6, zoom: 1.04 + p * 0.07, shakeT: t, shakeAmt: 0.7 }, (c) => {
    dawnAir(c, W, H, t, hz, sun, { sunR: 11, key: "s1", skySun: sunF, sky: SKY.pre });
    putWide(c, wide("s1far", W, H, (s) => farRidges(s, W, H, hz, sunF)), W, H);
    mist(c, W, "s1a", hz + 24, 26, sunF.x, t, { alpha: 0.8 });
    putWide(c, wide("s1mid", W, H, (s) => midRidge(s, W, H, hz, sunF)), W, H);
    mist(c, W, "s1b", hz + 50, 32, sunF.x, t * 1.3, { alpha: 0.7, seed: 5 });
    putWide(c, wide("s1hill", W, H, (s) => paintHill(s, W, H, hx, hy, sp, sunF)), W, H);
    // him: small, sitting at the top with his back to us, facing the sun; edges lit, body in his own shadow
    K.shadowBlob(c, hx + 4, hy + 1.5, 9, 1.6, { alpha: 0.6, color: "#141a10" });
    shadedCat(c, W, H, "f20c1", 0.5, (q) => K.drawCat(q, hx + 4, hy + 1, 26, BISC({
      pose: "sit", t, headTurn: -0.6, tail: 0, tailUp: 0,
      key: { x: 200, y: -200, color: "#aab4e0", strength: 0.45 }, rim: { x: sun.x, y: sun.y, color: "#ffd090", strength: 2 },
      fill: SKYFILL, ambient: "#4a5470", ambientK: 0.3, backlit: 1, castShadow: 0, ground: "#141a10",
    })), hx + 4, hy - 26, 26);
    dew(c, t, hx, hy, sp, 26, 410, sun);
    putWide(c, wideBlur("s1fg", W, H, 7, (s) => fgGrass(s, W, H, 501, sunF, { h: 110 })), W, H);
  });
}

// a back-lit cat: drawn into a layer, its body pulled down into the sky-lit shadow, then a soft rim glow
// paint fn into a layer, pull it down into shadow (amt of color), and, with rim, give it a back-light edge:
// the layer minus itself shifted away from the light leaves exactly the silhouette edge facing the light
function shadeLayer(g, W, H, key, color, amt, fn, rim) {
  const L = inLayer(g, W, H, key, fn);
  let E = null;
  if (rim) {
    const px = K.pixelScale();
    E = K.layer(W, H, "f20rim");
    const e = E.g;
    e.setTransform(1, 0, 0, 1, 0, 0);
    e.drawImage(L.canvas, 0, 0);
    e.globalCompositeOperation = "destination-out";
    e.drawImage(L.canvas, -rim.dx * px, -rim.dy * px);
    e.globalCompositeOperation = "source-in";
    e.fillStyle = rim.color;
    e.fillRect(0, 0, E.canvas.width, E.canvas.height);
    e.globalCompositeOperation = "source-over";
  }
  L.g.save();
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  L.g.globalCompositeOperation = "source-atop";
  L.g.fillStyle = K.rgba(color, amt);
  L.g.fillRect(0, 0, L.canvas.width, L.canvas.height);
  L.g.restore();
  put(g, W, H, L, 1, rim && rim.blur ? rim.blur : 0);
  if (E) { put(g, W, H, E, rim.alpha == null ? 0.8 : rim.alpha, 0.8, "lighter"); }
}
function shadedCat(g, W, H, key, shade, fn, rx, ry, rr) {
  const L = inLayer(g, W, H, key, fn);
  L.g.save();
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  L.g.globalCompositeOperation = "source-atop";
  L.g.fillStyle = K.rgba("#283040", shade);
  L.g.fillRect(0, 0, L.canvas.width, L.canvas.height);
  L.g.restore();
  put(g, W, H, L, 1);
  K.glow(g, rx, ry, rr * 1.2, "#ffc880", 0.16 * shade);
}
const BISC = (o) => Object.assign({ facing: 1, collar: true, bell: false, tail: 0.4, ground: "#3a2e48" }, o);

// ---- shot 2 [12-22] behind you, walking then running up the hill; he turns, meows, stands ------------------------
const S2 = { hz: 250, hx: 580, hy: 318, sp: 1.7 };
function shot2(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 12, 22));
  const { hz, hx, hy, sp } = S2;
  const sun = { x: 724, y: hz - 30 };
  const run = t >= 17;
  // walking 12-17 covers a little ground, the run 17-22 a lot more: the camera climbs with you
  const fw = K.seg(t, 12, 17) * 0.22 + K.ease.in(K.seg(t, 17, 22)) * 0.78;
  const ph = run ? 0.5 + (t - 17) * 1.7 : t * 0.85;
  const bob = run ? Math.sin(ph * TAU * 2) * 3.5 : Math.abs(Math.sin(ph * TAU)) * 1.2;
  K.withCamera(g, W, H, { x: 480 + fw * 18, y: 270 - fw * 14 + bob, zoom: 1.04 + fw * 0.12, shakeT: t, shakeAmt: run ? 2.4 : 1.1 }, (c) => {
    dawnAir(c, W, H, t, hz, sun, { sunR: 18, cloudY: 0, key: "s2", sky: SKY.dawn });
    putWide(c, wide("s2far", W, H, (s) => farRidges(s, W, H, hz, sun)), W, H);
    mist(c, W, "s2a", hz + 26, 28, sun.x, t - 12, { alpha: 0.75 });
    putWide(c, wide("s2mid", W, H, (s) => midRidge(s, W, H, hz, sun)), W, H);
    mist(c, W, "s2b", hz + 54, 34, sun.x, (t - 12) * 1.2, { alpha: 0.6, seed: 5 });
    putWide(c, wide("s2hill", W, H, (s) => paintHill(s, W, H, hx, hy, sp, sun)), W, H);
    // him on the crest, against the sun
    const turn = K.ease.inOut(K.seg(t, 14.6, 16.8));
    const stand = t >= 18.4;
    const mouth = K.env(t, 18.0, 18.7, 0.12, 0.3);
    const cy = crestY(620, hx, hy, sp) + 2;
    const lightO = {
      key: { x: 260, y: -120, color: "#b4bce6", strength: 0.35 }, rim: { x: sun.x, y: sun.y, color: "#ffd090", strength: 1.9 },
      fill: "#4a4a66", ambient: "#6a6280", ambientK: 0.42, backlit: 1, castShadow: 0, ground: "#4a4058",
    };
    K.shadowBlob(c, 620, cy + 1, 24, 3.2, { alpha: 0.6, color: "#1a1626", soft: 0.5 });
    if (!stand) K.drawCat(c, 620, cy, 44, BISC({ pose: "sit", t, headTurn: turn * 1.0, mouth, ...lightO }));
    else K.drawCat(c, 620, cy, 44, BISC({ pose: "stand", facing: -1, t, headTurn: 0.7, tailUp: 1, tail: 0.5, ears: 0.6, ...lightO }));
    dew(c, t, hx, hy, sp, 30, 420, sun);
    // you, from behind, far out of focus in the foreground: a back-lit silhouette with a gold edge
    soft(c, W, H, "f20s2kid", 3 + (run ? 1.2 : 0), (q) => {
      const kx = 360 + fw * 120, ky = 640 - fw * 60, kh = K.lerp(360, 300, fw);
      K.drawPerson(q, kx, ky, kh, {
        view: "back", hood: false, walk: !run, run, phase: ph, t, bell: false, shadow: false,
        light: { x: sun.x, y: sun.y, color: "#ffd9a0", strength: 1.5, z: -0.8 }, ambient: "#3e3450",
      });
      kidBack(q, kx, ky + bob * 0, kh, sun, ph, run);
    });
    putWide(c, wideBlur("s2fg", W, H, 8, (s) => fgGrass(s, W, H, 511, sun, { h: 150, y: H + 50 })), W, H);
  });
  K.dust(g, W, H, t, { seed: 202, count: 22, color: "#ffe8c0", size: 1.3, alpha: 0.35 });
}
// detail on your back in shot 2 (drawn inside the out-of-focus layer): the raincoat hood fallen back and bunched
// at the nape, clumps of hair whose loose ends burn gold where the low sun comes through them, and the coat
// creasing across the shoulder blades and at the waist with each stride
function kidBack(q, x, y, h, sun, ph, run) {
  const u = h / 100, hx = x, hy = y - 91.5 * u;
  const sw = Math.sin(ph * TAU) * (run ? 1.6 : 0.8) * u;
  const toS = sun.x > x ? 1 : -1;
  // hood: a soft folded mass behind the neck
  const hood = new Path2D();
  hood.moveTo(hx - 9 * u, y - 80 * u);
  hood.bezierCurveTo(hx - 11 * u, y - 72 * u, hx - 5 * u, y - 68 * u, hx, y - 68.5 * u);
  hood.bezierCurveTo(hx + 5 * u, y - 68 * u, hx + 11 * u, y - 72 * u, hx + 9 * u, y - 80 * u);
  hood.bezierCurveTo(hx + 5 * u, y - 82.5 * u, hx - 5 * u, y - 82.5 * u, hx - 9 * u, y - 80 * u);
  const hg = q.createLinearGradient(hx - 10 * u, 0, hx + 10 * u, 0);
  hg.addColorStop(0, toS > 0 ? "#3a2e0c" : "#8a6c1c"); hg.addColorStop(1, toS > 0 ? "#8a6c1c" : "#3a2e0c");
  q.fillStyle = hg; q.fill(hood);
  q.strokeStyle = "rgba(40,30,10,0.45)"; q.lineWidth = 0.7 * u;
  for (const k of [-4, 0, 4]) { q.beginPath(); q.moveTo(hx + k * u, y - 80 * u); q.quadraticCurveTo(hx + k * 1.3 * u, y - 75 * u, hx + k * 0.6 * u, y - 70 * u); q.stroke(); }
  // coat creases: long diagonal folds from the shoulder blades toward the waist, swinging with the stride
  q.lineCap = "round";
  for (let i = 0; i < 5; i++) {
    const s = i % 2 ? 1 : -1, k = 1 + (i >> 1);
    q.strokeStyle = "rgba(60,40,8,0.32)"; q.lineWidth = (1.1 - i * 0.12) * u;
    q.beginPath(); q.moveTo(hx + s * (2 + k * 2) * u, y - (74 - k * 2) * u); q.quadraticCurveTo(hx + s * (6 + k) * u + sw, y - 62 * u, hx + s * (3 + k * 1.5) * u + sw * 1.4, y - (50 - k * 2) * u); q.stroke();
    q.strokeStyle = "rgba(255,226,140,0.18)"; q.lineWidth = 0.5 * u;
    q.beginPath(); q.moveTo(hx + s * (2.8 + k * 2) * u, y - (74 - k * 2) * u); q.quadraticCurveTo(hx + s * (6.8 + k) * u + sw, y - 62 * u, hx + s * (3.8 + k * 1.5) * u + sw * 1.4, y - (50 - k * 2) * u); q.stroke();
  }
  // hair: clumps falling from the crown, dark at the root, the tips lit through
  const R = K.rng("f20kidhair");
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI * (0.08 + 0.84 * R());
    const r0 = 3 * u, len = (5 + R() * 4) * u;
    const sx = hx + Math.cos(a) * r0, sy = hy + Math.sin(a) * r0 * 0.9;
    const ex = hx + Math.cos(a) * (r0 + len * 0.6) + (R() - 0.5) * 2 * u, ey = hy + Math.sin(a) * r0 + len * (0.4 + 0.6 * R());
    const w = (1.4 + R() * 1.4) * u;
    q.strokeStyle = R() > 0.5 ? "#3a2412" : "#2a180a"; q.lineWidth = w;
    q.beginPath(); q.moveTo(sx, sy); q.quadraticCurveTo(sx + Math.cos(a) * len * 0.5, sy, ex, ey); q.stroke();
    const lit = Math.max(0, Math.cos(a) * toS);
    if (lit > 0.2) {
      q.strokeStyle = K.rgba("#ffcf70", 0.35 + 0.5 * lit); q.lineWidth = w * 0.35;
      q.beginPath(); q.moveTo(sx + Math.cos(a) * w * 0.4, sy); q.quadraticCurveTo(sx + Math.cos(a) * len * 0.55, sy, ex, ey); q.stroke();
    }
  }
  // the gold halo where the sun comes through the outer hairs
  q.save();
  q.globalCompositeOperation = "lighter";
  q.strokeStyle = "rgba(255,200,110,0.45)"; q.lineWidth = 1.2 * u;
  q.beginPath(); q.ellipse(hx, hy, 8.4 * u, 8.6 * u, 0, toS > 0 ? -1.4 : Math.PI + 0.2, toS > 0 ? -0.2 : Math.PI + 1.4); q.stroke();
  q.restore();
}

// ---- shot 3 [22-34] close, low: the reunion ---------------------------------------------------------------------
// The lens sits a hand's height above the grass: the far world is a soft wash of sky and sun, the ground
// comes into focus at his paws, and the nearest blades are a blur. He trots in, pushes his forehead up into your
// palm and rubs his cheek along it; your fingers curl over his crown and press a dent into the fur.
const S3 = { hz: 330, sun: { x: 840, y: 214 }, GY: 478 };
// the meadow behind him, far out of focus: sky, the sun, hazy downs, a field whose grass tips glow toward the sun
function s3Back(s, W, H) {
  const { hz, sun } = S3;
  skyWide(s, W, H, hz, sun, SKY.day);
  K.cloudLayer3d(s, W, H, 0, { seed: 25, y: 10, horizon: hz - 20, count: 8, color: "#ffd6b4", shade: "#6a6a8c", haze: "#f0d0b8", sun, kind: "stratus", scale: 1.6, alpha: 0.7 });
  sunDisc(s, sun.x, sun.y, 15, hz, { glow: 1.1 });
  hillsWide(s, W, H, { y: hz + 8, amp: 18, color: "#6a7466", seed: 27, haze: "#f4d6bc", hazeAmt: 0.72, sun, rim: "#ffe6c0" });
  // the field: a soft perspective wash, cooler and darker toward the lens, sunlit tips toward the sun
  const f = fieldTex("s3", W + 2 * M, H + M - hz, sun.x + M, { hzCol: [232, 214, 190], nearCol: [44, 52, 40], midCol: [116, 124, 96], tip: [255, 214, 140] });
  s.drawImage(f, -M, hz + 2, W + 2 * M, H + M - hz);
}
// a field seen from grass height, baked per pixel at quarter resolution (it is always out of focus)
function fieldTex(key, w, h, sunX, o) {
  const q = 4;
  return K.texBake("f20field:" + key, Math.ceil(w / q), Math.ceil(h / q), (u, v, out) => {
    const z = Math.pow(v, 0.7); // 0 = horizon, 1 = lens
    const x = u * w;
    // perspective: texture frequency falls toward the lens
    const sc = 1 / (0.02 + z);
    const n = K.texFbm(x / 90 * (0.25 + 0.75 / sc * 8), v * 9 * sc * 0.25, 61, 4);
    const clump = K.texFbm(x / 260, v * 3 * sc * 0.15, 62, 3);
    const toward = Math.exp(-Math.pow((x - sunX) / (w * 0.32), 2));
    const lit = K.clamp(0.5 + n * 0.8) * (1 - z) * (0.4 + 0.6 * toward);
    let r = K.lerp(o.hzCol[0], o.midCol[0], K.smooth(K.clamp(z * 2.2))), gg = K.lerp(o.hzCol[1], o.midCol[1], K.smooth(K.clamp(z * 2.2))), b = K.lerp(o.hzCol[2], o.midCol[2], K.smooth(K.clamp(z * 2.2)));
    const zn = K.smooth(K.clamp((z - 0.3) / 0.7));
    r = K.lerp(r, o.nearCol[0], zn); gg = K.lerp(gg, o.nearCol[1], zn); b = K.lerp(b, o.nearCol[2], zn);
    const k = 1 + 0.22 * n + 0.18 * clump;
    out[0] = r * k + (o.tip[0] - r) * lit * 0.5; out[1] = gg * k + (o.tip[1] - gg) * lit * 0.5; out[2] = b * k + (o.tip[2] - b) * lit * 0.4; out[3] = 255;
  });
}
// a tile of short hair streaks (alpha mask) for breaking up rim light into a fringe of individual hairs
function hairMask() {
  return K.texBake("f20hair", 64, 64, (u, v, out, x, y) => {
    const n = K.texNoise(u * 22, v * 5, 71, 22, 5) * 0.6 + K.texNoise(u * 44, v * 9, 72, 44, 9) * 0.5;
    const a = K.clamp((n + 0.15) * 2.2);
    out[0] = 255; out[1] = 255; out[2] = 255; out[3] = 255 * a;
  });
}
// a fur tile: fine streaks along +x with clumping (overlay texture for painted fur masses)
function furTex() {
  return K.texBake("f20fur", 128, 128, (u, v, out) => {
    const s = K.texNoise(u * 5, v * 40, 81, 5, 40) * 0.6 + K.texNoise(u * 12, v * 90, 82, 12, 90) * 0.45 + K.texFbm(u * 4, v * 4, 83, 3, 4, 4) * 0.35;
    const l = 128 + s * 90;
    out[0] = l; out[1] = l; out[2] = l; out[3] = 255;
  });
}
// The photographic cat pass for a big back-lit cat: drawCat into a layer, then (1) lengthen the legs (slice at
// the belly line, stretch the legs, lift the body), (2) add the shoulder-blade, thigh and foreleg masses and a
// tapered tail behind the painted body so only their real silhouette shows, (3) let `onFur` press contact
// shadows / dents into the fur, (4) a back-lit fringe: a rim along the edges facing the light broken into
// hairs, plus a few glowing hair tips standing proud of the silhouette.
function photoCat(c, W, H, key, cat, o) {
  const A = inLayer(c, W, H, key + "A", cat);
  const T = c.getTransform();
  const px = K.pixelScale();
  const F = K.layer(W, H, key + "F");
  const f = F.g;
  f.setTransform(1, 0, 0, 1, 0, 0);
  const cw = F.canvas.width, ch = F.canvas.height;
  if (o.stretch) {
    const yb = Math.round(T.d * o.stretch.belly + T.f), yg = Math.round(T.d * o.stretch.ground + T.f);
    const d = Math.round((yg - yb) * (o.stretch.k - 1));
    f.drawImage(A.canvas, 0, 0, cw, yb, 0, -d, cw, yb);
    f.drawImage(A.canvas, 0, yb, cw, yg - yb + 2, 0, yb - d, cw, yg - yb + d + 2);
    if (yg + 2 < ch) f.drawImage(A.canvas, 0, yg + 2, cw, ch - yg - 2, 0, yg + 2, cw, ch - yg - 2);
  } else f.drawImage(A.canvas, 0, 0);
  if (o.masses) {
    const Ms = K.layer(W, H, key + "M");
    Ms.g.setTransform(T);
    o.masses(Ms.g);
    f.globalCompositeOperation = "destination-over";
    f.drawImage(Ms.canvas, 0, 0);
    f.globalCompositeOperation = "source-over";
  }
  if (o.onFur) { f.save(); f.setTransform(T); o.onFur(f); f.restore(); }
  // the back-lit fringe: the edge facing the light (inside the silhouette) plus a thin band of hair tips
  // standing proud of it, both broken into individual hairs by a streak mask
  const E = K.layer(W, H, key + "E");
  const e = E.g;
  e.setTransform(1, 0, 0, 1, 0, 0);
  const rx = o.rim.dx * px, ry = o.rim.dy * px;
  e.drawImage(F.canvas, rx * 0.7, ry * 0.7);
  e.globalCompositeOperation = "destination-out";
  e.drawImage(F.canvas, 0, 0);
  e.globalCompositeOperation = "source-over";
  e.drawImage(F.canvas, 0, 0);
  e.globalCompositeOperation = "destination-out";
  e.drawImage(F.canvas, -rx, -ry);
  e.globalCompositeOperation = "destination-in";
  const pat = e.createPattern(hairMask(), "repeat");
  if (pat && pat.setTransform) pat.setTransform(new DOMMatrix([px * 0.55, 0, 0, px * 0.55, 0, 0]));
  e.fillStyle = pat;
  e.fillRect(0, 0, cw, ch);
  e.globalCompositeOperation = "source-in";
  e.fillStyle = o.rim.color;
  e.fillRect(0, 0, cw, ch);
  e.globalCompositeOperation = "source-over";
  put(c, W, H, F, 1);
  put(c, W, H, E, o.rim.alpha == null ? 0.9 : o.rim.alpha, 0, "lighter");
  if (o.rim.soft) put(c, W, H, E, o.rim.soft, 2.2, "lighter");
}
// a tapered, ringed tabby tail (drawn behind the body: its base merges into the rump)
function tabbyTail(g, bx, by, t, s, o = {}) {
  const segs = o.segs || [[0.19, 0], [0.2, -0.08], [0.19, -0.12], [0.16, -0.38], [0.12, -0.75]];
  let a = o.a0 == null ? -1.3 : o.a0, x = bx, y = by;
  const pts = [x, y];
  for (let i = 0; i < segs.length; i++) {
    a += segs[i][1] + Math.sin(t * 1.3 - i * 0.7) * 0.07 * (i + 1) / segs.length + Math.sin(t * 0.47 + 1 - i) * 0.04;
    x += Math.cos(a) * segs[i][0] * s; y += Math.sin(a) * segs[i][0] * s;
    pts.push(x, y);
  }
  const w = s * 0.115;
  const p = new Path2D();
  K.tube(p, pts, [w * 1.25, w * 1.1, w, w * 0.92, w * 0.78, w * 0.42], 6, false, true);
  g.save();
  const gr = g.createLinearGradient(bx, by, x, y);
  gr.addColorStop(0, "#c8803c"); gr.addColorStop(0.6, "#d08a44"); gr.addColorStop(1, "#a8602a");
  g.fillStyle = gr;
  g.fill(p);
  g.clip(p);
  // tabby rings: darker bands across the tail, wider toward the tip
  const S = K.sampleSpline(pts, false, 8);
  g.lineCap = "butt";
  for (let i = 3; i < S.length - 1; i += 4) {
    const [x0, y0] = S[i], [x1, y1] = S[i + 1];
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
    const k = i / S.length;
    g.strokeStyle = K.rgba("#6a2e0c", 0.35 + k * 0.4);
    g.lineWidth = s * (0.03 + k * 0.035);
    g.beginPath();
    g.moveTo(x0 - (dy / l) * w * 1.4, y0 + (dx / l) * w * 1.4);
    g.lineTo(x0 + (dy / l) * w * 1.4, y0 - (dx / l) * w * 1.4);
    g.stroke();
  }
  const ft = g.createPattern(furTex(), "repeat");
  if (ft && ft.setTransform) ft.setTransform(new DOMMatrix([0.12, -0.5, 0.5, 0.12, bx, by]));
  g.globalCompositeOperation = "overlay";
  g.globalAlpha = 0.5;
  g.fillStyle = ft;
  g.fillRect(bx - s, by - s * 1.2, s * 2, s * 1.6);
  g.restore();
  // form: core shadow on the side away from the sun, a sky-cool side, the tip darkest
  const box = [bx - s, by - s * 1.3, bx + s, by + s * 0.5];
  K.crescent(g, p, w * 0.55, -w * 0.15, "#3a1c10", 0.5, box, "source-atop", 4);
  return p;
}
function shot3(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 22, 34));
  const { sun, GY } = S3;
  K.withCamera(g, W, H, { x: 486 + p * 14, y: 276, zoom: 1.04 + p * 0.06, shakeT: t, shakeAmt: 1.0 }, (c) => {
    putWide(c, wideBlur("s3bg", W, H, 9, (s) => s3Back(s, W, H)), W, H);
    // the strip of ground in focus behind his paws
    putWide(c, wide("s3mid", W, H, (s) => blades(s, -M, W + M, () => GY - 4, { seed: 31, depth: 20, h: 16, w: 1.4, dens: 2.6, sun, sunW: 520, color: "#5a6440", dark: "#262c1e", glow: "#b8c060", rim: "#ffe0a0", glowA: 0.5 })), W, H);
    // him: trots in from the right, then headbutts your palm and rubs his cheek along your fingers
    const arrive = K.ease.out(K.seg(t, 22, 23.6));
    const bump = K.ease.out(K.seg(t, 23.5, 24.4)) - K.ease.inOut(K.seg(t, 24.6, 25.2)) * 0.45;
    const rubK = K.smooth(K.seg(t, 25, 25.8)) * (1 - K.smooth(K.seg(t, 30, 31)));
    const rub = Math.sin((t - 25) * 2.2) * rubK;
    const cx = K.lerp(1060, 650, arrive) - rub * 6;
    const walking = t < 23.6;
    const purr = K.smooth(K.seg(t, 25.6, 26.4));
    const contact = K.smooth(K.seg(t, 23.6, 24.1)) * (1 - K.smooth(K.seg(t, 31.5, 32.5)));
    const cy = GY - bump * 12;
    const STRETCH = 1.18;
    const lift = (GY - 404) * (STRETCH - 1);
    // the hand rests on his crown (the crown point follows his head: the bump, the rub, the leg lift)
    const crown = [cx - 146 + rub * 3, cy - 226 - lift + Math.abs(rub) * 2];
    const HL = 136, HA = 0.3 + rub * 0.04;
    const wx = crown[0] - 70 - (1 - contact) * 18, wy = crown[1] - 52 - (1 - contact) * 20;
    // his long morning shadow falls toward the lens, and the soft contact shadow under each paw
    K.shadowBlob(c, cx - 20, GY + 6, 130, 8, { alpha: 0.42, color: "#141a12" });
    if (!walking) for (const fx of [-118, -96, 62, 86]) K.shadowBlob(c, cx + fx, GY + 1, 13, 2.6, { alpha: 0.6, color: "#0c100a", soft: 0.5 });
    const lightO = {
      key: { x: 120, y: -60, color: "#c4ccec", strength: 0.7 }, rim: { x: sun.x + 200, y: sun.y - 60, color: "#ffc47a", strength: 1.8 },
      fill: "#4a4a64", ambient: "#7a84a0", ambientK: 0.12, backlit: 0.9, castShadow: 0, pupil: 0.35, ground: "#1a2014",
    };
    photoCat(c, W, H, "f20s3", (q) => K.drawCat(q, cx, cy, 150, BISC({
      pose: walking ? "walk" : "stand", facing: -1, phase: (t - 22) * 1.6, t,
      headTurn: walking ? 0.15 : 0.2 + rub * 0.3, headTilt: walking ? 0 : 0.1 + bump * 0.45 + rub * 0.12,
      blink: walking ? 0 : Math.max(0.5 * purr, K.env(t, 24.2, 24.9, 0.15, 0.3) * 0.8), ears: walking ? 0.4 : 0.4 - contact * 0.7,
      tailPose: walking ? null : [[10, 2], [10, 2], [10, 1], [10, 0], [8, 0]], tailPoseK: walking ? 0 : 1, tailUp: 1, tail: 0.6,
      ...lightO,
    })), {
      stretch: walking ? null : { belly: 404 - bump * 12, ground: GY - bump * 12 + 2, k: STRETCH },
      rim: { dx: 2.4, dy: -1.2, color: "#ffc890", alpha: 0.85, soft: 0.5 },
      masses: walking ? null : (q) => catMasses(q, cx, cy - lift, t),
      onFur: (q) => {
        if (contact < 0.01) return;
        // the palm presses a shallow dent into the fur of his crown, and shades it
        q.globalCompositeOperation = "destination-out";
        q.globalAlpha = contact;
        q.beginPath(); q.ellipse(crown[0] + 6, crown[1] - 5, 30, 6, HA * 0.6, 0, TAU); q.fill();
        q.globalCompositeOperation = "source-atop";
        q.globalAlpha = contact;
        const sg = q.createRadialGradient(crown[0] + 2, crown[1] + 2, 2, crown[0] + 2, crown[1] + 6, 46);
        sg.addColorStop(0, "rgba(40,18,8,0.6)"); sg.addColorStop(0.5, "rgba(40,18,8,0.28)"); sg.addColorStop(1, "rgba(40,18,8,0)");
        q.fillStyle = sg; q.fillRect(crown[0] - 60, crown[1] - 30, 120, 90);
        // the hand's own shadow from the low sun falls forward over his brow
        q.save();
        q.translate(-7, 7);
        drawHandAt(q, "s3", wx, wy, HA, HL, 0.5, true);
        q.restore();
      },
    });
    // sharp back-lit blades and dew at his paws (they hide the toes, as real grass does)
    putWide(c, wide("s3paws", W, H, (s) => blades(s, -M, W + M, () => GY + 8, { seed: 32, depth: 14, h: 22, w: 1.6, dens: 1.6, sun, sunW: 520, color: "#4a5436", dark: "#1a2014", glow: "#b8c060", rim: "#ffe4a8", glowA: 0.55, clump: 26 })), W, H);
    for (let i = 0; i < 14; i++) {
      const x = 340 + K.hash(i, 31) * 660, y = GY - 4 + K.hash(i, 32) * 10;
      const tw = Math.pow(Math.max(0, Math.sin(t * 1.3 + i * 2.1)), 5);
      if (tw > 0.05) K.glow(c, x, y, 1.6, "#fff6dc", tw * 0.9);
    }
    // your arm from the left, out of frame: the sleeve falls out of focus toward the lens; the hand is sharp
    drawSleeveAt(c, "s3", wx, wy, HA);
    drawHandAt(c, "s3", wx, wy, HA, HL, 1, false);
    // the rest of you: a soft dark shoulder at the frame edge
    putWide(c, wideBlur("s3you", W, H, 10, (s) => {
      K.drawPerson(s, -10, 760, 560, { view: "back", hood: false, crouch: 1, bell: false, shadow: false, light: { x: 1100, y: 160, color: "#ffd9a0", strength: 1.3, z: -0.8 }, ambient: "#1e2430" });
    }), W, H);
    putWide(c, wideBlur("s3fg", W, H, 9, (s) => fgGrass(s, W, H, 521, sun, { h: 90, y: H + 40 })), W, H);
  });
  K.dust(g, W, H, t, { seed: 203, count: 34, color: "#ffe8c0", size: 1.6, alpha: 0.45 });
}
// the anatomy the stand pose lacks, painted behind it: the shoulder blade riding above the back, the big thigh
// over the hind leg, a thicker upper foreleg, and the tail
function catMasses(q, cx, cy, t) {
  const ft = q.createPattern(furTex(), "repeat");
  const furFill = (path, c0, c1, y0, y1, rot) => {
    const gr = q.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    q.fillStyle = gr; q.fill(path);
    if (ft && ft.setTransform) {
      const T = q.getTransform();
      ft.setTransform(T.multiply(new DOMMatrix().rotate(rot || 80).scale(0.35)));
      q.save(); q.clip(path); q.globalCompositeOperation = "overlay"; q.globalAlpha = 0.55;
      q.setTransform(1, 0, 0, 1, 0, 0); q.fillStyle = ft; q.fillRect(0, 0, q.canvas.width, q.canvas.height); q.restore();
    }
  };
  // tail: from the rump, up and over in a soft question mark (pure function of t)
  tabbyTail(q, cx + 104, cy - 150, t, 150, { a0: -1.28 });
  // thigh: a rounded mass from the rump to the stifle
  const th = new Path2D();
  K.spline(th, [cx + 52, cy - 128, cx + 96, cy - 160, cx + 122, cy - 132, cx + 120, cy - 96, cx + 104, cy - 70, cx + 78, cy - 62, cx + 56, cy - 82], true);
  furFill(th, "#d48a44", "#8a4a22", cy - 160, cy - 60, 70);
  q.save(); q.clip(th);
  q.strokeStyle = "rgba(110,44,12,0.45)"; q.lineWidth = 7; q.lineCap = "round";
  for (let i = 0; i < 3; i++) { q.beginPath(); q.moveTo(cx + 70 + i * 16, cy - 150 + i * 6); q.quadraticCurveTo(cx + 84 + i * 14, cy - 118, cx + 74 + i * 12, cy - 74); q.stroke(); }
  q.restore();
  // shoulder blade: the top of the scapula rides just above the back line
  const sc = new Path2D();
  K.spline(sc, [cx - 106, cy - 166, cx - 84, cy - 182, cx - 58, cy - 176, cx - 50, cy - 150, cx - 96, cy - 140], true);
  furFill(sc, "#dc9450", "#b06a32", cy - 184, cy - 140, 90);
  // upper foreleg: the elbow and forearm are wider than the painted leg
  const fl = new Path2D();
  K.spline(fl, [cx - 126, cy - 100, cx - 104, cy - 104, cx - 98, cy - 72, cx - 104, cy - 36, cx - 116, cy - 36, cx - 124, cy - 70], true);
  furFill(fl, "#e0a060", "#b87a44", cy - 104, cy - 36, 92);
}
// the reaching hand and its sleeve, baked once (lighting included) and placed by the wrist (wx, wy) + angle
const HAND_LOOK = {
  s3: { view: "side", pose: "drape", L: [1, -0.35], sss: 0.9, rimColor: "#ffd2a0", bounce: "#e09048", shadowColor: "#3a2430" },
  s4L: { view: "back", pose: "tuck", L: [0.5, -0.85], sss: 0.7, rimColor: "#ffd2a0", bounce: "#e8a060", shadowColor: "#3a2430" },
  s4R: { view: "back", pose: "tuck", L: [-0.5, -0.85], sss: 0.7, rimColor: "#ffd2a0", bounce: "#e8a060", shadowColor: "#3a2430" },
};
function handSprite(id, HL, angle, shadow) {
  const S = Math.ceil(HL * 1.7);
  return K.sprite("f20hand:" + id + ":" + HL + ":" + angle.toFixed(2) + (shadow ? ":sh" : ""), S, S, (s) => {
    s.translate(S * 0.3, S * 0.5);
    s.rotate(angle);
    s.scale(HL / 100, HL / 100);
    const look = HAND_LOOK[id];
    // L is given in world space; the painter wants it in the hand's frame
    const ca = Math.cos(-angle), sa = Math.sin(-angle);
    const L = [look.L[0] * ca - look.L[1] * sa, look.L[0] * sa + look.L[1] * ca];
    if (!shadow) { paintHand(s, { ...look, L }); return; }
    const L2 = K.layer(S, S, "f20handsh");
    L2.g.setTransform(s.getTransform());
    paintHand(L2.g, { ...look, L });
    s.setTransform(1, 0, 0, 1, 0, 0);
    if (K.hasFilter()) s.filter = "blur(" + (5 * K.pixelScale()).toFixed(1) + "px)";
    s.drawImage(L2.canvas, 0, 0);
    s.filter = "none";
    s.globalCompositeOperation = "source-in";
    s.fillStyle = "rgba(30,12,6,0.55)";
    s.fillRect(0, 0, s.canvas.width, s.canvas.height);
  });
}
function drawHandAt(g, id, wx, wy, angle, HL, alpha, shadow, flip) {
  const a0 = Math.round(angle * 10) / 10; // bake at a coarse angle, rotate the rest
  const spr = handSprite(id, HL, a0, shadow);
  const S = spr.lw;
  g.save();
  g.globalAlpha *= alpha;
  g.translate(wx, wy);
  if (flip) g.scale(-1, 1);
  g.rotate(angle - a0);
  g.drawImage(spr, -S * 0.3, -S * 0.5, S, S);
  g.restore();
}
// a yellow PVC raincoat sleeve from the cuff at the wrist up and out of frame: smooth plastic in its own shade,
// two long diagonal folds, one broad soft specular, a hot edge where the low sun skims its top; out of focus
function drawSleeveAt(g, id, wx, wy, angle) {
  const spr = K.sprite("f20sleeve:" + id, 420, 440, (s) => {
    const L = K.layer(420, 440, "f20sleeveL");
    const q = L.g;
    q.translate(360, 380);
    // the arm runs back from the cuff (0,0) to the elbow, then up out of frame
    const ex = -150, ey = 40, sx = -300, sy = -330;
    const pts = [6, 0, -40, 8, ex, ey, -230, -90, sx, sy];
    const p = new Path2D();
    K.tube(p, pts, [40, 46, 58, 66, 74], 8, true, false);
    const gr = q.createLinearGradient(-60, -40, -20, 40);
    gr.addColorStop(0, "#e2b432"); gr.addColorStop(0.3, "#b88a1c"); gr.addColorStop(0.75, "#6a4c10"); gr.addColorStop(1, "#4a3812");
    q.fillStyle = gr;
    q.fill(p);
    q.save();
    q.clip(p);
    // light falls off along the arm away from the hand (toward the lens and out of the sun)
    const lg = q.createLinearGradient(0, 0, sx * 0.7, sy * 0.7);
    lg.addColorStop(0, "rgba(20,14,30,0)"); lg.addColorStop(1, "rgba(20,14,30,0.55)");
    q.fillStyle = lg; q.fillRect(-420, -400, 460, 460);
    // two long diagonal folds: a soft shadow trough with a lit lip above it
    for (const [a, b, c2, d] of [[-30, -6, -170, 14], [-60, 22, -200, 60], [-150, -10, -250, -150]]) {
      q.strokeStyle = "rgba(40,24,4,0.35)"; q.lineWidth = 9; q.lineCap = "round";
      q.beginPath(); q.moveTo(a, b); q.quadraticCurveTo((a + c2) / 2, (b + d) / 2 + 10, c2, d); q.stroke();
      q.strokeStyle = "rgba(255,226,150,0.16)"; q.lineWidth = 5;
      q.beginPath(); q.moveTo(a + 2, b - 7); q.quadraticCurveTo((a + c2) / 2 + 2, (b + d) / 2 + 3, c2 + 2, d - 7); q.stroke();
    }
    // one broad soft specular along the top of the forearm (the plastic's sheen of the sky)
    q.globalCompositeOperation = "lighter";
    q.strokeStyle = "rgba(255,240,200,0.12)"; q.lineWidth = 12;
    q.beginPath(); q.moveTo(-6, -12); q.quadraticCurveTo(-80, -10, -150, 16); q.stroke();
    q.strokeStyle = "rgba(255,246,220,0.16)"; q.lineWidth = 3;
    q.beginPath(); q.moveTo(-10, -16); q.quadraticCurveTo(-80, -15, -146, 10); q.stroke();
    q.restore();
    // the cuff: the dark opening around the wrist and a hot rim on its top edge from the sun
    q.fillStyle = "rgba(30,20,10,0.75)";
    q.beginPath(); q.ellipse(4, 0, 7, 19, 0.1, 0, TAU); q.fill();
    K.crescent(q, p, -2.5, 3, "#ffd890", 0.75, [-420, -400, 40, 60], "lighter", 2);
    s.setTransform(1, 0, 0, 1, 0, 0);
    K.dof(s, L.canvas, 2.6);
  });
  g.save();
  g.translate(wx, wy);
  g.rotate((angle - 0.3) * 0.5);
  g.drawImage(spr, -360, -380, 420, 440);
  g.restore();
}

// ---- shot 4 [34-42] insert: the bell goes back on; a slow blink ----------------------------------------------------
const S4 = { hz: 360, sun: { x: 830, y: 150 } };
// the face model of the hero close-up (drawCat(470, 760, 330, headTurn 1), world space)
const FACE = { eyeL: [524, 254], eyeR: [592, 254], nose: [557, 277], mouth: [557, 296], chin: [557, 316] };
function shot4(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 34, 42));
  const { sun } = S4;
  K.withCamera(g, W, H, { x: 480, y: 262 - p * 8, zoom: 1.04 + p * 0.05, shakeT: t, shakeAmt: 0.9 }, (c) => {
    putWide(c, wideBlur("s4bg", W, H, 14, (s) => {
      skyWide(s, W, H, S4.hz, sun, SKY.day);
      K.cloudLayer3d(s, W, H, 0, { seed: 26, y: 0, horizon: S4.hz - 30, count: 7, color: "#ffd6b4", shade: "#6a6a8c", sun, kind: "stratus", scale: 1.8, alpha: 0.7 });
      sunDisc(s, sun.x, sun.y, 26, S4.hz, { glow: 1 });
      hillsWide(s, W, H, { y: S4.hz + 20, amp: 26, color: "#5a6656", seed: 28, haze: "#f2d4bc", hazeAmt: 0.62, sun });
      const f = fieldTex("s4", W + 2 * M, H + M - S4.hz - 20, sun.x + M, { hzCol: [226, 208, 186], nearCol: [40, 48, 38], midCol: [104, 112, 88], tip: [255, 214, 140] });
      s.drawImage(f, -M, S4.hz + 22, W + 2 * M, H + M - S4.hz - 20);
    }), W, H);
    const blink = K.env(t, 38.0, 39.2, 0.5, 0.6);
    const glint = Math.exp(-Math.max(0, t - 36.4) * 1.4) * (t >= 36.4 ? 1.6 : 0) + 0.45 + 0.25 * Math.sin(t * 2.2);
    closeUp(c, W, H, t, blink, sun);
    // your hands at his collar either side of the bell, tying (34-36.5), then drawing away
    const away = K.ease.inOut(K.seg(t, 36.5, 37.9));
    const tie = Math.sin(t * 7) * 2.5 * (1 - away);
    const BX = 560, BY = 376;
    if (away < 0.999) {
      const HL = 150;
      const lw = [448 - away * 120, 448 + away * 190 + tie], rw = [672 + away * 120, 448 + away * 190 - tie];
      // the occlusion of your fingers on his chest fur (soft: they hover a finger's depth in front)
      K.shadowBlob(c, BX - 40 - away * 60, 372 + away * 60, 26, 12, { alpha: 0.4 * (1 - away), color: "#3a1a0c" });
      K.shadowBlob(c, BX + 40 + away * 60, 372 + away * 60, 26, 12, { alpha: 0.4 * (1 - away), color: "#3a1a0c" });
      drawHandAt(c, "s4L", lw[0], lw[1], -0.98, HL, 1, false);
      drawHandAt(c, "s4R", rw[0], rw[1], -0.98, HL, 1, false, true);
      // the yellow raincoat cuffs at your wrists, nearer the lens and softer
      cuff(c, lw[0] - 8, lw[1] + 14, -0.98 - Math.PI);
      cuff(c, rw[0] + 8, rw[1] + 14, 0.98, true);
    }
    // his collar over your fingertips (they are tucked under it), then the bell, right where it belongs
    collarBand(c, t);
    bell(c, BX, BY, 22, { t, glint: Math.max(0, glint), lx: 0.45, ly: -0.6 });
  });
  K.dust(g, W, H, t, { seed: 204, count: 30, color: "#ffe8c0", size: 1.6, alpha: 0.4 });
}
// red leather collar: a curved band round the neck with a stitched edge, sky sheen on top, his ruff over it
function collarBand(c, t) {
  const spr = K.sprite("f20collar", 200, 70, (s) => {
    s.translate(-460, -320);
    const p = new Path2D();
    p.moveTo(500, 336); p.quadraticCurveTo(560, 372, 620, 336);
    p.lineTo(622, 348); p.quadraticCurveTo(560, 386, 498, 348); p.closePath();
    const gr = s.createLinearGradient(0, 340, 0, 380);
    gr.addColorStop(0, "#b8403a"); gr.addColorStop(0.45, "#8a2420"); gr.addColorStop(1, "#4a1010");
    s.fillStyle = gr; s.fill(p);
    s.save(); s.clip(p);
    K.texFill(s, "noise", p, { scale: 14, alpha: 0.25, mode: "overlay", tex: { seed: 21 } });
    // stitching along both edges
    s.strokeStyle = "rgba(240,200,170,0.35)"; s.lineWidth = 0.8; s.setLineDash([2.2, 2]);
    s.beginPath(); s.moveTo(502, 339); s.quadraticCurveTo(560, 375, 618, 339); s.stroke();
    s.beginPath(); s.moveTo(500, 346); s.quadraticCurveTo(560, 383, 620, 346); s.stroke();
    s.setLineDash([]);
    // sheen of the sky along the upper edge, the sun's rim on the right
    s.globalCompositeOperation = "lighter";
    s.strokeStyle = "rgba(255,200,170,0.22)"; s.lineWidth = 1.6;
    s.beginPath(); s.moveTo(510, 341); s.quadraticCurveTo(560, 374, 612, 340); s.stroke();
    s.restore();
  });
  c.drawImage(spr, 460, 320, 200, 70);
}
// a yellow PVC cuff at the wrist, nearer the lens than the hand (soft)
function cuff(c, x, y, a, flip) {
  const spr = K.sprite("f20cuff", 120, 120, (s) => {
    const L = K.layer(120, 120, "f20cuffL");
    const q = L.g;
    q.translate(60, 60);
    const p = new Path2D();
    K.roundRect(p, -6, -26, 70, 52, 14);
    const gr = q.createLinearGradient(0, -26, 0, 26);
    gr.addColorStop(0, "#f0c040"); gr.addColorStop(0.35, "#c09020"); gr.addColorStop(1, "#5a4210");
    q.fillStyle = gr; q.fill(p);
    q.save(); q.clip(p);
    q.strokeStyle = "rgba(50,30,4,0.4)"; q.lineWidth = 5;
    q.beginPath(); q.moveTo(14, -26); q.quadraticCurveTo(24, 0, 12, 26); q.stroke();
    q.fillStyle = "rgba(30,20,8,0.85)";
    q.beginPath(); q.ellipse(-4, 0, 6, 22, 0, 0, TAU); q.fill();
    q.restore();
    K.crescent(q, p, 0, 3, "#ffe0a0", 0.6, [-10, -30, 70, 30], "lighter", 2);
    s.setTransform(1, 0, 0, 1, 0, 0);
    K.dof(s, L.canvas, 2);
  });
  c.save();
  c.translate(x, y);
  if (flip) c.scale(-1, 1);
  c.rotate(flip ? Math.PI - a : a);
  c.drawImage(spr, -60, -60, 120, 120);
  c.restore();
}

// The hero close-up: drawCat into a layer, then the finishing passes: the bent left ear (image right) folded
// forward, the sculpt of the face (cool sky fill left, warm sun rim right, cheek and whisker-pad volumes,
// a shaded muzzle instead of drawn lines), real eyes, light through the ears, and soft focus low on the shoulders.
const CU = { hx: 557, hy: 272 };
function closeUp(c, W, H, t, blink, sun) {
  const L = inLayer(c, W, H, "f20cu", (q) => {
    K.drawCat(q, 470, 760, 330, BISC({
      pose: "sit", t, headTurn: 1, blink: 0, autoBlink: false, bell: false, ears: 0.5,
      key: { x: 160, y: 40, color: "#cfd2f0", strength: 0.8 }, rim: { x: sun.x, y: sun.y, color: "#ffc47a", strength: 1.7 },
      fill: "#4a4a6a", ambient: "#7a84a8", ambientK: 0.12, backlit: 1, pupil: 0.3, castShadow: 0, shadow: false,
    }));
    bentEar(q);
    faceSculpt(q, t, blink);
  });
  // soft focus on the shoulders: a blurred copy faded in below the collar
  const B = K.layer(W, H, "f20cuB");
  K.dof(B.g, L.canvas, 4, 1);
  B.g.setTransform(c.getTransform());
  B.g.globalCompositeOperation = "destination-in";
  const mg = B.g.createLinearGradient(0, 390, 0, 470);
  mg.addColorStop(0, "rgba(0,0,0,0)");
  mg.addColorStop(1, "rgba(0,0,0,1)");
  B.g.fillStyle = mg;
  B.g.fillRect(-200, 300, W + 400, H + 200);
  B.g.globalCompositeOperation = "source-over";
  put(c, W, H, L, 1);
  put(c, W, H, B, 1);
  // the low sun through the thin ears
  K.glow(c, 512, 196, 18, "#ff9a6a", 0.25);
  K.glow(c, 610, 190, 20, "#ffa070", 0.35);
}
// radial fibres of a cat's iris (crypts and collarette), a cached overlay sprite
function irisFibres() {
  return K.sprite("f20iris", 96, 96, (s) => {
    const R = K.rng("f20iris");
    s.translate(48, 48);
    s.lineCap = "round";
    for (let i = 0; i < 260; i++) {
      const a = R() * TAU, r0 = 9 + R() * 10, r1 = r0 + 12 + R() * 26;
      const lit = R() > 0.5;
      s.strokeStyle = lit ? "rgba(255,250,200," + (0.15 + R() * 0.25) + ")" : "rgba(30,40,0," + (0.15 + R() * 0.3) + ")";
      s.lineWidth = 0.6 + R() * 1.2;
      const wob = (R() - 0.5) * 0.12;
      s.beginPath(); s.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      s.quadraticCurveTo(Math.cos(a + wob) * (r0 + r1) / 2, Math.sin(a + wob) * (r0 + r1) / 2, Math.cos(a + wob * 2) * r1, Math.sin(a + wob * 2) * r1);
      s.stroke();
    }
    // the collarette: a ragged ring part way out
    s.strokeStyle = "rgba(255,240,170,0.3)"; s.lineWidth = 1.6;
    s.beginPath();
    for (let i = 0; i <= 60; i++) { const a = (i / 60) * TAU, r = 17 + R() * 3; if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    s.stroke();
  });
}
function almond(x, y, rw, rh, tilt) {
  const p = new Path2D();
  const ca = Math.cos(tilt), sa = Math.sin(tilt);
  const P = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca];
  const a = P(-rw, 0), b = P(rw, 0), c1 = P(-rw * 0.1, -rh * 1.42), c2 = P(rw * 0.1, rh * 1.3);
  p.moveTo(a[0], a[1]);
  p.quadraticCurveTo(c1[0], c1[1], b[0], b[1]);
  p.quadraticCurveTo(c2[0], c2[1], a[0], a[1]);
  p.closePath();
  return p;
}
// a real cat eye: dark lid margin, a domed iris lit through from the side away from the sun, radial fibres, a
// narrow pupil, the upper lid's shadow, curvature falling off at the edges, a wet cornea holding the sun and
// the sky, a moist line along the lower lid; `blink` lowers a furred lid over it
function catEye(q, x, y, rw, rh, tilt, blink, side) {
  // the socket: fur turning in toward the eye, in soft shade
  const so = q.createRadialGradient(x, y, rw * 0.8, x, y, rw * 1.6);
  so.addColorStop(0, "rgba(50,20,6,0.4)"); so.addColorStop(1, "rgba(50,20,6,0)");
  q.fillStyle = so; q.beginPath(); q.ellipse(x, y, rw * 1.6, rh * 1.6, tilt, 0, TAU); q.fill();
  const A = almond(x, y, rw * 1.03, rh * 1.04, tilt);
  q.fillStyle = "#1e1008";
  q.fill(A);
  const I = almond(x, y + 0.3, rw * 0.97, rh * 0.96, tilt);
  q.save();
  q.clip(I);
  const gx = x - rw * 0.04, gy = y + rh * 0.04;
  const ir = q.createRadialGradient(gx, gy, 0, gx, gy, rw * 1.02);
  ir.addColorStop(0, "#c6b452"); ir.addColorStop(0.3, "#a8a43e"); ir.addColorStop(0.7, "#6a7428"); ir.addColorStop(0.88, "#3e4618"); ir.addColorStop(1, "#16180a");
  q.fillStyle = ir;
  q.fillRect(x - rw * 1.2, y - rh * 1.4, rw * 2.4, rh * 2.8);
  // light enters through the cornea from the sun side and glows out of the iris on the far side
  const gl = q.createRadialGradient(x - side * rw * 0.1 - rw * 0.35, y + rh * 0.4, 0, x - rw * 0.35, y + rh * 0.4, rw * 0.9);
  gl.addColorStop(0, "rgba(255,236,140,0.55)"); gl.addColorStop(1, "rgba(255,236,140,0)");
  q.globalCompositeOperation = "screen";
  q.fillStyle = gl; q.fillRect(x - rw * 1.2, y - rh * 1.4, rw * 2.4, rh * 2.8);
  q.globalCompositeOperation = "overlay";
  q.globalAlpha = 0.85;
  q.drawImage(irisFibres(), gx - rw * 1.02, gy - rw * 1.02, rw * 2.04, rw * 2.04);
  q.globalAlpha = 1;
  q.globalCompositeOperation = "source-over";
  // the pupil, a narrow upright ellipse in the bright morning, its edge soft
  q.fillStyle = "rgba(6,4,4,0.45)";
  q.beginPath(); q.ellipse(gx, gy, rw * 0.2, rh * 0.98, tilt * 0.3, 0, TAU); q.fill();
  q.fillStyle = "#050303";
  q.beginPath(); q.ellipse(gx, gy, rw * 0.13, rh * 0.9, tilt * 0.3, 0, TAU); q.fill();
  // the upper lid shades the top of the eyeball; the ball turns away at the corners
  const lg = q.createLinearGradient(0, y - rh * 1.1, 0, y + rh * 0.2);
  lg.addColorStop(0, "rgba(16,6,2,0.9)"); lg.addColorStop(0.5, "rgba(16,6,2,0.4)"); lg.addColorStop(1, "rgba(16,6,2,0)");
  q.fillStyle = lg; q.fillRect(x - rw * 1.2, y - rh * 1.4, rw * 2.4, rh * 2);
  const vg = q.createRadialGradient(x, y + rh * 0.1, rw * 0.45, x, y, rw * 1.08);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(10,4,0,0.55)");
  q.fillStyle = vg; q.fillRect(x - rw * 1.2, y - rh * 1.4, rw * 2.4, rh * 2.8);
  // the cornea: a broad dim reflection of the sky across the top, the sun as a small hard highlight
  q.globalCompositeOperation = "screen";
  const sk = q.createLinearGradient(0, y - rh, 0, y);
  sk.addColorStop(0, "rgba(170,186,230,0.32)"); sk.addColorStop(1, "rgba(170,186,230,0)");
  q.fillStyle = sk;
  q.beginPath(); q.ellipse(x + rw * 0.1, y - rh * 0.3, rw * 0.78, rh * 0.5, tilt, Math.PI, TAU); q.fill();
  q.restore();
  K.glow(q, x + rw * 0.38, y - rh * 0.34, rw * 0.32, "#fff4e0", 0.55);
  q.fillStyle = "rgba(255,252,244,0.95)";
  q.beginPath(); q.ellipse(x + rw * 0.38, y - rh * 0.36, rw * 0.11, rh * 0.1, 0, 0, TAU); q.fill();
  q.fillStyle = "rgba(255,248,236,0.45)";
  q.beginPath(); q.arc(x - rw * 0.3, y + rh * 0.42, rw * 0.05, 0, TAU); q.fill();
  // the moist lower lid line
  const ca = Math.cos(tilt), sa = Math.sin(tilt);
  const P = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca];
  const a0 = P(-rw * 0.7, rh * 0.55), a1 = P(0, rh * 1.02), a2 = P(rw * 0.7, rh * 0.55);
  q.save();
  q.globalCompositeOperation = "lighter";
  q.strokeStyle = "rgba(255,230,210,0.35)"; q.lineWidth = 0.9; q.lineCap = "round";
  q.beginPath(); q.moveTo(a0[0], a0[1]); q.quadraticCurveTo(a1[0], a1[1], a2[0], a2[1]); q.stroke();
  q.restore();
  // the lid: furred, coming down over the eye in a blink, its dark margin leading
  if (blink > 0.01) {
    q.save();
    q.clip(almond(x, y, rw * 1.16, rh * 1.2, tilt));
    const yb = y - rh * 1.3 + blink * rh * 2.5;
    const fg = q.createLinearGradient(0, y - rh * 1.3, 0, yb);
    fg.addColorStop(0, "#b46e34"); fg.addColorStop(1, "#d08a48");
    q.fillStyle = fg;
    q.beginPath(); q.moveTo(x - rw * 1.4, y - rh * 1.5); q.lineTo(x + rw * 1.4, y - rh * 1.5); q.lineTo(x + rw * 1.4, yb - rh * 0.3); q.quadraticCurveTo(x, yb + rh * 0.35, x - rw * 1.4, yb - rh * 0.3); q.closePath(); q.fill();
    q.strokeStyle = "#1a0c06"; q.lineWidth = 1.6;
    q.beginPath(); q.moveTo(x - rw * 1.4, yb - rh * 0.3); q.quadraticCurveTo(x, yb + rh * 0.35, x + rw * 1.4, yb - rh * 0.3); q.stroke();
    q.restore();
  }
}
function faceSculpt(q, t, blink) {
  const [nx, ny] = FACE.nose;
  q.save();
  q.globalCompositeOperation = "source-atop";
  // the sky fills the shadow side (image left) cool; the sun wraps the right side warm
  const cool = q.createLinearGradient(452, 0, 545, 0);
  cool.addColorStop(0, "rgba(60,70,130,0.38)"); cool.addColorStop(1, "rgba(60,70,130,0)");
  q.fillStyle = cool; q.fillRect(440, 180, 120, 200);
  const warm = q.createLinearGradient(655, 0, 600, 0);
  warm.addColorStop(0, "rgba(255,190,110,0.45)"); warm.addColorStop(1, "rgba(255,190,110,0)");
  q.fillStyle = warm; q.fillRect(590, 180, 80, 200);
  // brow ridge over each eye and the hollow under it
  for (const [ex, ey] of [FACE.eyeL, FACE.eyeR]) {
    const bg = q.createRadialGradient(ex, ey + 18, 2, ex, ey + 16, 22);
    bg.addColorStop(0, "rgba(70,30,10,0.22)"); bg.addColorStop(1, "rgba(70,30,10,0)");
    q.fillStyle = bg; q.fillRect(ex - 24, ey, 48, 40);
    const br = q.createRadialGradient(ex, ey - 22, 1, ex, ey - 20, 20);
    br.addColorStop(0, "rgba(255,226,180,0.16)"); br.addColorStop(1, "rgba(255,226,180,0)");
    q.fillStyle = br; q.fillRect(ex - 22, ey - 42, 44, 30);
  }
  // cheek volumes: the round of each cheek catches light on top, turns into shade beneath
  for (const [cx, k] of [[500, 0.6], [616, 1]]) {
    const cg = q.createRadialGradient(cx, 286, 4, cx, 296, 34);
    cg.addColorStop(0, "rgba(255,226,186," + 0.14 * k + ")"); cg.addColorStop(0.5, "rgba(255,226,186,0)"); cg.addColorStop(0.85, "rgba(60,26,8,0.12)"); cg.addColorStop(1, "rgba(60,26,8,0)");
    q.fillStyle = cg; q.beginPath(); q.ellipse(cx, 296, 34, 34, 0, 0, TAU); q.fill();
  }
  // the white muzzle: cover the drawn mouth with fur, then model the whisker pads, philtrum and chin in tone
  q.globalCompositeOperation = "source-atop";
  const mz = q.createRadialGradient(nx, 298, 2, nx, 300, 30);
  mz.addColorStop(0, "rgba(236,224,206,1)"); mz.addColorStop(0.6, "rgba(230,214,192,0.95)"); mz.addColorStop(1, "rgba(230,214,192,0)");
  q.fillStyle = mz; q.beginPath(); q.ellipse(nx, 300, 30, 21, 0, 0, TAU); q.fill();
  q.save();
  q.beginPath(); q.ellipse(nx, 300, 30, 18, 0, 0, TAU); q.clip();
  const ft = q.createPattern(furTex(), "repeat");
  if (ft && ft.setTransform) { ft.setTransform(q.getTransform().multiply(new DOMMatrix().translate(nx, 300).rotate(90).scale(0.18))); q.globalCompositeOperation = "overlay"; q.globalAlpha = 0.45; q.fillStyle = ft; q.fillRect(nx - 32, 280, 64, 40); }
  q.restore();
  q.globalCompositeOperation = "source-atop";
  for (const s of [-1, 1]) {
    const px = nx + s * 13, py = 295;
    const pg = q.createRadialGradient(px - s * 2, py - 5, 1, px, py, 15);
    pg.addColorStop(0, "rgba(255,250,240,0.4)"); pg.addColorStop(0.55, "rgba(255,250,240,0.05)"); pg.addColorStop(1, "rgba(80,50,40,0.28)");
    q.fillStyle = pg; q.beginPath(); q.ellipse(px, py, 15, 10, s * 0.15, 0, TAU); q.fill();
    // whisker follicles in rows across the pad
    q.fillStyle = "rgba(90,60,46,0.55)";
    for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) {
      const fx = px + s * (-6 + i * 4 + r * 0.8), fy = py - 4 + r * 3 + i * 0.4;
      q.beginPath(); q.arc(fx, fy, 0.65, 0, TAU); q.fill();
    }
  }
  // philtrum: a soft groove from the nose down to the parting of the lips, and the lips' soft shadow line
  for (const [w, a] of [[5, 0.08], [2.6, 0.16], [1.2, 0.28]]) {
    q.strokeStyle = "rgba(90,50,40," + a + ")"; q.lineWidth = w; q.lineCap = "round";
    q.beginPath(); q.moveTo(nx, ny + 6); q.lineTo(nx, ny + 15); q.stroke();
    q.beginPath(); q.moveTo(nx, ny + 15); q.quadraticCurveTo(nx - 5, ny + 21, nx - 12, ny + 19); q.stroke();
    q.beginPath(); q.moveTo(nx, ny + 15); q.quadraticCurveTo(nx + 5, ny + 21, nx + 12, ny + 19); q.stroke();
  }
  // the chin: a small round form, lit on top, shadow beneath where it turns under
  const cg = q.createRadialGradient(nx, FACE.chin[1] - 4, 1, nx, FACE.chin[1], 13);
  cg.addColorStop(0, "rgba(255,248,236,0.3)"); cg.addColorStop(0.6, "rgba(255,248,236,0)"); cg.addColorStop(1, "rgba(70,40,30,0.3)");
  q.fillStyle = cg; q.beginPath(); q.ellipse(nx, FACE.chin[1], 12, 8, 0, 0, TAU); q.fill();
  const ch = q.createLinearGradient(0, FACE.chin[1] + 4, 0, FACE.chin[1] + 16);
  ch.addColorStop(0, "rgba(60,30,20,0.3)"); ch.addColorStop(1, "rgba(60,30,20,0)");
  q.fillStyle = ch; q.fillRect(nx - 20, FACE.chin[1] + 4, 40, 12);
  q.restore();
  // nose leather: a rounded shield, lighter on the bridge, damp highlight, soft nostrils
  const np = new Path2D();
  np.moveTo(nx - 8, ny - 4); np.quadraticCurveTo(nx, ny - 6.5, nx + 8, ny - 4);
  np.quadraticCurveTo(nx + 7, ny + 1, nx + 1.2, ny + 5.5); np.quadraticCurveTo(nx, ny + 6.4, nx - 1.2, ny + 5.5);
  np.quadraticCurveTo(nx - 7, ny + 1, nx - 8, ny - 4); np.closePath();
  const ng = q.createLinearGradient(0, ny - 6, 0, ny + 6);
  ng.addColorStop(0, "#d8968a"); ng.addColorStop(0.6, "#b46a62"); ng.addColorStop(1, "#7a4040");
  q.fillStyle = ng; q.fill(np);
  q.save(); q.clip(np);
  K.texFill(q, "noise", np, { scale: 5, alpha: 0.3, mode: "overlay", tex: { seed: 33 } });
  q.fillStyle = "rgba(60,20,20,0.6)";
  for (const s of [-1, 1]) { q.beginPath(); q.ellipse(nx + s * 3.6, ny + 1.6, 1.7, 1.1, s * 0.5, 0, TAU); q.fill(); }
  q.restore();
  q.fillStyle = "rgba(255,240,236,0.55)";
  q.beginPath(); q.ellipse(nx + 2.5, ny - 3.6, 2.2, 1, -0.2, 0, TAU); q.fill();
  // the eyes
  catEye(q, FACE.eyeL[0], FACE.eyeL[1], 17.5, 14, 0.14, blink, -1);
  catEye(q, FACE.eyeR[0], FACE.eyeR[1], 17.5, 14, -0.14, blink, 1);
  // a cheek ruff: hair tufts breaking the head's outline, lit warm on the sun side
  const R = K.rng("f20cheek");
  q.lineCap = "round";
  for (let i = 0; i < 80; i++) {
    const s = i % 2 ? 1 : -1;
    const u = R();
    const ex = s < 0 ? K.lerp(472, 486, u) - Math.sin(u * Math.PI) * 6 : K.lerp(646, 630, u) + Math.sin(u * Math.PI) * 6;
    const ey = K.lerp(250, 334, u);
    const len = 3 + R() * 6 + Math.sin(u * Math.PI) * 4;
    const a = (s < 0 ? Math.PI : 0) + (u - 0.3) * 0.9 * s + (R() - 0.5) * 0.5;
    q.strokeStyle = s > 0 ? (R() > 0.4 ? "rgba(255,200,130,0.75)" : "rgba(214,140,70,0.75)") : (R() > 0.5 ? "rgba(170,110,70,0.7)" : "rgba(130,84,60,0.65)");
    q.lineWidth = 0.5 + R() * 0.8;
    q.beginPath(); q.moveTo(ex - Math.cos(a) * 4, ey - Math.sin(a) * 4);
    q.quadraticCurveTo(ex + Math.cos(a) * len * 0.5, ey + Math.sin(a) * len * 0.5 - 1, ex + Math.cos(a + 0.3 * s) * len, ey + Math.sin(a + 0.3 * s) * len);
    q.stroke();
  }
}

// the bent left ear: the straight tip above the crease is lifted out of the painted fur, flipped forward and down
// about the crease (so the fold keeps the real fur texture), shaded as the back of the ear, and its thin edge lit
const EARCUT = [[578, 104], [660, 104], [648, 190], [584, 188]];
function bentEar(q) {
  const T = q.getTransform();
  const r = [576, 100, 88, 94];
  const p0 = T.transformPoint({ x: r[0], y: r[1] }), p1 = T.transformPoint({ x: r[0] + r[2], y: r[1] + r[3] });
  const dw = Math.max(2, Math.ceil(p1.x - p0.x)), dh = Math.max(2, Math.ceil(p1.y - p0.y));
  const px = K.pixelScale();
  const E = K.layer(dw / px + 1, dh / px + 1, "f20ear");
  const e = E.g;
  e.setTransform(1, 0, 0, 1, 0, 0);
  e.drawImage(q.canvas, Math.floor(p0.x), Math.floor(p0.y), dw, dh, 0, 0, dw, dh);
  const cut = new Path2D();
  EARCUT.forEach(([x, y], i) => (i ? cut.lineTo(x, y) : cut.moveTo(x, y)));
  cut.closePath();
  e.setTransform(T.a, T.b, T.c, T.d, T.e - Math.floor(p0.x), T.f - Math.floor(p0.y));
  // the back of the ear is fur in its own shade: warm it down, keep the texture
  e.globalCompositeOperation = "source-atop";
  e.fillStyle = "rgba(140,70,24,0.6)";
  e.fillRect(r[0], r[1], r[2], r[3]);
  const lg = e.createLinearGradient(0, r[1], 0, r[1] + r[3]);
  lg.addColorStop(0, "rgba(255,190,120,0.35)"); lg.addColorStop(1, "rgba(40,16,4,0.35)");
  e.fillStyle = lg; e.fillRect(r[0], r[1], r[2], r[3]);
  e.globalCompositeOperation = "source-over";
  q.save();
  q.globalCompositeOperation = "destination-out";
  q.fill(cut);
  q.restore();
  // the fold shades the ear base just under the crease
  q.save();
  q.globalCompositeOperation = "source-atop";
  const sh = q.createLinearGradient(0, 186, 0, 222);
  sh.addColorStop(0, "rgba(60,22,4,0.55)"); sh.addColorStop(1, "rgba(60,22,4,0)");
  q.fillStyle = sh; q.fillRect(576, 186, 80, 36);
  q.restore();
  // the tip, folded about the crease line
  const PX0 = 614, PY0 = 189;
  q.save();
  q.translate(PX0, PY0); q.rotate(0.14); q.scale(0.98, -0.6); q.translate(-PX0, -PY0);
  q.clip(cut);
  q.drawImage(E.canvas, 0, 0, dw, dh, Math.floor(p0.x) === p0.x ? r[0] : r[0] - (p0.x - Math.floor(p0.x)) / T.a, r[1] - (p0.y - Math.floor(p0.y)) / T.d, dw / T.a, dh / T.d);
  q.restore();
  // the rounded top of the fold: a short roll of fur, lit along its top by the sun behind
  q.lineCap = "round";
  q.strokeStyle = "rgba(156,82,32,0.9)"; q.lineWidth = 5;
  q.beginPath(); q.moveTo(599, 190); q.quadraticCurveTo(611, 185, 625, 190); q.stroke();
  q.save(); q.globalCompositeOperation = "lighter";
  q.strokeStyle = "rgba(255,200,140,0.35)"; q.lineWidth = 1.6;
  q.beginPath(); q.moveTo(601, 188); q.quadraticCurveTo(611, 183, 623, 187.5); q.stroke();
  q.restore();
}

// ---- shot 5 [42-52] crane up and back: a hundred cats, Sir Whiskers fades into the light, the ring opens ----------
// The crowd is baked once into three depth bands (far / mid / near), each a cached sprite at 1.5x so the opening
// zoom stays crisp, built one band per frame while the shots before it play. Each cat in the bake has a pose
// (back-view sitter, side sitter looking up the hill, loaf, standing, glancing sideways), a size from the ground
// plane, a long soft shadow toward the lens from the sun ahead of them and occlusion where it sits in the grass.
// Five near cats are left out of the bake and drawn live (tails, ears, blinks).
const S5 = { hz: 230, hx: 480, hy: 298, sp: 2.2, sun: { x: 560, y: 222 } };
const RING5 = (() => {
  const out = [];
  const R = K.rng("f20ring5");
  for (let i = 0; i < 110; i++) {
    const a = Math.PI * (0.06 + R() * 0.88); // the near half of the hill, all facing up toward the top
    const d = 0.25 + Math.pow(R(), 0.7) * 0.95;
    const x = 480 + Math.cos(a) * d * 640;
    let y = 300 + Math.sin(a) * d * 230 + d * 20;
    y = Math.max(y, crestY(x, S5.hx, S5.hy, S5.sp) + 10);
    const r = R();
    const kind = r < 0.38 ? 0 : r < 0.6 ? 1 : r < 0.75 ? 2 : r < 0.88 ? 3 : 4;
    // perspective: size grows with distance below the slope's vanishing line
    out.push({ x, y, h: Math.max(5, (y - 262) * 0.24), ci: Math.floor(R() * 10), v: R() > 0.5 ? 1 : 0, side: R() > 0.5 ? 1 : -1, up: R() > 0.3, kind, facing: x < 480 ? 1 : -1, seed: R() });
  }
  out.sort((a, b) => a.y - b.y);
  // the live ones: a handful of the nearest, spread across the frame
  const near = out.filter((m) => m.y > 440 && m.x > 140 && m.x < 820);
  for (let i = 0; i < near.length && i < 5; i++) near[Math.floor((i * near.length) / 5)].live = true;
  return out;
})();
const BANDS5 = [[0, 345], [345, 420], [420, 1e4]];
const CROWD_SC = 1.5;
function crowdCat(c, m, t, sun) {
  const x = m.x, y = m.y, h = m.h;
  // the long soft shadow toward the lens (the sun is ahead of them, up the hill) and the occlusion in the grass
  K.shadowBlob(c, x + (x - sun.x) * 0.04, y + h * 0.16, h * 0.34, h * 0.2, { alpha: 0.45, color: "#10140e" });
  K.shadowBlob(c, x, y, h * 0.36, h * 0.06, { alpha: 0.7, color: "#0a0c08", soft: 0.4 });
  const coat = CROWD[m.ci % CROWD.length];
  const lit = { rim: { x: sun.x, y: sun.y, color: "#ffd090", strength: 1.7 }, key: { x: x, y: y - 500, color: "#9aa6cc", strength: 0.35 }, fill: "#2e3446", ambient: "#56607e", ambientK: 0.32, backlit: 0.9, castShadow: 0, shadow: false, collar: false, bell: false, coat };
  if (m.kind === 0) {
    catBack(c, x, y, h, m.ci, { v: m.v, side: m.side, tailUp: m.up, rim: "#ffc88a", amb: "#6a7088", shadow: false, light: { x: sun.x, y: sun.y } });
  } else if (m.kind === 1) {
    K.drawCat(c, x, y, h / 1.75, { ...lit, pose: "sit", facing: m.facing, headTurn: -0.75, t: t + m.seed * 9, autoBlink: false, tail: 0.3 });
  } else if (m.kind === 2) {
    K.drawCat(c, x, y, h / 1.25, { ...lit, pose: "loaf", facing: m.facing, headTurn: -0.5, t: t + m.seed * 9, autoBlink: false });
  } else if (m.kind === 3) {
    K.drawCat(c, x, y, h / 1.45, { ...lit, pose: "stand", facing: m.facing, headTurn: -0.6, tailUp: m.up ? 1 : 0.3, t: t + m.seed * 9, autoBlink: false });
  } else {
    K.drawCat(c, x, y, h / 1.75, { ...lit, pose: "sit", facing: m.facing, headTurn: 0.35, t: t + m.seed * 9, autoBlink: false, tail: 0.3 });
  }
  // the grass the cat sits in hides its toes and the base of the tail
  if (h > 9) K.grass(c, x - h * 0.42, x + h * 0.42, y + 1, { seed: 600 + Math.round(m.seed * 999), color: "#3e4a34", light: "#c8c890", dark: "#141a10", height: h * 0.13, t: 0, wind: 0, density: 0.8, sun, dry: 0.3 });
}
// The bands are painted a few cats at a time (warmCrowd, from the shots before), so no single frame pays for
// a hundred cats; if a band is needed before it is finished, the rest is painted at once. Same pixels either way.
const CROWDC = [];
let crowdPx = 0;
function crowdStep(i, n, W, H) {
  const px = K.pixelScale() * CROWD_SC;
  if (crowdPx !== px) { crowdPx = px; CROWDC.length = 0; }
  let e = CROWDC[i];
  if (!e) {
    const w = W + 2 * M, h = H + 2 * M;
    const c = K.makeCanvas(Math.ceil(w * px), Math.ceil(h * px));
    const [y0, y1] = BANDS5[i];
    e = CROWDC[i] = { c, g: c.getContext("2d"), list: RING5.filter((m) => !m.live && m.y >= y0 && m.y < y1), next: 0 };
    e.g.setTransform(px, 0, 0, px, M * px, M * px);
  }
  for (; e.next < e.list.length && n > 0; n--, e.next++) {
    e.g.save();
    try { crowdCat(e.g, e.list[e.next], 46, S5.sun); } catch (err) { console.warn("[f20] crowd cat failed", err); }
    e.g.restore();
  }
  return e;
}
const crowdBand = (i, W, H) => crowdStep(i, 1e9, W, H).c;
// paint at most `budget` more crowd cats (front to back of the band list), returns true when all are done
function warmCrowd(budget = 4) {
  for (let i = 0; i < BANDS5.length && budget > 0; i++) {
    const e = crowdStep(i, 0, 960, 540);
    const n = Math.min(budget, e.list.length - e.next);
    if (n > 0) { crowdStep(i, n, 960, 540); budget -= n; }
  }
}
function shot5(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 42, 52));
  const { hz, hx, hy, sp, sun } = S5;
  K.withCamera(g, W, H, { x: 480, y: K.lerp(326, 288, p), zoom: K.lerp(1.5, 1.04, p), shakeT: t, shakeAmt: 0.8 }, (c) => {
    dawnAir(c, W, H, t, hz, sun, { sunR: 13, cloudY: 0, key: "s5" });
    putWide(c, wide("s5far", W, H, (s) => farRidges(s, W, H, hz, sun)), W, H);
    mist(c, W, "s5a", hz + 26, 30, sun.x, t - 42, { alpha: 0.75 });
    putWide(c, wide("s5mid", W, H, (s) => midRidge(s, W, H, hz, sun)), W, H);
    mist(c, W, "s5b", hz + 54, 34, sun.x, (t - 42) * 1.3, { alpha: 0.6, seed: 5 });
    putWide(c, wide("s5hill", W, H, (s) => paintHill(s, W, H, hx, hy, sp, sun)), W, H);
    // Sir Whiskers: translucent, glowing, drifting up into the light 48-51.5
    const fade = 1 - K.smooth(K.seg(t, 48, 51.5));
    const drift = K.ease.in(K.seg(t, 48, 51.5)) * 26;
    K.glow(c, 600, 278 - drift, 60, "#ffe2a0", 0.12 + 0.3 * (1 - fade) * fade * 2);
    if (fade > 0.01) {
      const L = inLayer(c, W, H, "f20sir", (q) => {
        K.drawCat(q, 600, 298 - drift, 24, { pose: "sit", facing: -1, coat: OLD, collar: false, bell: false, t, headTurn: 0.4, blink: 0.5, light: { x: sun.x, y: sun.y, color: "#ffe2a8", strength: 1.8 }, shadow: false });
      });
      put(c, W, H, L, 0.4 * fade);
      put(c, W, H, L, 0.3 * fade, 0, "lighter");
    }
    // gold motes rising off him
    const on = K.smooth(K.seg(t, 46.5, 48.5)) * (1 - K.smooth(K.seg(t, 51.5, 52)));
    for (let i = 0; i < 22 && on > 0; i++) {
      const life = ((t * 0.35 + K.hash(i, 51)) % 1);
      const mx = 600 + (K.hash(i, 52) - 0.5) * 30 + Math.sin(t * 1.3 + i) * 4, my = 300 - drift - life * 70;
      K.glow(c, mx, my, 1.2 + K.hash(i, 53) * 1.6, "#ffe6a8", on * Math.sin(Math.PI * life) * 0.9);
    }
    // the ring opening beside you, home on the other side
    const open = K.ease.back(K.seg(t, 45.5, 47.5));
    if (open > 0.01) ringView(c, W, H, t, 400, 262, 40 * open, 0.12, 0.7);
    // you and him at the top, back-lit, each in a contact shadow
    K.shadowBlob(c, 474, 301, 18, 2.6, { alpha: 0.55, color: "#141a10" });
    K.drawPerson(c, 470, 300, 54, { view: "back", hood: false, crouch: 0.7, bell: false, t, light: { x: sun.x, y: sun.y, color: "#ffd9a0", strength: 1.4, z: -0.8 }, ambient: "#2e3446" });
    K.shadowBlob(c, 492, 300.5, 6, 1.4, { alpha: 0.6, color: "#141a10" });
    K.drawCat(c, 492, 300, 11, BISC({ pose: "sit", facing: -1, t, bell: true, light: { x: sun.x, y: sun.y, color: "#ffe2a8", strength: 1.4 } }));
    // a hundred cats in the dewy grass, all looking up the hill: three baked depth bands, a few live ones
    const live = RING5.filter((m) => m.live);
    for (let i = 0; i < BANDS5.length; i++) {
      c.drawImage(crowdBand(i, W, H), -M, -M, W + 2 * M, H + 2 * M);
      for (const m of live) if (m.y >= BANDS5[i][0] && m.y < BANDS5[i][1]) crowdCat(c, m, t, sun);
    }
    dew(c, t, hx, hy, sp, 40, 430, sun);
    putWide(c, wideBlur("s5fg", W, H, 8, (s) => fgGrass(s, W, H, 531, sun, { h: 100, y: H + 60 })), W, H);
  });
}

// the paw ring with home showing through it: the garden still, scaled into the opening, a warm edge where the
// two worlds meet, and the ring stones
function ringView(c, W, H, t, RX, RY, RR, sc, lit) {
  c.save();
  c.beginPath(); c.ellipse(RX, RY, RR * 0.86, RR * 0.82, 0, 0, TAU); c.clip();
  c.translate(RX, RY); c.scale(sc, sc); c.translate(-480, -300);
  c.drawImage(gardenStill(W, H), -M, -M, W + 2 * M, H + 2 * M);
  c.restore();
  c.save();
  c.globalCompositeOperation = "lighter";
  const eg = c.createRadialGradient(RX, RY, RR * 0.55, RX, RY, RR * 0.9);
  eg.addColorStop(0, "rgba(255,226,170,0)");
  eg.addColorStop(0.85, "rgba(255,226,170,0.28)");
  eg.addColorStop(1, "rgba(255,226,170,0)");
  c.fillStyle = eg;
  c.beginPath(); c.ellipse(RX, RY, RR * 0.92, RR * 0.88, 0, 0, TAU); c.fill();
  c.restore();
  stoneRing(c, RX, RY, RR, t, { tilt: 0.06, silver: 0, lit: () => lit });
}

/// ---- the garden at home, at dawn after the rain --------------------------------------------------------------------
// The sun is low behind the far fence on the right, so everything is back-lit: the wet lawn glitters toward
// the sun, the fence and stones are in their own shade with bright edges, and long shadows run at the lens.
// The whole garden is ONE cached sprite (sky, trees, fence, lawn, puddle, path, stones); per frame only the
// glitter, the two characters, a swaying foreground-grass sprite and the light are drawn.
const GSUN = { x: 760, y: 232 };
const GHZ = 250;
const GFY = GHZ + 46; // fence foot
function gardenStill(W, H) {
  return wide("garden", W, H, (s) => gardenPaint(s, W, H));
}
// a real tree in back light: a trunk that forks into limbs, a canopy of many leaf clusters grouped in lobes,
// dark inside (occlusion), lit through at the edges toward the sun, with holes where the sky shows through
function gardenTree(s, x, y, sc, seed, sun) {
  const R = K.rng("f20tree" + seed);
  // trunk and limbs
  s.save();
  s.lineCap = "round";
  const limbs = [];
  const trunkTop = [x + (R() - 0.5) * 10 * sc, y - 90 * sc];
  s.strokeStyle = "#2a2622";
  s.lineWidth = 11 * sc;
  s.beginPath(); s.moveTo(x, y); s.quadraticCurveTo(x - 4 * sc, y - 50 * sc, trunkTop[0], trunkTop[1]); s.stroke();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.48 + (R() - 0.5) * 0.3, len = (55 + R() * 40) * sc;
    const ex = trunkTop[0] + Math.cos(a) * len, ey = trunkTop[1] + Math.sin(a) * len;
    limbs.push([ex, ey]);
    s.lineWidth = (5 + R() * 3) * sc;
    s.beginPath(); s.moveTo(trunkTop[0], trunkTop[1]); s.quadraticCurveTo((trunkTop[0] + ex) / 2 + (R() - 0.5) * 20 * sc, (trunkTop[1] + ey) / 2, ex, ey); s.stroke();
  }
  // the back-lit edge of the trunk
  s.strokeStyle = "rgba(255,210,150,0.35)"; s.lineWidth = 1.6 * sc;
  s.beginPath(); s.moveTo(x + 5 * sc, y); s.quadraticCurveTo(x + 2 * sc, y - 50 * sc, trunkTop[0] + 5 * sc, trunkTop[1]); s.stroke();
  s.restore();
  // canopy: lobes of leaf clusters, painted into a layer so the sky holes and the rim can be cut from it
  const L = K.layer(W0, H0, "f20treeL");
  const q = L.g;
  q.translate(M, M);
  const lobes = [[0, -150, 70], [-62, -126, 52], [60, -130, 56], [-30, -188, 46], [36, -182, 48], [-92, -96, 36], [92, -100, 38]];
  for (const [lx, ly, lr] of lobes) {
    const cx = x + lx * sc, cy = y + ly * sc, r = lr * sc;
    for (let k = 0; k < 26; k++) {
      const a = R() * TAU, d = Math.sqrt(R()) * r;
      const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d * 0.85;
      const rr = (7 + R() * 9) * sc;
      // darker toward the lobe's inside and bottom (occlusion), lighter at the top
      const k1 = K.clamp(0.25 + (cy - py) / (r * 2.2) + (d / r) * 0.35);
      q.fillStyle = K.mix("#0e160c", "#3a4a26", k1);
      q.beginPath();
      for (let j = 0; j <= 9; j++) { const b = (j / 9) * TAU, rj = rr * (0.75 + 0.35 * K.hash(j + k * 13, seed)); if (j) q.lineTo(px + Math.cos(b) * rj, py + Math.sin(b) * rj); else q.moveTo(px + Math.cos(b) * rj, py + Math.sin(b) * rj); }
      q.closePath(); q.fill();
    }
  }
  // sky holes
  q.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 26; i++) {
    const [lx, ly, lr] = lobes[Math.floor(R() * lobes.length)];
    const a = R() * TAU, d = (0.35 + R() * 0.6) * lr * sc;
    q.beginPath(); q.ellipse(x + lx * sc + Math.cos(a) * d, y + ly * sc + Math.sin(a) * d, (2 + R() * 4) * sc, (1.5 + R() * 3) * sc, R() * 3, 0, TAU); q.fill();
  }
  q.globalCompositeOperation = "source-over";
  // the sun through the outer leaves: a translucent yellow-green rim on the side toward it
  const dx = sun.x - x, dy = sun.y - (y - 150 * sc), l = Math.hypot(dx, dy) || 1;
  const E = K.layer(W0, H0, "f20treeE");
  E.g.setTransform(1, 0, 0, 1, 0, 0);
  const px = K.pixelScale();
  E.g.drawImage(L.canvas, 0, 0);
  E.g.globalCompositeOperation = "destination-out";
  E.g.drawImage(L.canvas, (-dx / l) * 5 * sc * px, (-dy / l) * 5 * sc * px);
  E.g.globalCompositeOperation = "source-in";
  E.g.fillStyle = "#d8e080";
  E.g.fillRect(0, 0, E.canvas.width, E.canvas.height);
  s.save();
  s.setTransform(px, 0, 0, px, 0, 0);
  s.drawImage(L.canvas, 0, 0, W0, H0);
  s.globalCompositeOperation = "lighter";
  s.globalAlpha = 0.55;
  s.drawImage(E.canvas, 0, 0, W0, H0);
  s.restore();
}
let W0 = 1088, H0 = 668;
// the lawn as a perspective ground plane, per pixel at half resolution: turf clumps whose scale shrinks to the
// horizon, colour variation (moss, clover, straw), wet sheen mirroring the bright sky toward the sun (Fresnel:
// stronger at grazing angles), darker and cooler near the lens, and dew points sparkling.
function lawnField(W, H) {
  const q = 2, w = W + 2 * M, y0 = GFY, h = H + M - y0;
  return K.texBake("f20lawn", Math.ceil(w / q), Math.ceil(h / q), (u, v, out, px, py) => {
    const x = px * q - M, y = y0 + py * q;
    const dz = y - (GHZ + 24); // distance below the vanishing line
    const Z = 2600 / Math.max(6, dz); // depth
    const gx = (x - 480) * Z / 900, gz = Z;
    const blade = K.texNoise(gx * 9, gz * 9, 51) * 0.55 + K.texNoise(gx * 23, gz * 23, 52) * 0.35;
    const clump = K.texFbm(gx * 1.3, gz * 1.3, 53, 4);
    const moss = K.clamp(K.texFbm(gx * 0.4 + 7, gz * 0.4, 54, 3) * 1.8 - 0.3);
    const straw = K.clamp(K.texFbm(gx * 0.5 + 2, gz * 0.5 + 5, 55, 3) * 2 - 0.6);
    // detail fades with distance (texture minification): far grass is a smooth tone
    const det = K.clamp(1.6 - Z / 30);
    let r = 52, g = 78, b = 36;
    r += moss * -10; g += moss * 6; b += moss * 4;
    r += straw * 50; g += straw * 34; b += straw * 6;
    const lum = 1 + (0.34 * blade + 0.26 * clump) * det;
    r *= lum; g *= lum; b *= lum;
    // near the lens: in the cool shade of the garden; far: hazed toward the bright air
    const near = K.clamp((y - (GHZ + 120)) / 300);
    r *= 1 - near * 0.3; g *= 1 - near * 0.25; b *= 1 - near * 0.1;
    const fr = K.clamp(1 - dz / 160); // grazing angle: the wet lawn mirrors the sky
    const sunK = Math.exp(-Math.pow((x - GSUN.x) / 260, 2));
    const sheen = fr * (0.35 + 0.65 * sunK) * (0.7 + 0.3 * blade);
    r = K.lerp(r, 236, sheen * 0.6); g = K.lerp(g, 222, sheen * 0.6); b = K.lerp(b, 196, sheen * 0.6);
    const haze = K.clamp(1 - dz / 90) * 0.45;
    r = K.lerp(r, 214, haze); g = K.lerp(g, 206, haze); b = K.lerp(b, 194, haze);
    // dew: rare bright points, more toward the sun
    if (K.hash(px * 7919 + py * 104729, 56) > 0.9993 - sunK * 0.0015) { r = 255; g = 250; b = 236; }
    out[0] = r; out[1] = g; out[2] = b; out[3] = 255;
  });
}
// a weathered picket fence, back-lit: boards of slightly different height and lean, grey-white paint worn to
// silver wood, rails on our side in shade, the low sun burning through the gaps and along the board edges
function fencePaint(s, x0, x1, y, h, sun, hole) {
  const R = K.rng("f20fence");
  // the sun leaking through the gaps: a bright strip behind the boards, hottest toward the sun
  const glow = s.createLinearGradient(x0, 0, x1, 0);
  for (let i = 0; i <= 8; i++) { const x = K.lerp(x0, x1, i / 8); glow.addColorStop(i / 8, K.rgba("#fff0d0", 0.25 + 0.7 * Math.exp(-Math.pow((x - sun.x) / 220, 2)))); }
  s.fillStyle = glow;
  s.fillRect(x0, y - h * 0.95, x1 - x0, h * 0.95);
  // rails (our side)
  for (const ry of [y - h * 0.78, y - h * 0.24]) {
    const rg = s.createLinearGradient(0, ry - 3, 0, ry + 3);
    rg.addColorStop(0, "#9a9a9c"); rg.addColorStop(1, "#4e5258");
    s.fillStyle = rg; s.fillRect(x0, ry - 3, x1 - x0, 6);
  }
  const bw = 9.5, gap = 3.6;
  for (let x = x0; x < x1; x += bw + gap + (R() - 0.5) * 0.8) {
    const bh = h * (0.95 + (R() - 0.5) * 0.08) * (hole && x > hole[0] && x < hole[1] ? 0.55 : 1);
    const tilt = (R() - 0.5) * 0.05;
    const top = y - bh;
    s.save();
    s.translate(x + bw / 2, y);
    s.rotate(tilt);
    const p = new Path2D();
    p.moveTo(-bw / 2, 0); p.lineTo(-bw / 2, -bh + 5); p.lineTo(0, -bh - 1.5 + (R() - 0.5) * 2); p.lineTo(bw / 2, -bh + 5); p.lineTo(bw / 2, 0); p.closePath();
    // shaded face: weathered paint, a little greener at the foot (algae), darker low (ground occlusion)
    const fg = s.createLinearGradient(0, -bh, 0, 0);
    const paint = R();
    fg.addColorStop(0, K.mix("#a8acb4", "#8a8a86", paint * 0.5)); fg.addColorStop(0.7, K.mix("#8c929a", "#76786e", paint * 0.5)); fg.addColorStop(1, "#4a5444");
    s.fillStyle = fg; s.fill(p);
    s.save(); s.clip(p);
    // grain and worn paint
    s.strokeStyle = "rgba(60,58,52,0.22)"; s.lineWidth = 0.5;
    for (let k = 0; k < 3; k++) { const gx = -bw / 2 + 1.5 + R() * (bw - 3); s.beginPath(); s.moveTo(gx, 0); s.lineTo(gx + (R() - 0.5), -bh); s.stroke(); }
    for (let k = 0; k < 2; k++) if (R() > 0.4) { s.fillStyle = "rgba(110,100,84,0.35)"; s.beginPath(); s.ellipse(-bw / 2 + R() * bw, -bh * R(), 1.5 + R() * 2.5, 3 + R() * 6, 0, 0, TAU); s.fill(); }
    s.restore();
    // the board's thin edges glow where the sun skims them (translucent paint film), brighter toward it
    const sk = Math.exp(-Math.pow((x - sun.x) / 260, 2));
    s.strokeStyle = K.rgba("#ffd9a0", 0.25 + 0.6 * sk); s.lineWidth = 1;
    s.beginPath(); s.moveTo(bw / 2 - 0.4, 0); s.lineTo(bw / 2 - 0.4, -bh + 5); s.lineTo(0, -bh - 1.5); s.stroke();
    s.strokeStyle = K.rgba("#ffe6c0", 0.1 + 0.3 * sk);
    s.beginPath(); s.moveTo(-bw / 2 + 0.4, 0); s.lineTo(-bw / 2 + 0.4, -bh + 5); s.stroke();
    s.restore();
  }
  if (hole) {
    // the gap he squeezed through: dark earth under the short boards
    s.fillStyle = "rgba(20,20,16,0.8)";
    s.beginPath(); s.ellipse((hole[0] + hole[1]) / 2, y - 3, (hole[1] - hole[0]) / 2, 7, 0, Math.PI, TAU); s.fill();
  }
}
function gardenPaint(s, W, H) {
  const hz = GHZ, sun = GSUN;
  skyWide(s, W, H, hz + 10, sun, { top: "#4a6aa4", mid: "#b8c2d2", bottom: "#fcdcae", sunColor: "#ffd08a", haze: 0.9 });
  K.cloudLayer3d(s, W, H, 0, { seed: 41, y: 10, horizon: hz - 20, count: 8, color: "#f0dcd0", shade: "#5e6a84", haze: "#e4d6cc", sun, kind: "cumulus", scale: 1.1, alpha: 0.7 });
  sunDisc(s, sun.x, sun.y, 10, hz + 10, { glow: 0.9 });
  // the neighbours' trees and roofs, hazed by distance
  hillsWide(s, W, H, { y: hz + 26, amp: 30, color: "#2e3e30", seed: 33, haze: "#dccfc2", hazeAmt: 0.62, tex: "foliage", freq: 2.6, sun, rim: "#ffe0b0" });
  gardenTree(s, 112, GFY + 2, 1.05, 3, sun);
  gardenTree(s, 884, GFY - 2, 0.85, 5, sun);
  // the lawn
  s.drawImage(lawnField(W, H), -M, GFY, W + 2 * M, H + M - GFY);
  // the fence (with his hole under it), its long board shadows falling toward us
  fencePaint(s, -M, W + M, GFY, 48, sun, [612, 650]);
  K.aoEdge(s, -M, GFY, W + M, GFY, { width: 12, alpha: 0.45, side: -1 });
  s.save();
  s.globalAlpha = 0.1;
  if (K.hasFilter()) s.filter = "blur(2px)";
  s.fillStyle = "#0e1a0c";
  for (let x = -M; x < W + M; x += 13.1) {
    const dx = (x - sun.x) * 0.32;
    s.beginPath(); s.moveTo(x, GFY + 1); s.lineTo(x + 9, GFY + 1); s.lineTo(x + 9 + dx * 0.5, GFY + 80); s.lineTo(x + dx * 0.5, GFY + 80); s.closePath(); s.fill();
  }
  s.restore();
  // the puddle: an irregular sheet of water flush with the lawn, a mirror of the bright sky and the dark fence
  // (no rim, only a darker band of soaked turf at its edge)
  const pcx = 640, pcy = hz + 128, prx = 96, pry = 13;
  const puddle = new Path2D();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * TAU;
    const rr = 1 + 0.22 * K.noise(Math.cos(a) * 2.2 + 7, 3) + 0.12 * K.noise(a * 3.1, 5) + 0.06 * K.noise(a * 9, 8);
    const x = pcx + Math.cos(a) * prx * rr * (1 + 0.25 * Math.sin(a * 2 + 1)), y = pcy + Math.sin(a) * pry * rr;
    if (i) puddle.lineTo(x, y); else puddle.moveTo(x, y);
  }
  puddle.closePath();
  s.save();
  if (K.hasFilter()) s.filter = "blur(3px)";
  s.fillStyle = "rgba(14,22,10,0.45)";
  s.lineWidth = 8; s.strokeStyle = "rgba(14,22,10,0.3)";
  s.stroke(puddle);
  s.restore();
  s.save();
  s.clip(puddle);
  // the mirrored sky: brightest at the far edge (grazing), the sun's glare toward it
  const rf = s.createLinearGradient(0, pcy - pry * 1.4, 0, pcy + pry * 1.4);
  rf.addColorStop(0, "#f6e2c4"); rf.addColorStop(0.45, "#c8c6cc"); rf.addColorStop(1, "#7e90b0");
  s.fillStyle = rf; s.fillRect(pcx - prx * 1.6, pcy - pry * 1.6, prx * 3.2, pry * 3.2);
  // the fence upside down in it (dark pickets against the bright sky), squashed by the grazing view
  s.save();
  s.translate(0, pcy - pry * 1.15);
  s.scale(1, -0.32);
  s.translate(0, -GFY);
  s.globalAlpha = 0.75;
  fencePaint(s, pcx - prx * 1.6, pcx + prx * 1.6, GFY, 48, sun, null);
  s.restore();
  K.glow(s, pcx + 60, pcy - 4, 26, "#fff2d8", 0.6);
  // a breath of wind ruffles the far half into fine ripples
  s.strokeStyle = "rgba(255,255,255,0.12)"; s.lineWidth = 0.6;
  for (let i = 0; i < 9; i++) { const yy = pcy - pry * 0.9 + i * 2.2, xx = pcx - prx + K.hash(i, 61) * prx; s.beginPath(); s.moveTo(xx, yy); s.lineTo(xx + 20 + K.hash(i, 62) * 40, yy); s.stroke(); }
  s.restore();
  // blades standing in the shallow edge break the waterline
  blades(s, pcx - prx * 1.2, pcx + prx * 1.2, (x) => pcy + pry * 0.9 * Math.sin(Math.acos(K.clamp((x - pcx) / (prx * 1.2), -1, 1))), { seed: 77, h: 5, w: 0.8, dens: 0.8, sun, sunW: 300, color: "#3a5228", dark: "#1a2a10", glow: "#c0d060", glowA: 0.5 });
  // the stepping-stone path from the stones to the house: granite, wet, each in its own contact shadow
  for (let i = 0; i < 7; i++) {
    const u = i / 6, x = K.lerp(470, 130, u), y = K.lerp(hz + 150, H + 10, u * u), r = K.lerp(16, 48, u);
    K.shadowBlob(s, x + 1, y + r * 0.08, r * 1.02, r * 0.3, { alpha: 0.55, color: "#0e140c", soft: 0.4 });
    const sp = new Path2D();
    sp.ellipse(x, y, r, r * 0.3, 0, 0, TAU);
    K.texFill(s, "granite", sp, { scale: r * 2.4, scaleY: r * 0.8, tex: { seed: 4 + i, color: "#7c7c78" } });
    s.save(); s.clip(sp);
    const sg = s.createLinearGradient(0, y - r * 0.3, 0, y + r * 0.3);
    sg.addColorStop(0, "rgba(255,226,180,0.4)"); sg.addColorStop(0.4, "rgba(255,226,180,0)"); sg.addColorStop(1, "rgba(10,14,20,0.35)");
    s.fillStyle = sg; s.fillRect(x - r, y - r * 0.3, r * 2, r * 0.6);
    s.restore();
    blades(s, x - r * 1.1, x + r * 1.1, (xx) => y + r * 0.3 * Math.sqrt(Math.max(0, 1 - Math.pow((xx - x) / (r * 1.1), 2))) + 1, { seed: 90 + i, h: K.lerp(4, 12, u), w: K.lerp(0.7, 1.6, u), dens: 0.6, sun, sunW: 400, color: "#36502a", dark: "#14200e", glow: "#c0d060", glowA: 0.5 });
  }
  // the two old standing stones from that night, wet and lichened, with long shadows toward us
  K.shadowBlob(s, 356, hz + 138, 26, 14, { alpha: 0.45, color: "#0e140c" });
  K.shadowBlob(s, 517, hz + 126, 22, 11, { alpha: 0.45, color: "#0e140c" });
  K.stone(s, 360, hz + 124, 50, 98, { seed: 2, wet: 0.7, lichen: 0.6, light: sun });
  K.stone(s, 520, hz + 114, 42, 80, { seed: 4, wet: 0.7, lichen: 0.6, light: sun });
  blades(s, 330, 390, () => hz + 125, { seed: 81, h: 9, w: 1, dens: 1.2, sun, sunW: 400, color: "#36502a", dark: "#14200e", glow: "#c0d060", glowA: 0.5 });
  blades(s, 495, 545, () => hz + 115, { seed: 82, h: 8, w: 1, dens: 1.2, sun, sunW: 400, color: "#36502a", dark: "#14200e", glow: "#c0d060", glowA: 0.5 });
  // back-lit wet grass along the near lawn
  blades(s, -M, W + M, () => H + 6, { seed: 213, depth: 30, h: 40, w: 2.4, dens: 1.1, sun, sunW: 500, color: "#2e4422", dark: "#0e180a", glow: "#b8d070", rim: "#fff0c0", glowA: 0.45 });
}
// live sparkle on the wet lawn: droplets catching the low sun (brightest toward it)
function lawnGlitter(g, W, H, t, n) {
  for (let i = 0; i < n; i++) {
    const x = K.hash(i, 214) * W, y = GHZ + 60 + Math.pow(K.hash(i, 215), 1.3) * (H - GHZ - 60);
    const toward = Math.exp(-Math.pow((x - GSUN.x) / 320, 2));
    const tw = Math.pow(Math.max(0, Math.sin(t * (1.6 + K.hash(i, 216)) + i * 1.7)), 6);
    const a = tw * (0.3 + 0.7 * toward);
    if (a > 0.05) K.glow(g, x, y, 1.2 + K.hash(i, 217) * 1.4, "#fff6e0", a);
  }
}

// ---- shot 6 [52-62] step through; white flash; the garden at home --------------------------------------------------
const S6 = { hz: 300, hx: 480, hy: 336, sp: 2.6, sun: { x: 760, y: 226 } };
function shot6(g, W, H, t) {
  if (t < 55.8) {
    const p = K.ease.in(K.seg(t, 52, 55.8));
    const { hz, hx, hy, sp, sun } = S6;
    K.withCamera(g, W, H, { x: 480, y: 270, zoom: 1.04 + p * 0.25, shakeT: t, shakeAmt: 1.2 + Math.exp(-(t - 52) * 5) * 3 }, (c) => {
      dawnAir(c, W, H, t, hz, sun, { sunR: 13, cloudY: 0, key: "s6" });
      putWide(c, wide("s6far", W, H, (s) => farRidges(s, W, H, hz, sun)), W, H);
      mist(c, W, "s6a", hz + 30, 30, sun.x, t - 52, { alpha: 0.75 });
      putWide(c, wide("s6hill", W, H, (s) => paintHill(s, W, H, hx, hy, sp, sun)), W, H);
      const RX = 480, RY = 250, RR = 210;
      ringView(c, W, H, t, RX, RY, RR, 0.62, 0.35);
      // the garden's light spills out through the ring onto the grass at your feet
      K.lightPool(c, RX, RY + RR * 0.95, RR * 1.3, "#ffe8c0", { flat: 0.25, intensity: 0.25 + p * 0.3 });
      c.save();
      c.globalCompositeOperation = "lighter";
      c.fillStyle = K.rgba("#fff0d0", p * 0.28);
      c.beginPath(); c.ellipse(RX, RY, RR * 0.86, RR * 0.81, 0, 0, TAU); c.fill();
      c.restore();
      // he walks a step ahead and looks back; you follow, both lit by the ring from in front
      const w = K.ease.inOut(K.seg(t, 52, 55.6));
      const ringL = { x: RX, y: RY, color: "#fff0d0", strength: 1.6 };
      const kx = K.lerp(500, 470, w), ky = K.lerp(430, 378, w);
      K.shadowBlob(c, kx - 6, ky + 1, K.lerp(26, 18, w), 3.4, { alpha: 0.55, color: "#141a10" });
      K.drawCat(c, kx, ky, K.lerp(44, 30, w), BISC({ pose: "walk", facing: 1, phase: t * 1.1, t, headTurn: 0.95, tailUp: 1, bell: true, key: ringL, rim: ringL, fill: SKYFILL, ambient: "#4a5470", ambientK: 0.2, backlit: 0.8, castShadow: 0 }));
      const px = K.lerp(420, 440, w), py = K.lerp(560, 450, w), ph = K.lerp(280, 190, w);
      K.shadowBlob(c, px, py, ph * 0.13, ph * 0.025, { alpha: 0.55, color: "#141a10" });
      K.drawPerson(c, px, py, ph, { view: "back", hood: false, walk: true, phase: t * 0.9, t, bell: false, shadow: false, light: { ...ringL, z: -0.7 }, ambient: "#2e3446" });
    });
    return;
  }
  // the garden at home, at dawn
  const p = K.ease.inOut(K.seg(t, 55.8, 62));
  K.withCamera(g, W, H, { x: 480 - p * 30, y: 270, zoom: 1.04 + p * 0.04, shakeT: t, shakeAmt: 0.8 }, (c) => {
    putWide(c, gardenStill(W, H), W, H);
    lawnGlitter(c, W, H, t, 70);
    // he trots along the path toward the house (left), looking back at you; you are right behind him, walking
    // after him (three-quarter back view, angled left). Both back-lit, their shadows running toward the lens.
    const w = K.ease.inOut(K.seg(t, 56, 62));
    const cx = K.lerp(470, 262, w), cy = K.lerp(400, 424, w), cs = K.lerp(34, 40, w);
    K.shadowBlob(c, cx - 4, cy + 2, cs * 0.8, cs * 0.16, { alpha: 0.5, color: "#0a1208" });
    K.shadowBlob(c, cx - 6 - (GSUN.x - cx) * 0.03, cy + cs * 0.4, cs * 0.5, cs * 0.35, { alpha: 0.3, color: "#0e140c" });
    K.drawCat(c, cx, cy, cs, BISC({
      pose: "walk", facing: -1, phase: t * 1.1, t, headTurn: K.env(t, 57.5, 61.5, 0.6, 0.6) * 0.9, tailUp: 1, bell: true, wet: 0.2,
      key: { x: 200, y: -100, color: "#c8d4ec", strength: 0.6 }, rim: { x: GSUN.x, y: GSUN.y, color: "#ffd8a0", strength: 1.6 },
      fill: "#2e3a4c", ambient: "#7a88a4", ambientK: 0.14, backlit: 0.8, castShadow: 0, ground: "#0e140c",
    }));
    const kx = K.lerp(650, 404, w), ky = K.lerp(486, 462, w), kh = K.lerp(186, 170, w);
    K.shadowBlob(c, kx - 2, ky, kh * 0.12, kh * 0.022, { alpha: 0.6, color: "#0a1208" });
    K.shadowBlob(c, kx - 10, ky + kh * 0.12, kh * 0.14, kh * 0.12, { alpha: 0.28, color: "#0e140c" });
    // three-quarter back view: the body turned toward him (a slight lateral squash and skew), mid-stride
    c.save();
    c.translate(kx, ky);
    c.transform(0.86, 0, -0.08, 1, 0, 0);
    K.drawPerson(c, 0, 0, kh, { view: "back", hood: false, walk: true, phase: (t - 56) * 0.95, t, bell: false, shadow: false, light: { x: GSUN.x - kx, y: GSUN.y - ky, color: "#ffe2b0", strength: 1.4, z: -0.8 }, ambient: "#2a3440" });
    c.restore();
    // near grass swaying in the morning air, out of focus: one baked sprite, a gentle shear per frame
    const fg = wideBlur("s6fg", W, H, 4, (s) => blades(s, -M, W + M, () => H + 40, { seed: 218, depth: 20, h: 70, w: 3.2, dens: 0.5, sun: GSUN, sunW: 500, color: "#22361a", dark: "#0a1206", glow: "#a8c060", glowA: 0.35 }));
    c.save();
    c.transform(1, 0, Math.sin(t * 0.9) * 0.025, 1, -Math.sin(t * 0.9) * 0.025 * (H + 40), 0);
    putWide(c, fg, W, H);
    c.restore();
  });
}

// ---- shot 7 [62-80] the bedroom at dawn -----------------------------------------------------------------------------
// One source: the dawn window (upper right). Its light falls as a soft-edged patch across the wall and the quilt,
// with the mullion shadows in it; everything else is lit by the cool sky bouncing round the room.
const WIN = { x: 600, y: 60, w: 250, h: 210 };
const QUILT = ["#566c8c", "#c4a464", "#a45e58", "#ddd2be", "#707c66", "#8a6a5a"];
const QF0 = [232, 312], QF1 = [845, 298], QN0 = [172, 406], QN1 = [884, 390];
const G2 = (u, uc, us, v, vc, vs) => Math.exp(-((u - uc) * (u - uc)) / (us * us) - ((v - vc) * (v - vc)) / (vs * vs));
function quiltH(u, v, t) {
  const br = 1 + Math.sin(t * 1.1) * 0.04;
  const vv = Math.min(v, 1);
  let h = 46 * G2(u, 0.2, 0.12, vv, 0.48, 0.26) * br + 62 * G2(u, 0.42, 0.15, vv, 0.5, 0.27) + 36 * G2(u, 0.64, 0.16, vv, 0.5, 0.22) + 22 * G2(u, 0.82, 0.06, vv, 0.47, 0.18);
  // folds: long soft ridges running off the body toward the edges
  h += 3.2 * Math.sin(u * 34 + vv * 5) * K.smooth(K.clamp((vv - 0.62) / 0.3)) + 2.4 * Math.sin(vv * 16 + u * 6) * K.smooth(K.clamp((u - 0.72) / 0.2));
  return h;
}
function quiltPt(u, v, t) {
  const vv = Math.min(v, 1);
  const fx = K.lerp(QF0[0], QF1[0], u), fy = K.lerp(QF0[1], QF1[1], u);
  const nx = K.lerp(QN0[0], QN1[0], u), ny = K.lerp(QN0[1], QN1[1], u);
  let x = K.lerp(fx, nx, vv), y = K.lerp(fy, ny, vv) - quiltH(u, v, t);
  if (v > 1) { const d = (v - 1) / 0.36; x += Math.sin(u * 40) * 3 * d - d * 6; y += d * 64 + Math.sin(u * 40 + 1) * 2 * d; }
  return [x, y];
}
// the window light's footprint: the window shape thrown down and to the left, mullions included
function beamShape(s, dx, dy, k) {
  const x0 = WIN.x + dx, y0 = WIN.y + dy;
  const sk = -0.62; // shear: the low sun throws the patch left as it falls
  const quad = (ax, ay, bw, bh) => {
    s.beginPath();
    s.moveTo(ax, ay); s.lineTo(ax + bw, ay); s.lineTo(ax + bw + bh * sk, ay + bh); s.lineTo(ax + bh * sk, ay + bh); s.closePath(); s.fill();
  };
  const half = (WIN.w - 10) / 2;
  quad(x0 + 4, y0 + 4, half - 4, WIN.h * k);
  quad(x0 + half + 10, y0 + 4, half - 4, WIN.h * k);
}
function roomStill(W, H) {
  return wide("room", W, H, (s) => {
    K.room(s, W, H, {
      wall: "#8890aa", floor: "#4a3a30", night: false, horizon: 0.74, frame: "#e6ded2",
      window: { ...WIN, outside: (q, x, y, w, h) => {
        q.save();
        q.translate(x, y); q.scale(w / 960 * 1.4, h / 540 * 1.4); q.translate(-200, -120);
        q.drawImage(gardenStill(W, H), -M, -M, W + 2 * M, H + 2 * M);
        q.restore();
      } },
    });
    // the floorboards, in true perspective, mostly in the shadow of the bed
    const fg = s.createLinearGradient(0, 400, 0, H + M);
    fg.addColorStop(0, "#3a2c2a"); fg.addColorStop(1, "#22181a");
    s.fillStyle = fg; s.fillRect(-M, 400, W + 2 * M, H + M);
    s.strokeStyle = "rgba(10,6,8,0.55)"; s.lineWidth = 1.2;
    for (let i = -14; i <= 14; i++) { s.beginPath(); s.moveTo(480 + i * 26, 400); s.lineTo(480 + i * 150, H + M); s.stroke(); }
    s.save(); s.globalCompositeOperation = "lighter"; s.strokeStyle = "rgba(140,120,150,0.08)"; s.lineWidth = 2;
    for (let i = -14; i <= 14; i++) { s.beginPath(); s.moveTo(482 + i * 26, 400); s.lineTo(486 + i * 150, H + M); s.stroke(); }
    s.restore();
    K.aoEdge(s, -M, 400, W + M, 400, { width: 16, alpha: 0.45, side: -1 });
    // the cool sky-lit room: darker away from the window, deepest in the far corner
    s.save();
    s.globalCompositeOperation = "multiply";
    const rg = s.createRadialGradient(WIN.x + WIN.w / 2, WIN.y + WIN.h / 2, 60, WIN.x + WIN.w / 2, WIN.y + WIN.h / 2, 900);
    rg.addColorStop(0, "#ffffff"); rg.addColorStop(0.5, "#b8bcd4"); rg.addColorStop(1, "#5a5e7c");
    s.fillStyle = rg; s.fillRect(-M, -M, W + 2 * M, H + 2 * M);
    s.restore();
    // the paper is hung on old plaster: a broad unevenness over the whole wall
    K.texRect(s, "plaster", -M, -M, W + 2 * M, 400 + M, { scale: 260, alpha: 0.35, mode: "soft-light", tex: { seed: 12 } });
    // window light on the wall (soft penumbra), the raking light revealing the plaster under the paper
    const B = K.layer(W + 2 * M, H + 2 * M, "f20beam");
    B.g.translate(M, M);
    B.g.fillStyle = "rgba(255,206,150,0.62)";
    beamShape(B.g, -250, 170, 0.62);
    B.g.globalCompositeOperation = "source-atop";
    K.texRect(B.g, "plaster", -M, -M, W + 2 * M, 400 + M, { scale: 120, alpha: 0.6, mode: "multiply", tex: { seed: 13 } });
    B.g.globalCompositeOperation = "source-over";
    s.save(); s.setTransform(K.pixelScale(), 0, 0, K.pixelScale(), 0, 0); s.globalCompositeOperation = "lighter";
    K.dof(s, B.canvas, 6); s.restore();
    // headboard: varnished wood, seen three-quarter
    const hb = new Path2D();
    hb.moveTo(62, 196); hb.lineTo(118, 214); hb.lineTo(118, 436); hb.lineTo(62, 452); hb.closePath();
    K.shadowBlob(s, 140, 330, 30, 120, { alpha: 0.35, color: "#141428" });
    K.texFill(s, "wood", hb, { scale: 180, rot: Math.PI / 2, tex: { seed: 9, color: "#5a3a26", planks: 1, varnish: true } });
    s.save(); s.clip(hb);
    const hg = s.createLinearGradient(62, 0, 118, 0);
    hg.addColorStop(0, "rgba(10,8,20,0.6)"); hg.addColorStop(1, "rgba(10,8,20,0.1)");
    s.fillStyle = hg; s.fillRect(60, 190, 60, 270);
    s.restore();
    // its thickness: the inner edge face turned toward the window (warm), and the top bevel catching the sky
    const side = new Path2D();
    side.moveTo(118, 214); side.lineTo(131, 210); side.lineTo(131, 432); side.lineTo(118, 436); side.closePath();
    K.texFill(s, "wood", side, { scale: 120, rot: Math.PI / 2, tex: { seed: 11, color: "#7a5236", planks: 1, varnish: true } });
    s.fillStyle = "rgba(255,190,130,0.12)"; s.fill(side);
    const topB = new Path2D();
    topB.moveTo(62, 196); topB.lineTo(118, 214); topB.lineTo(131, 210); topB.lineTo(75, 192); topB.closePath();
    s.fillStyle = "#8a6a56"; s.fill(topB);
    s.fillStyle = "rgba(200,206,240,0.18)"; s.fill(topB);
    s.save(); s.globalCompositeOperation = "lighter";
    s.strokeStyle = "rgba(255,214,170,0.3)"; s.lineWidth = 1; s.beginPath(); s.moveTo(131, 211); s.lineTo(131, 432); s.stroke();
    s.strokeStyle = "rgba(220,220,255,0.16)"; s.beginPath(); s.moveTo(64, 197); s.lineTo(118, 214.6); s.stroke();
    s.restore();
    // a routed bevel inset on the face: a lit lower lip and a shaded upper lip
    s.strokeStyle = "rgba(0,0,10,0.35)"; s.lineWidth = 1.2;
    s.beginPath(); s.moveTo(70, 212); s.lineTo(110, 225); s.lineTo(110, 425); s.stroke();
    s.strokeStyle = "rgba(255,220,190,0.12)";
    s.beginPath(); s.moveTo(70, 214); s.lineTo(70, 436); s.lineTo(110, 427); s.stroke();
    // bed rail, in deep shade
    const rail = new Path2D();
    rail.moveTo(130, 452); rail.lineTo(892, 432); rail.lineTo(892, 454); rail.lineTo(130, 478); rail.closePath();
    K.texFill(s, "wood", rail, { scale: 160, tex: { seed: 10, color: "#4a3020", planks: 1, varnish: true } });
    s.fillStyle = "rgba(12,10,24,0.5)"; s.fill(rail);
    K.shadowBlob(s, 520, 480, 420, 8, { alpha: 0.6, color: "#0a0a14" });
    // pillow: cotton, plump, lit from the window side with a crease and a soft shadow under it
    const pw = new Path2D();
    pw.moveTo(108, 330);
    pw.bezierCurveTo(100, 296, 150, 282, 210, 286);
    pw.bezierCurveTo(262, 289, 296, 300, 292, 324);
    pw.bezierCurveTo(288, 350, 240, 356, 190, 354);
    pw.bezierCurveTo(140, 352, 112, 350, 108, 330);
    K.shadowBlob(s, 200, 352, 90, 8, { alpha: 0.45, color: "#141428" });
    K.texFill(s, "fabric", pw, { scale: 60, tex: { seed: 3, color: "#c4c4d2" } });
    s.save(); s.clip(pw);
    const pg = s.createRadialGradient(250, 296, 10, 200, 320, 120);
    pg.addColorStop(0, "rgba(255,240,220,0.05)"); pg.addColorStop(0.5, "rgba(40,40,70,0.35)"); pg.addColorStop(1, "rgba(20,20,50,0.72)");
    s.fillStyle = pg; s.fillRect(100, 280, 200, 80);
    s.strokeStyle = "rgba(40,40,70,0.25)"; s.lineWidth = 3;
    s.beginPath(); s.moveTo(150, 300); s.quadraticCurveTo(180, 318, 170, 340); s.stroke();
    s.restore();
    // your hair on the pillow (the back of your head; the rest is under the quilt): a soft dark mass, the strands
    // flowing round the crown, a sheen toward the window, a few loose hairs on the pillow
    const R = K.rng("f20hair");
    const hp = new Path2D();
    hp.moveTo(206, 318); hp.bezierCurveTo(200, 292, 226, 278, 248, 282); hp.bezierCurveTo(270, 286, 278, 302, 272, 318); hp.closePath();
    K.shadowBlob(s, 238, 318, 40, 6, { alpha: 0.5, color: "#141428" });
    s.fillStyle = "#24160c"; s.fill(hp);
    s.save(); s.clip(hp);
    const hgr = s.createRadialGradient(258, 290, 2, 240, 304, 42);
    hgr.addColorStop(0, "rgba(160,110,66,0.6)"); hgr.addColorStop(0.5, "rgba(90,56,30,0.3)"); hgr.addColorStop(1, "rgba(10,6,2,0.5)");
    s.fillStyle = hgr; s.fillRect(196, 274, 90, 50);
    s.lineCap = "round";
    for (let i = 0; i < 90; i++) {
      const a0 = -Math.PI + R() * Math.PI, r0 = 6 + R() * 26;
      const x = 240 + Math.cos(a0) * r0 * 1.2, y = 310 + Math.sin(a0) * r0;
      const a1 = a0 + Math.PI / 2 * 0.9;
      s.strokeStyle = R() > 0.6 ? "rgba(176,124,76,0.4)" : "rgba(14,8,4,0.45)";
      s.lineWidth = 0.6 + R() * 0.5;
      s.beginPath(); s.moveTo(x, y); s.quadraticCurveTo(x + Math.cos(a1) * 6, y + Math.sin(a1) * 6, x + Math.cos(a1 + 0.3) * 12, y + Math.sin(a1 + 0.3) * 12); s.stroke();
    }
    s.restore();
    s.strokeStyle = "rgba(40,24,12,0.5)"; s.lineWidth = 0.6;
    for (let i = 0; i < 7; i++) { const x = 212 + R() * 50, y = 286 + R() * 10; s.beginPath(); s.moveTo(x, y); s.quadraticCurveTo(x - 6 + R() * 4, y - 6, x - 10 + R() * 8, y - 4 - R() * 6); s.stroke(); }
  });
}
/// the quilt, baked once: the patch grid is draped over a soft height field (your body under it, the folds running
// off the edge, the sag between), each patch subdivided and shaded by its normal against the window light,
// with uneven hand-cut patch sizes, sunken seams with running stitches, and cotton weave over it all.
function quiltBake(g) {
  const NU = 20, NV = 10, VMAX = 1.36, SUB = 3;
  const e = 0.015;
  const us = [], vs = [];
  for (let i = 0; i <= NU; i++) us.push(i / NU + (i > 0 && i < NU ? (K.hash(i, 301) - 0.5) * 0.4 / NU : 0));
  for (let j = 0; j <= NV; j++) vs.push(((j / NV) + (j > 0 && j < NV ? (K.hash(j, 302) - 0.5) * 0.35 / NV : 0)) * VMAX);
  const shadeAt = (u, v) => {
    const vc = Math.min(1, v);
    const du = (quiltH(u - e, vc, 0) - quiltH(u + e, vc, 0)) / (2 * e);
    const dv = (quiltH(u, vc - e, 0) - quiltH(u, vc + e, 0)) / (2 * e);
    // window light from the upper right and from behind: slopes facing it are lit, the turned-away sides fall off
    let lum = 0.74 + du * 0.0042 + dv * 0.0018;
    if (v >= 1) lum = 0.5 - (v - 1) * 0.7 + Math.sin(u * 40 + 0.6) * 0.07; // the drop over the edge, its folds
    lum -= (1 - K.clamp(quiltH(u, vc, 0) / 30)) * 0.12; // sag between the masses
    return K.clamp(lum, 0.22, 1.18);
  };
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) {
      const base = QUILT[Math.floor(K.hash(i * 13 + j * 7, 211) * QUILT.length)];
      for (let b = 0; b < SUB; b++) for (let a = 0; a < SUB; a++) {
        const u0 = K.lerp(us[i], us[i + 1], a / SUB), u1 = K.lerp(us[i], us[i + 1], (a + 1) / SUB);
        const v0 = K.lerp(vs[j], vs[j + 1], b / SUB), v1 = K.lerp(vs[j], vs[j + 1], (b + 1) / SUB);
        const lum = shadeAt((u0 + u1) / 2, (v0 + v1) / 2);
        const col = lum < 1 ? K.mix(base, "#14162c", (1 - lum) * 0.9) : K.mix(base, "#fff0d8", (lum - 1) * 1.6);
        const pA = quiltPt(u0, v0, 0), pB = quiltPt(u1, v0, 0), pC = quiltPt(u1, v1, 0), pD = quiltPt(u0, v1, 0);
        g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 0.7;
        g.beginPath(); g.moveTo(pA[0], pA[1]); g.lineTo(pB[0], pB[1]); g.lineTo(pC[0], pC[1]); g.lineTo(pD[0], pD[1]); g.closePath();
        g.fill(); g.stroke();
      }
      // the patch's own fabric: a faint print or plaid on some of them
      const k = K.hash(i * 31 + j * 17, 303);
      const P = (u, v) => quiltPt(K.lerp(us[i], us[i + 1], u), K.lerp(vs[j], vs[j + 1], v), 0);
      if (k > 0.6) {
        g.strokeStyle = "rgba(255,240,220,0.08)"; g.lineWidth = 0.8;
        for (let s = 1; s < 4; s++) { const a = P(s / 4, 0.05), b = P(s / 4, 0.95); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      }
      // the seam: sunken (dark) with puffed cotton either side (light), then a running stitch just inside it
      const q = [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];
      g.strokeStyle = "rgba(14,12,28,0.42)"; g.lineWidth = 1.1;
      g.beginPath(); q.forEach((p, n) => (n ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.stroke();
      const r = [P(0.06, 0.08), P(0.94, 0.08), P(0.94, 0.92), P(0.06, 0.92)];
      g.strokeStyle = "rgba(240,228,200,0.28)"; g.lineWidth = 0.6; g.setLineDash([1.6, 1.8]);
      g.beginPath(); r.forEach((p, n) => (n ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.stroke();
      g.setLineDash([]);
    }
  }
  const out = new Path2D();
  for (let i = 0; i <= 20; i++) { const [x, y] = quiltPt(i / 20, 0, 0); if (i) out.lineTo(x, y); else out.moveTo(x, y); }
  for (let j = 0; j <= 10; j++) { const [x, y] = quiltPt(1, (j / 10) * VMAX, 0); out.lineTo(x, y); }
  for (let i = 20; i >= 0; i--) { const [x, y] = quiltPt(i / 20, VMAX, 0); out.lineTo(x, y); }
  for (let j = 10; j >= 0; j--) { const [x, y] = quiltPt(0, (j / 10) * VMAX, 0); out.lineTo(x, y); }
  out.closePath();
  K.texFill(g, "fabric", out, { scale: 30, alpha: 0.5, mode: "overlay", tex: { seed: 5 } });
  K.texFill(g, "noise", out, { scale: 160, alpha: 0.25, mode: "soft-light", tex: { seed: 6 } });
  // the shade under the drop
  K.aoEdge(g, QN0[0], QN0[1] + 64, QN1[0], QN1[1] + 64, { width: 16, alpha: 0.5, side: 0 });
  return out;
}

// clear raindrops drying on the window glass
function glassBeads(g, t, k) {
  const n = Math.round(19 * k);
  g.save();
  g.beginPath(); g.rect(WIN.x, WIN.y, WIN.w, WIN.h); g.clip();
  for (let i = 0; i < n; i++) {
    const x = WIN.x + 10 + K.hash(i, 241) * (WIN.w - 20), y = WIN.y + 10 + K.hash(i, 242) * (WIN.h - 20);
    const r = 1.6 + K.hash(i, 243) * 2.8;
    // each bead is a tiny lens: dark rim, the bright outside flipped inside it, a hot specular
    g.fillStyle = "rgba(40,46,60,0.25)";
    g.beginPath(); g.ellipse(x, y + r * 0.2, r, r * 1.15, 0, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,240,214,0.35)";
    g.beginPath(); g.ellipse(x + r * 0.1, y + r * 0.45, r * 0.6, r * 0.45, 0, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,250,0.85)";
    g.beginPath(); g.arc(x - r * 0.35, y - r * 0.4, r * 0.26, 0, TAU); g.fill();
  }
  g.restore();
}
function shot7(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 62, 80));
  const dry = K.seg(t, 62, 74);
  K.withCamera(g, W, H, { x: 470 + p * 30, y: 300 + p * 10, zoom: 1.04 + p * 0.08, shakeT: t, shakeAmt: 0.45 }, (c) => {
    putWide(c, roomStill(W, H), W, H);
    // through the window, far away, a single amber pawprint fades from the garden path (66-72)
    const a = K.env(t, 66, 72, 1.0, 2.2);
    if (a > 0) {
      c.save();
      c.beginPath(); c.rect(WIN.x, WIN.y, WIN.w, WIN.h); c.clip();
      K.glow(c, 692, 212, 12, "#ff9a3a", 0.4 * a);
      K.pawprints(c, [{ x: 692, y: 212, a: -0.3, s: 9, alpha: a }], 1.4);
      c.restore();
    }
    glassBeads(c, t, 1 - dry * 0.55);
    putWide(c, wide("quilt", W, H, (s) => quiltBake(s)), W, H);
    // you breathe under it: the body ridge lifts and catches a little more of the window light
    const br = Math.sin(t * 1.1);
    const [bx0, by0] = quiltPt(0.42, 0.5, 0);
    c.save();
    c.globalCompositeOperation = br > 0 ? "screen" : "multiply";
    const bg = c.createRadialGradient(bx0, by0, 4, bx0, by0, 120);
    bg.addColorStop(0, br > 0 ? K.rgba("#ffe0c0", 0.06 * br) : K.rgba("#9090b0", -0.08 * br)); bg.addColorStop(1, "rgba(128,128,128,0)");
    c.fillStyle = bg; c.fillRect(bx0 - 130, by0 - 80, 260, 160);
    c.restore();
    // the window light lying across the quilt
    putWide(c, wideBlur("s7beam", W, H, 5, (s) => { s.fillStyle = "rgba(255,200,140,0.42)"; beamShape(s, -170, 236, 0.5); }), W, H, 1);
    // Biscuit asleep on the quilt beside you; the toy mouse by his paw; the bell catching the sunbeam
    const [cx, cy] = quiltPt(0.7, 0.8, 0);
    const twitch = K.env(t, 68.4, 68.8, 0.08, 0.2);
    // he sinks into the quilt a little: a tight dark contact line under him, a softer occlusion around it
    K.shadowBlob(c, cx, cy + 6, 50, 7, { alpha: 0.5, color: "#0e0c20" });
    K.shadowBlob(c, cx - 2, cy + 4, 40, 2.6, { alpha: 0.75, color: "#08060f", soft: 0.4 });
    // asleep: a slow breath lifts his flank (a small vertical swell about the quilt), the window rims his back
    const sb = 1 + 0.025 * Math.max(0, Math.sin(t * 1.6));
    c.save();
    c.translate(cx, cy + 4); c.scale(1, sb); c.translate(-cx, -cy - 4);
    K.drawCat(c, cx, cy + 4, 84, BISC({
      pose: "sleep", facing: -1, t, bell: false, ears: 0.2 - twitch * 1.2, tail: 0.15, breath: 1.4,
      key: { x: WIN.x + 150, y: WIN.y + 40, color: "#ffe2b8", strength: 1.25 }, rim: { x: WIN.x + 160, y: WIN.y - 40, color: "#ffd8a8", strength: 1.6 },
      fill: "#262a48", ambient: "#6a74a0", ambientK: 0.2, backlit: 0.5, castShadow: 0, ground: "#14122a",
    }));
    c.restore();
    const [mx, my] = quiltPt(0.55, 0.9, 0);
    K.shadowBlob(c, mx - 2, my + 2, 12, 3, { alpha: 0.5, color: "#14122a" });
    K.toyMouse(c, mx, my + 1, 24, { facing: 1 });
    // the bell, on the side toward us, glinting in the sunbeam
    const bx = cx - 0.5 * 84, by = cy + 4 - 0.15 * 84;
    bell(c, bx, by, 13, { t, glint: 0, lx: 0.5, ly: -0.6 });
    K.bellGlint(c, bx + 2, by - 2, 10, t, { strength: 0.55 + 0.45 * Math.sin(t * 1.6) });
    // the shaft of dawn through the air, dust turning in it
    K.volumetricBeam(c, WIN.x + WIN.w * 0.55, WIN.y + 40, 2.2, 520, 0.45, { color: "#ffd8a8", intensity: 0.22, t, width0: 180, seed: 7 });
    K.dust(c, W, H, t, { seed: 207, count: 40, color: "#fff0c8", size: 1.2, alpha: 0.5, area: [380, 80, 420, 320] });
  });
}

// ---- the lens -------------------------------------------------------------------------------------------------------
// one look per shot, blended across the cuts so nothing pops (film.gradeAt)
const LOOK = {
  predawn: { exposure: 0.88, temp: -0.08, tint: 0.0, contrast: 1.13, sat: 0.94, bloom: 0.34, threshold: 0.95, halation: 0.4, lift: [0.004, 0.005, 0.012], gamma: [1, 1, 1], gain: [0.99, 1, 1.03], vignette: 0.45, grain: 0.05, streak: 0.03, weave: 0.8 },
  sunrise: { exposure: 0.98, temp: 0.16, tint: -0.01, contrast: 1.13, sat: 0.98, bloom: 0.42, threshold: 0.95, halation: 0.5, lift: [0.004, 0.004, 0.009], gamma: [1, 1, 1], gain: [1.05, 1, 0.93], vignette: 0.42, grain: 0.05, streak: 0.04, weave: 1 },
  close: { exposure: 0.97, temp: 0.14, tint: -0.01, contrast: 1.12, sat: 0.97, bloom: 0.4, threshold: 0.95, halation: 0.5, lift: [0.004, 0.004, 0.008], gamma: [1, 1, 1], gain: [1.05, 1, 0.93], vignette: 0.5, grain: 0.045, streak: 0.02, weave: 0.7 },
  garden: { exposure: 0.96, temp: 0.1, tint: -0.02, contrast: 1.12, sat: 0.96, bloom: 0.38, threshold: 0.95, halation: 0.42, lift: [0.004, 0.006, 0.01], gamma: [1, 1, 1], gain: [1.04, 1, 0.95], vignette: 0.42, grain: 0.05, streak: 0.02, weave: 1 },
  room: { exposure: 0.95, temp: 0.04, tint: 0, contrast: 1.15, sat: 0.92, bloom: 0.42, threshold: 0.95, halation: 0.45, lift: [0.004, 0.007, 0.016], gamma: [1, 1, 1], gain: [1.07, 1, 0.92], vignette: 0.55, grain: 0.06, streak: 0, weave: 0.5 },
};
const GRADE_KEYS = [[0, "predawn"], [3, "predawn"], [11.5, "sunrise"], [33.85, "sunrise"], [34.15, "close"], [41.85, "close"], [42.15, "sunrise"], [55.6, "sunrise"], [56.0, "garden"], [61.8, "garden"], [62.2, "room"], [80, "room"]];
function blendLook(a, b, k) {
  const o = {};
  for (const f in a) {
    const x = a[f], y = b[f];
    o[f] = Array.isArray(x) ? x.map((v, i) => K.lerp(v, y[i], k)) : K.lerp(x, y, k);
  }
  return o;
}
// the two cuts through light (the step through the ring, the garden to the bedroom) are exposure ramps, not
// white paint: the lens is opened up so the highlights clip first and burn warm, then it closes again and the
// shadows come back
const flashStep = (t) => K.env(t, 54.6, 56.3, 1.2, 0.45);
const flashHome = (t) => K.env(t, 61.7, 62.55, 0.4, 0.45);
function gradeAt(t) {
  let o = LOOK.room;
  for (let i = 0; i < GRADE_KEYS.length - 1; i++) {
    const [t0, a] = GRADE_KEYS[i], [t1, b] = GRADE_KEYS[i + 1];
    if (t <= t1) { o = a === b ? LOOK[a] : blendLook(LOOK[a], LOOK[b], K.smooth(K.seg(t, t0, t1))); break; }
  }
  const f = Math.max(flashStep(t), flashHome(t));
  if (f > 0.001) o = { ...o, exposure: o.exposure * (1 + 5 * f * f), temp: o.temp + 0.18 * f, contrast: o.contrast + 0.1 * f, bloom: o.bloom + 0.3 * f };
  return o;
}

// ---- assembly ----------------------------------------------------------------------------------------------------
// Every shot bakes its static sets (hills, meadow, garden, bedroom, crowd sprites) the first time it is drawn.
// To keep those stalls off the cuts, each later shot is rendered once off-screen, one per frame, while the
// opening is still fading up from black (t < 1.4); the player caps dt, so a slow frame costs no story time.
// Only caches change; the picture does not.
// warming ahead: during the seconds before each shot, its sets are baked one per frame by drawing the shot
// off screen until it reaches a set that is not cached yet (that bake is the frame's whole cost); a shot is done
// once a probe runs through with nothing left to bake. Probes only fill caches; what is drawn never depends on them.
const WARM = [[12, 13], [22, 26], [34, 36], [42, 46], [52, 53], [52, 57], [62, 70]];
let warmKey = "", warmDone = [];
function warmStep(W, H, t) {
  const key = K.pixelScale() + ":" + W + "x" + H;
  if (warmKey !== key) { warmKey = key; warmDone = WARM.map(() => false); }
  if (t >= 22 && t < 42) warmCrowd(4);
  const i = WARM.findIndex(([a], n) => !warmDone[n] && (t < 1.4 ? a <= 12 : a - t > 0.25 && a - t < 9));
  if (i < 0) return;
  const tw = WARM[i][1];
  const L = K.layer(W, H, "f20warm");
  if (L.g.reset) L.g.reset();
  warmBudget = 1;
  try {
    for (const [a, b, fn] of SHOTS) if (tw >= a && tw < b) fn(L.g, W, H, tw);
    warmDone[i] = true;
  } catch (err) {
    if (err !== WARM_STOP) { warmDone[i] = true; console.warn("[f20] warm failed", err); }
  } finally {
    warmBudget = 0;
    if (L.g.reset) L.g.reset(); else L.g.setTransform(1, 0, 0, 1, 0, 0);
  }
}
const SHOTS = [[0, 12, shot1], [12, 22, shot2], [22, 34, shot3], [34, 42, shot4], [42, 52, shot5], [52, 62, shot6], [62, 80.01, shot7]];

const L20 = lines([
  [3.0, 7.0, "The sun came up at the end of the world."],
  [13.0, 16.5, "And there he was."],
  [19.0, 22.5, "He saw you. He knew you."],
  [23.5, 27.5, "He bumped his head into your hand."],
  [28.0, 32.5, "Like he did every morning. Like nothing had changed."],
  [35.0, 39.5, "His bell. Right where it belongs."],
  [43.0, 48.0, "A hundred cats came to see him home."],
  [48.5, 51.5, "And the old cat finally rested."],
  [53.0, 57.5, "He walked ahead. He looked back."],
  [58.0, 61.5, "This time, you were right behind him."],
  [64.0, 68.5, "You found a hundred cats."],
  [69.0, 73.5, "But he found you first.", { rate: 0.85, pitch: 1.0 }],
]);

export const film = {
  id: 20,
  title: "Home",
  chapter: "Finale",
  unlockAt: 100,
  duration: D,
  poster: 40,
  tagline: "You found him. He found you.",
  subs: L20.subs,
  voice: L20.voice,
  score: { mood: "joy", key: "C", bpm: 70, cues: [[2, "swell"], [18, "meow"], [26, "purr"], [34, "bell"], [42, "swell"], [52, "hit"], [62, "purr"], [72, "bell"], [76, "swell"]] },
  grade: LOOK.predawn,
  gradeAt,
  draw(g, t, W, H) {
    g.save();
    if (W !== 960 || H !== 540) g.scale(W / 960, H / 540);
    W = 960; H = 540;
    try {
      g.fillStyle = "#2a2234";
      g.fillRect(0, 0, W, H);
      warmStep(W, H, t);
      for (const [a, b, fn] of SHOTS) if (t >= a && t < b) { fn(g, W, H, t); break; }
      if (t >= 80.01) shot7(g, W, H, 80);
      const ta = K.env(t, 2, 6, 1.0, 1.2);
      if (ta > 0) K.title(g, W, H, "Home", "Finale", ta, { glow: "#3a2440", y: H * 0.32 });
      const dim = K.smooth(K.seg(t, 74.4, 75.6));
      if (dim > 0) K.fadeBlack(g, W, H, 0.5 * dim);
      const te = K.smooth(K.seg(t, 75.8, 77.2)) * (1 - K.smooth(K.seg(t, 79.2, 80)));
      if (te > 0) { g.save(); g.translate(-190, 0); K.title(g, W, H, "THE END", "", te, { glow: "#ffd27a", y: H * 0.36 }); g.restore(); }
      K.fadeBlack(g, W, H, 1 - K.smooth(K.seg(t, 0, 1.4)));
      // the flash on the step through (52 hit; white peaks at 55.8 then reveals the garden)
      // only the very peak of each light cut is painted white; the ramp itself is the lens exposure (gradeAt)
      const fl = Math.max(flashStep(t), flashHome(t));
      if (fl > 0.001) K.fadeColor(g, W, H, Math.pow(fl, 3) * 0.92, "#fff2e0");
      K.fadeBlack(g, W, H, K.smooth(K.seg(t, 78.5, 80)));
      K.letterbox(g, W, H, 1);
    } finally {
      g.restore();
    }
  },
};
