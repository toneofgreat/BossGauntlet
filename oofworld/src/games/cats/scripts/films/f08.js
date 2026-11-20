// films/f08.js - Chapter 8: "The Mountain of Fire" (FILMS.md f08). Mount Hairball: a volcano with a
// lab built into its side, rivers of lava, falling ash and rising embers; the climb (heat shimmer, a
// rope bridge, a silhouette against the glow), a lava cat sunbathing on lava, and the lab's steel door.
//
// Photoreal pass (REALISM.md): every surface is a baked material (per-pixel shaded basalt cone, a
// crusted molten-lava tile that flows, metal, cinder), every light is motivated (the lava below, the
// glowing ash sky, the lab's green windows, the beacon), the ash deck and the eruption plume are baked
// density fields lit from below, and the grade/bloom/grain happen in the GPU lens (film.grade).
// draw(g, t, W, H) is a pure function of t. All pixel work happens once, inside cached bakes.
import * as K from "../filmkit.js";

const D = 62;
const { clamp, lerp, seg, smooth, mix, rgba, hash, noise, fbm, glow, TAU } = K;
const eio = K.ease.inOut;

const LAVA = "#ff5a1e";
const CORE = "#ffe07a";
const GREEN = "#7aff9a";
const sm = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };

// ---- chunked bakes --------------------------------------------------------------------------------------
// A per-pixel raster built in row bands, one band per call, so WARM can spread a big bake over many
// frames (no single slice over ~30 ms). The result does not depend on the order the bands are built in,
// so draw stays a pure function of t. baked(B) finishes whatever is left and returns the canvas.
const BAKES = new Map();
function bake(key, w, h, n, fn) {
  let B = BAKES.get(key);
  if (!B) {
    B = { c: null, w, h, n, fn, img: null, done: new Uint8Array(n), left: n, avg: null };
    BAKES.set(key, B);
  }
  return B;
}
function bakeStep(B, j) {
  if (!B.left || B.done[j]) return;
  if (!B.c) B.c = K.makeCanvas(B.w, B.h);
  if (!B.img) B.img = B.c.getContext("2d").createImageData(B.w, B.h);
  const w = B.w, h = B.h, D = B.img.data, out = [0, 0, 0, 255];
  const y0 = Math.floor((j * h) / B.n), y1 = Math.floor(((j + 1) * h) / B.n);
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      out[3] = 255;
      B.fn(x / w, y / h, out, x, y);
      const i = (y * w + x) * 4;
      D[i] = out[0]; D[i + 1] = out[1]; D[i + 2] = out[2]; D[i + 3] = out[3];
    }
  }
  B.done[j] = 1;
  if (--B.left === 0) { B.c.getContext("2d").putImageData(B.img, 0, 0); B.img = null; }
}
function baked(B) {
  for (let j = 0; j < B.n; j++) bakeStep(B, j);
  return B.c;
}
const steps = (getB) => { const n = getB().n; return Array.from({ length: n }, (_, j) => () => bakeStep(getB(), j)); };
// staged builders for vector art too big for one slice: each stage paints into shared state
const STAGED = new Map();
function staged(key, stages) {
  let S = STAGED.get(key);
  if (!S) { S = { stages, done: new Uint8Array(stages.length), left: stages.length, st: {} }; STAGED.set(key, S); }
  return S;
}
function stageStep(S, j) {
  if (!S.left || S.done[j]) return;
  // stages run in order (a later stage may need an earlier one's canvas)
  for (let k = 0; k <= j; k++) if (!S.done[k]) { S.stages[k](S.st); S.done[k] = 1; S.left--; }
}
function stagedGet(S) { stageStep(S, S.stages.length - 1); return S.st.out; }
const stageSteps = (getS) => { const n = getS().stages.length; return Array.from({ length: n }, (_, j) => () => stageStep(getS(), j)); };

// ---- baked materials ----------------------------------------------------------------------------------
// patterns from baked canvases (cached per context), with a full affine for scrolling / foreshortening
const PATS = new WeakMap();
function patOf(g, c) {
  let m = PATS.get(c);
  if (!m) { m = new WeakMap(); PATS.set(c, m); }
  let p = m.get(g);
  if (!p) { p = g.createPattern(c, "repeat"); m.set(g, p); }
  return p;
}
function patPaint(g, c, path, o = {}) {
  const p = patOf(g, c);
  const sx = (o.scale || c.width) / c.width, sy = (o.scaleY || o.scale || c.height) / c.height;
  if (p && p.setTransform && typeof DOMMatrix !== "undefined") p.setTransform(new DOMMatrix([sx, 0, 0, sy, o.ox || 0, o.oy || 0]));
  g.save();
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  if (o.mode) g.globalCompositeOperation = o.mode;
  if (o.stroke) {
    g.lineCap = "round";
    g.lineJoin = "round";
    g.lineWidth = o.stroke;
    g.strokeStyle = p;
    g.stroke(path);
  } else {
    g.fillStyle = p;
    g.fill(path);
  }
  g.restore();
}
// incandescence ramp: cooled crust -> dull red -> orange -> yellow-white (the lens blooms the top end)
const RAMP = [[0, 16, 7, 5], [0.22, 46, 14, 7], [0.42, 128, 28, 8], [0.6, 228, 80, 18], [0.78, 255, 160, 52], [0.92, 255, 222, 130], [1, 255, 246, 210]];
function ramp(k, out) {
  k = clamp(k);
  for (let i = 1; i < RAMP.length; i++) {
    if (k <= RAMP[i][0]) {
      const a = RAMP[i - 1], b = RAMP[i], u = (k - a[0]) / (b[0] - a[0]);
      out[0] = a[1] + (b[1] - a[1]) * u; out[1] = a[2] + (b[2] - a[2]) * u; out[2] = a[3] + (b[3] - a[3]) * u;
      return;
    }
  }
}
// molten lava with a crust: periodic Voronoi plates (wrinkled, cooled) split by glowing seams, plus
// molten windows; `hot` biases toward liquid (a narrow fast river) or crust (a slow lake).
// molten lava tiles (periodic, 256 px). kind:
//  "lake": mostly dark cooled crust (silvery-black, ropy wrinkles) split by sparse hot fissures (~20 %);
//          the plate UVs are domain-warped by low-frequency fbm so the cells never read as a grid
//  "fis":  the same idea at another seed, but ONLY the glowing cracks (black elsewhere): an additive
//          second layer at a different scale and drift that breaks the tiling of the first
//  "flow": a channel flow: plates stretched along the flow, more hot seams (~40 %)
const MOLTEN = {
  lake: { seed: 11, freq: 6, warp: 1.1, seam: 0.1, open: 0.05, micro: 0.95, base: 1, black: 0, act: 0.58 },
  fis: { seed: 29, freq: 9, warp: 1.4, seam: 0.05, open: 0.0, micro: 0.96, base: 0, black: 1, act: 0.62 },
  flow: { seed: 5, freq: 7, warp: 0.9, seam: 0.13, open: 0.12, micro: 0.9, base: 1, black: 0, act: 0.42 },
};
function moltenB(kind = "lake") {
  const P = MOLTEN[kind] || MOLTEN.lake;
  // the channel-flow tile is only ever seen small (a few px wide on the cone): 128 px is plenty
  const S = kind === "flow" ? 128 : 256;
  return bake("f08molten6:" + kind, S, S, kind === "flow" ? 8 : 24, (u, v, out) => {
    const s = P.seed;
    // low-frequency domain warp (periodic), then the crust plates
    const w = K.texFbm(u * 2, v * 2, s + 1, 3, 2, 2), w2 = K.texFbm(u * 2 + 3.1, v * 2, s + 2, 3, 2, 2);
    const f = P.freq;
    const vo = K.texVoronoi(u * f + w * P.warp * 2, v * f + w2 * P.warp * 2, s + 3, f, f);
    const zone = K.texFbm(u + w * 0.3, v, s + 4, 2, 1, 1) * 0.5 + 0.5; // hotter / cooler regions
    const edge = vo.f2 - vo.f1;
    // only some of the seams are open and glowing (sparse, clustered); the rest are healed, dark crust
    const act = sm(P.act - 0.12, P.act + 0.12, K.texFbm(u * 3 + w * 0.5, v * 3 + w2 * 0.5, s + 7, 3, 3, 3) * 0.5 + 0.5 + (((vo.id >>> 9) & 255) / 255 - 0.5) * 0.3);
    const seam = (1 - sm(0, P.seam * (0.6 + zone), edge)) * (0.3 + 0.7 * act);
    const open = ((vo.id >>> 5) & 255) / 255 < P.open * (0.4 + zone * 1.4) ? 1 : 0;
    const wr = K.texRidged(u * 12 + w * 2, v * 12 + w2 * 2, s + 5, 3, 12, 12);
    const micro = sm(P.micro, 0.995, wr) * sm(0.45, 0.8, zone);
    let heat = Math.max(seam * (0.62 + zone * 0.22), open * (0.6 + zone * 0.3), micro * (0.42 + zone * 0.2));
    if (P.black) {
      ramp(heat * 1.05, out);
      const k = sm(0.3, 0.55, heat);
      out[0] *= k; out[1] *= k; out[2] *= k; out[3] = 255;
      return;
    }
    // the crust: ropy wrinkles (pahoehoe), a faint silvery sheen on the ridges, red glow seeping
    // through where the crust is thin (near a seam)
    const rope = Math.sin((u * 40 + w * 9 + vo.cx * 3) * 1.0) * 0.5 + 0.5;
    const n = K.texFbm(u * 16, v * 16, s + 6, 3, 16, 16) * 0.5 + 0.5;
    const near = 1 - sm(0, 0.16, edge);
    let cr = 22 + n * 20 + rope * 10, cg = 18 + n * 14 + rope * 7, cb = 17 + n * 12 + rope * 6;
    cr += near * 90 * (0.4 + zone); cg += near * 22 * (0.4 + zone); cb += near * 4;
    if (heat > 0.36) {
      ramp(heat, out);
      const k = sm(0.36, 0.5, heat);
      out[0] = cr + (out[0] - cr) * k; out[1] = cg + (out[1] - cg) * k; out[2] = cb + (out[2] - cb) * k;
    } else { out[0] = cr; out[1] = cg; out[2] = cb; }
    out[3] = 255;
  });
}
// kept for older call sites: hot>=1 -> the channel flow, else the lake crust
function moltenTex(hot = 0) { return baked(moltenB(hot >= 1 ? "flow" : "lake")); }
// low-frequency hot/cool modulation over a whole lake (multiplied on top, non-repeating at lake scale)
function lakeModB() {
  return bake("f08lakemod", 128, 128, 2, (u, v, out) => {
    const n = K.texFbm(u * 3, v * 3, 71, 4, 3, 3) * 0.5 + 0.5;
    const k = 120 + sm(0.25, 0.75, n) * 135;
    out[0] = k; out[1] = k * 0.92; out[2] = k * 0.9; out[3] = 255;
  });
}
// a soft billow of steam / smoke (alpha only, white): radial falloff eroded by fbm
function puffTex(i) {
  return K.texBake("f08puff:" + (i % 4), 96, 96, (u, v, out) => {
    const dx = u - 0.5, dy = v - 0.5, r = Math.sqrt(dx * dx + dy * dy) * 2;
    const n = K.texFbm(u * 4, v * 4, 40 + (i % 4) * 7, 5) * 0.5 + 0.5;
    const a = clamp((1 - r) * 1.6 - (1 - n) * 0.9);
    out[0] = out[1] = out[2] = 255;
    out[3] = a * a * 255;
  });
}
function puff(g, x, y, r, rot, i, color, alpha, mode) {
  if (alpha <= 0.003) return;
  const c = puffTex(i);
  g.save();
  g.globalAlpha *= alpha;
  if (mode) g.globalCompositeOperation = mode;
  g.translate(x, y);
  g.rotate(rot);
  if (color) {
    // tint: draw the white puff into a cached tinted sprite
    const tc = K.sprite("f08puffc:" + (i % 4) + color, 96, 96, (s) => { s.drawImage(c, 0, 0, 96, 96); s.globalCompositeOperation = "source-in"; s.fillStyle = color; s.fillRect(0, 0, 96, 96); });
    g.drawImage(tc, -r, -r, r * 2, r * 2);
  } else g.drawImage(c, -r, -r, r * 2, r * 2);
  g.restore();
}

// ---- the ash sky (baked density deck, lit from below by the eruption) -----------------------------------
// B: no sun (it is night everywhere on the mountain): the crater's glow, low on the left behind the
// ridges, under-lights a dense ash cloud bank
const SKIES = {
  A: { gx: 0.56, hz: 0.86, gw: 5, top: [20, 8, 7], mid: [82, 30, 16], low: [218, 108, 56], cloud: 1, bank: 0 },
  B: { gx: 0.16, hz: 0.9, gw: 4, top: [18, 7, 6], mid: [70, 24, 13], low: [186, 76, 34], cloud: 1, bank: 0.75 },
};
function skyB(k) { return bake("f08sky5:" + k, 420, 218, 28, skyFn(k)); }
function skyTex(k) { return baked(skyB(k)); }
function skyFn(k) {
  const P = SKIES[k];
  return (u, v, out) => {
    const tv = Math.pow(clamp(v / P.hz), 1.5);
    const a = tv < 0.5 ? P.top : P.mid, b = tv < 0.5 ? P.mid : P.low, q = tv < 0.5 ? tv * 2 : tv * 2 - 1;
    let r = a[0] + (b[0] - a[0]) * q, gg = a[1] + (b[1] - a[1]) * q, bb = a[2] + (b[2] - a[2]) * q;
    const gx = (u - P.gx) * 1.9, gy = v - P.hz;
    const gl = Math.exp(-(gx * gx * P.gw + gy * gy * 10));
    // the ash deck: domain-warped fbm, stretched sideways by the wind, thick overhead, thin at the horizon
    const wx = K.texFbm(u * 2.2, v * 3.5, 3, 4);
    const fx = u * 3.4 + wx * 0.8, fy = v * 7.5 + wx * 0.5;
    const d1 = K.texFbm(fx, fy, 5, 6) * 0.5 + 0.5;
    const d2 = K.texFbm(fx, fy + 0.16, 5, 6) * 0.5 + 0.5;
    const vv = v / P.hz;
    const cover = clamp(clamp(1.25 - vv * 1.15) * P.cloud + P.bank * Math.exp(-(((vv - 0.8) / 0.16) ** 2)));
    const dens = clamp((d1 - 0.62 + cover * 0.5) * 3.2);
    const under = clamp((d1 - d2) * 9 + 0.15); // billow undersides face the glow below
    const lit = (0.14 + gl * 0.95 + clamp(vv) * 0.35) * (0.25 + under * 0.95);
    const cr = 22 + 210 * lit, cg = 15 + 84 * lit * lit + 10 * lit, cb = 13 + 40 * lit * lit;
    const k2 = dens * 0.94;
    r += (cr - r) * k2; gg += (cg - gg) * k2; bb += (cb - bb) * k2;
    // the horizon glow seen through the gaps
    const thru = P.bank ? 40 : 70;
    r += thru * gl * (1 - k2 * 0.6); gg += thru * 0.48 * gl * (1 - k2 * 0.6); bb += thru * 0.17 * gl * (1 - k2 * 0.6);
    out[0] = clamp(r, 0, 238); out[1] = clamp(gg, 0, 200); out[2] = clamp(bb, 0, 170); out[3] = 255;
  };
}
function ashSky(g, W, H, k, pan = 0) {
  const c = skyTex(k);
  g.save();
  g.imageSmoothingEnabled = true;
  g.drawImage(c, -60 + clamp(pan, -60, 60), 0, W + 120, H);
  g.restore();
}

// ---- particles -----------------------------------------------------------------------------------------
// falling ash: grey flakes, tumbling; with wind they streak (motion blur over the 1/48 s shutter)
const ASHC = ["#6a5a52", "#8a7a70", "#a8968a", "#c8b0a0"];
function ash(g, W, H, t, o = {}) {
  const n = o.count || 70, seed = o.seed || 3, wind = o.wind == null ? 12 : o.wind;
  const a0 = o.alpha == null ? 0.55 : o.alpha;
  const buckets = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  g.save();
  g.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const sp = 14 + hash(i, seed) * 26;
    const near = hash(i + 0.4, seed) > 0.86;
    const k = near ? 2.2 : 1;
    const y = ((hash(i + 0.2, seed) * (H + 40) + t * sp * k) % (H + 40)) - 20;
    const x = (((hash(i + 0.7, seed) * (W + 80) + t * wind * k + Math.sin(t * 0.8 + i) * 14) % (W + 80)) + W + 80) % (W + 80) - 40;
    const s = (near ? 2.6 : 0.8) + hash(i + 0.9, seed) * 1.1;
    const tw = 0.55 + 0.45 * Math.abs(Math.sin(t * (1 + hash(i, 5) * 2) + i)); // tumbling flake catches light
    if (near) {
      // out of focus, close to the lens: a soft disc
      glow(g, x, y, s * 3.2, "#4a3a34", a0 * 0.55, "source-over");
      continue;
    }
    const vx = wind * k * 0.022, vy = sp * k * 0.022;
    const b = buckets[Math.min(3, Math.floor(tw * 4 - 0.01))];
    b.moveTo(x, y);
    b.lineTo(x - vx - 0.01, y - vy);
  }
  g.lineWidth = 1.3;
  for (let k = 0; k < 4; k++) {
    g.globalAlpha = a0 * (0.35 + k * 0.15);
    g.strokeStyle = ASHC[k];
    g.stroke(buckets[k]);
  }
  g.restore();
}
// rising embers: sparks that flicker and drift upward, streaked along their motion
function embers(g, W, H, t, o = {}) {
  const n = o.count || 40, seed = o.seed || 7;
  const [ax, ay, aw, ah] = o.area || [0, 0, W, H];
  const big = o.big || 1;
  g.save();
  g.lineCap = "round";
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const sp = 30 + hash(i, seed) * 60;
    const life = ah + 60;
    const y = ay + ah - ((hash(i + 0.3, seed) * life + t * sp) % life) + 30;
    const x = ax + hash(i + 0.6, seed) * aw + Math.sin(t * 1.3 + i * 2.1) * 12 + noise(t * 0.5 + i, seed) * 18 + (o.wind || 0) * ((t * sp) % life) / sp;
    const fl = 0.55 + 0.45 * Math.sin(t * (6 + hash(i, 4) * 6) + i);
    const fade = clamp((y - ay + 20) / (ah * 0.5));
    const s = (0.6 + hash(i + 0.8, seed) * 1.2) * big;
    glow(g, x, y, s * 5, "#ff6a1a", 0.22 * fl * fade);
    g.globalAlpha = 0.9 * fl * fade;
    g.strokeStyle = fl > 0.8 ? "#fff0b8" : "#ffb050";
    g.lineWidth = s;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - (o.wind || 0) * 0.02, y + sp * 0.03);
    g.stroke();
  }
  g.restore();
}
// out-of-focus embers right at the lens: hexagonal bokeh discs
function emberBokeh(g, W, H, t, o = {}) {
  const lights = [];
  const n = o.count || 8, seed = o.seed || 61;
  for (let i = 0; i < n; i++) {
    const sp = 40 + hash(i, seed) * 50, life = H + 160;
    const y = H + 80 - ((hash(i + 0.3, seed) * life + t * sp) % life);
    const x = hash(i + 0.6, seed) * W + Math.sin(t * 0.9 + i * 2) * 30;
    const fl = 0.65 + 0.35 * Math.sin(t * (3 + hash(i, 4) * 3) + i);
    lights.push({ x, y, r: (8 + hash(i, seed + 2) * 16) * (o.size || 1), color: hash(i, seed + 3) < 0.5 ? "#ff8a3a" : "#ffb060", alpha: fl });
  }
  K.bokehLights(g, W, H, t, { count: 0, lights, alpha: (o.alpha == null ? 0.32 : o.alpha) * 0.55, blades: 6 });
}

