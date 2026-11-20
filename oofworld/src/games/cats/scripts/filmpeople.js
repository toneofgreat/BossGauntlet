// src/games/cats/scripts/filmpeople.js - "you", the kid: drawPerson (from behind / in profile, never
// face-on), drawHand (POV hands) and flashlightBeam. Re-exported by filmkit.js.
//
// v2 "photographic" rendering: every part is lit by a small physically-motivated rig (key light from
// opts.light, a cool ambient fill, a rim pass on the silhouette), shaded as a cylinder / sphere with
// Lambert-wrap diffuse + Blinn specular per material (glossy PVC raincoat, denim, rubber boots, skin
// with subsurface warmth, anisotropic hair), plus cached micro-texture tiles (denim twill, PVC orange
// peel, skin pores) laid over at the right scale, pose-driven fabric folds, rain beads when wet, and
// contact shadows. Expensive pixel work (texture tiles, hair, the beam cone) happens once, cached.
//
// drawPerson(g, x, y, h, opts)  x, y = ground point between the feet, h = standing height px.
//   opts view 'back'|'side'  facing 1|-1 (side view)  walk|run (bool) + phase 0..1 gait cycle
//        hood (bool, hood up)  coat colour (default yellow raincoat #e8b923)  pants  boots  hair
//        skin  flashlight (bool) + flashAngle (radians, screen) + flashLen (px)  bell (bell on the
//        left wrist)  reach 0..1 (right arm reaches forward/down)  armUp 0..1 (right arm raised
//        overhead)  crouch 0..1  wet 0..1  t
//        light {x, y, color, strength, z}  key light (z: -1 behind the subject .. 1 from the camera,
//              default 0.4) - drives shading, specular and the rim on the silhouette
//        ambient  css colour of the fill/sky light (default: derived from the key, cooler)
//        shadow (bool, default true)   alpha
//        NEW: detail 0..2 (auto from on-screen size)  breathe (bool, default true when idle)
//             sway 0..1 idle weight shift (default 1)  beads (bool, rain beads when wet, default true)
//             sit 0..1 (sitting on the ground, knees up, arms round them)  kneel 0..1 (one knee down)
//             armL / armR { hand: [x, y], elbow?: [x, y] } pose an arm by its hand target, in body units
//               (1 = h/100, origin at the ground point, y up is negative; shoulders sit at (+-9.5, -77));
//               e.g. hands over the ears armL:{hand:[-8,-90]} armR:{hand:[8,-90]}, pushing a door
//               armR:{hand:[13,-82]}. The elbow is solved by IK.
// drawHand(g, x, y, size, opts)  POV hand: (x, y) = wrist, size = wrist->fingertip px.
//   opts angle (direction the fingers point, default up), pose 'reach'|'open'|'hold'|'point'|'cup'
//        left (mirror to a left hand), item 'flashlight'|'poster'|'photo'|'bell'|null, bell (bell on
//        a red string round the wrist), skin, shadow, sleeve, light {x,y,color,strength,z}, t, wet
//        NEW: grip 0..1 (extra finger squeeze), ambient
// flashlightBeam(g, x, y, angle, len, {spread, color, alpha, hot, t, dust, source})
//   a volumetric torch cone: hot core + reflector spill + soft halo, air density falloff, drifting dust
//   motes lit by the cone (when t is given), halation round the lens.

import { TAU, clamp, lerp, smooth, mix, rgba, shade, rng, spline, tube, ellipsePath, crescent, roundRect, parseColor, hash, makeCanvas, sprite, glow, pixelScale, qblur } from "./filmcore.js";
import { drawCat } from "./filmcat.js";

const KID = Object.freeze({ coat: "#e8b923", pants: "#2b3448", boots: "#a8322e", hair: "#5a3a22", skin: "#e0ac85", skinShadow: "#b87c5a" });

// ================================================================================================
// small shading engine
// ================================================================================================
const MAT = Object.freeze({
  pvc: { wrap: 0.3, spec: 0.42, shin: 34, sss: 0, spec2: 0.1, shin2: 5 },
  denim: { wrap: 0.35, spec: 0.04, shin: 6, sss: 0 },
  rubber: { wrap: 0.2, spec: 0.7, shin: 44, sss: 0, spec2: 0.08, shin2: 6 },
  skin: { wrap: 0.45, spec: 0.12, shin: 10, sss: 0.55 },
  hair: { wrap: 0.3, spec: 0.3, shin: 14, sss: 0 },
  metal: { wrap: 0.1, spec: 1.1, shin: 50, sss: 0 },
  cloth: { wrap: 0.4, spec: 0.03, shin: 5, sss: 0 },
});
const softClip = (c) => (c < 0.82 ? c : 1 - 0.18 * Math.exp(-(c - 0.82) / 0.18));

// The light rig, in the figure's local frame (x already mirrored for facing).
function makeRig(light, lx2, ly2, ambient) {
  let lx = -0.42, ly = -0.8, lz = 0.45, col = [1, 0.95, 0.86], str = 1, rim = 0, css = "#fff1d6";
  if (light) {
    const l = Math.hypot(lx2, ly2) || 1;
    lx = lx2 / l; ly = ly2 / l;
    lz = light.z == null ? 0.4 : clamp(light.z, -1, 1);
    css = light.color || "#fff1d6";
    const c = parseColor(css);
    const m = Math.max(c[0], c[1], c[2], 1);
    col = [lerp(c[0] / m, 1, 0.3), lerp(c[1] / m, 1, 0.3), lerp(c[2] / m, 1, 0.3)];
    str = clamp(light.strength == null ? 1 : light.strength, 0, 2);
    rim = str;
  }
  const n = Math.hypot(lx, ly, lz) || 1;
  lx /= n; ly /= n; lz /= n;
  let amb;
  if (ambient) { const a = parseColor(ambient); amb = [a[0] / 255, a[1] / 255, a[2] / 255]; }
  else amb = [lerp(col[0], 0.8, 0.4) * 0.42, lerp(col[1], 0.85, 0.4) * 0.42, lerp(col[2], 1.0, 0.4) * 0.42]; // ~3:1 key:fill, a photographic default
  const ki = 0.72 + 0.22 * Math.min(str, 1.4);
  // half vector (viewer at +z)
  const hx = lx, hy = ly, hz = lz + 1, hn = Math.hypot(hx, hy, hz) || 1;
  const key = [lx, ly, lz, col[0], col[1], col[2], amb[0], amb[1], amb[2], ki].map((v) => Math.round(v * 25)).join(",");
  return { lx, ly, lz, col, css, amb, ki, rim, hx: hx / hn, hy: hy / hn, hz: hz / hn, back: lz < -0.15, key };
}

// colour of a surface point with normal (nx, ny, nz) of base colour `base` under rig R, material M
const SHADE = new Map();
function shadeAt(base, nx, ny, nz, R, M) {
  if (!R.key) return shadeRaw(base, nx, ny, nz, R, M);
  const k = base + "|" + Math.round(nx * 40) + "," + Math.round(ny * 40) + "," + Math.round(nz * 40) + "|" + R.key + "|" + matKey(M);
  let c = SHADE.get(k);
  if (c === undefined) {
    c = shadeRaw(base, nx, ny, nz, R, M);
    if (SHADE.size > 6000) SHADE.clear();
    SHADE.set(k, c);
  }
  return c;
}
function shadeRaw(base, nx, ny, nz, R, M) {
  const B = parseColor(base);
  const d = nx * R.lx + ny * R.ly + nz * R.lz;
  const dif = Math.max(0, (d + M.wrap) / (1 + M.wrap));
  const ndh = Math.max(0, nx * R.hx + ny * R.hy + nz * R.hz);
  const sp = (M.spec ? Math.pow(ndh, M.shin) * M.spec : 0) * R.ki + (M.spec2 ? Math.pow(ndh, M.shin2) * M.spec2 * R.ki : 0);
  const term = M.sss ? dif * (1 - dif) * 4 * M.sss : 0; // subsurface: warm red bleed at the terminator
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const b = B[i] / 255;
    // shadows keep (even gain) saturation, as real dyed materials do: the base is raised to a power
    // that grows as the light falls off
    let c = Math.pow(b, 1 + 0.7 * (1 - dif)) * (R.amb[i] + R.col[i] * dif * R.ki);
    if (term) c += b * term * [0.34, 0.075, 0.03][i] + (1 - dif) * M.sss * [0.06, 0.012, 0.004][i];
    c += R.col[i] * sp;
    out[i] = Math.round(softClip(c) * 255);
  }
  return `rgb(${out[0]},${out[1]},${out[2]})`;
}

// cylinder shading across the axis a->b (width w): a linear gradient perpendicular to the axis.
// The 9 stop colours depend only on (base, axis direction, tilt, rig, material): cached, so a frame
// only pays for createLinearGradient + addColorStop.
const STOPS = new Map();
function matKey(M) { return M.key || (M.key = [M.wrap, M.spec, M.shin, M.sss, M.spec2 || 0, M.shin2 || 0].map((v) => +(+v).toFixed(3)).join(",")); }
function cylGrad(g, ax, ay, bx, by, w, base, R, M, tilt = 0) {
  let dx = bx - ax, dy = by - ay;
  const l = Math.hypot(dx, dy) || 1;
  dx /= l; dy /= l;
  const qa = Math.round((Math.atan2(dy, dx) / TAU) * 96);
  const key = base + "|" + qa + "|" + tilt + "|" + R.key + "|" + matKey(M);
  let stops = STOPS.get(key);
  const N = 9;
  if (!stops) {
    const a = (qa / 96) * TAU, cx = Math.cos(a), cy = Math.sin(a);
    const px = -cy, py = cx;
    stops = [];
    for (let k = 0; k < N; k++) {
      const s = -1 + (2 * k) / (N - 1);
      const sz = Math.sqrt(Math.max(0, 1 - s * s));
      // tilt leans the normal along the axis (e.g. -0.3 = surface faces a bit toward the axis start)
      const nx = px * s * 0.98 + cx * tilt, ny = py * s * 0.98 + cy * tilt, nz = sz;
      const nn = Math.hypot(nx, ny, nz) || 1;
      stops.push(shadeAt(base, nx / nn, ny / nn, nz / nn, R, M));
    }
    if (STOPS.size > 3000) STOPS.clear();
    STOPS.set(key, stops);
  }
  const px = -dy, py = dx;
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const gr = g.createLinearGradient(mx - px * w / 2, my - py * w / 2, mx + px * w / 2, my + py * w / 2);
  for (let k = 0; k < N; k++) gr.addColorStop(k / (N - 1), stops[k]);
  return gr;
}

// sphere shading of radius r at (cx, cy) (squash sy for ellipsoids)
function sphereGrad(g, cx, cy, r, base, R, M) {
  const l2 = Math.hypot(R.lx, R.ly) || 1;
  const ux = R.lx / l2, uy = R.ly / l2;
  const fx = cx + ux * r * 0.5 * (1 - Math.max(0, R.lz) * 0.5), fy = cy + uy * r * 0.5 * (1 - Math.max(0, R.lz) * 0.5);
  const gr = g.createRadialGradient(fx, fy, 0, cx, cy, r * 1.05);
  const N = 7;
  for (let k = 0; k < N; k++) {
    const q = k / (N - 1);
    const o = 0.5 - 1.5 * q;
    const nz = Math.sqrt(Math.max(0, 1 - o * o));
    gr.addColorStop(q, shadeAt(base, ux * o, uy * o, nz * 0.95 + 0.05, R, M));
  }
  return gr;
}

// a fabric fold: a soft dark trough, and a ridge beside it on the lit side (specular on glossy cloth)
function fold(g, pts, w, depth, base, R, M) {
  if (depth <= 0.1) return;
  const l2 = Math.hypot(R.lx, R.ly) || 1;
  const ux = R.lx / l2, uy = R.ly / l2;
  g.lineCap = "round";
  g.lineJoin = "round";
  const P = () => { const p = new Path2D(); spline(p, pts, false); return p; };
  const p = P();
  const a0 = g.globalAlpha;
  // a soft dark trough, then the lit ridge beside it (thin, softer)
  g.strokeStyle = shadeAt(base, -ux * 0.85, -uy * 0.85, 0.3, R, M);
  g.globalAlpha = a0 * clamp(depth * 0.45);
  g.lineWidth = w * 1.1;
  g.stroke(p);
  g.save();
  g.translate(ux * w * 0.6, uy * w * 0.6);
  g.globalAlpha = a0 * clamp(depth * 0.4);
  g.lineWidth = w * 0.55;
  g.strokeStyle = shadeAt(base, ux * 0.6, uy * 0.6, 0.6, R, M);
  g.stroke(p);
  g.restore();
  g.globalAlpha = a0;
}

