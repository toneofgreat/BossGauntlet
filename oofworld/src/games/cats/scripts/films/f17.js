// films/f17.js - Chapter 17 "Brave" (FILMS.md f17). The gates of The End Of Cats: a high-key white plain,
// slow snow, an enormous carved gate rising into cloud. A tiny gatekeeper in a party hat; a warm memory of a
// dark hallway and a cat who always walked ahead and waited; the bell rings; you push the gate yourself.
// draw(g, t, W, H) is a pure function of t; the gate stonework is painted once into cached sprites.
import * as K from "../filmkit.js";

const D = 70;
const TAU = Math.PI * 2;
const FOG = "#eef0ff";

// ---- utilities ------------------------------------------------------------------------------------------
function inLayer(g, W, H, key, fn) {
  const L = K.layer(W, H, key);
  L.g.setTransform(g.getTransform());
  fn(L.g);
  return L;
}
function put(g, W, H, L, alpha = 1, blur = 0, mode) {
  if (alpha <= 0.002) return;
  g.save();
  const px = K.pixelScale();
  g.setTransform(px, 0, 0, px, 0, 0);
  if (mode) g.globalCompositeOperation = mode;
  if (blur > 0.3) K.dof(g, L.canvas, blur, alpha);
  else { g.globalAlpha *= alpha; g.drawImage(L.canvas, 0, 0, W, H); }
  g.restore();
}
function xfade(g, W, H, a, key, fn) {
  if (a <= 0.002) return;
  if (a >= 0.998) { fn(g); return; }
  const L = K.layer(W, H, key);
  fn(L.g);
  g.save();
  g.globalAlpha *= a;
  g.drawImage(L.canvas, 0, 0, W, H);
  g.restore();
}
// drawCat costs ~3 ms, so small or still cats are painted once per gait step into cached sprites.
function cachedCat(g, x, y, size, o, key, steps = 8) {
  const q = Math.floor(((((o.phase || 0) % 1) + 1) % 1) * steps);
  const SC = 2, SW = size * 3.6, SH = size * 2.6, ox = SW / 2, oy = SH * 0.86;
  const spr = K.sprite("f17cat:" + key + ":" + q + ":" + size, SW * SC, SH * SC, (s) => {
    s.scale(SC, SC);
    const oo = Object.assign({}, o, { phase: q / steps, t: (q / steps) * 2.3, alpha: undefined });
    if (o.light) oo.light = { x: ox + (o.light.x - x), y: oy + (o.light.y - y), color: o.light.color, strength: o.light.strength };
    K.drawCat(s, ox, oy, size, oo);
    if (o.ruff) ruff(s, ox, oy, size, o.facing || 1, o.pose, o.headTilt || 0);
  });
  if (!g) return spr;
  g.save();
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  if (o.blend) g.globalCompositeOperation = o.blend;
  const sx = o.sx || 1;
  g.drawImage(spr, x - ox * sx, y - oy, SW * sx, SH);
  g.restore();
  return spr;
}

// ---- Sir Whiskers (from f16: translucent, old, orange striped, long white ruff) ---------------------------
const OLD = { base: "#d9995a", light: "#f2c890", dark: "#a8683a", stripe: "#8a4a1c", tip: "#7a3a10", belly: "#f6e6cc", white: "#fbf6ee", bib: true, socks: "all", muzzle: true, stripeAlpha: 0.55, iris: "#c8b04a", irisInner: "#f0d27a", bentEar: false };
function ruff(g, x, y, S, f, pose, tilt) {
  const sit = pose === "sit";
  const hx = x + f * S * (sit ? 0.26 : 0.84), hy = y - S * (sit ? 1.5 : 1.32) - (tilt || 0) * S * 0.08;
  const cx = hx - f * S * 0.08, cy = hy + S * 0.24;
  const R = K.rng("ruff");
  g.save();
  g.lineCap = "round";
  for (let pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass ? "rgba(255,252,244,0.9)" : "rgba(200,190,175,0.7)";
    g.lineWidth = Math.max(0.6, S * (pass ? 0.012 : 0.02));
    g.beginPath();
    for (let i = 0; i < 110; i++) {
      const u = R(), v = R();
      const a = Math.PI * (0.1 + u * 0.8);
      const r0 = S * 0.16 * v;
      const sx = cx + Math.cos(a) * r0 * 1.7 - f * S * 0.05, sy = cy + Math.sin(a) * r0;
      const len = S * (0.24 + R() * 0.3) * (1 - Math.abs(u - 0.5) * 0.8);
      g.moveTo(sx, sy);
      g.quadraticCurveTo(sx + (u - 0.5) * S * 0.12, sy + len * 0.6, sx + (u - 0.5) * S * 0.08 - f * S * 0.03, sy + len);
    }
    g.stroke();
  }
  g.restore();
}
function sirWhiskers(g, x, y, size, o, key) {
  const a = o.alpha == null ? 1 : o.alpha;
  const sx = o.sx || 1;
  K.glow(g, x + (o.facing || 1) * size * 0.3 * sx, y - size * 0.9, size * 2.0, "#bcd6ff", 0.3 * a);
  const opts = Object.assign({ coat: OLD, collar: false, bell: false, shadow: false, blink: 0.45, ruff: true, light: { x: x - 200, y: y - 300, color: "#bcd6ff", strength: 1.6 } }, o);
  // translucent spirit: on this high-key snow a pure screen blend would vanish, so a soft-light pass gives
  // him colour and a 0.5 normal pass gives him form
  cachedCat(g, x, y, size, Object.assign({}, opts, { alpha: 0.35 * a, blend: "soft-light" }), key, o.steps || 8);
  const spr = cachedCat(g, x, y, size, Object.assign({}, opts, { alpha: 0.5 * a }), key, o.steps || 8);
  // the cold #bcd6ff edge glow: a blurred additive copy of the same sprite
  if (spr && K.hasFilter()) {
    const SW = size * 3.6, SH = size * 2.6, ox = SW / 2, oy = SH * 0.86;
    g.save();
    g.filter = "blur(5px)";
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.28 * a;
    g.drawImage(spr, x - ox * sx, y - oy, SW * sx, SH);
    g.restore();
  }
}

// ---- snow -----------------------------------------------------------------------------------------------
function snow(g, W, H, t, o = {}) {
  const n = o.count || 120, seed = o.seed || 1, sp = o.speed || 30, size = o.size || 1.6, drift = o.drift == null ? 14 : o.drift;
  const wind = o.wind == null ? 6 : o.wind;
  const a0 = o.alpha == null ? 0.9 : o.alpha;
  g.save();
  g.fillStyle = o.color || "#ffffff";
  for (let i = 0; i < n; i++) {
    const r1 = K.hash(i, seed), r2 = K.hash(i + 0.5, seed), r3 = K.hash(i + 0.25, seed);
    const v = sp * (0.6 + r3 * 0.8);
    const span = H + 40;
    const y = ((r2 * span + t * v) % span) - 20;
    let x = r1 * (W + 80) - 40 + Math.sin(t * (0.4 + r3 * 0.6) + i) * drift + t * wind;
    x = ((x + 40) % (W + 80) + (W + 80)) % (W + 80) - 40;
    const s = size * (0.6 + r3 * 0.8);
    g.globalAlpha = a0 * (0.5 + r3 * 0.5);
    if (o.soft) K.glow(g, x, y, s * 3, "#ffffff", a0 * (0.4 + r3 * 0.4), "source-over");
    else { g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill(); }
  }
  g.restore();
}