// ---- the volcano (per-pixel shaded basalt cone, baked once) -----------------------------------------------
const VW = 1500, VH = 640, RS = 0.62;
// the gully field G(angle, r) is the costly part of the cone's shading (ridged noise); it is tabulated
// once (built in 4 bands, each well under 30 ms) and looked up bilinearly per pixel
const GT = { A0: -1.7, A1: 1.7, R1: 600, NA: 384, NR: 112, d: null, rows: 0 };
function gtabStep(j) {
  if (!GT.d) GT.d = new Float32Array(GT.NA * GT.NR);
  for (let k = 0; k < j; k++) gtabStep(k); // bands are built in order
  const r0 = Math.floor((j * GT.NR) / 4), r1 = Math.floor(((j + 1) * GT.NR) / 4);
  if (GT.rows > r0) return;
  for (let ir = r0; ir < r1; ir++) {
    const r = (ir / (GT.NR - 1)) * GT.R1;
    for (let ia = 0; ia < GT.NA; ia++) {
      const aa = GT.A0 + (ia / (GT.NA - 1)) * (GT.A1 - GT.A0);
      GT.d[ir * GT.NA + ia] = K.texRidged(aa * 7 + 20, r / 150 + 3, 4, 3);
    }
  }
  GT.rows = r1;
}
function gtab(aa, r) {
  if (GT.rows < GT.NR) for (let j = 0; j < 4; j++) gtabStep(j);
  const fa = clamp((aa - GT.A0) / (GT.A1 - GT.A0)) * (GT.NA - 1), fr = clamp(r / GT.R1) * (GT.NR - 1);
  const ia = Math.min(GT.NA - 2, Math.floor(fa)), ir = Math.min(GT.NR - 2, Math.floor(fr)), u = fa - ia, v = fr - ir;
  const D = GT.d, k = ir * GT.NA + ia;
  return (D[k] * (1 - u) + D[k + 1] * u) * (1 - v) + (D[k + GT.NA] * (1 - u) + D[k + GT.NA + 1] * u) * v;
}
const CRATER = [762, 100];
// the skyline: an asymmetric stratovolcano. Concave flanks (steep near the summit, flaring into a wide
// apron), a notched crater rim whose east side has collapsed into a breach, a parasitic cone on the
// west flank, and a rough edge at two fbm scales.
function ridgeY(x) {
  const d = x - CRATER[0], ad = Math.abs(d);
  const R = d < 0 ? 780 : 610;
  const s = clamp((ad - 84) / R);
  // strongly concave: steep just under the rim, flaring into a long low apron
  let y = 96 + 544 * (0.32 * s + 0.68 * (1 - Math.pow(1 - s, 2.9)));
  // a broad, truncated summit: a broken rim of blocks, higher on the west, slumped on the east
  if (ad < 96) y += (fbm(x / 7, 3) * 5 + (hash(Math.floor(x / 11), 5) - 0.5) * 12) * (1 - sm(70, 96, ad)) + (d > 0 ? 10 * sm(0, 80, d) : 0);
  y += 42 * Math.exp(-(((x - 808) / 18) ** 2)); // the breach the lava pours through
  y += 40 * sm(20, 70, d) * (1 - sm(100, 300, d)); // the collapsed east shoulder
  const pc = Math.max(0, 1 - Math.abs(x - 470) / 150);
  y -= 120 * Math.pow(pc, 1.5) - 14 * Math.exp(-(((x - 470) / 15) ** 2)); // parasitic cone + its little crater
  const k = clamp((ad - 30) / 100);
  y += (fbm(x / 110, 4) * 34 + fbm(x / 40, 7) * 14 + fbm(x / 13, 9) * 6 + fbm(x / 5, 13) * 2) * (0.4 + 0.6 * k);
  return Math.min(VH + 4, y);
}
// a far shoulder behind the east flank, lost in the ash haze
function ridgeB(x) { return 300 + (x - 880) * 0.34 + fbm(x / 60, 21) * 12 + fbm(x / 15, 22) * 3; }
// four big erosion gullies, as angles around the crater (d / (r + 70)), wandering down the fall line
const GULLIES = [[-0.64, 1.0], [-0.2, 0.8], [0.3, 1.0], [0.7, 0.7]];
function volcanoRockB() {
  const w = Math.round(VW * RS), h = Math.round(VH * RS);
  let ridge = null, rb = null;
  return bake("f08volcRock6", w, h, 40, (u, v, out, x, y) => {
    if (!ridge) {
      ridge = new Float32Array(w); rb = new Float32Array(w);
      for (let i = 0; i < w; i++) { const X = (i + 0.5) / RS; ridge[i] = ridgeY(X); rb[i] = X > 860 ? ridgeB(X) : 9999; }
    }
    const X = (x + 0.5) / RS, Y = (y + 0.5) / RS;
    const top = Math.min(ridge[x], rb[x]);
    const a0 = (Y - top) * RS + 0.5;
    if (a0 <= 0) { out[3] = 0; return; }
    if (Y < ridge[x]) {
      // the far shoulder: barely modelled, raised in value, low in contrast and saturation
      const b = K.texFbm(X / 40, Y / 26, 31, 3);
      const l = 0.5 + b * 0.2 + clamp((Y - rb[x]) / 120) * 0.15;
      out[0] = 120 + 34 * l; out[1] = 66 + 18 * l; out[2] = 48 + 12 * l;
      out[3] = clamp(a0) * 255;
      return;
    }
    const d = X - CRATER[0], r = Math.max(0, Y - CRATER[1]);
    const halfW = (d < 0 ? 1.45 : 1.15) * r + 60;
    const ang = d / (r + 70);
    const g0 = gtab(ang, r), g1 = gtab(ang + 0.009, r);
    let tilt = clamp((g1 - g0) * 17, -0.9, 0.9) * 0.6;
    // the big gullies: a depression whose west wall faces the key (lit) and east wall turns away
    let gul = 0;
    const env = sm(30, 150, r) * (1 - 0.4 * sm(380, 560, r));
    for (let i = 0; i < GULLIES.length; i++) {
      const ga = GULLIES[i][0] + 0.05 * Math.sin(r / 110 + i * 2.1) + 0.02 * Math.sin(r / 31 + i);
      const gw = 0.03 + r / 11000;
      const da = (ang - ga) / gw;
      const Gg = Math.exp(-da * da) * env * GULLIES[i][1];
      tilt += -2 * da * Gg * 0.75;
      gul = Math.max(gul, Gg);
    }
    // the parasitic cone's own flanks
    const pcd = (X - 470) / 120;
    if (Math.abs(pcd) < 1) tilt += Math.sign(pcd) * 0.45 * (1 - Math.abs(pcd)) * (1 - sm(40, 140, Y - ridge[x]));
    const nx = clamp((d / halfW) * 0.8 + tilt, -0.98, 0.98);
    const nz = Math.sqrt(1 - nx * nx);
    const lam = clamp(-0.62 * nx + 0.5 * nz + 0.12);
    const b = K.texFbm(X / 16, Y / 10, 9, 2);
    const big = K.texFbm(X / 120, Y / 70, 12, 2);
    const ashAmt = clamp(0.35 + big * 0.7 - (1 - g0) * 0.5 - gul * 0.5) * clamp(r / 160);
    const sco = clamp(1 - r / 240) * 0.85;
    let ar = 46 + (98 - 46) * ashAmt, ag = 38 + (86 - 38) * ashAmt, ab = 34 + (78 - 34) * ashAmt;
    ar += (96 - ar) * sco; ag += (44 - ag) * sco; ab += (30 - ab) * sco;
    const ao = (0.45 + 0.55 * g0) * (1 - gul * 0.45);
    const L = (lam * 0.95 + 0.12) * ao * (1 + b * 0.18);
    let rr = ar * L * 1.25 + 10 * lam, gg = ag * L * 1.08 + 3 * lam, bb = ab * L * 0.95;
    // atmospheric perspective: thicker toward the base, and the east flank recedes into the ash
    const hz = clamp((Y - 260) / 380) * 0.4 + 0.06 + 0.26 * sm(140, 640, d);
    rr += (172 - rr) * hz; gg += (88 - gg) * hz; bb += (56 - bb) * hz;
    out[0] = clamp(rr, 0, 255); out[1] = clamp(gg, 0, 255); out[2] = clamp(bb, 0, 255);
    out[3] = clamp(a0) * 255;
  });
}
function volcanoRock() { return baked(volcanoRockB()); }

// ---- lava flows: branching, braiding ribbons that taper from the vent and widen on the apron --------
const FLOWS = [
  { pts: [806, 126, 822, 180, 842, 250, 858, 330, 872, 410, 892, 500, 916, 590, 934, 660], w0: 2.6, w1: 15, seed: 1 },
  { pts: [858, 330, 846, 400, 826, 470, 800, 550, 786, 660], w0: 5, w1: 12, seed: 2 },
  { pts: [738, 110, 720, 170, 696, 240, 664, 320, 632, 410, 598, 510, 568, 660], w0: 2.4, w1: 16, seed: 3 },
  { pts: [664, 320, 628, 372, 578, 436, 524, 520, 474, 660], w0: 4.5, w1: 12, seed: 4 },
  { pts: [632, 410, 650, 486, 662, 570, 670, 660], w0: 4, w1: 11, seed: 5 },
];
let FLOWGEO = null;
function ribbon(Lp, Rp) {
  const p = new Path2D();
  Lp.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])));
  for (let i = Rp.length - 1; i >= 0; i--) p.lineTo(Rp[i][0], Rp[i][1]);
  p.closePath();
  return p;
}
function flowGeo() {
  if (FLOWGEO) return FLOWGEO;
  FLOWGEO = FLOWS.map((F) => {
    const S = K.sampleSpline(F.pts, false, 12), n = S.length;
    const len = [0];
    for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]));
    const tot = len[n - 1] || 1;
    const L = [], R = [], CL = [], CR = [], VL = [], VR = [], samples = [];
    for (let i = 0; i < n; i++) {
      const a = S[Math.max(0, i - 1)], c = S[Math.min(n - 1, i + 1)];
      let tx = c[0] - a[0], ty = c[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      const f = len[i] / tot, [x, y] = S[i];
      // wider where the ground flattens (the flow turns sideways) and out on the apron
      const w = lerp(F.w0, F.w1, Math.pow(f, 0.85)) * (1 + 0.6 * Math.abs(tx)) * (0.82 + 0.36 * (fbm(i * 0.31, F.seed + 40) * 0.5 + 0.5)) * (1 + 0.3 * sm(540, 660, y));
      const hw = w / 2, jl = 1 + (hash(i, F.seed * 7 + 1) - 0.5) * 0.3, jr = 1 + (hash(i, F.seed * 7 + 2) - 0.5) * 0.3;
      L.push([x - ty * hw * jl, y + tx * hw * jl]);
      R.push([x + ty * hw * jr, y - tx * hw * jr]);
      const m = Math.sin(i * 0.5 + F.seed) * hw * 0.25, cw = hw * 0.42;
      CL.push([x - ty * (cw - m), y + tx * (cw - m)]);
      CR.push([x + ty * (cw + m), y - tx * (cw + m)]);
      VL.push([x - ty * hw * 1.7, y + tx * hw * 1.7]);
      VR.push([x + ty * hw * 1.7, y - tx * hw * 1.7]);
      samples.push([x, y, w, f]);
    }
    return { path: ribbon(L, R), core: ribbon(CL, CR), levee: ribbon(VL, VR), samples, y0: S[0][1], y1: S[n - 1][1] };
  });
  return FLOWGEO;
}
// LAB sits on a cut terrace on the east flank, below the skyline
const LAB = { x: 985, y: 446 };
const LS = 0.34;
function labSpace(g, fn) {
  g.save();
  g.translate(LAB.x, LAB.y);
  g.scale(LS, LS);
  g.translate(-LAB.x, -LAB.y);
  fn();
  g.restore();
}
function volcanoBase() {
  return K.sprite("f08volcBase10", VW, VH, (s) => {
    s.imageSmoothingEnabled = true;
    s.drawImage(volcanoRock(), 0, 0, VW, VH);
    s.save();
    s.globalCompositeOperation = "source-atop";
    // each flow lights the rock beside it: a soft orange pool about 3x its width, inverse-square-ish
    for (const F of flowGeo()) {
      for (let i = 0; i < F.samples.length; i += 2) {
        const [x, y, w] = F.samples[i];
        const r = w * 3.2 + 6;
        const gr = s.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, "rgba(255,92,28,0.32)");
        gr.addColorStop(0.4, "rgba(255,80,24,0.1)");
        gr.addColorStop(1, "rgba(255,80,24,0)");
        s.fillStyle = gr;
        s.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // the cooled levees either side of the channel
      s.fillStyle = "rgba(20,8,5,0.85)";
      s.fill(F.levee);
    }
    const cg = s.createRadialGradient(CRATER[0] + 20, CRATER[1] + 14, 4, CRATER[0] + 20, CRATER[1] + 60, 240);
    cg.addColorStop(0, "rgba(255,150,70,0.7)");
    cg.addColorStop(0.3, "rgba(255,90,30,0.22)");
    cg.addColorStop(1, "rgba(255,80,24,0)");
    s.fillStyle = cg;
    s.fillRect(CRATER[0] - 260, CRATER[1] - 40, 560, 320);
    s.restore();
  });
}
function volcanoSprite() {
  return K.sprite("f08volcano10", VW, VH, (s) => {
    s.drawImage(volcanoBase(), 0, 0, VW, VH);
    s.drawImage(labSprite(), 0, 0, VW, VH);
  });
}
function labSprite() {
  return K.sprite("f08lab7", VW, VH, (ls) => {
    labSpace(ls, () => labSite(ls));
    labSpace(ls, () => labBody(ls));
    // hazed by the distance like the rock around it
    ls.globalCompositeOperation = "source-atop";
    ls.fillStyle = "rgba(150,72,44,0.2)";
    ls.fillRect(0, 0, VW, VH);
  });
}
// the lab's seat in the mountain: a terrace cut into the slope (bench + cut face behind), foundation
// struts with contact occlusion, pipes running down the slope on little supports
function labSite(s) {
  const { x, y } = LAB;
  // the cut face behind the building: a darker notch in the slope, its upper lip catching sky
  const cut = new Path2D();
  cut.moveTo(x - 110, y + 150);
  cut.lineTo(x - 80, y - 30);
  for (let k = 0; k <= 10; k++) cut.lineTo(x - 80 + k * 44, y - 60 - fbm(k * 0.7, 61) * 18 + k * 6);
  cut.lineTo(x + 380, y + 150);
  cut.closePath();
  K.texFill(s, "lavarock", cut, { scale: 90, tex: { size: 128, color: "#4a3a34", seed: 5 } });
  const cg = s.createLinearGradient(0, y - 80, 0, y + 150);
  cg.addColorStop(0, "rgba(8,4,3,0.35)");
  cg.addColorStop(0.5, "rgba(6,3,2,0.75)");
  cg.addColorStop(1, "rgba(6,3,2,0.55)");
  s.fillStyle = cg;
  s.fill(cut);
  // the terrace: a flat bench, its top lit by the sky, its cut front face in shadow
  const bench = new Path2D();
  bench.moveTo(x - 130, y + 150); bench.lineTo(x + 390, y + 150); bench.lineTo(x + 400, y + 168);
  for (let k = 0; k <= 12; k++) bench.lineTo(x + 400 - k * 45, y + 196 + fbm(k * 0.9, 63) * 16);
  bench.lineTo(x - 140, y + 170);
  bench.closePath();
  K.texFill(s, "lavarock", bench, { scale: 70, tex: { size: 128, color: "#5a4a44", seed: 7 } });
  const bg = s.createLinearGradient(0, y + 150, 0, y + 210);
  bg.addColorStop(0, "rgba(255,170,120,0.18)");
  bg.addColorStop(0.18, "rgba(30,14,8,0.35)");
  bg.addColorStop(1, "rgba(8,4,2,0.8)");
  s.fillStyle = bg;
  s.fill(bench);
  // AO under the whole building on the bench
  const ao = s.createLinearGradient(0, y + 136, 0, y + 162);
  ao.addColorStop(0, "rgba(0,0,0,0.75)");
  ao.addColorStop(1, "rgba(0,0,0,0)");
  s.fillStyle = ao;
  s.fillRect(x - 60, y + 140, 370, 22);
  // foundation struts under the raised blocks, with diagonal braces and contact shadows
  s.fillStyle = "#1a1412";
  for (const [sx, top] of [[x - 40, y + 140], [x + 30, y + 110], [x + 110, y + 110], [x + 190, y + 130], [x + 270, y + 130]]) {
    s.fillRect(sx - 3, top, 6, y + 152 - top);
    s.fillStyle = "rgba(255,180,140,0.18)";
    s.fillRect(sx - 3, top, 1.5, y + 152 - top);
    s.fillStyle = "#1a1412";
    K.shadowBlob(s, sx, y + 152, 14, 3, { alpha: 0.8 });
  }
  s.save();
  s.strokeStyle = "#141010";
  s.lineWidth = 2.4;
  s.beginPath();
  s.moveTo(x + 30, y + 112); s.lineTo(x + 110, y + 150);
  s.moveTo(x + 110, y + 112); s.lineTo(x + 30, y + 150);
  s.moveTo(x + 190, y + 132); s.lineTo(x + 270, y + 150);
  s.stroke();
  s.restore();
  // pipes down the slope: dark body, mid tone, a thin sky specular; a support every few metres
  s.save();
  s.lineCap = "round";
  const pipes = [
    [x + 20, y + 120, x - 30, y + 190, x - 110, y + 260, x - 230, y + 380],
    [x + 210, y + 135, x + 250, y + 200, x + 300, y + 280, x + 380, y + 400],
  ];
  for (const [pw, c] of [[9, "#120e0e"], [6, "#4a403c"], [1.6, "rgba(255,200,170,0.45)"]]) {
    s.strokeStyle = c;
    s.lineWidth = pw;
    for (const P of pipes) { const p = new Path2D(); K.spline(p, P, false); s.stroke(p); }
    s.translate(-0.5, -0.6);
  }
  s.restore();
  for (const P of pipes) {
    const S = K.sampleSpline(P, false, 4);
    for (let i = 1; i < S.length; i += 3) {
      s.fillStyle = "#1a1412";
      s.fillRect(S[i][0] - 2, S[i][1] + 3, 4, 10);
      K.shadowBlob(s, S[i][0] + 2, S[i][1] + 13, 8, 2, { alpha: 0.7 });
    }
  }
  // the green interior light pooled on the terrace and the rock below the windows
  s.save();
  s.globalCompositeOperation = "lighter";
  K.lightPool(s, x + 110, y + 160, 260, "#5aff88", { flat: 0.35, intensity: 0.35 });
  K.lightPool(s, x + 240, y + 175, 160, "#5aff88", { flat: 0.4, intensity: 0.25 });
  s.restore();
}
// the lab: stepped concrete-and-steel blocks, glass domes, pipes, a catwalk; metal texture, sky-lit
// tops, lava-lit undersides, contact occlusion where it meets the rock
function labBody(s) {
  const { x, y } = LAB;
  const block = (bx, by, bw, bh) => {
    const p = new Path2D();
    p.rect(bx, by, bw, bh);
    K.texFill(s, "metal", p, { scale: 46, tex: { size: 128, color: "#56585c", rust: 0.4, seed: 3 } });
    const gr = s.createLinearGradient(bx, by, bx, by + bh);
    gr.addColorStop(0, "rgba(24,16,14,0.4)");
    gr.addColorStop(1, "rgba(10,6,4,0.86)");
    s.fillStyle = gr;
    s.fill(p);
    // the face toward the bright sky (left) vs. the turned-away side
    const sg = s.createLinearGradient(bx, 0, bx + bw, 0);
    sg.addColorStop(0, "rgba(255,170,120,0.16)");
    sg.addColorStop(0.3, "rgba(255,170,120,0)");
    sg.addColorStop(1, "rgba(0,0,0,0.3)");
    s.fillStyle = sg;
    s.fill(p);
    // lava bounce under the sill
    s.save();
    s.globalCompositeOperation = "lighter";
    const lg = s.createLinearGradient(0, by + bh - 10, 0, by + bh);
    lg.addColorStop(0, "rgba(255,90,30,0)");
    lg.addColorStop(1, "rgba(255,90,30,0.22)");
    s.fillStyle = lg;
    s.fill(p);
    s.restore();
    // parapet with a lit top edge
    s.fillStyle = "#3c3634";
    s.fillRect(bx - 2, by - 4, bw + 4, 4);
    s.fillStyle = "rgba(255,190,150,0.35)";
    s.fillRect(bx - 2, by - 4, bw + 4, 1);
    K.aoEdge(s, bx, by + bh, bx + bw, by + bh, { width: 10, alpha: 0.55, side: -1 });
  };
  block(x - 50, y + 90, 90, 50);
  block(x, y + 40, 220, 70);
  block(x + 40, y, 150, 44);
  block(x + 180, y + 70, 120, 60);
  s.fillStyle = "#2a2626";
  s.fillRect(x + 172, y - 50, 12, 52);
  s.fillStyle = "rgba(255,180,140,0.25)";
  s.fillRect(x + 172, y - 50, 2, 52);
  s.fillStyle = "#121010";
  s.fillRect(x + 170, y - 54, 16, 6);
  // window recesses (lit live)
  s.fillStyle = "#0a120c";
  for (let i = 0; i < 7; i++) s.fillRect(x + 11 + i * 29, y + 57, 20, 12);
  for (let i = 0; i < 4; i++) s.fillRect(x + 191 + i * 26, y + 85, 18, 11);
  // catwalk
  s.strokeStyle = "#0e0c0c";
  s.lineWidth = 2;
  s.beginPath();
  s.moveTo(x - 60, y + 90); s.lineTo(x + 40, y + 40);
  s.moveTo(x - 60, y + 76); s.lineTo(x + 40, y + 26);
  for (let k = 0; k <= 8; k++) { const u = k / 8; s.moveTo(lerp(x - 60, x + 40, u), lerp(y + 90, y + 40, u)); s.lineTo(lerp(x - 60, x + 40, u), lerp(y + 76, y + 26, u)); }
  s.moveTo(x + 40, y - 4); s.lineTo(x + 190, y - 4);
  s.moveTo(x + 40, y - 13); s.lineTo(x + 190, y - 13);
  for (let k = 0; k <= 10; k++) { s.moveTo(x + 40 + k * 15, y - 4); s.lineTo(x + 40 + k * 15, y - 13); }
  s.stroke();
  // glass domes: they mirror the glowing ash sky (warm at the top, dark toward the horizon line),
  // show a little of the green interior low down, and carry one hard specular from the bright sky
  for (const [dx, dy, r] of DOMES) {
    const dome = new Path2D();
    dome.arc(dx, dy, r, Math.PI, 0);
    dome.closePath();
    const rg = s.createLinearGradient(0, dy - r, 0, dy);
    rg.addColorStop(0, "#b8643c");
    rg.addColorStop(0.35, "#5a2c1c");
    rg.addColorStop(0.62, "#1a120e");
    rg.addColorStop(0.8, "#0c1a12");
    rg.addColorStop(1, "#14402a");
    s.fillStyle = rg;
    s.fill(dome);
    // the sphere darkens toward its turned-away side (Fresnel keeps the rim brighter)
    const sg = s.createRadialGradient(dx - r * 0.3, dy - r * 0.45, r * 0.1, dx, dy - r * 0.2, r * 1.1);
    sg.addColorStop(0, "rgba(0,0,0,0)");
    sg.addColorStop(0.75, "rgba(0,0,0,0.35)");
    sg.addColorStop(1, "rgba(255,150,100,0.12)");
    s.fillStyle = sg;
    s.fill(dome);
    // mullions (meridians + one ring), thin dark steel
    s.save();
    s.clip(dome);
    s.strokeStyle = "rgba(10,12,10,0.8)";
    s.lineWidth = 1.1;
    s.beginPath();
    for (const a of [0.25, 0.5, 0.75]) { const ex = Math.cos(a * Math.PI) * r; s.ellipse(dx, dy, Math.abs(ex) + 0.01, r, 0, Math.PI, 0); }
    s.moveTo(dx - r * 0.8, dy - r * 0.6); s.ellipse(dx, dy - r * 0.6, r * 0.8, r * 0.12, 0, Math.PI, 0);
    s.stroke();
    s.restore();
    // specular: a sharp highlight of the sky glow, upper left, and a soft streak under it
    const hx = dx - r * 0.42, hy = dy - r * 0.62;
    const hg = s.createRadialGradient(hx, hy, 0, hx, hy, r * 0.32);
    hg.addColorStop(0, "rgba(255,236,210,0.95)");
    hg.addColorStop(0.25, "rgba(255,190,140,0.45)");
    hg.addColorStop(1, "rgba(255,160,110,0)");
    s.fillStyle = hg;
    s.beginPath(); s.ellipse(hx, hy, r * 0.32, r * 0.2, -0.6, 0, TAU); s.fill();
    s.fillStyle = "#2a2624";
    s.fillRect(dx - r - 2, dy, r * 2 + 4, 3);
  }
}
const DOMES = [[LAB.x + 70, LAB.y, 30], [LAB.x + 150, LAB.y, 22], [LAB.x + 250, LAB.y + 70, 26]];

