// films/f00.js - Prologue: "The Night He Left" (FILMS.md f00). 72 s, storm.
// A stormy night: Biscuit watches the window, follows glowing amber pawprints out through the cat
// flap and leaps into a paw portal between two old standing stones. You find his bell in the mud,
// the stones glow again, and the light pulls you through to the Cat Plaza at dawn.
// draw(g, t, W, H) is a pure function of t; static art is cached by the kit.
import * as K from "../filmkit.js";
import { PLAZA_HZ } from "./lib012.js";
import { vgrad, ridge, treeSil, rimStone, nightHouse, tinted, dimCoat, statueSprite, W0 as W, H0 as H } from "./lib012.js";

const STORM_TOP = "#0b1424", STORM_LOW = "#1c2c44", SODIUM = "#ffb25a", BOLT = "#dfe9ff", LAMP = "#ffcf8a";

const sm01 = (a, b, x) => { const u = K.clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };

// ---- light: one falloff law for the light map, the rain and the splashes -----------------------------
// fall(u): ~1/(1+d^2) inverse-square light, faded to exactly 0 at the light's radius (u = d / r).
const fall = (u) => (u >= 1 ? 0 : (1 / (1 + 30 * u * u) - 1 / 31) * (31 / 30));
const FO = [[0, 1], [0.08, 0.72], [0.2, 0.4], [0.38, 0.17], [0.6, 0.06], [0.8, 0.015], [1, 0]];
// the same falloff as a cached radial sprite per colour (stamped, never rebuilt per frame)
function falloffSpr(color) {
  return K.sprite("f00-fo:" + color, 128, 128, (s) => {
    const gr = s.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [u, a] of FO) gr.addColorStop(u, K.rgba(color, a));
    s.fillStyle = gr;
    s.fillRect(0, 0, 128, 128);
  });
}
function stampLight(s, l) {
  let a = l.k == null ? 1 : l.k;
  if (a <= 0.004 || !(l.r > 0)) return;
  const spr = falloffSpr(l.color), r = l.r, fy = l.flat || 1;
  while (a > 0.004) { s.globalAlpha = Math.min(1, a); s.drawImage(spr, l.x - r, l.y - r * fy, 2 * r, 2 * r * fy); a -= 1; }
  s.globalAlpha = 1;
}
// a flashlight / lamp cone as light: soft gaussian across, inverse-square along (cached per colour)
function coneSpr(color) {
  return K.sprite("f00-cone:" + color, 256, 128, (s) => {
    for (let i = 0; i < 64; i++) {
      const x0 = i * 4, u = (x0 + 2) / 256;
      const along = (u < 0.06 ? u / 0.06 : 1) * (1 / (1 + 7 * u * u)) * (1 - sm01(0.75, 1, u));
      const gr = s.createLinearGradient(0, 0, 0, 128);
      for (const [v, a] of [[0, 0], [0.2, 0.08], [0.35, 0.45], [0.5, 1], [0.65, 0.45], [0.8, 0.08], [1, 0]]) gr.addColorStop(v, K.rgba(color, a * along));
      s.fillStyle = gr;
      s.fillRect(x0, 0, 4.5, 128);
    }
  });
}
function stampCone(s, c, alpha = 1) {
  const spr = coneSpr(c.color);
  const half = c.len * Math.tan(c.spread / 2) * 1.6;
  s.save();
  s.translate(c.x, c.y);
  s.rotate(c.ang);
  // the wedge: each column of the sprite is squeezed toward the apex
  s.beginPath();
  s.moveTo(0, 0); s.lineTo(c.len, -half); s.lineTo(c.len, half); s.closePath();
  s.clip();
  let a = (c.k == null ? 1 : c.k) * alpha;
  while (a > 0.004) { s.globalAlpha = Math.min(1, a); s.drawImage(spr, 0, -half, c.len, half * 2); a -= 1; }
  s.restore();
}
// relight(g, ambient, lights, unlit, paint, cones): multiply everything painted so far by a light map:
// the ambient colour plus each light's inverse-square falloff (quarter resolution, additive). Per
// frame only cached sprite stamps and fills - nothing is rebuilt. lights: [{x,y,r,color,k,flat}].
const LM_Q = 4, LM_X = -80, LM_Y = -80, LM_W = W + 160, LM_H = H + 160;
function lightMap(ambient, lights, unlit, paint, cones, key = "f00-lightmap") {
  const L = K.layer(Math.ceil(LM_W / LM_Q), Math.ceil(LM_H / LM_Q), key);
  const s = L.g;
  s.fillStyle = ambient;
  s.fillRect(0, 0, L.W, L.H);
  s.save();
  s.scale(1 / LM_Q, 1 / LM_Q);
  s.translate(-LM_X, -LM_Y);
  s.globalCompositeOperation = "lighter";
  for (const l of lights) stampLight(s, l);
  if (cones) for (const c of cones) stampCone(s, c);
  if (paint) paint(s);
  s.globalCompositeOperation = "source-over";
  s.globalAlpha = 1;
  if (unlit) { s.fillStyle = "#ffffff"; unlit(s); }
  s.restore();
  return L;
}
function relight(g, ambient, lights, unlit, paint, cones) {
  const L = lightMap(ambient, lights, unlit, paint, cones);
  g.save();
  g.globalCompositeOperation = "multiply";
  g.imageSmoothingEnabled = true;
  g.drawImage(L.canvas, 0, 0, L.canvas.width, L.canvas.height, LM_X, LM_Y, LM_W, LM_H);
  g.restore();
}
// bakeLit(key, x, y, w, h, content, light): a cached plate - content(c) painted in world coords,
// multiplied by the light map light() returns, keeping the content's own alpha (sky stays clear).
function bakeLit(key, x, y, w, h, content, light) {
  return K.sprite(key, w, h, (s) => {
    const ps = K.pixelScale();
    const C = K.makeCanvas(w * ps, h * ps);
    const c = C.getContext("2d");
    c.setTransform(ps, 0, 0, ps, -x * ps, -y * ps);
    content(c);
    const L = light();
    s.save();
    s.translate(-x, -y);
    s.imageSmoothingEnabled = true;
    s.drawImage(L.canvas, 0, 0, L.canvas.width, L.canvas.height, LM_X, LM_Y, LM_W, LM_H);
    s.restore();
    s.globalCompositeOperation = "multiply";
    s.drawImage(C, 0, 0, w, h);
    s.globalCompositeOperation = "destination-in";
    s.drawImage(C, 0, 0, w, h);
    s.globalCompositeOperation = "source-over";
  });
}

// ---- light sampled at a point (for rain and splashes) ---------------------------------------------------
// o.lights [{x,y,r,color,k,flat,src}] (src: the source is in frame, so drops in front of it are back-lit
// and forward scattering makes them much brighter), o.cones [{x,y,ang,len,spread,color,k}],
// o.amb (0..1 ambient visibility), o.ambColor. Writes [intensity, dominant light index] into out.
function lumAt(o, x, y, out) {
  let I = o.amb || 0, best = I * 0.5, bi = -1;
  const Ls = o.lights || [];
  for (let i = 0; i < Ls.length; i++) {
    const l = Ls[i];
    const dx = x - l.x, dy = (y - l.y) / (l.flat || 1), d = Math.sqrt(dx * dx + dy * dy) / l.r;
    if (d >= 1) continue;
    let c = (l.k == null ? 1 : l.k) * fall(d);
    if (l.src && d < 0.45) c *= 1 + 2.2 * (1 - d / 0.45);
    I += c;
    if (c > best) { best = c; bi = i; }
  }
  const Cs = o.cones || [];
  for (let i = 0; i < Cs.length; i++) {
    const c = Cs[i];
    const ca = Math.cos(c.ang), sa = Math.sin(c.ang);
    const dx = x - c.x, dy = y - c.y;
    const al = dx * ca + dy * sa;
    if (al <= 2 || al >= c.len) continue;
    const ac = Math.abs(-dx * sa + dy * ca) / (al * Math.tan(c.spread / 2) + 1);
    if (ac > 1.3) continue;
    const u = al / c.len;
    const v = (c.k == null ? 1 : c.k) * Math.exp(-ac * ac * 2.6) * (1 / (1 + 7 * u * u)) * (1 - sm01(0.75, 1, u)) * Math.min(1, al / 25);
    I += v;
    if (v > best) { best = v; bi = Ls.length + i; }
  }
  out[0] = I; out[1] = bi;
  return out;
}
const LUM = [0, 0];
function lumColor(o, bi) {
  const Ls = o.lights || [];
  if (bi < 0) return o.ambColor || "#a8b4cc";
  const l = bi < Ls.length ? Ls[bi] : o.cones[bi - Ls.length];
  return l._rc || (l._rc = K.mix(l.color, "#ffffff", 0.3));
}

// ---- rain: three depth layers, each drop only as bright as the light that reaches it ---------------------
// far = fine and dim, mid, near = long, wide, soft (out of focus). A drop shows only where it crosses a
// light (lamp, window, torch cone, portal) and is back-lit bright in front of a visible source.
const RAIN_LAYERS = [
  { n: 560, sp: 640, len: [8, 14], w: 0.55, a: 0.45, soft: 0 },
  { n: 210, sp: 980, len: [20, 32], w: 1.0, a: 0.6, soft: 0 },
  { n: 26, sp: 1550, len: [70, 130], w: 2.6, a: 0.3, soft: 1 },
];
function rain3(g, t, o) {
  const [x0, y0, x1, y1] = o.area || [-60, -60, W + 60, H + 60];
  const ang = o.angle == null ? 0.2 : o.angle, tanA = Math.tan(ang), sx = Math.sin(ang), cy = Math.cos(ang);
  const dens = o.density == null ? 1 : o.density, seed = o.seed || 7;
  const ww = x1 - x0 + 200, hh = y1 - y0;
  g.save();
  g.lineCap = "round";
  g.globalCompositeOperation = "lighter";
  for (let li = 0; li < 3; li++) {
    const RL = RAIN_LAYERS[li];
    const buckets = new Map();
    const n = Math.round(RL.n * dens * (li === 2 ? (o.near == null ? 1 : o.near) : 1));
    for (let i = 0; i < n; i++) {
      const r1 = K.hash(i, seed + li * 17), r2 = K.hash(i + 0.5, seed + li * 17), r3 = K.hash(i + 0.25, seed + li * 17);
      const L = RL.len[0] + (RL.len[1] - RL.len[0]) * r3;
      const sp = RL.sp * (0.85 + r1 * 0.3);
      const span = hh + L + 40;
      const y = y0 - L + ((r2 * span + t * sp) % span);
      const x = x0 - 100 + ((((r1 * ww + (y - y0) * tanA) % ww) + ww) % ww);
      lumAt(o, x - sx * L * 0.5, y - cy * L * 0.5, LUM);
      const I = LUM[0];
      if (I < 0.06) continue;
      const lvl = Math.min(6, Math.round(I * 6 * (0.7 + 0.6 * r3)));
      if (lvl < 1) continue;
      const k = LUM[1] * 8 + lvl;
      let p = buckets.get(k);
      if (!p) { p = new Path2D(); buckets.set(k, p); }
      p.moveTo(x, y);
      p.lineTo(x - sx * L, y - cy * L);
    }
    for (const [k, p] of buckets) {
      const lvl = ((k % 8) + 8) % 8, bi = Math.round((k - lvl) / 8);
      g.strokeStyle = lumColor(o, bi);
      const A = RL.a * (lvl / 6) * (o.alpha == null ? 1 : o.alpha);
      if (RL.soft) {
        g.globalAlpha = A * 0.35; g.lineWidth = RL.w * 2.4; g.stroke(p);
        g.globalAlpha = A * 0.45; g.lineWidth = RL.w; g.stroke(p);
      } else {
        g.globalAlpha = A; g.lineWidth = RL.w; g.stroke(p);
      }
    }
  }
  g.restore();
}
// splashes only where light hits the ground: a crown of droplets and a ripple ring.
// o.y0..y1 ground band (farther = smaller), o.x0..x1, o.n, plus the lumAt() lights.
function splash3(g, t, o) {
  const n = o.n || 80, seed = o.seed || 9;
  const rings = new Map(), crowns = new Map();
  const get = (m, k) => { let p = m.get(k); if (!p) { p = new Path2D(); m.set(k, p); } return p; };
  for (let i = 0; i < n; i++) {
    const per = 0.45 + K.hash(i, seed) * 0.5;
    const tt = t + K.hash(i + 0.3, seed) * per;
    const cyc = Math.floor(tt / per), ph = tt / per - cyc;
    const x = K.lerp(o.x0, o.x1, K.hash(i * 13.1 + cyc * 7.7, seed));
    const y = K.lerp(o.y0, o.y1, Math.pow(K.hash(i * 3.3 + cyc * 1.9, seed), 0.7));
    lumAt(o, x, y, LUM);
    if (LUM[0] < 0.08) continue;
    const lvl = Math.min(5, Math.round(LUM[0] * 5));
    if (lvl < 1) continue;
    const key = LUM[1] * 8 + lvl;
    const k = (0.45 + (y - o.y0) / Math.max(1, o.y1 - o.y0)) * (o.scale || 1);
    const r = (1.2 + ph * 7) * k;
    const rp = get(rings, key);
    rp.moveTo(x + r, y);
    rp.ellipse(x, y, r, r * 0.27, 0, 0, K.TAU);
    if (ph < 0.35) {
      const q = ph / 0.35, cp = get(crowns, key);
      for (let d = 0; d < 5; d++) {
        const a = -Math.PI / 2 + (d - 2) * 0.45 + (K.hash(i + d, seed + cyc) - 0.5) * 0.3;
        const v = (6 + K.hash(i * 2 + d, seed) * 5) * k;
        const s = 0.9 * k * (1 - q * 0.5);
        cp.rect(x + Math.cos(a) * v * q - s / 2, y + (Math.sin(a) * v * q + 16 * k * q * q) * 0.9 - s / 2, s, s);
      }
    }
  }
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineWidth = 0.7;
  for (const [key, p] of rings) {
    const lvl = ((key % 8) + 8) % 8;
    g.strokeStyle = lumColor(o, Math.round((key - lvl) / 8));
    g.globalAlpha = 0.14 * lvl * (o.alpha == null ? 1 : o.alpha);
    g.stroke(p);
  }
  for (const [key, p] of crowns) {
    const lvl = ((key % 8) + 8) % 8;
    g.fillStyle = lumColor(o, Math.round((key - lvl) / 8));
    g.globalAlpha = 0.18 * lvl * (o.alpha == null ? 1 : o.alpha);
    g.fill(p);
  }
  g.restore();
}

// ---- drifting fog: a cached tileable fbm strip, two drawImages per frame ---------------------------------
function fogTex(seed, color) {
  const c = K.parseColor(color);
  return K.texBake("f00-fog:" + seed + ":" + color, 256, 48, (u, v, out) => {
    const n = K.texFbm(u * 6, v * 2, seed, 4, 6, 0);
    const a = K.clamp(0.45 + 0.9 * n) * Math.pow(Math.sin(Math.PI * v), 1.5);
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; out[3] = a * 255;
  });
}
function fogBand(g, y, h, color, alpha, t, seed, speed = 5, x0 = -80, w = W + 160) {
  if (alpha <= 0.003) return;
  const tex = fogTex(seed, color);
  const d = ((t * speed) % w + w) % w;
  g.save();
  g.globalAlpha *= alpha;
  g.drawImage(tex, x0 + d - w, y - h / 2, w + 1, h);
  g.drawImage(tex, x0 + d, y - h / 2, w + 1, h);
  g.restore();
}

// ---- baked organic silhouettes and surfaces (per-pixel work happens once, in texBake) ------------------
// canopySpr: a tree whose crown is a cloud of lobes broken up by leaf-scale fbm (ragged, see-through
// edges instead of a vector outline), a trunk and limbs showing through the gaps, a rim on the side
// facing o.dir (the light) and, when back-lit, translucent glowing leaves at the thin edges.
function canopySpr(seed, w, h, o) {
  const key = "f00-canopy:" + seed + ":" + w + "x" + h + ":" + JSON.stringify(o);
  const R = K.rng("canopy" + seed);
  const lobes = [];
  const nl = o.lobes || 16;
  for (let i = 0; i < nl; i++) {
    const a = (i / nl) * K.TAU * 2.3 + R() * 0.8;
    const d = i < 2 ? R() * 0.06 : 0.08 + R() * 0.22;
    lobes.push({ x: 0.5 + Math.cos(a) * d * 1.3, y: (o.cy || 0.36) + Math.sin(a) * d * 0.85, r: 0.09 + R() * 0.08 });
  }
  const segs = [[0.5 + (R() - 0.5) * 0.05, 1.0, 0.5, 0.58, 0.035]];
  for (let i = 1; i < 5; i++) segs.push([0.5, 0.6 + R() * 0.06, lobes[i].x, lobes[i].y, 0.013]);
  const base = o.base, rim = o.rim, lit = o.lit, trunk = o.trunk || o.base;
  const dx = (o.dir || [0, -1])[0] * 0.012, dy = (o.dir || [0, -1])[1] * 0.012;
  const lobeAt = (u, v) => {
    let d = -1;
    for (const L of lobes) { const ax = (u - L.x) / L.r, ay = (v - L.y) / (L.r * 0.82); const q = 1 - (ax * ax + ay * ay); if (q > d) d = q; }
    return d;
  };
  return K.texBake(key, w, h, (u, v, out) => {
    const n1 = K.texFbm(u * 6, v * 6, seed, 4), n2 = K.texFbm(u * 16, v * 16, seed + 5, 2), lf = K.texNoise(u * 64, v * 64, seed + 3);
    const D = lobeAt(u, v) * 0.8 + n1 * 0.45 + n2 * 0.3 + lf * 0.34;
    const la = sm01(0.02, 0.1, D);
    let ta = 0;
    if (la < 0.98) {
      for (const [ax, ay, bx, by, wd] of segs) {
        const px = bx - ax, py = by - ay, l2 = px * px + py * py;
        const s = K.clamp(((u - ax) * px + (v - ay) * py) / l2);
        const qx = ax + px * s - u, qy = ay + py * s - v;
        const ww = wd * (1 - 0.45 * s) + 0.004 * K.texNoise(v * 40, u * 3, seed + 9);
        const a = sm01(ww, ww * 0.55, Math.sqrt(qx * qx + qy * qy));
        if (a > ta) ta = a;
      }
    }
    const A = Math.max(la, ta);
    if (A <= 0.003) { out[3] = 0; return; }
    let shade = 0.72 + 0.28 * (lf * 0.5 + 0.5);
    let skyA = 0;
    if (o.vol) {
      // a canopy is a volume: clump tops that face the sky catch it, the inside of the crown and its
      // underside sit in their own shadow
      const Dup = lobeAt(u, v - 0.03) * 0.8 + K.texFbm(u * 6, (v - 0.03) * 6, seed, 4) * 0.45 + n2 * 0.3 + lf * 0.34;
      const up = K.clamp((D - Dup) * 7);
      const inner = sm01(0.12, 0.55, D);
      const vk = K.clamp(1.25 - v * 1.5);
      shade *= (0.42 + 0.3 * vk + 0.45 * up) * (1 - 0.5 * inner * (1 - up));
      skyA = up * vk * o.vol;
    }
    const Dl = lobeAt(u + dx, v + dy) * 0.8 + K.texFbm((u + dx) * 6, (v + dy) * 6, seed, 4) * 0.45 + n2 * 0.3 + lf * 0.34;
    const rimA = K.clamp((D - Dl) * 9) * la * sm01(0.25, 0.0, D) * (o.rimK == null ? 1 : o.rimK);
    const litA = lit ? sm01(0.3, 0.0, D) * la * (o.litK || 1) : 0;
    const wl = la / Math.max(A, 0.001);
    for (let c = 0; c < 3; c++) {
      let v0 = base[c] * shade * wl + trunk[c] * (1 - wl);
      v0 += rim[c] * rimA;
      if (skyA) v0 += (o.sky || [200, 200, 230])[c] * 0.3 * skyA * wl;
      if (lit) v0 += lit[c] * litA;
      out[c] = v0;
    }
    out[3] = A * 255;
  });
}
// stoneSpr: an old granite standing stone baked per pixel - a weathered slab outline, fbm relief
// (normals), crystalline speckle, crusty lichen and moss at the foot, a wet darkened surface with rain
// rivulets catching specular, lit by a key from direction o.L ([x,y,z], screen space) plus a sky fill.
function stoneSpr(seed, w, h, o) {
  const key = "f00-stone:" + seed + ":" + w + "x" + h + ":" + JSON.stringify(o);
  const L = o.L, ll = Math.hypot(L[0], L[1], L[2]);
  const lx = L[0] / ll, ly = L[1] / ll, lz = L[2] / ll;
  const hx0 = lx, hy0 = ly, hz0 = lz + 1, hl = Math.hypot(hx0, hy0, hz0);
  const Hx = hx0 / hl, Hy = hy0 / hl, Hz = hz0 / hl;
  const kc = o.key, ac = o.amb, wet = o.wet == null ? 1 : o.wet;
  const asp = h / w;
  return K.texBake(key, w, h, (u, v, out) => {
    // a weathered standing stone: tapering to a worn, lopsided crown, leaning a little, its flanks
    // chipped (fbm on the width), never a slab with parallel sides
    const lean = o.lean == null ? (seed % 2 ? 0.25 : -0.2) : o.lean;
    const cx = 0.5 + lean * (1 - v) * 0.12;
    const top = 0.03 + 0.24 * Math.pow(Math.abs(2 * (u - cx) - lean * 0.5), 1.5) + 0.05 * K.texFbm(u * 5, 0.3, seed + 1, 3);
    const hw = (0.31 + 0.15 * Math.pow(v, 0.7)) * (1 + 0.14 * K.texFbm(v * 4, 1.7 + (u < cx ? 0 : 3), seed + 2, 3));
    const ex = Math.abs(u - cx) / hw;
    if (ex >= 1 || v <= top) { out[3] = 0; return; }
    const hg = K.texFbm(u * 6, v * 6 * asp, seed, 5);
    const e = 0.012;
    const gx = (K.texFbm((u + e) * 6, v * 6 * asp, seed, 5) - hg) / e, gy = (K.texFbm(u * 6, (v + e) * 6 * asp, seed, 5) - hg) / e;
    let nx = ((u - cx) / hw) * 0.92, ny = -sm01(top + 0.14, top, v) * 0.85;
    nx -= gx * 0.035; ny -= gy * 0.035;
    const nz2 = 1 - nx * nx - ny * ny;
    let nz = nz2 > 0.02 ? Math.sqrt(nz2) : 0.14;
    const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    // albedo: grey granite, speckled, lichen crust, moss at the foot, wet = darker
    const sp = K.texNoise(u * w * 0.45, v * h * 0.45, seed + 5);
    let alb = 0.36 + 0.08 * K.texFbm(u * 3, v * 3, seed + 3, 3) + (sp > 0.5 ? 0.09 : sp < -0.5 ? -0.08 : 0);
    let ar = alb, ag = alb, ab = alb * 1.04;
    const lk = K.texFbm(u * 4 + 3, v * 4 * asp, seed + 7, 4) + 0.25 * K.texNoise(u * 40, v * 40, seed + 8);
    const lA = sm01(0.18, 0.32, lk) * (o.lichen == null ? 0.55 : o.lichen);
    ar += (0.5 - ar) * lA; ag += (0.5 - ag) * lA; ab += (0.36 - ab) * lA;
    const mA = sm01(0.72, 1.0, v + 0.06 * K.texFbm(u * 9, 2, seed + 4, 3)) * 0.8;
    ar += (0.1 - ar) * mA; ag += (0.15 - ag) * mA; ab += (0.08 - ab) * mA;
    const wd = 1 - 0.38 * wet;
    ar *= wd; ag *= wd; ab *= wd;
    const dif = Math.max(0, (nx * lx + ny * ly + nz * lz + 0.15) / 1.15);
    const sky = 0.5 + 0.5 * Math.max(0, -ny) + 0.2 * nz;
    const ao = (1 - 0.55 * sm01(0.7, 1, v)) * (1 - 0.35 * sm01(0.7, 1, ex));
    const riv = sm01(0.05, 0.6, K.texNoise(u * w * 0.12, v * 2.2, seed + 9));
    const spec = Math.pow(Math.max(0, nx * Hx + ny * Hy + nz * Hz), 22) * (0.25 + 0.75 * riv) * wet * (o.specK == null ? 0.8 : o.specK);
    const aa = K.clamp((1 - ex) * hw * w * 1.6) * K.clamp((v - top) * h * 1.2);
    out[0] = (ar * (kc[0] * dif * o.keyK + ac[0] * sky * o.ambK) * ao + kc[0] * spec) * 1.0;
    out[1] = (ag * (kc[1] * dif * o.keyK + ac[1] * sky * o.ambK) * ao + kc[1] * spec) * 1.0;
    out[2] = (ab * (kc[2] * dif * o.keyK + ac[2] * sky * o.ambK) * ao + kc[2] * spec) * 1.0;
    out[3] = aa * 255;
  });
}
// a pre-blurred copy of any cached canvas (blur paid once, at bake time)
function blurredSpr(key, src, w, h, px) {
  return K.sprite(key, w, h, (s) => {
    if (K.hasFilter()) s.filter = "blur(" + (px * K.pixelScale()).toFixed(1) + "px)";
    s.drawImage(src, 0, 0, w, h);
    s.filter = "none";
  });
}

// ---- fur / cloth rim passes (on a small box layer, a few composites, no pixel loops) -------------------------
function strandTex() {
  return K.texBake("f00-strand", 128, 128, (u, v, out) => {
    const n = K.texNoise(u * 40, v * 4, 71, 40, 4) * 0.7 + K.texNoise(u * 80, v * 7, 72, 80, 7) * 0.3;
    out[0] = out[1] = out[2] = 255; out[3] = sm01(-0.05, 0.45, n) * 255;
  });
}
function furGreyTex() {
  return K.texBake("f00-furgrey", 128, 128, (u, v, out) => {
    const n = K.texNoise(u * 26, v * 5, 73, 26, 5) * 0.6 + K.texNoise(u * 60, v * 10, 74, 60, 10) * 0.4;
    const c = 128 + n * 70;
    out[0] = out[1] = out[2] = c; out[3] = 255;
  });
}
const PATS = new WeakMap();
function patFor(ctx, tex) {
  let m = PATS.get(ctx);
  if (!m) { m = new Map(); PATS.set(ctx, m); }
  let p = m.get(tex);
  if (!p) { p = ctx.createPattern(tex, "repeat"); m.set(tex, p); }
  return p;
}
// rimPass: the edge of src (a box layer) that faces dir, coloured, broken into strands, added to g at
// (bx, by); a fainter copy pushed outward gives the stray back-lit hairs / fibres past the silhouette.
function rimPass(g, src, bx, by, BW, BH, dir, d, color, alpha, strands = true, key = "f00-rim") {
  if (alpha <= 0.01) return;
  const R = K.layer(BW, BH, key);
  const r = R.g;
  r.drawImage(src, 0, 0, BW, BH);
  r.globalCompositeOperation = "destination-out";
  r.drawImage(src, -dir[0] * d, -dir[1] * d, BW, BH);
  r.globalCompositeOperation = "source-in";
  r.fillStyle = color;
  r.fillRect(0, 0, BW, BH);
  if (strands) {
    r.globalCompositeOperation = "destination-in";
    r.fillStyle = patFor(r, strandTex());
    r.fillRect(0, 0, BW, BH);
  }
  r.globalCompositeOperation = "source-over";
  g.save();
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = Math.min(1, alpha);
  g.drawImage(R.canvas, bx, by, BW, BH);
  if (alpha > 1) { g.globalAlpha = Math.min(1, alpha - 1); g.drawImage(R.canvas, bx, by, BW, BH); }
  if (strands) { g.globalAlpha = Math.min(1, alpha) * 0.4; g.drawImage(R.canvas, bx + dir[0] * d * 0.8, by + dir[1] * d * 0.8, BW, BH); }
  g.restore();
}
// soft copy of a box layer (downsample + bilinear upsample: an optical blur with no canvas filter)
function softCopy(src, BW, BH, k, key) {
  const S = K.layer(Math.ceil(BW / k), Math.ceil(BH / k), key);
  S.g.imageSmoothingEnabled = true;
  S.g.drawImage(src, 0, 0, Math.ceil(BW / k), Math.ceil(BH / k));
  return S.canvas;
}

// ---- cached cats ---------------------------------------------------------------------------------------
// drawCat is the costliest call in the kit (10-40 ms for a big layered cat, lots of garbage). A cat is
// rendered once per distinct (quantised) look into its own canvas and stamped: the caller quantises
// the animated inputs (t, phase, head turn), the lights are stored relative to the cat and snapped to a
// grid, and the size is snapped to log steps (stamped at the exact size). `post(s, ax, ay, qs)` runs on
// the finished canvas (extra passes in the cat's local space). Bounded by bytes, oldest out first.
const CATC = new Map();
let CATC_BYTES = 0;
const qn = (v, step) => Math.round(v / step) * step;
function catCached(g, x, y, size, o, key, step = 0.06, post = null) {
  const qs = Math.max(10, Math.round(Math.exp(Math.round(Math.log(size) / step) * step)));
  const px = K.pixelScale();
  const bw = Math.ceil(qs * 4.6), bh = Math.ceil(qs * 3.4), ax = bw / 2, ay = Math.round(bh * 0.8);
  const rel = (L) => {
    if (!L) return L;
    const dx = (L.x - x) / size, dy = (L.y - y) / size;
    const a = qn(Math.atan2(dy, dx), K.TAU / 32), d = Math.exp(qn(Math.log(Math.max(0.4, Math.hypot(dx, dy))), 0.3));
    return { x: Math.round(Math.cos(a) * d * 100) / 100, y: Math.round(Math.sin(a) * d * 100) / 100, color: L.color, strength: qn(L.strength == null ? 1 : L.strength, 0.08) };
  };
  const oo = Object.assign({}, o, { key: rel(o.key), rim: rel(o.rim), light: rel(o.light) });
  const k = key + "|" + qs + "@" + px + "|" + JSON.stringify(oo);
  let c = CATC.get(k);
  if (!c) {
    while (CATC_BYTES > 48e6 && CATC.size) { const [k0, c0] = CATC.entries().next().value; CATC.delete(k0); CATC_BYTES -= c0.width * c0.height * 4; }
    c = K.makeCanvas(bw * px, bh * px);
    const s = c.getContext("2d");
    s.setTransform(px, 0, 0, px, 0, 0);
    const abs = (L) => L && Object.assign({}, L, { x: ax + L.x * qs, y: ay + L.y * qs });
    K.drawCat(s, ax, ay, qs, Object.assign({}, oo, { key: abs(oo.key), rim: abs(oo.rim), light: abs(oo.light) }));
    if (post) { s.save(); post(s, ax, ay, qs); s.restore(); }
    CATC.set(k, c);
    CATC_BYTES += c.width * c.height * 4;
  }
  const f = size / qs;
  g.drawImage(c, x - ax * f, y - ay * f, bw * f, bh * f);
}
// furFringe(s, w, h, d, alpha): stray guard hairs past the silhouette of whatever is on canvas s (a
// cached cat): the cat's own colours pushed out by d px in 8 directions, minus the cat, broken into
// strands by the strand texture, laid back at `alpha`. Bake-time only.
function furFringe(s, w, h, d, alpha) {
  const src = s.canvas, px = K.pixelScale();
  const F = K.makeCanvas(src.width, src.height), f = F.getContext("2d");
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * K.TAU;
    f.drawImage(src, Math.cos(a) * d * px, Math.sin(a) * d * px * 1.15 - d * px * 0.25);
  }
  f.globalCompositeOperation = "destination-out";
  f.drawImage(src, 0, 0);
  f.globalCompositeOperation = "destination-in";
  f.fillStyle = patFor(f, strandTex());
  f.fillRect(0, 0, F.width, F.height);
  s.save();
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalAlpha = alpha;
  s.drawImage(F, 0, 0);
  s.restore();
}
// wet fur: rain mats the coat into dark clumps with partings between them (a cached texture), the
// whole coat goes darker and more saturated, the underside falls into shadow, and the clump tips
// catch tiny specular glints. A catCached() post pass, so it is paid once per cached pose.
function clumpTex() {
  return K.texBake("f00-clumps", 128, 128, (u, v, out) => {
    const n = K.texNoise(u * 18, v * 5, 91, 18, 5) * 0.7 + K.texNoise(u * 40, v * 9, 92, 40, 9) * 0.3;
    const part = sm01(0.18, 0.02, Math.abs(n));
    const glint = K.texNoise(u * 64, v * 64, 93, 64, 64) > 0.72 && n > 0.3 ? 1 : 0;
    out[0] = glint ? 255 : 18; out[1] = glint ? 240 : 10; out[2] = glint ? 220 : 4;
    out[3] = 255 * Math.max(part * 0.85, glint * 0.6);
  });
}
function wetPost(wet, under = 0.5) {
  return (s, ax, ay, qs) => {
    const k = qs / 60, cw = s.canvas.width, ch = s.canvas.height;
    s.globalCompositeOperation = "source-atop";
    s.fillStyle = `rgba(46,22,8,${0.38 * wet})`;
    s.fillRect(0, 0, cw, ch);
    s.globalAlpha = Math.min(1, 0.45 * wet);
    s.fillStyle = patFor(s, clumpTex());
    s.save(); s.scale(0.6 * k, 0.6 * k); s.fillRect(0, 0, cw / (0.6 * k), ch / (0.6 * k)); s.restore();
    s.globalAlpha = 1;
    const ug = s.createLinearGradient(0, ay - 34 * k, 0, ay);
    ug.addColorStop(0, "rgba(6,4,4,0)"); ug.addColorStop(1, `rgba(6,4,4,${under})`);
    s.fillStyle = ug; s.fillRect(0, ay - 34 * k, cw, 36 * k);
    s.globalCompositeOperation = "source-over";
  };
}
// a photographic bokeh disc: an evenly lit aperture with a brighter rim (spherical aberration) and
// faint onion rings (an aspheric lens element); one sprite per colour
function bokehDisc(color) {
  return K.sprite("f00-bokeh:" + color, 96, 96, (s) => {
    const gr = s.createRadialGradient(48, 48, 0, 48, 48, 46);
    const st = [[0, 0.42], [0.18, 0.5], [0.3, 0.4], [0.42, 0.52], [0.55, 0.44], [0.68, 0.56], [0.8, 0.5], [0.9, 0.78], [0.96, 0.95], [1, 0]];
    for (const [u, a] of st) gr.addColorStop(u, K.rgba(color, a));
    s.fillStyle = gr;
    s.beginPath(); s.arc(48, 48, 46, 0, K.TAU); s.fill();
    // dust and a polishing mark on the element: a little texture inside the disc
    s.globalCompositeOperation = "destination-out";
    const R = K.rng("bokehdust" + color);
    for (let i = 0; i < 14; i++) { s.fillStyle = `rgba(0,0,0,${0.08 + R() * 0.14})`; s.beginPath(); s.arc(14 + R() * 68, 14 + R() * 68, 1 + R() * 3.5, 0, K.TAU); s.fill(); }
  });
}
// a disc at (x, y) radius r: cat-eye shaped toward the frame edges (mechanical vignetting: the far
// aperture circle clips it), brightness a
function drawBokeh(g, x, y, r, color, a) {
  if (a <= 0.01 || r < 1) return;
  const ex = (x - W / 2) / (W / 2), ey = (y - H / 2) / (W / 2);
  const k = 0.55 * r;
  g.save();
  g.beginPath();
  g.arc(x - ex * k, y - ey * k, r * 1.02, 0, K.TAU);
  g.clip();
  g.globalAlpha = a;
  g.drawImage(bokehDisc(color), x - r, y - r, 2 * r, 2 * r);
  g.restore();
}