// ---- the gate (static stonework in sprites) ---------------------------------------------------------------
const GW = 640, GH = 900, GSC = 1.5;
// snow-capped ledges carved into the gate frame, in gate-sprite units: [x, y, width]
const LEDGES = (() => {
  const out = [];
  for (const x0 of [0, 520]) {
    out.push([x0 - 12, 150, 144]);
    for (let k = 0; k < 6; k++) out.push([x0 + 18, 270 + k * 102 + 24, 84]);
  }
  out.push([120, 190, 400]);
  return out;
})();
function catGlyph(p, x, y, s) {
  // a smooth sitting-cat silhouette, used for the carvings
  p.moveTo(x - 0.05 * s, y - 0.62 * s);
  p.lineTo(x - 0.16 * s, y - 0.86 * s);
  p.lineTo(x - 0.2 * s, y - 0.6 * s);
  p.bezierCurveTo(x - 0.3 * s, y - 0.52 * s, x - 0.3 * s, y - 0.38 * s, x - 0.2 * s, y - 0.32 * s);
  p.bezierCurveTo(x - 0.42 * s, y - 0.15 * s, x - 0.42 * s, y + 0.18 * s, x - 0.3 * s, y + 0.3 * s);
  p.lineTo(x + 0.28 * s, y + 0.3 * s);
  p.bezierCurveTo(x + 0.5 * s, y + 0.3 * s, x + 0.55 * s, y + 0.05 * s, x + 0.42 * s, y - 0.05 * s);
  p.bezierCurveTo(x + 0.5 * s, y + 0.12 * s, x + 0.42 * s, y + 0.22 * s, x + 0.3 * s, y + 0.18 * s);
  p.bezierCurveTo(x + 0.32 * s, y - 0.1 * s, x + 0.25 * s, y - 0.25 * s, x + 0.12 * s, y - 0.32 * s);
  p.bezierCurveTo(x + 0.24 * s, y - 0.38 * s, x + 0.24 * s, y - 0.52 * s, x + 0.16 * s, y - 0.6 * s);
  p.lineTo(x + 0.14 * s, y - 0.86 * s);
  p.lineTo(x + 0.04 * s, y - 0.64 * s);
  p.closePath();
}
function relief(g, path, base, k = 1) {
  // carved relief lit softly from the upper left (diffuse, low contrast)
  g.save();
  g.translate(-1.6 * k, -1.6 * k);
  g.fillStyle = "rgba(255,255,255,0.7)";
  g.fill(path);
  g.restore();
  g.save();
  g.translate(2 * k, 2.2 * k);
  g.fillStyle = "rgba(150,154,196,0.55)";
  g.fill(path);
  g.restore();
  g.fillStyle = base;
  g.fill(path);
}
function snowCap(g, x, y, w, h) {
  const R = K.rng("cap" + Math.round(x) + ":" + Math.round(y));
  g.fillStyle = "#fbfbff";
  g.beginPath();
  g.moveTo(x - 2, y + 1);
  for (let i = 0; i <= 8; i++) g.lineTo(x + (w * i) / 8, y - h * (0.4 + R() * 0.6));
  g.lineTo(x + w + 2, y + 1);
  for (let i = 8; i >= 0; i--) g.lineTo(x + (w * i) / 8, y + h * 0.15 + R() * h * 0.5);
  g.closePath();
  g.fill();
}
function stone(g, x, y, w, h, c0, c1) {
  const sg = g.createLinearGradient(x, 0, x + w, 0);
  sg.addColorStop(0, c0);
  sg.addColorStop(1, c1);
  g.fillStyle = sg;
  g.fillRect(x, y, w, h);
}
function gateFrameSprite() {
  return K.sprite("f17:gateframe", GW * GSC, GH * GSC, (g) => {
    g.scale(GSC, GSC);
    const P = 120;
    for (const [x0, light] of [[0, true], [GW - P, false]]) {
      stone(g, x0, 120, P, GH - 120, light ? "#f2f3fd" : "#e2e4f6", light ? "#d6d9f0" : "#c8cbe6");
      // plinth and capital bands
      stone(g, x0 - 10, GH - 70, P + 20, 70, "#eef0fc", "#cfd2ea");
      stone(g, x0 - 12, 150, P + 24, 34, "#f6f7ff", "#d2d5ee");
      snowCap(g, x0 - 12, 150, P + 24, 9);
      snowCap(g, x0 - 10, GH - 70, P + 20, 7);
      // stacked cat carvings
      for (let k = 0; k < 6; k++) {
        const cy = 270 + k * 102;
        const p = new Path2D();
        catGlyph(p, x0 + P / 2, cy, 70);
        relief(g, p, light ? "#e8eafa" : "#d8dbf0");
        // little ledge under each with snow
        stone(g, x0 + 18, cy + 24, P - 36, 6, "#f4f5ff", "#d0d3ea");
        snowCap(g, x0 + 18, cy + 24, P - 36, 5);
      }
      // cat-ear finials on the pillar tops
      g.fillStyle = light ? "#eceefb" : "#d4d7ee";
      g.beginPath();
      g.moveTo(x0 + 10, 150); g.lineTo(x0 + 34, 70); g.lineTo(x0 + 58, 150); g.closePath();
      g.moveTo(x0 + 62, 150); g.lineTo(x0 + 86, 70); g.lineTo(x0 + 110, 150); g.closePath();
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.9)";
      g.beginPath(); g.moveTo(x0 + 26, 100); g.lineTo(x0 + 34, 70); g.lineTo(x0 + 42, 100); g.closePath(); g.moveTo(x0 + 78, 100); g.lineTo(x0 + 86, 70); g.lineTo(x0 + 94, 100); g.closePath(); g.fill();
    }
    // the arch between the pillars
    g.fillStyle = "#e4e6f8";
    g.beginPath();
    g.moveTo(P, 300); g.lineTo(P, 190); g.lineTo(GW - P, 190); g.lineTo(GW - P, 300);
    g.quadraticCurveTo(GW / 2, 230, P, 300);
    g.closePath();
    g.fill();
    const ag = g.createLinearGradient(0, 190, 0, 300);
    ag.addColorStop(0, "rgba(255,255,255,0.5)"); ag.addColorStop(1, "rgba(160,164,204,0.35)");
    g.fillStyle = ag; g.fill();
    // a great carved cat face at the keystone
    const face = new Path2D();
    face.ellipse(GW / 2, 236, 46, 34, 0, 0, TAU);
    face.moveTo(GW / 2 - 40, 222); face.lineTo(GW / 2 - 34, 182); face.lineTo(GW / 2 - 12, 206); face.closePath();
    face.moveTo(GW / 2 + 40, 222); face.lineTo(GW / 2 + 34, 182); face.lineTo(GW / 2 + 12, 206); face.closePath();
    relief(g, face, "#eceefc", 1.4);
    g.strokeStyle = "rgba(140,144,190,0.6)"; g.lineWidth = 2; g.lineCap = "round";
    g.beginPath();
    g.moveTo(GW / 2 - 22, 232); g.quadraticCurveTo(GW / 2 - 14, 226, GW / 2 - 6, 232);
    g.moveTo(GW / 2 + 6, 232); g.quadraticCurveTo(GW / 2 + 14, 226, GW / 2 + 22, 232);
    g.moveTo(GW / 2, 244); g.lineTo(GW / 2, 252); g.moveTo(GW / 2 - 10, 256); g.quadraticCurveTo(GW / 2, 262, GW / 2 + 10, 256);
    for (const sd of [-1, 1]) { g.moveTo(GW / 2 + sd * 20, 250); g.lineTo(GW / 2 + sd * 60, 244); g.moveTo(GW / 2 + sd * 20, 254); g.lineTo(GW / 2 + sd * 60, 258); }
    g.stroke();
    snowCap(g, P, 190, GW - 2 * P, 10);
    // the lintel above, rising into cloud
    stone(g, 0, 0, GW, 120, "#f2f3fd", "#d8dbf0");
    for (let k = 0; k < 7; k++) {
      const p = new Path2D();
      catGlyph(p, 60 + k * 87, 96, 54);
      relief(g, p, "#e8eafa");
    }
    snowCap(g, 0, 120, GW, 8);
  });
}
function doorSprite(side) {
  const w = 200, h = 600;
  return K.sprite("f17:door" + side, w * GSC, h * GSC, (g) => {
    g.scale(GSC, GSC);
    stone(g, 0, 0, w, h, side < 0 ? "#eceefb" : "#dfe2f5", side < 0 ? "#d9dcf1" : "#cdd0ea");
    // moulded panels
    g.strokeStyle = "rgba(255,255,255,0.75)"; g.lineWidth = 3;
    g.strokeRect(18, 18, w - 36, h * 0.28);
    g.strokeRect(18, h * 0.34, w - 36, h * 0.62);
    g.strokeStyle = "rgba(150,154,196,0.55)"; g.lineWidth = 2;
    g.strokeRect(21, 21, w - 36, h * 0.28);
    g.strokeRect(21, h * 0.34 + 3, w - 36, h * 0.62);
    // a big carved cat on each leaf, facing the middle
    const p = new Path2D();
    g.save();
    if (side > 0) { g.translate(w, 0); g.scale(-1, 1); }
    catGlyph(p, w * 0.5, h * 0.62, 190);
    relief(g, p, "#e6e8f8", 1.6);
    const p2 = new Path2D();
    for (let k = 0; k < 3; k++) { p2.moveTo(w * 0.32 + k * 34 + 8, h * 0.17); p2.arc(w * 0.32 + k * 34, h * 0.17, 8, 0, TAU); }
    p2.moveTo(w * 0.5 + 18, h * 0.24); p2.ellipse(w * 0.5, h * 0.24, 18, 13, 0, 0, TAU);
    relief(g, p2, "#eaecfa");
    g.restore();
    snowCap(g, 18, 18, w - 36, 5);
    snowCap(g, 18, h * 0.34, w - 36, 5);
    // iron ring
    g.strokeStyle = "#8a8ca8"; g.lineWidth = 4;
    g.beginPath(); g.arc(side < 0 ? w - 26 : 26, h * 0.5, 13, 0, TAU); g.stroke();
  });
}
// draw the gate: (cx, baseY) bottom centre, scale s, open 0..1 (inward swing), haze 0..1 toward the sky
function gate(g, cx, baseY, s, o = {}) {
  const open = K.clamp(o.open || 0);
  const x0 = cx - (GW / 2) * s, y0 = baseY - GH * s;
  g.save();
  g.globalAlpha *= 1 - (o.haze || 0);
  // light behind the doors
  const dx0 = cx - 200 * s, dy0 = baseY - 600 * s;
  if (open > 0) {
    const lg = g.createLinearGradient(dx0, 0, dx0 + 400 * s, 0);
    lg.addColorStop(0, "#fff3e0"); lg.addColorStop(0.5, "#ffffff"); lg.addColorStop(1, "#fff3e0");
    g.fillStyle = lg;
    g.fillRect(dx0, dy0, 400 * s, 600 * s);
  } else {
    g.fillStyle = "#c8cbe6";
    g.fillRect(dx0, dy0, 400 * s, 600 * s);
  }
  // door leaves swing inward: they narrow toward their hinges
  const leafW = 200 * s * (1 - open * 0.88);
  g.drawImage(doorSprite(-1), dx0, dy0, leafW, 600 * s);
  g.drawImage(doorSprite(1), cx + 200 * s - leafW, dy0, leafW, 600 * s);
  if (open > 0 && open < 0.3) {
    // the crack: brilliant light from the seam
    K.glow(g, cx, baseY - 300 * s, 240 * s * (0.4 + open * 3), "#fff6e0", 0.8);
  }
  g.drawImage(gateFrameSprite(), x0, y0, GW * s, GH * s);
  g.restore();
}

