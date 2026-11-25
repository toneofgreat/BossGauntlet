// sprites.js - baked entity + decoration art (painted once per theme, drawn with drawImage every frame).
// A sprite is { c: canvas, ox, oy, w, h }: draw at (anchorX + ox, anchorY + oy) with size (w, h) in WORLD px.
import { T } from "../sim/constants.js";
import { makeCanvas, rng, hash, css, shade, mix, rrect, softDot, supportsFilter } from "./util.js";
import { paintFoliage } from "./art.js";

const R = 2; // canvas px per world px for small sprites

export function makeSprite(w, h, ox, oy, fn, res = R) {
  const c = makeCanvas(w * res, h * res), g = c.getContext("2d");
  g.scale(res, res); g.translate(-ox, -oy);
  fn(g);
  return { c, ox, oy, w, h };
}
export function drawSprite(ctx, s, x, y, k = 1) {
  ctx.drawImage(s.c, x + s.ox * k, y + s.oy * k, s.w * k, s.h * k);
}

const LEAVES = {
  forest: ["#173a17", "#2a5a22", "#437f2f", "#6fa83e", "#a8d062"],
  highlands: ["#2a3218", "#4a5424", "#76783a", "#b39a48", "#f0cf7c"],
  storm: ["#0c1212", "#162020", "#22302c", "#34463e", "#4d6258"],
};
const BIRCH_LEAVES = {
  forest: ["#2f5418", "#4f7a26", "#7aa83a", "#acd25a", "#e0f08a"],
  highlands: ["#6a3e14", "#8a5a1c", "#c98a2a", "#eab84a", "#ffe08a"],
  storm: ["#141a18", "#1d2422", "#2c3632", "#3c4a44", "#56665c"],
};

// lit blob: a radial gradient whose bright side faces the light
function litBlob(g, x, y, r, cols, L, k = 1) {
  const gr = g.createRadialGradient(x + L.x * r * 0.45, y + L.y * r * 0.45, r * 0.1, x, y, r);
  gr.addColorStop(0, cols[2 + (k > 0.6 ? 1 : 0)]); gr.addColorStop(0.55, cols[1]); gr.addColorStop(1, cols[0]);
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
}

function trunk(g, A, x0, y0, x1, y1, w0, w1, col, rough = 1) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l;
  g.beginPath();
  g.moveTo(x0 + nx * w0, y0 + ny * w0);
  g.quadraticCurveTo((x0 + x1) / 2 + nx * (w0 + w1) * 0.5 + rough, (y0 + y1) / 2, x1 + nx * w1, y1 + ny * w1);
  g.lineTo(x1 - nx * w1, y1 - ny * w1);
  g.quadraticCurveTo((x0 + x1) / 2 - nx * (w0 + w1) * 0.5 + rough, (y0 + y1) / 2, x0 - nx * w0, y0 - ny * w0);
  g.closePath();
  const gr = g.createLinearGradient(x0 - w0, 0, x0 + w0, 0);
  const lit = A.light.x < 0;
  gr.addColorStop(0, lit ? shade(col, 1.25) : shade(col, 0.55)); gr.addColorStop(0.5, col); gr.addColorStop(1, lit ? shade(col, 0.5) : shade(col, 1.2));
  g.fillStyle = gr; g.fill();
}

