// trivial.js - rater calibration fixture: walk right, two small hops, nothing can kill you. Expected rating 1.
import { makeGrid } from "../../src/levels/kit.js";

const H = 16, GY = 12;
const g = makeGrid(70, H);
g.ground(0, 69, GY);
g.set(14, GY - 1, "R");                   // a pebble
g.ground(26, 33, GY - 1);                 // a 1-tile step up
g.set(42, GY - 1, "W").set(42, GY - 2, "W"); // a 2-tile stump
g.slopeUp(50, GY - 1, 2); g.ground(52, 55, GY - 2); g.slopeDown(56, GY - 2, 2);

export default g.level({
  name: "Fixture Trivial", theme: "forest", music: "area1",
  start: { x: 2, y: GY - 1 }, goal: { x: 66, y: GY - 1 },
  checkpoints: [], entities: [],
});