// ---- landscape ------------------------------------------------------------------------------------------
function whiteSky(g, W, H, hz) {
  const sg = g.createLinearGradient(0, -100, 0, hz);
  sg.addColorStop(0, "#c4c8f0");
  sg.addColorStop(0.5, "#d8dcff");
  sg.addColorStop(1, FOG);
  g.fillStyle = sg;
  g.fillRect(-W, -H, W * 3, hz + H + 2);
}
function snowField(g, W, H, hz, t) {
  const fg = g.createLinearGradient(0, hz, 0, H + 60);
  fg.addColorStop(0, "#eceefc");
  fg.addColorStop(0.4, "#f4f5ff");
  fg.addColorStop(1, "#e2e4f6");
  g.fillStyle = fg;
  g.fillRect(-W, hz, W * 3, H * 2);
  // soft drifts (very low contrast)
  for (let k = 0; k < 4; k++) {
    const y = hz + 18 + k * k * 22;
    g.fillStyle = K.rgba(k % 2 ? "#dcdff4" : "#ffffff", 0.45);
    g.beginPath();
    g.moveTo(-W, y + 30);
    for (let x = -W; x <= W * 2; x += 60) g.lineTo(x, y + Math.sin(x * 0.006 + k * 1.7) * (6 + k * 3));
    g.lineTo(W * 2, y + 60);
    g.closePath();
    g.fill();
  }
  // glints in the snow
  for (let i = 0; i < 40; i++) {
    const x = K.hash(i, 77) * W, y = hz + 10 + K.hash(i + 0.5, 77) * (H - hz);
    const tw = Math.max(0, Math.sin(t * 2 + i * 1.7));
    if (tw > 0.6) { g.fillStyle = `rgba(255,255,255,${(tw - 0.6) * 2})`; g.fillRect(x, y, 1.5, 1.5); }
  }
}

// ---- the kid: hands forward on the door (drawPerson has no push pose, so arms are added) -------------------
function kidPush(g, x, y, h, t, push, o = {}) {
  // contact shadow in the snow
  const cs = g.createRadialGradient(x, y, 0, x, y, h * 0.22);
  cs.addColorStop(0, "rgba(150,154,200,0.55)"); cs.addColorStop(1, "rgba(150,154,200,0)");
  g.save(); g.translate(x, y); g.scale(1, 0.16); g.translate(-x, -y); g.fillStyle = cs; g.beginPath(); g.arc(x, y, h * 0.22, 0, TAU); g.fill(); g.restore();
  // body leans ~15 degrees into the door (seen from behind: the upper body tips forward, i.e. foreshortens
  // and drops); the right leg is planted back toward us with the knee bent
  const lean = push * 0.26;
  g.save();
  g.beginPath();
  g.rect(x - h * 0.117, y - h * 1.2, h * 0.234, h * 1.25);
  g.clip();
  g.translate(x, y - h * 0.5); g.scale(1, 1 - lean * 0.22); g.translate(-x, -(y - h * 0.5));
  K.drawPerson(g, x, y, h, { view: "back", t, hood: true, shadow: false, light: o.light, bell: true, crouch: 0.1 * push });
  g.restore();
  if (push > 0.05) {
    // the back leg: thigh angled toward camera, bent knee, boot heel lifted
    const hip = [x + h * 0.045, y - h * 0.47], knee = [x + h * 0.075, y - h * 0.2], heel = [x + h * 0.09, y + h * 0.035];
    const lp = new Path2D();
    K.tube(lp, [hip[0], hip[1], knee[0], knee[1], heel[0], heel[1] - h * 0.04], [h * 0.07, h * 0.06, h * 0.05], 4, true, true);
    g.globalAlpha = push;
    g.fillStyle = "#2b3448"; g.fill(lp);
    g.fillStyle = "#a8322e";
    g.beginPath(); g.ellipse(heel[0], heel[1] - h * 0.02, h * 0.045, h * 0.038, 0.2, 0, TAU); g.fill();
    g.globalAlpha = 1;
  }
  const strain = Math.sin(t * 7) * h * 0.002 * push;
  for (const s of [-1, 1]) {
    // arms reach forward-and-up to the door: nearly straight, hands above the shoulders and wider
    const shp = [x + s * h * 0.095, y - h * 0.775];
    const hd = [x + s * h * (0.13 + 0.01 * push), y - h * (0.8 + 0.06 * push) + strain];
    const el = [x + s * h * (0.165 + 0.01 * push), y - h * (0.745 - 0.01 * push)];
    const p = new Path2D();
    K.tube(p, [shp[0], shp[1], el[0], el[1], hd[0], hd[1]], [h * 0.1, h * 0.088, h * 0.075], 5, true, false);
    const ag = g.createLinearGradient(x + s * h * 0.06, 0, x + s * h * 0.22, 0);
    ag.addColorStop(0, "#a07810"); ag.addColorStop(0.45, "#e8b923"); ag.addColorStop(1, "#b88a12");
    g.fillStyle = ag;
    g.fill(p);
    // cuff, then the back of the hand pressed flat on the stone, fingers spread upward
    g.fillStyle = "#c9971a";
    g.beginPath(); g.ellipse(hd[0], hd[1], h * 0.034, h * 0.022, 0, 0, TAU); g.fill();
    const hg = g.createLinearGradient(0, hd[1], 0, hd[1] - h * 0.08);
    hg.addColorStop(0, "#b87c5a"); hg.addColorStop(1, "#e0ac85");
    g.fillStyle = hg;
    g.beginPath(); g.ellipse(hd[0] + s * h * 0.004, hd[1] - h * 0.03, h * 0.028, h * 0.033, s * 0.15, 0, TAU); g.fill();
    g.strokeStyle = hg; g.lineCap = "round"; g.lineWidth = h * 0.012;
    g.beginPath();
    for (let fi = 0; fi < 4; fi++) { const fx = hd[0] + s * h * 0.004 + (fi - 1.5) * h * 0.012; g.moveTo(fx, hd[1] - h * 0.05); g.lineTo(fx + (fi - 1.5) * h * 0.006, hd[1] - h * 0.085); }
    g.stroke();
    g.strokeStyle = "rgba(120,70,40,0.35)"; g.lineWidth = h * 0.003;
    g.beginPath(); for (let fi = 0; fi < 4; fi++) { const fx = hd[0] + s * h * 0.004 + (fi - 1.5) * h * 0.012; g.moveTo(fx, hd[1] - h * 0.045); g.lineTo(fx + 0.5, hd[1] - h * 0.052); } g.stroke();
    if (s < 0) {
      // the bell on your left wrist
      g.strokeStyle = "#a8322e"; g.lineWidth = Math.max(1, h * 0.006);
      g.beginPath(); g.moveTo(hd[0] - h * 0.035, hd[1] + h * 0.012); g.lineTo(hd[0] + h * 0.035, hd[1] + h * 0.012); g.stroke();
      K.drawBell(g, hd[0], hd[1] + h * 0.03, h * 0.022, { t, glint: 0.4 });
    }
  }
}
function footprints(g, pts) {
  for (const [x, y, s] of pts) {
    g.fillStyle = "rgba(170,174,214,0.35)";
    g.beginPath(); g.ellipse(x, y, s, s * 0.35, 0, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,0.6)";
    g.beginPath(); g.ellipse(x, y - s * 0.2, s * 0.9, s * 0.18, 0, Math.PI, TAU); g.fill();
  }
}

