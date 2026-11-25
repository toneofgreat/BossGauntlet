// entities.js - drawing every level entity type (crumble, spring, mover, hazard, pulse, sign, deco) plus checkpoints
// and the goal. Works from the sim's compiled data in play mode and from the builder's live level in edit mode.
import { T, PULSE_WARN } from "../sim/constants.js";
import { makePath, pathPos } from "../sim/path.js";
import { drawSprite } from "./sprites.js";
import { PK } from "./particles.js";
import { css } from "./util.js";

const FLAG_ON = { forest: "#35c46a", highlands: "#ff8a3a", storm: "#56b6ff" };
const pathCache = new WeakMap();
const tmp = { x: 0, y: 0 };
const boltPts = new Float32Array(64);

export function editPath(e) {
  const key = e.x + "," + e.y + "," + e.speed + "," + e.mode + "," + e.phase + "," + (e.path ? e.path.map((p) => p[0] + ":" + p[1]).join(";") : "");
  let c = pathCache.get(e);
  if (!c || c.key !== key) { c = { key, P: makePath(e) }; pathCache.set(e, c); }
  return c.P;
}

// ---------------------------------------------------------------------------------------------- checkpoints + goal
export function drawCheckpoints(R) {
  const { ctx, spr, A, t } = R, cps = R.LV.checkpoints || [];
  const s = R.sim ? R.sim.state : null;
  const post = spr.post(), glow = spr.glow(FLAG_ON[A.id] || "#35c46a");
  for (let i = 0; i < cps.length; i++) {
    const p = cps[i], bx = p.x * T + 16, by = p.y * T + T;
    if (bx < R.vx0 - 60 || bx > R.vx1 + 60 || by < R.vy0 - 40 || by > R.vy1 + 120) continue;
    const active = s ? s.cp >= i : false;
    const since = R.cpAnim[i] ? t - R.cpAnim[i] : 9;
    const raise = active ? Math.min(1, since / 0.6) : 0;
    if (active) { const gs = 70 + Math.sin(t * 3 + i) * 6; ctx.globalAlpha = 0.5 * raise; ctx.drawImage(glow, bx - gs / 2, by - 66 - gs / 2, gs, gs); ctx.globalAlpha = 1; }
    drawSprite(ctx, post, bx, by);
    // cloth: hangs limp when inactive, flies and waves when active
    const x0 = bx + 2.5, y0 = by - 60;
    const len = 24, hgt = 14;
    ctx.beginPath();
    const n = 6;
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const wave = Math.sin(t * 7 - u * 4 + i) * 2.2 * u * (0.3 + raise);
      const ax = x0 + (raise * len * u + (1 - raise) * 2 * u), ay = y0 + (1 - raise) * len * u * 0.95 + wave;
      k ? ctx.lineTo(ax, ay) : ctx.moveTo(ax, ay);
    }
    for (let k = n; k >= 0; k--) {
      const u = k / n;
      const wave = Math.sin(t * 7 - u * 4 + i + 0.6) * 2.2 * u * (0.3 + raise);
      const ax = x0 + (raise * len * u + (1 - raise) * 2 * u) + (1 - raise) * hgt * 0.45, ay = y0 + hgt * raise + (1 - raise) * len * u * 0.95 + wave + (1 - raise) * 2;
      ctx.lineTo(ax, ay);
    }
    ctx.closePath();
    ctx.fillStyle = active ? FLAG_ON[A.id] : "#8f8477"; ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fillRect(x0, y0, 1.2 + raise * 20, 1.5);
    ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 0.7; ctx.stroke();
    if (R.mode === "edit") { ctx.fillStyle = "#fff"; ctx.font = "700 9px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText(String(i + 1), bx, by - 70); }
  }
}

