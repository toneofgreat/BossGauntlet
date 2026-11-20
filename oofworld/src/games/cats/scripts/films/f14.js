// films/f14.js - Chapter 14 "Almost" (FILMS.md f14). At the cold edge of the Void a narrow glass
// bridge of light runs out over a black chasm. You sit at the end with the toy mouse and the bell,
// ready to give up. The bell rings on its own, a meow comes out of the fog, and the bridge starts
// building itself again under Biscuit's paws, one amber pawprint at a time.
//
// Realism pass: every shot is lit by what is actually in it. The glass deck is the key light (it
// lights the kid and the cat from BELOW, cold blue), the fog bank ahead glows faintly and gives the
// rim, the bell and the pawprints are the only warm sources. The void is a cached volumetric fog
// field (fbm stratus banks lit by the far haze), the glass is panelled, frosted and scratched
// (an affine-mapped baked texture per panel), its edges are the emitters (painted near-white so
// the GPU lens blooms them), and it mirrors whoever stands on it. The lens does bloom, grain,
// halation and vignette (film.grade); the 2D frame paints none of that itself.
// draw(g, t, W, H) is a pure function of t; static art and fields are cached by keys without t.
import * as K from "../filmkit.js";

const D = 66;
const VW = 960, VH = 540;
const XF = 0.8;

const GLASS = "#bcd6ff";
const FOG = "#2c3650";
const AMBER = "#ffb347";
const BELLC = "#ffcf7a";
const NIGHT_AMB = "#0b1020";

// ---- the void: a cached volumetric fog field ------------------------------------------------------------
// Baked once per horizon height at half resolution (fog is soft, it upsamples cleanly) with overscan
// so the camera can drift across it. Stratus banks (horizontally stretched, domain-warped fbm) catch a
// faint luminous haze along the horizon; below it the chasm falls away through thinning fog layers
// into true black. Colour temperature: cold slate, a little warmer/brighter in the distance ahead.
const BG_W = 1040, BG_H = 1000, BG_OX = -40, BG_HOR = 500;
// One field for the whole film (horizon at BG_HOR inside it); each shot slides it to its own horizon.
// 256 x 246 texels: fog is soft and upsamples cleanly, and the bake stays well under a second.
function voidField() {
  return K.texBake("f14void3", 256, 246, (u, v, out) => {
    const X = u * BG_W + BG_OX, Y = v * BG_H;
    const d = (Y - BG_HOR) / VH; // + below the horizon
    const w1 = K.texFbm(X * 0.0032, Y * 0.0105, 3, 4);
    const w2 = K.texFbm(X * 0.0095 + w1 * 0.9, Y * 0.034 + w1 * 0.4, 7, 3);
    const dens = K.clamp(0.45 + 0.6 * w1 + 0.36 * w2);
    const band = Math.exp(-Math.abs(d + 0.015) * (d < 0 ? 5.5 : 3.2)); // luminous haze at the horizon
    const centre = 0.72 + 0.4 * Math.exp(-(((X - 520) / 520) ** 2)); // brighter far ahead
    let r, g2, b;
    if (d < 0) {
      // the "sky": no stars, only high fog over a deep blue-black
      const k = band * centre;
      r = 5 + 24 * k; g2 = 7 + 30 * k; b = 12 + 46 * k;
      const f = dens * dens * (0.35 + 0.65 * band) * centre;
      r += 34 * f; g2 += 42 * f; b += 62 * f;
    } else {
      // the chasm: fog layers lit from above, fading to black with depth
      const depth = K.clamp(d * 1.9);
      const k = band * centre * (1 - depth * 0.6);
      r = 4 + 22 * k; g2 = 5 + 27 * k; b = 9 + 42 * k;
      const layers = 0.5 + 0.5 * Math.sin(Y * 0.045 + w1 * 6 + w2 * 2);
      const f = dens * (0.4 + 0.6 * layers) * (1 - depth) ** 1.6 * centre;
      r += 30 * f; g2 += 37 * f; b += 56 * f;
      const dk = 1 - depth * 0.55;
      r *= dk; g2 *= dk; b *= dk;
    }
    out[0] = Math.min(255, r); out[1] = Math.min(255, g2); out[2] = Math.min(255, b); out[3] = 255;
  });
}
// draw the field with a slow drift + camera pan (parallax: the fog is very far away)
function voidDx(t, panX = 0) { return K.clamp(-panX * 0.25 - t * 0.6, -38, 38); }
function voidBg(g, hor, t, panX = 0, o = {}) {
  const c = voidField();
  const dx = voidDx(t, panX);
  g.drawImage(c, BG_OX + dx, hor - BG_HOR, BG_W, BG_H);
  if (o.lum > 1) {
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = o.lum - 1;
    g.drawImage(c, BG_OX + dx, hor - BG_HOR, BG_W, BG_H);
    g.restore();
  }
  // two drifting layers of wisps over the cached field so the fog is alive
  K.fog(g, VW, VH, { y: hor + 6, h: 110, color: "#3a4868", alpha: 0.32 * (o.wisp == null ? 1 : o.wisp), t: t * 0.5, seed: 3 });
  K.fog(g, VW, VH, { y: hor + 120, h: 170, color: "#1e2840", alpha: 0.3 * (o.wisp == null ? 1 : o.wisp), t: t * 0.8, seed: 8 });
}

// A dark, near layer of fog drifting through the chasm much closer to the lens than the cached field:
// it parallaxes faster than the far banks, so the void has depth. Tiles horizontally (periodic fbm).
function fgFogTex() {
  return K.texBake("f14fgfog2", 256, 80, (u, v, out) => {
    const w = K.texFbm(u * 4, v * 1.6, 41, 4, 4, 0);
    const w2 = K.texFbm(u * 10 + w * 1.2, v * 4, 43, 3, 10, 0);
    const env = Math.sin(Math.PI * v) ** 1.4;
    const d = K.clamp((0.18 + w * 0.9 + w2 * 0.35) * 1.6) * env;
    out[0] = 3; out[1] = 4; out[2] = 9; out[3] = Math.min(255, d * 235);
  });
}
function fgFog(g, t, y, h, panX = 0, alpha = 1) {
  const c = fgFogTex();
  const tw = 1500;
  let ox = (-(panX * 0.9) - t * 7) % tw;
  if (ox > 0) ox -= tw;
  g.save();
  g.globalAlpha = alpha;
  for (let x = ox; x < VW; x += tw) g.drawImage(c, x, y, tw, h);
  g.restore();
}

