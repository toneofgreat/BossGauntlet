// margin.js - cheap geometric safety margins used to make the route search prefer human-like, forgiving moves
// (RATER owns). NO DOM, deterministic.
//   supportMargins(sim, x, y) -> { l, r } px the cube could stand further left / right of (x, y) on the same
//   continuous, hazard-free ground (follows slopes and small steps, stops at gaps, walls, spikes, water). Capped.
//   failProb(windowFrames, sigma) -> chance that a human with timing noise sigma misses a window of that size.
import { T, PW, PH, TILE, isFullSolid, isSlope, slopeH, SPIKE_RECT, HURT_INSET, WATER_TOP_INSET } from "../sim/index.js";

const CAP = 72, STEP = 4;

function surfaceUnder(sim, xx, feetPrev) {
  const lo = feetPrev - 9, hi = feetPrev + 12;
  let best = Infinity;
  const c0 = Math.floor(xx / T), c1 = Math.floor((xx + PW - 0.001) / T);
  const r0 = Math.floor(lo / T), r1 = Math.floor(hi / T);
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
    const k = sim.tileAt(c, r);
    let top;
    if (isFullSolid(k) || k === TILE.ONEWAY) top = r * T;
    else if (isSlope(k)) {
      const cl = c * T, a = Math.max(xx, cl), b = Math.min(xx + PW, cl + T);
      if (b <= a) continue;
      top = (r + 1) * T - Math.max(slopeH(k, (a - cl) / T), slopeH(k, (b - cl) / T));
    } else continue;
    if (top >= lo && top <= hi && top < best) best = top;
  }
  return best;
}

function hazardAt(sim, x, y) {
  const hl = x + HURT_INSET, ht = y + HURT_INSET, hr = x + PW - HURT_INSET, hb = y + PH - HURT_INSET;
  const c0 = Math.floor(hl / T), c1 = Math.floor((hr - 0.001) / T), r0 = Math.floor(ht / T), r1 = Math.floor((hb - 0.001) / T) + 1;
  for (let ty = r0; ty <= r1; ty++) for (let tx = c0; tx <= c1; tx++) {
    const k = sim.tileAt(tx, ty);
    if (k < 12 || k > 16) continue;
    const ox = tx * T, oy = ty * T;
    if (k === TILE.WATER) {
      const top = oy + (sim.tileAt(tx, ty - 1) === TILE.WATER ? 0 : WATER_TOP_INSET);
      if (hl < ox + T && hr > ox && ht < oy + T && hb + 2 > top) return true;
    } else {
      const q = SPIKE_RECT[k];
      // 3 px extra all around: "touching distance" is not safe for a human
      if (hl - 3 < ox + q[2] && hr + 3 > ox + q[0] && ht - 3 < oy + q[3] && hb + 3 > oy + q[1]) return true;
    }
  }
  return false;
}

export function supportMargins(sim, x, y) {
  const feet0 = y + PH;
  const scan = (dir) => {
    let f = feet0, m = 0;
    for (let k = 1; k * STEP <= CAP; k++) {
      const xx = x + dir * k * STEP;
      const nf = surfaceUnder(sim, xx, f);
      if (nf === Infinity) break;
      if (sim.solidRectHit(xx, nf - PH, xx + PW, nf - 0.5)) break; // wall
      if (hazardAt(sim, xx, nf - PH)) break;
      f = nf; m = k * STEP;
    }
    return m;
  };
  if (hazardAt(sim, x, y)) return { l: 0, r: 0 };
  return { l: scan(-1), r: scan(1) };
}

// erfc approximation (Abramowitz-Stegun 7.1.26), |error| < 1.5e-7
function erfc(x) {
  const t = 1 / (1 + 0.3275911 * x);
  const y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return y * Math.exp(-x * x);
}
export function failProb(w, sigma) {
  if (w <= 0) return 1;
  return erfc(w / 2 / (sigma * Math.SQRT2));
}
