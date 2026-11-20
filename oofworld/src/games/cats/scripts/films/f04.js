// films/f04.js - Chapter 4 "The Box in the Rain" (FILMS.md f04). Present: the moonlit Catford clock
// tower. Flashback: the grey rainy day you found a tiny orange kitten in a box marked FREE.
// draw(g, t, W, H) is a pure function of t. Every static plate (stone, cardboard, slate, the rooms) is
// built once into a cached sprite: albedo textures are baked per pixel (height -> normal -> light), then
// RE-LIT by the shot's real light sources (ambient x albedo + sum of albedo x light x falloff), so the
// frame is lit like a photograph instead of tinted like an illustration. Lens work (bloom, grain,
// vignette, grade) is left to the GPU lens: see film.grade / film.gradeAt.
import * as K from "../filmkit.js";

const D = 74;
const LW = 960, LH = 540;
const MOONC = "#bcd0ff", UMB = "#c0392b", HEATER = "#ff8a3a";
const { clamp, lerp, seg, smooth, mix, rgba, shade, hash, noise, glow } = K;
const TAU = Math.PI * 2;
const eio = (x) => K.ease.inOut(clamp(x));
const tN = K.texNoise, tF = K.texFbm;
const sm = (a, b, x) => { const v = clamp((x - a) / (b - a)); return v * v * (3 - 2 * v); };
// the kitten: Biscuit's coat a shade paler and fluffier, kitten-blue eyes
const KITTEN = Object.assign({}, K.BISCUIT, { iris: "#7f96ab", irisInner: "#b6c6d4", stripeAlpha: 0.62, light: "#f3c08a" });

// ---- build-time helpers (run only inside sprite/texture builders) ---------------------------------------
function tmp(w, h) {
  const px = K.pixelScale();
  const c = K.makeCanvas(Math.ceil(w * px), Math.ceil(h * px));
  const g = c.getContext("2d");
  g.setTransform(px, 0, 0, px, 0, 0);
  return { c, g };
}
// bakeSurface(key, w, h, sample(u,v,S,x,y), {light, amb, bump, ao}) - a tileable lit material: sample
// writes S.h (height 0..1) and S.r/g/b (albedo); the normal comes from the height field, cavities darken.
// The height/albedo pass is the expensive part, so it is filled in row chunks: inside a warm task
// (SURF_DL > 0) it stops at the deadline and returns null, and the next warm task carries on from that
// row. Called outside a warm task, it finishes the remaining rows and bakes at once.
let SURF_DL = 0;
const SURF = new Map();
const PROF = false; // dev only: log slow cache builds
function spr(key, w, h, paint) {
  if (!PROF) return K.sprite(key, w, h, paint);
  return K.sprite(key, w, h, (s, a, b) => { const t0 = performance.now(); paint(s, a, b); const ms = performance.now() - t0; if (ms > 25) console.error("[f04 build] " + key + " " + ms.toFixed(0) + " ms"); });
}
function bakeSurface(key, w, h, sample, o = {}) {
  let st = SURF.get(key);
  if (!st) { st = { Hf: new Float32Array(w * h), C: new Float32Array(w * h * 3), row: 0 }; SURF.set(key, st); }
  const fill = (dl) => {
    const S = { h: 0, r: 0, g: 0, b: 0 }, Hf = st.Hf, C = st.C;
    while (st.row < h) {
      const yy = st.row;
      for (let xx = 0; xx < w; xx++) {
        S.h = 0; sample(xx / w, yy / h, S, xx, yy);
        const i = yy * w + xx;
        Hf[i] = S.h; C[i * 3] = S.r; C[i * 3 + 1] = S.g; C[i * 3 + 2] = S.b;
      }
      st.row++;
      if (dl && (st.row & 3) === 0 && performance.now() > dl) break;
    }
  };
  if (st.row < h && SURF_DL) { fill(SURF_DL); if (st.row < h) return null; }
  let [lx, ly, lz] = o.light || [-0.4, -0.65, 0.65];
  const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
  const amb = o.amb == null ? 0.42 : o.amb, bump = o.bump == null ? 2 : o.bump, aoK = o.ao == null ? 1.6 : o.ao;
  const t0 = PROF ? performance.now() : 0;
  const res = K.texBake("f04:" + key, w, h, (u, v, out, x, y) => {
    if (st.row < h) fill(0);
    const Hf = st.Hf, C = st.C;
    const i = y * w + x, xm = (x - 1 + w) % w, xp = (x + 1) % w, ym = (y - 1 + h) % h, yp = (y + 1) % h;
    const dx = Hf[y * w + xp] - Hf[y * w + xm], dy = Hf[yp * w + x] - Hf[ym * w + x];
    const nx = -dx * bump, ny = -dy * bump, nl = Math.hypot(nx, ny, 1);
    const ndl = Math.max(0, (nx * lx + ny * ly + lz) / nl);
    const r = 3;
    const avg = (Hf[y * w + (x + r) % w] + Hf[y * w + (x - r + w) % w] + Hf[((y + r) % h) * w + x] + Hf[((y - r + h) % h) * w + x]) * 0.25;
    const ao = clamp(1 + (Hf[i] - avg) * aoK, 0.35, 1.15);
    const lit = (amb + (1 - amb) * ndl / lz) * ao;
    out[0] = C[i * 3] * lit; out[1] = C[i * 3 + 1] * lit; out[2] = C[i * 3 + 2] * lit; out[3] = 255;
  });
  if (PROF && performance.now() - t0 > 25) console.error("[f04 bake] " + key + " " + (performance.now() - t0).toFixed(0) + " ms");
  return res;
}
// fieldOf(key, w, h, fn(u,v,x,y) -> number): a scalar field filled in row chunks like bakeSurface
// (null while a warm task's deadline interrupts it)
const FIELDS = new Map();
function fieldOf(key, w, h, fn) {
  let st = FIELDS.get(key);
  if (!st) { st = { a: new Float32Array(w * h), row: 0 }; FIELDS.set(key, st); }
  while (st.row < h) {
    const y = st.row;
    for (let x = 0; x < w; x++) st.a[y * w + x] = fn(x / w, y / h, x, y);
    st.row++;
    if (SURF_DL && (st.row & 3) === 0 && performance.now() > SURF_DL && st.row < h) return null;
  }
  return st.a;
}
// a volumetric cloud deck (tileable in u): fbm density, light marched from above (the moon) and from
// below (the town's sodium glow), so the tops are silvered and the bellies glow warm, cores dark
function cloudTex(key, seed, warm, o = {}) {
  const w = o.w || 384, h = o.h || 112;
  const D = fieldOf("cl" + key, w, h, (u, v) => {
    const n = tF(u * 5, v * 2.2, seed, 5, 5, 0) + tF(u * 17, v * 7, seed + 4, 3, 17, 0) * 0.25;
    const band = Math.pow(Math.sin(v * Math.PI), 0.7);
    return clamp((n * 1.7 + (o.cover || 0.12)) * band * 1.5 - 0.12);
  });
  if (!D) return null;
  const mc = RGB(o.moon || "#8c9cc8"), tc = RGB(o.town || "#c07a48"), bc = RGB(o.base || "#141a28");
  return K.texBake("f04" + key, w, h, (u, v, out, x, y) => {
    const d = D[y * w + x];
    let up = 0, dn = 0;
    for (let k = 1; k <= 4; k++) { up += D[Math.max(0, y - k * 3) * w + x]; dn += D[Math.min(h - 1, y + k * 3) * w + x]; }
    const mL = Math.exp(-up * 0.9), gL = Math.exp(-dn * 0.9) * warm;
    for (let c = 0; c < 3; c++) out[c] = bc[c] + mc[c] * mL * 0.75 + tc[c] * gL * 0.6;
    out[3] = clamp(d * 1.25) * 235;
  });
}
const RGB = (c) => K.parseColor(c);
// dressed sandstone / limestone ashlar: 4 courses per tile, chamfered joints, tool marks, weathering
// stains and vertical rain streaks
// rows = courses per 256 px tile. Every course has its own run of stones of different lengths (cut
// points from a hash, wrapping so the tile still repeats), a recessed mortar bed, a chamfered arris,
// per-stone tone/warmth, the odd darker replacement stone, pitting, and rain streaks.
function ashlarTex(seed = 1, base = "#8c8576", rows = 4) {
  const B = RGB(base), M = RGB("#4a4640");
  const cuts = [];
  for (let r = 0; r < rows; r++) {
    const n = 3 + Math.floor(hash(r, seed + 31) * 2.6), ws = [];
    let sum = 0;
    for (let i = 0; i < n; i++) { const w = 0.55 + hash(r * 7 + i, seed + 37) * 1.15; ws.push(w); sum += w; }
    let acc = hash(r, seed) ; const cs = [];
    for (let i = 0; i < n; i++) { cs.push(acc % 1); acc += ws[i] / sum; }
    cs.sort((a, b) => a - b);
    cuts.push(cs);
  }
  const rowH = 256 / rows, mort = rows > 4 ? 1.5 : 2.4;
  return bakeSurface("ashlar" + seed + base + rows, 256, 256, (u, v, S) => {
    const row = Math.floor(v * rows), fv = v * rows - row, cs = cuts[row];
    let bi = cs.length - 1;
    for (let i = 0; i < cs.length; i++) if (u >= cs[i]) bi = i;
    const a = cs[bi], b = bi + 1 < cs.length ? cs[bi + 1] : cs[0] + 1;
    const uu = u < a ? u + 1 : u;
    const id = row * 11 + bi;
    const e = Math.min(Math.min(uu - a, b - uu) * 256, Math.min(fv, 1 - fv) * rowH);
    const n1 = tF(u * 8, v * 8, seed, 4, 8, 8), n2 = tN(u * 64, v * 64, seed + 3, 64, 64);
    const streak = tF(u * 40, v * 2, seed + 5, 3, 40, 2);
    if (e < mort) {
      S.h = 0.08 + n2 * 0.03;
      const k = 0.62 + n1 * 0.22;
      S.r = M[0] * k; S.g = M[1] * k; S.b = M[2] * k;
      return;
    }
    const chip = tN(u * 22, v * 22, seed + 7, 22, 22), pit = tN(u * 128, v * 128, seed + 13, 128, 128);
    S.h = 0.5 + 0.36 * sm(mort, mort * 3.2, e) + n1 * 0.1 + n2 * 0.035 - (chip > 0.55 ? (chip - 0.55) * 0.6 : 0) - (pit > 0.78 ? 0.05 : 0);
    const odd = hash(id, seed + 17) > 0.9 ? 0.72 : 1;
    const tone = (0.76 + hash(id, seed + 9) * 0.36) * odd;
    const warm = (hash(id, seed + 11) - 0.5) * 0.16;
    const dirt = clamp(0.92 + n1 * 0.22 - clamp(streak) * 0.3 - (1 - sm(0, 0.35, fv)) * 0.06);
    const k = tone * dirt * (0.94 + pit * 0.1);
    S.r = B[0] * k * (1 + warm); S.g = B[1] * k; S.b = B[2] * k * (1 - warm);
  }, { light: [0.3, -0.75, 0.6], amb: 0.48, bump: 2.6, ao: 1.4 });
}
// corrugated kraft board: flutes, fibres, scuffs; wet = darker, blotchy, glossier
function cardboardTex(wet = 0) {
  const A = RGB(mix("#a47c4c", "#5e4226", wet * 0.6)), Dk = RGB(mix("#6e4e2c", "#2e1e10", wet * 0.6));
  return bakeSurface("card" + wet, 192, 192, (u, v, S, x) => {
    const flute = Math.sin(u * TAU * 24) * 0.5 + 0.5;
    const fib = tN(u * 90, v * 12, 21, 90, 12) * 0.5 + tN(u * 160, v * 40, 22, 160, 40) * 0.3;
    const blot = tF(u * 3, v * 3, 23, 4, 3, 3);
    const soak = wet > 0 ? clamp(blot * 1.4 + 0.3) * wet : 0;
    S.h = flute * (0.18 - wet * 0.08) + fib * 0.05 + blot * 0.06;
    const k = clamp(0.5 + fib * 0.25 + flute * 0.06 + blot * 0.12, 0, 1);
    S.r = lerp(Dk[0], A[0], k) * (1 - soak * 0.25); S.g = lerp(Dk[1], A[1], k) * (1 - soak * 0.28); S.b = lerp(Dk[2], A[2], k) * (1 - soak * 0.3);
  }, { light: [-0.3, -0.7, 0.65], amb: 0.62, bump: 3, ao: 0.6 });
}
// relight(albedo, w, h, ambient, lights[{color, k, mask(g,w,h)}]) -> canvas: albedo x ambient + sum of
// albedo x light colour x falloff mask (the mask paints alpha). Build time only.
function relight(albedo, w, h, ambient, lights = []) {
  const O = tmp(w, h);
  O.g.drawImage(albedo, 0, 0, w, h);
  O.g.globalCompositeOperation = "multiply";
  O.g.fillStyle = ambient; O.g.fillRect(0, 0, w, h);
  O.g.globalCompositeOperation = "destination-in";
  O.g.drawImage(albedo, 0, 0, w, h);
  for (const L of lights) {
    const T = tmp(w, h), Mk = tmp(w, h);
    T.g.drawImage(albedo, 0, 0, w, h);
    T.g.globalCompositeOperation = "multiply";
    T.g.fillStyle = L.color; T.g.fillRect(0, 0, w, h);
    L.mask(Mk.g, w, h);
    T.g.globalCompositeOperation = "destination-in";
    T.g.drawImage(Mk.c, 0, 0, w, h);
    O.g.globalCompositeOperation = "lighter";
    O.g.globalAlpha = L.k == null ? 1 : L.k;
    O.g.drawImage(T.c, 0, 0, w, h);
    if (L.k > 1) { O.g.globalAlpha = L.k - 1; O.g.drawImage(T.c, 0, 0, w, h); }
    O.g.globalAlpha = 1;
  }
  O.g.globalCompositeOperation = "source-over";
  return O.c;
}
const radial = (x, y, r, stops) => (g, w, h) => {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
  g.fillStyle = gr; g.fillRect(-w, -h, w * 3, h * 3);
};
const linear = (x0, y0, x1, y1, stops) => (g, w, h) => {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
  g.fillStyle = gr; g.fillRect(-w, -h, w * 3, h * 3);
};
function setPat(p, a, b, c, d, e, f) { if (p && p.setTransform && typeof DOMMatrix !== "undefined") p.setTransform(new DOMMatrix([a, b, c, d, e, f])); }
// a planar quad receding sideways, image mapped perspective-correct: near edge x0 (top0..bot0), far x1
function perspCols(s, img, iw, ih, x0, top0, bot0, x1, top1, bot1, step = 2) {
  const h0 = bot0 - top0, h1 = bot1 - top1, n = Math.max(1, Math.ceil(Math.abs(x1 - x0) / step));
  const uc = (q) => (q / h1) / ((1 - q) / h0 + q / h1);
  for (let i = 0; i < n; i++) {
    const qa = i / n, qb = (i + 1) / n;
    const ua = uc(qa) * iw, ub = uc(qb) * iw;
    const xa = lerp(x0, x1, qa), xb = lerp(x0, x1, qb);
    const tp = lerp(top0, top1, (qa + qb) / 2), bt = lerp(bot0, bot1, (qa + qb) / 2);
    s.drawImage(img, Math.min(ua, ub), 0, Math.max(0.5, Math.abs(ub - ua)), ih, Math.min(xa, xb) - 0.3, tp, Math.abs(xb - xa) + 0.6, bt - tp);
  }
}
// soft blurred copy of fn's drawing (build time): foreground occluders out of focus
function blurredSprite(key, w, h, blur, fn) {
  return K.sprite(key, w, h, (s) => {
    const T = tmp(w, h);
    fn(T.g, w, h);
    if (K.hasFilter()) s.filter = `blur(${K.qblur(blur)}px)`;
    s.drawImage(T.c, 0, 0, w, h);
    s.filter = "none";
  });
}
// a bare winter branch silhouette (recursive), for out-of-focus foreground framing
function branch(s, x, y, a, len, wdt, depth, seed) {
  if (depth <= 0 || len < 4) return;
  const bend = (hash(depth * 13 + seed, seed) - 0.5) * 0.5;
  const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
  s.lineWidth = wdt; s.lineCap = "round";
  s.beginPath(); s.moveTo(x, y); s.quadraticCurveTo(x + Math.cos(a + bend) * len * 0.5, y + Math.sin(a + bend) * len * 0.5, ex, ey); s.stroke();
  const k = 2 + (hash(seed, depth) > 0.6 ? 1 : 0);
  for (let i = 0; i < k; i++) branch(s, ex, ey, a + (i - (k - 1) / 2) * 0.55 + (hash(i + seed * 3, depth) - 0.5) * 0.4, len * (0.62 + hash(i, seed + depth) * 0.2), wdt * 0.62, depth - 1, seed * 7 + i + 1);
}

// ---- shot 1: low angle up the clock tower at night --------------------------------------------------
// World space: x -80..1040, y -260..640. The tower converges upward like a real wide lens looking up.
const TW = { cx: 480, base: 640, top: -60, half: 230 };
const TWX0 = -80, TWY0 = -260, TWW = 1120, TWH = 900;
const kAt = (y) => lerp(1, 0.5, (TW.base - y) / (TW.base - TW.top));
const tx = (x, y) => TW.cx + (x - TW.cx) * kAt(y);
// fill a vertical face (cx-centred) with a tiling texture in converging perspective, strips of 2 px
function towerStrips(s, img, x0f, x1f, yTop, yBot, scale) {
  const pat = s.createPattern(img, "repeat");
  let V = 0;
  s.fillStyle = pat;
  for (let y = yBot; y > yTop; y -= 2) {
    const k = kAt(y - 1), sc = k * scale;
    V -= 2 / sc;
    setPat(pat, sc, 0, 0, sc, TW.cx - 128 * sc, y - 2 - V * sc);
    const xa = tx(x0f, y - 1), xb = tx(x1f, y - 1);
    s.fillRect(xa, y - 2.2, xb - xa, 2.6);
  }
}
const CLK = { x: 480, y: 215, r: 104 };
function paintTowerAlbedo(s) {
  const { half } = TW;
  towerStrips(s, ashlarTex(3, "#958d7d", 8), TW.cx - half, TW.cx + half, -330, TW.base, 0.25);
}
function paintTower(s) {
  s.translate(-TWX0, -TWY0);
  const { half } = TW;
  const body = new Path2D();
  body.moveTo(tx(TW.cx - half, TW.base), TW.base); body.lineTo(tx(TW.cx - half, TW.top), TW.top);
  body.lineTo(tx(TW.cx + half, TW.top), TW.top); body.lineTo(tx(TW.cx + half, TW.base), TW.base); body.closePath();
  // albedo of the face, then lit by: moon (cool, upper right), the clock (warm spill, falls off), and
  // the town's sodium street light washing up from the base
  const A = tmp(TWW, TWH);
  A.g.translate(-TWX0, -TWY0);
  A.g.save(); A.g.clip(body); paintTowerAlbedo(A.g); A.g.restore();
  const cx = CLK.x - TWX0, cy = CLK.y - TWY0;
  const lit = relight(A.c, TWW, TWH, "#232c44", [
    { color: "#8ea4d0", k: 0.8, mask: (g, w, h) => { linear(0, 0, w, 0, [[0.25, 0.1], [0.62, 0.32], [0.8, 0.62], [1, 0.7]])(g, w, h); g.globalCompositeOperation = "destination-in"; linear(0, 0, 0, h, [[0, 1], [0.6, 0.7], [1, 0.25]])(g, w, h); } },
    { color: "#ffc27a", k: 1.25, mask: radial(cx, cy, 430, [[0, 1], [0.25, 0.85], [0.36, 0.42], [0.55, 0.16], [0.8, 0.04], [1, 0]]) },
    { color: "#ff9440", k: 1.1, mask: linear(0, TWH, 0, TWH - 520, [[0, 0.95], [0.25, 0.45], [0.6, 0.1], [1, 0]]) },
  ]);
  s.drawImage(lit, TWX0, TWY0, TWW, TWH);
  // corner pilasters: their inner returns show (we look up from the centre); outer faces lit by the moon
  for (const sd of [-1, 1]) {
    const xo = TW.cx + sd * half, xi = TW.cx + sd * (half - 34);
    const ret = new Path2D();
    ret.moveTo(tx(xi, TW.base), TW.base); ret.lineTo(tx(xi, TW.top), TW.top); ret.lineTo(tx(xi, TW.top) - sd * 7 * kAt(TW.top), TW.top); ret.lineTo(tx(xi, TW.base) - sd * 7, TW.base); ret.closePath();
    s.fillStyle = sd > 0 ? "rgba(6,8,14,0.75)" : "rgba(4,5,10,0.85)"; s.fill(ret);
    const pf = new Path2D();
    pf.moveTo(tx(xo, TW.base), TW.base); pf.lineTo(tx(xo, TW.top), TW.top); pf.lineTo(tx(xi, TW.top), TW.top); pf.lineTo(tx(xi, TW.base), TW.base); pf.closePath();
    s.fillStyle = sd > 0 ? "rgba(150,170,220,0.10)" : "rgba(0,0,0,0.32)"; s.fill(pf);
    // the corner arris catches the moon on the right, a hairline
    if (sd > 0) { s.strokeStyle = "rgba(170,190,240,0.35)"; s.lineWidth = 1.2; s.beginPath(); s.moveTo(tx(xo, TW.base) - 1, TW.base); s.lineTo(tx(xo, TW.top) - 1, TW.top); s.stroke(); }
  }
  // string courses (cornices): a lit top arris, a deep soffit seen from below, AO on the wall under them
  for (const [y, warm] of [[70, 0.25], [362, 0.8]]) {
    const xa = tx(TW.cx - half - 12, y), xb = tx(TW.cx + half + 12, y), k = kAt(y);
    const hF = 15 * k, hS = 9 * k;
    s.fillStyle = mix("#2a2e38", "#5a3a22", warm * 0.5); s.fillRect(xa, y, xb - xa, hF);
    K.texRect(s, "granite", xa, y, xb - xa, hF, { scale: 120 * k, alpha: 0.35, mode: "overlay", tex: { seed: 4, lichen: 0 } });
    const so = s.createLinearGradient(0, y + hF, 0, y + hF + hS);
    so.addColorStop(0, mix("#0c0e14", "#6a3a1a", warm)); so.addColorStop(1, mix("#14161e", "#9a5a28", warm));
    s.fillStyle = so; s.fillRect(xa + 2, y + hF, xb - xa - 4, hS);
    s.fillStyle = "rgba(160,180,230,0.45)"; s.fillRect(xa, y, xb - xa, 1.2);
    K.aoEdge(s, xa, y + hF + hS, xb, y + hF + hS, { width: 26 * k, alpha: 0.55, side: -1 });
    // rain staining that runs down from the course
    const R = K.rng("f04stain" + y);
    for (let i = 0; i < 26; i++) {
      const x = lerp(xa + 10, xb - 10, R()), len = (20 + R() * 90) * k, w2 = (2 + R() * 6) * k;
      const sg = s.createLinearGradient(0, y + hF + hS, 0, y + hF + hS + len);
      sg.addColorStop(0, `rgba(10,10,14,${0.25 + R() * 0.2})`); sg.addColorStop(1, "rgba(10,10,14,0)");
      s.fillStyle = sg; s.fillRect(x, y + hF + hS, w2, len);
    }
  }
  // belfry: three arched openings, voussoir rings, the timber bell frame in the dark beyond
  for (const ax of [-120, 0, 120]) {
    const yb = 66, yt = -10;
    const x0 = tx(TW.cx + ax - 44, 30), x1 = tx(TW.cx + ax + 44, 30), r = (x1 - x0) / 2, mx = (x0 + x1) / 2;
    s.fillStyle = "rgba(200,190,170,0.08)";
    s.beginPath(); s.arc(mx, yt, r + 9, Math.PI, 0); s.lineTo(mx + r + 9, yb); s.lineTo(mx - r - 9, yb); s.fill();
    s.strokeStyle = "rgba(0,0,0,0.45)"; s.lineWidth = 1;
    for (let k = 0; k <= 8; k++) { const a = Math.PI + (k / 8) * Math.PI; s.beginPath(); s.moveTo(mx + Math.cos(a) * r, yt + Math.sin(a) * r); s.lineTo(mx + Math.cos(a) * (r + 9), yt + Math.sin(a) * (r + 9)); s.stroke(); }
    const op = new Path2D();
    op.moveTo(x0, yb); op.lineTo(x0, yt); op.arc(mx, yt, r, Math.PI, 0); op.lineTo(x1, yb); op.closePath();
    const ig = s.createLinearGradient(0, yt - r, 0, yb);
    ig.addColorStop(0, "#020308"); ig.addColorStop(1, "#090b12");
    s.fillStyle = ig; s.fill(op);
    s.save(); s.clip(op);
    if (ax !== 0) { s.fillStyle = "#14100c"; s.fillRect(x0, 30, x1 - x0, 7); s.fillRect(mx - 3, yt - r, 6, yb - yt + r); }
    // the reveal's lit inner jamb (moon from the right)
    s.fillStyle = "rgba(140,160,210,0.18)"; s.fillRect(x1 - 6, yt - r, 6, yb - yt + r);
    s.restore();
    s.fillStyle = "#1a1c22"; s.fillRect(x0 - 6, yb, x1 - x0 + 12, 6);
    s.fillStyle = "rgba(170,190,240,0.4)"; s.fillRect(x0 - 6, yb, x1 - x0 + 12, 1);
  }
  // lancet window under the clock: dark glazing with a cold sky reflection
  const lw = new Path2D();
  lw.moveTo(tx(TW.cx - 20, 528), 528); lw.lineTo(tx(TW.cx - 20, 452), 452); lw.quadraticCurveTo(TW.cx, 412, tx(TW.cx + 20, 452), 452); lw.lineTo(tx(TW.cx + 20, 528), 528); lw.closePath();
  s.fillStyle = "rgba(205,190,160,0.12)"; s.save(); s.translate(0, -2); s.scale(1, 1); s.lineWidth = 10; s.strokeStyle = "rgba(60,50,40,0.5)"; s.stroke(lw); s.restore();
  const wg = s.createLinearGradient(0, 420, 0, 528);
  wg.addColorStop(0, "#1c2436"); wg.addColorStop(0.5, "#0a0d16"); wg.addColorStop(1, "#2a1c14");
  s.fillStyle = wg; s.fill(lw);
  s.strokeStyle = "rgba(0,0,0,0.6)"; s.lineWidth = 1.4;
  s.beginPath(); s.moveTo(TW.cx, 420); s.lineTo(TW.cx, 528); for (let y = 450; y < 528; y += 18) { s.moveTo(tx(TW.cx - 20, y), y); s.lineTo(tx(TW.cx + 20, y), y); } s.stroke();
  // the clock's deep recess: a dark ring of shadow, then the iron bezel
  s.fillStyle = "#06070a";
  s.beginPath(); s.arc(CLK.x, CLK.y, CLK.r + 15, 0, TAU); s.fill();
  const bz = s.createLinearGradient(0, CLK.y - CLK.r - 15, 0, CLK.y + CLK.r + 15);
  bz.addColorStop(0, "#6a7088"); bz.addColorStop(0.3, "#22252e"); bz.addColorStop(0.75, "#1a140e"); bz.addColorStop(1, "#8a5a30");
  s.strokeStyle = bz; s.lineWidth = 7;
  s.beginPath(); s.arc(CLK.x, CLK.y, CLK.r + 5, 0, TAU); s.stroke();
  // the slate spire, converging to its point, wet: a cold sheen on the moon side
  const sp = new Path2D();
  const sL = tx(TW.cx - half - 16, TW.top), sR = tx(TW.cx + half + 16, TW.top), apex = TW.top - 260;
  sp.moveTo(sL, TW.top); sp.lineTo(TW.cx, apex); sp.lineTo(sR, TW.top); sp.closePath();
  s.save(); s.clip(sp);
  K.texRect(s, "shingle", sL, apex, sR - sL, TW.top - apex, { scale: 70, tex: { seed: 6, color: "#3a3e48" } });
  const shd = s.createLinearGradient(sL, 0, sR, 0);
  shd.addColorStop(0, "rgba(2,3,8,0.85)"); shd.addColorStop(0.5, "rgba(4,6,12,0.55)"); shd.addColorStop(0.85, "rgba(60,74,110,0.2)"); shd.addColorStop(1, "rgba(150,170,220,0.35)");
  s.fillStyle = shd; s.fill(sp);
  s.restore();
  s.strokeStyle = "rgba(180,200,245,0.5)"; s.lineWidth = 1.4;
  s.beginPath(); s.moveTo(TW.cx, apex); s.lineTo(sR, TW.top); s.stroke();
  s.fillStyle = "#14161c"; s.fillRect(sL - 4, TW.top - 3, sR - sL + 8, 7);
  // finial
  s.strokeStyle = "#0c0d10"; s.lineWidth = 2.5; s.beginPath(); s.moveTo(TW.cx, apex); s.lineTo(TW.cx, apex - 40); s.stroke();
  s.beginPath(); s.arc(TW.cx, apex - 14, 4, 0, TAU); s.fillStyle = "#0c0d10"; s.fill();
}
// the clock dial: back-lit opal glass (near-clipped warm core so the lens blooms it), iron chapter ring,
// glazing bars and minute ticks in silhouette, a little mottling in the glass
function paintDial(s) {
  const R = 120, c = 130, r = CLK.r;
  // the lamp behind the opal glass sits low and a little right of the arbor: a hot spot there, the
  // light falling off (inverse square through the diffuser) to a dim amber at the rim, where the deep
  // bezel also shades the glass
  s.fillStyle = "#8a5426"; s.beginPath(); s.arc(c, c, r, 0, TAU); s.fill();
  const gr = s.createRadialGradient(c + 10, c + 22, 0, c + 4, c + 10, r * 1.08);
  gr.addColorStop(0, "#fffaf0"); gr.addColorStop(0.16, "#fff3d6"); gr.addColorStop(0.38, "#fde3ae"); gr.addColorStop(0.62, "#efc27e"); gr.addColorStop(0.84, "#c98c48"); gr.addColorStop(1, "#8a5426");
  s.fillStyle = gr; s.beginPath(); s.arc(c, c, r, 0, TAU); s.fill();
  s.save(); s.beginPath(); s.arc(c, c, r, 0, TAU); s.clip();
  const mot = K.texBake("f04opal", 128, 128, (u, v, out) => { const n = tF(u * 5, v * 5, 61, 5, 5, 5), m = tN(u * 24, v * 24, 62, 24, 24); out[0] = 120; out[1] = 70; out[2] = 20; out[3] = clamp(n * 0.6 + (m - 0.5) * 0.3 + 0.2) * 90; });
  s.globalAlpha = 0.6; s.drawImage(mot, c - r, c - r, r * 2, r * 2); s.globalAlpha = 1;
  // dust and soot settled toward the bottom of the glass, the bezel's shadow on the rim
  const so = s.createLinearGradient(0, c - r, 0, c + r);
  so.addColorStop(0, "rgba(60,40,20,0.12)"); so.addColorStop(0.5, "rgba(60,40,20,0)"); so.addColorStop(1, "rgba(50,30,14,0.32)");
  s.fillStyle = so; s.fillRect(0, 0, 260, 260);
  const rimSh = s.createRadialGradient(c, c, r * 0.8, c, c, r);
  rimSh.addColorStop(0, "rgba(30,16,6,0)"); rimSh.addColorStop(1, "rgba(30,16,6,0.55)");
  s.fillStyle = rimSh; s.fillRect(0, 0, 260, 260);
  s.restore();
  const iron = "#120c08";
  s.strokeStyle = iron;
  s.lineWidth = 2.2; s.beginPath(); s.arc(c, c, r * 0.56, 0, TAU); s.stroke();
  s.lineWidth = 3; s.beginPath(); s.arc(c, c, r * 0.76, 0, TAU); s.stroke();
  s.lineWidth = 2; s.beginPath(); s.arc(c, c, r * 0.97, 0, TAU); s.stroke();
  s.lineWidth = 1.6;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + TAU / 24; s.beginPath(); s.moveTo(c + Math.cos(a) * r * 0.08, c + Math.sin(a) * r * 0.08); s.lineTo(c + Math.cos(a) * r * 0.76, c + Math.sin(a) * r * 0.76); s.stroke(); }
  for (let i = 0; i < 60; i++) { const a = (i / 60) * TAU, l = i % 5 ? 0.04 : 0.07; s.lineWidth = i % 5 ? 1.2 : 2.4; s.beginPath(); s.moveTo(c + Math.cos(a) * r * (0.97 - l), c + Math.sin(a) * r * (0.97 - l)); s.lineTo(c + Math.cos(a) * r * 0.97, c + Math.sin(a) * r * 0.97); s.stroke(); }
  const NUM = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
  s.fillStyle = iron; s.font = "600 15px Georgia, 'Times New Roman', serif"; s.textAlign = "center"; s.textBaseline = "middle";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU - Math.PI / 2;
    s.save(); s.translate(c + Math.cos(a) * r * 0.855, c + Math.sin(a) * r * 0.855); s.rotate(a + Math.PI / 2); s.fillText(NUM[i], 0, 0); s.restore();
  }
  // the outer glass is a weak mirror: a cold band of night sky across the upper left (where the glass
  // faces up at the sky), the moon as a small soft smear on the right, the wet streaks catching it
  s.save(); s.beginPath(); s.arc(c, c, r, 0, TAU); s.clip();
  s.globalCompositeOperation = "screen";
  s.save(); s.translate(c - r * 0.3, c - r * 0.45); s.rotate(-0.62); s.scale(1, 0.38);
  const rf = s.createRadialGradient(0, 0, 0, 0, 0, r * 0.95);
  rf.addColorStop(0, "rgba(120,140,190,0.2)"); rf.addColorStop(0.6, "rgba(90,110,160,0.08)"); rf.addColorStop(1, "rgba(90,110,160,0)");
  s.fillStyle = rf; s.beginPath(); s.arc(0, 0, r * 0.95, 0, TAU); s.fill();
  s.restore();
  const mg = s.createRadialGradient(c + r * 0.55, c - r * 0.5, 0, c + r * 0.55, c - r * 0.5, r * 0.16);
  mg.addColorStop(0, "rgba(220,230,255,0.28)"); mg.addColorStop(1, "rgba(220,230,255,0)");
  s.fillStyle = mg; s.fillRect(0, 0, 260, 260);
  const RR = K.rng("f04dialrain");
  s.lineCap = "round";
  for (let i = 0; i < 18; i++) {
    const x = c - r + RR() * r * 2, y = c - r + RR() * r * 1.4, l = 8 + RR() * 30;
    s.strokeStyle = `rgba(200,215,250,${0.05 + RR() * 0.07})`; s.lineWidth = 0.8 + RR() * 0.8;
    s.beginPath(); s.moveTo(x, y); s.quadraticCurveTo(x + (RR() - 0.5) * 3, y + l * 0.5, x + (RR() - 0.5) * 2, y + l); s.stroke();
  }
  s.restore();
  void R;
}
function paintNightSky(s, w, h) {
  K.sky(s, w, h, { top: "#02040b", mid: "#0a1224", bottom: "#24242e", horizon: 1, night: true, glow: "#6a4632", haze: 0.6 });
  K.stars(s, w, h, 4, 0.45, 0, { yMax: h * 0.7 });
}
// the bell's lathe profile: radius (in units of s) at depth y (0 = crown, 1 = lip). A rounded shoulder,
// a long slightly waisted body, then the sound bow flaring out to the lip
const bellR = (y) => 0.3 + 0.12 * sm(0, 0.14, y) + 0.05 * y + 0.31 * Math.pow(sm(0.5, 1, y), 2.1);
// painted once (bell size BS) and scaled: turned bronze. The surface of revolution reflects a dark room
// with one bright window (the moon arch, to the right): a broad anisotropic streak runs DOWN the bell
// at that azimuth (brushed/turned metal stretches highlights across its grooves), fine turning lines go
// round it, cast bands at the waist and the sound bow, dark verdigris collected in the hollows and run
// down from the crown, the dark mouth with the lip catching the moon.
const BS = 160;
function paintBell(s) {
  const S = BS, cx = S * 1.0, top = S * 0.12;
  const H = S * 1.0, N = 64;
  const P = new Path2D();
  for (let i = 0; i <= N; i++) { const y = i / N; P.lineTo(cx - bellR(y) * S, top + y * H); }
  P.quadraticCurveTo(cx - bellR(1) * S - S * 0.02, top + H + S * 0.03, cx - bellR(1) * S + S * 0.03, top + H + S * 0.04);
  P.lineTo(cx + bellR(1) * S - S * 0.03, top + H + S * 0.04);
  P.quadraticCurveTo(cx + bellR(1) * S + S * 0.02, top + H + S * 0.03, cx + bellR(1) * S, top + H);
  for (let i = N; i >= 0; i--) { const y = i / N; P.lineTo(cx + bellR(y) * S, top + y * H); }
  P.quadraticCurveTo(cx, top - S * 0.1, cx - bellR(0) * S, top);
  P.closePath();
  // base: the environment across the surface (u = -1 left edge .. 1 right edge, by surface normal)
  s.save(); s.clip(P);
  for (let i = 0; i < N; i++) {
    const y0 = i / N, r = bellR(y0 + 0.5 / N) * S, yy = top + y0 * H;
    const gr = s.createLinearGradient(cx - r, 0, cx + r, 0);
    gr.addColorStop(0, "#050302"); gr.addColorStop(0.12, "#1c1208"); gr.addColorStop(0.3, "#3a2812"); gr.addColorStop(0.42, "#5a3e1c");
    gr.addColorStop(0.5, "#3a2812"); gr.addColorStop(0.66, "#24180a"); gr.addColorStop(0.78, "#4a3a2a"); gr.addColorStop(0.86, "#a8a8b8");
    gr.addColorStop(0.9, "#d8dcea"); gr.addColorStop(0.94, "#6a6670"); gr.addColorStop(1, "#140e08");
    s.fillStyle = gr; s.fillRect(cx - r - 2, yy, r * 2 + 4, H / N + 1);
  }
  // the anisotropic streak, softened top and bottom (the moon arch smeared down the bell)
  const an = s.createLinearGradient(0, top, 0, top + H);
  an.addColorStop(0, "rgba(0,0,0,0.5)"); an.addColorStop(0.25, "rgba(0,0,0,0)"); an.addColorStop(0.8, "rgba(0,0,0,0)"); an.addColorStop(1, "rgba(0,0,0,0.35)");
  s.fillStyle = an; s.fillRect(0, 0, S * 2, S * 1.4);
  // turning lines: fine rings, alternately lit and dark
  for (let y = top + 3; y < top + H; y += 2.2) {
    const r = bellR((y - top) / H) * S;
    s.fillStyle = (Math.round(y) % 2) ? "rgba(255,230,190,0.05)" : "rgba(0,0,0,0.08)";
    s.fillRect(cx - r, y, r * 2, 0.8);
  }
  // cast bands: a raised ring is a lit upper bevel and a shadowed lower one
  for (const [yb, w] of [[0.1, 0.02], [0.16, 0.012], [0.74, 0.016], [0.8, 0.024]]) {
    const y = top + yb * H, r = bellR(yb) * S;
    s.fillStyle = "rgba(255,226,170,0.16)"; s.beginPath(); s.ellipse(cx, y, r, r * 0.08, 0, 0, Math.PI); s.lineTo(cx - r, y + 1); s.fill();
    s.fillStyle = "rgba(0,0,0,0.42)"; s.beginPath(); s.ellipse(cx, y + w * S, r * 1.005, r * 0.08, 0, 0, Math.PI); s.lineTo(cx - r, y + w * S + 2); s.fill();
  }
  // verdigris: blue-green copper salts in the hollows under the bands and streaked down from the crown
  const vt = K.texBake("f04verdi", 128, 128, (u, v, out) => {
    const n = tF(u * 6, v * 4, 81, 4, 6, 4), st = tF(u * 30, v * 2, 83, 3, 30, 2);
    const band = Math.exp(-((v - 0.2) ** 2) / 0.004) + Math.exp(-((v - 0.84) ** 2) / 0.003) + (1 - sm(0, 0.18, v)) * 0.8;
    const a = clamp(band * (0.5 + n * 0.8) + clamp(st * 1.2 - 0.2) * (1 - v) * 0.6);
    out[0] = 58; out[1] = 104; out[2] = 88; out[3] = a * 170;
  });
  s.drawImage(vt, cx - S * 0.8, top, S * 1.6, H); s.globalCompositeOperation = "soft-light"; s.drawImage(vt, cx - S * 0.8, top, S * 1.6, H); s.globalCompositeOperation = "source-over";
  // tarnish/grime: darker blotches, the bell has not been cleaned in a century
  s.globalCompositeOperation = "multiply";
  K.texRect(s, "metal", cx - S, top, S * 2, H, { scale: S * 0.8, alpha: 0.4, tex: { seed: 3, color: "#7a5a30", rust: 0.15 } });
  s.globalCompositeOperation = "source-over";
  s.restore();
  // the mouth seen from below: the dark inside, the lip's thickness lit on the moon side
  const ly = top + H + S * 0.02, lr = bellR(1) * S - S * 0.02;
  s.fillStyle = "#040302"; s.beginPath(); s.ellipse(cx, ly, lr, S * 0.06, 0, 0, TAU); s.fill();
  const lg = s.createLinearGradient(cx - lr, 0, cx + lr, 0);
  lg.addColorStop(0, "rgba(120,100,70,0.2)"); lg.addColorStop(0.6, "rgba(160,140,110,0.25)"); lg.addColorStop(0.9, "rgba(210,220,245,0.85)"); lg.addColorStop(1, "rgba(120,130,160,0.3)");
  s.strokeStyle = lg; s.lineWidth = S * 0.018;
  s.beginPath(); s.ellipse(cx, ly, lr, S * 0.06, 0, 0, Math.PI); s.stroke();
  // the crown's canons (the loops it hangs by)
  s.fillStyle = "#1a1208"; s.beginPath(); s.ellipse(cx, top - S * 0.03, S * 0.12, S * 0.05, 0, 0, TAU); s.fill();
}
function bigBell(g, x, y, s, swing, rim) {
  // a heavy bronze tower bell hung from a timber headstock; the bell itself is a cached sprite
  g.save();
  g.translate(x, y);
  g.fillStyle = "#0e0906";
  g.beginPath(); g.moveTo(-s * 0.62, -s * 0.3); g.lineTo(-s * 0.52, -s * 0.38); g.lineTo(s * 0.7, -s * 0.38); g.lineTo(s * 0.6, -s * 0.3); g.fill();
  g.fillStyle = rgba(MOONC, 0.16 * rim); g.fillRect(-s * 0.52, -s * 0.38, s * 1.22, s * 0.012);
  const hb = g.createLinearGradient(0, -s * 0.3, 0, -s * 0.1);
  hb.addColorStop(0, "#2a1c12"); hb.addColorStop(1, "#140c08");
  g.fillStyle = hb; g.fillRect(-s * 0.62, -s * 0.3, s * 1.22, s * 0.2);
  K.texRect(g, "wood", -s * 0.62, -s * 0.3, s * 1.22, s * 0.2, { scale: s * 0.5, alpha: 0.35, mode: "overlay", tex: { seed: 9, color: "#5a3a22" } });
  g.fillStyle = "#1e140c"; g.beginPath(); g.moveTo(s * 0.6, -s * 0.3); g.lineTo(s * 0.7, -s * 0.38); g.lineTo(s * 0.7, -s * 0.18); g.lineTo(s * 0.6, -s * 0.1); g.fill();
  g.fillStyle = "#3a3a3e"; for (const bx of [-0.2, 0.2]) { g.beginPath(); g.arc(bx * s, -s * 0.2, s * 0.022, 0, TAU); g.fill(); }
  g.rotate(swing);
  const k = s / BS;
  g.drawImage(spr("f04bellL", BS * 2, BS * 1.4, paintBell), -BS * k, -BS * 0.16 * k, BS * 2 * k, BS * 1.4 * k);
  // the clapper hanging in the mouth
  const cx2 = Math.sin(swing * 3) * s * 0.1;
  g.strokeStyle = "#16100a"; g.lineWidth = s * 0.03;
  g.beginPath(); g.moveTo(0, s * 0.9); g.lineTo(cx2, s * 1.06); g.stroke();
  const cg = g.createRadialGradient(cx2 - s * 0.02, s * 1.08, s * 0.005, cx2, s * 1.1, s * 0.07);
  cg.addColorStop(0, "#4a4a52"); cg.addColorStop(1, "#0c0c10");
  g.fillStyle = cg;
  g.beginPath(); g.arc(cx2, s * 1.1, s * 0.06, 0, TAU); g.fill();
  g.restore();
}
function birds(g, t, t0, n, x0, y0, k = 1) {
  // pigeons startled off the cornice: dark silhouettes, wings beating, a little motion blur
  g.save();
  g.fillStyle = "#06070b";
  for (let i = 0; i < n; i++) {
    const age = t - t0 - hash(i, 3) * 0.6;
    if (age < 0) continue;
    const dir = hash(i, 5) > 0.5 ? 1 : -1;
    const vx = (70 + hash(i, 4) * 60) * dir, vy = -(40 + hash(i, 6) * 40);
    const x = x0 + age * vx + i * 5, y = y0 + age * vy + Math.sin(age * 2 + i) * 5 + age * age * 4;
    const s = (5 + hash(i, 7) * 3) * k * (1 + age * 0.12);
    const f = Math.sin(age * 15 + i * 2);
    g.save(); g.translate(x, y); g.scale(dir, 1);
    g.globalAlpha = 0.9;
    g.beginPath(); g.ellipse(0, 0, s * 0.55, s * 0.2, -0.15, 0, TAU); g.fill();
    for (const sd of [-1, 1]) {
      g.beginPath(); g.moveTo(-s * 0.1, 0); g.quadraticCurveTo(-s * 0.2, -f * s * 0.9 * sd * 0.5 - s * 0.2, -s * 0.5, -f * s * 0.9); g.quadraticCurveTo(0, -s * 0.05, s * 0.18, 0); g.fill();
    }
    g.restore();
  }
  g.restore();
}
const skyPlate3 = () => spr("f04sky3", TWW, TWH, paintNightSky);
// weathering over the tower face (its own sprite, laid over the lit plate): stone-to-stone colour
// variation (warm ochre, cold grey, a few near-black blocks), soot and rain streaks hanging from the
// string courses and the dial, and moss on the ledges and up from the base where the wet sits
function paintTowerWeather(s) {
  s.translate(-TWX0, -TWY0);
  const { half } = TW;
  const body = new Path2D();
  body.moveTo(tx(TW.cx - half, TW.base), TW.base); body.lineTo(tx(TW.cx - half, TW.top), TW.top);
  body.lineTo(tx(TW.cx + half, TW.top), TW.top); body.lineTo(tx(TW.cx + half, TW.base), TW.base); body.closePath();
  s.save(); s.clip(body);
  // per-block tint: a cell texture laid with the same converging strips as the masonry
  const tint = K.texBake("f04blocktint", 256, 256, (u, v, out) => {
    const row = Math.floor(v * 8), cell = Math.floor(u * 4 + (row % 2) * 0.5), h = hash(cell * 17 + row * 131, 4), h2 = hash(cell * 7 + row * 31, 5);
    const big = tF(u * 3, v * 3, 6, 3) * 0.5 + 0.5;
    out[0] = 128 + (h - 0.5) * 26 + (h2 > 0.92 ? -16 : 0) + (big - 0.5) * 40; out[1] = 126 + (h - 0.5) * 18 + (h2 > 0.92 ? -16 : 0) + (big - 0.5) * 22; out[2] = 124 + (h - 0.5) * 8 + (h2 > 0.92 ? -14 : 0) - (big - 0.5) * 10; out[3] = 255;
  });
  s.globalCompositeOperation = "soft-light"; s.globalAlpha = 0.5;
  towerStrips(s, tint, TW.cx - half, TW.cx + half, -330, TW.base, 0.25);
  s.globalAlpha = 1; s.globalCompositeOperation = "source-over";
  // soot: long dark streaks under the courses and the dial, thicker where water runs off the ledges
  const R = K.rng("f04soot");
  for (const [y0, n, L] of [[94, 34, 150], [386, 30, 170], [CLK.y + CLK.r + 8, 12, 110]]) {
    for (let i = 0; i < n; i++) {
      const x = y0 > 300 || y0 < 100 ? lerp(tx(TW.cx - half + 10, y0), tx(TW.cx + half - 10, y0), R()) : CLK.x + (R() - 0.5) * CLK.r * 1.4;
      const len = (0.3 + R() * 0.7) * L * kAt(y0), w = (6 + R() * 16) * kAt(y0);
      const sg = s.createLinearGradient(0, y0, 0, y0 + len);
      sg.addColorStop(0, "rgba(8,7,10," + (0.12 + R() * 0.16).toFixed(2) + ")"); sg.addColorStop(0.6, "rgba(8,7,10,0.06)"); sg.addColorStop(1, "rgba(8,7,10,0)");
      s.fillStyle = sg; s.beginPath(); s.moveTo(x, y0); s.lineTo(x + w, y0); s.lineTo(x + w * 0.6 + (R() - 0.5) * 3, y0 + len); s.lineTo(x + w * 0.3, y0 + len); s.fill();
    }
  }
  // moss: on the top of each ledge and up from the base, a lumpy green fbm, darker in the shade
  const moss = K.texBake("f04moss", 256, 64, (u, v, out) => {
    const n = tF(u * 14, v * 4, 9, 4), m = tN(u * 80, v * 20, 10);
    out[0] = 54 + m * 14; out[1] = 72 + m * 18 + n * 10; out[2] = 30 + m * 6; out[3] = 255 * clamp((n + 0.15) * 2.4 + m * 0.2) * clamp(1 - v * 1.1);
  });
  for (const y of [70, 362]) { const xa = tx(TW.cx - half - 12, y), xb = tx(TW.cx + half + 12, y); s.save(); s.translate(0, y + 3); s.scale(1, -1); s.globalAlpha = 0.7; s.drawImage(moss, xa, 0, xb - xa, 16 * kAt(y)); s.restore(); }
  s.globalAlpha = 0.85; s.save(); s.translate(0, TW.base + 2); s.scale(1, -1); s.drawImage(moss, tx(TW.cx - half, TW.base), 0, 2 * half, 120); s.restore(); s.globalAlpha = 1;
  s.restore();
}
const towerWeather = () => spr("f04towerW", TWW, TWH, paintTowerWeather);
const towerPlate = () => spr("f04tower4", TWW, TWH, paintTower);
const dialPlate = () => spr("f04dial2", 260, 260, paintDial);
function shotTower(g, t, lt) {
  const p = eio(seg(lt, 0, 10));
  const tilt = eio(seg(lt, 0, 7.5));
  const ring = K.env(lt, 3, 6, 0.05, 2.5);
  const tremble = K.env(lt, 3, 4.6, 0.05, 1.2);
  const camY = lerp(330, 100, tilt);
  K.withCamera(g, LW, LH, { x: 480, y: camY, zoom: lerp(0.94, 0.9, p), shakeT: t * 0.6 + tremble * 3, shakeAmt: 1.4 + tremble * 5 }, (c) => {
    c.drawImage(skyPlate3(), TWX0, TWY0, TWW, TWH);
    // the moon behind fast thin cloud (time-lapse feel), far behind the tower
    K.moon(c, 860, -150, 26, { glow: 0.7 });
    // fast thin cloud (a time-lapse feel): two fbm decks at different heights and speeds, silvered on
    // top by the moon, the low one glowing warm underneath from the town
    const deck = (img, y, w, h, off, a) => {
      if (!img) return;
      const x0 = TWX0 - (off % w);
      c.globalAlpha = a;
      c.drawImage(img, x0, y, w, h); c.drawImage(img, x0 + w - 1, y, w, h);
      c.globalAlpha = 1;
    };
    deck(cloudTex("ctA", 7, 0.35, { cover: 0.05 }), -250, 1500, 300, 400 + lt * 46, 0.9);
    deck(cloudTex("ctB", 17, 1, { cover: 0.18, town: "#d08850" }), 70, 1200, 230, 200 + lt * 96, 0.85);
    // the bell in the middle arch, glimpsed in the dark belfry, swinging after it rings
    const sw = Math.sin((lt - 3) * 3.2) * 0.12 * K.env(lt, 3, 9, 0.2, 3);
    const ax0 = tx(TW.cx - 44, 30), ax1 = tx(TW.cx + 44, 30), ar = (ax1 - ax0) / 2;
    c.drawImage(towerPlate(), TWX0, TWY0, TWW, TWH);
    c.drawImage(towerWeather(), TWX0, TWY0, TWW, TWH);
    // the lit dial spills warm bounce onto the stone round it (breathing a touch with the old lamp)
    K.lightPool(c, CLK.x, CLK.y + 10, CLK.r * 2.6, "#ffb870", { intensity: 0.16 + 0.02 * Math.sin(lt * 2.1), flat: 0.5 });
    c.save();
    c.beginPath(); c.moveTo(ax0, 66); c.lineTo(ax0, -10); c.arc((ax0 + ax1) / 2, -10, ar, Math.PI, 0); c.lineTo(ax1, 66); c.closePath(); c.clip();
    bigBell(c, 480, -36, 40, sw, 1.2);
    c.restore();
    // the dial: back-lit glass; the hands in silhouette (twenty to midnight)
    c.drawImage(dialPlate(), CLK.x - 130, CLK.y - 130, 260, 260);
    c.save();
    c.translate(CLK.x, CLK.y);
    // the hands sit a finger's width behind the glass: their soft shadow on the lit dial first, then the
    // hands themselves, magnified a touch and shifted down-right by the domed glass (refraction)
    c.save(); c.translate(3, 4); c.globalAlpha = 0.28; c.fillStyle = "#3a2410";
    for (const [a, len, w, tail] of [[-2.2, 54, 5, 12], [-Math.PI / 2 - 0.84 + lt * 0.002, 82, 3.2, 16]]) { c.save(); c.rotate(a); c.beginPath(); c.moveTo(-tail, -w); c.lineTo(len, 0); c.lineTo(-tail, w); c.closePath(); c.fill(); c.restore(); }
    c.restore();
    c.translate(1.2, 1.6); c.scale(1.025, 1.025);
    c.fillStyle = "#0e0905";
    const hand = (a, len, w, tail) => {
      c.save(); c.rotate(a);
      c.beginPath(); c.moveTo(-tail, -w * 0.6); c.lineTo(len * 0.82, -w * 0.5); c.lineTo(len, 0); c.lineTo(len * 0.82, w * 0.5); c.lineTo(-tail, w * 0.6); c.closePath(); c.fill();
      c.beginPath(); c.arc(-tail, 0, w * 1.3, 0, TAU); c.fill();
      c.restore();
    };
    hand(-2.2, 54, 5, 12);
    hand(-Math.PI / 2 - 0.84 + lt * 0.002, 82, 3.2, 16);
    c.beginPath(); c.arc(0, 0, 6, 0, TAU); c.fill();
    c.restore();
    // the convex glass over it all: a faint reflection of the racing cloud, a broad soft specular from
    // the moon on the upper right of the dome, a crisp window of light, the rim's dark meniscus
    c.save();
    c.beginPath(); c.arc(CLK.x, CLK.y, CLK.r, 0, TAU); c.clip();
    c.globalCompositeOperation = "screen"; c.globalAlpha = 0.12;
    const ctx0 = cloudTex("ctA", 7, 0.35, { cover: 0.05 });
    if (ctx0) { const off = (lt * 40) % 300; c.save(); c.translate(CLK.x, CLK.y); c.scale(1, 0.8); c.drawImage(ctx0, -CLK.r - off, -CLK.r, 600, CLK.r * 2); c.restore(); }
    c.globalAlpha = 1; c.globalCompositeOperation = "lighter";
    const sp = c.createRadialGradient(CLK.x + CLK.r * 0.38, CLK.y - CLK.r * 0.42, 0, CLK.x + CLK.r * 0.38, CLK.y - CLK.r * 0.42, CLK.r * 0.75);
    sp.addColorStop(0, "rgba(190,205,240,0.2)"); sp.addColorStop(0.4, "rgba(160,180,230,0.07)"); sp.addColorStop(1, "rgba(160,180,230,0)");
    c.fillStyle = sp; c.fillRect(CLK.x - CLK.r, CLK.y - CLK.r, CLK.r * 2, CLK.r * 2);
    c.save(); c.translate(CLK.x + CLK.r * 0.45, CLK.y - CLK.r * 0.5); c.rotate(0.7); c.fillStyle = "rgba(220,230,255,0.22)"; c.beginPath(); c.ellipse(0, 0, 13, 4.5, 0, 0, TAU); c.fill(); c.restore();
    c.globalCompositeOperation = "source-over";
    const rimG = c.createRadialGradient(CLK.x, CLK.y, CLK.r * 0.86, CLK.x, CLK.y, CLK.r);
    rimG.addColorStop(0, "rgba(0,0,0,0)"); rimG.addColorStop(1, "rgba(20,10,4,0.35)");
    c.fillStyle = rimG; c.fillRect(CLK.x - CLK.r, CLK.y - CLK.r, CLK.r * 2, CLK.r * 2);
    c.restore();
    birds(c, lt, 3.25, 11, 470, 40, 1);
    birds(c, lt, 0, 3, 220, 140, 0.9);
    // sodium haze at the foot of the tower (street light scattered in damp air)
    const hz = c.createLinearGradient(0, 460, 0, 650);
    hz.addColorStop(0, "rgba(255,150,80,0)"); hz.addColorStop(1, "rgba(255,150,80,0.16)");
    c.fillStyle = hz; c.fillRect(-100, 460, 1160, 200);
  });
  // out-of-focus bare branches framing the lower left (they sit much nearer the lens: more parallax)
  // a plane tree near the lens: bark and twigs out of focus but not mush, the sodium glow from the
  // street catching the undersides (a warm rim), the moon a faint cool edge on top
  const fb = blurredSprite("f04branch3", 560, 460, 7.5, (s) => {
    const tree = (dx, dy, col, w) => {
      s.save(); s.translate(dx, dy); s.strokeStyle = col;
      branch(s, -20, 470, -0.95, 160, 24 * w, 7, 3);
      branch(s, 120, 500, -1.35, 128, 15 * w, 6, 8);
      branch(s, 40, 480, -1.15, 110, 10 * w, 6, 21);
      s.restore();
    };
    tree(1.6, 2.2, "rgba(255,150,80,0.55)", 1);
    tree(-1, -1.4, "rgba(150,170,220,0.35)", 1);
    tree(0, 0, "#05060a", 1);
    // bark texture on the trunk-ish limbs
    s.globalCompositeOperation = "source-atop";
    K.texRect(s, "bark", 0, 0, 560, 460, { scale: 90, alpha: 0.25, mode: "overlay", tex: { seed: 5 } });
    s.globalCompositeOperation = "source-over";
  });
  g.drawImage(fb, -40, 190 + (camY - 100) * 0.55 - 40, 560, 460);
}

// ---- shot 2: up the spiral stairs, from below ----------------------------------------------------------
// A real spiral, ray-traced once (time-sliced) from a low eye on the flight: wedge treads (open risers)
// cantilevered between a stone newel and the curved outer wall, climbing round to the left and away -
// the far treads foreshortened and sinking into the dark. Two slit windows in the wall throw the moon
// in. You are a few treads up: through the gaps between the slabs we only see your boots and calves.
const SP = { Rn: 0.15, Rw: 1.08, rise: 0.17, th: 0.075, da: 0.36, a0: -0.3, wide: 0.42, n: 22 };
const SPC = { r: 0.66, a: -0.62, y: 0.12, yaw: 0.34, pitch: 0.5, F: 470, W: 1040, H: 620 };
const SPW = [{ a: 1.25, y0: 1.3, y1: 2.05, hw: 0.055 }, { a: 2.75, y0: 2.4, y1: 3.0, hw: 0.05 }];
const SPK = [2, 3, 4, 5, 6]; // the treads the boots can stand on (one occluder layer each)
const spTreadA = (i) => SP.a0 + i * SP.da, spTreadY = (i) => 0.05 + i * SP.rise;
// the eye and its basis (forward f has unit length along the view axis, so t along d is depth)
const SPE = (() => {
  const { r, a, y, yaw, pitch } = SPC;
  const E = [r * Math.cos(a), y, r * Math.sin(a)];
  const T = [-Math.sin(a), 0, Math.cos(a)], N = [-Math.cos(a), 0, -Math.sin(a)];
  let h = [T[0] * Math.cos(yaw) + N[0] * Math.sin(yaw), 0, T[2] * Math.cos(yaw) + N[2] * Math.sin(yaw)];
  const hl = Math.hypot(h[0], h[2]); h = [h[0] / hl, 0, h[2] / hl];
  const f = [h[0] * Math.cos(pitch), Math.sin(pitch), h[2] * Math.cos(pitch)];
  // right = f x up, then up' = right x f
  let rt = [-f[2], 0, f[0]]; const rl = Math.hypot(rt[0], rt[2]); rt = [rt[0] / rl, 0, rt[2] / rl];
  const up = [rt[1] * f[2] - rt[2] * f[1], rt[2] * f[0] - rt[0] * f[2], rt[0] * f[1] - rt[1] * f[0]];
  return { E, f, rt, up };
})();
// world point -> plate pixel (and depth)
function spProj(x, y, z) {
  const { E, f, rt, up } = SPE, dx = x - E[0], dy = y - E[1], dz = z - E[2];
  const d = dx * f[0] + dy * f[1] + dz * f[2];
  return [SPC.W / 2 + ((dx * rt[0] + dy * rt[1] + dz * rt[2]) / d) * SPC.F, SPC.H / 2 - ((dx * up[0] + dy * up[1] + dz * up[2]) / d) * SPC.F, d];
}
const spAt = (r, a, y) => spProj(r * Math.cos(a), y, r * Math.sin(a));
const angIn = (ph, a, w) => { let q = (ph - a) % TAU; if (q < 0) q += TAU; return q < w; };
// per-pixel hit record: t, kind (0 wall, 1 newel, 2 top, 3 underside, 4 front), tread index, hit point
const SPH = new Float64Array(8);
function spTrace(dx, dy, dz) {
  const [ex, ey, ez] = SPE.E;
  let bt = 1e9, kind = -1, idx = -1;
  // outer wall (we are inside: the far root)
  const A = dx * dx + dz * dz, B = 2 * (ex * dx + ez * dz), Cw = ex * ex + ez * ez - SP.Rw * SP.Rw;
  const disc = B * B - 4 * A * Cw;
  if (disc > 0) { const tw = (-B + Math.sqrt(disc)) / (2 * A); if (tw > 0) { bt = tw; kind = 0; } }
  // the newel (the near root)
  const Cn = ex * ex + ez * ez - SP.Rn * SP.Rn, dn = B * B - 4 * A * Cn;
  if (dn > 0) { const tn = (-B - Math.sqrt(dn)) / (2 * A); if (tn > 0 && tn < bt) { bt = tn; kind = 1; } }
  for (let i = 0; i < SP.n; i++) {
    const a = spTreadA(i), Y = spTreadY(i);
    // top and underside: horizontal planes
    for (let s = 0; s < 2; s++) {
      const py = s ? Y - SP.th : Y;
      if (Math.abs(dy) < 1e-9) continue;
      const t = (py - ey) / dy;
      if (t <= 0 || t >= bt) continue;
      const x = ex + t * dx, z = ez + t * dz, rr = Math.sqrt(x * x + z * z);
      if (rr < SP.Rn || rr > SP.Rw) continue;
      if (!angIn(Math.atan2(z, x), a, SP.wide)) continue;
      bt = t; kind = s ? 3 : 2; idx = i;
    }
    // the front (nosing) face: the radial plane at angle a
    const nx = -Math.sin(a), nz = Math.cos(a), den = nx * dx + nz * dz;
    if (Math.abs(den) > 1e-9) {
      const t = -(nx * ex + nz * ez) / den;
      if (t > 0 && t < bt) {
        const x = ex + t * dx, z = ez + t * dz, y = ey + t * dy, rr = x * Math.cos(a) + z * Math.sin(a);
        if (rr > SP.Rn && rr < SP.Rw && y < Y && y > Y - SP.th) { bt = t; kind = 4; idx = i; }
      }
    }
  }
  SPH[0] = bt; SPH[1] = kind; SPH[2] = idx; SPH[3] = ex + bt * dx; SPH[4] = ey + bt * dy; SPH[5] = ez + bt * dz;
}
// the moon through the slits: a point source just inside each window, inverse-square-ish
function spLight(x, y, z, nx, ny, nz) {
  let L = 0;
  for (const w of SPW) {
    const wx = (SP.Rw - 0.05) * Math.cos(w.a), wy = (w.y0 + w.y1) / 2, wz = (SP.Rw - 0.05) * Math.sin(w.a);
    const lx = wx - x, ly = wy - y, lz = wz - z, d2 = lx * lx + ly * ly + lz * lz, d = Math.sqrt(d2);
    const ndl = (nx * lx + ny * ly + nz * lz) / d;
    // the slit is narrow and deep: it throws its light mostly inward and down
    const dir = clamp((-(lx * Math.cos(w.a) + lz * Math.sin(w.a)) / d) * 0.8 + 0.4 - ly / d * 0.3);
    if (ndl > 0) L += (ndl * dir * 1.1) / (0.35 + d2 * 0.9);
  }
  return L;
}
function spStone(u, v, seed) {
  const n = tF(u * 6, v * 6, seed, 4), f = tN(u * 40, v * 40, seed + 1);
  return 0.78 + n * 0.22 + f * 0.05;
}
function spShade(D, o4, px, py) {
  const { f, rt, up } = SPE;
  const sx = (px + 0.5 - SPC.W / 2) / SPC.F, sy = -(py + 0.5 - SPC.H / 2) / SPC.F;
  const dx = f[0] + rt[0] * sx + up[0] * sy, dy = f[1] + rt[1] * sx + up[1] * sy, dz = f[2] + rt[2] * sx + up[2] * sy;
  spTrace(dx, dy, dz);
  const t = SPH[0], kind = SPH[1], idx = SPH[2], x = SPH[3], y = SPH[4], z = SPH[5];
  let r = 0, g = 0, b = 0;
  if (kind < 0) { D[o4] = 4; D[o4 + 1] = 5; D[o4 + 2] = 9; D[o4 + 3] = 255; return [t, idx]; }
  const rr = Math.sqrt(x * x + z * z), ph = Math.atan2(z, x);
  let nx = 0, ny = 0, nz = 0, alb = 1, ao = 1, glow = 0;
  if (kind === 0) {
    nx = -x / rr; nz = -z / rr;
    // ashlar: courses 0.24 m, blocks ~0.42 m, staggered; mortar recessed (darker); the slit windows
    let uu = ((ph % TAU) + TAU) % TAU * SP.Rw, cr = Math.floor(y / 0.24);
    const bu = (uu + (cr % 2) * 0.21) / 0.42, fu = bu - Math.floor(bu), fv = y / 0.24 - cr;
    const mort = Math.min(fu * 0.42, (1 - fu) * 0.42, fv * 0.24, (1 - fv) * 0.24);
    alb = spStone(uu, y, 5) * (0.85 + hash(Math.floor(bu) * 13 + cr * 7, 3) * 0.25) * (mort < 0.012 ? 0.55 : 1);
    for (const w of SPW) {
      let da = ph - w.a; da = ((da + Math.PI) % TAU + TAU) % TAU - Math.PI;
      const ins = Math.abs(da) < w.hw && y > w.y0 && y < w.y1;
      const rev = Math.abs(da) < w.hw * 2.4 && y > w.y0 - 0.08 && y < w.y1 + 0.06;
      if (ins) { const k = sm(w.y0, w.y1, y); glow = 1; r = lerp(150, 236, k); g = lerp(166, 242, k); b = lerp(210, 255, k); }
      else if (rev) { const k = 1 - Math.abs(da) / (w.hw * 2.4); alb *= 1 + k * 0.6; nx = nx * 0.4 - Math.sign(da) * Math.sin(ph) * 0.6; }
    }
    // contact shadow where a tread meets the wall, and the tread's shadow on the wall just under it
    for (let i = 0; i < SP.n; i++) {
      const Y = spTreadY(i);
      if (Math.abs(y - Y) > 0.25 || !angIn(ph, spTreadA(i), SP.wide)) continue;
      const above = y - Y, below = Y - SP.th - y;
      if (above > 0) ao *= 1 - 0.55 * Math.exp(-above / 0.03);
      if (below > 0) ao *= 1 - 0.5 * Math.exp(-below / 0.08);
    }
  } else if (kind === 1) {
    nx = x / rr; nz = z / rr;
    alb = spStone(ph * SP.Rn * 4, y, 7) * 0.95;
    for (let i = 0; i < SP.n; i++) { const Y = spTreadY(i); if (angIn(ph, spTreadA(i), SP.wide)) { const d1 = y - Y, d2 = Y - SP.th - y; if (d1 > 0 && d1 < 0.2) ao *= 1 - 0.5 * Math.exp(-d1 / 0.03); if (d2 > 0 && d2 < 0.3) ao *= 1 - 0.45 * Math.exp(-d2 / 0.06); } }
  } else {
    const a = spTreadA(idx), Y = spTreadY(idx);
    let q = (ph - a) % TAU; if (q < 0) q += TAU;
    const edge = q * rr; // metres back from the nosing
    if (kind === 2) { ny = 1; alb = spStone(rr * 3 + idx, edge * 3, 11 + idx) * (0.9 + 0.12 * (1 - Math.abs(rr - 0.62) / 0.5)); }
    else if (kind === 3) { ny = -1; alb = spStone(rr * 3 + idx, edge * 3, 21 + idx) * 0.8; }
    else { nx = Math.sin(a); nz = -Math.cos(a); alb = spStone(rr * 3, y * 6, 31 + idx); }
    // the bullnose: the rounded arris along the nosing turns its face up to the light
    const nose = kind === 2 ? Math.exp(-edge / 0.012) : kind === 4 ? Math.exp(-(Y - y) / 0.014) : 0;
    if (nose > 0.01) { const k = nose * 0.75; ny = ny * (1 - k) + k * 0.7; nx = nx * (1 - k) + k * Math.sin(a) * 0.7; nz = nz * (1 - k) - k * Math.cos(a) * 0.7; }
    // occlusion into the wall and round the newel; the underside darkens toward the wall
    ao *= (1 - 0.6 * Math.exp(-(SP.Rw - rr) / 0.035)) * (1 - 0.45 * Math.exp(-(rr - SP.Rn) / 0.04));
    if (kind === 3) ao *= 0.8;
    // the worn hollow in the middle of each tread top is a touch smoother and paler
    if (kind === 2) alb *= 1 + 0.08 * Math.exp(-((rr - 0.6) ** 2) / 0.02) * Math.exp(-((edge - 0.18) ** 2) / 0.02);
    glow = nose;
  }
  if (!(kind === 0 && r > 0)) {
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const L = spLight(x, y, z, nx, ny, nz);
    const amb = 0.05 + 0.04 * clamp(ny + 0.5);
    const k = alb * ao;
    r = (118 * (amb + L * 1.05) + 40 * glow * L) * k; g = (114 * (amb + L * 1.12) + 44 * glow * L) * k; b = (108 * (amb * 1.5 + L * 1.3) + 52 * glow * L) * k;
    // further treads sink into the dark of the shaft
    const fade = Math.exp(-Math.max(0, t - 0.6) * 0.42);
    r = r * fade + 5 * (1 - fade); g = g * fade + 6 * (1 - fade); b = b * fade + 11 * (1 - fade);
  }
  D[o4] = r; D[o4 + 1] = g; D[o4 + 2] = b; D[o4 + 3] = 255;
  return [t, kind >= 2 ? idx : kind === 1 ? 99 : -1];
}
// where a boot stands on tread k (in world), and its depth
const spFoot = (k, side) => { const a = spTreadA(k) + 0.17 + side * 0.03, r = 0.6 + side * 0.13; return [r * Math.cos(a), spTreadY(k), r * Math.sin(a), a]; };
const spDepth = (k) => { const [x, y, z] = spFoot(k, 0); return spProj(x, y + 0.2, z)[2]; };
// the whole plate, plus one occluder layer per tread the boots can stand on: every pixel nearer than
// the boots on that tread, so the legs drawn over the plate are cut back by the slabs in front of them
function stairsBake() {
  return staged("f04spiral", SPC.W, SPC.H, (W, H) => {
    let img = null; const DEP = new Float32Array(W * H), OCC = [], LIM = SPK.map((k) => spDepth(k) - 0.04);
    return {
      passes: [(y) => {
        if (!img) img = new ImageData(W, H);
        const D = img.data;
        for (let x = 0; x < W; x++) { const [t] = spShade(D, (y * W + x) * 4, x, y); DEP[y * W + x] = t; }
      }, (y) => {
        if (!OCC.length) for (let j = 0; j < SPK.length; j++) OCC.push(new ImageData(W, H));
        const sd = img.data;
        for (let j = 0; j < SPK.length; j++) {
          const od = OCC[j].data, lim = LIM[j];
          for (let x = 0, i = y * W; x < W; x++, i++) if (DEP[i] < lim) { const o = i * 4; od[o] = sd[o]; od[o + 1] = sd[o + 1]; od[o + 2] = sd[o + 2]; od[o + 3] = 255; }
        }
      }],
      finish(g) {
        g.putImageData(img, 0, 0);
        const c = g.canvas;
        c.occ = {};
        SPK.forEach((k, j) => { const oc = K.makeCanvas(W, H); oc.getContext("2d").putImageData(OCC[j], 0, 0); c.occ[k] = oc; });
      },
    };
  });
}
// a boot and calf from behind and below: the welly's glossy black rubber (a long sky reflection down
// the back seam, the lit heel), the ribbed sole edge, then denim up the calf with a cool rim
function legPath(c, fx, fy, kx, ky, wF, wK) {
  const ang = Math.atan2(ky - fy, kx - fx), nx = -Math.sin(ang), ny = Math.cos(ang);
  c.beginPath();
  c.moveTo(fx + nx * wF, fy + ny * wF); c.quadraticCurveTo((fx + kx) / 2 + nx * wK * 1.25, (fy + ky) / 2 + ny * wK * 1.25, kx + nx * wK, ky + ny * wK);
  c.lineTo(kx - nx * wK, ky - ny * wK); c.quadraticCurveTo((fx + kx) / 2 - nx * wK * 1.15, (fy + ky) / 2 - ny * wK * 1.15, fx - nx * wF, fy - ny * wF);
  c.closePath();
  return [nx, ny];
}
function drawLeg(c, foot, lift, ox, oy, sc) {
  const [x, y, z] = foot;
  const [fx, fy, d] = spProj(x, y + lift, z), [kx, ky] = spProj(x, y + lift + 0.42, z - 0.04), [bx, by] = spProj(x, y + lift + 0.24, z - 0.02);
  const P = (q) => [(q[0] - ox) * sc, (q[1] - oy) * sc];
  const [Fx, Fy] = P([fx, fy]), [Kx, Ky] = P([kx, ky]), [Bx, By] = P([bx, by]);
  const wB = (0.055 * SPC.F / d) * sc, wK = (0.05 * SPC.F / d) * sc;
  // the calf (denim), from the boot top to the knee
  const [nx, ny] = legPath(c, Bx, By, Kx, Ky, wB * 0.86, wK);
  const dg = c.createLinearGradient(Bx - nx * wK, By - ny * wK, Bx + nx * wK, By + ny * wK);
  dg.addColorStop(0, "#0a0e18"); dg.addColorStop(0.55, "#1c2638"); dg.addColorStop(0.85, "#33425e"); dg.addColorStop(1, "#8ea2cc");
  c.fillStyle = dg; c.fill();
  // the welly: shaft and heel
  legPath(c, Fx, Fy, Bx, By, wB * 1.05, wB);
  const bg = c.createLinearGradient(Fx - nx * wB, Fy - ny * wB, Fx + nx * wB, Fy + ny * wB);
  bg.addColorStop(0, "#020304"); bg.addColorStop(0.5, "#0b0d12"); bg.addColorStop(0.72, "#4a5672"); bg.addColorStop(0.8, "#0e1016"); bg.addColorStop(1, "#6a7ca4");
  c.fillStyle = bg; c.fill();
  // the sole edge and heel block, a pale rubber line where it catches the light
  c.fillStyle = "#14161c"; c.fillRect(Fx - wB * 1.1, Fy - 1, wB * 2.2, Math.max(2, wB * 0.35));
  c.fillStyle = "rgba(170,186,224,0.5)"; c.fillRect(Fx - wB * 1.05, Fy - 1, wB * 2.1, 1);
  // the welly's top edge folded over the jeans
  c.strokeStyle = "rgba(150,166,210,0.45)"; c.lineWidth = Math.max(1, wB * 0.18);
  c.beginPath(); c.moveTo(Bx - nx * wB, By - ny * wB); c.lineTo(Bx + nx * wB, By + ny * wB); c.stroke();
}
function shotStairs(g, t, lt) {
  const climb = eio(seg(lt, 0, 5.4)); // climbs, then stops at the window, breathless
  const fk = lerp(SPK[0] + 0.0, SPK[0] + 3.0, climb);
  const moving = climb > 0.01 && climb < 0.99;
  const k0 = Math.floor(fk), q = fk - k0;
  const P = stairsBake();
  const p = eio(seg(lt, 0, 8));
  // the 2D camera drifts up after the boots and settles; a breathless sway when he stops
  const breath = moving ? 0 : Math.sin(lt * 4.2) * 0.6;
  K.withCamera(g, LW, LH, { x: lerp(470, 500, p), y: lerp(300, 262, p) + breath, zoom: 1.04, shakeT: t * 0.8, shakeAmt: moving ? 1.8 : 1.1 }, (c) => {
    const ox = (SPC.W - LW) / 2, oy = (SPC.H - LH) / 2;
    if (!P) { c.fillStyle = "#05060a"; c.fillRect(-40, -40, LW + 80, LH + 80); return; }
    c.drawImage(P, -ox, -oy, SPC.W, SPC.H);
    // the moon through the slits: soft dusty shafts, and the motes lit in them
    for (const w of SPW) {
      const [wx, wy] = spAt(SP.Rw, w.a, (w.y0 + w.y1) / 2);
      const [tx2, ty2] = spAt(0.4, w.a + 0.5, w.y0 - 0.9);
      K.godRays(c, wx - ox, wy - oy, LW, LH, { color: "#bcd0ff", count: 6, strength: 0.2, t: lt, angle: Math.atan2(ty2 - wy, tx2 - wx), spread: 0.22, length: 520, seed: 4 + w.a * 3 });
      K.dust(c, LW, LH, lt + w.a, { seed: 9 + Math.round(w.a * 5), count: 34, color: "#e4ecff", size: 1.2, area: [Math.min(wx, tx2) - ox - 40, wy - oy, Math.abs(tx2 - wx) + 120, Math.max(60, ty2 - wy)], alpha: 0.6 });
    }
    // your boots and calves, seen from behind and below through the gaps; one foot steps up a tread
    // while the other carries the weight, then they swap
    const leadL = k0 % 2 === 0, lift = moving ? Math.sin(q * Math.PI) * 0.09 : 0;
    const fA = spFoot(k0 + (q > 0.5 ? 1 : 0), -1), fB = spFoot(k0 + 1, 1);
    const fBack = spFoot(k0, 1), fFwd = spFoot(k0 + 1, -1);
    const back = leadL ? fBack : fA, fwd = leadL ? fFwd : fB;
    const qq = sm(0.1, 0.9, q);
    const swing = [lerp(back[0], fwd[0], qq), lerp(back[1], fwd[1], qq), lerp(back[2], fwd[2], qq)];
    const plant = leadL ? fA : fBack;
    drawLeg(c, plant, 0, ox, oy, 1);
    drawLeg(c, moving ? swing : spFoot(k0 + 1, -1), lift, ox, oy, 1);
    // contact shadow of the planted boot on its tread
    const [sx, sy] = spProj(plant[0], plant[1] + 0.002, plant[2]);
    K.shadowBlob(c, sx - ox, sy - oy, 16, 2.6, { alpha: 0.6 });
    // the slabs nearer than the boots cover them again (the occluder for the tread he is on)
    const kk = clamp(Math.round(fk), SPK[0], SPK[SPK.length - 1]);
    const occ = P.occ && P.occ[kk];
    if (occ) c.drawImage(occ, -ox, -oy, SPC.W, SPC.H);
  });
}

/// hand-lettered marker strokes (unit glyphs, 0..0.7 wide, 0..1 tall)
const GLYPH = {
  F: [[[0, 0.02], [0.02, 1]], [[0, 0.02], [0.62, 0]], [[0.02, 0.5], [0.48, 0.47]]],
  R: [[[0.02, 1], [0, 0.02], [0.42, 0], [0.6, 0.16], [0.54, 0.4], [0.06, 0.5]], [[0.22, 0.5], [0.66, 1]]],
  E: [[[0.6, 0.03], [0.02, 0], [0, 1], [0.64, 0.97]], [[0.02, 0.5], [0.48, 0.52]]],
};
// Hand lettering: each glyph stroke is resampled into short segments with a wandering nib (low-
// frequency wobble, not jitter), pressure that swells after the nib lands and thins as it lifts, a
// little overshoot at the ends; then the ink BLEEDS into the wet card (a soft, wider, fainter copy
// under the crisp line, feathered further where the card is soaked) and runs in drips.
function markerWord(g, word, x, y, lh, t, seed) {
  const adv = lh * 0.86, x0 = lh * 0.5;
  const bw = word.length * adv + lh, bh = lh * 2.2;
  const ox = x - (word.length * adv) / 2 + lh * 0.08 - x0, oy = y - lh / 2 - lh * 0.3;
  const T = tmp(bw, bh), s = T.g;
  const drips = [];
  s.lineCap = "round"; s.lineJoin = "round";
  [...word].forEach((ch, i) => {
    const gx = x0 + i * adv, gy = lh * 0.3, rot = (hash(i, seed) - 0.5) * 0.14, sc = 1 + (hash(i, seed + 8) - 0.5) * 0.12;
    (GLYPH[ch] || []).forEach((stroke, si) => {
      const pts = stroke.map(([u, v], k) => [gx + (u * sc + rot * (v - 0.5)) * lh + (hash(i * 31 + k + si * 7, seed + 2) - 0.5) * lh * 0.06, gy + v * lh * sc + (hash(i * 17 + k + si * 5, seed + 3) - 0.5) * lh * 0.05]);
      // overshoot past the last point
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      pts.push([b[0] + (b[0] - a[0]) * 0.06, b[1] + (b[1] - a[1]) * 0.06]);
      let total = 0;
      for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      let acc = 0;
      const ph = hash(i * 3 + si, seed + 4) * 10;
      for (let k = 1; k < pts.length; k++) {
        const [ax, ay] = pts[k - 1], [bx, by] = pts[k], L = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.ceil(L / 1.5));
        const nx = -(by - ay) / (L || 1), ny = (bx - ax) / (L || 1);
        for (let j = 0; j < n; j++) {
          const q0 = j / n, q1 = (j + 1) / n, d0 = (acc + q0 * L) / total, d1 = (acc + q1 * L) / total;
          const wob = (d) => Math.sin(d * 9 + ph) * lh * 0.012 + Math.sin(d * 23 + ph * 2) * lh * 0.006;
          const p0 = [lerp(ax, bx, q0) + nx * wob(d0), lerp(ay, by, q0) + ny * wob(d0)], p1 = [lerp(ax, bx, q1) + nx * wob(d1), lerp(ay, by, q1) + ny * wob(d1)];
          const pr = sm(0, 0.08, d0) * (1 - 0.55 * sm(0.82, 1, d0)) * (0.85 + 0.15 * Math.sin(d0 * 7 + ph));
          s.strokeStyle = `rgba(16,18,44,${0.75 + pr * 0.2})`;
          s.lineWidth = lh * (0.05 + pr * 0.06);
          s.beginPath(); s.moveTo(p0[0], p0[1]); s.lineTo(p1[0], p1[1]); s.stroke();
        }
        acc += L;
        if (pts[k][1] > gy + lh * 0.93 && k < pts.length - 1) drips.push([pts[k][0], pts[k][1], i * 5 + k]);
      }
    });
  });
  // the ink runs in the rain: thin drips with a bead at the end
  for (const [px, py, k] of drips) {
    if (hash(k, seed + 6) < 0.35) continue;
    const len = lh * (0.18 + hash(k, seed + 5) * 0.5) * (0.55 + 0.45 * clamp(t / 10));
    s.strokeStyle = "rgba(24,26,60,0.6)"; s.lineWidth = lh * 0.028;
    s.beginPath(); s.moveTo(px, py); s.quadraticCurveTo(px + lh * 0.02, py + len * 0.5, px - lh * 0.01, py + len); s.stroke();
    s.fillStyle = "rgba(24,26,60,0.7)"; s.beginPath(); s.ellipse(px - lh * 0.01, py + len, lh * 0.028, lh * 0.04, 0, 0, TAU); s.fill();
  }
  g.save();
  // bleed: a wide soft halo of dye wicked into the wet fibres, then a tighter one, then the line
  if (K.hasFilter()) {
    g.filter = `blur(${K.qblur((lh * 0.09).toFixed(1))}px)`; g.globalAlpha = 0.5; g.globalCompositeOperation = "multiply"; g.drawImage(T.c, ox, oy + lh * 0.03, bw, bh);
    g.filter = `blur(${K.qblur((lh * 0.025).toFixed(1))}px)`; g.globalAlpha = 0.55; g.drawImage(T.c, ox, oy, bw, bh);
    g.filter = "none";
  }
  g.globalCompositeOperation = "source-over"; g.globalAlpha = 0.82;
  g.drawImage(T.c, ox, oy, bw, bh);
  g.restore();
}
function umbrellaGeom(x, y, r, tilt) {
  // world points of the canopy outline (dome then scalloped rim), for drawing and the rain mask
  const ca = Math.cos(tilt), sa = Math.sin(tilt);
  const P = (lx, ly) => [x + lx * ca - ly * sa, y + lx * sa + ly * ca];
  const dome = [], rim = [];
  for (let i = 0; i <= 16; i++) { const a = Math.PI + (i / 16) * Math.PI; dome.push(P(Math.cos(a) * r, Math.sin(a) * r * 0.62)); }
  for (let i = 8; i >= 0; i--) { const lx = -r + (i / 8) * 2 * r; rim.push(P(lx, 0)); if (i) rim.push(P(lx - r / 8, -r * 0.07)); }
  return { P, dome, rim };
}
// ---- flashback: a grey rainy day, years ago --------------------------------------------------------
// One overcast sky is the key light for every day shot: a huge soft source overhead, so tops are bright,
// verticals mid, undersides and contacts dark (AO), and wet surfaces mirror the pale sky.
const SKYD = "#c6cdd6", HAZE = "#b4bcc6";
const BRICK = { seed: 2, color: "#7a4a3a" }, METAL = { seed: 3, color: "#7a5a30", rust: 0.2 };
// the overcast deck: big soft lumps of darker cloud, baked once (cheap low-res fbm)
const cloudDeck = () => K.texBake("f04deck", 240, 64, (u, v, out) => {
  const n = tF(u * 4, v * 2.2, 41, 4, 4, 0) * 0.7 + tF(u * 12, v * 6, 43, 3, 12, 0) * 0.3;
  out[0] = 70; out[1] = 76; out[2] = 86; out[3] = clamp(0.1 + n * 0.45 - v * 0.15) * 255;
});
const RES3 = 1.4; // the street plate is oversampled so the slow dolly-in stays sharp
const HZ3 = 236;  // the eye line at a child's height
const BOX3 = { x: 432, y: 412, w: 132, h: 82 };
const BIN3 = { x: 262, y: 404, s: 118 };
// paint fn into a fresh canvas (logical size w x h)
function tmpPaint(w, h, fn) { const T = tmp(w, h); fn(T.g, w, h); return T.c; }
// fill a path with a repeating image, pattern transform (a,b,c,d,e,f)
function patFill(g, path, img, a, b, c, d, e, f, alpha = 1, mode) {
  const pat = g.createPattern(img, "repeat");
  setPat(pat, a, b, c, d, e, f);
  g.save();
  g.globalAlpha *= alpha;
  if (mode) g.globalCompositeOperation = mode;
  g.fillStyle = pat; g.fill(path);
  g.restore();
}
function gradFill(g, path, x0, y0, x1, y1, stops, mode) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.save(); if (mode) g.globalCompositeOperation = mode; g.fillStyle = gr; g.fill(path); g.restore();
}
function rectPath(x, y, w, h) { const p = new Path2D(); p.rect(x, y, w, h); return p; }
function polyPath(pts) { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); return p; }

// a sash window seen across the street: stone surround, weathered paint, glass mirroring the sky
function sashWindow(s, x, y, w, h, R) {
  s.fillStyle = "#8a867c"; s.fillRect(x - 3, y - 4, w + 6, h + 8);
  s.fillStyle = "#33353a"; s.fillRect(x, y, w, h);
  const gl = s.createLinearGradient(0, y, 0, y + h);
  gl.addColorStop(0, "#b8c1cc"); gl.addColorStop(0.42, "#79828d"); gl.addColorStop(0.52, "#3c4148"); gl.addColorStop(1, "#2a2d32");
  s.fillStyle = gl; s.fillRect(x + 2, y + 2, w - 4, h - 4);
  if (R() > 0.55) { s.fillStyle = "rgba(214,208,194,0.32)"; s.fillRect(x + 2, y + h * 0.52, w - 4, h * 0.48 - 2); }
  s.fillStyle = "#bdb9b0";
  s.fillRect(x, y, w, 1.5); s.fillRect(x, y + h - 1.5, w, 1.5); s.fillRect(x, y, 1.5, h); s.fillRect(x + w - 1.5, y, 1.5, h);
  s.fillRect(x, y + h * 0.5 - 0.8, w, 1.6); s.fillRect(x + w / 2 - 0.5, y, 1, h);
  s.fillStyle = "rgba(0,0,0,0.4)"; s.fillRect(x + 1.5, y + 1.5, w - 3, 2.5);
  s.fillStyle = "#a39f94"; s.fillRect(x - 4, y + h + 1, w + 8, 3);
  s.fillStyle = "rgba(20,22,26,0.3)"; s.fillRect(x - 4, y + h + 4, w + 8, 4);
}
// the terrace across the road (the plate is blurred a little afterwards: it sits behind the focus)
function paintTerrace(s) {
  const R = K.rng("f04terr");
  const base = 248;
  let x = -46, i = 0;
  while (x < 780) {
    const w = 116 + R() * 16, h = 132 + R() * 10, top = base - h;
    const render = R() > 0.7;
    const bc = ["#77473a", "#86533f", "#6c4536", "#7e4f3c"][i % 4];
    // slate roof pitch, ridge catching the sky, chimney stack with pots on the party wall
    const roof = polyPath([[x - 3, top], [x - 3, top - 24], [x + w + 3, top - 24], [x + w + 3, top]]);
    s.fillStyle = "#43474e"; s.fill(roof);
    K.texFill(s, "shingle", roof, { scale: 34, alpha: 0.55, mode: "overlay", ox: i * 17, tex: { seed: 6, color: "#3a3e48" } });
    gradFill(s, roof, 0, top - 24, 0, top, [[0, "rgba(200,208,220,0.28)"], [1, "rgba(0,0,0,0.15)"]]);
    const cx = x + w - 6;
    s.fillStyle = shade(bc, -0.12); s.fillRect(cx - 13, top - 50, 26, 28);
    K.texRect(s, "brick", cx - 13, top - 50, 26, 28, { scale: 26, alpha: 0.75, ox: i * 13, tex: BRICK });
    s.fillStyle = "rgba(0,0,0,0.25)"; s.fillRect(cx + 4, top - 50, 9, 28);
    s.fillStyle = "#6a655b"; s.fillRect(cx - 15, top - 53, 30, 4);
    for (const px of [-8, 0, 8]) { const pg = s.createLinearGradient(cx + px - 2.4, 0, cx + px + 2.4, 0); pg.addColorStop(0, "#9a6a4c"); pg.addColorStop(1, "#5a3a28"); s.fillStyle = pg; s.fillRect(cx + px - 2.4, top - 62, 4.8, 9); }
    // facade: brick, or a painted render on some houses
    if (render) { s.fillStyle = "#c9c0ae"; s.fillRect(x, top, w, h); K.texRect(s, "plaster", x, top, w, h, { scale: 80, alpha: 0.9, ox: i * 37, tex: { seed: 5, color: "#c9c0ae" } }); }
    else { K.texRect(s, "brick", x, top, w, h, { scale: 40, ox: i * 29, oy: i * 7, tex: BRICK }); s.fillStyle = rgba(bc, 0.3); s.globalCompositeOperation = "color"; s.fillRect(x, top, w, h); s.globalCompositeOperation = "source-over"; s.fillStyle = `rgba(${i % 2 ? "255,240,220" : "0,0,0"},${0.04 + hash(i, 3) * 0.08})`; s.fillRect(x, top, w, h); }
    // rain-darkened streaks below the sills and the gutter
    for (let k = 0; k < 6; k++) {
      const sx = x + R() * w, sl = 20 + R() * 60;
      const sg = s.createLinearGradient(0, top, 0, top + sl);
      sg.addColorStop(0, "rgba(20,16,14,0.22)"); sg.addColorStop(1, "rgba(20,16,14,0)");
      s.fillStyle = sg; s.fillRect(sx, top, 3 + R() * 6, sl);
    }
    s.fillStyle = "#3e4044"; s.fillRect(x - 3, top - 2, w + 6, 5);
    s.fillStyle = "rgba(200,208,218,0.3)"; s.fillRect(x - 3, top - 2, w + 6, 1);
    K.aoEdge(s, x, top + 3, x + w, top + 3, { width: 16, alpha: 0.38, side: -1 });
    for (const k of [0, 1]) sashWindow(s, x + 16 + k * (w - 54), top + 16, 22, 36, R);
    if (i % 2 === 0) {
      // shopfront: fascia, glazing that mirrors the street, a warm interior on a dull day
      const sx0 = x + 6, sw = w - 12, sy = base - 72;
      s.fillStyle = ["#2c3848", "#4a2626", "#283c2e"][(i / 2) % 3]; s.fillRect(sx0, sy, sw, 14);
      s.fillStyle = "rgba(255,255,255,0.08)"; s.fillRect(sx0, sy, sw, 2);
      const gl = s.createLinearGradient(0, sy + 14, 0, base - 12);
      gl.addColorStop(0, "#a3abb5"); gl.addColorStop(0.32, "#56606a"); gl.addColorStop(1, "#262a30");
      s.fillStyle = gl; s.fillRect(sx0 + 3, sy + 16, sw - 6, 44);
      if (R() > 0.35) { const wg = s.createRadialGradient(sx0 + sw * 0.4, sy + 44, 4, sx0 + sw * 0.4, sy + 44, sw * 0.5); wg.addColorStop(0, "rgba(255,206,140,0.55)"); wg.addColorStop(1, "rgba(255,206,140,0)"); s.fillStyle = wg; s.fillRect(sx0 + 3, sy + 16, sw - 6, 44); }
      s.fillStyle = "#24262a"; s.fillRect(sx0, base - 12, sw, 12);
      s.fillStyle = "#a9a59c"; for (const mx of [0, sw / 2 - 1, sw - 2]) s.fillRect(sx0 + mx, sy + 14, 2, 48);
    } else {
      sashWindow(s, x + 14, base - 68, 32, 46, R);
      const dx = x + w - 42;
      s.fillStyle = "#26282c"; s.fillRect(dx - 2, base - 70, 30, 70);
      s.fillStyle = ["#283a58", "#5a1e1e", "#1e3a2e", "#38383a"][(R() * 4) | 0]; s.fillRect(dx, base - 58, 26, 54);
      s.fillStyle = "rgba(255,255,255,0.07)"; s.fillRect(dx, base - 58, 3, 54);
      s.fillStyle = "#9ea6ae"; s.fillRect(dx, base - 67, 26, 8);
      s.fillStyle = "#c0a050"; s.fillRect(dx + 19, base - 32, 2, 3);
      s.fillStyle = "#8f8a80"; s.fillRect(dx - 5, base - 4, 36, 4);
    }
    s.fillStyle = "#2a2c30"; s.fillRect(x + w - 2, top, 3, h);
    K.aoEdge(s, x, base, x + w, base, { width: 10, alpha: 0.4, side: 1 });
    x += w; i++;
  }
}
// the shop wall along our pavement, unwrapped: brick, a roller shutter, a sign fascia
function paintShopWallAlbedo(s, w, h) {
  K.texRect(s, "brick", 0, 0, w, h, { scale: 70, tex: BRICK }); s.fillStyle = "rgba(40,20,12,0.18)"; s.fillRect(0, 0, w, h);
  // painted fascia
  s.fillStyle = "#2a3238"; s.fillRect(0, h * 0.2, w * 0.62, h * 0.08);
  K.texRect(s, "metal", 0, h * 0.2, w * 0.62, h * 0.08, { scale: 120, alpha: 0.25, mode: "overlay", tex: METAL });
  // the galvanised roller shutter: horizontal slats, each a little cylinder (lit top, dark lip)
  const x0 = w * 0.05, x1 = w * 0.58, y0 = h * 0.29, y1 = h;
  s.fillStyle = "#7a8088"; s.fillRect(x0, y0, x1 - x0, y1 - y0);
  K.texRect(s, "metal", x0, y0, x1 - x0, y1 - y0, { scale: 160, alpha: 0.5, mode: "luminosity", tex: METAL });
  for (let y = y0; y < y1; y += 9) {
    const sg = s.createLinearGradient(0, y, 0, y + 9);
    sg.addColorStop(0, "rgba(255,255,255,0.18)"); sg.addColorStop(0.45, "rgba(0,0,0,0)"); sg.addColorStop(0.85, "rgba(0,0,0,0.25)"); sg.addColorStop(1, "rgba(0,0,0,0.55)");
    s.fillStyle = sg; s.fillRect(x0, y, x1 - x0, 9);
  }
  // splash-back: the bottom of the wall soaked darker, grime streaks
  const sb = s.createLinearGradient(0, h * 0.8, 0, h);
  sb.addColorStop(0, "rgba(10,10,12,0)"); sb.addColorStop(1, "rgba(10,10,12,0.45)");
  s.fillStyle = sb; s.fillRect(0, h * 0.8, w, h * 0.2);
  // a downpipe at the far end
  s.fillStyle = "#24262a"; s.fillRect(w * 0.66, 0, 16, h);
  s.fillStyle = "rgba(255,255,255,0.12)"; s.fillRect(w * 0.66 + 3, 0, 3, h);
}
// a green plastic wheelie bin: moulded body with ribs, overhanging lid, rubber wheels; wet sheen
function wheelieBin(g, x, y, s) {
  const w0 = s * 0.82, w1 = s * 0.98, h = s * 1.28, top = y - h;
  const body = polyPath([[x - w0 / 2, y - 4], [x - w1 / 2, top], [x + w1 / 2, top], [x + w0 / 2, y - 4]]);
  g.fillStyle = "#22362b"; g.fill(body);
  K.texFill(g, "noise", body, { scale: 60, alpha: 0.12, mode: "overlay", tex: { seed: 3 } });
  // a box with rounded vertical corners: the front panel faces us, the corners roll away (darker), the
  // left corner turns toward the open sky (a cool fresnel sheen)
  gradFill(g, body, x - w1 / 2, 0, x + w1 / 2, 0, [[0, "rgba(180,196,210,0.32)"], [0.06, "rgba(0,0,0,0.25)"], [0.16, "rgba(0,0,0,0)"], [0.82, "rgba(0,0,0,0.05)"], [0.94, "rgba(0,0,0,0.42)"], [1, "rgba(0,0,0,0.6)"]]);
  gradFill(g, body, 0, top, 0, y, [[0, "rgba(255,255,255,0.12)"], [0.5, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.38)"]]);
  // moulded ribs: a lit upper lip, a shadow below
  g.save(); g.clip(body);
  for (const k of [0.22, 0.27, 0.74]) {
    const yy = top + h * k;
    g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(x - w1, yy + 1.2, w1 * 2, 2.2);
    g.fillStyle = "rgba(190,210,220,0.18)"; g.fillRect(x - w1, yy, w1 * 2, 1.1);
  }
  // rain running down: thin glossy rivulets and beads
  const R = K.rng("f04binwet");
  for (let i = 0; i < 16; i++) {
    const rx = x - w1 / 2 + R() * w1, ry = top + 10 + R() * h * 0.4, rl = 10 + R() * h * 0.5;
    const rg = g.createLinearGradient(0, ry, 0, ry + rl);
    rg.addColorStop(0, "rgba(200,214,226,0)"); rg.addColorStop(0.5, "rgba(200,214,226,0.22)"); rg.addColorStop(1, "rgba(200,214,226,0)");
    g.fillStyle = rg; g.fillRect(rx, ry, 1.2, rl);
  }
  for (let i = 0; i < 40; i++) { const bx = x - w1 / 2 + R() * w1, by = top + R() * h; g.fillStyle = "rgba(10,18,14,0.35)"; g.fillRect(bx, by + 0.8, 1.6, 1.2); g.fillStyle = "rgba(220,232,240,0.55)"; g.fillRect(bx, by, 1, 0.9); }
  g.restore();
  // the lid: an overhanging slab whose top faces the sky (the brightest plane on the bin)
  const lid = polyPath([[x - w1 / 2 - 6, top + 2], [x - w1 / 2 - 2, top - 7], [x + w1 / 2 + 2, top - 7], [x + w1 / 2 + 6, top + 2]]);
  g.fillStyle = "#4d6858"; g.fill(lid);
  gradFill(g, lid, x - w1 / 2, 0, x + w1 / 2, 0, [[0, "rgba(220,230,236,0.35)"], [0.5, "rgba(220,230,236,0.1)"], [1, "rgba(0,0,0,0.25)"]]);
  const lip = rectPath(x - w1 / 2 - 6, top + 2, w1 + 12, 8);
  g.fillStyle = "#1f3127"; g.fill(lip);
  gradFill(g, lip, 0, top + 2, 0, top + 10, [[0, "rgba(255,255,255,0.12)"], [1, "rgba(0,0,0,0.35)"]]);
  K.aoEdge(g, x - w1 / 2, top + 10, x + w1 / 2, top + 10, { width: 12, alpha: 0.5, side: -1 });
  // wheels (behind, at the back corners) and the axle
  for (const sx of [-1, 1]) {
    const wx = x + sx * w0 * 0.38, wy = y - s * 0.07, r = s * 0.085;
    const wg = g.createRadialGradient(wx - r * 0.3, wy - r * 0.4, r * 0.1, wx, wy, r);
    wg.addColorStop(0, "#3a3a3c"); wg.addColorStop(0.6, "#151516"); wg.addColorStop(1, "#060607");
    g.fillStyle = wg; g.beginPath(); g.arc(wx, wy, r, 0, TAU); g.fill();
    g.fillStyle = "#5a5c60"; g.beginPath(); g.arc(wx, wy, r * 0.35, 0, TAU); g.fill();
  }
}
// water wicking up a wet box from the pavement: dark below a ragged, blotchy tide line (alpha mask)
const tideTex = () => K.texBake("f04tide", 128, 64, (u, v, out) => {
  const n = tF(u * 6, v * 3, 47, 4, 6, 0) * 0.5 + tF(u * 20, v * 9, 48, 2, 20, 0) * 0.18;
  const e = v - 0.42 + n * 0.32;
  const a = clamp(e * 5) * 0.8 + Math.exp(-((e - 0.02) ** 2) / 0.002) * 0.25;
  out[0] = 26; out[1] = 12; out[2] = 2; out[3] = clamp(a) * 255;
});
// the cut edge of corrugated board along P->Q: the flutes show as a row of tiny lit arches
function fluteEdge(g, P, Q, w, lit) {
  const L = Math.hypot(Q[0] - P[0], Q[1] - P[1]), n = Math.floor(L / 2.6);
  const ux = (Q[0] - P[0]) / L, uy = (Q[1] - P[1]) / L, nx = -uy, ny = ux;
  g.save();
  g.lineWidth = w; g.strokeStyle = "rgba(150,116,74," + (0.35 + lit * 0.25).toFixed(2) + ")"; g.lineCap = "round";
  g.beginPath(); g.moveTo(P[0], P[1]); g.lineTo(Q[0], Q[1]); g.stroke();
  g.lineWidth = 0.7;
  for (let i = 0; i < n; i++) {
    const x = P[0] + ux * (i + 0.5) * 2.6, y = P[1] + uy * (i + 0.5) * 2.6;
    g.strokeStyle = "rgba(70,44,16,0.7)"; g.beginPath(); g.arc(x, y, 1.15, Math.atan2(ny, nx) - 1.4, Math.atan2(ny, nx) + 1.4); g.stroke();
    g.fillStyle = "rgba(232,206,160," + (0.35 * lit).toFixed(2) + ")"; g.fillRect(x - 0.5, y - 0.5, 1, 1);
  }
  g.restore();
}
// the soggy box, three-quarter view: corrugated kraft gone soft with rain. Rounded crushed corners,
// a rim that sags where the wet board has lost its stiffness, flaps hanging off it with their flutes
// showing on the cut edges, water wicking up from the base, FREE in hand marker bleeding into it
function soggyBox(g, x, y, w, h) {
  const d = w * 0.36, dy = d * 0.45;
  const tex = cardboardTex(1), k = 0.42;
  const sag = 9;
  // darker wet asphalt and occlusion under and around the base
  g.save();
  if (K.hasFilter()) g.filter = "blur(6px)";
  g.fillStyle = "rgba(14,14,18,0.55)";
  g.beginPath(); g.ellipse(x + d * 0.4, y - dy * 0.3, w * 0.66 + d * 0.3, 14, -0.04, 0, TAU); g.fill();
  g.restore();
  // the dark inside, seen over the front edge, and the back flap standing up
  const inside = polyPath([[x - w / 2 + 4, y - h + sag * 0.5], [x + w / 2 - 2, y - h + 2], [x + w / 2 + d - 3, y - h - dy + 2], [x - w / 2 + d, y - h - dy + 3]]);
  g.fillStyle = "#1a1008"; g.fill(inside);
  gradFill(g, inside, 0, y - h - dy, 0, y - h, [[0, "rgba(90,60,30,0.45)"], [1, "rgba(0,0,0,0)"]]);
  const back = new Path2D();
  back.moveTo(x - w / 2 + d, y - h - dy + 3); back.bezierCurveTo(x - w * 0.1, y - h - dy - h * 0.36, x + d * 0.6, y - h - dy - h * 0.2, x + w / 2 + d - 3, y - h - dy - h * 0.02); back.lineTo(x + w / 2 + d - 3, y - h - dy + 2); back.closePath();
  patFill(g, back, tex, k, 0, 0, k, x, y);
  gradFill(g, back, 0, y - h - dy - h * 0.36, 0, y - h - dy, [[0, "rgba(255,240,220,0.12)"], [1, "rgba(0,0,0,0.5)"]]);
  fluteEdge(g, [x - w / 2 + d + 2, y - h - dy - 2], [x - w * 0.02, y - h - dy - h * 0.25], 1.6, 0.9);
  // the side face, receding to the right: it faces away from the open sky, so it is darker
  const side = new Path2D();
  side.moveTo(x + w / 2 - 2, y); side.lineTo(x + w / 2 - 2, y - h + 4); side.quadraticCurveTo(x + w / 2 + d * 0.5, y - h - dy * 0.5 + 5, x + w / 2 + d - 3, y - h - dy + 2);
  side.quadraticCurveTo(x + w / 2 + d + 1, y - dy - h * 0.5, x + w / 2 + d - 1, y - dy); side.closePath();
  patFill(g, side, tex, k * 0.55, -k * 0.25, 0, k, x + w / 2, y);
  gradFill(g, side, x + w / 2, 0, x + w / 2 + d, 0, [[0, "rgba(0,0,0,0.38)"], [1, "rgba(0,0,0,0.6)"]]);
  g.save(); g.clip(side); g.globalAlpha = 0.95; g.drawImage(tideTex(), x + w / 2 - 4, y - h * 0.62 - dy, d + 8, h * 0.62 + dy + 2); g.restore();
  // the front face, bowed by the wet, its top sagging between the corners; corners rounded and crushed
  const front = new Path2D();
  front.moveTo(x - w / 2 + 3, y);
  front.quadraticCurveTo(x - w / 2 - 4, y - h * 0.5, x - w / 2 + 1, y - h + 5);
  front.quadraticCurveTo(x - w / 2 + 2, y - h + 1, x - w / 2 + 7, y - h + 1.5);
  front.quadraticCurveTo(x, y - h + sag, x + w / 2 - 6, y - h + 2);
  front.quadraticCurveTo(x + w / 2 - 1, y - h + 2.5, x + w / 2 - 1, y - h + 7);
  front.lineTo(x + w / 2 - 1, y - 4);
  front.quadraticCurveTo(x + w / 2 - 1, y + 1, x + w / 2 - 7, y + 1);
  front.quadraticCurveTo(x, y + 3, x - w / 2 + 3, y);
  patFill(g, front, tex, k, 0, 0, k, x - w / 2, y - h);
  // soft overcast light: brighter at the top edge, a bow highlight down the middle, falling off below
  gradFill(g, front, 0, y - h, 0, y, [[0, "rgba(255,244,226,0.16)"], [0.4, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.22)"]]);
  gradFill(g, front, x - w / 2, 0, x + w / 2, 0, [[0, "rgba(0,0,0,0.24)"], [0.08, "rgba(0,0,0,0.04)"], [0.45, "rgba(255,240,220,0.07)"], [0.9, "rgba(0,0,0,0.1)"], [1, "rgba(0,0,0,0.32)"]]);
  g.save(); g.clip(front);
  markerWord(g, "FREE", x - 2, y - h * 0.57, h * 0.34, 10, 41);
  // water wicking up from the pavement: a ragged, blotchy dark tide, darkest at the line itself
  g.drawImage(tideTex(), x - w / 2 - 6, y - h * 0.62, w + 12, h * 0.62 + 4);
  // the rounded vertical corner: a soft highlight rolling round it instead of a hard edge
  const cr = g.createLinearGradient(x + w / 2 - 9, 0, x + w / 2, 0);
  cr.addColorStop(0, "rgba(255,240,220,0)"); cr.addColorStop(0.55, "rgba(255,240,220,0.12)"); cr.addColorStop(1, "rgba(0,0,0,0.25)");
  g.fillStyle = cr; g.fillRect(x + w / 2 - 9, y - h, 9, h);
  // a glossy wet film near the bottom catching the sky
  gradFill(g, rectPath(x - w / 2, y - h * 0.3, w, h * 0.3), 0, y - h * 0.3, 0, y, [[0, "rgba(190,200,214,0.1)"], [1, "rgba(190,200,214,0)"]]);
  // creases where the soft board has buckled
  g.strokeStyle = "rgba(20,10,2,0.22)"; g.lineWidth = 1.2;
  for (const [a, b, c2, dd] of [[0.2, 0.15, 0.24, 0.55], [0.7, 0.1, 0.66, 0.42]]) { g.beginPath(); g.moveTo(x - w / 2 + w * a, y - h + h * b); g.quadraticCurveTo(x - w / 2 + w * (a + c2) * 0.5 + 3, y - h + h * (b + dd) * 0.5, x - w / 2 + w * c2, y - h + h * dd); g.stroke(); }
  g.restore();
  // the front flap: lost its stiffness, hanging over the face; its shadow on the face under it
  const ffs = new Path2D();
  ffs.moveTo(x - w / 2 - 5, y - h + h * 0.3); ffs.quadraticCurveTo(x - w * 0.05, y - h + h * 0.38, x + w * 0.2, y - h + 4); ffs.quadraticCurveTo(x - w * 0.04, y - h + h * 0.5, x - w / 2 - 2, y - h + h * 0.44); ffs.closePath();
  g.save(); if (K.hasFilter()) g.filter = "blur(2px)"; g.fillStyle = "rgba(20,10,2,0.35)"; g.fill(ffs); g.restore();
  const ff = new Path2D();
  ff.moveTo(x - w / 2 + 6, y - h + 2); ff.quadraticCurveTo(x - w * 0.1, y - h + sag * 0.9, x + w * 0.2, y - h + 4); ff.bezierCurveTo(x + w * 0.05, y - h + h * 0.3, x - w * 0.2, y - h + h * 0.4, x - w / 2 - 6, y - h + h * 0.31); ff.closePath();
  patFill(g, ff, tex, k, 0.1 * k, 0, k, x, y - h);
  gradFill(g, ff, 0, y - h, 0, y - h + h * 0.4, [[0, "rgba(255,240,220,0.18)"], [0.6, "rgba(0,0,0,0.12)"], [1, "rgba(20,10,2,0.4)"]]);
  fluteEdge(g, [x + w * 0.18, y - h + 6], [x - w / 2 - 5, y - h + h * 0.31], 1.8, 0.8);
  // the right flap drooping off the corner, its underside dark
  const rf = new Path2D();
  rf.moveTo(x + w / 2 - 2, y - h + 4); rf.bezierCurveTo(x + w * 0.6, y - h * 0.86, x + w * 0.64, y - h * 0.7, x + w / 2 + d * 1.1, y - h * 0.55); rf.quadraticCurveTo(x + w / 2 + d * 1.05, y - h * 0.8, x + w / 2 + d - 3, y - h - dy + 2); rf.closePath();
  patFill(g, rf, tex, k, 0, 0, k, x + w / 2, y);
  g.fillStyle = "rgba(0,0,0,0.32)"; g.fill(rf);
  fluteEdge(g, [x + w / 2 + 2, y - h * 0.86], [x + w / 2 + d * 1.08, y - h * 0.57], 1.5, 0.5);
  // contact: the base line soaked black where it sits in the water
  K.aoEdge(g, x - w / 2, y + 1, x + w / 2, y + 2, { width: 7, alpha: 0.6, side: -1 });
  g.fillStyle = "rgba(10,6,2,0.55)"; g.fillRect(x - w / 2 + 3, y - 2, w - 6, 3);
}
function paintStreetSky(s, w, h) {
  const sk = s.createLinearGradient(0, 0, 0, h);
  sk.addColorStop(0, "#aab3be"); sk.addColorStop(0.7, "#cdd3da"); sk.addColorStop(1, "#d6dbe1");
  s.fillStyle = sk; s.fillRect(0, 0, w, h);
  // the heavy cloud deck: soft lumpy undersides, low contrast
  s.drawImage(cloudDeck(), 0, 0, w, h);
}
// standing water on the pavement (plate coordinates): irregular puddles in the dips
const PUDS = [[236, 444, 96, 12, 1], [470, 450, 118, 13, 2], [830, 506, 150, 21, 3], [338, 318, 64, 5.5, 4], [700, 318, 82, 6.5, 5], [70, 352, 70, 7, 6], [612, 468, 132, 13, 7]];
let PUD_P = null;
const pudPaths = () => PUD_P || (PUD_P = PUDS.map(([cx, cy, rx, ry, sd]) => {
  const p = new Path2D();
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * TAU, k = 0.78 + 0.22 * K.noise(i * 0.7, sd * 13) + 0.12 * Math.sin(a * 3 + sd);
    const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
    i ? p.lineTo(x, y) : p.moveTo(x, y);
  }
  p.closePath();
  return p;
}));
// what the wet ground mirrors: the sky and the terrace flipped about the far kerb line (their base),
// softened by the rough water and smeared down (a wet road stretches reflections vertically)
function paintMirror(s) {
  const top = tmpPaint(LW, 260, (q) => { q.drawImage(spr("f04ssky", LW, 260, paintStreetSky), 0, 0, LW, 260); q.drawImage(terracePlate(), 0, 0, LW, 260); });
  s.fillStyle = "#c3cad3"; s.fillRect(0, 0, LW, LH);
  s.save();
  if (K.hasFilter()) s.filter = "blur(2.2px)";
  for (const [dy, a] of [[0, 1], [5, 0.5], [11, 0.3]]) {
    s.globalAlpha = a;
    s.save(); s.translate(0, 248 * 2 + dy); s.scale(1, -1.18); s.drawImage(top, 0, 0, LW, 260); s.restore();
  }
  s.restore();
}
// the terrace across the road sits well behind the focus and through a hundred metres of rain:
// softened, desaturated, its blacks lifted toward the haze (atmospheric perspective)
const terracePlate = () => spr("f04terr2", LW, 260, (s) => {
  const TR = tmpPaint(LW, 260, paintTerrace);
  if (K.hasFilter()) s.filter = "blur(2px) saturate(62%) contrast(82%)";
  s.drawImage(TR, 0, 0, LW, 260);
  s.filter = "none";
  s.globalCompositeOperation = "source-atop";
  const hz = s.createLinearGradient(0, 80, 0, 250);
  hz.addColorStop(0, rgba(HAZE, 0.5)); hz.addColorStop(1, rgba(HAZE, 0.34));
  s.fillStyle = hz; s.fillRect(0, 0, LW, 260);
  s.globalCompositeOperation = "source-over";
});
function paintStreet(s) {
  s.drawImage(spr("f04ssky", LW, 260, paintStreetSky), 0, 0, LW, 260);
  s.drawImage(terracePlate(), 0, 0, LW, 260);
  // a parked van far down the road, little more than a shape in the rain
  s.fillStyle = rgba("#5a646e", 0.62); s.fillRect(560, 222, 70, 26); s.fillRect(615, 230, 22, 18);
  s.fillStyle = rgba("#a4aebb", 0.45); s.fillRect(618, 232, 14, 8);
  // the road and our pavement: one wet asphalt plane, then the mirror laid over it with a Fresnel
  // falloff (glancing, far = strong mirror; steep, near = you see the asphalt)
  K.groundPlane(s, LW, LH, { tex: "asphalt", texOpts: { seed: 3, wet: 0.5, color: "#66686c" }, horizon: HZ3, y0: 246, scale: 260, wet: 1, puddles: 0, sky: "#c3cad3", fog: HAZE, fogAmt: 0.9 });
  const MI = spr("f04mirror", LW, LH, paintMirror);
  s.save();
  s.beginPath(); s.rect(0, 248, LW, 40); s.clip();
  s.globalAlpha = 0.42; s.drawImage(MI, 0, 0, LW, LH);
  s.restore();
  // the pavement: a rough wet mirror, strong toward the kerb, fading to the camera
  const PV = tmpPaint(LW, LH, (q) => {
    q.drawImage(MI, 0, 0, LW, LH);
    q.globalCompositeOperation = "destination-in";
    const fr = q.createLinearGradient(0, 292, 0, LH);
    fr.addColorStop(0, "rgba(0,0,0,0.32)"); fr.addColorStop(0.4, "rgba(0,0,0,0.12)"); fr.addColorStop(1, "rgba(0,0,0,0.05)");
    q.fillStyle = fr; q.fillRect(0, 292, LW, LH - 292);
  });
  s.drawImage(PV, 0, 0, LW, LH);
  // the puddles: dark water (the asphalt under it soaked black), the mirror strong in it, a thin
  // meniscus rim catching the sky where the water meets the dry-ish edge
  const PRF = propsReflWater();
  pudPaths().forEach((p, i) => {
    const [cx, cy, rx, ry] = PUDS[i];
    s.save(); s.clip(p);
    s.fillStyle = "rgba(16,18,22,0.7)"; s.fillRect(cx - rx - 4, cy - ry - 4, rx * 2 + 8, ry * 2 + 8);
    s.globalAlpha = lerp(0.62, 0.3, clamp((cy - 300) / 240));
    s.drawImage(MI, 0, 0, LW, LH);
    s.globalAlpha = 1;
    if (cy > 400) { s.globalAlpha = 0.85; s.drawImage(PRF, 0, 0, LW, LH); s.globalAlpha = 1; }
    s.restore();
    s.save(); s.strokeStyle = "rgba(210,218,228,0.3)"; s.lineWidth = 0.9; s.translate(0, -0.6); s.stroke(p); s.restore();
    s.save(); s.strokeStyle = "rgba(10,10,12,0.35)"; s.lineWidth = 1.4; s.translate(0, 1); s.stroke(p); s.restore();
  });
  // kerbs: granite, the top face catching the sky, the face in shadow; worn double yellow lines
  for (const [ky, kh, kt] of [[248, 2, 1], [288, 7, 3]]) {
    s.fillStyle = "#6a6c70"; s.fillRect(-20, ky, LW + 40, kh + kt);
    K.texRect(s, "granite", -20, ky, LW + 40, kh + kt, { scale: 40, alpha: 0.6, mode: "overlay", tex: { seed: 4, lichen: 0 } });
    s.fillStyle = "rgba(205,212,222,0.55)"; s.fillRect(-20, ky, LW + 40, kt);
    s.fillStyle = "rgba(0,0,0,0.35)"; s.fillRect(-20, ky + kt, LW + 40, kh);
  }
  s.fillStyle = "rgba(196,164,64,0.55)"; s.fillRect(-20, 282, LW + 40, 1.6); s.fillRect(-20, 285, LW + 40, 1.6);
  // the shop wall along our side, receding to the vanishing point
  const VX = 520;
  const wallImg = tmpPaint(1500, 640, paintShopWallAlbedo);
  const xN = 1000, tN = -90, bN = 474, xF = 724;
  const q = (xN - xF) / (xN - VX);
  const tF = tN + (HZ3 - tN) * q, bF = bN + (HZ3 - bN) * q;
  perspCols(s, wallImg, 1500 * K.pixelScale(), 640 * K.pixelScale(), xN, tN, bN, xF, tF, bF, 2);
  // the wall faces across the street: lit by the sky evenly, a corner shadow at its far end, AO at its foot
  const wp = polyPath([[xN, tN], [xF, tF], [xF, bF], [xN, bN]]);
  gradFill(s, wp, xF, 0, xN, 0, [[0, "rgba(0,0,0,0.35)"], [0.15, "rgba(0,0,0,0.1)"], [1, "rgba(0,0,0,0.22)"]]);
  s.fillStyle = "#3e3a38"; s.beginPath(); s.moveTo(xF, tF); s.lineTo(xF - 6, tF + 2); s.lineTo(xF - 6, bF - 1); s.lineTo(xF, bF); s.fill();
  K.aoEdge(s, xF, bF, xN, bN, { width: 26, alpha: 0.45, side: 0 });
  // a lamp post on our kerb, near the lens on the left
  const lp = rectPath(54, -20, 15, 446);
  s.fillStyle = "#26302c"; s.fill(lp);
  gradFill(s, lp, 54, 0, 69, 0, [[0, "rgba(190,200,210,0.3)"], [0.3, "rgba(255,255,255,0.08)"], [1, "rgba(0,0,0,0.5)"]]);
  s.fillStyle = "#1e2622"; s.fillRect(48, 400, 27, 26);
  s.fillStyle = "rgba(200,210,220,0.2)"; s.fillRect(48, 400, 27, 2);
  K.shadowBlob(s, 61, 426, 18, 3, { alpha: 0.5 });
  // the bin and the box, then their reflections in the wet pavement: flipped about each base,
  // stretched down, blurred by the rough surface, fading with distance from the contact (Fresnel and
  // the water film thinning); much stronger where a puddle lies under them
  s.save(); s.globalCompositeOperation = "screen"; s.globalAlpha = 0.5;
  s.drawImage(K.texBake("f04wetsheen", 256, 64, (u, v, out) => {
    const n = tF(u * 8, v * 3, 151, 4), m = tN(u * 90, v * 30, 152);
    const k = clamp((n * 0.5 + 0.5) * 1.4 - 0.45 + m * 0.12) * sm(0, 0.6, v);
    out[0] = 150 * k; out[1] = 160 * k; out[2] = 176 * k; out[3] = 255;
  }), -20, 420, LW + 40, LH - 420);
  s.restore();
  s.drawImage(propsRefl(), 0, 0, LW, LH);
  K.shadowBlob(s, BIN3.x, BIN3.y - 1, BIN3.s * 0.44, 3.5, { alpha: 0.75 });
  K.shadowBlob(s, BOX3.x + 18, BOX3.y, BOX3.w * 0.6, 4, { alpha: 0.75 });
  s.drawImage(propsPlate(), 0, 0, LW, LH);
}
const propsPlate = () => spr("f04props", LW * RES3, LH * RES3, (p) => { p.scale(RES3, RES3); wheelieBin(p, BIN3.x, BIN3.y, BIN3.s); soggyBox(p, BOX3.x, BOX3.y, BOX3.w, BOX3.h); });
const propsRefl = () => spr("f04propsR", LW * RES3, LH * RES3, (s) => {
  s.scale(RES3, RES3);
  const props = propsPlate();
  for (const [x0, x1, cy] of [[BIN3.x - 70, BIN3.x + 70, BIN3.y], [BOX3.x - 80, BOX3.x + 130, BOX3.y]]) {
    const RF = tmpPaint(LW, LH, (q2) => {
      q2.save();
      q2.beginPath(); q2.rect(x0, cy, x1 - x0, LH - cy); q2.clip();
      if (K.hasFilter()) q2.filter = "blur(2.6px)";
      for (const [dy, a] of [[0, 0.8], [6, 0.4]]) { q2.globalAlpha = a; q2.save(); q2.translate(0, cy + dy); q2.scale(1, -1.45); q2.translate(0, -cy); q2.drawImage(props, 0, 0, LW, LH); q2.restore(); }
      q2.restore();
      q2.globalCompositeOperation = "destination-in";
      const fg2 = q2.createLinearGradient(0, cy, 0, cy + 130);
      fg2.addColorStop(0, "rgba(0,0,0,0.55)"); fg2.addColorStop(0.5, "rgba(0,0,0,0.2)"); fg2.addColorStop(1, "rgba(0,0,0,0)");
      q2.fillStyle = fg2; q2.fillRect(0, 0, LW, LH);
    });
    s.drawImage(RF, 0, 0, LW, LH);
  }
});
const propsReflWater = () => spr("f04propsW", LW, LH, (s) => {
  const props = propsPlate();
  for (const [x0, x1, cy] of [[BIN3.x - 70, BIN3.x + 70, BIN3.y], [BOX3.x - 80, BOX3.x + 130, BOX3.y]]) {
    s.save(); s.beginPath(); s.rect(x0, cy - 2, x1 - x0, LH - cy); s.clip();
    if (K.hasFilter()) s.filter = "blur(1.2px) brightness(0.55) saturate(0.85)";
    s.translate(0, cy); s.scale(1, -1.1); s.translate(0, -cy); s.drawImage(props, 0, 0, LW, LH);
    s.restore();
  }
});
// the umbrella mirrored in the standing water: flipped about the pavement line, darker, broken up by
// the rain rings (the reflection is drawn in thin rows, each shifted a little by the ripples)
function umbrellaRefl(c, ux, uy, tilt, lt, t) {
  const UL = K.layer(LW, LH, "f04umbR");
  UL.g.save(); UL.g.translate(0, 412); UL.g.scale(1, -0.36); UL.g.translate(0, -412);
  umbrella(UL.g, ux, uy, tilt, lt, true);
  UL.g.restore();
  UL.g.globalCompositeOperation = "source-atop"; UL.g.fillStyle = "rgba(8,6,8,0.5)"; UL.g.fillRect(0, 0, LW, LH); UL.g.globalCompositeOperation = "source-over";
  const P = pudPaths(), px = K.pixelScale();
  c.save();
  PUDS.forEach(([cx, cy, rx, ry], j) => {
    if (cy < 400) return;
    c.save(); c.clip(P[j]);
    for (let y = Math.floor(cy - ry - 2); y < cy + ry + 2; y += 3) {
      const dx = Math.sin(y * 0.55 + t * 7) * 1.6 + Math.sin(y * 0.21 - t * 4.3) * 1.2;
      c.drawImage(UL.canvas, (cx - rx - 8) * px, y * px, (rx * 2 + 16) * px, 3 * px, cx - rx - 8 + dx, y, rx * 2 + 16, 3);
    }
    c.restore();
  });
  c.restore();
}
// a child's fist round the umbrella's shaft at the bottom of frame, a hoodie cuff over the wrist
const HR3 = 22, FIST3 = { W: 4.2 * HR3, H: 3.6 * HR3, hx: 1.3 * HR3, hy: 0.9 * HR3 };
function fistCaps() {
  const C = [], cap = (ax, ay, bx, by, ra, rb, za, zb, kind, fl = 0.7) => C.push(ax, ay, bx, by, ra, rb, za, zb, kind, fl);
  cap(0.4, 0.55, 1.35, 1.0, 0.62, 0.55, 0.1, 0.1, 0, 0.45);
  cap(1.35, 1.0, 2.4, 1.6, 0.5, 0.48, 0.1, 0.05, 0, 0.75);
  for (let f = 0; f < 4; f++) { const y = f * 0.4 - 0.05, r = f === 3 ? 0.17 : 0.2; cap(0.55, y + 0.08, -0.5, y, r, r * 0.95, 0.35, 0.42, 2); }
  cap(0.15, -0.35, -0.4, -0.42, 0.24, 0.21, 0.45, 0.5, 3);
  return Float64Array.from(C);
}
const fistO3 = { R: HR3, W: FIST3.W, H: FIST3.H, hx: FIST3.hx, hy: FIST3.hy, layout: "none", caps: null, wet: 0.6, light: [-0.2, -0.9, 0.55], key: [0.86, 0.86, 0.9], amb: [0.32, 0.33, 0.37], rim: [0.5, 0.52, 0.58], rimDir: [-0.7, -0.6], seed: 31 };
const fist3 = () => { if (!fistO3.caps) fistO3.caps = fistCaps(); return kitBake("f04fist3", fistO3); };
const sleeve3 = () => sleeveBake("f04sleeve3", 200, 26, 18);
// the red umbrella's canopy, painted once in local space (rim centre at the origin, radius r)
const UMR = 150;
function paintCanopy(s) {
  const r = UMR, N = 8, top = -r * 0.62;
  s.translate(r + 24, r * 0.62 + 30);
  const tip = (i) => -r * Math.cos((i / N) * Math.PI);
  const dome = new Path2D();
  dome.moveTo(tip(0), 0);
  for (let i = 0; i < N; i++) { const x0 = tip(i), x1 = tip(i + 1); dome.quadraticCurveTo((x0 + x1) / 2, -r * 0.085, x1, 0); }
  dome.bezierCurveTo(r, top * 0.6, r * 0.55, top, 0, top);
  dome.bezierCurveTo(-r * 0.55, top, -r, top * 0.6, -r, 0);
  dome.closePath();
  // the inside of the far rim shows under the scallops
  s.fillStyle = "#3a0806"; s.beginPath(); s.ellipse(0, -3, r * 0.99, r * 0.09, 0, 0, TAU); s.fill();
  // nylon: lit from the sky above, falling off down the sides and toward the silhouette
  const sh = s.createRadialGradient(-r * 0.12, top - r * 0.1, r * 0.05, 0, top * 0.2, r * 1.25);
  sh.addColorStop(0, "#d8463a"); sh.addColorStop(0.45, "#a8231a"); sh.addColorStop(0.85, "#6e130e"); sh.addColorStop(1, "#4a0c08");
  s.fillStyle = sh; s.fill(dome);
  s.save(); s.clip(dome);
  K.texRect(s, "fabric", -r, top, r * 2, -top, { scale: 26, alpha: 0.22, mode: "overlay", tex: { seed: 7 } });
  // each panel bulges between its ribs: lighter in the middle, a soft dark trough at the rib
  for (let i = 1; i < N; i++) {
    const x = tip(i);
    s.strokeStyle = "rgba(40,0,0,0.22)"; s.lineWidth = 9;
    s.beginPath(); s.moveTo(0, top); s.quadraticCurveTo(x * 1.02, top, x, 0); s.stroke();
    s.strokeStyle = "rgba(30,0,0,0.4)"; s.lineWidth = 1.2;
    s.beginPath(); s.moveTo(0, top); s.quadraticCurveTo(x * 1.02, top, x, 0); s.stroke();
    s.strokeStyle = "rgba(255,190,180,0.12)"; s.lineWidth = 1;
    s.beginPath(); s.moveTo(1.5, top + 1); s.quadraticCurveTo(x * 1.02 + 2, top + 1, x + 2, -1); s.stroke();
  }
  // the wet sheen: the grey sky reflected across the crown, soft
  s.save(); s.translate(-r * 0.22, top + r * 0.12); s.rotate(-0.18); s.scale(1, 0.32);
  const hl = s.createRadialGradient(0, 0, 0, 0, 0, r * 0.62);
  hl.addColorStop(0, "rgba(236,224,224,0.42)"); hl.addColorStop(0.5, "rgba(236,224,224,0.14)"); hl.addColorStop(1, "rgba(236,224,224,0)");
  s.fillStyle = hl; s.beginPath(); s.arc(0, 0, r * 0.62, 0, TAU); s.fill();
  s.restore();
  // beads of rain: a dark lens with a sky glint at the top
  const R = K.rng("f04beads");
  for (let i = 0; i < 160; i++) {
    const bx = (R() * 2 - 1) * r * 0.95, by = top + R() * -top;
    const br = 0.8 + R() * 1.6;
    s.fillStyle = "rgba(50,0,0,0.35)"; s.beginPath(); s.ellipse(bx, by + br * 0.3, br, br * 0.85, 0, 0, TAU); s.fill();
    s.fillStyle = "rgba(255,226,220,0.7)"; s.fillRect(bx - br * 0.4, by - br * 0.35, br * 0.7, br * 0.5);
  }
  // the rim darkens where the fabric turns under
  const rm = s.createLinearGradient(0, -r * 0.16, 0, 0);
  rm.addColorStop(0, "rgba(0,0,0,0)"); rm.addColorStop(1, "rgba(30,0,0,0.45)");
  s.fillStyle = rm; s.fillRect(-r, -r * 0.16, r * 2, r * 0.16);
  s.restore();
  // rib tips and the ferrule
  for (let i = 0; i <= N; i++) { const gt = s.createRadialGradient(tip(i) - 0.6, -0.6, 0.2, tip(i), 0, 2.6); gt.addColorStop(0, "#d8d8d8"); gt.addColorStop(1, "#2a2a2a"); s.fillStyle = gt; s.beginPath(); s.arc(tip(i), 0, 2.4, 0, TAU); s.fill(); }
  const fe = s.createLinearGradient(-3, 0, 3, 0); fe.addColorStop(0, "#8a8a8a"); fe.addColorStop(0.4, "#e0e0e0"); fe.addColorStop(1, "#3a3a3a");
  s.fillStyle = fe; s.fillRect(-2.5, top - 14, 5, 15);
}
function umbrella(g, x, y, tilt, t, noDrips) {
  const r = UMR;
  g.save();
  g.translate(x, y); g.rotate(tilt);
  // the shaft: chromed steel, a crook handle hidden in the hand
  const sg = g.createLinearGradient(-2.5, 0, 2.5, 0);
  sg.addColorStop(0, "#3a3a3c"); sg.addColorStop(0.35, "#d0d2d6"); sg.addColorStop(1, "#202022");
  g.fillStyle = sg; g.fillRect(-2.2, -4, 4.4, r * 3);
  // the stretchers under the canopy, in its shade
  g.strokeStyle = "rgba(40,30,30,0.85)"; g.lineWidth = 1.3;
  for (const k of [-0.62, -0.3, 0.3, 0.62]) { g.beginPath(); g.moveTo(0, r * 0.32); g.lineTo(k * r, -r * 0.02); g.stroke(); }
  g.drawImage(K.sprite("f04canopy", r * 2 + 48, r * 0.62 + 40, paintCanopy), -r - 24, -r * 0.62 - 30, r * 2 + 48, r * 0.62 + 40);
  g.restore();
  if (noDrips) return;
  // drips off the rib tips: short motion-blurred streaks catching the sky
  const ca = Math.cos(tilt), sa = Math.sin(tilt);
  for (let i = 0; i <= 8; i++) {
    const lx = -r * Math.cos((i / 8) * Math.PI);
    const ex = x + lx * ca, ey = y + lx * sa;
    const per = 0.45 + hash(i, 8) * 0.4, ph = ((t + hash(i, 9) * per) % per) / per;
    const fy = ey + 3 + ph * ph * 260, v = ph * 2;
    const dg = g.createLinearGradient(0, fy - 4 - v * 8, 0, fy + 3);
    dg.addColorStop(0, "rgba(220,228,238,0)"); dg.addColorStop(1, "rgba(230,236,244,0.75)");
    g.fillStyle = dg; g.fillRect(ex - 0.9, fy - 4 - v * 8, 1.8, 7 + v * 8);
    // the bead hanging on the tip, swelling before it falls
    g.fillStyle = "rgba(225,232,240,0.6)"; g.beginPath(); g.ellipse(ex, ey + 2.5, 1.6, 1.6 + (1 - ph) * 1.4, 0, 0, TAU); g.fill();
  }
}
// a soft, motion-blurred, out-of-focus raindrop streak (for the drops right in front of the lens)
const streakSprite = () => K.sprite("f04streak", 24, 200, (s) => {
  const T = tmp(24, 200);
  const gr = T.g.createLinearGradient(0, 10, 0, 190);
  gr.addColorStop(0, "rgba(235,240,248,0)"); gr.addColorStop(0.3, "rgba(235,240,248,0.7)"); gr.addColorStop(0.8, "rgba(240,244,250,1)"); gr.addColorStop(1, "rgba(240,244,250,0)");
  T.g.fillStyle = gr; T.g.fillRect(9, 10, 6, 180);
  if (K.hasFilter()) s.filter = "blur(2.5px)";
  s.drawImage(T.c, 0, 0, 24, 200);
});
function nearRain(g, t, n, seed, alpha, ang) {
  const S = streakSprite();
  g.save();
  for (let i = 0; i < n; i++) {
    const sp = 1700 + hash(i, seed) * 600, L = 150 + hash(i, seed + 1) * 140, w = 6 + hash(i, seed + 2) * 8;
    const span = LH + L + 60, y = ((hash(i, seed + 3) * span + t * sp) % span) - L;
    const x = ((hash(i, seed + 4) * (LW + 160) + y * Math.tan(ang)) % (LW + 160)) - 80;
    g.globalAlpha = alpha * (0.5 + hash(i, seed + 5) * 0.5);
    g.save(); g.translate(x, y); g.rotate(-ang); g.drawImage(S, -w / 2, 0, w, L); g.restore();
  }
  g.restore();
}
// rain hitting the standing water: each drop throws two concentric rings that spread and fade
function puddleRipples(c, t, shelter) {
  const P = pudPaths();
  c.save();
  c.lineWidth = 1.2;
  PUDS.forEach(([cx, cy, rx, ry, sd], j) => {
    if (shelter && Math.abs(cx - shelter[0]) < shelter[1] && cy > shelter[2]) return;
    c.save(); c.clip(P[j]);
    const n = Math.round(3 + rx / 30), asp = ry / rx;
    for (let i = 0; i < n; i++) {
      const per = 0.55 + hash(i, sd * 7) * 0.5, tt = t + hash(i, sd * 7 + 1) * per, cyc = Math.floor(tt / per), ph = tt / per - cyc;
      const x = cx + (hash(i * 3 + cyc, sd + 2) - 0.5) * rx * 1.5, y = cy + (hash(i * 5 + cyc, sd + 3) - 0.5) * ry * 1.2;
      const k = 0.6 + (cy - 300) / 260;
      for (const [d, a] of [[0, 1], [0.22, 0.6]]) {
        const q = ph - d;
        if (q <= 0) continue;
        const r = (2 + q * 22) * k;
        c.strokeStyle = "rgba(228,234,244," + (0.75 * a * (1 - q) * (1 - q)).toFixed(3) + ")";
        c.beginPath(); c.ellipse(x, y, r, r * asp * 1.3, 0, 0, TAU); c.stroke();
      }
    }
    c.restore();
  });
  c.restore();
}
function shotStreetFlash(g, t, lt) {
  const p = eio(seg(lt, 0, 12));
  const um = eio(seg(lt, 3.6, 6.8)); // the umbrella arrives and tilts over the box
  const cam = { x: lerp(480, 455, p), y: lerp(272, 318, p), zoom: lerp(1.0, 1.3, p), shakeT: t * 0.7, shakeAmt: 1.1 };
  const ux = lerp(1130, BOX3.x + 40, um), uy = lerp(130, 238, um), tilt = lerp(-0.08, -0.34, um);
  K.withCamera(g, LW, LH, cam, (c) => {
    c.drawImage(streetPlate(), 0, 0, LW, LH);
    // the far rain: fine and dense, read as a grey veil over the terrace (behind the bin and box)
    c.save(); c.beginPath(); c.rect(-100, -100, LW + 200, 392); c.clip();
    K.rain(c, LW, LH, t * 0.7, { density: 1.6, angle: 0.12, color: "rgba(206,214,224,0.3)", speed: 520, seed: 41, len: 9, width: 0.7 });
    c.restore();
    if (um > 0.02) umbrellaRefl(c, ux, uy, tilt, lt, t);
    puddleRipples(c, t, um > 0.6 ? [BOX3.x + 20, 150, 380] : null);
    // the umbrella's red glow on the wet box top and pavement under it (light through red nylon)
    if (um > 0.05) K.lightPool(c, BOX3.x + 20, BOX3.y - 20, 150, "#ff6a50", { flat: 0.45, intensity: 0.12 * um, mode: "soft-light" });
    // rain everywhere except in the umbrella's shelter (an umbrella-shaped hole carried down to the ground)
    const UG = umbrellaGeom(ux, uy, UMR, tilt);
    c.save();
    c.beginPath();
    c.rect(-200, -200, LW + 400, LH + 400);
    if (um > 0.05) {
      const drift = Math.tan(0.12), gy = LH + 40;
      const L0 = UG.dome[0], R0 = UG.dome[UG.dome.length - 1];
      c.moveTo(L0[0], L0[1]);
      for (const [px, py] of UG.dome) c.lineTo(px, py);
      c.lineTo(R0[0] + (gy - R0[1]) * drift, gy);
      c.lineTo(L0[0] + (gy - L0[1]) * drift, gy);
      c.closePath();
    }
    c.clip("evenodd");
    // the mid rain: the drops in focus around the box, the splash crowns where they land
    K.rain(c, LW, LH, t, { density: 0.9, angle: 0.12, color: "rgba(226,232,240,0.5)", speed: 900, seed: 14, len: 30 });
    K.splashes(c, LW, LH, t, { y0: 292, y1: LH, density: 1.1, color: "rgba(226,232,242,0.42)" });
    c.restore();
    if (um > 0) {
      // held by you, just out of frame: the shaft runs down to your fist and the hoodie cuff at the
      // bottom of the frame
      umbrella(c, ux, uy, tilt, lt);
      const L = (476 - uy) / Math.cos(tilt), fx = ux - Math.sin(tilt) * L, fy = uy + Math.cos(tilt) * L;
      const FB = fist3(), SL = sleeve3();
      if (FB) {
        c.save(); c.translate(fx, fy); c.rotate(tilt);
        c.drawImage(FB, -FIST3.hx * 0.85, -FIST3.hy * 0.85, FB.lw * 0.85, FB.lh * 0.85);
        if (SL) { c.save(); c.translate(2.3 * HR3 * 0.85, 1.5 * HR3 * 0.85); c.rotate(Math.atan2(-0.6, -1.0)); c.scale(0.85, 0.85); c.translate(-SL.lw + 4, -SL.lh / 2); c.drawImage(SL, 0, 0, SL.lw, SL.lh); c.restore(); }
        c.restore();
      }
    }
  });
  // the near rain: a few big drops right in front of the lens, long, motion-blurred and out of focus
  nearRain(g, t, 16, 33, 0.16, 0.12);
  K.fog(g, LW, LH, { y: 210, h: 150, color: "#c8d0da", alpha: 0.2, t: lt, seed: 4 });
}
const streetPlate = () => K.sprite("f04street", LW * RES3, LH * RES3, (s) => { s.scale(RES3, RES3); paintStreet(s); });
// ---- the kitten: the photoreal kit cat with kitten proportions --------------------------------------
// drawCat paints an adult; a kitten's head is far bigger for its body, so the head is painted a second
// time, scaled up about the neck, and feathered over the first (soft radial mask, no seam).
function kitten(g, x, y, s, o = {}, hk = 1.5, sq = 1.18, legs = 1) {
  // ONE drawCat, painted hk times larger into a layer; the body is then composited shrunk back (and a
  // little chubbier, sq), the head at full size, feathered over the neck: big head, small body
  const base = Object.assign({ coat: KITTEN, collar: false, bell: false, pose: "sit", headTurn: 1 }, o, { shadow: false, castShadow: 0 });
  const M = g.getTransform();
  const dev = Math.sqrt(Math.abs(M.a * M.d - M.b * M.c)) || 1;
  const dp = (lx, ly) => [M.a * lx + M.c * ly + M.e, M.b * lx + M.d * ly + M.f];
  const [X, Y] = dp(x, y);
  const R = s * hk * dev;
  const L = K.layer(LW, LH, "f04kitA"), H = K.layer(LW, LH, "f04kitB");
  const cw = L.canvas.width, ch = L.canvas.height;
  const bx = clamp(Math.floor(X - 1.4 * R), 0, cw), by = clamp(Math.floor(Y - 2.5 * R), 0, ch);
  const bw = clamp(Math.ceil(2.8 * R), 0, cw - bx), bh = clamp(Math.ceil(2.75 * R), 0, ch - by);
  if (bw < 2 || bh < 2) return null;
  L.g.setTransform(1, 0, 0, 1, 0, 0); L.g.clearRect(bx, by, bw, bh);
  L.g.setTransform(M.a, M.b, M.c, M.d, M.e, M.f);
  L.g.translate(x, y); L.g.scale(hk, hk); L.g.translate(-x, -y);
  K.drawCat(L.g, x, y, s, base);
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  // the body
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.translate(X, Y); g.scale(sq / hk, legs / (Math.sqrt(sq) * hk)); g.translate(-X, -Y);
  g.drawImage(L.canvas, bx, by, bw, bh, bx, by, bw, bh);
  g.restore();
  // the head, full size, its neck on the small body's neck
  const [Nx, Ny] = dp(x + 0.25 * s * sq, y - 1.3 * s * legs / Math.sqrt(sq));
  const [Bx, By] = dp(x + 0.25 * s * hk, y - 1.3 * s * hk);
  const ox = Nx - Bx, oy = Ny - By;
  const Cx = Nx - M.c * 0.22 * s * hk, Cy = Ny - M.d * 0.22 * s * hk;
  const r1 = 0.43 * s * hk * dev, r0 = 0.25 * s * hk * dev;
  const hx = clamp(Math.floor(Cx - r1), 0, cw), hy = clamp(Math.floor(Cy - r1), 0, ch);
  const hw = clamp(Math.ceil(r1 * 2), 0, cw - hx), hh = clamp(Math.ceil(r1 * 2), 0, ch - hy);
  if (hw < 2 || hh < 2) return null;
  H.g.setTransform(1, 0, 0, 1, 0, 0);
  H.g.clearRect(hx, hy, hw, hh);
  H.g.drawImage(L.canvas, hx - ox, hy - oy, hw, hh, hx, hy, hw, hh);
  H.g.globalCompositeOperation = "destination-in";
  const gr = H.g.createRadialGradient(Cx, Cy, r0, Cx, Cy, r1);
  gr.addColorStop(0, "#000"); gr.addColorStop(1, "rgba(0,0,0,0)");
  H.g.fillStyle = gr; H.g.fillRect(hx, hy, hw, hh);
  H.g.globalCompositeOperation = "source-over";
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(H.canvas, hx, hy, hw, hh, hx, hy, hw, hh); g.restore();
  return { x: Cx, y: Cy, r: r1, dev };
}

// ---- time-sliced per-pixel bakes ------------------------------------------------------------------------
// staged(key, w, h, make) -> canvas | null. make(w, h) -> { passes: [row(y)], finish(g, w, h) }. Each pass
// runs over every row; inside a warm task (SURF_DL > 0) the clock is checked before EVERY row, so a bake
// overruns its slice by one row at most. Outside a warm task it just finishes.
const STG = new Map();
function hyp(a, b, c = 0) { return Math.sqrt(a * a + b * b + c * c); }
function staged(key, w, h, make) {
  let st = STG.get(key);
  if (st && st.c) return st.c;
  if (!st) { st = { S: null, p: 0, row: 0, c: null }; STG.set(key, st); }
  if (!st.S) st.S = make(w, h);
  const P = st.S.passes;
  while (st.p < P.length) {
    while (st.row < h) {
      if (SURF_DL && performance.now() > SURF_DL) return null;
      P[st.p](st.row);
      st.row++;
    }
    st.p++; st.row = 0;
  }
  const c = K.makeCanvas(w, h);
  st.S.finish(c.getContext("2d"), w, h);
  c.lw = w; c.lh = h;
  st.c = c; st.S = null;
  return c;
}
// pixBake(key, w, h, fn(x, y, out)) -> canvas | null: a one-pass staged bake, fn writes rgba 0..255
const PXO = new Float64Array(4);
function pixBake(key, w, h, fn, post) {
  return staged(key, w, h, (W, H) => {
    let img = null;
    return {
      passes: [(y) => {
        if (!img) img = new ImageData(W, H);
        const D = img.data;
        for (let x = 0; x < W; x++) {
          PXO[0] = PXO[1] = PXO[2] = 0; PXO[3] = 255;
          fn(x, y, PXO);
          const i = (y * W + x) * 4;
          D[i] = PXO[0]; D[i + 1] = PXO[1]; D[i + 2] = PXO[2]; D[i + 3] = PXO[3];
        }
      }],
      finish(g) { if (img) g.putImageData(img, 0, 0); if (post) post(g, W, H); },
    };
  });
}

// ---- the photographic kitten: a per-pixel model ----------------------------------------------------------
// A kitten is NOT a small cat: the head is ~45% of the body length, the muzzle short and round, the ears
// oversized, the eyes huge and still blue-grey, the whiskers short and fuzzy. The model is a soft union of
// ellipsoids (a height field in head-radius units) plus ears, eyes, nose and, for the held shot, a child's
// two hands (capsule fingers) in the same depth space, so a finger tip can pass BEHIND his fur. Shading:
// wrap diffuse for fur (light scatters into the coat), occlusion sampled from the height field, a sky rim,
// sheen along the strands; wet = darker, clumped spikes, glossy, beads of water.
const KC = { base: [208, 126, 56], light: [239, 184, 126], stripe: [150, 72, 24], cream: [243, 221, 189] };
function kitModel(o) {
  if (o.layout === "none") return new Float64Array(0);
  const B = [];
  const add = (x, y, rx, ry, z, dz, part = 0) => B.push(x, y, rx, ry, z, dz, part);
  // head: cranium, brow dome, round cheeks, the short muzzle (two whisker pads + chin), nose bridge
  add(0, -0.08, 1.0, 0.9, 0, 1.0, 0);
  add(0, -0.42, 0.62, 0.46, 0.42, 0.52, 0);
  for (let s = -1; s <= 1; s += 2) add(s * 0.47, 0.25, 0.57, 0.46, 0.2, 0.62, 0);
  for (let s = -1; s <= 1; s += 2) add(s * 0.15, 0.37, 0.215, 0.165, 0.78, 0.27, 2);
  add(0, 0.55, 0.16, 0.11, 0.64, 0.22, 2);
  add(0, 0.05, 0.14, 0.32, 0.86, 0.16, 0);
  const L = o.layout;
  if (L === "up") {
    // crouched in the box, looking straight up at you: the back and haunches fall away behind the head
    add(0.05, -1.25, 1.02, 0.95, -0.7, 0.95, 1);
    for (let s = -1; s <= 1; s += 2) add(s * 0.62, -1.42, 0.55, 0.62, -0.85, 0.7, 1);
    add(0, 0.82, 0.62, 0.42, -0.25, 0.62, 5);
    for (let s = -1; s <= 1; s += 2) { add(s * 0.31, 0.78, 0.19, 0.3, -0.05, 0.45, 5); add(s * 0.31, 1.03, 0.2, 0.16, 0.12, 0.3, 3); }
    for (let i = 0; i <= 26; i++) { const a = -1.15 + i * 0.096; add(0.62 + Math.cos(a) * 0.62, -0.62 + Math.sin(a) * 1.15, 0.17, 0.17, -0.35 + i * 0.012, 0.18, 4); }
  } else if (L === "held") {
    add(0, 0.98, 0.74, 0.6, -0.3, 0.85, 5);
    add(0, 1.6, 0.86, 0.62, -0.42, 0.8, 1);
    for (let s = -1; s <= 1; s += 2) { add(s * 0.33, 1.72, 0.17, 0.4, -0.12, 0.36, 5); add(s * 0.34, 2.1, 0.19, 0.15, -0.05, 0.28, 3); }
  } else if (L === "curl") {
    add(1.15, 0.38, 1.55, 0.86, -0.55, 1.05, 1);
    add(2.05, 0.18, 0.82, 0.78, -0.7, 0.9, 1);
    add(-0.08, 0.78, 0.5, 0.18, 0.35, 0.28, 3);
    for (let i = 0; i <= 30; i++) { const q = i / 30; add(lerp(2.55, 0.25, q), 0.86 + Math.sin(q * Math.PI) * 0.16, 0.18, 0.16, 0.1 + q * 0.12, 0.17, 4); }
  }
  return Float64Array.from(B);
}
// a child's hands round his middle (held layout): capsules [ax, ay, bx, by, ra, rb, za, zb, kind]
// kind 0 hand/wrist, 1 proximal phalanx (knuckle), 2 middle, 3 tip (nail). A child's finger is about a
// quarter of a kitten's head wide, so two or three fingers of each hand cross his front; the hands
// themselves are behind him at his sides. Each finger is laid ON the fur: its centre line sits a little
// below the fur surface, so the fur stands up along its edges (the finger sinks in).
function handModel(B) {
  const C = [];
  const furH = (u, v) => { blobsEval(B, u, v); return KG[0] > 0 ? KS * Math.log(KG[0]) + 1.2 : -0.6; };
  for (let s = -1; s <= 1; s += 2) {
    const off = s > 0 ? 0 : 0.11;
    // the back of the hand and the wrist, behind him at the side
    C.push(s * 1.12, 1.5 + off, s * 1.3, 1.98 + off, 0.37, 0.36, -0.05, 0, 0, 0.38);
    C.push(s * 1.3, 2.05 + off, s * 1.66, 2.8, 0.33, 0.35, 0, 0.05, 0, 0.75);
    const F = [[1.22, 0.19, 0.95], [1.56, 0.2, 1], [1.88, 0.19, 0.9], [2.14, 0.16, 0.62]];
    for (let f = 0; f < 4; f++) {
      const [fy, r, lk] = F[f];
      let x = s * 0.9, y = fy + off, a = Math.atan2(0.02 + f * 0.05, -s);
      const segs = [[0.2 * lk, 0.04], [0.34 * lk, 0.07], [0.27 * lk, 0.1]];
      for (let k = 0; k < 3; k++) {
        const [len, bend] = segs[k];
        a += -s * bend;
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        const r0 = r * (1 - k * 0.07), r1 = r * (1 - (k + 1) * 0.07);
        const z0 = Math.max(furH(x, y), -0.2) - r0 * 0.3, z1 = Math.max(furH(x2, y2), -0.2) - r1 * 0.3;
        C.push(x, y, x2, y2, r0, r1, z0, z1, k + 1, 0.62);
        x = x2; y = y2;
      }
    }
  }
  return Float64Array.from(C);
}
const KS = 0.055;
// G: sum, gx, gy, dmin, nbi, wp0..wp5
const KG = new Float64Array(12);
function blobsEval(B, u, v) {
  let sum = 0, gx = 0, gy = 0, dmin = 9, nbi = -1, w0 = 0, w1 = 0, w2 = 0, w3 = 0, w4 = 0, w5 = 0;
  for (let k = 0; k < B.length; k += 7) {
    const rx = B[k + 2], ry = B[k + 3], dx = (u - B[k]) / rx, dy = (v - B[k + 1]) / ry, q = dx * dx + dy * dy;
    if (q > 2.2) continue;
    const e = (Math.sqrt(q) - 1) * (rx < ry ? rx : ry);
    if (e < dmin) { dmin = e; nbi = k; }
    if (q < 1) {
      const s = Math.sqrt(1 - q), dz = B[k + 5], w = Math.exp((B[k + 4] + dz * s - 1.2) / KS), sd = s > 0.04 ? s : 0.04;
      sum += w; gx += (w * dz * dx) / (rx * sd); gy += (w * dz * dy) / (ry * sd);
      const pt = B[k + 6];
      if (pt === 0) w0 += w; else if (pt === 1) w1 += w; else if (pt === 2) w2 += w; else if (pt === 3) w3 += w; else if (pt === 4) w4 += w; else w5 += w;
    }
  }
  KG[0] = sum; KG[1] = gx; KG[2] = gy; KG[3] = dmin; KG[4] = nbi; KG[5] = w0; KG[6] = w1; KG[7] = w2; KG[8] = w3; KG[9] = w4; KG[10] = w5;
}
// E: hit, h, a, inner, nx, ny, nz, fold
const KE = new Float64Array(8);
function earEval(u, v, fringe, R) {
  KE[0] = 0;
  for (let s = -1; s <= 1; s += 2) {
    const ea = s * 0.36, ce = Math.cos(ea), se = Math.sin(ea), du = u - s * 0.6, dv = v + 0.6;
    const es = du * ce + dv * se, et = -(-du * se + dv * ce);
    const Hh = s < 0 ? 0.74 : 0.84;
    if (et < -0.2 || et > Hh + 0.08) continue;
    const tq = clamp(et / Hh), half = 0.4 * Math.pow(1 - tq, 0.85) * (1 - Math.pow(tq, 6) * 0.2) + 0.03;
    const ee = Math.abs(es) - half;
    const a = clamp((-ee + fringe * 0.5) * R / 1.1 + 0.5) * (et < Hh ? 1 : clamp(1 - (et - Hh) * R / 1.5));
    if (a <= 0) continue;
    const inner = clamp((half * 0.72 - Math.abs(es + s * 0.03)) / 0.05) * sm(0.05, 0.22, et) * (1 - sm(0.8, 0.95, tq));
    const cup = inner * (es + s * 0.03) / (half + 0.01);
    let nx = s * 0.35 - cup * 0.5, ny = -0.25, nz = 0.9;
    let fold = 0;
    if (s < 0) { fold = clamp(1 - Math.abs(tq - 0.76) / 0.03); if (tq > 0.76) { nx = -0.2; ny = 0.55; nz = 0.8; } }
    const l = hyp(nx, ny, nz);
    KE[0] = 1; KE[1] = -0.15 + tq * 0.55; KE[2] = a; KE[3] = s < 0 && tq > 0.76 ? 0 : inner; KE[4] = nx / l; KE[5] = ny / l; KE[6] = nz / l; KE[7] = fold;
  }
}
// Hn: hsum, gx, gy, dmin, hmax
const KH = new Float64Array(5);
function handEval(C, u, v) {
  let hsum = 0, gx = 0, gy = 0, dm = 9;
  for (let k = 0; k < C.length; k += 10) {
    const ax = C[k + 2] - C[k], ay = C[k + 3] - C[k + 1], l2 = ax * ax + ay * ay;
    const tt = clamp(((u - C[k]) * ax + (v - C[k + 1]) * ay) / l2), dx = u - (C[k] + ax * tt), dy = v - (C[k + 1] + ay * tt);
    const r = C[k + 4] + (C[k + 5] - C[k + 4]) * tt, d = Math.sqrt(dx * dx + dy * dy);
    if (d - r < dm) dm = d - r;
    if (d < r) {
      const fl = C[k + 9], s = Math.sqrt(1 - (d * d) / (r * r)), hh = C[k + 6] + (C[k + 7] - C[k + 6]) * tt + r * s * fl, w = Math.exp((hh - 1.5) / 0.05), sd = s > 0.05 ? s : 0.05;
      hsum += w; gx += (w * dx * fl) / (r * sd); gy += (w * dy * fl) / (r * sd);
    }
  }
  KH[0] = hsum; KH[1] = gx; KH[2] = gy; KH[3] = dm; KH[4] = hsum > 0 ? 0.05 * Math.log(hsum) + 1.5 : -5;
}
// A: r, g, b
const KA = new Float64Array(4);
function furAlbedo(u, v, strand, wet, curl, seed) {
  const ws = KG[5] + KG[6] + KG[7] + KG[8] + KG[9] + KG[10] || 1;
  const w0 = KG[5] / ws, w1 = KG[6] / ws, w2 = KG[7] / ws, w3 = KG[8] / ws, w4 = KG[9] / ws, w5 = KG[10] / ws;
  // tabby: the forehead M, cheek swirls, bars over the back, rings on the tail
  const wq = tN(u * 3.2, v * 3.2, seed + 5) * 0.12, au = Math.abs(u);
  let st = 0;
  if (v < -0.28 && au < 0.5) st = sm(0.55, 0.85, Math.cos((u + wq) * Math.PI * 4.6)) * sm(-0.28, -0.5, v) * (1 - sm(0.3, 0.5, au));
  if (au > 0.5 && v > -0.2 && v < 0.5) { const c = sm(0.5, 0.9, Math.sin((v - 0.42 * (au - 0.5) + wq) * Math.PI * 7.5)) * sm(0.5, 0.65, au); if (c > st) st = c; }
  if (v < -0.62 && au < 0.75) { const c = sm(0.6, 0.9, Math.cos((Math.atan2(v + 0.1, u) + wq) * 14)) * sm(-0.6, -0.85, v) * 0.85; if (c > st) st = c; }
  const stBody = sm(0.45, 0.85, Math.sin((curl ? u * 3.6 : v * 5.2) + Math.sin(u * 2.2) * 0.7 + wq * 4));
  const stTail = sm(0.3, 0.8, Math.sin((u + v) * 9 + wq * 3));
  const stripe = st * w0 + stBody * w1 * 0.9 + stTail * w4;
  const ex = au - 0.36, ey = v, eyeRing = Math.exp(-(ex * ex + ey * ey) / 0.035);
  const creamK = clamp(w2 + w5 * 0.85 + w3 + eyeRing * 0.45 + sm(0.25, 0.6, v) * w0 * 0.6);
  const lk = 0.25 * (1 - stripe), sk = stripe * 0.55;
  let r = KC.base[0] + (KC.light[0] - KC.base[0]) * lk, g = KC.base[1] + (KC.light[1] - KC.base[1]) * lk, b = KC.base[2] + (KC.light[2] - KC.base[2]) * lk;
  r += (KC.stripe[0] - r) * sk; g += (KC.stripe[1] - g) * sk; b += (KC.stripe[2] - b) * sk;
  r += (KC.cream[0] - r) * creamK; g += (KC.cream[1] - g) * creamK; b += (KC.cream[2] - b) * creamK;
  const fk = 0.84 + strand * 0.3 - wet * 0.14 + wet * strand * 0.16;
  r *= fk; g *= fk; b *= fk;
  if (wet > 0) { const wk = 1 - wet * 0.32; r *= wk; g *= wk * 0.86; b *= wk * 0.74; }
  KA[0] = r; KA[1] = g; KA[2] = b;
}
// eyes: returns 1 if the pixel is eyeball (KA set), 0 otherwise (KA darkened round the lids)
function eyeEval(u, v, open, pupil, ER, seed) {
  for (let s = -1; s <= 1; s += 2) {
    const ta = -s * 0.12, ct = Math.cos(ta), stt = Math.sin(ta);
    const du = u - s * 0.36, dv = v + 0.0, eu = (du * ct + dv * stt) / 0.215, ev = (-du * stt + dv * ct) / 0.19;
    const q = eu * eu + ev * ev;
    if (q > 1.6) continue;
    const lidT = -1 + (1 - open) * 1.85 + 0.12 * eu * eu, lidB = 0.93 - 0.08 * eu * eu;
    const inEye = q < 1 && ev > lidT && ev < lidB;
    if (!inEye) {
      const margin = Math.min(1 - Math.sqrt(q) + 0.12, ev - lidT + 0.1, lidB - ev + 0.1);
      if (q < 2.2 && ev < 0) { const k = (1 - sm(1, 2.2, q)) * 0.22; KA[0] *= 1 - k; KA[1] *= 1 - k; KA[2] *= 1 - k; }
      if (q < 1.35) { const k = clamp(1 - Math.abs(margin) / 0.11) * (q < 1.15 ? 0.85 : 0.3); KA[0] += (38 - KA[0]) * k; KA[1] += (22 - KA[1]) * k; KA[2] += (12 - KA[2]) * k; }
      if (open < 0.2 && Math.abs(ev - lidT) < 0.1 && q < 1.05) { KA[0] *= 0.35; KA[1] *= 0.3; KA[2] *= 0.28; }
      continue;
    }
    const rr = Math.sqrt(q), ang = Math.atan2(ev, eu), pr = pupil;
    const fib = tN(ang * 9, rr * 3, seed + 9 + s) * 0.5 + 0.5, fib2 = tN(ang * 26, rr * 6, seed + 11) * 0.5 + 0.5;
    const ring = sm(0.95, pr, rr);
    let ir = (62 + 30 * ring) * (0.78 + fib * 0.32 + fib2 * 0.14), ig = (76 + 30 * ring) * (0.8 + fib * 0.3 + fib2 * 0.12), ib = (88 + 26 * ring) * (0.82 + fib * 0.26 + fib2 * 0.1);
    const limb = sm(0.78, 1, rr) * 0.8; ir += (34 - ir) * limb; ig += (44 - ig) * limb; ib += (56 - ib) * limb;
    const pup = 1 - sm(pr - 0.04, pr + 0.03, rr); ir += (6 - ir) * pup; ig += (7 - ig) * pup; ib += (9 - ib) * pup;
    const lsh = (1 - 0.7 * (1 - sm(lidT, lidT + 0.7, ev))) * (1 - 0.35 * sm(0.55, 1, rr)); ir *= lsh; ig *= lsh; ib *= lsh;
    // the cornea mirrors the sky (and whatever is over him): a broad soft band, then the window
    const wx = eu + 0.3, wy = ev + 0.38, win = Math.exp(-(wx * wx / 0.012 + wy * wy / 0.008)) * 0.95 * open;
    const band = sm(0.1, -0.7, ev) * 0.22;
    ir += (ER[0] - ir) * band + 255 * win; ig += (ER[1] - ig) * band + 255 * win; ib += (ER[2] - ib) * band + 255 * win;
    const sx = eu - 0.38, sy = ev - 0.4, sec = Math.exp(-(sx * sx / 0.004 + sy * sy / 0.003)) * 0.3 * open; ir += 220 * sec; ig += 225 * sec; ib += 230 * sec;
    const my = ev - lidB + 0.06, men = Math.exp(-(my * my) / 0.0012) * 0.4 * sm(0.9, 0.3, Math.abs(eu)); ir += 200 * men; ig += 205 * men; ib += 210 * men;
    KA[0] = ir; KA[1] = ig; KA[2] = ib;
    return 1;
  }
  return 0;
}
// nose leather, philtrum, the little mouth: returns 2 when it is leather
function noseEval(u, v, wet, mouth) {
  let m = 0;
  if (mouth > 0) {
    // a mew: the jaw drops, a dark mouth with the pink tongue low in it, the lower lip catching light
    const mx = u / (0.105 * (0.7 + mouth * 0.3)), my = (v - 0.47 - mouth * 0.03) / (0.085 * mouth + 0.01), q = mx * mx + my * my;
    if (q < 1.3) {
      const k = clamp((1 - q) * 6), tongue = sm(0.0, 0.7, my) * k;
      KA[0] += (40 + 150 * tongue - KA[0]) * k; KA[1] += (16 + 70 * tongue - KA[1]) * k; KA[2] += (18 + 70 * tongue - KA[2]) * k;
      if (q > 0.75 && my > 0.3) { const l = clamp((q - 0.75) * 4) * clamp((1.3 - q) * 4); KA[0] += 40 * l; KA[1] += 30 * l; KA[2] += 26 * l; }
      if (k > 0.3) return 2;
    }
  }
  const nu = u / 0.125, nv = (v - 0.25) / 0.09;
  if (nv > -1 && nv < 1.1 && Math.abs(nu) < 1.2) {
    const halfw = 1 + (0.18 - 1) * sm(-1, 1, nv) + 0.05;
    const k = clamp((halfw - Math.abs(nu)) * 6) * clamp((1.05 - nv) * 8) * clamp((nv + 1) * 8);
    if (k > 0) {
      const ax = Math.abs(nu) - 0.45, ay = nv - 0.35, nos = Math.exp(-(ax * ax / 0.03 + ay * ay / 0.04));
      const r = 196 * (1 - nos * 0.7), g = 112 * (1 - nos * 0.75), b = 102 * (1 - nos * 0.75);
      const hx = nu + 0.15, hy = nv + 0.55, sh = Math.exp(-(hx * hx / 0.12 + hy * hy / 0.05)) * (0.4 + wet * 0.4);
      KA[0] += (r + 180 * sh - KA[0]) * k; KA[1] += (g + 170 * sh - KA[1]) * k; KA[2] += (b + 165 * sh - KA[2]) * k;
      if (k > 0.5) m = 2;
    }
  }
  if (Math.abs(u) < 0.016 && v > 0.33 && v < 0.385) { KA[0] *= 0.45; KA[1] *= 0.4; KA[2] *= 0.38; }
  if (Math.abs(u) < 0.13 && v > 0.36 && v < 0.47) {
    const my = 0.385 + 1.44 * u * u + 0.092 * Math.abs(u), k = clamp(1 - Math.abs(v - my) / 0.013) * 0.8;
    KA[0] += (70 - KA[0]) * k; KA[1] += (38 - KA[1]) * k; KA[2] += (30 - KA[2]) * k;
  }
  return m;
}
// a child's skin: warm, a little blotchy; knuckle creases across the finger backs, a soft knuckle pad
function skinAlbedo(C, u, v, seed) {
  KA[3] = 0;
  const blot = tN(u * 9, v * 9, seed + 31) * 0.5 + 0.5;
  let r = 212 + blot * 12, g = 158 + blot * 8, b = 134 + blot * 6, cre = 0;
  for (let k = 0; k < C.length; k += 10) {
    if (!C[k + 8]) continue;
    let dx = C[k + 2] - C[k], dy = C[k + 3] - C[k + 1]; const dl = Math.sqrt(dx * dx + dy * dy); dx /= dl; dy /= dl;
    const al = (u - C[k]) * dx + (v - C[k + 1]) * dy, ac = -(u - C[k]) * dy + (v - C[k + 1]) * dx, rr = C[k + 4] * 0.8;
    if (Math.abs(ac) > rr || Math.abs(al) > 0.06) continue;
    const bow = ac * ac * 2.2, fall = 1 - Math.abs(ac) / rr;
    for (let kk = -1; kk <= 1; kk++) { const d = al - kk * 0.017 - bow; cre += Math.exp(-(d * d) / 0.000025) * (kk ? 0.5 : 0.8) * fall; }
    const kn = Math.exp(-(al * al + ac * ac) / 0.004); r += kn * 6; g -= kn * 10; b -= kn * 8;
  }
  for (let k = 0; k < C.length; k += 10) {
    if (C[k + 8] !== 3) continue;
    const dx = u - C[k + 2], dy = v - C[k + 3], tip = Math.exp(-(dx * dx + dy * dy) / 0.02);
    r += tip * 6; g -= tip * 16; b -= tip * 12;
  }
  // the nails on the finger tips: pale, glossy, a pink bed, the white free edge, the cuticle
  for (let k = 0; k < C.length; k += 10) {
    if (C[k + 8] !== 3) continue;
    let dx = C[k + 2] - C[k], dy = C[k + 3] - C[k + 1]; const dl = Math.sqrt(dx * dx + dy * dy); dx /= dl; dy /= dl;
    const al = ((u - C[k]) * dx + (v - C[k + 1]) * dy) / dl, ac = (-(u - C[k]) * dy + (v - C[k + 1]) * dx) / C[k + 5];
    const nw = 0.62 * Math.sqrt(clamp(1 - Math.pow((al - 0.78) / 0.42, 2)));
    if (al < 0.36 || al > 1.2 || Math.abs(ac) > nw) continue;
    const e = clamp((nw - Math.abs(ac)) * 8), cut = sm(0.36, 0.46, al), free = sm(0.98, 1.08, al);
    r += (232 - r) * e * cut; g += (186 - g) * e * cut; b += (176 - b) * e * cut;
    r += (246 - r) * free * e; g += (236 - g) * free * e; b += (226 - b) * free * e;
    const cu = Math.exp(-((al - 0.4) ** 2) / 0.0015) * e; r *= 1 - cu * 0.25; g *= 1 - cu * 0.32; b *= 1 - cu * 0.3;
    KA[3] = Math.max(KA[3], e * cut);
  }
  cre = clamp(cre);
  KA[0] = r * (1 - cre * 0.32); KA[1] = g * (1 - cre * 0.4); KA[2] = b * (1 - cre * 0.4);
}
const OCC = [1, 0, 0.6, -1, 0, 0.6, 0, 1, 0.6, 0, -1, 0.6, 2.5, 2.5, 0.35, -2.5, 2.5, 0.35, 2.5, -2.5, 0.35, -2.5, -2.5, 0.35, 0, 4, 0.25, 4, 0, 0.25, -4, 0, 0.25, 0, -4, 0.25];
// kitBake(key, o): o = { R, W, H, hx, hy, layout, wet, eyes (0 closed .. 1 open), pupil, rot, light:[x,y,z],
//   key:[r,g,b], amb:[r,g,b], rim:[r,g,b], rimDir:[x,y], eyeRefl, earGlow, hands, seed, post(g) }
function kitBake(key, o) {
  const R = o.R, W = Math.ceil(o.W), H = Math.ceil(o.H);
  return staged(key, W, H, () => {
    const B = kitModel(o), C = o.caps ? o.caps : o.hands ? handModel(B) : new Float64Array(0), noCat = B.length === 0;
    const N = W * H, wet = o.wet || 0, open = o.eyes == null ? 1 : o.eyes, seed = o.seed || 7, curl = o.layout === "curl", pupil = o.pupil || 0.46;
    const HT = new Float32Array(N).fill(-5), AL = new Float32Array(N), NX = new Float32Array(N), NY = new Float32Array(N), NZ = new Float32Array(N);
    const CR = new Float32Array(N), CG = new Float32Array(N), CB = new Float32Array(N), MAT = new Uint8Array(N), SP = new Float32Array(N), HD = new Float32Array(N).fill(9);
    const lv = o.light || [-0.25, -0.7, 0.65], ll = hyp(lv[0], lv[1], lv[2]), LX = lv[0] / ll, LY = lv[1] / ll, LZ = lv[2] / ll;
    const hl = hyp(LX, LY, LZ + 1), HX = LX / hl, HY = LY / hl, HZ = (LZ + 1) / hl;
    const KEY = o.key || [1, 1, 1], AMB = o.amb || [0.35, 0.36, 0.4], RIM = o.rim || [0.5, 0.55, 0.65], RD = o.rimDir || [0.6, -0.8];
    const ER = RGB(o.eyeRefl || "#c8d0dc"), EG = o.earGlow || 0, mouth = o.mouth || 0, CL = o.clip || [0, 0, W, H];
    const cr = Math.cos(o.rot || 0), sr = Math.sin(o.rot || 0), hands = C.length > 0;
    let img = null;
    const px1 = (x, y) => {
      const i = y * W + x;
      const u0 = (x + 0.5 - o.hx) / R, v0 = (y + 0.5 - o.hy) / R;
      const u = u0 * cr + v0 * sr, v = -u0 * sr + v0 * cr;
      blobsEval(B, u, v);
      let sum = KG[0];
      const dmin = KG[3];
      const earZone = !noCat && v < -0.25 && v > -1.75 && u < 1.35 && u > -1.35, handZone = hands && (noCat || v > 0.6);
      if (dmin > 0.14 && !earZone && !handZone) return;
      // fur strands radiate from the nose over the head and run back from it over the body
      const fa = Math.atan2(v - 0.26, u), fr = Math.sqrt(u * u + (v - 0.26) * (v - 0.26));
      const across = fa * (fr > 0.35 ? fr : 0.35) * R, along = fr * R;
      const n1 = tN(across / 1.1, along / 3.2, seed) * 0.5 + 0.5, n2 = tN(across / 3.2, along / 5.5, seed + 1) * 0.5 + 0.5, n3 = tN(across / 7, along / 9, seed + 2) * 0.5 + 0.5;
      const cl = sm(0.25, 0.75, n3 * 0.55 + n2 * 0.45);
      const strand = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2) * (1 - wet) + (cl * 0.85 + n1 * 0.15) * wet;
      // the silhouette is hair, not a line: the edge breaks into strands (spiky clumps when wet)
      const fringe = (0.035 + wet * 0.07) * (strand - 0.5) * 2 - 0.012;
      let hK = -5, a = 0, nx = 0, ny = 0, nz = 1, mat = 0, fold = 0, inner = 0;
      if (sum > 0) {
        hK = KS * Math.log(sum) + 1.2;
        const gx = KG[1] / sum, gy = KG[2] / sum, l = Math.sqrt(gx * gx + gy * gy + 1); nx = gx / l; ny = gy / l; nz = 1 / l;
        a = clamp((-dmin + fringe) * R / (dmin > -0.05 ? 1.4 : 1.1) + 0.5);
      } else if (dmin < 0.12 && KG[4] >= 0) {
        a = clamp((-dmin + fringe) * R / 1.4 + 0.5);
        if (a > 0) { const k = KG[4], dx = u - B[k], dy = v - B[k + 1], l = Math.sqrt(dx * dx + dy * dy) || 1; hK = B[k + 4]; nx = dx / l * 0.98; ny = dy / l * 0.98; nz = 0.2; }
      }
      if (earZone) {
        earEval(u, v, fringe, R);
        if (KE[0] && (KE[1] > hK || a < 0.05)) {
          hK = KE[1]; if (KE[2] > a) a = KE[2]; inner = KE[3]; mat = inner > 0.5 ? 3 : 0; nx = KE[4]; ny = KE[5]; nz = KE[6]; fold = KE[7];
          KG[5] = 1; KG[6] = KG[7] = KG[8] = KG[9] = KG[10] = 0; sum = 1;
        }
      }
      if (handZone) {
        handEval(C, u, v);
        HD[i] = KH[3];
        const hh = KH[4];
        if (KH[0] > 0) {
          const furOver = a > 0.5 && hK > hh - 0.12 && KH[3] > -0.05 && strand > 0.42;
          if ((hh > hK || a < 0.5) && !furOver) {
            const gx = KH[1] / KH[0], gy = KH[2] / KH[0], l = Math.sqrt(gx * gx + gy * gy + 1);
            nx = gx / l; ny = gy / l; nz = 1 / l; hK = hh; mat = 4; a = clamp(-KH[3] * R + 0.5);
          }
        }
      }
      if (a <= 0) return;
      if (mat === 0 && sum > 0) {
        furAlbedo(u, v, strand, wet, curl, seed);
        if (fold > 0) { KA[0] *= 1 - fold * 0.55; KA[1] *= 1 - fold * 0.6; KA[2] *= 1 - fold * 0.6; }
        if (!curl || u < 0.9) {
          if (eyeEval(u, v, open, pupil, ER, seed)) { mat = 1; nx = 0; ny = 0; nz = 1; }
          else { const m = noseEval(u, v, wet, mouth); if (m) mat = m; }
        }
        SP[i] = strand;
      } else if (mat === 3) {
        const hair = sm(0.55, 0.9, tN(u * 60, v * 14, seed + 21) * 0.5 + 0.5) * 0.6;
        KA[0] = 190 + 46 * hair; KA[1] = 118 + 88 * hair; KA[2] = 110 + 70 * hair; SP[i] = 0.5;
      } else if (mat === 4) {
        skinAlbedo(C, u, v, seed);
        SP[i] = KA[3];
      } else { KA[0] = KC.base[0]; KA[1] = KC.base[1]; KA[2] = KC.base[2]; }
      HT[i] = hK; AL[i] = a; NX[i] = nx; NY[i] = ny; NZ[i] = nz; CR[i] = KA[0]; CG[i] = KA[1]; CB[i] = KA[2]; MAT[i] = mat;
    };
    const P1 = (y) => { if (y < CL[1] || y >= CL[3]) return; for (let x = CL[0]; x < CL[2]; x++) px1(x, y); };
    const px2 = (x, y, D) => {
      const i = y * W + x, a = AL[i], m = MAT[i], o4 = i * 4;
      if (HT[i] < -4 || a <= 0.002) { D[o4 + 3] = 0; return; }
      const h = HT[i];
      // occlusion: how much higher the surroundings stand (cavities, the head over the body, fingers)
      let occ = 0;
      const st = R * 0.09;
      for (let oi = 0; oi < OCC.length; oi += 3) {
        const xx = x + Math.round(OCC[oi] * st), yy = y + Math.round(OCC[oi + 1] * st);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const d = HT[yy * W + xx] - h;
        if (d > 0) occ += (d < 0.22 ? d : 0.22) * OCC[oi + 2];
      }
      if (m !== 4 && hands) { const hd = HD[i]; if (hd < 0.18) occ += (1 - hd / 0.18) * 0.55; }
      const ao = clamp(1 - occ * 1.5, 0.3, 1);
      const nx = NX[i], ny = NY[i], nz = NZ[i], ndl = nx * LX + ny * LY + nz * LZ;
      const ndh = Math.max(0, nx * HX + ny * HY + nz * HZ);
      let r = CR[i], g = CG[i], b = CB[i], dr = 1, dg = 1, db = 1, sr = 0, sg = 0, sb = 0;
      if (m === 4) {
        // skin: wrap lighting with a warm terminator (subsurface), the thin edges glow red
        const wrapD = clamp((ndl + 0.3) / 1.3), sss = clamp((ndl + 0.5) / 1.5) - wrapD, edge = Math.pow(1 - nz, 2.2);
        dr = AMB[0] + KEY[0] * wrapD + sss * 0.55 + edge * 0.55; dg = AMB[1] + KEY[1] * wrapD + sss * 0.12 + edge * 0.16; db = AMB[2] + KEY[2] * wrapD + sss * 0.06 + edge * 0.1;
        // cool rain-wet specular on the backs (the grey sky)
        const sp = Math.pow(ndh, 22) * 0.28 * (0.3 + wet * 0.7) + Math.pow(ndh, 5) * 0.05 + Math.pow(ndh, 60) * SP[i] * 0.9;
        sr = sp * 210; sg = sp * 220; sb = sp * 236;
      } else if (m !== 1) {
        // fur: wrap diffuse (light scatters into the coat), a cool sky rim on the edges
        const wrapD = clamp((ndl + 0.42) / 1.42);
        dr = AMB[0] + KEY[0] * wrapD; dg = AMB[1] + KEY[1] * wrapD; db = AMB[2] + KEY[2] * wrapD;
        const rimK = Math.pow(1 - nz, 2.4) * clamp(0.5 + nx * RD[0] + ny * RD[1]) * 120;
        sr = RIM[0] * rimK; sg = RIM[1] * rimK; sb = RIM[2] * rimK;
        const sp = Math.pow(ndh, 14 + wet * 40) * (0.05 + wet * 0.26) * (0.2 + SP[i] * 1.1);
        sr += sp * 230; sg += sp * 228; sb += sp * 226;
        if (m === 3) { dr += 0.35 * EG; dg += 0.12 * EG; db += 0.08 * EG; }
        if (m === 0 || m === 3) { const tip = Math.pow(clamp(1 - nz), 1.5); dr += tip * (0.18 + KEY[0] * 0.12); dg += tip * (0.14 + KEY[1] * 0.1); db += tip * (0.12 + KEY[2] * 0.08); }
      }
      if (m === 1) { const k = 0.55 + 0.45 * ao; r *= k; g *= k; b *= k; }
      else { r = r * dr * ao + sr; g = g * dg * ao + sg; b = b * db * ao + sb; }
      // beads of rain caught in the coat and on the hands: tiny lenses, a dark rim, a sky glint
      if (wet > 0.05 && m !== 1) {
        const cx = Math.floor(x / 6), cy = Math.floor(y / 6), hs = hash(cx * 131 + cy * 7, seed + 3);
        if (hs < (m === 4 ? 0.035 : 0.1) * wet) {
          const bx = (cx + 0.2 + hash(cx, cy + seed) * 0.6) * 6, by = (cy + 0.2 + hash(cy, cx + seed) * 0.6) * 6, br = 0.9 + hash(cx + cy, 5) * 1.4;
          const ddx = x + 0.5 - bx, ddy = y + 0.5 - by, dd = Math.sqrt(ddx * ddx + ddy * ddy) / br;
          if (dd < 1) {
            const rimd = sm(0.6, 1, dd) * 0.5, gx = ddx + br * 0.35, gy = ddy + br * 0.4, gl = Math.exp(-(gx * gx + gy * gy) / (br * br * 0.08)) * 0.9;
            r = r * (1 - rimd) + 255 * gl; g = g * (1 - rimd) + 255 * gl; b = b * (1 - rimd) + 255 * gl;
          }
        }
      }
      D[o4] = r; D[o4 + 1] = g; D[o4 + 2] = b; D[o4 + 3] = a * 255;
    };
    const P2 = (y) => { if (!img) img = new ImageData(W, H); if (y < CL[1] || y >= CL[3]) return; const D = img.data; for (let x = CL[0]; x < CL[2]; x++) px2(x, y, D); };
    return {
      passes: [P1, P2],
      finish(g) {
        if (img) g.putImageData(img, 0, 0);
        g.save();
        g.translate(o.hx, o.hy); g.rotate(o.rot || 0);
        if (noCat) g.globalAlpha = 0;
        // short fuzzy kitten whiskers from the pads, and two over each eye
        const RW = K.rng(key + "wh");
        g.lineCap = "round";
        for (let s = -1; s <= 1; s += 2) {
          for (let k = 0; k < 6; k++) {
            const x0 = s * (0.17 + RW() * 0.12) * R, y0 = (0.33 + k * 0.022 + RW() * 0.02) * R, len = (0.42 + RW() * 0.3) * R * (1 - wet * 0.2);
            const a0 = (k - 2.5) * 0.11 + (RW() - 0.5) * 0.1, droop = (0.06 + RW() * 0.08 + wet * 0.1) * R;
            const x1 = x0 + s * Math.cos(a0) * len, y1 = y0 + Math.sin(a0) * len + droop;
            g.strokeStyle = `rgba(248,240,228,${(0.3 + RW() * 0.25).toFixed(2)})`; g.lineWidth = Math.max(0.5, R * 0.011);
            g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + (x1 - x0) * 0.55, y0 + (y1 - y0) * 0.3, x1, y1); g.stroke();
          }
          if (o.layout === "curl") continue;
          for (let k = 0; k < 2; k++) {
            const x0 = s * (0.26 + k * 0.1) * R, y0 = -0.27 * R, x1 = x0 + s * 0.22 * R, y1 = y0 - (0.18 - k * 0.04) * R;
            g.strokeStyle = "rgba(240,226,206,0.32)"; g.lineWidth = Math.max(0.4, R * 0.008);
            g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + s * 0.1 * R, y0 - 0.14 * R, x1, y1); g.stroke();
          }
        }
        g.restore();
        if (o.clip) {
          // a patch (blink, mew): feathered so it lays over the full bake without a seam
          g.globalCompositeOperation = "destination-in";
          const cx = (CL[0] + CL[2]) / 2, cy = (CL[1] + CL[3]) / 2, rr = Math.min(CL[2] - CL[0], CL[3] - CL[1]) / 2;
          g.save(); g.translate(cx, cy); g.scale((CL[2] - CL[0]) / 2 / rr, (CL[3] - CL[1]) / 2 / rr);
          const fg = g.createRadialGradient(0, 0, rr * 0.55, 0, 0, rr); fg.addColorStop(0, "#000"); fg.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = fg; g.fillRect(-rr, -rr, rr * 2, rr * 2); g.restore();
          g.globalCompositeOperation = "source-over";
        }
        if (o.post) o.post(g, W, H);
      },
    };
  });
}

// ---- shot 4: straight down into the box -------------------------------------------------------------------
// A true overhead: the camera looks straight down the box's axis, so the four inner walls fan out evenly
// from the newspaper floor to the rim. Light: the grey sky through the red umbrella held over the lens, a
// big soft source from above leaning a little from the top of frame. Everything static is ONE per-pixel
// bake (time-sliced): soggy newsprint (cockled, translucent where soaked, the ink bled), wet kraft walls
// with water wicking up from the floor, the cut rim, the wet pavement round it.
const B4 = { cx: 480, cy: 284, hw: 268, hh: 182, k: 1.66 };
const KIT4 = { x: 486, y: 322, R: 58 };
// the newspaper's type as an ink mask (black on white), drawn with canvas text once
function paintNewsInk(s, w, h) {
  s.fillStyle = "#fff"; s.fillRect(0, 0, w, h);
  const R = K.rng("f04news");
  s.fillStyle = "#000"; s.font = "700 38px Georgia, 'Times New Roman', serif"; s.textBaseline = "top";
  s.fillText("THE CATFORD GAZETTE", 30, 18);
  s.fillRect(26, 64, w - 52, 2.5); s.fillRect(26, 70, w - 52, 1);
  s.font = "700 22px Georgia, serif"; s.fillText("Bake sale raises record sum", 30, 80);
  const cols = 4, cw = (w - 52) / cols;
  for (let c = 0; c < cols; c++) {
    const x0 = 28 + c * cw;
    if (c) s.fillRect(x0 - 6, 114, 1, h - 130);
    for (let y = 116; y < h - 16; y += 8) {
      if (c === 1 && y > 168 && y < 312) continue;
      let x = x0;
      while (x < x0 + cw - 12) { const wl = 6 + R() * 24; s.globalAlpha = 0.55 + R() * 0.35; s.fillRect(x, y, Math.min(wl, x0 + cw - 12 - x), 3.4); x += wl + 3.2; }
      s.globalAlpha = 1;
    }
  }
  const px0 = 28 + cw, py0 = 172, pw = cw * 2 - 14, ph = 136;
  for (let y = 0; y < ph; y += 4) for (let x = 0; x < pw; x += 4) {
    const v = clamp(0.5 + 0.4 * Math.sin(x * 0.03 + 1) * Math.cos(y * 0.05) + tN(x / 30, y / 30, 7) * 0.4 - (y > ph * 0.6 ? 0.25 : 0));
    s.beginPath(); s.arc(px0 + x + 2, py0 + y + 2, 1.9 * v + 0.2, 0, TAU); s.fill();
  }
}
const SHEET = { x: 232, y: 116, w: 500, h: 336, rot: 0.035 };
function boxTopBake() {
  return staged("f04boxtop5", LW, LH, (W, H) => {
    let img = null, INK = null, BLR = null;
    const IW = 512, IH = 400;
    const inkLoad = () => {
      const c1 = K.makeCanvas(IW, IH), g1 = c1.getContext("2d", { willReadFrequently: true }); // read back below: keep it off the GPU
      paintNewsInk(g1, IW, IH);
      INK = g1.getImageData(0, 0, IW, IH).data;
      const c2 = K.makeCanvas(IW, IH), g2 = c2.getContext("2d", { willReadFrequently: true });
      g2.fillStyle = "#fff"; g2.fillRect(0, 0, IW, IH);
      if (K.hasFilter()) g2.filter = "blur(3.5px)";
      g2.drawImage(c1, 0, 0);
      BLR = g2.getImageData(0, 0, IW, IH).data;
    };
    const cs = Math.cos(SHEET.rot), sn = Math.sin(SHEET.rot);
    const sheetUV = (x, y) => { const dx = x - (SHEET.x + SHEET.w / 2), dy = y - (SHEET.y + SHEET.h / 2); return [(dx * cs + dy * sn) / SHEET.w + 0.5, (-dx * sn + dy * cs) / SHEET.h + 0.5]; };
    const ink = (u, v, A) => { const x = Math.min(IW - 1, Math.max(0, (u * IW) | 0)), y = Math.min(IH - 1, Math.max(0, (v * IH) | 0)); return 1 - A[(y * IW + x) * 4] / 255; };
    // cockle: the soaked sheet buckles into soft ridges, plus the old fold down the middle
    const cock = (x, y) => tF(x / 70, y / 55, 51, 3) * 0.7 + tF(x / 24, y / 30, 53, 2) * 0.18 + Math.exp(-(((x - 480) / 7) ** 2)) * 0.25;
    const soakAt = (x, y) => {
      const n = tF(x / 120, y / 95, 61, 3) * 0.5 + 0.5;
      const kd = Math.hypot((x - KIT4.x) / 150, (y - KIT4.y - 10) / 120);
      const edge = Math.min(x - (B4.cx - B4.hw), (B4.cx + B4.hw) - x, y - (B4.cy - B4.hh), (B4.cy + B4.hh) - y);
      return clamp(n * 1.25 - 0.32 + (1 - sm(0.4, 1.1, kd)) * 0.75 + (1 - sm(0, 70, edge)) * 0.35);
    };
    const px = (x, y, D) => {
      const o4 = (y * W + x) * 4;
      const dx = x + 0.5 - B4.cx, dy = y + 0.5 - B4.cy, ax = Math.abs(dx) / B4.hw, ay = Math.abs(dy) / B4.hh, sF = Math.max(ax, ay);
      let r, g, b;
      if (sF <= 1) {
        // the floor: newspaper over wet kraft board
        const [u, v] = sheetUV(x + 0.5, y + 0.5);
        const onSheet = u > 0 && u < 1 && v > 0 && v < 1;
        const soak = soakAt(x, y);
        const h0 = cock(x, y), hx = cock(x + 1.5, y) - h0, hy = cock(x, y + 1.5) - h0;
        const nx = -hx * 9, ny = -hy * 9, nl = Math.hypot(nx, ny, 1);
        const lit = 0.32 + 0.78 * (nx * 0.1 - ny * 0.45 + 0.88) / nl;
        if (onSheet) {
          const i0 = ink(u, v, INK), i1 = ink(u, v, BLR);
          const inkK = lerp(i0, Math.min(1, i1 * 1.35), soak * 0.85);
          // dry newsprint is warm grey; soaked it goes dark, grey and translucent (the board shows through)
          const fib = tN(x / 3, y / 9, 57) * 0.04;
          r = lerp(204, 118, soak) * (1 + fib); g = lerp(198, 104, soak) * (1 + fib); b = lerp(182, 86, soak) * (1 + fib);
          const inkC = lerp(30, 60, soak);
          r = lerp(r, inkC, inkK * (0.9 - soak * 0.3)); g = lerp(g, inkC - 2, inkK * (0.9 - soak * 0.3)); b = lerp(b, inkC - 4, inkK * (0.9 - soak * 0.3));
          // the curling edge of the sheet lifts and throws a little shadow on the board
          const e = Math.min(u, 1 - u, v, 1 - v);
          if (e < 0.012) { const k = 1 - e / 0.012; r *= 1 - k * 0.25; g *= 1 - k * 0.25; b *= 1 - k * 0.25; }
          r *= lit; g *= lit; b *= lit;
          // a film of water on the soaked paper mirrors the umbrella (rosy) on the ripples facing up-frame
          const spec = Math.pow(clamp(-ny / nl * 2.2 + 0.05), 4) * soak * 0.22;
          r += spec * 150; g += spec * 100; b += spec * 100;
        } else {
          const n = tF(x / 40, y / 40, 71, 3) * 0.5 + 0.5;
          r = 92 + n * 22; g = 64 + n * 14; b = 38 + n * 8;
          const tide = clamp(soak + 0.2);
          r *= 1 - tide * 0.35; g *= 1 - tide * 0.38; b *= 1 - tide * 0.4;
          // the sheet's soft shadow on the board round its edges
          const du = Math.max(-u, u - 1, 0), dv = Math.max(-v, v - 1, 0), dd = Math.hypot(du * SHEET.w, dv * SHEET.h);
          const sh = 1 - 0.4 * Math.exp(-dd / 6); r *= sh; g *= sh; b *= sh;
        }
        // occlusion: the floor darkens into the walls and deep into the corners; the overhead sky is
        // brightest in the middle
        const ex = 1 - ax, ey = 1 - ay;
        const ao = (1 - 0.55 * Math.exp(-ex * B4.hw / 34)) * (1 - 0.55 * Math.exp(-ey * B4.hh / 34)) * (1 - 0.3 * sF * sF);
        r *= ao; g *= ao; b *= ao;
        // the kitten's own contact shadow and the water running off him
        const kd = Math.hypot((x - KIT4.x) / 118, (y - KIT4.y + 40) / 150);
        const ks = 1 - 0.55 * Math.exp(-kd * kd * 2.2); r *= ks; g *= ks; b *= ks;
      } else if (sF <= B4.k) {
        // a wall: depth w (0 at the floor .. 1 at the rim), the coordinate along it
        const w = (sF - 1) / (B4.k - 1), side = ax / 1 > ay ? (dx < 0 ? 0 : 1) : (dy < 0 ? 2 : 3);
        const along = side < 2 ? dy / sF : dx / sF;
        // corrugated kraft: flutes run up the wall, fibres, scuffs
        const fl = Math.sin(along * 0.9) * 0.5 + 0.5, fib = tN(along / 3, w * 40, 81 + side) * 0.5 + 0.5, blot = tF(along / 50, w * 3, 83 + side, 3) * 0.5 + 0.5;
        const scuff = tN(along / 14, w * 9, 87 + side) * 0.5 + 0.5;
        r = 140 + fib * 26 + fl * 14 + scuff * 14; g = 100 + fib * 18 + fl * 9 + scuff * 10; b = 62 + fib * 10 + fl * 5 + scuff * 6;
        // water wicking up from the floor: dark below a ragged tide line, a darker band of dirt AT the line
        const tide = 0.42 + (tF(along / 42, 0.3, 85 + side, 3)) * 0.22 + blot * 0.12;
        const wetK = 1 - sm(tide - 0.06, tide + 0.02, w);
        const line = Math.exp(-((w - tide) ** 2) / 0.0012);
        r *= 1 - wetK * (0.3 + blot * 0.12) - line * 0.16; g *= 1 - wetK * (0.36 + blot * 0.12) - line * 0.18; b *= 1 - wetK * (0.42 + blot * 0.12) - line * 0.2;
        // walls facing the light (the bottom wall faces up-frame toward the umbrella) are brighter
        const face = [0.62, 0.66, 0.5, 0.92][side];
        const crease = Math.abs(ax - ay) / Math.max(ax, ay);
        const corner = 1 - 0.5 * Math.exp(-crease * 30);
        const ao = (0.55 + 0.45 * sm(0, 0.35, w)) * corner;
        r *= face * ao; g *= face * ao; b *= face * ao;
        // a wet sheen low on the walls
        const sp = wetK * 0.12 * (side === 3 ? 1 : 0.4); r += sp * 120; g += sp * 104; b += sp * 104;
        // the cut rim: exposed flutes, pale and lit
        if (w > 0.965) { const k = sm(0.965, 0.99, w); r = lerp(r, 176 + fl * 30, k); g = lerp(g, 140 + fl * 22, k); b = lerp(b, 96 + fl * 14, k); }
      } else {
        // the wet pavement round the box: dark, a sky sheen
        const n = tF(x / 18, y / 18, 91, 3) * 0.5 + 0.5, gr = tN(x / 2.5, y / 2.5, 92) * 0.5 + 0.5;
        r = 44 + n * 18 + gr * 10; g = 46 + n * 18 + gr * 10; b = 52 + n * 18 + gr * 10;
        const out = sF - B4.k, sh = 1 - 0.5 * Math.exp(-out * 30); r *= sh; g *= sh; b *= sh;
      }
      D[o4] = r; D[o4 + 1] = g; D[o4 + 2] = b; D[o4 + 3] = 255;
    };
    return {
      passes: [(y) => { if (!INK) inkLoad(); if (!img) img = new ImageData(W, H); const D = img.data; for (let x = 0; x < W; x++) px(x, y, D); }],
      finish(g) { g.putImageData(img, 0, 0); },
    };
  });
}
// the kitten crouched on the paper, looking up into the lens: soaked (wet 1), the umbrella red in his eyes
const KIT4O = { R: KIT4.R, W: 2.9 * KIT4.R + 16, H: 3.65 * KIT4.R + 16, hx: 1.36 * KIT4.R + 8, hy: 2.42 * KIT4.R + 8, layout: "up", wet: 1, eyes: 1, pupil: 0.5, light: [0, -0.45, 0.9], key: [0.86, 0.8, 0.82], amb: [0.3, 0.27, 0.28], rim: [0.55, 0.5, 0.52], rimDir: [0, -1], eyeRefl: "#b05048", seed: 7 };
const kit4 = () => kitBake("f04kit4", KIT4O);
const kit4Mew = () => kitBake("f04kit4m", Object.assign({}, KIT4O, { mouth: 1, clip: [Math.floor(KIT4O.hx - 0.4 * KIT4.R), Math.floor(KIT4O.hy + 0.12 * KIT4.R), Math.ceil(KIT4O.hx + 0.4 * KIT4.R), Math.ceil(KIT4O.hy + 0.72 * KIT4.R)] }));
// the umbrella's red edge hanging into the top of frame, right at the lens: a soft translucent glow
const umbEdge4 = () => blurredSprite("f04umbedge4", LW, 200, 16, (s) => {
  const p = new Path2D();
  p.moveTo(-60, -60); p.lineTo(LW + 60, -60); p.lineTo(LW + 60, 40);
  for (let i = 8; i >= 0; i--) { const x = -60 + (i / 8) * (LW + 120); p.quadraticCurveTo(x + (LW + 120) / 16, 92, x, 70 - Math.abs(i - 4) * 5); }
  p.closePath();
  const gr = s.createLinearGradient(0, -40, 0, 90);
  gr.addColorStop(0, "#3a0604"); gr.addColorStop(0.6, "#8e1810"); gr.addColorStop(1, "#c03424");
  s.fillStyle = gr; s.fill(p);
});
function shotBoxTop(g, t, lt) {
  const p = eio(seg(lt, 0, 10));
  // the shiver: an 8-12 Hz tremor through the whole little body, easing a little as the shot goes on
  const shake = 1 - smooth(seg(lt, 6.5, 10)) * 0.4;
  const trem = (Math.sin(lt * TAU * 9.3) * 0.016 + Math.sin(lt * TAU * 11.7 + 1.3) * 0.008 + Math.sin(lt * TAU * 8.1 + 0.4) * 0.006) * shake;
  const breath = Math.sin(lt * TAU * 0.9) * 0.012;
  K.withCamera(g, LW, LH, { x: 480, y: lerp(284, 292, p), zoom: lerp(1.0, 1.1, p), rot: lerp(0.01, -0.004, p), shakeT: t, shakeAmt: 0.8 }, (c) => {
    const plate = boxTopBake();
    if (plate) c.drawImage(plate, 0, 0, LW, LH);
    // the kitten (and the mew patch over his muzzle at the cue)
    const K4 = kit4();
    if (K4) {
      c.save();
      c.translate(KIT4.x, KIT4.y + 0.6 * KIT4.R); c.rotate(trem); c.scale(1 + trem * 0.5 + breath, 1 - trem * 0.4 + breath * 0.6); c.translate(-KIT4.x, -KIT4.y - 0.6 * KIT4.R);
      const x0 = KIT4.x - KIT4O.hx, y0 = KIT4.y - KIT4O.hy;
      c.drawImage(K4, x0, y0, K4.lw, K4.lh);
      const mew = K.env(lt, 0.25, 1.35, 0.18, 0.4);
      const KM = mew > 0.01 ? kit4Mew() : null;
      if (KM) { c.globalAlpha = mew; c.drawImage(KM, x0, y0, KM.lw, KM.lh); c.globalAlpha = 1; }
      c.restore();
    }
    // drips from the umbrella rim land on the paper: a tiny crown, then a ring spreading on the water film
    c.save();
    for (let i = 0; i < 4; i++) {
      const per = 1.3 + hash(i, 41) * 0.8, tt = lt + hash(i, 42) * per, cyc = Math.floor(tt / per), ph = (tt / per) % 1;
      const x = 300 + hash(i * 7 + cyc, 43) * 360, y = 160 + hash(i * 5 + cyc, 44) * 240;
      if (Math.hypot(x - KIT4.x, y - KIT4.y) < 120) continue;
      c.strokeStyle = `rgba(230,214,210,${(0.32 * (1 - ph) * (1 - ph)).toFixed(3)})`; c.lineWidth = 1.1;
      c.beginPath(); c.ellipse(x, y, 2 + ph * 26, 2 + ph * 24, 0, 0, TAU); c.stroke();
      if (ph > 0.2) { c.beginPath(); c.ellipse(x, y, (ph - 0.2) * 20, (ph - 0.2) * 18, 0, 0, TAU); c.stroke(); }
    }
    c.restore();
  });
  // the umbrella's edge right over the lens, far out of focus, and its drips falling AWAY from us: each
  // one starts as a big soft disc near the lens and shrinks toward the middle of the frame as it drops
  g.save(); g.globalAlpha = 0.85; g.drawImage(umbEdge4(), 0, -36 + Math.sin(lt * 0.7) * 4, LW, 200); g.restore();
  const S = K.glowSprite("#e8dcd8", 0.6);
  for (let i = 0; i < 7; i++) {
    const per = 0.9 + hash(i, 51) * 0.7, tt = lt + hash(i, 52) * per, ph = (tt / per) % 1;
    const sx = 40 + (i / 6) * 880 + hash(i, 53) * 40, sy = 30 + Math.abs(i - 3) * 6;
    // perspective fall: distance from the lens grows ~ph^2; size and offset from the centre shrink with it
    const d = 1 + ph * ph * 7, x = 480 + (sx - 480) / d, y = 284 + (sy - 284) / d, r = 26 / d;
    g.globalAlpha = (0.18 + 0.2 / d) * (ph < 0.08 ? ph / 0.08 : 1);
    g.drawImage(S, x - r, y - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
}

// ---- shot 5: you lift him and wrap your sleeve round him -----------------------------------------------
// A long lens wide open: the kitten in your two hands, sharp, against the street far behind (pure bokeh:
// highlights off wet things become soft discs). Your fingers wrap round his front and sink into his
// fur; the cuffs of your hoodie at the wrists; then the loose end of one sleeve is folded across him.
// Rain falls in front of and behind him at different blurs; beads of it sit on his coat.
const K5 = { x: 480, y: 212, R: 86 };
const KIT5O = { R: K5.R, W: 3.7 * K5.R, H: 4.55 * K5.R, hx: 1.85 * K5.R, hy: 1.62 * K5.R, layout: "held", hands: true, wet: 0.75, eyes: 1, pupil: 0.44, light: [-0.25, -0.8, 0.55], key: [0.92, 0.9, 0.9], amb: [0.3, 0.29, 0.3], rim: [0.62, 0.64, 0.7], rimDir: [0.4, -0.9], eyeRefl: "#aab2be", seed: 11 };
const kit5 = () => kitBake("f04kit5", KIT5O);
const kit5Eyes = () => kitBake("f04kit5e", Object.assign({}, KIT5O, { eyes: 0.6, clip: [Math.floor(KIT5O.hx - 0.72 * K5.R), Math.floor(KIT5O.hy - 0.36 * K5.R), Math.ceil(KIT5O.hx + 0.72 * K5.R), Math.ceil(KIT5O.hy + 0.3 * K5.R)] }));
// the street, far out of focus: the plate blurred hard, then the bright wet highlights as bokeh discs
// (a soft disc with a slightly brighter rim, cat's-eye shaped toward the frame edges)
function paintStreetBokeh(s) {
  s.fillStyle = "#8d949c"; s.fillRect(0, 0, LW, LH);
  s.save();
  if (K.hasFilter()) s.filter = "blur(16px)";
  s.drawImage(streetPlate(), -BOX3.x * 1.7 + 470, -205 * 1.7 + 160, LW * 1.7, LH * 1.7);
  s.restore();
  const R = K.rng("f04bokeh5");
  for (let i = 0; i < 26; i++) {
    const x = R() * LW, y = 120 + R() * 300, r = 10 + R() * 22, warm = R() > 0.82;
    const ex = (x - 480) / 480, ey = (y - 270) / 270, cat = 1 - Math.min(0.35, Math.hypot(ex, ey) * 0.25);
    s.save(); s.translate(x, y); s.rotate(Math.atan2(ey, ex)); s.scale(cat, 1);
    const gr = s.createRadialGradient(0, 0, 0, 0, 0, r);
    const c = warm ? "255,214,160" : "222,228,236", a = 0.05 + R() * 0.1;
    gr.addColorStop(0, `rgba(${c},${a * 0.8})`); gr.addColorStop(0.82, `rgba(${c},${a})`); gr.addColorStop(0.93, `rgba(${c},${a * 1.5})`); gr.addColorStop(1, `rgba(${c},0)`);
    s.fillStyle = gr; s.beginPath(); s.arc(0, 0, r, 0, TAU); s.fill();
    s.restore();
  }
  // the red umbrella overhead, a glow across the top of frame
  const ug = s.createLinearGradient(0, 0, 0, 170);
  ug.addColorStop(0, "rgba(150,30,22,0.75)"); ug.addColorStop(0.6, "rgba(150,30,22,0.25)"); ug.addColorStop(1, "rgba(150,30,22,0)");
  s.fillStyle = ug; s.fillRect(0, 0, LW, 170);
}
// knitted cotton (a heather mustard hoodie), per pixel: a tube along +x of radius r with a ribbed cuff
// at the far end, soft compression folds, the fibres; rain darkens the top
const HOOD = [176, 132, 50];
function sleeveBake(key, L, r, cuff) {
  const W = Math.ceil(L + 6), H = Math.ceil(r * 2 + 8);
  return pixBake(key, W, H, (x, y, out) => {
    const lx = x + 0.5, c = (y + 0.5 - H / 2) / r;
    // folds bunch the tube: a wavy outline and shading along it
    const fold = Math.sin(lx / 13 + tN(lx / 30, 0, 5) * 2) * (1 - sm(L - cuff - 10, L - cuff, lx));
    const rr = 1 + fold * 0.06 + tN(lx / 20, 3, 6) * 0.04;
    const ac = Math.abs(c) / rr;
    const endCap = lx > L ? 0 : 1;
    if (ac > 1.04 || !endCap) { out[3] = 0; return; }
    const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, ac) ** 2)), ny = c / rr;
    const inCuff = lx > L - cuff;
    // knit: little V columns; the cuff is ribbed (raised ribs along the arm)
    const knit = inCuff ? 0.5 + 0.5 * Math.cos((c * r) / 2.1 * Math.PI) : (tN(lx / 1.6, (c * r) / 1.2, 9) * 0.5 + 0.5) * 0.6 + (Math.abs(((c * r / 2.4) % 1 + 1) % 1 - 0.5)) * 0.4;
    const heather = tN(lx / 2.2, c * r / 2.2, 13) * 0.5 + 0.5;
    const lit = 0.38 + 0.62 * clamp(nz * 0.75 - ny * 0.55 + 0.15) + fold * 0.12;
    const wetTop = sm(0.1, -0.7, ny) * 0.32;
    const k = lit * (0.82 + knit * 0.22 + heather * 0.1) * (1 - wetTop) * (inCuff ? 0.96 : 1);
    out[0] = HOOD[0] * k; out[1] = HOOD[1] * k * (1 - wetTop * 0.1); out[2] = HOOD[2] * k;
    out[3] = 255 * clamp((1.04 - ac) * r / 1.2);
    // the cuff's rolled edge
    if (lx > L - 3) { out[0] *= 0.8; out[1] *= 0.8; out[2] *= 0.8; }
  });
}
// the loose end of the left sleeve, folded across his front: a draped fold of the same knit
function drapeBake() {
  const W = 300, H = 150;
  return pixBake("f04drape5", W, H, (x, y, out) => {
    const u = (x + 0.5) / W, v = (y + 0.5) / H;
    // the top edge is a soft rolled fold, sagging in the middle; the bottom leaves frame
    const top = 0.22 + 0.14 * Math.sin(u * Math.PI) * -1 + 0.2 + tN(u * 3, 0, 21) * 0.05 + u * 0.06;
    if (v < top - 0.02) { out[3] = 0; return; }
    const d = v - top;
    const roll = Math.exp(-((d - 0.06) ** 2) / 0.003);
    const folds = Math.sin(u * 15 + Math.sin(u * 4) * 1.5 + v * 3) * (0.5 + 0.5 * sm(0.1, 0.6, d));
    const knit = tN(x / 1.6, y / 1.2, 9) * 0.5 + 0.5, heather = tN(x / 2.2, y / 2.2, 13) * 0.5 + 0.5;
    const lit = clamp(0.5 + roll * 0.5 + folds * 0.16 - sm(0.3, 1, d) * 0.2 - (d < 0.02 ? 0.25 : 0));
    const k = (0.42 + lit * 0.62) * (0.84 + knit * 0.18 + heather * 0.1);
    out[0] = HOOD[0] * k; out[1] = HOOD[1] * k; out[2] = HOOD[2] * k;
    out[3] = 255 * clamp((v - top + 0.02) * H / 2.2) * clamp((1 - u) * W / 3) * clamp(u * W / 3);
  });
}
const sleeve5 = () => sleeveBake("f04sleeve5", 300, 46, 34);
function shotHands(g, t, lt) {
  // he is lifted the last bit toward you as the shot opens; the shivering eases off to nothing as
  // you hold him ("He stopped shaking when you held him"); the sleeve folds over him; he settles
  const lift = eio(seg(lt, 0, 1.8));
  const still = smooth(seg(lt, 1.0, 5.2));
  const trem = (Math.sin(lt * TAU * 9.6) * 0.014 + Math.sin(lt * TAU * 11.9 + 1) * 0.007) * (1 - still);
  const settle = smooth(seg(lt, 3, 6));
  const sway = Math.sin(lt * 1.25) * 2.5;
  const gx = K5.x + sway, gy = K5.y + (1 - lift) * 70 + Math.sin(lt * 2.1) * 1.2 * settle;
  K.withCamera(g, LW, LH, { x: 480, y: 270, zoom: lerp(1.0, 1.06, eio(seg(lt, 0, 10))), shakeT: t * 0.8, shakeAmt: 1.4 }, (c) => {
    // the street behind, all bokeh; it drifts up a little as the lens follows him up
    c.drawImage(spr("f04streetbk", LW, LH, paintStreetBokeh), -40, -30 - lift * 30, LW + 80, LH + 60);
    // far rain behind him: thin, soft (out of focus, but less than the street)
    if (!XF_BUILD) K.rain(c, LW, LH, t, { density: 0.5, angle: 0.1, color: "rgba(214,220,228,0.22)", seed: 15, len: 26, width: 1.4, speed: 760 });
    const KB = kit5();
    if (!KB) return;
    c.save();
    c.translate(gx, gy + K5.R * 1.6); c.rotate(trem); c.translate(-gx, -gy - K5.R * 1.6);
    const x0 = gx - KIT5O.hx, y0 = gy - KIT5O.hy;
    // the hoodie sleeves come up from below the frame to the wrists
    const SL = sleeve5();
    if (SL) for (let s = -1; s <= 1; s += 2) {
      const wx = gx + s * 1.36 * K5.R, wy = gy + 2.2 * K5.R, ang = Math.atan2(-0.9, -s * 0.42);
      c.save(); c.translate(wx, wy); c.rotate(ang); c.translate(-SL.lw + 18, -SL.lh / 2);
      c.drawImage(SL, 0, 0, SL.lw, SL.lh); c.restore();
    }
    c.drawImage(KB, x0, y0, KB.lw, KB.lh);
    // he gets sleepy once he is warm: a slow half-blink settles over the eyes
    const sleepy = smooth(seg(lt, 6.2, 8.4)) * (1 - 0.6 * smooth(seg(lt, 9.2, 9.8)));
    const KE5 = sleepy > 0.01 ? kit5Eyes() : null;
    if (KE5) { c.globalAlpha = sleepy * 0.8; c.drawImage(KE5, x0, y0, KE5.lw, KE5.lh); c.globalAlpha = 1; }
    // the cuffs over the wrists, in front
    if (SL) for (let s = -1; s <= 1; s += 2) {
      const wx = gx + s * 1.36 * K5.R, wy = gy + 2.2 * K5.R, ang = Math.atan2(-0.9, -s * 0.42);
      c.save(); c.translate(wx, wy); c.rotate(ang); c.beginPath(); c.rect(-60, -SL.lh, 78, SL.lh * 2); c.clip(); c.translate(-SL.lw + 18, -SL.lh / 2);
      c.drawImage(SL, 0, 0, SL.lw, SL.lh); c.restore();
    }
    // the loose sleeve end folds across his front (2.6 s .. 4.4 s), with its soft shadow on him
    const wrap = eio(seg(lt, 2.6, 4.4));
    const DR = wrap > 0 ? drapeBake() : null;
    if (DR) {
      const dx = lerp(gx - 3.2 * K5.R, gx - 1.7 * K5.R, wrap), dy = lerp(gy + 3.4 * K5.R, gy + 2.18 * K5.R, wrap), rot = lerp(-0.5, -0.1, wrap);
      c.save(); c.translate(dx, dy); c.rotate(rot);
      c.globalAlpha = 0.35; if (K.hasFilter()) c.filter = "blur(6px)"; c.drawImage(DR, 6, -14, 300 * K5.R / 92, 150 * K5.R / 92); c.filter = "none"; c.globalAlpha = 1;
      c.drawImage(DR, 0, 0, 300 * K5.R / 92, 150 * K5.R / 92);
      c.restore();
    }
    c.restore();
    // the warmth coming up: a faint warm bounce on him from the yellow cotton as it closes round him
    if (wrap > 0) K.lightPool(c, gx, gy + K5.R * 1.2, K5.R * 1.6, "#ffc060", { intensity: 0.1 * wrap, flat: 0.6 });
  });
  // the near rain: big drops right in front of the lens, long, motion-blurred and far out of focus
  if (!XF_BUILD) nearRain(g, t + 7, 9, 34, 0.1, 0.1);
}

// ---- shot 6: the kitchen that night ----------------------------------------------------------------
// A low camera (you kneel on the lino). Three motivated lights: the bar heater on the floor (the warm
// key, inverse-square, from low left), the strip light under the wall cabinets (a soft warm wash down the
// tiles and worktop) and the rainy window (a cold, dim fill). Everything static is lit once into a plate.
const HZ6 = 300;
// a textured floor in true perspective: rows converge on the eye line hz; tile100 = on-screen width of
// one tile 100 px below the eye line
function planeStrips(s, img, hz, y0, y1, cx, tile100, f = 960, N = 90) {
  const ts = img.width, C = (ts * 100 * f) / tile100;
  const pat = s.createPattern(img, "repeat");
  s.fillStyle = pat;
  const d0 = Math.max(0.6, y0 - hz), d1 = y1 - hz;
  let ya = hz + d0;
  for (let k = 1; k <= N; k++) {
    const yb = hz + d0 * Math.pow(d1 / d0, k / N);
    const va = C / (ya - hz), vb = C / (yb - hz);
    const ym = (ya + yb) / 2, T = (tile100 * (ym - hz)) / 100;
    const a = T / ts, d = (yb - ya) / (vb - va);
    setPat(pat, a, 0, 0, d, cx - ts * 0.5 * a, ya - va * d);
    s.fillRect(-60, ya - 0.35, LW + 120, yb - ya + 0.7);
    ya = yb;
  }
}
// worn chequered lino: cream and terracotta, scuffed, grime in the seams
const linoTex = () => K.texBake("f04lino", 128, 128, (u, v, out) => {
  const cu = Math.floor(u * 2), cv = Math.floor(v * 2), chk = (cu + cv) % 2;
  const fu = (u * 2) % 1, fv = (v * 2) % 1, e = Math.min(fu, 1 - fu, fv, 1 - fv);
  const n = tF(u * 6, v * 6, 71, 3, 6, 6), sc = tN(u * 48, v * 48, 72, 48, 48);
  const c = chk ? [190, 176, 150] : [128, 56, 40];
  const k = (0.84 + n * 0.2 + (sc - 0.5) * 0.08) * (e < 0.01 ? 0.5 : e < 0.02 ? 0.8 : 1);
  out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; out[3] = 255;
});
// glazed white splashback tiles with grey grout, each tile a little off-flat (it catches light unevenly)
const tileTex = () => K.texBake("f04tiles", 64, 64, (u, v, out, x, y) => {
  const e = Math.min(u, 1 - u, v, 1 - v);
  const n = tF(u * 2, v * 2, 81, 2, 2, 2);
  const k = e < 0.04 ? 0.58 : 0.9 + n * 0.08 + (0.5 - v) * 0.06;
  out[0] = 214 * k; out[1] = 210 * k; out[2] = 198 * k; out[3] = 255;
  void x; void y;
});
function paintKitchenAlbedo(s) {
  // painted plaster wall
  s.fillStyle = "#c9bea8"; s.fillRect(0, 0, LW, 372);
  K.texRect(s, "plaster", 0, 0, LW, 372, { scale: 160, alpha: 0.5, mode: "overlay", tex: { seed: 5, color: "#c9c0ae" } });
  // wall cabinets: wood doors, a shadow gap between them
  for (let i = 0; i < 6; i++) {
    const x = 300 + i * 112;
    K.texRect(s, "wood", x, -10, 110, 122, { scale: 120, rot: Math.PI / 2, tex: { seed: 3 } });
    s.fillStyle = "rgba(60,30,10,0.25)"; s.fillRect(x, -10, 110, 122);
    s.fillStyle = "rgba(0,0,0,0.4)"; s.fillRect(x + 108, -10, 2, 122);
    s.fillStyle = "rgba(255,230,190,0.15)"; s.fillRect(x + 6, 4, 98, 2);
    s.fillStyle = "#8a8070"; s.fillRect(x + (i % 2 ? 10 : 92), 86, 6, 18);
  }
  s.fillStyle = "#2a1a10"; s.fillRect(300, 108, LW - 300, 6);
  // splashback tiles
  const tp = s.createPattern(tileTex(), "repeat");
  setPat(tp, 26 / tileTex().width, 0, 0, 26 / tileTex().width, 300, 114);
  s.fillStyle = tp; s.fillRect(300, 114, LW - 300, 158);
  // the window over the sink: night outside, a far street lamp, rain on the glass
  s.fillStyle = "#3a2a1c"; s.fillRect(632, 122, 186, 134);
  const wg = s.createLinearGradient(0, 130, 0, 248);
  wg.addColorStop(0, "#0a0f1c"); wg.addColorStop(0.7, "#1a2236"); wg.addColorStop(1, "#262a36");
  s.fillStyle = wg; s.fillRect(642, 132, 166, 114);
  // the houses across the back gardens: dark roofs, one lit window
  s.fillStyle = "#0c0e16"; s.beginPath(); s.moveTo(642, 214); s.lineTo(690, 190); s.lineTo(740, 206); s.lineTo(808, 196); s.lineTo(808, 246); s.lineTo(642, 246); s.fill();
  s.fillStyle = "#a07040"; s.fillRect(700, 218, 6, 8);
  s.fillStyle = "#2a1c12"; s.fillRect(723, 132, 4, 114);
  // worktop and base units
  K.texRect(s, "wood", 300, 270, LW - 300, 16, { scale: 90, tex: { seed: 4 } });
  s.fillStyle = "rgba(255,240,220,0.2)"; s.fillRect(300, 270, LW - 300, 2);
  for (let i = 0; i < 6; i++) {
    const x = 300 + i * 112;
    K.texRect(s, "wood", x, 288, 110, 70, { scale: 120, rot: Math.PI / 2, ox: i * 30, tex: { seed: 3 } });
    s.fillStyle = "rgba(60,30,10,0.25)"; s.fillRect(x, 288, 110, 70);
    s.fillStyle = "rgba(0,0,0,0.45)"; s.fillRect(x + 108, 288, 2, 70);
    s.fillStyle = "#8a8070"; s.fillRect(x + 40, 296, 30, 4);
  }
  s.fillStyle = "#1a120c"; s.fillRect(300, 358, LW - 300, 14);
  // skirting on the left wall
  s.fillStyle = "#b8ae9a"; s.fillRect(0, 356, 300, 16);
  // things on the worktop: a kettle (steel), canisters, a bottle, a toaster, a fruit bowl
  const steel = (x, y, w, h) => { const g2 = s.createLinearGradient(x, 0, x + w, 0); g2.addColorStop(0, "#3a3a3c"); g2.addColorStop(0.3, "#d8d8d8"); g2.addColorStop(0.5, "#7a7a7c"); g2.addColorStop(1, "#2a2a2c"); s.fillStyle = g2; s.fillRect(x, y, w, h); };
  steel(338, 232, 46, 38); s.fillStyle = "#1e1e20"; s.fillRect(352, 226, 18, 7); s.beginPath(); s.moveTo(384, 246); s.lineTo(402, 232); s.lineTo(398, 246); s.fill();
  for (const [x, w, h, c] of [[430, 18, 30, "#d8d0c0"], [452, 16, 24, "#c8c0b0"], [472, 20, 36, "#d0c8b8"]]) { s.fillStyle = c; s.fillRect(x, 270 - h, w, h); s.fillStyle = "#6a5a4a"; s.fillRect(x - 1, 270 - h - 4, w + 2, 5); }
  s.fillStyle = "#2a4a2a"; s.fillRect(522, 222, 9, 48); s.fillRect(524, 208, 5, 16);
  steel(560, 238, 54, 32);
  s.fillStyle = "#8a5a3a"; s.beginPath(); s.ellipse(880, 264, 40, 10, 0, 0, Math.PI); s.fill();
  for (const [x, y, c] of [[860, 256, "#d8a030"], [878, 252, "#c8402a"], [896, 257, "#e0b040"]]) { s.fillStyle = c; s.beginPath(); s.arc(x, y, 9, 0, TAU); s.fill(); }
  // the lino
  planeStrips(s, linoTex(), HZ6, 372, LH + 10, 470, 70);
}
// The floor is one plane: a point (X right, Z ahead, metres) lands at y = HZ6 + FL.k / Z, x = FL.cx +
// X * FL.f / Z (eye 0.4 m above the lino, a 540 px focal length) - the same projection planeStrips uses
// for the tiles (70 px per 0.28 m tile 100 px below the eye line).
const FL = { cx: 470, f: 540, k: 216 };
const flY = (Z) => HZ6 + FL.k / Z, flX = (X, Z) => FL.cx + (X * FL.f) / Z;
// the bar heater stands on the floor out from the wall: a front face, its right side receding to the
// vanishing point, little feet; the bars are drawn live (they glow and breathe)
const HT = { x0: 34, x1: 170, top: 222, base: 412, q: 0.1 };
function heaterBody(s) {
  const { x0, x1, top, base, q } = HT;
  const vp = [FL.cx, HZ6];
  const bk = (x, y) => [x + (vp[0] - x) * q, y + (vp[1] - y) * q];
  // the right side face (in shadow: it faces away from the room light), then the front frame
  const side = polyPath([[x1, top], bk(x1, top), bk(x1, base - 8), [x1, base - 8]]);
  s.fillStyle = "#1c1612"; s.fill(side);
  gradFill(s, side, 0, top, 0, base, [[0, "rgba(255,150,80,0.05)"], [1, "rgba(0,0,0,0.4)"]]);
  const fr = rectPath(x0, top, x1 - x0, base - 8 - top);
  s.fillStyle = "#3a2e26"; s.fill(fr);
  K.texFill(s, "metal", fr, { scale: 120, alpha: 0.3, mode: "overlay", tex: { seed: 5, color: "#6a5a4a", rust: 0.1 } });
  // the polished reflector dish behind the bars: it mirrors their glow (bright band in the middle)
  const rx0 = x0 + 10, rx1 = x1 - 10, ry0 = top + 12, ry1 = base - 30;
  const rf = s.createLinearGradient(rx0, 0, rx1, 0);
  rf.addColorStop(0, "#2a1e16"); rf.addColorStop(0.3, "#9a6a46"); rf.addColorStop(0.5, "#e8b888"); rf.addColorStop(0.7, "#9a6a46"); rf.addColorStop(1, "#2a1e16");
  s.fillStyle = rf; s.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
  s.fillStyle = "rgba(0,0,0,0.35)"; s.fillRect(rx0, ry0, rx1 - rx0, 4);
  // the base plinth and feet; occlusion where it stands on the lino
  s.fillStyle = "#16120e"; s.fillRect(x0 - 6, base - 10, x1 - x0 + 12, 8);
  s.fillStyle = "rgba(255,170,100,0.25)"; s.fillRect(x0 - 6, base - 10, x1 - x0 + 12, 1);
  for (const fx of [x0 + 6, x1 - 14]) { s.fillStyle = "#0e0a08"; s.fillRect(fx, base - 2, 8, 4); }
  K.shadowBlob(s, (x0 + x1) / 2 + 10, base + 1, (x1 - x0) * 0.62, 5, { alpha: 0.85 });
}
function paintKitchen(s) {
  const A = tmp(LW, LH);
  paintKitchenAlbedo(A.g);
  const hx = (HT.x0 + HT.x1) / 2, hy = 316;
  const lit = relight(A.c, LW, LH, "#16141a", [
    // the heater: the warm key, inverse-square - the floor and wall near it hot, falling off fast
    { color: "#ff8a40", k: 1.6, mask: radial(hx + 30, hy + 60, 760, [[0, 1], [0.08, 0.75], [0.2, 0.36], [0.4, 0.13], [0.7, 0.035], [1, 0]]) },
    // the strip light under the cabinets: a soft warm wash down the tiles onto the worktop
    { color: "#ffd8a8", k: 0.75, mask: (g, w, h) => { linear(0, 112, 0, 300, [[0, 0.95], [0.5, 0.5], [0.85, 0.2], [1, 0.05]])(g, w, h); g.globalCompositeOperation = "destination-in"; linear(260, 0, 960, 0, [[0, 0], [0.1, 1], [1, 0.8]])(g, w, h); } },
    // the window: a dim cold fill down onto the floor
    { color: "#6a84c0", k: 0.4, mask: (g, w, h) => { radial(725, 200, 360, [[0, 0.8], [0.5, 0.3], [1, 0]])(g, w, h); } },
  ]);
  // the back of the room sits behind the focus plane: soften it a touch
  s.save();
  s.beginPath(); s.rect(0, 0, LW, 372); s.clip();
  if (K.hasFilter()) s.filter = "blur(1.6px)";
  s.drawImage(lit, 0, 0, LW, LH);
  s.restore();
  s.save(); s.beginPath(); s.rect(0, 372, LW, LH); s.clip(); s.drawImage(lit, 0, 0, LW, LH); s.restore();
  // rain running down the window glass, catching the room light; a far street lamp out of focus
  const RG = K.rng("f04glass");
  for (let i = 0; i < 26; i++) {
    const gx = 644 + RG() * 162, gy = 134 + RG() * 60, gl = 20 + RG() * 60;
    s.strokeStyle = "rgba(255,214,170,0.16)"; s.lineWidth = 1; s.beginPath(); s.moveTo(gx, gy);
    s.quadraticCurveTo(gx + (RG() - 0.5) * 6, gy + gl * 0.5, gx + (RG() - 0.5) * 4, Math.min(244, gy + gl)); s.stroke();
    s.fillStyle = "rgba(255,220,180,0.35)"; s.fillRect(gx - 0.8, Math.min(243, gy + gl) - 1, 1.8, 2);
  }
  K.bokehLights(s, LW, LH, 0, { count: 0, lights: [{ x: 772, y: 176, r: 9, color: "#ffb060" }, { x: 676, y: 214, r: 6, color: "#ffd8a0" }], alpha: 0.45 });
  // occlusion where things meet
  K.aoEdge(s, 0, 372, LW, 372, { width: 30, alpha: 0.5, side: 0 });
  K.aoEdge(s, 300, 114, LW, 114, { width: 12, alpha: 0.35, side: -1 });
  K.aoEdge(s, 300, 286, LW, 286, { width: 10, alpha: 0.4, side: -1 });
  // the lino is semi-gloss: it mirrors the heater (a long warm streak)
  K.reflectStreak(s, hx, HT.base + 6, 130, "#ff9a50", 0.4, { width: 80 });
  heaterBody(s);
}
// ---- the shoebox, in true floor scale -------------------------------------------------------------------
// A shoebox is ~30 x 20 x 12 cm; the lino tiles are 28 cm, so the box is about one tile wide. World
// metres: X right, Z ahead, Y up; the floor projection is the same one planeStrips lays the tiles with.
const BOX6 = { X0: -0.13, X1: 0.17, Zf: 1.3, Zb: 1.5, Hb: 0.12 };
const P6 = (X, Z, Y = 0) => [flX(X, Z), flY(Z) - (Y * FL.f) / Z];
// the heater as a light: its glowing bars ~25 cm up, out to the left and further back
const HL6 = { X: -1.31, Z: 1.93, Y: 0.25 };
// a point at height Y, projected away from the heater onto the floor
const shadowPt = (X, Z, Y) => { const k = HL6.Y / (HL6.Y - Y); return P6(HL6.X + (X - HL6.X) * k, HL6.Z + (Z - HL6.Z) * k); };
function boxShadow6(s) {
  const { X0, X1, Zf, Zb, Hb } = BOX6;
  const base = [[X0, Zf], [X1, Zf], [X1, Zb], [X0, Zb]];
  // the long shadow thrown away from the low heater: every face's shadow quad (base edge + its edge
  // projected from the bar), softening with distance (a blurred copy blended in by a falloff)
  const L = tmp(LW, LH);
  L.g.fillStyle = "#000";
  for (let i = 0; i < 4; i++) {
    const [ax, az] = base[i], [bx, bz] = base[(i + 1) % 4];
    L.g.fill(polyPath([P6(ax, az), P6(bx, bz), shadowPt(bx, bz, Hb), shadowPt(ax, az, Hb)]));
  }
  L.g.fill(polyPath(base.map(([x, z]) => P6(x, z))));
  const far = shadowPt((X0 + X1) / 2, (Zf + Zb) / 2, Hb), near = P6((X0 + X1) / 2, (Zf + Zb) / 2);
  s.save();
  if (K.hasFilter()) s.filter = "blur(2px)";
  s.globalAlpha = 0.62; s.drawImage(L.c, 0, 0);
  s.restore();
  // the penumbra widens with distance from the box: a heavily blurred copy over the far end
  s.save();
  if (K.hasFilter()) s.filter = "blur(10px)";
  s.globalAlpha = 0.3; s.drawImage(L.c, 0, 0);
  s.restore();
  void far; void near;
  // the contact: deep occlusion tight under the base
  K.shadowBlob(s, P6((X0 + X1) / 2, Zf)[0], P6(0, Zf)[1] - 3, (P6(X1, Zf)[0] - P6(X0, Zf)[0]) * 0.56, 5, { alpha: 0.9 });
  K.aoEdge(s, P6(X0, Zf)[0], P6(0, Zf)[1], P6(X1, Zf)[0], P6(0, Zf)[1], { width: 7, alpha: 0.6, side: 1 });
}
// the box body: inner walls (seen through the open top), then the front face; per-pixel so the kraft has
// fibre, flutes at the cut rim, the heater raking the left end hot and the moon fill cool on the right
function boxBake6(part) {
  const { X0, X1, Zf, Zb, Hb } = BOX6;
  const [lx] = P6(X0 - 0.01, Zf), [rx] = P6(X1 + 0.01, Zf), ty = P6(0, Zb, Hb)[1] - 2, by = P6(0, Zf)[1] + 2;
  const S = 3, x0 = Math.floor(lx), y0 = Math.floor(ty), W = Math.ceil(rx - lx) * S, H = Math.ceil(by - ty) * S;
  const ftl = P6(X0, Zf, Hb), ftr = P6(X1, Zf, Hb), btl = P6(X0, Zb, Hb), btr = P6(X1, Zb, Hb), fbl = P6(X0, Zf);
  const c = pixBake("f04box6" + part, W, H, (x, y, out) => {
    const sx = x0 + (x + 0.5) / S, sy = y0 + (y + 0.5) / S;
    const front = sx >= ftl[0] && sx <= ftr[0] && sy >= ftl[1] && sy <= fbl[1];
    // the open top as a quad (front-top edge .. back-top edge)
    const q = (sy - btl[1]) / (ftl[1] - btl[1]), ql = lerp(btl[0], ftl[0], q), qr = lerp(btr[0], ftr[0], q);
    const top = q >= 0 && q <= 1 && sx >= ql && sx <= qr;
    if (part === "front" ? !front : !top) { out[3] = 0; return; }
    const u = (sx - ftl[0]) / (ftr[0] - ftl[0]);
    const fib = tN(sx * 2.4, sy * 0.9, 3) * 0.5 + 0.5, blot = tF(sx / 14, sy / 10, 4, 3) * 0.5 + 0.5;
    let r = 168 + fib * 22 + blot * 10, g = 122 + fib * 16 + blot * 7, b = 74 + fib * 10 + blot * 4;
    if (part === "front") {
      const v = (sy - ftl[1]) / (fbl[1] - ftl[1]);
      // heater from the left: hot near the left end, falling off across the face; cool fill from the right
      const heat = Math.exp(-u * 2.2) * 0.75 + 0.25, cool = sm(0.5, 1, u) * 0.18;
      r *= 0.36 + heat * 0.72; g *= 0.3 + heat * 0.58; b *= 0.26 + heat * 0.38;
      r += cool * 40; g += cool * 52; b += cool * 84;
      // the cut top edge shows its flutes; the left vertical edge burns hot in the heater
      if (v < 0.06) { const fl = Math.sin(sx * 2.1) * 0.5 + 0.5; r += 34 * fl; g += 24 * fl; b += 12 * fl; }
      if (u < 0.025) { r += 70; g += 36; b += 10; }
      // grime low on the box and occlusion right at the floor
      const ao = 1 - 0.35 * sm(0.7, 1, v); r *= ao; g *= ao; b *= ao;
      // a plain paper label on the right end
      if (u > 0.62 && u < 0.88 && v > 0.28 && v < 0.66) { const ln = (Math.floor((v - 0.28) / 0.07) % 2) && u < 0.84 ? 0.75 : 1; r = r * 0.4 + 120 * ln; g = g * 0.4 + 116 * ln; b = b * 0.4 + 110 * ln; }
    } else {
      // inside: the far wall and the side walls in shadow, the warm light catching the inner right wall
      const inR = sm(0.6, 1, u) * 0.6;
      r *= 0.32 + inR * 0.6; g *= 0.27 + inR * 0.4; b *= 0.24 + inR * 0.24;
      r *= 0.55 + q * 0.45; g *= 0.55 + q * 0.45; b *= 0.55 + q * 0.45;
    }
    out[0] = r; out[1] = g; out[2] = b; out[3] = 255;
  });
  if (c) { c.ox = x0; c.oy = y0; c.os = S; }
  return c;
}
// the towel nest: cream terry heaped in the box, a dent where he lies, a soft roll lapped over the front
// rim; part "back" is everything behind him, part "lip" the roll in front of him
const KIT6 = { X: 0.03, Z: 1.4, Y: 0.128 };
function towelBake6(part) {
  const { X0, X1, Zf, Zb, Hb } = BOX6;
  const S = 3, [lx, ty] = P6(X0 - 0.03, Zb, Hb + 0.06), [rx] = P6(X1 + 0.03, Zf), by = P6(0, Zf, Hb - 0.035)[1];
  const x0 = Math.floor(lx), y0 = Math.floor(ty), W = Math.ceil(rx - lx) * S, H = Math.ceil(by - ty) * S;
  const ftl = P6(X0, Zf, Hb), ftr = P6(X1, Zf, Hb), btl = P6(X0, Zb, Hb), kc = P6(KIT6.X, KIT6.Z, KIT6.Y);
  const pxm = FL.f / KIT6.Z;
  const c = pixBake("f04towel6" + part, W, H, (x, y, out) => {
    const sx = x0 + (x + 0.5) / S, sy = y0 + (y + 0.5) / S, u = (sx - ftl[0]) / (ftr[0] - ftl[0]);
    // the heap's upper outline: lumpy folds rising above the back rim
    const crest = btl[1] - (0.006 + 0.007 * Math.sin(u * 5.5 + 0.6) + 0.006 * tN(u * 6, 0, 31)) * pxm;
    // the lip: the towel rolled over the front rim, sagging in lobes over the box front
    const lipTop = ftl[1] - (0.012 + 0.006 * Math.sin(u * 11)) * pxm, lipBot = ftl[1] + (0.012 + 0.014 * Math.max(0, Math.sin(u * 6.3 + 1.1))) * pxm;
    const inX = u > -0.03 && u < 1.03;
    let inside;
    if (part === "lip") inside = inX && sy > lipTop && sy < lipBot;
    else inside = inX && sy > crest && sy < ftl[1] + 1;
    if (!inside) { out[3] = 0; return; }
    // height field: folds + the dent he makes (darker, occluded ring round him)
    const dk = Math.hypot((sx - kc[0]) / (0.085 * pxm), (sy - kc[1]) / (0.03 * pxm));
    const dent = part === "lip" ? 0 : Math.exp(-dk * dk * 0.9);
    const foldF = (a, b) => Math.sin(a * 0.16 + b * 0.05 + tN(a / 26, b / 14, 33) * 4) * 0.45 + tN(a / 9, b / 6, 35) * 0.55;
    const f0 = foldF(sx, sy), fx = foldF(sx + 0.7, sy) - f0, fy = foldF(sx, sy + 0.7) - f0;
    let nx = -fx * 1.2, ny = -fy * 1.2 + (part === "lip" ? (sy - (lipTop + lipBot) / 2) / ((lipBot - lipTop) / 2) * 0.9 : 0), nz = 1;
    const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    // terry: dense little loops (a crisp high-frequency speckle), slightly darker in their gaps
    const loop = tN(sx * 3.1, sy * 3.1, 37) * 0.5 + 0.5, loop2 = tN(sx * 6.3 + 9, sy * 6.3, 38) * 0.5 + 0.5;
    const terry = 0.9 + 0.08 * sm(0.35, 0.7, loop) + 0.04 * loop2;
    // heater from the left (warm, raking low), moon fill from the right (cool, dim)
    const hk = clamp(-nx * 0.85 + nz * 0.35 - ny * 0.1) * (0.4 + 0.6 * Math.exp(-Math.max(0, u) * 1.6));
    const ck = clamp(nx * 0.7 + nz * 0.45) * 0.3;
    let ao = 1 - dent * 0.55 + (dk < 0.6 ? 0.2 * (1 - dk / 0.6) : 0);
    if (part !== "lip") ao *= 0.6 + 0.4 * sm(crest, crest + 8, sy);
    else ao *= 1 - 0.4 * sm(lipTop + (lipBot - lipTop) * 0.55, lipBot, sy);
    const base = [234, 222, 198];
    out[0] = base[0] * terry * ao * (0.2 + hk * 0.95 + ck * 0.36);
    out[1] = base[1] * terry * ao * (0.18 + hk * 0.6 + ck * 0.42);
    out[2] = base[2] * terry * ao * (0.17 + hk * 0.32 + ck * 0.55);
    // a fuzzy edge
    const e = part === "lip" ? Math.min(sy - lipTop, lipBot - sy) : sy - crest;
    out[3] = 255 * clamp(e * 1.2 + (loop - 0.5) * 1.5);
  });
  if (c) { c.ox = x0; c.oy = y0; c.os = S; }
  return c;
}
// the kitten curled asleep in the dent, head toward the heater: kitten proportions, dry fluffy coat,
// the heater a hot rim along his back and over his ears, the moon a cool fill from the window side
const KIT6O = { R: 30, W: 152, H: 92, hx: 40, hy: 46, layout: "curl", wet: 0, eyes: 0, rot: 0.12, light: [0.65, -0.35, 0.65], key: [0.42, 0.5, 0.7], amb: [0.14, 0.12, 0.13], rim: [1.25, 0.6, 0.26], rimDir: [-0.9, -0.45], seed: 19 };
const kit6 = () => kitBake("f04kit6", KIT6O);
const KS6 = 0.39; // bake px -> screen px (R 30 -> ~11.7 px: a 3 cm head radius at 1.4 m)
// the writing hand: a child's right hand in the tripod grip, built from the same capsule skin model -
// the marker between the thumb and the first two fingers, the barrel resting in the web of the thumb,
// the last two fingers curled under. Bake coords: R = 1 unit, nib at (hx, hy), the barrel runs down-right.
const HR7 = 34, HAND7 = { W: 5.4 * HR7, H: 5.0 * HR7, hx: 0.9 * HR7, hy: 1.0 * HR7 };
const BAR7 = [0.72, 0.694];
function writingCaps() {
  const d = BAR7, n = [BAR7[1], -BAR7[0]], C = [];
  const P = (t, s) => [d[0] * t + n[0] * s, d[1] * t + n[1] * s];
  const cap = (a, b, ra, rb, za, zb, kind, fl = 0.7) => C.push(a[0], a[1], b[0], b[1], ra, rb, za, zb, kind, fl);
  // the last two fingers, curled under the palm (their knuckles show as a row of soft bumps)
  cap(P(2.05, -0.72), P(2.55, -0.82), 0.17, 0.18, 0.0, 0.05, 2);
  cap(P(2.3, -0.98), P(2.8, -1.0), 0.15, 0.16, -0.05, 0.0, 2);
  // the back of the hand and the wrist
  cap(P(2.5, -0.28), P(3.45, -0.1), 0.66, 0.6, 0.18, 0.2, 0, 0.42);
  cap(P(3.45, -0.1), P(4.9, 0.05), 0.5, 0.48, 0.18, 0.16, 0, 0.75);
  // the middle finger: along the near side of the barrel, its tip pressing on it
  cap(P(2.45, -0.42), P(1.75, -0.36), 0.205, 0.2, 0.28, 0.3, 1);
  cap(P(1.75, -0.36), P(1.15, -0.26), 0.2, 0.19, 0.3, 0.26, 2);
  cap(P(1.15, -0.26), P(0.72, -0.2), 0.19, 0.17, 0.26, 0.18, 3);
  // the index finger: on top of the barrel, slightly bent at the middle joint
  cap(P(2.55, -0.02), P(1.85, 0.06), 0.215, 0.205, 0.5, 0.56, 1);
  cap(P(1.85, 0.06), P(1.22, 0.03), 0.2, 0.19, 0.56, 0.5, 2);
  cap(P(1.22, 0.03), P(0.62, 0.02), 0.19, 0.175, 0.5, 0.42, 3);
  // the thumb: from the heel of the hand up the far side, its pad against the barrel
  cap(P(3.15, 0.62), P(2.15, 0.52), 0.33, 0.27, 0.22, 0.36, 1);
  cap(P(2.15, 0.52), P(1.4, 0.3), 0.26, 0.23, 0.36, 0.38, 3);
  return Float64Array.from(C.map((v, i) => (i % 10 < 6 ? v : v)));
}
const handO7 = { R: HR7, W: HAND7.W, H: HAND7.H, hx: HAND7.hx, hy: HAND7.hy, layout: "none", caps: null, wet: 0, light: [-0.85, -0.2, 0.5], key: [1.1, 0.66, 0.4], amb: [0.13, 0.13, 0.17], rim: [0.36, 0.44, 0.66], rimDir: [0.9, -0.4], seed: 23 };
const hand7 = () => { if (!handO7.caps) handO7.caps = writingCaps(); return kitBake("f04hand7", handO7); };
const HK7 = 0.5; // bake px -> screen px
const sleeve7 = () => sleeveBake("f04sleeve7", 200, 30, 22);
// the marker in screen space: a white barrel, black cap end, the felt nib; lit from the heater side
function drawMarker(c, x, y, ang, len) {
  c.save(); c.translate(x, y); c.rotate(ang);
  c.fillStyle = "#0e0e0e"; c.beginPath(); c.moveTo(0, 0); c.lineTo(5, -1.9); c.lineTo(5, 1.9); c.closePath(); c.fill();
  c.fillStyle = "#2a2a2a"; c.fillRect(5, -2.6, 4, 5.2);
  const mg = c.createLinearGradient(0, -3.4, 0, 3.4);
  mg.addColorStop(0, "#c88a5a"); mg.addColorStop(0.3, "#f6e6d4"); mg.addColorStop(0.62, "#9a8a86"); mg.addColorStop(1, "#4a4450");
  c.fillStyle = mg; c.fillRect(9, -3.4, len - 15, 6.8);
  c.fillStyle = "#151515"; c.fillRect(len - 7, -3.6, 7, 7.2);
  c.fillStyle = "rgba(255,220,180,0.5)"; c.fillRect(10, -2.4, len - 18, 0.8);
  c.restore();
}
const LIDW = 400, LIDH = 260, LIDF = { X0: 0.24, X1: 0.54, Zf: 1.2, Zn: 1.0 };
function paintLid(s) {
  const tex = cardboardTex(0);
  const p = rectPath(0, 0, LIDW, LIDH);
  patFill(s, p, tex, 0.5, 0, 0, 0.5, 0, 0);
  // the heater rakes across it from the far left; the moon fill cools the right; the rim's turned-up edge
  gradFill(s, p, 0, 0, LIDW, 0, [[0, "rgba(255,150,70,0.4)"], [0.5, "rgba(80,30,6,0.15)"], [1, "rgba(30,40,70,0.45)"]]);
  s.strokeStyle = "rgba(60,30,10,0.4)"; s.lineWidth = 6; s.strokeRect(8, 8, LIDW - 16, LIDH - 16);
  s.strokeStyle = "rgba(255,190,130,0.22)"; s.lineWidth = 2; s.strokeRect(4, 4, LIDW - 8, LIDH - 8);
}
const lidPt = (lx, ly) => { const Z = lerp(LIDF.Zf, LIDF.Zn, ly / LIDH); return [flX(lerp(LIDF.X0, LIDF.X1, lx / LIDW), Z), flY(Z)]; };
const WORD6 = "BISCUIT", WRITE6 = [1.0, 7.2];
function shotKitchen(g, t, lt) {
  const write = seg(lt, WRITE6[0], WRITE6[1]);
  const flick = 0.93 + 0.07 * Math.sin(lt * 1.3) * Math.sin(lt * 0.7 + 1);
  // the camera: close on him in the box, along to the lid as the name is written, then back to the
  // whole warm room with the heater in frame by 8 s
  const a1 = eio(seg(lt, 1.2, 3.6)), a2 = eio(seg(lt, 6.0, 8.0));
  const cx = lerp(lerp(480, 640, a1), 330, a2), cy = lerp(lerp(412, 476, a1), 318, a2), zm = lerp(lerp(2.6, 2.2, a1), 1.08, a2);
  K.withCamera(g, LW, LH, { x: cx, y: cy, zoom: zm, shakeT: t * 0.7, shakeAmt: 0.6 }, (c) => {
    c.drawImage(spr("f04kitch3", LW, LH, paintKitchen), 0, 0, LW, LH);
    // the heater bars: white-hot cores in orange (near-clipped so the lens blooms them), a breathing glow
    for (let i = 0; i < 2; i++) {
      const yy = 270 + i * 58;
      const eg = c.createLinearGradient(0, yy - 9, 0, yy + 9);
      eg.addColorStop(0, "rgba(255,110,30,0)"); eg.addColorStop(0.35, "#ff7a2a"); eg.addColorStop(0.5, mix("#fff2d8", "#ffb070", 1 - flick)); eg.addColorStop(0.65, "#ff7a2a"); eg.addColorStop(1, "rgba(255,110,30,0)");
      c.fillStyle = eg; c.fillRect(HT.x0 + 14, yy - 9, HT.x1 - HT.x0 - 28, 18);
    }
    c.strokeStyle = "rgba(30,22,18,0.85)"; c.lineWidth = 1.3;
    for (let i = 0; i < 12; i++) { const x = HT.x0 + 14 + i * ((HT.x1 - HT.x0 - 28) / 11); c.beginPath(); c.moveTo(x, HT.top + 10); c.lineTo(x, HT.base - 28); c.stroke(); }
    K.lightPool(c, (HT.x0 + HT.x1) / 2 + 20, HT.base + 30, 280, "#ff8a3a", { intensity: 0.2 * flick, flat: 0.4 });
    // the box, the towel, him, the towel's front roll, the box front
    c.drawImage(spr("f04boxsh6", LW, LH, boxShadow6), 0, 0, LW, LH);
    for (const P of [boxBake6("in"), towelBake6("back")]) if (P) c.drawImage(P, P.ox, P.oy, P.lw / P.os, P.lh / P.os);
    const KB = kit6();
    if (KB) {
      const [kx, ky] = P6(KIT6.X, KIT6.Z, KIT6.Y), br = 1 + Math.sin(lt * TAU * 0.42) * 0.025;
      c.save(); c.translate(kx, ky); c.scale(KS6, KS6 * br);
      c.drawImage(KB, -KIT6O.hx - 1.1 * KIT6O.R, -KIT6O.hy - 0.15 * KIT6O.R, KB.lw, KB.lh);
      c.restore();
    }
    for (const P of [towelBake6("lip"), boxBake6("front")]) if (P) c.drawImage(P, P.ox, P.oy, P.lw / P.os, P.lh / P.os);
    // the heater's warm wash over the near end of the box and him
    K.lightPool(c, P6(BOX6.X0, BOX6.Zf)[0] - 10, P6(0, BOX6.Zf, 0.08)[1], 70, "#ff8a3a", { intensity: 0.12 * flick, flat: 0.6 });
    // the lid on the floor: lid-space layer (card + the name so far), mapped onto the floor plane
    const LL = K.layer(LIDW, LIDH, "f04lidL");
    LL.g.drawImage(spr("f04lid3", LIDW, LIDH, paintLid), 0, 0, LIDW, LIDH);
    LL.g.font = '700 92px "Segoe Print", "Comic Sans MS", cursive';
    LL.g.textAlign = "left"; LL.g.textBaseline = "middle";
    const full = LL.g.measureText(WORD6).width, sc = Math.min(1, (LIDW - 40) / full), x0 = (LIDW - full * sc) / 2;
    LL.g.save();
    LL.g.translate(x0, LIDH * 0.52); LL.g.scale(sc, 1); LL.g.rotate(-0.03);
    LL.g.beginPath(); LL.g.rect(-10, -100, (full + 20) * write, 200); LL.g.clip();
    // the ink wicks into the card fibres: a soft feathered halo under the line, then the line itself
    if (K.hasFilter()) LL.g.filter = "blur(2.2px)";
    LL.g.fillStyle = "rgba(30,18,14,0.55)"; LL.g.fillText(WORD6, 0, 0);
    LL.g.filter = "none";
    LL.g.fillStyle = "#120d0b"; LL.g.fillText(WORD6, 0, 0);
    // the newest letter is still wet: a glossy sheen that dulls over ~0.5 s once the letter is done
    const nL = WORD6.length, wT = WRITE6[1] - WRITE6[0];
    for (let i = 0; i < nL; i++) {
      const done = WRITE6[0] + ((i + 1) / nL) * wT, began = WRITE6[0] + (i / nL) * wT;
      if (lt < began) break;
      const sheen = 1 - clamp((lt - done) / 0.5);
      if (sheen <= 0) continue;
      const lx0 = LL.g.measureText(WORD6.slice(0, i)).width;
      LL.g.save();
      LL.g.beginPath(); LL.g.rect(lx0 - 2, -100, LL.g.measureText(WORD6[i]).width + 4, 200); LL.g.clip();
      LL.g.globalAlpha = 0.3 * sheen; LL.g.fillStyle = "#ffd2b0";
      LL.g.save(); LL.g.beginPath(); LL.g.rect(-10, -100, full + 20, 200);
      LL.g.globalCompositeOperation = "source-atop"; LL.g.fillText(WORD6, -2.5, -3); LL.g.restore();
      LL.g.restore();
    }
    LL.g.restore();
    // contact shadow round the lid, then the rows
    const [ca, cb] = [lidPt(0, LIDH), lidPt(LIDW, LIDH)];
    K.shadowBlob(c, (ca[0] + cb[0]) / 2, ca[1] - 4, (cb[0] - ca[0]) * 0.6, 8, { alpha: 0.6 });
    const N = 30, px = K.pixelScale();
    for (let k = 0; k < N; k++) {
      const v0 = k / N, v1 = (k + 1) / N;
      const Z0 = lerp(LIDF.Zf, LIDF.Zn, v0), Z1 = lerp(LIDF.Zf, LIDF.Zn, v1), Zm = (Z0 + Z1) / 2;
      const y0 = flY(Z0), y1 = flY(Z1), xl = flX(LIDF.X0, Zm), xr = flX(LIDF.X1, Zm);
      c.drawImage(LL.canvas, 0, v0 * LIDH * px, LIDW * px, (v1 - v0) * LIDH * px, xl, y0, xr - xl, y1 - y0 + 0.5);
    }
    // the nib follows the writing: along the word, bobbing through the letter shapes; between words it lifts
    const writing = write > 0 && write < 1;
    const lx = x0 + full * sc * write, ly = LIDH * 0.52 + (Math.sin(lt * 9.3) * 22 + Math.sin(lt * 4.1) * 10) * (writing ? 1 : 0) - (writing ? 0 : 30);
    const [tipX, tipY0] = lidPt(lx, ly), lift = writing ? 0 : 4, tipY = tipY0 - lift;
    const HB = hand7();
    const ang = Math.atan2(BAR7[1], BAR7[0]) + Math.sin(lt * 3) * 0.03;
    // the cast shadow of the hand and the marker on the lid: thrown right, away from the heater, and
    // sharp where the nib touches, softening further up the barrel
    c.save();
    c.translate(tipX, tipY0);
    c.globalAlpha = 0.42;
    c.strokeStyle = "#0a0604"; c.lineWidth = 3.4; c.lineCap = "round";
    if (K.hasFilter()) c.filter = "blur(1.2px)";
    c.beginPath(); c.moveTo(1, 0); c.lineTo(30, 3); c.stroke();
    c.filter = "none";
    if (HB) {
      if (K.hasFilter()) c.filter = "blur(3px) brightness(0)";
      c.globalAlpha = 0.38;
      c.drawImage(HB, -HAND7.hx * HK7 + 22, -HAND7.hy * HK7 + 6, HB.lw * HK7 * 1.05, HB.lh * HK7 * 0.55);
      c.filter = "none";
    }
    c.restore();
    // the marker under the fingers, then the hand, then the sleeve cuff over the wrist
    drawMarker(c, tipX, tipY, ang - 0.3, 72);
    if (HB) {
      c.save(); c.translate(tipX, tipY); c.rotate(Math.sin(lt * 3) * 0.03);
      const SL = sleeve7();
      const wx = BAR7[0] * 4.6 * HR7 * HK7, wy = BAR7[1] * 4.6 * HR7 * HK7;
      c.drawImage(HB, -HAND7.hx * HK7, -HAND7.hy * HK7, HB.lw * HK7, HB.lh * HK7);
      if (SL) { c.save(); c.translate(wx, wy); c.rotate(Math.atan2(BAR7[1], BAR7[0]) + Math.PI); c.scale(0.5, 0.5); c.translate(-SL.lw + 6, -SL.lh / 2); c.drawImage(SL, 0, 0, SL.lw, SL.lh); c.restore(); }
      c.restore();
    }
  });
}
// ---- shot 7: the bell room at the top of the tower, present ----------------------------------------
// One light: the moon through the open arch on the right. It lights the reveal, throws a long slanted
// patch across the dusty boards, and leaves the rest of the room in deep blue shadow (ambient only).
const HZ7 = 252, WIN7 = { x: 724, y: 118, w: 150, h: 222 };
// old floorboards: five planks a tile, long grain, butt joints at random, dark gaps, per-plank tone
// old floorboards, grey-beige with age: five planks a tile, flowing grain (warped growth lines), knots,
// butt joints at random, dark gaps between the boards, per-plank tone
const boardTex = () => bakeSurface("boards2", 256, 256, (u, v, S) => {
  const n = 5, pi = Math.floor(u * n), fu = u * n - pi;
  const vj = hash(pi, 77), dj = Math.abs(((v - vj + 1.5) % 1) - 0.5);
  const gap = Math.min(fu, 1 - fu) * (256 / n) < 1.3 || dj > 0.497;
  if (gap) { S.h = 0.02; S.r = 22; S.g = 19; S.b = 16; return; }
  // a knot per plank: the grain flows round it
  const kv = hash(pi, 83), ku = 0.3 + hash(pi, 84) * 0.4, kdx = (fu - ku) * 2.2, kdy = (((v - kv + 1.5) % 1) - 0.5) * 9, kd = Math.sqrt(kdx * kdx + kdy * kdy);
  const swirl = Math.exp(-kd * 1.4) * 0.9;
  const warp = tF(u * 7, v * 1.2, 81 + pi, 3) * 0.7 + swirl * (kdx < 0 ? -1 : 1);
  const rings = 0.5 + 0.5 * Math.sin((fu * 7 + warp * 2.4 + tF(u * 24, v * 2, 78 + pi, 3) * 0.6) * TAU);
  const late = Math.pow(rings, 4), fine = tN(u * 230, v * 9, 79), pore = tN(u * 400, v * 30, 82);
  const tone = 0.8 + hash(pi, 80) * 0.3;
  S.h = 0.5 - late * 0.04 + fine * 0.012 - Math.pow(Math.abs(fu - 0.5) * 2, 6) * 0.08 - (kd < 0.35 ? 0.05 : 0);
  const k = tone * (0.92 - late * 0.2 + fine * 0.05 + pore * 0.03);
  S.r = 150 * k; S.g = 138 * k; S.b = 120 * k;
  if (kd < 0.35) { const q = 1 - kd / 0.35; S.r -= 50 * q; S.g -= 50 * q; S.b -= 46 * q; }
}, { light: [0.5, -0.2, 0.7], amb: 0.55, bump: 3, ao: 1 });
// the moonlight pool through the arch: sharp right at the sill, the penumbra widening with distance
// (each band of the floor is blurred more than the one before it)
const POOL7 = (y) => { const q = (y - 342) / (LH + 20 - 342); return [lerp(WIN7.x - WIN7.w / 2 + 10, 230, q), lerp(WIN7.x + WIN7.w / 2 - 6, 560, q)]; };
function moonPool(g) {
  const tr = new Path2D(); const [a0, b0] = POOL7(342), [a1, b1] = POOL7(LH + 20);
  tr.moveTo(a0, 342); tr.lineTo(b0, 342); tr.lineTo(b1, LH + 20); tr.lineTo(a1, LH + 20); tr.closePath();
  const nB = 6, bh = (LH + 20 - 342) / nB;
  for (let i = 0; i < nB; i++) {
    g.save(); g.beginPath(); g.rect(0, 342 + i * bh - (i ? 6 : 40), LW, bh + 12); g.clip();
    if (K.hasFilter()) g.filter = "blur(" + (2 + i * 3.5) + "px)";
    g.fillStyle = "#fff"; g.fill(tr); g.restore();
  }
}
// one pawprint pressed into the dust, per pixel: the pad and four toe beans are hollows where the dust
// is pushed away (the clean, darker wood shows), the displaced dust a raised rim round them; lit by the
// moon raking in from the right (lit = 1) or by the dim blue ambient only
function pawHollow(uu, vv) {
  let d = 9;
  const pad = Math.sqrt((uu / 0.62) ** 2 + ((vv - 0.42) / 0.5) ** 2) - 1 + 0.12 * Math.cos(uu * 9) * sm(0.3, 0.9, vv);
  d = Math.min(d, pad * 0.55);
  for (let k = 0; k < 4; k++) { const a = -Math.PI / 2 + (k - 1.5) * 0.5, cx = Math.cos(a) * 0.98, cy = Math.sin(a) * 0.85 + 0.12; const e = Math.sqrt(((uu - cx) / 0.24) ** 2 + ((vv - cy) / 0.3) ** 2) - 1; d = Math.min(d, e * 0.26); }
  return d;
}
const pawH = (uu, vv) => { const d = pawHollow(uu, vv); return d < 0 ? -0.5 * sm(0, -0.08, d) : 0.35 * Math.exp(-((d - 0.06) ** 2) / 0.004); };
function pawSprite(lit) {
  return pixBake("f04paw7" + lit, 64, 64, (x, y, out) => {
    const u = (x + 0.5 - 32) / 13, v = (y + 0.5 - 34) / 13;
    const h = pawH(u, v), hx = pawH(u + 0.03, v) - h, hy = pawH(u, v + 0.03) - h, d = pawHollow(u, v);
    const nx = -hx * 12, ny = -hy * 12, nl = Math.sqrt(nx * nx + ny * ny + 1), ndl = (nx * 0.75 - ny * 0.25 + 0.6) / nl;
    const sh = lit ? clamp(0.25 + ndl * 0.95) : 0.6;
    const inH = d < 0 ? sm(0, -0.05, d) : 0, rim = d >= 0 ? Math.exp(-((d - 0.06) ** 2) / 0.006) : 0;
    const grit = tN(x * 0.9, y * 0.9, 85) * 0.5 + 0.5;
    if (inH > 0.01) {
      const L = lit ? [0.9, 0.95, 1.12] : [0.42, 0.46, 0.6];
      out[0] = 112 * sh * L[0] * (0.9 + grit * 0.15); out[1] = 96 * sh * L[1] * (0.9 + grit * 0.15); out[2] = 80 * sh * L[2] * (0.9 + grit * 0.15);
      out[3] = 255 * inH * (0.85 + grit * 0.15);
    } else {
      const L = lit ? [1.0, 1.04, 1.16] : [0.46, 0.5, 0.64];
      out[0] = 206 * sh * L[0]; out[1] = 202 * sh * L[1]; out[2] = 192 * sh * L[2];
      out[3] = 255 * clamp(rim * (0.4 + grit * 0.5));
    }
  });
}
// your hand from the back, relaxed, fingers loosely curled, rising into the moonlight; the capsule skin
// model again (layout "none"), the moon from the arch on the right, deep blue ambient elsewhere
const HR8 = 40, HAND8 = { W: 5.2 * HR8, H: 5.6 * HR8, hx: 1.7 * HR8, hy: 4.2 * HR8 };
function relaxedCaps() {
  const d = [0.5, -0.866], n = [0.866, 0.5], C = [];
  const P = (t, q) => [d[0] * t + n[0] * q, d[1] * t + n[1] * q];
  const cap = (a, b, ra, rb, za, zb, kind, fl = 0.7) => C.push(a[0], a[1], b[0], b[1], ra, rb, za, zb, kind, fl);
  cap(P(-1.3, 0.05), P(0, 0), 0.5, 0.5, 0.1, 0.12, 0, 0.75);
  cap(P(0, 0), P(1.15, 0.0), 0.6, 0.66, 0.14, 0.16, 0, 0.42);
  const F = [[-0.46, 0.95], [-0.15, 1.0], [0.16, 0.94], [0.45, 0.76]];
  for (let f = 0; f < 4; f++) {
    const [q, lk] = F[f];
    let t = 1.2, qq = q, z = 0.2 + (f === 1 ? 0.04 : 0);
    const segs = [[0.72, 0.21, 0.3], [0.46, 0.2, 0.5], [0.34, 0.185, 0.6]];
    for (let k = 0; k < 3; k++) {
      const [len, r, curl] = segs[k], l = len * lk * (1 - curl * 0.45);
      const nt = t + l, nq = qq + q * 0.08, nz = z - curl * 0.12;
      cap(P(t, qq), P(nt, nq), r, r * 0.95, z, nz, k + 1);
      t = nt; qq = nq; z = nz;
    }
  }
  cap(P(0.25, -0.62), P(0.85, -1.02), 0.3, 0.26, 0.1, 0.16, 1);
  cap(P(0.85, -1.02), P(1.35, -1.12), 0.25, 0.22, 0.16, 0.12, 3);
  return Float64Array.from(C);
}
const handO8 = { R: HR8, W: HAND8.W, H: HAND8.H, hx: HAND8.hx, hy: HAND8.hy, layout: "none", caps: null, wet: 0, light: [0.8, -0.35, 0.5], key: [0.62, 0.7, 0.95], amb: [0.07, 0.08, 0.13], rim: [0.55, 0.66, 1.0], rimDir: [1, -0.25], seed: 29 };
const hand8 = () => { if (!handO8.caps) handO8.caps = relaxedCaps(); return kitBake("f04hand8", handO8); };
const sleeve8 = () => sleeveBake("f04sleeve8", 300, 44, 30);
const HK8 = 0.95;
function paintBellRoomAlbedo(s) {
  // the back wall: dressed stone
  const pat = s.createPattern(ashlarTex(5, "#7e7a72", 6), "repeat");
  setPat(pat, 0.4, 0, 0, 0.4, 0, 0);
  s.fillStyle = pat; s.fillRect(0, 0, LW, 340);
  // the floor: old oak boards running away from us (they converge on the eye line), grey with dust
  planeStrips(s, boardTex(), HZ7, 338, LH + 10, 480, 120);
  s.globalCompositeOperation = "soft-light";
  s.fillStyle = "#b8b4ac"; s.fillRect(0, 338, LW, LH);
  s.globalCompositeOperation = "source-over";
  // dust: pale and mottled, thickest away from where feet go (along the walls)
  s.drawImage(K.texBake("f04dustfl", 192, 64, (u, v, out) => {
    const n = tF(u * 6, v * 3, 91, 4, 6, 3), m = tN(u * 40, v * 14, 92, 40, 14);
    out[0] = 190; out[1] = 186; out[2] = 178; out[3] = clamp(0.25 + n * 0.45 + (m - 0.5) * 0.2 + v * 0.1) * 150;
  }), 0, 338, LW, LH - 338);
  // the timber bell frame: two posts, a head beam, a brace
  const beam = (x, y, w, h, rot) => { s.save(); s.translate(x, y); s.rotate(rot || 0); K.texRect(s, "wood", 0, 0, w, h, { scale: 140, rot: h > w ? 0 : Math.PI / 2, tex: { seed: 3 } }); s.fillStyle = "rgba(30,20,12,0.45)"; s.fillRect(0, 0, w, h); s.restore(); };
  beam(-20, 30, LW + 40, 30);
  beam(116, 30, 34, 312);
  beam(852, 30, 34, 312);
  beam(150, 160, 22, 190, -1.0);
}
function paintBellRoom(s) {
  const A = tmp(LW, LH);
  paintBellRoomAlbedo(A.g);
  const wx = WIN7.x, wy = WIN7.y, ww = WIN7.w, wh = WIN7.h;
  const lit = relight(A.c, LW, LH, "#0b1020", [
    // moon spill on the wall round the arch (falls off quickly)
    { color: "#9fb4e0", k: 0.75, mask: radial(wx, wy + 120, 300, [[0, 0.8], [0.35, 0.3], [0.7, 0.06], [1, 0]]) },
    // the slanted patch of moonlight on the boards
    { color: "#c4d4ff", k: 1.5, mask: (g) => moonPool(g) },
    // faint skylight bounce everywhere
    { color: "#2a3656", k: 0.6, mask: linear(LW, 0, 0, 0, [[0, 0.7], [1, 0.2]]) },
  ]);
  s.drawImage(lit, 0, 0, LW, LH);
  // the arch: deep reveal, the night beyond (rooftops, a sky lit by the moon), a worn stone sill
  const arch = new Path2D();
  arch.moveTo(wx - ww / 2, wy + wh); arch.lineTo(wx - ww / 2, wy + ww / 2); arch.arc(wx, wy + ww / 2, ww / 2, Math.PI, 0); arch.lineTo(wx + ww / 2, wy + wh); arch.closePath();
  s.save(); s.clip(arch);
  const sk = s.createLinearGradient(0, wy, 0, wy + wh);
  sk.addColorStop(0, "#0a1228"); sk.addColorStop(0.7, "#2a3a62"); sk.addColorStop(1, "#4a5478");
  s.fillStyle = sk; s.fillRect(wx - ww, wy, ww * 2, wh);
  K.stars(s, LW, 260, 9, 1.2, 0);
  const R = K.rng("f04wr");
  // far terraces seen from high up: long low roof lines in steps, chimney stacks, a few lit windows
  for (let r = 0; r < 3; r++) {
    const y0 = wy + wh - 44 + r * 16, col = ["#1a2038", "#11152a", "#0a0d18"][r];
    let x = wx - ww / 2 - 20 - R() * 30;
    while (x < wx + ww / 2 + 10) {
      const w = 40 + R() * 70, h = 6 + R() * 5;
      s.fillStyle = col; s.beginPath(); s.moveTo(x, y0 + 40); s.lineTo(x, y0); s.lineTo(x + 3, y0 - h); s.lineTo(x + w - 3, y0 - h); s.lineTo(x + w, y0); s.lineTo(x + w, y0 + 40); s.fill();
      s.fillStyle = "rgba(170,190,240,0.25)"; s.fillRect(x + 3, y0 - h, w - 6, 1);
      for (let cx = x + 8 + R() * 10; cx < x + w - 6; cx += 18 + R() * 14) { s.fillStyle = col; s.fillRect(cx, y0 - h - 6, 4, 6); }
      if (R() > 0.5) { s.fillStyle = "#c08a50"; s.fillRect(x + 6 + R() * (w - 12), y0 + 4, 2, 3); }
      x += w + 2 + R() * 6;
    }
  }
  s.restore();
  // the reveal: the left jamb takes the moon, the right is in shade
  s.fillStyle = "#6a7898"; s.beginPath(); s.moveTo(wx - ww / 2 - 14, wy + wh + 4); s.lineTo(wx - ww / 2 - 14, wy + ww / 2); s.lineTo(wx - ww / 2, wy + ww / 2); s.lineTo(wx - ww / 2, wy + wh); s.fill();
  K.texRect(s, "granite", wx - ww / 2 - 14, wy + ww / 2, 14, wh - ww / 2 + 4, { scale: 60, alpha: 0.4, mode: "overlay", tex: { seed: 4, lichen: 0 } });
  s.fillStyle = "#1a2030"; s.beginPath(); s.moveTo(wx + ww / 2, wy + wh); s.lineTo(wx + ww / 2, wy + ww / 2); s.lineTo(wx + ww / 2 + 12, wy + ww / 2); s.lineTo(wx + ww / 2 + 12, wy + wh + 4); s.fill();
  // sill: moonlit top, shadowed front
  s.fillStyle = "#8a98b8"; s.fillRect(wx - ww / 2 - 16, wy + wh, ww + 30, 5);
  s.fillStyle = "#1c2232"; s.fillRect(wx - ww / 2 - 16, wy + wh + 5, ww + 30, 9);
  K.aoEdge(s, 0, 340, LW, 340, { width: 34, alpha: 0.55, side: 0 });
  for (const x of [116, 852]) K.aoEdge(s, x - 10, 340, x + 44, 340, { width: 14, alpha: 0.6, side: 1 });
  // raking moonlight on the dust: in the lit patch every fleck of grit catches the light (bright
  // specks, denser and smaller with distance), the board edges get a lit lip
  s.save();
  s.beginPath(); s.moveTo(wx - ww / 2 + 10, 342); s.lineTo(wx + ww / 2 - 6, 342); s.lineTo(560, LH + 20); s.lineTo(230, LH + 20); s.closePath(); s.clip();
  const RD = K.rng("f04grit");
  for (let i = 0; i < 1600; i++) {
    const y = 342 + Math.pow(RD(), 1.6) * (LH - 342), x = lerp(lerp(wx - ww / 2, 230, (y - 342) / (LH - 342)), lerp(wx + ww / 2, 560, (y - 342) / (LH - 342)), RD());
    const k = (y - 252) / 300, a = 0.18 + RD() * 0.4;
    s.fillStyle = "rgba(225,232,255," + a.toFixed(2) + ")"; s.fillRect(x, y, 0.5 + k * RD() * 1.2, 0.5 + k * 0.6);
  }
  s.restore();
}
const bellRoomPlate = () => spr("f04bell3", LW, LH, paintBellRoom);
function shotBellRoom(g, t, lt) {
  const p = eio(seg(lt, 0, 8));
  const lift = eio(seg(lt, 0.2, 1.8));
  const ring = K.env(lt, 1.0, 3.4, 0.05, 2);
  K.withCamera(g, LW, LH, { x: lerp(468, 500, p), y: lerp(272, 282, p), zoom: lerp(1.0, 1.06, p), shakeT: t * 0.7, shakeAmt: 1.1 }, (c) => {
    c.drawImage(bellRoomPlate(), 0, 0, LW, LH);
    // the moonbeam: a volumetric shaft from the arch down onto the boards, dust turning in it
    const BL = K.layer(LW, LH, "f04beam7");
    K.volumetricBeam(BL.g, WIN7.x - 10, WIN7.y + WIN7.h - 30, 2.25, 420, 0.5, { color: "#c4d4ff", intensity: 0.32, t: lt, width0: 60, seed: 7 });
    c.save(); c.globalCompositeOperation = "lighter"; c.drawImage(BL.canvas, 0, 0, LW, LH); c.restore();
    // his pawprints pressed into the dust (the boards show dark through), fresh; they curve across the
    // moonlit patch to the sill and stop there. A faint amber glow comes up in them.
    const P = (u) => { const v = 1 - u; return [v * v * 300 + 2 * v * u * 560 + u * u * 716, v * v * 470 + 2 * v * u * 420 + u * u * 352]; };
    const pts = [];
    for (let i = 0; i < 13; i++) {
      const u = i / 12, [x0, y0] = P(u), [x1, y1] = P(Math.min(1, u + 0.02));
      const ang = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2, side = i % 2 ? 1 : -1;
      const px0 = x0 + Math.cos(ang) * side * 7, py0 = y0 + Math.sin(ang) * side * 3, pq = (py0 - 342) / (LH - 342);
      const lit = clamp(Math.min(px0 - lerp(WIN7.x - WIN7.w / 2, 230, pq), lerp(WIN7.x + WIN7.w / 2, 560, pq) - px0) / 30);
      pts.push({ x: px0, y: py0, a: ang, s: lerp(24, 10, u), alpha: 0.85, flat: 0.4, lit });
    }
    const PL = pawSprite(1), PD = pawSprite(0);
    if (PL && PD) for (const q of pts) {
      c.save(); c.translate(q.x, q.y); c.scale(1, 0.42); c.rotate(q.a);
      const sz = q.s * 3.6;
      if (q.lit < 1) { c.globalAlpha = 1 - q.lit; c.drawImage(PD, -sz / 2, -sz / 2, sz, sz); }
      if (q.lit > 0) { c.globalAlpha = q.lit; c.drawImage(PL, -sz / 2, -sz / 2, sz, sz); }
      c.restore();
    }
    c.globalAlpha = 1;
    const amber = smooth(seg(lt, 0.8, 2.2));
    if (amber > 0.01) K.pawprints(c, pts.map((q) => Object.assign({}, q, { alpha: q.alpha * amber * 0.12 })), 0.08 * amber);
    // the great silent bell overhead, in the frame's shadow, its lip catching the moon
    bigBell(c, 470, 92, 175, Math.sin(lt * 0.4) * 0.004, 1);
    // the shaft is full of dust: soft rays broken up by drifting occlusion, and the motes themselves
    K.godRays(c, WIN7.x - 20, WIN7.y + 40, LW, LH, { color: "#bcd0ff", count: 7, strength: 0.16, t: lt, angle: 2.3, spread: 0.32, length: 520, seed: 8 });
    c.save(); c.beginPath();
    c.moveTo(WIN7.x - WIN7.w / 2, WIN7.y + 30); c.lineTo(WIN7.x + WIN7.w / 2, WIN7.y + 30); c.lineTo(560, LH); c.lineTo(230, LH); c.closePath(); c.clip();
    K.dust(c, LW, LH, lt, { seed: 21, count: 90, color: "#e0e8ff", size: 1.2, area: [220, 140, 600, 400], alpha: 0.65 });
    c.restore();
  });

  // your hand rises into frame from below: the hoodie sleeve, the wrist with the little bell on its red
  // string; the bell swings under the wrist and rings under the huge silent one
  const hx = 196, hy = lerp(720, 396, lift) + Math.sin(lt * 1.4) * 3;
  const tilt = Math.sin(lt * 7) * 0.025 * ring;
  const HB = hand8(), SL = sleeve8();
  g.save(); g.translate(hx, hy); g.rotate(tilt);
  if (HB) g.drawImage(HB, -HAND8.hx * HK8, -HAND8.hy * HK8, HB.lw * HK8, HB.lh * HK8);
  if (SL) { g.save(); g.translate(-0.5 * 1.05 * HR8 * HK8, 0.866 * 1.05 * HR8 * HK8); g.rotate(Math.atan2(-0.866, 0.5)); g.scale(0.62, 0.62); g.translate(-SL.lw + 4, -SL.lh / 2); g.drawImage(SL, 0, 0, SL.lw, SL.lh); g.restore(); }
  // the red string round the wrist, over the cuff's edge
  const wx = 0.5 * -0.55 * HR8 * HK8, wy = -0.866 * -0.55 * HR8 * HK8;
  const sa = Math.atan2(0.5, 0.866), ex = Math.cos(sa) * 15, ey = Math.sin(sa) * 15;
  g.strokeStyle = "#7a1812"; g.lineWidth = 2.4; g.lineCap = "round";
  g.beginPath(); g.moveTo(wx - ex, wy - ey); g.quadraticCurveTo(wx + 2, wy + 7, wx + ex, wy + ey); g.stroke();
  g.strokeStyle = "rgba(190,200,240,0.35)"; g.lineWidth = 0.8; g.beginPath(); g.moveTo(wx - ex * 0.3, wy - ey * 0.3 + 2); g.quadraticCurveTo(wx + 2, wy + 6, wx + ex * 0.6, wy + ey * 0.6 + 1); g.stroke();
  g.restore();
  // the bell hangs off it as a pendulum in screen space (gravity is down whatever the wrist does)
  const px0 = hx + wx * Math.cos(tilt) - wy * Math.sin(tilt) + 2, py0 = hy + wx * Math.sin(tilt) + wy * Math.cos(tilt) + 5;
  const th = 0.42 * Math.sin(lt * 5.4) * ring + 0.06 * Math.sin(lt * 1.3), Lp = 24;
  const bx = px0 + Math.sin(th) * Lp, by = py0 + Math.cos(th) * Lp;
  g.strokeStyle = "#7a1812"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(px0, py0); g.lineTo(bx, by - 6); g.stroke();
  g.save(); g.translate(bx, by); g.rotate(-th); g.translate(-bx, -by);
  K.drawBell(g, bx, by, 20, { t: lt, glint: 0.4 + ring * 0.6 });
  // the bronze takes a cool rim from the moon in the arch (its right flank)
  g.globalCompositeOperation = "lighter";
  const rg = g.createLinearGradient(bx, 0, bx + 9, 0); rg.addColorStop(0, "rgba(188,208,255,0)"); rg.addColorStop(1, "rgba(188,208,255,0.55)");
  g.strokeStyle = rg; g.lineWidth = 2; g.beginPath(); g.arc(bx, by - 3, 10.5, -1.2, 1.0); g.stroke();
  g.globalCompositeOperation = "source-over";
  g.restore();
  K.bellGlint(g, bx, by - 3, 8 + ring * 8, lt, { strength: 0.3 + ring * 0.9 });
}
// ---- shot 8: over the rooftops toward the manor on the hill ------------------------------------------
// Moonlight from the upper left is the key; every layer of roofs further away is lower in contrast and
// bluer-violet (haze). Far lightning behind the manor flickers the cloud undersides.
const HAZE8 = "#2c2648";
function paintRoofSky(s, w, h) {
  K.sky(s, w, h, { top: "#04060f", mid: "#121634", bottom: "#3a2e58", horizon: 0.75, night: true, glow: "#4a3a6a", haze: 0.5 });
  K.stars(s, w, h, 12, 1.0, 0, { yMax: 300 });
}
function paintHill(s) {
  // the hill: a turf-textured slope, hazed; the crest catches the moon
  const hill = new Path2D();
  hill.moveTo(-80, 372); hill.bezierCurveTo(200, 346, 420, 252, 560, 224); hill.lineTo(660, 222); hill.bezierCurveTo(780, 238, 880, 292, 1080, 330); hill.lineTo(1080, LH); hill.lineTo(-80, LH); hill.closePath();
  s.fillStyle = "#1a1430"; s.fill(hill);
  K.texFill(s, "turf", hill, { scale: 70, alpha: 0.35, mode: "overlay", tex: { seed: 2 } });
  s.save(); s.clip(hill);
  s.drawImage(K.texBake("f04hillveg", 384, 128, (u, v, out) => {
    // dark copses and hedges (high fbm), paler moonlit grass between, tiny crowns breaking the edges
    const n = tF(u * 9, v * 4, 141, 5), m = tN(u * 60, v * 22, 142), tree = sm(0.08, 0.3, n + m * 0.08);
    const lit = sm(0.25, -0.2, n) * (0.5 + 0.5 * (1 - v));
    out[0] = lerp(52 + lit * 40, 10, tree); out[1] = lerp(50 + lit * 44, 9, tree); out[2] = lerp(80 + lit * 60, 22, tree);
    out[3] = 255 * clamp(0.35 + tree * 0.6 + m * 0.06);
  }), -80, 200, 1160, 200);
  s.restore();
  gradFill(s, hill, 0, 220, 0, 400, [[0, rgba(HAZE8, 0.35)], [1, rgba(HAZE8, 0.05)]]);
  // fields and hedgerows on the slope, a lane winding up to the gate with a few lamps
  s.save(); s.clip(hill);
  s.strokeStyle = "rgba(6,4,14,0.55)"; s.lineWidth = 2;
  for (let i = 0; i < 6; i++) { const y0 = 250 + i * 22; s.beginPath(); s.moveTo(200 + i * 30, y0 + 120); s.bezierCurveTo(360, y0 + 40 - i * 6, 640, y0 - 10, 960, y0 + 60 + i * 8); s.stroke(); }
  const lane = new Path2D(); lane.moveTo(120, 380); lane.bezierCurveTo(330, 330, 420, 300, 470, 278); lane.bezierCurveTo(530, 252, 560, 244, 600, 226);
  s.strokeStyle = "rgba(120,116,160,0.4)"; s.lineWidth = 3; s.stroke(lane);
  s.restore();
  for (const [lx, ly] of [[250, 345], [380, 306], [470, 277], [555, 244]]) { s.fillStyle = "#ffd59a"; s.fillRect(lx - 1, ly - 3, 2, 2); s.fillStyle = "rgba(255,170,90,0.2)"; s.beginPath(); s.arc(lx, ly - 2, 6, 0, TAU); s.fill(); }
  s.strokeStyle = "rgba(170,160,230,0.35)"; s.lineWidth = 1.4;
  s.beginPath(); s.moveTo(-10, 366); s.bezierCurveTo(200, 346, 420, 252, 560, 224); s.lineTo(640, 222); s.stroke();
  // bare trees along the lane up the hill, small with distance
  s.strokeStyle = "#110c20";
  for (let i = 0; i < 9; i++) { const x = 360 + i * 36, y = 290 - i * 7.5 + (i > 6 ? 8 : 0); branch(s, x, y, -Math.PI / 2 + (hash(i, 2) - 0.5) * 0.2, 9 + hash(i, 3) * 4, 1.6, 4, 11 + i); }
  // the manor: towers, steep roofs, chimneys; a few candle-warm windows; the moon on its left faces
  const mx = 610, my = 224;
  s.fillStyle = "#0b0818";
  s.fillRect(mx - 62, my - 38, 124, 40);
  s.fillRect(mx - 76, my - 76, 24, 78);
  s.beginPath(); s.moveTo(mx - 80, my - 76); s.lineTo(mx - 64, my - 116); s.lineTo(mx - 48, my - 76); s.fill();
  s.fillRect(mx + 42, my - 62, 18, 64);
  s.beginPath(); s.moveTo(mx + 38, my - 62); s.lineTo(mx + 51, my - 96); s.lineTo(mx + 64, my - 62); s.fill();
  s.beginPath(); s.moveTo(mx - 68, my - 38); s.lineTo(mx, my - 68); s.lineTo(mx + 68, my - 38); s.fill();
  s.fillRect(mx - 30, my - 82, 7, 22); s.fillRect(mx + 20, my - 78, 7, 18);
  s.fillStyle = "rgba(150,140,210,0.3)";
  s.fillRect(mx - 76, my - 76, 2, 78); s.fillRect(mx - 62, my - 38, 2, 40);
  s.beginPath(); s.moveTo(mx - 80, my - 76); s.lineTo(mx - 64, my - 116); s.lineTo(mx - 63, my - 112); s.lineTo(mx - 77, my - 76); s.fill();
  for (const [x, y] of [[mx - 32, my - 24], [mx + 12, my - 26], [mx - 68, my - 56]]) { s.fillStyle = "#ffcf80"; s.fillRect(x, y, 3.5, 5.5); s.fillStyle = "rgba(255,170,90,0.25)"; s.fillRect(x - 3, y - 3, 9.5, 11.5); }
}
// one row of terraced houses: a continuous slate roof (its near slope faces us and the moon), broken by
// side streets where a gable end shows; chimney stacks in a line along the ridge; windows under the eaves
function paintTerraceRow(s, eave0, sc, seed, haze, W) {
  let eave = eave0;
  const R = K.rng("f04row" + seed);
  const wallH = 46 * sc, pitch = 0.7 + hash(seed, 17) * 0.7, gapK = 0.6 + hash(seed, 18) * 1.1;
  let x = -80 - R() * 160 * sc;
  while (x < W + 40) {
    const big = R() > 0.85, len = (big ? 120 + R() * 120 : 200 + R() * 420) * sc, x1 = x + len;
    const e0 = eave0 - (big ? 22 * sc : (R() - 0.5) * 16 * sc), rh = (big ? 46 : 20 + R() * 20) * sc * pitch, ridge = e0 - rh, ins = (3 + R() * 12) * sc;
    eave = e0;
    // the wall below the eaves (mostly hidden by the next row) with lit windows
    s.fillStyle = "#0b0a12"; s.fillRect(x, eave, len, wallH);
    for (let wx = x + 12 * sc; wx < x1 - 14 * sc; wx += 22 * sc) {
      if (R() > 0.72) { s.fillStyle = mix("#ffc070", HAZE8, haze * 0.55); s.fillRect(wx, eave + 9 * sc, 6 * sc, 9 * sc); s.fillStyle = "rgba(255,170,90,0.12)"; s.fillRect(wx - 4 * sc, eave + 5 * sc, 14 * sc, 17 * sc); }
    }
    // the roof slope
    const roof = polyPath([[x, eave], [x + ins, ridge], [x1 - ins, ridge], [x1, eave]]);
    K.texFill(s, "shingle", roof, { scale: 22 * sc, scaleY: 15 * sc, tex: { seed: 6 + (seed % 3), color: ["#3a3e48", "#363a46", "#40424a"][seed % 3] } });
    gradFill(s, roof, 0, ridge, 0, eave, [[0, "rgba(110,124,180,0.3)"], [0.45, "rgba(10,12,30,0.35)"], [1, "rgba(2,2,8,0.7)"]]);
    gradFill(s, roof, x, 0, x1, 0, [[0, "rgba(140,150,210,0.12)"], [1, "rgba(0,0,0,0.25)"]]);
    // the slates are wet: the moon (upper left) is a broad soft sheen down the slope, and single slates
    // tilted toward it flash in the courses
    s.save(); s.clip(roof);
    s.globalCompositeOperation = "lighter";
    const mx0 = x + len * (0.15 + R() * 0.3), sg = s.createRadialGradient(mx0, ridge + rh * 0.35, 0, mx0, ridge + rh * 0.35, len * 0.45);
    sg.addColorStop(0, "rgba(150,166,220,0.2)"); sg.addColorStop(1, "rgba(150,166,220,0)");
    s.fillStyle = sg; s.fillRect(x, ridge, len, rh + 2);
    const course = 15 * sc * 0.5;
    for (let yy = ridge + course; yy < eave; yy += course) {
      for (let xx = x + R() * 30 * sc; xx < x1; xx += (8 + R() * 40) * sc) {
        if (R() > 0.55) continue;
        s.fillStyle = "rgba(196,210,255," + (0.08 + R() * 0.22).toFixed(2) + ")"; s.fillRect(xx, yy - 1, (4 + R() * 6) * sc, Math.max(0.7, 1.1 * sc));
      }
    }
    s.restore();
    s.fillStyle = "rgba(200,212,255,0.55)"; s.fillRect(x + ins, ridge - 0.6, len - 2 * ins, 1.4);
    s.fillStyle = "rgba(0,0,0,0.6)"; s.fillRect(x, eave - 1, len, 2.5 * sc);
    // the gable end at the left (moon side): lit brick triangle and wall
    const gab = polyPath([[x, eave + wallH], [x, eave], [x + ins, ridge], [x - 10 * sc, eave], [x - 10 * sc, eave + wallH]]);
    s.fillStyle = "#2a2438"; s.fill(gab);
    // a dormer or a lit skylight now and then
    if (R() > 0.5) { const dx = x + len * (0.2 + R() * 0.6); s.fillStyle = mix("#ffd090", HAZE8, haze * 0.6); s.fillRect(dx, ridge + rh * 0.4, 7 * sc, 5 * sc); }
    // chimney stacks along the ridge on the party walls, pots on top, moonlit left side
    for (let cx = x + (30 + R() * 30) * sc; cx < x1 - 20 * sc; cx += (60 + R() * 50) * sc) {
      const cw = 16 * sc, ch = (18 + R() * 10) * sc;
      s.fillStyle = "#16121c"; s.fillRect(cx, ridge - ch, cw, ch + rh * 0.3);
      K.texRect(s, "brick", cx, ridge - ch, cw, ch, { scale: 16 * sc, alpha: 0.3, tex: BRICK });
      s.fillStyle = "rgba(160,172,230,0.4)"; s.fillRect(cx, ridge - ch, 1.3, ch);
      s.fillStyle = "#16121c"; s.fillRect(cx - 1.5 * sc, ridge - ch - 3 * sc, cw + 3 * sc, 3 * sc);
      for (let k = 0; k < 3; k++) if (R() > 0.3) { s.fillStyle = "#22181c"; s.fillRect(cx + (2 + k * 5) * sc, ridge - ch - 8 * sc, 3 * sc, 5 * sc); }
    }
    // the side street beyond this block: sodium light rising out of it, warming the gable walls
    const gx = x1 + (10 + R() * 30) * sc * gapK;
    const sl = s.createLinearGradient(0, eave + wallH, 0, eave - 30 * sc);
    sl.addColorStop(0, `rgba(255,150,70,${0.4 * (1 - haze)})`); sl.addColorStop(1, "rgba(255,150,70,0)");
    s.fillStyle = sl; s.fillRect(x1 - 4 * sc, eave - 30 * sc, gx - x1 + 8 * sc, wallH + 30 * sc);
    x = gx;
  }
  if (haze > 0) { s.globalCompositeOperation = "source-atop"; s.fillStyle = rgba("#4a4c80", haze); s.fillRect(-100, 0, W + 200, LH); s.globalCompositeOperation = "source-over"; }
}
const ROWS8 = [[352, 0.26, 1], [368, 0.36, 2], [389, 0.5, 3], [416, 0.66, 4], [452, 0.88, 5], [496, 1.18, 6], [552, 1.6, 7]].map((r, i) => r.concat([1 - Math.pow(0.85, 6 - i)]));
const RW8 = LW + 120;
// one terrace row as its own cached sprite (so they can be built one per frame while the bell room
// plays), with its haze veil and, for row 4, the church and the garden trees in front of it
function rowSprite(i) {
  const [eave, sc, seed, hz] = ROWS8[i];
  return spr("f04row" + seed, RW8, LH, (s) => {
    s.translate(60, 0);
    if (seed === 4) {
      const cx = 330, cb = 420;
      s.fillStyle = mix("#0b0a12", HAZE8, 0.4); s.fillRect(cx - 14, cb - 120, 28, 120);
      s.beginPath(); s.moveTo(cx - 16, cb - 120); s.lineTo(cx, cb - 190); s.lineTo(cx + 16, cb - 120); s.fill();
      s.fillStyle = "rgba(150,160,220,0.28)"; s.fillRect(cx - 14, cb - 120, 1.5, 120);
      s.beginPath(); s.moveTo(cx - 16, cb - 120); s.lineTo(cx, cb - 190); s.lineTo(cx - 14, cb - 120); s.fill();
      s.fillStyle = "#c89a5a"; s.fillRect(cx - 3, cb - 100, 6, 9);
      s.strokeStyle = mix("#08070e", HAZE8, 0.3);
      for (let k = 0; k < 7; k++) { const tx0 = 80 + k * 150 + hash(k, 6) * 60; branch(s, tx0, eave + 4, -Math.PI / 2 + (hash(k, 7) - 0.5) * 0.2, 16 + hash(k, 8) * 10, 2.4, 5, 30 + k); }
    }
    const B = tmp(RW8, LH);
    paintTerraceRow(B.g, eave, sc, seed, hz, RW8);
    s.drawImage(B.c, 0, 0, RW8, LH);
    const mg = s.createLinearGradient(0, eave - 40 * sc, 0, eave + 6);
    mg.addColorStop(0, "rgba(120,124,170,0)"); mg.addColorStop(0.7, "rgba(120,124,170," + (0.2 * (1 - sc * 0.4)).toFixed(3) + ")"); mg.addColorStop(1, "rgba(120,124,170," + (0.32 * (1 - sc * 0.4)).toFixed(3) + ")");
    s.fillStyle = mg; s.fillRect(-60, eave - 40 * sc, RW8, 46 * sc + 6);
  });
}
// the rows baked as two parallax layers: the hill and the far rows, and the near rows
const roofsFar = () => spr("f04roofsF", RW8, LH, (s) => { s.save(); s.translate(60, 0); paintHill(s); s.restore(); for (let i = 0; i < 4; i++) s.drawImage(rowSprite(i), 0, 0, RW8, LH); });
const roofsNear = () => spr("f04roofsN", RW8, LH, (s) => { for (let i = 4; i < 7; i++) s.drawImage(rowSprite(i), 0, 0, RW8, LH); });
// a soft moonlit cloud bank, baked (no circles): fbm alpha, lit edges toward the moon
const nightCloud = () => K.texBake("f04ncloud", 256, 80, (u, v, out) => {
  const n = tF(u * 5, v * 2.4, 31, 5, 5, 0), d = tF(u * 5 - 0.03, v * 2.4 - 0.05, 31, 5, 5, 0);
  const a = clamp((n + 0.02) * 2.6) * clamp(Math.sin(v * Math.PI) * 1.6) * clamp(Math.sin(u * Math.PI) * 2.2);
  const lit = clamp(0.4 + (n - d) * 6);
  out[0] = 40 + lit * 70; out[1] = 38 + lit * 66; out[2] = 70 + lit * 90; out[3] = a * 235;
});
const roofSkyPlate = () => spr("f04roofsky2", LW + 120, LH + 80, paintRoofSky);
function shotRoofs(g, t, lt) {
  const p = eio(seg(lt, 0, 6));
  const fl = K.flash(lt, [2.3, 2.45, 4.4], 0.3);
  const camX = lerp(470, 560, p), camY = lerp(290, 262, p);
  K.withCamera(g, LW, LH, { x: camX, y: camY, zoom: lerp(1.0, 1.14, p), shakeT: t * 0.6, shakeAmt: 0.8 }, (c) => {
    c.drawImage(roofSkyPlate(), -60, -40, LW + 120, LH + 80);
    K.moon(c, 150, 92, 24, { glow: 0.7 });
    const cl = nightCloud(), cdx = (lt * 9) % 1200;
    for (const [cx, cy, cw, ch, a] of [[-200, 40, 900, 150, 0.9], [520, 110, 760, 120, 0.75], [140, 190, 640, 70, 0.5]]) { c.globalAlpha = a; c.drawImage(cl, cx + cdx * (ch / 150) - 300, cy, cw, ch); } c.globalAlpha = 1;
    // far lightning behind the manor (~70.5 s). Volumetric: the cloud lights up from INSIDE first (a
    // glow masked by the cloud's own density, brightest round the strike), then the bolt - a branching
    // channel with a white-hot core, a bloom round it and wide violet halation - and the cloud bellies
    if (fl > 0) {
      const BX = 760, BY = 120;
      const CL = K.layer(LW, LH, "f04cloudglow");
      CL.g.globalCompositeOperation = "source-over";
      for (const [cx, cy, cw, ch] of [[-200, 40, 900, 150], [520, 110, 760, 120]]) CL.g.drawImage(cl, cx + cdx * (ch / 150) - 300, cy, cw, ch);
      CL.g.globalCompositeOperation = "source-in";
      const ig = CL.g.createRadialGradient(BX, BY, 0, BX, BY, 420);
      ig.addColorStop(0, "rgba(255,250,255,1)"); ig.addColorStop(0.25, "rgba(200,170,255,0.8)"); ig.addColorStop(0.6, "rgba(120,90,220,0.3)"); ig.addColorStop(1, "rgba(80,60,180,0)");
      CL.g.fillStyle = ig; CL.g.fillRect(0, 0, LW, LH);
      CL.g.globalCompositeOperation = "source-over";
      c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = fl; c.drawImage(CL.canvas, 0, 0, LW, LH); c.restore();
      K.lightPool(c, 740, 200, 360, "#a080ff", { intensity: 0.3 * fl });
      // the bolt into a layer, then laid down three times: wide halation, bloom, the sharp core
      const bolt = lt > 3 ? 7 : 3, BL = K.layer(LW, LH, "f04bolt8");
      BL.g.save(); BL.g.beginPath(); BL.g.rect(0, 0, LW, 236); BL.g.clip();
      K.lightningBolt(BL.g, BX + 10, 96, 742, 232, bolt, { color: "#e4d4ff", alpha: 1, width: 1.3 });
      BL.g.restore();
      c.save(); c.globalCompositeOperation = "lighter";
      if (K.hasFilter()) {
        c.globalAlpha = 0.7 * fl; c.filter = "blur(18px)"; c.drawImage(BL.canvas, 0, 0, LW, LH);
        c.globalAlpha = 0.8 * fl; c.filter = "blur(5px)"; c.drawImage(BL.canvas, 0, 0, LW, LH);
        c.filter = "none";
      }
      c.globalAlpha = fl; c.drawImage(BL.canvas, 0, 0, LW, LH);
      c.restore();
    }
    // two parallax layers: the far rows and the hill move less than the near roofs as we push in
    c.save(); c.translate((camX - 470) * 0.22, (camY - 290) * 0.12);
    c.drawImage(roofsFar(), -60, 0, RW8, LH);
    // the flash catches the manor's towers: a hard violet-white rim down their right edges
    if (fl > 0.02) {
      const mx = 610, my = 224;
      c.save(); c.globalCompositeOperation = "lighter"; c.fillStyle = "rgba(220,200,255," + (0.85 * fl).toFixed(3) + ")";
      c.fillRect(mx - 53.5, my - 76, 1.6, 78); c.fillRect(mx + 58.5, my - 62, 1.6, 64); c.fillRect(mx + 60.5, my - 38, 1.4, 40);
      c.beginPath(); c.moveTo(mx - 64, my - 116); c.lineTo(mx - 48, my - 76); c.lineTo(mx - 50, my - 76); c.lineTo(mx - 64.5, my - 112); c.fill();
      c.beginPath(); c.moveTo(mx + 51, my - 96); c.lineTo(mx + 64, my - 62); c.lineTo(mx + 62, my - 62); c.lineTo(mx + 50.5, my - 92); c.fill();
      c.restore();
    }
    c.restore();
    // low mist lying in the streets between the far rows and the near ones
    K.fog(c, LW, LH, { y: 380, h: 60, color: "#5a5c8a", alpha: 0.22, t: lt * 1.3, seed: 13 });
    c.drawImage(roofsNear(), -60, 0, RW8, LH);
    if (fl > 0) { c.save(); c.globalCompositeOperation = "soft-light"; c.fillStyle = `rgba(170,130,255,${0.25 * fl})`; c.fillRect(-60, -40, LW + 120, 330); c.restore(); }
    K.fog(c, LW, LH, { y: 330, h: 110, color: "#3a2e5a", alpha: 0.3, t: lt, seed: 9 });
    // the amber pawprints across the near roofs, appearing one by one toward the hill
    const trail = [];
    for (let i = 0; i < 9; i++) {
      const u = i / 8, x = lerp(930, 470, u), y = lerp(452, 372, u) - Math.abs(Math.sin(u * 9)) * 10 * (1 - u);
      const on = smooth(seg(lt, 0.4 + i * 0.35, 0.9 + i * 0.35));
      trail.push({ x: x + (i % 2 ? 4 : -4), y, a: Math.atan2(-80, -460) + Math.PI / 2, s: lerp(8, 3.5, u), alpha: on * 0.85, flat: 0.5 });
    }
    K.pawprints(c, trail, 0.7);
  });
}
// ---- the edit -------------------------------------------------------------------------------------
const SHOTS = [
  [0, 10, shotTower],
  [10, 18, shotStairs],
  [18, 30, shotStreetFlash],
  [30, 40, shotBoxTop],
  [40, 50, shotHands],
  [50, 60, shotKitchen],
  [60, 68, shotBellRoom],
  [68, 74, shotRoofs],
];
// cross-dissolve lengths into each shot (the flashback gets a slow memory dissolve)
const XF = [0, 0.6, 1.2, 0.5, 0.6, 1.3, 1.2, 0.4];
// the lens grade per shot. Present = cold moonlit night; flashback = a remembered grey day (lifted,
// softer, desaturated, grainier) that warms as you pick him up, then the warm kitchen.
const BASE = { exposure: 0.95, hdr: 1, temp: 0, tint: 0, lift: [0.006, 0.008, 0.016], gamma: [1, 1, 1], gain: [1, 1, 1], sat: 0.92, contrast: 1.05, bloom: 0.35, halation: 0.4, streak: 0, grain: 0.055, ca: 0.6, vignette: 0.45, weave: 1, sharpen: 0.15 };
const GRADE = [
  { temp: -0.16, exposure: 1.0, lift: [0.004, 0.008, 0.02], contrast: 1.1, sat: 0.9, bloom: 0.45, halation: 0.55, streak: 0.06, vignette: 0.5 },
  { temp: -0.2, exposure: 1.05, lift: [0.003, 0.006, 0.016], contrast: 1.12, sat: 0.88, bloom: 0.4, halation: 0.45, vignette: 0.55 },
  { temp: -0.05, exposure: 0.95, lift: [0.03, 0.032, 0.038], gamma: [1, 1, 1.02], contrast: 0.96, sat: 0.74, bloom: 0.15, halation: 0.25, grain: 0.085, vignette: 0.45 },
  { temp: 0.02, exposure: 0.98, lift: [0.026, 0.022, 0.022], contrast: 1.0, sat: 0.82, bloom: 0.2, halation: 0.3, grain: 0.085, vignette: 0.55 },
  { temp: 0.02, exposure: 0.98, lift: [0.028, 0.024, 0.022], contrast: 0.98, sat: 0.84, bloom: 0.2, halation: 0.35, grain: 0.08, vignette: 0.5 },
  { temp: 0.1, exposure: 0.95, lift: [0.016, 0.01, 0.008], contrast: 1.06, sat: 0.9, bloom: 0.42, halation: 0.55, grain: 0.075, vignette: 0.55 },
  { temp: -0.16, exposure: 1.02, lift: [0.004, 0.008, 0.02], contrast: 1.1, sat: 0.9, bloom: 0.42, halation: 0.5, streak: 0.05, vignette: 0.55 },
  { temp: -0.12, tint: 0.04, exposure: 1.0, lift: [0.006, 0.004, 0.02], contrast: 1.08, sat: 0.92, bloom: 0.45, halation: 0.45, streak: 0.06, vignette: 0.5 },
];
function gradeOf(i, t) {
  const G = Object.assign({}, BASE, GRADE[i]);
  if (i === 4) {
    // "warm grade intensifies" as the sleeve closes round him
    const w = smooth(seg(t, 42.6, 47));
    G.temp = lerp(0.02, 0.24, w); G.sat = lerp(0.82, 0.94, w); G.lift = [lerp(0.03, 0.032, w), lerp(0.026, 0.022, w), lerp(0.024, 0.014, w)];
  }
  if (i === 7) {
    // the far lightning lifts the exposure for a blink
    const fl = K.flash(t - 68, [2.3, 2.45, 4.4], 0.3);
    G.exposure += fl * 0.25;
  }
  return G;
}
function mixGrade(a, b, k) {
  const o = {};
  for (const key of Object.keys(a)) {
    const x = a[key], y = b[key];
    o[key] = Array.isArray(x) ? x.map((v, j) => lerp(v, y[j], k)) : lerp(x, y, k);
  }
  return o;
}
function shotIndex(t) {
  let i = SHOTS.findIndex(([a, b]) => t >= a && t < b);
  return i < 0 ? SHOTS.length - 1 : i;
}
function drawShot(g, i, t) {
  const [a, , fn] = SHOTS[i];
  g.save();
  try { fn(g, t, Math.max(0, t - a)); } finally { g.restore(); }
}
// During a cross-dissolve the OUTGOING shot is not rendered live: it holds on one frame (the frame at
// the start of the dissolve, cached as a sprite - a fixed image, so draw stays a pure function of t)
// while the incoming shot plays live over it. Only one shot is ever rendered per frame.
const xfStart = (i) => SHOTS[i + 1][0] - XF[i + 1];
let XF_BUILD = false;
const xfOut = (i) => spr("f04xfo" + i, LW, LH, (s) => { s.fillStyle = "#000"; s.fillRect(0, 0, LW, LH); XF_BUILD = true; try { drawShot(s, i, xfStart(i)); } finally { XF_BUILD = false; } });
// hands -> kitchen: not a double exposure. The picture burns up through a warm bloom (+1.5 stops at the
// midpoint, in the lens) and the kitchen comes up out of it; the 2D mix is a quick swap at the peak.
const WARMX = 5;
const warmBurn = (t) => { const a = xfStart(WARMX - 1), k = clamp((t - a) / XF[WARMX]); return k > 0 && k < 1 ? Math.sin(Math.PI * k) : 0; };

// ---- cache warming (only caches change, never the picture) -------------------------------------------
// Every expensive build is a separate task; each frame runs tasks for the current shot (after a seek),
// its frozen dissolve frame, then the next two shots, until a small time budget is spent. Surface and
// field bakes are filled in row chunks (SURF_DL) so no single frame stalls on a 256 x 256 relief; a
// task returns false when it ran out of time and is picked up again next frame. The last task of each
// shot draws it once into a throwaway layer, catching any small cache left.
const S1 = () => ashlarTex(3, "#958d7d", 8), S5 = () => ashlarTex(5, "#7e7a72", 6), S9 = () => ashlarTex(9, "#7a766e", 4);
const chunk = (fn) => ({ chunk: true, fn });
const TASKS = [
  /* 0 tower */ [chunk(S1), () => towerWeather(), chunk(() => cloudTex("ctA", 7, 0.35, { cover: 0.05 })), chunk(() => cloudTex("ctB", 17, 1, { cover: 0.18, town: "#d08850" })), () => towerPlate(), () => dialPlate(), () => skyPlate3(), () => spr("f04bellL", BS * 2, BS * 1.4, paintBell)],
  /* 1 stairs */ [chunk(stairsBake)],
  /* 2 street */ [chunk(() => cardboardTex(1)), () => tideTex(), () => spr("f04ssky", LW, 260, paintStreetSky), () => terracePlate(), () => spr("f04mirror", LW, LH, paintMirror), () => propsPlate(), () => propsRefl(), () => propsReflWater(), () => streetPlate(), () => streakSprite(), chunk(fist3), chunk(sleeve3)],
  /* 3 box top */ [chunk(boxTopBake), chunk(kit4), chunk(kit4Mew), () => umbEdge4()],
  /* 4 hands */ [() => streetPlate(), () => spr("f04streetbk", LW, LH, paintStreetBokeh), chunk(kit5), chunk(kit5Eyes), chunk(sleeve5), chunk(drapeBake)],
  /* 5 kitchen */ [chunk(() => cardboardTex(0)), () => linoTex(), () => tileTex(), () => spr("f04kitch3", LW, LH, paintKitchen), () => spr("f04boxsh6", LW, LH, boxShadow6), chunk(() => boxBake6("in")), chunk(() => boxBake6("front")), chunk(() => towelBake6("back")), chunk(() => towelBake6("lip")), chunk(kit6), chunk(hand7), chunk(sleeve7), () => spr("f04lid3", LIDW, LIDH, paintLid)],
  /* 6 bell room */ [chunk(S5), chunk(() => boardTex()), chunk(() => pawSprite(1)), chunk(() => pawSprite(0)), chunk(hand8), chunk(sleeve8), () => spr("f04bellL", BS * 2, BS * 1.4, paintBell), () => bellRoomPlate()],
  /* 7 roofs */ [() => roofSkyPlate(), () => nightCloud(), ...ROWS8.map((_, i) => () => rowSprite(i)), () => roofsFar(), () => roofsNear()],
];
// The warm schedule is a fixed function of t: task j of shot k falls due at a set time spread over the
// two shots before it (the kitchen's plates build through the box-top and hands shots, the roofs' rows
// while the bell room plays), and the outgoing frame of each dissolve just before it starts. In playback
// a frame runs the tasks now due within a ~6 ms budget (chunked bakes resume next frame). After a seek
// (many tasks overdue at once) they all run in that first frame, so later frames are clean.
const DONE = new Set();
let WARM_T = -1;
function schedule(k) {
  if (k < 0 || k >= SHOTS.length) return [];
  const [a, b] = SHOTS[k];
  const list = [...TASKS[k], () => { const L = K.layer(LW, LH, "f04warm"); drawShot(L.g, k, (a + b) / 2); return true; }];
  const w0 = k === 0 ? 0 : SHOTS[Math.max(0, k - 2)][0] + 0.4, w1 = k === 0 ? 0 : xfStart(k - 1) - 0.4;
  const out = list.map((T, j) => ({ id: k + ":" + j, T, due: w0 + ((w1 - w0) * j) / list.length }));
  if (k < SHOTS.length - 1) out.push({ id: "xf" + k, T: () => xfOut(k), due: xfStart(k) - 0.3 });
  return out;
}
function warm(t, cur) {
  // only while time moves forward (playing); a paused or repeated frame does no warm work
  const prev = WARM_T; WARM_T = t;
  if (!(t > prev)) return;
  // after a seek (a jump, or the first frame) everything overdue is built at once: that frame stalls
  // anyway. In playback the work is a strict ~4 ms slice: the clock is checked before every task, and
  // chunked bakes check it before every row (SURF_DL), carrying on next frame.
  const seek = prev < 0 || t - prev > 0.5;
  const px = "@" + K.pixelScale();
  const dl = seek ? 0 : performance.now() + 4;
  for (let k = cur; k <= cur + 2; k++) {
    for (const q of schedule(k)) {
      if (q.due > t || DONE.has(q.id + px)) continue;
      if (dl && performance.now() > dl) return;
      const isChunk = typeof q.T === "object", fn = isChunk ? q.T.fn : q.T;
      let ok = true;
      SURF_DL = isChunk ? dl : 0;
      try { ok = fn() != null; } catch (err) { console.warn("[f04] warm", err); } finally { SURF_DL = 0; }
      if (!ok) return; // a chunked bake ran out of time: it carries on from its next row next frame
      DONE.add(q.id + px);
    }
  }
}
export const film = {
  id: 4,
  title: "The Box in the Rain",
  chapter: "Chapter 4",
  unlockAt: 20,
  duration: D,
  poster: 30,
  tagline: "The day you found him first.",
  subs: [
    [4.0, 8.0, "The clock tower rang out over town."],
    [12.0, 16.0, "You climbed. And you remembered."],
    [19.5, 23.5, "It was raining that day, too."],
    [24.5, 28.5, "A box. A sign. Free."],
    [31.5, 35.5, "He was the smallest thing you had ever seen."],
    [41.5, 45.5, "He stopped shaking when you held him."],
    [51.0, 55.5, "You named him after his colour."],
    [55.8, 59.0, "Biscuit."],
    [61.0, 65.5, "His pawprints, in the dust of the tower."],
    [69.0, 73.0, "Leading up the hill. To the manor."],
  ],
  voice: [
    [4.0, "The clock tower rang out over town.", { rate: 0.92, pitch: 1.0 }],
    [12.0, "You climbed. And you remembered.", { rate: 0.92, pitch: 1.0 }],
    [19.5, "It was raining that day, too.", { rate: 0.85, pitch: 0.95 }],
    [24.5, "A box. A sign. Free.", { rate: 0.85, pitch: 0.95 }],
    [31.5, "He was the smallest thing you had ever seen.", { rate: 0.92, pitch: 1.0 }],
    [41.5, "He stopped shaking when you held him.", { rate: 0.92, pitch: 1.0 }],
    [51.0, "You named him after his colour.", { rate: 0.92, pitch: 1.0 }],
    [55.8, "Biscuit.", { rate: 0.8, pitch: 1.0 }],
    [61.0, "His pawprints, in the dust of the tower.", { rate: 0.92, pitch: 1.0 }],
    [69.0, "Leading up the hill. To the manor.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: { mood: "sad", key: "F", bpm: 66, cues: [[3, "bell"], [15, "swell"], [30, "meow"], [44, "purr"], [60, "bell"], [70, "swell"]] },
  grade: Object.assign({}, BASE, GRADE[0]),
  gradeAt(t) {
    t = clamp(t, 0, D);
    const i = shotIndex(t);
    let G = gradeOf(i, t);
    const nx = SHOTS[i + 1];
    if (nx && t > nx[0] - XF[i + 1]) G = mixGrade(G, gradeOf(i + 1, t), smooth((t - (nx[0] - XF[i + 1])) / XF[i + 1]));
    const wb = warmBurn(t);
    if (wb > 0) { G.exposure *= Math.pow(2, 1.5 * wb); G.bloom += 0.6 * wb; G.halation += 0.4 * wb; G.temp += 0.12 * wb; }
    return G;
  },
  draw(g, t, W, H) {
    t = clamp(t, 0, D);
    g.save();
    try {
      if (W !== LW || H !== LH) g.scale(W / LW, H / LH);
      g.fillStyle = "#000"; g.fillRect(0, 0, LW, LH);
      const i = shotIndex(t);
      const nx = SHOTS[i + 1];
      if (nx && t > xfStart(i)) {
        g.drawImage(xfOut(i), 0, 0, LW, LH);
        const L = K.layer(LW, LH, "f04xf");
        L.g.fillStyle = "#000"; L.g.fillRect(0, 0, LW, LH);
        drawShot(L.g, i + 1, t);
        g.save();
        const k = (t - xfStart(i)) / XF[i + 1];
        // through the warm bloom the swap happens fast, at the brightest point, so the two pictures barely
        // overlap; a warm veil carries the burn in the 2D picture too (the lens lifts it further)
        g.globalAlpha = i + 1 === WARMX ? smooth(clamp((k - 0.4) / 0.2)) : smooth(k);
        g.drawImage(L.canvas, 0, 0, LW, LH);
        if (i + 1 === WARMX) { g.globalAlpha = 0.45 * Math.sin(Math.PI * clamp(k)); g.globalCompositeOperation = "screen"; g.fillStyle = "#ffb070"; g.fillRect(0, 0, LW, LH); }
        g.restore();
      } else drawShot(g, i, t);
      K.letterbox(g, LW, LH, 1);
      const tA = K.env(t, 0.9, 3.8, 0.8, 0.8);
      if (tA > 0) K.title(g, LW, LH, "The Box in the Rain", "Chapter 4", tA, { y: LH * 0.74, size: 54, glow: "#ffe6b0" });
      K.fadeBlack(g, LW, LH, 1 - smooth(seg(t, 0, 1.4)));
      K.fadeBlack(g, LW, LH, smooth(seg(t, 72.2, 74)));
    } finally {
      g.restore();
    }
    try { warm(t, shotIndex(t)); } catch (err) { console.warn("[f04] warm", err); }
  },
};
