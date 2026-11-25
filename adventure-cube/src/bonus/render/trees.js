// render/trees.js - oak / birch / pine / ancient oak: painted trunks + layered canopies baked per (kind, variant),
// stumps, saplings, young trees, apples, wind sway (transform only), chop shake and the falling-tree animation.
import { T } from "../core/const.js";
import { TREE_DEFS } from "../data/tiles.js";
import { paintFoliage } from "../../render/art.js";
import { bake, blit, rng, mix, shade, lg, ell, TAU, PAL, shadowSprite } from "./kit.js";

const TS = 1.5;            // bake scale
const VARIANTS = 4;
const L = { x: -0.5, y: -0.86 };

// bark fill for a trunk path (lit from the left)
function barkFill(g, x0, x1, light, base, dark) { return lg(g, x0, 0, x1, 0, [[0, light], [0.35, base], [1, dark]]); }

function trunkShape(g, pts) { // pts: [[y, halfWidth, xOffset], ...] from base up
  g.beginPath();
  g.moveTo(pts[0][2] - pts[0][1], pts[0][0]);
  for (const [y, w, o] of pts) g.lineTo(o - w, y);
  for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][2] + pts[i][1], pts[i][0]);
  g.closePath();
}
function limb(g, x0, y0, x1, y1, w0, w1, fill) {
  const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a);
  g.fillStyle = fill; g.beginPath();
  g.moveTo(x0 + nx * w0, y0 + ny * w0); g.quadraticCurveTo((x0 + x1) / 2 + nx * w0 * 0.6 + (y1 - y0) * 0.08, (y0 + y1) / 2 + ny * w0 * 0.6, x1 + nx * w1, y1 + ny * w1);
  g.lineTo(x1 - nx * w1, y1 - ny * w1); g.quadraticCurveTo((x0 + x1) / 2 - nx * w0 * 0.6, (y0 + y1) / 2 - ny * w0 * 0.6, x0 - nx * w0, y0 - ny * w0);
  g.closePath(); g.fill();
}
function barkLines(g, r, x0, x1, y0, y1, col, n) {
  g.strokeStyle = col; g.lineWidth = 0.9;
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0), h = 6 + r() * 18;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (r() - 0.5) * 3, y - h / 2, x + (r() - 0.5) * 2, y - h); g.stroke();
  }
}