// ---- the paw portal, volumetric: a noisy hot ring with chromatic fringes, a deep swirling interior,
// sparse light shafts that only read through the rain. All baked once; per frame only drawImages.
function portalRingTex() {
  return K.texBake("f00-pring", 256, 256, (u, v, out) => {
    const x = u * 2 - 1, y = v * 2 - 1, r = Math.hypot(x, y), a = Math.atan2(y, x);
    const n = K.texFbm(Math.cos(a) * 2.2 + 3, Math.sin(a) * 2.2 + 3, 5, 4);
    const n2 = K.texFbm(Math.cos(a) * 7 + 9, Math.sin(a) * 7 + 2, 6, 3);
    const bright = 0.55 + 0.45 * n + 0.25 * n2;
    const prof = (c, wd) => Math.exp(-((r - c) / wd) * ((r - c) / wd));
    const core = 0.74 + 0.012 * n2;
    const R = prof(core + 0.014, 0.03) * 1.05 + prof(core, 0.1) * 0.35 + (r < core ? 0.12 * sm01(0.2, core, r) : 0);
    const G = prof(core, 0.026) * 1.0 + prof(core, 0.09) * 0.3 + (r < core ? 0.14 * sm01(0.15, core, r) : 0);
    const B = prof(core - 0.014, 0.024) * 0.95 + prof(core - 0.03, 0.12) * 0.32 + (r < core ? 0.2 * sm01(0.1, core, r) : 0);
    const k = bright * sm01(1, 0.92, r);
    out[0] = 255 * K.clamp(R * k * 1.0); out[1] = 255 * K.clamp(G * k * 0.82); out[2] = 255 * K.clamp(B * k * 0.6 + 0.35 * B * (r < core ? 1 : 0) * k);
    out[3] = 255 * K.clamp(Math.max(out[0], out[1], out[2]) / 255);
  });
}
function portalSwirlTex() {
  return K.texBake("f00-pswirl", 192, 192, (u, v, out) => {
    const x = u * 2 - 1, y = v * 2 - 1, r = Math.hypot(x, y), a = Math.atan2(y, x);
    if (r > 0.78) { out[3] = 0; return; }
    const sw = a + r * 4.5;
    const n = K.texFbm(Math.cos(sw) * 2 + r * 3, Math.sin(sw) * 2 + r * 3, 8, 4);
    const k = K.clamp(0.5 + n) * sm01(0.78, 0.55, r) * (0.35 + 0.65 * sm01(0.0, 0.6, r));
    out[0] = 120 + 135 * K.clamp(r * 1.2); out[1] = 200 + 40 * r; out[2] = 255 - 80 * K.clamp(r * 1.2);
    out[3] = 255 * k * 0.7;
  });
}
function portalShaftTex() {
  return K.texBake("f00-pshaft", 256, 256, (u, v, out) => {
    const x = u * 2 - 1, y = v * 2 - 1, r = Math.hypot(x, y), a = Math.atan2(y, x);
    const n = K.texFbm(Math.cos(a) * 5 + 2, Math.sin(a) * 5 + 2, 13, 3) + 0.35 * K.texFbm(Math.cos(a) * 16, Math.sin(a) * 16, 14, 2) + 0.2 * K.texNoise(r * 6, a * 2, 15);
    const s = sm01(0.18, 0.5, n);
    const k = s * sm01(0.25, 0.4, r) * Math.pow(K.clamp(1 - r), 1.6);
    out[0] = 255; out[1] = 222; out[2] = 160; out[3] = 255 * k;
  });
}
// drawPortal(g, x, y, R, t, k, tilt): R = ring radius (px), k = intensity 0..1.6
function drawPortal(g, x, y, R, t, k, tilt = 0.12, shafts = 1) {
  if (R < 1 || k <= 0.01) return;
  g.save();
  g.globalCompositeOperation = "lighter";
  K.glow(g, x, y, R * 4.2, "#ffb860", 0.16 * k);
  K.glow(g, x, y, R * 1.9, "#ffd8a0", 0.18 * k);
  if (shafts > 0) {
    g.save();
    g.translate(x, y);
    g.rotate(t * 0.04);
    g.globalAlpha = Math.min(1, 0.55 * k * shafts);
    const S = R * 7;
    g.drawImage(portalShaftTex(), -S, -S, 2 * S, 2 * S);
    g.restore();
  }
  g.translate(x, y);
  g.scale(1, 1 - tilt);
  // heat shimmer: the ring breathes a little, unevenly
  const wob = 1 + 0.012 * Math.sin(t * 9.1) + 0.008 * Math.sin(t * 13.7);
  g.save();
  g.rotate(-t * 0.5);
  g.globalAlpha = Math.min(1, 0.38 * k);
  g.drawImage(portalSwirlTex(), -R * 1.28, -R * 1.28, R * 2.56, R * 2.56);
  g.restore();
  g.rotate(t * 0.18);
  const RR = (R / 0.74) * wob;
  g.globalAlpha = Math.min(1, k);
  g.drawImage(portalRingTex(), -RR, -RR, 2 * RR, 2 * RR);
  if (k > 1) { g.globalAlpha = Math.min(1, k - 1); g.drawImage(portalRingTex(), -RR, -RR, 2 * RR, 2 * RR); }
  g.restore();
}

// ---- you, from behind, in a wet yellow PVC raincoat ------------------------------------------------------
// Painted as cloth, not a mannequin: a hood with a peaked brim (it shows as a lip on the side the head
// turns to), an A-line coat that flares and swings with the stride, creased sleeves with cuffs, a
// darker soaked hem, wet specular streaks and drips running down the PVC. Lit only by what reaches it:
// o.key (the light in front of you - your torch's pool, the portal) wraps a rim round the silhouette
// while the back you see stays in shadow; o.moon adds a cold rim from above; o.fill lifts the shadow.
// Face never shown (back / 3-4 rear view). Local units: h / 100, origin at the feet, y up negative.
const KID_C = { coat: "#e8b923", jeans: "#2b3448", boot: "#a8322e", skin: "#c99272" };
// Painted as cloth, not a cut-out: a hood with a peaked brim, an A-line coat that flares and swings with
// the stride, creased sleeves, a darker soaked hem. Lit ONLY by what reaches it: o.key (the torch pool or
// the portal, in front of you) lights the side of the figure that faces it - a soft wrap band of lit
// PVC with vertical fabric folds and wet specular streaks running down it - while the far side and the
// back we see fall into near black. No outline anywhere: a thin rim exists only on the lit edge.
// o.silhouette 0..1: the figure against a blown-out light (dark, with a halation bleed round its edge).
// Face never shown (back / 3-4 rear view). Local units: h / 100, origin at the feet, y up negative.
function raincoatKid(g, x, y, h, o) {
  const u = h / 100, t = o.t || 0, run = !!o.run, turn = o.turn || 0;
  const cyc = (o.phase || 0) * K.TAU, s = run ? Math.sin(cyc) : 0;
  const breath = run ? 0 : Math.sin(t * K.TAU * 0.27) * 0.5;
  // a run: the body rises at each push-off (two bobs a stride), rolls side to side over the planted
  // foot and leans into the run
  const bob = run ? -Math.abs(Math.sin(cyc)) * 3.2 + 1.2 : breath * 0.3;
  const sway = run ? Math.sin(cyc) * 1.4 : 0, roll = run ? Math.sin(cyc) * 0.035 : 0;
  const wet = o.wet == null ? 0.8 : o.wet;
  const coat = K.mix(KID_C.coat, "#8a5a06", wet * 0.28), coatD = K.mix(coat, "#2a1800", 0.45);
  const jeans = K.mix(KID_C.jeans, "#0a0d16", wet * 0.45);
  const BW = Math.ceil(80 * u), BH = Math.ceil(114 * u);
  const bx = x - 40 * u, by = y - 108 * u;
  const A = K.layer(BW, BH, "f00-kid");
  const a = A.g;
  // the key light's direction in the figure's local space (screen x, and how far in front of you it is)
  const kk = o.key && o.key.k > 0.01 ? o.key : null;
  let ldx = 1, ldy = 0;
  if (kk) { const dx = kk.x - x, dy = kk.y - (y - 55 * u), dl = Math.hypot(dx, dy) || 1; ldx = dx / dl; ldy = dy / dl; }
  const side = ldx >= 0 ? 1 : -1;
  a.save();
  a.translate(40 * u, 108 * u);
  a.scale(u, u);
  a.translate(sway, 0);
  a.rotate(roll);
  a.lineCap = "round";
  a.lineJoin = "round";
  const tube = (pts, w, col) => {
    a.strokeStyle = col; a.lineWidth = w;
    a.beginPath(); a.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) a.lineTo(pts[i], pts[i + 1]);
    a.stroke();
  };
  const feet = [];
  // legs: the planted leg straight, the other kicked back toward us (the boot sole shows)
  for (const sd of [-1, 1]) {
    const lift = run ? Math.max(0, sd < 0 ? s : -s) : 0;
    const hipX = sd * 4.4, hipY = -45 + bob;
    const kx = sd * (4.8 + lift * 0.8), ky = -23 + bob * 0.6 - lift * 3;
    const fx = sd * (4.4 + lift * 1.2), fy = -1 - lift * 15;
    feet.push([fx + sway, fy, lift]);
    tube([hipX, hipY, kx, ky, fx, fy - 9], 10.2 - lift * 0.6, jeans);
    a.strokeStyle = "rgba(0,0,0,0.35)"; a.lineWidth = 0.7;
    a.beginPath(); a.moveTo(kx - 2.6, ky + 1); a.quadraticCurveTo(kx, ky + 2.4, kx + 2.6, ky + 0.6); a.stroke();
    const bt = new Path2D();
    bt.moveTo(fx - 4.4, fy - 13); bt.lineTo(fx + 4.4, fy - 13); bt.lineTo(fx + 4.9, fy - 1); bt.quadraticCurveTo(fx, fy + 1.4 + lift * 1.5, fx - 4.9, fy - 1); bt.closePath();
    a.fillStyle = K.mix(KID_C.boot, "#200606", 0.25 + lift * 0.2);
    a.fill(bt);
    if (lift > 0.25) { a.fillStyle = "rgba(20,14,12,0.9)"; a.beginPath(); a.ellipse(fx, fy - 0.5, 4.6, 2.2 * lift, 0, 0, K.TAU); a.fill(); }
  }
  // the coat: shoulders to mid-thigh, A-line, hem swinging against the stride
  const sw = run ? s * 2.2 : Math.sin(t * 0.7) * 0.3;
  const hemY = -37 + bob, shY = -79 + bob - breath * 0.4;
  const cp = new Path2D();
  cp.moveTo(-5, shY - 5);
  cp.quadraticCurveTo(-10.5, shY - 3.2, -12.4, shY + 0.5);
  cp.bezierCurveTo(-13.6, shY + 16, -15.2 + sw * 0.3, hemY - 16, -16.8 + sw, hemY + 0.6);
  const hemN = 10;
  for (let i = 1; i <= hemN; i++) {
    const q = i / hemN, hx = K.lerp(-16.8 + sw, 16.8 + sw, q);
    const wave = Math.sin(q * Math.PI * 3 + t * (run ? 9 : 1.2)) * 0.7 + (run ? Math.sin(q * Math.PI) * -1.2 * Math.abs(s) : 0);
    cp.lineTo(hx, hemY + wave + 0.6 * Math.sin(q * 11.3));
  }
  cp.bezierCurveTo(15.2 + sw * 0.3, hemY - 16, 13.6, shY + 16, 12.4, shY + 0.5);
  cp.quadraticCurveTo(10.5, shY - 3.2, 5, shY - 5);
  cp.closePath();
  a.fillStyle = coat;
  a.fill(cp);
  // sleeves: creased tubes with a darker cuff; the torch hand forward, the other arm pumping hard
  const armPaths = [];
  const arm = (sd, swing, torch) => {
    const sx = sd * 11.8, sy = shY + 2.5;
    let ex, ey, wx, wy;
    if (torch) { ex = sd * (16 + swing * 0.8); ey = sy + 17 - swing * 1.5; wx = sd * (15.2 + swing * 1.2); wy = sy + 23.5 - swing * 3; }
    else if (run) {
      // forward swing: the forearm comes up and in (hand near the chest, hidden); back swing: the
      // elbow drives out and back toward us, the fist shows by the hip
      ex = sd * (16.2 + Math.max(0, -swing) * 2.4); ey = sy + 16 - swing * 4;
      wx = sd * (13.6 + Math.max(0, -swing) * 5.5 - Math.max(0, swing) * 4); wy = sy + 25 - swing * 13;
    } else { ex = sd * 14.6; ey = sy + 18; wx = sd * 14.2; wy = sy + 33; }
    // a crease of shadow where the sleeve lies against the body
    a.strokeStyle = "rgba(20,10,0,0.55)"; a.lineWidth = 3;
    a.beginPath(); a.moveTo(sx - sd * 1.2, sy + 3); a.quadraticCurveTo(ex - sd * 3.6, ey, wx - sd * 3.4, wy); a.stroke();
    tube([sx, sy, ex, ey, wx, wy], 7.4, coat);
    armPaths.push([sx, sy, ex, ey, wx, wy, sd]);
    a.strokeStyle = "rgba(60,30,0,0.45)"; a.lineWidth = 0.8;
    for (let k = 0; k < 3; k++) { a.beginPath(); a.moveTo(ex - 3, ey - 1.6 + k * 1.5); a.quadraticCurveTo(ex, ey - 0.2 + k * 1.5, ex + 3, ey - 1.9 + k * 1.5); a.stroke(); }
    const dx = wx - ex, dy = wy - ey, dl = Math.hypot(dx, dy) || 1;
    tube([wx - (dx / dl) * 2.2, wy - (dy / dl) * 2.2, wx, wy], 7.6, coatD);
    a.fillStyle = K.mix(KID_C.skin, "#20120c", 0.55);
    a.beginPath(); a.ellipse(wx + (dx / dl) * 2.6, wy + (dy / dl) * 2.6, 2.9, 3.5, Math.atan2(dy, dx) - Math.PI / 2, 0, K.TAU); a.fill();
    if (torch) {
      const ta = o.torchAng == null ? -0.3 : o.torchAng;
      a.save();
      a.translate(wx + (dx / dl) * 3, wy + (dy / dl) * 3);
      a.rotate(ta);
      const tg = a.createLinearGradient(0, -1.8, 0, 1.8);
      tg.addColorStop(0, "#9aa0a8"); tg.addColorStop(0.45, "#4a4e56"); tg.addColorStop(1, "#16181c");
      a.fillStyle = tg;
      a.fillRect(-2, -1.7, 11, 3.4);
      a.fillRect(8, -2.3, 3, 4.6);
      a.restore();
    }
  };
  // hood: a soft dome with a centre seam, gathered at the neck; the peaked brim pokes out on the turn side
  const hoodY = -92.5 + bob - breath * 0.4;
  const hp = new Path2D();
  hp.moveTo(-6.6, shY - 4);
  hp.bezierCurveTo(-9.4 + turn * 1.5, hoodY + 5, -9 + turn * 2, hoodY - 8.4, turn * 2.2, hoodY - 8.8);
  hp.bezierCurveTo(8.4 + turn * 2.6, hoodY - 8.4, 9.2 + turn * 2.2, hoodY + 4, 6.6, shY - 4);
  hp.closePath();
  const brim = new Path2D();
  const bs = turn >= 0 ? 1 : -1, bk = 0.05 + Math.abs(turn) * 0.25;
  brim.moveTo(bs * (7.4 + turn * 2), hoodY - 6.2);
  brim.quadraticCurveTo(bs * (9.6 + bk * 2 + turn * 2), hoodY - 5.4, bs * (10 + bk * 2.4 + turn * 2), hoodY - 3.8);
  brim.quadraticCurveTo(bs * (9.4 + turn * 2), hoodY - 2.8, bs * (8.4 + turn * 2), hoodY - 1.8);
  brim.closePath();
  if (run) { arm(-1, s, false); arm(1, -s * 0.35, true); } else { arm(-1, 0, false); arm(1, 0, true); }
  a.fillStyle = coat;
  a.fill(hp);
  a.fillStyle = K.mix(coat, "#3a2400", 0.2);
  a.fill(brim);
  a.strokeStyle = "rgba(70,40,0,0.5)"; a.lineWidth = 0.7;
  a.beginPath(); a.moveTo(turn * 2.4, hoodY - 9.4); a.bezierCurveTo(turn * 2.2, hoodY - 2, turn * 1.2, hoodY + 4, 0, shY - 4.5); a.stroke();
  for (let k = -2; k <= 2; k++) { a.beginPath(); a.moveTo(k * 2.4, shY - 4.6); a.lineTo(k * 2.9, shY - 1.6); a.stroke(); }

  // ---- light on the cloth (source-atop: only where the figure is) ----
  a.globalCompositeOperation = "source-atop";
  const front = o.front == null ? 0.7 : o.front;
  const kc = kk ? kk.color : "#8090b0", kA = kk ? Math.min(1.4, kk.k) : 0;
  // 1. the back we see faces away from the key: deep shadow, the sky's faint fill from above
  a.fillStyle = `rgba(4,5,9,${0.5 + 0.38 * front})`;
  a.fillRect(-50, -115, 100, 120);
  let gr = a.createLinearGradient(0, -102, 0, -40);
  gr.addColorStop(0, K.rgba(o.fill || "#8090b0", 0.16));
  gr.addColorStop(1, K.rgba(o.fill || "#8090b0", 0));
  a.fillStyle = gr;
  a.fillRect(-50, -115, 100, 80);
  // 2. the wrap: the flank that faces the light turns into it, lit PVC (albedo x light), falling off
  //    across the figure into the shadow side; the far flank goes to near black
  const litCol = K.mix(K.mix(KID_C.coat, kc, 0.35), "#ffffff", 0.08);
  gr = a.createLinearGradient(side * 19, 0, -side * 6, 0);
  gr.addColorStop(0, K.rgba(litCol, 0.95 * kA));
  gr.addColorStop(0.22, K.rgba(litCol, 0.55 * kA));
  gr.addColorStop(0.55, K.rgba(litCol, 0.12 * kA));
  gr.addColorStop(1, K.rgba(litCol, 0));
  a.fillStyle = gr;
  a.fillRect(-50, -115, 100, 120);
  gr = a.createLinearGradient(-side * 2, 0, -side * 18, 0);
  gr.addColorStop(0, "rgba(2,2,4,0)"); gr.addColorStop(1, "rgba(2,2,4,0.7)");
  a.fillStyle = gr;
  a.fillRect(-50, -115, 100, 120);
  // the soaked, darker lower third of the coat and the hem
  gr = a.createLinearGradient(0, -58 + bob, 0, -36 + bob);
  gr.addColorStop(0, "rgba(30,16,0,0)");
  gr.addColorStop(1, "rgba(18,8,0,0.5)");
  a.fillStyle = gr;
  a.fillRect(-22, -58 + bob, 44, 22);
  // the jeans and boots below the hem: in the coat's shadow, only a sliver of light on the outer leg
  a.fillStyle = "rgba(2,2,4,0.55)";
  a.fillRect(-14, -37 + bob, 28, 40);
  gr = a.createLinearGradient(side * 10, 0, side * 6, 0);
  gr.addColorStop(0, K.rgba(kc, 0.22 * kA)); gr.addColorStop(1, K.rgba(kc, 0));
  a.fillStyle = gr;
  a.fillRect(-14, -37 + bob, 28, 40);
  // 3. vertical fabric folds: the A-line hangs in soft pleats from the yoke - each a shadowed trough and
  //    a lit crest, the crests brightest on the lit flank
  for (let i = 0; i < 6; i++) {
    const q = (i + 0.5 * K.hash(i, 61)) / 6, x0 = K.lerp(-9.5, 9.5, q), x1 = K.lerp(-16, 16, q) + sw * 0.8;
    const litK = K.clamp((x0 * side) / 10 + 0.2) * kA * 0.45;
    a.strokeStyle = `rgba(10,5,0,${0.16 + 0.12 * (1 - litK)})`;
    a.lineWidth = 3.4;
    a.beginPath(); a.moveTo(x0, shY + 7); a.bezierCurveTo(x0 + (x1 - x0) * 0.2, shY + 18, x1 - (x1 - x0) * 0.25, hemY - 10, x1, hemY - 1); a.stroke();
    if (litK > 0.05) {
      a.strokeStyle = K.rgba(litCol, 0.35 * litK);
      a.lineWidth = 1.6;
      const ox = side * 2;
      a.beginPath(); a.moveTo(x0 + ox, shY + 7); a.bezierCurveTo(x0 + (x1 - x0) * 0.2 + ox, shY + 18, x1 - (x1 - x0) * 0.25 + ox, hemY - 10, x1 + ox, hemY - 1); a.stroke();
    }
  }
  a.strokeStyle = "rgba(10,5,0,0.35)"; a.lineWidth = 1.2;
  a.beginPath(); a.moveTo(-9, -55 + bob); a.quadraticCurveTo(0, -53 + bob, 9, -55.5 + bob); a.stroke();
  // the sleeves: lit on their light side too, a dark crease on the other
  for (const [sx, sy, ex, ey, wx, wy, sd] of armPaths) {
    const lk = (sd === side ? 1 : 0.25) * kA;
    a.strokeStyle = K.rgba(litCol, 0.55 * lk); a.lineWidth = 1.6;
    a.beginPath(); a.moveTo(sx + side * 2.6, sy); a.lineTo(ex + side * 3, ey); a.lineTo(wx + side * 3, wy); a.stroke();
  }
  // 4. wet PVC: the light itself mirrored in long broken streaks down the lit flank (and a cold sky
  //    sheen across the shoulders), drips running down
  a.globalCompositeOperation = "lighter";
  const spc = kk ? K.mix(kc, "#ffffff", 0.4) : (o.spec || "#9aaccc");
  for (let i = 0; i < 6; i++) {
    const xs = side * (8 + K.hash(i, 31) * 7.5), wd = 0.5 + K.hash(i, 32) * 0.7, al = (0.25 + K.hash(i, 33) * 0.3) * kA;
    if (al < 0.02) continue;
    const y0 = shY + 4 + K.hash(i, 34) * 8, y1 = hemY - 2 - K.hash(i, 35) * 6;
    gr = a.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, K.rgba(spc, 0)); gr.addColorStop(0.15, K.rgba(spc, al)); gr.addColorStop(0.4, K.rgba(spc, al * 0.3)); gr.addColorStop(0.55, K.rgba(spc, al * 0.9)); gr.addColorStop(1, K.rgba(spc, 0));
    a.fillStyle = gr;
    const xb = xs * 1.18 + sw * 0.6;
    a.beginPath(); a.moveTo(xs - wd, y0); a.quadraticCurveTo((xs + xb) / 2 - wd * 1.3, (y0 + y1) / 2, xb - wd, y1); a.lineTo(xb + wd, y1); a.quadraticCurveTo((xs + xb) / 2 + wd * 1.3, (y0 + y1) / 2, xs + wd, y0); a.closePath();
    a.fill();
  }
  const sky = K.rgba(o.spec || "#9aaccc", 1);
  gr = a.createLinearGradient(0, shY - 6, 0, shY + 6);
  gr.addColorStop(0, K.rgba(sky, 0)); gr.addColorStop(0.5, K.rgba(sky, 0.1)); gr.addColorStop(1, K.rgba(sky, 0));
  a.fillStyle = gr; a.fillRect(-14, shY - 6, 28, 12);
  for (let i = 0; i < 9; i++) {
    const dxp = side * (2 + K.hash(i, 3) * 13), span = 34;
    const dy = shY + 6 + ((K.hash(i, 4) * span + t * (6 + K.hash(i, 5) * 10)) % span);
    a.strokeStyle = K.rgba(spc, 0.18 * kA); a.lineWidth = 0.6;
    a.beginPath(); a.moveTo(dxp, dy - 7); a.lineTo(dxp, dy); a.stroke();
    a.fillStyle = K.rgba(spc, 0.4 * kA);
    a.beginPath(); a.ellipse(dxp, dy, 0.45, 0.7, 0, 0, K.TAU); a.fill();
  }
  a.restore();
  a.globalCompositeOperation = "source-over";
  // the silhouette against a blown-out light: everything goes to black
  const sil = o.silhouette || 0;
  if (sil > 0) {
    a.save();
    a.setTransform(1, 0, 0, 1, 0, 0);
    a.globalCompositeOperation = "source-atop";
    a.fillStyle = `rgba(3,2,2,${sil})`;
    a.fillRect(0, 0, A.canvas.width, A.canvas.height);
    a.restore();
  }
  // contact: each planted boot sits in its own small occlusion on the wet ground
  for (const [fx, fy, lift] of feet) {
    if (lift > 0.3) continue;
    K.shadowBlob(g, x + fx * u, y + 0.5 * u, 7 * u, 1.6 * u, { alpha: 0.75 * (1 - lift * 2) });
  }
  g.drawImage(A.canvas, bx, by, BW, BH);
  // a thin rim only on the edge that faces the light (and only if the light is strong enough to wrap)
  if (kk && kA > 0.05 && sil < 0.5) rimPass(g, A.canvas, bx, by, BW, BH, [ldx, Math.min(0.3, ldy)], Math.max(1, 0.8 * u), K.mix(kc, "#ffffff", 0.2), 0.45 * kA, false, "f00-kidrim");
  if (o.moon && o.moon.k > 0.01 && sil < 0.5) rimPass(g, A.canvas, bx, by, BW, BH, o.moon.dir || [-0.2, -0.98], Math.max(1, 0.6 * u), o.moon.color, o.moon.k * 0.35, false, "f00-kidrim");
  if (sil > 0.05) {
    // halation: the blown light bleeds warm into the dark edges of the silhouette (an inner glow)
    const S = softCopy(A.canvas, BW, BH, 3, "f00-kidhal");
    const Hh = K.layer(BW, BH, "f00-kidhal2");
    Hh.g.drawImage(A.canvas, 0, 0, BW, BH);
    Hh.g.globalCompositeOperation = "source-in";
    Hh.g.fillStyle = "#ffb070";
    Hh.g.fillRect(0, 0, BW, BH);
    Hh.g.globalCompositeOperation = "destination-out";
    Hh.g.drawImage(S, 0, 0, BW, BH);
    Hh.g.drawImage(S, 0, 0, BW, BH);
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = Math.min(1, 0.9 * sil);
    g.drawImage(Hh.canvas, bx, by, BW, BH);
    g.restore();
  }
}
//@@INFRA3@@
// A low storm deck seen in perspective, baked once per look: billows shrink and flatten toward the
// horizon, the cloud base is lit warm from below by the town (sodium sky-glow), the gaps are near
// black. `flash` bakes the same deck lit cold from inside by lightning (centred at u = fx).
function stormDeck(seed, flash, fx = 0.82) {
  return K.texBake("f00-deck:" + seed + ":" + (flash ? 1 : 0) + ":" + fx, 520, 210, (u, v, out) => {
    const z = 1 / (1.06 - v * 0.98);              // depth along the cloud base
    const X = (u - 0.5) * z * 1.8, Y = z * 1.15;
    const w = K.texFbm(X * 0.9, Y * 0.9, seed + 7, 3) * 0.6;
    const n = K.texFbm(X * 1.6 + w, Y * 1.6 - w, seed, 6);
    const det = K.texFbm(X * 6.5, Y * 6.5, seed + 3, 3);
    const c = sm01(-0.25, 0.45, n + det * 0.12);  // cloud mass
    const relief = K.clamp(0.55 + 0.45 * K.texFbm(X * 3 + 1.3, Y * 3 - 0.7, seed + 11, 4) + det * 0.25);
    const under = Math.pow(v, 1.4);
    let r, gg, b;
    if (!flash) {
      // gap: cold dark night; cloud: underlit warm grey, brighter low down where the town is
      const gapR = 6 + under * 16, gapG = 7 + under * 12, gapB = 12 + under * 12;
      const L = (0.3 + 0.7 * under) * relief;
      r = gapR + (104 * L + 10 - gapR) * c; gg = gapG + (80 * L + 9 - gapG) * c; b = gapB + (72 * L + 12 - gapB) * c;
    } else {
      const k = 0.35 + 0.65 * Math.exp(-((u - fx) * (u - fx)) / 0.05) ;
      const L = (0.45 + 0.55 * relief) * k * (0.6 + 0.4 * c);
      r = 40 + 170 * L; gg = 48 + 182 * L; b = 70 + 200 * L;
    }
    out[0] = r; out[1] = gg; out[2] = b; out[3] = 255;
  });
}
// t is the time since the shot began (the deck drifts `speed` px/s); it is drawn wide enough that
// the drift never uncovers the frame edge within a shot
function drawDeck(g, x, y, w, h, seed, fl, t, speed = 3, fx) {
  const drift = Math.min(320, Math.max(0, t) * speed);
  g.drawImage(stormDeck(seed, false, fx), x - 360 + drift, y, w + 400, h);
  if (fl > 0) { g.save(); g.globalAlpha = K.clamp(fl); g.drawImage(stormDeck(seed, true, fx), x - 360 + drift, y, w + 400, h); g.restore(); }
}
// a tiny dark cat silhouette sitting in a lit window (seen from the street)
function windowCatSil(g, x, y, s) {
  const spr = K.sprite("f00-wincat", 60, 60, (c) => {
    K.drawCat(c, 30, 58, 34, { pose: "sit", facing: -1, t: 0, lod: 0, shadow: false, headTurn: -0.6, coat: K.COATS.black, flat: true, tail: 0.6 });
    c.globalCompositeOperation = "source-in";
    c.fillStyle = "#1a0e08";
    c.fillRect(0, 0, 60, 60);
  });
  g.drawImage(spr, x - 30 * s, y - 58 * s, 60 * s, 60 * s);
}
// ambient occlusion where a wall meets the ground
function aoLine(g, x0, y0, x1, y1) { K.aoEdge(g, x0, y0, x1, y1, { width: 10, alpha: 0.55, side: 1 }); }