// out-of-focus disc for the nearest flakes: a flat disc with a slightly brighter rim (how a real lens
// renders a defocused point), soft at the very edge
function bokehSprite() {
  return K.sprite("f14:bokeh2", 64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 31);
    gr.addColorStop(0, "rgba(214,228,255,0.62)");
    gr.addColorStop(0.65, "rgba(214,228,255,0.66)");
    gr.addColorStop(0.84, "rgba(236,243,255,0.8)");
    gr.addColorStop(0.93, "rgba(214,228,255,0.25)");
    gr.addColorStop(1, "rgba(214,228,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}
// cold flecks of snow falling UP, at a continuum of depths. Far = 1 px pinpoints, dim and slow;
// mid = 1.5-4 px streaks (the shutter is open while they travel), brighter; the nearest few are big
// soft bokeh discs crossing the frame fast, stretched upward by motion blur. Lit by what is near them.
function upSnow(g, t, seed, n, alpha = 1, light = null, o = {}) {
  const bk = bokehSprite();
  const spr = K.glowSprite("#e6eeff", 0.6);
  const nearFrac = o.near == null ? 0.07 : o.near;
  const panX = o.panX || 0;
  g.save();
  for (let i = 0; i < n; i++) {
    const h1 = K.hash(i, seed), h2 = K.hash(i, seed + 1), h3 = K.hash(i, seed + 2), h4 = K.hash(i, seed + 3);
    const near = h4 < nearFrac;
    const depth = near ? 1 : h3 * h3 * 0.95; // most flakes are far away
    const sp = near ? 80 + h3 * 70 : 6 + depth * 46;
    const span = near ? 860 : 680;
    let x = h1 * 1040 + Math.sin(t * 0.55 + i * 1.3) * 9 * (0.4 + depth) + K.noise(t * 0.3 + i, 5) * 6 * depth - panX * (0.05 + depth * 0.7);
    x = ((x % 1040) + 1040) % 1040 - 40;
    const y = VH + (near ? 160 : 70) - ((h2 * span + t * sp) % span);
    let lk = 1;
    if (light) { const dd = Math.hypot(x - light.x, y - light.y); lk = 0.3 + 1.15 * Math.exp(-dd / light.r); }
    if (near) {
      const r = 9 + h3 * 22;
      const st = 1.03 + sp * 0.0015;
      g.globalAlpha = Math.min(1, alpha * (0.1 + 0.1 * h1) * lk);
      g.drawImage(bk, x - r, y - r * st, r * 2, r * 2 * st);
    } else if (depth < 0.1) {
      // far: a sharp pinpoint, barely there
      g.globalAlpha = Math.min(1, alpha * (0.2 + depth * 4) * lk);
      g.fillStyle = "#cfdcf5";
      g.fillRect(x, y, 1, 1);
    } else {
      // mid: a soft streak 1-4 px wide, as long as the flake travels while the shutter is open;
      // the nearer ones are slightly out of focus (softer, wider, dimmer per pixel)
      const r = 0.8 + depth * 3.4 * (0.6 + h1 * 0.6);
      const len = r * 1.4 + sp * 0.07;
      g.globalAlpha = Math.min(1, alpha * (0.35 + depth * 0.8) * lk);
      g.drawImage(spr, x - r * 1.3, y - len, r * 2.6, len * 2);
    }
  }
  g.restore();
}

// ---- 3D: a pinhole camera with yaw (world: deck top y = 0, +y DOWN, z forward) ---------------------------
function project(cam, wx, wy, wz) {
  let dx = wx - cam.x, dz = wz - cam.z;
  if (cam.yaw) {
    const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
    const nx = c * dx - s * dz, nz = s * dx + c * dz;
    dx = nx; dz = nz;
  }
  if (dz < 14) return null;
  const k = cam.F / dz;
  return [(cam.cx == null ? VW / 2 : cam.cx) + dx * k, cam.hor + (wy - cam.y) * k, k, dz];
}

// The frosted glass of a panel: smudges, fine scratches and a few deeper gouges, as white on clear.
// Baked once; each panel maps it with an affine transform so it sits on the deck in perspective.
function glassTex() {
  return K.texBake("f14glass2", 192, 192, (u, v, out, x, y) => {
    const sm = K.texFbm(u * 4, v * 4, 21, 4, 4, 4);
    const sc1 = 1 - Math.min(1, Math.abs(K.texNoise(u * 3 + v * 40, v * 3, 22, 0, 0)) * 9);
    const sc2 = 1 - Math.min(1, Math.abs(K.texNoise(u * 46 - v * 9, u * 2, 23, 0, 0)) * 12);
    const speck = K.hash(x * 193 + y, 24) > 0.996 ? 1 : 0;
    const a = K.clamp(0.1 + sm * 0.22) + Math.max(0, sc1) * 0.35 * K.clamp(sm + 0.6) + Math.max(0, sc2) * 0.2 + speck * 0.6;
    out[0] = 225; out[1] = 236; out[2] = 255; out[3] = Math.min(255, a * 255);
  });
}

// the glass bridge. A slab BW wide (half width) and TH thick, built of SEG-long panels.
//  o.fog: fade distance; o.curve(z) -> x offset; o.alphaAt(z) build-in 0..1; o.paws(z) -> bool;
//  o.endZ: the far end (dissolving edge); o.bright: emission scale; o.deck: Path2D to collect the top
//  surface for reflections/clipping; o.under: the light it scatters into the fog below
const BW0 = 30, TH = 6, SEG = 40;

// A real pawprint, baked once: the trilobed main (metacarpal) pad and four toe beans, each soft-edged
// (light diffusing in the glass around it), white-hot in the middle, amber at the rim. Toes point -y.
function pawSprite() {
  return K.sprite("f14:paw3", 48, 44, (g) => {
    const pad = (x, y, rx, ry, rot) => {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.scale(1, ry / rx);
      const gr = g.createRadialGradient(0, -rx * 0.15, 0, 0, 0, rx * 1.25);
      gr.addColorStop(0, "rgba(255,246,222,1)");
      gr.addColorStop(0.45, "rgba(255,200,110,0.95)");
      gr.addColorStop(0.78, "rgba(255,160,60,0.6)");
      gr.addColorStop(1, "rgba(255,130,40,0)");
      g.fillStyle = gr;
      g.beginPath(); g.arc(0, 0, rx * 1.25, 0, K.TAU); g.fill();
      g.restore();
    };
    // main pad: three soft lobes merged
    pad(24, 31, 9.5, 7.5, 0);
    pad(17.5, 33, 5.5, 5.5, 0);
    pad(30.5, 33, 5.5, 5.5, 0);
    // toes, fanned
    pad(11, 18.5, 3.8, 4.8, -0.35);
    pad(19.5, 12.5, 3.9, 5, -0.1);
    pad(28.5, 12.5, 3.9, 5, 0.1);
    pad(37, 18.5, 3.8, 4.8, 0.35);
  });
}
// one print lying in the deck plane at (x, y): w = screen width, sy = foreshortening (vertical squash
// of the deck plane at that depth), age = seconds since the paw lifted (Infinity = long settled)
function drawPrint(g, x, y, w, sy, alpha, age) {
  if (alpha <= 0.01 || w < 0.6) return;
  const flash = age < 0 ? 0 : Math.exp(-age * 4.5);
  const lvl = alpha * (0.6 + 0.9 * flash);
  g.save();
  g.globalCompositeOperation = "lighter";
  // the warm pool it spills into the frosted glass around it (elliptical: it lies in the plane)
  const pr = w * (3.2 + flash * 1.6);
  g.globalAlpha = Math.min(1, 0.32 * lvl);
  g.drawImage(K.glowSprite("#ff9440"), x - pr, y - pr * sy * 1.15, pr * 2, pr * 2 * sy * 1.15);
  g.globalAlpha = Math.min(1, lvl);
  const h = w * (44 / 48) * sy;
  g.drawImage(pawSprite(), x - w / 2, y - h / 2, w, h);
  if (flash > 0.02) {
    g.globalAlpha = Math.min(1, 0.7 * flash * alpha);
    g.drawImage(K.glowSprite("#fff2d8"), x - w * 0.9, y - w * 0.9 * sy, w * 1.8, w * 1.8 * sy);
  }
  g.restore();
}

// the glass bridge. A slab BW wide (half width) and TH thick, built of SEG-long panels.
//  o.fog: fade distance; o.curve(z) -> x offset; o.alphaAt(z) build-in 0..1; o.paws(z) -> false | age
//  (seconds since that print landed; true = long settled); o.bright: emission scale; o.deck: Path2D to
//  collect the top surface for reflections/clipping; o.under: the light it scatters into the fog;
//  o.mirror: {hor, dx, lum} the void field reflected in the glass (Fresnel: mirror at grazing angles
//  far away, clear near the camera where you look down through it into the black)
function bridge(g, cam, z0, z1, o = {}) {
  const fogD = o.fog || 2600;
  const BW = o.bw || BW0;
  const cx = o.curve || (() => 0);
  const em = o.bright == null ? 1 : o.bright;
  const zs = [];
  for (let z = z0; z < z1; ) {
    zs.push(z);
    const pp = project(cam, cx(z), 0, z);
    const dz = pp ? pp[3] : 0;
    const st = dz > 1800 ? 8 : dz > 1000 ? 4 : dz > 520 ? 2 : 1;
    z = (Math.floor(z / SEG + 1e-6) + st) * SEG;
  }
  zs.push(z1);
  const P = [];
  for (const z of zs) {
    const x0 = cx(z);
    const l = project(cam, x0 - BW, 0, z), r = project(cam, x0 + BW, 0, z);
    const lb = project(cam, x0 - BW, TH, z), rb = project(cam, x0 + BW, TH, z);
    const dz = l ? l[3] : 1e9;
    P.push({ z, l, r, lb, rb, b: o.alphaAt ? o.alphaAt(z) : 1, f: Math.exp(-Math.max(0, dz - 60) / fogD), seam: Math.abs(z / SEG - Math.round(z / SEG)) < 1e-4 });
  }
  // 0) the glow it throws into the fog around it: a wide cold halo hanging in the volume, strongest
  // near the camera, falling off along the bridge and with the fog
  const halo = K.glowSprite("#5a76b8");
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = P.length - 1; i >= 0; i -= 2) {
    const a = P[i];
    if (!a.l || !a.r || a.b < 0.05) continue;
    const c = project(cam, cx(a.z), TH * 0.5, a.z);
    if (!c) continue;
    const w = (a.r[0] - a.l[0]) * 2.6 + 190 * c[2] + 30;
    g.globalAlpha = Math.min(1, 0.13 * a.f * Math.min(1, a.b) * em * (o.halo == null ? 1 : o.halo));
    g.drawImage(halo, c[0] - w, c[1] - w * 0.55, w * 2, w * 1.1);
  }
  g.restore();
  // 1) light scattered DOWN into the fog under the deck: a soft curtain hanging below the glass, so
  // the bridge reads as a glowing object suspended in volume
  if (o.under !== 0) {
    const U = (o.under == null ? 1 : o.under) * em;
    const spr = K.glowSprite("#6f8ed0");
    g.save();
    g.globalCompositeOperation = "lighter";
    for (let i = P.length - 1; i >= 0; i--) {
      const a = P[i];
      if (!a.lb || !a.rb || a.b < 0.03) continue;
      const c = project(cam, cx(a.z), TH + 60, a.z);
      if (!c) continue;
      const w = Math.max(6, (a.rb[0] - a.lb[0]) * 1.3 + 50 * c[2]), h = 130 * c[2] + 8;
      g.globalAlpha = Math.min(1, 0.2 * a.f * Math.min(1, a.b) * U);
      g.drawImage(spr, c[0] - w, c[1] - h, w * 2, h * 2);
    }
    g.restore();
  }
  // 2) the glass top as one surface: Fresnel reflection of the fog, and the dark chasm seen through it
  const all = new Path2D();
  let any = false;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    if (!a.l || !b.l || !a.r || !b.r || a.b < 0.5) continue;
    all.moveTo(a.l[0], a.l[1]); all.lineTo(a.r[0], a.r[1]); all.lineTo(b.r[0], b.r[1]); all.lineTo(b.l[0], b.l[1]); all.closePath();
    any = true;
  }
  if (any) {
    g.save();
    g.clip(all);
    // looking down through the glass close to the camera: the black of the chasm, a little blue
    const yh = o.mirror ? o.mirror.hor : cam.hor;
    const dk = g.createLinearGradient(0, yh, 0, VH);
    dk.addColorStop(0, "rgba(3,5,10,0)");
    dk.addColorStop(0.25, "rgba(3,5,10,0.25)");
    dk.addColorStop(1, "rgba(2,3,7,0.62)");
    g.fillStyle = dk;
    g.fillRect(-100, yh, VW + 200, VH - yh + 100);
    if (o.mirror) {
      // the fog banks mirrored about the horizon: the bright haze band lands on the far deck (grazing
      // angle, near-total reflection); nearer the camera the glass reflects the darker sky above
      const m = o.mirror;
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.55 * em;
      g.translate(0, m.hor * 2);
      g.scale(1, -1);
      g.drawImage(voidField(), BG_OX + (m.dx || 0), m.hor - BG_HOR, BG_W, BG_H);
    }
    g.restore();
  }
  // 3) per panel: sides, Fresnel tint, frost, seams, glints, emitting edges, prints
  const tex = glassTex();
  let pat = null;
  try { pat = g.createPattern(tex, "repeat"); } catch { pat = null; }
  const prints = [];
  for (let i = P.length - 2; i >= 0; i--) {
    const a = P[i], b = P[i + 1];
    if (!a.l || !b.l || !a.r || !b.r || !a.lb || !b.lb || !a.rb || !b.rb) continue;
    const build = Math.min(a.b, 1);
    if (build <= 0.01) continue;
    const fade = a.f * build;
    if (fade < 0.008) continue;
    const near = Math.exp(-a.l[3] / 700); // 1 close to camera, 0 far
    const nearE = Math.exp(-a.l[3] / 1300);
    g.save();
    g.globalCompositeOperation = "lighter";
    // the slab's thickness: light piped through the glass glows in its side faces
    g.fillStyle = K.rgba("#9cbcf4", 0.26 * fade * em * (0.5 + 0.5 * nearE));
    g.beginPath();
    g.moveTo(a.l[0], a.l[1]); g.lineTo(b.l[0], b.l[1]); g.lineTo(b.lb[0], b.lb[1]); g.lineTo(a.lb[0], a.lb[1]); g.closePath();
    g.moveTo(a.r[0], a.r[1]); g.lineTo(b.r[0], b.r[1]); g.lineTo(b.rb[0], b.rb[1]); g.lineTo(a.rb[0], a.rb[1]); g.closePath();
    g.fill();
    // top: a faint body tint, brighter at grazing angles (Fresnel), almost clear underfoot
    const top = new Path2D();
    top.moveTo(a.l[0], a.l[1]); top.lineTo(a.r[0], a.r[1]); top.lineTo(b.r[0], b.r[1]); top.lineTo(b.l[0], b.l[1]); top.closePath();
    if (o.deck) o.deck.addPath(top);
    const mx0 = a.l[0], mx1 = a.r[0], my = (a.l[1] + a.r[1]) / 2;
    const gr = g.createLinearGradient(mx0, my, mx1, a.r[1]);
    const ta = (0.035 + 0.17 * (1 - near) ** 2) * fade * em;
    gr.addColorStop(0, K.rgba("#dbe8ff", ta * 2.2));
    gr.addColorStop(0.12, K.rgba(GLASS, ta * 0.8));
    gr.addColorStop(0.5, K.rgba(GLASS, ta * 0.6));
    gr.addColorStop(0.88, K.rgba(GLASS, ta * 0.8));
    gr.addColorStop(1, K.rgba("#dbe8ff", ta * 2.2));
    g.fillStyle = gr;
    g.fill(top);
    // frost + scratches mapped onto the panel (affine from three of its corners)
    if (pat && a.l[2] > 0.35 && pat.setTransform && typeof DOMMatrix !== "undefined") {
      const sx = 1 / 192;
      const ux = (a.r[0] - a.l[0]) * sx, uy = (a.r[1] - a.l[1]) * sx;
      const vx = (b.l[0] - a.l[0]) * sx, vy = (b.l[1] - a.l[1]) * sx;
      const ph = K.hash(Math.round(a.z / SEG), 5) * 192;
      pat.setTransform(new DOMMatrix([ux, uy, vx, vy, a.l[0] - vx * ph, a.l[1] - vy * ph]));
      g.globalAlpha = Math.min(1, 0.36 * fade * em * (0.35 + near));
      g.fillStyle = pat;
      g.fill(top);
      g.globalAlpha = 1;
    }
    // glints: scratches that happen to line up with the light and the lens flash for a moment as the
    // camera drifts (view dependent, so they twinkle without anything moving)
    if (a.l[2] > 0.3) {
      const zi = Math.round(a.z / SEG);
      for (let k = 0; k < 3; k++) {
        const hu = K.hash(zi * 7 + k, 61), hv = K.hash(zi * 7 + k, 62), hp = K.hash(zi * 7 + k, 63);
        const tw = Math.max(0, Math.sin(hp * 40 + cam.x * 0.05 + cam.z * 0.02 + (o.t || 0) * (0.3 + hp * 0.5))) ** 10;
        if (tw < 0.05) continue;
        const px = K.lerp(K.lerp(a.l[0], a.r[0], hu), K.lerp(b.l[0], b.r[0], hu), hv);
        const py = K.lerp(K.lerp(a.l[1], a.r[1], hu), K.lerp(b.l[1], b.r[1], hu), hv);
        const s = 1.2 + 3.5 * a.l[2] * tw;
        g.globalAlpha = Math.min(1, tw * fade * 0.9);
        g.fillStyle = "#f6f9ff";
        g.fillRect(px - s, py - 0.4, s * 2, 0.8);
        g.fillRect(px - 0.6, py - 0.6, 1.2, 1.2);
      }
      g.globalAlpha = 1;
    }
    // panel seams: the joint catches light across the deck and down both sides
    if (a.seam && a.l[2] > 0.12) {
      g.strokeStyle = K.rgba("#e6f0ff", (0.04 + 0.1 * (1 - near)) * fade * em);
      g.lineWidth = Math.max(0.5, 0.7 * a.l[2]);
      g.beginPath();
      g.moveTo(a.lb[0], a.lb[1]); g.lineTo(a.l[0], a.l[1]); g.lineTo(a.r[0], a.r[1]); g.lineTo(a.rb[0], a.rb[1]);
      g.stroke();
    }
    // the emitting edges: brightest close to the camera, swallowed by the fog with distance
    const eA = fade * em * (0.3 + 0.7 * nearE);
    // (a thin emitter: the line widths saturate close to the camera instead of becoming bars)
    const lw = Math.min(a.l[2], 1.6);
    g.strokeStyle = K.rgba("#a9c6ff", 0.3 * eA);
    g.lineWidth = Math.max(1.2, 3.6 * lw);
    g.beginPath();
    g.moveTo(a.l[0], a.l[1]); g.lineTo(b.l[0], b.l[1]);
    g.moveTo(a.r[0], a.r[1]); g.lineTo(b.r[0], b.r[1]);
    g.stroke();
    g.strokeStyle = K.rgba("#f4f8ff", Math.min(1, 1.0 * eA));
    g.lineWidth = Math.max(0.6, 1.1 * lw);
    g.stroke();
    g.strokeStyle = K.rgba("#cfe0ff", 0.36 * eA);
    g.lineWidth = Math.max(0.5, 0.8 * lw);
    g.beginPath();
    g.moveTo(a.lb[0], a.lb[1]); g.lineTo(b.lb[0], b.lb[1]);
    g.moveTo(a.rb[0], a.rb[1]); g.lineTo(b.rb[0], b.rb[1]);
    g.stroke();
    // the newest panel is still forming: white-hot while it condenses
    if (build < 1) K.glow(g, (a.l[0] + b.r[0]) / 2, (a.l[1] + b.r[1]) / 2, (a.r[0] - a.l[0]) * 0.9, "#ffffff", 0.45 * (1 - build) * a.f);
    g.restore();
    // amber pawprints set into the glass, alternating left / right in a walking gait
    const pv = o.paws && o.paws(a.z);
    if (pv !== false && pv != null) {
      const zi = Math.round(a.z / SEG);
      const side = zi % 2 ? 1 : -1;
      const zc = a.z + SEG / 2;
      const pp = project(cam, cx(zc) + side * 6, 0, zc);
      if (pp) {
        const sy = K.clamp(Math.abs(cam.y) / pp[3] * 1.15, 0.2, 0.9);
        drawPrint(g, pp[0], pp[1], 11 * pp[2], sy, Math.min(1, build * 1.4) * Math.max(0.15, a.f), pv === true ? 99 : pv);
        prints.push(pp);
      }
    }
  }
  P.prints = prints;
  return P;
}

// a figure layer mirrored in the glass: flipped about the contact line, soft, clipped to the deck
// o.mode: "lighter" (a lit figure adds to the glow) or "source-over" (a dark figure blocks the
// reflected fog light, so it shows as a dim shape in the glass); o.x/o.y: where a small layer sits
function reflect(g, src, yLine, alpha, deck, blur = 1.5, o = {}) {
  if (!deck || alpha <= 0) return;
  g.save();
  g.clip(deck);
  g.translate(0, yLine * 2);
  g.scale(1, -1);
  if (o.x || o.y) g.translate(o.x || 0, o.y || 0);
  g.globalCompositeOperation = o.mode || "lighter";
  K.dof(g, src, Math.max(o.minBlur == null ? 4.5 : o.minBlur, blur), alpha); // frosted glass: a soft mirror (and a cheap, downscaled blur)
  g.restore();
}

// the kid (back view): the deck lights her from below, the fog ahead rims her
function kidOpts(o) {
  return Object.assign({ view: "back", hood: false, bell: true, ambient: NIGHT_AMB, shadow: false }, o);
}
// drawKid: the kit figure plus what the deck light does to it. Sitting, the body settles (a little
// lower and wider, the raincoat hem spreading on the glass); the light comes from BELOW, so it falls
// off up the body (shoulders and hair darker than the hem). under: 0..1 strength of that falloff.
function drawKid(Lg, x, y, h, o, under = 0.6) {
  const sit = K.clamp(o.sit || 0);
  if (sit > 0.3) {
    const a = K.smooth((sit - 0.3) / 0.7);
    const hg = Lg.createLinearGradient(0, y - h * 0.08, 0, y + h * 0.02);
    hg.addColorStop(0, K.rgba("#6e5a14", a));
    hg.addColorStop(1, K.rgba("#3a300a", a));
    Lg.fillStyle = hg;
    Lg.beginPath();
    Lg.ellipse(x, y - h * 0.025, h * 0.17, h * 0.045, 0, Math.PI, 0);
    Lg.quadraticCurveTo(x + h * 0.12, y + h * 0.012, x, y + h * 0.012);
    Lg.quadraticCurveTo(x - h * 0.12, y + h * 0.012, x - h * 0.17, y - h * 0.025);
    Lg.fill();
  }
  Lg.save();
  Lg.translate(x, y);
  Lg.scale(1 + sit * 0.05, 1 - sit * 0.1);
  Lg.translate(-x, -y);
  K.drawPerson(Lg, x, y, h, o);
  Lg.restore();
  if (under > 0) {
    Lg.save();
    Lg.globalCompositeOperation = "source-atop";
    const gr = Lg.createLinearGradient(0, y - h, 0, y);
    gr.addColorStop(0, `rgba(3,4,10,${0.62 * under})`);
    gr.addColorStop(0.55, `rgba(3,4,10,${0.3 * under})`);
    gr.addColorStop(1, "rgba(3,4,10,0)");
    Lg.fillStyle = gr;
    Lg.fillRect(x - h * 0.6, y - h * 1.1, h * 1.2, h * 1.15);
    Lg.restore();
  }
}
// a contact shadow on glowing glass is the light being blocked: dark under the soles
function contact(g, x, y, w, a = 0.55) {
  K.shadowBlob(g, x, y, w, w * 0.18, { alpha: a, color: "#03040a", soft: 1.2 });
}

