// overlay.js - build-mode overlay on top of the normal world look: out-of-bounds shade, grid, level bounds, mover /
// hazard paths (dotted, with arrows and ghost stops), start ghost cube, hover outline, brush ghost, rect tool,
// selection outline.
import { T, PW, PH } from "../sim/constants.js";
import { drawSprite } from "./sprites.js";
import { drawCube } from "./cube.js";

const BLANK_LOOK = { x: 0.3, y: 0 };
const ghostP = { sx: 1, sy: 1, rot: 0, look: BLANK_LOOK, blink: 0, mood: "idle", alpha: 0.6, t: 0, fear: 0 };

export function entityBounds(e, spr) {
  const x = e.x * T, y = e.y * T;
  switch (e.t) {
    case "crumble": return [x, y, (e.w || 1) * T, T];
    case "spring": return [x, y, T, T];
    case "mover": return [x, y - 2, (e.w || 3) * T, 20];
    case "hazard": { const r = (e.r || 0.45) * T; return [x + 16 - r, y + 16 - r, r * 2, r * 2]; }
    case "pulse": return [x, y, (e.w || 1) * T, (e.h || 1) * T];
    case "sign": { const s = spr.sign(e.text || ""); return [x + 16 + s.ox, y + T + s.oy, s.w, s.h]; }
    case "deco": { const s = spr.deco(e.kind || "bush", 0), k = e.s || 1; return [x + 16 + s.ox * k, y + T + s.oy * k, s.w * k, s.h * k]; }
  }
  return [x, y, T, T];
}

function arrow(ctx, x0, y0, x1, y1, z) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, a = Math.atan2(y1 - y0, x1 - x0), s = 6 / Math.max(0.6, z);
  ctx.moveTo(mx + Math.cos(a) * s, my + Math.sin(a) * s);
  ctx.lineTo(mx + Math.cos(a + 2.5) * s, my + Math.sin(a + 2.5) * s);
  ctx.lineTo(mx + Math.cos(a - 2.5) * s, my + Math.sin(a - 2.5) * s);
  ctx.closePath();
}

