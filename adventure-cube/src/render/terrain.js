// terrain.js - auto-detailed terrain from the tile grid, baked into 8x8-tile chunk canvases (lazy, LRU, budgeted).
// Every detail is seeded by WORLD tile coordinates, and each chunk bakes its tiles plus a 2-tile margin, clipped to the
// chunk, so neighbouring chunks agree pixel-for-pixel and a re-bake after an edit only touches nearby chunks.
import { T, slopeH } from "../sim/constants.js";
import { makeCanvas, hash, rrect, css, shade, mix, rgb } from "./util.js";
import { texturesFor, patternsFor, TEX_RES } from "./textures.js";

export const CH = 8;            // tiles per chunk side
export const CW = CH * T;       // chunk size in world px
const MARGIN = 2;
const SCALES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const PX_BUDGET = 18e6;         // max baked chunk pixels kept (~72 MB)

const EMPTY = 0, GROUND = 1, ROCK = 2, WOOD = 3, ICE = 4, ONEWAY = 5, WATER = 16, BACK = 17;
const MASS = new Uint8Array(18); for (const c of [1, 2, 3, 4, 6, 7, 8, 9, 10, 11]) MASS[c] = 1;
const isSlopeC = (c) => c >= 6 && c <= 11;
const isSpikeC = (c) => c >= 12 && c <= 15;

// surface y (world) of tile code c at (tx, ty) at fraction fx across
function topAt(c, tx, ty, fx) { return isSlopeC(c) ? ty * T + T - slopeH(c, fx) : ty * T; }
// outward unit normal of a slope surface (pointing into the air)
function slopeNormal(c) {
  const d = slopeH(c, 1) - slopeH(c, 0); // rise over T
  const l = Math.sqrt(d * d + T * T);
  return [-d / l, -T / l];
}

// surface height above (x, y) smoothed over neighbouring columns, so depth shading has no hard column steps
function colTop(get, x, y) { let d = 0; while (d < 10 && MASS[get(x, y - d - 1)]) d++; return (y - d) * T; }
function smoothTop(get, x, y) {
  const c = colTop(get, x, y);
  const l = MASS[get(x - 1, y)] ? colTop(get, x - 1, y) : c, r = MASS[get(x + 1, y)] ? colTop(get, x + 1, y) : c;
  const l2 = MASS[get(x - 2, y)] ? colTop(get, x - 2, y) : l, r2 = MASS[get(x + 2, y)] ? colTop(get, x + 2, y) : r;
  return c * 0.4 + (l + r) * 0.2 + (l2 + r2) * 0.1;
}

