// films/f13.js - Chapter 13 "The Lantern Cats" (FILMS.md f13). The Void, shot like a night photograph
// of an endless mirror flat: a thin skin of still water over cracked salt-crust, reflecting a sharp star
// field, with a low mist on the horizon. Every cat you found sits on it glowing from inside like a paper
// lantern (subsurface light, brightest where the fur is thinnest); each one throws a warm pool onto the
// wet ground, a mirror reflection and slow ripple rings. Together they make a long road of light toward
// a cool cyan paw-portal. The Shadow stands guard just off the road.
// draw(g, t, W, H) is a pure function of t. Everything static is cached; the caches are filled in
// small slices (<= ~8 ms each, one per frame) during the dark opening, so no cut does a first build.
import * as K from "../filmkit.js";
import { hairOver, povHand } from "./lib1214.js";

const D = 64;
const VW = 960, VH = 540;
const XF = 0.9;
const BAR = Math.round(VH * 0.085);

const NAVY = "#0b0f24";
const GOLD = "#ffcf6a";
const CYAN = "#9be7ff";
const MIST = "#1c2550"; // horizon haze (night sky scattered in the mist)
const AMBER = "#ffb45a"; // the light a lantern cat throws on the ground
const HOR = 220; // the reference horizon of the set for shots 2-6

// ---- scratch canvases (device px, identity transform) ------------------------------------------------
const SCR = new Map();
function scratch(key, w, h) {
  w = Math.max(1, Math.ceil(w));
  h = Math.max(1, Math.ceil(h));
  let s = SCR.get(key);
  if (!s) {
    const c = K.makeCanvas(w, h);
    s = { c, g: c.getContext("2d") };
    SCR.set(key, s);
  }
  if (s.c.width < w || s.c.height < h) {
    s.c.width = Math.max(w, s.c.width);
    s.c.height = Math.max(h, s.c.height);
  }
  const g = s.g;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  g.filter = "none";
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.clearRect(0, 0, w + 2, h + 2);
  return s;
}

// ---- staged builds: a cache filled one step per call (each step a few ms), deterministic ----------------
const STAGED = new Map();
function staged(key, w, h, steps) {
  const k = key + "@" + K.pixelScale();
  let S = STAGED.get(k);
  if (!S) {
    const c = K.makeCanvas(w * K.pixelScale(), h * K.pixelScale());
    const g = c.getContext("2d");
    S = { c, g, next: 0, steps, w, h };
    STAGED.set(k, S);
  }
  return S;
}
function stageStep(S) {
  if (S.next >= S.steps.length) return false;
  const g = S.g;
  g.save();
  g.setTransform(K.pixelScale(), 0, 0, K.pixelScale(), 0, 0);
  try { S.steps[S.next](g, S.w, S.h); } catch (err) { console.warn("[f13] stage", err); }
  g.restore();
  S.next++;
  return true;
}
function stagedDone(S) {
  while (stageStep(S));
  return S.c;
}

