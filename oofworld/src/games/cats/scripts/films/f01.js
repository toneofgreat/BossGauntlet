// films/f01.js - Chapter 1: "The Plaza of Lost Cats" (FILMS.md f01). 60 s, hopeful sunrise.
// You wake in the Cat Plaza at sunrise among lost cats, tie Biscuit's bell to your wrist, notice the
// sandstone statue gazing toward the Cozy Meadow portal, and follow his still-warm pawprints through
// the dew - past a very round cat who is, sadly, not him.
//
// Photographic pass (REALISM.md): one motivated key per shot (the low sunrise sun), textured
// materials everywhere (cobbles, sandstone, granite, plaster, shingle, turf, soil, brass), long soft
// sun shadows + contact occlusion, atmospheric haze with distance, volumetric clouds, real lens
// behaviour from the GPU lens (film.grade / gradeAt). Static sets are baked once into supersampled
// sprites (keys never contain t); per frame only water, jets, grass, cats, people and air move.
// draw(g, t, W, H) is a pure function of t.
import * as K from "../filmkit.js";
import { stoneify, STATUE_COAT, ZONE_GLOW, q, W0 as W, H0 as H } from "./lib012.js";

// ================================================================================================
// shared helpers
// ================================================================================================
const SS = 1.5; // supersampling of the cached sets the cameras push into
// hiSprite(key, w, h, paint) - a cached sprite painted at SS x resolution (drawn back at w x h)
function hiSprite(key, w, h, paint, ss = SS) {
  return TSPR(key, w * ss, h * ss, (s) => { s.scale(ss, ss); paint(s); });
}
// clip-and-shade: run fn inside path
function inside(g, path, fn) { g.save(); g.clip(path); fn(g); g.restore(); }
function lin(g, x0, y0, x1, y1, stops) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}
function ellPath(cx, cy, rx, ry, a0 = 0, a1 = K.TAU, p = new Path2D()) { p.ellipse(cx, cy, rx, ry, 0, a0, a1); return p; }
// a soft offscreen blur for cache builders only (never per frame)
function blurInto(dst, src, px, dx = 0, dy = 0, w = null, h = null) {
  dst.save();
  dst.filter = `blur(${K.qblur(px)}px)`;
  if (w == null) dst.drawImage(src, dx, dy); else dst.drawImage(src, dx, dy, w, h);
  dst.restore();
}
function TSPR(key, w, h, paint) { return K.sprite(key, w, h, paint); }
// Fast value noise for the bake-time per-pixel passes (stone, clouds, ridges, canopies): a 256x256
// table with smoothstep interpolation - ~50x cheaper than texFbm, plenty for these uses.
const NT = (() => { const a = new Float32Array(65536), R = K.rng("f01-noise"); for (let i = 0; i < 65536; i++) a[i] = R() * 2 - 1; return a; })();
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const x0 = xi & 255, y0 = (yi & 255) << 8, x1 = (x0 + 1) & 255, y1 = ((yi + 1) & 255) << 8;
  const a = NT[y0 + x0], b = NT[y0 + x1], c = NT[y1 + x0], d = NT[y1 + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm2(x, y, seed = 0, oct = 4) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  const ox = seed * 17.31, oy = seed * 9.77;
  for (let o = 0; o < oct; o++) { sum += amp * vn(x * f + ox + o * 31.7, y * f + oy - o * 23.3); norm += amp; amp *= 0.5; f *= 2.03; }
  return (sum / norm) * 1.4;
}
function ridged2(x, y, seed = 0, oct = 4) {
  let sum = 0, amp = 0.5, f = 1, norm = 0, w = 1;
  const ox = seed * 13.1, oy = seed * 7.3;
  for (let o = 0; o < oct; o++) { let n = 1 - Math.abs(vn(x * f + ox + o * 31.7, y * f + oy - o * 23.3)); n *= n * w; w = K.clamp(n * 2); sum += n * amp; norm += amp; amp *= 0.5; f *= 2.03; }
  return sum / norm;
}
// specular glints as tiny near-white points: the lens turns them into real highlights
function glints(g, t, pts, o = {}) {
  g.save();
  g.globalCompositeOperation = "lighter";
  const spr = K.glowSprite(o.color || "#fff6e0");
  for (let i = 0; i < pts.length; i++) {
    const [x, y, s, ph] = pts[i];
    const tw = Math.pow(Math.max(0, Math.sin(t * (o.speed || 2.3) + ph)), 6);
    if (tw < 0.02) continue;
    g.globalAlpha = tw * (o.alpha || 1);
    g.drawImage(spr, x - s * 2.5, y - s * 2.5, s * 5, s * 5);
    g.fillStyle = "#ffffff";
    g.fillRect(x - s * 0.35, y - s * 0.35, s * 0.7, s * 0.7);
  }
  g.restore();
}

// formLight(cv, rb, o) - bake-time volume pass on an already painted sprite canvas: its blurred alpha
// is a height field (an "inflated" form); the normal from its gradient is lit by a directional light.
// Front-facing areas keep their value, slopes toward the light brighten, slopes away fall into the
// fill colour, and (o.sss) thin edges toward a light BEHIND the subject glow with a subsurface tint.
// o: {lx, ly, lz, k (form contrast), fill:[r,g,b], sss:[r,g,b], sssK}
function formLight(cv, rb, o = {}) {
  const w = cv.width, h = cv.height, c = cv.getContext("2d");
  const img = c.getImageData(0, 0, w, h), P = img.data;
  const A = new Float32Array(w * h), T = new Float32Array(w * h);
  for (let i = 0; i < A.length; i++) A[i] = P[i * 4 + 3] / 255;
  const runBox = (src, dst, horiz) => {
    const n = horiz ? w : h, m = horiz ? h : w, st = horiz ? 1 : w, ls = horiz ? w : 1;
    for (let j = 0; j < m; j++) {
      const base = j * ls;
      let s = 0;
      for (let k = -rb; k <= rb; k++) s += src[base + Math.min(n - 1, Math.max(0, k)) * st];
      for (let i = 0; i < n; i++) {
        dst[base + i * st] = s / (2 * rb + 1);
        s += src[base + Math.min(n - 1, i + rb + 1) * st] - src[base + Math.max(0, i - rb) * st];
      }
    }
  };
  const HF = new Float32Array(w * h);
  HF.set(A);
  runBox(HF, T, true); runBox(T, HF, false); runBox(HF, T, true); runBox(T, HF, false);
  let Lx = o.lx == null ? -0.6 : o.lx, Ly = o.ly == null ? -0.6 : o.ly, Lz = o.lz == null ? 0.5 : o.lz;
  { const l = Math.hypot(Lx, Ly, Lz); Lx /= l; Ly /= l; Lz /= l; }
  const K2 = rb * 2.2, kk = o.k == null ? 0.8 : o.k, F = o.fill || [30, 34, 60], S = o.sss, sk = o.sssK || 0;
  const base = 0.38 + kk * Math.max(0, Lz);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const k = y * w + x, i = k * 4;
    if (P[i + 3] < 4) continue;
    const nx = (HF[k - 1] - HF[k + 1]) * K2, ny = (HF[k - w] - HF[k + w]) * K2, nl = Math.hypot(nx, ny, 1);
    const ndl = (nx * Lx + ny * Ly + Lz) / nl;
    const f = (0.38 + kk * Math.max(0, ndl)) / base;
    let r = P[i] * f, g = P[i + 1] * f, b = P[i + 2] * f;
    const sh = K.clamp(1 - f) * 0.35; // the turned-away side picks up the fill's colour
    r = K.lerp(r, F[0], sh); g = K.lerp(g, F[1], sh); b = K.lerp(b, F[2], sh);
    if (S && sk) {
      // light from behind: edges (steep normals) facing the light's screen direction transmit it
      const edge = 1 - 1 / nl, toward = K.clamp((nx * Lx + ny * Ly) / (Math.hypot(nx, ny) || 1) * 0.5 + 0.5);
      const a = K.clamp(edge * 1.6) * toward * sk;
      r = K.lerp(r, S[0], a); g = K.lerp(g, S[1], a); b = K.lerp(b, S[2], a);
    }
    P[i] = Math.min(255, r); P[i + 1] = Math.min(255, g); P[i + 2] = Math.min(255, b);
  }
  c.putImageData(img, 0, 0);
}

// ================================================================================================
// THE CAT PLAZA AT SUNRISE
// ================================================================================================
const HZ = 318;                 // plaza horizon
const FX = 480, FY = 420;       // fountain centre
const SUN = { x: 92, y: 266 };  // the sun just clearing the rooftops on the left
const SUNC = "#ffc98c";
const HAZE = "#efd3bf";         // warm morning haze at the horizon
const GHAZE = "#dcc2ae";        // haze over the far cobbles
const SKYFILL = "#5f7398";      // cool skylight in the shadows

// the sky, per frame (one gradient + the sun): hz = horizon y in the current space
function plazaSky(g, hz, t, o = {}) {
  const top = hz - (o.tall ? 1750 : 1150);
  g.fillStyle = o.tall ? "#2a4c84" : "#1f467f";
  g.fillRect(-400, top - 1600, W + 800, 1601);
  g.fillStyle = lin(g, 0, top, 0, hz + 2, [[0, o.tall ? "#2a4c84" : "#1f467f"], [o.tall ? 0.45 : 0.32, "#3d6aa6"], [0.58, "#7698c2"], [0.76, "#a8b2c4"], [0.88, "#d2bcb4"], [0.96, "#e2c2aa"], [1, "#e8c8ac"]]);
  g.fillRect(-400, top, W + 800, hz - top + 60);
  const sy = SUN.y + (hz - HZ);
  // Mie forward scatter around the low sun, warming the whole lower sky on that side
  g.save();
  g.globalCompositeOperation = "screen";
  const mg = g.createRadialGradient(SUN.x, sy, 0, SUN.x, sy, 760);
  // (kept under clipping: the haze must not turn into an HDR light that veils everything)
  mg.addColorStop(0, K.rgba("#ffd6a0", 0.5));
  mg.addColorStop(0.07, K.rgba("#ffc890", 0.3));
  mg.addColorStop(0.3, K.rgba("#f7b88a", 0.12));
  mg.addColorStop(1, K.rgba("#f0a880", 0));
  g.fillStyle = mg;
  g.fillRect(-400, top - 200, W + 800, hz - top + 260);
  g.restore();
  // low stratus banks lit pink-gold from below
  K.clouds(g, W, H, t, { seed: 21, kind: "stratus", y: hz - 150, spread: 46, count: 6, color: "#ffe1cc", shade: "#b4a2b8", sun: { x: SUN.x, y: sy }, speed: 2.2, alpha: 0.6, scale: 1.25 });
  K.clouds(g, W, H, t, { seed: 27, kind: "stratus", y: hz - 70, spread: 16, count: 5, color: "#ffdcc8", shade: "#d0bcc4", sun: { x: SUN.x, y: sy }, speed: 1.2, alpha: 0.32, scale: 0.8 });
  if (o.sun !== false) K.sunGlow(g, SUN.x, sy, 21, "#ffe8c4", 1.15);
}

// distant town: plaster walls, shingle roofs, windows catching the sunrise; hazed as one layer
function town(s) {
  const L = K.makeCanvas(Math.ceil(W * SS), Math.ceil(160 * SS));
  const g = L.getContext("2d");
  g.scale(SS, SS);
  g.translate(0, -(HZ - 140));
  const R = K.rng("f01-town");
  const items = [];
  for (let i = 0; i < 30; i++) items.push({ x: -30 + R() * (W + 60), w: 26 + R() * 46, h: 18 + R() * 46, roof: R(), hue: R(), win: R() });
  items.push({ x: 228, w: 22, h: 112, tower: true, hue: 0.4, win: 0.5, roof: 0 });
  items.push({ x: 702, w: 46, h: 70, dome: true, hue: 0.6, win: 0.4, roof: 0 });
  items.sort((a, b) => a.h - b.h);
  for (const b of items) {
    const base = HZ + 1, top = base - b.h;
    const wall = K.mix(["#d8c0a6", "#cdb49c", "#e0cdb6", "#c4a890"][Math.floor(b.hue * 4)], "#b8a090", 0.15);
    const wp = new Path2D(); wp.rect(b.x, top, b.w, b.h + 1);
    K.texFill(g, "plaster", wp, { scale: 46, tex: { seed: 4, color: wall, stain: 0.5 } });
    // the sun is low on the left: the left of each facade warms, the right falls off into skylight
    inside(g, wp, (c) => {
      c.fillStyle = lin(c, b.x, 0, b.x + b.w, 0, [[0, "rgba(255,214,170,0.22)"], [0.5, "rgba(0,0,0,0)"], [1, "rgba(60,64,110,0.28)"]]);
      c.fillRect(b.x, top, b.w, b.h + 1);
      c.fillStyle = lin(c, 0, base - 10, 0, base, [[0, "rgba(40,30,40,0)"], [1, "rgba(40,30,40,0.35)"]]);
      c.fillRect(b.x, base - 10, b.w, 11);
    });
    // windows: dark glass, a few on the sun side mirroring the sunrise
    const cols = Math.max(1, Math.floor(b.w / 13)), rows = Math.max(1, Math.floor((b.h - 8) / 15));
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const wx = b.x + 5 + k * ((b.w - 10) / cols), wy = top + 6 + r * 15;
      const hot = K.hash(k + r * 7, b.x) > 0.86 && b.x < 520;
      // reveal (the wall's thickness, in shadow), glass, glazing bar, a lit sill
      g.fillStyle = "rgba(40,34,44,0.55)"; g.fillRect(wx - 0.6, wy - 0.6, 5.4, 7.6);
      g.fillStyle = hot ? "#ffd9a4" : K.mix("#3a3848", "#7a7890", K.hash(k, r + b.x));
      g.fillRect(wx, wy, 4.2, 6.5);
      g.fillStyle = hot ? "rgba(255,240,210,0.5)" : "rgba(150,160,190,0.25)"; g.fillRect(wx, wy, 1.4, 6.5);
      g.fillStyle = "rgba(60,50,50,0.45)"; g.fillRect(wx, wy + 3, 4.2, 0.6); g.fillRect(wx + 1.9, wy, 0.5, 6.5);
      g.fillStyle = "rgba(255,240,220,0.32)";
      g.fillRect(wx - 0.6, wy + 6.6, 5.4, 0.9);
    }
    // roofs
    const rp = new Path2D();
    if (b.tower) { rp.moveTo(b.x - 2, top); rp.lineTo(b.x + b.w / 2, top - 34); rp.lineTo(b.x + b.w + 2, top); rp.closePath(); }
    else if (b.dome) { rp.ellipse(b.x + b.w / 2, top, b.w * 0.5, b.w * 0.42, 0, Math.PI, K.TAU); rp.closePath(); }
    else if (b.roof > 0.35) { const rh = 8 + b.roof * 12; rp.moveTo(b.x - 3, top + 1); rp.lineTo(b.x + b.w * 0.5, top - rh); rp.lineTo(b.x + b.w + 3, top + 1); rp.closePath(); }
    else { rp.rect(b.x - 2, top - 3, b.w + 4, 4); }
    K.texFill(g, "shingle", rp, { scale: 22, tex: { seed: 2, color: b.dome ? "#6f8a86" : K.mix("#8a5442", "#5a4a4a", Math.floor(b.hue * 3) / 2) } }); // 3 roof stocks (each colour is a texture build)
    inside(g, rp, (c) => { c.fillStyle = lin(c, b.x, 0, b.x + b.w, 0, [[0, "rgba(255,200,150,0.28)"], [1, "rgba(30,30,60,0.35)"]]); c.fillRect(b.x - 4, top - 40, b.w + 8, 44); });
    // the eaves throw a soft shadow band on the wall; a chimney on some pitched roofs
    if (!b.dome) { g.fillStyle = lin(g, 0, top, 0, top + 4, [[0, "rgba(30,24,36,0.5)"], [1, "rgba(30,24,36,0)"]]); g.fillRect(b.x, top, b.w, 4); }
    if (!b.tower && !b.dome && b.roof > 0.35 && b.win > 0.45) {
      const chx = b.x + b.w * (0.2 + b.win * 0.4), rh = 8 + b.roof * 12;
      g.fillStyle = "#9a7a68"; g.fillRect(chx, top - rh * 0.9, 3.4, rh * 0.75);
      g.fillStyle = "rgba(40,36,60,0.4)"; g.fillRect(chx + 2, top - rh * 0.9, 1.4, rh * 0.75);
      g.fillStyle = "#6a5a54"; g.fillRect(chx - 0.6, top - rh * 0.95, 4.6, 1.2);
    }
  }
  // atmospheric perspective: the whole town sits ~1-2 km away in morning haze
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = lin(g, 0, HZ - 140, 0, HZ, [[0, K.rgba(HAZE, 0.5)], [1, K.rgba(HAZE, 0.62)]]);
  g.fillRect(-10, HZ - 150, W + 20, 170);
  s.drawImage(L, 0, HZ - 140, W, 160);
}

// a sandstone portal arch holding a glowing veil (static part); x,y = bottom centre, h = height
function archSprite(i, h, color) {
  const w = h * 0.7, iw = w * 0.34, pw = w * 0.15;
  const SW = Math.ceil(w * 1.4), SH = Math.ceil(h * 1.15);
  return hiSprite("f01-arch2:" + i + ":" + h, SW, SH, (g) => {
    const x = SW / 2, y = SH - 4, top = y - h + iw;
    const open = new Path2D();
    open.moveTo(x - iw, y); open.lineTo(x - iw, top); open.arc(x, top, iw, Math.PI, K.TAU); open.lineTo(x + iw, y); open.closePath();
    // the veil: a luminous membrane, brightest in its heart, faintly turbulent
    inside(g, open, (c) => {
      // seen through: dim, desaturated depth; the light lives in drifting veils of luminous vapour,
      // brightest low in the opening (where it spills out onto the stones)
      const vg = c.createRadialGradient(x, y - h * 0.3, 0, x, y - h * 0.3, h * 0.75);
      vg.addColorStop(0, K.mix(color, "#fff4e8", 0.35));
      vg.addColorStop(0.45, K.mix(K.shade(color, -0.25), "#8a8098", 0.3));
      vg.addColorStop(1, K.mix(K.shade(color, -0.6), "#2a2434", 0.4));
      c.fillStyle = vg;
      c.fillRect(0, 0, SW, SH);
      K.texRect(c, "cloud", 0, 0, SW, SH, { scale: h * 0.8, scaleY: h * 1.3, alpha: 0.55, mode: "screen", tint: color, tintMode: "multiply", tintAlpha: 0.5, tex: { seed: 11 + i, cover: 0.45, size: 192 } });
      K.texRect(c, "cloud", 0, 0, SW, SH, { scale: h * 0.35, scaleY: h * 0.6, ox: h * 0.2, alpha: 0.3, mode: "overlay", tex: { seed: 31 + i, cover: 0.5 } });
      // the reveal's shadow on the inside of each jamb and under the crown
      c.fillStyle = lin(c, x - iw, 0, x + iw, 0, [[0, "rgba(10,8,20,0.45)"], [0.2, "rgba(10,8,20,0)"], [0.8, "rgba(10,8,20,0)"], [1, "rgba(10,8,20,0.45)"]]);
      c.fillRect(0, 0, SW, SH);
    });
    const frame = new Path2D();
    frame.moveTo(x - iw - pw, y); frame.lineTo(x - iw - pw, top); frame.arc(x, top, iw + pw, Math.PI, K.TAU); frame.lineTo(x + iw + pw, y); frame.closePath();
    // the arch has depth: its side face shows on the shadow side (right), in cool skylight
    {
      const dpt = pw * 0.42;
      const side = new Path2D();
      side.moveTo(x + iw + pw, y); side.lineTo(x + iw + pw, top); side.arc(x, top, iw + pw, 0, -0.75, true);
      side.lineTo(x + Math.cos(-0.75) * (iw + pw) + dpt, top + Math.sin(-0.75) * (iw + pw) - dpt * 0.25);
      side.arc(x + dpt, top - dpt * 0.25, iw + pw, -0.75, 0); side.lineTo(x + iw + pw + dpt, y - dpt * 0.2); side.closePath();
      K.texFill(g, "granite", side, { scale: h * 0.5, tex: { seed: 6, color: "#9a8a7c", lichen: 0.3 } });
      inside(g, side, (c) => { c.fillStyle = "rgba(44,46,86,0.45)"; c.fillRect(0, 0, SW, SH); c.fillStyle = lin(c, 0, y - h * 0.25, 0, y, [[0, "rgba(0,0,0,0)"], [1, "rgba(20,16,26,0.5)"]]); c.fillRect(0, 0, SW, SH); });
    }
    g.save();
    g.beginPath();
    g.rect(0, 0, SW, SH);
    g.moveTo(x - iw, y); g.lineTo(x + iw, y); g.lineTo(x + iw, top); g.arc(x, top, iw, 0, Math.PI, true); g.closePath();
    g.clip("evenodd");
    K.texFill(g, "granite", frame, { scale: h * 0.55, tex: { seed: 6, color: "#c7b096", lichen: 0.25 } });
    // capitals and plinths
    for (const sd of [-1, 1]) {
      const px = sd < 0 ? x - iw - pw : x + iw;
      const cp = new Path2D(); cp.rect(px - pw * 0.18, top - pw * 0.3, pw * 1.36, pw * 0.3);
      const pl = new Path2D(); pl.rect(px - pw * 0.22, y - pw * 0.45, pw * 1.44, pw * 0.45);
      K.texFill(g, "granite", cp, { scale: h * 0.4, tex: { seed: 7, color: "#d2bca2", lichen: 0.1 } });
      K.texFill(g, "granite", pl, { scale: h * 0.4, tex: { seed: 8, color: "#bda68c", lichen: 0.4 } });
      g.fillStyle = "rgba(40,30,30,0.35)"; g.fillRect(px - pw * 0.18, top, pw * 1.36, pw * 0.07);
    }
    // voussoir joints (fine, low contrast)
    g.strokeStyle = "rgba(60,44,34,0.35)";
    g.lineWidth = Math.max(0.5, pw * 0.05);
    for (let k = 1; k < 9; k++) {
      const a = Math.PI + (k / 9) * Math.PI;
      g.beginPath(); g.moveTo(x + Math.cos(a) * iw, top + Math.sin(a) * iw); g.lineTo(x + Math.cos(a) * (iw + pw), top + Math.sin(a) * (iw + pw)); g.stroke();
    }
    // light: three tones across each pier - warm lit face toward the low sun (left), a soft
    // terminator, cool skylit shadow - plus the crown lit on top and occlusion at the foot
    g.globalCompositeOperation = "source-atop";
    for (const px0 of [x - iw - pw, x + iw]) {
      g.fillStyle = lin(g, px0, 0, px0 + pw, 0, [[0, "rgba(255,206,150,0.42)"], [0.38, "rgba(255,206,150,0.08)"], [0.55, "rgba(40,44,92,0.18)"], [1, "rgba(30,32,74,0.5)"]]);
      g.fillRect(px0, top - 2, pw, y - top + 2);
    }
    {
      const rg = g.createRadialGradient(x - iw * 0.6, top - iw - pw, 2, x, top, iw + pw * 1.2);
      rg.addColorStop(0, "rgba(255,214,166,0.4)"); rg.addColorStop(0.55, "rgba(0,0,0,0)"); rg.addColorStop(1, "rgba(36,38,84,0.45)");
      g.fillStyle = rg; g.fillRect(0, 0, SW, top + 1);
    }
    g.fillStyle = lin(g, 0, y - h * 0.22, 0, y, [[0, "rgba(20,16,26,0)"], [1, "rgba(20,16,26,0.55)"]]);
    g.fillRect(0, y - h * 0.22, SW, h * 0.22 + 4);
    g.globalCompositeOperation = "lighter";
    for (const sd of [-1, 1]) {
      const ex = x + sd * iw;
      g.fillStyle = lin(g, ex, 0, ex - sd * pw * -0.9, 0, [[0, K.rgba(color, 0.35)], [1, K.rgba(color, 0)]]);
      g.fillRect(Math.min(ex, ex + sd * pw), top - iw, pw, y - top + iw);
    }
    g.restore();
    // contact occlusion at the foot
    K.shadowBlob(g, x, y, iw + pw * 1.3, pw * 0.25, { alpha: 0.55, color: "#2a2028" });
  });
}
const ARCHES = [[70, 342, 150], [200, 326, 118], [335, 314, 96], [480, 310, 88], [625, 314, 96], [760, 326, 118], [890, 342, 150]];

