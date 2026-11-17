// films/f14.js - Chapter 14 "Almost" (FILMS.md f14). At the cold edge of the Void a narrow glass
// bridge of light runs out over a black chasm. You sit at the end with the toy mouse and the bell,
// ready to give up. The bell rings on its own, a meow comes out of the fog, and the bridge starts
// building itself again under Biscuit's paws, one amber pawprint at a time.
// draw(g, t, W, H) is a pure function of t; static art is cached in sprites.
import * as K from "../filmkit.js";
import { povHand, hairOver } from "./lib1214.js";

const D = 66;
const VW = 960, VH = 540;
const XF = 0.8;

const SLATE = "#1a2030";
const GLASS = "#bcd6ff";
const FOG = "#2c3650";
const AMBER = "#ffb347";
const KID_COAT = "#e8b923";

// ---- sky, chasm, fog -----------------------------------------------------------------------------------
function skyGrad(g, hor) {
  const gr = g.createLinearGradient(0, 0, 0, VH);
  gr.addColorStop(0, "#0b0e16");
  gr.addColorStop(K.clamp(hor / VH - 0.25), "#141a28");
  gr.addColorStop(K.clamp(hor / VH), "#33405c");
  gr.addColorStop(K.clamp(hor / VH + 0.08), "#1c2335");
  gr.addColorStop(1, "#05060a");
  g.fillStyle = gr;
  g.fillRect(0, 0, VW, VH);
  K.glow(g, VW * 0.5, hor, 560, "#5a6c94", 0.22);
}
// the black chasm: no walls in sight, only layers of fog at different depths falling away below
function abyss(g, hor, t, a = 1) {
  K.fog(g, VW, VH, { y: hor - 14, h: 50, color: "#46557a", alpha: 0.35 * a, t: t * 0.4, seed: 31 });
  K.fog(g, VW, VH, { y: hor + 40, h: 90, color: "#2a3450", alpha: 0.4 * a, t: t * 0.6, seed: 32 });
  const dk = g.createLinearGradient(0, hor + 60, 0, VH);
  dk.addColorStop(0, "rgba(4,5,10,0)");
  dk.addColorStop(1, `rgba(4,5,10,${0.55 * a})`);
  g.fillStyle = dk;
  g.fillRect(0, hor + 60, VW, VH - hor - 60);
  K.fog(g, VW, VH, { y: hor + 150, h: 140, color: "#1c2336", alpha: 0.35 * a, t: t * 0.9, seed: 33 });
}
function fogBands(g, hor, t, a = 1, seed = 1) {
  K.fog(g, VW, VH, { y: hor + 6, h: 120, color: FOG, alpha: 0.7 * a, t, seed });
  K.fog(g, VW, VH, { y: hor + 90, h: 160, color: "#1b2233", alpha: 0.45 * a, t: t * 0.7, seed: seed + 4 });
}
// cold flecks of snow, falling UP
function upSnow(g, t, seed, n, alpha = 1, big = 1) {
  for (let i = 0; i < n; i++) {
    const h1 = K.hash(i, seed), h2 = K.hash(i, seed + 1), h3 = K.hash(i, seed + 2);
    const sp = 10 + h3 * 26;
    const x = (h1 * 1040 + Math.sin(t * 0.6 + i * 1.3) * 10 * (0.5 + h3) - 40);
    const y = 600 - (((h2 * 660 + t * sp) % 660));
    const r = (0.8 + h3 * h3 * 2.6) * big;
    const a = alpha * (0.35 + h3 * 0.55);
    if (r > 2.4) K.glow(g, x, y, r * 2.4, "#dce8ff", a * 0.5);
    else {
      g.fillStyle = K.rgba("#dfe9ff", a);
      g.fillRect(x - r / 2, y - r / 2, r, r);
    }
  }
}

// ---- the glass bridge (world: deck y = 0, z forward, half width BW) -------------------------------------
function project(cam, wx, wy, wz) {
  const dz = wz - cam.z;
  if (dz < 15) return null;
  const k = cam.F / dz;
  return [VW / 2 + (wx - cam.x) * k, cam.hor + (wy - cam.y) * k, k, dz];
}
const BW0 = 30, SEG = 40;
// A translucent slab of light: bright edge lines, a faint inner gradient, refraction streaks and an
// underglow into the fog. No crossbars. Draws [z0, z1); o.alphaAt(z) -> 0..1 build-in, o.fog, o.paws(z)
function bridge(g, cam, z0, z1, o = {}) {
  const fogD = o.fog || 2600;
  const BW = o.bw || BW0;
  const zs = [];
  // steps stay on the SEG grid; far away (tiny on screen) they coarsen
  for (let z = Math.max(z0, cam.z + 16); z < z1; ) {
    zs.push(z);
    const dz = z - cam.z, st = dz > 1100 ? 4 : dz > 550 ? 2 : 1;
    z = (Math.floor(z / SEG) + st) * SEG;
  }
  if (!zs.length) return;
  zs.push(Math.min(z1, zs[zs.length - 1] + SEG));
  const P = zs.map((z) => ({ z, l: project(cam, -BW, 0, z), r: project(cam, BW, 0, z), lu: project(cam, -BW, 7, z), ru: project(cam, BW, 7, z), b: o.alphaAt ? o.alphaAt(z) : 1, f: Math.exp(-(z - cam.z) / fogD) }));
  // underglow into the fog below
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < P.length; i += 3) {
    const p = P[i];
    if (!p.l || p.b < 0.05) continue;
    const c = project(cam, 0, 46, p.z);
    if (c) K.glow(g, c[0], c[1], 80 * c[2] + 8, "#6f8fd0", 0.07 * p.f * p.b);
  }
  g.restore();
  for (let i = P.length - 2; i >= 0; i--) {
    const a = P[i], b = P[i + 1];
    if (!a.l || !b.l) continue;
    const build = Math.min(a.b, 1);
    if (build <= 0.01) continue;
    const fade = a.f * build;
    if (fade < 0.01) continue;
    // side faces (thickness) and the glass top, one quad per step (overlap-free: shared edges only)
    g.fillStyle = K.rgba("#8fb4f0", 0.16 * fade);
    g.beginPath();
    g.moveTo(a.l[0], a.l[1]); g.lineTo(b.l[0], b.l[1]); g.lineTo(b.lu[0], b.lu[1]); g.lineTo(a.lu[0], a.lu[1]);
    g.moveTo(a.r[0], a.r[1]); g.lineTo(b.r[0], b.r[1]); g.lineTo(b.ru[0], b.ru[1]); g.lineTo(a.ru[0], a.ru[1]);
    g.fill();
    const mx = (a.l[0] + a.r[0]) / 2, my = a.l[1];
    const gr = g.createLinearGradient(a.l[0], my, a.r[0], my);
    gr.addColorStop(0, K.rgba("#e6f0ff", 0.34 * fade));
    gr.addColorStop(0.2, K.rgba(GLASS, 0.12 * fade));
    gr.addColorStop(0.5, K.rgba(GLASS, 0.2 * fade));
    gr.addColorStop(0.8, K.rgba(GLASS, 0.12 * fade));
    gr.addColorStop(1, K.rgba("#e6f0ff", 0.34 * fade));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(a.l[0], a.l[1]); g.lineTo(a.r[0], a.r[1]); g.lineTo(b.r[0], b.r[1]); g.lineTo(b.l[0], b.l[1]);
    g.closePath();
    g.fill();
    // bright edge lines
    g.strokeStyle = K.rgba("#eef5ff", 0.85 * fade);
    g.lineWidth = Math.max(0.6, 1.7 * a.l[2]);
    g.beginPath();
    g.moveTo(a.l[0], a.l[1]); g.lineTo(b.l[0], b.l[1]);
    g.moveTo(a.r[0], a.r[1]); g.lineTo(b.r[0], b.r[1]);
    g.stroke();
    g.strokeStyle = K.rgba(GLASS, 0.3 * fade);
    g.lineWidth = Math.max(0.5, 1.0 * a.l[2]);
    g.beginPath();
    g.moveTo(a.lu[0], a.lu[1]); g.lineTo(b.lu[0], b.lu[1]);
    g.moveTo(a.ru[0], a.ru[1]); g.lineTo(b.ru[0], b.ru[1]);
    g.stroke();
    // refraction streaks: thin long diagonal glints inside the glass
    const s1 = Math.floor(a.z / SEG);
    if ((s1 * 7) % 5 === 0) {
      const u0 = K.hash(s1, 9) * 0.6 + 0.2;
      const p0 = project(cam, K.lerp(-BW, BW, u0), 0, a.z), p1 = project(cam, K.lerp(-BW, BW, u0 + 0.15), 0, b.z);
      if (p0 && p1) {
        g.strokeStyle = K.rgba("#ffffff", 0.22 * fade);
        g.lineWidth = Math.max(0.4, 0.8 * a.l[2]);
        g.beginPath();
        g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]);
        g.stroke();
      }
    }
    if (build < 1) K.glow(g, mx, my, BW * 1.8 * a.l[2], "#ffffff", 0.5 * (1 - build) * a.f);
    if (o.paws && o.paws(a.z)) {
      const side = Math.round(a.z / SEG) % 2 ? 1 : -1;
      const pp = project(cam, side * 9, 0, a.z + SEG / 2);
      if (pp) K.pawprints(g, [{ x: pp[0], y: pp[1], a: 0, s: 9 * pp[2], alpha: Math.min(1, build * 1.4) * Math.max(0.25, a.f), flat: 0.42 }], 1.1);
    }
  }
}