// ------------------------------------------------------------------------------------------------------------------
// bakeRegion: draw tiles [X0..X1]x[Y0..Y1] into g, which is already transformed to WORLD px.
// get(x,y) -> tile code (must answer outside the region too). S = canvas px per world px (for blur radii).
export function bakeRegion(g, A, P, get, X0, Y0, X1, Y1, seed, S, opts = {}) {
  const mass = (x, y) => MASS[get(x, y)] === 1;
  const open = (x, y) => !MASS[get(x, y)];
  const H = (x, y, k) => hash(x, y, seed + k);

  // ---- 1. background rock walls 'B' ----
  const back = new Path2D(); let anyBack = false;
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (get(x, y) === BACK) {
    anyBack = true;
    const nb = (dx, dy) => { const c = get(x + dx, y + dy); return c === BACK || MASS[c]; };
    const r = 8;
    rrect(back, x * T, y * T, T, T, !nb(-1, 0) && !nb(0, -1) ? r : 0, !nb(1, 0) && !nb(0, -1) ? r : 0, !nb(1, 0) && !nb(0, 1) ? r : 0, !nb(-1, 0) && !nb(0, 1) ? r : 0);
  }
  if (anyBack) {
    g.fillStyle = P.back; g.fill(back);
    g.fillStyle = "rgba(0,0,0,0.38)"; g.fill(back);
    g.save(); g.clip(back);
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (get(x, y) === BACK) {
      const h = H(x, y, 3);
      if (h < 0.5) { const gr = g.createRadialGradient(x * T + h * 64, y * T + 16, 2, x * T + h * 64, y * T + 16, 30); gr.addColorStop(0, "rgba(0,0,0,0.22)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x * T - 16, y * T - 16, 64, 64); }
    }
    g.restore();
  }

  // ---- 2. material paths ----
  const union = new Path2D(), ground = new Path2D(), rock = new Path2D(), ice = new Path2D(), wood = new Path2D();
  let nG = 0, nR = 0, nI = 0, nW = 0, nU = 0;
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const c = get(x, y);
    if (!MASS[c]) continue;
    nU++;
    if (isSlopeC(c)) {
      const poly = (p) => { p.moveTo(x * T, y * T + T - slopeH(c, 0)); p.lineTo(x * T + T, y * T + T - slopeH(c, 1)); p.lineTo(x * T + T, y * T + T + 0.5); p.lineTo(x * T, y * T + T + 0.5); p.closePath(); };
      poly(union); poly(ground); nG++;
      continue;
    }
    const r = c === ROCK ? 11 : c === GROUND ? 7 : c === ICE ? 5 : 3;
    const oL = open(x - 1, y), oR = open(x + 1, y), oU = open(x, y - 1), oD = open(x, y + 1);
    const tl = oL && oU && open(x - 1, y - 1) ? r : 0, tr = oR && oU && open(x + 1, y - 1) ? r : 0;
    const br = oR && oD && open(x + 1, y + 1) ? r : 0, bl = oL && oD && open(x - 1, y + 1) ? r : 0;
    // slight overlap into solid neighbours so materials never show hairline seams
    const ex0 = oL ? 0 : 0.5, ex1 = oR ? 0 : 0.5, ey1 = oD ? 0 : 0.5;
    rrect(union, x * T - ex0, y * T, T + ex0 + ex1, T + ey1, tl, tr, br, bl);
    const p = c === GROUND ? ground : c === ROCK ? rock : c === ICE ? ice : wood;
    rrect(p, x * T - ex0, y * T, T + ex0 + ex1, T + ey1, tl, tr, br, bl);
    if (c === GROUND) nG++; else if (c === ROCK) nR++; else if (c === ICE) nI++; else nW++;
  }

  if (nU) {
    // soft drop shadow / ambient occlusion cast onto whatever is behind the play layer
    g.save();
    if (opts.shadow !== false) { g.shadowColor = A.shadow; g.shadowBlur = 14 * S; g.shadowOffsetY = 5 * S; }
    g.fillStyle = A.soil.dark; g.fill(union);
    g.restore();
    if (nG) { g.fillStyle = P.soil; g.fill(ground); }
    if (nR) { g.fillStyle = P.rock; g.fill(rock); }
    if (nI) { g.fillStyle = P.ice; g.fill(ice); g.fillStyle = css(A.ice.light, 0.12); g.fill(ice); }
    if (nW) { g.fillStyle = A.wood.dark; g.fill(wood); }
  }

  // ---- 3. depth shading + soil detail (clipped to the ground) ----
  if (nG) {
    g.save(); g.clip(ground);
    for (let x = X0; x <= X1; x++) {
      let y = Y0;
      while (y <= Y1) {
        if (!MASS[get(x, y)]) { y++; continue; }
        const y0 = y; while (y <= Y1 && MASS[get(x, y)]) y++;
        const top = smoothTop(get, x, y0);
        const gr = g.createLinearGradient(0, top, 0, top + 7 * T);
        gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.12, "rgba(0,0,0,0.04)"); gr.addColorStop(0.45, "rgba(0,0,0,0.3)"); gr.addColorStop(1, "rgba(0,0,0,0.55)");
        g.fillStyle = gr; g.fillRect(x * T, y0 * T, T, (y - y0) * T + 1);
      }
    }
    // strata bands at fixed world heights (sampled every 16 px of world x -> seamless)
    const bx0 = X0 * T, bx1 = (X1 + 1) * T;
    for (let b = Math.floor((Y0 * T) / 21); b <= Math.ceil(((Y1 + 1) * T) / 21); b++) {
      const hb = hash(b, 7, seed + 9);
      if (hb < 0.45) continue;
      const yb = b * 21 + hb * 8, th = 2 + hash(b, 8, seed) * 4;
      g.beginPath();
      for (let wx = Math.floor(bx0 / 16) * 16; wx <= bx1 + 16; wx += 16) g.lineTo(wx, yb + (hash(wx >> 4, b, seed + 10) - 0.5) * 5);
      for (let wx = Math.ceil(bx1 / 16) * 16 + 16; wx >= bx0 - 16; wx -= 16) g.lineTo(wx, yb + th + (hash(wx >> 4, b, seed + 11) - 0.5) * 5);
      g.closePath();
      g.fillStyle = hb > 0.75 ? css(A.soil.light, 0.1) : "rgba(0,0,0,0.09)"; g.fill();
    }
    // pebbles and stones
    const peb = rgb(A.soil.pebble);
    for (let y = Y0 - 1; y <= Y1 + 1; y++) for (let x = X0 - 1; x <= X1 + 1; x++) {
      if (get(x, y) !== GROUND) continue;
      const surf = open(x, y - 1);
      const n = Math.floor(H(x, y, 20) * 2.2) + (surf || H(x, y, 19) < 0.5 ? 0 : 1);
      for (let i = 0; i < n; i++) {
        const px = x * T + H(x, y, 21 + i) * T, py = y * T + (surf ? 9 : 0) + H(x, y, 31 + i) * (surf ? 22 : T);
        const rx = 1.1 + H(x, y, 41 + i) * H(x, y, 51 + i) * 4.5, ry = rx * (0.55 + H(x, y, 61 + i) * 0.35);
        const tone = 0.55 + H(x, y, 71 + i) * 0.4;
        g.fillStyle = "rgba(0,0,0,0.35)"; g.beginPath(); g.ellipse(px + 0.6, py + 0.9, rx, ry, 0, 0, 6.3); g.fill();
        g.fillStyle = css([peb[0] * tone, peb[1] * tone, peb[2] * tone]); g.beginPath(); g.ellipse(px, py, rx, ry, 0, 0, 6.3); g.fill();
        g.fillStyle = "rgba(255,250,230,0.16)"; g.beginPath(); g.ellipse(px - rx * 0.25, py - ry * 0.35, rx * 0.55, ry * 0.4, 0, 0, 6.3); g.fill();
      }
    }
    // roots growing down from the surface
    g.lineCap = "round";
    for (let y = Y0 - 2; y <= Y1; y++) for (let x = X0 - 1; x <= X1 + 1; x++) {
      const c = get(x, y);
      if (!(c === GROUND || isSlopeC(c)) || !open(x, y - 1)) continue;
      const nr = H(x, y, 80) < (A.id === "storm" ? 0.3 : 0.55) ? 1 + (H(x, y, 81) < 0.3 ? 1 : 0) : 0;
      for (let k = 0; k < nr; k++) {
        let px = x * T + H(x, y, 82 + k) * T, py = topAt(c, x, y, (px - x * T) / T) + 5;
        let ang = 1.2 + (H(x, y, 84 + k) - 0.5) * 1.4, w = 2.2 + H(x, y, 86 + k) * 1.6;
        const len = 7 + Math.floor(H(x, y, 88 + k) * 9);
        for (let s = 0; s < len; s++) {
          const nx = px + Math.cos(ang) * 4.5, ny = py + Math.sin(ang) * 4.5;
          g.strokeStyle = A.soil.root; g.lineWidth = w; g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
          g.strokeStyle = css(A.soil.light, 0.35); g.lineWidth = w * 0.35; g.beginPath(); g.moveTo(px - 0.5, py - 0.3); g.lineTo(nx - 0.5, ny - 0.3); g.stroke();
          px = nx; py = ny; w = Math.max(0.4, w * 0.86);
          ang += (hash(x * 31 + s, y * 17 + k, seed + 90) - 0.5) * 0.9;
          ang = Math.max(0.35, Math.min(2.8, ang));
        }
      }
    }
    g.restore();
  }

  // ---- 4. rock detail ----
  if (nR) {
    g.save(); g.clip(rock);
    for (let x = X0; x <= X1; x++) {
      let y = Y0;
      while (y <= Y1) {
        if (!MASS[get(x, y)]) { y++; continue; }
        let d = 0; while (d < 8 && MASS[get(x, y - d - 1)]) d++;
        const y0 = y; while (y <= Y1 && MASS[get(x, y)]) y++;
        const top = (y0 - d) * T;
        const gr = g.createLinearGradient(0, top, 0, top + 8 * T);
        gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.5, "rgba(0,0,0,0.14)"); gr.addColorStop(1, "rgba(0,0,0,0.38)");
        g.fillStyle = gr; g.fillRect(x * T, y0 * T, T, (y - y0) * T + 1);
      }
    }
    for (let y = Y0 - 1; y <= Y1 + 1; y++) for (let x = X0 - 1; x <= X1 + 1; x++) {
      if (get(x, y) !== ROCK) continue;
      // large tonal blotch
      const h0 = H(x, y, 100);
      const bx = x * T + H(x, y, 101) * T, by = y * T + H(x, y, 102) * T, br = 10 + H(x, y, 103) * 18;
      const gr = g.createRadialGradient(bx, by, 1, bx, by, br);
      gr.addColorStop(0, h0 > 0.5 ? css(A.rock.light, 0.2) : "rgba(0,0,0,0.18)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(bx - br, by - br, br * 2, br * 2);
      // cracks
      if (H(x, y, 104) < 0.6) {
        let px = x * T + 4 + H(x, y, 105) * 24, py = y * T + 3 + H(x, y, 106) * 12;
        let ang = 1.1 + (H(x, y, 107) - 0.5) * 2.2;
        const pts = [px, py];
        const n = 3 + Math.floor(H(x, y, 108) * 4);
        for (let s = 0; s < n; s++) { ang += (hash(x + s * 7, y, seed + 109) - 0.5) * 1.3; px += Math.cos(ang) * (4 + hash(x, y + s, seed + 110) * 5); py += Math.sin(ang) * (4 + hash(x, y + s, seed + 111) * 5); pts.push(px, py); }
        g.lineJoin = "round"; g.lineCap = "round";
        g.beginPath(); g.moveTo(pts[0] + 0.7, pts[1] + 0.9); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i] + 0.7, pts[i + 1] + 0.9);
        g.strokeStyle = css(A.rock.light, 0.3); g.lineWidth = 1; g.stroke();
        g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
        g.strokeStyle = css(A.rock.dark, 0.85); g.lineWidth = 1.2; g.stroke();
      }
      // wet streaks in the storm
      if (A.id === "storm" && H(x, y, 112) < 0.5) {
        const sx = x * T + H(x, y, 113) * T;
        g.fillStyle = "rgba(170,190,240,0.08)"; g.fillRect(sx, y * T, 1.2, T);
      }
    }
    // bedding planes: a shadowed crack with a lit lip, every couple of tiles
    {
      const bx0 = X0 * T, bx1 = (X1 + 1) * T;
      for (let b = Math.floor((Y0 * T) / 46); b <= Math.ceil(((Y1 + 1) * T) / 46); b++) {
        if (hash(b, 5, seed + 130) < 0.35) continue;
        const yb = b * 46 + hash(b, 6, seed + 131) * 20;
        g.beginPath();
        for (let wx = Math.floor(bx0 / 16) * 16 - 16; wx <= bx1 + 16; wx += 16) g.lineTo(wx, yb + (hash(wx >> 4, b, seed + 132) - 0.5) * 6);
        g.strokeStyle = css(A.rock.light, 0.22); g.lineWidth = 2; g.save(); g.translate(0, -1.6); g.stroke(); g.restore();
        g.strokeStyle = "rgba(0,0,0,0.38)"; g.lineWidth = 1.4; g.stroke();
      }
    }
    // moss / lichen streaks running down exposed faces
    if (A.rockCap !== "snow") for (let y = Y0 - 2; y <= Y1; y++) for (let x = X0 - 1; x <= X1 + 1; x++) {
      if (get(x, y) !== ROCK || MASS[get(x, y - 1)] || H(x, y, 133) < 0.4) continue;
      for (let k = 0; k < 3; k++) {
        const sx = x * T + H(x, y, 134 + k) * T, len = 10 + H(x, y, 137 + k) * 50, w = 1.5 + H(x, y, 140 + k) * 4;
        const gr = g.createLinearGradient(0, y * T, 0, y * T + len);
        gr.addColorStop(0, css(A.rock.cap, 0.55)); gr.addColorStop(1, css(A.rock.cap, 0));
        g.fillStyle = gr; g.beginPath(); g.ellipse(sx, y * T + len / 2, w, len / 2, 0, 0, 6.3); g.fill();
      }
    }
    // strata lines (strong in the highlands)
    if (A.rock.strata > 0.08) {
      const bx0 = X0 * T, bx1 = (X1 + 1) * T;
      for (let b = Math.floor((Y0 * T) / 9); b <= Math.ceil(((Y1 + 1) * T) / 9); b++) {
        const hb = hash(b, 3, seed + 120);
        const yb = b * 9 + hb * 3;
        g.beginPath();
        for (let wx = Math.floor(bx0 / 16) * 16 - 16; wx <= bx1 + 16; wx += 16) g.lineTo(wx, yb + (hash(wx >> 4, b, seed + 121) - 0.5) * 2.5);
        g.strokeStyle = hb > 0.5 ? css(A.rock.light, 0.16) : "rgba(0,0,0,0.13)"; g.lineWidth = 1 + hb; g.stroke();
      }
    }
    g.restore();
  }

  // ---- 5. edge lighting: lit faces toward the light, AO/shadow on the others, wet banks next to water ----
  if (nU) {
    g.save(); g.clip(union);
    const L = A.light, lc = A.lightColor;
    const edge = (x0, y0, x1, y1, nx, ny, wet) => {
      const k = nx * L.x + ny * L.y;
      const depth = 11;
      const gr = g.createLinearGradient(x0, y0, x0 - nx * depth, y0 - ny * depth);
      if (k > 0.05) { gr.addColorStop(0, css(lc, 0.26 * k)); gr.addColorStop(1, css(lc, 0)); }
      else { gr.addColorStop(0, `rgba(0,0,0,${0.12 + 0.3 * -k})`); gr.addColorStop(1, "rgba(0,0,0,0)"); }
      g.fillStyle = gr;
      g.fillRect(Math.min(x0, x1, x0 - nx * depth), Math.min(y0, y1, y0 - ny * depth), Math.abs(x1 - x0) + Math.abs(nx) * depth || depth, Math.abs(y1 - y0) + Math.abs(ny) * depth || depth);
      if (wet) {
        g.fillStyle = "rgba(0,10,25,0.28)";
        g.fillRect(Math.min(x0, x1, x0 - nx * 6), Math.min(y0, y1, y0 - ny * 6), Math.abs(x1 - x0) + Math.abs(nx) * 6 || 6, Math.abs(y1 - y0) + Math.abs(ny) * 6 || 6);
      }
    };
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const c = get(x, y);
      if (!MASS[c] || c === WOOD) continue;
      const X = x * T, Y = y * T;
      if (isSlopeC(c)) {
        const n = slopeNormal(c), k = n[0] * L.x + n[1] * L.y;
        g.beginPath(); g.moveTo(X, Y + T - slopeH(c, 0)); g.lineTo(X + T, Y + T - slopeH(c, 1));
        g.strokeStyle = k > 0 ? css(lc, 0.22 * k) : `rgba(0,0,0,${0.25 * -k})`; g.lineWidth = 9; g.stroke();
        g.lineWidth = 4; g.stroke();
        continue;
      }
      const cl = get(x - 1, y), cr = get(x + 1, y), cu = get(x, y - 1), cd = get(x, y + 1);
      if (!MASS[cl]) edge(X, Y, X, Y + T, -1, 0, cl === WATER);
      if (!MASS[cr]) edge(X + T, Y, X + T, Y + T, 1, 0, cr === WATER);
      if (!MASS[cu]) edge(X, Y, X + T, Y, 0, -1, cu === WATER);
      if (!MASS[cd]) edge(X, Y + T, X + T, Y + T, 0, 1, cd === WATER);
    }
    g.restore();
  }

  // ---- 6. logs and stumps (WOOD) ----
  if (nW) drawWood(g, A, P, get, X0, Y0, X1, Y1, seed, mass);

  // ---- 7. one-way branches ----
  drawBranches(g, A, P, get, X0, Y0, X1, Y1, seed);

  // ---- 8. caps on exposed tops: grass / snow / moss / lichen / frost ----
  drawCaps(g, A, get, X0, Y0, X1, Y1, seed);

  // ---- 9. thorns / shards / icicles ----
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) { const c = get(x, y); if (isSpikeC(c)) drawSpike(g, A, c, x, y, seed); }

  // ---- 10. ambient occlusion in the air at floor/wall corners ----
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const c = get(x, y);
    if (MASS[c] || c === WATER) continue;
    const below = mass(x, y + 1);
    for (const side of [-1, 1]) {
      if (!mass(x + side, y)) continue;
      const cx = side < 0 ? x * T : x * T + T;
      if (below) {
        const gr = g.createRadialGradient(cx, y * T + T, 0, cx, y * T + T, 26);
        gr.addColorStop(0, A.ao); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(x * T, y * T, T, T);
      } else {
        const gr = g.createLinearGradient(cx, 0, cx - side * 12, 0);
        gr.addColorStop(0, "rgba(0,0,0,0.16)"); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(x * T, y * T, T, T);
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------------------------
function drawWood(g, A, P, get, X0, Y0, X1, Y1, seed, mass) {
  const W = A.wood;
  const isW = (x, y) => get(x, y) === WOOD;
  const done = new Set();
  for (let y = Y0 - 1; y <= Y1 + 1; y++) for (let x = X0 - 1; x <= X1 + 1; x++) {
    if (!isW(x, y)) continue;
    const vertical = !isW(x - 1, y) && !isW(x + 1, y) && (isW(x, y - 1) || isW(x, y + 1));
    if (vertical) {
      let y0 = y; while (isW(x, y0 - 1) && !isW(x - 1, y0 - 1) && !isW(x + 1, y0 - 1)) y0--;
      const key = "v" + x + "," + y0; if (done.has(key)) continue; done.add(key);
      let y1 = y; while (isW(x, y1 + 1) && !isW(x - 1, y1 + 1) && !isW(x + 1, y1 + 1)) y1++;
      const X = x * T, Y = y0 * T, Hh = (y1 - y0 + 1) * T;
      const topOpen = !mass(x, y0 - 1);
      g.save();
      const p = new Path2D(); rrect(p, X + 1, Y + (topOpen ? 2 : 0), T - 2, Hh - (topOpen ? 2 : 0), topOpen ? 4 : 0);
      g.fillStyle = P.barkV || P.bark; g.fill(p);
      g.clip(p);
      const gr = g.createLinearGradient(X, 0, X + T, 0);
      gr.addColorStop(0, "rgba(0,0,0,0.5)"); gr.addColorStop(0.32, "rgba(255,240,210,0.12)"); gr.addColorStop(0.6, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,0.55)");
      g.fillStyle = gr; g.fillRect(X, Y, T, Hh);
      g.restore();
      if (topOpen) ringsEllipse(g, W, X + T / 2, Y + 5, 14.5, 5, seed + x);
      continue;
    }
    let x0 = x; while (isW(x0 - 1, y)) x0--;
    const key = "h" + x0 + "," + y; if (done.has(key)) continue; done.add(key);
    let x1 = x; while (isW(x1 + 1, y)) x1++;
    const X = x0 * T, Y = y * T, Ww = (x1 - x0 + 1) * T;
    const lOpen = !mass(x0 - 1, y), rOpen = !mass(x1 + 1, y);
    g.save();
    const p = new Path2D(); rrect(p, X + (lOpen ? 3 : 0), Y + 1, Ww - (lOpen ? 3 : 0) - (rOpen ? 3 : 0), T - 1, lOpen ? 12 : 0, rOpen ? 12 : 0, rOpen ? 12 : 0, lOpen ? 12 : 0);
    g.fillStyle = P.bark; g.fill(p);
    g.clip(p);
    const gr = g.createLinearGradient(0, Y, 0, Y + T);
    gr.addColorStop(0, "rgba(255,240,210,0.16)"); gr.addColorStop(0.18, "rgba(255,240,210,0.22)"); gr.addColorStop(0.45, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,0.6)");
    g.fillStyle = gr; g.fillRect(X, Y, Ww, T);
    // bark plates / knots
    for (let tx = x0; tx <= x1; tx++) {
      if (hash(tx, y, seed + 140) < 0.35) {
        const kx = tx * T + hash(tx, y, seed + 141) * T, ky = Y + 10 + hash(tx, y, seed + 142) * 12;
        g.fillStyle = css(W.dark, 0.8); g.beginPath(); g.ellipse(kx, ky, 3.2, 2.2, 0, 0, 6.3); g.fill();
        g.strokeStyle = css(W.light, 0.4); g.lineWidth = 0.8; g.beginPath(); g.ellipse(kx, ky, 4.4, 3, 0, 3.4, 6); g.stroke();
      }
    }
    // moss on the top (forest/highlands) / snow (storm)
    if (!mass(x0, y - 1) || true) {
      for (let tx = x0; tx <= x1; tx++) {
        if (mass(tx, y - 1)) continue;
        if (A.cap === "snow") continue;
        for (let i = 0; i < 5; i++) {
          if (hash(tx * 5 + i, y, seed + 150) < 0.45) continue;
          const mx = tx * T + hash(tx * 5 + i, y, seed + 151) * T, mr = 3 + hash(tx * 5 + i, y, seed + 152) * 5;
          g.fillStyle = css(W.moss, 0.85); g.beginPath(); g.ellipse(mx, Y + 2, mr, mr * 0.55, 0, 0, 6.3); g.fill();
          g.fillStyle = css(A.grass.light, 0.4); g.beginPath(); g.ellipse(mx - mr * 0.3, Y + 1, mr * 0.5, mr * 0.25, 0, 0, 6.3); g.fill();
        }
      }
    }
    g.restore();
    if (lOpen) ringsEllipse(g, W, X + 8, Y + T / 2 + 0.5, 6, 14.5, seed + x0 * 3);
    if (rOpen) ringsEllipse(g, W, X + Ww - 8, Y + T / 2 + 0.5, 6, 14.5, seed + x1 * 7);
  }
}
function ringsEllipse(g, W, cx, cy, rx, ry, s) {
  g.fillStyle = W.dark; g.beginPath(); g.ellipse(cx, cy, rx + 1.2, ry + 1.2, 0, 0, 6.3); g.fill();
  const gr = g.createRadialGradient(cx - rx * 0.2, cy - ry * 0.2, 0, cx, cy, Math.max(rx, ry));
  gr.addColorStop(0, W.ring); gr.addColorStop(1, W.ringDark);
  g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 6.3); g.fill();
  g.strokeStyle = css(W.dark, 0.45); g.lineWidth = 0.7;
  for (let i = 1; i <= 4; i++) { const k = i / 5 + (hash(i, s, 3) - 0.5) * 0.06; g.beginPath(); g.ellipse(cx, cy, rx * k, ry * k, 0, 0, 6.3); g.stroke(); }
  g.fillStyle = css(W.dark, 0.6); g.beginPath(); g.ellipse(cx, cy, 1, 1.4, 0, 0, 6.3); g.fill();
}

// ------------------------------------------------------------------------------------------------------------------
function drawBranches(g, A, P, get, X0, Y0, X1, Y1, seed) {
  const isO = (x, y) => get(x, y) === ONEWAY;
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0 - 6; x <= X1 + 1; x++) {
      if (!isO(x, y) || isO(x - 1, y)) continue;
      let x1 = x; while (isO(x1 + 1, y) && x1 - x < 64) x1++;
      if (x1 < X0 || x > X1 + 1) { x = x1; continue; }
      const aL = MASS[get(x - 1, y)] === 1, aR = MASS[get(x1 + 1, y)] === 1;
      const L = x * T - (aL ? 2 : 1), R = (x1 + 1) * T + (aR ? 2 : 1), Y = y * T - 1;
      const thick = (u) => { // u 0..1 along; thickness at u
        if (aL && !aR) return 10 - 6 * u;
        if (aR && !aL) return 4 + 6 * u;
        if (aL && aR) return 9;
        return 4 + 5 * Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
      };
      const n = Math.max(4, Math.round((R - L) / 6));
      const p = new Path2D();
      p.moveTo(L, Y + 1);
      for (let i = 0; i <= n; i++) { const u = i / n, wx = L + (R - L) * u; p.lineTo(wx, Y + (hash(Math.floor(wx / 6), y, seed + 160) - 0.5) * 0.8); }
      for (let i = n; i >= 0; i--) { const u = i / n, wx = L + (R - L) * u; p.lineTo(wx, Y + thick(u) + (hash(Math.floor(wx / 6), y, seed + 161) - 0.5) * 1.2); }
      p.closePath();
      g.save();
      g.shadowColor = "rgba(0,0,0,0.35)"; g.shadowBlur = 6; g.shadowOffsetY = 3;
      g.fillStyle = A.wood.dark; g.fill(p);
      g.restore();
      g.save(); g.clip(p);
      g.fillStyle = P.bark; g.fill(p);
      const gr = g.createLinearGradient(0, Y, 0, Y + 10);
      gr.addColorStop(0, "rgba(255,240,200,0.3)"); gr.addColorStop(0.35, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,0.55)");
      g.fillStyle = gr; g.fillRect(L, Y - 1, R - L, 12);
      g.restore();
      // leaves / snow / moss on top
      if (A.cap === "snow") {
        g.fillStyle = A.rock.cap; g.beginPath(); g.moveTo(L + 2, Y + 1);
        for (let wx = L + 2; wx <= R - 2; wx += 4) g.lineTo(wx, Y - 1.5 - hash(Math.floor(wx / 4), y, seed + 162) * 2);
        g.lineTo(R - 2, Y + 1.5); g.closePath(); g.fill();
      } else {
        const ends = [];
        if (!aL) ends.push(L + 4); if (!aR) ends.push(R - 4);
        if (!ends.length) ends.push((L + R) / 2);
        for (const ex of ends) for (let i = 0; i < 9; i++) {
          const lx = ex + (hash(i, Math.floor(ex), seed + 163) - 0.5) * 22, ly = Y + 2 + (hash(i, Math.floor(ex), seed + 164) - 0.5) * 12;
          const col = A.leaf[i % A.leaf.length];
          g.save(); g.translate(lx, ly); g.rotate(hash(i, Math.floor(ex), seed + 165) * 6.3);
          g.fillStyle = shade(col, 0.75); g.beginPath(); g.ellipse(0, 0, 4.6, 2.2, 0, 0, 6.3); g.fill();
          g.fillStyle = shade(col, 1.08, 0.8); g.beginPath(); g.ellipse(-0.6, -0.5, 3.4, 1.2, 0, 0, 6.3); g.fill();
          g.restore();
        }
      }
      x = x1;
    }
  }
}

