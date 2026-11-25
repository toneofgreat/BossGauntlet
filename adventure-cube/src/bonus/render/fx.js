// render/fx.js - one pooled particle system for the bonus level (struct-of-arrays, no per-particle allocation).
// World px, seconds. Normal kinds are drawn before the darkness pass; glowing kinds (spark, ember, firework, sparkle,
// glint) after it with "lighter" so they shine at night.
import { makeCanvas, softDot, css, shade, TAU } from "./kit.js";

export const FX = { dust: 0, chip: 1, leaf: 2, smoke: 3, puff: 4, drop: 5, spark: 6, ember: 7, firework: 8, sparkle: 9, ring: 10, feather: 11 };
const GLOW = new Uint8Array(12); GLOW[FX.spark] = GLOW[FX.ember] = GLOW[FX.firework] = GLOW[FX.sparkle] = 1;
export const CHIP_COL = {
  wood: "#b8894f", bark: "#5a3b22", dirt: "#6b4a2f", grass: "#5a9a34", stone: "#8d8b84", coal: "#2a2a2e", iron: "#b8643a",
  gold: "#e8b938", crystal: "#8fe3ff", clay: "#a9765c", sand: "#d8c48a", gravel: "#8a847b", plank: "#c79a5e", brick: "#b5553a",
  glass: "#d8f4ff", bedrock: "#3d3a3a", snow: "#eef4f8", hide: "#a0764e", berry: "#c2334a", leaf: "#5f9a36", white: "#f4f1ea",
};
const CK = Object.keys(CHIP_COL);
export const chipIndex = (name) => Math.max(0, CK.indexOf(name));
const MAX = 520;