export function drawGoal(R) {
  const { ctx, spr, A, t } = R, g = R.LV.goal;
  if (!g) return;
  const bx = g.x * T + 16, by = g.y * T + T;
  if (bx < R.vx0 - 120 || bx > R.vx1 + 120 || by < R.vy0 - 40 || by > R.vy1 + 200) return;
  const glow = spr.glow("#ffe08a"), gs = 190 + Math.sin(t * 2.2) * 14;
  ctx.globalAlpha = 0.55; ctx.drawImage(glow, bx - gs / 2, by - 56 - gs / 2, gs, gs); ctx.globalAlpha = 1;
  drawSprite(ctx, spr.goal(), bx, by);
  // banner with a star
  const top = by - 100, w = 26, h = 34;
  ctx.beginPath();
  for (let k = 0; k <= 6; k++) { const u = k / 6, sway = Math.sin(t * 2.4 + u * 2) * 2 * u; k ? ctx.lineTo(bx - w / 2 + sway, top + u * h) : ctx.moveTo(bx - w / 2, top); }
  ctx.lineTo(bx + Math.sin(t * 2.4 + 2) * 2, top + h + 6);
  for (let k = 6; k >= 0; k--) { const u = k / 6, sway = Math.sin(t * 2.4 + u * 2 + 0.4) * 2 * u; ctx.lineTo(bx + w / 2 + sway, top + u * h); }
  ctx.closePath();
  ctx.fillStyle = "#d8a42a"; ctx.fill(); ctx.strokeStyle = "#8a5a10"; ctx.lineWidth = 1; ctx.stroke();
  const sx = bx + Math.sin(t * 2.4 + 1) * 1.2, sy = top + 15;
  ctx.fillStyle = "#fff6c8"; ctx.beginPath();
  for (let k = 0; k < 10; k++) { const r = k % 2 ? 3.2 : 7.5, a = -Math.PI / 2 + (k / 10) * 6.283; ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); }
  ctx.closePath(); ctx.fill();
  if (R.parts && R.mode !== "edit" && Math.random() < R.dt * 6) R.parts.spawn(PK.ember, bx + (Math.random() - 0.5) * 50, by - Math.random() * 80, (Math.random() - 0.5) * 6, -12 - Math.random() * 12, 1.6 + Math.random(), 4 + Math.random() * 3, 0);
}

// ---------------------------------------------------------------------------------------------- static-ish entities
export function drawSigns(R) {
  const { ctx, spr } = R;
  if (R.hideSigns) return;
  for (const e of R.signs) {
    const bx = e.x * T + 16, by = e.y * T + T;
    if (bx < R.vx0 - 90 || bx > R.vx1 + 90 || by < R.vy0 - 10 || by > R.vy1 + 90) continue;
    drawSprite(ctx, spr.sign(R.touch && typeof e.touch === "string" && e.touch ? e.touch : e.text), bx, by);
  }
}

export function drawSprings(R) {
  const { ctx, spr, t } = R;
  const list = R.springs;
  for (let i = 0; i < list.length; i++) {
    const e = list[i], bx = e.x * T + 16, by = e.y * T + T;
    if (bx < R.vx0 - 40 || bx > R.vx1 + 40 || by < R.vy0 - 40 || by > R.vy1 + 40) continue;
    const since = R.springAnim[i] ? t - R.springAnim[i] : 9;
    let sq = 0;
    if (since < 0.6) sq = Math.exp(-since * 7) * Math.cos(since * 30) * 0.35;
    const s = spr.spring(e.p);
    ctx.save(); ctx.translate(bx, by); ctx.scale(1 + sq * 0.8, 1 - sq);
    drawSprite(ctx, s, 0, 0);
    ctx.restore();
  }
}

export function drawCrumbles(R) {
  const { ctx, spr, t } = R;
  const st = R.sim ? R.sim.state.crumble : null;
  for (let i = 0; i < R.crumbles.length; i++) {
    const e = R.crumbles[i], X = e.x * T, Y = e.y * T, w = e.w | 0 || 1;
    if (X + w * T < R.vx0 - 10 || X > R.vx1 + 10 || Y > R.vy1 + 10 || Y + T < R.vy0 - 10) continue;
    const v = st ? st[i] : 0;
    if (v < 0) continue;
    let jx = 0, jy = 0, al = 1;
    if (v > 0) { const k = v / 32; jx = (Math.random() - 0.5) * (1 + k * 3); jy = (Math.random() - 0.5) * k * 1.6; }
    const back = R.crumbleBack[i] ? t - R.crumbleBack[i] : 9;
    if (back < 0.35) { al = back / 0.35; jy -= (1 - al) * 6; }
    ctx.globalAlpha = al;
    drawSprite(ctx, spr.crumble(w), X + jx, Y + jy);
    if (v > 0) { ctx.globalAlpha = Math.min(1, v / 20); drawSprite(ctx, spr.crumbleCracks(w), X + jx, Y + jy); }
    ctx.globalAlpha = 1;
  }
}

export function drawMovers(R) {
  const { ctx, spr } = R;
  const fr = R.f - 1 + R.alpha;
  for (let i = 0; i < R.movers.length; i++) {
    const e = R.movers[i];
    if (R.sim) R.sim.moverPos(i, fr, tmp); else pathPos(editPath(e), R.f, tmp);
    const w = (e.w || 3) * T;
    if (tmp.x + w < R.vx0 - 20 || tmp.x > R.vx1 + 20 || tmp.y < R.vy0 - 40 || tmp.y > R.vy1 + 40) continue;
    drawSprite(ctx, spr.mover(e.kind || "log", e.w || 3), tmp.x, tmp.y);
  }
}

