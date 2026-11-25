// render/house.js - the house on the plot in all 20 levels + the empty plot (BONUS_RENDER). DOM (bake time).
// Each level is painted once into an offscreen canvas from a small library of architectural painters (round-log,
// plank, fieldstone, whitewash, brick and timber-frame walls; leaf, hide, sod, shingle, thatch, clay-tile and slate
// roofs; windows, doors, chimneys, porches, towers, battlements, banners...). Painting also records the live bits
// the renderer animates each frame: chimney smoke, fires, lit windows, lamps, banners, garden beds, crystal glints.
// Coordinates while painting: plot-local world px, x = 0 at the plot's left edge, y = 0 at the ground, up = negative.
import { T, PLOT_W } from "../core/const.js";
import { HOUSE_LEVELS, houseLevel } from "../data/house.js";
import { paintFoliage } from "../../render/art.js";
import { makeCanvas, rng, mix, shade, lg, rg, ell, poly, rrect, TAU, PAL } from "./kit.js";

const HS = 1.25;               // bake scale (canvas px per world px)
const MX = 2 * T;              // horizontal margin around the plot
const PW = PLOT_W * T;         // plot width px (768)
const LIT = { x: -0.5, y: -0.86 };

// ------------------------------------------------------------------------------------------------ materials
function logWall(g, x, y, w, h, r, M, ends = true) { // y = bottom
  const lh = 11, n = Math.ceil(h / lh);
  for (let i = 0; i < n; i++) {
    const by = y - (i + 1) * lh, tone = 0.9 + r() * 0.2;
    g.fillStyle = lg(g, 0, by, 0, by + lh, [[0, shade("#9a7048", tone * 1.15)], [0.45, shade("#7a5534", tone)], [1, shade("#3e2816", tone)]]);
    g.beginPath(); rrect(g, x - (ends ? 5 : 0), by + 0.5, w + (ends ? 10 : 0), lh - 0.5, 5); g.fill();
    g.strokeStyle = "rgba(40,22,10,0.45)"; g.lineWidth = 0.7;
    for (let k = 0; k < w / 26; k++) { const sx = x + r() * w; g.beginPath(); g.moveTo(sx, by + 3 + r() * 2); g.lineTo(sx + 8 + r() * 14, by + 3 + r() * 4); g.stroke(); }
    if (ends) for (const ex of [x - 5, x + w + 5]) { ell(g, ex, by + lh / 2 + 0.3, 3.4, lh / 2 - 0.3, "#c9a272"); g.strokeStyle = "#9a7448"; g.lineWidth = 0.5; g.beginPath(); g.ellipse(ex, by + lh / 2, 1.8, 2.8, 0, 0, TAU); g.stroke(); }
    g.fillStyle = "rgba(20,10,4,0.35)"; g.fillRect(x, by + lh - 1.4, w, 1.4);
  }
  if (M) M.wallTop = y - n * lh;
}
function plankWall(g, x, y, w, h, r, col = "#9a6b3f") {
  for (let px = x; px < x + w; px += 8) {
    const tone = 0.85 + r() * 0.25, bw = Math.min(8, x + w - px);
    g.fillStyle = lg(g, px, 0, px + bw, 0, [[0, shade(col, tone * 1.12)], [1, shade(col, tone * 0.85)]]); g.fillRect(px, y - h, bw, h);
    g.fillStyle = "rgba(30,16,6,0.55)"; g.fillRect(px + bw - 0.8, y - h, 0.8, h);
    g.strokeStyle = "rgba(60,35,15,0.3)"; g.lineWidth = 0.5; g.beginPath(); g.moveTo(px + 3 + r() * 2, y - h); g.lineTo(px + 3 + r() * 2, y); g.stroke();
  }
}
function stoneWall(g, x, y, w, h, r, opt = {}) {
  const mortar = opt.mortar || "#8a8478", base = opt.color || "#a7a399";
  g.fillStyle = mortar; g.fillRect(x, y - h, w, h);
  let yy = y;
  while (yy > y - h + 1) {
    const rh = 8 + r() * 5; let xx = x - r() * 8;
    while (xx < x + w) {
      const sw = 10 + r() * 14, tone = 0.8 + r() * 0.35;
      const sx = Math.max(x, xx + 0.8), ex = Math.min(x + w, xx + sw - 0.8);
      if (ex > sx + 1) {
        g.fillStyle = lg(g, 0, yy - rh, 0, yy, [[0, shade(base, tone * 1.18)], [1, shade(base, tone * 0.78)]]);
        g.beginPath(); rrect(g, sx, Math.max(y - h, yy - rh + 0.8), ex - sx, Math.min(rh - 1.6, yy - (y - h)), 3); g.fill();
        if (r() < 0.25) ell(g, sx + (ex - sx) * 0.4, yy - rh * 0.6, (ex - sx) * 0.25, 1.2, "rgba(255,255,255,0.25)");
        if (opt.moss && r() < 0.2) ell(g, sx + (ex - sx) * 0.5, yy - rh * 0.8, (ex - sx) * 0.3, 1.6, "rgba(90,130,50,0.6)");
      }
      xx += sw;
    }
    yy -= rh;
  }
}
function brickWall(g, x, y, w, h, r, col = "#b5553a") {
  g.fillStyle = "#cfc4b2"; g.fillRect(x, y - h, w, h);
  let row = 0;
  for (let yy = y; yy > y - h; yy -= 6, row++) {
    for (let xx = x - (row % 2 ? 7 : 0); xx < x + w; xx += 14) {
      const sx = Math.max(x, xx + 0.6), ex = Math.min(x + w, xx + 13.4), tone = 0.82 + r() * 0.3;
      if (ex <= sx) continue;
      g.fillStyle = shade(col, tone); g.fillRect(sx, Math.max(y - h, yy - 5.4), ex - sx, Math.min(4.8, yy - (y - h)));
      g.fillStyle = "rgba(255,220,200,0.12)"; g.fillRect(sx, yy - 5.4, ex - sx, 1);
    }
  }
  g.fillStyle = lg(g, 0, y - h, 0, y, [[0, "rgba(255,240,220,0.06)"], [1, "rgba(40,10,0,0.12)"]]); g.fillRect(x, y - h, w, h);
}
function plaster(g, x, y, w, h, r, col = "#efe9dc") {
  g.fillStyle = col; g.fillRect(x, y - h, w, h);
  for (let i = 0; i < w * h / 300; i++) ell(g, x + r() * w, y - r() * h, 3 + r() * 10, 2 + r() * 6, r() < 0.5 ? "rgba(120,100,80,0.06)" : "rgba(255,255,255,0.12)");
  g.fillStyle = lg(g, 0, y - 16, 0, y, [[0, "rgba(90,70,50,0)"], [1, "rgba(90,70,50,0.25)"]]); g.fillRect(x, y - 16, w, 16);
}
function timber(g, x, y, w, h, r, opt = {}) { // dark beams over a wall
  const c = opt.col || "#3b2818", bw = opt.bw || 5;
  g.fillStyle = c;
  g.fillRect(x, y - h, w, bw); g.fillRect(x, y - bw, w, bw);
  if (opt.mid) g.fillRect(x, y - h / 2 - bw / 2, w, bw);
  const n = Math.max(2, Math.round(w / (opt.span || 40)));
  for (let i = 0; i <= n; i++) g.fillRect(x + (w - bw) * (i / n), y - h, bw, h);
  if (opt.braces !== false) {
    g.strokeStyle = c; g.lineWidth = bw * 0.9; g.lineCap = "butt";
    for (let i = 0; i < n; i++) {
      if ((i + (opt.flip ? 1 : 0)) % 2) continue;
      const ax = x + (w - bw) * (i / n) + bw / 2, bx = x + (w - bw) * ((i + 1) / n) + bw / 2, top = opt.mid ? y - h / 2 : y - h;
      g.beginPath(); g.moveTo(ax, y - bw); g.lineTo(bx, top + bw); g.stroke();
    }
    g.lineCap = "round";
  }
  g.fillStyle = "rgba(255,230,190,0.12)"; g.fillRect(x, y - h, w, 1.2);
}
// ------------------------------------------------------------------------------------------------ roofs
function roofPath(g, x0, x1, yE, yR, ov, hip = 0) {
  g.beginPath(); g.moveTo(x0 - ov, yE); g.lineTo((x0 + x1) / 2 - hip, yR); g.lineTo((x0 + x1) / 2 + hip, yR); g.lineTo(x1 + ov, yE); g.closePath();
}
function roof(g, x0, x1, yE, yR, mat, r, opt = {}) {
  const ov = opt.ov == null ? 10 : opt.ov, hip = opt.hip || 0;
  g.save(); roofPath(g, x0, x1, yE, yR, ov, hip); g.clip();
  const W = x1 - x0 + ov * 2, L = x0 - ov;
  if (mat === "shingle" || mat === "slate" || mat === "tile") {
    const base = mat === "shingle" ? "#7a5a3a" : mat === "slate" ? "#4a5a72" : "#b0523a";
    g.fillStyle = shade(base, 0.6); g.fillRect(L, yR, W, yE - yR + 2);
    const rh = mat === "tile" ? 7 : 6, tw = mat === "slate" ? 9 : mat === "tile" ? 8 : 10;
    let row = 0;
    for (let yy = yR - 2; yy < yE + 2; yy += rh, row++) {
      for (let xx = L - (row % 2 ? tw / 2 : 0); xx < L + W; xx += tw) {
        const tone = 0.82 + r() * 0.3;
        if (mat === "tile") {
          g.fillStyle = lg(g, xx, 0, xx + tw, 0, [[0, shade(base, tone * 1.2)], [0.5, shade(base, tone)], [1, shade(base, tone * 0.65)]]);
          g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, yy + rh); g.arc(xx + tw / 2, yy + rh, tw / 2, Math.PI, 0, true); g.lineTo(xx + tw, yy); g.closePath(); g.fill();
        } else {
          g.fillStyle = shade(base, tone); g.fillRect(xx + 0.5, yy, tw - 1, rh + 1.5);
          g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(xx + 0.5, yy + rh, tw - 1, 1.5);
          g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(xx + 0.5, yy, tw - 1, 1);
        }
      }
    }
  } else if (mat === "thatch") {
    g.fillStyle = "#a8843e"; g.fillRect(L, yR, W, yE - yR + 2);
    const cx = (x0 + x1) / 2;
    for (let i = 0; i < W * (yE - yR) / 14; i++) {
      const xx = L + r() * W, yy = yR + r() * (yE - yR + 4), s = xx < cx ? -1 : 1;
      g.strokeStyle = r() < 0.3 ? "#e2c27a" : r() < 0.6 ? "#c49a4e" : "#7e5e2a"; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + s * 3, yy + 7); g.stroke();
    }
    for (let yy = yR + 14; yy < yE; yy += 16) { g.fillStyle = "rgba(60,40,10,0.25)"; g.fillRect(L, yy, W, 2); }
  } else if (mat === "sod") {
    g.fillStyle = "#6b4a2f"; g.fillRect(L, yR, W, yE - yR + 2);
    g.fillStyle = lg(g, 0, yR, 0, yE, [[0, "#79b047"], [1, "#3f7a24"]]); roofPath(g, x0, x1, yE - 4, yR - 2, ov - 2, hip); g.fill();
  } else if (mat === "leaf") {
    g.fillStyle = "#3a5a22"; g.fillRect(L, yR, W, yE - yR + 2);
  } else if (mat === "hide") {
    g.fillStyle = lg(g, L, 0, L + W, 0, [[0, "#d2a878"], [0.5, "#b88a5a"], [1, "#8a6038"]]); g.fillRect(L, yR, W, yE - yR + 2);
  }
  // lit left slope, shaded right slope
  const cx = (x0 + x1) / 2;
  g.fillStyle = "rgba(255,240,210,0.12)"; g.beginPath(); g.moveTo(x0 - ov, yE); g.lineTo(cx - hip, yR); g.lineTo(cx - hip, yE); g.closePath(); g.fill();
  g.fillStyle = "rgba(10,5,0,0.18)"; g.beginPath(); g.moveTo(cx + hip, yR); g.lineTo(x1 + ov, yE); g.lineTo(cx + hip, yE); g.closePath(); g.fill();
  g.restore();
  // trims
  if (mat === "thatch") { g.fillStyle = "#8a6a2e"; g.beginPath(); g.ellipse(cx, yR + 2, (hip || 0) + 10, 5, 0, 0, TAU); g.fill(); }
  if (mat === "sod") { // grass tufts + flowers on top
    for (let xx = x0 - ov + 3; xx < x1 + ov - 3; xx += 4) {
      const t = (xx - (x0 - ov)) / (x1 - x0 + ov * 2), yy = t < 0.5 ? yE + (yR - yE) * (t * 2) : yR + (yE - yR) * ((t - 0.5) * 2);
      g.strokeStyle = r() < 0.5 ? "#8cc455" : "#5a9a34"; g.lineWidth = 1.1; g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + (r() - 0.5) * 3, yy - 4 - r() * 4); g.stroke();
      if (r() < 0.08) ell(g, xx, yy - 6, 1.6, 1.6, ["#ffd84a", "#f4f1ea", "#d96aa6"][(r() * 3) | 0]);
    }
  }
  if (mat !== "leaf" && mat !== "hide" && !opt.noTrim) {
    g.strokeStyle = opt.trim || "#3b2818"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x0 - ov, yE); g.lineTo(cx - hip, yR); g.lineTo(cx + hip, yR); g.lineTo(x1 + ov, yE); g.stroke();
  }
  g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(x0 - ov + 6, yE, x1 - x0 + ov * 2 - 12, 4); // eave shadow
}
// ------------------------------------------------------------------------------------------------ openings
function windowShape(g, x, y, w, h, arch) { g.beginPath(); if (arch) { g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); } else g.rect(x, y, w, h); }
function windowPane(g, x, y, w, h, M, style = "plain", opt = {}) { // x,y = top-left
  const arch = style === "arch" || style === "tall" || opt.arch;
  const frame = opt.frame || (style === "tall" ? "#f4efe4" : "#5a3b22");
  g.fillStyle = frame; windowShape(g, x - 3, y - 3, w + 6, h + 6, arch); g.fill();
  g.fillStyle = lg(g, x, y, x + w, y + h, [[0, "#3c5a72"], [0.5, "#24384c"], [1, "#15222e"]]); windowShape(g, x, y, w, h, arch); g.fill();
  g.save(); windowShape(g, x, y, w, h, arch); g.clip();
  g.fillStyle = "rgba(255,255,255,0.18)"; g.beginPath(); g.moveTo(x, y + h * 0.6); g.lineTo(x + w * 0.6, y); g.lineTo(x + w * 0.8, y); g.lineTo(x, y + h * 0.85); g.closePath(); g.fill();
  if (style === "leaded") { g.strokeStyle = "rgba(40,40,44,0.85)"; g.lineWidth = 0.8; for (let k = -h; k < w + h; k += 6) { g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k + h, y + h); g.moveTo(x + k, y + h); g.lineTo(x + k + h, y); g.stroke(); } }
  g.restore();
  g.fillStyle = frame;
  if (style !== "slit") { g.fillRect(x + w / 2 - 1.2, y, 2.4, h); g.fillRect(x, y + h * (arch ? 0.55 : 0.5) - 1.2, w, 2.4); }
  g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(x - 3, y + h + 3, w + 6, 2);
  if (style === "shutter") {
    for (const s of [-1, 1]) { const sx = s < 0 ? x - 3 - w / 2 : x + w + 3; plankWall(g, sx, y + h + 2, w / 2, h + 4, rng(x + s), opt.shut || "#4a6a3a"); g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(sx + 2, y + h / 2 - 1, w / 2 - 4, 2); }
  }
  if (style === "tall" || opt.sill) { g.fillStyle = "#f4efe4"; g.fillRect(x - 6, y + h + 3, w + 12, 4); g.fillStyle = "rgba(0,0,0,0.2)"; g.fillRect(x - 6, y + h + 7, w + 12, 2); }
  if (M) M.windows.push({ x, y, w, h, arch, warm: opt.warm || "#ffcf7a", crystal: !!opt.crystal });
}
function flowerBox(g, x, y, w, r) {
  g.fillStyle = "#6a4426"; g.fillRect(x, y, w, 6); g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(x, y + 6, w, 2);
  for (let i = 0; i < w / 3; i++) { const fx = x + 2 + r() * (w - 4); ell(g, fx, y - 1 - r() * 3, 2.6, 2, "#3f7a24"); }
  for (let i = 0; i < w / 5; i++) ell(g, x + 2 + r() * (w - 4), y - 3 - r() * 4, 1.6, 1.6, ["#ff6a5a", "#ffd84a", "#d96aa6", "#f4f1ea"][(r() * 4) | 0]);
}
function door(g, x, y, w, h, M, style = "plank", col = "#6a4426") { // x = center, y = bottom
  const L = x - w / 2, arch = style !== "plank" && style !== "flap";
  g.fillStyle = "#2a1a10"; windowShape(g, L - 3, y - h - 3, w + 6, h + 3, arch); g.fill();
  if (style === "open") { g.fillStyle = "#120a06"; windowShape(g, L, y - h, w, h, arch); g.fill(); return; }
  g.save(); windowShape(g, L, y - h, w, h, arch); g.clip();
  plankWall(g, L, y, w, h, rng(x * 3 + h), col);
  if (style === "iron" || style === "double") { g.fillStyle = "#2e2e32"; for (const yy of [y - h * 0.25, y - h * 0.7]) g.fillRect(L, yy, w, 3); g.fillStyle = "#8a8a90"; for (let i = 0; i < 6; i++) ell(g, L + 3 + i * (w - 6) / 5, y - h * 0.25 + 1.5, 0.9, 0.9, "#9a9aa0"); }
  if (style === "double") { g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(x - 0.8, y - h, 1.6, h); }
  if (style === "painted") { g.strokeStyle = "rgba(255,255,255,0.25)"; g.lineWidth = 1.2; g.strokeRect(L + 3, y - h + (arch ? w / 2 : 3), w - 6, h * 0.35); g.strokeRect(L + 3, y - h * 0.5, w - 6, h * 0.42); }
  g.restore();
  ell(g, x + w * 0.3, y - h * 0.45, 1.6, 1.6, style === "painted" ? "#e8c050" : "#2e2e32");
  if (M) M.door = { x, y, w, h };
}
function chimney(g, x, yTop, w, h, r, M, col) {
  stoneWall(g, x, yTop + h, w, h, r, { color: col || "#a39d90", mortar: "#7a746a" });
  g.fillStyle = "#5a554e"; g.fillRect(x - 2, yTop - 3, w + 4, 5);
  g.fillStyle = "#1a1612"; g.fillRect(x + 2, yTop - 3, w - 4, 2);
  if (M) M.chimneys.push({ x: x + w / 2, y: yTop - 4 });
}
function steps(g, x, y, w, n, r) { for (let i = 0; i < n; i++) stoneWall(g, x - w / 2 + i * 3, y - i * 5, w - i * 6, 5, r, { color: "#b0aa9c" }); }
function post(g, x, y, h, col = "#5a3b22", w = 5) { g.fillStyle = lg(g, x - w / 2, 0, x + w / 2, 0, [[0, shade(col, 1.3)], [1, shade(col, 0.7)]]); g.fillRect(x - w / 2, y - h, w, h); }
function fence(g, x0, x1, y, h, r) {
  for (let x = x0; x <= x1; x += 12) post(g, x, y, h, "#8a6440", 3.5);
  g.fillStyle = "#9a7450"; g.fillRect(x0 - 2, y - h * 0.75, x1 - x0 + 4, 2.6); g.fillRect(x0 - 2, y - h * 0.35, x1 - x0 + 4, 2.6);
}
function gardenBeds(g, x0, n, y, r, M, bw = 26) {
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (bw + 6);
    g.fillStyle = "#6a4426"; g.fillRect(x, y - 8, bw, 8);
    g.fillStyle = lg(g, 0, y - 10, 0, y - 4, [[0, "#5a3a22"], [1, "#3a2414"]]); g.fillRect(x + 2, y - 10, bw - 4, 4);
    for (let k = 0; k < 4; k++) { ell(g, x + 5 + k * 6, y - 11, 2.2, 1.2, "#4f8a2e"); }
    if (M) M.garden.push({ x, y: y - 10, w: bw });
  }
}
function barrel(g, x, y) {
  g.fillStyle = lg(g, x - 8, 0, x + 8, 0, [[0, "#a77b4f"], [0.5, "#7a5532"], [1, "#4a2f1b"]]); g.beginPath(); g.moveTo(x - 7, y); g.quadraticCurveTo(x - 9.5, y - 10, x - 7, y - 20); g.lineTo(x + 7, y - 20); g.quadraticCurveTo(x + 9.5, y - 10, x + 7, y); g.closePath(); g.fill();
  g.fillStyle = "#3a3a3e"; g.fillRect(x - 8.4, y - 5, 16.8, 1.8); g.fillRect(x - 8.4, y - 16, 16.8, 1.8);
  ell(g, x, y - 20, 7, 2, "#3a6a8a"); ell(g, x - 2, y - 20.5, 3, 0.7, "rgba(255,255,255,0.5)");
}
function scarecrow(g, x, y) {
  post(g, x, y, 46, "#7a5532", 3); g.fillStyle = "#7a5532"; g.fillRect(x - 16, y - 36, 32, 3);
  g.fillStyle = "#4a6a8a"; poly(g, [x - 9, y - 38, x + 9, y - 38, x + 11, y - 20, x - 11, y - 20], "#4a6a8a");
  g.strokeStyle = "#d8b860"; g.lineWidth = 1; for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x + s * 16, y - 35); g.lineTo(x + s * (18 + k), y - 30 + k * 2); g.stroke(); }
  ell(g, x, y - 44, 6, 6, "#e8d8a8"); ell(g, x - 2, y - 45, 1, 1, "#222"); ell(g, x + 2, y - 45, 1, 1, "#222");
  poly(g, [x - 10, y - 48, x + 10, y - 48, x + 4, y - 56, x - 4, y - 56], "#8a6a3a");
}
function banner(g, x, y, w, h, col, M, emblem) { // x,y = top-left of the pole bracket
  g.fillStyle = "#3a3a3e"; g.fillRect(x - 2, y - 2, w + 4, 3);
  if (M) M.banners.push({ x, y, w, h, col, emblem });
}
function torchBracket(g, x, y, M) { g.fillStyle = "#2e2e32"; g.fillRect(x - 1.5, y, 3, 10); g.fillRect(x - 4, y + 8, 8, 2); g.fillStyle = "#3a2a1a"; g.fillRect(x - 2.5, y - 4, 5, 5); if (M) M.fires.push({ x, y: y - 3, s: 0.55, torch: true }); }
function lamp(g, x, y, M, crystal) {
  g.fillStyle = "#2e2e32"; g.fillRect(x - 6, y - 2, 6, 2); g.fillRect(x - 5, y, 10, 2); g.fillRect(x - 4, y + 13, 8, 2);
  g.fillStyle = crystal ? "#7fd8f0" : "#e8c070"; g.fillRect(x - 3.5, y + 2, 7, 11); g.strokeStyle = "#2e2e32"; g.lineWidth = 1; g.strokeRect(x - 3.5, y + 2, 7, 11);
  if (M) M.lamps.push({ x, y: y + 7, crystal: !!crystal });
}
function battlements(g, x, y, w, r, col) { // y = top of wall
  const m = 12, n = Math.floor(w / m);
  for (let i = 0; i < n; i++) if (i % 2 === 0) stoneWall(g, x + i * m, y, m, 10, r, { color: col || "#b4afa2" });
  g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x, y, w, 2);
}
function roundTower(g, cx, y, w, h, r, col, M, cone, coneH, slit = true) {
  const x = cx - w / 2;
  stoneWall(g, x, y, w, h, r, { color: col || "#aea898" });
  g.fillStyle = lg(g, x, 0, x + w, 0, [[0, "rgba(255,245,225,0.25)"], [0.35, "rgba(255,245,225,0)"], [0.75, "rgba(0,0,0,0.1)"], [1, "rgba(0,0,0,0.4)"]]); g.fillRect(x, y - h, w, h);
  if (slit) for (let k = 1; k < h / 50; k++) { g.fillStyle = "#15100c"; g.fillRect(cx - 2, y - k * 50 - 10, 4, 16); g.fillStyle = "rgba(255,255,255,0.15)"; g.fillRect(cx - 3.5, y - k * 50 + 6, 7, 1.5); }
  if (cone) {
    const yb = y - h;
    g.fillStyle = lg(g, x - 6, 0, x + w + 6, 0, [[0, shade(cone, 1.3)], [0.4, cone], [1, shade(cone, 0.55)]]);
    g.beginPath(); g.moveTo(x - 7, yb + 2); g.quadraticCurveTo(cx - w * 0.2, yb - coneH * 0.5, cx, yb - coneH); g.quadraticCurveTo(cx + w * 0.2, yb - coneH * 0.5, x + w + 7, yb + 2); g.closePath(); g.fill();
    g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 0.8; for (let k = 1; k < 6; k++) { const t = k / 6, yy = yb + 2 - coneH * t * 0.95, hw = (w / 2 + 7) * (1 - t) * 1.05; g.beginPath(); g.moveTo(cx - hw, yy); g.quadraticCurveTo(cx, yy + 3, cx + hw, yy); g.stroke(); }
    g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(x - 4, yb + 2, w + 8, 3);
  } else battlements(g, x - 3, y - h, w + 6, r);
}
function finial(g, x, y, col = "#e8c050") { g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 14); g.stroke(); ell(g, x, y - 15, 2.6, 2.6, col); ell(g, x - 0.8, y - 15.8, 0.9, 0.9, "rgba(255,255,255,0.8)"); }
function bushHedge(g, x, w, y, r) { paintFoliage(g, x + w / 2, y - 9, w / 2, 10, PAL.leafOak, LIT, r, { clusters: Math.max(3, w / 14), leaf: 3, per: 14 }); }
function trophies(g, x, y, n) { for (let i = 0; i < n; i++) { g.fillStyle = "#f4ead8"; g.beginPath(); g.moveTo(x + i * 7, y); g.quadraticCurveTo(x + i * 7 + 3, y + 5, x + i * 7 + 1.5, y + 11); g.quadraticCurveTo(x + i * 7, y + 5, x + i * 7, y); g.fill(); } g.strokeStyle = "#8a6440"; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 2, y); g.lineTo(x + n * 7, y); g.stroke(); }
function workbenchProp(g, x, y) { g.fillStyle = "#5a3b22"; g.fillRect(x, y - 14, 4, 14); g.fillRect(x + 30, y - 14, 4, 14); g.fillStyle = lg(g, 0, y - 18, 0, y - 13, [[0, "#d2a46a"], [1, "#9a6b3f"]]); g.fillRect(x - 2, y - 18, 38, 5); g.fillStyle = "#c9ccd2"; g.beginPath(); g.moveTo(x + 4, y - 18); g.lineTo(x + 16, y - 21); g.lineTo(x + 16, y - 19); g.closePath(); g.fill(); }
function anvilProp(g, x, y) { g.fillStyle = "#6a4426"; g.fillRect(x - 6, y - 10, 12, 10); g.fillStyle = "#3a3e46"; g.beginPath(); g.moveTo(x - 12, y - 17); g.quadraticCurveTo(x - 9, y - 12, x - 4, y - 12); g.lineTo(x + 7, y - 12); g.lineTo(x + 10, y - 17); g.closePath(); g.fill(); g.fillRect(x - 3, y - 12, 6, 2); g.fillStyle = "rgba(255,255,255,0.4)"; g.fillRect(x - 10, y - 17, 19, 1); }
function furnaceProp(g, x, y, r, M) {
  stoneWall(g, x, y, 34, 30, r, { color: "#9a958a" }); g.fillStyle = "#9a958a"; g.beginPath(); g.ellipse(x + 17, y - 30, 17, 8, 0, Math.PI, TAU); g.fill();
  g.fillStyle = "#16100c"; g.beginPath(); g.moveTo(x + 9, y); g.lineTo(x + 9, y - 12); g.quadraticCurveTo(x + 17, y - 20, x + 25, y - 12); g.lineTo(x + 25, y); g.closePath(); g.fill();
  chimney(g, x + 22, y - 54, 8, 20, r, M, "#8a857a");
  if (M) M.fires.push({ x: x + 17, y: y - 2, s: 0.65, oven: true });
}
function toolRack(g, x, y) {
  g.fillStyle = "#6a4426"; g.fillRect(x, y, 56, 4);
  const tools = [["#c9ccd2", "axe"], ["#9a958a", "saw"], ["#c9ccd2", "pick"], ["#7fa6c9", "axe"], ["#c9ccd2", "saw"]];
  tools.forEach(([c, k], i) => {
    const tx = x + 6 + i * 11;
    g.fillStyle = "#7a5532"; g.fillRect(tx - 1, y + 4, 2, 18);
    g.fillStyle = c;
    if (k === "axe") { g.beginPath(); g.moveTo(tx + 1, y + 6); g.quadraticCurveTo(tx + 7, y + 5, tx + 7, y + 12); g.lineTo(tx + 1, y + 10); g.closePath(); g.fill(); }
    else if (k === "saw") { g.fillRect(tx - 1, y + 6, 6, 16); }
    else { g.beginPath(); g.moveTo(tx - 6, y + 9); g.quadraticCurveTo(tx, y + 4, tx + 6, y + 9); g.lineTo(tx, y + 7); g.closePath(); g.fill(); }
  });
}
function grindstone(g, x, y) { g.fillStyle = "#6a4426"; g.fillRect(x - 10, y - 10, 3, 10); g.fillRect(x + 7, y - 10, 3, 10); ell(g, x, y - 16, 11, 11, "#9a958a"); ell(g, x, y - 16, 8, 8, "#b4afa2"); ell(g, x, y - 16, 2, 2, "#3a3a3e"); g.strokeStyle = "#3a3a3e"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y - 16); g.lineTo(x + 14, y - 20); g.stroke(); }
function sawhorse(g, x, y) { g.strokeStyle = "#7a5532"; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x, y - 14); g.lineTo(x + 8, y); g.moveTo(x + 22, y); g.lineTo(x + 30, y - 14); g.lineTo(x + 38, y); g.stroke(); g.fillStyle = "#c99a5c"; g.fillRect(x - 6, y - 18, 46, 4); }
function campfireRing(g, x, y, r, M) {
  for (let i = 0; i < 8; i++) { const a = Math.PI + (i / 7) * Math.PI, sx = x + Math.cos(a) * 14, sy = y - 3 + Math.sin(a) * -2; ell(g, sx, sy, 4.2, 3.4, mix("#8d8c88", "#b5b2a6", r())); }
  for (const [dx, a] of [[-5, 0.4], [5, -0.4]]) { g.save(); g.translate(x + dx, y - 5); g.rotate(a); g.fillStyle = "#5a3b22"; g.fillRect(-8, -2.5, 16, 5); g.restore(); }
  if (M) M.fires.push({ x, y: y - 6, s: 1 });
}
function logBench(g, x, y) { g.fillStyle = lg(g, 0, y - 10, 0, y, [[0, "#9a7048"], [1, "#4a2f1b"]]); g.beginPath(); rrect(g, x, y - 10, 34, 8, 4); g.fill(); ell(g, x + 34, y - 6, 2.5, 4, "#c9a272"); g.fillStyle = "#4a2f1b"; g.fillRect(x + 4, y - 3, 4, 3); g.fillRect(x + 26, y - 3, 4, 3); }
function dryingRack(g, x, y) { post(g, x, y, 36, "#7a5532", 3); post(g, x + 30, y, 36, "#7a5532", 3); g.fillStyle = "#7a5532"; g.fillRect(x - 2, y - 36, 34, 3); g.fillStyle = "#b88a5a"; poly(g, [x + 4, y - 33, x + 14, y - 33, x + 15, y - 14, x + 3, y - 16], "#b88a5a"); poly(g, [x + 17, y - 33, x + 26, y - 33, x + 27, y - 18, x + 16, y - 19], "#a0764e"); }
function tent(g, cx, y, w, h, r, M) {
  const L = cx - w / 2;
  // guy lines + pegs
  g.strokeStyle = "#c8a86a"; g.lineWidth = 0.9; g.beginPath(); g.moveTo(cx, y - h - 4); g.lineTo(L - 18, y); g.moveTo(cx, y - h - 4); g.lineTo(L + w + 18, y); g.stroke();
  g.fillStyle = "#6a4426"; g.fillRect(L - 20, y - 4, 3, 5); g.fillRect(L + w + 17, y - 4, 3, 5);
  g.fillStyle = lg(g, L, 0, L + w, 0, [[0, "#e0b88a"], [0.5, "#c49a68"], [1, "#8a6440"]]);
  g.beginPath(); g.moveTo(L, y); g.lineTo(cx, y - h); g.lineTo(L + w, y); g.closePath(); g.fill();
  g.strokeStyle = "rgba(90,60,30,0.6)"; g.lineWidth = 0.8; g.setLineDash([2, 2]);
  for (const t of [0.33, 0.66]) { g.beginPath(); g.moveTo(cx, y - h); g.lineTo(L + w * t, y); g.stroke(); }
  g.beginPath(); g.moveTo(L + w * 0.18, y - h * 0.36); g.lineTo(L + w * 0.82, y - h * 0.36); g.stroke(); g.setLineDash([]);
  // open flap + interior + bedroll
  g.fillStyle = "#1e140c"; g.beginPath(); g.moveTo(cx - w * 0.16, y); g.lineTo(cx, y - h * 0.62); g.lineTo(cx + w * 0.16, y); g.closePath(); g.fill();
  g.fillStyle = "#a83a2a"; g.beginPath(); rrect(g, cx - w * 0.12, y - 6, w * 0.24, 6, 3); g.fill(); g.fillStyle = "#e8dcc0"; g.fillRect(cx + w * 0.04, y - 6, w * 0.07, 6);
  g.fillStyle = "#d8b088"; g.beginPath(); g.moveTo(cx, y - h * 0.62); g.lineTo(cx + w * 0.16, y); g.lineTo(cx + w * 0.24, y); g.lineTo(cx + 3, y - h * 0.6); g.closePath(); g.fill();
  post(g, cx, y - h + 10, 18, "#6a4426", 3);
  if (M) M.door = { x: cx, y, w: w * 0.3, h: h * 0.6 };
}