/// ---- carved sandstone ------------------------------------------------------------------------------
// The statue is the kit cat (STATUE_COAT with the tabby pattern switched off: a carver does not paint
// stripes) rendered twice - eyes open and eyes shut - and the difference between the two is the eye
// mask. The shut render goes through lib012 stoneify() (desaturate, grain, sediment, key light), then
// one per-pixel pass at build time turns it into stone: fur detail blurred away, sandstone albedo with
// mottling, sediment bands and pitting, lichen on the upward faces, soot in the crevices and run-off
// streaks, blank carved eyeballs (no iris, no catchlight) with an incised lid groove, a smoothed
// silhouette (no fur fringe, no notches) and a chisel-edge highlight where the carving faces the sun.
const STONE_COAT = Object.assign({}, STATUE_COAT, {
  base: "#b29c7e", light: "#cdb99b", dark: "#7c6852", stripe: "#9a8466", tip: "#8a765c", belly: "#b6a082", white: "#c6b294",
  nose: "#a89070", noseEdge: "#7a6650", innerEar: "#8e7a5e", iris: "#a48e70", irisInner: "#b09a7c", liner: "#6e5c48",
  pattern: "solid", stripeAlpha: 0, bib: false, socks: false, muzzle: false, whisker: "rgba(0,0,0,0)", sheen: 0,
});
// the open-eyed render only exists to find the eyes: a vivid iris makes the mask exact
const STONE_EYE = Object.assign({}, STONE_COAT, { iris: "#00ff00", irisInner: "#00ff00", liner: "#ff00ff" });
// integer hash -> [0,1) (the kit's float hash shows plaid patterns on a pixel grid)
function ihash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function carveStone(w, h, unit, paint, o = {}) {
  // paint(ctx, blink) draws the cat into a device-pixel canvas (ctx already scaled)
  const A = K.makeCanvas(w, h), B = K.makeCanvas(w, h);
  // A, B and Cb are read back with getImageData: CPU-backed, so the read is not a GPU stall
  paint(A.getContext("2d", { willReadFrequently: true }), 0.05);
  paint(B.getContext("2d", { willReadFrequently: true }), 1);
  const ga = A.getContext("2d"), gb = B.getContext("2d");
  const da = ga.getImageData(0, 0, w, h).data, db0 = gb.getImageData(0, 0, w, h).data;
  // eye mask (where the open and shut renders differ)
  const E = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < E.length; i++, j += 4) {
    const df = Math.abs(da[j] - db0[j]) + Math.abs(da[j + 1] - db0[j + 1]) + Math.abs(da[j + 2] - db0[j + 2]);
    if (df > 70 && db0[j + 3] > 200) E[i] = 1;
  }
  // components -> eyes (largest two blobs)
  const lab = new Int32Array(w * h), comps = [];
  for (let i = 0; i < E.length; i++) {
    if (!E[i] || lab[i]) continue;
    const st = [i], c = { n: 0, x0: 1e9, x1: -1, y0: 1e9, y1: -1, id: comps.length + 1 };
    lab[i] = c.id;
    while (st.length) {
      const k = st.pop(), x = k % w, y = (k / w) | 0;
      c.n++; c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
      for (const nk of [k - 1, k + 1, k - w, k + w, k - w - 1, k - w + 1, k + w - 1, k + w + 1]) {
        if (nk >= 0 && nk < E.length && E[nk] && !lab[nk]) { lab[nk] = c.id; st.push(nk); }
      }
    }
    comps.push(c);
  }
  comps.sort((a, b) => b.n - a.n);
  const eyes = comps.slice(0, 2).filter((c) => c.n > 12);
  // sandstone: stoneify + blur the fur away
  stoneify(B, o.seed || "statue", { lightX: -1, chips: 0.01, cracks: o.cracks || 3, desat: 0.6 });
  const Cb = K.makeCanvas(w, h), cb = Cb.getContext("2d", { willReadFrequently: true });
  // (the form shading is low-frequency: blur the fur pattern right out; the stone's own detail
  // comes from the noise below)
  cb.filter = `blur(${K.qblur(Math.max(1.5, unit * 0.03).toFixed(2))}px)`;
  cb.drawImage(B, 0, 0);
  cb.filter = "none";
  const img = cb.getImageData(0, 0, w, h), P = img.data;
  // silhouette: box-blur the alpha and re-threshold (rounds off fur tufts and chipped notches)
  const al = new Float32Array(w * h), tmp = new Float32Array(w * h);
  for (let i = 0; i < al.length; i++) al[i] = db0[i * 4 + 3] / 255;
  const r = Math.max(1, Math.round(unit * 0.02));
  const box = (src, dst, dx, dy, n) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + dx * k, yy = y + dy * k;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) { c++; continue; }
        s += src[yy * w + xx]; c++;
      }
      dst[y * w + x] = s / c;
    }
  };
  box(al, tmp, 1, 0); box(tmp, al, 0, 1);
  const A2 = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : al[(y | 0) * w + (x | 0)]);
  // carved volume: a heavily blurred silhouette is a height field ("inflated" form); its gradient is
  // the surface normal, lit by the low sun from the upper left. Rounds every mass like real carving.
  const HF = new Float32Array(w * h);
  {
    const rb = Math.max(2, Math.round(unit * (o.round || 0.09)));
    const runBox = (src, dst, horiz) => {
      const n = horiz ? w : h, m = horiz ? h : w, st = horiz ? 1 : w, ls = horiz ? w : 1;
      for (let j = 0; j < m; j++) {
        const base = j * ls;
        let s = 0;
        for (let k = -rb; k <= rb; k++) { const kk = Math.min(n - 1, Math.max(0, k)); s += src[base + kk * st]; }
        for (let i = 0; i < n; i++) {
          dst[base + i * st] = s / (2 * rb + 1);
          const a = Math.max(0, i - rb), b = Math.min(n - 1, i + rb + 1);
          s += src[base + b * st] - src[base + a * st];
        }
      }
    };
    for (let i = 0; i < HF.length; i++) HF[i] = db0[i * 4 + 3] / 255;
    runBox(HF, tmp, true); runBox(tmp, HF, false);
    runBox(HF, tmp, true); runBox(tmp, HF, false);
    HF.rb = rb;
  }
  let Lx = -0.7, Ly = -0.52, Lz = 0.5;
  { const l = Math.hypot(Lx, Ly, Lz); Lx /= l; Ly /= l; Lz /= l; }
  const HFK = HF.rb * 2.2;
  const formAt = (x, y) => {
    const k = y * w + x;
    const hx = (x > 0 ? HF[k - 1] : 0) - (x < w - 1 ? HF[k + 1] : 0);
    const hy = (y > 0 ? HF[k - w] : 0) - (y < h - 1 ? HF[k + w] : 0);
    const nx = hx * HFK, ny = hy * HFK, nl = Math.hypot(nx, ny, 1);
    const dif = Math.max(0, (nx * Lx + ny * Ly + Lz) / nl);
    // flat areas keep their value (dif = Lz); sun-facing slopes brighten, the far slopes fall to shade
    return (0.38 + 0.8 * dif) / (0.38 + 0.8 * Lz);
  };
  // eye base colour: the stone just around each eye
  for (const c of eyes) {
    let rr = 0, gg = 0, bb = 0, n = 0;
    const pad = Math.max(2, (c.y1 - c.y0) * 0.6) | 0;
    for (let y = c.y0 - pad; y <= c.y1 + pad; y++) for (let x = c.x0 - pad; x <= c.x1 + pad; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const k = y * w + x;
      if (lab[k] === c.id || P[k * 4 + 3] < 200) continue;
      rr += P[k * 4]; gg += P[k * 4 + 1]; bb += P[k * 4 + 2]; n++;
    }
    c.col = n ? [rr / n, gg / n, bb / n] : [150, 135, 110];
  }
  const eyeOf = new Map(eyes.map((c) => [c.id, c]));
  const seed = 5 + (o.seedN || 0);
  const ed = Math.max(1, unit * 0.022);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x, i = k * 4;
      const aS = K.clamp((al[k] - 0.42) * 3.2);
      if (aS <= 0) { P[i + 3] = 0; continue; }
      let R = P[i], G = P[i + 1], Bc = P[i + 2];
      const ec = eyeOf.get(lab[k]);
      if (ec) {
        // a blank carved eyeball: convex, shadowed under the upper lid, lit from the left
        const v = (y - ec.y0) / Math.max(1, ec.y1 - ec.y0), u = (x - ec.x0) / Math.max(1, ec.x1 - ec.x0);
        // (no outline: a smooth bulge, the upper lid's overhang shading its top third)
        const sh = 0.8 + 0.3 * K.smooth(K.clamp(v * 1.6)) + 0.06 * (1 - u) - 0.08 * Math.abs(u - 0.5);
        R = ec.col[0] * sh; G = ec.col[1] * sh; Bc = ec.col[2] * sh;
      }
      const U = x / unit, V = y / unit;
      const lum = (0.3 * R + 0.59 * G + 0.11 * Bc) / 255;
      // sandstone albedo: mottling, sediment bands, a little iron staining
      const mot = fbm2(U * 5.5, V * 5.5, seed, 4);
      const band = Math.sin((V * 26 + fbm2(U * 1.6, V * 1.6, seed + 1, 3) * 2.2) * Math.PI);
      let ar = 192, ag = 172, ab = 142;
      const iron = K.clamp(fbm2(U * 2.4 + 9, V * 2.4, seed + 2, 3) * 1.6 - 0.2);
      ar += iron * 14; ag += iron * 2; ab -= iron * 12;
      const m = 1 + 0.11 * mot + 0.015 * band;
      const shd = K.clamp(lum / 0.58, 0.05, 1.55) * formAt(x, y);
      let r = ar * m * shd, gC = ag * m * shd, b = ab * m * shd;
      // keep a quarter of the rendered colour (the kit's warm/cool form light)
      r = r * 0.75 + R * 0.25; gC = gC * 0.75 + G * 0.25; b = b * 0.75 + Bc * 0.25;
      // pitting: sparse round pores (jittered cells), dark inside with a lit lower lip
      {
        const cu = U * 46, cvv = V * 46, ix = Math.floor(cu), iy = Math.floor(cvv), hh = ihash(ix, iy, 17);
        if (hh > 0.9) {
          const pcx = ix + 0.25 + 0.5 * ihash(ix, iy, 18), pcy = iy + 0.25 + 0.5 * ihash(ix, iy, 19);
          const pr = 0.1 + 0.16 * ihash(ix, iy, 20), dd = Math.hypot(cu - pcx, cvv - pcy);
          if (dd < pr) { const pk = 1 - 0.42 * (1 - dd / pr); r *= pk; gC *= pk; b *= pk; }
          else if (dd < pr * 1.5 && cvv > pcy) { r *= 1.06; gC *= 1.05; b *= 1.03; }
        }
      }
      // fine sandstone grain (per pixel, value-free hash: no lattice)
      { const gn = (ihash(x, y, 3) - 0.5) * 0.09; r *= 1 + gn; gC *= 1 + gn; b *= 1 + gn; }
      // soot in the crevices + run-off streaks below ledges
      const crev = K.clamp((0.36 - lum) * 3.2);
      const streak = K.clamp(fbm2(U * 26, V * 2.2, seed + 4, 2) * 1.4 + 0.25);
      const soot = K.clamp(crev * 0.75 + streak * 0.1 * K.clamp(V * 0.6));
      r = K.lerp(r, 46, soot * 0.55); gC = K.lerp(gC, 40, soot * 0.55); b = K.lerp(b, 36, soot * 0.55);
      // lichen: crusty pale grey-green and ochre patches, mostly on the upward faces
      const ln = fbm2(U * 4.2 + 3.1, V * 4.2, seed + 5, 4);
      const crust = fbm2(U * 22, V * 22, seed + 6, 2);
      const lk = K.clamp((ln - 0.22) * 3) * K.clamp(crust * 2 + 0.6) * 0.55 * K.clamp(lum * 1.6);
      if (lk > 0) {
        const ochre = fbm2(U * 6, V * 6, seed + 7, 2) > 0.2;
        const lr = ochre ? 178 : 142, lg = ochre ? 160 : 150, lb = ochre ? 92 : 118;
        r = K.lerp(r, lr * shd, lk); gC = K.lerp(gC, lg * shd, lk); b = K.lerp(b, lb * shd, lk);
      }
      // chisel edge: a bright bevel where the carving's edge faces the sun (upper left)
      if (A2(x - ed * 1.6, y - ed) < 0.4 && al[k] > 0.5) { r *= 1.22; gC *= 1.17; b *= 1.08; }
      // and a dark arris on the far (shadow) edge
      else if (A2(x + ed * 1.6, y + ed * 0.4) < 0.4 && al[k] > 0.5) { r *= 0.8; gC *= 0.8; b *= 0.84; }
      P[i] = Math.min(255, r); P[i + 1] = Math.min(255, gC); P[i + 2] = Math.min(255, b); P[i + 3] = 255 * aS;
    }
  }
  cb.putImageData(img, 0, 0);
  return Cb;
}