// ---- close-up props: felt mouse --------------------------------------------------------------------------
// A real felt toy, seen from above and a little in front: a plump teardrop dome (per-pixel form light:
// the cold glow ahead from the deck edge and the fog is the key, a dim bounce from the lap below), a
// mottled felt with pilling and fine fibres, a halo of stray fuzz on its silhouette, a sewn spine seam
// in relief, two felt ears with occlusion at their roots, a stitched eye and a twisted string tail.
// Profile: t = 0 at the rump, 1 at the nose (sprite units, origin at the sprite's (210,150)).
const MZ = { x0: -130, x1: 154 };
function mouseProf(x) {
  const t = (x - MZ.x0) / (MZ.x1 - MZ.x0);
  if (t <= 0 || t >= 1) return null;
  const r = 64 * Math.sqrt(Math.max(0, 1 - t ** 2.4)) * Math.sqrt(Math.min(1, t * 5));
  const cy = -14 + 26 * t * t;
  return { t, r, cy, top: cy - r, crest: cy - r * 0.35, bot: cy + r * 0.55 };
}
// dome height at (x, y); -1 outside
function mouseH(x, y) {
  const P = mouseProf(x);
  if (!P || P.r < 0.5 || y < P.top || y > P.bot) return -1;
  const v = y < P.crest ? (y - P.crest) / (P.crest - P.top) : (y - P.crest) / (P.bot - P.crest);
  return Math.sqrt(Math.max(0, 1 - v * v)) * P.r * 0.85;
}
function mouseBody() {
  return K.texBake("f14mouse6", 252, 156, (u, v, out, px, py) => {
    // baked at the size it is shown (0.6x), then drawn into the 420 x 260 sprite
    const x = (px + 0.5) / 0.6 - 210, y = (py + 0.5) / 0.6 - 150;
    const h = mouseH(x, y);
    if (h < 0) { out[0] = out[1] = out[2] = out[3] = 0; return; }
    const hx = (mouseH(x + 1, y) < 0 ? h : mouseH(x + 1, y)) - (mouseH(x - 1, y) < 0 ? h : mouseH(x - 1, y));
    const hy = (mouseH(x, y + 1) < 0 ? 0 : mouseH(x, y + 1)) - (mouseH(x, y - 1) < 0 ? 0 : mouseH(x, y - 1));
    let nx = -hx / 2, ny = -hy / 2, nz = 1;
    const nl = Math.hypot(nx, ny, nz);
    nx /= nl; ny /= nl; nz /= nl;
    // felt: mottled fibre mat, pilling, a few darker fibres, fine grain
    const mac = K.texFbm(x * 0.018, y * 0.018, 71, 3);
    const pil = K.texFbm(x * 0.11, y * 0.11, 72, 3);
    const fib = K.texNoise(x * 0.9 + y * 0.3, y * 0.9 - x * 0.2, 73);
    const sp = K.hash(px * 389 + py, 74);
    let alb = 1 + mac * 0.12 + pil * 0.09 + fib * 0.06 - (sp > 0.985 ? 0.25 : 0);
    // light: key from ahead and above (top of frame), soft wrap (felt scatters); bounce from below
    const l1 = Math.max(0, (nx * 0.25 - ny * 0.78 + nz * 0.58 + 0.35) / 1.35);
    const l2 = Math.max(0, ny * 0.7 + nz * 0.4);
    const ao = 0.45 + 0.55 * Math.min(1, (h / (mouseProf(x).r * 0.85 + 1e-3)) * 1.6);
    const sheen = (1 - nz) ** 2 * 0.3; // felt's fuzzy rim sheen at grazing angles
    // (exposed for the scene: the felt is mid grey, so even its lit side sits well below white)
    const kR = 0.62 * l1 + 0.12 * l2 + 0.06 + sheen, kG = 0.68 * l1 + 0.13 * l2 + 0.07 + sheen, kB = 0.8 * l1 + 0.17 * l2 + 0.1 + sheen * 1.1;
    alb *= ao;
    const P = mouseProf(x);
    const edge = Math.min(1, (y - P.top) * 0.7, (P.bot - y) * 0.7, P.r * 0.2);
    out[0] = Math.min(255, 168 * alb * kR);
    out[1] = Math.min(255, 162 * alb * kG);
    out[2] = Math.min(255, 152 * alb * kB);
    out[3] = 255 * K.clamp(edge);
  });
}
function feltMouseSprite() {
  return K.sprite("f14:mouse5", 420, 260, (g) => {
    g.translate(210, 150);
    // tail: two-ply twisted string from under the rump, lit along its top, frayed at the end
    const tail = new Path2D();
    tail.moveTo(-124, -2);
    tail.bezierCurveTo(-170, 6, -158, 92, -204, 86);
    g.lineCap = "round";
    g.strokeStyle = "#5d5850"; g.lineWidth = 3.4; g.stroke(tail);
    g.strokeStyle = "rgba(200,192,180,0.7)"; g.lineWidth = 1.3;
    g.setLineDash([3, 3]); g.stroke(tail); g.setLineDash([]);
    for (let i = 0; i < 7; i++) {
      g.strokeStyle = `rgba(190,182,170,${0.3 + i * 0.05})`;
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(-203, 86);
      g.quadraticCurveTo(-212 - i * 1.5, 82 + i * 2, -215 - i * 2, 76 + i * 3.4);
      g.stroke();
    }
    // stray fuzz standing off the silhouette (drawn first: the body covers the roots)
    const R = K.rng("felt5");
    g.lineWidth = 0.55;
    for (let i = 0; i < 9000; i++) {
      const x = -134 + R() * 290, y = -84 + R() * 130;
      if (mouseH(x, y) < 0) continue;
      const a = R() * K.TAU, l = 1.5 + R() * 4.5;
      const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l;
      if (mouseH(ex, ey) >= 0) continue;
      const lit = ey < mouseProf(Math.max(MZ.x0 + 1, Math.min(MZ.x1 - 1, x))).crest ? 0.5 : 0.22;
      g.strokeStyle = R() > 0.45 ? `rgba(200,206,215,${lit})` : "rgba(90,88,86,0.35)";
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + 0.7) * l * 0.5, y + Math.sin(a + 0.7) * l * 0.5, ex, ey);
      g.stroke();
    }
    g.drawImage(mouseBody(), -210, -150, 420, 260);
    // surface fibres lying on the felt (cached, so many are affordable)
    g.save();
    const clip = new Path2D();
    for (let x = MZ.x0; x <= MZ.x1; x += 4) { const P = mouseProf(Math.min(MZ.x1 - 0.5, Math.max(MZ.x0 + 0.5, x))); clip.lineTo(x, P ? P.top : 0); }
    for (let x = MZ.x1; x >= MZ.x0; x -= 4) { const P = mouseProf(Math.min(MZ.x1 - 0.5, Math.max(MZ.x0 + 0.5, x))); clip.lineTo(x, P ? P.bot : 0); }
    clip.closePath();
    g.clip(clip);
    for (let i = 0; i < 2600; i++) {
      const x = -130 + R() * 284, y = -84 + R() * 130;
      const a = R() * K.TAU, l = 1.2 + R() * 3;
      g.strokeStyle = R() > 0.5 ? "rgba(230,232,236,0.1)" : "rgba(26,24,24,0.12)";
      g.lineWidth = 0.45;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.6, y + Math.sin(a + 0.5) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    g.restore();
    // the spine seam along the crest: stitches in relief (shadow below each, thread sheen above)
    const seam = new Path2D();
    for (let x = -118; x <= 60; x += 6) { const P = mouseProf(x); if (x === -118) seam.moveTo(x, P.crest); else seam.lineTo(x, P.crest); }
    g.lineCap = "butt";
    g.setLineDash([4.5, 3.5]);
    g.strokeStyle = "rgba(28,26,26,0.55)"; g.lineWidth = 2.4;
    g.save(); g.translate(0, 1.4); g.stroke(seam); g.restore();
    g.strokeStyle = "rgba(118,114,108,0.95)"; g.lineWidth = 1.5; g.stroke(seam);
    g.strokeStyle = "rgba(220,226,236,0.5)"; g.lineWidth = 0.6;
    g.save(); g.translate(0, -0.7); g.stroke(seam); g.restore();
    g.setLineDash([]);
    // the seam pulls the felt in: a soft crease either side
    g.save(); g.translate(0, 3); g.strokeStyle = "rgba(20,20,24,0.12)"; g.lineWidth = 4; g.stroke(seam); g.restore();
    // ears: the far one first (darker), then the near one; occlusion at the roots
    const ear = (ex, ey, rx, ry, rot, k) => {
      const eg = g.createRadialGradient(ex - 5, ey - 9, 2, ex, ey, ry * 1.1);
      eg.addColorStop(0, K.shade("#c9a2a4", -k));
      eg.addColorStop(0.6, K.shade("#9d6f74", -k));
      eg.addColorStop(1, K.shade("#4e3236", -k));
      g.fillStyle = eg;
      const ep = new Path2D(); ep.ellipse(ex, ey, rx, ry, rot, 0, K.TAU);
      g.fill(ep);
      g.fillStyle = `rgba(90,44,52,${0.4 + k})`;
      g.beginPath(); g.ellipse(ex + 2, ey + 3, rx * 0.55, ry * 0.6, rot, 0, K.TAU); g.fill();
      K.texFill(g, "macro", ep, { scale: 40, mode: "soft-light", alpha: 0.6, tex: { seed: 4 } });
    };
    const aoR = (x, y, r, a) => {
      const ao = g.createRadialGradient(x, y, 2, x, y, r);
      ao.addColorStop(0, `rgba(10,10,14,${a})`);
      ao.addColorStop(1, "rgba(10,10,14,0)");
      g.fillStyle = ao;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    aoR(54, -40, 26, 0.4);
    ear(48, -60, 15, 20, -0.5, 0.25);
    aoR(80, -34, 30, 0.45);
    ear(80, -54, 19, 24, -0.25, 0);
    // stitched eye (a small cross in dark thread, with a sheen)
    g.lineCap = "round";
    g.strokeStyle = "#2a2826"; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(108, -8); g.lineTo(115, -1); g.moveTo(115, -8); g.lineTo(108, -1); g.stroke();
    g.strokeStyle = "rgba(200,206,220,0.35)"; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(108.6, -8.4); g.lineTo(115, -2); g.stroke();
    // felt nose: a little ball with a soft highlight and its contact shadow
    g.fillStyle = "rgba(10,10,14,0.35)";
    g.beginPath(); g.ellipse(152, 19, 6, 3, 0, 0, K.TAU); g.fill();
    const ng = g.createRadialGradient(148, 9, 1, 150, 12, 7);
    ng.addColorStop(0, "#d9a0aa"); ng.addColorStop(1, "#7a4450");
    g.fillStyle = ng;
    g.beginPath(); g.arc(150, 13, 6, 0, K.TAU); g.fill();
  });
}
function feltMouse(g, x, y, s, wet, warm = 0) {
  g.drawImage(feltMouseSprite(), x - 210 * s, y - 150 * s, 420 * s, 260 * s);
  if (wet > 0) {
    // the tear soaks in: a darker spreading spot on the felt (wet fibres darken), fibre-ragged edge
    const wx = x - 6 * s, wy = y - 40 * s, r = (6 + wet * 14) * s;
    g.save();
    g.translate(wx, wy);
    g.scale(1, 0.7);
    const wg = g.createRadialGradient(0, 0, 0, 0, 0, r);
    wg.addColorStop(0, `rgba(16,18,26,${0.62 * wet})`);
    wg.addColorStop(0.7, `rgba(16,18,26,${0.45 * wet})`);
    wg.addColorStop(0.88, `rgba(16,18,26,${0.18 * wet})`);
    wg.addColorStop(1, "rgba(16,18,26,0)");
    g.fillStyle = wg;
    g.fillRect(-r, -r, r * 2, r * 2);
    g.restore();
  }
  if (warm > 0) K.lightPool(g, x + 90 * s, y - 20 * s, 150 * s, BELLC, { intensity: 0.25 * warm, flat: 0.7 });
}
// the orange fur tuft from the fence nail, tied to the bell string: fine curved hairs that lift and
// settle in a breath of air (lit warm by the bell)
function fuzzTuft(g, x, y, s, t, warm = 0) {
  const R = K.rng("tuft2");
  const breeze = Math.sin(t * 1.3) * 0.22 + K.noise(t * 0.7, 4) * 0.18;
  g.lineCap = "round";
  for (let i = 0; i < 26; i++) {
    const a0 = -2.2 + R() * 1.6;
    const l = (12 + R() * 16) * s;
    const bend = (R() - 0.5) * 1.2 + breeze * (0.6 + R() * 0.8);
    const a1 = a0 + bend * 0.5, a2 = a0 + bend;
    const mx = x + Math.cos(a1) * l * 0.55, my = y + Math.sin(a1) * l * 0.55;
    const ex = x + Math.cos(a2) * l, ey = y + Math.sin(a2) * l;
    const c = R() > 0.3 ? [200 + warm * 40, 120 + warm * 30, 56] : [226, 206, 170];
    g.strokeStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2]},${(0.3 + R() * 0.5).toFixed(2)})`;
    g.lineWidth = (0.3 + R() * 0.45) * s;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(mx, my, ex, ey);
    g.stroke();
  }
}

// ---- shots ----------------------------------------------------------------------------------------------
// S1 [0-10] wide from high up: the bridge of light curving away across the chasm into the fog; you,
// tiny, walking it. Slow eased push-in and a drift right.
function curve1(z) { return Math.sin(z / 1500) * 160 + Math.sin(z / 520) * 18; }
function shot1(g, t) {
  prewarm(t);
  const p = K.ease.inOut(K.seg(t, 0, 10.5));
  const hor = 206;
  voidBg(g, hor, t, p * 30, { seed: 2 });
  fgFog(g, t, hor + 70, 260, p * 30, 0.75);
  fgFog(g, t * 1.7 + 30, hor + 190, 330, p * 60, 0.6);
  const cam = { x: 150 - p * 26, y: -430 + p * 20, z: -260 + p * 90, F: 660, hor, yaw: 0.06 };
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1 + p * 0.035, shakeT: t, shakeAmt: 0.7 }, () => {
    const deck = new Path2D();
    bridge(g, cam, 0, 5600, { fog: 2300, curve: curve1, deck, t, mirror: { hor, dx: voidDx(t, p * 30) } });
    const kz = K.lerp(1300, 1880, p);
    const kp = project(cam, curve1(kz), 0, kz);
    if (kp) {
      const h = 130 * kp[2];
      const L = K.layer(VW, VH, "f14kid");
      const o = kidOpts({ walk: true, phase: kz / 70, t, light: { x: kp[0] + 20, y: kp[1] + h * 0.8, color: GLASS, strength: 1.1, z: 0.1 } });
      drawKid(L.g, kp[0], kp[1], h, o, 0.5);
      reflect(g, L.canvas, kp[1], 0.3, deck, 0.8);
      contact(g, kp[0], kp[1], h * 0.16, 0.6);
      g.drawImage(L.canvas, 0, 0, VW, VH);
      K.lightPool(g, kp[0], kp[1], h * 0.5, GLASS, { intensity: 0.12, flat: 0.3 });
    }
  });
  upSnow(g, t, 11, 110, 0.8, null, { panX: p * 30 });
}

// S2 [10-20] static three-quarter wide: the bridge comes in from the left foreground and just stops
// in the fog, its last panel fraying into motes of light. You walk out to the end and stop (drop 10).
function shot2(g, t) {
  prewarm(t);
  const hor = 280;
  voidBg(g, hor, t, 0, { seed: 5, lum: 1.05 });
  fgFog(g, t, hor + 40, 220, 0, 0.7);
  fgFog(g, t * 1.6 + 50, hor + 140, 300, 0, 0.55);
  const cam = { x: 430, y: -95, z: -470, F: 760, hor, yaw: -0.86, cx: 430 };
  const endZ = 0;
  const deck = new Path2D();
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1, shakeT: t, shakeAmt: 0.6 }, () => {
    // the fog ahead of the end: denser and faintly lit by the last panel
    const ep = project(cam, 0, 0, endZ);
    bridge(g, cam, -2400, endZ, { fog: 1500, deck, t, mirror: { hor, dx: voidDx(t) }, alphaAt: (z) => K.clamp((endZ - z) / 70 + 0.15) });
    if (ep) {
      K.lightPool(g, ep[0], ep[1] + 4, 120, "#8fb0f0", { intensity: 0.22, flat: 0.5 });
      // the edge frays: motes break off the last panel and drift up into the fog
      for (let i = 0; i < 26; i++) {
        const h1 = K.hash(i, 41), h2 = K.hash(i, 42), h3 = K.hash(i, 43);
        const age = (t * (0.12 + h3 * 0.1) + h1) % 1;
        const x = ep[0] + (h2 - 0.5) * 70 + age * 26 + Math.sin(t * 0.8 + i) * 4;
        const y = ep[1] - age * 120 * (0.5 + h3);
        const r = 0.8 + h3 * 1.6;
        g.fillStyle = K.rgba("#eef4ff", 0.75 * (1 - age) * (0.4 + h3));
        g.fillRect(x - r / 2, y - r, r, r * 2);
      }
    }
    const wp = K.ease.out(K.seg(t, 9.6, 13.4));
    const kz = K.lerp(-300, -46, wp);
    const kp = project(cam, 0, 0, kz);
    if (kp) {
      const walking = t < 13.1;
      const h = 130 * kp[2];
      const L = K.layer(VW, VH, "f14kid");
      // after she stops: a slow breath, the weight settles (the kit's idle sway)
      drawKid(L.g, kp[0], kp[1], h, kidOpts({
        view: "side", facing: 1, walk: walking, phase: kz / 58, t, sway: 0.6,
        light: { x: kp[0] + h * 0.3, y: kp[1] + h * 0.4, color: GLASS, strength: 0.85, z: 0.0 }, ambient: "#070a14",
      }));
      reflect(g, L.canvas, kp[1], 0.32, deck, 1.2);
      contact(g, kp[0], kp[1], h * 0.17);
      g.drawImage(L.canvas, 0, 0, VW, VH);
      K.lightPool(g, kp[0], kp[1], h * 0.45, GLASS, { intensity: 0.14, flat: 0.32 });
    }
  });
  // the empty ahead: a wall of fog with depth (soft, full height, no edges)
  K.fog(g, VW, VH, { y: hor - 10, h: 160, color: "#36446a", alpha: 0.3, t: t * 0.6 + 40, seed: 3 });
  upSnow(g, t, 12, 110, 0.8, { x: 600, y: 280, r: 260 });
}

// S3 [20-30] from behind, low and about 20 degrees off axis: you stand at the end, sink down and sit
// on the very edge, legs hanging over it (your boots dangle below the glass lip, lit from above by
// it); shoulders shaking. You pick the felt mouse up from the glass into your lap.
// hair strands for the back of the head: fine streaks along the fall of the hair (crown -> nape)
function hairTex() {
  return K.texBake("f14hair2", 96, 96, (u, v, out) => {
    const n = K.texFbm(u * 18, v * 1.4, 91, 3, 18, 0);
    const n2 = K.texFbm(u * 46, v * 2.2, 92, 2, 46, 0);
    const k = n * 0.7 + n2 * 0.5;
    if (k > 0) { out[0] = 190; out[1] = 150; out[2] = 112; out[3] = Math.min(255, k * 300); }
    else { out[0] = 14; out[1] = 9; out[2] = 6; out[3] = Math.min(255, -k * 330); }
  });
}
// legs over the edge: thighs forward to the lip, shins and rain boots hanging below the glass
function danglingLegs(g, cam, t, sit, h) {
  if (sit < 0.5) return;
  const a = K.smooth((sit - 0.5) / 0.4);
  const u = h / 110; // world units per kid unit
  for (const sx of [-1, 1]) {
    const sw = Math.sin(t * 1.25 + sx * 1.7) * 2.2 * u + K.noise(t * 0.6 + sx * 5, 9) * 1.2 * u;
    const kn = project(cam, sx * 6.5 * u, -1, 23);
    const an = project(cam, sx * 6.8 * u + sw * 0.3, 27 * u, 25 + sw);
    const bt = project(cam, sx * 6.8 * u + sw * 0.3, 17 * u, 25.5 + sw);
    const to = project(cam, sx * 7.4 * u + sw * 0.3, 30 * u, 33 + sw);
    if (!kn || !an || !bt || !to) continue;
    const k = kn[2];
    g.save();
    g.globalAlpha = a;
    // shin (dark denim): lit along its top by the glass edge just above it
    const shin = new Path2D();
    K.tube(shin, [kn[0], kn[1], (kn[0] + bt[0]) / 2, (kn[1] + bt[1]) / 2, bt[0], bt[1]], [8.5 * u * k, 7.5 * u * k, 7 * u * k], 3);
    const sg = g.createLinearGradient(0, kn[1], 0, bt[1]);
    sg.addColorStop(0, "#5a6c98");
    sg.addColorStop(0.3, "#26304e");
    sg.addColorStop(1, "#0c1020");
    g.fillStyle = sg;
    g.fill(shin);
    // rain boot: red rubber, a cold sheen down the shaft, the sole dark
    const boot = new Path2D();
    K.tube(boot, [bt[0], bt[1] - 2 * k, an[0], an[1], to[0], to[1]], [9 * u * k, 8.6 * u * k, 6.4 * u * k], 3);
    const bg = g.createLinearGradient(0, bt[1], 0, to[1] + 4 * k);
    bg.addColorStop(0, "#6a2422");
    bg.addColorStop(0.5, "#3a0f10");
    bg.addColorStop(1, "#120405");
    g.fillStyle = bg;
    g.fill(boot);
    g.strokeStyle = "rgba(190,210,255,0.35)";
    g.lineWidth = Math.max(0.6, 1.1 * k);
    g.beginPath();
    g.moveTo(bt[0] + sx * 2 * k, bt[1]);
    g.lineTo(an[0] + sx * 2.2 * k, an[1] - 2 * k);
    g.stroke();
    g.restore();
  }
}
function shot3(g, t) {
  prewarm(t);
  const p = K.ease.inOut(K.seg(t, 20, 30.5));
  const hor = 168;
  voidBg(g, hor, t, -40, { seed: 8 });
  fgFog(g, t, hor + 60, 240, -40, 0.65);
  fgFog(g, t * 1.5 + 90, hor + 190, 300, -80, 0.5);
  const cam = { x: 132, y: -50, z: -300 + p * 16, F: 760, hor };
  cam.yaw = Math.atan2(0 - cam.x, 0 - cam.z);
  const deck = new Path2D();
  const sit = K.ease.inOut(K.seg(t, 20.4, 23.2));
  const seatZ = -3;
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1.0 + p * 0.035, shakeT: t, shakeAmt: 0.9 }, () => {
    const kp = project(cam, 0, 0, seatZ);
    const h = 110 * kp[2];
    bridge(g, cam, -800, 22, { fog: 1800, deck, t, mirror: { hor, dx: voidDx(t, -40) } });
    // the legs hang past the end, below the lip: drawn after the glass but kept out of the deck's
    // top surface (the slab is in front of them there)
    g.save();
    const outside = new Path2D();
    outside.rect(-200, -200, VW + 400, VH + 400);
    outside.addPath(deck);
    g.clip(outside, "evenodd");
    danglingLegs(g, cam, t, sit, 110);
    g.restore();
    // the drop beyond the end: cold light falling away into the fog
    const ep = project(cam, 0, 0, 22);
    if (ep) K.lightPool(g, ep[0], ep[1] + 40, 200, "#6f88c8", { intensity: 0.2, flat: 0.6 });
    const crouch = Math.sin(Math.PI * K.clamp(sit * 1.1)) * 0.55;
    const sob = K.env(t, 23.8, 30.5, 1.5, 1) * (Math.max(0, Math.sin(t * 7.2)) * 0.7 + K.noise(t * 5, 3) * 0.3);
    // the felt mouse on the glass by your hip, lifted into your lap behind your body (25-27)
    const m = K.ease.inOut(K.seg(t, 25, 27.2));
    const mp = project(cam, K.lerp(24, 4, m), 0, K.lerp(-12, -2, m));
    if (mp && m < 0.98) {
      const ms = 0.04 * mp[2];
      contact(g, mp[0], mp[1], 14 * mp[2] * (1 - m), 0.5 * (1 - m));
      feltMouse(g, mp[0], mp[1] - m * 30 * mp[2], ms, 0);
    }
    const L = K.layer(VW, VH, "f14kid");
    const lightK = { x: kp[0] + 30, y: kp[1] + h * 0.9, color: GLASS, strength: 1.1, z: 0.05 };
    const ky = kp[1] + sob * 0.8;
    drawKid(L.g, kp[0], ky, h, kidOpts({ t, sit, crouch, light: lightK, sway: 0.4 }), 0.8);
    // hair: strands along the fall of the bowl cut, so it is hair and not a smooth helmet
    const hy = ky - h * K.lerp(0.86, 0.5, sit), hr = h * 0.095;
    L.g.save();
    L.g.globalCompositeOperation = "source-atop";
    L.g.beginPath();
    L.g.ellipse(kp[0], hy - hr * 0.1, hr * 1.12, hr * 1.18, 0, 0, K.TAU);
    L.g.clip();
    L.g.globalAlpha = 0.6;
    L.g.drawImage(hairTex(), kp[0] - hr * 1.2, hy - hr * 1.3, hr * 2.4, hr * 2.5);
    L.g.restore();
    // up-light from the deck: a cold rim on the lower and side edges of the figure (head, shoulders,
    // coat), strongest near the glass
    const E = K.layer(VW, VH, "f14kidE");
    E.g.drawImage(L.canvas, 0, 0, VW, VH);
    E.g.globalCompositeOperation = "source-in";
    const rg = E.g.createLinearGradient(0, ky - h * 0.6, 0, ky);
    rg.addColorStop(0, "rgba(160,190,245,0.55)");
    rg.addColorStop(1, "rgba(190,215,255,1)");
    E.g.fillStyle = rg;
    E.g.fillRect(0, 0, VW, VH);
    E.g.globalCompositeOperation = "destination-out";
    const d = Math.max(1.2, h * 0.012);
    E.g.drawImage(L.canvas, d, -d * 0.8, VW, VH);
    E.g.drawImage(L.canvas, -d, -d * 0.8, VW, VH);
    reflect(g, L.canvas, kp[1], 0.3, deck, 2, { mode: "source-over", minBlur: 2 });
    contact(g, kp[0], kp[1], h * 0.26, 0.7);
    g.drawImage(L.canvas, 0, 0, VW, VH);
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.55;
    g.drawImage(E.canvas, 0, 0, VW, VH);
    g.restore();
    K.lightPool(g, kp[0], kp[1], h * 0.5, GLASS, { intensity: 0.12, flat: 0.32 });
  });
  upSnow(g, t, 13, 100, 0.75, { x: 480, y: 360, r: 240 }, { panX: -40 });
}

// S4/S5a [30-44] the close-up: looking down into your lap. Your hands hold the felt mouse; the
// bell hangs from its red string on your knee with the orange fur tuft. The glass edge and the fog
// beyond are far out of focus. A tear falls (33). At 40 the bell rings by itself.
function lapBg() {
  // the background plane, pre-blurred (focus is on the hands): the deck's end edge glowing just past
  // the knees, frosted glass either side, the fog falling away beyond
  return K.sprite("f14:lapbg3", VW, VH, (g) => {
    const c = K.makeCanvas(VW, VH);
    const q = c.getContext("2d");
    q.drawImage(voidField(), BG_OX, 120 - BG_HOR, BG_W, BG_H);
    const edgeY = 206;
    // glass deck from the bottom of frame to its end edge
    const dk = q.createLinearGradient(0, edgeY, 0, VH);
    dk.addColorStop(0, "rgba(150,180,235,0.32)");
    dk.addColorStop(1, "rgba(60,80,130,0.18)");
    q.fillStyle = dk;
    q.fillRect(0, edgeY, VW, VH - edgeY);
    K.texRect(q, "macro", 0, edgeY, VW, VH - edgeY, { scale: 160, mode: "soft-light", alpha: 0.5, tex: { seed: 3 } });
    // the light beneath: the edge scatters into fog
    const ug = q.createLinearGradient(0, edgeY - 90, 0, edgeY);
    ug.addColorStop(0, "rgba(120,150,210,0)");
    ug.addColorStop(1, "rgba(120,150,210,0.3)");
    q.fillStyle = ug;
    q.fillRect(0, edgeY - 90, VW, 90);
    // the edge itself (emitter) + its thickness
    q.fillStyle = "rgba(245,250,255,1)";
    q.fillRect(0, edgeY - 2, VW, 4);
    q.fillStyle = "rgba(170,200,250,0.5)";
    q.fillRect(0, edgeY + 2, VW, 7);
    // a panel seam running toward us
    q.fillStyle = "rgba(220,235,255,0.35)";
    q.fillRect(0, 372, VW, 2);
    const out = g;
    out.filter = "blur(7px)";
    out.drawImage(c, 0, 0, VW, VH);
    out.filter = "none";
  });
}
// Denim thighs seen from above, per pixel: each thigh is a tapered cylinder from the hip (bottom of
// frame) to a rounded knee near the glowing deck edge. Cloth: a 3/1 twill (indigo warp, pale weft)
// with slubby threads and wear on the tops, a height field of folds (creases radiating from the hip
// crease, bunching behind the knee bulge) that bends the normals. Light from BELOW: the glowing deck
// they rest on hits the lower flanks and the knees with a bright cold rim; the tops only see the dim
// fog sky and fall off to near-black; occlusion in the gap between the legs and at the hips.
const TH_S = 2; // bake at 480 x 270 for the 960 x 540 frame (the full-res twill is overlaid after)
function thighGeo(s) {
  const hx = 480 + s * 196, hy = 600, kx = 480 + s * 126, ky = 250;
  const ax = kx - hx, ay = ky - hy, L = Math.hypot(ax, ay);
  return { s, hx, hy, kx, ky, ux: ax / L, uy: ay / L, L, w0: 182, w1: 98 };
}
const TGEO = [thighGeo(-1), thighGeo(1)];
// returns [across (-1..1, + = outer side), along (0 hip .. 1 knee, >1 on the knee cap), cap normal k]
function thighLocal(G, x, y) {
  const dx = x - G.hx, dy = y - G.hy;
  const a = (dx * G.ux + dy * G.uy) / G.L;
  const px = -G.uy, py = G.ux; // perpendicular
  const d = dx * px + dy * py;
  const out = G.s * (px > 0 ? 1 : -1);
  if (a <= 1) {
    const w = K.lerp(G.w0, G.w1, K.clamp(a)) * (1 + 0.05 * Math.sin(K.clamp(a) * Math.PI)); // a slight muscle bulge
    return [(d / w) * out, a, 0];
  }
  const ex = x - G.kx, ey = y - G.ky;
  const along = (ex * G.ux + ey * G.uy) / G.w1, across = (ex * px + ey * py) / G.w1;
  const r = Math.hypot(along * 1.15, across);
  if (r >= 1) return [2, a, 0];
  return [across * out, a, along * 1.15];
}
const FOLDN = { v: 0 }; // the fold noise is sampled once per pixel and shared by the 3 height taps
function foldH(G, x, y, a, s1) {
  // creases radiating from the hip crease (bottom inner corner) up the thigh
  const gx = 480 + G.s * 40, gy = 590;
  const ang = Math.atan2(y - gy, x - gx);
  const dist = Math.hypot(x - gx, y - gy);
  const n = FOLDN.v;
  let h = Math.sin(ang * 22 + n * 2.4) * Math.exp(-dist / 210) * 0.55 * K.clamp(1 - a * 1.4);
  // whiskers across the top of the thigh below the hip
  h += Math.sin((x * G.uy - y * G.ux) * 0.004 + (x * G.ux + y * G.uy) * 0.06 + n * 3) * 0.18 * Math.exp(-(((a - 0.25) / 0.18) ** 2)) * (1 - Math.abs(s1));
  // bunching behind the knee bulge: folds across the axis
  h += Math.sin((x * G.ux + y * G.uy) * 0.075 + n * 4 + G.s) * 0.4 * Math.exp(-(((a - 0.78) / 0.1) ** 2)) * K.clamp(0.4 + Math.abs(s1));
  return h;
}
function thighsBake() {
  return K.texBake("f14thighs6", 480, 270, (u, v, out, px, py) => {
    const x = (px + 0.5) * TH_S, y = (py + 0.5) * TH_S;
    let best = null, G = null;
    for (const T of TGEO) {
      const l = thighLocal(T, x, y);
      if (Math.abs(l[0]) < 1.03 && (!best || Math.abs(l[0]) < Math.abs(best[0]))) { best = l; G = T; }
    }
    if (!best) { out[0] = out[1] = out[2] = out[3] = 0; return; }
    const [s1, a, cap] = best;
    const sc = K.clamp(s1, -0.999, 0.999);
    // base normal of the cylinder / knee cap, in screen space (x right, y down, z toward camera)
    const pxn = -G.uy * (G.s * (-G.uy > 0 ? 1 : -1)), pyn = G.ux * (G.s * (-G.uy > 0 ? 1 : -1)); // outward perpendicular
    let nz = Math.sqrt(Math.max(0, 1 - sc * sc - cap * cap));
    let nx = pxn * sc + G.ux * cap, ny = pyn * sc + G.uy * cap;
    // folds bend the normal (finite differences of the fold height)
    const e = 2;
    FOLDN.v = K.texNoise(x * 0.012, y * 0.012, 81 + G.s);
    const h0 = foldH(G, x, y, a, sc);
    const hxp = foldH(G, x + e, y, a, sc), hyp = foldH(G, x, y + e, a, sc);
    const fk = 1.6 * (1 - Math.abs(sc) * 0.5);
    nx -= (hxp - h0) / e * fk; ny -= (hyp - h0) / e * fk;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    // twill: diagonal ribs along the cloth axis, slubby warp threads, pale weft peeking through
    const al = x * G.ux + y * G.uy, ac = x * -G.uy + y * G.ux;
    const tw = Math.sin(((al + ac * G.s) / 4.4) * K.TAU);
    const slub = K.texNoise(al * 0.035, ac * 0.55, 83);
    const mott = K.texFbm(x * 0.006, y * 0.006, 84, 2);
    const wear = K.clamp(Math.exp(-sc * sc * 3) * (0.5 + 0.5 * K.texFbm(x * 0.01, y * 0.02, 85, 2)) * (0.3 + a * 0.6)); // faded on the tops
    const weft = K.clamp(0.12 + 0.13 * tw + 0.08 * slub + wear * 0.3);
    // albedo (0..1): dyed indigo warp, undyed grey-white weft
    let r = K.lerp(0.1, 0.48, weft), gg = K.lerp(0.13, 0.5, weft), b = K.lerp(0.22, 0.54, weft);
    const m = 1 + mott * 0.14 + slub * 0.06;
    r *= m; gg *= m; b *= m;
    // topstitch along the outer seam (faded mustard thread, half sunk in the twill), dashed
    if (Math.abs(sc - 0.84) < 0.008 * (1 + a) && (al / 5.2) % 1 < 0.55 && a < 1) { r = K.lerp(r, 0.42, 0.5); gg = K.lerp(gg, 0.34, 0.5); b = K.lerp(b, 0.2, 0.5); }
    // light
    const fold = h0;
    const deckL = Math.max(0, sc * 0.8 + nz * -0.1 - ny * 0.25) ** 1.6; // the glass beside and below the flanks
    const flank = K.clamp(Math.max(0, nx * pxn + ny * pyn) * 1.25) ** 1.4 * (0.55 + 0.45 * Math.exp(-(1 - a) * 1.2));
    const kneeL = Math.max(0, -ny * 0.9 + nz * 0.12) ** 1.5 * Math.exp(-Math.max(0, y - 250) / 110); // the emitting edge just past the knees
    const sky = Math.max(0, nz * 0.8 - ny * 0.4) * 0.11;
    const occl = K.clamp(1 - Math.max(0, -sc - 0.55) * 1.6) * K.clamp(0.4 + (1 - a) * 0) * (1 - Math.max(0, (y - 470) / 180) * 0.65) * (1 - Math.max(0, -fold) * 0.25);
    const cold = (deckL * 0.5 + flank * flank * 3.8 + kneeL * 3.4) * occl;
    // light colour: the glass is a cold white-blue; the fog sky is dim slate
    const LR = 0.05 + sky * 1.1 + cold * 0.8, LG = 0.06 + sky * 1.25 + cold * 0.9, LB = 0.08 + sky * 1.6 + cold * 1.05;
    // a little sheen on the ridges of the folds where they face the edge light
    const sh = Math.max(0, fold) * kneeL * 14;
    out[0] = Math.min(255, 255 * r * LR + sh);
    out[1] = Math.min(255, 255 * gg * LG + sh * 1.1);
    out[2] = Math.min(255, 255 * b * LB + sh * 1.25);
    out[3] = 255 * K.clamp((1.03 - Math.abs(s1)) * 25);
  });
}
function thighsSprite() {
  return K.sprite("f14:thighs5", VW, VH, (g) => {
    g.imageSmoothingEnabled = true;
    const bake = thighsBake();
    g.drawImage(bake, 0, 0, VW, VH);
    // the twill at full resolution (the bake is at 2/3): a fine fabric weave masked to the legs
    const T = K.makeCanvas(VW, VH);
    const q = T.getContext("2d");
    K.texRect(q, "fabric", 0, 0, VW, VH, { scale: 18, rot: 0.55, alpha: 1, tex: { seed: 2 } });
    q.globalCompositeOperation = "destination-in";
    q.drawImage(bake, 0, 0, VW, VH);
    g.globalCompositeOperation = "overlay";
    g.globalAlpha = 0.35;
    g.drawImage(T, 0, 0, VW, VH);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    // the shadowed gap between the legs (occlusion where they press together)
    const gap = g.createLinearGradient(420, 0, 540, 0);
    gap.addColorStop(0, "rgba(0,0,0,0)");
    gap.addColorStop(0.5, "rgba(0,0,0,0.55)");
    gap.addColorStop(1, "rgba(0,0,0,0)");
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = gap;
    g.fillRect(420, 200, 120, 340);
    g.globalCompositeOperation = "source-over";
  });
}
function handsClose(g, t, ring) {
  const p = K.ease.inOut(K.seg(t, 30, 48));
  const ringNow = t >= 40 ? Math.exp(-(t - 40) * 0.9) * K.seg(t, 40, 40.05) + 0.35 * K.env(t, 40, 44, 0.2, 2) : 0;
  K.withCamera(g, VW, VH, { x: 480 + ring * 70, y: 270 + ring * 20, zoom: 1.0 + p * 0.05 + ring * 0.16, shakeT: t, shakeAmt: 1.1 }, () => {
    g.drawImage(lapBg(), -40, -30, VW + 80, VH + 60);
    g.drawImage(thighsSprite(), -40, -30, VW + 80, VH + 60);
    const breathe = Math.sin(t * 1.1) * 2;
    const mx = 480, my = 384 + breathe * 0.5;
    const tear = K.seg(t, 34.0, 34.6); // the drop falls 34.0-34.6 and lands on the felt
    const wet = K.ease.out(K.seg(t, 34.6, 35.8));
    const bx = 668, by = 344 + breathe * 0.5;
    // the bell swings when it rings: a damped pendulum
    const jig = t >= 40 ? Math.sin((t - 40) * 18) * 0.35 * Math.exp(-(t - 40) * 1.3) + Math.sin(t * 13) * 0.06 * K.env(t, 40.4, 43.5, 0.3, 1.2) : 0;
    const warm = ring * (0.6 + 0.4 * Math.sin(t * 9) * Math.exp(-(t - 40) * 0.5));
    // the bell's warm light spills on the denim (falloff from the bell)
    if (ring > 0) K.lightPool(g, bx, by, 260 + ring * 90, BELLC, { intensity: 0.35 * warm, flat: 0.75 });
    // the key is the cold glow ahead (the deck edge + fog), low: skin lit cool, shadows lilac
    const lightH = { x: 480, y: -60, color: "#b8c8ec", strength: 0.85, z: 0.25 };
    const lightL = ring > 0 ? { x: bx, y: by, color: "#ffc070", strength: 0.6 + ring * 0.6, z: 0.3 } : lightH;
    // the mouse sits in your lap between your hands: its shadow falls toward you on the denim
    K.shadowBlob(g, mx + 4, my + 34, 168, 26, { alpha: 0.62, soft: 1.3 });
    K.shadowBlob(g, mx, my + 18, 120, 12, { alpha: 0.5, soft: 1 });
    // the hands' own contact shadows on the thighs
    K.shadowBlob(g, 330, 520, 120, 36, { alpha: 0.45, soft: 1.3 });
    K.shadowBlob(g, 630, 520, 120, 36, { alpha: 0.45, soft: 1.3 });
    feltMouse(g, mx, my, 0.6, wet, warm);
    // the hands come in from the bottom corners and close round the mouse: fingers curled over its
    // flanks (drawn over it), thumbs along its back. Skin under a cold key: the shadow side goes lilac
    // and desaturates (subsurface light under a blue key).
    const Hl = K.layer(VW, VH, "f14hands");
    // (you look down at the BACKS of your hands: knuckles, nail beds, fingers curled down over its
    // flanks; the left cups the rump, the right the belly, so its ears and stitched face stay clear)
    const skinC = "#c7a196"; // a child's skin, desaturated by the cold light
    K.drawHand(Hl.g, 334, 514 + breathe, 212, { pose: "hold", grip: 1, angle: -0.9, left: true, t, light: lightL, ambient: "#2a2642", skin: skinC });
    K.drawHand(Hl.g, 640, 520 + breathe, 212, { pose: "hold", grip: 1, angle: -2.3, t, light: lightH, ambient: "#2a2642", skin: skinC });
    Hl.g.globalCompositeOperation = "source-atop";
    const lil = Hl.g.createLinearGradient(0, 330, 0, VH);
    lil.addColorStop(0, "rgba(150,146,196,0.08)");
    lil.addColorStop(1, "rgba(70,64,112,0.5)");
    Hl.g.fillStyle = lil;
    Hl.g.fillRect(0, 300, VW, VH - 300);
    Hl.g.globalCompositeOperation = "source-over";
    g.drawImage(Hl.canvas, 0, 0, VW, VH);
    // the red string from your left wrist, looped through your fingers, out to the bell on your knee:
    // a twisted cord (dark core, lit top edge), sagging under its own weight
    const cord = new Path2D();
    cord.moveTo(300, 540 + breathe);
    cord.bezierCurveTo(330, 520, 372, 470, 384, 430 + breathe * 0.5);
    cord.bezierCurveTo(392, 404, 408, 398, 424, 402);
    cord.bezierCurveTo(480, 452, 590, 424, bx - 8, by - 14);
    g.lineCap = "round";
    g.save(); g.translate(1.5, 3); g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 3.5; g.stroke(cord); g.restore();
    g.strokeStyle = "#6a1c1a"; g.lineWidth = 3; g.stroke(cord);
    g.save(); g.translate(0, -0.8); g.strokeStyle = "rgba(220,110,100,0.55)"; g.lineWidth = 1; g.setLineDash([2.5, 2.5]); g.stroke(cord); g.restore();
    g.setLineDash([]);
    fuzzTuft(g, bx - 30, by - 10, 1.3, t, warm);
    K.shadowBlob(g, bx + 8, by + 22, 22, 6, { alpha: 0.6, soft: 1 });
    g.save();
    g.translate(bx, by - 22);
    g.rotate(0.45 + jig); // hangs tilted on its loop: the slot turns away, not a face-on "smile"
    K.drawBell(g, 0, 22, 38, { t, glint: 0.25 + ring * 1.2 });
    g.restore();
    // ringing: the bell is a light now (white-hot core blooms through the lens) + shaken motes
    if (ring > 0) {
      K.glow(g, bx, by, 34 + 40 * warm, "#fff4dc", 0.35 * warm + 0.5 * ringNow);
      K.glow(g, bx, by, 150 + ring * 80, BELLC, 0.18 * warm);
      for (let i = 0; i < 16; i++) {
        const q = (t - 40 + K.hash(i, 81) * 2.4) % 2.4 / 2.4;
        if (t < 40 + K.hash(i, 81) * 0.1) continue;
        const a = K.hash(i, 82) * K.TAU;
        const rr = 20 + q * (60 + K.hash(i, 83) * 90);
        g.fillStyle = K.rgba("#ffe6b0", 0.7 * (1 - q) * ring);
        g.fillRect(bx + Math.cos(a) * rr, by + Math.sin(a) * rr * 0.7 - q * 30, 1.6, 1.6);
      }
    }
    // the tear: one drop falls from top centre (from your face, out of frame), accelerating; the
    // shutter smears it into a 3-4 px vertical streak; it lands on the felt at 34.6
    const tx = mx - 4, landY = my - 24;
    if (tear > 0 && tear < 1) {
      const q = tear * tear;
      const ty = K.lerp(-30, landY, q);
      const len = 8 + tear * 46; // distance travelled while the shutter is open
      const sg = g.createLinearGradient(tx, ty - len, tx, ty);
      sg.addColorStop(0, "rgba(200,220,255,0)");
      sg.addColorStop(0.7, "rgba(214,230,255,0.35)");
      sg.addColorStop(1, "rgba(235,244,255,0.75)");
      g.fillStyle = sg;
      g.fillRect(tx - 1.8, ty - len, 3.6, len);
      // the drop: dark refracted middle, bright rim and a hot specular point (the lens blooms it)
      const dg = g.createRadialGradient(tx, ty + 1, 0.5, tx, ty, 5);
      dg.addColorStop(0, "rgba(60,80,120,0.7)");
      dg.addColorStop(0.7, "rgba(170,195,240,0.75)");
      dg.addColorStop(1, "rgba(230,240,255,0.2)");
      g.fillStyle = dg;
      g.beginPath();
      g.moveTo(tx, ty - 9);
      g.quadraticCurveTo(tx + 4.2, ty, tx, ty + 4);
      g.quadraticCurveTo(tx - 4.2, ty, tx, ty - 9);
      g.fill();
      g.fillStyle = "#ffffff";
      g.fillRect(tx - 1.6, ty - 2.2, 1.6, 1.6);
      K.glow(g, tx - 1, ty - 1.5, 7, "#ffffff", 0.5);
    }
    if (t >= 34.6 && t < 35.3) {
      // the impact: a crown of tiny droplets
      const s = K.seg(t, 34.6, 35.3);
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI * (0.1 + i * 0.13);
        const dx = Math.cos(a) * s * 20, dy = Math.sin(a) * s * 14 + s * s * 16;
        g.fillStyle = K.rgba("#eaf2ff", 0.85 * (1 - s));
        g.fillRect(tx + dx - 0.8, landY + dy - 0.8, 1.6, 1.6);
      }
    }
    if (wet > 0) {
      // what is left of the bead on the fibres, catching the light (fades as the felt drinks it)
      const bead = 1 - K.seg(t, 36, 40) * 0.7;
      g.fillStyle = K.rgba("#cfe0ff", 0.3 * wet * bead);
      g.beginPath(); g.ellipse(tx - 2, landY - 1, 3.4, 2.2, 0, 0, K.TAU); g.fill();
      g.fillStyle = K.rgba("#ffffff", 0.95 * wet * bead);
      g.fillRect(tx - 3.4, landY - 2.4, 1.3, 1.1);
    }
  });
  upSnow(g, t, 15, 40, 0.5, null, { near: 0.15 });
}
function shot4(g, t) { prewarm(t); handsClose(g, t, 0); }

// S5b [44-48] in profile against the glow of the fog: your head lifts. Silhouette only (no face):
// a rim of cold light traces the brow, nose and the fly-away hair.
function profileKid(g, x, y, s, pitch, t, light) {
  const L = K.layer(VW, VH, "f14prof");
  const q = L.g;
  const C = "#090c14";
  q.save();
  q.translate(x, y);
  q.scale(s, s);
  q.fillStyle = C;
  const back = new Path2D();
  back.moveTo(-74, 80);
  back.bezierCurveTo(-62, 40, -40, 12 + pitch * 6, -20, 2 + pitch * 4);
  back.bezierCurveTo(-10, -3, -4, -5, 0, -5);
  back.bezierCurveTo(6, -5, 12, 0, 16, 8);
  back.bezierCurveTo(22, 20, 28, 40, 30, 80);
  back.closePath();
  q.fill(back);
  // the hood lying bunched at the nape (softly folded: two lobes)
  const hood = new Path2D();
  hood.moveTo(-26, 8 + pitch * 3);
  hood.bezierCurveTo(-27, -3 + pitch * 2, -16, -9, -8, -8);
  hood.bezierCurveTo(-4, -10, 2, -6, 1, -2);
  hood.bezierCurveTo(4, 2, -1, 7, -6, 6);
  hood.closePath();
  q.fill(hood);
  q.save();
  q.translate(2, -2);
  q.rotate(pitch);
  const neck = new Path2D();
  neck.moveTo(-3.6, 4);
  neck.bezierCurveTo(-3.4, -1, -2.6, -4, -2.2, -7);
  neck.lineTo(5.4, -7);
  neck.bezierCurveTo(5.6, -3, 6.4, 1, 7.4, 4);
  neck.closePath();
  q.fill(neck);
  const head = new Path2D();
  head.moveTo(-1, -6);
  head.bezierCurveTo(-10, -8, -12, -20, -6, -27);
  head.bezierCurveTo(-1, -32, 8, -31, 11, -25);
  head.quadraticCurveTo(12.4, -22.4, 12.2, -20.2);
  head.quadraticCurveTo(13.4, -18.4, 14.6, -15.4);
  head.quadraticCurveTo(13.9, -14.4, 12.7, -14.3);
  head.quadraticCurveTo(13.2, -12.9, 12.7, -12.3);
  head.quadraticCurveTo(13.1, -11.1, 12.3, -10.5);
  head.quadraticCurveTo(12.6, -8.6, 11.2, -7.6);
  head.quadraticCurveTo(8, -6, 5.2, -6.6);
  head.closePath();
  q.fill(head);
  const hair = new Path2D();
  K.spline(hair, [-6.5, -8.5, -11, -15, -10.5, -24, -4, -31, 5, -31.6, 11.2, -27.4, 13, -22.6, 11.6, -20.4, 8.4, -22.2, 4.6, -22.8, 1.4, -21, -1.6, -16.4, -3.2, -11], true, 0.6);
  q.fill(hair);
  // volume: an irregular, lumpy mass round the crown and the back of the head (real hair is never a
  // clean dome): radius modulated by noise, closed through the skull centre
  const R = K.rng("profilehair3");
  const lump = new Path2D();
  lump.moveTo(1.5, -20.5);
  for (let i = 0; i <= 26; i++) {
    const a = Math.PI * (0.78 + (i / 26) * 1.12);
    const rr = 10.9 + K.noise(i * 0.9, 31) * 0.9 + K.noise(i * 2.7, 32) * 0.35;
    lump.lineTo(1.5 + Math.cos(a) * rr, -20.5 + Math.sin(a) * rr * 1.02);
  }
  lump.closePath();
  q.fill(lump);
  // a fringe falling over the brow in separate points
  for (let i = 0; i < 3; i++) {
    const x0 = 7 + i * 1.6, y0 = -28.5 + i * 0.9;
    q.beginPath();
    q.moveTo(x0 - 1.4, y0);
    q.quadraticCurveTo(x0 + 2.2, y0 + 2.5, x0 + 2.4 + R() * 0.5, y0 + 5 + R() * 1.2);
    q.quadraticCurveTo(x0 + 1.4, y0 + 2.2, x0 + 1.4, y0);
    q.closePath();
    q.fill();
  }
  // fly-away strands breaking the outline (they catch the rim: that is what reads as hair)
  const breeze = K.noise(t * 0.6, 8) * 0.25;
  q.strokeStyle = C;
  q.lineCap = "round";
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (0.95 + R() * 0.75);
    const bx = 1.6 + Math.cos(a) * 10.8, by = -20.4 + Math.sin(a) * 11;
    const len = 1.5 + R() * R() * 3.2;
    // strands follow the head's curve back and down (tangent), a few lift off it
    const da = -Math.PI / 2 + (R() - 0.5) * 0.7 + (R() > 0.85 ? 0.6 : 0) + breeze;
    q.lineWidth = 0.07 + R() * 0.1;
    q.beginPath();
    q.moveTo(bx - Math.cos(a) * 0.6, by - Math.sin(a) * 0.6);
    q.quadraticCurveTo(bx + Math.cos(a + da * 0.5) * len * 0.6, by + Math.sin(a + da * 0.5) * len * 0.6, bx + Math.cos(a + da) * len, by + Math.sin(a + da) * len + 0.4);
    q.stroke();
  }
  q.restore();
  q.restore();
  // rim: the silhouette minus itself shifted away from the light leaves the lit edge
  const lc = light.color || "#cfe0ff", st = light.strength || 1;
  const E = K.layer(VW, VH, "f14profE");
  const d = Math.max(1.0, s * 0.14);
  E.g.drawImage(L.canvas, 0, 0, VW, VH);
  E.g.globalCompositeOperation = "source-in";
  E.g.fillStyle = lc;
  E.g.fillRect(0, 0, VW, VH);
  E.g.globalCompositeOperation = "destination-out";
  E.g.drawImage(L.canvas, -d, d * 0.15, VW, VH);
  E.g.globalAlpha = 0.6;
  E.g.drawImage(L.canvas, -d * 0.45, -d * 0.6, VW, VH);
  E.g.globalAlpha = 1;
  E.g.globalCompositeOperation = "source-over";
  g.drawImage(L.canvas, 0, 0, VW, VH);
  g.save();
  g.globalCompositeOperation = "lighter";
  K.dof(g, E.canvas, 0.4, 1.0 * st);
  K.dof(g, E.canvas, 3, 0.55 * st);
  g.restore();
}
function shot5(g, t) {
  prewarm(t);
  if (t < 44) { handsClose(g, t, K.ease.inOut(K.seg(t, 39.8, 41.2))); return; }
  const p = K.ease.inOut(K.seg(t, 44, 48.5));
  const hor = 330;
  voidBg(g, hor, t, -60, { seed: 9, lum: 1.15 });
  // the light you lift your head toward: a brighter patch in the fog ahead (right of frame), and
  // under it the faint line of the bridge's end, far out of focus
  K.lightPool(g, 730, 300, 520, "#6f88c0", { intensity: 0.38, flat: 0.45 });
  K.lightPool(g, 760, 300, 260, "#b8ccf0", { intensity: 0.16 + 0.14 * p, flat: 0.4 });
  const lift = K.ease.inOut(K.seg(t, 44.3, 47.2));
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1.02 + p * 0.03, shakeT: t, shakeAmt: 1 }, () => {
    profileKid(g, 410, 420, 7.4, K.lerp(0.62, -0.08, lift), t, { color: "#d6e6ff", strength: 1.1 + 0.3 * p });
  });
  upSnow(g, t, 16, 70, 0.7, { x: 740, y: 300, r: 260 }, { near: 0.1 });
}

// S6 [48-58] low behind you (your shoulder and hair huge and soft in the foreground): out of the fog
// the bridge builds itself forward, panel by panel, an amber pawprint in each, in time with a slow
// walk. Biscuit is laying it, walking AWAY from us down the bridge: seen from behind (haunches, raised
// tail, the backs of his ears), lit from below by the new glass and warm from the newest print,
// rimmed by the fog glow ahead, and half swallowed by the fog until about 56.

// a hit-test context with an identity transform (isPointInPath works in canvas pixels, so sprite
// paths are tested here in their own local units, independent of the pixel scale)
let HIT = null;
function hitCtx() {
  if (!HIT) HIT = K.makeCanvas(4, 4).getContext("2d");
  return HIT;
}
// edge light: the silhouette minus itself shifted by (dx, dy) leaves a crescent on the edges facing
// the light; painted into a scratch canvas and added
function rimOf(g, paint, dx, dy, color, alpha) {
  const c = K.makeCanvas(g.canvas.width, g.canvas.height);
  const q = c.getContext("2d");
  const T = g.getTransform();
  q.setTransform(T);
  paint(q);
  q.setTransform(1, 0, 0, 1, 0, 0);
  q.globalCompositeOperation = "source-in";
  q.fillStyle = color;
  q.fillRect(0, 0, c.width, c.height);
  q.globalCompositeOperation = "destination-out";
  q.setTransform(T);
  q.translate(dx, dy);
  paint(q);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = alpha;
  g.drawImage(c, 0, 0);
  g.restore();
}

// Biscuit from behind, one sprite per gait phase (8). Local units: feet at (0,0), shoulder ~54 up.
const CR_W = 120, CR_H = 150, CR_OX = 60, CR_OY = 140;
function catRearShape(ph) {
  const f = (ph / 8) * K.TAU;
  const liftL = Math.max(0, Math.sin(f)), liftR = Math.max(0, Math.sin(f + Math.PI));
  const roll = Math.sin(f) * 2.2; // the hips roll toward the planted leg
  const sw = Math.sin(f + 0.8) * 4; // tail sway lags the hips
  // every part is its own path (filled one by one: overlapping sub-paths of opposite winding in a
  // single path would punch holes). Seen from behind and a little above, the body is foreshortened:
  // big haunches, a short receding back, the head beyond the shoulders and a little smaller.
  const parts = [];
  const P = () => { const p = new Path2D(); parts.push(p); return p; };
  const hind = (sx, lift) => K.tube(P(), [sx * 12 + roll * 0.4, -32, sx * 13 + roll * 0.2, -14 - lift * 5, sx * 12, -2 - lift * 8], [13, 7.5, 7], 4);
  K.tube(P(), [-6, -36, -6.5, -15, -6, -1 - liftR * 5], [7, 5, 5.6], 4); // front legs between the hind ones
  K.tube(P(), [6, -36, 6.5, -15, 6, -1 - liftL * 5], [7, 5, 5.6], 4);
  hind(-1, liftL);
  hind(1, liftR);
  P().ellipse(-11 + roll * 0.5, -36, 14.5, 17, 0.08, 0, K.TAU); // haunches
  P().ellipse(11 + roll * 0.5, -36, 14.5, 17, -0.08, 0, K.TAU);
  P().ellipse(roll * 0.3, -47, 19, 13, 0, 0, K.TAU); // the back, receding
  P().ellipse(1.5, -54, 15.5, 8, 0, 0, K.TAU); // shoulders
  P().ellipse(4, -63, 11.5, 10.5, 0, 0, K.TAU); // back of the skull, turned a little to the right
  P().ellipse(4, -59.5, 13.5, 7.5, 0, 0, K.TAU); // cheek ruff
  const ears = new Path2D();
  ears.moveTo(-5, -68); ears.quadraticCurveTo(-8.5, -77, -7.5, -83); ears.quadraticCurveTo(-1.5, -78, 1.5, -72); ears.closePath();
  ears.moveTo(7, -72); ears.quadraticCurveTo(11, -79, 15.5, -81.5); ears.quadraticCurveTo(15.5, -75, 13.5, -67); ears.closePath();
  const tail = new Path2D();
  K.tube(tail, [0, -42, -3 + sw * 0.3, -62, -8 + sw * 0.7, -82, -5 + sw, -98, 3 + sw * 1.1, -104], [9, 8, 7, 6.2, 5], 5, false, true);
  const body = { parts };
  return { body, ears, tail, liftL, liftR, roll };
}
function catRearSprite(ph) {
  return K.sprite("f14:catrear3:" + ph, CR_W, CR_H, (g) => {
    const S = catRearShape(ph);
    const C = K.BISCUIT;
    const R = K.rng("catrear" + ph);
    const all = (q) => { for (const p of S.body.parts) q.fill(p); q.fill(S.ears); q.fill(S.tail); };
    g.translate(CR_OX, CR_OY);
    // fringe first: stray guard hairs standing off the silhouette (their roots are covered by the body)
    const hc = hitCtx();
    const inP = (p, x, y) => (p.parts ? p.parts.some((q) => hc.isPointInPath(q, x, y)) : hc.isPointInPath(p, x, y));
    g.lineCap = "round";
    for (const [path, n, len] of [[S.body, 2600, 3.2], [S.tail, 900, 2.6], [S.ears, 300, 1.2]]) {
      for (let i = 0; i < n; i++) {
        const x = -40 + R() * 80, y = -110 + R() * 112;
        if (!inP(path, x, y)) continue;
        const a = R() * K.TAU, l = len * (0.5 + R());
        const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l * 0.9 + 0.6;
        if (inP(S.body, ex, ey) || inP(S.tail, ex, ey) || inP(S.ears, ex, ey)) continue;
        g.strokeStyle = R() > 0.4 ? "rgba(150,92,52,0.5)" : "rgba(190,205,235,0.35)";
        g.lineWidth = 0.35 + R() * 0.35;
        g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
      }
    }
    // base coat: the deck lights him from BELOW (cool, strong on legs and the underside of the
    // haunches), the fog ahead gives a dim top light; the back is in shade
    g.save();
    const base = g.createLinearGradient(0, -100, 0, 0);
    base.addColorStop(0, K.shade(C.dark, -0.2));
    base.addColorStop(0.45, K.mix(C.dark, C.base, 0.35));
    base.addColorStop(0.75, K.mix(C.base, "#9ab0d8", 0.2));
    base.addColorStop(1, K.mix(C.base, "#a8bce4", 0.4));
    g.fillStyle = base;
    all(g);
    g.globalCompositeOperation = "source-atop";
    // tabby bands across the back, haunches and rings round the tail
    g.strokeStyle = K.rgba(C.stripe, 0.55);
    for (let i = 0; i < 7; i++) {
      const y = -66 + i * 6.2 + R() * 2;
      g.lineWidth = 2.2 + R() * 1.6;
      g.beginPath(); g.moveTo(-26, y + 3); g.quadraticCurveTo(0, y - 4 - R() * 2, 26, y + 3); g.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const v = 0.15 + i * 0.15;
      const sw = Math.sin((ph / 8) * K.TAU + 0.8) * 4;
      const y = -42 - v * 62, x = K.lerp(0, -6 + sw, v);
      g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(x - 6, y + 1); g.lineTo(x + 6, y - 1); g.stroke();
    }
    // fur: short strokes flowing down and out, light and dark
    for (let i = 0; i < 2600; i++) {
      const x = -36 + R() * 72, y = -108 + R() * 110;
      const a = Math.PI / 2 + (x / 40) * 0.9 + (R() - 0.5) * 0.6;
      const l = 1.4 + R() * 2.2;
      g.strokeStyle = R() > 0.55 ? `rgba(244,190,130,${(0.08 + R() * 0.14).toFixed(2)})` : `rgba(40,18,6,${(0.12 + R() * 0.18).toFixed(2)})`;
      g.lineWidth = 0.4 + R() * 0.4;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    // form: occlusion where the haunches meet, under the skull, at the root of the tail
    const ao = (x, y, r, a) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(12,8,10,${a})`);
      gr.addColorStop(1, "rgba(12,8,10,0)");
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    ao(0, -30, 10, 0.55);
    ao(4, -55, 11, 0.4);
    ao(0, -42, 8, 0.4);
    ao(-12, -6, 7, 0.3); ao(12, -6, 7, 0.3);
    // the ears from behind: back-lit by the fog ahead, light glows through their thin edges
    g.fillStyle = "rgba(230,150,120,0.35)";
    g.fill(S.ears);
    g.restore();
    // rims: the cold fog light ahead catches the top edges; the glowing deck catches the bottom ones
    rimOf(g, all, 0, 2.2, "#c9daff", 0.65);
    rimOf(g, all, 0, -2, "#9fbcf2", 0.45);
  });
}

