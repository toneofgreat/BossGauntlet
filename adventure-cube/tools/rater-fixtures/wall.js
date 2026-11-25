// wall.js - rater calibration fixture: a 3-tile wall (a full jump is 2.73 tiles) with nothing to help.
// Expected rating 10 (not beatable).
import { makeGrid } from "../../src/levels/kit.js";

const H = 16, GY = 12;
const g = makeGrid(50, H);
g.ground(0, 49, GY);
g.ground(25, 49, GY - 3, "R");

export default g.level({
  name: "Fixture Wall", theme: "forest", music: "area1",
  start: { x: 2, y: GY - 1 }, goal: { x: 45, y: GY - 4 },
  checkpoints: [], entities: [],
});