// the statue of Sir Whiskers the First, carved sandstone, painted at high resolution once
function statueCanvas(size, res, o = {}) {
  const key = "f01-statuecv4:" + size + ":" + res + ":" + (o.headTurn || 0.5);
  return TSPR(key, size * 2.7 * res, size * 3.1 * res, (s) => {
    s.scale(res, res);
    const cw = size * 2.7, bx = cw * 0.5, by = size * 3.02;
    const PXS = K.pixelScale() * res;
    const cv = carveStone(Math.ceil(cw * PXS), Math.ceil(size * 3.1 * PXS), size * PXS, (cg, blink) => {
      cg.setTransform(PXS, 0, 0, PXS, 0, 0);
      K.drawCat(cg, bx, by, size, {
        pose: "sit", facing: -1, headTurn: o.headTurn == null ? 0.5 : o.headTurn, gaze: 0, blink, t: 0, autoBlink: false, breath: 0,
        coat: blink < 0.5 ? STONE_EYE : STONE_COAT, collar: false, bell: false, shadow: false, pupil: 0.5, tail: 0, lod: 0,
        key: { x: bx - size * 3, y: by - size * 3.2, color: "#ffe2c0", strength: 1.0 },
        rim: { x: bx - size * 3, y: by - size * 1.4, color: "#ffd2a0", strength: 0.6 },
        fill: "#3a3448", ambient: "#6a7898", ambientK: 0.16,
      });
      // carved occlusion under the chin and where the haunch meets the chest
      cg.save();
      cg.globalCompositeOperation = "source-atop";
      const ao = (x, y, r, a) => { const gr = cg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(30,18,8,${a})`); gr.addColorStop(1, "rgba(30,18,8,0)"); cg.fillStyle = gr; cg.fillRect(x - r, y - r, r * 2, r * 2); };
      const k = size / 96;
      ao(bx - 30 * k, by - 100 * k, 34 * k, 0.5); ao(bx - 10 * k, by - 40 * k, 30 * k, 0.3); ao(bx, by, 60 * k, 0.35);
      cg.restore();
    }, { seed: "statue" + size, cracks: 5 });
    s.drawImage(cv, 0, 0, cw, size * 3.1);
  });
}

// the long sunrise shadows (statue, pedestal, basin, arches) baked flat onto the cobbles
function shadowLayer(s, statue, water) {
  const cv = K.makeCanvas(Math.ceil(W * SS), Math.ceil(H * SS));
  const c = cv.getContext("2d");
  const sh = (gy, sx, fl, fn) => {
    // (X, Y) -> (X + sx (gy - Y), gy + fl (gy - Y)): the silhouette laid along the ground away from the sun
    c.setTransform(SS, 0, -sx * SS, -fl * SS, sx * gy * SS, gy * (1 + fl) * SS);
    fn(c);
  };
  c.fillStyle = "#000";
  sh(FY + 2, 1.7, 0.09, (cc) => {
    cc.fillRect(FX - 60, FY - 102, 120, 104);
    cc.fillRect(FX - 70, FY - 114, 140, 13);
    cc.drawImage(statue, FX - 130, FY - 102 - 290, 260, 300);
  });
  c.setTransform(SS, 0, 0, SS, 0, 0);
  if (!water) { c.beginPath(); c.ellipse(FX + 40, FY + 30, 262, 50, 0, 0, K.TAU); c.fill(); }
  if (!water) for (const [x, y, h] of ARCHES) {
    sh(y, 1.4, 0.06, (cc) => { const w = h * 0.7; cc.fillRect(x - w * 0.5, y - h, w * 0.18, h); cc.fillRect(x + w * 0.32, y - h, w * 0.18, h); cc.fillRect(x - w * 0.5, y - h, w, h * 0.22); });
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = "source-in";
  c.fillStyle = "#3a3354";
  c.fillRect(0, 0, cv.width, cv.height);
  s.save();
  s.globalAlpha = water ? 0.36 : 0.42;
  if (water) s.clip(water); else { s.beginPath(); s.rect(-50, HZ + 1, W + 100, H); s.clip(); }
  blurInto(s, cv, water ? 3 : 2.2, 0, 0, W, H);
  s.restore();
}

// the BACK set: hills, cobbles, town, arches, trees, shadows, rim (top), water, pedestal, statue
const BACK_Y = -40; // the cherry crowns reach above the frame top: the plate must too
function plazaBack() {
  return hiSprite("f01-plaza-back", W, H - BACK_Y, (s) => {
    s.translate(0, -BACK_Y);
    K.hills(s, W, H, { y: HZ - 8, amp: 26, color: "#8a8aa6", seed: 4, haze: HAZE, hazeAmt: 0.6, freq: 0.8, cache: false });
    // cobbled plaza in true perspective, dissolving into haze
    K.groundPlane(s, W, H, { tex: "cobble", texOpts: { seed: 3, color: "#a48c7c", moss: 0.25, cells: 9 }, horizon: HZ, scale: 120, fog: GHAZE, fogAmt: 0.9, variation: 0.6, cache: false });
    {
      // near field: a second, coarser cobble plane laid in overlay, masked to the foreground, so local
      // contrast (and joint depth) grows toward the lens; the far field melts into haze and a slight blur
      const nc = K.makeCanvas(Math.ceil(W * SS), Math.ceil(H * SS)), n = nc.getContext("2d");
      n.scale(SS, SS);
      K.groundPlane(n, W, H, { tex: "cobble", texOpts: { seed: 3, color: "#8a7464", moss: 0.3, cells: 9 }, horizon: HZ, scale: 120, fog: "#808080", fogAmt: 0.0, variation: 0.8, cache: false });
      n.globalCompositeOperation = "destination-in";
      n.fillStyle = lin(n, 0, HZ + 30, 0, H, [[0, "rgba(0,0,0,0)"], [0.5, "rgba(0,0,0,0.45)"], [1, "rgba(0,0,0,0.9)"]]);
      n.fillRect(0, 0, W, H);
      s.save(); s.globalCompositeOperation = "overlay"; s.drawImage(nc, 0, 0, W, H); s.restore();
      // far band: soften + haze
      const ds = s.canvas.width / W;
      const fc = K.makeCanvas(Math.ceil(W * ds), Math.ceil(70 * ds)), f = fc.getContext("2d");
      f.drawImage(s.canvas, 0, Math.round((HZ - BACK_Y) * ds), fc.width, fc.height, 0, 0, fc.width, fc.height);
      s.save(); s.beginPath(); s.rect(-10, HZ, W + 20, 70); s.clip();
      blurInto(s, fc, 0.9, 0, HZ, W, 70);
      s.fillStyle = lin(s, 0, HZ, 0, HZ + 70, [[0, K.rgba(GHAZE, 0.5)], [1, K.rgba(GHAZE, 0)]]);
      s.fillRect(-10, HZ, W + 20, 70);
      s.restore();
    }
    // sun grazing from the left: warm on that side, cool skylight in the far shadowed half
    s.save();
    s.globalCompositeOperation = "soft-light";
    s.fillStyle = lin(s, 0, 0, W, 0, [[0, "rgba(255,196,140,0.75)"], [0.55, "rgba(200,170,160,0.2)"], [1, "rgba(90,96,160,0.55)"]]);
    s.fillRect(-60, HZ, W + 120, H - HZ + 10);
    s.restore();
    // forward-scatter sheen on the stones toward the sun
    K.lightPool(s, SUN.x + 60, HZ + 26, 330, "#ffcf9a", { intensity: 0.32, flat: 0.16 });
    // dew on the cobble crowns: the low sun's specular glitter, a long streak toward us under it
    {
      s.save();
      s.globalCompositeOperation = "screen";
      s.translate(SUN.x + 30, HZ + 4); s.scale(0.42, 1);
      const sg = s.createRadialGradient(0, 0, 0, 0, 0, 260);
      sg.addColorStop(0, "rgba(255,226,180,0.45)"); sg.addColorStop(0.4, "rgba(255,210,160,0.14)"); sg.addColorStop(1, "rgba(255,210,160,0)");
      s.fillStyle = sg; s.fillRect(-300, 0, 600, 260);
      s.restore();
      const R = K.rng("f01-dew-cob");
      s.save();
      s.globalCompositeOperation = "lighter";
      for (let i = 0; i < 520; i++) {
        const v = Math.pow(R(), 1.6), y = HZ + 3 + v * (H - HZ);
        const spread = 40 + v * 380, x = SUN.x + 30 + (R() - 0.5) * 2 * spread * Math.pow(R(), 0.7);
        const k = Math.max(0, 1 - Math.abs(x - SUN.x - 30) / (spread + 1));
        const a = (0.25 + 0.6 * R()) * k;
        if (a < 0.05) continue;
        const z = 0.35 + v * 1.2;
        s.fillStyle = `rgba(255,236,206,${a.toFixed(3)})`;
        s.fillRect(x - z / 2, y - z / 2, z, z * 0.7);
      }
      s.restore();
    }
    town(s);
    // arches (far ones first) with their veils spilling coloured light on the cobbles
    ARCHES.forEach(([x, y, h], i) => {
      K.lightPool(s, x, y + 2, h * 0.75, ZONE_GLOW[i], { intensity: 0.28, flat: 0.22 });
    });
    const order = [3, 2, 4, 1, 5, 0, 6];
    for (const i of order) {
      const [x, y, h] = ARCHES[i];
      const spr = archSprite(i, h, ZONE_GLOW[i]);
      const w = h * 0.7, SW = Math.ceil(w * 1.4), SH = Math.ceil(h * 1.15);
      s.drawImage(spr, x - SW / 2, y + 4 - SH, SW, SH);
      // haze by distance
      const far = K.clamp(1 - (y - 310) / 32);
      if (far > 0.05) { s.save(); s.globalAlpha = 0.28 * far; s.globalCompositeOperation = "source-atop"; s.restore(); }
    }
    // the statue canvas (also used for its shadow and reflection)
    const st = statueCanvas(96, 2);
    shadowLayer(s, st);
    // flowering trees framing the plaza (cherry, lit from the left)
    K.tree(s, 6, 384, 1.25, { seed: 5, kind: "oak", leaf: "#c98aa0", trunk: "#4a3832", sun: SUN, sway: 0 });
    K.tree(s, 958, 392, 1.3, { seed: 7, kind: "oak", leaf: "#c4869c", trunk: "#4a3832", sun: SUN, sway: 0 });
    // damp cobbles around the basin (splash zone): darker, a touch glossy
    s.save();
    s.globalCompositeOperation = "multiply";
    const dg = s.createRadialGradient(FX, FY + 30, 200, FX, FY + 30, 330);
    dg.addColorStop(0, "rgba(120,110,120,0.55)");
    dg.addColorStop(1, "rgba(255,255,255,0)");
    s.fillStyle = dg;
    s.save(); s.translate(FX, FY + 30); s.scale(1, 0.24); s.translate(-FX, -(FY + 30));
    s.fillRect(FX - 340, FY + 30 - 340, 680, 680);
    s.restore();
    s.restore();
    // contact occlusion where the basin meets the cobbles
    K.shadowBlob(s, FX, FY + 30, 250, 22, { alpha: 0.55, color: "#2a2026", soft: 0.5 });
    // basin top (full ring; the front half is repainted by the FRONT set above the jets)
    rimTop(s);
    // inner wall + water
    const inner = ellPath(FX, FY + 2, 226, 42);
    s.fillStyle = "#4a4240";
    s.fill(inner);
    inside(s, inner, (c) => {
      const water = ellPath(FX, FY + 7, 226, 39);
      c.save();
      c.clip(water);
      // the water mirrors the sky: pale horizon at the far side, deeper blue toward us, plus depth
      // Fresnel: grazing far side mirrors the bright horizon; near side looks down into the dark basin
      c.fillStyle = lin(c, 0, FY - 32, 0, FY + 46, [[0, "#e2cbb8"], [0.2, "#a8a8b2"], [0.45, "#5e7080"], [0.75, "#34424a"], [1, "#262e30"]]);
      c.fillRect(FX - 240, FY - 40, 480, 90);
      // reflection of the statue + pedestal (flipped about the waterline)
      c.save();
      c.globalAlpha = 0.5;
      c.translate(0, (FY + 2) * 2);
      c.scale(1, -1);
      pedestal(c);
      c.drawImage(st, FX - 130, FY - 102 - 290, 260, 300);
      c.restore();
      c.globalCompositeOperation = "multiply";
      c.fillStyle = "rgba(96,110,130,0.55)";
      c.fillRect(FX - 240, FY + 2, 480, 50);
      c.globalCompositeOperation = "source-over";
      // the warm sun streak reflected on the far-left water
      K.lightPool(c, FX - 150, FY - 22, 90, "#ffd6a0", { intensity: 0.5, flat: 0.12 });
      c.restore();
      // occlusion along the inner wall
      c.strokeStyle = "rgba(20,16,20,0.4)";
      c.lineWidth = 6;
      c.stroke(ellPath(FX, FY + 4, 224, 40));
    });
    // the statue's and pedestal's long sun shadow continues across the water, toward camera-right
    shadowLayer(s, st, ellPath(FX, FY + 7, 226, 39));
    // contact occlusion where the pedestal stands in the water
    K.shadowBlob(s, FX + 14, FY + 4, 74, 5, { alpha: 0.6, color: "#141a1e", soft: 0.5 });
    pedestal(s);
    s.drawImage(st, FX - 130, FY - 102 - 290, 260, 300);
    // contact shadow of the statue on its cornice
    K.shadowBlob(s, FX - 6, FY - 102, 54, 4, { alpha: 0.6, color: "#2a1a10", soft: 0.6 });
  });
}
const GRANITE_RIM = { seed: 5, color: "#ccb69a", lichen: 0.3 };
function rimTop(s, frontOnly) {
  const ring = new Path2D();
  ring.ellipse(FX, FY + 4, 244, 50, 0, 0, K.TAU);
  ring.ellipse(FX, FY + 2, 226, 42, 0, 0, K.TAU);
  s.save();
  if (frontOnly) { s.beginPath(); s.rect(FX - 260, FY + 2, 520, 80); s.clip(); }
  s.save();
  s.clip(ring, "evenodd");
  K.texRect(s, "granite", FX - 250, FY - 50, 500, 110, { scale: 110, scaleY: 34, tex: GRANITE_RIM });
  // top face: lit by the low sun from the left, sky on the right; damp near the water
  s.fillStyle = lin(s, FX - 250, 0, FX + 250, 0, [[0, "rgba(255,214,168,0.35)"], [0.5, "rgba(0,0,0,0)"], [1, "rgba(60,62,110,0.3)"]]);
  s.fillRect(FX - 250, FY - 50, 500, 110);
  s.strokeStyle = "rgba(40,36,44,0.35)";
  s.lineWidth = 4;
  s.stroke(ellPath(FX, FY + 2, 227, 43));
  s.restore();
  // a fine bevel catching the sky along the outer edge
  s.strokeStyle = "rgba(255,236,214,0.4)";
  s.lineWidth = 1.1;
  s.beginPath(); s.ellipse(FX, FY + 4, 243.5, 49.5, 0, frontOnly ? 0 : Math.PI, frontOnly ? Math.PI : K.TAU); s.stroke();
  s.restore();
}
function pedestal(s) {
  const body = new Path2D(); body.rect(FX - 58, FY - 100, 116, 104);
  K.texFill(s, "granite", body, { scale: 90, tex: { seed: 9, color: "#c3ac92", lichen: 0.35 } });
  inside(s, body, (c) => {
    c.fillStyle = lin(c, FX - 58, 0, FX + 58, 0, [[0, "rgba(255,206,160,0.3)"], [0.12, "rgba(0,0,0,0.05)"], [1, "rgba(40,40,80,0.42)"]]);
    c.fillRect(FX - 60, FY - 102, 120, 110);
    // occlusion under the cornice + wet darkening at the waterline
    c.fillStyle = lin(c, 0, FY - 100, 0, FY - 84, [[0, "rgba(30,20,20,0.55)"], [1, "rgba(30,20,20,0)"]]);
    c.fillRect(FX - 60, FY - 100, 120, 18);
    c.fillStyle = lin(c, 0, FY - 26, 0, FY + 4, [[0, "rgba(40,40,50,0)"], [0.55, "rgba(36,34,40,0.35)"], [0.75, "rgba(30,30,36,0.62)"], [1, "rgba(24,26,30,0.72)"]]);
    c.fillRect(FX - 60, FY - 26, 120, 30);
    // the wet band glistens: a thin specular line along its top edge, and algae right at the water
    c.fillStyle = "rgba(255,236,210,0.18)"; c.fillRect(FX - 58, FY - 12, 116, 1.2);
    c.fillStyle = "rgba(60,80,50,0.35)"; c.fillRect(FX - 58, FY - 1, 116, 5);
  });
  // cornice
  const cor = new Path2D(); cor.rect(FX - 70, FY - 114, 140, 14);
  K.texFill(s, "granite", cor, { scale: 70, tex: { seed: 10, color: "#d2bea4", lichen: 0.2 } });
  inside(s, cor, (c) => {
    c.fillStyle = lin(c, 0, FY - 114, 0, FY - 100, [[0, "rgba(255,230,196,0.35)"], [0.3, "rgba(0,0,0,0)"], [1, "rgba(30,24,40,0.45)"]]);
    c.fillRect(FX - 72, FY - 116, 144, 18);
    c.fillStyle = lin(c, FX - 70, 0, FX + 70, 0, [[0, "rgba(0,0,0,0)"], [1, "rgba(40,40,80,0.35)"]]);
    c.fillRect(FX - 72, FY - 116, 144, 18);
  });
  // bronze plaque with green patina, recessed (no lettering legible at this distance)
  const pl = new Path2D(); pl.rect(FX - 30, FY - 76, 60, 30);
  s.fillStyle = "rgba(20,14,10,0.6)"; s.fillRect(FX - 31, FY - 77, 62, 32);
  K.texFill(s, "metal", pl, { scale: 40, tex: { seed: 3, color: "#6a5434", rust: 0.6 } });
  inside(s, pl, (c) => {
    c.fillStyle = lin(c, FX - 30, FY - 76, FX + 30, FY - 46, [[0, "rgba(255,210,140,0.3)"], [0.5, "rgba(80,120,96,0.25)"], [1, "rgba(20,30,30,0.45)"]]);
    c.fillRect(FX - 30, FY - 76, 60, 30);
    c.fillStyle = "rgba(30,22,10,0.45)";
    for (let i = 0; i < 3; i++) c.fillRect(FX - 22 + (i === 2 ? 8 : 0), FY - 69 + i * 7, i === 2 ? 28 : 44, 1.6);
  });
}
// the FRONT set: the near half of the basin wall and rim (drawn above the jets and the water)
function plazaFront() {
  return hiSprite("f01-plaza-front", W, H - BACK_Y, (s) => {
    s.translate(0, -BACK_Y);
    const wall = new Path2D();
    wall.ellipse(FX, FY + 4, 244, 50, 0, 0, Math.PI);
    wall.ellipse(FX, FY + 30, 244, 50, 0, Math.PI, 0, true);
    wall.closePath();
    K.texFill(s, "granite", wall, { scale: 80, tex: { seed: 13, color: "#b39c82", lichen: 0.55 } });
    inside(s, wall, (c) => {
      // facing us and away from the sun: skylight fill, warmer toward the sunlit left curve
      c.fillStyle = lin(c, FX - 244, 0, FX + 244, 0, [[0, "rgba(255,200,150,0.3)"], [0.18, "rgba(90,80,110,0.12)"], [0.75, "rgba(50,50,90,0.32)"], [1, "rgba(40,40,80,0.45)"]]);
      c.fillRect(FX - 250, FY, 500, 90);
      c.fillStyle = lin(c, 0, FY + 30, 0, FY + 82, [[0, "rgba(0,0,0,0)"], [0.7, "rgba(30,20,24,0.25)"], [1, "rgba(30,20,24,0.55)"]]);
      c.fillRect(FX - 250, FY + 30, 500, 54);
      // a coping overhang shadow just below the rim
      c.strokeStyle = "rgba(30,24,30,0.5)";
      c.lineWidth = 4;
      c.beginPath(); c.ellipse(FX, FY + 6.5, 244, 50, 0, 0.02, Math.PI - 0.02); c.stroke();
    });
    rimTop(s, true);
  });
}

// per-frame plaza life: veils breathing, water, jets, mist
const SPOUTS = [[-58, -1, 150, 70], [58, 1, 150, 70], [-36, -1, 96, 52], [36, 1, 96, 52]];
const WATER_GLINTS = (() => {
  const R = K.rng("f01-wg"), a = [];
  for (let i = 0; i < 26; i++) { const u = R(); a.push([FX - 210 + u * 190, FY - 28 + R() * 22 + u * 6, 0.8 + R() * 1.2, R() * 20]); }
  return a;
})();
function plazaLive(g, t, o = {}) {
  // portal veils breathing (additive, small)
  ARCHES.forEach(([x, y, h], i) => {
    if (i === 3) return;
    K.glow(g, x, y - h * 0.42, h * 0.5, ZONE_GLOW[i], 0.1 + 0.05 * Math.sin(t * 0.9 + i * 1.7));
  });
  // water: two slow ripple fields + sun glints on the far side - clipped so they never paint over
  // the pedestal standing in it (the stone is opaque)
  const water = ellPath(FX, FY + 7, 224, 38);
  water.rect(FX - 59, FY - 29, 118, 34);
  g.save();
  g.clip(water, "evenodd");
  K.texRect(g, "cloud", FX - 230, FY - 34, 460, 84, { scale: 200, scaleY: 26, ox: t * 7, alpha: 0.32, mode: "soft-light", tex: { seed: 9, cover: 0.55 } });
  K.texRect(g, "cloud", FX - 230, FY - 34, 460, 84, { scale: 140, scaleY: 18, ox: -t * 11, oy: 7, alpha: 0.22, mode: "overlay", tex: { seed: 4, cover: 0.5 } });
  glints(g, t, WATER_GLINTS, { speed: 2.6, alpha: 0.9 });
  g.restore();
  // caustics: sunlight bounced off the moving water dances on the wet foot of the pedestal
  g.save();
  g.beginPath(); g.rect(FX - 58, FY - 20, 116, 23); g.clip();
  K.texRect(g, "cloud", FX - 58, FY - 20, 116, 23, { scale: 38, scaleY: 9, ox: t * 13, oy: Math.sin(t * 1.3) * 3, alpha: 0.5, mode: "overlay", tex: { seed: 15, cover: 0.3 } });
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = 0.16;
  K.texRect(g, "cloud", FX - 58, FY - 20, 116, 23, { scale: 30, scaleY: 7, ox: -t * 9, oy: 4, mode: "source-over", tex: { seed: 16, cover: 0.15 } });
  g.restore();
  if (o.jets === false) return;
  // jets: sun behind-left back-lights the water, so the streams read bright against the shade
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  SPOUTS.forEach(([sx, dir, reach, hgt], j) => {
    const x0 = FX + sx, y0 = FY - 64;
    const P = (u) => [x0 + dir * reach * u, y0 - hgt * 4 * u * (1 - u) + (FY + 4 - y0) * u * u];
    const wob = Math.sin(t * 7 + j) * 0.6;
    // a translucent rope of water: a faint body, then broken travelling pulses (the stream is never
    // a clean line), thinning toward where it breaks up
    const jet = new Path2D();
    for (let k = 0; k <= 18; k++) { const u = k / 18 * 0.86; const [x, y] = P(u); if (k) jet.lineTo(x, y + wob * u); else jet.moveTo(x, y); }
    g.strokeStyle = "rgba(220,232,246,0.06)"; g.lineWidth = 5; g.stroke(jet);
    g.strokeStyle = "rgba(226,238,250,0.13)"; g.lineWidth = 2.2; g.stroke(jet);
    g.setLineDash([9 + j * 2, 5, 3, 7]);
    g.lineDashOffset = -t * (140 + j * 13);
    g.strokeStyle = "rgba(250,252,255,0.38)"; g.lineWidth = 1.1; g.stroke(jet);
    g.setLineDash([2, 11]);
    g.lineDashOffset = -t * (170 + j * 9);
    g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 1.6; g.stroke(jet);
    g.setLineDash([]);
    // the stream breaks into droplets as it falls (motion-blurred: short streaks along the path)
    for (let i = 0; i < 22; i++) {
      const u = 0.55 + (((i / 22) + t * 0.9 + j * 0.13) % 1) * 0.45;
      const [x, y] = P(u), [x2, y2] = P(u - 0.025);
      const sp = (u - 0.55) * 26 * (K.hash(i, j) - 0.5);
      g.strokeStyle = `rgba(245,250,255,${0.55 * (1 - (u - 0.55))})`;
      g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(x + sp, y); g.lineTo(x2 + sp, y2); g.stroke();
    }
    // the splash: a little crown + mist where it lands
    const [lx, ly] = P(1);
    for (let k = 0; k < 5; k++) {
      const ph = (t * 2.2 + k * 0.37 + j * 0.21) % 1;
      const a = (K.hash(k, j + 3) - 0.5) * 1.6;
      g.fillStyle = `rgba(240,248,255,${0.5 * (1 - ph)})`;
      g.fillRect(lx + Math.sin(a) * ph * 10, ly - Math.sin(ph * Math.PI) * 9 * (0.6 + K.hash(k, j) * 0.6), 1.3, 1.3);
    }
    K.glow(g, lx, ly - 3, 22, "#f4f8ff", 0.14);
    g.strokeStyle = "rgba(230,240,255,0.16)";
    g.lineWidth = 0.8;
    const rr = ((t * 0.9 + j * 0.3) % 1);
    g.beginPath(); g.ellipse(lx, ly + 1, 6 + rr * 26, (6 + rr * 26) * 0.17, 0, 0, K.TAU); g.globalAlpha = 1 - rr; g.stroke(); g.globalAlpha = 1;
  });
  g.restore();
}
function drawPlaza(g, t, o = {}) {
  g.drawImage(plazaBack(), 0, BACK_Y, W, H - BACK_Y);
  plazaLive(g, t, o);
  g.drawImage(plazaFront(), 0, BACK_Y, W, H - BACK_Y);
}

// ================================================================================================
// shot 1 [0-9]: crane down through the cloud sea onto the plaza
// ================================================================================================
/// cloudBank(seed, kind) - a volumetric cloud bank lit by the low sun from below-left, baked ONCE per
// pixel: an fbm density field (billowed top, flatter ragged base), then a short ray-march toward the
// sun per pixel (Beer-Lambert transmittance) plus a skylight term from above. Result: pink-gold lit
// undersides and sun-facing flanks, darker lilac cores, silver-lined wispy edges. Small raster (it is
// drawn soft, into a half-resolution layer, and the lens blur hides the upscale).
const BANK_PX = 560; // raster width of a bank (it is drawn soft into a half-res layer)
function cloudBank(seed, aspect) {
  const bw = BANK_PX, bh = Math.round(BANK_PX / aspect);
  return TSPR("f01-bank3:" + seed + ":" + aspect, bw, bh, (s) => {
    const cv = s.canvas, w = cv.width, h = cv.height;
    const D = new Float32Array(w * h);
    // isotropic units: Y in 0..1 over the height, X in 0..aspect
    for (let y = 0; y < h; y++) {
      const Y = y / h;
      for (let x = 0; x < w; x++) {
        const X = (x / w) * aspect;
        // cumulus heaps: a lumpy top (several overlapping domes), a flatter, ragged base
        const heap = Math.abs(fbm2(X * 0.9 + seed * 0.37, 0.5, seed + 7, 4));
        const top = 0.48 - heap * 0.42 - 0.12 * fbm2(X * 2.6, 1.7, seed + 9, 3);
        const bot = 0.8 + 0.05 * fbm2(X * 3 + seed, 2.5, seed + 11, 3);
        const env = K.smooth(K.clamp((Y - top) / 0.14)) * K.smooth(K.clamp((bot - Y) / 0.2));
        // billows: domain-warped fbm (round cauliflower lobes rather than streaks)
        const wx = fbm2(X * 2.2, Y * 2.2, seed + 3, 3), wy = fbm2(X * 2.2 + 5.1, Y * 2.2, seed + 4, 3);
        const n = fbm2(X * 3.4 + wx * 0.6, Y * 3.4 + wy * 0.6, seed, 5);
        const edgeFade = K.smooth(K.clamp((x / w) / 0.1)) * K.smooth(K.clamp((1 - x / w) / 0.1));
        D[y * w + x] = K.clamp((0.5 + n * 1.1) * env * edgeFade * 1.3);
      }
    }
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : D[(y | 0) * w + (x | 0)]);
    const img = s.createImageData(w, h), P = img.data;
    const step = Math.max(1, h / 60);
    const lx = -0.62 * step, ly = 0.78 * step; // toward the sun: low and to the left
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = D[y * w + x];
        const i = (y * w + x) * 4;
        if (d < 0.01) { P[i + 3] = 0; continue; }
        let od = 0;
        for (let k = 1; k <= 8; k++) od += at(x + lx * k * k * 0.5, y + ly * k * k * 0.5) * (2 * k - 1) * 0.5;
        const Tsun = Math.exp(-od * 0.07);
        let ou = 0;
        for (let k = 1; k <= 5; k++) ou += at(x, y - step * k * 2);
        const Tsky = Math.exp(-ou * 0.4);
        const thin = 1 - K.clamp(d * 2.2);
        // local occlusion: the crevices between billows see less sky and less bounce
        const rr2 = step * 3;
        const occ = (at(x - rr2, y) + at(x + rr2, y) + at(x, y - rr2) + at(x, y + rr2) + at(x - rr2, y - rr2) + at(x + rr2, y - rr2)) / 6;
        const ao = 1 - 0.32 * K.clamp(occ - d * 0.6);
        // lilac-grey core, pink-gold where the sun reaches, blue skylight on the tops
        const r = (98 + 140 * Tsun + 40 * Tsky + 16 * thin * Tsun) * ao;
        const gg = (90 + 104 * Tsun + 54 * Tsky + 12 * thin * Tsun) * ao;
        const b = (122 + 64 * Tsun + 78 * Tsky + 6 * thin * Tsun) * ao;
        P[i] = Math.min(255, r);
        P[i + 1] = Math.min(255, gg);
        P[i + 2] = Math.min(255, b);
        P[i + 3] = 255 * Math.pow(K.clamp(d * 1.7), 1.3);
      }
    }
    s.save();
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.putImageData(img, 0, 0);
    s.restore();
  });
}
// cloud banks in plaza world space (x, y = top-left, w, h, seed, drift px/s)
const BANKS = [
  [-420, -1150, 1900, 380, 61, 2.0],
  [-300, -830, 1700, 360, 63, 3.0],
  [-520, -520, 2000, 340, 67, 4.0],
  [-260, -250, 1600, 280, 71, 5.0],
];
function shotCrane(g, t, p) {
  const e = K.ease.inOut(K.seg(t, 0, 8.6));
  const d = (1 - e) * 1300; // the plaza is still this far below us
  const cam = { x: 456, y: 352, zoom: 1.18, shakeT: t, shakeAmt: 0.6 };
  K.withCamera(g, W, H, cam, () => {
    g.save();
    g.translate(0, d);
    plazaSky(g, HZ, t, { tall: true });
    drawPlaza(g, t);
    K.fog(g, W, H, { y: HZ + 20, h: 70, color: HAZE, alpha: 0.3, t, seed: 4 });
    g.restore();
  });
  // all vapour goes through ONE half-resolution layer (soft by nature; 1/4 of the fill cost)
  const M = K.layer(W / 2, H / 2, "f01-mist");
  const m = M.g;
  m.scale(0.5, 0.5);
  K.withCamera(m, W, H, cam, () => {
    m.translate(0, d);
    for (const [x, y, w, h, seed, drift] of BANKS) {
      if (y + d + h < -200 || y + d > 900) continue;
      m.drawImage(cloudBank(seed, Math.round(w / h)), x + t * drift, y, w, h);
    }
  });
  // two near passes we sink through (parallax: they rush up past the lens faster than the world)
  const near = (seed, base, par, sc, alpha, drift) => {
    const y = base - (1300 - d) * par;
    const bw = 1500 * sc, bh = 500 * sc;
    if (y + bh * 0.5 < 0 || y - bh * 0.5 > H) return;
    m.globalAlpha = alpha;
    m.drawImage(cloudBank(seed, 3), -bw * 0.2 + t * drift - 60, y - bh * 0.5, bw, bh);
    m.globalAlpha = 1;
  };
  near(43, 330, 1.15, 1.2, 0.85, 5);
  near(47, 600, 1.6, 1.7, 0.9, 8);
  g.drawImage(M.canvas, 0, 0, W, H);
  const sunY = (SUN.y + d - 352) * 1.18 + 270;
  const sun = { x: (SUN.x - 456) * 1.18 + 480, y: sunY };
  K.godRays(g, sun.x, sun.y, W, H, { color: "#ffd8b0", count: 9, strength: 0.1 * e, t, angle: -0.25, spread: 1.0, length: 1300, seed: 4 });
  const ta = K.env(t, 1.8, 6.2, 1.0, 1.2);
  if (ta > 0) {
    const ty = H * 0.42;
    g.fillStyle = lin(g, 0, ty - 90, 0, ty + 70, [[0, "rgba(30,20,36,0)"], [0.5, `rgba(30,20,36,${0.22 * ta})`], [1, "rgba(30,20,36,0)"]]);
    g.fillRect(0, ty - 90, W, 160);
    K.title(g, W, H, "The Plaza of Lost Cats", "Chapter 1", ta, { y: ty, size: 54, glow: "#1a0c14", color: "#f4efe6" });
  }
}

// ================================================================================================
// shot 2 [9-17]: over your shoulder - the lost cats on the fountain rim
// ================================================================================================
const RIM = (a) => [FX + 236 * Math.cos(a), FY + 4 + 47 * Math.sin(a)];
// rim cats are cached per quantised pose; their key/rim lights are remapped into sprite space.
// Each sits ON the stone with a soft occlusion ellipse (and the kit's cast shadow) under it.
function rimCat(g, x, y, size, opts, key) {
  const w = Math.ceil(size * 4.6), h = Math.ceil(size * 3.4), ax = w * 0.42, ay = h * 0.8;
  const spr = TSPR("f01-rimcat:" + key + ":" + size, w, h, (s) => {
    const o = Object.assign({}, opts, { t: 0, autoBlink: false, breath: 0 });
    for (const k of ["key", "rim"]) if (o[k]) o[k] = Object.assign({}, o[k], { x: o[k].x - x + ax, y: o[k].y - y + ay });
    K.drawCat(s, ax, ay, size, o);
  });
  const lw = size * (opts.pose === "loaf" ? 0.95 : 0.62);
  K.shadowBlob(g, x + (opts.facing || 1) * size * 0.08, y + 0.5, lw, size * 0.075, { alpha: 0.85, color: "#1c1418", soft: 0.45 });
  g.drawImage(spr, x - ax, y - ay, w, h);
}
const CAT_LIGHT = {
  key: { x: -260, y: 300, color: "#ffcf98", strength: 1.35 },
  rim: { x: -200, y: 250, color: "#ffc480", strength: 1.2 },
  fill: "#4a5878", ambient: "#8090b8", ambientK: 0.2, backlit: 0.55, castShadow: 0.75, ground: "#2e2834",
  collar: false, bell: false, lod: 2,
};
function rimCats(g, t, front) {
  const L = CAT_LIGHT;
  if (!front) {
    // calico curled up on the FAR rim (behind the water, never on it)
    const [cx, cy] = RIM(-1.25);
    const cb = K.env(t, 13, 13.4, 0.1, 0.1) > 0.5 ? 1 : 0.35;
    rimCat(g, cx, cy + 1, 34, Object.assign({}, L, { pose: "loaf", facing: 1, coat: K.COATS.calico, headTurn: 0.6, blink: cb }), "calico2" + cb);
    return;
  }
  const [gx, gy] = RIM(2.62);
  // grey tabby washing: head down and turned, a slow rhythmic lick
  const lick = q(0.45 + 0.12 * Math.sin(t * 5.5), 0.06);
  rimCat(g, gx, gy, 42, Object.assign({}, L, { pose: "sit", facing: 1, coat: K.COATS.grey, headTurn: 0.55, headTilt: lick, blink: 0.7, tail: 0.45 }), "grey" + lick);
  const [bx, by] = RIM(0.5);
  // black cat: a big slow yawn peaking around 13 s
  const yawn = q(K.env(t, 11.6, 14.0, 0.8, 0.8), 0.1);
  rimCat(g, bx, by, 44, Object.assign({}, L, { pose: "sit", facing: -1, coat: K.COATS.black, headTurn: 0.7, headTilt: 0.45 * yawn, mouth: yawn, blink: 0.15 + 0.85 * yawn, ears: -0.35 * yawn }), "black" + yawn);
  const [sx, sy] = RIM(0.95);
  rimCat(g, sx, sy, 38, Object.assign({}, L, { pose: "sit", facing: 1, coat: K.COATS.siamese, headTurn: 0.75, tail: 0.6 }), "siamese");
}

// you, in the near foreground with your back to us: a real back-of-person silhouette, baked once.
// Backlit golden hour: the figure sits ~1.5 stops under the plaza (near-silhouette, cool-toned),
// with a warm rim where the low sun (behind-left) catches the hair and the shoulder line. Hair is
// a rounded mass of fbm-clumped strands; a dark charcoal hoodie with its hood bunched at the nape
// (2-3 crease strokes + a cached fabric weave). Slightly soft (the lens focuses on the cats).
const KID_W = 360, KID_H = 480;
function kidBackSprite() {
  return TSPR("f01-kidback", KID_W, KID_H, (s) => {
    const PX = K.pixelScale();
    const L = K.makeCanvas(Math.ceil(KID_W * PX), Math.ceil(KID_H * PX));
    const c = L.getContext("2d");
    c.scale(PX, PX);
    const R = K.rng("f01-kidback");
    const hx = 158, hy = 128; // head centre
    // ---- torso + shoulders (sloped, slightly asymmetric: weight on one leg) ----
    const body = new Path2D();
    body.moveTo(-40, KID_H + 10);
    body.lineTo(-40, 352);
    body.bezierCurveTo(-10, 300, 30, 268, 92, 250);
    body.bezierCurveTo(112, 244, 126, 228, 132, 214);
    body.lineTo(186, 214);
    body.bezierCurveTo(194, 230, 210, 244, 232, 252);
    body.bezierCurveTo(296, 270, 338, 300, 372, 346);
    body.lineTo(372, KID_H + 10);
    body.closePath();
    c.fillStyle = "#1d2029";
    c.fill(body);
    inside(c, body, (b) => {
      K.texRect(b, "fabric", -40, 200, KID_W + 80, KID_H, { scale: 26, alpha: 0.55, mode: "overlay", tex: { seed: 3, color: "#5a6070", weave: 1.1 } });
      // broad form: the back is a curved surface - a touch lighter across the shoulder blades
      const fg = b.createRadialGradient(hx, 330, 20, hx, 330, 230);
      fg.addColorStop(0, "rgba(70,78,96,0.32)"); fg.addColorStop(1, "rgba(0,0,0,0)");
      b.fillStyle = fg; b.fillRect(-40, 200, KID_W + 80, KID_H);
      b.fillStyle = lin(b, 0, 260, 0, KID_H, [[0, "rgba(0,0,0,0)"], [1, "rgba(6,8,14,0.55)"]]);
      b.fillRect(-40, 200, KID_W + 80, KID_H);
      // fabric creases: a diagonal drag from the shoulder, a fold under the arm, a seam
      b.lineCap = "round";
      for (const [pts, wdt, a] of [
        [[30, 300, 70, 360, 92, 470], 7, 0.5], [[300, 318, 258, 372, 250, 470], 6, 0.45], [[120, 300, 150, 340, 140, 420], 4, 0.3],
      ]) {
        b.strokeStyle = `rgba(4,5,9,${a})`;
        b.lineWidth = wdt;
        b.filter = "blur(2px)";
        b.beginPath(); b.moveTo(pts[0], pts[1]); b.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]); b.stroke();
        b.strokeStyle = "rgba(120,130,150,0.12)"; b.lineWidth = wdt * 0.5;
        b.beginPath(); b.moveTo(pts[0] - 5, pts[1]); b.quadraticCurveTo(pts[2] - 6, pts[3], pts[4] - 6, pts[5]); b.stroke();
        b.filter = "none";
      }
      // warm rim along the left shoulder line (the sun is low, behind-left)
      b.save();
      b.filter = "blur(3px)";
      b.globalCompositeOperation = "lighter";
      b.strokeStyle = "rgba(255,170,100,0.55)";
      b.lineWidth = 7;
      b.beginPath(); b.moveTo(-40, 354); b.bezierCurveTo(-10, 302, 30, 270, 92, 252); b.bezierCurveTo(110, 246, 124, 232, 130, 216); b.stroke();
      b.strokeStyle = "rgba(255,170,100,0.18)";
      b.beginPath(); b.moveTo(232, 254); b.bezierCurveTo(296, 272, 338, 302, 372, 348); b.stroke();
      b.restore();
    });
    // ---- the hood, bunched at the nape: a thick rolled collar of fabric with folds ----
    const hood = new Path2D();
    hood.moveTo(78, 258);
    hood.bezierCurveTo(84, 222, 120, 198, 160, 198);
    hood.bezierCurveTo(204, 198, 236, 222, 244, 260);
    hood.bezierCurveTo(232, 300, 196, 318, 160, 318);
    hood.bezierCurveTo(122, 318, 88, 298, 78, 258);
    hood.closePath();
    c.fillStyle = "#22262f";
    c.fill(hood);
    inside(c, hood, (b) => {
      K.texRect(b, "fabric", 60, 190, 200, 140, { scale: 22, alpha: 0.6, mode: "overlay", tex: { seed: 4, color: "#5a6070", weave: 1.2 } });
      const hg = b.createRadialGradient(150, 236, 10, 160, 262, 96);
      hg.addColorStop(0, "rgba(90,98,118,0.3)"); hg.addColorStop(0.6, "rgba(0,0,0,0)"); hg.addColorStop(1, "rgba(4,5,10,0.6)");
      b.fillStyle = hg; b.fillRect(60, 190, 200, 140);
      // 3 crease strokes in the hood's fabric
      b.lineCap = "round";
      b.filter = "blur(1.5px)";
      for (const [x0, y0, x1, y1, x2, y2, wd] of [[98, 262, 128, 292, 166, 302, 5], [222, 250, 206, 282, 176, 296, 4.5], [140, 214, 160, 244, 150, 276, 3.5]]) {
        b.strokeStyle = "rgba(3,4,8,0.62)"; b.lineWidth = wd;
        b.beginPath(); b.moveTo(x0, y0); b.quadraticCurveTo(x1, y1, x2, y2); b.stroke();
        b.strokeStyle = "rgba(140,150,170,0.14)"; b.lineWidth = wd * 0.5;
        b.beginPath(); b.moveTo(x0 - 3, y0 - 4); b.quadraticCurveTo(x1 - 3, y1 - 4, x2 - 3, y2 - 4); b.stroke();
      }
      b.filter = "none";
      // the rim catches the hood's upper-left roll
      b.save(); b.filter = "blur(2.5px)"; b.globalCompositeOperation = "lighter";
      b.strokeStyle = "rgba(255,176,110,0.45)"; b.lineWidth = 5;
      b.beginPath(); b.moveTo(80, 256); b.bezierCurveTo(86, 224, 120, 202, 158, 200); b.stroke();
      b.restore();
    });
    // occlusion: the head sits down into the hood
    K.shadowBlob(c, hx + 2, 214, 50, 16, { alpha: 0.8, color: "#040408", soft: 0.6 });
    // ---- the head: a rounded hair mass ----
    const hair = new Path2D();
    hair.moveTo(hx - 60, hy + 40);
    hair.bezierCurveTo(hx - 72, hy - 18, hx - 46, hy - 82, hx + 4, hy - 84);
    hair.bezierCurveTo(hx + 54, hy - 84, hx + 74, hy - 30, hx + 66, hy + 30);
    hair.bezierCurveTo(hx + 62, hy + 72, hx + 40, hy + 96, hx + 4, hy + 100);
    hair.bezierCurveTo(hx - 34, hy + 98, hx - 56, hy + 76, hx - 60, hy + 40);
    hair.closePath();
    c.fillStyle = "#1a110b";
    c.fill(hair);
    inside(c, hair, (b) => {
      // strands: fbm-clumped curves flowing from the crown (just above-left of centre) to the ends
      const cx0 = hx - 6, cy0 = hy - 70;
      for (let i = 0; i < 520; i++) {
        const a = Math.PI * (0.02 + 0.96 * R());
        const clump = fbm2(a * 2.2, 0.5, 9, 3);
        const ang = a + clump * 0.35;
        const len = 120 + R() * 70;
        const x1 = cx0 - Math.cos(ang) * len * 0.62, y1 = cy0 + Math.sin(ang) * len * 0.5 + 40;
        const x2 = cx0 - Math.cos(ang) * len * 0.82, y2 = cy0 + Math.sin(ang) * len + 30;
        const tone = R();
        b.strokeStyle = tone < 0.3 ? "rgba(8,5,3,0.55)" : tone < 0.75 ? "rgba(58,38,24,0.45)" : "rgba(96,66,42,0.4)";
        b.lineWidth = 0.6 + R() * 1.3;
        b.beginPath(); b.moveTo(cx0 + (R() - 0.5) * 8, cy0 + (R() - 0.5) * 6); b.quadraticCurveTo(x1, y1, x2, y2); b.stroke();
      }
      // form: the crown takes a little skylight, the nape falls into shadow
      const sg = b.createRadialGradient(hx - 18, hy - 50, 6, hx, hy, 110);
      sg.addColorStop(0, "rgba(120,110,120,0.22)"); sg.addColorStop(0.5, "rgba(0,0,0,0)"); sg.addColorStop(1, "rgba(0,0,0,0.5)");
      b.fillStyle = sg; b.fillRect(hx - 90, hy - 100, 180, 210);
      // backlit hair: translucent warm glow at the left/top edge (light passing through the strands)
      b.save();
      b.globalCompositeOperation = "lighter";
      b.filter = "blur(4px)";
      b.strokeStyle = "rgba(255,150,70,0.6)";
      b.lineWidth = 12;
      b.beginPath(); b.moveTo(hx - 58, hy + 50); b.bezierCurveTo(hx - 72, hy - 18, hx - 46, hy - 82, hx + 4, hy - 84); b.bezierCurveTo(hx + 40, hy - 84, hx + 58, hy - 60, hx + 66, hy - 30); b.stroke();
      b.filter = "blur(1.2px)";
      b.strokeStyle = "rgba(255,206,140,0.75)";
      b.lineWidth = 3;
      b.beginPath(); b.moveTo(hx - 59, hy + 34); b.bezierCurveTo(hx - 71, hy - 18, hx - 46, hy - 81, hx + 4, hy - 83); b.stroke();
      b.restore();
    });
    // flyaway strands outside the silhouette, lit gold against the sky
    c.save();
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 46; i++) {
      const a = Math.PI * (0.55 + 0.6 * R());
      const r0 = 76 + R() * 6;
      const x0 = hx + Math.cos(a) * 62, y0 = hy - 8 + Math.sin(a) * r0;
      const dx = (R() - 0.6) * 22, dy = -6 - R() * 16;
      c.strokeStyle = `rgba(255,${190 + R() * 40},${120 + R() * 40},${0.18 + R() * 0.3})`;
      c.lineWidth = 0.5 + R() * 0.6;
      c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 + dx * 0.6, y0 + dy * 0.2, x0 + dx, y0 + dy); c.stroke();
    }
    c.restore();
    // soft: just in front of the focal plane
    blurInto(s, L, 1.4, 0, 0, KID_W, KID_H);
  });
}
function shotShoulder(g, t, p) {
  const e = K.ease.inOut(p);
  const cam = { x: K.lerp(468, 492, e), y: K.lerp(318, 324, e), zoom: 1.3 + 0.05 * e, shakeT: t, shakeAmt: 0.9 };
  K.withCamera(g, W, H, cam, () => {
    plazaSky(g, HZ, t);
    g.drawImage(plazaBack(), 0, BACK_Y, W, H - BACK_Y);
    rimCats(g, t, false);
    plazaLive(g, t);
    g.drawImage(plazaFront(), 0, BACK_Y, W, H - BACK_Y);
    rimCats(g, t, true);
    K.fog(g, W, H, { y: FY - 20, h: 70, color: "#f6e6e0", alpha: 0.12, t, seed: 11 });
    K.godRays(g, SUN.x, SUN.y, W, H, { color: "#ffd8b0", count: 8, strength: 0.1, t, angle: 0.12, spread: 0.5, length: 1100, seed: 7 });
    K.dust(g, W, H, t, { seed: 5, color: "#ffe8c8", count: 26, area: [200, 220, 600, 240], alpha: 0.45, size: 1.4 });
  });
  // you, in the foreground (breathing: the shoulders rise a hair; a slow weight shift)
  const br = Math.sin(t * 1.7) * 0.5 + 0.5;
  g.save();
  g.translate(-62 + Math.sin(t * 0.45) * 2.5 + e * 8, 556);
  g.scale(1, 1 + 0.006 * br);
  g.rotate(Math.sin(t * 0.45 + 1) * 0.006);
  g.drawImage(kidBackSprite(), 0, -KID_H + 8, KID_W, KID_H);
  g.restore();
}
// ================================================================================================
// shot 3 [17-24]: insert - the bell on your wrist (plaza far behind, wide open aperture)
// ================================================================================================
function wristBg() {
  // (defocused plates are baked at half resolution: the blur hides it and costs a quarter)
  return TSPR("f01-wristbg3", W / 2, H / 2, (s) => {
    s.scale(0.5, 0.5);
    const cv = K.makeCanvas(Math.ceil(W * K.pixelScale()), Math.ceil(H * K.pixelScale()));
    const c = cv.getContext("2d");
    c.scale(K.pixelScale(), K.pixelScale());
    K.withCamera(c, W, H, { x: 540, y: 300, zoom: 1.7 }, () => {
      plazaSky(c, HZ, 3, { sun: false });
      drawPlaza(c, 3, { jets: false });
    });
    blurInto(s, cv, 5 * K.pixelScale(), 0, 0, W, H);
  });
}

// ---- the hand (baked once): the back of a child's left hand, fingers up, against the low sun ------
// Each finger is a chain of tapered capsules (proximal / middle / distal phalanx) with knuckle bulges,
// wrinkle creases over the joints and a nail plate (lunula, cuticle, free edge, specular streak). The
// sun is behind the hand: the side we see is in cool fill, while light scatters through the thin
// tissue at the finger edges and tips (subsurface: a red-orange glow). Extensor tendons, a soft
// thenar crease where the thumb meets the hand, a knitted sleeve cuff, and the red cord tied round
// the wrist - wrapping it (its back half hidden by the wrist), pressing in, with occlusion.
const HAND_W = 300, HAND_H = 640, WRIST = [150, 432];
const FINGERS = [
  // knuckle x, y, angle (0 = straight up, + leans right), phalanx lengths, base width, tip width
  { x: 94, y: 318, a: -0.15, L: [44, 28, 23], w0: 23, w1: 17 },   // little
  { x: 124, y: 300, a: -0.05, L: [58, 37, 27], w0: 26, w1: 19.5 }, // ring
  { x: 156, y: 294, a: 0.03, L: [62, 40, 29], w0: 27.5, w1: 20.5 },// middle
  { x: 188, y: 304, a: 0.12, L: [56, 36, 27], w0: 26, w1: 19.5 },  // index
];
function fingerJoints(f) {
  // relaxed: each joint flexes a little toward us (foreshortened) and curls in
  const pts = [[f.x, f.y]];
  let a = f.a, x = f.x, y = f.y;
  const flex = [0.0, 0.06, 0.1];
  const fs = [1, 0.95, 0.88];
  for (let k = 0; k < 3; k++) {
    a += flex[k] * Math.sign(-f.a || 1) * 0.6;
    x += Math.sin(a) * f.L[k] * fs[k];
    y -= Math.cos(a) * f.L[k] * fs[k];
    pts.push([x, y]);
  }
  return pts;
}
function capsule(p, x0, y0, x1, y1, r0, r1) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l, ny = dx / l;
  const a = Math.atan2(dy, dx);
  p.moveTo(x0 + nx * r0, y0 + ny * r0);
  p.lineTo(x1 + nx * r1, y1 + ny * r1);
  p.arc(x1, y1, r1, a + Math.PI / 2, a - Math.PI / 2, true);
  p.lineTo(x0 - nx * r0, y0 - ny * r0);
  p.arc(x0, y0, r0, a - Math.PI / 2, a + Math.PI / 2, true);
  p.closePath();
}
function handSprite() {
  return hiSprite("f01-hand3", HAND_W, HAND_H, (g) => {
    const R = K.rng("f01-hand");
    const SKIN = "#6c4436", SKIN_L = "#9a6a54", SKIN_D = "#4e2e24";
    // ---- knitted sleeve cuff (dark, muted olive) ----
    const sleeve = new Path2D();
    sleeve.moveTo(84, HAND_H + 4); sleeve.lineTo(92, 452); sleeve.quadraticCurveTo(150, 436, 210, 452); sleeve.lineTo(222, HAND_H + 4); sleeve.closePath();
    // ---- hand silhouette: back of hand + thumb + fingers ----
    const hand = new Path2D();
    hand.moveTo(108, 462);
    hand.bezierCurveTo(100, 420, 82, 372, 80, 330);
    hand.bezierCurveTo(80, 310, 100, 296, 124, 290);
    hand.bezierCurveTo(150, 282, 184, 286, 202, 300);
    hand.bezierCurveTo(212, 330, 214, 360, 212, 386);
    hand.bezierCurveTo(206, 420, 196, 446, 192, 462);
    hand.closePath();
    const thumbJ = [[200, 404], [232, 360], [252, 326]];
    const thumb = new Path2D();
    capsule(thumb, thumbJ[0][0], thumbJ[0][1], thumbJ[1][0], thumbJ[1][1], 19, 15.5);
    capsule(thumb, thumbJ[1][0], thumbJ[1][1], thumbJ[2][0], thumbJ[2][1], 15.5, 12.5);
    const fingerPaths = FINGERS.map((f) => {
      const J = fingerJoints(f), p = new Path2D();
      const wv = (k) => K.lerp(f.w0, f.w1, k / 3) / 2;
      for (let k = 0; k < 3; k++) capsule(p, J[k][0], J[k][1], J[k + 1][0], J[k + 1][1], wv(k) * (k ? 1.03 : 1), wv(k + 1));
      // knuckle bulges over the PIP and DIP joints
      p.ellipse(J[1][0], J[1][1], wv(1) * 1.07, wv(1) * 0.9, f.a, 0, K.TAU);
      p.ellipse(J[2][0], J[2][1], wv(2) * 1.04, wv(2) * 0.85, f.a, 0, K.TAU);
      return { f, J, p, wv };
    });
    // paint: thumb (behind the hand edge), hand, fingers (little first)
    const skinFill = (p) => {
      g.fillStyle = SKIN; g.fill(p);
      K.texFill(g, "relief", p, { scale: 60, alpha: 0.45, mode: "soft-light", tex: { seed: 21 } });
      K.texFill(g, "noise", p, { scale: 34, alpha: 0.12, mode: "overlay", tex: { seed: 22, amp: 40 } });
      // blood under thin skin: knuckles and fingertips a touch redder
      inside(g, p, (c) => { c.fillStyle = "rgba(150,40,30,0.08)"; c.fillRect(0, 0, HAND_W, 330); });
    };
    skinFill(thumb);
    inside(g, thumb, (c) => {
      c.fillStyle = lin(c, 200, 330, 260, 400, [[0, "rgba(255,120,70,0.25)"], [0.5, "rgba(0,0,0,0)"], [1, "rgba(20,10,10,0.35)"]]);
      c.fillRect(170, 300, 110, 130);
    });
    skinFill(hand);
    inside(g, hand, (c) => {
      // form: the back of the hand is a gentle dome - skylight on the upper middle, edges falling off
      const dg = c.createRadialGradient(146, 350, 10, 146, 360, 110);
      dg.addColorStop(0, "rgba(170,150,160,0.16)"); dg.addColorStop(0.6, "rgba(0,0,0,0)"); dg.addColorStop(1, "rgba(20,8,8,0.4)");
      c.fillStyle = dg; c.fillRect(60, 270, 180, 210);
      // extensor tendons fanning from the wrist to each knuckle (lit ridge + shadow groove)
      for (const f of FINGERS) {
        c.lineCap = "round";
        c.strokeStyle = "rgba(190,150,140,0.04)"; c.lineWidth = 4;
        c.beginPath(); c.moveTo(150 + (f.x - 150) * 0.25, 446); c.quadraticCurveTo(150 + (f.x - 150) * 0.6, 380, f.x, f.y + 10); c.stroke();
        c.strokeStyle = "rgba(30,14,10,0.06)"; c.lineWidth = 2;
        c.beginPath(); c.moveTo(153 + (f.x - 150) * 0.25, 446); c.quadraticCurveTo(153 + (f.x - 150) * 0.6, 380, f.x + 3, f.y + 10); c.stroke();
      }
      // a faint blue vein
      c.strokeStyle = "rgba(70,80,120,0.16)"; c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(128, 440); c.bezierCurveTo(124, 410, 138, 384, 132, 352); c.stroke();
      // the thenar crease where the thumb joins
      c.strokeStyle = "rgba(40,18,14,0.5)"; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(206, 372); c.quadraticCurveTo(198, 398, 202, 424); c.stroke();
      // MCP knuckles: rounded bulges catching the skylight, dimples between them
      for (const f of FINGERS) {
        const kg = c.createRadialGradient(f.x - 2, f.y + 4, 1, f.x, f.y + 6, f.w0 * 0.62);
        kg.addColorStop(0, "rgba(196,160,150,0.34)"); kg.addColorStop(1, "rgba(196,160,150,0)");
        c.fillStyle = kg; c.fillRect(f.x - 20, f.y - 14, 40, 40);
      }
      for (let k = 0; k < 3; k++) {
        const a = FINGERS[k], b = FINGERS[k + 1];
        K.shadowBlob(c, (a.x + b.x) / 2, (a.y + b.y) / 2 + 12, 4, 6, { alpha: 0.22, color: "#2a120c" });
      }
      // occlusion at the cuff
      c.fillStyle = lin(c, 0, 420, 0, 462, [[0, "rgba(0,0,0,0)"], [1, "rgba(20,10,8,0.5)"]]);
      c.fillRect(60, 420, 180, 44);
    });
    for (const { f, J, p, wv } of fingerPaths) {
      // occlusion cast onto the hand / neighbour where each finger rises
      K.shadowBlob(g, J[0][0], J[0][1] + 2, wv(0) * 1.1, 5, { alpha: 0.35, color: "#2a120c" });
      skinFill(p);
      inside(g, p, (c) => {
        // cylinder shading across the finger: cool fill in the middle, dark flanks
        for (let k = 0; k < 3; k++) {
          const [x0, y0] = J[k], [x1, y1] = J[k + 1];
          const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
          const r = wv(k) * 1.15, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
          const cg = c.createLinearGradient(mx - nx * r, my - ny * r, mx + nx * r, my + ny * r);
          cg.addColorStop(0, "rgba(30,12,10,0.42)"); cg.addColorStop(0.32, "rgba(180,160,170,0.1)"); cg.addColorStop(0.62, "rgba(0,0,0,0)"); cg.addColorStop(1, "rgba(30,12,10,0.5)");
          c.fillStyle = cg;
          c.beginPath(); capsule(c, x0, y0, x1, y1, r + 2, r + 2); c.fill();
        }
        // wrinkle creases over the PIP (3 lines) and DIP (2 lines) joints
        c.lineCap = "round";
        for (const [jk, n, sp] of [[1, 3, 3.2], [2, 2, 2.6]]) {
          const [jx, jy] = J[jk], ww = wv(jk);
          const a = Math.atan2(J[jk + 1][1] - jy, J[jk + 1][0] - jx) + Math.PI / 2;
          for (let i = 0; i < n; i++) {
            const o2 = (i - (n - 1) / 2) * sp;
            const cx = jx + Math.cos(a - Math.PI / 2) * o2, cy = jy + Math.sin(a - Math.PI / 2) * o2;
            const hw = ww * (0.55 - Math.abs(i - (n - 1) / 2) * 0.12);
            c.strokeStyle = "rgba(40,16,12,0.3)"; c.lineWidth = 0.8;
            c.beginPath();
            c.moveTo(cx - Math.cos(a) * hw, cy - Math.sin(a) * hw);
            c.quadraticCurveTo(cx, cy - 1.6, cx + Math.cos(a) * hw, cy + Math.sin(a) * hw);
            c.stroke();
            c.strokeStyle = "rgba(200,170,160,0.16)"; c.lineWidth = 0.7;
            c.beginPath();
            c.moveTo(cx - Math.cos(a) * hw, cy - Math.sin(a) * hw + 1);
            c.quadraticCurveTo(cx, cy - 0.6, cx + Math.cos(a) * hw, cy + Math.sin(a) * hw + 1);
            c.stroke();
          }
        }
        // the nail plate on the distal phalanx
        const [x2, y2] = J[2], [x3, y3] = J[3];
        const na = Math.atan2(y3 - y2, x3 - x2);
        const nw = wv(3) * 0.66, nl = Math.hypot(x3 - x2, y3 - y2) * 0.62;
        c.save();
        c.translate(x3 - Math.cos(na) * (nl * 0.5 + 1), y3 - Math.sin(na) * (nl * 0.5 + 1));
        c.rotate(na);
        const np = new Path2D();
        np.moveTo(-nl / 2, -nw); np.lineTo(nl * 0.32, -nw * 1.02); np.quadraticCurveTo(nl * 0.62, 0, nl * 0.32, nw * 1.02); np.lineTo(-nl / 2, nw);
        np.quadraticCurveTo(-nl * 0.62, 0, -nl / 2, -nw); np.closePath();
        c.fillStyle = "#8a6458"; c.fill(np);
        inside(c, np, (n) => {
          n.fillStyle = lin(n, 0, -nw, 0, nw, [[0, "rgba(40,20,20,0.35)"], [0.4, "rgba(255,230,230,0.08)"], [1, "rgba(40,20,20,0.4)"]]);
          n.fillRect(-nl, -nw * 1.2, nl * 2, nw * 2.4);
          // lunula (pale crescent at the base) and the free edge at the tip
          n.fillStyle = "rgba(220,190,186,0.18)";
          n.beginPath(); n.ellipse(-nl / 2, 0, nl * 0.2, nw * 0.7, 0, -Math.PI / 2, Math.PI / 2); n.fill();
          n.fillStyle = "rgba(220,196,182,0.22)";
          n.fillRect(nl * 0.26, -nw * 1.1, nl * 0.4, nw * 2.2);
          // specular streak (the sky reflected in the curved plate)
          n.fillStyle = "rgba(255,246,236,0.3)";
          n.beginPath(); n.ellipse(-nl * 0.05, -nw * 0.35, nl * 0.32, nw * 0.13, 0, 0, K.TAU); n.fill();
        });
        // cuticle line
        c.strokeStyle = "rgba(50,22,18,0.55)"; c.lineWidth = 0.9;
        c.beginPath(); c.moveTo(-nl / 2, -nw); c.quadraticCurveTo(-nl * 0.62, 0, -nl / 2, nw); c.stroke();
        c.restore();
      });
    }
    // subsurface: the sun behind the hand glows through every thin edge (finger sides, tips, the
    // web between thumb and index) - a red-orange band just inside the silhouette, brightest up-left
    // volume: every finger, the thumb and the back of the hand round off into shadow at their sides
    // (soft skylight from the front-left), and the edges toward the sun behind transmit red light
    {
      const sp = g.canvas.width / HAND_W;
      formLight(g.canvas, Math.max(2, Math.round(6 * sp)), { lx: -0.45, ly: -0.6, lz: 0.65, k: 0.85, fill: [34, 16, 14], sss: [236, 96, 52], sssK: 0.5 });
    }
    // (each part filled separately: a combined Path2D would cancel where opposite windings overlap)
    const fillAll = (c) => { c.fill(hand); c.fill(thumb); for (const { p } of fingerPaths) c.fill(p); };
    const sss = K.makeCanvas(Math.ceil(HAND_W * SS), Math.ceil(HAND_H * SS));
    const sc = sss.getContext("2d");
    sc.scale(SS, SS);
    sc.fillStyle = "#000"; fillAll(sc);
    sc.globalCompositeOperation = "source-out"; // the OUTSIDE of the hand, blurred inward = an edge band
    sc.fillStyle = "#d8441e"; sc.fillRect(0, 0, HAND_W, HAND_H);
    const band = K.makeCanvas(sss.width, sss.height), bc = band.getContext("2d");
    bc.filter = `blur(${K.qblur((5 * SS).toFixed(1))}px)`;
    bc.drawImage(sss, 0, 0);
    bc.filter = "none";
    bc.globalCompositeOperation = "destination-in";
    bc.scale(SS, SS);
    bc.fillStyle = "#000"; fillAll(bc);
    // stronger toward the sun (upper left), weaker toward the wrist
    bc.globalCompositeOperation = "destination-in";
    bc.fillStyle = lin(bc, 40, 120, 240, 470, [[0, "rgba(0,0,0,1)"], [0.6, "rgba(0,0,0,0.6)"], [1, "rgba(0,0,0,0.1)"]]);
    bc.fillRect(0, 0, HAND_W, HAND_H);
    g.save();
    g.globalCompositeOperation = "screen";
    g.globalAlpha = 0.42;
    g.filter = "blur(1.5px)";
    g.drawImage(band, 0, 0, HAND_W, HAND_H);
    g.restore();
    // a hairline of hot rim right on the sun-side edges of the fingertips
    g.save();
    g.globalCompositeOperation = "lighter";
    for (const { J, wv } of fingerPaths) {
      const [x3, y3] = J[3];
      g.strokeStyle = "rgba(255,190,120,0.55)"; g.lineWidth = 1.4;
      g.beginPath(); g.arc(x3, y3, wv(3) - 0.6, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
    }
    g.restore();
    // ---- the sleeve cuff (in front of the wrist) ----
    g.fillStyle = "#34352e"; g.fill(sleeve);
    inside(g, sleeve, (c) => {
      K.texRect(c, "fabric", 80, 430, 150, 220, { scale: 14, alpha: 0.7, mode: "overlay", tex: { seed: 8, color: "#7a7a68", weave: 1.4 } });
      // knit ribs
      for (let x = 86; x < 226; x += 5.2) {
        c.strokeStyle = "rgba(10,10,8,0.35)"; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(x, 448); c.lineTo(x + (x - 150) * 0.08, HAND_H); c.stroke();
        c.strokeStyle = "rgba(160,160,140,0.12)"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x + 2, 448); c.lineTo(x + 2 + (x - 150) * 0.08, HAND_H); c.stroke();
      }
      c.fillStyle = lin(c, 84, 0, 222, 0, [[0, "rgba(255,170,110,0.18)"], [0.25, "rgba(0,0,0,0)"], [0.8, "rgba(0,0,0,0.2)"], [1, "rgba(0,0,0,0.5)"]]);
      c.fillRect(80, 430, 150, 220);
      c.fillStyle = lin(c, 0, 444, 0, 470, [[0, "rgba(255,200,160,0.12)"], [1, "rgba(0,0,0,0)"]]);
      c.fillRect(80, 440, 150, 30);
    });
    // ---- the red cord, wrapped round the wrist (front half only: the back half is behind it) ----
    const cy = 426, wl = 104, wr = 197; // wrist edges at the cord
    const cordPt = (u) => [K.lerp(wl, wr, u), cy + Math.sin(u * Math.PI) * 9 - (u - 0.5) * 2];
    // the skin bulges a hair around it: occlusion above and below the cord
    g.save();
    inside(g, hand, (c) => {
      c.filter = "blur(2px)";
      c.strokeStyle = "rgba(30,10,8,0.6)"; c.lineWidth = 9;
      c.beginPath(); for (let i = 0; i <= 20; i++) { const [x, y] = cordPt(i / 20); if (i) c.lineTo(x, y + 1.5); else c.moveTo(x, y + 1.5); } c.stroke();
      c.filter = "none";
    });
    g.restore();
    // twisted two-ply cord: dark body, lit top, diagonal ply grooves
    const cordPath = new Path2D();
    for (let i = 0; i <= 24; i++) { const [x, y] = cordPt(i / 24); if (i) cordPath.lineTo(x, y); else cordPath.moveTo(x, y); }
    g.lineCap = "butt";
    g.strokeStyle = "#3e0a0e"; g.lineWidth = 6.2; g.stroke(cordPath);
    g.strokeStyle = "#8c1e24"; g.lineWidth = 4.6; g.stroke(cordPath);
    for (let i = 0; i <= 30; i++) {
      const u = i / 30, [x, y] = cordPt(u);
      const fade = Math.sin(u * Math.PI); // the cord turns away from us at the edges: darker there
      g.strokeStyle = `rgba(30,4,6,${0.55})`; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(x - 1.6, y + 2.2); g.lineTo(x + 1.6, y - 2.2); g.stroke();
      g.strokeStyle = `rgba(255,150,140,${0.35 * fade})`; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(x - 0.4, y - 1.8); g.lineTo(x + 1.3, y - 2.2); g.stroke();
    }
    // the ends turning behind the wrist are in the wrist's shadow
    for (const [x, d] of [[wl, 1], [wr, -1]]) {
      g.fillStyle = lin(g, x, 0, x + d * 12, 0, [[0, "rgba(20,4,6,0.85)"], [1, "rgba(20,4,6,0)"]]);
      g.fillRect(Math.min(x, x + d * 12), cy - 6, 12, 14);
    }
    // the knot (front, a little right of centre) with two short tails
    const [kx, ky] = cordPt(0.56);
    g.fillStyle = "#4a0c10"; g.beginPath(); g.ellipse(kx, ky + 1, 6.2, 5.2, 0.3, 0, K.TAU); g.fill();
    g.fillStyle = "#9a2a30"; g.beginPath(); g.ellipse(kx - 0.8, ky, 4.6, 3.8, 0.3, 0, K.TAU); g.fill();
    g.strokeStyle = "rgba(30,4,6,0.6)"; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(kx - 3, ky + 2); g.quadraticCurveTo(kx, ky - 3, kx + 3, ky + 1); g.stroke();
    g.fillStyle = "rgba(255,170,160,0.45)"; g.beginPath(); g.ellipse(kx - 2, ky - 1.6, 1.6, 0.9, 0.3, 0, K.TAU); g.fill();
    for (const [tx, ty] of [[-7, 13], [6, 15]]) {
      g.strokeStyle = "#5a1014"; g.lineWidth = 2.6; g.lineCap = "round";
      g.beginPath(); g.moveTo(kx, ky + 3); g.quadraticCurveTo(kx + tx * 0.4, ky + ty * 0.6, kx + tx, ky + ty); g.stroke();
      g.strokeStyle = "rgba(200,70,70,0.4)"; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(kx - 0.5, ky + 3); g.quadraticCurveTo(kx + tx * 0.4 - 0.5, ky + ty * 0.6, kx + tx - 0.5, ky + ty); g.stroke();
    }
  });
}
// a brass jingle bell (baked once): two pressed hemispheres crimped at the equator, the classic
// cross slot (a curved slot across the lower half with round ends + a meridian slot to the bottom
// pole), an environment-mapped brass finish (bright sky above, a dark horizon band, warm ground
// below) and one hard specular point of the sun.
function bellSprite() {
  return hiSprite("f01-bell2", 64, 76, (g) => {
    const x = 32, y = 42, r = 24;
    const ball = ellPath(x, y, r, r);
    inside(g, ball, (c) => {
      c.fillStyle = lin(c, 0, y - r, 0, y + r, [[0, "#fff0c8"], [0.18, "#e8bc68"], [0.42, "#8a5a1e"], [0.5, "#3a2208"], [0.58, "#5a3a12"], [0.8, "#b07a34"], [1, "#5a3a14"]]);
      c.fillRect(x - r, y - r, r * 2, r * 2);
      // spherical falloff + Fresnel-dark limb
      const rg = c.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r * 1.02);
      rg.addColorStop(0, "rgba(255,236,190,0.12)"); rg.addColorStop(0.72, "rgba(0,0,0,0)"); rg.addColorStop(1, "rgba(24,12,2,0.8)");
      c.fillStyle = rg; c.fillRect(x - r, y - r, r * 2, r * 2);
      K.texRect(c, "metal", x - r, y - r, r * 2, r * 2, { scale: 26, alpha: 0.22, mode: "overlay", tex: { seed: 2, color: "#a07a40", rust: 0.15 } });
      // the reflected window of warm sky, curved by the sphere
      c.fillStyle = "rgba(255,244,214,0.35)";
      c.beginPath(); c.ellipse(x - r * 0.28, y - r * 0.46, r * 0.42, r * 0.2, -0.35, 0, K.TAU); c.fill();
      // rim light from the sun behind-left
      c.strokeStyle = "rgba(255,226,170,0.75)"; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, r - 1, Math.PI * 0.78, Math.PI * 1.3); c.stroke();
      // equator crimp: a pressed seam ridge (shadow under, glint over), just above the middle
      c.strokeStyle = "rgba(30,16,2,0.7)"; c.lineWidth = 1.4;
      c.beginPath(); c.ellipse(x, y - r * 0.08, r, r * 0.26, 0, 0.05, Math.PI - 0.05); c.stroke();
      c.strokeStyle = "rgba(255,226,170,0.5)"; c.lineWidth = 0.8;
      c.beginPath(); c.ellipse(x, y - r * 0.13, r, r * 0.26, 0, 0.1, Math.PI - 0.1); c.stroke();
    });
    // the cross slot (dark, with a lit lip on its lower edge and the pea glinting inside)
    const sl = new Path2D();
    sl.ellipse(x, y + r * 0.18, r * 0.66, r * 0.2, 0, 0.12, Math.PI - 0.12);
    g.lineCap = "round";
    g.strokeStyle = "#140a02"; g.lineWidth = 3.4; g.stroke(sl);
    g.fillStyle = "#140a02";
    for (const sx of [-1, 1]) { g.beginPath(); g.arc(x + sx * r * 0.64, y + r * 0.24, 3.1, 0, K.TAU); g.fill(); }
    g.beginPath(); g.moveTo(x, y + r * 0.38); g.quadraticCurveTo(x + 0.6, y + r * 0.7, x, y + r * 0.97); g.lineWidth = 3; g.stroke();
    g.strokeStyle = "rgba(255,214,150,0.45)"; g.lineWidth = 0.8;
    g.beginPath(); g.ellipse(x, y + r * 0.18 + 2, r * 0.64, r * 0.2, 0, 0.3, Math.PI - 0.3); g.stroke();
    g.fillStyle = "rgba(200,150,80,0.6)"; g.fillRect(x - 1.2, y + r * 0.36, 2.4, 1.2);
    // the hanging loop (a wire eye soldered to the top)
    g.strokeStyle = "#5a3a12"; g.lineWidth = 3;
    g.beginPath(); g.arc(x, y - r - 3.5, 4.5, Math.PI * 0.85, Math.PI * 2.15); g.stroke();
    g.strokeStyle = "rgba(255,226,170,0.6)"; g.lineWidth = 1;
    g.beginPath(); g.arc(x, y - r - 3.5, 4.5, Math.PI * 1.1, Math.PI * 1.5); g.stroke();
    // the sun's hard specular point (clipped white: the lens blooms it)
    K.glow(g, x - r * 0.4, y - r * 0.52, 6, "#fff6dc", 0.7);
    g.fillStyle = "#ffffff";
    g.beginPath(); g.arc(x - r * 0.4, y - r * 0.52, 1.8, 0, K.TAU); g.fill();
  });
}
const BOKEH = (() => {
  const R = K.rng("f01-bokeh"), a = [];
  for (let i = 0; i < 9; i++) a.push({ x: 120 + R() * 760, y: 330 + R() * 120, r: 16 + R() * 18, color: R() > 0.5 ? "#fff0d0" : "#ffd8a8", ph: R() * 10 });
  return a;
})();
function shotWrist(g, t, p) {
  const e = K.ease.inOut(p);
  g.save();
  g.translate(-12 * e, -4 * e);
  g.drawImage(wristBg(), -10, -10, W + 30, H + 20);
  g.restore();
  // out-of-focus water sparkle behind the hand (soft discs; they breathe as the water moves)
  K.bokehLights(g, W, H, t, { count: 0, alpha: 0.2, lights: BOKEH.map((b) => ({ x: b.x - 12 * e, y: b.y, r: b.r, color: b.color, alpha: Math.pow(Math.max(0, Math.sin(t * 1.3 + b.ph)), 3) })) });
  const lift = K.ease.out(K.seg(t, 17, 18.1));
  const drift = Math.sin(t * 0.9) * 3 + K.noise(t * 0.7, 3) * 3;
  // macro insert: the wrist and bell fill the lower frame, the fingers run up out of the top
  const wx = 470 + drift, wy = K.lerp(720, 352, lift) + Math.cos(t * 1.1) * 2.5;
  const ang = 0.05 * Math.sin(t * 0.7) - 0.04;
  const HS = 1.05;
  g.save();
  g.translate(wx, wy);
  g.rotate(ang);
  g.scale(HS, HS);
  g.drawImage(handSprite(), -WRIST[0], -WRIST[1], HAND_W, HAND_H);
  // the knot, in screen space (the bell hangs from it)
  g.restore();
  const kl = [0.56 * (197 - 104) + 104 - WRIST[0], 426 + Math.sin(0.56 * Math.PI) * 9 - 0.12 + 3 - WRIST[1]];
  const kx = wx + (kl[0] * Math.cos(ang) - kl[1] * Math.sin(ang)) * HS, ky = wy + (kl[0] * Math.sin(ang) + kl[1] * Math.cos(ang)) * HS;
  // the bell on its short cord: a damped pendulum after you lift it (cue 18)
  const swing = t < 18 ? 0.05 * Math.sin(t * 2) : 0.55 * Math.sin((t - 18) * 7) * Math.exp(-(t - 18) * 0.9) + 0.04 * Math.sin(t * 2);
  const len = 34;
  const bx = kx + Math.sin(swing) * len, by = ky + Math.cos(swing) * len + 14;
  // contact shadow of the bell on the knit sleeve behind it
  K.shadowBlob(g, bx + 6, by + 6, 20, 14, { alpha: 0.55, color: "#0a0604", soft: 0.8 });
  g.strokeStyle = "#5a1014";
  g.lineWidth = 2.2;
  g.lineCap = "round";
  g.beginPath(); g.moveTo(kx, ky); g.quadraticCurveTo((kx + bx) / 2 + swing * 4, (ky + by) / 2, bx, by - 26); g.stroke();
  g.strokeStyle = "rgba(220,90,90,0.35)"; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(kx - 0.6, ky); g.quadraticCurveTo((kx + bx) / 2 + swing * 4 - 0.6, (ky + by) / 2, bx - 0.6, by - 26); g.stroke();
  // motion blur on the fast swing: faint trailing copies along the arc
  const vel = t >= 18 ? Math.abs(Math.cos((t - 18) * 7)) * Math.exp(-(t - 18) * 0.9) : 0;
  const spr = bellSprite();
  for (let k = vel > 0.25 ? 3 : 0; k >= 0; k--) {
    const sw = swing - Math.sign(Math.cos((t - 18) * 7)) * k * 0.035 * vel;
    const x2 = kx + Math.sin(sw) * len, y2 = ky + Math.cos(sw) * len + 14;
    g.save();
    g.globalAlpha = k ? 0.18 : 1;
    g.translate(x2, y2);
    g.rotate(-sw * 0.8);
    g.drawImage(spr, -30, -36, 60, 71);
    g.restore();
  }
  // the ring: the sun's glint flares on the brass as it swings into the light
  const ring = t >= 18 ? Math.exp(-(t - 18) * 1.4) : 0;
  const flare = Math.max(0, Math.sin((t - 18) * 7 + 0.6)) * ring;
  if (flare > 0.02) {
    K.glow(g, bx - 9, by - 12, 22 + 26 * flare, "#fff4d8", 0.5 * flare);
    g.fillStyle = `rgba(255,255,255,${Math.min(1, flare * 1.5)})`;
    g.beginPath(); g.arc(bx - 9, by - 12, 2.2, 0, K.TAU); g.fill();
  }
  K.dust(g, W, H, t, { seed: 9, color: "#fff0d6", count: 18, alpha: 0.45, size: 2.4 });
}

// ================================================================================================
// shot 4 [24-33]: slow pan across the statue's face (he gazes left, toward the green arch)
// ================================================================================================
/// a close-up re-carve of the same statue, framed once into a 1100x640 plate: head and shoulders on
// the right third, gazing left. Big, so the layered cat path gives real sculpted form; then carved.
const SC_S = 560, SC_W = 1100, SC_H = 640;
function statueClose() {
  return TSPR("f01-statue-close5", SC_W, SC_H, (s) => {
    // carved at 0.75x and scaled up (the stone has no fine fur to lose; half the build cost)
    const PXS = K.pixelScale() * 0.75;
    const S = SC_S, bx = 790, by = 300 + 1.41 * S;
    const cv = carveStone(Math.ceil(SC_W * PXS), Math.ceil(SC_H * PXS), S * PXS * 0.32, (cg, blink) => {
      cg.setTransform(PXS, 0, 0, PXS, 0, 0);
      K.drawCat(cg, bx, by, S, {
        pose: "sit", facing: -1, headTurn: 0.5, gaze: 0, blink, t: 0, autoBlink: false, breath: 0,
        coat: blink < 0.5 ? STONE_EYE : STONE_COAT, collar: false, bell: false, shadow: false, pupil: 0.5, tail: 0, lod: 0,
        key: { x: bx - S * 2.6, y: by - S * 2.2, color: "#ffe0bc", strength: 1.15 },
        rim: { x: bx - S * 2.4, y: by - S * 1.2, color: "#ffcf98", strength: 0.7 },
        fill: "#34324a", ambient: "#6a7898", ambientK: 0.16,
      });
      // carved occlusion: under the jaw, where the neck meets the chest; the far side into skylight
      cg.save();
      cg.globalCompositeOperation = "source-atop";
      const ao = (x, y, rx, ry, a) => { cg.save(); cg.translate(x, y); cg.scale(1, ry / rx); const gr = cg.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(28,18,10,${a})`); gr.addColorStop(1, "rgba(28,18,10,0)"); cg.fillStyle = gr; cg.fillRect(-rx, -rx, rx * 2, rx * 2); cg.restore(); };
      ao(bx - 0.18 * S, by - 1.12 * S, 0.3 * S, 0.12 * S, 0.55);
      ao(bx + 0.1 * S, by - 1.0 * S, 0.35 * S, 0.2 * S, 0.3);
      const sg = cg.createLinearGradient(bx - 0.6 * S, 0, bx + 0.5 * S, 0);
      sg.addColorStop(0, "rgba(0,0,0,0)"); sg.addColorStop(0.55, "rgba(30,30,60,0.12)"); sg.addColorStop(1, "rgba(24,24,52,0.5)");
      cg.fillStyle = sg; cg.fillRect(0, 0, SC_W, SC_H);
      cg.restore();
    }, { seed: "statue-close-c", cracks: 2, seedN: 1 });
    s.drawImage(cv, 0, 0, SC_W, SC_H);
  });
}
function statueSkyBg() {
  return TSPR("f01-statue-bg3", (W + 80) / 2, (H + 40) / 2, (s) => {
    s.scale(0.5, 0.5);
    const BW = W + 80, BH = H + 40;
    const PX = K.pixelScale();
    const cv = K.makeCanvas(Math.ceil(BW * PX), Math.ceil(BH * PX));
    const c = cv.getContext("2d");
    c.scale(PX, PX);
    // looking up past him into the dawn: deep blue overhead warming to peach low on the sun side
    c.fillStyle = lin(c, 0, 0, 0, BH, [[0, "#3a659e"], [0.45, "#7d9cc6"], [0.8, "#d9c6c4"], [1, "#efd2bc"]]);
    c.fillRect(0, 0, BW, BH);
    const mg = c.createRadialGradient(-120, BH * 0.85, 0, -120, BH * 0.85, BW * 0.9);
    mg.addColorStop(0, "rgba(255,206,150,0.7)"); mg.addColorStop(0.35, "rgba(255,190,150,0.22)"); mg.addColorStop(1, "rgba(255,190,150,0)");
    c.fillStyle = mg; c.fillRect(0, 0, BW, BH);
    K.clouds(c, BW, BH, 0, { seed: 22, kind: "stratus", color: "#ffe2d0", shade: "#8e86a8", count: 6, y: 210, spread: 90, speed: 0, scale: 1.7, alpha: 0.85, sun: { x: -160, y: 560 } });
    K.clouds(c, BW, BH, 0, { seed: 25, kind: "stratus", color: "#ffd8c4", shade: "#a090aa", count: 5, y: 420, spread: 40, speed: 0, scale: 1.1, alpha: 0.6, sun: { x: -160, y: 560 } });
    // the far rooftops of the plaza along the bottom, deep in haze
    c.save(); c.translate(40, BH - (HZ + 14)); town(c); c.restore();
    // the Cozy Meadow arch far below-left: just its green glow through the haze
    K.glow(c, 150, BH - 40, 230, ZONE_GLOW[0], 0.32, "source-over");
    // a blossom tree crown filling the left edge
    K.tree(c, 30, BH + 300, 2.6, { seed: 5, kind: "oak", leaf: "#c48aa0", trunk: "#3e2e2a", sun: { x: -200, y: 500 }, sway: 0, shadow: false });
    blurInto(s, cv, 6 * PX, 0, 0, BW, BH);
  });
}
function shotStatue(g, t, p) {
  const e = K.ease.inOut(p);
  // slow lateral dolly: background drifts less than the statue (parallax), all eased
  g.drawImage(statueSkyBg(), -60 + 34 * e, -24 + 6 * e, W + 80, H + 40);
  const spr = statueClose();
  const sc = 1.0 + 0.06 * e;
  const hx = K.lerp(-40, -150, e) + K.noise(t * 0.4, 7) * 2, hy = K.lerp(-30, -46, e) + K.noise(t * 0.5, 8) * 1.5;
  // the sun rakes his near (left) side; the meadow arch's green light kisses the shadow side
  g.save();
  g.translate(hx, hy);
  g.scale(sc, sc);
  g.drawImage(spr, 0, 0, SC_W, SC_H);
  g.restore();
  K.godRays(g, -80, 470, W, H, { color: "#ffd8b0", count: 8, strength: 0.1, t, angle: -0.35, spread: 0.6, length: 1300, seed: 11 });
  K.dust(g, W, H, t, { seed: 13, color: "#ffeed6", count: 40, alpha: 0.6, size: 1.5 });
  // a foreground blossom branch drifting through, far out of focus (defocused once, then moved)
  g.save();
  g.translate(-260 + 90 * e, 30);
  g.rotate(Math.sin(t * 0.8 + 9) * 0.01);
  g.drawImage(statueFg(), -360, 0, 720, 680);
  g.restore();
}
function statueFg() {
  return TSPR("f01-statue-fg2", 360, 340, (s) => {
    s.scale(0.5, 0.5);
    const PX = K.pixelScale();
    const cv = K.makeCanvas(Math.ceil(720 * PX), Math.ceil(680 * PX)), c = cv.getContext("2d");
    c.scale(PX, PX);
    K.tree(c, 360, 640, 2.4, { seed: 9, kind: "oak", leaf: "#a87080", trunk: "#2e2220", sun: { x: 160, y: 300 }, t: 0, sway: 0, shadow: false });
    blurInto(s, cv, 4.5 * PX, 0, 0, 720, 680);
  });
}

