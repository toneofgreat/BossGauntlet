// ambient.js - screen-space life and weather: rain (two depths, one stroke each), pollen motes, fireflies,
// butterflies. Everything is pooled in typed arrays and parallaxes with the camera so it feels part of the world.
import { softDot, css } from "./util.js";
import { T, isFullSolid, isSlope, charToCode } from "../sim/constants.js";

export function createAmbient() {
  let A = null, W = 960, H = 540, k = 1;
  const RN = 420;
  const rx = new Float32Array(RN), ry = new Float32Array(RN), rz = new Float32Array(RN);
  const MN = 40;
  const mx = new Float32Array(MN), my = new Float32Array(MN), mp = new Float32Array(MN);
  const FN = 24;
  const fx = new Float32Array(FN), fy = new Float32Array(FN), fp = new Float32Array(FN);
  const BN = 4;
  const bx = new Float32Array(BN), by = new Float32Array(BN), bp = new Float32Array(BN);
  let mote = null, fly = null, lastCX = null, lastCY = null;
  let nRain = 0, nMote = 0, nFly = 0, nBut = 0;

  function seed() {
    for (let i = 0; i < RN; i++) { rx[i] = Math.random() * W; ry[i] = Math.random() * H; rz[i] = Math.random(); }
    for (let i = 0; i < MN; i++) { mx[i] = Math.random() * W; my[i] = Math.random() * H; mp[i] = Math.random() * 100; }
    for (let i = 0; i < FN; i++) { fx[i] = Math.random() * W; fy[i] = H * (0.35 + Math.random() * 0.6); fp[i] = Math.random() * 100; }
    for (let i = 0; i < BN; i++) { bx[i] = Math.random() * W; by[i] = H * (0.4 + Math.random() * 0.4); bp[i] = Math.random() * 100; }
  }

  return {
    setArt(art) {
      A = art;
      mote = softDot(16, A.id === "highlands" ? "#ffe2a8" : "#fff8d8", 0.1, 1);
      fly = softDot(24, "#d8ff8a", 0.05, 1);
      const am = A.ambient;
      nRain = am.rain || 0; nMote = am.motes || 0; nFly = am.fireflies || 0; nBut = am.butterflies || 0;
      seed();
    },
    resize(w, h) { W = w; H = h; k = h / 720; seed(); },
    draw(ctx, view, quality) {
      if (!A) return;
      const cam = view.camera, t = view.time, dt = Math.min(0.05, view.dt || 0.016);
      const cxp = cam.x * cam.zoom, cyp = cam.y * cam.zoom;
      let dcx = lastCX === null ? 0 : cxp - lastCX, dcy = lastCY === null ? 0 : cyp - lastCY;
      if (Math.abs(dcx) > 300 || Math.abs(dcy) > 300) { dcx = 0; dcy = 0; }
      lastCX = cxp; lastCY = cyp;
      const low = quality === "low";
      const sim = view.sim || null, lv = sim ? null : view.level || null;
      const inGround = (sx, sy) => {
        const tx = Math.floor((cam.x + (sx - W / 2) / cam.zoom) / T), ty = Math.floor((cam.y + (sy - H / 2) / cam.zoom) / T);
        let c = 0;
        if (sim) c = sim.tileAt(tx, ty);
        else if (lv && ty >= 0 && ty < lv.h && tx >= 0 && tx < lv.w) c = charToCode(lv.tiles[ty][tx]);
        return c > 0 && (isFullSolid(c) || isSlope(c));
      };
      // ---- rain ----
      if (nRain) {
        const n = low ? nRain >> 1 : nRain, wind = 220 * k;
        ctx.lineCap = "round";
        for (let layer = 0; layer < 2; layer++) {
          ctx.beginPath();
          for (let i = layer; i < n; i += 2) {
            const z = rz[i], sp = (900 + z * 900) * k;
            ry[i] += sp * dt - dcy * (0.6 + z * 0.4); rx[i] += wind * dt - dcx * (0.6 + z * 0.4);
            if (ry[i] > H + 20) { ry[i] -= H + 60; rx[i] = Math.random() * W; }
            if (ry[i] < -60) ry[i] += H + 60;
            if (rx[i] > W + 40) rx[i] -= W + 80; else if (rx[i] < -40) rx[i] += W + 80;
            const len = (10 + z * 16) * k;
            ctx.moveTo(rx[i], ry[i]); ctx.lineTo(rx[i] - wind / sp * len, ry[i] - len);
          }
          ctx.strokeStyle = layer ? "rgba(190,205,235,0.42)" : "rgba(150,165,200,0.25)";
          ctx.lineWidth = (layer ? 1.4 : 0.9) * Math.max(1, k);
          ctx.stroke();
        }
      }
      // ---- pollen / dust motes in the light ----
      for (let i = 0; i < nMote; i++) {
        mx[i] += (Math.sin(t * 0.3 + mp[i]) * 8 + 4) * dt * k - dcx; my[i] += Math.cos(t * 0.4 + mp[i] * 1.3) * 6 * dt * k - dcy;
        if (mx[i] < -10) mx[i] += W + 20; else if (mx[i] > W + 10) mx[i] -= W + 20;
        if (my[i] < -10) my[i] += H + 20; else if (my[i] > H + 10) my[i] -= H + 20;
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.7 + mp[i] * 3));
        const s = (2 + (i % 3)) * k * 1.6;
        ctx.globalAlpha = tw * 0.8; ctx.drawImage(mote, mx[i] - s, my[i] - s, s * 2, s * 2);
      }
      // ---- fireflies ----
      for (let i = 0; i < nFly; i++) {
        fx[i] += Math.sin(t * 0.7 + fp[i]) * 22 * dt * k - dcx; fy[i] += Math.cos(t * 0.9 + fp[i] * 1.7) * 16 * dt * k - dcy;
        if (fx[i] < -10) fx[i] += W + 20; else if (fx[i] > W + 10) fx[i] -= W + 20;
        if (fy[i] < H * 0.2) fy[i] += H * 0.75; else if (fy[i] > H + 10) fy[i] -= H * 0.75;
        const glow = Math.max(0, Math.sin(t * 2.2 + fp[i] * 5));
        if (glow < 0.05) continue;
        const s = 9 * k;
        ctx.globalAlpha = glow; ctx.drawImage(fly, fx[i] - s, fy[i] - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1;
      // ---- butterflies ----
      for (let i = 0; i < nBut; i++) {
        bx[i] += (Math.sin(t * 0.5 + bp[i]) * 40 + 10) * dt * k - dcx; by[i] += Math.sin(t * 1.3 + bp[i] * 2) * 30 * dt * k - dcy;
        if (bx[i] < -20) bx[i] += W + 40; else if (bx[i] > W + 20) bx[i] -= W + 40;
        if (by[i] < H * 0.25) by[i] += H * 0.5; else if (by[i] > H * 0.95) by[i] -= H * 0.5;
        // never inside the ground: lift a butterfly out of solid tiles (screen -> world -> tile)
        if (sim || lv) for (let n = 0; n < 8 && inGround(bx[i], by[i]); n++) by[i] -= T * cam.zoom * 0.5;
        if (by[i] < 0) continue;
        const flap = Math.abs(Math.sin(t * 14 + bp[i])), s = 4.2 * k;
        const col = i % 2 ? "#ff9a2a" : "#7ab8ff";
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(bx[i] - s * 0.6 * flap, by[i], s * flap + 0.3, s * 0.8, -0.3, 0, 6.3); ctx.ellipse(bx[i] + s * 0.6 * flap, by[i], s * flap + 0.3, s * 0.8, 0.3, 0, 6.3); ctx.fill();
        ctx.fillStyle = "#2a1a10"; ctx.fillRect(bx[i] - 0.6, by[i] - s * 0.6, 1.2, s * 1.2);
      }
    },
  };
}
