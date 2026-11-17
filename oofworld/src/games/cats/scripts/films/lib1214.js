// films/lib1214.js - shared painters for f12 "Echoes", f13 "The Lantern Cats" and f14 "Almost":
// a shaded POV hand (individually modelled fingers, knuckle creases, nails, warm rim, sleeve folds,
// the bell hanging from its red string at the wrist) and clumped back-of-head hair to lay over the
// kit's drawPerson. Pure functions of their arguments; no timers, no storage.
import * as K from "../filmkit.js";

const SKIN = "#e0ac85";
const COAT = "#e8b923";

function localLight(o, x, y, ang, mirror) {
  let L = { x: -0.3, y: -0.9, color: "#fff1d6", k: 0.6 };
  if (o.light) {
    const lx = o.light.x - x, ly = o.light.y - y;
    const l = Math.hypot(lx, ly) || 1;
    L = { x: lx / l, y: ly / l, color: o.light.color || "#fff1d6", k: K.clamp(o.light.strength == null ? 1 : o.light.strength, 0, 2) };
  }
  const r = -(ang + Math.PI / 2);
  const ca = Math.cos(r), sa = Math.sin(r);
  return { x: (L.x * ca - L.y * sa) * mirror, y: L.x * sa + L.y * ca, color: L.color, k: L.k };
}

// one phalanx as a capsule from (ax, ay) to (bx, by), width w0 -> w1, shaded across its width
function phalanx(g, ax, ay, bx, by, w0, w1, skin, Ll, dark) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 0.001;
  const nx = -dy / len, ny = dx / len;
  const p = new Path2D();
  p.moveTo(ax - nx * w0 / 2, ay - ny * w0 / 2);
  p.lineTo(bx - nx * w1 / 2, by - ny * w1 / 2);
  p.arc(bx, by, w1 / 2, Math.atan2(-ny, -nx), Math.atan2(ny, nx), false);
  p.lineTo(ax + nx * w0 / 2, ay + ny * w0 / 2);
  p.arc(ax, ay, w0 / 2, Math.atan2(ny, nx), Math.atan2(-ny, -nx), false);
  p.closePath();
  const side = nx * Ll.x + ny * Ll.y; // which edge faces the light
  const mx = (ax + bx) / 2, my = (ay + by) / 2, hw = (w0 + w1) / 4;
  const gr = g.createLinearGradient(mx - nx * hw, my - ny * hw, mx + nx * hw, my + ny * hw);
  const base = K.mix(skin, "#3a1a10", dark);
  const lit = K.mix(K.shade(skin, 0.14), "#3a1a10", dark * 0.8);
  const shd = K.mix(K.shade(skin, -0.3), "#2a1008", dark);
  if (side >= 0) {
    gr.addColorStop(0, shd);
    gr.addColorStop(0.45, base);
    gr.addColorStop(0.8, lit);
    gr.addColorStop(1, K.shade(base, -0.05));
  } else {
    gr.addColorStop(0, K.shade(base, -0.05));
    gr.addColorStop(0.2, lit);
    gr.addColorStop(0.55, base);
    gr.addColorStop(1, shd);
  }
  g.fillStyle = gr;
  g.fill(p);
  return p;
}

