// render/objects.js - world objects (BONUS_RENDER): placed stations (workbench, campfire, furnace, anvil, chest, torch,
// lantern) and natural pickables (berry bush, tall grass, mushrooms, loose rocks, wildflowers). Static parts are baked
// per (kind, variant); flames / glows are drawn per frame in the glow pass so they shine at night.
import { T } from "../core/const.js";
import { OBJECT_DEFS } from "../data/tiles.js";
import { paintFoliage } from "../../render/art.js";
import { bake, blit, rng, mix, shade, lg, rg, ell, poly, rrect, TAU, PAL, glowSprite, shadowSprite } from "./kit.js";

const S = 2;
const L = { x: -0.5, y: -0.86 };

const PAINT = {
  workbench(g, r) { // 64 x 40, anchor bottom-left
    g.fillStyle = "#5a3b22"; for (const x of [6, 54]) { g.fillRect(x, 14, 6, 26); }
    g.fillStyle = "#6a4426"; g.fillRect(8, 30, 50, 4);
    g.fillStyle = lg(g, 0, 8, 0, 16, [[0, "#d7a86c"], [1, "#9a6b3f"]]); g.fillRect(1, 8, 62, 8);
    g.strokeStyle = "rgba(60,30,10,0.6)"; g.lineWidth = 0.8; g.strokeRect(1, 8, 62, 8); g.beginPath(); g.moveTo(20, 8); g.lineTo(20, 16); g.moveTo(42, 8); g.lineTo(42, 16); g.stroke();
    // saw + hammer + plank on top, vise
    g.fillStyle = "#c9ccd2"; g.beginPath(); g.moveTo(6, 8); g.lineTo(26, 3); g.lineTo(27, 6); g.lineTo(8, 8); g.closePath(); g.fill();
    g.fillStyle = "#7a5532"; g.fillRect(26, 2, 6, 5);
    g.fillStyle = "#c99a5c"; g.fillRect(34, 4, 22, 4); g.strokeStyle = "rgba(60,30,10,0.5)"; g.strokeRect(34, 4, 22, 4);
    g.fillStyle = "#4b4f57"; g.fillRect(57, 6, 6, 12); g.fillRect(55, 4, 8, 3);
    g.fillStyle = "rgba(255,240,200,0.25)"; g.fillRect(1, 8, 62, 1.5);
    for (let i = 0; i < 6; i++) ell(g, 10 + r() * 46, 38 + r() * 1.5, 1.6, 0.8, "#d8b07a");
  },
  campfire(g, r) { // 32 x 20 base (logs + stones); flames are drawn live
    ell(g, 16, 18, 15, 3, "rgba(20,10,4,0.5)");
    ell(g, 16, 17, 10, 2.5, "#2a1a10");
    for (const [x, a] of [[10, 0.35], [22, -0.35], [16, 0]]) { g.save(); g.translate(x, 14); g.rotate(a); g.fillStyle = lg(g, 0, -3, 0, 3, [[0, "#8a6440"], [1, "#4a2f1b"]]); g.fillRect(-9, -3, 18, 6); g.fillStyle = "#2a1a10"; g.fillRect(-2, -3, 5, 6); ell(g, 9, 0, 1.6, 3, "#d6ae79"); g.restore(); }
    for (let i = 0; i < 7; i++) { const x = 2 + i * 4.6, s = 2.8 + r() * 1.2; ell(g, x, 18 - s * 0.4, s, s * 0.75, mix("#8d8c88", "#b5b2a6", r())); ell(g, x - 0.8, 17.2 - s * 0.6, s * 0.4, s * 0.25, "rgba(255,255,255,0.35)"); }
  },
  furnace(g) { // 64 x 64
    g.fillStyle = lg(g, 0, 0, 64, 0, [[0, "#b3afa4"], [0.5, "#8b877d"], [1, "#5d5a53"]]);
    g.beginPath(); g.moveTo(2, 64); g.lineTo(4, 26); g.quadraticCurveTo(32, 6, 60, 26); g.lineTo(62, 64); g.closePath(); g.fill();
    g.fillStyle = "#6d6a62"; g.fillRect(40, 0, 12, 18); g.fillStyle = "#4a4741"; g.fillRect(39, 0, 14, 4);
    // stones
    const r = rng(9);
    g.strokeStyle = "rgba(40,36,30,0.55)"; g.lineWidth = 1.2;
    for (let row = 0; row < 6; row++) { const y = 28 + row * 6; g.beginPath(); g.moveTo(4, y); g.lineTo(60, y); g.stroke(); for (let k = 0; k < 5; k++) { const x = 6 + k * 12 + (row % 2) * 6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 6); g.stroke(); } }
    for (let k = 0; k < 14; k++) ell(g, 6 + r() * 52, 26 + r() * 36, 2 + r() * 3, 1.4, "rgba(255,255,255,0.12)");
    // mouth
    g.fillStyle = "#16100c"; g.beginPath(); g.moveTo(18, 62); g.lineTo(18, 46); g.quadraticCurveTo(32, 34, 46, 46); g.lineTo(46, 62); g.closePath(); g.fill();
    g.fillStyle = "rgba(0,0,0,0.35)"; g.beginPath(); g.ellipse(32, 22, 22, 8, 0, Math.PI, TAU); g.fill();
    g.fillStyle = "#3a3632"; g.fillRect(14, 60, 36, 4);
  },
  anvil(g) { // 32 x 32 on a stump
    g.fillStyle = lg(g, 6, 0, 26, 0, [[0, "#93704c"], [1, "#4a2f1b"]]); g.fillRect(7, 18, 18, 14); ell(g, 16, 18, 9, 2.5, "#d6ae79");
    g.fillStyle = lg(g, 0, 6, 0, 14, [[0, "#8a909a"], [1, "#3a3e46"]]);
    g.beginPath(); g.moveTo(1, 7); g.quadraticCurveTo(5, 13, 10, 13); g.lineTo(23, 13); g.lineTo(29, 7); g.closePath(); g.fill();
    g.fillStyle = "#454950"; g.fillRect(11, 13, 10, 3); g.beginPath(); g.moveTo(8, 18); g.lineTo(11, 15.5); g.lineTo(21, 15.5); g.lineTo(24, 18); g.closePath(); g.fill();
    g.fillStyle = "rgba(255,255,255,0.5)"; g.fillRect(4, 7, 24, 1.3);
  },
  chest(g) { // 32 x 28
    g.fillStyle = lg(g, 0, 12, 0, 28, [[0, "#b88350"], [1, "#6e4526"]]); g.fillRect(2, 12, 28, 16);
    g.fillStyle = lg(g, 0, 2, 0, 12, [[0, "#d2a46a"], [1, "#9a6b3f"]]); g.beginPath(); g.moveTo(2, 12); g.quadraticCurveTo(2, 2, 16, 2); g.quadraticCurveTo(30, 2, 30, 12); g.closePath(); g.fill();
    g.strokeStyle = "rgba(50,25,10,0.7)"; g.lineWidth = 0.8; g.strokeRect(2, 12, 28, 16); g.beginPath(); g.moveTo(2, 12); g.lineTo(30, 12); g.moveTo(2, 20); g.lineTo(30, 20); g.stroke();
    g.fillStyle = "#4b4f57"; g.fillRect(6, 2.5, 3, 25.5); g.fillRect(23, 2.5, 3, 25.5);
    g.fillStyle = "#e8c050"; g.fillRect(13.5, 10, 5, 6); g.fillStyle = "#3a2a1a"; g.fillRect(15.4, 12, 1.2, 2.5);
    g.fillStyle = "rgba(255,240,210,0.3)"; g.fillRect(3, 4, 26, 1.2);
  },
  torch(g) { // 32 x 32: a stake torch (wall variant drawn live)
    g.fillStyle = lg(g, 14, 0, 18, 0, [[0, "#9a6b3f"], [1, "#5a3b22"]]); g.fillRect(14.5, 12, 3, 20);
    g.fillStyle = "#3a2a1a"; g.fillRect(13.5, 10, 5, 4);
  },
  lantern(g) { // 32 x 32
    g.strokeStyle = "#2e2e32"; g.lineWidth = 1.4; g.beginPath(); g.arc(16, 6, 3.5, Math.PI, 0); g.stroke();
    g.fillStyle = "#2e2e32"; g.fillRect(9, 7, 14, 3); g.fillRect(10, 26, 12, 3);
    g.fillStyle = "rgba(255,220,150,0.5)"; g.fillRect(10, 10, 12, 16);
    g.strokeStyle = "#26262a"; g.lineWidth = 1.2; g.strokeRect(10, 10, 12, 16); g.beginPath(); g.moveTo(16, 10); g.lineTo(16, 26); g.stroke();
  },
  bush(g, r) { // 40 x 30
    paintFoliage(g, 20, 17, 17, 12, ["#1f3d17", "#2f5b22", "#467f2c", "#6aa53a", "#9cc95a"], L, r, { clusters: 7, leaf: 3.2, per: 16 });
  },
  tallgrass(g, r) { // 32 x 28
    for (let i = 0; i < 16; i++) {
      const bx = 4 + r() * 24, h = 10 + r() * 16, lean = (r() - 0.5) * 10, w = 1.2 + r();
      g.fillStyle = r() < 0.3 ? "#a9c860" : r() < 0.6 ? "#6aa53a" : "#3f7a24";
      g.beginPath(); g.moveTo(bx - w, 28); g.quadraticCurveTo(bx + lean * 0.3, 28 - h * 0.6, bx + lean, 28 - h); g.quadraticCurveTo(bx + lean * 0.4, 28 - h * 0.5, bx + w, 28); g.closePath(); g.fill();
    }
    for (let i = 0; i < 3; i++) { const x = 8 + r() * 16, h = 18 + r() * 8; g.strokeStyle = "#8a9a4a"; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x, 28); g.lineTo(x + 1, 28 - h); g.stroke(); ell(g, x + 1, 28 - h - 2, 1.6, 3.6, "#c8b46a"); }
  },
  mushroom(g, r) { // 32 x 20
    const n = 2 + (r() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const x = 6 + i * 9 + r() * 4, h = 6 + r() * 6, cw = 4 + r() * 3;
      g.fillStyle = "#efe6d0"; g.fillRect(x - 1.3, 20 - h, 2.6, h);
      g.fillStyle = rg(g, x - 1, 20 - h - 1, 0.5, cw * 1.3, [[0, "#d8a070"], [1, "#7a4a28"]]);
      g.beginPath(); g.moveTo(x - cw, 20 - h + 1); g.quadraticCurveTo(x, 20 - h - cw * 1.4, x + cw, 20 - h + 1); g.closePath(); g.fill();
      ell(g, x - cw * 0.3, 20 - h - cw * 0.4, cw * 0.3, cw * 0.18, "rgba(255,240,220,0.45)");
    }
  },
  boulder(g, r) { // 32 x 22
    const rocks = [[11, 15, 9, 7], [21, 16, 8, 6], [16, 9, 7, 6]];
    for (const [x, y, w, h] of rocks) {
      const pts = []; for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU, d = 0.82 + r() * 0.25; pts.push(x + Math.cos(a) * w * d, y + Math.sin(a) * h * d); }
      poly(g, pts, lg(g, x - w, y - h, x + w, y + h, [[0, "#c2bfb3"], [0.5, "#8d8a80"], [1, "#55534d"]]), "rgba(40,36,30,0.6)", 0.8);
      ell(g, x - w * 0.3, y - h * 0.35, w * 0.35, h * 0.2, "rgba(255,255,255,0.3)");
      if (r() < 0.6) ell(g, x + w * 0.2, y - h * 0.7, w * 0.4, h * 0.18, "rgba(100,150,60,0.6)");
    }
  },
  flowers(g, r) { // 32 x 24
    const cols = ["#f4f1ea", "#ffd84a", "#d96aa6", "#8a7cf0", "#ff6a5a", "#ff9a4a"];
    for (let i = 0; i < 6; i++) {
      const x = 4 + r() * 24, h = 8 + r() * 12, col = cols[(r() * cols.length) | 0];
      g.strokeStyle = "#4f8a2e"; g.lineWidth = 1; g.beginPath(); g.moveTo(x, 24); g.quadraticCurveTo(x + 1, 24 - h / 2, x + (r() - 0.5) * 3, 24 - h); g.stroke();
      ell(g, x + 2, 24 - h * 0.4, 2.2, 1, "#5f9a36", 0.5);
      for (let p = 0; p < 5; p++) { const a = p * 1.2566; ell(g, x + Math.cos(a) * 2, 24 - h + Math.sin(a) * 2, 1.7, 1.7, col); }
      ell(g, x, 24 - h, 1.1, 1.1, col === "#ffd84a" ? "#b85a14" : "#ffd84a");
    }
  },
};
const SIZE = { workbench: [64, 40], campfire: [32, 20], furnace: [64, 64], anvil: [32, 32], chest: [32, 28], torch: [32, 32], lantern: [32, 32], bush: [40, 30], tallgrass: [32, 28], mushroom: [32, 20], boulder: [32, 22], flowers: [32, 24] };
const VAR = { bush: 3, tallgrass: 3, mushroom: 3, boulder: 3, flowers: 3, campfire: 2, workbench: 1 };