// ================================================================================================
// THE COZY MEADOW
// ================================================================================================
const MHAZE = "#e6dccb";
// ---- meadow building blocks (all baked once) --------------------------------------------------------
// ridgeRange(s, o) - a distant mountain range, shaded per pixel: ridged-noise crest line, slopes lit
// by the low sun on the side facing it and falling into cool shade on the other, erosion gullies
// running down the faces, and aerial perspective (contrast and colour sink into the sky haze with
// distance, valley mist pooling at the foot). o: {y: foot line, amp, seed, rock, lit, haze, hazeAmt, sunX, mist}
function ridgeRange(s, o) {
  const top = o.y - o.amp * 1.25, hgt = o.amp * 1.25 + 8;
  const w = Math.ceil(W * 0.75), h = Math.ceil(hgt * 0.75); // reduced raster: it sits in haze
  const cv = K.makeCanvas(w, h), c = cv.getContext("2d");
  const img = c.createImageData(w, h), P = img.data;
  const crest = new Float32Array(w + 4);
  const fx = W / w;
  for (let x = 0; x < w + 4; x++) {
    const X = (x - 2) * fx;
    const r = ridged2(X / 260 + o.seed, 0.37, o.seed, 5);
    const f = fbm2(X / 70, 1.3, o.seed + 2, 3);
    crest[x] = o.y - o.amp * (0.3 + 0.75 * r) - o.amp * 0.12 * f;
  }
  const pc = (cc) => K.parseColor(cc);
  const RK = pc(o.rock), LT = pc(o.lit), HZc = pc(o.haze);
  const sd = o.sunX < W / 2 ? -1 : 1;
  for (let y = 0; y < h; y++) {
    const Y = top + (y / h) * hgt;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const cy = crest[x + 2];
      if (Y < cy - 0.6) { P[i + 3] = 0; continue; }
      const X = x * fx;
      // slope of the crest (and of the gullies under it) relative to the sun side
      const slope = (crest[x + 3] - crest[x + 1]) / (2 * fx);
      const gully = ridged2(X / 16, Y / 34, o.seed + 5, 3) - 0.5;
      const face = K.clamp(0.5 + (-slope * sd) * 1.6 + gully * 0.7 - (Y - cy) / (o.amp * 3));
      const under = K.clamp((Y - cy) / (o.y - cy + 1)); // 0 at crest, 1 at the foot
      let r = K.lerp(RK[0], LT[0], face), g = K.lerp(RK[1], LT[1], face), b = K.lerp(RK[2], LT[2], face);
      const hz = K.clamp(o.hazeAmt + under * (o.mist || 0.35));
      r = K.lerp(r, HZc[0], hz); g = K.lerp(g, HZc[1], hz); b = K.lerp(b, HZc[2], hz);
      P[i] = r; P[i + 1] = g; P[i + 2] = b;
      P[i + 3] = 255 * K.clamp((Y - cy + 0.6) / 1.2);
    }
  }
  c.putImageData(img, 0, 0);
  s.save();
  s.imageSmoothingEnabled = true;
  s.drawImage(cv, 0, top, W, hgt);
  s.restore();
}

