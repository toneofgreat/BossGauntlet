// area2.js - AREA 2 "Golden Highlands" (theme highlands, music area2). Level data only, built in code. NO DOM.
// Harder than area 1: a real mountain climb at golden hour. Cliff stairs, crumble chains over chasms, log ferries
// and a cliff lift over a rapids gorge, steam vents, boulders rolling in rocky bowls, geysers erupting out of pools,
// wasps guarding pillar gaps, a loop-lift, spring chains up the cliffs, icy summit slopes and a final combo climb.
// 8 checkpoint segments; each one is a self-contained challenge (a mistake costs that segment, never the run).
// Row numbers in the comments below are BEFORE the SKY shift at the bottom of the file (final y = row + 7).
import { makeGrid } from "./kit.js";

const W = 410, H = 44;
const g = makeGrid(W, H);
const E = [];          // entities
const CP = [];         // checkpoints

// ---- cursor terrain helpers: x = next free column, top = row of the current ground surface ----
let x = 0, top = 38;
const flat = (n, ch = "#") => { g.ground(x, x + n - 1, top, ch); x += n; };
const up45 = (n, ch = "#") => { g.slopeUp(x, top - 1, n, ch); x += n; top -= n; };
const down45 = (n, ch = "#") => { g.slopeDown(x, top, n, ch); x += n; top += n; };
const upG = (n, ch = "#") => { g.gentleUp(x, top - 1, n, ch); x += 2 * n; top -= n; };
const downG = (n, ch = "#") => { g.gentleDown(x, top, n, ch); x += 2 * n; top += n; };
// a pit/chasm n wide (fall = death); optional water filling from row wy down (rapids / pools)
const gap = (n, wy = -1) => { if (wy >= 0) g.fill(x, wy, x + n - 1, H - 1, "~"); x += n; };
// a dry ravine n wide: a bramble-thorn floor `depth` rows below the current surface, rock below it
const ravine = (n, depth = 4) => { g.ground(x, x + n - 1, top + depth + 1, "R"); g.fill(x, top + depth, x + n - 1, top + depth, "^"); x += n; };
const deco = (dx, y, kind, s = 1, layer = "back") => E.push({ t: "deco", x: dx, y, kind, s, layer });
const sign = (sx, sy, text) => E.push({ t: "sign", x: sx, y: sy, text });
const cp = (cx, cy) => CP.push({ x: cx, y: cy });

// =====================================================================================================
// SEGMENT 0 - Trailhead Meadow (x 0..55): stream hop, rock hops, a slow wasp, the first 4-tile gorge jump
// =====================================================================================================
flat(11);                                   // 0..10, top 38
sign(5, 37, "Golden Highlands: climb to the summit!");
deco(1, 37, "pine", 1.3); deco(8, 37, "birch", 1.1); deco(3, 37, "grass", 1, "front");
upG(2);                                     // 11..14 -> top 36
flat(7);                                    // 15..21
g.set(18, 35, "R");                         // a boulder to hop
deco(16, 35, "fern"); deco(21, 35, "bush");
gap(3, 37);                                 // 22..24 stream (water 1 below the banks)
deco(22, 36, "reeds", 1, "front"); deco(24, 36, "reeds", 1, "front");
flat(7);                                    // 25..31, top 36
// wasp bobbing over the path: pass under it when it is high, or wait
E.push({ t: "hazard", x: 29, y: 32, r: 0.45, kind: "wasp", path: [[0, 3]], speed: 1.6, mode: "ping" });
deco(26, 35, "flowers");
top -= 2; flat(5, "R");                     // 32..36 a 2-tile rock step, top 34
deco(33, 33, "cairn", 0.8);
up45(3);                                    // 37..39 -> top 31
flat(5);                                    // 40..44
deco(41, 30, "pine", 1.4);
sign(43, 30, "Run and jump the gorge!");
gap(4, 34);                                 // 45..48 gorge, rapids 3 below the rim
flat(8, "R");                               // 49..56, top 31
cp(53, 30);                                 // CP0
deco(55, 30, "birch", 1.2);