// ================================================================================================
// cached micro-texture tiles (built once with ImageData; used as overlay patterns)
// ================================================================================================
const TILES = new Map();
function hash2(i, j, s) { return hash(i * 57.31 + j * 131.77, s); }
function vnoise(x, y, P, s) {
  // periodic value noise with period P lattice cells
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const m = (v) => ((v % P) + P) % P;
  const a = hash2(m(ix), m(iy), s), b = hash2(m(ix + 1), m(iy), s), c = hash2(m(ix), m(iy + 1), s), d = hash2(m(ix + 1), m(iy + 1), s);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
function tile(kind) {
  let c = TILES.get(kind);
  if (c) return c;
  const N = kind === "twill" ? 64 : 128;
  c = makeCanvas(N, N);
  const x = c.getContext("2d");
  if (!x || !x.createImageData) { TILES.set(kind, c); return c; }
  const img = x.createImageData(N, N);
  const d = img.data;
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      let v = 0.5;
      if (kind === "twill") {
        // 3/1 twill: diagonal ridges, slub (uneven yarn) streaks along the warp, fine fuzz
        const tw = Math.sin((TAU * (2 * px + py)) / 8);
        const slub = vnoise(px / 4, py / 32, 16, 3) - 0.5;
        const fz = vnoise(px / 2, py / 2, 32, 4) - 0.5;
        v = 0.5 + tw * 0.2 + slub * 0.45 + fz * 0.22;
      } else if (kind === "pvc") {
        const a = vnoise(px / 16, py / 16, 8, 5) - 0.5, b = vnoise(px / 5.3333, py / 5.3333, 24, 6) - 0.5;
        v = 0.5 + a * 0.35 + b * 0.25;
      } else if (kind === "skin") {
        const a = vnoise(px / 3.2, py / 3.2, 40, 7) - 0.5, b = vnoise(px / 12.8, py / 12.8, 10, 8) - 0.5;
        const pore = hash2(px, py, 9) > 0.965 ? -0.35 : 0;
        v = 0.5 + a * 0.3 + b * 0.25 + pore;
      } else {
        v = 0.5 + (vnoise(px / 16, py / 16, 8, 1) - 0.5) * 0.6 + (vnoise(px / 4, py / 4, 32, 2) - 0.5) * 0.4;
      }
      const k = (py * N + px) * 4;
      const g8 = Math.round(clamp(v) * 255);
      d[k] = d[k + 1] = d[k + 2] = g8;
      d[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  TILES.set(kind, c);
  return c;
}
const PATS = new WeakMap();
function pattern(g, kind) {
  let m = PATS.get(g);
  if (!m) { m = new Map(); PATS.set(g, m); }
  let p = m.get(kind);
  if (p === undefined) {
    try { p = g.createPattern(tile(kind), "repeat"); } catch { p = null; }
    m.set(kind, p);
  }
  return p;
}
const HAS_DOMMATRIX = typeof DOMMatrix !== "undefined";
function texFill(g, path, kind, scale, alpha, mode = "overlay", rot = 0) {
  if (alpha <= 0.01 || !HAS_DOMMATRIX) return;
  const p = pattern(g, kind);
  if (!p || !p.setTransform) return;
  p.setTransform(new DOMMatrix().rotateSelf(0, 0, rot).scaleSelf(scale, scale));
  g.save();
  g.globalCompositeOperation = mode;
  g.globalAlpha *= alpha;
  g.fillStyle = p;
  g.fill(path);
  g.restore();
}

// ================================================================================================
// flashlight beam (volumetric)
// ================================================================================================
// cone sprite: x 0..1 along the beam, y across; angular coordinate q = y/(x*tanHalf) with the sprite's
// half height covering q = 1.45. Intensity = (hot core + reflector body + spill halo) x air falloff.
const CONE_W = 256, CONE_H = 160, CONE_Q = 1.45;
let CONE = null;
const CONE_TINT = new Map();
function coneSprite() {
  if (CONE) return CONE;
  CONE = makeCanvas(CONE_W, CONE_H);
  const x = CONE.getContext("2d");
  if (!x || !x.createImageData) return CONE;
  const img = x.createImageData(CONE_W, CONE_H);
  const d = img.data;
  for (let py = 0; py < CONE_H; py++) {
    for (let px = 0; px < CONE_W; px++) {
      const xn = (px + 0.5) / CONE_W;
      const yn = ((py + 0.5) / CONE_H) * 2 - 1;
      const q = Math.abs((yn * CONE_Q) / xn);
      const hot = Math.exp(-(q / 0.42) * (q / 0.42));
      const body = 1 - smooth((q - 0.78) / 0.26);
      const halo = Math.max(0, 1 - q / CONE_Q) * 0.22;
      const prof = hot * 0.62 + body * 0.3 + halo * 0.5;
      const air = Math.pow(1 - xn, 1.35) * (1 / (1 + xn * 2.2)) * smooth(xn / 0.06);
      const n = 0.82 + 0.18 * vnoise(px / 24, py / 12, 1000, 11) + 0.08 * (vnoise(px / 6, py / 4, 1000, 12) - 0.5);
      const v = clamp(prof * air * n * 1.25);
      const k = (py * CONE_W + px) * 4;
      d[k] = d[k + 1] = d[k + 2] = 255;
      d[k + 3] = Math.round(v * 255);
    }
  }
  x.putImageData(img, 0, 0);
  return CONE;
}
function tintedCone(color) {
  let c = CONE_TINT.get(color);
  if (c) return c;
  const base = coneSprite();
  c = makeCanvas(CONE_W, CONE_H);
  const x = c.getContext("2d");
  x.drawImage(base, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = mix(color, "#ffffff", 0.15);
  x.fillRect(0, 0, CONE_W, CONE_H);
  if (CONE_TINT.size > 24) CONE_TINT.clear();
  CONE_TINT.set(color, c);
  return c;
}

export function flashlightBeam(g, x, y, angle, len = 400, o = {}) {
  if (!(len > 0)) return;
  const spread = o.spread == null ? 0.32 : o.spread;
  const color = o.color || "#fff3d0";
  const a = o.alpha == null ? 0.18 : o.alpha;
  const tanH = Math.tan(Math.min(1.3, spread / 2));
  g.save();
  g.globalCompositeOperation = "lighter";
  g.translate(x, y);
  g.rotate(angle);
  // the cone, twice: a wide soft pass and a tighter brighter core (gives the reflector "hot spot")
  const cone = tintedCone(color);
  const half = len * tanH * CONE_Q;
  g.globalAlpha *= clamp(a * 3.4, 0, 1);
  g.drawImage(cone, 0, -half, len, half * 2);
  g.globalAlpha = clamp(a * 1.6, 0, 1) * (o.alpha0 == null ? 1 : o.alpha0);
  g.drawImage(cone, 0, -half * 0.55, len * 0.85, half * 1.1);
  g.restore();
  // dust motes drifting through the beam, lit only where the cone is (scattering)
  const dustN = o.dust == null ? 26 : o.dust;
  if (dustN > 0 && a > 0.03) {
    const t = o.t || 0;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const gs = glowSpriteFor(color);
    const prevA = g.globalAlpha, prevM = g.globalCompositeOperation;
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < dustN; i++) {
      const s = (hash(i, 31) + t * (0.012 + hash(i, 32) * 0.02)) % 1;
      const along = 0.08 + s * 0.8;
      const q = (hash(i, 33) * 2 - 1) * 0.95 + Math.sin(t * (0.4 + hash(i, 34)) + i) * 0.06;
      const prof = Math.exp(-(q / 0.5) * (q / 0.5)) * 0.8 + 0.2 * (Math.abs(q) < 0.9 ? 1 : 0);
      const tw = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * (2 + hash(i, 35) * 4) + i * 7.1), 3);
      const b = prof * tw * (1 - along) * a * 5;
      if (b < 0.03) continue;
      const lx = along * len, ly = q * along * len * tanH;
      const px = x + lx * ca - ly * sa, py = y + lx * sa + ly * ca;
      const r = 0.6 + hash(i, 36) * 1.3 + along * 1.2;
      g.globalAlpha = prevA * clamp(b);
      g.drawImage(gs, px - r * 2, py - r * 2, r * 4, r * 4);
    }
    g.globalAlpha = prevA;
    g.globalCompositeOperation = prevM;
  }
  // the lens: a white-hot core with halation, and a faint wide bloom in the beam colour
  if (o.source !== false) {
    glow(g, x, y, Math.max(3, len * 0.035), "#ffffff", 0.95);
    glow(g, x, y, Math.max(8, len * 0.11), color, 0.35);
    glow(g, x, y, Math.max(14, len * 0.22), mix(color, "#ff9a50", 0.3), 0.12);
  }
  if (o.hot !== false) {
    const hx = x + Math.cos(angle) * len * 0.3, hy = y + Math.sin(angle) * len * 0.3;
    glow(g, hx, hy, len * 0.1, color, 0.12);
  }
}
function glowSpriteFor(color) {
  return sprite("ppl:mote:" + color, 16, 16, (g) => {
    const gr = g.createRadialGradient(8, 8, 0, 8, 8, 8);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, rgba(color, 0.7));
    gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 16, 16);
  });
}

// ================================================================================================
// hair (cached sprite per view / colour / light bucket / size bucket)
// ================================================================================================
// Head-local units: head centre (0, 0), skull rx 6.9, ry 8.1 (side view rx 7.2, ry 8).
function hairOutline(view, R) {
  const pts = [];
  if (view === "side") {
    // facing +x: the fringe over the forehead, over the crown, down the back to the nape tufts,
    // then the hairline behind the ear and the sideburn
    // the head is turned a little away: hair covers everything but a sliver of cheek and jaw at the front
    // (shaggy side hair falls over the temple and cheek; only the jaw line shows below it)
    pts.push(7.5, -0.6, 8.1, -5.6, 5.9, -9.4, 1.5, -10.4, -3.0, -9.8, -6.8, -7.2, -8.6, -3.0, -8.8, 1.5, -7.8, 5.0,
      -6.3, 7.3, -4.5, 8.0, -2.7, 7.1, -0.7, 7.5, 1.0, 6.6, 2.5, 5.3, 4.0, 4.3, 5.4, 4.1, 6.4, 3.0, 7.2, 2.0);
  } else {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 1.0 + (i / (n - 1)) * Math.PI;
      const rr = 1 + (R() - 0.5) * 0.05;
      pts.push(Math.cos(a) * 8.1 * rr, Math.sin(a) * 9.4 * rr - 0.2);
    }
    pts.push(8.0, 2.4, 7.2, 4.6, 5.8, 5.6, 4.5, 6.8, 2.8, 6.4, 1.2, 7.6, -0.6, 6.7, -2.4, 7.5, -4.0, 6.3, -5.9, 5.8, -7.3, 4.4, -8.0, 2.2);
  }
  return pts;
}
function paintHair(g, k, view, base, wet, ldir) {
  g.scale(k, k);
  g.translate(12, 13);
  const R = rng("hair:" + view);
  const lx = Math.cos(ldir), ly = Math.sin(ldir);
  const Rg = { lx: lx * 0.8, ly: ly * 0.8, lz: 0.6, col: [1, 1, 1], amb: [0.4, 0.42, 0.46], ki: 0.85, hx: 0, hy: 0, hz: 1 };
  { const hx = Rg.lx, hy = Rg.ly, hz = Rg.lz + 1, hn = Math.hypot(hx, hy, hz); Rg.hx = hx / hn; Rg.hy = hy / hn; Rg.hz = hz / hn; }
  const M = { wrap: 0.35, spec: 0.22 + wet * 0.35, shin: 18 + wet * 20, sss: 0 };
  const out = new Path2D();
  spline(out, hairOutline(view, R), true, 1);
  // under-layer (dark), so gaps between strands read as depth not holes; a soft (blurred) edge,
  // since a hair silhouette is never a cut-out
  const blurOk = typeof g.filter === "string";
  if (blurOk) g.filter = `blur(${qblur(Math.max(0.5, 0.35 * k * pixelScale()).toFixed(2))}px)`;
  g.fillStyle = shade(base, -0.35);
  g.fill(out);
  if (blurOk) g.filter = "none";
  g.save();
  g.clip(out);
  const crown = view === "side" ? [-2.6, -6.2] : [1.0, -4.2];
  const rx = view === "side" ? 8.6 : 8.2, ry = view === "side" ? 9.8 : 9.6;
  // volume: sphere shade
  const sg = g.createRadialGradient(lx * 4, ly * 4 - 1, 0.5, 0, 0, 11);
  sg.addColorStop(0, shadeAt(base, lx * 0.5, ly * 0.5, 0.7, Rg, M));
  sg.addColorStop(0.55, shadeAt(base, 0, 0, 1, Rg, M));
  sg.addColorStop(1, shadeAt(base, -lx * 0.8, -ly * 0.8, 0.3, Rg, M));
  g.globalAlpha = 0.9;
  g.fillStyle = sg;
  g.fill(out);
  g.globalAlpha = 1;
  // strands: integrate a flow field (outward from the crown whorl, pulled down by gravity, wrapped
  // round the skull) and stroke each strand in 3 pieces coloured by the lighting at that point
  const strand = (lwid, n, alphaBase, light, clumpy) => {
    for (let i = 0; i < n; i++) {
      const th = R() * TAU;
      const r0 = R() * (clumpy ? 1.5 : 3.2);
      let px = crown[0] + Math.cos(th) * r0, py = crown[1] + Math.sin(th) * r0;
      let dx = Math.cos(th + 0.35), dy = Math.sin(th + 0.35);
      const pts = [px, py];
      const steps = 22 + Math.floor(R() * 14);
      const wph = R() * TAU, wamp = 0.03 + R() * 0.05;
      for (let s = 0; s < steps; s++) {
        const ox = px - crown[0], oy = py - crown[1];
        const ol = Math.hypot(ox, oy) || 1;
        // outward from the whorl with a swirl near it, gravity takes over further out, a gentle wave
        const sw = Math.exp(-ol / 2.5) * 0.35;
        dx += (ox / ol) * 0.09 - (oy / ol) * sw + (view === "side" ? 0.02 : 0) + Math.sin(s * 0.45 + wph) * wamp * (-dy);
        dy += (oy / ol) * 0.06 + (ox / ol) * sw + 0.11 * clamp(ol / 4) + Math.sin(s * 0.45 + wph) * wamp * dx;
        const dl = Math.hypot(dx, dy) || 1;
        dx /= dl; dy /= dl;
        px += dx * 0.55; py += dy * 0.55;
        pts.push(px, py);
        if ((px / rx) * (px / rx) + (py / ry) * (py / ry) > 1.05 || py > 8) break;
      }
      const m = pts.length / 2;
      if (m < 3) continue;
      const tone = (R() - 0.5) * 0.35;
      for (let pc = 0; pc < 3; pc++) {
        const a0 = Math.floor((pc * (m - 1)) / 3), a1 = Math.floor(((pc + 1) * (m - 1)) / 3);
        if (a1 <= a0) continue;
        const mx = pts[((a0 + a1) >> 1) * 2], my = pts[((a0 + a1) >> 1) * 2 + 1];
        const nx = mx / rx, ny = my / ry;
        const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
        let col = shadeAt(base, nx, ny, nz, Rg, M);
        if (light) {
          // anisotropic sheen: a band across the strands where the surface faces the half vector
          const band = Math.exp(-Math.pow((nx * lx + ny * ly - 0.35) / 0.22, 2));
          col = mix(col, "#fff4e0", band * (0.35 + wet * 0.25));
        }
        col = tone > 0 ? mix(col, "#ffffff", tone * 0.4) : mix(col, "#000000", -tone * 0.6);
        g.strokeStyle = col;
        g.globalAlpha = alphaBase;
        g.lineWidth = lwid * (1 - pc * 0.22);
        g.beginPath();
        g.moveTo(pts[a0 * 2], pts[a0 * 2 + 1]);
        for (let j = a0 + 1; j <= a1; j++) g.lineTo(pts[j * 2], pts[j * 2 + 1]);
        g.stroke();
      }
    }
  };
  g.lineCap = "round";
  g.lineJoin = "round";
  strand(1.1 + wet * 0.5, 30, 0.35, false, true); // clumps
  strand(0.3, 170, 0.55, true, false); // mid strands
  strand(0.16, 260, 0.7, true, false); // fine strands with sheen
  // ambient occlusion toward the nape and under the crown rim
  const ao = g.createLinearGradient(0, 2, 0, 9);
  ao.addColorStop(0, "rgba(0,0,0,0)");
  ao.addColorStop(1, "rgba(0,0,0,0.35)");
  g.fillStyle = ao;
  g.globalAlpha = 1;
  g.fillRect(-12, 2, 24, 8);
  g.restore();
  // fly-aways leaving the silhouette (backlit they glow, see rim)
  // (only when the head is big enough on screen for single hairs to resolve)
  const flyA = clamp((k * pixelScale() - 3) / 8) * 0.45;
  g.strokeStyle = rgba(shade(base, 0.25), flyA);
  g.lineWidth = 0.12;
  for (let i = 0; i < (flyA > 0.01 ? 18 : 0); i++) {
    const a = Math.PI * (1.05 + R() * 0.95);
    const sx = Math.cos(a) * 7.6, sy = Math.sin(a) * 8.9;
    g.beginPath();
    g.moveTo(sx, sy);
    g.quadraticCurveTo(sx + Math.cos(a + 0.5) * 1.6, sy + Math.sin(a + 0.5) * 1.6, sx + Math.cos(a + 0.9) * (2 + R() * 1.6), sy + Math.sin(a + 0.9) * (2 + R() * 1.4) + 0.6);
    g.stroke();
  }
}
function hairSprite(view, base, wet, R, u) {
  // light direction bucket (16 dirs) and a size bucket (~19% steps) keep the cache small
  const ang = Math.atan2(R.ly, R.lx);
  const bucket = Math.round((ang / TAU) * 16);
  const ldir = (bucket / 16) * TAU;
  const k = Math.pow(2, Math.round(Math.log2(Math.max(0.3, u * pixelScale())) * 4) / 4) / pixelScale();
  const wb = Math.round(wet * 3) / 3;
  return sprite(`ppl:hair:${view}:${base}:${wb}:${bucket}`, 24 * k, 26 * k, (gg, w) => paintHair(gg, w / 24, view, base, wb, ldir));
}