// ------------------------------------------------------------------------------------------------------------------
function drawCaps(g, A, get, X0, Y0, X1, Y1, seed) {
  const G = A.grass;
  // blade paths, batched per colour
  const blades = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const bladeCol = [G.dark, G.mid, G.light, G.tip];
  const bandDark = new Path2D(), bandMid = new Path2D(), snowP = new Path2D(), mossP = new Path2D(), frostP = new Path2D();
  const flowers = [];
  let nBand = 0, nSnow = 0, nMoss = 0, nFrost = 0;
  const lichen = [];
  const sampleY = (c, x, y, wx) => topAt(c, x, y, (wx - x * T) / T);
  // wavy band below a surface: from wx0..wx1 along tile (c,x,y)
  const band = (p, c, x, y, up, down, k) => {
    const x0 = x * T, x1 = x0 + T;
    p.moveTo(x0, sampleY(c, x, y, x0) - up);
    for (let wx = x0 + 4; wx <= x1; wx += 4) p.lineTo(wx, sampleY(c, x, y, wx) - up - (k ? hash(wx >> 2, y, seed + k) * 2 : 0));
    for (let wx = x1; wx >= x0; wx -= 4) p.lineTo(wx, sampleY(c, x, y, wx) + down + hash(wx >> 2, y, seed + 170) * 3);
    p.closePath();
  };
  for (let y = Y0; y <= Y1; y++) for (let x = X0 - 1; x <= X1 + 1; x++) {
    const c = get(x, y);
    if (!MASS[c] || c === WOOD) continue;
    const up = get(x, y - 1);
    if (MASS[up] || up === WATER || isSpikeC(up) && up !== 13) continue;
    const slope = isSlopeC(c);
    const kind = c === ICE ? "frost" : c === ROCK ? A.rockCap : A.cap;
    const oL = !MASS[get(x - 1, y)] && !slope, oR = !MASS[get(x + 1, y)] && !slope;
    if (kind === "grass") {
      band(bandDark, c, x, y, 1, 4, 0); band(bandMid, c, x, y, 1.5, 1.2, 171); nBand++;
      if (oL) { bandDark.moveTo(x * T + 0.5, y * T); bandDark.arc(x * T + 2.5, y * T + 2, 2.6, Math.PI, Math.PI * 1.5); bandDark.lineTo(x * T + 4, y * T + 6); bandDark.closePath(); }
      if (oR) { bandDark.moveTo(x * T + T - 0.5, y * T); bandDark.arc(x * T + T - 2.5, y * T + 2, 2.6, -Math.PI / 2, 0); bandDark.lineTo(x * T + T - 4, y * T + 6); bandDark.closePath(); }
      const nb = 20;
      for (let i = 0; i < nb; i++) {
        const hx = hash(x * nb + i, y, seed + 172);
        const bx = x * T + (i + hx) * (T / nb), by = sampleY(c, x, y, bx) + 2.5;
        const h = (3 + hash(x * nb + i, y, seed + 173) * 6.5) * (A.id === "highlands" ? 1.25 : 1);
        const lean = (hash(x * nb + i, y, seed + 174) - 0.42) * 3.4;
        const ci = Math.min(3, Math.floor(hash(x * nb + i, y, seed + 175) * 3.6 + (h > 7 ? 0.6 : 0)));
        const p = blades[ci];
        p.moveTo(bx - 1, by); p.quadraticCurveTo(bx - 0.4 + lean * 0.3, by - h * 0.6, bx + lean, by - h); p.quadraticCurveTo(bx + 0.4 + lean * 0.3, by - h * 0.55, bx + 1, by); p.closePath();
        if (A.id === "forest" && hash(x * nb + i, y, seed + 176) < 0.035) flowers.push(bx + lean, by - h, hash(x, i, seed + 177));
        if (A.id === "highlands" && hash(x * nb + i, y, seed + 176) < 0.03) flowers.push(bx + lean, by - h, 0.85 + hash(x, i, 7) * 0.1);
      }
      // drape over exposed edges
      for (const side of [oL ? -1 : 0, oR ? 1 : 0]) {
        if (!side) continue;
        const ex = side < 0 ? x * T : x * T + T;
        for (let i = 0; i < 4; i++) {
          const yy = y * T + 1 + i * 1.6, len = 3 + hash(x * 4 + i, y * 2 + side, seed + 178) * 6;
          const p = blades[i % 2];
          p.moveTo(ex - side * 1.5, yy); p.quadraticCurveTo(ex + side * 2.2, yy + len * 0.3, ex + side * 0.8, yy + len); p.lineTo(ex - side * 0.2, yy + 1.5); p.closePath();
        }
      }
    } else if (kind === "snow") {
      nSnow++;
      const x0 = x * T, x1 = x0 + T;
      snowP.moveTo(x0 - (oL ? 1.5 : 0), sampleY(c, x, y, x0) + (oL ? 3 : 0));
      for (let wx = x0; wx <= x1; wx += 4) snowP.lineTo(wx, sampleY(c, x, y, wx) - 2.5 - hash(wx >> 2, y, seed + 180) * 2.2);
      snowP.lineTo(x1 + (oR ? 1.5 : 0), sampleY(c, x, y, x1) + (oR ? 3 : 0));
      for (let wx = x1; wx >= x0; wx -= 4) snowP.lineTo(wx, sampleY(c, x, y, wx) + 2.5 + hash(wx >> 2, y, seed + 181) * 2.5);
      snowP.closePath();
      if (c === GROUND || slope) for (let i = 0; i < 5; i++) {
        if (hash(x * 5 + i, y, seed + 182) < 0.5) continue;
        const bx = x * T + hash(x * 5 + i, y, seed + 183) * T, by = sampleY(c, x, y, bx) - 1, h = 3 + hash(i, x, seed + 184) * 5;
        const p = blades[i % 2]; p.moveTo(bx - 0.7, by); p.lineTo(bx + (hash(i, y, seed) - 0.5) * 3, by - h); p.lineTo(bx + 0.7, by); p.closePath();
      }
    } else if (kind === "moss") {
      nMoss++;
      band(mossP, c, x, y, 1.5, 3, 185);
      for (const side of [oL ? -1 : 0, oR ? 1 : 0]) {
        if (!side) continue;
        const ex = side < 0 ? x * T : x * T + T;
        const len = 6 + hash(x, y + side, seed + 186) * 12;
        mossP.moveTo(ex - side * 6, y * T); mossP.quadraticCurveTo(ex + side * 1.6, y * T, ex + side * 1, y * T + len); mossP.lineTo(ex - side * 2, y * T + len * 0.6); mossP.closePath();
      }
    } else if (kind === "lichen") {
      for (let i = 0; i < 4; i++) {
        if (hash(x * 4 + i, y, seed + 187) < 0.35) continue;
        lichen.push(x * T + hash(x * 4 + i, y, seed + 188) * T, y * T + 1 + hash(x * 4 + i, y, seed + 189) * 6, 1.5 + hash(i, x * 3 + y, seed + 190) * 3.5);
      }
      for (let i = 0; i < 8; i++) {
        if (hash(x * 8 + i, y, seed + 191) < 0.55) continue;
        const bx = x * T + hash(x * 8 + i, y, seed + 192) * T, by = y * T + 1.5, h = 2.5 + hash(i, x, seed + 193) * 5;
        const p = blades[3 - (i % 2)]; p.moveTo(bx - 0.8, by); p.quadraticCurveTo(bx, by - h * 0.6, bx + (hash(i, y, seed + 194) - 0.4) * 3, by - h); p.lineTo(bx + 0.8, by); p.closePath();
      }
    } else if (kind === "frost") {
      nFrost++;
      frostP.rect(x * T, y * T - 0.5, T, 2.4);
    }
  }
  if (nBand) {
    g.fillStyle = G.dark; g.fill(bandDark);
    g.fillStyle = G.mid; g.fill(bandMid);
  }
  if (nMoss) {
    g.save(); g.shadowColor = "rgba(0,0,0,0.3)"; g.shadowBlur = 3; g.shadowOffsetY = 1.5;
    g.fillStyle = A.rock.cap; g.fill(mossP); g.restore();
    g.save(); g.clip(mossP); g.fillStyle = css(A.rock.capLight, 0.55);
    for (let y = Y0; y <= Y1; y++) for (let x = X0 - 1; x <= X1 + 1; x++) {
      if (get(x, y) !== ROCK) continue;
      for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(x * T + hash(x * 7 + i, y, seed + 195) * T, y * T + hash(x * 7 + i, y, seed + 196) * 4 - 0.5, 0.8 + hash(i, x, seed + 197) * 1.4, 0, 6.3); g.fill(); }
    }
    g.restore();
  }
  if (lichen.length) {
    for (let i = 0; i < lichen.length; i += 3) {
      g.fillStyle = css(i % 2 ? A.rock.cap : A.rock.capLight, 0.75);
      g.beginPath(); g.ellipse(lichen[i], lichen[i + 1], lichen[i + 2], lichen[i + 2] * 0.6, 0, 0, 6.3); g.fill();
    }
  }
  for (let i = 0; i < 4; i++) { g.fillStyle = bladeCol[i]; g.fill(blades[i]); }
  if (nSnow) {
    g.save(); g.shadowColor = "rgba(0,8,30,0.5)"; g.shadowBlur = 4; g.shadowOffsetY = 2;
    g.fillStyle = A.rock.cap; g.fill(snowP); g.restore();
    g.save(); g.clip(snowP);
    for (let y = Y0; y <= Y1; y++) for (let x = X0 - 1; x <= X1 + 1; x++) {
      const c = get(x, y); if (!MASS[c] || c === WOOD) continue;
      const gr = g.createLinearGradient(0, y * T - 5, 0, y * T + 6);
      gr.addColorStop(0, css(A.rock.capLight, 0.95)); gr.addColorStop(0.5, css(A.rock.cap, 0)); gr.addColorStop(1, "rgba(60,80,130,0.35)");
      g.fillStyle = gr; g.fillRect(x * T - 2, y * T - 6, T + 4, T * 0.8);
    }
    g.restore();
  }
  if (nFrost) { g.fillStyle = css(A.ice.light, 0.9); g.fill(frostP); }
  for (let i = 0; i < flowers.length; i += 3) {
    const h = flowers[i + 2];
    g.fillStyle = h < 0.33 ? "#fff6e0" : h < 0.6 ? "#ffd84a" : h < 0.84 ? "#c88ef0" : "#b78ad8";
    g.beginPath(); g.arc(flowers[i], flowers[i + 1], 1.4, 0, 6.3); g.fill();
    g.fillStyle = "rgba(255,200,60,0.9)"; g.beginPath(); g.arc(flowers[i], flowers[i + 1], 0.5, 0, 6.3); g.fill();
  }
  // dappled sunlight on the grass (forest)
  if (A.id === "forest") {
    for (let y = Y0; y <= Y1; y++) for (let x = X0 - 1; x <= X1 + 1; x++) {
      const c = get(x, y); if (!(c === GROUND || isSlopeC(c)) || MASS[get(x, y - 1)] || hash(x, y, seed + 198) < 0.55) continue;
      const dx = x * T + hash(x, y, seed + 199) * T, dy = sampleY(c, x, y, dx);
      const gr = g.createRadialGradient(dx, dy, 0, dx, dy, 13);
      gr.addColorStop(0, "rgba(255,250,200,0.32)"); gr.addColorStop(1, "rgba(255,250,200,0)");
      g.fillStyle = gr; g.fillRect(dx - 13, dy - 13, 26, 26);
    }
  }
}