// your shoulder and the back of your head, huge, soft and dark in the near foreground (S6): a
// recognisable shape (round skull, hair breaking the outline, the hood bunched at the nape, the
// slope of the shoulder), rimmed by the deck light ahead. Pre-blurred once (out of focus).
const FS_W = 560, FS_H = 470;
function fgShoulderSprite() {
  return K.sprite("f14:fgshoulder2", FS_W, FS_H, (out) => {
    const k = 5; // blur by downsampling
    const c = K.makeCanvas(FS_W, FS_H);
    const q = c.getContext("2d");
    const R = K.rng("fgshoulder");
    const shape = (s) => {
      // shoulders + coat
      s.beginPath();
      s.moveTo(-40, FS_H + 10);
      s.bezierCurveTo(-20, 360, 80, 300, 190, 290);
      s.bezierCurveTo(230, 288, 250, 272, 262, 262);
      s.lineTo(330, 262);
      s.bezierCurveTo(350, 284, 420, 300, 470, 340);
      s.bezierCurveTo(520, 380, 545, 430, 560, FS_H + 10);
      s.closePath();
      s.fill();
      // hood bunched at the nape
      s.beginPath();
      s.ellipse(292, 262, 74, 34, -0.05, 0, K.TAU);
      s.fill();
      // head: the round back of the skull, a little lumpy with hair
      s.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * K.TAU;
        const r = 104 + K.noise(i * 0.7, 51) * 6 + K.noise(i * 2.3, 52) * 2.5;
        const x = 300 + Math.cos(a) * r * 0.92, y = 132 + Math.sin(a) * r;
        if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
      }
      s.closePath();
      s.fill();
    };
    q.fillStyle = "#07090f";
    shape(q);
    // hair: strands flowing from the crown down the back of the head (lighter and darker locks)
    q.save();
    q.globalCompositeOperation = "source-atop";
    q.lineCap = "round";
    for (let i = 0; i < 700; i++) {
      const a0 = -Math.PI / 2 + (R() - 0.5) * 2.6;
      const r0 = R() * 40;
      const x0 = 300 + Math.cos(a0) * r0, y0 = 90 + Math.sin(a0) * r0;
      const len = 60 + R() * 90;
      const a = a0 + Math.PI + (R() - 0.5) * 0.4;
      q.strokeStyle = R() > 0.5 ? "rgba(60,46,40,0.35)" : "rgba(0,0,0,0.35)";
      q.lineWidth = 1 + R() * 2.5;
      q.beginPath();
      q.moveTo(x0, y0);
      q.quadraticCurveTo(x0 - Math.cos(a) * len * 0.5 + (R() - 0.5) * 20, y0 + len * 0.5, x0 - Math.cos(a0) * len * 0.9, y0 + len);
      q.stroke();
    }
    q.restore();
    // fly-away hairs breaking the outline at the crown and sides
    q.strokeStyle = "#07090f";
    for (let i = 0; i < 70; i++) {
      const a = -Math.PI * (0.05 + R() * 0.9);
      const x = 300 + Math.cos(a) * 96, y = 132 + Math.sin(a) * 104;
      const l = 8 + R() * 22;
      q.lineWidth = 1 + R() * 1.4;
      q.beginPath(); q.moveTo(x, y); q.quadraticCurveTo(x + Math.cos(a) * l * 0.6, y + Math.sin(a) * l * 0.6 + 2, x + Math.cos(a + 0.4) * l, y + Math.sin(a + 0.4) * l); q.stroke();
    }
    // rim: the deck glow ahead (right, low) catches the right-hand edges of skull, hood and shoulder
    const E = K.makeCanvas(FS_W, FS_H);
    const e = E.getContext("2d");
    e.drawImage(c, 0, 0);
    e.globalCompositeOperation = "source-in";
    e.fillStyle = "#a8c2f4";
    e.fillRect(0, 0, FS_W, FS_H);
    e.globalCompositeOperation = "destination-out";
    e.drawImage(c, -16, -5);
    e.globalCompositeOperation = "destination-in";
    const m = e.createLinearGradient(150, 0, 560, 0);
    m.addColorStop(0, "rgba(0,0,0,0.15)");
    m.addColorStop(1, "rgba(0,0,0,1)");
    e.fillStyle = m;
    e.fillRect(0, 0, FS_W, FS_H);
    q.globalCompositeOperation = "lighter";
    q.globalAlpha = 1;
    q.drawImage(E, 0, 0);
    q.drawImage(E, 0, 0);
    q.globalAlpha = 1;
    q.globalCompositeOperation = "source-over";
    // out of focus: a real blur where the canvas has filters, else a two-step downsample
    out.imageSmoothingEnabled = true;
    if (K.hasFilter()) {
      out.filter = "blur(7px)";
      out.drawImage(c, 0, 0, FS_W, FS_H);
      out.filter = "none";
    } else {
      const m1 = K.makeCanvas(Math.ceil(FS_W / 2), Math.ceil(FS_H / 2));
      m1.getContext("2d").drawImage(c, 0, 0, m1.width, m1.height);
      const sm = K.makeCanvas(Math.ceil(FS_W / k), Math.ceil(FS_H / k));
      sm.getContext("2d").drawImage(m1, 0, 0, sm.width, sm.height);
      out.drawImage(sm, 0, 0, FS_W, FS_H);
    }
  });
}

