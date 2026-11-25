// render/icons.js - painted item icons for every bonus item (BONUS_RENDER). DOM (bake time).
// Each icon is painted in a 64x64 design space by its icon.shape (data/items.js) with its colors and, for tools,
// its tier material; lit from the top-left, with a soft drop shadow and a thin dark rim so it reads on any panel.
// Unknown shapes (items CRAFT adds later) get a tidy generic gem with the item's initial.
import { ITEMS, TIER_COLOR } from "../data/items.js";
import { makeCanvas, rng, mix, shade, css, lg, rg, ell, poly, TAU } from "./kit.js";

const DARK = "rgba(28,18,10,0.9)";
// metal / material fill for a tool head by tier (1 wood, 2 stone, 3 iron, 4 steel; 0 = color)
function headFill(g, tier, x0, y0, x1, y1, color) {
  if (tier === 1) return lg(g, x0, y0, x1, y1, [[0, "#c79a62"], [0.5, "#9a6b3f"], [1, "#6a4426"]]);
  if (tier === 2) return lg(g, x0, y0, x1, y1, [[0, "#c2c0b8"], [0.45, "#8d8c88"], [1, "#55534d"]]);
  if (tier === 3) return lg(g, x0, y0, x1, y1, [[0, "#ffffff"], [0.25, "#dfe2e8"], [0.55, "#a9adb6"], [1, "#6c7078"]]);
  if (tier === 4) return lg(g, x0, y0, x1, y1, [[0, "#f2fbff"], [0.25, "#b8d6ef"], [0.6, "#6f98c2"], [1, "#3d5f86"]]);
  return lg(g, x0, y0, x1, y1, [[0, shade(color, 1.35)], [0.5, color], [1, shade(color, 0.6)]]);
}
function handle(g, x0, y0, x1, y1, w = 5, col = "#8a5a32") {
  g.lineCap = "round";
  g.strokeStyle = shade(col, 0.55); g.lineWidth = w + 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.strokeStyle = "rgba(255,230,190,0.45)"; g.lineWidth = w * 0.3; g.beginPath(); g.moveTo(x0 - 1, y0 - 1); g.lineTo(x1 - 1, y1 - 1); g.stroke();
}
function wrap(g, x, y, a, col = "#d8c08a") { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col; for (let i = -1; i <= 1; i++) g.fillRect(-4.5, i * 2.6 - 1, 9, 1.8); g.restore(); }
const stoneChip = (g, pts, tier, color) => { poly(g, pts, headFill(g, tier, pts[0], pts[1], pts[4], pts[5], color), DARK, 1.2); if (tier === 2) { g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 0.8; g.beginPath(); g.moveTo(pts[0] + 2, pts[1] + 2); g.lineTo((pts[2] + pts[4]) / 2, (pts[3] + pts[5]) / 2); g.stroke(); } };