// ---- shot 1: the house in the storm, slow dolly in ---------------------------------------------------
// A real night exterior: the only lights are a sodium streetlamp, one upstairs window and the
// lightning. Low cloud lit orange from below by the town; the wet road mirrors every light as a long
// streak down toward the lens; rain only shows where a light catches it. The set is baked into lit
// plates (normal + lightning-lit); per frame: sky, swaying trees, lamp, reflections, rain.
const HZ1 = 352, LAMP1 = { x: 150, y: 470, h: 236 };
const LAMP1H = [LAMP1.x + LAMP1.h * 0.16, LAMP1.y - LAMP1.h];
const S1VP = [1700, 352], S1K = 0.9212;
const s1far = (x, y) => [S1VP[0] + (x - S1VP[0]) * S1K, S1VP[1] + (y - S1VP[1]) * S1K];
const S1ROOF = [[430, 150], s1far(430, 150), s1far(574, 251), [574, 251]];
const S1SIDE = [[558, 246], s1far(558, 246), s1far(558, 421), [558, 421]];
const S1WIN = { x: 404, y: 252, w: 52, h: 58 };
const poly = (s, pts) => { s.beginPath(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); };
const polyP = (pts) => { const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath(); return p; };
// texture a parallelogram: (o = origin, ex/ey = the two edge vectors), tile `tiles` across ex
function texQuad(s, name, o, ex, ey, tiles, tex, tint, tintA) {
  s.save();
  s.transform(ex[0], ex[1], ey[0], ey[1], o[0], o[1]);
  const p = new Path2D();
  p.rect(0, 0, 1, 1);
  K.texFill(s, name, p, { scale: 1 / tiles, scaleY: 1 / tiles * (tex.ry || 1), tex, tint, tintAlpha: tintA });
  s.restore();
}
function darkWindow(s, x, y, w, h) {
  s.fillStyle = "#565a62";
  s.fillRect(x - 4, y - 4, w + 8, h + 8);
  const gg = s.createLinearGradient(x, y, x + w * 0.4, y + h);
  gg.addColorStop(0, "#3c3436"); gg.addColorStop(0.45, "#17161a"); gg.addColorStop(1, "#0a0b10");
  s.fillStyle = gg;
  s.fillRect(x, y, w, h);
  s.fillStyle = "rgba(160,150,150,0.07)";
  s.beginPath(); s.moveTo(x + w * 0.15, y); s.lineTo(x + w * 0.45, y); s.lineTo(x + w * 0.1, y + h); s.lineTo(x, y + h); s.lineTo(x, y + h * 0.7); s.fill();
  s.fillStyle = "#3a3c42";
  s.fillRect(x + w / 2 - 1.2, y, 2.4, h);
  s.fillRect(x, y + h * 0.48 - 1.2, w, 2.4);
  s.fillStyle = "#6a6c72";
  s.fillRect(x - 6, y + h + 3, w + 12, 3.5);
  s.fillStyle = "rgba(0,0,0,0.5)";
  s.fillRect(x - 6, y + h + 6.5, w + 12, 2);
}
// the lit bedroom window: a warm room behind wet glass, curtains, sash bars and his silhouette
function litWindow(s) {
  const { x, y, w, h } = S1WIN;
  s.fillStyle = "#5a5c62";
  s.fillRect(x - 5, y - 5, w + 10, h + 10);
  const rg = s.createRadialGradient(x + w * 0.3, y + h * 0.25, 2, x + w * 0.5, y + h * 0.5, w * 0.95);
  rg.addColorStop(0, "#fff0cc"); rg.addColorStop(0.35, "#ffc888"); rg.addColorStop(0.75, "#c87a40"); rg.addColorStop(1, "#6a3418");
  s.fillStyle = rg;
  s.fillRect(x, y, w, h);
  // ceiling falls into shadow, a picture frame on the far wall, a lamp's hot spot
  const cg = s.createLinearGradient(0, y, 0, y + 12);
  cg.addColorStop(0, "rgba(60,24,8,0.55)"); cg.addColorStop(1, "rgba(60,24,8,0)");
  s.fillStyle = cg; s.fillRect(x, y, w, 12);
  s.fillStyle = "rgba(90,40,16,0.4)"; s.fillRect(x + w * 0.58, y + 14, 12, 9);
  // curtains: heavy cotton, lit through from the room, folds
  for (const [cx, cw, dir] of [[x, 11, 1], [x + w - 10, 10, -1]]) {
    const cgr = s.createLinearGradient(cx, 0, cx + cw, 0);
    for (let k = 0; k <= 6; k++) cgr.addColorStop(k / 6, K.rgba(k % 2 ? "#a04a30" : "#5a2414", 0.92));
    s.fillStyle = cgr;
    s.beginPath(); s.moveTo(cx, y); s.lineTo(cx + cw, y); s.quadraticCurveTo(cx + cw - dir * 3, y + h * 0.6, cx + cw + dir * 2, y + h); s.lineTo(cx, y + h); s.closePath(); s.fill();
  }
  windowCatSil(s, x + 22, y + h - 2, 0.46);
  // sash bars in silhouette, glass beads catching the room light
  s.fillStyle = "#24140c";
  s.fillRect(x + w / 2 - 1.3, y, 2.6, h);
  s.fillRect(x, y + h * 0.48 - 1.3, w, 2.6);
  const R = K.rng("s1beads");
  for (let i = 0; i < 26; i++) {
    const bx = x + R() * w, by = y + R() * h, r = 0.5 + R() * 1.1;
    s.fillStyle = "rgba(40,16,4,0.5)"; s.beginPath(); s.arc(bx, by, r, 0, K.TAU); s.fill();
    s.fillStyle = "rgba(255,246,220,0.85)"; s.beginPath(); s.arc(bx - r * 0.3, by - r * 0.3, r * 0.4, 0, K.TAU); s.fill();
  }
  s.fillStyle = "#7a7c82";
  s.fillRect(x - 7, y + h + 4, w + 14, 4);
}
function paintHouse1(s) {
  // ground first: the lawn in front of the house is in the back plate; here the house, fence, road
  // side wall (receding to the right, away from the lamp: darker)
  const side = polyP(S1SIDE);
  texQuad(s, "siding", S1SIDE[0], [S1SIDE[1][0] - S1SIDE[0][0], S1SIDE[1][1] - S1SIDE[0][1]], [0, 175], 3.6, { seed: 3, color: "#7c8898", rows: 6, ry: 1 }, "#3a404c", 0.7);
  s.save(); s.clip(side);
  const sg = s.createLinearGradient(558, 0, 650, 0);
  sg.addColorStop(0, "rgba(0,0,0,0.25)"); sg.addColorStop(1, "rgba(0,0,0,0.55)");
  s.fillStyle = sg; s.fill(side);
  darkWindow(s, 590, 290, 26, 40);
  s.restore();
  // front: gable wall + two storeys of painted weatherboard
  const fr = polyP([[302, 421], [302, 246], [430, 154], [558, 246], [558, 421]]);
  K.texFill(s, "siding", fr, { scale: 48, tex: { seed: 3, color: "#7a8494", rows: 6 }, tint: "#4a505c", tintAlpha: 0.55 });
  s.save(); s.clip(fr);
  // grime streaks under the sills and from the eaves
  const R = K.rng("s1grime");
  for (let i = 0; i < 18; i++) {
    const gx = 304 + R() * 252, gy = 246 + R() * 120, gw = 3 + R() * 12;
    const gg = s.createLinearGradient(0, gy, 0, gy + 40 + R() * 60);
    gg.addColorStop(0, "rgba(16,18,16,0.22)"); gg.addColorStop(1, "rgba(16,18,16,0)");
    s.fillStyle = gg; s.fillRect(gx, gy, gw, 100);
  }
  // rain-soaked runs: the paint darkens where water sheets off the gable rakes and the storey band;
  // each run is darker at its head, ragged, with a thin wet sheen down its lamp-side edge
  const rakeY = (x) => (x < 430 ? 246 - (x - 302) * (92 / 128) : 154 + (x - 430) * (92 / 128));
  for (let i = 0; i < 64; i++) {
    const band = i % 3 === 0;
    const gx = 304 + R() * 252, y0 = band ? 338 : rakeY(gx) + 2, len = (band ? 20 : 34) + R() * (band ? 40 : 90), gw = 1.5 + R() * 5;
    const gg = s.createLinearGradient(0, y0, 0, y0 + len);
    gg.addColorStop(0, `rgba(6,10,16,${0.3 + R() * 0.25})`); gg.addColorStop(0.6, "rgba(6,10,16,0.12)"); gg.addColorStop(1, "rgba(6,10,16,0)");
    s.fillStyle = gg;
    s.beginPath();
    s.moveTo(gx, y0); s.lineTo(gx + gw, y0);
    s.quadraticCurveTo(gx + gw * 0.6 + (R() - 0.5) * 3, y0 + len * 0.6, gx + gw * 0.5, y0 + len);
    s.quadraticCurveTo(gx + (R() - 0.5) * 3, y0 + len * 0.5, gx, y0);
    s.fill();
    if (R() < 0.5) { s.fillStyle = `rgba(190,200,220,${0.05 + R() * 0.07})`; s.fillRect(gx, y0, 0.8, len * 0.7); }
  }
  // the soaked band under the rakes and the band course: a broad dark wash
  const wash = s.createLinearGradient(0, 154, 0, 300);
  wash.addColorStop(0, "rgba(8,12,18,0.35)"); wash.addColorStop(1, "rgba(8,12,18,0)");
  s.fillStyle = wash; s.fillRect(302, 154, 256, 146);
  s.restore();
  // corner boards, storey band, foundation
  s.fillStyle = "#6c707a";
  s.fillRect(302, 246, 7, 175); s.fillRect(551, 246, 7, 175);
  s.fillRect(302, 333, 256, 4);
  s.fillStyle = "#3a3a3e"; s.fillRect(300, 412, 260, 10);
  s.fillStyle = "rgba(0,0,0,0.45)"; s.fillRect(302, 337, 256, 2);
  // windows and the door
  darkWindow(s, 326, 262, 40, 50);
  darkWindow(s, 494, 262, 40, 50);
  darkWindow(s, 322, 352, 46, 48);
  darkWindow(s, 492, 352, 46, 48);
  litWindow(s);
  const door = new Path2D(); door.rect(414, 348, 32, 64);
  K.texFill(s, "wood", door, { scale: 70, tex: { seed: 7, color: "#6a3424", dark: "#2a120a", planks: 3 }, tint: "#3a1810", tintAlpha: 0.5 });
  s.fillStyle = "#2a2a2e"; s.fillRect(404, 338, 52, 6);
  s.fillStyle = "rgba(255,230,190,0.6)"; s.fillRect(440, 382, 2, 2);
  K.aoEdge(s, 404, 344, 456, 344, { width: 8, alpha: 0.5, side: 1 });
  // roof: the receding plane in wet shingle (it faces the sky, so it is the brightest plane)
  const rf = polyP(S1ROOF);
  texQuad(s, "shingle", S1ROOF[3], [S1ROOF[2][0] - S1ROOF[3][0], S1ROOF[2][1] - S1ROOF[3][1]], [S1ROOF[0][0] - S1ROOF[3][0], S1ROOF[0][1] - S1ROOF[3][1]], 2.2, { seed: 5, ry: 1 }, "#4a4a52", 0.55);
  s.save(); s.clip(rf);
  // wet sheen: the warm underlit cloud mirrored, strongest at grazing angle (far end), in streaks
  const rg = s.createLinearGradient(470, 0, 660, 0);
  rg.addColorStop(0, "rgba(120,100,96,0.05)"); rg.addColorStop(1, "rgba(150,124,110,0.32)");
  s.fillStyle = rg; s.fill(rf);
  for (let i = 0; i < 16; i++) {
    const q = R();
    const ax = K.lerp(S1ROOF[0][0], S1ROOF[1][0], q), ay = K.lerp(S1ROOF[0][1], S1ROOF[1][1], q);
    const bx2 = K.lerp(S1ROOF[3][0], S1ROOF[2][0], q), by2 = K.lerp(S1ROOF[3][1], S1ROOF[2][1], q);
    s.strokeStyle = `rgba(190,180,190,${0.04 + R() * 0.08})`; s.lineWidth = 0.6 + R();
    s.beginPath(); s.moveTo(ax, ay); s.lineTo(bx2, by2); s.stroke();
  }
  s.restore();
  // chimney (brick) on the far slope
  const ch = polyP([[500, 168], [520, 171], [520, 120], [500, 118]]);
  K.texFill(s, "brick", ch, { scale: 36, tint: "#3a2a26", tintAlpha: 0.6 });
  s.fillStyle = "#1a1a1c"; s.fillRect(497, 114, 26, 6);
  s.fillStyle = "rgba(0,0,0,0.4)"; s.fillRect(512, 120, 8, 50);
  // bargeboards along the gable rakes, the ridge and gutter; a moonlit edge on the ridge and rake
  s.lineCap = "round";
  s.strokeStyle = "#202024"; s.lineWidth = 6;
  s.beginPath(); s.moveTo(286, 253); s.lineTo(430, 147); s.lineTo(576, 253); s.stroke();
  s.strokeStyle = "#16161a"; s.lineWidth = 3;
  s.beginPath(); s.moveTo(S1ROOF[3][0], S1ROOF[3][1] + 1); s.lineTo(S1ROOF[2][0], S1ROOF[2][1] + 1); s.stroke();
  s.fillStyle = "#18181c"; s.fillRect(S1ROOF[2][0] - 14, S1ROOF[2][1], 3, 150);
  s.strokeStyle = "rgba(200,206,226,0.55)"; s.lineWidth = 1.1;
  s.beginPath(); s.moveTo(430, 146); s.lineTo(S1ROOF[1][0], S1ROOF[1][1] - 1); s.stroke();
  s.strokeStyle = "rgba(170,176,200,0.35)"; s.lineWidth = 0.9;
  s.beginPath(); s.moveTo(430, 145); s.lineTo(578, 251); s.stroke();
  s.strokeStyle = "rgba(255,190,120,0.25)";
  s.beginPath(); s.moveTo(430, 145); s.lineTo(284, 251); s.stroke();
  aoLine(s, 290, 421, 650, 421);
  // the front fence, the kerb, the wet road
  K.fence(s, 214, 700, 438, 26, { night: true, color: "#2a2c32" });
  K.groundPlane(s, W, H, { tex: "asphalt", horizon: HZ1, y0: 444, scale: 340, wet: 1, puddles: 0.6, sky: "#3a302c", fog: "#121418", fogAmt: 0.5, variation: 0.7, cache: false });
  s.fillStyle = "rgba(150,150,160,0.2)"; s.fillRect(-40, 444, W + 80, 1.2);
  s.fillStyle = "rgba(0,0,0,0.5)"; s.fillRect(-40, 445.2, W + 80, 2.4);
  // the wet road mirrors the glowing cloud base (grazing-angle reflection, fading toward us)
  s.save();
  s.beginPath(); s.rect(-80, 447, W + 160, 140); s.clip();
  s.translate(0, 2 * 447); s.scale(1, -1);
  s.globalAlpha = 0.26;
  s.drawImage(stormDeck(41, false, 0.8), -80, -60, W + 160, HZ1 + 64);
  s.restore();
  vgrad(s, -80, 447, W + 160, 100, [[0, "rgba(4,4,6,0)"], [1, "rgba(4,4,6,0.7)"]]);
  K.streetlamp(s, LAMP1.x, LAMP1.y, LAMP1.h, { on: false });
}
function s1Lights(flash) {
  // normal: the sodium lamp is the key - it rakes the left corner of the facade and dies off toward
  // the right; the lit window spills down onto its sill, the wall under it and the ground below.
  // flash: lightning from the top right - the sky side of everything is hit hard and cold.
  return lightMap(flash ? "#1a2034" : "#1c2030", [
    { x: LAMP1H[0], y: LAMP1.y - 4, r: 330, color: "#ffc078", k: 1.4, flat: 0.42 },
    { x: LAMP1H[0], y: LAMP1H[1] + 60, r: 430, color: "#ffb060", k: 0.9 },
    { x: 262, y: 300, r: 250, color: "#ffa850", k: 0.85, flat: 1.4 },
    { x: 430, y: 285, r: 150, color: "#ffcf8a", k: 0.45 },
    { x: 430, y: 322, r: 46, color: "#ffd8a0", k: 1.1, flat: 0.35 },
    { x: 430, y: 352, r: 56, color: "#ffc888", k: 0.55, flat: 1.9 },
    { x: 430, y: 452, r: 170, color: "#ffcf8a", k: 0.35, flat: 0.35 },
    { x: 430, y: 430, r: 110, color: "#ffcf8a", k: 0.4, flat: 0.3 },
    ...(flash ? [{ x: 1000, y: -160, r: 1250, color: "#c4d0ff", k: 1.6 }, { x: 820, y: 60, r: 600, color: "#dfe6ff", k: 0.8 }] : []),
  ], (s) => {
    s.fillRect(S1WIN.x - 1, S1WIN.y - 1, S1WIN.w + 2, S1WIN.h + 2);
  }, (s) => {
    // sky fill: up-facing planes catch the glowing cloud base; the front wall gets a little bounce
    s.fillStyle = flash ? "#a0acd0" : "#4a4450";
    poly(s, S1ROOF); s.fill();
    s.fillStyle = flash ? "#080a12" : "#080a0e";
    s.fillRect(300, 150, 260, 272);
    s.fillStyle = flash ? "#5a6890" : "#06070a";
    poly(s, S1SIDE); s.fill();
    // the road's sheen mirrors the sky
    s.fillStyle = flash ? "#404a66" : "#1a1a20";
    s.fillRect(-80, 446, W + 160, 200);
  });
}
const s1Front = (flash) => bakeLit("f00-s1front:" + (flash ? 1 : 0), -40, -40, W + 80, H + 80, paintHouse1, () => s1Lights(flash));
const S1BACK = { y: 300, h: 170 };
function s1Back(flash) {
  return bakeLit("f00-s1back:" + (flash ? 1 : 0), -40, S1BACK.y, W + 80, S1BACK.h, (s) => {
    K.hills(s, W + 80, H, { y: HZ1 + 6, amp: 30, color: "#0c0e14", seed: 3, haze: "#24201f", hazeAmt: 0.5, tex: "turf", cache: false });
    K.groundPlane(s, W, H, { tex: "turf", horizon: HZ1, y0: 404, y1: 448, scale: 300, fog: "#14181c", fogAmt: 0.6, tint: "#0c140e", tintAlpha: 0.75, wet: 0.5, sky: "#2a2a30", cache: false });
  }, () => lightMap(flash ? "#7c88ac" : "#2c3040", [
    { x: LAMP1H[0], y: LAMP1.y - 30, r: 460, color: "#ffc078", k: 1.2, flat: 0.5 },
    { x: 430, y: 430, r: 190, color: "#ffcf8a", k: 0.35, flat: 0.35 },
  ], (s) => s.fillRect(-80, -80, W + 160, HZ1 + 6 + 80)));
}
// the town's lights and their streaks in the wet road: self-lit, one additive sprite
function s1Town() {
  return K.sprite("f00-s1town", W + 80, H + 80, (s) => {
    s.translate(40, 40);
    for (let i = 0; i < 34; i++) {
      const lx = -30 + K.hash(i, 77) * (W + 60), ly = HZ1 - 6 + K.hash(i, 78) * 16;
      const c = i % 3 ? "#ffb25a" : "#ffe6c0";
      K.glow(s, lx, ly, 3 + K.hash(i, 79) * 5, c, 0.35);
      K.glow(s, lx, ly, 1.1, "#ffffff", 0.55);
      if (K.hash(i, 80) > 0.45) K.reflectStreak(s, lx, 448, 26, "#ffb25a", 0.2, { t: i, width: 2.5 });
    }
  });
}
function s1Trees() {
  return {
    oak: canopySpr(12, 300, 340, { base: [6, 7, 9], trunk: [8, 8, 9], rim: [58, 46, 44], rimK: 0.9, dir: [0.2, -1] }),
    small: canopySpr(9, 200, 230, { base: [5, 6, 8], trunk: [7, 7, 8], rim: [70, 52, 40], rimK: 1, dir: [-0.6, -0.8], cy: 0.4 }),
    bare: K.sprite("f00-s1bare", 260, 320, (c) => {
      K.tree(c, 130, 316, 1, { seed: 4, trunk: "#14120e", kind: "bare", sway: 0, shadow: false });
      c.globalCompositeOperation = "source-atop";
      c.fillStyle = "rgba(5,6,8,0.92)";
      c.fillRect(0, 0, 260, 320);
    }),
  };
}
// a tree's silhouette as a hard shadow mask
function s1Shadow(name, spr) {
  return K.sprite("f00-s1shadow:" + name, spr.lw || spr.width, spr.lh || spr.height, (s, w, h) => {
    s.drawImage(spr, 0, 0, w, h);
    s.globalCompositeOperation = "source-in";
    s.fillStyle = "#0a0c14";
    s.fillRect(0, 0, w, h);
  });
}
// drips off the eaves: lines of drops falling from the rake ends, along the bargeboards and the side
// gutter, each a short motion-blurred streak as bright as the light that reaches it (lamp, window,
// lightning); invisible in the dark like real rain.
const S1DRIP_SRC = (() => {
  const a = [];
  for (let i = 0; i < 26; i++) { const u = i / 25; a.push([K.lerp(292, 426, u), K.lerp(250, 152, u) + 4, 0.35]); }
  for (let i = 0; i < 26; i++) { const u = i / 25; a.push([K.lerp(434, 570, u), K.lerp(152, 250, u) + 4, 0.35]); }
  for (let i = 0; i < 4; i++) a.push([288 + i * 1.5, 256, 1.6], [574 - i * 1.5, 256, 1.6]);
  for (let i = 0; i < 18; i++) { const u = i / 17, [fx, fy] = s1far(574, 251); a.push([K.lerp(578, fx, u), K.lerp(255, fy + 3, u), 1.0]); }
  return a;
})();
function s1Drips(g, t, lampFl, fl) {
  const L = { lights: [{ x: LAMP1H[0], y: LAMP1H[1] + 40, r: 420, color: "#ffc078", k: 1.2 * lampFl }, { x: 430, y: 300, r: 130, color: LAMP, k: 0.9 }], amb: 0.06 + 0.8 * fl, ambColor: "#b8c4e8" };
  const P = [new Path2D(), new Path2D(), new Path2D()];
  for (let i = 0; i < S1DRIP_SRC.length; i++) {
    const [x, y0, rate] = S1DRIP_SRC[i];
    const per = (0.5 + K.hash(i, 81) * 0.9) / rate;
    const ph = (t / per + K.hash(i, 82)) % 1;
    const fall = ph * per;
    const y = y0 + 520 * fall * fall;
    if (y > 421) continue;
    lumAt(L, x, y, LUM);
    const lv = Math.min(2, Math.floor(LUM[0] * 3));
    if (LUM[0] < 0.12) continue;
    const v = 1040 * fall, len = Math.min(18, 2 + v / 48);
    P[lv].moveTo(x, y - len); P[lv].lineTo(x, y);
  }
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  g.strokeStyle = "#ffe0b8";
  g.lineWidth = 1;
  for (let k = 0; k < 3; k++) { g.globalAlpha = 0.18 + 0.2 * k; g.stroke(P[k]); }
  g.restore();
}
// a tree that bends in the wind: the base stays put, the crown leans (skew) with gusts
function swayTree(g, spr, x, y, w, h, t, seed, amt) {
  const gust = 0.5 + 0.5 * K.noise(t * 0.35, seed);
  const sk = amt * (Math.sin(t * 0.9 + seed) * 0.012 + Math.sin(t * 2.3 + seed * 3) * 0.006 + gust * 0.018);
  g.save();
  g.transform(1, 0, -sk, 1, sk * y, 0);
  g.drawImage(spr, x - w / 2, y - h, w, h);
  g.restore();
}
function shotHouse(g, t, p) {
  const fl = K.flash(t, [2.0, 2.4, 6.7], 0.09);
  const e = K.ease.inOut(p);
  const zoom = 1 + 0.1 * e;
  const lampFl = 1 - 0.2 * (Math.sin(t * 23) * Math.sin(t * 7.3) > 0.7 ? 1 : 0);
  const TR = s1Trees();
  K.withCamera(g, W, H, { x: K.lerp(482, 456, e), y: K.lerp(268, 282, e), zoom, shakeT: t * 0.45, shakeAmt: 1.8 }, () => {
    drawDeck(g, -60, -60, W + 120, HZ1 + 64, 41, fl, t, 3, 0.8);
    // the bolt: a white-hot core in a broad ionised glow, the cloud it leaves lit from inside
    const bolt = (x0, x1, y1, seed, a, w) => {
      if (a <= 0.01) return;
      g.save();
      g.globalCompositeOperation = "lighter";
      K.glow(g, x0 + (x1 - x0) * 0.2, 20, 300, "#9fb4ff", 0.35 * a);
      K.lightningBolt(g, x0, -20, x1, y1, seed, { alpha: 0.35 * a, width: w * 5 });
      K.lightningBolt(g, x0, -20, x1, y1, seed, { alpha: 0.6 * a, width: w * 2.2 });
      K.lightningBolt(g, x0, -20, x1, y1, seed, { alpha: a, width: w });
      g.restore();
    };
    if (t > 1.98 && t < 2.3) bolt(790, 850, 300, 7, 1 - K.seg(t, 2.1, 2.3), 2.4);
    if (t > 2.38 && t < 2.6) bolt(820, 760, 290, 9, 0.85 * (1 - K.seg(t, 2.45, 2.6)), 1.8);
    if (t > 6.68 && t < 6.9) bolt(120, 60, 300, 4, 0.7 * (1 - K.seg(t, 6.75, 6.9)), 1.4);
    g.drawImage(s1Back(false), -40, S1BACK.y, W + 80, S1BACK.h);
    if (fl > 0.02) { g.save(); g.globalAlpha = fl; g.drawImage(s1Back(true), -40, S1BACK.y, W + 80, S1BACK.h); g.restore(); }
    // the town through the rain
    g.drawImage(s1Town(), -40, -40, W + 80, H + 80);
    fogBand(g, HZ1 + 2, 46, "#2c2624", 0.55, t, 2, 4);
    // trees black against the cloud, crowns working in the wind
    swayTree(g, TR.oak, 770, 424, 390, 442, t, 12, 1.2);
    swayTree(g, TR.bare, 925, 426, 247, 304, t, 4, 1.0);
    swayTree(g, TR.small, 40, 414, 190, 218, t, 9, 1.4);
    g.drawImage(s1Front(false), -40, -40, W + 80, H + 80);
    if (fl > 0.02) { g.save(); g.globalAlpha = fl; g.drawImage(s1Front(true), -40, -40, W + 80, H + 80); g.restore(); }
    // the flash's peak (two frames): a point source that hard - the trees throw razor shadows
    // down-left across the lawn, the road and the side of the house
    if (fl > 0.55) {
      const a = K.clamp((fl - 0.55) / 0.3) * 0.75;
      g.save();
      g.globalAlpha = a;
      g.globalCompositeOperation = "multiply";
      g.beginPath(); g.rect(-60, 404, W + 120, 200); poly(g, S1SIDE); g.clip();
      for (const [spr, x, y, w, h] of [[s1Shadow("oak", TR.oak), 770, 424, 390, 442], [s1Shadow("bare", TR.bare), 925, 426, 247, 304]]) {
        // the tree laid down on the ground, pointing away from the bolt (toward us and to the left)
        g.save();
        g.translate(x, y);
        g.transform(1, 0, -1.25, 0.32, 0, 0);
        g.scale(1, -1);
        g.drawImage(spr, -w / 2, -h, w, h);
        g.restore();
      }
      g.restore();
    }
    // rain sheeting off the gutters and the gable rakes: drips fall in lines, lit by the lamp and the window
    s1Drips(g, t, lampFl, fl);
    // the lamp: hot head, its cone of light through the rain, its long reflection down the wet road
    const hx = LAMP1H[0], hy = LAMP1H[1];
    K.volumetricBeam(g, hx, hy + 3, Math.PI / 2, (LAMP1.y - hy) * 1.02, 0.95, { color: SODIUM, intensity: 0.38 * lampFl, t, width0: 14 });
    g.fillStyle = K.mix(SODIUM, "#ffffff", 0.75);
    g.fillRect(hx - 9, hy, 18, 3.4);
    K.glow(g, hx, hy + 2, 120, SODIUM, 0.3 * lampFl);
    K.glow(g, hx, hy + 2, 36, SODIUM, 0.5 * lampFl);
    K.glow(g, hx, hy + 2, 11, "#ffffff", 0.9 * lampFl);
    K.lightPool(g, hx, LAMP1.y - 2, 150, SODIUM, { flat: 0.22, intensity: 0.4 * lampFl });
    K.reflectStreak(g, hx, 452, 290, SODIUM, 1.5 * lampFl, { t, width: 30 });
    K.reflectStreak(g, hx, 454, 150, "#fff0d0", 0.6 * lampFl, { t: t + 1, width: 6 });
    K.reflectStreak(g, 430, 450, 110, LAMP, 0.5, { t: t + 3, width: 9 });
    if (fl > 0) K.reflectStreak(g, 800, 448, 150, BOLT, 0.6 * fl, { t, width: 90 });
    // rain: invisible in the dark, bright in the lamp's cone and back-lit around its head
    const RL = {
      lights: [{ x: hx, y: hy + 6, r: 170, color: "#ffc078", k: 1.4 * lampFl, src: true }, { x: 430, y: 290, r: 90, color: LAMP, k: 0.5, src: true }],
      cones: [{ x: hx, y: hy + 4, ang: Math.PI / 2, len: LAMP1.y - hy + 20, spread: 1.15, color: "#ffc078", k: 1.3 * lampFl }],
      amb: 0.05 + 0.6 * fl, ambColor: "#9aa6c4",
    };
    rain3(g, t, Object.assign({ angle: 0.25, seed: 11, density: 1.1 }, RL));
    splash3(g, t, Object.assign({ x0: -40, x1: 560, y0: 446, y1: 560, n: 90, seed: 4 }, RL));
    fogBand(g, 452, 70, "#2c2624", 0.22, t, 5, 7);
  });
  const ta = K.env(t, 3, 8.5, 1.5, 1.6);
  if (ta > 0) K.title(g, W, H, "The Night He Left", "Prologue", ta, { y: H * 0.42 - 52, size: 58, glow: "#9fb4e8" });
  // a short dip through dark into the bedroom (the window light is the last thing to go)
  const dip = K.smooth(K.seg(t, 8.45, 9.0));
  if (dip > 0) K.fadeBlack(g, W, H, dip * 0.96);
}