// ---- textures of our own (vector-built, cheap) -------------------------------------------------------
// cracked salt-crust: a jittered hex lattice of raised ridges with a dark crack down each, tileable 512
function saltTex() {
  return K.sprite("f13:salt", 512, 512, (s) => {
    s.fillStyle = "#1b2336";
    s.fillRect(0, 0, 512, 512);
    K.texRect(s, "macro", 0, 0, 512, 512, { scale: 512, alpha: 0.5, mode: "soft-light", tex: { seed: 31 } });
    const R = K.rng("f13salt");
    const N = 9, M = 8; // lattice columns x rows (tileable: 512 / N, 512 / M)
    const P = [];
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
      P.push([(i + (j % 2) * 0.5 + (R() - 0.5) * 0.85) * (512 / N), (j + (R() - 0.5) * 0.75) * (512 / M)]);
    }
    const at = (i, j) => {
      const ii = ((i % N) + N) % N, jj = ((j % M) + M) % M;
      const p = P[jj * N + ii];
      return [p[0] + Math.floor(i / N) * 512 + (j < 0 ? 0 : 0), p[1] + Math.floor(j / M) * 512];
    };
    // each cell a slightly different tone (dissolved salt, algae, depth)
    for (let j = -1; j <= M; j++) for (let i = -1; i <= N; i++) {
      const [x, y] = at(i, j);
      const gr = s.createRadialGradient(x, y, 0, x, y, 40);
      const v = K.hash(((i + N) % N) + ((j + M) % M) * 17, 5);
      gr.addColorStop(0, v > 0.6 ? "rgba(60,74,104,0.3)" : v > 0.3 ? "rgba(8,12,22,0.35)" : "rgba(30,40,62,0.2)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      s.fillStyle = gr;
      s.fillRect(x - 40, y - 40, 80, 80);
    }
    // ridges: neighbour links in the hex lattice, each a soft raised rim with a crack along its crest
    const links = [];
    for (let j = -1; j <= M; j++) for (let i = -1; i <= N; i++) {
      const a = at(i, j);
      const odd = ((j % 2) + 2) % 2;
      for (const [di, dj] of [[1, 0], [odd ? 1 : 0, 1], [odd ? 0 : -1, 1]]) links.push([a, at(i + di, j + dj), R()]);
    }
    const path = (a, b, w) => {
      const mx = (a[0] + b[0]) / 2 + (w - 0.5) * 10, my = (a[1] + b[1]) / 2 + (0.5 - w) * 8;
      s.moveTo(a[0], a[1]);
      s.quadraticCurveTo(mx, my, b[0], b[1]);
    };
    s.lineCap = "round";
    for (const [lw, col] of [[11, "rgba(110,126,160,0.07)"], [5, "rgba(140,156,190,0.1)"], [1.8, "rgba(186,198,222,0.11)"]]) {
      s.strokeStyle = col;
      s.lineWidth = lw;
      s.beginPath();
      for (const [a, b, w] of links) path(a, b, w);
      s.stroke();
    }
    s.strokeStyle = "rgba(4,6,12,0.75)";
    s.lineWidth = 0.9;
    s.beginPath();
    for (const [a, b, w] of links) path([a[0] + 0.6, a[1] + 0.8], [b[0] + 0.6, b[1] + 0.8], w);
    s.stroke();
    // grain of the crust
    K.texRect(s, "noise", 0, 0, 512, 512, { scale: 128, alpha: 0.18, mode: "overlay", tex: { seed: 8 } });
  });
}
// fine fur strands, mostly vertical (the flow of a sitting cat's flank), tileable 128
function strandTex() {
  return K.sprite("f13:strands", 128, 128, (s) => {
    s.fillStyle = "#808080";
    s.fillRect(0, 0, 128, 128);
    const R = K.rng("f13strand");
    s.lineCap = "round";
    // four batches (light / dark x two widths), one path each
    for (const [col, lw] of [["rgba(255,255,255,0.4)", 0.6], ["rgba(0,0,0,0.45)", 0.6], ["rgba(255,255,255,0.3)", 0.9], ["rgba(0,0,0,0.35)", 0.9]]) {
      s.strokeStyle = col;
      s.lineWidth = lw;
      s.beginPath();
      for (let i = 0; i < 220; i++) {
        const x = R() * 128, y = R() * 128, l = 3 + R() * 6, a = Math.PI / 2 + (R() - 0.5) * 0.5;
        for (const [ox, oy] of [[0, 0], [0, -128], [-128, 0], [0, 128], [128, 0]]) {
          const X = x + ox, Y = y + oy;
          if (X < -10 || X > 138 || Y < -10 || Y > 138) continue;
          s.moveTo(X, Y);
          s.quadraticCurveTo(X + Math.cos(a) * l * 0.5 + 0.8, Y + Math.sin(a) * l * 0.5, X + Math.cos(a) * l, Y + Math.sin(a) * l);
        }
      }
      s.stroke();
    }
  });
}
// a still-water ripple ring (lit by a lantern), drawn squashed in perspective
function ringSprite() {
  return K.sprite("f13:ring", 128, 128, (s) => {
    const gr = s.createRadialGradient(64, 64, 0, 64, 64, 63);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(0.74, "rgba(255,255,255,0)");
    gr.addColorStop(0.86, "rgba(255,255,255,0.45)");
    gr.addColorStop(0.93, "rgba(255,255,255,0.18)");
    gr.addColorStop(0.97, "rgba(255,255,255,0.26)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    s.fillStyle = gr;
    s.fillRect(0, 0, 128, 128);
  });
}
function ringTint(color) {
  return K.sprite("f13:ringT:" + color, 128, 128, (s) => {
    s.drawImage(ringSprite(), 0, 0, 128, 128);
    s.globalCompositeOperation = "source-in";
    s.fillStyle = color;
    s.fillRect(0, 0, 128, 128);
  });
}

// ---- perspective projection of a texture canvas onto the ground plane (hor..y1), as groundPlane does ----
function perspStrips(g, tex, hor, yA, yB, W, scale, focal, k0, k1, ox = 0) {
  const ts = tex.lw || tex.width;
  const pat = g.createPattern(tex, "repeat");
  if (!pat || !pat.setTransform) return;
  const Dd = VH - hor;
  const Cs = (ts * focal * Dd) / scale;
  const dMin = 0.6, dMax = VH + 60 - hor;
  const N = 150;
  g.save();
  g.fillStyle = pat;
  let ya = hor + dMin;
  for (let k = 1; k <= N; k++) {
    const yb = hor + dMin * Math.pow(dMax / dMin, k / N);
    if (ya >= yA && ya < yB) { // each strip belongs to exactly one band (no double-drawn seams)
      const va = Cs / (ya - hor), vb = Cs / (yb - hor);
      const ym = (ya + yb) / 2;
      const a = (scale * (ym - hor) / Dd) / ts;
      const d = (yb - ya) / (vb - va);
      const pxs = (tex.width / ts);
      pat.setTransform(new DOMMatrix([a / pxs, 0, 0, d / pxs, W / 2 - (ts * 0.5 + ox) * a, ya - va * d]));
      const f = K.clamp((ym - hor) / 60);
      g.globalAlpha = K.lerp(k0, k1, Math.pow(K.clamp((ym - hor) / (VH - hor)), 1.5)) * f;
      if (g.globalAlpha > 0.004) g.fillRect(0, ya - 0.35, W, yb - ya + 0.7);
    }
    ya = yb;
  }
  g.restore();
}

// ---- the set: night sky, mirror flat over salt crust, horizon mist (staged build per horizon) ----------
const SETW = VW + 360, SETH = VH + 60;
function skyPaint(s, w, hor) {
  K.sky(s, w, VH, { top: "#02040c", mid: "#081028", bottom: "#1b2552", horizon: (hor + 2) / VH, night: true, haze: 0.7, glow: "#3a3a70" });
  s.save();
  s.globalCompositeOperation = "screen";
  s.globalAlpha = 0.16;
  K.texRect(s, "nebula", 0, 0, w, hor, { scale: 700, scaleY: 420, tex: { seed: 13, colors: ["#0a1030", "#26306a", "#6a5a8a"] } });
  s.restore();
  K.stars(s, w, hor + 4, 13, 1.7, 0, { yMax: hor - 6 });
}
function setStaged(hor) {
  const skyKey = "f13:skyS:" + hor;
  const steps = [
    // 1. the sky (its own canvas, reused for the mirror)
    () => K.sprite(skyKey, SETW, hor + 4, (s, w) => skyPaint(s, w, hor)),
    // 2. sky + its perfect reflection: still water is a mirror, the stars stay pin-sharp
    (s, w) => {
      const sky = K.sprite(skyKey, SETW, hor + 4, (q, ww) => skyPaint(q, ww, hor));
      s.fillStyle = "#02040c";
      s.fillRect(0, 0, w, SETH);
      s.drawImage(sky, 0, 0, w, hor + 4);
      s.save();
      s.beginPath();
      s.rect(0, hor, w, SETH - hor);
      s.clip();
      s.translate(0, hor * 2);
      s.scale(1, -1);
      s.globalAlpha = 0.9;
      s.drawImage(sky, 0, 0, w, hor + 4);
      s.restore();
      // below the zenith reflection the mirror shows the sky behind the camera: continue the star field
      s.save();
      s.globalAlpha = 0.9;
      s.drawImage(sky, 0, 0, sky.width, Math.min(sky.height, (SETH - hor * 2) * K.pixelScale()), 0, hor * 2, w, Math.min(hor + 4, SETH - hor * 2));
      s.restore();
      // water absorbs: the reflection is a touch darker and bluer than the sky
      s.save();
      s.globalCompositeOperation = "multiply";
      s.fillStyle = "#b8c4e8";
      s.fillRect(0, hor, w, SETH - hor);
      s.restore();
    },
  ];
  // 3-6. the salt crust seen through the water: fresnel - invisible at the horizon (all mirror), showing
  // more and more toward the camera where we look down into the water
  const bands = [[hor, hor + 40], [hor + 40, hor + 110], [hor + 110, hor + 200], [hor + 200, SETH]];
  for (const [a, b] of bands) steps.push((s, w) => {
    s.save();
    // two scales of polygon at different offsets, so no lattice line runs on across the flat
    perspStrips(s, saltTex(), hor, a, b, w, 1900, 900, 0, 0.6);
    perspStrips(s, saltTex(), hor, a, b, w, 2900, 900, 0, 0.32, 173);
    s.restore();
  });
  // 7. the glossy skin: a fresnel sheen of the sky glow over the crust, faint broad ripples, horizon mist
  steps.push((s, w) => {
    const fr = s.createLinearGradient(0, hor, 0, SETH);
    fr.addColorStop(0, "rgba(60,72,130,0.3)");
    fr.addColorStop(0.15, "rgba(40,50,100,0.12)");
    fr.addColorStop(0.6, "rgba(30,40,80,0.05)");
    fr.addColorStop(1, "rgba(30,40,80,0.08)");
    s.save();
    s.globalCompositeOperation = "screen";
    s.fillStyle = fr;
    s.fillRect(0, hor, w, SETH - hor);
    s.globalAlpha = 0.05;
    K.texRect(s, "puddles", 0, hor, w, SETH - hor, { scale: 900, scaleY: 120, tex: { seed: 21, cover: 0.6, color: "#6a7ab0" } });
    s.restore();
    const hz = s.createLinearGradient(0, hor - 34, 0, hor + 46);
    hz.addColorStop(0, K.rgba(MIST, 0));
    hz.addColorStop(0.42, K.rgba(MIST, 0.35));
    hz.addColorStop(0.55, K.rgba(MIST, 0.3));
    hz.addColorStop(1, K.rgba(MIST, 0));
    s.fillStyle = hz;
    s.fillRect(0, hor - 34, w, 80);
    // the near water is darker: looking down into it there is less sky to reflect
    const nf = s.createLinearGradient(0, hor + 60, 0, SETH);
    nf.addColorStop(0, "rgba(2,3,10,0)");
    nf.addColorStop(1, "rgba(2,3,10,0.12)");
    s.fillStyle = nf;
    s.fillRect(0, hor + 60, w, SETH - hor - 60);
  });
  return staged("f13:set:" + hor, SETW, SETH, steps);
}
function setSprite(hor) { return stagedDone(setStaged(hor)); }
// ox: horizontal pan (0..360), hor: where the horizon is on screen this frame; the set is built at a
// reference horizon and slid so a crane move costs nothing per frame
function voidBg(g, ox, hor, ref) {
  const r = ref == null ? Math.round(hor) : ref;
  const spr = setSprite(r);
  g.drawImage(spr, -K.clamp(ox, 0, 360), hor - r, SETW, SETH);
  if (hor - r > 0) {
    g.fillStyle = "#02040c";
    g.fillRect(0, 0, VW, hor - r + 1);
  }
}
function horizonMist(g, hor, t, a = 1) {
  K.fog(g, VW, VH, { y: hor - 2, h: 54, color: "#27306a", alpha: 0.16 * a, t, seed: 3 });
}

// ---- the inner glow of a lantern cat ------------------------------------------------------------------
// src: a canvas holding only the cat; (rx, ry, rw, rh) its box in device px. o (device px):
//  cx, cy, R  centre/radius of the glow (the chest and belly, where the fur is thinnest)
//  k          emission strength (pale fur glows a lot, black fur hardly at all)
//  thin       warm translucency where the silhouette thins (ears, whisker pad, tail tip)
//  soft, softY  soften the stripe edges below softY (a 2-3 px blur laid back over the body)
//  strands    fur-strand overlay along the body flow, strandK = texture scale
const PATS = new WeakMap();
function patternFor(g, tex) {
  let m = PATS.get(g);
  if (!m) { m = new Map(); PATS.set(g, m); }
  let p = m.get(tex);
  if (!p) { p = g.createPattern(tex, "repeat"); m.set(tex, p); }
  return p;
}
function innerGlow(srcC, srcG, rx, ry, rw, rh, o) {
  rx = Math.max(0, Math.floor(rx));
  ry = Math.max(0, Math.floor(ry));
  rw = Math.min(srcC.width - rx, Math.ceil(rw));
  rh = Math.min(srcC.height - ry, Math.ceil(rh));
  if (rw < 6 || rh < 6) return;
  const T = scratch("igT", rw, rh), tg = T.g;
  tg.drawImage(srcC, rx, ry, rw, rh, 0, 0, rw, rh);
  if (o.soft > 0) {
    const q = o.softQ || 3;
    const sw = Math.ceil(rw / q), sh = Math.ceil(rh / q);
    const S = scratch("igS", sw, sh);
    S.g.drawImage(T.c, 0, 0, rw, rh, 0, 0, sw, sh);
    tg.save();
    tg.beginPath();
    tg.rect(0, o.softY - ry, rw, rh);
    tg.clip();
    tg.globalCompositeOperation = "source-atop";
    tg.globalAlpha = o.soft;
    tg.drawImage(S.c, 0, 0, sw, sh, 0, 0, rw, rh);
    tg.restore();
  }
  if (o.strands > 0) {
    const P = scratch("igP", rw, rh), pg = P.g;
    const pat = patternFor(pg, strandTex());
    const sk = o.strandK || 1;
    if (pat.setTransform) pat.setTransform(new DOMMatrix([sk / K.pixelScale(), 0, 0, sk * 1.3 / K.pixelScale(), 0, 0]));
    pg.fillStyle = pat;
    pg.fillRect(0, 0, rw, rh);
    pg.globalCompositeOperation = "destination-in";
    pg.drawImage(T.c, 0, 0, rw, rh, 0, 0, rw, rh);
    tg.save();
    tg.globalCompositeOperation = "overlay";
    tg.globalAlpha = o.strands;
    tg.drawImage(P.c, 0, 0, rw, rh, 0, 0, rw, rh);
    tg.restore();
  }
  // emission: the cat's own albedo times a radial falloff from the chest (pigment-weighted, so the
  // stripes and the back stay darker than the thin pale fur of the chest and belly)
  const E = scratch("igE", rw, rh), eg = E.g;
  eg.drawImage(T.c, 0, 0, rw, rh, 0, 0, rw, rh);
  eg.globalCompositeOperation = "multiply";
  const gx = o.cx - rx, gy = o.cy - ry;
  const gr = eg.createRadialGradient(gx, gy, 0, gx, gy, o.R);
  gr.addColorStop(0, "#ffc27a");
  gr.addColorStop(0.3, "#ff8c3a");
  gr.addColorStop(0.62, "#8a3a10");
  gr.addColorStop(1, "#1a0904");
  eg.fillStyle = gr;
  eg.fillRect(0, 0, rw, rh);
  eg.globalCompositeOperation = "destination-in";
  eg.drawImage(T.c, 0, 0, rw, rh, 0, 0, rw, rh);
  if (o.thin > 0) {
    // thickness: a heavily blurred alpha; thin parts (ears, tail tip, whisker pad) stay low in it
    const q = Math.max(4, Math.round(o.R / 9));
    const bw = Math.ceil(rw / q), bh = Math.ceil(rh / q);
    const B = scratch("igB", bw, bh);
    B.g.drawImage(T.c, 0, 0, rw, rh, 0, 0, bw, bh);
    const M = scratch("igM", rw, rh), mg = M.g;
    mg.drawImage(T.c, 0, 0, rw, rh, 0, 0, rw, rh);
    mg.globalCompositeOperation = "source-in";
    mg.fillStyle = "#ffa850";
    mg.fillRect(0, 0, rw, rh);
    mg.globalCompositeOperation = "destination-out";
    mg.drawImage(B.c, 0, 0, bw, bh, 0, 0, rw, rh);
    mg.drawImage(B.c, 0, 0, bw, bh, 0, 0, rw, rh);
    eg.globalCompositeOperation = "lighter";
    eg.globalAlpha = o.thin;
    eg.drawImage(M.c, 0, 0, rw, rh, 0, 0, rw, rh);
    eg.globalAlpha = 1;
  }
  // fur in the dark absorbs: the outside of the coat goes down, so the light reads as coming from within
  if (o.dim > 0) {
    tg.globalCompositeOperation = "source-atop";
    tg.fillStyle = `rgba(14,12,26,${o.dim})`;
    tg.fillRect(0, 0, rw, rh);
    tg.globalCompositeOperation = "source-over";
  }
  srcG.save();
  srcG.setTransform(1, 0, 0, 1, 0, 0);
  srcG.clearRect(rx, ry, rw, rh);
  srcG.globalCompositeOperation = "source-over";
  srcG.drawImage(T.c, 0, 0, rw, rh, rx, ry, rw, rh);
  srcG.globalCompositeOperation = "lighter";
  srcG.globalAlpha = o.k;
  srcG.drawImage(E.c, 0, 0, rw, rh, rx, ry, rw, rh);
  srcG.restore();
}

// ---- lantern cats ---------------------------------------------------------------------------------------
// the hero is a darker, true mid-grey mackerel tabby (the kit grey reads near-white under a warm key)
const GREY_TABBY = Object.assign({}, K.COATS.grey, { base: "#6c6f74", light: "#979a9e", dark: "#3a3c41", stripe: "#2a2b30", tip: "#2a2b30", belly: "#c4c0b6", white: "#d8d4ca", stripeAlpha: 0.7 });
const LCOATS = ["grey", "cream", "black", "siamese", "tuxedo", "calico"];
// how much light gets out through each coat: pale fur scatters it, black fur swallows it
const COATK = { grey: 0.8, cream: 1.0, black: 0.42, siamese: 0.9, tuxedo: 0.6, calico: 0.8 };
const POSES = ["sit", "loaf", "groom"];
const CS = 84; // sprite shoulder size
const SPW = 252, SPH = 194, SGX = 126, SGY = 180; // sprite box + ground point
const LANTERN = (facing, cx, cy, size, o = {}) => ({
  collar: false, bell: false, shadow: false,
  // what lights a lantern cat from outside: its own pool on the water (low, warm, in front) and the next
  // lantern along the road (a faint rim); the inner glow is added after. No hard rim: it would outline it.
  key: { x: cx + facing * size * 0.9, y: cy + size * 0.2, color: "#ffc890", strength: o.key == null ? 0.7 : o.key },
  rim: { x: cx - facing * size * 1.4, y: cy - size * 1.9, color: "#ffbe6a", strength: o.rim == null ? 0.25 : o.rim },
  backlit: 0.95, fill: "#120c18", ambient: "#262c5a", ambientK: 0.08, pupil: 1,
});
function poseOpts(pose) {
  if (pose === "groom") return { pose: "sit", headTurn: 0.75, headTilt: -0.55, blink: 1, ears: 0.1, tail: 0.1 };
  if (pose === "loaf") return { pose: "loaf", headTurn: 0.35, blink: 0.55 };
  return { pose: "sit", headTurn: 0.22, blink: 0.2 };
}
// painted facing right (drawn mirrored for the other side of the road), in two slices: the cat, then its light
function lanternStaged(coat, pose) {
  return staged(`f13:lc5:${coat}:${pose}`, SPW, SPH, [
    (s) => K.drawCat(s, SGX, SGY, CS, Object.assign({ facing: 1, coat: K.COATS[coat], t: 0.7, breath: 0 }, poseOpts(pose), LANTERN(1, SGX, SGY, CS))),
    (s) => {
      const px = K.pixelScale();
      const ck = COATK[coat];
      const chestX = SGX + CS * (pose === "loaf" ? 0.3 : 0.18), chestY = SGY - CS * (pose === "loaf" ? 0.3 : 0.55);
      innerGlow(s.canvas, s, 0, 0, s.canvas.width, s.canvas.height, {
        cx: chestX * px, cy: chestY * px, R: CS * 1.25 * px, k: 0.8 * ck + 0.1, thin: 0.6 * Math.min(1, ck + 0.2), dim: 0.35,
        soft: 0.5, softY: (SGY - CS * 1.05) * px, softQ: 2.5, strands: 0.3, strandK: 0.7 * px,
      });
    },
  ]);
}
function lanternSprite(coat, pose) { return stagedDone(lanternStaged(coat, pose)); }
// its mirror image: flipped about the waterline, 2 px soft, fading with depth below the surface
function lanternRefl(coat, pose) {
  return K.sprite(`f13:lr5:${coat}:${pose}`, SPW, SPH, (s) => {
    const spr = lanternSprite(coat, pose);
    s.save();
    if (K.hasFilter()) s.filter = `blur(${K.qblur((2 * K.pixelScale()).toFixed(1))}px)`;
    s.translate(0, SGY * 2 - 1);
    s.scale(1, -1);
    s.drawImage(spr, 0, 0, SPW, SPH);
    s.restore();
    s.filter = "none";
    s.globalCompositeOperation = "destination-in";
    const fd = s.createLinearGradient(0, SGY, 0, SPH);
    fd.addColorStop(0, "rgba(0,0,0,1)");
    fd.addColorStop(1, "rgba(0,0,0,0.5)");
    s.fillStyle = fd;
    s.fillRect(0, 0, SPW, SPH);
  });
}
// a distant lantern cat as the lens sees it: a small hot point with a tight halo and a short broken
// streak on the water; 64 x 128, the light at (32, 40) - separate pearls, not a smear
function pointSprite() {
  return K.sprite("f13:pt4", 64, 128, (s) => {
    const cx = 32, cy = 40;
    const hal = s.createRadialGradient(cx, cy, 0, cx, cy, 22);
    hal.addColorStop(0, K.rgba(GOLD, 0.2));
    hal.addColorStop(0.3, K.rgba(GOLD, 0.05));
    hal.addColorStop(1, K.rgba(GOLD, 0));
    s.fillStyle = hal;
    s.fillRect(0, 0, 64, 70);
    const core = s.createRadialGradient(cx, cy, 0, cx, cy, 6);
    core.addColorStop(0, "rgba(255,240,210,1)");
    core.addColorStop(0.45, "rgba(255,206,140,0.75)");
    core.addColorStop(1, "rgba(255,170,80,0)");
    s.fillStyle = core;
    s.fillRect(cx - 6, cy - 6, 12, 12);
    for (let i = 0; i < 7; i++) {
      const v = i / 6, yy = cy + 9 + v * 46, w = 3.2 * (1 - v * 0.5) * (0.6 + 0.4 * K.hash(i, 5));
      const sg = s.createRadialGradient(cx, yy, 0, cx, yy, w * 1.6);
      sg.addColorStop(0, K.rgba(GOLD, 0.45 * (1 - v)));
      sg.addColorStop(1, K.rgba(GOLD, 0));
      s.save();
      s.translate(cx, yy);
      s.scale(1, 0.45);
      s.translate(-cx, -yy);
      s.fillStyle = sg;
      s.fillRect(cx - w * 2, yy - w * 2, w * 4, w * 4);
      s.restore();
    }
  });
}
// slow concentric ripple rings in a lantern's pool (cached ring, translated / scaled per frame)
function ripples(g, x, y, r0, t, seed, a, color = "#ffc078", flat = 0.2) {
  if (a <= 0.01 || r0 < 3) return;
  const spr = ringTint(color);
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let k = 0; k < 3; k++) {
    const q = (t * 0.11 + seed * 0.37 + k / 3) % 1;
    const r = r0 * (0.7 + q * 2.4);
    g.globalAlpha = a * Math.sin(q * Math.PI) * (1 - q) * 0.55;
    if (g.globalAlpha < 0.004) continue;
    g.drawImage(spr, x - r, y - r * flat, r * 2, r * 2 * flat);
  }
  g.restore();
}
function lanternCat(g, x, y, size, o = {}) {
  const coat = o.coat || "grey", facing = o.facing || 1, pose = o.pose || "sit";
  const a = o.alpha == null ? 1 : o.alpha;
  const ck = o.coatK == null ? 1 : o.coatK;
  const br = (o.bright == null ? 1 : o.bright) * ck;
  if (a <= 0.01 || size < 0.3) return;
  const s = size / CS;
  const t = o.t || 0;
  const pulse = 0.92 + 0.08 * Math.sin(t * 1.3 + (o.seed || 0) * 2.3);
  if (size < 7) {
    // a far point: its emit is capped by distance, so the far road reads as a string of pearls
    const u = K.clamp(size * 0.55 + 0.45, 0.45, 3);
    const kd = K.clamp(size * 0.3, 0.25, 1);
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha *= Math.min(1, a * br * pulse * kd);
    g.drawImage(pointSprite(), x - u * 32 / 4, y - u * 40 / 4, u * 16, u * 32);
    g.restore();
    return;
  }
  // inverse-square: the halo in the mist falls off with distance, the pools do not (surface brightness)
  const fall = K.clamp((size / 46) * (size / 46), 0.1, 1);
  // colour-temperature split: a warm amber spill within ~80 px of each lantern, cool navy elsewhere
  K.lightPool(g, x, y, K.clamp(size * 2.4, 14, 150), "#ff9a48", { intensity: 0.16 * a * br, flat: 0.3 });
  // its own pool on the wet ground, brightest just under the paws
  K.lightPool(g, x, y - size * 0.02, size * 1.5, "#ffc888", { intensity: 0.42 * a * br * pulse, flat: 0.2 });
  ripples(g, x, y, size * 0.7, t, o.seed || 0, 0.5 * a * Math.min(1, br + 0.3));
  g.save();
  g.translate(x, y);
  if (facing < 0) g.scale(-1, 1);
  g.globalAlpha *= a * 0.4 * Math.min(1, 0.55 + br * 0.5);
  g.drawImage(lanternRefl(coat, pose), -SGX * s, -SGY * s, SPW * s, SPH * s);
  g.restore();
  // a thin dark contact line where the paws meet their own reflection
  K.shadowBlob(g, x, y, size * 0.4, size * 0.04, { alpha: 0.4 * a, soft: 0.8 });
  g.save();
  g.translate(x, y);
  if (facing < 0) g.scale(-1, 1);
  g.globalAlpha *= a;
  g.drawImage(lanternSprite(coat, pose), -SGX * s, -SGY * s, SPW * s, SPH * s);
  g.restore();
  K.glow(g, x + facing * size * 0.15, y - size * 0.6, size * 2, GOLD, 0.12 * a * pulse * br * fall);
}

