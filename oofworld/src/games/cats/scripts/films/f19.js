// films/f19.js - Chapter 19 "The Bell" (FILMS.md f19). The last darkness before dawn on the cloud plateau.
// The paw ring is cold granite; you untie Biscuit's bell from your wrist and ring it. The sound is a ring of
// light; the stones answer one by one in amber, the cats' eyes catch fire, and through the ring: sunrise,
// and a small orange cat on a hill. His meow. You step into the light.
//
// Realism pass (REALISM.md): the plateau, the stones and the bell are baked per-pixel once (height field ->
// normals -> sky-dome + dawn-rim lighting, frost on up-facing facets, cracks that later carry the light),
// then every frame is only drawImage + a few gradients. One motivated key per shot: the pre-dawn glow on the
// horizon (cool, low, behind the ring) until the ring itself becomes the light. Depth of field comes from
// pre-blurred cached layers; the GPU lens does bloom / halation / grain / grade (film.grade / gradeAt).
// draw(g, t, W, H) is a pure function of t; only static art is cached.
import * as K from "../filmkit.js";
import { inLayer, put, CROWD, lines } from "./lib1820.js";

const D = 64;
const TAU = Math.PI * 2;
const { clamp, lerp } = K;
const sm = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const toLin = (c) => { const p = K.parseColor(c); return [Math.pow(p[0] / 255, 2.2), Math.pow(p[1] / 255, 2.2), Math.pow(p[2] / 255, 2.2)]; };
const toS = (v) => 255 * Math.pow(v < 0 ? 0 : v > 1 ? 1 : v, 1 / 2.2);

// ---- palette (FILMS.md f19) --------------------------------------------------------------------------------
const AMBER = "#ffb347";
const GOLD = "#ffd27a";
const DAWN = "#c08aa0";       // the pre-dawn glow low on the horizon: the key until the ring lights
const AMB_NIGHT = "#0d1124";  // the shadow side of everything under a night sky

// ---- baked caches (own map: these are big and must not be evicted by the kit's sprite LRU) -------------------
const BAKES = new Map();
function baked(key, make) {
  let c = BAKES.get(key);
  if (!c) { c = make(); BAKES.set(key, c); }
  return c;
}
// a pixel-scaled sprite in our own cache (the kit sprite cache clears itself wholesale when it fills up)
function ownSprite(key, w, h, paint) {
  const px = K.pixelScale();
  return baked("spr:" + key + "@" + px, () => {
    const c = K.makeCanvas(w * px, h * px);
    const g = c.getContext("2d");
    g.setTransform(px, 0, 0, px, 0, 0);
    try { paint(g, w, h); } catch (err) { console.warn("[f19] sprite", key, err); }
    return c;
  });
}
// ---- incremental bakes: heavy art is a generator that yields every few ms; warmAhead() steps the jobs for the
// next shots under a wall-clock budget, and a frame that needs one before it is done simply finishes it (so the
// picture never depends on how much warming happened: draw stays a pure function of t; only the timing varies).
const nowMs = () => (typeof performance !== "undefined" && performance.now ? performance.now() : 0);
const JOBS = new Map();
function jobOf(key, make) {
  const k = key + "@" + K.pixelScale();
  let j = JOBS.get(k);
  if (!j) { j = { it: null, make, done: false, value: null }; JOBS.set(k, j); }
  return j;
}
function stepJob(j, deadline) {
  if (j.done) return true;
  if (!j.it) j.it = j.make();
  while (!j.done) {
    let r;
    try { r = j.it.next(); } catch (err) { console.warn("[f19] bake", err); j.done = true; j.value = null; break; }
    if (r.done) { j.done = true; j.value = r.value; j.it = null; break; }
    if (deadline != null && nowMs() >= deadline) break;
  }
  return j.done;
}
// the finished result (bakes synchronously if warming has not got there yet)
function need(key, make) { const j = jobOf(key, make); stepJob(j, null); return j.value; }
function isReady(key) { const j = JOBS.get(key + "@" + K.pixelScale()); return !!(j && j.done); }

// a full-frame layer painted one step (one cat, one pass) per generator step, optionally pre-blurred at the end
function* paintJob(W, H, steps, blur) {
  const px = K.pixelScale();
  const c = K.makeCanvas(Math.ceil(W * px), Math.ceil(H * px));
  const q = c.getContext("2d");
  for (const s of steps) {
    q.setTransform(px, 0, 0, px, 0, 0);
    try { s(q, c); } catch (err) { console.warn("[f19] layer step", err); }
    yield 0;
  }
  if (!blur) return c;
  const k = Math.max(1, blur / 2.2);
  const w = Math.ceil(c.width / k), h = Math.ceil(c.height / k);
  const small = K.makeCanvas(w, h);
  const s = small.getContext("2d");
  s.imageSmoothingEnabled = true;
  s.drawImage(c, 0, 0, w, h);
  if (!K.hasFilter()) return small;
  yield 0;
  const out = K.makeCanvas(w, h);
  const o = out.getContext("2d");
  o.filter = `blur(${K.qblur(Math.min(6, blur / k).toFixed(2))}px)`;
  o.drawImage(small, 0, 0);
  o.filter = "none";
  return out;
}
const LAYERS = {};
function defLayer(key, blur, steps) { LAYERS[key] = { blur, steps }; }
const layerJob = (key) => jobOf("L:" + key, () => paintJob(960, 540, LAYERS[key].steps(), LAYERS[key].blur));
function lay(key) { const j = layerJob(key); stepJob(j, null); return j.value; }
// rim light on whatever is already in the layer: the edges that face the light (dx, dy px toward it) glow
function rimPass(dx, dy, color, a, noiseK = 0) {
  return (q, c) => {
    const T = K.makeCanvas(c.width, c.height);
    const x = T.getContext("2d");
    x.drawImage(c, 0, 0);
    x.globalCompositeOperation = "source-in";
    x.fillStyle = color;
    x.fillRect(0, 0, T.width, T.height);
    x.globalCompositeOperation = "destination-out";
    const px = K.pixelScale();
    x.drawImage(c, -dx * px, -dy * px);
    if (noiseK > 0) {
      // fur-edge breakup: the rim is broken into strands by a fine noise mask
      x.globalCompositeOperation = "destination-in";
      x.drawImage(strandMask(), 0, 0, T.width, T.height);
    }
    q.save();
    q.setTransform(1, 0, 0, 1, 0, 0);
    q.globalCompositeOperation = "lighter";
    q.globalAlpha = a;
    q.drawImage(T, 0, 0);
    q.restore();
  };
}
// a full-frame mask of short vertical strands (alpha), for breaking up rim light along fur edges
function strandMask() {
  return baked("strands", () => {
    const w = 480, h = 270;
    const c = K.makeCanvas(w, h);
    const x = c.getContext("2d");
    const im = x.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
      const n = K.texNoise(i * 0.9, y * 0.22, 401) * 0.6 + K.texNoise(i * 2.3, y * 0.5, 402) * 0.4;
      im.data[(y * w + i) * 4 + 3] = 255 * clamp(0.55 + n * 1.1);
    }
    x.putImageData(im, 0, 0);
    return c;
  });
}
function veilPass(color, a) {
  return (q) => { q.save(); q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = "source-atop"; q.fillStyle = K.rgba(color, a); q.fillRect(0, 0, q.canvas.width, q.canvas.height); q.restore(); };
}
// where a cat's eyes are (size units from its ground point, facing right): probe a black cat with glowing eyes
function eyeProbe(pose, ht) {
  const hq = Math.round(ht * 5) / 5;
  return baked("eye:" + pose + ":" + hq, () => {
    const S = 60, cw = 260, ch = 200, ox = 120, oy = 180;
    const c = K.makeCanvas(cw, ch);
    const q = c.getContext("2d", { willReadFrequently: true }); // read back below: keep it off the GPU
    q.fillStyle = "#000"; q.fillRect(0, 0, cw, ch);
    try {
      K.cpuMode(() => { K.drawCat(q, ox, oy, S, { pose, facing: 1, headTurn: hq, coat: K.COATS.black, eyesGlow: 1, collar: false, bell: false, shadow: false, t: 0, autoBlink: false, blink: 0, pupil: 1, flat: true, light: { x: ox, y: oy - 400, color: "#000000", strength: 0 } }); }); // probe: painted on the CPU so the read-back below cannot stall the GPU
    } catch (err) { return [{ x: 0.55, y: -1.25 }]; }
    const d = q.getImageData(0, 0, cw, ch).data;
    const pts = [];
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const o = (y * cw + x) * 4;
      const l = d[o] * 0.3 + d[o + 1] * 0.59 + d[o + 2] * 0.11;
      if (l > 110) pts.push([x, y, l]);
    }
    if (!pts.length) return [{ x: 0.55, y: -1.25 }];
    pts.sort((a, b) => a[0] - b[0]);
    // split into two eyes at the widest x gap (if there is one)
    let gi = -1, gap = 0;
    for (let i = 1; i < pts.length; i++) { const gp = pts[i][0] - pts[i - 1][0]; if (gp > gap) { gap = gp; gi = i; } }
    const groups = gap > 2.5 ? [pts.slice(0, gi), pts.slice(gi)] : [pts];
    return groups.map((G) => {
      let sx = 0, sy = 0, sw = 0;
      for (const [x, y, l] of G) { sx += x * l; sy += y * l; sw += l; }
      return { x: (sx / sw - ox) / S, y: (sy / sw - oy) / S };
    });
  });
}

// paint fn into a W x H logical canvas (pixel-scaled) and keep a pre-blurred copy of it
function blurredSprite(key, W, H, blur, paint) {
  return baked("blur:" + key + ":" + blur + "@" + K.pixelScale(), () => {
    const src = ownSprite("src:" + key, W, H, paint);
    const k = Math.max(1, blur / 2.2);
    const w = Math.ceil(src.width / k), h = Math.ceil(src.height / k);
    const small = K.makeCanvas(w, h);
    const s = small.getContext("2d");
    s.imageSmoothingEnabled = true;
    s.drawImage(src, 0, 0, w, h);
    if (!K.hasFilter()) return small;
    const out = K.makeCanvas(w, h);
    const o = out.getContext("2d");
    o.filter = `blur(${K.qblur(Math.min(6, blur / k).toFixed(2))}px)`;
    o.drawImage(small, 0, 0);
    o.filter = "none";
    return out;
  });
}