// canopyTree(seed, leaf, sunSide, haze) - a broadleaf tree shaded per pixel: a crown built from
// overlapping leaf-mass lobes (front-most surface wins, so each lobe has a real normal), broken into
// clumps and sky holes by fbm, lit by the low sun from the side (lit flank warm and yellow-green,
// the far flank and the underside in cool occlusion), leaf-scale speckle, trunk and limbs under it.
// Sprite 200 x 240 units, base of the trunk at (100, 236).
function canopyTree(seed, leaf, sunSide, haze = 0) {
  return TSPR("f01-ctree:" + seed + ":" + leaf + ":" + sunSide + ":" + haze, 200, 240, (s) => {
    const R = K.rng("f01-ctree" + seed);
    // trunk + limbs
    const bark = "#3a2c22";
    const limb = (x0, y0, x1, y1, w0, w1) => {
      const p = new Path2D();
      p.moveTo(x0 - w0 / 2, y0); p.quadraticCurveTo((x0 + x1) / 2 - w0 * 0.2, (y0 + y1) / 2, x1 - w1 / 2, y1);
      p.lineTo(x1 + w1 / 2, y1); p.quadraticCurveTo((x0 + x1) / 2 + w0 * 0.3, (y0 + y1) / 2, x0 + w0 / 2, y0); p.closePath();
      K.texFill(s, "bark", p, { scale: 40, tex: { seed: 3, color: bark } });
      inside(s, p, (c) => { c.fillStyle = lin(c, x0 - w0, 0, x0 + w0, 0, sunSide < 0 ? [[0, "rgba(255,210,160,0.25)"], [0.5, "rgba(0,0,0,0.1)"], [1, "rgba(10,10,20,0.55)"]] : [[0, "rgba(10,10,20,0.55)"], [0.5, "rgba(0,0,0,0.1)"], [1, "rgba(255,210,160,0.25)"]]); c.fillRect(0, 0, 200, 240); });
    };
    const lean = (R() - 0.5) * 10;
    limb(100, 238, 100 + lean, 150, 15, 10);
    limb(100 + lean, 168, 70 + R() * 10, 112, 8, 4);
    limb(100 + lean, 160, 132 + R() * 10, 108, 7, 4);
    // root flare occlusion
    K.shadowBlob(s, 100, 236, 16, 3.5, { alpha: 0.7, color: "#141a10" });
    // crown lobes (x, y, r, z-offset): a rounded dome, irregular
    const lobes = [];
    const cx0 = 100 + lean * 0.6, cy0 = 96;
    lobes.push([cx0, cy0, 44, 6]);
    const n = 9 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * (0.02 + 0.96 * (i / (n - 1))) + (R() - 0.5) * 0.3;
      const d = 34 + R() * 22;
      lobes.push([cx0 + Math.cos(a) * d * 1.18, cy0 + Math.sin(a) * d * 0.95 + 8, 22 + R() * 16, R() * 10]);
    }
    for (let i = 0; i < 4; i++) lobes.push([cx0 + (R() - 0.5) * 90, cy0 + 26 + R() * 18, 20 + R() * 10, -4 + R() * 6]); // lower skirt
    const cv = s.canvas, w = cv.width, h = cv.height, u = w / 200;
    const img = s.getImageData(0, 0, w, h), P = img.data;
    const [lr0, lg0, lb0] = K.parseColor(leaf);
    const LC = { r: lr0, g: lg0, b: lb0 };
    const dark = [LC.r * 0.22, LC.g * 0.26, LC.b * 0.3];
    const lite = [K.lerp(LC.r, 232, 0.5), K.lerp(LC.g, 236, 0.42), K.lerp(LC.b, 138, 0.35)];
    const [hr0, hg0, hb0] = K.parseColor(MHAZE);
    const HZc = { r: hr0, g: hg0, b: hb0 };
    let Lx = sunSide * 0.8, Ly = -0.32, Lz = 0.5;
    const ll = Math.hypot(Lx, Ly, Lz); Lx /= ll; Ly /= ll; Lz /= ll;
    for (let y = 0; y < h; y++) {
      const Y = y / u;
      if (Y > 160) break;
      for (let x = 0; x < w; x++) {
        const X = x / u;
        let best = -1e9, nx = 0, ny = 0, nz = 1, edge = 0, li = 0;
        const clump = fbm2(X / 7, Y / 7, seed + 3, 3);
        for (let k = 0; k < lobes.length; k++) {
          const [lx, ly, lr, lz] = lobes[k];
          const rr = lr * (0.84 + 0.3 * clump);
          const dx = X - lx, dy = Y - ly, d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          const z0 = Math.sqrt(rr * rr - d2);
          if (z0 + lz > best) { best = z0 + lz; nx = dx / rr; ny = dy / rr; nz = z0 / rr; edge = 1 - Math.sqrt(d2) / rr; li = k; }
        }
        if (best < -1e8) continue;
        // sky holes and a broken outline (leaf clumps), never in the dense middle
        const hole = fbm2(X / 4, Y / 4, seed + 9, 2);
        if (edge < 0.22 && hole < -0.25) continue;
        // clump-scale normal perturbation
        const pnx = nx + fbm2(X / 5 + 3, Y / 5, seed + 4, 2) * 0.45, pny = ny + fbm2(X / 5, Y / 5 + 7, seed + 5, 2) * 0.45;
        const nl = Math.hypot(pnx, pny, nz) || 1;
        const dif = K.clamp((pnx * Lx + pny * Ly + nz * Lz) / nl * 0.85 + 0.15);
        const sky = K.clamp(-pny / nl * 0.5 + 0.5) * 0.25;
        const ao = K.clamp((Y - (cy0 - 10)) / 70) * 0.55 + (1 - nz) * 0.15 + (li > n ? 0.2 : 0);
        let v = K.clamp(dif * 0.95 + sky - ao * 0.6 + clump * 0.18);
        const sp = (K.hash(x + y * 3001, seed) - 0.5) * 0.16; // leaf-scale speckle
        v = K.clamp(v + sp);
        let r, g, b;
        if (v < 0.5) { const k2 = v * 2; r = K.lerp(dark[0], LC.r, k2); g = K.lerp(dark[1], LC.g, k2); b = K.lerp(dark[2], LC.b, k2); }
        else { const k2 = (v - 0.5) * 2; r = K.lerp(LC.r, lite[0], k2); g = K.lerp(LC.g, lite[1], k2); b = K.lerp(LC.b, lite[2], k2); }
        // cool skylight in the shadows
        const sh = 1 - v;
        b += sh * 14; r -= sh * 6;
        if (haze) { r = K.lerp(r, HZc.r, haze); g = K.lerp(g, HZc.g, haze); b = K.lerp(b, HZc.b, haze); }
        const i = (y * w + x) * 4;
        P[i] = r; P[i + 1] = g; P[i + 2] = b; P[i + 3] = 255 * K.clamp(edge * 9);
      }
    }
    s.save(); s.setTransform(1, 0, 0, 1, 0, 0); s.putImageData(img, 0, 0); s.restore();
    if (haze) {
      // the trunk too
      s.save(); s.globalCompositeOperation = "source-atop"; s.fillStyle = K.rgba(MHAZE, haze * 0.9);
      s.fillRect(0, 150, 200, 90); s.restore();
    }
  });
}
// drop a sprite's silhouette onto the ground as a long, soft sun shadow (bake time only).
// (X, Y) -> (X + sx (gy - Y), gy + fl (gy - Y)), blurred, multiplied in.
function groundShadow(s, img, dx, dy, dw, dh, gy, sx, fl, alpha, blur, color = "#1c2630") {
  const ds = s.canvas.width / W; // (full-width sets only)
  const cv = K.makeCanvas(Math.ceil(W * ds), Math.ceil(H * ds)), c = cv.getContext("2d");
  c.setTransform(ds, 0, -sx * ds, -fl * ds, sx * gy * ds, gy * (1 + fl) * ds);
  c.drawImage(img, dx, dy, dw, dh);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = "source-in";
  c.fillStyle = color; c.fillRect(0, 0, cv.width, cv.height);
  s.save();
  s.globalAlpha = alpha;
  blurInto(s, cv, blur, 0, 0, W, H);
  s.restore();
}
// drifting cloud shadows over a meadow (perspective-squashed fbm patches); drawn per frame as one
// image, sliding slowly across the field
function cloudShadows(key, hz, seed) {
  const CW = W + 400;
  return TSPR("f01-cshadow:" + key, CW, H, (s) => {
    for (let i = 0; i < 6; i++) {
      const y0 = hz + 2 + (H - hz) * Math.pow(i / 6, 1.6), y1 = hz + 2 + (H - hz) * Math.pow((i + 1) / 6, 1.6);
      const f = (i + 0.5) / 6;
      s.save();
      s.beginPath(); s.rect(0, y0, CW, y1 - y0 + 1); s.clip();
      K.texRect(s, "cloud", 0, y0, CW, y1 - y0 + 1, { scale: 300 + 900 * f, scaleY: (300 + 900 * f) * (0.1 + 0.3 * f), ox: 90 + seed * 70, oy: -(y0 - hz) * 0.5, tex: { seed: 77, cover: 0.1, size: 192 } });
      s.restore();
    }
    s.globalCompositeOperation = "source-in";
    s.fillStyle = "#1e2840";
    s.fillRect(0, 0, CW, H);
    s.globalCompositeOperation = "destination-in";
    s.fillStyle = lin(s, 0, hz, 0, hz + 30, [[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,1)"]]);
    s.fillRect(0, hz, CW, H - hz);
    const b = K.makeCanvas(s.canvas.width, s.canvas.height);
    b.getContext("2d").drawImage(s.canvas, 0, 0);
    s.globalCompositeOperation = "copy";
    s.filter = "blur(4px)";
    s.drawImage(b, 0, 0, CW, H);
    s.filter = "none";
  });
}
function drawCloudShadows(g, key, hz, seed, t, t0, alpha = 0.3) {
  g.save();
  g.globalAlpha = alpha;
  g.drawImage(cloudShadows(key, hz, seed), -300 + (t - t0) * 6, 0, W + 400, H);
  g.restore();
}
// a red barn with plank siding and a shingle roof, hazed with distance; x,y = bottom centre.
// Two faces of a real box: the gable end turned to the low sun (warm, lit), the long side in cool
// skylight; the roof overhangs both with a hard eave shadow; weathered (desaturated) barn red.
function barnSprite(haze) {
  return hiSprite("f01-barn2:" + haze, 200, 140, (g) => {
    const red = "#7a3a2e";
    const gable = new Path2D(); gable.moveTo(12, 134); gable.lineTo(12, 70); gable.lineTo(52, 32); gable.lineTo(92, 70); gable.lineTo(92, 134); gable.closePath();
    const side = new Path2D(); side.moveTo(92, 134); side.lineTo(92, 70); side.lineTo(188, 76); side.lineTo(188, 134); side.closePath();
    const roof = new Path2D(); roof.moveTo(86, 74); roof.lineTo(51, 27); roof.lineTo(157, 31); roof.lineTo(196, 80); roof.closePath();
    const verge = new Path2D(); verge.moveTo(8, 72); verge.lineTo(52, 27); verge.lineTo(55, 30); verge.lineTo(13, 74); verge.closePath();
    K.texFill(g, "siding", gable, { scale: 50, tex: { seed: 2, color: red } });
    K.texFill(g, "siding", side, { scale: 50, tex: { seed: 3, color: K.shade(red, -0.1) } });
    inside(g, gable, (c) => { c.fillStyle = lin(c, 12, 0, 92, 0, [[0, "rgba(255,206,150,0.3)"], [1, "rgba(255,190,140,0.12)"]]); c.fillRect(10, 20, 84, 120); c.fillStyle = lin(c, 0, 70, 0, 84, [[0, "rgba(20,10,10,0.55)"], [1, "rgba(20,10,10,0)"]]); c.fillRect(10, 60, 84, 30); });
    inside(g, side, (c) => {
      c.fillStyle = "rgba(34,30,64,0.52)"; c.fillRect(90, 60, 110, 80);
      c.fillStyle = lin(c, 0, 72, 0, 86, [[0, "rgba(10,8,16,0.6)"], [1, "rgba(10,8,16,0)"]]); c.fillRect(90, 66, 110, 24);
      // a big sliding door on the long side, darker, with its rail
      c.fillStyle = "rgba(20,12,12,0.45)"; c.fillRect(124, 96, 38, 38);
      c.fillStyle = "rgba(200,190,170,0.25)"; c.fillRect(120, 94, 46, 1.6);
    });
    K.texFill(g, "shingle", roof, { scale: 26, tex: { seed: 3, color: "#5a5250" } });
    inside(g, roof, (c) => { c.fillStyle = lin(c, 50, 0, 196, 0, [[0, "rgba(255,226,190,0.28)"], [1, "rgba(30,30,60,0.2)"]]); c.fillRect(40, 20, 160, 64); });
    K.texFill(g, "wood", verge, { scale: 20, tex: { seed: 2, color: "#cfc3b0" } });
    g.strokeStyle = "rgba(255,236,210,0.45)"; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(52, 27.5); g.lineTo(157, 31.5); g.stroke();
    // trim + doors (weathered white)
    g.strokeStyle = "#bcb2a0"; g.lineWidth = 2.2;
    g.strokeRect(34, 92, 36, 42);
    g.beginPath(); g.moveTo(34, 92); g.lineTo(70, 134); g.moveTo(70, 92); g.lineTo(34, 134); g.stroke();
    g.fillStyle = "rgba(20,14,12,0.7)"; g.fillRect(46, 52, 12, 12);
    // ground occlusion all along the base
    K.shadowBlob(g, 100, 134, 98, 4, { alpha: 0.65, color: "#141a10" });
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = K.rgba(MHAZE, haze);
    g.fillRect(0, 0, 200, 140);
  });
}
// the windmill tower (static), plastered, with a shingle cap; sails drawn live
function millSprite(haze) {
  return hiSprite("f01-mill:" + haze, 60, 130, (g) => {
    const tw = new Path2D(); tw.moveTo(14, 128); tw.lineTo(22, 26); tw.lineTo(38, 26); tw.lineTo(46, 128); tw.closePath();
    K.texFill(g, "plaster", tw, { scale: 40, tex: { seed: 5, color: "#ddd0bc", stain: 0.6 } });
    inside(g, tw, (c) => { c.fillStyle = lin(c, 14, 0, 46, 0, [[0, "rgba(255,210,170,0.2)"], [0.4, "rgba(0,0,0,0)"], [1, "rgba(40,40,80,0.4)"]]); c.fillRect(10, 20, 40, 110); });
    const cap = new Path2D(); cap.moveTo(18, 28); cap.quadraticCurveTo(30, 6, 42, 28); cap.closePath();
    K.texFill(g, "shingle", cap, { scale: 14, tex: { seed: 6, color: "#4a3a32" } });
    g.fillStyle = "rgba(20,14,10,0.7)"; g.fillRect(27, 100, 7, 28); g.fillRect(28, 60, 5, 7);
    K.shadowBlob(g, 30, 128, 18, 3, { alpha: 0.5 });
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = K.rgba(MHAZE, haze);
    g.fillRect(0, 0, 60, 130);
  });
}
// one windmill sail, baked: the whip (main timber), a lattice of bars and three longitudinal laths,
// sun-faded canvas reefed over part of the frame; a lit and a shaded version (blended per frame by
// the sail's angle to the sun)
function sailSprite(haze, lit) {
  return hiSprite("f01-sail:" + haze + ":" + lit, 72, 16, (g) => {
    const wood = K.mix(lit ? "#6e5a48" : "#3a2e26", "#a8b0b4", haze), cloth = K.mix(lit ? "#c8bca4" : "#7a7262", "#a8b0b4", haze);
    // canvas (reefed: covers the inner two thirds), slightly translucent, with sag
    g.globalAlpha = 0.85;
    g.fillStyle = cloth;
    g.beginPath(); g.moveTo(14, 3); g.lineTo(52, 3.2); g.quadraticCurveTo(50, 9, 52, 14); g.lineTo(14, 14); g.closePath(); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = lin(g, 0, 3, 0, 14, [[0, "rgba(0,0,0,0)"], [0.6, "rgba(0,0,0,0.12)"], [1, "rgba(0,0,0,0.3)"]]);
    g.fillRect(14, 3, 38, 11);
    // lattice: cross bars every 4.6 units, three laths along the sail
    g.strokeStyle = wood; g.lineWidth = 0.9;
    for (let k = 0; k <= 12; k++) { const x = 13 + k * 4.6; g.beginPath(); g.moveTo(x, 2.4); g.lineTo(x, 14.6); g.stroke(); }
    g.lineWidth = 0.7;
    for (const y of [2.6, 8.6, 14.4]) { g.beginPath(); g.moveTo(13, y); g.lineTo(69, y); g.stroke(); }
    // the whip
    g.fillStyle = wood; g.fillRect(0, 0.6, 70, 2.6);
    g.fillStyle = lit ? "rgba(255,226,190,0.4)" : "rgba(0,0,0,0)"; g.fillRect(0, 0.6, 70, 0.8);
  });
}
function millSails(g, x, y, s, t, haze) {
  g.save();
  g.translate(x, y - 104 * s);
  g.scale(s, s);
  // the sail plane is turned ~50 degrees from the camera: foreshortened, a slight perspective skew
  g.transform(0.64, 0.1, 0, 1, 0, 0);
  const a0 = t * 0.45;
  const L = sailSprite(haze, 1), D = sailSprite(haze, 0);
  for (let i = 0; i < 4; i++) {
    const a = a0 + i * Math.PI / 2;
    const lit = 0.5 + 0.5 * Math.cos(a + 2.3);
    g.save();
    g.rotate(a);
    g.drawImage(D, 0, -1.5, 72, 16);
    g.globalAlpha = lit;
    g.drawImage(L, 0, -1.5, 72, 16);
    g.restore();
  }
  g.fillStyle = K.mix("#2a2018", MHAZE, haze);
  g.beginPath(); g.arc(0, 0, 3.4, 0, K.TAU); g.fill();
  g.fillStyle = K.mix("#8a7a66", MHAZE, haze);
  g.beginPath(); g.arc(-0.9, -0.9, 1.2, 0, K.TAU); g.fill();
  g.restore();
}
// the rainbow welcome arch: timber posts and a bent-plank arch with weathered paint
function welcomeArch(haze) {
  return hiSprite("f01-welcome2:" + haze, 220, 150, (g) => {
    const x = 110, y = 146, r = 92;
    const cols = ["#c8503c", "#d88a3a", "#d8bc4a", "#6aa04a", "#3e7ab4", "#6a54a0"];
    const bw = 7.5, inner = r - cols.length * bw;
    // the underside (intrados) of the bent planks, seen from slightly below: a dark band
    const und = new Path2D(); und.arc(x, y - 30, inner + 0.6, Math.PI, K.TAU); und.arc(x + 1.2, y - 27.5, inner - 0.6, K.TAU, Math.PI, true); und.closePath();
    g.fillStyle = "#3a2a22"; g.fill(und);
    cols.forEach((c, i) => {
      const rr = r - i * bw;
      const p = new Path2D(); p.arc(x, y - 30, rr, Math.PI, K.TAU); p.arc(x, y - 30, rr - bw + 0.6, K.TAU, Math.PI, true); p.closePath();
      K.texFill(g, "wood", p, { scale: 60, rot: 1.57, tex: { seed: 4 + i, color: K.mix(c, "#8e8474", 0.5), varnish: 0 } });
      // each plank is a rounded board: lit outer edge, a dark seam to the next
      inside(g, p, (q) => {
        const rg = q.createRadialGradient(x, y - 30, rr - bw, x, y - 30, rr);
        rg.addColorStop(0, "rgba(20,14,20,0.35)"); rg.addColorStop(0.5, "rgba(0,0,0,0)"); rg.addColorStop(0.9, "rgba(255,236,200,0.18)"); rg.addColorStop(1, "rgba(20,14,20,0.3)");
        q.fillStyle = rg; q.fillRect(0, 0, 220, 150);
      });
    });
    // posts: square timbers, lit face toward the sun and a shadowed face
    for (const px of [x - r + 2, x + r - 2 - 10]) {
      const p = new Path2D(); p.rect(px - 1, y - 34, 11, 34);
      K.texFill(g, "wood", p, { scale: 40, rot: 1.57, tex: { seed: 9, color: "#5e4632" } });
      inside(g, p, (q) => { q.fillStyle = lin(q, px - 1, 0, px + 10, 0, [[0, "rgba(255,214,170,0.3)"], [0.45, "rgba(255,214,170,0.05)"], [0.55, "rgba(20,20,40,0.3)"], [1, "rgba(20,20,40,0.5)"]]); q.fillRect(px - 2, y - 36, 14, 38); });
    }
    // form light: sun from the upper left, the right leg and underside in shade
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = lin(g, 0, 0, 220, 0, [[0, "rgba(255,220,170,0.2)"], [0.5, "rgba(0,0,0,0)"], [1, "rgba(30,30,70,0.32)"]]);
    g.fillRect(0, 0, 220, 150);
    g.fillStyle = K.rgba(MHAZE, haze);
    g.fillRect(0, 0, 220, 150);
    g.globalCompositeOperation = "source-over";
    K.shadowBlob(g, x - r + 7, y, 10, 2.4, { alpha: 0.7, color: "#141a10" });
    K.shadowBlob(g, x + r - 7, y, 10, 2.4, { alpha: 0.7, color: "#141a10" });
  });
}
// a morning altocumulus deck: fbm vapour squashed by distance (big soft cells overhead, thin streaks
// toward the horizon), gold where it faces the low sun, blue-grey bellies elsewhere, self-shadowed
// away from the sun. Baked once per (seed, sun); drifts by a sub-pixel-smooth offset per frame.
function skyDeck(seed, sun, hz) {
  const DW = W + 240, DH = Math.max(40, hz - 10);
  return TSPR("f01-deck:" + seed + ":" + sun.x + "," + sun.y + ":" + hz, DW, DH, (s) => {
    const den = K.makeCanvas(DW, DH), d = den.getContext("2d");
    // perspective in bands: cell size and squash shrink toward the horizon (soft, so seams vanish)
    const bands = 7;
    for (let i = 0; i < bands; i++) {
      const y0 = (i / bands) * DH, y1 = ((i + 1) / bands) * DH + 1;
      const f = 1 - (i + 0.5) / bands;
      const sc = 140 + 520 * f;
      d.save();
      d.beginPath(); d.rect(0, y0, DW, y1 - y0); d.clip();
      K.texRect(d, "cloud", 0, 0, DW, DH, { scale: sc, scaleY: sc * (0.18 + 0.32 * f), ox: seed * 53, oy: -DH * 0.4, tex: { seed, cover: 0.12, size: 256 } });
      d.restore();
    }
    d.filter = "blur(1.5px)";
    d.globalCompositeOperation = "copy";
    d.drawImage(den, 0, 0);
    d.filter = "none";
    d.globalCompositeOperation = "destination-in";
    d.fillStyle = lin(d, 0, 0, 0, DH, [[0, "rgba(0,0,0,0.9)"], [0.65, "rgba(0,0,0,0.75)"], [1, "rgba(0,0,0,0)"]]);
    d.fillRect(0, 0, DW, DH);
    s.drawImage(den, 0, 0);
    s.save();
    s.globalCompositeOperation = "source-atop";
    // (kept below clipping: only the sun itself may become an HDR light in the lens)
    s.fillStyle = lin(s, 0, 0, 0, DH, [[0, "#c4cad8"], [0.7, "#d8d2d2"], [1, "#e2d2c4"]]);
    s.fillRect(0, 0, DW, DH);
    const sx = sun.x + 120;
    const sg = s.createRadialGradient(sx, sun.y, 0, sx, sun.y, W * 0.75);
    sg.addColorStop(0, "rgba(226,180,130,0.55)"); sg.addColorStop(0.3, "rgba(230,186,146,0.3)"); sg.addColorStop(1, "rgba(236,190,150,0)");
    s.fillStyle = sg; s.fillRect(0, 0, DW, DH);
    // shadowed bellies: density between a point and the sun darkens it
    const dx = sun.x + 120 < DW / 2 ? -1 : 1;
    const sh = K.makeCanvas(DW, DH), shg = sh.getContext("2d");
    shg.filter = "blur(3px)";
    shg.drawImage(den, -dx * 10, -6);
    shg.filter = "none";
    shg.globalCompositeOperation = "source-in";
    shg.fillStyle = "#6a7290";
    shg.fillRect(0, 0, DW, DH);
    s.globalAlpha = 0.45;
    s.drawImage(sh, 0, 0);
    s.restore();
  });
}
// a low morning sun as a lens sees it: a small clipped disc (the lens blooms it), a modest warm
// aureole that falls off fast, and a wide faint veil - not a big white plate
function lowSun(g, x, y) {
  K.glow(g, x, y, 260, "#ffcf98", 0.16);
  K.glow(g, x, y, 90, "#ffe2b8", 0.18);
  K.glow(g, x, y, 30, "#fff2dc", 0.4);
  g.fillStyle = "#fffaf0";
  g.beginPath(); g.arc(x, y, 7.5, 0, K.TAU); g.fill();
}
// meadow sky (per frame: gradient + cloud deck + sun)
function meadowSky(g, t, sun, hz, o = {}) {
  K.sky(g, W, H, { top: "#3266a8", mid: "#8cb0d6", bottom: "#e6d8c8", horizon: hz / H, haze: 0.6 });
  // forward scatter round the low sun: a smooth exponential lobe (no plateau that would clip)
  g.save();
  g.globalCompositeOperation = "screen";
  const mg = g.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, W * 0.85);
  mg.addColorStop(0, "rgba(255,206,150,0.5)"); mg.addColorStop(0.06, "rgba(255,200,146,0.34)"); mg.addColorStop(0.2, "rgba(250,196,150,0.18)");
  mg.addColorStop(0.5, "rgba(240,190,150,0.06)"); mg.addColorStop(1, "rgba(240,190,150,0)");
  g.fillStyle = mg;
  g.fillRect(-200, -200, W + 400, hz + 210);
  g.restore();
  // the sun first, then the deck drifting across it (cloud dims it; only the sun itself clips)
  if (o.sunDisc !== false) lowSun(g, sun.x, sun.y);
  g.drawImage(skyDeck(o.cseed || 3, sun, hz), -40 - t * 1.6, 0); // (t in 33..60: stays covering)
}
// the static meadow landscape for a camera (hills, trees, barn, mill tower, arch, perspective turf)
function meadowSet(key, o) {
  return hiSprite("f01-meadow2:" + key, W, H, (s) => {
    const sun = o.sun, hz = o.hz, sd = sun.x < W / 2 ? -1 : 1, seed = o.seed || 2;
    // distant ranges: ridge shading toward the sun, gullies, aerial perspective (far = paler, bluer)
    ridgeRange(s, { y: hz - 8, amp: 46, seed: seed + 0.31, rock: "#56627e", lit: "#b6aaa6", haze: "#c4c8d4", hazeAmt: 0.4, sunX: sun.x, mist: 0.45 });
    ridgeRange(s, { y: hz, amp: 22, seed: seed + 4.13, rock: "#44544e", lit: "#8a9468", haze: "#b2b8b4", hazeAmt: 0.26, sunX: sun.x, mist: 0.5 });
    K.hills(s, W, H, { y: hz + 1, amp: 10, color: "#4c6a36", seed: seed + 3, haze: "#a8b4b4", hazeAmt: 0.4, tex: "turf", rim: "#4a3e26", cache: false });
    // hedgerow trees on the far rolls: small, hazed, still with a lit flank
    for (let k = 0; k < 16; k++) {
      const x = 10 + k * 64 + K.hash(k, 5) * 40;
      if (K.hash(k, 4) < 0.3) continue;
      const hh = (0.06 + K.hash(k, 6) * 0.05) * 320, sc = hh / 240;
      s.drawImage(canopyTree(20 + (k % 3), "#3e5a30", sd, 0.5), x - 100 * sc, hz + 1 + K.hash(k, 9) * 5 - 236 * sc, 200 * sc, 240 * sc);
    }
    if (o.barn) s.drawImage(barnSprite(0.4), o.barn[0] - 100 * o.barn[2], o.barn[1] - 134 * o.barn[2], 200 * o.barn[2], 140 * o.barn[2]);
    if (o.mill) s.drawImage(millSprite(o.mill[3]), o.mill[0] - 30 * o.mill[2], o.mill[1] - 128 * o.mill[2], 60 * o.mill[2], 130 * o.mill[2]);
    K.fog(s, W, H, { y: hz, h: 34, color: MHAZE, alpha: 0.36, wisps: false });
    // the meadow floor in perspective
    K.groundPlane(s, W, H, { tex: "turf", texOpts: { seed: 4, color: "#4f7e2c", dry: 0.3 }, horizon: hz + 4, scale: o.gscale || 300, fog: K.mix("#7f9a5a", "#b8c0bc", 0.5), fogAmt: 0.75, variation: 0.8, cache: false });
    // depth-graded grass: fine, short and hazy far away; coarse, tall and saturated near
    grassField(s, hz + 3, H + 26, { k: 0.13, near: "#4e7c2c", alt: "#6a8840", far: "#b0b8a4", haze: 0.6, sun, seed: 50 + seed, dry: 0.12, density: 0.5 });
    // morning sun from the given side: low warm wash, the far side in cool skylight
    s.save();
    s.globalCompositeOperation = "soft-light";
    s.fillStyle = lin(s, sun.x < W / 2 ? 0 : W, 0, sun.x < W / 2 ? W : 0, 0, [[0, "rgba(255,210,150,0.55)"], [1, "rgba(70,90,150,0.4)"]]);
    s.fillRect(0, hz, W, H - hz);
    // the field brightens into the low sun along the horizon (forward scatter off wet, backlit blades)
    const fg = s.createRadialGradient(sun.x, hz + 8, 0, sun.x, hz + 8, W * 0.6);
    fg.addColorStop(0, "rgba(255,228,180,0.5)"); fg.addColorStop(1, "rgba(255,228,180,0)");
    s.globalCompositeOperation = "screen";
    s.beginPath(); s.rect(0, hz + 3, W, H - hz); s.clip();
    s.save(); s.translate(0, hz + 8); s.scale(1, 0.25); s.translate(0, -(hz + 8));
    s.fillStyle = fg; s.fillRect(-W, hz + 8 - W, W * 3, W * 2);
    s.restore();
    s.restore();
    if (o.arch) {
      const [ax, ay, asc, ahz] = o.arch, img = welcomeArch(ahz);
      // its long sun shadow laid across the grass (away from the sun, toward us), then contact
      groundShadow(s, img, ax - 110 * asc, ay - 146 * asc, 220 * asc, 150 * asc, ay, -sd * 1.5, 0.14, 0.45, 2 + 3 * asc);
      s.drawImage(img, ax - 110 * asc, ay - 146 * asc, 220 * asc, 150 * asc);
    }
    if (o.trees) for (const [x, y, sc, sdd] of o.trees) {
      const k = sc * 1.33, img = canopyTree(sdd, "#3f6a2c", sd, K.clamp(0.36 - sc * 0.5));
      groundShadow(s, img, x - 100 * k, y - 236 * k, 200 * k, 240 * k, y, -sd * 1.9, 0.2, 0.5, 3 + 8 * sc);
      s.drawImage(img, x - 100 * k, y - 236 * k, 200 * k, 240 * k);
    }
    if (o.paint) o.paint(s);
  });
}
// grassField(s, hz, y1, o) - a continuous meadow sward in perspective (bake time only). Rows are laid
// far -> near with a spacing proportional to the blade height at that depth (blade height in screen
// space grows linearly with the distance below the horizon), so each row's tips cover the previous
// row's roots: no "crop row" banding. Far rows are fine, short and hazed; near rows coarse, tall and
// saturated; tone jitters per row and in broad fbm patches (real fields are never one green).
// o: {k: height / depth ratio, near, far, haze 0..1, sun, seed, dry, density, x0, x1, d0, onRow(y,h,v,i)}
function grassField(s, hz, y1, o) {
  const k = o.k || 0.12, x0 = o.x0 == null ? -40 : o.x0, x1 = o.x1 == null ? W + 40 : o.x1;
  const span = y1 - hz;
  let i = 0;
  for (let d = o.d0 || 1.5; d < span; d += Math.max(0.9, d * k * 0.4), i++) {
    const y = hz + d, v = d / span, h = Math.max(0.8, d * k);
    const patch = K.hash(i, (o.seed || 1) + 0.5);
    let col = K.mix(o.near, o.alt || K.shade(o.near, 0.12), 0.25 + 0.5 * patch);
    col = K.mix(col, o.far, Math.pow(1 - v, 1.6) * (o.haze == null ? 0.65 : o.haze));
    if (o.pre) o.pre(y);
    const go = { seed: (o.seed || 1) * 1000 + i, color: col, height: h, density: (o.density || 0.55) * (0.6 + 0.6 * v), wind: 0, sun: o.sun, dry: o.dry == null ? 0.1 : o.dry };
    // gaps: x ranges where this row is trampled flat (nothing stands there)
    const gaps = o.gaps ? o.gaps(y, h) : null;
    if (gaps && gaps.length) {
      let xa = x0;
      const flat = Object.assign({}, go, { height: h * 0.07, color: K.shade(col, -0.25), dry: 0.3 });
      for (const [ga, gb] of gaps.sort((a, b) => a[0] - b[0])) { if (ga > xa) K.grass(s, xa, ga, y, go); K.grass(s, Math.max(xa, ga), gb, y, flat); xa = Math.max(xa, gb); }
      if (xa < x1) K.grass(s, xa, x1, y, go);
    } else K.grass(s, x0, x1, y, go);
    if (o.onRow) o.onRow(y, h, v, i);
  }
}
// dew: tiny specular points on the blades, twinkling as the grass moves (no cartoon stars)
function dewField(g, t, x0, x1, y0, y1, seed, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const u = K.hash(i, seed), v = Math.pow(K.hash(i + 0.5, seed), 0.7);
    pts.push([K.lerp(x0, x1, u), K.lerp(y0, y1, v), 0.5 + v * 1.6, i * 2.1 + K.hash(i + 0.2, seed) * 9]);
  }
  glints(g, t, pts, { speed: 1.7, color: "#fffaf0" });
}

