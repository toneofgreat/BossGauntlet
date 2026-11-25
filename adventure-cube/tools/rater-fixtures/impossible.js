// impossible.js - rater calibration fixture: a 7-tile chasm (the max running jump is 5) and nothing to help.
// Expected rating 10 (not beatable).
import { makeGrid } from "../../src/levels/kit.js";

const H = 16, GY = 12;
const g = makeGrid(60, H);
g.ground(0, 59, GY);
g.clear(24, 30);                 // 7 wide pit
g.ground(31, 59, GY);

export default g.level({
  name: "Fixture Impossible", theme: "storm", music: "area3",
  start: { x: 2, y: GY - 1 }, goal: { x: 55, y: GY - 1 },
  checkpoints: [], entities: [],
});
