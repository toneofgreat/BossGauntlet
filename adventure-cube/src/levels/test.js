// test.js - the foundation's placeholder/test level: one of every mechanic, short and easy.
// Used by tools/simtest.mjs (with a scripted solution) and as the "Test level" until the areas exist.
import { makeGrid } from "./kit.js";

const H = 20, GY = 16; // ground surface row (tiles 16..19 are ground)
const g = makeGrid(110, H);
g.ground(0, 13, GY);
g.set(10, GY - 1, "R");                 // a rock to hop over
g.fill(14, GY, 16, H - 1, "~");          // stream (3 wide)
g.ground(17, 19, GY);
g.slopeUp(20, GY - 1, 4);                // ramp up to a plateau on row 12
g.ground(24, 29, GY - 4);
g.slopeDown(30, GY - 4, 4);              // ramp back down
g.ground(34, 49, GY);
g.set(38, GY - 1, "^").set(39, GY - 1, "^");   // thorns
g.ground(44, 48, 10, "R");               // high rock shelf reached with the mushroom spring at x=42
g.clear(44, 48, 0, 9);
g.ground(54, 61, GY);
g.clear(56, 59, 0, H - 1);               // pit spanned by a crumble bridge
g.ground(62, 110 - 1, GY);
g.fill(64, GY - 3, 66, GY - 3, "-");     // a branch (one-way)
g.gentleUp(72, GY - 1, 2);               // gentle hill up
g.ground(76, 77, GY - 2);
g.gentleDown(78, GY - 2, 2);
g.fill(84, GY, 92, GY, "I");             // ice patch
g.fill(102, 0, 109, 0, ".");

export default g.level({
  name: "Test Grove",
  author: "foundation",
  theme: "forest",
  music: "area1",
  start: { x: 2, y: GY - 1 },
  goal: { x: 104, y: GY - 1 },
  checkpoints: [{ x: 26, y: GY - 5 }, { x: 63, y: GY - 1 }],
  entities: [
    { t: "sign", x: 4, y: GY - 1, text: "Arrows / A D to move, Space to jump" },
    { t: "spring", x: 42, y: GY - 1, p: 1 },
    { t: "mover", x: 50, y: GY, w: 2, kind: "log", path: [[2, 0]], speed: 1.5, mode: "ping" },
    { t: "crumble", x: 56, y: GY, w: 4 },
    { t: "hazard", x: 68, y: GY - 5, r: 0.45, kind: "thornball", path: [[0, 4]], speed: 2, mode: "ping" },
    { t: "pulse", x: 80, y: GY - 3, w: 1, h: 3, kind: "geyser", period: 120, on: 30, offset: 0 },
    { t: "deco", x: 7, y: GY - 1, kind: "oak", s: 1.2, layer: "back" },
    { t: "deco", x: 35, y: GY - 1, kind: "fern", s: 1, layer: "front" },
  ],
});
