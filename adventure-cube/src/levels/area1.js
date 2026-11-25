// area1.js - AREA 1 "Sunlit Forest" (AREA1 owner). Level data only (CONTRACT.md section 7). NO DOM, no randomness
// beyond the seeded PRNG below (same output on every import).
//
// An easy, joyful introduction through a sunny late-morning forest. Six segments, five checkpoints:
//   0  Meadow Path       move, hop rocks and a log, gentle + 45-degree hills, hold jump for a 2-tile rock, a brook
//   1  Fern Hollow       logs, first thorns (2 wide), a stump, one-way branches up onto a mossy outcrop, a wider brook
//   2  Mossback Mountain the first mushroom spring up a cliff, a ramp, a branch-ladder up a rock face, summit cairn
//   3  The Long Descent  slopes and gentle slopes down the far side, then a floating log ferries you over a river
//   4  Bramble Wood      a branch over a thorn patch, a mushroom bounce over a giant fallen trunk,
//                        a crumbling-stone bridge over a ravine
//   5  Glowcap Glen      a mushroom cave under a boulder arch, a lily-leaf over the pond, the climb to the glade
// Rules kept (contract 7): gaps <= 3 tiles, walls <= 2 tiles (higher ones only with a spring/branch), no pulses,
// no moving hazards, nothing deadly at a landing spot, every jump visible before you take it.
import { makeGrid } from "./kit.js";

const W = 340, H = 40, GY = 34;   // GY = surface row of the forest floor (ground rows 34..39)
const g = makeGrid(W, H);
g.ground(0, W - 1, GY);

// a sunken brook: the bank stays at GY, the stream bed (water) is one tile lower, `deep` tiles of water
const brook = (x0, x1, deep = 2) => { g.clear(x0, x1, GY, GY); g.fill(x0, GY + 1, x1, GY + deep, "~"); };

// ---------------- Segment 0: Meadow Path (0..65) ----------------
g.set(13, GY - 1, "R");                       // first pebble-rock to hop
g.fill(20, GY - 1, 21, GY - 1, "W");          // a little fallen log
g.gentleUp(26, GY - 1, 2);                    // gentle hill
g.ground(30, 34, GY - 2);
g.gentleDown(35, GY - 2, 2);
g.slopeUp(42, GY - 1, 2);                     // a steeper (45 deg) knoll
g.ground(44, 46, GY - 2);
g.slopeDown(47, GY - 2, 2);
g.fill(54, GY - 2, 55, GY - 1, "R");          // 2-tile boulder: hold jump
brook(60, 61);                                // first brook, 2 wide

// ---------------- Segment 1: Fern Hollow (66..125) ----------------
g.fill(70, GY - 1, 72, GY - 1, "W");          // long log
g.set(78, GY - 1, "^").set(79, GY - 1, "^"); // first thorns
g.fill(86, GY - 2, 86, GY - 1, "W");          // tall stump
g.fill(91, GY - 2, 93, GY - 2, "-");          // branch against the outcrop
g.ground(94, 100, GY - 4, "R");               // mossy outcrop, 4 tall: only via the branch
brook(108, 110);                              // wider brook, 3 wide
g.slopeUp(114, GY - 1, 2);
g.ground(116, 120, GY - 2);
g.slopeDown(121, GY - 2, 2);

// ---------------- Segment 2: Mossback Mountain (126..163) ----------------
g.ground(133, 139, GY - 5, "R");              // the cliff (5 tall): mushroom at x=132
g.slopeUp(140, GY - 6, 3);                    // ramp up to GY-8
g.ground(143, 146, GY - 8);
g.ground(147, 152, GY - 16, "R");             // rock face, 8 tall
g.fill(145, GY - 10, 146, GY - 10, "-");      // branch ladder up the face, 2 rows apart
g.fill(145, GY - 12, 146, GY - 12, "-");
g.fill(145, GY - 14, 146, GY - 14, "-");
g.gentleUp(153, GY - 17, 1);                  // to the summit
g.ground(155, 163, GY - 17);

// ---------------- Segment 3: The Long Descent (164..213) ----------------
g.slopeDown(164, GY - 17, 3);
g.ground(167, 171, GY - 14);
g.gentleDown(172, GY - 14, 3);
g.ground(178, 181, GY - 11);
g.slopeDown(182, GY - 11, 3);
g.ground(185, 188, GY - 8);
g.ground(189, 192, GY - 5, "R");              // a 3-tile drop onto a rock step, then down to the floor
g.set(197, GY - 1, "R");
brook(201, 208, 3);                           // the river, 8 wide: ride the log

// ---------------- Segment 4: Bramble Wood (214..265) ----------------
g.fill(222, GY - 1, 227, GY - 1, "^");        // bramble patch, 6 wide
g.fill(223, GY - 2, 226, GY - 2, "-");        // branch over it
g.fill(244, GY - 5, 246, GY - 1, "W");        // giant fallen trunk, 5 tall: mushroom at x=243
g.clear(254, 259, GY, H - 1);                 // ravine under the crumbling bridge

