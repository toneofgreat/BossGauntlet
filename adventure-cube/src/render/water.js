// water.js - animated streams/ponds/waterfalls: wavy surface, real reflections of the scene above (one copy of the
// reflected band per frame into a scratch canvas, then flipped strips with ripple offsets), depth tint, glints,
// foam at the banks and scrolling falls.
import { T } from "../sim/constants.js";
import { makeCanvas, css, shade } from "./util.js";

const WATER = 16;
const MASS = new Uint8Array(18); for (const c of [1, 2, 3, 4, 6, 7, 8, 9, 10, 11]) MASS[c] = 1;
const MAXRUN = 96;

export function createWater() {
  let A = null, band = null, fall = null, scratch = null, sg = null;
  const runs = new Float32Array(MAXRUN * 4); // x0, x1, y, depth
  const ripples = []; // {x, y, t0, amp}

  function setArt(art) {
    A = art;
    band = makeCanvas(4, 64); const bg = band.getContext("2d");
    const gr = bg.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, css(A.water.band, 0.55)); gr.addColorStop(0.25, css(A.water.band, 0.22)); gr.addColorStop(1, css(A.water.band, 0));
    bg.fillStyle = gr; bg.fillRect(0, 0, 4, 64);
    fall = makeCanvas(64, 128); const fg = fall.getContext("2d");
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * 64, y = Math.random() * 128, l = 20 + Math.random() * 40;
      fg.strokeStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.35})`; fg.lineWidth = 1 + Math.random() * 2.5;
      for (const dy of [0, -128, 128]) { fg.beginPath(); fg.moveTo(x, y + dy); fg.lineTo(x + (Math.random() - 0.5) * 2, y + dy + l); fg.stroke(); }
    }
  }

  function ripple(x, y, amp = 3) { if (ripples.length > 8) ripples.shift(); ripples.push({ x, y, t0: -1, amp }); }

  function waveY(wx, top, t, rowY) {
    let v = top + Math.sin(wx * 0.08 + t * 2.1) * 1.2 + Math.sin(wx * 0.21 - t * 3.3) * 0.55;
    for (let i = 0; i < ripples.length; i++) {
      const r = ripples[i];
      if (Math.abs(r.y - rowY) > 40) continue;
      const age = t - r.t0, d = Math.abs(wx - r.x);
      if (d > 140) continue;
      v += r.amp * Math.exp(-age * 1.6) * Math.sin(d * 0.22 - age * 10) * Math.exp(-d / 45);
    }
    return v;
  }

  // draw all visible water. canvas = the main canvas (for reflections); M = (a, e, f) world->device.
  function draw(ctx, canvas, get, W, H, a, e, f, vx0, vy0, vx1, vy1, t, quality, dpr) {
    for (const r of ripples) if (r.t0 < 0) r.t0 = t;
    while (ripples.length && t - ripples[0].t0 > 3) ripples.shift();
    const tx0 = Math.max(0, Math.floor(vx0 / T)), tx1 = Math.min(W - 1, Math.floor(vx1 / T));
    const ty0 = Math.max(0, Math.floor(vy0 / T)), ty1 = Math.min(H - 1, Math.floor(vy1 / T));
    // ---- find surface runs ----
    let nr = 0, anyWater = false;
    for (let y = ty0; y <= ty1; y++) {
      let x = tx0;
      while (x <= tx1) {
        const c = get(x, y);
        if (c !== WATER) { x++; continue; }
        anyWater = true;
        const up = get(x, y - 1);
        if (up === WATER || MASS[up]) { x++; continue; }
        const x0 = x; while (x <= tx1 && get(x, y) === WATER && get(x, y - 1) !== WATER && !MASS[get(x, y - 1)]) x++;
        if (nr < MAXRUN) { let d = 1; while (d < 4 && get(x0, y + d) === WATER) d++; runs[nr * 4] = x0; runs[nr * 4 + 1] = x - 1; runs[nr * 4 + 2] = y; runs[nr * 4 + 3] = d; nr++; }
      }
    }
    if (!anyWater) return;
    const Wt = A.water;

    // ---- reflections (copy the band above each surface, flip it below) ----
    if (quality !== "low" && nr) {
      if (!scratch || scratch.width !== canvas.width || scratch.height !== canvas.height) { scratch = makeCanvas(canvas.width, canvas.height); sg = scratch.getContext("2d"); }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const CWd = canvas.width, CHd = canvas.height;
      for (let i = 0; i < nr; i++) {
        const wx0 = runs[i * 4] * T, wx1 = (runs[i * 4 + 1] + 1) * T, sy = runs[i * 4 + 2] * T + 3, depth = Math.min(54, runs[i * 4 + 3] * T - 3);
        const dx0 = Math.max(0, Math.floor(a * wx0 + e)), dx1 = Math.min(CWd, Math.ceil(a * wx1 + e));
        const dsy = a * sy + f, dh = a * depth;
        const sy0 = Math.max(0, Math.floor(dsy - dh)), sy1 = Math.min(CHd, Math.ceil(dsy));
        if (dx1 <= dx0 || sy1 <= sy0) continue;
        sg.drawImage(canvas, dx0, sy0, dx1 - dx0, sy1 - sy0, dx0, sy0, dx1 - dx0, sy1 - sy0);
      }
      ctx.globalAlpha = 1;
    }

    // ---- body ----
    ctx.setTransform(a, 0, 0, a, e, f);
    ctx.beginPath();
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      if (get(x, y) !== WATER) continue;
      const up = get(x, y - 1);
      if (up === WATER || MASS[up]) { ctx.rect(x * T - 0.3, y * T - 0.3, T + 0.6, T + 0.6); continue; }
      ctx.moveTo(x * T - 0.3, y * T + T + 0.3);
      for (let wx = x * T; wx <= x * T + T; wx += 4) ctx.lineTo(wx, waveY(wx, y * T + 3, t, y * T));
      ctx.lineTo(x * T + T + 0.3, y * T + T + 0.3);
      ctx.closePath();
    }
    ctx.globalAlpha = Wt.bodyA; ctx.fillStyle = Wt.body; ctx.fill(); ctx.globalAlpha = 1;
    // depth: darker further down
    ctx.fillStyle = css(Wt.deep, 0.35);
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      if (get(x, y) !== WATER || get(x, y - 1) !== WATER) continue;
      ctx.fillRect(x * T, y * T, T, T);
      if (get(x, y - 2) === WATER) ctx.fillRect(x * T, y * T, T, T);
    }
    if (quality !== "low" && nr && scratch) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const CWd = canvas.width, CHd = canvas.height;
      const strip = Math.max(2, Math.round(2.5 * dpr));
      for (let i = 0; i < nr; i++) {
        const wx0 = runs[i * 4] * T, wx1 = (runs[i * 4 + 1] + 1) * T, sy = runs[i * 4 + 2] * T + 3, depth = Math.min(54, runs[i * 4 + 3] * T - 3);
        const dx0 = Math.max(0, Math.floor(a * wx0 + e)), dx1 = Math.min(CWd, Math.ceil(a * wx1 + e));
        const dsy = Math.round(a * sy + f), dh = Math.floor(a * depth);
        if (dx1 <= dx0) continue;
        for (let j = 0; j < dh; j += strip) {
          const srcY = dsy - j - strip;
          if (srcY < 0 || dsy + j >= CHd) break;
          const k = j / dh;
          ctx.globalAlpha = Wt.reflect * (1 - k) * (1 - k);
          const off = Math.sin(j * 0.35 / dpr + t * 3.2) * (0.6 + k * 3) * dpr;
          ctx.drawImage(scratch, dx0, srcY, dx1 - dx0, strip, dx0 + off, dsy + j, dx1 - dx0, strip);
        }
      }
      ctx.globalAlpha = 1;
      ctx.setTransform(a, 0, 0, a, e, f);
    }
    // ---- surfaces: light band, wave line, glints, foam ----
    ctx.lineWidth = 1.3; ctx.strokeStyle = css(Wt.surf, 0.85);
    for (let i = 0; i < nr; i++) {
      const x0 = runs[i * 4], x1 = runs[i * 4 + 1], y = runs[i * 4 + 2];
      const wx0 = x0 * T, wx1 = (x1 + 1) * T, top = y * T + 3;
      ctx.drawImage(band, wx0, top - 1, wx1 - wx0, 26);
      ctx.beginPath();
      for (let wx = wx0; wx <= wx1; wx += 3) { const wy = waveY(wx, top, t, y * T); wx === wx0 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy); }
      ctx.stroke();
      if (Wt.glint) {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        for (let wx = wx0 + 6; wx < wx1 - 4; wx += 11) {
          const tw = Math.sin(t * 2.7 + wx * 1.7) * 0.5 + 0.5;
          if (tw < 0.72) continue;
          ctx.globalAlpha = (tw - 0.72) * 3.5;
          ctx.fillRect(wx + Math.sin(wx) * 3, waveY(wx, top, t, y * T) + 2 + (wx % 5), 3.5, 0.9);
        }
        ctx.globalAlpha = 1;
      }
      // foam where the water meets a bank
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      if (MASS[get(x0 - 1, y)]) for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(wx0 + 2 + k * 3, top + 1 + Math.sin(t * 3 + k) * 0.8, 2.4 - k * 0.6, 1, 0, 0, 6.3); ctx.fill(); }
      if (MASS[get(x1 + 1, y)]) for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(wx1 - 2 - k * 3, top + 1 + Math.sin(t * 3.4 + k) * 0.8, 2.4 - k * 0.6, 1, 0, 0, 6.3); ctx.fill(); }
    }
    // ---- waterfalls: a water tile with water below and open air beside it ----
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      if (get(x, y) !== WATER || get(x, y + 1) !== WATER) continue;
      const l = get(x - 1, y), r = get(x + 1, y);
      if ((l === WATER || MASS[l]) && (r === WATER || MASS[r])) continue;
      const so = 127.99 - ((t * 300 + x * 37) % 128), h1 = Math.min(64, 128 - so);
      ctx.globalAlpha = 0.8;
      ctx.drawImage(fall, 0, so, 64, h1, x * T, y * T, T, h1 / 2);
      if (h1 < 64) ctx.drawImage(fall, 0, 0, 64, 64 - h1, x * T, y * T + h1 / 2, T, (64 - h1) / 2);
      ctx.globalAlpha = 1;
    }
  }

  return { setArt, draw, ripple, waveY };
}