// ------------------------------------------------------------------------------------------------------------------
// spikes drawn in a local frame pointing UP with the base on the tile bottom, then rotated into place
export function drawSpike(g, A, c, x, y, seed) {
  const cx = x * T + T / 2, cy = y * T + T / 2;
  g.save();
  g.translate(cx, cy);
  g.rotate(c === 13 ? Math.PI : c === 14 ? -Math.PI / 2 : c === 15 ? Math.PI / 2 : 0);
  g.translate(-T / 2, -T / 2);
  const S = A.thorn, st = A.spikeStyle, s = seed + x * 7 + y * 13;
  if (st === "bramble") {
    g.lineCap = "round";
    // twisted vine
    for (let k = 0; k < 2; k++) {
      g.beginPath(); g.moveTo(-1, 28 + k);
      for (let i = 1; i <= 8; i++) g.lineTo(i * 4.25 - 1, 28.5 + Math.sin(i * 1.7 + k * 2 + s) * 1.8 + k);
      g.strokeStyle = k ? shade(S.vine, 0.7) : S.vine; g.lineWidth = 3.2 - k; g.stroke();
    }
    const n = 4;
    for (let i = 0; i < n; i++) {
      const bx = 4 + i * 8 + (hash(i, s, 2) - 0.5) * 3, h = 15 + hash(i, s, 3) * 5, lean = (hash(i, s, 4) - 0.5) * 6;
      const tipX = bx + lean, tipY = 28 - h;
      g.beginPath(); g.moveTo(bx - 3.2, 29); g.quadraticCurveTo(bx - 1, 22, tipX, tipY); g.quadraticCurveTo(bx + 1, 22, bx + 3.2, 29); g.closePath();
      g.fillStyle = shade(S.thorn, 0.6); g.fill();
      g.beginPath(); g.moveTo(bx - 1.6, 28); g.quadraticCurveTo(bx - 0.5, 22, tipX, tipY); g.quadraticCurveTo(bx + 0.2, 23, bx + 0.6, 28); g.closePath();
      g.fillStyle = S.thorn; g.fill();
      g.beginPath(); g.moveTo(tipX, tipY); g.lineTo(tipX + (bx - tipX) * 0.35 - 0.8, tipY + h * 0.35); g.lineTo(tipX + (bx - tipX) * 0.35 + 0.8, tipY + h * 0.35); g.closePath();
      g.fillStyle = S.tip; g.fill();
      // side thorn
      const sx = bx + (lean > 0 ? -1 : 1) * 1.5, sy = 24;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + (lean > 0 ? -4.5 : 4.5), sy - 3.5); g.lineTo(sx, sy + 2); g.closePath(); g.fillStyle = S.thorn; g.fill();
    }
    for (let i = 0; i < 2; i++) {
      const lx = 6 + hash(i, s, 6) * 20;
      g.save(); g.translate(lx, 27); g.rotate(-0.6 + hash(i, s, 7) * 1.2 - (i ? 0 : 3.1));
      g.fillStyle = S.leaf; g.beginPath(); g.ellipse(4, 0, 4.2, 1.9, 0, 0, 6.3); g.fill();
      g.restore();
    }
  } else if (st === "shard") {
    const R = A.rock;
    const n = 3;
    for (let i = 0; i < n; i++) {
      const bx = 6 + i * 10 + (hash(i, s, 8) - 0.5) * 3, w = 5.5 + hash(i, s, 9) * 2.5, h = 16 + hash(i, s, 10) * 6;
      const tipX = bx + (hash(i, s, 11) - 0.5) * 4, tipY = 31 - h;
      g.beginPath(); g.moveTo(bx - w, 32); g.lineTo(tipX, tipY); g.lineTo(bx + w, 32); g.closePath();
      g.fillStyle = R.dark; g.fill();
      g.beginPath(); g.moveTo(bx - w, 32); g.lineTo(tipX, tipY); g.lineTo(bx + 0.5, 32); g.closePath();
      g.fillStyle = R.base; g.fill();
      g.beginPath(); g.moveTo(tipX, tipY); g.lineTo(tipX - 1.2, tipY + 5); g.lineTo(tipX + 0.6, tipY + 5); g.closePath(); g.fillStyle = S.tip; g.fill();
      g.strokeStyle = css(R.light, 0.6); g.lineWidth = 0.7; g.beginPath(); g.moveTo(bx - w + 1, 31); g.lineTo(tipX - 0.4, tipY + 1); g.stroke();
    }
  } else { // ice crystals / icicles
    const I = A.ice;
    const n = c === 13 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const bx = (c === 13 ? 5 + i * 7.3 : 6 + i * 10) + (hash(i, s, 12) - 0.5) * 2.5;
      const w = c === 13 ? 3 + hash(i, s, 13) * 1.5 : 4.5 + hash(i, s, 13) * 2;
      const h = (c === 13 ? 13 + hash(i, s, 14) * 9 : 15 + hash(i, s, 14) * 6);
      const tipY = 31.5 - h;
      g.beginPath(); g.moveTo(bx - w, 32); g.lineTo(bx, tipY); g.lineTo(bx + w, 32); g.closePath();
      const gr = g.createLinearGradient(bx - w, 0, bx + w, 0);
      gr.addColorStop(0, I.light); gr.addColorStop(0.45, I.base); gr.addColorStop(1, I.dark);
      g.fillStyle = gr; g.fill();
      g.strokeStyle = "rgba(255,255,255,0.75)"; g.lineWidth = 0.7; g.beginPath(); g.moveTo(bx - w * 0.5, 31); g.lineTo(bx - 0.3, tipY + 2); g.stroke();
    }
    g.fillStyle = css(I.light, 0.85); g.fillRect(0, 30.5, 32, 1.5);
  }
  g.restore();
}