// a lava flow on flat ground (shots 1 and 5): a tapered ribbon of the crusted flow tile scrolling
// along it, a hot core near the source, a soft glow on the ground beside it
function lavaRiver(g, pts, t, w, k = 1) {
  const S = K.sampleSpline(pts, false, 8), n = S.length;
  const L = [], R = [], C1 = [], C2 = [];
  for (let i = 0; i < n; i++) {
    const a = S[Math.max(0, i - 1)], c = S[Math.min(n - 1, i + 1)];
    let tx = c[0] - a[0], ty = c[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    const hw = w * (0.75 + 0.5 * (fbm(i * 0.4, 17) * 0.5 + 0.5)) * 0.5;
    L.push([S[i][0] - ty * hw, S[i][1] + tx * hw]);
    R.push([S[i][0] + ty * hw, S[i][1] - tx * hw]);
    C1.push([S[i][0] - ty * hw * 0.35, S[i][1] + tx * hw * 0.35]);
    C2.push([S[i][0] + ty * hw * 0.35, S[i][1] - tx * hw * 0.35]);
  }
  const p = ribbon(L, R), core = ribbon(C1, C2);
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineJoin = "round";
  g.strokeStyle = rgba("#ff4a10", 0.07 * k);
  g.lineWidth = w * 6;
  const sp = new Path2D();
  K.spline(sp, pts, false);
  g.stroke(sp);
  g.globalCompositeOperation = "source-over";
  patPaint(g, moltenTex(1), p, { scale: w * 14, scaleY: w * 7, ox: t * w * 2, oy: 0 });
  g.globalCompositeOperation = "lighter";
  g.fillStyle = rgba("#ff7a2a", 0.35 * k);
  g.fill(core);
  g.restore();
}
// the volcano's flows, live: crust tile scrolling down each ribbon, a white-hot core that cools with
// distance from the vent, steam lifting off the hot upper reaches, lit from below by the lava
function flows(g, t) {
  const tex = moltenTex(1);
  for (let i = 0; i < FLOWGEO.length; i++) {
    const F = FLOWGEO[i];
    patPaint(g, tex, F.path, { scale: 46, scaleY: 92, ox: i * 37, oy: t * 9 + i * 53 });
    const gr = g.createLinearGradient(0, F.y0, 0, F.y1);
    // white-hot only at the vent; within a short run the surface crusts over and the core dims
    gr.addColorStop(0, rgba(CORE, i === 0 || i === 2 ? 0.85 : 0.35));
    gr.addColorStop(0.12, rgba("#ffa040", 0.32));
    gr.addColorStop(0.4, rgba("#ff6020", 0.09));
    gr.addColorStop(1, rgba("#ff5018", 0.02));
    g.save();
    g.globalCompositeOperation = "lighter";
    g.fillStyle = gr;
    g.fill(F.core);
    g.restore();
  }
  for (let j = 0; j < 8; j++) {
    const F = FLOWGEO[j % 3 === 2 ? 2 : j % 2 ? 0 : 3];
    const smp = F.samples[Math.floor((0.15 + hash(j, 81) * 0.5) * (F.samples.length - 1))];
    const age = (t * 0.3 + hash(j, 82)) % 1;
    const x = smp[0] + age * 26 + Math.sin(t * 0.7 + j) * 4, y = smp[1] - age * 70;
    const a = Math.sin(Math.PI * age) * 0.22;
    puff(g, x, y, 8 + age * 30, j + age, j, "#d89070", a);
    puff(g, x, y + 4, 6 + age * 16, j * 2, j + 1, "#ff7030", a * 0.35, "lighter");
  }
}
// the eruption plume: a vertically scrolling baked density tile cut by a baked plume envelope, lit
// orange from the vent underneath and grey from the sky above (composited in a reusable layer)
function plumeTile() {
  return K.texBake("f08plumeT3", 128, 256, (u, v, out) => {
    const w = K.texFbm(u * 2, v * 4, 21, 3, 2, 4);
    const d = K.texFbm(u * 3 + w * 0.8, v * 6 + w * 0.6, 23, 5, 3, 6) * 0.5 + 0.5;
    const d2 = K.texFbm(u * 3 + w * 0.8, v * 6 - 0.15 + w * 0.6, 23, 5, 3, 6) * 0.5 + 0.5;
    const lit = clamp((d - d2) * 4 + 0.45);
    const c = 26 + 50 * lit + 10 * d;
    out[0] = c * 1.12; out[1] = c * 0.9; out[2] = c * 0.8;
    out[3] = sm(0.2, 0.62, d) * 255;
  });
}
function plumeEnv() {
  return K.texBake("f08plumeE3", 160, 256, (u, v, out) => {
    const a = 1 - v; // altitude: 0 at the vent
    const cx = 0.3 + a * a * 0.25;
    const hw = (0.07 + Math.sqrt(a) * 0.26 + sm(0.6, 1, a) * 0.25) * (1 + K.texFbm(u * 3, v * 5, 31, 4) * 0.5);
    const e = 1 - Math.abs(u - cx) / hw;
    const al = sm(0, 0.5, e) * sm(0, 0.05, a) * (1 - sm(0.75, 1, a) * 0.85);
    out[0] = out[1] = out[2] = 255; out[3] = al * 255;
  });
}
function plume(g, W, H, x, y, h, t, key) {
  const T = g.getTransform();
  const L = K.layer(W, H, "f08plume" + key);
  const c = L.g;
  c.setTransform(T);
  const pw = h * 0.9, left = x - pw * 0.3, top = y - h;
  const tile = plumeTile();
  const r = new Path2D();
  r.rect(left, top, pw, h);
  patPaint(c, tile, r, { scale: pw * 0.6, scaleY: pw * 1.2, ox: left, oy: top - t * h * 0.03 });
  patPaint(c, tile, r, { scale: pw * 0.36, scaleY: pw * 0.72, ox: left + 30, oy: top - t * h * 0.05, alpha: 0.6 });
  c.globalCompositeOperation = "destination-in";
  c.drawImage(plumeEnv(), left, top, pw, h);
  c.globalCompositeOperation = "source-atop";
  const gr = c.createRadialGradient(x, y, 0, x, y, h * 0.55);
  gr.addColorStop(0, "rgba(255,120,50,0.75)");
  gr.addColorStop(0.4, "rgba(220,80,30,0.3)");
  gr.addColorStop(1, "rgba(160,60,30,0)");
  c.fillStyle = gr;
  c.fillRect(left, top, pw, h);
  c.globalCompositeOperation = "source-over";
  const cw = L.canvas.width, ch = L.canvas.height;
  const X0 = Math.max(0, Math.floor(T.a * left + T.c * top + T.e - 8)), Y0 = Math.max(0, Math.floor(T.b * left + T.d * top + T.f - 8));
  const X1 = Math.min(cw, Math.ceil(T.a * (left + pw) + T.c * (top + h) + T.e + 8)), Y1 = Math.min(ch, Math.ceil(T.b * (left + pw) + T.d * (top + h) + T.f + 8));
  if (X1 <= X0 || Y1 <= Y0) return;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(L.canvas, X0, Y0, X1 - X0, Y1 - Y0, X0, Y0, X1 - X0, Y1 - Y0);
  g.restore();
}
function volcano(g, W, H, t, ox, oy, sc, o = {}) {
  g.save();
  g.translate(ox, oy);
  g.scale(sc, sc);
  if (o.plume !== false) plume(g, W, H, CRATER[0], CRATER[1] + 4, 600 * (o.plume || 1), t, o.key || "");
  g.drawImage(volcanoSprite(), 0, 0, VW, VH);
  const pulse = 0.85 + 0.15 * Math.sin(t * 2.3) * Math.sin(t * 0.7 + 1);
  glow(g, CRATER[0], CRATER[1] + 2, 120, LAVA, 0.4 * pulse);
  glow(g, CRATER[0], CRATER[1] + 4, 36, CORE, 0.9);
  flowGeo();
  flows(g, t);
  // the lab's lights: green windows and domes, a red aircraft beacon, steam from the stack
  const lk = o.labLight == null ? 1 : o.labLight;
  labSpace(g, () => {
    for (const [dx, dy, r] of DOMES) {
      // the green interior seen through the lower glass, and its glow
      g.fillStyle = rgba("#3aa862", 0.22);
      g.beginPath();
      g.ellipse(dx, dy, r * 0.9, r * 0.35, 0, Math.PI, 0);
      g.fill();
      glow(g, dx, dy - r * 0.2, r * 1.8, GREEN, (0.16 + 0.04 * Math.sin(t * 1.7 + dx)) * lk);
    }
    g.globalAlpha = lk;
    g.fillStyle = "#a8ffc0";
    for (let i = 0; i < 7; i++) if (hash(i, 77) > 0.2) g.fillRect(LAB.x + 13 + i * 29, LAB.y + 59, 16, 8);
    for (let i = 0; i < 4; i++) g.fillRect(LAB.x + 193 + i * 26, LAB.y + 87, 14, 7);
    g.globalAlpha = 1;
    glow(g, LAB.x + 110, LAB.y + 64, 150, GREEN, 0.12 * lk);
    K.lightPool(g, LAB.x + 110, LAB.y + 150, 220, GREEN, { flat: 0.3, intensity: (0.16 + 0.03 * Math.sin(t * 2.1)) * lk });
    for (const [bx, by, ph] of [[LAB.x + 60, LAB.y - 72, 0], [LAB.x + 300, LAB.y + 66, 1.3]]) {
      const on = clamp(Math.sin(t * 3 + ph) * 3 - 1.2);
      glow(g, bx, by, 16, "#ff3020", 0.85 * on);
      glow(g, bx, by, 4, "#ffd0c0", on);
    }
    for (let i = 0; i < 6; i++) {
      const age = (t * 0.25 + i / 6) % 1;
      puff(g, LAB.x + 178 + age * 50, LAB.y - 58 - age * 80, 10 + age * 34, i + age, i, "#b0a098", 0.5 * (1 - age) * clamp(age * 5));
    }
    if (o.labHaze) {
      // distance: the lab sinks into the same ash haze as the slope around it
      const hg = g.createRadialGradient(LAB.x + 130, LAB.y + 60, 20, LAB.x + 130, LAB.y + 60, 300);
      hg.addColorStop(0, rgba("#b4643e", o.labHaze));
      hg.addColorStop(0.6, rgba("#b4643e", o.labHaze * 0.6));
      hg.addColorStop(1, rgba("#b4643e", 0));
      g.fillStyle = hg;
      g.fillRect(LAB.x - 200, LAB.y - 260, 660, 640);
    }
  });
  g.restore();
}

// ---- SHOT 1: ultra-wide establishing, slow pan ----------------------------------------------------------
// foreground rocks: textured, rim-lit by the plain's lava, baked then blurred (out of focus, close)
function fgRocks() {
  return K.sprite("f08fgrocks2", 1300, 150, (s) => {
    const q = 4;
    const sm2 = K.makeCanvas(Math.ceil(1300 / q), Math.ceil(150 / q));
    const c = sm2.getContext("2d");
    c.scale(1 / q, 1 / q);
    const p = new Path2D();
    p.moveTo(0, 150);
    for (let x = 0; x <= 1300; x += 10) p.lineTo(x, 150 - 40 - fbm(x / 120, 12) * 34 - Math.max(0, Math.sin(x / 230)) * 46 - fbm(x / 30, 3) * 6);
    p.lineTo(1300, 150);
    p.closePath();
    K.texFill(c, "lavarock", p, { scale: 220, tex: { size: 128, seed: 9 } });
    c.fillStyle = "rgba(6,3,2,0.72)";
    c.fill(p);
    K.crescent(c, p, 0, 5, "#ff7a3a", 0.55, [0, 0, 1300, 150], "lighter");
    s.imageSmoothingEnabled = true;
    s.drawImage(sm2, 0, 0, 1300, 150);
  });
}
function shot1(g, t, W, H) {
  const p = eio(seg(t, 0, 10));
  const sc = lerp(0.4, 0.43, p), pan = lerp(-24, 24, p);
  K.withCamera(g, W, H, { shakeT: t * 0.6, shakeAmt: 0.7 }, () => {
    ashSky(g, W, H, "A", -pan * 0.15);
    g.save();
    g.translate(-100 - pan * 0.2, 0);
    K.hills(g, W + 260, H, { y: H * 0.79, amp: 34, color: "#4a2216", seed: 3, haze: "#c8683a", hazeAmt: 0.62, freq: 1.4, tex: "lavarock" });
    g.restore();
    const baseY = 474;
    volcano(g, W, H, t, 540 + pan - CRATER[0] * sc, baseY - VH * sc, sc, { plume: 1.15, key: "1", labHaze: 0.5, labLight: 0.6 });
    // the lava plain at the volcano's foot, in perspective, its far edge lost in the haze
    g.save();
    g.translate(-90 - pan * 0.55, 0);
    K.groundPlane(g, W + 180, H, { tex: "lavarock", texOpts: { seed: 4, size: 128, color: "#6a5650" }, horizon: 446, y0: 458, scale: 300, fog: "#b05a32", fogAmt: 0.9, tint: "#d08a60", tintAlpha: 0.3 });
    for (const [px, py, pr] of [[180, 470, 40], [760, 476, 60], [1010, 468, 30]]) {
      K.lightPool(g, px, py, pr * 3, "#ff5a1a", { flat: 0.18, intensity: 0.5 });
      g.save();
      g.translate(px, py);
      g.scale(1, 0.12);
      glow(g, 0, 0, pr, "#ffa040", 0.8);
      g.restore();
    }
    lavaRiver(g, [-40, 492, 160, 486, 330, 498, 520, 490, 700, 502, 900, 494, 1180, 506], t, 2.6, 0.9);
    K.lightPool(g, 520, 494, 520, "#ff5a1a", { flat: 0.12, intensity: 0.45 });
    g.restore();
    K.fog(g, W, H, { y: 460, h: 70, color: "#c0603a", alpha: 0.32, t, seed: 4 });
    g.save();
    g.translate(-150 - pan * 1.5, H - 150);
    g.drawImage(fgRocks(), 0, 0, 1300, 150);
    g.restore();
  });
  ash(g, W, H, t, { count: 90, wind: 10, alpha: 0.45 });
  embers(g, W, H, t, { count: 18, area: [0, H * 0.4, W, H * 0.6] });
}

// ---- SHOT 2: tracking behind you at the base; heat shimmer, a lava bubble bursts -----------------------
const PASS = [[-2.2, 0.4, 3.2], [2.4, 0.5, 4.6], [-2.8, 0.6, 6.4], [2.0, 0.5, 7.8], [-2.4, 0.45, 9.0], [2.6, 0.55, 11]];
function boulderPath(x, y, s, seed) {
  const R = K.rng("b" + seed);
  const p = new Path2D();
  const pts = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    const r = s * (0.75 + R() * 0.35);
    pts.push(x + Math.cos(a) * r * 1.2, y + Math.sin(a) * r * 0.9);
  }
  K.spline(p, pts, false);
  p.closePath();
  return p;
}
function boulder(g, x, y, s, seed, lit) {
  K.shadowBlob(g, x + lit * s * 0.25, y, s * 1.3, s * 0.16, { alpha: 0.7 });
  const p = boulderPath(x, y, s, seed);
  K.texFill(g, "lavarock", p, { scale: Math.max(30, s * 2.2), ox: x, oy: y, tex: { size: 128, seed: 2 + (seed % 3) } });
  const gr = g.createLinearGradient(x - lit * s, 0, x + lit * s, 0);
  gr.addColorStop(0, "rgba(0,0,0,0.75)");
  gr.addColorStop(1, "rgba(0,0,0,0.2)");
  g.fillStyle = gr;
  g.fill(p);
  K.crescent(g, p, -lit * s * 0.05, s * 0.03, "#ff7a2a", 0.28, [x - s * 1.5, y - s * 1.2, x + s * 1.5, y + 2], "lighter", 2);
}
// a cinder trail as a ribbon: tapering into the distance, edges broken by stones, a textured tread
function trailRibbon(g, pts, w0, w1, seed) {
  const S = K.sampleSpline(pts, false, 8), n = S.length;
  const Lft = [], Rgt = [];
  for (let i = 0; i < n; i++) {
    const a = S[Math.max(0, i - 1)], c = S[Math.min(n - 1, i + 1)];
    let tx = c[0] - a[0], ty = c[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    const w = lerp(w0, w1, i / (n - 1)) * 0.5;
    const j1 = (hash(i, seed) - 0.5) * w * 0.35, j2 = (hash(i, seed + 1) - 0.5) * w * 0.35;
    Lft.push([S[i][0] - ty * (w + j1), S[i][1] + tx * (w + j1)]);
    Rgt.push([S[i][0] + ty * (w + j2), S[i][1] - tx * (w + j2)]);
  }
  const rib = new Path2D();
  Lft.forEach((q, i) => (i ? rib.lineTo(q[0], q[1]) : rib.moveTo(q[0], q[1])));
  for (let i = n - 1; i >= 0; i--) rib.lineTo(Rgt[i][0], Rgt[i][1]);
  rib.closePath();
  K.texFill(g, "sand", rib, { scale: 70, scaleY: 26, tex: { size: 128, color: "#6a5c56", ripples: 0, seed: seed }, tint: "#3a2a24", tintAlpha: 0.55 });
  g.fillStyle = "#120a08";
  for (let i = 0; i < n; i += 1) {
    for (const E of [Lft, Rgt]) {
      if (hash(i, seed + (E === Lft ? 3 : 4)) < 0.5) continue;
      const r = lerp(w0, w1, i / (n - 1)) * 0.12;
      g.beginPath();
      g.ellipse(E[i][0], E[i][1], r * 1.3, r * 0.7, 0, 0, TAU);
      g.fill();
    }
  }
}
// static background of shot 2 (sky aside), baked: the plain, the trail and the far switchbacks
function shot2ground(W, H) {
  return K.sprite("f08gr3", W, H - 400, (s) => {
    s.translate(0, -400);
    K.groundPlane(s, W, H, { tex: "lavarock", texOpts: { seed: 6, size: 128, color: "#6a5650" }, horizon: 424, y0: 426, scale: 380, fog: "#9a4a2a", fogAmt: 0.85, tint: "#b07050", tintAlpha: 0.3, cache: false });
    trailRibbon(s, [490, H + 30, 494, 480, 490, 432], 130, 18, 5);
  });
}
// anisotropic mip chain for a baked tile (canvas patterns have no mipmaps: a foreshortened plane
// would sparkle): level (h, v) halves the width h times and the height v times, built once, lazily
const MIPS = new WeakMap();
function mip(c, h, v) {
  if (!h && !v) return c;
  let m = MIPS.get(c);
  if (!m) { m = new Map(); MIPS.set(c, m); }
  const k = h * 8 + v;
  let out = m.get(k);
  if (out) return out;
  const src = v > 0 ? mip(c, h, v - 1) : mip(c, h - 1, v);
  const w = Math.max(1, c.width >> h), hh = Math.max(1, c.height >> v);
  out = K.makeCanvas(w, hh);
  const x = out.getContext("2d");
  x.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in x) x.imageSmoothingQuality = "high";
  // wrap-aware halving: draw the tile shifted by half a texel in 2x2 so edges blend with the far side
  x.drawImage(src, 0, 0, w, hh);
  m.set(k, out);
  return out;
}
// lavaPlane: the molten tile laid on a horizontal plane in true perspective (horizon hz, camera height
// 1, focal F): thin strips, each with a pattern matrix matching the plane's local scale + derivative
// so the texture stays continuous; flows by scrolling the world (fx, fz per second)
function lavaPlane(g, tex, x0, x1, hz, y0, y1, t, o = {}) {
  const F = o.F || 600, Kt = o.K || 140, cx = o.cx == null ? 480 : o.cx;
  const n = o.strips || 22;
  if (typeof DOMMatrix === "undefined") return;
  const du = (o.fx || 0) * t * Kt, dv = (o.fz || 0) * t * Kt;
  g.save();
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  for (let i = 0; i < n; i++) {
    const a = Math.pow(i / n, 1.7), b = Math.pow((i + 1) / n, 1.7);
    const ya = Math.max(y0, hz + 0.5 + (y1 - hz) * a), yb = hz + 0.5 + (y1 - hz) * b;
    if (yb <= y0) continue;
    const yc = (ya + yb) / 2, dz = yc - hz;
    const pvc = (Kt * F) / dz + dv;
    const sy = -(dz * dz) / (Kt * F), sx = dz / Kt;
    // user = M * pattern:  x = sx*pu + (cx - sx*du) ; y = sy*pv + (yc - sy*pvc)
    // pick the mip level that keeps about one texel per device pixel along each axis
    const ps = K.pixelScale();
    const lh = clamp(Math.round(Math.log2(1 / (sx * ps)) + 0.3), 0, 5), lv = clamp(Math.round(Math.log2(1 / (-sy * ps)) + 0.3), 0, Math.min(7, lh + 3));
    const c = mip(tex, lh, lv);
    const p = patOf(g, c);
    if (!p || !p.setTransform) continue;
    const fh = 1 << lh, fv = 1 << lv;
    p.setTransform(new DOMMatrix([sx * fh, 0, 0, sy * fv, cx - sx * du, yc - sy * pvc]));
    g.fillStyle = p;
    g.fillRect(x0, ya, x1 - x0, yb - ya + 0.6);
  }
  g.restore();
}
function lavaLake(g, path, t, o = {}) {
  // a crusted patch of lava (bubble skins): the lake tile, foreshortened
  const sc = o.scale || 180;
  patPaint(g, moltenTex(0), path, { scale: sc, scaleY: sc * (o.flat || 0.26), ox: (o.ox || 0) + t * (o.drift || 6), oy: o.oy || 0 });
}
// a lava lake in true perspective: (1) the dark crust tile, domain-warped at bake time; (2) an additive
// fissure-only tile at ~0.4x the scale drifting at another speed and direction, so no repeat lines up;
// (3) a large low-frequency hot/cool modulation multiplied on top; (4) the far rows compress below a
// pixel and melt into a glowing heat-haze band; (5) slow bubble domes that swell and pop.
function lakeSurface(g, x0, x1, hz, y0, y1, t, o = {}) {
  const F = o.F || 900, Kt = o.K || 130, cx = o.cx == null ? 480 : o.cx;
  const fx = o.fx || 0, fz = o.fz || 0;
  lavaPlane(g, baked(moltenB("lake")), x0, x1, hz, y0, y1, t, { F, K: Kt, cx, fx, fz, strips: o.strips || 14 });
  g.save();
  g.globalCompositeOperation = "multiply";
  lavaPlane(g, baked(lakeModB()), x0, x1, hz, y0, y1, t, { F, K: Kt * 7, cx: cx + 300, fx: fx * 0.3, fz: fz * 0.3, strips: 6 });
  g.globalCompositeOperation = "lighter";
  lavaPlane(g, baked(moltenB("fis")), x0, x1, hz, y0, y1, t, { F, K: Kt * 0.42, cx: cx - 170, fx: -fx * 1.9 + 0.006, fz: fz * 1.6 + 0.004, strips: Math.round((o.strips || 18) * 0.7), alpha: o.fis == null ? 0.8 : o.fis });
  // the far surface: sub-pixel crust, a band of glowing haze sitting on the lake
  const hb = o.band || 26;
  const bg = g.createLinearGradient(0, hz - hb * 0.6, 0, hz + hb);
  bg.addColorStop(0, "rgba(255,110,44,0)");
  bg.addColorStop(0.35, rgba("#ff7832", 0.42 * (o.bandA || 1)));
  bg.addColorStop(0.6, rgba("#dc501e", 0.22 * (o.bandA || 1)));
  bg.addColorStop(1, "rgba(200,70,30,0)");
  g.fillStyle = bg;
  g.fillRect(x0, hz - hb * 0.6, x1 - x0, hb * 1.6);
  g.restore();
  // bubble domes on the plane (sites in screen space, depth from their y)
  for (const B of o.bubbles || []) bubble(g, B[0], B[1], B[2], t + B[3], B[4] || 5.5);
}
// one bubble: the crust skin swells slowly (glossy, its top catching the sky, a hot ring at its foot),
// splits, flashes and throws a few blobs, then the ring spreads and fades
function bubble(g, x, y, r, t, P) {
  const c = ((t % P) + P) % P / P;
  if (c < 0.72) {
    const sw = smooth(c / 0.72);
    const rr = r * (0.2 + sw * 0.8), hh = rr * (0.25 + sw * 0.45);
    glow(g, x, y, rr * 1.6, "#ff6a1a", 0.25 * sw);
    const dome = new Path2D();
    dome.ellipse(x, y, rr, hh, 0, Math.PI, 0);
    dome.ellipse(x, y, rr, hh * 0.25, 0, 0, Math.PI);
    lavaLake(g, dome, 0, { scale: rr * 3, flat: 0.5, ox: x, oy: y - hh });
    const sg = g.createRadialGradient(x - rr * 0.3, y - hh * 0.8, 0, x, y - hh * 0.3, rr);
    sg.addColorStop(0, rgba("#ffd0a0", 0.45 * sw));
    sg.addColorStop(0.3, "rgba(255,130,60,0.08)");
    sg.addColorStop(1, rgba("#ff5a1a", 0.35 * sw));
    g.save();
    g.globalCompositeOperation = "lighter";
    g.fillStyle = sg;
    g.fill(dome);
    g.restore();
  } else {
    const k = (c - 0.72) / 0.28;
    const fl = Math.max(0, 1 - k * 4);
    glow(g, x, y - r * 0.2, r * 2.4, CORE, 0.5 * fl);
    glow(g, x, y, r * 1.5 * (1 + k * 2), "#ff6a1a", 0.35 * (1 - k));
    g.save();
    g.translate(x, y);
    g.scale(1, 0.3);
    const rg = g.createRadialGradient(0, 0, r * k * 2, 0, 0, r * (0.4 + k * 2.4));
    rg.addColorStop(0, "rgba(255,150,60,0)");
    rg.addColorStop(0.7, rgba("#ffa050", 0.4 * (1 - k)));
    rg.addColorStop(1, "rgba(255,120,40,0)");
    g.globalCompositeOperation = "lighter";
    g.fillStyle = rg;
    g.beginPath(); g.arc(0, 0, r * (0.4 + k * 2.4), 0, TAU); g.fill();
    g.restore();
    if (k < 0.5) {
      g.save();
      g.lineCap = "round";
      for (let i = 0; i < 6; i++) {
        const vx = (hash(i, x) - 0.5) * r * 6, vy = -r * (4 + hash(i, y) * 4);
        const q = k * 0.9;
        const px = x + vx * q, py = y + vy * q + r * 18 * q * q;
        if (py > y) continue;
        g.strokeStyle = k < 0.25 ? "#ffb048" : "#a83008";
        g.lineWidth = Math.max(1, r * 0.12);
        g.beginPath(); g.moveTo(px, py); g.lineTo(px - vx * 0.04, py - (vy + r * 36 * q) * 0.04); g.stroke();
      }
      g.restore();
    }
  }
}
// a person relit as a photographed figure: drawn into a small layer, then (all clipped to the
// silhouette) a strong warm underlight from the lava, a cool dark sky fill on the shoulders and hood,
// drape folds at the elbows and the hood's base, and rims cut from the silhouette's own edges
//   fx.under {x,y,r,color,alpha} (layer-local), fx.top {color,alpha}, fx.rims [{dx,dy,color,alpha}], fx.folds
function litPerson(g, x, y, h, opts, fx) {
  const lw = Math.ceil(h * 0.75), lh = Math.ceil(h * 1.12);
  const ax = lw / 2, ay = lh - 6;
  const L = K.layer(lw, lh, "f08kidL");
  K.drawPerson(L.g, ax, ay, h, opts);
  const s = L.g;
  if (fx.folds) {
    // creases: a dark sliver with a lit lower lip (the light is below)
    s.save();
    s.globalCompositeOperation = "source-atop";
    const u = h / 100;
    const fold = (fxp, fyp, w, a, rot) => {
      s.save();
      s.translate(ax + fxp * u, ay + fyp * u);
      s.rotate(rot);
      s.fillStyle = `rgba(20,8,4,${a})`;
      s.beginPath(); s.ellipse(0, 0, w * u, 0.7 * u, 0, 0, TAU); s.fill();
      s.fillStyle = `rgba(255,150,80,${a * 0.5})`;
      s.beginPath(); s.ellipse(0, 1.1 * u, w * u * 0.8, 0.45 * u, 0, 0, TAU); s.fill();
      s.restore();
    };
    for (const sd of [-1, 1]) {
      fold(sd * 11.5, -60, 2.6, 0.55, sd * 0.5);
      fold(sd * 11.2, -57, 2.0, 0.4, sd * 0.35);
      fold(sd * 6, -46, 3.5, 0.35, sd * 0.15);
    }
    fold(0, -84, 5.5, 0.6, 0);
    fold(-1, -81.5, 4.2, 0.4, 0.05);
    s.restore();
  }
  const M = K.layer(lw, lh, "f08kidM");
  const m = M.g;
  const paintMasked = (paint, mode, alpha) => {
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = "source-over";
    m.globalAlpha = 1;
    m.clearRect(0, 0, M.canvas.width, M.canvas.height);
    const px = K.pixelScale();
    m.setTransform(px, 0, 0, px, 0, 0);
    paint(m);
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = "destination-in";
    m.drawImage(L.canvas, 0, 0);
    s.save();
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = mode;
    s.globalAlpha = alpha;
    s.drawImage(M.canvas, 0, 0);
    s.restore();
  };
  if (fx.top) {
    paintMasked((c) => {
      const gr = c.createLinearGradient(0, ay - h, 0, ay - h * 0.55);
      gr.addColorStop(0, fx.top.color);
      gr.addColorStop(1, rgba(fx.top.color, 0));
      c.fillStyle = gr;
      c.fillRect(0, 0, lw, lh);
    }, "source-atop", fx.top.alpha);
  }
  if (fx.under) {
    const U = fx.under;
    paintMasked((c) => {
      const gr = c.createRadialGradient(U.x, U.y, 0, U.x, U.y, U.r);
      gr.addColorStop(0, U.color);
      gr.addColorStop(0.5, rgba(U.color, 0.4));
      gr.addColorStop(1, rgba(U.color, 0));
      c.fillStyle = gr;
      c.fillRect(0, 0, lw, lh);
    }, "lighter", U.alpha);
  }
  g.drawImage(L.canvas, x - ax, y - ay, lw, lh);
  for (const Rm of fx.rims || []) {
    // the silhouette minus itself shifted: the edge band on the side facing the light
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalAlpha = 1;
    m.globalCompositeOperation = "source-over";
    m.clearRect(0, 0, M.canvas.width, M.canvas.height);
    m.drawImage(L.canvas, 0, 0);
    m.globalCompositeOperation = "destination-out";
    const px = K.pixelScale();
    m.drawImage(L.canvas, Rm.dx * px, Rm.dy * px);
    m.globalCompositeOperation = "source-in";
    m.fillStyle = Rm.color;
    m.fillRect(0, 0, M.canvas.width, M.canvas.height);
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha *= Rm.alpha;
    g.drawImage(M.canvas, x - ax, y - ay, lw, lh);
    g.restore();
  }
}
const POOL = { x: 215, y: 490, rx: 230, ry: 40 };
function shot2(g, t, W, H) {
  const tt = t - 10;
  const walk = Math.sin(tt * 0.9 * TAU) * 0.8;
  K.withCamera(g, W, H, { y: 270 + walk, zoom: 1 + eio(seg(t, 10, 20)) * 0.035, shakeT: t, shakeAmt: 1.6 }, () => {
    ashSky(g, W, H, "A", 20 - tt * 2);
    volcano(g, W, H, t, -60, 30, 0.78, { plume: 0.9, key: "2" });
    K.fog(g, W, H, { y: 420, h: 60, color: "#a8502e", alpha: 0.3, t, seed: 3 });
    g.drawImage(shot2ground(W, H), 0, 400, W, H - 400);
    // the lava pool to the left, front: the key light of the shot
    const pool = new Path2D();
    pool.ellipse(POOL.x, POOL.y, POOL.rx, POOL.ry, 0.03, 0, TAU);
    K.lightPool(g, POOL.x + 20, POOL.y - 4, 460, "#ff5a1a", { flat: 0.3, intensity: 0.8 });
    // cooled crust levee: a soft dark band around the pool's edge, no outline
    g.save();
    g.translate(POOL.x, POOL.y + 2);
    g.scale(1, POOL.ry / POOL.rx);
    const lv = g.createRadialGradient(0, 0, POOL.rx * 0.9, 0, 0, POOL.rx * 1.08);
    lv.addColorStop(0, "rgba(14,6,4,0.9)");
    lv.addColorStop(1, "rgba(14,6,4,0)");
    g.fillStyle = lv;
    g.beginPath(); g.arc(0, 0, POOL.rx * 1.08, 0, TAU); g.fill();
    g.restore();
    g.save();
    g.clip(pool);
    lakeSurface(g, -20, 460, 424, 446, 540, t, { cx: 215, F: 960, K: 130, fx: 0.02, fz: 0.01, band: 14, bubbles: [[70, 470, 9, 0, 6.5], [250, 512, 13, 2.6, 7.3], [400, 474, 7, 4.1, 5.2]] });
    const lg = g.createRadialGradient(POOL.x, POOL.y, 20, POOL.x, POOL.y, POOL.rx);
    lg.addColorStop(0, "rgba(255,170,80,0.12)");
    lg.addColorStop(0.75, "rgba(255,120,40,0)");
    lg.addColorStop(1, "rgba(10,4,2,0.75)");
    g.fillStyle = lg;
    g.fillRect(POOL.x - POOL.rx, POOL.y - POOL.ry, POOL.rx * 2, POOL.ry * 2);
    g.restore();
    // the big bubble (the hit at 16): swells 14.4 -> 16, then bursts into spatter
    const bx = 330, by = 500;
    if (t < 16) {
      const sw = smooth(seg(t, 15.6, 16)) * 0.85 + smooth(seg(t, 14.4, 15.6)) * 0.15;
      if (sw > 0) {
        const dome = new Path2D();
        dome.ellipse(bx, by, 6 + sw * 30, 4 + sw * 26, 0, Math.PI, 0);
        dome.closePath();
        lavaLake(g, dome, 0, { scale: 60 + sw * 20, flat: 0.8, ox: bx, oy: by - 30 });
        const bg = g.createRadialGradient(bx - 8 * sw, by - 18 * sw, 1, bx, by - 6 * sw, 34 * sw + 4);
        bg.addColorStop(0, rgba("#ffe0a0", 0.25 + sw * 0.4));
        bg.addColorStop(0.6, "rgba(255,120,40,0.1)");
        bg.addColorStop(1, "rgba(30,6,2,0.4)");
        g.fillStyle = bg;
        g.fill(dome);
        glow(g, bx, by - sw * 12, 30 + sw * 50, CORE, 0.35 * sw);
      }
    } else {
      const k = t - 16;
      if (k < 2.2) {
        g.save();
        g.lineCap = "round";
        for (let i = 0; i < 26; i++) {
          const vx = (hash(i, 8) - 0.35) * 300, vy = -(220 + hash(i, 9) * 260);
          const x = bx + vx * k, y = by + vy * k + 0.5 * 520 * k * k;
          if (y > by + 20) continue;
          const f = clamp(1 - k / (1.2 + hash(i, 10)));
          const vyk = vy + 520 * k;
          const r = 1.6 + hash(i, 11) * 3;
          g.strokeStyle = f > 0.7 ? "#ffb048" : f > 0.4 ? "#ff7420" : f > 0.15 ? "#a82808" : "#1a0804";
          g.lineWidth = r * 1.1;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x - vx * 0.035, y - vyk * 0.035);
          g.stroke();
          if (f > 0.1) glow(g, x, y, 5 + r * 2, "#ff6a1a", 0.35 * f);
        }
        g.restore();
        glow(g, bx, by, 120 * (1 - k / 2.2), LAVA, 0.3 * (1 - k / 2.2));
      }
    }
    K.heatShimmer(g, 0, 270, W, 180, t, { amp: 1.8, band: 4 });
    const camZ = tt * 0.42;
    const items = PASS.map(([X, Y, z0], i) => ({ X, Y, z: ((z0 - camZ) % 9 + 9) % 9 + 0.6, i })).sort((a, b) => b.z - a.z);
    for (const it of items) {
      const s = 100 / it.z;
      const fade = clamp((9.6 - it.z) / 1.2);
      g.save();
      g.globalAlpha = fade;
      boulder(g, 486 + it.X * 1.9 * s, 432 + s, s * 0.9, it.i, it.X > 0 ? -1 : 1);
      g.restore();
    }
    // you, walking up the path, hood up. Weight shifts over the stance foot each step, the chest
    // breathes; the pool is the key from below and front-left, the dark sky a cool fill from above
    const ph = tt * 0.9;
    const shift = Math.sin(ph * TAU) * 2.2;
    const kx = 470 + noise(t * 0.5, 2) * 4 + shift, ky = 520;
    g.save();
    g.translate(kx, ky + 2);
    g.transform(1, 0, 1.3, 0.26, 0, 0); // the long shadow thrown back and right, away from the pool
    K.shadowBlob(g, 0, -60, 20, 60, { alpha: 0.5 });
    g.restore();
    K.shadowBlob(g, kx, ky + 2, 30, 5, { alpha: 0.85 });
    g.save();
    g.translate(kx, ky);
    g.rotate(Math.sin(ph * TAU) * 0.012 + Math.sin(t * 1.7) * 0.004);
    g.scale(1, 1 + Math.sin(t * 1.7) * 0.005);
    litPerson(g, 0, 0, 210, {
      view: "back", walk: true, phase: ph, hood: true, t, bell: true, shadow: false,
      light: { x: kx - 280, y: 600, color: "#ff8030", strength: 1.0, z: -0.25 }, ambient: "#140a08",
    }, {
      folds: true,
      under: { x: 10, y: 250, r: 150, color: "#ff6a20", alpha: 1.0 },
      top: { color: "#0e1424", alpha: 0.85 },
      rims: [{ dx: 0, dy: 2.2, color: "#ffb070", alpha: 0.75 }, { dx: 1.5, dy: 0, color: "#ff8a40", alpha: 0.4 }],
    });
    g.restore();
  });
  embers(g, W, H, t, { count: 30, area: [500, 200, 460, 340], seed: 12 });
  emberBokeh(g, W, H, t, { count: 4, seed: 63, size: 0.8, alpha: 0.22 });
  ash(g, W, H, t, { count: 60, wind: 8, seed: 5 });
  if (t >= 16 && t < 16.6) K.fadeColor(g, W, H, 0.12 * (1 - seg(t, 16, 16.6)), "#ff9040");
}