// ---- the Shadow: a tall thin near-black cat standing just off the road, back to us -----------------------
const SHADOW = { base: "#0d0f18", light: "#1a1e2c", dark: "#07080d", stripe: "#0d0f18", tip: "#0d0f18", belly: "#10121c", pattern: "solid", bib: false, socks: false, muzzle: false, iris: "#6a7c9c", irisInner: "#bcd6ff", nose: "#151820", noseEdge: "#0a0c12", innerEar: "#1a1e2c", bentEar: false };
const SHS = 60, SHW = SHS * 3.4, SHH = SHS * 2.8, SHOX = SHW / 2, SHOY = SHH * 0.9;
function shadowShape() {
  return K.sprite("f13:shshape4", SHW, SHH, (s) => {
    s.translate(SHOX, SHOY);
    s.scale(0.9, 1.12);
    s.translate(-SHOX, -SHOY);
    K.drawCat(s, SHOX, SHOY, SHS, { pose: "stand", facing: 1, coat: SHADOW, t: 0.4, collar: false, bell: false, shadow: false, tail: 0.3, headTurn: -0.75, blink: 0.4, flat: true });
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = "source-in";
    s.fillStyle = "#06070c";
    s.fillRect(0, 0, s.canvas.width, s.canvas.height);
  });
}
function shadowSil() {
  return K.sprite("f13:shsil4", SHW, SHH, (s) => {
    s.drawImage(shadowShape(), 0, 0, SHW, SHH);
    // the legs dissolve into the mist: alpha falls away from the belly to the feet
    s.globalCompositeOperation = "destination-out";
    const fg = s.createLinearGradient(0, SHOY - SHS * 0.75, 0, SHOY + 2);
    fg.addColorStop(0, "rgba(0,0,0,0)");
    fg.addColorStop(0.5, "rgba(0,0,0,0.45)");
    fg.addColorStop(1, "rgba(0,0,0,0.92)");
    s.fillStyle = fg;
    s.fillRect(0, 0, SHW, SHH);
    K.texRect(s, "cloud", 0, SHOY - SHS * 0.8, SHW, SHS * 0.85, { scale: 50, tex: { seed: 77, cover: 0.42 }, alpha: 0.35 });
  });
}
// a thin, broken, cool rim: only the top / portal-side edges, only the upper body
function shadowRim() {
  return K.sprite("f13:shrim4", SHW, SHH, (s) => {
    const sh = shadowShape();
    s.drawImage(sh, 0, 0, SHW, SHH);
    s.globalCompositeOperation = "source-in";
    s.fillStyle = "#a8c8f0";
    s.fillRect(0, 0, SHW, SHH);
    s.globalCompositeOperation = "destination-out";
    s.drawImage(sh, -0.9, 1.4, SHW, SHH);
    // broken: fur tufts and mist interrupt it
    K.texRect(s, "cloud", 0, 0, SHW, SHH, { scale: 22, tex: { seed: 79, cover: 0.5 }, alpha: 0.85 });
    const fg = s.createLinearGradient(0, SHOY - SHS * 1.5, 0, SHOY - SHS * 0.5);
    fg.addColorStop(0, "rgba(0,0,0,0)");
    fg.addColorStop(1, "rgba(0,0,0,1)");
    s.fillStyle = fg;
    s.fillRect(0, SHOY - SHS * 1.5, SHW, SHH);
  });
}
function shadowCat(g, x, y, size, t) {
  const k = size / SHS;
  const dx = x - SHOX * k, dy = y - SHOY * k, w = SHW * k, h = SHH * k;
  const sil = shadowSil(), rim = shadowRim();
  const breathe = Math.sin(t * 0.9) * 0.006;
  // cold mist lit by the portal behind it, so the dark shape reads against it
  K.glow(g, x + size * 0.3, y - size * 0.9, size * 2.4, "#34467e", 0.16);
  // its reflection: a faint dark ghost on the mirror
  g.save();
  g.translate(0, y * 2 - 1);
  g.scale(1, -1);
  g.globalAlpha = 0.45;
  g.drawImage(sil, dx, dy, w, h);
  g.restore();
  g.save();
  g.drawImage(sil, dx, dy - h * breathe, w, h * (1 + breathe));
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = 0.55;
  g.drawImage(rim, dx, dy - h * breathe, w, h * (1 + breathe));
  g.restore();
  // mist pooled round its feet (the body dissolves into it)
  const mg = g.createRadialGradient(x, y - size * 0.1, 0, x, y - size * 0.1, size * 1.3);
  mg.addColorStop(0, "rgba(30,40,84,0.45)");
  mg.addColorStop(1, "rgba(30,40,84,0)");
  g.save();
  g.translate(x, y - size * 0.1);
  g.scale(1, 0.35);
  g.translate(-x, -(y - size * 0.1));
  g.fillStyle = mg;
  g.fillRect(x - size * 1.3, y - size * 1.4, size * 2.6, size * 2.6);
  g.restore();
}