// rain-bead tile per light direction bucket (8): 128 px, ~40 beads, used as a repeating pattern
const BEADS = new Map();
function beadPattern(g, bucket) {
  let m = PATS.get(g);
  if (!m) { m = new Map(); PATS.set(g, m); }
  const key = "beads" + bucket;
  let p = m.get(key);
  if (p !== undefined) return p;
  let c = BEADS.get(bucket);
  if (!c) {
    c = makeCanvas(128, 128);
    const x = c.getContext("2d");
    const a = (bucket / 8) * TAU, gx = Math.cos(a), gy = Math.sin(a);
    const R = rng("beads");
    for (let i = 0; i < 42; i++) {
      const r = 1.6 + R() * 2.8, bx = R() * 128, by = R() * 128;
      for (const [ox, oy] of [[0, 0], [128, 0], [-128, 0], [0, 128], [0, -128]]) {
        const X = bx + ox, Y = by + oy;
        if (X < -8 || X > 136 || Y < -8 || Y > 136) continue;
        x.fillStyle = "rgba(60,36,0,0.3)";
        x.beginPath(); x.ellipse(X - gx * r * 0.3, Y - gy * r * 0.3 + r * 0.2, r, r * 1.08, 0, 0, TAU); x.fill();
        x.fillStyle = "rgba(255,255,240,0.2)";
        x.beginPath(); x.arc(X - gx * r * 0.4, Y - gy * r * 0.4 + r * 0.45, r * 0.55, 0, TAU); x.fill();
        x.fillStyle = "rgba(255,255,255,0.9)";
        x.beginPath(); x.arc(X + gx * r * 0.35, Y + gy * r * 0.35 - r * 0.15, r * 0.28, 0, TAU); x.fill();
      }
    }
    BEADS.set(bucket, c);
  }
  try { p = g.createPattern(c, "repeat"); } catch { p = null; }
  m.set(key, p);
  return p;
}