// ---- shot 2: the window, rack focus from the raindrops to Biscuit -------------------------------------
// Inside the dark bedroom, behind him. The ONLY light in the room is the bedside lamp at the right:
// the papered wall, the painted window casing, the oak sill and the curtain all fall off with
// distance from it, and the cold night through the glass gives him a blue rim on the window side.
const WIN = { x: 60, y: 30, w: 470, h: 352 };
const LAMP2 = { x: 905, y: 312 };
// the night through the glass: the storm deck, the old tree, a distant streetlamp and the neighbours
function windowOutside(g, x, y, w, h, t) {
  g.drawImage(stormDeck(41, false), x - 40 + t * 2, y - 10, w + 80, h * 0.78);
  // seen from a lit room the night is darker than the eye expects
  g.fillStyle = "rgba(3,4,7,0.5)";
  g.fillRect(x, y, w, h);
  g.fillStyle = "#050609";
  g.fillRect(x, y + h * 0.66, w, h * 0.4);
  ridge(g, { y: y + h * 0.68, amp: 16, color: "#0a0b10", seed: 5, x0: x - 10, x1: x + w + 10, bottom: y + h + 10 });
  const oak = canopySpr(12, 300, 340, { base: [6, 7, 9], trunk: [8, 8, 9], rim: [58, 46, 44], rimK: 0.9, dir: [0.2, -1] });
  swayTree(g, oak, x + w * 0.66, y + h * 0.75, 180, 204, t, 12, 1.4);
  // the neighbours' lit windows and the streetlamp, far off
  for (const [u, v, r, c] of [[0.12, 0.7, 26, SODIUM], [0.36, 0.69, 7, LAMP], [0.42, 0.69, 6, LAMP], [0.88, 0.7, 9, "#ffe0b0"]]) {
    K.glow(g, x + w * u, y + h * v, r, c, 0.6);
    K.glow(g, x + w * u, y + h * v, Math.max(1.5, r * 0.12), "#fff4e0", 0.9);
  }
  rain3(g, t, { area: [x, y, x + w, y + h], angle: 0.22, seed: 21, density: 0.5, near: 0, lights: [{ x: x + w * 0.12, y: y + h * 0.66, r: 110, color: "#ffc078", k: 1.2, src: true }], amb: 0.07, ambColor: "#8a96b0" });
}
// sliding drops with trails, on top of the kit's static beads (pure function of t). Each drop is a
// tiny lens: dark rim, the lamp's warm highlight up-right, the inverted cold sky at its base.
function slidingDrops(g, x, y, w, h, t, seed) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  for (let i = 0; i < 16; i++) {
    const sp = 18 + K.hash(i, seed) * 40, span = h + 80;
    const dx = x + K.hash(i + 0.4, seed) * w;
    const dy = y - 40 + ((K.hash(i + 0.2, seed) * span + t * sp) % span);
    const r = 2 + K.hash(i + 0.6, seed) * 2.5;
    const wob = Math.sin(dy * 0.05 + i) * 2;
    const tr = g.createLinearGradient(0, dy - 90, 0, dy);
    tr.addColorStop(0, "rgba(190,205,230,0)");
    tr.addColorStop(1, "rgba(190,205,230,0.16)");
    g.strokeStyle = tr;
    g.lineWidth = r * 0.9;
    g.beginPath();
    g.moveTo(dx + wob, dy);
    g.quadraticCurveTo(dx - wob, dy - 45, dx + wob * 0.5, dy - 90);
    g.stroke();
    g.fillStyle = "rgba(6,8,14,0.5)";
    g.beginPath(); g.ellipse(dx + wob, dy, r, r * 1.25, 0, 0, K.TAU); g.fill();
    g.fillStyle = "rgba(255,214,160,0.8)";
    g.beginPath(); g.arc(dx + wob + r * 0.35, dy - r * 0.4, r * 0.32, 0, K.TAU); g.fill();
    g.fillStyle = "rgba(120,140,190,0.35)";
    g.beginPath(); g.arc(dx + wob - r * 0.2, dy + r * 0.55, r * 0.5, 0, K.TAU); g.fill();
  }
  g.restore();
}
// the room, baked once with its lamp light (nothing in it moves): wallpaper, painted casing and
// mullions, the oak sill, the curtain's folds, the bedside table and the lamp's fabric shade.
function roomSprite() {
  return K.sprite("f00-room2", W + 80, H + 80, (s) => {
    s.translate(40, 40);
    K.texRect(s, "wallpaper", -40, -40, W + 80, H + 80, { scale: 190, tint: "#7a5a50", tintAlpha: 0.55 });
    // painted casing (architrave) round the window, wood showing through the paint
    const cas = new Path2D();
    cas.rect(WIN.x - 26, WIN.y - 26, WIN.w + 52, WIN.h + 26);
    K.texFill(s, "wood", cas, { scale: 160, rot: Math.PI / 2, tint: "#d8cfc2", tintAlpha: 0.82, tintMode: "source-over" });
    s.clearRect(WIN.x, WIN.y, WIN.w, WIN.h);
    // the casing's mouldings: a shadowed rebate on the inside edge, a lit outer bead
    s.strokeStyle = "rgba(0,0,0,0.45)";
    s.lineWidth = 3;
    s.strokeRect(WIN.x - 1.5, WIN.y - 1.5, WIN.w + 3, WIN.h + 3);
    s.strokeStyle = "rgba(255,240,220,0.18)";
    s.lineWidth = 1.2;
    s.strokeRect(WIN.x - 22, WIN.y - 22, WIN.w + 44, WIN.h + 40);
    K.aoEdge(s, WIN.x - 26, WIN.y - 26, WIN.x - 26, WIN.y + WIN.h, { width: 14, alpha: 0.35, side: 1 });
    // mullions (sash bars) with their own small shadow on the glass side
    const bar = (x, y, w, h) => { const p = new Path2D(); p.rect(x, y, w, h); K.texFill(s, "wood", p, { scale: 120, tint: "#cfc6b8", tintAlpha: 0.85, tintMode: "source-over" }); };
    bar(WIN.x + WIN.w / 2 - 5, WIN.y, 10, WIN.h);
    bar(WIN.x, WIN.y + WIN.h * 0.48 - 5, WIN.w, 10);
    s.fillStyle = "rgba(0,0,0,0.35)";
    s.fillRect(WIN.x + WIN.w / 2 - 5, WIN.y, 2, WIN.h);
    s.fillRect(WIN.x, WIN.y + WIN.h * 0.48 + 5, WIN.w, 2);
    // oak sill: a deep plank seen from above at a grazing angle (the grain runs along it, raked by
    // the lamp from the right), a rounded nosing catching a highlight, then a dark front face
    const sy = WIN.y + WIN.h;
    const top = new Path2D();
    top.moveTo(WIN.x - 40, sy); top.lineTo(WIN.x + WIN.w + 40, sy); top.lineTo(WIN.x + WIN.w + 56, sy + SILL_D); top.lineTo(WIN.x - 56, sy + SILL_D); top.closePath();
    s.save();
    s.clip(top);
    s.drawImage(sillTex(), WIN.x - 56, sy, WIN.w + 112, SILL_D);
    // the plank is worn paler where he always sits; a darker damp line along the glass (condensation)
    const worn = s.createRadialGradient(HERO.x, sy + SILL_D * 0.6, 4, HERO.x, sy + SILL_D * 0.6, 90);
    worn.addColorStop(0, "rgba(255,230,190,0.12)"); worn.addColorStop(1, "rgba(255,230,190,0)");
    s.fillStyle = worn; s.fillRect(HERO.x - 100, sy, 200, SILL_D);
    s.fillStyle = "rgba(10,6,4,0.45)"; s.fillRect(WIN.x - 40, sy, WIN.w + 80, 2.2);
    s.restore();
    s.fillStyle = "rgba(255,226,180,0.55)";
    s.fillRect(WIN.x - 56, sy + SILL_D - 1, WIN.w + 112, 1.6);
    const front = new Path2D();
    front.rect(WIN.x - 56, sy + SILL_D + 0.5, WIN.w + 112, 18);
    K.texFill(s, "wood", front, { scale: 200, tint: "#3a2416", tintAlpha: 0.75 });
    K.aoEdge(s, WIN.x - 56, sy + SILL_D + 18.5, WIN.x + WIN.w + 56, sy + SILL_D + 18.5, { width: 16, alpha: 0.55, side: -1 });
    K.aoEdge(s, WIN.x, sy + 0.5, WIN.x + WIN.w, sy + 0.5, { width: 6, alpha: 0.5, side: -1 });
    // curtain at the right of the window: heavy cotton in deep folds, lit from the lamp side
    const cx = WIN.x + WIN.w + 14;
    const cur = new Path2D();
    cur.moveTo(cx - 4, -40);
    cur.lineTo(cx + 124, -40);
    cur.bezierCurveTo(cx + 130, 150, cx + 126, 300, cx + 112, 440);
    cur.lineTo(cx + 10, 432);
    cur.bezierCurveTo(cx + 22, 260, cx + 8, 120, cx - 4, -40);
    cur.closePath();
    K.texFill(s, "fabric", cur, { scale: 70, tint: "#c0584a", tintAlpha: 0.75, tintMode: "multiply" });
    s.save();
    s.clip(cur);
    const fg = s.createLinearGradient(cx - 4, 0, cx + 126, 0);
    for (let k = 0; k <= 12; k++) {
      const u = k / 12, fold = 0.5 + 0.5 * Math.sin(u * Math.PI * 5.5 + 0.6);
      fg.addColorStop(u, `rgba(0,0,0,${(0.7 - 0.62 * fold) * (1 - u * 0.3)})`);
    }
    s.fillStyle = fg;
    s.fillRect(cx - 10, -40, 150, 500);
    s.restore();
    K.shadowBlob(s, cx + 60, 436, 70, 6, { alpha: 0.5 });
    // bedside table and lamp at the right edge
    const tb = new Path2D();
    tb.rect(815, 404, 200, 160);
    K.texFill(s, "wood", tb, { scale: 180, tint: "#4a2c1a", tintAlpha: 0.6 });
    s.fillStyle = "rgba(255,220,170,0.3)";
    s.fillRect(815, 404, 200, 2);
    K.aoEdge(s, 815, 404, 1015, 404, { width: 10, alpha: 0.5, side: 1 });
    // the shade: pleated linen, translucent - it is the light. Painted after the light map below.
    // the lamp light on the room: inverse-square falloff from the bulb; a little cold window light;
    // the curtain catches a warm bounce on the side that faces the lamp
    relight(s, "#120f16", [
      { x: LAMP2.x, y: LAMP2.y, r: 1150, color: "#ffc27a", k: 1.25 },
      { x: LAMP2.x - 60, y: 405, r: 420, color: "#ffcf8a", k: 0.8, flat: 0.25 },
      { x: LAMP2.x - 200, y: WIN.y + WIN.h + 8, r: 620, color: "#ffc27a", k: 0.7, flat: 0.12 },
      { x: LAMP2.x - 160, y: WIN.y + WIN.h + SILL_D * 0.5, r: 760, color: "#ffc890", k: 1.5, flat: 0.06 },
      { x: 640, y: 220, r: 300, color: "#ffb870", k: 0.5 },
      { x: WIN.x + WIN.w + 150, y: 300, r: 240, color: "#ffa860", k: 0.75, flat: 1.6 },
      { x: WIN.x + WIN.w / 2, y: WIN.y + WIN.h + 30, r: 380, color: "#3a4a70", k: 0.6, flat: 0.5 },
    ], null, (m) => {
      // the shade throws light up the wall through its open top
      const up = m.createRadialGradient(LAMP2.x, 244, 10, LAMP2.x, 150, 220);
      up.addColorStop(0, "rgba(255,200,130,0.9)"); up.addColorStop(1, "rgba(255,200,130,0)");
      m.fillStyle = up;
      m.beginPath(); m.moveTo(866, 246); m.lineTo(944, 246); m.lineTo(1010, -40); m.lineTo(800, -40); m.closePath(); m.fill();
    });
    // the nightstand: the hot pool straight under the shade, falling off fast
    s.save();
    s.globalCompositeOperation = "lighter";
    s.translate(LAMP2.x, 406);
    s.scale(1, 0.16);
    const pool = s.createRadialGradient(0, 0, 0, 0, 0, 120);
    pool.addColorStop(0, "rgba(255,214,150,0.55)"); pool.addColorStop(0.35, "rgba(255,200,130,0.22)"); pool.addColorStop(1, "rgba(255,190,120,0)");
    s.fillStyle = pool; s.fillRect(-120, -120, 240, 240);
    s.restore();
    // lamp base and stem in front of the pool
    s.fillStyle = "#2a1a10";
    s.beginPath(); s.ellipse(905, 402, 34, 6, 0, 0, K.TAU); s.fill();
    const stem = s.createLinearGradient(895, 0, 915, 0);
    stem.addColorStop(0, "#5a3a20"); stem.addColorStop(0.35, "#c08a50"); stem.addColorStop(1, "#24160c");
    s.fillStyle = stem;
    s.fillRect(898, 332, 14, 70);
    // the shade, lit from inside: hottest along its bottom rim (nearest the bulb), dimmer up top, the
    // weave and pleats as darker lines, a soft rolled hem instead of a hard top edge
    const shade = new Path2D();
    shade.moveTo(866, 246); shade.bezierCurveTo(890, 242, 920, 242, 944, 246); shade.lineTo(972, 330);
    shade.bezierCurveTo(930, 337, 880, 337, 838, 330); shade.closePath();
    const sg = s.createLinearGradient(0, 244, 0, 334);
    sg.addColorStop(0, "#a86a32"); sg.addColorStop(0.25, "#d89850"); sg.addColorStop(0.65, "#ffcf84"); sg.addColorStop(0.9, "#fff0c8"); sg.addColorStop(1, "#fffaf0");
    s.fillStyle = sg;
    s.fill(shade);
    s.save();
    s.clip(shade);
    s.globalCompositeOperation = "lighter";
    const hot = s.createRadialGradient(905, 318, 2, 905, 312, 62);
    hot.addColorStop(0, "rgba(255,250,235,0.85)"); hot.addColorStop(0.5, "rgba(255,220,160,0.3)"); hot.addColorStop(1, "rgba(255,200,130,0)");
    s.fillStyle = hot; s.fillRect(830, 240, 150, 100);
    s.globalCompositeOperation = "source-over";
    const edge = s.createLinearGradient(838, 0, 972, 0);
    edge.addColorStop(0, "rgba(90,40,10,0.45)"); edge.addColorStop(0.18, "rgba(90,40,10,0)"); edge.addColorStop(0.82, "rgba(90,40,10,0)"); edge.addColorStop(1, "rgba(90,40,10,0.4)");
    s.fillStyle = edge; s.fillRect(830, 240, 150, 100);
    K.texFill(s, "fabric", shade, { scale: 40, alpha: 0.16, mode: "multiply" });
    for (let i = 0; i < 18; i++) {
      const u = i / 17;
      s.fillStyle = `rgba(150,90,30,${0.06 + 0.05 * (i % 2)})`;
      s.beginPath(); s.moveTo(866 + u * 78, 244); s.lineTo(870 + u * 78 + 1.5, 244); s.lineTo(838 + u * 134 + 3, 334); s.lineTo(838 + u * 134, 334); s.fill();
    }
    const hem = s.createLinearGradient(0, 243, 0, 252);
    hem.addColorStop(0, "rgba(60,26,8,0.6)"); hem.addColorStop(1, "rgba(60,26,8,0)");
    s.fillStyle = hem; s.fillRect(830, 240, 150, 14);
    s.restore();
    s.save();
    s.globalCompositeOperation = "lighter";
    s.fillStyle = "rgba(255,236,200,0.5)";
    s.beginPath(); s.ellipse(905, 333.5, 66, 3.2, 0, 0, K.TAU); s.fill();
    s.restore();
  });
}
// the hero sill: deep oak plank, grain along its length (baked per pixel, once)
const SILL_D = 26;
const HERO = { x: 384, y: WIN.y + WIN.h + 15 };
function sillTex() {
  return K.texBake("f00-silltex", 512, 48, (u, v, out) => {
    const w = K.texFbm(u * 4, v * 3, 41, 3) * 0.6;
    const ring = Math.sin((v * 9 + u * 0.8 + w * 2.2) * Math.PI * 2);
    const fine = K.texNoise(u * 220, v * 26, 42);
    const pore = K.texNoise(u * 600, v * 60, 43) > 0.55 ? -0.12 : 0;
    const plank = Math.abs(((v * 2 + 0.03 * K.texNoise(u * 6, 1, 44)) % 1) - 0.5) < 0.012 ? -0.35 : 0;
    const k = 0.62 + 0.14 * ring + 0.06 * fine + pore + plank + 0.1 * K.texFbm(u * 9, v * 2, 45, 3);
    out[0] = 150 * k; out[1] = 98 * k; out[2] = 58 * k; out[3] = 255;
  });
}
function bokehDrops(g, t, a) {
  if (a <= 0.01) return;
  g.save();
  g.beginPath();
  g.rect(WIN.x, WIN.y, WIN.w, WIN.h);
  g.clip();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 13; i++) {
    // depth: beads on the glass (near the focus plane: small, dim) .. far lights (big, brighter)
    const d = K.hash(i, 45);
    const r = 5 + d * d * 20;
    const x = WIN.x + 20 + K.hash(i, 42) * (WIN.w - 40);
    const y = WIN.y + ((K.hash(i, 43) * WIN.h + t * (2 + K.hash(i, 44) * 5) * (1 - d)) % WIN.h);
    const warm = i % 3 !== 0;
    drawBokeh(g, x, y, r, warm ? "#ffcf8a" : "#9fb4d8", a * (0.12 + 0.3 * d) * (warm ? 1 : 0.8));
  }
  g.restore();
}
// Biscuit on the sill, three-quarters from behind, looking out through the glass: the body is the
// kit's sitting cat foreshortened (a sitting cat seen from behind is a narrow pear), his head turned
// away toward the glass so the bent ear stands against it. Key = the lamp (right, a little above
// him), no cold outline: the far side just falls off into the room's dark. Rendered at 12 fps into a
// cache (with its form shading, fur fringe and the 1.5 px warm rim on the lamp side) and stamped.
const FORE = 0.8;
const heroActive = (t) => (t > 11.8 && t < 13.0) || (t > 15.3 && t < 15.9);
function heroCat(g, t) {
  const tq = heroActive(t) ? Math.floor(t * 12) / 12 : 14.2;
  const meow = K.env(tq, 11.85, 12.9, 0.15, 0.4);
  const flick = Math.exp(-Math.pow((tq - 12.3) * 3, 2));
  const ear = Math.exp(-Math.pow((tq - 15.6) * 4, 2));
  const size = 124;
  // light positions in the cat's unforeshortened space
  const lx = HERO.x + (LAMP2.x - HERO.x) / FORE;
  const opts = {
    pose: "sit", facing: -1, headTurn: qn(-0.9 + meow * 0.3, 0.02), headTilt: qn(0.1 + 0.04 * meow, 0.02),
    t: tq, tail: 0.5 + flick * 0.5, breath: 0, autoBlink: false, mouth: meow * 0.8, ears: 0.1 * Math.sin(tq * 0.9) + 0.3 * ear,
    collar: true, bell: false, gaze: 0, pupil: 1,
    key: { x: lx, y: LAMP2.y - 20, color: "#ffc27a", strength: 1.2 },
    rim: { x: lx, y: LAMP2.y - 60, color: "#ffc890", strength: 0.35 },
    fill: "#0c0e18", ambient: "#141828", ambientK: 0.12, backlit: 0.3, castShadow: 0, shadow: false,
  };
  // breathing: ~0.3 Hz, the ribcage lifts him a fraction; a slow weight shift
  const br = Math.sin(t * K.TAU * 0.31), sh = Math.sin(t * 0.37) * 0.004;
  g.save();
  g.translate(HERO.x, HERO.y);
  g.transform(FORE * (1 + 0.004 * br), 0, sh, 1 + 0.009 * br, 0, 0);
  g.translate(-HERO.x, -HERO.y);
  catCached(g, HERO.x, HERO.y, size, opts, "f00-hero", 0.01, (s, ax, ay, qs) => {
    const k = qs / 60, lxl = ax + (lx - HERO.x), lyl = ay + (LAMP2.y - HERO.y);
    const cw = s.canvas.width, ch = s.canvas.height;
    s.globalCompositeOperation = "source-atop";
    // form: light falls off across him from the lamp to his far (window) side
    const dl = Math.hypot(lxl - ax, lyl - (ay - 60 * k)), r0 = Math.max(10, dl - 70 * k), r1 = dl + 60 * k;
    const fo = s.createRadialGradient(lxl, lyl, r0, lxl, lyl, r1);
    fo.addColorStop(0, "rgba(6,6,12,0)"); fo.addColorStop(0.35, "rgba(6,6,12,0.15)"); fo.addColorStop(0.7, "rgba(6,6,12,0.5)"); fo.addColorStop(1, "rgba(6,6,12,0.78)");
    s.fillStyle = fo; s.fillRect(0, 0, cw, ch);
    // his underside, haunch and the back of the body turned away from the lamp: in shadow
    const ug = s.createLinearGradient(0, ay - 40 * k, 0, ay);
    ug.addColorStop(0, "rgba(10,6,4,0)"); ug.addColorStop(0.6, "rgba(10,6,4,0.3)"); ug.addColorStop(1, "rgba(10,6,4,0.62)");
    s.fillStyle = ug; s.fillRect(0, ay - 40 * k, cw, 44 * k);
    // the lamp's warm wrap on the near (right) flank, broad and soft
    const wr = s.createRadialGradient(ax + 30 * k, ay - 70 * k, 4, ax + 30 * k, ay - 70 * k, 70 * k);
    wr.addColorStop(0, "rgba(255,190,120,0.14)"); wr.addColorStop(1, "rgba(255,190,120,0)");
    s.fillStyle = wr; s.fillRect(0, 0, cw, ch);
    s.globalCompositeOperation = "source-over";
    // guard hairs past the silhouette, then the thin warm rim on the lamp side only
    furFringe(s, cw, ch, 1.8, 0.4);
    const C = s.canvas, px = K.pixelScale();
    const R = K.makeCanvas(C.width, C.height), r = R.getContext("2d");
    r.drawImage(C, 0, 0);
    r.globalCompositeOperation = "destination-out";
    r.drawImage(C, -1.6 * px, 0.35 * px);
    r.globalCompositeOperation = "source-in";
    r.fillStyle = "#ffc890";
    r.fillRect(0, 0, R.width, R.height);
    r.globalCompositeOperation = "destination-in";
    r.fillStyle = patFor(r, strandTex());
    r.fillRect(0, 0, R.width, R.height);
    // only the upper, lamp-facing part of the edge (it dies off down his flank)
    r.setTransform(px, 0, 0, px, 0, 0);
    const rm = r.createLinearGradient(0, ay - 110 * k, 0, ay - 10 * k);
    rm.addColorStop(0, "rgba(0,0,0,1)"); rm.addColorStop(1, "rgba(0,0,0,0.15)");
    r.fillStyle = rm; r.fillRect(0, 0, cw, ch);
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = "lighter";
    s.globalAlpha = 0.85;
    s.drawImage(R, 0, 0);
  });
  g.restore();
}
function shotWindow(g, t, p) {
  // focus: the beads on the glass first, then a rack onto him by t = 11 (he stays sharp after)
  const rack = K.smooth(K.seg(t, 9.9, 11.0));
  const cam = winCam(t);
  const glass = (c, t) => {
    c.save();
    c.beginPath(); c.rect(WIN.x, WIN.y, WIN.w, WIN.h); c.clip();
    windowOutside(c, WIN.x, WIN.y, WIN.w, WIN.h, t);
    K.glassDrops(c, WIN.x, WIN.y, WIN.w, WIN.h, t, { seed: 13, density: 1.0, light: "#ffd9a0" });
    slidingDrops(c, WIN.x, WIN.y, WIN.w, WIN.h, t, 5);
    // the glass also mirrors the lamp and the warm room, faintly
    K.glow(c, WIN.x + WIN.w * 0.93, WIN.y + WIN.h * 0.8, 46, "#ffc27a", 0.22);
    c.restore();
  };
  if (rack < 1) K.withCamera(g, W, H, cam, () => { glass(g, t); g.drawImage(roomSprite(), -40, -40, W + 80, H + 80); });
  if (rack > 0) {
    // out of focus: the glass and the night drawn at a third of the resolution (an optical blur, no
    // filter), refreshed at 15 fps (nothing in it moves fast enough to show it)
    g.save();
    g.globalAlpha = rack;
    g.imageSmoothingEnabled = true;
    g.drawImage(softGlass(t, glass), 0, 0, W, H);
    K.withCamera(g, W, H, cam, () => g.drawImage(roomFocus(), -40, -40, W + 80, H + 80));
    g.restore();
  }
  K.withCamera(g, W, H, cam, () => {
    // the bulb itself, hot under the shade's rim
    K.glow(g, LAMP2.x, 334, 34, "#fff4dc", 0.85);
    K.glow(g, LAMP2.x, 334, 8, "#ffffff", 1);
    bokehDrops(g, t, rack);
    // his contact with the sill: occlusion right under him, and his soft shadow thrown left along the
    // plank, away from the lamp
    K.shadowBlob(g, HERO.x - 60, HERO.y + 1, 120, 10, { alpha: 0.5 });
    K.shadowBlob(g, HERO.x - 4, HERO.y + 1, 52, 6, { alpha: 0.85 });
    K.shadowBlob(g, HERO.x + 14, HERO.y + 1, 22, 3.5, { alpha: 0.9 });
    if (rack > 0) { g.save(); g.globalAlpha = rack; heroCat(g, t); g.restore(); }
  });
  if (rack < 1) {
    // before the rack he is out of focus: the same cached render through a 1/2.5 resolution pass
    const L = K.layer(Math.ceil(W / 2.5), Math.ceil(H / 2.5), "f00-herosoft");
    L.g.scale(1 / 2.5, 1 / 2.5);
    K.withCamera(L.g, W, H, cam, () => heroCat(L.g, t));
    g.save();
    g.globalAlpha = 1 - rack;
    g.imageSmoothingEnabled = true;
    g.drawImage(L.canvas, 0, 0, W, H);
    g.restore();
  }
}
// focused on him: the window wall and the sill he sits on (his depth) stay sharp, the curtain and the
// lamp nearer the lens fall out of focus - one baked plate, a feathered blend between the two
function roomFocus() {
  return K.sprite("f00-room2focus", W + 80, H + 80, (s) => {
    s.drawImage(blurredSpr("f00-room2soft", roomSprite(), W + 80, H + 80, 4), 0, 0, W + 80, H + 80);
    const M = K.makeCanvas((W + 80) * K.pixelScale(), (H + 80) * K.pixelScale()), m = M.getContext("2d");
    m.scale(K.pixelScale(), K.pixelScale());
    m.drawImage(roomSprite(), 0, 0, W + 80, H + 80);
    m.globalCompositeOperation = "destination-in";
    const gr = m.createLinearGradient(40 + WIN.x + WIN.w + 10, 0, 40 + WIN.x + WIN.w + 150, 0);
    gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    m.fillStyle = gr; m.fillRect(0, 0, W + 80, H + 80);
    s.drawImage(M, 0, 0, W + 80, H + 80);
  });
}
// the window shot's caches, one small job each: the room plates, the sill, then every pose the hero
// cat will need (the resting pose, the meow, the ear flick) - all built during the house shot
function warmWindow() {
  const L = () => K.layer(W, H, "f00-warm");
  const jobs = [() => roomSprite(), () => sillTex(), () => blurredSpr("f00-room2soft", roomSprite(), W + 80, H + 80, 4), () => roomFocus(), () => heroCat(L().g, 10)];
  for (let tt = 11.8; tt < 13.0; tt += 1 / 12) jobs.push(() => heroCat(L().g, tt + 0.01));
  for (let tt = 15.3; tt < 15.9; tt += 1 / 12) jobs.push(() => heroCat(L().g, tt + 0.01));
  return jobs;
}
// the out-of-focus glass layer, redrawn at 15 fps into a third-resolution canvas
let SOFTG = null;
const winCam = (t) => { const e = K.ease.inOut(K.seg(t, 9, 19)); return { x: K.lerp(470, 452, e), y: K.lerp(262, 276, e), zoom: 1.04 + 0.06 * e, shakeT: t * 0.6, shakeAmt: 0.9 }; };
function softGlass(t, glass) {
  const tq = Math.floor(t * 15) / 15, px = K.pixelScale();
  const key = tq + "@" + px;
  if (!SOFTG || SOFTG.key !== key) {
    if (!SOFTG || SOFTG.px !== px) SOFTG = { c: K.makeCanvas(Math.ceil((W * px) / 3), Math.ceil((H * px) / 3)), px };
    const s = SOFTG.c.getContext("2d");
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.clearRect(0, 0, SOFTG.c.width, SOFTG.c.height);
    s.setTransform(px / 3, 0, 0, px / 3, 0, 0);
    K.withCamera(s, W, H, winCam(tq), () => glass(s, tq));
    SOFTG.key = key;
  }
  return SOFTG.c;
}
// ---- shot 3: his POV down into the garden: pawprints appear ---------------------------------------------
// Looking down from the upstairs window: the wet lawn in true perspective, the back fence, the two
// old stones at the bottom of the garden. Nearly black - the only lights are the bedroom window's
// patch on the grass (with his silhouette in it), the pawprints themselves, and the lightning.
const HZ3 = 96;
const ST3 = [{ x: 540, y: 250, w: 66, h: 128, seed: 3 }, { x: 676, y: 244, w: 58, h: 112, seed: 5 }];
// window light thrown onto the lawn below: a perspective trapezoid (the window's image on the grass),
// the sash bars and his silhouette in it, its edges sharp near the house and softer with distance
// (penumbra grows with the throw). Baked once: a sharp patch, two blurs, blended by distance.
function winPatchSharp() {
  return K.sprite("f00-winpatch-sharp2", W, H, (c) => {
    const tr = [[300, 372], [640, 372], [770, 590], [170, 590]];
    const wl = c.createLinearGradient(0, 372, 0, 590);
    wl.addColorStop(0, "rgba(255,190,120,0.45)");
    wl.addColorStop(1, "rgba(255,196,130,1)");
    c.fillStyle = wl;
    poly(c, tr); c.fill();
    c.globalCompositeOperation = "destination-out";
    c.fillStyle = "#000";
    // sash bars: one converging vertical, one horizontal
    c.beginPath(); c.moveTo(465, 372); c.lineTo(475, 372); c.lineTo(478, 590); c.lineTo(462, 590); c.closePath(); c.fill();
    c.fillRect(150, 470, 660, 13);
    // his silhouette, sitting on the sill, stretched by the throw
    c.save();
    c.translate(560, 560);
    c.transform(1, 0, -0.22, 1.25, 0, 0);
    K.drawCat(c, 0, 0, 80, { pose: "sit", facing: -1, t: 0, shadow: false, tail: 0.5, lod: 0, flat: true });
    c.restore();
  });
}
function winPatch() {
  return K.sprite("f00-winpatch4", W, H, (c) => {
    const near = blurredSpr("f00-wp-near", winPatchSharp(), W, H, 2.5);
    const far = blurredSpr("f00-wp-far", winPatchSharp(), W, H, 10);
    c.drawImage(far, 0, 0, W, H);
    const M = K.makeCanvas(W * K.pixelScale(), H * K.pixelScale());
    const m = M.getContext("2d");
    m.scale(K.pixelScale(), K.pixelScale());
    m.drawImage(near, 0, 0, W, H);
    m.globalCompositeOperation = "destination-in";
    const gr = m.createLinearGradient(0, 380, 0, 560);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,1)");
    m.fillStyle = gr; m.fillRect(0, 0, W, H);
    c.globalCompositeOperation = "destination-out";
    const gr2 = c.createLinearGradient(0, 380, 0, 560);
    gr2.addColorStop(0, "rgba(0,0,0,0)"); gr2.addColorStop(1, "rgba(0,0,0,1)");
    c.fillStyle = gr2; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = "lighter";
    c.drawImage(M, 0, 0, W, H);
    // the room light thins out with the throw and with the angle: a soft radial falloff, no hard edge
    c.globalCompositeOperation = "destination-in";
    c.save();
    c.translate(470, 520);
    c.scale(1.35, 0.62);
    const rf = c.createRadialGradient(0, 0, 20, 0, -40, 330);
    rf.addColorStop(0, "rgba(0,0,0,1)"); rf.addColorStop(0.45, "rgba(0,0,0,0.8)"); rf.addColorStop(0.8, "rgba(0,0,0,0.25)"); rf.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = rf; c.fillRect(-400, -500, 800, 900);
    c.restore();
  });
}
function gardenContent(s) {
  s.fillStyle = "#0a0b0f";
  s.fillRect(-40, -40, W + 80, HZ3 + 50);
  tinted(s, "f00-s3-trees", (c) => {
    for (let i = 0; i < 6; i++) K.tree(c, 40 + i * 180 + K.hash(i, 3) * 60, 150, 0.36 + K.hash(i, 4) * 0.16, { seed: 30 + i, leaf: "#1e3020", trunk: "#14120e", kind: i % 3 ? "oak" : "bare", shadow: false });
  }, "#06070a", 0.9);
  K.groundPlane(s, W, H + 40, { tex: "turf", texOpts: { seed: 3 }, horizon: HZ3, y0: 140, scale: 420, focal: 620, wet: 0.75, sky: "#30343e", puddles: 0.35, fog: "#14171c", fogAmt: 0.6, tint: "#3a5038", tintAlpha: 0.3, variation: 0.95, cache: false });
  // trodden, longer grass along the fence and around the stones
  K.grass(s, -40, W + 40, 166, { seed: 3, color: "#24361e", height: 12, density: 0.6 });
  K.fence(s, -40, W + 40, 162, 40, { night: true, color: "#3a3c40", gap: [585, 628], tuft: false });
  K.aoEdge(s, -40, 162, W + 40, 162, { width: 12, alpha: 0.5, side: -1 });
  for (const q of ST3) {
    K.shadowBlob(s, q.x, q.y, q.w * 0.75, q.w * 0.12, { alpha: 0.75 });
    s.drawImage(stoneSpr(q.seed, 72, 140, { L: [0.75, -0.45, 0.5], key: [255, 170, 100], keyK: 0.9, amb: [120, 140, 180], ambK: 0.45, wet: 1, lichen: 0.6 }), q.x - q.w / 2, q.y - q.h, q.w, q.h);
    K.grass(s, q.x - q.w * 0.6, q.x + q.w * 0.6, q.y + 1, { seed: q.seed + 20, color: "#24361e", height: 9, density: 0.8 });
  }
}
// lit garden plate: a faint distant sodium streetlamp off to the right (the fence and stones read as
// low-key shapes, never void), the cool night sky fill (blacks lifted to ~0.03, cool), and the window's
// patch on the grass. flash = the same garden in a lightning flash (cold, from the whole sky).
function gardenPlate(flash) {
  if (flash) return gardenLit(true);
  // under moonless cloud the eye (and the film) sees no colour: outside the window light the lawn
  // goes grey-blue; only the warm patch keeps its green
  return K.sprite("f00-s3plate-graded", W + 80, H + 80, (s) => {
    s.fillStyle = "#020304";
    s.fillRect(0, 0, W + 80, H + 80);
    s.drawImage(gardenLit(false), 0, 0, W + 80, H + 80);
    s.translate(40, 40);
    s.save();
    s.translate(470, 520); s.scale(1.4, 0.7);
    const m = (c0) => { const gr = s.createRadialGradient(0, -30, 60, 0, -30, 420); gr.addColorStop(0, K.rgba(c0, 0)); gr.addColorStop(0.55, K.rgba(c0, 0.55)); gr.addColorStop(1, K.rgba(c0, 0.85)); return gr; };
    s.globalCompositeOperation = "saturation";
    s.fillStyle = m("#808080"); s.fillRect(-500, -900, 1000, 1200);
    s.globalCompositeOperation = "multiply";
    s.fillStyle = m("#8aa0c8"); s.fillRect(-500, -900, 1000, 1200);
    s.restore();
  });
}
function gardenLit(flash) {
  return bakeLit("f00-s3plate:" + (flash ? 1 : 0), -40, -40, W + 80, H + 80, gardenContent, () => lightMap(flash ? "#b8c4e8" : "#3a4660", [
    { x: 1180, y: -60, r: 1250, color: "#ff9a48", k: flash ? 0.3 : 1.6 },
    { x: 960, y: 170, r: 620, color: "#ffa858", k: flash ? 0.2 : 0.8, flat: 0.5 },
  ], (s) => s.fillRect(-80, -80, W + 160, HZ3 + 30), (s) => {
    s.globalAlpha = flash ? 0.6 : 1.25;
    s.drawImage(winPatch(), 0, 0, W, H);
    if (!flash) { s.globalAlpha = 0.5; s.drawImage(winPatch(), 0, 0, W, H); }
    s.globalAlpha = 1;
  }));
}
function glassFrame() {
  const sharp = K.sprite("f00-glassframe-sharp", W, H, (c) => {
    const fr = (x, y, w, h, k) => {
      const p = new Path2D();
      p.rect(x, y, w, h);
      K.texFill(c, "wood", p, { scale: 120, rot: Math.PI / 2, tint: K.mix("#120d0b", "#4a3a30", k), tintAlpha: 0.9, tintMode: "source-over" });
    };
    fr(-10, -10, 44, H + 20, 0.1);
    fr(W - 38, -10, 48, H + 20, 0.6);
    fr(-10, -10, W + 20, 40, 0.25);
    K.aoEdge(c, 34, 30, 34, H, { width: 10, alpha: 0.5, side: 1 });
    c.fillStyle = "rgba(255,200,140,0.22)";
    c.fillRect(W - 39, 30, 1.5, H);
  });
  return blurredSpr("f00-glassframe-soft", sharp, W, H, 3);
}
function roomGhost() {
  return K.sprite("f00-roomghost", W, H, (c) => {
    // the lamp and its shade, the lit wall, a darker door-shaped block: soft and dim (a reflection
    // in a single pane is ~4% of the room)
    const L = [[820, 150, 140, "rgba(255,190,120,0.22)"], [820, 150, 30, "rgba(255,230,190,0.3)"], [640, 260, 340, "rgba(200,130,80,0.08)"], [180, 120, 220, "rgba(160,110,80,0.05)"]];
    for (const [x, y, r, col] of L) {
      const gr = c.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = gr; c.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    c.fillStyle = "rgba(255,200,140,0.08)";
    c.beginPath(); c.moveTo(788, 118); c.lineTo(852, 118); c.lineTo(866, 168); c.lineTo(774, 168); c.closePath(); c.fill();
    if (K.hasFilter()) { const t2 = K.makeCanvas(c.canvas.width, c.canvas.height); t2.getContext("2d").drawImage(c.canvas, 0, 0); c.clearRect(0, 0, W, H); c.filter = "blur(" + (6 * K.pixelScale()).toFixed(1) + "px)"; c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(t2, 0, 0); c.filter = "none"; }
  });
}
function shotGarden(g, t, p) {
  const fl = K.flash(t, [21.0, 21.32], 0.1);
  const e = K.ease.inOut(p);
  const cam = { x: K.lerp(480, 500, e), y: K.lerp(270, 256, e), zoom: 1.02 + 0.06 * e, shakeT: t * 0.6, shakeAmt: 1.2 };
  const pts = K.pawTrail(608, 252, 470, 525, 11, t, { start: 20, every: 0.5, life: 12, s0: 5, s1: 15 });
  K.withCamera(g, W, H, cam, () => {
    g.drawImage(gardenPlate(false), -40, -40, W + 80, H + 80);
    if (fl > 0.02) { g.save(); g.globalAlpha = fl; g.drawImage(gardenPlate(true), -40, -40, W + 80, H + 80); g.restore(); }
    // the pawprints: amber light on the wet grass, from between the stones toward the house
    for (const q of pts) if (q.alpha > 0.02) K.lightPool(g, q.x, q.y, q.s * 5, "#ff9a3a", { flat: 0.4, intensity: 0.45 * q.alpha });
    K.pawprints(g, pts, 1.15);
    // rain from above: only seen where the window light or the far lamp catches it
    const RL = {
      lights: [{ x: 470, y: 500, r: 260, color: "#ffc890", k: 1.1, flat: 0.6 }, { x: 1060, y: 40, r: 700, color: "#ffa858", k: 0.35 }],
      amb: 0.03 + 0.7 * fl, ambColor: "#a8b4d8",
    };
    rain3(g, t, Object.assign({ angle: 0.08, seed: 5, density: 0.85 }, RL));
    splash3(g, t, Object.assign({ x0: 140, x1: 780, y0: 380, y1: 580, n: 70, seed: 4, scale: 0.8 }, RL));
    // layered ground mist: thin far off, lying in the low ground, drifting
    fogBand(g, 170, 64, "#2a3a52", 0.85, t, 3, 6);
    fogBand(g, 222, 100, "#2a3a52", 0.6, t, 13, 9);
    fogBand(g, 310, 140, "#2a3a52", 0.4, t, 23, 12);
    fogBand(g, 450, 170, "#2a3a52", 0.22, t, 33, 15);
  });
  // the window pane itself: the warm room behind us faintly mirrored in it (the lamp, the bright
  // wall), so we are unmistakably looking through glass
  g.save();
  g.globalCompositeOperation = "screen";
  g.globalAlpha = 0.85;
  g.drawImage(roomGhost(), 0, 0, W, H);
  g.restore();
  // the glass we look through: soft beads (a third-resolution pass), and the casing close to the lens
  const S = K.layer(Math.ceil(W / 2.5), Math.ceil(H / 2.5), "f00-glasssoft");
  S.g.scale(1 / 2.5, 1 / 2.5);
  K.glassDrops(S.g, 0, 0, W, H, t, { seed: 17, density: 0.6, light: "#ffd9a0" });
  slidingDrops(S.g, 0, 0, W, H, t, 9);
  g.save(); g.globalAlpha = 0.55; g.drawImage(S.canvas, 0, 0, W, H); g.restore();
  g.drawImage(glassFrame(), 0, 0, W, H);
  if (fl > 0) { g.save(); g.globalCompositeOperation = "screen"; g.fillStyle = K.rgba("#8090b8", 0.12 * fl); g.fillRect(0, 0, W, H); g.restore(); }
}

// ---- shared: perspective-textured surfaces --------------------------------------------------------------
// paintPersp(s, name, x0, x1, topF, botF, o): a vertical plane receding to a vanishing point, textured
// column by column (every column is an exact affine slice, so boards/grain converge correctly).
// u (tiles) = o.uK / (o.vpx - x) ; v repeats o.rows times between topF(x) and botF(x). Bake-time only.
function paintPersp(s, name, x0, x1, topF, botF, o) {
  const tex = K.texture(name, o.tex || { seed: 1 });
  const tw = tex.width, th = tex.height, rows = o.rows || 1, step = o.step || 2;
  for (let x = x0; x < x1; x += step) {
    const u = o.uK / (o.vpx - x);
    const sx = Math.floor(((u % 1) + 1) % 1 * (tw - 1));
    const yt = topF(x), yb = botF(x), hh = (yb - yt) / rows;
    for (let r = 0; r < rows; r++) s.drawImage(tex, sx, 0, 1, th, x, yt + r * hh, step + 0.6, hh + 0.6);
  }
  const p = new Path2D();
  p.moveTo(x0, topF(x0)); p.lineTo(x1, topF(x1)); p.lineTo(x1, botF(x1)); p.lineTo(x0, botF(x0)); p.closePath();
  if (o.tint) { s.save(); s.globalCompositeOperation = o.tintMode || "multiply"; s.globalAlpha = o.tintAlpha == null ? 0.6 : o.tintAlpha; s.fillStyle = o.tint; s.fill(p); s.restore(); }
  return p;
}
// a clipped hedge: a ragged foliage mass (texture, not circles), darker at its foot (AO) and lit
// along its top edge. pts = top edge [x,y,...] from left to right; base = bottom y at each end.
function hedgeMass(s, pts, b0, b1, o = {}) {
  const p = new Path2D();
  const n = pts.length / 2;
  p.moveTo(pts[0], b0);
  for (let i = 0; i < n; i++) p.lineTo(pts[i * 2], pts[i * 2 + 1]);
  p.lineTo(pts[pts.length - 2], b1);
  p.closePath();
  s.fillStyle = o.base || "#0c140c";
  s.fill(p);
  K.texFill(s, "foliage", p, { scale: o.scale || 90, tex: { seed: o.seed || 3, color: o.color || "#2e4a26" }, alpha: 0.95, tint: o.tint || "#3a4a40", tintAlpha: 0.55 });
  s.save();
  s.clip(p);
  const yTop = Math.min(...pts.filter((_, i) => i % 2)), yBot = Math.max(b0, b1);
  const gr = s.createLinearGradient(0, yTop, 0, yBot);
  gr.addColorStop(0, "rgba(0,0,0,0)");
  gr.addColorStop(0.55, "rgba(0,0,0,0.25)");
  gr.addColorStop(1, "rgba(0,0,0,0.7)");
  s.fillStyle = gr;
  s.fill(p);
  s.restore();
  return p;
}
const ragged = (x0, x1, yF, amp, seed, n = 60) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const x = K.lerp(x0, x1, i / n);
    pts.push(x, yF(x) - amp * (0.6 * K.noise(i * 0.35, seed) + 0.4 * K.noise(i * 1.7, seed + 9)));
  }
  return pts;
};