// a cheap soft copy of a full-frame layer: downsample it (the GPU filters it), then draw it stretched back up.
function softDraw(g, src, div, alpha, key) {
  const w = Math.ceil(VW / div), h = Math.ceil(VH / div);
  const S = K.layer(w, h, "f13soft" + key);
  S.g.save();
  S.g.setTransform(1, 0, 0, 1, 0, 0);
  S.g.imageSmoothingQuality = "medium";
  S.g.drawImage(src, 0, 0, src.width, src.height, 0, 0, S.canvas.width, S.canvas.height);
  S.g.restore();
  g.save();
  g.globalAlpha *= alpha;
  g.drawImage(S.canvas, 0, 0, S.canvas.width, S.canvas.height, 0, 0, VW, VH);
  g.restore();
}

// ---- out-of-focus lanterns: real bokeh ------------------------------------------------------------------
// a near-white warm disc with a brighter onion-ring rim, faint inner texture, a CA fringe on the rim,
// and mechanical vignetting: toward the frame edges it is clipped into a cat's-eye (cut = 0, 1, 2)
function bokehSprite(cut) {
  return K.sprite("f13:bokeh4:" + cut, 96, 96, (s) => {
    const c = 48, r = 40;
    const gr = s.createRadialGradient(c, c, 0, c, c, r);
    gr.addColorStop(0, "rgba(255,212,156,0.36)");
    gr.addColorStop(0.55, "rgba(255,212,156,0.37)");
    gr.addColorStop(0.84, "rgba(255,216,164,0.4)");
    gr.addColorStop(0.94, "rgba(255,224,178,0.48)");
    gr.addColorStop(0.985, "rgba(255,226,182,0.28)");
    gr.addColorStop(1, "rgba(255,226,182,0)");
    s.fillStyle = gr;
    s.beginPath();
    s.arc(c, c, r, 0, K.TAU);
    s.fill();
    // onion rings and dust on the element: faint structure inside the disc
    s.save();
    s.beginPath();
    s.arc(c, c, r * 0.95, 0, K.TAU);
    s.clip();
    s.globalCompositeOperation = "source-atop";
    for (let i = 1; i < 5; i++) {
      s.strokeStyle = `rgba(255,240,220,${0.05 + (i % 2) * 0.03})`;
      s.lineWidth = 1.2;
      s.beginPath();
      s.arc(c + 0.6 * i, c - 0.4 * i, r * (0.2 + i * 0.17), 0, K.TAU);
      s.stroke();
    }
    K.texRect(s, "noise", 0, 0, 96, 96, { scale: 40, alpha: 0.12, mode: "multiply", tex: { seed: 4 } });
    s.restore();
    // lateral CA: a red fringe just outside the rim, a blue one just inside
    s.globalCompositeOperation = "lighter";
    s.strokeStyle = "rgba(255,90,40,0.14)";
    s.lineWidth = 1.6;
    s.beginPath();
    s.arc(c + 0.6, c, r + 0.4, 0, K.TAU);
    s.stroke();
    s.strokeStyle = "rgba(60,120,255,0.12)";
    s.beginPath();
    s.arc(c - 0.6, c, r - 2.2, 0, K.TAU);
    s.stroke();
    if (cut > 0) {
      // the cat's-eye: what survives of the disc through the rear element (the cut lies toward +x)
      s.globalCompositeOperation = "destination-in";
      const off = r * (cut === 1 ? 0.32 : 0.6);
      const mg = s.createRadialGradient(c - off, c, r * 0.9, c - off, c, r * 1.02);
      mg.addColorStop(0, "rgba(0,0,0,1)");
      mg.addColorStop(1, "rgba(0,0,0,0)");
      s.fillStyle = mg;
      s.fillRect(0, 0, 96, 96);
    }
  });
}
function bokeh(g, x, y, r, a, tint) {
  if (a <= 0.01 || r < 1) return;
  const dx = x - VW / 2, dy = y - VH / 2;
  const e = Math.hypot(dx / (VW / 2), dy / (VH / 2));
  const cut = e < 0.45 ? 0 : e < 0.8 ? 1 : 2;
  g.save();
  g.globalCompositeOperation = "lighter";
  g.globalAlpha *= a;
  g.translate(x, y);
  if (cut) g.rotate(Math.atan2(dy, dx));
  const k = r / 40;
  g.drawImage(bokehSprite(cut), -48 * k, -48 * k, 96 * k, 96 * k);
  if (tint) { // a warmer cast for amber lanterns (still far from a saturated orange coin)
    g.globalAlpha *= 0.6;
    g.drawImage(K.glowSprite(tint), -r * 0.9, -r * 0.9, r * 1.8, r * 1.8);
  }
  g.restore();
}

// ---- road geometry (world: ground y = 0, z forward) -------------------------------------------------------
const NCATS = 100;
const CATS = (() => {
  const R = K.rng("f13road");
  const out = [];
  for (let i = 0; i < NCATS; i++) {
    const side = i % 2 ? 1 : -1;
    const pr = R();
    out.push({
      z: 300 + i * 190 + R() * 60,
      side,
      off: 120 + R() * 50,
      coat: LCOATS[(R() * LCOATS.length) | 0],
      pose: pr > 0.72 ? "loaf" : pr > 0.5 ? "groom" : "sit",
      seed: R() * 10,
      size: 26 + R() * 8,
      bright: 0.75 + R() * 0.35,
    });
  }
  return out;
})();
function project(cam, wx, wy, wz) {
  const dz = wz - cam.z;
  if (dz < 20) return null;
  const k = cam.F / dz;
  return [VW / 2 + (wx - cam.x) * k, cam.hor + (wy - cam.y) * k, k, dz];
}
// draw the road of lantern cats; centre(z) gives the road centre line x; o.focus drives the defocus
function road(g, t, cam, centre, o = {}) {
  const items = [];
  const maxSize = o.maxSize || 140;
  for (let i = 0; i < CATS.length; i++) {
    const c = CATS[i];
    if (o.count != null && i >= o.count) continue;
    const wx = centre(c.z) + c.side * c.off;
    const p = project(cam, wx, 0, c.z);
    if (!p || p[3] < 30) continue;
    if (p[0] < -200 || p[0] > VW + 200) continue;
    if (c.size * p[2] > maxSize) continue;
    if (o.maxY != null && p[1] > o.maxY) continue;
    items.push([p, c, i]);
  }
  items.sort((a, b) => b[0][3] - a[0][3]);
  let hazed = !o.haze;
  for (const [p, c, i] of items) {
    const appear = o.appear ? o.appear(i) : 1;
    if (appear <= 0) continue;
    const size = c.size * p[2];
    if (!hazed && size >= 4) {
      // a layer of air between the far road and the camera: it dims and desaturates the far lights
      hazed = true;
      const hy = cam.hor;
      const hz = g.createLinearGradient(0, hy - 40, 0, hy + 70);
      hz.addColorStop(0, K.rgba("#1a2250", 0));
      hz.addColorStop(0.35, K.rgba("#1a2250", 0.42 * o.haze));
      hz.addColorStop(0.6, K.rgba("#1a2250", 0.25 * o.haze));
      hz.addColorStop(1, K.rgba("#1a2250", 0));
      g.fillStyle = hz;
      g.fillRect(0, hy - 40, VW, 110);
    }
    const dzN = Math.abs(1 / p[3] - 1 / (o.focus || 1200)) * 1200;
    const blur = Math.min(1, dzN * (o.dofK == null ? 0.6 : o.dofK));
    const br = c.bright;
    const ck = COATK[c.coat];
    if (size < 4) {
      lanternCat(g, p[0], p[1], size, { t, seed: c.seed, alpha: appear, bright: br, coatK: 0.55 + ck * 0.45 });
    } else if (blur > 0.55 && size < 40 && !o.noBokeh) {
      const r = K.clamp(size * 0.9 + 2, 3, 16);
      K.glow(g, p[0], p[1] - size * 0.8, r * 2.2, "#ffa040", 0.18 * appear * br * ck);
      bokeh(g, p[0], p[1] - size * 0.8, r, 0.75 * appear * br * (0.5 + ck * 0.5), "#ffb060");
      g.save();
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.16 * appear * br * ck;
      g.drawImage(K.glowSprite("#ffa040"), p[0] - r * 0.8, p[1], r * 1.6, size * 3);
      g.restore();
    } else if (blur > 0.55 && !o.noBokeh) {
      K.glow(g, p[0], p[1] - size * 0.9, Math.min(140, size * 2), "#ff9a3a", 0.06 * appear * br);
    } else {
      const pose = c.pose === "loaf" && size > 22 ? "sit" : c.pose;
      lanternCat(g, p[0], p[1], size, { coat: c.coat, pose, facing: c.side > 0 ? -1 : 1, t, seed: c.seed, alpha: appear, bright: br, coatK: ck });
    }
  }
}