// ---------------- Segment 5: Glowcap Glen (266..339) ----------------
g.clear(270, 289, GY, GY + 2);                // the dip into the mushroom hollow
g.slopeDown(270, GY, 3);
g.slopeUp(287, GY + 2, 3);
g.fill(276, GY - 3, 283, GY - 1, "R");        // boulder arch over the hollow
g.fill(276, GY, 283, GY + 2, "B");            // cave wall behind
g.set(294, GY - 1, "R");
g.fill(298, GY - 2, 299, GY - 1, "R");
brook(304, 311, 3);                           // the pond, 8 wide: ride the lily leaf
g.gentleUp(318, GY - 1, 3);
g.ground(324, W - 1, GY - 3);

const start = { x: 3, y: GY - 1 };
const goal = { x: 332, y: GY - 4 };
const checkpoints = [
  { x: 66, y: GY - 1 },
  { x: 126, y: GY - 1 },
  { x: 159, y: GY - 18 },
  { x: 214, y: GY - 1 },
  { x: 266, y: GY - 1 },
];

const entities = [
  // signs (tutorial)
  { t: "sign", x: 6, y: GY - 1, text: "Arrows or A / D to roll along", touch: "Hold the arrows to roll" },
  { t: "sign", x: 10, y: GY - 1, text: "Space, W or Up to jump", touch: "Tap the big button to jump" },
  { t: "sign", x: 50, y: GY - 1, text: "Hold jump to leap higher", touch: "Hold the jump button to leap higher" },
  { t: "sign", x: 57, y: GY - 1, text: "Hop the brook - water is cold!" },
  { t: "sign", x: 75, y: GY - 1, text: "Thorns sting. Jump over them" },
  { t: "sign", x: 89, y: GY - 1, text: "Jump up through branches" },
  { t: "sign", x: 129, y: GY - 1, text: "Land on the mushroom to bounce" },
  { t: "sign", x: 143, y: GY - 9, text: "Climb the branches up the cliff" },
  { t: "sign", x: 198, y: GY - 1, text: "Ride the floating log" },
  { t: "sign", x: 218, y: GY - 1, text: "Branch over the brambles" },
  { t: "sign", x: 240, y: GY - 1, text: "Bounce over the giant trunk" },
  { t: "sign", x: 250, y: GY - 1, text: "Crumbly stones! Keep moving" },
  { t: "sign", x: 301, y: GY - 1, text: "Hop on the lily leaf" },
  { t: "sign", x: 326, y: GY - 4, text: "The Sunlit Glade - well done!" },

  // mechanics
  { t: "spring", x: 132, y: GY - 1, p: 1 },
  { t: "mover", x: 201, y: GY, w: 3, kind: "log", path: [[4, 0]], speed: 1.2, mode: "ping" },
  { t: "spring", x: 243, y: GY - 1, p: 1 },
  { t: "crumble", x: 254, y: GY, w: 2 },
  { t: "crumble", x: 256, y: GY, w: 2 },
  { t: "crumble", x: 258, y: GY, w: 2 },
  { t: "mover", x: 304, y: GY, w: 3, kind: "leaf", path: [[5, 0]], speed: 1.4, mode: "ping" },

  // hand-placed set dressing
  { t: "deco", x: 1, y: GY - 1, kind: "oak", s: 1.6 },
  { t: "deco", x: 8, y: GY - 1, kind: "flowers", s: 1 },
  { t: "deco", x: 16, y: GY - 1, kind: "birch", s: 1.3 },
  { t: "deco", x: 32, y: GY - 3, kind: "oak", s: 1.4 },
  { t: "deco", x: 45, y: GY - 3, kind: "flowers", s: 1.2 },
  { t: "deco", x: 58, y: GY - 1, kind: "reeds", s: 1 },
  { t: "deco", x: 62, y: GY - 1, kind: "reeds", s: 0.9 },
  { t: "deco", x: 68, y: GY - 1, kind: "stump", s: 1 },
  { t: "deco", x: 81, y: GY - 1, kind: "fern", s: 1.2, layer: "front" },
  { t: "deco", x: 96, y: GY - 5, kind: "pine", s: 1.4 },
  { t: "deco", x: 99, y: GY - 5, kind: "mushrooms", s: 1 },
  { t: "deco", x: 107, y: GY - 1, kind: "reeds", s: 1 },
  { t: "deco", x: 111, y: GY - 1, kind: "reeds", s: 1.1 },
  { t: "deco", x: 118, y: GY - 3, kind: "birch", s: 1.5 },
  { t: "deco", x: 136, y: GY - 6, kind: "pine", s: 1.2 },
  { t: "deco", x: 144, y: GY - 9, kind: "fern", s: 1 },
  { t: "deco", x: 150, y: GY - 17, kind: "pine", s: 1.1 },
  { t: "deco", x: 161, y: GY - 18, kind: "cairn", s: 1.2 },
  { t: "deco", x: 157, y: GY - 18, kind: "flowers", s: 1 },
  { t: "deco", x: 169, y: GY - 15, kind: "pine", s: 1.3 },
  { t: "deco", x: 180, y: GY - 12, kind: "boulder", s: 1 },
  { t: "deco", x: 187, y: GY - 9, kind: "birch", s: 1.2 },
  { t: "deco", x: 200, y: GY - 1, kind: "reeds", s: 1 },
  { t: "deco", x: 209, y: GY - 1, kind: "reeds", s: 1 },
  { t: "deco", x: 211, y: GY - 1, kind: "boulder", s: 0.9 },
  { t: "deco", x: 220, y: GY - 1, kind: "bush", s: 1.2 },
  { t: "deco", x: 238, y: GY - 1, kind: "oak", s: 1.9 },
  { t: "deco", x: 245, y: GY - 6, kind: "mushrooms", s: 0.9 },
  { t: "deco", x: 252, y: GY - 1, kind: "fern", s: 1.1 },
  { t: "deco", x: 261, y: GY - 1, kind: "fern", s: 1.1 },
  { t: "deco", x: 274, y: GY + 2, kind: "mushrooms", s: 1.3 },
  { t: "deco", x: 279, y: GY + 2, kind: "lantern", s: 1 },
  { t: "deco", x: 281, y: GY + 2, kind: "mushrooms", s: 1.1 },
  { t: "deco", x: 285, y: GY + 2, kind: "mushrooms", s: 0.8 },
  { t: "deco", x: 279, y: GY - 4, kind: "bush", s: 1.1 },
  { t: "deco", x: 303, y: GY - 1, kind: "reeds", s: 1 },
  { t: "deco", x: 313, y: GY - 1, kind: "reeds", s: 1 },
  { t: "deco", x: 325, y: GY - 4, kind: "flowers", s: 1.3 },
  { t: "deco", x: 329, y: GY - 4, kind: "flowers", s: 1.1 },
  { t: "deco", x: 336, y: GY - 4, kind: "oak", s: 2 },
  { t: "deco", x: 334, y: GY - 4, kind: "flowers", s: 1 },
];

