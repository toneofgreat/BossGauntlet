// src/games/cats/scripts/filmpeople.js - "you", the kid: drawPerson (from behind / in profile, never
// face-on), drawHand (POV hands) and flashlightBeam. Re-exported by filmkit.js.
//
// drawPerson(g, x, y, h, opts)  x, y = ground point between the feet, h = standing height px.
//   opts view 'back'|'side'  facing 1|-1 (side view)  walk|run (bool) + phase 0..1 gait cycle
//        hood (bool, hood up)  coat colour (default yellow raincoat #e8b923)  pants  boots  hair
//        skin  flashlight (bool) + flashAngle (radians, screen) + flashLen (px)  bell (bell on the
//        left wrist)  reach 0..1 (right arm reaches forward/down)  armUp 0..1 (right arm raised
//        overhead)  crouch 0..1  wet 0..1  t
//        light {x, y, color, strength} rim light   shadow (bool, default true)   alpha
// drawHand(g, x, y, size, opts)  POV hand: (x, y) = wrist, size = wrist->fingertip px.
//   opts angle (direction the fingers point, default up), pose 'reach'|'open'|'hold'|'point'|'cup'
//        left (mirror to a left hand), item 'flashlight'|'poster'|'photo'|'bell'|null, bell (bell on
//        a red string round the wrist), skin, shadow, sleeve, light, t, wet
// flashlightBeam(g, x, y, angle, len, {spread, color, alpha, hot}) - a torch cone + hot spot.

import { TAU, clamp, lerp, smooth, mix, rgba, shade, rng, spline, tube, ellipsePath, ik, glow, crescent, roundRect } from "./filmcore.js";
import { drawCat } from "./filmcat.js";

const KID = Object.freeze({ coat: "#e8b923", pants: "#2b3448", boots: "#a8322e", hair: "#5a3a22", skin: "#e0ac85", skinShadow: "#b87c5a" });

export function flashlightBeam(g, x, y, angle, len = 400, o = {}) {
  const spread = o.spread == null ? 0.32 : o.spread;
  const color = o.color || "#fff3d0";
  const a = o.alpha == null ? 0.18 : o.alpha;
  g.save();
  g.globalCompositeOperation = "lighter";
  const ex = x + Math.cos(angle) * len, ey = y + Math.sin(angle) * len;
  const gr = g.createLinearGradient(x, y, ex, ey);
  gr.addColorStop(0, rgba(color, a * 1.6));
  gr.addColorStop(0.35, rgba(color, a));
  gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + Math.cos(angle - spread / 2) * len, y + Math.sin(angle - spread / 2) * len);
  g.quadraticCurveTo(ex + Math.cos(angle) * len * 0.08, ey + Math.sin(angle) * len * 0.08, x + Math.cos(angle + spread / 2) * len, y + Math.sin(angle + spread / 2) * len);
  g.closePath();
  g.fill();
  // inner brighter core
  g.globalAlpha = 0.6;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + Math.cos(angle - spread / 5) * len * 0.8, y + Math.sin(angle - spread / 5) * len * 0.8);
  g.lineTo(x + Math.cos(angle + spread / 5) * len * 0.8, y + Math.sin(angle + spread / 5) * len * 0.8);
  g.closePath();
  g.fill();
  g.restore();
  glow(g, x, y, len * 0.06, "#ffffff", 0.8);
  if (o.hot !== false) {
    const hx = x + Math.cos(angle) * len * 0.35, hy = y + Math.sin(angle) * len * 0.35;
    glow(g, hx, hy, len * 0.12, "#ffffff", 0.18);
  }
}

function fabricGrad(g, color, y0, y1, k = 0) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, mix(shade(color, 0.12), "#000", k));
  gr.addColorStop(0.55, mix(color, "#000", k));
  gr.addColorStop(1, mix(shade(color, -0.3), "#000", k));
  return gr;
}