// the build started out in the fog before the cut: a few panels already glow ahead at 48
const S6_T0 = 46.8, S6_STEP = 0.5;
function shot6(g, t) {
  prewarm(t);
  const p = K.ease.inOut(K.seg(t, 48, 58.5));
  const hor = 236;
  voidBg(g, hor, t, p * 40, { seed: 10 });
  fgFog(g, t, hor + 40, 220, p * 40, 0.7);
  fgFog(g, t * 1.6 + 70, hor + 150, 280, p * 80, 0.55);
  // a slow eased dolly forward past your shoulder, following him out over the new glass
  // (it starts just behind your right shoulder, low, at the end of the old glass)
  const dolly = K.ease.inOut(K.seg(t, 48.6, 58.5)) * 210;
  const cam = { x: 14 - dolly * 0.05, y: -64 - dolly * 0.05, z: -70 + dolly, F: 600, hor };
  const built = Math.max(0, (t - S6_T0) / S6_STEP);
  const zEnd = 22 + Math.max(0, Math.floor(built)) * SEG;
  const fz = 22 + built * SEG + 8;
  const fp = project(cam, 0, 0, fz);
  const reveal = K.smooth(K.seg(t, 50.5, 56.5));
  // the newest print: how long since it landed (its flash lights his belly and legs amber)
  const newest = built > 0.5 ? ((built - 0.5) % 1) * S6_STEP : 9;
  const flash = Math.exp(-newest * 4.5);
  K.withCamera(g, VW, VH, { x: 530, y: 270, zoom: 1.0 + p * 0.04, shakeT: t, shakeAmt: 0.9 }, () => {
    const deck = new Path2D();
    bridge(g, cam, -600, zEnd + SEG, {
      fog: 1900, bw: 36, deck, t, mirror: { hor, dx: voidDx(t, p * 40) },
      alphaAt: (z) => (z < 22 ? 1 : K.smooth(K.clamp(built - (z - 22) / SEG))),
      paws: (z) => {
        if (z < 22) return false;
        const j = Math.round((z - 22) / SEG);
        const age = t - (S6_T0 + (j + 0.5) * S6_STEP);
        return age >= 0 ? age : false;
      },
    });
    if (fp && t > 48.2) {
      const a = K.smooth(K.seg(t, 48.2, 50.4)); // he walks out of the fog
      const sz = 25 * fp[2];
      const s = sz / 54;
      const LW = 240, LH = 240;
      const L = K.layer(LW, LH, "f14catL");
      const ph = Math.floor(((built * 0.5) % 1) * 8) % 8;
      const lx = LW / 2, ly = LH - 24; // (shoulder ~54 sprite units up)
      L.g.drawImage(catRearSprite(ph), lx - CR_OX * s, ly - CR_OY * s, CR_W * s, CR_H * s);
      // light that changes per frame: the amber underglow of the print he just made
      L.g.globalCompositeOperation = "source-atop";
      const ug = L.g.createLinearGradient(0, ly - sz * 1.2, 0, ly);
      ug.addColorStop(0, "rgba(255,150,60,0)");
      ug.addColorStop(1, K.rgba("#ffa04a", 0.35 + 0.4 * flash));
      L.g.fillStyle = ug;
      L.g.fillRect(0, 0, LW, LH);
      // atmospheric perspective: the fog between us and him (thinning as he comes out of it)
      L.g.fillStyle = K.rgba(FOG, K.lerp(0.68, 0.36, reveal) + K.clamp((fp[3] - 500) / 1500) * 0.15);
      L.g.fillRect(0, 0, LW, LH);
      L.g.globalCompositeOperation = "source-over";
      const x0 = fp[0] - lx, y0 = fp[1] - ly;
      const blur = K.lerp(2.2, 1.1, reveal);
      // his reflection in the glass (a soft contact mirror) and the occlusion under his paws
      reflect(g, L.canvas, fp[1], 0.4 * a, deck, 2.2, { x: x0, y: y0, minBlur: 2.2, mode: "lighter" });
      contact(g, fp[0], fp[1], sz * 0.9, 0.4 * a);
      g.save();
      g.translate(x0, y0);
      K.dof(g, L.canvas, blur, a);
      g.restore();
      // banks of fog drifting across in front of him until he is through them
      const fogS = K.glowSprite("#33405e");
      g.save();
      for (let i = 0; i < 3; i++) {
        const fx = fp[0] + Math.sin(t * 0.35 + i * 2.1) * 50 + (i - 1) * 40 - ((t * 9) % 80);
        const fy = fp[1] - sz * (0.6 + i * 0.5);
        g.globalAlpha = (0.55 - i * 0.1) * (1 - reveal) + 0.08;
        g.drawImage(fogS, fx - 120, fy - 40, 240, 80);
      }
      g.restore();
      K.lightPool(g, fp[0], fp[1], sz * 2.4, AMBER, { intensity: (0.12 + 0.2 * flash) * a, flat: 0.35 });
    }
  });
  upSnow(g, t, 18, 100, 0.75, fp ? { x: fp[0], y: fp[1], r: 220 } : null, { panX: p * 40 });
  // you, in the foreground: shoulder and the back of your head, out of focus, sliding out of frame as
  // the camera moves past you
  if (dolly < 90) {
    const ox = -170 - dolly * 5.5, oy = 175 + dolly * 2.2;
    g.drawImage(fgShoulderSprite(), ox, oy, FS_W, FS_H);
  }
}

