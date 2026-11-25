// nav.js - coarse tile-level navigation for the AI rater (RATER owns). NO DOM, deterministic.
//
// buildNav(sim) precomputes per-cell flags from the compiled level:
//   pass  - a 1-tile cube could be in this cell (not full solid, not spikes/water)
//   stand - pass + something to stand on (solid/crumble/one-way/slope below, a slope in the cell, a mover path)
//   fly   - pass + within jump reach of a stand cell (3 columns either side, up to 3 rows above), or inside a
//           spring's launch column. Upward / sideways travel is only allowed through fly/stand cells, so the
//           field never routes "through the sky" over a wall the cube cannot jump.
// fieldTo(nav, cells) -> Float64Array distance (in tiles, weighted) from every cell to the nearest target cell,
// computed with a reverse Dijkstra over the forward moves: sideways (cost 1, into fly/stand), up (1.5, into fly),
// down (1, any pass cell), diagonal down (1.4, any pass cell).
import { T, isFullSolid, isSlope, isHazardTile, TILE } from "../sim/index.js";

export function buildNav(sim) {
  const C = sim.compiled, W = C.W, H = C.H, grid = C.grid;
  const N = W * H;
  const pass = new Uint8Array(N), stand = new Uint8Array(N), fly = new Uint8Array(N), danger = new Uint8Array(N);
  const crumbleCell = new Uint8Array(N);
  for (const k of C.crumbles) {
    const cx = Math.floor(k.x / T), cy = Math.floor(k.y / T), cw = Math.round(k.w / T);
    for (let i = 0; i < cw; i++) if (cx + i < W && cy >= 0 && cy < H) crumbleCell[cy * W + cx + i] = 1;
  }
  const code = (x, y) => (x < 0 || x >= W ? TILE.ROCK : y < 0 || y >= H ? 0 : grid[y * W + x]);
  const supports = (x, y) => {
    if (y >= H) return false;
    if (y < 0) return false;
    const k = code(x, y);
    return isFullSolid(k) || isSlope(k) || k === TILE.ONEWAY || crumbleCell[y * W + x] === 1;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = grid[y * W + x];
    const i = y * W + x;
    if (isFullSolid(k) || isHazardTile(k)) { pass[i] = 0; continue; }
    pass[i] = 1;
    if (isSlope(k) || supports(x, y + 1)) stand[i] = 1;
    if (crumbleCell[i]) { stand[i] = 0; }
  }
  // crumble cells are passable (they break) but not standable themselves; the cell above them is standable
  for (let i = 0; i < N; i++) if (crumbleCell[i]) pass[i] = 1;
  // movers: every cell along the path (sampled) becomes a stand cell above the platform
  const tmp = { x: 0, y: 0 };
  for (let m = 0; m < C.movers.length; m++) {
    const P = sim.compiled.movers[m].P;
    const wT = Math.max(1, Math.round(C.movers[m].w / T));
    const cyc = P && P.speed > 0 && P.total > 0 ? Math.ceil(P.cycle / P.speed) : 1;
    const stepF = Math.max(1, Math.floor(cyc / 64));
    for (let f = 0; f <= cyc; f += stepF) {
      sim.moverPos(m, f, tmp);
      const cx = Math.floor(tmp.x / T), cy = Math.floor(tmp.y / T) - 1;
      for (let i = 0; i < wT; i++) {
        const x = cx + i;
        if (x >= 0 && x < W && cy >= 0 && cy < H && pass[cy * W + x]) stand[cy * W + x] = 1;
      }
    }
  }
  // fly band: prefix sums of stand for O(1) rect queries
  const S = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) { row += stand[y * W + x]; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + row; }
  }
  const rect = (x0, y0, x1, y1) => {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
    if (x0 > x1 || y0 > y1) return 0;
    return S[(y1 + 1) * (W + 1) + x1 + 1] - S[y0 * (W + 1) + x1 + 1] - S[(y1 + 1) * (W + 1) + x0] + S[y0 * (W + 1) + x0];
  };
  // fly (sideways travel): within 3 columns of ground that is 0..2 rows below. up (climbing into the cell): ground
  // 1..2 rows below within one column. So a full jump (2.73 tiles) is the most the field ever climbs per surface.
  const up = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!pass[i]) continue;
    if (stand[i] || rect(x - 3, y, x + 3, y + 2) > 0) fly[i] = 1;
    if (rect(x - 1, y + 1, x + 1, y + 2) > 0) up[i] = 1;
  }
  // springs: a launch column above the mushroom. Cells that are only in reach thanks to the spring are marked
  // springOnly (spring index + 1): the field reaches them only through the spring itself (or from each other),
  // so the search is not lured to jump apexes next to the column.
  const springOnly = new Uint16Array(N), springRegion = new Uint16Array(N), springBase = [];
  C.springs.forEach((k, si) => {
    const sx = Math.floor(k.x / T), sy = Math.floor(k.y / T);
    springBase.push(sy * W + sx);
    const hT = Math.ceil(6.6 * k.p * k.p) + 2;
    for (let dy = 0; dy <= hT; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = sx + dx, y = sy - dy;
      if (!(x >= 0 && x < W && y >= 0 && y < H && pass[y * W + x])) continue;
      springRegion[y * W + x] = si + 1;
      if (!up[y * W + x] && !stand[y * W + x]) { fly[y * W + x] = 1; springOnly[y * W + x] = si + 1; }
    }
  });
  // danger: cells touching a spike/water tile (8-neighbourhood)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isHazardTile(grid[y * W + x])) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < W && yy >= 0 && yy < H) danger[yy * W + xx] = 1;
    }
  }
  const springCaps = C.springs.map((k) => ({ l: k.x + 3, r: k.x + T - 3, y: k.y + 14 }));
  return { W, H, pass, stand, fly, up, danger, springOnly, springRegion, springBase, springCaps };
}