// =====================================================================================================
// SEGMENT 1 - Cliff Stairs (x 57..103): 2-tile cliff steps with thorns, a crumble chain over a chasm, thorn ridge
// =====================================================================================================
flat(2, "R");                               // 57..58 top 31
top -= 2; flat(3, "R");                     // 59..61 top 29
top -= 2; flat(2, "R");                     // 62..63 top 27
g.set(63, 26, "^");                         // thorn on the narrow step: jump straight up to the next one
top -= 2; flat(4, "R");                     // 64..67 top 25
deco(65, 24, "deadtree", 0.9);
sign(66, 24, "Crumbling stones: keep moving!");
// chasm 68..82 bridged by crumbling stones (top at row 25)
const chasm0 = x; ravine(15);                  // 68..82
E.push({ t: "crumble", x: chasm0 + 0, y: 25, w: 2 });   // 68-69
E.push({ t: "crumble", x: chasm0 + 3, y: 25, w: 2 });   // 71-72
E.push({ t: "crumble", x: chasm0 + 7, y: 25, w: 2 });   // 75-76  (3-gap)
E.push({ t: "crumble", x: chasm0 + 11, y: 25, w: 2 });  // 79-80  (2-gap)
flat(5, "R");                               // 83..87 top 25
up45(4);                                    // 88..91 -> top 21
flat(14);                                   // 92..105 thorn ridge
g.set(95, 20, "^"); g.set(96, 20, "^");
g.set(100, 20, "^"); g.set(101, 20, "^"); g.set(102, 20, "^");
deco(93, 20, "pine", 1.5); deco(98, 20, "grass", 1, "front");
cp(104, 20);                                // CP1

// =====================================================================================================
// SEGMENT 2 - Rapids Gorge (x 106..152): log ferry over the gorge, a cliff lift, steam vents on the top ledge
// =====================================================================================================
flat(1);                                    // 106 top 21
sign(105, 20, "Ride the log across");
const gorge = x; gap(13, 24);               // 107..119 rapids 3 below the rim
E.push({ t: "mover", x: gorge, y: 21, w: 3, kind: "log", path: [[10, 0]], speed: 2.4, mode: "ping" });
flat(3, "R");                               // 120..122 rock pillar top 21
deco(121, 20, "boulder", 0.6);
// lift shaft 123..125: a stone slab sinks to the shaft floor (safe rock, 3 below the pillar) and rides up the
// 11-tile cliff face to the upper ledge (top 13). Miss it and you just wait on the floor for the next ride.
const shaft = x; g.ground(x, x + 2, 24, "R"); x += 3;  // 123..125 shaft floor top 24
E.push({ t: "mover", x: shaft, y: 24, w: 3, kind: "stone", path: [[0, -11]], speed: 2, mode: "ping" });
top = 13; flat(4, "R");                     // 126..129 cliff top 13 (an 8-tile cliff wall)
flat(14);                                   // 130..143
deco(128, 12, "pine", 1.6); deco(130, 12, "fern");
// steam vents: on 50 of every 150 frames, staggered so you can stop between them
E.push({ t: "pulse", x: 133, y: 10, w: 1, h: 3, kind: "steam", period: 150, on: 50, offset: 0 });
E.push({ t: "pulse", x: 138, y: 10, w: 1, h: 3, kind: "steam", period: 150, on: 50, offset: 75 });
E.push({ t: "pulse", x: 142, y: 10, w: 1, h: 3, kind: "steam", period: 150, on: 50, offset: 20 });
sign(131, 12, "Steam vents: wait for the hiss to stop");
flat(9);                                    // 144..152
cp(149, 12);                                // CP2
deco(151, 12, "birch", 1.3);

// =====================================================================================================
// SEGMENT 3 - Boulder Bowls (x 153..203): boulders roll back and forth in two rocky bowls, then a long descent
// =====================================================================================================
down45(4, "R");                             // 153..156 -> top 17
const bowl1 = x; flat(8, "R");              // 157..164 bowl floor
E.push({ t: "hazard", x: bowl1, y: 16, r: 0.5, kind: "boulder", path: [[7, 0]], speed: 3, mode: "ping" });
up45(4, "R");                               // 165..168 -> top 13
flat(4);                                    // 169..172
deco(170, 12, "pine", 1.2);
down45(5, "R");                             // 173..177 -> top 18
const bowl2 = x; flat(10, "R");             // 178..187
E.push({ t: "hazard", x: bowl2, y: 17, r: 0.5, kind: "boulder", path: [[9, 0]], speed: 3.6, mode: "ping", phase: 0.3 });
E.push({ t: "hazard", x: bowl2 + 4, y: 14, r: 0.45, kind: "wasp", path: [[3, 0]], speed: 1.5, mode: "ping" });
up45(2, "R");                               // 188..189 -> top 16
flat(3);                                    // 190..192
downG(3);                                   // 193..198 -> top 19
flat(2);                                    // 199..200
down45(3);                                  // 201..203 -> top 22
flat(4);                                    // 204..207
cp(205, 21);                                // CP3
deco(207, 21, "pine", 1.5);