// ---- the paw-portal: a cyan emissive paw print (four toe beans and a pad) with hot white edges ------------
function pawPath(cx, cy, r) {
  const p = new Path2D();
  // the main pad: a soft rounded trilobe
  const py = cy + r * 0.28;
  p.moveTo(cx - r * 0.62, py + r * 0.18);
  p.bezierCurveTo(cx - r * 0.7, py - r * 0.35, cx - r * 0.25, py - r * 0.5, cx, py - r * 0.42);
  p.bezierCurveTo(cx + r * 0.25, py - r * 0.5, cx + r * 0.7, py - r * 0.35, cx + r * 0.62, py + r * 0.18);
  p.bezierCurveTo(cx + r * 0.56, py + r * 0.52, cx + r * 0.22, py + r * 0.5, cx, py + r * 0.36);
  p.bezierCurveTo(cx - r * 0.22, py + r * 0.5, cx - r * 0.56, py + r * 0.52, cx - r * 0.62, py + r * 0.18);
  p.closePath();
  const toes = [[-0.78, -0.12, -0.5], [-0.3, -0.56, -0.18], [0.3, -0.56, 0.18], [0.78, -0.12, 0.5]];
  for (const [tx, ty, rot] of toes) K.ellipsePath(p, cx + tx * r, cy + ty * r, r * 0.2, r * 0.27, rot);
  return p;
}
function pawSprite() {
  return K.sprite("f13:paw4", 160, 160, (s) => {
    const c = 80, r = 50;
    const P = pawPath(c, c, r);
    // light scattered in the mist round it
    if (K.hasFilter()) s.filter = `blur(${K.qblur((9 * K.pixelScale()).toFixed(1))}px)`;
    s.fillStyle = "rgba(90,190,255,0.55)";
    s.fill(P);
    s.filter = "none";
    // the emissive body: saturated cyan, a little hotter in the middle of each pad
    const gr = s.createRadialGradient(c, c, 0, c, c, r * 1.1);
    gr.addColorStop(0, "rgba(150,226,255,0.9)");
    gr.addColorStop(1, "rgba(90,200,255,0.85)");
    s.fillStyle = gr;
    s.fill(P);
    // the hot white edge: the shape minus a blurred copy of itself leaves a bright inner rim
    const E = K.makeCanvas(s.canvas.width, s.canvas.height);
    const e = E.getContext("2d");
    e.setTransform(K.pixelScale(), 0, 0, K.pixelScale(), 0, 0);
    e.fillStyle = "#ffffff";
    e.fill(P);
    e.globalCompositeOperation = "destination-out";
    if (K.hasFilter()) e.filter = `blur(${K.qblur((2.6 * K.pixelScale()).toFixed(1))}px)`;
    e.fill(P);
    e.filter = "none";
    s.save();
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = "lighter";
    s.globalAlpha = 0.9;
    s.drawImage(E, 0, 0);
    s.restore();
  });
}
function portalAt(g, x, y, r, t, k, blow = 0) {
  // cyan scattered in the mist round it, and a cool pool + broken streak on the water (vs the amber road)
  K.glow(g, x, y, r * 7, "#3a7ab8", 0.12 * k);
  K.glow(g, x, y, r * 2.4, "#7cd0ff", 0.12 * k);
  K.lightPool(g, x, y + r * 1.25, r * 6, "#6ac8ff", { intensity: 0.22 * k, flat: 0.12 });
  K.reflectStreak(g, x, y + r * 1.3, Math.max(r * 7, 300 - y * 0.3), CYAN, 0.38 * Math.min(1, k), { t, width: r * 0.9 });
  // its mirror image
  const ps = pawSprite();
  const pulse = 1 + Math.sin(t * 1.7) * 0.025;
  const rr = r * 1.6 * pulse;
  g.save();
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = K.clamp(0.35 * k);
  g.translate(x, y + r * 2.6);
  g.scale(1, -0.55);
  g.drawImage(ps, -rr, -rr, rr * 2, rr * 2);
  g.restore();
  // the paw itself: the core alpha is clamped so the lens bloom does not clip it to a white blob
  g.save();
  g.globalAlpha = K.clamp(0.82 * Math.min(1, k));
  g.drawImage(ps, x - rr, y - rr, rr * 2, rr * 2);
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = K.clamp(0.25 * (k - 0.9));
  if (g.globalAlpha > 0.01) g.drawImage(ps, x - rr, y - rr, rr * 2, rr * 2);
  g.restore();
  if (blow > 0) { // 56 s on: it opens - the white blow-out
    K.glow(g, x, y, r * (2 + blow * 4), "#ffffff", 0.5 * blow);
    K.glow(g, x, y, r * (6 + blow * 10), "#cfefff", 0.3 * blow);
  }
}

// ---- the defocused road behind the insert (shot 4): staged, painted before it is needed -------------------
function insertStaged() {
  const cam = { x: 0, y: -90, z: 0, F: 700, hor: HOR };
  const cen = (z) => 140 * Math.sin(z / 1800);
  return staged("f13:insert", VW, VH, [
    (g) => voidBg(g, 200, HOR),
    (g) => road(g, 0, cam, cen, { focus: 300, dofK: 0, maxSize: 90, noBokeh: true, count: 40 }),
    (g) => {
      // blur what we have (the lens is focused on her, 30 cm away; everything behind is soft)
      const c = g.canvas;
      const tmp = scratch("insTmp", c.width, c.height);
      tmp.g.drawImage(c, 0, 0);
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, c.width, c.height);
      if (K.hasFilter()) g.filter = `blur(${K.qblur((10 * K.pixelScale()).toFixed(1))}px)`;
      g.drawImage(tmp.c, 0, 0, c.width, c.height, 0, 0, c.width, c.height);
      g.filter = "none";
      g.restore();
    },
    (g) => {
      // the nearer lanterns as real bokeh: discs with structure, mostly behind and below her
      const R = K.rng("f13insbk");
      for (let i = 0; i < 18; i++) {
        const x = R() * VW, y = 170 + R() * 150, r = 12 + R() * 26;
        bokeh(g, x, y, r, 0.22 + R() * 0.28, R() > 0.8 ? null : "#ffa050");
      }
    },
  ]);
}
function insertBg() { return stagedDone(insertStaged()); }

// ---- the cache-fill queue: one slice per frame through the dark opening, so no cut does a first build ----
const JOBS = [];
const kitScratch = () => K.layer(SPW, SPH, "f13warm");
// 0-0.4 s (pure black): the first use of the kit painters builds their private textures (0.2-0.7 s)
JOBS.push(() => K.drawCat(kitScratch().g, SGX, SGY, CS, Object.assign({ coat: K.COATS.grey, t: 0.7 }, poseOpts("sit"), LANTERN(1, SGX, SGY, CS))));
JOBS.push(() => K.drawCat(kitScratch().g, SGX, SGY, CS, Object.assign({ coat: K.COATS.cream, t: 0.7 }, poseOpts("loaf"), LANTERN(1, SGX, SGY, CS))));
JOBS.push(() => { const L = K.layer(VW, VH, "f13kid"); K.drawPerson(L.g, 480, 430, 200, { view: "back", walk: true, phase: 0.2, t: 52, hood: false, shadow: false }); });
JOBS.push(() => { const L = K.layer(VW, VH, "f13hand"); povHand(L.g, 700, 200, 210, { left: true, angle: Math.PI - 0.2, curl: 0.45, t: 33 }); });
// then one small slice per tenth of a second through the dark opening
JOBS.push(() => K.texture("cloud", { seed: 77, cover: 0.42 }));
JOBS.push(() => K.texture("cloud", { seed: 79, cover: 0.5 }));
JOBS.push(() => K.texture("fabric", { seed: 1 }));
JOBS.push(() => saltTex());
JOBS.push(() => strandTex());
JOBS.push(() => { ringSprite(); ringTint("#ffc078"); ringTint("#ffd99a"); pointSprite(); });
// (staged builds are created lazily, on the first slice: nothing is allocated at import)
for (let i = 0; i < 7; i++) JOBS.push(() => stageStep(setStaged(HOR)));
for (const p of POSES) for (const c of LCOATS) {
  JOBS.push(() => stageStep(lanternStaged(c, p)));
  JOBS.push(() => stageStep(lanternStaged(c, p)));
  JOBS.push(() => lanternRefl(c, p));
}
JOBS.push(() => { bokehSprite(0); bokehSprite(1); bokehSprite(2); });
for (let i = 0; i < 4; i++) JOBS.push(() => stageStep(insertStaged()));
JOBS.push(() => shadowShape());
JOBS.push(() => { shadowSil(); shadowRim(); });
JOBS.push(() => pawSprite());
JOBS.push(() => K.texture("noise", { seed: 4 }));
// dry runs of each shot into a throwaway layer: builds every small kit sprite (light pools, glows, hair,
// dust) a cut will ask for, so the first frame after a cut is a steady frame
const dry = (fn, t) => () => { const L = K.layer(VW, VH, "f13dry"); fn(L.g, t, false); };
JOBS.push(dry(shot2, 18.6));
JOBS.push(dry(shot3, 26));
JOBS.push(dry(shot3, 31));
JOBS.push(dry(shot4, 36));
JOBS.push(dry(shot4, 41.9));
JOBS.push(dry(shot5, 45));
JOBS.push(dry(shot6, 52.1));
JOBS.push(dry(shot6, 56.5));
JOBS.push(dry(shot6, 60.5));
const PER_SLOT = Math.ceil(JOBS.length / 95);
let JOBI = 0;
function warm(t) {
  // a cache fill, not state: what is drawn never depends on it (every getter also builds on demand).
  // Slot floor(t * 10) allows PER_SLOT jobs; at most 2 run in any one frame, even after a seek.
  if (t < 0.05) JOBI = 0;
  const target = Math.min(JOBS.length, (Math.floor(t * 10) + 1) * PER_SLOT);
  let n = JOBI < target ? (target - JOBI > PER_SLOT ? 2 : 1) : 0;
  while (n-- > 0 && JOBI < JOBS.length) JOBS[JOBI++]();
}