// ---- the plateau: a cloud-top crust, baked once in perspective -------------------------------------------------
// Row 0 is the horizon; the camera is ~1.7 m above soft billowed cloud packed hard as snow. Octaves are dropped as
// the pixel footprint grows (no shimmer at distance), slopes facing the far dawn glow get a pink rim and a long
// specular sheen, the rest stays in blue sky-shade; aerial perspective takes it into the horizon haze.
const GW = 1400, GH = 340, GF = 760, GCAM = 1.7;
function plateauBake() {
  return baked("plateau", () => {
    const c = K.makeCanvas(GW, GH);
    const x = c.getContext("2d");
    const img = x.createImageData(GW, GH);
    const Dd = img.data;
    const Hf = new Float32Array(GW * GH);
    const zr = new Float32Array(GH);
    for (let r = 0; r < GH; r++) zr[r] = (GCAM * GF) / (r + 0.6);
    const oct = (f, fp) => clamp(1.6 - f * fp * 3.2);
    for (let r = 0; r < GH; r++) {
      const z = zr[r], fp = z / GF;
      for (let col = 0; col < GW; col++) {
        const xw = ((col - GW / 2) * z) / GF;
        // big soft billows, cauliflower lumps, wind-packed crust, fine grain
        let h = K.texFbm(xw * 0.07, z * 0.07, 191, 3) * 1.1;
        const w1 = oct(0.35, fp);
        if (w1 > 0) { const b = 1 - Math.abs(K.texNoise(xw * 0.35, z * 0.42, 192)); h += b * b * 0.55 * w1; }
        const w2 = oct(1.3, fp);
        if (w2 > 0) { const b = 1 - Math.abs(K.texNoise(xw * 1.3, z * 1.6, 193)); h += b * b * 0.12 * w2; }
        const w3 = oct(5, fp);
        if (w3 > 0) h += K.texNoise(xw * 5, z * 6, 194) * 0.025 * w3;
        Hf[r * GW + col] = h;
      }
    }
    const L = (() => { const v = [0.42, 0.16, 1]; const n = Math.hypot(v[0], v[1], v[2]); return v.map((q) => q / n); })();
    const sky = toLin("#3c4a7a"), dawn = toLin("#e6a4b4"), haze = toLin("#463c5e"), deep = toLin("#151a34");
    for (let r = 0; r < GH; r++) {
      const z = zr[r], fp = z / GF;
      const r0 = Math.max(0, r - 1), r1 = Math.min(GH - 1, r + 1);
      const dz = zr[r0] - zr[r1] || 1e-3;
      const fog = 1 - Math.exp(-z / 70);
      for (let col = 0; col < GW; col++) {
        const i = r * GW + col;
        const c0 = Math.max(0, col - 1), c1 = Math.min(GW - 1, col + 1);
        const dhx = (Hf[r * GW + c1] - Hf[r * GW + c0]) / ((c1 - c0) * fp);
        const dhz = (Hf[r0 * GW + col] - Hf[r1 * GW + col]) / dz;
        let nx = -dhx, ny = 1, nz = -dhz;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        const xw = ((col - GW / 2) * z) / GF;
        // view ray and its mirror for the sheen toward the dawn
        let vx = xw, vy = -GCAM, vz = z; const vl = Math.hypot(vx, vy, vz); vx /= vl; vy /= vl; vz /= vl;
        const dn = vx * nx + vy * ny + vz * nz;
        const rx = vx - 2 * dn * nx, ry = vy - 2 * dn * ny, rz = vz - 2 * dn * nz;
        const spec = Math.pow(Math.max(0, rx * L[0] + ry * L[1] + rz * L[2]), 18) * 0.5;
        const dif = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        const hemi = 0.55 + 0.45 * ny;
        const cav = clamp(0.75 + (Hf[i] - 0.3) * 0.5, 0.45, 1.05);
        const alb = 0.8;
        let R = alb * (sky[0] * hemi * cav * 0.55 + dawn[0] * dif * 0.42) + dawn[0] * spec;
        let G = alb * (sky[1] * hemi * cav * 0.55 + dawn[1] * dif * 0.42) + dawn[1] * spec;
        let B = alb * (sky[2] * hemi * cav * 0.55 + dawn[2] * dif * 0.42) + dawn[2] * spec;
        // deep troughs between billows go blue-black (occluded from the sky)
        const occ = sm(0.1, -0.6, Hf[i]) * 0.3;
        R = lerp(R, deep[0], occ); G = lerp(G, deep[1], occ); B = lerp(B, deep[2], occ);
        // ice crystals catching the dawn, only close to camera
        if (z < 14 && K.hash(i, 19) > 0.9992) { const s = 0.25 * (1 - z / 14); R += s; G += s; B += s * 1.1; }
        R = lerp(R, haze[0], fog); G = lerp(G, haze[1], fog); B = lerp(B, haze[2], fog);
        const o = i * 4;
        Dd[o] = toS(R); Dd[o + 1] = toS(G); Dd[o + 2] = toS(B); Dd[o + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  });
}
// draw the plateau under horizon hz (camera space), s = scale (bigger = lower, closer camera)
function plateau(g, W, H, hz, s = 1, cx = W / 2) {
  const c = plateauBake();
  g.drawImage(c, cx - (GW / 2) * s, hz - 0.5, GW * s, GH * s * 1.2);
  // a thin luminous seam where the cloud sea meets the sky
  const sg = g.createLinearGradient(0, hz - 6, 0, hz + 10);
  sg.addColorStop(0, "rgba(120,96,130,0)");
  sg.addColorStop(0.45, "rgba(132,104,136,0.55)");
  sg.addColorStop(1, "rgba(80,70,104,0)");
  g.fillStyle = sg;
  g.fillRect(cx - GW * s * 0.5, hz - 6, GW * s, 16);
}

// ---- the sky: pre-dawn, stars fading toward a rose band, far cloud banks (baked per horizon) -------------------
function nightSky(g, W, H, hz, t, o = {}) {
  const dx = o.dawnX == null ? 0.7 : o.dawnX;
  const spr = skySprite(hz, dx, W, H);
  g.drawImage(spr, -120, -60, W + 240, H + 120);
  starsOver(g, W, H, hz, t);
}
function skySprite(hz, dx, W = 960, H = 540) {
  const key = "f19sky:" + Math.round(hz) + ":" + dx;
  return ownSprite(key, W + 240, H + 120, (s) => {
    const WW = W + 240, HH = H + 120, h2 = hz + 60;
    K.sky(s, WW, HH, { top: "#02040d", mid: "#0a1030", bottom: "#3a2f52", horizon: h2 / HH, night: true, glow: "#7a5068", haze: 0.7 });
    // the dawn: a broad low rose glow toward where the sun will come up
    s.save();
    s.translate(WW * dx, h2);
    s.scale(1, 0.28);
    const dg = s.createRadialGradient(0, 0, 0, 0, 0, WW * 0.7);
    dg.addColorStop(0, "rgba(200,128,140,0.55)");
    dg.addColorStop(0.25, "rgba(150,92,130,0.3)");
    dg.addColorStop(0.6, "rgba(80,60,110,0.12)");
    dg.addColorStop(1, "rgba(40,40,90,0)");
    s.fillStyle = dg;
    s.fillRect(-WW, -h2 / 0.28, WW * 2, (h2 / 0.28) * 2);
    s.restore();
    // far towering cloud banks on the horizon, back-lit by the dawn
    K.cloudLayer3d(s, WW, HH, 0, { seed: 1919, horizon: h2 + 4, y: h2 - 70, count: 9, color: "#5a4a6c", shade: "#141630", haze: "#3a2f52", kind: "stratus", sun: { x: WW * dx, y: h2 + 30 }, alpha: 0.75, scale: 0.75, speed: 0 });
  });
}
function starsOver(g, W, H, hz, t) {
  // stars (only the bright ones twinkle), dimmed toward the horizon by extinction
  g.save();
  g.beginPath(); g.rect(-120, -60, W + 240, hz - 30 + 60); g.clip();
  K.stars(g, W, H, 19, 1.5, t, { yMax: hz - 30 });
  const ex = g.createLinearGradient(0, hz - 180, 0, hz);
  ex.addColorStop(0, "rgba(58,47,82,0)");
  ex.addColorStop(1, "rgba(58,47,82,0.9)");
  g.fillStyle = ex;
  g.fillRect(-120, hz - 180, W + 240, 180);
  g.restore();
}

// ---- the paw ring: five weathered granite stones, baked per-pixel -----------------------------------------------
// piece 0 = the big pad (bottom), 1..4 = toe-beans in an arc above. Angles around the ring centre (y down).
const PAW = [Math.PI / 2, -Math.PI / 2 - 1.14, -Math.PI / 2 - 0.38, -Math.PI / 2 + 0.38, -Math.PI / 2 + 1.14];
const STONE_N = [256, 176, 176, 176, 176];
const FACETS = [[0.3, 0.52, -0.32], [2.4, 0.5, -0.3], [4.1, 0.56, -0.36], [5.5, 0.6, -0.25]];
// returns { base, emit, amber, glints:[[u,v]...] } ; u,v in -1..1 sprite space
function stoneBake(i) {
  return baked("stone" + i, () => {
    const S = STONE_N[i], pad = i === 0;
    const a = PAW[i], ox = Math.cos(a), oy = Math.sin(a);
    const ax = pad ? 0.92 : 0.6, ay = pad ? 0.66 : 0.82;
    const seed = 1900 + i * 17;
    const N = S * S;
    const Hf = new Float32Array(N), Cm = new Float32Array(N), Al = new Float32Array(N), Dm = new Float32Array(N), Sp = new Float32Array(N);
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const x = ((px + 0.5) / S) * 2 - 1, y = ((py + 0.5) / S) * 2 - 1;
        const lv = x * ox + y * oy, lu = -x * oy + y * ox; // radial (outward) / tangential
        const ang = Math.atan2(lv, lu);
        let b = 1 + 0.08 * K.texFbm(Math.cos(ang) * 1.6 + seed, Math.sin(ang) * 1.6, seed, 3) + 0.025 * K.texNoise(Math.cos(ang) * 7, Math.sin(ang) * 7, seed + 1);
        if (pad) {
          const g1 = Math.exp(-Math.pow((ang - (Math.PI / 2 - 0.45)) / 0.16, 2)), g2 = Math.exp(-Math.pow((ang - (Math.PI / 2 + 0.45)) / 0.16, 2));
          b *= 1 - 0.14 * (g1 + g2);
          if (lv < 0) b *= 1 - 0.06 * Math.pow(-lv, 2); // the front edge (toward the toes) a little flatter
        }
        const q = Math.hypot(lu / ax, lv / ay) / b;
        const i0 = py * S + px;
        if (q >= 1.02) { Hf[i0] = -0.05; Al[i0] = 0; continue; }
        const dome = Math.sqrt(Math.max(0, 1 - q * q));
        const warp = K.texFbm(x * 2 + seed, y * 2, seed + 3, 3);
        let h = Math.pow(dome, 0.55) * 0.62 + K.texFbm(x * 1.6, y * 1.6, seed + 5, 3) * 0.07 * dome + K.texFbm(x * 7, y * 7, seed + 7, 2) * 0.008;
        // split faces: a few planes shear the dome so it reads as quarried rock, not a smooth bun
        for (let f = 0; f < FACETS.length; f++) {
          const F = FACETS[f], fa = F[0] + i * 1.7;
          const pl = F[1] + (Math.cos(fa) * x + Math.sin(fa) * y) * F[2];
          if (pl < h) h = lerp(h, pl, 0.85);
        }
        // a few real fractures: one low-frequency network, broken up so cracks start and stop
        const cr = 1 - Math.abs(K.texNoise(x * 1.2 + warp * 0.8, y * 1.2 - warp * 0.5, seed + 11));
        const keep = sm(-0.05, 0.35, K.texFbm(x * 1.4 + 3, y * 1.4, seed + 12, 2));
        const crack = sm(0.968, 0.995, cr) * keep * sm(0.05, 0.3, dome);
        const halo = sm(0.9, 0.985, cr) * keep * sm(0.05, 0.3, dome);
        h -= crack * 0.03;
        Hf[i0] = h; Cm[i0] = crack; Sp[i0] = halo; Dm[i0] = dome;
        const edgePx = (1 - q) * Math.min(ax, ay) * S * 0.5;
        Al[i0] = clamp(edgePx + 0.5);
      }
    }
    const mk = () => { const c = K.makeCanvas(S, S); return [c, c.getContext("2d")]; };
    const [cb, xb] = mk(), [ce, xe] = mk(), [ca, xa] = mk();
    const ib = xb.createImageData(S, S), ie = xe.createImageData(S, S), ia = xa.createImageData(S, S);
    const B = ib.data, E = ie.data, A = ia.data;
    const base = toLin("#55575f"), fleckL = toLin("#a8aab2"), fleckD = toLin("#17181e"), lich = toLin("#8c9884"), frostC = toLin("#dfe8fb");
    const sky = toLin("#4a5a90"), bounce = toLin("#1c2036"), dawn = toLin("#ffb8c8");
    const Ld = [0.72, -0.28, -0.6], ln = Math.hypot(...Ld); Ld[0] /= ln; Ld[1] /= ln; Ld[2] /= ln;
    const tx = -ox, ty = -oy;
    const Lc = [tx * 0.85, ty * 0.85, 0.5], lc = Math.hypot(...Lc); Lc[0] /= lc; Lc[1] /= lc; Lc[2] /= lc;
    const glints = [];
    const k = S / 9;
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const i0 = py * S + px, o = i0 * 4;
        const al = Al[i0];
        if (al <= 0) continue;
        const xl = Hf[py * S + Math.max(0, px - 1)], xr = Hf[py * S + Math.min(S - 1, px + 1)];
        const yu = Hf[Math.max(0, py - 1) * S + px], yd = Hf[Math.min(S - 1, py + 1) * S + px];
        let nx = -(xr - xl) * k, ny = -(yd - yu) * k, nz = 1;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        const x = ((px + 0.5) / S) * 2 - 1, y = ((py + 0.5) / S) * 2 - 1;
        // granite: grey matrix, white feldspar and black mica flecks, slow colour drift, lichen on the tops
        const gn = K.texNoise(x * 60, y * 60, i * 7 + 3) * 0.8 + (K.hash(i0, i + 5) - 0.5) * 0.5;
        const drift = K.texFbm(x * 2.5, y * 2.5, i * 7 + 4, 3);
        let r = base[0] * (1 + drift * 0.3), gg = base[1] * (1 + drift * 0.28), bb = base[2] * (1 + drift * 0.22);
        if (gn > 0.55) { const f = sm(0.55, 0.85, gn) * 0.6; r = lerp(r, fleckL[0], f); gg = lerp(gg, fleckL[1], f); bb = lerp(bb, fleckL[2], f); }
        else if (gn < -0.5) { const f = sm(-0.5, -0.85, gn) * 0.7; r = lerp(r, fleckD[0], f); gg = lerp(gg, fleckD[1], f); bb = lerp(bb, fleckD[2], f); }
        const up = clamp(-ny * 1.5 + 0.1);
        const li = sm(0.25, 0.55, K.texFbm(x * 3 + 9, y * 3, i * 7 + 6, 3)) * up * 0.55;
        r = lerp(r, lich[0], li); gg = lerp(gg, lich[1], li); bb = lerp(bb, lich[2], li);
        // frost: thick on the up-facing shoulders, a fine rime everywhere else
        const fr = clamp(sm(0.05, 0.45, -ny + 0.35 * K.texFbm(x * 6, y * 6, i * 7 + 8, 3)) * 0.8 + 0.1 * sm(0.3, 0.9, K.hash(i0, i + 9)));
        r = lerp(r, frostC[0], fr); gg = lerp(gg, frostC[1], fr); bb = lerp(bb, frostC[2], fr);
        // light: sky dome from above, cool bounce from the cloud floor below, the dawn rim from behind right
        const hemi = 0.5 - 0.5 * ny;
        const ao = (1 - Cm[i0] * 0.7) * (0.55 + 0.45 * Math.pow(Dm[i0], 0.35));
        const dl = Math.max(0, nx * Ld[0] + ny * Ld[1] + nz * Ld[2]);
        const rimL = dl * dl * 1.1;
        const ir = lerp(bounce[0], sky[0], hemi) * ao * 1.25, ig = lerp(bounce[1], sky[1], hemi) * ao * 1.25, ib2 = lerp(bounce[2], sky[2], hemi) * ao * 1.25;
        let R = r * (ir + dawn[0] * rimL), G = gg * (ig + dawn[1] * rimL), Bc = bb * (ib2 + dawn[2] * rimL);
        // frost sparkle (specular, toward the dawn)
        const hx = Ld[0], hy = Ld[1], hz = Ld[2] + 1, hl = Math.hypot(hx, hy, hz);
        const sp = Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), 30) * fr * 0.5;
        R += sp; G += sp; Bc += sp * 1.05;
        if (fr > 0.5 && K.hash(i0, i + 13) > 0.9975) { R += 0.5; G += 0.52; Bc += 0.6; if (glints.length < 10 && K.hash(i0, i + 14) > 0.5) glints.push([x, y]); }
        B[o] = toS(R); B[o + 1] = toS(G); B[o + 2] = toS(Bc); B[o + 3] = al * 255;
        // emission: light welling out of the cracks, a dim heat glow through the body of the stone
        const cm = Cm[i0];
        // body: light glowing through the thinner rim of the stone and up from inside, uneven like embers
        const body = 0.1 * sm(-0.2, 0.6, K.texFbm(x * 2.2, y * 2.2, i + 31, 3)) * Dm[i0];
        const e = clamp(cm * 1.0 + Sp[i0] * 0.3 + body);
        const hot = clamp(cm * 1.2);
        E[o] = 255; E[o + 1] = lerp(118, 238, hot); E[o + 2] = lerp(34, 196, hot); E[o + 3] = e * al * 255;
        // surface lit by the ring's heart (warm, from the centre of the ring)
        const dc = Math.max(0, nx * Lc[0] + ny * Lc[1] + nz * Lc[2]);
        const lum = (r + gg + bb) / 3;
        // ... and the up-facing frost catches it as an amber specular sheen (glinting crystals on the shoulders)
        const hcx = Lc[0], hcy = Lc[1], hcz = Lc[2] + 1, hcl = Math.hypot(hcx, hcy, hcz);
        const asp = Math.pow(Math.max(0, (nx * hcx + ny * hcy + nz * hcz) / hcl), 14) * fr * 1.3 + (fr > 0.5 && K.hash(i0, i + 21) > 0.993 ? 0.8 * dc : 0);
        const adif = Math.pow(dc, 1.5) * (0.15 + lum * 1.4) * 0.75;
        const tot = adif + asp;
        const sk = tot > 0 ? asp / tot : 0;
        A[o] = 255; A[o + 1] = lerp(168, 226, sk); A[o + 2] = lerp(88, 170, sk); A[o + 3] = clamp(tot) * al * 255;
      }
    }
    xb.putImageData(ib, 0, 0); xe.putImageData(ie, 0, 0); xa.putImageData(ia, 0, 0);
    return { base: cb, emit: ce, amber: ca, glints, S };
  });
}
// how big each piece is drawn (half-size) and where it sits for a ring of radius r
function piece(i, x, y, r, tilt, t) {
  const pad = i === 0;
  const a = PAW[i] + Math.sin(t * 0.07) * 0.03 * (pad ? 0 : 1);
  const rr = pad ? r * 0.9 : r * 0.95;
  const bob = pad ? 0 : Math.sin(t * 0.6 + i * 1.7) * r * 0.012;
  return { x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * (1 - tilt) + bob, sz: r * (pad ? 0.46 : 0.31) };
}
// ring(g, x, y, r, t, {tilt, lit(i), amber, glint, haloK, shadowY})
function ring(g, x, y, r, t, o = {}) {
  const tilt = o.tilt == null ? 0.06 : o.tilt;
  const lit = o.lit || (() => 0);
  const amb = o.amber == null ? 0 : o.amber;
  for (let i = 0; i < 5; i++) {
    const S = stoneBake(i);
    const p = piece(i, x, y, r, tilt, t);
    const L = clamp(lit(i));
    if (i === 0 && o.shadowY != null) {
      // the pad rests on the cloud: occlusion where it sinks in
      K.shadowBlob(g, p.x, o.shadowY, p.sz * 0.75, p.sz * 0.1, { alpha: 0.75 });
    }
    if (i > 0 && o.shadowY != null) {
      // a floating toe still occludes a little sky: a faint broad shadow on the floor below it
      K.shadowBlob(g, p.x, o.shadowY + (p.y - y) * 0.05, p.sz * 0.8, p.sz * 0.08, { alpha: 0.18 * (1 - L) });
    }
    g.drawImage(S.base, p.x - p.sz, p.y - p.sz, p.sz * 2, p.sz * 2);
    const A = Math.max(amb, L * 0.8);
    g.save();
    g.globalCompositeOperation = "lighter";
    if (A > 0.01) { g.globalAlpha = clamp(A); g.drawImage(S.amber, p.x - p.sz, p.y - p.sz, p.sz * 2, p.sz * 2); }
    if (L > 0.01) {
      g.globalAlpha = clamp(L);
      g.drawImage(S.emit, p.x - p.sz, p.y - p.sz, p.sz * 2, p.sz * 2);
      if (L > 1) { g.globalAlpha = clamp(L - 1); g.drawImage(S.emit, p.x - p.sz, p.y - p.sz, p.sz * 2, p.sz * 2); }
    }
    g.restore();
    if (L > 0.01) {
      const hk = o.haloK == null ? 1 : o.haloK;
      K.glow(g, p.x, p.y, p.sz * 2.6 * hk, "#ff8a30", 0.22 * Math.min(1, L));
    }
    // frost glints: a few crystals flare as the camera drifts (they bloom in the lens)
    const gl = o.glint == null ? 1 : o.glint;
    if (gl > 0.01 && L < 0.5) {
      for (let k = 0; k < S.glints.length; k++) {
        const tw = Math.max(0, Math.sin(t * (0.9 + K.hash(k, i) * 1.3) + k * 2.3 + i));
        const a = tw * tw * tw * gl * (1 - L * 2);
        if (a < 0.03) continue;
        const gx = p.x + S.glints[k][0] * p.sz, gy = p.y + S.glints[k][1] * p.sz;
        K.glow(g, gx, gy, 2 + p.sz * 0.03, "#ffffff", a);
      }
    }
  }
}
// the cold membrane of the dead gate: the stars behind it bend a little, a silver sheen on its rim
function membrane(g, x, y, r, t, k = 1, tilt = 0.06) {
  if (k <= 0.01) return;
  g.save();
  g.translate(x, y);
  g.scale(1, 1 - tilt);
  const rr = r * 0.8;
  const mg = g.createRadialGradient(0, 0, rr * 0.55, 0, 0, rr);
  mg.addColorStop(0, K.rgba("#1a2248", 0.08 * k));
  mg.addColorStop(0.85, K.rgba("#8a96c0", 0.025 * k));
  mg.addColorStop(0.96, K.rgba("#cfd6e6", 0.05 * k * (0.8 + 0.2 * Math.sin(t * 1.3))));
  mg.addColorStop(1, K.rgba("#cfd6e6", 0));
  g.fillStyle = mg;
  g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.fill();
  // slow interference bands drifting across it (thin, like a soap film at night)
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 3; i++) {
    const yy = Math.sin(t * 0.3 + i * 2.1) * rr * 0.6;
    const bg = g.createLinearGradient(0, yy - rr * 0.12, 0, yy + rr * 0.12);
    bg.addColorStop(0, "rgba(160,176,220,0)");
    bg.addColorStop(0.5, K.rgba("#a8b4dc", 0.035 * k));
    bg.addColorStop(1, "rgba(160,176,220,0)");
    g.fillStyle = bg;
    g.beginPath(); g.arc(0, 0, rr * 0.97, 0, TAU); g.fill();
  }
  g.restore();
}
// ---- the bell: polished brass reflecting its world ------------------------------------------------------------
// env: what the sphere mirrors (sky above, a bright horizon band, the pale ground below); spec: key direction.
function brassBell(g, x, y, r, o = {}) {
  const rot = o.rot || 0;
  const warm = clamp(o.warm || 0);
  const lx = o.lx == null ? 0.55 : o.lx, ly = o.ly == null ? -0.4 : o.ly;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  // the loop on top
  g.strokeStyle = "#6a4a1a";
  g.lineWidth = Math.max(1, r * 0.16);
  g.beginPath(); g.ellipse(0, -r * 1.02, r * 0.24, r * 0.2, 0, Math.PI * 1.05, Math.PI * 1.95 + TAU); g.stroke();
  g.strokeStyle = "rgba(255,226,170,0.5)";
  g.lineWidth = Math.max(0.5, r * 0.05);
  g.beginPath(); g.ellipse(0, -r * 1.02, r * 0.24, r * 0.2, 0, Math.PI * 1.25, Math.PI * 1.6); g.stroke();
  g.beginPath(); g.arc(0, 0, r, 0, TAU);
  g.save();
  g.clip();
  // environment reflection: dark sky on top, the dawn band at the horizon, the cloud floor beneath
  const E = o.env;
  const top = E ? K.mix(E.top, "#6a4416", warm) : K.mix("#3a2c18", "#6a4416", warm);
  const band = E ? K.mix(E.band, "#fff0b0", warm) : K.mix("#ffd0a0", "#fff0b0", warm);
  const low = E ? K.mix(E.low, "#d8a050", warm) : K.mix("#a88a60", "#d8a050", warm);
  const eg = g.createLinearGradient(0, -r, 0, r);
  eg.addColorStop(0, top);
  eg.addColorStop(0.42, K.mix(top, E ? E.top : "#4a3412", 0.6));
  eg.addColorStop(0.5, K.mix(top, band, 0.55));
  eg.addColorStop(0.55, band);
  eg.addColorStop(0.62, K.mix(E ? E.low : "#6a4a1e", band, 0.3));
  eg.addColorStop(1, low);
  g.fillStyle = eg;
  g.fillRect(-r, -r, r * 2, r * 2);
  if (E && E.stars) {
    // the sky's brightest stars caught in the upper dome, squeezed toward the rim
    g.fillStyle = "rgba(220,226,255,0.7)";
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI * (0.15 + 0.7 * K.hash(k, 191)), rr = r * (0.35 + 0.55 * K.hash(k, 192));
      g.fillRect(Math.cos(a) * rr, Math.sin(a) * rr * 0.8, Math.max(0.5, r * 0.035), Math.max(0.5, r * 0.035));
    }
  }
  // brass colour (metal tints its reflections) + fresnel-darkened edge
  g.globalCompositeOperation = "multiply";
  g.fillStyle = "#e0a850";
  g.fillRect(-r, -r, r * 2, r * 2);
  g.globalCompositeOperation = "source-over";
  const fg = g.createRadialGradient(-lx * r * 0.2, -ly * r * 0.2, r * 0.4, 0, 0, r);
  fg.addColorStop(0, "rgba(0,0,0,0)");
  fg.addColorStop(1, "rgba(20,10,0,0.55)");
  g.fillStyle = fg;
  g.fillRect(-r, -r, r * 2, r * 2);
  // the slot and its two holes, and a soft seam round the equator
  g.fillStyle = "rgba(12,6,0,0.92)";
  g.beginPath(); g.ellipse(0, r * 0.38, r * 0.72, r * 0.07, 0, 0, TAU); g.fill();
  g.beginPath(); g.arc(-r * 0.66, r * 0.38, r * 0.11, 0, TAU); g.arc(r * 0.66, r * 0.38, r * 0.11, 0, TAU); g.fill();
  g.strokeStyle = "rgba(255,230,170,0.25)";
  g.lineWidth = Math.max(0.5, r * 0.04);
  g.beginPath(); g.ellipse(0, r * 0.47, r * 0.7, r * 0.06, 0, 0, Math.PI); g.stroke();
  g.strokeStyle = "rgba(40,20,0,0.4)";
  g.beginPath(); g.ellipse(0, -r * 0.02, r * 0.98, r * 0.12, 0, 0, Math.PI); g.stroke();
  g.restore();
  // specular: a hot core the lens blooms, and a soft lobe around it
  const sx = lx * r * 0.45, sy = ly * r * 0.45;
  const sg = g.createRadialGradient(sx, sy, 0, sx, sy, r * 0.5);
  sg.addColorStop(0, K.rgba("#fff6e0", 0.55 + 0.4 * (o.spec == null ? 1 : o.spec)));
  sg.addColorStop(0.25, K.rgba("#ffe0a8", 0.35));
  sg.addColorStop(1, "rgba(255,220,160,0)");
  g.globalCompositeOperation = "lighter";
  g.fillStyle = sg;
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.fillStyle = "#ffffff";
  g.globalAlpha = 0.9 * (o.spec == null ? 1 : o.spec);
  g.beginPath(); g.arc(sx, sy, Math.max(0.6, r * 0.09), 0, TAU); g.fill();
  g.restore();
}
// red cotton string: dark core, a lighter twist toward the light; pts = [x0,y0, cx,cy, x1,y1] (quadratic)
function cord(g, pts, w, o = {}) {
  const [x0, y0, cx, cy, x1, y1] = pts;
  g.save();
  g.lineCap = "round";
  g.strokeStyle = o.dark || "#4a0c0a";
  g.lineWidth = w;
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke();
  g.strokeStyle = o.color || "#a4281f";
  g.lineWidth = w * 0.62;
  g.beginPath(); g.moveTo(x0 - w * 0.12, y0 - w * 0.12); g.quadraticCurveTo(cx - w * 0.12, cy - w * 0.12, x1 - w * 0.12, y1 - w * 0.12); g.stroke();
  if (w > 1.6) {
    g.setLineDash([w * 0.5, w * 0.9]);
    g.strokeStyle = o.hi || "rgba(255,150,130,0.45)";
    g.lineWidth = w * 0.3;
    g.beginPath(); g.moveTo(x0 - w * 0.2, y0 - w * 0.2); g.quadraticCurveTo(cx - w * 0.2, cy - w * 0.2, x1 - w * 0.2, y1 - w * 0.2); g.stroke();
    g.setLineDash([]);
  }
  g.restore();
}
// the little tuft of orange fur knotted on the string: fine translucent strands
function furTuft(g, x, y, s, t, rim = "#ffd0a0") {
  g.save();
  g.lineCap = "round";
  for (let i = 0; i < 22; i++) {
    const a = -0.9 + (i / 21) * 1.8 + Math.sin(t * 2.6 + i * 1.3) * 0.06 + (K.hash(i, 3) - 0.5) * 0.3;
    const l = s * (0.45 + K.hash(i, 4) * 0.55);
    const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l;
    g.strokeStyle = i % 3 ? "rgba(214,124,52,0.55)" : K.rgba(rim, 0.45);
    g.lineWidth = Math.max(0.4, s * 0.035);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5 - l * 0.1, ex, ey); g.stroke();
  }
  g.restore();
}