// ---------------------------------------------------------------------------------------------- bakes
function bakeTree(kind, v) {
  const def = TREE_DEFS[kind], r = rng(7919 * (v + 1) + kind.length * 131);
  const B = PAL.bark;
  if (kind === "oak" || kind === "ancient") {
    const big = kind === "ancient";
    const H = def.h * T, crownW = def.crown * T * (big ? 1.05 : 1.15), crownH = crownW * (big ? 0.72 : 0.8);
    const topY = -(H - crownH * 0.55), bw = big ? 34 : 10, tw = big ? 18 : 6;
    const lean = (r() - 0.5) * (big ? 10 : 8);
    const tw2 = big ? 120 : 50;
    const trunk = bake(tw2 * 2, -topY + 30, TS, (g) => {
      g.translate(tw2, -topY + 6);
      const pts = [[4, bw * 1.5, 0], [-6, bw * 1.15, 0], [-20, bw, lean * 0.1], [topY * 0.5, (bw + tw) / 2 + 1, lean * 0.6], [topY, tw, lean]];
      trunkShape(g, pts); g.fillStyle = barkFill(g, -bw, bw, B.light, B.base, B.dark); g.fill();
      // roots
      for (const s of [-1, 1]) for (let k = 0; k < (big ? 3 : 2); k++) {
        const ex = s * (bw * (1.4 + r() * 0.9 + k * 0.5)), ey = 4 - r() * 3;
        limb(g, s * bw * 0.4, -bw * (0.6 + k * 0.4), ex, ey, bw * 0.42, 1.5, shade(B.base, 0.9 - k * 0.08));
      }
      // limbs into the crown
      const nl = big ? 5 : 3;
      for (let k = 0; k < nl; k++) {
        const s = k % 2 ? 1 : -1, y0 = topY * (0.55 + 0.12 * k), x1 = s * crownW * (0.18 + r() * 0.22), y1 = topY - crownH * (0.1 + r() * 0.3);
        limb(g, lean * 0.5, y0, x1 + lean, y1, tw * 0.9, 1.6, shade(B.base, 0.82 + r() * 0.15));
      }
      limb(g, lean, topY + 4, lean + (r() - 0.5) * 10, topY - crownH * 0.35, tw, 2, B.base);
      g.save(); trunkShape(g, pts); g.clip();
      barkLines(g, r, -bw, bw, topY, 4, "rgba(30,18,8,0.55)", big ? 60 : 22);
      barkLines(g, r, -bw, bw * 0.2, topY, 4, "rgba(200,170,130,0.25)", big ? 20 : 8);
      g.fillStyle = "rgba(91,139,53,0.45)"; for (let k = 0; k < (big ? 10 : 3); k++) ell(g, -bw * 0.6 + r() * bw * 0.4, -r() * -topY * 0.4, 3 + r() * 6, 5 + r() * 9, "rgba(91,139,53,0.45)");
      if (big) { ell(g, bw * 0.2, topY * 0.35, 7, 10, "#1a0f07"); ell(g, bw * 0.15, topY * 0.35 - 2, 5, 7, "#0d0703"); }
      g.restore();
    }, tw2, -topY + 6);
    const cw = crownW * 1.4, chh = crownH * 1.5;
    const crown = bake(cw, chh, TS, (g) => {
      const cx = cw / 2, cy = chh * 0.48;
      const cols = big ? PAL.leafAncient : PAL.leafOak;
      const lobes = big ? 6 : 4;
      for (let k = 0; k < lobes; k++) {
        const a = (k / lobes) * TAU + r(), d = 0.28 + r() * 0.12;
        paintFoliage(g, cx + Math.cos(a) * crownW * d * 0.9, cy + Math.sin(a) * crownH * d * 0.6 + crownH * 0.05, crownW * (0.3 + r() * 0.08), crownH * (0.3 + r() * 0.08), cols, L, r, { clusters: 6, leaf: big ? 5.2 : 4.6, per: 22 });
      }
      paintFoliage(g, cx, cy, crownW * 0.48, crownH * 0.46, cols, L, r, { clusters: big ? 18 : 12, leaf: big ? 5.4 : 4.8, per: big ? 34 : 28 });
      // visible branch bits through gaps
      g.strokeStyle = shade(B.dark, 1.1); g.lineWidth = 2;
      for (let k = 0; k < 3; k++) { const x = cx + (r() - 0.5) * crownW * 0.5, y = cy + crownH * 0.2 + r() * 10; g.beginPath(); g.moveTo(x, y + 10); g.lineTo(x + (r() - 0.5) * 16, y - 6); g.stroke(); }
    }, cw / 2, chh * 0.48 + crownH * 0.55);
    // apple spots (crown-local, relative to the pivot)
    const apples = [];
    for (let k = 0; k < 3; k++) apples.push([(r() - 0.5) * crownW * 0.7, -crownH * (0.15 + r() * 0.35)]);
    return { trunk, crown, pivotY: topY, pivotX: lean, apples, h: H };
  }
  if (kind === "birch") {
    const H = def.h * T, crownW = def.crown * T * 1.25, crownH = crownW * 1.45;
    const topY = -(H - crownH * 0.6), lean = (r() - 0.5) * 8;
    const trunk = bake(70, -topY + 24, TS, (g) => {
      g.translate(35, -topY + 6);
      const pts = [[3, 7, 0], [-10, 5.4, 0], [topY * 0.5, 4.4, lean * 0.5], [topY, 2.6, lean]];
      trunkShape(g, pts); g.fillStyle = barkFill(g, -6, 6, "#fbf8f0", "#e2ddd0", "#9e968a"); g.fill();
      g.save(); trunkShape(g, pts); g.clip();
      for (let k = 0; k < 26; k++) { const y = topY + r() * (-topY); g.fillStyle = k % 3 ? "rgba(30,26,22,0.8)" : "rgba(60,50,40,0.5)"; g.fillRect(-7 + r() * 6, y, 3 + r() * 6, 1 + r() * 1.6); }
      g.fillStyle = "rgba(40,34,28,0.6)"; g.fillRect(-8, -12, 16, 15);
      g.restore();
      for (let k = 0; k < 3; k++) { const s = k % 2 ? 1 : -1, y = topY * (0.6 + k * 0.12); limb(g, lean * 0.6, y, lean + s * (14 + r() * 14), y - 20 - r() * 14, 2, 0.8, "#cfc8ba"); }
    }, 35, -topY + 6);
    const cw = crownW * 1.5, chh = crownH * 1.3;
    const crown = bake(cw, chh, TS, (g) => {
      const cx = cw / 2, cy = chh * 0.5;
      for (let k = 0; k < 3; k++) paintFoliage(g, cx + (r() - 0.5) * crownW * 0.4, cy - crownH * 0.25 + k * crownH * 0.25, crownW * 0.36, crownH * 0.24, PAL.leafBirch, L, r, { clusters: 7, leaf: 3.8, per: 22 });
      paintFoliage(g, cx, cy, crownW * 0.42, crownH * 0.44, PAL.leafBirch, L, r, { clusters: 10, leaf: 3.9, per: 20 });
    }, cw / 2, chh * 0.5 + crownH * 0.6);
    return { trunk, crown, pivotY: topY, pivotX: lean, apples: [], h: H };
  }
  // pine
  const H = def.h * T, baseW = def.crown * T * 0.62;
  const trunk = bake(40, H + 20, TS, (g) => {
    g.translate(20, H + 6);
    const pts = [[3, 7, 0], [-8, 5.5, 0], [-H * 0.6, 3.5, 0], [-H + 10, 1.2, 0]];
    trunkShape(g, pts); g.fillStyle = barkFill(g, -6, 6, "#9a6a48", "#6e432a", "#3a2216"); g.fill();
    g.save(); trunkShape(g, pts); g.clip(); barkLines(g, r, -6, 6, -H, 3, "rgba(30,14,6,0.55)", 26); g.restore();
  }, 20, H + 6);
  const ch = H - 36, cw = baseW * 2.4;
  const crown = bake(cw, ch + 30, TS, (g) => {
    const cx = cw / 2, by = ch + 20, tiers = 8;
    for (let i = 0; i < tiers; i++) {
      const u = i / (tiers - 1), ty = by - u * ch * 0.92, w = baseW * (1.05 - u * 0.85) * (0.9 + r() * 0.2), th = ch * 0.2 * (1 - u * 0.4);
      // drooping tier
      g.fillStyle = lg(g, cx - w, 0, cx + w, 0, [[0, PAL.leafPine[3]], [0.4, PAL.leafPine[2]], [1, PAL.leafPine[0]]]);
      g.beginPath(); g.moveTo(cx, ty - th);
      g.quadraticCurveTo(cx - w * 0.5, ty - th * 0.5, cx - w, ty + 2);
      for (let k = 0; k <= 8; k++) { const xx = cx - w + (k / 8) * w * 2; g.lineTo(xx, ty + (k % 2 ? 6 + r() * 4 : 1)); }
      g.quadraticCurveTo(cx + w * 0.5, ty - th * 0.5, cx, ty - th); g.closePath(); g.fill();
      // needle strokes
      g.strokeStyle = PAL.leafPine[4]; g.lineWidth = 0.8;
      for (let k = 0; k < 10; k++) { const xx = cx - w * 0.9 + r() * w * 0.9, yy = ty - r() * th * 0.6; g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx - 3, yy + 4); g.stroke(); }
      g.strokeStyle = "rgba(5,20,12,0.5)";
      for (let k = 0; k < 8; k++) { const xx = cx + r() * w * 0.9, yy = ty - r() * th * 0.5; g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + 3, yy + 4); g.stroke(); }
    }
    g.fillStyle = PAL.leafPine[1]; g.beginPath(); g.moveTo(cx, by - ch - 8); g.lineTo(cx - 5, by - ch + 12); g.lineTo(cx + 5, by - ch + 12); g.closePath(); g.fill();
  }, cw / 2, ch + 20);
  return { trunk, crown, pivotY: -26, pivotX: 0, apples: [], h: H };
}
function bakeStump(kind) {
  const big = kind === "ancient", w = big ? 64 : kind === "birch" ? 13 : 20, h = big ? 22 : 13;
  return bake(w * 2 + 30, h + 14, TS, (g) => {
    g.translate(w + 15, h + 8);
    const bark = kind === "birch" ? ["#fbf8f0", "#e2ddd0", "#9e968a"] : kind === "pine" ? ["#9a6a48", "#6e432a", "#3a2216"] : [PAL.bark.light, PAL.bark.base, PAL.bark.dark];
    for (const s of [-1, 1]) limb(g, s * w * 0.3, -h * 0.5, s * (w * 0.75 + 8), 3, w * 0.3, 1.5, bark[1]);
    g.fillStyle = barkFill(g, -w / 2, w / 2, bark[0], bark[1], bark[2]);
    g.beginPath(); g.moveTo(-w / 2 - 2, 2); g.lineTo(-w / 2, -h); g.lineTo(w / 2, -h + 2); g.lineTo(w / 2 + 2, 2); g.closePath(); g.fill();
    ell(g, 0, -h + 1, w / 2, w * 0.16 + 1.5, "#d6ae79");
    g.strokeStyle = "#a77c4b"; g.lineWidth = 0.7;
    for (let k = 1; k < 4; k++) { g.beginPath(); g.ellipse(0, -h + 1, (w / 2) * (k / 4), (w * 0.16 + 1.5) * (k / 4), 0, 0, TAU); g.stroke(); }
    g.fillStyle = "rgba(255,240,200,0.35)"; g.beginPath(); g.ellipse(-w * 0.15, -h, w * 0.18, 1.2, 0, 0, TAU); g.fill();
  }, w + 15, h + 8);
}
function bakeSapling(kind) {
  return bake(40, 40, TS, (g) => {
    g.translate(20, 38);
    g.strokeStyle = kind === "birch" ? "#d8d2c4" : "#6e4a2c"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-2, -12, 1, -24); g.stroke();
    if (kind === "pine") {
      for (let i = 0; i < 4; i++) { const y = -8 - i * 5, w = 9 - i * 2; g.fillStyle = i % 2 ? PAL.leafPine[2] : PAL.leafPine[3]; g.beginPath(); g.moveTo(1, y - 7); g.lineTo(1 - w, y + 1); g.lineTo(1 + w, y + 1); g.closePath(); g.fill(); }
    } else {
      const cols = kind === "birch" ? PAL.leafBirch : PAL.leafOak;
      for (const [x, y, a] of [[-6, -14, -0.6], [6, -18, 0.6], [-4, -24, -0.3], [4, -27, 0.4], [0, -30, 0]]) { ell(g, x, y, 5, 2.6, cols[2], a); ell(g, x - 0.6, y - 0.6, 3.4, 1.4, cols[3], a); }
    }
  }, 20, 38);
}
let appleSpr = null;
function apple() {
  if (!appleSpr) appleSpr = bake(10, 11, 3, (g) => {
    g.fillStyle = "#3a6a22"; g.beginPath(); g.ellipse(6.5, 1.8, 2.2, 1, -0.5, 0, TAU); g.fill();
    g.strokeStyle = "#4a2f1b"; g.lineWidth = 0.8; g.beginPath(); g.moveTo(5, 3); g.lineTo(5.2, 0.6); g.stroke();
    g.fillStyle = lg(g, 1, 3, 9, 11, [[0, "#ff6a4a"], [0.5, "#d6402e"], [1, "#8a1f14"]]); g.beginPath(); g.arc(5, 6.6, 4, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,0.6)"; g.beginPath(); g.ellipse(3.6, 5.2, 1.2, 0.8, -0.6, 0, TAU); g.fill();
  }, 5, 3);
  return appleSpr;
}

