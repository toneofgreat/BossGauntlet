// art.js - shared painterly brushes used at bake time: leafy foliage masses lit from the theme's light, and soft
// cumulus clouds. Pure canvas drawing (no per-frame use).
import { clamp, css, mix } from "./util.js";

const TAU = Math.PI * 2;

// a scatter of small leaf ellipses inside a disc, filled in ONE path
function leaves(g, x, y, R, n, col, s, r, squash = 0.82) {
  g.fillStyle = col; g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * R;
    const lx = x + Math.cos(a) * d, ly = y + Math.sin(a) * d * squash, ang = r() * TAU, ss = s * (0.7 + r() * 0.6);
    g.moveTo(lx + Math.cos(ang) * ss, ly + Math.sin(ang) * ss);
    g.ellipse(lx, ly, ss, ss * 0.52, ang, 0, TAU);
  }
  g.fill();
}

// cols: [deepest shadow, shadow, mid, lit, highlight]
// opts: clusters, leaf (leaf size), per (leaves per pass), cr (cluster radius factor), holes
export function paintFoliage(g, cx, cy, rx, ry, cols, L, r, o = {}) {
  const n = o.clusters || 12, leaf = o.leaf || 4.5, per = o.per || 30, cr = o.cr || 1;
  const C = [];
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 0.72;
    C.push([cx + Math.cos(a) * d * rx, cy + Math.sin(a) * d * ry, (0.3 + r() * 0.2) * Math.min(rx, ry) * cr * 1.2]);
  }
  const m = Math.max(rx, ry);
  const lit = (c) => clamp(((c[0] - cx) * L.x + (c[1] - cy) * L.y) / m * 0.75 + 0.5, 0, 1);
  C.sort((p, q) => lit(p) - lit(q));
  // a dark core so the mass reads as one volume
  leaves(g, cx, cy + ry * 0.1, Math.min(rx, ry) * 0.75, per * 2, cols[0], leaf * 1.6, r);
  for (const c of C) {
    const k = lit(c), R = c[2];
    leaves(g, c[0], c[1], R, per, cols[0], leaf, r);
    leaves(g, c[0] + L.x * R * 0.14, c[1] + L.y * R * 0.14, R * 0.86, per, k > 0.25 ? cols[1] : cols[0], leaf, r);
    leaves(g, c[0] + L.x * R * 0.3, c[1] + L.y * R * 0.3, R * 0.62, per * 0.8, k > 0.5 ? cols[2] : cols[1], leaf, r);
    if (k > 0.4) leaves(g, c[0] + L.x * R * 0.46, c[1] + L.y * R * 0.46, R * 0.38, per * 0.55, k > 0.72 ? cols[3] : cols[2], leaf * 0.95, r);
    if (k > 0.7 && cols[4]) leaves(g, c[0] + L.x * R * 0.58, c[1] + L.y * R * 0.58, R * 0.2, per * 0.3, cols[4], leaf * 0.8, r);
  }
}

// soft cumulus cloud: shaded underside first, then lit puffs; no dark outlines
export function paintCloud(g, x, y, w, color, shadeCol, alpha, r, storm = false) {
  const n = storm ? 22 : 16;
  const puffs = [];
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1;
    const bx = x + u * w * 0.5, rr = w * (0.09 + r() * 0.11) * (1 - Math.abs(u) * 0.45);
    const by = y - rr * (0.2 + r() * 0.9) * (1 - Math.abs(u) * 0.5);
    puffs.push([bx, by, rr]);
  }
  for (const [bx, by, rr] of puffs) { // underside
    const gr = g.createRadialGradient(bx, by + rr * 0.35, 0, bx, by + rr * 0.35, rr * 1.15);
    gr.addColorStop(0, css(shadeCol, alpha * 0.75)); gr.addColorStop(1, css(shadeCol, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(bx, by + rr * 0.35, rr * 1.15, 0, TAU); g.fill();
  }
  for (const [bx, by, rr] of puffs) { // lit body, brighter toward the top
    const gr = g.createRadialGradient(bx, by - rr * 0.3, 0, bx, by, rr);
    gr.addColorStop(0, css(color, alpha)); gr.addColorStop(0.55, css(mix(color, shadeCol, 0.3), alpha * 0.8)); gr.addColorStop(1, css(mix(color, shadeCol, 0.5), 0));
    g.fillStyle = gr; g.beginPath(); g.arc(bx, by, rr, 0, TAU); g.fill();
  }
}