// ---- hands: a 3D skeleton of tapered capsules, rasterised per pixel into a cached sprite -------------------------
// Local frame (units: wrist -> middle fingertip = 100): x right, y toward the wrist (fingers point -y), z out of the
// back of the hand. A right hand with identity view shows its back with the thumb on the left. Fingers taper to
// ~0.8x at the tip; flexion bends each segment toward the palm. The raster is a height field (front surface of
// every swept sphere, smooth-max blended), so overlaps occlude, webs blend, and the cavity / cast shadow come
// from the height field itself. Skin: wrapped diffuse with a subsurface red terminator, a cool sky rim, warm bounce,
// transmission at thin edges when backlit; nails are pale plates with a lighter free edge and a cuticle line.
const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
const FINGERS = [
  // base (MCP), spread, segment lengths, radii (MCP, PIP, DIP, tip)
  { b: [-15.2, -51.5, 0.4], sp: -0.07, L: [19.5, 12.5, 10], r: [5.7, 5.2, 4.75, 4.3] },
  { b: [-5.0, -54, 1.6], sp: -0.01, L: [21.5, 14.5, 10.8], r: [5.9, 5.4, 4.9, 4.4] },
  { b: [5.2, -52.5, 0.9], sp: 0.05, L: [20, 13.5, 10.2], r: [5.55, 5.05, 4.6, 4.15] },
  { b: [14.4, -47.5, -0.8], sp: 0.13, L: [15.5, 10.2, 9], r: [4.85, 4.4, 4.0, 3.6] },
];
// flex: [[mcp, pip, dip] x4], thumb: 'pinch' | {dir, len}
const HAND_POSES = {
  relaxed: { flex: [[0.22, 0.42, 0.22], [0.2, 0.44, 0.24], [0.26, 0.5, 0.26], [0.34, 0.56, 0.28]], abd: 0.55, thumb: { dir: [-0.3, -0.9, -0.3], spread: 0.15 } },
  pinch: { flex: [[0.62, 0.78, 0.32], [0.95, 1.3, 0.7], [1.12, 1.42, 0.78], [1.22, 1.5, 0.8]], abd: 0.6, thumb: "pinch" },
};
function handSkeleton(poseName) {
  const P = HAND_POSES[poseName];
  const caps = [];
  const cap = (a, b, ra, rb, o) => caps.push(Object.assign({ a, b, ra, rb, k: 1.4, mat: 0, fid: -1, seg: -1, s0: 0, len: v3.norm ? Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) : 0, u: [0, 0, 1], thin: 0.4 }, o));
  const tips = [];
  // the four fingers
  FINGERS.forEach((F, fi) => {
    const sp = F.sp * P.abd;
    let d = [Math.sin(sp), -Math.cos(sp), 0], u = [0, 0, 1];
    let p = F.b.slice();
    let s = 0;
    // knuckle bump on the back of the hand
    cap(v3.add(p, [0, 2.5, 1.2]), v3.add(p, [0, 1, 1.4]), F.r[0] * 0.82, F.r[0] * 0.8, { k: 3.2, mat: 0, thin: 0.3 });
    for (let k = 0; k < 3; k++) {
      const a = P.flex[fi][k];
      const c = Math.cos(a), sn = Math.sin(a);
      const nd = v3.sub(v3.mul(d, c), v3.mul(u, sn));
      const nu = v3.add(v3.mul(u, c), v3.mul(d, sn));
      d = nd; u = nu;
      const q = v3.add(p, v3.mul(d, F.L[k]));
      cap(p, q, F.r[k], F.r[k + 1], { k: k === 0 ? 2.6 : 1.1, mat: 1, fid: fi, seg: k, s0: s, u: u.slice(), thin: 1 });
      s += F.L[k];
      p = q;
    }
    tips.push({ p, d, u, r: F.r[3] });
  });
  // palm: metacarpal slabs blended into one, the thenar and hypothenar pads, the wrist
  FINGERS.forEach((F, fi) => {
    const c0 = [F.b[0] * 0.6, -6, -1.4];
    cap(c0, v3.add(F.b, [0, 4, -0.9]), 7.6 - fi * 0.3, F.r[0] * 1.3, { k: 6, mat: 0, thin: 0.25 });
  });
  cap([10, -7, -2.6], [14.6, -36, -2.4], 7.4, 6.2, { k: 5, mat: 0, thin: 0.3 });
  cap([0, 6, -2.4], [0, 30, -2.4], 11.6, 12.6, { k: 6, mat: 0, thin: 0.2 });
  // the thumb: CMC, metacarpal (inside the thenar), proximal, distal
  const cmc = [-10.5, -11, -4.8];
  let tipT, pole;
  const metaDir = P.thumb === "pinch" ? v3.norm([-0.42, -0.72, -0.55]) : v3.norm([-0.55, -0.72, -0.35]);
  const M = v3.add(cmc, v3.mul(metaDir, 21));
  if (P.thumb === "pinch") {
    const ix = tips[0];
    // pad of the index tip: on its palmar side, just short of the end
    const pad = v3.sub(v3.sub(ix.p, v3.mul(ix.u, ix.r * 0.55)), v3.mul(ix.d, 1.6));
    tipT = v3.sub(pad, v3.mul(ix.u, 4.0 * 0.95));
    pole = v3.norm([-1, 0.15, 0.55]);
  } else {
    tipT = v3.add(M, v3.mul(v3.norm(P.thumb.dir), 24));
    pole = v3.norm([-0.6, 0.2, 0.8]);
  }
  // two-bone IK for the thumb's MCP -> IP -> tip
  const L1 = 14.5, L2 = 11.5;
  let D = v3.sub(tipT, M);
  let dist = Math.hypot(D[0], D[1], D[2]);
  if (dist > L1 + L2 - 0.5) { tipT = v3.add(M, v3.mul(D, (L1 + L2 - 0.5) / dist)); D = v3.sub(tipT, M); dist = L1 + L2 - 0.5; }
  const dn = v3.mul(D, 1 / dist);
  const aa = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
  const hh = Math.sqrt(Math.max(0, L1 * L1 - aa * aa));
  const pp = v3.norm(v3.sub(pole, v3.mul(dn, v3.dot(pole, dn))));
  const J = v3.add(v3.add(M, v3.mul(dn, aa)), v3.mul(pp, hh));
  const thumbU1 = v3.norm(v3.sub(pp, v3.mul(v3.norm(v3.sub(J, M)), v3.dot(pp, v3.norm(v3.sub(J, M))))));
  const d2 = v3.norm(v3.sub(tipT, J));
  const thumbU2 = v3.norm(v3.sub(pp, v3.mul(d2, v3.dot(pp, d2))));
  cap(cmc, M, 7.6, 5.7, { k: 4.5, mat: 0, thin: 0.35 });
  cap([-6, -4, -4], v3.add(cmc, v3.mul(metaDir, 12)), 7.4, 6.6, { k: 5, mat: 0, thin: 0.3 }); // thenar pad
  cap(M, J, 5.6, 5.0, { k: 2.4, mat: 1, fid: 4, seg: 1, s0: 0, u: thumbU1, thin: 0.9 });
  cap(J, tipT, 5.0, 4.15, { k: 0.9, mat: 1, fid: 4, seg: 2, s0: L1, u: thumbU2, thin: 1 });
  const ix = tips[0];
  const pinch = v3.mul(v3.add(v3.sub(ix.p, v3.mul(ix.u, ix.r)), tipT), 0.5);
  return { caps, pinch, tipIndex: ix.p };
}
// the sleeve: a fleece tube from the wrist back, with compression folds near the cuff and a knit rib
function sleeveCaps(len = 150, r0 = 18.5, r1 = 22) {
  return [{ a: [0, 15, -1.2], b: [0, 15 + len, -1.2], ra: r0, rb: r1, k: 0.8, mat: 2, cut: true, fid: -1, seg: -1, s0: 0, len, u: [0, 0, 1], thin: 0 }];
}
function rotM(yaw, pitch, roll) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  // R = Rz(roll) * Rx(pitch) * Ry(yaw)
  const Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
  const Rx = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]];
  const Rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]];
  const mm = (A, B) => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
  return mm(Rz, mm(Rx, Ry));
}
const mv = (R, v) => [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]];
// bake job. o: {pose, left, yaw, pitch, roll, size (px per 100 units), sleeve, sleeveLen, light:{key,rim,bounce,sky,ground,amb,trans}, skin}
function* handJob(o) {
  const px = K.pixelScale();
  const ppu = (o.size / 100) * px;
  const S = handSkeleton(o.pose);
  let caps = S.caps.slice();
  if (o.sleeve) caps = caps.concat(sleeveCaps(o.sleeveLen || 150));
  const R = rotM(o.yaw || 0, o.pitch || 0, o.roll || 0);
  const mir = o.left ? -1 : 1;
  const tf = (v) => { const w = mv(R, [v[0] * mir, v[1], v[2]]); return [w[0] * ppu, w[1] * ppu, w[2] * ppu]; };
  const tfd = (v) => mv(R, [v[0] * mir, v[1], v[2]]);
  // projected capsules
  const PC = caps.map((c) => ({ c, A: tf(c.a), B: tf(c.b), ra: c.ra * ppu, rb: c.rb * ppu, k: c.k * ppu, U: tfd(c.u) }));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const q of PC) {
    const r = Math.max(q.ra, q.rb) + 2;
    x0 = Math.min(x0, q.A[0] - r, q.B[0] - r); x1 = Math.max(x1, q.A[0] + r, q.B[0] + r);
    y0 = Math.min(y0, q.A[1] - r, q.B[1] - r); y1 = Math.max(y1, q.A[1] + r, q.B[1] + r);
  }
  // clip the sleeve to a sane box (it runs off frame anyway)
  const maxExt = 260 * ppu;
  x0 = Math.max(x0, -maxExt); y0 = Math.max(y0, -maxExt); x1 = Math.min(x1, maxExt); y1 = Math.min(y1, maxExt);
  x0 = Math.floor(x0) - 3; y0 = Math.floor(y0) - 3;
  const w = Math.ceil(x1) - x0 + 3, h = Math.ceil(y1) - y0 + 3;
  const N = w * h;
  const Hb = new Float32Array(N).fill(-1e9), NX = new Float32Array(N), NY = new Float32Array(N), NZ = new Float32Array(N);
  const AL = new Float32Array(N), WI = new Int16Array(N).fill(-1), TT = new Float32Array(N), PH = new Float32Array(N);
  for (let ci = 0; ci < PC.length; ci++) {
    const q = PC[ci];
    const ax = q.A[0] - x0, ay = q.A[1] - y0, bx = q.B[0] - x0, by = q.B[1] - y0;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const rmax = Math.max(q.ra, q.rb) + 1;
    const qx0 = Math.max(0, Math.floor(Math.min(ax, bx) - rmax)), qx1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + rmax));
    const qy0 = Math.max(0, Math.floor(Math.min(ay, by) - rmax)), qy1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + rmax));
    const kk = Math.max(0.5, q.k);
    const cut = !!q.c.cut;
    for (let py = qy0; py <= qy1; py++) {
      for (let pxx = qx0; pxx <= qx1; pxx++) {
        const X = pxx + 0.5, Y = py + 0.5;
        let tt = L2 > 1e-6 ? ((X - ax) * dx + (Y - ay) * dy) / L2 : 0;
        if (cut && (tt < 0 || tt > 1)) continue; // an open tube (the sleeve): flat cuts, no round caps
        tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
        const cx = ax + dx * tt, cy = ay + dy * tt, r = q.ra + (q.rb - q.ra) * tt;
        const ex = X - cx, ey = Y - cy, d2 = ex * ex + ey * ey;
        if (d2 >= (r + 0.75) * (r + 0.75)) continue;
        const i = py * w + pxx;
        const dd = Math.sqrt(d2);
        const cov = clamp(r - dd + 0.5);
        if (cov > AL[i]) AL[i] = cov;
        const dz = Math.sqrt(Math.max(0, r * r - d2));
        const hz = q.A[2] + (q.B[2] - q.A[2]) * tt + dz;
        const ir = 1 / r;
        const nx = ex * ir, ny = ey * ir, nz = dz * ir;
        if (Hb[i] < -1e8) { Hb[i] = hz; NX[i] = nx; NY[i] = ny; NZ[i] = nz; WI[i] = ci; TT[i] = tt; PH[i] = Math.atan2(ex * (dy) - ey * (dx) >= 0 ? dd : -dd, dz); continue; }
        const H0 = Hb[i];
        const hb = clamp(0.5 + (0.5 * (hz - H0)) / kk);
        Hb[i] = H0 + (hz - H0) * hb + kk * hb * (1 - hb);
        NX[i] += (nx - NX[i]) * hb; NY[i] += (ny - NY[i]) * hb; NZ[i] += (nz - NZ[i]) * hb;
        if (hb > 0.5) { WI[i] = ci; TT[i] = tt; PH[i] = Math.atan2(ex * dy - ey * dx >= 0 ? dd : -dd, dz); }
      }
    }
    yield 0;
  }
  // fold / rib height on the sleeve (in px), added to the height field and its normals
  const FO = new Float32Array(N);
  if (o.sleeve) {
    const si = caps.length - 1;
    const sl = PC[si];
    const slen = Math.hypot(sl.B[0] - sl.A[0], sl.B[1] - sl.A[1]) || 1;
    for (let i = 0; i < N; i++) {
      if (WI[i] !== si) continue;
      const s = (TT[i] * slen) / ppu; // units from the cuff
      const ph = PH[i];
      // knit rib at the cuff, then three soft compression folds running a little diagonal, then long drapes
      let f = 0;
      if (s < 9) f += 0.45 * Math.abs(Math.sin(ph * 15)) * (1 - sm(6, 9, s));
      const sk = s + ph * 2.2 + K.texNoise(ph * 1.3, s * 0.08, 77) * 3;
      for (const [c0, wdt, amp] of [[13, 3.2, 2.2], [22, 3.6, 2.6], [32, 4.4, 2.0], [46, 6, 1.6]]) {
        const z = (sk - c0) / wdt;
        f += amp * Math.exp(-z * z) * (0.7 + 0.3 * Math.sin(ph * 3 + c0));
      }
      f += 0.25 * K.texFbm(ph * 4, s * 0.3, 78, 2);
      FO[i] = f * ppu * 0.5;
    }
    for (let py = 1; py < h - 1; py++) {
      for (let pxx = 1; pxx < w - 1; pxx++) {
        const i = py * w + pxx;
        if (WI[i] !== si) continue;
        const gx = (FO[i + 1] - FO[i - 1]) * 0.5, gy = (FO[i + w] - FO[i - w]) * 0.5;
        NX[i] -= gx * 0.9; NY[i] -= gy * 0.9;
      }
    }
    yield 0;
  }
  // normalise
  for (let i = 0; i < N; i++) {
    if (WI[i] < 0) continue;
    const l = Math.hypot(NX[i], NY[i], NZ[i]) || 1;
    NX[i] /= l; NY[i] /= l; NZ[i] /= l;
    Hb[i] += FO[i];
  }
  // cavity occlusion: blurred height (inside only) above the pixel = something nearby rises over it
  const rad = Math.max(2, Math.round(5 * ppu));
  const tmpH = new Float32Array(N), tmpC = new Float32Array(N), BH = new Float32Array(N);
  for (let py = 0; py < h; py++) {
    let sH = 0, sC = 0;
    const row = py * w;
    for (let k = -rad; k <= rad; k++) { const xx = Math.min(w - 1, Math.max(0, k)); if (WI[row + xx] >= 0) { sH += Hb[row + xx]; sC++; } }
    for (let pxx = 0; pxx < w; pxx++) {
      tmpH[row + pxx] = sH; tmpC[row + pxx] = sC;
      const xo = Math.max(0, pxx - rad), xi = Math.min(w - 1, pxx + rad + 1);
      if (WI[row + xo] >= 0) { sH -= Hb[row + xo]; sC--; }
      if (WI[row + xi] >= 0) { sH += Hb[row + xi]; sC++; }
    }
    if ((py & 63) === 63) yield 0;
  }
  yield 0;
  for (let pxx = 0; pxx < w; pxx++) {
    let sH = 0, sC = 0;
    for (let k = -rad; k <= rad; k++) { const yy = Math.min(h - 1, Math.max(0, k)); sH += tmpH[yy * w + pxx]; sC += tmpC[yy * w + pxx]; }
    for (let py = 0; py < h; py++) {
      const i = py * w + pxx;
      BH[i] = sC > 0 ? sH / sC : Hb[i];
      const yo = Math.max(0, py - rad), yi = Math.min(h - 1, py + rad + 1);
      sH += tmpH[yi * w + pxx] - tmpH[yo * w + pxx]; sC += tmpC[yi * w + pxx] - tmpC[yo * w + pxx];
    }
    if ((pxx & 63) === 63) yield 0;
  }
  yield 0;
  // lights (view space; dirs point toward the light)
  const Lt = o.light || {};
  const lin = (c, k = 1) => toLin(c).map((v) => v * k);
  const key = Lt.key || { d: [0.5, -0.6, 0.6], c: "#c8b4d8", i: 0.8 };
  const KD = v3.norm(key.d), KC = lin(key.c, key.i);
  const RM = Lt.rim ? { d: v3.norm(Lt.rim.d), c: lin(Lt.rim.c, Lt.rim.i) } : null;
  const BN = Lt.bounce ? { d: v3.norm(Lt.bounce.d), c: lin(Lt.bounce.c, Lt.bounce.i) } : null;
  const SKY = lin(Lt.sky || "#2a3460", Lt.amb == null ? 0.35 : Lt.amb), GND = lin(Lt.ground || "#141828", Lt.amb == null ? 0.35 : Lt.amb);
  const TR = Lt.trans || 0;
  const SD = v3.norm(Lt.skyDir || [0, -1, 0.15]);
  const skin = lin(o.skin || "#cf9378"), skinRed = lin("#c47a66"), skinPalm = lin("#d99c86");
  const nailC = lin("#e4b8aa"), nailEdge = lin("#f2e6da"), sssC = [0.95, 0.2, 0.08];
  const fleece = lin(o.sleeveColor || "#b88a2a"), fleeceD = lin(K.shade(o.sleeveColor || "#b88a2a", -0.25));
  const HV = v3.norm([KD[0], KD[1], KD[2] + 1]);
  const img = K.makeCanvas(w, h);
  const ix = img.getContext("2d");
  const id = ix.createImageData(w, h);
  const Dd = id.data;
  const stepPx = Math.max(1, ppu * 1.4);
  const kl = Math.hypot(KD[0], KD[1]) || 1;
  const sdx = KD[0] / kl, sdy = KD[1] / kl, slope = (KD[2] / kl);
  for (let py = 0; py < h; py++) {
    for (let pxx = 0; pxx < w; pxx++) {
      const i = py * w + pxx;
      const ci = WI[i];
      if (ci < 0 || AL[i] <= 0) continue;
      const C = PC[ci].c;
      const nx = NX[i], ny = NY[i], nz = NZ[i];
      const ux = (pxx + x0) / ppu, uy = (py + y0) / ppu; // units, for texture
      // cast shadow from the key: march the height field toward the light
      let sh = 1;
      if (KD[2] < 0.97) {
        const h0 = Hb[i];
        for (let s = 1; s <= 12; s++) {
          const qx = Math.round(pxx + sdx * s * stepPx), qy = Math.round(py + sdy * s * stepPx);
          if (qx < 0 || qy < 0 || qx >= w || qy >= h) break;
          const j = qy * w + qx;
          if (WI[j] < 0) continue;
          const need2 = h0 + slope * s * stepPx;
          const over = (Hb[j] - need2) / (1.5 * ppu);
          if (over > 0) { sh = Math.min(sh, 1 - clamp(over)); if (sh <= 0) break; }
        }
        sh = 0.15 + 0.85 * sh;
      }
      const ao = clamp(1 - Math.max(0, BH[i] - Hb[i]) / (7 * ppu), 0.25, 1);
      let a0, a1, a2;
      let specK = 0.05, specP = 22, thin = C.thin;
      if (C.mat === 2) {
        // fleece: fuzzy, matte; pilling and colour drift; folds already in the normal, valleys occluded
        const n1 = K.texNoise(ux * 0.9, uy * 0.9, 61) * 0.06 + K.texFbm(ux * 0.18, uy * 0.18, 62, 3) * 0.08 + (K.hash(i, 63) - 0.5) * 0.1;
        const f = 0.4 - n1 * 2.5;
        a0 = lerp(fleece[0], fleeceD[0], f); a1 = lerp(fleece[1], fleeceD[1], f); a2 = lerp(fleece[2], fleeceD[2], f);
        specK = 0; thin = 0;
      } else {
        // skin: low-amplitude mottling, fine texture, redder at knuckles / fingertips / joints
        const mott = K.texFbm(ux * 0.11, uy * 0.11, 51, 3) * 0.05;
        const fine = K.texNoise(ux * 1.1, uy * 1.1, 52) * 0.025 + (K.hash(i, 53) - 0.5) * 0.03;
        let red = 0, palmar = 0, dors = 0, joint = 99;
        const segT = TT[i];
        const U = PC[ci].U;
        if (C.mat === 1) {
          dors = nx * U[0] + ny * U[1] + nz * U[2];
          palmar = clamp(-dors * 1.6);
          const sAlong = C.s0 + segT * C.len;
          if (C.fid < 4) { const F = FINGERS[C.fid]; joint = Math.min(Math.abs(sAlong - F.L[0]), Math.abs(sAlong - F.L[0] - F.L[1])); }
          else joint = Math.abs(sAlong - 14.5);
          red = 0.25 * (C.seg === 2 ? sm(0.4, 1, segT) : 0) + 0.07 * Math.exp(-joint * joint / 6);
        }
        const pm = palmar * 0.6, mf = 1 + mott + fine;
        a0 = lerp(lerp(skin[0], skinPalm[0], pm), skinRed[0], red) * mf;
        a1 = lerp(lerp(skin[1], skinPalm[1], pm), skinRed[1], red) * mf;
        a2 = lerp(lerp(skin[2], skinPalm[2], pm), skinRed[2], red) * mf;
        // knuckle creases on the back of the joints, a single flexion crease on the palm side
        if (C.mat === 1 && joint < 4) {
          const wr = Math.exp(-joint * joint / 4) * (0.5 + 0.5 * Math.sin(joint * 5.5 + K.texNoise(ux * 0.6, uy * 0.6, 54) * 2));
          const cr = dors > 0.1 ? 1 - 0.12 * wr * clamp(dors * 2) : 1 - 0.35 * Math.exp(-joint * joint / 0.35) * palmar;
          a0 *= cr; a1 *= cr; a2 *= cr;
        }
        // the nail: on the distal segment, facing the dorsal side
        if (C.mat === 1 && C.seg === 2) {
          const m = sm(0.42, 0.62, dors) * sm(0.3, 0.42, segT);
          if (m > 0) {
            const free = sm(0.86, 0.95, segT);
            // lunula (paler) at the base, a fine cuticle line, a groove along the sides
            const lu = 1 + 0.12 * Math.exp(-Math.pow((segT - 0.4) / 0.04, 2));
            const cut = 1 - 0.35 * Math.exp(-Math.pow((segT - 0.34) / 0.018, 2));
            const side = 1 - 0.18 * (1 - sm(0.5, 0.62, dors));
            const k2 = lerp(1, cut * side, m);
            a0 = lerp(a0, lerp(nailC[0], nailEdge[0], free) * lu, m) * k2;
            a1 = lerp(a1, lerp(nailC[1], nailEdge[1], free) * lu, m) * k2;
            a2 = lerp(a2, lerp(nailC[2], nailEdge[2], free) * lu, m) * k2;
            specK = lerp(0.05, 0.45, m); specP = lerp(22, 70, m);
          }
        }
      }
      // light
      const NL = nx * KD[0] + ny * KD[1] + nz * KD[2];
      const wrap = Math.max(0, (NL + 0.3) / 1.3);
      const dif = wrap * wrap * sh;
      const term = C.mat === 2 ? 0 : Math.exp(-Math.pow((NL - 0.02) / 0.22, 2)) * 0.32 * (0.4 + 0.6 * sh) * 1.6;
      const up = clamp(0.5 + 0.5 * (nx * SD[0] + ny * SD[1] + nz * SD[2]));
      let r = a0 * (KC[0] * dif + lerp(GND[0], SKY[0], up) * ao) + sssC[0] * term * KC[0] * a0;
      let gg = a1 * (KC[1] * dif + lerp(GND[1], SKY[1], up) * ao) + sssC[1] * term * KC[1] * a1;
      let b = a2 * (KC[2] * dif + lerp(GND[2], SKY[2], up) * ao) + sssC[2] * term * KC[2] * a2;
      if (BN) {
        const bl = Math.max(0, nx * BN.d[0] + ny * BN.d[1] + nz * BN.d[2]) * ao;
        r += a0 * BN.c[0] * bl; gg += a1 * BN.c[1] * bl; b += a2 * BN.c[2] * bl;
      }
      const fres = Math.pow(1 - Math.max(0, nz), 2.6);
      if (RM) {
        const rr = fres * Math.max(0, (nx * RM.d[0] + ny * RM.d[1]) / (Math.hypot(RM.d[0], RM.d[1]) || 1)) * (0.6 + 0.4 * ao);
        const fz = C.mat === 2 ? 0.7 : 1;
        r += RM.c[0] * rr * fz; gg += RM.c[1] * rr * fz; b += RM.c[2] * rr * fz;
      }
      if (TR > 0 && thin > 0) {
        // light from behind glows through the thin edges (red: blood-filtered)
        const tr = fres * TR * thin * Math.max(0, -KD[2] * 0.6 + 0.4);
        r += KC[0] * tr * 0.9; gg += KC[1] * tr * 0.28; b += KC[2] * tr * 0.1;
      }
      if (specK > 0) {
        const nh = Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]);
        const sp = Math.pow(nh, specP) * specK * sh;
        r += KC[0] * sp; gg += KC[1] * sp; b += KC[2] * sp;
      }
      if (C.mat === 2) { const fz = fres * 0.12 * up; r += SKY[0] * fz; gg += SKY[1] * fz; b += SKY[2] * fz; }
      const o4 = i * 4;
      Dd[o4] = toS(r); Dd[o4 + 1] = toS(gg); Dd[o4 + 2] = toS(b); Dd[o4 + 3] = AL[i] * 255;
    }
    if ((py & 3) === 3) yield 0;
  }
  ix.putImageData(id, 0, 0);
  // anchors in sprite px (device): wrist (local origin) and the pinch point
  const wr = tf([0, 0, 0]), pc = tf(S.pinch);
  return { canvas: img, w, h, px, wrist: [wr[0] - x0, wr[1] - y0], pinch: [pc[0] - x0, pc[1] - y0] };
}
const handKey = (o) => "hand:" + JSON.stringify(o);
// draw a baked hand so that its anchor ('pinch' | 'wrist') lands on (x, y); extra screen rotation `rot`
function drawHand19(g, x, y, o, anchor = "pinch", rot = 0, alpha = 1) {
  const H = need(handKey(o), () => handJob(o));
  if (!H) return;
  const a = H[anchor];
  g.save();
  g.globalAlpha *= alpha;
  g.translate(x, y);
  if (rot) g.rotate(rot);
  g.scale(1 / H.px, 1 / H.px);
  g.drawImage(H.canvas, -a[0], -a[1]);
  g.restore();
}
function warmHand(o, deadline) { return stepJob(jobOf(handKey(o), () => handJob(o)), deadline); }