// ---- shot 5 [33-44]: ground-level macro dolly through the dew; his pawprints ------------------------
// The lens sits a hand's height above the grass. Foreground blades carry real dew (refracting drops:
// dark rim, bright refracted belly, a hard specular point of the sun), then focus racks back to his
// prints pressed into the wet meadow: four toes and a pad where the blades are crushed flat, darker,
// the dew wiped off, a faint warm wisp still rising. Every layer is baked once (sharp + defocused
// copies; the rack focus is a cross-blend), the dolly is a slow push (~3% scale per second).
const SUN5 = { x: 150, y: 224 }; // (meadow-set space) low, just above the far ridge
const HZ5 = 300;
const SET5 = { hz: HZ5, sun: SUN5, seed: 2, barn: [250, HZ5 + 6, 0.32], mill: [730, HZ5 - 4, 0.42, 0.55], arch: [586, HZ5 + 40, 0.62, 0.3],
  trees: [[96, HZ5 + 22, 0.32, 41], [880, HZ5 + 26, 0.38, 42]] };
const DHZ = 168;                 // the horizon in the macro frame
const DSHIFT = DHZ - HZ5;        // meadow-set space -> macro frame
const DSUN = { x: SUN5.x, y: SUN5.y + DSHIFT };
// a dew drop: a tiny lens. Dark refracting rim, the bright sky and sun refracted (inverted) into its
// lower belly, one hard specular point up toward the sun, a soft contact shadow on the blade
function dropSprite() {
  return TSPR("f01-drop", 32, 32, (g) => {
    const x = 16, y = 16, r = 11;
    K.shadowBlob(g, x + 2, y + 4, r * 0.9, r * 0.55, { alpha: 0.35, color: "#0a1a06" });
    const body = ellPath(x, y, r, r * 0.92);
    inside(g, body, (c) => {
      c.fillStyle = lin(c, 0, y - r, 0, y + r, [[0, "rgba(40,70,30,0.55)"], [0.45, "rgba(120,150,90,0.25)"], [0.8, "rgba(236,240,210,0.75)"], [1, "rgba(150,170,120,0.5)"]]);
      c.fillRect(0, 0, 32, 32);
      const rg = c.createRadialGradient(x, y, r * 0.55, x, y, r);
      rg.addColorStop(0, "rgba(0,0,0,0)"); rg.addColorStop(0.75, "rgba(10,30,8,0.25)"); rg.addColorStop(1, "rgba(6,20,4,0.85)");
      c.fillStyle = rg; c.fillRect(0, 0, 32, 32);
      // the refracted sun: a warm caustic low on the far side from the specular
      c.fillStyle = "rgba(255,236,190,0.6)";
      c.beginPath(); c.ellipse(x + r * 0.32, y + r * 0.45, r * 0.32, r * 0.18, -0.3, 0, K.TAU); c.fill();
    });
    g.fillStyle = "#ffffff";
    g.beginPath(); g.ellipse(x - r * 0.38, y - r * 0.42, r * 0.2, r * 0.15, -0.5, 0, K.TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,0.5)";
    g.beginPath(); g.arc(x + r * 0.2, y - r * 0.55, r * 0.07, 0, K.TAU); g.fill();
  });
}
// the prints, in ground-plane order far -> near: [screen x, screen y (contact), size px, angle]
const PRINTS = (() => {
  const a = [];
  for (let i = 0; i < 7; i++) {
    const v = i / 6;                         // 0 far .. 1 near
    const y = DHZ + 36 + (H - DHZ - 70) * v * v;
    const sz = 10 + 66 * v * v;
    const x = 520 - 70 * v + (i % 2 ? 1 : -1) * sz * 0.55;
    a.push([x, y, sz, -0.12 + (i % 2 ? 0.08 : -0.08)]);
  }
  return a;
})();
// a single print, drawn in place: pad + four toes, foreshortened by the grazing view (squash)
function printPath(x, y, sz, ang) {
  const p = new Path2D();
  const sq = 0.58; // grazing angle (cheated a little toward top-down so the toes read)
  const pt = (u, v) => [x + (u * Math.cos(ang) - v * Math.sin(ang)) * sz, y + (u * Math.sin(ang) + v * Math.cos(ang)) * sz * sq];
  // trilobed metacarpal pad
  for (const [u, v, r] of [[-0.2, 0.12, 0.2], [0.2, 0.12, 0.2], [0, 0.02, 0.24], [0, 0.22, 0.17]]) { const [px, py] = pt(u, v); p.ellipse(px, py, r * sz, r * sz * sq, ang, 0, K.TAU); }
  for (const [u, v, r] of [[-0.42, -0.34, 0.13], [-0.15, -0.5, 0.135], [0.15, -0.5, 0.135], [0.42, -0.34, 0.13]]) { const [px, py] = pt(u, v); p.ellipse(px, py, r * sz, r * sz * sq * 1.15, ang, 0, K.TAU); }
  return p;
}
function inPrint(x, y) {
  for (const [px, py, sz] of PRINTS) if (Math.abs(x - px) < sz * 0.62 && Math.abs(y - py) < sz * 0.3) return true;
  return false;
}
// the wet meadow floor seen from grass height: rows of blades far -> near (fine and hazy far,
// coarse and saturated near), each print pressed in right after the row that holds it, dew beaded
// everywhere except inside the prints
function dewGround(blur) {
  return TSPR("f01-dewground:" + blur, blur ? W / 2 : W, blur ? H / 2 : H, (s) => {
    if (blur) {
      s.scale(0.5, 0.5);
      blurInto(s, dewGround(0), blur * 0.5 * K.pixelScale(), 0, 0, W, H);
      return;
    }
    // soil + under-layer of turf in steep perspective
    K.groundPlane(s, W, H, { tex: "turf", texOpts: { seed: 9, color: "#3e6a24", dry: 0.2 }, horizon: DHZ, scale: 900, fog: "#a8b49c", fogAmt: 0.7, variation: 0.7, cache: false });
    s.fillStyle = lin(s, 0, DHZ, 0, H, [[0, "rgba(0,0,0,0)"], [0.4, "rgba(10,24,8,0.25)"], [1, "rgba(10,24,8,0.55)"]]);
    s.fillRect(0, DHZ, W, H - DHZ);
    const R = K.rng("f01-dewground");
    const drops = [];
    let pi = 0;
    // (grazing camera: blade height grows fast toward the lens; the prints are pressed in right
    // after the rows behind them, so nearer blades overlap their far rims)
    grassField(s, DHZ + 1, H + 60, {
      k: 0.2, near: "#3e6c22", alt: "#5a8a34", far: "#a8b49c", haze: 0.55, sun: DSUN, seed: 9, dry: 0.06, density: 0.42,
      // (the prints are pressed after every row: the trampled gaps keep the near blades off them)
      // the trail of his steps is trampled: rows just in front of a print stand short of it
      gaps: (y, hgt) => PRINTS.filter(([px, py, sz]) => y > py - sz * 0.25 && y < py + hgt * 1.3 + sz * 0.2).map(([px, py, sz]) => [px - sz * 0.7, px + sz * 0.7]),
      onRow: (y, hgt, v) => {
        // dew beads on this row's blades (thinned: rows are dense now)
        const nd = Math.round((8 + 30 * v) * (0.4 + v));
        for (let k = 0; k < nd; k++) {
          const x = R() * W, yy = y - R() * hgt * 0.9;
          if (inPrint(x, y)) continue;
          drops.push([x, yy, 0.7 + 4.5 * v * v * (0.4 + R())]);
        }
      },
    });
    while (pi < PRINTS.length) { pressPrint(s, PRINTS[pi]); pi++; }
    const dsp = dropSprite();
    for (const [x, y, r] of drops) {
      if (r < 1.2) { s.fillStyle = "rgba(240,248,230,0.55)"; s.fillRect(x, y, r * 0.8, r * 0.8); continue; }
      s.drawImage(dsp, x - r * 1.45, y - r * 1.45, r * 2.9, r * 2.9);
    }
    // the far field softens with distance even in the sharp plate (the lens is focused near)
    const PX = K.pixelScale();
    const fc = K.makeCanvas(Math.ceil(W * PX), Math.ceil(110 * PX));
    fc.getContext("2d").drawImage(s.canvas, 0, Math.round(DHZ * PX), fc.width, fc.height, 0, 0, fc.width, fc.height);
    // (laid over the sharp plate with a feathered mask: no seam where the softening ends)
    const bc = K.makeCanvas(fc.width, fc.height), bg2 = bc.getContext("2d");
    bg2.filter = `blur(${K.qblur((2.2 * PX).toFixed(2))}px)`; bg2.drawImage(fc, 0, 0); bg2.filter = "none";
    bg2.globalCompositeOperation = "destination-in";
    bg2.fillStyle = lin(bg2, 0, 0, 0, bc.height, [[0, "rgba(0,0,0,1)"], [0.45, "rgba(0,0,0,0.85)"], [1, "rgba(0,0,0,0)"]]);
    bg2.fillRect(0, 0, bc.width, bc.height);
    s.drawImage(bc, 0, DHZ, W, 110);
  });
}
function pressPrint(s, [x, y, sz, ang]) {
  const p = printPath(x, y, sz, ang);
  // the blades round each pad are bent outward and lie flat: a pale halo of flattened stems that
  // catch the sky (so the dark, dew-less print reads as a shape)
  s.save();
  s.translate(x, y); s.scale(1.22, 1.3); s.translate(-x, -y);
  s.fillStyle = "rgba(128,160,96,0.55)";
  s.filter = `blur(${K.qblur(Math.max(0.6, sz * 0.03).toFixed(2))}px)`;
  s.fill(p);
  s.restore();
  // crushed, wet blades: darker, flattened (strokes lying along the press), no dew
  s.save();
  s.fillStyle = "#0e1e08";
  s.filter = `blur(${K.qblur(Math.max(0.4, sz * 0.025).toFixed(2))}px)`;
  s.fill(p);
  s.filter = "none";
  s.clip(p);
  const R = K.rng("f01-print" + x);
  s.lineCap = "round";
  for (let k = 0; k < sz * 3; k++) {
    const bx = x + (R() - 0.5) * sz * 1.1, by = y + (R() - 0.65) * sz * 0.4;
    const a = ang + (R() - 0.5) * 0.9;
    s.strokeStyle = R() > 0.5 ? "rgba(70,110,40,0.5)" : "rgba(14,30,8,0.55)";
    s.lineWidth = 0.5 + sz * 0.02;
    s.beginPath(); s.moveTo(bx, by); s.lineTo(bx + Math.cos(a) * sz * 0.25, by + Math.sin(a) * sz * 0.07); s.stroke();
  }
  // the depression: deeper shadow on the side away from the sun, a wet sheen on the near rim
  s.fillStyle = lin(s, x - sz * 0.6, 0, x + sz * 0.6, 0, [[0, "rgba(255,230,180,0.16)"], [0.5, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.35)"]]);
  s.fillRect(x - sz, y - sz, sz * 2, sz * 2);
  s.restore();
  // wet glint along the toward-sun lip of the pad
  s.save();
  s.globalCompositeOperation = "lighter";
  s.strokeStyle = "rgba(255,240,210,0.3)";
  s.lineWidth = Math.max(0.5, sz * 0.02);
  s.beginPath(); s.ellipse(x, y + sz * 0.04, sz * 0.3, sz * 0.09, ang, Math.PI * 1.05, Math.PI * 1.5); s.stroke();
  s.restore();
}
// macro foreground blades right at the lens: wide, translucent toward the sun, beaded with dew
function dewFg(blur) {
  return TSPR("f01-dewfg:" + blur, blur ? (W + 200) / 2 : W + 200, blur ? (H + 40) / 2 : H + 40, (s) => {
    if (blur) {
      s.scale(0.5, 0.5);
      blurInto(s, dewFg(0), blur * 0.5 * K.pixelScale(), 0, 0, W + 200, H + 40);
      return;
    }
    const R = K.rng("f01-dewfg");
    const dsp = dropSprite();
    const blade = (bx, by, hgt, wdt, lean, curl) => {
      const tipX = bx + lean, tipY = by - hgt;
      const p = new Path2D();
      p.moveTo(bx - wdt, by);
      p.bezierCurveTo(bx - wdt * 0.9 + lean * 0.2, by - hgt * 0.5, tipX - wdt * 0.3 + curl, tipY + hgt * 0.15, tipX, tipY);
      p.bezierCurveTo(tipX + wdt * 0.3 + curl, tipY + hgt * 0.15, bx + wdt * 0.9 + lean * 0.2, by - hgt * 0.5, bx + wdt, by);
      p.closePath();
      s.fillStyle = "#1e4214"; s.fill(p);
      inside(s, p, (c) => {
        // the midrib fold: one half faces the sky, the other falls into shade
        c.fillStyle = lin(c, bx - wdt, 0, bx + wdt, 0, [[0, "rgba(160,200,90,0.5)"], [0.48, "rgba(90,140,50,0.3)"], [0.52, "rgba(0,0,0,0.25)"], [1, "rgba(0,0,0,0.45)"]]);
        c.fillRect(bx - wdt * 2 - Math.abs(lean), tipY, wdt * 4 + Math.abs(lean) * 2, hgt + 4);
        // backlit: the sun shines through toward the tip (chlorophyll yellow-green)
        c.fillStyle = lin(c, 0, tipY, 0, by, [[0, "rgba(230,250,120,0.55)"], [0.45, "rgba(160,210,70,0.18)"], [1, "rgba(0,0,0,0.3)"]]);
        c.fillRect(bx - wdt * 2 - Math.abs(lean), tipY, wdt * 4 + Math.abs(lean) * 2, hgt + 4);
        // fine parallel veins
        c.strokeStyle = "rgba(20,50,10,0.25)"; c.lineWidth = 0.6;
        for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(bx + k * wdt * 0.32, by); c.quadraticCurveTo(bx + k * wdt * 0.2 + lean * 0.5, by - hgt * 0.55, tipX, tipY); c.stroke(); }
      });
      // dew beads along the blade, bigger low down where they gather
      const nd = Math.round(hgt / 28);
      for (let k = 0; k < nd; k++) {
        const u = 0.15 + 0.75 * R();
        const px = K.lerp(bx, tipX, u * u) + (R() - 0.5) * wdt * (1 - u), py = K.lerp(by, tipY, u);
        const r = (2.2 + R() * 5) * (1 - u * 0.6) * (wdt / 12);
        s.drawImage(dsp, px - r * 1.45, py - r * 1.45, r * 2.9, r * 2.9);
      }
    };
    // left and right clumps, a few low centre blades (so the frame looks through a gap)
    for (let i = 0; i < 9; i++) blade(20 + R() * 230, H + 40, 220 + R() * 260, 9 + R() * 9, 40 + R() * 80, 8);
    for (let i = 0; i < 9; i++) blade(W - 40 + R() * 220, H + 40, 220 + R() * 260, 9 + R() * 9, -40 - R() * 90, -8);
    for (let i = 0; i < 6; i++) blade(300 + R() * 560, H + 40, 70 + R() * 70, 6 + R() * 4, (R() - 0.5) * 50, 0);
  });
}
function shotDew(g, t, p) {
  const tt = t - 33;
  const zoom = 1 + 0.03 * tt;                                   // slow push in
  const rack = K.smooth(K.seg(t, 36.8, 38.4));                   // 0: focus on the dew at the lens, 1: on the prints
  const cx = 500, cy = 330;
  g.save();
  g.translate(cx, cy); g.scale(zoom, zoom); g.translate(-cx, -cy);
  // the far meadow and sky, defocused (cached), shifted so its horizon sits low in the macro frame
  g.save();
  g.translate(0, DSHIFT);
  meadowSky(g, t, SUN5, HZ5);
  g.drawImage(dewBgSet(), 0, 0, W, H);
  millSails(g, 730, HZ5 - 4, 0.42, t, 0.6);
  g.restore();
  // the wet ground and prints: blurred plate under the sharp one, blended by the rack
  g.drawImage(dewGround(5), 0, 0, W, H);
  if (rack > 0.01) { g.globalAlpha = rack; g.drawImage(dewGround(0), 0, 0, W, H); g.globalAlpha = 1; }
  // twinkling dew glints on the field (the sharp ones only once focus arrives)
  dewField(g, t, 0, W, DHZ + 30, H, 7, 70 + Math.round(70 * rack));
  // still warm: a faint wisp of vapour rising from the nearer prints in the cold air
  const spr = K.glowSprite("#ffe4c8");
  g.save();
  g.globalCompositeOperation = "screen";
  for (let i = 3; i < PRINTS.length; i++) {
    const [x, y, sz] = PRINTS[i];
    for (let k = 0; k < 5; k++) {
      const ph = ((tt * 0.22 + k / 5 + i * 0.13) % 1);
      const wx = x + K.noise(tt * 0.5 + k * 3 + i, 4) * sz * 0.5 + ph * sz * 0.2, wy = y - ph * sz * 1.4;
      const a = 0.09 * Math.sin(ph * Math.PI) * (0.4 + 0.6 * rack);
      if (a < 0.005) continue;
      g.globalAlpha = a;
      const r = sz * (0.3 + ph * 0.6);
      g.drawImage(spr, wx - r, wy - r * 1.4, r * 2, r * 2.8);
    }
  }
  g.restore();
  g.restore();
  // the foreground blades at the lens: they push past faster than the world (parallax), sharp first,
  // then thrown out of focus as the focus racks back; they breathe in the air (a slight shear)
  const fz = 1 + 0.05 * tt;
  const sw = Math.sin(t * 1.3) * 0.012 + Math.sin(t * 2.1) * 0.005;
  g.save();
  g.translate(480, H + 40); g.scale(fz, fz); g.transform(1, 0, sw, 1, 0, 0); g.translate(-480 - 100, -(H + 40));
  g.drawImage(dewFg(8), 0, 0, W + 200, H + 40);
  if (rack < 0.99) { g.globalAlpha = 1 - rack; g.drawImage(dewFg(0), 0, 0, W + 200, H + 40); g.globalAlpha = 1; }
  g.restore();
  // the sun's sparkle in the drops at the lens while they are sharp
  if (rack < 0.6) dewField(g, t, -20, 300, 120, 520, 9, 18), dewField(g, t, 680, 980, 120, 520, 10, 18);
  K.godRays(g, DSUN.x, DSUN.y, W, H, { color: "#ffe2b8", count: 9, strength: 0.1, t, angle: 0.75, spread: 0.9, length: 1000, seed: 3 });
  K.dust(g, W, H, t, { seed: 21, color: "#fff0d8", count: 20, alpha: 0.45, size: 1.6 });
}
// the far meadow behind the macro (set + the low sun's haze), defocused once
function dewBgSet() {
  return TSPR("f01-dewbg2", W / 2, H / 2, (s) => {
    s.scale(0.5, 0.5);
    const PX = K.pixelScale();
    const cv = K.makeCanvas(Math.ceil(W * PX), Math.ceil(H * PX)), c = cv.getContext("2d");
    c.scale(PX, PX);
    c.drawImage(meadowSet("dew", SET5), 0, 0, W, H);
    blurInto(s, cv, 1.6 * PX, 0, 0, W, H);
  });
}

// ---- shot 6 [44-52]: the very round cat on the hill ---------------------------------------------------
const SUN6 = { x: 880, y: 262 }; // just out of frame right: a rim light, not a white blob
// the near hill crest: a broad rise with an irregular, grass-tufted edge (fbm, not a smooth arc)
const crest6 = (x) => 392 - 34 * Math.exp(-Math.pow((x - 520) / 250, 2)) + 6 * Math.sin(x * 0.01 + 1)
  + 2.6 * K.fbm(x / 23, 61) + 1.2 * K.fbm(x / 6, 62);
const LOAF_X = 505, LOAF_S = 54;
const LOAF_Y = crest6(LOAF_X) + 3;
function loafSet() {
  return hiSprite("f01-loafset2", W, H, (s) => {
    // everything behind the crest is a little out of focus (the lens is on the cat, close by)
    const PX = K.pixelScale() * SS;
    const bg = K.makeCanvas(Math.ceil(W * PX), Math.ceil(H * PX)), b = bg.getContext("2d");
    b.scale(PX, PX);
    // against the sun: far ridges flat and luminous blue-grey, valley mist, hedgerows and copses
    ridgeRange(b, { y: 334, amp: 40, seed: 8.31, rock: "#5e6e88", lit: "#a8a8b4", haze: "#bcc4d0", hazeAmt: 0.36, sunX: SUN6.x, mist: 0.4 });
    for (let k = 0; k < 12; k++) {
      const x = 120 + k * 66 + K.hash(k, 12) * 40;
      if (K.hash(k, 2) < 0.3) continue;
      const hh = (0.05 + K.hash(k, 13) * 0.04) * 320, sc = hh / 240;
      b.drawImage(canopyTree(50 + (k % 3), "#34502c", 1, 0.5), x - 100 * sc, 344 + K.hash(k, 3) * 8 - 236 * sc, 200 * sc, 240 * sc);
    }
    K.hills(b, W, H, { y: 352, amp: 20, color: "#344e24", seed: 10, haze: "#98a8a8", hazeAmt: 0.16, tex: "turf", rim: "#6a5a30", cache: false });
    {
      const hc = K.makeCanvas(W, H), h = hc.getContext("2d");
      const hp = new Path2D();
      for (let cl = 0; cl < 11; cl++) {
        if (K.hash(cl, 33) < 0.2) continue;
        const cx = 30 + cl * 88 + K.hash(cl, 31) * 40, cy = 362 + K.hash(cl, 32) * 10;
        const n = 4 + Math.floor(K.hash(cl, 34) * 9);
        for (let k = 0; k < n; k++) {
          const rx = 3 + K.hash(k, cl + 40) * 6, ry = rx * (0.7 + K.hash(k, cl + 41) * 0.4);
          hp.ellipse(cx + k * 6.5 + K.hash(k, cl) * 4, cy - ry * 0.8 - K.hash(k, cl + 2) * 3, rx, ry, 0, 0, K.TAU);
        }
      }
      K.texFill(h, "foliage", hp, { scale: 26, tex: { seed: 5, color: "#2c4424" } });
      h.globalCompositeOperation = "source-atop";
      h.fillStyle = lin(h, 0, 0, W, 0, [[0, "rgba(120,140,150,0.3)"], [1, "rgba(170,160,130,0.24)"]]);
      h.fillRect(0, 0, W, H);
      b.save(); b.globalAlpha = 0.3; b.filter = "blur(2px)"; b.fillStyle = "#1e2a1a";
      b.translate(-6, 4); b.fill(hp); b.restore();
      b.drawImage(hc, 0, 0);
    }
    K.fog(b, W, H, { y: 356, h: 40, color: "#d8d4cc", alpha: 0.35, wisps: false });
    blurInto(s, bg, 1.6 * K.pixelScale() * SS, 0, 0, W, H);
    // the hilltop
    const p = new Path2D();
    p.moveTo(-80, H + 40);
    for (let x = -80; x <= W + 80; x += 3) p.lineTo(x, crest6(x));
    p.lineTo(W + 80, H + 40);
    p.closePath();
    K.texFill(s, "turf", p, { scale: 180, scaleY: 70, tex: { seed: 7, color: "#5c8a34", dry: 0.3 } });
    inside(s, p, (c) => {
      c.fillStyle = lin(c, 0, 350, 0, H, [[0, "rgba(255,226,170,0.22)"], [0.1, "rgba(0,0,0,0)"], [0.4, "rgba(24,40,50,0.3)"], [1, "rgba(18,30,36,0.58)"]]);
      c.fillRect(-80, 300, W + 160, H);
      c.globalCompositeOperation = "multiply";
      c.fillStyle = "rgba(96,120,128,0.5)";
      c.fillRect(-80, 300, W + 160, H);
    });
    // depth-graded grass down the near slope (fine at the crest, coarse toward the lens)
    // (the slope falls away from the crest toward us: a "horizon" just above the crest line)
    s.save(); s.clip(p);
    grassField(s, 360, H + 30, { k: 0.2, d0: 12, near: "#3a6224", alt: "#56783e", far: "#6a8a58", haze: 0.3, sun: SUN6, seed: 70, dry: 0.12, density: 0.45 });
    s.restore();
    // the crest is a fringe of tufts seen against the light: clumps of varied height, tips glowing
    for (let x = -80; x <= W + 80; x += 16) {
      const hh = 4 + 10 * Math.pow(K.hash(x, 3), 2.2);
      K.grass(s, x - 4, x + 18, crest6(x + 6) + 2.5, { seed: 300 + x, color: "#4a7430", height: hh, density: 1.4, wind: 0, sun: SUN6 });
    }
    // a few clover heads and buttercups on the crest (a human-scale reference beside the cat)
    const R = K.rng("f01-crestflowers");
    for (let i = 0; i < 40; i++) {
      const x = 200 + R() * 640, y = crest6(x) + 2 + R() * 4;
      s.fillStyle = R() > 0.6 ? "#e8d050" : "#efe8dc";
      s.beginPath(); s.arc(x, y - 3 - R() * 4, 0.9 + R() * 0.7, 0, K.TAU); s.fill();
    }
    s.save();
    s.globalCompositeOperation = "lighter";
    s.filter = "blur(1.5px)";
    s.strokeStyle = "rgba(255,214,150,0.16)";
    s.lineWidth = 3;
    s.beginPath();
    for (let x = -80; x <= W + 80; x += 4) { if (x === -80) s.moveTo(x, crest6(x) - 2); else s.lineTo(x, crest6(x) - 2); }
    s.stroke();
    s.restore();
  });
}
// a pale ginger ("cream") tabby: at a glance from behind, almost Biscuit
const LOAF_COAT = Object.assign({}, K.COATS.cream, { base: "#d6b07c", light: "#eed4a8", dark: "#a47c4a", stripe: "#b07c46", tip: "#9a6c3a", stripeAlpha: 0.55 });
// the back-light halo: the sun behind-right turns the fur outline into a glowing fringe. Baked
// once from the cat's own silhouette (outer glow + an inner edge band), strongest along the back
// and fading toward the turning head.
function loafHalo() {
  const w = LOAF_S * 4, h = LOAF_S * 2.4, ax = w * 0.45, ay = h * 0.86;
  return TSPR("f01-loafhalo", w, h, (s) => {
    const PX = K.pixelScale();
    const sil = K.makeCanvas(Math.ceil(w * PX), Math.ceil(h * PX)), c = sil.getContext("2d");
    c.scale(PX, PX);
    c.translate(ax, ay); c.scale(1.16, 1);
    K.drawCat(c, 0, 0, LOAF_S, { pose: "loaf", facing: 1, coat: LOAF_COAT, collar: false, bell: false, tail: 0.25, t: 0, headTurn: -0.95, blink: 0, autoBlink: false, breath: 0, shadow: false, flat: true });
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "source-in";
    c.fillStyle = "#ffc070"; c.fillRect(0, 0, sil.width, sil.height);
    const out = K.makeCanvas(sil.width, sil.height), o = out.getContext("2d");
    o.filter = `blur(${K.qblur((3 * PX).toFixed(1))}px)`; o.drawImage(sil, 0, 0); o.filter = "none";
    o.globalCompositeOperation = "destination-out"; o.drawImage(sil, 0, 0);       // outer fringe only
    // inner edge band: the silhouette minus a shifted (down-left) copy = the upper/back edge
    const inn = K.makeCanvas(sil.width, sil.height), ic = inn.getContext("2d");
    ic.drawImage(sil, 0, 0);
    ic.globalCompositeOperation = "destination-out"; ic.drawImage(sil, -2.5 * PX, 3 * PX);
    o.globalCompositeOperation = "source-over"; o.globalAlpha = 0.8; o.filter = `blur(${K.qblur((0.8 * PX).toFixed(1))}px)`; o.drawImage(inn, 0, 0); o.filter = "none"; o.globalAlpha = 1;
    // strongest on the back (top) and the sun side, fading toward the head and the ground
    o.globalCompositeOperation = "destination-in";
    o.setTransform(PX, 0, 0, PX, 0, 0);
    o.fillStyle = lin(o, 0, ay - LOAF_S * 1.3, 0, ay, [[0, "rgba(0,0,0,1)"], [0.6, "rgba(0,0,0,0.8)"], [1, "rgba(0,0,0,0)"]]);
    o.fillRect(0, 0, w, h);
    s.save(); s.setTransform(1, 0, 0, 1, 0, 0); s.drawImage(out, 0, 0); s.restore();
  });
}
function shotLoaf(g, t, p) {
  const e = K.ease.inOut(p);
  const cam = { x: 515, y: 318, zoom: 1.5 + 0.1 * e, shakeT: t, shakeAmt: 0.6 };
  // back of the head (47) -> facing the camera (49.5-50.5) -> a slow blink -> settles, eyes shut
  const turn = K.smooth(K.seg(t, 47.8, 49.4)) - K.smooth(K.seg(t, 50.8, 51.6)) * 0.5;
  const look = K.lerp(-0.95, 1, turn);
  const slowBlink = K.env(t, 49.9, 50.9, 0.4, 0.45);
  const sunBathe = K.smooth(K.seg(t, 51.0, 51.6));
  // ear twitches (a flick and recover, ~0.25 s) and the breath swelling the round body
  const flick = (t0) => { const u = (t - t0) / 0.28; return u > 0 && u < 1 ? Math.sin(u * Math.PI) * (u < 0.35 ? 1 : 0.7) : 0; };
  const ears = -0.55 * (flick(46.4) + flick(48.6) + flick(50.2) * 0.6);
  const breathe = 1 + 0.012 * Math.sin((t - 44) * 2.4) + 0.006 * turn;
  const cy = LOAF_Y;
  K.withCamera(g, W, H, cam, () => {
    meadowSky(g, t, SUN6, 340, { cseed: 7 });
    g.drawImage(loafSet(), 0, 0, W, H);
    drawCloudShadows(g, "loaf", 352, 7, t, 44, 0.22);
    // his cool, soft shadow on the grass: contact under the body + a longer one thrown toward us
    K.shadowBlob(g, LOAF_X + 2, cy + 1, LOAF_S * 0.95, 3.5, { alpha: 0.75, color: "#14202a", soft: 0.5 });
    K.shadowBlob(g, LOAF_X - 8, cy + 9, LOAF_S * 0.9, 8, { alpha: 0.35, color: "#1a2836", soft: 1 });
    // (the layered cat is cached per quantised pose - head turn, blink, ear flick - and breathes by
    // a scale; shotLoaf's warm list builds every pose the shot uses at film load)
    const hq = q(look, 0.08), bq = q(Math.max(slowBlink, sunBathe * 0.95), 0.12), eq = q(ears, 0.14);
    const cw = LOAF_S * 4, ch = LOAF_S * 2.4, cax = cw * 0.45, cay = ch * 0.86;
    const cat = hiSprite("f01-loafcat:" + hq + ":" + bq + ":" + eq, cw, ch, (s) => {
      s.translate(cax, cay);
      s.scale(1.16, 1);
      K.drawCat(s, 0, 0, LOAF_S, {
        pose: "loaf", facing: 1, coat: LOAF_COAT, collar: false, bell: false, tail: 0.25, t: 0,
        headTurn: hq, blink: bq, autoBlink: false, breath: 0, pupil: 0.1, ears: eq,
        key: { x: 200 - LOAF_X, y: 60 - LOAF_Y, color: "#c8d8f4", strength: 0.4 },
        rim: { x: (SUN6.x - LOAF_X) / 1.16, y: SUN6.y - LOAF_Y, color: "#ffc878", strength: 1.5 },
        backlit: 1, fill: "#2e3448", ambient: "#6a7898", ambientK: 0.1, castShadow: 0.5, ground: "#1e2e16",
      });
    }, 1.8);
    g.save();
    g.translate(LOAF_X, cy);
    g.scale(1, breathe);
    g.drawImage(cat, -cax, -cay, cw, ch);
    g.restore();
    // the backlit fur fringe glowing along his back
    const hw = LOAF_S * 4, hh = LOAF_S * 2.4;
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.4;
    g.translate(LOAF_X, cy); g.scale(1, breathe);
    g.drawImage(loafHalo(), -hw * 0.45, -hh * 0.86, hw, hh);
    g.restore();
    // the grass he sits in, rising round him and hiding the bottom ~10% of the body
    for (const [x0, x1, sd, hh2] of [[LOAF_X - 70, LOAF_X - 20, 17, 7], [LOAF_X - 40, LOAF_X + 30, 18, 8], [LOAF_X + 10, LOAF_X + 62, 19, 7.5], [LOAF_X + 50, LOAF_X + 80, 20, 5]]) {
      K.grass(g, x0, x1, cy + 2.5, { seed: sd, color: "#4a7430", height: hh2, t, wind: 0.5, density: 1.6, sun: SUN6 });
    }
    K.grass(g, -60, W + 60, H + 24, { seed: 8, color: "#3e6a24", height: 64, t, wind: 0.9, density: 0.45, sun: SUN6 });
    dewField(g, t, 0, W, 410, 540, 13, 60);
  });
  // the sun just off the right edge: warm veiling glare from that side
  K.glow(g, W + 80, 180, 560, "#ffc890", 0.1);
  g.save();
  const sw = Math.sin(t * 1.2) * 0.01;
  g.translate(480, H + 40); g.transform(1, 0, sw, 1, 0, 0); g.translate(-480 - 100, -(H + 40));
  g.drawImage(dewFg(8), 0, 120, W + 200, H + 40);
  g.restore();
  K.godRays(g, (SUN6.x - 515) * 1.55 + 480, (SUN6.y - 318) * 1.55 + 270, W, H, { color: "#ffe2b8", count: 8, strength: 0.06, t, angle: Math.PI - 0.6, spread: 0.8, length: 900, seed: 6 });
}

// ---- shot 7 [52-60]: you walk up the path toward the pawprints -----------------------------------------
const HZ7 = 296;
const SUN7 = { x: 160, y: 216 };
function pathPts() {
  const pts = [];
  for (let i = 0; i <= 26; i++) {
    const u = i / 26;
    const depth = 1 + u * u * 12;
    const y = HZ7 + 60 + (H + 60 - HZ7 - 60) / depth;
    const x = 430 + 240 * Math.sin(u * 2.1) * (1 - u * 0.35) - 40 * u;
    pts.push([x, y, 150 / depth]);
  }
  return pts;
}
const PATH7 = pathPts();
const SET7 = { hz: HZ7, sun: SUN7, seed: 6, barn: [130, HZ7 + 10, 0.3], arch: [210, HZ7 + 40, 0.42, 0.38], mill: [800, HZ7 + 64, 1.1, 0.12], gscale: 340,
  trees: [[40, HZ7 + 70, 0.5, 44], [930, HZ7 + 44, 0.36, 45]],
  paint: (s) => {
    // a trampled track through the meadow: the grass pressed flat and paler (flattened blades catch
    // more sky), two narrow worn ruts of bare earth, soft broken edges rather than a ribbon
    const P = PATH7;
    const edge = (i, sd) => P[i][2] * (1 + 0.28 * K.fbm(i * 0.9 + sd * 7, 81) + 0.12 * K.fbm(i * 3.1 + sd, 82));
    const path = new Path2D();
    P.forEach(([x, y], i) => (i ? path.lineTo(x - edge(i, -1), y) : path.moveTo(x - edge(i, -1), y)));
    for (let i = P.length - 1; i >= 0; i--) { const [x, y] = P[i]; path.lineTo(x + edge(i, 1), y); }
    path.closePath();
    s.save();
    s.filter = "blur(2.5px)";
    K.texFill(s, "turf", path, { scale: 140, scaleY: 46, tex: { seed: 6, color: "#7a8a48", dry: 0.7 } });
    s.filter = "none";
    s.restore();
    inside(s, path, (c) => {
      // flattened stems laid along the direction of travel
      const R = K.rng("f01-track");
      c.lineCap = "round";
      for (let k = 0; k < 900; k++) {
        const i = 1 + Math.floor(R() * (P.length - 2)), [x, y, w] = P[i];
        const bx = x + (R() - 0.5) * 2 * w, l = Math.max(1, w * 0.12);
        c.strokeStyle = R() > 0.5 ? "rgba(200,200,140,0.22)" : "rgba(40,60,24,0.22)";
        c.lineWidth = Math.max(0.4, w * 0.012);
        c.beginPath(); c.moveTo(bx, y); c.lineTo(bx + (R() - 0.5) * l * 0.4, y - l * 0.3); c.stroke();
      }
      c.fillStyle = lin(c, 0, HZ7 + 60, 0, H, [[0, K.rgba(MHAZE, 0.5)], [0.25, K.rgba(MHAZE, 0.08)], [1, "rgba(0,0,0,0.08)"]]);
      c.fillRect(0, HZ7, W, H);
    });
    // two worn ruts of damp earth, broken where grass grows back
    for (const off of [-0.42, 0.42]) {
      for (let i = 1; i < P.length - 1; i++) {
        const [x0, y0, w0] = P[i], [x1, y1, w1] = P[i + 1];
        if (K.fbm(i * 0.7 + off * 5, 83) < -0.25) continue;
        const rp = new Path2D();
        rp.moveTo(x0 + w0 * off - w0 * 0.07, y0); rp.lineTo(x1 + w1 * off - w1 * 0.07, y1); rp.lineTo(x1 + w1 * off + w1 * 0.07, y1); rp.lineTo(x0 + w0 * off + w0 * 0.07, y0); rp.closePath();
        K.texFill(s, "soil", rp, { scale: 60, scaleY: 24, alpha: 0.75, tex: { seed: 5, color: "#6a5642", wet: 0.35 } });
      }
    }
    // grass overhanging both edges, in uneven clumps
    for (let i = 2; i < P.length - 1; i++) {
      const [x, y, w] = P[i];
      const hgt = Math.max(2, w * (0.12 + 0.08 * K.hash(i, 4)));
      K.grass(s, x - edge(i, -1) - hgt * 1.8, x - edge(i, -1) + hgt * 0.9, y, { seed: 60 + i, color: "#5a8a34", height: hgt, density: 1.1, wind: 0, sun: SUN7 });
      K.grass(s, x + edge(i, 1) - hgt * 0.9, x + edge(i, 1) + hgt * 1.8, y, { seed: 90 + i, color: "#5a8a34", height: hgt, density: 1.1, wind: 0, sun: SUN7 });
    }
  } };
function shotWalk(g, t, p) {
  const e = K.ease.inOut(p);
  const cam = { x: 480, y: 280, zoom: 1.0 + 0.04 * e, shakeT: t, shakeAmt: 1.0 };
  K.withCamera(g, W, H, cam, () => {
    meadowSky(g, t, SUN7, HZ7, { cseed: 5 });
    g.drawImage(meadowSet("walk", SET7), 0, 0, W, H);
    drawCloudShadows(g, "walk", HZ7, 5, t, 52, 0.26);
    millSails(g, 800, HZ7 + 64, 1.1, t, 0.12);
    K.grass(g, -60, W + 60, H + 30, { seed: 13, color: "#4a7a2c", height: 60, t, wind: 1, density: 0.4, sun: SUN7 });
    // the prints, getting smaller along the path ahead of you: pressed darker into the track
    for (let i = 0; i < 10; i++) {
      const [x, y, w] = PATH7[6 + i * 1.6 | 0];
      const px = x + (i % 2 ? 0.25 : -0.25) * w, sz = Math.max(2.5, w * 0.34);
      g.save();
      g.globalAlpha = 0.55;
      g.fillStyle = "#26381a";
      g.fill(printPath(px, y, sz, 0.1 * (i % 2 ? 1 : -1)));
      g.restore();
    }
    // you, from behind, walking up the path (the sun ahead-left throws your shadow back at us)
    const u = K.ease.inOut(K.seg(t, 52, 60));
    const idx = K.lerp(2, 9, u);
    const i0 = Math.floor(idx), fr = idx - i0;
    const kx = K.lerp(PATH7[i0][0], PATH7[i0 + 1][0], fr), ky = K.lerp(PATH7[i0][1], PATH7[i0 + 1][1], fr);
    const kh = K.lerp(250, 120, u);
    const ph = t * 0.95;
    // footfalls: the body drops onto each planted foot and rises over it; the coat swings behind
    const step = Math.abs(Math.sin(ph * Math.PI * 2));
    const bob = -(1 - step) * kh * 0.016;
    const swing = Math.sin(ph * Math.PI * 2) * 0.035;
    // the long low-sun shadow, falling back toward the camera and to the right, soft at its far end
    g.save();
    g.translate(kx, ky);
    g.transform(1, 0, -0.7, 1, 0, 0);
    g.scale(1, -0.55);
    for (let k = 0; k < 4; k++) {
      const f = k / 3;
      K.shadowBlob(g, 0, kh * (0.12 + 0.62 * f), kh * (0.07 + 0.03 * f), kh * 0.16, { alpha: 0.32 * (1 - f * 0.6), color: "#16241a", soft: 0.6 + f });
    }
    g.restore();
    g.save();
    g.translate(kx, ky + bob);
    g.transform(1, 0, swing * 0.4, 1, 0, 0);
    K.drawPerson(g, 0, 0, kh, {
      view: "back", walk: true, phase: ph, hood: false, bell: true, t, wet: 0.15,
      coat: "#7e7458", pants: "#2e3442", boots: "#3a2e26", hair: "#3a2416",
      light: { x: SUN7.x - kx, y: SUN7.y - ky, color: "#ffd8a8", strength: 1.6, z: -0.7 }, ambient: "#5a6684", fill: "#3a4258",
    });
    g.restore();
    butterflies(g, t, { seed: 6, count: 3, area: [140, 280, 700, 160] });
    dewField(g, t, -40, W + 40, 400, 540, 17, 90);
  });
  g.save();
  const sw = Math.sin(t * 1.25) * 0.012;
  g.translate(480, H + 40); g.transform(1, 0, sw, 1, 0, 0); g.translate(-480 - 100, -(H + 40));
  g.drawImage(dewFg(8), 0, 150, W + 200, H + 40);
  g.restore();
  K.godRays(g, SUN7.x, SUN7.y, W, H, { color: "#ffe2b8", count: 8, strength: 0.1, t, angle: 0.85, spread: 0.8, length: 900, seed: 3 });
}
// butterflies: small, two-tone wings with real flap foreshortening (cabbage whites + a fritillary)
function butterflies(g, t, o = {}) {
  const seed = o.seed || 8, n = o.count || 3;
  const [ax, ay, aw, ah] = o.area;
  const cols = [["#f4efe2", "#b8b0a0"], ["#e09040", "#5a3418"], ["#f4efe2", "#a8a090"]];
  for (let i = 0; i < n; i++) {
    const x = ax + aw * (0.5 + 0.5 * K.noise(t * 0.22 + i * 5.1, seed));
    const y = ay + ah * (0.5 + 0.5 * K.noise(t * 0.3 + i * 2.7, seed + 2));
    const flap = Math.abs(Math.cos(t * 13 + i * 2));
    const s = 3.2 * (0.8 + K.hash(i, seed) * 0.4);
    const [c1, c2] = cols[i % cols.length];
    g.save();
    g.translate(x, y);
    g.rotate(Math.sin(t * 2 + i) * 0.3);
    g.fillStyle = flap > 0.5 ? c1 : c2;
    g.beginPath();
    g.ellipse(-s * 0.5 * flap, -s * 0.2, s * 0.55 * flap + 0.3, s * 0.6, -0.3, 0, K.TAU);
    g.ellipse(s * 0.5 * flap, -s * 0.2, s * 0.55 * flap + 0.3, s * 0.6, 0.3, 0, K.TAU);
    g.fill();
    g.fillStyle = "#1a140e";
    g.fillRect(-0.35, -s * 0.5, 0.7, s);
    g.restore();
  }
}

// ================================================================================================
const SHOTS = [
  { a: 0, b: 9, draw: shotCrane },
  { a: 9, b: 17, xf: 0.4, draw: shotShoulder },
  { a: 17, b: 24, draw: shotWrist },
  { a: 24, b: 33, draw: shotStatue },          // hard cut (a dissolve stacked hand + cat + statue)
  { a: 33, b: 44, xf: 0.5, draw: shotDew },
  { a: 44, b: 52, draw: shotLoaf, warm: Array.from({ length: 81 }, (_, i) => 44 + i * 0.1) }, // every cached pose
  { a: 52, b: 60, draw: shotWalk },            // hard cut
];

function post(g, t) {
  K.letterbox(g, W, H, 1);
  K.fadeBlack(g, W, H, Math.max(1 - K.smooth(K.seg(t, 0, 1.0)), K.smooth(K.seg(t, 58.5, 60))));
}

// ---- sequencer ------------------------------------------------------------------------------------
// Like lib012 runFilm (cuts + optional dissolves), but every shot's static art is built ONCE, on the
// first frame drawn at a given pixel scale (the film opens on black and the player clamps dt, so the
// one-time build costs nothing on screen). After that no frame builds anything: every cache key is
// independent of t and of the dissolve alpha. Posters (tiny pixel scales) skip the warm-up.
const WARMED = new Set();
function warmShot(s) {
  const L = K.layer(W, H, "f01-warm");
  {
    for (const tt of s.warm || [s.a + 0.02, (s.a + s.b) / 2, s.b - 0.05]) {
      L.g.save();
      try { s.draw(L.g, tt, K.seg(tt, s.a, s.b)); } catch (err) { console.warn("[f01] warm", err); }
      L.g.restore();
    }
  }
}
function runShots(g, t, W2, H2) {
  g.save();
  try {
    if (W2 !== W || H2 !== H) g.scale(W2 / W, H2 / H);
    const px = K.pixelScale();
    // while the film opens on black (t < 0.98) each 0.14 s slice of t warms the shots up to its
    // index (keyed by t, so a frame redrawn at the same t never rebuilds anything); after a seek,
    // the next shot is warmed once ~1.5 s ahead of its cut
    if (px >= 0.5) {
      const warm = (j) => { const id = j + "@" + px; if (!WARMED.has(id)) { WARMED.add(id); warmShot(SHOTS[j]); } };
      if (t < 0.98) for (let j = 1; j <= Math.min(SHOTS.length - 1, Math.floor(t / 0.14) + 1); j++) warm(j);
      for (let j = 1; j < SHOTS.length; j++) if (SHOTS[j].a > t && SHOTS[j].a - t < 1.5) warm(j);
    }
    let i = 0;
    for (let k = 0; k < SHOTS.length; k++) if (t >= SHOTS[k].a) i = k;
    const s = SHOTS[i], xf = s.xf || 0;
    const one = (c, sh) => { c.save(); try { sh.draw(c, t, K.seg(t, sh.a, sh.b)); } finally { c.restore(); } };
    if (xf > 0 && i > 0 && t < s.a + xf) {
      one(g, SHOTS[i - 1]);
      const L = K.layer(W, H, "f01-xfade");
      one(L.g, s);
      g.save();
      g.globalAlpha = K.smooth((t - s.a) / xf);
      g.drawImage(L.canvas, 0, 0, W, H);
      g.restore();
    } else one(g, s);
    post(g, t);
  } finally {
    g.restore();
  }
}

// per-shot lens grades (golden-hour recipe), eased across the cuts so nothing pops. Grain is kept
// low (the lens weights it toward the darker tones) and sharpening raised so the focal plane reads
// crisp; bloom only comes from real lights (threshold above diffuse white).
const GR = { grain: 0.028, grainSize: 1.1, sharpen: 0.34 };
const GRADES = [
  [0, Object.assign({ temp: 0.12, tint: -0.05, exposure: 0.9, sat: 0.98, contrast: 1.14, bloom: 0.22, threshold: 1.05, halation: 0.32, gain: [1.03, 1, 0.96], lift: [0.004, 0.003, 0.012] }, GR)],
  [9, Object.assign({ temp: 0.16, tint: -0.04, exposure: 0.88, sat: 0.97, contrast: 1.16, bloom: 0.16, threshold: 1.1, halation: 0.28, gain: [1.04, 1, 0.95], lift: [0.003, 0.003, 0.01] }, GR)],
  [17, Object.assign({ temp: 0.2, tint: -0.03, exposure: 0.92, sat: 0.97, contrast: 1.12, bloom: 0.24, threshold: 1.05, halation: 0.38, gain: [1.04, 1, 0.94], lift: [0.006, 0.004, 0.01] }, GR)],
  [24, Object.assign({ temp: 0.16, tint: -0.02, exposure: 0.9, sat: 0.94, contrast: 1.14, bloom: 0.2, threshold: 1.08, halation: 0.32, gain: [1.04, 1, 0.94], lift: [0.005, 0.004, 0.011] }, GR)],
  [33, Object.assign({ temp: 0.14, tint: 0.02, exposure: 0.9, sat: 1.0, contrast: 1.12, bloom: 0.24, threshold: 1.05, halation: 0.36, gain: [1.03, 1, 0.94], lift: [0.004, 0.006, 0.01] }, GR)],
  [44, Object.assign({ temp: 0.16, tint: 0.01, exposure: 0.9, sat: 0.98, contrast: 1.12, bloom: 0.24, threshold: 1.05, halation: 0.4, gain: [1.04, 1, 0.94], lift: [0.004, 0.006, 0.01] }, GR)],
  [52, Object.assign({ temp: 0.18, tint: 0.0, exposure: 0.9, sat: 0.96, contrast: 1.12, bloom: 0.24, threshold: 1.05, halation: 0.4, gain: [1.05, 1, 0.93], lift: [0.005, 0.006, 0.01] }, GR)],
];
function mixGrade(a, b, k) {
  const o = {};
  for (const key of Object.keys(a)) {
    const va = a[key], vb = b[key];
    o[key] = Array.isArray(va) ? va.map((v, i) => K.lerp(v, vb[i], k)) : K.lerp(va, vb, k);
  }
  return o;
}
function gradeAt(t) {
  let i = 0;
  for (let k = 0; k < GRADES.length; k++) if (t >= GRADES[k][0]) i = k;
  const cur = GRADES[i][1];
  if (i === 0) return cur;
  const k = K.smooth((t - GRADES[i][0]) / 0.8);
  return k >= 1 ? cur : mixGrade(GRADES[i - 1][1], cur, k);
}

export const film = {
  id: 1,
  title: "The Plaza of Lost Cats",
  chapter: "Chapter 1",
  unlockAt: 5,
  duration: 60,
  poster: 30,
  tagline: "A world full of lost cats. Somewhere in it, yours.",
  subs: [
    [3.0, 6.5, "You woke up somewhere new."],
    [10.0, 13.5, "A plaza full of cats. None of them yours."],
    [14.5, 16.5, "Every one of them was lost."],
    [19.0, 22.5, "You tied his bell to your wrist."],
    [25.5, 30.0, "The old stone cat seemed to point the way."],
    [35.0, 38.5, "And there, in the dew..."],
    [39.0, 42.5, "His pawprints. Still warm."],
    [46.0, 49.5, "Biscuit?"],
    [50.0, 52.0, "No. Just a very round cat."],
    [54.0, 58.0, "Find the lost cats. They will lead you to him."],
  ],
  voice: [
    [3.0, "You woke up somewhere new.", { rate: 0.92, pitch: 1.0 }],
    [10.0, "A plaza full of cats. None of them yours.", { rate: 0.92, pitch: 1.0 }],
    [14.5, "Every one of them was lost.", { rate: 0.92, pitch: 1.0 }],
    [19.0, "You tied his bell to your wrist.", { rate: 0.92, pitch: 1.0 }],
    [25.5, "The old stone cat seemed to point the way.", { rate: 0.92, pitch: 1.0 }],
    [35.0, "And there, in the dew...", { rate: 0.92, pitch: 1.0 }],
    [39.0, "His pawprints. Still warm.", { rate: 0.92, pitch: 1.0 }],
    [46.0, "Biscuit?", { rate: 1.0, pitch: 1.1 }],
    [50.0, "No. Just a very round cat.", { rate: 1.0, pitch: 1.1 }],
    [54.0, "Find the lost cats. They will lead you to him.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: { mood: "hopeful", key: "G", bpm: 84, cues: [[1, "swell"], [18, "bell"], [33, "meow"], [44, "swell"], [56, "bell"]] },
  grade: GRADES[0][1],
  gradeAt,
  draw(g, t, W2, H2) {
    runShots(g, t, W2, H2);
  },
};