// =====================================================================================================
// SEGMENT 4 - Geyser Terraces (x 208..258): pools whose geysers erupt through your jump, a crumble raft, shelves up
// =====================================================================================================
sign(206, 21, "Geysers! Jump when the pool is calm");
gap(3, 23);                                 // 208..210 pool
E.push({ t: "pulse", x: 208, y: 16, w: 3, h: 7, kind: "geyser", period: 160, on: 55, offset: 0 });
flat(4, "R");                               // 211..214 top 22
gap(4, 23);                                 // 215..218 pool (4-tile running jump)
E.push({ t: "pulse", x: 215, y: 16, w: 4, h: 7, kind: "geyser", period: 160, on: 55, offset: 80 });
flat(3, "R");                               // 219..221
// wide pool with crumble stepping stones and one geyser in the middle
const pool = x; gap(12, 23);                // 222..233
E.push({ t: "crumble", x: pool + 2, y: 22, w: 2 });    // 224-225
E.push({ t: "crumble", x: pool + 7, y: 22, w: 2 });    // 229-230
E.push({ t: "pulse", x: pool + 4, y: 16, w: 2, h: 7, kind: "geyser", period: 140, on: 45, offset: 30 });
flat(4, "R");                               // 234..237 top 22
deco(236, 21, "reeds", 1, "front");
// rock shelves climbing a cliff (one-way rock ledges, 2 tiles apart)
const shelf = x; flat(10);                  // 238..247 top 22 base
g.fill(shelf + 4, 12, shelf + 9, 21, "R");  // cliff block 242..247 rising to top 12
g.fill(shelf + 1, 20, shelf + 2, 20, "-");  // 239-240 row 20
g.fill(shelf + 2, 18, shelf + 3, 18, "-");  // 240-241 row 18
g.fill(shelf + 0, 16, shelf + 1, 16, "-");  // 238-239 row 16
g.fill(shelf + 2, 14, shelf + 3, 14, "-");  // 240-241 row 14
g.set(shelf + 0, 21, "^");                  // thorns at the foot of the shelves
top = 12; flat(11);                         // 248..258 top 12
deco(250, 11, "pine", 1.4);
cp(255, 11);                                // CP4

// =====================================================================================================
// SEGMENT 5 - Wasp Ridge (x 259..309): pillar hops over a chasm with wasps in the gaps, a loop lift, springs up
// =====================================================================================================
flat(1);                                    // 259 top 12
sign(257, 11, "Watch the wasps, then leap");
ravine(4);                                     // 260..263
E.push({ t: "hazard", x: 261, y: 8, r: 0.45, kind: "wasp", path: [[0, 4]], speed: 2.2, mode: "ping" });
flat(3, "R");                               // 264..266 pillar
ravine(4);                                     // 267..270
E.push({ t: "hazard", x: 268, y: 12, r: 0.45, kind: "wasp", path: [[0, -4]], speed: 2.2, mode: "ping", phase: 0.25 });
top -= 1; flat(3, "R");                     // 271..273 pillar top 11
ravine(3);                                     // 274..276
flat(2, "R");                               // 277..278 pillar top 11
// loop lift: a stone slab circling over a wide chasm
const loopX = x; ravine(12, 4);                   // 279..290
E.push({ t: "mover", x: loopX, y: 11, w: 3, kind: "stone", path: [[5, -3], [9, 0], [5, 3]], speed: 2.4, mode: "loop" });
flat(6, "R");                               // 291..296 top 11
// spring chain: two mushrooms up a pair of cliffs
E.push({ t: "spring", x: 295, y: 10, p: 1 });
top = 5; flat(4, "R");                      // 297..300 top 5 (6-tile cliff)
deco(299, 4, "birch", 1);
flat(9);                                    // 301..309 top 5
cp(306, 4);                                 // CP5

// =====================================================================================================
// SEGMENT 6 - Frozen Shoulder (x 310..359): icy slopes, a thorn at the end of an ice run, sliding ice ledges
// =====================================================================================================
sign(308, 4, "Ice ahead: you will slide!");
downG(2, "I");                              // 310..313 -> top 7 (ice under the slope)
flat(8, "I");                               // 314..321 ice run
flat(5, "R");                               // 322..326 rock
g.set(323, 6, "^");                         // thorn right where the ice ends: hop it
ravine(3);                                  // 327..329
flat(4, "I");                               // 330..333 ice ledge: you land sliding, jump again quickly
ravine(3);                                  // 334..336
flat(4, "I");                               // 337..340 ice ledge
E.push({ t: "hazard", x: 335, y: 2, r: 0.45, kind: "wasp", path: [[0, 2]], speed: 1.4, mode: "ping" });
ravine(3);                                  // 341..343
top -= 1; flat(6, "R");                     // 344..349 top 6
deco(345, 5, "deadtree", 1);
E.push({ t: "spring", x: 348, y: 5, p: 0.85 });
sign(346, 5, "Bounce up the cliff");
top = 3; flat(10, "R");                     // 350..359 top 3 (a 3-tile cliff: only the mushroom gets you up)
cp(356, 2);                                 // CP6