// ---- the crowd ---------------------------------------------------------------------------------------------
const SIT1 = (() => {
  const R = K.rng("f19sit1");
  const out = [];
  for (let i = 0; i < 40; i++) {
    const d = R();
    out.push({ x: -60 + R() * 380, y: 352 + d * d * 50, h: 9 + d * d * 26, ci: Math.floor(R() * 10), v: R() > 0.5 ? 1 : 0, side: R() > 0.5 ? 1 : -1 });
  }
  return out.sort((a, b) => a.y - b.y);
})();
const BACKS3 = (() => {
  const out = [];
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1;
    const d = K.hash(i, 9);
    out.push({ x: 470 + side * (100 + K.hash(i, 3) * 440), y: 330 + d * d * 220, h: 12 + d * d * 120, ci: i, v: i % 2, side });
  }
  return out.sort((a, b) => a.y - b.y);
})();
// shot 4's crowd: side-on, facing the ring (left). Every cat its own pose (sit / loaf / stand), head turn, coat and
// size; a clear corridor in front of you so nobody stands on your feet; sorted into back (behind you) / front.
const K4 = { kx: 560, ky: 446, RX: 300, RY: 206 };
const CROWD4 = (() => {
  const out = [];
  const R = K.rng("f19crowd4b");
  for (let i = 0; i < 90 && out.length < 56; i++) {
    const d = R();
    const y = 338 + d * d * 196;
    const s = 7 + d * d * 46 + (R() - 0.5) * 4 * d;
    const x = 600 + R() * 520 - (1 - d) * 70;
    const pr = R();
    const pose = pr < 0.5 ? "sit" : pr < 0.8 ? "loaf" : "stand";
    const front = y >= K4.ky - 6;
    // keep a corridor around your legs for the cats in front of you
    if (front && Math.abs(x - K4.kx) < 64 + s * 1.2) continue;
    out.push({ x, y, s, ci: Math.floor(R() * 10), ph: R(), pose, ht: -0.5 + R() * 0.9, tilt: (R() - 0.5) * 0.3, front });
  }
  return out.sort((a, b) => a.y - b.y);
})();
// one crowd cat, lit by the ring (key + rim from the ring, night sky fill), with a contact shadow thrown away from it
function crowdCat4(q, m) {
  const sz = m.s * (m.pose === "loaf" ? 1.05 : m.pose === "stand" ? 0.92 : 1);
  const dx = m.x - K4.RX, dy = m.y - K4.RY;
  const dl = Math.hypot(dx, dy) || 1;
  // contact shadow: stretched along the ground away from the ring (the light is above and to the left)
  const len = sz * (0.6 + 0.5 * clamp(dx / dl));
  K.shadowBlob(q, m.x + len * 0.45, m.y + 0.5, len * 0.8, sz * 0.06, { alpha: 0.6, color: "#05040c" });
  K.shadowBlob(q, m.x, m.y, sz * 0.4, sz * 0.05, { alpha: 0.7, color: "#030308" });
  const falloff = clamp(1.25 - dl / 700, 0.35, 1);
  K.drawCat(q, m.x, m.y, sz, {
    pose: m.pose, facing: -1, coat: CROWD[m.ci], collar: false, bell: false, tail: 0.25 + m.ph * 0.4, t: m.ph * 9, autoBlink: false, blink: 0,
    headTurn: m.ht, headTilt: m.tilt, phase: m.ph,
    key: { x: K4.RX, y: K4.RY, color: "#ffb860", strength: 1.05 * falloff },
    rim: { x: K4.RX - 80, y: K4.RY - 60, color: "#ffd9a0", strength: 1.1 * falloff },
    fill: "#0c0c1e", ambient: "#1a1c3a", ambientK: 0.25, pupil: 1, shadow: false, castShadow: 0.6, ground: "#05040c",
  });
}
function crowd4Steps(front, lit) {
  if (lit) return [
    ...CROWD4.filter((m) => m.front === front).map((m) => (q) => crowdCat4(q, m)),
    // inverse-square falloff away from the ring, and the amber of its light on fur
    (q) => {
      q.save(); q.globalCompositeOperation = "source-atop";
      const gr = q.createRadialGradient(K4.RX, K4.RY + 120, 120, K4.RX, K4.RY + 120, 900);
      gr.addColorStop(0, "rgba(8,6,18,0)"); gr.addColorStop(0.45, "rgba(8,6,18,0.35)"); gr.addColorStop(1, "rgba(8,6,18,0.82)");
      q.fillStyle = gr; q.fillRect(0, 0, 960, 540); q.restore();
    },
    veilPass("#ff8a30", 0.16),
  ];
  // the same cats in the blue night before the light reaches them: the lit bake, exposed down and cooled
  return [
    (q) => { q.save(); q.setTransform(1, 0, 0, 1, 0, 0); q.drawImage(lay(front ? "c4f1" : "c4b1"), 0, 0); q.restore(); },
    veilPass("#070918", 0.86),
    rimPass(1.2, -1.4, "#8a86c0", 0.35, 1),
  ];
}
defLayer("c4b1", 0, () => crowd4Steps(false, true));
defLayer("c4f1", 0, () => crowd4Steps(true, true));
defLayer("c4b0", 0, () => crowd4Steps(false, false));
defLayer("c4f0", 0, () => crowd4Steps(true, false));

