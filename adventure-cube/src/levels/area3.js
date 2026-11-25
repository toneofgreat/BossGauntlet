// area3.js - AREA 3 "Storm Peaks": very very hard. Stormy night climb to the summit. Data only (CONTRACT.md 7).
// Every moving/timed thing repeats with a period dividing 240 frames (pulses 80/120, paths 80/120/240 frames per
// cycle) so the whole level repeats every 4 s: fair to learn, and the AI rater's state space stays bounded.
import { makeGrid } from "./kit.js";

const W = 470, H = 40;
const g = makeGrid(W, H);
const E = [];          // entities
const CP = [];         // checkpoints
const deco = (x, y, kind, s = 1, layer = "back") => E.push({ t: "deco", x, y, kind, s, layer });
const sign = (x, y, text) => E.push({ t: "sign", x, y, text });
const spikesUp = (x0, x1, y) => g.fill(x0, y, x1, y, "^");
const bolt = (x, y, w, h, period, on, offset) => E.push({ t: "pulse", x, y, w, h, kind: "lightning", period, on, offset });
const spark = (x, y, path, speed, phase = 0, r = 0.45, kind = "spark") => E.push({ t: "hazard", x, y, r, kind, path, speed, mode: "ping", phase });

// ------------------------------------------------------------------ A: Broken Ridge (0..60), ground row 34
g.ground(0, 11, 34, "R");
sign(5, 33, "Storm Peaks. Precision or pain.");
g.ground(16, 18, 34, "R");                       // pit 12..15 (4)
g.ground(22, 25, 33, "R");                       // pit 19..21, ledge one higher
spikesUp(26, 29, 33); g.ground(26, 29, 34, "R");
g.ground(30, 35, 34, "R");
sign(30, 33, "Lightning strikes in rhythm. Watch, then run.");
bolt(32, 27, 2, 7, 120, 92, 0);
spark(37.5, 33, [[0, -5]], 5);                   // pit 36..39 with a spark bobbing in it
g.ground(40, 43, 34, "R");
spikesUp(44, 46, 33); g.ground(44, 46, 34, "R");
g.ground(47, 48, 34, "R");
g.ground(52, 52, 33, "R");                       // pits 49..51 and 53..55 around a lone pillar
g.ground(56, 60, 34, "R");
CP.push({ x: 58, y: 33 });

// ------------------------------------------------------------------ B: Crumbling Span (61..112), chasm 61..96
E.push({ t: "crumble", x: 61, y: 34, w: 3 });
g.ground(67, 68, 33, "R");                       // narrow rock pillars are the only rest points
spark(70, 34, [[0, -5]], 5);
E.push({ t: "crumble", x: 72, y: 34, w: 2 });
g.ground(78, 79, 34, "R");
E.push({ t: "crumble", x: 83, y: 33, w: 2 });
E.push({ t: "crumble", x: 89, y: 34, w: 3 });
g.ground(95, 96, 33, "R");
g.ground(97, 112, 34, "R");
CP.push({ x: 108, y: 33 });

// ------------------------------------------------------------------ C: Frozen Teeth (113..170), ice
g.ground(113, 126, 34, "I"); g.fill(113, 35, 126, H - 1, "R");
sign(114, 33, "Black ice. You will slide.");
g.ground(131, 132, 34, "I"); g.fill(131, 35, 132, H - 1, "R");   // pit 127..130, a 2-wide floe
g.fill(132, 27, 136, 30, "R"); g.fill(132, 31, 136, 31, "v");    // icicles: a full jump is fatal
g.ground(136, 140, 34, "I"); g.fill(136, 35, 140, H - 1, "R");   // pit 133..135
g.ground(144, 146, 33, "I"); g.fill(144, 34, 146, H - 1, "R");   // pit 141..143 onto a 1-high step
g.ground(147, 170, 34, "R");
spikesUp(147, 149, 33);
CP.push({ x: 166, y: 33 });