// ---- SHOT 3: low angle from beside the lava, up at the rope bridge --------------------------------------
// A real 3D bridge seen from below: camera near the lava, pitched up 0.2 rad. The span runs from the near
// (left, out of frame) anchor away to the far right wall; plank undersides converge toward the vanishing
// point; the deck sits in the upper part of the frame and you cross it, ~140 px tall at the start.
const C3 = { th: 0.2, F: 560, CY: 300 };
const C3c = Math.cos(C3.th), C3s = Math.sin(C3.th);
function proj3(X, Y, Z) {
  const yc = Y * C3c - Z * C3s, zc = Y * C3s + Z * C3c;
  return [480 + (C3.F * X) / zc, C3.CY - (C3.F * yc) / zc, zc];
}
const BA = [-300, 300, 120], BB = [500, 300, 2600];
const BDIR = (() => { const dx = BB[0] - BA[0], dz = BB[2] - BA[2], l = Math.hypot(dx, dz); return [dx / l, dz / l]; })();
// a point on the deck: s along the span, e across it (-1..1 = the two edges), lift above the deck
function deck(s, e, lift, t) {
  const sw = Math.sin(Math.PI * s);
  const X = lerp(BA[0], BB[0], s) - BDIR[1] * e * 62 + Math.sin(t * 1.1 + 0.6) * 12 * sw;
  const Z = lerp(BA[2], BB[2], s) + BDIR[0] * e * 62;
  const Y = lerp(BA[1], BB[1], s) - 110 * sw + Math.sin(t * 1.4) * 5 * sw + lift;
  return proj3(X, Y, Z);
}
// basalt walls lit from the lava below: a baked height field (dipping strata whose lower lips
// overhang, plus fbm at two scales) shaded per pixel. Light comes up from the river, falls off with
// height, and only down-facing ledges catch it; the tops go black.
function rockWallB(key, w, h, o) {
  // the height field is cached per row ((w+1) x (h+1) samples), so each pixel costs one H() and
  // its neighbours are looked up; the edge/top silhouettes are cached per row / column too
  let HF = null, HR = null, EDGE = null, TOP = null;
  const H = (px, py) => {
    const w0 = K.texFbm(px / 110, py / 70, o.seed, 3) * 34;
    const q = (py + px * o.dip + w0) / o.band + K.texFbm(px / 50, py / 50, o.seed + 4, 2) * 0.35;
    const iq = Math.floor(q), f = q - iq;
    // each bed protrudes only in places: ledges start and stop along the wall, some beds are smooth
    const bed = (0.25 + 0.75 * hash(iq, o.seed)) * sm(-0.15, 0.35, K.texFbm(px / 70 + iq * 3.7, iq * 1.3, o.seed + 5, 2));
    // blocky jointed basalt: big lumps (fbm), irregular partial ledges, fine grit
    const lump = K.texFbm(px / 46, py / 38, o.seed + 1, 3);
    const crack = 1 - Math.abs(K.texFbm(px / 26 + 9, py / 60, o.seed + 6, 2));
    return Math.pow(f, 1.5) * (1 - sm(0.8, 1, f)) * 5 * bed + lump * 16 - Math.pow(crack, 14) * 6 + K.texFbm(px / 9, py / 8, o.seed + 2, 2) * 2.6;
  };
  const row = (y) => {
    if (HR[y]) return;
    const X0 = o.x0, Y = y + o.y0, off = y * (w + 1);
    for (let x = 0; x <= w; x++) {
      const X = x + X0, e = EDGE[Math.min(h, y)], cov = o.side < 0 ? e - X : X - e;
      HF[off + x] = cov <= -2 ? 0 : H(X, Y);
    }
    HR[y] = 1;
  };
  return bake(key, w, h, o.chunks || 32, (u, v, out, x, y) => {
    if (!HF) {
      HF = new Float32Array((w + 1) * (h + 1)); HR = new Uint8Array(h + 1);
      EDGE = new Float32Array(h + 1); TOP = new Float32Array(w + 1);
      for (let i = 0; i <= h; i++) EDGE[i] = o.edge(i + o.y0);
      for (let i = 0; i <= w; i++) TOP[i] = o.top(i + o.x0);
    }
    const X = x + o.x0, Y = y + o.y0;
    const e = EDGE[y];
    const cov = o.side < 0 ? e - X : X - e;
    if (cov <= -0.5 || Y < TOP[x]) { out[3] = 0; return; }
    row(y); row(y + 1);
    const k = y * (w + 1) + x;
    const h0 = HF[k], hx = HF[k + 1], hy = HF[k + w + 1];
    let nx = -(hx - h0), ny = -(hy - h0), nz = 1;
    // the wall face itself turns toward the gap near its edge
    nx += (o.side < 0 ? 1 : -1) * 0.6 * (1 - sm(0, 60, cov));
    const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;
    const dl = clamp(0.1 * nx * (o.side < 0 ? 1 : -1) + 0.92 * ny + 0.38 * nz);
    const fall = Math.exp(-Math.max(0, o.lavaY - Y) / o.fall);
    const sky = clamp(-0.6 * ny + 0.5 * nz) * (o.sky || 0.05);
    const alb = 0.8 + Math.sin(h0 * 0.37 + X * 0.011) * 0.12; // albedo varies with the relief (no extra noise)
    const ao = 0.55 + 0.45 * clamp(h0 / 10 + 0.4);
    const I = (dl * 1.25 + 0.1) * fall * ao * alb;
    // hotter (yellower) right at the lava line, a dull red higher up, black at the top
    const hot = Math.exp(-Math.max(0, o.lavaY - Y) / (o.fall * 0.3));
    out[0] = clamp(8 + 270 * I * 0.95 + 40 * sky, 0, 255);
    out[1] = clamp(5 + 270 * I * (0.3 + 0.22 * hot) + 30 * sky, 0, 255);
    out[2] = clamp(4 + 270 * I * (0.08 + 0.08 * hot) + 38 * sky, 0, 255);
    out[3] = clamp(cov + 0.5) * 255;
  });
}
const WALL3 = {
  L: { x0: 0, y0: 40, w: 250, h: 420, side: -1, seed: 7, dip: 0.12, band: 21, lavaY: 440, fall: 150, sky: 0.06,
    edge: (y) => 188 - (440 - y) * 0.12 + fbm(y / 40, 5) * 26 + fbm(y / 9, 8) * 5, top: () => -1 },
  R: { x0: 650, y0: 236, w: 310, h: 224, side: 1, seed: 9, dip: -0.08, band: 14, lavaY: 440, fall: 110, sky: 0.08,
    edge: (y) => 770 + (440 - y) * 0.16 - fbm(y / 30, 6) * 18 - fbm(y / 8, 9) * 3,
    top: (x) => 262 - (x - 700) * 0.12 + fbm(x / 40, 11) * 10 + fbm(x / 9, 12) * 2 },
};
const wallB = (k) => { const o = WALL3[k]; return rockWallB("f08wall3" + k, o.w, o.h, o); };
// the far side of the chasm: distant rock in haze, lit at its foot by the river
function farBasin(W, H) {
  return K.sprite("f08far3b", W, 200, (g) => {
    g.translate(0, -260);
    const far = new Path2D();
    far.moveTo(-20, 470);
    for (let x = -20; x <= W + 20; x += 10) far.lineTo(x, 392 + fbm(x / 70, 7) * 14 + fbm(x / 17, 2) * 4);
    far.lineTo(W + 20, 470);
    far.closePath();
    K.texFill(g, "lavarock", far, { scale: 60, scaleY: 30, tex: { size: 128, seed: 7, color: "#5a4038" } });
    const bw = g.createLinearGradient(0, 380, 0, 430);
    bw.addColorStop(0, "rgba(150,70,40,0.7)");
    bw.addColorStop(1, "rgba(60,20,10,0.4)");
    g.fillStyle = bw;
    g.fill(far);
    g.globalCompositeOperation = "lighter";
    const ll = g.createLinearGradient(0, 395, 0, 425);
    ll.addColorStop(0, "rgba(255,90,30,0)");
    ll.addColorStop(1, "rgba(255,100,30,0.5)");
    g.fillStyle = ll;
    g.fill(far);
  });
}
function chasmSprite(W, H) { return farBasin(W, H); } // (kept name: WARM and older callers)
function riverNear(g, W, H, t, top) {
  lakeSurface(g, -40, W + 40, 413, top, H + 30, t, { F: 900, K: 50, fx: 0.3, fz: 0, strips: 18, band: 16, bandA: 0.6, fis: 1, bubbles: [[150, 470, 8, 1.3, 6], [700, 486, 11, 3.9, 7.4]] });
}
function rope(g, pts, w0, w1, dark, lit) {
  const p = new Path2D(), q = new Path2D();
  const ws = pts.map((_, i) => lerp(w0, w1, i / (pts.length - 1)));
  const flat = pts.flat();
  K.tube(p, flat, ws, 3);
  K.tube(q, flat.map((v, i) => (i % 2 ? v + ws[Math.floor(i / 2) * 1] * 0.0 : v)), ws.map((w) => w * 0.55), 3);
  g.fillStyle = dark;
  g.fill(p);
  g.save();
  g.translate(0, ws[0] * 0.25);
  g.globalCompositeOperation = "lighter";
  g.fillStyle = lit;
  g.fill(q);
  g.restore();
}
function shot3(g, t, W, H) {
  const p = eio(seg(t, 20, 30));
  K.withCamera(g, W, H, { x: 480 + p * 14, y: 270 - p * 6, zoom: 1.0 + p * 0.03, rot: Math.sin(t * 0.6) * 0.004, shakeT: t, shakeAmt: 1.2 }, () => {
    ashSky(g, W, H, "A", -p * 20);
    volcano(g, W, H, t, 500 - CRATER[0] * 0.27, 418 - VH * 0.27, 0.27, { plume: 1.3, key: "3", labLight: 0.7 });
    K.fog(g, W, H, { y: 390, h: 60, color: "#d0703a", alpha: 0.3, t, seed: 6 });
    g.drawImage(farBasin(W, H), 0, 260, W, 200);
    const wl = WALL3.L, wr = WALL3.R;
    g.drawImage(baked(wallB("R")), wr.x0, wr.y0, wr.w, wr.h);
    // the near wall: the bridge's near anchor is above it, out of frame, so the span passes in front
    g.drawImage(baked(wallB("L")), wl.x0, wl.y0, wl.w, wl.h);
    // the bridge in perspective
    const N = 64;
    const P = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      P.push({ s, a: deck(s, -1, 0, t), b: deck(s, 1, 0, t) });
    }
    // which side is nearer the camera: draw that handrail after you
    const nearE = P[N >> 1].a[2] < P[N >> 1].b[2] ? -1 : 1;
    const rail = (e, lift) => { const out = []; for (let i = 0; i <= N; i += 2) { const q = deck(i / N, e, lift, t); out.push([q[0], q[1]]); } return out; };
    const rw = (e, k) => { const z0 = deck(0.02, e, 0, t)[2], z1 = deck(1, e, 0, t)[2]; return [C3.F * k / z0, C3.F * k / z1]; };
    const drawRail = (e) => {
      const [w0, w1] = rw(e, 3.2);
      rope(g, rail(e, 130), w0, w1, "#1e100a", "rgba(255,120,50,0.45)");
      // hangers from the handrail down to the deck edge, every third plank
      g.fillStyle = "#24140c";
      for (let i = 3; i < N; i += 3) {
        const top = deck(i / N, e, 130, t), bot = deck(i / N, e, 0, t);
        const ww = Math.max(0.6, (C3.F * 1.3) / bot[2]);
        g.fillRect(bot[0] - ww / 2, top[1], ww, bot[1] - top[1]);
      }
    };
    drawRail(-nearE);
    // you, crossing: careful steps, hood up, lit from the lava below; the deck hides your soles
    const sK = lerp(0.17, 0.3, eio(seg(t, 20.2, 29.8)));
    const kp = deck(sK, 0.15, 0, t);
    let kh = (C3.F * 225) / kp[2];
    kh = Math.min(kh, kp[1] - 64); // never into the top letterbox
    // seen against the bright ash: a dark figure, its underside lit hot from the river below, the
    // hood and shoulders falling to the dark sky fill, the edges rimmed by the glow behind
    litPerson(g, kp[0], kp[1] + kh * 0.015, kh, {
      view: "side", facing: 1, walk: true, phase: (t - 20) * 0.7, t, bell: true, hood: true, shadow: false,
      light: { x: kp[0] - 30, y: kp[1] + 400, color: "#ff7a2a", strength: 1.3, z: -0.4 }, ambient: "#120806",
    }, {
      folds: true,
      under: { x: kh * 0.375, y: kh * 1.25, r: kh * 0.75, color: "#ff6a20", alpha: 0.7 },
      top: { color: "#0e0a10", alpha: 0.75 },
      rims: [{ dx: 0, dy: 2, color: "#ffa060", alpha: 0.7 }, { dx: -1.5, dy: 0, color: "#ff8a40", alpha: 0.35 }],
    });
    // plank undersides: each a quad between two cross-sections, lit from below (warm), the nearer
    // ones larger, with dark gaps between; a thin front edge on each plank
    const tones = [new Path2D(), new Path2D(), new Path2D()], edges = new Path2D(), all = new Path2D();
    for (let i = 0; i < N; i++) {
      const A = P[i], B = P[i + 1];
      const k = 0.78;
      const m = (q, r, u) => [lerp(q[0], r[0], u), lerp(q[1], r[1], u)];
      const a1 = A.a, a2 = A.b, b1 = m(A.a, B.a, k), b2 = m(A.b, B.b, k);
      const tilt = (hash(i, 41) - 0.5) * 1.6;
      const quad = (pp) => { pp.moveTo(a1[0], a1[1] + tilt); pp.lineTo(a2[0], a2[1] - tilt); pp.lineTo(b2[0], b2[1] - tilt); pp.lineTo(b1[0], b1[1] + tilt); pp.closePath(); };
      quad(all);
      quad(tones[Math.floor(hash(i, 42) * 3)]);
      const th = Math.max(0.6, (C3.F * 2.2) / A.a[2]);
      edges.moveTo(b1[0], b1[1] + tilt); edges.lineTo(b2[0], b2[1] - tilt); edges.lineTo(b2[0], b2[1] - tilt + th); edges.lineTo(b1[0], b1[1] + tilt + th); edges.closePath();
    }
    K.texFill(g, "wood", all, { scale: 34, rot: -0.55, tex: { size: 128, seed: 4, color: "#5a3c26" } });
    g.fillStyle = "rgba(70,22,8,0.92)";
    g.save();
    g.globalCompositeOperation = "multiply";
    g.fill(all);
    g.restore();
    g.save();
    g.globalCompositeOperation = "lighter";
    const ug = g.createLinearGradient(0, 60, 0, 280);
    ug.addColorStop(0, "rgba(255,110,40,0.15)");
    ug.addColorStop(1, "rgba(255,110,40,0.4)");
    g.fillStyle = ug;
    g.fill(all);
    g.restore();
    g.fillStyle = "rgba(0,0,0,0.18)"; g.fill(tones[0]);
    g.fillStyle = "rgba(255,140,80,0.06)"; g.fill(tones[1]);
    g.fillStyle = "#1a0c06"; g.fill(edges);
    // the two stringers under the plank ends
    for (const e of [-1, 1]) {
      const [w0, w1] = rw(e, 3.6);
      rope(g, rail(e, -2), w0, w1, "#180a06", "rgba(255,130,60,0.55)");
    }
    // aerial perspective along the span: the far planks sink into the glowing ash haze
    {
      const n0 = deck(0.12, 0, 0, t), n1 = deck(0.75, 0, 0, t);
      const hg = g.createLinearGradient(n0[0], n0[1], n1[0], n1[1]);
      hg.addColorStop(0, "rgba(150,62,32,0)");
      hg.addColorStop(0.45, "rgba(150,62,32,0.25)");
      hg.addColorStop(1, "rgba(160,70,36,0.7)");
      g.fillStyle = hg;
      g.fill(all);
      g.fill(edges);
    }
    drawRail(nearE);
    riverNear(g, W, H, t, 418);
    K.heatShimmer(g, 0, 380, W, 90, t, { amp: 1.6, band: 3 });
  });
  embers(g, W, H, t, { count: 40, seed: 22, area: [80, 140, 800, 360] });
  emberBokeh(g, W, H, t, { count: 7, seed: 21, size: 1.1, alpha: 0.22 });
  ash(g, W, H, t, { count: 50, wind: 14, seed: 8 });
}