// ---- the kid seated from behind (custom: the kit has no seated pose) ------------------------------------
// (x, y) = hip point on the deck, u = standing height / 100. o: shake, headLift 0..1, legs, deck(g), light, dark 0..1
function coatTone(dark) {
  // keep the raincoat yellow in the dark: darken + cool slightly, never mix toward olive
  return K.mix(K.shade(KID_COAT, -dark * 0.62), "#3a4a7a", dark * 0.12);
}
function seatedKid(g, x, y, u, o = {}) {
  const t = o.t || 0;
  const sob = (o.shake || 0) * (Math.max(0, Math.sin(t * 7.5)) * 0.7 + K.noise(t * 6, 3) * 0.3);
  const lift = K.clamp(o.headLift || 0);
  const dark = o.dark == null ? 0.5 : o.dark;
  const coat = coatTone(dark * 0.8);
  const coatD = coatTone(Math.min(1, dark + 0.15));
  const jeans = K.mix("#2b3448", "#0a0d16", dark * 0.6);
  const hair = K.mix("#5a3a22", "#0e0b0a", dark * 0.6);
  const rimC = (o.light && o.light.color) || GLASS;
  const rimA = o.light ? (o.light.strength == null ? 1 : o.light.strength) : 0.8;
  g.save();
  g.translate(x, y);
  g.scale(u, u);
  // legs over the end of the bridge: thighs forward, shins hanging down into the void (behind the glass)
  if (o.legs) {
    const sw = Math.sin(t * 0.9) * 1.2;
    for (const s of [-1, 1]) {
      const lx = s * 6.2, ox = sw * s * 0.3;
      g.fillStyle = jeans;
      g.beginPath();
      g.moveTo(lx - 3.8, -3);
      g.lineTo(lx + 3.8, -3);
      g.lineTo(lx + 3.3 + ox, 20);
      g.lineTo(lx - 3.3 + ox, 20);
      g.closePath();
      g.fill();
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.fillRect(lx - 3.6, -3, 7.4, 4);
      g.fillStyle = K.mix("#a8322e", "#1a0a0a", dark * 0.5);
      g.beginPath();
      g.moveTo(lx - 3.8 + ox, 18);
      g.lineTo(lx + 3.8 + ox, 18);
      g.lineTo(lx + 4.2 + ox, 27);
      g.quadraticCurveTo(lx + ox, 29, lx - 4.2 + ox, 27);
      g.closePath();
      g.fill();
    }
  }
  if (o.deck) o.deck(g); // the glass deck is drawn between the legs and the body
  const hunch = 1 - lift * 0.7;
  const shY = -31 + hunch * 3 + sob * 0.8;
  const body = new Path2D();
  body.moveTo(-13, 1);
  body.bezierCurveTo(-15, -8, -14.5, shY + 8, -11.5, shY + 1.5);
  body.quadraticCurveTo(-6, shY - 2.5, 0, shY - 2.6);
  body.quadraticCurveTo(6, shY - 2.5, 11.5, shY + 1.5);
  body.bezierCurveTo(14.5, shY + 8, 15, -8, 13, 1);
  body.quadraticCurveTo(0, 3, -13, 1);
  body.closePath();
  const arms = new Path2D();
  for (const s of [-1, 1]) {
    K.tube(arms, [s * 11.5, shY + 3, s * 15.2, shY + 13 + sob * 0.3, s * 13.2, -6], [7.2, 6.4, 5.6], 5, true, true);
  }
  const all = new Path2D();
  all.addPath(arms);
  all.addPath(body);
  const cg = g.createLinearGradient(0, shY - 3, 0, 2);
  cg.addColorStop(0, coat);
  cg.addColorStop(1, coatD);
  g.fillStyle = cg;
  g.fill(all);
  g.strokeStyle = K.rgba("#000000", 0.28);
  g.lineWidth = 0.35;
  g.beginPath();
  g.moveTo(0, shY + 5);
  g.quadraticCurveTo(0.6, -12, 0, -1);
  g.moveTo(-9, -5); g.quadraticCurveTo(-4, -8, 0, -6);
  g.moveTo(9, -5); g.quadraticCurveTo(4, -8, 0, -6);
  g.moveTo(-12, shY + 9); g.quadraticCurveTo(-9, shY + 14, -10, shY + 20);
  g.moveTo(12, shY + 9); g.quadraticCurveTo(9, shY + 14, 10, shY + 20);
  g.stroke();
  g.fillStyle = K.rgba("#000000", 0.25);
  g.fillRect(-13, -2.2, 26, 2.6);
  // hood lying down on the back
  const hood = new Path2D();
  hood.moveTo(-7.5, shY + 0.5);
  hood.bezierCurveTo(-8.5, shY + 7, -4, shY + 10.5, 0, shY + 10.5);
  hood.bezierCurveTo(4, shY + 10.5, 8.5, shY + 7, 7.5, shY + 0.5);
  hood.quadraticCurveTo(0, shY - 2, -7.5, shY + 0.5);
  g.fillStyle = K.mix(coat, "#000", 0.14);
  g.fill(hood);
  g.strokeStyle = K.rgba("#000000", 0.35);
  g.lineWidth = 0.5;
  g.stroke(hood);
  // neck + head (bowed forward when hunched); ears sit BEHIND the hair mass, only their lobes show
  const hy = shY - 6.5 - lift * 3.2 + hunch * 1.6;
  g.fillStyle = K.mix("#b87c5a", "#1a1214", dark * 0.7);
  g.fillRect(-2.6, hy + 4, 5.2, shY - hy - 3);
  g.fillStyle = K.mix("#c98e6a", "#1a1214", dark * 0.7);
  g.beginPath();
  g.ellipse(-6.6, hy + 2.6 - lift, 1.2, 1.9, 0.2, 0, K.TAU);
  g.ellipse(6.6, hy + 2.6 - lift, 1.2, 1.9, -0.2, 0, K.TAU);
  g.fill();
  const head = new Path2D();
  K.ellipsePath(head, 0, hy, 7.2, 8 - hunch * 0.6);
  g.fillStyle = K.shade(hair, -0.2);
  g.fill(head);
  // clumped hair: locks falling from a crown whorl, each lit on its upper side, ending in soft points
  const R = K.rng("hairlocks");
  const locks = new Path2D();
  const cx = 0.6, cy = hy - 3 - lift * 1.5;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * K.TAU + R() * 0.2;
    const len = 6.4 + R() * 2.2;
    const ex = cx + Math.cos(a) * len * 1.05, ey = cy + Math.sin(a) * len * 1.1 + 1.6;
    const w = 1.3 + R() * 1;
    const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
    const mx = cx + Math.cos(a) * len * 0.55, my = cy + Math.sin(a) * len * 0.6;
    locks.moveTo(cx - nx * 0.4, cy - ny * 0.4);
    locks.quadraticCurveTo(mx - nx, my - ny, ex, ey);
    locks.quadraticCurveTo(mx + nx, my + ny, cx + nx * 0.4, cy + ny * 0.4);
    locks.closePath();
  }
  const lg = g.createRadialGradient(cx, cy - 2, 0.5, cx, cy, 9);
  lg.addColorStop(0, K.shade(hair, 0.18));
  lg.addColorStop(1, K.shade(hair, -0.3));
  g.fillStyle = lg;
  g.fill(locks);
  g.save();
  g.clip(locks);
  g.lineWidth = 0.18;
  for (let i = 0; i < 60; i++) {
    const a = R() * K.TAU, r1 = 4 + R() * 4;
    g.strokeStyle = R() > 0.5 ? K.rgba(K.shade(hair, 0.4), 0.45) : K.rgba(K.shade(hair, -0.5), 0.55);
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 1.2, cy + Math.sin(a) * 1.2);
    g.quadraticCurveTo(cx + Math.cos(a) * r1 * 0.6 + 0.6, cy + Math.sin(a) * r1 * 0.6, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 1.1 + 1);
    g.stroke();
  }
  g.restore();
  const sil = new Path2D();
  sil.addPath(all);
  sil.addPath(locks);
  const box = [-20, hy - 12, 20, 4];
  K.crescent(g, sil, 0, 0.45, rimC, 0.36 * rimA, box, "lighter", 2);
  K.crescent(g, sil, 0.35, 0.25, rimC, 0.18 * rimA, box, "lighter");
  K.crescent(g, sil, -0.35, 0.25, rimC, 0.18 * rimA, box, "lighter");
  if (o.bell !== false) K.glow(g, -15, -5, 3, "#ffd27a", 0.35 + (o.bellGlow || 0));
  g.restore();
}