const CROWD7 = (() => {
  const out = [];
  const R = K.rng("f19crowd7");
  for (let i = 0; i < 40; i++) {
    const d = R();
    out.push({ x: (R() - 0.5) * 1200 + 480, y: 380 + d * d * 200, h: 16 + d * d * 140, ci: Math.floor(R() * 10), v: R() > 0.5 ? 1 : 0, side: R() > 0.5 ? 1 : -1, jit: R() });
  }
  const list = out.filter((m) => Math.abs(m.x - 480) > 70 + m.h * 0.3).sort((a, b) => a.y - b.y);
  list.forEach((m) => { m.up = 57 + (1 - (m.y - 380) / 200) * 3.4 + m.jit * 0.5; });
  return list;
})();
// a waiting cat on the night plateau (painted only into cached layers): sitting side-on in any direction,
// lit from above by the sky and rimmed by the dawn glow beyond the ring
// night exposure for a painted crowd layer: everything in it sits in the blue dark
function nightVeil(q, W, H, a) {
  q.save();
  q.setTransform(1, 0, 0, 1, 0, 0);
  q.globalCompositeOperation = "source-atop";
  q.fillStyle = K.rgba("#080a1c", a);
  q.fillRect(0, 0, q.canvas.width, q.canvas.height);
  q.restore();
}
function nightCat(q, x, y, size, ci, facing, ringX, hz) {
  K.shadowBlob(q, x, y, size * 0.55, size * 0.06, { alpha: 0.55 });
  K.drawCat(q, x, y, size, {
    pose: "sit", facing, coat: CROWD[((ci % CROWD.length) + CROWD.length) % CROWD.length], collar: false, bell: false, tail: 0.3, t: ci * 1.7, autoBlink: false,
    headTurn: K.hash(ci, 41) * 0.6 - 0.3,
    key: { x: x - 200 * facing, y: y - 900, color: "#6a78b0", strength: 0.3 },
    rim: { x: ringX, y: hz, color: DAWN, strength: 0.9 },
    fill: "#0a0e1e", ambient: "#1a2040", ambientK: 0.35, pupil: 1, shadow: false,
  });
}

// bake heavy art ahead of the cut that needs it, a little per frame: every job is stepped only while this frame
// still has wall-clock budget (the draw already spent part of it), so playback never stalls on a first use.
// One-shot bakes (sprites that cannot be split) are only started while there is budget left, one per frame.
const WARM_ONCE = new Set();
const once = (key, fn) => (dl) => { if (WARM_ONCE.has(key)) return true; if (dl != null && nowMs() > dl - 6) return false; fn(); WARM_ONCE.add(key); return "spent"; };
const warmJob = (j) => (dl) => stepJob(j(), dl);
function warmList() {
  return [
    [2.4, 9.8, once("sky332", () => skySprite(332, 0.72))],
    [2.4, 9.8, once("s2a", () => s2aBg())],
    [2.4, 9.9, warmJob(() => jobOf(handKey(HA_LEFT), () => handJob(HA_LEFT)))],
    [2.4, 9.9, warmJob(() => jobOf(handKey(HA_RIGHT), () => handJob(HA_RIGHT)))],
    [2.4, 15.5, warmJob(() => jobOf(handKey(HB), () => handJob(HB)))],
    [10.2, 15.5, once("s2b", () => bellUpBg(960, 540))],
    [10.2, 24.4, once("sky300", () => skySprite(300, 0.5))],
    [10.2, 24.4, warmJob(() => layerJob("s3far"))],
    [10.2, 24.4, warmJob(() => layerJob("s3near"))],
    [10.2, 27.9, once("sky318", () => skySprite(318, 0.25))],
    [10.2, 27.9, warmJob(() => layerJob("c4b1"))],
    [10.2, 27.9, warmJob(() => layerJob("c4f1"))],
    [10.2, 27.9, warmJob(() => layerJob("c4b0"))],
    [10.2, 27.9, warmJob(() => layerJob("c4f0"))],
    [22.2, 32.5, warmJob(() => rayJob())],
    ...[-0.4, -0.2, 0, 0.2].map((h) => [10.2, 24.4, once("eyeS" + h, () => eyeProbe("sit", h))]),
    ...CROWD4.map((m, i) => [10.2, 31.1, once("eye4:" + m.pose + Math.round(m.ht * 5), () => eyeProbe(m.pose, m.ht))]),
    ...WARM_LATE(),
  ];
}
let WARM_L = null;
function WARM_LATE() {
  return [
    [28.2, 37.9, once("sky470", () => skySprite(450, 0.5))],
    [28.2, 37.9, warmJob(() => jobOf("sunS", () => paintJob(960, 540, sunriseSteps(960, 540), 0)))],
    [28.2, 37.9, once("sunB", () => sunriseLayers(960, 540))],
    [28.2, 37.9, warmJob(() => jobOf(handKey(HT), () => handJob(HT)))],
    ...[-4, -3, -2, -1, 0, 1, 2].map((k) => [28.2, 37.9, once("ear" + k, () => earProbe(k / 10))]),
    [38.3, 55.9, once("sky330", () => skySprite(330, 0.5))],
    [38.3, 55.9, (dl) => warmCat7(dl)],
  ];
}
function warmAhead(t, t0) {
  if (t < 1.2) { plateauBake(); return; }
  if (t < 2.4) { for (let i = 0; i < 5; i++) stoneBake(i); return; }
  const deadline = t0 + 11;
  if (!WARM_L) WARM_L = warmList();
  for (const [a, b, fn] of WARM_L) {
    if (t < a || t >= b) continue;
    if (nowMs() >= deadline) return;
    const r = fn(deadline);
    if (r === "spent" || r === false) return;
  }
}
const W0 = 960, H0 = 540;

// ---- shot 1 [0-10] close on the dark ring ----------------------------------------------------------------------
function shot1(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 0, 10));
  const hz = 332;
  K.withCamera(g, W, H, { x: 476 + p * 26, y: 270 - p * 5, zoom: 1.0 + p * 0.07, shakeT: t, shakeAmt: 0.7 }, (c) => {
    nightSky(c, W, H, hz, t, { dawnX: 0.72 });
    plateau(c, W, H, hz, 1.0);
    // the cats behind you: dim, out of focus shapes waiting on the plain
    const cats = blurredSprite("s1cats", W, H, 2.4, (q) => { for (const m of SIT1) nightCat(q, m.x, m.y, m.h * 0.6, m.ci, m.side, 640, hz); nightVeil(q, W, H, 0.6); });
    c.drawImage(cats, 0, 0, W, H);
    // the dark ring, close: big frosted stones; the cold membrane between them
    const RX = 648, RY = 238, RR = 206;
    membrane(c, RX, RY, RR, t, 1);
    ring(c, RX, RY, RR, t, { shadowY: 476 });
    // low ground mist drifting through
    K.fog(c, W, H, { y: hz + 40, h: 90, color: "#4a4466", alpha: 0.22, t, seed: 19 });
    // you, from behind, left third: rim-lit by the dawn glow beyond the ring
    const kx = 232, ky = 560, kh = 360;
    K.drawPerson(c, kx, ky, kh, { view: "back", hood: false, bell: true, t, breathe: true, hair: "#3a2414", light: { x: 760, y: 330, color: DAWN, strength: 0.75, z: -0.45 }, ambient: AMB_NIGHT });
    hoodStrings(c, kx, ky, kh, t);
  });
  // ice crystals blowing past the lens
  K.dust(g, W, H, t, { seed: 191, count: 40, color: "#c8d4f0", size: 1.2, area: [0, 40, W, 460] });
}
// hood strings flicking out past your shoulder in the wind (from behind they show only when they blow out)
function hoodStrings(c, kx, ky, kh, t) {
  const u = kh / 100;
  c.save();
  c.lineCap = "round";
  for (let s = 0; s < 2; s++) {
    const x0 = kx + 6.5 * u + s * 1.2 * u, y0 = ky - 80 * u + s * 0.8 * u;
    const gust = 0.6 + 0.4 * K.noise(t * 0.9 + s, 7);
    const pts = [x0, y0];
    for (let k = 1; k <= 7; k++) {
      const v = k / 7;
      pts.push(x0 + v * 8 * u * gust + Math.sin(t * 6.3 + v * 4 + s * 1.7) * 1.4 * u * v, y0 + v * 12 * u * (1.1 - gust * 0.4) + Math.sin(t * 4.7 + v * 3 + s) * 0.9 * u * v);
    }
    c.strokeStyle = "rgba(40,36,44,0.9)";
    c.lineWidth = 1.1 * u;
    c.beginPath(); c.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) c.lineTo(pts[k], pts[k + 1]); c.stroke();
    c.strokeStyle = K.rgba("#d8b0c0", 0.5);
    c.lineWidth = 0.4 * u;
    c.beginPath(); c.moveTo(pts[0] + 0.3 * u, pts[1] - 0.3 * u); for (let k = 2; k < pts.length; k += 2) c.lineTo(pts[k] + 0.3 * u, pts[k + 1] - 0.3 * u); c.stroke();
  }
  c.restore();
}

// ---- shot 2 [10-22] insert: your hands untie the bell; you hold it up against the stars --------------------------
// the night sky mirrored in polished brass: dark zenith, the rose dawn band, the dark cloud sea
const NIGHT_ENV = { top: "#20264a", band: "#f0b4c0", low: "#4a3c58", stars: true };
// hand lights. Insert A looks down at the wrist (sky toward the camera); B looks up past the hand at the sky.
const HL_A = { key: { d: [0.85, -0.3, 0.45], c: "#c9a6c4", i: 0.95 }, rim: { d: [0.1, -1, 0], c: "#8e9ee0", i: 0.55 }, sky: "#34407c", ground: "#141526", amb: 0.55, skyDir: [0, -0.35, 1] };
const HL_B = { key: { d: [0.75, -0.05, -0.55], c: "#d0a2bc", i: 1.0 }, rim: { d: [-0.35, -1, 0], c: "#8496dc", i: 0.75 }, bounce: { d: [0.1, 1, 0.35], c: "#ffb060", i: 0.22 }, sky: "#2c3870", ground: "#16152a", amb: 0.5, trans: 0.5, skyDir: [0, -1, 0.1] };
const HA_LEFT = { pose: "relaxed", left: true, yaw: -0.15, pitch: 0.25, roll: Math.PI / 2 + 0.08, size: 290, sleeve: true, sleeveLen: 120, sleeveColor: "#b88a2a", light: HL_A };
const HA_RIGHT = { pose: "pinch", yaw: 1.5, pitch: -0.2, roll: -2.4, size: 260, sleeve: true, sleeveLen: 100, sleeveColor: "#b88a2a", light: HL_A };
const HB = { pose: "pinch", yaw: 1.25, pitch: -0.35, roll: -0.42, size: 290, sleeve: true, sleeveLen: 120, sleeveColor: "#b88a2a", light: HL_B };
// local hand point -> logical offset from the wrist (same maths as the bake)
function handPt(o, v) {
  const R = rotM(o.yaw || 0, o.pitch || 0, o.roll || 0);
  const w = mv(R, [v[0] * (o.left ? -1 : 1), v[1], v[2]]);
  return [w[0] * o.size / 100, w[1] * o.size / 100];
}
function s2aBg(W = 960, H = 540) {
  return blurredSprite("s2a", W, H, 9, (q) => {
    nightSky(q, W, H, 440, 0, { dawnX: 0.7 });
    plateau(q, W, H, 440, 1.2);
    ring(q, 740, 250, 190, 0, { shadowY: 470, glint: 0 });
  });
}
function shot2(g, W, H, t) {
  if (t < 15.6) {
    // A: the knot at your left wrist; your right hand works it loose (background far out of focus)
    const p = K.ease.inOut(K.seg(t, 10, 15.6));
    K.withCamera(g, W, H, { x: 480, y: 270, zoom: 1.0 + p * 0.05, shakeT: t, shakeAmt: 1.1 }, (c) => {
      c.drawImage(s2aBg(), -40, -20, W + 80, H + 40);
      const tug = K.ease.inOut(K.seg(t, 12.2, 14.6));
      const free = K.ease.inOut(K.seg(t, 14.3, 15.0));
      const lift = K.ease.inOut(K.seg(t, 14.8, 15.6));
      // your left forearm across the frame, back of the hand up, the sleeve running off the left edge
      const LX = 250, LY = 300;
      // a soft shadow of the raised right hand on the forearm and the cloud below
      K.shadowBlob(c, LX + 70, LY + 30, 120, 40, { alpha: 0.35, color: "#05060f" });
      drawHand19(c, LX, LY, HA_LEFT, "wrist");
      // the string wound twice round the wrist, just short of the cuff
      const lp = handPt(HA_LEFT, [0, 7.5, 0]);
      const loopX = LX + lp[0], loopY = LY + lp[1];
      c.save();
      c.translate(loopX, loopY);
      c.rotate(0.08);
      cordBand(c, 0, 0, 40 + free * 5, 3.4, free);
      c.restore();
      const kn0 = [loopX + 1, loopY - 30];
      // right hand: thumb and index pinch the knot, work it, then lift the bell away
      const wob = Math.sin(t * 5.3) * 2.2 * tug * (1 - free);
      const pin = [kn0[0] + tug * 6 + wob + lift * 170, kn0[1] - tug * 3 - lift * 90];
      const sw = Math.sin(t * 2.3) * 0.08 + Math.sin(t * 5.1) * 0.08 * tug * (1 - free) + lift * (1 - lift) * 0.7;
      const bl = 78;
      const bx = pin[0] + Math.sin(sw) * bl, by = pin[1] + Math.cos(sw) * bl;
      if (free < 1) cord(c, [kn0[0], kn0[1], lerp(kn0[0], pin[0], 0.5) + 2, lerp(kn0[1], pin[1], 0.5) + 4, pin[0], pin[1]], 3, { }) ;
      cord(c, [pin[0], pin[1] - 4, (pin[0] + bx) / 2 + 2, (pin[1] + by) / 2, bx, by - 15], 2.8);
      furTuft(c, lerp(pin[0], bx, 0.38), lerp(pin[1], by, 0.38), 15, t);
      brassBell(c, bx, by, 15, { rot: -sw * 0.6, lx: 0.6, ly: -0.5, spec: 0.6, env: NIGHT_ENV });
      drawHand19(c, pin[0], pin[1], HA_RIGHT, "pinch", lift * 0.25);
    });
    return;
  }
  // B: low angle, the bell held up between finger and thumb against the starry sky
  const p = K.ease.inOut(K.seg(t, 15.6, 22));
  K.withCamera(g, W, H, { x: 480, y: 270 + p * 8, zoom: 1.04 + p * 0.05, shakeT: t, shakeAmt: 0.9 }, (c) => bellUp(c, W, H, t, 0));
}
// the string wound twice round the wrist (seen from above: two bands across it, slack as it loosens)
function cordBand(c, x, y, half, w, slack) {
  // a soft contact shadow where the string presses the skin
  K.shadowBlob(c, x + 2, y, w * 1.4, half * 0.8, { alpha: 0.3 * (1 - slack) });
  for (let k = 0; k < 2; k++) {
    const dx = (k - 0.5) * w * 1.3 + slack * (k ? 6 : -4);
    const bow = 3 + slack * 10;
    cord(c, [x + dx - 1, y - half, x + dx + bow, y, x + dx - 1, y + half], w);
  }
}
const BELL_UP = [452, 150];
// the raised hand and the bell against the stars (shots 2B and 3A). Returns the bell position.
function bellUpBg(W, H) {
  return blurredSprite("s2b", W, H, 7, (q) => {
    nightSky(q, W, H, 600, 0, { dawnX: 0.35 });
    ring(q, 170, 470, 250, 0, { glint: 0 });
  });
}
function bellUp(c, W, H, t, ring1, shock) {
  c.drawImage(bellUpBg(W, H), -40, -20, W + 80, H + 40);
  // the sharp stars (a long lens wide open: in focus at infinity, the hand a little soft)
  K.stars(c, W, H, 23, 1.2, t, { yMax: 380 });
  if (shock) shock(c);
  const rise = K.ease.out(K.seg(t, 15.6, 17.6));
  const pp = [BELL_UP[0], BELL_UP[1] + (1 - rise) * 26];
  // the swing: a slow pendulum before, a sharp damped swing when you ring it at 22
  const k = t >= 22 ? Math.exp(-(t - 22) * 1.1) : 0;
  const swing = Math.sin(t * 2.0) * 0.05 + Math.sin((t - 22) * 8.5) * 0.5 * k + (1 - rise) * 0.12 * Math.sin(t * 3.1);
  const len = 112;
  const bx = pp[0] + Math.sin(swing) * len, by = pp[1] + Math.cos(swing) * len;
  cord(c, [pp[0], pp[1] - 6, (pp[0] + bx) / 2 + Math.sin(swing) * 6, (pp[1] + by) / 2, bx, by - 24], 3.2);
  furTuft(c, lerp(pp[0], bx, 0.3), lerp(pp[1], by, 0.3), 22, t);
  brassBell(c, bx, by, 28, { rot: -swing * 0.8, lx: 0.5, ly: -0.3, spec: 0.6 + ring1 * 0.4, warm: ring1 * 0.3, env: NIGHT_ENV });
  drawHand19(c, pp[0], pp[1], HB, "pinch");
  return [bx, by];
}