// ------------------------------------------------------------------------------------------------
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
  if (wet) { C.coat = mix(C.coat, "#3a2a00", wet * 0.25); C.pants = mix(C.pants, "#0a0d14", wet * 0.35); C.hair = mix(C.hair, "#120a04", wet * 0.4); }
  const u = h / 100;
  const side = o.view === "side";
  const f = side ? (o.facing === -1 ? -1 : 1) : 1;
  const ph = o.phase || 0;
  const moving = o.walk || o.run;
  const run = !!o.run;
  const crouch = clamp(o.crouch || 0);
  let L = { x: -0.4, y: -0.9, color: "#fff1d6", rim: 0 };
  if (o.light) {
    let lx = (o.light.x - x) * f, ly = o.light.y - (y - h * 0.6);
    const l = Math.hypot(lx, ly) || 1;
    L = { x: lx / l, y: ly / l, color: o.light.color || "#fff1d6", rim: clamp(o.light.strength == null ? 1 : o.light.strength, 0, 2) };
  }
  g.save();
  if (o.alpha != null) g.globalAlpha *= clamp(o.alpha);
  if (o.shadow) {
    const sg = g.createRadialGradient(x, y, 0, x, y, h * 0.22);
    sg.addColorStop(0, "rgba(0,0,0,0.45)");
    sg.addColorStop(1, "rgba(0,0,0,0)");
    g.save();
    g.translate(x, y);
    g.scale(1, 0.18);
    g.translate(-x, -y);
    g.fillStyle = sg;
    g.beginPath();
    g.arc(x, y, h * 0.22, 0, TAU);
    g.fill();
    g.restore();
  }
  g.translate(x, y);
  g.scale(f * u, u);
  const lw = clamp(1.2 / u, 0.25, 0.9);
  const bob = moving ? -Math.abs(Math.sin(ph * TAU)) * (run ? 3 : 1.4) : 0;
  const dip = crouch * 18;
  const hipY = -49 + bob + dip;
  const shY = -80 + bob + dip * 0.9;
  const lean = (run ? 0.18 : moving ? 0.05 : 0) + crouch * 0.25;
  const leanX = (yy) => (side ? (hipY - yy) * Math.tan(lean) : 0);
  const sculptPaths = [];

  // ---- legs ----
  const legs = [];
  if (side) {
    const stride = run ? 24 : 13;
    for (const s of [0, 0.5]) {
      const p = ((ph + s) % 1 + 1) % 1;
      const swing = p > 0.5;
      const q = swing ? (p - 0.5) * 2 : p * 2;
      const fx = moving ? (swing ? lerp(-stride, stride, smooth(q)) : lerp(stride, -stride, q)) : (s ? 3 : -3);
      const lift = moving && swing ? Math.sin(Math.PI * q) * (run ? 14 : 7) : 0;
      const hip = [0, hipY];
      const ankle = [fx, -5 - lift];
      const knee = ik(hip[0], hip[1], ankle[0], ankle[1], 24, 23, -1);
      const kk = ik(hip[0], hip[1], ankle[0], ankle[1], 24, 23, 1);
      legs.push({ far: s === 0.5, hip, knee: kk[0] > knee[0] ? kk : knee, ankle, toe: [fx + 7, -1.5 - lift * 0.6] });
    }
  } else {
    for (const s of [-1, 1]) {
      const p = ((ph + (s > 0 ? 0.5 : 0)) % 1 + 1) % 1;
      const lift = moving ? Math.max(0, Math.sin(p * TAU)) * (run ? 13 : 4) : 0;
      const hip = [s * 5.4, hipY];
      const ankle = [s * 5.8, -4 - lift + dip * 0.1];
      const knee = [s * (5.6 + crouch * 4), lerp(hipY, ankle[1], 0.5) + lift * 0.3];
      legs.push({ far: false, hip, knee, ankle, s, lift });
    }
  }
  const drawLeg = (lg) => {
    const k = lg.far ? 0.3 : 0;
    const p = new Path2D();
    tube(p, [lg.hip[0], lg.hip[1], lg.knee[0], lg.knee[1], lg.ankle[0], lg.ankle[1] - 6], side ? [13.5, 10.6, 9.4] : [12.5, 10.2, 9.2], 4, true, false);
    g.fillStyle = fabricGrad(g, C.pants, hipY, 0, k);
    g.fill(p);
    // denim seam + knee crease
    g.strokeStyle = rgba(shade(C.pants, 0.25), 0.35);
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(lg.hip[0] + 2, lg.hip[1] + 4);
    g.lineTo(lg.knee[0] + 2, lg.knee[1]);
    g.lineTo(lg.ankle[0] + 2, lg.ankle[1] - 8);
    g.stroke();
    // rain boot
    const b = new Path2D();
    const ax = lg.ankle[0], ay = lg.ankle[1];
    if (side) {
      const tx = lg.toe[0], ty = lg.toe[1];
      b.moveTo(ax - 5, ay - 12);
      b.lineTo(ax + 4.5, ay - 12);
      b.lineTo(ax + 4.5, ay - 4);
      b.quadraticCurveTo(tx + 3, ty - 5, tx + 3, ty);
      b.lineTo(ax - 6, ty + 0.5);
      b.closePath();
    } else {
      roundRect(b, ax - 5.5, ay - 13, 11, 14, 3);
    }
    const bg = g.createLinearGradient(ax - 6, 0, ax + 6, 0);
    bg.addColorStop(0, mix(shade(C.boots, -0.3), "#000", k));
    bg.addColorStop(0.4, mix(C.boots, "#000", k));
    bg.addColorStop(1, mix(shade(C.boots, -0.45), "#000", k));
    g.fillStyle = bg;
    g.fill(b);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(ax - 3, ay - 12, 1.2, 9);
    g.fillStyle = "#1a1412";
    g.fillRect(ax - 6, (side ? lg.toe[1] : ay + 0.5) - 1.2, side ? lg.toe[0] - ax + 9 : 12, 1.6);
    sculptPaths.push(p, b);
  };
  for (const lg of legs) if (lg.far) drawLeg(lg);

  // ---- arms (far first) ----
  const arms = [];
  for (const s of side ? [1, -1] : [-1, 1]) {
    const p = ((ph + (s > 0 ? 0 : 0.5)) % 1 + 1) % 1;
    const sw = moving ? Math.sin(p * TAU) : 0;
    const sh = [side ? 0 : s * 10.5, shY + 3];
    let hand, elbow;
    if (side) {
      const a = Math.PI / 2 - sw * (run ? 0.9 : 0.45);
      const ua = a, la = run ? a - 1.4 : a - 0.25 - Math.max(0, sw) * 0.3;
      elbow = [sh[0] + Math.cos(ua) * 15, sh[1] + Math.sin(ua) * 15];
      hand = [elbow[0] + Math.cos(la) * 14, elbow[1] + Math.sin(la) * 14];
    } else if (run) {
      // seen from behind while running: elbows bent, forearms pumping up and down
      const back = Math.max(0, -sw), fwd = Math.max(0, sw);
      elbow = [s * (14 + back * 4), shY + 15 - back * 7 + fwd * 3];
      hand = [s * (12.5 + back * 2 - fwd * 3), shY + 26 - back * 4 - fwd * 10];
    } else {
      elbow = [s * 12.5, shY + 17 - Math.abs(sw) * 1.5];
      hand = [s * (12.5 - Math.abs(sw) * 1.5), shY + 31 - Math.max(0, sw) * 4];
    }
    const reach = s === 1 ? clamp(o.reach || 0) : 0;
    if (reach) {
      hand = [lerp(hand[0], side ? 22 : s * 8, reach), lerp(hand[1], side ? shY + 22 : shY + 36, reach)];
      elbow = [lerp(elbow[0], side ? 10 : s * 11, reach), lerp(elbow[1], shY + 16, reach)];
    }
    // armUp 0..1: the right arm raised overhead (holding something up to the sky)
    const up = s === 1 ? clamp(o.armUp || 0) : 0;
    if (up) {
      hand = [lerp(hand[0], side ? 10 : s * 15, up), lerp(hand[1], shY - 30, up)];
      elbow = [lerp(elbow[0], side ? 6 : s * 17, up), lerp(elbow[1], shY - 12, up)];
    }
    if (o.flashlight && s === 1) {
      const fa = o.flashAngle == null ? 0.35 : o.flashAngle;
      if (side) {
        elbow = [sh[0] + 5, sh[1] + 13];
        hand = [elbow[0] + Math.cos(fa) * 14, elbow[1] + Math.sin(fa) * 14];
      } else {
        elbow = [12.5, shY + 15];
        hand = [10.5 + Math.cos(fa) * 2, shY + 24];
      }
    }
    arms.push({ s, sh, elbow, hand, far: side ? s === -1 : false });
  }
  const drawArm = (a) => {
    const k = a.far ? 0.3 : 0;
    const dx0 = a.hand[0] - a.elbow[0], dy0 = a.hand[1] - a.elbow[1];
    const l0 = Math.hypot(dx0, dy0) || 1;
    // the hand, mostly swallowed by the sleeve: only the fingers show past the cuff
    g.fillStyle = mix(C.skin, "#000", k + 0.05);
    g.beginPath();
    g.ellipse(a.hand[0] + (dx0 / l0) * 3.6, a.hand[1] + (dy0 / l0) * 3.6, 2.7, 3.2, Math.atan2(dy0, dx0) + Math.PI / 2, 0, TAU);
    g.fill();
    const cuff = [a.hand[0] + (dx0 / l0) * 1.6, a.hand[1] + (dy0 / l0) * 1.6];
    const p = new Path2D();
    tube(p, [a.sh[0], a.sh[1], a.elbow[0], a.elbow[1], cuff[0], cuff[1]], [10, 8.6, 8.4], 4, true, true);
    g.fillStyle = fabricGrad(g, C.coat, shY, shY + 34, k);
    g.fill(p);
    // sleeve folds: a few soft creases along the forearm, a ribbed cuff band
    g.strokeStyle = rgba(shade(C.coat, -0.45), 0.16);
    g.lineWidth = lw * 1.1;
    g.beginPath();
    for (let i = 2; i <= 3; i++) {
      const u2 = i / 4.2;
      const mx = lerp(a.elbow[0], cuff[0], u2), my = lerp(a.elbow[1], cuff[1], u2);
      g.moveTo(mx - (dy0 / l0) * 3.5, my + (dx0 / l0) * 3.5 - 0.6);
      g.quadraticCurveTo(mx + 0.8, my + 1.2, mx + (dy0 / l0) * 3.5, my - (dx0 / l0) * 3.5 + 0.6);
    }
    g.stroke();
    g.strokeStyle = rgba(shade(C.coat, -0.4), 0.55);
    g.lineWidth = lw * 2.2;
    g.beginPath();
    g.moveTo(cuff[0] - (dx0 / l0) * 2.2 - (dy0 / l0) * 4, cuff[1] - (dy0 / l0) * 2.2 + (dx0 / l0) * 4);
    g.lineTo(cuff[0] - (dx0 / l0) * 2.2 + (dy0 / l0) * 4, cuff[1] - (dy0 / l0) * 2.2 - (dx0 / l0) * 4);
    g.stroke();
    g.strokeStyle = rgba(shade(C.coat, -0.4), 0.4);
    g.lineWidth = lw * 1.2;
    g.beginPath();
    g.moveTo(a.elbow[0] - 3, a.elbow[1] - 1);
    g.quadraticCurveTo(a.elbow[0], a.elbow[1] + 2, a.elbow[0] + 3, a.elbow[1] - 1);
    g.stroke();
    const hx = a.hand[0] + (dx0 / l0) * 3.2, hy = a.hand[1] + (dy0 / l0) * 3.2;
    if (o.bell && a.s === -1) {
      g.strokeStyle = "#a8322e";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(a.hand[0] - 3, a.hand[1]);
      g.lineTo(a.hand[0] + 3, a.hand[1]);
      g.stroke();
      g.fillStyle = "#d9a441";
      g.beginPath();
      g.arc(a.hand[0], a.hand[1] + 1.8, 1.3, 0, TAU);
      g.fill();
    }
    if (o.flashlight && a.s === 1) {
      const fa = o.flashAngle == null ? 0.35 : o.flashAngle;
      g.save();
      g.translate(hx, hy);
      g.rotate(side ? fa : -Math.PI / 2 + 0.25);
      g.fillStyle = "#9aa0aa";
      g.fillRect(-1.6, -2, 9, 4);
      g.fillStyle = "#c9cfd8";
      g.fillRect(6.5, -2.6, 3, 5.2);
      g.restore();
    }
    sculptPaths.push(p);
  };
  for (const a of arms) if (a.far) drawArm(a);
  for (const lg of legs) if (!lg.far) drawLeg(lg);

  // ---- torso (hoodie / raincoat) ----
  const torso = new Path2D();
  if (side) {
    const lx = leanX(shY);
    spline(torso, [
      lx + 7, shY + 1, lx + 9, shY + 10, 9 + leanX(hipY + 15), hipY + 6, 10, hipY + 4, 9, hipY + 7,
      -9, hipY + 7, -10, hipY + 3, -8 + leanX(hipY + 15), hipY - 8, lx - 8, shY + 8, lx - 6, shY - 1, lx, shY - 3,
    ], true);
  } else {
    // sloping shoulders (a kid's narrow, rounded shoulders, not a box), loose hem
    spline(torso, [
      0, shY - 3.5, 5, shY - 3, 9, shY - 0.5, 12, shY + 4, 13, shY + 9, 12.4, shY + 18, 11, hipY - 6, 12, hipY + 4,
      0, hipY + 5.8, -12, hipY + 4, -11, hipY - 6, -12.4, shY + 18, -13, shY + 9, -12, shY + 4, -9, shY - 0.5, -5, shY - 3,
    ], true);
  }
  g.fillStyle = fabricGrad(g, C.coat, shY - 4, hipY + 6);
  g.fill(torso);
  g.save();
  g.clip(torso);
  // soft volume: the shoulder blades catch light, the small of the back and the sides fall away
  if (!side) {
    const vg = g.createRadialGradient(-3, shY + 10, 1, 0, shY + 14, 22);
    vg.addColorStop(0, rgba(shade(C.coat, 0.25), 0.35));
    vg.addColorStop(1, rgba(shade(C.coat, 0.25), 0));
    g.fillStyle = vg;
    g.fillRect(-16, shY - 4, 32, 40);
    const sg2 = g.createLinearGradient(-13, 0, 13, 0);
    sg2.addColorStop(0, rgba(shade(C.coat, -0.5), 0.35));
    sg2.addColorStop(0.2, rgba(shade(C.coat, -0.5), 0));
    sg2.addColorStop(0.8, rgba(shade(C.coat, -0.5), 0));
    sg2.addColorStop(1, rgba(shade(C.coat, -0.5), 0.35));
    g.fillStyle = sg2;
    g.fillRect(-16, shY - 4, 32, hipY - shY + 12);
  }
  // fabric folds + seams: drag folds from the armpits, a sag above the hem band, the back yoke
  g.strokeStyle = rgba(shade(C.coat, -0.45), 0.2);
  g.lineWidth = lw * 1.4;
  g.beginPath();
  if (side) {
    g.moveTo(-4, hipY - 2); g.quadraticCurveTo(1, hipY - 10, 6, hipY - 3);
    g.moveTo(-6, shY + 14); g.quadraticCurveTo(-1, shY + 20, 2, shY + 28);
    g.moveTo(-8, hipY - 9); g.quadraticCurveTo(-2, hipY - 13, 4, hipY - 10);
  } else {
    g.moveTo(-8, hipY - 2); g.quadraticCurveTo(-2, hipY - 6, 3, hipY - 3);
    g.moveTo(1, hipY - 5); g.quadraticCurveTo(5, hipY - 8, 9, hipY - 4);
    g.moveTo(-10.5, shY + 11); g.quadraticCurveTo(-5, shY + 18, -7, hipY - 11);
    g.moveTo(10.5, shY + 11); g.quadraticCurveTo(5, shY + 18, 6.5, hipY - 12);
    g.moveTo(-11, shY + 20); g.quadraticCurveTo(-6, shY + 24, -3, shY + 31);
    g.moveTo(11, shY + 21); g.quadraticCurveTo(7, shY + 25, 4, shY + 30);
  }
  g.stroke();
  if (!side) {
    g.strokeStyle = rgba(shade(C.coat, -0.4), 0.22);
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(-11, shY + 5); g.quadraticCurveTo(0, shY + 8.5, 11, shY + 5);
    g.stroke();
    g.strokeStyle = rgba(shade(C.coat, 0.3), 0.2);
    g.beginPath();
    g.moveTo(-10.5, shY + 11.6); g.quadraticCurveTo(-5, shY + 18.6, -7, hipY - 10);
    g.stroke();
  }
  // hem band
  g.fillStyle = rgba(shade(C.coat, -0.35), 0.5);
  g.fillRect(-14, hipY + 1, 28, 4);
  // glossy raincoat streaks
  g.strokeStyle = `rgba(255,255,255,${0.16 + wet * 0.2})`;
  g.lineWidth = lw * 1.6;
  g.beginPath();
  g.moveTo(side ? 5 : -6, shY + 6);
  g.quadraticCurveTo(side ? 7 : -8, shY + 18, side ? 6 : -7, hipY - 4);
  g.stroke();
  g.restore();
  sculptPaths.push(torso);

  // ---- head ----
  const hc = [side ? 2 + leanX(-92) : 0, -91.5 + bob + dip * 0.85];
  const head = new Path2D();
  const hoodP = new Path2D();
  if (side) {
    // neck, skull, a hint of nose and jaw - only a silhouette, the hood/hair hides the face
    ellipsePath(head, hc[0], hc[1], 7.2, 8);
    head.moveTo(hc[0] + 5, hc[1] + 2);
    head.quadraticCurveTo(hc[0] + 8.4, hc[1] + 1, hc[0] + 7.6, hc[1] + 4);
    head.quadraticCurveTo(hc[0] + 6.5, hc[1] + 7.5, hc[0] + 2, hc[1] + 8);
    head.closePath();
    g.fillStyle = mix(C.skin, "#000", 0.08);
    g.fill(head);
    g.fillStyle = C.skin;
    g.fillRect(hc[0] - 2.5, hc[1] + 6, 5, 5);
  } else {
    g.fillStyle = shade(C.skin, -0.1);
    g.fillRect(-2.8, hc[1] + 5, 5.6, 6);
    ellipsePath(head, hc[0], hc[1], 7.1, 8.3);
    g.fillStyle = C.skin;
    g.fill(head);
    // ears
    g.fillStyle = shade(C.skin, -0.08);
    g.beginPath();
    g.ellipse(-7.1, hc[1] + 0.5, 1.5, 2.4, 0.2, 0, TAU);
    g.ellipse(7.1, hc[1] + 0.5, 1.5, 2.4, -0.2, 0, TAU);
    g.fill();
  }
  if (o.hood) {
    if (side) {
      spline(hoodP, [hc[0] + 7.5, hc[1] - 6, hc[0] + 8.8, hc[1] + 3, hc[0] + 5, hc[1] + 10, hc[0] - 4, hc[1] + 11, hc[0] - 9.5, hc[1] + 3, hc[0] - 8.5, hc[1] - 7, hc[0] - 1, hc[1] - 10.5], true);
    } else {
      spline(hoodP, [0, hc[1] - 10.8, 7.6, hc[1] - 7.5, 9.3, hc[1] + 1, 8.6, hc[1] + 9.5, 0, hc[1] + 12, -8.6, hc[1] + 9.5, -9.3, hc[1] + 1, -7.6, hc[1] - 7.5], true);
    }
    g.fillStyle = fabricGrad(g, C.coat, hc[1] - 11, hc[1] + 12);
    g.fill(hoodP);
    g.strokeStyle = rgba(shade(C.coat, -0.45), 0.4);
    g.lineWidth = lw * 1.3;
    g.beginPath();
    if (side) { g.moveTo(hc[0] + 7.6, hc[1] - 5); g.quadraticCurveTo(hc[0] + 4, hc[1] + 2, hc[0] + 6, hc[1] + 9); }
    else { g.moveTo(0, hc[1] - 10); g.lineTo(0, hc[1] + 11); }
    g.stroke();
    if (side) {
      // the hood rim hides the face; a dark opening edge
      g.fillStyle = "rgba(20,14,6,0.65)";
      g.beginPath();
      g.ellipse(hc[0] + 7.4, hc[1] + 1.5, 1.6, 7, 0.1, 0, TAU);
      g.fill();
    }
    sculptPaths.push(hoodP);
  } else {
    // messy hair (back of head / side), and the bunched hood at the neck
    // hair: a rounded mass built from a few soft locks (crown whorl at the back), shaded as one
    // volume, with fine strand highlights following the growth direction and a soft fringe edge
    const hair = new Path2D();
    const R = rng("hair");
    const pts = [];
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (side ? 0.95 : 1.02) + (i / (n - 1)) * Math.PI * (side ? 1.25 : 0.96);
      const rr = 8.7 + Math.sin(i * 1.9) * 0.25 + R() * 0.2;
      pts.push(hc[0] + Math.cos(a) * rr * (side ? 1.02 : 1.0) - (side ? 0.8 : 0), hc[1] + Math.sin(a) * rr * 1.04);
    }
    if (side) pts.push(hc[0] - 4, hc[1] + 7, hc[0] - 7.6, hc[1] + 5);
    else pts.push(7.2, hc[1] + 5.5, 4.5, hc[1] + 7.6, 0, hc[1] + 8.4, -4.5, hc[1] + 7.6, -7.2, hc[1] + 5.5);
    spline(hair, pts, true, 1);
    const hg = g.createRadialGradient(hc[0] - 2, hc[1] - 5, 0.5, hc[0], hc[1], 11);
    hg.addColorStop(0, shade(C.hair, 0.28));
    hg.addColorStop(0.55, C.hair);
    hg.addColorStop(1, shade(C.hair, -0.42));
    g.fillStyle = hg;
    g.fill(hair);
    // soft fringe: a translucent halo of the same colour instead of a hard cut-out edge
    g.strokeStyle = rgba(C.hair, 0.35);
    g.lineWidth = lw * 1.6;
    g.stroke(hair);
    g.save();
    g.clip(hair);
    // locks: darker partings between rounded clumps radiating from the crown
    const crown = [hc[0] + (side ? -3 : 1.2), hc[1] - 4.5];
    g.strokeStyle = rgba(shade(C.hair, -0.5), 0.22);
    g.lineWidth = lw * 1.4;
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      g.moveTo(crown[0] + Math.cos(a) * 1.2, crown[1] + Math.sin(a) * 1.2);
      g.quadraticCurveTo(crown[0] + Math.cos(a + 0.5) * 5, crown[1] + Math.sin(a + 0.5) * 5, crown[0] + Math.cos(a + 0.8) * 11, crown[1] + Math.sin(a + 0.8) * 12);
    }
    g.stroke();
    // strand highlights on the lit tops of the locks
    g.strokeStyle = rgba(shade(C.hair, 0.5), 0.32);
    g.lineWidth = lw * 0.8;
    g.beginPath();
    for (let i = 0; i < 18; i++) {
      const a = R() * TAU, r0 = 1.5 + R() * 2;
      const sx = crown[0] + Math.cos(a) * r0, sy = crown[1] + Math.sin(a) * r0;
      g.moveTo(sx, sy);
      g.quadraticCurveTo(sx + Math.cos(a + 0.6) * 4, sy + Math.sin(a + 0.6) * 4, sx + Math.cos(a + 0.9) * (6 + R() * 3), sy + Math.sin(a + 0.9) * (6 + R() * 3));
    }
    g.stroke();
    g.restore();
    const hood = new Path2D();
    if (side) spline(hood, [-3, shY - 6, -9.5, shY - 2, -10, shY + 4, -4, shY + 3, 2, shY - 1], true);
    else spline(hood, [-9, shY - 2, 0, shY - 5, 9, shY - 2, 7, shY + 6, 0, shY + 9, -7, shY + 6], true);
    g.fillStyle = fabricGrad(g, C.coat, shY - 6, shY + 9, 0.05);
    g.fill(hood);
    g.strokeStyle = rgba(shade(C.coat, -0.5), 0.45);
    g.lineWidth = lw * 1.2;
    g.stroke(hood);
    sculptPaths.push(hair, hood);
  }
  for (const a of arms) if (!a.far) drawArm(a);

  // silhouette shading + rim light over every part (no internal edges)
  const all = new Path2D();
  for (const p of sculptPaths) all.addPath(p);
  const box = [-25, -110, 25, 2];
  crescent(g, all, L.x * 9, L.y * 9, "#140a02", 0.24, box, "source-over", 3);
  if (L.rim > 0) crescent(g, all, -L.x * 1.8, -L.y * 1.8, L.color, 0.7 * L.rim, box, "lighter", 3);
  g.restore();

  if (o.flashlight) {
    // beam is drawn in screen space from the torch head
    const fa = o.flashAngle == null ? 0.35 : o.flashAngle;
    const ra = arms.find((a) => a.s === 1);
    const hx = x + f * u * (ra.hand[0] + (side ? Math.cos(fa) * 9 : 0)), hy = y + u * (ra.hand[1] + (side ? Math.sin(fa) * 9 : -3));
    const ang = side ? (f === 1 ? fa : Math.PI - fa) : (o.flashAngle == null ? -Math.PI / 2 - 0.1 : o.flashAngle);
    flashlightBeam(g, hx, hy, ang, o.flashLen || h * 3, { spread: 0.34 });
  }
}