// ---- shots ----------------------------------------------------------------------------------------------
function shotPlain(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 0, 12.6));
  K.withCamera(g, W, H, { x: 480, y: K.lerp(285, 270, p), zoom: K.lerp(1.0, 1.07, p), shakeT: t, shakeAmt: 0.9 }, () => {
    const hz = 352;
    whiteSky(g, W, H, hz);
    K.clouds(g, W, H, t, { seed: 17, color: "#ffffff", shade: "#c8cbea", count: 7, y: 40, spread: 60, speed: 3, scale: 1.4, alpha: 0.75 });
    snow(g, W, H, t, { count: 160, seed: 3, speed: 9, size: 0.7, alpha: 0.7, drift: 6, wind: 2 });
    // the gate, far away and enormous, faded by the snow air
    gate(g, 480, hz + 4, 0.96, { haze: 0.36 });
    // it rises past the top of the frame into cloud (top ~30% dissolves into #eef0ff)
    const cg = g.createLinearGradient(0, -60, 0, 200);
    cg.addColorStop(0, "rgba(238,240,255,1)"); cg.addColorStop(0.45, "rgba(238,240,255,0.85)"); cg.addColorStop(1, "rgba(238,240,255,0)");
    g.fillStyle = cg; g.fillRect(-W, -100, W * 3, 300);
    K.clouds(g, W, H, t + 20, { seed: 4, color: "#f8f8ff", shade: "#d4d7f0", count: 5, y: 60, spread: 30, speed: 5, scale: 1.2, alpha: 0.9 });
    K.fog(g, W, H, { y: hz, h: 90, color: FOG, alpha: 0.85, t, seed: 3 });
    snowField(g, W, H, hz, t);
    // drifts with a subtle blue shadow on their lee side
    for (let k = 0; k < 5; k++) {
      const dx = 80 + k * 210 + Math.sin(k * 2.3) * 40, dy = hz + 60 + (k % 3) * 46, dw = 150 + (k % 2) * 90;
      const dg = g.createLinearGradient(0, dy - 12, 0, dy + 10);
      dg.addColorStop(0, "rgba(255,255,255,0.9)"); dg.addColorStop(0.55, "rgba(236,238,255,0.6)"); dg.addColorStop(1, "rgba(176,184,230,0.45)");
      g.fillStyle = dg;
      g.beginPath(); g.moveTo(dx - dw / 2, dy + 8); g.quadraticCurveTo(dx - dw * 0.1, dy - 16, dx + dw / 2, dy + 8); g.closePath(); g.fill();
    }
    // the two of you, small against it, walking toward it (from behind)
    const wp = K.seg(t, 0, 12.6);
    const ky = K.lerp(470, 432, wp), kh = K.lerp(58, 46, wp);
    const kx = K.lerp(430, 452, wp);
    // a long footprint trail back toward the camera
    const prints = [];
    for (let i = 0; i < 26; i++) { const u = i / 26; const yy = K.lerp(600, ky + 3, Math.pow(u, 0.7)); if (yy > ky + 2) prints.push([K.lerp(kx - 60, kx, u) + (i % 2 ? 4 : -4) * K.lerp(2.2, 0.5, u), yy, K.lerp(9, 2.2, u)]); }
    footprints(g, prints);
    K.drawPerson(g, kx, ky, kh, { view: "back", walk: true, phase: t * 0.75, t, hood: true, bell: true, light: { x: 480, y: 150, color: "#ffffff", strength: 0.6 } });
    // Sir Whiskers walks beside you, away from camera (foreshortened 3/4 view), a translucent spirit
    const sx = kx + kh * 0.4, sy = ky + 1;
    sirWhiskers(g, sx, sy, kh * 0.42, { pose: "walk", phase: t * 0.6, facing: 1, headTurn: -0.85, sx: 0.5 }, "plain");
    snow(g, W, H, t, { count: 90, seed: 9, speed: 26, size: 1.6, alpha: 0.95, drift: 14, wind: 4 });
  });
  snow(g, W, H, t, { count: 10, seed: 21, speed: 60, size: 4, alpha: 0.5, soft: true, drift: 30, wind: 8 });
}
function partyHat(g, x, y, s, tilt) {
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  const h = s * 0.62, w = s * 0.36;
  const hg = g.createLinearGradient(-w / 2, 0, w / 2, 0);
  hg.addColorStop(0, "#d84a9a"); hg.addColorStop(0.45, "#ff8ad0"); hg.addColorStop(1, "#b0306e");
  g.fillStyle = hg;
  g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(0, -h); g.lineTo(w / 2, 0); g.quadraticCurveTo(0, w * 0.18, -w / 2, 0); g.fill();
  g.save(); g.clip();
  g.strokeStyle = "#7af7ff"; g.lineWidth = s * 0.05;
  for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(-w, -h * 0.2 - k * h * 0.22); g.lineTo(w, -h * 0.05 - k * h * 0.22); g.stroke(); }
  g.restore();
  g.fillStyle = "#fff27a";
  g.beginPath(); g.arc(0, -h, s * 0.07, 0, TAU); g.fill();
  g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(-w / 2, 0); g.quadraticCurveTo(-w * 0.2, s * 0.35, 0, s * 0.4); g.stroke();
  g.restore();
}
function shotKeeper(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 12, 20));
  const pin = K.ease.inOut(K.seg(t, 14.6, 15.8)) * (1 - K.ease.inOut(K.seg(t, 18.6, 19.6)));
  K.withCamera(g, W, H, { x: K.lerp(480, 520, pin), y: K.lerp(K.lerp(300, 290, p), 400, pin), zoom: K.lerp(K.lerp(1.0, 1.06, p), 1.8, pin), shakeT: t, shakeAmt: 1 }, () => {
    const hz = 430;
    whiteSky(g, W, H, 470);
    gate(g, 480, hz + 30, 1.06, { haze: 0.12 });
    K.fog(g, W, H, { y: hz + 10, h: 80, color: FOG, alpha: 0.55, t, seed: 5 });
    snowField(g, W, H, hz + 20, t);
    snow(g, W, H, t, { count: 120, seed: 4, speed: 16, size: 1, alpha: 0.75, drift: 10 });
    // the gatekeeper
    const cx = 470, cy = 470, S = 64;
    const sees = K.smooth(K.seg(t, 15.4, 16.2));
    const yawn = K.env(t, 16.6, 18.2, 0.35, 0.5);
    const leave = K.seg(t, 18.7, 20.6);
    K.glow(g, cx, cy - 40, 120, "#ffffff", 0.3);
    if (t < 18.7) {
      K.drawCat(g, cx, cy, S, {
        pose: "sit", facing: 1, coat: K.COATS.tuxedo, t, headTurn: K.lerp(0.25, 1, sees), headTilt: 0.35 * (1 - sees) + yawn * 0.4,
        mouth: yawn, blink: Math.max(yawn, K.env(t, 13.8, 14.1, 0.08, 0.1)), collar: false, light: { x: 300, y: 100, color: "#ffffff", strength: 0.8 }, ground: "#7a7eb0",
      });
      const hx = cx + S * K.lerp(0.18, 0.26, sees), hy = cy - S * (1.86 + 0.06 * (0.35 * (1 - sees) + yawn * 0.4));
      partyHat(g, hx + S * 0.02, hy + S * 0.06, S * 0.62, 0.18 - sees * 0.1 - yawn * 0.12);
    } else {
      const x = K.lerp(cx, cx - 360, K.ease.in(leave));
      cachedCat(g, x, cy, S, { pose: "walk", phase: t * 1.2, facing: -1, coat: K.COATS.tuxedo, collar: false, headTurn: 0.25, light: { x: x - 170, y: 100, color: "#ffffff", strength: 0.8 }, ground: "#7a7eb0" }, "tuxw");
      partyHat(g, x - S * 0.84, cy - S * 1.53, S * 0.62, -0.28);
    }
    // your boots step into the frame: "it then sees you"
    const kin = K.ease.out(K.seg(t, 15.6, 16.6));
    if (kin > 0) {
      const kx = K.lerp(760, 640, kin);
      K.drawPerson(g, kx, 512, 300, { view: "back", walk: kin < 1, phase: t * 0.8, t, hood: true, bell: true, light: { x: 300, y: 100, color: "#ffffff", strength: 0.5 }, alpha: K.clamp(kin * 3) });
    }
    snow(g, W, H, t, { count: 30, seed: 11, speed: 34, size: 2, alpha: 0.95, drift: 16 });
  });
  snow(g, W, H, t, { count: 12, seed: 22, speed: 70, size: 4.5, alpha: 0.45, soft: true, drift: 30 });
}