export function drawHazards(R) {
  const { ctx, spr, t } = R;
  const fr = R.f - 1 + R.alpha;
  for (let i = 0; i < R.hazards.length; i++) {
    const e = R.hazards[i], r = (e.r || 0.45) * T;
    let cx, cy;
    if (R.sim) { R.sim.hazardPos(i, fr, tmp); cx = tmp.x; cy = tmp.y; } else { pathPos(editPath(e), R.f, tmp); cx = tmp.x + T / 2; cy = tmp.y + T / 2; }
    if (cx < R.vx0 - r - 30 || cx > R.vx1 + r + 30 || cy < R.vy0 - r - 30 || cy > R.vy1 + r + 30) continue;
    const kind = e.kind || "thornball", s = spr.hazard(kind), sc = r / 32;
    if (kind === "thornball" || kind === "boulder") {
      const rot = (cx + cy * 0.3) / Math.max(4, r);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); drawSprite(ctx, s, 0, 0, sc); ctx.restore();
      if (kind === "boulder") { ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(cx, cy + r + 1, r * 0.8, 2.5, 0, 0, 6.3); ctx.fill(); }
    } else if (kind === "wasp") {
      // face the direction of travel
      let dir = 1;
      if (R.sim) { R.sim.hazardPos(i, fr - 2, tmp); dir = cx >= tmp.x ? 1 : -1; } else { pathPos(editPath(e), R.f - 2, tmp); dir = cx >= tmp.x + T / 2 ? 1 : -1; }
      const bob = Math.sin(t * 9 + i) * 1.5;
      ctx.save(); ctx.translate(cx, cy + bob); ctx.scale(dir * sc, sc);
      const wing = spr.waspWing(), fl = Math.abs(Math.sin(t * 60 + i));
      ctx.globalAlpha = 0.8;
      ctx.save(); ctx.translate(2, -6); ctx.scale(1, 0.3 + fl * 0.9); drawSprite(ctx, wing, 0, 0, 1.2); ctx.restore();
      drawSprite(ctx, s, 0, 0);
      ctx.save(); ctx.translate(6, -7); ctx.scale(1, 0.3 + (1 - fl) * 0.9); drawSprite(ctx, wing, 0, 0, 1.2); ctx.restore();
      ctx.globalAlpha = 1;
      ctx.restore();
    } else { // spark
      const pul = 0.8 + Math.sin(t * 20 + i) * 0.2;
      ctx.globalAlpha = pul; drawSprite(ctx, s, cx, cy, sc); ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(220,240,255,0.9)"; ctx.lineWidth = 1.2; ctx.lineJoin = "round";
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = Math.random() * 6.283, l = r * (1 + Math.random() * 0.6);
        ctx.moveTo(cx, cy);
        for (let j = 1; j <= 4; j++) { const u = j / 4; ctx.lineTo(cx + Math.cos(a) * l * u + (Math.random() - 0.5) * 6, cy + Math.sin(a) * l * u + (Math.random() - 0.5) * 6); }
      }
      ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, r * 0.32, 0, 6.3); ctx.fill();
    }
  }
}