// Small binary heap keyed by Float64 priority (used by fieldTo and the search).
export class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length; k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
  peekKey() { return this.k[0]; }
}

// Reverse Dijkstra. targets: array of [x, y] cells. Returns Float64Array (Infinity = unreachable).
export function fieldTo(nav, targets) {
  const { W, H, pass, stand, fly, up, springOnly: so, springBase } = nav;
  const N = W * H;
  const d = new Float64Array(N).fill(Infinity);
  const h = new Heap();
  for (const [x, y] of targets) {
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    const i = y * W + x;
    d[i] = 0; h.push(0, i);
  }
  const relax = (a, nd) => { if (nd < d[a]) { d[a] = nd; h.push(nd, a); } };
  while (h.size) {
    const dk = h.peekKey();
    const b = h.pop();
    if (dk > d[b]) continue;
    const bx = b % W, by = (b - bx) / W;
    const bFly = fly[b] || stand[b];
    const bs = so[b];
    // forward A -> B. A sideways of B: allowed if B is fly/stand (spring-only B: only from spring-only A)
    if (bFly) {
      if (bx > 0 && pass[b - 1] && (!bs || so[b - 1])) relax(b - 1, dk + 1);
      if (bx < W - 1 && pass[b + 1] && (!bs || so[b + 1])) relax(b + 1, dk + 1);
    }
    // A below B (moving up into B): needs ground close below B (or a spring launch)
    if ((up[b] || bs) && by < H - 1 && pass[b + W] && (!bs || so[b + W])) relax(b + W, dk + 1.5);
    // spring launch: from the mushroom's cell straight up its column
    if (bs) {
      const base = springBase[bs - 1], sx = base % W, sy = (base - sx) / W;
      relax(base, dk + 1 + 0.5 * Math.max(0, sy - by) + Math.abs(sx - bx));
    }
    // A above B (falling into B): always
    if (by > 0) {
      const a = b - W;
      if (pass[a]) relax(a, dk + 1);
      if (bx > 0 && pass[a - 1]) relax(a - 1, dk + 1.4);
      if (bx < W - 1 && pass[a + 1]) relax(a + 1, dk + 1.4);
    }
  }
  return d;
}

// Field value (tiles) at a player position (top-left px). Falls back to cells below / beside for cells the
// field cannot reach (e.g. high in a spring launch or above row 0).
// springing = the cube is rising from a spring launch: only then do spring-only cells count as progress; a normal
// jump into the spring column is valued as "back at the mushroom" plus the height.
export function fieldAt(nav, F, px, py, springing) {
  const { W, H } = nav;
  const cx = Math.floor((px + 13) / T);
  let cy = Math.floor((py + 13) / T);
  if (cx < 0 || cx >= W) return 1e4;
  if (cy < 0) cy = 0;
  if (cy >= H) return 1e4;
  const sr0 = nav.springRegion[cy * W + cx];
  if (sr0 && !springing) {
    // above the mushroom's cap (about to come down on it): as good as being launched from it
    const cap = nav.springCaps[sr0 - 1];
    if (px < cap.r && px + 26 > cap.l && py + 26 <= cap.y + 2) return F[nav.springBase[sr0 - 1]] - 0.5;
  }
  const so = nav.springOnly[cy * W + cx];
  if (so && !springing) {
    const base = nav.springBase[so - 1], bx = base % W, by = (base - bx) / W;
    return F[base] + Math.abs(cx - bx) + Math.abs(cy - by);
  }
  const sr = springing ? nav.springRegion[cy * W + cx] : 0;
  if (sr) { // rising from a launch: best cell of the launch column still ahead (above), plus steering to it
    const base = nav.springBase[sr - 1], bx = base % W;
    const fy = (py + 13) / T, fx = (px + 13) / T - 0.5;
    let v = Infinity;
    for (let y = cy; y >= 0; y--) {
      let any = false;
      for (let x = bx - 3; x <= bx + 3; x++) {
        if (x < 0 || x >= W) continue;
        const i = y * W + x;
        if (nav.springRegion[i] !== sr && !(nav.springRegion[i] === 0 && nav.fly[i] && Math.abs(x - bx) === 3)) continue;
        any = true;
        const f = F[i];
        if (f === Infinity) continue;
        const c = f + 0.5 * Math.max(0, fy - y - 0.5) + Math.abs(x - fx);
        if (c < v) v = c;
      }
      if (!any) break;
    }
    const c = F[cy * W + cx];
    if (v < c || c === Infinity) return v;
  }
  let base = Infinity, by = cy;
  for (let dy = 0; dy < 6 && cy + dy < H; dy++) {
    const v = F[(cy + dy) * W + cx];
    if (v < Infinity) { base = v + dy * 1.2; by = cy + dy; break; }
  }
  if (base === Infinity) return 1e4;
  // bilinear-ish refinement toward the neighbouring cells so progress inside one tile still counts
  const fx = (px + 13) / T - cx - 0.5, fy = by === cy ? (py + 13) / T - cy - 0.5 : 0;
  const nb = (x, y) => { if (x < 0 || x >= W || y < 0 || y >= H) return base + 1; const v = F[y * W + x]; return v < Infinity ? v + (base - F[by * W + cx]) : base + 1; };
  const hx = fx >= 0 ? nb(cx + 1, by) : nb(cx - 1, by);
  const hy = fy >= 0 ? nb(cx, by + 1) : nb(cx, by - 1);
  const ax = Math.abs(fx), ay = Math.abs(fy);
  return base + (Math.min(hx, base + 1) - base) * ax + (Math.min(hy, base + 1) - base) * ay * 0.5;
}