// flashback: the dark hallway (side view)
function hallway(g, W, H, t) {
  const p = K.seg(t, 19.6, 34);
  K.withCamera(g, W, H, { x: K.lerp(470, 520, K.ease.inOut(p)), y: 290, zoom: 1.05, shakeT: t, shakeAmt: 0.8 }, () => {
    const floorY = 430;
    g.fillStyle = "#0d0a10";
    g.fillRect(-W, -H, W * 3, H * 3);
    g.drawImage(K.sprite("f17:hall", 1300, 700, (hs) => { hs.translate(100, 80); hallStatic(hs, floorY); }), -100, -80, 1300, 700);
    const nl = { x: 110, y: 380, color: "#ffcf7a", strength: 1.3 };
    K.glow(g, 110, 380, 70, "#ffcf7a", 0.7 * (0.92 + 0.08 * Math.sin(t * 1.7)));
    // small you, standing in the doorway with a hand on the frame, then following
    const fp = K.ease.inOut(K.seg(t, 30.6, 34.2));
    const kx = K.lerp(128, 380, fp);
    K.drawPerson(g, kx, floorY + 18, 150, { view: "side", facing: 1, walk: fp > 0 && fp < 1, phase: t * 0.8, t, coat: "#6a7ab0", pants: "#4a5a90", boots: "#cfd4e8", hood: false, light: nl, shadow: true, crouch: fp > 0 ? 0.03 : 0.08 + 0.02 * Math.sin(t * 1.3) });
    if (fp <= 0) {
      // the reaching arm: shoulder to a small hand curled on the door frame
      const shx = kx + 3, shy = floorY + 18 - 150 * 0.76;
      const p2 = new Path2D();
      K.tube(p2, [shx, shy, shx + 26, shy + 20, 184, shy + 8], [9, 8, 6.5], 4, true, true);
      g.fillStyle = "#5a6aa0"; g.fill(p2);
      g.fillStyle = "#d8a07a"; g.beginPath(); g.ellipse(186, shy + 6, 4.5, 6, 0.3, 0, TAU); g.fill();
    }
    hallCat(g, t, floorY);
    // darkness swallows the far end: only his eye-shine survives out there
    const dk = g.createLinearGradient(260, 0, 900, 0);
    dk.addColorStop(0, "rgba(6,4,8,0)"); dk.addColorStop(0.5, "rgba(6,4,8,0.6)"); dk.addColorStop(1, "rgba(6,4,8,0.9)");
    g.fillStyle = dk; g.fillRect(260, -100, 1000, 800);
    hallEyes(g, t, floorY);
    K.dust(g, W, H, t, { seed: 3, color: "#ffcf7a", count: 22, size: 1.1, area: [60, 120, 400, 300], alpha: 0.5 });
  });
}
function hallPose(t) {
  let bx, pose, facing = 1, turn = 0.1;
  if (t < 23) { bx = K.lerp(240, 470, K.ease.inOut(K.seg(t, 20.3, 23))); pose = "walk"; }
  else if (t < 26.2) { bx = 470; pose = "sit"; facing = -1; turn = 0.55; }
  else if (t < 28.6) { bx = K.lerp(470, 680, K.ease.inOut(K.seg(t, 26.2, 28.6))); pose = "walk"; }
  else { bx = 680; pose = "sit"; facing = -1; turn = 0.6; }
  return { bx, pose, facing, turn };
}
function hallCat(g, t, floorY) {
  // Biscuit as a kitten: small (34 px at the shoulder) and barely lit once he is past the doorway light
  const { bx, pose, facing, turn } = hallPose(t);
  const dark = K.clamp((bx - 250) / 450);
  const S = 34;
  const o = {
    pose, phase: t * 1.1, facing, headTurn: turn, t, bell: true, collar: true, tailUp: pose === "sit" ? 0.3 : 0.6,
    eyesGlow: pose === "sit" ? 0.85 : 0.3, pupil: 0.9, dark: true, blink: K.env(t, 24.6, 25.3, 0.25, 0.3),
    light: { x: 110, y: 380, color: "#ffcf7a", strength: K.lerp(1.4, 0.7, dark) }, ground: "#000000",
  };
  K.drawCat(g, bx, floorY + 20, S, o);
}
function hallEyes(g, t, floorY) {
  const { bx, pose, facing } = hallPose(t);
  if (pose !== "sit") return;
  const ex = bx + facing * 34 * 0.24, ey = floorY + 20 - 34 * 1.5;
  K.glow(g, ex, ey, 9, "#c8ff7a", 0.45);
  K.glow(g, ex, ey, 3, "#eaffc8", 0.8);
}
function hallStatic(g, floorY) {
  {
    {
    // wall with wallpaper, fading into dark
    const wg = g.createLinearGradient(0, 0, 1000, 0);
    wg.addColorStop(0, "#5a3a24"); wg.addColorStop(0.3, "#2a1c16"); wg.addColorStop(0.7, "#120e12"); wg.addColorStop(1, "#0a080c");
    g.fillStyle = wg;
    g.fillRect(-100, 40, 1200, floorY - 40);
    g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 1;
    g.beginPath();
    for (let x = -100; x < 1100; x += 34) { g.moveTo(x, 40); g.lineTo(x, floorY); }
    g.stroke();
    // skirting + floorboards
    g.fillStyle = "#1e1410"; g.fillRect(-100, floorY - 14, 1200, 14);
    const fg = g.createLinearGradient(0, floorY, 0, 560);
    fg.addColorStop(0, "#2a1c14"); fg.addColorStop(1, "#140c08");
    g.fillStyle = fg; g.fillRect(-100, floorY, 1200, 200);
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.beginPath(); for (let k = 0; k < 6; k++) { const y = floorY + 8 + k * k * 4; g.moveTo(-100, y); g.lineTo(1100, y); } g.stroke();
    // picture frame and a far moonlit window
    g.fillStyle = "#1a120e"; g.fillRect(420, 150, 70, 90);
    g.fillStyle = "#2a2230"; g.fillRect(428, 158, 54, 74);
    g.fillStyle = "#0e1424"; g.fillRect(820, 120, 70, 120);
    g.fillStyle = "rgba(120,140,190,0.25)"; g.fillRect(826, 126, 58, 108);
    K.glow(g, 855, 180, 90, "#6a80c0", 0.15);
    // the bedroom doorway on the left, the nightlight glowing behind you
    g.fillStyle = "#2a1a10";
    g.fillRect(70, 110, 120, floorY - 110);
    const dg = g.createRadialGradient(110, 380, 10, 110, 330, 220);
    dg.addColorStop(0, "#ffcf7a"); dg.addColorStop(0.3, "#d08a3a"); dg.addColorStop(1, "#3a2010");
    g.fillStyle = dg;
    g.fillRect(80, 120, 100, floorY - 120);
    g.fillStyle = "#1a100a"; g.fillRect(64, 104, 132, 8); g.fillRect(64, 104, 8, floorY - 104); g.fillRect(188, 104, 8, floorY - 104);
    // light falling out of the door onto the hall floor
    g.save(); g.globalCompositeOperation = "lighter";
    const lg = g.createLinearGradient(190, 0, 600, 0);
    lg.addColorStop(0, "rgba(255,190,110,0.35)"); lg.addColorStop(1, "rgba(255,190,110,0)");
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(190, floorY - 2); g.lineTo(620, floorY + 60); g.lineTo(620, floorY + 140); g.lineTo(190, floorY + 30); g.closePath(); g.fill();
    g.restore();
  }
  }
}

