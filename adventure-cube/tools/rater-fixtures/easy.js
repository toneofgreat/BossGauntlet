// easy.js - rater calibration fixture, "area 1" style: 2-3 tile streams, roomy thorn patches, a spring, a slow log
// over a stream, one-way branches, a short crumble bridge, gentle hills. Expected rating 2-3.
import { makeGrid } from "../../src/levels/kit.js";

const H = 20, GY = 15;
const g = makeGrid(190, H);
g.ground(0, 189, GY);
g.set(9, GY - 1, "R");
g.fill(16, GY, 17, H - 1, "~");                      // 2-wide stream
g.set(26, GY - 1, "^").set(27, GY - 1, "^");          // small thorn patch, lots of room
g.gentleUp(32, GY - 1, 2); g.ground(36, 41, GY - 2); g.gentleDown(42, GY - 2, 2);
g.fill(50, GY, 52, H - 1, "~");                      // 3-wide stream
g.ground(58, 63, GY - 2, "R");                       // a 2-tile rock to hop
g.fill(68, GY, 71, H - 1, "~");                      // 4-wide stream with a slow log
g.fill(78, GY, 80, H - 1, "~");                      // 3-wide stream
g.ground(88, 94, GY - 5, "R"); g.clear(88, 94, 0, GY - 6); // rock shelf: the spring at 85 goes up, then hop down
g.fill(98, GY - 3, 101, GY - 3, "-");               // branches
g.set(99, GY - 1, "^").set(100, GY - 1, "^");
g.clear(108, 111);                                    // pit with crumble bridge
g.slopeUp(118, GY - 1, 3); g.ground(121, 128, GY - 3); g.slopeDown(129, GY - 3, 3);
g.fill(138, GY, 140, H - 1, "~");
g.set(150, GY - 1, "^"); g.set(151, GY - 1, "^"); g.set(152, GY - 1, "^");
g.fill(162, GY, 163, H - 1, "~");

export default g.level({
  name: "Fixture Easy", theme: "forest", music: "area1",
  start: { x: 2, y: GY - 1 }, goal: { x: 184, y: GY - 1 },
  checkpoints: [{ x: 64, y: GY - 1 }, { x: 115, y: GY - 1 }],
  entities: [
    { t: "mover", x: 68, y: GY - 1, w: 2, kind: "log", path: [[2, 0]], speed: 1.2, mode: "ping" },
    { t: "spring", x: 85, y: GY - 1, p: 1 },
    { t: "crumble", x: 108, y: GY, w: 4 },
  ],
});