// S7 [58-66] you stand and walk onto the new bridge toward a burst of pink and cyan far ahead (the
// Meme Dimension): a hot core in the fog that the lens flares, scattered colour in the haze, and soft
// shafts where the light finds gaps in the fog banks. You are a silhouette rimmed by it; the deck
// still lights you from below and mirrors you.
const S7_HOR = 226, S7_BX = 520, S7_BY = S7_HOR - 4;
// The shafts: light from the burst marched through the fog density field (a cached radial blur of
// the density): bright where the line back to the source crosses thin fog, dark behind dense banks.
function shaftField() {
  const SW = 240, SH = 135;
  let D = null;
  return K.texBake("f14shafts2", SW, SH, (u, v, out, x, y) => {
    if (!D) {
      D = new Float32Array(SW * SH);
      for (let j = 0; j < SH; j++) {
        for (let i = 0; i < SW; i++) {
          const X = (i / SW) * VW, Y = (j / SH) * VH - S7_HOR + BG_HOR;
          const w1 = K.texFbm(X * 0.0032, Y * 0.0105, 3, 4);
          const w2 = K.texFbm(X * 0.0095 + w1 * 0.9, Y * 0.034 + w1 * 0.4, 7, 3);
          D[j * SW + i] = K.clamp(0.45 + 0.6 * w1 + 0.36 * w2) ** 2;
        }
      }
    }
    const sx = (S7_BX / VW) * SW, sy = (S7_BY / VH) * SH;
    const dx = sx - x, dy = sy - y;
    const dist = Math.hypot(dx, dy * 1.4);
    let acc = 0;
    const N = 22;
    for (let k = 1; k <= N; k++) {
      const f = k / N;
      const px = Math.round(x + dx * f), py = Math.round(y + dy * f);
      if (px >= 0 && py >= 0 && px < SW && py < SH) acc += D[py * SW + px];
    }
    acc /= N;
    const trans = Math.exp(-acc * 5.5);
    const fall = 1 / (1 + (dist / 34) ** 1.5);
    const below = y > sy ? 1 : 0.55; // the burst lights the chasm below more than the empty above
    const I = K.clamp(trans * fall * below * 1.6);
    // colour by side: magenta to the left, cyan to the right, white-violet in the middle
    const side = K.clamp(0.5 + (x - sx) / 70, 0, 1);
    out[0] = (255 * (1 - side) + 120 * side) * I;
    out[1] = (110 * (1 - side) + 235 * side) * I;
    out[2] = (230 * (1 - side) + 255 * side) * I;
    out[3] = 255;
  });
}
function memeBurst(g, x, y, t, k) {
  if (k <= 0) return;
  // scattering in the fog: broad soft lobes of each colour, then the white-hot core
  K.lightPool(g, x - 90, y, 420, "#ff5fd2", { intensity: 0.4 * k });
  K.lightPool(g, x + 90, y + 4, 400, "#5ff0ff", { intensity: 0.38 * k });
  K.lightPool(g, x, y, 900, "#8a6ad0", { intensity: 0.16 * k, flat: 0.45 });
  K.glow(g, x - 26, y, 90, "#ff8fe0", 0.65 * k);
  K.glow(g, x + 28, y, 90, "#8ff6ff", 0.65 * k);
  K.glow(g, x, y, 30, "#ffffff", 1.0 * k);
  K.glow(g, x, y, 12, "#ffffff", 1.0 * k);
}
function shot7(g, t) {
  prewarm(t);
  const p = K.seg(t, 58, 66);
  const hor = S7_HOR;
  const burst = K.smooth(K.seg(t, 58.2, 61.5));
  voidBg(g, hor, t, p * 20, { seed: 14 });
  const bx = S7_BX, byy = S7_BY;
  // volumetric shafts through the fog banks (cached), then the burst itself; the lens blooms it
  g.save();
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = Math.min(1, 0.55 * burst * (0.92 + 0.08 * Math.sin(t * 0.7)));
  g.drawImage(shaftField(), -voidDx(t, p * 20) * 0.2, 0, VW, VH);
  g.restore();
  memeBurst(g, bx, byy, t, burst);
  K.fog(g, VW, VH, { y: hor + 10, h: 90, color: "#4a4a78", alpha: 0.25 * burst, t: t * 0.6 + 20, seed: 8 });
  fgFog(g, t, hor + 50, 200, p * 20, 0.6);
  const walk = K.seg(t, 60.2, 66);
  const kz = K.lerp(0, 300, walk);
  const cam = { x: 0, y: -150, z: -560 + kz * 0.6, F: 720, hor };
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1, shakeT: t, shakeAmt: 1.1 }, () => {
    const deck = new Path2D();
    bridge(g, cam, -600, 3200, { fog: 1700, bw: 44, deck, t, mirror: { hor, dx: voidDx(t, p * 20) }, paws: (z) => (z >= 22 ? true : false) });
    // the far colours reflect down the glass toward us
    K.reflectStreak(g, bx - 8, byy + 14, 160, "#ff8fe0", 0.2 * burst, { t });
    K.reflectStreak(g, bx + 8, byy + 14, 160, "#8ff6ff", 0.2 * burst, { t });
    const kp = project(cam, 0, 0, kz);
    if (kp) {
      // you are already up: a breath, then the first step (no sitting pose here: legs and boots on the glass)
      const h = 130 * kp[2];
      const L = K.layer(VW, VH, "f14kid");
      drawKid(L.g, kp[0], kp[1], h, kidOpts({
        walk: walk > 0, phase: kz / 60, t, sway: walk > 0 ? 0 : 0.5,
        light: { x: bx, y: byy, color: "#ffd0f4", strength: 0.8 + burst * 0.45, z: -0.8 }, ambient: "#080b16",
      }));
      // the glass mirrors you: a dark, soft, flipped figure (you block the light it would reflect),
      // with the rim light reflected on top
      reflect(g, L.canvas, kp[1], 0.32, deck, 2.5, { mode: "source-over", minBlur: 2.5 });
      reflect(g, L.canvas, kp[1], 0.18, deck, 3, { minBlur: 3 });
      contact(g, kp[0], kp[1], h * 0.2, 0.75);
      g.drawImage(L.canvas, 0, 0, VW, VH);
      K.lightPool(g, kp[0], kp[1], h * 0.45, GLASS, { intensity: 0.12, flat: 0.32 });
    }
  });
  upSnow(g, t, 19, 100, 0.75, { x: bx, y: byy, r: 300 }, { panX: p * 20 });
}