function bellClose(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 34, 44));
  // background: the snowy plain and gate, far out of focus
  const L = K.layer(W, H, "f17:bellbg");
  const b = L.g;
  whiteSky(b, W, H, 380);
  gate(b, 600, 400, 0.85, { haze: 0.15 });
  K.fog(b, W, H, { y: 390, h: 80, color: FOG, alpha: 0.6, t, seed: 8 });
  snowField(b, W, H, 380, t);
  snow(b, W, H, t, { count: 60, seed: 4, speed: 14, size: 2.2, alpha: 0.9 });
  const rack = K.smooth(K.seg(t, 39.4, 41.2));
  K.dof(g, L.canvas, K.lerp(8, 1.2, rack));
  // out-of-focus snow catching the light: big soft discs
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 9; i++) {
    const x = (K.hash(i, 61) * 1100 + t * 6) % 1100 - 70, y = 80 + K.hash(i + 0.5, 61) * 360 + Math.sin(t * 0.4 + i) * 12;
    const r = 18 + K.hash(i, 62) * 30;
    g.fillStyle = "rgba(255,255,255,0.05)";
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.08)"; g.lineWidth = 1.5; g.stroke();
  }
  g.restore();
  const fgL = K.layer(W, H, "f17:bellfg");
  const fg = fgL.g;
  K.withCamera(fg, W, H, { x: 480, y: 290, zoom: K.lerp(1.0, 1.08, p), shakeT: t, shakeAmt: 0.9 }, () => {
    const g = fg;
    // your hand, relaxed and palm down, wrist bent, sleeve from the lower left
    const wx = 300, wy = 262;
    K.drawHand(g, wx, wy, 230, { pose: "reach", angle: -0.05, left: true, bell: false, t, light: { x: 700, y: 60, color: "#ffffff", strength: 0.7 } });
    // the string round the wrist and the bell hanging from it
    const ring = t >= 34 ? Math.exp(-(t - 34) * 1.1) * Math.sin((t - 34) * 9) : 0;
    const sway = Math.sin(t * 0.9) * 0.04;
    const ang = ring * 0.55 + sway;
    const ax = wx + 14, ay = wy + 26;
    const len = 78;
    const bx = ax + Math.sin(ang) * len, by = ay + Math.cos(ang) * len;
    g.strokeStyle = "#a8322e"; g.lineWidth = 3.4; g.lineCap = "round";
    g.beginPath(); g.moveTo(wx - 30, wy - 4); g.quadraticCurveTo(wx + 6, wy + 34, wx + 44, wy + 10); g.stroke();
    g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by - 26); g.stroke();
    g.save();
    g.translate(bx, by);
    g.rotate(-ang);
    g.scale(1.4, 1.4);
    K.drawBell(g, 0, 0, 40, { t, glint: 0.3 + 0.7 * Math.max(0, ring) });
    // snowflakes landing on the brass, then melting into tiny beads that vanish
    const lands = [[35.3, -8, -12], [36.4, 9, -8], [37.6, -12, 2], [38.7, 4, -15], [39.9, 13, 3], [41.1, -3, -4], [42.2, 8, -11]];
    for (const [tl, lx, ly] of lands) {
      const fall = t - (tl - 1.4);
      if (fall < 0) continue;
      if (t < tl) {
        const k = fall / 1.4;
        const fx = lx + Math.sin(fall * 3 + tl) * 10 * (1 - k), fy = ly - (1 - k) * 160;
        g.fillStyle = "rgba(255,255,255,0.95)";
        g.beginPath(); g.arc(fx, fy, 2.2, 0, TAU); g.fill();
        continue;
      }
      const age = t - tl;
      if (age > 2.6) continue;
      const melt = K.smooth(age / 1.4);
      if (melt < 1) {
        g.save(); g.translate(lx, ly); g.rotate(tl);
        g.strokeStyle = `rgba(255,255,255,${0.95 * (1 - melt)})`; g.lineWidth = 0.9;
        const r = 3.2 * (1 - melt * 0.7);
        g.beginPath();
        for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI; g.moveTo(Math.cos(a) * r, Math.sin(a) * r); g.lineTo(-Math.cos(a) * r, -Math.sin(a) * r); }
        g.stroke();
        g.restore();
      }
      const bead = K.env(age, 0.6, 2.6, 0.5, 1.0);
      if (bead > 0) { K.glow(g, lx, ly, 3.5, "#ffffff", 0.9 * bead); g.fillStyle = `rgba(255,255,255,${bead})`; g.fillRect(lx - 0.6, ly - 0.6, 1.2, 1.2); }
    }
    g.restore();
    // the ring of the bell, seen as a shimmer
    if (t >= 34 && t < 37) {
      const k = 1 - (t - 34) / 3;
      K.bellGlint(g, bx - 8, by - 6, 26, t, { strength: k });
      g.save(); g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 3; i++) {
        const r = 30 + (t - 34 - i * 0.3) * 120;
        if (r < 30) continue;
        g.strokeStyle = K.rgba("#fff2c0", 0.25 * k);
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(bx, by, r, 0, TAU); g.stroke();
      }
      g.restore();
    }
  });
  // rack focus: the hand and bell go soft as the gate behind sharpens
  if (rack > 0.02) K.dof(g, fgL.canvas, rack * 5); else g.drawImage(fgL.canvas, 0, 0, W, H);
  // big soft flakes drifting past the lens
  snow(g, W, H, t, { count: 14, seed: 31, speed: 40, size: 6, alpha: 0.5, soft: true, drift: 30 });
}

function shotPush(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 44, 54));
  const hit = t >= 46 ? Math.exp(-(t - 46) * 3) : 0;
  const open = K.ease.inOut(K.seg(t, 46.3, 54)) * 0.22;
  const GS = 1.95;
  K.withCamera(g, W, H, { x: 480, y: K.lerp(260, 250, p), zoom: K.lerp(1.0, 1.08, p), shakeT: t * 3, shakeAmt: 1 + hit * 7 }, () => {
    whiteSky(g, W, H, 560);
    // the gate filling the frame: low camera looking UP, the doors run far past the top of frame
    gate(g, 480, 560, GS, { open, haze: 0 });
    // haze toward the unseen top of the doors
    const hzg = g.createLinearGradient(0, -40, 0, 160);
    hzg.addColorStop(0, "rgba(238,240,255,0.8)"); hzg.addColorStop(1, "rgba(238,240,255,0)");
    g.fillStyle = hzg; g.fillRect(-100, -60, 1200, 220);
    // light through the crack
    if (open > 0) {
      const cw = 400 * GS * open;
      K.godRays(g, 480, 250, W, H, { color: "#fff3d8", count: 12, strength: 0.12 + open * 1.1, t, angle: Math.PI / 2, spread: 2.6, length: 700, seed: 7 });
      K.glow(g, 480, 300, 90 + cw * 3, "#fff6e0", 0.25 + open * 1.4);
      g.save(); g.globalCompositeOperation = "lighter";
      const fl = g.createLinearGradient(0, 470, 0, 560);
      fl.addColorStop(0, K.rgba("#fff3d8", 0.6)); fl.addColorStop(1, K.rgba("#fff3d8", 0));
      g.fillStyle = fl;
      g.beginPath(); g.moveTo(480 - cw / 2, 470); g.lineTo(480 + cw / 2, 470); g.lineTo(480 + cw * 3, 600); g.lineTo(480 - cw * 3, 600); g.closePath(); g.fill();
      g.restore();
    }
    // snow on the ground at the threshold
    const sg = g.createLinearGradient(0, 470, 0, 560);
    sg.addColorStop(0, "rgba(238,240,255,0.95)"); sg.addColorStop(1, "rgba(226,228,246,1)");
    g.fillStyle = sg; g.fillRect(-100, 478, 1200, 120);
    // the hit at 46 shakes the snow-caps off the carved ledges: chunks fall with gravity (pure in t-46)
    // plus a puff of powder at each ledge
    if (t >= 46) {
      const toS = (lx, ly) => [480 + (lx - GW / 2) * GS, 560 - (GH - ly) * GS];
      for (let li = 0; li < LEDGES.length; li++) {
        const [lx, ly, lw] = LEDGES[li];
        const [sx0, sy0] = toS(lx, ly);
        if (sy0 < -20 || sy0 > 560 || sx0 < -200 || sx0 > 1160) continue;
        const delay = K.hash(li, 41) * 0.35;
        const age = t - 46 - delay;
        if (age < 0) continue;
        const puff = K.env(age, 0, 1.2, 0.05, 1.0);
        if (puff > 0) K.glow(g, sx0 + lw * GS * 0.5, sy0 - 4, 26 + age * 40, "#ffffff", 0.45 * puff, "source-over");
        for (let c = 0; c < 4; c++) {
          const a2 = age - c * 0.07;
          if (a2 < 0 || a2 > 2.4) continue;
          const x = sx0 + (0.15 + K.hash(li * 7 + c, 42) * 0.7) * lw * GS + (K.hash(li * 7 + c, 43) - 0.5) * 30 * a2;
          const y = sy0 + 0.5 * 900 * a2 * a2;
          if (y > 600) continue;
          const r = (3 + K.hash(li * 7 + c, 44) * 6) * (GS / 1.5);
          g.fillStyle = `rgba(252,252,255,${0.95 * (1 - a2 / 2.4)})`;
          g.beginPath(); g.ellipse(x, y, r, r * 0.75, a2 * 3, 0, TAU); g.fill();
          g.fillStyle = `rgba(200,204,236,${0.5 * (1 - a2 / 2.4)})`;
          g.beginPath(); g.ellipse(x + r * 0.2, y + r * 0.3, r * 0.6, r * 0.35, 0, 0, TAU); g.fill();
        }
      }
    }
    // you, hands on the gate, from behind
    const kh = 250;
    const push = K.smooth(K.seg(t, 44.5, 46));
    kidPush(g, 480, 498, kh, t, push, { light: { x: 480, y: 250, color: "#fff3d8", strength: 0.6 + open * 4 } });
    snow(g, W, H, t, { count: 80, seed: 6, speed: 20, size: 1.4, alpha: 0.85, drift: 12 });
  });
  snow(g, W, H, t, { count: 10, seed: 23, speed: 70, size: 5, alpha: 0.45, soft: true, drift: 30 });
}