// ---- SHOT 4: profile silhouette climb up a steep face against the crater-lit ash -------------------------
const H4 = 580;
function faceX(y) {
  // the cliff's sky edge: ~67 degrees, broken into irregular ledges
  const u = (H4 - y) / (H4 + 80);
  const step = Math.floor(y / 34), f = y / 34 - step;
  const ledge = (hash(step, 81) - 0.5) * 12 * sm(0, 0.2, f);
  return lerp(330, 640, u) + fbm(y / 46, 3) * 22 + fbm(y / 11, 5) * 4 + ledge;
}
// the face, seen almost edge-on against the glow: dark, but not a cut-out. Rock texture shows near
// the edge where the sky light grazes it, the edge itself carries a faint warm rim, and the tops of a
// few ledges catch the glow; the undersides fall into shadow.
function faceSprite(W, H) {
  return K.sprite("f08face6", W + 120, H + 320, (s) => {
    s.translate(0, 220);
    const face = new Path2D();
    face.moveTo(W + 60, H + 100);
    for (let y = H + 100; y >= -220; y -= 3) face.lineTo(faceX(y), y);
    face.lineTo(W + 60, -220);
    face.closePath();
    K.texFill(s, "lavarock", face, { scale: 120, tex: { size: 128, seed: 12 } });
    const eg = s.createLinearGradient(330, 0, 760, 0);
    eg.addColorStop(0, "rgba(60,22,12,0.2)");
    eg.addColorStop(0.08, "rgba(20,8,5,0.4)");
    eg.addColorStop(0.3, "rgba(8,3,2,0.62)");
    eg.addColorStop(1, "rgba(4,2,1,0.84)");
    s.fillStyle = eg;
    s.fill(face);
    s.save();
    s.clip(face);
    // grazing light: a band along the edge, broken by fbm (the surface undulates in and out of it)
    for (let y = -220; y < H + 100; y += 3) {
      const x = faceX(y), k = 0.5 + 0.5 * fbm(y / 24, 41);
      const gw = 14 + k * 40;
      const gr = s.createLinearGradient(x, 0, x + gw, 0);
      gr.addColorStop(0, `rgba(210,92,42,${(0.75 * k).toFixed(3)})`);
      gr.addColorStop(1, "rgba(170,74,36,0)");
      s.fillStyle = gr;
      s.fillRect(x - 2, y, gw + 2, 3.5);
    }
    for (let y = -220, i = 0; y < H + 100; y += 34, i++) {
      if (hash(i, 51) < 0.5) continue;
      const x = faceX(y + 1), reach = 8 + hash(i, 52) * 26;
      // the undercut shadow below the ledge
      const sg = s.createLinearGradient(x, 0, x + reach * 2, 0);
      sg.addColorStop(0, "rgba(0,0,0,0.75)");
      sg.addColorStop(1, "rgba(0,0,0,0)");
      s.fillStyle = sg;
      s.beginPath();
      s.ellipse(x + reach, y + 6, reach, 2.5 + hash(i, 53) * 3, -0.06, 0, TAU);
      s.fill();
      // the ledge's top catching the glow
      const lg = s.createLinearGradient(x, 0, x + reach * 1.4, 0);
      lg.addColorStop(0, "rgba(255,150,80,0.55)");
      lg.addColorStop(1, "rgba(255,130,70,0)");
      s.fillStyle = lg;
      s.beginPath();
      s.ellipse(x + reach * 0.6, y + 1.2, reach * 0.65, 1.1, -0.04, 0, TAU);
      s.fill();
    }
    // warm bounce low down, from the glowing ground
    const bg = s.createLinearGradient(0, H - 120, 0, H + 100);
    bg.addColorStop(0, "rgba(120,40,16,0)");
    bg.addColorStop(1, "rgba(120,40,16,0.3)");
    s.fillStyle = bg;
    s.fillRect(300, H - 120, W, 220);
    s.restore();
    K.crescent(s, face, 3, 1, "#ffb070", 0.28, [200, -230, W + 60, H + 100], "lighter", 2);
  });
}
// the climb: hand over hand, a cycle of 2.4 s. Right hand reaches up (0-.2), pull with a body lift
// (.2-.42), the feet step up (.42-.55), left hand reaches (.55-.72), second pull (.72-.86), then a
// pause for breath (.86-1). Each half-cycle climbs one hold (S px).
const CP = 2.4, CS = 23;
function climbState(t) {
  const tau = Math.max(0, t - 30.2);
  const n = Math.floor(tau / CP), c = (tau % CP) / CP;
  const r1 = eio(seg(c, 0.2, 0.42)), r2 = eio(seg(c, 0.72, 0.86));
  const holds = n * 2 + r1 + r2; // holds climbed so far (continuous)
  const reachR = seg(c, 0, 0.2), reachL = seg(c, 0.55, 0.72);
  const pull = Math.max(Math.sin(Math.PI * seg(c, 0.2, 0.42)), Math.sin(Math.PI * seg(c, 0.72, 0.86)));
  const step = n + eio(seg(c, 0.42, 0.55)) * 0.5 + eio(seg(c, 0.86, 0.96)) * 0.5;
  const rest = seg(c, 0.86, 1) > 0 ? Math.sin(Math.PI * seg(c, 0.86, 1)) : 0;
  return { n, c, holds, reachR, reachL, pull, step, rest };
}
function shot4(g, t, W, H) {
  const p = eio(seg(t, 30, 42));
  const S = climbState(t);
  const yk = 476 - S.holds * CS;
  const camY = 270 - (476 - yk) * 0.55;
  K.withCamera(g, W, H, { x: 480 + p * 16, y: camY, zoom: 1.0 + p * 0.05, shakeT: t, shakeAmt: 1.4 }, () => {
    g.save();
    g.translate(0, camY - 270);
    ashSky(g, W, H, "B", -p * 30);
    // no sun: the crater's glow, below the ridges to the left, under-lights the cloud bank
    g.save();
    g.globalCompositeOperation = "lighter";
    const cg = g.createRadialGradient(150, 520, 10, 150, 520, 420);
    cg.addColorStop(0, "rgba(255,110,40,0.32)");
    cg.addColorStop(0.4, "rgba(220,70,24,0.14)");
    cg.addColorStop(1, "rgba(200,60,20,0)");
    g.fillStyle = cg;
    g.fillRect(-100, 100, 700, 500);
    g.restore();
    K.hills(g, W, H, { y: H * 0.9, amp: 46, color: "#3a160e", seed: 5, haze: "#d0703c", hazeAmt: 0.55, tex: "lavarock" });
    K.fog(g, W, H, { y: H * 0.86, h: 60, color: "#e08050", alpha: 0.3, t, seed: 2 });
    g.restore();
    g.drawImage(faceSprite(W, H), 0, -220, W + 120, H + 320);
    // you, pressed to the face
    const xk = faceX(yk) - 6;
    const u = 1.2;
    const rot = 0.12 + S.pull * 0.06 - S.rest * 0.03, cs = Math.cos(-rot), sn = Math.sin(-rot);
    const lift = S.rest * Math.sin(t * 9) * 0.8; // breathing hard in the pause
    const toBody = (px, py) => {
      const dx = (px - xk) / u, dy = (py - yk - lift) / u;
      let bx = dx * cs - dy * sn, by = dx * sn + dy * cs;
      // an arm is only so long: a hold out of reach is grabbed at full stretch
      const sx = 3, sy = -77, ax = bx - sx, ay = by - sy, l = Math.hypot(ax, ay), M = 31;
      if (l > M) { bx = sx + (ax / l) * M; by = sy + (ay / l) * M; }
      return [bx, by];
    };
    // holds: right hand on even holds above the body, left on odd ones
    const hold = (k) => { const y = 476 - 120 - k * CS; return [faceX(y) - 1, y]; };
    const kR = 2 * S.n, kL = 2 * S.n - 1;
    const a0 = hold(kR), a1 = hold(kR + 2), b0 = hold(kL), b1 = hold(kL + 2);
    const arc = (q0, q1, k) => [lerp(q0[0], q1[0], eio(k)) - Math.sin(Math.PI * k) * 12, lerp(q0[1], q1[1], eio(k))];
    const hR = S.reachR > 0 && S.c < 0.2 ? arc(a0, a1, S.reachR) : S.c >= 0.2 ? a1 : a0;
    const hL = S.c >= 0.55 && S.c < 0.72 ? arc(b0, b1, S.reachL) : S.c >= 0.72 ? b1 : b0;
    g.save();
    g.translate(xk, yk + lift);
    g.rotate(rot);
    const kidOpts = {
      view: "side", facing: 1, walk: true, phase: S.step * 0.5 + 0.1, crouch: 0.15 + S.pull * 0.15, t, hood: true,
      armR: { hand: toBody(hR[0], hR[1]) }, armL: { hand: toBody(hL[0], hL[1]) },
      coat: "#3a2a12", pants: "#1a1410", boots: "#2a1008", hair: "#1a0e08", skin: "#5a3a2a",
      light: { x: -600, y: 100, color: "#ffa060", strength: 2, z: -0.85 }, ambient: "#0c0604", shadow: false,
    };
    K.drawPerson(g, 0, 0, 120, kidOpts);
    // the hood's loose edge and the hem flutter in the sideways wind
    const fl = (k, ph) => Math.sin(t * 11 + ph) * 0.6 + noise(t * 4 + ph, 7) * 0.8 + k;
    const hood = new Path2D();
    hood.moveTo(-6, -110);
    hood.bezierCurveTo(-12 - fl(1, 0) * 1.5, -110 + fl(0, 1) * 1.5, -16 - fl(2, 2) * 2, -104 + fl(0, 3) * 2, -14 - fl(1.5, 9) * 2, -99 + fl(0, 10) * 2);
    hood.quadraticCurveTo(-10, -100 + fl(0, 4), -5, -98);
    hood.closePath();
    const hem = new Path2D();
    hem.moveTo(-8, -54);
    hem.quadraticCurveTo(-14 - fl(1, 5) * 2, -52 + fl(0, 6) * 1.5, -17 - fl(1.5, 7) * 2, -47 + fl(0, 8) * 2);
    hem.lineTo(-7, -46);
    hem.closePath();
    g.fillStyle = "#1a1208";
    g.fill(hood);
    g.fill(hem);
    K.crescent(g, hood, 1.2, 0.4, "#ff9a50", 0.5, [-30, -116, 0, -94], "lighter");
    g.restore();
  });
  ash(g, W, H, t, { count: 90, wind: -160, seed: 11, alpha: 0.55 });
  embers(g, W, H, t, { count: 16, seed: 31, wind: -60 });
}