const P = {
  // ---------------------------------------------------------------- resources
  log(g, c) {
    g.save(); g.translate(32, 34); g.rotate(-0.5);
    g.fillStyle = lg(g, 0, -12, 0, 12, [[0, "#a67c50"], [0.4, c], [1, shade(c, 0.5)]]); g.beginPath(); g.moveTo(-22, -11); g.lineTo(18, -11); g.lineTo(18, 11); g.lineTo(-22, 11); g.closePath(); g.fill();
    g.strokeStyle = "rgba(40,22,10,0.55)"; g.lineWidth = 1; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-20 + i * 8, -10 + (i % 2) * 3); g.lineTo(-14 + i * 8, 9 - (i % 2) * 4); g.stroke(); }
    g.strokeStyle = DARK; g.lineWidth = 1.2; g.strokeRect(-22, -11, 40, 22);
    ell(g, 18, 0, 6, 11, "#e2b984"); g.strokeStyle = "#a77c4b"; g.lineWidth = 0.9; for (let k = 1; k < 4; k++) { g.beginPath(); g.ellipse(18, 0, k * 1.6, k * 2.9, 0, 0, TAU); g.stroke(); }
    g.strokeStyle = DARK; g.lineWidth = 1.2; g.beginPath(); g.ellipse(18, 0, 6, 11, 0, 0, TAU); g.stroke();
    g.restore();
  },
  stick(g, c) { handle(g, 14, 52, 50, 12, 5, c); handle(g, 34, 30, 44, 34, 3, c); ell(g, 44, 34, 3, 2, "#5f9a36"); },
  plank(g, c) {
    for (const [y, t] of [[34, 0.9], [22, 1.05]]) {
      g.save(); g.translate(32, y); g.rotate(-0.15);
      g.fillStyle = lg(g, 0, -6, 0, 6, [[0, shade(c, 1.2 * t)], [1, shade(c, 0.75 * t)]]); g.fillRect(-24, -6, 48, 12);
      g.strokeStyle = "rgba(90,55,25,0.45)"; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-22, -2); g.bezierCurveTo(-8, -4, 6, 1, 22, -2); g.stroke();
      g.strokeStyle = DARK; g.lineWidth = 1.2; g.strokeRect(-24, -6, 48, 12); g.restore();
    }
  },
  fiber(g, c) {
    g.lineCap = "round";
    for (let i = 0; i < 9; i++) { g.strokeStyle = i % 2 ? c : shade(c, 0.75); g.lineWidth = 2.2; g.beginPath(); g.moveTo(32, 54); g.quadraticCurveTo(26 + i * 1.5, 30, 14 + i * 4.5, 8 + (i % 3) * 3); g.stroke(); }
    g.fillStyle = "#c8a86a"; g.fillRect(24, 38, 16, 5); g.strokeStyle = DARK; g.lineWidth = 1; g.strokeRect(24, 38, 16, 5);
  },
  rope(g, c) {
    g.lineWidth = 6; for (let k = 0; k < 3; k++) { g.strokeStyle = shade(c, 0.6); g.beginPath(); g.ellipse(32, 34, 20 - k * 6, 14 - k * 4, 0, 0, TAU); g.stroke(); }
    g.lineWidth = 4; for (let k = 0; k < 3; k++) { g.strokeStyle = c; g.beginPath(); g.ellipse(32, 33, 20 - k * 6, 14 - k * 4, 0, 0, TAU); g.stroke(); }
    g.strokeStyle = "rgba(90,60,30,0.5)"; g.lineWidth = 1; for (let a = 0; a < TAU; a += 0.35) { g.beginPath(); g.moveTo(32 + Math.cos(a) * 18, 33 + Math.sin(a) * 12); g.lineTo(32 + Math.cos(a + 0.15) * 22, 33 + Math.sin(a + 0.15) * 16); g.stroke(); }
    handle(g, 48, 40, 56, 52, 3.5, c);
  },
  rock(g, c) {
    poly(g, [10, 44, 16, 24, 32, 14, 50, 20, 56, 40, 44, 52, 20, 52], lg(g, 10, 14, 50, 52, [[0, shade(c, 1.4)], [0.5, c], [1, shade(c, 0.55)]]), DARK, 1.4);
    poly(g, [16, 24, 32, 14, 34, 28, 22, 34], "rgba(255,255,255,0.25)");
    poly(g, [34, 28, 50, 20, 56, 40, 40, 40], "rgba(0,0,0,0.12)");
  },
  flint(g, c) {
    poly(g, [14, 46, 22, 18, 42, 10, 52, 30, 40, 52], lg(g, 14, 10, 52, 52, [[0, "#8a93a4"], [0.4, c], [1, "#22262c"]]), DARK, 1.4);
    g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 1; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(30, 30, 6 + k * 6, -2.4, -1.2); g.stroke(); }
  },
  lump(g, c) {
    g.fillStyle = lg(g, 10, 10, 54, 54, [[0, shade(c, 1.5)], [0.5, c], [1, shade(c, 0.5)]]);
    g.beginPath(); g.moveTo(12, 40); g.bezierCurveTo(8, 22, 26, 10, 38, 14); g.bezierCurveTo(54, 16, 58, 34, 50, 46); g.bezierCurveTo(42, 56, 18, 56, 12, 40); g.fill();
    g.strokeStyle = DARK; g.lineWidth = 1.4; g.stroke();
    const r = rng(c.length * 7 + c.charCodeAt(1)); for (let i = 0; i < 7; i++) ell(g, 18 + r() * 28, 20 + r() * 26, 1.5 + r() * 2.5, 1.2 + r() * 2, i % 2 ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.2)");
    ell(g, 26, 22, 7, 3.5, "rgba(255,255,255,0.3)", -0.4);
  },
  ore(g, c, c2) {
    P.rock(g, c);
    const r = rng(c2.length * 13 + c2.charCodeAt(2));
    for (let i = 0; i < 6; i++) { const x = 20 + r() * 26, y = 22 + r() * 22, s = 3 + r() * 3; ell(g, x + 0.6, y + 0.8, s, s * 0.8, "rgba(0,0,0,0.35)"); ell(g, x, y, s, s * 0.8, c2); ell(g, x - s * 0.3, y - s * 0.3, s * 0.4, s * 0.3, "rgba(255,255,255,0.7)"); }
  },
  ingot(g, c) {
    poly(g, [8, 44, 18, 26, 50, 26, 58, 44], lg(g, 0, 26, 0, 44, [[0, shade(c, 1.35)], [1, shade(c, 0.8)]]), DARK, 1.3);
    poly(g, [8, 44, 58, 44, 56, 52, 10, 52], shade(c, 0.62), DARK, 1.3);
    poly(g, [18, 26, 50, 26, 46, 30, 22, 30], "rgba(255,255,255,0.55)");
    g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(14, 40); g.lineTo(20, 31); g.stroke();
  },
  gem(g, c) {
    const s = [[32, 8, 12, 50, 0], [18, 20, 7, 40, -0.5], [46, 18, 7, 42, 0.45]];
    for (const [x, y, w, h, a] of s) {
      g.save(); g.translate(x, 56); g.rotate(a);
      poly(g, [-w, 0, -w, -(h - 10), 0, -h, w, -(h - 10), w, 0], shade(c, 0.75), DARK, 1.2);
      poly(g, [-w, 0, -w, -(h - 10), 0, -h, 0, 0], shade(c, 1.25));
      g.fillStyle = "rgba(255,255,255,0.75)"; g.fillRect(-w * 0.6, -(h - 12), w * 0.3, h * 0.55);
      g.restore();
    }
  },
  brick(g, c) {
    poly(g, [8, 30, 20, 20, 58, 20, 46, 30], shade(c, 1.25), DARK, 1.2);
    poly(g, [8, 30, 46, 30, 46, 48, 8, 48], lg(g, 0, 30, 0, 48, [[0, c], [1, shade(c, 0.7)]]), DARK, 1.2);
    poly(g, [46, 30, 58, 20, 58, 38, 46, 48], shade(c, 0.55), DARK, 1.2);
    g.fillStyle = "rgba(60,20,10,0.35)"; for (let i = 0; i < 5; i++) g.fillRect(12 + i * 7, 34 + (i % 2) * 6, 2, 2);
  },
  glass(g, c) {
    g.fillStyle = css(c, 0.55); g.fillRect(12, 10, 40, 44);
    g.fillStyle = lg(g, 12, 10, 52, 54, [[0, "rgba(255,255,255,0)"], [0.3, "rgba(255,255,255,0.75)"], [0.4, "rgba(255,255,255,0.05)"], [0.55, "rgba(255,255,255,0.4)"], [0.6, "rgba(255,255,255,0)"]]); g.fillRect(12, 10, 40, 44);
    g.strokeStyle = "#e9e4d6"; g.lineWidth = 3; g.strokeRect(12, 10, 40, 44); g.strokeStyle = DARK; g.lineWidth = 1; g.strokeRect(10.5, 8.5, 43, 47);
  },
  hide(g, c) {
    g.fillStyle = lg(g, 10, 10, 54, 54, [[0, shade(c, 1.3)], [1, shade(c, 0.7)]]);
    g.beginPath(); g.moveTo(32, 8); g.bezierCurveTo(40, 8, 44, 14, 52, 12); g.bezierCurveTo(56, 20, 48, 26, 52, 34); g.bezierCurveTo(56, 44, 48, 46, 50, 54); g.bezierCurveTo(40, 56, 36, 52, 32, 56);
    g.bezierCurveTo(28, 52, 24, 56, 14, 54); g.bezierCurveTo(16, 46, 8, 44, 12, 34); g.bezierCurveTo(16, 26, 8, 20, 12, 12); g.bezierCurveTo(20, 14, 24, 8, 32, 8); g.fill();
    g.strokeStyle = DARK; g.lineWidth = 1.3; g.stroke();
    g.strokeStyle = "rgba(0,0,0,0.18)"; g.lineWidth = 1; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(20 + i * 3, 18); g.lineTo(18 + i * 3.5, 46); g.stroke(); }
  },
  feather(g, c) {
    g.save(); g.translate(32, 32); g.rotate(-0.7);
    g.fillStyle = lg(g, -6, 0, 6, 0, [[0, shade(c, 1.1)], [1, shade(c, 0.75)]]); g.beginPath(); g.moveTo(0, -26); g.bezierCurveTo(12, -14, 10, 10, 2, 22); g.lineTo(-2, 22); g.bezierCurveTo(-10, 10, -12, -14, 0, -26); g.fill();
    g.strokeStyle = DARK; g.lineWidth = 1.1; g.stroke();
    g.strokeStyle = "#8a6a4a"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, -24); g.lineTo(0, 28); g.stroke();
    g.strokeStyle = "rgba(120,90,60,0.5)"; g.lineWidth = 0.8; for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(0, -18 + i * 6); g.lineTo(-7, -14 + i * 6); g.moveTo(0, -18 + i * 6); g.lineTo(7, -14 + i * 6); g.stroke(); }
    g.restore();
  },
  fang(g, c) {
    g.fillStyle = lg(g, 20, 0, 44, 0, [[0, "#ffffff"], [0.6, c], [1, shade(c, 0.7)]]);
    g.beginPath(); g.moveTo(20, 12); g.bezierCurveTo(28, 8, 40, 8, 44, 12); g.bezierCurveTo(44, 30, 38, 46, 26, 56); g.bezierCurveTo(28, 40, 22, 26, 20, 12); g.fill();
    g.strokeStyle = DARK; g.lineWidth = 1.3; g.stroke();
    g.fillStyle = "#c8a86a"; g.fillRect(19, 8, 26, 5); g.strokeRect(19, 8, 26, 5);
  },
  sapling(g, c) {
    ell(g, 32, 50, 16, 7, "#6b4a2f"); ell(g, 30, 48, 10, 3.5, "#8a6440");
    g.strokeStyle = "#5a3b22"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(32, 50); g.quadraticCurveTo(30, 34, 33, 18); g.stroke();
    for (const [x, y, a] of [[24, 34, -0.6], [40, 28, 0.6], [26, 22, -0.4], [38, 16, 0.5], [32, 12, 0]]) { ell(g, x, y, 8, 4, shade(c, 0.85), a); ell(g, x - 1, y - 1, 5, 2, shade(c, 1.25), a); }
  },
  dirt(g, c) {
    poly(g, [8, 28, 32, 16, 56, 28, 56, 46, 32, 56, 8, 46], lg(g, 0, 16, 0, 56, [[0, shade(c, 1.15)], [1, shade(c, 0.6)]]), DARK, 1.3);
    poly(g, [8, 28, 32, 16, 56, 28, 32, 36], "#5a9a34", DARK, 1); poly(g, [8, 28, 32, 36, 32, 40, 8, 31], "#3f7a24");
    const r = rng(5); for (let i = 0; i < 8; i++) ell(g, 14 + r() * 36, 38 + r() * 12, 1.6, 1.2, "rgba(200,170,130,0.5)");
  },
  sand(g, c) {
    g.fillStyle = lg(g, 0, 20, 0, 54, [[0, shade(c, 1.15)], [1, shade(c, 0.75)]]);
    g.beginPath(); g.moveTo(6, 52); g.quadraticCurveTo(20, 20, 32, 18); g.quadraticCurveTo(46, 20, 58, 52); g.closePath(); g.fill(); g.strokeStyle = DARK; g.lineWidth = 1.3; g.stroke();
    const r = rng(9); for (let i = 0; i < 18; i++) ell(g, 14 + r() * 36, 28 + r() * 22, 0.9, 0.9, i % 2 ? "rgba(255,255,255,0.6)" : "rgba(120,90,50,0.4)");
  },
  // ---------------------------------------------------------------- food
  berries(g, c) {
    g.strokeStyle = "#4a6a2a"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(32, 8); g.lineTo(26, 24); g.moveTo(32, 8); g.lineTo(40, 26); g.stroke();
    ell(g, 38, 12, 8, 3.5, "#5f9a36", 0.4);
    for (const [x, y] of [[22, 34], [34, 32], [44, 38], [28, 44], [40, 48], [18, 46]]) { ell(g, x, y, 7, 7, shade(c, 0.6)); ell(g, x - 0.5, y - 0.5, 6, 6, c); ell(g, x - 2, y - 2.5, 2, 1.4, "rgba(255,255,255,0.75)"); }
  },
  apple(g, c) {
    g.strokeStyle = "#4a2f1b"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(32, 18); g.quadraticCurveTo(33, 10, 36, 6); g.stroke();
    ell(g, 42, 12, 8, 3.8, "#4f8a2e", -0.5);
    g.fillStyle = rg(g, 32, 36, 2, 24, [[0, shade(c, 1.4)], [0.6, c], [1, shade(c, 0.55)]], 24, 28);
    g.beginPath(); g.moveTo(32, 20); g.bezierCurveTo(44, 12, 56, 24, 52, 40); g.bezierCurveTo(48, 54, 38, 56, 32, 52); g.bezierCurveTo(26, 56, 16, 54, 12, 40); g.bezierCurveTo(8, 24, 20, 12, 32, 20); g.fill();
    g.strokeStyle = DARK; g.lineWidth = 1.3; g.stroke();
    ell(g, 22, 30, 4, 6, "rgba(255,255,255,0.55)", 0.4);
  },
  mushroom(g, c) {
    g.fillStyle = lg(g, 24, 0, 40, 0, [[0, "#fbf3e2"], [1, "#cdbf9f"]]); g.beginPath(); g.moveTo(26, 54); g.lineTo(28, 30); g.lineTo(38, 30); g.lineTo(40, 54); g.closePath(); g.fill(); g.strokeStyle = DARK; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = rg(g, 30, 22, 2, 26, [[0, shade(c, 1.35)], [1, shade(c, 0.65)]], 24, 16);
    g.beginPath(); g.moveTo(8, 32); g.bezierCurveTo(10, 10, 54, 10, 56, 32); g.quadraticCurveTo(32, 38, 8, 32); g.fill(); g.stroke();
    for (const [x, y] of [[22, 22], [36, 18], [44, 26]]) ell(g, x, y, 3, 2, "rgba(255,250,235,0.7)");
  },
  carrot(g, c) {
    for (const a of [-0.5, 0, 0.5]) { g.save(); g.translate(42, 18); g.rotate(a); ell(g, 0, -8, 3, 10, "#4f8a2e"); g.restore(); }
    g.fillStyle = lg(g, 14, 0, 46, 0, [[0, shade(c, 1.25)], [1, shade(c, 0.7)]]);
    g.beginPath(); g.moveTo(44, 18); g.quadraticCurveTo(50, 26, 44, 30); g.lineTo(12, 56); g.quadraticCurveTo(10, 54, 12, 52); g.lineTo(36, 18); g.quadraticCurveTo(40, 14, 44, 18); g.fill(); g.strokeStyle = DARK; g.lineWidth = 1.2; g.stroke();
    g.strokeStyle = "rgba(120,50,10,0.5)"; g.lineWidth = 1; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(34 - i * 6, 26 + i * 6); g.lineTo(40 - i * 6, 28 + i * 6); g.stroke(); }
  },
  meat(g, c) {
    g.fillStyle = lg(g, 10, 14, 54, 52, [[0, shade(c, 1.2)], [1, shade(c, 0.7)]]);
    g.beginPath(); g.moveTo(10, 30); g.bezierCurveTo(10, 14, 40, 8, 52, 20); g.bezierCurveTo(60, 30, 52, 52, 32, 52); g.bezierCurveTo(16, 52, 10, 42, 10, 30); g.fill(); g.strokeStyle = DARK; g.lineWidth = 1.3; g.stroke();
    g.strokeStyle = "rgba(255,245,235,0.8)"; g.lineWidth = 2.4; g.beginPath(); g.moveTo(16, 28); g.bezierCurveTo(26, 22, 34, 34, 46, 26); g.stroke();
    g.lineWidth = 1.4; g.beginPath(); g.moveTo(20, 40); g.bezierCurveTo(28, 36, 36, 44, 46, 38); g.stroke();
    ell(g, 46, 18, 4, 3, "#f4ead8"); ell(g, 46, 18, 2, 1.5, "#c9b89a");
  },
  steak(g, c) {
    P.meat(g, c);
    g.strokeStyle = "rgba(40,18,6,0.7)"; g.lineWidth = 2.6; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(14 + i * 9, 44); g.lineTo(24 + i * 9, 20); g.stroke(); }
  },
  fish(g, c) {
    g.fillStyle = lg(g, 0, 18, 0, 46, [[0, shade(c, 1.25)], [0.6, c], [1, "#f2efe6"]]);
    g.beginPath(); g.moveTo(8, 32); g.bezierCurveTo(16, 16, 40, 16, 48, 30); g.lineTo(58, 20); g.lineTo(56, 32); g.lineTo(58, 44); g.lineTo(48, 34); g.bezierCurveTo(40, 48, 16, 48, 8, 32); g.fill(); g.strokeStyle = DARK; g.lineWidth = 1.2; g.stroke();
    ell(g, 16, 30, 2.4, 2.4, "#ffffff"); ell(g, 16.4, 30, 1.3, 1.3, "#111");
    const r = rng(3); for (let i = 0; i < 9; i++) ell(g, 22 + r() * 22, 26 + r() * 8, 1.2, 1.2, "rgba(60,40,30,0.55)");
    g.strokeStyle = "rgba(0,0,0,0.25)"; g.beginPath(); g.moveTo(22, 24); g.quadraticCurveTo(26, 32, 22, 40); g.stroke();
  },
  drumstick(g, c) {
    g.strokeStyle = "#f4ead8"; g.lineWidth = 6; g.lineCap = "round"; g.beginPath(); g.moveTo(40, 40); g.lineTo(52, 52); g.stroke();
    ell(g, 54, 50, 4, 4, "#f4ead8"); ell(g, 50, 54, 4, 4, "#f4ead8");
    g.fillStyle = rg(g, 26, 26, 2, 22, [[0, shade(c, 1.35)], [1, shade(c, 0.65)]], 20, 20);
    g.beginPath(); g.ellipse(28, 28, 18, 14, 0.75, 0, TAU); g.fill(); g.strokeStyle = DARK; g.lineWidth = 1.3; g.stroke();
    ell(g, 22, 22, 6, 3, "rgba(255,255,255,0.35)", 0.75);
  },
  roast(g, c) {
    g.strokeStyle = "#f4ead8"; g.lineWidth = 5; g.beginPath(); g.moveTo(8, 22); g.lineTo(18, 28); g.moveTo(46, 44); g.lineTo(58, 50); g.stroke();
    g.fillStyle = rg(g, 32, 34, 2, 26, [[0, shade(c, 1.35)], [1, shade(c, 0.6)]], 26, 26);
    g.beginPath(); g.ellipse(32, 36, 22, 16, 0.4, 0, TAU); g.fill(); g.strokeStyle = DARK; g.lineWidth = 1.3; g.stroke();
    g.strokeStyle = "rgba(255,240,220,0.35)"; g.lineWidth = 2; g.beginPath(); g.ellipse(30, 32, 12, 8, 0.4, 3.6, 5.2); g.stroke();
  },
  jerky(g, c) {
    for (let i = 0; i < 3; i++) {
      g.save(); g.translate(20 + i * 12, 32); g.rotate(0.2 - i * 0.1);
      g.fillStyle = lg(g, -5, 0, 5, 0, [[0, shade(c, 1.3)], [1, shade(c, 0.7)]]); g.beginPath(); g.moveTo(-5, -22); g.lineTo(5, -20); g.lineTo(4, 22); g.lineTo(-6, 20); g.closePath(); g.fill();
      g.strokeStyle = DARK; g.lineWidth = 1; g.stroke(); g.restore();
    }
  },
  stew(g, c) {
    g.fillStyle = lg(g, 8, 30, 56, 56, [[0, "#9a6b3f"], [1, "#5a3b22"]]); g.beginPath(); g.moveTo(6, 30); g.quadraticCurveTo(10, 56, 32, 56); g.quadraticCurveTo(54, 56, 58, 30); g.closePath(); g.fill(); g.strokeStyle = DARK; g.lineWidth = 1.3; g.stroke();
    ell(g, 32, 30, 26, 7, shade(c, 0.85)); ell(g, 32, 29, 22, 5, c);
    for (const [x, y, col] of [[24, 29, "#ee8a2a"], [36, 28, "#c79a5e"], [42, 30, "#5f9a36"], [30, 31, "#8d4f2a"]]) ell(g, x, y, 3, 1.6, col);
    g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(22 + i * 10, 20); g.bezierCurveTo(18 + i * 10, 14, 26 + i * 10, 12, 22 + i * 10, 6); g.stroke(); }
  },
  pie(g, c) {
    ell(g, 32, 40, 26, 12, "#c99a5c"); ell(g, 32, 38, 24, 10, c);
    g.strokeStyle = "#e0b06a"; g.lineWidth = 3; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(32 + i * 8 - 6, 30); g.lineTo(32 + i * 8 + 6, 46); g.stroke(); g.beginPath(); g.moveTo(32 + i * 8 + 6, 30); g.lineTo(32 + i * 8 - 6, 46); g.stroke(); }
    g.strokeStyle = DARK; g.lineWidth = 1.3; g.beginPath(); g.ellipse(32, 40, 26, 12, 0, 0, TAU); g.stroke();
    g.fillStyle = "#e9c07a"; g.beginPath(); g.ellipse(32, 40, 26, 12, 0, 0.1, Math.PI - 0.1); g.lineTo(6, 46); g.quadraticCurveTo(32, 60, 58, 46); g.fill();
  },
  // ---------------------------------------------------------------- tools
  axe(g, c, c2, t) {
    handle(g, 16, 56, 44, 10, 5, c2 || "#7a5532");
    if (t === 2) { stoneChip(g, [36, 10, 54, 14, 58, 30, 44, 26, 34, 22], t, c); wrap(g, 40, 18, -0.9); return; }
    g.fillStyle = headFill(g, t, 30, 8, 58, 34, c);
    g.beginPath(); g.moveTo(34, 12); g.quadraticCurveTo(48, 4, 58, 12); g.quadraticCurveTo(58, 26, 52, 34); g.quadraticCurveTo(46, 24, 38, 24); g.closePath(); g.fill();
    g.strokeStyle = DARK; g.lineWidth = 1.3; g.stroke();
    g.strokeStyle = t >= 3 ? "rgba(255,255,255,0.9)" : "rgba(255,240,210,0.5)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(57, 13); g.quadraticCurveTo(58, 24, 52, 32); g.stroke();
  },
  pickaxe(g, c, c2, t) {
    handle(g, 18, 58, 40, 14, 5, c2 || "#7a5532");
    g.fillStyle = headFill(g, t, 8, 8, 56, 26, c);
    g.beginPath(); g.moveTo(6, 26); g.quadraticCurveTo(18, 8, 40, 10); g.quadraticCurveTo(54, 12, 58, 22); g.quadraticCurveTo(48, 16, 40, 18); g.quadraticCurveTo(22, 16, 6, 26); g.closePath(); g.fill();
    g.strokeStyle = DARK; g.lineWidth = 1.3; g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(12, 20); g.quadraticCurveTo(24, 11, 40, 12); g.stroke();
    if (t === 2) wrap(g, 38, 16, -0.4);
  },
  sword(g, c, c2, t) {
    g.save(); g.translate(32, 32); g.rotate(Math.PI / 4);
    g.fillStyle = headFill(g, t, -5, -28, 5, 10, c);
    g.beginPath(); g.moveTo(-5, 8); g.lineTo(-5, -20); g.lineTo(0, -29); g.lineTo(5, -20); g.lineTo(5, 8); g.closePath(); g.fill(); g.strokeStyle = DARK; g.lineWidth = 1.2; g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-1.5, 6); g.lineTo(-1.5, -22); g.stroke();
    g.fillStyle = t >= 3 ? "#c8a040" : "#6a4426"; g.fillRect(-11, 8, 22, 5); g.strokeRect(-11, 8, 22, 5);
    g.fillStyle = c2 || "#7a5532"; g.fillRect(-3, 13, 6, 12); g.strokeRect(-3, 13, 6, 12);
    ell(g, 0, 27, 4, 4, t >= 3 ? "#e8c050" : "#6a4426"); g.restore();
  },
  spear(g, c, c2, t) {
    handle(g, 8, 58, 44, 18, 4, c2 || "#7a5532");
    g.save(); g.translate(46, 16); g.rotate(Math.PI / 4);
    g.fillStyle = headFill(g, t, -6, -16, 6, 4, c); g.beginPath(); g.moveTo(0, -18); g.lineTo(6, -2); g.lineTo(0, 4); g.lineTo(-6, -2); g.closePath(); g.fill(); g.strokeStyle = DARK; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = "rgba(255,255,255,0.55)"; g.beginPath(); g.moveTo(0, -16); g.lineTo(-4, -2); g.lineTo(0, 2); g.closePath(); g.fill();
    g.restore(); wrap(g, 42, 21, -0.8);
  },
  hammer(g, c, c2, t) {
    handle(g, 16, 58, 38, 18, 5, c2 || "#7a5532");
    g.save(); g.translate(40, 16); g.rotate(-0.78);
    g.fillStyle = headFill(g, t, -16, -8, 16, 8, c); g.beginPath(); if (g.roundRect) g.roundRect(-16, -8, 32, 16, 3); else g.rect(-16, -8, 32, 16); g.fill(); g.strokeStyle = DARK; g.lineWidth = 1.3; g.stroke();
    g.fillStyle = "rgba(255,255,255,0.45)"; g.fillRect(-14, -6, 28, 3);
    g.restore();
  },
  bow(g, c) {
    g.strokeStyle = shade(c, 0.6); g.lineWidth = 6; g.beginPath(); g.arc(16, 48, 38, -1.45, -0.12); g.stroke();
    g.strokeStyle = c; g.lineWidth = 4; g.beginPath(); g.arc(16, 48, 38, -1.45, -0.12); g.stroke();
    g.strokeStyle = "#efe6cc"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(20, 10.5); g.lineTo(53.5, 43.5); g.stroke();
    g.fillStyle = "#c8a86a"; g.save(); g.translate(43, 22); g.rotate(0.78); g.fillRect(-3, -5, 6, 10); g.restore();
  },
  arrow(g, c) {
    handle(g, 12, 52, 48, 16, 2.6, c);
    poly(g, [50, 14, 56, 8, 54, 18, 46, 20], "#8d8c88", DARK, 1); poly(g, [56, 8, 48, 12, 52, 16], "#c2c0b8");
    for (const s of [-1, 1]) poly(g, [12, 52, 18 + s * 2, 40 - s * 2, 22, 44, 16 + s * 3, 54 + s * 2], s > 0 ? "#e8e2d0" : "#c7432e", DARK, 0.8);
  },
  // ---------------------------------------------------------------- placeables
  torch(g) {
    handle(g, 30, 58, 34, 24, 6, "#7a5532");
    g.fillStyle = "#3a2a1a"; g.fillRect(28, 22, 9, 6);
    g.fillStyle = rg(g, 33, 16, 1, 14, [[0, "#fff6c8"], [0.4, "#ffc04a"], [1, "rgba(255,110,30,0)"]]); g.beginPath(); g.arc(33, 16, 14, 0, TAU); g.fill();
    g.fillStyle = "#ff8a2a"; g.beginPath(); g.moveTo(33, 2); g.quadraticCurveTo(42, 14, 37, 22); g.lineTo(29, 22); g.quadraticCurveTo(25, 14, 33, 2); g.fill();
    g.fillStyle = "#ffe48a"; g.beginPath(); g.moveTo(33, 9); g.quadraticCurveTo(38, 16, 35, 21); g.lineTo(31, 21); g.quadraticCurveTo(29, 16, 33, 9); g.fill();
  },
  lantern(g) {
    g.strokeStyle = "#3a3a3e"; g.lineWidth = 2.5; g.beginPath(); g.arc(32, 12, 7, Math.PI, 0); g.stroke();
    g.fillStyle = "#3a3a3e"; g.fillRect(20, 14, 24, 6); g.fillRect(22, 50, 20, 6);
    g.fillStyle = rg(g, 32, 34, 2, 16, [[0, "#fffbe0"], [0.5, "#ffd27a"], [1, "#e09a3a"]]); g.fillRect(22, 20, 20, 30);
    g.strokeStyle = "#2a2a2e"; g.lineWidth = 2; g.strokeRect(22, 20, 20, 30); g.beginPath(); g.moveTo(32, 20); g.lineTo(32, 50); g.stroke();
    g.strokeStyle = DARK; g.lineWidth = 1; g.strokeRect(19.5, 13.5, 25, 43);
  },
  workbench(g) {
    g.fillStyle = "#6a4426"; g.fillRect(12, 30, 6, 24); g.fillRect(46, 30, 6, 24);
    g.fillStyle = lg(g, 0, 22, 0, 32, [[0, "#d2a46a"], [1, "#9a6b3f"]]); g.fillRect(6, 22, 52, 10); g.strokeStyle = DARK; g.lineWidth = 1.3; g.strokeRect(6, 22, 52, 10);
    g.fillStyle = "#8a5a32"; g.fillRect(16, 42, 32, 4);
    handle(g, 16, 18, 30, 8, 3, "#7a5532"); g.fillStyle = "#a9adb6"; g.fillRect(28, 4, 8, 6);
    g.fillStyle = "#c9ccd2"; g.beginPath(); g.moveTo(38, 20); g.lineTo(54, 12); g.lineTo(56, 16); g.lineTo(42, 22); g.closePath(); g.fill();
  },
  campfire(g) {
    g.fillStyle = rg(g, 32, 38, 2, 26, [[0, "rgba(255,200,90,0.6)"], [1, "rgba(255,140,40,0)"]]); g.beginPath(); g.arc(32, 38, 26, 0, TAU); g.fill();
    for (const [x, a] of [[22, 0.5], [42, -0.5]]) { g.save(); g.translate(x, 48); g.rotate(a); g.fillStyle = "#6b4b32"; g.fillRect(-14, -4, 28, 8); g.fillStyle = "#d6ae79"; g.beginPath(); g.ellipse(14, 0, 2.5, 4, 0, 0, TAU); g.fill(); g.restore(); }
    for (let i = 0; i < 5; i++) ell(g, 10 + i * 11, 56, 6, 4, i % 2 ? "#8d8c88" : "#a9a69c");
    g.fillStyle = "#ff7a22"; g.beginPath(); g.moveTo(32, 12); g.quadraticCurveTo(46, 30, 40, 46); g.lineTo(24, 46); g.quadraticCurveTo(18, 30, 32, 12); g.fill();
    g.fillStyle = "#ffd85a"; g.beginPath(); g.moveTo(32, 24); g.quadraticCurveTo(40, 36, 36, 46); g.lineTo(28, 46); g.quadraticCurveTo(24, 36, 32, 24); g.fill();
  },
  furnace(g) {
    g.fillStyle = lg(g, 0, 10, 0, 56, [[0, "#a9a69c"], [1, "#6a675f"]]); g.beginPath(); g.moveTo(10, 56); g.lineTo(12, 18); g.quadraticCurveTo(32, 4, 52, 18); g.lineTo(54, 56); g.closePath(); g.fill(); g.strokeStyle = DARK; g.lineWidth = 1.3; g.stroke();
    g.strokeStyle = "rgba(40,36,30,0.6)"; g.lineWidth = 1; for (let r2 = 0; r2 < 5; r2++) { g.beginPath(); g.moveTo(12, 22 + r2 * 7); g.lineTo(52, 22 + r2 * 7); g.stroke(); }
    g.fillStyle = "#1a1410"; g.beginPath(); g.moveTo(22, 54); g.lineTo(22, 38); g.quadraticCurveTo(32, 30, 42, 38); g.lineTo(42, 54); g.closePath(); g.fill();
    g.fillStyle = rg(g, 32, 50, 1, 12, [[0, "#fff0a0"], [0.5, "#ff8a2a"], [1, "rgba(200,60,10,0.4)"]]); g.beginPath(); g.ellipse(32, 50, 9, 5, 0, 0, TAU); g.fill();
  },
  anvil(g) {
    g.fillStyle = lg(g, 0, 18, 0, 30, [[0, "#7a808a"], [1, "#3a3e46"]]);
    g.beginPath(); g.moveTo(6, 20); g.quadraticCurveTo(14, 30, 22, 30); g.lineTo(44, 30); g.lineTo(46, 20); g.closePath(); g.fill(); g.strokeStyle = DARK; g.lineWidth = 1.3; g.stroke();
    g.fillStyle = "#4b4f57"; g.fillRect(24, 30, 16, 14); g.strokeRect(24, 30, 16, 14);
    g.fillStyle = "#3a3e46"; g.beginPath(); g.moveTo(16, 54); g.lineTo(22, 44); g.lineTo(42, 44); g.lineTo(48, 54); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.45)"; g.fillRect(10, 20, 34, 2.5);
  },
  chest(g) {
    g.fillStyle = lg(g, 0, 24, 0, 56, [[0, "#b88350"], [1, "#7a4f2c"]]); g.fillRect(8, 28, 48, 26); g.strokeStyle = DARK; g.lineWidth = 1.3; g.strokeRect(8, 28, 48, 26);
    g.fillStyle = lg(g, 0, 12, 0, 28, [[0, "#d2a46a"], [1, "#9a6b3f"]]); g.beginPath(); g.moveTo(8, 28); g.quadraticCurveTo(8, 12, 32, 12); g.quadraticCurveTo(56, 12, 56, 28); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#4b4f57"; g.fillRect(14, 12.5, 4, 41.5); g.fillRect(46, 12.5, 4, 41.5);
    g.fillStyle = "#e8c050"; g.fillRect(28, 26, 8, 10); g.strokeRect(28, 26, 8, 10); g.fillStyle = "#3a2a1a"; g.fillRect(31, 30, 2, 4);
  },
};