// ------------------------------------------------------------------------------------------------ the 20 levels
// fp = { x0, w, h } footprint in plot-local px. Each builder paints back-to-front and fills M.
function cabinBody(g, cx, y, w, h, r, M, o = {}) {
  const L = cx - w / 2;
  if (o.base) { stoneWall(g, L - 6, y, w + 12, o.base, r, { color: "#a7a399", moss: true }); y -= o.base; }
  if (o.mat === "stone") stoneWall(g, L, y, w, h, r, { color: "#b4afa2" });
  else if (o.mat === "white") { plaster(g, L, y, w, h, r); timber(g, L, y, w, h, r, { span: 34, mid: o.mid }); }
  else if (o.mat === "brick") { brickWall(g, L, y, w, h, r); }
  else logWall(g, L, y, w, h, r);
  return y;
}
const LEVELS = [
  // 1 Lean-to
  (g, F, r, M) => {
    const L = F.x0, R = F.x0 + F.w, y = 0;
    // fallen mossy log behind
    g.fillStyle = lg(g, 0, -22, 0, 0, [[0, "#8a6440"], [1, "#3a2414"]]); g.beginPath(); rrect(g, L - 10, -22, F.w + 20, 22, 11); g.fill();
    ell(g, R + 10, -11, 5, 11, "#c9a272"); g.strokeStyle = "#9a7448"; g.lineWidth = 0.6; for (let k = 1; k < 4; k++) { g.beginPath(); g.ellipse(R + 10, -11, k * 1.4, k * 2.8, 0, 0, TAU); g.stroke(); }
    for (let i = 0; i < 9; i++) ell(g, L + r() * F.w, -20 + r() * 6, 6 + r() * 8, 3, "rgba(90,140,50,0.75)");
    // poles + ridge
    post(g, L + 12, y, 74, "#6a4426", 5); post(g, L + F.w * 0.55, y, 66, "#6a4426", 5);
    g.strokeStyle = "#5a3b22"; g.lineWidth = 3; g.beginPath(); g.moveTo(L + 12, -74); g.lineTo(L + 4, -82); g.moveTo(L + 12, -74); g.lineTo(L + 19, -81); g.stroke();
    g.strokeStyle = "#6a4426"; g.lineWidth = 5; g.beginPath(); g.moveTo(L, -72); g.lineTo(L + F.w * 0.6, -66); g.stroke();
    // slanted branch roof (high left, down to the log)
    g.save(); g.beginPath(); g.moveTo(L - 8, -78); g.lineTo(L + F.w * 0.62, -70); g.lineTo(R + 14, -14); g.lineTo(R - 14, -10); g.lineTo(L - 4, -66); g.closePath(); g.clip();
    for (let i = 0; i < 14; i++) { g.strokeStyle = "#5a3b22"; g.lineWidth = 2; const sx = L - 6 + i * 11; g.beginPath(); g.moveTo(sx, -76 + i * 0.6); g.lineTo(sx + 44, -12); g.stroke(); }
    g.restore();
    paintFoliage(g, L + F.w * 0.42, -60, F.w * 0.55, 20, PAL.leafOak, LIT, r, { clusters: 9, leaf: 4.2, per: 18 });
    paintFoliage(g, L + F.w * 0.8, -34, F.w * 0.3, 16, PAL.leafOak, LIT, r, { clusters: 5, leaf: 4.2, per: 16 });
    for (let i = 0; i < 6; i++) { g.strokeStyle = "#4a8a3a"; g.lineWidth = 1.3; const fx = L + 30 + r() * 60; g.beginPath(); g.moveTo(fx, -56 + r() * 10); g.quadraticCurveTo(fx + 10, -66, fx + 18, -58); g.stroke(); }
    // leaf bed
    ell(g, L + F.w * 0.4, -3, F.w * 0.3, 5, "#7a8a3a"); ell(g, L + F.w * 0.38, -5, F.w * 0.25, 3, "#a0a048");
    for (let i = 0; i < 12; i++) ell(g, L + F.w * 0.2 + r() * F.w * 0.4, -5 + r() * 3, 2.5, 1.2, ["#c8a33c", "#93bf45", "#b86a2a"][(r() * 3) | 0], r() * 3);
    M.door = { x: L + F.w * 0.4, y: 0, w: 30, h: 50 };
  },
  // 2 Hide tent
  (g, F, r, M) => { tent(g, F.x0 + F.w / 2, 0, F.w - 8, F.h * T * 0.95, r, M); },
  // 3 Camp
  (g, F, r, M) => {
    tent(g, F.x0 + F.w * 0.36, 0, 140, 118, r, M);
    dryingRack(g, F.x0 + F.w - 46, 0);
    logBench(g, F.x0 + F.w * 0.64, 0);
    campfireRing(g, F.x0 + F.w * 0.78, 0, r, M);
    M.door.x = F.x0 + F.w * 0.36;
  },
  // 4 Log hut
  (g, F, r, M) => {
    const cx = F.x0 + F.w / 2, w = F.w - 30, h = 92;
    cabinBody(g, cx, 0, w, h, r, M);
    roof(g, cx - w / 2, cx + w / 2, -h + 2, -h - 36, "sod", r, { ov: 14 });
    door(g, cx, 0, 26, 52, M, "plank");
    windowPane(g, cx - w / 2 + 18, -66, 16, 16, M, "plain");
    workbenchProp(g, cx + w / 2 + 8, 0);
  },
  // 5 Log cabin
  (g, F, r, M) => {
    const cx = F.x0 + F.w / 2, w = F.w - 20, h = 104;
    cabinBody(g, cx, 0, w, h, r, M);
    roof(g, cx - w / 2, cx + w / 2, -h + 2, -h - 78, "shingle", r, { ov: 16 });
    // gable logs
    door(g, cx, -4, 28, 58, M, "plank"); steps(g, cx, 0, 40, 1, r);
    windowPane(g, cx - w * 0.3 - 10, -78, 22, 24, M, "shutter"); windowPane(g, cx + w * 0.3 - 12, -78, 22, 24, M, "shutter");
    windowPane(g, cx - 9, -h - 46, 18, 18, M, "plain");
  },
  // 6 Cabin with chimney
  (g, F, r, M) => {
    const cx = F.x0 + F.w / 2 + 10, w = 250, h = 108;
    chimney(g, cx - w / 2 + 6, -h - 90, 26, h + 90, r, M);
    cabinBody(g, cx, 0, w, h, r, M);
    roof(g, cx - w / 2, cx + w / 2, -h + 2, -h - 80, "shingle", r, { ov: 16 });
    windowPane(g, cx - 9, -h - 46, 18, 20, M, "plain");
    // porch
    g.fillStyle = "#7a5532"; g.fillRect(cx - w / 2 + 20, -6, w - 40, 6);
    door(g, cx, -6, 28, 58, M, "plank");
    windowPane(g, cx - 82, -82, 24, 26, M, "shutter"); windowPane(g, cx + 58, -82, 24, 26, M, "shutter");
    for (const px of [cx - w / 2 + 24, cx - 40, cx + 40, cx + w / 2 - 24]) post(g, px, -6, 70, "#6a4426", 5);
    roof(g, cx - w / 2 + 14, cx + w / 2 - 14, -74, -88, "shingle", r, { ov: 6 });
    // smokehouse shed
    const sx = F.x0 + 4;
    plankWall(g, sx, 0, 46, 54, r, "#7a5532"); roof(g, sx, sx + 46, -52, -72, "shingle", r, { ov: 5 });
    g.fillStyle = "#1e140c"; g.fillRect(sx + 12, -40, 22, 40);
    for (let i = 0; i < 4; i++) { g.fillStyle = "#8d3a2a"; g.fillRect(sx + 14 + i * 5, -38, 2.6, 14 + (i % 2) * 5); }
    M.chimneys.push({ x: sx + 23, y: -72 });
  },
  // 7 Cabin and garden
  (g, F, r, M) => {
    LEVELS[5](g, F, r, M);
    const gx = F.x0 + F.w - 112; fence(g, gx - 6, gx + 128, 0, 22, r); gardenBeds(g, gx, 4, 0, r, M, 26);
    barrel(g, gx - 18, 0); scarecrow(g, gx + 60, -4);
  },
  // 8 Stone foundation
  (g, F, r, M) => {
    const cx = F.x0 + F.w / 2 + 6, w = 250, h = 104, base = 22;
    chimney(g, cx - w / 2 + 6, -h - base - 90, 26, h + 90, r, M);
    const y1 = cabinBody(g, cx, 0, w, h, r, M, { base });
    roof(g, cx - w / 2, cx + w / 2, y1 - h + 2, y1 - h - 80, "shingle", r, { ov: 16 });
    windowPane(g, cx - 9, y1 - h - 46, 18, 20, M, "plain");
    door(g, cx, y1, 28, 58, M, "plank"); steps(g, cx, 0, 46, 4, r);
    windowPane(g, cx - 84, y1 - 80, 24, 26, M, "shutter"); windowPane(g, cx + 60, y1 - 80, 24, 26, M, "shutter");
    // lean-to workshop with furnace
    const wx = F.x0 - 4; post(g, wx + 4, 0, 74, "#6a4426", 4); post(g, wx + 60, 0, 86, "#6a4426", 4);
    g.save(); g.beginPath(); g.moveTo(wx - 6, -70); g.lineTo(wx + 70, -92); g.lineTo(wx + 70, -84); g.lineTo(wx - 6, -62); g.closePath(); g.clip(); plankWall(g, wx - 6, -60, 80, 34, r, "#7a5a3a"); g.restore();
    furnaceProp(g, wx + 14, 0, r, M);
    const gx = F.x0 + F.w - 110; fence(g, gx - 6, gx + 126, 0, 20, r); gardenBeds(g, gx, 4, 0, r, M, 26);
  },
  // 9 Stone cottage
  (g, F, r, M) => {
    const cx = F.x0 + F.w / 2, w = 300, h = 118;
    chimney(g, cx + w / 2 - 40, -h - 104, 28, 40, r, M);
    stoneWall(g, cx - w / 2 - 6, 0, w + 12, 14, r, { color: "#9a958a" });
    cabinBody(g, cx, -14, w, h, r, M, { mat: "white" });
    roof(g, cx - w / 2, cx + w / 2, -h - 12, -h - 104, "thatch", r, { ov: 22, noTrim: true });
    door(g, cx, -14, 30, 62, M, "plank", "#5a3b22"); steps(g, cx, 0, 44, 3, r);
    windowPane(g, cx - 104, -98, 30, 30, M, "plain", { warm: "#ffb860" }); flowerBox(g, cx - 110, -64, 42, r);
    windowPane(g, cx + 74, -98, 30, 30, M, "plain", { warm: "#ffb860" }); flowerBox(g, cx + 68, -64, 42, r);
    windowPane(g, cx - 12, -h - 56, 24, 22, M, "plain");
    const gx = F.x0 - 30; fence(g, gx, gx + 118, 0, 18, r); gardenBeds(g, gx + 6, 4, 0, r, M, 22);
  },
  // 10 Glass-window cottage
  (g, F, r, M) => {
    const cx = F.x0 + F.w / 2, w = 300, h = 118;
    chimney(g, cx + w / 2 - 40, -h - 104, 28, 40, r, M);
    stoneWall(g, cx - w / 2 - 6, 0, w + 12, 14, r, { color: "#9a958a" });
    cabinBody(g, cx, -14, w, h, r, M, { mat: "white" });
    roof(g, cx - w / 2, cx + w / 2, -h - 12, -h - 104, "thatch", r, { ov: 22, noTrim: true });
    door(g, cx, -14, 32, 64, M, "painted", "#2f5a8a"); steps(g, cx, 0, 46, 3, r);
    lamp(g, cx - 30, -74, M); lamp(g, cx + 30, -74, M);
    for (const wx of [cx - 116, cx + 70]) { windowPane(g, wx, -102, 46, 36, M, "leaded", { warm: "#ffd27a" }); flowerBox(g, wx - 4, -62, 54, r); }
    windowPane(g, cx - 14, -h - 58, 28, 26, M, "leaded");
    // anvil awning
    const ax = F.x0 - 22; post(g, ax, 0, 58, "#6a4426", 4); post(g, ax + 44, 0, 58, "#6a4426", 4); roof(g, ax - 4, ax + 48, -56, -66, "shingle", r, { ov: 4 }); anvilProp(g, ax + 22, 0);
    const gx = F.x0 + F.w + 4; fence(g, gx, gx + 106, 0, 18, r); gardenBeds(g, gx + 4, 4, 0, r, M, 22);
  },
  // 11 Upper floor frame (construction)
  (g, F, r, M) => {
    const cx = F.x0 + F.w / 2, w = 300, h = 118;
    stoneWall(g, cx - w / 2 - 6, 0, w + 12, 14, r, { color: "#9a958a" });
    cabinBody(g, cx, -14, w, h, r, M, { mat: "white" });
    // timber frame of the 2nd storey
    const y2 = -14 - h, h2 = 100;
    g.fillStyle = "#6a4426"; g.fillRect(cx - w / 2 - 4, y2 - 6, w + 8, 8);
    timber(g, cx - w / 2, y2, w, h2, r, { col: "#a07850", bw: 6, span: 50, mid: true });
    g.strokeStyle = "#a07850"; g.lineWidth = 5; g.beginPath(); g.moveTo(cx - w / 2, y2 - h2); g.lineTo(cx, y2 - h2 - 70); g.lineTo(cx + w / 2, y2 - h2); g.moveTo(cx - w / 4, y2 - h2 - 35); g.lineTo(cx + w / 4, y2 - h2 - 35); g.stroke();
    // scaffolding + ladders + pulley
    for (const sx of [cx - w / 2 - 26, cx + w / 2 + 22]) { post(g, sx, 0, 250, "#8a6a4a", 3); post(g, sx + 14, 0, 250, "#8a6a4a", 3); for (let yy = -40; yy > -250; yy -= 44) { g.fillStyle = "#b88a5a"; g.fillRect(sx - 6, yy, 28, 4); } }
    g.strokeStyle = "#8a6a4a"; g.lineWidth = 2.4; const lx = cx + 80; g.beginPath(); g.moveTo(lx, 0); g.lineTo(lx + 14, y2 - 10); g.moveTo(lx + 14, 0); g.lineTo(lx + 28, y2 - 10); g.stroke();
    g.lineWidth = 1.4; for (let k = 1; k < 9; k++) { const t = k / 9; g.beginPath(); g.moveTo(lx + 14 * t, (y2 - 10) * t); g.lineTo(lx + 14 + 14 * t, (y2 - 10) * t); g.stroke(); }
    g.fillStyle = "#6a4426"; g.fillRect(cx - 100, y2 - h2 - 8, 6, 60); g.fillRect(cx - 120, y2 - h2 - 8, 26, 5);
    ell(g, cx - 118, y2 - h2 - 2, 5, 5, "#3a3a3e"); g.strokeStyle = "#c8a86a"; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - 122, y2 - h2); g.lineTo(cx - 122, y2 + 10); g.stroke(); barrel(g, cx - 122, y2 + 30);
    door(g, cx, -14, 32, 64, M, "painted", "#2f5a8a"); steps(g, cx, 0, 46, 3, r);
    lamp(g, cx - 30, -74, M); lamp(g, cx + 30, -74, M);
    for (const wx of [cx - 116, cx + 70]) { windowPane(g, wx, -102, 46, 36, M, "leaded"); flowerBox(g, wx - 4, -62, 54, r); }
    for (let i = 0; i < 4; i++) { g.fillStyle = "#c99a5c"; g.fillRect(F.x0 - 40 + i * 2, -6 - i * 6, 60, 5); }
    const gx = F.x0 + F.w + 6; fence(g, gx, gx + 100, 0, 18, r); gardenBeds(g, gx + 4, 4, 0, r, M, 20);
  },
  // 12 Two-storey house
  (g, F, r, M) => twoStorey(g, F, r, M, 0),
  // 13 Workshop wing
  (g, F, r, M) => twoStorey(g, F, r, M, 1),
  // 14 Watchtower
  (g, F, r, M) => twoStorey(g, F, r, M, 2),
  // 15 Manor
  (g, F, r, M) => manor(g, F, r, M, 0),
  // 16 Courtyard walls
  (g, F, r, M) => manor(g, F, r, M, 1),
  // 17 Great hall
  (g, F, r, M) => greatHall(g, F, r, M),
  // 18 Castle keep
  (g, F, r, M) => castle(g, F, r, M, 0),
  // 19 Castle towers
  (g, F, r, M) => castle(g, F, r, M, 1),
  // 20 Crystal citadel
  (g, F, r, M) => castle(g, F, r, M, 2),
];
function twoStorey(g, F, r, M, stage) {
  const cx = PW / 2 + (stage >= 1 ? -40 : 0) + (stage >= 2 ? 30 : 0), w = 300, h1 = 112, h2 = 96;
  if (stage >= 2) { // watchtower on the left
    const tx = cx - w / 2 - 70;
    roundTower(g, tx, 0, 86, 330, r, "#aea898", M, "#4a5a72", 110);
    door(g, tx, 0, 26, 50, null, "iron", "#4a3020"); trophies(g, tx - 14, -60, 4);
    windowPane(g, tx - 10, -250, 20, 26, M, "arch");
  }
  chimney(g, cx + w / 2 - 54, -h1 - h2 - 120, 28, 60, r, M, "#9a5a42");
  stoneWall(g, cx - w / 2 - 6, 0, w + 12, 14, r, { color: "#9a958a" });
  brickWall(g, cx - w / 2, -14, w, h1, r);
  const y2 = -14 - h1;
  g.fillStyle = "#5a3b22"; g.fillRect(cx - w / 2 - 8, y2 - 6, w + 16, 8);
  plaster(g, cx - w / 2 - 4, y2 - 2, w + 8, h2, r, "#f2ead8"); timber(g, cx - w / 2 - 4, y2 - 2, w + 8, h2, r, { span: 38, mid: false, flip: true });
  roof(g, cx - w / 2, cx + w / 2, y2 - h2, y2 - h2 - 96, "tile", r, { ov: 20, trim: "#6a2a1a" });
  windowPane(g, cx - 14, y2 - h2 - 58, 28, 30, M, "arch", { frame: "#f4efe4" });
  door(g, cx, -14, 34, 66, M, "painted", "#7a2a2a"); steps(g, cx, 0, 48, 3, r);
  lamp(g, cx - 32, -76, M); lamp(g, cx + 32, -76, M);
  for (const wx of [cx - 118, cx + 74]) { windowPane(g, wx, -104, 44, 40, M, "leaded"); flowerBox(g, wx - 4, -60, 52, r); }
  for (const wx of [cx - 118, cx + 74]) { windowPane(g, wx, y2 - 76, 44, 40, M, "leaded"); flowerBox(g, wx - 4, y2 - 32, 52, r); }
  // balcony
  windowPane(g, cx - 16, y2 - 82, 32, 62, M, "arch", { frame: "#5a3b22" });
  g.fillStyle = "#5a3b22"; g.fillRect(cx - 40, y2 - 22, 80, 5); for (let k = 0; k <= 10; k++) g.fillRect(cx - 40 + k * 8, y2 - 40, 2.4, 20); g.fillRect(cx - 40, y2 - 42, 82, 4);
  if (stage >= 1) { // workshop wing on the right
    const wx = cx + w / 2 + 4, ww = 150, wh = 120;
    plankWall(g, wx, 0, ww, wh, r, "#8a5a32"); timber(g, wx, 0, ww, wh, r, { span: 50, braces: false });
    roof(g, wx, wx + ww, -wh, -wh - 56, "shingle", r, { ov: 10 });
    door(g, wx + ww / 2, 0, 66, 84, null, "double", "#6a4426");
    toolRack(g, wx + 12, -110);
    grindstone(g, wx + ww + 24, 0); sawhorse(g, wx - 70 + (stage >= 2 ? 0 : 0), 0);
  }
  const gx = stage >= 1 ? F.x0 - 20 + (stage >= 2 ? -20 : 0) : F.x0 + F.w + 4;
  if (stage < 2) { fence(g, gx, gx + 104, 0, 18, r); gardenBeds(g, gx + 4, 4, 0, r, M, 20); }
  else { gardenBeds(g, PW + 6, 4, 0, r, M, 18); }
}
function manor(g, F, r, M, walls) {
  const cx = PW / 2, w = 520, h1 = 120, h2 = 104, wing = 150;
  // chimneys
  chimney(g, cx - w / 2 + 40, -h1 - h2 - 120, 26, 70, r, M, "#9a5a42"); chimney(g, cx + w / 2 - 66, -h1 - h2 - 120, 26, 70, r, M, "#9a5a42");
  stoneWall(g, cx - w / 2 - 6, 0, w + 12, 16, r, { color: "#b4afa2" });
  brickWall(g, cx - w / 2, -16, w, h1 + h2, r, "#a8503a");
  g.fillStyle = "#f4efe4"; g.fillRect(cx - w / 2 - 4, -16 - h1 - 4, w + 8, 7); g.fillRect(cx - w / 2 - 6, -16 - h1 - h2 - 8, w + 12, 9);
  for (const qx of [cx - w / 2, cx + w / 2 - 10, cx - wing / 2 - 10, cx + wing / 2]) { g.fillStyle = "#e8e2d4"; for (let yy = -16; yy > -16 - h1 - h2; yy -= 16) g.fillRect(qx, yy - 14, 10, 12); }
  // central block taller with pediment
  roof(g, cx - w / 2, cx + w / 2, -16 - h1 - h2 - 4, -16 - h1 - h2 - 90, "slate", r, { ov: 16, hip: 150, trim: "#2a3442" });
  const py = -16 - h1 - h2 - 8;
  g.fillStyle = "#f4efe4"; g.beginPath(); g.moveTo(cx - wing / 2 - 10, py); g.lineTo(cx, py - 64); g.lineTo(cx + wing / 2 + 10, py); g.closePath(); g.fill();
  g.fillStyle = "#a8503a"; g.beginPath(); g.moveTo(cx - wing / 2 + 4, py - 4); g.lineTo(cx, py - 54); g.lineTo(cx + wing / 2 - 4, py - 4); g.closePath(); g.fill();
  windowPane(g, cx - 14, py - 40, 28, 28, M, "arch", { frame: "#f4efe4" });
  // weather vane
  g.strokeStyle = "#e8c050"; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, py - 64); g.lineTo(cx, py - 100); g.moveTo(cx - 14, py - 90); g.lineTo(cx + 14, py - 90); g.stroke();
  poly(g, [cx - 2, py - 98, cx + 14, py - 96, cx + 10, py - 93, cx - 2, py - 94], "#e8c050"); poly(g, [cx - 2, py - 98, cx - 12, py - 98, cx - 8, py - 94], "#e8c050");
  // windows: tall, symmetric
  const cols = [-210, -150, -90, 66, 126, 186];
  for (const dx of cols) { windowPane(g, cx + dx, -16 - 100, 26, 70, M, "tall"); windowPane(g, cx + dx, -16 - h1 - 84, 26, 62, M, "tall"); }
  windowPane(g, cx - 12, -16 - h1 - 84, 24, 62, M, "tall");
  // portico
  g.fillStyle = "#f4efe4"; for (const px of [cx - 44, cx - 24, cx + 20, cx + 40]) { g.fillRect(px, -16 - 100, 6, 100); g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(px + 4, -16 - 100, 2, 100); g.fillStyle = "#f4efe4"; }
  g.fillRect(cx - 52, -16 - 108, 104, 10); poly(g, [cx - 56, -16 - 108, cx, -16 - 136, cx + 56, -16 - 108], "#f4efe4");
  door(g, cx, -16, 36, 72, M, "painted", "#2a4a3a"); steps(g, cx, 0, 80, 4, r);
  lamp(g, cx - 60, -80, M); lamp(g, cx + 60, -80, M);
  // hedges + garden of 8
  bushHedge(g, F.x0 - 40, 40, 0, r); bushHedge(g, PW - 0, 40, 0, r);
  gardenBeds(g, walls ? 40 : -36, 4, 0, r, M, 18); gardenBeds(g, walls ? PW - 200 : PW - 54, 4, 0, r, M, 18);
  if (walls) courtyard(g, r, M);
}
function courtyard(g, r, M) {
  // side curtain walls with crenellations and a low front wall with an arched gate
  for (const x of [-22, PW - 16]) { stoneWall(g, x, 0, 38, 170, r, { color: "#b0aa9c", moss: true }); battlements(g, x - 3, -170, 44, r); torchBracket(g, x + 19, -120, M); }
  stoneWall(g, 16, 0, PW / 2 - 60, 46, r, { color: "#a8a294" }); stoneWall(g, PW / 2 + 44, 0, PW / 2 - 60, 46, r, { color: "#a8a294" });
  battlements(g, 16, -46, PW / 2 - 60, r); battlements(g, PW / 2 + 44, -46, PW / 2 - 60, r);
  // gate arch
  const cx = PW / 2; stoneWall(g, cx - 60, 0, 16, 60, r, { color: "#b4afa2" }); stoneWall(g, cx + 44, 0, 16, 60, r, { color: "#b4afa2" });
  g.fillStyle = "#b4afa2"; g.beginPath(); g.moveTo(cx - 60, -56); g.lineTo(cx - 60, -110); g.lineTo(cx + 60, -110); g.lineTo(cx + 60, -56); g.lineTo(cx + 44, -56); g.arc(cx, -56, 44, 0, Math.PI, true); g.closePath(); g.fill();
  g.strokeStyle = "#8a8478"; g.lineWidth = 1; for (let a = 0; a <= Math.PI; a += Math.PI / 9) { g.beginPath(); g.moveTo(cx + Math.cos(a) * 44, -56 - Math.sin(a) * 44); g.lineTo(cx + Math.cos(a) * 54, -56 - Math.sin(a) * 54); g.stroke(); }
  battlements(g, cx - 62, -110, 124, r);
  banner(g, cx - 18, -108, 36, 52, "#5a3c26", M, "bear");
}
function greatHall(g, F, r, M) {
  const cx = PW / 2, w = 600, h = 210;
  stoneWall(g, cx - w / 2 - 6, 0, w + 12, 20, r, { color: "#b4afa2" });
  stoneWall(g, cx - w / 2, -20, w, h, r, { color: "#c2bcae" });
  for (let k = 0; k <= 6; k++) { const bx = cx - w / 2 + k * (w / 6) - 7; stoneWall(g, bx, -20, 14, h + 6, r, { color: "#a8a294" }); }
  roof(g, cx - w / 2, cx + w / 2, -20 - h, -20 - h - 150, "shingle", r, { ov: 20, trim: "#e8c050" });
  g.strokeStyle = "#e8c050"; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - w / 2 - 20, -20 - h + 4); g.lineTo(cx + w / 2 + 20, -20 - h + 4); g.stroke();
  for (let k = 0; k < 6; k++) { const wx = cx - w / 2 + k * (w / 6) + 22; if (Math.abs(wx + 28 - cx) < 40) continue; windowPane(g, wx, -20 - h + 34, 56, 130, M, "arch", { frame: "#e8dcc4", warm: "#ffc86a" }); }
  windowPane(g, cx - 40, -20 - h - 110, 80, 80, M, "arch", { frame: "#e8c050" });
  g.strokeStyle = "#e8c050"; g.lineWidth = 2; g.beginPath(); g.arc(cx, -20 - h - 70, 40, Math.PI, 0); g.stroke();
  door(g, cx, -20, 52, 110, M, "double", "#5a3b22"); steps(g, cx, 0, 90, 4, r);
  for (const s of [-1, 1]) torchBracket(g, cx + s * 52, -100, M);
  banner(g, cx - 120, -20 - h + 16, 26, 60, "#2a4a8a", M, "cube"); banner(g, cx + 94, -20 - h + 16, 26, 60, "#2a4a8a", M, "cube");
  courtyard(g, r, M);
  gardenBeds(g, 30, 4, 0, r, M, 16); gardenBeds(g, PW - 170, 4, 0, r, M, 16);
}
function castle(g, F, r, M, stage) {
  const cx = PW / 2, kw = 300, kh = 460;
  if (stage >= 2) { // crystal spire behind the battlements
    const sy = -kh - 20;
    g.fillStyle = lg(g, cx - 30, 0, cx + 30, 0, [[0, "#d8fbff"], [0.4, "#7fd8f0"], [0.7, "#3a9ac8"], [1, "#1a5a8a"]]);
    g.beginPath(); g.moveTo(cx - 30, sy); g.lineTo(cx - 10, sy - 220); g.lineTo(cx, sy - 260); g.lineTo(cx + 10, sy - 220); g.lineTo(cx + 30, sy); g.closePath(); g.fill();
    g.fillStyle = "rgba(255,255,255,0.6)"; poly(g, [cx - 22, sy, cx - 6, sy - 220, cx - 2, sy - 220, cx - 14, sy], "rgba(255,255,255,0.55)");
    for (const s of [-1, 1]) { g.fillStyle = s < 0 ? "#9ae8ff" : "#3a8ab8"; g.beginPath(); g.moveTo(cx + s * 34, sy); g.lineTo(cx + s * 46, sy - 110); g.lineTo(cx + s * 52, sy - 128); g.lineTo(cx + s * 56, sy - 108); g.lineTo(cx + s * 54, sy); g.closePath(); g.fill(); }
    M.crystals.push({ x: cx, y: sy - 200 }, { x: cx - 8, y: sy - 120 }, { x: cx + 6, y: sy - 60 }, { x: cx - 44, y: sy - 80 }, { x: cx + 48, y: sy - 70 });
    M.spire = { x: cx, y: sy - 140 };
  }
  // outer walls + corner towers
  if (stage >= 1) {
    for (const s of [-1, 1]) {
      const tx = cx + s * 300;
      roundTower(g, tx, 0, 60, 420, r, "#b4afa2", M, "#3a5a8a", 150, true);
      finial(g, tx, -420 - 150);
      for (let k = 0; k < 3; k++) windowPane(g, tx - 8, -140 - k * 100, 16, 30, M, "arch", { warm: "#8fe8ff", crystal: true });
      M.banners.push({ x: tx, y: -560, w: 46, h: 10, col: stage >= 2 ? "#f4efe4" : "#c03030", pennant: true });
    }
  }
  // keep
  stoneWall(g, cx - kw / 2, 0, kw, kh, r, { color: "#b8b2a4", moss: true });
  g.fillStyle = lg(g, cx - kw / 2, 0, cx + kw / 2, 0, [[0, "rgba(255,245,225,0.18)"], [0.5, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.25)"]]); g.fillRect(cx - kw / 2, -kh, kw, kh);
  for (const s of [-1, 1]) stoneWall(g, cx + s * kw / 2 - (s > 0 ? 18 : 0), 0, 18, kh + 14, r, { color: "#a8a294" });
  battlements(g, cx - kw / 2 - 6, -kh, kw + 12, r);
  for (let row = 0; row < 3; row++) for (const dx of [-100, -30, 46]) {
    const crystal = stage >= 1 && row === 2;
    windowPane(g, cx + dx + (dx === -30 ? 6 : 0), -150 - row * 100, row === 0 ? 28 : 22, row === 0 ? 50 : 40, M, row === 0 ? "arch" : "slit", { warm: crystal ? "#8fe8ff" : "#ffcf7a", crystal });
  }
  // portcullis gate
  g.fillStyle = "#1a1410"; g.beginPath(); g.moveTo(cx - 34, 0); g.lineTo(cx - 34, -70); g.arc(cx, -70, 34, Math.PI, 0); g.lineTo(cx + 34, 0); g.closePath(); g.fill();
  g.strokeStyle = "#3a3a3e"; g.lineWidth = 3; for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(cx + k * 10, -100); g.lineTo(cx + k * 10, -14); g.stroke(); } for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(cx - 34, -24 - k * 18); g.lineTo(cx + 34, -24 - k * 18); g.stroke(); }
  M.door = { x: cx, y: 0, w: 68, h: 104 };
  for (const s of [-1, 1]) torchBracket(g, cx + s * 56, -90, M);
  for (const s of [-1, 1]) { g.fillStyle = "#3a3a3e"; g.fillRect(cx + s * 120 - 1, -kh - 80, 3, 80); M.banners.push({ x: cx + s * 120, y: -kh - 78, w: 40, h: 26, col: stage >= 2 ? "#f4efe4" : "#c03030", flag: true, gold: stage >= 2 }); }
  banner(g, cx - 70, -kh + 40, 34, 90, stage >= 2 ? "#f4efe4" : "#2a4a8a", M, "cube"); banner(g, cx + 36, -kh + 40, 34, 90, stage >= 2 ? "#f4efe4" : "#2a4a8a", M, "cube");
  courtyard(g, r, M);
  gardenBeds(g, 34, 4, 0, r, M, 16); gardenBeds(g, PW - 170, 4, 0, r, M, 16);
}