// ------------------------------------------------------------------ D: Mushroom Ascent (171..222), climb to row 20
spikesUp(171, 184, 33); g.ground(171, 184, 34, "R");
E.push({ t: "spring", x: 170, y: 33, p: 1 });
g.ground(174, 175, 29, "R"); E.push({ t: "spring", x: 175, y: 28, p: 1.1 });
g.fill(172, 16, 177, 16, "R"); g.fill(172, 17, 177, 17, "v");
spark(177, 20, [[0, 4]], 4, 0, 0.45, "wasp");
g.ground(179, 181, 23, "R");
g.ground(183, 183, 25, "R"); E.push({ t: "spring", x: 183, y: 24, p: 0.9 });
g.ground(186, 222, 20, "R");
g.fill(185, 21, 185, 32, "<"); g.ground(185, 185, 33, "R");
// a 2-high wall under a thorn ceiling: a full jump is just too high
g.fill(195, 18, 197, 19, "R"); g.fill(194, 15, 198, 15, "R"); g.fill(194, 16, 198, 16, "v");
bolt(204, 13, 2, 7, 120, 88, 0);
bolt(209, 13, 2, 7, 120, 88, 74);
CP.push({ x: 218, y: 19 });

// ------------------------------------------------------------------ E: Gale Bridges (223..278), chasm 223..265
E.push({ t: "mover", x: 223, y: 20, w: 2, kind: "stone", path: [[6, 0]], speed: 3, mode: "ping" });
g.ground(233, 234, 22, "R");
E.push({ t: "mover", x: 237, y: 22, w: 2, kind: "log", path: [[0, -5]], speed: 5, mode: "ping" });
spark(241, 13, [[0, 4]], 4, 0, 0.5, "wasp");
g.ground(243, 245, 17, "R");
E.push({ t: "mover", x: 247, y: 17, w: 2, kind: "leaf", path: [[6, 0]], speed: 6, mode: "ping" });
spark(251, 13, [[0, 5]], 5, 0.5);
g.ground(257, 258, 18, "R");
E.push({ t: "mover", x: 260, y: 18, w: 2, kind: "plank", path: [[5, 0]], speed: 5, mode: "ping", phase: 0.5 });
g.ground(268, 278, 20, "R");
CP.push({ x: 274, y: 19 });

// ------------------------------------------------------------------ F: Thorn Burrow (279..330), low tunnels lined with thorns
g.ground(279, 330, 20, "R");
g.fill(282, 8, 298, 15, "R"); g.fill(282, 16, 298, 16, "v");     // 3-high: never a full jump
g.fill(299, 8, 316, 16, "R"); g.fill(299, 17, 316, 17, "v");     // 2-high: tap jumps only
for (const x of [288, 289, 294, 302]) g.set(x, 19, "^");
g.clear(306, 307, 20, H - 1);
E.push({ t: "pulse", x: 299, y: 18, w: 1, h: 2, kind: "steam", period: 80, on: 50, offset: 40 });
E.push({ t: "pulse", x: 314, y: 18, w: 1, h: 2, kind: "steam", period: 80, on: 50, offset: 0 });
CP.push({ x: 322, y: 19 });

// ------------------------------------------------------------------ G: Lightning Steps (331..380), rising pillars
g.ground(331, 333, 20, "R");
g.ground(338, 339, 19, "R");                                     // a 4-tile leap one tile up, then struck pillars
g.ground(343, 344, 18, "R"); bolt(343, 10, 2, 8, 120, 60, 0);
g.ground(348, 349, 16, "R");
g.ground(353, 354, 15, "R"); bolt(353, 7, 2, 8, 120, 60, 60);
g.ground(358, 402, 14, "R");
CP.push({ x: 376, y: 13 });