// ---- shot 3 [22-28] you ring it: a visible ring of sound ---------------------------------------------------------
// The sound as a refractive shockwave: inside a thick soft annulus the sky and the stars are drawn again, pushed
// radially outward by a smooth displacement profile (so the stars visibly ripple as it passes); a faint
// chromatic split on the leading edge (warm outside, cool inside). No outline.
const SHOCK_BANDS = [[-0.55, 0.25], [-0.3, 0.6], [-0.08, 0.95], [0.14, 1], [0.34, 0.65], [0.52, 0.28]];
function shockwave(c, W, H, t, cx, cy, r, w, amp, a, paintBack) {
  if (a <= 0.01 || r <= 2) return;
  const bw = w * 0.24;
  for (const [off, wt] of SHOCK_BANDS) {
    const rr = r + off * w;
    const r0 = Math.max(0, rr - bw * 0.5), r1 = rr + bw * 0.5;
    const d = amp * wt * a;
    if (d < 0.25 || r1 <= 1) continue;
    c.save();
    c.beginPath();
    c.arc(cx, cy, r1, 0, TAU);
    if (r0 > 0) c.arc(cx, cy, r0, 0, TAU, true);
    c.clip("evenodd");
    const s = 1 + d / Math.max(8, rr);
    c.translate(cx, cy); c.scale(s, s); c.translate(-cx, -cy);
    paintBack(c);
    c.restore();
  }
  // compression: a slight luminous lift in the densest band, then the chromatic split
  c.save();
  c.globalCompositeOperation = "lighter";
  const band = (ri, ro, col, al) => {
    if (ro <= 1) return;
    const gr = c.createRadialGradient(cx, cy, Math.max(0, ri), cx, cy, ro);
    gr.addColorStop(0, K.rgba(col, 0));
    gr.addColorStop(0.5, K.rgba(col, al));
    gr.addColorStop(1, K.rgba(col, 0));
    c.fillStyle = gr;
    c.beginPath(); c.arc(cx, cy, ro, 0, TAU); c.fill();
  };
  band(r - w * 0.35, r + w * 0.3, "#c8d0ff", 0.06 * a);
  band(r + w * 0.25, r + w * 0.75, "#ffb98a", 0.09 * a);
  band(r - w * 0.7, r - w * 0.2, "#7ea0ff", 0.07 * a);
  c.restore();
}
// the floor wave: a lifted crest of mist that displaces the plateau texture, with a dark trough just ahead of it
function floorWave(c, W, H, hz, s, cx, cy, r, flat, w, a) {
  if (a <= 0.01) return;
  const ell = (rr) => { c.ellipse(cx, cy, Math.max(1, rr), Math.max(0.5, rr * flat), 0, 0, TAU); };
  // displaced plateau inside the crest (lifted toward the camera = drawn a few px higher)
  c.save();
  c.beginPath(); c.rect(-200, hz + 1, W + 400, H); c.clip();
  c.beginPath(); ell(r + w * 0.15); ell(Math.max(1, r - w * 0.5)); c.clip("evenodd");
  c.translate(0, -3.2 * a);
  plateau(c, W, H, hz, s);
  c.restore();
  c.save();
  c.beginPath(); c.rect(-200, hz + 1, W + 400, H); c.clip();
  c.translate(cx, cy);
  c.scale(1, flat);
  const gr = c.createRadialGradient(0, 0, Math.max(0, r - w * 1.2), 0, 0, r + w * 0.9);
  // wake (faint) -> lifted mist crest (lit by the sky, lighter) -> dark leading trough -> undisturbed
  gr.addColorStop(0, "rgba(120,110,160,0)");
  gr.addColorStop(0.45, K.rgba("#8e86b8", 0.1 * a));
  gr.addColorStop(0.62, K.rgba("#b8acd8", 0.42 * a));
  gr.addColorStop(0.72, K.rgba("#d6c8e8", 0.3 * a));
  gr.addColorStop(0.8, K.rgba("#05061a", 0.42 * a));
  gr.addColorStop(1, "rgba(5,6,26,0)");
  c.fillStyle = gr;
  c.beginPath(); c.arc(0, 0, r + w * 0.9, 0, TAU); c.fill();
  c.restore();
}
// shot 3 crowd layers: far cats rebaked in the night key (dark, rim-lit only), near cats dark and warm (defocused)
defLayer("s3far", 1.2, () => [
  ...BACKS3.filter((m) => m.h <= 45).map((m) => (q) => nightCat(q, m.x, m.y, m.h * 0.6, m.ci, -m.side, 560, 300)),
  veilPass("#070816", 0.8),
  rimPass(0, -1.6, "#b8a0d0", 0.55, 1),
]);
defLayer("s3near", 6, () => [
  ...BACKS3.filter((m) => m.h > 45).map((m) => (q) => nightCat(q, m.x, m.y + 40, m.h * 0.8, m.ci, -m.side, 480, 300)),
  veilPass("#0c0810", 0.72),
  veilPass("#3a2014", 0.18),
  rimPass(0, -3, "#c89aa8", 0.45, 1),
]);
function shot3(g, W, H, t) {
  if (t < 24.5) {
    K.withCamera(g, W, H, { x: 480, y: 278, zoom: 1.09, shakeT: t, shakeAmt: 0.9 + Math.exp(-(t - 22) * 4) * 2.2 }, (c) => {
      const e = t - 22;
      const back = (q) => { q.drawImage(bellUpBg(W, H), -40, -20, W + 80, H + 40); K.stars(q, W, H, 23, 1.2, t, { yMax: 380 }); };
      // the sound leaves the bell at its rest point under the pinch
      const sx = BELL_UP[0], sy = BELL_UP[1] + 112;
      const [bx, by] = bellUp(c, W, H, t, 1, (q) => {
        for (let i = 0; i < 2; i++) {
          const u = e - i * 0.5;
          if (u <= 0) continue;
          shockwave(q, W, H, t, sx, sy, 14 + u * 250, 70 + u * 50, 26, Math.exp(-u * 0.6) * (1 - i * 0.45), back);
        }
      });
      K.glow(c, bx, by, 70, "#ffe9b8", 0.45 * Math.exp(-e * 2.5));
    });
    return;
  }
  // wide, from behind you: the wave crosses the plain toward the ring; the cats in front of the lens, soft
  const hz = 300;
  const e = t - 22;
  const p = K.ease.inOut(K.seg(t, 24.5, 28));
  K.withCamera(g, W, H, { x: 480, y: 270 - p * 4, zoom: 1.0 + p * 0.03, shakeT: t, shakeAmt: 0.7 }, (c) => {
    nightSky(c, W, H, hz, t, { dawnX: 0.5 });
    plateau(c, W, H, hz, 0.85);
    const RX = 560, RY = 188, RR = 100;
    const quiver = K.env(t, 27.0, 28, 0.4, 0.4);
    membrane(c, RX, RY, RR, t, 1 + quiver * 1.5);
    ring(c, RX, RY, RR, t, { shadowY: 306, amber: 0.06 * quiver });
    // the wave on the cloud floor: a lifted mist crest with a dark trough, displacing the plateau as it passes
    for (let i = 0; i < 2; i++) {
      const u = t - 24.1 - i * 0.6;
      if (u <= 0) continue;
      floorWave(c, W, H, hz, 0.85, 392, 362, 30 + u * 150, 0.13, 50 + u * 14, Math.min(1, u * 3) * Math.exp(-u * 0.2) * (1 - i * 0.4));
    }
    // the same wave in the air: the sky and the stars ripple behind it
    {
      const u = e - 0.3;
      const back = (q) => nightSky(q, W, H, hz, t, { dawnX: 0.5 });
      c.save(); c.beginPath(); c.rect(-200, -200, W + 400, hz + 200); c.clip();
      shockwave(c, W, H, t, 386, 240, 40 + u * 190, 80, 16, Math.exp(-u * 0.45) * 0.9, back);
      c.restore();
    }
    K.fog(c, W, H, { y: hz + 30, h: 70, color: "#5a5278", alpha: 0.2 + 0.1 * Math.exp(-(t - 24.5)), t, seed: 23 });
    c.drawImage(lay("s3far"), 0, 0, W, H);
    // you, small, arm up, the bell at the top of your hand
    const kx = 380, ky = 364, kh = 118;
    K.shadowBlob(c, kx, ky, kh * 0.18, kh * 0.03, { alpha: 0.6 });
    K.drawPerson(c, kx, ky, kh, { hair: "#3a2414", view: "back", hood: false, bell: false, armUp: 1, t, light: { x: RX, y: RY, color: DAWN, strength: 0.6, z: -0.5 }, ambient: AMB_NIGHT, shadow: false });
    const bx = kx + 15 * kh / 100, by = ky - 1.06 * kh + Math.sin(t * 5) * 0.8;
    cord(c, [bx, by - 9, bx, by - 6, bx, by - 3], 0.9);
    brassBell(c, bx, by, 4.4, { lx: 0, ly: -0.6, spec: 0.5 + 0.5 * Math.exp(-(t - 24.5) * 0.8), env: NIGHT_ENV });
    K.glow(c, bx, by, 26, "#ffe9b8", 0.15 + 0.3 * Math.exp(-(t - 24.5) * 0.8));
    // foreground cats, out of focus (the lens is focused on you); their eyes catch the bell and the dawn as bokeh
    c.drawImage(lay("s3near"), -20, 0, W + 40, H + 20);
    nearCatBokeh(c, t, W, H);
  });
}
// catchlights of the defocused foreground cats: soft discs (the lens's aperture), warm, a few blinking
function nearCatBokeh(c, t, W, H) {
  const L = [];
  for (const m of BACKS3) {
    if (m.h <= 45) continue;
    const size = m.h * 0.8, f = -m.side;
    const eyes = eyeProbe("sit", K.hash(m.ci, 41) * 0.6 - 0.3);
    for (const ey of eyes) {
      const x = m.x + f * ey.x * size, y = m.y + 40 + ey.y * size;
      const sx = -20 + (x * (W + 40)) / W, sy = (y * (H + 20)) / H;
      const blink = K.hash(Math.floor(t * 0.8 + m.ci * 0.37), m.ci + 7) > 0.9 ? 0.2 : 1;
      L.push({ x: sx, y: sy, r: 3 + size * 0.035, color: "#ffd2a0", alpha: 0.5 * blink });
    }
  }
  K.bokehLights(c, W, H, t, { lights: L, alpha: 0.55, blades: 6, count: 0 });
}


// ---- shot 4 [28-38] the portal answers (wide, side-on) -------------------------------------------------------------
const litAt = (t) => (i) => K.ease.out(K.seg(t, 28.4 + i * 0.95, 29.3 + i * 0.95)) * (1 + 0.25 * K.smooth(K.seg(t, 32.6, 36)));
const ignite = (t) => K.smooth(K.seg(t, 32.6, 36.5));
// a glowing pawprint melted into the cloud crust, drawn flat on the floor in perspective
function pawSprite() {
  return ownSprite("pawglow2", 96, 96, (s) => {
    const pads = [[48, 60, 17, 14], [28, 36, 7.5, 9], [41, 28, 7.5, 9.5], [56, 28, 7.5, 9.5], [69, 36, 7.5, 9]];
    for (const [x, y, rx, ry] of pads) {
      const gr = s.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry) * 1.6);
      gr.addColorStop(0, "rgba(255,226,170,0.9)");
      gr.addColorStop(0.45, "rgba(255,170,80,0.55)");
      gr.addColorStop(1, "rgba(255,110,30,0)");
      s.fillStyle = gr;
      s.beginPath(); s.ellipse(x, y, rx * 1.6, ry * 1.6, 0, 0, TAU); s.fill();
    }
  });
}
function groundPaws(g, cx, cy, t, t0, n, every, rad0, rad1, flat, size) {
  const spr = pawSprite();
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const appear = t0 + i * every;
    if (t < appear) break;
    const age = t - appear;
    const u = i / n;
    const a = Math.PI * 0.5 + u * TAU * 1.15;
    const rr = lerp(rad0, rad1, u) * (1 + (i % 2 ? 0.05 : -0.05));
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * flat;
    const depth = clamp(0.6 + Math.sin(a) * 0.4); // nearer prints bigger
    const s = size * (0.75 + depth * 0.5);
    // melted into the crust: soft, and they settle to a dim glow instead of staying hot dots
    g.globalAlpha = 0.6 * Math.min(1, age * 2.5) * (0.35 + 0.65 * Math.exp(-age * 0.6));
    g.save();
    g.translate(x, y);
    g.scale(1, flat * 1.4);
    g.rotate(a + Math.PI);
    g.drawImage(spr, -s / 2, -s / 2, s, s);
    g.restore();
  }
  g.restore();
}
// the ring's heart: an HDR light. A tight white-hot core (the lens turns it into a light) inside a broad
// exponential halo that cools from white through gold to amber.
const CORE_STOPS = [[0, 1], [0.04, 0.82], [0.09, 0.58], [0.16, 0.36], [0.26, 0.2], [0.4, 0.09], [0.58, 0.035], [0.8, 0.01], [1, 0]];
function portalCore(g, x, y, r, t, k, tilt = 0.06) {
  if (k <= 0.005) return;
  g.save();
  g.globalCompositeOperation = "lighter";
  g.translate(x, y);
  g.scale(1, 1 - tilt);
  const R = r * 1.7;
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
  for (const [p, v] of CORE_STOPS) gr.addColorStop(p, K.rgba(K.mix("#fff6e2", p < 0.2 ? "#ffd690" : "#ff9a40", Math.min(1, p * 2.2)), v * k));
  g.fillStyle = gr;
  g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
  const cr = r * (0.13 + 0.015 * Math.sin(t * 7.3) * k);
  const cg = g.createRadialGradient(0, 0, 0, 0, 0, cr);
  cg.addColorStop(0, K.rgba("#ffffff", Math.min(1, k * 1.2)));
  cg.addColorStop(0.55, K.rgba("#fffaf0", 0.85 * k));
  cg.addColorStop(1, "rgba(255,240,210,0)");
  g.fillStyle = cg;
  g.beginPath(); g.arc(0, 0, cr, 0, TAU); g.fill();
  g.restore();
}
// god rays out of the ring's heart: many rays of noisy length / width / strength, with shadow shafts cut by the
// stones and by you (blurred once; drawn with a slow breathing rotation)
const RAY_W = 1600, RAY_H = 1100;
const rayJob = () => jobOf("rays4", () => paintJob(RAY_W, RAY_H, [paintRays], 4));
function raySprite() { return need("rays4", () => paintJob(RAY_W, RAY_H, [paintRays], 4)); }
function paintRays(s) {
  {
    const cx = RAY_W / 2, cy = RAY_H / 2;
    const R = K.rng("f19rays4");
    s.globalCompositeOperation = "lighter";
    for (let i = 0; i < 90; i++) {
      const a = R() * TAU;
      const n = 0.5 + 0.5 * K.texNoise(Math.cos(a) * 2.5, Math.sin(a) * 2.5, 194);
      const len = 260 + n * 560 + R() * 160;
      const wd = 0.006 + R() * R() * 0.05;
      const I = (0.05 + R() * 0.12) * (0.4 + n);
      const gr = s.createRadialGradient(cx, cy, 0, cx, cy, len);
      gr.addColorStop(0, K.rgba("#fff0d0", I));
      gr.addColorStop(0.25, K.rgba("#ffd9a0", I * 0.7));
      gr.addColorStop(0.6, K.rgba("#ffb060", I * 0.28));
      gr.addColorStop(1, "rgba(255,150,60,0)");
      s.fillStyle = gr;
      s.beginPath(); s.moveTo(cx, cy); s.arc(cx, cy, len, a - wd, a + wd); s.closePath(); s.fill();
    }
    // shadow shafts: each stone (and you, standing to the right) blocks the rays behind it
    s.globalCompositeOperation = "destination-out";
    const occ = [];
    for (let i = 0; i < 5; i++) { const p = piece(i, K4.RX, K4.RY, 150, 0.06, 0); occ.push([p.x - K4.RX, p.y - K4.RY, p.sz * 0.78]); }
    occ.push([K4.kx - 8 - K4.RX, K4.ky - 120 - K4.RY, 16]);
    occ.push([K4.kx - 4 - K4.RX, K4.ky - 40 - K4.RY, 13]);
    for (const [ox, oy, rr] of occ) {
      const dist = Math.hypot(ox, oy);
      const a0 = Math.atan2(oy, ox), half = Math.asin(Math.min(0.95, rr / dist));
      const gr = s.createRadialGradient(cx, cy, dist * 0.92, cx, cy, dist + 700);
      gr.addColorStop(0, "rgba(0,0,0,0.9)");
      gr.addColorStop(0.35, "rgba(0,0,0,0.75)");
      gr.addColorStop(1, "rgba(0,0,0,0.3)");
      s.fillStyle = gr;
      s.beginPath(); s.moveTo(cx, cy); s.arc(cx, cy, dist + 700, a0 - half, a0 + half); s.closePath(); s.fill();
    }
  }
}
function shot4(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 28, 38));
  const hz = 318;
  const { RX, RY, kx, ky } = K4;
  const RR = 150, GY = 360;
  const ig = ignite(t);
  const lit = litAt(t);
  const anyLit = K.clamp((t - 28.4) / 4.75);
  K.withCamera(g, W, H, { x: 480 - p * 18, y: 270, zoom: 1.0 + p * 0.05, shakeT: t, shakeAmt: 0.8 + ig * 0.5 }, (c) => {
    nightSky(c, W, H, hz, t, { dawnX: 0.25 });
    plateau(c, W, H, hz, 1.0, RX + 180);
    // the ring's light on the cloud floor: one inverse-square pool squashed into the ground plane (plus a hot centre)
    K.lightPool(c, RX, GY, 700, "#ff9a48", { flat: 0.22, intensity: anyLit * 0.5 + ig * 0.75 });
    K.lightPool(c, RX, GY, 380, "#ffc078", { flat: 0.22, intensity: anyLit * 0.25 + ig * 0.8 });
    K.lightPool(c, RX, GY + 4, 170, "#ffe4b8", { flat: 0.24, intensity: ig * 0.9 });
    if (ig > 0.01) {
      const spr = raySprite();
      c.save();
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = clamp(ig * (0.85 + 0.15 * Math.sin(t * 1.3)));
      c.translate(RX, RY);
      c.rotate(Math.sin(t * 0.21) * 0.012);
      c.drawImage(spr, -RAY_W / 2, -RAY_H / 2, RAY_W, RAY_H);
      c.restore();
    }
    membrane(c, RX, RY, RR, t, 1 - anyLit);
    portalCore(c, RX, RY, RR * 0.82, t, ig * K.ease.out(K.seg(t, 32.6, 34.5)));
    ring(c, RX, RY, RR, t, { shadowY: GY, lit, amber: ig * 0.9, haloK: 1 });
    groundPaws(c, RX, GY + 8, t, 30.2, 22, 0.17, 170, 300, 0.2, 36);
    // the crowd behind you, then you, then the cats in front of you (baked in the blue night / in the ring's light)
    const lightK = Math.max(anyLit * 0.45, ig);
    const crowd = (front) => {
      c.drawImage(lay(front ? "c4f0" : "c4b0"), 0, 0, W, H);
      if (lightK > 0.01) { c.globalAlpha = lightK; c.drawImage(lay(front ? "c4f1" : "c4b1"), 0, 0, W, H); c.globalAlpha = 1; }
    };
    crowd(false);
    // you, side-on, arm up with the bell: a dark figure rimmed in amber
    const kh = 176;
    const kL = Math.max(anyLit * 0.8, ig);
    K.shadowBlob(c, kx + 40, ky + 1, kh * 0.3, kh * 0.025, { alpha: 0.55 });
    K.shadowBlob(c, kx, ky, kh * 0.12, kh * 0.02, { alpha: 0.7 });
    K.drawPerson(c, kx, ky, kh, { hair: "#3a2414", view: "side", facing: -1, hood: false, bell: false, armUp: 1, t, shadow: false, light: { x: RX, y: RY, color: "#ffb860", strength: 0.35 + 1.2 * kL, z: -0.35 }, ambient: AMB_NIGHT });
    {
      const bx = kx - 10 * kh / 100, by = ky - 110 * kh / 100 + 16 + Math.sin(t * 2.2) * 1.2;
      cord(c, [bx, by - 14, bx, by - 9, bx, by - 5], 1.1);
      brassBell(c, bx, by, 5.5, { lx: -0.8, ly: -0.2, warm: kL, spec: 0.4 + 0.6 * kL, env: NIGHT_ENV });
    }
    crowd(true);
    // eye-shine: the tapetum throws the ring's light straight back: 2 px hot points (the lens blooms them)
    const eye = K.smooth(K.seg(t, 31.2, 33.6));
    if (eye > 0.01) {
      c.save();
      c.globalCompositeOperation = "lighter";
      for (const m of CROWD4) {
        const sz = m.s * (m.pose === "loaf" ? 1.05 : m.pose === "stand" ? 0.92 : 1);
        // the light reaches the near cats first
        const reach = clamp((t - 31.2 - (m.x - 600) / 900) / 1.2);
        const blink = K.hash(Math.floor(t * 0.7 + m.ph * 5), m.ci + 3) > 0.94 ? 0.1 : 1;
        const a = eye * reach * blink;
        if (a < 0.02) continue;
        for (const e of eyeProbe(m.pose, m.ht)) {
          const ex = m.x - e.x * sz, ey = m.y + e.y * sz;
          const d = Math.max(1.6, Math.min(2.6, sz * 0.06));
          c.globalAlpha = a;
          c.fillStyle = "#f6ffc8";
          c.fillRect(ex - d / 2, ey - d / 2, d, d);
          K.glow(c, ex, ey, 3 + sz * 0.12, "#d8ff7a", 0.6 * a);
        }
      }
      c.restore();
    }
  });
  K.dust(g, W, H, t, { seed: 194, count: 36, color: "#ffd9a0", size: 1.4, alpha: 0.55 * ig, area: [0, 60, 700, 420] });
}