export function createObjects(fx, FXK) {
  const cache = new Map();
  const berry = bake(8, 8, 3, (g) => { ell(g, 4, 4, 3, 3, "#7a1a2a"); ell(g, 3.7, 3.7, 2.5, 2.5, "#c2334a"); ell(g, 3, 3, 0.9, 0.7, "rgba(255,255,255,0.8)"); }, 4, 4);
  const sh = shadowSprite();
  function sprite(kind, seed) {
    const nv = VAR[kind] || 1, v = ((seed >>> 0) % nv), k = kind + v;
    let s = cache.get(k);
    if (!s) {
      const [w, h] = SIZE[kind] || [32, 32], fn = PAINT[kind];
      const r = rng(311 * (v + 1) + kind.length * 17);
      s = bake(w, h, S, (g) => { if (fn) fn(g, r); else { g.fillStyle = "#a7743f"; g.fillRect(4, h - 20, w - 8, 20); } }, 0, h);
      cache.set(k, s);
    }
    return s;
  }
  // berry positions per bush variant
  const BERRY = [[10, -14], [22, -20], [30, -12], [16, -8], [26, -24], [8, -20], [20, -12], [32, -18], [14, -24]];

  function draw(ctx, objs, x0, x1, t, solidAt) {
    for (const o of objs) {
      if (o.x < x0 - 3 || o.x > x1 + 3) continue;
      const d = OBJECT_DEFS[o.kind] || { w: 1, h: 1 }, bx = o.x * T, by = (o.y + 1) * T, seed = o.seed | 0;
      const s = sprite(o.kind, seed);
      switch (o.kind) {
        case "tallgrass": case "flowers": {
          ctx.save(); ctx.translate(bx + T / 2, by); ctx.transform(1, 0, Math.sin(t * 1.6 + o.x * 0.9) * 0.12, 1, 0, 0);
          blit2(ctx, s, -T / 2, 0); ctx.restore(); break;
        }
        case "bush": {
          ctx.drawImage(sh, bx - 4, by - 6, 48, 10);
          blit2(ctx, s, bx - 4, by + 1);
          const n = Math.min(9, (o.n | 0) * 3);
          for (let i = 0; i < n; i++) blit(ctx, berry, bx - 4 + BERRY[(i + seed) % 9][0], by + BERRY[(i + seed) % 9][1]);
          break;
        }
        case "torch": case "lantern": {
          const ground = solidAt(o.x, o.y + 1);
          if (o.kind === "torch" && !ground) { // wall bracket
            const side = solidAt(o.x - 1, o.y) ? -1 : 1;
            ctx.save(); ctx.translate(bx + T / 2, by - T / 2); ctx.fillStyle = "#3a3a3e"; ctx.fillRect(side * 10 - 2, 2, 4, 4);
            ctx.rotate(side * 0.45); ctx.fillStyle = "#7a5532"; ctx.fillRect(-1.5, -2, 3, 14); ctx.fillStyle = "#3a2a1a"; ctx.fillRect(-2.5, -4, 5, 4); ctx.restore();
          } else if (o.kind === "lantern" && !ground) {
            ctx.strokeStyle = "#2e2e32"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx + T / 2, by - T); ctx.lineTo(bx + T / 2, by - T + 4); ctx.stroke();
            blit2(ctx, s, bx, by);
          } else blit2(ctx, s, bx, by + 1);
          break;
        }
        default:
          if (d.w > 1 || o.kind === "chest" || o.kind === "anvil") ctx.drawImage(sh, bx - 4, by - 6, d.w * T + 8, 10);
          blit2(ctx, s, bx, by + 1);
      }
    }
  }
  function blit2(ctx, s, x, y) { ctx.drawImage(s, x, y - s.lh, s.lw, s.lh); }

  // flames + glows (glow pass, ctx in world px with "lighter" set by the caller for the halo only)
  function flame(ctx, x, y, h, w, t, seed) {
    const f1 = Math.sin(t * 13 + seed) * 0.12, f2 = Math.sin(t * 9.3 + seed * 2) * 0.15;
    ctx.fillStyle = "rgba(255,110,30,0.9)";
    ctx.beginPath(); ctx.moveTo(x - w, y); ctx.bezierCurveTo(x - w * 1.1, y - h * 0.5, x + w * f2 * 3 - w * 0.3, y - h * 0.7, x + w * f1 * 4, y - h); ctx.bezierCurveTo(x + w * 0.6, y - h * 0.6, x + w * 1.1, y - h * 0.4, x + w, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,200,70,0.95)";
    ctx.beginPath(); ctx.moveTo(x - w * 0.6, y); ctx.bezierCurveTo(x - w * 0.7, y - h * 0.4, x + w * f1 * 2, y - h * 0.55, x + w * f2 * 2, y - h * 0.75); ctx.bezierCurveTo(x + w * 0.4, y - h * 0.45, x + w * 0.7, y - h * 0.3, x + w * 0.6, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,250,210,0.95)";
    ctx.beginPath(); ctx.ellipse(x, y - h * 0.18, w * 0.35, h * 0.2, 0, 0, TAU); ctx.fill();
  }
  function drawGlow(ctx, objs, x0, x1, t, night, solidAt, emitSmoke) {
    const halo = glowSprite(128, "#ffb050", 0.5);
    for (const o of objs) {
      if (o.x < x0 - 3 || o.x > x1 + 3) continue;
      const bx = o.x * T, by = (o.y + 1) * T, seed = (o.seed | 0) % 97;
      if (o.kind === "campfire") {
        ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.35 + 0.45 * night + Math.sin(t * 11 + seed) * 0.05; ctx.drawImage(halo, bx + 16 - 70, by - 18 - 70, 140, 140);
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
        flame(ctx, bx + 13, by - 6, 22, 6, t, seed); flame(ctx, bx + 20, by - 6, 17, 5, t + 0.7, seed + 3);
        if (Math.random() < 0.08) fx.emit(FXK.ember, bx + 16 + (Math.random() - 0.5) * 10, by - 16, (Math.random() - 0.5) * 20, -40 - Math.random() * 40, 1.4, 4, Math.random() < 0.5 ? 0 : 1);
        if (emitSmoke && Math.random() < 0.05) fx.emit(FXK.smoke, bx + 16, by - 30, 4, -18, 3.5, 22, 0);
      } else if (o.kind === "furnace") {
        ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.25 + 0.35 * night; ctx.drawImage(halo, bx + 32 - 60, by - 14 - 60, 120, 120);
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 0.85 + Math.sin(t * 7 + seed) * 0.1;
        ctx.fillStyle = "rgba(255,140,40,0.9)"; ctx.beginPath(); ctx.moveTo(bx + 20, by - 2); ctx.lineTo(bx + 20, by - 14); ctx.quadraticCurveTo(bx + 32, by - 24, bx + 44, by - 14); ctx.lineTo(bx + 44, by - 2); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1; flame(ctx, bx + 32, by - 3, 12, 8, t, seed);
        if (emitSmoke && Math.random() < 0.04) fx.emit(FXK.smoke, bx + 46, by - 64, 3, -20, 3.5, 20, 0);
      } else if (o.kind === "torch") {
        const ground = solidAt(o.x, o.y + 1);
        let fx0 = bx + 16, fy0 = by - 22;
        if (!ground) { const side = solidAt(o.x - 1, o.y) ? -1 : 1; fx0 = bx + 16 - side * 6; fy0 = by - 16 - 4; }
        ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.3 + 0.5 * night; ctx.drawImage(halo, fx0 - 40, fy0 - 40, 80, 80);
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
        flame(ctx, fx0, fy0 + 2, 12, 3.2, t, seed);
        if (Math.random() < 0.03) fx.emit(FXK.ember, fx0, fy0 - 8, (Math.random() - 0.5) * 10, -30, 1, 3, 0);
      } else if (o.kind === "lantern") {
        const ground = solidAt(o.x, o.y + 1), cy = ground ? by - 13 : by - 14;
        ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.35 + 0.5 * night; ctx.drawImage(glowSprite(128, "#ffd27a", 0.45), bx + 16 - 46, cy - 46, 92, 92);
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 0.9 + Math.sin(t * 5 + seed) * 0.08;
        ctx.fillStyle = "#fff2b8"; ctx.fillRect(bx + 11, cy - 7, 10, 14); ctx.globalAlpha = 1;
        ctx.strokeStyle = "#26262a"; ctx.lineWidth = 1.2; ctx.strokeRect(bx + 10, cy - 8, 12, 16); ctx.beginPath(); ctx.moveTo(bx + 16, cy - 8); ctx.lineTo(bx + 16, cy + 8); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
  return { draw, drawGlow, sprite, flame };
}
