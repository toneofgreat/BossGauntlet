// hard.js - rater calibration fixture between area 2 and area 3: 5-tile running jumps over thorn pits, 4-tile jumps
// up onto ledges, a fast mover, thornballs sweeping a corridor, a lightning pulse with a medium window, a crumble
// chain of single blocks, a thorn ceiling over a jump. Expected rating 6-8.
import { makeGrid } from "../../src/levels/kit.js";

const H = 26, GY = 20;
const g = makeGrid(220, H);
g.ground(0, 219, GY);
// two 5-wide thorn pits (max running jump is 5)
g.clear(14, 18, GY, H - 1); g.fill(14, H - 1, 18, H - 1, "#"); g.fill(14, H - 2, 18, H - 2, "^");
g.clear(28, 32, GY, H - 1); g.fill(28, H - 1, 32, H - 1, "#"); g.fill(28, H - 2, 32, H - 2, "^");
// 4-tile jumps up onto ledges 1 higher over water
g.fill(37, GY, 40, H - 1, "~"); g.ground(41, 44, GY - 1, "R");
g.fill(45, GY - 1, 48, H - 1, "~"); g.ground(49, 52, GY - 2, "R");
g.fill(53, GY - 2, 56, H - 1, "~"); g.ground(57, 70, GY - 2, "R");
// fast mover over a 9-wide chasm
g.clear(71, 79);
g.ground(80, 219, GY);
// thornballs sweeping a corridor (ceiling at GY-4)
g.fill(88, GY - 4, 110, GY - 4, "R");
// lightning pulse
// single-block crumble chain over a pit
g.clear(128, 141);
// thorn ceiling over a 3-wide water jump
g.fill(150, GY, 152, H - 1, "~"); g.fill(148, GY - 4, 154, GY - 4, "v");
g.fill(160, GY, 163, H - 1, "~"); g.fill(168, GY, 171, H - 1, "~");
g.set(176, GY - 1, "^").set(177, GY - 1, "^").set(178, GY - 1, "^");

export default g.level({
  name: "Fixture Hard", theme: "storm", music: "area3",
  start: { x: 2, y: GY - 1 }, goal: { x: 212, y: GY - 1 },
  checkpoints: [{ x: 60, y: GY - 3 }, { x: 120, y: GY - 1 }],
  entities: [
    { t: "mover", x: 70, y: GY - 2, w: 2, kind: "stone", path: [[9, 0]], speed: 4.5, mode: "ping" },
    { t: "hazard", x: 93, y: GY - 1, r: 0.5, kind: "thornball", path: [[0, -2]], speed: 3, mode: "ping" },
    { t: "hazard", x: 99, y: GY - 3, r: 0.5, kind: "thornball", path: [[0, 2]], speed: 3, mode: "ping" },
    { t: "hazard", x: 105, y: GY - 1, r: 0.5, kind: "thornball", path: [[0, -2]], speed: 3.5, mode: "ping", phase: 0.3 },
    { t: "pulse", x: 116, y: GY - 4, w: 2, h: 4, kind: "lightning", period: 100, on: 55, offset: 0 },
    { t: "crumble", x: 131, y: GY, w: 1 }, { t: "crumble", x: 135, y: GY, w: 1 }, { t: "crumble", x: 139, y: GY, w: 1 },
  ],
});