// ---- shots 5-6 [38-56] through the ring: sunrise, and him -----------------------------------------------------------
// the far side: baked sharp + soft (the rack focus cross-fades them); Biscuit is drawn live on top
const SUN = { x: 600, y: 336 };
const HILL = { x: 500, y: 404 };
function sunriseSteps(W, H) {
  const hz = 338;
  const hx = HILL.x, hy = HILL.y;
  const hp = new Path2D();
  hp.moveTo(-40, H + 40);
  hp.lineTo(-40, hy + 160);
  hp.bezierCurveTo(hx - 300, hy + 90, hx - 170, hy - 2, hx, hy - 4);
  hp.bezierCurveTo(hx + 170, hy - 2, hx + 300, hy + 90, W + 40, hy + 150);
  hp.lineTo(W + 40, H + 40);
  hp.closePath();
  return [(s) => {
  K.sky(s, W, H, { top: "#5d7cb8", mid: "#c6a6c4", bottom: "#ffc89a", horizon: hz / H, sun: { x: SUN.x, y: SUN.y, color: "#ffd27a" }, haze: 0.9 });
  }, (s) => {
  K.cloudLayer3d(s, W, H, 0, { seed: 2019, horizon: hz - 6, y: 70, count: 10, color: "#ffd8c4", shade: "#a87e9c", haze: "#ffc8b0", sun: SUN, speed: 0, alpha: 0.9 });
  }, (s) => {
  K.sunGlow(s, SUN.x, SUN.y, 13, "#ffd27a", 1.3);
  // the first sliver of the sun itself, clipped to white (the lens turns it into a light)
  s.save();
  s.beginPath(); s.rect(SUN.x - 40, SUN.y - 30, 80, 30 + 2); s.clip();
  s.fillStyle = "#fffaf0";
  s.beginPath(); s.arc(SUN.x, SUN.y + 6, 12, 0, TAU); s.fill();
  s.restore();
  }, (s) => {
  // the far sea of cloud and the misty hills, lower contrast and warmer with distance
  K.hills(s, W, H, { y: hz + 10, amp: 18, color: "#c49aa8", seed: 7, haze: "#ffd0b0", hazeAmt: 0.6 });
  K.fog(s, W, H, { y: hz + 22, h: 46, color: "#ffe8d8", alpha: 0.65, wisps: true, seed: 5 });
  K.hills(s, W, H, { y: hz + 34, amp: 22, color: "#9a7c94", seed: 11, haze: "#ffc8a8", hazeAmt: 0.35 });
  K.fog(s, W, H, { y: hz + 48, h: 40, color: "#ffe2cc", alpha: 0.5, wisps: true, seed: 6 });
  // haze between the far banks and the hill: a bright layer of sunlit mist just behind the crest
  {
    const hg = s.createLinearGradient(0, HILL.y - 60, 0, HILL.y + 8);
    hg.addColorStop(0, "rgba(255,226,196,0)");
    hg.addColorStop(0.6, "rgba(255,224,190,0.5)");
    hg.addColorStop(1, "rgba(255,236,210,0.7)");
    s.fillStyle = hg;
    s.fillRect(0, HILL.y - 60, W, 68);
  }
  // the near hill, white with frost-dew, its crest catching the sun from behind (path shared by the steps below)
  }, (s) => {
  // frosted turf: desaturated to silver-white, then the hill's face is in its own shadow (the sun is behind it)
  K.texFill(s, "turf", hp, { scale: 70, tex: { seed: 19 }, tint: "#c8bcd0", tintAlpha: 0.7, tintMode: "color" });
  s.save();
  s.clip(hp);
  const sh = s.createLinearGradient(0, hy - 6, 0, hy + 190);
  sh.addColorStop(0, "rgba(255,206,160,0.25)");
  sh.addColorStop(0.04, "rgba(96,70,104,0.55)");
  sh.addColorStop(0.22, "rgba(52,36,70,0.8)");
  sh.addColorStop(1, "rgba(22,16,34,0.92)");
  s.fillStyle = sh;
  s.fillRect(0, hy - 10, W, H);
  // sky fill on the round of the hill: cool, from above-left
  const sf = s.createRadialGradient(hx - 120, hy - 60, 20, hx - 120, hy - 60, 420);
  sf.addColorStop(0, "rgba(150,170,220,0.18)");
  sf.addColorStop(1, "rgba(150,170,220,0)");
  s.fillStyle = sf;
  s.fillRect(0, hy - 10, W, H);
  s.restore();
  }, (s) => {
  // dewy grass on the crest, back-lit by the low sun (bright tips)
  K.grass(s, hx - 300, hx + 300, hy + 3, { seed: 195, color: "#8a7890", light: "#ffe8c8", dark: "#3a2c48", height: 9, t: 0, wind: 0, density: 1, sun: SUN });
  // dew on the crest grass: tiny points that catch the sun (the lens blooms them)
  {
    const R = K.rng("f19dew");
    s.fillStyle = "#fff4e0";
    for (let i = 0; i < 70; i++) {
      const x = hx - 260 + R() * 520;
      const k = (x - hx) / 300;
      const y = hy - 4 + k * k * 60 + R() * 8;
      const near = 1 - Math.min(1, Math.abs(x - SUN.x) / 300);
      if (R() > 0.35 + near * 0.6) continue;
      s.globalAlpha = 0.4 + 0.6 * near;
      s.fillRect(x, y, 1.2, 1.2);
    }
    s.globalAlpha = 1;
  }
  }, (s) => {
  // a warm haze of back-lit seed heads over the crest
  s.save();
  s.globalCompositeOperation = "lighter";
  const cg = s.createLinearGradient(0, hy - 14, 0, hy + 10);
  cg.addColorStop(0, "rgba(255,220,170,0)");
  cg.addColorStop(0.6, "rgba(255,200,140,0.45)");
  cg.addColorStop(1, "rgba(255,220,170,0)");
  s.fillStyle = cg;
  s.fillRect(hx - 360, hy - 14, 720, 24);
  s.restore();
  }];
}
function sunriseWorld(s, W, H) { for (const f of sunriseSteps(W, H)) f(s); }
// baked a step per frame ahead of the hit (sharp), then a blurred copy of it (soft)
function sunriseLayers(W, H) {
  const sharp = need("sunS", () => paintJob(W, H, sunriseSteps(W, H), 0));
  const soft = need("sunB", () => paintJob(W, H, [(q) => { q.save(); q.setTransform(1, 0, 0, 1, 0, 0); q.drawImage(sharp, 0, 0); q.restore(); }], 7));
  return { sharp, soft };
}
// Biscuit's bent ear, found by difference: the pixels a straight ear has and his bent one lacks (size units, facing right)
function earProbe(ht) {
  const hq = Math.round(ht * 10) / 10;
  return baked("ear:" + hq, () => {
    const S = 120, cw = 300, ch = 280, ox = 140, oy = 250;
    const mask = (bent) => {
      const c = K.makeCanvas(cw, ch);
      const q = c.getContext("2d", { willReadFrequently: true });
      K.cpuMode(() => { K.drawCat(q, ox, oy, S, { pose: "sit", facing: 1, headTurn: hq, coat: Object.assign({}, K.BISCUIT, { bentEar: bent }), ears: 0.6, t: 1, autoBlink: false, collar: false, bell: false, shadow: false, flat: true }); }); // probe: painted on the CPU so the read-back below cannot stall the GPU
      return q.getImageData(0, 0, cw, ch).data;
    };
    const a = mask(false), b = mask(true);
    let sx = 0, sy = 0, n = 0, top = 1e9, tx = 0;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const o = (y * cw + x) * 4 + 3;
      if (a[o] > 128 && b[o] < 64) { sx += x; sy += y; n++; if (y < top) { top = y; tx = x; } }
    }
    if (!n) return null;
    return { x: (sx / n - ox) / S, y: (sy / n - oy) / S, tx: (tx - ox) / S, ty: (top - oy) / S };
  });
}
const BISC_RIM = "#ffb060";
// Biscuit on the crest, drawn live at his final size into a small layer (full pixel scale, smoothing on).
// Backlit by the low sun: a strong fur rim halo, translucent ear edges, whisker glints; his face in soft shadow.
function biscuitLayer(t, size) {
  const L = K.layer(220, 220, "f19bisc");
  const q = L.g;
  const px = K.pixelScale();
  q.setTransform(px, 0, 0, px, 0, 0);
  q.clearRect(0, 0, 220, 220);
  q.imageSmoothingEnabled = true;
  const turn = K.ease.inOut(K.seg(t, 48.6, 50.4));
  const ht = -0.4 + turn * 0.6;
  const mouth = K.env(t, 46.0, 46.8, 0.12, 0.3);
  const X = 110, Y = 170;
  K.drawCat(q, X, Y, size, {
    pose: "sit", facing: 1, collar: true, bell: false, t, tail: 0, tailUp: 0, ears: 0.6, mouth,
    headTurn: ht, coat: K.BISCUIT,
    key: { x: X - 120, y: Y - 160, color: "#8a94c8", strength: 0.16 },
    rim: { x: X + (SUN.x - HILL.x) * 3, y: Y + (SUN.y - HILL.y) * 3, color: "#ffc070", strength: 2.6 },
    fill: "#1e1224", ambient: "#36284a", ambientK: 0.5, backlit: 1, castShadow: 0, shadow: false, pupil: 0.3,
  });
  // the bent ear, exaggerated in the silhouette: the tip folds forward and down over the ear
  const E = earProbe(ht);
  if (E) {
    const ex = X + E.tx * size, ey = Y + E.ty * size, u = size / 60;
    q.save();
    q.globalCompositeOperation = "destination-out";
    q.beginPath(); q.ellipse(ex, ey + 0.6 * u, 2.6 * u, 2.4 * u, 0, 0, TAU); q.fill();
    q.globalCompositeOperation = "source-atop";
    q.restore();
    q.save();
    q.translate(ex, ey + 2.4 * u);
    // the folded flap: dark (its back faces us, in shadow), with a hot translucent rim where the sun hits its edge
    q.fillStyle = "#4a2614";
    q.beginPath(); q.moveTo(-2.4 * u, -0.2 * u); q.quadraticCurveTo(0.6 * u, -2.2 * u, 3.6 * u, 1.6 * u); q.quadraticCurveTo(0.8 * u, 1.2 * u, -2.0 * u, 1.0 * u); q.closePath(); q.fill();
    q.strokeStyle = K.rgba("#ff8a40", 0.85); q.lineWidth = Math.max(0.5, 0.45 * u);
    q.beginPath(); q.moveTo(-2.2 * u, -0.3 * u); q.quadraticCurveTo(0.6 * u, -2.3 * u, 3.5 * u, 1.5 * u); q.stroke();
    q.restore();
  }
  // his face and chest are on the shadow side (the sun is behind him): a soft falloff across the body
  q.save();
  q.globalCompositeOperation = "source-atop";
  const sg = q.createLinearGradient(X - size * 0.6, 0, X + size * 0.9, 0);
  sg.addColorStop(0, "rgba(70,30,22,0.5)");
  sg.addColorStop(0.55, "rgba(70,30,22,0.3)");
  sg.addColorStop(1, "rgba(70,30,22,0)");
  q.fillStyle = sg;
  q.fillRect(0, 0, 220, 220);
  q.restore();
  // the halo: every edge that faces the sun glows (fur strands and ear edges let the light through)
  {
    const T = K.layer(220, 220, "f19biscRim");
    const x = T.g;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = "source-over";
    x.clearRect(0, 0, T.canvas.width, T.canvas.height);
    x.drawImage(L.canvas, 0, 0);
    x.globalCompositeOperation = "source-in";
    x.fillStyle = "#ffb468";
    x.fillRect(0, 0, T.canvas.width, T.canvas.height);
    x.globalCompositeOperation = "destination-out";
    x.drawImage(L.canvas, -1.6 * px * size / 50, 0.9 * px * size / 50);
    x.globalCompositeOperation = "source-over";
    q.save();
    q.setTransform(1, 0, 0, 1, 0, 0);
    q.globalCompositeOperation = "lighter";
    q.globalAlpha = 0.95;
    q.drawImage(T.canvas, 0, 0);
    q.restore();
  }
  // whisker glints: a few fine hairs catching the sun ahead of his muzzle
  const eyes = eyeProbe("sit", ht);
  if (eyes.length) {
    const e = eyes[eyes.length - 1];
    const mx = X + (e.x + 0.12) * size, my = Y + (e.y + 0.13) * size, u = size / 60;
    q.save();
    q.globalCompositeOperation = "lighter";
    q.lineCap = "round";
    for (let k = 0; k < 4; k++) {
      const a = -0.25 + k * 0.17 + Math.sin(t * 1.3 + k) * 0.02;
      q.strokeStyle = K.rgba("#ffe0b0", 0.35 - k * 0.05);
      q.lineWidth = 0.35 * u;
      q.beginPath(); q.moveTo(mx, my); q.quadraticCurveTo(mx + Math.cos(a) * 6 * u, my + Math.sin(a) * 6 * u - 0.6 * u, mx + Math.cos(a) * 11 * u, my + Math.sin(a) * 11 * u + 0.8 * u); q.stroke();
    }
    q.restore();
  }
  return L;
}
// defocus: an exact average of 12 offset taps of the full-res layer (a disc aperture), no upscaled low-res copy
function discBlur(src, key, rad) {
  const D = K.layer(220, 220, key);
  const d = D.g;
  d.setTransform(1, 0, 0, 1, 0, 0);
  d.clearRect(0, 0, D.canvas.width, D.canvas.height);
  d.imageSmoothingEnabled = true;
  d.globalCompositeOperation = "lighter";
  const px = K.pixelScale();
  const taps = [[0, 0]];
  for (let k = 0; k < 7; k++) taps.push([Math.cos(k * TAU / 7) * rad, Math.sin(k * TAU / 7) * rad]);
  for (let k = 0; k < 4; k++) taps.push([Math.cos(k * TAU / 4 + 0.4) * rad * 0.5, Math.sin(k * TAU / 4 + 0.4) * rad * 0.5]);
  d.globalAlpha = 1 / taps.length;
  for (const [ox, oy] of taps) d.drawImage(src, ox * px, oy * px);
  d.globalAlpha = 1;
  d.globalCompositeOperation = "source-over";
  return D;
}
function biscuit(g, t, x, y, size, blur) {
  const L = biscuitLayer(t, size);
  const k = clamp(blur / 3.2);
  g.save();
  g.imageSmoothingEnabled = true;
  if (k > 0.02) {
    const B = discBlur(L.canvas, "f19biscSoft", 0.6 + k * 3.2);
    g.globalAlpha = Math.min(1, k * 1.6);
    g.drawImage(B.canvas, x - 110, y - 170, 220, 220);
  }
  g.globalAlpha = 1 - Math.min(1, k * 1.6);
  if (g.globalAlpha > 0.01) g.drawImage(L.canvas, x - 110, y - 170, 220, 220);
  g.restore();
}
// your hand in the portal light: backlit (the opening is behind it), warm light glowing through the thin edges
const HL_T = { key: { d: [-0.75, -0.15, -0.6], c: "#ffbe70", i: 1.5 }, rim: { d: [-1, -0.3, 0], c: "#ffd8a0", i: 0.9 }, bounce: { d: [0, 1, 0.4], c: "#ff9a50", i: 0.18 }, sky: "#3a2a44", ground: "#1a1018", amb: 0.45, trans: 1.3, skyDir: [0, -1, 0.2] };
const HT = { pose: "pinch", yaw: 1.25, pitch: -0.35, roll: -0.42, size: 280, sleeve: true, sleeveLen: 120, sleeveColor: "#b88a2a", light: HL_T };
const RING5 = { RX: 480, RY: 236, RR: 318 };
function throughRing(g, W, H, t) {
  const zk = K.ease.inOut(K.seg(t, 38, 56));
  const z = 1 + zk * 0.14;
  const focus = 1 - K.ease.inOut(K.seg(t, 46, 52)); // 1 = focused on the ring/hand, 0 = on him
  const { RX, RY, RR } = RING5;
  const camX = 480 + (z - 1) * 60, camY = 266 - (z - 1) * 40;
  K.withCamera(g, W, H, { x: camX, y: camY, zoom: z, shakeT: t, shakeAmt: 0.8 }, (c) => {
    // the near side: dark plain, washed gold by the open ring
    nightSky(c, W, H, 450, t, { dawnX: 0.5 });
    plateau(c, W, H, 450, 1.3);
    K.lightPool(c, RX, 500, 900, "#ffa850", { flat: 0.3, intensity: 0.9 });
    // the far side, inside the ring: drawn into a layer, feathered at the aperture, with its own parallax
    // (it is far away: it slides against the camera drift)
    const SL = sunriseLayers(W, H);
    const par = -(z - 1) * 70 + Math.sin(t * 0.4) * 2;
    const inner = inLayer(c, W, H, "f19inner", (q) => {
      q.clearRect(-200, -200, W + 400, H + 400);
      q.save();
      q.translate(par, -(z - 1) * 18);
      q.drawImage(SL.soft, 0, 0, W, H);
      if (focus < 0.99) { q.globalAlpha = 1 - focus; q.drawImage(SL.sharp, 0, 0, W, H); q.globalAlpha = 1; }
      const bs = K.lerp(44, 62, K.ease.inOut(K.seg(t, 46, 52)));
      K.shadowBlob(q, HILL.x - 20, HILL.y - 2, bs * 0.6, bs * 0.05, { alpha: 0.35, color: "#3a2440" });
      biscuit(q, t, HILL.x + 4, HILL.y - 1, bs, focus * 3.2);
      K.glow(q, SUN.x, SUN.y, 60, "#fff0c0", 0.25 + 0.04 * Math.sin(t * 1.7));
      q.restore();
      // feather the aperture over ~8 px (destination-in with a soft-edged disc)
      q.save();
      q.globalCompositeOperation = "destination-in";
      q.translate(RX, RY); q.scale(1, 0.94);
      const ra = RR * 0.84;
      const fg = q.createRadialGradient(0, 0, ra - 9, 0, 0, ra + 1);
      fg.addColorStop(0, "rgba(0,0,0,1)"); fg.addColorStop(1, "rgba(0,0,0,0)");
      q.fillStyle = fg;
      q.beginPath(); q.arc(0, 0, ra + 2, 0, TAU); q.fill();
      q.restore();
    });
    put(c, W, H, inner, 1);
    // refractive shimmer at the rim: the far world is seen a little magnified through the threshold
    {
      const ra = RR * 0.84;
      c.save();
      c.beginPath();
      c.ellipse(RX, RY, ra + 2, (ra + 2) * 0.94, 0, 0, TAU);
      c.ellipse(RX, RY, ra - 14, (ra - 14) * 0.94, 0, 0, TAU);
      c.clip("evenodd");
      const s = 1.012 + 0.006 * Math.sin(t * 2.7);
      const M = c.getTransform();
      const dx = M.a * RX + M.c * RY + M.e, dy = M.b * RX + M.d * RY + M.f;
      c.setTransform(s, 0, 0, s, dx - s * dx + Math.sin(t * 1.9) * 0.8, dy - s * dy);
      c.globalAlpha = 0.55;
      c.drawImage(inner.canvas, 0, 0);
      c.restore();
    }
    // the opening glows: brighter toward its edge (like looking out of a lit window), haze spilling out of it
    c.save();
    c.globalCompositeOperation = "lighter";
    const eg = c.createRadialGradient(RX, RY, RR * 0.55, RX, RY, RR * 0.86);
    eg.addColorStop(0, "rgba(255,240,210,0)");
    eg.addColorStop(1, K.rgba("#ffe7b8", 0.14 + 0.03 * Math.sin(t * 2.3)));
    c.fillStyle = eg;
    c.beginPath(); c.ellipse(RX, RY, RR * 0.86, RR * 0.81, 0, 0, TAU); c.fill();
    const hz = c.createRadialGradient(RX, RY, RR * 0.78, RX, RY, RR * 1.55);
    hz.addColorStop(0, "rgba(255,216,160,0)");
    hz.addColorStop(0.12, K.rgba("#ffd8a0", 0.2));
    hz.addColorStop(0.4, K.rgba("#ffb870", 0.08));
    hz.addColorStop(1, "rgba(255,170,90,0)");
    c.fillStyle = hz;
    c.fillRect(RX - RR * 1.6, RY - RR * 1.6, RR * 3.2, RR * 3.2);
    c.restore();
    K.fog(c, W, H, { y: RY + RR * 0.55, h: 120, color: "#ffc898", alpha: 0.16, t, seed: 31 });
    // the stones: their inner faces lit by the sunrise; they fall out of focus as the rack goes to him
    const st = inLayer(c, W, H, "f19stones", (q) => {
      q.clearRect(-200, -200, W + 400, H + 400);
      ring(q, RX, RY, RR, t, { lit: () => 0.55, amber: 1.0, haloK: 0.5, glint: 0 });
    });
    const kb = 1 - focus;
    put(c, W, H, st, 1 - kb * 0.85);
    if (kb > 0.01) put(c, W, H, st, kb * 0.85, 7);
  });
  // your hand with the bell, close and framed bottom right, lowering out of frame 47-51; it goes soft as focus racks
  const lower = K.ease.inOut(K.seg(t, 47, 51));
  if (lower < 1) {
    const L = inLayer(g, W, H, "f19hand", (q) => {
      q.clearRect(0, 0, W, H);
      const pp = [770, K.lerp(300, 560, lower)];
      const sw = Math.sin(t * 1.7) * 0.05 + (lower > 0 ? Math.sin(t * 4) * 0.08 * lower : 0);
      const bx = pp[0] + Math.sin(sw) * 84, by = pp[1] + Math.cos(sw) * 84;
      cord(q, [pp[0], pp[1] - 6, (pp[0] + bx) / 2, (pp[1] + by) / 2, bx, by - 20], 2.8);
      furTuft(q, lerp(pp[0], bx, 0.3), lerp(pp[1], by, 0.3), 18, t, "#ffe0a0");
      brassBell(q, bx, by, 21, { lx: -0.7, ly: -0.4, warm: 1, spec: 1, rot: -sw, env: { top: "#3a2a44", band: "#ffe0b0", low: "#6a4a3a" } });
      drawHand19(q, pp[0], pp[1], HT, "pinch");
    });
    // rack: cross-fade the sharp hand into a fixed-radius defocused copy (no per-frame blur sizes)
    const k = 1 - focus;
    put(g, W, H, L, 1 - k);
    if (k > 0.01) put(g, W, H, L, k, 6);
  }
}


