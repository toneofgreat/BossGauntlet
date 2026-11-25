// brutal.js - rater calibration fixture, "area 3" style: 4- and 5-tile jumps onto 1-tile thorn-ringed pillars
// with no rest, a lightning gate with a tight safe window, ice run-ups into thorn jumps, a thorn-lined low tunnel,
// fast sweeping hazards, a long stretch without a checkpoint. Expected rating 8-9.
import { makeGrid } from "../../src/levels/kit.js";

const H = 26, GY = 20;
const g = makeGrid(200, H);
g.ground(0, 199, GY);
// pillar run: 1-wide pillars, gaps 4,4,3,4 over a thorn floor
g.clear(12, 40, GY, H - 1); g.fill(12, H - 1, 40, H - 1, "#"); g.fill(12, H - 2, 40, H - 2, "^");
for (const x of [17, 22, 26, 31]) g.ground(x, x, GY, "R");
g.ground(36, 40, GY, "#");
// 5-wide jump onto a ledge at the same height over water
g.fill(41, GY, 45, H - 1, "~");
g.ground(46, 52, GY);
// lightning gate: 3-wide, safe window short
// ice run-up, then 4-wide thorn pit jump
g.fill(56, GY, 68, GY, "I");
g.clear(69, 72, GY, H - 1); g.fill(69, H - 1, 72, H - 1, "#"); g.fill(69, H - 2, 72, H - 2, "^");
g.ground(73, 77, GY);
// low tunnel lined with hanging thorns (no room to jump), its floor crumbles away
g.fill(78, GY - 3, 100, GY - 3, "R"); g.fill(78, GY - 2, 100, GY - 2, "v");
g.clear(84, 94, GY, H - 1); g.fill(84, H - 1, 94, H - 1, "~"); // crumbling floor over water inside the tunnel
g.ground(87, 87, GY, "R"); g.ground(91, 91, GY, "R");
// fast hazards over 1-wide platforms
g.clear(104, 124, GY, H - 1); g.fill(104, H - 1, 124, H - 1, "~");
for (const x of [108, 112, 116, 120]) g.ground(x, x, GY, "R");
g.ground(125, 199, GY);
// spike-ceiling 4-gap
g.clear(132, 135, GY, H - 1); g.fill(132, H - 1, 135, H - 1, "~"); g.fill(131, GY - 4, 136, GY - 4, "v");
g.clear(141, 145, GY, H - 1); g.fill(141, H - 1, 145, H - 1, "~");
g.ground(150, 150, GY - 1, "R"); g.ground(154, 154, GY - 2, "R");
g.clear(151, 153, GY, H - 1); g.fill(151, H - 1, 153, H - 1, "~");
g.clear(155, 159, GY, H - 1); g.fill(155, H - 1, 159, H - 1, "~");

export default g.level({
  name: "Fixture Brutal", theme: "storm", music: "area3",
  start: { x: 2, y: GY - 1 }, goal: { x: 190, y: GY - 1 },
  checkpoints: [{ x: 102, y: GY - 1 }],
  entities: [
    { t: "pulse", x: 53, y: GY - 4, w: 2, h: 4, kind: "lightning", period: 70, on: 42, offset: 0 },
    { t: "crumble", x: 84, y: GY, w: 3 }, { t: "crumble", x: 88, y: GY, w: 3 }, { t: "crumble", x: 92, y: GY, w: 3 },
    { t: "hazard", x: 110, y: GY - 4, r: 0.5, kind: "spark", path: [[0, 3]], speed: 5, mode: "ping" },
    { t: "hazard", x: 114, y: GY - 1, r: 0.5, kind: "spark", path: [[0, -3]], speed: 5, mode: "ping", phase: 0.25 },
    { t: "hazard", x: 118, y: GY - 4, r: 0.5, kind: "spark", path: [[0, 3]], speed: 5.5, mode: "ping", phase: 0.5 },
    { t: "hazard", x: 165, y: GY - 2, r: 0.55, kind: "spark", path: [[8, 0]], speed: 6, mode: "ping" },
  ],
});
