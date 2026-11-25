// kit.js - optional helpers for writing level data in code (AREA agents may use or ignore). NO DOM.
// All coordinates are tile coordinates, +y down, inclusive ranges.
//   const g = makeGrid(300, 30);
//   g.ground(0, 40, 26);            // columns 0..40 solid from row 26 to the bottom
//   g.slopeUp(41, 25, 4);           // 45 deg ramp: '/' at (41,25),(42,24),(43,23),(44,22), filled below
//   g.level({ name, theme, music, start, goal, checkpoints, entities })  -> a level object
import { LEVEL_VERSION } from "../sim/level.js";

export function makeGrid(w, h, fillCh = ".") {
  const rows = [];
  for (let y = 0; y < h; y++) rows.push(new Array(w).fill(fillCh));
  const inB = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const g = {
    w, h, rows,
    get(x, y) { return inB(x, y) ? rows[y][x] : "."; },
    set(x, y, ch) { if (inB(x, y)) rows[y][x] = ch; return g; },
    fill(x0, y0, x1, y1, ch) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) g.set(x, y, ch);
      return g;
    },
    // solid from row top to the bottom of the level for columns x0..x1
    ground(x0, x1, top, ch = "#") { return g.fill(x0, top, x1, h - 1, ch); },
    // clear columns x0..x1 completely (a pit), or to a row: clear(x0,x1,y0,y1)
    clear(x0, x1, y0 = 0, y1 = h - 1) { return g.fill(x0, y0, x1, y1, "."); },
    // 45 deg ramp rising to the right: n slope tiles, the first at (x, y); ground filled below each.
    slopeUp(x, y, n, ch = "#") {
      for (let i = 0; i < n; i++) { g.set(x + i, y - i, "/"); g.fill(x + i, y - i + 1, x + i, h - 1, ch); }
      return g;
    },
    // 45 deg ramp falling to the right: first '\' at (x, y), next at (x+1, y+1) ...
    slopeDown(x, y, n, ch = "#") {
      for (let i = 0; i < n; i++) { g.set(x + i, y + i, "\\"); g.fill(x + i, y + i + 1, x + i, h - 1, ch); }
      return g;
    },
    // 22.5 deg ramp rising right: n rows of height, 2 tiles per row ('a','b'); first 'a' at (x, y).
    gentleUp(x, y, n, ch = "#") {
      for (let i = 0; i < n; i++) {
        g.set(x + 2 * i, y - i, "a"); g.set(x + 2 * i + 1, y - i, "b");
        g.fill(x + 2 * i, y - i + 1, x + 2 * i + 1, h - 1, ch);
      }
      return g;
    },
    // 22.5 deg ramp falling right ('c','d'); first 'c' at (x, y).
    gentleDown(x, y, n, ch = "#") {
      for (let i = 0; i < n; i++) {
        g.set(x + 2 * i, y + i, "c"); g.set(x + 2 * i + 1, y + i, "d");
        g.fill(x + 2 * i, y + i + 1, x + 2 * i + 1, h - 1, ch);
      }
      return g;
    },
    toRows() { return rows.map((r) => r.join("")); },
    level(meta) {
      return Object.assign({
        v: LEVEL_VERSION, name: "Untitled", author: "", theme: "forest", music: "area1",
        checkpoints: [], entities: [],
      }, meta, { w, h, tiles: g.toRows() });
    },
  };
  return g;
}
