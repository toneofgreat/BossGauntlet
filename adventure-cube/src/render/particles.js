// particles.js - one pooled particle system (struct-of-arrays, no allocation per particle), world space.
// Kinds: dust, leaf, spark, drop, chip, confetti, puff, ring, ember
import { makeCanvas, softDot, css, shade } from "./util.js";

export const PK = { dust: 0, leaf: 1, spark: 2, drop: 3, chip: 4, confetti: 5, puff: 6, ring: 7, ember: 8 };
const MAX = 480;
const CONF = ["#ff5a5a", "#ffd23f", "#3ddc6a", "#4aa8ff", "#c06aff", "#ff9a3a", "#ffffff"];

export function createParticles() {
  const x = new Float32Array(MAX), y = new Float32Array(MAX), vx = new Float32Array(MAX), vy = new Float32Array(MAX);
  const life = new Float32Array(MAX), max = new Float32Array(MAX), size = new Float32Array(MAX), rot = new Float32Array(MAX), vr = new Float32Array(MAX);
  const kind = new Uint8Array(MAX), col = new Uint8Array(MAX);
  let n = 0, A = null, spr = null, budget = MAX;

  function setArt(art) {
    A = art;
    const leafSpr = (c) => { const cv = makeCanvas(24, 12), g = cv.getContext("2d"); g.fillStyle = shade(c, 0.8); g.beginPath(); g.ellipse(12, 6, 11, 5, 0, 0, 6.3); g.fill(); g.fillStyle = shade(c, 1.12); g.beginPath(); g.ellipse(11, 5, 8, 2.6, 0, 0, 6.3); g.fill(); g.strokeStyle = shade(c, 0.6); g.lineWidth = 0.8; g.beginPath(); g.moveTo(2, 6); g.lineTo(22, 6); g.stroke(); return cv; };
    const chip = (c) => { const cv = makeCanvas(12, 12), g = cv.getContext("2d"); g.fillStyle = c; g.beginPath(); g.moveTo(2, 4); g.lineTo(7, 1); g.lineTo(11, 6); g.lineTo(6, 11); g.lineTo(1, 9); g.closePath(); g.fill(); g.fillStyle = "rgba(255,255,255,0.3)"; g.beginPath(); g.moveTo(2, 4); g.lineTo(7, 1); g.lineTo(7, 5); g.closePath(); g.fill(); return cv; };
    const star = makeCanvas(24, 24); { const g = star.getContext("2d"); const gr = g.createRadialGradient(12, 12, 0, 12, 12, 12); gr.addColorStop(0, "rgba(255,255,240,1)"); gr.addColorStop(0.25, "rgba(255,240,170,0.7)"); gr.addColorStop(1, "rgba(255,220,120,0)"); g.fillStyle = gr; g.fillRect(0, 0, 24, 24); g.fillStyle = "rgba(255,255,255,0.95)"; g.beginPath(); g.moveTo(12, 1); g.lineTo(13, 11); g.lineTo(23, 12); g.lineTo(13, 13); g.lineTo(12, 23); g.lineTo(11, 13); g.lineTo(1, 12); g.lineTo(11, 11); g.closePath(); g.fill(); }
    const drop = makeCanvas(10, 14); { const g = drop.getContext("2d"); g.fillStyle = css(A.water.surf, 0.9); g.beginPath(); g.moveTo(5, 1); g.quadraticCurveTo(9.5, 8, 5, 13); g.quadraticCurveTo(0.5, 8, 5, 1); g.fill(); g.fillStyle = "rgba(255,255,255,0.8)"; g.fillRect(3.5, 6, 1.5, 3); }
    const ring = makeCanvas(32, 12); { const g = ring.getContext("2d"); g.strokeStyle = css(A.water.surf, 0.9); g.lineWidth = 1.5; g.beginPath(); g.ellipse(16, 6, 14, 4.5, 0, 0, 6.3); g.stroke(); }
    spr = {
      dust: [softDot(32, A.dust, 0, 0.9), softDot(32, shade(A.dust, 1.25), 0, 0.8)],
      leaf: A.leaf.map(leafSpr),
      spark: [star],
      drop: [drop],
      chip: [chip(A.rock.base), chip(A.soil.light), chip(A.rock.dark)],
      puff: [softDot(48, "#ffffff", 0, 0.85), softDot(48, A.id === "storm" ? "#8f98b0" : "#e9e2d2", 0, 0.8)],
      ring: [ring],
      ember: [softDot(16, "#ffe9a0", 0.1, 1), softDot(16, "#b8ff8a", 0.1, 1), softDot(16, "#9fd8ff", 0.1, 1)],
    };
  }

  function spawn(k, px, py, pvx, pvy, l, s, c = 0) {
    if (n >= budget) return -1;
    const i = n++;
    x[i] = px; y[i] = py; vx[i] = pvx; vy[i] = pvy; life[i] = l; max[i] = l; size[i] = s; kind[i] = k; col[i] = c;
    rot[i] = Math.random() * 6.283; vr[i] = (Math.random() - 0.5) * (k === PK.leaf ? 6 : k === PK.confetti ? 14 : k === PK.chip ? 12 : 1);
    return i;
  }

  function update(dt, t) {
    let i = 0;
    while (i < n) {
      life[i] -= dt;
      if (life[i] <= 0) { // swap-remove
        n--; x[i] = x[n]; y[i] = y[n]; vx[i] = vx[n]; vy[i] = vy[n]; life[i] = life[n]; max[i] = max[n]; size[i] = size[n]; rot[i] = rot[n]; vr[i] = vr[n]; kind[i] = kind[n]; col[i] = col[n];
        continue;
      }
      const k = kind[i];
      let g = 0, drag = 0;
      switch (k) {
        case PK.dust: g = -14; drag = 3.2; break;
        case PK.leaf: g = 46; drag = 2.2; vx[i] += Math.sin(t * 3 + i) * 60 * dt; break;
        case PK.spark: g = -10; drag = 2.5; break;
        case PK.drop: g = 820; drag = 0.2; break;
        case PK.chip: g = 900; drag = 0.4; break;
        case PK.confetti: g = 160; drag = 2.4; vx[i] += Math.sin(t * 5 + i * 1.7) * 90 * dt; break;
        case PK.puff: g = -24; drag = 2.8; break;
        case PK.ring: g = 0; drag = 0; break;
        case PK.ember: g = -8; drag = 1.2; vx[i] += Math.sin(t * 2 + i) * 20 * dt; break;
      }
      vy[i] += g * dt;
      const d = Math.max(0, 1 - drag * dt);
      vx[i] *= d; vy[i] *= d;
      x[i] += vx[i] * dt; y[i] += vy[i] * dt; rot[i] += vr[i] * dt;
      i++;
    }
  }

  // M: world->device transform (a, e, f); cull to view rect
  function draw(ctx, a, e, f, vx0, vy0, vx1, vy1) {
    for (let i = 0; i < n; i++) {
      const px = x[i], py = y[i];
      if (px < vx0 - 40 || px > vx1 + 40 || py < vy0 - 40 || py > vy1 + 40) continue;
      const k = kind[i], u = life[i] / max[i]; // 1 -> 0
      let img = null, s = size[i], al = 1, w = 0, h = 0;
      switch (k) {
        case PK.dust: img = spr.dust[col[i] & 1]; s *= 1 + (1 - u) * 1.6; al = u * 0.55; break;
        case PK.leaf: img = spr.leaf[col[i] % spr.leaf.length]; al = Math.min(1, u * 3); break;
        case PK.spark: img = spr.spark[0]; al = u; s *= 0.6 + u * 0.6; break;
        case PK.drop: img = spr.drop[0]; al = Math.min(1, u * 2.5); break;
        case PK.chip: img = spr.chip[col[i] % 3]; al = Math.min(1, u * 3); break;
        case PK.puff: img = spr.puff[col[i] & 1]; s *= 1 + (1 - u) * 1.3; al = u * 0.7; break;
        case PK.ring: img = spr.ring[0]; s *= 1 + (1 - u) * 2.2; al = u; break;
        case PK.ember: img = spr.ember[col[i] % 3]; al = Math.min(1, u * 2) * (0.6 + 0.4 * Math.sin(life[i] * 9 + i)); break;
      }
      ctx.globalAlpha = al > 1 ? 1 : al;
      if (k === PK.confetti) {
        const c = Math.cos(rot[i]), sn = Math.sin(rot[i]);
        ctx.setTransform(a * c, a * sn, -a * sn * Math.abs(Math.cos(rot[i] * 1.7)), a * c * Math.abs(Math.cos(rot[i] * 1.7)) + a * 0.001, a * px + e, a * py + f);
        ctx.fillStyle = CONF[col[i] % CONF.length]; ctx.fillRect(-s / 2, -s * 0.3, s, s * 0.6);
        continue;
      }
      w = img.width; h = img.height;
      const sc = s / Math.max(w, h);
      if (k === PK.leaf || k === PK.chip || k === PK.drop) {
        let r = rot[i];
        if (k === PK.drop) r = Math.atan2(vy[i], vx[i]) - Math.PI / 2;
        const c = Math.cos(r) * a * sc, sn = Math.sin(r) * a * sc;
        ctx.setTransform(c, sn, -sn, c, a * px + e, a * py + f);
        ctx.drawImage(img, -w / 2, -h / 2);
      } else {
        ctx.setTransform(a * sc, 0, 0, a * sc, a * px + e, a * py + f);
        ctx.drawImage(img, -w / 2, -h / 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  return {
    setArt, spawn, update, draw,
    clear() { n = 0; },
    setBudget(b) { budget = Math.min(MAX, b); },
    get count() { return n; },
  };
}