function cloudStep(g, x, y, w, h, seed, t, haze = 0) {
  const R = K.rng("step" + seed);
  // each step is its own shape: a few big billows and many small ones, lopsided, with a ragged belly
  const n = 7 + Math.floor(R() * 6);
  const skew = (R() - 0.5) * 0.5;
  // rose-lavender underside, darker in the middle of the belly
  const ug = g.createRadialGradient(x, y + h * 0.45, 0, x, y + h * 0.45, w * 0.55);
  ug.addColorStop(0, K.rgba(K.mix("#c49ab4", FOG, haze), 0.55)); ug.addColorStop(0.7, K.rgba(K.mix("#e2c4d4", FOG, haze), 0.35)); ug.addColorStop(1, "rgba(226,196,212,0)");
  g.save(); g.translate(x, y + h * 0.4); g.scale(1, (h * 0.55) / (w * 0.55)); g.translate(-x, -(y + h * 0.4));
  g.fillStyle = ug; g.beginPath(); g.arc(x, y + h * 0.4, w * 0.55, 0, TAU); g.fill(); g.restore();
  for (let i = 0; i < n; i++) {
    const u = R();
    const big = R() < 0.35;
    const px = x + (u - 0.5 + skew * (u - 0.5)) * w * 0.95;
    const r = h * (big ? 0.75 + R() * 0.5 : 0.35 + R() * 0.35) * (1 - Math.abs(u - 0.5) * 0.7);
    const py = y - r * (big ? 0.35 : 0.05) + (R() - 0.5) * h * 0.3 + Math.sin(t * 0.5 + i + seed) * h * 0.03;
    const cg = g.createRadialGradient(px - r * 0.3, py - r * 0.45, r * 0.1, px, py + r * 0.2, r);
    cg.addColorStop(0, K.mix("#ffffff", FOG, haze * 0.5)); cg.addColorStop(0.55, K.mix("#f8eef4", FOG, haze)); cg.addColorStop(0.85, K.rgba(K.mix("#e2c4d4", FOG, haze), 0.6)); cg.addColorStop(1, "rgba(226,196,212,0)");
    g.fillStyle = cg;
    // billows are wider than tall and overlap, so the step reads as one cloud, not a row of balls
    g.save(); g.translate(px, py); g.scale(1.55, 0.8); g.translate(-px, -py);
    g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill();
    g.restore();
  }
  // the flat tread on top, lit rose from the horizon
  g.fillStyle = "rgba(255,246,248,0.9)";
  g.beginPath(); g.ellipse(x, y - h * 0.3, w * 0.42, h * 0.22, 0, 0, TAU); g.fill();
}
function shotStairs(g, W, H, t) {
  const p = K.ease.inOut(K.seg(t, 54, 70));
  K.withCamera(g, W, H, { x: 480, y: K.lerp(280, 250, p), zoom: K.lerp(1.0, 1.1, p), shakeT: t, shakeAmt: 0.9 }, () => {
    // the sky beyond the gate, just beginning to turn rose at the horizon
    const sg = g.createLinearGradient(0, -80, 0, 470);
    sg.addColorStop(0, "#b8bcf0"); sg.addColorStop(0.45, "#dcd8fa"); sg.addColorStop(0.8, "#ffe2d8"); sg.addColorStop(1, "#ffd6c8");
    g.fillStyle = sg; g.fillRect(-W, -H, W * 3, H * 3);
    const dawn = K.smooth(K.seg(t, 54, 68));
    // a low rose sun at the horizon, faint rays fanning up through the haze
    K.sunGlow(g, 480, 470, 30, "#ffc8b0", 0.25 + dawn * 0.4);
    K.glow(g, 480, 470, 380, "#ffb0a0", 0.2 + dawn * 0.25);
    K.godRays(g, 480, 470, W, H, { color: "#ffd0c0", count: 9, strength: 0.06 + dawn * 0.08, t, angle: -Math.PI / 2, spread: 2.4, length: 520, seed: 33 });
    K.clouds(g, W, H, t, { seed: 31, color: "#fff4f0", shade: "#e2c4d4", count: 6, y: 380, spread: 40, speed: 4, scale: 1.3, alpha: 0.8 });
    // the staircase of clouds, zig-zagging up toward the light, fading into the haze
    const N = 11;
    const step = (i) => {
      const u = i / (N - 1);
      return {
        x: 480 + Math.sin(i * 1.05 + 0.4) * K.lerp(130, 18, u),
        y: K.lerp(548, 128, Math.pow(u, 0.82)),
        w: K.lerp(300, 44, Math.pow(u, 0.6)),
        h: K.lerp(50, 9, Math.pow(u, 0.6)),
        a: 1 - u * 0.5,
      };
    };
    for (let i = N - 1; i >= 0; i--) {
      const s = step(i);
      g.save();
      g.globalAlpha = s.a;
      cloudStep(g, s.x, s.y, s.w, s.h, i, t, (i / (N - 1)) * 0.75);
      g.restore();
    }
    // you climb alone, one step at a time
    const cp = K.ease.inOut(K.seg(t, 56, 69.5));
    const f = cp * 7.2;
    const i0 = Math.min(N - 2, Math.floor(f)), fr = f - i0;
    const A = step(i0), B = step(i0 + 1);
    const k = K.smooth(K.clamp((fr - 0.3) / 0.6));
    const up = K.smooth(K.clamp((fr - 0.25) / 0.4)); // the body lifts onto the next step first...
    const kx = K.lerp(A.x, B.x, k);                  // ...then carries forward
    const ky = K.lerp(A.y - A.h * 0.3, B.y - B.h * 0.3, up) - Math.sin(Math.PI * K.clamp((fr - 0.2) / 0.5)) * A.h * 0.45;
    const kh = K.lerp(A.w, B.w, k) * 0.5;
    const footY = K.lerp(A.y - A.h * 0.3, B.y - B.h * 0.3, k > 0.5 ? 1 : 0);
    const sa = (1 - Math.max(0, cp - 0.85) * 2) * (0.6 - Math.abs(ky - footY) / (A.h * 2));
    if (sa > 0) {
      const shg = g.createRadialGradient(kx, footY, 0, kx, footY, kh * 0.18);
      shg.addColorStop(0, `rgba(200,130,160,${0.55 * sa})`); shg.addColorStop(1, "rgba(200,130,160,0)");
      g.save(); g.translate(kx, footY); g.scale(1, 0.25); g.translate(-kx, -footY);
      g.fillStyle = shg; g.beginPath(); g.arc(kx, footY, kh * 0.18, 0, TAU); g.fill(); g.restore();
    }
    K.drawPerson(g, kx, ky, kh, { view: "back", walk: cp > 0.002 && cp < 0.998, phase: t * 0.7, t, hood: false, bell: true, shadow: false, light: { x: 480, y: 470, color: "#ffc8b0", strength: 1 }, alpha: 1 - Math.max(0, cp - 0.85) * 2 });
    snow(g, W, H, t, { count: 40, seed: 7, speed: 10, size: 1, alpha: 0.6, drift: 10 });
    // the open gate frames the shot (its carved pillars and arch, close and huge)
    const s = 1.85;
    g.save();
    g.globalAlpha = 0.96;
    g.drawImage(gateFrameSprite(), 110 - 120 * s, 70 - 300 * s, GW * s, GH * s);
    g.restore();
    // the door leaves, swung right open
    for (const sd of [-1, 1]) {
      const xo = sd < 0 ? 110 : 850, xi = sd < 0 ? 196 : 764;
      const dg = g.createLinearGradient(xo, 0, xi, 0);
      dg.addColorStop(0, "#c4c7e4"); dg.addColorStop(1, "#e6e8f8");
      g.fillStyle = dg;
      g.beginPath(); g.moveTo(xo, 70); g.lineTo(xi, 112); g.lineTo(xi, 520); g.lineTo(xo, 600); g.closePath(); g.fill();
      g.strokeStyle = "rgba(150,154,196,0.5)"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(xo + (xi - xo) * 0.2, 110); g.lineTo(xo + (xi - xo) * 0.8, 140); g.lineTo(xo + (xi - xo) * 0.8, 480); g.lineTo(xo + (xi - xo) * 0.2, 520); g.closePath(); g.stroke();
    }
    // threshold snow in the foreground
    const tg = g.createLinearGradient(0, 500, 0, 560);
    tg.addColorStop(0, "rgba(240,240,255,0)"); tg.addColorStop(1, "rgba(236,236,252,0.95)");
    g.fillStyle = tg; g.fillRect(-100, 500, 1200, 100);
    // a clear 0.8 s head-and-shoulders bow at 57.4, then he straightens and watches you go
    const bow = Math.round(K.env(t, 57.2, 58.0, 0.35, 0.45) * 6) / 6;
    g.save();
    g.translate(200, 440); g.rotate(bow * 0.08); g.translate(-200, -440);
    sirWhiskers(g, 200, 440 + bow * 6, 96, { pose: "sit", facing: 1, headTurn: 0.15, headTilt: -0.9 * bow, alpha: 1, steps: 1 }, "bow" + Math.round(bow * 6));
    g.restore();
  });
  snow(g, W, H, t, { count: 10, seed: 24, speed: 60, size: 4.5, alpha: 0.4, soft: true, drift: 30 });
}