// ---------------------------------------------------------------- decoration kinds (base at 0,0 = bottom center)
const DECO = {
  oak(A, r) {
    const L = A.light, cols = LEAVES[A.id];
    const h = 190 + r() * 40;
    return makeSprite(240, h + 20, -120, -h - 6, (g) => {
      const bark = A.id === "storm" ? "#2a2522" : "#4d3826";
      for (let i = -1; i <= 1; i += 2) { g.fillStyle = shade(bark, 0.8); g.beginPath(); g.moveTo(i * 4, -16); g.quadraticCurveTo(i * 12, -4, i * 22, 2); g.lineTo(i * 2, 2); g.closePath(); g.fill(); }
      trunk(g, A, 0, 2, 4, -h * 0.6, 10, 6, bark, 3);
      trunk(g, A, 2, -h * 0.42, -40, -h * 0.68, 4.5, 2, bark);
      trunk(g, A, 3, -h * 0.47, 44, -h * 0.72, 4.5, 2, bark);
      g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1;
      for (let i = 0; i < 7; i++) { const x = -6 + i * 2 + r() * 1.5; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + r() * 3 - 1, -h * 0.25, x * 0.6 + 2, -h * 0.5); g.stroke(); }
      paintFoliage(g, 0, -h * 0.72, 92, 62, cols, L, r, { clusters: 15, leaf: 4.2, per: 34 });
    }, 1.5);
  },
  pine(A, r) {
    const h = 180 + r() * 60, L = A.light;
    const cols = A.id === "highlands" ? ["#141d18", "#1f2d24", "#33452e", "#6a6a3a", "#d0905a"] : A.id === "storm" ? ["#080c0e", "#101718", "#1b2826", "#2c3d3c", "#4a5e66"] : ["#0e2614", "#173d1f", "#26592c", "#3f7a3a", "#6fa654"];
    return makeSprite(140, h + 12, -70, -h - 6, (g) => {
      trunk(g, A, 0, 2, 0, -h * 0.92, 5, 1.5, "#3a2a1e");
      const tiers = 10;
      for (let i = 0; i < tiers; i++) {
        const t = i / (tiers - 1), y = -h * 0.1 - t * h * 0.84, w = (1 - t * 0.88) * 60 + 5, th = 26 - t * 12;
        for (const side of [-1, 1]) {
          // a drooping bough: top edge from the trunk to the tip, jagged needle edge underneath
          const tipX = side * w, tipY = y + 6 + r() * 5;
          g.beginPath(); g.moveTo(0, y - th);
          g.quadraticCurveTo(side * w * 0.5, y - th * 0.55, tipX, tipY);
          const n = 9;
          for (let k = 1; k <= n; k++) { const u = 1 - k / n, px = tipX * u, py = tipY * u + (y + 1) * (1 - u) + (k % 2 ? 4 + r() * 4 : -1); g.lineTo(px, py); }
          g.closePath();
          const lit = side * L.x > 0;
          const gr = g.createLinearGradient(0, y - th, 0, y + 8);
          gr.addColorStop(0, lit ? cols[3] : cols[2]); gr.addColorStop(0.6, lit ? cols[2] : cols[1]); gr.addColorStop(1, cols[0]);
          g.fillStyle = gr; g.fill();
          // needle strokes on the upper surface
          g.lineWidth = 1;
          for (let k = 0; k < 16; k++) {
            const u = r(), px = tipX * u, py = (y - th) * (1 - u) + tipY * u - 1 + r() * th * 0.5 * (1 - u);
            g.strokeStyle = lit ? (r() < 0.5 ? cols[4] : cols[3]) : cols[2]; g.globalAlpha = 0.7;
            g.beginPath(); g.moveTo(px, py); g.lineTo(px + side * (2 + r() * 3), py + 2 + r() * 2); g.stroke();
          }
          g.globalAlpha = 1;
          if (A.id === "storm") { g.fillStyle = "rgba(205,216,238,0.8)"; g.beginPath(); g.moveTo(side * 2, y - th + 1); g.quadraticCurveTo(side * w * 0.5, y - th * 0.55 - 1, tipX * 0.9, tipY - 2); g.quadraticCurveTo(side * w * 0.45, y - th * 0.4, side * 2, y - th + 4); g.closePath(); g.fill(); }
        }
      }
      g.fillStyle = cols[2]; g.beginPath(); g.moveTo(0, -h * 1.0); g.lineTo(2, -h * 0.9); g.lineTo(-2, -h * 0.9); g.fill();
    }, 1.5);
  },
  birch(A, r) {
    const h = 170 + r() * 50, L = A.light, cols = BIRCH_LEAVES[A.id], lean = (r() - 0.5) * 14;
    return makeSprite(170, h + 14, -85, -h - 6, (g) => {
      const w0 = 6, w1 = 3;
      g.beginPath(); g.moveTo(-w0, 2); g.quadraticCurveTo(-w0 + lean * 0.3, -h * 0.4, lean - w1, -h * 0.85); g.lineTo(lean + w1, -h * 0.85); g.quadraticCurveTo(w0 + lean * 0.3, -h * 0.4, w0, 2); g.closePath();
      const gr = g.createLinearGradient(-w0, 0, w0, 0);
      gr.addColorStop(0, L.x < 0 ? "#fbf8f0" : "#8f8b80"); gr.addColorStop(0.5, "#ddd8ca"); gr.addColorStop(1, L.x < 0 ? "#7f7b70" : "#fbf8f0");
      g.fillStyle = gr; g.fill();
      for (let i = 0; i < 26; i++) { const t = r(), y = -t * h * 0.8, x = lean * t * 0.8 + (r() - 0.5) * 6; g.fillStyle = "rgba(30,25,20,0.85)"; g.fillRect(x - 2.5, y, 3 + r() * 3, 1 + r() * 1.4); }
      paintFoliage(g, lean, -h * 0.78, 58, 56, cols, L, r, { clusters: 11, leaf: 3.4, per: 26 });
    }, 1.5);
  },
  deadtree(A, r) {
    const h = 150 + r() * 50, bend = A.id === "storm" ? 18 : 6;
    // the canvas is a bit wider than before and every branch end is pulled inside it (with its stroke + curve
    // bulge as margin): the recursion can reach ~1.4h, which used to leave straight cut lines through the crown
    const HW = 110, TOP = -h - 6, BOT = 8;
    return makeSprite(HW * 2, h + 14, -HW, -h - 6, (g) => {
      g.lineCap = "round";
      const col = A.id === "storm" ? "#2b2a2c" : "#5a4a3c";
      const branch = (x, y, ang, len, w, d) => {
        let dx = Math.cos(ang) * len + bend * (1 - d / 6) * 0.3, dy = Math.sin(ang) * len;
        const m = w * 0.5 + len * 0.16 + 2;
        let t = 1;
        if (x + dx > HW - m) t = Math.min(t, (HW - m - x) / dx);
        if (x + dx < -HW + m) t = Math.min(t, (-HW + m - x) / dx);
        if (y + dy < TOP + m) t = Math.min(t, (TOP + m - y) / dy);
        if (y + dy > BOT - m) t = Math.min(t, (BOT - m - y) / dy);
        t = Math.max(0, t); dx *= t; dy *= t; len *= t;
        const x2 = x + dx, y2 = y + dy;
        g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + x2) / 2 + (r() - 0.5) * len * 0.3, (y + y2) / 2, x2, y2); g.stroke();
        g.strokeStyle = "rgba(170,180,210,0.18)"; g.lineWidth = w * 0.3; g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x2 + 1, y2); g.stroke();
        if (d > 0 && len > 8) {
          const n = 2 + (r() < 0.4 ? 1 : 0);
          for (let i = 0; i < n; i++) branch(x2, y2, ang + (r() - 0.5) * 1.5 + (A.id === "storm" ? 0.12 : 0), len * (0.55 + r() * 0.2), w * 0.62, d - 1);
        }
      };
      branch(0, 2, -Math.PI / 2 + 0.05, h * 0.42, 11, 5);
    }, 1.5);
  },
  bush(A, r) {
    const cols = LEAVES[A.id], L = A.light;
    return makeSprite(84, 52, -42, -48, (g) => {
      paintFoliage(g, 0, -17, 33, 18, cols, L, r, { clusters: 7, leaf: 3.2, per: 22 });
      if (A.id === "forest") for (let i = 0; i < 7; i++) { g.fillStyle = r() < 0.5 ? "#c8283a" : "#3a3a9a"; g.beginPath(); g.arc((r() - 0.5) * 44, -8 - r() * 22, 1.5, 0, 6.3); g.fill(); }
    });
  },
  fern(A, r) {
    const cols = LEAVES[A.id];
    return makeSprite(70, 40, -35, -38, (g) => {
      g.lineCap = "round";
      const n = 7;
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1, ang = -Math.PI / 2 + side * (0.25 + (i / n) * 1.1), len = 22 + r() * 10;
        const ex = Math.cos(ang) * len, ey = Math.sin(ang) * len * 0.9, cx = ex * 0.4, cy = ey * 1.2 - 4;
        g.strokeStyle = cols[1]; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(cx, cy, ex, ey + 6); g.stroke();
        for (let k = 1; k < 12; k++) {
          const t = k / 12, x = (1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * cx + t * t * ex, y = 2 * (1 - t) * t * cy + t * t * (ey + 6);
          const l = (1 - t) * 6 + 1.5;
          g.strokeStyle = cols[2 + (k % 2)]; g.lineWidth = 1.3;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - l * 0.7, y - l * 0.6); g.moveTo(x, y); g.lineTo(x + l * 0.7, y - l * 0.6); g.stroke();
        }
      }
    });
  },
  flowers(A, r) {
    const pal = A.id === "highlands" ? ["#b98ad8", "#e7c35a", "#f0e6d2"] : A.id === "storm" ? ["#6d7fa8", "#8f9ab8", "#4f5f80"] : ["#ffffff", "#ffd640", "#e05a8a", "#8a6aff"];
    return makeSprite(40, 26, -20, -24, (g) => {
      for (let i = 0; i < 8; i++) {
        const x = (r() - 0.5) * 30, h = 8 + r() * 12;
        g.strokeStyle = LEAVES[A.id][1]; g.lineWidth = 1; g.beginPath(); g.moveTo(x * 0.6, 0); g.quadraticCurveTo(x * 0.8, -h * 0.5, x, -h); g.stroke();
        const col = pal[Math.floor(r() * pal.length)];
        for (let k = 0; k < 5; k++) { const a = k * 1.2566; g.fillStyle = col; g.beginPath(); g.ellipse(x + Math.cos(a) * 1.8, -h + Math.sin(a) * 1.8, 1.7, 1.1, a, 0, 6.3); g.fill(); }
        g.fillStyle = "#f0b020"; g.beginPath(); g.arc(x, -h, 0.9, 0, 6.3); g.fill();
      }
    });
  },
  mushrooms(A, r) {
    return makeSprite(36, 22, -18, -20, (g) => {
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * 7 + (r() - 0.5) * 3, h = 5 + r() * 8, cw = 3 + r() * 4;
        g.fillStyle = "#efe4cc"; g.fillRect(x - 1, -h, 2.2, h);
        const red = A.id === "forest" && r() < 0.5;
        const gr = g.createRadialGradient(x - cw * 0.3, -h - 2, 0.5, x, -h, cw);
        gr.addColorStop(0, red ? "#ff7a5a" : "#c99a6a"); gr.addColorStop(1, red ? "#9a1e14" : "#6a4426");
        g.fillStyle = gr; g.beginPath(); g.ellipse(x, -h, cw, cw * 0.65, 0, Math.PI, 0); g.closePath(); g.fill();
        if (red) { g.fillStyle = "#fff"; g.beginPath(); g.arc(x - cw * 0.3, -h - cw * 0.3, 0.8, 0, 6.3); g.arc(x + cw * 0.35, -h - cw * 0.2, 0.6, 0, 6.3); g.fill(); }
      }
    });
  },
  stump(A, r) {
    const W = A.wood;
    return makeSprite(56, 34, -28, -30, (g) => {
      g.fillStyle = shade(W.bark, 0.7);
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 10, -8); g.quadraticCurveTo(s * 18, -2, s * 24, 1); g.lineTo(s * 8, 1); g.closePath(); g.fill(); }
      const gr = g.createLinearGradient(-14, 0, 14, 0);
      gr.addColorStop(0, shade(W.bark, 1.2)); gr.addColorStop(0.6, W.bark); gr.addColorStop(1, W.dark);
      g.fillStyle = gr; g.beginPath(); g.moveTo(-14, 1); g.lineTo(-13, -20); g.lineTo(13, -21); g.lineTo(14, 1); g.closePath(); g.fill();
      g.strokeStyle = "rgba(0,0,0,0.35)"; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(-11 + i * 4.4, 0); g.lineTo(-10 + i * 4.2, -19); g.stroke(); }
      g.fillStyle = W.ring; g.beginPath(); g.ellipse(0, -20.5, 13.5, 4.5, 0, 0, 6.3); g.fill();
      g.strokeStyle = W.ringDark; g.lineWidth = 0.7; for (let i = 1; i < 5; i++) { g.beginPath(); g.ellipse(0, -20.5, 13.5 * i / 5, 4.5 * i / 5, 0, 0, 6.3); g.stroke(); }
      if (A.cap === "snow") { g.fillStyle = A.rock.cap; g.beginPath(); g.ellipse(0, -21.5, 13, 3.5, 0, 0, 6.3); g.fill(); }
      else { g.fillStyle = W.moss; g.beginPath(); g.ellipse(-8, -6, 6, 3, 0.3, 0, 6.3); g.fill(); }
    });
  },
  boulder(A, r, P) {
    const Rk = A.rock;
    return makeSprite(70, 46, -35, -42, (g) => {
      const pts = []; const n = 14;
      for (let i = 0; i < n; i++) { const a = Math.PI + (i / (n - 1)) * Math.PI; const rr = 1 + (r() - 0.5) * 0.18; pts.push([Math.cos(a) * 30 * rr, Math.min(1, Math.sin(a) * 34 * rr)]); }
      const p = new Path2D(); p.moveTo(-31, 1); for (const q of pts) p.lineTo(q[0], q[1]); p.lineTo(31, 1); p.closePath();
      g.save(); g.shadowColor = "rgba(0,0,0,0.4)"; g.shadowBlur = 6; g.fillStyle = Rk.base; g.fill(p); g.restore();
      g.save(); g.clip(p);
      if (P && P.rock) { g.fillStyle = P.rock; g.fill(p); }
      const gr = g.createRadialGradient(A.light.x * 16, -18 + A.light.y * 12, 3, 0, -12, 40);
      gr.addColorStop(0, css(Rk.light, 0.55)); gr.addColorStop(0.6, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,0.55)");
      g.fillStyle = gr; g.fillRect(-36, -40, 72, 42);
      g.strokeStyle = css(Rk.dark, 0.8); g.lineWidth = 1.1; g.beginPath(); g.moveTo(-8, -30); g.lineTo(-3, -18); g.lineTo(-10, -8); g.stroke();
      g.fillStyle = A.cap === "snow" ? Rk.cap : A.id === "highlands" ? css(Rk.cap, 0.8) : Rk.cap;
      g.beginPath(); g.ellipse(-4, -31, 18, 5, -0.1, 0, 6.3); g.fill();
      g.restore();
    });
  },
  grass(A, r) {
    const G = A.grass;
    return makeSprite(32, 26, -16, -24, (g) => {
      for (let i = 0; i < 16; i++) {
        const x = (r() - 0.5) * 16, h = 10 + r() * 12, lean = (r() - 0.5) * 12;
        g.fillStyle = [G.dark, G.mid, G.light, G.tip][Math.floor(r() * 4)];
        g.beginPath(); g.moveTo(x - 1.2, 0); g.quadraticCurveTo(x + lean * 0.2, -h * 0.6, x + lean, -h); g.quadraticCurveTo(x + lean * 0.3, -h * 0.5, x + 1.2, 0); g.closePath(); g.fill();
      }
    });
  },
  reeds(A, r) {
    return makeSprite(34, 50, -17, -48, (g) => {
      for (let i = 0; i < 7; i++) {
        const x = (r() - 0.5) * 20, h = 26 + r() * 18, lean = (r() - 0.5) * 6;
        g.strokeStyle = shade(A.grass.mid, 0.9); g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x, -h * 0.5, x + lean, -h); g.stroke();
        if (i % 2 === 0) { g.fillStyle = "#6a4024"; g.beginPath(); g.ellipse(x + lean * 0.9, -h + 7, 2.2, 6, lean * 0.03, 0, 6.3); g.fill(); }
        g.fillStyle = A.grass.light; g.beginPath(); g.moveTo(x, -2); g.quadraticCurveTo(x - 6, -h * 0.3, x - 9, -h * 0.55); g.quadraticCurveTo(x - 4, -h * 0.3, x + 1, -3); g.fill();
      }
    });
  },
  lantern(A) {
    return makeSprite(26, 54, -13, -52, (g) => {
      g.fillStyle = "#3a2a1e"; g.fillRect(-1.6, -44, 3.2, 44);
      g.fillRect(-1, -44, 9, 2);
      g.strokeStyle = "#2a1e14"; g.lineWidth = 1; g.beginPath(); g.moveTo(7, -42); g.lineTo(7, -38); g.stroke();
      g.fillStyle = "#2c2520"; g.fillRect(3, -38, 8, 2); g.fillRect(3, -27, 8, 2);
      const gr = g.createRadialGradient(7, -32, 0.5, 7, -32, 5);
      gr.addColorStop(0, "#fff6c8"); gr.addColorStop(0.6, "#ffb83a"); gr.addColorStop(1, "#b85a10");
      g.fillStyle = gr; g.fillRect(3.5, -36, 7, 9);
      g.strokeStyle = "#2c2520"; g.strokeRect(3.5, -36, 7, 9);
    });
  },
  cairn(A, r) {
    const Rk = A.rock;
    return makeSprite(36, 44, -18, -42, (g) => {
      let y = 0, w = 13;
      for (let i = 0; i < 5; i++) {
        const h = 6 + r() * 3, x = (r() - 0.5) * 3;
        const gr = g.createLinearGradient(0, y - h, 0, y);
        gr.addColorStop(0, shade(Rk.light, 1)); gr.addColorStop(1, shade(Rk.dark, 0.9));
        g.fillStyle = gr; g.beginPath(); g.ellipse(x, y - h / 2, w, h / 2, (r() - 0.5) * 0.15, 0, 6.3); g.fill();
        y -= h - 1; w *= 0.78;
      }
      if (A.cap === "snow") { g.fillStyle = Rk.cap; g.beginPath(); g.ellipse(0, y + 1, w + 1, 2.5, 0, 0, 6.3); g.fill(); }
    });
  },
  bones(A) {
    return makeSprite(42, 18, -21, -16, (g) => {
      g.fillStyle = "#cfc6b4"; g.strokeStyle = "#7a705e"; g.lineWidth = 0.8;
      g.beginPath(); g.ellipse(-10, -5, 6.5, 5, -0.2, 0, 6.3); g.fill(); g.stroke();
      g.fillStyle = "#2a2622"; g.beginPath(); g.arc(-12, -6, 1.4, 0, 6.3); g.arc(-8, -6.5, 1.3, 0, 6.3); g.fill();
      g.strokeStyle = "#cfc6b4"; g.lineWidth = 2.2; g.lineCap = "round";
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(1 + i * 4, -1); g.quadraticCurveTo(3 + i * 4, -9, 6 + i * 4, -1); g.stroke(); }
      g.beginPath(); g.moveTo(0, -1); g.lineTo(18, -1); g.stroke();
    });
  },
  crystal(A, r) {
    return makeSprite(40, 44, -20, -42, (g) => {
      const cols = [["#d9c8ff", "#8a6ae0", "#4a2a9a"], ["#c8f0ff", "#5ab4e8", "#1e5a9a"]];
      for (let i = 0; i < 5; i++) {
        const c = cols[i % 2], x = (i - 2) * 5 + (r() - 0.5) * 3, h = 14 + r() * 20, w = 3 + r() * 2.5, a = (x / 30) + (r() - 0.5) * 0.3;
        g.save(); g.translate(x, 0); g.rotate(a);
        g.beginPath(); g.moveTo(-w, 0); g.lineTo(-w, -h); g.lineTo(0, -h - w * 1.4); g.lineTo(w, -h); g.lineTo(w, 0); g.closePath();
        const gr = g.createLinearGradient(-w, 0, w, 0); gr.addColorStop(0, c[0]); gr.addColorStop(0.5, c[1]); gr.addColorStop(1, c[2]);
        g.fillStyle = gr; g.fill();
        g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-w * 0.4, -1); g.lineTo(-w * 0.4, -h); g.stroke();
        g.restore();
      }
    });
  },
};
export const DECO_GLOW = { lantern: { color: "#ffc25a", x: 7, y: -32, r: 34, a: 0.6 }, crystal: { color: "#9a8aff", x: 0, y: -18, r: 36, a: 0.45 } };

