// path.js - deterministic piecewise-linear paths for movers and moving hazards. NO DOM, no trig.
// An entity with a path: { x, y, path: [[dx,dy], ...], speed, mode: 'loop'|'ping', phase }
//   x,y        anchor tile (the first point, offset [0,0], is implicit)
//   path       further points as tile offsets from the anchor (1..8 points)
//   speed      tiles per second along the path (default 2)
//   mode       'ping' (default): back and forth. 'loop': last point returns straight to the first.
//   phase      0..1 start offset as a fraction of one full cycle (default 0)
// Position is a pure function of the frame number, so snapshots never need to store it.
import { T, FPS } from "./constants.js";

export function makePath(ent) {
  const pts = [[0, 0]];
  const raw = Array.isArray(ent.path) ? ent.path : [];
  for (const p of raw) pts.push([p[0] * T, p[1] * T]);
  const mode = ent.mode === "loop" ? "loop" : "ping";
  if (mode === "loop" && pts.length > 1) pts.push([0, 0]);
  const seg = [];
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1];
    const l = Math.sqrt(dx * dx + dy * dy);
    seg.push(l);
    total += l;
  }
  const speed = (typeof ent.speed === "number" ? ent.speed : 2) * T / FPS; // px per frame
  const cycle = mode === "loop" ? total : total * 2;
  const phase = typeof ent.phase === "number" ? ent.phase : 0;
  return { pts, seg, total, speed, mode, cycle, phase, ox: ent.x * T, oy: ent.y * T };
}

// Writes the anchor's world px position at frame f into out {x, y} (top-left of the anchor tile + offset).
export function pathPos(P, f, out) {
  if (P.total <= 0 || P.speed <= 0) { out.x = P.ox; out.y = P.oy; return out; }
  let d = f * P.speed + P.phase * P.cycle;
  d = d - Math.floor(d / P.cycle) * P.cycle;
  if (P.mode === "ping" && d > P.total) d = P.cycle - d;
  let i = 0;
  while (i < P.seg.length - 1 && d > P.seg[i]) { d -= P.seg[i]; i++; }
  const l = P.seg[i];
  const k = l > 0 ? Math.min(1, d / l) : 0;
  const a = P.pts[i], b = P.pts[i + 1];
  out.x = P.ox + a[0] + (b[0] - a[0]) * k;
  out.y = P.oy + a[1] + (b[1] - a[1]) * k;
  return out;
}
