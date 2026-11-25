// spacing/make.js - rater stability fixtures (RATER): flat ground with N identical 3-wide floor thorn patches,
// `gap` tiles apart. A human can stop on the runway between patches and take each one alone, so the rating
// must not depend much on the spacing (it used to swing 1 <-> 5 <-> 9). Used by tools/rate.mjs --spacing.
import { makeGrid } from "../../../src/levels/kit.js";

export function spacingLevel(n, gap, wide = 3) {
  const H = 16, GY = 12, x0 = 14;
  const W = Math.max(40, x0 + n * gap + 16);
  const g = makeGrid(W, H);
  g.ground(0, W - 1, GY);
  for (let i = 0; i < n; i++) for (let k = 0; k < wide; k++) g.set(x0 + i * gap + k, GY - 1, "^");
  return g.level({ name: `Spacing ${n}x${gap}`, theme: "forest", music: "area1", start: { x: 2, y: GY - 1 }, goal: { x: W - 4, y: GY - 1 }, checkpoints: [], entities: [] });
}
export const CASES = [[1, 10], [3, 10], [10, 10], [10, 20], [4, 11], [4, 13], [4, 16]];