function generic(g, c, name) {
  g.fillStyle = lg(g, 10, 10, 54, 54, [[0, shade(c, 1.4)], [0.5, c], [1, shade(c, 0.6)]]);
  g.beginPath(); g.moveTo(32, 6); g.lineTo(56, 24); g.lineTo(48, 56); g.lineTo(16, 56); g.lineTo(8, 24); g.closePath(); g.fill();
  g.strokeStyle = DARK; g.lineWidth = 1.4; g.stroke();
  g.fillStyle = "rgba(255,255,255,0.9)"; g.font = "bold 26px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText((name || "?")[0].toUpperCase(), 32, 36);
}

// bake one icon at px canvas pixels
export function bakeIcon(id, px) {
  const it = ITEMS[id];
  const A = makeCanvas(px, px), ga = A.getContext("2d");
  const s = px / 64; ga.setTransform(s * 0.88, 0, 0, s * 0.88, px * 0.06, px * 0.05);
  ga.lineJoin = "round"; ga.lineCap = "round";
  if (it) {
    const ic = it.icon || {}, tier = it.tool ? it.tool.tier : 0, col = ic.color || (tier ? TIER_COLOR[tier] : "#999");
    const fn = P[ic.shape];
    try { if (fn) fn(ga, col, ic.color2, tier, it); else generic(ga, col, it.name); } catch (e) { generic(ga, col, it.name); }
  } else generic(ga, "#888", "?");
  // rim + shadow
  const out = makeCanvas(px, px), g = out.getContext("2d");
  const sil = makeCanvas(px, px), gs = sil.getContext("2d"); gs.drawImage(A, 0, 0); gs.globalCompositeOperation = "source-in"; gs.fillStyle = "rgba(20,12,6,0.75)"; gs.fillRect(0, 0, px, px);
  const o = Math.max(1, px / 40);
  g.globalAlpha = 0.35; g.drawImage(sil, o * 0.8, o * 2.2); g.globalAlpha = 1;
  for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) g.drawImage(sil, dx * 0.6, dy * 0.6);
  g.drawImage(A, 0, 0);
  return out;
}
export const ICON_SHAPES = Object.keys(P);
