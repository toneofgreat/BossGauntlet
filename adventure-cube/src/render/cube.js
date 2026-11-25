// cube.js - the player: a soft, painted-clay cube with an expressive face. Vector-drawn every frame (crisp at any
// zoom); gradients are created once per theme in LOCAL coordinates and reused under any transform.
// Mood comes from the sim state (createCubeAnimator) and drawCube() only paints.
import { PW, PH, T } from "../sim/constants.js";
import { rrect, css, shade, clamp, lerp } from "./util.js";

const HALF = PW / 2;

export function createCubePaint(A) {
  const C = A.cube, L = A.light;
  const tmp = document.createElement("canvas").getContext("2d");
  const body = tmp.createLinearGradient(L.x * HALF * 1.2, L.y * HALF * 1.2, -L.x * HALF * 1.2, -L.y * HALF * 1.2);
  body.addColorStop(0, C.light); body.addColorStop(0.45, C.base); body.addColorStop(1, C.dark);
  const spec = tmp.createRadialGradient(L.x * 7, L.y * 7, 0, L.x * 7, L.y * 7, 11);
  spec.addColorStop(0, "rgba(255,255,255,0.45)"); spec.addColorStop(1, "rgba(255,255,255,0)");
  const bounce = tmp.createLinearGradient(0, 4, 0, HALF);
  bounce.addColorStop(0, "rgba(0,0,0,0)"); bounce.addColorStop(1, A.id === "forest" ? "rgba(120,170,60,0.22)" : A.id === "highlands" ? "rgba(255,140,60,0.2)" : "rgba(80,110,200,0.25)");
  return { body, spec, bounce, C, L };
}