// ------------------------------------------------------------------------------------------------------------------
// The chunk cache for one level
export function createTerrain() {
  let A = null, P = null, tex = null, W = 0, H = 0, grid = null, seed = 1, scratch = null;
  const chunks = new Map(); // key -> { cx, cy, canvas, scale, dirty, empty, used, px }
  const pool = [];
  let totalPx = 0, firstFrame = true, epoch = 0;
  const HX = 6; // extra rows baked below the level so the ground continues past the bottom edge

  const get = (x, y) => {
    if (y < 0) return EMPTY;
    if (x < 0) x = 0; else if (x >= W) x = W - 1;
    if (y >= H) y = H - 1;
    return grid[y * W + x];
  };

  function setArt(art) {
    if (A === art) return;
    A = art; tex = texturesFor(A);
    if (!scratch) scratch = makeCanvas(2, 2).getContext("2d");
    P = patternsFor(scratch, tex);
    const pv = scratch.createPattern(tex.bark, "repeat");
    if (pv && pv.setTransform && typeof DOMMatrix !== "undefined") pv.setTransform(new DOMMatrix().rotateSelf(90).scaleSelf(1 / TEX_RES, 1 / TEX_RES));
    P.barkV = pv;
  }

  function clear() {
    for (const ch of chunks.values()) if (ch.canvas) pool.push(ch.canvas);
    chunks.clear(); totalPx = 0;
  }

  function setLevel(art, w, h, codes, sd) {
    setArt(art);
    W = w; H = h; grid = new Uint8Array(codes); seed = sd | 0;
    clear(); firstFrame = true; epoch++;
  }

  function isEmptyChunk(cx, cy) {
    for (let y = cy * CH - 1; y <= cy * CH + CH; y++) for (let x = cx * CH - 1; x <= cx * CH + CH; x++) {
      const c = get(x, y); if (c !== EMPTY && c !== WATER) return false;
    }
    return true;
  }

  function bake(ch, s) {
    const size = Math.ceil(CW * s);
    let cv = ch.canvas;
    if (!cv) { cv = pool.pop() || null; }
    if (!cv) cv = makeCanvas(size, size);
    if (cv.width !== size || cv.height !== size) { cv.width = size; cv.height = size; }
    const g = cv.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, size, size);
    g.setTransform(s, 0, 0, s, -ch.cx * CW * s, -ch.cy * CW * s);
    const X0 = ch.cx * CH - MARGIN, Y0 = ch.cy * CH - MARGIN;
    bakeRegion(g, A, P, get, X0, Y0, X0 + CH - 1 + 2 * MARGIN, Y0 + CH - 1 + 2 * MARGIN, seed, s);
    totalPx += size * size - (ch.px || 0);
    ch.px = size * size; ch.canvas = cv; ch.scale = s; ch.dirty = false;
  }

  function evict(frameNo) {
    if (totalPx <= PX_BUDGET) return;
    const arr = [...chunks.values()].filter((c) => c.canvas && c.used !== frameNo).sort((a, b) => a.used - b.used);
    for (const c of arr) {
      if (totalPx <= PX_BUDGET * 0.85) break;
      pool.push(c.canvas); totalPx -= c.px; c.canvas = null; c.px = 0; chunks.delete(c.cy * 4096 + c.cx);
    }
    if (pool.length > 24) pool.length = 24;
  }

  let frameNo = 0;
  // draw visible chunks. M = {a, e, f}: device px = a * world + (e, f). view rect in world px.
  function draw(ctx, a, e, f, vx0, vy0, vx1, vy1, budgetMs, quality, mode) {
    if (!grid) return;
    frameNo++;
    let s = Math.min(quality === "low" ? 1.25 : 2, a);
    let best = SCALES[0]; for (const q of SCALES) if (Math.abs(q - s) < Math.abs(best - s)) best = q;
    s = best;
    const t0 = performance.now();
    const unlimited = firstFrame; firstFrame = false;
    const cx0 = Math.max(0, Math.floor(vx0 / CW)), cx1 = Math.min(Math.ceil(W / CH) - 1, Math.floor(vx1 / CW));
    const cy0 = Math.max(0, Math.floor(vy0 / CW)), cy1 = Math.min(Math.ceil((H + HX) / CH) - 1, Math.floor(vy1 / CW));
    let forced = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const key = cy * 4096 + cx;
      let ch = chunks.get(key);
      if (!ch) { ch = { cx, cy, canvas: null, scale: 0, dirty: true, empty: isEmptyChunk(cx, cy), used: 0, px: 0 }; chunks.set(key, ch); }
      ch.used = frameNo;
      if (ch.empty) continue;
      const need = ch.dirty || !ch.canvas || ch.scale !== s;
      if (need) {
        const late = performance.now() - t0 > budgetMs;
        // missing or edited chunks must appear now; a scale change can wait for budget
        if (unlimited || !ch.canvas || (ch.dirty && forced < 6) || !late) { if (ch.dirty && ch.canvas) forced++; bake(ch, s); }
      }
      if (!ch.canvas) continue;
      const wx = cx * CW, wy = cy * CW;
      const dx0 = Math.round(a * wx + e), dy0 = Math.round(a * wy + f);
      const dx1 = Math.round(a * (wx + CW) + e), dy1 = Math.round(a * (wy + CW) + f);
      ctx.drawImage(ch.canvas, dx0, dy0, dx1 - dx0, dy1 - dy0);
    }
    // prefetch a ring around the view while there is budget left
    if (mode !== "edit-drag") {
      for (let ring = 1; ring <= 1; ring++) {
        for (let cy = cy0 - ring; cy <= cy1 + ring; cy++) for (let cx = cx0 - ring; cx <= cx1 + ring; cx++) {
          if (performance.now() - t0 > budgetMs) break;
          if (cx < 0 || cy < 0 || cx >= Math.ceil(W / CH) || cy >= Math.ceil((H + HX) / CH)) continue;
          const key = cy * 4096 + cx;
          let ch = chunks.get(key);
          if (!ch) { ch = { cx, cy, canvas: null, scale: 0, dirty: true, empty: isEmptyChunk(cx, cy), used: frameNo, px: 0 }; chunks.set(key, ch); }
          if (ch.empty || (!ch.dirty && ch.canvas && ch.scale === s)) continue;
          bake(ch, s); ch.used = frameNo;
        }
      }
    }
    evict(frameNo);
  }

  // builder edits: copy codes for the rect, dirty every chunk whose baked margin can see it
  function updateTiles(codes, x0, y0, x1, y1) {
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) grid[y * W + x] = codes[y * W + x];
    const cx0 = Math.floor((x0 - MARGIN - 1) / CH), cx1 = Math.floor((x1 + MARGIN + 1) / CH);
    const cy0 = Math.floor((y0 - MARGIN - 1) / CH), cy1 = Math.floor((y1 + MARGIN + 1) / CH) + (y1 >= H - 1 ? Math.ceil(HX / CH) : 0);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const ch = chunks.get(cy * 4096 + cx);
      if (ch) { ch.dirty = true; ch.empty = isEmptyChunk(cx, cy); }
    }
  }

  return { setLevel, updateTiles, draw, get, clear, get grid() { return grid; }, get W() { return W; }, get H() { return H; }, get patterns() { return P; }, setArt };
}

// One tile rendered alone, for palette icons. Returns a canvas of size px (cached by caller).
export function bakeTileThumb(A, P, code, size) {
  const cv = makeCanvas(size, size), g = cv.getContext("2d");
  const s = size / T;
  g.setTransform(s, 0, 0, s, 0, 0);
  const get = (x, y) => (x === 0 && y === 0 ? code : isSlopeC(code) && x === 0 && y === 1 ? GROUND : EMPTY);
  bakeRegion(g, A, P, get, 0, 0, 0, 0, 7, s, { shadow: false });
  return cv;
}