// ---- shots ----------------------------------------------------------------------------------------------
function shot1(g, t) { // [0-10] wide, dark, slow push; a single tiny warm light far away, there from frame one
  const p = K.ease.inOut(K.seg(t, 0, 10.5));
  const hor = 318 - p * 6;
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1 + p * 0.06, shakeT: t, shakeAmt: 0.6 }, () => {
    voidBg(g, 140 + p * 20, hor, 318);
    horizonMist(g, hor, t, 0.9);
    const a = 0.75 + 0.25 * K.smooth(K.seg(t, 0.5, 3.5));
    lanternCat(g, 566, hor + 3, 2.6, { t, alpha: a, bright: 1.1 });
  });
  K.dust(g, VW, VH, t, { seed: 13, color: "#8fa8ff", count: 18, size: 0.9, alpha: 0.18 });
}

// the hero: drawn live (he breathes, blinks, his ears turn at the bell), lit from inside
function heroCat(t, cx, cy, size) {
  const L = K.layer(VW, VH, "f13hero");
  K.drawCat(L.g, cx, cy, size, {
    pose: "sit", facing: -1, headTurn: 0.32 + Math.sin(t * 0.35) * 0.06, t, tail: 0.25,
    headTilt: t > 17 ? 0.1 * K.smooth(K.seg(t, 17, 17.8)) : 0, ears: t > 17 ? 0.85 : 0.25,
    collar: false, bell: false, shadow: false, pupil: 1, coat: GREY_TABBY,
    // outside light: only his own pool, low and in front; no edge light (that read as an outline)
    key: { x: cx - size * 0.5, y: cy + size * 0.25, color: "#ffb870", strength: 0.3 },
    rim: { x: cx + size * 1.3, y: cy - size * 1.15, color: "#ffc070", strength: 0.12 },
    backlit: 1, fill: "#100a14", ambient: "#1c2048", ambientK: 0.22,
  });
  const px = K.pixelScale();
  innerGlow(L.canvas, L.g, (cx - size * 1.35) * px, (cy - size * 2.05) * px, size * 2.7 * px, (size * 2.1 + 6) * px, {
    cx: (cx - size * 0.08) * px, cy: (cy - size * 0.45) * px, R: size * 1.3 * px, k: 1.0, thin: 0.6, dim: 0.5,
    soft: 0.55, softY: (cy - size * 1.05) * px, softQ: 3, strands: 0.32, strandK: 0.9 * px,
  });
  return L;
}
function shot2(g, t) { // [10-20] closer: the light is a cat, glowing from within; the bell; more lights
  const p = K.ease.inOut(K.seg(t, 10, 20.5));
  const hor = HOR;
  const cx = 620, cy = 408, size = 112;
  K.withCamera(g, VW, VH, { x: 480 + p * 14, y: 270, zoom: 1.0 + p * 0.05, shakeT: t, shakeAmt: 0.8 }, () => {
    voidBg(g, 60 + p * 30, hor);
    horizonMist(g, hor, t, 0.8);
    // then another light, and another: two lanterns far behind, out of focus (17.5 - 19.5)
    const a2 = K.ease.out(K.seg(t, 17.5, 18.6)), a3 = K.ease.out(K.seg(t, 18.4, 19.5));
    const farLight = (x, y, r, a) => {
      K.glow(g, x, y, r * 3.2, "#ff9a3a", 0.12 * a);
      bokeh(g, x, y, r, 0.8 * a, "#ffb060");
      K.lightPool(g, x, y + r * 1.2, r * 3, "#ff9a48", { intensity: 0.2 * a, flat: 0.2 });
      K.reflectStreak(g, x, y + r * 1.4, r * 7, "#ffb060", 0.3 * a, { t, width: r * 0.8 });
    };
    if (a2 > 0) farLight(250, hor + 9, 10, a2);
    if (a3 > 0) farLight(372, hor + 5, 7, a3);
    // the warm pool he throws on the wet ground: the brightest thing on the floor, ~3x his body width
    K.lightPool(g, cx - 8, cy + 6, size * 2.8, "#ff9a48", { intensity: 0.6, flat: 0.17 });
    K.lightPool(g, cx - 8, cy + 6, size * 1.5, "#ffc488", { intensity: 0.85, flat: 0.16 });
    K.lightPool(g, cx - 10, cy + 6, size * 0.7, "#ffe2b8", { intensity: 0.6, flat: 0.14 });
    ripples(g, cx, cy, size * 0.9, t, 1.7, 0.32, "#ffc078", 0.16);
    // the bell's ring (17): one slow bright ring of light running out across the water
    const rp = K.seg(t, 17, 19.8);
    if (rp > 0 && rp < 1) {
      const spr = ringTint("#ffd99a");
      g.save();
      g.globalCompositeOperation = "lighter";
      for (let k = 0; k < 3; k++) {
        const q = K.clamp(rp - k * 0.1);
        if (q <= 0) continue;
        const rx = 60 + q * 760;
        g.globalAlpha = 0.5 * (1 - q) * (1 - k * 0.3);
        g.drawImage(spr, cx - rx, cy - rx * 0.15, rx * 2, rx * 0.3);
      }
      g.restore();
    }
    K.glow(g, cx, cy - size * 0.7, size * 3.2, GOLD, 0.1);
    const L = heroCat(t, cx, cy, size);
    // his reflection: flipped about the waterline, soft; then the vertical streak of his glow under it
    g.save();
    g.translate(0, cy * 2 - 2);
    g.scale(1, -1);
    softDraw(g, L.canvas, 2.5, 0.42, "hr");
    g.restore();
    K.reflectStreak(g, cx - size * 0.15, cy + 4, size * 0.75, "#ffb060", 0.28, { t, width: size * 0.32 });
    K.shadowBlob(g, cx, cy, size * 0.45, size * 0.04, { alpha: 0.45 });
    g.drawImage(L.canvas, 0, 0, VW, VH);
    // light scattered in the mist round the fur (a soft halo, not an edge)
    g.save();
    g.globalCompositeOperation = "lighter";
    softDraw(g, L.canvas, 12, 0.13, "hh");
    g.restore();
  });
  K.dust(g, VW, VH, t, { seed: 14, color: "#ffe0a8", count: 22, size: 1.1, area: [420, 140, 400, 320], alpha: 0.35 });
}

function shot3(g, t, xf) { // [20-32] wide crane up: dozens of glowing cats form a road of light
  const p = K.ease.inOut(K.seg(t, 20, 32.5));
  const hor = K.lerp(220, 192, p);
  const cam = { x: K.lerp(-40, 30, p), y: K.lerp(-60, -330, p), z: K.lerp(-120, 60, p), F: 640, hor };
  const centre = (z) => 260 * Math.sin(z / 2600) - 80;
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1, shakeT: t, shakeAmt: 0.9 }, () => {
    voidBg(g, 100 + p * 40, hor, HOR);
    horizonMist(g, hor, t, 0.9);
    road(g, t, cam, centre, {
      focus: 1500, dofK: 0.9, maxY: 470, noBokeh: xf, haze: 1,
      appear: (i) => K.smooth(K.seg(t, 20 + i * 0.09, 20.6 + i * 0.09)),
    });
  });
  const purr = K.env(t, 29.5, 32.5, 0.8, 1.5);
  if (purr > 0) K.lightPool(g, 480, 330, 600, AMBER, { intensity: purr * 0.05 * (0.6 + 0.4 * Math.sin(t * 9)), flat: 0.4 });
  K.dust(g, VW, VH, t, { seed: 15, color: "#ffe6b0", count: 20, size: 1, alpha: 0.25 });
}