// ---- seeded auto-dressing on every exposed flat top (deterministic) ----
let seed = 0x5eedf0;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return ((seed >>> 8) & 0xffff) / 0x10000; };
const SOLID = "#RW";
const busy = new Set();
const mark = (x, r = 1) => { for (let i = -r; i <= r; i++) busy.add(Math.floor(x) + i); };
for (const e of entities) if (e.t !== "deco") mark(e.x, e.t === "mover" ? 0 : 1);
for (const c of checkpoints) mark(c.x, 1);
mark(start.x, 1); mark(goal.x, 2);
for (const e of entities) if (e.t === "deco") mark(e.x, 0);
let lastTree = -10;
for (let x = 1; x < W - 1; x++) {
  if (busy.has(x)) continue;
  let y = -1;
  for (let r = 1; r < H; r++) {
    const ch = g.get(x, r);
    if (ch === ".") continue;
    if (SOLID.includes(ch) && g.get(x, r - 1) === ".") y = r;
    break;
  }
  if (y < 0 || g.get(x, y) === "W") continue;
  // keep clear of slopes, thorns and water right next to it
  const near = g.get(x - 1, y) + g.get(x + 1, y) + g.get(x - 1, y - 1) + g.get(x + 1, y - 1);
  if (/[\/\\abcd^~]/.test(near) || g.get(x, y + 1) === "~") continue;
  const v = rnd();
  if (x - lastTree >= 5 && v < 0.3) {
    const kind = ["oak", "pine", "birch", "oak", "birch"][Math.floor(rnd() * 5)];
    entities.push({ t: "deco", x, y: y - 1, kind, s: Math.round((0.9 + rnd() * 0.8) * 10) / 10 });
    lastTree = x;
  } else if (v < 0.55) {
    const kind = ["bush", "fern", "flowers", "grass", "mushrooms", "grass", "fern"][Math.floor(rnd() * 7)];
    const front = (kind === "grass" || kind === "fern") && rnd() < 0.35;
    entities.push({ t: "deco", x, y: y - 1, kind, s: Math.round((0.7 + rnd() * 0.5) * 10) / 10, layer: front ? "front" : "back" });
  } else if (v < 0.6) {
    entities.push({ t: "deco", x, y: y - 1, kind: rnd() < 0.5 ? "boulder" : "stump", s: Math.round((0.6 + rnd() * 0.4) * 10) / 10 });
  }
}

export default g.level({
  name: "Sunlit Forest",
  author: "Adventure Cube",
  theme: "forest",
  music: "area1",
  start,
  goal,
  checkpoints,
  entities,
});
