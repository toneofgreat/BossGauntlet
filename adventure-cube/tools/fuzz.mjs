// fuzz.mjs - random hills (45/22.5 slopes, 2-tile steps) + random inputs; asserts no overlap with solids,
// never below the ground surface, no deaths.   node tools/fuzz.mjs [seed] [ceil]
import { createSim, emptyLevel, T, PW, PH, IN_LEFT as L, IN_RIGHT as R, IN_JUMP as J, isFullSolid, isSlope, slopeH, charToCode } from "../src/sim/index.js";
let seed = +process.argv[2] || 7; const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
let viol = 0, deaths = 0, frames = 0, under = 0;
for (let trial = 0; trial < 40; trial++) {
  const w = 160, h = 24; const rows = []; for (let y = 0; y < h; y++) rows.push(new Array(w).fill("."));
  let top = 18; // surface row (first solid row)
  for (let x = 0; x < w; ) {
    const r = rnd();
    const fillCol = (cx, t) => { for (let y = t; y < h; y++) rows[y][cx] = "#"; };
    if (r < 0.4 || x < 6 || x > w - 8) { fillCol(x, top); x++; }
    else if (r < 0.55 && top > 8) { rows[top - 1][x] = "/"; fillCol(x, top); top--; x++; }
    else if (r < 0.7 && top < 20) { rows[top][x] = "\\"; fillCol(x, top + 1); top++; x++; }
    else if (r < 0.78 && top > 8 && x < w - 2) { rows[top - 1][x] = "a"; rows[top - 1][x + 1] = "b"; fillCol(x, top); fillCol(x + 1, top); top--; x += 2; }
    else if (r < 0.86 && top < 20 && x < w - 2) { rows[top][x] = "c"; rows[top][x + 1] = "d"; fillCol(x, top + 1); fillCol(x + 1, top + 1); top++; x += 2; }
    else if (r < 0.93 && top > 9) { top -= 2; fillCol(x, top); x++; }
    else if (top < 19) { top += 2; fillCol(x, top); x++; }
    else { fillCol(x, top); x++; }
  }
  if (process.argv[3] === "ceil") for (let x = 8; x < w - 8; x++) { if (rnd() < 0.35) { let t = 0; while (t < h - 1 && rows[t][x] === ".") t++; const cy = t - 3 - ((rnd() * 2) | 0); if (cy > 1) rows[cy][x] = rnd() < 0.5 ? "R" : "-"; } }
  const lv = emptyLevel({ w, h }); lv.tiles = rows.map((r) => r.join("")); lv.goal = { x: w - 2, y: 0 };
  // start above surface at column 3
  let sy = 0; while (rows[sy + 1][3] === ".") sy++; lv.start = { x: 3, y: sy };
  const s = createSim(lv, { events: false });
  let inp = R, hold = 0;
  for (let i = 0; i < 4000; i++) {
    if (hold-- <= 0) { const q = rnd(); inp = q < 0.5 ? R : q < 0.7 ? R | J : q < 0.85 ? L : q < 0.93 ? L | J : (q < 0.97 ? 0 : J); hold = (rnd() * 30) | 0; }
    s.step(inp); frames++;
    if (s.state.dead) { deaths++; console.log("death", trial, i, s.state.deathCause, s.state.x/T, s.state.y/T); break; }
    if (s.solidRectHit(s.state.x + 0.5, s.state.y + 0.5, s.state.x + PW - 0.5, s.state.y + PH - 0.5)) { viol++; if (viol < 6) console.log("overlap solid", trial, i, (s.state.x/T).toFixed(2), (s.state.y/T).toFixed(2), s.state.vx, s.state.vy); }
    // center column surface check
    const cx = s.state.x + PW / 2, tx = Math.floor(cx / T); let surf = 1e9;
    for (let y = Math.max(0, Math.floor(s.state.y / T)); y < h; y++) { const k = charToCode(rows[y][tx]); if (k === 5) continue; if (isFullSolid(k)) { surf = Math.min(surf, y * T); break; } if (isSlope(k)) { surf = (y + 1) * T - slopeH(k, (cx - tx * T) / T); break; } }
    if (s.state.y + PH > surf + 1) { under++; if (under < 6) console.log("below surface", trial, i, (s.state.x/T).toFixed(2), s.state.y + PH - surf); }
    if (s.state.won) break;
  }
}
console.log({ frames, viol, deaths, under });