// your sleeve over the wrist: yellow raincoat fabric (weave texture, soft fold shading), warm-lit from below
function sleeve(g, x, y, ang, u, lightK) {
  g.save();
  g.translate(x, y);
  g.rotate(ang + Math.PI / 2);
  g.scale(u, u);
  const SL = 260;
  const p = new Path2D();
  p.moveTo(-28, SL);
  p.bezierCurveTo(-31, SL * 0.6, -32, 60, -27, 14);
  p.quadraticCurveTo(0, 6, 27, 14);
  p.bezierCurveTo(32, 60, 33, SL * 0.6, 30, SL);
  p.closePath();
  // cylinder shading: the lower edge faces her glow, the upper edge the night
  const cg = g.createLinearGradient(-32, 0, 32, 0);
  cg.addColorStop(0, "#1e1806");
  cg.addColorStop(0.35, "#5a4410");
  cg.addColorStop(0.75, "#9a7418");
  cg.addColorStop(1, "#6a4c10");
  g.fillStyle = cg;
  g.fill(p);
  g.save();
  g.clip(p);
  // the weave
  K.texFill(g, "fabric", p, { scale: 26, alpha: 0.5, mode: "overlay", tex: { seed: 1 } });
  // folds: soft troughs and crests across the arm (gradients, no lines)
  for (let i = 0; i < 6; i++) {
    const y0 = 34 + i * 34 + K.hash(i, 77) * 10;
    const tilt = (K.hash(i, 78) - 0.5) * 0.5;
    g.save();
    g.translate(0, y0);
    g.rotate(tilt);
    const fg = g.createLinearGradient(0, -12, 0, 12);
    fg.addColorStop(0, "rgba(255,220,140,0)");
    fg.addColorStop(0.35, "rgba(255,220,140,0.16)");
    fg.addColorStop(0.55, "rgba(20,12,0,0.35)");
    fg.addColorStop(1, "rgba(20,12,0,0)");
    g.fillStyle = fg;
    g.fillRect(-40, -12, 80, 24);
    g.restore();
  }
  // the cuff shadow on the wrist and the warm bounce under it
  const sg = g.createLinearGradient(0, 8, 0, 30);
  sg.addColorStop(0, "rgba(10,6,0,0.55)");
  sg.addColorStop(1, "rgba(10,6,0,0)");
  g.fillStyle = sg;
  g.fillRect(-40, 8, 80, 22);
  const bg = g.createLinearGradient(32, 0, 10, 0);
  bg.addColorStop(0, `rgba(255,150,70,${0.35 * lightK})`);
  bg.addColorStop(1, "rgba(255,150,70,0)");
  g.globalCompositeOperation = "lighter";
  g.fillStyle = bg;
  g.fillRect(0, 0, 40, SL);
  g.restore();
  g.restore();
}
function shot4(g, t) { // [32-42] insert: a small calico pushes her head up into your palm
  const p = K.ease.inOut(K.seg(t, 32, 42.5));
  // she rises into your palm 33.0-35.0, holds the contact and rubs, then settles a little at the end
  const rise = K.ease.inOut(K.seg(t, 33.0, 35.0));
  const settle = K.ease.inOut(K.seg(t, 40.6, 42)) * 0.3;
  const nudge = rise - settle;
  const touch = K.clamp((rise - 0.92) / 0.08) * (1 - settle * 2);
  const rub = Math.sin((t - 35) * 1.8) * K.seg(t, 35.2, 35.8) * (1 - K.seg(t, 40.2, 41));
  const cx = 668 + p * 6, cy = 452, size = 150;
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1.02 + p * 0.03, shakeT: t, shakeAmt: 1 }, () => {
    g.drawImage(insertBg(), -20, -10, VW + 40, VH + 20);
    // her warm pool and reflection on the water
    K.lightPool(g, cx, cy, size * 2.2, "#ff9a48", { intensity: 0.3, flat: 0.16 });
    K.lightPool(g, cx, cy, size * 1.1, "#ffc888", { intensity: 0.4, flat: 0.14 });
    K.glow(g, cx, cy - size * 1.1, size * 2.4, GOLD, 0.1);
    const L = K.layer(VW, VH, "f13kitten");
    // painted at half size and scaled up: the medium-detail fur reads softer and fuller at this scale
    L.g.save();
    L.g.translate(cx, cy);
    L.g.scale(2, 2);
    const hs = size / 2;
    const bodyUp = nudge * 0.05;
    K.drawCat(L.g, 0, 0, hs, Object.assign({
      pose: "sit", facing: 1, headTurn: K.clamp(0.5 - nudge * 0.15 + rub * 0.06, 0.3, 0.6), headTilt: 0.05 + nudge * 0.5, t, coat: K.COATS.calico,
      tail: 0.8, tailUp: 0.7 + nudge * 0.3, blink: touch > 0.3 ? 1 : undefined, ears: 0.15 - touch * 1.0, breath: 1 + bodyUp,
    }, LANTERN(1, 0, 0, hs, { key: 0.45, rim: 0.15 })));
    L.g.restore();
    const px = K.pixelScale();
    innerGlow(L.canvas, L.g, (cx - size * 1.35) * px, (cy - size * 2.1) * px, size * 2.7 * px, (size * 2.15 + 4) * px, {
      cx: (cx + size * 0.12) * px, cy: (cy - size * 0.5) * px, R: size * 1.2 * px, k: 0.36, thin: 0.45, dim: 0.35,
      soft: 0.4, softY: (cy - size * 1.0) * px, softQ: 3, strands: 0.25, strandK: 1.4 * px,
    });
    // the palm above her shades the top of her head as it comes down (soft occlusion)
    const occ = K.clamp(K.seg(t, 32.6, 34.4) * 0.5 + nudge * 0.5);
    if (occ > 0) {
      L.g.save();
      L.g.globalCompositeOperation = "source-atop";
      const ox = cx + size * 0.2, oy = cy - size * 1.9;
      const og = L.g.createRadialGradient(ox, oy, 0, ox, oy, size * 0.85);
      og.addColorStop(0, `rgba(10,8,20,${0.55 * occ})`);
      og.addColorStop(1, "rgba(10,8,20,0)");
      L.g.fillStyle = og;
      L.g.fillRect(0, 0, VW, VH);
      L.g.restore();
    }
    // her reflection in the water
    g.save();
    g.translate(0, cy * 2 - 2);
    g.scale(1, -1);
    softDraw(g, L.canvas, 2.5, 0.35, "kr4");
    g.restore();
    K.shadowBlob(g, cx, cy, size * 0.45, size * 0.04, { alpha: 0.45 });
    g.drawImage(L.canvas, 0, 0, VW, VH);
    g.save();
    g.globalCompositeOperation = "lighter";
    softDraw(g, L.canvas, 12, 0.12, "kh");
    g.restore();
    // your hand comes down from the top right, relaxed and cupped; her head rises into the palm and
    // her glow lights the underside of the fingers (red where the skin is thin)
    const inP = K.ease.out(K.seg(t, 32.2, 34.4));
    const headTop = cy - size * (1.68 + nudge * 0.1);
    const hx = K.lerp(1060, cx + 175, inP) + rub * 5;
    const hy = K.lerp(30, headTop - 52, inP) + rub * 2;
    const ang = Math.PI - 0.12 + rub * 0.03 + (1 - inP) * 0.25;
    const lightK = 0.6 + nudge * 0.6;
    const HL = K.layer(VW, VH, "f13hand");
    sleeve(HL.g, hx, hy, ang, 2.1, lightK);
    povHand(HL.g, hx, hy, 210, {
      left: true, angle: ang, curls: [0.62 + touch * 0.12, 0.7 + touch * 0.1, 0.76 + touch * 0.1, 0.84 + touch * 0.08], spread: 0.03, thumb: 0.15, thumbCurl: 0.35,
      light: { x: cx + size * 0.2, y: cy - size * 1.0, color: "#ff8a58", strength: 1.1 * lightK }, bell: true, t, skin: "#c8906c", sleeve: "#7a5a12", sleeveLen: 26,
    });
    // the hand is in the dark: only her glow lights it, from below - the top falls off into the night
    HL.g.save();
    HL.g.setTransform(1, 0, 0, 1, 0, 0);
    HL.g.globalCompositeOperation = "source-atop";
    const sc = HL.canvas.width / VW;
    const hg = HL.g.createLinearGradient(0, (hy - 140) * sc, 0, (hy + 80) * sc);
    hg.addColorStop(0, "rgba(6,6,16,0.86)");
    hg.addColorStop(0.55, "rgba(6,6,16,0.62)");
    hg.addColorStop(1, "rgba(6,6,16,0.45)");
    HL.g.fillStyle = hg;
    HL.g.fillRect(0, 0, HL.canvas.width, HL.canvas.height);
    // warm subsurface bounce: the edge nearest her glows red-orange through the skin
    HL.g.globalCompositeOperation = "source-atop";
    const bx = cx * sc, by = (headTop + 10) * sc;
    const bg = HL.g.createRadialGradient(bx, by, 0, bx, by, 190 * sc);
    bg.addColorStop(0, `rgba(230,96,50,${0.3 * lightK})`);
    bg.addColorStop(1, "rgba(255,120,60,0)");
    HL.g.fillStyle = bg;
    HL.g.fillRect(0, 0, HL.canvas.width, HL.canvas.height);
    HL.g.restore();
    g.drawImage(HL.canvas, 0, 0, VW, VH);
  });
  K.dust(g, VW, VH, t, { seed: 16, color: "#ffe0a8", count: 18, size: 1.2, alpha: 0.3 });
}

const ROAD_END = 300 + NCATS * 190 + 400;
function shot5(g, t, xf) { // [42-52] down the road through a long lens; the paw-portal at the vanishing point
  const p = K.ease.inOut(K.seg(t, 42, 52.5));
  const hor = HOR;
  const cam = { x: 0, y: -90, z: -1900 + p * 200, F: 2000, hor };
  const pp = project(cam, 0, -60, ROAD_END);
  const swell = K.seg(t, 42, 46);
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1.03 + p * 0.04, shakeT: t, shakeAmt: 0.7 }, () => {
    voidBg(g, 140, hor);
    K.godRays(g, pp[0], pp[1], VW, VH, { color: CYAN, count: 9, strength: 0.02 + swell * 0.02, t, angle: -Math.PI / 2, spread: 2.2, length: 420, seed: 21 });
    horizonMist(g, hor, t, 1.1);
    portalAt(g, pp[0], pp[1], 26, t, 0.75 + swell * 0.25);
    road(g, t, cam, () => 0, { focus: 4000, dofK: 0.9, noBokeh: xf, haze: 0.7 });
    // the Shadow: just off the road on the left, standing, back to us, unmoving
    const sp = project(cam, -205, 0, 160);
    if (sp) shadowCat(g, sp[0], sp[1], 30 * 1.3 * sp[2], t);
  });
  K.dust(g, VW, VH, t, { seed: 17, color: "#cfe8ff", count: 16, size: 1, alpha: 0.22 });
}