// ---- the head lifting, in profile against the glow of the fog (44-48) ------------------------------------
// (x, y) = base of the neck, s = px per unit (head ~22 units tall), pitch: + = bowed, 0 = level
function profileKid(g, x, y, s, pitch, t, light) {
  // the silhouette is painted part by part into a layer (so overlaps never leave seams), then a rim is
  // cut from it: the layer minus itself shifted away from the light leaves a thin lit edge on the
  // face, brow, nose and the crown of the hair
  const L = K.layer(VW, VH, "f14prof");
  const q = L.g;
  const C = "#0d111c";
  q.save();
  q.translate(x, y);
  q.scale(s, s);
  q.fillStyle = C;
  // hunched shoulder + back in a coat, the hood bunched softly at the nape
  const back = new Path2D();
  back.moveTo(-74, 80);
  back.bezierCurveTo(-62, 40, -40, 12 + pitch * 6, -20, 2 + pitch * 4);
  back.bezierCurveTo(-10, -3, -4, -5, 0, -5);
  back.bezierCurveTo(6, -5, 12, 0, 16, 8);
  back.bezierCurveTo(22, 20, 28, 40, 30, 80);
  back.closePath();
  q.fill(back);
  const hood = new Path2D();
  hood.moveTo(-24, 6 + pitch * 3);
  hood.bezierCurveTo(-24, -4 + pitch * 2, -10, -10, -1, -7);
  hood.bezierCurveTo(4, -5, 4, 2, -2, 5);
  hood.closePath();
  q.fill(hood);
  // head on its neck pivot
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
  head.quadraticCurveTo(12.4, -22.4, 12.2, -20.2); // brow
  head.quadraticCurveTo(13.4, -18.4, 14.6, -15.4); // nose
  head.quadraticCurveTo(13.9, -14.4, 12.7, -14.3);
  head.quadraticCurveTo(13.2, -12.9, 12.7, -12.3); // lips
  head.quadraticCurveTo(13.1, -11.1, 12.3, -10.5);
  head.quadraticCurveTo(12.6, -8.6, 11.2, -7.6); // chin
  head.quadraticCurveTo(8, -6, 5.2, -6.6);
  head.closePath();
  q.fill(head);
  // hair: one soft mass over the crown and nape, a fringe falling over the brow, a few rounded locks
  // breaking the outline at the back (no spikes); the ear stays hidden behind it
  const hair = new Path2D();
  K.spline(hair, [-6.5, -8.5, -11, -15, -10.5, -24, -4, -31, 5, -31.6, 11.2, -27.4, 13, -22.6, 11.6, -20.4, 8.4, -22.2, 4.6, -22.8, 1.4, -21, -1.6, -16.4, -3.2, -11], true, 0.6);
  q.fill(hair);
  const R = K.rng("profilehair2");
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (0.62 + i * 0.12);
    const bx = 1.5 + Math.cos(a) * 11.4, by = -19.5 + Math.sin(a) * 11.2;
    const len = 1.4 + R() * 1.2;
    const tx = bx + Math.cos(a + 0.9) * len, ty = by + Math.sin(a + 0.9) * len + 0.8;
    q.beginPath();
    q.moveTo(bx - 1.4, by + 0.4);
    q.quadraticCurveTo(tx - 0.6, ty - 0.2, tx, ty);
    q.quadraticCurveTo(tx + 0.4, ty + 0.6, bx + 1.4, by + 0.6);
    q.closePath();
    q.fill();
  }
  // faint strand texture inside the hair (cool, very low contrast)
  q.save();
  q.clip(hair);
  q.strokeStyle = "rgba(120,140,190,0.12)";
  q.lineWidth = 0.14;
  for (let i = 0; i < 26; i++) {
    const r0 = 4 + R() * 6, a0 = Math.PI * (1.0 + R() * 0.8);
    q.beginPath();
    q.moveTo(3 + Math.cos(a0) * 2, -22 + Math.sin(a0) * 2);
    q.quadraticCurveTo(3 + Math.cos(a0 - 0.3) * r0, -22 + Math.sin(a0 - 0.3) * r0, 3 + Math.cos(a0 - 0.7) * (r0 + 4), -22 + Math.sin(a0 - 0.7) * (r0 + 4) + 2);
    q.stroke();
  }
  q.restore();
  q.restore();
  q.restore();
  // rim: L minus L shifted down-left (away from the glow up and to the right)
  const lc = light.color || "#cfe0ff", st = light.strength || 1;
  const E = K.layer(VW, VH, "f14profE");
  const d = Math.max(1.2, s * 0.22);
  E.g.drawImage(L.canvas, 0, 0, VW, VH);
  E.g.globalCompositeOperation = "source-in";
  E.g.fillStyle = lc;
  E.g.fillRect(0, 0, VW, VH);
  E.g.globalCompositeOperation = "destination-out";
  E.g.drawImage(L.canvas, -d, d * 0.55, VW, VH);
  E.g.globalCompositeOperation = "source-over";
  g.drawImage(L.canvas, 0, 0, VW, VH);
  g.save();
  g.globalCompositeOperation = "lighter";
  K.dof(g, E.canvas, 0.5, 0.85 * st);
  K.dof(g, E.canvas, 5, 0.4 * st);
  g.restore();
}