// ---- shot 4: the cat flap, from outside, a LOW camera (horizon at y 196) ---------------------------------
// The porch lamp is the key: a bare bulb in a wall lantern, left of the door. The patio is wet
// stone flags that mirror it; the siding and door fall off with distance from it; the kitchen
// glows through the door's glass and through the flap when it opens.
const VP = [940, 196];
// a line through VP: y at screen x for a line that passes through (x0, y0)
const toVP = (x, x0, y0) => y0 + (VP[1] - y0) * ((x - x0) / (VP[0] - x0));
const gY = (x) => toVP(x, -40, 470); // the wall's foot on the patio
const tY = (x) => toVP(x, -40, -300); // the wall's top edge (out of frame)
const wallAt = (x, k) => K.lerp(gY(x), tY(x), k); // k = 0 ground .. 1 top
const FLAP = { x0: 122, x1: 176, k0: 0.012, k1: 0.13 };
const DOOR = { x0: 92, x1: 212, k: 0.6 };
const PORCH = [262, wallAt(262, 0.43)];
function flapAngle(t) {
  if (t < 28.0) return 0;
  if (t < 29.7) return 1.0 * K.smooth(K.seg(t, 28.0, 28.35)); // his head pushes it open, his body holds it
  const u = t - 29.7;
  return 1.0 * Math.cos(u * 6) * Math.exp(-u); // he is through: it swings shut and clicks
}
function catFlapPos(t) {
  const fx = (FLAP.x0 + FLAP.x1) / 2;
  if (t < 29.8) {
    // squeezing through: from inside the flap to just outside it
    const u = K.ease.inOut(K.seg(t, 28.0, 29.8));
    return { x: K.lerp(fx - 40, fx + 70, u), y: K.lerp(gY(fx) - 2, gY(fx) + 14, u), size: 64, pose: "walk", phase: t * 1.1, head: 0.1, ears: -0.2 * (1 - u) };
  }
  if (t < 31.9) {
    const u = K.ease.inOut(K.seg(t, 29.8, 31.9));
    return { x: K.lerp(fx + 70, 380, u), y: K.lerp(gY(fx) + 14, 436, u), size: K.lerp(64, 60, u), pose: "walk", phase: t * 1.15, head: 0.05 };
  }
  if (t < 33.6) {
    // stops; looks back over his shoulder at the house, eyes catching the porch light
    const look = K.smooth(K.seg(t, 32.0, 32.45)) - K.smooth(K.seg(t, 33.2, 33.6));
    return { x: 380, y: 436, size: 60, pose: "stand", phase: 0, head: K.lerp(0.05, 0.92, look), gaze: -0.3 * look, glow: look, tailUp: 0.4 };
  }
  const u = K.ease.in(K.seg(t, 33.6, 35.2));
  return { x: K.lerp(380, 820, u), y: K.lerp(436, 300, u), size: K.lerp(60, 26, u), pose: u > 0.12 ? "run" : "walk", phase: t * 2.2, head: 0.05, speed: u };
}
// everything static in the shot, baked once at full light (the light map darkens it per frame)
function flapSet() {
  return K.sprite("f00-flapset3", W + 80, H + 40, (s) => {
    s.translate(40, 20);
    // wet stone flags running off to the vanishing point
    s.save();
    s.translate(-40, 0);
    K.groundPlane(s, W + 80, H + 20, { tex: "cobble", texOpts: { seed: 4, cells: 5, wet: 1, moss: 0.3, color: "#6a6862" }, horizon: VP[1], cx: VP[0] + 40, focal: 520, scale: 420, y0: VP[1], wet: 1, puddles: 0.55, sky: "#3a3640", fog: "#14161c", fogAmt: 0.7, variation: 0.8, cache: false });
    s.restore();
    // painted weatherboard siding in perspective
    const wall = paintPersp(s, "siding", -40, 520, tY, gY, { vpx: VP[0], uK: 4200, rows: 9, tex: { seed: 3, color: "#8c98a8", rows: 6 }, tint: "#7a8290", tintAlpha: 0.55 });
    // weathering: grime streaks down from the eaves, darker damp band at the foot
    s.save();
    s.clip(wall);
    const R = K.rng("f00-grime");
    for (let i = 0; i < 26; i++) {
      const x = -40 + R() * 560, w = 6 + R() * 26, y0 = wallAt(x, 0.5 + R() * 0.5);
      const gr = s.createLinearGradient(0, y0, 0, gY(x));
      gr.addColorStop(0, "rgba(20,24,20,0)");
      gr.addColorStop(1, `rgba(20,24,20,${0.08 + R() * 0.12})`);
      s.fillStyle = gr;
      s.fillRect(x, y0, w, gY(x) - y0);
    }
    for (let x = -40; x < 520; x += 4) {
      const gy = gY(x), h = (gy - tY(x)) * 0.05;
      s.fillStyle = "rgba(10,14,12,0.35)";
      s.fillRect(x, gy - h, 4.6, h);
    }
    // rain-streak darkening running down from the eaves (out of frame above): long irregular runs
    for (let i = 0; i < 70; i++) {
      const x = -40 + R() * 560, w = 1 + R() * 5, y0 = tY(x) + R() * 60, y1 = K.lerp(y0, gY(x), 0.4 + R() * 0.6);
      const gr = s.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, `rgba(18,22,20,${0.12 + R() * 0.2})`);
      gr.addColorStop(1, "rgba(18,22,20,0)");
      s.fillStyle = gr;
      s.fillRect(x, y0, w, y1 - y0);
    }
    // each board casts its own slightly wavy shadow line on the one below (warped weatherboard)
    for (let r = 0; r < 54; r++) {
      const k = 0.02 + r * 0.0185;
      s.strokeStyle = "rgba(0,0,0,0.1)";
      s.lineWidth = 0.9;
      s.beginPath();
      for (let x = -40; x <= 520; x += 16) {
        const y = wallAt(x, k) + 0.7 * K.noise(x * 0.02 + r * 3.1, 5);
        if (x === -40) s.moveTo(x, y); else s.lineTo(x, y);
      }
      s.stroke();
    }
    // chipped paint: bare grey wood showing in flecks, mostly low down where the rain splashes
    const chip = K.texBake("f00-chips", 256, 256, (u, v, out) => {
      const n = K.texFbm(u * 9, v * 9, 31, 4, 9, 9) + 0.5 * K.texNoise(u * 40, v * 40, 32, 40, 40);
      const a = sm01(0.42, 0.55, n);
      out[0] = 86; out[1] = 80; out[2] = 70; out[3] = a * 230;
    });
    s.globalAlpha = 0.85;
    for (let x = -40; x < 520; x += 3) {
      const yt = wallAt(x, 0.55), yb = gY(x);
      s.drawImage(chip, (((x * 1.7) % 256) + 256) % 256, 0, 2, 256, x, yt, 3.4, yb - yt);
    }
    s.globalAlpha = 1;
    s.restore();
    // the door: dark-stained boards, a painted casing round it
    const dTop = (x) => wallAt(x, DOOR.k);
    paintPersp(s, "wood", DOOR.x0 - 10, DOOR.x0, (x) => wallAt(x, DOOR.k + 0.02), gY, { vpx: VP[0], uK: 3000, rows: 1, tex: { seed: 9, color: "#d8d0c4", planks: 1 }, tint: "#9a9488", tintAlpha: 0.4 });
    paintPersp(s, "wood", DOOR.x1, DOOR.x1 + 9, (x) => wallAt(x, DOOR.k + 0.02), gY, { vpx: VP[0], uK: 3000, rows: 1, tex: { seed: 9, color: "#d8d0c4", planks: 1 }, tint: "#9a9488", tintAlpha: 0.4 });
    paintPersp(s, "wood", DOOR.x0 - 10, DOOR.x1 + 9, (x) => wallAt(x, DOOR.k + 0.035), (x) => wallAt(x, DOOR.k), { vpx: VP[0], uK: 3000, rows: 1, tex: { seed: 9, color: "#d8d0c4", planks: 1 } });
    const door = paintPersp(s, "wood", DOOR.x0, DOOR.x1, dTop, gY, { vpx: VP[0], uK: 1400, rows: 2, step: 1, tex: { seed: 7, color: "#6a3424", dark: "#2a120a", planks: 5 } });
    // recessed lower panels: a shadowed top/left edge, a lit bottom bead
    for (const [a, b] of [[0.06, 0.26]]) {
      for (const [xa, xb] of [[DOOR.x0 + 12, DOOR.x0 + 54], [DOOR.x0 + 66, DOOR.x1 - 12]]) {
        K.aoEdge(s, xa, wallAt(xa, b), xb, wallAt(xb, b), { width: 7, alpha: 0.6, side: -1 });
        K.aoEdge(s, xa, wallAt(xa, a), xa, wallAt(xa, b), { width: 5, alpha: 0.45, side: -1 });
        s.strokeStyle = "rgba(255,220,180,0.16)";
        s.lineWidth = 1.2;
        s.beginPath(); s.moveTo(xa, wallAt(xa, a)); s.lineTo(xb, wallAt(xb, a)); s.stroke();
      }
    }
    s.save(); s.clip(door);
    K.aoEdge(s, DOOR.x0, gY(DOOR.x0), DOOR.x1, gY(DOOR.x1), { width: 16, alpha: 0.55, side: 1 });
    s.restore();
    // the cat-flap housing: grey plastic frame with a soft bevel
    const fx0 = FLAP.x0, fx1 = FLAP.x1;
    const hp = new Path2D();
    hp.moveTo(fx0 - 7, wallAt(fx0 - 7, FLAP.k1 + 0.022)); hp.lineTo(fx1 + 7, wallAt(fx1 + 7, FLAP.k1 + 0.022));
    hp.lineTo(fx1 + 7, wallAt(fx1 + 7, FLAP.k0 - 0.01)); hp.lineTo(fx0 - 7, wallAt(fx0 - 7, FLAP.k0 - 0.01)); hp.closePath();
    K.texFill(s, "noise", hp, { scale: 40, tint: "#5a5856", tintAlpha: 0.85, tintMode: "multiply" });
    s.fillStyle = "rgba(255,240,220,0.12)";
    s.beginPath(); s.moveTo(fx0 - 7, wallAt(fx0 - 7, FLAP.k1 + 0.022)); s.lineTo(fx1 + 7, wallAt(fx1 + 7, FLAP.k1 + 0.022)); s.lineTo(fx1 + 7, wallAt(fx1 + 7, FLAP.k1 + 0.016)); s.lineTo(fx0 - 7, wallAt(fx0 - 7, FLAP.k1 + 0.016)); s.fill();
    // wall meets patio: occlusion both ways
    K.aoEdge(s, -40, gY(-40), 520, gY(520), { width: 22, alpha: 0.55, side: 0 });
    // the house's far corner: a corner board, then the side wall turning away into the dark
    paintPersp(s, "wood", 516, 528, tY, gY, { vpx: VP[0], uK: 3000, rows: 1, tex: { seed: 2, color: "#c8c0b4", planks: 1 }, tint: "#606670", tintAlpha: 0.6 });
    // the porch lantern's iron bracket and housing (the bulb is drawn live, as a light)
    s.fillStyle = "#121212";
    s.fillRect(PORCH[0] - 9, PORCH[1] - 20, 18, 30);
    s.fillRect(PORCH[0] - 2, PORCH[1] + 10, 4, 12);
    s.fillStyle = "rgba(255,255,255,0.08)";
    s.fillRect(PORCH[0] - 9, PORCH[1] - 20, 2, 30);
  });
}
// the night beyond the corner of the house: storm deck, the back fence, an oak against the cloud
function flapBeyond(g, t, fl) {
  drawDeck(g, 470, -60, W - 400, VP[1] + 90, 43, fl, t - 27, 3, 0.7);
  ridge(g, { y: VP[1] - 2, amp: 22, color: "#0a0d12", seed: 6, x0: 480, bottom: VP[1] + 30 });
  tinted(g, "f00-s4-oak", (c) => K.tree(c, 780, VP[1] + 14, 0.95, { seed: 12, leaf: "#1e3020", trunk: "#14120e", t, kind: "oak", sway: 2.4, night: true, shadow: false }), "#05070a", 0.93);
  K.fence(g, 520, W + 40, VP[1] + 14, 30, { night: true, color: "#2a2e36" });
  K.fog(g, W + 80, H, { y: VP[1] - 10, h: 40, color: "#1a1c22", alpha: 0.45, t, seed: 7 });
}
function shotFlap(g, t, p) {
  const e = K.ease.inOut(p);
  const cam = { x: K.lerp(468, 492, e), y: K.lerp(268, 274, e), zoom: 1.03 + 0.04 * e, shakeT: t, shakeAmt: 0.9 };
  const wet = 0.6 * K.smooth(K.seg(t, 28.6, 31.0));
  const fl = K.flash(t, [33.0], 0.12) * 0.6;
  const porchFl = 1 - 0.08 * Math.max(0, Math.sin(t * 17) * Math.sin(t * 5.3));
  const th = flapAngle(t);
  const open = K.clamp(Math.abs(th) * 1.5);
  const fx0 = FLAP.x0, fx1 = FLAP.x1;
  const fb0 = wallAt(fx0, FLAP.k0), fb1 = wallAt(fx1, FLAP.k0), ft0 = wallAt(fx0, FLAP.k1), ft1 = wallAt(fx1, FLAP.k1);
  const opening = new Path2D();
  opening.moveTo(fx0, ft0); opening.lineTo(fx1, ft1); opening.lineTo(fx1, fb1); opening.lineTo(fx0, fb0); opening.closePath();
  const gq = [[DOOR.x0 + 14, 0.52], [DOOR.x1 - 12, 0.52], [DOOR.x1 - 12, 0.3], [DOOR.x0 + 14, 0.3]].map(([x, k]) => [x, wallAt(x, k)]);
  const glassP = new Path2D();
  glassP.moveTo(...gq[0]); glassP.lineTo(...gq[1]); glassP.lineTo(...gq[2]); glassP.lineTo(...gq[3]); glassP.closePath();
  K.withCamera(g, W, H, cam, () => {
    flapBeyond(g, t, fl);
    g.drawImage(flapSet(), -40, -20, W + 80, H + 40);
    // inside the flap's opening: the dark gap, then the warm kitchen as it opens
    g.fillStyle = "#050404";
    g.fill(opening);
    // the kitchen through the door's glass (a light source in its own right)
    const kg = g.createLinearGradient(0, gq[2][1], 0, gq[0][1]);
    kg.addColorStop(0, "#fff0d0"); kg.addColorStop(0.35, "#f0b070"); kg.addColorStop(1, "#8a5028");
    g.fillStyle = kg;
    g.fill(glassP);
    g.save(); g.clip(glassP);
    g.fillStyle = "rgba(40,22,10,0.55)";
    g.fillRect((DOOR.x0 + DOOR.x1) / 2 - 3, 0, 6, H);
    g.fillRect(0, wallAt(150, 0.41) - 2, W, 4);
    g.restore();
    if (open > 0.02) { g.fillStyle = K.rgba("#ffc890", 0.9 * open); g.fill(opening); }
    // light: the porch bulb (inverse-square from its real position), the door glass and the flap
    relight(g, K.mix("#1a1e28", "#8090b8", fl), [
      { x: PORCH[0], y: PORCH[1] + 20, r: 560, color: "#ffd79a", k: 1.25 * porchFl },
      { x: PORCH[0] + 70, y: gY(PORCH[0]) + 30, r: 420, color: "#ffcf90", k: 0.9 * porchFl, flat: 0.32 },
      { x: (DOOR.x0 + DOOR.x1) / 2 + 40, y: gY(150) + 30, r: 260, color: "#ffb870", k: 0.45, flat: 0.3 },
      { x: fx1 + 40, y: fb1 + 10, r: 200, color: "#ffb870", k: 0.9 * open, flat: 0.35 },
      { x: 820, y: 330, r: 720, color: "#5a6478", k: 0.6, flat: 0.5 },
    ], (s) => {
      s.fillRect(532, -80, W, VP[1] + 70);   // the sky beyond keeps its own (baked) light
      s.fill(glassP);
      if (open > 0.02) { s.globalAlpha = open; s.fill(opening); s.globalAlpha = 1; }
    });
    // the door glass: the cool night mirrored over the warm kitchen, beads and runs of rain on it
    g.save();
    g.clip(glassP);
    const rgl = g.createLinearGradient(gq[3][0], gq[3][1], gq[1][0], gq[1][1]);
    rgl.addColorStop(0, "rgba(90,110,150,0.32)"); rgl.addColorStop(0.45, "rgba(60,74,100,0.08)"); rgl.addColorStop(0.6, "rgba(120,140,180,0.22)"); rgl.addColorStop(1, "rgba(40,50,70,0.05)");
    g.globalCompositeOperation = "screen";
    g.fillStyle = rgl;
    g.fill(glassP);
    g.globalCompositeOperation = "source-over";
    const gx0 = Math.min(gq[0][0], gq[3][0]), gy0 = Math.min(gq[2][1], gq[3][1]), gx1 = Math.max(gq[1][0], gq[2][0]), gy1 = Math.max(gq[0][1], gq[1][1]);
    K.glassDrops(g, gx0, gy0, gx1 - gx0, gy1 - gy0, t, { seed: 23, density: 2.2, light: "#ffd9a0", scale: 0.28 });
    slidingDrops(g, gx0, gy0, gx1 - gx0, gy1 - gy0, t, 23);
    g.restore();
    // the bulb behind its seeded glass, and its long reflection in the wet flags
    K.glow(g, PORCH[0], PORCH[1], 46, "#ffd79a", 0.55 * porchFl);
    K.glow(g, PORCH[0], PORCH[1], 7, "#ffffff", 1);
    K.reflectStreak(g, PORCH[0] + 6, gY(PORCH[0]) + 14, 170, "#ffd79a", 0.75 * porchFl, { t, width: 26 });
    K.reflectStreak(g, (DOOR.x0 + DOOR.x1) / 2, gY(150) + 10, 90, "#ffb870", 0.35, { t: t + 2, width: 30 });
    if (open > 0.02) K.reflectStreak(g, (fx0 + fx1) / 2 + 10, fb1 + 8, 60, "#ffb870", 0.5 * open, { t: t + 4, width: 22 });
    // Biscuit, lit by the porch lamp, getting wet; contact shadow and his reflection in the flags
    if (t > 27.95) {
      const c = catFlapPos(t);
      // quantised for the cat cache: 12 poses per stride, 10 fps for the slow channels
      const opts = {
        pose: c.pose, phase: qn((((c.phase % 1) + 1) % 1), 1 / 12) % 1, facing: 1, headTurn: qn(c.head, 0.05), t: 0, autoBlink: false, wet: qn(wet, 0.2), collar: true, bell: true,
        eyesGlow: qn((c.glow || 0) * 0.8, 0.1), gaze: qn(c.gaze || 0, 0.1), tail: 0.5, tailUp: c.pose === "run" ? 0.55 : 1, ears: qn(c.ears || 0, 0.1),
        tailPose: [[-9, -11], [-4, -17], [1, -17], [5, -11], [3, -5]], tailPoseK: c.pose === "run" ? 0 : 0.75,
        key: { x: PORCH[0], y: PORCH[1], color: "#ffd79a", strength: qn(0.95 * K.clamp(1.4 - Math.abs(c.x - PORCH[0]) / 900), 0.25) },
        rim: { x: 900, y: 120, color: "#8ea4d8", strength: 0.7 }, fill: "#0e1424", ambient: "#222c46", ambientK: 0.38,
        pupil: qn(1 - (c.glow || 0) * 0.4, 0.1), breath: 1, castShadow: 0.6, ground: "#06080c", shadow: false,
      };
      // kit proportions read leggy at this angle: a real tabby is low and heavy - a little shorter in the
      // leg and deeper in the body (squash about the ground point)
      const stocky = (gg, x, y, size, o, key) => {
        gg.save();
        gg.translate(x, y); gg.scale(1.06, 0.84); gg.translate(-x, -y);
        catCached(gg, x, y, size * 1.06, o, key, 0.08, o.flat ? null : wetPost(o.wet, 0.55));
        gg.restore();
      };
      const clipThrough = (fn) => {
        g.save();
        if (t < 29.85) {
          // still half inside: only the part through the opening, or already past the wall plane, shows
          const cl = new Path2D(opening);
          cl.rect(fx1 - 1, -200, W + 400, H + 400);
          g.clip(cl);
        }
        fn();
        g.restore();
      };
      if (t > 29.0) {
        g.save();
        g.translate(0, c.y * 2 + 3);
        g.scale(1, -1);
        // a wet-stone reflection is darker than the cat (fresnel at this angle ~ 10%)
        g.globalAlpha = 0.16 * K.seg(t, 29.0, 29.6);
        stocky(g, c.x, c.y, c.size, Object.assign({}, opts, { shadow: false, castShadow: 0, lod: 0, flat: true, coat: dimCoat(0.72, "#06080e") }), "f00-flaprefl");
        g.restore();
      }
      K.shadowBlob(g, c.x, c.y + 1, c.size * 0.55, c.size * 0.07, { alpha: 0.75 });
      const blur = c.speed ? K.clamp(c.speed * 1.4) : 0;
      if (blur > 0.05) {
        // a fast move smears on a 1/48 s shutter: two faint trailing exposures behind him
        g.save();
        g.globalAlpha = 0.22 * blur;
        stocky(g, c.x - 10 * blur, c.y + 3 * blur, c.size, Object.assign({}, opts, { castShadow: 0, flat: true, lod: 0 }), "f00-flapblur");
        g.restore();
      }
      clipThrough(() => stocky(g, c.x, c.y, c.size, opts, "f00-flapcat"));
    }
    // the swinging flap panel (hinged at its top edge; + swings out toward us, - back inside):
    // smoked translucent plastic catching the porch light along its edge
    const hgt0 = fb0 - ft0, hgt1 = fb1 - ft1;
    const out = Math.sin(th), down = Math.cos(th);
    const bx0 = fx0 + out * hgt0 * 0.95, by0 = ft0 + down * hgt0 + Math.abs(out) * hgt0 * 0.12;
    const bx1 = fx1 + out * hgt1 * 0.95, by1 = ft1 + down * hgt1 + Math.abs(out) * hgt1 * 0.12;
    // smoked translucent plastic: what is behind shows through (the dark gap, or the kitchen once it
    // swings); a sheen of the porch light slides over it as it tilts, and its cut edge glows
    const panel = new Path2D();
    panel.moveTo(fx0, ft0); panel.lineTo(fx1, ft1); panel.lineTo(bx1, by1); panel.lineTo(bx0, by0); panel.closePath();
    g.fillStyle = th < 0 ? "rgba(26,22,20,0.5)" : "rgba(34,30,28,0.55)";
    g.fill(panel);
    g.save();
    g.clip(panel);
    const tilt = K.clamp(out * 1.4 + 0.3);
    const sh = g.createLinearGradient(fx0, ft0, fx1, Math.max(by0, by1));
    sh.addColorStop(0, "rgba(255,215,160,0)");
    sh.addColorStop(K.clamp(0.25 + 0.4 * tilt), `rgba(255,215,160,${0.1 + 0.25 * tilt})`);
    sh.addColorStop(1, "rgba(255,215,160,0)");
    g.globalCompositeOperation = "lighter";
    g.fillStyle = sh;
    g.fill(panel);
    g.restore();
    g.save();
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = `rgba(255,205,150,${0.25 + 0.35 * tilt})`;
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(bx0, by0); g.lineTo(bx1, by1); g.stroke();
    g.strokeStyle = "rgba(255,230,200,0.12)";
    g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(fx0, ft0 + 1); g.lineTo(fx1, ft1 + 1); g.stroke();
    g.restore();
    // rain: a cold mist everywhere, bright streaks only where the porch light catches them
    const RL = {
      lights: [{ x: PORCH[0], y: PORCH[1] + 4, r: 300, color: "#ffd79a", k: 1.5 * porchFl, src: true }, { x: (DOOR.x0 + DOOR.x1) / 2, y: gY(150) - 40, r: 180, color: "#ffb870", k: 0.5 }],
      amb: 0.04 + 0.5 * fl, ambColor: "#9aa6c4",
    };
    rain3(g, t, Object.assign({ angle: 0.22, seed: 31, density: 1.0 }, RL));
    splash3(g, t, Object.assign({ x0: 60, x1: 700, y0: VP[1] + 60, y1: 560, n: 90, seed: 8 }, RL));
    fogBand(g, VP[1] + 10, 60, "#1c1e24", 0.3, t, 9, 5);
  });
}