// =====================================================================================================
// SEGMENT 7 - Summit Ridge (x 360..409): a crumble perch, a drifting leaf over the void, thorn steps, the goal
// =====================================================================================================
sign(358, 2, "Wait for the leaf, then go");
const sv = x; ravine(15, 4);                // 360..374 (crumble perch at 362-363, then the void)
E.push({ t: "crumble", x: sv + 2, y: 3, w: 2 });
E.push({ t: "mover", x: sv + 6, y: 3, w: 2, kind: "leaf", path: [[7, 0]], speed: 2.4, mode: "ping" });
flat(5, "R");                               // 375..379 top 3
flat(30, "#");                              // 380..409 summit meadow
g.set(384, 2, "^"); g.set(385, 2, "^");
E.push({ t: "hazard", x: 391, y: 0, r: 0.45, kind: "wasp", path: [[0, 2]], speed: 1.8, mode: "ping" });
g.set(395, 2, "^"); g.set(396, 2, "^"); g.set(397, 2, "^");
deco(399, 2, "cairn", 1.2); deco(407, 2, "pine", 1.6); deco(381, 2, "grass", 1, "front");
sign(400, 2, "The summit!");

// ---- extra hand-placed scenery, set on whatever surface is at that column (pure decoration, ignored by the sim) ----
const surf = (cx) => { for (let y = 0; y < H; y++) { const c = g.get(cx, y); if (c !== "." && c !== "^" && c !== "B") return y; } return H; };
const SCENERY = [
  [6, "fern"], [13, "pine", 1.7], [20, "boulder", 0.7], [27, "birch", 1.4], [30, "grass", 1, "front"], [35, "flowers"],
  [38, "pine", 1.2], [44, "grass", 1, "front"], [51, "pine", 1.8], [57, "fern"], [60, "boulder", 0.6], [67, "cairn", 0.7],
  [84, "pine", 1.5], [86, "boulder", 0.8], [94, "birch", 1.2], [98, "fern"], [103, "grass", 1, "front"],
  [122, "pine", 1.3], [127, "boulder", 0.7], [135, "bush"], [140, "fern"], [146, "pine", 1.9], [152, "grass", 1, "front"],
  [161, "boulder", 0.6], [167, "deadtree", 1.1], [172, "fern"], [184, "boulder", 0.7], [191, "birch", 1.3],
  [196, "pine", 1.4], [200, "bush"], [204, "grass", 1, "front"], [212, "reeds", 1, "front"], [220, "reeds", 1, "front"],
  [234, "boulder", 0.6], [244, "pine", 1.5], [247, "deadtree", 1], [253, "fern"], [258, "boulder", 0.6],
  [265, "deadtree", 0.8], [272, "pine", 1.1], [278, "cairn", 0.6], [292, "boulder", 0.7], [298, "pine", 1.4],
  [303, "fern"], [309, "grass", 1, "front"], [316, "crystal", 0.7], [325, "boulder", 0.6], [332, "crystal", 0.6],
  [339, "crystal", 0.8], [347, "pine", 1.2], [352, "pine", 1.3], [358, "boulder", 0.6], [377, "deadtree", 1],
  [383, "flowers"], [389, "pine", 1.5], [393, "bush"], [402, "flowers"], [405, "fern"],
];
for (const [cx, kind, s = 1, layer = "back"] of SCENERY) { const sy = surf(cx); if (sy < H) deco(cx, sy - 1, kind, s, layer); }

// ---- sky headroom: the summit is near row 3, so prepend SKY empty rows and shift every y down by the same amount ----
const SKY = 7;
const sh = (p) => Object.assign({}, p, { y: p.y + SKY });
const lv = g.level({
  name: "Golden Highlands",
  theme: "highlands",
  music: "area2",
  start: { x: 3, y: 37 },
  goal: { x: 404, y: 2 },
  checkpoints: CP,
  entities: E,
});
lv.tiles = new Array(SKY).fill(".".repeat(W)).concat(lv.tiles);
lv.h = H + SKY;
lv.start = sh(lv.start); lv.goal = sh(lv.goal);
lv.checkpoints = lv.checkpoints.map(sh);
lv.entities = lv.entities.map(sh);

export default lv;