// ---- close-up props: felt mouse, bell, fur tuft, tear --------------------------------------------------
function feltMouseSprite() {
  return K.sprite("f14:mouse2", 420, 260, (g) => {
    g.translate(210, 150);
    g.strokeStyle = "#cfc6b8";
    g.lineWidth = 3;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(-120, 30);
    g.bezierCurveTo(-170, 34, -160, 90, -205, 84);
    g.stroke();
    g.strokeStyle = "rgba(220,212,200,0.8)";
    g.lineWidth = 0.8;
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.moveTo(-203, 84);
      g.quadraticCurveTo(-212 - i * 1.5, 80 + i * 2, -214 - i * 2, 74 + i * 3.5);
      g.stroke();
    }
    const body = new Path2D();
    body.moveTo(-128, 40);
    body.bezierCurveTo(-140, -40, -30, -88, 50, -58);
    body.bezierCurveTo(100, -40, 140, 0, 150, 26);
    body.quadraticCurveTo(152, 40, 130, 42);
    body.lineTo(-110, 46);
    body.quadraticCurveTo(-126, 46, -128, 40);
    body.closePath();
    // felt fuzz standing off the silhouette (drawn first, the body covers its roots)
    const R = K.rng("felt");
    g.lineWidth = 0.7;
    for (let i = 0; i < 5000; i++) {
      const x = -150 + R() * 320, y = -100 + R() * 160;
      if (!g.isPointInPath(body, x + 210, y + 150)) continue;
      const a = R() * K.TAU, l = 3 + R() * 3;
      const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l;
      if (g.isPointInPath(body, ex + 210, ey + 150)) continue;
      g.strokeStyle = R() > 0.5 ? "rgba(190,186,180,0.55)" : "rgba(120,116,112,0.55)";
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.5, y + Math.sin(a + 0.5) * l * 0.5, ex, ey);
      g.stroke();
    }
    const gr = g.createRadialGradient(-10, -40, 10, 0, 0, 170);
    gr.addColorStop(0, "#a9a6a2");
    gr.addColorStop(0.55, "#8d8a86");
    gr.addColorStop(1, "#4f4d4b");
    g.fillStyle = gr;
    g.fill(body);
    g.save();
    g.clip(body);
    for (let i = 0; i < 1400; i++) {
      const x = -140 + R() * 300, y = -90 + R() * 140;
      const a = R() * K.TAU, l = 1 + R() * 3;
      g.strokeStyle = R() > 0.5 ? "rgba(230,226,220,0.18)" : "rgba(40,38,36,0.18)";
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    const sh = g.createLinearGradient(0, -10, 0, 46);
    sh.addColorStop(0, "rgba(0,0,0,0)");
    sh.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = sh;
    g.fillRect(-140, -10, 300, 60);
    g.restore();
    g.strokeStyle = "rgba(60,56,52,0.8)";
    g.lineWidth = 1.4;
    g.setLineDash([5, 4]);
    g.beginPath();
    g.moveTo(-120, 10);
    g.bezierCurveTo(-110, -50, -10, -78, 60, -50);
    g.stroke();
    g.setLineDash([]);
    const ear = g.createRadialGradient(54, -78, 4, 58, -70, 36);
    ear.addColorStop(0, "#f0b8bd");
    ear.addColorStop(1, "#c77a82");
    g.fillStyle = ear;
    g.beginPath();
    g.ellipse(58, -72, 26, 32, -0.35, 0, K.TAU);
    g.fill();
    g.fillStyle = "rgba(120,60,64,0.35)";
    g.beginPath();
    g.ellipse(60, -68, 15, 20, -0.35, 0, K.TAU);
    g.fill();
    // the eye: a small cross stitched in grey thread (half contrast), with its thread sheen
    g.strokeStyle = "#55514e";
    g.lineWidth = 2;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(101, -15); g.lineTo(108, -8);
    g.moveTo(108, -15); g.lineTo(101, -8);
    g.stroke();
    g.strokeStyle = "rgba(200,196,190,0.35)";
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(101.5, -15.5); g.lineTo(108, -9);
    g.stroke();
    g.fillStyle = "#c98088";
    g.beginPath();
    g.arc(146, 28, 5, 0, K.TAU);
    g.fill();
  });
}
function feltMouse(g, x, y, s, wet) {
  g.drawImage(feltMouseSprite(), x - 210 * s, y - 150 * s, 420 * s, 260 * s);
  if (wet > 0) {
    // the tear soaks in: a darker spreading spot with a faint wet sheen
    const wx = x - 6 * s, wy = y - 60 * s, r = (8 + wet * 14) * s;
    const wg = g.createRadialGradient(wx, wy, 0, wx, wy, r);
    wg.addColorStop(0, `rgba(28,30,38,${0.55 * wet})`);
    wg.addColorStop(0.7, `rgba(28,30,38,${0.35 * wet})`);
    wg.addColorStop(1, "rgba(28,30,38,0)");
    g.fillStyle = wg;
    g.save();
    g.translate(wx, wy);
    g.scale(1, 0.62);
    g.translate(-wx, -wy);
    g.fillRect(wx - r, wy - r, r * 2, r * 2);
    g.restore();
  }
}
function fuzzTuft(g, x, y, s, t) {
  // the orange fur tuft from the fence nail, tied to the bell string: ~20 fine curved hairs that lift
  // and settle in a breath of air
  const R = K.rng("tuft2");
  const breeze = Math.sin(t * 1.3) * 0.22 + K.noise(t * 0.7, 4) * 0.18;
  g.lineCap = "round";
  for (let i = 0; i < 22; i++) {
    const a0 = -2.2 + R() * 1.6;
    const l = (12 + R() * 16) * s;
    const bend = (R() - 0.5) * 1.2 + breeze * (0.6 + R() * 0.8);
    const a1 = a0 + bend * 0.5, a2 = a0 + bend;
    const mx = x + Math.cos(a1) * l * 0.55, my = y + Math.sin(a1) * l * 0.55;
    const ex = x + Math.cos(a2) * l, ey = y + Math.sin(a2) * l;
    const c = R() > 0.3 ? [232, 150, 70] : [250, 226, 186];
    g.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(0.35 + R() * 0.55).toFixed(2)})`;
    g.lineWidth = (0.35 + R() * 0.5) * s;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(mx, my, ex, ey);
    g.stroke();
  }
}

// ---- shots ----------------------------------------------------------------------------------------------
function shot1(g, t) { // [0-10] wide: the bridge of light across the chasm, you walking it far away
  prewarm(t);
  const p = K.ease.inOut(K.seg(t, 0, 10.5));
  const hor = 214;
  skyGrad(g, hor);
  abyss(g, hor, t);
  fogBands(g, hor, t, 0.9, 2);
  const cam = { x: 210 - p * 30, y: -420, z: -200 + p * 80, F: 640, hor };
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1 + p * 0.04, shakeT: t, shakeAmt: 0.8 }, () => {
    bridge(g, cam, 0, 5200, { fog: 2400 });
    const kz = K.lerp(1400, 2050, p);
    const kp = project(cam, 0, 0, kz);
    if (kp) K.drawPerson(g, kp[0], kp[1], 130 * kp[2], { view: "back", walk: true, phase: kz / 70, t, bell: true, light: { x: 480, y: hor, color: GLASS, strength: 1 }, alpha: 0.95 });
  });
  K.fog(g, VW, VH, { y: hor - 10, h: 70, color: FOG, alpha: 0.5, t, seed: 7 });
  upSnow(g, t, 11, 80, 0.8);
}

function shot2(g, t) { // [10-20] static wide, side-on: the bridge just stops in the fog; you stop
  const hor = 300;
  skyGrad(g, hor);
  abyss(g, hor, t);
  fogBands(g, hor, t, 1, 5);
  const by = 318, endX = 584;
  const gr = g.createLinearGradient(0, 0, endX, 0);
  gr.addColorStop(0, K.rgba(GLASS, 0.5));
  gr.addColorStop(0.8, K.rgba("#e8f2ff", 0.9));
  gr.addColorStop(1, K.rgba("#ffffff", 0.95));
  g.fillStyle = gr;
  g.fillRect(-10, by - 2, endX + 10, 5);
  g.fillStyle = K.rgba("#9fbbe8", 0.25);
  g.fillRect(-10, by + 3, endX + 10, 4);
  K.glow(g, endX, by, 70, GLASS, 0.3);
  const gsp = K.glowSprite(GLASS);
  g.save();
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = 0.25;
  g.drawImage(gsp, -60, by - 40, endX + 80, 80);
  g.restore();
  for (let i = 0; i < 18; i++) {
    const h1 = K.hash(i, 41), h2 = K.hash(i, 42);
    const age = (t * 0.25 + h1) % 1;
    const x = endX + 2 + h2 * 40 + age * 30, y = by - age * 60 + Math.sin(t + i) * 3;
    g.fillStyle = K.rgba("#e8f2ff", 0.7 * (1 - age));
    g.fillRect(x, y, 2.2, 1.2);
  }
  const wp = K.ease.out(K.seg(t, 9.6, 13.2));
  const kx = K.lerp(420, 556, wp);
  const walking = t < 12.9;
  K.drawPerson(g, kx, by - 1, 104, {
    view: "side", facing: 1, walk: walking, phase: kx / 46, t, bell: true, hood: false,
    light: { x: 800, y: 260, color: GLASS, strength: 1.2 }, shadow: false,
  });
  // the empty ahead: denser fog to the right, full height so it has no edges
  const fg = g.createLinearGradient(endX, 0, VW, 0);
  fg.addColorStop(0, K.rgba(FOG, 0));
  fg.addColorStop(1, K.rgba("#3a4762", 0.55));
  g.fillStyle = fg;
  g.fillRect(endX, 0, VW - endX, VH);
  upSnow(g, t, 12, 70, 0.8);
}

function shot3(g, t) { // [20-30] from behind and a little above: you sit down at the end, legs over the edge
  prewarm(t);
  const p = K.ease.inOut(K.seg(t, 20, 30.5));
  const hor = 150;
  skyGrad(g, hor);
  abyss(g, hor, t);
  fogBands(g, hor, t, 1, 8);
  K.glow(g, 480, hor + 20, 300, "#7d93c4", 0.2);
  const cam = { x: 0, y: -112, z: -330 + p * 14, F: 720, hor };
  const kp = project(cam, 0, 0, 0);
  const u = 130 * kp[2] / 100;
  const deck = (dg) => bridge(dg, cam, -800, 22, { fog: 1800 });
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1.0 + p * 0.03, shakeT: t, shakeAmt: 1 }, () => {
    // the drop beyond the end of the glass: cold light falling away into the fog
    const ep = project(cam, 0, 0, 22);
    if (ep) {
      K.glow(g, ep[0], ep[1] + 70, 190, "#7890d0", 0.16);
      K.glow(g, ep[0], ep[1] + 10, 60, GLASS, 0.18);
    }
    const sit = K.ease.inOut(K.seg(t, 20.4, 22.8));
    if (sit < 0.7) {
      // standing at the end, then crouching down (one pose at a time: no blending of two figures)
      deck(g);
      K.drawPerson(g, kp[0], kp[1], 130 * kp[2], {
        view: "back", t, crouch: (sit / 0.7) * 0.9, bell: true, hood: false,
        light: { x: 480, y: hor, color: GLASS, strength: 1.2 },
      });
    } else {
      const sp = K.ease.out(K.seg(sit, 0.7, 1));
      seatedKid(g, kp[0], kp[1] - 1 - (1 - sp) * 6 * u, u, {
        t, shake: K.env(t, 23.5, 30.5, 1.5, 1) * 0.9, headLift: 0, legs: true, dark: 0.45,
        deck: (dg) => { dg.save(); dg.scale(1 / u, 1 / u); dg.translate(-kp[0], -(kp[1] - 1)); deck(dg); dg.restore(); },
        light: { color: GLASS, strength: 1 },
      });
    }
    // the grey felt mouse, lifted from the deck at your side up into your lap (25-27)
    const m = K.ease.inOut(K.seg(t, 25, 27));
    if (t > 22.8) {
      const mx = kp[0] + K.lerp(16, 9, m) * u, my = kp[1] + K.lerp(-1, -15, m) * u;
      g.save();
      g.globalAlpha = 1 - K.seg(m, 0.85, 1) * 0.6;
      feltMouse(g, mx, my, u * 0.03, 0);
      g.restore();
    }
  });
  upSnow(g, t, 13, 60, 0.8);
  K.focus(g, VW, VH, 5, (f) => upSnow(f, t, 14, 10, 0.6, 3.2), "f14near");
}

function lapSprite() {
  // looking down into your lap at the end of the bridge: denim thighs (hips near and wide, knees
  // rounded), the glass deck beside them ending in a bright edge just past the knees, and beyond it
  // the drop: fog falling away into the dark
  return K.sprite("f14:lap2", VW, VH, (g) => {
    const bg = g.createLinearGradient(0, 0, 0, 230);
    bg.addColorStop(0, "#0a0d16");
    bg.addColorStop(0.6, "#1c2438");
    bg.addColorStop(1, "#2c3854");
    g.fillStyle = bg;
    g.fillRect(0, 0, VW, VH);
    for (let i = 0; i < 4; i++) {
      const y = 40 + i * 42;
      const fg = g.createLinearGradient(0, y - 30, 0, y + 30);
      fg.addColorStop(0, "rgba(90,110,150,0)");
      fg.addColorStop(0.5, `rgba(90,110,150,${0.12 + i * 0.04})`);
      fg.addColorStop(1, "rgba(90,110,150,0)");
      g.fillStyle = fg;
      g.fillRect(0, y - 30, VW, 60);
    }
    // the deck: translucent glass from the bottom of frame up to its end edge
    const edgeY = 214;
    const dk = g.createLinearGradient(0, edgeY, 0, VH);
    dk.addColorStop(0, "rgba(188,214,255,0.3)");
    dk.addColorStop(1, "rgba(110,140,200,0.14)");
    g.fillStyle = dk;
    g.fillRect(0, edgeY, VW, VH - edgeY);
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      const x0 = 60 + i * 170;
      g.beginPath();
      g.moveTo(x0, VH);
      g.lineTo(x0 + 60, edgeY + 4);
      g.stroke();
    }
    // the end edge: a bright line, its thickness, and a glow spilling down into the drop
    const eg = g.createLinearGradient(0, edgeY - 26, 0, edgeY);
    eg.addColorStop(0, "rgba(160,190,240,0)");
    eg.addColorStop(1, "rgba(160,190,240,0.3)");
    g.fillStyle = eg;
    g.fillRect(0, edgeY - 26, VW, 26);
    g.fillStyle = "rgba(240,248,255,0.95)";
    g.fillRect(0, edgeY - 1.5, VW, 3);
    g.fillStyle = "rgba(170,200,250,0.35)";
    g.fillRect(0, edgeY + 1.5, VW, 6);
    // thighs: wide at the hips (bottom, nearest), narrowing and rounding at the knees by the edge
    for (const s of [-1, 1]) {
      const hx = 480 + s * 182, kx = 480 + s * 120;
      const p = new Path2D();
      p.moveTo(hx - 170, VH + 20);
      p.bezierCurveTo(hx - 172, 420, kx - 112, 300, kx - 92, 226);
      p.bezierCurveTo(kx - 80, 176, kx + 80, 176, kx + 92, 226);
      p.bezierCurveTo(kx + 112, 300, hx + 172, 420, hx + 170, VH + 20);
      p.closePath();
      const jg = g.createLinearGradient(hx - 180, 0, hx + 180, 0);
      jg.addColorStop(0, "#0d1320");
      jg.addColorStop(0.35, "#2a3754");
      jg.addColorStop(0.55, "#33425f");
      jg.addColorStop(0.8, "#212c44");
      jg.addColorStop(1, "#0c111c");
      g.fillStyle = jg;
      g.fill(p);
      g.save();
      g.clip(p);
      // the top of the thigh catches the cold light from ahead; knees brightest, hips in shadow
      const kg = g.createRadialGradient(kx, 214, 10, kx, 240, 210);
      kg.addColorStop(0, "rgba(200,220,255,0.3)");
      kg.addColorStop(1, "rgba(200,220,255,0)");
      g.fillStyle = kg;
      g.fillRect(kx - 200, 150, 400, 320);
      const hg = g.createLinearGradient(0, 420, 0, VH);
      hg.addColorStop(0, "rgba(0,0,0,0)");
      hg.addColorStop(1, "rgba(0,0,0,0.5)");
      g.fillStyle = hg;
      g.fillRect(hx - 200, 420, 400, 140);
      // twill
      g.strokeStyle = "rgba(170,190,230,0.06)";
      g.lineWidth = 1;
      for (let i = -40; i < 50; i++) {
        g.beginPath();
        g.moveTo(hx - 260 + i * 8, 150);
        g.lineTo(hx - 260 + i * 8 + 150, VH);
        g.stroke();
      }
      // creases: across the hip fold, and fanning from the inner thigh toward the knee
      g.strokeStyle = "rgba(0,0,0,0.32)";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(hx - 150, 506); g.quadraticCurveTo(hx, 488, hx + 150, 510);
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.07)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(hx - 140, 498); g.quadraticCurveTo(hx, 480, hx + 140, 502);
      g.stroke();
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.lineWidth = 1.6;
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.moveTo(kx - s * (40 - k * 14), 250 + k * 22);
        g.quadraticCurveTo(kx - s * (10 - k * 8), 262 + k * 24, kx + s * (20 + k * 6), 248 + k * 28);
        g.stroke();
      }
      // outer seam
      g.strokeStyle = "rgba(205,170,90,0.35)";
      g.setLineDash([5, 4]);
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(hx + s * 150, VH);
      g.bezierCurveTo(hx + s * 150, 420, kx + s * 100, 300, kx + s * 86, 226);
      g.stroke();
      g.setLineDash([]);
      g.restore();
      g.strokeStyle = "rgba(0,0,0,0.5)";
      g.lineWidth = 2;
      g.stroke(p);
    }
    const gap = g.createLinearGradient(440, 0, 520, 0);
    gap.addColorStop(0, "rgba(0,0,0,0)");
    gap.addColorStop(0.5, "rgba(0,0,0,0.55)");
    gap.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gap;
    g.fillRect(430, 200, 100, 340);
  });
}
function handsClose(g, t, ring) {
  const p = K.ease.inOut(K.seg(t, 30, 48));
  K.withCamera(g, VW, VH, { x: 480 + ring * 70, y: 270 + ring * 20, zoom: 1.0 + p * 0.05 + ring * 0.16, shakeT: t, shakeAmt: 0.8 }, () => {
    g.drawImage(lapSprite(), -40, -30, VW + 80, VH + 60);
    K.fog(g, VW, VH, { y: 110, h: 140, color: FOG, alpha: 0.5, t, seed: 21 });
    K.glow(g, 480, 170, 420, "#8aa2d4", 0.14);
    const breathe = Math.sin(t * 1.1) * 2;
    const mx = 480, my = 404 + breathe * 0.5;
    const tear = K.seg(t, 33.0, 34.0);
    const wet = K.ease.out(K.seg(t, 34.0, 36.0));
    const bx = 668, by = 344 + breathe * 0.5;
    const jig = t >= 40 ? Math.sin(t * 40) * 0.3 * Math.exp(-(t - 40) * 1.4) + Math.sin(t * 33) * 0.12 * K.env(t, 40.4, 43, 0.3, 1.2) : 0;
    const lightH = { x: 480, y: 120, color: GLASS, strength: 0.8 };
    const lightL = ring > 0 ? { x: bx, y: by, color: "#ffcf7a", strength: 0.6 + ring } : lightH;
    // hands under the mouse (palms up, fingers curled under it) ...
    povHand(g, 330, 476 + breathe, 190, { left: true, view: "palm", angle: -0.55, curl: 0.72, spread: 0.02, t, light: lightL, thumb: 0.2 });
    povHand(g, 630, 476 + breathe, 190, { view: "palm", angle: -2.59, curl: 0.72, spread: 0.02, t, light: lightH, thumb: 0.2 });
    // ... the mouse resting in them, with a soft contact shadow ...
    const cs = g.createRadialGradient(mx + 6, my + 36, 0, mx + 6, my + 36, 140);
    cs.addColorStop(0, "rgba(0,0,0,0.4)");
    cs.addColorStop(1, "rgba(0,0,0,0)");
    g.save();
    g.translate(mx + 6, my + 36);
    g.scale(1, 0.16);
    g.translate(-(mx + 6), -(my + 36));
    g.fillStyle = cs;
    g.fillRect(mx - 134, my - 104 + 0, 280, 280);
    g.restore();
    feltMouse(g, mx, my, 0.6, wet);
    // ... and both thumbs over its back
    povHand(g, 330, 476 + breathe, 190, { left: true, view: "palm", angle: -0.55, curl: 0.72, t, light: lightL, part: "thumb", thumb: 0.2, thumbCurl: 0.35 });
    povHand(g, 630, 476 + breathe, 190, { view: "palm", angle: -2.59, curl: 0.72, t, light: lightH, part: "thumb", thumb: 0.2, thumbCurl: 0.35 });
    // the red string from your left wrist, looped through your fingers, out to the bell on your knee
    g.strokeStyle = "#a8322e";
    g.lineWidth = 3;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(330, 480 + breathe);
    g.bezierCurveTo(340, 470, 380, 440, 368, 416 + breathe * 0.5);
    g.bezierCurveTo(356, 396, 390, 380, 410, 396);
    g.bezierCurveTo(470, 440, 590, 420, bx - 8, by - 14);
    g.stroke();
    g.strokeStyle = "rgba(255,180,170,0.3)";
    g.lineWidth = 1;
    g.stroke();
    fuzzTuft(g, bx - 30, by - 10, 1.3, t);
    g.save();
    g.translate(bx, by - 22);
    g.rotate(jig);
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath();
    g.ellipse(4, 42, 20, 5, 0, 0, K.TAU);
    g.fill();
    K.drawBell(g, 0, 22, 38, { t, glint: 0.4 + ring * 1.4 });
    g.restore();
    K.glow(g, bx, by, 70 + ring * 200, "#ffcf7a", 0.12 + ring * 0.38);
    // the tear: a single drop with a highlight falls into frame and lands on the felt (33-34)
    const tx = mx - 4, landY = my - 36;
    if (tear > 0 && tear < 1) {
      const q = tear * tear;
      const ty = K.lerp(-20, landY, q);
      const v = tear * 2;
      g.strokeStyle = `rgba(210,228,255,${0.18 * v})`;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(tx, ty - 10 - v * 16);
      g.lineTo(tx, ty - 8);
      g.stroke();
      const dg = g.createRadialGradient(tx - 1.5, ty - 2, 0.5, tx, ty, 7);
      dg.addColorStop(0, "rgba(255,255,255,0.95)");
      dg.addColorStop(0.35, "rgba(190,215,255,0.6)");
      dg.addColorStop(1, "rgba(120,150,210,0.35)");
      g.fillStyle = dg;
      g.beginPath();
      g.moveTo(tx, ty - 11);
      g.quadraticCurveTo(tx + 6, ty, tx, ty + 5);
      g.quadraticCurveTo(tx - 6, ty, tx, ty - 11);
      g.fill();
      K.glow(g, tx - 1.5, ty - 2, 4, "#ffffff", 0.9);
    }
    if (t >= 34.0 && t < 35.2) {
      const s = K.seg(t, 34.0, 35.2);
      g.strokeStyle = `rgba(220,235,255,${0.6 * (1 - s)})`;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(tx, landY, 4 + s * 16, 2 + s * 6, 0, 0, K.TAU);
      g.stroke();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI * (0.15 + i * 0.17);
        K.glow(g, tx + Math.cos(a) * s * 18, landY + Math.sin(a) * s * 12 + s * s * 10, 2, "#eaf2ff", 0.8 * (1 - s));
      }
    }
    if (wet > 0) K.glow(g, tx - 3, landY - 3, 3, "#ffffff", 0.5 * wet);
    if (ring > 0) {
      for (let k = 0; k < 3; k++) {
        const q = K.seg(t, 40 + k * 0.55, 42.6 + k * 0.55);
        if (q <= 0 || q >= 1) continue;
        g.strokeStyle = `rgba(255,214,140,${0.4 * (1 - q)})`;
        g.lineWidth = 2.4 * (1 - q) + 0.6;
        g.beginPath();
        g.ellipse(bx, by, 24 + q * 260, (24 + q * 260) * 0.6, 0, 0, K.TAU);
        g.stroke();
      }
    }
  });
  upSnow(g, t, 15, 36, 0.6);
}
function shot4(g, t) { prewarm(t); handsClose(g, t, 0); }
function shot5(g, t) { // [40-48] the bell rings by itself; then, in profile, your head lifts
  prewarm(t);
  if (t < 44) { handsClose(g, t, K.ease.inOut(K.seg(t, 39.8, 41.2))); return; }
  const p = K.ease.inOut(K.seg(t, 44, 48.5));
  const hor = 330;
  skyGrad(g, hor);
  // the fog glows ahead (right): the light you lift your head toward
  K.glow(g, 700, 300, 520, "#8aa2d4", 0.4);
  K.glow(g, 760, 290, 220, "#cfe0ff", 0.25);
  fogBands(g, hor, t, 1, 9);
  const lift = K.ease.inOut(K.seg(t, 44.3, 47));
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1.02 + p * 0.03, shakeT: t, shakeAmt: 0.9 }, () => {
    profileKid(g, 410, 420, 7.4, K.lerp(0.62, -0.08, lift), t, { color: "#d6e6ff", strength: 1.2 });
  });
  upSnow(g, t, 16, 50, 0.8);
  K.focus(g, VW, VH, 5, (f) => upSnow(f, t, 17, 8, 0.5, 3.4), "f14near");
}

function shot6(g, t) { // [48-58] the bridge builds itself forward under Biscuit's paws, a pawprint on every segment
  prewarm(t);
  const p = K.ease.inOut(K.seg(t, 48, 58.5));
  const hor = 236;
  skyGrad(g, hor);
  abyss(g, hor, t, 0.8);
  const cam = { x: 0, y: -105, z: -300 + p * 30, F: 700, hor };
  const step = 0.5, t0 = 48.6;
  const built = Math.max(0, (t - t0) / step);
  const zEnd = 22 + Math.max(0, Math.floor(built)) * SEG;
  // he walks at the very front of the newest segment: the glass forms under his paws
  const fz = 22 + built * SEG + 10;
  const fp = project(cam, 0, 0, fz);
  fogBands(g, hor, t, 1, 10);
  K.withCamera(g, VW, VH, { x: 530, y: 270, zoom: 1.0 + p * 0.04, shakeT: t, shakeAmt: 1 }, () => {
    bridge(g, cam, -600, zEnd + SEG, {
      fog: 1900, bw: 36,
      alphaAt: (z) => (z < 22 ? 1 : K.smooth(K.clamp(built - (z - 22) / SEG))),
      paws: (z) => z >= 22 && z < 22 + built * SEG - SEG * 0.5,
    });
    if (fp && t > 48.2) {
      const a = 0.65 * K.smooth(K.seg(t, 48.2, 50));
      K.glow(g, fp[0], fp[1] - 20 * fp[2], 110 * fp[2], AMBER, a * 0.5);
      K.drawCat(g, fp[0], fp[1], 26 * fp[2], {
        pose: "walk", phase: built * 0.5, facing: 1, headTurn: -0.6, t, bell: false, shadow: false, alpha: a,
        light: { x: fp[0] - 50, y: fp[1] - 200, color: "#ffd9a0", strength: 1.5 },
      });
    }
    seatedKid(g, 372, 530, 4.0, { t, headLift: 1, legs: false, dark: 0.75, light: { color: "#d6e4ff", strength: 1.4 }, bellGlow: 0.3 });
  });
  K.fog(g, VW, VH, { y: hor + 4, h: 60, color: FOG, alpha: 0.4, t, seed: 12 });
  upSnow(g, t, 18, 50, 0.8);
}

// the Meme Dimension, far ahead: a pink and cyan bloom with light shards
function memeBurst(g, x, y, t, k) {
  if (k <= 0) return;
  K.glow(g, x - 70, y - 4, 300, "#ff5fd2", 0.6 * k);
  K.glow(g, x + 74, y + 2, 290, "#5ff0ff", 0.6 * k);
  K.glow(g, x - 30, y, 110, "#ff8fe0", 0.7 * k);
  K.glow(g, x + 34, y, 110, "#8ff6ff", 0.7 * k);
  K.glow(g, x, y, 46, "#ffffff", 0.95 * k);
  g.save();
  g.translate(x, y);
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 9; i++) {
    const a = K.hash(i, 71) * K.TAU + t * 0.05 * (i % 2 ? 1 : -1);
    const len = (90 + K.hash(i, 72) * 160) * k;
    const w = 3 + K.hash(i, 73) * 5;
    const col = i % 2 ? "#ff5fd2" : "#5ff0ff";
    const gr = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    gr.addColorStop(0, K.rgba("#ffffff", 0.8 * k));
    gr.addColorStop(0.3, K.rgba(col, 0.55 * k));
    gr.addColorStop(1, K.rgba(col, 0));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-Math.sin(a) * w, Math.cos(a) * w);
    g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    g.lineTo(Math.sin(a) * w, -Math.cos(a) * w);
    g.closePath();
    g.fill();
  }
  g.restore();
}
function shot7(g, t) { // [58-66] you stand and walk onto the new bridge, toward pink and cyan light
  const p = K.seg(t, 58, 66);
  const hor = 226;
  skyGrad(g, hor);
  const bx = 520, byy = hor - 6;
  const burst = K.smooth(K.seg(t, 58.2, 61.5));
  K.godRays(g, bx, byy, VW, VH, { color: "#ff5fd2", count: 9, strength: 0.26 * burst, t, angle: Math.PI / 2 - 0.1, spread: 3.0, length: 640, seed: 31 });
  K.godRays(g, bx, byy, VW, VH, { color: "#5ff0ff", count: 9, strength: 0.24 * burst, t, angle: Math.PI / 2 + 0.25, spread: 3.0, length: 600, seed: 32 });
  memeBurst(g, bx, byy, t, burst);
  abyss(g, hor, t, 0.85);
  fogBands(g, hor, t, 0.7, 14);
  const walk = K.seg(t, 60.2, 66);
  const kz = K.lerp(0, 300, walk);
  const cam = { x: 0, y: -150, z: -560 + kz * 0.6, F: 720, hor };
  K.withCamera(g, VW, VH, { x: 480, y: 270, zoom: 1, shakeT: t, shakeAmt: 1 }, () => {
    bridge(g, cam, -600, 3200, { fog: 1700, bw: 44, paws: (z) => z >= 22 });
    const kp = project(cam, 0, 0, kz);
    if (kp) {
      const stand = K.ease.inOut(K.seg(t, 58.4, 60.2));
      const KL = K.layer(VW, VH, "f14kid");
      const po = {
        view: "back", walk: walk > 0, phase: kz / 60, crouch: (1 - stand) * 0.9, t, bell: true, hood: false,
        light: { x: bx, y: byy, color: "#ffd0f4", strength: 1.2 + burst * 0.8 },
      };
      K.drawPerson(KL.g, kp[0], kp[1], 130 * kp[2], po);
      hairOver(KL.g, kp[0], kp[1], 130 * kp[2], Object.assign({}, po, { light: { x: bx, y: byy, color: "#bff6ff", strength: 1.2 + burst } }));
      KL.g.save();
      KL.g.setTransform(1, 0, 0, 1, 0, 0);
      KL.g.globalCompositeOperation = "source-atop";
      KL.g.fillStyle = "rgba(16,20,40,0.36)";
      KL.g.fillRect(0, 0, KL.canvas.width, KL.canvas.height);
      KL.g.restore();
      g.drawImage(KL.canvas, 0, 0, VW, VH);
    }
  });
  if (burst > 0) K.lensFlare(g, bx, byy, VW, VH, 0.5 * burst, { color: "#ffc8f0" });
  upSnow(g, t, 19, 50, 0.8);
}

// cache fills ahead of need (pure in t: they only populate sprite caches)
function prewarm(t) {
  if (t >= 26 && t < 26.3) lapSprite();
  if (t >= 27 && t < 27.3) feltMouseSprite();
  if (t >= 55 && t < 55.3) K.layer(VW, VH, "f14kid");
  if (t >= 8 && t < 8.3) K.glowSprite(AMBER);
}

const SHOTS = [
  [0, shot1, false],
  [10, shot2, false],
  [20, shot3, false],
  [30, shot4, true],
  [40, shot5, false],
  [48, shot6, false],
  [58, shot7, false],
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
  draw(g, t, W, H) {
    g.save();
    g.scale(W / VW, H / VH);
    g.fillStyle = SLATE;
    g.fillRect(0, 0, VW, VH);
    compose(g, t);
    const warm = t >= 40 && t < 48 ? K.env(t, 39.8, 48, 0.6, 1.5) : 0;
    K.finish(g, VW, VH, t, { bloom: 0.36, tint: "#3a5078", tintAlpha: 0.2, vignette: 0.62, grain: 0.06, letterbox: 1 });
    if (warm > 0) K.grade(g, VW, VH, { tint: "#ffcf8a", alpha: 0.1 * warm, mode: "soft-light" });
    const ta = K.env(t, 1.6, 6.4, 1.0, 1.0);
    if (ta > 0) K.title(g, VW, VH, "Almost", "Chapter 14", ta, { y: VH * 0.36, size: 62, glow: "#bcd6ff" });
    K.fadeBlack(g, VW, VH, 1 - K.smooth(K.seg(t, 0, 1.6)));
    K.fadeBlack(g, VW, VH, K.smooth(K.seg(t, 63.6, 66)));
    g.restore();
  },
};