// ------------------------------------------------------------------ H: Summit (381..469)
spikesUp(384, 385, 13);
g.fill(387, 12, 388, 12, "-");
E.push({ t: "crumble", x: 391, y: 10, w: 2 });
g.fill(395, 8, 396, 8, "-");
E.push({ t: "mover", x: 399, y: 8, w: 2, kind: "stone", path: [[0, -3]], speed: 3, mode: "ping" });
g.ground(403, 417, 5, "R");
spark(410, 2, [[0, 2]], 3, 0, 0.5);
spikesUp(414, 415, 4);
spark(419.5, 5, [[0, -4]], 4);                    // pit 418..421
g.ground(422, 431, 5, "R");
bolt(424, 0, 2, 5, 120, 92, 0);
E.push({ t: "crumble", x: 432, y: 5, w: 3 });     // the last crumbling bridge, pit 432..448
E.push({ t: "crumble", x: 438, y: 4, w: 2 });
E.push({ t: "crumble", x: 443, y: 5, w: 3 });
g.ground(449, 469, 5, "R");

// ------------------------------------------------------------------ strata (cosmetic, same physics: R and # are both solid)
// Wide plateaus become frozen earth ('#', snow-capped by the renderer) with rock outcrops; narrow pillars stay rock.
{
  const top = (x) => { for (let y = 0; y < H; y++) { const c = g.get(x, y); if (c === "R" || c === "#" || c === "I") return y; } return -1; };
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let x = 0; x < W; x++) {
    const y0 = top(x);
    if (y0 < 0 || g.get(x, y0) !== "R") continue;
    let run = 1;
    for (let d = 1; d < 4; d++) { if (top(x - d) === y0) run++; if (top(x + d) === y0) run++; }
    if (run < 6) continue;
    for (let y = y0; y < H; y++) if (g.get(x, y) === "R" && !(y > y0 + 2 && rnd() < 0.18)) g.set(x, y, "#");
  }
}

// ------------------------------------------------------------------ decoration (storm: dead trees, cairns, bones)
for (const [x, y, k, s, l] of [
  [1, 33, "deadtree", 1.4], [8, 33, "cairn", 1], [17, 33, "boulder", 0.7], [24, 32, "deadtree", 1.1],
  [41, 33, "bones", 0.8], [57, 33, "lantern", 1], [99, 33, "deadtree", 1.6], [104, 33, "boulder", 1.2],
  [110, 33, "lantern", 1], [116, 33, "crystal", 0.9], [123, 33, "crystal", 1.2, "front"], [139, 33, "crystal", 0.8],
  [152, 33, "bones", 1], [158, 33, "deadtree", 1.3], [164, 33, "lantern", 1], [180, 22, "crystal", 0.7],
  [188, 19, "deadtree", 1.2], [200, 19, "boulder", 0.9], [214, 19, "bones", 0.8], [220, 19, "lantern", 1],
  [247, 16, "cairn", 0.8], [268, 19, "deadtree", 1.5], [276, 19, "lantern", 1], [280, 19, "boulder", 1],
  [291, 19, "bones", 0.6], [319, 19, "deadtree", 1.2], [324, 19, "lantern", 1], [328, 19, "pine", 1.3],
  [332, 19, "cairn", 0.7], [356, 13, "pine", 1.6], [362, 13, "deadtree", 1.4], [368, 13, "boulder", 1.1],
  [374, 13, "lantern", 1], [379, 13, "pine", 1.2, "front"], [405, 4, "crystal", 1], [424, 4, "bones", 0.7],
  [452, 4, "pine", 1.1], [456, 4, "deadtree", 1.3], [462, 4, "cairn", 1.6], [468, 4, "lantern", 1.2],
]) deco(x, y, k, s, l || "back");
sign(220, 19, "Gale bridges ahead. Ride, wait, leap.");
sign(280, 19, "Thorn burrow: short hops only.");
sign(452, 4, "The summit. You made it.");

export default g.level({
  name: "Storm Peaks",
  theme: "storm",
  music: "area3",
  start: { x: 2, y: 33 },
  goal: { x: 465, y: 4 },
  checkpoints: CP,
  entities: E,
});