// povHand(g, x, y, size, o): the wrist at (x, y); fingers point along o.angle (radians, -PI/2 = up).
//  o: left, curl 0..1 (or curls [4]), spread, view 'back'|'palm', thumb (angle offset), part 'all'|'hand'|'thumb',
//     light {x,y,color,strength}, skin, sleeve, bell (bool), t, ring (bell glint 0..1), sleeveLen
export function povHand(g, x, y, size, o = {}) {
  if (!(size > 0)) return;
  const u = size / 100;
  const ang = o.angle == null ? -Math.PI / 2 : o.angle;
  const palm = o.view === "palm";
  // seen from the palm side the thumb is on the other edge: mirror the hand
  const mirror = (o.left ? -1 : 1) * (palm ? -1 : 1);
  const t = o.t || 0;
  const skin = o.skin || SKIN;
  const sleeve = o.sleeve || COAT;
  const part = o.part || "all";
  const curls = o.curls || [0, 0, 0, 0].map(() => (o.curl == null ? 0.2 : o.curl));
  const spread = o.spread == null ? 0.07 : o.spread;
  const Ll = localLight(o, x, y, ang, mirror);
  const lw = K.clamp(1 / u, 0.25, 0.9);
  g.save();
  g.translate(x, y);
  g.rotate(ang + Math.PI / 2);
  g.scale(mirror * u, u);
  const outline = new Path2D();

  if (part !== "thumb") {
    // ---- sleeve with folds and a ribbed cuff ----
    const SL = o.sleeveLen || 280;
    const slv = new Path2D();
    slv.moveTo(-27, SL);
    slv.bezierCurveTo(-30, SL * 0.6, -31, 60, -26, 12);
    slv.quadraticCurveTo(0, 4, 26, 12);
    slv.bezierCurveTo(31, 60, 32, SL * 0.6, 29, SL);
    slv.closePath();
    const sg = g.createLinearGradient(-30, 0, 30, 0);
    const sl = Ll.x >= 0 ? 1 : -1;
    sg.addColorStop(0, K.shade(sleeve, sl > 0 ? -0.42 : 0.08));
    sg.addColorStop(0.5, K.shade(sleeve, -0.08));
    sg.addColorStop(1, K.shade(sleeve, sl > 0 ? 0.1 : -0.42));
    g.fillStyle = sg;
    g.fill(slv);
    g.save();
    g.clip(slv);
    // folds: soft dark troughs with a lit crest just above each
    for (let i = 0; i < 6; i++) {
      const y0 = 30 + i * 36 + K.hash(i, 77) * 12;
      const sag = 6 + K.hash(i, 78) * 8;
      const x0 = -32 + K.hash(i, 79) * 18, x1 = 12 + K.hash(i, 80) * 22;
      g.strokeStyle = K.rgba(K.shade(sleeve, -0.6), 0.32);
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo((x0 + x1) / 2, y0 + sag, x1, y0 - 3);
      g.stroke();
      g.strokeStyle = K.rgba(K.shade(sleeve, 0.35), 0.22);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x0 + 2, y0 - 4);
      g.quadraticCurveTo((x0 + x1) / 2, y0 + sag - 5, x1, y0 - 7);
      g.stroke();
    }
    // ribbed cuff
    const cg = g.createLinearGradient(0, 6, 0, 24);
    cg.addColorStop(0, K.shade(sleeve, -0.1));
    cg.addColorStop(1, K.shade(sleeve, -0.32));
    g.fillStyle = cg;
    g.fillRect(-32, 6, 64, 17);
    g.strokeStyle = K.rgba(K.shade(sleeve, -0.55), 0.45);
    g.lineWidth = lw * 1.2;
    g.beginPath();
    for (let i = -28; i <= 28; i += 4) { g.moveTo(i, 9); g.lineTo(i * 1.03, 22); }
    g.stroke();
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.fillRect(-32, 22, 64, 3);
    g.restore();
    if (Ll.k > 0) K.crescent(g, slv, -Ll.x * 3, -Ll.y * 3, Ll.color, 0.45 * Ll.k, [-36, 0, 36, 240], "lighter", 2);
  }

  // ---- geometry ----
  const MCP = [[-15, -51], [-5, -55.5], [5.2, -53.5], [14, -47]];
  const LEN = [[23, 14, 11.5], [26, 16, 12.5], [24, 15.5, 12], [18.5, 11.5, 10]];
  const WID = [9.6, 10.2, 9.6, 8.2];
  const thumbBase = palm ? [-16, -14] : [-17, -12];
  const ta = -Math.PI / 2 - 0.82 + (o.thumb || 0);
  const tl = [21, 16];
  const tc = o.thumbCurl == null ? 0.25 : o.thumbCurl;

  function drawThumb() {
    let ax = thumbBase[0], ay = thumbBase[1], a = ta, bend = 0;
    // thenar mass
    const th = new Path2D();
    K.ellipsePath(th, -14, -18, 9.5, 15, -0.38);
    g.fillStyle = K.shade(skin, palm ? 0.04 : -0.06);
    g.fill(th);
    outline.addPath(th);
    for (let i = 0; i < 2; i++) {
      bend += tc * (i ? 0.9 : 0.5);
      const l = tl[i] * Math.max(0.3, Math.cos(bend));
      const bx = ax + Math.cos(a) * l, by = ay + Math.sin(a) * l;
      const p = phalanx(g, ax, ay, bx, by, i ? 11 : 12.5, i ? 9.6 : 11, skin, Ll, Math.sin(bend) * 0.25);
      outline.addPath(p);
      if (i === 0) {
        g.strokeStyle = K.rgba("#7a3a24", 0.35);
        g.lineWidth = lw * 1.1;
        g.beginPath();
        g.moveTo(bx - 4, by + 1.5);
        g.quadraticCurveTo(bx, by - 0.8, bx + 4, by + 1);
        g.stroke();
      } else if (!palm) {
        nail(g, ax, ay, bx, by, 7, Math.cos(bend));
      }
      ax = bx; ay = by;
      a += tc * 0.35;
    }
  }
  function nail(g2, ax, ay, bx, by, w, fore) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const a = Math.atan2(dy, dx);
    g2.save();
    g2.translate(ax + dx * 0.62, ay + dy * 0.62);
    g2.rotate(a);
    const nl = len * 0.62 * Math.max(0.2, fore);
    const ng = g2.createLinearGradient(-nl / 2, 0, nl / 2, 0);
    ng.addColorStop(0, "#f2c9b8");
    ng.addColorStop(0.75, "#eab6a3");
    ng.addColorStop(1, "#fbe7da");
    g2.fillStyle = ng;
    g2.beginPath();
    g2.ellipse(0, 0, nl / 2, w * 0.36, 0, 0, K.TAU);
    g2.fill();
    g2.strokeStyle = "rgba(120,60,40,0.35)";
    g2.lineWidth = lw * 0.8;
    g2.stroke();
    g2.fillStyle = "rgba(255,255,255,0.45)";
    g2.fillRect(-nl * 0.25, -w * 0.18, nl * 0.5, w * 0.08);
    g2.restore();
  }

  if (part !== "thumb" && !palm) drawThumb(); // back view: the thumb sits beside/under the hand

  if (part !== "thumb") {
    // ---- fingers (pinky first) ----
    const tips = [];
    for (let i = 3; i >= 0; i--) {
      const c = curls[i] || 0;
      let [ax, ay] = MCP[i];
      const a0 = -Math.PI / 2 + (i - 1.4) * spread;
      let bend = 0;
      const w = WID[i];
      const ws = [w, w * 0.93, w * 0.86, w * 0.76];
      for (let s = 0; s < 3; s++) {
        bend += c * (s === 0 ? 0.55 : s === 1 ? 1.05 : 0.75);
        const l = LEN[i][s] * Math.max(0.16, Math.cos(Math.min(1.5, bend)));
        const a = a0 + (i - 1.5) * c * 0.04 * s;
        const bx = ax + Math.cos(a) * l, by = ay + Math.sin(a) * l;
        const p = phalanx(g, ax, ay, bx, by, ws[s], ws[s + 1], skin, Ll, Math.min(0.55, Math.sin(Math.min(1.5, bend)) * 0.4));
        outline.addPath(p);
        // joint creases (wrinkle arcs on the back, straight folds on the palm)
        if (s < 2) {
          const nx = -(by - ay) / l, ny = (bx - ax) / l;
          g.strokeStyle = K.rgba("#6a3020", palm ? 0.5 : 0.34);
          g.lineWidth = lw * (palm ? 1.2 : 0.9);
          g.beginPath();
          for (let k = 0; k < (palm ? 2 : 3); k++) {
            const off = (k - 1) * 1.3;
            const cx = bx + Math.cos(a) * off, cy = by + Math.sin(a) * off;
            const hw = ws[s + 1] * (0.32 - Math.abs(k - 1) * 0.06);
            g.moveTo(cx - nx * hw, cy - ny * hw);
            g.quadraticCurveTo(cx + Math.cos(a) * (palm ? 0 : -1.2), cy + Math.sin(a) * (palm ? 0 : -1.2), cx + nx * hw, cy + ny * hw);
          }
          g.stroke();
          if (!palm) K.glow(g, bx - Math.cos(a) * 1.5, by - Math.sin(a) * 1.5, ws[s + 1] * 0.5, "#ffe2cc", 0.12, "source-over");
        }
        if (s === 2) {
          if (!palm) nail(g, ax, ay, bx, by, ws[2], Math.cos(Math.min(1.5, bend)));
          else K.glow(g, bx, by, ws[3] * 0.6, "#ffd4c4", 0.25, "source-over");
        }
        ax = bx; ay = by;
      }
      tips.push([ax, ay]);
    }
    // ---- back of the hand / palm ----
    const hand = new Path2D();
    K.spline(hand, [-19, 7, -21.5, -12, -22.5, -34, -20, -48, -10, -56.5, 2, -58.5, 12, -56, 19.5, -48, 21, -30, 19, -8, 16.5, 7, 0, 10], true);
    const hg = g.createLinearGradient(-Ll.x * 26, -28 - Ll.y * 26, Ll.x * 26, -28 + Ll.y * 26);
    const pc = palm ? K.mix(skin, "#e48f86", 0.22) : skin;
    hg.addColorStop(0, K.shade(pc, -0.24));
    hg.addColorStop(0.6, pc);
    hg.addColorStop(1, K.shade(pc, 0.12));
    g.fillStyle = hg;
    g.fill(hand);
    outline.addPath(hand);
    g.save();
    g.clip(hand);
    if (!palm) {
      // tendons fanning to each knuckle, valleys between them, knuckle bumps
      for (let i = 0; i < 4; i++) {
        const [kx, ky] = MCP[i];
        g.strokeStyle = K.rgba("#fff0e4", 0.14);
        g.lineWidth = 2.6;
        g.beginPath();
        g.moveTo(kx * 0.3, 4);
        g.quadraticCurveTo(kx * 0.7, -24, kx, ky + 4);
        g.stroke();
        g.strokeStyle = K.rgba("#7a3a24", 0.1);
        g.lineWidth = 2.4;
        g.beginPath();
        g.moveTo(kx * 0.3 + 4, 4);
        g.quadraticCurveTo(kx * 0.7 + 4.5, -24, kx + 5, ky + 6);
        g.stroke();
        K.glow(g, kx, ky + 1, 6.5, "#ffe6d2", 0.3, "source-over");
        g.strokeStyle = K.rgba("#7a3a24", 0.25);
        g.lineWidth = lw * 0.8;
        g.beginPath();
        g.arc(kx, ky + 1.5, 3.2, Math.PI * 1.15, Math.PI * 1.85);
        g.stroke();
      }
      // faint veins
      g.strokeStyle = "rgba(110,120,170,0.13)";
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(-6, 6); g.bezierCurveTo(-9, -12, -2, -24, -6, -40);
      g.moveTo(6, 6); g.bezierCurveTo(9, -14, 4, -26, 8, -38);
      g.stroke();
    } else {
      // palm creases and a cupped hollow
      const cg = g.createRadialGradient(2, -30, 2, 2, -30, 22);
      cg.addColorStop(0, "rgba(90,30,20,0.28)");
      cg.addColorStop(1, "rgba(90,30,20,0)");
      g.fillStyle = cg;
      g.fillRect(-24, -60, 48, 64);
      g.strokeStyle = "rgba(110,40,30,0.4)";
      g.lineWidth = lw * 1.3;
      g.beginPath();
      g.moveTo(-20, -42); g.quadraticCurveTo(-2, -48, 19, -40);
      g.moveTo(-21, -32); g.quadraticCurveTo(-4, -36, 14, -26);
      g.moveTo(-12, -40); g.quadraticCurveTo(-7, -18, -10, 4);
      g.stroke();
    }
    // wrist: a soft shadow where the cuff overlaps
    const wg = g.createLinearGradient(0, -6, 0, 10);
    wg.addColorStop(0, "rgba(40,16,8,0)");
    wg.addColorStop(1, "rgba(40,16,8,0.4)");
    g.fillStyle = wg;
    g.fillRect(-25, -6, 50, 18);
    g.restore();
    // the dark palm edge on the side away from the light, warm rim on the lit edges
    const box = [-60, -130, 60, 14];
    K.crescent(g, outline, Ll.x * 4, Ll.y * 4, "#4a1e10", 0.35, box, "source-over", 2);
    if (Ll.k > 0) K.crescent(g, outline, -Ll.x * 2, -Ll.y * 2, Ll.color, 0.8 * Ll.k, box, "lighter", 2);
  }
  if (part === "thumb" || (palm && part === "all")) {
    drawThumb();
    if (part === "thumb" && Ll.k > 0) {
      const th = new Path2D();
      th.addPath(outline);
      K.crescent(g, th, -Ll.x * 2, -Ll.y * 2, Ll.color, 0.7 * Ll.k, [-50, -60, 10, 10], "lighter", 2);
    }
  }
  // the red string round the wrist (front half)
  let bellAt = null;
  if (o.bell && part !== "thumb") {
    g.strokeStyle = "#a8322e";
    g.lineWidth = 2.6;
    g.beginPath();
    g.moveTo(-23, 3);
    g.quadraticCurveTo(0, 12, 23, 3);
    g.stroke();
    g.strokeStyle = "rgba(255,190,170,0.35)";
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-22, 2.2);
    g.quadraticCurveTo(0, 10.8, 22, 2.2);
    g.stroke();
    const T = g.getTransform();
    const px = (o.bellAt == null ? 4 : o.bellAt), py = 7.6;
    bellAt = [T.a * px + T.c * py + T.e, T.b * px + T.d * py + T.f, T];
  }
  g.restore();
  if (bellAt) {
    // the bell hangs under gravity from the string (screen space), swaying a little
    const inv = g.getTransform().inverse();
    const X = inv.a * bellAt[0] + inv.c * bellAt[1] + inv.e, Y = inv.b * bellAt[0] + inv.d * bellAt[1] + inv.f;
    const drop = 9 * u, sw = Math.sin(t * 2.6) * 0.18 + (o.swing || 0);
    const bx = X + Math.sin(sw) * drop, by = Y + Math.cos(sw) * drop;
    g.strokeStyle = "#a8322e";
    g.lineWidth = Math.max(1, 2 * u);
    g.beginPath();
    g.moveTo(X, Y);
    g.lineTo(bx, by);
    g.stroke();
    K.drawBell(g, bx, by + 5.5 * u, 12 * u, { t, glint: 0.35 + (o.ring || 0) });
  }
}