// ---------------------------------------------------------------------------------------------- pulses
export function drawPulses(R) {
  const { ctx, t, spr } = R;
  const fr = R.f;
  for (let i = 0; i < R.pulses.length; i++) {
    const e = R.pulses[i];
    const X = e.x * T, Y = e.y * T, Wp = (e.w || 1) * T, Hp = (e.h || 1) * T;
    if (X + Wp < R.vx0 - 30 || X > R.vx1 + 30 || Y + Hp < R.vy0 - 60 || Y > R.vy1 + 30) continue;
    const period = e.period || 180, on = e.on || 30, off = e.offset || 0;
    const q = (((fr + off) % period) + period) % period;
    const active = q < on, warn = !active && q >= period - PULSE_WARN ? (q - (period - PULSE_WARN)) / PULSE_WARN : 0;
    const kind = e.kind || "lightning";
    if (R.mode === "edit") { ctx.fillStyle = "rgba(255,230,120,0.08)"; ctx.fillRect(X, Y, Wp, Hp); ctx.strokeStyle = "rgba(255,230,120,0.5)"; ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.strokeRect(X + 0.5, Y + 0.5, Wp - 1, Hp - 1); ctx.setLineDash([]); }
    if (kind === "lightning") {
      // the strike zone is always marked: a scorched patch below and a charged cloud above
      ctx.fillStyle = "rgba(10,10,20,0.35)"; ctx.beginPath(); ctx.ellipse(X + Wp / 2, Y + Hp, Wp * 0.5 + 6, 3.5, 0, 0, 6.3); ctx.fill();
      const cg = spr.glow("#8fa8ff");
      const cAlpha = 0.25 + warn * 0.6 + (active ? 0.6 : 0);
      ctx.globalAlpha = Math.min(1, cAlpha); ctx.drawImage(cg, X + Wp / 2 - Wp / 2 - 24, Y - 34, Wp + 48, 48); ctx.globalAlpha = 1;
      if (warn > 0) {
        ctx.globalAlpha = warn * 0.35; ctx.drawImage(spr.glow("#bcd0ff"), X - 10, Y, Wp + 20, Hp); ctx.globalAlpha = 1;
        if (Math.random() < warn) { ctx.strokeStyle = `rgba(200,220,255,${warn})`; ctx.lineWidth = 1; ctx.beginPath(); const sx = X + Math.random() * Wp; ctx.moveTo(sx, Y - 4); ctx.lineTo(sx + (Math.random() - 0.5) * 10, Y + 8 + Math.random() * 10); ctx.lineTo(sx + (Math.random() - 0.5) * 14, Y + 20 + Math.random() * 14); ctx.stroke(); }
        if (R.parts && Math.random() < warn * 0.5) R.parts.spawn(PK.spark, X + Math.random() * Wp, Y + Hp - 2, (Math.random() - 0.5) * 30, -20, 0.3, 6, 0);
      }
      if (active) {
        ctx.globalAlpha = 0.55; ctx.drawImage(spr.glow("#cfe0ff"), X - 24, Y - 10, Wp + 48, Hp + 20); ctx.globalAlpha = 1;
        const nb = Math.max(1, Math.round(Wp / 40));
        const seed = Math.floor(fr / 3);
        for (let b = 0; b < nb; b++) {
          let n = 0, x = X + (b + 0.5) * (Wp / nb), y = Y - 20;
          let hs = (seed * 9301 + b * 49297 + i * 233) % 233280;
          const rnd = () => { hs = (hs * 9301 + 49297) % 233280; return hs / 233280; };
          boltPts[n++] = x; boltPts[n++] = y;
          while (y < Y + Hp && n < 62) { y += 8 + rnd() * 12; x += (rnd() - 0.5) * 16; x = Math.max(X + 3, Math.min(X + Wp - 3, x)); boltPts[n++] = x; boltPts[n++] = Math.min(y, Y + Hp); }
          for (const [w, c] of [[9, "rgba(140,170,255,0.25)"], [4.5, "rgba(190,210,255,0.6)"], [1.8, "#ffffff"]]) {
            ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(boltPts[0], boltPts[1]);
            for (let k = 2; k < n; k += 2) ctx.lineTo(boltPts[k], boltPts[k + 1]);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 0.9; const ig = spr.glow("#ffffff"); ctx.drawImage(ig, X + Wp / 2 - 30, Y + Hp - 30, 60, 50); ctx.globalAlpha = 1;
        if (R.parts && q === 0 && R.newFrame) for (let k = 0; k < 10; k++) R.parts.spawn(PK.spark, X + Math.random() * Wp, Y + Hp - 3, (Math.random() - 0.5) * 160, -60 - Math.random() * 120, 0.5, 7, 0);
        if (q === 0 && R.newFrame && R.onStrike) R.onStrike(X + Wp / 2, Y + Hp);
      }
    } else if (kind === "geyser") {
      // vent always visible
      ctx.fillStyle = "rgba(20,30,40,0.6)"; ctx.beginPath(); ctx.ellipse(X + Wp / 2, Y + Hp - 1, Wp * 0.42, 3.5, 0, 0, 6.3); ctx.fill();
      ctx.strokeStyle = "rgba(160,200,230,0.6)"; ctx.lineWidth = 1.5; ctx.stroke();
      if (warn > 0) {
        for (let k = 0; k < 4; k++) { const bx = X + Wp / 2 + Math.sin(t * 9 + k * 2) * Wp * 0.3, by = Y + Hp - 3 - ((t * 40 + k * 7) % (6 + warn * 18)); ctx.fillStyle = `rgba(200,235,255,${0.4 + warn * 0.5})`; ctx.beginPath(); ctx.arc(bx, by, 1.4 + warn * 1.5, 0, 6.3); ctx.fill(); }
        if (R.parts && Math.random() < warn * 0.6) R.parts.spawn(PK.drop, X + Wp / 2 + (Math.random() - 0.5) * Wp * 0.6, Y + Hp - 4, (Math.random() - 0.5) * 40, -90 - warn * 160, 0.6, 5, 0);
      }
      if (active) {
        const rise = Math.min(1, q / 6), top = Y + Hp - Hp * rise;
        const gr = ctx.createLinearGradient(0, top, 0, Y + Hp);
        gr.addColorStop(0, "rgba(235,250,255,0.95)"); gr.addColorStop(0.4, "rgba(150,210,240,0.85)"); gr.addColorStop(1, "rgba(80,150,200,0.8)");
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.moveTo(X + Wp * 0.22, Y + Hp);
        for (let yy = Y + Hp; yy >= top; yy -= 6) ctx.lineTo(X + Wp * 0.18 + Math.sin(yy * 0.2 + t * 18) * 2.5, yy);
        ctx.lineTo(X + Wp * 0.82, top);
        for (let yy = top; yy <= Y + Hp; yy += 6) ctx.lineTo(X + Wp * 0.82 + Math.sin(yy * 0.23 - t * 17) * 2.5, yy);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) { const sx = X + Wp * (0.35 + k * 0.15); ctx.beginPath(); ctx.moveTo(sx, Y + Hp - ((t * 300 + k * 40) % Hp)); ctx.lineTo(sx, Y + Hp - ((t * 300 + k * 40) % Hp) - 12); ctx.stroke(); }
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        for (let k = 0; k < 7; k++) { const a = t * 6 + k; ctx.beginPath(); ctx.arc(X + Wp / 2 + Math.cos(a * 1.3) * Wp * 0.45, top + Math.sin(a) * 4, 3 + (k % 3), 0, 6.3); ctx.fill(); }
        if (R.parts && Math.random() < 0.8) R.parts.spawn(PK.drop, X + Wp / 2 + (Math.random() - 0.5) * Wp, top + 4, (Math.random() - 0.5) * 140, -60 - Math.random() * 80, 0.7, 5, 0);
      }
    } else { // steam
      ctx.fillStyle = "rgba(30,26,24,0.6)"; ctx.beginPath(); ctx.ellipse(X + Wp / 2, Y + Hp - 1, Wp * 0.4, 3, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = "rgba(255,150,80,0.35)"; ctx.beginPath(); ctx.ellipse(X + Wp / 2, Y + Hp - 1, Wp * 0.25, 1.6, 0, 0, 6.3); ctx.fill();
      const puff = spr.glow("#f2f2f2");
      if (warn > 0) {
        for (let k = 0; k < 3; k++) { const ph = ((t * 0.9 + k / 3) % 1), sy = Y + Hp - ph * Hp * 0.5 * (0.4 + warn); ctx.globalAlpha = (1 - ph) * warn * 0.5; const s = 14 + ph * 20; ctx.drawImage(puff, X + Wp / 2 - s / 2 + Math.sin(t * 2 + k) * 4, sy - s / 2, s, s); }
        ctx.globalAlpha = 1;
      }
      if (active) {
        const n = Math.max(4, Math.round(Hp / 14));
        for (let k = 0; k < n; k++) {
          const ph = ((t * 1.6 + k / n) % 1), sy = Y + Hp - ph * Hp, s = Wp * (0.9 + ph * 0.8) + 10;
          ctx.globalAlpha = 0.75 * Math.min(1, (1 - ph) * 2.5) * Math.min(1, q / 4 + 0.3);
          ctx.drawImage(puff, X + Wp / 2 - s / 2 + Math.sin(t * 3 + k * 1.7) * 5, sy - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------- deco
export function drawDecoList(R, list, n0, n1, front) {
  const { ctx } = R;
  for (let i = n0; i < n1; i++) {
    const d = list[i];
    if (d.front !== front) continue;
    if (d.x + d.hw < R.vx0 || d.x - d.hw > R.vx1 || d.y < R.vy0 - 4 || d.y - d.hh > R.vy1) continue;
    const s = d.spr, k = d.k;
    ctx.globalAlpha = d.alpha;
    if (d.flip) {
      ctx.setTransform(-R.a * k, 0, 0, R.a * k, R.a * d.x + R.e, R.a * d.y + R.ff);
      ctx.drawImage(s.c, s.ox, s.oy, s.w, s.h);
      ctx.setTransform(R.a, 0, 0, R.a, R.e, R.ff);
    } else ctx.drawImage(s.c, d.x + s.ox * k, d.y + s.oy * k, s.w * k, s.h * k);
  }
  ctx.globalAlpha = 1;
}