function frame(g, W, H, t) {
  if (t < 12) shotPlain(g, W, H, t);
  else if (t < 19.8) shotKeeper(g, W, H, t);
  else if (t < 34) {
    // 0.8 s cross-fade into the warm memory
    if (t < 20.6) { shotKeeper(g, W, H, t); }
    xfade(g, W, H, K.smooth(K.seg(t, 19.8, 20.6)), "f17:xf", (L) => {
      hallway(L, W, H, t);
      flashbackPost(L, W, H, t);
    });
    if (t > 33.2) {
      // back to the present: cross-fade into the bell
      xfade(g, W, H, K.smooth(K.seg(t, 33.2, 34)), "f17:xf2", (L) => bellClose(L, W, H, t));
    }
  } else if (t < 44) bellClose(g, W, H, t);
  else if (t < 54) shotPush(g, W, H, t);
  else shotStairs(g, W, H, t);
}
function flashbackPost(g, W, H, t) {
  g.save();
  g.globalCompositeOperation = "multiply";
  g.fillStyle = "rgba(226,178,120,0.3)"; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "lighter";
  g.fillStyle = "rgba(40,26,12,0.12)"; g.fillRect(0, 0, W, H);
  g.restore();
  K.grade(g, W, H, { tint: "#ffcf8a", alpha: 0.3, mode: "soft-light" });
  K.vignette(g, W, H, 0.7, "#1a0c04");
  K.grain(g, W, H, t, 0.1);
}

export const film = {
  id: 17,
  title: "Brave",
  chapter: "Chapter 17",
  unlockAt: 85,
  duration: D,
  poster: 46,
  tagline: "You were braver than you knew.",
  subs: [
    [3.0, 7.0, "The End Of Cats. White and quiet."],
    [13.0, 18.0, "Someone was sure this was the end."],
    [18.3, 20.0, "It wasn't."],
    [21.5, 25.5, "When you were small, you were scared of the dark."],
    [26.0, 30.0, "He would walk ahead. And wait."],
    [30.5, 33.5, "Every time. Until you followed."],
    [35.5, 40.0, "He'd been doing it all along."],
    [47.0, 51.5, "So this time you didn't wait."],
    [56.0, 60.5, "Sir Whiskers stayed at the gate."],
    [61.0, 67.0, "The rest of the way was yours."],
  ],
  voice: [
    [3.0, "The End Of Cats. White and quiet.", { rate: 0.92, pitch: 1.0 }],
    [13.0, "Someone was sure this was the end.", { rate: 1.0, pitch: 1.1 }],
    [18.3, "It wasn't.", { rate: 1.0, pitch: 1.1 }],
    [21.5, "When you were small, you were scared of the dark.", { rate: 0.9, pitch: 1.0 }],
    [26.0, "He would walk ahead. And wait.", { rate: 0.88, pitch: 1.0 }],
    [30.5, "Every time. Until you followed.", { rate: 0.88, pitch: 1.0 }],
    [35.5, "He'd been doing it all along.", { rate: 0.88, pitch: 1.0 }],
    [47.0, "So this time you didn't wait.", { rate: 0.92, pitch: 1.0 }],
    [56.0, "Sir Whiskers stayed at the gate.", { rate: 0.9, pitch: 1.0 }],
    [61.0, "The rest of the way was yours.", { rate: 0.88, pitch: 1.0 }],
  ],
  score: { mood: "hopeful", key: "C", bpm: 76, cues: [[4, "swell"], [20, "purr"], [34, "bell"], [46, "hit"], [60, "swell"]] },
  draw(g, t, W, H) {
    g.save();
    if (W !== 960 || H !== 540) g.scale(W / 960, H / 540);
    W = 960; H = 540;
    try {
      if (t > 4 && t < 12) {
        const q = Math.floor((t - 4) * 2);
        if (q < 8) cachedCat(null, 0, 0, 64, { pose: "walk", phase: q / 8, facing: -1, coat: K.COATS.tuxedo, collar: false, headTurn: 0.25, light: { x: -170, y: 100, color: "#ffffff", strength: 0.8 }, ground: "#7a7eb0" }, "tuxw");
      }
      frame(g, W, H, t);
      const memory = t >= 20.6 && t < 33.2;
      K.bloom(g, memory ? 0.3 : 0.26, { threshold: memory ? 0.85 : 0.7 });
      if (!memory) {
        // high key, low contrast, cool lavender
        K.grade(g, W, H, { tint: t >= 54 ? "#ffd6c8" : "#d8dcff", alpha: 0.18, mode: "soft-light" });
        K.vignette(g, W, H, 0.32, "#3a3a6a");
        K.grain(g, W, H, t, 0.045);
      } else K.vignette(g, W, H, 0.25);
      K.letterbox(g, W, H, 1);
      const ta = K.env(t, 2, 6, 1.0, 1.0);
      if (ta > 0) {
        const ty = H * 0.36;
        g.save();
        g.globalAlpha = ta * 0.5;
        const band = g.createLinearGradient(0, ty - 60, 0, ty + 70);
        band.addColorStop(0, "rgba(70,74,130,0)"); band.addColorStop(0.5, "rgba(70,74,130,0.55)"); band.addColorStop(1, "rgba(70,74,130,0)");
        g.fillStyle = band; g.fillRect(0, ty - 60, W, 130);
        g.restore();
        K.title(g, W, H, "Brave", "", ta, { color: "#ffffff", glow: "#3a3e78", y: ty });
        g.save();
        g.globalAlpha = ta;
        g.font = "600 14px Fredoka, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
        g.shadowColor = "rgba(58,62,120,0.8)"; g.shadowBlur = 8; g.fillStyle = "#ffffff";
        g.fillText("C H A P T E R   1 7", W / 2, ty + 44);
        g.restore();
      }
      K.fadeColor(g, W, H, 1 - K.smooth(K.seg(t, 0, 2)), "#f4f4ff");
      K.fadeColor(g, W, H, 0.85 * Math.exp(-Math.max(0, t - 46) * 4) * (t >= 46 && t < 48 ? 1 : 0), "#ffffff");
      K.fadeColor(g, W, H, K.env(t, 53.6, 54.6, 0.4, 0.6) * 0.9, "#fff8f0");
      K.fadeBlack(g, W, H, K.smooth(K.seg(t, 67.4, 70)));
    } finally {
      g.restore();
    }
  },
};