// hairOver(g, x, y, h, o): clumped back-of-head hair laid over drawPerson (view back, hood down).
//  (x, y, h) are the same arguments given to drawPerson; o: walk, run, phase, crouch, light {x,y,color,strength}, hair, t
export function hairOver(g, x, y, h, o = {}) {
  const u = h / 100;
  const moving = o.walk || o.run;
  const bob = moving ? -Math.abs(Math.sin((o.phase || 0) * K.TAU)) * (o.run ? 3 : 1.4) : 0;
  const dip = K.clamp(o.crouch || 0) * 18;
  const hx = 0, hy = -91.5 + bob + dip * 0.85;
  const hair = o.hair || "#5a3a22";
  let Lx = 0, Ly = -1, Lc = "#dfe6ff", Lk = 1;
  if (o.light) {
    const lx = o.light.x - x, ly = o.light.y - (y + hy * u);
    const l = Math.hypot(lx, ly) || 1;
    Lx = lx / l; Ly = ly / l; Lc = o.light.color || Lc; Lk = o.light.strength == null ? 1 : o.light.strength;
  }
  g.save();
  g.translate(x, y);
  g.scale(u, u);
  const R = K.rng("hairclumps" + (o.seed || 0));
  const clumps = new Path2D();
  // a crown whorl a little above centre; clumps fall from it down and outward, ending in points
  const cx = hx + 0.8, cy = hy - 5.2;
  const N = 22;
  const sway = Math.sin((o.t || 0) * 1.3) * 0.25;
  for (let i = 0; i < N; i++) {
    const a = Math.PI * (0.02 + (i / (N - 1)) * 0.96) + (R() - 0.5) * 0.12; // 0 = right .. PI = left (downward half)
    const da = a < Math.PI / 2 ? a : a; // all fall downward
    const len = 9.5 + R() * 3.2;
    const sx = cx + Math.cos(da) * 1.2, sy = cy - 2 + R() * 1.5;
    const ex = cx + Math.cos(da) * 7.6 * (0.95 + R() * 0.12) + sway * (R() - 0.3), ey = cy + Math.sin(da) * len * 1.05 + 1;
    const w = 1.6 + R() * 1.3;
    const mx = (sx + ex) / 2 + Math.cos(da) * 2.2, my = (sy + ey) / 2 - 1.2;
    const nx = -Math.sin(da) * w, ny = Math.cos(da) * w * 0.5;
    clumps.moveTo(sx - nx, sy - ny);
    clumps.quadraticCurveTo(mx - nx, my - ny, ex, ey);
    clumps.quadraticCurveTo(mx + nx, my + ny, sx + nx, sy + ny);
    clumps.closePath();
  }
  // upper cap so the crown is covered
  const cap = new Path2D();
  cap.ellipse(hx, hy - 1.8, 7.3, 7.4, 0, Math.PI * 0.98, Math.PI * 2.02);
  cap.closePath();
  const hg = g.createLinearGradient(0, hy - 9, 0, hy + 7);
  hg.addColorStop(0, K.shade(hair, 0.12));
  hg.addColorStop(1, K.shade(hair, -0.4));
  g.fillStyle = hg;
  g.fill(cap);
  g.fill(clumps);
  // strand detail inside each clump, light on the upper side of every lock
  g.save();
  g.clip(clumps);
  g.lineWidth = 0.22;
  for (let i = 0; i < 70; i++) {
    const a = Math.PI * (0.04 + R() * 0.92);
    const r0 = R() * 3, r1 = 6 + R() * 5;
    g.strokeStyle = R() > 0.5 ? K.rgba(K.shade(hair, 0.4), 0.5) : K.rgba(K.shade(hair, -0.55), 0.6);
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 - 2);
    g.quadraticCurveTo(cx + Math.cos(a) * r1 * 0.6 + 1, cy + Math.sin(a) * r1 * 0.6, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 1.15);
    g.stroke();
  }
  g.restore();
  const all = new Path2D();
  all.addPath(cap);
  all.addPath(clumps);
  const box = [-12, hy - 12, 12, hy + 12];
  K.crescent(g, all, 0, 1.2, "#000000", 0.3, box, "source-over", 2);
  K.crescent(g, all, -Lx * 0.9, -Ly * 0.9, Lc, 0.75 * Lk, box, "lighter", 2);
  g.restore();
}