// ---- shot 5: the chase down the garden, the portal opens -----------------------------------------------
// One garden layout shared with shot 7: the house's back corner at the left edge, a hedge down each
// side, old oaks at varied distances, the back fence across the far end and the two standing stones.
// A pinhole camera at shoulder height (CH5 m), focal F5 px: the ground plane, the stepping stones and
// the stones all project through proj(), so scale and perspective agree.
const F5 = 600, HZ5 = 214, CH5 = 1.2;
const proj = (X, Z) => [480 + (X * F5) / Z, HZ5 + (CH5 * F5) / Z, F5 / Z];
const OAKS = [[-6.5, 15, 7.5, 3], [5.6, 13, 6.5, 6], [-4.4, 9.5, 5.2, 8], [7.5, 8, 7.8, 11], [-9, 7, 8, 13]];
const RUN = 2.6; // m/s, your running speed
function portalOpen(t) { return t < 39 ? 0 : t < 43.6 ? K.ease.back(K.seg(t, 39, 40.2)) : 1 - K.ease.in(K.seg(t, 43.6, 44)); }
// static (camera-fixed) parts of the garden, baked once: fence, trees, hedges, the house corner
function gardenSet(g, zFence, view) {
  const spr = K.sprite("f00-garden6:" + view, W + 240, H + 200, (s) => {
    s.translate(120, 100);
    gardenPaint(s, zFence, view);
  });
  g.drawImage(spr, -120, -100, W + 240, H + 200);
}
function gardenPaint(g, zFence, view) {
  // back fence + the neighbours' dark trees beyond it
  const [fxL, fy, fs] = proj(-9, zFence), [fxR] = proj(9, zFence);
  treeSil(g, 300, fy - 2, 0.55, 0, { seed: 33, color: "#06080c", sway: 0 });
  treeSil(g, 700, fy - 4, 0.65, 0, { seed: 34, color: "#06080c", sway: 0 });
  K.fence(g, fxL, fxR, fy, 1.2 * fs, { night: true, color: "#3a4048" });
  K.aoEdge(g, fxL, fy, fxR, fy, { width: 8, alpha: 0.5, side: -1 });
  // oaks, far to near (lit-leaf oaks washed down to night silhouettes that keep their canopy modelling)
  tinted(g, "f00-oaks2", (c) => {
    for (const [X, Z, hm, seed] of OAKS) {
      if (Z > zFence + 2) continue;
      const [x, y, s] = proj(X, Z);
      if (x < -400 || x > W + 400) continue;
      K.tree(c, x, y, (hm * s) / 300, { seed, leaf: "#2a4a30", trunk: "#1a1a16", t: 0, kind: "oak", sway: 0 });
    }
  }, "#06090b", 0.84);
  // the clipped side hedges: one ragged foliage mass each, running from the fence toward us
  for (const [X, hgt, seed] of [[-3.3, 1.1, 5], [3.6, 1.0, 7]]) {
    const zs = [];
    for (let z = zFence - 0.3; z >= 2.0; z -= 0.25) zs.push(z);
    const top = [], foot = [];
    for (const z of zs) {
      const [x, y, s] = proj(X, z);
      top.push(x, y - (hgt + 0.08 * K.noise(z * 2.3, seed)) * s);
      foot.push([x, y]);
    }
    const p = new Path2D();
    p.moveTo(foot[0][0], foot[0][1]);
    for (let i = 0; i < top.length / 2; i++) p.lineTo(top[i * 2], top[i * 2 + 1]);
    for (let i = foot.length - 1; i >= 0; i--) p.lineTo(foot[i][0], foot[i][1] + 2);
    p.closePath();
    g.fillStyle = "#070b08";
    g.fill(p);
    K.texFill(g, "foliage", p, { scale: 70, tex: { seed, color: "#2a4424" }, alpha: 0.9, tint: "#2a3430", tintAlpha: 0.7 });
    g.save();
    g.clip(p);
    // the inner face (toward the lawn) catches a little sky; the foot sinks into shadow
    const [xn] = proj(X, 2.0), [xf] = proj(X, zFence);
    const gr = g.createLinearGradient(xf, 0, xn, 0);
    gr.addColorStop(0, "rgba(0,0,0,0.65)");
    gr.addColorStop(1, "rgba(0,0,0,0.15)");
    g.fillStyle = gr;
    g.fill(p);
    g.restore();
  }
  if (view === "chase") {
    // the house's back corner, close at the left edge: weatherboard, a lit kitchen window
    const [x1, y1, s1] = proj(-2.6, 4.2);
    const top = (x) => K.lerp(-80, HZ5 + (CH5 - 3.2) * s1, (x + 80) / (x1 + 80));
    const bot = (x) => K.lerp(H + 80, y1, (x + 80) / (x1 + 80));
    paintPersp(g, "siding", -80, x1, top, bot, { vpx: 480, uK: 900, rows: 10, tex: { seed: 3, color: "#8c98a8", rows: 6 }, tint: "#3a4250", tintAlpha: 0.75 });
    const [wx, wy] = proj(-2.6, 3.4), wy2 = HZ5 + (CH5 - 2.0) * (F5 / 3.4);
    g.fillStyle = "#e0a060";
    g.fillRect(wx - 34, wy2, 30, wy - wy2 - 60);
    g.fillStyle = "rgba(255,240,210,0.6)";
    g.fillRect(wx - 30, wy2 + 6, 22, (wy - wy2 - 60) * 0.5);
    K.aoEdge(g, -80, H + 80, x1, y1, { width: 30, alpha: 0.6, side: 0 });
  }
}
// a flat stepping stone set into the lawn: textured granite, a wet sheen toward the sky, AO round it
function steppingStone(g, x, y, s, k, warm) {
  const rx = 0.31 * s, ry = 0.065 * s;
  if (rx < 1) return;
  K.shadowBlob(g, x, y + ry * 0.2, rx * 1.05, ry * 1.1, { alpha: 0.6 });
  // an irregular worn slab, not a disc
  const p = new Path2D();
  const pts = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * K.TAU, r = 1 + 0.18 * (K.hash(i, k * 3 + 1) - 0.5);
    pts.push(x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r);
  }
  K.spline(p, pts, true, 0.7);
  K.texFill(g, "granite", p, { scale: Math.max(30, rx * 1.6), _x: x - rx, _y: y - ry, tex: { seed: 4 + (k % 3), color: "#6a6c70", lichen: 0.3 }, tint: K.mix("#1e2024", "#4a3a26", warm), tintAlpha: 0.9 });
  // wet top: the far half mirrors the sky
  g.save();
  g.clip(p);
  const gr = g.createLinearGradient(0, y - ry, 0, y + ry);
  gr.addColorStop(0, "rgba(150,165,190,0.08)");
  gr.addColorStop(0.5, "rgba(150,165,190,0.0)");
  gr.addColorStop(1, "rgba(0,0,0,0.25)");
  g.fillStyle = gr;
  g.fill(p);
  g.restore();
}
// the two standing stones of the chase, baked: dim moonlit, and lit hot from the ring between them
function chaseStone(i, portal) {
  const side = i ? -1 : 1;
  return portal
    ? stoneSpr(i ? 5 : 3, 72, 180, { L: [side, -0.15, 0.35], key: [255, 196, 120], keyK: 1.5, amb: [70, 84, 110], ambK: 0.35, wet: 1, specK: 1.1 })
    : stoneSpr(i ? 5 : 3, 72, 180, { L: [-0.3, -0.85, 0.45], key: [140, 160, 200], keyK: 0.55, amb: [70, 84, 110], ambK: 0.45, wet: 1 });
}
const KID5 = { X: -0.72, Z: 2.6, H: 1.35 };
function shotChase(g, t, p) {
  const hit = Math.exp(-Math.max(0, t - 39) * 5) * (t >= 39 ? 1 : 0) + Math.exp(-Math.max(0, t - 44) * 5) * (t >= 44 ? 1 : 0);
  const bob = Math.abs(Math.sin(t * 9.4)) * 6;
  const zStone = K.lerp(7.2, 5.8, K.ease.inOut(p));
  const po = portalOpen(t);
  const [sx, sy, ss] = proj(0.55, zStone);
  const pr = 0.62 * ss * po;
  const pyc = sy - 0.95 * ss;
  const fl = K.flash(t, [37.2], 0.09) * 0.7;
  const cam = { x: 480 + Math.sin(t * 0.7) * 6, y: 270 - bob * 0.3, zoom: 1.04, shakeT: t * 1.6, shakeAmt: 2 + hit * 6 };
  // you: over your right shoulder, running; the torch in your right hand
  const [kx, ky0, ks] = proj(KID5.X, KID5.Z);
  const ky = ky0 + bob * 0.4;
  const kh = KID5.H * ks, ku = kh / 100;
  const hx = kx + 19 * ku, hy = ky - 49 * ku;
  // the beam: aimed down the lawn ahead, swinging with your stride, lagging behind the cat
  const zA = 4.5 + 0.25 * Math.sin(t * 1.1), XA = 0.85 + 0.08 * Math.sin(t * 0.9) - 0.3 * K.seg(t, 35, 41);
  const [ax, ay] = proj(XA, zA);
  const bAng = Math.atan2(ay - hy, ax - hx) + Math.sin(t * 4.7) * 0.02;
  const bLen = Math.hypot(ax - hx, ay - hy) * 1.45;
  const cone = { x: hx, y: hy, ang: bAng, len: bLen, spread: 0.46, color: "#fff0d0", k: 1.3 };
  const pool = { x: ax, y: ay, r: 210, color: "#fff0d0", k: 1.5, flat: 0.42 };
  const portalL = po > 0 ? [{ x: sx, y: pyc, r: 900 * po, color: "#ffcf7a", k: 1.25 * po }, { x: sx, y: sy, r: 560 * po, color: "#ffd890", k: 1.2 * po, flat: 0.28 }] : [];
  K.withCamera(g, W, H, cam, () => {
    drawDeck(g, -80, -70, W + 160, HZ5 + 100, 43, fl, t - 35, 5, 0.6);
    ridge(g, { y: HZ5 + 6, amp: 26, color: "#0a0d12", seed: 2, bottom: HZ5 + 40 });
    // the lawn in true perspective, scrolling under us as we run (0.6 m turf tiles)
    K.groundPlane(g, W, H + 60, { tex: "turf", texOpts: { seed: 6 }, horizon: HZ5, focal: F5, scale: 163, camZ: -(t * RUN) / 0.6, x0: -80, x1: W + 80, wet: 0.65, puddles: 0.3, sky: "#30343e", fog: "#101418", fogAmt: 0.8, tint: "#4a5a48", tintAlpha: 0.5, strips: 30 });
    gardenSet(g, 15.5, "chase");
    for (let k = 0; k < 9; k++) {
      const z = 1.6 + ((k * 1.25 - t * RUN) % 11.25 + 11.25) % 11.25;
      if (z > zStone - 0.3) continue;
      const [x, y, s] = proj(0.18 + Math.sin(k * 1.7) * 0.05, z);
      steppingStone(g, x, y, s, k, po * K.clamp(1.4 - (zStone - z) / 4));
    }
    for (let k = 7; k >= 0; k--) {
      const z = 1.4 + ((k * 1.1 - t * RUN) % 8.8 + 8.8) % 8.8;
      if (z > zStone) continue;
      const [, y, s] = proj(0, z);
      // baked grass rows (one strip per row, scaled to its depth; the wind is a small skew)
      const hgt = 0.22 * s, strip = K.sprite("f00-grow:" + k, W + 120, 64, (c) => K.grass(c, 0, W + 120, 60, { seed: 10 + k, color: "#2a4228", height: 40, t: 0, wind: 1, density: 0.32 }));
      const sk = 0.12 * Math.sin(t * 1.4 + k);
      g.save();
      g.beginPath(); g.rect(-80, y - hgt * 1.6, 480 - 0.7 * s + 80, hgt * 1.7); g.rect(480 + 1.2 * s, y - hgt * 1.6, W + 80, hgt * 1.7); g.clip();
      g.transform(1, 0, sk, 1, -sk * y, 0);
      g.drawImage(strip, -60, y - 60 * hgt / 40, W + 120, 64 * hgt / 40);
      g.restore();
    }
    // the stones: granite, wet; the ring's light on their inner faces as it opens
    const [ax2, ay2, as2] = proj(-0.4, zStone), [bx2, by2, bs2] = proj(1.5, zStone);
    for (const [i, x, y, s, wk, hk] of [[0, ax2, ay2, as2, 0.62, 1.6], [1, bx2, by2, bs2, 0.58, 1.45]]) {
      const w = wk * s, h = hk * s;
      K.shadowBlob(g, x, y, w * 0.8, w * 0.12, { alpha: 0.7 });
      g.drawImage(chaseStone(i, false), x - w / 2, y - h, w, h);
      if (po > 0.01) { g.save(); g.globalAlpha = Math.min(1, po); g.drawImage(chaseStone(i, true), x - w / 2, y - h, w, h); g.restore(); }
    }
    // Biscuit racing ahead: painted BEFORE the light map, so he is only as lit as the light that
    // reaches him (orange-white in the beam, near black when he outruns it, gold in the ring's light)
    let catDraw = null;
    if (t < 43.25) {
      const u = K.seg(t, 35, 42.5);
      const z = K.lerp(3.5, zStone - 0.45, K.ease.inOut(u));
      const [cx, cy, cs] = proj(K.lerp(0.85, 0.5, u), z);
      const leap = K.seg(t, 42.5, 43.2);
      const le = K.ease.inOut(leap);
      const size = 0.27 * cs * (1 - le * 0.3);
      const lx = K.lerp(cx, sx, le), ly = K.lerp(cy, pyc + size * 0.55, le) - Math.sin(leap * Math.PI) * cs * 0.2;
      const ph = t * 3.3;
      lumAt({ cones: [cone], lights: [pool] }, cx, cy - size * 0.6, LUM);
      const beamI = K.clamp(LUM[0]);
      const bq = qn(beamI, 0.34);
      const keyBeam = { x: hx, y: hy, color: "#fff0d0", strength: 0.4 + 1.2 * bq };
      // quantised for the cat cache: 12 poses per stride (the gallop is all in the phase)
      const phq = qn(((ph % 1) + 1) % 1, 1 / 12) % 1;
      const opts = {
        pose: leap > 0 ? "pounce" : "run", phase: leap > 0 ? qn(0.55 + leap * 0.45, 1 / 16) : phq, facing: 1, headTurn: leap > 0 ? 0 : -0.15, headTilt: qn(0.05 * Math.sin(phq * K.TAU), 0.01), t: 0,
        wet: 0.75, bell: true, collar: true, tail: qn(0.35 + 0.25 * Math.sin(phq * K.TAU - 1.4), 0.05), tailUp: 0.15,
        key: po > 0.3 ? { x: sx, y: pyc, color: "#ffcf7a", strength: 1.6 * qn(po, 0.25) } : keyBeam,
        rim: po > 0.3 ? { x: sx, y: pyc - 40, color: "#ffe2a8", strength: 1.4 * qn(po, 0.25) } : { x: hx - 60, y: hy - 80, color: "#ffe8c8", strength: 0.5 + 1.3 * bq },
        backlit: qn(0.4 * po, 0.1), fill: "#0c111c", ambient: "#1c2438", ambientK: 0.35, pupil: 1, shadow: false, castShadow: po > 0.3 ? 0.8 : 0, ground: "#05070a",
      };
      catDraw = { lx, ly, size, opts, leap, cx, cy, cs, ph };
      if (leap < 0.3) K.shadowBlob(g, cx, cy + 1, size * 0.8, size * 0.1, { alpha: 0.65 * (1 - leap * 3) });
      g.save();
      if (leap > 0) { g.translate(lx, ly - size * 0.6); g.rotate(-0.35 * Math.sin(leap * Math.PI)); g.translate(-lx, -(ly - size * 0.6)); }
      else {
        // rotary gallop: the body pitches over the stride, a little extra rise in the flight phase
        const pitch = 0.05 * Math.sin(ph * K.TAU + 0.6);
        g.translate(lx, ly - size * 0.5); g.rotate(pitch); g.translate(-lx, -(ly - size * 0.5));
      }
      catCached(g, lx, ly, size, opts, "f00-runcat", 0.22, wetPost(0.75, 0.5));
      g.restore();
    }
    // light: the torch's cone and its pool on the wet grass, the kitchen window behind, the ring
    relight(g, K.mix("#262a36", "#9aa8cc", fl), [pool, { x: 140, y: 420, r: 300, color: "#ffcf8a", k: 0.4, flat: 0.4 }, ...portalL],
      (s) => { s.fillRect(150, -80, W + 160, Math.min(ay2 - 1.6 * as2, by2 - 1.45 * bs2) - 6 + 80); }, null, [cone]);
    // the beam itself in the rain-filled air, and the hot pool where it lands
    K.flashlightBeam(g, hx, hy, bAng, bLen, { spread: 0.46, alpha: 0.1, t, dust: 24 });
    K.lightPool(g, ax, ay, 120, "#fff0d0", { flat: 0.38, intensity: 0.35 });
    // splash kicks at his footfalls, only seen where light reaches them
    if (catDraw && catDraw.leap <= 0) {
      const { cx, cy, size, ph } = catDraw;
      const kick = new Path2D();
      lumAt({ cones: [cone], lights: [pool, ...portalL] }, cx, cy, LUM);
      const I = K.clamp(LUM[0]);
      for (let n = Math.floor(ph) - 2; n <= Math.floor(ph); n++) {
        for (const [off, fx] of [[0.05, 0.5], [0.55, -0.45]]) {
          const age = (ph - (n + off)) / 3.3;
          if (age < 0 || age > 0.3) continue;
          const q = age / 0.3, x0 = cx + fx * size, r = (1 + q * 5) * size / 40;
          for (let d = 0; d < 5; d++) {
            const a = -Math.PI / 2 + (d - 2) * 0.5;
            kick.rect(x0 + Math.cos(a) * 9 * q * size / 40, cy + (Math.sin(a) * 9 * q + 14 * q * q) * size / 40, 1, 1);
          }
          kick.moveTo(x0 + r, cy); kick.ellipse(x0, cy, r, r * 0.3, 0, 0, K.TAU);
        }
      }
      if (I > 0.05) {
        g.save(); g.globalCompositeOperation = "lighter";
        g.strokeStyle = g.fillStyle = "#fff0d8"; g.globalAlpha = 0.6 * I; g.lineWidth = 0.6;
        g.fill(kick); g.stroke(kick);
        g.restore();
      }
    }
    if (po > 0) {
      drawPortal(g, sx, pyc, pr, t, 1.2 * Math.min(1, po + 0.2), 0.12, 1);
      const spts = [];
      for (let i = 0; i < 9; i++) {
        const a = i * 0.8 - t * 0.6, r = pr * (1.9 - i * 0.17);
        spts.push({ x: sx + Math.cos(a) * r, y: sy + 2 + Math.sin(a) * r * 0.16, a: a + Math.PI / 2, s: 0.06 * ss, alpha: po * K.clamp(1.1 - i / 10) });
      }
      K.pawprints(g, spts, 1);
    }
    // rain: invisible in the dark; bright in the torch cone, gold round the ring
    const RL = { lights: [pool, ...portalL.map((l, i) => (i ? l : Object.assign({}, l, { r: 320 * po, k: 1.6 * po, src: true })))], cones: [cone], amb: 0.02 + 0.5 * fl, ambColor: "#9aa6c4" };
    rain3(g, t, Object.assign({ angle: 0.18, seed: 51, density: 1.0 }, RL));
    splash3(g, t, Object.assign({ x0: -40, x1: W + 40, y0: HZ5 + 60, y1: H, n: 110, seed: 12 }, RL));
    // the collapse (44 s): the ring implodes and releases everything at once - a white-hot core at the
    // portal point that blooms outward far past what the film can hold; you stand black against it
    const wo = K.smooth(K.seg(t, 43.82, 44.05)) * (1 - K.smooth(K.seg(t, 44.5, 45.5)));
    if (wo > 0.001) {
      const R = 60 + 1500 * K.smooth(K.seg(t, 43.82, 44.6));
      g.save();
      g.globalCompositeOperation = "lighter";
      const gr = g.createRadialGradient(sx, pyc, 0, sx, pyc, R);
      gr.addColorStop(0, `rgba(255,255,255,${wo})`);
      gr.addColorStop(0.12, `rgba(255,250,236,${wo})`);
      gr.addColorStop(0.4, `rgba(255,230,190,${0.75 * wo})`);
      gr.addColorStop(0.75, `rgba(255,200,140,${0.3 * wo})`);
      gr.addColorStop(1, "rgba(255,190,120,0)");
      g.fillStyle = gr;
      g.fillRect(-100, -100, W + 200, H + 200);
      g.restore();
    }
    // you, from behind: your back in shadow; the light ahead (torch pool, then the ring) wraps your flank
    K.shadowBlob(g, kx, ky + 1, kh * 0.16, kh * 0.025, { alpha: 0.55 });
    raincoatKid(g, kx, ky, kh, {
      t, run: t < 43.4, phase: t * 1.45, turn: 0.3, wet: 0.8, torchAng: bAng - 0.2, front: 1,
      key: po > 0.05 || wo > 0 ? { x: sx, y: pyc, color: "#ffcf7a", k: Math.min(1.3, 0.9 * po + 0.35 + wo) } : { x: ax, y: ay, color: "#fff0d0", k: 0.75 },
      moon: { color: "#8ea4d8", k: 0.15 + fl }, fill: "#5a6a90", spec: "#8a9cc0", silhouette: K.clamp(wo * 1.6),
    });
  });
  // then the dark: the afterimage dies and the night closes in (45-46 s)
  const dk = K.smooth(K.seg(t, 44.9, 45.9));
  if (dk > 0) K.fadeBlack(g, W, H, dk * 0.97);
}