// ---- SHOT 5: the lava cat, sunbathing on lava ------------------------------------------------------------
// a lava-orange cat (FILMS.md): dark ember-orange fur, its back in shadow, lit hard from the lake below
// (belly, chin and paw tops glow), wide glowing cracks with a soft halo, warm subsurface in the ears
const LAVACAT = {
  base: "#a8400e", light: "#d8662a", dark: "#3a0e04", stripe: "#6a2208", tip: "#ff8a3a", belly: "#c85a1e", white: "#c85a1e",
  nose: "#ff8a4a", noseEdge: "#a8401a", innerEar: "#ff7a3a", iris: "#ffcf4a", irisInner: "#fff0a0", liner: "#120806",
  pattern: "solid", bib: false, socks: false, muzzle: false, stripeAlpha: 0, bentEar: false, sheen: 1.2,
};
const CAT5 = { x: 580, y: 414, s: 140 };
const CATSP = { w: 460, h: 300, cx: 240, cy: 270 };
function catSprite(t, closed) {
  const lift = smooth(seg(t, 48.6, 49.5)) * (1 - smooth(seg(t, 50.6, 51.4)));
  const look = smooth(seg(t, 48.4, 49.2)) * (1 - smooth(seg(t, 50.6, 51.4)));
  const key = "f08cat10:" + look.toFixed(3) + ":" + lift.toFixed(3) + ":" + closed;
  return K.sprite(key, CATSP.w, CATSP.h, (s) => {
    const x = CATSP.cx, y = CATSP.cy;
    K.drawCat(s, x, y, CAT5.s, {
      pose: "loaf", facing: -1, t: 0, coat: LAVACAT, collar: false, bell: false, breath: 0, autoBlink: false,
      headTurn: lerp(0.4, -0.45, look), blink: closed ? 1 : lerp(0.55, 0.1, look), ears: 0.2 + look * 0.5,
      tail: 0.3, tailPose: [[-9, -5], [-9, -13], [-6, -16], [-2, -14]], tailPoseK: lift,
      tailGlow: { color: LAVA, core: CORE, alpha: 0 * lift, trail: [0.15, 0.3, 0.45, 0.6].map((d, i) => [Math.max(0, lift - d), 0.5 - i * 0.1]) },
      eyesGlow: 0.6, pupil: 0.25,
      key: { x: x + 60, y: y + 120, color: "#ff8a3a", strength: 3.5 },
      rim: { x: x - 420, y: y - 260, color: "#ffb478", strength: 0.3 },
      fill: "#160502", ambient: "#2a0e06", ambientK: 0.12, backlit: 0.9, castShadow: 0, ground: "#3a0a00",
    });
    // relight on top of the kit's shading. Lava below is the only real light: the back, the top of
    // the head and the far flank fall into deep shadow (multiply), the belly, chin, chest and paw tops
    // glow hot orange (additive, from below and slightly in front)
    s.save();
    s.globalCompositeOperation = "source-atop";
    const sh = s.createLinearGradient(0, y - 150, 0, y - 10);
    sh.addColorStop(0, "rgba(14,3,1,0.86)");
    sh.addColorStop(0.45, "rgba(18,4,2,0.62)");
    sh.addColorStop(0.8, "rgba(30,8,3,0.12)");
    sh.addColorStop(1, "rgba(30,8,3,0)");
    s.fillStyle = sh;
    s.fillRect(0, 0, x + 92, CATSP.h); // not over the tail (its flick glows)
    s.globalCompositeOperation = "lighter";
    // chin and chest, just above the lava-lit rock
    const cg = s.createRadialGradient(x - 95, y - 70, 4, x - 95, y - 80, 60);
    cg.addColorStop(0, "rgba(255,120,40,0.4)");
    cg.addColorStop(1, "rgba(255,90,20,0)");
    s.fillStyle = cg;
    s.fillRect(x - 160, y - 150, 130, 130);
    const ul = s.createRadialGradient(x - 30, y + 60, 10, x - 30, y + 40, 150);
    ul.addColorStop(0, "rgba(255,110,30,0.6)");
    ul.addColorStop(0.45, "rgba(255,80,20,0.25)");
    ul.addColorStop(1, "rgba(255,60,10,0)");
    s.fillStyle = ul;
    s.fillRect(0, 0, CATSP.w, CATSP.h);
    s.restore();
    // the cracks: a baked mosaic of glowing seams with a soft halo, only where there is fur, added
    const M = K.layer(CATSP.w, CATSP.h, "f08catM");
    M.g.save();
    M.g.beginPath(); M.g.rect(0, 0, CATSP.w, y - 8); M.g.clip(); // not on the contact shadow
    M.g.drawImage(baked(catCrackB()), x - 210, y - 200, 420, 240);
    M.g.restore();
    M.g.globalCompositeOperation = "destination-in";
    M.g.drawImage(s.canvas, 0, 0, CATSP.w, CATSP.h);
    s.save();
    s.globalCompositeOperation = "lighter";
    s.drawImage(M.canvas, 0, 0, CATSP.w, CATSP.h);
    s.restore();
    // warm subsurface in the ears (thin, back-lit by the glow)
    s.save();
    s.globalCompositeOperation = "source-atop";
    for (const ex of [-110, -80]) {
      const eg = s.createRadialGradient(x + ex, y - 174, 1, x + ex, y - 174, 9);
      eg.addColorStop(0, "rgba(255,120,50,0.45)");
      eg.addColorStop(1, "rgba(255,90,30,0)");
      s.fillStyle = eg;
      s.fillRect(x + ex - 10, y - 184, 20, 20);
    }
    s.restore();
  });
}
// the lava cat's coat: a mosaic of crust plates (Voronoi) split by glowing seams; a hot core 1-2 px,
// a 4-6 px halo, some seams dim and healed, hotter along the belly line (lower in the bake)
function catCrackB() {
  return bake("f08catcrack3", 420, 240, 20, (u, v, out, x, y) => {
    const w = K.texFbm(x / 60, y / 60, 81, 3) * 0.6;
    const vo = K.texVoronoi(x / 34 + w, y / 26 + w * 0.7, 83);
    const e = (vo.f2 - vo.f1) * 28; // ~px from the seam
    // the face stays readable: no cracks over the eyes and muzzle
    const face = sm(26, 52, Math.hypot(x - 112, (y - 62) * 1.1));
    const act = face * sm(0.5, 0.7, K.texFbm(x / 90, y / 70, 85, 3) * 0.5 + 0.5 + (((vo.id >>> 4) & 255) / 255 - 0.5) * 0.4) * (0.55 + 0.45 * (y / 240));
    const core = (1 - sm(0.5, 1.4, e)) * act;
    const halo = Math.exp(-e / 3.6) * act * 0.8;
    out[0] = clamp(255 * (halo * 0.75 + core), 0, 255);
    out[1] = clamp(255 * (halo * 0.24 + core * 0.72), 0, 255);
    out[2] = clamp(255 * (halo * 0.05 + core * 0.32), 0, 255);
    out[3] = 255;
  });
}
// the warm rock: textured basalt with glowing fissures, baked; a molten meniscus where it meets lava
function rockBakeB() {
  const w = 460, h = 120, wy = 112;
  let top = null;
  return bake("f08boulder3", w, h, 12, (u, v, out, x, y) => {
    if (!top) {
      top = new Float32Array(w);
      for (let i = 0; i < w; i++) {
        const e = clamp(1 - ((i - 230) / 222) ** 2);
        top[i] = wy - (Math.pow(e, 0.5) * 64 + (fbm(i / 40, 3) - 0.5) * 12 * e + (fbm(i / 11, 6) - 0.5) * 5 * e);
      }
    }
    const yt = top[x];
    const water = wy - 2 + Math.sin(x * 0.07) * 1.5;
    if (y < yt - 0.5 || y > water) { out[3] = 0; return; }
    const f = clamp((y - yt) / Math.max(4, water - yt));
    const b0 = K.texFbm(x / 22, y / 14, 3, 4), bx = K.texFbm((x + 1.5) / 22, y / 14, 3, 4), by = K.texFbm(x / 22, (y + 1.5) / 14, 3, 4);
    let nx = ((x - 230) / 222) * 0.75 + (bx - b0) * 3.5;
    let ny = -(1 - f) * 0.85 + f * 0.25 + (by - b0) * 3.5;
    let nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const sky = clamp(-0.45 * nx - 0.75 * ny + 0.35 * nz);
    const lava = clamp(0.1 * nx + 0.8 * ny + 0.45 * nz + 0.25) * (0.35 + f * 0.9);
    const vo = K.texVoronoi(x / 5, y / 4, 9);
    const hole = (vo.id & 7) === 0 ? sm(0.3, 0.1, vo.f1) : 0;
    const alb = 0.55 + (b0 * 0.5 + 0.5) * 0.35 - hole * 0.4;
    // contact occlusion: the foot of the rock, where it meets the lava, darkens before the meniscus
    const foot = sm(0.78, 0.95, f) * (1 - sm(0.97, 1, f));
    const ao = (1 - hole * 0.5) * (1 - foot * 0.55);
    let r = alb * ao * (52 * sky + 210 * lava) + 8, g = alb * ao * (26 * sky + 62 * lava) + 5, bb = alb * ao * (18 * sky + 18 * lava) + 4;
    const cr = K.texRidged(x / 60, y / 30, 5, 4);
    const em = sm(0.9, 0.98, cr) * (0.4 + f * 0.6);
    r += em * 230; g += em * 110; bb += em * 30;
    out[0] = clamp(r, 0, 255); out[1] = clamp(g, 0, 255); out[2] = clamp(bb, 0, 255);
    out[3] = clamp(y - yt + 0.5) * 255;
  });
}
function rockBake() { return baked(rockBakeB()); }
// the slope behind: you are up on it. Baked once at half resolution, then blurred (out of focus)
const SLOPE5 = (u) => [lerp(-20, 980, u), (1 - u) * (1 - u) * 330 + 2 * u * (1 - u) * 250 + u * u * 40];
const slopeY = (u) => SLOPE5(u)[1] + fbm(u * 12, 6) * 12 + fbm(u * 50, 2) * 3;
const BG5 = { x: -20, y: -12, sx: 1000 / 960, sy: 564 / 540 }; // where the baked background lands
const LABWIN5 = [[781, 103], [813, 103], [845, 103], [877, 103], [909, 103]];
function bg5S(W, H) {
  return staged("f08bg5b", [
    (st) => {
      st.c = K.makeCanvas(W / 2, H / 2);
      const c = st.c.getContext("2d");
      c.scale(0.5, 0.5);
      c.drawImage(skyTex("A"), -40, -60, W + 80, H * 1.15);
      K.hills(c, W, H, { y: 300, amp: 40, color: "#4a2016", seed: 9, haze: "#d07040", hazeAmt: 0.5, tex: "lavarock", cache: false });
    },
    (st) => {
      const c = st.c.getContext("2d");
      const face = new Path2D();
      face.moveTo(-20, H);
      for (let u = 0; u <= 1.0001; u += 0.025) { const q = SLOPE5(u); face.lineTo(q[0], slopeY(u)); }
      face.lineTo(W + 20, 40); face.lineTo(W + 20, H);
      face.closePath();
      K.texFill(c, "lavarock", face, { scale: 160, tex: { size: 128, seed: 21 } });
      const fg = c.createLinearGradient(0, 40, 0, H);
      fg.addColorStop(0, "rgba(60,24,14,0.35)");
      fg.addColorStop(1, "rgba(10,4,2,0.6)");
      c.fillStyle = fg;
      c.fill(face);
      // the crest catches the glowing ash behind it: a soft lit band just under the skyline
      c.save();
      c.clip(face);
      c.lineJoin = "round";
      for (const [lw, a] of [[26, 0.12], [12, 0.18], [4, 0.28]]) {
        c.strokeStyle = "rgba(200,96,52," + a + ")";
        c.lineWidth = lw;
        c.beginPath();
        for (let u = 0; u <= 1.0001; u += 0.025) { const q = SLOPE5(u); c.lineTo(q[0], slopeY(u) + lw * 0.3); }
        c.stroke();
      }
      c.restore();
      // the lake's light climbing the slope from below
      c.globalCompositeOperation = "lighter";
      const lg = c.createLinearGradient(0, 200, 0, 400);
      lg.addColorStop(0, "rgba(255,90,30,0)");
      lg.addColorStop(1, "rgba(255,90,30,0.3)");
      c.fillStyle = lg;
      c.fill(face);
      c.globalCompositeOperation = "source-over";
    },
    (st) => {
      const c = st.c.getContext("2d");
      lavaRiver(c, [80, 540, 160, 440, 260, 380, 330, 300], 0, 7);
      const blk = (x, y, w, h) => {
        const p = new Path2D(); p.rect(x, y, w, h);
        K.texFill(c, "metal", p, { scale: 60, tex: { size: 128, color: "#6a6c70", rust: 0.3, seed: 3 } });
        const gr = c.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, "rgba(0,0,0,0.2)");
        gr.addColorStop(1, "rgba(0,0,0,0.65)");
        c.fillStyle = gr;
        c.fill(p);
      };
      blk(760, 70, 170, 70);
      blk(800, 30, 90, 44);
      c.fillStyle = "#1a2a1e";
      for (const [wx, wy] of LABWIN5) c.fillRect(wx - 9, wy - 5, 18, 10);
      c.fillStyle = "#6a5418";
      c.fillRect(828, 92, 34, 48);
      c.fillStyle = "#1e3a28";
      c.fillRect(834, 98, 22, 42);
    },
    (st) => {
      const out = K.makeCanvas(W / 2, H / 2);
      const o = out.getContext("2d");
      if (K.hasFilter()) o.filter = "blur(3px)";
      o.drawImage(st.c, 0, 0);
      o.filter = "none";
      st.out = out;
    },
  ]);
}
function bg5(W, H) { return stagedGet(bg5S(W, H)); }
function shot5(g, t, W, H) {
  const p = eio(seg(t, 42, 52));
  const bg = bg5(W, H);
  const push = 1 + p * 0.05;
  K.withCamera(g, W, H, { x: 480, y: 300, zoom: push, shakeT: t, shakeAmt: 0.8 }, () => {
    g.save();
    g.imageSmoothingEnabled = true;
    g.drawImage(bg, BG5.x, BG5.y, W * BG5.sx, H * BG5.sy);
    g.restore();
    // the lab's lit windows, far out of focus: soft discs, not smears
    K.bokehLights(g, W, H, t, { count: 0, alpha: 0.55, blades: 0, lights: LABWIN5.map(([x, y], i) => ({ x: BG5.x + x * BG5.sx, y: BG5.y + y * BG5.sy, r: 11 + hash(i, 3) * 3, color: "#8affb0", alpha: 0.75 + 0.25 * Math.sin(t * 1.3 + i) })) });
    K.bokehLights(g, W, H, t, { count: 0, alpha: 0.5, blades: 0, lights: [{ x: BG5.x + 845 * BG5.sx, y: BG5.y + 118 * BG5.sy, r: 18, color: "#5aff88" }] });
    // you: a small climber ON the slope (feet on its surface), lava-lit from below, a headlamp
    {
      const cu = 0.42 + p * 0.05;
      const fx = BG5.x + SLOPE5(cu)[0] * BG5.sx, fy = BG5.y + slopeY(cu) * BG5.sy + 3;
      const Lk = K.layer(60, 60, "f08k5c");
      Lk.g.translate(30, 54);
      Lk.g.rotate(-0.22);
      const climb = (t * 0.6) % 1;
      K.drawPerson(Lk.g, 0, 0, 24, { view: "side", facing: 1, walk: true, phase: t * 0.35, reach: 1, crouch: 0.45, t, shadow: false, hood: true, light: { x: -40, y: 200, color: "#ff8040", strength: 2, z: -0.6 }, ambient: "#3a1a0c" });
      K.shadowBlob(g, fx + 2, fy, 9, 2, { alpha: 0.7 });
      g.save();
      g.imageSmoothingEnabled = true;
      g.drawImage(Lk.canvas, fx - 30, fy - 54, 60, 60);
      g.restore();
      K.lightPool(g, fx, fy - 2, 40, "#ff6a28", { intensity: 0.3, flat: 0.55 });
      // the headlamp: a point of light and its little pool on the rock ahead
      const hx = fx + 6 + Math.sin(climb * TAU) * 0.6, hy = fy - 18;
      glow(g, hx, hy, 7, "#fff0d0", 0.9);
      glow(g, hx, hy, 2, "#ffffff", 1);
      K.lightPool(g, hx + 10, hy - 4, 26, "#ffe8c0", { intensity: 0.35, flat: 0.7 });
    }
    // the lava lake: dark crust, sparse hot fissures, bubbles; the far rows melt into a haze band
    lakeSurface(g, -40, W + 40, 384, 396, H + 30, t, { cx: 480, F: 960, K: 70, fx: 0.012, fz: -0.01, strips: 16, band: 34, bubbles: [[150, 430, 10, 0.7, 6.2], [860, 452, 14, 2.9, 7.6], [330, 500, 16, 5.1, 8.4]] });
    const fr = g.createLinearGradient(0, 392, 0, 440);
    fr.addColorStop(0, "rgba(170,70,36,0.6)");
    fr.addColorStop(1, "rgba(170,70,36,0)");
    g.fillStyle = fr;
    g.fillRect(-40, 392, W + 80, 48);
    // the rock: a dark band of cooled crust and shadow on the lava around its foot, then the rock
    const rx0 = CAT5.x - 20 - 230, ry0 = 452 - 112;
    glow(g, CAT5.x - 20, 452, 280, LAVA, 0.18);
    K.shadowBlob(g, CAT5.x - 20, 451, 230, 9, { alpha: 0.95, color: "#0a0302" });
    g.drawImage(rockBake(), rx0, ry0, 460, 120);
    // a hot meniscus right at the waterline (soft, no line)
    g.save();
    g.globalCompositeOperation = "lighter";
    g.translate(CAT5.x - 20, 452);
    g.scale(1, 0.05);
    const mg = g.createRadialGradient(0, 0, 200, 0, 0, 236);
    mg.addColorStop(0, "rgba(255,120,40,0)");
    mg.addColorStop(0.5, "rgba(255,130,50,0.45)");
    mg.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = mg;
    g.beginPath(); g.arc(0, 0, 236, 0, Math.PI); g.fill();
    g.restore();
    // the cat's contact shadow on the rock's crown
    K.shadowBlob(g, CAT5.x - 4, CAT5.y + 2, 74, 6, { alpha: 0.85 });
    const inAct = (t > 48.3 && t < 49.6) || (t > 50.5 && t < 51.5);
    let blink = 0;
    for (const bt of [43.1, 45.6, 47.4, 52.2]) blink = Math.max(blink, 1 - Math.abs(t - bt) / 0.09);
    const breathe = 1 + 0.012 * Math.sin(t * 2.1);
    const put = (spr, a) => {
      if (a <= 0.002) return;
      g.save();
      g.globalAlpha *= a;
      g.translate(CAT5.x, CAT5.y);
      g.scale(1, breathe);
      g.drawImage(spr, -CATSP.cx, -CATSP.cy, CATSP.w, CATSP.h);
      g.restore();
    };
    if (inAct) {
      const q = t * 15, q0 = Math.floor(q), f = q - q0;
      put(catSprite(q0 / 15, 0), 1);
      put(catSprite((q0 + 1) / 15, 0), f);
    } else {
      put(catSprite(t, 0), 1);
      if (blink > 0) put(catSprite(t, 1), clamp(blink * 1.5));
    }
    glow(g, CAT5.x, CAT5.y - 40, 170, LAVA, 0.1 + 0.05 * Math.sin(t * 1.3));
    // the raised tail's tip glows like a coal as it points at the lab
    {
      const lift = smooth(seg(t, 48.6, 49.5)) * (1 - smooth(seg(t, 50.6, 51.4)));
      if (lift > 0.01) {
        const tx = CAT5.x + 172 * lift + 120 * (1 - lift), ty = CAT5.y - 152 * lift - 40 * (1 - lift);
        glow(g, tx, ty, 16, LAVA, 0.55 * lift);
        glow(g, tx, ty, 5, CORE, 0.85 * lift);
      }
    }
    embers(g, W, H, t, { count: 22, seed: 41, area: [CAT5.x - 280, 240, 520, 200] });
    K.heatShimmer(g, 0, 300, W, 100, t, { amp: 1.2, band: 3 });
  });
  ash(g, W, H, t, { count: 50, wind: 8, seed: 13 });
}