// cache fills ahead of need (pure in t: they only populate caches)
// Every heavy cache is built under the black fade-in / title (t < 1.6), spread over a few frames so no
// single frame stalls; later shots then start without a hitch. Pure in t: this only fills caches.
// Kit figures (drawPerson / drawHand) build their own caches the first time they are drawn with a
// given look; drawing them once into a scratch layer during the previous shot's quiet seconds moves
// that cost off the cut. Each window is a tenth of a second (a few frames) and only fills caches.
function warmKid(o, h = 260) {
  const L = K.layer(320, 320, "f14warm");
  K.drawPerson(L.g, 160, 300, h, kidOpts(o));
}
function prewarm(t) {
  if (t < 0.25) { voidField(); glassTex(); K.texture("cloud", { seed: 23, cover: 0.55 }); K.texture("cloud", { seed: 28, cover: 0.55 }); fgFogTex(); bokehSprite(); pawSprite(); }
  else if (t < 0.5) feltMouseSprite();
  else if (t < 0.75) lapBg();
  else if (t < 1.0) thighsBake();
  else if (t < 1.2) thighsSprite();
  else if (t < 1.35) { fgShoulderSprite(); hairTex(); }
  else if (t < 1.6) shaftField();
  else if (t >= 2 && t < 3.6) catRearSprite(Math.floor((t - 2) / 0.2) % 8); // under the title card, one per window
  // the next shot's figures, during this shot's quiet frames
  else if (t >= 8.4 && t < 8.5) warmKid({ view: "side", facing: 1, walk: true, phase: 1, t, sway: 0.6, light: { x: 500, y: 400, color: GLASS, strength: 0.85, z: 0 }, ambient: "#070a14" });
  else if (t >= 18.4 && t < 18.5) warmKid({ t, sit: 1, crouch: 0.2, sway: 0.4, light: { x: 500, y: 420, color: GLASS, strength: 1.1, z: 0.05 } });
  else if (t >= 28.4 && t < 28.5) {
    const L = K.layer(320, 320, "f14warm");
    K.drawHand(L.g, 160, 300, 255, { pose: "hold", grip: 0.75, angle: -0.62, left: true, t, light: { x: 480, y: -60, color: "#b8c8ec", strength: 0.85, z: 0.25 }, ambient: "#2a2642" });
    K.drawBell(L.g, 160, 160, 38, { t, glint: 0.25 });
  }
  else if (t >= 56.4 && t < 56.5) warmKid({ walk: true, phase: 0.5, t, light: { x: S7_BX, y: S7_BY, color: "#ffd0f4", strength: 1, z: -0.8 }, ambient: "#080b16" });
}