// ---------------------------------------------------------------------------------------------- the tree drawer
export function createTrees(fx, FXK) {
  const cache = new Map(), stumps = {}, saplings = {};
  const shakes = new Map();   // tree id -> { t, dir }
  const falling = [];         // { kind, v, x, y, dir, ang, w, t, scale, done }
  const sh = shadowSprite();

  const sprite = (kind, seed) => {
    const v = ((seed >>> 0) % VARIANTS), k = kind + v;
    let s = cache.get(k); if (!s) { s = bakeTree(kind, v); cache.set(k, s); }
    return s;
  };
  function warm(kinds) { for (const k of kinds) for (let v = 0; v < VARIANTS; v++) sprite(k, v); }

  function onHit(tree, px) {
    shakes.set(tree.id, { t: 0.45, dir: px < (tree.x + 0.5) * T ? 1 : -1 });
    const def = TREE_DEFS[tree.kind], s = sprite(tree.kind, tree.seed | 0);
    const cx = (tree.x + 0.5) * T, cy = tree.y * T - 18;
    const side = px < cx ? -1 : 1;
    for (let i = 0; i < 6; i++) fx.emit(FXK.chip, cx + side * 6, cy - Math.random() * 10, side * (60 + Math.random() * 120), -80 - Math.random() * 160, 0.9, 4 + Math.random() * 3, tree.kind === "birch" ? 20 : 0);
    if (tree.stage >= 3 && def) for (let i = 0; i < 3; i++) fx.emit(FXK.leaf, cx + (Math.random() - 0.5) * def.crown * T * 0.8, tree.y * T + s.pivotY - Math.random() * 60, (Math.random() - 0.5) * 30, 10, 2.5, 7, tree.kind === "birch" ? 2 : tree.kind === "pine" ? 4 : 1);
  }
  function onFall(tree, dir) {
    falling.push({ kind: tree.kind, seed: tree.seed | 0, x: (tree.x + 0.5) * T, y: tree.y * T, dir: dir || 1, ang: 0, w: 0, t: 0, scale: tree.stage === 2 ? 0.55 : 1, fruit: 0, hit: false });
    shakes.delete(tree.id);
  }
  function update(dt) {
    for (const [id, s] of shakes) { s.t -= dt; if (s.t <= 0) shakes.delete(id); }
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i]; f.t += dt;
      if (!f.hit) {
        f.w += (2.6 * Math.sin(Math.abs(f.ang) + 0.06) + 0.25) * dt * 2.2;
        f.ang += f.w * dt * f.dir;
        if (Math.abs(f.ang) >= 1.48) {
          f.ang = 1.48 * f.dir; f.hit = true; f.t = 0;
          const s = sprite(f.kind, f.seed), len = (s.h || 200) * f.scale;
          for (let k = 0; k < 14; k++) { const d = (0.25 + Math.random() * 0.75) * len; fx.emit(FXK.dust, f.x + f.dir * d, f.y - 6, (Math.random() - 0.5) * 60, -20 - Math.random() * 40, 1.2, 26 + Math.random() * 22, 2); }
          for (let k = 0; k < 18; k++) { const d = (0.5 + Math.random() * 0.5) * len; fx.emit(FXK.leaf, f.x + f.dir * d, f.y - 20 - Math.random() * 40, (Math.random() - 0.5) * 140, -60 - Math.random() * 120, 2.4, 8, f.kind === "birch" ? 2 : f.kind === "pine" ? 4 : (Math.random() * 3) | 0); }
        }
      } else if (f.t > 0.9) falling.splice(i, 1);
    }
  }

  // draw every tree in columns [x0, x1] (world transform). t = seconds (wind).
  function draw(ctx, trees, x0, x1, t) {
    for (const tr of trees) {
      if (tr.x < x0 - 6 || tr.x > x1 + 6) continue;
      const bx = (tr.x + 0.5) * T, by = tr.y * T;
      if (tr.stage === 0) { const k = tr.kind; const s = stumps[k] || (stumps[k] = bakeStump(k)); blit(ctx, s, bx, by + 2); continue; }
      if (tr.stage === 1) {
        const k = tr.kind; const s = saplings[k] || (saplings[k] = bakeSapling(k));
        ctx.save(); ctx.translate(bx, by + 1); ctx.rotate(Math.sin(t * 1.7 + tr.x) * 0.06); blit(ctx, s, 0, 0); ctx.restore(); continue;
      }
      const s = sprite(tr.kind, tr.seed | 0), sc = tr.stage === 2 ? 0.55 : 1;
      const shk = shakes.get(tr.id);
      const sw = Math.sin(t * 1.1 + tr.x * 0.7) * 0.018 + Math.sin(t * 2.3 + tr.x) * 0.006 + (shk ? Math.sin(shk.t * 40) * shk.t * 0.12 * shk.dir : 0);
      const ox = shk ? Math.sin(shk.t * 55) * shk.t * 3 : 0;
      ctx.drawImage(sh, bx - 40 * sc - (tr.kind === "ancient" ? 30 : 0), by - 8, (80 + (tr.kind === "ancient" ? 60 : 0)) * sc, 16);
      ctx.save(); ctx.translate(bx + ox, by + 2);
      if (sc !== 1) ctx.scale(sc, sc);
      blit(ctx, s.trunk, 0, 0);
      ctx.translate(s.pivotX, s.pivotY); ctx.rotate(sw);
      blit(ctx, s.crown, 0, 0);
      if (tr.fruit && s.apples.length && tr.stage >= 3) { const ap = apple(); for (let i = 0; i < Math.min(tr.fruit, s.apples.length); i++) blit(ctx, ap, s.apples[i][0], s.apples[i][1]); }
      ctx.restore();
    }
    // falling trees
    for (const f of falling) {
      const s = sprite(f.kind, f.seed);
      ctx.save();
      ctx.globalAlpha = f.hit ? Math.max(0, 1 - f.t / 0.9) : 1;
      ctx.translate(f.x, f.y - 4 + (f.hit ? Math.sin(Math.min(1, f.t * 5) * Math.PI) * -4 : 0)); ctx.rotate(f.ang);
      if (f.scale !== 1) ctx.scale(f.scale, f.scale);
      ctx.save(); ctx.beginPath(); ctx.rect(-200, -2000, 400, 2000 - 12); ctx.clip(); blit(ctx, s.trunk, 0, 6); ctx.restore();
      ctx.translate(s.pivotX, s.pivotY); blit(ctx, s.crown, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  return { draw, update, onHit, onFall, warm, sprite, get falling() { return falling; } };
}
