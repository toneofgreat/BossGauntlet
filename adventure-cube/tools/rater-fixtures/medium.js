// medium.js - rater calibration fixture, "area 2" style: running 4-tile jumps over rapids onto short rocks, a
// single-block crumble chain, a log over a chasm, a cliff climb, a spring up a cliff, two patrolling wasps, a steam
// vent with a long window, an ice patch before a pool. Expected rating 4-6.
import { makeGrid } from "../../src/levels/kit.js";

const H = 28, GY = 22;
const g = makeGrid(240, H);
g.ground(0, 239, GY);
// rapids: 4-wide gaps onto 2-wide rocks
g.fill(14, GY, 17, H - 1, "~"); g.fill(20, GY, 23, H - 1, "~"); g.fill(26, GY, 29, H - 1, "~");
g.fill(18, GY, 19, GY, "R"); g.fill(24, GY, 25, GY, "R");
g.fill(38, GY, 41, H - 1, "~");
// crumble chain over a pit: single blocks, 2-tile gaps
g.clear(50, 63);
// log across a 7-wide chasm
g.clear(72, 78);
// cliff climb: 2-tile steps, narrow
g.ground(86, 87, GY - 2, "R"); g.ground(88, 89, GY - 4, "R"); g.ground(90, 91, GY - 6, "R"); g.ground(92, 104, GY - 8, "R");
g.fill(105, GY, 110, H - 1, "~");
g.ground(111, 239, GY);
// spring up a 6-high cliff
g.ground(122, 135, GY - 6, "R");
g.ground(136, 239, GY);
// thorn strip under the wasps
g.fill(143, GY - 1, 144, GY - 1, "^"); g.fill(150, GY - 1, 151, GY - 1, "^");
// ice patch then pools
g.fill(170, GY, 182, GY, "I");
g.fill(183, GY, 186, H - 1, "~");
g.fill(196, GY, 199, H - 1, "~"); g.fill(200, GY, 201, GY, "R"); g.fill(202, GY, 205, H - 1, "~");
g.set(214, GY - 1, "^").set(215, GY - 1, "^");

export default g.level({
  name: "Fixture Medium", theme: "highlands", music: "area2",
  start: { x: 2, y: GY - 1 }, goal: { x: 232, y: GY - 1 },
  checkpoints: [{ x: 46, y: GY - 1 }, { x: 140, y: GY - 1 }],
  entities: [
    { t: "crumble", x: 52, y: GY, w: 1 }, { t: "crumble", x: 55, y: GY, w: 1 }, { t: "crumble", x: 58, y: GY, w: 1 }, { t: "crumble", x: 61, y: GY, w: 1 },
    { t: "mover", x: 71, y: GY, w: 2, kind: "log", path: [[6, 0]], speed: 2.5, mode: "ping" },
    { t: "spring", x: 119, y: GY - 1, p: 1.1 },
    { t: "hazard", x: 146, y: GY - 5, r: 0.45, kind: "wasp", path: [[0, 4]], speed: 2.5, mode: "ping" },
    { t: "hazard", x: 154, y: GY - 1, r: 0.45, kind: "wasp", path: [[0, -4]], speed: 2.5, mode: "ping", phase: 0.3 },
    { t: "pulse", x: 160, y: GY - 3, w: 2, h: 3, kind: "steam", period: 150, on: 60, offset: 0 },
  ],
});