// a backlit figure's edges: silhouette minus a shifted copy of itself, in the light's colour
function edgeLight(src, rx, ry, rw, rh, dx, dy, color, alpha, dst) {
  const M = scratch("edge", rw, rh), mg = M.g;
  mg.drawImage(src, rx, ry, rw, rh, 0, 0, rw, rh);
  mg.globalCompositeOperation = "source-in";
  mg.fillStyle = color;
  mg.fillRect(0, 0, rw, rh);
  mg.globalCompositeOperation = "destination-out";
  mg.drawImage(src, rx, ry, rw, rh, dx, dy, rw, rh);
  dst.save();
  dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.globalCompositeOperation = "lighter";
  dst.globalAlpha = alpha;
  dst.drawImage(M.c, 0, 0, rw, rh, rx, ry, rw, rh);
  dst.restore();
}
function shot6(g, t) { // [52-64] from behind, you walk between the lights toward the portal; it flares
  const p = K.seg(t, 52, 64);
  const hor = HOR;
  const walkZ = K.lerp(0, 1100, K.ease.sine(p) * 0.4 + p * 0.6);
  const ph = t * 0.95;
  const bobY = -Math.abs(Math.sin(ph * K.TAU)) * 2.2;
  const cam = { x: Math.sin(ph * Math.PI) * 4, y: -150, z: walkZ - 300, F: 620, hor };
  const flare = K.ease.out(K.seg(t, 56, 57.2)) * (1 - K.seg(t, 57.2, 60) * 0.4) + K.seg(t, 59.5, 63.5) * 1.4;
  const pp = project(cam, 0, -90, walkZ + 4200);
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1, shakeT: t, shakeAmt: 1.0 + K.flash(t, [56], 0.3) * 5 }, () => {
    voidBg(g, 140, hor);
    K.godRays(g, pp[0], pp[1], VW, VH, { color: CYAN, count: 12, strength: 0.04 + flare * 0.1, t, angle: -Math.PI / 2, spread: 2.4, length: 520, seed: 22 });
    horizonMist(g, hor, t, 1.1);
    portalAt(g, pp[0], pp[1], 24 + flare * 14, t, 0.85 + flare * 0.5, K.clamp(flare));
    // the water mirrors the lit mist under the portal: a tall soft column she walks into
    const gs = K.glowSprite("#5a9ad0");
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.24 + flare * 0.2;
    g.drawImage(gs, pp[0] - 110, pp[1] - 10, 220, (VH - pp[1]) * 1.5);
    g.globalAlpha = 0.2 + flare * 0.15;
    g.drawImage(gs, pp[0] - 40, pp[1], 80, (VH - pp[1]) * 1.3);
    g.restore();
    road(g, t, cam, () => 0, { focus: 900, dofK: 1.1, haze: 0.8 });
    const kx = 480, ky = 432 + bobY * 0.4, kh = 200;
    const po = {
      view: "back", walk: true, phase: ph, t, bell: true, hood: false, shadow: false,
      boots: "#4a2420", coat: "#c89a20",
      light: { x: pp[0], y: pp[1], color: "#d8f4ff", strength: 0.8 + flare * 0.4, z: -0.85 }, ambient: "#141a34",
    };
    const KL = K.layer(VW, VH, "f13kid");
    K.drawPerson(KL.g, kx, ky, kh, po);
    hairOver(KL.g, kx, ky, kh, po);
    const sc = KL.canvas.width / VW;
    const rx = Math.floor((kx - 80) * sc), ry = Math.floor((ky - kh * 1.08) * sc), rw = Math.ceil(160 * sc), rh = Math.ceil((kh * 1.1 + 6) * sc);
    // her back faces us: it is in shadow, lit only by the night sky and the lantern cats either side
    KL.g.save();
    KL.g.setTransform(1, 0, 0, 1, 0, 0);
    KL.g.globalCompositeOperation = "source-atop";
    KL.g.fillStyle = "rgba(8,10,24,0.5)";
    KL.g.fillRect(rx, ry, rw, rh);
    // the raincoat's weave and soft fold shading at the waist and under the pack
    {
      const F = scratch("kidfab", rw, rh);
      K.texRect(F.g, "fabric", 0, 0, rw, rh, { scale: 20 * sc, tex: { seed: 1 } });
      F.g.globalCompositeOperation = "destination-in";
      F.g.drawImage(KL.canvas, rx, ry, rw, rh, 0, 0, rw, rh);
      KL.g.globalCompositeOperation = "overlay";
      KL.g.globalAlpha = 0.35;
      KL.g.drawImage(F.c, 0, 0, rw, rh, rx, ry, rw, rh);
      KL.g.globalAlpha = 1;
    }
    KL.g.globalCompositeOperation = "source-atop";
    for (const [fy, fa] of [[0.55, 0.28], [0.62, 0.2], [0.38, 0.16]]) {
      const yy = (ky - kh * fy) * sc;
      const fg = KL.g.createLinearGradient(0, yy - 6 * sc, 0, yy + 6 * sc);
      fg.addColorStop(0, "rgba(0,0,0,0)");
      fg.addColorStop(0.5, `rgba(0,0,0,${fa})`);
      fg.addColorStop(1, "rgba(0,0,0,0)");
      KL.g.fillStyle = fg;
      KL.g.fillRect(rx, yy - 6 * sc, rw, 12 * sc);
    }
    // amber cross-light from the lanterns either side
    const kg = KL.g.createLinearGradient((kx - 60) * sc, 0, (kx + 60) * sc, 0);
    kg.addColorStop(0, "rgba(255,160,80,0.3)");
    kg.addColorStop(0.3, "rgba(255,160,80,0)");
    kg.addColorStop(0.7, "rgba(255,160,80,0)");
    kg.addColorStop(1, "rgba(255,160,80,0.3)");
    KL.g.fillStyle = kg;
    KL.g.fillRect(rx, ry, rw, rh);
    KL.g.restore();
    // the portal behind her rims hair, shoulders and pack in cool light (top edges strongest),
    // the lanterns rim her flanks in amber
    const ek = 0.9 + flare * 0.3;
    edgeLight(KL.canvas, rx, ry, rw, rh, 0, 3.2 * sc, "#bfe6ff", 0.75 * ek, KL.g);
    edgeLight(KL.canvas, rx, ry, rw, rh, 0, 1.4 * sc, "#e8f8ff", 0.35 * ek, KL.g);
    edgeLight(KL.canvas, rx, ry, rw, rh, 1.6 * sc, 0.6 * sc, "#ffa860", 0.26, KL.g);
    edgeLight(KL.canvas, rx, ry, rw, rh, -1.6 * sc, 0.6 * sc, "#ffa860", 0.26, KL.g);
    // her long soft shadow, thrown toward us by the portal along the wet ground
    {
      const S = scratch("kidsh", Math.ceil(rw / 3), Math.ceil(rh / 3));
      S.g.drawImage(KL.canvas, rx, ry, rw, rh, 0, 0, S.c.width, S.c.height);
      S.g.globalCompositeOperation = "source-in";
      S.g.fillStyle = "#020308";
      S.g.fillRect(0, 0, S.c.width, S.c.height);
      g.save();
      const gy = ky;
      // (X, Y) -> (X, gy + k (gy - Y)): the figure laid flat on the water, toward the camera
      g.setTransform(g.getTransform().multiply(new DOMMatrix([1, 0, 0, -1.3, 0, gy * 2.3])));
      g.globalAlpha = 0.8;
      g.drawImage(S.c, 0, 0, S.c.width, S.c.height, rx / sc, ry / sc, rw / sc, rh / sc);
      g.restore();
    }
    K.shadowBlob(g, kx, ky, kh * 0.13, kh * 0.025, { alpha: 0.6 });
    g.save();
    g.translate(0, ky * 2 - 2);
    g.scale(1, -1);
    softDraw(g, KL.canvas, 3, 0.22, "kr");
    g.restore();
    g.drawImage(KL.canvas, 0, 0, VW, VH);
    // the cool halation of the portal round her edges
    g.save();
    g.globalCompositeOperation = "lighter";
    K.glow(g, kx, ky - kh * 0.85, kh * 0.5, "#9fdcff", 0.08 + flare * 0.08);
    g.restore();
  });
  K.dust(g, VW, VH, t, { seed: 18, color: "#ffe6b0", count: 20, size: 1.1, alpha: 0.28 });
  // the portal opens and its light floods outward from the ring, swallowing her and the road
  const wo = K.smooth(K.seg(t, 59.8, 63.4));
  if (wo > 0) {
    const r = K.lerp(60, 1300, Math.pow(wo, 0.8));
    const wg = g.createRadialGradient(pp[0], pp[1], 0, pp[0], pp[1], r);
    wg.addColorStop(0, `rgba(255,255,255,${Math.min(1, wo * 2)})`);
    wg.addColorStop(0.35, `rgba(235,250,255,${Math.min(1, wo * 1.4)})`);
    wg.addColorStop(1, "rgba(220,244,255,0)");
    g.save();
    g.globalCompositeOperation = "lighter";
    g.fillStyle = wg;
    g.fillRect(0, 0, VW, VH);
    g.restore();
  }
}

const SHOTS = [
  [0, shot1, false],
  [10, shot2, false],
  [20, shot3, true],
  [32, shot4, true],
  [42, shot5, false],
  [52, shot6, false],
];
function overlay(g, t, fn, a) {
  const L = K.layer(VW, VH, "f13xf");
  L.g.fillStyle = NAVY;
  L.g.fillRect(0, 0, VW, VH);
  fn(L.g, t, true); // no additive bokeh inside the dissolve layer
  g.save();
  g.globalAlpha = a;
  g.drawImage(L.canvas, 0, 0, VW, VH);
  g.restore();
}
function compose(g, t) {
  let i = 0;
  while (i < SHOTS.length - 1 && t >= SHOTS[i + 1][0]) i++;
  const cur = SHOTS[i], next = SHOTS[i + 1];
  if (next && next[2] && t > next[0] - XF / 2) {
    cur[1](g, t, false);
    overlay(g, t, next[1], K.smooth((t - (next[0] - XF / 2)) / XF));
  } else if (cur[2] && i > 0 && t < cur[0] + XF / 2) {
    SHOTS[i - 1][1](g, t, false);
    overlay(g, t, cur[1], K.smooth((t - (cur[0] - XF / 2)) / XF));
  } else cur[1](g, t, false);
}

export const film = {
  id: 13,
  title: "The Lantern Cats",
  chapter: "Chapter 13",
  unlockAt: 65,
  duration: D,
  poster: 38,
  tagline: "Every cat you find is a light.",
  subs: [
    [3.0, 7.0, "In the dark, a light."],
    [11.5, 16.0, "A cat you found. Glowing. Safe."],
    [19.0, 23.5, "Then another. And another."],
    [24.0, 29.0, "Every cat you found was lighting the way."],
    [33.0, 37.5, "They were not lost anymore."],
    [38.0, 41.5, "Because you came."],
    [44.0, 49.0, "The shadow was there. The cats did not mind."],
    [52.5, 57.0, "Maybe it was never what you thought."],
    [58.0, 62.0, "One more step."],
  ],
  voice: [
    [3.0, "In the dark, a light."],
    [11.5, "A cat you found. Glowing. Safe."],
    [19.0, "Then another. And another."],
    [24.0, "Every cat you found was lighting the way."],
    [33.0, "They were not lost anymore."],
    [38.0, "Because you came."],
    [44.0, "The shadow was there. The cats did not mind."],
    [52.5, "Maybe it was never what you thought."],
    [58.0, "One more step."],
  ],
  score: { mood: "hopeful", key: "F", bpm: 72, cues: [[4, "swell"], [17, "bell"], [30, "purr"], [42, "swell"], [56, "hit"]] },
  // night exterior through the lens: cool blacks, warm lights that bloom and halate, a gentle handheld
  grade: {
    exposure: 1.2, temp: -0.04, tint: 0, lift: [0.006, 0.009, 0.022], gamma: [1, 1, 1], gain: [1.02, 1, 0.97],
    contrast: 1.04, sat: 0.95, bloom: 0.45, threshold: 0.9, halation: 0.55, streak: 0.04, grain: 0.045, grainSize: 1.3,
    ca: 0.5, vignette: 0.5, weave: 0.6, sharpen: 0.15,
  },
  gradeAt(t) {
    // the void warms as it fills with cats (shots 3-4), cools toward the portal; the paw-portal shot keeps
    // the bloom down so the cyan paw does not clip; the flare at the end opens up into the white-out
    const warm = K.smooth(K.seg(t, 18, 30)) * (1 - K.smooth(K.seg(t, 41, 44)));
    const end = K.smooth(K.seg(t, 56, 63));
    const paw = K.env(t, 42, 55.5, 0.4, 0.8);
    return {
      temp: -0.04 + warm * 0.1 - end * 0.06,
      exposure: 1.2 + warm * 0.05 + end * 0.2 - paw * 0.06,
      bloom: 0.45 + end * 0.25 - paw * 0.12,
      threshold: 0.9 + paw * 0.12,
      weave: t < 10 ? 0.4 : 0.6,
    };
  },
  draw(g, t, W, H) {
    warm(t);
    g.save();
    g.scale(W / VW, H / VH);
    g.fillStyle = NAVY;
    g.fillRect(0, 0, VW, VH);
    compose(g, t);
    K.letterbox(g, VW, VH, 1);
    const ta = K.env(t, 1.6, 6.4, 1.0, 1.0);
    if (ta > 0) K.title(g, VW, VH, "The Lantern Cats", "Chapter 13", ta, { y: VH * 0.36, size: 56, glow: "#ffcf6a" });
    K.fadeBlack(g, VW, VH, 1 - K.smooth(K.seg(t, 0.4, 2.0)));
    // the portal swallows the picture in pure white; the letterbox bars stay black
    const wf = K.smooth(K.seg(t, 62.6, 63.7));
    if (wf > 0) {
      g.save();
      g.globalAlpha = wf;
      g.fillStyle = "#ffffff";
      g.fillRect(0, BAR, VW, VH - BAR * 2);
      g.restore();
    }
    g.restore();
  },
};