// mood: 'idle' | 'run' | 'jump' | 'fall' | 'worried' | 'land' | 'happy' | 'dead' | 'ghost'
// P: { sx, sy (scale), rot, look: {x,y} (-1..1), blink 0..1, mood, alpha, t (seconds), fear 0..1 }
export function drawCube(ctx, paint, P) {
  const C = paint.C;
  ctx.globalAlpha = P.alpha == null ? 1 : P.alpha;
  // body
  ctx.beginPath(); rrect(ctx, -HALF, -HALF, PW, PH, 5.5);
  ctx.fillStyle = paint.body; ctx.fill();
  ctx.fillStyle = paint.bounce; ctx.fill();
  ctx.fillStyle = paint.spec; ctx.fill();
  // bevel: light top/left lip, dark bottom/right lip
  const L = paint.L;
  ctx.lineWidth = 1.6; ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,250,235,0.42)";
  ctx.beginPath();
  if (L.x <= 0) { ctx.moveTo(-HALF + 2, HALF - 6); ctx.lineTo(-HALF + 2, -HALF + 5); ctx.quadraticCurveTo(-HALF + 2, -HALF + 2, -HALF + 5, -HALF + 2); ctx.lineTo(HALF - 6, -HALF + 2); }
  else { ctx.moveTo(HALF - 2, HALF - 6); ctx.lineTo(HALF - 2, -HALF + 5); ctx.quadraticCurveTo(HALF - 2, -HALF + 2, HALF - 5, -HALF + 2); ctx.lineTo(-HALF + 6, -HALF + 2); }
  ctx.stroke();
  ctx.strokeStyle = "rgba(60,20,0,0.35)";
  ctx.beginPath(); ctx.moveTo(-HALF + 6, HALF - 2); ctx.lineTo(HALF - 5, HALF - 2);
  if (L.x <= 0) { ctx.quadraticCurveTo(HALF - 2, HALF - 2, HALF - 2, HALF - 5); ctx.lineTo(HALF - 2, -HALF + 6); }
  else { ctx.moveTo(-HALF + 5, HALF - 2); ctx.quadraticCurveTo(-HALF + 2, HALF - 2, -HALF + 2, HALF - 5); ctx.lineTo(-HALF + 2, -HALF + 6); }
  ctx.stroke();
  if (C.rim) {
    ctx.strokeStyle = css(C.rim, 0.75); ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (L.x > 0) { ctx.moveTo(HALF - 0.6, -HALF + 5); ctx.lineTo(HALF - 0.6, HALF - 5); }
    else { ctx.moveTo(-HALF + 5, -HALF + 0.6); ctx.lineTo(HALF - 5, -HALF + 0.6); }
    ctx.stroke();
  }
  ctx.beginPath(); rrect(ctx, -HALF, -HALF, PW, PH, 5.5);
  ctx.strokeStyle = C.outline; ctx.lineWidth = 1.1; ctx.stroke();

  // ---- face ----
  const mood = P.mood, lx = clamp(P.look.x, -1, 1), ly = clamp(P.look.y, -1, 1);
  const fx = lx * 2.4, fy = ly * 1.4 - 1;            // the whole face turns toward where it looks
  const eyeY = -3 + fy, ex = 5.4;
  const ink = "#2a1406";
  // blush
  ctx.fillStyle = css(C.blush, mood === "happy" ? 0.55 : 0.28);
  ctx.beginPath(); ctx.ellipse(fx - 8.2, eyeY + 6.2, 2.6, 1.5, 0, 0, 6.3); ctx.ellipse(fx + 8.2, eyeY + 6.2, 2.6, 1.5, 0, 0, 6.3); ctx.fill();

  if (mood === "dead") {
    ctx.strokeStyle = ink; ctx.lineWidth = 1.7;
    for (const s of [-1, 1]) {
      const cx = fx + s * ex, cy = eyeY;
      ctx.beginPath(); ctx.moveTo(cx - 2.6, cy - 2.6); ctx.lineTo(cx + 2.6, cy + 2.6); ctx.moveTo(cx + 2.6, cy - 2.6); ctx.lineTo(cx - 2.6, cy + 2.6); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(fx - 4.5, eyeY + 8);
    for (let i = 1; i <= 6; i++) ctx.lineTo(fx - 4.5 + i * 1.5, eyeY + 8 + (i % 2 ? -1.3 : 1.3));
    ctx.lineWidth = 1.3; ctx.stroke();
  } else if (mood === "happy") {
    ctx.strokeStyle = ink; ctx.lineWidth = 1.8;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(fx + s * ex, eyeY + 1.2, 2.8, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(fx - 5.5, eyeY + 6); ctx.quadraticCurveTo(fx, eyeY + 14, fx + 5.5, eyeY + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ff8a8a"; ctx.beginPath(); ctx.ellipse(fx, eyeY + 9.6, 2.6, 1.3, 0, 0, 6.3); ctx.fill();
  } else {
    // eyes
    const wide = mood === "fall" ? 1.18 : mood === "worried" ? 1.08 : 1;
    let open = 1 - P.blink;
    if (mood === "land") open = Math.min(open, 0.38);
    if (mood === "run") open = Math.min(open, 0.86);
    const rx = 3.5 * wide, ry = 4.4 * wide * Math.max(0.12, open);
    for (const s of [-1, 1]) {
      const cx = fx + s * ex, cy = eyeY;
      if (open < 0.2) { ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - 3, cy + 0.5); ctx.quadraticCurveTo(cx, cy + 1.8, cx + 3, cy + 0.5); ctx.stroke(); continue; }
      ctx.fillStyle = "#fffdf6"; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.3); ctx.fill();
      ctx.strokeStyle = "rgba(60,25,5,0.55)"; ctx.lineWidth = 0.7; ctx.stroke();
      const pr = mood === "fall" ? 1.5 : 2.1;
      const px = cx + lx * (rx - pr - 0.3), py = cy + ly * Math.max(0, ry - pr - 0.4);
      ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.3); ctx.clip();
      ctx.fillStyle = "#3a2210"; ctx.beginPath(); ctx.arc(px, py, pr + 0.6, 0, 6.3); ctx.fill();
      ctx.fillStyle = "#0d0602"; ctx.beginPath(); ctx.arc(px, py, pr, 0, 6.3); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(px - 0.8, py - 1, 0.75, 0, 6.3); ctx.fill();
      // eyelid line for squint/run
      if (open < 0.95) { ctx.fillStyle = shade(C.base, 0.92); ctx.fillRect(cx - rx - 1, cy - ry - 4, rx * 2 + 2, 4 + ry * (1 - open) * 0.3); }
      ctx.restore();
    }
    // brows
    ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
    const by = eyeY - 6.2;
    for (const s of [-1, 1]) {
      const cx = fx + s * ex;
      ctx.beginPath();
      if (mood === "worried") { ctx.moveTo(cx - s * 3, by + 0.2 - 1.4); ctx.lineTo(cx + s * 2.6, by + 1.6); }
      else if (mood === "run") { ctx.moveTo(cx - s * 2.8, by + 1.9); ctx.lineTo(cx + s * 2.8, by - 0.2); }
      else if (mood === "fall") { ctx.moveTo(cx - 2.6, by - 1.2); ctx.quadraticCurveTo(cx, by - 2.6, cx + 2.6, by - 1.2); }
      else { ctx.moveTo(cx - 2.6, by + 0.3); ctx.quadraticCurveTo(cx, by - 0.7, cx + 2.6, by + 0.3); }
      ctx.stroke();
    }
    // mouth
    const my = eyeY + 8.2;
    ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineWidth = 1.4;
    if (mood === "fall") { ctx.beginPath(); ctx.ellipse(fx, my + 0.5, 2.2, 2.8, 0, 0, 6.3); ctx.fill(); }
    else if (mood === "jump") { ctx.beginPath(); ctx.moveTo(fx - 4, my - 1); ctx.quadraticCurveTo(fx, my + 6, fx + 4, my - 1); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#ff8a8a"; ctx.beginPath(); ctx.ellipse(fx, my + 1.8, 1.8, 0.9, 0, 0, 6.3); ctx.fill(); }
    else if (mood === "worried") { ctx.beginPath(); ctx.moveTo(fx - 3.6, my + 0.6); for (let i = 1; i <= 4; i++) ctx.lineTo(fx - 3.6 + i * 1.8, my + 0.6 + (i % 2 ? -1 : 0.6)); ctx.stroke(); }
    else if (mood === "land") { ctx.beginPath(); ctx.moveTo(fx - 3.2, my); ctx.lineTo(fx + 3.2, my); ctx.stroke(); }
    else if (mood === "run") { ctx.beginPath(); ctx.moveTo(fx - 3.4, my - 0.4); ctx.quadraticCurveTo(fx + lx, my + 2.2, fx + 3.4, my - 0.4); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(fx - 3.4, my - 0.6); ctx.quadraticCurveTo(fx, my + 2.8, fx + 3.4, my - 0.6); ctx.stroke(); }
    // sweat drop when very scared
    if (mood === "worried" && P.fear > 0.6) {
      const sx = fx + 10.5, sy = eyeY - 5 + ((P.t * 2) % 1) * 3;
      ctx.fillStyle = "rgba(150,210,255,0.95)"; ctx.beginPath(); ctx.moveTo(sx, sy - 3); ctx.quadraticCurveTo(sx + 2.4, sy + 0.8, sx, sy + 1.8); ctx.quadraticCurveTo(sx - 2.4, sy + 0.8, sx, sy - 3); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// dizzy stars orbiting above the head (drawn in the same local frame)
export function drawDizzy(ctx, t) {
  ctx.fillStyle = "#ffe27a";
  for (let i = 0; i < 3; i++) {
    const a = t * 7 + i * 2.094, x = Math.cos(a) * 11, y = -HALF - 6 + Math.sin(a) * 3;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? 1.2 : 3, b = (k / 10) * 6.283; ctx.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r); }
    ctx.closePath(); ctx.fill();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Animator: turns sim state + events into scale / tilt / mood / blink, frame-rate independent.
export function createCubeAnimator() {
  const an = {
    sq: 0, sqV: 0,             // squash-stretch spring (+ = stretch tall)
    rot: 0, lookX: 0, lookY: 0, blinkT: 2.5, blink: 0, landT: 0, hopT: 0, happyT: 0, popT: 0,
    mood: "idle", fear: 0, hx: 0, hy: 0,
    reset() { an.sq = 0; an.sqV = 0; an.rot = 0; an.lookX = 0; an.lookY = 0; an.landT = 0; an.happyT = 0; an.popT = 0; },
    impulse(v) { an.sqV += v; },
  };
  return an;
}