// ---- shot 6: your hand in the mud, the bell -------------------------------------------------------------
// Looking straight down past your arm at the trodden ground between the stones: mud, flattened wet
// turf, a puddle that mirrors the black sky and the stones above it. The only light is your torch:
// a hard pool with inverse-square falloff; beyond it, nothing.
const PUD = { x: 512, y: 338, rx: 150, ry: 62 };
// the puddle's outline: a trodden depression is never an ellipse - lobes where a boot or a paw went in,
// a bite where the turf holds. r(a) is a periodic sum of sines (so it closes without a seam)
const PUD_H = [[2, 0.07, 1.3], [3, 0.09, 4.1], [4, 0.05, 2.2], [5, 0.045, 0.7], [7, 0.03, 5.3], [9, 0.022, 3.4], [13, 0.014, 1.9]];
const pudR = (a) => { let r = 1; for (const [k, amp, ph] of PUD_H) r += amp * Math.sin(k * a + ph); return r; };
function puddlePts(sc = 1, n = 64) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * K.TAU, r = pudR(a) * sc;
    pts.push(PUD.x + Math.cos(a) * PUD.rx * r, PUD.y + Math.sin(a) * PUD.ry * r);
  }
  return pts;
}
// the water mask: the outline above broken up at the fine scale by fbm (a noise-thresholded edge,
// ragged where grass leans in), with a few mud islands breaking the surface. 0..255 alpha, baked once.
const PUDB = { x: PUD.x - PUD.rx * 1.45, y: PUD.y - PUD.ry * 1.45, w: PUD.rx * 2.9, h: PUD.ry * 2.9 };
function pudMask() {
  return K.texBake("f00-pudmask2", 464, 192, (u, v, out) => {
    const x = PUDB.x + u * PUDB.w, y = PUDB.y + v * PUDB.h;
    const dx = (x - PUD.x) / PUD.rx, dy = (y - PUD.y) / PUD.ry;
    const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const n = K.texFbm(u * 9, v * 4, 57, 4) * 0.09 + K.texNoise(u * 40, v * 18, 58) * 0.025;
    const edge = pudR(a) + n;
    let m = sm01(edge + 0.012, edge - 0.03, d);
    // islands: lumps of mud and a turf tussock standing proud of the water
    const isl = K.texFbm(u * 5 + 7, v * 2.5 + 3, 59, 4) + 0.04 * K.texNoise(u * 50, v * 25, 60);
    m *= 1 - sm01(0.36, 0.42, isl) * sm01(0.25, 0.6, d);
    out[0] = out[1] = out[2] = 255; out[3] = m * 255;
  });
}
// the water itself, baked: the black sky mirrored, the cloud deck's underside and the two stones upside
// down in it, a Fresnel ramp (a still surface seen at a grazing angle toward its far edge reflects far
// more), all cut by the noise mask
function waterPlate() {
  return K.sprite("f00-water2", PUDB.w, PUDB.h, (s) => {
    s.translate(-PUDB.x, -PUDB.y);
    const wg = s.createLinearGradient(0, PUD.y - PUD.ry * 1.25, 0, PUD.y + PUD.ry * 1.25);
    wg.addColorStop(0, "#2a3448"); wg.addColorStop(0.3, "#141a26"); wg.addColorStop(0.6, "#090c12"); wg.addColorStop(1, "#050608");
    s.fillStyle = wg;
    s.fillRect(PUDB.x, PUDB.y, PUDB.w, PUDB.h);
    s.save();
    s.globalCompositeOperation = "screen";
    s.globalAlpha = 0.55;
    s.drawImage(stormDeck(43, false), PUD.x - PUD.rx * 1.3, PUD.y - PUD.ry * 1.3, PUD.rx * 2.6, PUD.ry * 1.8);
    s.restore();
    // the stones above, upside down
    s.save();
    s.translate(0, PUD.y - PUD.ry * 0.95);
    s.scale(1, -0.55);
    rimStone(s, PUD.x - 170, 0, 160, 210, { seed: 3, color: "#050709", rim: "#8090a8", rimA: 0.12, dx: 6, dy: 0 });
    rimStone(s, PUD.x + 175, 0, 150, 200, { seed: 5, color: "#050709", rim: "#8090a8", rimA: 0.1, dx: -6, dy: 0 });
    s.restore();
    // Fresnel: the far third of the surface reflects most
    const fr = s.createLinearGradient(0, PUD.y - PUD.ry * 1.2, 0, PUD.y + PUD.ry * 0.4);
    fr.addColorStop(0, "rgba(120,136,168,0.32)"); fr.addColorStop(0.45, "rgba(60,70,92,0.1)"); fr.addColorStop(1, "rgba(0,0,0,0)");
    s.fillStyle = fr;
    s.fillRect(PUDB.x, PUDB.y, PUDB.w, PUDB.h);
    s.globalCompositeOperation = "destination-in";
    s.drawImage(pudMask(), PUDB.x, PUDB.y, PUDB.w, PUDB.h);
    s.globalCompositeOperation = "source-over";
    // grass blades and stalks breaking the surface near the margin (each with a short dark reflection)
    const R = K.rng("f00-pudgrass");
    s.lineCap = "round";
    for (let i = 0; i < 34; i++) {
      const a = R() * K.TAU, rr = pudR(a) * (i % 4 === 0 ? 0.3 + R() * 0.5 : 0.84 + R() * 0.2);
      const x = PUD.x + Math.cos(a) * PUD.rx * rr, y = PUD.y + Math.sin(a) * PUD.ry * rr;
      const n = 1 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        const hgt = 4 + R() * 10, lean = (R() - 0.5) * 0.9 + Math.cos(a) * 0.3, bx = x + (R() - 0.5) * 5;
        const tx = bx + Math.sin(lean) * hgt, ty = y - Math.cos(lean) * hgt;
        s.strokeStyle = "rgba(4,6,4,0.45)"; s.lineWidth = 1.2;
        s.beginPath(); s.moveTo(bx, y); s.quadraticCurveTo(bx + (tx - bx) * 0.3, y + hgt * 0.4, tx, y + hgt * 0.7); s.stroke();
        s.strokeStyle = K.mix("#2e3420", "#5a6040", R()); s.lineWidth = 0.7 + R() * 0.5;
        s.beginPath(); s.moveTo(bx, y + 0.5); s.quadraticCurveTo(bx + (tx - bx) * 0.3, y - hgt * 0.5, tx, ty); s.stroke();
      }
    }
    // mud lumps standing in the water: wet tops catch the light, a dark waterline round each
    for (let i = 0; i < 9; i++) {
      const a = R() * K.TAU, rr = pudR(a) * (0.35 + R() * 0.5);
      const x = PUD.x + Math.cos(a) * PUD.rx * rr, y = PUD.y + Math.sin(a) * PUD.ry * rr, w = 5 + R() * 10;
      K.shadowBlob(s, x, y + 1, w * 1.2, w * 0.35, { alpha: 0.6, color: "#020203" });
      const mp = new Path2D(); mp.ellipse(x, y - w * 0.12, w, w * 0.32, (R() - 0.5) * 0.4, 0, K.TAU);
      K.texFill(s, "mud", mp, { scale: 60, tex: { seed: 5, wet: 1 }, tint: "#3a2a1a", tintAlpha: 0.5 });
      s.fillStyle = "rgba(200,190,170,0.18)";
      s.beginPath(); s.ellipse(x - w * 0.2, y - w * 0.25, w * 0.5, w * 0.09, 0, 0, K.TAU); s.fill();
    }
  });
}
let PUDP = null;
function mudGround() {
  return K.sprite("f00-mud4", W + 40, H + 40, (s) => {
    s.translate(20, 20);
    // flattened wet turf all over, then a trodden patch of mud round the puddle
    K.texRect(s, "turf", -20, -20, W + 40, H + 40, { scale: 150, tex: { seed: 8 }, tint: "#7a8a70", tintAlpha: 0.5 });
    K.texRect(s, "macro", -20, -20, W + 40, H + 40, { scale: 700, tex: { seed: 3 }, mode: "soft-light", alpha: 0.7 });
    const mp = new Path2D();
    K.spline(mp, puddlePts(1.9, 24), true, 0.9);
    // mud: drawn into its own soft-edged mask so it bleeds into the grass
    const mc = K.sprite("f00-mudpatch2", W + 40, H + 40, (m) => {
      m.translate(20, 20);
      K.texFill(m, "mud", mp, { scale: 180, tex: { seed: 5, wet: 0.9 } });
    });
    s.save();
    if (K.hasFilter()) s.filter = "blur(6px)";
    s.drawImage(mc, -20, -20, W + 40, H + 40);
    s.restore();
    // the water's wet margin: dark saturated mud a little wider than the puddle
    const wm = new Path2D();
    K.spline(wm, puddlePts(1.12), true, 0.9);
    s.save();
    if (K.hasFilter()) s.filter = "blur(5px)";
    s.fillStyle = "rgba(14,10,6,0.75)";
    s.fill(wm);
    s.restore();
    // the standing stones' feet at the top of the frame: granite, wet, moss at the base
    for (const [x, y, rx, ry, seed] of [[140, 40, 210, 120, 3], [850, 30, 190, 110, 5]]) {
      const p = new Path2D();
      const pts = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * K.TAU, r = 1 + 0.12 * K.noise(i * 1.3, seed);
        pts.push(x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r);
      }
      K.spline(p, pts, true, 0.8);
      K.shadowBlob(s, x, y + ry * 0.7, rx * 1.05, ry * 0.5, { alpha: 0.8 });
      K.texFill(s, "granite", p, { scale: 220, tex: { seed, color: "#6a6e72", lichen: 0.7 }, tint: "#707880", tintAlpha: 0.6 });
      s.save();
      s.clip(p);
      const gr = s.createRadialGradient(x, y - ry * 0.4, rx * 0.2, x, y, rx * 1.1);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, "rgba(0,0,0,0.6)");
      s.fillStyle = gr;
      s.fill(p);
      s.restore();
    }
  });
}
function puddlePath() {
  const p = new Path2D();
  K.spline(p, puddlePts(1), true, 0.9);
  return p;
}
const BELL = { x: 500, y: 318, size: 60 };
// the brass jingle bell close up, lying tilted in the mud: a polished sphere (sky above, dark mud
// below in its reflection), a raised seam round its equator, the sound slot seen edge-on and
// mostly turned away from us, the loop on top, and a hard torch specular.
// the puddle is a hoof-and-paw trodden depression: its far inner wall catches the sky, the near one is
// in shadow, a dark damp halo with ragged edges soaks out into the grass, and the water mirrors the
// cloud deck (fresnel: brighter toward the far edge). Baked once over the mud plate.
function mudDepression() {
  return K.sprite("f00-muddep2", W + 40, H + 40, (s) => {
    s.translate(20, 20);
    const tex = K.texBake("f00-dampmask", 256, 160, (u, v, out) => {
      const dx = (u - 0.5) / 0.5, dy = (v - 0.5) / 0.5;
      const d = Math.hypot(dx, dy) + 0.28 * K.texFbm(u * 6, v * 6, 77, 4, 6, 6) + 0.1 * K.texNoise(u * 30, v * 30, 78, 30, 30);
      const a = sm01(1.0, 0.55, d);
      out[0] = 8; out[1] = 6; out[2] = 4; out[3] = a * 150;
    });
    s.drawImage(tex, PUD.x - PUD.rx * 2.9, PUD.y - PUD.ry * 2.9, PUD.rx * 5.8, PUD.ry * 5.8);
    // the depression's walls
    const wp = new Path2D();
    K.spline(wp, puddlePts(1.35), true, 0.9);
    s.save();
    s.clip(wp);
    const wg = s.createLinearGradient(0, PUD.y - PUD.ry * 1.4, 0, PUD.y + PUD.ry * 1.4);
    wg.addColorStop(0, "rgba(120,130,150,0.16)");
    wg.addColorStop(0.35, "rgba(0,0,0,0)");
    wg.addColorStop(0.75, "rgba(0,0,0,0.35)");
    wg.addColorStop(1, "rgba(0,0,0,0.55)");
    s.fillStyle = wg;
    s.fill(wp);
    s.restore();
    // the water (sky, stones, Fresnel, blades and lumps breaking the surface), cut by its noise mask
    s.drawImage(waterPlate(), PUDB.x, PUDB.y, PUDB.w, PUDB.h);
    // a thin bright meniscus where the far bank meets the water
    s.save();
    s.strokeStyle = "rgba(170,180,200,0.18)";
    s.lineWidth = 1.2;
    s.beginPath();
    const pts = puddlePts(1.0);
    for (let i = 36; i <= 60; i++) { const x = pts[i * 2], y = pts[i * 2 + 1]; if (i === 36) s.moveTo(x, y); else s.lineTo(x, y); }
    s.stroke();
    s.restore();
  });
}
// the brass bell hanging from its snapped red collar: a pendulum that damps out after the lift
function bellSwing(t) {
  const a = t - 53.9;
  if (a < 0) return 0;
  return 0.55 * Math.exp(-a * 1.3) * Math.sin(a * 6.2 + 0.3);
}
function raindropRings(g, t, lx, ly, seed) {
  const P = new Path2D();
  let any = false;
  for (let i = 0; i < 26; i++) {
    const per = 0.55 + K.hash(i, seed) * 0.4;
    const ph = (t / per + K.hash(i, seed + 1)) % 1;
    const n = Math.floor(t / per + K.hash(i, seed + 1));
    const u = K.hash(i * 7 + n, seed + 2) * 2 - 1, v = K.hash(i * 7 + n, seed + 3) * 2 - 1;
    if (u * u + v * v > 0.8) continue;
    const x = PUD.x + u * PUD.rx, y = PUD.y + v * PUD.ry;
    const near = Math.exp(-Math.hypot(x - lx, (y - ly) * 1.6) / 260);
    if (near < 0.12) continue;
    const r = 1.5 + ph * 13;
    P.moveTo(x + r, y); P.ellipse(x, y, r, r * 0.34, 0, 0, K.TAU);
    if (ph < 0.5) { const r2 = r * 0.55; P.moveTo(x + r2, y); P.ellipse(x, y, r2, r2 * 0.34, 0, 0, K.TAU); }
    any = true;
  }
  if (!any) return;
  g.save();
  g.clip(PUDP);
  g.globalCompositeOperation = "lighter";
  g.strokeStyle = "rgba(255,240,215,0.1)";
  g.lineWidth = 0.8;
  g.stroke(P);
  g.restore();
}
// fist and bell positions (pure in t): reach 48.4-52, grip 52-53.6, lift 53.8-55
function bellRig(t) {
  const reachU = K.ease.inOut(K.seg(t, 47.6, 50.4)), lift = K.ease.inOut(K.seg(t, 53.8, 55));
  const gx = BELL.x - 61, gy = BELL.y + 1;
  const fx = K.lerp(40, gx, reachU) + lift * 20, fy = K.lerp(H + 100, gy, reachU) - lift * 120;
  const th = bellSwing(t), L = 70;
  const hx = fx + Math.sin(th) * L, hy = fy + Math.cos(th) * L;
  const k = K.smooth(K.seg(t, 53.8, 54.3));
  return { fx, fy, bx: K.lerp(BELL.x, hx, k), by: K.lerp(BELL.y, hy, k), rot: K.lerp(-0.35, th * 0.8, k) };
}
function brassBell(g, x, y, size, rot, t, glint) {
  const r = size / 2;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  // the shank loop
  g.strokeStyle = "#6a4612";
  g.lineWidth = r * 0.16;
  g.beginPath(); g.ellipse(0, -r * 1.02, r * 0.2, r * 0.17, 0, Math.PI * 0.95, Math.PI * 2.05); g.stroke();
  const bg = g.createRadialGradient(-r * 0.38, -r * 0.42, r * 0.04, 0, 0, r);
  bg.addColorStop(0, "#f4dc9c");
  bg.addColorStop(0.18, "#d8aa50");
  bg.addColorStop(0.5, "#9a6c22");
  bg.addColorStop(0.82, "#4a2e0c");
  bg.addColorStop(1, "#201206");
  g.fillStyle = bg;
  g.beginPath(); g.arc(0, 0, r, 0, K.TAU); g.fill();
  g.save();
  g.beginPath(); g.arc(0, 0, r, 0, K.TAU); g.clip();
  // tarnish and scratches (brass that has lived on a cat)
  K.texRect(g, "metal", -r, -r, r * 2, r * 2, { scale: r * 2, tex: { seed: 3 }, mode: "multiply", alpha: 0.35 });
  const eg = g.createLinearGradient(0, -r * 0.1, 0, r);
  eg.addColorStop(0, "rgba(20,14,6,0)");
  eg.addColorStop(0.35, "rgba(20,14,6,0.45)");
  eg.addColorStop(1, "rgba(10,8,4,0.7)");
  g.fillStyle = eg;
  g.fillRect(-r, -r * 0.1, r * 2, r * 1.2);
  g.strokeStyle = "rgba(170,195,235,0.25)";
  g.lineWidth = r * 0.05;
  g.beginPath(); g.ellipse(0, r * 0.05, r * 0.98, r * 0.3, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  g.strokeStyle = "rgba(255,226,150,0.45)";
  g.lineWidth = r * 0.06;
  g.beginPath(); g.ellipse(0, r * 0.12, r * 1.0, r * 0.34, 0, 0.1, Math.PI - 0.1); g.stroke();
  g.strokeStyle = "rgba(40,24,6,0.7)";
  g.lineWidth = r * 0.05;
  g.beginPath(); g.ellipse(0, r * 0.18, r * 1.0, r * 0.34, 0, 0.12, Math.PI - 0.12); g.stroke();
  g.fillStyle = "rgba(14,8,2,0.95)";
  g.beginPath(); g.ellipse(r * 0.42, r * 0.5, r * 0.36, r * 0.06, 0.55, 0, K.TAU); g.fill();
  g.beginPath(); g.ellipse(r * 0.7, r * 0.72, r * 0.09, r * 0.07, 0.5, 0, K.TAU); g.fill();
  // a smear of mud dried on its lower side
  g.fillStyle = "rgba(48,32,18,0.55)";
  g.beginPath(); g.ellipse(-r * 0.3, r * 0.75, r * 0.6, r * 0.3, 0.3, 0, K.TAU); g.fill();
  g.restore();
  g.restore();
  // hard specular from the torch (a light: near white, the lens blooms it)
  g.fillStyle = "rgba(255,255,250,0.95)";
  g.beginPath(); g.ellipse(x - r * 0.36, y - r * 0.42, r * 0.11, r * 0.07, -0.6, 0, K.TAU); g.fill();
  K.glow(g, x - r * 0.36, y - r * 0.42, r * 0.3, "#fff6dc", 0.4);
  if (glint > 0) K.bellGlint(g, x - r * 0.36, y - r * 0.42, r * 0.9, t, { strength: glint });
}
// rings on the water: invisible except where they cross the torch's reflection
function torchRipples(g, t, rx, ry, seed) {
  g.save();
  g.clip(PUDP);
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 12; i++) {
    const per = 0.7 + K.hash(i, seed) * 0.6;
    const tt = t + K.hash(i + 0.3, seed) * per;
    const c = Math.floor(tt / per), ph = tt / per - c;
    const x = PUD.x + (K.hash(i * 7 + c * 3.1, seed) - 0.5) * PUD.rx * 1.8;
    const y = PUD.y + (K.hash(i * 5 + c * 1.7, seed) - 0.5) * PUD.ry * 1.6;
    const near = Math.exp(-(((x - rx) / 120) ** 2 + ((y - ry) / 50) ** 2));
    const a = (1 - ph) * (0.02 + 0.22 * near);
    if (a < 0.01) continue;
    g.strokeStyle = `rgba(255,240,215,${a})`;
    g.lineWidth = 0.9;
    g.beginPath(); g.ellipse(x, y, 2 + ph * 22, (2 + ph * 22) * 0.42, 0, 0, K.TAU); g.stroke();
  }
  g.restore();
}
function shotMud(g, t, p) {
  // the torch sweeps in and settles its hot spot on the bell
  const sweep = K.ease.inOut(K.seg(t, 46, 47.6));
  const lx = K.lerp(250, BELL.x + 6, sweep) + Math.sin(t * 1.3) * 5 * (1 - sweep * 0.6), ly = K.lerp(440, BELL.y - 4, sweep) + Math.cos(t * 1.1) * 4 * (1 - sweep * 0.6);
  const reachU = K.ease.inOut(K.seg(t, 47.6, 50.4));
  const close = K.smooth(K.seg(t, 50.6, 52.2));
  const lift = K.ease.inOut(K.seg(t, 53.8, 55));
  const got = t > 53.4;
  const cam = { x: 480 + K.lerp(0, 16, p), y: 280, zoom: 1.04 + 0.05 * K.ease.inOut(p), shakeT: t, shakeAmt: 1.2 };
  if (!PUDP) PUDP = puddlePath();
  K.withCamera(g, W, H, cam, () => {
    g.drawImage(mudGround(), -20, -20, W + 40, H + 40);
    g.drawImage(mudDepression(), -20, -20, W + 40, H + 40);
    // the torch reflected in the water: a hot smear (it IS the light, so after the light map)
    // the snapped bit of red collar, half sunk at the water's edge
    if (!got) {
      g.save();
      g.lineCap = "round";
      g.strokeStyle = "#240608";
      g.lineWidth = 10;
      g.beginPath(); g.moveTo(BELL.x - 120, BELL.y + 34); g.quadraticCurveTo(BELL.x - 60, BELL.y - 4, BELL.x - 4, BELL.y - 22); g.stroke();
      g.strokeStyle = "#3e0c12";
      g.lineWidth = 6;
      g.beginPath(); g.moveTo(BELL.x - 120, BELL.y + 31); g.quadraticCurveTo(BELL.x - 60, BELL.y - 7, BELL.x - 4, BELL.y - 25); g.stroke();
      g.strokeStyle = "rgba(255,200,190,0.25)";
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(BELL.x - 116, BELL.y + 28); g.quadraticCurveTo(BELL.x - 60, BELL.y - 10, BELL.x - 6, BELL.y - 27); g.stroke();
      g.strokeStyle = "rgba(200,150,140,0.5)";
      for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(BELL.x - 4, BELL.y - 24); g.lineTo(BELL.x + 4 + i * 2, BELL.y - 32 + i * 3); g.stroke(); }
      // mud smeared over the strap where it sinks in
      for (let i = 0; i < 5; i++) K.shadowBlob(g, BELL.x - 120 + i * 9, BELL.y + 32 - i * 7, 10, 5, { alpha: 0.8, color: "#1a1008" });
      K.shadowBlob(g, BELL.x + 6, BELL.y + BELL.size * 0.46, BELL.size * 0.5, BELL.size * 0.1, { alpha: 0.9 });
    }
    // the light map: your torch only; outside its pool the night swallows everything
    relight(g, "#07080c", [
      { x: lx, y: ly, r: 760, color: "#fff2d8", k: 1.45, flat: 0.8 },
      { x: lx, y: ly, r: 180, color: "#fff6e4", k: 0.6, flat: 0.85 },
    ]);
    if (!got || lift < 0.2) {
      // the bell's own reflection under it in the water
      g.save();
      g.beginPath(); g.clip(PUDP);
      g.translate(0, (BELL.y + BELL.size * 0.5) * 2 + 2);
      g.scale(1, -1);
      g.globalAlpha = 0.3;
      if (!got) brassBell(g, BELL.x, BELL.y, BELL.size, -0.35, t, 0);
      g.restore();
    }
    g.save();
    g.beginPath();
    g.clip(PUDP);
    // the torch mirrored in the still water: a small hot core (the lens itself), a soft halo, and a
    // vertical smear broken by the ripples
    g.translate(lx + 26, ly + 40);
    g.globalCompositeOperation = "lighter";
    g.save(); g.scale(1, 0.4); K.glow(g, 0, 0, 80, "#fff3d0", 0.32); g.restore();
    for (let i = -5; i <= 5; i++) {
      const wob = Math.sin(t * 7 + i * 1.7) * 3 * (Math.abs(i) / 5);
      g.fillStyle = `rgba(255,240,215,${0.22 * (1 - Math.abs(i) / 6)})`;
      g.fillRect(-7 + wob - Math.abs(i) * 0.6, i * 5 - 2, 14 + Math.abs(i) * 1.2, 2.4);
    }
    g.save(); g.scale(1, 0.55); K.glow(g, 0, 0, 13, "#ffffff", 0.95); g.restore();
    g.restore();
    torchRipples(g, t, lx + 26, ly + 40, 5);
    if (!got) {
      brassBell(g, BELL.x, BELL.y, BELL.size, -0.35, t, 0.2 + 1.2 * K.env(t, 47.2, 49, 0.1, 1.2));
      // mud and water lapping over its lower edge
      g.fillStyle = "rgba(10,10,12,0.6)";
      g.beginPath(); g.ellipse(BELL.x + 2, BELL.y + BELL.size * 0.44, BELL.size * 0.6, BELL.size * 0.12, 0, 0, K.TAU); g.fill();
      g.strokeStyle = "rgba(255,240,215,0.35)";
      g.lineWidth = 1;
      g.beginPath(); g.ellipse(BELL.x + 2, BELL.y + BELL.size * 0.4, BELL.size * 0.5, BELL.size * 0.1, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    }
    // your gloved hand comes up from the bottom of frame (we see its back), takes the snapped red
    // collar and lifts: the bell swings on it, dripping, its reflection breaking up in the ripples
    if (t > 47.6) {
      const P = bellRig(t);
      const wAng = Math.atan2(P.fy - (H + 60), P.fx + 120);
      const wx = P.fx - Math.cos(wAng) * 112, wy = P.fy - Math.sin(wAng) * 112;
      if (got) {
        // the strap, from the fist to the bell's loop: slack while the bell still rests, then taut
        const sag = 30 * (1 - K.smooth(K.seg(t, 53.8, 54.3)));
        g.save();
        g.lineCap = "round";
        g.strokeStyle = "#2a070a"; g.lineWidth = 7;
        g.beginPath(); g.moveTo(P.fx, P.fy + 8); g.quadraticCurveTo((P.fx + P.bx) / 2 - 12, (P.fy + P.by) / 2 + sag, P.bx, P.by - BELL.size * 0.48); g.stroke();
        g.strokeStyle = "rgba(255,190,170,0.28)"; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(P.fx + 2, P.fy + 8); g.quadraticCurveTo((P.fx + P.bx) / 2 - 10, (P.fy + P.by) / 2 + sag, P.bx + 2, P.by - BELL.size * 0.48); g.stroke();
        g.restore();
        // drips falling from the bell into the water, each leaving a ring where it lands
        const surf = BELL.y + BELL.size * 0.45;
        const RP = new Path2D();
        g.save();
        g.fillStyle = "rgba(255,240,210,0.75)";
        for (let i = 0; i < 9; i++) {
          const t0 = 54.0 + i * 0.26;
          if (t < t0) break;
          const q = bellRig(t0), x0 = q.bx + 2, y0 = q.by + BELL.size * 0.5;
          const a = t - t0, y = y0 + 1100 * a * a;
          if (y < surf) { g.beginPath(); g.ellipse(x0, y, 1.3, 2.6, 0, 0, K.TAU); g.fill(); }
          else {
            const tl = Math.sqrt(Math.max(0, surf - y0) / 1100), age = a - tl;
            if (age < 0.8) { const r = 3 + age * 40; RP.moveTo(x0 + r, surf); RP.ellipse(x0, surf, r, r * 0.3, 0, 0, K.TAU); }
          }
        }
        g.globalCompositeOperation = "lighter";
        g.strokeStyle = "rgba(255,240,215,0.16)"; g.lineWidth = 0.8;
        g.stroke(RP);
        g.restore();
        // the swinging bell, and its reflection rippling in the water under it
        const R = K.layer(120, 150, "f00-bellrefl");
        R.g.translate(60 - P.bx, 75 - P.by);
        brassBell(R.g, P.bx, P.by, BELL.size, P.rot, t, 0.8);
        g.save();
        g.clip(PUDP);
        g.globalAlpha = 0.32;
        const my = surf * 2 - P.by;
        for (let k = 0; k < 150; k += 3) {
          const off = 3 * Math.sin(k * 0.21 - t * 9) * K.clamp(t - 54);
          g.drawImage(R.canvas, 0, (150 - k - 3) * (R.canvas.height / 150), R.canvas.width, 3 * (R.canvas.height / 150), P.bx - 60 + off, my - 75 + k, 120, 3.4);
        }
        g.restore();
        brassBell(g, P.bx, P.by, BELL.size, P.rot, t, 0.8);
      }
      // the hand, in the torch light: painted on its own layer so the light can wrap it - a warm
      // subsurface glow (blood under thin skin) along the edges the beam grazes
      const HL = K.layer(W, H, "f00-hand");
      K.drawHand(HL.g, wx, wy, 118, {
        pose: close > 0.6 ? "hold" : reachU > 0.85 ? "cup" : "reach", angle: wAng, left: false, t, wet: 0.8,
        skin: "#c48a68", sleeve: K.mix(KID_C.coat, "#1a1206", 0.45), grip: close,
        light: { x: lx, y: ly - 80, color: "#fff3d0", strength: 1.45, z: 0.15 }, ambient: "#141018",
      });
      g.drawImage(HL.canvas, 0, 0, W, H);
      const hd = Math.atan2(ly - wy, lx - wx);
      rimPass(g, HL.canvas, 0, 0, W, H, [Math.cos(hd), Math.sin(hd)], 3, "#e86a48", 0.32, false, "f00-handrim");
      rimPass(g, HL.canvas, 0, 0, W, H, [Math.cos(hd), Math.sin(hd)], 1.0, "#ffe6c8", 0.12, false, "f00-handrim");
    }
    // rain falling past the lens into the torch beam: only the lit drops show; rings on the water
    raindropRings(g, t, lx + 26, ly + 40, 61);
    const RL = { lights: [{ x: lx, y: ly - 40, r: 330, color: "#fff2d8", k: 1.4, src: true }], amb: 0.015, ambColor: "#9aa6c4" };
    rain3(g, t, Object.assign({ angle: 0.1, seed: 61, density: 0.8 }, RL));
  });
}