// ---- SHOT 6: the lab's steel door hisses open -------------------------------------------------------------
function hazard(g, x, y, w, h, vertical) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = "#c89a1c";
  g.fillRect(x, y, w, h);
  g.fillStyle = "#141210";
  const n = Math.ceil((vertical ? h : w) / 22) + 4;
  for (let i = -2; i < n; i++) {
    g.beginPath();
    if (vertical) { g.moveTo(x, y + i * 22); g.lineTo(x + w, y + i * 22 - w); g.lineTo(x + w, y + i * 22 - w + 11); g.lineTo(x, y + i * 22 + 11); }
    else { g.moveTo(x + i * 22, y + h); g.lineTo(x + i * 22 + h, y); g.lineTo(x + i * 22 + h + 11, y); g.lineTo(x + i * 22 + 11, y + h); }
    g.fill();
  }
  // worn paint: metal showing through, grime
  K.texRect(g, "metal", x, y, w, h, { scale: 60, alpha: 0.55, mode: "multiply", tex: { size: 128, color: "#9a9a9a", rust: 0.6, seed: 8 } });
  g.restore();
}
// the facade, baked: riveted steel panels with soft AO in the seams, rust and soot streaks running down
// from every rivet, pipes with occlusion under them, porthole frames and glass, the hazard frame
const DX = 360, DY = 150, DW = 240, DHt = 300;
function facadePaint(g, W, H) {
  g.translate(480, 462);
  g.scale(0.7, 0.7);
  g.translate(-480, -462);
  for (let x = -200; x < W + 200; x += 120) {
    for (const [y0, hh] of [[40, 140], [180, 150], [330, 150]]) {
      K.texRect(g, "metal", x, y0, 120, hh, { scale: 90, ox: x * 1.7, oy: y0 * 0.6, tex: { size: 128, color: "#4e4e52", rust: 0.3, seed: 4 + (((x / 120) | 0) % 3 + 3) % 3 } });
      g.fillStyle = "rgba(0,0,0," + (hash(x, y0) * 0.22).toFixed(2) + ")";
      g.fillRect(x, y0, 120, hh);
      // seams: a soft occlusion either side of the joint, the joint itself dark, a lit lip below it
      const sg = g.createLinearGradient(x, 0, x + 8, 0);
      sg.addColorStop(0, "rgba(0,0,0,0.55)");
      sg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = sg;
      g.fillRect(x, y0, 8, hh);
      const tg = g.createLinearGradient(0, y0, 0, y0 + 9);
      tg.addColorStop(0, "rgba(0,0,0,0.6)");
      tg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = tg;
      g.fillRect(x, y0, 120, 9);
      g.fillStyle = "rgba(0,0,0,0.7)";
      g.fillRect(x, y0, 1.5, hh);
      g.fillRect(x, y0, 120, 1.5);
      g.fillStyle = "rgba(255,200,170,0.1)";
      g.fillRect(x + 2, y0 + hh - 2, 118, 1);
      for (const yy of [y0 + 8, y0 + hh - 8]) for (const xx of [x + 8, x + 112]) {
        // rust and soot washed down from the rivet by years of ash rain
        const h = hash(xx, yy);
        const len = 20 + h * 70;
        const rg = g.createLinearGradient(0, yy, 0, yy + len);
        rg.addColorStop(0, h < 0.5 ? "rgba(120,52,22,0.55)" : "rgba(14,10,8,0.5)");
        rg.addColorStop(1, "rgba(60,30,20,0)");
        g.fillStyle = rg;
        g.fillRect(xx - 1.5 - h, yy, 3 + h * 3, len);
        g.fillStyle = "rgba(0,0,0,0.45)"; g.beginPath(); g.arc(xx + 0.5, yy + 0.7, 2.2, 0, TAU); g.fill();
        g.fillStyle = "#8a8486"; g.beginPath(); g.arc(xx, yy, 1.8, 0, TAU); g.fill();
      }
    }
  }
  // overall grime, darker at the top (no sky light under the roof) and low down (splash-back)
  const gr = g.createLinearGradient(0, 40, 0, 480);
  gr.addColorStop(0, "rgba(6,3,2,0.7)");
  gr.addColorStop(0.45, "rgba(6,3,2,0.35)");
  gr.addColorStop(1, "rgba(6,3,2,0.5)");
  g.fillStyle = gr;
  g.fillRect(-200, 40, W + 400, 440);
  for (let i = 0; i < 60; i++) {
    const x = -200 + hash(i, 91) * (W + 400), y = 40 + hash(i, 92) * 240, len = 40 + hash(i, 95) * 160, w = 2 + hash(i, 93) * 8;
    const sg = g.createLinearGradient(0, y, 0, y + len);
    sg.addColorStop(0, "rgba(14,8,5,0.35)");
    sg.addColorStop(1, "rgba(14,8,5,0)");
    g.fillStyle = sg;
    g.fillRect(x, y, w, len);
  }
  K.texRect(g, "metal", -210, 26, W + 420, 14, { scale: 50, tex: { size: 128, color: "#4a4442", rust: 0.3, seed: 2 } });
  g.fillStyle = "rgba(255,190,150,0.18)";
  g.fillRect(-210, 26, W + 420, 1.5);
  const eave = g.createLinearGradient(0, 40, 0, 60);
  eave.addColorStop(0, "rgba(0,0,0,0.7)");
  eave.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = eave;
  g.fillRect(-210, 40, W + 420, 20);
  for (const [py, w] of [[70, 14], [92, 8]]) {
    // occlusion under each pipe on the wall
    const og = g.createLinearGradient(0, py + w / 2, 0, py + w / 2 + 12);
    og.addColorStop(0, "rgba(0,0,0,0.6)");
    og.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = og;
    g.fillRect(-200, py + w / 2, W + 400, 12);
    const pg = g.createLinearGradient(0, py - w / 2, 0, py + w / 2);
    pg.addColorStop(0, "#8a7a70");
    pg.addColorStop(0.3, "#5a504a");
    pg.addColorStop(0.8, "#1a1414");
    pg.addColorStop(1, "#3a2218");
    g.fillStyle = pg;
    g.fillRect(-200, py - w / 2, W + 400, w);
    for (let x = -180; x < W + 200; x += 150) {
      g.fillStyle = "#1e1a18";
      g.fillRect(x, py - w / 2 - 2, 6, w + 4);
    }
  }
  g.fillStyle = "#5a1410";
  g.beginPath(); g.arc(180, 70, 12, 0, TAU); g.fill();
  g.fillStyle = "rgba(255,200,180,0.3)";
  g.beginPath(); g.arc(176, 66, 4, 0, TAU); g.fill();
  g.fillStyle = "#1e1e20";
  g.beginPath(); g.arc(760, 140, 22, 0, TAU); g.fill();
  g.fillStyle = "#cfc8b4";
  g.beginPath(); g.arc(760, 140, 17, 0, TAU); g.fill();
  for (const wx of [210, 750]) {
    g.fillStyle = "rgba(0,0,0,0.6)";
    g.beginPath(); g.arc(wx + 2, 254, 44, 0, TAU); g.fill();
    g.fillStyle = "#2a2a2c";
    g.beginPath(); g.arc(wx, 250, 40, 0, TAU); g.fill();
    // the green glass, lit from inside, with the sky's reflection across its top
    const gg = g.createRadialGradient(wx - 8, 242, 4, wx, 250, 32);
    gg.addColorStop(0, "#c8ffd8");
    gg.addColorStop(0.45, "#5ae088");
    gg.addColorStop(1, "#14502a");
    g.fillStyle = gg;
    g.beginPath(); g.arc(wx, 250, 31, 0, TAU); g.fill();
    const rf = g.createLinearGradient(0, 219, 0, 250);
    rf.addColorStop(0, "rgba(255,170,120,0.35)");
    rf.addColorStop(1, "rgba(255,170,120,0)");
    g.fillStyle = rf;
    g.beginPath(); g.arc(wx, 250, 31, Math.PI, 0); g.fill();
    const fg = g.createLinearGradient(0, 210, 0, 290);
    fg.addColorStop(0, "rgba(255,220,190,0.3)");
    fg.addColorStop(0.5, "rgba(0,0,0,0)");
    fg.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = fg;
    g.beginPath(); g.arc(wx, 250, 40, 0, TAU); g.arc(wx, 250, 31, 0, TAU, true); g.fill();
  }
  hazard(g, DX - 26, DY - 26, DW + 52, 26, false);
  hazard(g, DX - 26, DY, 26, DHt, true);
  hazard(g, DX + DW, DY, 26, DHt, true);
  K.aoEdge(g, DX, DY, DX + DW, DY, { width: 10, alpha: 0.5, side: -1 });
  g.fillStyle = "#1a1210";
  g.fillRect(480 - 12, DY - 54, 24, 12);
  // the wall's foot: AO where it meets the apron
  const fa = g.createLinearGradient(0, 470, 0, 440);
  fa.addColorStop(0, "rgba(0,0,0,0.75)");
  fa.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = fa;
  g.fillRect(-200, 440, W + 400, 30);
}
// slight 3-point perspective: the wall recedes to the right (the camera stands left of centre) and
// its verticals converge upward (we look up a little). The door's own column stays undistorted so the
// live door panels drawn on top line up with the baked frame.
const EYE6 = 405, DZ6 = 104;
const rec6 = () => 1; // a frontal wall: no horizontal recession (it kinked the horizontals at the door column)
const con6 = (y) => 1 - 0.09 * clamp((EYE6 - y) / 400, -0.3, 1);
function warp6(x, y) {
  const y1 = EYE6 + (y - EYE6) * rec6(x);
  const d = x - 480, a = Math.abs(d);
  const x1 = a < DZ6 ? x : 480 + Math.sign(d) * (DZ6 + (a - DZ6) * con6(y1));
  return [x1, y1];
}
function facadeS(W, H) {
  return staged("f08facade7", [
    ...[0, 1, 2].map((b) => (st) => {
      const px = K.pixelScale();
      if (!st.flat) st.flat = K.makeCanvas(W * px, H * px);
      const g = st.flat.getContext("2d");
      g.save();
      g.setTransform(px, 0, 0, px, 0, 0);
      g.beginPath(); g.rect(0, (b * H) / 3, W, H / 3); g.clip();
      facadePaint(g, W, H);
      g.restore();
    }),
    (st) => {
      // (the wall is frontal: no horizontal recession pass, only the vertical keystone below)
      st.mid = st.flat;
    },
    (st) => {
      // pass 2: horizontal strips, each squeezed toward the centre (verticals converge upward)
      const px = K.pixelScale(), N = 90, sh = H / N;
      st.out = K.sprite("f08facade7", W, H, (g) => {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.imageSmoothingEnabled = true;
        const DL = 480 - DZ6, DR = 480 + DZ6;
        for (let i = 0; i < N; i++) {
          const y = i * sh, c = con6(y + sh / 2);
          // left wing, door column, right wing
          g.drawImage(st.mid, 0, y * px, DL * px, sh * px + 1, (DL - DL * c) * px, y * px, DL * c * px, sh * px + 1);
          g.drawImage(st.mid, DL * px, y * px, (DR - DL) * px, sh * px + 1, DL * px, y * px, (DR - DL) * px, sh * px + 1);
          g.drawImage(st.mid, DR * px, y * px, (W - DR) * px, sh * px + 1, DR * px, y * px, (W - DR) * c * px, sh * px + 1);
        }
      });
    },
  ]);
}
function facadeSprite(W, H) { return stagedGet(facadeS(W, H)); }
function flankSprite(W, H) {
  return K.sprite("f08flank8", W, H, (g) => {
    const flank = new Path2D();
    flank.moveTo(-40, H);
    flank.lineTo(-40, 210);
    for (let x = -40; x <= W + 40; x += 8) flank.lineTo(x, 210 - (x + 40) * 0.2 + fbm(x / 50, 14) * 22 + fbm(x / 13, 4) * 4);
    flank.lineTo(W + 40, H);
    flank.closePath();
    K.texFill(g, "lavarock", flank, { scale: 150, tex: { size: 128, seed: 31 } });
    g.fillStyle = "rgba(8,3,2,0.62)";
    g.fill(flank);
    // the sky grazing the ridge from behind: a soft band just under the crest, not an outline
    g.save();
    g.clip(flank);
    const gb = g.createLinearGradient(0, 0, 0, 230);
    gb.addColorStop(0, "rgba(160,70,40,0.35)");
    gb.addColorStop(1, "rgba(160,70,40,0)");
    g.fillStyle = gb;
    g.fillRect(-40, 0, W + 80, 230);
    g.restore();
  });
}
// the rock buttresses either side: per-pixel lit basalt, lava light from below, no outline
const BUT6 = {
  L: { x0: 0, y0: 160, w: 200, h: 380, side: -1, seed: 33, dip: 0.1, band: 18, lavaY: 520, fall: 230, sky: 0.16,
    edge: (y) => 150 - (fbm(y / 40, 20) * 26 + fbm(y / 10, 4) * 5 + (470 - y) * 0.12), top: (x) => 170 + (150 - x) * 0.05 },
  R: { x0: 780, y0: 110, w: 180, h: 430, side: 1, seed: 35, dip: -0.1, band: 18, lavaY: 520, fall: 230, sky: 0.16,
    edge: (y) => 810 + (fbm(y / 40, 22) * 26 + fbm(y / 10, 5) * 5 + (470 - y) * 0.12), top: (x) => 120 + (x - 810) * 0.05 },
};
const butB = (k) => { const o = BUT6[k]; return rockWallB("f08butt8" + k, o.w, o.h, o); };
function buttressSprite(W, H) {
  return K.sprite("f08butt8", W, H, (g) => {
    for (const k of ["L", "R"]) { const o = BUT6[k]; g.drawImage(baked(butB(k)), o.x0, o.y0, o.w, o.h); }
  });
}
// the concrete apron in front of the door: wet and grimy, mirroring the lights
function apronSprite(W, H) {
  return K.sprite("f08apron1", W, H - 440, (g) => {
    g.translate(0, -440);
    K.groundPlane(g, W, H, { tex: "asphalt", texOpts: { seed: 6, size: 128, color: "#5a5654" }, horizon: EYE6, y0: 452, scale: 520, wet: 0.7, puddles: 0.45, sky: "#3a1a10", fog: "#2a1810", fogAmt: 0.4, tint: "#7a5a4a", tintAlpha: 0.35, cache: false });
    K.aoEdge(g, -40, 452, W + 40, 452, { width: 22, alpha: 0.7, side: -1 });
  });
}
function grateSprite(W, H) { return apronSprite(W, H); }
function steam(g, x, y, t, t0, dir, k) {
  if (t < t0) return;
  for (let i = 0; i < 12; i++) {
    const age = ((t - t0) * 0.9 + hash(i, 3)) % 1.4;
    const a = (1 - age / 1.4) * k * clamp(age * 6);
    const px = x + dir * age * (60 + hash(i, 4) * 90), py = y - age * (30 + hash(i, 5) * 50) + (hash(i, 6) - 0.5) * 40;
    puff(g, px, py, 18 + age * 60, i + age * 0.6, i, "#c8d2cc", 0.5 * a);
    puff(g, px, py, 14 + age * 40, i * 2, i + 1, "#5aff88", 0.12 * a, "lighter");
  }
}
// what is visible through the open door: an emissive lab (glass tubes of green light), consoles, a
// hanging arm, all in a green haze; brightest at the tubes, not a blank white rectangle
function labInterior(g, dx, dy, dw, dh, t) {
  const inner = g.createLinearGradient(0, dy, 0, dy + dh);
  inner.addColorStop(0, "#3a7a52");
  inner.addColorStop(0.6, "#2a6a44");
  inner.addColorStop(1, "#123a22");
  g.fillStyle = inner;
  g.fillRect(dx, dy, dw, dh);
  // back wall panels and floor line, in perspective
  g.fillStyle = "rgba(10,30,18,0.4)";
  g.fillRect(dx, dy + dh * 0.74, dw, dh * 0.26);
  g.strokeStyle = "rgba(10,30,18,0.4)";
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 1; i < 5; i++) { g.moveTo(dx + dw * i / 5, dy); g.lineTo(dx + dw * i / 5, dy + dh * 0.74); }
  g.stroke();
  for (let i = 0; i < 3; i++) {
    const tx = dx + dw * (0.2 + i * 0.3), tw = 34, ty = dy + dh * 0.16, th = dh * 0.58;
    g.fillStyle = "#16261c";
    g.fillRect(tx - tw / 2 - 4, ty - 10, tw + 8, 10);
    g.fillRect(tx - tw / 2 - 4, ty + th, tw + 8, 14);
    const tg = g.createLinearGradient(tx - tw / 2, 0, tx + tw / 2, 0);
    tg.addColorStop(0, "rgba(80,200,120,0.9)");
    tg.addColorStop(0.28, "rgba(235,255,240,1)");
    tg.addColorStop(0.5, "rgba(140,255,180,0.95)");
    tg.addColorStop(1, "rgba(40,130,70,0.9)");
    g.fillStyle = tg;
    g.fillRect(tx - tw / 2, ty, tw, th);
    for (let b = 0; b < 6; b++) {
      const by = ty + th - ((t * (30 + b * 7) + hash(b, i) * th) % th);
      g.fillStyle = "rgba(255,255,255,0.7)";
      g.beginPath(); g.arc(tx - 8 + hash(b, i + 3) * 16, by, 1.4 + hash(b, i + 5) * 1.4, 0, TAU); g.fill();
    }
    glow(g, tx, ty + th * 0.5, 70, GREEN, 0.25);
  }
  g.fillStyle = "rgba(6,18,10,0.9)";
  g.fillRect(dx, dy + dh * 0.8, dw * 0.34, dh * 0.2);
  g.fillRect(dx + dw * 0.7, dy + dh * 0.76, dw * 0.3, dh * 0.24);
  g.fillStyle = "#ffcf40";
  g.fillRect(dx + 12, dy + dh * 0.82, 4, 3);
  g.fillStyle = "#ff4030";
  g.fillRect(dx + dw * 0.76, dy + dh * 0.79, 3, 3);
  g.strokeStyle = "rgba(6,18,10,0.9)";
  g.lineCap = "round";
  g.lineWidth = 6;
  const sw = Math.sin(t * 0.7) * 0.2;
  g.beginPath();
  g.moveTo(dx + dw * 0.62, dy);
  g.lineTo(dx + dw * 0.62, dy + dh * 0.16);
  g.lineTo(dx + dw * (0.5 + sw * 0.2), dy + dh * 0.32);
  g.lineTo(dx + dw * (0.46 + sw * 0.2), dy + dh * 0.4);
  g.stroke();
}
function shot6(g, t, W, H) {
  const p = eio(seg(t, 52, 62));
  const open = eio(seg(t, 55, 58.2));
  const sil = smooth(seg(t, 55.6, 56.6));
  K.withCamera(g, W, H, { x: 480, y: 270 - p * 6, zoom: 1.0 + p * 0.06, shakeT: t, shakeAmt: 1 + (t > 55 && t < 56 ? 2 : 0) }, () => {
    ashSky(g, W, H, "A", 30);
    g.drawImage(flankSprite(W, H), 0, 0, W, H);
    g.drawImage(facadeSprite(W, H), 0, 0, W, H);
    // the wall is lit only by what is near it: falls off toward its ends and its roofline
    {
      const eg = g.createLinearGradient(0, 0, W, 0);
      eg.addColorStop(0, "rgba(0,0,0,0.62)");
      eg.addColorStop(0.3, "rgba(0,0,0,0.12)");
      eg.addColorStop(0.5, "rgba(0,0,0,0)");
      eg.addColorStop(0.7, "rgba(0,0,0,0.12)");
      eg.addColorStop(1, "rgba(0,0,0,0.62)");
      g.fillStyle = eg;
      g.fillRect(0, 100, W, 370);
      const tg = g.createLinearGradient(0, 100, 0, 300);
      tg.addColorStop(0, "rgba(0,0,0,0.45)");
      tg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = tg;
      g.fillRect(0, 100, W, 200);
    }
    // live lights on the (warped) wall: lava glow from below, the portholes, the gauge needle
    g.save();
    g.globalCompositeOperation = "lighter";
    const lg = g.createLinearGradient(0, 470, 0, 260);
    lg.addColorStop(0, "rgba(255,100,40,0.22)");
    lg.addColorStop(1, "rgba(255,100,40,0)");
    g.fillStyle = lg;
    g.fillRect(-40, 260, W + 80, 210);
    g.restore();
    const S = (x, y) => warp6(480 + (x - 480) * 0.7, 462 + (y - 462) * 0.7);
    for (const wx of [210, 750]) { const [px, py] = S(wx, 250); glow(g, px, py, 80, GREEN, 0.2 + 0.03 * Math.sin(t * 2 + wx)); }
    {
      const [gx, gy] = S(760, 140);
      const na = -0.6 + Math.sin(t * 2) * 0.2 + noise(t * 8, 3) * 0.05;
      g.strokeStyle = "#8a1a10";
      g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + Math.cos(na) * 9.5, gy + Math.sin(na) * 9.5); g.stroke();
    }
    g.save();
    g.translate(480, 462);
    g.scale(0.7, 0.7);
    g.translate(-480, -462);
    K.lightPool(g, DX + DW / 2, DY + DHt * 0.6, 420, GREEN, { intensity: 0.4 * open, flat: 0.9 });
    labInterior(g, DX, DY, DW, DHt, t);
    glow(g, DX + DW / 2, DY + DHt * 0.5, 380 * open + 10, GREEN, 0.35 * open);
    const half = DW / 2, slide = open * (half - 6);
    for (const sd of [-1, 1]) {
      const hx = sd < 0 ? DX - slide : DX + half + slide;
      g.save();
      g.beginPath();
      g.rect(DX, DY, DW, DHt);
      g.clip();
      K.texRect(g, "metal", hx, DY, half, DHt, { scale: 80, ox: hx, tex: { size: 128, color: "#45474c", rust: 0.15, seed: 9 } });
      const sg = g.createLinearGradient(hx, 0, hx + half, 0);
      sg.addColorStop(0, sd < 0 ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.45)");
      sg.addColorStop(0.5, "rgba(255,255,255,0.04)");
      sg.addColorStop(1, sd < 0 ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.1)");
      g.fillStyle = sg;
      g.fillRect(hx, DY, half, DHt);
      const vg = g.createLinearGradient(0, DY, 0, DY + DHt);
      vg.addColorStop(0, "rgba(0,0,0,0.3)");
      vg.addColorStop(0.7, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(255,90,30,0.18)");
      g.fillStyle = vg;
      g.fillRect(hx, DY, half, DHt);
      for (let k = 1; k < 4; k++) {
        const yy = DY + (k * DHt) / 4;
        const ag = g.createLinearGradient(0, yy - 4, 0, yy + 3);
        ag.addColorStop(0, "rgba(0,0,0,0)");
        ag.addColorStop(0.6, "rgba(0,0,0,0.6)");
        ag.addColorStop(1, "rgba(255,230,200,0.1)");
        g.fillStyle = ag;
        g.fillRect(hx + 10, yy - 4, half - 20, 7);
      }
      g.fillStyle = rgba("#9affb8", 0.5 * clamp(open * 4));
      g.fillRect(sd < 0 ? hx + half - 2 : hx, DY, 2, DHt);
      g.restore();
    }
    K.lightPool(g, 480, DY + 10, 240, "#ffb070", { intensity: 0.2, flat: 1.2 });
    const seam = smooth(seg(t, 53.8, 55));
    if (open < 0.98) {
      g.fillStyle = rgba("#d8ffe4", seam * (1 - open));
      g.fillRect(DX + half - 1 - slide, DY, 2 + slide * 2, DHt);
      glow(g, DX + half, DY + DHt / 2, 60 + seam * 40, GREEN, 0.4 * seam);
    }
    const bx = DX + DW / 2, by = DY - 48;
    const sweep = Math.PI / 2 + Math.sin(t * 1.8) * 0.85;
    K.volumetricBeam(g, bx, by, sweep, 520, 0.22, { t, color: "#ffa040", intensity: 0.3 });
    glow(g, bx, by, 26, "#ffa040", 0.9);
    glow(g, bx, by, 6, "#fff0c0", 1);
    g.restore();
    g.drawImage(buttressSprite(W, H), 0, 0, W, H);
    g.drawImage(apronSprite(W, H), 0, 440, W, H - 440);
    // reflections in the wet apron: the beacon, the portholes, then the open door
    const [bxs, bys] = S(bx, by);
    K.reflectStreak(g, bxs, 460, 60, "#ffa040", 0.35, { t, width: 10 });
    for (const wx of [210, 750]) { const [px] = S(wx, 250); K.reflectStreak(g, px, 458, 70, "#5aff88", 0.3, { t, width: 16 }); }
    // the door's light thrown onto the apron: a green trapezoid widening toward us, your shadow cut out
    const ddx = 480 - 84, ddw = 168, ky = 474;
    if (open > 0.02) {
      g.save();
      g.globalCompositeOperation = "lighter";
      const sp = g.createLinearGradient(0, 452, 0, H + 40);
      sp.addColorStop(0, rgba(GREEN, 0.5 * open));
      sp.addColorStop(0.5, rgba(GREEN, 0.2 * open));
      sp.addColorStop(1, rgba(GREEN, 0.05 * open));
      g.fillStyle = sp;
      // three nested trapezoids = a penumbra: the spill has soft edges, not a hard cut
      for (const [wd, a] of [[0, 0.5], [40, 0.3], [90, 0.2]]) {
        g.globalAlpha = a;
        g.beginPath();
        g.moveTo(ddx + 4 - wd * 0.15, 452); g.lineTo(ddx + ddw - 4 + wd * 0.15, 452); g.lineTo(ddx + ddw + 230 + wd, H + 40); g.lineTo(ddx - 230 - wd, H + 40);
        g.closePath();
        g.fill();
      }
      g.globalAlpha = 1;
      K.lightPool(g, 480, 470, 260, GREEN, { intensity: 0.35 * open, flat: 0.25 });
      // and on the wall either side of the frame
      K.lightPool(g, 480, 300, 330, GREEN, { intensity: 0.18 * open, flat: 1 });
      K.reflectStreak(g, 480, 456, 90, "#7aff9a", 0.5 * open, { t, width: 60 });
      g.restore();
      g.save();
      g.globalAlpha = 0.85 * open;
      const shg = g.createLinearGradient(0, ky, 0, H + 20);
      shg.addColorStop(0, "rgba(2,4,3,1)");
      shg.addColorStop(1, "rgba(2,4,3,0.25)");
      g.fillStyle = shg;
      g.beginPath();
      g.moveTo(468, ky); g.lineTo(492, ky); g.lineTo(552, H + 20); g.lineTo(408, H + 20);
      g.closePath();
      g.fill();
      g.restore();
    }
    K.fog(g, W, H, { y: 470, h: 70, color: "#6a3424", alpha: 0.3, t, seed: 8 });
    const k = 1 - seg(t, 58.5, 61);
    steam(g, ddx + 4, 440, t, 55, -1, k);
    steam(g, ddx + ddw - 4, 432, t, 55.1, 1, k);
    steam(g, 480, 260, t, 55.2, 0.3, 0.7 * k);
    // green god-rays through the steam, fanning out of the doorway toward us
    if (open > 0.05) K.godRays(g, 480, 340, W, H, { color: "#8affa8", count: 11, strength: 0.32 * open * (0.6 + 0.4 * k), t, angle: Math.PI / 2, spread: 2.4, length: 520, seed: 6 });
    K.shadowBlob(g, 480, ky + 1, 24, 4, { alpha: 0.85 });
    const dark = (c) => mix(c, "#0a0c0a", sil * 0.6);
    const gl = open > 0.2;
    litPerson(g, 480, ky, 150, {
      view: "back", t, bell: true, wet: 0, hood: true,
      coat: dark("#e8b923"), pants: dark("#3a4a6a"), boots: dark("#8a2a20"), hair: dark("#4a3020"),
      light: { x: 480, y: 280, color: gl ? "#9affb8" : "#ff9a5a", strength: 0.9 + open * 1.1, z: gl ? -0.85 : 0.3 },
      ambient: gl ? "#0a120c" : "#2a140c",
    }, {
      folds: true,
      under: { x: 56, y: 190, r: 120, color: "#ff7a30", alpha: 0.35 * (1 - open * 0.7) },
      top: { color: "#141a22", alpha: 0.35 },
      // back-lit by the doorway: green light wraps every edge of the silhouette, strongest on the hood
      rims: open > 0.05 ? [
        { dx: 0, dy: 2.4, color: "#9affb8", alpha: 0.9 * open },
        { dx: 2, dy: 0, color: "#7aff9a", alpha: 0.7 * open },
        { dx: -2, dy: 0, color: "#7aff9a", alpha: 0.7 * open },
        { dx: 0, dy: 5, color: "#5aff88", alpha: 0.3 * open },
      ] : [],
    });
  });
  ash(g, W, H, t, { count: 60, wind: 10, seed: 17 });
  embers(g, W, H, t, { count: 12, seed: 51, area: [0, 300, W, 240] });
}