// ------------------------------------------------------------------------------------------------
// POV hands. Local space: wrist at origin, fingers point toward -y, 1 unit = size/100.
function finger(g, bx, by, len, wid, ang, curl, C, lw, nails) {
  const segs = [0.45, 0.32, 0.23];
  const pts = [bx, by];
  let x = bx, y = by, a = ang;
  const shrink = [];
  for (let i = 0; i < 3; i++) {
    const bend = curl * (i === 0 ? 0.9 : 1.25);
    const l = len * segs[i] * Math.max(0.18, Math.cos(Math.min(1.45, bend * (i + 1) * 0.6)));
    x += Math.cos(a) * l;
    y += Math.sin(a) * l;
    pts.push(x, y);
    shrink.push(l);
  }
  const p = new Path2D();
  tube(p, pts, [wid, wid * 0.92, wid * 0.82, wid * 0.7], 4, false, true);
  return { p, tip: [x, y], ang: a, pts, curl };
}

export function drawHand(g, x, y, size, opts = {}) {
  if (!(size > 0)) return;
  const o = Object.assign({ pose: "reach" }, opts);
  const skin = o.skin || KID.skin, sh = o.shadow || KID.skinShadow, sleeve = o.sleeve || KID.coat;
  const u = size / 100;
  const ang = o.angle == null ? -Math.PI / 2 : o.angle;
  const t = o.t || 0;
  const mirror = o.left ? -1 : 1;
  const curl = o.pose === "hold" ? 0.95 : o.pose === "point" ? 0.9 : o.pose === "open" ? 0 : o.pose === "cup" ? 0.35 : 0.18;
  const spread = o.pose === "open" ? 0.16 : o.pose === "reach" ? 0.08 : 0.03;
  const lw = clamp(1 / u, 0.2, 0.8);
  let L = { x: -0.4, y: -0.8, color: "#fff1d6", rim: 0 };
  if (o.light) {
    const lx = o.light.x - x, ly = o.light.y - y;
    const l = Math.hypot(lx, ly) || 1;
    L = { x: lx / l, y: ly / l, color: o.light.color || "#fff3d0", rim: clamp(o.light.strength == null ? 1 : o.light.strength, 0, 2) };
  }
  g.save();
  g.translate(x, y);
  g.rotate(ang + Math.PI / 2);
  g.scale(mirror * u, u);
  // local light (undo the rotation)
  const ca = Math.cos(-(ang + Math.PI / 2)), sa = Math.sin(-(ang + Math.PI / 2));
  const Ll = { x: (L.x * ca - L.y * sa) * mirror, y: L.x * sa + L.y * ca, color: L.color, rim: L.rim };

  // sleeve (comes in from behind the wrist, off-frame)
  // a soft fabric tube: it flares a little past the ribbed cuff and wrinkles where the arm bends
  const slv = new Path2D();
  slv.moveTo(-30, 260);
  slv.bezierCurveTo(-31, 160, -27, 70, -27, 34);
  slv.quadraticCurveTo(-27, 14, -23, 12);
  slv.quadraticCurveTo(0, 5, 23, 12);
  slv.quadraticCurveTo(27, 14, 27, 34);
  slv.bezierCurveTo(28, 80, 31, 170, 32, 260);
  slv.closePath();
  const sg = g.createLinearGradient(-30, 0, 32, 0);
  sg.addColorStop(0, shade(sleeve, -0.42));
  sg.addColorStop(0.3, shade(sleeve, -0.05));
  sg.addColorStop(0.5, shade(sleeve, 0.08));
  sg.addColorStop(0.78, sleeve);
  sg.addColorStop(1, shade(sleeve, -0.38));
  g.fillStyle = sg;
  g.fill(slv);
  g.save();
  g.clip(slv);
  // wrinkles: soft diagonal folds (dark trough + lit ridge) bunching above the cuff
  for (let i = 0; i < 6; i++) {
    const y0 = 40 + i * 24 + (i % 2) * 6, sk = (i % 2 ? 1 : -1) * 7;
    g.strokeStyle = rgba(shade(sleeve, -0.5), 0.28);
    g.lineWidth = lw * 4;
    g.beginPath(); g.moveTo(-30, y0 + sk); g.quadraticCurveTo(0, y0 - 6, 31, y0 - sk); g.stroke();
    g.strokeStyle = rgba(shade(sleeve, 0.35), 0.18);
    g.lineWidth = lw * 2.5;
    g.beginPath(); g.moveTo(-30, y0 + sk - 4); g.quadraticCurveTo(0, y0 - 10, 31, y0 - sk - 4); g.stroke();
  }
  // the ribbed cuff band
  const cg = g.createLinearGradient(0, 8, 0, 32);
  cg.addColorStop(0, shade(sleeve, -0.1));
  cg.addColorStop(1, shade(sleeve, -0.32));
  g.fillStyle = cg;
  g.fillRect(-32, 8, 64, 22);
  g.strokeStyle = rgba(shade(sleeve, -0.55), 0.4);
  g.lineWidth = lw * 1.2;
  g.beginPath();
  for (let i = 0; i < 13; i++) { const xx = -28 + i * 4.7; g.moveTo(xx, 11 + Math.abs(xx) * 0.08); g.lineTo(xx + 0.4, 30); }
  g.stroke();
  g.restore();

  // item held behind the fingers
  if (o.item === "poster" || o.item === "photo") drawPaper(g, o.item, t);

  if (o.item === "flashlight") {
    g.save();
    g.translate(-2, -40);
    const fg = g.createLinearGradient(-9, 0, 9, 0);
    fg.addColorStop(0, "#5a5f68");
    fg.addColorStop(0.45, "#d7dce4");
    fg.addColorStop(1, "#4a4e56");
    g.fillStyle = fg;
    g.fillRect(-8, -70, 16, 95);
    g.fillRect(-11, -84, 22, 16);
    g.restore();
  }
  // the hand: back of the hand (dorsum) + fingers + thumb, all one skin gradient
  const skinGrad = g.createLinearGradient(0, 10, 0, -100);
  skinGrad.addColorStop(0, shade(skin, -0.12));
  skinGrad.addColorStop(0.5, skin);
  skinGrad.addColorStop(1, mix(skin, "#f0c4a8", 0.4));
  const hand = new Path2D();
  spline(hand, [-17, 8, -20, -14, -21, -38, -12, -50, 0, -52, 12, -50, 20, -42, 19, -14, 16, 8, 0, 11], true);
  const fingers = [];
  const base = [[-14, -46, 40, 9.6], [-4.5, -50, 45, 10.2], [5, -49, 42, 9.6], [14, -43, 33, 8.6]];
  base.forEach(([bx, by, len, wid], i) => {
    const a = -Math.PI / 2 + (i - 1.5) * spread;
    const c = o.pose === "point" && i === 0 ? 0.05 : curl;
    fingers.push(finger(g, bx, by, len, wid, a, c, skin, lw));
  });
  const thumbCurl = o.pose === "hold" ? 0.7 : 0.2;
  const th = finger(g, -15, -14, 36, 14, -Math.PI / 2 - 0.62 + thumbCurl * 0.5, thumbCurl * 0.5, skin, lw);
  ellipsePath(th.p, -15, -16, 9, 14, -0.35); // thenar mass joins the thumb to the palm
  g.fillStyle = skinGrad;
  g.fill(th.p);
  g.fill(hand);
  for (const fi of fingers) g.fill(fi.p);
  // knuckles, tendons, creases, nails
  g.strokeStyle = rgba(sh, 0.35);
  g.lineWidth = lw * 1.3;
  g.beginPath();
  for (const fi of fingers) {
    const [ax, ay, bx2, by2] = fi.pts;
    g.moveTo(ax - 3, ay + 1);
    g.quadraticCurveTo(ax, ay - 1.5, ax + 3, ay + 1);
    const mx = fi.pts[2], my = fi.pts[3];
    g.moveTo(mx - 2.5, my + 0.5);
    g.quadraticCurveTo(mx, my - 1, mx + 2.5, my + 0.5);
  }
  g.stroke();
  g.strokeStyle = rgba("#fff0e0", 0.1);
  g.lineWidth = lw * 2.5;
  g.beginPath();
  for (const fi of fingers) { g.moveTo(fi.pts[0] * 0.4, -10); g.lineTo(fi.pts[0], fi.pts[1] + 4); }
  g.stroke();
  for (const fi of fingers.concat([th])) {
    if (fi.curl > 0.8 && fi !== th) continue;
    const [tx, ty] = fi.tip;
    g.save();
    g.translate(tx, ty);
    g.rotate(fi.ang + Math.PI / 2);
    g.fillStyle = mix(skin, "#ffe4dc", 0.55);
    g.beginPath();
    g.ellipse(0, 3.2, 3, 3.6, 0, 0, TAU);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(-1.6, 1, 1, 3);
    g.restore();
  }
  const all = new Path2D();
  all.addPath(hand);
  all.addPath(th.p);
  for (const fi of fingers) all.addPath(fi.p);
  crescent(g, all, Ll.x * 7, Ll.y * 7, "#3a1a0a", 0.3, [-45, -110, 45, 15], "source-over", 3);
  if (Ll.rim > 0) crescent(g, all, -Ll.x * 2.2, -Ll.y * 2.2, Ll.color, 0.75 * Ll.rim, [-45, -110, 45, 15], "lighter", 3);

  // bell on a red string round the wrist (FILMS.md: from f01 on)
  if (o.bell) {
    g.strokeStyle = "#a8322e";
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(-21, 6);
    g.quadraticCurveTo(0, 13, 21, 6);
    g.stroke();
    const bx = 2, by = 17 + Math.sin(t * 3) * 0.8;
    const bg = g.createRadialGradient(bx - 2, by - 2, 0.3, bx, by, 6);
    bg.addColorStop(0, "#fff2c0");
    bg.addColorStop(0.35, "#e3b452");
    bg.addColorStop(1, "#6a4510");
    g.fillStyle = bg;
    g.beginPath();
    g.arc(bx, by, 5.4, 0, TAU);
    g.fill();
    g.strokeStyle = "rgba(40,22,4,0.9)";
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(bx - 4, by + 0.8); g.lineTo(bx + 4, by + 0.8);
    g.moveTo(bx, by + 0.8); g.lineTo(bx, by + 4.6);
    g.stroke();
  }
  if (o.item === "bell") {
    const bg = g.createRadialGradient(-2, -40, 1, 0, -36, 14);
    bg.addColorStop(0, "#fff2c0");
    bg.addColorStop(0.35, "#e3b452");
    bg.addColorStop(1, "#5a3a10");
    g.fillStyle = bg;
    g.beginPath();
    g.arc(0, -36, 12, 0, TAU);
    g.fill();
    g.strokeStyle = "rgba(40,22,4,0.9)";
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-9, -34); g.lineTo(9, -34);
    g.moveTo(0, -34); g.lineTo(0, -26);
    g.stroke();
  }
  g.restore();
  if (o.item === "flashlight") {
    const len = size * 4;
    const tx = x + Math.cos(ang) * size * 1.32, ty = y + Math.sin(ang) * size * 1.32;
    flashlightBeam(g, tx, ty, ang, len, { spread: 0.36 });
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