// ------------------------------------------------------------------------------------------------ public
export function createHouse() {
  const cache = new Map(); // level -> { c, meta, bbox }
  function footprintFor(lv) { const L = houseLevel(lv); return L ? { x0: Math.floor((PLOT_W - L.w) / 2) * T, w: L.w * T, h: L.h } : { x0: 0, w: PW, h: 0 }; }
  function get(lv) {
    let e = cache.get(lv);
    if (e) { e.used = performance.now(); return e; }
    const L = houseLevel(lv), hTiles = L ? L.h + 9 : 6;
    const W = PW + MX * 2, H = hTiles * T + T;
    const c = makeCanvas(W * HS, H * HS), g = c.getContext("2d");
    g.setTransform(HS, 0, 0, HS, MX * HS, (H - T) * HS); g.lineJoin = "round"; g.lineCap = "round";
    const M = { windows: [], chimneys: [], fires: [], lamps: [], banners: [], garden: [], crystals: [], door: null, spire: null };
    const r = rng(1000 + lv * 37);
    if (L) {
      try { LEVELS[lv - 1](g, footprintFor(lv), r, M); } catch (err) { console.error("house art", lv, err); }
    } else plotArt(g, r, M);
    // bounding box of painted pixels (for the panel preview)
    e = { c, meta: M, W, H, ox: MX, oy: H - T, used: performance.now(), bbox: measure(c) };
    cache.set(lv, e);
    if (cache.size > 4) { let old = null; for (const [k, v] of cache) if (k !== lv && (!old || v.used < old[1].used)) old = [k, v]; if (old) cache.delete(old[0]); }
    return e;
  }
  function measure(c) {
    // coarse scan of alpha at 1/8 resolution
    const w = Math.ceil(c.width / 8), h = Math.ceil(c.height / 8), s = makeCanvas(w, h), g = s.getContext("2d");
    g.drawImage(c, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < x0) return { x: 0, y: 0, w: c.width, h: c.height };
    return { x: x0 * 8, y: y0 * 8, w: (x1 - x0 + 1) * 8, h: (y1 - y0 + 1) * 8 };
  }
  function plotArt(g, r, M) {
    for (const x of [10, PW - 10]) { post(g, x, 0, 22, "#a77b4f", 4); poly(g, [x - 2, 0, x + 2, 0, x, 5], "#a77b4f"); }
    g.strokeStyle = "rgba(240,235,220,0.8)"; g.lineWidth = 0.8; g.beginPath(); g.moveTo(10, -18); g.lineTo(PW - 10, -18); g.stroke();
    for (let x = 60; x < PW - 40; x += 90) post(g, x, 0, 8, "#a77b4f", 3);
    const sx = PW / 2;
    post(g, sx - 16, 0, 50, "#7a5532", 4); post(g, sx + 16, 0, 50, "#7a5532", 4);
    g.fillStyle = lg(g, 0, -62, 0, -36, [[0, "#c99a5c"], [1, "#8a5a32"]]); g.beginPath(); rrect(g, sx - 40, -64, 80, 30, 4); g.fill();
    g.strokeStyle = "#5a3b22"; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = "#3a2414"; g.font = "bold 13px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("BUILD HERE", sx, -49);
    for (let i = 0; i < 4; i++) { g.fillStyle = "#c99a5c"; g.fillRect(sx + 60 + i * 2, -5 - i * 5, 44, 4); }
    ell(g, sx - 90, -5, 10, 5, "#9a958a"); ell(g, sx - 78, -4, 7, 4, "#b4afa2");
    M.door = { x: sx, y: 0, w: 60, h: 60 };
  }
  // draw the house (current level, + build animation) at the plot. ctx in world px.
  function draw(ctx, plotX, plotY, level, buildT) {
    const e = get(level);
    const x = plotX - e.ox, y = plotY - e.oy;
    if (buildT < 180 && level > 0) {
      const p = Math.min(1, buildT / 150);
      const prev = get(level - 1);
      if (p < 1) { ctx.globalAlpha = 1 - p * p; ctx.drawImage(prev.c, plotX - prev.ox, plotY - prev.oy, prev.W, prev.H); ctx.globalAlpha = 1; }
      const top = e.bbox.y / HS, fullH = e.H - T - top, rise = fullH * easeOut(p);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y + e.H - T - rise, e.W, rise + T); ctx.clip();
      ctx.drawImage(e.c, x, y, e.W, e.H); ctx.restore();
      return { e, front: p < 1 ? plotY - rise : null };
    }
    ctx.drawImage(e.c, x, y, e.W, e.H);
    return { e, front: null };
  }
  const easeOut = (t) => 1 - (1 - t) * (1 - t);
  // fit a level into a box (house panel preview), any 2D context
  function preview(ctx, level, x, y, w, h) {
    const e = get(level), b = e.bbox;
    const pad = 4, k = Math.min((w - pad * 2) / b.w, (h - pad * 2) / b.h);
    const dw = b.w * k, dh = b.h * k;
    ctx.save();
    // soft ground
    ctx.fillStyle = "rgba(70,120,40,0.85)"; ctx.fillRect(x, y + h - 6, w, 6);
    ctx.drawImage(e.c, b.x, b.y, b.w, b.h, x + (w - dw) / 2, y + h - pad - dh + Math.min(pad, 4), dw, dh);
    ctx.restore();
  }
  return { get, draw, preview, clear() { cache.clear(); }, footprintFor };
}
export const HOUSE_COUNT = HOUSE_LEVELS.length;