// R: renderer frame context (ctx at WORLD transform, view rect, sprites, thumbs, cube paint)
export function drawEditOverlay(R, view) {
  const ctx = R.ctx, LV = view.level || R.LV, ed = view.editor || {}, z = view.camera.zoom;
  const W = LV.w * T, H = LV.h * T;
  const lw = 1 / z;
  // outside the level
  ctx.fillStyle = "rgba(6,10,8,0.55)";
  const x0 = R.vx0 - 4, x1 = R.vx1 + 4, y0 = R.vy0 - 4, y1 = R.vy1 + 4;
  if (x0 < 0) ctx.fillRect(x0, y0, -x0, y1 - y0);
  if (x1 > W) ctx.fillRect(W, y0, x1 - W, y1 - y0);
  if (y0 < 0) ctx.fillRect(Math.max(0, x0), y0, Math.min(W, x1) - Math.max(0, x0), -y0);
  if (y1 > H) ctx.fillRect(Math.max(0, x0), H, Math.min(W, x1) - Math.max(0, x0), y1 - H);
  // grid
  if (ed.grid) {
    const gx0 = Math.max(0, Math.floor(R.vx0 / T)), gx1 = Math.min(LV.w, Math.ceil(R.vx1 / T));
    const gy0 = Math.max(0, Math.floor(R.vy0 / T)), gy1 = Math.min(LV.h, Math.ceil(R.vy1 / T));
    if (z * T >= 6) {
      ctx.beginPath();
      for (let x = gx0; x <= gx1; x++) if (x % 8) { ctx.moveTo(x * T, gy0 * T); ctx.lineTo(x * T, gy1 * T); }
      for (let y = gy0; y <= gy1; y++) if (y % 8) { ctx.moveTo(gx0 * T, y * T); ctx.lineTo(gx1 * T, y * T); }
      ctx.strokeStyle = "rgba(255,255,255,0.11)"; ctx.lineWidth = lw; ctx.stroke();
    }
    ctx.beginPath();
    for (let x = Math.ceil(gx0 / 8) * 8; x <= gx1; x += 8) { ctx.moveTo(x * T, gy0 * T); ctx.lineTo(x * T, gy1 * T); }
    for (let y = Math.ceil(gy0 / 8) * 8; y <= gy1; y += 8) { ctx.moveTo(gx0 * T, y * T); ctx.lineTo(gx1 * T, y * T); }
    ctx.strokeStyle = "rgba(255,255,255,0.24)"; ctx.lineWidth = lw; ctx.stroke();
  }
  // bounds
  ctx.strokeStyle = "rgba(255,210,120,0.9)"; ctx.lineWidth = 2 * lw; ctx.setLineDash([8 * lw, 5 * lw]);
  ctx.strokeRect(0, 0, W, H); ctx.setLineDash([]);

  // paths
  if (ed.showPaths !== false) {
    ctx.lineWidth = 2 * lw;
    for (const e of LV.entities || []) {
      if ((e.t !== "mover" && e.t !== "hazard") || !Array.isArray(e.path) || !e.path.length) continue;
      const ox = e.t === "mover" ? ((e.w || 3) * T) / 2 : T / 2, oy = e.t === "mover" ? 0 : T / 2;
      const pts = [[e.x * T + ox, e.y * T + oy]];
      for (const p of e.path) pts.push([(e.x + p[0]) * T + ox, (e.y + p[1]) * T + oy]);
      if (e.mode === "loop") pts.push(pts[0]);
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.setLineDash([]); ctx.lineWidth = 4 * lw; ctx.stroke();
      ctx.strokeStyle = e.t === "mover" ? "rgba(140,220,255,0.95)" : "rgba(255,140,120,0.95)"; ctx.setLineDash([6 * lw, 5 * lw]); ctx.lineWidth = 2 * lw; ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); for (let i = 0; i + 1 < pts.length; i++) arrow(ctx, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], z);
      ctx.fillStyle = ctx.strokeStyle; ctx.fill();
      // ghost stops
      ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = lw;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        if (e.t === "mover") ctx.strokeRect(p[0] - ox, p[1], (e.w || 3) * T, 14);
        else { ctx.beginPath(); ctx.arc(p[0], p[1], (e.r || 0.45) * T, 0, 6.3); ctx.stroke(); }
      }
    }
  }
  // start ghost cube
  const st = LV.start;
  if (st) {
    const cx = st.x * T + T / 2, cy = (st.y + 1) * T - PH / 2;
    ctx.save(); ctx.translate(cx, cy); ghostP.t = view.time; ghostP.look = BLANK_LOOK; ghostP.blink = (view.time % 3.2) < 0.12 ? 1 : 0;
    drawCube(ctx, R.cubePaint, ghostP); ctx.restore();
    label(ctx, "START", cx, cy - 22, z);
  }
  if (LV.goal) label(ctx, "GOAL", LV.goal.x * T + 16, (LV.goal.y - 3) * T + 10, z);

  // rect tool
  if (ed.rect) {
    const r = ed.rect, rx = Math.min(r.x0, r.x1) * T, ry = Math.min(r.y0, r.y1) * T, rw = (Math.abs(r.x1 - r.x0) + 1) * T, rh = (Math.abs(r.y1 - r.y0) + 1) * T;
    ctx.fillStyle = ed.tool === "erase" ? "rgba(255,90,90,0.14)" : "rgba(120,200,255,0.14)"; ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = ed.tool === "erase" ? "rgba(255,110,110,0.95)" : "rgba(140,210,255,0.95)"; ctx.lineWidth = 2 * lw; ctx.strokeRect(rx, ry, rw, rh);
  }
  // hover + ghost
  if (ed.hover) {
    const h = ed.hover, hx = h.tx * T, hy = h.ty * T;
    const g = ed.ghost;
    if (g && ed.tool !== "erase" && ed.tool !== "select" && ed.tool !== "eyedropper") {
      ctx.globalAlpha = 0.62;
      if (g.tile) { const th = R.tileThumb(g.tile); if (th) for (let yy = 0; yy < (h.h || 1); yy++) for (let xx = 0; xx < (h.w || 1); xx++) ctx.drawImage(th, hx + xx * T, hy + yy * T, T, T); }
      else if (g.entity) drawGhostEntity(R, Object.assign({ x: h.tx, y: h.ty }, g.entity, { x: h.tx, y: h.ty }), view);
      ctx.globalAlpha = 1;
    }
    if (ed.marker && ed.tool !== "erase") {
      ctx.globalAlpha = 0.6;
      if (ed.marker === "start") { ctx.save(); ctx.translate(hx + 16, hy + T - PH / 2); drawCube(ctx, R.cubePaint, ghostP); ctx.restore(); }
      else if (ed.marker === "goal") drawSprite(ctx, R.spr.goal(), hx + 16, hy + T);
      else drawSprite(ctx, R.spr.post(), hx + 16, hy + T);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = ed.tool === "erase" ? "#ff6060" : "#ffffff"; ctx.lineWidth = 2 * lw;
    ctx.strokeRect(hx, hy, T * (h.w || 1), T * (h.h || 1));
    ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = lw; ctx.strokeRect(hx - lw * 1.5, hy - lw * 1.5, T * (h.w || 1) + lw * 3, T * (h.h || 1) + lw * 3);
  }
  // selection
  if (ed.selected >= 0 && LV.entities && LV.entities[ed.selected]) {
    const b = entityBounds(LV.entities[ed.selected], R.spr), p = 3 + Math.sin(view.time * 6) * 1.2;
    ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 4 * lw; ctx.strokeRect(b[0] - p, b[1] - p, b[2] + p * 2, b[3] + p * 2);
    ctx.strokeStyle = "#7cd4ff"; ctx.lineWidth = 2 * lw; ctx.strokeRect(b[0] - p, b[1] - p, b[2] + p * 2, b[3] + p * 2);
  }
}

function label(ctx, text, x, y, z) {
  const s = Math.max(1, 1 / z);
  ctx.font = `800 ${9 * s}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + 8 * s;
  ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(x - w / 2, y - 7 * s, w, 14 * s);
  ctx.fillStyle = "#fff"; ctx.fillText(text, x, y + 0.5);
}

export function drawGhostEntity(R, e, view) {
  const ctx = R.ctx, spr = R.spr, X = e.x * T, Y = e.y * T;
  switch (e.t) {
    case "crumble": drawSprite(ctx, spr.crumble(e.w || 1), X, Y); break;
    case "spring": drawSprite(ctx, spr.spring(e.p || 1), X + 16, Y + T); break;
    case "mover": drawSprite(ctx, spr.mover(e.kind || "log", e.w || 3), X, Y); break;
    case "hazard": { const r = (e.r || 0.45) * T; ctx.save(); ctx.translate(X + 16, Y + 16); drawSprite(ctx, spr.hazard(e.kind || "thornball"), 0, 0, r / 32); ctx.restore(); break; }
    case "pulse": ctx.fillStyle = "rgba(255,230,120,0.35)"; ctx.fillRect(X, Y, (e.w || 1) * T, (e.h || 1) * T); break;
    case "sign": drawSprite(ctx, spr.sign(e.text || "Sign"), X + 16, Y + T); break;
    case "deco": drawSprite(ctx, spr.deco(e.kind || "bush", 0), X + 16, Y + T, e.s || 1); break;
  }
}