// ---- assembly --------------------------------------------------------------------------------------------
const SHOTS = [[0, 10, shot1], [10, 20, shot2], [20, 30, shot3], [30, 42, shot4], [42, 52, shot5], [52, 62, shot6]];
const XF = { 20: 0.7, 30: 0.9, 52: 0.8 }; // cross-dissolve lengths into these shots (cuts elsewhere)
const T0 = 1.5; // black hold at the open while shot 1's bakes are built
// cache warming: every bake is split into slices of roughly 30 ms or less (row bands of the per-pixel
// rasters, stages of the vector sprites, single kit textures) and the next shot's slices are spread
// evenly over the 6 s before it, one slice per slot. Each slice is a no-op once built, so draw stays
// a pure function of t; jumping straight to a time just builds whatever is missing.
const tex = (name, o) => () => K.texture(name, o);
let SCR = null;
const scratch = () => (SCR || (SCR = K.makeCanvas(1, 1).getContext("2d")));
let WARMS = null;
function warmLists(W, H) {
  if (WARMS) return WARMS;
  const plate = (i) => () => xfPlate(i, W, H);
  WARMS = {
    0: [
      ...steps(() => skyB("A")), ...[0, 1, 2, 3].map((j) => () => gtabStep(j)), ...steps(() => volcanoRockB()), ...steps(() => moltenB("flow")),
      () => flowGeo(), () => plumeTile(), () => plumeEnv(), () => puffTex(0), () => puffTex(1),
      tex("lavarock", { size: 128, color: "#5a4a44", seed: 5 }), tex("lavarock", { size: 128, color: "#4a3a34", seed: 5 }),
      tex("lavarock", { size: 128, color: "#5a4a44", seed: 7 }), tex("metal", { size: 128, color: "#56585c", rust: 0.4, seed: 3 }),
      tex("lavarock", { seed: 5, color: "#4a2216" }), tex("lavarock", { seed: 4, size: 128, color: "#6a5650" }), tex("lavarock", { size: 128, seed: 9 }),
      () => volcanoBase(), () => labSprite(), () => volcanoSprite(), () => fgRocks(),
      () => K.hills(scratch(), W + 260, H, { y: H * 0.79, amp: 34, color: "#4a2216", seed: 3, haze: "#c8683a", hazeAmt: 0.62, freq: 1.4, tex: "lavarock" }),
    ],
    1: [
      ...steps(() => moltenB("lake")), ...steps(() => moltenB("fis")), ...steps(() => lakeModB()),
      tex("sand", { size: 128, color: "#6a5c56", ripples: 0, seed: 5 }), tex("lavarock", { seed: 6, size: 128, color: "#6a5650" }), (W2, H2) => shot2ground(W, H),
      tex("lavarock", { size: 128, seed: 2 }), tex("lavarock", { size: 128, seed: 3 }), tex("lavarock", { size: 128, seed: 4 }),
      () => puffTex(2), () => puffTex(3),
    ],
    2: [...steps(() => wallB("L")), ...steps(() => wallB("R")), tex("lavarock", { size: 128, seed: 7, color: "#5a4038" }), () => farBasin(W, H), tex("wood", { size: 128, seed: 4, color: "#5a3c26" }), plate(1)],
    3: [...steps(() => skyB("B")), tex("lavarock", { size: 128, seed: 12 }), () => faceSprite(W, H), tex("lavarock", { seed: 7, color: "#3a160e" }),
      () => K.hills(scratch(), W, H, { y: H * 0.9, amp: 46, color: "#3a160e", seed: 5, haze: "#d0703c", hazeAmt: 0.55, tex: "lavarock" }), plate(2)],
    4: [tex("lavarock", { seed: 11, color: "#4a2016" }), tex("lavarock", { size: 128, seed: 21 }), tex("metal", { size: 128, color: "#6a6c70", rust: 0.3, seed: 3 }), ...stageSteps(() => bg5S(W, H)), ...steps(() => rockBakeB()), ...steps(() => catCrackB()), () => catSprite(42, 0), () => catSprite(42, 1)],
    5: [
      tex("metal", { size: 128, color: "#9a9a9a", rust: 0.6, seed: 8 }), tex("metal", { size: 128, color: "#4a4442", rust: 0.3, seed: 2 }),
      tex("metal", { size: 128, color: "#4e4e52", rust: 0.3, seed: 4 }), tex("metal", { size: 128, color: "#4e4e52", rust: 0.3, seed: 5 }), tex("metal", { size: 128, color: "#4e4e52", rust: 0.3, seed: 6 }),
      ...stageSteps(() => facadeS(W, H)), ...steps(() => butB("L")), ...steps(() => butB("R")), () => buttressSprite(W, H),
      tex("lavarock", { size: 128, seed: 31 }), () => flankSprite(W, H), tex("asphalt", { seed: 6, size: 128, color: "#5a5654" }), () => apronSprite(W, H),
      tex("metal", { size: 128, color: "#45474c", rust: 0.15, seed: 9 }), plate(4),
    ],
  };
  return WARMS;
}
function warm(t, i, W, H) {
  const lists = warmLists(W, H);
  let list, t0, t1;
  if (t < T0) { list = lists[0]; t0 = 0; t1 = T0 * 0.9; }
  else {
    list = lists[i + 1];
    if (!list) return;
    const start = SHOTS[i][1] - (XF[SHOTS[i][1]] || 0);
    t1 = start - 0.15;
    t0 = Math.max(SHOTS[i][0] + 0.3, start - 6.5);
  }
  if (t < t0) return;
  const slot = (t1 - t0) / list.length;
  const k = Math.floor((t - t0) / slot);
  for (let j = 0; j <= Math.min(k, list.length - 1); j++) list[j](W, H);
}
// a dissolve: the outgoing shot frozen at the dissolve's first frame (baked once, a sprite) fades out
// over the live incoming shot, so a dissolve frame costs one shot, not two
function xfPlate(i, W, H) {
  const d = XF[SHOTS[i][1]];
  if (!d) return null;
  const tA = SHOTS[i][1] - d;
  return K.sprite("f08xfA:" + i, W, H, (s) => SHOTS[i][2](s, tA, W, H));
}
function frame(g, t, W, H) {
  let i = 0;
  while (i < SHOTS.length - 1 && t >= SHOTS[i][1]) i++;
  warm(t, i, W, H);
  const nx = SHOTS[i + 1];
  const d = nx && XF[nx[0]];
  if (t < T0) {
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
  } else if (d && t > nx[0] - d) {
    const a = smooth((t - (nx[0] - d)) / d);
    nx[2](g, t, W, H);
    const plate = xfPlate(i, W, H);
    g.save();
    g.globalAlpha = 1 - a;
    g.drawImage(plate, 0, 0, W, H);
    g.restore();
  } else SHOTS[i][2](g, t, W, H);
  if (t < 10) {
    const ta = K.env(t, 2.0, 6.0, 1.5, 1.0);
    if (ta > 0) {
      g.save();
      g.globalAlpha = ta * 0.5;
      g.translate(250, H * 0.22);
      g.scale(1, 0.42);
      glow(g, 0, 0, 300, "#120604", 1, "source-over");
      g.restore();
      g.save();
      g.translate(-230, 0);
      K.title(g, W, H, "The Mountain of Fire", "Chapter 8", ta, { size: 42, y: H * 0.22, glow: "#ffb070" });
      g.restore();
    }
    if (t >= T0) K.fadeBlack(g, W, H, 1 - smooth(seg(t, T0, 2.7)));
  }
  if (t > 60.4) K.fadeBlack(g, W, H, smooth(seg(t, 60.4, 62)));
  K.letterbox(g, W, H);
}

export const film = {
  id: 8,
  title: "The Mountain of Fire",
  chapter: "Chapter 8",
  unlockAt: 40,
  duration: D,
  poster: 47,
  tagline: "Up through the ash.",
  subs: [
    [3.0, 7.0, "Mount Hairball. A mountain made of fire."],
    [11.5, 15.5, "Every step was hotter than the last."],
    [22.0, 26.5, "You did not look down. Okay. You looked down once."],
    [32.0, 36.5, "Your hands hurt. You kept climbing."],
    [37.0, 40.5, "He came this way. So could you."],
    [43.5, 48.0, "A lava cat. Sunbathing. On lava."],
    [48.5, 51.5, "It pointed at the lab with its tail."],
    [54.0, 60.0, "Whatever was inside, it knew his name."],
  ],
  voice: [
    [3.0, "Mount Hairball. A mountain made of fire.", { rate: 0.92, pitch: 1.0 }],
    [11.5, "Every step was hotter than the last.", { rate: 0.92, pitch: 1.0 }],
    [22.0, "You did not look down. Okay. You looked down once.", { rate: 1.0, pitch: 1.08 }],
    [32.0, "Your hands hurt. You kept climbing.", { rate: 0.92, pitch: 1.0 }],
    [37.0, "He came this way. So could you.", { rate: 0.92, pitch: 1.0 }],
    [43.5, "A lava cat. Sunbathing. On lava.", { rate: 1.0, pitch: 1.1 }],
    [48.5, "It pointed at the lab with its tail.", { rate: 0.92, pitch: 1.0 }],
    [54.0, "Whatever was inside, it knew his name.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: { mood: "epic", key: "D", bpm: 92, cues: [[2, "swell"], [16, "hit"], [30, "swell"], [42, "hit"], [55, "swell"]] },
  // the lens: warm volcanic night, hot lava highlights blooming with red halation
  grade: { exposure: 0.92, temp: 0.12, sat: 0.96, contrast: 1.08, lift: [0.012, 0.006, 0.004], gamma: [1, 1, 1.02], halation: 0.55, bloom: 0.42, threshold: 0.9, streak: 0.04, grain: 0.055, vignette: 0.48 },
  gradeAt(t) {
    if (t < 30) return {};
    if (t < 42) return { contrast: 1.14, exposure: 0.95, halation: 0.6 }; // backlit silhouette: harder
    if (t < 52) return { exposure: 0.86, sat: 1.12, temp: 0.16 };
    const o = smooth(seg(t, 55, 58.5));
    return { temp: lerp(0.12, 0.0, o), tint: 0.06 * o, bloom: 0.42 + 0.1 * o };
  },
  draw(g, t, W, H) {
    t = clamp(t, 0, D);
    const sx = W / 960, sy = H / 540;
    g.save();
    if (sx !== 1 || sy !== 1) g.scale(sx, sy);
    try { frame(g, t, 960, 540); } finally { g.restore(); }
  },
};