const SHOTS = [
  [0, shot1, false],
  [10, shot2, false], // hard cut on the "drop" cue
  [20, shot3, false], // hard cut: a dissolve would ghost the standing figure over the seated one
  [30, shot4, false], // hard cut to the close-up
  [40, shot5, false],
  [48, shot6, false], // hard cut on the meow
  [58, shot7, false], // hard cut on the swell: a dissolve double-exposes the two bridges
];
function overlay(g, t, fn, a) {
  const L = K.layer(VW, VH, "f14xf");
  fn(L.g, t);
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
    cur[1](g, t);
    overlay(g, t, next[1], K.smooth((t - (next[0] - XF / 2)) / XF));
  } else if (cur[2] && i > 0 && t < cur[0] + XF / 2) {
    SHOTS[i - 1][1](g, t);
    overlay(g, t, cur[1], K.smooth((t - (cur[0] - XF / 2)) / XF));
  } else cur[1](g, t);
}

export const film = {
  id: 14,
  title: "Almost",
  chapter: "Chapter 14",
  unlockAt: 70,
  duration: D,
  poster: 44,
  tagline: "The night you nearly gave up.",
  subs: [
    [3.0, 7.0, "The bridge ran out of light."],
    [11.0, 15.5, "Seventy cats. And still no Biscuit."],
    [21.0, 25.5, "You sat down. You were so tired."],
    [31.0, 35.5, "Maybe he didn't want to be found."],
    [36.0, 39.0, "Maybe you should go home."],
    [41.0, 44.5, "Then the bell rang. On its own."],
    [49.0, 53.5, "And somewhere ahead, he called you."],
    [54.0, 57.5, "One pawprint at a time."],
    [59.0, 64.0, "You got up."],
  ],
  voice: [
    [3.0, "The bridge ran out of light."],
    [11.0, "Seventy cats. And still no Biscuit.", { rate: 0.85, pitch: 0.95 }],
    [21.0, "You sat down. You were so tired.", { rate: 0.85, pitch: 0.95 }],
    [31.0, "Maybe he didn't want to be found.", { rate: 0.82, pitch: 0.92 }],
    [36.0, "Maybe you should go home.", { rate: 0.82, pitch: 0.92 }],
    [41.0, "Then the bell rang. On its own."],
    [49.0, "And somewhere ahead, he called you."],
    [54.0, "One pawprint at a time."],
    [59.0, "You got up."],
  ],
  score: { mood: "sad", key: "D", bpm: 58, cues: [[10, "drop"], [28, "swell"], [40, "bell"], [48, "meow"], [58, "swell"]] },
  // the void at its cold edge: deep blacks with a hint of blue in them, cool white balance, the glass
  // edges and the bell as the only things hot enough to bloom; handheld but calm
  grade: {
    exposure: 0.95, temp: -0.16, tint: 0.02, lift: [0.002, 0.004, 0.012], gamma: [1, 1, 1.03], gain: [0.98, 1, 1.03],
    contrast: 1.08, sat: 0.9, bloom: 0.42, threshold: 0.9, halation: 0.35, streak: 0.04,
    grain: 0.07, grainSize: 1.4, vignette: 0.55, weave: 0.6, ca: 0.6, sharpen: 0.15,
  },
  gradeAt(t) {
    // the close-up: a touch brighter for the skin; the bell warms the frame when it rings
    if (t >= 30 && t < 44) {
      const w = K.env(t, 39.8, 44, 0.6, 1.5);
      return { exposure: 1.0, temp: -0.12 + 0.2 * w, halation: 0.35 + 0.25 * w, bloom: 0.42 + 0.15 * w, weave: 0.8 };
    }
    if (t >= 44 && t < 48) return { exposure: 1.0, weave: 0.5 };
    if (t >= 58) {
      const b = K.smooth(K.seg(t, 58.2, 61.5));
      return { temp: -0.16 + 0.1 * b, sat: 0.9 + 0.12 * b, bloom: 0.42 + 0.18 * b, streak: 0.04 + 0.1 * b, halation: 0.35 + 0.1 * b };
    }
    return {};
  },
  draw(g, t, W, H) {
    g.save();
    g.scale(W / VW, H / VH);
    g.fillStyle = "#05070c";
    g.fillRect(0, 0, VW, VH);
    compose(g, t);
    K.letterbox(g, VW, VH, 1);
    const ta = K.env(t, 1.6, 6.4, 1.0, 1.0);
    if (ta > 0) K.title(g, VW, VH, "Almost", "Chapter 14", ta, { y: VH * 0.36, size: 62, glow: "#bcd6ff" });
    K.fadeBlack(g, VW, VH, 1 - K.smooth(K.seg(t, 0, 1.6)));
    K.fadeBlack(g, VW, VH, K.smooth(K.seg(t, 63.6, 66)));
    g.restore();
  },
};