// ---------------------------------------------------------------- the per-theme sprite library
export function createSprites(A, P) {
  const cache = new Map();
  const memo = (k, fn) => { let s = cache.get(k); if (!s) { s = fn(); cache.set(k, s); } return s; };

  const lib = {
    A,
    deco(kind, variant = 0) {
      return memo("d:" + kind + ":" + variant, () => (DECO[kind] || DECO.bush)(A, rng(hash(variant, kind.length * 31 + kind.charCodeAt(0), 77) * 4e9), P));
    },
    tuft(v) {
      return memo("t" + v, () => {
        const r = rng(1000 + v * 77), G = A.grass;
        if (A.cap === "snow") return makeSprite(16, 12, -8, -11, (g) => { for (let i = 0; i < 4; i++) { const x = (r() - 0.5) * 9, h = 4 + r() * 6; g.fillStyle = [G.dark, G.mid, G.light][i % 3]; g.beginPath(); g.moveTo(x - 0.8, 0); g.lineTo(x + (r() - 0.5) * 4, -h); g.lineTo(x + 0.8, 0); g.fill(); } });
        return makeSprite(18, 16, -9, -15, (g) => {
          for (let i = 0; i < 9; i++) {
            const x = (r() - 0.5) * 11, h = 6 + r() * 8 * (A.id === "highlands" ? 1.25 : 1), lean = (r() - 0.45) * 7;
            g.fillStyle = [G.dark, G.mid, G.light, G.tip, A.id === "highlands" ? G.dry : G.light][Math.floor(r() * 5)];
            g.beginPath(); g.moveTo(x - 1, 0.5); g.quadraticCurveTo(x + lean * 0.2, -h * 0.6, x + lean, -h); g.quadraticCurveTo(x + lean * 0.35, -h * 0.5, x + 1, 0.5); g.closePath(); g.fill();
          }
          if (A.id === "forest" && v % 3 === 0) { g.fillStyle = v % 2 ? "#fff4d8" : "#ffd84a"; g.beginPath(); g.arc(2, -10, 1.5, 0, 6.3); g.fill(); }
        });
      });
    },
    spring(p) {
      const tier = p >= 1.25 ? 2 : p <= 0.8 ? 0 : 1;
      return memo("spring" + tier, () => {
        const pal = [["#ffb15a", "#e0782a", "#8a3e12"], ["#ff7a5a", "#d6342a", "#7c1410"], ["#c9a0ff", "#8a3fd6", "#3e1680"]][tier];
        return makeSprite(44, 26, -22, -24, (g) => {
          // stem
          const sg = g.createLinearGradient(-5, 0, 5, 0); sg.addColorStop(0, "#fff7e6"); sg.addColorStop(1, "#c8b89a");
          g.fillStyle = sg; g.beginPath(); g.moveTo(-5, 0); g.quadraticCurveTo(-4, -6, -3.5, -11); g.lineTo(3.5, -11); g.quadraticCurveTo(4, -6, 5, 0); g.closePath(); g.fill();
          // gills
          g.fillStyle = "#e8d6b8"; g.beginPath(); g.ellipse(0, -10.5, 16, 3, 0, 0, 6.3); g.fill();
          g.strokeStyle = "rgba(120,90,60,0.5)"; g.lineWidth = 0.6; for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(i * 2.3, -10.5); g.lineTo(i * 1.4, -12); g.stroke(); }
          // cap
          const cg = g.createRadialGradient(-5, -20, 1, 0, -14, 19);
          cg.addColorStop(0, pal[0]); cg.addColorStop(0.55, pal[1]); cg.addColorStop(1, pal[2]);
          g.fillStyle = cg; g.beginPath(); g.moveTo(-17, -11); g.bezierCurveTo(-17, -24, 17, -24, 17, -11); g.quadraticCurveTo(0, -8.5, -17, -11); g.closePath(); g.fill();
          g.fillStyle = "#fff8ec";
          for (const [x, y, rr] of [[-9, -15, 2.6], [-2, -19, 2.2], [6, -16.5, 2.8], [12, -13, 1.6], [-13, -12.5, 1.5], [2, -13.5, 1.5]]) { g.beginPath(); g.ellipse(x, y, rr, rr * 0.75, 0, 0, 6.3); g.fill(); }
          g.fillStyle = "rgba(255,255,255,0.35)"; g.beginPath(); g.ellipse(-6, -19.5, 6, 2, -0.3, 0, 6.3); g.fill();
        });
      });
    },
    crumble(w) {
      return memo("cr" + w, () => makeSprite(w * T + 4, T + 4, -2, -2, (g) => {
        const Rk = A.rock;
        for (let i = 0; i < w; i++) {
          const x = i * T + 0.5, p = new Path2D(); rrect(p, x, 1, T - 1, T - 2, 5, 5, 4, 4);
          g.save(); g.shadowColor = "rgba(0,0,0,0.4)"; g.shadowBlur = 4; g.shadowOffsetY = 2;
          g.fillStyle = mix(A.soil.base, Rk.base, 0.55); g.fill(p); g.restore();
          g.save(); g.clip(p);
          if (P && P.rock) { g.globalAlpha = 0.6; g.fillStyle = P.rock; g.fill(p); g.globalAlpha = 1; }
          const gr = g.createLinearGradient(0, 1, 0, T);
          gr.addColorStop(0, "rgba(255,240,210,0.25)"); gr.addColorStop(0.3, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,0.5)");
          g.fillStyle = gr; g.fillRect(x, 0, T, T);
          const r = rng(500 + i * 13 + w);
          g.strokeStyle = "rgba(25,15,8,0.85)"; g.lineWidth = 1.1; g.lineJoin = "round";
          g.beginPath(); let px = x + 8 + r() * 16, py = 2; g.moveTo(px, py);
          for (let k = 0; k < 4; k++) { px += (r() - 0.5) * 10; py += 5 + r() * 4; g.lineTo(px, py); }
          g.stroke();
          g.fillStyle = A.cap === "snow" ? Rk.cap : A.id === "highlands" ? css(Rk.cap, 0.9) : A.grass.mid;
          g.beginPath(); g.moveTo(x, 4); for (let k = 0; k <= 8; k++) g.lineTo(x + k * 4, 1.5 + r() * 2.5); g.lineTo(x + T, 4); g.lineTo(x + T, 1); g.lineTo(x, 1); g.fill();
          g.restore();
        }
      }));
    },
    crumbleCracks(w) {
      return memo("cc" + w, () => makeSprite(w * T, T, 0, 0, (g) => {
        g.strokeStyle = "rgba(15,8,4,0.9)"; g.lineWidth = 1.2; g.lineJoin = "round";
        for (let i = 0; i < w; i++) {
          const r = rng(900 + i * 7 + w);
          for (let c = 0; c < 3; c++) {
            g.beginPath(); let px = i * T + 3 + r() * 26, py = r() * 6 + 1; g.moveTo(px, py);
            for (let k = 0; k < 5; k++) { px += (r() - 0.5) * 12; py += 3 + r() * 5; g.lineTo(px, py); }
            g.stroke();
          }
        }
      }));
    },
    mover(kind, w) {
      return memo("mv:" + kind + w, () => {
        const Wd = A.wood, Ww = w * T;
        if (kind === "plank") return makeSprite(Ww + 4, 22, -2, -3, (g) => {
          const n = Math.max(2, w * 2);
          for (let i = 0; i < n; i++) {
            const x = (i * Ww) / n + 0.6, bw = Ww / n - 1.2;
            const gr = g.createLinearGradient(0, 0, 0, 14); gr.addColorStop(0, shade(Wd.light, 1.05)); gr.addColorStop(1, shade(Wd.bark, 0.8));
            g.fillStyle = gr; g.fillRect(x, 0, bw, 13);
            g.strokeStyle = "rgba(0,0,0,0.3)"; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x + 2, 4); g.lineTo(x + bw - 2, 5); g.moveTo(x + 3, 9); g.lineTo(x + bw - 3, 8.5); g.stroke();
            g.fillStyle = "#2a2a2a"; g.beginPath(); g.arc(x + 3, 3, 0.9, 0, 6.3); g.arc(x + 3, 10, 0.9, 0, 6.3); g.fill();
          }
          g.fillStyle = shade(Wd.dark, 0.9); g.fillRect(0, 13, Ww, 4);
          g.strokeStyle = "#c8a870"; g.lineWidth = 2;
          for (const x of [6, Ww - 6]) { g.beginPath(); g.moveTo(x - 3, -1); g.lineTo(x + 3, 15); g.moveTo(x + 3, -1); g.lineTo(x - 3, 15); g.stroke(); }
          if (A.cap === "snow") { g.fillStyle = A.rock.cap; g.fillRect(1, -1.5, Ww - 2, 2.5); }
        });
        if (kind === "stone") return makeSprite(Ww + 4, 24, -2, -4, (g) => {
          const p = new Path2D(); p.moveTo(2, 0);
          const r = rng(70 + w);
          for (let x = 4; x < Ww - 2; x += 6) p.lineTo(x, (r() - 0.5) * 1.2);
          p.lineTo(Ww - 1, 1); p.lineTo(Ww - 4, 12); p.quadraticCurveTo(Ww / 2, 20, 4, 13); p.lineTo(0, 3); p.closePath();
          g.save(); g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = 5; g.shadowOffsetY = 3; g.fillStyle = A.rock.base; g.fill(p); g.restore();
          g.save(); g.clip(p);
          if (P && P.rock) { g.fillStyle = P.rock; g.fill(p); }
          const gr = g.createLinearGradient(0, 0, 0, 18); gr.addColorStop(0, css(A.rock.light, 0.45)); gr.addColorStop(0.35, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,0.55)");
          g.fillStyle = gr; g.fillRect(0, -2, Ww, 22);
          g.fillStyle = A.cap === "snow" ? A.rock.cap : A.rock.cap; g.globalAlpha = A.id === "forest" ? 0.9 : 0.75;
          g.beginPath(); g.moveTo(2, 2); for (let x = 2; x <= Ww - 2; x += 4) g.lineTo(x, -0.5 - r() * 1.5); g.lineTo(Ww - 2, 2.5); g.closePath(); g.fill();
          g.restore();
        });
        if (kind === "leaf") return makeSprite(Ww + 16, 22, -8, -5, (g) => {
          const cols = A.id === "storm" ? ["#1e3a30", "#2f5a48", "#4f7a68"] : A.id === "highlands" ? ["#5a6a1e", "#8a9a2a", "#c4c45a"] : ["#2f6e22", "#4fa034", "#8fd060"];
          const p = new Path2D(); p.moveTo(-6, 3); p.bezierCurveTo(Ww * 0.2, -3, Ww * 0.8, -3, Ww + 6, 3); p.bezierCurveTo(Ww * 0.8, 14, Ww * 0.2, 14, -6, 3); p.closePath();
          g.save(); g.shadowColor = "rgba(0,0,0,0.4)"; g.shadowBlur = 5; g.shadowOffsetY = 3; g.fillStyle = cols[0]; g.fill(p); g.restore();
          const gr = g.createLinearGradient(0, -2, 0, 12); gr.addColorStop(0, cols[2]); gr.addColorStop(0.5, cols[1]); gr.addColorStop(1, cols[0]);
          g.fillStyle = gr; g.fill(p);
          g.strokeStyle = shade(cols[2], 1.15); g.lineWidth = 1.2; g.beginPath(); g.moveTo(-4, 3.5); g.quadraticCurveTo(Ww / 2, 1.5, Ww + 4, 3.5); g.stroke();
          g.lineWidth = 0.6;
          for (let i = 1; i < w * 3; i++) { const x = (i / (w * 3)) * Ww; g.beginPath(); g.moveTo(x, 2.6); g.quadraticCurveTo(x + 4, 5, x + 7, 9); g.moveTo(x, 2.6); g.quadraticCurveTo(x + 4, 0.5, x + 7, -0.5); g.stroke(); }
          g.fillStyle = "rgba(255,255,255,0.18)"; g.beginPath(); g.ellipse(Ww * 0.3, 1.5, Ww * 0.15, 1.2, 0, 0, 6.3); g.fill();
        });
        // log
        return makeSprite(Ww + 4, 26, -2, -4, (g) => {
          const p = new Path2D(); rrect(p, 1, 0, Ww - 2, 18, 9);
          g.save(); g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = 5; g.shadowOffsetY = 3; g.fillStyle = Wd.dark; g.fill(p); g.restore();
          g.save(); g.clip(p);
          if (P && P.bark) { g.fillStyle = P.bark; g.fill(p); }
          const gr = g.createLinearGradient(0, 0, 0, 18); gr.addColorStop(0, "rgba(255,240,210,0.3)"); gr.addColorStop(0.3, "rgba(255,240,210,0.05)"); gr.addColorStop(1, "rgba(0,0,0,0.6)");
          g.fillStyle = gr; g.fillRect(0, 0, Ww, 18);
          if (A.cap !== "snow") { const r = rng(40 + w); for (let i = 0; i < w * 3; i++) { if (r() < 0.4) continue; const x = r() * Ww; g.fillStyle = Wd.moss; g.beginPath(); g.ellipse(x, 1, 3 + r() * 5, 2, 0, 0, 6.3); g.fill(); } }
          else { g.fillStyle = A.rock.cap; g.fillRect(2, -1, Ww - 4, 3); }
          g.restore();
          for (const cx of [7, Ww - 7]) {
            g.fillStyle = Wd.dark; g.beginPath(); g.ellipse(cx, 9, 5.5, 9.5, 0, 0, 6.3); g.fill();
            g.fillStyle = Wd.ring; g.beginPath(); g.ellipse(cx, 9, 4.5, 8.4, 0, 0, 6.3); g.fill();
            g.strokeStyle = Wd.ringDark; g.lineWidth = 0.6; for (let i = 1; i < 4; i++) { g.beginPath(); g.ellipse(cx, 9, 4.5 * i / 4, 8.4 * i / 4, 0, 0, 6.3); g.stroke(); }
          }
        });
      });
    },
    hazard(kind) {
      return memo("hz:" + kind, () => {
        const Rr = 32; // sprite drawn for radius 32 world px; scale by r / 32
        if (kind === "boulder") return makeSprite(Rr * 2 + 8, Rr * 2 + 8, -Rr - 4, -Rr - 4, (g) => {
          const p = new Path2D(); const r = rng(33);
          for (let i = 0; i < 18; i++) { const a = (i / 18) * 6.283, rr = Rr * (0.95 + r() * 0.08); i ? p.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : p.moveTo(rr, 0); }
          p.closePath();
          g.fillStyle = A.rock.base; g.fill(p);
          g.save(); g.clip(p);
          if (P && P.rock) { g.fillStyle = P.rock; g.fill(p); }
          g.strokeStyle = css(A.rock.dark, 0.9); g.lineWidth = 1.6;
          g.beginPath(); g.moveTo(-14, -20); g.lineTo(-4, -6); g.lineTo(-12, 10); g.moveTo(-4, -6); g.lineTo(12, -2); g.lineTo(18, 14); g.stroke();
          g.fillStyle = A.cap === "snow" ? "rgba(220,230,250,0.6)" : css(A.rock.cap, 0.7); g.beginPath(); g.ellipse(8, -22, 10, 5, 0.5, 0, 6.3); g.fill();
          g.restore();
        });
        if (kind === "thornball") return makeSprite(Rr * 2 + 20, Rr * 2 + 20, -Rr - 10, -Rr - 10, (g) => {
          const S = A.thorn, r = rng(44);
          for (let i = 0; i < 18; i++) {
            const a = (i / 18) * 6.283 + r() * 0.15, l = Rr + 7 + r() * 3;
            g.fillStyle = shade(S.thorn, 0.8);
            g.beginPath(); g.moveTo(Math.cos(a - 0.2) * Rr * 0.8, Math.sin(a - 0.2) * Rr * 0.8); g.lineTo(Math.cos(a) * l, Math.sin(a) * l); g.lineTo(Math.cos(a + 0.2) * Rr * 0.8, Math.sin(a + 0.2) * Rr * 0.8); g.closePath(); g.fill();
            g.fillStyle = S.tip; g.beginPath(); g.moveTo(Math.cos(a) * l, Math.sin(a) * l); g.lineTo(Math.cos(a - 0.05) * (l - 6), Math.sin(a - 0.05) * (l - 6)); g.lineTo(Math.cos(a + 0.05) * (l - 6), Math.sin(a + 0.05) * (l - 6)); g.closePath(); g.fill();
          }
          g.fillStyle = shade(S.vine, 0.6); g.beginPath(); g.arc(0, 0, Rr * 0.86, 0, 6.3); g.fill();
          g.lineCap = "round";
          for (let i = 0; i < 9; i++) {
            const a = r() * 6.283, b = a + 1.5 + r() * 2;
            g.strokeStyle = i % 2 ? S.vine : shade(S.vine, 1.3); g.lineWidth = 4 + r() * 3;
            g.beginPath(); g.arc((r() - 0.5) * 6, (r() - 0.5) * 6, Rr * (0.45 + r() * 0.35), a, b); g.stroke();
          }
          const gr = g.createRadialGradient(A.light.x * Rr * 0.4, A.light.y * Rr * 0.4, 2, 0, 0, Rr * 0.9);
          gr.addColorStop(0, "rgba(255,255,220,0.25)"); gr.addColorStop(0.6, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,0.5)");
          g.fillStyle = gr; g.beginPath(); g.arc(0, 0, Rr * 0.9, 0, 6.3); g.fill();
        });
        if (kind === "wasp") return makeSprite(Rr * 2 + 12, Rr * 2, -Rr - 6, -Rr, (g) => {
          // facing right; wings drawn live
          g.lineCap = "round";
          g.strokeStyle = "#1a1408"; g.lineWidth = 1.6;
          for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-2 + i * 5, 6); g.lineTo(-5 + i * 6, 16); g.lineTo(-7 + i * 6, 19); g.stroke(); }
          const ab = g.createRadialGradient(-12, -4, 2, -10, 2, 18);
          ab.addColorStop(0, "#ffe46a"); ab.addColorStop(0.6, "#f0b81e"); ab.addColorStop(1, "#8a5a08");
          g.save(); g.translate(-11, 3); g.rotate(0.25);
          g.fillStyle = ab; g.beginPath(); g.ellipse(0, 0, 15, 10, 0, 0, 6.3); g.fill();
          g.save(); g.beginPath(); g.ellipse(0, 0, 15, 10, 0, 0, 6.3); g.clip();
          g.fillStyle = "#1c1408"; for (let i = 0; i < 3; i++) g.fillRect(-11 + i * 7, -12, 3.2, 24);
          g.restore();
          g.fillStyle = "#1c1408"; g.beginPath(); g.moveTo(-15, -1.5); g.lineTo(-23, 1); g.lineTo(-15, 2.5); g.fill();
          g.restore();
          const th = g.createRadialGradient(4, -3, 1, 5, 0, 9); th.addColorStop(0, "#8a6a3a"); th.addColorStop(1, "#2a1a0a");
          g.fillStyle = th; g.beginPath(); g.ellipse(5, 0, 8, 7, 0, 0, 6.3); g.fill();
          g.fillStyle = "#f0b81e"; g.beginPath(); g.ellipse(16, -1, 6.5, 6, 0, 0, 6.3); g.fill();
          g.fillStyle = "#1c1408"; g.beginPath(); g.ellipse(18, -2.5, 3.2, 3.6, 0.3, 0, 6.3); g.fill();
          g.fillStyle = "#fff"; g.beginPath(); g.arc(19, -3.6, 1, 0, 6.3); g.fill();
          g.strokeStyle = "#1c1408"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(17, -6); g.quadraticCurveTo(20, -14, 25, -15); g.moveTo(15, -6); g.quadraticCurveTo(15, -13, 19, -16); g.stroke();
        });
        // spark
        return makeSprite(Rr * 3, Rr * 3, -Rr * 1.5, -Rr * 1.5, (g) => {
          const gr = g.createRadialGradient(0, 0, 0, 0, 0, Rr * 1.5);
          gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.18, "rgba(200,235,255,0.95)"); gr.addColorStop(0.42, "rgba(90,170,255,0.45)"); gr.addColorStop(1, "rgba(60,120,255,0)");
          g.fillStyle = gr; g.beginPath(); g.arc(0, 0, Rr * 1.5, 0, 6.3); g.fill();
        });
      });
    },
    waspWing() { return memo("wing", () => makeSprite(20, 12, -2, -11, (g) => { g.fillStyle = "rgba(230,240,255,0.55)"; g.strokeStyle = "rgba(60,60,80,0.6)"; g.lineWidth = 0.6; g.beginPath(); g.ellipse(8, -5, 9, 4.2, -0.4, 0, 6.3); g.fill(); g.stroke(); })); },
    post() {
      return memo("post", () => makeSprite(30, 76, -15, -72, (g) => {
        const Rk = A.rock;
        for (const [x, y, rx, ry] of [[-7, -2, 7, 4], [6, -2, 7, 4.5], [0, -6, 6, 4]]) { const gr = g.createLinearGradient(0, y - ry, 0, y + ry); gr.addColorStop(0, Rk.light); gr.addColorStop(1, Rk.dark); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.3); g.fill(); }
        const gr = g.createLinearGradient(-3, 0, 3, 0); gr.addColorStop(0, shade(A.wood.light, 1.1)); gr.addColorStop(1, A.wood.dark);
        g.fillStyle = gr; g.fillRect(-2.6, -62, 5.2, 58);
        g.fillStyle = A.wood.dark; g.beginPath(); g.moveTo(-3.5, -62); g.lineTo(0, -66); g.lineTo(3.5, -62); g.fill();
        g.strokeStyle = "#c9a46a"; g.lineWidth = 1.2; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-2.8, -30 - i * 2.2); g.lineTo(2.8, -31.5 - i * 2.2); g.stroke(); }
      }));
    },
    goal() {
      return memo("goal", () => makeSprite(96, 120, -48, -114, (g) => {
        const Wd = A.wood;
        for (const x of [-30, 30]) {
          const gr = g.createLinearGradient(x - 5, 0, x + 5, 0); gr.addColorStop(0, shade(Wd.light, 1.1)); gr.addColorStop(0.5, Wd.bark); gr.addColorStop(1, Wd.dark);
          g.fillStyle = gr; g.beginPath(); g.moveTo(x - 5.5, 0); g.lineTo(x - 4, -96); g.lineTo(x + 4, -96); g.lineTo(x + 5.5, 0); g.closePath(); g.fill();
          g.fillStyle = "#e8c36a"; g.fillRect(x - 4.5, -60, 9, 2); g.fillRect(x - 4.5, -30, 9, 2);
          const Rk = A.rock; g.fillStyle = Rk.base; g.beginPath(); g.ellipse(x, -1, 9, 4, 0, 0, 6.3); g.fill();
        }
        // arched crossbeam
        g.lineCap = "round"; g.strokeStyle = Wd.dark; g.lineWidth = 9; g.beginPath(); g.moveTo(-38, -92); g.quadraticCurveTo(0, -116, 38, -92); g.stroke();
        g.strokeStyle = Wd.bark; g.lineWidth = 6; g.stroke();
        g.strokeStyle = "rgba(255,240,200,0.35)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-36, -95); g.quadraticCurveTo(0, -118, 36, -95); g.stroke();
        // vines and flowers along it
        const r = rng(99), leaves = LEAVES[A.id];
        for (let i = 0; i < 40; i++) {
          const t = r(), x = -38 + t * 76, y = -92 - Math.sin(t * Math.PI) * 12 + (r() - 0.3) * 8;
          g.fillStyle = leaves[1 + Math.floor(r() * 3)]; g.beginPath(); g.ellipse(x, y, 3.6, 1.8, r() * 6, 0, 6.3); g.fill();
        }
        for (let i = 0; i < 12; i++) { const t = r(), x = -36 + t * 72, y = -94 - Math.sin(t * Math.PI) * 12; g.fillStyle = ["#ffd84a", "#ffffff", "#ff8ab0"][i % 3]; g.beginPath(); g.arc(x, y, 1.8, 0, 6.3); g.fill(); }
        for (const x of [-30, 30]) for (let i = 0; i < 14; i++) { g.fillStyle = leaves[1 + (i % 3)]; g.beginPath(); g.ellipse(x + Math.sin(i * 1.3) * 5, -88 + i * 6, 3, 1.6, i, 0, 6.3); g.fill(); }
      }));
    },
    sign(text) {
      return memo("sign:" + text, () => {
        const fontPx = 8.5;
        const FONT = `700 ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        // measure at the size the text is really rasterised (the sprite is drawn at ~1.5-3x): tiny-size metrics run
        // narrow, which let a balanced line overflow the board
        const mc = makeCanvas(2, 2).getContext("2d"); mc.font = `700 ${fontPx * 4}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        const meas = { font: FONT, measureText: (t) => ({ width: mc.measureText(t).width / 4 * 1.04 }) };
        const words = String(text || "").split(/\s+/).filter(Boolean);
        const wrapAt = (mw) => { const out = []; let cur = ""; for (const w of words) { const t = cur ? cur + " " + w : w; if (meas.measureText(t).width > mw && cur) { out.push(cur); cur = w; } else cur = t; } if (cur) out.push(cur); return out; };
        // short text stays on one line; longer text is wrapped into balanced lines (no lone orphan word)
        const full = meas.measureText(words.join(" ")).width;
        let maxW = full <= 150 ? 150 : 112, lines = wrapAt(maxW);
        if (lines.length > 1) { for (let mw = Math.ceil(full / lines.length); mw < maxW; mw += 3) { const l2 = wrapAt(mw); if (l2.length === lines.length) { lines = l2; break; } } }
        maxW = Math.max(maxW, ...lines.map((l) => meas.measureText(l).width));
        if (!lines.length) lines.push("");
        const bw = Math.max(40, Math.min(maxW, Math.max(...lines.map((l) => meas.measureText(l).width))) + 14), bh = lines.length * 11 + 9;
        const top = -22 - bh;
        return makeSprite(bw + 8, bh + 30, -bw / 2 - 4, top - 4, (g) => {
          const Wd = A.wood;
          g.fillStyle = Wd.dark; g.fillRect(-2.5, -24, 5, 24);
          g.fillStyle = shade(Wd.light, 0.9); g.fillRect(-2.5, -24, 2, 24);
          const p = new Path2D(); rrect(p, -bw / 2, top, bw, bh, 3);
          g.save(); g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = 5; g.shadowOffsetY = 2.5;
          g.fillStyle = Wd.light; g.fill(p); g.restore();
          g.save(); g.clip(p);
          if (P && P.bark) { g.globalAlpha = 0.35; g.fillStyle = P.bark; g.fill(p); g.globalAlpha = 1; }
          const gr = g.createLinearGradient(0, top, 0, top + bh); gr.addColorStop(0, "rgba(255,245,220,0.35)"); gr.addColorStop(1, "rgba(0,0,0,0.25)");
          g.fillStyle = gr; g.fill(p);
          g.restore();
          g.strokeStyle = Wd.dark; g.lineWidth = 1.2; g.stroke(p);
          g.fillStyle = "#2a2a2a"; for (const x of [-bw / 2 + 3.5, bw / 2 - 3.5]) { g.beginPath(); g.arc(x, top + 3.5, 0.8, 0, 6.3); g.fill(); }
          g.font = meas.font; g.textAlign = "center"; g.textBaseline = "middle";
          lines.forEach((l, i) => {
            const y = top + 9.5 + i * 11;
            g.fillStyle = "rgba(255,240,210,0.55)"; g.fillText(l, 0.5, y + 0.7);
            g.fillStyle = "#2b1a0c"; g.fillText(l, 0, y);
          });
          if (A.cap === "snow") { g.fillStyle = A.rock.cap; g.beginPath(); g.moveTo(-bw / 2, top + 1); for (let x = -bw / 2; x <= bw / 2; x += 4) g.lineTo(x, top - 1 - hash(x | 0, 3, 1) * 1.6); g.lineTo(bw / 2, top + 1); g.fill(); }
        });
      });
    },
    shadow: () => memo("shadow", () => { const c = makeCanvas(64, 20), g = c.getContext("2d"); g.translate(32, 10); g.scale(1, 0.3); const gr = g.createRadialGradient(0, 0, 0, 0, 0, 32); gr.addColorStop(0, "rgba(0,0,0,0.6)"); gr.addColorStop(0.5, "rgba(0,0,0,0.3)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 32, 0, 6.3); g.fill(); return c; }),
    glow: (color) => memo("glow:" + color, () => softDot(96, color, 0, 1)),
  };
  return lib;
}