// ---- shot 7: alone between the stones, the light comes back --------------------------------------------
// The same garden as shot 5, seen across: the house far left with your window still lit, the back
// fence and the neighbours' trees behind, an oak on the right, the hedge line. The ring opens
// between the two out-of-focus foreground stones, and its light is the only key.
const GY7 = 372;
function stonesSet() {
  return K.sprite("f00-stones7", W + 120, H + 120, (s) => {
    s.translate(60, 60);
    K.groundPlane(s, W + 120, H + 60, { tex: "turf", texOpts: { seed: 7 }, horizon: 338, cx: 540, scale: 240, focal: 700, wet: 0.7, puddles: 0.3, sky: "#3a3e48", fog: "#14181e", fogAmt: 0.85, tint: "#4a5a48", tintAlpha: 0.5, x0: -60, cache: false });
    K.fence(s, 250, W + 40, 346, 16, { night: true, color: "#2a3038" });
    hedgeMass(s, ragged(240, W + 60, () => 352, 14, 21), 360, 360, { scale: 60, seed: 4 });
    K.aoEdge(s, 240, 360, W + 60, 360, { width: 8, alpha: 0.6, side: -1 });
    tinted(s, "f00-oak7b", (c) => K.tree(c, 820, 374, 0.95, { seed: 6, leaf: "#2a4a30", trunk: "#1a1a16", t: 0, kind: "oak", sway: 0 }), "#05090a", 0.86);
  });
}
// the two foreground stones close to the lens: pre-blurred sprites (no per-frame filter), one unlit and
// one rimmed by the ring's gold, crossfaded as it grows
function fgStones(rim) {
  // the two standing stones close to the lens, left and right: big lit granite masses (per-pixel relief,
  // lichen, wet rivulets with specular), rendered once unlit (cold sky from above) and once with the
  // ring's light raking across their inner faces, then softened a touch (they are nearer than focus)
  return K.sprite("f00-fgst2:" + rim, W, H, (c) => {
    const mk = (seed, side) => rim
      ? stoneSpr(seed, 160, 320, { L: [-side, -0.25, 0.3], key: [255, 196, 120], keyK: 1.7, amb: [54, 64, 90], ambK: 0.32, wet: 1, specK: 1.3, lichen: 0.45, lean: side * 0.18 })
      : stoneSpr(seed, 160, 320, { L: [-side * 0.2, -0.9, 0.4], key: [130, 150, 190], keyK: 0.5, amb: [54, 64, 90], ambK: 0.4, wet: 1, specK: 0.9, lichen: 0.45, lean: side * 0.18 });
    const S = K.makeCanvas(W * K.pixelScale(), H * K.pixelScale()), sc = S.getContext("2d");
    sc.scale(K.pixelScale(), K.pixelScale());
    // left stone (its inner face is its right side) and the right stone, cropped by the frame edges
    sc.drawImage(mk(7, -1), -120, 20, 330, 660);
    sc.drawImage(mk(8, 1), 760, 40, 320, 640);
    if (K.hasFilter()) c.filter = "blur(" + (2.2 * K.pixelScale()).toFixed(1) + "px)";
    c.drawImage(S, 0, 0, W, H);
    c.filter = "none";
    // the stones stand in the wet grass: their feet fall into occlusion
    c.globalCompositeOperation = "source-atop";
    const ft = c.createLinearGradient(0, 400, 0, H);
    ft.addColorStop(0, "rgba(0,0,0,0)"); ft.addColorStop(1, "rgba(0,0,0,0.6)");
    c.fillStyle = ft; c.fillRect(0, 400, W, H - 400);
  });
}
// the white-out: the ring's light grows past what the film can hold. Filmic: a hot core that spreads
// and rolls off softly into the highlights; the frame corners and the ground under you stay dark
// until the very last instant, when everything burns to white (and the next shot opens out of it).
function whiteOut(g, PX, PY, t) {
  const w = K.smooth(K.seg(t, 62.5, 64.0));
  if (w <= 0) return;
  const R = 160 + 900 * w * w;
  g.save();
  g.globalCompositeOperation = "lighter";
  const gr = g.createRadialGradient(PX, PY, 0, PX, PY, R);
  gr.addColorStop(0, `rgba(255,246,226,${0.95 * w})`);
  gr.addColorStop(0.35, `rgba(255,232,190,${0.6 * w})`);
  gr.addColorStop(0.75, `rgba(255,214,150,${0.16 * w})`);
  gr.addColorStop(1, "rgba(255,214,150,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  // roll-off: a screen pass whitens the hot middle without clipping the darks
  g.globalCompositeOperation = "screen";
  const gs = g.createRadialGradient(PX, PY, 0, PX, PY, R * 0.8);
  gs.addColorStop(0, `rgba(255,250,240,${w})`);
  gs.addColorStop(1, "rgba(255,250,240,0)");
  g.fillStyle = gs;
  g.fillRect(0, 0, W, H);
  g.restore();
}
function shotStones(g, t, p) {
  const grow = K.smooth(K.seg(t, 56, 62));
  const spiral = K.smooth(K.seg(t, 55, 57.5));
  const PX = 500, PY = 318;
  const pr = K.lerp(10, 120, grow);
  const w = K.smooth(K.seg(t, 62.5, 64.0));
  const cam = { x: 480, y: 280, zoom: 1.02 + 0.06 * K.ease.inOut(p), shakeT: t, shakeAmt: 1 + grow * 2.5 };
  const kx = 286, ky = GY7 + 18;
  const ringL = [
    { x: PX, y: PY, r: 300 + 900 * grow, color: "#ffcf7a", k: 0.3 + 1.2 * grow },
    { x: PX, y: GY7, r: 200 + 700 * grow, color: "#ffd890", k: 0.4 + 1.0 * grow, flat: 0.25 },
  ];
  K.withCamera(g, W, H, cam, () => {
    drawDeck(g, -80, -60, W + 160, 420, 47, 0, t - 55, 3 + grow * 20, 0.5);
    ridge(g, { y: 318, amp: 22, color: "#0a0d12", seed: 11, bottom: 420 });
    treeSil(g, 640, 334, 0.5, t, { seed: 33, color: "#06080c", sway: 2 });
    treeSil(g, 900, 336, 0.6, t, { seed: 34, color: "#06080c", sway: 2 });
    // home, across the lawn, the bedroom window still lit
    nightHouse(g, 200, 344, 0.42, t, {});
    g.drawImage(stonesSet(), -60, -60, W + 120, H + 120);
    // the ring's light on everything, growing; a little from your window far behind
    relight(g, "#2a2e3a", [...ringL, { x: kx, y: ky - 120, r: 220, color: "#fff0d0", k: 0.35 }],
      (s) => { s.fillRect(-80, -80, W + 160, 330); s.fillRect(80, 300, 200, 50); });
    // the glow on the ground: a spiral of pawprints winding in toward the ring
    const spts = [];
    for (let i = 0; i < 14; i++) {
      const a = i * 0.72 - t * 0.5, r = 22 + i * 10;
      spts.push({ x: PX + Math.cos(a) * r * 1.7, y: GY7 + Math.sin(a) * r * 0.3, a: a + Math.PI / 2, s: 6 + i * 0.2, alpha: spiral * K.clamp(1.2 - i / 14) * (1 - w) });
    }
    K.lightPool(g, PX, GY7, 160 + pr * 2.4, "#ffcf7a", { flat: 0.18, intensity: 0.25 + 0.5 * grow });
    K.pawprints(g, spts, 1);
    if (grow > 0) drawPortal(g, PX, PY, pr, t, 0.8 + grow * 0.6, 0.1, 0.4 + 0.6 * grow);
    // wind pulls the rain and leaves toward the light; drops crossing it catch the gold
    K.leaves(g, W, H, t, { seed: 4, count: 18, wind: 0.8, toward: [PX, PY], pull: 0.35 + grow * 0.5 });
    const RL = { lights: [Object.assign({}, ringL[0], { r: 120 + 380 * grow, k: 1.5, src: true }), ringL[1]], amb: 0.03, ambColor: "#9aa6c4" };
    rain3(g, t, Object.assign({ angle: -(0.22 + grow * 0.3), seed: 71, density: 1.0 }, RL));
    splash3(g, t, Object.assign({ x0: 80, x1: 900, y0: GY7 - 20, y1: H, n: 80, seed: 17 }, RL));
    whiteOut(g, PX, PY, t);
    // you: from behind, three-quarters, facing the light, the torch hanging useless; a long shadow
    // thrown back toward us. You stay a dark shape against the glare until the last instant.
    g.save();
    g.translate(kx, ky);
    g.transform(1, 0, -2.4, 0.12, 0, 0);
    K.shadowBlob(g, 0, 0, 36, 196 * (0.5 + grow * 0.6), { alpha: 0.35 + 0.4 * grow });
    g.restore();
    K.shadowBlob(g, kx, ky + 1, 30, 4, { alpha: 0.7 });
    raincoatKid(g, kx, ky, 196, {
      t, turn: 0.55, wet: 0.85, torchAng: 1.25, front: 1,
      key: { x: PX, y: PY, color: "#ffcf7a", k: 0.4 + 0.8 * grow },
      moon: { color: "#8ea4d8", k: 0.25 }, fill: "#3a4660", spec: "#8a9cc0",
    });
  });
  // the stones themselves frame the shot, close to the lens and out of focus
  g.drawImage(fgStones(0), 0, 0, W, H);
  if (grow > 0.01) { g.save(); g.globalAlpha = grow; g.drawImage(fgStones(1), 0, 0, W, H); g.restore(); }
  // corners hold their black (≤ 0.15) right up to the burn; the last 0.35 s goes to white
  if (w > 0) {
    const vg = g.createRadialGradient(PX, PY, 200, PX, PY, 700);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, `rgba(4,3,2,${0.55 * w})`);
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }
  const burn = K.smooth(K.seg(t, 63.65, 64.0));
  if (burn > 0) K.fadeColor(g, W, H, burn, "#fff6e6");
}
// ---- shot 8: white, then the Cat Plaza at golden hour --------------------------------------------------
// A photographic plate: a low sun just above the far arches (everything facing us is backlit, its
// shadows rake toward the lens), fbm cumulus lit warm on the sun side and cool underneath, haze
// thickening toward the horizon, seven stone arches each holding a glowing portal that spills its
// colour onto the paving, and the fountain with the statue, a wet dark ring round the basin.
const PZ = { x: -60, y: -150, w: W + 120, h: H + 190 };
const SUN8 = [700, PLAZA_HZ - 34];
const ARCH8 = [[70, 342, 150], [200, 326, 118], [335, 314, 96], [480, 310, 88], [625, 314, 96], [760, 326, 118], [890, 342, 150]];
const GLOW8 = ["#78d25a", "#e6b478", "#a07ad8", "#ff7a3a", "#6a5ad0", "#ff6ad5", "#fff2c8"];
const FT8 = { x: 480, y: 420 };
function plazaSky() {
  // per-pixel cumulus: density from fbm, lit by marching one step toward the sun (sun-side edges
  // bright and warm, the bellies cool lilac-grey), over a zenith-to-horizon gradient with sun glare
  return K.texBake("f00-pz-sky", 384, 180, (u, v, out) => {
    const sx = (SUN8[0] - PZ.x) / PZ.w, sy = (SUN8[1] - PZ.y) / (PLAZA_HZ - PZ.y);
    const sd = Math.hypot((u - sx) * 1.8, v - sy);
    const z = [72, 116, 178], hzc = [255, 206, 168], sunc = [255, 236, 200];
    const k = Math.pow(v, 1.4);
    let r = K.lerp(z[0], hzc[0], k), gg = K.lerp(z[1], hzc[1], k), b = K.lerp(z[2], hzc[2], k);
    const glare = Math.exp(-sd * 5) * 0.9 + Math.exp(-sd * 22) * 0.6;
    r += (sunc[0] - r) * Math.min(1, glare); gg += (sunc[1] - gg) * Math.min(1, glare); b += (sunc[2] - b) * Math.min(1, glare);
    // clouds thin out toward the horizon (perspective) and sit in a band
    const band = sm01(0.02, 0.25, v) * sm01(0.95, 0.6, v);
    const den = (K.texFbm(u * 5, v * 9, 91, 5, 5, 9) * 0.5 + 0.5) * band;
    const step = (K.texFbm((u + (sx - u) * 0.04) * 5, (v + (sy - v) * 0.04) * 9, 91, 5, 5, 9) * 0.5 + 0.5) * band;
    const c = sm01(0.42, 0.62, den);
    if (c > 0) {
      const lit = K.clamp(0.5 + (den - step) * 9);
      const near = Math.exp(-sd * 2.2);
      const cr = K.lerp(150, 255, lit) * (0.8 + 0.25 * near), cg = K.lerp(132, 214, lit) * (0.8 + 0.2 * near), cb = K.lerp(160, 170, lit);
      const edge = sm01(0.42, 0.5, den) * (1 - sm01(0.5, 0.62, den)) * near * 0.8;
      r = K.lerp(r, Math.min(255, cr + 60 * edge), c); gg = K.lerp(gg, Math.min(255, cg + 40 * edge), c); b = K.lerp(b, cb, c);
    }
    out[0] = r; out[1] = gg; out[2] = b; out[3] = 255;
  });
}
function archPath(x, y, h, inner) {
  const w = h * 0.66, pw = h * 0.12, hw = w / 2 - (inner ? pw : 0), spring = y - h + w / 2;
  const p = new Path2D();
  p.moveTo(x - hw, y);
  p.lineTo(x - hw, spring);
  p.arc(x, spring, hw, Math.PI, 0);
  p.lineTo(x + hw, y);
  p.closePath();
  return p;
}
function plazaPlate() {
  return K.sprite("f00-pz-plate", PZ.w, PZ.h, (c) => {
    c.translate(-PZ.x, -PZ.y);
    const HZ = PLAZA_HZ;
    c.drawImage(plazaSky(), PZ.x, PZ.y, PZ.w, HZ - PZ.y + 2);
    // the far town, flattened by the haze into layers of lilac
    ridge(c, { y: HZ - 20, amp: 44, color: "#c8a8b0", seed: 4, bottom: HZ + 4, top: "#d8bcbc" });
    const R = K.rng("f00-pz-roofs");
    for (let i = 0; i < 26; i++) {
      const x = R() * W, w = 16 + R() * 30, h = 10 + R() * 24;
      c.fillStyle = K.mix("#a88894", "#c8a8ac", R());
      c.fillRect(x, HZ - h, w, h + 2);
      c.beginPath(); c.moveTo(x - 3, HZ - h); c.lineTo(x + w / 2, HZ - h - 9); c.lineTo(x + w + 3, HZ - h); c.fill();
      c.fillStyle = "rgba(255,214,160,0.35)";
      c.fillRect(x + w - 2, HZ - h, 2, h);
    }
    // paving: cobbles in perspective, warm where the low sun reaches between the arches
    K.groundPlane(c, W, H + 40, { tex: "cobble", texOpts: { seed: 9 }, horizon: HZ, y0: HZ, scale: 300, focal: 560, wet: 0.15, sky: "#ffd8b8", fog: "#e8c4b4", fogAmt: 0.75, tint: "#b89888", tintAlpha: 0.35, variation: 0.6, cache: false });
    c.fillStyle = "#e8c4b4";
    c.fillRect(PZ.x, HZ, PZ.w, 2);
    const sunPave = c.createRadialGradient(SUN8[0], HZ + 10, 10, SUN8[0], HZ + 10, 520);
    sunPave.addColorStop(0, "rgba(255,214,150,0.5)"); sunPave.addColorStop(1, "rgba(255,214,150,0)");
    c.save(); c.globalCompositeOperation = "soft-light"; c.fillStyle = sunPave; c.fillRect(PZ.x, HZ, PZ.w, H - HZ + 60); c.restore();
    const nearShade = c.createLinearGradient(0, HZ, 0, H + 40);
    nearShade.addColorStop(0, "rgba(40,24,40,0)"); nearShade.addColorStop(1, "rgba(40,24,40,0.45)");
    c.fillStyle = nearShade; c.fillRect(PZ.x, HZ, PZ.w, H - HZ + 60);
    // long shadows raking toward the lens from every pillar (soft: baked through a blur)
    const SH = K.sprite("f00-pz-shadows", W + 120, H + 40, (s) => {
      s.translate(60, 0);
      s.fillStyle = "#000";
      for (const [x, y, h] of ARCH8) {
        const w = h * 0.66, pw = h * 0.12;
        for (const px of [x - w / 2 + pw / 2, x + w / 2 - pw / 2]) {
          const dx = (px - SUN8[0]) * 1.4, len = H + 40 - y;
          s.beginPath();
          s.moveTo(px - pw / 2, y); s.lineTo(px + pw / 2, y);
          s.lineTo(px + pw / 2 + dx * 1.15 + pw, y + len); s.lineTo(px - pw / 2 + dx * 1.15 - pw, y + len); s.closePath(); s.fill();
        }
      }
      // the fountain's and the statue's shadows
      s.beginPath(); s.moveTo(FT8.x - 60, FT8.y); s.lineTo(FT8.x + 60, FT8.y); s.lineTo(FT8.x - 30, H + 40); s.lineTo(FT8.x - 260, H + 40); s.closePath(); s.fill();
    });
    c.save();
    c.globalAlpha = 0.42;
    c.globalCompositeOperation = "multiply";
    const shS = blurredSpr("f00-pz-shadows-soft", SH, W + 120, H + 40, 5);
    c.beginPath(); c.rect(PZ.x, HZ + 1, PZ.w, H); c.clip();
    c.drawImage(shS, -60, 0, W + 120, H + 40);
    c.restore();
    // the arches, far to near, each with its portal and the light it spills on the paving
    const order = ARCH8.map((a, i) => [a, i]).sort((a, b) => a[0][1] - b[0][1]);
    for (const [[x, y, h], i] of order) {
      const far = 1 - (y - 310) / 32;
      const outer = archPath(x, y, h, false), inner = archPath(x, y, h, true);
      // portal light pooled on the paving in front (coloured, inverse-square-ish ellipse)
      c.save();
      c.globalCompositeOperation = "lighter";
      c.translate(x, y + h * 0.18);
      c.scale(1, 0.24);
      const pg = c.createRadialGradient(0, 0, 0, 0, 0, h * 1.6);
      pg.addColorStop(0, K.rgba(GLOW8[i], 0.55)); pg.addColorStop(0.3, K.rgba(GLOW8[i], 0.2)); pg.addColorStop(1, K.rgba(GLOW8[i], 0));
      c.fillStyle = pg; c.fillRect(-h * 1.6, -h * 1.6, h * 3.2, h * 3.2);
      c.restore();
      // the stone: weathered sandstone, its face to us in shade (the sun is behind it)
      const fr = new Path2D(); fr.addPath(outer); fr.addPath(inner);
      K.texFill(c, "granite", fr, { scale: 90 + h * 0.4, tex: { seed: 20 + i, color: "#b09080", lichen: 0.25 }, tint: "#8a6a68", tintAlpha: 0.55 });
      c.save();
      c.clip(outer);
      // sky fill from above, ground bounce warm from below, AO in the soffit and at the base
      const sg = c.createLinearGradient(0, y - h, 0, y);
      sg.addColorStop(0, "rgba(120,130,190,0.18)"); sg.addColorStop(0.7, "rgba(40,20,30,0.15)"); sg.addColorStop(1, "rgba(20,10,16,0.5)");
      c.fillStyle = sg; c.fill(outer);
      c.lineWidth = h * 0.05; c.strokeStyle = "rgba(20,10,20,0.45)"; c.stroke(inner);
      c.restore();
      // the sun just grazing the top of the arch: a hot rim
      c.save();
      c.strokeStyle = K.rgba("#ffd8a0", 0.75 * (0.5 + 0.5 * Math.exp(-Math.abs(x - SUN8[0]) / 300)));
      c.lineWidth = 1.6;
      c.beginPath(); const w = h * 0.66, sp = y - h + w / 2;
      c.arc(x, sp, w / 2 - 0.8, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
      c.restore();
      // the portal: a deep glowing membrane, hotter at its middle
      c.save();
      c.clip(inner);
      const iw = h * 0.42, cy = y - h * 0.42;
      const portal = c.createRadialGradient(x, cy, 0, x, cy, h * 0.7);
      portal.addColorStop(0, K.mix(GLOW8[i], "#ffffff", 0.7)); portal.addColorStop(0.4, GLOW8[i]); portal.addColorStop(1, K.mix(GLOW8[i], "#1a1020", 0.5));
      c.fillStyle = portal; c.fillRect(x - iw, y - h, iw * 2, h);
      c.restore();
      // volumetric halo round the opening (scatter in the warm haze)
      K.glow(c, x, cy, h * 0.9, GLOW8[i], 0.32);
      // haze: the farther arches sink into the warm air
      c.save(); c.globalAlpha = 0.1 + far * 0.32; c.fillStyle = "#f0c8b8"; c.fill(outer); c.restore();
    }
    // atmospheric haze toward the horizon over everything far
    const hz = c.createLinearGradient(0, HZ - 120, 0, HZ + 70);
    hz.addColorStop(0, "rgba(255,214,186,0)"); hz.addColorStop(0.6, "rgba(255,214,186,0.38)"); hz.addColorStop(1, "rgba(255,214,186,0)");
    c.fillStyle = hz; c.fillRect(PZ.x, HZ - 120, PZ.w, 190);
    // the trees either side, blossom lit from behind
    const tl = canopySpr(51, 340, 380, { base: [176, 104, 124], trunk: [52, 34, 34], rim: [255, 214, 170], rimK: 1.1, dir: [0.7, -0.7], lit: [230, 160, 170], litK: 0.3, lobes: 30, vol: 1, sky: [236, 210, 236] });
    c.drawImage(tl, -230, 372 - 360, 340, 380);
    c.drawImage(tl, 1040 - 170, 380 - 360, 340, 380);
    // the fountain: a wet dark ring soaked into the paving, the stone basin, the water
    c.save();
    c.translate(FT8.x, FT8.y + 4); c.scale(1, 0.22);
    const wr = c.createRadialGradient(0, 0, 200, 0, 0, 300);
    wr.addColorStop(0, "rgba(30,18,22,0.55)"); wr.addColorStop(0.6, "rgba(30,18,22,0.25)"); wr.addColorStop(1, "rgba(30,18,22,0)");
    c.fillStyle = wr; c.fillRect(-310, -310, 620, 620);
    c.restore();
    const basin = new Path2D(); basin.ellipse(FT8.x, FT8.y - 6, 236, 46, 0, 0, K.TAU);
    K.texFill(c, "granite", basin, { scale: 160, tex: { seed: 61, color: "#a89080" }, tint: "#8a7270", tintAlpha: 0.5 });
    c.save(); c.clip(basin);
    const bg = c.createLinearGradient(0, FT8.y - 52, 0, FT8.y + 40);
    bg.addColorStop(0, "rgba(255,214,170,0.35)"); bg.addColorStop(0.5, "rgba(0,0,0,0)"); bg.addColorStop(1, "rgba(20,10,20,0.45)");
    c.fillStyle = bg; c.fill(basin); c.restore();
    const water = new Path2D(); water.ellipse(FT8.x, FT8.y - 2, 222, 38, 0, 0, K.TAU);
    const wg = c.createLinearGradient(0, FT8.y - 40, 0, FT8.y + 36);
    wg.addColorStop(0, "#e8c0a8"); wg.addColorStop(0.35, "#9c8098"); wg.addColorStop(1, "#3a3448");
    c.fillStyle = wg; c.fill(water);
    c.save(); c.clip(water);
    c.globalAlpha = 0.5; c.translate(0, (FT8.y - 40) * 2); c.scale(1, -1);
    c.drawImage(plazaSky(), FT8.x - 240, PLAZA_HZ - 140, 480, 140);
    c.restore();
    // the statue, backlit: detail in shade, a rim of sun along its sun-side edges
    const ST = K.sprite("f00-pz-statue", 260, 400, (s) => s.drawImage(statueSprite(), 0, 0, 260, 400));
    // its long dawn shadow: the low sun is behind it (up and to the right), so the pedestal and the cat
    // lie down across the water and the paving toward us and to the left - soft-edged (the sun is a disc,
    // the penumbra widens with distance), lighter far from the base
    const SHM = K.sprite("f00-pz-stshadow", 260, 400, (s) => {
      s.drawImage(ST, 0, 0, 260, 400);
      s.globalCompositeOperation = "source-in";
      const sg = s.createLinearGradient(0, 400, 0, 0);
      sg.addColorStop(0, "rgba(40,20,40,1)"); sg.addColorStop(1, "rgba(40,20,40,0.55)");
      s.fillStyle = sg; s.fillRect(0, 0, 260, 400);
    });
    c.save();
    c.beginPath(); c.rect(PZ.x, PLAZA_HZ + 2, PZ.w, PZ.h); c.clip();
    c.globalCompositeOperation = "multiply";
    c.globalAlpha = 0.5;
    c.translate(FT8.x, FT8.y - 4);
    c.transform(1, 0, 0.92, -0.15, 0, 0);
    c.drawImage(blurredSpr("f00-pz-stshadow-soft", SHM, 260, 400, 3), -130, -400, 260, 400);
    c.restore();
    const SD = K.sprite("f00-pz-statue-d", 260, 400, (s) => {
      s.drawImage(ST, 0, 0, 260, 400);
      s.globalCompositeOperation = "source-atop";
      const gd = s.createLinearGradient(0, 0, 260, 0);
      gd.addColorStop(0, "rgba(46,30,46,0.62)"); gd.addColorStop(1, "rgba(70,44,50,0.4)");
      s.fillStyle = gd; s.fillRect(0, 0, 260, 400);
    });
    c.drawImage(SD, FT8.x - 130, FT8.y - 400, 260, 400);
    rimPass(c, ST, FT8.x - 130, FT8.y - 400, 260, 400, [0.6, -0.8], 2.2, "#ffd8a0", 0.9, false, "f00-pz-rim");
    c.save(); c.clip(water);
    c.globalAlpha = 0.3; c.translate(FT8.x, FT8.y - 4); c.scale(1, -0.35);
    c.drawImage(SD, -130, -396, 260, 400);
    c.restore();
  });
}
// fountain spray: four arcs of droplets from the pedestal into the basin, each drop a pure function of
// t; backlit by the sun they sparkle, plus glints dancing on the water and a fine mist at the base
function fountainSpray(g, t) {
  const GR = 140;
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  for (let j = 0; j < 4; j++) {
    const dir = j < 2 ? -1 : 1, sx = FT8.x + dir * (22 + (j % 2) * 10), sy = FT8.y - 70 - (j % 2) * 24;
    const vx = dir * (78 + (j % 2) * 34), vy = -70 - (j % 2) * 20;
    const yEnd = FT8.y - 6 + (j % 2) * 6;
    // flight time to the water: sy + vy t + GR t^2 / 2 = yEnd
    const T = (-vy + Math.sqrt(vy * vy + 2 * GR * (yEnd - sy))) / GR;
    const at = (q) => { const tt = q * T; return [sx + vx * tt, sy + vy * tt + 0.5 * GR * tt * tt]; };
    // the jet: a glassy ribbon that thins as it falls and breaks up near the end (stroked in segments,
    // each a little narrower and fainter, with a shimmer running down it)
    const n = 18;
    let [px, py] = at(0);
    for (let i = 1; i <= n; i++) {
      const q = i / n, [x, y] = at(q);
      const shim = 0.75 + 0.25 * Math.sin(t * 14 - q * 9 + j * 2);
      g.strokeStyle = `rgba(255,246,232,${(0.2 * (1 - q * 0.7)) * shim})`;
      g.lineWidth = 3.4 * (1 - q * 0.65) + 0.4;
      g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
      g.strokeStyle = `rgba(255,252,244,${0.32 * (1 - q * 0.8) * shim})`;
      g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(px - 0.5, py - 0.6); g.lineTo(x - 0.5, y - 0.6); g.stroke();
      px = x; py = y;
    }
    // beads of water running along the jet, each catching the sun as a specular point
    for (let k = 0; k < 7; k++) {
      const q = (t * 0.85 + k / 7 + j * 0.13) % 1;
      const [x, y] = at(q);
      const a = 0.55 * (1 - q * 0.5);
      g.fillStyle = `rgba(255,250,236,${a})`;
      g.beginPath(); g.arc(x, y, 1.1 + 0.6 * (1 - q), 0, K.TAU); g.fill();
      if (k % 2 === 0) K.glow(g, x, y, 5, "#fff6e0", 0.35 * a);
    }
    // where it lands: a splash ring spreading on the basin water, a little crown of droplets
    const [lx, ly] = at(1);
    for (let r = 0; r < 2; r++) {
      const ph = (t * 1.6 + r * 0.5 + j * 0.27) % 1;
      g.strokeStyle = `rgba(255,244,228,${0.3 * (1 - ph)})`;
      g.lineWidth = 0.8;
      g.beginPath(); g.ellipse(lx, ly, 4 + ph * 16, (4 + ph * 16) * 0.24, 0, 0, K.TAU); g.stroke();
    }
    for (let d = 0; d < 5; d++) {
      const ph = (t * 2.3 + d * 0.21 + j * 0.31) % 1;
      const a = -Math.PI / 2 + (d - 2) * 0.5;
      const x = lx + Math.cos(a) * 9 * ph, y = ly + (Math.sin(a) * 9 * ph + 18 * ph * ph);
      g.fillStyle = `rgba(255,248,236,${0.45 * (1 - ph)})`;
      g.fillRect(x - 0.6, y - 0.6, 1.3, 1.3);
    }
    K.glow(g, lx, ly - 2, 14, "#fff2e2", 0.12);
  }
  // sun glints dancing on the basin water
  const G = new Path2D();
  for (let i = 0; i < 46; i++) {
    const a = K.hash(i, 31) * K.TAU, d = 0.3 + K.hash(i, 32) * 0.65;
    const tw = Math.max(0, Math.sin(t * 3 + i * 1.7));
    if (tw < 0.2) continue;
    const x = FT8.x + Math.cos(a) * 222 * d, y = FT8.y - 2 + Math.sin(a) * 38 * d;
    G.rect(x - 3 * tw, y, 6 * tw + 1, 1);
    G.rect(x, y - 1.5 * tw, 1, 3 * tw + 0.5);
  }
  g.fillStyle = "rgba(255,248,230,0.6)";
  g.fill(G);
  K.glow(g, FT8.x, FT8.y - 20, 120, "#fff0e0", 0.14);
  g.restore();
}
function shotPlaza(g, t, p) {
  // opens soft out of the white and racks to sharp by 69.8
  const soft = K.smooth(1 - K.seg(t, 68.4, 69.8));
  const cam = { x: 480, y: K.lerp(222, 206, p), zoom: 1.02 - 0.04 * K.ease.out(p), shakeT: t, shakeAmt: 0.6 };
  K.withCamera(g, W, H, cam, () => {
    g.drawImage(plazaPlate(), PZ.x, PZ.y, PZ.w, PZ.h);
    // the portals breathe: a slow pulse of their halos
    g.save();
    g.globalCompositeOperation = "lighter";
    ARCH8.forEach(([x, y, h], i) => K.glow(g, x, y - h * 0.42, h * 0.6, GLOW8[i], 0.12 + 0.1 * Math.sin(t * 0.9 + i)));
    g.restore();
    fountainSpray(g, t);
    if (soft > 0.01) {
      g.save();
      g.globalAlpha = soft;
      g.drawImage(blurredSpr("f00-pz-soft", plazaPlate(), PZ.w, PZ.h, 8), PZ.x, PZ.y, PZ.w, PZ.h);
      g.restore();
    }
  });
  // out of the white: held for a beat, then the exposure comes down to the morning
  const w = 1 - K.smooth(K.seg(t, 64.6, 67.4));
  if (w > 0) K.fadeColor(g, W, H, w, "#fff6e6");
  const ta = K.smooth(K.seg(t, 69.5, 70.7));
  if (ta > 0) {
    const ty = 104;
    const band = g.createLinearGradient(0, ty - 60, 0, ty + 60);
    band.addColorStop(0, "rgba(20,10,24,0)");
    band.addColorStop(0.5, `rgba(20,10,24,${0.16 * ta})`);
    band.addColorStop(1, "rgba(20,10,24,0)");
    g.fillStyle = band;
    g.fillRect(0, ty - 60, W, 120);
    // a subtle bloom, not a coloured outer glow
    K.title(g, W, H, "Find him.", "", ta, { y: ty, size: 74, glow: "#2a1a14", color: "#fff6e6" });
  }
}

// ---- sequencing and cache warming -------------------------------------------------------------------------
// Cuts and cross-dissolves as in lib012.runFilm. Warming: each shot lists small cache builders
// (`warm`); they run one per frame inside fixed time slots (x.06-x.18 s, x.31-x.43 s, ...) over the
// 7 s before the shot's cut, so playback builds the next shot's plates a few frames apart while the
// current shot plays, and no cut ever pays the build. A frame drawn outside a slot never builds
// anything ahead. Only caches change: the picture stays a pure function of t.
const WARMED = new Set();
function drawShot(g, s, t) {
  g.save();
  try { s.draw(g, t, K.seg(t, s.a, s.b)); } finally { g.restore(); }
}
function warmStep(t, cur) {
  const f = t - Math.floor(t * 4) / 4;
  if (f < 0.06 || f > 0.18) return;
  const px = K.pixelScale();
  const tryShot = (k) => {
    const s = SHOTS[k];
    const jobs = s.warm ? s.warm() : [];
    // then the shot itself at a run of times over its first 2.5 s (each builds what that frame needs:
    // the plates on the first, then the cat poses / soft layers as they come up)
    for (let i = 0; i < 8; i++) jobs.push(() => { const L = K.layer(W, H, "f00-warm"); drawShot(L.g, s, s.a + 0.05 + i * 0.21); });
    for (let j = 0; j < jobs.length; j++) {
      const id = k + ":" + j + "@" + px;
      if (WARMED.has(id)) continue;
      WARMED.add(id);
      jobs[j]();
      return true;
    }
    return false;
  };
  const n = cur + 1;
  if (n < SHOTS.length && SHOTS[n].a - t < (SHOTS[n].lead || 7)) tryShot(n);
}
function runShots(g, t, W2, H2) {
  let i = 0;
  g.save();
  try {
    if (W2 !== W || H2 !== H) g.scale(W2 / W, H2 / H);
    for (let k = 0; k < SHOTS.length; k++) if (t >= SHOTS[k].a) i = k;
    const s = SHOTS[i];
    const xf = s.xf || 0;
    if (xf > 0 && i > 0 && t < s.a + xf) {
      drawShot(g, SHOTS[i - 1], t);
      const L = K.layer(W, H, "f00-xfade");
      drawShot(L.g, s, t);
      g.save();
      g.globalAlpha = K.smooth((t - s.a) / xf);
      g.drawImage(L.canvas, 0, 0, W, H);
      g.restore();
    } else drawShot(g, s, t);
    post(g, t);
  } finally {
    g.restore();
  }
  warmStep(t, i);
}

const SHOTS = [
  { a: 0, b: 9, draw: shotHouse },
  { a: 9, b: 19, draw: shotWindow, lead: 8.8, warm: warmWindow },
  { a: 19, b: 27, draw: shotGarden },
  { a: 27, b: 35, draw: shotFlap },
  { a: 35, b: 46, draw: shotChase },
  { a: 46, b: 55, draw: shotMud },
  { a: 55, b: 64, draw: shotStones, xf: 0.5 },
  { a: 64, b: 72, draw: shotPlaza },
];

// Lens, grain, vignette and bloom all live in the GPU lens (film.gradeAt below); here only the
// letterbox and the opening fade from black.
function post(g, t) {
  K.letterbox(g, W, H, 1);
  K.fadeBlack(g, W, H, 1 - K.smooth(K.seg(t, 0, 1.2)));
}

// per-shot lens looks, blended across the cuts (REALISM.md recipes: rainy night, lamp-lit interior)
const LOOK = {
  storm: { exposure: 1.0, temp: -0.16, tint: 0.0, lift: [0.004, 0.009, 0.022], gamma: [1, 1, 1], gain: [1, 1, 1], sat: 0.9, contrast: 1.08, bloom: 0.35, threshold: 0.95, halation: 0.5, streak: 0.1, grain: 0.06, vignette: 0.5, weave: 1 },
  room: { exposure: 1.0, temp: 0.04, tint: 0.0, lift: [0.006, 0.006, 0.014], gamma: [1, 1, 1], gain: [1, 1, 1], sat: 0.95, contrast: 1.06, bloom: 0.4, threshold: 0.95, halation: 0.55, streak: 0.04, grain: 0.06, vignette: 0.5, weave: 0.8 },
  torch: { exposure: 1.05, temp: -0.08, tint: 0.0, lift: [0.002, 0.004, 0.012], gamma: [1, 1, 1], gain: [1, 1, 1], sat: 0.92, contrast: 1.1, bloom: 0.4, threshold: 0.95, halation: 0.5, streak: 0.06, grain: 0.07, vignette: 0.55, weave: 1.2 },
  portal: { exposure: 1.0, temp: 0.05, tint: 0.0, lift: [0.006, 0.008, 0.018], gamma: [1, 1, 1], gain: [1.03, 1, 0.95], sat: 0.95, contrast: 1.06, bloom: 0.5, threshold: 0.95, halation: 0.6, streak: 0.1, grain: 0.06, vignette: 0.45, weave: 1 },
  dawn: { exposure: 0.74, temp: 0.1, tint: 0.02, lift: [0.004, 0.004, 0.008], gamma: [1, 1, 1], gain: [1.02, 1, 0.97], sat: 1.05, contrast: 1.16, bloom: 0.15, threshold: 0.95, halation: 0.4, streak: 0.0, grain: 0.045, vignette: 0.35, weave: 0.7 },
};
function lerpLook(a, b, k) {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const o = {};
  for (const key of Object.keys(a)) {
    const va = a[key], vb = b[key];
    o[key] = Array.isArray(va) ? va.map((x, i) => K.lerp(x, vb[i], k)) : K.lerp(va, vb, k);
  }
  return o;
}
function gradeAt(t) {
  if (t < 9) return LOOK.storm;
  if (t < 19) return lerpLook(LOOK.storm, LOOK.room, K.smooth(K.seg(t, 9, 9.7)));
  if (t < 46) return lerpLook(LOOK.room, LOOK.storm, K.smooth(K.seg(t, 19, 19.3)));
  if (t < 55) return LOOK.torch;
  if (t < 64) {
    // the exposure climbs over the last 1.5 s into the white (the lens bloom rolls it off)
    const L = lerpLook(LOOK.storm, LOOK.portal, K.smooth(K.seg(t, 56, 62)));
    const k = K.smooth(K.seg(t, 62.5, 64));
    return k > 0 ? Object.assign({}, L, { exposure: L.exposure * (1 + 0.6 * k), bloom: L.bloom + 0.4 * k }) : L;
  }
  return lerpLook(LOOK.portal, LOOK.dawn, K.smooth(K.seg(t, 64, 67)));
}

export const film = {
  id: 0,
  title: "The Night He Left",
  chapter: "Prologue",
  unlockAt: 0,
  duration: 72,
  poster: 14,
  grade: LOOK.storm,
  gradeAt,
  tagline: "One stormy night, Biscuit followed a light. You followed Biscuit.",
  subs: [
    [4.0, 7.5, "It had been raining all night."],
    [10.0, 13.5, "Biscuit would not leave the window."],
    [14.5, 18.5, "Something out there was calling him."],
    [21.5, 25.5, "Pawprints. Glowing in the dark."],
    [29.0, 33.5, "Then the cat flap clicked."],
    [36.0, 39.0, "You grabbed the flashlight and ran."],
    [44.5, 46.5, "And he was gone."],
    [48.5, 53.5, "All that was left was his little bell."],
    [57.0, 61.5, "Then the stones began to glow again."],
    [65.0, 68.5, "And the light pulled you through."],
  ],
  voice: [
    [4.0, "It had been raining all night.", { rate: 0.92, pitch: 1.0 }],
    [10.0, "Biscuit would not leave the window.", { rate: 0.92, pitch: 1.0 }],
    [14.5, "Something out there was calling him.", { rate: 0.92, pitch: 1.0 }],
    [21.5, "Pawprints. Glowing in the dark.", { rate: 0.92, pitch: 1.0 }],
    [29.0, "Then the cat flap clicked.", { rate: 0.92, pitch: 1.0 }],
    [36.0, "You grabbed the flashlight and ran.", { rate: 0.92, pitch: 1.0 }],
    [44.5, "And he was gone.", { rate: 0.85, pitch: 0.95 }],
    [48.5, "All that was left was his little bell.", { rate: 0.85, pitch: 0.95 }],
    [57.0, "Then the stones began to glow again.", { rate: 0.92, pitch: 1.0 }],
    [65.0, "And the light pulled you through.", { rate: 0.92, pitch: 1.0 }],
  ],
  score: {
    mood: "storm", key: "D", bpm: 64,
    cues: [[2, "thunder"], [12, "meow"], [21, "thunder"], [31, "swell"], [39, "hit"], [44, "drop"], [47, "bell"], [53.6, "bell"], [56, "swell"], [63, "hit"], [68, "drop"]],
  },
  draw(g, t, W2, H2) {
    runShots(g, t, W2, H2);
  },
};