// ================================================================================================
// drawPerson
// ================================================================================================
export function drawPerson(g, x, y, h, opts = {}) {
  if (!(h > 0)) return;
  const o = Object.assign({ view: "back", facing: 1, shadow: true }, opts);
  const C = Object.assign({}, KID, o.colors || {});
  if (o.coat) C.coat = o.coat;
  if (o.pants) C.pants = o.pants;
  if (o.boots) C.boots = o.boots;
  if (o.hair) C.hair = o.hair;
  if (o.skin) C.skin = o.skin;
  const wet = clamp(o.wet || 0);
  // wet PVC goes darker + more saturated; wet denim and hair go much darker
  if (wet) { C.coat = mix(C.coat, "#a8740a", wet * 0.22); C.pants = mix(C.pants, "#0a0d16", wet * 0.4); C.hair = mix(C.hair, "#140a04", wet * 0.45); }
  const u = h / 100;
  const side = o.view === "side";
  const f = side ? (o.facing === -1 ? -1 : 1) : 1;
  const ph = o.phase || 0;
  const moving = !!(o.walk || o.run);
  const run = !!o.run;
  const crouch = clamp(o.crouch || 0);
  const t = o.t || 0;
  const scr = h * pixelScale();
  const detail = o.detail == null ? (scr < 70 ? 0 : scr < 180 ? 1 : 2) : o.detail;
  const R = makeRig(o.light, o.light ? (o.light.x - x) * f : 0, o.light ? o.light.y - (y - h * 0.6) : 0, o.ambient);
  const Mpvc = { wrap: MAT.pvc.wrap, spec: MAT.pvc.spec + wet * 0.4, shin: MAT.pvc.shin + wet * 24, sss: 0, spec2: MAT.pvc.spec2 + wet * 0.08, shin2: MAT.pvc.shin2 };
  const Mden = { wrap: MAT.denim.wrap, spec: MAT.denim.spec + wet * 0.12, shin: 8 + wet * 10, sss: 0 };
  const Mrub = MAT.rubber, Mskin = MAT.skin;
  const lw = clamp(1.1 / u, 0.12, 0.9);

  // ---- contact + cast shadows (screen space, before the transform) ----
  if (o.shadow) {
    g.save();
    if (o.alpha != null) g.globalAlpha *= clamp(o.alpha);
    const sg = g.createRadialGradient(x, y, 0, x, y, h * 0.24);
    sg.addColorStop(0, "rgba(0,0,0,0.42)");
    sg.addColorStop(0.45, "rgba(0,0,0,0.2)");
    sg.addColorStop(1, "rgba(0,0,0,0)");
    g.translate(x, y);
    g.scale(1, 0.17);
    g.translate(-x, -y);
    g.fillStyle = sg;
    g.beginPath();
    g.arc(x, y, h * 0.24, 0, TAU);
    g.fill();
    // a long soft cast shadow away from the key light
    if (o.light && R.rim > 0.2) {
      const dx = -R.lx * f, cast = h * 0.35 * clamp(Math.abs(dx) + 0.2, 0, 1);
      const cg = g.createRadialGradient(x + dx * cast, y, 0, x + dx * cast, y, cast);
      cg.addColorStop(0, `rgba(0,0,0,${0.16 * Math.min(1, R.rim)})`);
      cg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = cg;
      g.beginPath();
      g.arc(x + dx * cast, y, cast, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  g.save();
  if (o.alpha != null) g.globalAlpha *= clamp(o.alpha);
  g.translate(x, y);
  g.scale(f * u, u);

  // ---- body rhythm: gait bob, pelvis sway (weight over the stance leg), idle breathing ----
  const cyc = ph * TAU;
  const breath = moving || o.breathe === false ? 0 : Math.sin(t * TAU * 0.26);
  const idle = moving ? 0 : Math.sin(t * 0.55 + 1.3) * (o.sway == null ? 1 : o.sway);
  const bob = moving ? -Math.abs(Math.sin(cyc)) * (run ? 3 : 1.4) : 0;
  const sway = side ? 0 : moving ? Math.sin(cyc) * (run ? 0.7 : 1.1) : idle * 0.45;
  const dip = crouch * 18;
  // sitting on the ground / kneeling on one knee: the whole upper body drops onto the hips
  const sit = clamp(o.sit || 0), kneel = clamp(o.kneel || 0) * (1 - sit);
  const low = sit * 33 + kneel * 16;
  const hipY = -47 + bob + dip + low;
  const shY = -79.5 + bob + dip * 0.92 + low - breath * 0.3;
  const shTilt = side ? 0 : moving ? Math.sin(cyc) * 0.9 : idle * 0.25;
  const lean = (run ? 0.18 : moving ? 0.05 : 0) + crouch * 0.25 + sit * 0.12 + kneel * 0.06;
  const leanX = (yy) => (side ? (hipY - yy) * Math.tan(lean) : 0);
  const xo = (yy) => (side ? leanX(yy) : lerp(sway, sway * 0.35, clamp((hipY - yy) / (hipY - shY))));
  const sculpt = [];

  // ================= legs =================
  const legs = [];
  if (side) {
    const stride = run ? 24 : 13;
    for (const s of [0, 0.5]) {
      const p = ((ph + s) % 1 + 1) % 1;
      const swing = p > 0.5;
      const q = swing ? (p - 0.5) * 2 : p * 2;
      const fx = moving ? (swing ? lerp(-stride, stride, smooth(q)) : lerp(stride, -stride, q)) : (s ? 3 : -3) + crouch * (s ? 4 : -2);
      const lift = moving && swing ? Math.sin(Math.PI * q) * (run ? 14 : 7) : 0;
      // foot roll: heel peels off late in stance, toe lifts before heel strike
      const footA = !moving ? 0 : swing ? 0.3 * (1 - q) - 0.18 * smooth(q) : smooth((q - 0.55) / 0.45) * (run ? 0.6 : 0.42);
      const hip = [leanX(hipY) * 0, hipY];
      const ankle = [fx, -4.2 - lift - Math.max(0, Math.sin(footA)) * 9];
      const k1 = ik(hip[0], hip[1], ankle[0], ankle[1], 23, 22.5, -1);
      const k2 = ik(hip[0], hip[1], ankle[0], ankle[1], 23, 22.5, 1);
      legs.push({ far: s === 0.5, hip, knee: k2[0] > k1[0] ? k2 : k1, ankle, footA, lift });
    }
  } else {
    for (const s of [-1, 1]) {
      const p = ((ph + (s > 0 ? 0.5 : 0)) % 1 + 1) % 1;
      const sw = Math.sin(p * TAU);
      const lift = moving ? Math.max(0, sw) * (run ? 12 : 4.5) : 0;
      const stance = moving ? Math.max(0, -sw) : 0.5 + idle * s * 0.5;
      const hip = [s * 4.8 + sway, hipY + (moving ? sw * 0.6 : -idle * s * 0.4)];
      const ankle = [s * (5.0 + crouch * 1.2) + sway * 0.25 - s * lift * 0.06, -3.6 - lift + dip * 0.08];
      const knee = [s * (5.1 + crouch * 5.5) + sway * 0.55, lerp(hip[1], ankle[1], 0.5) + lift * 0.35 - crouch * 3];
      legs.push({ far: false, hip, knee, ankle, s, lift, stance });
    }
  }
  // pose blends toward sitting (knees up, arms round them) / kneeling (one knee down, one foot planted)
  if (sit > 0 || kneel > 0) {
    const L = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
    for (const lg of legs) {
      let tk, ta, fa = 0, k = sit > 0 ? sit : kneel;
      if (side) {
        if (sit > 0) { tk = lg.far ? [13, hipY - 8] : [14.5, hipY - 9.5]; ta = lg.far ? [14, -3.6] : [17, -3.6]; }
        else if (!lg.far) { tk = [4, -3.4]; ta = [-11.5, -11.5]; fa = 1.5; } // toes tucked under
        else { tk = [11.5, hipY + 7 - 23]; ta = [12.5, -3.6]; }
      } else {
        const sd = lg.s;
        if (sit > 0) { tk = [sd * 8.5, hipY - 1]; ta = [sd * 9, hipY + 3]; lg.hidden = sit > 0.55; }
        else if (sd === 1) { tk = [sd * 5.6, -3.4]; ta = [sd * 5.4, -1.2]; lg.endOn = k; }
        else { tk = [sd * 7.2, hipY - 2]; ta = [sd * 7.4, -3.6]; }
      }
      lg.hip = L(lg.hip, [lg.hip[0], hipY], k);
      lg.knee = L(lg.knee, tk, k);
      lg.ankle = L(lg.ankle, ta, k);
      if (side) lg.footA = lerp(lg.footA || 0, fa, k);
    }
  }
  // the jeans: thigh + shin as two shaded denim tubes (knee joint hidden under the shin's round cap),
  // twill texture, the knee crease / "honeycomb" behind the knee, stacking above the boot
  const drawLeg = (lg) => {
    if (lg.hidden) return;
    const k = lg.far ? 0.28 : 0;
    const pc = k ? mix(C.pants, "#000", k) : C.pants;
    const bc = k ? mix(C.boots, "#000", k) : C.boots;
    const bootTop = side ? lg.ankle[1] - 12 : lg.ankle[1] - 13;
    const thighW = side ? 11 : 9.4, kneeW = side ? 9.2 : 8.0, ankW = side ? 8.6 : 7.4;
    const p1 = new Path2D();
    tube(p1, [lg.hip[0], lg.hip[1] - 2, (lg.hip[0] + lg.knee[0]) / 2, (lg.hip[1] + lg.knee[1]) / 2, lg.knee[0], lg.knee[1]], [thighW + 1.4, thighW, kneeW], 4, true, true);
    g.fillStyle = cylGrad(g, lg.hip[0], lg.hip[1], lg.knee[0], lg.knee[1], thighW + 1, pc, R, Mden);
    g.fill(p1);
    // the shin runs into the boot shaft, wherever the rotation of the foot points it
    const fa0 = side ? lg.footA || 0 : 0, sh0 = lg.ankle[1] - bootTop - 1;
    const kneeEnd = side
      ? [lg.ankle[0] + Math.sin(fa0) * sh0, lg.ankle[1] - Math.cos(fa0) * sh0]
      : [lerp(lg.knee[0], lg.ankle[0], 0.9), lerp(lg.knee[1], bootTop + 1, 0.95)];
    const p2 = new Path2D();
    tube(p2, [lg.knee[0], lg.knee[1] - 1, kneeEnd[0], kneeEnd[1]], [kneeW, ankW], 3, true, true);
    g.fillStyle = cylGrad(g, lg.knee[0], lg.knee[1], kneeEnd[0], kneeEnd[1], kneeW, pc, R, Mden);
    g.fill(p2);
    const legP = new Path2D();
    legP.addPath(p1);
    legP.addPath(p2);
    if (detail >= 1) {
      texFill(g, legP, "twill", 0.055, detail === 2 ? 0.55 : 0.35, "overlay");
      g.save();
      g.clip(legP);
      // faded "whiskers" at the hip / lighter wear down the front of the thigh, darker inseam
      const wg = g.createLinearGradient(lg.hip[0] - 6, 0, lg.hip[0] + 6, 0);
      wg.addColorStop(0, "rgba(0,0,0,0.18)");
      wg.addColorStop(0.5, rgba(shade(C.pants, 0.5), 0.12));
      wg.addColorStop(1, "rgba(0,0,0,0.05)");
      g.fillStyle = wg;
      g.fillRect(lg.hip[0] - 8, lg.hip[1] - 2, 16, lg.knee[1] - lg.hip[1] + 4);
      // knee: compression folds driven by the bend angle
      const ax = lg.hip[0] - lg.knee[0], ay = lg.hip[1] - lg.knee[1], bx = lg.ankle[0] - lg.knee[0], by = lg.ankle[1] - lg.knee[1];
      const bend = clamp(1 - (-(ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1) + 1) / 2 * 2 + 0.25);
      const kx = lg.knee[0], ky = lg.knee[1];
      const nf = 1 + Math.round(bend);
      for (let i = 0; i < nf; i++) {
        const yy = ky - 4 + i * 2.6;
        fold(g, [kx - 4, yy + 0.8, kx - 0.5, yy - 0.6 - bend * 0.8, kx + 4, yy + 0.6], 1.3, 0.25 + bend * 0.45, pc, R, Mden);
      }
      // stacking: the jeans bunch where they're tucked into the boot
      for (let i = 0; i < 2; i++) {
        const yy = bootTop - 1.2 - i * 2.4;
        const xx = lerp(lg.knee[0], lg.ankle[0], 0.85);
        fold(g, [xx - 3.8, yy + 0.4 * (i % 2 ? 1 : -1), xx, yy - 0.8, xx + 3.8, yy + 0.3], 1.1, 0.45, pc, R, Mden);
      }
      // outseam with its paler topstitch
      g.strokeStyle = rgba(shade(C.pants, 0.35), 0.35);
      g.lineWidth = lw * 0.8;
      g.setLineDash && g.setLineDash([0.9, 0.6]);
      const sx = side ? 0 : (lg.s || 1) * 3.6;
      g.beginPath();
      g.moveTo(lg.hip[0] + sx, lg.hip[1] + 2);
      g.lineTo(lg.knee[0] + sx * 0.9, lg.knee[1]);
      g.lineTo(kneeEnd[0] + sx * 0.85, kneeEnd[1] - 2);
      g.stroke();
      g.setLineDash && g.setLineDash([]);
      // wet: the lower legs soak up the rain (darker) with a soft tide line
      if (wet > 0.05) {
        const wg2 = g.createLinearGradient(0, lg.knee[1] - 6, 0, bootTop);
        wg2.addColorStop(0, "rgba(4,6,14,0)");
        wg2.addColorStop(0.4, `rgba(4,6,14,${0.35 * wet})`);
        wg2.addColorStop(1, `rgba(4,6,14,${0.5 * wet})`);
        g.fillStyle = wg2;
        g.fillRect(lg.knee[0] - 8, lg.knee[1] - 6, 16, bootTop - lg.knee[1] + 8);
      }
      g.restore();
    }
    sculpt.push(p1, p2);
    drawBoot(lg, bootTop, bc, k);
  };
  // rubber rain boot: tall shaft with a rolled top rim and a pull tab, glossy rubber specular, a dark
  // sole with tread showing when the foot lifts, a back seam, scuffs
  const drawBoot = (lg, bootTop, bc, k) => {
    const ax = lg.ankle[0], ay = lg.ankle[1];
    const b = new Path2D();
    if (side) {
      g.save();
      g.translate(ax, ay);
      g.rotate(lg.footA || 0);
      const top = bootTop - ay;
      spline(b, [-4.6, top, 0, top - 0.6, 4.6, top + 0.2, 4.4, -3.6, 6.4, -1.2, 10.4, 0.0, 12.6, 1.3, 12.6, 3.0, 11.0, 3.7, 2.0, 3.7, -5.4, 3.7, -5.6, 1.5, -5.2, -4.0], true, 0.9);
      g.fillStyle = cylGrad(g, 0, top, 0, 3.7, 11, bc, R, Mrub, 0);
      g.fill(b);
      g.save();
      g.clip(b);
      // the foot box reads as a separate volume: a soft highlight on the toe cap + shadow at the instep
      const tg = g.createRadialGradient(9.5 + R.lx * 1.5, 0.5 + R.ly * 1.5, 0.2, 9.5, 1, 5);
      tg.addColorStop(0, rgba(shadeAt(bc, R.lx * 0.6, R.ly * 0.6, 0.7, R, Mrub), 0.9));
      tg.addColorStop(1, rgba(bc, 0));
      g.fillStyle = tg;
      g.fillRect(4, -4, 10, 8);
      // the sole + tread
      g.fillStyle = "#17110f";
      g.fillRect(-6, 2.2, 20, 2);
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.fillRect(-6, 2.1, 20, 0.35);
      // rolled top rim
      g.fillStyle = rgba(shadeAt(bc, 0, -0.8, 0.6, R, Mrub), 0.95);
      g.fillRect(-5, top - 0.4, 10, 1.6);
      g.restore();
      // a sharp rubber glint down the shaft
      g.strokeStyle = `rgba(255,255,255,${0.22 + wet * 0.3})`;
      g.lineWidth = lw * 1.2;
      g.beginPath();
      g.moveTo(-2.2 + R.lx * 2, top + 1.5);
      g.lineTo(-2.0 + R.lx * 2, -4.5);
      g.stroke();
      g.restore();
      const bw = new Path2D();
      bw.addPath(b, DOMMatrixSafe(ax, ay, lg.footA || 0));
      sculpt.push(bw);
      // contact shadow under the sole (tight, dark), fades as the foot lifts
      if (o.shadow !== false) {
        const cl = clamp(1 - (lg.lift || 0) / 6);
        if (cl > 0.02) { g.fillStyle = `rgba(0,0,0,${0.5 * cl})`; g.beginPath(); g.ellipse(ax + 3.5, -0.2, 9, 1.1, 0, 0, TAU); g.fill(); }
      }
    } else {
      const top = lg.endOn ? lerp(bootTop, ay - 6, lg.endOn) : bootTop;
      const sole = Math.max(lg.lift ? clamp(lg.lift / 4.5) : 0, lg.endOn || 0);
      // from behind: shaft slightly flared at the top, the heel rounded out, sole underneath
      spline(b, [ax - 4.8, top, ax, top - 0.7, ax + 4.8, top, ax + 4.3, ay - 6, ax + 4.6, ay - 1.5, ax + 3.6, ay + 0.8, ax, ay + 1.4, ax - 3.6, ay + 0.8, ax - 4.6, ay - 1.5, ax - 4.3, ay - 6], true, 0.9);
      g.fillStyle = cylGrad(g, ax, top, ax, ay, 9.8, bc, R, Mrub);
      g.fill(b);
      g.save();
      g.clip(b);
      // heel counter: a second, slightly raised rubber panel round the heel
      const hp = new Path2D();
      spline(hp, [ax - 4.7, ay - 5.2, ax, ay - 6.6, ax + 4.7, ay - 5.2, ax + 4, ay + 1, ax - 4, ay + 1], true);
      g.fillStyle = rgba(shade(bc, -0.25), 0.35);
      g.fill(hp);
      g.strokeStyle = rgba(shadeAt(bc, 0, -1, 0.3, R, Mrub), 0.6);
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(ax - 4.5, ay - 5.3);
      g.quadraticCurveTo(ax, ay - 6.8, ax + 4.5, ay - 5.3);
      g.stroke();
      // back seam + pull tab
      g.strokeStyle = rgba(shade(bc, -0.5), 0.5);
      g.lineWidth = lw * 0.8;
      g.beginPath();
      g.moveTo(ax, top + 1.2);
      g.lineTo(ax, ay - 6.4);
      g.stroke();
      g.fillStyle = shade(bc, -0.3);
      g.fillRect(ax - 0.9, top - 1.6, 1.8, 3.2);
      // the sole seen as the heel kicks up toward the camera
      if (sole > 0.05) {
        g.fillStyle = `rgba(20,14,12,${0.95 * sole})`;
        g.beginPath();
        g.ellipse(ax, ay + 1.2 - sole * 2.8, 4.6, sole * 3.6, 0, 0, TAU);
        g.fill();
        g.strokeStyle = `rgba(80,70,64,${0.6 * sole})`;
        g.lineWidth = lw * 0.7;
        g.beginPath();
        for (let i = -2; i <= 2; i++) { g.moveTo(ax - 3.4, ay + 1.2 - sole * 2.8 + i * sole * 1.1); g.lineTo(ax + 3.4, ay + 1.2 - sole * 2.8 + i * sole * 1.1); }
        g.stroke();
      }
      // rolled rim at the top of the shaft
      g.fillStyle = rgba(shadeAt(bc, 0, -0.9, 0.4, R, Mrub), 0.9);
      g.beginPath();
      g.ellipse(ax, top + 0.4, 4.9, 1.1, 0, 0, TAU);
      g.fill();
      g.restore();
      // glossy streak (sharp, on the lit side) + a smaller secondary
      const sx = ax + clamp(R.lx, -1, 1) * 2.4;
      g.strokeStyle = `rgba(255,255,255,${0.3 + wet * 0.35})`;
      g.lineWidth = lw * 1.3;
      g.beginPath();
      g.moveTo(sx, top + 2);
      g.quadraticCurveTo(sx + 0.3, (top + ay) / 2, sx - 0.2, ay - 3);
      g.stroke();
      if (o.shadow !== false) {
        const cl = clamp(1 - (lg.lift || 0) / 4);
        if (cl > 0.02) { g.fillStyle = `rgba(0,0,0,${0.55 * cl})`; g.beginPath(); g.ellipse(ax, 0.2, 5.6, 1.2, 0, 0, TAU); g.fill(); }
      }
      sculpt.push(b);
    }
  };

  // ================= arms =================
  const arms = [];
  const L2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  for (const s of side ? [1, -1] : [-1, 1]) {
    const p = ((ph + (s > 0 ? 0 : 0.5)) % 1 + 1) % 1;
    const sw = moving ? Math.sin(p * TAU) : 0;
    const sh = [side ? leanX(shY) : s * 9.5 + xo(shY), shY + 2.6 + (side ? 0 : s * shTilt * 0.5)];
    let hand, elbow;
    if (side) {
      const a = Math.PI / 2 - sw * (run ? 0.9 : 0.42) - crouch * 0.4;
      const la = run ? a - 1.45 : a - 0.22 - Math.max(0, sw) * 0.35;
      elbow = [sh[0] + Math.cos(a) * 14.5, sh[1] + Math.sin(a) * 14.5];
      hand = [elbow[0] + Math.cos(la) * 13.5, elbow[1] + Math.sin(la) * 13.5];
    } else if (run) {
      const back = Math.max(0, -sw), fwd = Math.max(0, sw);
      elbow = [s * (13.6 + back * 3.5) + xo(shY), shY + 15 - back * 6 + fwd * 3];
      hand = [s * (12 + back * 2 - fwd * 3) + xo(shY), shY + 25 - back * 4 - fwd * 9];
    } else {
      // seen from behind: the arm swinging forward recedes (hand higher, tucked in), the arm swinging
      // back comes toward us (hand a touch higher and wider); idle arms hang with a slight bend
      elbow = [s * (11.6 + Math.max(0, -sw) * 0.8 + crouch * 2) + xo(shY + 15), shY + 15.6 - Math.abs(sw) * 1.2 + breath * 0.2];
      hand = [s * (11.0 - Math.max(0, sw) * 1.5 + Math.max(0, -sw) * 0.7 + crouch * 3) + xo(hipY), shY + 29 - Math.abs(sw) * 3.2 - crouch * 4 + breath * 0.25];
    }
    if (sit > 0) {
      if (side) { hand = L2(hand, [15 + (s > 0 ? 1 : -1), hipY - 7], sit); elbow = L2(elbow, [6, shY + 13], sit); }
      else { hand = L2(hand, [s * 6.5, hipY - 5], sit); elbow = L2(elbow, [s * 12.5, shY + 14], sit); }
    }
    if (kneel > 0 && side && s === 1) { hand = L2(hand, [13, hipY - 9], kneel); elbow = L2(elbow, [5, shY + 14], kneel); }
    const reach = s === 1 ? clamp(o.reach || 0) : 0;
    if (reach) {
      hand = [lerp(hand[0], side ? 22 : s * 8, reach), lerp(hand[1], side ? shY + 22 : shY + 36, reach)];
      elbow = [lerp(elbow[0], side ? 10 : s * 11, reach), lerp(elbow[1], shY + 16, reach)];
    }
    const up = s === 1 ? clamp(o.armUp || 0) : 0;
    if (up) {
      hand = [lerp(hand[0], side ? 10 : s * 15, up), lerp(hand[1], shY - 30, up)];
      elbow = [lerp(elbow[0], side ? 6 : s * 17, up), lerp(elbow[1], shY - 12, up)];
    }
    if (o.flashlight && s === 1) {
      const fa = o.flashAngle == null ? 0.35 : o.flashAngle;
      if (side) {
        elbow = [sh[0] + 5, sh[1] + 13];
        hand = [elbow[0] + Math.cos(fa) * 13.5, elbow[1] + Math.sin(fa) * 13.5];
      } else {
        elbow = [12.5, shY + 15];
        hand = [10.5 + Math.cos(fa) * 2, shY + 24];
      }
    }
    // custom arm targets (armL / armR: { hand: [x, y], elbow?: [x, y] } in body units, ground origin):
    // the elbow is solved with two-bone IK and bends outward / downward like a real elbow
    const ct = s === 1 ? o.armR : o.armL;
    if (ct && ct.hand) {
      hand = [ct.hand[0], ct.hand[1]];
      elbow = ct.elbow ? [ct.elbow[0], ct.elbow[1]] : ik(sh[0], sh[1], hand[0], hand[1], 14.5, 13.5, side ? 1 : hand[1] < sh[1] ? s : -s);
    }
    // sitting, seen from behind: the forearms go round the knees in front, hidden by the body
    arms.push({ s, sh, elbow, hand, far: side ? s === -1 : sit > 0.5, sw });
  }
  const drawArm = (a) => {
    const k = a.far ? 0.3 : 0;
    const cc = k ? mix(C.coat, "#000", k) : C.coat;
    const dx0 = a.hand[0] - a.elbow[0], dy0 = a.hand[1] - a.elbow[1];
    const l0 = Math.hypot(dx0, dy0) || 1;
    const ux = dx0 / l0, uy = dy0 / l0;
    // the hand: relaxed, half-curled; the sleeve swallows the wrist
    const hc = [a.hand[0] + ux * 3.8, a.hand[1] + uy * 3.8];
    const hp = new Path2D();
    const ha = Math.atan2(uy, ux);
    g.save();
    g.translate(hc[0], hc[1]);
    g.rotate(ha - Math.PI / 2);
    // palm block + curled finger mass + thumb pad (local: +y = toward the fingertips)
    spline(hp, [-2.3, -2.4, 0, -2.9, 2.4, -2.3, 2.9, 0.6, 2.5, 3.4, 1.2, 4.6, -0.4, 4.4, -2.2, 3.6, -3.0, 1.2], true);
    g.fillStyle = cylGrad(g, 0, -3, 0, 4.6, 6, k ? mix(C.skin, "#000", k) : C.skin, R, Mskin);
    g.fill(hp);
    if (detail >= 1) {
      g.strokeStyle = rgba("#7a3a26", 0.35);
      g.lineWidth = lw * 0.6;
      g.beginPath();
      g.moveTo(-2.2, 2.2); g.quadraticCurveTo(0, 3, 2.3, 2.1);
      g.moveTo(-1.6, 3.6); g.quadraticCurveTo(0, 4.2, 1.6, 3.5);
      g.stroke();
    }
    g.restore();
    const hpT = new Path2D();
    hpT.addPath(hp, new DOMMatrixSafe(hc[0], hc[1], ha - Math.PI / 2));
    sculpt.push(hpT);
    // the sleeve: upper arm + forearm, shaded per segment, puffing a little at the elbow
    const cuff = [a.hand[0] + ux * 1.4, a.hand[1] + uy * 1.4];
    const pU = new Path2D();
    tube(pU, [a.sh[0], a.sh[1], (a.sh[0] + a.elbow[0]) / 2, (a.sh[1] + a.elbow[1]) / 2 + 0.3, a.elbow[0], a.elbow[1]], [8.8, 7.5, 7.9], 4, true, true);
    g.fillStyle = cylGrad(g, a.sh[0], a.sh[1], a.elbow[0], a.elbow[1], 8.0, cc, R, Mpvc);
    g.fill(pU);
    const pL = new Path2D();
    tube(pL, [a.elbow[0], a.elbow[1], cuff[0], cuff[1]], [7.8, 6.8, 7.4], 3, true, true);
    g.fillStyle = cylGrad(g, a.elbow[0], a.elbow[1], cuff[0], cuff[1], 7.4, cc, R, Mpvc);
    g.fill(pL);
    const arm = new Path2D();
    arm.addPath(pU);
    arm.addPath(pL);
    if (detail >= 1) {
      g.save();
      g.clip(arm);
      // folds: compression at the inside of the elbow (scaled by the bend), twist folds spiralling
      // round the forearm, drape folds hanging from the shoulder seam
      const ex = a.sh[0] - a.elbow[0], ey = a.sh[1] - a.elbow[1];
      const bend = clamp((1 - (-(ex * dx0 + ey * dy0) / ((Math.hypot(ex, ey) * l0) || 1))) * 0.9 + 0.2);
      const px = -uy, py = ux;
      // compression folds sit on the INSIDE of the bend, short and uneven (seeded per arm)
      const nIn = 1 + Math.round(bend * 1.6);
      for (let i = 0; i < nIn; i++) {
        const j = hash(i, a.s * 7 + 3) - 0.5;
        const c = [a.elbow[0] + ux * (i * 2.1 - 0.6 + j), a.elbow[1] + uy * (i * 2.1 - 0.6 + j)];
        const wv = 3.2 + j * 1.6;
        fold(g, [c[0] - px * wv, c[1] - py * wv + j, c[0] + ux * (0.5 + bend), c[1] + uy * (0.5 + bend), c[0] + px * (wv - 0.8), c[1] + py * (wv - 0.8)], 1.1, 0.15 + bend * 0.4, cc, R, Mpvc);
      }
      // one twist fold spiralling down the forearm
      const c2 = [lerp(a.elbow[0], cuff[0], 0.62), lerp(a.elbow[1], cuff[1], 0.62)];
      fold(g, [c2[0] - px * 3.4 - ux * 1.6, c2[1] - py * 3.4 - uy * 1.6, c2[0], c2[1] + 0.3, c2[0] + px * 3.4 + ux * 1.4, c2[1] + py * 3.4 + uy * 1.4], 1.0, 0.22, cc, R, Mpvc);
      // a long drape fold hanging from the shoulder seam
      const ms = [lerp(a.sh[0], a.elbow[0], 0.5), lerp(a.sh[1], a.elbow[1], 0.5)];
      fold(g, [a.sh[0] + px * 1.2, a.sh[1] + 2, ms[0] + px * 1.8, ms[1], a.elbow[0] + px * 0.8, a.elbow[1] - 1], 1.0, 0.2, cc, R, Mpvc);
      // elastic cuff with gathers
      g.strokeStyle = rgba(shade(cc, -0.5), 0.55);
      g.lineWidth = lw * 0.7;
      g.beginPath();
      for (let i = -3; i <= 3; i++) {
        const bx = cuff[0] + px * i * 1.1 - ux * 0.4, by = cuff[1] + py * i * 1.1 - uy * 0.4;
        g.moveTo(bx, by);
        g.lineTo(bx - ux * 2.2, by - uy * 2.2);
      }
      g.stroke();
      g.restore();
    }
    // bell on the left wrist: red cotton string, a little brass bell with a sharp glint
    if (o.bell && a.s === -1) {
      g.strokeStyle = "#9a2a26";
      g.lineWidth = Math.max(lw, 0.8);
      g.beginPath();
      g.moveTo(a.hand[0] - 3.2, a.hand[1] + 0.2);
      g.quadraticCurveTo(a.hand[0], a.hand[1] + 1.4, a.hand[0] + 3.2, a.hand[1] + 0.2);
      g.stroke();
      const bx = a.hand[0] + 0.4, by = a.hand[1] + 2.4 + Math.sin(t * 4.2 + (moving ? ph * TAU * 2 : 0)) * 0.35;
      g.fillStyle = sphereGrad(g, bx, by, 1.5, "#d9a441", R, MAT.metal);
      g.beginPath();
      g.arc(bx, by, 1.45, 0, TAU);
      g.fill();
      g.fillStyle = "rgba(40,22,4,0.8)";
      g.fillRect(bx - 1.1, by + 0.2, 2.2, 0.32);
      g.fillStyle = "rgba(255,250,230,0.9)";
      g.beginPath();
      g.arc(bx + R.lx * 0.6, by + R.ly * 0.6, 0.38, 0, TAU);
      g.fill();
    }
    if (o.flashlight && a.s === 1) {
      const fa = o.flashAngle == null ? 0.35 : o.flashAngle;
      const hx = a.hand[0] + ux * 3.2, hy = a.hand[1] + uy * 3.2;
      g.save();
      g.translate(hx, hy);
      g.rotate(side ? fa : -Math.PI / 2 + 0.25);
      // anodised aluminium barrel: banded speculars, knurled grip, a brighter bezel and the lit lens
      g.fillStyle = cylGrad(g, -1.6, 0, 7.5, 0, 4, "#7a808a", R, MAT.metal);
      g.fillRect(-1.6, -2, 9, 4);
      g.fillStyle = cylGrad(g, 6.5, 0, 9.5, 0, 5.4, "#aab0ba", R, MAT.metal);
      g.fillRect(6.5, -2.7, 3, 5.4);
      g.fillStyle = "#fffbe8";
      g.fillRect(9.3, -2.2, 0.6, 4.4);
      g.restore();
    }
    sculpt.push(arm);
  };

  // ================= torso (raincoat) =================
  const hem = hipY + 8.5 + crouch * 1.5 + sit * 5; // sitting, the coat settles onto the ground
  const torsoPath = () => {
    const tp = new Path2D();
    if (side) {
      const lx = leanX(shY);
      const flare = crouch * 3 + (run ? 2 : 0);
      spline(tp, [
        lx + 6.5, shY - 1.5, lx + 8.6, shY + 6, lx + 9.4, shY + 15, 9.6 + leanX(hipY + 12), hipY - 4, 10.4 + flare, hipY + 4, 11.2 + flare, hem - 0.5, 9.5 + flare, hem + 0.8,
        -9 - flare * 0.6, hem + 0.6, -10.4 - flare * 0.5, hem - 1, -9.4 + leanX(hipY + 12), hipY - 2, lx - 8.6, shY + 12, lx - 8.4, shY + 3, lx - 5.4, shY - 2.2, lx, shY - 3.4,
      ], true);
    } else {
      const fl = crouch * 2 + (run ? 0.8 : 0);
      const xs = xo(shY), xh = xo(hipY), xm = xo((shY + hipY) / 2);
      const wv = (i) => Math.sin(i * 2.3 + (moving ? cyc : 0)) * 0.5;
      spline(tp, [
        xs, shY - 4.0, xs + 3.6, shY - 3.8, xs + 7.2, shY - 2.0 + shTilt * 0.3, xs + 9.6, shY + 1.4, xs + 10.5, shY + 6.5, xm + 10.2, shY + 17,
        xh + 9.8, hipY - 7, xh + 10.8 + fl, hipY + 1, xh + 11.6 + fl, hem - 0.6,
        xh + 6, hem + 0.6 + wv(1), xh, hem + 0.1 + wv(2), xh - 6, hem + 0.7 + wv(3),
        xh - 11.6 - fl, hem - 0.6, xh - 10.8 - fl, hipY + 1, xh - 9.8, hipY - 7,
        xm - 10.2, shY + 17, xs - 10.5, shY + 6.5, xs - 9.6, shY + 1.4, xs - 7.2, shY - 2.0 - shTilt * 0.3, xs - 3.6, shY - 3.8,
      ], true);
    }
    return tp;
  };
  const drawTorso = () => {
    const tp = torsoPath();
    const cx = side ? 0 : xo((shY + hipY) / 2);
    g.fillStyle = cylGrad(g, cx, shY, cx, hem, side ? 21 : 25, C.coat, R, Mpvc, 0);
    g.fill(tp);
    g.save();
    g.clip(tp);
    // the back is not a cylinder: shoulders tip up toward the sky, the small of the back recedes, the
    // hem kicks out - modelled as a vertical gradient of normal tilt
    const vg = g.createLinearGradient(0, shY - 4, 0, hem);
    vg.addColorStop(0, rgba(shadeAt(C.coat, 0, -0.75, 0.66, R, Mpvc), 0.55));
    vg.addColorStop(0.18, rgba(C.coat, 0));
    vg.addColorStop(0.6, rgba(shadeAt(C.coat, 0, 0.5, 0.6, R, Mpvc), 0.35));
    vg.addColorStop(0.85, rgba(C.coat, 0));
    vg.addColorStop(1, rgba(shadeAt(C.coat, 0, 0.8, 0.4, R, Mpvc), 0.4));
    g.fillStyle = vg;
    g.fillRect(-20, shY - 5, 40, hem - shY + 8);
    if (!side) {
      // shoulder blades bulge the coat; the spine runs as a shallow channel between them
      for (const s of [-1, 1]) {
        const bx = cx + s * 5.2, by = shY + 9;
        const bg = g.createRadialGradient(bx + R.lx * 2, by + R.ly * 2, 0.5, bx, by, 7);
        bg.addColorStop(0, rgba(shadeAt(C.coat, R.lx * 0.5 + s * 0.3, R.ly * 0.5 - 0.2, 0.8, R, Mpvc), 0.45));
        bg.addColorStop(1, rgba(C.coat, 0));
        g.fillStyle = bg;
        g.fillRect(bx - 8, by - 8, 16, 16);
      }
      const spg = g.createLinearGradient(cx - 2.5, 0, cx + 2.5, 0);
      spg.addColorStop(0, rgba(C.coat, 0));
      spg.addColorStop(0.5, rgba(shade(C.coat, -0.4), 0.14));
      spg.addColorStop(1, rgba(C.coat, 0));
      g.fillStyle = spg;
      g.fillRect(cx - 3, shY + 4, 6, hipY - shY);
    }
    // ambient occlusion: under the armpits / where the arms press the sides
    if (!side) {
      for (const s of [-1, 1]) {
        const ag = g.createLinearGradient(cx + s * 11, 0, cx + s * 6, 0);
        ag.addColorStop(0, "rgba(20,10,0,0.32)");
        ag.addColorStop(1, "rgba(20,10,0,0)");
        g.fillStyle = ag;
        g.fillRect(Math.min(cx + s * 12, cx + s * 6), shY + 6, 6, hipY - shY - 2);
      }
    }
    if (detail >= 1) {
      // ---- folds driven by the pose ----
      const fd = (pts, w, d) => fold(g, pts, w, d, C.coat, R, Mpvc);
      if (side) {
        fd([-5, hipY - 1, 0, hipY - 6, 6, hipY - 2], 1.6, 0.5 + crouch * 0.5);
        fd([-7, shY + 14, -2, shY + 21, 1, shY + 29], 1.4, 0.35);
        fd([-8, hipY - 10, -2, hipY - 13, 4, hipY - 10], 1.4, 0.3 + crouch * 0.5);
        if (moving) fd([5, shY + 10, 7, shY + 18, 6, hipY - 6], 1.3, 0.25);
      } else {
        // drape folds from the shoulder blades to the hem
        fd([cx - 5.5, shY + 14, cx - 6.6, hipY - 4, cx - 5.2, hem - 1], 1.8, 0.28);
        fd([cx + 5.5, shY + 14, cx + 6.4, hipY - 5, cx + 5, hem - 1], 1.8, 0.28);
        // armpit drag folds
        fd([cx - 10.4, shY + 9, cx - 6.5, shY + 14, cx - 6.6, shY + 22], 1.4, 0.4);
        fd([cx + 10.4, shY + 9, cx + 6.5, shY + 14, cx + 6.4, shY + 22], 1.4, 0.4);
        // walking: diagonal tension from the forward-swinging arm's shoulder to the opposite hip
        if (moving) {
          const s = Math.sin(cyc) > 0 ? 1 : -1, d = Math.abs(Math.sin(cyc));
          fd([cx + s * 9, shY + 6, cx + s * 2, shY + 18, cx - s * 6, hipY - 2], 1.5, 0.15 + d * 0.4);
        }
        // reaching / arm raised: the coat pulls up and across the back
        const pull = Math.max(clamp(o.reach || 0), clamp(o.armUp || 0));
        if (pull > 0.05) fd([cx + 10, shY + 3, cx + 3, shY + 14, cx - 7, hipY - 3], 1.6, pull * 0.6);
        // crouching: horizontal compression folds across the small of the back
        for (let i = 0; i < 3; i++) if (crouch > 0.05) fd([cx - 9, hipY - 6 + i * 3, cx, hipY - 8 + i * 3 + crouch, cx + 9, hipY - 6 + i * 3], 1.4, crouch * 0.55);
        // a soft sag above the hem band
        fd([cx - 8, hipY + 1, cx - 2, hipY - 2.5, cx + 3, hipY + 0.5], 1.4, 0.3);
      }
      // ---- construction: back yoke / cape vent, side seams, hem band with stitching ----
      if (!side) {
        const yk = shY + 10.5;
        g.lineCap = "round";
        // the cape flap's lower edge casts a thin shadow on the coat below it
        g.strokeStyle = "rgba(30,18,0,0.16)";
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(cx - 9.8, yk + 0.8); g.quadraticCurveTo(cx, yk + 3.2, cx + 9.8, yk + 0.8);
        g.stroke();
        g.strokeStyle = rgba(shadeAt(C.coat, R.lx * 0.3, -0.8, 0.5, R, Mpvc), 0.45);
        g.lineWidth = lw * 1.0;
        g.beginPath();
        g.moveTo(cx - 10.6, yk); g.quadraticCurveTo(cx, yk + 2.4, cx + 10.6, yk);
        g.stroke();
        g.strokeStyle = rgba(shade(C.coat, -0.45), 0.35);
        g.lineWidth = lw * 0.6;
        g.setLineDash && g.setLineDash([0.7, 0.55]);
        g.beginPath();
        g.moveTo(cx - 10.2, yk - 1.0); g.quadraticCurveTo(cx, yk + 1.3, cx + 10.2, yk - 1.0);
        g.moveTo(cx - 11.5, hem - 2.4); g.quadraticCurveTo(cx, hem - 1.8, cx + 11.5, hem - 2.4);
        g.stroke();
        g.setLineDash && g.setLineDash([]);
      } else {
        // front placket with snaps, a pocket flap
        const fx = 8.4 + leanX(shY + 20) * 0.5;
        g.strokeStyle = rgba(shade(C.coat, -0.45), 0.4);
        g.lineWidth = lw * 0.8;
        g.beginPath();
        g.moveTo(fx - 0.4, shY + 2); g.lineTo(fx + 0.6 + crouch * 2, hem - 0.5);
        g.moveTo(1, hipY - 4); g.lineTo(7.4, hipY - 4.6);
        g.stroke();
        for (let i = 0; i < 4; i++) {
          const sy = shY + 6 + i * 9;
          const sx2 = fx - 1.6 + (i / 4) * crouch * 1.5;
          g.fillStyle = sphereGrad(g, sx2, sy, 0.9, "#c9ccd2", R, MAT.metal);
          g.beginPath(); g.arc(sx2, sy, 0.85, 0, TAU); g.fill();
        }
      }
    }
    // hem band shade
    g.fillStyle = rgba(shade(C.coat, -0.4), 0.22);
    g.fillRect(-20, hem - 2.2, 40, 3.5);
    g.restore();
    sculpt.push(tp);
    return tp;
  };

  // rain beads on the PVC: a cached tile of little lenses (dark rim, bright glint on the lit side) laid
  // over the part as one pattern fill, plus a few drops actually running down
  const beads = (path, x0, y0, x1, y1, seed, n) => {
    if (!(wet > 0.15) || detail < 2 || o.beads === false) return;
    const ang = Math.atan2(R.ly, R.lx);
    const bucket = ((Math.round((ang / TAU) * 8) % 8) + 8) % 8;
    const pat = beadPattern(g, bucket);
    if (pat && pat.setTransform && HAS_DOMMATRIX) {
      pat.setTransform(new DOMMatrix().translateSelf(seed * 7.3, seed * 3.1).scaleSelf(0.16, 0.16));
      g.save();
      g.globalAlpha *= clamp(wet * 1.1);
      g.fillStyle = pat;
      g.fill(path);
      g.restore();
    }
    if (n < 40) return;
    g.save();
    g.clip(path);
    for (let i = 0; i < 3; i++) {
      const bx = lerp(x0, x1, hash(i, seed)), by0 = lerp(y0, y1, hash(i, seed + 1) * 0.6);
      const by = by0 + ((t * 1.2 + hash(i, seed + 3) * 9) % 12);
      const r = 0.45 + hash(i, seed + 4) * 0.3;
      g.strokeStyle = "rgba(255,255,255,0.14)";
      g.lineWidth = r * 0.7;
      g.beginPath(); g.moveTo(bx, by0); g.lineTo(bx, by - r); g.stroke();
      g.fillStyle = "rgba(60,36,0,0.3)";
      g.beginPath(); g.arc(bx, by + r * 0.2, r, 0, TAU); g.fill();
      g.fillStyle = "rgba(255,255,255,0.85)";
      g.beginPath(); g.arc(bx + Math.cos(ang) * r * 0.35, by + Math.sin(ang) * r * 0.35 - r * 0.15, r * 0.3, 0, TAU); g.fill();
    }
    g.restore();
  };

  // ================= head, hood =================
  const headY = -91.5 + bob * 0.85 + dip * 0.85 + low - breath * 0.25;
  const hc = [side ? 2 + leanX(-92) : xo(-92) * 0.8, headY];
  const drawNeck = () => {
    const np = new Path2D();
    if (side) roundRect(np, hc[0] - 3, hc[1] + 4, 5.6, 8, 2);
    else roundRect(np, hc[0] - 2.9, hc[1] + 4, 5.8, shY - hc[1] - 2, 2.2);
    g.fillStyle = cylGrad(g, hc[0], hc[1] + 4, hc[0], shY, 5.8, C.skin, R, Mskin);
    g.fill(np);
    // the hair / skull casts occlusion onto the neck
    const ng = g.createLinearGradient(0, hc[1] + 4, 0, hc[1] + 10);
    ng.addColorStop(0, "rgba(40,14,4,0.55)");
    ng.addColorStop(1, "rgba(40,14,4,0)");
    g.fillStyle = ng;
    g.fill(np);
    sculpt.push(np);
  };
  const drawHoodDown = () => {
    // the hood lying on the upper back: a soft fabric pocket, its lining showing at the opening edge
    const hp = new Path2D();
    const cx = side ? leanX(shY) - 3 : xo(shY);
    if (side) spline(hp, [cx + 2.5, shY - 3.6, cx - 3.5, shY - 5.6, cx - 8.6, shY - 2.6, cx - 9.8, shY + 3.6, cx - 6.4, shY + 6.8, cx - 1.4, shY + 3.6, cx + 3.4, shY + 0.6], true);
    else spline(hp, [cx - 7.4, shY - 2.6, cx - 3.6, shY - 4.8, cx, shY - 4.4, cx + 3.6, shY - 4.8, cx + 7.4, shY - 2.6, cx + 6.6, shY + 4.6, cx + 3.4, shY + 9.0, cx + 0.4, shY + 10.2, cx - 3.2, shY + 9.2, cx - 6.6, shY + 4.8], true);
    g.fillStyle = cylGrad(g, cx, shY - 5, cx, shY + 13, 17, C.coat, R, Mpvc, -0.25);
    g.fill(hp);
    g.save();
    g.clip(hp);
    // the lining (cooler, matte) inside the rolled opening
    const lp = new Path2D();
    if (side) ellipsePath(lp, cx - 2.6, shY - 2.4, 5.4, 2.4, -0.2);
    else spline(lp, [cx - 7.2, shY - 2.6, cx, shY - 3.8, cx + 7.2, shY - 2.6, cx + 4, shY + 0.8, cx, shY + 1.6, cx - 4, shY + 0.8], true);
    // the inside of the hood: same coat, matte, darker deeper in (occluded)
    const lg2 = g.createLinearGradient(0, shY - 4, 0, shY + 2);
    lg2.addColorStop(0, shadeAt(mix(C.coat, "#6a5a40", 0.3), 0, -0.4, 0.6, R, MAT.cloth));
    lg2.addColorStop(1, shadeAt(mix(C.coat, "#3a2a10", 0.55), 0, 0.5, 0.4, R, MAT.cloth));
    g.fillStyle = lg2;
    g.fill(lp);
    // folds of the collapsed hood
    if (detail >= 1 && !side) {
      fold(g, [cx - 6, shY + 2, cx - 3, shY + 6, cx - 1.2, shY + 11.5], 1.4, 0.55, C.coat, R, Mpvc);
      fold(g, [cx + 6.2, shY + 2.4, cx + 3.2, shY + 6.4, cx + 1.4, shY + 11], 1.4, 0.5, C.coat, R, Mpvc);
      fold(g, [cx - 4, shY + 4, cx, shY + 3, cx + 4, shY + 4.2], 1.2, 0.35, C.coat, R, Mpvc);
      g.strokeStyle = rgba(shade(C.coat, -0.5), 0.35);
      g.lineWidth = lw * 0.7;
      g.beginPath(); g.moveTo(cx, shY + 1.4); g.quadraticCurveTo(cx + 0.4, shY + 7, cx, shY + 13); g.stroke();
    }
    // AO where the hood sits on the coat, at its lower rim
    const ag = g.createLinearGradient(0, shY + 6, 0, shY + 13);
    ag.addColorStop(0, "rgba(30,16,0,0)");
    ag.addColorStop(1, "rgba(30,16,0,0.3)");
    g.fillStyle = ag;
    g.fill(hp);
    g.restore();
    // a contact shadow on the coat just under the hood
    g.save();
    g.clip(torsoPath());
    g.strokeStyle = "rgba(30,16,0,0.14)";
    g.lineWidth = 2.2;
    g.translate(0, 1.4);
    g.stroke(hp);
    g.restore();
    sculpt.push(hp);
  };
  const drawHead = () => {
    const head = new Path2D();
    if (side) {
      // the head turned a little away from us: skull, jaw line and cheek only; the face is never shown
      ellipsePath(head, hc[0], hc[1], 7.2, 8);
      head.moveTo(hc[0] + 4.4, hc[1] + 3.5);
      head.quadraticCurveTo(hc[0] + 6.6, hc[1] + 3.4, hc[0] + 5.6, hc[1] + 6.2);
      head.quadraticCurveTo(hc[0] + 3.4, hc[1] + 8.4, hc[0] - 0.5, hc[1] + 8.1);
      head.closePath();
    } else {
      ellipsePath(head, hc[0], hc[1], 6.9, 8.1);
    }
    g.fillStyle = sphereGrad(g, hc[0], hc[1], 8.2, C.skin, R, Mskin);
    g.fill(head);
    if (side) {
      // the averted cheek falls into shadow toward the front
      const fg = g.createLinearGradient(hc[0] + 3, 0, hc[0] + 7.6, 0);
      fg.addColorStop(0, "rgba(60,20,8,0)");
      fg.addColorStop(1, "rgba(60,20,8,0.6)");
      g.fillStyle = fg;
      g.fill(head);
    }
    sculpt.push(head);
    // ears: helix rim, a darker bowl, warm translucency when backlit
    const ear = (ex, ey, s) => {
      const ep = new Path2D();
      spline(ep, [ex, ey - 2.6, ex + s * 1.4, ey - 2.2, ex + s * 1.9, ey - 0.4, ex + s * 1.5, ey + 1.6, ex + s * 0.6, ey + 2.6, ex - s * 0.2, ey + 1.2], true);
      g.fillStyle = cylGrad(g, ex, ey - 2.6, ex, ey + 2.6, 3.4, mix(C.skin, "#e08070", 0.15), R, Mskin);
      g.fill(ep);
      g.strokeStyle = rgba("#6a2a18", 0.4);
      g.lineWidth = lw * 0.6;
      g.beginPath();
      g.moveTo(ex + s * 0.5, ey - 1.6);
      g.quadraticCurveTo(ex + s * 1.3, ey - 0.4, ex + s * 0.6, ey + 1.4);
      g.stroke();
      if (R.back || R.rim > 1) {
        g.save();
        g.globalCompositeOperation = "lighter";
        g.globalAlpha *= 0.35 * Math.min(1, R.rim) * (R.back ? 1.4 : 0.6);
        g.fillStyle = "#ff5a2a";
        g.fill(ep);
        g.restore();
      }
      sculpt.push(ep);
    };
    if (!o.hood) {
      if (side) {
        // the ear first: shaggy hair falls over it, only the lobe and rim peek out
        ear(hc[0] + 2.6, hc[1] + 2.2, -1);
        const hs = hairSprite("side", C.hair, wet, R, u);
        g.drawImage(hs, hc[0] - 12, hc[1] - 13, 24, 26);
      } else {
        ear(hc[0] - 6.7, hc[1] + 0.6, -1);
        ear(hc[0] + 6.7, hc[1] + 0.6, 1);
        const hs = hairSprite("back", C.hair, wet, R, u);
        g.drawImage(hs, hc[0] - 12, hc[1] - 13, 24, 26);
      }
      // the rim pass follows the real hair silhouette (same outline the sprite was painted from)
      const hv = side ? "side" : "back";
      const hp0 = hairOutline(hv, rng("hair:" + hv)).map((v, i) => v + (i % 2 ? hc[1] : hc[0]));
      const hairP = new Path2D();
      spline(hairP, hp0, true, 1);
      sculpt.push(hairP);
    }
  };
  const drawHoodUp = () => {
    const hp = new Path2D();
    if (side) {
      spline(hp, [hc[0] + 7.6, hc[1] - 6.4, hc[0] + 9.2, hc[1] + 2.4, hc[0] + 6.4, hc[1] + 10.2, hc[0] - 3.4, hc[1] + 11.6, hc[0] - 9.8, hc[1] + 4.2, hc[0] - 9.4, hc[1] - 6.4, hc[0] - 3.4, hc[1] - 11.2, hc[0] + 2.6, hc[1] - 11.0], true);
    } else {
      // two-panel hood: a soft point at the crown seam, loose fabric standing off the skull at the
      // sides, falling straight-ish to the shoulders where it widens into the collar
      spline(hp, [hc[0] + 0.4, hc[1] - 11.6, hc[0] + 5.4, hc[1] - 9.6, hc[0] + 8.4, hc[1] - 5.0, hc[0] + 9.2, hc[1] + 1.2, hc[0] + 9.0, hc[1] + 7.0, hc[0] + 10.4, hc[1] + 11.4, hc[0] + 5.4, hc[1] + 13.0, hc[0], hc[1] + 13.4, hc[0] - 5.4, hc[1] + 13.0, hc[0] - 10.4, hc[1] + 11.4, hc[0] - 9.0, hc[1] + 7.0, hc[0] - 9.2, hc[1] + 1.2, hc[0] - 8.4, hc[1] - 5.0, hc[0] - 5.0, hc[1] - 9.8], true);
    }
    // a hood is crumpled cloth over a skull, not a polished dome: a broader, softer sheen
    const Mh = { wrap: 0.35, spec: 0.16 + wet * 0.3, shin: 9 + wet * 10, sss: 0 };
    g.fillStyle = cylGrad(g, hc[0], hc[1] - 12, hc[0], hc[1] + 13, 20, C.coat, R, Mh);
    g.fill(hp);
    g.save();
    g.clip(hp);
    // the crown rounds over toward the sky; the lower hood sits in the shoulders' shadow
    const vg = g.createLinearGradient(0, hc[1] - 12, 0, hc[1] + 13);
    vg.addColorStop(0, rgba(shadeAt(C.coat, R.lx * 0.3, -0.8, 0.55, R, Mh), 0.6));
    vg.addColorStop(0.35, rgba(C.coat, 0));
    vg.addColorStop(1, rgba(shadeAt(C.coat, 0, 0.7, 0.5, R, Mh), 0.45));
    g.fillStyle = vg;
    g.fillRect(hc[0] - 12, hc[1] - 13, 24, 27);
    // fabric: a few irregular crumples, not a pattern
    if (detail >= 1) {
      const fd = (pts, w, d) => fold(g, pts, w, d, C.coat, R, Mh);
      if (side) {
        fd([hc[0] - 8, hc[1] + 5, hc[0] - 4, hc[1] + 8, hc[0] + 2, hc[1] + 9.4], 1.6, 0.4);
        fd([hc[0] - 3, hc[1] - 9, hc[0] - 6.6, hc[1] - 3, hc[0] - 6, hc[1] + 3], 1.5, 0.25);
      } else {
        fd([hc[0] + 1.6, hc[1] - 10, hc[0] + 5.6, hc[1] - 4, hc[0] + 6.4, hc[1] + 4.4], 1.8, 0.28);
        fd([hc[0] - 2, hc[1] - 9, hc[0] - 6.2, hc[1] - 2, hc[0] - 6.8, hc[1] + 6.6], 1.6, 0.22);
        fd([hc[0] - 7.6, hc[1] + 9.4, hc[0] - 2.4, hc[1] + 8.4, hc[0] + 3.6, hc[1] + 10.6], 1.6, 0.35);
        fd([hc[0] + 2, hc[1] + 11.4, hc[0] + 5.8, hc[1] + 10.4, hc[0] + 8.6, hc[1] + 11.6], 1.3, 0.25);
      }
    }
    // the centre seam (back view) / the face opening (side: a deep shadow, the face hidden inside)
    if (side) {
      const op = new Path2D();
      // seen edge-on: a narrow opening, deep in shadow, a hint of fringe hair inside (never a face)
      ellipsePath(op, hc[0] + 8.2, hc[1] + 1.6, 1.7, 7.0, 0.12);
      const og = g.createLinearGradient(hc[0] + 6.5, 0, hc[0] + 9.8, 0);
      og.addColorStop(0, "rgba(10,6,2,0.95)");
      og.addColorStop(1, rgba(mix(C.hair, "#000", 0.55), 0.95));
      g.fillStyle = og;
      g.fill(op);
      g.strokeStyle = rgba(shadeAt(C.coat, 1, 0, 0.4, R, Mpvc), 0.9);
      g.lineWidth = lw * 1.8;
      g.beginPath();
      g.ellipse(hc[0] + 7.0, hc[1] + 1.4, 2.2, 7.6, 0.12, -Math.PI / 2, Math.PI / 2, true);
      g.stroke();
    } else {
      g.strokeStyle = rgba(shade(C.coat, -0.5), 0.5);
      g.lineWidth = lw * 0.9;
      g.beginPath();
      g.moveTo(hc[0], hc[1] - 11.2);
      g.quadraticCurveTo(hc[0] + 0.5, hc[1], hc[0], hc[1] + 13);
      g.stroke();
      g.strokeStyle = rgba(shadeAt(C.coat, 0.4, -0.3, 0.8, R, Mpvc), 0.5);
      g.lineWidth = lw * 0.6;
      g.setLineDash && g.setLineDash([0.7, 0.5]);
      g.beginPath();
      g.moveTo(hc[0] + 1, hc[1] - 10.8);
      g.quadraticCurveTo(hc[0] + 1.5, hc[1], hc[0] + 1, hc[1] + 12.6);
      g.stroke();
      g.setLineDash && g.setLineDash([]);
    }
    // occlusion where the hood meets the shoulders
    const ag = g.createLinearGradient(0, hc[1] + 8, 0, hc[1] + 13.4);
    ag.addColorStop(0, "rgba(30,16,0,0)");
    ag.addColorStop(1, "rgba(30,16,0,0.3)");
    g.fillStyle = ag;
    g.fill(hp);
    g.restore();
    beads(hp, hc[0] - 10, hc[1] - 11, hc[0] + 10, hc[1] + 12, 77, 26);
    sculpt.push(hp);
  };

  // ================= draw order =================
  for (const lg of legs) if (lg.far) drawLeg(lg);
  for (const a of arms) if (a.far) drawArm(a);
  for (const lg of legs) if (!lg.far) drawLeg(lg);
  // the shadow the coat casts on the jeans
  {
    const sp = new Path2D();
    for (const lg of legs) if (!lg.hidden) ellipsePath(sp, (lg.hip[0] + lg.knee[0]) / 2, hem + 2.2, 6.5, 3.2);
    g.save();
    g.globalAlpha *= 0.38;
    g.fillStyle = "#05060a";
    g.fill(sp);
    g.restore();
  }
  drawNeck();
  const torso = drawTorso();
  beads(torso, -13, shY - 3, 13, hem, 31, 70);
  if (o.hood) { drawHead(); drawHoodUp(); }
  else { drawHoodDown(); drawHead(); }
  for (const a of arms) if (!a.far) drawArm(a);
  if (wet > 0.15 && detail >= 2) for (const a of arms) if (!a.far) {
    const ap = new Path2D();
    tube(ap, [a.sh[0], a.sh[1], a.elbow[0], a.elbow[1], a.hand[0], a.hand[1]], [8.6, 8.2, 7.6], 4, true, true);
    beads(ap, Math.min(a.sh[0], a.hand[0]) - 5, a.sh[1] - 4, Math.max(a.sh[0], a.hand[0]) + 5, a.hand[1] + 2, 53 + a.s, 22);
  }

  // ================= global light passes on the silhouette =================
  const all = new Path2D();
  for (const p of sculpt) all.addPath(p);
  const box = [-26, -112, 26, 4];
  // core shadow toward the far side, then the rim (wider + hotter when the key is behind the subject)
  if (R.rim > 0) {
    // rim width is a few screen pixels (+ a little with size), not a fixed fraction of the body
    const rimW = ((R.back ? 2.6 : 1.6) + h * 0.0016) / u;
    crescent(g, all, -R.lx * rimW, -R.ly * rimW, mix(R.css, "#ffffff", 0.25), (R.back ? 0.85 : 0.5) * R.rim, box, "lighter", 2);
  }
  g.restore();

  if (o.flashlight) {
    const fa = o.flashAngle == null ? 0.35 : o.flashAngle;
    const ra = arms.find((a) => a.s === 1);
    const hx = x + f * u * (ra.hand[0] + (side ? Math.cos(fa) * 9.5 : 0)), hy = y + u * (ra.hand[1] + (side ? Math.sin(fa) * 9.5 : -3));
    const ang = side ? (f === 1 ? fa : Math.PI - fa) : (o.flashAngle == null ? -Math.PI / 2 - 0.1 : o.flashAngle);
    // the torch spills light back onto the hand and sleeve
    glow(g, hx, hy, h * 0.09, "#fff2d0", 0.35 * (o.alpha == null ? 1 : o.alpha));
    flashlightBeam(g, hx, hy, ang, o.flashLen || h * 3, { spread: 0.34, t, alpha0: o.alpha == null ? 1 : o.alpha });
  }
}

// a tiny DOMMatrix helper that never throws (translate + rotate), for Path2D.addPath
function DOMMatrixSafe(tx, ty, rot) {
  if (!HAS_DOMMATRIX) return undefined;
  return new DOMMatrix().translateSelf(tx, ty).rotateSelf(0, 0, (rot * 180) / Math.PI);
}
function ik(ax, ay, bx, by, l1, l2, bend = 1) {
  const dx = bx - ax, dy = by - ay;
  const d = Math.hypot(dx, dy) || 1e-6;
  const dm = Math.min(d, (l1 + l2) * 0.999);
  const base = Math.atan2(dy, dx);
  const c = clamp((l1 * l1 + dm * dm - l2 * l2) / (2 * l1 * dm), -1, 1);
  const a = Math.acos(c) * bend;
  return [ax + Math.cos(base + a) * l1, ay + Math.sin(base + a) * l1];
}

// ================================================================================================
// POV hands. Local space: wrist at origin, fingers point toward -y, 1 unit = size/100.
// (Finger bases / lengths are unchanged from v1: films place props against the fingertips.)
// ================================================================================================
function finger(bx, by, len, wid, ang, curl) {
  const segs = [0.45, 0.32, 0.23];
  const pts = [bx, by];
  let x = bx, y = by;
  const a = ang;
  const lens = [];
  for (let i = 0; i < 3; i++) {
    const bend = curl * (i === 0 ? 0.9 : 1.25);
    const l = len * segs[i] * Math.max(0.18, Math.cos(Math.min(1.45, bend * (i + 1) * 0.6)));
    x += Math.cos(a) * l;
    y += Math.sin(a) * l;
    pts.push(x, y);
    lens.push(l);
  }
  const p = new Path2D();
  tube(p, pts, [wid, wid * 0.93, wid * 0.84, wid * 0.72], 4, false, true);
  return { p, tip: [x, y], ang: a, pts, curl, wid, lens };
}

export function drawHand(g, x, y, size, opts = {}) {
  if (!(size > 0)) return;
  const o = Object.assign({ pose: "reach" }, opts);
  const skin = o.skin || KID.skin, sleeve = o.sleeve || KID.coat;
  const u = size / 100;
  const ang = o.angle == null ? -Math.PI / 2 : o.angle;
  const t = o.t || 0;
  const wet = clamp(o.wet || 0);
  const mirror = o.left ? -1 : 1;
  const grip = clamp(o.grip || 0);
  const curl = clamp((o.pose === "hold" ? 0.95 : o.pose === "point" ? 0.9 : o.pose === "open" ? 0 : o.pose === "cup" ? 0.35 : 0.18) + grip * 0.2);
  const spread = o.pose === "open" ? 0.16 : o.pose === "reach" ? 0.08 : 0.03;
  const lw = clamp(1 / u, 0.2, 0.8);
  const big = size * pixelScale() > 90;
  // light into the hand's local frame
  let L2x = -0.4, L2y = -0.8;
  if (o.light) {
    const lx = o.light.x - x, ly = o.light.y - y;
    const l = Math.hypot(lx, ly) || 1;
    L2x = lx / l; L2y = ly / l;
  }
  const ca = Math.cos(-(ang + Math.PI / 2)), sa = Math.sin(-(ang + Math.PI / 2));
  const llx = (L2x * ca - L2y * sa) * mirror, lly = L2x * sa + L2y * ca;
  const R = makeRig(o.light ? Object.assign({}, o.light, { z: o.light.z == null ? 0.55 : o.light.z }) : null, llx, lly, o.ambient);
  if (!o.light) { R.lx = llx * 0.8; R.ly = lly * 0.8; R.key += ":" + Math.round(R.lx * 25) + "," + Math.round(R.ly * 25); }
  const Mskin = MAT.skin;
  const Mslv = { wrap: 0.25, spec: 0.45 + wet * 0.4, shin: 24 + wet * 20, sss: 0 };

  g.save();
  g.translate(x, y);
  g.rotate(ang + Math.PI / 2);
  g.scale(mirror * u, u);

  // ---- sleeve (comes in from behind the wrist, off-frame) ----
  const slv = new Path2D();
  slv.moveTo(-30, 260);
  slv.bezierCurveTo(-31, 160, -27, 70, -27, 34);
  slv.quadraticCurveTo(-27, 14, -23, 12);
  slv.quadraticCurveTo(0, 5, 23, 12);
  slv.quadraticCurveTo(27, 14, 27, 34);
  slv.bezierCurveTo(28, 80, 31, 170, 32, 260);
  slv.closePath();
  g.fillStyle = cylGrad(g, 0, 10, 0, 260, 62, sleeve, R, Mslv);
  g.fill(slv);
  g.save();
  g.clip(slv);
  // bunched folds above the cuff: diagonal troughs with glossy ridges, alternating like real gathers
  for (let i = 0; i < 6; i++) {
    const y0 = 42 + i * 24 + (i % 2) * 6, sk = (i % 2 ? 1 : -1) * 7;
    fold(g, [-31, y0 + sk, -10, y0 - 3, 8, y0 - 5, 31, y0 - sk], 6, 0.55, sleeve, R, Mslv);
  }
  // elastic cuff: a tighter band with radial gathers and a turned edge catching the light
  const cg = g.createLinearGradient(0, 8, 0, 32);
  cg.addColorStop(0, shadeAt(sleeve, 0, -0.7, 0.7, R, Mslv));
  cg.addColorStop(0.3, shadeAt(sleeve, 0, -0.1, 1, R, Mslv));
  cg.addColorStop(1, shadeAt(sleeve, 0, 0.6, 0.6, R, Mslv));
  g.fillStyle = cg;
  g.globalAlpha *= 0.85;
  g.fillRect(-32, 8, 64, 22);
  g.globalAlpha /= 0.85;
  g.strokeStyle = rgba(shade(sleeve, -0.55), 0.35);
  g.lineWidth = lw * 1.4;
  g.beginPath();
  for (let i = 0; i < 15; i++) { const xx = -29 + i * 4.1; g.moveTo(xx, 11 + Math.abs(xx) * 0.08); g.quadraticCurveTo(xx + 0.8, 20, xx + 0.3, 30); }
  g.stroke();
  g.strokeStyle = rgba(shadeAt(sleeve, 0, -0.6, 0.8, R, Mslv), 0.9);
  g.lineWidth = lw * 2;
  g.beginPath(); g.moveTo(-24, 12.4); g.quadraticCurveTo(0, 5.6, 24, 12.4); g.stroke();
  g.restore();
  if (big) texFill(g, slv, "pvc", 0.25, 0.1, "soft-light");
  if (wet > 0.1 && big) {
    for (let i = 0; i < Math.round(30 * wet); i++) {
      const bx = -26 + hash(i, 91) * 52, by = 36 + hash(i, 92) * 200, r = 0.8 + hash(i, 93) * 1.6;
      g.fillStyle = "rgba(60,36,0,0.25)"; g.beginPath(); g.arc(bx, by + r * 0.2, r, 0, TAU); g.fill();
      g.fillStyle = "rgba(255,255,255,0.8)"; g.beginPath(); g.arc(bx + R.lx * r * 0.4, by + R.ly * r * 0.4, r * 0.3, 0, TAU); g.fill();
    }
  }
  // the sleeve shades the wrist: soft occlusion just past the cuff
  const occ = g.createLinearGradient(0, 14, 0, -4);
  occ.addColorStop(0, "rgba(40,14,4,0.5)");
  occ.addColorStop(1, "rgba(40,14,4,0)");

  // item held behind the fingers
  if (o.item === "poster" || o.item === "photo") drawPaper(g, o.item, t);
  const torch = o.item === "flashlight";
  if (torch) drawTorch(g, R);
  if (o.item === "bell") drawHeldBell(g, R, t, true);

  // ---- the hand ----
  const hand = new Path2D();
  // dorsum: broad at the knuckles, narrowing to the wrist, the ulnar edge fleshier
  spline(hand, [-13.5, 10, -17, -8, -20, -30, -18.5, -44, -13, -50, -4, -53, 6, -52, 14.5, -47.5, 19.5, -40, 19.8, -22, 16, -4, 12.5, 10, 0, 12], true);
  const fingers = [];
  const base = [[-14, -46, 40, 10.4], [-4.5, -50, 45, 11], [5, -49, 42, 10.4], [14, -43, 33, 9.2]];
  base.forEach(([bx, by, len, wid], i) => {
    const a = -Math.PI / 2 + (i - 1.5) * spread + (o.pose === "open" ? Math.sin(t * 1.3 + i) * 0.01 : 0);
    const c = o.pose === "point" && i === 0 ? 0.05 : torch ? 0.95 : curl;
    fingers.push(finger(bx, by, len, wid, a, c));
  });
  const thumbCurl = torch ? 0.08 : o.pose === "hold" ? 0.7 : 0.2;
  const thumbAng = torch ? -Math.PI / 2 + 0.16 : -Math.PI / 2 - 0.62 + thumbCurl * 0.5;
  // (gripping the torch, the thumb lies along the top of the barrel, its pad past the knuckles)
  const th = torch ? finger(-13, -28, 36, 13, thumbAng, 0.04) : finger(-15, -14, 36, 14, thumbAng, thumbCurl * 0.5);
  if (!torch) ellipsePath(th.p, -15, -16, 9, 14, -0.35); // thenar mass joins the thumb to the palm
  const all = new Path2D();
  all.addPath(hand);
  all.addPath(th.p);
  for (const fi of fingers) all.addPath(fi.p);

  // cast shadow of the hand on whatever is behind (sleeve / item): offset away from the light
  g.save();
  g.translate(-R.lx * 5, -R.ly * 5 + 3);
  g.fillStyle = "rgba(20,8,0,0.22)";
  g.fill(all);
  g.restore();

  // thumb + palm (gripping a torch, the thumb lies ON the barrel instead: drawn after the fingers)
  const fillThumb = () => {
    g.fillStyle = cylGrad(g, th.pts[0], th.pts[1], th.pts[4], th.pts[5], 15, skin, R, Mskin);
    g.fill(th.p);
  };
  if (!torch) fillThumb();
  // fingers: draw pinky -> index; each casts a soft occlusion onto its neighbour first
  for (let i = fingers.length - 1; i >= 0; i--) {
    const fi = fingers[i];
    // contact occlusion where this finger lies against its neighbour (not on the back of the hand)
    if (i < fingers.length - 1 && spread < 0.1) {
      g.save();
      g.clip(fingers[i + 1].p);
      g.translate(-R.lx * 1.5, 0);
      g.fillStyle = "rgba(60,16,4,0.25)";
      g.fill(fi.p);
      g.restore();
    }
    g.fillStyle = cylGrad(g, fi.pts[0], fi.pts[1], fi.pts[2], fi.pts[3], fi.wid, skin, R, Mskin);
    g.fill(fi.p);
  }
  {
    // the back of the hand, drawn OVER the finger roots so the knuckle line is the only transition:
    // a gentle dome with a vertical falloff to the wrist
    g.fillStyle = sphereGrad(g, 0, -24, 34, skin, R, Mskin);
    g.fill(hand);
    g.save();
    g.clip(hand);
    const vg = g.createLinearGradient(0, -52, 0, 12);
    vg.addColorStop(0, rgba(shadeAt(skin, 0, -0.5, 0.86, R, Mskin), 0.5));
    vg.addColorStop(0.5, rgba(skin, 0));
    vg.addColorStop(1, rgba(shadeAt(skin, 0, 0.6, 0.8, R, Mskin), 0.4));
    g.fillStyle = vg;
    g.fillRect(-24, -56, 48, 70);
    g.fillStyle = occ;
    g.fillRect(-24, -4, 48, 18);
    if (big) {
      // extensor tendons fanning from the wrist to each knuckle (lit ridge + soft shadow), faint veins
      for (const fi of fingers) {
        const ex = fi.pts[0], ey = fi.pts[1] + 5;
        const sx = fi.pts[0] * 0.3, sy = 2;
        g.strokeStyle = rgba(shadeAt(skin, R.lx * 0.4, R.ly * 0.4, 0.9, R, Mskin), 0.14);
        g.lineWidth = 3.2;
        g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo((sx + ex) / 2 + 0.6, (sy + ey) / 2, ex, ey); g.stroke();
        g.strokeStyle = "rgba(90,30,10,0.06)";
        g.lineWidth = 2.6;
        g.beginPath(); g.moveTo(sx - R.lx * 1.6, sy); g.quadraticCurveTo((sx + ex) / 2 - R.lx * 1.4, (sy + ey) / 2, ex - R.lx * 1.4, ey); g.stroke();
      }
      g.strokeStyle = "rgba(80,90,150,0.09)";
      g.lineWidth = lw * 2.2;
      g.beginPath();
      g.moveTo(-6, 6); g.bezierCurveTo(-8, -10, 2, -18, 0, -32);
      g.moveTo(8, 4); g.bezierCurveTo(10, -12, 6, -22, 9, -34);
      g.stroke();
      // metacarpal knuckle bumps: lit domes with darker valleys between them
      for (const fi of fingers) {
        const kx = fi.pts[0], ky = fi.pts[1] + 1;
        const kg = g.createRadialGradient(kx + R.lx * 1.5, ky + R.ly * 1.5, 0.5, kx, ky, fi.wid * (0.55 + curl * 0.2));
        kg.addColorStop(0, rgba(shadeAt(mix(skin, "#e89a88", 0.25 + curl * 0.2), R.lx * 0.5, R.ly * 0.5, 0.85, R, Mskin), 0.7));
        kg.addColorStop(1, rgba(skin, 0));
        g.fillStyle = kg;
        g.fillRect(kx - 8, ky - 8, 16, 16);
      }
    }
    g.restore();
  }


  if (torch) {
    drawTorchGripOverlay(g, R, fingers, skin, lw);
    g.save();
    g.translate(-R.lx * 3, -R.ly * 3 + 1.5);
    g.fillStyle = "rgba(10,4,0,0.35)";
    g.fill(th.p);
    g.restore();
    fillThumb();
  }

  // joint creases, knuckle wrinkles, nails
  for (const fi of fingers.concat([th])) {
    const isTh = fi === th;
    const [ax, ay, bx, by, cx, cy] = fi.pts;
    const dirx = Math.cos(fi.ang), diry = Math.sin(fi.ang);
    const px = -diry, py = dirx;
    // PIP + DIP wrinkle sets (concentric short arcs)
    const crease = (jx, jy, n, wv, a) => {
      g.strokeStyle = `rgba(110,40,22,${a})`;
      g.lineWidth = lw * 0.9;
      g.beginPath();
      for (let k = 0; k < n; k++) {
        const o2 = (k - (n - 1) / 2) * 1.0;
        const cx2 = jx + dirx * o2, cy2 = jy + diry * o2;
        const w2 = wv * (1 - Math.abs(k - (n - 1) / 2) * 0.18);
        g.moveTo(cx2 - px * w2, cy2 - py * w2);
        g.quadraticCurveTo(cx2 + dirx * 0.8, cy2 + diry * 0.8, cx2 + px * w2, cy2 + py * w2);
      }
      g.stroke();
    };
    if (big) {
      crease(bx, by, isTh ? 2 : 3, fi.wid * 0.3, 0.28);
      crease(cx, cy, 2, fi.wid * 0.24, 0.22);
      // knuckle pinkness on the flexed joint
      const kg = g.createRadialGradient(bx, by, 0, bx, by, fi.wid * 0.5);
      kg.addColorStop(0, `rgba(220,110,90,${0.12 + fi.curl * 0.12})`);
      kg.addColorStop(1, "rgba(220,110,90,0)");
      g.fillStyle = kg;
      g.fillRect(bx - 6, by - 6, 12, 12);
    } else {
      g.strokeStyle = "rgba(110,40,22,0.3)";
      g.lineWidth = lw * 1.2;
      g.beginPath();
      g.moveTo(bx - px * 2.5, by - py * 2.5);
      g.lineTo(bx + px * 2.5, by + py * 2.5);
      g.stroke();
    }
    if (fi.curl > 0.8 && !isTh) continue;
    // nail plate: short child's nail, a pale lunula, cuticle, a whiter free edge, a sharp glint
    const [tx, ty] = fi.tip;
    g.save();
    g.translate(tx, ty);
    g.rotate(fi.ang + Math.PI / 2);
    const nw = fi.wid * 0.27, nh = fi.wid * 0.34;
    const np = new Path2D();
    roundRect(np, -nw, 1.6, nw * 2, nh * 2, nw * 0.9);
    const nailC = mix(skin, "#e8a6a0", 0.35);
    const ng = g.createLinearGradient(-nw, 0, nw, 0);
    ng.addColorStop(0, shadeAt(nailC, -0.8, 0, 0.6, R, MAT.pvc));
    ng.addColorStop(0.5, shadeAt(nailC, 0, 0, 1, R, MAT.pvc));
    ng.addColorStop(1, shadeAt(nailC, 0.8, 0, 0.6, R, MAT.pvc));
    g.fillStyle = ng;
    g.globalAlpha *= 0.85;
    g.fill(np);
    g.globalAlpha /= 0.85;
    // free edge (short, a thin pale rim), lunula hint, cuticle fold, a narrow glint
    g.fillStyle = "rgba(255,238,228,0.4)";
    g.fillRect(-nw * 0.8, 1.6, nw * 1.6, 0.6);
    g.fillStyle = "rgba(255,232,226,0.25)";
    g.beginPath(); g.ellipse(0, 1.6 + nh * 2 - 0.3, nw * 0.55, nh * 0.3, 0, Math.PI, TAU); g.fill();
    g.strokeStyle = "rgba(140,60,44,0.3)";
    g.lineWidth = lw * 0.7;
    g.beginPath(); g.ellipse(0, 1.6 + nh * 2, nw * 0.95, nh * 0.3, 0, 0, Math.PI); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.4)";
    g.fillRect(-nw * 0.4 + R.lx * nw * 0.45, 2.4, nw * 0.22, nh * 1.1);
    g.restore();
  }

  // micro detail + subsurface on the whole silhouette
  if (big) texFill(g, all, "skin", 0.22, 0.32, "overlay");
  crescent(g, all, R.lx * 6, R.ly * 6, "#5a1a08", 0.22, [-45, -110, 45, 15], "source-over", 2);
  // translucency: warm red-orange glow where the flesh is thin (edges), strong when backlit
  crescent(g, all, -R.lx * 1.4, -R.ly * 1.4, "#ff6a3a", (R.back ? 0.5 : 0.12) * Math.max(0.4, R.rim), [-45, -110, 45, 15], "lighter", 2);
  if (R.rim > 0) { const rw = (1.8 + size * 0.003) / u; crescent(g, all, -R.lx * rw, -R.ly * rw, R.css, 0.55 * R.rim, [-45, -110, 45, 15], "lighter", 2); }
  if (wet > 0.15 && big) {
    for (let i = 0; i < Math.round(14 * wet); i++) {
      const fi = fingers[i % 4];
      const k = hash(i, 71);
      const bx = lerp(fi.pts[0], fi.tip[0], k) + (hash(i, 72) - 0.5) * fi.wid * 0.6, by = lerp(fi.pts[1], fi.tip[1], k);
      const r = 0.6 + hash(i, 73) * 1.1;
      g.fillStyle = "rgba(90,30,10,0.18)"; g.beginPath(); g.arc(bx, by + r * 0.2, r, 0, TAU); g.fill();
      g.fillStyle = "rgba(255,255,255,0.75)"; g.beginPath(); g.arc(bx + R.lx * r * 0.4, by + R.ly * r * 0.4, r * 0.32, 0, TAU); g.fill();
    }
  }

  // bell on a red string round the wrist (FILMS.md: from f01 on)
  if (o.bell) {
    // twisted cotton string: a dark core with a lighter twist pattern
    g.lineCap = "round";
    g.strokeStyle = "#7a1c1a";
    g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(-21, 6); g.quadraticCurveTo(0, 13, 21, 6); g.stroke();
    g.strokeStyle = "#c2443c";
    g.lineWidth = 1.2;
    g.setLineDash && g.setLineDash([1.4, 1.2]);
    g.beginPath(); g.moveTo(-21, 5.6); g.quadraticCurveTo(0, 12.6, 21, 5.6); g.stroke();
    g.setLineDash && g.setLineDash([]);
    const bx = 2, by = 17 + Math.sin(t * 3) * 0.8;
    g.strokeStyle = "#7a1c1a";
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(1.5, 10.2); g.lineTo(bx, by - 5); g.stroke();
    g.fillStyle = "rgba(20,8,0,0.3)";
    g.beginPath(); g.ellipse(bx - R.lx * 2, by - R.ly * 2 + 2, 5.6, 4.6, 0, 0, TAU); g.fill();
    g.fillStyle = sphereGrad(g, bx, by, 5.6, "#d6a040", R, MAT.metal);
    g.beginPath(); g.arc(bx, by, 5.4, 0, TAU); g.fill();
    g.strokeStyle = "rgba(40,22,4,0.9)";
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(bx - 4.4, by + 0.6); g.quadraticCurveTo(bx, by + 1.6, bx + 4.4, by + 0.6);
    g.moveTo(bx, by + 1.2); g.lineTo(bx, by + 4.8);
    g.stroke();
    g.fillStyle = "#1a0e02";
    g.beginPath(); g.arc(bx, by + 2.6, 0.8, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,252,236,0.95)";
    g.beginPath(); g.arc(bx + R.lx * 2.4, by + R.ly * 2.4, 0.9, 0, TAU); g.fill();
  }
  if (o.item === "bell") drawHeldBell(g, R, t, false);
  g.restore();
  if (torch) {
    const len = size * 4;
    const tx = x + Math.cos(ang) * size * 1.32, ty = y + Math.sin(ang) * size * 1.32;
    flashlightBeam(g, tx, ty, ang, len, { spread: 0.36, t });
  }
}

// the torch in a fist (hand-local units): barrel along -y, head + lens at -112..-132
function drawTorch(g, R) {
  const M = MAT.metal;
  const body = new Path2D();
  roundRect(body, -15, -112, 20, 104, 3);
  g.fillStyle = cylGrad(g, -5, -112, -5, -8, 20, "#3c4048", R, M);
  g.fill(body);
  // knurled grip band
  g.save();
  g.clip(body);
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 0.7;
  g.beginPath();
  for (let i = 0; i < 18; i++) { const yy = -96 + i * 2.2; g.moveTo(-15, yy); g.lineTo(5, yy - 1.4); }
  g.stroke();
  g.restore();
  // the head: a wider bezel, a polished ring, the lens glowing
  const head = new Path2D();
  head.moveTo(-15, -110);
  head.lineTo(-18, -122);
  head.lineTo(-18, -132);
  head.lineTo(8, -132);
  head.lineTo(8, -122);
  head.lineTo(5, -110);
  head.closePath();
  g.fillStyle = cylGrad(g, -5, -132, -5, -110, 26, "#5a606a", R, M);
  g.fill(head);
  g.fillStyle = cylGrad(g, -5, -133, -5, -129, 27, "#c8ccd4", R, M);
  g.fillRect(-18.5, -133.5, 27, 3.4);
  const lg = g.createLinearGradient(-17, 0, 7, 0);
  lg.addColorStop(0, "#fff2c8");
  lg.addColorStop(0.5, "#ffffff");
  lg.addColorStop(1, "#fff2c8");
  g.fillStyle = lg;
  g.fillRect(-17, -135, 24, 2);
  // the switch
  g.fillStyle = "#1b1d22";
  g.fillRect(-7.6, -66, 5.2, 7);
}
// the curled fingers wrap the barrel: their middle phalanges show as rounded knuckles over it, the
// tips tucked underneath, a contact shadow where skin meets metal
function drawTorchGripOverlay(g, R, fingers, skin, lw) {
  g.save();
  g.strokeStyle = "rgba(10,4,0,0.35)";
  g.lineWidth = lw * 2;
  for (const fi of fingers) {
    g.beginPath();
    g.moveTo(fi.tip[0] - fi.wid * 0.5, fi.tip[1] - 1.4);
    g.quadraticCurveTo(fi.tip[0], fi.tip[1] - 3.2, fi.tip[0] + fi.wid * 0.5, fi.tip[1] - 1.4);
    g.stroke();
  }
  g.restore();
}
function drawHeldBell(g, R, t, behind) {
  // a brass bell pinched between the thumb and the curled index finger
  const bx = -16, by = -52, r = 12;
  if (behind) {
    g.fillStyle = "rgba(20,8,0,0.3)";
    g.beginPath(); g.ellipse(bx - R.lx * 3, by - R.ly * 3 + 3, r, r * 0.9, 0, 0, TAU); g.fill();
    g.fillStyle = sphereGrad(g, bx, by, r, "#d6a040", R, MAT.metal);
    g.beginPath(); g.arc(bx, by, r, 0, TAU); g.fill();
    g.strokeStyle = "rgba(40,22,4,0.85)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(bx - 9.5, by + 1.5); g.quadraticCurveTo(bx, by + 4, bx + 9.5, by + 1.5);
    g.stroke();
    g.fillStyle = "#1a0e02";
    g.beginPath(); g.arc(bx, by + 6, 1.8, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,252,236,0.95)";
    g.beginPath(); g.arc(bx + R.lx * 5, by + R.ly * 5, 2, 0, TAU); g.fill();
  }
}

function drawPaper(g, kind, t) {
  const poster = kind === "poster";
  const w = poster ? 120 : 84, h = poster ? 160 : 100;
  g.save();
  g.translate(0, -60);
  g.rotate(-0.06);
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.fillRect(-w / 2 + 3, -h + 4, w, h);
  const pg = g.createLinearGradient(0, -h, 0, 0);
  pg.addColorStop(0, "#f7f3ea");
  pg.addColorStop(1, "#dcd5c6");
  g.fillStyle = pg;
  g.fillRect(-w / 2, -h, w, h);
  // the photo of Biscuit
  const ph = poster ? [-w * 0.38, -h * 0.8, w * 0.76, h * 0.42] : [-w * 0.42, -h * 0.92, w * 0.84, h * 0.66];
  g.save();
  g.beginPath();
  g.rect(ph[0], ph[1], ph[2], ph[3]);
  g.clip();
  const bg = g.createLinearGradient(0, ph[1], 0, ph[1] + ph[3]);
  bg.addColorStop(0, "#8fb3c9");
  bg.addColorStop(1, "#5e7d4a");
  g.fillStyle = bg;
  g.fillRect(ph[0], ph[1], ph[2], ph[3]);
  drawCat(g, ph[0] + ph[2] * 0.5, ph[1] + ph[3] * 0.97, ph[3] * 0.48, { pose: "sit", headTurn: 0.8, t: 0, collar: true, bell: true });
  g.restore();
  // the paper bends where the fingers grip it: a soft crease shadow + a lit fold
  const cg = g.createLinearGradient(-w / 2, 0, w / 2, 0);
  cg.addColorStop(0, "rgba(0,0,0,0.08)");
  cg.addColorStop(0.45, "rgba(0,0,0,0)");
  cg.addColorStop(0.55, "rgba(255,255,255,0.06)");
  cg.addColorStop(1, "rgba(0,0,0,0.1)");
  g.fillStyle = cg;
  g.fillRect(-w / 2, -h, w, h);
  g.fillStyle = "#1c1a22";
  g.textAlign = "center";
  if (poster) {
    g.font = '900 20px "Arial Black", Impact, sans-serif';
    g.fillText("LOST CAT", 0, -h + 22);
    g.font = '700 13px "Segoe UI", sans-serif';
    g.fillText("BISCUIT", 0, -h * 0.28);
    g.font = '500 8.5px "Segoe UI", sans-serif';
    g.fillText("orange tabby, red collar,", 0, -h * 0.2);
    g.fillText("bent left ear. Please call!", 0, -h * 0.14);
    g.fillStyle = "#c2575b";
    for (let i = 0; i < 6; i++) g.fillRect(-w / 2 + 6 + i * 18, -14, 3, 12);
  } else {
    g.font = 'italic 600 9px "Segoe Print", "Comic Sans MS", cursive';
    g.fillText("Biscuit + me", 0, -12);
  }
  g.restore();
}