export function createFx() {
  const x = new Float32Array(MAX), y = new Float32Array(MAX), vx = new Float32Array(MAX), vy = new Float32Array(MAX);
  const life = new Float32Array(MAX), max = new Float32Array(MAX), size = new Float32Array(MAX), rot = new Float32Array(MAX), vr = new Float32Array(MAX);
  const kind = new Uint8Array(MAX), col = new Uint8Array(MAX);
  let n = 0;
  // sprites
  const chip = CK.map((k) => {
    const c = makeCanvas(16, 16), g = c.getContext("2d"), b = CHIP_COL[k];
    g.fillStyle = shade(b, 0.7); g.beginPath(); g.moveTo(2, 5); g.lineTo(9, 1); g.lineTo(15, 7); g.lineTo(8, 15); g.lineTo(1, 11); g.closePath(); g.fill();
    g.fillStyle = b; g.beginPath(); g.moveTo(3, 5); g.lineTo(9, 2); g.lineTo(13, 7); g.lineTo(8, 12); g.lineTo(3, 10); g.closePath(); g.fill();
    g.fillStyle = "rgba(255,255,255,0.35)"; g.beginPath(); g.moveTo(3, 5); g.lineTo(9, 2); g.lineTo(8, 7); g.closePath(); g.fill();
    return c;
  });
  const dust = CK.map((k) => softDot(32, CHIP_COL[k], 0, 0.85));
  const leafCols = ["#4f8a2e", "#6aa53a", "#93bf45", "#c8a33c", "#2f5b22", "#7fb04a"];
  const leaf = leafCols.map((c0) => {
    const c = makeCanvas(24, 12), g = c.getContext("2d");
    g.fillStyle = shade(c0, 0.8); g.beginPath(); g.ellipse(12, 6, 11, 5, 0, 0, TAU); g.fill();
    g.fillStyle = shade(c0, 1.12); g.beginPath(); g.ellipse(11, 5, 8, 2.6, 0, 0, TAU); g.fill();
    g.strokeStyle = shade(c0, 0.6); g.lineWidth = 0.8; g.beginPath(); g.moveTo(2, 6); g.lineTo(22, 6); g.stroke();
    return c;
  });
  const feather = (() => { const c = makeCanvas(24, 10), g = c.getContext("2d"); g.fillStyle = "#e8e2d0"; g.beginPath(); g.ellipse(12, 5, 11, 3.6, 0, 0, TAU); g.fill(); g.fillStyle = "#a0764e"; g.fillRect(4, 4.4, 16, 1.2); g.fillStyle = "rgba(120,90,60,0.5)"; for (let i = 0; i < 4; i++) g.fillRect(6 + i * 4, 2, 1, 6); return c; })();
  const smoke = [softDot(64, "#9b9a98", 0, 0.7), softDot(64, "#d8d4cc", 0, 0.7)];
  const puff = [softDot(48, "#ffffff", 0, 0.9), softDot(48, "#e9e2d2", 0, 0.85), softDot(48, "#b9cf9a", 0, 0.8)];
  const spark = (() => { const c = makeCanvas(24, 24), g = c.getContext("2d"); const gr = g.createRadialGradient(12, 12, 0, 12, 12, 12); gr.addColorStop(0, "rgba(255,255,240,1)"); gr.addColorStop(0.3, "rgba(255,210,120,0.8)"); gr.addColorStop(1, "rgba(255,150,40,0)"); g.fillStyle = gr; g.fillRect(0, 0, 24, 24); return c; })();
  const star = (() => { const c = makeCanvas(24, 24), g = c.getContext("2d"); const gr = g.createRadialGradient(12, 12, 0, 12, 12, 12); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,250,200,0.6)"); gr.addColorStop(1, "rgba(255,240,180,0)"); g.fillStyle = gr; g.fillRect(0, 0, 24, 24); g.fillStyle = "#fff"; g.beginPath(); g.moveTo(12, 0); g.lineTo(13, 11); g.lineTo(24, 12); g.lineTo(13, 13); g.lineTo(12, 24); g.lineTo(11, 13); g.lineTo(0, 12); g.lineTo(11, 11); g.closePath(); g.fill(); return c; })();
  const FWC = ["#ff5a5a", "#ffd23f", "#3ddc6a", "#4aa8ff", "#c06aff", "#ff9a3a", "#ffffff", "#8fe3ff"];
  const fw = FWC.map((c0) => softDot(24, c0, 0.15, 1));
  const ember = [softDot(16, "#ffcf70", 0.15, 1), softDot(16, "#ff8a3a", 0.15, 1)];
  const drop = (() => { const c = makeCanvas(10, 14), g = c.getContext("2d"); g.fillStyle = "rgba(210,244,255,0.9)"; g.beginPath(); g.moveTo(5, 1); g.quadraticCurveTo(9.5, 8, 5, 13); g.quadraticCurveTo(0.5, 8, 5, 1); g.fill(); return c; })();
  const ring = (() => { const c = makeCanvas(32, 12), g = c.getContext("2d"); g.strokeStyle = "rgba(220,248,255,0.9)"; g.lineWidth = 1.5; g.beginPath(); g.ellipse(16, 6, 14, 4.5, 0, 0, TAU); g.stroke(); return c; })();

  function emit(k, px, py, pvx, pvy, l, s, c = 0) {
    let i;
    if (n < MAX) i = n++;
    else { i = (Math.random() * MAX) | 0; } // recycle a random one when full
    x[i] = px; y[i] = py; vx[i] = pvx; vy[i] = pvy; life[i] = l; max[i] = l; size[i] = s; kind[i] = k; col[i] = c;
    rot[i] = Math.random() * TAU;
    vr[i] = (Math.random() - 0.5) * (k === FX.leaf || k === FX.feather ? 5 : k === FX.chip ? 14 : 1);
    return i;
  }
  // helpers
  function burst(k, px, py, count, speed, l, s, c = 0, up = 0.5) {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 2 * (1 - up * 0.6), v = speed * (0.35 + Math.random() * 0.75);
      emit(k, px + (Math.random() - 0.5) * 6, py + (Math.random() - 0.5) * 6, Math.cos(a) * v, Math.sin(a) * v, l * (0.6 + Math.random() * 0.6), s * (0.7 + Math.random() * 0.6), c);
    }
  }
  function update(dt) {
    let i = 0;
    while (i < n) {
      life[i] -= dt;
      if (life[i] <= 0) {
        n--; x[i] = x[n]; y[i] = y[n]; vx[i] = vx[n]; vy[i] = vy[n]; life[i] = life[n]; max[i] = max[n]; size[i] = size[n]; rot[i] = rot[n]; vr[i] = vr[n]; kind[i] = kind[n]; col[i] = col[n];
        continue;
      }
      let gr = 0, drag = 0;
      switch (kind[i]) {
        case FX.dust: gr = -12; drag = 3; break;
        case FX.chip: gr = 900; drag = 0.5; break;
        case FX.leaf: gr = 40; drag = 2.2; vx[i] += Math.sin(life[i] * 3 + i) * 60 * dt; break;
        case FX.feather: gr = 26; drag = 2.6; vx[i] += Math.sin(life[i] * 4 + i) * 70 * dt; break;
        case FX.smoke: gr = -26; drag = 0.9; vx[i] += 9 * dt; break;
        case FX.puff: gr = -20; drag = 3; break;
        case FX.drop: gr = 800; drag = 0.2; break;
        case FX.spark: gr = 500; drag = 1.2; break;
        case FX.ember: gr = -30; drag = 1.2; vx[i] += Math.sin(life[i] * 5 + i) * 30 * dt; break;
        case FX.firework: gr = 90; drag = 1.6; break;
        case FX.sparkle: gr = -6; drag = 2; break;
        case FX.ring: break;
      }
      vy[i] += gr * dt;
      const d = drag ? Math.max(0, 1 - drag * dt) : 1;
      vx[i] *= d; vy[i] *= d;
      x[i] += vx[i] * dt; y[i] += vy[i] * dt; rot[i] += vr[i] * dt;
      i++;
    }
  }
  // glow=false: normal kinds; glow=true: glowing kinds (caller sets "lighter")
  function draw(ctx, a, e, f, vx0, vy0, vx1, vy1, glow) {
    for (let i = 0; i < n; i++) {
      const k = kind[i];
      if ((GLOW[k] === 1) !== glow) continue;
      const px = x[i], py = y[i];
      if (px < vx0 - 60 || px > vx1 + 60 || py < vy0 - 60 || py > vy1 + 60) continue;
      const u = life[i] / max[i];
      let img, s = size[i], al = 1, rotate = false;
      switch (k) {
        case FX.dust: img = dust[col[i] % dust.length]; s *= 1 + (1 - u) * 1.5; al = u * 0.6; break;
        case FX.chip: img = chip[col[i] % chip.length]; al = Math.min(1, u * 4); rotate = true; break;
        case FX.leaf: img = leaf[col[i] % leaf.length]; al = Math.min(1, u * 3); rotate = true; break;
        case FX.feather: img = feather; al = Math.min(1, u * 3); rotate = true; break;
        case FX.smoke: img = smoke[col[i] & 1]; s *= 0.6 + (1 - u) * 1.8; al = Math.min(1, (1 - u) * 6) * u * 0.55; break;
        case FX.puff: img = puff[col[i] % 3]; s *= 0.8 + (1 - u) * 1.4; al = u * 0.85; break;
        case FX.drop: img = drop; al = Math.min(1, u * 3); break;
        case FX.spark: img = spark; al = u; s *= 0.5 + u * 0.6; break;
        case FX.ember: img = ember[col[i] & 1]; al = Math.min(1, u * 2) * (0.6 + 0.4 * Math.sin(life[i] * 11 + i)); break;
        case FX.firework: img = fw[col[i] % fw.length]; al = Math.min(1, u * 1.6); break;
        case FX.sparkle: img = star; al = Math.sin(u * Math.PI); break;
        case FX.ring: img = ring; s *= 1 + (1 - u) * 2.2; al = u; break;
      }
      ctx.globalAlpha = al > 1 ? 1 : al;
      const w = img.width, h = img.height, sc = s / Math.max(w, h);
      if (rotate) {
        const c = Math.cos(rot[i]) * a * sc, sn = Math.sin(rot[i]) * a * sc;
        ctx.setTransform(c, sn, -sn, c, a * px + e, a * py + f);
      } else ctx.setTransform(a * sc, 0, 0, a * sc, a * px + e, a * py + f);
      ctx.drawImage(img, -w / 2, -h / 2);
    }
    ctx.globalAlpha = 1;
  }
  return { emit, burst, update, draw, clear() { n = 0; }, get count() { return n; }, FWC };
}