// ---- shot 7 [56-64] you step into the light ---------------------------------------------------------------------
// From behind and low: the open ring stands off on the plain; you walk toward it on the cloud floor (a stride, your
// long shadow reaching back toward the lens), and the cats around you get up and follow, all of them backlit.
const S7 = { RX: 480, RY: 246, RR: 122, GY: 398, hz: 330 };
// one follower: sitting and standing sprites (backlit by the ring, fur-edge rim with a noisy strand breakup)
function cat7Job(m, pose) {
  return function* () {
    const sz = m.h * (pose === "sit" ? 0.62 : 0.58);
    const SW = Math.ceil(sz * 3.4), SH = Math.ceil(sz * 2.6), ox = SW * 0.5, oy = SH * 0.86;
    const px = K.pixelScale();
    const c = K.makeCanvas(Math.ceil(SW * px), Math.ceil(SH * px));
    const q = c.getContext("2d");
    q.setTransform(px, 0, 0, px, 0, 0);
    const facing = m.x < S7.RX ? 1 : -1;
    // the ring in sprite space (it is ahead of the cat and up)
    const lx = ox + (S7.RX - m.x) * 0.6, ly = oy - sz * 1.6;
    K.drawCat(q, ox, oy, sz, {
      pose, facing, coat: CROWD[m.ci], collar: false, bell: false, t: m.jit * 7, autoBlink: false, blink: 0,
      headTurn: -0.5 + m.jit * 0.3, tail: 0.3, tailUp: pose === "stand" ? 0.8 : 0, phase: 0.25,
      key: { x: lx, y: ly, color: "#ffd9a0", strength: 0.35 },
      rim: { x: lx, y: ly - sz, color: "#ffd2a0", strength: 2.2 },
      fill: "#0e0a14", ambient: "#140e1c", ambientK: 0.35, backlit: 1, shadow: false, pupil: 1,
    });
    yield 0;
    // they face away from us into the light: mostly dark, the rim does the drawing
    q.save(); q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = "source-atop";
    q.fillStyle = "rgba(14,9,18,0.74)"; q.fillRect(0, 0, c.width, c.height); q.restore();
    const dx = (S7.RX - m.x) / Math.max(60, Math.abs(S7.RX - m.x)) * 1.2, dy = -1.6;
    rimPass(dx * Math.max(1, sz / 50), dy * Math.max(1, sz / 50), "#ffcf90", 1.0, 1)(q, c);
    return { c, SW, SH, ox, oy };
  };
}
const cat7Key = (i, pose) => "c7:" + i + ":" + pose;
function cat7(i, pose) { const m = CROWD7[i]; return need(cat7Key(i, pose), cat7Job(m, pose)); }
function warmCat7(dl) {
  for (let i = 0; i < CROWD7.length; i++) for (const pose of ["sit", "stand"]) {
    const m = CROWD7[i];
    if (!stepJob(jobOf(cat7Key(i, pose), cat7Job(m, pose)), dl)) return false;
  }
  return true;
}
function drawSpr7(c, S, x, y, sc, alpha) {
  if (alpha <= 0.01) return;
  c.save();
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.scale(sc, sc);
  c.drawImage(S.c, -S.ox, -S.oy, S.SW, S.SH);
  c.restore();
}
function shot7(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 56, 64));
  const { RX, RY, RR, GY, hz } = S7;
  K.withCamera(g, W, H, { x: 480, y: 262 - p * 10, zoom: 1.0 + p * 0.1, shakeT: t, shakeAmt: 1.0 }, (c) => {
    nightSky(c, W, H, hz, t, { dawnX: 0.5 });
    plateau(c, W, H, hz, 1.0);
    // the light on the cloud floor: from the opening, falling off with distance
    K.lightPool(c, RX, GY, 900, "#ffa850", { flat: 0.24, intensity: 0.75 + p * 0.25 });
    K.lightPool(c, RX, GY, 360, "#ffe0b0", { flat: 0.24, intensity: 0.6 + p * 0.4 });
    // inside: the sunrise, overexposed; an HDR falloff spills out over the rim (no flat white plate)
    const SL = sunriseLayers(W, H);
    c.save();
    c.beginPath(); c.ellipse(RX, RY, RR * 0.84, RR * 0.79, 0, 0, TAU); c.clip();
    c.drawImage(SL.soft, RX - W * 0.3, RY - H * 0.36, W * 0.6, H * 0.6);
    c.restore();
    portalCore(c, RX, RY + 4, RR * 0.95, t, 0.55 + p * 0.5, 0.06);
    if (raySprite()) {
      c.save();
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = 0.5 + p * 0.3;
      c.translate(RX, RY);
      c.scale(0.8, 0.8);
      c.rotate(Math.PI * 0.5 + Math.sin(t * 0.21) * 0.012);
      c.drawImage(raySprite(), -RAY_W / 2, -RAY_H / 2, RAY_W, RAY_H);
      c.restore();
    }
    ring(c, RX, RY, RR, t, { lit: () => 0.8, amber: 1, shadowY: GY, glint: 0 });
    // the followers, far to near, with you sorted in among them by depth
    const w = K.ease.inOut(K.seg(t, 56.3, 63.5));
    const ky = K.lerp(442, 404, w), kh = K.lerp(236, 124, w);
    const kx = RX + Math.sin(t * 0.9) * 3;
    let kidDone = false;
    const drawKid = () => {
      // the long shadow, thrown toward the lens by the light ahead of you (it swings with the stride)
      const ph = t * 1.7;
      c.save();
      for (let leg = 0; leg < 2; leg++) {
        const sw = Math.sin(ph * Math.PI + leg * Math.PI) * kh * 0.03;
        const gr = c.createLinearGradient(0, ky, 0, ky + kh * 0.75);
        gr.addColorStop(0, "rgba(4,3,10,0.72)");
        gr.addColorStop(1, "rgba(4,3,10,0)");
        c.fillStyle = gr;
        c.beginPath();
        const x0 = kx + (leg ? 1 : -1) * kh * 0.03;
        c.moveTo(x0 - kh * 0.025, ky); c.lineTo(x0 + kh * 0.025, ky);
        c.lineTo(x0 + sw * 2 + kh * 0.06, ky + kh * 0.75); c.lineTo(x0 + sw * 2 - kh * 0.06, ky + kh * 0.75);
        c.closePath(); c.fill();
      }
      const bg = c.createRadialGradient(kx, ky + kh * 0.3, 0, kx, ky + kh * 0.3, kh * 0.4);
      bg.addColorStop(0, "rgba(4,3,10,0.35)"); bg.addColorStop(1, "rgba(4,3,10,0)");
      c.fillStyle = bg;
      c.save(); c.translate(kx, ky + kh * 0.3); c.scale(0.45, 1); c.translate(-kx, -(ky + kh * 0.3));
      c.beginPath(); c.arc(kx, ky + kh * 0.3, kh * 0.4, 0, TAU); c.fill(); c.restore();
      c.restore();
      K.shadowBlob(c, kx, ky, kh * 0.08, kh * 0.012, { alpha: 0.7 });
      K.drawPerson(c, kx, ky, kh, { hair: "#3a2414", view: "back", hood: false, walk: true, phase: t * 0.85, t, bell: true, shadow: false, light: { x: RX, y: RY, color: "#ffd9a0", strength: 1.6, z: -0.8 }, ambient: "#140e1c" });
      kidDone = true;
    };
    for (let i = 0; i < CROWD7.length; i++) {
      const m = CROWD7[i];
      const rise = K.ease.inOut(K.seg(t, m.up, m.up + 0.8));
      const go = K.ease.in(K.seg(t, m.up + 0.6, m.up + 4));
      const mx = K.lerp(m.x, RX + (m.x - RX) * 0.72, go), my = K.lerp(m.y, m.y - (m.y - 380) * 0.35, go);
      if (!kidDone && my > ky) drawKid();
      const sc = 1 - go * 0.22;
      // contact shadow toward the lens (the light is ahead of them)
      K.shadowBlob(c, mx, my + m.h * 0.04, m.h * 0.22 * sc, m.h * 0.05 * sc, { alpha: 0.5 });
      // getting up: the sitter rocks forward and fades into the stander, who lifts onto his legs; then walks
      const step = rise > 0.95 ? Math.abs(Math.sin((t - m.up) * 6.5 + m.jit * 6)) * m.h * 0.025 * Math.min(1, go * 4) : 0;
      const S0 = cat7(i, "sit"), S1 = cat7(i, "stand");
      const lean = Math.sin(rise * Math.PI) * m.h * 0.03;
      drawSpr7(c, S0, mx, my - lean * 0.3, sc * (1 + rise * 0.05), 1 - K.smooth(K.seg(rise, 0.3, 0.75)));
      drawSpr7(c, S1, mx, my + (1 - rise) * m.h * 0.06 - step, sc, K.smooth(K.seg(rise, 0.3, 0.75)));
    }
    if (!kidDone) drawKid();
  });
  K.dust(g, W, H, t, { seed: 197, count: 40, color: "#fff0c8", size: 1.5, alpha: 0.6 });
}


// ---- assembly ------------------------------------------------------------------------------------------------------
const SHOTS = [[0, 10, shot1], [10, 22, shot2], [22, 28, shot3], [28, 38, shot4], [38, 56, throughRing], [56, 64.01, shot7]];

const L19 = lines([
  [3.0, 7.0, "The portal was dark. Cold.", { rate: 0.88, pitch: 0.97 }],
  [11.0, 15.5, "You had carried his bell all this way."],
  [16.0, 20.5, "Maybe it was never just a bell."],
  [24.0, 27.5, "You rang it.", { rate: 0.86, pitch: 1.0 }],
  [30.0, 35.0, "And the light came back. All of it."],
  [39.5, 44.5, "On the other side, sunrise. And a small orange shape."],
  [47.5, 52.5, "That meow. You'd know it anywhere."],
  [57.5, 62.0, "One more cat to find."],
]);

// the lens: blue-black night (cool white balance, blue lift) warming into the ignition, then sunrise gold
const NIGHT = { exposure: 0.95, temp: -0.12, tint: 0, lift: [0.004, 0.008, 0.02], gamma: [1, 1, 1], gain: [1, 1, 1], sat: 0.9, contrast: 1.08, bloom: 0.32, threshold: 0.95, halation: 0.45, streak: 0.06, grain: 0.055, vignette: 0.45, weave: 1 };
const mixGrade = (a, b, k) => {
  const o = {};
  for (const key of Object.keys(a)) {
    const va = a[key], vb = b[key] == null ? va : b[key];
    o[key] = Array.isArray(va) ? va.map((v, i) => lerp(v, vb[i], k)) : lerp(va, vb, k);
  }
  return o;
};
const IGNITION = { exposure: 1.0, temp: 0.12, lift: [0.01, 0.006, 0.004], sat: 1.0, contrast: 1.06, bloom: 0.42, halation: 0.6, streak: 0.08, vignette: 0.42 };
const SUNRISE = { exposure: 0.95, temp: 0.16, lift: [0.012, 0.008, 0.012], sat: 0.98, contrast: 1.04, bloom: 0.38, halation: 0.5, streak: 0.04, vignette: 0.4 };
function gradeAt(t) {
  if (t < 28) return mixGrade(NIGHT, NIGHT, 0);
  if (t < 38) return mixGrade(NIGHT, IGNITION, K.smooth(K.seg(t, 29, 36)));
  if (t < 56) return mixGrade(NIGHT, SUNRISE, 1);
  return mixGrade(mixGrade(NIGHT, SUNRISE, 1), { exposure: 1.05, bloom: 0.5 }, K.smooth(K.seg(t, 56, 63)));
}

export const film = {
  id: 19,
  title: "The Bell",
  chapter: "Chapter 19",
  unlockAt: 95,
  duration: D,
  poster: 44,
  tagline: "One ring. That's all it takes.",
  subs: L19.subs,
  voice: L19.voice,
  score: { mood: "epic", key: "D", bpm: 72, cues: [[6, "drop"], [22, "bell"], [28, "swell"], [38, "hit"], [46, "meow"], [56, "swell"]] },
  grade: NIGHT,
  gradeAt,
  draw(g, t, W, H) {
    g.save();
    if (W !== 960 || H !== 540) g.scale(W / 960, H / 540);
    W = 960; H = 540;
    const t0 = nowMs();
    try {
      g.fillStyle = "#03050f";
      g.fillRect(0, 0, W, H);
      for (const [a, b, fn] of SHOTS) if (t >= a && t < b) { fn(g, W, H, t); break; }
      if (t >= 64.01) shot7(g, W, H, 64);
      const ta = K.env(t, 1.5, 5.5, 1.0, 1.2);
      if (ta > 0) K.title(g, W, H, "The Bell", "Chapter 19", ta, { glow: "#cfd6e6", y: H * 0.36 });
      K.fadeBlack(g, W, H, 1 - K.smooth(K.seg(t, 0, 1.4)));
      // short dips to black on the hard cuts, so nothing pops
      K.fadeBlack(g, W, H, 0.85 * Math.max(K.env(t, 9.8, 10.2, 0.2, 0.2), K.env(t, 21.85, 22.15, 0.15, 0.15) * 0, K.env(t, 27.8, 28.2, 0.2, 0.2) * 0.7));
      // the white-gold flash on the hit, then the white-out at the end
      K.fadeColor(g, W, H, t >= 38 ? Math.exp(-(t - 38) * 1.6) : K.smooth(K.seg(t, 37.4, 38)) * 0.9, "#fff3d6");
      K.fadeColor(g, W, H, K.smooth(K.seg(t, 60.2, 63.6)), "#fff6e6");
      K.letterbox(g, W, H, 1);
      warmAhead(t, t0);
    } finally {
      g.restore();
    }
  },
};
